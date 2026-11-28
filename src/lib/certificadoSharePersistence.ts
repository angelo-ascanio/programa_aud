/**
 * Step 2.4 — Transactional Supabase Persistence & Hydration Assembly for Shared Child Records
 *
 * Covers:
 * - `contacto_certificado_compartido`
 * - `turno_certificado_compartido` (+ optional `turnos_por_sitio`)
 * - `proceso_certificado_compartido` + `requisitos_por_proceso` (scoped by `id_certificado`, with compensating rollback)
 * - `sitio_certificado_compartido` + cascade (`proceso` -> `sitio` -> `turno` -> `procesos_por_sitio`)
 * - `persistUnlinkSharedChild` (dependency guard + `archive_record` RPC)
 * - `translateShareDbError` (Zero-UUID Spanish PostgreSQL error translator)
 * - `assembleSharedCertificateCollections` (strict per-certificate hydration isolation)
 *
 * Strictly typed (`strict: true`, 0 `any` / `as any`) and Zero-UUID compliant.
 */

import { assertValidUuid, containsRawUuid, isValidUuid } from './zeroUuid';
import type { RequisitoLtree } from './extraDomain';
import type {
  CertificateShareLinkRef,
  ContactoCertificadoEntity,
  EmailContactoEntity,
  ProcessCertificateClausesEntry,
  ProcessEntity,
  ProcessRequirementMapping,
  ProcesoPorSitioLink,
  ProcesoTipo,
  ShiftEntity,
  SiteEntity,
  TelefonoContactoEntity,
  TurnoPorSitioLink,
} from './multisiteSampling';
import type { TurnoCatalogItem } from './sitioDomain';
import type {
  ContactoShareLinkDraft,
  TurnoCertLinkDraft,
  TurnoPorSitioDraft,
} from './certificadoShareDomain';
import type {
  ProcesoPorSitioCascadeDraft,
  SitioCertLinkDraft,
} from './sitioShareDomain';
import { validateAlcanceDraft } from './alcanceDomain';
import {
  isOnConflictSpecError,
  persistRequisitosPorProcesoDelete,
  persistRequisitosPorProcesoInsert,
  type ProcesoReqSupabaseLike,
} from './procesoRequisitosPersistence';

// =============================================================================
// Strictly Typed Structural Supabase Client Interface (0 `any`)
// =============================================================================

export interface ShareDbErrorLike {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

export interface ShareQueryResponse<T = Array<Record<string, unknown>>> {
  data: T | null;
  error: ShareDbErrorLike | null;
}

export interface ShareSingleResponse {
  data: Record<string, unknown> | null;
  error: ShareDbErrorLike | null;
}

export interface ShareMutationBuilder {
  single(): PromiseLike<ShareSingleResponse>;
  maybeSingle(): PromiseLike<ShareSingleResponse>;
  then<TResult1 = ShareQueryResponse, TResult2 = never>(
    onfulfilled?:
      | ((value: ShareQueryResponse) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2>;
}

export interface ShareSelectBuilder extends ShareMutationBuilder {
  eq(column: string, value: string): ShareSelectBuilder;
  is(column: string, value: null): ShareSelectBuilder;
  order(column: string, options?: { ascending?: boolean }): ShareSelectBuilder;
  limit(count: number): ShareSelectBuilder;
}

export interface ShareInsertBuilder {
  select(columns?: string): ShareMutationBuilder;
  then<TResult1 = ShareQueryResponse, TResult2 = never>(
    onfulfilled?:
      | ((value: ShareQueryResponse) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2>;
}

export interface ShareUpdateBuilder {
  eq(column: string, value: string): ShareUpdateBuilder;
  select(columns?: string): ShareMutationBuilder;
  then<TResult1 = ShareQueryResponse, TResult2 = never>(
    onfulfilled?:
      | ((value: ShareQueryResponse) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2>;
}

export interface ShareDeleteBuilder {
  eq(column: string, value: string): ShareDeleteBuilder;
  in?(column: string, values: ReadonlyArray<string>): ShareDeleteBuilder;
  then<TResult1 = ShareQueryResponse, TResult2 = never>(
    onfulfilled?:
      | ((value: ShareQueryResponse) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2>;
}

export interface ShareTableClient {
  select(columns: string): ShareSelectBuilder;
  insert(
    values: Record<string, unknown> | ReadonlyArray<Record<string, unknown>>
  ): ShareInsertBuilder;
  upsert(
    values: Record<string, unknown> | ReadonlyArray<Record<string, unknown>>,
    options?: { onConflict?: string; ignoreDuplicates?: boolean }
  ): PromiseLike<{ data: unknown; error: ShareDbErrorLike | null }>;
  update(values: Record<string, unknown>): ShareUpdateBuilder;
  delete?(): ShareDeleteBuilder;
}

export interface ShareSupabaseClient {
  from(table: string): ShareTableClient;
  rpc(
    fn: string,
    params?: Record<string, unknown>
  ): PromiseLike<{ data: unknown; error: ShareDbErrorLike | null }>;
}

// =============================================================================
// Public Persistence Types
// =============================================================================

export type ShareableBridgeTable =
  | 'contacto_certificado_compartido'
  | 'turno_certificado_compartido'
  | 'proceso_certificado_compartido'
  | 'sitio_certificado_compartido';

export interface SharePersistenceResult<T = undefined> {
  ok: boolean;
  data?: T;
  error?: string;
  rolledBackLinkIds?: string[];
}

export interface ShareContactoInput {
  id_contacto: string;
  id_certificado: string;
  id_certificado_version?: string | null;
}

export interface PersistShareContactosParams {
  links: ReadonlyArray<ContactoShareLinkDraft | ShareContactoInput>;
}

export interface ShareTurnoCertInput {
  id_turno: string;
  id_certificado: string;
  id_certificado_version?: string | null;
  id_certificado_origen?: string | null;
}

export interface ShareTurnoSitioInput {
  id_sitio: string;
  id_turno: string;
  id_certificado_version?: string | null;
}

export interface PersistShareTurnosParams {
  certLinks: ReadonlyArray<TurnoCertLinkDraft | ShareTurnoCertInput>;
  siteLinks?: ReadonlyArray<TurnoPorSitioDraft | ShareTurnoSitioInput>;
}

export interface ShareProcesoTargetPayload {
  id_proceso: string;
  id_certificado: string;
  id_certificado_version?: string | null;
  requisitoIds: ReadonlyArray<string>;
  sincronizar_requisitos?: boolean;
}

export interface SyncProcesoTargetWritePayload {
  id_certificado_destino: string;
  id_certificado_version?: string | null;
  requisitoIdsToInsert?: ReadonlyArray<string>;
  requisitoIdsToRemove?: ReadonlyArray<string>;
  enableSync?: boolean;
  skippedExcludedCount?: number;
}

export interface PersistSyncProcesoRequisitosParams {
  id_proceso: string;
  id_certificado_origen: string;
  id_certificado_destino?: string | null;
  enableSync?: boolean;
  mirrorMode?: boolean;
  preferRpc?: boolean;
  targets?: ReadonlyArray<SyncProcesoTargetWritePayload>;
}

export interface SyncProcesoRequisitosResultData {
  syncedCertsCount: number;
  insertedCount: number;
  deletedCount: number;
  skippedExcludedCount: number;
  usedRpc: boolean;
}

export interface PersistShareProcesosParams {
  links: ReadonlyArray<ShareProcesoTargetPayload>;
}

export interface ShareSitioCertInput {
  id_sitio: string;
  id_certificado: string;
  id_certificado_version?: string | null;
  numero_sitio: number;
}

export interface ShareProcesoPorSitioInput {
  id_certificado: string;
  id_certificado_version?: string | null;
  id_sitio: string;
  id_proceso: string;
}

export interface PersistShareSitiosParams {
  sitioLinks: ReadonlyArray<SitioCertLinkDraft | ShareSitioCertInput>;
  turnoCertLinks?: ReadonlyArray<TurnoCertLinkDraft | ShareTurnoCertInput>;
  procesoShares?: ReadonlyArray<ShareProcesoTargetPayload>;
  procesosPorSitio?: ReadonlyArray<
    ProcesoPorSitioCascadeDraft | ShareProcesoPorSitioInput
  >;
}

export interface PersistSaveOwnAlcanceParams {
  certId: string;
  alcance_es: string;
  alcance_en?: string | null;
  existingAlcanceId?: string | null;
}

export interface SaveOwnAlcanceResultData {
  id: string;
  id_certificado: string;
  alcance_es: string;
  alcance_en: string | null;
  action: 'inserted' | 'updated';
  archivedShareLinkIds: string[];
}

export interface PersistShareAlcanceParams {
  id_alcance: string;
  targetCertIds: ReadonlyArray<string>;
  replaceExisting: boolean;
  preferRpc?: boolean;
}

export interface ShareAlcanceResultData {
  linkedCount: number;
  replacedCount: number;
  skippedCount: number;
  usedRpc: boolean;
  createdLinkIds?: string[];
}

// =============================================================================
// Zero-UUID Error Sanitization & PostgreSQL Error Translation
// =============================================================================

const UUID_INLINE_REGEX =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

function scrubRawUuids(text: string): string {
  return text
    .replace(UUID_INLINE_REGEX, 'referencia interna')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractDbErrorParts(err: unknown): {
  code: string;
  message: string;
  details: string;
  hint: string;
} {
  if (typeof err === 'string') {
    return { code: '', message: err, details: '', hint: '' };
  }
  if (err instanceof Error) {
    return { code: '', message: err.message, details: '', hint: '' };
  }
  if (typeof err === 'object' && err !== null) {
    const rec = err as Record<string, unknown>;
    return {
      code: typeof rec.code === 'string' ? rec.code.trim() : '',
      message: typeof rec.message === 'string' ? rec.message.trim() : '',
      details: typeof rec.details === 'string' ? rec.details.trim() : '',
      hint: typeof rec.hint === 'string' ? rec.hint.trim() : '',
    };
  }
  return { code: '', message: '', details: '', hint: '' };
}

/**
 * Translates PostgreSQL / Supabase errors raised during shared-record mutations
 * into deterministic Spanish messages strictly free of raw UUIDs.
 */
export function translateShareDbError(err: unknown): string {
  const { code, message, details, hint } = extractDbErrorParts(err);
  const combined = `${message} ${details} ${hint}`.trim();
  const lower = combined.toLowerCase();

  // 1. ISO 4.3 Non-Applicable Exclusion Guard
  if (
    message.includes('REQ_EXCLUDED_BY_ISO43') ||
    (code === 'P0001' && lower.includes('no aplicable'))
  ) {
    const cleaned = scrubRawUuids(
      message.replace(/^REQ_EXCLUDED_BY_ISO43:\s*/i, '')
    );
    return (
      cleaned ||
      'No se puede vincular la cláusula al proceso porque está excluida como No Aplicable (ISO 4.3) en el certificado destino.'
    );
  }

  // 2. RLS / Permission Violations (42501)
  if (
    code === '42501' ||
    lower.includes('row-level security') ||
    lower.includes('permission denied') ||
    lower.includes('acceso denegado')
  ) {
    return 'Permisos insuficientes (RLS): solo personal ADMIN o WORKER aprobado puede gestionar registros compartidos del conglomerado.';
  }

  // 2b. Alcance Conflict (P0001 CONFLICTO_ALCANCE_EXISTENTE / Conflicto de Alcance)
  if (
    message.includes('CONFLICTO_ALCANCE_EXISTENTE') ||
    lower.includes('conflicto de alcance')
  ) {
    const cleaned = scrubRawUuids(
      message.replace(/^CONFLICTO_ALCANCE_EXISTENTE:\s*/i, '')
    );
    return (
      cleaned ||
      'El certificado destino ya posee un Alcance registrado. Confirme el reemplazo para continuar.'
    );
  }

  // 3. Conglomerate Cross-Boundary & Business Triggers (P0001)
  if (lower.includes('violación de conglomerado') || lower.includes('mismo conglomerado')) {
    const cleaned = scrubRawUuids(message);
    return (
      cleaned ||
      'Solo se permite compartir registros entre certificados pertenecientes al mismo conglomerado empresarial activo.'
    );
  }

  if (lower.includes('conflicto de contacto')) {
    const cleaned = scrubRawUuids(message);
    return (
      cleaned ||
      'Ya existe un contacto activo con el mismo nombre en el certificado destino.'
    );
  }

  if (lower.includes('conflicto de proceso')) {
    const cleaned = scrubRawUuids(message);
    return (
      cleaned ||
      'Ya existe un proceso activo con el mismo nombre en el certificado destino.'
    );
  }

  if (lower.includes('conflicto de sitio')) {
    const cleaned = scrubRawUuids(message);
    return (
      cleaned ||
      'El número de sitio operativo indicado ya está ocupado por otro sitio activo (propio o compartido) en el certificado destino.'
    );
  }

  if (
    lower.includes('operación bloqueada') ||
    lower.includes('violación de integridad') ||
    lower.includes('violación iso/iec 17021-1')
  ) {
    const cleaned = scrubRawUuids(message);
    if (cleaned && !containsRawUuid(cleaned)) {
      return cleaned;
    }
    return 'La operación de compartición incumple una regla de integridad del certificado o conglomerado.';
  }

  // 4. Unique Violations (23505) across shared bridge tables and matrices
  if (code === '23505' || lower.includes('duplicate key value')) {
    if (
      lower.includes('alcance_cert_compartido') ||
      lower.includes('alcance_certificado_compartido')
    ) {
      return 'El certificado destino ya utiliza un Alcance compartido activo.';
    }
    if (lower.includes('uq_alcance') || lower.includes('public.alcance') || lower.includes('table "alcance"')) {
      return 'Este certificado ya posee un Alcance propio activo registrado.';
    }
    if (lower.includes('contacto_cert_compartido') || lower.includes('contacto_certificado_compartido')) {
      return 'Este contacto ya se encuentra compartido activamente con el certificado destino.';
    }
    if (lower.includes('turno_cert_compartido') || lower.includes('turno_certificado_compartido')) {
      return 'Este turno operativo ya se encuentra compartido activamente con el certificado destino.';
    }
    if (lower.includes('turnos_por_sitio')) {
      return 'Este turno ya está asignado a la sede seleccionada.';
    }
    if (lower.includes('proceso_cert_compartido') || lower.includes('proceso_certificado_compartido')) {
      return 'Este proceso ya se encuentra compartido activamente con el certificado destino.';
    }
    if (lower.includes('uq_sitio_cert_compartido_num_active') || lower.includes('numero_sitio')) {
      return 'Conflicto de número de sitio: el número operativo ya está asignado a otra sede en el certificado destino.';
    }
    if (lower.includes('sitio_cert_compartido') || lower.includes('sitio_certificado_compartido')) {
      return 'Esta sede ya se encuentra compartida activamente con el certificado destino.';
    }
    if (lower.includes('procesos_por_sitio')) {
      return 'El proceso ya está vinculado a la sede dentro del certificado destino.';
    }
    if (lower.includes('requisitos_por_proceso')) {
      return 'Una o más cláusulas ya estaban vinculadas a este proceso en el certificado destino.';
    }
    return 'Ya existe un registro compartido activo duplicado en el certificado destino.';
  }

  // 5. Foreign Key / Dependency Blocks (23503 / sitios_por_auditoria / alcance)
  if (
    code === '23503' ||
    lower.includes('sitios_por_auditoria') ||
    lower.includes('procesos_sitio_auditoria') ||
    lower.includes('foreign key constraint') ||
    lower.includes('dependencia')
  ) {
    if (lower.includes('alcance_certificado_compartido')) {
      return 'No es posible archivar este Alcance porque otros certificados del conglomerado lo están reutilizando activamente.';
    }
    if (lower.includes('sitios_por_auditoria') || lower.includes('auditoria')) {
      return 'No es posible desvincular el sitio compartido porque participa en auditorías activas del certificado destino.';
    }
    return 'La operación no puede completarse porque existen registros dependientes activos.';
  }

  // 6. Generic P0001 or safe fallback
  if (code === 'P0001' && message) {
    const cleaned = scrubRawUuids(message);
    if (cleaned) return cleaned;
  }

  if (message) {
    const cleaned = scrubRawUuids(message);
    if (cleaned) return cleaned;
  }

  return 'No se pudo completar la operación de compartición en la base de datos.';
}

// =============================================================================
// Internal Soft-Delete Aware Bridge Upsert / Reactivation & Rollback
// =============================================================================

interface CreatedBridgeRecord {
  table: string;
  id: string;
}

interface UpsertBridgeResult {
  ok: boolean;
  id?: string;
  action?: 'inserted' | 'restored' | 'existing';
  error?: string;
}

async function upsertOrReactivateBridgeRow(params: {
  supabase: ShareSupabaseClient;
  table: string;
  matchColumns: ReadonlyArray<{ column: string; value: string }>;
  insertPayload: Record<string, unknown>;
  restorePayload?: Record<string, unknown>;
}): Promise<UpsertBridgeResult> {
  const { supabase, table, matchColumns, insertPayload, restorePayload = {} } = params;

  let query = supabase
    .from(table)
    .select('id, deleted_at')
    .order('created_at', { ascending: false })
    .limit(1);

  for (const cond of matchColumns) {
    query = query.eq(cond.column, cond.value);
  }

  const { data: existingRows, error: lookupError } = await query;

  if (!lookupError && Array.isArray(existingRows) && existingRows.length > 0) {
    const row = existingRows[0];
    const existingId = typeof row.id === 'string' ? row.id.trim() : '';
    const deletedAt = row.deleted_at;

    if (isValidUuid(existingId)) {
      if (deletedAt === null || deletedAt === undefined) {
        return { ok: true, id: existingId, action: 'existing' };
      }

      const { data: restoredRow, error: restoreError } = await supabase
        .from(table)
        .update({
          deleted_at: null,
          deleted_by: null,
          ...restorePayload,
        })
        .eq('id', existingId)
        .select('id')
        .single();

      if (!restoreError && restoredRow && typeof restoredRow.id === 'string') {
        return { ok: true, id: restoredRow.id.trim(), action: 'restored' };
      }
      if (restoreError) {
        const lowerMsg = String(restoreError.message || '').toLowerCase();
        // If worker RLS blocks updating a previously archived row, fall through to fresh INSERT
        if (
          restoreError.code !== '42501' &&
          !lowerMsg.includes('row-level security') &&
          !lowerMsg.includes('0 rows')
        ) {
          return { ok: false, error: translateShareDbError(restoreError) };
        }
      }
    }
  } else if (lookupError) {
    return { ok: false, error: translateShareDbError(lookupError) };
  }

  const newId = crypto.randomUUID();
  const { data: insertedRow, error: insertError } = await supabase
    .from(table)
    .insert({
      id: newId,
      ...insertPayload,
    })
    .select('id')
    .single();

  if (insertError) {
    return { ok: false, error: translateShareDbError(insertError) };
  }

  const resolvedId =
    insertedRow && typeof insertedRow.id === 'string' && isValidUuid(insertedRow.id)
      ? insertedRow.id.trim()
      : newId;

  return { ok: true, id: resolvedId, action: 'inserted' };
}

async function rollbackNewlyCreatedBridgeLinks(
  supabase: ShareSupabaseClient,
  createdRecords: ReadonlyArray<CreatedBridgeRecord>,
  reason: string
): Promise<string[]> {
  const rolledBack: string[] = [];
  for (let i = createdRecords.length - 1; i >= 0; i -= 1) {
    const rec = createdRecords[i];
    if (!isValidUuid(rec.id)) continue;
    try {
      const { error } = await supabase.rpc('archive_record', {
        p_table: rec.table,
        p_record_id: rec.id,
        p_reason: reason,
      });
      if (!error) {
        rolledBack.push(rec.id);
      }
    } catch {
      // Best-effort compensating rollback
    }
  }
  return rolledBack;
}

// =============================================================================
// 1. Transactional Persistence Operations
// =============================================================================

export async function persistShareContactos(
  supabase: ShareSupabaseClient,
  params: PersistShareContactosParams
): Promise<
  SharePersistenceResult<{
    linkIds: string[];
    createdCount: number;
    restoredCount: number;
  }>
> {
  if (!params.links || params.links.length === 0) {
    return {
      ok: false,
      error: 'Debe seleccionar al menos un contacto y un certificado destino para compartir.',
    };
  }

  const validatedLinks = params.links.map((item) => {
    const rawVer =
      'id_certificado_version' in item ? item.id_certificado_version : null;
    return {
      id_contacto: assertValidUuid(item.id_contacto, 'contacto'),
      id_certificado: assertValidUuid(item.id_certificado, 'certificado destino'),
      id_certificado_version:
        rawVer && rawVer.trim() !== ''
          ? assertValidUuid(rawVer, 'versión de certificado')
          : null,
    };
  });

  const linkIds: string[] = [];
  const createdRecords: CreatedBridgeRecord[] = [];
  let createdCount = 0;
  let restoredCount = 0;

  for (const link of validatedLinks) {
    const matchColumns = [
      { column: 'id_contacto', value: link.id_contacto },
      { column: 'id_certificado', value: link.id_certificado },
      ...(link.id_certificado_version
        ? [{ column: 'id_certificado_version', value: link.id_certificado_version }]
        : []),
    ];
    const res = await upsertOrReactivateBridgeRow({
      supabase,
      table: 'contacto_certificado_compartido',
      matchColumns,
      insertPayload: {
        id_contacto: link.id_contacto,
        id_certificado: link.id_certificado,
        ...(link.id_certificado_version
          ? { id_certificado_version: link.id_certificado_version }
          : {}),
      },
    });

    if (!res.ok || !res.id) {
      const rolledBackLinkIds = await rollbackNewlyCreatedBridgeLinks(
        supabase,
        createdRecords,
        'Rollback compensatorio por fallo al compartir contactos'
      );
      return {
        ok: false,
        error: res.error || 'No se pudo compartir el contacto seleccionado.',
        rolledBackLinkIds,
      };
    }

    linkIds.push(res.id);
    if (res.action === 'inserted') {
      createdCount += 1;
      createdRecords.push({
        table: 'contacto_certificado_compartido',
        id: res.id,
      });
    } else if (res.action === 'restored') {
      restoredCount += 1;
    }
  }

  return {
    ok: true,
    data: { linkIds, createdCount, restoredCount },
  };
}

export async function persistShareTurnos(
  supabase: ShareSupabaseClient,
  params: PersistShareTurnosParams
): Promise<
  SharePersistenceResult<{
    certLinkIds: string[];
    siteLinkIds: string[];
    createdCount: number;
    restoredCount: number;
  }>
> {
  const certLinks = params.certLinks || [];
  const siteLinks = params.siteLinks || [];

  if (certLinks.length === 0 && siteLinks.length === 0) {
    return {
      ok: false,
      error: 'Debe seleccionar al menos un turno o vínculo de sede para compartir.',
    };
  }

  const validatedCertLinks = certLinks.map((item) => {
    const rawVer =
      'id_certificado_version' in item ? item.id_certificado_version : null;
    return {
      id_turno: assertValidUuid(item.id_turno, 'turno'),
      id_certificado: assertValidUuid(item.id_certificado, 'certificado destino'),
      id_certificado_version:
        rawVer && rawVer.trim() !== ''
          ? assertValidUuid(rawVer, 'versión de certificado')
          : null,
      id_certificado_origen:
        item.id_certificado_origen !== undefined && item.id_certificado_origen !== null && item.id_certificado_origen.trim() !== ''
          ? assertValidUuid(item.id_certificado_origen, 'certificado origen')
          : null,
    };
  });

  const validatedSiteLinks = siteLinks.map((item) => {
    const rawVer =
      'id_certificado_version' in item ? item.id_certificado_version : null;
    return {
      id_sitio: assertValidUuid(item.id_sitio, 'sitio'),
      id_turno: assertValidUuid(item.id_turno, 'turno'),
      id_certificado_version:
        rawVer && rawVer.trim() !== ''
          ? assertValidUuid(rawVer, 'versión de certificado')
          : null,
    };
  });

  const certLinkIds: string[] = [];
  const siteLinkIds: string[] = [];
  const createdRecords: CreatedBridgeRecord[] = [];
  let createdCount = 0;
  let restoredCount = 0;

  for (const link of validatedCertLinks) {
    const res = await upsertOrReactivateBridgeRow({
      supabase,
      table: 'turno_certificado_compartido',
      matchColumns: [
        { column: 'id_turno', value: link.id_turno },
        { column: 'id_certificado', value: link.id_certificado },
        ...(link.id_certificado_version
          ? [{ column: 'id_certificado_version', value: link.id_certificado_version }]
          : []),
      ],
      insertPayload: {
        id_turno: link.id_turno,
        id_certificado: link.id_certificado,
        ...(link.id_certificado_version
          ? { id_certificado_version: link.id_certificado_version }
          : {}),
        ...(link.id_certificado_origen
          ? { id_certificado_origen: link.id_certificado_origen }
          : {}),
      },
      restorePayload: link.id_certificado_origen
        ? { id_certificado_origen: link.id_certificado_origen }
        : {},
    });

    if (!res.ok || !res.id) {
      const rolledBackLinkIds = await rollbackNewlyCreatedBridgeLinks(
        supabase,
        createdRecords,
        'Rollback compensatorio por fallo al compartir turnos'
      );
      return {
        ok: false,
        error: res.error || 'No se pudo compartir el turno seleccionado.',
        rolledBackLinkIds,
      };
    }

    certLinkIds.push(res.id);
    if (res.action === 'inserted') {
      createdCount += 1;
      createdRecords.push({
        table: 'turno_certificado_compartido',
        id: res.id,
      });
    } else if (res.action === 'restored') {
      restoredCount += 1;
    }
  }

  for (const siteLink of validatedSiteLinks) {
    const res = await upsertOrReactivateBridgeRow({
      supabase,
      table: 'turnos_por_sitio',
      matchColumns: [
        { column: 'id_sitio', value: siteLink.id_sitio },
        { column: 'id_turno', value: siteLink.id_turno },
        ...(siteLink.id_certificado_version
          ? [{ column: 'id_certificado_version', value: siteLink.id_certificado_version }]
          : []),
      ],
      insertPayload: {
        id_sitio: siteLink.id_sitio,
        id_turno: siteLink.id_turno,
        ...(siteLink.id_certificado_version
          ? { id_certificado_version: siteLink.id_certificado_version }
          : {}),
      },
    });

    if (!res.ok || !res.id) {
      const rolledBackLinkIds = await rollbackNewlyCreatedBridgeLinks(
        supabase,
        createdRecords,
        'Rollback compensatorio por fallo al vincular turno en sede destino'
      );
      return {
        ok: false,
        error: res.error || 'No se pudo vincular el turno en la sede destino.',
        rolledBackLinkIds,
      };
    }

    siteLinkIds.push(res.id);
    if (res.action === 'inserted') {
      createdCount += 1;
      createdRecords.push({ table: 'turnos_por_sitio', id: res.id });
    } else if (res.action === 'restored') {
      restoredCount += 1;
    }
  }

  return {
    ok: true,
    data: { certLinkIds, siteLinkIds, createdCount, restoredCount },
  };
}

export async function persistShareProcesos(
  supabase: ShareSupabaseClient,
  params: PersistShareProcesosParams
): Promise<
  SharePersistenceResult<{
    linkIds: string[];
    createdCount: number;
    restoredCount: number;
    requisitoLinksUpserted: number;
  }>
> {
  if (!params.links || params.links.length === 0) {
    return {
      ok: false,
      error: 'Debe seleccionar al menos un proceso y certificado destino para compartir.',
    };
  }

  const validatedLinks = params.links.map((item) => {
    const id_proceso = assertValidUuid(item.id_proceso, 'proceso');
    const id_certificado = assertValidUuid(
      item.id_certificado,
      'certificado destino'
    );
    const seenReqs = new Set<string>();
    const requisitoIds: string[] = [];
    for (const reqId of item.requisitoIds || []) {
      const validReqId = assertValidUuid(reqId, 'requisito normativo');
      if (!seenReqs.has(validReqId)) {
        seenReqs.add(validReqId);
        requisitoIds.push(validReqId);
      }
    }
    const id_certificado_version =
      item.id_certificado_version && item.id_certificado_version.trim() !== ''
        ? assertValidUuid(item.id_certificado_version, 'versión de certificado')
        : null;
    const sincronizar_requisitos = Boolean(item.sincronizar_requisitos);
    return {
      id_proceso,
      id_certificado,
      id_certificado_version,
      requisitoIds,
      sincronizar_requisitos,
    };
  });

  const linkIds: string[] = [];
  const createdOrRestoredForRollback: CreatedBridgeRecord[] = [];
  let createdCount = 0;
  let restoredCount = 0;
  let requisitoLinksUpserted = 0;

  for (const link of validatedLinks) {
    // Paso A: Insert or reactivate `proceso_certificado_compartido`
    const bridgeRes = await upsertOrReactivateBridgeRow({
      supabase,
      table: 'proceso_certificado_compartido',
      matchColumns: [
        { column: 'id_proceso', value: link.id_proceso },
        { column: 'id_certificado', value: link.id_certificado },
        ...(link.id_certificado_version
          ? [{ column: 'id_certificado_version', value: link.id_certificado_version }]
          : []),
      ],
      insertPayload: {
        id_proceso: link.id_proceso,
        id_certificado: link.id_certificado,
        ...(link.id_certificado_version
          ? { id_certificado_version: link.id_certificado_version }
          : {}),
        sincronizar_requisitos: link.sincronizar_requisitos,
      },
      restorePayload: {
        sincronizar_requisitos: link.sincronizar_requisitos,
      },
    });

    if (!bridgeRes.ok || !bridgeRes.id) {
      const rolledBackLinkIds = await rollbackNewlyCreatedBridgeLinks(
        supabase,
        createdOrRestoredForRollback,
        'Rollback compensatorio al fallar enlace proceso-certificado'
      );
      return {
        ok: false,
        error: bridgeRes.error || 'No se pudo compartir el proceso con el certificado destino.',
        rolledBackLinkIds,
      };
    }

    linkIds.push(bridgeRes.id);
    if (bridgeRes.action === 'inserted') {
      createdCount += 1;
      createdOrRestoredForRollback.push({
        table: 'proceso_certificado_compartido',
        id: bridgeRes.id,
      });
    } else if (bridgeRes.action === 'restored') {
      restoredCount += 1;
      createdOrRestoredForRollback.push({
        table: 'proceso_certificado_compartido',
        id: bridgeRes.id,
      });
    }

    // Paso B: Persist target-certificate clauses strictly scoped by `(id_proceso, id_certificado_version, id_requisito)`
    if (link.requisitoIds.length > 0) {
      let resolvedVerId = link.id_certificado_version;
      if (!resolvedVerId) {
        try {
          const { data: verRow } = await supabase
            .from('certificado_version')
            .select('id')
            .eq('id_certificado', link.id_certificado)
            .is('deleted_at', null)
            .order('es_version_actual', { ascending: false })
            .order('version_numero', { ascending: false })
            .limit(1)
            .maybeSingle();
          const candidateId = verRow?.id ? String(verRow.id).trim() : '';
          if (isValidUuid(candidateId)) {
            resolvedVerId = candidateId;
          }
        } catch {
          // Safe fallback: DB trigger fn_guard_req_proceso_against_exclusion resolves active version
        }
      }

      const reqRows = link.requisitoIds.map((id_requisito) => ({
        id_proceso: link.id_proceso,
        id_certificado: link.id_certificado,
        ...(resolvedVerId
          ? { id_certificado_version: resolvedVerId }
          : {}),
        id_requisito,
      }));

      const { error: reqErr } = await persistRequisitosPorProcesoInsert(
        supabase as ProcesoReqSupabaseLike,
        reqRows
      );

      if (reqErr) {
        const rolledBackLinkIds = await rollbackNewlyCreatedBridgeLinks(
          supabase,
          createdOrRestoredForRollback,
          'Rollback compensatorio por fallo al persistir cláusulas por certificado'
        );
        return {
          ok: false,
          error: translateShareDbError(reqErr),
          rolledBackLinkIds,
        };
      }

      requisitoLinksUpserted += reqRows.length;
    }
  }

  return {
    ok: true,
    data: {
      linkIds,
      createdCount,
      restoredCount,
      requisitoLinksUpserted,
    },
  };
}

function isMissingRpcFunctionError(err: ShareDbErrorLike): boolean {
  const code = (err.code || '').trim().toUpperCase();
  const msg = (err.message || '').toLowerCase();
  return (
    code === '42883' ||
    code === 'PGRST202' ||
    msg.includes('could not find the function') ||
    msg.includes('does not exist')
  );
}

function readNumericField(rec: Record<string, unknown>, key: string): number {
  const val = Number(rec[key]);
  return Number.isFinite(val) && val >= 0 ? val : 0;
}

/**
 * Synchronizes / shares process requirements (`requisitos_por_proceso` +
 * `proceso_certificado_compartido.sincronizar_requisitos`) across same-norm peer
 * certificates via `fn_sync_shared_process_requisitos` RPC, with safe
 * transactional fallback for mocked or offline environments.
 */
export async function persistSyncProcesoRequisitos(
  supabase: ShareSupabaseClient,
  params: PersistSyncProcesoRequisitosParams
): Promise<SharePersistenceResult<SyncProcesoRequisitosResultData>> {
  const validProcId = assertValidUuid(params.id_proceso, 'proceso');
  const validSourceCertId = assertValidUuid(
    params.id_certificado_origen,
    'certificado origen'
  );
  const validSingleTargetCertId =
    params.id_certificado_destino !== undefined &&
    params.id_certificado_destino !== null &&
    params.id_certificado_destino.trim() !== ''
      ? assertValidUuid(params.id_certificado_destino, 'certificado destino')
      : null;

  const enableSync = params.enableSync ?? true;
  const mirrorMode = Boolean(params.mirrorMode);
  const preferRpc = params.preferRpc !== false;

  const validatedTargets = (params.targets || []).map((target) => {
    const destId = assertValidUuid(
      target.id_certificado_destino,
      'certificado destino'
    );
    const destVersionId =
      target.id_certificado_version && target.id_certificado_version.trim() !== ''
        ? assertValidUuid(target.id_certificado_version, 'versión de certificado')
        : null;
    const seenInsert = new Set<string>();
    const toInsert: string[] = [];
    for (const reqId of target.requisitoIdsToInsert || []) {
      const validReqId = assertValidUuid(reqId, 'requisito normativo');
      if (!seenInsert.has(validReqId)) {
        seenInsert.add(validReqId);
        toInsert.push(validReqId);
      }
    }
    const seenRemove = new Set<string>();
    const toRemove: string[] = [];
    for (const reqId of target.requisitoIdsToRemove || []) {
      const validReqId = assertValidUuid(reqId, 'requisito normativo');
      if (!seenRemove.has(validReqId)) {
        seenRemove.add(validReqId);
        toRemove.push(validReqId);
      }
    }
    return {
      id_certificado_destino: destId,
      id_certificado_version: destVersionId,
      toInsert,
      toRemove,
      enableSync: target.enableSync ?? enableSync,
      skippedExcludedCount: Math.max(0, Number(target.skippedExcludedCount || 0)),
    };
  });

  if (preferRpc) {
    const { data: rpcData, error: rpcErr } = await supabase.rpc(
      'fn_sync_shared_process_requisitos',
      {
        p_id_proceso: validProcId,
        p_source_cert_id: validSourceCertId,
        p_target_cert_id: validSingleTargetCertId,
        p_enable_sync: enableSync,
      }
    );

    if (rpcErr) {
      if (!isMissingRpcFunctionError(rpcErr) && !isOnConflictSpecError(rpcErr)) {
        return {
          ok: false,
          error: translateShareDbError(rpcErr),
        };
      }
    } else if (
      typeof rpcData === 'object' &&
      rpcData !== null &&
      !Array.isArray(rpcData)
    ) {
      const rec = rpcData as Record<string, unknown>;
      return {
        ok: true,
        data: {
          syncedCertsCount: readNumericField(rec, 'synced_certs_count'),
          insertedCount: readNumericField(rec, 'inserted_count'),
          deletedCount: readNumericField(rec, 'deleted_count'),
          skippedExcludedCount: readNumericField(rec, 'skipped_excluded_count'),
          usedRpc: true,
        },
      };
    } else if (validatedTargets.length === 0) {
      return {
        ok: true,
        data: {
          syncedCertsCount: validSingleTargetCertId ? 1 : 0,
          insertedCount: 0,
          deletedCount: 0,
          skippedExcludedCount: 0,
          usedRpc: true,
        },
      };
    }
  }

  // Transactional fallback (`proceso_certificado_compartido.update` + `requisitos_por_proceso` upsert/delete)
  let syncedCertsCount = 0;
  let insertedCount = 0;
  let deletedCount = 0;
  let skippedExcludedCount = 0;

  for (const target of validatedTargets) {
    if (target.id_certificado_destino !== validSourceCertId) {
      const { error: bridgeUpdateErr } = await supabase
        .from('proceso_certificado_compartido')
        .update({ sincronizar_requisitos: target.enableSync })
        .eq('id_proceso', validProcId)
        .eq('id_certificado', target.id_certificado_destino);

      if (bridgeUpdateErr) {
        return {
          ok: false,
          error: translateShareDbError(bridgeUpdateErr),
        };
      }
    }

    let targetVerId = target.id_certificado_version;
    if (!targetVerId && (target.toInsert.length > 0 || (mirrorMode && target.toRemove.length > 0))) {
      try {
        const { data: verRow } = await supabase
          .from('certificado_version')
          .select('id')
          .eq('id_certificado', target.id_certificado_destino)
          .is('deleted_at', null)
          .order('es_version_actual', { ascending: false })
          .order('version_numero', { ascending: false })
          .limit(1)
          .maybeSingle();
        const candidateId = verRow?.id ? String(verRow.id).trim() : '';
        if (isValidUuid(candidateId)) {
          targetVerId = candidateId;
        }
      } catch {
        // Safe fallback: trigger fills active version on insert
      }
    }

    if (target.toInsert.length > 0) {
      const rowsToInsert = target.toInsert.map((id_requisito) => ({
        id_proceso: validProcId,
        id_certificado: target.id_certificado_destino,
        ...(targetVerId ? { id_certificado_version: targetVerId } : {}),
        id_requisito,
      }));
      const { error: upsertErr } = await persistRequisitosPorProcesoInsert(
        supabase as ProcesoReqSupabaseLike,
        rowsToInsert
      );

      if (upsertErr) {
        return {
          ok: false,
          error: translateShareDbError(upsertErr),
        };
      }
      insertedCount += rowsToInsert.length;
    }

    if (mirrorMode && target.toRemove.length > 0) {
      const { error: delErr } = await persistRequisitosPorProcesoDelete(
        supabase as ProcesoReqSupabaseLike,
        {
          id_proceso: validProcId,
          id_certificado: target.id_certificado_destino,
          id_certificado_version: targetVerId,
          requisitoIds: target.toRemove,
        }
      );
      if (delErr) {
        return {
          ok: false,
          error: translateShareDbError(delErr),
        };
      }
      deletedCount += target.toRemove.length;
    }

    syncedCertsCount += 1;
    skippedExcludedCount += target.skippedExcludedCount;
  }

  return {
    ok: true,
    data: {
      syncedCertsCount,
      insertedCount,
      deletedCount,
      skippedExcludedCount,
      usedRpc: false,
    },
  };
}

export async function persistShareSitios(
  supabase: ShareSupabaseClient,
  params: PersistShareSitiosParams
): Promise<
  SharePersistenceResult<{
    sitioLinkIds: string[];
    turnoLinkIds: string[];
    procesoLinkIds: string[];
    procesoSitioLinkIds: string[];
    createdCount: number;
    restoredCount: number;
  }>
> {
  const sitioLinks = params.sitioLinks || [];
  const turnoCertLinks = params.turnoCertLinks || [];
  const procesoShares = params.procesoShares || [];
  const procesosPorSitio = params.procesosPorSitio || [];

  if (sitioLinks.length === 0) {
    return {
      ok: false,
      error: 'Debe seleccionar al menos un sitio y un certificado destino para compartir.',
    };
  }

  const validatedSitioLinks = sitioLinks.map((item) => {
    const id_sitio = assertValidUuid(item.id_sitio, 'sitio');
    const id_certificado = assertValidUuid(
      item.id_certificado,
      'certificado destino'
    );
    const rawVer =
      'id_certificado_version' in item ? item.id_certificado_version : null;
    const id_certificado_version =
      rawVer && rawVer.trim() !== ''
        ? assertValidUuid(rawVer, 'versión de certificado')
        : null;
    if (
      typeof item.numero_sitio !== 'number' ||
      !Number.isInteger(item.numero_sitio) ||
      item.numero_sitio < 0
    ) {
      throw new Error(
        'El número operativo de sitio debe ser un entero mayor o igual a 0.'
      );
    }
    return {
      id_sitio,
      id_certificado,
      id_certificado_version,
      numero_sitio: item.numero_sitio,
    };
  });

  const validatedTurnoLinks = turnoCertLinks.map((item) => {
    const rawVer =
      'id_certificado_version' in item ? item.id_certificado_version : null;
    return {
      id_turno: assertValidUuid(item.id_turno, 'turno'),
      id_certificado: assertValidUuid(item.id_certificado, 'certificado destino'),
      id_certificado_version:
        rawVer && rawVer.trim() !== ''
          ? assertValidUuid(rawVer, 'versión de certificado')
          : null,
      id_certificado_origen:
        item.id_certificado_origen !== undefined &&
        item.id_certificado_origen !== null &&
        item.id_certificado_origen.trim() !== ''
          ? assertValidUuid(item.id_certificado_origen, 'certificado origen')
          : null,
    };
  });

  const validatedProcesoShares = procesoShares.map((item) => {
    const rawVer =
      'id_certificado_version' in item ? item.id_certificado_version : null;
    return {
      id_proceso: assertValidUuid(item.id_proceso, 'proceso'),
      id_certificado: assertValidUuid(
        item.id_certificado,
        'certificado destino'
      ),
      id_certificado_version:
        rawVer && rawVer.trim() !== ''
          ? assertValidUuid(rawVer, 'versión de certificado')
          : null,
      requisitoIds: (item.requisitoIds || []).map((reqId) =>
        assertValidUuid(reqId, 'requisito normativo')
      ),
      sincronizar_requisitos: Boolean(item.sincronizar_requisitos),
    };
  });

  const validatedProcesosPorSitio = procesosPorSitio.map((item) => {
    const rawVer =
      'id_certificado_version' in item ? item.id_certificado_version : null;
    return {
      id_certificado: assertValidUuid(
        item.id_certificado,
        'certificado destino'
      ),
      id_certificado_version:
        rawVer && rawVer.trim() !== ''
          ? assertValidUuid(rawVer, 'versión de certificado')
          : null,
      id_sitio: assertValidUuid(item.id_sitio, 'sitio'),
      id_proceso: assertValidUuid(item.id_proceso, 'proceso'),
    };
  });

  const createdRecords: CreatedBridgeRecord[] = [];
  const sitioLinkIds: string[] = [];
  const turnoLinkIds: string[] = [];
  let procesoLinkIds: string[] = [];
  const procesoSitioLinkIds: string[] = [];
  let createdCount = 0;
  let restoredCount = 0;

  // Paso A: Share new processes with cross-standard clause resolution first
  if (validatedProcesoShares.length > 0) {
    const procShareRes = await persistShareProcesos(supabase, {
      links: validatedProcesoShares,
    });
    if (!procShareRes.ok || !procShareRes.data) {
      return {
        ok: false,
        error:
          procShareRes.error ||
          'No se pudieron compartir los procesos requeridos por la cascada del sitio.',
        rolledBackLinkIds: procShareRes.rolledBackLinkIds,
      };
    }
    procesoLinkIds = procShareRes.data.linkIds;
    createdCount += procShareRes.data.createdCount;
    restoredCount += procShareRes.data.restoredCount;
    for (const id of procShareRes.data.linkIds) {
      createdRecords.push({ table: 'proceso_certificado_compartido', id });
    }
  }

  // Paso B: Insert/reactivate `sitio_certificado_compartido`
  for (const sLink of validatedSitioLinks) {
    const res = await upsertOrReactivateBridgeRow({
      supabase,
      table: 'sitio_certificado_compartido',
      matchColumns: [
        { column: 'id_sitio', value: sLink.id_sitio },
        { column: 'id_certificado', value: sLink.id_certificado },
        ...(sLink.id_certificado_version
          ? [{ column: 'id_certificado_version', value: sLink.id_certificado_version }]
          : []),
      ],
      insertPayload: {
        id_sitio: sLink.id_sitio,
        id_certificado: sLink.id_certificado,
        ...(sLink.id_certificado_version
          ? { id_certificado_version: sLink.id_certificado_version }
          : {}),
        numero_sitio: sLink.numero_sitio,
      },
      restorePayload: {
        numero_sitio: sLink.numero_sitio,
      },
    });

    if (!res.ok || !res.id) {
      const rolledBackLinkIds = await rollbackNewlyCreatedBridgeLinks(
        supabase,
        createdRecords,
        'Rollback compensatorio por fallo al compartir sitio'
      );
      return {
        ok: false,
        error: res.error || 'No se pudo compartir el sitio seleccionado.',
        rolledBackLinkIds,
      };
    }

    sitioLinkIds.push(res.id);
    if (res.action === 'inserted') {
      createdCount += 1;
      createdRecords.push({ table: 'sitio_certificado_compartido', id: res.id });
    } else if (res.action === 'restored') {
      restoredCount += 1;
      createdRecords.push({ table: 'sitio_certificado_compartido', id: res.id });
    }
  }

  // Paso C.1: Cascade `turno_certificado_compartido`
  if (validatedTurnoLinks.length > 0) {
    const turnoRes = await persistShareTurnos(supabase, {
      certLinks: validatedTurnoLinks,
    });
    if (!turnoRes.ok || !turnoRes.data) {
      const rolledBackLinkIds = await rollbackNewlyCreatedBridgeLinks(
        supabase,
        createdRecords,
        'Rollback compensatorio por fallo al propagar turnos del sitio compartido'
      );
      return {
        ok: false,
        error:
          turnoRes.error ||
          'No se pudieron compartir los turnos asociados al sitio.',
        rolledBackLinkIds: [
          ...rolledBackLinkIds,
          ...(turnoRes.rolledBackLinkIds || []),
        ],
      };
    }
    turnoLinkIds.push(...turnoRes.data.certLinkIds);
    createdCount += turnoRes.data.createdCount;
    restoredCount += turnoRes.data.restoredCount;
    for (const id of turnoRes.data.certLinkIds) {
      createdRecords.push({ table: 'turno_certificado_compartido', id });
    }
  }

  // Paso C.2: Persist `procesos_por_sitio` strictly scoped by `id_certificado` (and `id_certificado_version` when supplied)
  for (const pps of validatedProcesosPorSitio) {
    const ppsRes = await upsertOrReactivateBridgeRow({
      supabase,
      table: 'procesos_por_sitio',
      matchColumns: [
        { column: 'id_certificado', value: pps.id_certificado },
        ...(pps.id_certificado_version
          ? [{ column: 'id_certificado_version', value: pps.id_certificado_version }]
          : []),
        { column: 'id_sitio', value: pps.id_sitio },
        { column: 'id_proceso', value: pps.id_proceso },
      ],
      insertPayload: {
        id_certificado: pps.id_certificado,
        ...(pps.id_certificado_version
          ? { id_certificado_version: pps.id_certificado_version }
          : {}),
        id_sitio: pps.id_sitio,
        id_proceso: pps.id_proceso,
      },
    });

    if (!ppsRes.ok || !ppsRes.id) {
      const rolledBackLinkIds = await rollbackNewlyCreatedBridgeLinks(
        supabase,
        createdRecords,
        'Rollback compensatorio por fallo al asignar procesos por sitio en certificado destino'
      );
      return {
        ok: false,
        error:
          ppsRes.error ||
          'No se pudo vincular el proceso a la sede en el certificado destino.',
        rolledBackLinkIds,
      };
    }

    procesoSitioLinkIds.push(ppsRes.id);
    if (ppsRes.action === 'inserted') {
      createdCount += 1;
      createdRecords.push({ table: 'procesos_por_sitio', id: ppsRes.id });
    } else if (ppsRes.action === 'restored') {
      restoredCount += 1;
      createdRecords.push({ table: 'procesos_por_sitio', id: ppsRes.id });
    }
  }

  return {
    ok: true,
    data: {
      sitioLinkIds,
      turnoLinkIds,
      procesoLinkIds,
      procesoSitioLinkIds,
      createdCount,
      restoredCount,
    },
  };
}

// =============================================================================
// 2. Unlink Shared Child (`archive_record` + Dependency Guard)
// =============================================================================

const VALID_BRIDGE_TABLES: ReadonlySet<ShareableBridgeTable> = new Set([
  'contacto_certificado_compartido',
  'turno_certificado_compartido',
  'proceso_certificado_compartido',
  'sitio_certificado_compartido',
]);

export async function persistUnlinkSharedChild(
  supabase: ShareSupabaseClient,
  tableName: ShareableBridgeTable,
  linkId: string,
  reason = 'Desvinculación de registro compartido en conglomerado'
): Promise<SharePersistenceResult<{ id: string; alreadyArchived?: boolean }>> {
  if (!VALID_BRIDGE_TABLES.has(tableName)) {
    return {
      ok: false,
      error: 'La tabla de compartición indicada no es válida.',
    };
  }

  const validLinkId = assertValidUuid(linkId, 'vínculo compartido');

  if (tableName === 'sitio_certificado_compartido') {
    const { data: linkRow, error: linkErr } = await supabase
      .from('sitio_certificado_compartido')
      .select('id, id_sitio, id_certificado, deleted_at')
      .eq('id', validLinkId)
      .maybeSingle();

    if (linkErr) {
      return { ok: false, error: translateShareDbError(linkErr) };
    }

    if (linkRow) {
      if (linkRow.deleted_at !== null && linkRow.deleted_at !== undefined) {
        return {
          ok: true,
          data: { id: validLinkId, alreadyArchived: true },
        };
      }

      const idSitio =
        typeof linkRow.id_sitio === 'string' ? linkRow.id_sitio.trim() : '';
      const idCertificado =
        typeof linkRow.id_certificado === 'string'
          ? linkRow.id_certificado.trim()
          : '';

      if (isValidUuid(idSitio) && isValidUuid(idCertificado)) {
        const { data: siteAudits, error: auditLookupErr } = await supabase
          .from('sitios_por_auditoria')
          .select('id, id_auditoria, auditoria:id_auditoria ( id, id_certificado, deleted_at )')
          .eq('id_sitio', idSitio)
          .is('deleted_at', null);

        if (auditLookupErr) {
          return { ok: false, error: translateShareDbError(auditLookupErr) };
        }

        if (Array.isArray(siteAudits)) {
          const blockingAudits = siteAudits.filter((row) => {
            const aud = row.auditoria as Record<string, unknown> | null | undefined;
            if (!aud || aud.deleted_at !== null && aud.deleted_at !== undefined) {
              return false;
            }
            return String(aud.id_certificado || '').trim() === idCertificado;
          });

          if (blockingAudits.length > 0) {
            return {
              ok: false,
              error: `No se puede desvincular este sitio compartido porque participa en ${blockingAudits.length} auditoría(s) activa(s) dentro del certificado destino.`,
            };
          }
        }
      }
    }
  }

  const cleanReason =
    scrubRawUuids(reason) || 'Desvinculación de registro compartido en conglomerado';

  const { error: archiveErr } = await supabase.rpc('archive_record', {
    p_table: tableName,
    p_record_id: validLinkId,
    p_reason: cleanReason,
  });

  if (archiveErr) {
    return {
      ok: false,
      error: translateShareDbError(archiveErr),
    };
  }

  return {
    ok: true,
    data: { id: validLinkId },
  };
}

// =============================================================================
// 2b. Transactional Bilingual `Alcance` Persistence (`Step 2.3`)
// =============================================================================

/**
 * Saves or updates the single active bilingual `public.alcance` row for `certId`.
 * If `certId` currently consumes a shared `alcance_certificado_compartido` link,
 * that shared link is archived first via `archive_record` so the own scope takes over cleanly.
 */
export async function persistSaveOwnAlcance(
  supabase: ShareSupabaseClient,
  params: PersistSaveOwnAlcanceParams
): Promise<SharePersistenceResult<SaveOwnAlcanceResultData>> {
  const validCertId = assertValidUuid(params.certId, 'certificado');
  const validExistingId =
    params.existingAlcanceId && params.existingAlcanceId.trim() !== ''
      ? assertValidUuid(params.existingAlcanceId, 'alcance')
      : null;

  const validation = validateAlcanceDraft({
    alcance_es: params.alcance_es,
    alcance_en: params.alcance_en,
  });
  if (!validation.valid) {
    return {
      ok: false,
      error: validation.error || 'El Alcance en español es obligatorio.',
    };
  }

  // Archive any prior shared `alcance_certificado_compartido` link for this certificate
  const { data: activeSharedLinks, error: sharedLookupErr } = await supabase
    .from('alcance_certificado_compartido')
    .select('id, deleted_at')
    .eq('id_certificado', validCertId)
    .is('deleted_at', null);

  if (sharedLookupErr) {
    return { ok: false, error: translateShareDbError(sharedLookupErr) };
  }

  const archivedShareLinkIds: string[] = [];
  for (const row of activeSharedLinks || []) {
    if (row.deleted_at !== null && row.deleted_at !== undefined) continue;
    const shareId = typeof row.id === 'string' ? row.id.trim() : '';
    if (!isValidUuid(shareId)) continue;

    const { error: archErr } = await supabase.rpc('archive_record', {
      p_table: 'alcance_certificado_compartido',
      p_record_id: shareId,
      p_reason: 'Reemplazo de alcance compartido por alcance propio',
    });
    if (archErr) {
      return { ok: false, error: translateShareDbError(archErr) };
    }
    archivedShareLinkIds.push(shareId);
  }

  let targetAlcanceId = validExistingId;
  if (!targetAlcanceId) {
    const { data: existingOwnRows, error: ownLookupErr } = await supabase
      .from('alcance')
      .select('id, deleted_at')
      .eq('id_certificado', validCertId)
      .is('deleted_at', null)
      .limit(1);

    if (ownLookupErr) {
      return { ok: false, error: translateShareDbError(ownLookupErr) };
    }

    if (Array.isArray(existingOwnRows) && existingOwnRows.length > 0) {
      const candidate = existingOwnRows[0];
      const candidateId =
        typeof candidate.id === 'string' ? candidate.id.trim() : '';
      if (
        isValidUuid(candidateId) &&
        (candidate.deleted_at === null || candidate.deleted_at === undefined)
      ) {
        targetAlcanceId = candidateId;
      }
    }
  }

  if (targetAlcanceId) {
    const { data: updatedRow, error: updateErr } = await supabase
      .from('alcance')
      .update({
        alcance_es: validation.normalized.alcance_es,
        alcance_en: validation.normalized.alcance_en,
      })
      .eq('id', targetAlcanceId)
      .select('id')
      .single();

    if (updateErr) {
      return { ok: false, error: translateShareDbError(updateErr) };
    }

    const resolvedId =
      updatedRow &&
      typeof updatedRow.id === 'string' &&
      isValidUuid(updatedRow.id)
        ? updatedRow.id.trim()
        : targetAlcanceId;

    return {
      ok: true,
      data: {
        id: resolvedId,
        id_certificado: validCertId,
        alcance_es: validation.normalized.alcance_es,
        alcance_en: validation.normalized.alcance_en,
        action: 'updated',
        archivedShareLinkIds,
      },
    };
  }

  const newAlcanceId = crypto.randomUUID();
  const { data: insertedRow, error: insertErr } = await supabase
    .from('alcance')
    .insert({
      id: newAlcanceId,
      id_certificado: validCertId,
      alcance_es: validation.normalized.alcance_es,
      alcance_en: validation.normalized.alcance_en,
    })
    .select('id')
    .single();

  if (insertErr) {
    return { ok: false, error: translateShareDbError(insertErr) };
  }

  const resolvedId =
    insertedRow &&
    typeof insertedRow.id === 'string' &&
    isValidUuid(insertedRow.id)
      ? insertedRow.id.trim()
      : newAlcanceId;

  return {
    ok: true,
    data: {
      id: resolvedId,
      id_certificado: validCertId,
      alcance_es: validation.normalized.alcance_es,
      alcance_en: validation.normalized.alcance_en,
      action: 'inserted',
      archivedShareLinkIds,
    },
  };
}

/**
 * Shares an active `public.alcance` across target certificates in the same `Conglomerado`
 * via `fn_compartir_alcance_con_resolucion` RPC, with clean transactional fallback
 * (`archive_record` of conflicting target scope/links + bridge insert/reactivation).
 */
export async function persistShareAlcance(
  supabase: ShareSupabaseClient,
  params: PersistShareAlcanceParams
): Promise<SharePersistenceResult<ShareAlcanceResultData>> {
  const validAlcanceId = assertValidUuid(params.id_alcance, 'alcance');
  const replaceExisting = Boolean(params.replaceExisting);
  const preferRpc = params.preferRpc !== false;

  const seenTargets = new Set<string>();
  const validatedTargetIds: string[] = [];
  for (const rawId of params.targetCertIds || []) {
    const trimmed = (rawId || '').trim();
    if (!trimmed) continue;
    const validId = assertValidUuid(trimmed, 'certificado destino');
    if (!seenTargets.has(validId)) {
      seenTargets.add(validId);
      validatedTargetIds.push(validId);
    }
  }

  if (validatedTargetIds.length === 0) {
    return {
      ok: false,
      error:
        'Debe seleccionar al menos un certificado destino dentro del conglomerado para compartir el Alcance.',
    };
  }

  if (preferRpc) {
    const { data: rpcData, error: rpcErr } = await supabase.rpc(
      'fn_compartir_alcance_con_resolucion',
      {
        p_id_alcance: validAlcanceId,
        p_target_cert_ids: validatedTargetIds,
        p_reemplazar_existentes: replaceExisting,
      }
    );

    if (rpcErr) {
      if (!isMissingRpcFunctionError(rpcErr)) {
        return {
          ok: false,
          error: translateShareDbError(rpcErr),
        };
      }
    } else if (
      typeof rpcData === 'object' &&
      rpcData !== null &&
      !Array.isArray(rpcData)
    ) {
      const rec = rpcData as Record<string, unknown>;
      return {
        ok: true,
        data: {
          linkedCount: readNumericField(rec, 'linked_count'),
          replacedCount: readNumericField(rec, 'replaced_count'),
          skippedCount: readNumericField(rec, 'skipped_count'),
          usedRpc: true,
        },
      };
    } else {
      return {
        ok: true,
        data: {
          linkedCount: validatedTargetIds.length,
          replacedCount: 0,
          skippedCount: 0,
          usedRpc: true,
        },
      };
    }
  }

  // Transactional fallback when RPC is unavailable in offline/mocked environments
  const { data: sourceRows, error: srcErr } = await supabase
    .from('alcance')
    .select('id, id_certificado, deleted_at')
    .eq('id', validAlcanceId)
    .is('deleted_at', null)
    .limit(1);

  if (srcErr) {
    return { ok: false, error: translateShareDbError(srcErr) };
  }

  if (Array.isArray(sourceRows) && sourceRows.length > 0) {
    const srcRow = sourceRows[0];
    if (srcRow.deleted_at !== null && srcRow.deleted_at !== undefined) {
      return {
        ok: false,
        error:
          'Operación bloqueada: el Alcance seleccionado no existe o está archivado.',
      };
    }
    const ownerCertId =
      typeof srcRow.id_certificado === 'string'
        ? srcRow.id_certificado.trim()
        : '';
    if (ownerCertId && validatedTargetIds.includes(ownerCertId)) {
      return {
        ok: false,
        error:
          'Operación bloqueada: no puede compartir un Alcance con el mismo certificado propietario.',
      };
    }
  }

  let linkedCount = 0;
  let replacedCount = 0;
  let skippedCount = 0;
  const createdLinkIds: string[] = [];
  const createdRecords: CreatedBridgeRecord[] = [];

  for (const targetCertId of validatedTargetIds) {
    const { data: activeShares, error: shareLookupErr } = await supabase
      .from('alcance_certificado_compartido')
      .select('id, id_alcance, deleted_at')
      .eq('id_certificado', targetCertId)
      .is('deleted_at', null);

    if (shareLookupErr) {
      const rolledBackLinkIds = await rollbackNewlyCreatedBridgeLinks(
        supabase,
        createdRecords,
        'Rollback compensatorio por fallo al consultar alcances compartidos'
      );
      return {
        ok: false,
        error: translateShareDbError(shareLookupErr),
        rolledBackLinkIds,
      };
    }

    const activeShareRows = (activeShares || []).filter(
      (r) => r.deleted_at === null || r.deleted_at === undefined
    );
    const alreadySameShare = activeShareRows.some(
      (r) => String(r.id_alcance || '').trim() === validAlcanceId
    );
    if (alreadySameShare) {
      skippedCount += 1;
      continue;
    }

    const { data: activeOwnRows, error: ownLookupErr } = await supabase
      .from('alcance')
      .select('id, deleted_at')
      .eq('id_certificado', targetCertId)
      .is('deleted_at', null);

    if (ownLookupErr) {
      const rolledBackLinkIds = await rollbackNewlyCreatedBridgeLinks(
        supabase,
        createdRecords,
        'Rollback compensatorio por fallo al consultar alcances propios'
      );
      return {
        ok: false,
        error: translateShareDbError(ownLookupErr),
        rolledBackLinkIds,
      };
    }

    const conflictingOwnIds = (activeOwnRows || [])
      .filter((r) => r.deleted_at === null || r.deleted_at === undefined)
      .map((r) => String(r.id || '').trim())
      .filter((id) => isValidUuid(id));

    const conflictingShareIds = activeShareRows
      .filter((r) => String(r.id_alcance || '').trim() !== validAlcanceId)
      .map((r) => String(r.id || '').trim())
      .filter((id) => isValidUuid(id));

    if (conflictingOwnIds.length > 0 || conflictingShareIds.length > 0) {
      if (!replaceExisting) {
        const rolledBackLinkIds = await rollbackNewlyCreatedBridgeLinks(
          supabase,
          createdRecords,
          'Rollback compensatorio por conflicto de alcance existente sin confirmación'
        );
        return {
          ok: false,
          error: translateShareDbError({
            code: 'P0001',
            message:
              'CONFLICTO_ALCANCE_EXISTENTE: El certificado destino ya posee un alcance registrado. Confirme el reemplazo para continuar.',
          }),
          rolledBackLinkIds,
        };
      }

      for (const ownId of conflictingOwnIds) {
        const { error: archOwnErr } = await supabase.rpc('archive_record', {
          p_table: 'alcance',
          p_record_id: ownId,
          p_reason: 'Reemplazado al compartir alcance en conglomerado',
        });
        if (archOwnErr) {
          const rolledBackLinkIds = await rollbackNewlyCreatedBridgeLinks(
            supabase,
            createdRecords,
            'Rollback compensatorio por fallo al archivar alcance propio previo'
          );
          return {
            ok: false,
            error: translateShareDbError(archOwnErr),
            rolledBackLinkIds,
          };
        }
      }

      for (const shareId of conflictingShareIds) {
        const { error: archShareErr } = await supabase.rpc('archive_record', {
          p_table: 'alcance_certificado_compartido',
          p_record_id: shareId,
          p_reason: 'Reemplazado al compartir alcance en conglomerado',
        });
        if (archShareErr) {
          const rolledBackLinkIds = await rollbackNewlyCreatedBridgeLinks(
            supabase,
            createdRecords,
            'Rollback compensatorio por fallo al archivar alcance compartido previo'
          );
          return {
            ok: false,
            error: translateShareDbError(archShareErr),
            rolledBackLinkIds,
          };
        }
      }

      replacedCount += 1;
    }

    const bridgeRes = await upsertOrReactivateBridgeRow({
      supabase,
      table: 'alcance_certificado_compartido',
      matchColumns: [
        { column: 'id_alcance', value: validAlcanceId },
        { column: 'id_certificado', value: targetCertId },
      ],
      insertPayload: {
        id_alcance: validAlcanceId,
        id_certificado: targetCertId,
      },
    });

    if (!bridgeRes.ok || !bridgeRes.id) {
      const rolledBackLinkIds = await rollbackNewlyCreatedBridgeLinks(
        supabase,
        createdRecords,
        'Rollback compensatorio al fallar enlace alcance-certificado'
      );
      return {
        ok: false,
        error:
          bridgeRes.error ||
          'No se pudo compartir el Alcance con el certificado destino.',
        rolledBackLinkIds,
      };
    }

    createdLinkIds.push(bridgeRes.id);
    if (bridgeRes.action === 'inserted' || bridgeRes.action === 'restored') {
      createdRecords.push({
        table: 'alcance_certificado_compartido',
        id: bridgeRes.id,
      });
    }
    linkedCount += 1;
  }

  return {
    ok: true,
    data: {
      linkedCount,
      replacedCount,
      skippedCount,
      usedRpc: false,
      createdLinkIds,
    },
  };
}

/**
 * Unlinks a shared `alcance_certificado_compartido` link via `archive_record`,
 * leaving the target certificate without an active `Alcance` until it registers
 * or receives a new one.
 */
export async function persistUnlinkSharedAlcance(
  supabase: ShareSupabaseClient,
  shareLinkId: string,
  reason = 'Desvinculación de alcance compartido en conglomerado'
): Promise<SharePersistenceResult<{ id: string; alreadyArchived?: boolean }>> {
  const validLinkId = assertValidUuid(
    shareLinkId,
    'vínculo de alcance compartido'
  );

  const { data: linkRow, error: lookupErr } = await supabase
    .from('alcance_certificado_compartido')
    .select('id, deleted_at')
    .eq('id', validLinkId)
    .maybeSingle();

  if (lookupErr) {
    return { ok: false, error: translateShareDbError(lookupErr) };
  }

  if (linkRow && linkRow.deleted_at !== null && linkRow.deleted_at !== undefined) {
    return {
      ok: true,
      data: { id: validLinkId, alreadyArchived: true },
    };
  }

  const cleanReason =
    scrubRawUuids(reason) ||
    'Desvinculación de alcance compartido en conglomerado';

  const { error: archiveErr } = await supabase.rpc('archive_record', {
    p_table: 'alcance_certificado_compartido',
    p_record_id: validLinkId,
    p_reason: cleanReason,
  });

  if (archiveErr) {
    return { ok: false, error: translateShareDbError(archiveErr) };
  }

  return {
    ok: true,
    data: { id: validLinkId },
  };
}

/**
 * Archives an own `public.alcance` row via `archive_record`, blocking if
 * other certificates in the conglomerate actively share it.
 */
export async function persistArchiveOwnAlcance(
  supabase: ShareSupabaseClient,
  alcanceId: string,
  reason = 'Archivo de alcance propio del certificado'
): Promise<SharePersistenceResult<{ id: string }>> {
  const validAlcanceId = assertValidUuid(alcanceId, 'alcance');

  const { data: activeShares, error: shareLookupErr } = await supabase
    .from('alcance_certificado_compartido')
    .select('id, deleted_at')
    .eq('id_alcance', validAlcanceId)
    .is('deleted_at', null);

  if (shareLookupErr) {
    return { ok: false, error: translateShareDbError(shareLookupErr) };
  }

  const blockingCount = (activeShares || []).filter(
    (r) => r.deleted_at === null || r.deleted_at === undefined
  ).length;
  if (blockingCount > 0) {
    return {
      ok: false,
      error: `No es posible archivar este Alcance porque otros ${blockingCount} certificado(s) del conglomerado lo están reutilizando activamente.`,
    };
  }

  const cleanReason =
    scrubRawUuids(reason) || 'Archivo de alcance propio del certificado';

  const { error: archiveErr } = await supabase.rpc('archive_record', {
    p_table: 'alcance',
    p_record_id: validAlcanceId,
    p_reason: cleanReason,
  });

  if (archiveErr) {
    return { ok: false, error: translateShareDbError(archiveErr) };
  }

  return {
    ok: true,
    data: { id: validAlcanceId },
  };
}

// =============================================================================
// 3. Shared Certificate Hydration Assembler (Used by `src/main.ts` & Unit Tests)
// =============================================================================

export interface VisibleCertMetadata {
  id: string;
  numero_certificado: string;
  organizacion_nombre?: string;
  norma_codigo?: string;
}

export interface HydrationAssembleParams {
  visibleCerts: ReadonlyArray<VisibleCertMetadata>;
  contactosRows: ReadonlyArray<Record<string, unknown>>;
  telefonosByContacto: ReadonlyMap<string, TelefonoContactoEntity[]>;
  emailsByContacto: ReadonlyMap<string, EmailContactoEntity[]>;
  contactosCompartidosRows: ReadonlyArray<Record<string, unknown>>;
  sitiosRows: ReadonlyArray<Record<string, unknown>>;
  sitiosCompartidosRows: ReadonlyArray<Record<string, unknown>>;
  procesosRows: ReadonlyArray<Record<string, unknown>>;
  procesosCompartidosRows: ReadonlyArray<Record<string, unknown>>;
  reqsPorProcesoRows: ReadonlyArray<Record<string, unknown>>;
  reqLookupCatalog: ReadonlyArray<RequisitoLtree>;
  procesosPorSitioRows: ReadonlyArray<Record<string, unknown>>;
  turnosPorSitioRows: ReadonlyArray<Record<string, unknown>>;
  turnosCompartidosRows: ReadonlyArray<Record<string, unknown>>;
  shiftCatalog: ReadonlyArray<TurnoCatalogItem>;
  formatTurnoTime: (raw: string) => string;
  activeVersionIdByCertId?: ReadonlyMap<string, string>;
}

export interface HydrationAssembleResult {
  contactosByCert: Map<string, ContactoCertificadoEntity[]>;
  sitiosByCert: Map<string, SiteEntity[]>;
  procesosByCert: Map<string, ProcessEntity[]>;
  turnosByCert: Map<string, ShiftEntity[]>;
}

function buildOriginCertLabel(
  originCertId: string | null,
  visibleCertMetaById: ReadonlyMap<string, VisibleCertMetadata>
): string | null {
  if (!originCertId) return null;
  const meta = visibleCertMetaById.get(originCertId);
  if (!meta) return null;
  return meta.organizacion_nombre
    ? `${meta.numero_certificado} · ${meta.organizacion_nombre}`
    : meta.numero_certificado;
}

export function assembleSharedCertificateCollections(
  params: HydrationAssembleParams
): HydrationAssembleResult {
  const {
    visibleCerts,
    contactosRows,
    telefonosByContacto,
    emailsByContacto,
    contactosCompartidosRows,
    sitiosRows,
    sitiosCompartidosRows,
    procesosRows,
    procesosCompartidosRows,
    reqsPorProcesoRows,
    reqLookupCatalog,
    procesosPorSitioRows,
    turnosPorSitioRows,
    turnosCompartidosRows,
    shiftCatalog,
    formatTurnoTime,
    activeVersionIdByCertId,
  } = params;

  const visibleCertMetaById = new Map<string, VisibleCertMetadata>();
  for (const cert of visibleCerts) {
    if (cert.id) {
      visibleCertMetaById.set(cert.id, cert);
    }
  }

  // ---------------------------------------------------------------------------
  // A. Contactos (Own + `contacto_certificado_compartido`)
  // ---------------------------------------------------------------------------
  const rawContactoById = new Map<string, Record<string, unknown>>();
  const ownContactIdsByCert = new Map<string, string[]>();
  for (const row of contactosRows) {
    const contactId = String(row.id || '');
    const certId = String(row.id_certificado || '');
    if (!contactId || !certId) continue;
    rawContactoById.set(contactId, row);
    const list = ownContactIdsByCert.get(certId) || [];
    list.push(contactId);
    ownContactIdsByCert.set(certId, list);
  }

  const sharedContactoTargetsByContacto = new Map<
    string,
    CertificateShareLinkRef[]
  >();
  const sharedContactLinksByTargetCert = new Map<
    string,
    Array<{ linkId: string; contactId: string }>
  >();

  for (const link of contactosCompartidosRows) {
    const linkId = String(link.id || '');
    const contactId = String(link.id_contacto || '');
    const targetCertId = String(link.id_certificado || '');
    if (!linkId || !contactId || !targetCertId) continue;

    const targetList = sharedContactLinksByTargetCert.get(targetCertId) || [];
    if (!targetList.some((x) => x.contactId === contactId)) {
      targetList.push({ linkId, contactId });
      sharedContactLinksByTargetCert.set(targetCertId, targetList);
    }

    const visibleTarget = visibleCertMetaById.get(targetCertId);
    if (visibleTarget) {
      const refs = sharedContactoTargetsByContacto.get(contactId) || [];
      if (!refs.some((r) => r.targetCertId === targetCertId)) {
        refs.push({
          linkId,
          targetCertId,
          targetNumeroCertificado: visibleTarget.numero_certificado,
          targetOrganizacionNombre: visibleTarget.organizacion_nombre,
          targetNormaCodigo: visibleTarget.norma_codigo,
        });
        sharedContactoTargetsByContacto.set(contactId, refs);
      }
    }
  }

  const contactosByCert = new Map<string, ContactoCertificadoEntity[]>();
  for (const cert of visibleCerts) {
    const certId = cert.id;
    const list: ContactoCertificadoEntity[] = [];
    const seenContactIds = new Set<string>();

    for (const contactId of ownContactIdsByCert.get(certId) || []) {
      const row = rawContactoById.get(contactId);
      if (!row || seenContactIds.has(contactId)) continue;
      seenContactIds.add(contactId);
      list.push({
        id: contactId,
        id_certificado: certId,
        nombre: String(row.nombre || ''),
        cargo:
          row.cargo !== null && row.cargo !== undefined
            ? String(row.cargo)
            : null,
        telefonos: telefonosByContacto.get(contactId) || [],
        emails: emailsByContacto.get(contactId) || [],
        ownerCertId: certId,
        sharedFromCertId: null,
        sharedFromCertLabel: null,
        sharedTargets: sharedContactoTargetsByContacto.get(contactId),
      });
    }

    for (const sLink of sharedContactLinksByTargetCert.get(certId) || []) {
      if (seenContactIds.has(sLink.contactId)) continue;
      const row = rawContactoById.get(sLink.contactId);
      if (!row) continue;
      seenContactIds.add(sLink.contactId);
      const ownerCertId = String(row.id_certificado || '');
      const isSharedFromAnother = Boolean(ownerCertId && ownerCertId !== certId);
      list.push({
        id: sLink.contactId,
        id_certificado: ownerCertId || certId,
        nombre: String(row.nombre || ''),
        cargo:
          row.cargo !== null && row.cargo !== undefined
            ? String(row.cargo)
            : null,
        telefonos: telefonosByContacto.get(sLink.contactId) || [],
        emails: emailsByContacto.get(sLink.contactId) || [],
        ownerCertId: ownerCertId || certId,
        sharedFromCertId: isSharedFromAnother ? ownerCertId : null,
        sharedFromCertLabel: isSharedFromAnother
          ? buildOriginCertLabel(ownerCertId, visibleCertMetaById)
          : null,
        sharedTargets: sharedContactoTargetsByContacto.get(sLink.contactId),
      });
    }

    contactosByCert.set(certId, list);
  }

  // ---------------------------------------------------------------------------
  // B. Requisitos por Proceso (Strictly keyed by `${procId}::${certId}`)
  // ---------------------------------------------------------------------------
  const rawProcById = new Map<string, Record<string, unknown>>();
  const ownProcIdsByCert = new Map<string, string[]>();
  for (const row of procesosRows) {
    const procId = String(row.id || '');
    const certId = String(row.id_certificado || '');
    if (!procId || !certId) continue;
    rawProcById.set(procId, row);
    const list = ownProcIdsByCert.get(certId) || [];
    list.push(procId);
    ownProcIdsByCert.set(certId, list);
  }

  const reqsByProcAndCert = new Map<string, ProcessRequirementMapping[]>();
  const certIdsWithReqsByProc = new Map<string, Set<string>>();

  for (const row of reqsPorProcesoRows) {
    const procId = String(row.id_proceso || '');
    const reqId = String(row.id_requisito || '');
    if (!procId || !reqId) continue;
    const rawCertId =
      row.id_certificado !== null && row.id_certificado !== undefined
        ? String(row.id_certificado).trim()
        : '';
    const ownerFallbackCertId = String(rawProcById.get(procId)?.id_certificado || '');
    const reqCertId = rawCertId || ownerFallbackCertId;
    if (!reqCertId) continue;

    const expectedActiveVersionId = activeVersionIdByCertId?.get(reqCertId);
    const rowVersionId =
      row.id_certificado_version !== null && row.id_certificado_version !== undefined
        ? String(row.id_certificado_version).trim()
        : '';
    if (expectedActiveVersionId && rowVersionId && rowVersionId !== expectedActiveVersionId) {
      continue;
    }

    const reqObj = (row.requisito as Record<string, unknown> | null) || null;
    const matchedCatalogReq =
      reqLookupCatalog.find((r) => r.id === reqId) ||
      (reqObj?.codigo
        ? reqLookupCatalog.find(
            (r) =>
              r.codigo.trim().toLowerCase() ===
              String(reqObj.codigo).trim().toLowerCase()
          )
        : undefined);

    const codigo = reqObj?.codigo
      ? String(reqObj.codigo)
      : row.requisito_codigo
      ? String(row.requisito_codigo)
      : matchedCatalogReq?.codigo || '';
    if (!codigo) continue;

    const titulo = matchedCatalogReq?.titulo || `Cláusula ${codigo}`;
    const compositeKey = `${procId}::${reqCertId}`;
    const list = reqsByProcAndCert.get(compositeKey) || [];
    if (
      !list.some(
        (d) => d.codigo.trim().toLowerCase() === codigo.trim().toLowerCase()
      )
    ) {
      list.push({ codigo, titulo });
    }
    reqsByProcAndCert.set(compositeKey, list);

    const certSet = certIdsWithReqsByProc.get(procId) || new Set<string>();
    certSet.add(reqCertId);
    certIdsWithReqsByProc.set(procId, certSet);
  }

  // ---------------------------------------------------------------------------
  // C. Procesos (Own + `proceso_certificado_compartido`)
  // ---------------------------------------------------------------------------
  const sharedProcTargetsByProc = new Map<string, CertificateShareLinkRef[]>();
  const sharedProcLinksByTargetCert = new Map<
    string,
    Array<{ linkId: string; procId: string; sincronizar_requisitos: boolean }>
  >();
  const syncByProcAndTargetCert = new Map<string, boolean>();

  for (const link of procesosCompartidosRows) {
    const linkId = String(link.id || '');
    const procId = String(link.id_proceso || '');
    const targetCertId = String(link.id_certificado || '');
    if (!linkId || !procId || !targetCertId) continue;

    const syncReqs = Boolean(link.sincronizar_requisitos);
    syncByProcAndTargetCert.set(`${procId}::${targetCertId}`, syncReqs);

    const targetList = sharedProcLinksByTargetCert.get(targetCertId) || [];
    if (!targetList.some((x) => x.procId === procId)) {
      targetList.push({
        linkId,
        procId,
        sincronizar_requisitos: syncReqs,
      });
      sharedProcLinksByTargetCert.set(targetCertId, targetList);
    }

    const visibleTarget = visibleCertMetaById.get(targetCertId);
    if (visibleTarget) {
      const refs = sharedProcTargetsByProc.get(procId) || [];
      if (!refs.some((r) => r.targetCertId === targetCertId)) {
        refs.push({
          linkId,
          targetCertId,
          targetNumeroCertificado: visibleTarget.numero_certificado,
          targetOrganizacionNombre: visibleTarget.organizacion_nombre,
          targetNormaCodigo: visibleTarget.norma_codigo,
          sincronizar_requisitos: syncReqs,
        });
        sharedProcTargetsByProc.set(procId, refs);
      }
    }
  }

  const buildProcesoByCertMap = (
    procId: string,
    activeCertId: string
  ): Record<string, ProcessCertificateClausesEntry> => {
    const map: Record<string, ProcessCertificateClausesEntry> = {};
    const relatedCertIds = new Set<string>([activeCertId]);
    for (const cId of certIdsWithReqsByProc.get(procId) || []) {
      if (visibleCertMetaById.has(cId)) {
        relatedCertIds.add(cId);
      }
    }
    for (const ref of sharedProcTargetsByProc.get(procId) || []) {
      if (visibleCertMetaById.has(ref.targetCertId)) {
        relatedCertIds.add(ref.targetCertId);
      }
    }
    for (const cId of relatedCertIds) {
      const details = reqsByProcAndCert.get(`${procId}::${cId}`) || [];
      const syncFlag = syncByProcAndTargetCert.get(`${procId}::${cId}`);
      map[cId] = {
        clausulas_cubiertas: details.map((d) => d.codigo),
        requisitos_detalle: details.map((d) => ({ ...d })),
        ...(syncFlag !== undefined ? { sincronizar_requisitos: syncFlag } : {}),
      };
    }
    return map;
  };

  const toProcesoEntity = (
    row: Record<string, unknown>,
    currentCertId: string
  ): ProcessEntity => {
    const procId = String(row.id || '');
    const ownerCertId = String(row.id_certificado || '');
    const rawTipo = String(row.tipo || 'Medular');
    const tipo: ProcesoTipo =
      rawTipo === 'Estratégico' ||
      rawTipo === 'Medular' ||
      rawTipo === 'De Apoyo' ||
      rawTipo === 'Otro'
        ? rawTipo
        : 'Medular';
    const reqDetails = (reqsByProcAndCert.get(`${procId}::${currentCertId}`) || []).map(
      (d) => ({ ...d })
    );
    const isSharedFromAnother = Boolean(ownerCertId && ownerCertId !== currentCertId);
    const sharedLinkSyncFlag = isSharedFromAnother
      ? Boolean(syncByProcAndTargetCert.get(`${procId}::${currentCertId}`))
      : undefined;
    return {
      id: procId,
      id_certificado: ownerCertId || currentCertId,
      nombre_proceso: String(row.nombre_proceso || 'Proceso Operativo'),
      tipo,
      clausulas_cubiertas: reqDetails.map((d) => d.codigo),
      requisitos_detalle: reqDetails,
      requisitos_by_certificado: buildProcesoByCertMap(procId, currentCertId),
      ownerCertId: ownerCertId || currentCertId,
      sharedFromCertId: isSharedFromAnother ? ownerCertId : null,
      sharedFromCertLabel: isSharedFromAnother
        ? buildOriginCertLabel(ownerCertId, visibleCertMetaById)
        : null,
      sharedLinkSincronizarRequisitos: sharedLinkSyncFlag,
      sharedTargets: sharedProcTargetsByProc.get(procId),
    };
  };

  const procesosByCert = new Map<string, ProcessEntity[]>();
  for (const cert of visibleCerts) {
    const certId = cert.id;
    const list: ProcessEntity[] = [];
    const seenProcIds = new Set<string>();

    for (const procId of ownProcIdsByCert.get(certId) || []) {
      const row = rawProcById.get(procId);
      if (!row || seenProcIds.has(procId)) continue;
      seenProcIds.add(procId);
      list.push(toProcesoEntity(row, certId));
    }

    for (const sLink of sharedProcLinksByTargetCert.get(certId) || []) {
      if (seenProcIds.has(sLink.procId)) continue;
      const row = rawProcById.get(sLink.procId);
      if (!row) continue;
      seenProcIds.add(sLink.procId);
      list.push(toProcesoEntity(row, certId));
    }

    procesosByCert.set(certId, list);
  }

  // ---------------------------------------------------------------------------
  // D. Sitios (Own + `sitio_certificado_compartido`) & `procesos_por_sitio`
  // ---------------------------------------------------------------------------
  const rawSitioById = new Map<string, Record<string, unknown>>();
  const ownSitioIdsByCert = new Map<string, string[]>();
  for (const row of sitiosRows) {
    const sitioId = String(row.id || '');
    const certId = String(row.id_certificado || '');
    if (!sitioId || !certId) continue;
    rawSitioById.set(sitioId, row);
    const list = ownSitioIdsByCert.get(certId) || [];
    list.push(sitioId);
    ownSitioIdsByCert.set(certId, list);
  }

  const sharedSitioTargetsBySitio = new Map<string, CertificateShareLinkRef[]>();
  const sharedSitioLinksByTargetCert = new Map<
    string,
    Array<{ linkId: string; sitioId: string; numeroSitio: number }>
  >();

  for (const link of sitiosCompartidosRows) {
    const linkId = String(link.id || '');
    const sitioId = String(link.id_sitio || '');
    const targetCertId = String(link.id_certificado || '');
    const rawNum = Number(link.numero_sitio);
    const numeroSitio = Number.isFinite(rawNum) ? rawNum : 1;
    if (!linkId || !sitioId || !targetCertId) continue;

    const targetList = sharedSitioLinksByTargetCert.get(targetCertId) || [];
    if (!targetList.some((x) => x.sitioId === sitioId)) {
      targetList.push({ linkId, sitioId, numeroSitio });
      sharedSitioLinksByTargetCert.set(targetCertId, targetList);
    }

    const visibleTarget = visibleCertMetaById.get(targetCertId);
    if (visibleTarget) {
      const refs = sharedSitioTargetsBySitio.get(sitioId) || [];
      if (!refs.some((r) => r.targetCertId === targetCertId)) {
        refs.push({
          linkId,
          targetCertId,
          targetNumeroCertificado: visibleTarget.numero_certificado,
          targetOrganizacionNombre: visibleTarget.organizacion_nombre,
          targetNormaCodigo: visibleTarget.norma_codigo,
          numeroSitioAsignado: numeroSitio,
        });
        sharedSitioTargetsBySitio.set(sitioId, refs);
      }
    }
  }

  const procesosPorSitioByCertAndSitio = new Map<
    string,
    Array<{ id: string; id_certificado: string; id_sitio: string; id_proceso: string }>
  >();
  for (const row of procesosPorSitioRows) {
    const linkId = String(row.id || '');
    const sitioId = String(row.id_sitio || '');
    const procesoId = String(row.id_proceso || '');
    if (!linkId || !sitioId || !procesoId) continue;
    const rawCertId =
      row.id_certificado !== null && row.id_certificado !== undefined
        ? String(row.id_certificado).trim()
        : '';
    const inferredOwnerCertId = String(rawSitioById.get(sitioId)?.id_certificado || '');
    const ppsCertId = rawCertId || inferredOwnerCertId;
    if (!ppsCertId) continue;

    const key = `${ppsCertId}::${sitioId}`;
    const list = procesosPorSitioByCertAndSitio.get(key) || [];
    list.push({
      id: linkId,
      id_certificado: ppsCertId,
      id_sitio: sitioId,
      id_proceso: procesoId,
    });
    procesosPorSitioByCertAndSitio.set(key, list);
  }

  // ---------------------------------------------------------------------------
  // E. Turnos (`turnos_por_sitio` + `turno_certificado_compartido`)
  // ---------------------------------------------------------------------------
  interface NormalizedTpsLink {
    id: string;
    sitioId: string;
    ownerSiteCertId: string;
    sitioNombre: string;
    turnoId: string;
    hora_entrada: string;
    hora_salida: string;
    descripcion: string;
  }

  const tpsBySitioId = new Map<string, NormalizedTpsLink[]>();
  const ownedShiftsByCert = new Map<
    string,
    Map<
      string,
      {
        id: string;
        hora_entrada: string;
        hora_salida: string;
        descripcion: string;
        sitios: Set<string>;
      }
    >
  >();
  const ownerCertsByTurnoId = new Map<string, Set<string>>();

  for (const row of turnosPorSitioRows) {
    const tpsId = String(row.id || '');
    const sitioObj = (row.sitio as Record<string, unknown> | null) || null;
    const turnoObj = (row.turno as Record<string, unknown> | null) || null;
    const sitioId = String(row.id_sitio || sitioObj?.id || '');
    const turnoId = String(row.id_turno || turnoObj?.id || '');
    const rawSiteRow = rawSitioById.get(sitioId);
    const ownerSiteCertId = String(
      sitioObj?.id_certificado || rawSiteRow?.id_certificado || ''
    );
    if (!tpsId || !sitioId || !turnoId || !turnoObj) continue;

    const catMatch = shiftCatalog.find((t) => t.id === turnoId);
    const horaEntrada = String(
      turnoObj.hora_entrada || catMatch?.hora_entrada || '07:00:00'
    );
    const horaSalida = String(
      turnoObj.hora_salida || catMatch?.hora_salida || '15:00:00'
    );
    const descripcion =
      catMatch?.descripcion ||
      `Turno ${formatTurnoTime(horaEntrada)} – ${formatTurnoTime(horaSalida)}`;
    const sitioNombre = String(
      sitioObj?.nombre_sitio || rawSiteRow?.nombre_sitio || 'Sede Operativa'
    );

    const siteTpsList = tpsBySitioId.get(sitioId) || [];
    siteTpsList.push({
      id: tpsId,
      sitioId,
      ownerSiteCertId,
      sitioNombre,
      turnoId,
      hora_entrada: horaEntrada,
      hora_salida: horaSalida,
      descripcion,
    });
    tpsBySitioId.set(sitioId, siteTpsList);

    if (ownerSiteCertId) {
      const owners = ownerCertsByTurnoId.get(turnoId) || new Set<string>();
      owners.add(ownerSiteCertId);
      ownerCertsByTurnoId.set(turnoId, owners);

      const certShiftMap =
        ownedShiftsByCert.get(ownerSiteCertId) || new Map();
      const existing = certShiftMap.get(turnoId) || {
        id: turnoId,
        hora_entrada: horaEntrada,
        hora_salida: horaSalida,
        descripcion,
        sitios: new Set<string>(),
      };
      existing.sitios.add(sitioNombre);
      certShiftMap.set(turnoId, existing);
      ownedShiftsByCert.set(ownerSiteCertId, certShiftMap);
    }
  }

  const sharedTurnoTargetsByTurno = new Map<string, CertificateShareLinkRef[]>();
  const sharedTurnosByTargetCert = new Map<
    string,
    Array<{
      linkId: string;
      turnoId: string;
      originCertId: string | null;
      hora_entrada: string;
      hora_salida: string;
      descripcion: string;
    }>
  >();

  for (const link of turnosCompartidosRows) {
    const linkId = String(link.id || '');
    const turnoId = String(link.id_turno || '');
    const targetCertId = String(link.id_certificado || '');
    const originCertId =
      link.id_certificado_origen !== null &&
      link.id_certificado_origen !== undefined &&
      String(link.id_certificado_origen).trim() !== ''
        ? String(link.id_certificado_origen).trim()
        : null;
    if (!linkId || !turnoId || !targetCertId) continue;

    const turnoObj = (link.turno as Record<string, unknown> | null) || null;
    const catMatch = shiftCatalog.find((t) => t.id === turnoId);
    const horaEntrada = String(
      turnoObj?.hora_entrada || catMatch?.hora_entrada || '07:00:00'
    );
    const horaSalida = String(
      turnoObj?.hora_salida || catMatch?.hora_salida || '15:00:00'
    );
    const descripcion =
      catMatch?.descripcion ||
      `Turno ${formatTurnoTime(horaEntrada)} – ${formatTurnoTime(horaSalida)}`;

    const targetList = sharedTurnosByTargetCert.get(targetCertId) || [];
    if (!targetList.some((x) => x.turnoId === turnoId)) {
      targetList.push({
        linkId,
        turnoId,
        originCertId,
        hora_entrada: horaEntrada,
        hora_salida: horaSalida,
        descripcion,
      });
      sharedTurnosByTargetCert.set(targetCertId, targetList);
    }

    const visibleTarget = visibleCertMetaById.get(targetCertId);
    if (visibleTarget) {
      const refs = sharedTurnoTargetsByTurno.get(turnoId) || [];
      if (!refs.some((r) => r.targetCertId === targetCertId)) {
        refs.push({
          linkId,
          targetCertId,
          targetNumeroCertificado: visibleTarget.numero_certificado,
          targetOrganizacionNombre: visibleTarget.organizacion_nombre,
          targetNormaCodigo: visibleTarget.norma_codigo,
        });
        sharedTurnoTargetsByTurno.set(turnoId, refs);
      }
    }
  }

  // Assemble `sitiosByCert` and `turnosByCert` together so shared sites & shifts align strictly
  const sitiosByCert = new Map<string, SiteEntity[]>();
  const turnosByCert = new Map<string, ShiftEntity[]>();

  for (const cert of visibleCerts) {
    const certId = cert.id;
    const certProcs = procesosByCert.get(certId) || [];
    const procesosByIdForCert = new Map(certProcs.map((p) => [p.id, p]));

    // Build turns belonging to `certId` (own sites + shared shifts)
    const certShiftMap = new Map<string, ShiftEntity>();
    const certShiftIds = new Set<string>();

    const ownedMap = ownedShiftsByCert.get(certId);
    if (ownedMap) {
      for (const [turnoId, item] of ownedMap.entries()) {
        certShiftIds.add(turnoId);
        const targetRefs = (sharedTurnoTargetsByTurno.get(turnoId) || []).filter(
          (r) => r.targetCertId !== certId
        );
        certShiftMap.set(turnoId, {
          id: turnoId,
          hora_entrada: item.hora_entrada,
          hora_salida: item.hora_salida,
          descripcion: item.descripcion,
          empleados_activos: 0,
          sitios_vinculados: Array.from(item.sitios),
          ownerCertId: certId,
          sharedFromCertId: null,
          sharedFromCertLabel: null,
          sharedTargets: targetRefs.length > 0 ? targetRefs : undefined,
        });
      }
    }

    for (const sTurno of sharedTurnosByTargetCert.get(certId) || []) {
      certShiftIds.add(sTurno.turnoId);
      if (certShiftMap.has(sTurno.turnoId)) continue;
      const inferredOrigin =
        sTurno.originCertId ||
        Array.from(ownerCertsByTurnoId.get(sTurno.turnoId) || []).find(
          (c) => c !== certId
        ) ||
        null;
      const isShared = !inferredOrigin || inferredOrigin !== certId;
      const targetRefs = (sharedTurnoTargetsByTurno.get(sTurno.turnoId) || []).filter(
        (r) => r.targetCertId !== inferredOrigin
      );
      certShiftMap.set(sTurno.turnoId, {
        id: sTurno.turnoId,
        hora_entrada: sTurno.hora_entrada,
        hora_salida: sTurno.hora_salida,
        descripcion: sTurno.descripcion,
        empleados_activos: 0,
        sitios_vinculados: [],
        ownerCertId: inferredOrigin || undefined,
        sharedFromCertId: isShared ? inferredOrigin : null,
        sharedFromCertLabel: isShared
          ? buildOriginCertLabel(inferredOrigin, visibleCertMetaById)
          : null,
        sharedTargets: targetRefs.length > 0 ? targetRefs : undefined,
      });
    }

    // Build sites belonging to `certId` (own + `sitio_certificado_compartido`)
    const certSites: SiteEntity[] = [];
    const seenSiteIds = new Set<string>();

    const buildSiteEntity = (
      row: Record<string, unknown>,
      overrideNumeroSitio?: number
    ): SiteEntity => {
      const sitioId = String(row.id || '');
      const ownerCertId = String(row.id_certificado || '');
      const rawNumero =
        overrideNumeroSitio !== undefined
          ? overrideNumeroSitio
          : Number(row.numero_sitio);
      const numeroSitio = Number.isFinite(rawNumero) ? rawNumero : 0;
      const rawPersonal = Number(row.personal_count);
      const personalCount =
        row.personal_count !== null &&
        row.personal_count !== undefined &&
        Number.isFinite(rawPersonal)
          ? rawPersonal
          : undefined;

      const isSharedFromAnother = Boolean(ownerCertId && ownerCertId !== certId);

      // Scoped `procesos_por_sitio` strictly matching `certId`
      const dbPpsLinks =
        procesosPorSitioByCertAndSitio.get(`${certId}::${sitioId}`) || [];
      const hydratedPps: ProcesoPorSitioLink[] = [];
      for (const dbLink of dbPpsLinks) {
        const matchedProc = procesosByIdForCert.get(dbLink.id_proceso);
        if (!matchedProc) continue;
        hydratedPps.push({
          id: dbLink.id,
          id_certificado: certId,
          id_sitio: sitioId,
          id_proceso: matchedProc.id,
          nombre_proceso: matchedProc.nombre_proceso,
          tipo_proceso: matchedProc.tipo,
          clausulas_cubiertas: [...matchedProc.clausulas_cubiertas],
          requisitos_detalle: matchedProc.requisitos_detalle
            ? [...matchedProc.requisitos_detalle]
            : undefined,
          deleted_at: null,
        });
      }

      // Scoped `turnos_por_sitio` (include all for own sites; for shared sites only shifts present in `certShiftIds`)
      const siteTpsRows = tpsBySitioId.get(sitioId) || [];
      const hydratedTps: TurnoPorSitioLink[] = [];
      const turnosLabels: string[] = [];
      for (const tps of siteTpsRows) {
        if (isSharedFromAnother && !certShiftIds.has(tps.turnoId)) {
          continue;
        }
        if (
          !hydratedTps.some(
            (existing) =>
              existing.id === tps.id || existing.id_turno === tps.turnoId
          )
        ) {
          hydratedTps.push({
            id: tps.id,
            id_sitio: sitioId,
            id_turno: tps.turnoId,
            hora_entrada: tps.hora_entrada,
            hora_salida: tps.hora_salida,
            descripcion: tps.descripcion,
            deleted_at: null,
          });
        }
        if (!turnosLabels.includes(tps.descripcion)) {
          turnosLabels.push(tps.descripcion);
        }
        const certShift = certShiftMap.get(tps.turnoId);
        const siteName = String(row.nombre_sitio || 'Sede Operativa');
        if (certShift && !certShift.sitios_vinculados.includes(siteName)) {
          certShift.sitios_vinculados.push(siteName);
        }
      }

      return {
        id: sitioId,
        id_certificado: ownerCertId || certId,
        numero_sitio: numeroSitio,
        nombre_sitio: String(row.nombre_sitio || 'Sede Operativa'),
        direccion_sitio: String(row.direccion_sitio || ''),
        personal_count: personalCount,
        tipo_sitio: numeroSitio === 0 ? 'Principal (HQ)' : 'Sucursal',
        turnos_vinculados: turnosLabels,
        turnos_por_sitio: hydratedTps,
        procesos_por_sitio: hydratedPps,
        procesos_vinculados: hydratedPps.map((p) => p.nombre_proceso),
        ownerCertId: ownerCertId || certId,
        sharedFromCertId: isSharedFromAnother ? ownerCertId : null,
        sharedFromCertLabel: isSharedFromAnother
          ? buildOriginCertLabel(ownerCertId, visibleCertMetaById)
          : null,
        sharedTargets: sharedSitioTargetsBySitio.get(sitioId),
      };
    };

    for (const sitioId of ownSitioIdsByCert.get(certId) || []) {
      const row = rawSitioById.get(sitioId);
      if (!row || seenSiteIds.has(sitioId)) continue;
      seenSiteIds.add(sitioId);
      certSites.push(buildSiteEntity(row));
    }

    for (const sLink of sharedSitioLinksByTargetCert.get(certId) || []) {
      if (seenSiteIds.has(sLink.sitioId)) continue;
      const row = rawSitioById.get(sLink.sitioId);
      if (!row) continue;
      seenSiteIds.add(sLink.sitioId);
      certSites.push(buildSiteEntity(row, sLink.numeroSitio));
    }

    certSites.sort((a, b) => a.numero_sitio - b.numero_sitio);
    sitiosByCert.set(certId, certSites);
    turnosByCert.set(certId, Array.from(certShiftMap.values()));
  }

  return {
    contactosByCert,
    sitiosByCert,
    procesosByCert,
    turnosByCert,
  };
}
