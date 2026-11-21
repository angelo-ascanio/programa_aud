/**
 * Step 2.1.2 — Motor Puro Base de Planificación de Auditorías (Parte A)
 * - Entidad Maestra `ProgramaAuditoriaEntity` y validación de vinculación en 2 niveles
 *   (`INDIVIDUAL` | `NIVEL_1_INTRA_ORG` | `NIVEL_2_INTER_ORG`).
 * - Contratos y motor relacional Multi-Fecha 1:N (`AuditDateEntry`, `PREPROGRAMADA_MES` | `REAL`).
 * - Árbol relacional (`Sitio → Proceso → 1..N Turnos → Auditores`), balance dual-bucket (`0.25d`),
 *   completitud híbrida (todo el sitio vs M:N granular) y máquina dual Estado / Etiquetas Dinámicas.
 *
 * Strictly typed (`strict: true`, `0 any`) and Zero-UUID compliant in all user-facing strings.
 */

import type { ProgramacionAuditEntity } from './auditExecution';

// ---------------------------------------------------------------------------
// 1. Vinculación en 2 Niveles (`ProgramaAuditoriaEntity`)
// ---------------------------------------------------------------------------

export type AuditLinkLevel = 'INDIVIDUAL' | 'NIVEL_1_INTRA_ORG' | 'NIVEL_2_INTER_ORG';

export type AuditLinkNature =
  | 'Individual'
  | 'Combinada'
  | 'Integrada'
  | 'Conjunta'
  | 'Simultánea'
  | 'Multientidad'
  | 'Mixta';

export const AUDIT_LINK_LEVELS: readonly AuditLinkLevel[] = [
  'INDIVIDUAL',
  'NIVEL_1_INTRA_ORG',
  'NIVEL_2_INTER_ORG',
] as const;

export const AUDIT_LINK_NATURES: readonly AuditLinkNature[] = [
  'Individual',
  'Combinada',
  'Integrada',
  'Conjunta',
  'Simultánea',
  'Multientidad',
  'Mixta',
] as const;

export interface ProgramaAuditoriaEntity {
  id: string;
  id_vinculo?: string | null;
  id_grupo_empresarial?: string | null;
  codigo_programa: string | null;
  etiqueta: string;
  nivel_vinculacion: AuditLinkLevel;
  tipo_vinculacion: AuditLinkNature;
  es_vinculada: boolean;
  tiene_sitio_temporal?: boolean;
  id_ciclo_origen?: string | null;
  notas?: string | null;
  auditorias: ProgramacionAuditEntity[];
  deleted_at?: string | null;
}

export interface ProgramLinkingCertificateRef {
  id: string;
  id_organizacion: string;
  numero_certificado?: string;
  organizacion_nombre?: string;
  deleted_at?: string | null;
}

export interface ProgramLinkingValidationOptions {
  /**
   * When `true`, enforces full closing cardinality (`>= 2` certificates in Nivel 1,
   * `>= 2` distinct organizations in Nivel 2). Defaults to `false` (progressive draft mode).
   */
  isClosing?: boolean;
}

export interface ProgramLinkingValidationResult {
  valid: boolean;
  error?: string;
  warnings: string[];
  es_vinculada: boolean;
  distinctOrganizationsCount: number;
  certificateCount: number;
}

/**
 * Validates 2-level program linking rules (`INDIVIDUAL`, `NIVEL_1_INTRA_ORG`, `NIVEL_2_INTER_ORG`)
 * against the selected linking nature (`tipo_vinculacion`) and participating certificates.
 */
export function validateProgramLinkingRules(
  nivel: AuditLinkLevel,
  tipo: AuditLinkNature,
  selectedCerts: ReadonlyArray<ProgramLinkingCertificateRef>,
  options: ProgramLinkingValidationOptions = {}
): ProgramLinkingValidationResult {
  const activeCerts = selectedCerts.filter((c) => !c.deleted_at);
  const warnings: string[] = [];

  // Prevent duplicate active certificates within the same program
  const seenCertIds = new Set<string>();
  for (const cert of activeCerts) {
    const key = cert.id.trim();
    if (!key) {
      return {
        valid: false,
        error: 'Se detectó un certificado sin identificador válido en la selección del programa.',
        warnings,
        es_vinculada: nivel !== 'INDIVIDUAL',
        distinctOrganizationsCount: 0,
        certificateCount: activeCerts.length,
      };
    }
    if (seenCertIds.has(key)) {
      return {
        valid: false,
        error: 'No se permite duplicar el mismo certificado dentro de un programa de auditoría.',
        warnings,
        es_vinculada: nivel !== 'INDIVIDUAL',
        distinctOrganizationsCount: new Set(
          activeCerts.map((c) => c.id_organizacion.trim()).filter(Boolean)
        ).size,
        certificateCount: activeCerts.length,
      };
    }
    seenCertIds.add(key);
  }

  const distinctOrgs = new Set(
    activeCerts.map((c) => c.id_organizacion.trim()).filter((id) => id.length > 0)
  );
  const distinctOrganizationsCount = distinctOrgs.size;

  if (nivel === 'INDIVIDUAL') {
    if (tipo !== 'Individual') {
      return {
        valid: false,
        error: 'Un programa de nivel Individual exige tipo de vinculación "Individual".',
        warnings,
        es_vinculada: false,
        distinctOrganizationsCount,
        certificateCount: activeCerts.length,
      };
    }
    if (activeCerts.length !== 1) {
      return {
        valid: false,
        error:
          activeCerts.length === 0
            ? 'Debe seleccionar exactamente 1 certificado para una auditoría individual.'
            : 'Una auditoría individual admite exactamente 1 certificado; cambie a Nivel 1 (Intra-Organización) o Nivel 2 (Inter-Organización) para vincular múltiples certificados.',
        warnings,
        es_vinculada: false,
        distinctOrganizationsCount,
        certificateCount: activeCerts.length,
      };
    }
    return {
      valid: true,
      warnings,
      es_vinculada: false,
      distinctOrganizationsCount: Math.max(1, distinctOrganizationsCount),
      certificateCount: 1,
    };
  }

  if (nivel === 'NIVEL_1_INTRA_ORG') {
    if (tipo === 'Individual') {
      return {
        valid: false,
        error:
          'Un programa vinculado Nivel 1 (Intra-Organización) requiere una naturaleza distinta a "Individual".',
        warnings,
        es_vinculada: true,
        distinctOrganizationsCount,
        certificateCount: activeCerts.length,
      };
    }
    if (activeCerts.length === 0) {
      return {
        valid: false,
        error: 'Debe seleccionar al menos un certificado para iniciar el programa vinculado.',
        warnings,
        es_vinculada: true,
        distinctOrganizationsCount,
        certificateCount: 0,
      };
    }
    if (distinctOrganizationsCount > 1) {
      return {
        valid: false,
        error:
          'Violación de Vinculación Nivel 1: Todos los certificados deben pertenecer estrictamente a la misma organización.',
        warnings,
        es_vinculada: true,
        distinctOrganizationsCount,
        certificateCount: activeCerts.length,
      };
    }
    if (options.isClosing && activeCerts.length < 2) {
      return {
        valid: false,
        error:
          'Para cerrar una vinculación Nivel 1 (Intra-Organización) se requieren al menos 2 certificados de la misma organización.',
        warnings,
        es_vinculada: true,
        distinctOrganizationsCount,
        certificateCount: activeCerts.length,
      };
    }
    if (!options.isClosing && activeCerts.length === 1) {
      warnings.push(
        'Borrador Nivel 1 con 1 certificado: agregue al menos un segundo certificado de la misma organización antes de cerrar la programación.'
      );
    }
    return {
      valid: true,
      warnings,
      es_vinculada: true,
      distinctOrganizationsCount,
      certificateCount: activeCerts.length,
    };
  }

  // NIVEL_2_INTER_ORG
  if (tipo === 'Individual') {
    return {
      valid: false,
      error:
        'Un programa vinculado Nivel 2 (Inter-Organización) requiere una naturaleza distinta a "Individual".',
      warnings,
      es_vinculada: true,
      distinctOrganizationsCount,
      certificateCount: activeCerts.length,
    };
  }
  if (activeCerts.length === 0) {
    return {
      valid: false,
      error: 'Debe seleccionar al menos un certificado para iniciar el programa inter-organizacional.',
      warnings,
      es_vinculada: true,
      distinctOrganizationsCount,
      certificateCount: 0,
    };
  }
  if (options.isClosing && distinctOrganizationsCount < 2) {
    return {
      valid: false,
      error:
        'Para cerrar una vinculación Nivel 2 (Inter-Organización) se requieren certificados de al menos 2 organizaciones distintas.',
      warnings,
      es_vinculada: true,
      distinctOrganizationsCount,
      certificateCount: activeCerts.length,
    };
  }
  if (!options.isClosing && distinctOrganizationsCount < 2) {
    warnings.push(
      'Borrador Nivel 2: agregue certificados de al menos 2 organizaciones distintas para completar la campaña inter-organizacional.'
    );
  }
  return {
    valid: true,
    warnings,
    es_vinculada: true,
    distinctOrganizationsCount,
    certificateCount: activeCerts.length,
  };
}

// ---------------------------------------------------------------------------
// 2. Contratos y Motor Multi-Fecha 1:N (`AuditDateEntry`)
// ---------------------------------------------------------------------------

export type AuditDatePrecision = 'PREPROGRAMADA_MES' | 'PROGRAMADA_EXACTA' | 'REAL';
export type AuditDateTag = 'Programación' | 'Reprogramación';

export interface AuditDateEntry {
  id: string;
  id_auditoria: string;
  numero_secuencia: number;
  tag: AuditDateTag;
  tipo_fecha: AuditDatePrecision;
  anio: number | null;
  mes: number | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  observacion?: string | null;
  deleted_at?: string | null;
}

export interface AuditDateEntryInput {
  tag?: AuditDateTag;
  tipo_fecha: AuditDatePrecision;
  anio?: number | null;
  mes?: number | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  observacion?: string | null;
  numero_secuencia?: number;
}

export interface AuditDateValidationResult {
  valid: boolean;
  error?: string;
}

const SPANISH_MONTH_SHORT: readonly string[] = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
] as const;

const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidIsoCalendarDate(value: string | null | undefined): boolean {
  if (!value) return false;
  const match = ISO_DATE_REGEX.exec(value.trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

function formatIsoToDmy(isoDate: string): string {
  const match = ISO_DATE_REGEX.exec(isoDate.trim());
  if (!match) return isoDate;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/**
 * Filters active date entries (`!deleted_at`), orders by `numero_secuencia DESC`,
 * and returns the most recent effective date entry (or `null` if none exist).
 */
export function resolveLatestAuditDate(
  fechas: ReadonlyArray<AuditDateEntry> | null | undefined
): AuditDateEntry | null {
  if (!fechas || fechas.length === 0) return null;
  const active = fechas.filter((entry) => !entry.deleted_at);
  if (active.length === 0) return null;

  let latest = active[0];
  for (let i = 1; i < active.length; i += 1) {
    if (active[i].numero_secuencia > latest.numero_secuencia) {
      latest = active[i];
    }
  }
  return latest;
}

/**
 * Resolves the latest active planned date (`PREPROGRAMADA_MES` or `PROGRAMADA_EXACTA`,
 * excluding `REAL` execution dates), ordered by `numero_secuencia DESC`.
 */
export function resolveLatestPlannedDate(
  fechas: ReadonlyArray<AuditDateEntry> | null | undefined
): AuditDateEntry | null {
  if (!fechas || fechas.length === 0) return null;
  const active = fechas
    .filter((f) => !f.deleted_at && f.tipo_fecha !== 'REAL')
    .slice()
    .sort((a, b) => b.numero_secuencia - a.numero_secuencia);
  return active[0] ?? null;
}

/**
 * Resolves the latest active real execution date (`tipo_fecha === 'REAL'`),
 * ordered by `numero_secuencia DESC`.
 */
export function resolveLatestRealExecutionDate(
  fechas: ReadonlyArray<AuditDateEntry> | null | undefined
): AuditDateEntry | null {
  if (!fechas || fechas.length === 0) return null;
  const active = fechas
    .filter((f) => !f.deleted_at && f.tipo_fecha === 'REAL')
    .slice()
    .sort((a, b) => b.numero_secuencia - a.numero_secuencia);
  return active[0] ?? null;
}

/**
 * Computes the next incremental sequence number (`max(numero_secuencia) + 1`, or `1`).
 */
export function getNextAuditDateSequence(
  fechas: ReadonlyArray<AuditDateEntry> | null | undefined
): number {
  if (!fechas || fechas.length === 0) return 1;
  const active = fechas.filter((entry) => !entry.deleted_at);
  if (active.length === 0) return 1;
  let maxSeq = 0;
  for (const entry of active) {
    if (Number.isInteger(entry.numero_secuencia) && entry.numero_secuencia > maxSeq) {
      maxSeq = entry.numero_secuencia;
    }
  }
  return maxSeq + 1;
}

export interface ValidateAuditDateOptions {
  /**
   * When `false` (Step 3 planned scheduling), rejects `tipo_fecha = 'REAL'`.
   * Defaults to `true` for backwards compatibility with Step 10 execution recording.
   */
  allowReal?: boolean;
}

/**
 * Validates an `AuditDateEntryInput` payload matching the PostgreSQL CHECK constraints
 * for `PREPROGRAMADA_MES` (`anio` 2000..2100, `mes` 1..12) and exact ranges
 * (`PROGRAMADA_EXACTA` / `REAL`: `fecha_inicio <= fecha_fin`).
 */
export function validateAuditDateEntryInput(
  input: AuditDateEntryInput,
  options: ValidateAuditDateOptions = {}
): AuditDateValidationResult {
  if (input.tag !== undefined && input.tag !== 'Programación' && input.tag !== 'Reprogramación') {
    return {
      valid: false,
      error: 'La etiqueta temporal debe ser "Programación" o "Reprogramación".',
    };
  }

  if (
    input.numero_secuencia !== undefined &&
    (!Number.isInteger(input.numero_secuencia) || input.numero_secuencia < 1)
  ) {
    return {
      valid: false,
      error: 'El número de secuencia de la fecha debe ser un entero mayor o igual a 1.',
    };
  }

  if (options.allowReal === false && input.tipo_fecha === 'REAL') {
    return {
      valid: false,
      error:
        'En programación (Paso 3) no se permiten fechas REALES; seleccione PREPROGRAMADA_MES o PROGRAMADA_EXACTA.',
    };
  }

  if (input.tipo_fecha === 'PREPROGRAMADA_MES') {
    const anio = input.anio;
    const mes = input.mes;
    if (anio === null || anio === undefined || !Number.isInteger(anio) || anio < 2000 || anio > 2100) {
      return {
        valid: false,
        error: 'En modo Preprogramada por Mes/Año debe indicar un año válido entre 2000 y 2100.',
      };
    }
    if (mes === null || mes === undefined || !Number.isInteger(mes) || mes < 1 || mes > 12) {
      return {
        valid: false,
        error: 'En modo Preprogramada por Mes/Año debe indicar un mes válido entre 1 y 12.',
      };
    }
    if (
      (input.fecha_inicio && input.fecha_inicio.trim() !== '') ||
      (input.fecha_fin && input.fecha_fin.trim() !== '')
    ) {
      return {
        valid: false,
        error: 'En modo Preprogramada por Mes/Año no debe especificar fechas exactas de inicio/fin.',
      };
    }
    return { valid: true };
  }

  if (input.tipo_fecha === 'PROGRAMADA_EXACTA' || input.tipo_fecha === 'REAL') {
    const kindLabel = input.tipo_fecha === 'REAL' ? 'real' : 'programada';
    if (!isValidIsoCalendarDate(input.fecha_inicio)) {
      return {
        valid: false,
        error: `Debe especificar una fecha de inicio ${kindLabel} válida en formato AAAA-MM-DD.`,
      };
    }
    if (!isValidIsoCalendarDate(input.fecha_fin)) {
      return {
        valid: false,
        error: `Debe especificar una fecha de fin ${kindLabel} válida en formato AAAA-MM-DD.`,
      };
    }
    const start = input.fecha_inicio!.trim();
    const end = input.fecha_fin!.trim();
    if (end < start) {
      return {
        valid: false,
        error: 'La fecha de fin debe ser igual o posterior a la fecha de inicio.',
      };
    }
    return { valid: true };
  }

  return {
    valid: false,
    error: 'Tipo de precisión temporal inválido; use PREPROGRAMADA_MES, PROGRAMADA_EXACTA o REAL.',
  };
}

/**
 * Formats a human-readable date label with Zero-UUID exposure.
 * Examples:
 * - `"10/06/2026 – 12/06/2026 (Reprog. #2)"`
 * - `"Sep 2026 · Preprogramada (#1)"`
 */
export function formatAuditDateLabel(entry: AuditDateEntry | null | undefined): string {
  if (!entry) return 'Sin fecha programada';

  const seq = Number.isInteger(entry.numero_secuencia) && entry.numero_secuencia > 0
    ? entry.numero_secuencia
    : 1;
  const isReschedule = entry.tag === 'Reprogramación';

  if (entry.tipo_fecha === 'PREPROGRAMADA_MES') {
    const monthName =
      entry.mes && entry.mes >= 1 && entry.mes <= 12
        ? SPANISH_MONTH_SHORT[entry.mes - 1]
        : 'Mes';
    const yearStr = entry.anio ? String(entry.anio) : '—';
    return isReschedule
      ? `${monthName} ${yearStr} · Preprogramada (Reprog. #${seq})`
      : `${monthName} ${yearStr} · Preprogramada (#${seq})`;
  }

  const start = entry.fecha_inicio ? formatIsoToDmy(entry.fecha_inicio) : '—';
  const end = entry.fecha_fin ? formatIsoToDmy(entry.fecha_fin) : start;
  const rangeStr = start === end ? start : `${start} – ${end}`;
  return isReschedule ? `${rangeStr} (Reprog. #${seq})` : `${rangeStr} (Prog. #${seq})`;
}

// ---------------------------------------------------------------------------
// 3. Árbol Relacional, Balance Dual-Bucket (`0.25d`), Completitud y Tags
// ---------------------------------------------------------------------------

export type AuditCycleStatus =
  | 'Borrador'
  | 'En Programación'
  | 'Programada'
  | 'En Ejecución'
  | 'Auditada'
  | 'Cerrada'
  | 'Reprogramada'
  | 'Cancelada';

export type AuditDynamicTag =
  | 'Borrador'
  | 'Preprogramada'
  | 'Programación Incompleta'
  | 'Desfase de Días'
  | 'Lista para Ejecutar'
  | 'En Ejecución'
  | 'Atrasada'
  | 'Auditada'
  | 'Cancelada';

export type AuditorSiteRole =
  | 'AUDITOR_LIDER'
  | 'AUDITOR'
  | 'AUDITOR_EN_ENTRENAMIENTO'
  | 'EXPERTO_TECNICO';

export type AuditorProcessRole =
  | 'LIDER_PROCESO'
  | 'EVALUADOR'
  | 'APOYO_TECNICO'
  | 'OBSERVADOR';

export type SiteEvaluationModality = 'Presencial' | 'Remota' | 'Mixta';

export interface AuditoriaTurnoProcesoLink {
  id: string;
  id_procesos_sitio_auditoria: string;
  id_turnos_sitio_auditoria: string;
  id_turnos_por_sitio?: string;
  descripcion_turno?: string;
  hora_entrada?: string;
  hora_salida?: string;
  deleted_at?: string | null;
}

export interface AuditoriaEquipoProcesoLink {
  id: string;
  id_procesos_sitio_auditoria: string;
  id_auditor: string;
  auditor_nombre?: string;
  rol_en_proceso: AuditorProcessRole;
  deleted_at?: string | null;
}

export interface AuditoriaProcesoSitioItem {
  id: string;
  id_sitios_por_auditoria: string;
  id_procesos_por_sitio: string;
  id_proceso: string;
  proceso_nombre: string;
  notas?: string | null;
  turnos: AuditoriaTurnoProcesoLink[];
  equipoProceso: AuditoriaEquipoProcesoLink[];
  deleted_at?: string | null;
}

export interface AuditoriaEquipoSitioItem {
  id: string;
  id_sitios_por_auditoria: string;
  id_auditor: string;
  auditor_nombre: string;
  rol_auditor: AuditorSiteRole;
  tiempo_auditoria: number; // multiples of 0.25d
  asignacion_completa_sitio: boolean;
  deleted_at?: string | null;
}

export interface AuditoriaSitioPlanItem {
  id: string; // sitios_por_auditoria.id
  id_auditoria: string;
  id_sitio: string;
  numero_sitio: number;
  nombre_sitio: string;
  direccion_sitio?: string;
  tiempo_auditoria: number; // Cubo 1: demanda de días en el sitio (0.25d)
  modalidad_evaluacion?: SiteEvaluationModality | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  notas_sitio?: string | null;
  procesos: AuditoriaProcesoSitioItem[];
  equipoSitio: AuditoriaEquipoSitioItem[];
  deleted_at?: string | null;
}

export interface SiteAuditorDayBreakdown {
  id_auditor: string;
  auditor_nombre: string;
  rol_auditor: AuditorSiteRole;
  dias: number;
  asignacion_completa_sitio: boolean;
}

export interface SiteDayBalanceSummary {
  sitePlanId: string;
  id_sitio: string;
  numero_sitio: number;
  nombre_sitio: string;
  /** Cubo 1: demanda de días-auditor asignada al sitio */
  demandedDays: number;
  /** Cubo 2: suma de días-auditor asignados a evaluadores en el sitio */
  assignedDays: number;
  /** `assignedDays - demandedDays` redondeado a 0.25d (0 = cuadrado) */
  delta: number;
  isBalanced: boolean;
  auditorBreakdown: SiteAuditorDayBreakdown[];
}

export interface ConsolidatedAuditorDayTotal {
  id_auditor: string;
  auditor_nombre: string;
  rol_auditor: AuditorSiteRole;
  totalDays: number;
  sitesCount: number;
}

export interface AuditDayBalanceSummary {
  auditPlannedDays: number;
  /** Suma total de Cubo 1 (demanda de todos los sitios activos) */
  totalSiteDemandedDays: number;
  /** Suma total de Cubo 2 (asignación de todos los auditores en sitios activos) */
  totalAuditorAssignedDays: number;
  /** `totalAuditorAssignedDays - totalSiteDemandedDays` */
  bucketDelta: number;
  /** `totalSiteDemandedDays - auditPlannedDays` */
  plannedVsSiteDelta: number;
  isBalanced: boolean;
  siteBalances: SiteDayBalanceSummary[];
  auditorTotals: ConsolidatedAuditorDayTotal[];
}

export interface EffectiveProcessAuditor {
  id_auditor: string;
  auditor_nombre: string;
  source: 'SITIO_COMPLETO' | 'PROCESO_GRANULAR' | 'AMBOS';
  rol_auditor?: AuditorSiteRole;
  rol_en_proceso?: AuditorProcessRole;
}

export interface ProcessPlanningCompleteness {
  procesoPlanId: string;
  id_proceso: string;
  proceso_nombre: string;
  turnosCount: number;
  effectiveAuditorsCount: number;
  isComplete: boolean;
  missingReasons: string[];
}

export interface SitePlanningCompleteness {
  sitePlanId: string;
  id_sitio: string;
  numero_sitio: number;
  nombre_sitio: string;
  hasProcesses: boolean;
  totalProcesses: number;
  completeProcesses: number;
  processesMissingTurnos: number;
  processesMissingAuditors: number;
  isComplete: boolean;
  processDetails: ProcessPlanningCompleteness[];
  missingReasons: string[];
}

export interface AuditPlanningStatusResult {
  estadoCiclo: AuditCycleStatus;
  primaryTag: AuditDynamicTag;
  isTerminal: boolean;
  isOverdue: boolean;
  hasLatestDate: boolean;
  latestDate: AuditDateEntry | null;
  latestDateLabel: string;
  completionPercent: number;
  balanceSummary: AuditDayBalanceSummary;
  siteCompleteness: SitePlanningCompleteness[];
  pendingReasons: string[];
}

export interface ProgramAuditStatusItem {
  auditId: string;
  codigo_auditoria: string;
  numero_certificado: string;
  organizacion_nombre: string;
  status: AuditPlanningStatusResult;
}

export interface ProgramPlanningStatusResult {
  programId: string;
  etiqueta: string;
  nivel_vinculacion: AuditLinkLevel;
  tipo_vinculacion: AuditLinkNature;
  primaryTag: AuditDynamicTag;
  isOverdue: boolean;
  completionPercent: number;
  activeAuditsCount: number;
  totalPlannedDays: number;
  totalSiteDemandedDays: number;
  totalAuditorAssignedDays: number;
  bucketDelta: number;
  isBalanced: boolean;
  auditStatuses: ProgramAuditStatusItem[];
  pendingReasons: string[];
}

/**
 * Rounds audit days to exact multiples of `0.25d`, clamped to `>= 0`.
 */
export function roundAuditDaysQuarter(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const rounded = Math.round(value * 4) / 4;
  return rounded === 0 ? 0 : rounded;
}

function normalizeSignedQuarter(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 4) / 4;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Computes Cubo 1 (demanded days for site) vs Cubo 2 (sum of auditor days in site)
 * for a single `AuditoriaSitioPlanItem`.
 */
export function computeSiteDayBalance(site: AuditoriaSitioPlanItem): SiteDayBalanceSummary {
  const demandedDays = roundAuditDaysQuarter(site.tiempo_auditoria);
  const activeEquipo = (site.equipoSitio || []).filter((member) => !member.deleted_at);

  const auditorBreakdown: SiteAuditorDayBreakdown[] = activeEquipo.map((member) => ({
    id_auditor: member.id_auditor,
    auditor_nombre: member.auditor_nombre,
    rol_auditor: member.rol_auditor,
    dias: roundAuditDaysQuarter(member.tiempo_auditoria),
    asignacion_completa_sitio: Boolean(member.asignacion_completa_sitio),
  }));

  const assignedDays = roundAuditDaysQuarter(
    auditorBreakdown.reduce((acc, item) => acc + item.dias, 0)
  );
  const delta = normalizeSignedQuarter(assignedDays - demandedDays);

  return {
    sitePlanId: site.id,
    id_sitio: site.id_sitio,
    numero_sitio: site.numero_sitio,
    nombre_sitio: site.nombre_sitio,
    demandedDays,
    assignedDays,
    delta,
    isBalanced: delta === 0,
    auditorBreakdown,
  };
}

const SITE_ROLE_PRIORITY: Record<AuditorSiteRole, number> = {
  AUDITOR_LIDER: 4,
  AUDITOR: 3,
  EXPERTO_TECNICO: 2,
  AUDITOR_EN_ENTRENAMIENTO: 1,
};

/**
 * Sums Cubo 1 vs Cubo 2 across all active sites of an audit and consolidates `auditorTotals`.
 */
export function computeAuditDayBalance(
  sitios: ReadonlyArray<AuditoriaSitioPlanItem>,
  auditPlannedDays?: number
): AuditDayBalanceSummary {
  const activeSites = (sitios || []).filter((site) => !site.deleted_at);
  const siteBalances = activeSites.map((site) => computeSiteDayBalance(site));

  const totalSiteDemandedDays = roundAuditDaysQuarter(
    siteBalances.reduce((acc, item) => acc + item.demandedDays, 0)
  );
  const totalAuditorAssignedDays = roundAuditDaysQuarter(
    siteBalances.reduce((acc, item) => acc + item.assignedDays, 0)
  );
  const resolvedPlannedDays =
    auditPlannedDays !== undefined
      ? roundAuditDaysQuarter(auditPlannedDays)
      : totalSiteDemandedDays;

  const bucketDelta = normalizeSignedQuarter(totalAuditorAssignedDays - totalSiteDemandedDays);
  const plannedVsSiteDelta = normalizeSignedQuarter(totalSiteDemandedDays - resolvedPlannedDays);

  const totalsMap = new Map<
    string,
    {
      id_auditor: string;
      auditor_nombre: string;
      rol_auditor: AuditorSiteRole;
      totalDays: number;
      siteIds: Set<string>;
    }
  >();

  for (const balance of siteBalances) {
    for (const member of balance.auditorBreakdown) {
      const existing = totalsMap.get(member.id_auditor);
      if (existing) {
        existing.totalDays = roundAuditDaysQuarter(existing.totalDays + member.dias);
        existing.siteIds.add(balance.id_sitio);
        if (SITE_ROLE_PRIORITY[member.rol_auditor] > SITE_ROLE_PRIORITY[existing.rol_auditor]) {
          existing.rol_auditor = member.rol_auditor;
        }
      } else {
        totalsMap.set(member.id_auditor, {
          id_auditor: member.id_auditor,
          auditor_nombre: member.auditor_nombre,
          rol_auditor: member.rol_auditor,
          totalDays: member.dias,
          siteIds: new Set([balance.id_sitio]),
        });
      }
    }
  }

  const auditorTotals: ConsolidatedAuditorDayTotal[] = Array.from(totalsMap.values())
    .map((entry) => ({
      id_auditor: entry.id_auditor,
      auditor_nombre: entry.auditor_nombre,
      rol_auditor: entry.rol_auditor,
      totalDays: entry.totalDays,
      sitesCount: entry.siteIds.size,
    }))
    .sort((a, b) => {
      const roleDiff = SITE_ROLE_PRIORITY[b.rol_auditor] - SITE_ROLE_PRIORITY[a.rol_auditor];
      if (roleDiff !== 0) return roleDiff;
      return b.totalDays - a.totalDays;
    });

  const allSitesBalanced = siteBalances.every((item) => item.isBalanced);
  const isBalanced = bucketDelta === 0 && plannedVsSiteDelta === 0 && allSitesBalanced;

  return {
    auditPlannedDays: resolvedPlannedDays,
    totalSiteDemandedDays,
    totalAuditorAssignedDays,
    bucketDelta,
    plannedVsSiteDelta,
    isBalanced,
    siteBalances,
    auditorTotals,
  };
}

/**
 * Resolves effective auditors for a process by combining site-wide assignments
 * (`asignacion_completa_sitio === true`) with granular M:N process assignments (`equipoProceso`).
 */
export function resolveEffectiveAuditorsForProcess(
  site: AuditoriaSitioPlanItem,
  procesoItem: AuditoriaProcesoSitioItem
): EffectiveProcessAuditor[] {
  const effectiveMap = new Map<string, EffectiveProcessAuditor>();

  const activeSiteEquipo = (site.equipoSitio || []).filter((m) => !m.deleted_at);
  const siteMemberByAuditorId = new Map<string, AuditoriaEquipoSitioItem>();
  for (const member of activeSiteEquipo) {
    siteMemberByAuditorId.set(member.id_auditor, member);
    if (member.asignacion_completa_sitio) {
      effectiveMap.set(member.id_auditor, {
        id_auditor: member.id_auditor,
        auditor_nombre: member.auditor_nombre,
        source: 'SITIO_COMPLETO',
        rol_auditor: member.rol_auditor,
      });
    }
  }

  const activeProcessEquipo = (procesoItem.equipoProceso || []).filter((m) => !m.deleted_at);
  for (const procMember of activeProcessEquipo) {
    const existing = effectiveMap.get(procMember.id_auditor);
    const siteMember = siteMemberByAuditorId.get(procMember.id_auditor);
    if (existing) {
      effectiveMap.set(procMember.id_auditor, {
        ...existing,
        source: 'AMBOS',
        rol_en_proceso: procMember.rol_en_proceso,
      });
    } else {
      effectiveMap.set(procMember.id_auditor, {
        id_auditor: procMember.id_auditor,
        auditor_nombre:
          procMember.auditor_nombre || siteMember?.auditor_nombre || 'Auditor asignado',
        source: 'PROCESO_GRANULAR',
        rol_auditor: siteMember?.rol_auditor,
        rol_en_proceso: procMember.rol_en_proceso,
      });
    }
  }

  return Array.from(effectiveMap.values());
}

/**
 * Evaluates planning completeness for a site: requires `procesos.length > 0`,
 * each active process with `>= 1` active turno and `>= 1` effective auditor.
 */
export function evaluateSitePlanningCompleteness(
  site: AuditoriaSitioPlanItem
): SitePlanningCompleteness {
  const activeProcesses = (site.procesos || []).filter((p) => !p.deleted_at);
  const missingReasons: string[] = [];
  const processDetails: ProcessPlanningCompleteness[] = [];

  if (activeProcesses.length === 0) {
    missingReasons.push(`El sitio "${site.nombre_sitio}" no tiene procesos planificados.`);
    return {
      sitePlanId: site.id,
      id_sitio: site.id_sitio,
      numero_sitio: site.numero_sitio,
      nombre_sitio: site.nombre_sitio,
      hasProcesses: false,
      totalProcesses: 0,
      completeProcesses: 0,
      processesMissingTurnos: 0,
      processesMissingAuditors: 0,
      isComplete: false,
      processDetails,
      missingReasons,
    };
  }

  let completeProcesses = 0;
  let processesMissingTurnos = 0;
  let processesMissingAuditors = 0;

  for (const proc of activeProcesses) {
    const activeTurnos = (proc.turnos || []).filter((t) => !t.deleted_at);
    const effectiveAuditors = resolveEffectiveAuditorsForProcess(site, proc);
    const procMissing: string[] = [];

    if (activeTurnos.length === 0) {
      processesMissingTurnos += 1;
      procMissing.push(
        `Proceso "${proc.proceso_nombre}" en "${site.nombre_sitio}" sin turnos seleccionados.`
      );
    }
    if (effectiveAuditors.length === 0) {
      processesMissingAuditors += 1;
      procMissing.push(
        `Proceso "${proc.proceso_nombre}" en "${site.nombre_sitio}" sin auditor asignado.`
      );
    }

    const isProcComplete = procMissing.length === 0;
    if (isProcComplete) completeProcesses += 1;
    else missingReasons.push(...procMissing);

    processDetails.push({
      procesoPlanId: proc.id,
      id_proceso: proc.id_proceso,
      proceso_nombre: proc.proceso_nombre,
      turnosCount: activeTurnos.length,
      effectiveAuditorsCount: effectiveAuditors.length,
      isComplete: isProcComplete,
      missingReasons: procMissing,
    });
  }

  return {
    sitePlanId: site.id,
    id_sitio: site.id_sitio,
    numero_sitio: site.numero_sitio,
    nombre_sitio: site.nombre_sitio,
    hasProcesses: true,
    totalProcesses: activeProcesses.length,
    completeProcesses,
    processesMissingTurnos,
    processesMissingAuditors,
    isComplete: missingReasons.length === 0,
    processDetails,
    missingReasons,
  };
}

/**
 * Maps persisted `estado_ciclo` (or legacy `estatus` fallback) to canonical `AuditCycleStatus`.
 */
export function resolveAuditCycleStatus(
  estadoCiclo?: AuditCycleStatus | null,
  legacyEstatus?: string | null
): AuditCycleStatus {
  if (estadoCiclo) return estadoCiclo;
  const norm = (legacyEstatus || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  if (norm.includes('cancelad')) return 'Cancelada';
  if (norm.includes('cerrad')) return 'Cerrada';
  if (norm.includes('auditad') || norm.includes('completad')) {
    return 'Auditada';
  }
  if (norm.includes('ejecucion')) return 'En Ejecución';
  if (norm.includes('reprogramad')) return 'Reprogramada';
  if (norm.includes('programacion')) return 'En Programación';
  if (norm.includes('planificad') || norm.includes('programad')) return 'Programada';
  return 'Borrador';
}

function getTodayIsoFallback(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Computes persisted vs dynamic planning status for a single audit without ever blocking
 * progressive draft saves.
 */
export function computeAuditPlanningStatus(
  audit: ProgramacionAuditEntity,
  todayIso?: string
): AuditPlanningStatusResult {
  const effectiveToday =
    todayIso && isValidIsoCalendarDate(todayIso) ? todayIso.trim() : getTodayIsoFallback();

  const estadoCiclo = resolveAuditCycleStatus(audit.estado_ciclo, audit.estatus);
  const isTerminal =
    estadoCiclo === 'Auditada' || estadoCiclo === 'Cerrada' || estadoCiclo === 'Cancelada';

  const latestDate = resolveLatestAuditDate(audit.fechas) ?? audit.latestDate ?? null;
  const latestDateLabel = formatAuditDateLabel(latestDate);
  const hasLatestDate = latestDate !== null;

  const activeSites = (audit.sitiosPlan || []).filter((site) => !site.deleted_at);
  const plannedDays = audit.tiempo_auditoria ?? audit.dias_auditor ?? 0;
  const balanceSummary = computeAuditDayBalance(activeSites, plannedDays);
  const siteCompleteness = activeSites.map((site) => evaluateSitePlanningCompleteness(site));

  const isOverdue =
    !isTerminal &&
    latestDate !== null &&
    (latestDate.tipo_fecha === 'PROGRAMADA_EXACTA' || latestDate.tipo_fecha === 'REAL') &&
    Boolean(latestDate.fecha_fin) &&
    latestDate.fecha_fin! < effectiveToday;

  const pendingReasons: string[] = [];

  if (!audit.tipo_auditoria || audit.tipo_auditoria.trim() === '') {
    pendingReasons.push('Falta seleccionar el tipo de auditoría.');
  }
  if (!audit.metodologia || audit.metodologia.trim() === '') {
    pendingReasons.push('Falta seleccionar la metodología de ejecución.');
  }

  if (!latestDate) {
    pendingReasons.push('Sin fecha programada en el historial 1:N.');
  } else if (latestDate.tipo_fecha === 'PREPROGRAMADA_MES') {
    pendingReasons.push('Fecha preprogramada por mes/año; pendiente confirmar fechas reales.');
  }

  if (activeSites.length === 0) {
    pendingReasons.push('Sin sitios asignados al plan de auditoría.');
  } else {
    for (const sc of siteCompleteness) {
      if (!sc.isComplete) {
        pendingReasons.push(...sc.missingReasons);
      }
    }
    if (balanceSummary.totalSiteDemandedDays <= 0) {
      pendingReasons.push('Los sitios planificados no tienen días-auditor asignados (Cubo 1 = 0d).');
    }
    if (!balanceSummary.isBalanced) {
      if (balanceSummary.bucketDelta !== 0) {
        pendingReasons.push(
          `Desfase dual-bucket: Cubo 1 (${balanceSummary.totalSiteDemandedDays.toFixed(2)}d) vs Cubo 2 (${balanceSummary.totalAuditorAssignedDays.toFixed(2)}d).`
        );
      }
      if (balanceSummary.plannedVsSiteDelta !== 0) {
        pendingReasons.push(
          `Desfase entre tiempo planificado de auditoría (${balanceSummary.auditPlannedDays.toFixed(2)}d) y suma de sitios (${balanceSummary.totalSiteDemandedDays.toFixed(2)}d).`
        );
      }
    }
  }

  if (isOverdue) {
    pendingReasons.push('Fecha real de ejecución vencida sin cierre del ciclo.');
  }

  // Weighted completion percentage (0..100)
  let completionPercent = 0;
  if (estadoCiclo === 'Auditada' || estadoCiclo === 'Cerrada') {
    completionPercent = 100;
  } else if (estadoCiclo === 'Cancelada') {
    completionPercent = 0;
  } else {
    let score = 0;
    // 1. Metadata (20%)
    if (audit.tipo_auditoria?.trim()) score += 10;
    if (audit.metodologia?.trim()) score += 10;
    // 2. Date (20%)
    if (latestDate) {
      score +=
        latestDate.tipo_fecha === 'PROGRAMADA_EXACTA' || latestDate.tipo_fecha === 'REAL'
          ? 20
          : 10;
    }
    // 3. Sites present (20%)
    if (activeSites.length > 0) score += 20;
    // 4. Site/process/turnos/auditors completeness (20%)
    if (siteCompleteness.length > 0) {
      const completeSitesRatio =
        siteCompleteness.filter((s) => s.isComplete).length / siteCompleteness.length;
      score += Math.round(completeSitesRatio * 20);
    }
    // 5. Dual-bucket balance > 0d (20%)
    if (
      activeSites.length > 0 &&
      balanceSummary.totalSiteDemandedDays > 0 &&
      balanceSummary.isBalanced
    ) {
      score += 20;
    } else if (activeSites.length > 0 && balanceSummary.totalAuditorAssignedDays > 0) {
      score += 10;
    }
    completionPercent = Math.min(100, Math.max(0, score));
  }

  let primaryTag: AuditDynamicTag;
  if (estadoCiclo === 'Cancelada') {
    primaryTag = 'Cancelada';
  } else if (estadoCiclo === 'Auditada' || estadoCiclo === 'Cerrada') {
    primaryTag = 'Auditada';
  } else if (isOverdue) {
    primaryTag = 'Atrasada';
  } else if (estadoCiclo === 'En Ejecución') {
    primaryTag = 'En Ejecución';
  } else if (!latestDate && activeSites.length === 0) {
    primaryTag = 'Borrador';
  } else if (latestDate?.tipo_fecha === 'PREPROGRAMADA_MES') {
    primaryTag = 'Preprogramada';
  } else if (activeSites.length > 0 && !balanceSummary.isBalanced) {
    primaryTag = 'Desfase de Días';
  } else if (pendingReasons.length > 0) {
    primaryTag = 'Programación Incompleta';
  } else {
    primaryTag = 'Lista para Ejecutar';
  }

  return {
    estadoCiclo,
    primaryTag,
    isTerminal,
    isOverdue,
    hasLatestDate,
    latestDate,
    latestDateLabel,
    completionPercent,
    balanceSummary,
    siteCompleteness,
    pendingReasons,
  };
}

/**
 * Aggregates planning completeness, Cubo 1/2 days, and consolidated dynamic tag
 * across all active audits belonging to a `ProgramaAuditoriaEntity`.
 */
export function computeProgramPlanningStatus(
  program: ProgramaAuditoriaEntity,
  todayIso?: string
): ProgramPlanningStatusResult {
  const activeAudits = (program.auditorias || []).filter((a) => !a.deleted_at);

  const auditStatuses: ProgramAuditStatusItem[] = activeAudits.map((audit) => ({
    auditId: audit.id,
    codigo_auditoria: audit.codigo_auditoria,
    numero_certificado: audit.numero_certificado,
    organizacion_nombre: audit.organizacion_nombre,
    status: computeAuditPlanningStatus(audit, todayIso),
  }));

  const totalPlannedDays = roundAuditDaysQuarter(
    auditStatuses.reduce((acc, item) => acc + item.status.balanceSummary.auditPlannedDays, 0)
  );
  const totalSiteDemandedDays = roundAuditDaysQuarter(
    auditStatuses.reduce((acc, item) => acc + item.status.balanceSummary.totalSiteDemandedDays, 0)
  );
  const totalAuditorAssignedDays = roundAuditDaysQuarter(
    auditStatuses.reduce(
      (acc, item) => acc + item.status.balanceSummary.totalAuditorAssignedDays,
      0
    )
  );
  const bucketDelta = normalizeSignedQuarter(totalAuditorAssignedDays - totalSiteDemandedDays);
  const isBalanced =
    auditStatuses.length > 0 &&
    bucketDelta === 0 &&
    auditStatuses.every((item) => item.status.balanceSummary.isBalanced);

  const completionPercent =
    auditStatuses.length > 0
      ? Math.round(
          auditStatuses.reduce((acc, item) => acc + item.status.completionPercent, 0) /
            auditStatuses.length
        )
      : 0;

  const isOverdue = auditStatuses.some((item) => item.status.isOverdue);

  const pendingReasons: string[] = [];
  if (auditStatuses.length === 0) {
    pendingReasons.push('El programa no tiene auditorías activas vinculadas.');
  } else {
    for (const item of auditStatuses) {
      const prefix = item.numero_certificado || item.codigo_auditoria || 'Certificado';
      for (const reason of item.status.pendingReasons) {
        pendingReasons.push(`${prefix}: ${reason}`);
      }
    }
  }

  let primaryTag: AuditDynamicTag;
  if (auditStatuses.length === 0) {
    primaryTag = 'Borrador';
  } else if (auditStatuses.every((item) => item.status.primaryTag === 'Cancelada')) {
    primaryTag = 'Cancelada';
  } else if (auditStatuses.every((item) => item.status.primaryTag === 'Auditada')) {
    primaryTag = 'Auditada';
  } else if (isOverdue) {
    primaryTag = 'Atrasada';
  } else if (auditStatuses.some((item) => item.status.primaryTag === 'En Ejecución')) {
    primaryTag = 'En Ejecución';
  } else if (auditStatuses.some((item) => item.status.primaryTag === 'Desfase de Días')) {
    primaryTag = 'Desfase de Días';
  } else if (auditStatuses.some((item) => item.status.primaryTag === 'Programación Incompleta')) {
    primaryTag = 'Programación Incompleta';
  } else if (auditStatuses.some((item) => item.status.primaryTag === 'Preprogramada')) {
    primaryTag = 'Preprogramada';
  } else if (auditStatuses.every((item) => item.status.primaryTag === 'Borrador')) {
    primaryTag = 'Borrador';
  } else {
    primaryTag = 'Lista para Ejecutar';
  }

  return {
    programId: program.id,
    etiqueta: program.etiqueta,
    nivel_vinculacion: program.nivel_vinculacion,
    tipo_vinculacion: program.tipo_vinculacion,
    primaryTag,
    isOverdue,
    completionPercent,
    activeAuditsCount: auditStatuses.length,
    totalPlannedDays,
    totalSiteDemandedDays,
    totalAuditorAssignedDays,
    bucketDelta,
    isBalanced,
    auditStatuses,
    pendingReasons,
  };
}

// ---------------------------------------------------------------------------
// 3.5 Generación Determinista de Códigos Únicos (Programa y Auditoría)
// ---------------------------------------------------------------------------

export interface ProgramCodeCandidate {
  codigo_programa?: string | null;
  deleted_at?: string | null;
}

export interface AuditCodeCandidate {
  codigo_auditoria?: string | null;
  deleted_at?: string | null;
}

const MAX_CODE_LENGTH = 40;

function normalizeTargetYear(targetYear: number): number {
  if (Number.isFinite(targetYear)) {
    const truncated = Math.trunc(targetYear);
    if (truncated >= 1900 && truncated <= 2999) {
      return truncated;
    }
  }
  return new Date().getUTCFullYear();
}

function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normalizes a certificate number into an uppercase alphanumeric/hyphen segment
 * up to 8 characters suitable for `AUD-YYYY-{SEGMENT}-NN` codes.
 */
export function sanitizeAuditCodeSegment(certNumber: string | null | undefined): string {
  const cleaned = String(certNumber ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  if (!cleaned) return 'CERT';
  const suffix = cleaned.slice(-8).replace(/^-+|-+$/g, '');
  return suffix || 'CERT';
}

/**
 * Generates the next unique active `PROG-${targetYear}-NNN` code by finding the
 * maximum existing numeric suffix (never `.length + 1`) across non-archived programs.
 */
export function generateNextUniqueProgramCode(
  programs: ReadonlyArray<ProgramCodeCandidate>,
  targetYear: number
): string {
  const year = normalizeTargetYear(targetYear);
  const yearStr = String(year);
  const pattern = new RegExp(`^PROG-${escapeRegexLiteral(yearStr)}-(\\d+)$`, 'i');
  const existingCodes = new Set<string>();
  let maxSeq = 0;

  for (const prog of programs || []) {
    if (prog.deleted_at) continue;
    const rawCode = prog.codigo_programa?.trim();
    if (!rawCode) continue;
    const normalized = rawCode.toUpperCase();
    existingCodes.add(normalized);

    const match = pattern.exec(normalized);
    if (match) {
      const parsed = Number.parseInt(match[1], 10);
      if (Number.isSafeInteger(parsed) && parsed > maxSeq) {
        maxSeq = parsed;
      }
    }
  }

  let nextSeq = maxSeq + 1;
  while (true) {
    const candidate = `PROG-${yearStr}-${String(nextSeq).padStart(3, '0')}`.slice(0, MAX_CODE_LENGTH);
    if (!existingCodes.has(candidate)) {
      return candidate;
    }
    nextSeq += 1;
  }
}

/**
 * Generates the next unique active `AUD-${targetYear}-${shortCert}-NN` code capped cleanly
 * at <= 40 characters (`VARCHAR(40)`), stepping past both active audits and `reservedCodes`.
 */
export function generateNextUniqueAuditCode(
  audits: ReadonlyArray<AuditCodeCandidate>,
  targetYear: number,
  numeroCertificado: string | null | undefined,
  reservedCodes?: ReadonlySet<string> | ReadonlyArray<string>
): string {
  const year = normalizeTargetYear(targetYear);
  const yearStr = String(year);
  const shortCert = sanitizeAuditCodeSegment(numeroCertificado);
  const prefixBase = `AUD-${yearStr}-`;
  const seqPattern = new RegExp(
    `^AUD-${escapeRegexLiteral(yearStr)}-${escapeRegexLiteral(shortCert)}-(\\d+)$`,
    'i'
  );

  const takenCodes = new Set<string>();
  let maxSeq = 0;

  const inspectCode = (rawCode: string | null | undefined): void => {
    const trimmed = rawCode?.trim();
    if (!trimmed) return;
    const normalized = trimmed.toUpperCase();
    takenCodes.add(normalized);

    const match = seqPattern.exec(normalized);
    if (match) {
      const parsed = Number.parseInt(match[1], 10);
      if (Number.isSafeInteger(parsed) && parsed > maxSeq) {
        maxSeq = parsed;
      }
    }
  };

  for (const audit of audits || []) {
    if (audit.deleted_at) continue;
    inspectCode(audit.codigo_auditoria);
  }

  if (reservedCodes) {
    for (const reserved of reservedCodes) {
      inspectCode(reserved);
    }
  }

  let nextSeq = maxSeq + 1;
  while (true) {
    const seqStr = String(nextSeq).padStart(2, '0');
    const suffix = `-${seqStr}`;
    const maxCertLen = Math.max(1, MAX_CODE_LENGTH - prefixBase.length - suffix.length);
    const cappedCert =
      shortCert.slice(0, maxCertLen).replace(/-+$/g, '') || 'CERT'.slice(0, maxCertLen);
    const candidate = `${prefixBase}${cappedCert}${suffix}`.slice(0, MAX_CODE_LENGTH);

    if (!takenCodes.has(candidate)) {
      return candidate;
    }
    nextSeq += 1;
  }
}

// ---------------------------------------------------------------------------
// 4. Re-export Parte B (Span Calendario, Conflictos, Sin Programar, Alertas e Historial)
// ---------------------------------------------------------------------------
export * from './auditAlertsEngine';

