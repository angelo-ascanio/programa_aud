import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import type { ConglomeradoEntity } from '../lib/conglomeradoDomain';
import type { VinculoEntity } from '../lib/vinculoDomain';
import {
  formatAuditDateLabel,
  resolveLatestPlannedDate,
  roundAuditDaysQuarter,
  type AuditDateEntry,
  type AuditorSiteRole,
  type AuditoriaEquipoSitioItem,
  type AuditoriaSitioPlanItem,
  type ProgramaAuditoriaEntity,
} from '../lib/auditPlanningEngine';
import type { ProgramacionAuditEntity } from '../lib/auditExecution';
import type { AuditorDetailEntity } from '../lib/competencyMatrix';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import type {
  AuditoriaSitioTemporalEntity,
  TemporalSiteTeamAssignment,
} from '../lib/designacionTemporalDomain';
import {
  buildCampaignAsignacionRows,
  evaluateAuditorCompetencyMatch,
  type CampaignAsignacionRow,
  type SiteAssignmentReconciliation,
} from '../lib/asignacionDomain';
import {
  buildCertificateAuditHistoryDigest,
  detectAuditorScheduleConflicts,
  type AlertConfigEntity,
  type LeadAuditorRotationSummary,
  type ProgramAuditorScheduleConflict,
} from '../lib/auditAlertsEngine';
import {
  computeReactiveFacetCounts,
  filterRecordsWithFacets,
  sortItems,
  type ColumnDefinition,
  type MultiViewFacetCategory,
  type MultiViewSelectionMap,
  type SortDirection,
  type UniversalViewMode,
} from '../lib/universalTemplate';
import { renderUniversalTemplate } from './universalTemplate';
import { renderDetailPageTemplate } from './detailTemplate';
import {
  extractUniversalArchiveProps,
  type ArchiveMultiViewConfig,
} from '../lib/archiveGovernance';

export type AsignacionSortColumn = 'campania' | 'progreso' | 'estado';

export interface AsignacionViewState {
  query: string;
  viewMode: UniversalViewMode;
  isSidebarOpen: boolean;
  sortColumn: AsignacionSortColumn | null;
  sortDirection: SortDirection;
  facetSelections: MultiViewSelectionMap;
  selectedProgramId: string | null;
  draftTargetKind: 'REGULAR' | 'TEMPORAL';
  draftTargetId: string | null;
  draftAuditorId: string;
  draftRol: AuditorSiteRole;
  draftDays: string;
  editErrorMessage: string | null;
}

export interface AsignacionViewProps {
  profile: UserProfile;
  state: AsignacionViewState;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  temporalSites: ReadonlyArray<AuditoriaSitioTemporalEntity>;
  auditors: ReadonlyArray<AuditorDetailEntity>;
  certificados?: ReadonlyArray<CertificadoDetailEntity>;
  vinculos: ReadonlyArray<VinculoEntity>;
  conglomerados: ReadonlyArray<ConglomeradoEntity>;
  alertConfig?: AlertConfigEntity;
  referenceIsoDate?: string;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
}

export const DEFAULT_ASIGNACION_STATE: AsignacionViewState = {
  query: '',
  viewMode: 'list',
  isSidebarOpen: true,
  sortColumn: null,
  sortDirection: 'none',
  facetSelections: {},
  selectedProgramId: null,
  draftTargetKind: 'REGULAR',
  draftTargetId: null,
  draftAuditorId: '',
  draftRol: 'AUDITOR',
  draftDays: '1.00',
  editErrorMessage: null,
};

const ROLE_OPTIONS: ReadonlyArray<{ value: AuditorSiteRole; label: string }> = [
  { value: 'AUDITOR_LIDER', label: 'Auditor Líder' },
  { value: 'AUDITOR', label: 'Auditor' },
  { value: 'EXPERTO_TECNICO', label: 'Experto Técnico' },
  { value: 'AUDITOR_EN_ENTRENAMIENTO', label: 'Auditor en Entrenamiento' },
];

const ROLE_LABELS: Record<AuditorSiteRole, string> = {
  AUDITOR_LIDER: 'Auditor Líder',
  AUDITOR: 'Auditor',
  EXPERTO_TECNICO: 'Experto Técnico',
  AUDITOR_EN_ENTRENAMIENTO: 'Auditor en Entrenamiento',
};

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

interface AssignedAuditorSummary {
  auditorId: string;
  nombre: string;
  isLeader: boolean;
  totalDays: number;
}

interface EnrichedCampaignAsignacionRow extends CampaignAsignacionRow {
  scheduleConflicts: ProgramAuditorScheduleConflict[];
  hasScheduleConflict: boolean;
  rotationByAuditId: Map<string, LeadAuditorRotationSummary>;
  assignedSummaries: AssignedAuditorSummary[];
  hasExcessDiscrepancy: boolean;
  alertReasons: string[];
  balancedSitesCount: number;
}

function formatDateSummaryCompact(entry: AuditDateEntry | null): string {
  if (!entry) return 'Sin fecha planificada';
  if (entry.tipo_fecha === 'PREPROGRAMADA_MES' && entry.anio && entry.mes) {
    const mName = MONTHS_ES_SHORT[entry.mes - 1] || `M${entry.mes}`;
    return `${mName} ${entry.anio}`;
  }
  if (entry.fecha_inicio) {
    const start = entry.fecha_inicio.slice(0, 10).split('-').reverse().join('/');
    const end = entry.fecha_fin
      ? entry.fecha_fin.slice(0, 10).split('-').reverse().join('/')
      : start;
    return start === end ? start : `${start} – ${end}`;
  }
  return formatAuditDateLabel(entry);
}

function resolveProgramLatestPlannedDate(
  audits: ReadonlyArray<ProgramacionAuditEntity>
): AuditDateEntry | null {
  const active = audits.filter((a) => !a.deleted_at);
  const planned = active
    .map(
      (a) =>
        resolveLatestPlannedDate(a.fechas) ??
        (a.latestDate && !a.latestDate.deleted_at && a.latestDate.tipo_fecha !== 'REAL'
          ? a.latestDate
          : null)
    )
    .filter((d): d is AuditDateEntry => d !== null)
    .sort((a, b) => b.numero_secuencia - a.numero_secuencia);
  return planned[0] ?? null;
}

function getConglomeradoForProgram(
  program: ProgramaAuditoriaEntity,
  vinculos: ReadonlyArray<VinculoEntity>,
  conglomerados: ReadonlyArray<ConglomeradoEntity>
): { id: string | null; nombre: string } {
  const vinculo = program.id_vinculo
    ? vinculos.find((v) => !v.deleted_at && v.id === program.id_vinculo)
    : undefined;
  const congId = vinculo?.id_grupo_empresarial || program.id_grupo_empresarial || null;
  if (congId) {
    const cong = conglomerados.find((g) => !g.deleted_at && g.id === congId);
    if (cong) return { id: cong.id, nombre: cong.nombre };
  }
  return { id: null, nombre: 'Organización independiente' };
}

function computeProgressMetrics(assignedDays: number, requiredDays: number): {
  pct: number;
  widthPct: number;
  barClass: string;
  labelText: string;
  isBalanced: boolean;
  isExcess: boolean;
} {
  const safeReq = Math.max(0, roundAuditDaysQuarter(requiredDays));
  const safeAssigned = Math.max(0, roundAuditDaysQuarter(assignedDays));
  const rawPct = safeReq > 0 ? Math.round((safeAssigned / safeReq) * 100) : 0;
  const widthPct = Math.min(100, Math.max(0, rawPct));
  const delta = Math.round((safeAssigned - safeReq) * 100) / 100;
  const isBalanced = safeReq > 0 && Math.abs(delta) <= 0.001;
  const isExcess = delta > 0.001;

  let barClass = 'bg-slate-300';
  let detailPart = 'Sin requerimiento';
  if (isBalanced) {
    barClass = 'bg-emerald-600';
    detailPart = 'Completo ✓';
  } else if (isExcess) {
    barClass = 'bg-rose-600';
    detailPart = `Exceso +${delta.toFixed(2)} d`;
  } else if (safeReq > 0) {
    barClass = 'bg-amber-500';
    const remaining = Math.max(0, roundAuditDaysQuarter(safeReq - safeAssigned));
    detailPart = `Falta ${remaining.toFixed(2)} d`;
  }

  return {
    pct: rawPct,
    widthPct,
    barClass,
    labelText: `Asignado ${safeAssigned.toFixed(2)} d / Requerido ${safeReq.toFixed(2)} d (${rawPct}% · ${detailPart})`,
    isBalanced,
    isExcess,
  };
}

function enrichCampaignAsignacionRows(opts: {
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  temporalSites: ReadonlyArray<AuditoriaSitioTemporalEntity>;
  auditors: ReadonlyArray<AuditorDetailEntity>;
  certificados: ReadonlyArray<CertificadoDetailEntity>;
  alertConfig?: AlertConfigEntity;
  referenceIsoDate?: string;
}): EnrichedCampaignAsignacionRow[] {
  const { programs, temporalSites, auditors, certificados, alertConfig, referenceIsoDate } = opts;
  const baseRows = buildCampaignAsignacionRows(programs, temporalSites, referenceIsoDate);
  const allConflicts = detectAuditorScheduleConflicts(programs);
  const auditorById = new Map(auditors.map((a) => [a.id, a]));
  const certById = new Map(certificados.map((c) => [c.id, c]));
  const rotationThreshold = alertConfig?.ciclos_rotacion_auditor_lider ?? 3;

  return baseRows.map((row) => {
    const activeAudits = row.program.auditorias.filter((a) => !a.deleted_at);
    const activeAuditById = new Map(activeAudits.map((a) => [a.id, a]));
    const auditIds = new Set(activeAudits.map((a) => a.id));
    const campaignTemporals = temporalSites.filter(
      (t) => !t.deleted_at && auditIds.has(t.id_auditoria)
    );

    const scheduleConflicts = allConflicts.filter(
      (c) => c.program_a_id === row.program.id || c.program_b_id === row.program.id
    );
    const hasScheduleConflict = scheduleConflicts.length > 0;

    const rotationByAuditId = new Map<string, LeadAuditorRotationSummary>();
    let hasRotationWarning = false;
    let hasCompetencyWarning = false;

    const auditorMap = new Map<string, AssignedAuditorSummary>();
    const trackMember = (auditorId: string, nombre: string, rol: AuditorSiteRole, days: number): void => {
      const existing = auditorMap.get(auditorId);
      if (existing) {
        existing.totalDays = roundAuditDaysQuarter(existing.totalDays + days);
        if (rol === 'AUDITOR_LIDER') existing.isLeader = true;
      } else {
        auditorMap.set(auditorId, {
          auditorId,
          nombre: nombre || auditorById.get(auditorId)?.nombre || 'Auditor Calificado',
          isLeader: rol === 'AUDITOR_LIDER',
          totalDays: roundAuditDaysQuarter(days),
        });
      }
    };

    for (const audit of activeAudits) {
      const digest = buildCertificateAuditHistoryDigest(
        audit.id_certificado,
        audit.id,
        programs,
        null,
        rotationThreshold
      );
      rotationByAuditId.set(audit.id, digest.leadAuditorRotation);

      const cert = certById.get(audit.id_certificado);
      const subsectorCodigo = cert?.subsector_iaf_codigo ?? null;
      const assignedLeadIds = new Set<string>();

      for (const site of audit.sitiosPlan || []) {
        if (site.deleted_at) continue;
        for (const m of site.equipoSitio || []) {
          if (m.deleted_at) continue;
          trackMember(m.id_auditor, m.auditor_nombre, m.rol_auditor, m.tiempo_auditoria);
          if (m.rol_auditor === 'AUDITOR_LIDER') assignedLeadIds.add(m.id_auditor);
          const audObj = auditorById.get(m.id_auditor);
          if (audObj) {
            const match = evaluateAuditorCompetencyMatch(
              audObj,
              audit.norma_codigo,
              audit.sector_iaf,
              subsectorCodigo
            );
            if (match.level !== 'FULL') {
              hasCompetencyWarning = true;
            }
          }
        }
      }

      for (const temp of campaignTemporals) {
        const linkedToAudit =
          temp.id_auditoria === audit.id ||
          temp.certificados.some((cl) => !cl.deleted_at && cl.id_auditoria_certificado === audit.id);
        if (!linkedToAudit) continue;
        for (const m of temp.equipoTemporal || []) {
          if (m.deleted_at) continue;
          if (temp.id_auditoria === audit.id) {
            trackMember(m.id_auditor, m.auditor_nombre, m.rol_auditor, m.tiempo_auditoria);
          }
          if (m.rol_auditor === 'AUDITOR_LIDER') assignedLeadIds.add(m.id_auditor);
          const audObj = auditorById.get(m.id_auditor);
          if (audObj) {
            const targetAudit = activeAuditById.get(audit.id);
            if (targetAudit) {
              const match = evaluateAuditorCompetencyMatch(
                audObj,
                targetAudit.norma_codigo,
                targetAudit.sector_iaf,
                subsectorCodigo
              );
              if (match.level !== 'FULL') {
                hasCompetencyWarning = true;
              }
            }
          }
        }
      }

      if (digest.leadAuditorRotation.requiresRotation && digest.leadAuditorRotation.leadAuditorId) {
        const rotatedId = digest.leadAuditorRotation.leadAuditorId;
        if (
          assignedLeadIds.has(rotatedId) ||
          (assignedLeadIds.size === 0 && audit.auditor_lider_id === rotatedId)
        ) {
          hasRotationWarning = true;
        }
      }
    }

    const assignedSummaries = Array.from(auditorMap.values()).sort((a, b) => {
      if (a.isLeader !== b.isLeader) return a.isLeader ? -1 : 1;
      return b.totalDays - a.totalDays;
    });

    const hasExcessDiscrepancy = row.siteReconciliations.some((r) => r.deltaDays > 0.001);
    const balancedSitesCount = row.siteReconciliations.filter((r) => r.isBalanced).length;

    const alertReasons: string[] = [];
    if (hasScheduleConflict) {
      alertReasons.push(
        `${scheduleConflicts.length} conflicto${scheduleConflicts.length === 1 ? '' : 's'} de calendario`
      );
    }
    if (hasRotationWarning) {
      alertReasons.push('Alerta rotación de Auditor Líder ISO 17021-1');
    }
    if (hasCompetencyWarning) {
      alertReasons.push('Competencia parcial (norma/IAF/subsector)');
    }
    if (hasExcessDiscrepancy) {
      alertReasons.push('Exceso de días asignados en sitio');
    }

    return {
      ...row,
      hasCompetencyWarning,
      hasRotationWarning,
      scheduleConflicts,
      hasScheduleConflict,
      rotationByAuditId,
      assignedSummaries,
      hasExcessDiscrepancy,
      alertReasons,
      balancedSitesCount,
    };
  });
}

function getReconciliationBadge(row: EnrichedCampaignAsignacionRow): {
  label: string;
  cls: string;
} {
  if (row.statusKey === 'COMPLETO') {
    return {
      label: 'Completo ✓',
      cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    };
  }
  if (row.statusKey === 'SIN_ASIGNAR') {
    return {
      label: 'Sin asignar',
      cls: 'bg-slate-100 text-slate-700 border-slate-300',
    };
  }
  return {
    label: 'Descuadrado',
    cls: row.hasExcessDiscrepancy
      ? 'bg-rose-50 text-rose-800 border-rose-200'
      : 'bg-amber-50 text-amber-800 border-amber-200',
  };
}

export function renderAsignacionView(props: AsignacionViewProps): string {
  const {
    profile,
    state,
    programs,
    temporalSites,
    auditors,
    certificados = [],
    vinculos,
    conglomerados,
    alertConfig,
    referenceIsoDate,
    loading = false,
    archiveConfig,
    tableColumnWidths,
  } = props;

  const isStaff = isApprovedStaffProfile(profile);
  const allRows = enrichCampaignAsignacionRows({
    programs,
    temporalSites,
    auditors,
    certificados,
    alertConfig,
    referenceIsoDate,
  });

  if (state.selectedProgramId) {
    const selectedRow = allRows.find((r) => r.program.id === state.selectedProgramId);
    if (selectedRow) {
      return renderAsignacionDetailView({
        state,
        row: selectedRow,
        temporalSites,
        auditors,
        certificados,
        vinculos,
        conglomerados,
        isStaff,
      });
    }
  }

  const facetCategories: MultiViewFacetCategory<EnrichedCampaignAsignacionRow>[] = [
    {
      id: 'cuadre',
      label: 'Cuadre de Equipo',
      options: [
        { value: 'SIN_ASIGNAR', label: 'Sin asignar' },
        { value: 'DESCUADRADO', label: 'Descuadrado' },
        { value: 'COMPLETO', label: 'Completo' },
      ],
      extractValues: (r) => r.statusKey,
    },
    {
      id: 'alertas',
      label: 'Alertas',
      options: [
        { value: 'CONFLICTO_CALENDARIO', label: 'Con conflicto de calendario' },
        { value: 'ROTACION_LIDER', label: 'Alerta rotación Líder' },
        { value: 'COMPETENCIA_PARCIAL', label: 'Competencia parcial' },
      ],
      extractValues: (r) => {
        const vals: string[] = [];
        if (r.hasScheduleConflict) vals.push('CONFLICTO_CALENDARIO');
        if (r.hasRotationWarning) vals.push('ROTACION_LIDER');
        if (r.hasCompetencyWarning) vals.push('COMPETENCIA_PARCIAL');
        return vals;
      },
    },
    {
      id: 'urgencia',
      label: 'Urgencia',
      options: [
        { value: 'VENCIDA', label: 'Vencida' },
        { value: 'PROXIMA_30D', label: 'Próxima (≤30d)' },
        { value: 'ESTE_TRIMESTRE', label: 'Este Trimestre' },
        { value: 'ESTE_ANIO', label: 'Este Año' },
        { value: 'ANIO_MAS_1', label: 'Año +1' },
        { value: 'FUTURO_LEJANO', label: 'Futuro Lejano' },
        { value: 'SIN_FECHA', label: 'Sin fecha' },
      ],
      extractValues: (r) => r.urgency.bucket,
    },
  ];

  const searchOptions = {
    getSearchableText: (row: EnrichedCampaignAsignacionRow): string => {
      const cong = getConglomeradoForProgram(row.program, vinculos, conglomerados);
      const vinculo = row.program.id_vinculo
        ? vinculos.find((v) => v.id === row.program.id_vinculo)
        : undefined;
      const auditsMeta = row.program.auditorias
        .filter((a) => !a.deleted_at)
        .map((a) => `${a.numero_certificado} ${a.organizacion_nombre} ${a.norma_codigo} ${a.codigo_auditoria}`)
        .join(' ');
      const teamNames = row.assignedSummaries.map((m) => m.nombre).join(' ');
      const siteLabels = row.siteReconciliations.map((s) => s.label).join(' ');
      return [
        row.program.etiqueta,
        row.program.codigo_programa || '',
        row.program.tipo_vinculacion,
        vinculo?.etiqueta || '',
        vinculo?.codigo_vinculo || '',
        cong.nombre,
        row.urgency.label,
        auditsMeta,
        teamNames,
        siteLabels,
      ].join(' ');
    },
  };

  const facetGroups = computeReactiveFacetCounts(
    allRows,
    state.query,
    facetCategories,
    state.facetSelections,
    searchOptions
  );

  const filteredRows = filterRecordsWithFacets(
    allRows,
    state.query,
    facetCategories,
    state.facetSelections,
    searchOptions
  );

  const sortedRows = sortItems(
    filteredRows,
    state.sortColumn,
    state.sortDirection,
    (row, col) => {
      switch (col) {
        case 'campania':
          return row.program.etiqueta.toLowerCase();
        case 'progreso':
          return row.totalRequiredDays > 0
            ? row.totalAssignedDays / row.totalRequiredDays
            : 0;
        case 'estado':
          return row.statusKey === 'COMPLETO' ? 2 : row.statusKey === 'DESCUADRADO' ? 1 : 0;
        default:
          return row.statusKey === 'COMPLETO' ? 2 : row.statusKey === 'DESCUADRADO' ? 1 : 0;
      }
    }
  );

  const columns: ColumnDefinition<EnrichedCampaignAsignacionRow>[] = [
    {
      id: 'campania',
      header: 'Campaña / Vínculo',
      defaultWidthPct: 30,
      minWidthPx: 185,
      sortable: true,
      renderCell: (row) => {
        const activeAudits = row.program.auditorias.filter((a) => !a.deleted_at);
        const latestPlanned = resolveProgramLatestPlannedDate(activeAudits);
        const dateLabel = formatDateSummaryCompact(latestPlanned);
        const vinculo = row.program.id_vinculo
          ? vinculos.find((v) => v.id === row.program.id_vinculo)
          : undefined;
        const cong = getConglomeradoForProgram(row.program, vinculos, conglomerados);
        const subMeta = vinculo
          ? `${vinculo.codigo_vinculo ? `${vinculo.codigo_vinculo} · ` : ''}${dateLabel}`
          : `${row.program.tipo_vinculacion} · ${cong.nombre} · ${dateLabel}`;

        return `
          <div class="min-w-0 space-y-0.5">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="font-bold text-slate-900 truncate">${escapeHtml(row.program.etiqueta)}</span>
              ${
                row.program.codigo_programa
                  ? `<span class="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200 shrink-0">${escapeHtml(row.program.codigo_programa)}</span>`
                  : ''
              }
            </div>
            <div class="flex items-center gap-1.5 text-[11px] text-slate-500 min-w-0">
              <span class="truncate">${escapeHtml(subMeta)}</span>
              <span class="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold border shrink-0 ${row.urgency.badgeClass}">
                ${escapeHtml(row.urgency.label)}
              </span>
            </div>
          </div>
        `;
      },
    },
    {
      id: 'progreso',
      header: 'Cobertura Días',
      defaultWidthPct: 24,
      minWidthPx: 160,
      sortable: true,
      renderCell: (row) => {
        const metrics = computeProgressMetrics(row.totalAssignedDays, row.totalRequiredDays);
        return `
          <div class="min-w-0 space-y-1">
            <div class="flex items-center justify-between gap-1 text-[11px] font-mono tabular-nums">
              <span
                class="font-semibold text-slate-800 truncate"
                title="Asignado ${row.totalAssignedDays.toFixed(2)} d / Requerido ${row.totalRequiredDays.toFixed(2)} d"
              >
                ${row.totalAssignedDays.toFixed(2)}d / ${row.totalRequiredDays.toFixed(2)}d
              </span>
              <span class="font-bold ${
                metrics.isBalanced
                  ? 'text-emerald-700'
                  : metrics.isExcess
                  ? 'text-rose-700'
                  : 'text-slate-600'
              } shrink-0">${metrics.pct}%</span>
            </div>
            <div class="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
              <div class="h-full rounded-full ${metrics.barClass} transition-all" style="width: ${metrics.widthPct}%"></div>
            </div>
          </div>
        `;
      },
    },
    {
      id: 'equipo',
      header: 'Equipo Asignado',
      defaultWidthPct: 24,
      minWidthPx: 165,
      sortable: false,
      renderCell: (row) => {
        if (row.assignedSummaries.length === 0) {
          return `<span class="text-[11px] italic text-slate-400 truncate block">Sin auditores asignados</span>`;
        }
        const leaders = row.assignedSummaries.filter((m) => m.isLeader);
        const namesPreview = row.assignedSummaries
          .slice(0, 2)
          .map((m) => (m.isLeader ? `★ ${m.nombre}` : m.nombre))
          .join(', ');
        const extraCount = Math.max(0, row.assignedSummaries.length - 2);
        const summaryLine = extraCount > 0 ? `${namesPreview} +${extraCount}` : namesPreview;
        const leaderHint =
          leaders.length > 0
            ? `Líder: ${leaders.map((l) => l.nombre).join(', ')}`
            : `${row.balancedSitesCount}/${row.siteReconciliations.length} sitios cuadrados`;

        return `
          <div class="min-w-0 space-y-0.5" title="${escapeHtml(summaryLine)}">
            <div class="text-xs font-semibold text-slate-800 truncate">${escapeHtml(summaryLine)}</div>
            <div class="text-[10px] ${
              leaders.length > 0 ? 'text-indigo-700 font-semibold' : 'text-amber-700 font-medium'
            } truncate">
              ${escapeHtml(leaderHint)}
            </div>
          </div>
        `;
      },
    },
    {
      id: 'alertas',
      header: 'Competencia / Conflictos',
      defaultWidthPct: 10,
      minWidthPx: 95,
      sortable: false,
      renderCell: (row) => {
        const hasAlert = row.alertReasons.length > 0;
        const label = hasAlert ? '⚠ Alerta' : 'OK';
        const titleText = hasAlert ? row.alertReasons.join(' · ') : 'Sin alertas ni conflictos';
        const cls =
          row.hasScheduleConflict || row.hasExcessDiscrepancy
            ? 'bg-rose-50 text-rose-800 border-rose-200'
            : hasAlert
            ? 'bg-amber-50 text-amber-800 border-amber-200'
            : 'bg-emerald-50 text-emerald-800 border-emerald-200';
        return `<span title="${escapeHtml(titleText)}" class="inline-flex items-center max-w-full truncate px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${cls}">${escapeHtml(label)}</span>`;
      },
    },
    {
      id: 'estado',
      header: 'Conciliación',
      defaultWidthPct: 12,
      minWidthPx: 105,
      sortable: true,
      renderCell: (row) => {
        const badge = getReconciliationBadge(row);
        return `<span title="${escapeHtml(badge.label)}" class="inline-flex items-center max-w-full truncate px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${badge.cls}">${escapeHtml(badge.label)}</span>`;
      },
    },
  ];

  const renderCard = (row: EnrichedCampaignAsignacionRow): string => {
    const activeAudits = row.program.auditorias.filter((a) => !a.deleted_at);
    const latestPlanned = resolveProgramLatestPlannedDate(activeAudits);
    const dateLabel = formatDateSummaryCompact(latestPlanned);
    const badge = getReconciliationBadge(row);
    const metrics = computeProgressMetrics(row.totalAssignedDays, row.totalRequiredDays);
    const hasAlert = row.alertReasons.length > 0;

    return `
      <article
        role="button"
        tabindex="0"
        data-action="select-asignacion-program"
        data-program-id="${escapeHtml(row.program.id)}"
        aria-label="Gestionar asignación de equipo para ${escapeHtml(row.program.etiqueta)}"
        class="text-left bg-white border border-slate-200 hover:border-slate-400 rounded-xl p-3.5 shadow-2xs transition-all cursor-pointer space-y-2.5 flex flex-col justify-between"
      >
        <div class="space-y-2">
          <div class="flex items-center justify-between gap-2">
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${badge.cls}">
              ${escapeHtml(badge.label)}
            </span>
            <span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${
              hasAlert
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
            }">
              ${hasAlert ? '⚠ Alerta' : 'OK'}
            </span>
          </div>
          <h3 class="text-sm font-bold text-slate-900 line-clamp-2">${escapeHtml(row.program.etiqueta)}</h3>
          <div class="flex items-center gap-1.5 flex-wrap text-[11px] text-slate-500">
            <span>${escapeHtml(dateLabel)}</span>
            <span class="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold border ${row.urgency.badgeClass}">
              ${escapeHtml(row.urgency.label)}
            </span>
          </div>
          <div class="space-y-1">
            <div class="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-700">
              <span>${row.totalAssignedDays.toFixed(2)} d / ${row.totalRequiredDays.toFixed(2)} d</span>
              <span class="font-bold">${metrics.pct}%</span>
            </div>
            <div class="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
              <div class="h-full rounded-full ${metrics.barClass}" style="width: ${metrics.widthPct}%"></div>
            </div>
          </div>
        </div>
        <div class="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px]">
          <span class="text-slate-600 font-medium truncate">
            ${
              row.assignedSummaries.length > 0
                ? escapeHtml(row.assignedSummaries.map((m) => m.nombre).join(', '))
                : 'Sin equipo asignado'
            }
          </span>
          <span class="text-slate-500 font-semibold shrink-0 tabular-nums">
            ${row.balancedSitesCount}/${row.siteReconciliations.length} sitios
          </span>
        </div>
      </article>
    `;
  };

  const emptyStateActionsHtml = `
    <div class="flex flex-wrap items-center justify-center gap-2">
      <button
        type="button"
        data-nav="auditorias"
        data-subview="designacion/temporal"
        class="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
      >
        Paso 5: Temporal
      </button>
      <button
        type="button"
        data-nav="auditorias"
        data-subview="tiempo"
        class="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer inline-flex items-center gap-1.5"
      >
        <span>Ir a Paso 6: Tiempo</span>
        <span aria-hidden="true">→</span>
      </button>
    </div>
  `;

  const archiveProps = extractUniversalArchiveProps(archiveConfig, 'programacion');

  return renderUniversalTemplate<EnrichedCampaignAsignacionRow>({
    domainKey: 'asignacion',
    tableId: 'asignacion-main',
    title: 'Auditoría → Asignación de Equipo (0.25d)',
    subtitle:
      'Conciliación multi-auditor por sitio regular y sitio temporal con validación estricta de presupuesto, competencias ISO/IEC 17021-1, conflictos de agenda y rotación de Auditor Líder.',
    entityLabel: 'campañas listas para asignación',
    searchQuery: state.query,
    searchPlaceholder: 'Buscar por campaña, certificado, auditor, norma o sitio...',
    searchInputId: 'asignacionSearchInput',
    clearSearchBtnId: 'clearAsignacionSearchBtn',
    totalCount: allRows.length,
    filteredCount: sortedRows.length,
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen,
    sortState: { column: state.sortColumn, direction: state.sortDirection },
    columnWidths: tableColumnWidths?.['asignacion-main'],
    facetGroups,
    items: sortedRows,
    columns,
    getRowAttrs: (row) =>
      `data-action="select-asignacion-program" data-program-id="${escapeHtml(row.program.id)}" title="Gestionar asignación de equipo para ${escapeHtml(row.program.etiqueta)}"`,
    renderCard,
    loading,
    emptyStateTitle:
      allRows.length === 0
        ? 'No hay campañas con Paso 6 (Tiempo) completo'
        : 'No se encontraron campañas en Asignación',
    emptyStateMessage:
      allRows.length === 0
        ? 'Para habilitar Paso 7 (Asignación), defina primero el tiempo (>0.00 d) en todos los sitios regulares de Paso 6 y en los sitios temporales activos de Paso 5.'
        : 'Intente ajustar la búsqueda o restablecer los filtros de la barra lateral.',
    emptyStateActionHtml: allRows.length === 0 ? emptyStateActionsHtml : '',
    ...archiveProps,
  });
}

function renderAsignacionDetailView(opts: {
  state: AsignacionViewState;
  row: EnrichedCampaignAsignacionRow;
  temporalSites: ReadonlyArray<AuditoriaSitioTemporalEntity>;
  auditors: ReadonlyArray<AuditorDetailEntity>;
  certificados: ReadonlyArray<CertificadoDetailEntity>;
  vinculos: ReadonlyArray<VinculoEntity>;
  conglomerados: ReadonlyArray<ConglomeradoEntity>;
  isStaff: boolean;
}): string {
  const { state, row, temporalSites, auditors, certificados, vinculos, conglomerados, isStaff } =
    opts;
  const { program } = row;
  const activeAudits = program.auditorias.filter((a) => !a.deleted_at);
  const auditIds = new Set(activeAudits.map((a) => a.id));
  const auditById = new Map(activeAudits.map((a) => [a.id, a]));
  const auditorById = new Map(auditors.map((a) => [a.id, a]));
  const certById = new Map(certificados.map((c) => [c.id, c]));
  const campaignTemporals = temporalSites.filter(
    (t) => !t.deleted_at && auditIds.has(t.id_auditoria)
  );
  const hasTemporalSites =
    campaignTemporals.length > 0 || activeAudits.some((a) => a.tiene_sitio_temporal === true);

  const vinculo = program.id_vinculo
    ? vinculos.find((v) => !v.deleted_at && v.id === program.id_vinculo)
    : undefined;
  const cong = getConglomeradoForProgram(program, vinculos, conglomerados);

  const parents = [
    ...(cong.id
      ? [
          {
            label: 'Conglomerado',
            value: cong.nombre,
            symbol: '🏛️',
            navAction: {
              nav: 'certificacion',
              subview: 'conglomerados',
              entityType: 'conglomerado' as const,
              entityId: cong.id,
            },
          },
        ]
      : []),
    ...(vinculo
      ? [
          {
            label: 'Vínculo',
            value: `${vinculo.codigo_vinculo ? `${vinculo.codigo_vinculo} · ` : ''}${vinculo.etiqueta}`,
            symbol: '🔗',
            navAction: {
              nav: 'auditorias',
              subview: 'vinculo',
              entityType: 'vinculo' as const,
              entityId: vinculo.id,
            },
          },
        ]
      : []),
  ];

  const renderCrossStepLinks = (idPrefix: string): string => `
    <div class="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
      ${
        hasTemporalSites
          ? `
            <button
              type="button"
              id="${idPrefix}_step5"
              data-nav="auditorias"
              data-subview="designacion/temporal"
              data-parent-nav="true"
              data-parent-type="programa_auditoria"
              data-entity-id="${escapeHtml(program.id)}"
              class="px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-violet-50 text-slate-700 hover:text-violet-800 transition-colors cursor-pointer whitespace-nowrap"
            >
              ← Paso 5: Temporal
            </button>
          `
          : ''
      }
      <button
        type="button"
        id="${idPrefix}_step6"
        data-nav="auditorias"
        data-subview="tiempo"
        data-parent-nav="true"
        data-parent-type="programa_auditoria"
        data-entity-id="${escapeHtml(program.id)}"
        class="px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-indigo-50 text-slate-700 hover:text-indigo-800 transition-colors cursor-pointer whitespace-nowrap"
      >
        ← Paso 6: Tiempo
      </button>
      <span class="px-2.5 py-1 rounded-md bg-slate-900 text-white font-bold whitespace-nowrap">
        Paso 7 · Asignación (Activo)
      </span>
      <button
        type="button"
        id="${idPrefix}_step8"
        data-nav="auditorias"
        data-subview="programa"
        data-parent-nav="true"
        data-parent-type="programa_auditoria"
        data-entity-id="${escapeHtml(program.id)}"
        class="px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-indigo-50 text-slate-700 hover:text-indigo-800 transition-colors cursor-pointer whitespace-nowrap"
      >
        Paso 8: Programa →
      </button>
    </div>
  `;

  const parentMetaHtml = `
    <div class="flex flex-wrap items-center justify-between gap-2 w-full bg-slate-50/80 border border-slate-200 rounded-xl px-3 py-2">
      ${renderCrossStepLinks('step7TopNav')}
      <span class="text-[11px] font-semibold text-slate-500 tabular-nums whitespace-nowrap">
        ${row.balancedSitesCount}/${row.siteReconciliations.length} sitios cuadrados · ${row.totalAssignedDays.toFixed(2)}/${row.totalRequiredDays.toFixed(2)} d
      </span>
    </div>
  `;

  const feedbackHtml = state.editErrorMessage
    ? `
      <div role="alert" data-testid="asignacion-error-banner" class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800 flex items-center gap-2">
        <span aria-hidden="true">⚠️</span>
        <span>${escapeHtml(state.editErrorMessage)}</span>
      </div>
    `
    : '';

  const globalMetrics = computeProgressMetrics(row.totalAssignedDays, row.totalRequiredDays);
  const campaignBadge = getReconciliationBadge(row);

  const summaryBannerHtml = `
    <section
      data-testid="asignacion-summary-banner"
      class="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 via-white to-emerald-50/30 p-4 shadow-2xs space-y-3"
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2 text-xs sm:text-sm tabular-nums">
          <div class="px-3 py-1.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
            <span class="text-slate-500 font-medium">Requerido Campaña:</span>
            <strong class="font-mono text-slate-900 ml-1">${row.totalRequiredDays.toFixed(2)} d</strong>
          </div>
          <div class="px-3 py-1.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
            <span class="text-slate-500 font-medium">Asignado Equipo:</span>
            <strong class="font-mono text-slate-900 ml-1">${row.totalAssignedDays.toFixed(2)} d</strong>
          </div>
          <div class="px-3 py-1.5 rounded-xl bg-slate-900 text-white shadow-2xs">
            <span class="text-slate-300 font-medium">Sitios Cuadrados:</span>
            <strong class="font-mono font-bold ml-1">${row.balancedSitesCount}/${row.siteReconciliations.length}</strong>
          </div>
        </div>

        <div class="flex items-center gap-2">
          ${
            !isStaff
              ? '<span data-testid="asignacion-readonly-badge" class="px-2.5 py-1 rounded-md bg-slate-200 text-slate-700 text-[11px] font-bold whitespace-nowrap">Solo lectura</span>'
              : ''
          }
          <span class="px-2.5 py-1 rounded-full text-[11px] font-bold border ${campaignBadge.cls} whitespace-nowrap">
            ${escapeHtml(campaignBadge.label)}
          </span>
        </div>
      </div>

      <div class="space-y-1">
        <div class="flex items-center justify-between gap-2 text-xs font-mono font-semibold text-slate-700 tabular-nums">
          <span>${escapeHtml(globalMetrics.labelText)}</span>
        </div>
        <div class="w-full h-2.5 rounded-full bg-slate-200 overflow-hidden">
          <div class="h-full rounded-full ${globalMetrics.barClass} transition-all" style="width: ${globalMetrics.widthPct}%"></div>
        </div>
      </div>

      ${
        row.scheduleConflicts.length > 0
          ? `
            <div data-testid="asignacion-schedule-conflicts" class="rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2 space-y-1">
              <div class="text-[11px] font-bold text-rose-900">
                ⚠️ Conflictos de calendario entre programas (${row.scheduleConflicts.length})
              </div>
              <ul class="space-y-0.5 text-[11px] text-rose-800 list-disc pl-4">
                ${row.scheduleConflicts
                  .map((c) => `<li>${escapeHtml(c.message)}</li>`)
                  .join('')}
              </ul>
            </div>
          `
          : ''
      }
    </section>
  `;

  const renderInlineQuickAddForm = (optsForm: {
    targetKind: 'REGULAR' | 'TEMPORAL';
    targetId: string;
    auditId: string;
    targetLabel: string;
    remainingDays: number;
    normaCodigo: string;
    sectorIaf: number;
    subsectorCodigo: string | null;
    assignedAuditorIds: ReadonlySet<string>;
  }): string => {
    const isFormOpen =
      state.draftTargetKind === optsForm.targetKind && state.draftTargetId === optsForm.targetId;
    if (!isStaff) return '';

    if (!isFormOpen) {
      const prefillDays = Math.max(0.25, roundAuditDaysQuarter(optsForm.remainingDays)).toFixed(2);
      return `
        <div class="pt-1">
          <button
            type="button"
            data-action="open-asignacion-add-form"
            data-target-kind="${optsForm.targetKind}"
            data-target-id="${escapeHtml(optsForm.targetId)}"
            data-remaining-days="${prefillDays}"
            aria-label="Añadir auditor a ${escapeHtml(optsForm.targetLabel)}"
            class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold shadow-2xs transition-colors cursor-pointer inline-flex items-center gap-1"
          >
            <span aria-hidden="true">+</span>
            <span>Añadir auditor</span>
          </button>
        </div>
      `;
    }

    const activeAuditors = [...auditors];
    const defaultAuditorId =
      state.draftAuditorId && activeAuditors.some((a) => a.id === state.draftAuditorId)
        ? state.draftAuditorId
        : activeAuditors.find((a) => !optsForm.assignedAuditorIds.has(a.id))?.id ||
          activeAuditors[0]?.id ||
          '';

    return `
      <div
        data-testid="asignacion-inline-form"
        data-target-kind="${optsForm.targetKind}"
        data-target-id="${escapeHtml(optsForm.targetId)}"
        class="mt-2 rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 space-y-2.5"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-bold text-indigo-950">
            Asignar / Actualizar Auditor en ${escapeHtml(optsForm.targetLabel)}
          </span>
          <button
            type="button"
            data-action="cancel-asignacion-add-form"
            class="text-[11px] font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            Cancelar
          </button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
          <div class="sm:col-span-5">
            <label for="asignacionAuditorSelect_${escapeHtml(optsForm.targetId)}" class="block text-[11px] font-semibold text-slate-700 mb-1">
              Auditor
            </label>
            <select
              id="asignacionAuditorSelect_${escapeHtml(optsForm.targetId)}"
              data-action="change-asignacion-draft-field"
              data-field="auditorId"
              aria-label="Seleccionar auditor para ${escapeHtml(optsForm.targetLabel)}"
              class="w-full h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
            >
              ${
                activeAuditors.length === 0
                  ? '<option value="">Sin auditores disponibles</option>'
                  : activeAuditors
                      .map((aud) => {
                        const match = evaluateAuditorCompetencyMatch(
                          aud,
                          optsForm.normaCodigo,
                          optsForm.sectorIaf,
                          optsForm.subsectorCodigo
                        );
                        const hint = match.level === 'FULL' ? '✓ Calificado' : match.label;
                        const selected = aud.id === defaultAuditorId ? 'selected' : '';
                        return `<option value="${escapeHtml(aud.id)}" ${selected}>${escapeHtml(aud.nombre)} — ${escapeHtml(hint)}</option>`;
                      })
                      .join('')
              }
            </select>
          </div>

          <div class="sm:col-span-4">
            <label for="asignacionRolSelect_${escapeHtml(optsForm.targetId)}" class="block text-[11px] font-semibold text-slate-700 mb-1">
              Rol en sitio
            </label>
            <select
              id="asignacionRolSelect_${escapeHtml(optsForm.targetId)}"
              data-action="change-asignacion-draft-field"
              data-field="rol"
              aria-label="Rol del auditor en ${escapeHtml(optsForm.targetLabel)}"
              class="w-full h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
            >
              ${ROLE_OPTIONS.map(
                (r) =>
                  `<option value="${r.value}" ${state.draftRol === r.value ? 'selected' : ''}>${escapeHtml(r.label)}</option>`
              ).join('')}
            </select>
          </div>

          <div class="sm:col-span-3">
            <label for="asignacionDaysInput_${escapeHtml(optsForm.targetId)}" class="block text-[11px] font-semibold text-slate-700 mb-1">
              Jornadas (0.25d)
            </label>
            <input
              id="asignacionDaysInput_${escapeHtml(optsForm.targetId)}"
              type="number"
              min="0.25"
              step="0.25"
              data-action="change-asignacion-draft-field"
              data-field="days"
              aria-label="Días-auditor a asignar en ${escapeHtml(optsForm.targetLabel)}"
              value="${escapeHtml(state.draftDays)}"
              class="w-full h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs font-mono font-bold text-slate-900 tabular-nums focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            data-action="submit-asignacion-auditor"
            data-target-kind="${optsForm.targetKind}"
            data-target-id="${escapeHtml(optsForm.targetId)}"
            data-audit-id="${escapeHtml(optsForm.auditId)}"
            data-required-days="${Math.max(0, optsForm.remainingDays).toFixed(2)}"
            ${activeAuditors.length === 0 ? 'disabled' : ''}
            class="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer disabled:opacity-40"
          >
            Guardar asignación
          </button>
        </div>
      </div>
    `;
  };

  const renderMemberRow = (memberOpts: {
    targetKind: 'REGULAR' | 'TEMPORAL';
    targetId: string;
    auditId: string;
    targetLabel: string;
    assignmentId: string;
    auditorId: string;
    auditorNombre: string;
    rol: AuditorSiteRole;
    days: number;
    wholeSite: boolean;
    normaCodigo: string;
    sectorIaf: number;
    subsectorCodigo: string | null;
    rotationSummary?: LeadAuditorRotationSummary;
  }): string => {
    const audDetail = auditorById.get(memberOpts.auditorId);
    const competency = audDetail
      ? evaluateAuditorCompetencyMatch(
          audDetail,
          memberOpts.normaCodigo,
          memberOpts.sectorIaf,
          memberOpts.subsectorCodigo
        )
      : {
          level: 'PARTIAL' as const,
          label: 'ℹ️ Perfil no cargado',
          badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
        };

    const auditorConflicts = row.scheduleConflicts.filter(
      (c) => c.id_auditor === memberOpts.auditorId
    );
    const hasRotationAlert = Boolean(
      memberOpts.rol === 'AUDITOR_LIDER' &&
        memberOpts.rotationSummary?.requiresRotation &&
        memberOpts.rotationSummary.leadAuditorId === memberOpts.auditorId
    );

    const roleCls =
      memberOpts.rol === 'AUDITOR_LIDER'
        ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
        : memberOpts.rol === 'EXPERTO_TECNICO'
        ? 'bg-violet-50 text-violet-800 border-violet-200'
        : 'bg-slate-100 text-slate-700 border-slate-200';

    return `
      <div
        data-testid="asignacion-member-row"
        data-assignment-id="${escapeHtml(memberOpts.assignmentId)}"
        class="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2"
      >
        <div class="min-w-0 space-y-1 flex-1">
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="text-xs font-bold text-slate-900">
              ${escapeHtml(memberOpts.auditorNombre || audDetail?.nombre || 'Auditor Calificado')}
            </span>
            <span class="px-1.5 py-0.2 rounded text-[10px] font-bold border ${roleCls} whitespace-nowrap">
              ${escapeHtml(ROLE_LABELS[memberOpts.rol] || memberOpts.rol)}
            </span>
            <span class="px-1.5 py-0.2 rounded text-[10px] font-semibold border ${competency.badgeClass} whitespace-nowrap">
              ${escapeHtml(competency.label)}
            </span>
            ${
              auditorConflicts.length > 0
                ? `<span title="${escapeHtml(auditorConflicts.map((c) => c.message).join(' | '))}" class="px-1.5 py-0.2 rounded text-[10px] font-bold border bg-rose-50 text-rose-800 border-rose-200 whitespace-nowrap">⚠ Conflicto calendario</span>`
                : ''
            }
            ${
              hasRotationAlert
                ? `<span title="${escapeHtml(memberOpts.rotationSummary?.warningMessage || '')}" class="px-1.5 py-0.2 rounded text-[10px] font-bold border bg-amber-50 text-amber-800 border-amber-200 whitespace-nowrap">⚠ Rotación Líder ISO 17021-1</span>`
                : ''
            }
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-1.5 shrink-0 tabular-nums">
          ${
            isStaff
              ? `
                <button
                  type="button"
                  data-action="step-asignacion-auditor-days"
                  data-target-kind="${memberOpts.targetKind}"
                  data-target-id="${escapeHtml(memberOpts.targetId)}"
                  data-audit-id="${escapeHtml(memberOpts.auditId)}"
                  data-auditor-id="${escapeHtml(memberOpts.auditorId)}"
                  data-rol="${memberOpts.rol}"
                  data-whole-site="${memberOpts.wholeSite ? 'true' : 'false'}"
                  data-current-days="${memberOpts.days.toFixed(2)}"
                  data-delta="-0.25"
                  ${memberOpts.days <= 0.25 ? 'disabled' : ''}
                  aria-label="Restar 0.25 días a ${escapeHtml(memberOpts.auditorNombre)} en ${escapeHtml(memberOpts.targetLabel)}"
                  class="h-7 px-2 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-bold text-slate-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  -0.25
                </button>
                <span class="font-mono text-xs font-bold text-slate-900 px-2 py-0.5 rounded bg-white border border-slate-200 min-w-[60px] text-center">
                  ${memberOpts.days.toFixed(2)} d
                </span>
                <button
                  type="button"
                  data-action="step-asignacion-auditor-days"
                  data-target-kind="${memberOpts.targetKind}"
                  data-target-id="${escapeHtml(memberOpts.targetId)}"
                  data-audit-id="${escapeHtml(memberOpts.auditId)}"
                  data-auditor-id="${escapeHtml(memberOpts.auditorId)}"
                  data-rol="${memberOpts.rol}"
                  data-whole-site="${memberOpts.wholeSite ? 'true' : 'false'}"
                  data-current-days="${memberOpts.days.toFixed(2)}"
                  data-delta="0.25"
                  aria-label="Sumar 0.25 días a ${escapeHtml(memberOpts.auditorNombre)} en ${escapeHtml(memberOpts.targetLabel)}"
                  class="h-7 px-2 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-bold text-slate-700 cursor-pointer"
                >
                  +0.25
                </button>
                <button
                  type="button"
                  data-action="remove-asignacion-auditor"
                  data-target-kind="${memberOpts.targetKind}"
                  data-assignment-id="${escapeHtml(memberOpts.assignmentId)}"
                  data-target-id="${escapeHtml(memberOpts.targetId)}"
                  data-audit-id="${escapeHtml(memberOpts.auditId)}"
                  aria-label="Retirar a ${escapeHtml(memberOpts.auditorNombre)} de ${escapeHtml(memberOpts.targetLabel)}"
                  class="h-7 px-2 rounded-md border border-rose-200 bg-rose-50 hover:bg-rose-100 text-[11px] font-semibold text-rose-700 cursor-pointer ml-1"
                >
                  Quitar
                </button>
              `
              : `
                <span class="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-900 text-white">
                  ${memberOpts.days.toFixed(2)} d
                </span>
              `
          }
        </div>
      </div>
    `;
  };

  const renderRegularSiteCard = (
    audit: ProgramacionAuditEntity,
    site: AuditoriaSitioPlanItem,
    reconciliation: SiteAssignmentReconciliation | undefined,
    subsectorCodigo: string | null,
    rotationSummary: LeadAuditorRotationSummary | undefined
  ): string => {
    const isHq = site.numero_sitio === 0;
    const activeTeam: AuditoriaEquipoSitioItem[] = (site.equipoSitio || []).filter(
      (m) => !m.deleted_at
    );
    const assignedDays = reconciliation
      ? reconciliation.assignedDays
      : roundAuditDaysQuarter(activeTeam.reduce((sum, m) => sum + m.tiempo_auditoria, 0));
    const requiredDays = reconciliation
      ? reconciliation.requiredDays
      : roundAuditDaysQuarter(site.tiempo_auditoria);
    const metrics = computeProgressMetrics(assignedDays, requiredDays);
    const remainingDays = Math.max(0, roundAuditDaysQuarter(requiredDays - assignedDays));
    const assignedAuditorIds = new Set(activeTeam.map((m) => m.id_auditor));
    const siteLabel = `${isHq ? 'Sitio 0 · HQ' : `Sitio ${site.numero_sitio}`} (${site.nombre_sitio})`;

    return `
      <article
        data-testid="asignacion-site-card"
        data-site-plan-id="${escapeHtml(site.id)}"
        class="rounded-xl border ${
          metrics.isBalanced
            ? 'border-emerald-200 bg-white'
            : metrics.isExcess
            ? 'border-rose-200 bg-rose-50/20'
            : 'border-slate-200 bg-white'
        } p-3.5 space-y-2.5"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="min-w-0 flex flex-wrap items-center gap-1.5">
            <span class="px-1.5 py-0.2 rounded text-[10px] font-bold border ${
              isHq
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-slate-100 text-slate-700 border-slate-200'
            } whitespace-nowrap">
              ${isHq ? 'Sitio 0 · HQ' : `Sitio #${site.numero_sitio}`}
            </span>
            <h4 class="text-xs font-bold text-slate-900 truncate">${escapeHtml(site.nombre_sitio)}</h4>
            <span class="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
              ${escapeHtml(site.modalidad_evaluacion || 'Presencial')}
            </span>
          </div>

          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${
            metrics.isBalanced
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : metrics.isExcess
              ? 'bg-rose-50 text-rose-800 border-rose-200'
              : activeTeam.length === 0
              ? 'bg-slate-100 text-slate-700 border-slate-200'
              : 'bg-amber-50 text-amber-800 border-amber-200'
          } whitespace-nowrap">
            ${
              metrics.isBalanced
                ? 'Cuadrado 100% ✓'
                : metrics.isExcess
                ? 'Exceso'
                : activeTeam.length === 0
                ? 'Sin asignar'
                : 'Descuadrado'
            }
          </span>
        </div>

        <div class="space-y-1">
          <div class="text-[11px] font-mono font-semibold text-slate-700 tabular-nums">
            ${escapeHtml(metrics.labelText)}
          </div>
          <div class="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
            <div class="h-full rounded-full ${metrics.barClass} transition-all" style="width: ${metrics.widthPct}%"></div>
          </div>
        </div>

        <div class="space-y-1.5">
          ${
            activeTeam.length === 0
              ? `<p class="text-[11px] italic text-slate-500">Aún no hay auditores asignados a este sitio.</p>`
              : activeTeam
                  .map((m) =>
                    renderMemberRow({
                      targetKind: 'REGULAR',
                      targetId: site.id,
                      auditId: audit.id,
                      targetLabel: siteLabel,
                      assignmentId: m.id,
                      auditorId: m.id_auditor,
                      auditorNombre: m.auditor_nombre,
                      rol: m.rol_auditor,
                      days: m.tiempo_auditoria,
                      wholeSite: m.asignacion_completa_sitio,
                      normaCodigo: audit.norma_codigo,
                      sectorIaf: audit.sector_iaf,
                      subsectorCodigo,
                      rotationSummary,
                    })
                  )
                  .join('')
          }
        </div>

        ${renderInlineQuickAddForm({
          targetKind: 'REGULAR',
          targetId: site.id,
          auditId: audit.id,
          targetLabel: siteLabel,
          remainingDays: remainingDays > 0 ? remainingDays : requiredDays,
          normaCodigo: audit.norma_codigo,
          sectorIaf: audit.sector_iaf,
          subsectorCodigo,
          assignedAuditorIds,
        })}
      </article>
    `;
  };

  const renderCertificateSection = (audit: ProgramacionAuditEntity): string => {
    const orderedSites = (audit.sitiosPlan || [])
      .filter((s) => !s.deleted_at)
      .slice()
      .sort((a, b) => a.numero_sitio - b.numero_sitio);
    const cert = certById.get(audit.id_certificado);
    const subsectorCodigo = cert?.subsector_iaf_codigo ?? null;
    const rotation = row.rotationByAuditId.get(audit.id);

    return `
      <section
        data-testid="asignacion-cert-section"
        data-audit-id="${escapeHtml(audit.id)}"
        class="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden"
      >
        <header class="bg-slate-50/90 border-b border-slate-200 px-3.5 py-3 space-y-1.5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-1.5 min-w-0">
              <span class="text-xs font-bold text-slate-900 truncate">${escapeHtml(
                audit.organizacion_nombre
              )}</span>
              <span class="font-mono text-[11px] font-bold px-1.5 py-0.2 rounded bg-white text-slate-800 border border-slate-300 whitespace-nowrap">
                ${escapeHtml(audit.numero_certificado)}
              </span>
              <span class="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-200/70 text-slate-700 whitespace-nowrap">
                ${escapeHtml(audit.norma_codigo)} · IAF ${audit.sector_iaf}${
                  subsectorCodigo ? ` (${escapeHtml(subsectorCodigo)})` : ''
                }
              </span>
              <span class="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200 whitespace-nowrap">
                ${escapeHtml(audit.codigo_auditoria)} · ${escapeHtml(audit.tipo_auditoria)}
              </span>
            </div>
            <span class="text-[11px] font-semibold text-slate-600 tabular-nums whitespace-nowrap">
              ${orderedSites.length} sitio${orderedSites.length === 1 ? '' : 's'}
            </span>
          </div>

          ${
            rotation?.requiresRotation && rotation.warningMessage
              ? `
                <div class="rounded-lg border border-amber-200 bg-amber-50/90 px-2.5 py-1.5 text-[11px] font-medium text-amber-900">
                  ⚠️ ${escapeHtml(rotation.warningMessage)}
                </div>
              `
              : ''
          }
        </header>

        <div class="p-3 sm:p-3.5 space-y-3">
          ${orderedSites
            .map((site) => {
              const rec = row.siteReconciliations.find(
                (r) => r.kind === 'REGULAR' && r.targetId === site.id
              );
              return renderRegularSiteCard(audit, site, rec, subsectorCodigo, rotation);
            })
            .join('')}
        </div>
      </section>
    `;
  };

  const renderTemporalSection = (): string => {
    if (campaignTemporals.length === 0) return '';

    return `
      <section
        data-testid="asignacion-temporal-section"
        class="rounded-2xl border border-violet-200 bg-violet-50/30 shadow-2xs overflow-hidden"
      >
        <header class="bg-violet-50/90 border-b border-violet-200 px-3.5 py-3 flex flex-wrap items-center justify-between gap-2">
          <div class="space-y-0.5">
            <h3 class="text-xs font-bold text-violet-950 uppercase tracking-wide flex items-center gap-1.5">
              <span aria-hidden="true">⏱️</span>
              <span>Sitios Temporales Activos (Paso 5)</span>
            </h3>
            <p class="text-[11px] text-violet-800">
              Conciliación independiente por sitio temporal sin doble conteo entre certificados vinculados.
            </p>
          </div>
          <span class="px-2 py-0.5 rounded-full bg-white border border-violet-200 text-[11px] font-bold text-violet-900 tabular-nums">
            ${campaignTemporals.length} temporal${campaignTemporals.length === 1 ? '' : 'es'}
          </span>
        </header>

        <div class="p-3 sm:p-3.5 space-y-3">
          ${campaignTemporals
            .map((temp) => {
              const rec = row.siteReconciliations.find(
                (r) => r.kind === 'TEMPORAL' && r.targetId === temp.id
              );
              const activeTeam: TemporalSiteTeamAssignment[] = (
                temp.equipoTemporal || []
              ).filter((m) => !m.deleted_at);
              const assignedDays = rec
                ? rec.assignedDays
                : roundAuditDaysQuarter(activeTeam.reduce((sum, m) => sum + m.tiempo_auditoria, 0));
              const requiredDays = rec
                ? rec.requiredDays
                : roundAuditDaysQuarter(temp.tiempo_auditoria);
              const metrics = computeProgressMetrics(assignedDays, requiredDays);
              const remainingDays = Math.max(0, roundAuditDaysQuarter(requiredDays - assignedDays));
              const anchorAudit = auditById.get(temp.id_auditoria) || activeAudits[0];
              const cert = anchorAudit ? certById.get(anchorAudit.id_certificado) : undefined;
              const subsectorCodigo = cert?.subsector_iaf_codigo ?? null;
              const rotation = anchorAudit ? row.rotationByAuditId.get(anchorAudit.id) : undefined;
              const assignedAuditorIds = new Set(activeTeam.map((m) => m.id_auditor));
              const activeCertLinks = temp.certificados.filter((cl) => !cl.deleted_at);
              const tempLabel = `Sitio Temporal (${temp.etiqueta})`;

              return `
                <article
                  data-testid="asignacion-temporal-card"
                  data-temporal-site-id="${escapeHtml(temp.id)}"
                  class="rounded-xl border ${
                    metrics.isBalanced
                      ? 'border-emerald-200 bg-white'
                      : metrics.isExcess
                      ? 'border-rose-200 bg-rose-50/20'
                      : 'border-violet-200 bg-white'
                  } p-3.5 space-y-2.5"
                >
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="flex flex-wrap items-center gap-1.5 min-w-0">
                      <span class="px-1.5 py-0.2 rounded text-[10px] font-bold bg-violet-100 text-violet-900 border border-violet-200 whitespace-nowrap">
                        ⏱️ Temporal
                      </span>
                      <h4 class="text-xs font-bold text-slate-900 truncate">${escapeHtml(temp.etiqueta)}</h4>
                      ${activeCertLinks
                        .map(
                          (cl) =>
                            `<span class="font-mono text-[10px] font-semibold px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">${escapeHtml(cl.numero_certificado)}</span>`
                        )
                        .join('')}
                    </div>

                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      metrics.isBalanced
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : metrics.isExcess
                        ? 'bg-rose-50 text-rose-800 border-rose-200'
                        : activeTeam.length === 0
                        ? 'bg-slate-100 text-slate-700 border-slate-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    } whitespace-nowrap">
                      ${
                        metrics.isBalanced
                          ? 'Cuadrado 100% ✓'
                          : metrics.isExcess
                          ? 'Exceso'
                          : activeTeam.length === 0
                          ? 'Sin asignar'
                          : 'Descuadrado'
                      }
                    </span>
                  </div>

                  <div class="space-y-1">
                    <div class="text-[11px] font-mono font-semibold text-slate-700 tabular-nums">
                      ${escapeHtml(metrics.labelText)}
                    </div>
                    <div class="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                      <div class="h-full rounded-full ${metrics.barClass} transition-all" style="width: ${metrics.widthPct}%"></div>
                    </div>
                  </div>

                  <div class="space-y-1.5">
                    ${
                      activeTeam.length === 0
                        ? `<p class="text-[11px] italic text-slate-500">Aún no hay auditores asignados a este sitio temporal.</p>`
                        : activeTeam
                            .map((m) =>
                              renderMemberRow({
                                targetKind: 'TEMPORAL',
                                targetId: temp.id,
                                auditId: temp.id_auditoria,
                                targetLabel: tempLabel,
                                assignmentId: m.id,
                                auditorId: m.id_auditor,
                                auditorNombre: m.auditor_nombre,
                                rol: m.rol_auditor,
                                days: m.tiempo_auditoria,
                                wholeSite: true,
                                normaCodigo: anchorAudit?.norma_codigo || 'ISO',
                                sectorIaf: anchorAudit?.sector_iaf ?? 0,
                                subsectorCodigo,
                                rotationSummary: rotation,
                              })
                            )
                            .join('')
                    }
                  </div>

                  ${renderInlineQuickAddForm({
                    targetKind: 'TEMPORAL',
                    targetId: temp.id,
                    auditId: temp.id_auditoria,
                    targetLabel: tempLabel,
                    remainingDays: remainingDays > 0 ? remainingDays : requiredDays,
                    normaCodigo: anchorAudit?.norma_codigo || 'ISO',
                    sectorIaf: anchorAudit?.sector_iaf ?? 0,
                    subsectorCodigo,
                    assignedAuditorIds,
                  })}
                </article>
              `;
            })
            .join('')}
        </div>
      </section>
    `;
  };

  const customRecordBodyHtml = `
    <div class="space-y-4">
      ${summaryBannerHtml}
      <div class="space-y-3">
        ${activeAudits.map((audit) => renderCertificateSection(audit)).join('')}
      </div>
      ${renderTemporalSection()}

      <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
        <span class="text-[11px] text-slate-500">
          Al cuadrar al 100% los sitios regulares y temporales, continúe hacia Programa / Muestreo y Fechas Reales.
        </span>
        <div class="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
          <button
            type="button"
            id="step7BottomNav_step6"
            data-nav="auditorias"
            data-subview="tiempo"
            data-parent-nav="true"
            data-parent-type="programa_auditoria"
            data-entity-id="${escapeHtml(program.id)}"
            class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 transition-colors cursor-pointer whitespace-nowrap"
          >
            ← Ajustar en Paso 6: Tiempo
          </button>
          <button
            type="button"
            id="step7BottomNav_step8"
            data-nav="auditorias"
            data-subview="programa"
            data-parent-nav="true"
            data-parent-type="programa_auditoria"
            data-entity-id="${escapeHtml(program.id)}"
            class="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white transition-colors cursor-pointer whitespace-nowrap"
          >
            Ir a Paso 8: Programa →
          </button>
        </div>
      </div>
    </div>
  `;

  return renderDetailPageTemplate({
    entityType: 'Auditoría → Asignación',
    entitySymbol: '👥',
    title: program.etiqueta,
    eyebrowCode: program.codigo_programa || undefined,
    subtitle: `${program.tipo_vinculacion} · ${activeAudits.length} certificado${
      activeAudits.length === 1 ? '' : 's'
    } · ${row.totalAssignedDays.toFixed(2)}/${row.totalRequiredDays.toFixed(2)} d asignados`,
    statusBadge: {
      label: campaignBadge.label,
      badgeClass: campaignBadge.cls,
    },
    backButton: {
      label: 'Volver',
      nav: 'auditorias',
      subview: 'asignacion',
      action: 'back-to-asignacion-list',
    },
    parents,
    parentMetaHtml,
    tableName: 'programa_auditoria',
    recordId: program.id,
    feedbackHtml,
    attributes: [],
    customRecordBodyHtml,
  });
}
