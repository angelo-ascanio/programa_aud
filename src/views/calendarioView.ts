import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/accessControl';
import type { AuditorDetailEntity } from '../lib/competencyMatrix';
import {
  formatIsoDateParts,
  getMethodologyVisualStyle,
  getModalityVisualStyle,
  getQuarterFromMonth,
  normalizeAuditText,
  normalizeCalendarDisplayMode,
  type CalendarioAlertCategoryFilter,
  type CalendarioAlertConfigDraft,
  type CalendarioViewState,
  type CalendarDisplayMode,
  type Phase5FindingEntity,
  type ProgramacionAuditEntity,
} from '../lib/auditExecution';
import {
  computeAuditStatusSummary,
  type AuditStatusSummaryResult,
} from '../lib/resumenDomain';
import {
  computeProgramPlanningStatus,
  formatAuditDateLabel,
  resolveLatestAuditDate,
  type AuditAlertItem,
  type AuditDateEntry,
  type AuditLinkLevel,
  type AuditLinkNature,
  type ProgramaAuditoriaEntity,
  type ProgramPlanningStatusResult,
} from '../lib/auditPlanningEngine';
import type { AuditoriaSitioTemporalEntity } from '../lib/designacionTemporalDomain';
import { resolveCertVersionSnapshotForAudit } from '../lib/certificadoVersionDomain';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import {
  PIPELINE_STAGE_ORDER,
  computeCalendarPeriodCounts,
  getPipelineStageBadgeMeta,
  resolveCurrentPipelineStage,
  type CalendarPeriodCounts,
  type PipelineStageBadgeMeta,
  type PipelineStageOneWord,
} from '../lib/pipelineEngine';
import {
  computeAuditAlerts,
  computeAuditCalendarSpanDays,
  DEFAULT_AUDIT_ALERT_CONFIG,
  detectAuditorScheduleConflicts,
  type AlertConfigEntity,
  type AuditAlertCategory,
} from '../lib/auditAlertsEngine';
import {
  computeReactiveFacetCounts,
  filterRecordsWithFacets,
  sortItems,
  type ColumnDefinition,
  type MultiViewFacetCategory,
  type MultiViewSelectionMap,
  type UniversalViewMode,
} from '../lib/universalTemplate';
import { renderUniversalTemplate } from './universalTemplate';
import {
  extractUniversalArchiveProps,
  type ArchiveMultiViewConfig,
} from '../lib/archiveGovernance';

export type { CalendarioViewState, CalendarDisplayMode };

export interface CalendarioViewProps {
  profile: UserProfile;
  state: CalendarioViewState;
  audits: ProgramacionAuditEntity[];
  auditors: AuditorDetailEntity[];
  standards: Array<{ norma: string }>;
  programs?: ProgramaAuditoriaEntity[];
  certificados?: ReadonlyArray<CertificadoDetailEntity>;
  temporalSites?: ReadonlyArray<AuditoriaSitioTemporalEntity>;
  findings?: ReadonlyArray<Phase5FindingEntity>;
  auditAlerts?: AuditAlertItem[];
  alertConfig?: AlertConfigEntity;
  tableColumnWidths?: Record<string, Record<string, number>>;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
}

type DatePrecisionKey = 'REAL' | 'PROGRAMADA_EXACTA' | 'PREPROGRAMADA_MES' | 'SIN_FECHA';

function isExactDatePrecision(key: DatePrecisionKey): boolean {
  return key === 'REAL' || key === 'PROGRAMADA_EXACTA';
}

interface CampaignCalendarEvent {
  program: ProgramaAuditoriaEntity;
  primaryAudit: ProgramacionAuditEntity | null;
  planningStatus: ProgramPlanningStatusResult;
  pipelineStage: PipelineStageOneWord;
  pipelineBadge: PipelineStageBadgeMeta;
  auditStatusSummary: AuditStatusSummaryResult;
  operationalTargetSubview: string;
  latestDate: AuditDateEntry | null;
  precisionKey: DatePrecisionKey;
  startDate: string | null; // YYYY-MM-DD when REAL or PROGRAMADA_EXACTA
  endDate: string | null; // YYYY-MM-DD when REAL or PROGRAMADA_EXACTA
  estimatedYear: number | null; // when PREPROGRAMADA_MES
  estimatedMonth: number | null; // 1..12 when PREPROGRAMADA_MES
  rescheduleSeq: number;
  isRescheduled: boolean;
  certCount: number;
  totalAuditDays: number;
  calendarSpanDays: number | null;
  codigoDisplay: string;
  unifiedSummary: string;
  auditorLiderId: string;
  auditorLiderName: string;
  auditorIds: string[];
  auditorNames: string[];
  orgNames: string[];
  orgAbrevLabels: string[];
  versionBadges: string[];
  alcanceSummaryTooltip: string;
  hasMissingAlcance: boolean;
  certNumbers: string[];
  normaCodes: string[];
  methodologies: string[];
  auditCodes: string[];
  alerts: AuditAlertItem[];
  hasAlert: boolean;
  hasConflict: boolean;
}

const MONTH_NAMES_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const WEEKDAYS_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const GRID_COLS_BY_DAYS: Record<number, string> = {
  28: 'grid-cols-[repeat(28,minmax(0,1fr))]',
  29: 'grid-cols-[repeat(29,minmax(0,1fr))]',
  30: 'grid-cols-[repeat(30,minmax(0,1fr))]',
  31: 'grid-cols-[repeat(31,minmax(0,1fr))]',
};

const COL_START_CLASSES: Record<number, string> = {
  1: 'col-start-1',
  2: 'col-start-2',
  3: 'col-start-3',
  4: 'col-start-4',
  5: 'col-start-5',
  6: 'col-start-6',
  7: 'col-start-7',
  8: 'col-start-8',
  9: 'col-start-9',
  10: 'col-start-10',
  11: 'col-start-11',
  12: 'col-start-12',
  13: 'col-start-13',
  14: 'col-start-14',
  15: 'col-start-15',
  16: 'col-start-16',
  17: 'col-start-17',
  18: 'col-start-18',
  19: 'col-start-19',
  20: 'col-start-20',
  21: 'col-start-21',
  22: 'col-start-22',
  23: 'col-start-23',
  24: 'col-start-24',
  25: 'col-start-25',
  26: 'col-start-26',
  27: 'col-start-27',
  28: 'col-start-28',
  29: 'col-start-29',
  30: 'col-start-30',
  31: 'col-start-31',
};

const COL_SPAN_CLASSES: Record<number, string> = {
  1: 'col-span-1',
  2: 'col-span-2',
  3: 'col-span-3',
  4: 'col-span-4',
  5: 'col-span-5',
  6: 'col-span-6',
  7: 'col-span-7',
  8: 'col-span-8',
  9: 'col-span-9',
  10: 'col-span-10',
  11: 'col-span-11',
  12: 'col-span-12',
  13: 'col-span-13',
  14: 'col-span-14',
  15: 'col-span-15',
  16: 'col-span-16',
  17: 'col-span-17',
  18: 'col-span-18',
  19: 'col-span-19',
  20: 'col-span-20',
  21: 'col-span-21',
  22: 'col-span-22',
  23: 'col-span-23',
  24: 'col-span-24',
  25: 'col-span-25',
  26: 'col-span-26',
  27: 'col-span-27',
  28: 'col-span-28',
  29: 'col-span-29',
  30: 'col-span-30',
  31: 'col-span-31',
};

function resolveEffectiveLatestDateForAudit(
  audit: ProgramacionAuditEntity
): AuditDateEntry | null {
  const canonical = resolveLatestAuditDate(audit.fechas) ?? audit.latestDate ?? null;
  if (canonical && !canonical.deleted_at) return canonical;

  if (audit.fechas && audit.fechas.length > 0) {
    return null;
  }

  if (audit.fecha_inicio && /^\d{4}-\d{2}-\d{2}$/.test(audit.fecha_inicio.trim())) {
    const start = audit.fecha_reprogramacion?.trim() || audit.fecha_inicio.trim();
    const end =
      audit.fecha_fin &&
      /^\d{4}-\d{2}-\d{2}$/.test(audit.fecha_fin.trim()) &&
      audit.fecha_fin.trim() >= start
        ? audit.fecha_fin.trim()
        : start;
    const statusLower = (audit.estatus || '').trim().toLowerCase();
    const isExecuted =
      audit.revisado === true ||
      statusLower === 'completado' ||
      statusLower === 'cerrado' ||
      statusLower === 'cerrada' ||
      statusLower === 'auditada' ||
      Boolean(audit.fecha_cierre_auditoria);
    return {
      id: `effective-date-${audit.id}`,
      id_auditoria: audit.id,
      numero_secuencia: audit.fecha_reprogramacion ? 2 : 1,
      tag: audit.fecha_reprogramacion ? 'Reprogramación' : 'Programación',
      tipo_fecha: isExecuted ? 'REAL' : 'PROGRAMADA_EXACTA',
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

function buildFallbackProgramsFromAudits(
  audits: ReadonlyArray<ProgramacionAuditEntity>
): ProgramaAuditoriaEntity[] {
  const byProgram = new Map<string, ProgramacionAuditEntity[]>();
  for (const audit of audits) {
    if (audit.deleted_at) continue;
    const progId = audit.id_programa_auditoria || `prog-${audit.id}`;
    const list = byProgram.get(progId) || [];
    list.push({
      ...audit,
      latestDate: audit.latestDate ?? resolveEffectiveLatestDateForAudit(audit),
    });
    byProgram.set(progId, list);
  }

  const result: ProgramaAuditoriaEntity[] = [];
  for (const [progId, groupAudits] of byProgram.entries()) {
    const first = groupAudits[0];
    const isLinked = groupAudits.length > 1;
    const distinctOrgs = new Set(
      groupAudits.map((a) => a.id_organizacion || a.organizacion_nombre)
    );
    const nivel: AuditLinkLevel = !isLinked
      ? 'INDIVIDUAL'
      : distinctOrgs.size > 1
      ? 'NIVEL_2_INTER_ORG'
      : 'NIVEL_1_INTRA_ORG';
    const tipo: AuditLinkNature = !isLinked
      ? 'Individual'
      : nivel === 'NIVEL_2_INTER_ORG'
      ? 'Multientidad'
      : 'Combinada';
    result.push({
      id: progId,
      codigo_programa: first?.codigo_auditoria || 'PROG-AUD',
      etiqueta: first
        ? `${first.organizacion_nombre} · ${first.numero_certificado}`
        : 'Programa de Auditoría',
      nivel_vinculacion: nivel,
      tipo_vinculacion: tipo,
      es_vinculada: isLinked,
      id_ciclo_origen: null,
      notas: null,
      auditorias: groupAudits,
      deleted_at: null,
    });
  }
  return result;
}

function resolveScopedPrograms(props: CalendarioViewProps): ProgramaAuditoriaEntity[] {
  const isStaff = isApprovedStaffProfile(props.profile);
  const rawPrograms =
    props.programs && props.programs.length > 0
      ? props.programs
      : buildFallbackProgramsFromAudits(props.audits);

  const allowedAuditIds = new Set(props.audits.map((a) => a.id));
  const allProgramAuditIds = new Set<string>();
  for (const p of rawPrograms) {
    for (const a of p.auditorias || []) {
      allProgramAuditIds.add(a.id);
    }
  }
  const hasMatchingScopedAudits =
    props.audits.length > 0 &&
    props.audits.some((a) => allProgramAuditIds.has(a.id));

  return rawPrograms
    .filter((p) => !p.deleted_at)
    .map((p) => {
      const filteredAudits = (p.auditorias || [])
        .filter((a) => !a.deleted_at)
        .filter((a) => {
          if (isStaff) return true;
          if (props.profile.role === 'CLIENT' && props.audits.length === 0) {
            return false;
          }
          if (hasMatchingScopedAudits) {
            return allowedAuditIds.has(a.id);
          }
          return true;
        })
        .map((a) => ({
          ...a,
          latestDate: a.latestDate ?? resolveEffectiveLatestDateForAudit(a),
        }));

      return {
        ...p,
        auditorias: filteredAudits,
      };
    })
    .filter((p) => p.auditorias.length > 0);
}

function resolveProgramLatestDateAndSeq(program: ProgramaAuditoriaEntity): {
  latestDate: AuditDateEntry | null;
  maxSeq: number;
} {
  const entries: AuditDateEntry[] = [];
  for (const audit of program.auditorias) {
    const entry = resolveEffectiveLatestDateForAudit(audit);
    if (entry && !entry.deleted_at) {
      entries.push(entry);
    }
  }
  if (entries.length === 0) {
    return { latestDate: null, maxSeq: 0 };
  }

  const realEntries = entries.filter((e) => e.tipo_fecha === 'REAL' && e.fecha_inicio);
  const chosenPool = realEntries.length > 0 ? realEntries : entries;
  let chosen = chosenPool[0];
  let maxSeq = chosen.numero_secuencia || 1;

  for (const candidate of chosenPool) {
    const seq = candidate.numero_secuencia || 1;
    if (seq > maxSeq) {
      maxSeq = seq;
      chosen = candidate;
    } else if (
      seq === maxSeq &&
      candidate.fecha_inicio &&
      (!chosen.fecha_inicio || candidate.fecha_inicio < chosen.fecha_inicio)
    ) {
      chosen = candidate;
    }
  }

  return { latestDate: chosen, maxSeq };
}

function getProgramLinkingBadgeMeta(
  nivel: AuditLinkLevel,
  tipo: AuditLinkNature
): { label: string; className: string } {
  if (nivel === 'NIVEL_2_INTER_ORG') {
    return {
      label: `Nivel 2 · ${tipo}`,
      className: 'bg-violet-50 text-violet-800 border-violet-200',
    };
  }
  if (nivel === 'NIVEL_1_INTRA_ORG') {
    return {
      label: `Nivel 1 · ${tipo}`,
      className: 'bg-sky-50 text-sky-800 border-sky-200',
    };
  }
  return {
    label: 'Individual',
    className: 'bg-slate-100 text-slate-700 border-slate-200',
  };
}

function formatShortDmy(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return isoDate;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function buildCampaignCalendarEvents(
  programs: ReadonlyArray<ProgramaAuditoriaEntity>,
  visibleAlerts: ReadonlyArray<AuditAlertItem>,
  temporalSites: ReadonlyArray<AuditoriaSitioTemporalEntity> = [],
  findings: ReadonlyArray<Phase5FindingEntity> = [],
  certificados: ReadonlyArray<CertificadoDetailEntity> = []
): CampaignCalendarEvent[] {
  const conflicts = detectAuditorScheduleConflicts(programs);
  const conflictProgramIds = new Set<string>();
  for (const c of conflicts) {
    conflictProgramIds.add(c.program_a_id);
    conflictProgramIds.add(c.program_b_id);
  }

  const alertsByProgram = new Map<string, AuditAlertItem[]>();
  for (const alert of visibleAlerts) {
    if (!alert.programId) continue;
    const list = alertsByProgram.get(alert.programId) || [];
    list.push(alert);
    alertsByProgram.set(alert.programId, list);
  }

  return programs.map((program) => {
    const activeAudits = program.auditorias.filter((a) => !a.deleted_at);
    const primaryAudit = activeAudits[0] || null;
    const planningStatus = computeProgramPlanningStatus(program);
    const pipelineStage = resolveCurrentPipelineStage(program, temporalSites);
    const pipelineBadge = getPipelineStageBadgeMeta(pipelineStage);
    const auditStatusSummary = computeAuditStatusSummary({
      audit: primaryAudit,
      program,
      allAudits: activeAudits,
      programs,
      temporalSites,
      findings,
      detailedCerts: certificados,
    });
    const operationalTargetSubview =
      pipelineStage === 'Relación'
        ? 'relacion'
        : pipelineStage === 'Finalizada'
        ? 'resumen'
        : pipelineStage === 'Tipo' &&
          auditStatusSummary.cards.find((c) => c.key === 'designacion/tipo')?.status ===
            'COMPLETO' &&
          auditStatusSummary.cards.find((c) => c.key === 'designacion/fecha')?.status !==
            'COMPLETO'
        ? 'designacion/fecha'
        : auditStatusSummary.recommendedNextActions[0]?.key || pipelineBadge.targetSubview;
    const { latestDate, maxSeq } = resolveProgramLatestDateAndSeq(program);

    const precisionKey: DatePrecisionKey = !latestDate
      ? 'SIN_FECHA'
      : latestDate.tipo_fecha === 'REAL' && latestDate.fecha_inicio
      ? 'REAL'
      : latestDate.tipo_fecha === 'PROGRAMADA_EXACTA' && latestDate.fecha_inicio
      ? 'PROGRAMADA_EXACTA'
      : latestDate.tipo_fecha === 'PREPROGRAMADA_MES'
      ? 'PREPROGRAMADA_MES'
      : 'SIN_FECHA';

    const exactDates = isExactDatePrecision(precisionKey);
    const startDate =
      exactDates && latestDate?.fecha_inicio
        ? latestDate.fecha_inicio.slice(0, 10)
        : null;
    const endDate = exactDates
      ? latestDate?.fecha_fin && startDate && latestDate.fecha_fin >= startDate
        ? latestDate.fecha_fin.slice(0, 10)
        : startDate
      : null;

    const estimatedYear =
      precisionKey === 'PREPROGRAMADA_MES' ? latestDate?.anio ?? null : null;
    const estimatedMonth =
      precisionKey === 'PREPROGRAMADA_MES' ? latestDate?.mes ?? null : null;

    const rescheduleSeq = Math.max(1, maxSeq);
    const isRescheduled =
      Boolean(latestDate) &&
      (latestDate?.tag === 'Reprogramación' || rescheduleSeq > 1);

    const certCount = activeAudits.length;
    const rawPlannedDays = activeAudits.reduce(
      (sum, a) => sum + (a.tiempo_auditoria ?? a.dias_auditor ?? 0),
      0
    );
    const totalAuditDays =
      planningStatus.totalPlannedDays > 0
        ? planningStatus.totalPlannedDays
        : rawPlannedDays;
    const calendarSpanDays = exactDates ? computeAuditCalendarSpanDays(latestDate) : null;

    const certWord = certCount === 1 ? '1 cert' : `${certCount} certs`;
    const spanPart = calendarSpanDays !== null ? ` / ${calendarSpanDays}d cal.` : '';
    const unifiedSummary = `${program.etiqueta} · ${program.tipo_vinculacion} · ${certWord} · ${totalAuditDays.toFixed(2)}d-aud${spanPart}`;

    const auditorIdsSet = new Set<string>();
    const auditorNamesSet = new Set<string>();
    for (const a of activeAudits) {
      if (a.auditor_lider_id) auditorIdsSet.add(a.auditor_lider_id);
      if (a.auditor_lider) auditorNamesSet.add(a.auditor_lider);
      for (const m of a.equipo || []) {
        if (m.id_auditor) auditorIdsSet.add(m.id_auditor);
        if (m.nombre) auditorNamesSet.add(m.nombre);
      }
      for (const s of a.sitiosPlan || []) {
        if (s.deleted_at) continue;
        for (const sm of s.equipoSitio || []) {
          if (!sm.deleted_at && sm.id_auditor) auditorIdsSet.add(sm.id_auditor);
          if (!sm.deleted_at && sm.auditor_nombre) auditorNamesSet.add(sm.auditor_nombre);
        }
        for (const pr of s.procesos || []) {
          if (pr.deleted_at) continue;
          for (const pm of pr.equipoProceso || []) {
            if (!pm.deleted_at && pm.id_auditor) auditorIdsSet.add(pm.id_auditor);
            if (!pm.deleted_at && pm.auditor_nombre) auditorNamesSet.add(pm.auditor_nombre);
          }
        }
      }
    }

    const orgNames = Array.from(
      new Set(activeAudits.map((a) => a.organizacion_nombre).filter(Boolean))
    );
    const certNumbers = Array.from(
      new Set(activeAudits.map((a) => a.numero_certificado).filter(Boolean))
    );
    const normaCodes = Array.from(
      new Set(activeAudits.map((a) => a.norma_codigo).filter(Boolean))
    );
    const methodologies = Array.from(
      new Set(activeAudits.map((a) => a.metodologia).filter(Boolean))
    );
    const auditCodes = Array.from(
      new Set(activeAudits.map((a) => a.codigo_auditoria).filter(Boolean))
    );

    const snapshots = activeAudits.map((a) =>
      certificados.length > 0 ? resolveCertVersionSnapshotForAudit(a, certificados) : null
    );
    const orgAbrevSet = new Set<string>();
    const versionBadgeSet = new Set<string>();
    const alcanceLines: string[] = [];
    let hasMissingAlcance = false;

    activeAudits.forEach((a, idx) => {
      const snap = snapshots[idx];
      const abrev = snap?.organizacionAbreviacion ?? a.organizacion_abreviacion ?? null;
      if (abrev && abrev.trim()) orgAbrevSet.add(abrev.trim());
      const verNum =
        typeof a.version_numero === 'number' && a.version_numero >= 1
          ? Math.floor(a.version_numero)
          : snap?.versionNumero ?? null;
      if (verNum) versionBadgeSet.add(`v${verNum}`);
      if (snap) {
        if (!snap.hasAlcance) {
          hasMissingAlcance = true;
        } else if (snap.alcance_es) {
          alcanceLines.push(`${a.numero_certificado} (v${snap.versionNumero}): ${snap.alcance_es}`);
        }
      }
    });

    const orgAbrevLabels = Array.from(orgAbrevSet);
    const versionBadges = Array.from(versionBadgeSet);
    const alcanceSummaryTooltip =
      alcanceLines.length > 0
        ? alcanceLines.join('\n')
        : hasMissingAlcance
        ? 'Sin Alcance activo registrado en Certificación → Certificado → Alcance.'
        : `${program.etiqueta} · ${certNumbers.join(', ')}`;

    const programAlerts = alertsByProgram.get(program.id) || [];
    const hasConflict =
      conflictProgramIds.has(program.id) ||
      programAlerts.some((a) => a.category === 'CONFLICTO_AUDITOR');

    const codigoDisplay =
      program.codigo_programa?.trim() || auditCodes[0] || 'PROG-AUD';

    return {
      program,
      primaryAudit,
      planningStatus,
      pipelineStage,
      pipelineBadge,
      auditStatusSummary,
      operationalTargetSubview,
      latestDate,
      precisionKey,
      startDate,
      endDate,
      estimatedYear,
      estimatedMonth,
      rescheduleSeq,
      isRescheduled,
      certCount,
      totalAuditDays,
      calendarSpanDays,
      codigoDisplay,
      unifiedSummary,
      auditorLiderId: primaryAudit?.auditor_lider_id || '',
      auditorLiderName: primaryAudit?.auditor_lider || 'Sin auditor líder asignado',
      auditorIds: Array.from(auditorIdsSet),
      auditorNames: Array.from(auditorNamesSet),
      orgNames,
      orgAbrevLabels,
      versionBadges,
      alcanceSummaryTooltip,
      hasMissingAlcance,
      certNumbers,
      normaCodes,
      methodologies,
      auditCodes,
      alerts: programAlerts,
      hasAlert: programAlerts.length > 0,
      hasConflict,
    };
  });
}

function buildCalendarMonthDayCells(
  year: number,
  month: number,
  exactEvents: ReadonlyArray<CampaignCalendarEvent>
): Array<{
  date: string;
  dayOfMonth: number;
  inCurrentMonth: boolean;
  isWeekend: boolean;
  events: CampaignCalendarEvent[];
}> {
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startWeekday = (firstOfMonth.getUTCDay() + 6) % 7;
  const totalCells = startWeekday + daysInMonth > 35 ? 42 : 35;

  const firstDayNum = Math.floor(Date.UTC(year, month - 1, 1) / 86400000);
  const cells: Array<{
    date: string;
    dayOfMonth: number;
    inCurrentMonth: boolean;
    isWeekend: boolean;
    events: CampaignCalendarEvent[];
  }> = [];

  for (let i = 0; i < totalCells; i++) {
    const cellDayNum = firstDayNum + (i - startWeekday);
    const dt = new Date(cellDayNum * 86400000);
    const isoDate = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(
      dt.getUTCDate()
    ).padStart(2, '0')}`;
    const weekday = dt.getUTCDay();

    const dayEvents = exactEvents.filter(
      (ev) =>
        isExactDatePrecision(ev.precisionKey) &&
        ev.startDate &&
        isoDate >= ev.startDate &&
        isoDate <= (ev.endDate || ev.startDate)
    );

    cells.push({
      date: isoDate,
      dayOfMonth: dt.getUTCDate(),
      inCurrentMonth: dt.getUTCMonth() + 1 === month,
      isWeekend: weekday === 0 || weekday === 6,
      events: dayEvents,
    });
  }

  return cells;
}

function resolveAlertCategoryLabel(category: AuditAlertCategory): string {
  switch (category) {
    case 'ATRASADA':
      return 'Atrasada';
    case 'PROXIMA':
      return 'Próxima';
    case 'PREPROGRAMADA_SIN_CONFIRMAR':
      return 'Pre-programada';
    case 'CONFLICTO_AUDITOR':
      return 'Conflicto';
    case 'DESFASE_DIAS_SPAN':
      return 'Desfase Días/Span';
  }
}

function getAlertToneClasses(severity: AuditAlertItem['severity']): {
  badge: string;
  row: string;
} {
  if (severity === 'rose') {
    return {
      badge: 'bg-rose-100 text-rose-800 border-rose-200',
      row: 'border-rose-200 bg-rose-50/60 hover:bg-rose-50',
    };
  }
  if (severity === 'amber') {
    return {
      badge: 'bg-amber-100 text-amber-900 border-amber-200',
      row: 'border-amber-200 bg-amber-50/60 hover:bg-amber-50',
    };
  }
  return {
    badge: 'bg-sky-100 text-sky-900 border-sky-200',
    row: 'border-sky-200 bg-sky-50/60 hover:bg-sky-50',
  };
}

function renderSmartAlertsPanel(params: {
  alerts: ReadonlyArray<AuditAlertItem>;
  alertConfig: AlertConfigEntity;
  alertsPanelOpen: boolean;
  categoryFilter: CalendarioAlertCategoryFilter;
}): string {
  const { alerts, alertConfig, alertsPanelOpen, categoryFilter } = params;

  const countsByCategory: Record<AuditAlertCategory, number> = {
    ATRASADA: 0,
    PROXIMA: 0,
    PREPROGRAMADA_SIN_CONFIRMAR: 0,
    CONFLICTO_AUDITOR: 0,
    DESFASE_DIAS_SPAN: 0,
  };
  for (const al of alerts) {
    countsByCategory[al.category] += 1;
  }

  const filteredAlerts =
    categoryFilter === 'ALL'
      ? alerts
      : alerts.filter((a) => a.category === categoryFilter);

  const filterChips: Array<{ id: CalendarioAlertCategoryFilter; label: string; count: number }> = [
    { id: 'ALL', label: 'Todas', count: alerts.length },
    { id: 'ATRASADA', label: 'Atrasadas', count: countsByCategory.ATRASADA },
    { id: 'PROXIMA', label: 'Próximas', count: countsByCategory.PROXIMA },
    {
      id: 'PREPROGRAMADA_SIN_CONFIRMAR',
      label: 'Pre-programadas sin confirmar',
      count: countsByCategory.PREPROGRAMADA_SIN_CONFIRMAR,
    },
    { id: 'CONFLICTO_AUDITOR', label: 'Conflictos de Auditor', count: countsByCategory.CONFLICTO_AUDITOR },
    { id: 'DESFASE_DIAS_SPAN', label: 'Desfases de Días/Span', count: countsByCategory.DESFASE_DIAS_SPAN },
  ];

  const toneBorder = !alertConfig.alertas_activas
    ? 'border-slate-200 bg-slate-50/70'
    : alerts.some((a) => a.severity === 'rose')
    ? 'border-rose-200 bg-rose-50/40'
    : alerts.length > 0
    ? 'border-amber-200 bg-amber-50/40'
    : 'border-emerald-200 bg-emerald-50/40';

  return `
    <div
      id="calSmartAlertsPanel"
      class="rounded-xl border ${toneBorder} overflow-hidden transition-colors"
    >
      <div class="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <div class="flex flex-wrap items-center gap-2 min-w-0">
          <span class="text-sm select-none" aria-hidden="true">${
            !alertConfig.alertas_activas ? '🔕' : alerts.length > 0 ? '🔔' : '✅'
          }</span>
          <span class="text-xs font-bold text-slate-900">
            Alertas Inteligentes de Planificación
          </span>
          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums border ${
            !alertConfig.alertas_activas
              ? 'bg-slate-200 text-slate-700 border-slate-300'
              : alerts.length > 0
              ? 'bg-white text-slate-900 border-slate-200'
              : 'bg-emerald-100 text-emerald-800 border-emerald-200'
          }">
            ${!alertConfig.alertas_activas ? 'Desactivadas' : `${alerts.length} activa(s)`}
          </span>
          <span class="hidden sm:inline text-[11px] text-slate-500 tabular-nums">
            Ventana próxima: ${alertConfig.dias_aviso_proxima}d · Pre-prog.: ${alertConfig.dias_aviso_preprogramada_sin_confirmar}d
          </span>
        </div>

        <button
          type="button"
          data-action="toggle-cal-alerts-panel"
          aria-expanded="${alertsPanelOpen ? 'true' : 'false'}"
          aria-controls="calSmartAlertsBody"
          class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 cursor-pointer transition-colors"
        >
          <span>${alertsPanelOpen ? 'Ocultar bandeja' : 'Ver bandeja'}</span>
          <span aria-hidden="true">${alertsPanelOpen ? '▴' : '▾'}</span>
        </button>
      </div>

      ${
        alertsPanelOpen
          ? `
            <div id="calSmartAlertsBody" class="px-4 pb-3 pt-2 border-t border-slate-200/70 space-y-2.5 bg-white/75">
              ${
                !alertConfig.alertas_activas
                  ? `<p class="text-xs text-slate-500">Las alertas automáticas están desactivadas en la configuración actual.</p>`
                  : `
                    <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar alertas por categoría">
                      ${filterChips
                        .map((chip) => {
                          const isSelected = categoryFilter === chip.id;
                          return `
                            <button
                              type="button"
                              data-cal-alert-category="${chip.id}"
                              aria-pressed="${isSelected ? 'true' : 'false'}"
                              class="px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                                isSelected
                                  ? 'bg-slate-900 text-white border-slate-900'
                                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                              }"
                            >
                              <span>${escapeHtml(chip.label)}</span>
                              <span class="px-1.5 py-0.2 rounded-full text-[10px] font-bold tabular-nums ${
                                isSelected
                                  ? 'bg-white/20 text-white'
                                  : 'bg-slate-100 text-slate-600'
                              }">${chip.count}</span>
                            </button>
                          `;
                        })
                        .join('')}
                    </div>

                    ${
                      filteredAlerts.length === 0
                        ? `
                          <div class="text-xs text-slate-500 py-2">
                            ${
                              alerts.length === 0
                                ? 'No hay desviaciones ni alertas operativas activas con los umbrales configurados.'
                                : 'No hay alertas activas en esta categoría.'
                            }
                          </div>
                        `
                        : `
                          <div class="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-0.5">
                            ${filteredAlerts
                              .map((al) => {
                                const tone = getAlertToneClasses(al.severity);
                                const targetProgramId = al.programId || '';
                                const targetAuditId = al.auditId || '';
                                return `
                                  <button
                                    type="button"
                                    data-action="select-cal-program"
                                    data-program-id="${escapeHtml(targetProgramId)}"
                                    ${targetAuditId ? `data-audit-id="${escapeHtml(targetAuditId)}"` : ''}
                                    class="w-full text-left p-2.5 rounded-lg border transition-colors cursor-pointer flex items-start justify-between gap-2 ${tone.row}"
                                  >
                                    <div class="min-w-0 space-y-0.5">
                                      <div class="flex flex-wrap items-center gap-1.5">
                                        <span class="px-1.5 py-0.5 rounded text-[10px] font-bold border ${tone.badge}">
                                          ${escapeHtml(resolveAlertCategoryLabel(al.category))}
                                        </span>
                                        <span class="text-xs font-bold text-slate-900 truncate">
                                          ${escapeHtml(al.title)}
                                        </span>
                                      </div>
                                      <p class="text-[11px] text-slate-600 leading-snug line-clamp-2">
                                        ${escapeHtml(al.message)}
                                      </p>
                                    </div>
                                    <span class="text-[11px] font-semibold text-indigo-700 shrink-0 mt-0.5">Abrir →</span>
                                  </button>
                                `;
                              })
                              .join('')}
                          </div>
                        `
                    }
                  `
              }
            </div>
          `
          : ''
      }
    </div>
  `;
}

export function renderCalendarioView(props: CalendarioViewProps): string {
  const {
    profile,
    state,
    auditors,
    standards,
    alertConfig = DEFAULT_AUDIT_ALERT_CONFIG,
    tableColumnWidths,
    loading = false,
    archiveConfig,
  } = props;

  const canConfigureAlerts = isApprovedStaffProfile(profile);
  const resolvedPrograms = resolveScopedPrograms(props);
  const visibleProgramIds = new Set(resolvedPrograms.map((p) => p.id));
  const visibleAuditIds = new Set(
    resolvedPrograms.flatMap((p) => p.auditorias.map((a) => a.id))
  );

  const rawAlerts =
    props.auditAlerts !== undefined
      ? props.auditAlerts
      : computeAuditAlerts(resolvedPrograms, alertConfig);

  const visibleAlerts = rawAlerts.filter((al) => {
    if (al.programId && !visibleProgramIds.has(al.programId)) return false;
    if (!canConfigureAlerts && al.auditId && !visibleAuditIds.has(al.auditId)) {
      return false;
    }
    return true;
  });

  const allCampaignEvents = buildCampaignCalendarEvents(
    resolvedPrograms,
    visibleAlerts,
    props.temporalSites ?? [],
    props.findings ?? [],
    props.certificados ?? []
  );

  const facetCategories: MultiViewFacetCategory<CampaignCalendarEvent>[] = [
    {
      id: 'estatus_auditoria',
      label: 'Estatus Auditoría',
      extractValues: (ev) => ev.auditStatusSummary.estatus_auditoria,
    },
    {
      id: 'etapa_pipeline',
      label: 'Etapa del Pipeline',
      options: PIPELINE_STAGE_ORDER.map((stage) => ({
        value: stage,
        label: stage,
      })),
      extractValues: (ev) => ev.pipelineStage,
    },
    {
      id: 'nivel_vinculacion',
      label: 'Nivel de Vinculación',
      options: [
        { value: 'INDIVIDUAL', label: 'Individual' },
        { value: 'NIVEL_1_INTRA_ORG', label: 'Nivel 1 (Intra-Org)' },
        { value: 'NIVEL_2_INTER_ORG', label: 'Nivel 2 (Inter-Org)' },
      ],
      extractValues: (ev) => ev.program.nivel_vinculacion,
    },
    {
      id: 'tipo_vinculacion',
      label: 'Naturaleza',
      extractValues: (ev) => ev.program.tipo_vinculacion,
    },
    {
      id: 'precision_fecha',
      label: 'Precisión de Fecha',
      options: [
        { value: 'REAL', label: 'Fecha Real' },
        { value: 'PROGRAMADA_EXACTA', label: 'Programada Exacta' },
        { value: 'PREPROGRAMADA_MES', label: 'Pre-programada Mes/Año' },
        { value: 'SIN_FECHA', label: 'Sin Fecha' },
      ],
      extractValues: (ev) => ev.precisionKey,
    },
    {
      id: 'tag_planificacion',
      label: 'Estado de Planificación',
      extractValues: (ev) => ev.planningStatus.primaryTag,
    },
    {
      id: 'alerta_activa',
      label: 'Alertas Activas',
      options: [
        { value: 'CON_ALERTA', label: 'Con Alerta Activa' },
        { value: 'SIN_ALERTA', label: 'Sin Alertas' },
      ],
      extractValues: (ev) => (ev.hasAlert ? 'CON_ALERTA' : 'SIN_ALERTA'),
    },
  ];

  const query = state.query ?? '';
  const effectiveSelections: MultiViewSelectionMap = state.facetSelections || {};
  const searchOptions = {
    getSearchableText: (ev: CampaignCalendarEvent) =>
      [
        ev.codigoDisplay,
        ev.program.etiqueta,
        ev.unifiedSummary,
        ev.auditStatusSummary.estatus_auditoria,
        ev.pipelineStage,
        ev.program.nivel_vinculacion,
        ev.program.tipo_vinculacion,
        ev.planningStatus.primaryTag,
        ...ev.orgNames,
        ...ev.orgAbrevLabels,
        ...ev.versionBadges,
        ev.alcanceSummaryTooltip,
        ...ev.certNumbers,
        ...ev.normaCodes,
        ...ev.auditorNames,
        ...ev.auditCodes,
      ].join(' '),
  };

  let filteredEvents = filterRecordsWithFacets(
    allCampaignEvents,
    query,
    facetCategories,
    effectiveSelections,
    searchOptions
  );

  // Synchronize quick dropdown filters (auditor / standard / methodology) across all 3 modes
  if (state.filterAuditorId && state.filterAuditorId !== 'ALL') {
    const target = normalizeAuditText(state.filterAuditorId);
    filteredEvents = filteredEvents.filter(
      (ev) =>
        ev.auditorIds.includes(state.filterAuditorId) ||
        ev.auditorNames.some((n) => normalizeAuditText(n).includes(target))
    );
  }
  if (state.filterStandard && state.filterStandard !== 'ALL') {
    const target = normalizeAuditText(state.filterStandard);
    filteredEvents = filteredEvents.filter((ev) =>
      ev.normaCodes.some((n) => normalizeAuditText(n).includes(target))
    );
  }
  if (state.filterMethodology && state.filterMethodology !== 'ALL') {
    const target = normalizeAuditText(state.filterMethodology);
    filteredEvents = filteredEvents.filter((ev) =>
      ev.methodologies.some((m) => normalizeAuditText(m) === target)
    );
  }

  const sortedEvents = sortItems(
    filteredEvents,
    state.sortColumn ?? null,
    state.sortDirection ?? 'none',
    (ev, col) => {
      switch (col) {
        case 'programa':
          return `${ev.codigoDisplay} ${ev.program.etiqueta}`;
        case 'vinculacion':
          return `${ev.program.nivel_vinculacion} ${ev.program.tipo_vinculacion}`;
        case 'certificados_org':
          return `${ev.orgNames.join(' ')} ${ev.certNumbers.join(' ')}`;
        case 'fecha_vigente':
          return (
            ev.startDate ||
            (ev.estimatedYear && ev.estimatedMonth
              ? `${ev.estimatedYear}-${String(ev.estimatedMonth).padStart(2, '0')}`
              : '9999-99-99')
          );
        case 'precision_duracion':
          return ev.totalAuditDays;
        case 'estado_alerta':
          return `${ev.alerts.length > 0 ? '0' : '1'} ${ev.planningStatus.primaryTag}`;
        default:
          return '';
      }
    }
  );

  const facetGroups = computeReactiveFacetCounts(
    allCampaignEvents,
    query,
    facetCategories,
    effectiveSelections,
    searchOptions
  );

  const viewMode: UniversalViewMode = state.viewMode ?? 'calendar';
  const uniqueStandards = Array.from(
    new Set([
      ...standards.map((s) => s.norma),
      ...allCampaignEvents.flatMap((ev) => ev.normaCodes),
    ])
  )
    .filter(Boolean)
    .sort();

  const actionsHtml = canConfigureAlerts
    ? `
      <button
        type="button"
        id="openAlertConfigModalBtn"
        data-action="open-alert-config-modal"
        class="h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold shadow-2xs transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap"
      >
        <span aria-hidden="true">⚙</span>
        <span>Configurar Alertas</span>
      </button>
    `
    : '';

  const topBannerHtml = renderSmartAlertsPanel({
    alerts: visibleAlerts,
    alertConfig,
    alertsPanelOpen: state.alertsPanelOpen ?? true,
    categoryFilter: state.alertCategoryFilter ?? 'ALL',
  });

  const customCalendarViewHtml = renderCalendarCanvas({
    state,
    events: sortedEvents,
    auditors,
    uniqueStandards,
  });

  // Strict 6-column table-fixed colgroup (17 + 12 + 20 + 17 + 15 + 19 = 100%) and 0 <button> in <tbody>
  const columns: ColumnDefinition<CampaignCalendarEvent>[] = [
    {
      id: 'programa',
      header: 'Programa / Campaña',
      sortable: true,
      defaultWidthPct: 17,
      minWidthPx: 140,
      renderCell: (ev) => `
        <div class="min-w-0">
          <div class="font-mono font-bold text-indigo-700 truncate" title="${escapeHtml(ev.codigoDisplay)}">
            ${escapeHtml(ev.codigoDisplay)}
          </div>
          <div class="text-[11px] font-semibold text-slate-900 truncate" title="${escapeHtml(ev.program.etiqueta)}">
            ${escapeHtml(ev.program.etiqueta)}
          </div>
        </div>
      `,
    },
    {
      id: 'vinculacion',
      header: 'Vinculación',
      sortable: true,
      defaultWidthPct: 12,
      minWidthPx: 110,
      renderCell: (ev) => {
        const badge = getProgramLinkingBadgeMeta(
          ev.program.nivel_vinculacion,
          ev.program.tipo_vinculacion
        );
        return `
          <div class="min-w-0 space-y-0.5">
            <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border truncate max-w-full ${badge.className}">
              ${escapeHtml(badge.label)}
            </span>
            <div class="text-[10px] text-slate-500 tabular-nums truncate">
              ${ev.certCount} ${ev.certCount === 1 ? 'certificado' : 'certificados'}
            </div>
          </div>
        `;
      },
    },
    {
      id: 'certificados_org',
      header: 'Organizaciones y Certificados',
      sortable: true,
      defaultWidthPct: 20,
      minWidthPx: 155,
      renderCell: (ev) => {
        const orgText = ev.orgNames.join(' · ') || 'Sin organización';
        const certText = ev.certNumbers.join(', ') || 'Sin certificado';
        const normasText = ev.normaCodes.join(', ');
        const verChips = ev.versionBadges
          .map(
            (v) =>
              `<span class="px-1 py-0.2 rounded text-[9px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-300 shrink-0">${escapeHtml(v)}</span>`
          )
          .join('');
        const abrevChips = ev.orgAbrevLabels
          .map(
            (ab) =>
              `<span class="px-1 py-0.2 rounded text-[9px] font-bold bg-white text-slate-700 border border-slate-200 shrink-0">${escapeHtml(ab)}</span>`
          )
          .join('');
        const missingAlcanceChip = ev.hasMissingAlcance
          ? `<span class="px-1 py-0.2 rounded text-[9px] font-bold bg-rose-50 text-rose-800 border border-rose-200 shrink-0">Sin alcance</span>`
          : '';
        return `
          <div class="min-w-0 space-y-0.5" title="${escapeHtml(ev.alcanceSummaryTooltip)}">
            <div class="flex items-center gap-1 min-w-0">
              <span class="font-bold text-slate-900 truncate">${escapeHtml(orgText)}</span>
              ${abrevChips}
              ${verChips}
              ${missingAlcanceChip}
            </div>
            <div class="text-[11px] font-mono text-slate-500 truncate">
              ${escapeHtml(certText)}${normasText ? ` · <span class="font-sans font-semibold text-slate-600">${escapeHtml(normasText)}</span>` : ''}
            </div>
          </div>
        `;
      },
    },
    {
      id: 'fecha_vigente',
      header: 'Fecha Vigente',
      sortable: true,
      defaultWidthPct: 17,
      minWidthPx: 135,
      renderCell: (ev) => {
        const datePrimary =
          isExactDatePrecision(ev.precisionKey) && ev.startDate
            ? ev.endDate && ev.endDate !== ev.startDate
              ? `${formatShortDmy(ev.startDate)} → ${formatShortDmy(ev.endDate)}`
              : formatShortDmy(ev.startDate)
            : ev.precisionKey === 'PREPROGRAMADA_MES' && ev.latestDate
            ? `${formatAuditDateLabel(ev.latestDate).split('·')[0]?.trim() || 'Mes/Año'} · Mes estimado`
            : 'Pendiente de fecha';
        const subText =
          ev.precisionKey === 'PREPROGRAMADA_MES'
            ? 'Sin días exactos'
            : ev.isRescheduled
            ? `Reprog. #${ev.rescheduleSeq}`
            : ev.latestDate
            ? 'Programación inicial'
            : 'Sin entrada 1:N';
        return `
          <div class="min-w-0">
            <div class="font-mono font-semibold text-slate-900 text-[11px] tabular-nums truncate" title="${escapeHtml(datePrimary)}">
              ${escapeHtml(datePrimary)}
            </div>
            <div class="text-[10px] ${
              ev.isRescheduled
                ? 'font-bold text-indigo-700'
                : ev.precisionKey === 'PREPROGRAMADA_MES'
                ? 'font-semibold text-amber-700'
                : 'text-slate-500'
            } truncate">
              ${escapeHtml(subText)}
            </div>
          </div>
        `;
      },
    },
    {
      id: 'precision_duracion',
      header: 'Días / Precisión',
      sortable: true,
      defaultWidthPct: 15,
      minWidthPx: 120,
      renderCell: (ev) => {
        const durationLine = `${ev.totalAuditDays.toFixed(2)}d-aud${
          ev.calendarSpanDays !== null ? ` / ${ev.calendarSpanDays}d cal.` : ''
        }`;
        const precBadge =
          ev.precisionKey === 'REAL'
            ? '<span class="text-[10px] font-bold text-emerald-700">Fecha Real</span>'
            : ev.precisionKey === 'PROGRAMADA_EXACTA'
            ? '<span class="text-[10px] font-bold text-indigo-700">Programada Exacta</span>'
            : ev.precisionKey === 'PREPROGRAMADA_MES'
            ? '<span class="text-[10px] font-bold text-amber-700">Pre-programada</span>'
            : '<span class="text-[10px] font-semibold text-slate-500">Sin Fecha</span>';
        return `
          <div class="min-w-0">
            <div class="font-mono font-bold text-slate-900 text-[11px] tabular-nums truncate">${escapeHtml(durationLine)}</div>
            <div class="truncate">${precBadge}</div>
          </div>
        `;
      },
    },
    {
      id: 'estado_alerta',
      header: 'Estatus y Alertas',
      sortable: true,
      defaultWidthPct: 19,
      minWidthPx: 160,
      renderCell: (ev) => {
        const alertNote = ev.hasConflict
          ? '<div class="text-[10px] font-bold text-rose-700 truncate">⚠ Conflicto auditor</div>'
          : ev.alerts.length > 0
          ? `<div class="text-[10px] font-bold text-amber-700 tabular-nums truncate">🔔 ${ev.alerts.length} alerta(s)</div>`
          : `<div class="text-[10px] text-slate-500 truncate">${escapeHtml(
              ev.auditStatusSummary.progressChip
            )} · ${escapeHtml(ev.pipelineStage)}</div>`;
        return `
          <div class="min-w-0 space-y-0.5">
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border leading-tight text-left max-w-full ${ev.auditStatusSummary.estatusBadgeClass}" title="${escapeHtml(
              ev.auditStatusSummary.estatus_auditoria
            )}">
              ${escapeHtml(ev.auditStatusSummary.estatus_auditoria)}
            </span>
            ${alertNote}
          </div>
        `;
      },
    },
  ];

  const renderCard = (ev: CampaignCalendarEvent): string => {
    const linkBadge = getProgramLinkingBadgeMeta(
      ev.program.nivel_vinculacion,
      ev.program.tipo_vinculacion
    );
    const dateBadge =
      isExactDatePrecision(ev.precisionKey) && ev.startDate
        ? `${formatShortDmy(ev.startDate)}${
            ev.endDate && ev.endDate !== ev.startDate ? ` → ${formatShortDmy(ev.endDate)}` : ''
          }`
        : ev.precisionKey === 'PREPROGRAMADA_MES' && ev.latestDate
        ? `${formatAuditDateLabel(ev.latestDate).split('·')[0]?.trim() || 'Mes/Año'} · Mes estimado · Sin días exactos`
        : 'Pendiente de fecha';

    return `
      <article
        data-action="select-cal-program"
        data-program-id="${escapeHtml(ev.program.id)}"
        ${ev.primaryAudit ? `data-audit-id="${escapeHtml(ev.primaryAudit.id)}"` : ''}
        tabindex="0"
        title="${escapeHtml(ev.alcanceSummaryTooltip)}"
        class="bg-white border ${
          ev.precisionKey === 'PREPROGRAMADA_MES'
            ? 'border-dashed border-amber-300'
            : 'border-slate-200'
        } rounded-xl p-5 shadow-2xs hover:shadow-sm hover:border-indigo-300 transition-all flex flex-col justify-between gap-4 cursor-pointer"
      >
        <div class="space-y-3">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                  ${escapeHtml(ev.codigoDisplay)}
                </span>
                ${ev.versionBadges
                  .map(
                    (v) =>
                      `<span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-300">${escapeHtml(v)}</span>`
                  )
                  .join('')}
                ${ev.orgAbrevLabels
                  .map(
                    (ab) =>
                      `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-white text-slate-700 border border-slate-200">${escapeHtml(ab)}</span>`
                  )
                  .join('')}
                ${
                  ev.hasMissingAlcance
                    ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">Sin alcance</span>`
                    : ''
                }
                ${
                  ev.isRescheduled
                    ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200 tabular-nums">Reprog. #${ev.rescheduleSeq}</span>`
                    : ''
                }
              </div>
              <h3 class="text-sm font-bold text-slate-900 mt-1.5 truncate">
                ${escapeHtml(ev.program.etiqueta)}
              </h3>
              <p class="text-[11px] font-medium text-slate-600 truncate mt-0.5" title="${escapeHtml(ev.alcanceSummaryTooltip)}">
                ${escapeHtml(ev.unifiedSummary)}
              </p>
            </div>
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border shrink-0 ${ev.auditStatusSummary.estatusBadgeClass}">
              ${escapeHtml(ev.auditStatusSummary.estatus_auditoria)}
            </span>
          </div>

          <div class="flex flex-wrap items-center gap-1.5">
            ${renderPipelineStageBadgeButton(ev)}
            <button
              type="button"
              data-action="jump-pipeline-stage"
              data-target-subview="resumen"
              data-program-id="${escapeHtml(ev.program.id)}"
              ${ev.primaryAudit ? `data-audit-id="${escapeHtml(ev.primaryAudit.id)}"` : ''}
              class="inline-flex items-center px-2 py-0.5 rounded-full border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-800 text-[10px] font-bold cursor-pointer transition-colors"
            >
              Resumen (${escapeHtml(ev.auditStatusSummary.progressChip)}) →
            </button>
            <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${linkBadge.className}">
              ${escapeHtml(linkBadge.label)}
            </span>
            ${
              ev.hasConflict
                ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">⚠ Conflicto</span>`
                : ev.alerts.length > 0
                ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 tabular-nums">🔔 ${ev.alerts.length} alerta(s)</span>`
                : ''
            }
          </div>

          <div class="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
            <div class="min-w-0">
              <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Agenda</span>
              <span class="font-mono font-semibold text-slate-800 tabular-nums block truncate" title="${escapeHtml(dateBadge)}">
                ${escapeHtml(dateBadge)}
              </span>
            </div>
            <div class="min-w-0">
              <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Equipo Líder</span>
              <span class="font-semibold text-slate-700 block truncate" title="${escapeHtml(ev.auditorLiderName)}">
                ${escapeHtml(ev.auditorLiderName)}
              </span>
            </div>
          </div>
        </div>
      </article>
    `;
  };

  const universalHtml = renderUniversalTemplate<CampaignCalendarEvent>({
    domainKey: 'calendario',
    tableId: 'calendario-main',
    title: 'Calendario Operativo de Evaluaciones',
    subtitle:
      'Agenda unificada de campañas (Individual, Nivel 1 y Nivel 2), fechas reales vs. estimaciones mensuales y alertas configurables',
    entityLabel: 'campañas en agenda',
    searchQuery: query,
    searchPlaceholder:
      'Buscar por código, campaña, organización, certificado, norma o auditor... (Presione "/" para enfocar)',
    searchInputId: 'calendarioSearchInput',
    clearSearchBtnId: 'clearCalendarioSearchBtn',
    totalCount: allCampaignEvents.length,
    filteredCount: sortedEvents.length,
    viewMode,
    enableCalendarMode: true,
    calendarViewLabel: 'Vista en Calendario',
    customCalendarViewHtml,
    topBannerHtml,
    isSidebarOpen: state.isSidebarOpen ?? true,
    sortState: {
      column: state.sortColumn ?? null,
      direction: state.sortDirection ?? 'none',
    },
    columnWidths: tableColumnWidths?.['calendario-main'],
    getRowAttrs: (ev) =>
      `data-action="select-cal-program" data-program-id="${escapeHtml(ev.program.id)}"${
        ev.primaryAudit ? ` data-audit-id="${escapeHtml(ev.primaryAudit.id)}"` : ''
      }`,
    facetGroups,
    items: sortedEvents,
    columns,
    renderCard,
    emptyStateTitle: 'No hay campañas en la agenda con estos criterios',
    emptyStateMessage:
      'Ajuste el buscador o restablezca las facetas laterales para visualizar todas las campañas programadas.',
    actionsHtml,
    loading,
    loadingMessage: 'Cargando agenda operativa...',
    ...extractUniversalArchiveProps(archiveConfig, 'programacion'),
  });

  const drawerAudit = state.drawerAuditId
    ? props.audits.find((a) => a.id === state.drawerAuditId) ||
      resolvedPrograms.flatMap((p) => p.auditorias).find((a) => a.id === state.drawerAuditId) ||
      null
    : null;

  const modalHtml =
    canConfigureAlerts && state.isAlertConfigModalOpen
      ? renderAlertConfigModal({
          alertConfig,
          draft: state.alertConfigDraft,
          errorMessage: state.alertConfigError ?? null,
          saving: Boolean(state.savingAlertConfig),
        })
      : '';

  const drawerEvent = drawerAudit
    ? allCampaignEvents.find(
        (ev) =>
          ev.primaryAudit?.id === drawerAudit.id ||
          ev.program.auditorias.some((a) => a.id === drawerAudit.id)
      ) ?? null
    : null;

  return `
    ${universalHtml}
    ${
      drawerAudit
        ? renderCalendarEventDrawer(
            drawerAudit,
            drawerEvent?.auditStatusSummary ??
              computeAuditStatusSummary({
                audit: drawerAudit,
                allAudits: props.audits,
                programs: resolvedPrograms,
                temporalSites: props.temporalSites ?? [],
                findings: props.findings ?? [],
                detailedCerts: props.certificados ?? [],
              }),
            drawerEvent?.operationalTargetSubview || 'resumen',
            props.certificados ?? []
          )
        : ''
    }
    ${modalHtml}
  `;
}

function renderPipelineStageBadgeButton(
  ev: CampaignCalendarEvent,
  compact: boolean = false
): string {
  return `
    <button
      type="button"
      data-action="jump-pipeline-stage"
      data-target-subview="${escapeHtml(ev.operationalTargetSubview)}"
      data-program-id="${escapeHtml(ev.program.id)}"
      ${ev.primaryAudit ? `data-audit-id="${escapeHtml(ev.primaryAudit.id)}"` : ''}
      title="Ir directo a ${escapeHtml(ev.operationalTargetSubview)} · Estatus: ${escapeHtml(
        ev.auditStatusSummary.estatus_auditoria
      )}"
      class="inline-flex items-center rounded-full border font-bold transition-colors cursor-pointer shrink-0 ${
        compact ? 'px-1.5 py-0.2 text-[9px]' : 'px-2 py-0.5 text-[10px]'
      } ${ev.auditStatusSummary.estatusBadgeClass}"
    >
      ${escapeHtml(
        compact
          ? `${ev.pipelineStage} · ${ev.auditStatusSummary.progressChip}`
          : ev.auditStatusSummary.estatus_auditoria
      )}
    </button>
  `;
}

function getEventsForYearMonth(
  events: ReadonlyArray<CampaignCalendarEvent>,
  year: number,
  month: number
): {
  exactEvents: CampaignCalendarEvent[];
  preprogEvents: CampaignCalendarEvent[];
  allMonthEvents: CampaignCalendarEvent[];
} {
  const mm = String(month).padStart(2, '0');
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthStart = `${year}-${mm}-01`;
  const monthEnd = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`;

  const exactEvents = events.filter(
    (ev) =>
      isExactDatePrecision(ev.precisionKey) &&
      ev.startDate &&
      ev.startDate <= monthEnd &&
      (ev.endDate || ev.startDate) >= monthStart
  );
  const preprogEvents = events.filter(
    (ev) =>
      ev.precisionKey === 'PREPROGRAMADA_MES' &&
      ev.estimatedYear === year &&
      ev.estimatedMonth === month
  );
  return {
    exactEvents,
    preprogEvents,
    allMonthEvents: [...exactEvents, ...preprogEvents],
  };
}

function renderPeriodSummaryBar(params: {
  counts: CalendarPeriodCounts;
  displayMode: CalendarDisplayMode;
  activeQuarter: 1 | 2 | 3 | 4;
  activeMonth: number;
}): string {
  const { counts, displayMode, activeQuarter, activeMonth } = params;
  const activeMonthCount = counts.months[activeMonth]?.total ?? 0;
  const exactTotal = counts.yearTotals.real + counts.yearTotals.programadaExacta;

  const quarterButtons = ([1, 2, 3, 4] as const)
    .map((q) => {
      const qCount = counts.quarters[q].total;
      const isSelected = displayMode === 'trimestre' && activeQuarter === q;
      return `
        <button
          type="button"
          data-action="select-cal-quarter"
          data-quarter="${q}"
          aria-pressed="${isSelected ? 'true' : 'false'}"
          class="px-2.5 py-1 rounded-lg border text-[11px] font-bold tabular-nums transition-colors cursor-pointer ${
            isSelected
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
              : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40'
          }"
        >
          Q${q} (${qCount})
        </button>
      `;
    })
    .join('');

  return `
    <div
      id="calPeriodSummaryBar"
      class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/80"
    >
      <div class="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          data-cal-mode="anio"
          class="px-2.5 py-1 rounded-lg border text-[11px] font-bold tabular-nums transition-colors cursor-pointer ${
            displayMode === 'anio'
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-900 border-slate-200 hover:bg-slate-100'
          }"
        >
          Año ${counts.year}: ${counts.yearTotals.total}
        </button>
        ${quarterButtons}
        <span class="px-2.5 py-1 rounded-lg border border-indigo-200 bg-indigo-50/70 text-[11px] font-bold text-indigo-900 tabular-nums">
          ${escapeHtml(MONTH_NAMES_ES[activeMonth - 1])} (${activeMonthCount})
        </span>
      </div>

      <div class="flex flex-wrap items-center gap-2 text-[11px] text-slate-600 tabular-nums">
        <span class="px-2 py-0.5 rounded bg-white border border-slate-200 font-semibold">
          Exactas/Reales: ${exactTotal}
        </span>
        <span class="px-2 py-0.5 rounded bg-amber-50 border border-amber-200 font-semibold text-amber-900">
          Pre-prog. Mes: ${counts.yearTotals.preprogramadaMes}
        </span>
        ${
          counts.sinFechaCount > 0
            ? `<span class="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 font-semibold text-slate-700">Pendientes: ${counts.sinFechaCount}</span>`
            : ''
        }
      </div>
    </div>
  `;
}

function renderCalendarCanvas(params: {
  state: CalendarioViewState;
  events: ReadonlyArray<CampaignCalendarEvent>;
  auditors: AuditorDetailEntity[];
  uniqueStandards: string[];
}): string {
  const { state, events, auditors, uniqueStandards } = params;

  const displayMode = normalizeCalendarDisplayMode(state.displayMode);
  const activeMonth = ((state.referenceMonth - 1 + 12) % 12) + 1;
  const activeQuarter: 1 | 2 | 3 | 4 =
    state.selectedQuarter ?? getQuarterFromMonth(activeMonth);
  const periodCounts = computeCalendarPeriodCounts(events, state.referenceYear);

  const monthLabel = `${MONTH_NAMES_ES[activeMonth - 1]} ${state.referenceYear}`;
  const periodTitle =
    displayMode === 'anio'
      ? `Año ${state.referenceYear}`
      : displayMode === 'trimestre'
      ? `Trimestre Q${activeQuarter} · ${state.referenceYear}`
      : monthLabel;

  const pendingDateEvents = events.filter((ev) => ev.precisionKey === 'SIN_FECHA');

  const bodyHtml =
    displayMode === 'anio'
      ? renderYearlyMatrixView(events, state.referenceYear, activeMonth, periodCounts)
      : displayMode === 'trimestre'
      ? renderQuarterlyGridView(events, state.referenceYear, activeQuarter, periodCounts)
      : displayMode === 'timeline'
      ? renderGanttTimelineView(events, state.referenceYear, activeMonth, activeQuarter)
      : renderMonthlyGridView(events, state.referenceYear, activeMonth);

  return `
    <div class="space-y-4">
      <!-- Calendar Toolbar: Period Nav + Año|Trimestre|Mes|Timeline + Counts + Quick Selectors -->
      <div class="bg-slate-50/70 border border-slate-200 rounded-xl p-3.5 space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-1.5">
            <button
              type="button"
              id="calPrevPeriodBtn"
              aria-label="Período anterior"
              class="h-8 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer transition-colors"
            >
              ← Anterior
            </button>
            <button
              type="button"
              id="calTodayPeriodBtn"
              class="h-8 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-indigo-700 cursor-pointer transition-colors"
            >
              Hoy
            </button>
            <div class="h-8 px-3 inline-flex items-center rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-900 tabular-nums">
              ${escapeHtml(periodTitle)}
            </div>
            <button
              type="button"
              id="calNextPeriodBtn"
              aria-label="Período siguiente"
              class="h-8 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer transition-colors"
            >
              Siguiente →
            </button>
          </div>

          <div
            class="inline-flex flex-wrap rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs"
            role="group"
            aria-label="Escala temporal del calendario"
          >
            ${(
              [
                { id: 'anio', label: 'Año' },
                { id: 'trimestre', label: 'Trimestre' },
                { id: 'mes', label: 'Mes' },
                { id: 'timeline', label: 'Timeline' },
              ] as const
            )
              .map((modeItem) => {
                const isSelected = displayMode === modeItem.id;
                return `
                  <button
                    type="button"
                    data-cal-mode="${modeItem.id}"
                    aria-pressed="${isSelected ? 'true' : 'false'}"
                    class="px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-slate-900 text-white font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }"
                  >
                    ${modeItem.label}
                  </button>
                `;
              })
              .join('')}
          </div>
        </div>

        ${renderPeriodSummaryBar({
          counts: periodCounts,
          displayMode,
          activeQuarter,
          activeMonth,
        })}

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div>
            <label for="calFilterAuditor" class="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Auditor Líder / Equipo
            </label>
            <select id="calFilterAuditor" class="w-full h-8 text-xs rounded-lg border border-slate-200 bg-white px-2.5">
              <option value="ALL" ${state.filterAuditorId === 'ALL' ? 'selected' : ''}>Todos los auditores (${auditors.length})</option>
              ${auditors
                .map(
                  (a) =>
                    `<option value="${escapeHtml(a.id)}" ${state.filterAuditorId === a.id ? 'selected' : ''}>${escapeHtml(a.nombre)}</option>`
                )
                .join('')}
            </select>
          </div>

          <div>
            <label for="calFilterStandard" class="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Norma ISO
            </label>
            <select id="calFilterStandard" class="w-full h-8 text-xs rounded-lg border border-slate-200 bg-white px-2.5">
              <option value="ALL" ${state.filterStandard === 'ALL' ? 'selected' : ''}>Todas las normas</option>
              ${uniqueStandards
                .map(
                  (std) =>
                    `<option value="${escapeHtml(std)}" ${state.filterStandard === std ? 'selected' : ''}>${escapeHtml(std)}</option>`
                )
                .join('')}
            </select>
          </div>

          <div>
            <label for="calFilterMethodology" class="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Metodología
            </label>
            <select id="calFilterMethodology" class="w-full h-8 text-xs rounded-lg border border-slate-200 bg-white px-2.5">
              <option value="ALL" ${state.filterMethodology === 'ALL' ? 'selected' : ''}>Todas</option>
              <option value="Presencial" ${state.filterMethodology === 'Presencial' ? 'selected' : ''}>Presencial</option>
              <option value="Remota" ${state.filterMethodology === 'Remota' ? 'selected' : ''}>Remota</option>
              <option value="Mixta" ${state.filterMethodology === 'Mixta' ? 'selected' : ''}>Mixta</option>
            </select>
          </div>
        </div>

        <div class="pt-2 border-t border-slate-200/70 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="font-bold text-slate-500 uppercase tracking-wider mr-1">Leyenda:</span>
            <span class="px-2 py-0.5 rounded bg-indigo-100 text-indigo-900 border border-indigo-300 font-semibold">Fecha Real / Exacta</span>
            <span class="px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-dashed border-amber-400 font-semibold">Mes estimado · Sin días exactos</span>
            <span class="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 font-semibold">Reprog. #N</span>
            <span class="px-2 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-300 font-semibold">Conflicto</span>
          </div>
          <span class="text-slate-500 tabular-nums">
            Clic en el badge de etapa para ir directo al paso activo
          </span>
        </div>
      </div>

      <!-- Primary Calendar Grid / Year / Quarter / Timeline -->
      ${bodyHtml}

      <!-- Bandeja "Pendientes de fecha" -->
      ${renderPendingDateTray(pendingDateEvents)}
    </div>
  `;
}

function renderYearlyMatrixView(
  events: ReadonlyArray<CampaignCalendarEvent>,
  year: number,
  activeMonth: number,
  counts: CalendarPeriodCounts
): string {
  const monthNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  return `
    <div id="calYearlyMatrix" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
      ${monthNumbers
        .map((m) => {
          const { allMonthEvents } = getEventsForYearMonth(events, year, m);
          const breakdown = counts.months[m];
          const q = getQuarterFromMonth(m);
          const isCurrentFocus = m === activeMonth;
          const alertCount = allMonthEvents.filter((ev) => ev.hasAlert).length;
          const exactCount = (breakdown?.real ?? 0) + (breakdown?.programadaExacta ?? 0);
          const preprogCount = breakdown?.preprogramadaMes ?? 0;

          return `
            <section
              class="bg-white border rounded-xl p-3.5 shadow-2xs flex flex-col justify-between gap-2.5 transition-colors ${
                isCurrentFocus
                  ? 'border-indigo-400 ring-1 ring-indigo-200'
                  : 'border-slate-200 hover:border-slate-300'
              }"
            >
              <div class="space-y-2">
                <div class="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <button
                    type="button"
                    data-action="zoom-cal-month"
                    data-year="${year}"
                    data-month="${m}"
                    class="text-left group cursor-pointer flex items-center gap-1.5 min-w-0"
                  >
                    <span class="text-xs font-bold text-slate-900 group-hover:text-indigo-700 truncate">
                      ${escapeHtml(MONTH_NAMES_ES[m - 1])}
                    </span>
                    <span class="text-[10px] font-bold text-slate-400">Q${q}</span>
                  </button>
                  <button
                    type="button"
                    data-action="zoom-cal-month"
                    data-year="${year}"
                    data-month="${m}"
                    class="px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums cursor-pointer transition-colors ${
                      allMonthEvents.length > 0
                        ? 'bg-indigo-50 text-indigo-800 border border-indigo-200 hover:bg-indigo-100'
                        : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200'
                    }"
                  >
                    ${allMonthEvents.length} ${allMonthEvents.length === 1 ? 'auditoría' : 'auditorías'}
                  </button>
                </div>

                <div class="flex flex-wrap items-center gap-1 text-[10px] tabular-nums">
                  <span class="px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200 text-slate-700 font-semibold">
                    Exactas: ${exactCount}
                  </span>
                  <span class="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 font-semibold">
                    Pre-prog: ${preprogCount}
                  </span>
                  ${
                    alertCount > 0
                      ? `<span class="px-1.5 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-700 font-bold">⚠ ${alertCount}</span>`
                      : ''
                  }
                </div>

                ${
                  allMonthEvents.length === 0
                    ? `<p class="text-[11px] text-slate-400 italic py-2">Sin auditorías en este mes</p>`
                    : `
                      <div class="space-y-1.5">
                        ${allMonthEvents
                          .slice(0, 3)
                          .map((ev) => {
                            return `
                              <div class="p-1.5 rounded-lg border ${
                                ev.precisionKey === 'PREPROGRAMADA_MES'
                                  ? 'border-dashed border-amber-300 bg-amber-50/60'
                                  : 'border-slate-200 bg-slate-50/70'
                              } flex items-center justify-between gap-1.5">
                                <button
                                  type="button"
                                  data-action="select-cal-program"
                                  data-program-id="${escapeHtml(ev.program.id)}"
                                  ${ev.primaryAudit ? `data-audit-id="${escapeHtml(ev.primaryAudit.id)}"` : ''}
                                  title="${escapeHtml(ev.alcanceSummaryTooltip)}"
                                  class="min-w-0 text-left flex-1 cursor-pointer hover:text-indigo-700"
                                >
                                  <div class="font-mono text-[10px] font-bold text-slate-900 truncate">
                                    ${escapeHtml(ev.codigoDisplay)}${ev.versionBadges.length > 0 ? ` · ${escapeHtml(ev.versionBadges.join('/'))}` : ''}
                                  </div>
                                  <div class="text-[10px] text-slate-600 truncate">
                                    ${escapeHtml(ev.orgAbrevLabels[0] || ev.orgNames[0] || ev.program.etiqueta)}
                                  </div>
                                </button>
                                ${renderPipelineStageBadgeButton(ev, true)}
                              </div>
                            `;
                          })
                          .join('')}
                        ${
                          allMonthEvents.length > 3
                            ? `
                              <button
                                type="button"
                                data-action="zoom-cal-month"
                                data-year="${year}"
                                data-month="${m}"
                                class="w-full text-center text-[10px] font-bold text-indigo-700 hover:text-indigo-900 py-0.5 cursor-pointer"
                              >
                                + ${allMonthEvents.length - 3} más · Ver mes →
                              </button>
                            `
                            : ''
                        }
                      </div>
                    `
                }
              </div>

              <button
                type="button"
                data-action="zoom-cal-month"
                data-year="${year}"
                data-month="${m}"
                class="w-full py-1 px-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-200 text-[11px] font-semibold text-slate-700 hover:text-indigo-800 transition-colors cursor-pointer"
              >
                Abrir ${escapeHtml(MONTH_NAMES_ES[m - 1])} →
              </button>
            </section>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderMonthlyGridView(
  events: ReadonlyArray<CampaignCalendarEvent>,
  year: number,
  month: number
): string {
  const { exactEvents, preprogEvents, allMonthEvents } = getEventsForYearMonth(
    events,
    year,
    month
  );
  const cells = buildCalendarMonthDayCells(year, month, exactEvents);

  const preprogBandHtml =
    preprogEvents.length > 0
      ? `
        <div class="p-3 bg-amber-50/70 border-b border-dashed border-amber-300 space-y-2">
          <div class="flex items-center justify-between gap-2">
            <span class="text-[11px] font-bold uppercase tracking-wider text-amber-900">
              Pre-programación de ${escapeHtml(MONTH_NAMES_ES[(month - 1 + 12) % 12])} ${year} · Mes estimado · Sin días exactos
            </span>
            <span class="text-[11px] font-bold text-amber-800 tabular-nums">
              ${preprogEvents.length} campaña(s)
            </span>
          </div>
          <div class="flex flex-wrap gap-2">
            ${preprogEvents
              .map((ev) => {
                return `
                  <div class="px-2.5 py-1.5 rounded-lg border border-dashed border-amber-400 bg-white/90 hover:bg-amber-100/50 text-[11px] transition-colors flex items-center gap-2 max-w-full">
                    <button
                      type="button"
                      data-action="select-cal-program"
                      data-program-id="${escapeHtml(ev.program.id)}"
                      ${ev.primaryAudit ? `data-audit-id="${escapeHtml(ev.primaryAudit.id)}"` : ''}
                      title="${escapeHtml(ev.unifiedSummary)}"
                      class="text-left cursor-pointer flex items-center gap-2 min-w-0"
                    >
                      <span class="font-mono font-bold text-amber-900 shrink-0">${escapeHtml(ev.codigoDisplay)}</span>
                      <span class="font-semibold text-slate-900 truncate max-w-[230px]">${escapeHtml(ev.unifiedSummary)}</span>
                      <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 shrink-0">Mes estimado · Sin días exactos</span>
                      ${
                        ev.isRescheduled
                          ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 shrink-0">Reprog. #${ev.rescheduleSeq}</span>`
                          : ''
                      }
                    </button>
                    ${renderPipelineStageBadgeButton(ev, true)}
                  </div>
                `;
              })
              .join('')}
          </div>
        </div>
      `
      : '';

  return `
    <div class="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
      <div class="px-4 py-2.5 bg-slate-50/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <span class="text-xs font-bold text-slate-900">
          ${escapeHtml(MONTH_NAMES_ES[(month - 1 + 12) % 12])} ${year}
        </span>
        <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 tabular-nums">
          ${allMonthEvents.length} ${allMonthEvents.length === 1 ? 'auditoría' : 'auditorías'} en el mes
        </span>
      </div>
      ${preprogBandHtml}

      <!-- Weekday Headers -->
      <div class="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
        ${WEEKDAYS_ES.map(
          (day) =>
            `<div class="px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wider text-slate-600">${day}</div>`
        ).join('')}
      </div>

      <!-- Calendar Days Grid -->
      <div class="grid grid-cols-7 divide-x divide-y divide-slate-100">
        ${cells
          .map((cell) => {
            const bgClass = !cell.inCurrentMonth
              ? 'bg-slate-50/70 text-slate-400'
              : cell.isWeekend
              ? 'bg-slate-50/40'
              : 'bg-white';

            return `
              <div class="min-h-28 p-2 space-y-1.5 ${bgClass}">
                <div class="flex items-center justify-between">
                  <span class="text-xs font-bold tabular-nums ${
                    cell.inCurrentMonth ? 'text-slate-800' : 'text-slate-400'
                  }">${cell.dayOfMonth}</span>
                  ${
                    cell.events.length > 0
                      ? `<span class="text-[10px] font-mono font-bold text-indigo-600 tabular-nums">${cell.events.length}</span>`
                      : ''
                  }
                </div>

                <div class="space-y-1">
                  ${cell.events
                    .map((ev) => {
                      const mod = getModalityVisualStyle(ev.primaryAudit?.tipo_auditoria || 'Etapa 2');
                      return `
                        <div class="rounded border p-1 space-y-1 ${
                          mod.calendarChipClass
                        } ${ev.hasConflict ? 'ring-2 ring-rose-500' : ''}">
                          <button
                            type="button"
                            data-action="select-cal-program"
                            data-program-id="${escapeHtml(ev.program.id)}"
                            ${ev.primaryAudit ? `data-audit-id="${escapeHtml(ev.primaryAudit.id)}"` : ''}
                            title="${escapeHtml(ev.codigoDisplay)} — ${escapeHtml(ev.unifiedSummary)}\n${escapeHtml(ev.alcanceSummaryTooltip)}"
                            class="w-full text-left text-[10px] leading-tight cursor-pointer block"
                          >
                            <div class="flex items-center justify-between gap-1 font-mono font-bold">
                              <span class="truncate">${escapeHtml(ev.codigoDisplay)}${ev.versionBadges.length > 0 ? ` · ${escapeHtml(ev.versionBadges.join('/'))}` : ''}</span>
                              ${
                                ev.isRescheduled
                                  ? `<span class="px-1 rounded bg-white/80 text-indigo-900 text-[9px] shrink-0">Reprog. #${ev.rescheduleSeq}</span>`
                                  : ''
                              }
                            </div>
                            <div class="truncate font-semibold">${escapeHtml(ev.orgAbrevLabels.length > 0 ? `${ev.orgAbrevLabels.join(' / ')} · ${ev.unifiedSummary}` : ev.unifiedSummary)}</div>
                          </button>
                          <div class="flex items-center justify-between gap-1">
                            <span class="text-[9px] font-semibold opacity-75 truncate">
                              ${ev.precisionKey === 'REAL' ? 'Real' : 'Exacta'}
                            </span>
                            ${renderPipelineStageBadgeButton(ev, true)}
                          </div>
                        </div>
                      `;
                    })
                    .join('')}
                </div>
              </div>
            `;
          })
          .join('')}
      </div>
    </div>
  `;
}

function renderQuarterlyGridView(
  events: ReadonlyArray<CampaignCalendarEvent>,
  year: number,
  activeQuarter: 1 | 2 | 3 | 4,
  counts: CalendarPeriodCounts
): string {
  const quarterMeta: Array<{
    q: 1 | 2 | 3 | 4;
    rangeLabel: string;
    months: [number, number, number];
  }> = [
    { q: 1, rangeLabel: 'Ene–Mar', months: [1, 2, 3] },
    { q: 2, rangeLabel: 'Abr–Jun', months: [4, 5, 6] },
    { q: 3, rangeLabel: 'Jul–Sep', months: [7, 8, 9] },
    { q: 4, rangeLabel: 'Oct–Dic', months: [10, 11, 12] },
  ];

  const activeQInfo = quarterMeta.find((item) => item.q === activeQuarter) ?? quarterMeta[0];

  const quarterCardsStrip = `
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      ${quarterMeta
        .map((qm) => {
          const qCount = counts.quarters[qm.q].total;
          const isSelected = qm.q === activeQuarter;
          return `
            <button
              type="button"
              data-action="select-cal-quarter"
              data-quarter="${qm.q}"
              aria-pressed="${isSelected ? 'true' : 'false'}"
              class="text-left p-3 rounded-xl border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                  : 'bg-white text-slate-900 border-slate-200 hover:border-indigo-300'
              }"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs font-bold">Q${qm.q} ${qm.rangeLabel}</span>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums ${
                  isSelected
                    ? 'bg-white/20 text-white'
                    : 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                }">
                  Q${qm.q} · ${qCount} ${qCount === 1 ? 'auditoría' : 'auditorías'}
                </span>
              </div>
              <div class="mt-1.5 text-[11px] tabular-nums ${
                isSelected ? 'text-slate-200' : 'text-slate-500'
              }">
                ${qm.months
                  .map((m) => `${MONTH_NAMES_ES[m - 1].slice(0, 3)}: ${counts.months[m]?.total ?? 0}`)
                  .join(' · ')}
              </div>
            </button>
          `;
        })
        .join('')}
    </div>
  `;

  return `
    <div class="space-y-4">
      ${quarterCardsStrip}

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        ${activeQInfo.months
          .map((m) => {
            const { exactEvents, preprogEvents, allMonthEvents } = getEventsForYearMonth(
              events,
              year,
              m
            );
            const cells = buildCalendarMonthDayCells(year, m, exactEvents);
            const monthLabel = `${MONTH_NAMES_ES[m - 1]} ${year}`;

            return `
              <section class="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
                <div class="flex items-center justify-between border-b border-slate-100 pb-2">
                  <button
                    type="button"
                    data-action="zoom-cal-month"
                    data-year="${year}"
                    data-month="${m}"
                    class="text-sm font-bold text-slate-900 hover:text-indigo-700 cursor-pointer"
                  >
                    ${escapeHtml(monthLabel)}
                  </button>
                  <span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200 tabular-nums">
                    ${allMonthEvents.length} ${allMonthEvents.length === 1 ? 'auditoría' : 'auditorías'}
                  </span>
                </div>

                <!-- Mini Month Grid -->
                <div class="grid grid-cols-7 gap-1 text-center text-[10px]">
                  ${WEEKDAYS_ES.map((w) => `<div class="font-bold text-slate-400 py-1">${w[0]}</div>`).join('')}
                  ${cells
                    .map((c) => {
                      if (!c.inCurrentMonth) {
                        return `<div class="py-1 text-slate-300 tabular-nums">${c.dayOfMonth}</div>`;
                      }
                      const firstEv = c.events[0];
                      if (firstEv) {
                        const mod = getModalityVisualStyle(firstEv.primaryAudit?.tipo_auditoria || 'Etapa 2');
                        return `
                          <button
                            type="button"
                            data-action="select-cal-program"
                            data-program-id="${escapeHtml(firstEv.program.id)}"
                            ${firstEv.primaryAudit ? `data-audit-id="${escapeHtml(firstEv.primaryAudit.id)}"` : ''}
                            title="${escapeHtml(c.events.map((x) => `${x.codigoDisplay} · ${x.unifiedSummary}`).join(', '))}"
                            class="py-1 rounded font-bold border cursor-pointer tabular-nums ${mod.calendarChipClass}"
                          >
                            ${c.dayOfMonth}
                          </button>
                        `;
                      }
                      return `<div class="py-1 text-slate-600 tabular-nums">${c.dayOfMonth}</div>`;
                    })
                    .join('')}
                </div>

                <!-- Month Campaigns List (REAL + PROGRAMADA_EXACTA + PREPROGRAMADA_MES) -->
                <div class="space-y-1.5 pt-2 border-t border-slate-100">
                  ${exactEvents
                    .map((ev) => {
                      const mod = getModalityVisualStyle(ev.primaryAudit?.tipo_auditoria || 'Etapa 2');
                      return `
                        <div class="p-2 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                          mod.calendarChipClass
                        } ${ev.hasConflict ? 'ring-2 ring-rose-500' : ''}">
                          <button
                            type="button"
                            data-action="select-cal-program"
                            data-program-id="${escapeHtml(ev.program.id)}"
                            ${ev.primaryAudit ? `data-audit-id="${escapeHtml(ev.primaryAudit.id)}"` : ''}
                            class="min-w-0 flex-1 text-left cursor-pointer"
                          >
                            <div class="font-mono font-bold truncate tabular-nums">
                              ${escapeHtml(ev.codigoDisplay)} · ${escapeHtml(formatShortDmy(ev.startDate))}
                            </div>
                            <div class="truncate font-semibold">${escapeHtml(ev.unifiedSummary)}</div>
                          </button>
                          <div class="flex items-center gap-1 shrink-0">
                            ${
                              ev.isRescheduled
                                ? `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/80 text-indigo-900">Reprog. #${ev.rescheduleSeq}</span>`
                                : ''
                            }
                            ${renderPipelineStageBadgeButton(ev, true)}
                          </div>
                        </div>
                      `;
                    })
                    .join('')}
                  ${preprogEvents
                    .map(
                      (ev) => `
                        <div class="p-2 rounded-lg border border-dashed border-amber-400 bg-amber-50/70 hover:bg-amber-100/50 text-xs flex items-center justify-between gap-2">
                          <button
                            type="button"
                            data-action="select-cal-program"
                            data-program-id="${escapeHtml(ev.program.id)}"
                            ${ev.primaryAudit ? `data-audit-id="${escapeHtml(ev.primaryAudit.id)}"` : ''}
                            class="min-w-0 flex-1 text-left cursor-pointer space-y-0.5"
                          >
                            <div class="flex items-center justify-between gap-2">
                              <span class="font-mono font-bold text-amber-900 truncate">${escapeHtml(ev.codigoDisplay)}</span>
                              <span class="text-[10px] font-bold text-amber-800 shrink-0">Mes estimado · Sin días exactos</span>
                            </div>
                            <div class="truncate font-semibold text-slate-900">${escapeHtml(ev.unifiedSummary)}</div>
                          </button>
                          ${renderPipelineStageBadgeButton(ev, true)}
                        </div>
                      `
                    )
                    .join('')}
                  ${
                    allMonthEvents.length === 0
                      ? `<p class="text-xs text-slate-400 italic py-2 text-center">Sin campañas en este mes</p>`
                      : ''
                  }
                </div>
              </section>
            `;
          })
          .join('')}
      </div>
    </div>
  `;
}

function renderGanttTimelineView(
  events: ReadonlyArray<CampaignCalendarEvent>,
  year: number,
  month: number,
  activeQuarter: 1 | 2 | 3 | 4
): string {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const gridColsClass = GRID_COLS_BY_DAYS[daysInMonth] || GRID_COLS_BY_DAYS[30];
  const winStartStr = formatIsoDateParts(year, month, 1);
  const winEndStr = formatIsoDateParts(year, month, daysInMonth);

  const byAuditor = new Map<string, CampaignCalendarEvent[]>();
  for (const ev of events) {
    const matchesExact =
      isExactDatePrecision(ev.precisionKey) &&
      ev.startDate &&
      (ev.endDate || ev.startDate) >= winStartStr &&
      ev.startDate <= winEndStr;
    const matchesPreprog =
      ev.precisionKey === 'PREPROGRAMADA_MES' &&
      ev.estimatedYear === year &&
      ev.estimatedMonth === month;

    if (!matchesExact && !matchesPreprog) continue;

    const list = byAuditor.get(ev.auditorLiderName) || [];
    list.push(ev);
    byAuditor.set(ev.auditorLiderName, list);
  }

  const dayNumbers = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const chronologicalYearEvents = events
    .filter((ev) => {
      if (ev.precisionKey === 'PREPROGRAMADA_MES') {
        return ev.estimatedYear === year;
      }
      if (isExactDatePrecision(ev.precisionKey) && ev.startDate) {
        const end = ev.endDate && ev.endDate >= ev.startDate ? ev.endDate : ev.startDate;
        return ev.startDate <= `${year}-12-31` && end >= `${year}-01-01`;
      }
      return false;
    })
    .slice()
    .sort((a, b) => {
      const aKey =
        a.startDate ||
        (a.estimatedYear && a.estimatedMonth
          ? `${a.estimatedYear}-${String(a.estimatedMonth).padStart(2, '0')}-99`
          : '9999-99-99');
      const bKey =
        b.startDate ||
        (b.estimatedYear && b.estimatedMonth
          ? `${b.estimatedYear}-${String(b.estimatedMonth).padStart(2, '0')}-99`
          : '9999-99-99');
      return aKey.localeCompare(bKey);
    });

  return `
    <div class="space-y-4">
      <div class="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
        <div class="px-5 py-3 border-b border-slate-100 bg-slate-50/80 flex flex-wrap items-center justify-between gap-2">
          <div class="text-xs font-bold text-slate-800">
            Línea de Tiempo por Auditor Líder — ${escapeHtml(MONTH_NAMES_ES[(month - 1 + 12) % 12])} ${year} (Q${activeQuarter})
          </div>
          <div class="text-[11px] text-slate-500">
            Barras sólidas: Fecha Real / Exacta · Bandas discontinuas: Mes estimado · Sin días exactos
          </div>
        </div>

        <div class="overflow-x-auto">
          <div class="min-w-[820px]">
            <!-- Timeline Header -->
            <div class="grid grid-cols-12 border-b border-slate-200 bg-slate-50 text-[10px] font-bold text-slate-500">
              <div class="col-span-3 px-4 py-2 border-r border-slate-200 uppercase tracking-wider">
                Auditor Líder
              </div>
              <div class="col-span-9 grid ${gridColsClass} text-center">
                ${dayNumbers
                  .map(
                    (d) =>
                      `<div class="py-2 border-r border-slate-100 font-mono tabular-nums">${d}</div>`
                  )
                  .join('')}
              </div>
            </div>

            <!-- Timeline Rows -->
            ${
              byAuditor.size === 0
                ? `<div class="p-8 text-center text-xs text-slate-500">No existen campañas asignadas en ${escapeHtml(MONTH_NAMES_ES[(month - 1 + 12) % 12])} ${year} bajo los filtros actuales.</div>`
                : Array.from(byAuditor.entries())
                    .map(([auditorName, auditorEvents]) => {
                      return `
                        <div class="grid grid-cols-12 border-b border-slate-100 hover:bg-slate-50/40">
                          <div class="col-span-3 px-4 py-3 border-r border-slate-200 flex flex-col justify-center">
                            <div class="text-xs font-bold text-slate-900 truncate">${escapeHtml(auditorName)}</div>
                            <div class="text-[10px] text-slate-500 tabular-nums">${auditorEvents.length} campaña(s) este mes</div>
                          </div>

                          <div class="col-span-9 p-2 space-y-1.5">
                            ${auditorEvents
                              .map((ev) => {
                                if (ev.precisionKey === 'PREPROGRAMADA_MES') {
                                  return `
                                    <div class="w-full px-2.5 py-1.5 rounded-md border border-dashed border-amber-400 bg-amber-50/80 hover:bg-amber-100/60 flex items-center justify-between gap-2">
                                      <button
                                        type="button"
                                        data-action="select-cal-program"
                                        data-program-id="${escapeHtml(ev.program.id)}"
                                        ${ev.primaryAudit ? `data-audit-id="${escapeHtml(ev.primaryAudit.id)}"` : ''}
                                        title="${escapeHtml(ev.codigoDisplay)} · ${escapeHtml(ev.unifiedSummary)}"
                                        class="text-amber-950 text-[10px] font-bold truncate text-left cursor-pointer flex items-center gap-2 min-w-0 flex-1"
                                      >
                                        <span class="truncate">${escapeHtml(ev.codigoDisplay)} · ${escapeHtml(ev.unifiedSummary)}</span>
                                        <span class="shrink-0 text-[9px] uppercase tracking-wider font-extrabold text-amber-800">Mes estimado · Sin días exactos</span>
                                      </button>
                                      ${renderPipelineStageBadgeButton(ev, true)}
                                    </div>
                                  `;
                                }

                                const startStr = ev.startDate || winStartStr;
                                const endStr = ev.endDate && ev.endDate >= startStr ? ev.endDate : startStr;
                                const clampedStart = startStr < winStartStr ? winStartStr : startStr;
                                const clampedEnd = endStr > winEndStr ? winEndStr : endStr;

                                const startDay = Math.max(1, Number(clampedStart.slice(8, 10)) || 1);
                                const endDay = Math.min(daysInMonth, Number(clampedEnd.slice(8, 10)) || startDay);
                                const spanDays = Math.max(1, endDay - startDay + 1);

                                const startCls = COL_START_CLASSES[startDay] || 'col-start-1';
                                const spanCls = COL_SPAN_CLASSES[spanDays] || 'col-span-1';
                                const mod = getModalityVisualStyle(ev.primaryAudit?.tipo_auditoria || 'Etapa 2');

                                return `
                                  <div class="grid ${gridColsClass} items-center gap-1">
                                    <button
                                      type="button"
                                      data-action="select-cal-program"
                                      data-program-id="${escapeHtml(ev.program.id)}"
                                      ${ev.primaryAudit ? `data-audit-id="${escapeHtml(ev.primaryAudit.id)}"` : ''}
                                      title="${escapeHtml(ev.codigoDisplay)} · ${escapeHtml(ev.unifiedSummary)} (${escapeHtml(startStr)} → ${escapeHtml(endStr)})"
                                      class="${startCls} ${spanCls} px-2 py-1.5 rounded-md border text-[10px] font-bold truncate text-left cursor-pointer shadow-2xs transition-opacity hover:opacity-90 ${
                                        mod.ganttBarClass
                                      } ${ev.hasConflict ? 'ring-2 ring-rose-500 ring-offset-1' : ''}"
                                    >
                                      ${ev.hasConflict ? '⚠️ ' : ''}${escapeHtml(ev.codigoDisplay)} · ${escapeHtml(ev.unifiedSummary)}${
                                        ev.isRescheduled ? ` · Reprog. #${ev.rescheduleSeq}` : ''
                                      }
                                    </button>
                                    <div class="col-span-full flex justify-end">
                                      ${renderPipelineStageBadgeButton(ev, true)}
                                    </div>
                                  </div>
                                `;
                              })
                              .join('')}
                          </div>
                        </div>
                      `;
                    })
                    .join('')
            }
          </div>
        </div>
      </div>

      <!-- Cronograma Anual / Trimestral en Tabla Clean List (colgroup=100%, 0 botones en <td>) -->
      <div class="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
        <div class="px-5 py-3 border-b border-slate-100 bg-slate-50/80 flex flex-wrap items-center justify-between gap-2">
          <div class="text-xs font-bold text-slate-800">
            Cronograma Cronológico Anual (${year}) — Clic en fila para ir directo a la etapa activa
          </div>
          <span class="text-[11px] font-bold text-slate-600 tabular-nums">
            ${chronologicalYearEvents.length} campaña(s) en ${year}
          </span>
        </div>
        ${
          chronologicalYearEvents.length === 0
            ? `<div class="p-6 text-center text-xs text-slate-500">No existen campañas programadas en ${year} bajo los filtros actuales.</div>`
            : `
              <div class="overflow-x-auto">
                <table id="calTimelineTable" class="w-full min-w-[820px] table-fixed text-xs border-collapse">
                  <colgroup>
                    <col style="width: 12%;" />
                    <col style="width: 26%;" />
                    <col style="width: 24%;" />
                    <col style="width: 17%;" />
                    <col style="width: 10%;" />
                    <col style="width: 11%;" />
                  </colgroup>
                  <thead>
                    <tr class="bg-slate-50 border-b border-slate-200 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <th class="px-4 py-2.5">Código</th>
                      <th class="px-4 py-2.5">Campaña / Organización</th>
                      <th class="px-4 py-2.5">Ventana Temporal</th>
                      <th class="px-4 py-2.5">Auditor Líder</th>
                      <th class="px-4 py-2.5">Trimestre</th>
                      <th class="px-4 py-2.5">Estatus Auditoría</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100">
                    ${chronologicalYearEvents
                      .map((ev) => {
                        const targetMonth =
                          ev.precisionKey === 'PREPROGRAMADA_MES'
                            ? ev.estimatedMonth || 1
                            : ev.startDate
                            ? Number(ev.startDate.slice(5, 7)) || 1
                            : 1;
                        const q = getQuarterFromMonth(targetMonth);
                        const windowText =
                          isExactDatePrecision(ev.precisionKey) && ev.startDate
                            ? ev.endDate && ev.endDate !== ev.startDate
                              ? `${formatShortDmy(ev.startDate)} → ${formatShortDmy(ev.endDate)}`
                              : formatShortDmy(ev.startDate)
                            : ev.estimatedMonth
                            ? `${MONTH_NAMES_ES[ev.estimatedMonth - 1]} ${year} (Est.)`
                            : 'Pendiente';
                        return `
                          <tr
                            data-action="jump-pipeline-stage"
                            data-target-subview="${escapeHtml(ev.operationalTargetSubview)}"
                            data-program-id="${escapeHtml(ev.program.id)}"
                            ${ev.primaryAudit ? `data-audit-id="${escapeHtml(ev.primaryAudit.id)}"` : ''}
                            tabindex="0"
                            class="hover:bg-indigo-50/40 cursor-pointer transition-colors"
                          >
                            <td class="px-4 py-2.5 font-mono font-bold text-indigo-700 truncate" title="${escapeHtml(ev.alcanceSummaryTooltip)}">
                              ${escapeHtml(ev.codigoDisplay)}${ev.versionBadges.length > 0 ? ` · ${escapeHtml(ev.versionBadges.join('/'))}` : ''}
                            </td>
                            <td class="px-4 py-2.5 min-w-0" title="${escapeHtml(ev.alcanceSummaryTooltip)}">
                              <div class="font-semibold text-slate-900 truncate">${escapeHtml(ev.program.etiqueta)}</div>
                              <div class="text-[10px] text-slate-500 truncate">${escapeHtml((ev.orgAbrevLabels.length > 0 ? ev.orgAbrevLabels : ev.orgNames).join(' · ') || '—')}</div>
                            </td>
                            <td class="px-4 py-2.5 font-mono text-[11px] text-slate-800 tabular-nums truncate">
                              ${escapeHtml(windowText)}
                            </td>
                            <td class="px-4 py-2.5 text-slate-700 truncate">
                              ${escapeHtml(ev.auditorLiderName)}
                            </td>
                            <td class="px-4 py-2.5 font-bold text-slate-700 tabular-nums truncate">
                              Q${q} · ${escapeHtml(MONTH_NAMES_ES[targetMonth - 1].slice(0, 3))}
                            </td>
                            <td class="px-4 py-2.5">
                              <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border truncate max-w-full ${ev.auditStatusSummary.estatusBadgeClass}" title="${escapeHtml(
                                ev.auditStatusSummary.estatus_auditoria
                              )}">
                                ${escapeHtml(ev.auditStatusSummary.estatus_auditoria)}
                              </span>
                            </td>
                          </tr>
                        `;
                      })
                      .join('')}
                  </tbody>
                </table>
              </div>
            `
        }
      </div>
    </div>
  `;
}

function renderPendingDateTray(pendingEvents: ReadonlyArray<CampaignCalendarEvent>): string {
  return `
    <section
      id="calPendingDateTray"
      aria-label="Pendientes de fecha"
      class="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-2.5"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-700">
            Pendientes de fecha
          </h3>
          <span class="px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums bg-white border border-slate-200 text-slate-700">
            ${pendingEvents.length}
          </span>
        </div>
        <span class="text-[11px] text-slate-500">
          Campañas sin registros activos en agenda (auditoria_fecha)
        </span>
      </div>

      ${
        pendingEvents.length === 0
          ? `<p class="text-xs text-slate-500">Todas las campañas filtradas cuentan con fecha real o estimación mensual asignada.</p>`
          : `
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              ${pendingEvents
                .map(
                  (ev) => `
                    <button
                      type="button"
                      data-action="jump-pipeline-stage"
                      data-target-subview="designacion/fecha"
                      data-program-id="${escapeHtml(ev.program.id)}"
                      ${ev.primaryAudit ? `data-audit-id="${escapeHtml(ev.primaryAudit.id)}"` : ''}
                      class="w-full text-left p-2.5 rounded-lg border border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors cursor-pointer flex items-center justify-between gap-2"
                    >
                      <div class="min-w-0">
                        <div class="font-mono text-[11px] font-bold text-indigo-700 truncate">
                          ${escapeHtml(ev.codigoDisplay)}
                        </div>
                        <div class="text-xs font-semibold text-slate-900 truncate">
                          ${escapeHtml(ev.unifiedSummary)}
                        </div>
                      </div>
                      <span class="text-[11px] font-semibold text-indigo-700 shrink-0">Definir fecha →</span>
                    </button>
                  `
                )
                .join('')}
            </div>
          `
      }
    </section>
  `;
}

function renderAlertConfigModal(params: {
  alertConfig: AlertConfigEntity;
  draft?: CalendarioAlertConfigDraft;
  errorMessage: string | null;
  saving: boolean;
}): string {
  const { alertConfig, draft, errorMessage, saving } = params;
  const diasProxima = draft?.dias_aviso_proxima ?? String(alertConfig.dias_aviso_proxima);
  const diasPreprog =
    draft?.dias_aviso_preprogramada_sin_confirmar ??
    String(alertConfig.dias_aviso_preprogramada_sin_confirmar);
  const ciclosRotacion =
    draft?.ciclos_rotacion_auditor_lider ??
    String(alertConfig.ciclos_rotacion_auditor_lider);
  const alertarAtrasadas = draft ? draft.alertar_atrasadas : alertConfig.alertar_atrasadas;
  const alertarConflicto = draft
    ? draft.alertar_conflicto_auditor
    : alertConfig.alertar_conflicto_auditor;
  const alertarDesfase = draft
    ? draft.alertar_desfase_dias_o_span
    : alertConfig.alertar_desfase_dias_o_span;
  const alertasActivas = draft ? draft.alertas_activas : alertConfig.alertas_activas;

  return `
    <div
      id="alertConfigModalBackdrop"
      class="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="alertConfigModalTitle"
    >
      <div class="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50/70">
          <div>
            <h3 id="alertConfigModalTitle" class="text-sm font-bold text-slate-900">
              ⚙ Configurar Alertas de Planificación
            </h3>
            <p class="text-[11px] text-slate-500">
              Umbrales y reglas globales persistidas en configuracion_alerta_auditoria
            </p>
          </div>
          <button
            type="button"
            id="closeAlertConfigModalBtn"
            data-action="close-alert-config-modal"
            aria-label="Cerrar configuración de alertas"
            class="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            ✕
          </button>
        </div>

        <form id="alertConfigForm" class="p-5 space-y-4 text-xs">
          ${
            errorMessage
              ? `<div class="p-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 font-semibold">${escapeHtml(errorMessage)}</div>`
              : ''
          }

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <div class="flex flex-col justify-end h-full">
              <label for="alertCfgDiasProxima" class="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Días aviso auditoría próxima
              </label>
              <input
                type="number"
                id="alertCfgDiasProxima"
                name="dias_aviso_proxima"
                min="0"
                max="365"
                required
                value="${escapeHtml(diasProxima)}"
                class="w-full h-9 rounded-lg border border-slate-300 px-3 text-xs tabular-nums focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div class="flex flex-col justify-end h-full">
              <label for="alertCfgDiasPreprog" class="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Días aviso pre-prog. sin confirmar
              </label>
              <input
                type="number"
                id="alertCfgDiasPreprog"
                name="dias_aviso_preprogramada_sin_confirmar"
                min="0"
                max="365"
                required
                value="${escapeHtml(diasPreprog)}"
                class="w-full h-9 rounded-lg border border-slate-300 px-3 text-xs tabular-nums focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div class="sm:col-span-2">
              <label for="alertCfgRotacion" class="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Ciclos de rotación de Auditor Líder (ISO 17021-1)
              </label>
              <input
                type="number"
                id="alertCfgRotacion"
                name="ciclos_rotacion_auditor_lider"
                min="1"
                max="10"
                required
                value="${escapeHtml(ciclosRotacion)}"
                class="w-full h-9 rounded-lg border border-slate-300 px-3 text-xs tabular-nums focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div class="space-y-2 pt-2 border-t border-slate-100">
            <label class="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                id="alertCfgActivas"
                name="alertas_activas"
                ${alertasActivas ? 'checked' : ''}
                class="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span class="font-semibold text-slate-900">Motor de alertas operativas activo</span>
            </label>

            <label class="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                id="alertCfgAtrasadas"
                name="alertar_atrasadas"
                ${alertarAtrasadas ? 'checked' : ''}
                class="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span class="text-slate-700">Alertar auditorías atrasadas (fecha real vencida)</span>
            </label>

            <label class="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                id="alertCfgConflicto"
                name="alertar_conflicto_auditor"
                ${alertarConflicto ? 'checked' : ''}
                class="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span class="text-slate-700">Detectar conflictos de disponibilidad de auditor</span>
            </label>

            <label class="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                id="alertCfgDesfase"
                name="alertar_desfase_dias_o_span"
                ${alertarDesfase ? 'checked' : ''}
                class="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span class="text-slate-700">Alertar desfases de días-auditor y capacidad span calendario</span>
            </label>
          </div>

          <div class="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              data-action="close-alert-config-modal"
              class="h-9 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              id="saveAlertConfigSubmitBtn"
              ${saving ? 'disabled' : ''}
              class="h-9 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold cursor-pointer transition-colors"
            >
              ${saving ? 'Guardando...' : 'Guardar Configuración'}
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function renderCalendarEventDrawer(
  audit: ProgramacionAuditEntity,
  statusSummary: AuditStatusSummaryResult,
  operationalTargetSubview: string,
  certificados: ReadonlyArray<CertificadoDetailEntity> = []
): string {
  const mod = getModalityVisualStyle(audit.tipo_auditoria);
  const met = getMethodologyVisualStyle(audit.metodologia);
  const snapshot =
    certificados.length > 0 ? resolveCertVersionSnapshotForAudit(audit, certificados) : null;
  const drawerVersionNum =
    (typeof audit.version_numero === 'number' && audit.version_numero >= 1
      ? Math.floor(audit.version_numero)
      : null) ??
    snapshot?.versionNumero ??
    null;
  const drawerOrgAbrev =
    snapshot?.organizacionAbreviacion ?? audit.organizacion_abreviacion ?? null;
  const drawerAlcanceEs = snapshot?.alcance_es?.trim() || null;
  const drawerMissingAlcance = snapshot !== null && !snapshot.hasAlcance;

  return `
    <div
      id="calDrawerBackdrop"
      class="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="calDrawerTitle"
    >
      <div class="w-full max-w-md sm:max-w-lg bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col justify-between overflow-y-auto">
        <div class="p-6 space-y-5">
          <!-- Drawer Header -->
          <div class="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
            <div class="space-y-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                  ${escapeHtml(audit.codigo_auditoria)}
                </span>
                ${
                  drawerVersionNum !== null
                    ? `<span class="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-300">v${drawerVersionNum}</span>`
                    : ''
                }
                ${
                  drawerOrgAbrev
                    ? `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-white text-slate-700 border border-slate-200">${escapeHtml(drawerOrgAbrev)}</span>`
                    : ''
                }
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusSummary.estatusBadgeClass}">
                  ${escapeHtml(statusSummary.estatus_auditoria)}
                </span>
              </div>
              <h3 id="calDrawerTitle" class="text-lg font-bold text-slate-900">
                ${escapeHtml(snapshot?.organizacionNombre || audit.organizacion_nombre)}
              </h3>
              <div class="text-xs font-mono text-slate-500">
                ${escapeHtml(audit.numero_certificado)} · ${escapeHtml(audit.norma_codigo)}
              </div>
            </div>

            <button
              type="button"
              id="closeCalDrawerBtn"
              aria-label="Cerrar panel de evento"
              class="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              ✕
            </button>
          </div>

          <!-- Contextual Scope -->
          ${
            drawerAlcanceEs
              ? `
                <div class="p-3.5 rounded-xl bg-indigo-50/40 border border-indigo-200/70 space-y-1">
                  <div class="text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                    Alcance Certificado
                  </div>
                  <div class="text-xs text-slate-800 leading-relaxed">
                    ${escapeHtml(drawerAlcanceEs)}
                  </div>
                </div>
              `
              : drawerMissingAlcance
              ? `
                <div class="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-between gap-2">
                  <span class="text-xs font-semibold text-rose-800">Sin Alcance activo en Certificación → Certificado → Alcance.</span>
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-white text-rose-800 border border-rose-200 shrink-0">Sin alcance</span>
                </div>
              `
              : ''
          }

          <!-- Primary Site Location Address -->
          <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
            <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Ubicación de Sede Principal
            </div>
            <div class="text-xs font-semibold text-slate-800 flex items-start gap-1.5">
              <span aria-hidden="true">📍</span>
              <span>${escapeHtml(audit.sede_principal_direccion)}</span>
            </div>
          </div>

          <!-- Modality & Schedule -->
          <div class="grid grid-cols-2 gap-3 text-xs">
            <div class="p-3 rounded-xl border border-slate-200 space-y-1">
              <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Modalidad</span>
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border ${mod.badgeClass}">
                <span aria-hidden="true">${mod.symbol}</span>
                <span>${escapeHtml(audit.tipo_auditoria)}</span>
              </span>
            </div>

            <div class="p-3 rounded-xl border border-slate-200 space-y-1">
              <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Metodología</span>
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border ${met.badgeClass}">
                <span aria-hidden="true">${met.symbol}</span>
                <span>${escapeHtml(audit.metodologia)}</span>
              </span>
            </div>

            <div class="col-span-2 p-3 rounded-xl border border-slate-200 space-y-1">
              <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Cronograma Planificado</span>
              <div class="font-mono font-bold text-slate-900 tabular-nums">
                ${escapeHtml(audit.fecha_inicio)} al ${escapeHtml(audit.fecha_fin)} (${audit.dias_auditor} día(s)-auditor)
              </div>
            </div>
          </div>

          <!-- Assigned Audit Team & Contact Coordinates -->
          <div class="space-y-2.5">
            <div class="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Equipo Auditor Asignado y Contacto (${audit.equipo.length})
            </div>
            <div class="space-y-2">
              ${audit.equipo
                .map(
                  (m) => `
                  <div class="p-3 rounded-xl border border-slate-200 bg-white space-y-1 text-xs">
                    <div class="flex items-center justify-between gap-2">
                      <span class="font-bold text-slate-900">${escapeHtml(m.nombre)}</span>
                      <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                        ${escapeHtml(m.rol)}
                      </span>
                    </div>
                    <div class="text-[11px] text-slate-500">
                      ${escapeHtml(m.competencia_norma)} · Credencial ${escapeHtml(m.credencial_codigo)}
                    </div>
                    <div class="text-[11px] text-slate-600 font-mono flex flex-wrap gap-3 pt-1">
                      ${m.email ? `<span>✉️ ${escapeHtml(m.email)}</span>` : ''}
                      ${m.telefono ? `<span>📞 ${escapeHtml(m.telefono)}</span>` : ''}
                    </div>
                  </div>
                `
                )
                .join('')}
            </div>
          </div>
        </div>

        <!-- Direct Action Footer -->
        <div class="p-5 border-t border-slate-200 bg-slate-50 space-y-2">
          <button
            type="button"
            data-action="jump-pipeline-stage"
            data-target-subview="resumen"
            data-program-id="${escapeHtml(audit.id_programa_auditoria || '')}"
            data-audit-id="${escapeHtml(audit.id)}"
            class="w-full py-2 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer text-center"
          >
            Ver Resumen de Auditoría →
          </button>
          <button
            type="button"
            data-action="jump-pipeline-stage"
            data-target-subview="${escapeHtml(operationalTargetSubview)}"
            data-program-id="${escapeHtml(audit.id_programa_auditoria || '')}"
            data-audit-id="${escapeHtml(audit.id)}"
            class="w-full py-2 px-4 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 text-xs font-bold transition-colors cursor-pointer text-center"
          >
            Ir a Etapa Activa (${escapeHtml(operationalTargetSubview)}) →
          </button>
          <button
            type="button"
            data-action="drawer-go-resultado"
            data-audit-id="${escapeHtml(audit.id)}"
            class="w-full py-2 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors cursor-pointer text-center"
          >
            Ver Resultados y Hallazgos →
          </button>
          <button
            type="button"
            data-action="open-changelog"
            data-table-name="auditoria"
            data-record-id="${escapeHtml(audit.id)}"
            data-entity-name="${escapeHtml(audit.codigo_auditoria)} · ${escapeHtml(audit.organizacion_nombre)}"
            class="w-full py-1.5 px-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors cursor-pointer text-center"
          >
            🕒 Historial de Cambios
          </button>
        </div>
      </div>
    </div>
  `;
}
