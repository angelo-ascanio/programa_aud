import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import type { ConglomeradoEntity } from '../lib/conglomeradoDomain';
import type { VinculoEntity } from '../lib/vinculoDomain';
import type { CertificateRecord } from '../lib/searchControls';
import {
  formatAuditDateLabel,
  roundAuditDaysQuarter,
  type AuditDateEntry,
  type AuditorSiteRole,
  type ProgramaAuditoriaEntity,
} from '../lib/auditPlanningEngine';
import type { ProgramacionAuditEntity } from '../lib/auditExecution';
import type { AuditorDetailEntity } from '../lib/competencyMatrix';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import { resolveAuditNavigation } from '../lib/certificateAuditSelector';
import type { AuditoriaSitioTemporalEntity } from '../lib/designacionTemporalDomain';
import {
  buildAuditAuditorDetail,
  buildCertificateAuditorRows,
  evaluateAuditorCompetencyMatch,
  type AuditAuditableUnit,
  type AuditAuditorDetailModel,
  type AuditAuditorMemberItem,
  type CertificateAuditorRow,
} from '../lib/asignacionDomain';
import type { AlertConfigEntity } from '../lib/auditAlertsEngine';
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
import { renderAuditSectionShell } from './auditSectionShell';
import { renderAddAuditButton } from './auditCardBreadcrumb';
import {
  extractUniversalArchiveProps,
  type ArchiveMultiViewConfig,
} from '../lib/archiveGovernance';

export type AsignacionSortColumn = 'certificado' | 'progreso' | 'estado';

export interface AsignacionViewState {
  query: string;
  viewMode: UniversalViewMode;
  isSidebarOpen: boolean;
  sortColumn: AsignacionSortColumn | null;
  sortDirection: SortDirection;
  facetSelections: MultiViewSelectionMap;
  selectedCertId?: string | null;
  selectedAuditId?: string | null;
  /** Legacy compatibility field */
  selectedProgramId?: string | null;
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
  audits?: ReadonlyArray<ProgramacionAuditEntity>;
  temporalSites: ReadonlyArray<AuditoriaSitioTemporalEntity>;
  auditors: ReadonlyArray<AuditorDetailEntity>;
  certificados?: ReadonlyArray<CertificadoDetailEntity>;
  certificates?: ReadonlyArray<CertificateRecord>;
  vinculos?: ReadonlyArray<VinculoEntity>;
  conglomerados?: ReadonlyArray<ConglomeradoEntity>;
  alertConfig?: AlertConfigEntity;
  referenceIsoDate?: string;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
  inCardBreadcrumbHtml?: string;
  headerAddAuditHtml?: string;
}

export const DEFAULT_ASIGNACION_STATE: AsignacionViewState = {
  query: '',
  viewMode: 'list',
  isSidebarOpen: true,
  sortColumn: null,
  sortDirection: 'none',
  facetSelections: {},
  selectedCertId: null,
  selectedAuditId: null,
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

function mergeAuditsPool(
  programs: ReadonlyArray<ProgramaAuditoriaEntity>,
  auditsProp?: ReadonlyArray<ProgramacionAuditEntity>
): ProgramacionAuditEntity[] {
  const byId = new Map<string, ProgramacionAuditEntity>();
  for (const a of auditsProp ?? []) {
    if (!a.deleted_at) byId.set(a.id, a);
  }
  for (const prog of programs) {
    if (prog.deleted_at) continue;
    for (const a of prog.auditorias) {
      if (!a.deleted_at && !byId.has(a.id)) byId.set(a.id, a);
    }
  }
  return Array.from(byId.values());
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

function computeBalanceMetrics(opts: {
  assignedCount: number;
  assignedDays: number;
  requiredDays: number;
}): {
  pct: number;
  widthPct: number;
  barClass: string;
  deltaLabel: string;
  deltaBadgeClass: string;
  summaryText: string;
  isBalanced: boolean;
  isExcess: boolean;
} {
  const safeReq = Math.max(0, roundAuditDaysQuarter(opts.requiredDays));
  const safeAssigned = Math.max(0, roundAuditDaysQuarter(opts.assignedDays));
  const rawPct = safeReq > 0 ? Math.round((safeAssigned / safeReq) * 100) : 0;
  const widthPct = Math.min(100, Math.max(0, rawPct));
  const delta = Math.round((safeAssigned - safeReq) * 100) / 100;
  const isBalanced =
    opts.assignedCount >= 1 && safeReq > 0 && Math.abs(delta) < 0.001;
  const isExcess = delta > 0.001;

  let barClass = 'bg-slate-300';
  let deltaLabel = 'Sin tiempo requerido en 2. Tiempo';
  let deltaBadgeClass = 'bg-slate-100 text-slate-700 border-slate-200';

  if (safeReq <= 0) {
    barClass = 'bg-slate-300';
    deltaLabel = 'Tiempo requerido en 0.00 d';
    deltaBadgeClass = 'bg-amber-50 text-amber-800 border-amber-200';
  } else if (isBalanced) {
    barClass = 'bg-emerald-600';
    deltaLabel = 'Balance exacto ✓';
    deltaBadgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-200';
  } else if (isExcess) {
    barClass = 'bg-rose-600';
    deltaLabel = `Excede por ${delta.toFixed(2)} d`;
    deltaBadgeClass = 'bg-rose-50 text-rose-800 border-rose-200';
  } else {
    barClass = 'bg-amber-500';
    const missing = Math.max(0, roundAuditDaysQuarter(safeReq - safeAssigned));
    deltaLabel = `Faltan ${missing.toFixed(2)} d`;
    deltaBadgeClass = 'bg-amber-50 text-amber-800 border-amber-200';
  }

  return {
    pct: rawPct,
    widthPct,
    barClass,
    deltaLabel,
    deltaBadgeClass,
    summaryText: `Asignado: ${safeAssigned.toFixed(2)} d / Requerido: ${safeReq.toFixed(2)} d`,
    isBalanced,
    isExcess,
  };
}

function getCertStatusBadge(row: Pick<CertificateAuditorRow, 'statusKey' | 'hasExcessDiscrepancy'>): {
  label: string;
  cls: string;
} {
  if (row.statusKey === 'SIN_AUDITORIA') {
    return {
      label: 'Sin auditorías',
      cls: 'bg-slate-100 text-slate-600 border-slate-200',
    };
  }
  if (row.statusKey === 'COMPLETO') {
    return {
      label: 'Completo ✓',
      cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    };
  }
  if (row.statusKey === 'PENDIENTE') {
    return {
      label: 'Pendiente',
      cls: 'bg-slate-100 text-slate-700 border-slate-300',
    };
  }
  return {
    label: 'Desbalanceado',
    cls: row.hasExcessDiscrepancy
      ? 'bg-rose-50 text-rose-800 border-rose-200'
      : 'bg-amber-50 text-amber-800 border-amber-200',
  };
}

/**
 * Renders Step 6.1 `3. Auditor` (`#/auditorias/auditor`, alias `#/auditorias/asignacion`)
 * using the Certificate-Based Multi View + single-audit Detail View (`renderAuditSectionShell`
 * with `showLinkedSiblings: false`), displaying permanent sites AND active `Sitio Temporal`.
 */
export function renderAsignacionView(props: AsignacionViewProps): string {
  const {
    profile,
    state,
    programs,
    audits: auditsProp,
    temporalSites,
    auditors,
    certificados = [],
    certificates = [],
    alertConfig,
    referenceIsoDate,
    loading = false,
    archiveConfig,
    tableColumnWidths,
    inCardBreadcrumbHtml = '',
    headerAddAuditHtml = '',
  } = props;

  const isStaff = isApprovedStaffProfile(profile);
  const auditsPool = mergeAuditsPool(programs, auditsProp);

  const allRows = buildCertificateAuditorRows({
    certificates,
    detailedCerts: certificados,
    audits: auditsPool,
    programs,
    temporalSites,
    auditors,
    alertConfig,
    referenceIsoDate,
  });

  const legacyProgramFirstAudit = state.selectedProgramId
    ? programs
        .find((p) => !p.deleted_at && p.id === state.selectedProgramId)
        ?.auditorias.find((a) => !a.deleted_at) ?? null
    : null;

  const resolvedCertId =
    state.selectedCertId && allRows.some((r) => r.certId === state.selectedCertId)
      ? state.selectedCertId
      : state.selectedAuditId
      ? auditsPool.find((a) => a.id === state.selectedAuditId)?.id_certificado ?? null
      : legacyProgramFirstAudit?.id_certificado ?? null;

  const resolvedHeaderAddAuditHtml = headerAddAuditHtml || renderAddAuditButton(isStaff);

  if (resolvedCertId) {
    const certRow = allRows.find((r) => r.certId === resolvedCertId) ?? null;
    if (certRow) {
      const effectiveAuditId = state.selectedAuditId ?? legacyProgramFirstAudit?.id ?? null;
      return renderAuditorDetailView({
        state,
        certRow,
        effectiveAuditId,
        audits: auditsPool,
        programs,
        temporalSites,
        auditors,
        certificados,
        alertConfig,
        isStaff,
        inCardBreadcrumbHtml,
        headerAddAuditHtml: resolvedHeaderAddAuditHtml,
      });
    }
  }

  return renderAuditorMultiView({
    state,
    allRows,
    loading,
    archiveConfig,
    tableColumnWidths,
    headerAddAuditHtml: resolvedHeaderAddAuditHtml,
  });
}

function renderAuditorMultiView(opts: {
  state: AsignacionViewState;
  allRows: ReadonlyArray<CertificateAuditorRow>;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
  headerAddAuditHtml?: string;
}): string {
  const {
    state,
    allRows,
    loading = false,
    archiveConfig,
    tableColumnWidths,
    headerAddAuditHtml = '',
  } = opts;

  const facetCategories: MultiViewFacetCategory<CertificateAuditorRow>[] = [
    {
      id: 'estado',
      label: 'Estado de Cobertura',
      options: [
        { value: 'PENDIENTE', label: 'Pendiente' },
        { value: 'DESBALANCEADO', label: 'Desbalanceado' },
        { value: 'COMPLETO', label: 'Completo ✓' },
        { value: 'SIN_AUDITORIA', label: 'Sin auditorías' },
      ],
      extractValues: (r) => r.statusKey,
    },
    {
      id: 'sitio_temporal',
      label: 'Sitio Temporal',
      options: [
        { value: 'CON_TEMPORAL', label: 'Incluye Sitio Temporal' },
        { value: 'SOLO_PERMANENTES', label: 'Solo permanentes' },
      ],
      extractValues: (r) => (r.hasTemporalActive ? 'CON_TEMPORAL' : 'SOLO_PERMANENTES'),
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
  ];

  const searchOptions = {
    getSearchableText: (row: CertificateAuditorRow): string => {
      const teamNames = row.assignedSummaries.map((m) => m.nombre).join(' ');
      return [
        row.numero_certificado,
        row.organizacion_nombre,
        row.organizacion_abreviacion || '',
        row.alcance_es || '',
        row.norma_codigo,
        row.latestAudit?.codigo_auditoria || '',
        row.latestAudit?.tipo_auditoria || '',
        row.latestProgram?.etiqueta || '',
        teamNames,
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
        case 'certificado':
          return row.numero_certificado.toLowerCase();
        case 'progreso':
          return row.requiredDays > 0 ? row.assignedDays / row.requiredDays : 0;
        case 'estado':
          return row.statusKey === 'COMPLETO'
            ? 3
            : row.statusKey === 'DESBALANCEADO'
            ? 2
            : row.statusKey === 'PENDIENTE'
            ? 1
            : 0;
        default:
          return row.numero_certificado.toLowerCase();
      }
    }
  );

  const columns: ColumnDefinition<CertificateAuditorRow>[] = [
    {
      id: 'certificado',
      header: 'Certificado & Org',
      defaultWidthPct: 32,
      minWidthPx: 190,
      sortable: true,
      renderCell: (row) => {
        const alertHtml =
          row.alertReasons.length > 0
            ? `<span title="${escapeHtml(row.alertReasons.join(' · '))}" class="px-1.5 py-0.2 rounded text-[10px] font-bold border ${
                row.hasScheduleConflict || row.hasExcessDiscrepancy
                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              } shrink-0">⚠</span>`
            : '';
        const verChip =
          typeof row.activeVersionNumero === 'number' && row.activeVersionNumero >= 1
            ? `<span class="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-300 shrink-0">v${Math.floor(row.activeVersionNumero)}</span>`
            : '';
        const abrevChip = row.organizacion_abreviacion
          ? `<span class="px-1.5 py-0.2 rounded text-[10px] font-bold bg-white text-slate-700 border border-slate-200 shrink-0">${escapeHtml(row.organizacion_abreviacion)}</span>`
          : '';
        const noAlcanceChip =
          row.hasAlcance === false
            ? `<span class="px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200 shrink-0">Sin alcance</span>`
            : '';
        const scopeTitle = row.alcance_es
          ? `Alcance: ${row.alcance_es}`
          : 'Sin Alcance activo registrado en Certificación → Certificado → Alcance.';
        return `
          <div class="min-w-0 space-y-0.5" title="${escapeHtml(scopeTitle)}">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="font-mono text-xs font-bold text-slate-900 truncate">${escapeHtml(
                row.numero_certificado
              )}</span>
              ${verChip}
              <span class="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                ${escapeHtml(row.norma_codigo)}
              </span>
              ${abrevChip}
              ${noAlcanceChip}
              ${alertHtml}
            </div>
            <div class="text-[11px] text-slate-600 truncate">${escapeHtml(row.organizacion_nombre)}</div>
          </div>
        `;
      },
    },
    {
      id: 'ultima_auditoria',
      header: 'Última Auditoría',
      defaultWidthPct: 26,
      minWidthPx: 170,
      sortable: false,
      renderCell: (row) => {
        if (!row.latestAudit) {
          return `<span class="text-[11px] italic text-slate-400">Sin auditorías programadas</span>`;
        }
        const dateLabel = formatDateSummaryCompact(row.latestPlannedDate);
        const teamPreview =
          row.assignedSummaries.length > 0
            ? row.assignedSummaries
                .slice(0, 2)
                .map((m) => (m.isLeader ? `★ ${m.nombre}` : m.nombre))
                .join(', ')
            : 'Sin equipo asignado';

        return `
          <div class="min-w-0 space-y-0.5">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="font-mono text-[11px] font-bold text-slate-800 shrink-0">${escapeHtml(
                row.latestAudit.codigo_auditoria
              )}</span>
              <span class="text-xs font-semibold text-slate-800 truncate">${escapeHtml(
                row.latestAudit.tipo_auditoria || 'Auditoría'
              )}</span>
            </div>
            <div class="text-[11px] text-slate-500 truncate">
              ${escapeHtml(dateLabel)} · ${escapeHtml(teamPreview)}
            </div>
          </div>
        `;
      },
    },
    {
      id: 'progreso',
      header: 'Cobertura Días',
      defaultWidthPct: 24,
      minWidthPx: 165,
      sortable: true,
      renderCell: (row) => {
        if (!row.latestAudit) {
          return `<span class="text-xs text-slate-400">—</span>`;
        }
        const rawPct =
          row.requiredDays > 0 ? Math.round((row.assignedDays / row.requiredDays) * 100) : 0;
        const widthPct = Math.min(100, Math.max(0, rawPct));
        const isExact =
          row.statusKey === 'COMPLETO' &&
          row.requiredDays > 0 &&
          Math.abs(row.assignedDays - row.requiredDays) < 0.001;
        const isExcess = row.assignedDays - row.requiredDays > 0.001;
        const barCls = isExact
          ? 'bg-emerald-600'
          : isExcess
          ? 'bg-rose-600'
          : row.requiredDays > 0
          ? 'bg-amber-500'
          : 'bg-slate-300';

        return `
          <div class="min-w-0 space-y-1 tabular-nums">
            <div class="flex items-center justify-between gap-1 text-[11px] font-mono">
              <span class="font-semibold text-slate-900 truncate">
                ${row.assignedDays.toFixed(2)} / ${row.requiredDays.toFixed(2)} d
              </span>
              <span class="text-[10px] font-bold ${
                row.hasTemporalActive ? 'text-violet-700' : 'text-slate-500'
              } shrink-0">
                ${row.hasTemporalActive ? '+Temp' : `${row.balancedSitesCount}/${row.sitesCount}`}
              </span>
            </div>
            <div class="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
              <div class="h-full rounded-full ${barCls} transition-all" style="width: ${widthPct}%"></div>
            </div>
          </div>
        `;
      },
    },
    {
      id: 'estado',
      header: 'Estado',
      defaultWidthPct: 18,
      minWidthPx: 130,
      sortable: true,
      renderCell: (row) => {
        const badge = getCertStatusBadge(row);
        return `<span title="${escapeHtml(badge.label)}" class="inline-flex items-center max-w-full truncate px-2 py-0.5 rounded-full text-[11px] font-bold border ${badge.cls}">${escapeHtml(badge.label)}</span>`;
      },
    },
  ];

  const renderCard = (row: CertificateAuditorRow): string => {
    const badge = getCertStatusBadge(row);
    const dateLabel = formatDateSummaryCompact(row.latestPlannedDate);
    const rawPct =
      row.requiredDays > 0 ? Math.round((row.assignedDays / row.requiredDays) * 100) : 0;
    const widthPct = Math.min(100, Math.max(0, rawPct));
    const isExact = row.statusKey === 'COMPLETO';

    return `
      <article
        role="button"
        tabindex="0"
        data-action="select-section-cert"
        data-cert-id="${escapeHtml(row.certId)}"
        aria-label="Gestionar auditores para ${escapeHtml(row.numero_certificado)}"
        class="text-left bg-white border border-slate-200 hover:border-slate-400 rounded-xl p-3.5 shadow-2xs transition-all cursor-pointer space-y-2.5 flex flex-col justify-between"
      >
        <div class="space-y-2">
          <div class="flex items-center justify-between gap-2">
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${badge.cls}">
              ${escapeHtml(badge.label)}
            </span>
            ${
              row.hasTemporalActive
                ? '<span class="px-1.5 py-0.2 rounded text-[10px] font-bold bg-violet-50 text-violet-800 border border-violet-200">TEMPORAL</span>'
                : ''
            }
          </div>
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="font-mono text-xs font-bold text-slate-900">${escapeHtml(row.numero_certificado)}</span>
            ${
              typeof row.activeVersionNumero === 'number' && row.activeVersionNumero >= 1
                ? `<span class="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-300">v${Math.floor(row.activeVersionNumero)}</span>`
                : ''
            }
            <span class="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              ${escapeHtml(row.norma_codigo)}
            </span>
            ${
              row.organizacion_abreviacion
                ? `<span class="px-1.5 py-0.2 rounded text-[10px] font-bold bg-white text-slate-700 border border-slate-200">${escapeHtml(row.organizacion_abreviacion)}</span>`
                : ''
            }
            ${
              row.hasAlcance === false
                ? `<span class="px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">Sin alcance</span>`
                : ''
            }
          </div>
          <h3 class="text-sm font-bold text-slate-900 line-clamp-2" title="${escapeHtml(
            row.alcance_es || 'Sin Alcance activo'
          )}">${escapeHtml(row.organizacion_nombre)}</h3>
          <div class="text-[11px] text-slate-500 truncate">
            ${
              row.latestAudit
                ? `${escapeHtml(row.latestAudit.codigo_auditoria)} · ${escapeHtml(row.latestAudit.tipo_auditoria)} · ${escapeHtml(dateLabel)}`
                : 'Sin auditorías registradas'
            }
          </div>
          <div class="space-y-1">
            <div class="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-700">
              <span>${row.assignedDays.toFixed(2)} / ${row.requiredDays.toFixed(2)} d</span>
              <span class="font-bold">${rawPct}%</span>
            </div>
            <div class="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
              <div class="h-full rounded-full ${isExact ? 'bg-emerald-600' : 'bg-amber-500'}" style="width: ${widthPct}%"></div>
            </div>
          </div>
        </div>
        <div class="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px]">
          <span class="text-slate-600 font-medium truncate">
            ${
              row.assignedSummaries.length > 0
                ? escapeHtml(row.assignedSummaries.map((m) => m.nombre).join(', '))
                : 'Sin auditores asignados'
            }
          </span>
          <span class="text-slate-500 font-semibold shrink-0 tabular-nums">
            ${row.balancedSitesCount}/${row.sitesCount} unidades
          </span>
        </div>
      </article>
    `;
  };

  const archiveProps = extractUniversalArchiveProps(archiveConfig, 'programacion');

  return renderUniversalTemplate<CertificateAuditorRow>({
    domainKey: 'auditor',
    tableId: 'asignacion-main',
    title: '3. Auditor (0.25d)',
    subtitle:
      'Distribución y balance multi-auditor sobre sitios permanentes y Sitio Temporal activo con validación exacta SUM(días) === requerido, competencias ISO/IEC 17021-1, conflictos y rotación.',
    entityLabel: 'certificados',
    searchQuery: state.query,
    searchPlaceholder: 'Buscar por certificado, organización, auditor, norma o código...',
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
      `data-action="select-section-cert" data-cert-id="${escapeHtml(row.certId)}" title="Gestionar equipo auditor para ${escapeHtml(row.numero_certificado)}"`,
    renderCard,
    actionsHtml: headerAddAuditHtml,
    loading,
    emptyStateTitle:
      allRows.length === 0 ? 'No hay certificados disponibles' : 'No se encontraron certificados en 3. Auditor',
    emptyStateMessage:
      allRows.length === 0
        ? 'Registre certificados y programe una auditoría con "+ Auditoría" para asignar auditores.'
        : 'Intente ajustar la búsqueda o restablecer los filtros de la barra lateral.',
    emptyStateActionHtml: allRows.length === 0 ? headerAddAuditHtml : '',
    ...archiveProps,
  });
}

function renderAuditorDetailView(opts: {
  state: AsignacionViewState;
  certRow: CertificateAuditorRow;
  effectiveAuditId: string | null;
  audits: ReadonlyArray<ProgramacionAuditEntity>;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  temporalSites: ReadonlyArray<AuditoriaSitioTemporalEntity>;
  auditors: ReadonlyArray<AuditorDetailEntity>;
  certificados: ReadonlyArray<CertificadoDetailEntity>;
  alertConfig?: AlertConfigEntity;
  isStaff: boolean;
  inCardBreadcrumbHtml?: string;
  headerAddAuditHtml?: string;
}): string {
  const {
    state,
    certRow,
    effectiveAuditId,
    audits,
    programs,
    temporalSites,
    auditors,
    certificados,
    alertConfig,
    isStaff,
    inCardBreadcrumbHtml = '',
    headerAddAuditHtml = '',
  } = opts;

  const navigation = resolveAuditNavigation(certRow.certId, effectiveAuditId, audits);
  const activeAudit = navigation.activeAudit;

  const feedbackHtml = state.editErrorMessage
    ? `
      <div role="alert" data-testid="asignacion-error-banner" class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800 flex items-center gap-2">
        <span aria-hidden="true">⚠️</span>
        <span>${escapeHtml(state.editErrorMessage)}</span>
      </div>
    `
    : '';

  const renderMemberRow = (
    unit: AuditAuditableUnit,
    member: AuditAuditorMemberItem
  ): string => {
    const roleCls =
      member.rol === 'AUDITOR_LIDER'
        ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
        : member.rol === 'EXPERTO_TECNICO'
        ? 'bg-violet-50 text-violet-800 border-violet-200'
        : 'bg-slate-100 text-slate-700 border-slate-200';

    return `
      <div
        data-testid="asignacion-member-row"
        data-assignment-id="${escapeHtml(member.assignmentId)}"
        class="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2"
      >
        <div class="min-w-0 space-y-1 flex-1">
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="text-xs font-bold text-slate-900">
              ${escapeHtml(member.auditorNombre)}
            </span>
            <span class="px-1.5 py-0.2 rounded text-[10px] font-bold border ${roleCls} whitespace-nowrap">
              ${escapeHtml(ROLE_LABELS[member.rol] || member.rol)}
            </span>
            <span class="px-1.5 py-0.2 rounded text-[10px] font-semibold border ${member.competency.badgeClass} whitespace-nowrap">
              ${escapeHtml(member.competency.label)}
            </span>
            ${
              member.hasScheduleConflict
                ? `<span title="${escapeHtml(member.scheduleConflictMessages.join(' | '))}" class="px-1.5 py-0.2 rounded text-[10px] font-bold border bg-rose-50 text-rose-800 border-rose-200 whitespace-nowrap">⚠ Conflicto calendario</span>`
                : ''
            }
            ${
              member.hasRotationWarning
                ? `<span title="${escapeHtml(member.rotationWarningMessage || '')}" class="px-1.5 py-0.2 rounded text-[10px] font-bold border bg-amber-50 text-amber-800 border-amber-200 whitespace-nowrap">⚠ Rotación Líder ISO 17021-1</span>`
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
                  data-target-kind="${unit.kind}"
                  data-target-id="${escapeHtml(unit.targetId)}"
                  data-audit-id="${escapeHtml(unit.auditId)}"
                  data-auditor-id="${escapeHtml(member.auditorId)}"
                  data-rol="${member.rol}"
                  data-whole-site="${member.wholeSite ? 'true' : 'false'}"
                  data-current-days="${member.days.toFixed(2)}"
                  data-delta="-0.25"
                  ${member.days <= 0.25 ? 'disabled' : ''}
                  aria-label="Restar 0.25 días a ${escapeHtml(member.auditorNombre)} en ${escapeHtml(unit.title)}"
                  class="h-7 px-2 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-bold text-slate-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  -0.25
                </button>
                <span class="font-mono text-xs font-bold text-slate-900 px-2 py-0.5 rounded bg-white border border-slate-200 min-w-[60px] text-center">
                  ${member.days.toFixed(2)} d
                </span>
                <button
                  type="button"
                  data-action="step-asignacion-auditor-days"
                  data-target-kind="${unit.kind}"
                  data-target-id="${escapeHtml(unit.targetId)}"
                  data-audit-id="${escapeHtml(unit.auditId)}"
                  data-auditor-id="${escapeHtml(member.auditorId)}"
                  data-rol="${member.rol}"
                  data-whole-site="${member.wholeSite ? 'true' : 'false'}"
                  data-current-days="${member.days.toFixed(2)}"
                  data-delta="0.25"
                  aria-label="Sumar 0.25 días a ${escapeHtml(member.auditorNombre)} en ${escapeHtml(unit.title)}"
                  class="h-7 px-2 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-bold text-slate-700 cursor-pointer"
                >
                  +0.25
                </button>
                <button
                  type="button"
                  data-action="remove-asignacion-auditor"
                  data-target-kind="${unit.kind}"
                  data-assignment-id="${escapeHtml(member.assignmentId)}"
                  data-target-id="${escapeHtml(unit.targetId)}"
                  data-audit-id="${escapeHtml(unit.auditId)}"
                  aria-label="Retirar a ${escapeHtml(member.auditorNombre)} de ${escapeHtml(unit.title)}"
                  class="h-7 px-2 rounded-md border border-rose-200 bg-rose-50 hover:bg-rose-100 text-[11px] font-semibold text-rose-700 cursor-pointer ml-1"
                >
                  Quitar
                </button>
              `
              : `
                <span class="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-900 text-white">
                  ${member.days.toFixed(2)} d
                </span>
              `
          }
        </div>
      </div>
    `;
  };

  const renderAddAuditorControls = (
    detail: AuditAuditorDetailModel,
    unit: AuditAuditableUnit
  ): string => {
    if (!isStaff) return '';

    const assignedIds = new Set(unit.members.map((m) => m.auditorId));
    const conflictIds = new Set(detail.scheduleConflicts.map((c) => c.id_auditor));
    const rankedAuditors = auditors.slice().sort((a, b) => {
      const aAssigned = assignedIds.has(a.id) ? 1 : 0;
      const bAssigned = assignedIds.has(b.id) ? 1 : 0;
      if (aAssigned !== bAssigned) return aAssigned - bAssigned;
      const compA = evaluateAuditorCompetencyMatch(
        a,
        detail.audit.norma_codigo,
        detail.audit.sector_iaf,
        detail.subsectorCodigo
      ).level;
      const compB = evaluateAuditorCompetencyMatch(
        b,
        detail.audit.norma_codigo,
        detail.audit.sector_iaf,
        detail.subsectorCodigo
      ).level;
      const rankScore = (lvl: 'FULL' | 'NORMA_ONLY' | 'PARTIAL') =>
        lvl === 'FULL' ? 0 : lvl === 'NORMA_ONLY' ? 1 : 2;
      if (rankScore(compA) !== rankScore(compB)) {
        return rankScore(compA) - rankScore(compB);
      }
      return a.nombre.localeCompare(b.nombre);
    });

    const isFocusedDraft =
      state.draftTargetKind === unit.kind && state.draftTargetId === unit.targetId;
    const defaultAuditorId =
      isFocusedDraft &&
      state.draftAuditorId &&
      rankedAuditors.some((a) => a.id === state.draftAuditorId)
        ? state.draftAuditorId
        : rankedAuditors.find((a) => !assignedIds.has(a.id))?.id ||
          rankedAuditors[0]?.id ||
          '';
    const suggestedDays =
      unit.remainingDays >= 0.25
        ? unit.remainingDays
        : 0.25;
    const daysValue = isFocusedDraft ? state.draftDays : suggestedDays.toFixed(2);
    const activeRole = isFocusedDraft ? state.draftRol : 'AUDITOR';
    const disabledDueToZeroRequired = unit.requiredDays <= 0;

    return `
      <div
        data-testid="asignacion-inline-form"
        data-target-kind="${unit.kind}"
        data-target-id="${escapeHtml(unit.targetId)}"
        class="pt-2.5 border-t border-slate-100 space-y-2"
      >
        <div class="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
          <div class="sm:col-span-5">
            <label
              for="asignacionAuditorSelect_${escapeHtml(unit.targetId)}"
              class="block text-[11px] font-semibold text-slate-700 mb-1"
            >
              Agregar Auditor
            </label>
            <select
              id="asignacionAuditorSelect_${escapeHtml(unit.targetId)}"
              data-action="change-asignacion-draft-field"
              data-field="auditorId"
              ${disabledDueToZeroRequired || rankedAuditors.length === 0 ? 'disabled' : ''}
              aria-label="Seleccionar auditor para ${escapeHtml(unit.title)}"
              class="w-full h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-none disabled:opacity-50"
            >
              ${
                rankedAuditors.length === 0
                  ? '<option value="">Sin auditores disponibles</option>'
                  : rankedAuditors
                      .map((aud) => {
                        const match = evaluateAuditorCompetencyMatch(
                          aud,
                          detail.audit.norma_codigo,
                          detail.audit.sector_iaf,
                          detail.subsectorCodigo
                        );
                        const availHint = conflictIds.has(aud.id)
                          ? 'Conflicto agenda'
                          : assignedIds.has(aud.id)
                          ? 'Ya asignado'
                          : 'Disponible';
                        const compHint = match.level === 'FULL' ? '✓ Calificado' : match.label;
                        const selected = aud.id === defaultAuditorId ? 'selected' : '';
                        return `<option value="${escapeHtml(aud.id)}" ${selected}>${escapeHtml(aud.nombre)} — ${escapeHtml(compHint)} · ${availHint}</option>`;
                      })
                      .join('')
              }
            </select>
          </div>

          <div class="sm:col-span-3">
            <label
              for="asignacionRolSelect_${escapeHtml(unit.targetId)}"
              class="block text-[11px] font-semibold text-slate-700 mb-1"
            >
              Rol
            </label>
            <select
              id="asignacionRolSelect_${escapeHtml(unit.targetId)}"
              data-action="change-asignacion-draft-field"
              data-field="rol"
              ${disabledDueToZeroRequired ? 'disabled' : ''}
              aria-label="Rol del auditor en ${escapeHtml(unit.title)}"
              class="w-full h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-none disabled:opacity-50"
            >
              ${ROLE_OPTIONS.map(
                (r) =>
                  `<option value="${r.value}" ${activeRole === r.value ? 'selected' : ''}>${escapeHtml(r.label)}</option>`
              ).join('')}
            </select>
          </div>

          <div class="sm:col-span-2">
            <label
              for="asignacionDaysInput_${escapeHtml(unit.targetId)}"
              class="block text-[11px] font-semibold text-slate-700 mb-1"
            >
              Días (0.25)
            </label>
            <input
              id="asignacionDaysInput_${escapeHtml(unit.targetId)}"
              type="number"
              min="0.25"
              step="0.25"
              data-action="change-asignacion-draft-field"
              data-field="days"
              ${disabledDueToZeroRequired ? 'disabled' : ''}
              aria-label="Días-auditor a asignar en ${escapeHtml(unit.title)}"
              value="${escapeHtml(daysValue)}"
              class="w-full h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs font-mono font-bold text-slate-900 tabular-nums focus:border-slate-900 focus:outline-none disabled:opacity-50"
            />
          </div>

          <div class="sm:col-span-2">
            <button
              type="button"
              data-action="submit-asignacion-auditor"
              data-target-kind="${unit.kind}"
              data-target-id="${escapeHtml(unit.targetId)}"
              data-audit-id="${escapeHtml(unit.auditId)}"
              data-required-days="${Math.max(0, unit.requiredDays).toFixed(2)}"
              ${disabledDueToZeroRequired || rankedAuditors.length === 0 ? 'disabled' : ''}
              title="${
                disabledDueToZeroRequired
                  ? 'Declare primero los días requeridos en 2. Tiempo'
                  : 'Agregar auditor con las jornadas indicadas'
              }"
              class="w-full h-8 px-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              Agregar Auditor
            </button>
          </div>
        </div>
      </div>
    `;
  };

  const renderUnitCard = (
    detail: AuditAuditorDetailModel,
    unit: AuditAuditableUnit
  ): string => {
    const isTemporal = unit.kind === 'TEMPORAL';
    const metrics = computeBalanceMetrics({
      assignedCount: unit.members.length,
      assignedDays: unit.assignedDays,
      requiredDays: unit.requiredDays,
    });

    const cardBorder = metrics.isBalanced
      ? 'border-emerald-200 bg-white'
      : metrics.isExcess
      ? 'border-rose-200 bg-rose-50/20'
      : isTemporal
      ? 'border-violet-300 bg-violet-50/25'
      : 'border-slate-200 bg-white';

    return `
      <article
        data-testid="${isTemporal ? 'asignacion-temporal-card' : 'asignacion-site-card'}"
        ${
          isTemporal
            ? `data-temporal-site-id="${escapeHtml(unit.targetId)}"`
            : `data-site-plan-id="${escapeHtml(unit.targetId)}"`
        }
        class="rounded-2xl border ${cardBorder} p-4 shadow-2xs space-y-3"
      >
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div class="min-w-0 space-y-0.5 flex-1">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="px-1.5 py-0.2 rounded text-[10px] font-bold border whitespace-nowrap ${
                isTemporal
                  ? 'bg-violet-100 text-violet-900 border-violet-300'
                  : unit.isHq
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-slate-100 text-slate-700 border-slate-200'
              }">
                ${escapeHtml(unit.badgeLabel)}
              </span>
              <h4 class="text-xs sm:text-sm font-bold text-slate-900 truncate">${escapeHtml(
                unit.title
              )}</h4>
              ${
                unit.modalidad
                  ? `<span class="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">${escapeHtml(
                      unit.modalidad
                    )}</span>`
                  : ''
              }
            </div>
            ${
              unit.subtitle
                ? `<p class="text-[11px] text-slate-500 truncate">${escapeHtml(unit.subtitle)}</p>`
                : ''
            }
          </div>

          <div class="flex flex-wrap items-center gap-1.5 shrink-0 tabular-nums">
            <span class="px-2 py-0.5 rounded-full text-[11px] font-bold border ${metrics.deltaBadgeClass} whitespace-nowrap">
              ${escapeHtml(metrics.deltaLabel)}
            </span>
          </div>
        </div>

        <div class="space-y-1">
          <div class="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono font-semibold text-slate-700 tabular-nums">
            <span>${escapeHtml(metrics.summaryText)}</span>
            <span class="${metrics.isBalanced ? 'text-emerald-700 font-bold' : 'text-slate-600'}">
              ${metrics.pct}% · ${unit.members.length} auditor${unit.members.length === 1 ? '' : 'es'}
            </span>
          </div>
          <div class="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
            <div class="h-full rounded-full ${metrics.barClass} transition-all" style="width: ${metrics.widthPct}%"></div>
          </div>
        </div>

        ${
          unit.hasMissingTime
            ? `
              <div class="rounded-lg border border-amber-200 bg-amber-50/80 px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-amber-900">
                <span>Este sitio aún tiene <strong>0.00 d</strong> requeridos. Declare su duración primero.</span>
                <button
                  type="button"
                  data-action="audit-breadcrumb-nav"
                  data-target-subview="${isTemporal ? 'designacion/temporal' : 'tiempo'}"
                  class="font-bold underline cursor-pointer whitespace-nowrap"
                >
                  Ir a ${isTemporal ? '1.4 Temporal' : '2. Tiempo'} →
                </button>
              </div>
            `
            : ''
        }

        <div class="space-y-1.5">
          ${
            unit.members.length === 0
              ? `<p class="text-[11px] italic text-slate-500">Sin auditores asignados a ${isTemporal ? 'este sitio temporal' : 'este sitio'}.</p>`
              : unit.members.map((member) => renderMemberRow(unit, member)).join('')
          }
        </div>

        ${renderAddAuditorControls(detail, unit)}
      </article>
    `;
  };

  let bodyHtml = '';
  if (activeAudit) {
    const detail = buildAuditAuditorDetail({
      activeAudit,
      audits,
      programs,
      temporalSites,
      auditors,
      certificados,
      alertConfig,
    });

    const auditStatusBadge = getCertStatusBadge({
      statusKey: detail.statusKey,
      hasExcessDiscrepancy: detail.hasExcessDiscrepancy,
    });
    const globalMetrics = computeBalanceMetrics({
      assignedCount: detail.assignedSummaries.length,
      assignedDays: detail.assignedDaysTotal,
      requiredDays: detail.requiredDaysTotal,
    });

    const summaryBannerHtml = `
      <section
        data-testid="asignacion-summary-banner"
        class="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 via-white to-emerald-50/30 p-4 shadow-2xs space-y-3"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-2 text-xs sm:text-sm tabular-nums">
            <div class="px-3 py-1.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
              <span class="text-slate-500 font-medium">Requerido Total:</span>
              <strong class="font-mono text-slate-900 ml-1">${detail.requiredDaysTotal.toFixed(2)} d</strong>
            </div>
            <div class="px-3 py-1.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
              <span class="text-slate-500 font-medium">Asignado Equipo:</span>
              <strong class="font-mono text-slate-900 ml-1">${detail.assignedDaysTotal.toFixed(2)} d</strong>
            </div>
            <div class="px-3 py-1.5 rounded-xl bg-slate-900 text-white shadow-2xs">
              <span class="text-slate-300 font-medium">Unidades Cuadradas:</span>
              <strong class="font-mono font-bold ml-1">${detail.balancedUnitsCount}/${detail.units.length}</strong>
            </div>
            ${
              detail.hasTemporalActive
                ? `<span class="px-2.5 py-1 rounded-xl bg-violet-50 border border-violet-200 text-violet-900 text-[11px] font-bold">Incluye Sitio Temporal</span>`
                : ''
            }
          </div>

          <span class="px-2.5 py-1 rounded-full text-[11px] font-bold border ${auditStatusBadge.cls} whitespace-nowrap">
            ${escapeHtml(auditStatusBadge.label)}
          </span>
        </div>

        <div class="space-y-1">
          <div class="flex flex-wrap items-center justify-between gap-2 text-xs font-mono font-semibold text-slate-700 tabular-nums">
            <span>${escapeHtml(globalMetrics.summaryText)}</span>
            <span class="px-2 py-0.2 rounded-full border text-[10px] font-bold ${globalMetrics.deltaBadgeClass}">
              ${escapeHtml(globalMetrics.deltaLabel)}
            </span>
          </div>
          <div class="w-full h-2.5 rounded-full bg-slate-200 overflow-hidden">
            <div class="h-full rounded-full ${globalMetrics.barClass} transition-all" style="width: ${globalMetrics.widthPct}%"></div>
          </div>
        </div>

        ${
          detail.rotationSummary?.requiresRotation && detail.rotationSummary.warningMessage
            ? `
              <div class="rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-[11px] font-medium text-amber-900">
                ⚠️ ${escapeHtml(detail.rotationSummary.warningMessage)}
              </div>
            `
            : ''
        }

        ${
          detail.scheduleConflicts.length > 0
            ? `
              <div data-testid="asignacion-schedule-conflicts" class="rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2 space-y-1">
                <div class="text-[11px] font-bold text-rose-900">
                  ⚠️ Conflictos de calendario detectados (${detail.scheduleConflicts.length})
                </div>
                <ul class="space-y-0.5 text-[11px] text-rose-800 list-disc pl-4">
                  ${detail.scheduleConflicts.map((c) => `<li>${escapeHtml(c.message)}</li>`).join('')}
                </ul>
              </div>
            `
            : ''
        }
      </section>
    `;

    const missingTemporalRecordWarningHtml = detail.temporalEnabledWithoutRecord
      ? `
        <div class="rounded-xl border border-violet-200 bg-violet-50/70 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-violet-950">
          <span>
            El switch de <strong>Sitio Temporal</strong> está activo para este lote, pero aún falta registrar nombre/ubicación/días en <strong>1.4 Temporal</strong>.
          </span>
          <button
            type="button"
            data-action="audit-breadcrumb-nav"
            data-target-subview="designacion/temporal"
            class="px-3 py-1 rounded-lg border border-violet-300 bg-white hover:bg-violet-100 text-violet-900 text-[11px] font-bold cursor-pointer whitespace-nowrap"
          >
            Completar 1.4 Temporal →
          </button>
        </div>
      `
      : '';

    const unitsAreaHtml = detail.hasNoAuditableUnits
      ? `
        <div
          data-testid="auditor-empty-sites-state"
          class="rounded-2xl border border-amber-200 bg-amber-50/40 p-6 text-center space-y-3"
        >
          <div class="text-2xl select-none" aria-hidden="true">📍</div>
          <h3 class="text-sm font-bold text-slate-900">No hay sitios designados para asignar auditores</h3>
          <p class="text-xs text-slate-600 max-w-md mx-auto">
            Designe los sitios permanentes en <strong>1. Designación → Sitio</strong> y declare sus días-auditor en <strong>2. Tiempo</strong> antes de asignar el equipo.
          </p>
          <div class="pt-1 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              data-action="audit-breadcrumb-nav"
              data-target-subview="designacion/sitio"
              class="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer inline-flex items-center gap-1.5"
            >
              <span>Ir a 1. Designación → Sitio</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      `
      : `
        <div class="space-y-3">
          ${detail.units.map((unit) => renderUnitCard(detail, unit)).join('')}
        </div>
      `;

    const footerActionsHtml = `
      <div class="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200">
        <span class="text-[11px] text-slate-500">
          Cada sitio (permanente y temporal) queda completo únicamente cuando cuenta con ≥ 1 auditor y <strong>SUM(días) === días requeridos</strong>.
        </span>
        <div class="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
          <button
            type="button"
            data-action="audit-breadcrumb-nav"
            data-target-subview="tiempo"
            class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 transition-colors cursor-pointer whitespace-nowrap"
          >
            ← 2. Tiempo
          </button>
          <button
            type="button"
            data-action="audit-breadcrumb-nav"
            data-target-subview="proceso"
            class="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white transition-colors cursor-pointer whitespace-nowrap"
          >
            Continuar a 4. Proceso →
          </button>
        </div>
      </div>
    `;

    bodyHtml = `
      <div class="space-y-4">
        ${summaryBannerHtml}
        ${missingTemporalRecordWarningHtml}
        ${unitsAreaHtml}
        ${footerActionsHtml}
      </div>
    `;
  }

  return renderAuditSectionShell({
    sectionTitle: '3. Auditor',
    sectionSymbol: '👥',
    backSubview: 'auditor',
    certInfo: {
      id: certRow.certId,
      numero_certificado: certRow.numero_certificado,
      organizacion_nombre: certRow.organizacion_nombre,
      organizacion_abreviacion: certRow.organizacion_abreviacion,
      norma_codigo: certRow.norma_codigo,
      estatus: certRow.estatus,
      version_numero: certRow.activeVersionNumero,
      alcance_es: certRow.alcance_es,
      alcance_en: certRow.alcance_en,
      hasAlcance: certRow.hasAlcance,
    },
    certificados,
    navigation,
    programs,
    showLinkedSiblings: false,
    isStaff,
    inCardBreadcrumbHtml,
    headerAddAuditHtml,
    tableName: 'auditoria',
    feedbackHtml,
    bodyHtml,
  });
}

