/**
 * Step 9.1 — Motor Puro del Pipeline Operativo y Contadores de Calendario (`pipelineEngine.ts`)
 * - Resuelve en orden estricto la etapa actual de 1 palabra (`PipelineStageOneWord`)
 *   para cada auditoría o campaña (`Vínculo` → `Tipo` → `Sitio` → `Temporal` → `Tiempo`
 *   → `Asignación` → `Programa` → `Resultado` → `Revisión` → `Finalizada`).
 * - Calcula conteos exactos por año, trimestres (`Q1`–`Q4`) y meses (`1`–`12`) sobre fechas
 *   `REAL`, `PROGRAMADA_EXACTA` y `PREPROGRAMADA_MES` sin doble conteo dentro de un mismo periodo.
 *
 * Strictly typed (`strict: true`, zero untyped casts) and Zero-UUID compliant.
 */

import {
  resolveLatestAuditDate,
  type AuditDateEntry,
  type ProgramaAuditoriaEntity,
} from './auditPlanningEngine';
import type { ProgramacionAuditEntity } from './auditExecution';
import type { AuditoriaSitioTemporalEntity } from './designacionTemporalDomain';

export type PipelineStageOneWord =
  | 'Vínculo'
  | 'Tipo'
  | 'Sitio'
  | 'Temporal'
  | 'Tiempo'
  | 'Asignación'
  | 'Programa'
  | 'Resultado'
  | 'Revisión'
  | 'Finalizada';

export const PIPELINE_STAGE_ORDER: readonly PipelineStageOneWord[] = [
  'Vínculo',
  'Tipo',
  'Sitio',
  'Temporal',
  'Tiempo',
  'Asignación',
  'Programa',
  'Resultado',
  'Revisión',
  'Finalizada',
] as const;

export interface PipelineStageBadgeMeta {
  stage: PipelineStageOneWord;
  targetSubview: string;
  badgeClass: string;
}

const STAGE_META_MAP: Record<PipelineStageOneWord, PipelineStageBadgeMeta> = {
  Vínculo: {
    stage: 'Vínculo',
    targetSubview: 'vinculo',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200',
  },
  Tipo: {
    stage: 'Tipo',
    targetSubview: 'designacion/tipo',
    badgeClass: 'bg-sky-50 text-sky-800 border-sky-200 hover:bg-sky-100',
  },
  Sitio: {
    stage: 'Sitio',
    targetSubview: 'designacion/sitio',
    badgeClass: 'bg-cyan-50 text-cyan-800 border-cyan-200 hover:bg-cyan-100',
  },
  Temporal: {
    stage: 'Temporal',
    targetSubview: 'designacion/temporal',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100',
  },
  Tiempo: {
    stage: 'Tiempo',
    targetSubview: 'tiempo',
    badgeClass: 'bg-orange-50 text-orange-800 border-orange-200 hover:bg-orange-100',
  },
  Asignación: {
    stage: 'Asignación',
    targetSubview: 'auditor',
    badgeClass: 'bg-violet-50 text-violet-800 border-violet-200 hover:bg-violet-100',
  },
  Programa: {
    stage: 'Programa',
    targetSubview: 'proceso',
    badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100',
  },
  Resultado: {
    stage: 'Resultado',
    targetSubview: 'resultado',
    badgeClass: 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100',
  },
  Revisión: {
    stage: 'Revisión',
    targetSubview: 'revision',
    badgeClass: 'bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100',
  },
  Finalizada: {
    stage: 'Finalizada',
    targetSubview: 'resumen',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100',
  },
};

export function getPipelineStageBadgeMeta(stage: PipelineStageOneWord): PipelineStageBadgeMeta {
  return STAGE_META_MAP[stage];
}

function isProgramEntity(
  value: ProgramaAuditoriaEntity | ProgramacionAuditEntity
): value is ProgramaAuditoriaEntity {
  return 'auditorias' in value && Array.isArray(value.auditorias);
}

function hasActiveDateForStep3(audit: ProgramacionAuditEntity): boolean {
  const hasEntry = (audit.fechas || []).some((f) => !f.deleted_at);
  if (hasEntry) return true;
  if (audit.latestDate && !audit.latestDate.deleted_at) return true;
  if ((!audit.fechas || audit.fechas.length === 0) && audit.fecha_inicio) {
    return /^\d{4}-\d{2}-\d{2}$/.test(audit.fecha_inicio.trim());
  }
  return false;
}

function isAuditReviewed(audit: ProgramacionAuditEntity): boolean {
  const statusNorm = (audit.estatus || '').trim().toLowerCase();
  return (
    audit.revisado === true ||
    Boolean(audit.fecha_revision) ||
    statusNorm === 'finalizada'
  );
}

function isAuditClosed(audit: ProgramacionAuditEntity): boolean {
  if (isAuditReviewed(audit)) return true;
  const statusNorm = (audit.estatus || '').trim().toLowerCase();
  return (
    statusNorm === 'cerrado' ||
    statusNorm === 'cerrada' ||
    Boolean(audit.fecha_cierre_auditoria)
  );
}

function isAuditExecutedOrResultReady(audit: ProgramacionAuditEntity): boolean {
  if (isAuditClosed(audit)) return true;
  const statusNorm = (audit.estatus || '').trim().toLowerCase();
  return (
    statusNorm === 'completado' ||
    statusNorm === 'auditada' ||
    audit.estado_ciclo === 'Auditada' ||
    Boolean(audit.recomendacion)
  );
}

/**
 * Evaluates the current 1-word pipeline stage (`PipelineStageOneWord`) for a
 * campaign (`ProgramaAuditoriaEntity`) or single audit (`ProgramacionAuditEntity`)
 * using active regular sites and optional temporal sites (`AuditoriaSitioTemporalEntity`).
 */
export function resolveCurrentPipelineStage(
  programOrAudit: ProgramaAuditoriaEntity | ProgramacionAuditEntity,
  temporalSites: ReadonlyArray<AuditoriaSitioTemporalEntity> = []
): PipelineStageOneWord {
  const isProg = isProgramEntity(programOrAudit);
  const program: ProgramaAuditoriaEntity | null = isProg ? programOrAudit : null;
  const rawAudits: ReadonlyArray<ProgramacionAuditEntity> = isProg
    ? programOrAudit.auditorias
    : [programOrAudit];
  const activeAudits = rawAudits.filter((a) => !a.deleted_at);

  if (activeAudits.length === 0) {
    return 'Vínculo';
  }

  // 1. Execution / Closure / Review / Finalized states take precedence when active
  if (activeAudits.every(isAuditReviewed)) {
    return 'Finalizada';
  }
  if (activeAudits.every(isAuditClosed)) {
    return 'Revisión';
  }
  if (activeAudits.every(isAuditExecutedOrResultReady)) {
    return 'Resultado';
  }

  // 2. Step 1 (Vínculo)
  const missingCertLink = activeAudits.some((a) => !(a.id_certificado || '').trim());
  const missingVinculoOnLinked =
    program !== null &&
    (program.nivel_vinculacion !== 'INDIVIDUAL' || program.es_vinculada) &&
    !(program.id_vinculo || '').trim() &&
    activeAudits.every((a) => !(a.id_tipo_auditoria || '').trim());
  if (missingCertLink || missingVinculoOnLinked) {
    return 'Vínculo';
  }

  // 3. Step 3 (Designación → Tipo + Fecha)
  const step3Complete = activeAudits.every(
    (a) => Boolean((a.id_tipo_auditoria || '').trim()) && hasActiveDateForStep3(a)
  );
  if (!step3Complete) {
    return 'Tipo';
  }

  // 4. Step 4 (Designación → Sitio)
  const step4Complete = activeAudits.every(
    (a) => (a.sitiosPlan || []).filter((s) => !s.deleted_at).length > 0
  );
  if (!step4Complete) {
    return 'Sitio';
  }

  // 5. Step 5 (Designación → Temporal) when any audit or program flags temporal site
  const requiresTemporal =
    program?.tiene_sitio_temporal === true ||
    activeAudits.some((a) => a.tiene_sitio_temporal === true);
  const activeAuditIds = new Set(activeAudits.map((a) => a.id));
  const campaignTemporals = temporalSites.filter(
    (t) => !t.deleted_at && activeAuditIds.has(t.id_auditoria)
  );
  if (requiresTemporal) {
    if (
      campaignTemporals.length === 0 ||
      campaignTemporals.some((t) => !Number.isFinite(t.tiempo_auditoria) || t.tiempo_auditoria <= 0)
    ) {
      return 'Temporal';
    }
  }

  // 6. Step 6 (Tiempo): all active regular sites must have tiempo_auditoria > 0
  const allSitesHaveTime = activeAudits.every((a) => {
    const sites = (a.sitiosPlan || []).filter((s) => !s.deleted_at);
    return sites.length > 0 && sites.every((s) => (s.tiempo_auditoria || 0) > 0);
  });
  if (!allSitesHaveTime) {
    return 'Tiempo';
  }

  // 7. Step 7 (Asignación): all regular sites and active temporal sites strictly balanced
  const allRegularBalanced = activeAudits.every((a) => {
    const sites = (a.sitiosPlan || []).filter((s) => !s.deleted_at);
    return sites.every((s) => {
      const assigned = (s.equipoSitio || [])
        .filter((m) => !m.deleted_at)
        .reduce((sum, m) => sum + (m.tiempo_auditoria || 0), 0);
      return assigned > 0 && Math.abs(assigned - s.tiempo_auditoria) <= 0.001;
    });
  });
  const allTemporalBalanced =
    !requiresTemporal ||
    campaignTemporals.every((t) => {
      const assigned = (t.equipoTemporal || [])
        .filter((m) => !m.deleted_at)
        .reduce((sum, m) => sum + (m.tiempo_auditoria || 0), 0);
      return assigned > 0 && Math.abs(assigned - t.tiempo_auditoria) <= 0.001;
    });
  if (!allRegularBalanced || !allTemporalBalanced) {
    return 'Asignación';
  }

  // 8. Step 8 (Programa): all active sites have >=1 active process and every active process has >=1 active shift
  const allSitesHaveProgramAndShifts = activeAudits.every((a) => {
    const sites = (a.sitiosPlan || []).filter((s) => !s.deleted_at);
    return sites.every((s) => {
      const activeProcs = (s.procesos || []).filter((p) => !p.deleted_at);
      if (activeProcs.length === 0) return false;
      return activeProcs.every(
        (pr) => (pr.turnos || []).filter((t) => !t.deleted_at).length > 0
      );
    });
  });
  if (!allSitesHaveProgramAndShifts) {
    return 'Programa';
  }

  // 9. Steps 1–8 complete → ready for Step 9 (Resultado)
  return 'Resultado';
}

export type CalendarCountablePrecision =
  | 'REAL'
  | 'PROGRAMADA_EXACTA'
  | 'PREPROGRAMADA_MES'
  | 'SIN_FECHA';

export interface CalendarCountableEvent {
  precisionKey: CalendarCountablePrecision;
  startDate?: string | null;
  endDate?: string | null;
  estimatedYear?: number | null;
  estimatedMonth?: number | null;
}

export interface CalendarPeriodPrecisionBreakdown {
  total: number;
  real: number;
  programadaExacta: number;
  preprogramadaMes: number;
}

export interface CalendarPeriodCounts {
  year: number;
  yearTotals: CalendarPeriodPrecisionBreakdown;
  quarters: Record<1 | 2 | 3 | 4, CalendarPeriodPrecisionBreakdown>;
  months: Record<number, CalendarPeriodPrecisionBreakdown>;
  sinFechaCount: number;
}

function emptyBreakdown(): CalendarPeriodPrecisionBreakdown {
  return {
    total: 0,
    real: 0,
    programadaExacta: 0,
    preprogramadaMes: 0,
  };
}

function incrementBreakdown(
  target: CalendarPeriodPrecisionBreakdown,
  precision: Exclude<CalendarCountablePrecision, 'SIN_FECHA'>
): void {
  target.total += 1;
  if (precision === 'REAL') {
    target.real += 1;
  } else if (precision === 'PROGRAMADA_EXACTA') {
    target.programadaExacta += 1;
  } else {
    target.preprogramadaMes += 1;
  }
}

function isCountableEventObject(
  item: CalendarCountableEvent | ProgramaAuditoriaEntity | ProgramacionAuditEntity
): item is CalendarCountableEvent {
  return 'precisionKey' in item;
}

function resolveDateEntryForCountable(audit: ProgramacionAuditEntity): AuditDateEntry | null {
  const canonical = resolveLatestAuditDate(audit.fechas) ?? audit.latestDate ?? null;
  if (canonical && !canonical.deleted_at) return canonical;
  if (audit.fechas && audit.fechas.length > 0) return null;
  if (audit.fecha_inicio && /^\d{4}-\d{2}-\d{2}$/.test(audit.fecha_inicio.trim())) {
    const start = (audit.fecha_reprogramacion || audit.fecha_inicio).trim();
    const end =
      audit.fecha_fin &&
      /^\d{4}-\d{2}-\d{2}$/.test(audit.fecha_fin.trim()) &&
      audit.fecha_fin.trim() >= start
        ? audit.fecha_fin.trim()
        : start;
    return {
      id: `count-${audit.id}`,
      id_auditoria: audit.id,
      numero_secuencia: 1,
      tag: 'Programación',
      tipo_fecha: 'PROGRAMADA_EXACTA',
      anio: null,
      mes: null,
      fecha_inicio: start,
      fecha_fin: end,
      observacion: null,
      deleted_at: null,
    };
  }
  return null;
}

function toCountableEvent(
  item: CalendarCountableEvent | ProgramaAuditoriaEntity | ProgramacionAuditEntity
): CalendarCountableEvent {
  if (isCountableEventObject(item)) {
    return item;
  }

  const entries: AuditDateEntry[] = [];
  if (isProgramEntity(item)) {
    for (const a of item.auditorias) {
      if (a.deleted_at) continue;
      const e = resolveDateEntryForCountable(a);
      if (e) entries.push(e);
    }
  } else if (!item.deleted_at) {
    const e = resolveDateEntryForCountable(item);
    if (e) entries.push(e);
  }

  if (entries.length === 0) {
    return { precisionKey: 'SIN_FECHA' };
  }

  const realEntries = entries.filter((e) => e.tipo_fecha === 'REAL' && e.fecha_inicio);
  const pool = realEntries.length > 0 ? realEntries : entries;
  let chosen = pool[0];
  for (let i = 1; i < pool.length; i += 1) {
    if ((pool[i].numero_secuencia || 1) > (chosen.numero_secuencia || 1)) {
      chosen = pool[i];
    }
  }

  if (chosen.tipo_fecha === 'PREPROGRAMADA_MES') {
    return {
      precisionKey: 'PREPROGRAMADA_MES',
      estimatedYear: chosen.anio ?? null,
      estimatedMonth: chosen.mes ?? null,
    };
  }

  const start = chosen.fecha_inicio ? chosen.fecha_inicio.slice(0, 10) : null;
  const end =
    chosen.fecha_fin && start && chosen.fecha_fin >= start
      ? chosen.fecha_fin.slice(0, 10)
      : start;
  return {
    precisionKey: chosen.tipo_fecha === 'REAL' ? 'REAL' : 'PROGRAMADA_EXACTA',
    startDate: start,
    endDate: end,
  };
}

function monthBoundsIso(year: number, month: number): { startIso: string; endIso: string } {
  const mm = String(month).padStart(2, '0');
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    startIso: `${year}-${mm}-01`,
    endIso: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
}

/**
 * Computes exact calendar counts for `selectedYear`, quarters `Q1`..`Q4`, and months `1`..`12`,
 * separating `REAL`, `PROGRAMADA_EXACTA`, and `PREPROGRAMADA_MES` without double-counting
 * multi-day campaigns within the same month, quarter, or year.
 */
export function computeCalendarPeriodCounts(
  scopedEvents: ReadonlyArray<
    CalendarCountableEvent | ProgramaAuditoriaEntity | ProgramacionAuditEntity
  >,
  selectedYear: number
): CalendarPeriodCounts {
  const yearTotals = emptyBreakdown();
  const quarters: Record<1 | 2 | 3 | 4, CalendarPeriodPrecisionBreakdown> = {
    1: emptyBreakdown(),
    2: emptyBreakdown(),
    3: emptyBreakdown(),
    4: emptyBreakdown(),
  };
  const months: Record<number, CalendarPeriodPrecisionBreakdown> = {};
  for (let m = 1; m <= 12; m += 1) {
    months[m] = emptyBreakdown();
  }

  let sinFechaCount = 0;

  for (const raw of scopedEvents) {
    const ev = toCountableEvent(raw);
    if (ev.precisionKey === 'SIN_FECHA') {
      sinFechaCount += 1;
      continue;
    }

    const matchedMonths = new Set<number>();
    if (ev.precisionKey === 'PREPROGRAMADA_MES') {
      if (
        ev.estimatedYear === selectedYear &&
        ev.estimatedMonth !== null &&
        ev.estimatedMonth !== undefined &&
        ev.estimatedMonth >= 1 &&
        ev.estimatedMonth <= 12
      ) {
        matchedMonths.add(ev.estimatedMonth);
      }
    } else if (ev.startDate) {
      const start = ev.startDate.slice(0, 10);
      const end = ev.endDate && ev.endDate >= start ? ev.endDate.slice(0, 10) : start;
      for (let m = 1; m <= 12; m += 1) {
        const bounds = monthBoundsIso(selectedYear, m);
        if (start <= bounds.endIso && end >= bounds.startIso) {
          matchedMonths.add(m);
        }
      }
    } else {
      sinFechaCount += 1;
      continue;
    }

    if (matchedMonths.size === 0) continue;

    incrementBreakdown(yearTotals, ev.precisionKey);

    const matchedQuarters = new Set<1 | 2 | 3 | 4>();
    for (const m of matchedMonths) {
      incrementBreakdown(months[m], ev.precisionKey);
      const q = (Math.floor((m - 1) / 3) + 1) as 1 | 2 | 3 | 4;
      matchedQuarters.add(q);
    }
    for (const q of matchedQuarters) {
      incrementBreakdown(quarters[q], ev.precisionKey);
    }
  }

  return {
    year: selectedYear,
    yearTotals,
    quarters,
    months,
    sinFechaCount,
  };
}
