import { isApprovedStaffProfile } from './accessControl';
import {
  getPrimaryAuditorEmail,
  getPrimaryAuditorTelefono,
  summarizeEvaluacionesInSitu,
  validateAuditorDraft,
  validateAuditorEmailDraft,
  validateAuditorTelefonoDraft,
  validateEvaluacionInSituDraft,
  type AuditorDetailEntity,
  type AuditorEmailFormDraft,
  type AuditorFormDraft,
  type AuditorNormaLink,
  type AuditorSectorLink,
  type AuditorSubsectorLink,
  type AuditorTelefonoFormDraft,
  type EmailAuditorEntity,
  type EvaluacionInSituAuditorEntity,
  type EvaluacionInSituFormDraft,
  type NormaCatalogRef,
  type TelefonoAuditorEntity,
} from './competencyMatrix';
import {
  resolveSectorIafDescription,
  type SectorIafEntity,
  type SubsectorIafEntity,
} from './extraDomain';
import { isMissingTableOrSchemaError } from './certificadoSubEntities';
import { translateDatabaseError, type UserProfile } from './healthCheck';
import { assertValidUuid } from './zeroUuid';

const UUID_GLOBAL_REGEX =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

export interface AuditorDbErrorLike {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

export interface AuditorQueryResponse<T = Array<Record<string, unknown>>> {
  data: T | null;
  error: AuditorDbErrorLike | null;
}

export interface AuditorSingleResponse {
  data: Record<string, unknown> | null;
  error: AuditorDbErrorLike | null;
}

export interface AuditorMutationBuilder {
  single(): PromiseLike<AuditorSingleResponse>;
  maybeSingle(): PromiseLike<AuditorSingleResponse>;
  then<TResult1 = AuditorQueryResponse, TResult2 = never>(
    onfulfilled?:
      | ((value: AuditorQueryResponse) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2>;
}

export interface AuditorSelectBuilder extends AuditorMutationBuilder {
  eq(column: string, value: string): AuditorSelectBuilder;
  is(column: string, value: null): AuditorSelectBuilder;
  order(column: string, options?: { ascending?: boolean }): AuditorSelectBuilder;
  limit(count: number): AuditorSelectBuilder;
}

export interface AuditorInsertBuilder {
  select(columns?: string): AuditorMutationBuilder;
  then<TResult1 = AuditorQueryResponse, TResult2 = never>(
    onfulfilled?:
      | ((value: AuditorQueryResponse) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2>;
}

export interface AuditorUpdateBuilder {
  eq(column: string, value: string): AuditorUpdateBuilder;
  is(column: string, value: null): AuditorUpdateBuilder;
  select(columns?: string): AuditorMutationBuilder;
  then<TResult1 = AuditorQueryResponse, TResult2 = never>(
    onfulfilled?:
      | ((value: AuditorQueryResponse) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<AuditorQueryResponse | TResult1 | TResult2>;
}

export interface AuditorDeleteBuilder {
  eq(column: string, value: string): AuditorDeleteBuilder;
  match(query: Record<string, string>): AuditorDeleteBuilder;
  then<TResult1 = AuditorQueryResponse, TResult2 = never>(
    onfulfilled?:
      | ((value: AuditorQueryResponse) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2>;
}

export interface AuditorTableClient {
  select(columns: string): AuditorSelectBuilder;
  insert(
    values: Record<string, unknown> | Array<Record<string, unknown>>
  ): AuditorInsertBuilder;
  update(values: Record<string, unknown>): AuditorUpdateBuilder;
  delete(): AuditorDeleteBuilder;
}

export interface AuditorSupabaseClient {
  from(table: string): AuditorTableClient;
}

export interface AuditorPersistenceResult<T = undefined> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface AuditorCatalogContext {
  normas?: ReadonlyArray<NormaCatalogRef>;
  sectores?: ReadonlyArray<Pick<SectorIafEntity, 'id' | 'sector' | 'descripcion'>>;
  subsectores?: ReadonlyArray<
    Pick<
      SubsectorIafEntity,
      'id' | 'id_sector_iaf' | 'sector_numero' | 'codigo' | 'descripcion' | 'categoria_riesgo'
    >
  >;
}

export const AUDITOR_SELECT_COLUMNS = [
  'id',
  'nombre',
  'siglas',
  'cedula_identidad',
  'profesion',
  'esquemas_complementarios',
  'anio_actualizacion_normas',
  'sistema_gestion_secundario',
  'ultima_evaluacion_in_situ_texto',
  'proxima_evaluacion_in_situ_texto',
  'ultima_evaluacion_in_situ_fecha',
  'proxima_evaluacion_in_situ_fecha',
  'sin_registro_evaluacion',
  'sector_area_evaluado_texto',
  'observaciones_evaluacion',
  'anio_actualizacion_sectores',
  'observacion_sectores',
  'created_at',
  'updated_at',
  'deleted_at',
].join(', ');

function stripRawUuids(text: string): string {
  return text.replace(UUID_GLOBAL_REGEX, 'Referencia registrada').replace(/\s+/g, ' ').trim();
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractRawDbErrorText(err: unknown): {
  code: string;
  message: string;
  details: string;
  hint: string;
} {
  if (err instanceof Error) {
    return {
      code: '',
      message: err.message || '',
      details: '',
      hint: '',
    };
  }
  if (isObjectRecord(err)) {
    return {
      code: typeof err.code === 'string' ? err.code : '',
      message: typeof err.message === 'string' ? err.message : '',
      details: typeof err.details === 'string' ? err.details : '',
      hint: typeof err.hint === 'string' ? err.hint : '',
    };
  }
  return {
    code: '',
    message: typeof err === 'string' ? err : '',
    details: '',
    hint: '',
  };
}

export function translateAuditorPersistenceError(
  err: unknown,
  fallback = 'No se pudo completar la operación del auditor.'
): string {
  const raw = extractRawDbErrorText(err);
  const combined = `${raw.code} ${raw.message} ${raw.details} ${raw.hint}`.toLowerCase();

  if (
    combined.includes('uq_auditor_cedula_active') ||
    (combined.includes('duplicate key') && combined.includes('cedula_identidad'))
  ) {
    return 'Ya existe un auditor activo con esa cédula de identidad.';
  }

  if (
    combined.includes('uq_telefono_auditor_per_auditor_active') ||
    (combined.includes('duplicate key') && combined.includes('telefono_auditor'))
  ) {
    return 'Ese número de teléfono ya está registrado para este auditor.';
  }

  if (
    combined.includes('uq_email_auditor_per_auditor_active') ||
    (combined.includes('duplicate key') && combined.includes('email_auditor'))
  ) {
    return 'Ese correo electrónico ya está registrado para este auditor.';
  }

  if (combined.includes('chk_auditor_anio_actualizacion_normas')) {
    return 'El año de actualización de normas debe estar comprendido entre 1990 y 2100.';
  }

  if (combined.includes('chk_auditor_anio_actualizacion_sectores')) {
    return 'El año de actualización de sectores debe estar comprendido entre 1990 y 2100.';
  }

  if (raw.code === '42501' || combined.includes('permission denied')) {
    return 'Permisos insuficientes en base de datos para modificar registros de auditores.';
  }

  if (raw.code === 'P0001' && raw.message.trim()) {
    return stripRawUuids(raw.message.trim()) || fallback;
  }

  const translated = translateDatabaseError(err);
  const candidate =
    translated && translated !== raw.message
      ? translated
      : raw.message.trim() || translated || fallback;
  return stripRawUuids(candidate) || fallback;
}

export function assertApprovedStaffForAuditorMutation(
  profile: UserProfile | null | undefined
): { ok: true } | { ok: false; error: string } {
  if (!isApprovedStaffProfile(profile)) {
    return {
      ok: false,
      error:
        'Acceso denegado: solo personal aprobado (ADMIN o WORKER) puede gestionar auditores.',
    };
  }
  return { ok: true };
}

function parseOptionalInt(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return Number.isInteger(n) ? n : null;
}

function parseOptionalIsoDate(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null;
  const s = String(val).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function resolveJoinedSectorNumber(rawSector: unknown, fallbackSubCode?: string): number {
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

function mapEvaluacionRow(row: Record<string, unknown>): EvaluacionInSituAuditorEntity | null {
  if (row.deleted_at) return null;
  const id = String(row.id || '').trim();
  const id_auditor = String(row.id_auditor || '').trim();
  if (!id || !id_auditor) return null;
  return {
    id,
    id_auditor,
    etiqueta_periodo: row.etiqueta_periodo ? String(row.etiqueta_periodo) : null,
    norma_referencia: row.norma_referencia ? String(row.norma_referencia) : null,
    sector_area_evaluado: row.sector_area_evaluado ? String(row.sector_area_evaluado) : null,
    ultima_evaluacion_fecha: parseOptionalIsoDate(row.ultima_evaluacion_fecha),
    proxima_evaluacion_fecha: parseOptionalIsoDate(row.proxima_evaluacion_fecha),
    ultima_evaluacion_texto: row.ultima_evaluacion_texto
      ? String(row.ultima_evaluacion_texto)
      : null,
    proxima_evaluacion_texto: row.proxima_evaluacion_texto
      ? String(row.proxima_evaluacion_texto)
      : null,
    observaciones: row.observaciones ? String(row.observaciones) : null,
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
    deleted_at: null,
  };
}

export function assembleAuditorEntitiesFromRows(params: {
  auditorRows: ReadonlyArray<Record<string, unknown>>;
  telefonoRows?: ReadonlyArray<Record<string, unknown>>;
  emailRows?: ReadonlyArray<Record<string, unknown>>;
  evaluacionRows?: ReadonlyArray<Record<string, unknown>>;
  normaLinkRows?: ReadonlyArray<Record<string, unknown>>;
  sectorLinkRows?: ReadonlyArray<Record<string, unknown>>;
  subsectorLinkRows?: ReadonlyArray<Record<string, unknown>>;
  catalogs?: AuditorCatalogContext;
}): AuditorDetailEntity[] {
  const {
    auditorRows,
    telefonoRows = [],
    emailRows = [],
    evaluacionRows = [],
    normaLinkRows = [],
    sectorLinkRows = [],
    subsectorLinkRows = [],
    catalogs = {},
  } = params;

  const normaCatalogById = new Map<string, NormaCatalogRef>();
  for (const n of catalogs.normas || []) {
    normaCatalogById.set(n.id, n);
  }

  const sectorCatalogById = new Map<
    string,
    Pick<SectorIafEntity, 'id' | 'sector' | 'descripcion'>
  >();
  for (const s of catalogs.sectores || []) {
    sectorCatalogById.set(s.id, s);
  }

  const subsectorCatalogById = new Map<
    string,
    Pick<
      SubsectorIafEntity,
      'id' | 'id_sector_iaf' | 'sector_numero' | 'codigo' | 'descripcion' | 'categoria_riesgo'
    >
  >();
  for (const sub of catalogs.subsectores || []) {
    subsectorCatalogById.set(sub.id, sub);
  }

  const telefonosByAuditor = new Map<string, TelefonoAuditorEntity[]>();
  for (const row of telefonoRows) {
    if (row.deleted_at) continue;
    const idAuditor = String(row.id_auditor || '').trim();
    const id = String(row.id || '').trim();
    const tel = String(row.telefono || '').trim();
    if (!idAuditor || !id || !tel) continue;
    const list = telefonosByAuditor.get(idAuditor) || [];
    list.push({
      id,
      id_auditor: idAuditor,
      telefono: tel,
      tipo_telefono: String(row.tipo_telefono || 'Móvil').trim() || 'Móvil',
      es_principal: Boolean(row.es_principal),
      created_at: row.created_at ? String(row.created_at) : undefined,
      updated_at: row.updated_at ? String(row.updated_at) : undefined,
      deleted_at: null,
    });
    telefonosByAuditor.set(idAuditor, list);
  }

  const emailsByAuditor = new Map<string, EmailAuditorEntity[]>();
  for (const row of emailRows) {
    if (row.deleted_at) continue;
    const idAuditor = String(row.id_auditor || '').trim();
    const id = String(row.id || '').trim();
    const email = String(row.email || '').trim().toLowerCase();
    if (!idAuditor || !id || !email) continue;
    const list = emailsByAuditor.get(idAuditor) || [];
    list.push({
      id,
      id_auditor: idAuditor,
      email,
      tipo_email: String(row.tipo_email || 'Principal').trim() || 'Principal',
      es_principal: Boolean(row.es_principal),
      created_at: row.created_at ? String(row.created_at) : undefined,
      updated_at: row.updated_at ? String(row.updated_at) : undefined,
      deleted_at: null,
    });
    emailsByAuditor.set(idAuditor, list);
  }

  const evaluacionesByAuditor = new Map<string, EvaluacionInSituAuditorEntity[]>();
  for (const row of evaluacionRows) {
    const mapped = mapEvaluacionRow(row);
    if (!mapped) continue;
    const list = evaluacionesByAuditor.get(mapped.id_auditor) || [];
    list.push(mapped);
    evaluacionesByAuditor.set(mapped.id_auditor, list);
  }

  const normasByAuditor = new Map<string, AuditorNormaLink[]>();
  for (const row of normaLinkRows) {
    const idAuditor = String(row.id_auditor || '').trim();
    const inner = isObjectRecord(row.norma) ? row.norma : null;
    if (inner && inner.deleted_at) continue;
    const idNorma = String(inner?.id || row.id_norma || '').trim();
    if (!idAuditor || !idNorma) continue;
    const list = normasByAuditor.get(idAuditor) || [];
    if (list.some((l) => l.id_norma === idNorma)) continue;
    const cat = normaCatalogById.get(idNorma);
    const normaCodigo = String(
      inner?.codigo || inner?.norma || cat?.codigo || cat?.norma || 'Norma ISO'
    );
    list.push({
      id_auditor: idAuditor,
      id_norma: idNorma,
      norma_codigo: normaCodigo,
      norma_titulo: inner?.titulo
        ? String(inner.titulo)
        : cat?.titulo
        ? String(cat.titulo)
        : undefined,
      esquema: inner?.esquema
        ? String(inner.esquema)
        : cat?.esquema
        ? String(cat.esquema)
        : undefined,
    });
    normasByAuditor.set(idAuditor, list);
  }

  const sectoresByAuditor = new Map<string, AuditorSectorLink[]>();
  for (const row of sectorLinkRows) {
    const idAuditor = String(row.id_auditor || '').trim();
    const inner = isObjectRecord(row.sector) ? row.sector : null;
    if (inner && inner.deleted_at) continue;
    const idSector = String(inner?.id || row.id_sector_iaf || '').trim();
    if (!idAuditor || !idSector) continue;
    const list = sectoresByAuditor.get(idAuditor) || [];
    if (list.some((l) => l.id_sector_iaf === idSector)) continue;
    const cat = sectorCatalogById.get(idSector);
    const secNum = resolveJoinedSectorNumber(inner) || cat?.sector || 0;
    if (!Number.isFinite(secNum) || secNum <= 0) continue;
    list.push({
      id_auditor: idAuditor,
      id_sector_iaf: idSector,
      sector_numero: secNum,
      sector_descripcion:
        (inner?.descripcion ? String(inner.descripcion) : '') ||
        cat?.descripcion ||
        resolveSectorIafDescription(secNum),
    });
    sectoresByAuditor.set(idAuditor, list);
  }

  const subsectoresByAuditor = new Map<string, AuditorSubsectorLink[]>();
  for (const row of subsectorLinkRows) {
    const idAuditor = String(row.id_auditor || '').trim();
    const inner = isObjectRecord(row.subsector) ? row.subsector : null;
    if (inner && inner.deleted_at) continue;
    const idSub = String(inner?.id || row.id_subsector_iaf || '').trim();
    if (!idAuditor || !idSub) continue;
    const list = subsectoresByAuditor.get(idAuditor) || [];
    if (list.some((l) => l.id_subsector_iaf === idSub)) continue;
    const cat = subsectorCatalogById.get(idSub);
    const subCode = String(inner?.codigo || cat?.codigo || '').trim();
    if (!subCode) continue;
    const idSector = String(inner?.id_sector_iaf || cat?.id_sector_iaf || '').trim();
    const matchedSector = (sectoresByAuditor.get(idAuditor) || []).find(
      (s) => s.id_sector_iaf === idSector
    );
    const parentCat = idSector ? sectorCatalogById.get(idSector) : undefined;
    const sectorNum =
      matchedSector?.sector_numero ||
      parentCat?.sector ||
      resolveJoinedSectorNumber(inner?.sector, subCode) ||
      0;
    list.push({
      id_auditor: idAuditor,
      id_subsector_iaf: idSub,
      id_sector_iaf: idSector,
      sector_numero: sectorNum,
      subsector_codigo: subCode,
      subsector_descripcion: String(
        inner?.descripcion || cat?.descripcion || 'Sub-Sector IAF'
      ),
      categoria_riesgo: inner?.categoria_riesgo
        ? String(inner.categoria_riesgo)
        : cat?.categoria_riesgo,
      created_at: row.created_at ? String(row.created_at) : undefined,
    });
    subsectoresByAuditor.set(idAuditor, list);
  }

  return auditorRows
    .filter((row) => !row.deleted_at)
    .map((row) => {
      const id = String(row.id || '').trim();
      const nombre = String(row.nombre || 'Auditor Evaluador').trim();
      const siglas = row.siglas ? String(row.siglas).trim() : '';
      const cedula_identidad = row.cedula_identidad
        ? String(row.cedula_identidad).trim()
        : '';
      const profesion = row.profesion ? String(row.profesion).trim() : '';
      const esquemas_complementarios = row.esquemas_complementarios
        ? String(row.esquemas_complementarios).trim()
        : '';
      const sistema_gestion_secundario = row.sistema_gestion_secundario
        ? String(row.sistema_gestion_secundario).trim()
        : '';
      const ultima_evaluacion_in_situ_texto = row.ultima_evaluacion_in_situ_texto
        ? String(row.ultima_evaluacion_in_situ_texto).trim()
        : '';
      const proxima_evaluacion_in_situ_texto = row.proxima_evaluacion_in_situ_texto
        ? String(row.proxima_evaluacion_in_situ_texto).trim()
        : '';
      const ultima_evaluacion_in_situ_fecha = parseOptionalIsoDate(
        row.ultima_evaluacion_in_situ_fecha
      );
      const proxima_evaluacion_in_situ_fecha = parseOptionalIsoDate(
        row.proxima_evaluacion_in_situ_fecha
      );
      const sector_area_evaluado_texto = row.sector_area_evaluado_texto
        ? String(row.sector_area_evaluado_texto).trim()
        : '';
      const observaciones_evaluacion = row.observaciones_evaluacion
        ? String(row.observaciones_evaluacion).trim()
        : '';
      const observacion_sectores = row.observacion_sectores
        ? String(row.observacion_sectores).trim()
        : '';

      const telefonos = [...(telefonosByAuditor.get(id) || [])].sort(
        (a, b) => Number(b.es_principal) - Number(a.es_principal)
      );
      const emails = [...(emailsByAuditor.get(id) || [])].sort(
        (a, b) => Number(b.es_principal) - Number(a.es_principal)
      );
      const evaluaciones_in_situ = [...(evaluacionesByAuditor.get(id) || [])].sort((a, b) =>
        (b.proxima_evaluacion_fecha || '').localeCompare(a.proxima_evaluacion_fecha || '')
      );

      const normaLinks = [...(normasByAuditor.get(id) || [])].sort((a, b) =>
        a.norma_codigo.localeCompare(b.norma_codigo, 'es')
      );
      const sectorLinks = [...(sectoresByAuditor.get(id) || [])].sort(
        (a, b) => a.sector_numero - b.sector_numero
      );
      const subsectorLinks = [...(subsectoresByAuditor.get(id) || [])].sort((a, b) =>
        a.subsector_codigo.localeCompare(b.subsector_codigo, 'es', { numeric: true })
      );

      const primaryEmail = getPrimaryAuditorEmail(emails);
      const primaryTelefono = getPrimaryAuditorTelefono(telefonos);
      const derivedSinRegistro =
        row.sin_registro_evaluacion !== undefined && row.sin_registro_evaluacion !== null
          ? Boolean(row.sin_registro_evaluacion)
          : !ultima_evaluacion_in_situ_fecha && evaluaciones_in_situ.length === 0;

      return {
        id,
        nombre,
        siglas,
        cedula_identidad,
        profesion,
        esquemas_complementarios,
        anio_actualizacion_normas: parseOptionalInt(row.anio_actualizacion_normas),
        sistema_gestion_secundario,
        ultima_evaluacion_in_situ_texto,
        proxima_evaluacion_in_situ_texto,
        ultima_evaluacion_in_situ_fecha,
        proxima_evaluacion_in_situ_fecha,
        sin_registro_evaluacion: derivedSinRegistro,
        sector_area_evaluado_texto,
        observaciones_evaluacion,
        anio_actualizacion_sectores: parseOptionalInt(row.anio_actualizacion_sectores),
        observacion_sectores,
        telefonos,
        emails,
        evaluaciones_in_situ,
        titulo_profesional: profesion || 'Auditor Técnico Evaluador',
        codigo_credencial: siglas,
        email: primaryEmail,
        telefono: primaryTelefono,
        biografia: observaciones_evaluacion || observacion_sectores || '',
        instituto_registro: 'FONDONORMA',
        categoria_profesional: 'Auditor Calificado',
        calificacion: 'Calificado' as const,
        normas_acreditadas: normaLinks.map((l) => l.norma_codigo),
        sectores_iaf: sectorLinks.map((l) => l.sector_numero),
        competencias: [],
        normaLinks,
        sectorLinks,
        subsectorLinks,
        historialAuditorias: [],
        created_at: row.created_at ? String(row.created_at) : undefined,
        updated_at: row.updated_at ? String(row.updated_at) : undefined,
        deleted_at: null,
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

export async function hydrateAuditoresFromSupabase(
  client: AuditorSupabaseClient,
  catalogs: AuditorCatalogContext = {}
): Promise<AuditorPersistenceResult<AuditorDetailEntity[]>> {
  try {
    const [audRes, telRes, emailRes, evalRes, normaRes, sectorRes, subsectorRes] =
      await Promise.all([
        client
          .from('auditor')
          .select(AUDITOR_SELECT_COLUMNS)
          .is('deleted_at', null)
          .order('nombre', { ascending: true }),
        client
          .from('telefono_auditor')
          .select(
            'id, id_auditor, telefono, tipo_telefono, es_principal, created_at, updated_at, deleted_at'
          )
          .is('deleted_at', null)
          .order('es_principal', { ascending: false }),
        client
          .from('email_auditor')
          .select(
            'id, id_auditor, email, tipo_email, es_principal, created_at, updated_at, deleted_at'
          )
          .is('deleted_at', null)
          .order('es_principal', { ascending: false }),
        client
          .from('evaluacion_in_situ_auditor')
          .select(
            'id, id_auditor, etiqueta_periodo, norma_referencia, sector_area_evaluado, ultima_evaluacion_fecha, proxima_evaluacion_fecha, ultima_evaluacion_texto, proxima_evaluacion_texto, observaciones, created_at, updated_at, deleted_at'
          )
          .is('deleted_at', null)
          .order('proxima_evaluacion_fecha', { ascending: false }),
        client
          .from('norma_auditor')
          .select(
            'id_auditor, id_norma, norma:id_norma ( id, codigo, titulo, norma, esquema, deleted_at )'
          ),
        client
          .from('sector_iaf_auditor')
          .select(
            'id_auditor, id_sector_iaf, sector:id_sector_iaf ( id, sector, descripcion, deleted_at )'
          ),
        client
          .from('subsector_iaf_auditor')
          .select(
            'id_auditor, id_subsector_iaf, created_at, subsector:id_subsector_iaf ( id, id_sector_iaf, codigo, descripcion, categoria_riesgo, deleted_at )'
          ),
      ]);

    let auditorRows: Array<Record<string, unknown>> = Array.isArray(audRes.data)
      ? audRes.data
      : [];

    if (audRes.error) {
      if (isMissingTableOrSchemaError(audRes.error)) {
        const legacyAudRes = await client
          .from('auditor')
          .select('id, nombre, created_at, updated_at, deleted_at')
          .is('deleted_at', null)
          .order('nombre', { ascending: true });
        if (legacyAudRes.error) {
          return {
            ok: false,
            error: translateAuditorPersistenceError(
              legacyAudRes.error,
              'No se pudo cargar el directorio de auditores.'
            ),
          };
        }
        auditorRows = Array.isArray(legacyAudRes.data) ? legacyAudRes.data : [];
      } else {
        return {
          ok: false,
          error: translateAuditorPersistenceError(
            audRes.error,
            'No se pudo cargar el directorio de auditores.'
          ),
        };
      }
    }

    const assembled = assembleAuditorEntitiesFromRows({
      auditorRows,
      telefonoRows: !telRes.error && Array.isArray(telRes.data) ? telRes.data : [],
      emailRows: !emailRes.error && Array.isArray(emailRes.data) ? emailRes.data : [],
      evaluacionRows: !evalRes.error && Array.isArray(evalRes.data) ? evalRes.data : [],
      normaLinkRows: !normaRes.error && Array.isArray(normaRes.data) ? normaRes.data : [],
      sectorLinkRows: !sectorRes.error && Array.isArray(sectorRes.data) ? sectorRes.data : [],
      subsectorLinkRows:
        !subsectorRes.error && Array.isArray(subsectorRes.data) ? subsectorRes.data : [],
      catalogs,
    });

    return { ok: true, data: assembled };
  } catch (err) {
    return {
      ok: false,
      error: translateAuditorPersistenceError(
        err,
        'No se pudo cargar el directorio de auditores.'
      ),
    };
  }
}

function buildAuditorPersistenceColumns(norm: AuditorFormDraft): Record<string, unknown> {
  return {
    nombre: norm.nombre,
    siglas: norm.siglas || null,
    cedula_identidad: norm.cedula_identidad || null,
    profesion: norm.profesion || null,
    esquemas_complementarios: norm.esquemas_complementarios || null,
    anio_actualizacion_normas: norm.anio_actualizacion_normas ?? null,
    sistema_gestion_secundario: norm.sistema_gestion_secundario || null,
    ultima_evaluacion_in_situ_texto: norm.ultima_evaluacion_in_situ_texto || null,
    proxima_evaluacion_in_situ_texto: norm.proxima_evaluacion_in_situ_texto || null,
    ultima_evaluacion_in_situ_fecha: norm.ultima_evaluacion_in_situ_fecha ?? null,
    proxima_evaluacion_in_situ_fecha: norm.proxima_evaluacion_in_situ_fecha ?? null,
    sin_registro_evaluacion: Boolean(norm.sin_registro_evaluacion),
    sector_area_evaluado_texto: norm.sector_area_evaluado_texto || null,
    observaciones_evaluacion: norm.observaciones_evaluacion || null,
    anio_actualizacion_sectores: norm.anio_actualizacion_sectores ?? null,
    observacion_sectores: norm.observacion_sectores || null,
  };
}

export async function saveAuditorProfile(
  client: AuditorSupabaseClient,
  params: {
    profile: UserProfile | null | undefined;
    auditorId?: string | null;
    draft: Partial<AuditorFormDraft> & { nombre: string };
    existingAuditors: ReadonlyArray<{
      id: string;
      nombre: string;
      cedula_identidad?: string | null;
      deleted_at?: string | null;
    }>;
    newId?: string;
  }
): Promise<AuditorPersistenceResult<AuditorDetailEntity>> {
  const auth = assertApprovedStaffForAuditorMutation(params.profile);
  if (!auth.ok) return auth;

  const isUpdate = Boolean(params.auditorId);
  let targetId: string;
  try {
    targetId = isUpdate
      ? assertValidUuid(params.auditorId, 'auditor')
      : assertValidUuid(params.newId || crypto.randomUUID(), 'auditor');
  } catch (err) {
    return { ok: false, error: translateAuditorPersistenceError(err) };
  }

  const validation = validateAuditorDraft(
    params.draft,
    params.existingAuditors,
    isUpdate ? targetId : undefined
  );
  if (!validation.valid) {
    return {
      ok: false,
      error: validation.message || 'Verifique los datos del auditor.',
    };
  }

  const norm = validation.normalized;
  const payload = buildAuditorPersistenceColumns(norm);

  try {
    if (isUpdate) {
      const { data, error } = await client
        .from('auditor')
        .update({
          ...payload,
          updated_at: new Date().toISOString(),
        })
        .eq('id', targetId)
        .is('deleted_at', null)
        .select(AUDITOR_SELECT_COLUMNS)
        .single();

      if (error) {
        return {
          ok: false,
          error: translateAuditorPersistenceError(error, 'No se pudo actualizar el auditor.'),
        };
      }

      const [assembled] = assembleAuditorEntitiesFromRows({
        auditorRows: [data || { id: targetId, ...payload }],
      });
      return { ok: true, data: assembled };
    }

    const { data, error } = await client
      .from('auditor')
      .insert({
        id: targetId,
        ...payload,
      })
      .select(AUDITOR_SELECT_COLUMNS)
      .single();

    if (error) {
      return {
        ok: false,
        error: translateAuditorPersistenceError(error, 'No se pudo crear el auditor.'),
      };
    }

    const [assembled] = assembleAuditorEntitiesFromRows({
      auditorRows: [data || { id: targetId, ...payload }],
    });
    return { ok: true, data: assembled };
  } catch (err) {
    return {
      ok: false,
      error: translateAuditorPersistenceError(
        err,
        isUpdate ? 'No se pudo actualizar el auditor.' : 'No se pudo crear el auditor.'
      ),
    };
  }
}

export async function addTelefonoAuditor(params: {
  client: AuditorSupabaseClient;
  profile: UserProfile | null | undefined;
  auditorId: string;
  draft: AuditorTelefonoFormDraft;
  existingTelefonos?: ReadonlyArray<Pick<TelefonoAuditorEntity, 'telefono' | 'deleted_at'>>;
  newId?: string;
}): Promise<AuditorPersistenceResult<TelefonoAuditorEntity>> {
  const auth = assertApprovedStaffForAuditorMutation(params.profile);
  if (!auth.ok) return auth;

  let cleanAuditorId: string;
  let phoneId: string;
  try {
    cleanAuditorId = assertValidUuid(params.auditorId, 'auditor');
    phoneId = assertValidUuid(params.newId || crypto.randomUUID(), 'teléfono');
  } catch (err) {
    return { ok: false, error: translateAuditorPersistenceError(err) };
  }

  const validation = validateAuditorTelefonoDraft(params.draft, params.existingTelefonos || []);
  if (!validation.valid) {
    return {
      ok: false,
      error: validation.message || 'Verifique el número telefónico.',
    };
  }

  try {
    if (validation.normalized.es_principal) {
      const resetRes = await params.client
        .from('telefono_auditor')
        .update({
          es_principal: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id_auditor', cleanAuditorId)
        .is('deleted_at', null);
      if (resetRes.error) {
        return {
          ok: false,
          error: translateAuditorPersistenceError(
            resetRes.error,
            'No se pudo actualizar el teléfono principal anterior.'
          ),
        };
      }
    }

    const { data, error } = await params.client
      .from('telefono_auditor')
      .insert({
        id: phoneId,
        id_auditor: cleanAuditorId,
        telefono: validation.normalized.telefono,
        tipo_telefono: validation.normalized.tipo_telefono,
        es_principal: validation.normalized.es_principal,
      })
      .select('id, id_auditor, telefono, tipo_telefono, es_principal, created_at, updated_at')
      .single();

    if (error) {
      return {
        ok: false,
        error: translateAuditorPersistenceError(
          error,
          'No se pudo registrar el teléfono del auditor.'
        ),
      };
    }

    const row = data || {};
    return {
      ok: true,
      data: {
        id: String(row.id || phoneId),
        id_auditor: cleanAuditorId,
        telefono: String(row.telefono || validation.normalized.telefono),
        tipo_telefono: String(row.tipo_telefono || validation.normalized.tipo_telefono),
        es_principal:
          row.es_principal !== undefined
            ? Boolean(row.es_principal)
            : validation.normalized.es_principal,
        created_at: row.created_at ? String(row.created_at) : undefined,
        updated_at: row.updated_at ? String(row.updated_at) : undefined,
        deleted_at: null,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: translateAuditorPersistenceError(
        err,
        'No se pudo registrar el teléfono del auditor.'
      ),
    };
  }
}

export async function deleteTelefonoAuditor(params: {
  client: AuditorSupabaseClient;
  profile: UserProfile | null | undefined;
  telefonoId: string;
}): Promise<AuditorPersistenceResult<{ id: string }>> {
  const auth = assertApprovedStaffForAuditorMutation(params.profile);
  if (!auth.ok) return auth;

  let cleanPhoneId: string;
  try {
    cleanPhoneId = assertValidUuid(params.telefonoId, 'teléfono');
  } catch (err) {
    return { ok: false, error: translateAuditorPersistenceError(err) };
  }

  try {
    // telefono_auditor supports deleted_at & deleted_by only (no delete_reason column)
    const { error } = await params.client
      .from('telefono_auditor')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: params.profile?.id || null,
      })
      .eq('id', cleanPhoneId)
      .is('deleted_at', null);

    if (error) {
      return {
        ok: false,
        error: translateAuditorPersistenceError(error, 'No se pudo archivar el teléfono.'),
      };
    }

    return { ok: true, data: { id: cleanPhoneId } };
  } catch (err) {
    return {
      ok: false,
      error: translateAuditorPersistenceError(err, 'No se pudo archivar el teléfono.'),
    };
  }
}

export async function setPrimaryTelefonoAuditor(params: {
  client: AuditorSupabaseClient;
  profile: UserProfile | null | undefined;
  auditorId: string;
  telefonoId: string;
}): Promise<AuditorPersistenceResult<{ id: string }>> {
  const auth = assertApprovedStaffForAuditorMutation(params.profile);
  if (!auth.ok) return auth;

  let cleanAuditorId: string;
  let cleanPhoneId: string;
  try {
    cleanAuditorId = assertValidUuid(params.auditorId, 'auditor');
    cleanPhoneId = assertValidUuid(params.telefonoId, 'teléfono');
  } catch (err) {
    return { ok: false, error: translateAuditorPersistenceError(err) };
  }

  const now = new Date().toISOString();
  try {
    const resetRes = await params.client
      .from('telefono_auditor')
      .update({ es_principal: false, updated_at: now })
      .eq('id_auditor', cleanAuditorId)
      .is('deleted_at', null);

    if (resetRes.error) {
      return {
        ok: false,
        error: translateAuditorPersistenceError(
          resetRes.error,
          'No se pudo actualizar el teléfono principal.'
        ),
      };
    }

    const { error } = await params.client
      .from('telefono_auditor')
      .update({ es_principal: true, updated_at: now })
      .eq('id', cleanPhoneId)
      .eq('id_auditor', cleanAuditorId)
      .is('deleted_at', null);

    if (error) {
      return {
        ok: false,
        error: translateAuditorPersistenceError(error, 'No se pudo marcar el teléfono principal.'),
      };
    }

    return { ok: true, data: { id: cleanPhoneId } };
  } catch (err) {
    return {
      ok: false,
      error: translateAuditorPersistenceError(err, 'No se pudo marcar el teléfono principal.'),
    };
  }
}

export async function addEmailAuditor(params: {
  client: AuditorSupabaseClient;
  profile: UserProfile | null | undefined;
  auditorId: string;
  draft: AuditorEmailFormDraft;
  existingEmails?: ReadonlyArray<Pick<EmailAuditorEntity, 'email' | 'deleted_at'>>;
  newId?: string;
}): Promise<AuditorPersistenceResult<EmailAuditorEntity>> {
  const auth = assertApprovedStaffForAuditorMutation(params.profile);
  if (!auth.ok) return auth;

  let cleanAuditorId: string;
  let emailId: string;
  try {
    cleanAuditorId = assertValidUuid(params.auditorId, 'auditor');
    emailId = assertValidUuid(params.newId || crypto.randomUUID(), 'correo electrónico');
  } catch (err) {
    return { ok: false, error: translateAuditorPersistenceError(err) };
  }

  const validation = validateAuditorEmailDraft(params.draft, params.existingEmails || []);
  if (!validation.valid) {
    return {
      ok: false,
      error: validation.message || 'Verifique el correo electrónico.',
    };
  }

  try {
    if (validation.normalized.es_principal) {
      const resetRes = await params.client
        .from('email_auditor')
        .update({
          es_principal: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id_auditor', cleanAuditorId)
        .is('deleted_at', null);
      if (resetRes.error) {
        return {
          ok: false,
          error: translateAuditorPersistenceError(
            resetRes.error,
            'No se pudo actualizar el correo principal anterior.'
          ),
        };
      }
    }

    const { data, error } = await params.client
      .from('email_auditor')
      .insert({
        id: emailId,
        id_auditor: cleanAuditorId,
        email: validation.normalized.email,
        tipo_email: validation.normalized.tipo_email,
        es_principal: validation.normalized.es_principal,
      })
      .select('id, id_auditor, email, tipo_email, es_principal, created_at, updated_at')
      .single();

    if (error) {
      return {
        ok: false,
        error: translateAuditorPersistenceError(
          error,
          'No se pudo registrar el correo del auditor.'
        ),
      };
    }

    const row = data || {};
    return {
      ok: true,
      data: {
        id: String(row.id || emailId),
        id_auditor: cleanAuditorId,
        email: String(row.email || validation.normalized.email),
        tipo_email: String(row.tipo_email || validation.normalized.tipo_email),
        es_principal:
          row.es_principal !== undefined
            ? Boolean(row.es_principal)
            : validation.normalized.es_principal,
        created_at: row.created_at ? String(row.created_at) : undefined,
        updated_at: row.updated_at ? String(row.updated_at) : undefined,
        deleted_at: null,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: translateAuditorPersistenceError(
        err,
        'No se pudo registrar el correo del auditor.'
      ),
    };
  }
}

export async function deleteEmailAuditor(params: {
  client: AuditorSupabaseClient;
  profile: UserProfile | null | undefined;
  emailId: string;
}): Promise<AuditorPersistenceResult<{ id: string }>> {
  const auth = assertApprovedStaffForAuditorMutation(params.profile);
  if (!auth.ok) return auth;

  let cleanEmailId: string;
  try {
    cleanEmailId = assertValidUuid(params.emailId, 'correo electrónico');
  } catch (err) {
    return { ok: false, error: translateAuditorPersistenceError(err) };
  }

  try {
    // email_auditor supports deleted_at & deleted_by only (no delete_reason column)
    const { error } = await params.client
      .from('email_auditor')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: params.profile?.id || null,
      })
      .eq('id', cleanEmailId)
      .is('deleted_at', null);

    if (error) {
      return {
        ok: false,
        error: translateAuditorPersistenceError(error, 'No se pudo archivar el correo.'),
      };
    }

    return { ok: true, data: { id: cleanEmailId } };
  } catch (err) {
    return {
      ok: false,
      error: translateAuditorPersistenceError(err, 'No se pudo archivar el correo.'),
    };
  }
}

export async function setPrimaryEmailAuditor(params: {
  client: AuditorSupabaseClient;
  profile: UserProfile | null | undefined;
  auditorId: string;
  emailId: string;
}): Promise<AuditorPersistenceResult<{ id: string }>> {
  const auth = assertApprovedStaffForAuditorMutation(params.profile);
  if (!auth.ok) return auth;

  let cleanAuditorId: string;
  let cleanEmailId: string;
  try {
    cleanAuditorId = assertValidUuid(params.auditorId, 'auditor');
    cleanEmailId = assertValidUuid(params.emailId, 'correo electrónico');
  } catch (err) {
    return { ok: false, error: translateAuditorPersistenceError(err) };
  }

  const now = new Date().toISOString();
  try {
    const resetRes = await params.client
      .from('email_auditor')
      .update({ es_principal: false, updated_at: now })
      .eq('id_auditor', cleanAuditorId)
      .is('deleted_at', null);

    if (resetRes.error) {
      return {
        ok: false,
        error: translateAuditorPersistenceError(
          resetRes.error,
          'No se pudo actualizar el correo principal.'
        ),
      };
    }

    const { error } = await params.client
      .from('email_auditor')
      .update({ es_principal: true, updated_at: now })
      .eq('id', cleanEmailId)
      .eq('id_auditor', cleanAuditorId)
      .is('deleted_at', null);

    if (error) {
      return {
        ok: false,
        error: translateAuditorPersistenceError(error, 'No se pudo marcar el correo principal.'),
      };
    }

    return { ok: true, data: { id: cleanEmailId } };
  } catch (err) {
    return {
      ok: false,
      error: translateAuditorPersistenceError(err, 'No se pudo marcar el correo principal.'),
    };
  }
}

async function syncAuditorEvaluacionSummaryInDb(params: {
  client: AuditorSupabaseClient;
  auditorId: string;
  fallbackEvaluaciones?: ReadonlyArray<EvaluacionInSituAuditorEntity>;
}): Promise<{
  ultima_evaluacion_in_situ_fecha: string | null;
  proxima_evaluacion_in_situ_fecha: string | null;
  sin_registro_evaluacion: boolean;
}> {
  let activeEvaluaciones: EvaluacionInSituAuditorEntity[] | undefined;

  const evalRes = await params.client
    .from('evaluacion_in_situ_auditor')
    .select(
      'id, id_auditor, etiqueta_periodo, norma_referencia, sector_area_evaluado, ultima_evaluacion_fecha, proxima_evaluacion_fecha, ultima_evaluacion_texto, proxima_evaluacion_texto, observaciones, created_at, updated_at, deleted_at'
    )
    .eq('id_auditor', params.auditorId)
    .is('deleted_at', null);

  if (!evalRes.error && Array.isArray(evalRes.data)) {
    activeEvaluaciones = evalRes.data
      .map(mapEvaluacionRow)
      .filter((item): item is EvaluacionInSituAuditorEntity => item !== null);
  }

  const summary = summarizeEvaluacionesInSitu(
    activeEvaluaciones ?? params.fallbackEvaluaciones ?? []
  );

  await params.client
    .from('auditor')
    .update({
      ultima_evaluacion_in_situ_fecha: summary.ultima_evaluacion_in_situ_fecha,
      proxima_evaluacion_in_situ_fecha: summary.proxima_evaluacion_in_situ_fecha,
      sin_registro_evaluacion: summary.sin_registro_evaluacion,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.auditorId)
    .is('deleted_at', null);

  return summary;
}

export interface EvaluacionMutationOutput {
  evaluacion: EvaluacionInSituAuditorEntity;
  summary: {
    ultima_evaluacion_in_situ_fecha: string | null;
    proxima_evaluacion_in_situ_fecha: string | null;
    sin_registro_evaluacion: boolean;
  };
}

export async function addEvaluacionInSituAuditor(params: {
  client: AuditorSupabaseClient;
  profile: UserProfile | null | undefined;
  auditorId: string;
  draft: EvaluacionInSituFormDraft;
  existingEvaluaciones?: ReadonlyArray<EvaluacionInSituAuditorEntity>;
  newId?: string;
}): Promise<AuditorPersistenceResult<EvaluacionMutationOutput>> {
  const auth = assertApprovedStaffForAuditorMutation(params.profile);
  if (!auth.ok) return auth;

  let cleanAuditorId: string;
  let evalId: string;
  try {
    cleanAuditorId = assertValidUuid(params.auditorId, 'auditor');
    evalId = assertValidUuid(params.newId || crypto.randomUUID(), 'evaluación in situ');
  } catch (err) {
    return { ok: false, error: translateAuditorPersistenceError(err) };
  }

  const validation = validateEvaluacionInSituDraft(params.draft);
  if (!validation.valid) {
    return {
      ok: false,
      error: validation.message || 'Verifique los datos de la evaluación in situ.',
    };
  }

  const norm = validation.normalized;
  try {
    const { data, error } = await params.client
      .from('evaluacion_in_situ_auditor')
      .insert({
        id: evalId,
        id_auditor: cleanAuditorId,
        etiqueta_periodo: norm.etiqueta_periodo || null,
        norma_referencia: norm.norma_referencia || null,
        sector_area_evaluado: norm.sector_area_evaluado || null,
        ultima_evaluacion_fecha: norm.ultima_evaluacion_fecha,
        proxima_evaluacion_fecha: norm.proxima_evaluacion_fecha,
        ultima_evaluacion_texto: norm.ultima_evaluacion_texto || null,
        proxima_evaluacion_texto: norm.proxima_evaluacion_texto || null,
        observaciones: norm.observaciones || null,
      })
      .select(
        'id, id_auditor, etiqueta_periodo, norma_referencia, sector_area_evaluado, ultima_evaluacion_fecha, proxima_evaluacion_fecha, ultima_evaluacion_texto, proxima_evaluacion_texto, observaciones, created_at, updated_at, deleted_at'
      )
      .single();

    if (error) {
      return {
        ok: false,
        error: translateAuditorPersistenceError(
          error,
          'No se pudo registrar la evaluación in situ.'
        ),
      };
    }

    const row = data || {};
    const evaluacion: EvaluacionInSituAuditorEntity = {
      id: String(row.id || evalId),
      id_auditor: cleanAuditorId,
      etiqueta_periodo:
        row.etiqueta_periodo !== undefined
          ? row.etiqueta_periodo
            ? String(row.etiqueta_periodo)
            : null
          : norm.etiqueta_periodo || null,
      norma_referencia:
        row.norma_referencia !== undefined
          ? row.norma_referencia
            ? String(row.norma_referencia)
            : null
          : norm.norma_referencia || null,
      sector_area_evaluado:
        row.sector_area_evaluado !== undefined
          ? row.sector_area_evaluado
            ? String(row.sector_area_evaluado)
            : null
          : norm.sector_area_evaluado || null,
      ultima_evaluacion_fecha:
        parseOptionalIsoDate(row.ultima_evaluacion_fecha) ?? norm.ultima_evaluacion_fecha,
      proxima_evaluacion_fecha:
        parseOptionalIsoDate(row.proxima_evaluacion_fecha) ?? norm.proxima_evaluacion_fecha,
      ultima_evaluacion_texto:
        row.ultima_evaluacion_texto !== undefined
          ? row.ultima_evaluacion_texto
            ? String(row.ultima_evaluacion_texto)
            : null
          : norm.ultima_evaluacion_texto || null,
      proxima_evaluacion_texto:
        row.proxima_evaluacion_texto !== undefined
          ? row.proxima_evaluacion_texto
            ? String(row.proxima_evaluacion_texto)
            : null
          : norm.proxima_evaluacion_texto || null,
      observaciones:
        row.observaciones !== undefined
          ? row.observaciones
            ? String(row.observaciones)
            : null
          : norm.observaciones || null,
      created_at: row.created_at ? String(row.created_at) : undefined,
      updated_at: row.updated_at ? String(row.updated_at) : undefined,
      deleted_at: null,
    };

    const nextActiveList = [
      ...(params.existingEvaluaciones || []).filter((ev) => !ev.deleted_at),
      evaluacion,
    ];
    const summary = await syncAuditorEvaluacionSummaryInDb({
      client: params.client,
      auditorId: cleanAuditorId,
      fallbackEvaluaciones: nextActiveList,
    });

    return { ok: true, data: { evaluacion, summary } };
  } catch (err) {
    return {
      ok: false,
      error: translateAuditorPersistenceError(
        err,
        'No se pudo registrar la evaluación in situ.'
      ),
    };
  }
}

export async function updateEvaluacionInSituAuditor(params: {
  client: AuditorSupabaseClient;
  profile: UserProfile | null | undefined;
  auditorId: string;
  evaluacionId: string;
  draft: EvaluacionInSituFormDraft;
  existingEvaluaciones?: ReadonlyArray<EvaluacionInSituAuditorEntity>;
}): Promise<AuditorPersistenceResult<EvaluacionMutationOutput>> {
  const auth = assertApprovedStaffForAuditorMutation(params.profile);
  if (!auth.ok) return auth;

  let cleanAuditorId: string;
  let cleanEvalId: string;
  try {
    cleanAuditorId = assertValidUuid(params.auditorId, 'auditor');
    cleanEvalId = assertValidUuid(params.evaluacionId, 'evaluación in situ');
  } catch (err) {
    return { ok: false, error: translateAuditorPersistenceError(err) };
  }

  const validation = validateEvaluacionInSituDraft(params.draft);
  if (!validation.valid) {
    return {
      ok: false,
      error: validation.message || 'Verifique los datos de la evaluación in situ.',
    };
  }

  const norm = validation.normalized;
  try {
    const { data, error } = await params.client
      .from('evaluacion_in_situ_auditor')
      .update({
        etiqueta_periodo: norm.etiqueta_periodo || null,
        norma_referencia: norm.norma_referencia || null,
        sector_area_evaluado: norm.sector_area_evaluado || null,
        ultima_evaluacion_fecha: norm.ultima_evaluacion_fecha,
        proxima_evaluacion_fecha: norm.proxima_evaluacion_fecha,
        ultima_evaluacion_texto: norm.ultima_evaluacion_texto || null,
        proxima_evaluacion_texto: norm.proxima_evaluacion_texto || null,
        observaciones: norm.observaciones || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', cleanEvalId)
      .eq('id_auditor', cleanAuditorId)
      .is('deleted_at', null)
      .select(
        'id, id_auditor, etiqueta_periodo, norma_referencia, sector_area_evaluado, ultima_evaluacion_fecha, proxima_evaluacion_fecha, ultima_evaluacion_texto, proxima_evaluacion_texto, observaciones, created_at, updated_at, deleted_at'
      )
      .single();

    if (error) {
      return {
        ok: false,
        error: translateAuditorPersistenceError(
          error,
          'No se pudo actualizar la evaluación in situ.'
        ),
      };
    }

    const row = data || {};
    const evaluacion: EvaluacionInSituAuditorEntity = {
      id: String(row.id || cleanEvalId),
      id_auditor: cleanAuditorId,
      etiqueta_periodo:
        row.etiqueta_periodo !== undefined
          ? row.etiqueta_periodo
            ? String(row.etiqueta_periodo)
            : null
          : norm.etiqueta_periodo || null,
      norma_referencia:
        row.norma_referencia !== undefined
          ? row.norma_referencia
            ? String(row.norma_referencia)
            : null
          : norm.norma_referencia || null,
      sector_area_evaluado:
        row.sector_area_evaluado !== undefined
          ? row.sector_area_evaluado
            ? String(row.sector_area_evaluado)
            : null
          : norm.sector_area_evaluado || null,
      ultima_evaluacion_fecha:
        parseOptionalIsoDate(row.ultima_evaluacion_fecha) ?? norm.ultima_evaluacion_fecha,
      proxima_evaluacion_fecha:
        parseOptionalIsoDate(row.proxima_evaluacion_fecha) ?? norm.proxima_evaluacion_fecha,
      ultima_evaluacion_texto:
        row.ultima_evaluacion_texto !== undefined
          ? row.ultima_evaluacion_texto
            ? String(row.ultima_evaluacion_texto)
            : null
          : norm.ultima_evaluacion_texto || null,
      proxima_evaluacion_texto:
        row.proxima_evaluacion_texto !== undefined
          ? row.proxima_evaluacion_texto
            ? String(row.proxima_evaluacion_texto)
            : null
          : norm.proxima_evaluacion_texto || null,
      observaciones:
        row.observaciones !== undefined
          ? row.observaciones
            ? String(row.observaciones)
            : null
          : norm.observaciones || null,
      created_at: row.created_at ? String(row.created_at) : undefined,
      updated_at: row.updated_at ? String(row.updated_at) : undefined,
      deleted_at: null,
    };

    const nextActiveList = (params.existingEvaluaciones || [])
      .filter((ev) => !ev.deleted_at)
      .map((ev) => (ev.id === cleanEvalId ? evaluacion : ev));
    if (!nextActiveList.some((ev) => ev.id === cleanEvalId)) {
      nextActiveList.push(evaluacion);
    }

    const summary = await syncAuditorEvaluacionSummaryInDb({
      client: params.client,
      auditorId: cleanAuditorId,
      fallbackEvaluaciones: nextActiveList,
    });

    return { ok: true, data: { evaluacion, summary } };
  } catch (err) {
    return {
      ok: false,
      error: translateAuditorPersistenceError(
        err,
        'No se pudo actualizar la evaluación in situ.'
      ),
    };
  }
}

export async function deleteEvaluacionInSituAuditor(params: {
  client: AuditorSupabaseClient;
  profile: UserProfile | null | undefined;
  auditorId: string;
  evaluacionId: string;
  existingEvaluaciones?: ReadonlyArray<EvaluacionInSituAuditorEntity>;
}): Promise<
  AuditorPersistenceResult<{
    id: string;
    summary: {
      ultima_evaluacion_in_situ_fecha: string | null;
      proxima_evaluacion_in_situ_fecha: string | null;
      sin_registro_evaluacion: boolean;
    };
  }>
> {
  const auth = assertApprovedStaffForAuditorMutation(params.profile);
  if (!auth.ok) return auth;

  let cleanAuditorId: string;
  let cleanEvalId: string;
  try {
    cleanAuditorId = assertValidUuid(params.auditorId, 'auditor');
    cleanEvalId = assertValidUuid(params.evaluacionId, 'evaluación in situ');
  } catch (err) {
    return { ok: false, error: translateAuditorPersistenceError(err) };
  }

  try {
    // evaluacion_in_situ_auditor supports deleted_at & deleted_by only (no delete_reason column)
    const { error } = await params.client
      .from('evaluacion_in_situ_auditor')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: params.profile?.id || null,
      })
      .eq('id', cleanEvalId)
      .eq('id_auditor', cleanAuditorId)
      .is('deleted_at', null);

    if (error) {
      return {
        ok: false,
        error: translateAuditorPersistenceError(
          error,
          'No se pudo archivar la evaluación in situ.'
        ),
      };
    }

    const remaining = (params.existingEvaluaciones || []).filter(
      (ev) => !ev.deleted_at && ev.id !== cleanEvalId
    );
    const summary = await syncAuditorEvaluacionSummaryInDb({
      client: params.client,
      auditorId: cleanAuditorId,
      fallbackEvaluaciones: remaining,
    });

    return { ok: true, data: { id: cleanEvalId, summary } };
  } catch (err) {
    return {
      ok: false,
      error: translateAuditorPersistenceError(
        err,
        'No se pudo archivar la evaluación in situ.'
      ),
    };
  }
}
