/**
 * Step 8.1 — `6. Resultado`: Simplificación por Certificado, Fechas Reales Discretas,
 * Cláusula-only NCs (+15d Plan / +45d Cierre desde MAX(fecha_real)) y Fechas Reales de Cumplimiento.
 *
 * Strictly typed (`strict: true`, `0 any` / `as any`) and Zero-UUID compliant
 * in all user-facing labels and validation messages.
 */

import { assertValidUuid, containsRawUuid } from './zeroUuid';
import {
  computeAuditCalendarSpanDays,
  DEFAULT_AUDIT_ALERT_CONFIG,
  validateAuditorCapacityAgainstSpan,
  type AlertConfigEntity,
} from './auditAlertsEngine';
import {
  resolveLatestAuditDate,
  resolveLatestRealExecutionDate,
  roundAuditDaysQuarter,
  type AuditDateEntry,
  type ConsolidatedAuditorDayTotal,
} from './auditPlanningEngine';
import { resolveCertVersionSnapshotForAudit } from './certificadoVersionDomain';
import type { Phase5FindingEntity, ProgramacionAuditEntity } from './auditExecution';
import type { AuditoriaSitioTemporalEntity } from './designacionTemporalDomain';
import type { CertificadoDetailEntity } from './multisiteSampling';
import type { CertificateRecord } from './searchControls';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const MONTHS_ES_SHORT: ReadonlyArray<string> = [
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
];

export function isValidIsoCalendarDate(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!ISO_DATE_PATTERN.test(trimmed)) return false;
  const [yStr, mStr, dStr] = trimmed.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);
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

export function formatIsoDateDmy(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  const clean = isoDate.trim().slice(0, 10);
  if (!ISO_DATE_PATTERN.test(clean)) return clean || '—';
  const [y, m, d] = clean.split('-');
  return `${d}/${m}/${y}`;
}

export interface MultiAuditorSpanSummary {
  hasRealDates: boolean;
  realStartIso: string | null;
  realEndIso: string | null;
  realCalendarSpanDays: number;
  totalAuditorDays: number;
  distinctAuditorsCount: number;
  maxDaysSingleAuditor: number;
  isConcurrentScheduleValid: boolean;
  compactSummaryLabel: string;
  explanationLabel: string;
  overloadedWarnings: string[];
}

export interface ComputedFindingDeadlines {
  baseRealEndIso: string;
  fechaLimitePlan: string;
  fechaLimiteCierre: string;
  planOffsetDays: number;
  cierreOffsetDays: number;
}

/**
 * Adds a signed integer number of calendar days to an ISO `YYYY-MM-DD` date in UTC.
 */
export function addCalendarDaysIso(isoDate: string, daysToAdd: number): string {
  const trimmed = (isoDate || '').trim();
  if (!ISO_DATE_PATTERN.test(trimmed)) return trimmed;
  const baseMs = Date.parse(`${trimmed}T00:00:00Z`);
  if (!Number.isFinite(baseMs)) return trimmed;
  const safeOffset = Number.isFinite(daysToAdd) ? Math.trunc(daysToAdd) : 0;
  const target = new Date(baseMs + safeOffset * 86_400_000);
  return target.toISOString().slice(0, 10);
}

/**
 * Resolves the effective `REAL` execution window (`fecha_inicio`, `fecha_fin`) for an audit.
 */
export function resolveAuditRealWindow(audit: ProgramacionAuditEntity): {
  entry: AuditDateEntry | null;
  realStartIso: string | null;
  realEndIso: string | null;
} {
  const fromFechas = resolveLatestRealExecutionDate(audit.fechas);
  const entry =
    fromFechas ??
    (audit.latestDate && !audit.latestDate.deleted_at && audit.latestDate.tipo_fecha === 'REAL'
      ? audit.latestDate
      : null);
  const realStartIso = entry?.fecha_inicio ? entry.fecha_inicio.slice(0, 10) : null;
  const realEndIso = entry?.fecha_fin
    ? entry.fecha_fin.slice(0, 10)
    : realStartIso;
  return { entry, realStartIso, realEndIso };
}

/**
 * Evaluates multi-auditor concurrency against the real physical execution window (`REAL`).
 */
export function evaluateRealExecutionCapacity(
  audit: ProgramacionAuditEntity,
  temporalSites: ReadonlyArray<AuditoriaSitioTemporalEntity>,
  overrideRealStart?: string | null,
  overrideRealEnd?: string | null
): MultiAuditorSpanSummary {
  const resolved = resolveAuditRealWindow(audit);
  const realStart = (overrideRealStart ?? resolved.realStartIso ?? '').trim() || null;
  const realEnd = (overrideRealEnd ?? resolved.realEndIso ?? realStart ?? '').trim() || null;

  const daysByAuditor = new Map<string, { nombre: string; totalDays: number }>();
  let totalAuditorDays = 0;

  const trackAuditorDays = (auditorId: string, nombre: string, days: number): void => {
    const cleanDays = Number.isFinite(days) ? Math.max(0, days) : 0;
    totalAuditorDays += cleanDays;
    const prev = daysByAuditor.get(auditorId);
    if (prev) {
      prev.totalDays = roundAuditDaysQuarter(prev.totalDays + cleanDays);
    } else {
      daysByAuditor.set(auditorId, {
        nombre: nombre || 'Auditor Evaluador',
        totalDays: roundAuditDaysQuarter(cleanDays),
      });
    }
  };

  for (const sp of (audit.sitiosPlan || []).filter((s) => !s.deleted_at)) {
    for (const member of (sp.equipoSitio || []).filter((m) => !m.deleted_at)) {
      trackAuditorDays(member.id_auditor, member.auditor_nombre, member.tiempo_auditoria || 0);
    }
  }

  for (const ts of temporalSites.filter((t) => !t.deleted_at)) {
    const applies =
      ts.id_auditoria === audit.id ||
      ts.certificados.some((c) => !c.deleted_at && c.id_auditoria_certificado === audit.id);
    if (!applies) continue;
    for (const member of ts.equipoTemporal.filter((m) => !m.deleted_at)) {
      trackAuditorDays(member.id_auditor, member.auditor_nombre, member.tiempo_auditoria || 0);
    }
  }

  if (daysByAuditor.size === 0 && totalAuditorDays === 0) {
    const activeSiteSum = (audit.sitiosPlan || [])
      .filter((s) => !s.deleted_at)
      .reduce((acc, s) => acc + (Number(s.tiempo_auditoria) || 0), 0);
    const fallbackTotalDays = roundAuditDaysQuarter(
      audit.tiempo_auditoria ?? (audit.dias_auditor || activeSiteSum || 0)
    );
    const teamRoster: Array<{ id: string; nombre: string }> = [];
    const seenTeamIds = new Set<string>();
    for (const m of audit.equipo || []) {
      if (m.id_auditor && !seenTeamIds.has(m.id_auditor)) {
        seenTeamIds.add(m.id_auditor);
        teamRoster.push({ id: m.id_auditor, nombre: m.nombre || 'Auditor de Equipo' });
      }
    }
    if (teamRoster.length === 0 && audit.auditor_lider_id) {
      teamRoster.push({
        id: audit.auditor_lider_id,
        nombre: audit.auditor_lider || 'Auditor Líder',
      });
    }
    if (teamRoster.length > 0 && fallbackTotalDays > 0) {
      const basePerAuditor = roundAuditDaysQuarter(fallbackTotalDays / teamRoster.length);
      let remaining = fallbackTotalDays;
      teamRoster.forEach((member, idx) => {
        const share =
          idx === teamRoster.length - 1
            ? roundAuditDaysQuarter(Math.max(0, remaining))
            : Math.min(remaining, basePerAuditor);
        remaining = roundAuditDaysQuarter(Math.max(0, remaining - share));
        trackAuditorDays(member.id, member.nombre, share);
      });
    }
  }

  totalAuditorDays = roundAuditDaysQuarter(totalAuditorDays);
  const maxDaysSingleAuditor = roundAuditDaysQuarter(
    Math.max(0, ...Array.from(daysByAuditor.values(), (entry) => entry.totalDays))
  );

  if (!realStart || !realEnd || !isValidIsoCalendarDate(realStart) || !isValidIsoCalendarDate(realEnd)) {
    return {
      hasRealDates: false,
      realStartIso: null,
      realEndIso: null,
      realCalendarSpanDays: 0,
      totalAuditorDays,
      distinctAuditorsCount: daysByAuditor.size,
      maxDaysSingleAuditor,
      isConcurrentScheduleValid: false,
      compactSummaryLabel: `Días-Auditor: ${totalAuditorDays.toFixed(2)}d | Ventana Real: Pendiente (${daysByAuditor.size} ${daysByAuditor.size === 1 ? 'auditor' : 'auditores'})`,
      explanationLabel:
        'Registre fechas reales de ejecución (REAL) para validar la capacidad concurrente del equipo auditor.',
      overloadedWarnings: [],
    };
  }

  const syntheticRealEntry: AuditDateEntry = {
    id: 'eval-real-span',
    id_auditoria: audit.id,
    numero_secuencia: 1,
    tag: 'Programación',
    tipo_fecha: 'REAL',
    anio: null,
    mes: null,
    fecha_inicio: realStart,
    fecha_fin: realEnd,
    deleted_at: null,
  };

  const realCalendarSpanDays = computeAuditCalendarSpanDays(syntheticRealEntry);
  if (realCalendarSpanDays === null || realCalendarSpanDays <= 0) {
    return {
      hasRealDates: false,
      realStartIso: realStart,
      realEndIso: realEnd,
      realCalendarSpanDays: 0,
      totalAuditorDays,
      distinctAuditorsCount: daysByAuditor.size,
      maxDaysSingleAuditor,
      isConcurrentScheduleValid: false,
      compactSummaryLabel: `Días-Auditor: ${totalAuditorDays.toFixed(2)}d | Ventana Real: Rango inválido`,
      explanationLabel: 'La fecha de fin real debe ser igual o posterior a la fecha de inicio real.',
      overloadedWarnings: [],
    };
  }

  const auditorTotals: ConsolidatedAuditorDayTotal[] = Array.from(daysByAuditor.entries()).map(
    ([idAuditor, info]) => ({
      id_auditor: idAuditor,
      auditor_nombre: info.nombre,
      rol_auditor: 'AUDITOR',
      totalDays: info.totalDays,
      sitesCount: 1,
    })
  );

  const capacityCheck = validateAuditorCapacityAgainstSpan(auditorTotals, realCalendarSpanDays);
  const isConcurrentScheduleValid =
    !capacityCheck.hasWarnings && maxDaysSingleAuditor <= realCalendarSpanDays + 0.001;
  const effectiveAuditorsCount = daysByAuditor.size;

  const compactSummaryLabel = `Días-Auditor: ${totalAuditorDays.toFixed(2)}d | Ventana Real: ${realCalendarSpanDays} días calendario (${effectiveAuditorsCount} ${effectiveAuditorsCount === 1 ? 'auditor' : 'auditores'})`;

  const explanationLabel = isConcurrentScheduleValid
    ? effectiveAuditorsCount === 0
      ? `Ventana Real de ${realCalendarSpanDays} día(s) calendario registrada (sin días-auditor asignados aún).`
      : `Total Ejecución: ${totalAuditorDays.toFixed(2)} días-auditor cubiertos en ${realCalendarSpanDays} día(s) calendario con ${effectiveAuditorsCount} auditor(es) concurrente(s).`
    : `Alerta de capacidad: un auditor acumula ${maxDaysSingleAuditor.toFixed(2)}d frente a ${realCalendarSpanDays} día(s) calendario reales.`;

  return {
    hasRealDates: true,
    realStartIso: realStart,
    realEndIso: realEnd,
    realCalendarSpanDays,
    totalAuditorDays,
    distinctAuditorsCount: effectiveAuditorsCount,
    maxDaysSingleAuditor,
    isConcurrentScheduleValid,
    compactSummaryLabel,
    explanationLabel,
    overloadedWarnings: capacityCheck.warnings,
  };
}

export function resolvePlanOffsetDays(
  config?: Partial<
    Pick<AlertConfigEntity, 'dias_limite_plan_nc' | 'dias_limite_plan_accion' | 'dias_limite_cierre_nc'>
  >
): number {
  const rawPlanOffset =
    typeof config?.dias_limite_plan_nc === 'number' && Number.isFinite(config.dias_limite_plan_nc)
      ? config.dias_limite_plan_nc
      : config?.dias_limite_plan_accion;
  return typeof rawPlanOffset === 'number' && Number.isFinite(rawPlanOffset)
    ? Math.max(1, Math.trunc(rawPlanOffset))
    : DEFAULT_AUDIT_ALERT_CONFIG.dias_limite_plan_nc ??
        DEFAULT_AUDIT_ALERT_CONFIG.dias_limite_plan_accion;
}

export function resolveCierreOffsetDays(
  config?: Partial<
    Pick<AlertConfigEntity, 'dias_limite_plan_nc' | 'dias_limite_plan_accion' | 'dias_limite_cierre_nc'>
  >
): number {
  return typeof config?.dias_limite_cierre_nc === 'number' &&
    Number.isFinite(config.dias_limite_cierre_nc)
    ? Math.max(1, Math.trunc(config.dias_limite_cierre_nc))
    : DEFAULT_AUDIT_ALERT_CONFIG.dias_limite_cierre_nc;
}

/**
 * Computes `fecha_limite_plan` (`+dias_limite_plan_nc`) and `fecha_limite_cierre`
 * (`+dias_limite_cierre_nc`) from `MAX(REAL)`.
 */
export function computeFindingDeadlinesFromRealDate(
  realEndIso: string,
  config: Partial<
    Pick<AlertConfigEntity, 'dias_limite_plan_nc' | 'dias_limite_plan_accion' | 'dias_limite_cierre_nc'>
  > = DEFAULT_AUDIT_ALERT_CONFIG
): ComputedFindingDeadlines {
  const planOffset = resolvePlanOffsetDays(config);
  const cierreOffset = resolveCierreOffsetDays(config);

  return {
    baseRealEndIso: realEndIso,
    fechaLimitePlan: addCalendarDaysIso(realEndIso, planOffset),
    fechaLimiteCierre: addCalendarDaysIso(realEndIso, cierreOffset),
    planOffsetDays: planOffset,
    cierreOffsetDays: cierreOffset,
  };
}

/**
 * Computes default `fecha_cierre_auditoria`.
 */
export function computeDefaultAuditClosingDate(
  realEndIso: string | null,
  findings: ReadonlyArray<Phase5FindingEntity>
): string | null {
  const activeNcs = findings.filter(
    (f) => !f.deleted_at && (f.tipo === 'NC_MAYOR' || f.tipo === 'NC_MENOR')
  );
  if (activeNcs.length === 0) {
    return realEndIso;
  }
  const allClosedWithDates = activeNcs.every(
    (nc) => nc.cerrado && Boolean(nc.fecha_cierre_real || nc.fecha_cierre)
  );
  if (allClosedWithDates) {
    const closeDates = activeNcs
      .map((nc) => (nc.fecha_cierre_real || nc.fecha_cierre || '').slice(0, 10))
      .filter((d) => isValidIsoCalendarDate(d))
      .sort();
    return closeDates[closeDates.length - 1] || realEndIso;
  }
  const dueDates = activeNcs
    .map((nc) => (nc.fecha_limite_cierre || nc.fecha_limite || '').slice(0, 10))
    .filter((d) => isValidIsoCalendarDate(d))
    .sort();
  return dueDates[dueDates.length - 1] || realEndIso;
}

export function validateCloseAuditAction(
  auditId: string,
  realEndIso: string | null,
  closingDateIso: string
): string | null {
  assertValidUuid(auditId, 'auditoría');
  if (!realEndIso || !isValidIsoCalendarDate(realEndIso)) {
    return 'Debe registrar al menos una fecha REAL de ejecución antes de cerrar la auditoría.';
  }
  if (!isValidIsoCalendarDate(closingDateIso)) {
    return 'Indique una Fecha de Cierre de Auditoría válida (YYYY-MM-DD).';
  }
  if (closingDateIso.trim() < realEndIso.trim()) {
    return 'La Fecha de Cierre de Auditoría no puede ser anterior a la última fecha real de ejecución.';
  }
  return null;
}

export function validateRealExecutionDateInput(input: {
  fecha_inicio: string;
  fecha_fin: string;
  observacion?: string | null;
}): string | null {
  const start = (input.fecha_inicio || '').trim();
  const end = (input.fecha_fin || '').trim();
  if (!isValidIsoCalendarDate(start)) {
    return 'Indique una Fecha de Inicio Real válida (YYYY-MM-DD).';
  }
  if (!isValidIsoCalendarDate(end)) {
    return 'Indique una Fecha de Fin Real válida (YYYY-MM-DD).';
  }
  if (end < start) {
    return 'La Fecha de Fin Real debe ser igual o posterior a la Fecha de Inicio Real.';
  }
  const obs = (input.observacion || '').trim();
  if (obs && containsRawUuid(obs)) {
    return 'La observación de la fecha real no debe contener identificadores UUID internos.';
  }
  return null;
}

export function validateFindingFollowUpDates(input: {
  fecha_entrega_plan?: string | null;
  fecha_cierre_real?: string | null;
  cerrado?: boolean;
}): string | null {
  const entrega = (input.fecha_entrega_plan || '').trim();
  const cierreReal = (input.fecha_cierre_real || '').trim();
  if (entrega && !isValidIsoCalendarDate(entrega)) {
    return 'La Fecha Real de Plan debe tener formato YYYY-MM-DD válido.';
  }
  if (cierreReal && !isValidIsoCalendarDate(cierreReal)) {
    return 'La Fecha Real de Cierre debe tener formato YYYY-MM-DD válido.';
  }
  if (entrega && cierreReal && cierreReal < entrega) {
    return 'La Fecha Real de Cierre debe ser igual o posterior a la Fecha Real de Plan.';
  }
  if (input.cerrado && cierreReal && !isValidIsoCalendarDate(cierreReal)) {
    return 'Indique una Fecha Real de Cierre válida para cerrar la No Conformidad.';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Step 8.1 — Discrete Real Dates, Clause-Only NCs, Limits & Certificate Multi View
// ---------------------------------------------------------------------------

export interface DiscreteRealDateItem {
  id: string;
  isoDate: string;
  endIsoDate: string;
  dmyLabel: string;
  numero_secuencia: number;
  observacion: string | null;
}

/**
 * Extracts all active `tipo_fecha = 'REAL'` entries for an audit in ascending chronological order.
 */
export function extractDiscreteRealDates(
  audit: ProgramacionAuditEntity | null | undefined
): DiscreteRealDateItem[] {
  if (!audit) return [];
  const rawList: AuditDateEntry[] = [];
  const seenIds = new Set<string>();

  for (const f of audit.fechas || []) {
    if (f.deleted_at || f.tipo_fecha !== 'REAL') continue;
    if (seenIds.has(f.id)) continue;
    seenIds.add(f.id);
    rawList.push(f);
  }
  if (
    audit.latestDate &&
    !audit.latestDate.deleted_at &&
    audit.latestDate.tipo_fecha === 'REAL' &&
    !seenIds.has(audit.latestDate.id)
  ) {
    rawList.push(audit.latestDate);
  }

  const items: DiscreteRealDateItem[] = [];
  for (const entry of rawList) {
    const startIso = (entry.fecha_inicio || entry.fecha_fin || '').trim().slice(0, 10);
    const endIso = (entry.fecha_fin || entry.fecha_inicio || '').trim().slice(0, 10);
    if (!isValidIsoCalendarDate(startIso)) continue;
    const safeEnd = isValidIsoCalendarDate(endIso) && endIso >= startIso ? endIso : startIso;
    const dmyLabel =
      safeEnd === startIso
        ? formatIsoDateDmy(startIso)
        : `${formatIsoDateDmy(startIso)} – ${formatIsoDateDmy(safeEnd)}`;
    items.push({
      id: entry.id,
      isoDate: startIso,
      endIsoDate: safeEnd,
      dmyLabel,
      numero_secuencia: entry.numero_secuencia,
      observacion: entry.observacion ?? null,
    });
  }

  return items.sort((a, b) => {
    const cmp = a.isoDate.localeCompare(b.isoDate);
    if (cmp !== 0) return cmp;
    return a.numero_secuencia - b.numero_secuencia;
  });
}

/**
 * Resolves `MAX(fecha_real)` across all active `REAL` date records on an audit.
 */
export function resolveMaxRealDateIso(
  audit: ProgramacionAuditEntity | null | undefined
): string | null {
  const entries = extractDiscreteRealDates(audit);
  if (entries.length === 0) return null;
  let maxIso = entries[0].endIsoDate;
  for (const e of entries) {
    if (e.endIsoDate > maxIso) maxIso = e.endIsoDate;
  }
  return maxIso;
}

/**
 * Validates adding a single discrete real audit date (`YYYY-MM-DD`), rejecting invalid dates
 * or duplicates on the same audit.
 */
export function validateDiscreteRealDateAdd(
  audit: ProgramacionAuditEntity | null | undefined,
  isoDate: string
): { ok: true; isoDate: string } | { ok: false; error: string } {
  if (!audit || audit.deleted_at) {
    return { ok: false, error: 'Debe seleccionar una auditoría activa para registrar fechas reales.' };
  }
  const clean = (isoDate || '').trim().slice(0, 10);
  if (!isValidIsoCalendarDate(clean)) {
    return { ok: false, error: 'Indique una fecha real exacta válida (AAAA-MM-DD).' };
  }
  const existing = extractDiscreteRealDates(audit);
  const duplicate = existing.some(
    (item) => item.isoDate === clean && item.endIsoDate === clean
  );
  if (duplicate) {
    return {
      ok: false,
      error: `La fecha real ${formatIsoDateDmy(clean)} ya se encuentra registrada en esta auditoría.`,
    };
  }
  return { ok: true, isoDate: clean };
}

export interface NcLimitsSummary {
  hasRealDate: boolean;
  baseRealIso: string | null;
  baseRealDmy: string | null;
  planLimitIso: string | null;
  planLimitDmy: string | null;
  cierreLimitIso: string | null;
  cierreLimitDmy: string | null;
  planOffsetDays: number;
  cierreOffsetDays: number;
}

/**
 * Computes `+Plan` and `+Cierre` limits from `MAX(fecha_real)` using configurable offsets
 * (defaults `+15d` Plan / `+45d` Cierre).
 */
export function computeNcLimitsFromLatestReal(
  latestRealDateIso: string | null | undefined,
  config: Partial<
    Pick<AlertConfigEntity, 'dias_limite_plan_nc' | 'dias_limite_plan_accion' | 'dias_limite_cierre_nc'>
  > = DEFAULT_AUDIT_ALERT_CONFIG
): NcLimitsSummary {
  const planOffsetDays = resolvePlanOffsetDays(config);
  const cierreOffsetDays = resolveCierreOffsetDays(config);
  const cleanBase = latestRealDateIso ? latestRealDateIso.trim().slice(0, 10) : null;

  if (!cleanBase || !isValidIsoCalendarDate(cleanBase)) {
    return {
      hasRealDate: false,
      baseRealIso: null,
      baseRealDmy: null,
      planLimitIso: null,
      planLimitDmy: null,
      cierreLimitIso: null,
      cierreLimitDmy: null,
      planOffsetDays,
      cierreOffsetDays,
    };
  }

  const deadlines = computeFindingDeadlinesFromRealDate(cleanBase, {
    dias_limite_plan_nc: planOffsetDays,
    dias_limite_plan_accion: planOffsetDays,
    dias_limite_cierre_nc: cierreOffsetDays,
  });

  return {
    hasRealDate: true,
    baseRealIso: cleanBase,
    baseRealDmy: formatIsoDateDmy(cleanBase),
    planLimitIso: deadlines.fechaLimitePlan,
    planLimitDmy: formatIsoDateDmy(deadlines.fechaLimitePlan),
    cierreLimitIso: deadlines.fechaLimiteCierre,
    cierreLimitDmy: formatIsoDateDmy(deadlines.fechaLimiteCierre),
    planOffsetDays,
    cierreOffsetDays,
  };
}

export type NcCardStatusKey =
  | 'CERRADA'
  | 'VENCIDA'
  | 'EN_EJECUCION_CIERRE'
  | 'PLAN_PENDIENTE'
  | 'SIN_FECHA_REAL';

export interface NcCardEvaluation {
  finding: Phase5FindingEntity;
  isNc: boolean;
  clauseLabel: string;
  planLimitIso: string | null;
  planLimitDmy: string;
  cierreLimitIso: string | null;
  cierreLimitDmy: string;
  actualPlanIso: string | null;
  actualPlanDmy: string | null;
  actualCierreIso: string | null;
  actualCierreDmy: string | null;
  planOnTime: boolean | null;
  cierreOnTime: boolean | null;
  planComplianceNote: string | null;
  cierreComplianceNote: string | null;
  statusKey: NcCardStatusKey;
  statusLabel: string;
  statusBadgeClass: string;
}

/**
 * Evaluates a finding's computed deadlines (`+Plan`, `+Cierre`), timeliness, and visual status badge.
 */
export function evaluateNcCardStatus(
  finding: Phase5FindingEntity,
  latestRealDateIso: string | null | undefined,
  config: Partial<
    Pick<AlertConfigEntity, 'dias_limite_plan_nc' | 'dias_limite_plan_accion' | 'dias_limite_cierre_nc'>
  > = DEFAULT_AUDIT_ALERT_CONFIG,
  todayIso?: string,
  clauseTitleMap?: ReadonlyMap<string, string>
): NcCardEvaluation {
  const effectiveToday =
    todayIso && isValidIsoCalendarDate(todayIso)
      ? todayIso.trim().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

  const limits = computeNcLimitsFromLatestReal(latestRealDateIso, config);
  const storedPlanLimit =
    finding.fecha_limite_plan && isValidIsoCalendarDate(finding.fecha_limite_plan)
      ? finding.fecha_limite_plan.slice(0, 10)
      : null;
  const storedCierreLimit =
    finding.fecha_limite_cierre && isValidIsoCalendarDate(finding.fecha_limite_cierre)
      ? finding.fecha_limite_cierre.slice(0, 10)
      : null;

  const isNc = finding.tipo === 'NC_MAYOR' || finding.tipo === 'NC_MENOR';
  const planLimitIso = limits.hasRealDate ? limits.planLimitIso : storedPlanLimit;
  const cierreLimitIso = limits.hasRealDate ? limits.cierreLimitIso : storedCierreLimit;

  const actualPlanIso =
    finding.fecha_entrega_plan && isValidIsoCalendarDate(finding.fecha_entrega_plan)
      ? finding.fecha_entrega_plan.slice(0, 10)
      : null;
  const rawCierreReal = finding.fecha_cierre_real || finding.fecha_cierre || null;
  const actualCierreIso =
    rawCierreReal && isValidIsoCalendarDate(rawCierreReal)
      ? rawCierreReal.slice(0, 10)
      : null;

  const planOnTime =
    actualPlanIso && planLimitIso ? actualPlanIso <= planLimitIso : null;
  const cierreOnTime =
    actualCierreIso && cierreLimitIso ? actualCierreIso <= cierreLimitIso : null;

  const planComplianceNote = actualPlanIso
    ? planOnTime === true
      ? 'Plan entregado en tiempo'
      : planOnTime === false
      ? 'Plan entregado fuera de plazo'
      : 'Plan registrado'
    : null;

  const cierreComplianceNote = actualCierreIso
    ? cierreOnTime === true
      ? 'Cierre verificado en tiempo'
      : cierreOnTime === false
      ? 'Cierre verificado fuera de plazo'
      : 'Cierre registrado'
    : null;

  const isClosed = Boolean(finding.cerrado || actualCierreIso);
  let statusKey: NcCardStatusKey;
  let statusLabel: string;
  let statusBadgeClass: string;

  if (isClosed) {
    statusKey = 'CERRADA';
    statusLabel = 'Cerrada ✓';
    statusBadgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-200';
  } else if (!planLimitIso && !cierreLimitIso) {
    statusKey = 'SIN_FECHA_REAL';
    statusLabel = 'Pendiente fecha real';
    statusBadgeClass = 'bg-slate-100 text-slate-700 border-slate-200';
  } else if (!actualPlanIso) {
    if (planLimitIso && effectiveToday > planLimitIso) {
      statusKey = 'VENCIDA';
      statusLabel = 'Vencida';
      statusBadgeClass = 'bg-rose-50 text-rose-800 border-rose-200';
    } else {
      statusKey = 'PLAN_PENDIENTE';
      statusLabel = 'Plan pendiente';
      statusBadgeClass = 'bg-amber-50 text-amber-800 border-amber-200';
    }
  } else if (cierreLimitIso && effectiveToday > cierreLimitIso) {
    statusKey = 'VENCIDA';
    statusLabel = 'Vencida';
    statusBadgeClass = 'bg-rose-50 text-rose-800 border-rose-200';
  } else {
    statusKey = 'EN_EJECUCION_CIERRE';
    statusLabel = 'En ejecución de cierre';
    statusBadgeClass = 'bg-sky-50 text-sky-800 border-sky-200';
  }

  const rawTitle =
    finding.requisito_titulo?.trim() ||
    clauseTitleMap?.get(finding.id_requisito)?.trim() ||
    '';
  const cleanTitle = rawTitle && !containsRawUuid(rawTitle) ? rawTitle : '';
  const clauseLabel = cleanTitle
    ? `${finding.requisito_codigo} - ${cleanTitle}`
    : finding.requisito_codigo || 'Cláusula';

  return {
    finding,
    isNc,
    clauseLabel,
    planLimitIso,
    planLimitDmy: planLimitIso ? formatIsoDateDmy(planLimitIso) : 'Pendiente fecha real',
    cierreLimitIso,
    cierreLimitDmy: cierreLimitIso ? formatIsoDateDmy(cierreLimitIso) : 'Pendiente fecha real',
    actualPlanIso,
    actualPlanDmy: actualPlanIso ? formatIsoDateDmy(actualPlanIso) : null,
    actualCierreIso,
    actualCierreDmy: actualCierreIso ? formatIsoDateDmy(actualCierreIso) : null,
    planOnTime,
    cierreOnTime,
    planComplianceNote,
    cierreComplianceNote,
    statusKey,
    statusLabel,
    statusBadgeClass,
  };
}

export interface NormaClauseOption {
  id: string;
  codigo: string;
  titulo: string;
  label: string;
  norma: string;
}

function normalizeNormaKey(value: string | null | undefined): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Filters normative requirements strictly matching the audited certificate's standard
 * (`requisito.norma === audit.norma_codigo`) excluding ISO 4.3 non-applicable clauses
 * when provided, with Zero-UUID `codigo - titulo` labels.
 */
export function filterRequirementsForAuditNorma(
  requirements: ReadonlyArray<{
    id: string;
    codigo: string;
    norma: string;
    titulo?: string;
    descripcion?: string;
  }>,
  normaCodigo: string | null | undefined,
  excludedRequirementIds?: ReadonlySet<string>
): NormaClauseOption[] {
  const targetNorma = normalizeNormaKey(normaCodigo);
  if (!targetNorma) return [];

  const matched = requirements.filter(
    (req) =>
      normalizeNormaKey(req.norma) === targetNorma &&
      !(excludedRequirementIds && excludedRequirementIds.has(req.id))
  );
  const options: NormaClauseOption[] = matched.map((req) => {
    const cleanCode = (req.codigo || '').trim();
    const rawTitle = (req.titulo || '').trim();
    const cleanTitle = rawTitle && !containsRawUuid(rawTitle) ? rawTitle : '';
    const label = cleanTitle ? `${cleanCode} - ${cleanTitle}` : cleanCode;
    return {
      id: req.id,
      codigo: cleanCode,
      titulo: cleanTitle,
      label,
      norma: req.norma,
    };
  });

  return options.sort((a, b) =>
    a.codigo.localeCompare(b.codigo, 'es', { numeric: true, sensitivity: 'base' })
  );
}

export interface ClauseNcDraftValidationInput {
  auditId: string;
  tipo: string;
  id_requisito: string;
  descripcion: string;
}

/**
 * Validates clause-only NC creation (`id_proceso = null`), enforcing standard matching
 * and Zero-UUID text safety.
 */
export function validateClauseNcDraft(
  input: ClauseNcDraftValidationInput,
  allowedRequirements: ReadonlyArray<NormaClauseOption>
):
  | {
      ok: true;
      value: {
        id_auditoria: string;
        tipo: 'NC_MAYOR' | 'NC_MENOR';
        id_requisito: string;
        requisito_codigo: string;
        requisito_titulo: string;
        descripcion: string;
        id_proceso: null;
      };
    }
  | { ok: false; error: string } {
  if (!input.auditId || !input.auditId.trim()) {
    return { ok: false, error: 'Debe seleccionar una auditoría activa.' };
  }
  const tipo = input.tipo === 'NC_MAYOR' || input.tipo === 'NC_MENOR' ? input.tipo : null;
  if (!tipo) {
    return {
      ok: false,
      error: 'Seleccione la gravedad de la No Conformidad (NC Mayor o NC Menor).',
    };
  }
  const reqId = (input.id_requisito || '').trim();
  if (!reqId) {
    return { ok: false, error: 'Debe seleccionar una cláusula de la norma auditada.' };
  }
  const matchedReq = allowedRequirements.find((r) => r.id === reqId);
  if (!matchedReq) {
    return {
      ok: false,
      error: 'La cláusula seleccionada no pertenece a la norma del certificado auditado.',
    };
  }
  const desc = (input.descripcion || '').trim();
  if (desc.length < 5) {
    return {
      ok: false,
      error: 'Describa brevemente la No Conformidad (mínimo 5 caracteres).',
    };
  }
  if (containsRawUuid(desc)) {
    return {
      ok: false,
      error: 'La descripción no debe contener identificadores UUID internos.',
    };
  }
  return {
    ok: true,
    value: {
      id_auditoria: input.auditId.trim(),
      tipo,
      id_requisito: matchedReq.id,
      requisito_codigo: matchedReq.codigo,
      requisito_titulo: matchedReq.titulo,
      descripcion: desc,
      id_proceso: null,
    },
  };
}

export type CertificateResultadoStatusKey = 'PENDIENTE' | 'CON_NC_ABIERTAS' | 'COMPLETO';

export interface CertificateResultadoRow {
  id: string;
  certId: string;
  numero_certificado: string;
  organizacion_nombre: string;
  organizacion_abreviacion?: string | null;
  id_organizacion: string;
  norma_codigo: string;
  estatus: string;
  activeVersionNumero?: number | null;
  alcance_es?: string | null;
  alcance_en?: string | null;
  hasAlcance?: boolean;
  auditsCount: number;
  latestAudit: ProgramacionAuditEntity | null;
  latestAuditTipo: string;
  latestAuditDateLabel: string;
  realDatesCount: number;
  realDatesLabel: string;
  totalNcsCount: number;
  openNcsCount: number;
  closedNcsCount: number;
  ncsLabel: string;
  statusKey: CertificateResultadoStatusKey;
  statusLabel: 'Pendiente' | 'Con NCs Abiertas' | 'Completo ✓';
  statusBadgeClass: string;
  searchHaystack: string;
}

function getAuditDateOrderKey(audit: ProgramacionAuditEntity): string {
  const maxReal = resolveMaxRealDateIso(audit);
  if (maxReal) return maxReal;
  const latest = resolveLatestAuditDate(audit.fechas) ?? audit.latestDate ?? null;
  if (latest && !latest.deleted_at) {
    if (latest.fecha_fin) return latest.fecha_fin.slice(0, 10);
    if (latest.fecha_inicio) return latest.fecha_inicio.slice(0, 10);
    if (latest.anio && latest.mes) {
      return `${latest.anio}-${String(latest.mes).padStart(2, '0')}-01`;
    }
  }
  return (audit.fecha_fin || audit.fecha_inicio || '').slice(0, 10);
}

function formatLatestAuditDateSummary(audit: ProgramacionAuditEntity | null): string {
  if (!audit) return 'Sin programar';
  const maxReal = resolveMaxRealDateIso(audit);
  if (maxReal) return `Real: ${formatIsoDateDmy(maxReal)}`;

  const latest = resolveLatestAuditDate(audit.fechas) ?? audit.latestDate ?? null;
  if (latest && !latest.deleted_at) {
    if (latest.tipo_fecha === 'PREPROGRAMADA_MES' && latest.anio && latest.mes) {
      const mName = MONTHS_ES_SHORT[latest.mes - 1] || `M${latest.mes}`;
      return `${mName} ${latest.anio}`;
    }
    const iso = (latest.fecha_fin || latest.fecha_inicio || '').slice(0, 10);
    if (iso) return formatIsoDateDmy(iso);
  }
  const fallback = (audit.fecha_fin || audit.fecha_inicio || '').slice(0, 10);
  return fallback ? formatIsoDateDmy(fallback) : 'Sin fecha';
}

/**
 * Builds 1 row per Certificate for the Step 8.1 `6. Resultado` Certificate-Based Multi View.
 */
export function buildCertificateResultadoRows(params: {
  audits: ReadonlyArray<ProgramacionAuditEntity>;
  findings: ReadonlyArray<Phase5FindingEntity>;
  certificados?: ReadonlyArray<CertificadoDetailEntity>;
  certificates?: ReadonlyArray<CertificateRecord>;
}): CertificateResultadoRow[] {
  const { audits, findings, certificados = [], certificates = [] } = params;
  const activeAudits = audits.filter((a) => !a.deleted_at);
  const activeFindings = findings.filter((f) => !f.deleted_at);

  interface CertStub {
    certId: string;
    numero_certificado: string;
    organizacion_nombre: string;
    organizacion_abreviacion: string | null;
    id_organizacion: string;
    norma_codigo: string;
    estatus: string;
    activeVersionNumero: number | null;
    alcance_es: string | null;
    alcance_en: string | null;
    hasAlcance: boolean;
    detailedRef: CertificadoDetailEntity | null;
  }

  const certMap = new Map<string, CertStub>();

  for (const c of certificados) {
    if ('deleted_at' in c && (c as { deleted_at?: string | null }).deleted_at) continue;
    const activeAlc =
      c.alcanceDetalle && !c.alcanceDetalle.deleted_at
        ? c.alcanceDetalle.alcance_es.trim()
        : c.alcanceDetalle === undefined && typeof c.alcance === 'string'
        ? c.alcance.trim()
        : '';
    const activeAlcEn =
      c.alcanceDetalle && !c.alcanceDetalle.deleted_at
        ? c.alcanceDetalle.alcance_en?.trim() || null
        : null;
    const hasAlc =
      c.alcanceDetalle !== undefined
        ? Boolean(c.alcanceDetalle && !c.alcanceDetalle.deleted_at && activeAlc.length > 0)
        : Boolean(activeAlc.length > 0);
    certMap.set(c.id, {
      certId: c.id,
      numero_certificado: c.numero_certificado,
      organizacion_nombre: c.organizacion_nombre,
      organizacion_abreviacion: c.organizacion_abreviacion?.trim() || null,
      id_organizacion: c.id_organizacion,
      norma_codigo: c.norma_codigo || 'ISO',
      estatus: c.estatus || 'ACTIVO',
      activeVersionNumero:
        typeof c.version_actual_numero === 'number' && c.version_actual_numero >= 1
          ? Math.floor(c.version_actual_numero)
          : null,
      alcance_es: activeAlc || null,
      alcance_en: activeAlcEn,
      hasAlcance: hasAlc,
      detailedRef: c,
    });
  }

  for (const c of certificates) {
    const existing = certMap.get(c.id);
    if (existing) {
      if (!existing.organizacion_abreviacion && c.organizacion_abreviacion) {
        existing.organizacion_abreviacion = c.organizacion_abreviacion.trim() || null;
      }
      if (!existing.activeVersionNumero && c.version_numero && c.version_numero >= 1) {
        existing.activeVersionNumero = Math.floor(c.version_numero);
      }
      if (!existing.alcance_es && (c.alcance_es || c.alcance)) {
        const sc = (c.alcance_es || c.alcance || '').trim();
        if (sc) {
          existing.alcance_es = sc;
          existing.alcance_en = c.alcance_en?.trim() || existing.alcance_en;
          if (c.tiene_alcance !== false) existing.hasAlcance = true;
        }
      }
      continue;
    }
    const sc = (c.alcance_es || c.alcance || '').trim();
    certMap.set(c.id, {
      certId: c.id,
      numero_certificado: c.numero_certificado,
      organizacion_nombre: c.organizacion_nombre,
      organizacion_abreviacion: c.organizacion_abreviacion?.trim() || null,
      id_organizacion: c.organizacion_id || '',
      norma_codigo: c.norma || 'ISO',
      estatus: c.estatus || 'ACTIVO',
      activeVersionNumero:
        typeof c.version_numero === 'number' && c.version_numero >= 1
          ? Math.floor(c.version_numero)
          : null,
      alcance_es: sc || null,
      alcance_en: c.alcance_en?.trim() || null,
      hasAlcance: typeof c.tiene_alcance === 'boolean' ? c.tiene_alcance : Boolean(sc),
      detailedRef: null,
    });
  }

  for (const a of activeAudits) {
    if (!a.id_certificado) continue;
    const existing = certMap.get(a.id_certificado);
    if (existing) {
      if (!existing.organizacion_abreviacion && a.organizacion_abreviacion) {
        existing.organizacion_abreviacion = a.organizacion_abreviacion.trim() || null;
      }
      if (!existing.activeVersionNumero && a.version_numero && a.version_numero >= 1) {
        existing.activeVersionNumero = Math.floor(a.version_numero);
      }
      continue;
    }
    certMap.set(a.id_certificado, {
      certId: a.id_certificado,
      numero_certificado: a.numero_certificado,
      organizacion_nombre: a.organizacion_nombre,
      organizacion_abreviacion: a.organizacion_abreviacion?.trim() || null,
      id_organizacion: a.id_organizacion,
      norma_codigo: a.norma_codigo || 'ISO',
      estatus: 'ACTIVO',
      activeVersionNumero:
        typeof a.version_numero === 'number' && a.version_numero >= 1
          ? Math.floor(a.version_numero)
          : null,
      alcance_es: null,
      alcance_en: null,
      hasAlcance: true,
      detailedRef: null,
    });
  }

  const auditsByCert = new Map<string, ProgramacionAuditEntity[]>();
  for (const a of activeAudits) {
    if (!a.id_certificado) continue;
    const list = auditsByCert.get(a.id_certificado) ?? [];
    list.push(a);
    auditsByCert.set(a.id_certificado, list);
  }

  const findingsByAudit = new Map<string, Phase5FindingEntity[]>();
  for (const f of activeFindings) {
    if (f.tipo !== 'NC_MAYOR' && f.tipo !== 'NC_MENOR') continue;
    const list = findingsByAudit.get(f.id_auditoria) ?? [];
    list.push(f);
    findingsByAudit.set(f.id_auditoria, list);
  }

  const rows: CertificateResultadoRow[] = [];
  for (const cert of certMap.values()) {
    const certAudits = (auditsByCert.get(cert.certId) ?? []).slice().sort((a, b) => {
      const dateCmp = getAuditDateOrderKey(b).localeCompare(getAuditDateOrderKey(a));
      if (dateCmp !== 0) return dateCmp;
      return b.codigo_auditoria.localeCompare(a.codigo_auditoria, 'es');
    });
    const latestAudit = certAudits[0] ?? null;
    const realDates = extractDiscreteRealDates(latestAudit);
    const realDatesCount = realDates.length;
    const realDatesLabel =
      realDatesCount === 0
        ? 'Sin registrar'
        : `${realDatesCount} ${realDatesCount === 1 ? 'día' : 'días'}`;

    const auditNcs = latestAudit ? findingsByAudit.get(latestAudit.id) ?? [] : [];
    const totalNcsCount = auditNcs.length;
    const closedNcsCount = auditNcs.filter(
      (nc) => Boolean(nc.cerrado || nc.fecha_cierre_real || nc.fecha_cierre)
    ).length;
    const openNcsCount = totalNcsCount - closedNcsCount;
    const ncsLabel =
      totalNcsCount === 0
        ? '0 NCs'
        : `${openNcsCount} ${openNcsCount === 1 ? 'abierta' : 'abiertas'} / ${closedNcsCount} ${closedNcsCount === 1 ? 'cerrada' : 'cerradas'}`;

    let statusKey: CertificateResultadoStatusKey;
    let statusLabel: CertificateResultadoRow['statusLabel'];
    let statusBadgeClass: string;

    if (!latestAudit || realDatesCount === 0) {
      statusKey = 'PENDIENTE';
      statusLabel = 'Pendiente';
      statusBadgeClass = 'bg-amber-50 text-amber-800 border-amber-200';
    } else if (openNcsCount > 0) {
      statusKey = 'CON_NC_ABIERTAS';
      statusLabel = 'Con NCs Abiertas';
      statusBadgeClass = 'bg-rose-50 text-rose-800 border-rose-200';
    } else {
      statusKey = 'COMPLETO';
      statusLabel = 'Completo ✓';
      statusBadgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-200';
    }

    const latestAuditTipo = latestAudit?.tipo_auditoria || 'Sin auditoría';
    const latestAuditDateLabel = formatLatestAuditDateSummary(latestAudit);
    const snapshot =
      latestAudit && (cert.detailedRef || certificados.length > 0)
        ? resolveCertVersionSnapshotForAudit(
            latestAudit,
            cert.detailedRef ? [cert.detailedRef] : certificados
          )
        : null;
    const resolvedVersionNum =
      snapshot?.versionNumero ??
      latestAudit?.version_numero ??
      cert.activeVersionNumero ??
      null;
    const resolvedOrgAbrev =
      snapshot?.organizacionAbreviacion ??
      cert.organizacion_abreviacion ??
      latestAudit?.organizacion_abreviacion ??
      null;
    const resolvedAlcanceEs = snapshot?.alcance_es || cert.alcance_es || null;

    rows.push({
      id: cert.certId,
      certId: cert.certId,
      numero_certificado: cert.numero_certificado,
      organizacion_nombre: snapshot?.organizacionNombre || cert.organizacion_nombre,
      organizacion_abreviacion: resolvedOrgAbrev,
      id_organizacion: cert.id_organizacion,
      norma_codigo: cert.norma_codigo,
      estatus: cert.estatus,
      activeVersionNumero:
        typeof resolvedVersionNum === 'number' && resolvedVersionNum >= 1
          ? Math.floor(resolvedVersionNum)
          : null,
      alcance_es: resolvedAlcanceEs,
      alcance_en: snapshot?.alcance_en ?? cert.alcance_en ?? null,
      hasAlcance: snapshot ? snapshot.hasAlcance : cert.hasAlcance,
      auditsCount: certAudits.length,
      latestAudit,
      latestAuditTipo,
      latestAuditDateLabel,
      realDatesCount,
      realDatesLabel,
      totalNcsCount,
      openNcsCount,
      closedNcsCount,
      ncsLabel,
      statusKey,
      statusLabel,
      statusBadgeClass,
      searchHaystack: [
        cert.numero_certificado,
        cert.organizacion_nombre,
        resolvedOrgAbrev || '',
        resolvedAlcanceEs || '',
        cert.norma_codigo,
        latestAudit?.codigo_auditoria || '',
        latestAuditTipo,
        statusLabel,
      ]
        .join(' ')
        .toLowerCase(),
    });
  }

  return rows.sort((a, b) =>
    a.numero_certificado.localeCompare(b.numero_certificado, 'es', { numeric: true })
  );
}
