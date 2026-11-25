import { isApprovedStaffProfile } from './accessControl';
import {
  EXPERTO_DISPONIBILIDAD_VALUES,
  normalizeExpertoDisponibilidad,
  validateExpertoCompetenciaDraft,
  validateExpertoEmailDraft,
  validateExpertoFormDraft,
  validateExpertoTelefonoDraft,
  type ExpertoAuditHistorialItem,
  type ExpertoCompetenciaFormDraft,
  type ExpertoDisponibilidad,
  type ExpertoEmailFormDraft,
  type ExpertoEmailItem,
  type ExpertoSectorLink,
  type ExpertoSubsectorLink,
  type ExpertoTecnicoDetailEntity,
  type ExpertoTecnicoFormDraft,
  type ExpertoTelefonoFormDraft,
  type ExpertoTelefonoItem,
} from './expertoTecnicoDomain';
import {
  resolveSectorIafDescription,
  type SectorIafEntity,
  type SubsectorIafEntity,
} from './extraDomain';
import { translateDatabaseError, type UserProfile } from './healthCheck';
import { assertValidUuid } from './zeroUuid';
import type { ExpertoTecnicoAuditoriaEntity } from './auditExecution';
import { validateExpertoAuditoriaAssignmentDraft } from './asignacionDomain';
import { roundAuditDaysQuarter } from './auditPlanningEngine';

const UUID_GLOBAL_REGEX =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

export interface ExpertoDbErrorLike {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

export interface ExpertoQueryResponse<T = Array<Record<string, unknown>>> {
  data: T | null;
  error: ExpertoDbErrorLike | null;
}

export interface ExpertoSingleResponse {
  data: Record<string, unknown> | null;
  error: ExpertoDbErrorLike | null;
}

export interface ExpertoMutationBuilder {
  single(): PromiseLike<ExpertoSingleResponse>;
  maybeSingle(): PromiseLike<ExpertoSingleResponse>;
  then<TResult1 = ExpertoQueryResponse, TResult2 = never>(
    onfulfilled?:
      | ((value: ExpertoQueryResponse) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2>;
}

export interface ExpertoSelectBuilder extends ExpertoMutationBuilder {
  eq(column: string, value: string): ExpertoSelectBuilder;
  is(column: string, value: null): ExpertoSelectBuilder;
  order(column: string, options?: { ascending?: boolean }): ExpertoSelectBuilder;
  limit(count: number): ExpertoSelectBuilder;
}

export interface ExpertoInsertBuilder {
  select(columns?: string): ExpertoMutationBuilder;
  then<TResult1 = ExpertoQueryResponse, TResult2 = never>(
    onfulfilled?:
      | ((value: ExpertoQueryResponse) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2>;
}

export interface ExpertoUpdateBuilder {
  eq(column: string, value: string): ExpertoUpdateBuilder;
  is(column: string, value: null): ExpertoUpdateBuilder;
  select(columns?: string): ExpertoMutationBuilder;
  then<TResult1 = ExpertoQueryResponse, TResult2 = never>(
    onfulfilled?:
      | ((value: ExpertoQueryResponse) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<ExpertoQueryResponse | TResult1 | TResult2>;
}

export interface ExpertoDeleteBuilder {
  eq(column: string, value: string): ExpertoDeleteBuilder;
  match(query: Record<string, string>): ExpertoDeleteBuilder;
  then<TResult1 = ExpertoQueryResponse, TResult2 = never>(
    onfulfilled?:
      | ((value: ExpertoQueryResponse) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2>;
}

export interface ExpertoTableClient {
  select(columns: string): ExpertoSelectBuilder;
  insert(
    values: Record<string, unknown> | Array<Record<string, unknown>>
  ): ExpertoInsertBuilder;
  update(values: Record<string, unknown>): ExpertoUpdateBuilder;
  delete(): ExpertoDeleteBuilder;
}

export interface ExpertoSupabaseClient {
  from(table: string): ExpertoTableClient;
}

export interface ExpertoPersistenceResult<T = undefined> {
  ok: boolean;
  data?: T;
  error?: string;
}

function stripRawUuids(text: string): string {
  return text.replace(UUID_GLOBAL_REGEX, 'Referencia registrada').replace(/\s+/g, ' ').trim();
}

export function formatExpertoZeroUuidError(
  err: unknown,
  fallback = 'No se pudo completar la operación del experto técnico.'
): string {
  const translated = translateDatabaseError(err);
  if (err instanceof Error && err.message.trim()) {
    const raw = err.message.trim();
    const chosen = translated && translated !== raw ? translated : raw;
    return stripRawUuids(chosen) || fallback;
  }
  return stripRawUuids(translated || fallback) || fallback;
}

export function assertApprovedStaffForExpertoMutation(
  profile: UserProfile | null | undefined
): { ok: true } | { ok: false; error: string } {
  if (!isApprovedStaffProfile(profile)) {
    return {
      ok: false,
      error:
        'Acceso denegado: solo personal aprobado (ADMIN o WORKER) puede gestionar expertos técnicos.',
    };
  }
  return { ok: true };
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function resolveJoinedSectorNumber(
  rawSector: unknown,
  fallbackSubCode?: string
): number {
  if (isObjectRecord(rawSector) && rawSector.sector !== undefined) {
    const parsed = Number(rawSector.sector);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  if (fallbackSubCode) {
    const parsedPrefix = Number(fallbackSubCode.split('.')[0]);
    if (Number.isFinite(parsedPrefix) && parsedPrefix > 0) return parsedPrefix;
  }
  return 0;
}

export function assembleExpertoEntitiesFromRows(params: {
  expertoRows: ReadonlyArray<Record<string, unknown>>;
  telefonoRows?: ReadonlyArray<Record<string, unknown>>;
  emailRows?: ReadonlyArray<Record<string, unknown>>;
  sectorLinkRows?: ReadonlyArray<Record<string, unknown>>;
  subsectorLinkRows?: ReadonlyArray<Record<string, unknown>>;
  auditoriaLinkRows?: ReadonlyArray<Record<string, unknown>>;
  sectoresCatalog?: ReadonlyArray<Pick<SectorIafEntity, 'id' | 'sector' | 'descripcion'>>;
  subsectoresCatalog?: ReadonlyArray<
    Pick<
      SubsectorIafEntity,
      'id' | 'id_sector_iaf' | 'sector_numero' | 'codigo' | 'descripcion' | 'categoria_riesgo'
    >
  >;
}): ExpertoTecnicoDetailEntity[] {
  const {
    expertoRows,
    telefonoRows = [],
    emailRows = [],
    sectorLinkRows = [],
    subsectorLinkRows = [],
    auditoriaLinkRows = [],
    sectoresCatalog = [],
    subsectoresCatalog = [],
  } = params;

  const sectorCatalogById = new Map<
    string,
    Pick<SectorIafEntity, 'id' | 'sector' | 'descripcion'>
  >();
  for (const s of sectoresCatalog) {
    sectorCatalogById.set(s.id, s);
  }
  const subsectorCatalogById = new Map<
    string,
    Pick<
      SubsectorIafEntity,
      'id' | 'id_sector_iaf' | 'sector_numero' | 'codigo' | 'descripcion' | 'categoria_riesgo'
    >
  >();
  for (const sub of subsectoresCatalog) {
    subsectorCatalogById.set(sub.id, sub);
  }

  const telefonosByExperto = new Map<string, ExpertoTelefonoItem[]>();
  for (const row of telefonoRows) {
    if (row.deleted_at) continue;
    const idExp = String(row.id_experto_tecnico || '').trim();
    const id = String(row.id || '').trim();
    const tel = String(row.telefono || '').trim();
    if (!idExp || !id || !tel) continue;
    const list = telefonosByExperto.get(idExp) || [];
    list.push({
      id,
      id_experto_tecnico: idExp,
      telefono: tel,
      tipo_telefono: String(row.tipo_telefono || 'Móvil').trim() || 'Móvil',
      created_at: row.created_at ? String(row.created_at) : undefined,
      updated_at: row.updated_at ? String(row.updated_at) : undefined,
      deleted_at: null,
    });
    telefonosByExperto.set(idExp, list);
  }

  const emailsByExperto = new Map<string, ExpertoEmailItem[]>();
  for (const row of emailRows) {
    if (row.deleted_at) continue;
    const idExp = String(row.id_experto_tecnico || '').trim();
    const id = String(row.id || '').trim();
    const email = String(row.email || '').trim();
    if (!idExp || !id || !email) continue;
    const list = emailsByExperto.get(idExp) || [];
    list.push({
      id,
      id_experto_tecnico: idExp,
      email,
      tipo_email: String(row.tipo_email || 'Trabajo').trim() || 'Trabajo',
      created_at: row.created_at ? String(row.created_at) : undefined,
      updated_at: row.updated_at ? String(row.updated_at) : undefined,
      deleted_at: null,
    });
    emailsByExperto.set(idExp, list);
  }

  const sectorsByExperto = new Map<string, ExpertoSectorLink[]>();
  for (const row of sectorLinkRows) {
    const idExp = String(row.id_experto_tecnico || '').trim();
    const innerSector = isObjectRecord(row.sector) ? row.sector : null;
    if (innerSector && innerSector.deleted_at) continue;
    const idSector = String(innerSector?.id || row.id_sector_iaf || '').trim();
    if (!idExp || !idSector) continue;
    const catMatch = sectorCatalogById.get(idSector);
    const sectorNum = resolveJoinedSectorNumber(innerSector) || catMatch?.sector || 0;
    if (sectorNum <= 0) continue;
    const existing = sectorsByExperto.get(idExp) || [];
    if (existing.some((item) => item.id_sector_iaf === idSector)) continue;
    existing.push({
      id_experto_tecnico: idExp,
      id_sector_iaf: idSector,
      sector_numero: sectorNum,
      sector_descripcion:
        (innerSector?.descripcion ? String(innerSector.descripcion) : '') ||
        catMatch?.descripcion ||
        resolveSectorIafDescription(sectorNum),
      created_at: row.created_at ? String(row.created_at) : undefined,
    });
    sectorsByExperto.set(idExp, existing);
  }

  const subsectorsByExperto = new Map<string, ExpertoSubsectorLink[]>();
  for (const row of subsectorLinkRows) {
    const idExp = String(row.id_experto_tecnico || '').trim();
    const innerSub = isObjectRecord(row.subsector) ? row.subsector : null;
    if (innerSub && innerSub.deleted_at) continue;
    const idSub = String(innerSub?.id || row.id_subsector_iaf || '').trim();
    if (!idExp || !idSub) continue;
    const catMatch = subsectorCatalogById.get(idSub);
    const subCode = String(innerSub?.codigo || catMatch?.codigo || '').trim();
    if (!subCode) continue;
    const idSector = String(
      innerSub?.id_sector_iaf || catMatch?.id_sector_iaf || ''
    ).trim();
    const sectorParent = idSector ? sectorCatalogById.get(idSector) : undefined;
    const sectorNum =
      resolveJoinedSectorNumber(innerSub?.sector, subCode) || sectorParent?.sector || 0;
    const existing = subsectorsByExperto.get(idExp) || [];
    if (existing.some((item) => item.id_subsector_iaf === idSub)) continue;
    existing.push({
      id_experto_tecnico: idExp,
      id_subsector_iaf: idSub,
      id_sector_iaf: idSector,
      sector_numero: sectorNum,
      subsector_codigo: subCode,
      subsector_descripcion: String(
        innerSub?.descripcion || catMatch?.descripcion || 'Sub-Sector IAF'
      ),
      categoria_riesgo: innerSub?.categoria_riesgo
        ? String(innerSub.categoria_riesgo)
        : catMatch?.categoria_riesgo,
      created_at: row.created_at ? String(row.created_at) : undefined,
    });
    subsectorsByExperto.set(idExp, existing);
  }

  const auditsByExperto = new Map<string, ExpertoAuditHistorialItem[]>();
  for (const row of auditoriaLinkRows) {
    if (row.deleted_at) continue;
    const idExp = String(row.id_experto_tecnico || '').trim();
    const idLink = String(row.id || '').trim();
    const idAud = String(row.id_auditoria || '').trim();
    const innerAud = isObjectRecord(row.auditoria) ? row.auditoria : null;
    if (!idExp || !idLink || !idAud || (innerAud && innerAud.deleted_at)) continue;

    const certObj = isObjectRecord(innerAud?.certificado) ? innerAud.certificado : null;
    const orgObj = isObjectRecord(certObj?.organizacion) ? certObj.organizacion : null;
    const tipoObj = isObjectRecord(innerAud?.tipo_auditoria)
      ? innerAud.tipo_auditoria
      : null;

    const list = auditsByExperto.get(idExp) || [];
    list.push({
      id: idLink,
      id_auditoria: idAud,
      id_experto_tecnico: idExp,
      codigo_auditoria: String(innerAud?.codigo_auditoria || 'Auditoría'),
      organizacion_nombre: String(orgObj?.nombre || 'Organización Cliente'),
      numero_certificado: String(certObj?.numero_certificado || 'Certificado'),
      dias_asignados: Number(row.dias_asignados ?? 0) || 0,
      observacion: row.observacion ? String(row.observacion) : null,
      estatus: innerAud?.estado_ciclo ? String(innerAud.estado_ciclo) : undefined,
      tipo_auditoria: tipoObj?.tipo ? String(tipoObj.tipo) : undefined,
      deleted_at: null,
    });
    auditsByExperto.set(idExp, list);
  }

  return expertoRows
    .filter((row) => !row.deleted_at)
    .map((row) => {
      const id = String(row.id || '').trim();
      const rawStatus = String(row.estatus || 'Disponible').trim();
      const estatus: ExpertoDisponibilidad = EXPERTO_DISPONIBILIDAD_VALUES.includes(
        rawStatus as ExpertoDisponibilidad
      )
        ? (rawStatus as ExpertoDisponibilidad)
        : normalizeExpertoDisponibilidad(rawStatus);

      const sectorLinks = [...(sectorsByExperto.get(id) || [])].sort(
        (a, b) => a.sector_numero - b.sector_numero
      );
      const subsectorLinks = [...(subsectorsByExperto.get(id) || [])].sort((a, b) =>
        a.subsector_codigo.localeCompare(b.subsector_codigo, 'es', { numeric: true })
      );

      return {
        id,
        nombre: String(row.nombre || 'Experto Técnico').trim(),
        estatus,
        notas: row.notas ? String(row.notas) : null,
        telefonos: telefonosByExperto.get(id) || [],
        emails: emailsByExperto.get(id) || [],
        sectorLinks,
        subsectorLinks,
        historialAuditorias: auditsByExperto.get(id) || [],
        created_at: row.created_at ? String(row.created_at) : undefined,
        updated_at: row.updated_at ? String(row.updated_at) : undefined,
        deleted_at: null,
      };
    });
}

export async function hydrateExpertosTecnicosFromSupabase(
  client: ExpertoSupabaseClient,
  sectoresCatalog: ReadonlyArray<Pick<SectorIafEntity, 'id' | 'sector' | 'descripcion'>> = [],
  subsectoresCatalog: ReadonlyArray<
    Pick<
      SubsectorIafEntity,
      'id' | 'id_sector_iaf' | 'sector_numero' | 'codigo' | 'descripcion' | 'categoria_riesgo'
    >
  > = []
): Promise<ExpertoPersistenceResult<ExpertoTecnicoDetailEntity[]>> {
  try {
    const [expRes, telRes, emailRes, secRes, subRes, audRes] = await Promise.all([
      client
        .from('experto_tecnico')
        .select('id, nombre, estatus, notas, created_at, updated_at, deleted_at')
        .is('deleted_at', null)
        .order('nombre', { ascending: true }),
      client
        .from('telefono_experto_tecnico')
        .select('id, id_experto_tecnico, telefono, tipo_telefono, created_at, updated_at, deleted_at')
        .is('deleted_at', null)
        .order('created_at', { ascending: true }),
      client
        .from('email_experto_tecnico')
        .select('id, id_experto_tecnico, email, tipo_email, created_at, updated_at, deleted_at')
        .is('deleted_at', null)
        .order('created_at', { ascending: true }),
      client
        .from('sector_iaf_experto')
        .select(
          'id_experto_tecnico, id_sector_iaf, created_at, sector:id_sector_iaf ( id, sector, descripcion, deleted_at )'
        ),
      client
        .from('subsector_iaf_experto')
        .select(
          'id_experto_tecnico, id_subsector_iaf, created_at, subsector:id_subsector_iaf ( id, id_sector_iaf, codigo, descripcion, categoria_riesgo, deleted_at )'
        ),
      client
        .from('experto_tecnico_auditoria')
        .select(
          'id, id_auditoria, id_experto_tecnico, dias_asignados, observacion, deleted_at, auditoria:id_auditoria ( id, codigo_auditoria, estado_ciclo, deleted_at, tipo_auditoria:id_tipo_auditoria ( tipo ), certificado:id_certificado ( numero_certificado, organizacion:id_organizacion ( nombre ) ) )'
        )
        .is('deleted_at', null),
    ]);

    if (expRes.error) {
      return {
        ok: false,
        error: formatExpertoZeroUuidError(
          expRes.error,
          'No se pudo cargar el catálogo de expertos técnicos.'
        ),
      };
    }

    const assembled = assembleExpertoEntitiesFromRows({
      expertoRows: Array.isArray(expRes.data) ? expRes.data : [],
      telefonoRows: !telRes.error && Array.isArray(telRes.data) ? telRes.data : [],
      emailRows: !emailRes.error && Array.isArray(emailRes.data) ? emailRes.data : [],
      sectorLinkRows: !secRes.error && Array.isArray(secRes.data) ? secRes.data : [],
      subsectorLinkRows: !subRes.error && Array.isArray(subRes.data) ? subRes.data : [],
      auditoriaLinkRows: !audRes.error && Array.isArray(audRes.data) ? audRes.data : [],
      sectoresCatalog,
      subsectoresCatalog,
    });

    return { ok: true, data: assembled };
  } catch (err) {
    return {
      ok: false,
      error: formatExpertoZeroUuidError(
        err,
        'No se pudo cargar el catálogo de expertos técnicos.'
      ),
    };
  }
}

export async function createExpertoTecnico(params: {
  client: ExpertoSupabaseClient;
  profile: UserProfile | null | undefined;
  draft: ExpertoTecnicoFormDraft;
  existingExpertos: ReadonlyArray<Pick<ExpertoTecnicoDetailEntity, 'id' | 'nombre' | 'deleted_at'>>;
  newId?: string;
}): Promise<ExpertoPersistenceResult<ExpertoTecnicoDetailEntity>> {
  const auth = assertApprovedStaffForExpertoMutation(params.profile);
  if (!auth.ok) return auth;

  const validation = validateExpertoFormDraft(params.draft, params.existingExpertos);
  if (!validation.valid) {
    return { ok: false, error: validation.message || 'Verifique los datos del experto técnico.' };
  }

  let expertoId: string;
  try {
    expertoId = assertValidUuid(params.newId || crypto.randomUUID(), 'experto técnico');
  } catch (err) {
    return { ok: false, error: formatExpertoZeroUuidError(err) };
  }

  const norm = validation.normalized;
  try {
    const { data, error } = await params.client
      .from('experto_tecnico')
      .insert({
        id: expertoId,
        nombre: norm.nombre,
        estatus: norm.estatus,
        notas: norm.notas,
      })
      .select('id, nombre, estatus, notas, created_at, updated_at')
      .single();

    if (error) {
      return {
        ok: false,
        error: formatExpertoZeroUuidError(error, 'No se pudo crear el experto técnico.'),
      };
    }

    const row = data || {};
    return {
      ok: true,
      data: {
        id: String(row.id || expertoId),
        nombre: String(row.nombre || norm.nombre),
        estatus: normalizeExpertoDisponibilidad(row.estatus || norm.estatus),
        notas: row.notas !== undefined ? (row.notas ? String(row.notas) : null) : norm.notas,
        telefonos: [],
        emails: [],
        sectorLinks: [],
        subsectorLinks: [],
        historialAuditorias: [],
        created_at: row.created_at ? String(row.created_at) : undefined,
        updated_at: row.updated_at ? String(row.updated_at) : undefined,
        deleted_at: null,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: formatExpertoZeroUuidError(err, 'No se pudo crear el experto técnico.'),
    };
  }
}

export async function updateExpertoTecnico(params: {
  client: ExpertoSupabaseClient;
  profile: UserProfile | null | undefined;
  expertoId: string;
  draft: ExpertoTecnicoFormDraft;
  existingExpertos: ReadonlyArray<Pick<ExpertoTecnicoDetailEntity, 'id' | 'nombre' | 'deleted_at'>>;
}): Promise<
  ExpertoPersistenceResult<{ nombre: string; estatus: ExpertoDisponibilidad; notas: string | null }>
> {
  const auth = assertApprovedStaffForExpertoMutation(params.profile);
  if (!auth.ok) return auth;

  let cleanExpertoId: string;
  try {
    cleanExpertoId = assertValidUuid(params.expertoId, 'experto técnico');
  } catch (err) {
    return { ok: false, error: formatExpertoZeroUuidError(err) };
  }

  const validation = validateExpertoFormDraft(
    params.draft,
    params.existingExpertos,
    cleanExpertoId
  );
  if (!validation.valid) {
    return { ok: false, error: validation.message || 'Verifique los datos del experto técnico.' };
  }

  const norm = validation.normalized;
  try {
    const { error } = await params.client
      .from('experto_tecnico')
      .update({
        nombre: norm.nombre,
        estatus: norm.estatus,
        notas: norm.notas,
        updated_at: new Date().toISOString(),
      })
      .eq('id', cleanExpertoId)
      .is('deleted_at', null);

    if (error) {
      return {
        ok: false,
        error: formatExpertoZeroUuidError(error, 'No se pudo actualizar el experto técnico.'),
      };
    }

    return { ok: true, data: norm };
  } catch (err) {
    return {
      ok: false,
      error: formatExpertoZeroUuidError(err, 'No se pudo actualizar el experto técnico.'),
    };
  }
}

export async function addExpertoTelefono(params: {
  client: ExpertoSupabaseClient;
  profile: UserProfile | null | undefined;
  expertoId: string;
  draft: ExpertoTelefonoFormDraft;
  existingTelefonos: ReadonlyArray<Pick<ExpertoTelefonoItem, 'telefono' | 'deleted_at'>>;
  newId?: string;
}): Promise<ExpertoPersistenceResult<ExpertoTelefonoItem>> {
  const auth = assertApprovedStaffForExpertoMutation(params.profile);
  if (!auth.ok) return auth;

  let cleanExpertoId: string;
  let phoneId: string;
  try {
    cleanExpertoId = assertValidUuid(params.expertoId, 'experto técnico');
    phoneId = assertValidUuid(params.newId || crypto.randomUUID(), 'teléfono');
  } catch (err) {
    return { ok: false, error: formatExpertoZeroUuidError(err) };
  }

  const validation = validateExpertoTelefonoDraft(params.draft, params.existingTelefonos);
  if (!validation.valid) {
    return { ok: false, error: validation.message || 'Verifique el número telefónico.' };
  }

  try {
    const { data, error } = await params.client
      .from('telefono_experto_tecnico')
      .insert({
        id: phoneId,
        id_experto_tecnico: cleanExpertoId,
        telefono: validation.normalized.telefono,
        tipo_telefono: validation.normalized.tipo_telefono,
      })
      .select('id, id_experto_tecnico, telefono, tipo_telefono, created_at, updated_at')
      .single();

    if (error) {
      return {
        ok: false,
        error: formatExpertoZeroUuidError(error, 'No se pudo registrar el teléfono del experto.'),
      };
    }

    const row = data || {};
    return {
      ok: true,
      data: {
        id: String(row.id || phoneId),
        id_experto_tecnico: cleanExpertoId,
        telefono: String(row.telefono || validation.normalized.telefono),
        tipo_telefono: String(row.tipo_telefono || validation.normalized.tipo_telefono),
        created_at: row.created_at ? String(row.created_at) : undefined,
        updated_at: row.updated_at ? String(row.updated_at) : undefined,
        deleted_at: null,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: formatExpertoZeroUuidError(err, 'No se pudo registrar el teléfono del experto.'),
    };
  }
}

export async function archiveExpertoTelefono(params: {
  client: ExpertoSupabaseClient;
  profile: UserProfile | null | undefined;
  telefonoId: string;
}): Promise<ExpertoPersistenceResult<{ id: string }>> {
  const auth = assertApprovedStaffForExpertoMutation(params.profile);
  if (!auth.ok) return auth;

  let cleanPhoneId: string;
  try {
    cleanPhoneId = assertValidUuid(params.telefonoId, 'teléfono');
  } catch (err) {
    return { ok: false, error: formatExpertoZeroUuidError(err) };
  }

  try {
    // telefono_experto_tecnico has deleted_at & deleted_by (no delete_reason column)
    const { error } = await params.client
      .from('telefono_experto_tecnico')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: params.profile?.id || null,
      })
      .eq('id', cleanPhoneId)
      .is('deleted_at', null);

    if (error) {
      return {
        ok: false,
        error: formatExpertoZeroUuidError(error, 'No se pudo archivar el teléfono.'),
      };
    }

    return { ok: true, data: { id: cleanPhoneId } };
  } catch (err) {
    return {
      ok: false,
      error: formatExpertoZeroUuidError(err, 'No se pudo archivar el teléfono.'),
    };
  }
}

export async function addExpertoEmail(params: {
  client: ExpertoSupabaseClient;
  profile: UserProfile | null | undefined;
  expertoId: string;
  draft: ExpertoEmailFormDraft;
  existingEmails: ReadonlyArray<Pick<ExpertoEmailItem, 'email' | 'deleted_at'>>;
  newId?: string;
}): Promise<ExpertoPersistenceResult<ExpertoEmailItem>> {
  const auth = assertApprovedStaffForExpertoMutation(params.profile);
  if (!auth.ok) return auth;

  let cleanExpertoId: string;
  let emailId: string;
  try {
    cleanExpertoId = assertValidUuid(params.expertoId, 'experto técnico');
    emailId = assertValidUuid(params.newId || crypto.randomUUID(), 'correo electrónico');
  } catch (err) {
    return { ok: false, error: formatExpertoZeroUuidError(err) };
  }

  const validation = validateExpertoEmailDraft(params.draft, params.existingEmails);
  if (!validation.valid) {
    return { ok: false, error: validation.message || 'Verifique el correo electrónico.' };
  }

  try {
    const { data, error } = await params.client
      .from('email_experto_tecnico')
      .insert({
        id: emailId,
        id_experto_tecnico: cleanExpertoId,
        email: validation.normalized.email,
        tipo_email: validation.normalized.tipo_email,
      })
      .select('id, id_experto_tecnico, email, tipo_email, created_at, updated_at')
      .single();

    if (error) {
      return {
        ok: false,
        error: formatExpertoZeroUuidError(error, 'No se pudo registrar el correo del experto.'),
      };
    }

    const row = data || {};
    return {
      ok: true,
      data: {
        id: String(row.id || emailId),
        id_experto_tecnico: cleanExpertoId,
        email: String(row.email || validation.normalized.email),
        tipo_email: String(row.tipo_email || validation.normalized.tipo_email),
        created_at: row.created_at ? String(row.created_at) : undefined,
        updated_at: row.updated_at ? String(row.updated_at) : undefined,
        deleted_at: null,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: formatExpertoZeroUuidError(err, 'No se pudo registrar el correo del experto.'),
    };
  }
}

export async function archiveExpertoEmail(params: {
  client: ExpertoSupabaseClient;
  profile: UserProfile | null | undefined;
  emailId: string;
}): Promise<ExpertoPersistenceResult<{ id: string }>> {
  const auth = assertApprovedStaffForExpertoMutation(params.profile);
  if (!auth.ok) return auth;

  let cleanEmailId: string;
  try {
    cleanEmailId = assertValidUuid(params.emailId, 'correo electrónico');
  } catch (err) {
    return { ok: false, error: formatExpertoZeroUuidError(err) };
  }

  try {
    // email_experto_tecnico has deleted_at & deleted_by (no delete_reason column)
    const { error } = await params.client
      .from('email_experto_tecnico')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: params.profile?.id || null,
      })
      .eq('id', cleanEmailId)
      .is('deleted_at', null);

    if (error) {
      return {
        ok: false,
        error: formatExpertoZeroUuidError(error, 'No se pudo archivar el correo electrónico.'),
      };
    }

    return { ok: true, data: { id: cleanEmailId } };
  } catch (err) {
    return {
      ok: false,
      error: formatExpertoZeroUuidError(err, 'No se pudo archivar el correo electrónico.'),
    };
  }
}

export async function linkExpertoCompetencia(params: {
  client: ExpertoSupabaseClient;
  profile: UserProfile | null | undefined;
  experto: ExpertoTecnicoDetailEntity;
  draft: ExpertoCompetenciaFormDraft;
  sectores: ReadonlyArray<SectorIafEntity>;
  subsectores: ReadonlyArray<SubsectorIafEntity>;
}): Promise<ExpertoPersistenceResult<ExpertoCompetenciaFormDraft>> {
  const auth = assertApprovedStaffForExpertoMutation(params.profile);
  if (!auth.ok) return auth;

  const validation = validateExpertoCompetenciaDraft({
    draft: params.draft,
    experto: params.experto,
    sectores: params.sectores.map((s) => ({
      id: s.id,
      sector: s.sector,
      descripcion: s.descripcion,
    })),
    subsectores: params.subsectores.map((sub) => ({
      id: sub.id,
      id_sector_iaf: sub.id_sector_iaf,
      sector_numero: sub.sector_numero,
      codigo: sub.codigo,
      descripcion: sub.descripcion,
      categoria_riesgo: sub.categoria_riesgo,
    })),
  });

  if (!validation.valid || !validation.normalized) {
    return {
      ok: false,
      error: validation.message || 'Verifique los datos de la competencia IAF.',
    };
  }

  const norm = validation.normalized;
  try {
    if (norm.tipo === 'sector_iaf') {
      const { error } = await params.client
        .from('sector_iaf_experto')
        .insert({
          id_experto_tecnico: norm.id_experto_tecnico,
          id_sector_iaf: norm.id_sector_iaf,
        });
      if (error) {
        return {
          ok: false,
          error: formatExpertoZeroUuidError(error, 'No se pudo vincular el Sector IAF.'),
        };
      }
      return { ok: true, data: norm };
    }

    const { error } = await params.client
      .from('subsector_iaf_experto')
      .insert({
        id_experto_tecnico: norm.id_experto_tecnico,
        id_subsector_iaf: norm.id_subsector_iaf,
      });
    if (error) {
      return {
        ok: false,
        error: formatExpertoZeroUuidError(error, 'No se pudo vincular el Sub-Sector IAF.'),
      };
    }
    return { ok: true, data: norm };
  } catch (err) {
    return {
      ok: false,
      error: formatExpertoZeroUuidError(err, 'No se pudo vincular la competencia IAF.'),
    };
  }
}

export async function unlinkExpertoSectorIaf(params: {
  client: ExpertoSupabaseClient;
  profile: UserProfile | null | undefined;
  expertoId: string;
  sectorId: string;
}): Promise<ExpertoPersistenceResult<{ expertoId: string; sectorId: string }>> {
  const auth = assertApprovedStaffForExpertoMutation(params.profile);
  if (!auth.ok) return auth;

  let cleanExpertoId: string;
  let cleanSectorId: string;
  try {
    cleanExpertoId = assertValidUuid(params.expertoId, 'experto técnico');
    cleanSectorId = assertValidUuid(params.sectorId, 'sector IAF');
  } catch (err) {
    return { ok: false, error: formatExpertoZeroUuidError(err) };
  }

  try {
    const { error } = await params.client
      .from('sector_iaf_experto')
      .delete()
      .match({ id_experto_tecnico: cleanExpertoId, id_sector_iaf: cleanSectorId });

    if (error) {
      return {
        ok: false,
        error: formatExpertoZeroUuidError(error, 'No se pudo desvincular el Sector IAF.'),
      };
    }
    return { ok: true, data: { expertoId: cleanExpertoId, sectorId: cleanSectorId } };
  } catch (err) {
    return {
      ok: false,
      error: formatExpertoZeroUuidError(err, 'No se pudo desvincular el Sector IAF.'),
    };
  }
}

export async function unlinkExpertoSubsectorIaf(params: {
  client: ExpertoSupabaseClient;
  profile: UserProfile | null | undefined;
  expertoId: string;
  subsectorId: string;
}): Promise<ExpertoPersistenceResult<{ expertoId: string; subsectorId: string }>> {
  const auth = assertApprovedStaffForExpertoMutation(params.profile);
  if (!auth.ok) return auth;

  let cleanExpertoId: string;
  let cleanSubsectorId: string;
  try {
    cleanExpertoId = assertValidUuid(params.expertoId, 'experto técnico');
    cleanSubsectorId = assertValidUuid(params.subsectorId, 'sub-sector IAF');
  } catch (err) {
    return { ok: false, error: formatExpertoZeroUuidError(err) };
  }

  try {
    const { error } = await params.client
      .from('subsector_iaf_experto')
      .delete()
      .match({ id_experto_tecnico: cleanExpertoId, id_subsector_iaf: cleanSubsectorId });

    if (error) {
      return {
        ok: false,
        error: formatExpertoZeroUuidError(error, 'No se pudo desvincular el Sub-Sector IAF.'),
      };
    }
    return { ok: true, data: { expertoId: cleanExpertoId, subsectorId: cleanSubsectorId } };
  } catch (err) {
    return {
      ok: false,
      error: formatExpertoZeroUuidError(err, 'No se pudo desvincular el Sub-Sector IAF.'),
    };
  }
}

export async function hydrateExpertoAuditoriaAssignments(
  client: ExpertoSupabaseClient
): Promise<ExpertoPersistenceResult<ExpertoTecnicoAuditoriaEntity[]>> {
  try {
    const { data, error } = await client
      .from('experto_tecnico_auditoria')
      .select(
        `
        id,
        id_auditoria,
        id_experto_tecnico,
        dias_asignados,
        observacion,
        deleted_at,
        experto:id_experto_tecnico ( id, nombre, estatus, deleted_at )
      `
      )
      .is('deleted_at', null);

    if (error) {
      return {
        ok: false,
        error: formatExpertoZeroUuidError(
          error,
          'No se pudieron cargar los expertos técnicos asignados a auditorías.'
        ),
      };
    }

    const items: ExpertoTecnicoAuditoriaEntity[] = [];
    for (const row of data ?? []) {
      const id = String(row.id || '').trim();
      const idAuditoria = String(row.id_auditoria || '').trim();
      const idExperto = String(row.id_experto_tecnico || '').trim();
      if (!id || !idAuditoria || !idExperto) continue;

      const expertoObj = isObjectRecord(row.experto) ? row.experto : null;
      if (expertoObj && expertoObj.deleted_at) continue;

      items.push({
        id,
        id_auditoria: idAuditoria,
        id_experto_tecnico: idExperto,
        experto_nombre: expertoObj?.nombre
          ? String(expertoObj.nombre)
          : 'Experto Técnico',
        experto_estatus: normalizeExpertoDisponibilidad(expertoObj?.estatus),
        dias_asignados: roundAuditDaysQuarter(Number(row.dias_asignados ?? 0)),
        observacion:
          row.observacion !== undefined && row.observacion !== null
            ? String(row.observacion)
            : null,
        deleted_at: null,
      });
    }

    return { ok: true, data: items };
  } catch (err) {
    return {
      ok: false,
      error: formatExpertoZeroUuidError(
        err,
        'No se pudieron cargar los expertos técnicos asignados a auditorías.'
      ),
    };
  }
}

export async function upsertAuditExpertoTecnico(params: {
  client: ExpertoSupabaseClient;
  profile: UserProfile | null | undefined;
  auditId: string;
  expertoId: string;
  expertoNombre?: string;
  expertoEstatus?: ExpertoDisponibilidad;
  diasAsignados: number;
  observacion?: string | null;
  existingAssignments: ReadonlyArray<ExpertoTecnicoAuditoriaEntity>;
}): Promise<ExpertoPersistenceResult<{ item: ExpertoTecnicoAuditoriaEntity; restored: boolean }>> {
  const auth = assertApprovedStaffForExpertoMutation(params.profile);
  if (!auth.ok) return auth;

  const validation = validateExpertoAuditoriaAssignmentDraft({
    auditId: params.auditId,
    expertoId: params.expertoId,
    diasAsignados: params.diasAsignados,
    observacion: params.observacion,
    existingAssignments: params.existingAssignments,
  });

  if (!validation.valid || !validation.normalized) {
    return {
      ok: false,
      error: validation.message || 'Verifique los datos del experto técnico.',
    };
  }

  const norm = validation.normalized;
  const resolvedNombre = params.expertoNombre?.trim() || 'Experto Técnico';
  const resolvedEstatus: ExpertoDisponibilidad = params.expertoEstatus || 'Disponible';

  try {
    const { data: existingRows, error: lookupErr } = await params.client
      .from('experto_tecnico_auditoria')
      .select('id, deleted_at')
      .eq('id_auditoria', norm.id_auditoria)
      .eq('id_experto_tecnico', norm.id_experto_tecnico)
      .order('created_at', { ascending: false })
      .limit(1);

    if (lookupErr) {
      return {
        ok: false,
        error: formatExpertoZeroUuidError(
          lookupErr,
          'No se pudo verificar la asignación previa del experto técnico.'
        ),
      };
    }

    const existing = Array.isArray(existingRows) && existingRows[0] ? existingRows[0] : null;
    if (existing && existing.id) {
      const existingId = assertValidUuid(String(existing.id), 'asignación de experto');
      const nowIso = new Date().toISOString();
      const { error: updErr } = await params.client
        .from('experto_tecnico_auditoria')
        .update({
          dias_asignados: norm.dias_asignados,
          observacion: norm.observacion,
          deleted_at: null,
          deleted_by: null,
          updated_at: nowIso,
        })
        .eq('id', existingId);

      if (updErr) {
        return {
          ok: false,
          error: formatExpertoZeroUuidError(
            updErr,
            'No se pudo asignar el experto técnico a la auditoría.'
          ),
        };
      }

      return {
        ok: true,
        data: {
          restored: Boolean(existing.deleted_at),
          item: {
            id: existingId,
            id_auditoria: norm.id_auditoria,
            id_experto_tecnico: norm.id_experto_tecnico,
            experto_nombre: resolvedNombre,
            experto_estatus: resolvedEstatus,
            dias_asignados: norm.dias_asignados,
            observacion: norm.observacion,
            deleted_at: null,
          },
        },
      };
    }

    const newId = crypto.randomUUID();
    const { error: insErr } = await params.client
      .from('experto_tecnico_auditoria')
      .insert({
        id: newId,
        id_auditoria: norm.id_auditoria,
        id_experto_tecnico: norm.id_experto_tecnico,
        dias_asignados: norm.dias_asignados,
        observacion: norm.observacion,
      });

    if (insErr) {
      return {
        ok: false,
        error: formatExpertoZeroUuidError(
          insErr,
          'No se pudo asignar el experto técnico a la auditoría.'
        ),
      };
    }

    return {
      ok: true,
      data: {
        restored: false,
        item: {
          id: newId,
          id_auditoria: norm.id_auditoria,
          id_experto_tecnico: norm.id_experto_tecnico,
          experto_nombre: resolvedNombre,
          experto_estatus: resolvedEstatus,
          dias_asignados: norm.dias_asignados,
          observacion: norm.observacion,
          deleted_at: null,
        },
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: formatExpertoZeroUuidError(
        err,
        'No se pudo asignar el experto técnico a la auditoría.'
      ),
    };
  }
}

export async function updateAuditExpertoTecnico(params: {
  client: ExpertoSupabaseClient;
  profile: UserProfile | null | undefined;
  assignmentId: string;
  auditId: string;
  expertoId: string;
  diasAsignados: number;
  observacion?: string | null;
  existingAssignments: ReadonlyArray<ExpertoTecnicoAuditoriaEntity>;
}): Promise<
  ExpertoPersistenceResult<{
    id: string;
    dias_asignados: number;
    observacion: string | null;
  }>
> {
  const auth = assertApprovedStaffForExpertoMutation(params.profile);
  if (!auth.ok) return auth;

  let cleanAssignmentId: string;
  try {
    cleanAssignmentId = assertValidUuid(params.assignmentId, 'asignación de experto');
  } catch (err) {
    return { ok: false, error: formatExpertoZeroUuidError(err) };
  }

  const validation = validateExpertoAuditoriaAssignmentDraft({
    auditId: params.auditId,
    expertoId: params.expertoId,
    diasAsignados: params.diasAsignados,
    observacion: params.observacion,
    existingAssignments: params.existingAssignments,
    allowSelfId: cleanAssignmentId,
  });

  if (!validation.valid || !validation.normalized) {
    return {
      ok: false,
      error: validation.message || 'Verifique los días u observación del experto técnico.',
    };
  }

  const norm = validation.normalized;
  try {
    const { error } = await params.client
      .from('experto_tecnico_auditoria')
      .update({
        dias_asignados: norm.dias_asignados,
        observacion: norm.observacion,
        updated_at: new Date().toISOString(),
      })
      .eq('id', cleanAssignmentId);

    if (error) {
      return {
        ok: false,
        error: formatExpertoZeroUuidError(
          error,
          'No se pudo actualizar la asignación del experto técnico.'
        ),
      };
    }

    return {
      ok: true,
      data: {
        id: cleanAssignmentId,
        dias_asignados: norm.dias_asignados,
        observacion: norm.observacion,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: formatExpertoZeroUuidError(
        err,
        'No se pudo actualizar la asignación del experto técnico.'
      ),
    };
  }
}

export async function archiveAuditExpertoTecnico(params: {
  client: ExpertoSupabaseClient;
  profile: UserProfile | null | undefined;
  assignmentId: string;
}): Promise<ExpertoPersistenceResult<{ id: string }>> {
  const auth = assertApprovedStaffForExpertoMutation(params.profile);
  if (!auth.ok) return auth;

  let cleanAssignmentId: string;
  try {
    cleanAssignmentId = assertValidUuid(params.assignmentId, 'asignación de experto');
  } catch (err) {
    return { ok: false, error: formatExpertoZeroUuidError(err) };
  }

  try {
    const { error } = await params.client
      .from('experto_tecnico_auditoria')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: params.profile?.id || null,
      })
      .eq('id', cleanAssignmentId);

    if (error) {
      return {
        ok: false,
        error: formatExpertoZeroUuidError(
          error,
          'No se pudo retirar el experto técnico de la auditoría.'
        ),
      };
    }

    return { ok: true, data: { id: cleanAssignmentId } };
  } catch (err) {
    return {
      ok: false,
      error: formatExpertoZeroUuidError(
        err,
        'No se pudo retirar el experto técnico de la auditoría.'
      ),
    };
  }
}
