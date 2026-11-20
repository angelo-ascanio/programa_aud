/**
 * Step 2.1.3 — Motor Analítico y de Alertas de Planificación de Auditorías (Parte B)
 * - Span Calendario Real vs. Días-Auditor (`computeAuditCalendarSpanDays`, `validateAuditorCapacityAgainstSpan`).
 * - Detección de conflictos de agenda de auditores entre programas (`detectAuditorScheduleConflicts`).
 * - Filtro de Certificados Sin Programar por `estatus` (`findUnprogrammedCertificatesByStatus`).
 * - Motor de Alertas Inteligentes Configurables (`AlertConfigEntity`, `computeAuditAlerts`).
 * - Historial del Certificado, Evolución de Ciclos (`Combinada → Integrada`) y Rotación ISO/IEC 17021-1
 *   (`buildCertificateAuditHistoryDigest`).
 *
 * Strictly typed (`strict: true`, `0 any`) and Zero-UUID compliant in all user-facing strings.
 */

import type { ProgramacionAuditEntity } from './auditExecution';
import type { ProcessEntity } from './multisiteSampling';
import {
  computeAuditDayBalance,
  formatAuditDateLabel,
  resolveAuditCycleStatus,
  resolveLatestAuditDate,
  roundAuditDaysQuarter,
  type AuditCycleStatus,
  type AuditDateEntry,
  type AuditLinkLevel,
  type AuditLinkNature,
  type ConsolidatedAuditorDayTotal,
  type ProgramaAuditoriaEntity,
} from './auditPlanningEngine';

// ---------------------------------------------------------------------------
// Internal Date Utilities (UTC-safe YYYY-MM-DD arithmetic)
// ---------------------------------------------------------------------------

const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

function toUtcDayNumber(isoDate: string | null | undefined): number | null {
  if (!isoDate) return null;
  const match = ISO_DATE_REGEX.exec(isoDate.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return Math.floor(dt.getTime() / 86400000);
}

function fromUtcDayNumber(dayNum: number): string {
  const dt = new Date(dayNum * 86400000);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatIsoToDmy(isoDate: string): string {
  const match = ISO_DATE_REGEX.exec(isoDate.trim());
  if (!match) return isoDate;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function normalizeSearchText(val: string | null | undefined): string {
  if (!val) return '';
  return val
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function getEffectiveTodayIso(todayIso?: string): string {
  if (todayIso && toUtcDayNumber(todayIso) !== null) {
    return todayIso.trim();
  }
  return new Date().toISOString().slice(0, 10);
}

function isTerminalCycle(status: AuditCycleStatus): boolean {
  return status === 'Auditada' || status === 'Cerrada' || status === 'Cancelada';
}

// ---------------------------------------------------------------------------
// 1. Span Calendario Real vs. Días-Auditor y Conflictos de Agenda
// ---------------------------------------------------------------------------

/**
 * Computes inclusive calendar span days `(fecha_fin - fecha_inicio) + 1` when `latestDate`
 * is a valid `REAL` entry; otherwise returns `null`.
 */
export function computeAuditCalendarSpanDays(
  latestDate: AuditDateEntry | null | undefined
): number | null {
  if (!latestDate || latestDate.deleted_at || latestDate.tipo_fecha !== 'REAL') {
    return null;
  }
  const startDay = toUtcDayNumber(latestDate.fecha_inicio);
  const endDay = toUtcDayNumber(latestDate.fecha_fin);
  if (startDay === null || endDay === null || endDay < startDay) {
    return null;
  }
  return endDay - startDay + 1;
}

export interface AuditorSpanOverloadItem {
  id_auditor: string;
  auditor_nombre: string;
  assignedDays: number;
  calendarSpanDays: number;
  excessDays: number;
  warningMessage: string;
}

export interface AuditorSpanCapacityValidationResult {
  calendarSpanDays: number | null;
  hasWarnings: boolean;
  overloadedAuditors: AuditorSpanOverloadItem[];
  warnings: string[];
}

/**
 * Validates each auditor's assigned audit days against the real physical calendar span.
 * Example: `6.00d` split across 2 auditors (`3.00d` each) over a `3`-day calendar span produces
 * `hasWarnings: false`; `4.00d` assigned to 1 auditor over `3` calendar days emits an informative warning.
 */
export function validateAuditorCapacityAgainstSpan(
  auditorTotals: ReadonlyArray<ConsolidatedAuditorDayTotal>,
  calendarSpanDays: number | null
): AuditorSpanCapacityValidationResult {
  if (calendarSpanDays === null || !Number.isFinite(calendarSpanDays) || calendarSpanDays <= 0) {
    return {
      calendarSpanDays: null,
      hasWarnings: false,
      overloadedAuditors: [],
      warnings: [],
    };
  }

  const overloadedAuditors: AuditorSpanOverloadItem[] = [];
  const warnings: string[] = [];

  for (const auditor of auditorTotals) {
    const assigned = roundAuditDaysQuarter(auditor.totalDays);
    if (assigned > calendarSpanDays) {
      const excessDays = roundAuditDaysQuarter(assigned - calendarSpanDays);
      const warningMessage = `${auditor.auditor_nombre} tiene ${assigned.toFixed(2)} días-auditor asignados en un rango calendario real de ${calendarSpanDays} día(s) (+${excessDays.toFixed(2)}d).`;
      overloadedAuditors.push({
        id_auditor: auditor.id_auditor,
        auditor_nombre: auditor.auditor_nombre,
        assignedDays: assigned,
        calendarSpanDays,
        excessDays,
        warningMessage,
      });
      warnings.push(warningMessage);
    }
  }

  return {
    calendarSpanDays,
    hasWarnings: overloadedAuditors.length > 0,
    overloadedAuditors,
    warnings,
  };
}

export interface ProgramAuditorScheduleConflict {
  id_auditor: string;
  auditor_nombre: string;
  program_a_id: string;
  program_a_label: string;
  program_a_codigo: string;
  program_b_id: string;
  program_b_label: string;
  program_b_codigo: string;
  overlap_start: string;
  overlap_end: string;
  overlap_days: number;
  message: string;
}

interface ActiveProgramAuditorWindow {
  programId: string;
  programLabel: string;
  programCode: string;
  auditorId: string;
  auditorName: string;
  startDay: number;
  endDay: number;
}

function collectAuditorsFromAudit(audit: ProgramacionAuditEntity): Map<string, string> {
  const map = new Map<string, string>();

  if (audit.auditor_lider_id && audit.auditor_lider_id.trim()) {
    map.set(audit.auditor_lider_id, audit.auditor_lider || 'Auditor Líder');
  }

  for (const member of audit.equipo || []) {
    if (member.id_auditor && member.id_auditor.trim()) {
      map.set(member.id_auditor, member.nombre || 'Auditor de Equipo');
    }
  }

  for (const site of audit.sitiosPlan || []) {
    if (site.deleted_at) continue;
    for (const member of site.equipoSitio || []) {
      if (!member.deleted_at && member.id_auditor && member.id_auditor.trim()) {
        map.set(member.id_auditor, member.auditor_nombre || 'Auditor de Sitio');
      }
    }
    for (const proc of site.procesos || []) {
      if (proc.deleted_at) continue;
      for (const procMember of proc.equipoProceso || []) {
        if (!procMember.deleted_at && procMember.id_auditor && procMember.id_auditor.trim()) {
          if (!map.has(procMember.id_auditor)) {
            map.set(procMember.id_auditor, procMember.auditor_nombre || 'Auditor de Proceso');
          }
        }
      }
    }
  }

  return map;
}

/**
 * Inspects active non-terminal programs/audits whose latest date is `REAL` and detects
 * overlapping schedule assignments for the same auditor across **distinct** programs.
 * All returned messages are strictly Zero-UUID.
 */
export function detectAuditorScheduleConflicts(
  allPrograms: ReadonlyArray<ProgramaAuditoriaEntity>
): ProgramAuditorScheduleConflict[] {
  const windows: ActiveProgramAuditorWindow[] = [];

  for (const program of allPrograms) {
    if (program.deleted_at) continue;
    const programLabel = program.etiqueta?.trim() || 'Programa de Auditoría';
    const programCode = program.codigo_programa?.trim() || programLabel;

    for (const audit of program.auditorias || []) {
      if (audit.deleted_at) continue;
      const cycleStatus = resolveAuditCycleStatus(audit.estado_ciclo, audit.estatus);
      if (isTerminalCycle(cycleStatus)) continue;

      const latest = resolveLatestAuditDate(audit.fechas) ?? audit.latestDate ?? null;
      if (!latest || latest.deleted_at || latest.tipo_fecha !== 'REAL') continue;

      const startDay = toUtcDayNumber(latest.fecha_inicio);
      const endDay = toUtcDayNumber(latest.fecha_fin);
      if (startDay === null || endDay === null || endDay < startDay) continue;

      const auditors = collectAuditorsFromAudit(audit);
      for (const [auditorId, auditorName] of auditors.entries()) {
        windows.push({
          programId: program.id,
          programLabel,
          programCode,
          auditorId,
          auditorName,
          startDay,
          endDay,
        });
      }
    }
  }

  const conflicts: ProgramAuditorScheduleConflict[] = [];
  const seenPairs = new Set<string>();

  for (let i = 0; i < windows.length; i += 1) {
    for (let j = i + 1; j < windows.length; j += 1) {
      const a = windows[i];
      const b = windows[j];

      if (a.auditorId !== b.auditorId) continue;
      if (a.programId === b.programId) continue; // Same campaign is never a conflict

      const overlapStart = Math.max(a.startDay, b.startDay);
      const overlapEnd = Math.min(a.endDay, b.endDay);
      if (overlapStart <= overlapEnd) {
        const sortedIds = [a.programId, b.programId].sort();
        const dedupKey = `${a.auditorId}::${sortedIds[0]}::${sortedIds[1]}`;
        if (seenPairs.has(dedupKey)) continue;
        seenPairs.add(dedupKey);

        const overlapStartIso = fromUtcDayNumber(overlapStart);
        const overlapEndIso = fromUtcDayNumber(overlapEnd);
        const overlapDays = overlapEnd - overlapStart + 1;
        const rangeLabel =
          overlapStartIso === overlapEndIso
            ? formatIsoToDmy(overlapStartIso)
            : `${formatIsoToDmy(overlapStartIso)} – ${formatIsoToDmy(overlapEndIso)}`;

        conflicts.push({
          id_auditor: a.auditorId,
          auditor_nombre: a.auditorName,
          program_a_id: a.programId,
          program_a_label: a.programLabel,
          program_a_codigo: a.programCode,
          program_b_id: b.programId,
          program_b_label: b.programLabel,
          program_b_codigo: b.programCode,
          overlap_start: overlapStartIso,
          overlap_end: overlapEndIso,
          overlap_days: overlapDays,
          message: `Conflicto de agenda: ${a.auditorName} coincide en "${a.programLabel}" (${a.programCode}) y "${b.programLabel}" (${b.programCode}) del ${rangeLabel} (${overlapDays} día(s)).`,
        });
      }
    }
  }

  return conflicts;
}

// ---------------------------------------------------------------------------
// 2. Filtro de Certificados Sin Programar por `estatus`
// ---------------------------------------------------------------------------

export interface UnprogrammedCertificateFilter {
  estatusIds?: string[];
  estatusNames?: string[];
  normaId?: string | null;
  organizacionId?: string | null;
  searchQuery?: string;
}

export interface UnprogrammedCertificateCandidate {
  id: string;
  numero_certificado: string;
  id_organizacion: string;
  organizacion_nombre: string;
  id_norma: string;
  norma_codigo: string;
  id_estatus: string;
  estatus: string;
  fecha_vencimiento?: string;
  deleted_at?: string | null;
}

export interface UnprogrammedCertificatesResult<T extends UnprogrammedCertificateCandidate> {
  items: T[];
  countsByEstatus: Record<string, number>;
  totalUnprogrammed: number;
}

/**
 * Finds active certificates (`!deleted_at`) that do not currently have any active non-terminal
 * audit (`estado_ciclo NOT IN ('Auditada', 'Cancelada')`), grouped with instant counts per `estatus`.
 */
export function findUnprogrammedCertificatesByStatus<T extends UnprogrammedCertificateCandidate>(
  certificates: ReadonlyArray<T>,
  allPrograms: ReadonlyArray<ProgramaAuditoriaEntity>,
  filter: UnprogrammedCertificateFilter = {}
): UnprogrammedCertificatesResult<T> {
  const activeProgrammedCertIds = new Set<string>();

  for (const program of allPrograms) {
    if (program.deleted_at) continue;
    for (const audit of program.auditorias || []) {
      if (audit.deleted_at) continue;
      const cycleStatus = resolveAuditCycleStatus(audit.estado_ciclo, audit.estatus);
      if (!isTerminalCycle(cycleStatus)) {
        activeProgrammedCertIds.add(audit.id_certificado);
      }
    }
  }

  const baseUnprogrammed = certificates.filter(
    (cert) => !cert.deleted_at && !activeProgrammedCertIds.has(cert.id)
  );

  const countsByEstatus: Record<string, number> = {};
  for (const cert of baseUnprogrammed) {
    const label = cert.estatus?.trim() || 'Sin Estatus';
    countsByEstatus[label] = (countsByEstatus[label] || 0) + 1;
  }

  const allowedStatusIds =
    filter.estatusIds && filter.estatusIds.length > 0 ? new Set(filter.estatusIds) : null;
  const allowedStatusNames =
    filter.estatusNames && filter.estatusNames.length > 0
      ? new Set(filter.estatusNames.map((n) => normalizeSearchText(n)))
      : null;
  const query = normalizeSearchText(filter.searchQuery);

  const items = baseUnprogrammed.filter((cert) => {
    if (allowedStatusIds && !allowedStatusIds.has(cert.id_estatus)) {
      return false;
    }
    if (allowedStatusNames && !allowedStatusNames.has(normalizeSearchText(cert.estatus))) {
      return false;
    }
    if (filter.normaId && filter.normaId !== 'ALL' && cert.id_norma !== filter.normaId) {
      return false;
    }
    if (
      filter.organizacionId &&
      filter.organizacionId !== 'ALL' &&
      cert.id_organizacion !== filter.organizacionId
    ) {
      return false;
    }
    if (query) {
      const haystack = normalizeSearchText(
        `${cert.numero_certificado} ${cert.organizacion_nombre} ${cert.norma_codigo} ${cert.estatus}`
      );
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  return {
    items,
    countsByEstatus,
    totalUnprogrammed: baseUnprogrammed.length,
  };
}

// ---------------------------------------------------------------------------
// 3. Motor de Alertas Configurables (`AlertConfigEntity` + `computeAuditAlerts`)
// ---------------------------------------------------------------------------

export interface AlertConfigEntity {
  id: string;
  clave: string;
  dias_aviso_proxima: number;
  dias_aviso_preprogramada_sin_confirmar: number;
  alertar_atrasadas: boolean;
  alertar_conflicto_auditor: boolean;
  alertar_desfase_dias_o_span: boolean;
  ciclos_rotacion_auditor_lider: number;
  alertas_activas: boolean;
  dias_limite_plan_accion: number;
  dias_limite_cierre_nc: number;
}

export const DEFAULT_AUDIT_ALERT_CONFIG: AlertConfigEntity = {
  id: 'default-audit-alert-config',
  clave: 'DEFAULT',
  dias_aviso_proxima: 15,
  dias_aviso_preprogramada_sin_confirmar: 30,
  alertar_atrasadas: true,
  alertar_conflicto_auditor: true,
  alertar_desfase_dias_o_span: true,
  ciclos_rotacion_auditor_lider: 3,
  alertas_activas: true,
  dias_limite_plan_accion: 15,
  dias_limite_cierre_nc: 60,
};

export type AuditAlertCategory =
  | 'ATRASADA'
  | 'PROXIMA'
  | 'PREPROGRAMADA_SIN_CONFIRMAR'
  | 'CONFLICTO_AUDITOR'
  | 'DESFASE_DIAS_SPAN';

export type AuditAlertSeverity = 'rose' | 'amber' | 'sky';

export interface AuditAlertItem {
  id: string;
  category: AuditAlertCategory;
  severity: AuditAlertSeverity;
  title: string;
  message: string;
  programId?: string;
  programLabel?: string;
  auditId?: string;
  codigoAuditoria?: string;
  numeroCertificado?: string;
  organizacionNombre?: string;
  daysDelta?: number;
}

const ALERT_SEVERITY_ORDER: Record<AuditAlertSeverity, number> = {
  rose: 1,
  amber: 2,
  sky: 3,
};

/**
 * Evaluates configurable operational alerts across all active programs using strictly
 * the latest active date entry (`MAX(numero_secuencia)`) per audit.
 * Returns `[]` immediately when `config.alertas_activas === false`.
 */
export function computeAuditAlerts(
  programs: ReadonlyArray<ProgramaAuditoriaEntity>,
  config: AlertConfigEntity = DEFAULT_AUDIT_ALERT_CONFIG,
  todayIso?: string
): AuditAlertItem[] {
  if (!config.alertas_activas) return [];

  const effectiveToday = getEffectiveTodayIso(todayIso);
  const todayDayNum = toUtcDayNumber(effectiveToday);
  if (todayDayNum === null) return [];

  const alerts: AuditAlertItem[] = [];
  let seqCounter = 0;

  for (const program of programs) {
    if (program.deleted_at) continue;
    const programLabel = program.etiqueta?.trim() || program.codigo_programa || 'Programa';

    for (const audit of program.auditorias || []) {
      if (audit.deleted_at) continue;
      const cycleStatus = resolveAuditCycleStatus(audit.estado_ciclo, audit.estatus);
      if (isTerminalCycle(cycleStatus)) continue;

      const latest = resolveLatestAuditDate(audit.fechas) ?? audit.latestDate ?? null;
      const auditLabel = audit.codigo_auditoria || audit.numero_certificado || 'Auditoría';

      if (latest && !latest.deleted_at) {
        if (latest.tipo_fecha === 'REAL' && latest.fecha_inicio && latest.fecha_fin) {
          const startDay = toUtcDayNumber(latest.fecha_inicio);
          const endDay = toUtcDayNumber(latest.fecha_fin);

          // 1. ATRASADA
          if (config.alertar_atrasadas && endDay !== null && endDay < todayDayNum) {
            const overdueDays = todayDayNum - endDay;
            seqCounter += 1;
            alerts.push({
              id: `alert-atrasada-${seqCounter}`,
              category: 'ATRASADA',
              severity: 'rose',
              title: `Auditoría atrasada (${overdueDays}d)`,
              message: `${auditLabel} (${audit.organizacion_nombre}) venció el ${formatIsoToDmy(latest.fecha_fin)} y continúa en estado "${cycleStatus}".`,
              programId: program.id,
              programLabel,
              auditId: audit.id,
              codigoAuditoria: audit.codigo_auditoria,
              numeroCertificado: audit.numero_certificado,
              organizacionNombre: audit.organizacion_nombre,
              daysDelta: -overdueDays,
            });
          }

          // 2. PROXIMA
          if (startDay !== null) {
            const daysUntilStart = startDay - todayDayNum;
            if (daysUntilStart >= 0 && daysUntilStart <= config.dias_aviso_proxima) {
              seqCounter += 1;
              alerts.push({
                id: `alert-proxima-${seqCounter}`,
                category: 'PROXIMA',
                severity: daysUntilStart <= 5 ? 'amber' : 'sky',
                title:
                  daysUntilStart === 0
                    ? 'Auditoría inicia hoy'
                    : `Auditoría próxima en ${daysUntilStart} día(s)`,
                message: `${auditLabel} (${audit.organizacion_nombre}) está programada para iniciar el ${formatIsoToDmy(latest.fecha_inicio)}.`,
                programId: program.id,
                programLabel,
                auditId: audit.id,
                codigoAuditoria: audit.codigo_auditoria,
                numeroCertificado: audit.numero_certificado,
                organizacionNombre: audit.organizacion_nombre,
                daysDelta: daysUntilStart,
              });
            }
          }
        } else if (
          latest.tipo_fecha === 'PREPROGRAMADA_MES' &&
          latest.anio !== null &&
          latest.mes !== null
        ) {
          // 3. PREPROGRAMADA_SIN_CONFIRMAR
          const monthStartIso = `${latest.anio}-${String(latest.mes).padStart(2, '0')}-01`;
          const monthStartDay = toUtcDayNumber(monthStartIso);
          if (monthStartDay !== null) {
            const daysUntilMonth = monthStartDay - todayDayNum;
            if (daysUntilMonth <= config.dias_aviso_preprogramada_sin_confirmar) {
              seqCounter += 1;
              const dateLabel = formatAuditDateLabel(latest);
              alerts.push({
                id: `alert-preprog-${seqCounter}`,
                category: 'PREPROGRAMADA_SIN_CONFIRMAR',
                severity: 'amber',
                title: 'Preprogramada sin confirmar fechas reales',
                message: `${auditLabel} (${audit.organizacion_nombre}) sigue en modo "${dateLabel}" dentro de la ventana de confirmación (${config.dias_aviso_preprogramada_sin_confirmar}d).`,
                programId: program.id,
                programLabel,
                auditId: audit.id,
                codigoAuditoria: audit.codigo_auditoria,
                numeroCertificado: audit.numero_certificado,
                organizacionNombre: audit.organizacion_nombre,
                daysDelta: daysUntilMonth,
              });
            }
          }
        }
      }

      // 4. DESFASE_DIAS_SPAN
      if (config.alertar_desfase_dias_o_span) {
        const activeSites = (audit.sitiosPlan || []).filter((s) => !s.deleted_at);
        if (activeSites.length > 0) {
          const balance = computeAuditDayBalance(
            activeSites,
            audit.tiempo_auditoria ?? audit.dias_auditor
          );
          const spanDays = computeAuditCalendarSpanDays(latest);
          const spanValidation = validateAuditorCapacityAgainstSpan(
            balance.auditorTotals,
            spanDays
          );

          const hasBucketMismatch = !balance.isBalanced;
          if (hasBucketMismatch || spanValidation.hasWarnings) {
            const details: string[] = [];
            if (balance.bucketDelta !== 0) {
              details.push(
                `Cubo 1 (${balance.totalSiteDemandedDays.toFixed(2)}d) vs Cubo 2 (${balance.totalAuditorAssignedDays.toFixed(2)}d)`
              );
            }
            if (balance.plannedVsSiteDelta !== 0) {
              details.push(
                `Planificado (${balance.auditPlannedDays.toFixed(2)}d) vs Sitios (${balance.totalSiteDemandedDays.toFixed(2)}d)`
              );
            }
            if (spanValidation.hasWarnings) {
              details.push(...spanValidation.warnings);
            }
            seqCounter += 1;
            alerts.push({
              id: `alert-desfase-${seqCounter}`,
              category: 'DESFASE_DIAS_SPAN',
              severity: 'amber',
              title: 'Desfase de días-auditor o capacidad calendario',
              message: `${auditLabel} (${audit.organizacion_nombre}): ${details.join(' · ')}.`,
              programId: program.id,
              programLabel,
              auditId: audit.id,
              codigoAuditoria: audit.codigo_auditoria,
              numeroCertificado: audit.numero_certificado,
              organizacionNombre: audit.organizacion_nombre,
            });
          }
        }
      }
    }
  }

  // 5. CONFLICTO_AUDITOR
  if (config.alertar_conflicto_auditor) {
    const conflicts = detectAuditorScheduleConflicts(programs);
    for (const conflict of conflicts) {
      seqCounter += 1;
      alerts.push({
        id: `alert-conflicto-${seqCounter}`,
        category: 'CONFLICTO_AUDITOR',
        severity: 'rose',
        title: `Conflicto de agenda: ${conflict.auditor_nombre}`,
        message: conflict.message,
        programId: conflict.program_a_id,
        programLabel: conflict.program_a_label,
        daysDelta: conflict.overlap_days,
      });
    }
  }

  return alerts.sort((a, b) => ALERT_SEVERITY_ORDER[a.severity] - ALERT_SEVERITY_ORDER[b.severity]);
}

// ---------------------------------------------------------------------------
// 4. Historial del Certificado, Evolución de Ciclos y Rotación ISO/IEC 17021-1
// ---------------------------------------------------------------------------

export interface CertificateHistoryCycleItem {
  auditId: string;
  programId: string;
  codigo_auditoria: string;
  program_etiqueta: string;
  nivel_vinculacion: AuditLinkLevel;
  tipo_vinculacion: AuditLinkNature;
  tipo_auditoria: string;
  metodologia: string;
  estado_ciclo: AuditCycleStatus;
  dateLabel: string;
  effectiveDateIso: string;
  auditor_lider_id: string;
  auditor_lider_nombre: string;
  tiempo_auditoria: number;
  auditedProcessIds: string[];
  auditedProcessNames: string[];
}

export interface LeadAuditorRotationSummary {
  leadAuditorId: string | null;
  leadAuditorNombre: string | null;
  consecutiveCycles: number;
  rotationThreshold: number;
  requiresRotation: boolean;
  warningMessage: string | null;
}

export interface UnauditedProcessSummary {
  id: string;
  nombre_proceso: string;
  tipo: string;
}

export interface CertificateAuditHistoryDigest {
  certId: string;
  previousCycles: CertificateHistoryCycleItem[];
  latestPreviousCycle: CertificateHistoryCycleItem | null;
  currentTipoVinculacion: AuditLinkNature | null;
  previousTipoVinculacion: AuditLinkNature | null;
  hasLinkingEvolution: boolean;
  evolutionNote: string | null;
  leadAuditorRotation: LeadAuditorRotationSummary;
  unauditedProcessesFromLastCycle: UnauditedProcessSummary[];
}

export interface CertificateHistoryDetailInput {
  procesos?: ReadonlyArray<Pick<ProcessEntity, 'id' | 'nombre_proceso' | 'tipo'>>;
}

function getAuditSortDateIso(audit: ProgramacionAuditEntity): string {
  const latest = resolveLatestAuditDate(audit.fechas) ?? audit.latestDate ?? null;
  if (latest && !latest.deleted_at) {
    if (latest.tipo_fecha === 'REAL' && latest.fecha_inicio) {
      return latest.fecha_inicio;
    }
    if (latest.tipo_fecha === 'PREPROGRAMADA_MES' && latest.anio && latest.mes) {
      return `${latest.anio}-${String(latest.mes).padStart(2, '0')}-01`;
    }
  }
  return audit.fecha_reprogramacion || audit.fecha_inicio || '0000-01-01';
}

function extractAuditedProcesses(audit: ProgramacionAuditEntity): {
  ids: string[];
  names: string[];
} {
  const ids = new Set<string>();
  const names = new Set<string>();

  for (const site of audit.sitiosPlan || []) {
    if (site.deleted_at) continue;
    for (const proc of site.procesos || []) {
      if (proc.deleted_at) continue;
      if (proc.id_proceso) ids.add(proc.id_proceso);
      if (proc.proceso_nombre) names.add(proc.proceso_nombre);
    }
  }

  for (const row of audit.matrizNormativa || []) {
    if (row.proceso_nombre) names.add(row.proceso_nombre);
  }

  return {
    ids: Array.from(ids),
    names: Array.from(names),
  };
}

/**
 * Builds a chronological digest of previous audit cycles for a certificate, detecting:
 * - Linking nature evolution across cycles (e.g., `Combinada → Integrada`).
 * - Lead Auditor consecutive-cycle rotation alerts under ISO/IEC 17021-1 (`>= rotationThreshold`).
 * - Active certificate processes absent from the most recent previous audit.
 */
export function buildCertificateAuditHistoryDigest(
  certId: string,
  currentAuditId: string | null | undefined,
  allPrograms: ReadonlyArray<ProgramaAuditoriaEntity>,
  certDetail?: CertificateHistoryDetailInput | null,
  rotationThreshold = DEFAULT_AUDIT_ALERT_CONFIG.ciclos_rotacion_auditor_lider
): CertificateAuditHistoryDigest {
  const previousCycles: CertificateHistoryCycleItem[] = [];
  let currentTipoVinculacion: AuditLinkNature | null = null;

  for (const program of allPrograms) {
    if (program.deleted_at) continue;
    for (const audit of program.auditorias || []) {
      if (audit.deleted_at) continue;
      if (audit.id_certificado !== certId) continue;

      if (currentAuditId && audit.id === currentAuditId) {
        currentTipoVinculacion = program.tipo_vinculacion;
        continue;
      }

      const cycleStatus = resolveAuditCycleStatus(audit.estado_ciclo, audit.estatus);
      if (cycleStatus === 'Cancelada') continue;

      const latest = resolveLatestAuditDate(audit.fechas) ?? audit.latestDate ?? null;
      const dateLabel = latest
        ? formatAuditDateLabel(latest)
        : audit.fecha_inicio
          ? formatIsoToDmy(audit.fecha_inicio)
          : 'Sin fecha';
      const effectiveDateIso = getAuditSortDateIso(audit);
      const { ids, names } = extractAuditedProcesses(audit);

      previousCycles.push({
        auditId: audit.id,
        programId: program.id,
        codigo_auditoria: audit.codigo_auditoria,
        program_etiqueta: program.etiqueta,
        nivel_vinculacion: program.nivel_vinculacion,
        tipo_vinculacion: program.tipo_vinculacion,
        tipo_auditoria: audit.tipo_auditoria,
        metodologia: audit.metodologia,
        estado_ciclo: cycleStatus,
        dateLabel,
        effectiveDateIso,
        auditor_lider_id: audit.auditor_lider_id,
        auditor_lider_nombre: audit.auditor_lider,
        tiempo_auditoria: roundAuditDaysQuarter(audit.tiempo_auditoria ?? audit.dias_auditor ?? 0),
        auditedProcessIds: ids,
        auditedProcessNames: names,
      });
    }
  }

  // Sort most recent cycle first
  previousCycles.sort((a, b) => b.effectiveDateIso.localeCompare(a.effectiveDateIso));

  const latestPreviousCycle = previousCycles.length > 0 ? previousCycles[0] : null;
  const previousTipoVinculacion = latestPreviousCycle?.tipo_vinculacion ?? null;
  const hasLinkingEvolution =
    previousTipoVinculacion !== null &&
    currentTipoVinculacion !== null &&
    previousTipoVinculacion !== currentTipoVinculacion;

  const evolutionNote = hasLinkingEvolution
    ? `Ciclo previo: ${previousTipoVinculacion} → Ciclo actual: ${currentTipoVinculacion}`
    : null;

  // Consecutive Lead Auditor rotation check
  const safeThreshold = Math.max(2, Math.floor(rotationThreshold));
  let consecutiveCycles = 0;
  const latestLeadId = latestPreviousCycle?.auditor_lider_id?.trim() || null;
  const latestLeadNombre = latestPreviousCycle?.auditor_lider_nombre?.trim() || null;

  if (latestLeadId) {
    for (const cycle of previousCycles) {
      if (cycle.auditor_lider_id === latestLeadId) {
        consecutiveCycles += 1;
      } else {
        break;
      }
    }
  }

  const requiresRotation = Boolean(latestLeadId && consecutiveCycles >= safeThreshold);
  const leadAuditorRotation: LeadAuditorRotationSummary = {
    leadAuditorId: latestLeadId,
    leadAuditorNombre: latestLeadNombre,
    consecutiveCycles,
    rotationThreshold: safeThreshold,
    requiresRotation,
    warningMessage: requiresRotation
      ? `Rotación sugerida ISO/IEC 17021-1: ${latestLeadNombre || 'El Auditor Líder'} acumula ${consecutiveCycles} ciclos consecutivos previos (umbral: ${safeThreshold}).`
      : null,
  };

  // Processes absent from last previous audit
  const unauditedProcessesFromLastCycle: UnauditedProcessSummary[] = [];
  if (certDetail?.procesos && certDetail.procesos.length > 0 && latestPreviousCycle) {
    const prevIds = new Set(latestPreviousCycle.auditedProcessIds);
    const prevNamesNorm = new Set(
      latestPreviousCycle.auditedProcessNames.map((n) => normalizeSearchText(n))
    );
    for (const proc of certDetail.procesos) {
      const coveredById = prevIds.has(proc.id);
      const coveredByName = prevNamesNorm.has(normalizeSearchText(proc.nombre_proceso));
      if (!coveredById && !coveredByName) {
        unauditedProcessesFromLastCycle.push({
          id: proc.id,
          nombre_proceso: proc.nombre_proceso,
          tipo: proc.tipo,
        });
      }
    }
  }

  return {
    certId,
    previousCycles,
    latestPreviousCycle,
    currentTipoVinculacion,
    previousTipoVinculacion,
    hasLinkingEvolution,
    evolutionNote,
    leadAuditorRotation,
    unauditedProcessesFromLastCycle,
  };
}
