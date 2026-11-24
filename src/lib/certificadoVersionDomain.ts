/**
 * Step 2.2 — Pure Domain Engine for Certificate Versioning (`certificado_version`),
 * 4-Category Audit Migration Classifier, In-Memory Version Cloning & Audit Migration,
 * and Typed Supabase RPC Persistence.
 *
 * Strictly typed (`strict: true`, 0 `any` / `as any`), Spanish messages, and Zero-UUID compliant.
 */

import type {
  CertificadoDetailEntity,
  CertificadoVersionSnapshot,
  ContactoCertificadoEntity,
  FechaCertificadoEntity,
  NonApplicableRequirementEntity,
  ProcessCertificateClausesEntry,
  ProcessEntity,
  ProcesoPorSitioLink,
  ShiftEntity,
  SiteEntity,
  TurnoPorSitioLink,
} from './multisiteSampling';
import { containsRawUuid, isValidUuid } from './zeroUuid';

// =============================================================================
// 1. 4-Category Audit Classifier (Exact 30-Day Pre-Execution Window)
// =============================================================================

export type AuditMigrationCategory =
  | 'FINALIZADA_HISTORICA'
  | 'POST_EJECUCION_CIERRE'
  | 'PRE_EJECUCION_PROXIMA'
  | 'FUTURA';

export type AuditMigrationAction =
  | 'MANTENER_ANTERIOR'
  | 'MIGRAR_NUEVA'
  | 'PENDIENTE_DECISION';

export const AUDIT_MIGRATION_CATEGORY_LABELS: Record<AuditMigrationCategory, string> = {
  FINALIZADA_HISTORICA: 'Finalizadas (Históricas)',
  POST_EJECUCION_CIERRE: 'Post-ejecución (En cierre)',
  PRE_EJECUCION_PROXIMA: 'Pre-ejecución (Próximas)',
  FUTURA: 'Auditorías futuras',
};

export const AUDIT_MIGRATION_CATEGORY_DESCRIPTIONS: Record<AuditMigrationCategory, string> = {
  FINALIZADA_HISTORICA:
    'Auditorías cerradas y revisadas o canceladas; permanecen en la versión histórica.',
  POST_EJECUCION_CIERRE:
    'Auditorías con fecha real ejecutada o en proceso de cierre sin revisión final; requieren decisión manual.',
  PRE_EJECUCION_PROXIMA:
    'Auditorías en ejecución o programadas dentro de los próximos 30 días; requieren decisión manual.',
  FUTURA:
    'Auditorías planificadas a más de 30 días o en borrador futuro; preseleccionadas para migrar a la nueva versión.',
};

export const AUDIT_MIGRATION_ACTION_LABELS: Record<AuditMigrationAction, string> = {
  MANTENER_ANTERIOR: 'Mantener en versión anterior',
  MIGRAR_NUEVA: 'Migrar a nueva versión',
  PENDIENTE_DECISION: 'Pendiente de decisión',
};

export interface AuditFechaClassifierItem {
  id?: string;
  numero_secuencia?: number;
  tipo_fecha: 'PREPROGRAMADA_MES' | 'PROGRAMADA_EXACTA' | 'REAL' | string;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  anio?: number | null;
  mes?: number | null;
  deleted_at?: string | null;
}

export interface AuditVersionClassificationInput {
  id: string;
  codigo_auditoria?: string | null;
  id_certificado?: string;
  id_certificado_version?: string | null;
  tipo_auditoria?: string | null;
  estado_ciclo?: string | null;
  estatus?: string | null;
  revisado?: boolean | null;
  fecha_programacion?: string | null;
  fechas?: ReadonlyArray<AuditFechaClassifierItem>;
  auditoria_fecha?: ReadonlyArray<AuditFechaClassifierItem>;
  deleted_at?: string | null;
}

export interface AuditVersionClassificationResult {
  category: AuditMigrationCategory;
  categoryLabel: string;
  defaultAction: AuditMigrationAction;
  requiresManualDecision: boolean;
  effectiveDate: string | null;
  hasActiveRealDate: boolean;
  reason: string;
}

export interface AuditVersionResolutionItem {
  id_auditoria: string;
  codigo_auditoria: string;
  tipo_auditoria: string;
  estado_ciclo: string;
  revisado: boolean;
  effectiveDate: string | null;
  hasActiveRealDate: boolean;
  category: AuditMigrationCategory;
  categoryLabel: string;
  requiresManualDecision: boolean;
  action: AuditMigrationAction;
  actionLabel: string;
}

const ISO_DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

function normalizeIsoDateOnly(input: Date | string | null | undefined): string {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) {
      return new Date().toISOString().slice(0, 10);
    }
    return input.toISOString().slice(0, 10);
  }
  if (typeof input === 'string') {
    const candidate = input.trim().slice(0, 10);
    if (ISO_DATE_ONLY_REGEX.test(candidate)) {
      return candidate;
    }
    const parsed = Date.parse(input);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString().slice(0, 10);
    }
  }
  return new Date().toISOString().slice(0, 10);
}

/**
 * Pure UTC calendar date offset (`YYYY-MM-DD` + `days`), immune to local timezone / DST drift.
 */
export function addDaysToIsoDate(isoDate: string, days: number): string {
  const clean = normalizeIsoDateOnly(isoDate);
  const match = ISO_DATE_ONLY_REGEX.exec(clean);
  if (!match) return clean;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const dt = new Date(Date.UTC(year, month - 1, day + days));
  return dt.toISOString().slice(0, 10);
}

function resolveFechaEntries(
  audit: AuditVersionClassificationInput
): AuditFechaClassifierItem[] {
  const raw =
    Array.isArray(audit.auditoria_fecha) && audit.auditoria_fecha.length > 0
      ? audit.auditoria_fecha
      : Array.isArray(audit.fechas)
        ? audit.fechas
        : [];
  return raw.filter((entry) => !entry.deleted_at);
}

function extractEntryIsoDate(entry: AuditFechaClassifierItem): string | null {
  if (entry.fecha_inicio && entry.fecha_inicio.trim().length >= 10) {
    return normalizeIsoDateOnly(entry.fecha_inicio);
  }
  if (entry.fecha_fin && entry.fecha_fin.trim().length >= 10) {
    return normalizeIsoDateOnly(entry.fecha_fin);
  }
  if (
    typeof entry.anio === 'number' &&
    Number.isInteger(entry.anio) &&
    typeof entry.mes === 'number' &&
    Number.isInteger(entry.mes) &&
    entry.mes >= 1 &&
    entry.mes <= 12
  ) {
    return `${String(entry.anio).padStart(4, '0')}-${String(entry.mes).padStart(2, '0')}-01`;
  }
  return null;
}

function pickLatestDateEntry(
  entries: ReadonlyArray<AuditFechaClassifierItem>
): AuditFechaClassifierItem | null {
  if (entries.length === 0) return null;
  let best = entries[0];
  let bestSeq = typeof best.numero_secuencia === 'number' ? best.numero_secuencia : 0;
  for (let i = 1; i < entries.length; i += 1) {
    const candidate = entries[i];
    const seq = typeof candidate.numero_secuencia === 'number' ? candidate.numero_secuencia : i;
    if (seq >= bestSeq) {
      best = candidate;
      bestSeq = seq;
    }
  }
  return best;
}

/**
 * Deterministic 4-Category Audit Migration Classifier:
 * 1. `FINALIZADA_HISTORICA`: `(estado_ciclo === 'Cerrada' && revisado === true)` OR `estado_ciclo === 'Cancelada'` -> `'MANTENER_ANTERIOR'`
 * 2. `POST_EJECUCION_CIERRE`: active `REAL` date OR `estado_ciclo === 'Auditada'` OR (`estado_ciclo === 'Cerrada' && !revisado`) -> `'PENDIENTE_DECISION'`
 * 3. `PRE_EJECUCION_PROXIMA`: no active `REAL` date AND (`estado_ciclo === 'En Ejecución'` OR `effectiveDate <= addDays(referenceDate, 30)`) -> `'PENDIENTE_DECISION'`
 * 4. `FUTURA`: no active `REAL` date AND (`effectiveDate > addDays(referenceDate, 30)` OR future draft without near date) -> `'MIGRAR_NUEVA'`
 */
export function classifyAuditForVersionMigration(
  audit: AuditVersionClassificationInput,
  referenceDate: Date | string = new Date()
): AuditVersionClassificationResult {
  const refIso = normalizeIsoDateOnly(referenceDate);
  const windowLimitIso = addDaysToIsoDate(refIso, 30);

  const estadoCiclo = (audit.estado_ciclo || audit.estatus || 'Borrador').trim();
  const revisado = Boolean(audit.revisado);
  const activeDates = resolveFechaEntries(audit);

  const realDates = activeDates.filter(
    (entry) => (entry.tipo_fecha || '').trim().toUpperCase() === 'REAL'
  );
  const hasActiveRealDate = realDates.length > 0;
  const latestRealEntry = pickLatestDateEntry(realDates);

  const plannedDates = activeDates.filter(
    (entry) => (entry.tipo_fecha || '').trim().toUpperCase() !== 'REAL'
  );
  const latestPlannedEntry = pickLatestDateEntry(plannedDates);

  const fallbackProgDate =
    audit.fecha_programacion && audit.fecha_programacion.trim().length >= 10
      ? normalizeIsoDateOnly(audit.fecha_programacion)
      : null;

  const effectiveDate =
    (latestRealEntry ? extractEntryIsoDate(latestRealEntry) : null) ||
    (latestPlannedEntry ? extractEntryIsoDate(latestPlannedEntry) : null) ||
    fallbackProgDate;

  // Category 1: Finalizadas (Históricas)
  if ((estadoCiclo === 'Cerrada' && revisado) || estadoCiclo === 'Cancelada') {
    return {
      category: 'FINALIZADA_HISTORICA',
      categoryLabel: AUDIT_MIGRATION_CATEGORY_LABELS.FINALIZADA_HISTORICA,
      defaultAction: 'MANTENER_ANTERIOR',
      requiresManualDecision: false,
      effectiveDate,
      hasActiveRealDate,
      reason:
        estadoCiclo === 'Cancelada'
          ? 'Auditoría cancelada en la versión origen.'
          : 'Auditoría cerrada y con revisión final aprobada.',
    };
  }

  // Category 2: Post-ejecución (En cierre)
  if (
    hasActiveRealDate ||
    estadoCiclo === 'Auditada' ||
    estadoCiclo === 'Completada' ||
    (estadoCiclo === 'Cerrada' && !revisado)
  ) {
    return {
      category: 'POST_EJECUCION_CIERRE',
      categoryLabel: AUDIT_MIGRATION_CATEGORY_LABELS.POST_EJECUCION_CIERRE,
      defaultAction: 'PENDIENTE_DECISION',
      requiresManualDecision: true,
      effectiveDate,
      hasActiveRealDate,
      reason: hasActiveRealDate
        ? 'Posee fecha real de ejecución registrada y aún no finaliza su revisión.'
        : 'Se encuentra ejecutada o cerrada pendiente de revisión final.',
    };
  }

  // Category 3: Pre-ejecución (Próximas <= 30 días o En Ejecución)
  const plannedEffectiveDate =
    (latestPlannedEntry ? extractEntryIsoDate(latestPlannedEntry) : null) || fallbackProgDate;

  if (
    estadoCiclo === 'En Ejecución' ||
    (plannedEffectiveDate !== null && plannedEffectiveDate <= windowLimitIso)
  ) {
    return {
      category: 'PRE_EJECUCION_PROXIMA',
      categoryLabel: AUDIT_MIGRATION_CATEGORY_LABELS.PRE_EJECUCION_PROXIMA,
      defaultAction: 'PENDIENTE_DECISION',
      requiresManualDecision: true,
      effectiveDate: plannedEffectiveDate,
      hasActiveRealDate: false,
      reason:
        estadoCiclo === 'En Ejecución'
          ? 'Auditoría actualmente en ejecución.'
          : 'Fecha programada dentro de la ventana próxima de 30 días.',
    };
  }

  // Category 4: Auditorías futuras (> 30 días o borrador futuro sin fecha próxima)
  return {
    category: 'FUTURA',
    categoryLabel: AUDIT_MIGRATION_CATEGORY_LABELS.FUTURA,
    defaultAction: 'MIGRAR_NUEVA',
    requiresManualDecision: false,
    effectiveDate: plannedEffectiveDate,
    hasActiveRealDate: false,
    reason:
      plannedEffectiveDate !== null
        ? 'Fecha planificada posterior a la ventana de 30 días.'
        : 'Planificación futura sin fecha próxima asignada.',
  };
}

/**
 * Builds the default resolution plan for all active audits belonging to `sourceVersionId`.
 */
export function buildDefaultAuditVersionResolutions(
  audits: ReadonlyArray<AuditVersionClassificationInput>,
  sourceVersionId?: string | null,
  referenceDate: Date | string = new Date()
): AuditVersionResolutionItem[] {
  const cleanSourceVersionId = (sourceVersionId || '').trim();

  return audits
    .filter((audit) => {
      if (audit.deleted_at) return false;
      if (cleanSourceVersionId && audit.id_certificado_version) {
        return audit.id_certificado_version.trim() === cleanSourceVersionId;
      }
      return true;
    })
    .map((audit) => {
      const classification = classifyAuditForVersionMigration(audit, referenceDate);
      const rawCode = (audit.codigo_auditoria || '').trim();
      const safeCode =
        rawCode && !containsRawUuid(rawCode) ? rawCode : 'Auditoría sin código';

      return {
        id_auditoria: audit.id,
        codigo_auditoria: safeCode,
        tipo_auditoria: (audit.tipo_auditoria || 'Auditoría').trim(),
        estado_ciclo: (audit.estado_ciclo || audit.estatus || 'Borrador').trim(),
        revisado: Boolean(audit.revisado),
        effectiveDate: classification.effectiveDate,
        hasActiveRealDate: classification.hasActiveRealDate,
        category: classification.category,
        categoryLabel: classification.categoryLabel,
        requiresManualDecision: classification.requiresManualDecision,
        action: classification.defaultAction,
        actionLabel: AUDIT_MIGRATION_ACTION_LABELS[classification.defaultAction],
      };
    });
}

export interface AuditVersionResolutionsValidationResult {
  valid: boolean;
  errorMessage: string | null;
  migrateAuditIds: string[];
  keepAuditIds: string[];
  pendingDecisionCount: number;
}

/**
 * Blocks confirmation whenever any audit (particularly Category 2 `POST_EJECUCION_CIERRE`
 * or Category 3 `PRE_EJECUCION_PROXIMA`) remains in `'PENDIENTE_DECISION'`.
 */
export function validateAuditVersionResolutions(
  resolutions: ReadonlyArray<AuditVersionResolutionItem>
): AuditVersionResolutionsValidationResult {
  const seenAuditIds = new Set<string>();
  const migrateAuditIds: string[] = [];
  const keepAuditIds: string[] = [];
  const pendingLabels: string[] = [];
  let pendingDecisionCount = 0;

  for (const item of resolutions) {
    const cleanAuditId = (item.id_auditoria || '').trim();
    if (!cleanAuditId) {
      return {
        valid: false,
        errorMessage: 'Una o más auditorías listadas no poseen una referencia válida.',
        migrateAuditIds: [],
        keepAuditIds: [],
        pendingDecisionCount: 0,
      };
    }

    if (seenAuditIds.has(cleanAuditId)) {
      return {
        valid: false,
        errorMessage: 'Se detectaron auditorías duplicadas en el plan de migración de versión.',
        migrateAuditIds: [],
        keepAuditIds: [],
        pendingDecisionCount: 0,
      };
    }
    seenAuditIds.add(cleanAuditId);

    if (item.action === 'PENDIENTE_DECISION') {
      pendingDecisionCount += 1;
      const safeCode =
        item.codigo_auditoria && !containsRawUuid(item.codigo_auditoria)
          ? item.codigo_auditoria.trim()
          : '';
      if (safeCode && pendingLabels.length < 3) {
        pendingLabels.push(safeCode);
      }
      continue;
    }

    if (item.action === 'MIGRAR_NUEVA') {
      migrateAuditIds.push(cleanAuditId);
    } else if (item.action === 'MANTENER_ANTERIOR') {
      keepAuditIds.push(cleanAuditId);
    } else {
      pendingDecisionCount += 1;
    }
  }

  if (pendingDecisionCount > 0) {
    const codesHint =
      pendingLabels.length > 0
        ? ` (${pendingLabels.join(', ')}${pendingDecisionCount > pendingLabels.length ? ', ...' : ''})`
        : '';
    return {
      valid: false,
      errorMessage: `Debe definir manualmente si mantiene o migra ${pendingDecisionCount === 1 ? 'la auditoría pendiente' : `las ${pendingDecisionCount} auditorías pendientes`} de decisión en Post-ejecución o Pre-ejecución${codesHint}.`,
      migrateAuditIds: [],
      keepAuditIds: [],
      pendingDecisionCount,
    };
  }

  return {
    valid: true,
    errorMessage: null,
    migrateAuditIds,
    keepAuditIds,
    pendingDecisionCount: 0,
  };
}

// =============================================================================
// 2. Pure In-Memory Version Cloning (0 `fecha_certificado`, Shared `alcance`)
// =============================================================================

export interface CloneCertificateVersionOverrides {
  id_organizacion_version?: string;
  organizacion_abreviacion?: string;
  id_estatus?: string;
  estatus?: string;
  id_sector_iaf?: string;
  sector_iaf?: number;
  sector_iaf_descripcion?: string;
  id_subsector_iaf?: string;
  subsector_iaf_codigo?: string;
  subsector_iaf_descripcion?: string;
  subsector_categoria_riesgo?: 'ALTO' | 'MEDIO' | 'BAJO';
  multisitio?: boolean;
  notas_version?: string | null;
}

export interface CloneCertificateVersionParams {
  cert: CertificadoDetailEntity;
  sourceVersionId?: string;
  overrides?: CloneCertificateVersionOverrides;
  extraProcesosPorSitio?: ReadonlyArray<ProcesoPorSitioLink>;
  extraTurnosPorSitio?: ReadonlyArray<TurnoPorSitioLink>;
  generateUuid?: () => string;
}

export interface ClonedVersionCounts {
  sitios: number;
  turnos_por_sitio: number;
  procesos: number;
  procesos_por_sitio: number;
  no_aplicables: number;
  turnos: number;
  contactos: number;
  compartidos: number;
  fechas: 0;
}

export interface CloneCertificateVersionResult {
  nextCert: CertificadoDetailEntity;
  newVersion: CertificadoVersionSnapshot;
  sourceVersionId: string;
  newVersionId: string;
  sitioMap: Record<string, string>;
  procesoMap: Record<string, string>;
  clonedSitios: SiteEntity[];
  clonedProcesos: ProcessEntity[];
  clonedTurnos: ShiftEntity[];
  clonedNoAplicables: NonApplicableRequirementEntity[];
  clonedContactos: ContactoCertificadoEntity[];
  clonedProcesosPorSitio: ProcesoPorSitioLink[];
  clonedTurnosPorSitio: TurnoPorSitioLink[];
  clonedFechas: FechaCertificadoEntity[];
  clonedCounts: ClonedVersionCounts;
}

function defaultUuidGenerator(): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const hex = (): string =>
    Math.floor(Math.random() * 0x10000)
      .toString(16)
      .padStart(4, '0');
  return `${hex()}${hex()}-${hex()}-4${hex().slice(1)}-8${hex().slice(1)}-${hex()}${hex()}${hex()}`;
}

function matchesSourceVersion<T extends { id_certificado_version?: string }>(
  item: T,
  sourceVersionId: string,
  defaultVersionId: string
): boolean {
  const itemVer = (item.id_certificado_version || '').trim();
  if (itemVer) return itemVer === sourceVersionId;
  return !defaultVersionId || defaultVersionId === sourceVersionId;
}

/**
 * Clones a certificate version purely in memory, mirroring `fn_clonar_version_certificado`:
 * - Clones `sitios`, `turnos_por_sitio`, `procesos`, `procesos_por_sitio`, `requisitos_por_proceso` (filtering excluded clauses),
 *   `noAplicables`, `turnos`, `contactos` (with phones & emails), and active share descriptors.
 * - Guarantees **`clonedFechas = []`** (zero `fecha_certificado` duplicated onto the new version).
 * - Preserves `cert.alcanceDetalle` (and `cert.alcance`) strictly at the container `cert` level without duplication or loss.
 */
export function cloneCertificateVersionInMemory(
  params: CloneCertificateVersionParams
): CloneCertificateVersionResult {
  const { cert, overrides = {}, extraProcesosPorSitio = [], extraTurnosPorSitio = [] } = params;
  const makeUuid = params.generateUuid ?? defaultUuidGenerator;

  const existingVersions = (cert.versiones || []).filter((v) => !v.deleted_at);
  const requestedSourceId = (params.sourceVersionId || '').trim();
  const activeSnapshot =
    (requestedSourceId
      ? existingVersions.find((v) => v.id === requestedSourceId)
      : undefined) ||
    existingVersions.find((v) => v.es_version_actual) ||
    existingVersions[existingVersions.length - 1];

  const sourceVersionId =
    requestedSourceId ||
    activeSnapshot?.id ||
    (cert.selected_version_id || cert.id_certificado_version || '').trim() ||
    makeUuid();

  const defaultCertVerId = (cert.id_certificado_version || activeSnapshot?.id || '').trim();

  const maxVersionNum = existingVersions.reduce(
    (max, v) => (v.version_numero > max ? v.version_numero : max),
    cert.version_actual_numero ?? 1
  );
  const nextVersionNumber = maxVersionNum + 1;
  const newVersionId = makeUuid();

  // Source collections (prefer matching snapshot if populated, otherwise filter flat arrays by sourceVersionId)
  const sourceSitios: SiteEntity[] =
    activeSnapshot && Array.isArray(activeSnapshot.sitios)
      ? activeSnapshot.sitios
      : (cert.sitios || []).filter((s) =>
          matchesSourceVersion(s, sourceVersionId, defaultCertVerId)
        );

  const sourceProcesos: ProcessEntity[] =
    activeSnapshot && Array.isArray(activeSnapshot.procesos)
      ? activeSnapshot.procesos
      : (cert.procesos || []).filter((p) =>
          matchesSourceVersion(p, sourceVersionId, defaultCertVerId)
        );

  const sourceNoAplicables: NonApplicableRequirementEntity[] =
    activeSnapshot && Array.isArray(activeSnapshot.noAplicables)
      ? activeSnapshot.noAplicables
      : (cert.noAplicables || []).filter((na) =>
          matchesSourceVersion(na, sourceVersionId, defaultCertVerId)
        );

  const sourceTurnos: ShiftEntity[] =
    activeSnapshot && Array.isArray(activeSnapshot.turnos)
      ? activeSnapshot.turnos
      : (cert.turnos || []).filter((t) =>
          matchesSourceVersion(t, sourceVersionId, defaultCertVerId)
        );

  const sourceContactos: ContactoCertificadoEntity[] =
    activeSnapshot && Array.isArray(activeSnapshot.contactos)
      ? activeSnapshot.contactos
      : (cert.contactos || []).filter((c) =>
          matchesSourceVersion(c, sourceVersionId, defaultCertVerId)
        );

  // 1. Clone ISO 4.3 Non-Applicable Exclusions first so process clause filtering mirrors SQL
  const excludedCodesLower = new Set<string>();
  const clonedNoAplicables: NonApplicableRequirementEntity[] = sourceNoAplicables.map((na) => {
    const cleanCode = (na.requisito_codigo || '').trim().toLowerCase();
    if (cleanCode) excludedCodesLower.add(cleanCode);
    return {
      ...na,
      id: makeUuid(),
      id_certificado: cert.id,
      id_certificado_version: newVersionId,
    };
  });

  // 2. Build sitioMap & procesoMap
  const sitioMap: Record<string, string> = {};
  const procesoMap: Record<string, string> = {};
  let compartidosCount = 0;

  for (const s of sourceSitios) {
    const isSharedFromOther =
      Boolean(s.sharedFromCertId) && s.sharedFromCertId !== cert.id;
    if (isSharedFromOther) {
      sitioMap[s.id] = s.id;
      compartidosCount += 1;
    } else {
      sitioMap[s.id] = makeUuid();
    }
  }

  for (const p of sourceProcesos) {
    const isSharedFromOther =
      Boolean(p.sharedFromCertId) && p.sharedFromCertId !== cert.id;
    if (isSharedFromOther) {
      procesoMap[p.id] = p.id;
      compartidosCount += 1;
    } else {
      procesoMap[p.id] = makeUuid();
    }
  }

  // 3. Clone procesos (filtering excluded clause codes)
  const clonedProcesos: ProcessEntity[] = sourceProcesos.map((p) => {
    const isSharedFromOther =
      Boolean(p.sharedFromCertId) && p.sharedFromCertId !== cert.id;
    if (isSharedFromOther) {
      return {
        ...p,
        id_certificado_version: newVersionId,
      };
    }

    const newProcId = procesoMap[p.id];
    const filteredClausulas = (p.clausulas_cubiertas || []).filter(
      (c) => !excludedCodesLower.has((c || '').trim().toLowerCase())
    );
    const filteredReqDetalle = p.requisitos_detalle
      ? p.requisitos_detalle.filter(
          (d) => !excludedCodesLower.has((d.codigo || '').trim().toLowerCase())
        )
      : undefined;

    let clonedByCert: Record<string, ProcessCertificateClausesEntry> | undefined;
    if (p.requisitos_by_certificado) {
      clonedByCert = { ...p.requisitos_by_certificado };
      const sourceEntry =
        p.requisitos_by_certificado[`${cert.id}:${sourceVersionId}`] ||
        p.requisitos_by_certificado[cert.id];
      if (sourceEntry) {
        clonedByCert[`${cert.id}:${newVersionId}`] = {
          clausulas_cubiertas: (sourceEntry.clausulas_cubiertas || []).filter(
            (c) => !excludedCodesLower.has((c || '').trim().toLowerCase())
          ),
          ...(sourceEntry.requisitos_detalle
            ? {
                requisitos_detalle: sourceEntry.requisitos_detalle.filter(
                  (d) => !excludedCodesLower.has((d.codigo || '').trim().toLowerCase())
                ),
              }
            : {}),
          ...(typeof sourceEntry.sincronizar_requisitos === 'boolean'
            ? { sincronizar_requisitos: sourceEntry.sincronizar_requisitos }
            : {}),
        };
      }
    }

    return {
      ...p,
      id: newProcId,
      id_certificado: cert.id,
      id_certificado_version: newVersionId,
      ...(p.ownerCertId === cert.id || !p.ownerCertId ? { ownerCertId: cert.id } : {}),
      clausulas_cubiertas: filteredClausulas,
      ...(filteredReqDetalle ? { requisitos_detalle: filteredReqDetalle } : {}),
      ...(clonedByCert ? { requisitos_by_certificado: clonedByCert } : {}),
    };
  });

  // 4. Clone sitios, nested turnos_por_sitio and procesos_por_sitio
  const clonedTurnosPorSitio: TurnoPorSitioLink[] = [];
  const clonedProcesosPorSitio: ProcesoPorSitioLink[] = [];

  const clonedSitios: SiteEntity[] = sourceSitios.map((s) => {
    const isSharedFromOther =
      Boolean(s.sharedFromCertId) && s.sharedFromCertId !== cert.id;
    const newSitioId = sitioMap[s.id];

    const siteTurnos = (s.turnos_por_sitio || [])
      .filter((tps) => !tps.deleted_at)
      .map((tps) => {
        const clonedLink: TurnoPorSitioLink = {
          ...tps,
          id: isSharedFromOther ? tps.id : makeUuid(),
          id_sitio: newSitioId,
          id_certificado_version: newVersionId,
          deleted_at: null,
        };
        clonedTurnosPorSitio.push(clonedLink);
        return clonedLink;
      });

    const siteProcs = (s.procesos_por_sitio || [])
      .filter((pps) => !pps.deleted_at)
      .map((pps) => {
        const mappedProcId = procesoMap[pps.id_proceso] || pps.id_proceso;
        const clonedLink: ProcesoPorSitioLink = {
          ...pps,
          id: isSharedFromOther ? pps.id : makeUuid(),
          id_certificado: cert.id,
          id_certificado_version: newVersionId,
          id_sitio: newSitioId,
          id_proceso: mappedProcId,
          deleted_at: null,
        };
        clonedProcesosPorSitio.push(clonedLink);
        return clonedLink;
      });

    if (isSharedFromOther) {
      return {
        ...s,
        id_certificado_version: newVersionId,
      };
    }

    return {
      ...s,
      id: newSitioId,
      id_certificado: cert.id,
      id_certificado_version: newVersionId,
      ...(s.turnos_vinculados ? { turnos_vinculados: [...s.turnos_vinculados] } : {}),
      ...(s.procesos_vinculados ? { procesos_vinculados: [...s.procesos_vinculados] } : {}),
      ...(s.turnos_por_sitio ? { turnos_por_sitio: siteTurnos } : {}),
      ...(s.procesos_por_sitio ? { procesos_por_sitio: siteProcs } : {}),
    };
  });

  // Also clone any extra top-level turnos_por_sitio / procesos_por_sitio provided for sourceVersionId
  for (const tps of extraTurnosPorSitio) {
    if (tps.deleted_at) continue;
    const mappedSitioId = sitioMap[tps.id_sitio];
    if (!mappedSitioId) continue;
    clonedTurnosPorSitio.push({
      ...tps,
      id: makeUuid(),
      id_sitio: mappedSitioId,
      id_certificado_version: newVersionId,
      deleted_at: null,
    });
  }

  for (const pps of extraProcesosPorSitio) {
    if (pps.deleted_at) continue;
    const mappedSitioId = sitioMap[pps.id_sitio];
    const mappedProcId = procesoMap[pps.id_proceso];
    if (!mappedSitioId || !mappedProcId) continue;
    clonedProcesosPorSitio.push({
      ...pps,
      id: makeUuid(),
      id_certificado: cert.id,
      id_certificado_version: newVersionId,
      id_sitio: mappedSitioId,
      id_proceso: mappedProcId,
      deleted_at: null,
    });
  }

  // 5. Clone turnos (preserving catalog turno IDs, associating with newVersionId & counting shared)
  const clonedTurnos: ShiftEntity[] = sourceTurnos.map((t) => {
    if (t.sharedFromCertId && t.sharedFromCertId !== cert.id) {
      compartidosCount += 1;
    }
    return {
      ...t,
      id_certificado_version: newVersionId,
      sitios_vinculados: [...(t.sitios_vinculados || [])],
    };
  });

  // 6. Clone contactos (own contacts get new UUIDs + cloned phones & emails)
  const clonedContactos: ContactoCertificadoEntity[] = sourceContactos.map((c) => {
    const isSharedFromOther =
      Boolean(c.sharedFromCertId) && c.sharedFromCertId !== cert.id;
    if (isSharedFromOther) {
      compartidosCount += 1;
      return {
        ...c,
        id_certificado_version: newVersionId,
      };
    }

    const newContactId = makeUuid();
    return {
      ...c,
      id: newContactId,
      id_certificado: cert.id,
      id_certificado_version: newVersionId,
      telefonos: (c.telefonos || []).map((tel) => ({
        ...tel,
        id: makeUuid(),
        id_contacto: newContactId,
      })),
      emails: (c.emails || []).map((em) => ({
        ...em,
        id: makeUuid(),
        id_contacto: newContactId,
      })),
    };
  });

  // 7. Build new CertificadoVersionSnapshot (NO alcance, 0 fecha_certificado)
  const sourceNotas =
    typeof overrides.notas_version === 'string' && overrides.notas_version.trim().length > 0
      ? overrides.notas_version.trim()
      : `Versión ${nextVersionNumber} clonada desde v${activeSnapshot?.version_numero ?? 1}.`;

  const resolvedOrgVersionId =
    overrides.id_organizacion_version ||
    activeSnapshot?.id_organizacion_version ||
    cert.id_organizacion_version ||
    '';

  // Tag legacy unversioned fechas with `sourceVersionId` so v1 keeps its dates and v2 has strictly 0 dates
  const preservedSourceFechas: FechaCertificadoEntity[] = (cert.fechas || []).map((f) =>
    f.id_certificado_version ? f : { ...f, id_certificado_version: sourceVersionId }
  );
  const sourceFechasForSnapshot = preservedSourceFechas.filter(
    (f) => f.id_certificado_version === sourceVersionId
  );

  const newVersion: CertificadoVersionSnapshot = {
    id: newVersionId,
    id_certificado: cert.id,
    id_organizacion_version: resolvedOrgVersionId,
    version_numero: nextVersionNumber,
    es_version_actual: true,
    notas_version: sourceNotas,
    id_estatus: overrides.id_estatus ?? activeSnapshot?.id_estatus ?? cert.id_estatus,
    estatus: overrides.estatus ?? activeSnapshot?.estatus ?? cert.estatus,
    id_sector_iaf: overrides.id_sector_iaf ?? activeSnapshot?.id_sector_iaf ?? cert.id_sector_iaf,
    sector_iaf: overrides.sector_iaf ?? activeSnapshot?.sector_iaf ?? cert.sector_iaf,
    sector_iaf_descripcion:
      overrides.sector_iaf_descripcion ??
      activeSnapshot?.sector_iaf_descripcion ??
      cert.sector_iaf_descripcion,
    id_subsector_iaf:
      overrides.id_subsector_iaf ?? activeSnapshot?.id_subsector_iaf ?? cert.id_subsector_iaf,
    subsector_iaf_codigo:
      overrides.subsector_iaf_codigo ??
      activeSnapshot?.subsector_iaf_codigo ??
      cert.subsector_iaf_codigo,
    subsector_iaf_descripcion:
      overrides.subsector_iaf_descripcion ??
      activeSnapshot?.subsector_iaf_descripcion ??
      cert.subsector_iaf_descripcion,
    subsector_categoria_riesgo:
      overrides.subsector_categoria_riesgo ??
      activeSnapshot?.subsector_categoria_riesgo ??
      cert.subsector_categoria_riesgo,
    multisitio: overrides.multisitio ?? activeSnapshot?.multisitio ?? cert.multisitio,
    organizacion_abreviacion:
      overrides.organizacion_abreviacion ??
      activeSnapshot?.organizacion_abreviacion ??
      cert.organizacion_abreviacion ??
      null,
    sitios: clonedSitios,
    procesos: clonedProcesos,
    turnos: clonedTurnos,
    noAplicables: clonedNoAplicables,
    contactos: clonedContactos,
    fechas: [],
    deleted_at: null,
  };

  // Ensure source snapshot exists in `versiones` and mark prior versions `es_version_actual = false`
  const baseVersionList: CertificadoVersionSnapshot[] =
    existingVersions.length > 0
      ? existingVersions.map((v) => ({
          ...v,
          es_version_actual: false,
          ...(v.id === sourceVersionId
            ? {
                sitios: v.sitios ?? sourceSitios,
                procesos: v.procesos ?? sourceProcesos,
                turnos: v.turnos ?? sourceTurnos,
                noAplicables: v.noAplicables ?? sourceNoAplicables,
                contactos: v.contactos ?? sourceContactos,
                fechas: v.fechas ?? sourceFechasForSnapshot,
              }
            : {}),
        }))
      : [
          {
            id: sourceVersionId,
            id_certificado: cert.id,
            id_organizacion_version: cert.id_organizacion_version || '',
            version_numero: cert.version_actual_numero ?? 1,
            es_version_actual: false,
            notas_version: 'Versión inicial.',
            id_estatus: cert.id_estatus,
            estatus: cert.estatus,
            id_sector_iaf: cert.id_sector_iaf,
            sector_iaf: cert.sector_iaf,
            sector_iaf_descripcion: cert.sector_iaf_descripcion,
            id_subsector_iaf: cert.id_subsector_iaf,
            subsector_iaf_codigo: cert.subsector_iaf_codigo,
            subsector_iaf_descripcion: cert.subsector_iaf_descripcion,
            subsector_categoria_riesgo: cert.subsector_categoria_riesgo,
            multisitio: cert.multisitio,
            organizacion_abreviacion: cert.organizacion_abreviacion ?? null,
            sitios: sourceSitios,
            procesos: sourceProcesos,
            turnos: sourceTurnos,
            noAplicables: sourceNoAplicables,
            contactos: sourceContactos,
            fechas: sourceFechasForSnapshot,
            deleted_at: null,
          },
        ];

  // Preserve `cert.alcanceDetalle` (and `cert.alcance`) untouched at the certificate container level
  const nextCert: CertificadoDetailEntity = {
    ...cert,
    id_certificado_version: newVersionId,
    selected_version_id: newVersionId,
    version_actual_numero: nextVersionNumber,
    id_organizacion_version: resolvedOrgVersionId || cert.id_organizacion_version,
    organizacion_abreviacion:
      overrides.organizacion_abreviacion ?? cert.organizacion_abreviacion,
    id_estatus: newVersion.id_estatus,
    estatus: newVersion.estatus,
    id_sector_iaf: newVersion.id_sector_iaf,
    sector_iaf: newVersion.sector_iaf,
    sector_iaf_descripcion: newVersion.sector_iaf_descripcion,
    id_subsector_iaf: newVersion.id_subsector_iaf,
    subsector_iaf_codigo: newVersion.subsector_iaf_codigo,
    subsector_iaf_descripcion: newVersion.subsector_iaf_descripcion,
    subsector_categoria_riesgo: newVersion.subsector_categoria_riesgo,
    multisitio: newVersion.multisitio,
    alcance: cert.alcance,
    alcanceDetalle: cert.alcanceDetalle ?? null,
    versiones: [...baseVersionList, newVersion],
    sitios: [...(cert.sitios || []), ...clonedSitios],
    procesos: [...(cert.procesos || []), ...clonedProcesos],
    turnos: [...(cert.turnos || []), ...clonedTurnos],
    noAplicables: [...(cert.noAplicables || []), ...clonedNoAplicables],
    contactos: [...(cert.contactos || []), ...clonedContactos],
    fechas: preservedSourceFechas,
  };

  return {
    nextCert,
    newVersion,
    sourceVersionId,
    newVersionId,
    sitioMap,
    procesoMap,
    clonedSitios,
    clonedProcesos,
    clonedTurnos,
    clonedNoAplicables,
    clonedContactos,
    clonedProcesosPorSitio,
    clonedTurnosPorSitio,
    clonedFechas: [],
    clonedCounts: {
      sitios: clonedSitios.length,
      turnos_por_sitio: clonedTurnosPorSitio.length,
      procesos: clonedProcesos.length,
      procesos_por_sitio: clonedProcesosPorSitio.length,
      no_aplicables: clonedNoAplicables.length,
      turnos: clonedTurnos.length,
      contactos: clonedContactos.length,
      compartidos: compartidosCount,
      fechas: 0,
    },
  };
}

// =============================================================================
// 3. In-Memory Audit Migration (Remapping sitios, procesos, turnos & hallazgo)
// =============================================================================

export interface AuditMigrationTurnoLink {
  id: string;
  id_turnos_por_sitio: string;
  id_turno?: string;
  deleted_at?: string | null;
}

export interface AuditMigrationProcesoLink {
  id: string;
  id_procesos_por_sitio: string;
  id_proceso: string;
  nombre_proceso?: string;
  turnos?: AuditMigrationTurnoLink[];
  deleted_at?: string | null;
}

export interface AuditMigrationSitioLink {
  id: string;
  id_auditoria: string;
  id_sitio: string;
  numero_sitio?: number;
  turnos?: AuditMigrationTurnoLink[];
  procesos?: AuditMigrationProcesoLink[];
  deleted_at?: string | null;
}

export interface AuditMigrationRecord {
  id: string;
  id_certificado: string;
  id_certificado_version?: string;
  codigo_auditoria?: string;
  sitios?: AuditMigrationSitioLink[];
  sitios_alcance_ids?: string[];
  deleted_at?: string | null;
}

export interface AuditMigrationHallazgoRecord {
  id: string;
  id_auditoria: string;
  id_requisito: string;
  id_sitio: string | null;
  id_proceso: string | null;
  deleted_at?: string | null;
}

export interface ApplyAuditMigrationParams<
  TAudit extends AuditMigrationRecord = AuditMigrationRecord,
  THallazgo extends AuditMigrationHallazgoRecord = AuditMigrationHallazgoRecord,
> {
  audits: ReadonlyArray<TAudit>;
  hallazgos?: ReadonlyArray<THallazgo>;
  sourceVersionId: string;
  targetVersionId: string;
  migratedAuditIds: ReadonlyArray<string>;
  sitioMap: Readonly<Record<string, string>>;
  procesoMap: Readonly<Record<string, string>>;
  targetVersionSitios?: ReadonlyArray<
    Pick<SiteEntity, 'id' | 'numero_sitio' | 'turnos_por_sitio' | 'procesos_por_sitio'>
  >;
  targetVersionProcesos?: ReadonlyArray<Pick<ProcessEntity, 'id' | 'nombre_proceso'>>;
  turnoPorSitioMap?: Readonly<Record<string, string>>;
  procesoPorSitioMap?: Readonly<Record<string, string>>;
}

export interface ApplyAuditMigrationResult<
  TAudit extends AuditMigrationRecord = AuditMigrationRecord,
  THallazgo extends AuditMigrationHallazgoRecord = AuditMigrationHallazgoRecord,
> {
  nextAudits: TAudit[];
  nextHallazgos: THallazgo[];
  migratedCount: number;
  keptCount: number;
}

/**
 * Pure immutable migration of selected audits from `sourceVersionId` to `targetVersionId`:
 * - Updates `id_certificado_version` on migrated audits only; keeps non-migrated audits on `sourceVersionId`.
 * - Remaps `sitios` (`sitios_por_auditoria`), `turnos` (`turnos_sitio_auditoria.id_turnos_por_sitio`),
 *   `procesos` (`procesos_sitio_auditoria.id_proceso` + `id_procesos_por_sitio`), and `hallazgos` (`id_sitio`, `id_proceso`, preserving `null`).
 */
export function applyAuditMigrationInMemory<
  TAudit extends AuditMigrationRecord = AuditMigrationRecord,
  THallazgo extends AuditMigrationHallazgoRecord = AuditMigrationHallazgoRecord,
>(
  params: ApplyAuditMigrationParams<TAudit, THallazgo>
): ApplyAuditMigrationResult<TAudit, THallazgo> {
  const {
    audits,
    hallazgos = [],
    sourceVersionId,
    targetVersionId,
    migratedAuditIds,
    sitioMap,
    procesoMap,
    targetVersionSitios = [],
    targetVersionProcesos = [],
    turnoPorSitioMap = {},
    procesoPorSitioMap = {},
  } = params;

  const migrateSet = new Set(migratedAuditIds.map((id) => id.trim()).filter(Boolean));
  const targetSiteById = new Map(targetVersionSitios.map((s) => [s.id, s]));
  const targetSiteByNumber = new Map(targetVersionSitios.map((s) => [s.numero_sitio, s]));
  const targetProcByLowerName = new Map(
    targetVersionProcesos.map((p) => [p.nombre_proceso.trim().toLowerCase(), p])
  );

  // Build turno_id lookup across target sites
  const targetTpsBySiteAndTurno = new Map<string, string>();
  const targetPpsBySiteAndProc = new Map<string, string>();
  for (const tgtSite of targetVersionSitios) {
    for (const tps of tgtSite.turnos_por_sitio || []) {
      if (!tps.deleted_at) {
        targetTpsBySiteAndTurno.set(`${tgtSite.id}:${tps.id_turno}`, tps.id);
      }
    }
    for (const pps of tgtSite.procesos_por_sitio || []) {
      if (!pps.deleted_at) {
        targetPpsBySiteAndProc.set(`${tgtSite.id}:${pps.id_proceso}`, pps.id);
      }
    }
  }

  const resolveNewSitioId = (oldSitioId: string, numeroSitio?: number): string => {
    const mapped = sitioMap[oldSitioId];
    if (mapped) return mapped;
    if (typeof numeroSitio === 'number') {
      const byNum = targetSiteByNumber.get(numeroSitio);
      if (byNum) return byNum.id;
    }
    return oldSitioId;
  };

  const resolveNewProcesoId = (oldProcId: string, nombreProceso?: string): string => {
    const mapped = procesoMap[oldProcId];
    if (mapped) return mapped;
    if (nombreProceso) {
      const byName = targetProcByLowerName.get(nombreProceso.trim().toLowerCase());
      if (byName) return byName.id;
    }
    return oldProcId;
  };

  let migratedCount = 0;
  let keptCount = 0;
  const actuallyMigratedAuditIds = new Set<string>();

  const nextAudits = audits.map((audit): TAudit => {
    if (audit.deleted_at) return audit;

    const belongsToSource =
      !audit.id_certificado_version || audit.id_certificado_version === sourceVersionId;
    if (!belongsToSource) return audit;

    if (!migrateSet.has(audit.id)) {
      keptCount += 1;
      return audit;
    }

    migratedCount += 1;
    actuallyMigratedAuditIds.add(audit.id);

    const remappedSitios: AuditMigrationSitioLink[] | undefined = audit.sitios?.map((sa) => {
      if (sa.deleted_at) return sa;
      const newSitioId = resolveNewSitioId(sa.id_sitio, sa.numero_sitio);
      const tgtSite = targetSiteById.get(newSitioId);

      const remappedTurnos: AuditMigrationTurnoLink[] | undefined = sa.turnos?.map((tsa) => {
        if (tsa.deleted_at) return tsa;
        const explicitTps = turnoPorSitioMap[tsa.id_turnos_por_sitio];
        const byTurnoId = tsa.id_turno
          ? targetTpsBySiteAndTurno.get(`${newSitioId}:${tsa.id_turno}`)
          : undefined;
        const fallbackSiteTps = tsa.id_turno
          ? tgtSite?.turnos_por_sitio?.find(
              (item) => !item.deleted_at && item.id_turno === tsa.id_turno
            )?.id
          : undefined;
        return {
          ...tsa,
          id_turnos_por_sitio:
            explicitTps || byTurnoId || fallbackSiteTps || tsa.id_turnos_por_sitio,
        };
      });

      const remappedProcesos: AuditMigrationProcesoLink[] | undefined = sa.procesos?.map((psa) => {
        if (psa.deleted_at) return psa;
        const newProcId = resolveNewProcesoId(psa.id_proceso, psa.nombre_proceso);
        const explicitPps = procesoPorSitioMap[psa.id_procesos_por_sitio];
        const bySiteAndProc = targetPpsBySiteAndProc.get(`${newSitioId}:${newProcId}`);
        const fallbackSitePps = tgtSite?.procesos_por_sitio?.find(
          (item) => !item.deleted_at && item.id_proceso === newProcId
        )?.id;

        const remappedProcTurnos: AuditMigrationTurnoLink[] | undefined = psa.turnos?.map(
          (tpa) => {
            if (tpa.deleted_at) return tpa;
            const explicitTps = turnoPorSitioMap[tpa.id_turnos_por_sitio];
            const byTurnoId = tpa.id_turno
              ? targetTpsBySiteAndTurno.get(`${newSitioId}:${tpa.id_turno}`)
              : undefined;
            return {
              ...tpa,
              id_turnos_por_sitio: explicitTps || byTurnoId || tpa.id_turnos_por_sitio,
            };
          }
        );

        return {
          ...psa,
          id_proceso: newProcId,
          id_procesos_por_sitio:
            explicitPps || bySiteAndProc || fallbackSitePps || psa.id_procesos_por_sitio,
          ...(remappedProcTurnos ? { turnos: remappedProcTurnos } : {}),
        };
      });

      return {
        ...sa,
        id_sitio: newSitioId,
        ...(remappedTurnos ? { turnos: remappedTurnos } : {}),
        ...(remappedProcesos ? { procesos: remappedProcesos } : {}),
      };
    });

    const remappedSitiosAlcanceIds = audit.sitios_alcance_ids
      ? audit.sitios_alcance_ids.map((sid) => resolveNewSitioId(sid))
      : undefined;

    return {
      ...audit,
      id_certificado_version: targetVersionId,
      ...(remappedSitios ? { sitios: remappedSitios } : {}),
      ...(remappedSitiosAlcanceIds ? { sitios_alcance_ids: remappedSitiosAlcanceIds } : {}),
    };
  });

  const nextHallazgos = hallazgos.map((h): THallazgo => {
    if (h.deleted_at || !actuallyMigratedAuditIds.has(h.id_auditoria)) {
      return h;
    }

    const nextSitio = h.id_sitio !== null ? resolveNewSitioId(h.id_sitio) : null;
    const nextProceso = h.id_proceso !== null ? resolveNewProcesoId(h.id_proceso) : null;

    if (nextSitio === h.id_sitio && nextProceso === h.id_proceso) {
      return h;
    }

    return {
      ...h,
      id_sitio: nextSitio,
      id_proceso: nextProceso,
    };
  });

  return {
    nextAudits,
    nextHallazgos,
    migratedCount,
    keptCount,
  };
}

// =============================================================================
// 4. Strictly Typed Structural Supabase RPC Clients & Spanish Error Translator
// =============================================================================

export interface CertVersionDbErrorLike {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

export interface CertVersionRpcResponse<TData = unknown> {
  data: TData | null;
  error: CertVersionDbErrorLike | null;
}

export interface CertVersionSupabaseClient {
  rpc(
    fn: string,
    params?: Record<string, unknown>
  ): PromiseLike<CertVersionRpcResponse>;
}

export interface CertVersionPersistenceResult<TData = undefined> {
  ok: boolean;
  data?: TData;
  error?: string;
}

const INLINE_UUID_REGEX =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

function scrubRawUuids(text: string): string {
  return text
    .replace(INLINE_UUID_REGEX, 'referencia interna')
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
 * Translates PostgreSQL / Supabase errors raised during `fn_clonar_version_certificado`
 * or `fn_migrar_auditorias_version_certificado` into Spanish messages strictly free of raw UUIDs.
 */
export function translateCertificadoVersionDbError(err: unknown): string {
  const { code, message, details, hint } = extractDbErrorParts(err);
  const combined = `${message} ${details} ${hint}`.trim();
  const lower = combined.toLowerCase();

  if (
    code === '42501' ||
    lower.includes('row-level security') ||
    lower.includes('permission denied') ||
    lower.includes('acceso denegado')
  ) {
    return 'Permisos insuficientes (RLS): solo personal ADMIN o WORKER aprobado puede clonar versiones o migrar auditorías de certificado.';
  }

  if (code === '23505' || lower.includes('duplicate key value')) {
    if (lower.includes('es_version_actual') || lower.includes('actual')) {
      return 'Ya existe otra versión marcada como actual para este certificado. Recargue los datos e intente nuevamente.';
    }
    if (lower.includes('version_numero')) {
      return 'Conflicto de numeración secuencial al crear la nueva versión del certificado. Recargue e intente nuevamente.';
    }
    return 'Ya existe un registro activo duplicado en la estructura de la versión del certificado.';
  }

  if (code === '23503' || lower.includes('foreign key constraint')) {
    return 'Referencia inválida en catálogos o entidades vinculadas al versionar o migrar auditorías del certificado.';
  }

  if (code === 'P0001' && message) {
    const cleaned = scrubRawUuids(message);
    if (cleaned) return cleaned;
  }

  if (message) {
    const cleaned = scrubRawUuids(message);
    if (cleaned) return cleaned;
  }

  return 'No se pudo completar la operación de versionado del certificado en la base de datos.';
}

export interface PersistCloneCertificadoVersionParams {
  id_certificado: string;
  id_estatus?: string | null;
  id_sector_iaf?: string | null;
  id_subsector_iaf?: string | null;
  multisitio?: boolean | null;
  id_organizacion_version?: string | null;
  notas_version?: string | null;
}

export interface PersistCloneCertificadoVersionResponse {
  new_version_id: string;
  source_version_id: string;
  version_numero: number;
  sitio_map: Record<string, string>;
  proceso_map: Record<string, string>;
  cloned_counts: {
    sitios: number;
    turnos_por_sitio: number;
    procesos: number;
    procesos_por_sitio: number;
    exclusiones: number;
    requisitos_por_proceso: number;
    contactos: number;
    compartidos: number;
  };
}

function parseUuidMap(raw: unknown): Record<string, string> | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (isValidUuid(key) && isValidUuid(val)) {
      result[key.trim()] = (val as string).trim();
    }
  }
  return result;
}

function toSafeCount(val: unknown): number {
  return typeof val === 'number' && Number.isFinite(val) && val >= 0 ? val : 0;
}

/**
 * Step 1 RPC Client: invokes `fn_clonar_version_certificado` without `p_alcance`.
 */
export async function persistCloneCertificadoVersion(
  supabase: CertVersionSupabaseClient,
  params: PersistCloneCertificadoVersionParams
): Promise<CertVersionPersistenceResult<PersistCloneCertificadoVersionResponse>> {
  if (!isValidUuid(params.id_certificado)) {
    return {
      ok: false,
      error: 'Debe seleccionar un certificado válido para crear una nueva versión.',
    };
  }

  const optionalUuidChecks: Array<[string | null | undefined, string]> = [
    [params.id_estatus, 'El estatus seleccionado no es válido.'],
    [params.id_sector_iaf, 'El sector IAF seleccionado no es válido.'],
    [params.id_subsector_iaf, 'El subsector IAF seleccionado no es válido.'],
    [params.id_organizacion_version, 'La versión de organización seleccionada no es válida.'],
  ];

  for (const [candidate, errorMsg] of optionalUuidChecks) {
    if (candidate !== undefined && candidate !== null && candidate.trim().length > 0) {
      if (!isValidUuid(candidate)) {
        return { ok: false, error: errorMsg };
      }
    }
  }

  const cleanNotas =
    typeof params.notas_version === 'string' && params.notas_version.trim().length > 0
      ? params.notas_version.trim()
      : null;

  if (cleanNotas !== null && containsRawUuid(cleanNotas)) {
    return {
      ok: false,
      error: 'Las notas de la versión no pueden contener identificadores internos.',
    };
  }

  const rpcPayload: Record<string, unknown> = {
    p_id_certificado: params.id_certificado.trim(),
    p_id_estatus: params.id_estatus?.trim() || null,
    p_id_sector_iaf: params.id_sector_iaf?.trim() || null,
    p_id_subsector_iaf: params.id_subsector_iaf?.trim() || null,
    p_multisitio: typeof params.multisitio === 'boolean' ? params.multisitio : null,
    p_id_organizacion_version: params.id_organizacion_version?.trim() || null,
    p_notas_version: cleanNotas,
  };

  try {
    const { data, error } = await supabase.rpc('fn_clonar_version_certificado', rpcPayload);

    if (error) {
      return {
        ok: false,
        error: translateCertificadoVersionDbError(error),
      };
    }

    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      return {
        ok: false,
        error:
          'El servidor devolvió una respuesta inesperada al clonar la versión del certificado.',
      };
    }

    const rec = data as Record<string, unknown>;
    if (!isValidUuid(rec.new_version_id) || !isValidUuid(rec.source_version_id)) {
      return {
        ok: false,
        error:
          'La clonación de la versión del certificado no devolvió referencias válidas.',
      };
    }

    const countsRaw =
      typeof rec.cloned_counts === 'object' && rec.cloned_counts !== null
        ? (rec.cloned_counts as Record<string, unknown>)
        : {};

    return {
      ok: true,
      data: {
        new_version_id: (rec.new_version_id as string).trim(),
        source_version_id: (rec.source_version_id as string).trim(),
        version_numero:
          typeof rec.version_numero === 'number' && rec.version_numero >= 1
            ? rec.version_numero
            : 1,
        sitio_map: parseUuidMap(rec.sitio_map) ?? {},
        proceso_map: parseUuidMap(rec.proceso_map) ?? {},
        cloned_counts: {
          sitios: toSafeCount(countsRaw.sitios),
          turnos_por_sitio: toSafeCount(countsRaw.turnos_por_sitio),
          procesos: toSafeCount(countsRaw.procesos),
          procesos_por_sitio: toSafeCount(countsRaw.procesos_por_sitio),
          exclusiones: toSafeCount(countsRaw.exclusiones),
          requisitos_por_proceso: toSafeCount(countsRaw.requisitos_por_proceso),
          contactos: toSafeCount(countsRaw.contactos),
          compartidos: toSafeCount(countsRaw.compartidos),
        },
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: translateCertificadoVersionDbError(err),
    };
  }
}

export interface PersistMigrateAuditsVersionParams {
  source_version_id: string;
  target_version_id: string;
  audit_ids_migrar: ReadonlyArray<string>;
  sitio_map?: Readonly<Record<string, string>>;
  proceso_map?: Readonly<Record<string, string>>;
}

export interface PersistMigrateAuditsVersionResponse {
  migrated_count: number;
  kept_count: number;
  source_version_id: string;
  target_version_id: string;
}

/**
 * Step 2 RPC Client: invokes `fn_migrar_auditorias_version_certificado` with
 * the audit IDs chosen for migration plus the `sitio_map` and `proceso_map` from Step 1.
 */
export async function persistMigrateAuditsVersion(
  supabase: CertVersionSupabaseClient,
  params: PersistMigrateAuditsVersionParams
): Promise<CertVersionPersistenceResult<PersistMigrateAuditsVersionResponse>> {
  if (!isValidUuid(params.source_version_id) || !isValidUuid(params.target_version_id)) {
    return {
      ok: false,
      error: 'Debe indicar versiones origen y destino válidas para migrar las auditorías.',
    };
  }

  const cleanSourceId = params.source_version_id.trim();
  const cleanTargetId = params.target_version_id.trim();
  if (cleanSourceId === cleanTargetId) {
    return {
      ok: false,
      error: 'La versión origen y la versión destino del certificado deben ser distintas.',
    };
  }

  const cleanAuditIds: string[] = [];
  for (const id of params.audit_ids_migrar) {
    if (!isValidUuid(id)) {
      return {
        ok: false,
        error: 'Una o más auditorías seleccionadas para migrar no poseen una referencia válida.',
      };
    }
    const trimmed = id.trim();
    if (!cleanAuditIds.includes(trimmed)) {
      cleanAuditIds.push(trimmed);
    }
  }

  const cleanSitioMap: Record<string, string> = {};
  for (const [k, v] of Object.entries(params.sitio_map ?? {})) {
    if (!isValidUuid(k) || !isValidUuid(v)) {
      return {
        ok: false,
        error: 'El mapa de equivalencia de sitios contiene una referencia inválida.',
      };
    }
    cleanSitioMap[k.trim()] = v.trim();
  }

  const cleanProcesoMap: Record<string, string> = {};
  for (const [k, v] of Object.entries(params.proceso_map ?? {})) {
    if (!isValidUuid(k) || !isValidUuid(v)) {
      return {
        ok: false,
        error: 'El mapa de equivalencia de procesos contiene una referencia inválida.',
      };
    }
    cleanProcesoMap[k.trim()] = v.trim();
  }

  try {
    const { data, error } = await supabase.rpc('fn_migrar_auditorias_version_certificado', {
      p_source_version_id: cleanSourceId,
      p_target_version_id: cleanTargetId,
      p_audit_ids_migrar: cleanAuditIds,
      p_sitio_map: cleanSitioMap,
      p_proceso_map: cleanProcesoMap,
    });

    if (error) {
      return {
        ok: false,
        error: translateCertificadoVersionDbError(error),
      };
    }

    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      return {
        ok: false,
        error:
          'El servidor devolvió una respuesta inesperada al migrar las auditorías entre versiones.',
      };
    }

    const rec = data as Record<string, unknown>;
    return {
      ok: true,
      data: {
        migrated_count: toSafeCount(rec.migrated_count),
        kept_count: toSafeCount(rec.kept_count),
        source_version_id: isValidUuid(rec.source_version_id)
          ? (rec.source_version_id as string).trim()
          : cleanSourceId,
        target_version_id: isValidUuid(rec.target_version_id)
          ? (rec.target_version_id as string).trim()
          : cleanTargetId,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: translateCertificadoVersionDbError(err),
    };
  }
}
