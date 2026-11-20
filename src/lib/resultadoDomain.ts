/**
 * Step 10.2 — `Resultado`: Dominio Multi-Auditor vs Días Reales, Calculadora NC y Cierre de Auditoría.
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
  resolveLatestRealExecutionDate,
  roundAuditDaysQuarter,
  type AuditDateEntry,
  type ConsolidatedAuditorDayTotal,
} from './auditPlanningEngine';
import type { Phase5FindingEntity, ProgramacionAuditEntity } from './auditExecution';
import type { AuditoriaSitioTemporalEntity } from './designacionTemporalDomain';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoCalendarDate(value: string | null | undefined): boolean {
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
 * - Example: `6.00d` total split across 2 auditors (`3.00d` each) over `3` calendar days -> VALID.
 * - Overload occurs only when a single auditor exceeds `realCalendarSpanDays`.
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

  // Fallback for legacy / pre-planning audits that only carry audit.equipo + tiempo_auditoria/dias_auditor
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

/**
 * Computes `fecha_limite_plan` (`+dias_limite_plan_accion`) and `fecha_limite_cierre`
 * (`+dias_limite_cierre_nc`) from `MAX(REAL.fecha_fin)`.
 */
export function computeFindingDeadlinesFromRealDate(
  realEndIso: string,
  config: Partial<Pick<AlertConfigEntity, 'dias_limite_plan_accion' | 'dias_limite_cierre_nc'>> = DEFAULT_AUDIT_ALERT_CONFIG
): ComputedFindingDeadlines {
  const planOffset =
    typeof config.dias_limite_plan_accion === 'number' &&
    Number.isFinite(config.dias_limite_plan_accion)
      ? Math.max(1, Math.trunc(config.dias_limite_plan_accion))
      : DEFAULT_AUDIT_ALERT_CONFIG.dias_limite_plan_accion;
  const cierreOffset =
    typeof config.dias_limite_cierre_nc === 'number' &&
    Number.isFinite(config.dias_limite_cierre_nc)
      ? Math.max(1, Math.trunc(config.dias_limite_cierre_nc))
      : DEFAULT_AUDIT_ALERT_CONFIG.dias_limite_cierre_nc;

  return {
    baseRealEndIso: realEndIso,
    fechaLimitePlan: addCalendarDaysIso(realEndIso, planOffset),
    fechaLimiteCierre: addCalendarDaysIso(realEndIso, cierreOffset),
    planOffsetDays: planOffset,
    cierreOffsetDays: cierreOffset,
  };
}

/**
 * Computes default `fecha_cierre_auditoria`:
 * - `0` active NCs (`NC_MAYOR` / `NC_MENOR`) -> `realEndIso`
 * - `>= 1` active NCs and all closed with close dates -> `MAX(fecha_cierre_real || fecha_cierre)`
 * - `>= 1` active NCs with open NCs -> `MAX(fecha_limite_cierre || fecha_limite)`
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

/**
 * Validates whether an audit can transition to `estado_ciclo = 'Cerrada'` with `fecha_cierre_auditoria`.
 */
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

/**
 * Validates a `REAL` execution date entry (`fecha_inicio`, `fecha_fin`, `observacion`).
 */
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

/**
 * Validates optional NC follow-up dates (`fecha_entrega_plan`, `fecha_cierre_real`)
 * when updating a finding lifecycle record.
 */
export function validateFindingFollowUpDates(input: {
  fecha_entrega_plan?: string | null;
  fecha_cierre_real?: string | null;
  cerrado?: boolean;
}): string | null {
  const entrega = (input.fecha_entrega_plan || '').trim();
  const cierreReal = (input.fecha_cierre_real || '').trim();
  if (entrega && !isValidIsoCalendarDate(entrega)) {
    return 'La Fecha de Entrega de Plan debe tener formato YYYY-MM-DD válido.';
  }
  if (cierreReal && !isValidIsoCalendarDate(cierreReal)) {
    return 'La Fecha de Cierre Real debe tener formato YYYY-MM-DD válido.';
  }
  if (input.cerrado && cierreReal && !isValidIsoCalendarDate(cierreReal)) {
    return 'Indique una Fecha de Cierre Real válida para cerrar el hallazgo.';
  }
  return null;
}
