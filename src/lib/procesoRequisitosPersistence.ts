/**
 * Resilient persistence helpers for `requisitos_por_proceso` (`INSERT` / `UPSERT` / `DELETE`).
 *
 * Handles live PostgreSQL / Supabase schema variations gracefully:
 * - Fast path uses `ON CONFLICT (id_proceso, id_certificado_version, id_requisito)`
 * - Falls back cleanly on `42P10` ("there is no unique or exclusion constraint matching
 *   the ON CONFLICT specification") or missing-column `42703` / `PGRST204` errors
 *   by querying existing rows and inserting only missing rows (with safe `23505`
 *   verification), while never swallowing domain/trigger errors (`P0001` ISO 4.3,
 *   norm mismatches, historical read-only locks) or RLS failures (`42501`).
 */

export interface ProcesoRequisitoDbRow {
  id_proceso: string;
  id_certificado: string;
  id_certificado_version?: string | null;
  id_requisito: string;
}

export interface ProcesoReqDbErrorLike {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

export interface ProcesoReqQueryChain {
  select: (cols: string) => ProcesoReqQueryChain;
  insert: (payload: unknown) => PromiseLike<{ error: ProcesoReqDbErrorLike | null }>;
  upsert: (
    payload: unknown,
    opts?: { onConflict?: string; ignoreDuplicates?: boolean }
  ) => PromiseLike<{ error: ProcesoReqDbErrorLike | null }>;
  delete: () => ProcesoReqQueryChain;
  eq: (col: string, val: unknown) => ProcesoReqQueryChain;
  in: (col: string, vals: ReadonlyArray<unknown>) => ProcesoReqQueryChain;
  is: (col: string, val: unknown) => ProcesoReqQueryChain;
  or: (expr: string) => ProcesoReqQueryChain;
  match: (criteria: Record<string, unknown>) => PromiseLike<{ error: ProcesoReqDbErrorLike | null }>;
  then: PromiseLike<{ data?: unknown; error: ProcesoReqDbErrorLike | null }>['then'];
}

export interface ProcesoReqSupabaseLike {
  from: (table: string) => unknown;
}

export const REQUISITOS_POR_PROCESO_ON_CONFLICT =
  'id_proceso,id_certificado_version,id_requisito';

export function isOnConflictSpecError(err: ProcesoReqDbErrorLike | null | undefined): boolean {
  if (!err) return false;
  const code = String(err.code || '').trim().toUpperCase();
  const msg = String(err.message || '').toLowerCase();
  return (
    code === '42P10' ||
    msg.includes('no unique or exclusion constraint matching the on conflict specification') ||
    msg.includes('there is no unique or exclusion constraint matching the on conflict') ||
    (msg.includes('on conflict') && msg.includes('constraint'))
  );
}

export function isMissingColumnSchemaError(
  err: ProcesoReqDbErrorLike | null | undefined,
  columnName?: string
): boolean {
  if (!err) return false;
  const code = String(err.code || '').trim().toUpperCase();
  const msg = String(err.message || '').toLowerCase();
  const details = String(err.details || '').toLowerCase();
  const combined = `${msg} ${details}`;
  const isSchemaMissing =
    code === '42703' ||
    code === 'PGRST204' ||
    combined.includes('could not find the') ||
    combined.includes('schema cache') ||
    (combined.includes('column') && combined.includes('does not exist'));
  if (!isSchemaMissing) return false;
  if (!columnName) return true;
  const escaped = columnName.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z0-9_])${escaped}(?:$|[^a-z0-9_])`).test(combined);
}

export function isDuplicateKeyDbError(err: ProcesoReqDbErrorLike | null | undefined): boolean {
  if (!err) return false;
  const code = String(err.code || '').trim().toUpperCase();
  const msg = String(err.message || '').toLowerCase();
  return (
    code === '23505' ||
    msg.includes('duplicate key value violates unique constraint')
  );
}

function normalizeRows(
  rows: ReadonlyArray<ProcesoRequisitoDbRow>
): Array<{
  id_proceso: string;
  id_certificado: string;
  id_certificado_version?: string;
  id_requisito: string;
}> {
  const seen = new Set<string>();
  const normalized: Array<{
    id_proceso: string;
    id_certificado: string;
    id_certificado_version?: string;
    id_requisito: string;
  }> = [];

  for (const row of rows) {
    const id_proceso = String(row.id_proceso || '').trim();
    const id_certificado = String(row.id_certificado || '').trim();
    const id_requisito = String(row.id_requisito || '').trim();
    const rawVer =
      row.id_certificado_version !== null && row.id_certificado_version !== undefined
        ? String(row.id_certificado_version).trim()
        : '';
    if (!id_proceso || !id_certificado || !id_requisito) continue;
    const key = `${id_proceso}::${id_certificado}::${rawVer}::${id_requisito}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({
      id_proceso,
      id_certificado,
      ...(rawVer ? { id_certificado_version: rawVer } : {}),
      id_requisito,
    });
  }

  return normalized;
}

function buildRowPayload(
  row: {
    id_proceso: string;
    id_certificado: string;
    id_certificado_version?: string;
    id_requisito: string;
  },
  includeCertCol: boolean,
  includeVersionCol: boolean
): Record<string, string> {
  const payload: Record<string, string> = {
    id_proceso: row.id_proceso,
    id_requisito: row.id_requisito,
  };
  if (includeCertCol) {
    payload.id_certificado = row.id_certificado;
  }
  if (includeVersionCol && row.id_certificado_version) {
    payload.id_certificado_version = row.id_certificado_version;
  }
  return payload;
}

async function fetchExistingRowsForProcess(
  table: ProcesoReqQueryChain,
  procId: string,
  reqIds: ReadonlyArray<string>,
  tryVersionCol: boolean,
  tryCertCol: boolean
): Promise<{
  rows: Array<Record<string, unknown>>;
  hasCertCol: boolean;
  hasVersionCol: boolean;
  error: ProcesoReqDbErrorLike | null;
}> {
  const runSelect = async (
    withCert: boolean,
    withVersion: boolean
  ): Promise<{
    data: Array<Record<string, unknown>> | null;
    error: ProcesoReqDbErrorLike | null;
  }> => {
    const cols = ['id_proceso', 'id_requisito'];
    if (withCert) cols.push('id_certificado');
    if (withVersion) cols.push('id_certificado_version');

    const chain = table.select(cols.join(', '));
    const eqChain = typeof chain.eq === 'function' ? chain.eq('id_proceso', procId) : chain;
    const inChain =
      typeof eqChain.in === 'function' && reqIds.length > 0
        ? eqChain.in('id_requisito', reqIds)
        : eqChain;
    const res = await inChain;
    return {
      data: Array.isArray(res?.data) ? (res.data as Array<Record<string, unknown>>) : null,
      error: res?.error ?? null,
    };
  };

  let withCert = tryCertCol;
  let withVersion = tryVersionCol;

  let res = await runSelect(withCert, withVersion);
  if (res.error && withVersion && isMissingColumnSchemaError(res.error, 'id_certificado_version')) {
    withVersion = false;
    res = await runSelect(withCert, withVersion);
  }
  if (res.error && withCert && isMissingColumnSchemaError(res.error, 'id_certificado')) {
    withCert = false;
    res = await runSelect(withCert, withVersion);
  }
  if (res.error && isMissingColumnSchemaError(res.error)) {
    withVersion = false;
    res = await runSelect(withCert, false);
  }

  return {
    rows: res.data || [],
    hasCertCol: withCert,
    hasVersionCol: withVersion,
    error: res.error,
  };
}

function rowMatchesExisting(
  candidate: {
    id_proceso: string;
    id_certificado: string;
    id_certificado_version?: string;
    id_requisito: string;
  },
  existingRows: ReadonlyArray<Record<string, unknown>>,
  hasCertCol: boolean,
  hasVersionCol: boolean
): boolean {
  return existingRows.some((ex) => {
    if (String(ex.id_proceso || '').trim() !== candidate.id_proceso) return false;
    if (String(ex.id_requisito || '').trim() !== candidate.id_requisito) return false;

    if (hasCertCol) {
      const exCertId = String(ex.id_certificado || '').trim();
      if (exCertId && exCertId !== candidate.id_certificado) {
        return false;
      }
    }

    if (hasVersionCol && candidate.id_certificado_version) {
      const exVerId = String(ex.id_certificado_version || '').trim();
      if (exVerId && exVerId !== candidate.id_certificado_version) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Inserts / upserts `requisitos_por_proceso` links resiliently across migrated and
 * unmigrated PostgreSQL / Supabase schemas.
 */
export async function persistRequisitosPorProcesoInsert(
  supabase: ProcesoReqSupabaseLike,
  rawRows: ReadonlyArray<ProcesoRequisitoDbRow>,
  onConflictKey: string = REQUISITOS_POR_PROCESO_ON_CONFLICT
): Promise<{ error: ProcesoReqDbErrorLike | null; insertedCount: number }> {
  const rows = normalizeRows(rawRows);
  if (rows.length === 0) {
    return { error: null, insertedCount: 0 };
  }

  const table = supabase.from('requisitos_por_proceso') as ProcesoReqQueryChain;
  const allHaveVersion = rows.every((r) => Boolean(r.id_certificado_version));

  let fastPathError: ProcesoReqDbErrorLike | null = null;
  if (typeof table.upsert === 'function') {
    const upsertRes = await table.upsert(rows, {
      onConflict: onConflictKey,
      ignoreDuplicates: true,
    });
    if (!upsertRes.error) {
      return { error: null, insertedCount: rows.length };
    }
    fastPathError = upsertRes.error;
    const isNullVersionFallback =
      !allHaveVersion &&
      String(fastPathError.code || '').trim().toUpperCase() === '23502';
    if (
      !isOnConflictSpecError(fastPathError) &&
      !isMissingColumnSchemaError(fastPathError) &&
      !isNullVersionFallback
    ) {
      return { error: fastPathError, insertedCount: 0 };
    }
  }

  let includeVersionCol = !(
    fastPathError && isMissingColumnSchemaError(fastPathError, 'id_certificado_version')
  );
  let includeCertCol = !(
    fastPathError && isMissingColumnSchemaError(fastPathError, 'id_certificado')
  );

  // Group by process to check pre-existing links and avoid duplicate-key collisions
  const byProc = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byProc.get(row.id_proceso) || [];
    list.push(row);
    byProc.set(row.id_proceso, list);
  }

  const missingRows: typeof rows = [];
  for (const [procId, procRows] of byProc.entries()) {
    const reqIds = Array.from(new Set(procRows.map((r) => r.id_requisito)));
    const existingLookup = await fetchExistingRowsForProcess(
      table,
      procId,
      reqIds,
      includeVersionCol,
      includeCertCol
    );
    includeCertCol = includeCertCol && existingLookup.hasCertCol;
    includeVersionCol = includeVersionCol && existingLookup.hasVersionCol;

    for (const row of procRows) {
      const alreadyPresent =
        !existingLookup.error &&
        rowMatchesExisting(row, existingLookup.rows, includeCertCol, includeVersionCol);
      if (!alreadyPresent) {
        missingRows.push(row);
      }
    }
  }

  if (missingRows.length === 0) {
    return { error: null, insertedCount: 0 };
  }

  const tryInsert = async (
    targetRows: typeof rows,
    withCert: boolean,
    withVersion: boolean
  ): Promise<{ error: ProcesoReqDbErrorLike | null }> => {
    const payloads = targetRows.map((r) => buildRowPayload(r, withCert, withVersion));
    return table.insert(payloads.length === 1 ? payloads[0] : payloads);
  };

  let insertRes = await tryInsert(missingRows, includeCertCol, includeVersionCol);
  if (
    insertRes.error &&
    includeVersionCol &&
    isMissingColumnSchemaError(insertRes.error, 'id_certificado_version')
  ) {
    includeVersionCol = false;
    insertRes = await tryInsert(missingRows, includeCertCol, false);
  }
  if (
    insertRes.error &&
    includeCertCol &&
    isMissingColumnSchemaError(insertRes.error, 'id_certificado')
  ) {
    includeCertCol = false;
    insertRes = await tryInsert(missingRows, false, includeVersionCol);
  }

  if (!insertRes.error) {
    return { error: null, insertedCount: missingRows.length };
  }

  // Handle batch 23505 (e.g. concurrent insert or unmigrated 2-column PK across certs)
  if (isDuplicateKeyDbError(insertRes.error)) {
    let singleInserted = 0;
    for (const singleRow of missingRows) {
      const singleRes = await table.insert(
        buildRowPayload(singleRow, includeCertCol, includeVersionCol)
      );
      if (!singleRes.error) {
        singleInserted += 1;
        continue;
      }
      if (!isDuplicateKeyDbError(singleRes.error)) {
        return { error: singleRes.error, insertedCount: singleInserted };
      }

      const verifyRes = await fetchExistingRowsForProcess(
        table,
        singleRow.id_proceso,
        [singleRow.id_requisito],
        includeVersionCol,
        includeCertCol
      );
      const belongsToSameCert =
        !verifyRes.error &&
        rowMatchesExisting(
          singleRow,
          verifyRes.rows,
          verifyRes.hasCertCol,
          verifyRes.hasVersionCol
        );
      if (belongsToSameCert) {
        continue;
      }
      if (verifyRes.hasCertCol && verifyRes.rows.length > 0) {
        return {
          error: {
            code: '23505',
            message:
              'La base de datos activa mantiene una clave primaria heredada sin separación por certificado en requisitos_por_proceso; ejecuta la migración de 01_creacion.sql para aislar cláusulas por certificado en procesos compartidos.',
          },
          insertedCount: singleInserted,
        };
      }
    }
    return { error: null, insertedCount: singleInserted };
  }

  return { error: insertRes.error, insertedCount: 0 };
}

/**
 * Deletes `requisitos_por_proceso` links resiliently across migrated (versioned),
 * nullable-versioned legacy rows, and unmigrated schemas.
 */
export async function persistRequisitosPorProcesoDelete(
  supabase: ProcesoReqSupabaseLike,
  params: {
    id_proceso: string;
    id_certificado: string;
    id_certificado_version?: string | null;
    requisitoIds: ReadonlyArray<string>;
  }
): Promise<{ error: ProcesoReqDbErrorLike | null }> {
  const procId = String(params.id_proceso || '').trim();
  const certId = String(params.id_certificado || '').trim();
  const certVerId =
    params.id_certificado_version !== null && params.id_certificado_version !== undefined
      ? String(params.id_certificado_version).trim()
      : '';
  const reqIds = Array.from(
    new Set(params.requisitoIds.map((id) => String(id || '').trim()).filter(Boolean))
  );

  if (!procId || !certId || reqIds.length === 0) {
    return { error: null };
  }

  const table = supabase.from('requisitos_por_proceso') as ProcesoReqQueryChain;
  if (typeof table.delete !== 'function') {
    return { error: null };
  }

  const execDelete = async (opts: {
    withCert: boolean;
    withVersionValue: string | null;
    withNullVersionOnly?: boolean;
  }): Promise<{ error: ProcesoReqDbErrorLike | null }> => {
    // Prefer single-req `.match(...)` when `.eq` isn't available or single-row compatible with mocks
    if (
      reqIds.length === 1 &&
      !opts.withNullVersionOnly &&
      typeof table.match === 'function' &&
      typeof table.eq !== 'function'
    ) {
      const del = table.delete();
      return del.match({
        id_proceso: procId,
        ...(opts.withCert ? { id_certificado: certId } : {}),
        ...(opts.withVersionValue ? { id_certificado_version: opts.withVersionValue } : {}),
        id_requisito: reqIds[0],
      });
    }

    let chain = table.delete().eq('id_proceso', procId);
    if (opts.withCert) {
      chain = chain.eq('id_certificado', certId);
    }
    if (opts.withNullVersionOnly && typeof chain.is === 'function') {
      chain = chain.is('id_certificado_version', null);
    } else if (opts.withVersionValue) {
      chain = chain.eq('id_certificado_version', opts.withVersionValue);
    }

    if (reqIds.length === 1) {
      const res = await chain.eq('id_requisito', reqIds[0]);
      return { error: res?.error ?? null };
    }

    if (typeof chain.in === 'function') {
      const res = await chain.in('id_requisito', reqIds);
      return { error: res?.error ?? null };
    }

    for (const reqId of reqIds) {
      let singleChain = table.delete().eq('id_proceso', procId);
      if (opts.withCert) {
        singleChain = singleChain.eq('id_certificado', certId);
      }
      if (opts.withNullVersionOnly && typeof singleChain.is === 'function') {
        singleChain = singleChain.is('id_certificado_version', null);
      } else if (opts.withVersionValue) {
        singleChain = singleChain.eq('id_certificado_version', opts.withVersionValue);
      }
      const singleRes = await singleChain.eq('id_requisito', reqId);
      if (singleRes?.error) return { error: singleRes.error };
    }
    return { error: null };
  };

  let withCert = true;
  let withVersionValue: string | null = certVerId || null;

  let res = await execDelete({ withCert, withVersionValue });
  if (
    res.error &&
    withVersionValue &&
    isMissingColumnSchemaError(res.error, 'id_certificado_version')
  ) {
    withVersionValue = null;
    res = await execDelete({ withCert, withVersionValue: null });
  }
  if (res.error && withCert && isMissingColumnSchemaError(res.error, 'id_certificado')) {
    withCert = false;
    res = await execDelete({ withCert: false, withVersionValue });
  }

  if (res.error) {
    return { error: res.error };
  }

  // Also clean up any legacy pre-migration rows with NULL `id_certificado_version` on this cert
  if (withVersionValue) {
    const nullVerRes = await execDelete({
      withCert,
      withVersionValue: null,
      withNullVersionOnly: true,
    });
    if (
      nullVerRes.error &&
      !isMissingColumnSchemaError(nullVerRes.error, 'id_certificado_version')
    ) {
      return { error: null };
    }
  }

  return { error: null };
}
