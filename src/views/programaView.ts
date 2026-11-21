import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import type { VinculoEntity } from '../lib/vinculoDomain';
import type {
  CertificadoDetailEntity,
  TurnoPorSitioLink,
} from '../lib/multisiteSampling';
import type { ProcesoPorSitioLink } from '../lib/sitioDomain';
import {
  computeSiteDayBalance,
  formatAuditDateLabel,
  resolveLatestPlannedDate,
  type AuditDateEntry,
  type ProgramaAuditoriaEntity,
} from '../lib/auditPlanningEngine';
import type { ProgramacionAuditEntity } from '../lib/auditExecution';
import {
  buildAuditProgramaSummaryRows,
  type AuditProgramaSummaryRow,
  type CandidateProcessEntity,
  type ProgramaCertCompletionState,
} from '../lib/programaCertificadoDomain';
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
import { renderDetailPageTemplate, type DetailParentChip } from './detailTemplate';
import { renderProgramaProcesosView } from './programaProcesosView';
import { renderProgramaTurnosView } from './programaTurnosView';
import {
  extractUniversalArchiveProps,
  type ArchiveMultiViewConfig,
} from '../lib/archiveGovernance';

export type ProgramaSortColumn = 'certificado' | 'procesos' | 'turnos' | 'estado';

export interface ProgramaViewState {
  query: string;
  viewMode: UniversalViewMode;
  isSidebarOpen: boolean;
  sortColumn: ProgramaSortColumn | null;
  sortDirection: SortDirection;
  facetSelections: MultiViewSelectionMap;
  selectedAuditId: string | null;
  activeMiniStep: 'procesos' | 'turnos';
  cycleWindowOffsetByAuditId: Record<string, number>;
  openHistoryDrawerProcessIds: string[];
  editErrorMessage: string | null;
}

export const DEFAULT_PROGRAMA_STATE: ProgramaViewState = {
  query: '',
  viewMode: 'list',
  isSidebarOpen: true,
  sortColumn: null,
  sortDirection: 'none',
  facetSelections: {},
  selectedAuditId: null,
  activeMiniStep: 'procesos',
  cycleWindowOffsetByAuditId: {},
  openHistoryDrawerProcessIds: [],
  editErrorMessage: null,
};

export interface ProgramaViewProps {
  profile: UserProfile;
  state: ProgramaViewState;
  audits: ReadonlyArray<ProgramacionAuditEntity>;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  vinculos?: ReadonlyArray<VinculoEntity>;
  certificados?: ReadonlyArray<CertificadoDetailEntity>;
  authorizedClientOrgIds?: ReadonlyArray<string>;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
  inCardBreadcrumbHtml?: string;
  headerAddAuditHtml?: string;
}

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

function formatDateSummaryCompact(entry: AuditDateEntry | null): string {
  if (!entry) return 'Sin fecha programada';
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

function resolveAuditPlannedDate(audit: ProgramacionAuditEntity): AuditDateEntry | null {
  return (
    resolveLatestPlannedDate(audit.fechas) ??
    (audit.latestDate && !audit.latestDate.deleted_at ? audit.latestDate : null)
  );
}

function getCompletionMeta(completionState: ProgramaCertCompletionState): {
  label: string;
  badgeClass: string;
  rank: number;
} {
  switch (completionState) {
    case 'COMPLETO':
      return {
        label: 'Completo ✓',
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        rank: 2,
      };
    case 'PENDIENTE_TURNOS':
      return {
        label: 'Pend. Turnos',
        badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
        rank: 1,
      };
    case 'PENDIENTE_PROCESOS':
    default:
      return {
        label: 'Pend. Procesos',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
        rank: 0,
      };
  }
}

function extractProcessCatalogFromCertificates(
  certificados: ReadonlyArray<CertificadoDetailEntity & { deleted_at?: string | null }>
): {
  allProcessesPorSitio: ProcesoPorSitioLink[];
  allProcesses: CandidateProcessEntity[];
  allTurnosPorSitio: TurnoPorSitioLink[];
} {
  const ppsMap = new Map<string, ProcesoPorSitioLink>();
  const procMap = new Map<string, CandidateProcessEntity>();
  const tpsMap = new Map<string, TurnoPorSitioLink>();

  for (const cert of certificados) {
    if (cert.deleted_at) continue;
    for (const proc of cert.procesos || []) {
      const candidate = proc as CandidateProcessEntity;
      if (!candidate.deleted_at && !procMap.has(candidate.id)) {
        procMap.set(candidate.id, candidate);
      }
    }
    for (const site of cert.sitios || []) {
      const candidateSite = site as {
        deleted_at?: string | null;
        procesos_por_sitio?: ProcesoPorSitioLink[];
        turnos_por_sitio?: TurnoPorSitioLink[];
      };
      if (candidateSite.deleted_at) continue;
      for (const link of candidateSite.procesos_por_sitio || []) {
        if (!link.deleted_at && !ppsMap.has(link.id)) {
          ppsMap.set(link.id, link);
        }
      }
      for (const shiftLink of candidateSite.turnos_por_sitio || []) {
        if (!shiftLink.deleted_at && !tpsMap.has(shiftLink.id)) {
          tpsMap.set(shiftLink.id, shiftLink);
        }
      }
    }
  }

  return {
    allProcessesPorSitio: Array.from(ppsMap.values()),
    allProcesses: Array.from(procMap.values()),
    allTurnosPorSitio: Array.from(tpsMap.values()),
  };
}

function filterAuditsByProfileRbac(
  audits: ReadonlyArray<ProgramacionAuditEntity>,
  profile: UserProfile,
  authorizedClientOrgIds?: ReadonlyArray<string>
): ProgramacionAuditEntity[] {
  if (!profile || profile.status !== 'APPROVED') return [];
  if (isApprovedStaffProfile(profile)) return audits.filter((a) => !a.deleted_at);

  if (profile.role === 'AUDITOR') {
    return audits.filter(
      (a) =>
        !a.deleted_at &&
        (a.auditor_lider_id === profile.id ||
          (a.equipo || []).some((m) => m.id_auditor === profile.id))
    );
  }

  if (profile.role === 'CLIENT') {
    if (authorizedClientOrgIds && authorizedClientOrgIds.length > 0) {
      const orgSet = new Set(authorizedClientOrgIds);
      return audits.filter((a) => !a.deleted_at && orgSet.has(a.id_organizacion));
    }
    return audits.filter((a) => !a.deleted_at);
  }

  return [];
}

export function renderProgramaView(props: ProgramaViewProps): string {
  const {
    profile,
    state,
    audits,
    programs,
    vinculos = [],
    certificados = [],
    authorizedClientOrgIds,
    loading,
    archiveConfig,
    tableColumnWidths,
    inCardBreadcrumbHtml = '',
    headerAddAuditHtml = '',
  } = props;

  const isStaff = isApprovedStaffProfile(profile);
  const activeVinculos = vinculos.filter((v) => !v.deleted_at);
  const activePrograms = programs.filter((p) => !p.deleted_at);
  const visibleAudits = filterAuditsByProfileRbac(audits, profile, authorizedClientOrgIds);
  const { allProcessesPorSitio, allProcesses, allTurnosPorSitio } =
    extractProcessCatalogFromCertificates(certificados);

  const summaryRows = buildAuditProgramaSummaryRows(
    visibleAudits,
    activePrograms,
    allProcessesPorSitio,
    allProcesses
  );

  if (state.selectedAuditId) {
    const selectedRow = summaryRows.find((r) => r.audit.id === state.selectedAuditId);
    if (selectedRow) {
      return renderProgramaDetailView({
        profile,
        state,
        row: selectedRow,
        allAudits: visibleAudits,
        vinculos: activeVinculos,
        allProcessesPorSitio,
        allProcesses,
        allTurnosPorSitio,
        isStaff,
        inCardBreadcrumbHtml,
        headerAddAuditHtml,
      });
    }
  }

  return renderProgramaMultiView({
    state,
    summaryRows,
    vinculos: activeVinculos,
    loading,
    archiveConfig,
    tableColumnWidths,
    headerAddAuditHtml,
  });
}

function renderProgramaMultiView(opts: {
  state: ProgramaViewState;
  summaryRows: ReadonlyArray<AuditProgramaSummaryRow>;
  vinculos: ReadonlyArray<VinculoEntity>;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
  headerAddAuditHtml?: string;
}): string {
  const {
    state,
    summaryRows,
    vinculos,
    loading,
    archiveConfig,
    tableColumnWidths,
    headerAddAuditHtml = '',
  } = opts;

  const uniqueStandards = Array.from(
    new Set(
      summaryRows
        .map((r) => (r.audit.norma_codigo || '').trim())
        .filter((s) => s.length > 0)
    )
  ).sort((a, b) => a.localeCompare(b));

  const facetCategories: MultiViewFacetCategory<AuditProgramaSummaryRow>[] = [
    {
      id: 'estado_programa',
      label: 'Estado Programa',
      options: [
        { value: 'PENDIENTE_PROCESOS', label: 'Pendientes de Procesos' },
        { value: 'PENDIENTE_TURNOS', label: 'Pendientes de Turnos' },
        { value: 'COMPLETO', label: 'Completos' },
      ],
      extractValues: (r) => r.completionState,
    },
    ...(uniqueStandards.length > 0
      ? [
          {
            id: 'norma',
            label: 'Norma',
            options: uniqueStandards.map((norma) => ({ value: norma, label: norma })),
            extractValues: (r: AuditProgramaSummaryRow) => (r.audit.norma_codigo || '').trim(),
          },
        ]
      : []),
    {
      id: 'nunca_auditados',
      label: 'Cobertura Histórica',
      options: [
        { value: 'CON_NUNCA_AUDITADOS', label: 'Con procesos nunca auditados' },
        { value: 'TODOS_AUDITADOS', label: 'Sin procesos nunca auditados' },
      ],
      extractValues: (r) =>
        r.neverAuditedEligibleCount > 0 ? 'CON_NUNCA_AUDITADOS' : 'TODOS_AUDITADOS',
    },
  ];

  const searchOptions = {
    getSearchableText: (row: AuditProgramaSummaryRow): string => {
      const vinculo = row.program?.id_vinculo
        ? vinculos.find((v) => v.id === row.program?.id_vinculo)
        : undefined;
      return [
        row.audit.numero_certificado,
        row.audit.organizacion_nombre,
        row.audit.norma_codigo,
        row.audit.codigo_auditoria,
        row.audit.tipo_auditoria,
        row.program?.etiqueta || '',
        row.program?.codigo_programa || '',
        vinculo?.etiqueta || '',
        vinculo?.codigo_vinculo || '',
      ].join(' ');
    },
  };

  const facetGroups = computeReactiveFacetCounts(
    summaryRows,
    state.query,
    facetCategories,
    state.facetSelections,
    searchOptions
  );

  const filteredRows = filterRecordsWithFacets(
    summaryRows,
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
          return `${row.audit.numero_certificado} ${row.audit.organizacion_nombre}`.toLowerCase();
        case 'procesos':
          return row.totalConfiguredProcesses;
        case 'turnos':
          return row.totalAssignedShifts;
        case 'estado':
          return getCompletionMeta(row.completionState).rank;
        default:
          return getCompletionMeta(row.completionState).rank;
      }
    }
  );

  const columns: ColumnDefinition<AuditProgramaSummaryRow>[] = [
    {
      id: 'certificado',
      header: 'Certificado & Org',
      defaultWidthPct: 30,
      minWidthPx: 185,
      sortable: true,
      renderCell: (row) => `
        <div class="min-w-0 space-y-0.5">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="font-mono text-xs font-bold text-slate-900 truncate">${escapeHtml(
              row.audit.numero_certificado
            )}</span>
            <span class="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
              ${escapeHtml(row.audit.norma_codigo)}
            </span>
          </div>
          <div class="text-[11px] text-slate-500 truncate">${escapeHtml(
            row.audit.organizacion_nombre
          )}</div>
        </div>
      `,
    },
    {
      id: 'campania',
      header: 'Vínculo / Fecha',
      defaultWidthPct: 24,
      minWidthPx: 155,
      sortable: false,
      renderCell: (row) => {
        const vinculo = row.program?.id_vinculo
          ? vinculos.find((v) => v.id === row.program?.id_vinculo)
          : undefined;
        const vinculoLabel =
          vinculo?.etiqueta || row.program?.etiqueta || row.audit.codigo_auditoria;
        const dateLabel = formatDateSummaryCompact(resolveAuditPlannedDate(row.audit));
        return `
          <div class="min-w-0 space-y-0.5">
            <div class="text-xs font-semibold text-slate-800 truncate">${escapeHtml(
              vinculoLabel
            )}</div>
            <div class="text-[11px] text-slate-500 truncate">${escapeHtml(
              row.audit.tipo_auditoria
            )} · ${escapeHtml(dateLabel)}</div>
          </div>
        `;
      },
    },
    {
      id: 'procesos',
      header: '8A · Procesos',
      defaultWidthPct: 18,
      minWidthPx: 125,
      sortable: true,
      renderCell: (row) => `
        <div class="min-w-0 space-y-0.5">
          <div class="text-xs font-bold text-slate-800 tabular-nums">
            ${row.totalConfiguredProcesses} proceso${row.totalConfiguredProcesses === 1 ? '' : 's'}
          </div>
          ${
            row.neverAuditedEligibleCount > 0
              ? `<span class="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200 whitespace-nowrap">⚠️ ${row.neverAuditedEligibleCount} nunca aud.</span>`
              : `<div class="text-[10px] text-slate-500 whitespace-nowrap">${row.selectedSitesCount} sitio${
                  row.selectedSitesCount === 1 ? '' : 's'
                }</div>`
          }
        </div>
      `,
    },
    {
      id: 'turnos',
      header: '8B · Turnos',
      defaultWidthPct: 14,
      minWidthPx: 110,
      sortable: true,
      renderCell: (row) => `
        <div class="text-xs font-semibold text-slate-700 tabular-nums whitespace-nowrap">
          ${row.totalAssignedShifts} turno${row.totalAssignedShifts === 1 ? '' : 's'} asignado${
            row.totalAssignedShifts === 1 ? '' : 's'
          }
        </div>
      `,
    },
    {
      id: 'estado',
      header: 'Estado Programa',
      defaultWidthPct: 14,
      minWidthPx: 115,
      sortable: true,
      renderCell: (row) => {
        const meta = getCompletionMeta(row.completionState);
        return `
          <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border ${meta.badgeClass} whitespace-nowrap">
            ${escapeHtml(meta.label)}
          </span>
        `;
      },
    },
  ];

  const renderCard = (row: AuditProgramaSummaryRow): string => {
    const meta = getCompletionMeta(row.completionState);
    const dateLabel = formatDateSummaryCompact(resolveAuditPlannedDate(row.audit));
    const vinculo = row.program?.id_vinculo
      ? vinculos.find((v) => v.id === row.program?.id_vinculo)
      : undefined;
    const vinculoLabel =
      vinculo?.etiqueta || row.program?.etiqueta || row.audit.codigo_auditoria;

    return `
      <article
        role="button"
        tabindex="0"
        data-action="select-programa-audit"
        data-audit-id="${escapeHtml(row.audit.id)}"
        aria-label="Abrir Programa de ${escapeHtml(row.audit.numero_certificado)}"
        class="text-left bg-white border border-slate-200 hover:border-slate-400 rounded-xl p-3.5 shadow-2xs transition-all cursor-pointer space-y-2.5 flex flex-col justify-between"
      >
        <div class="space-y-1.5">
          <div class="flex items-center justify-between gap-2">
            <span class="font-mono text-xs font-bold text-slate-900 truncate">${escapeHtml(
              row.audit.numero_certificado
            )}</span>
            <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${meta.badgeClass} shrink-0">
              ${escapeHtml(meta.label)}
            </span>
          </div>
          <h3 class="text-sm font-bold text-slate-900 line-clamp-1">${escapeHtml(
            row.audit.organizacion_nombre
          )}</h3>
          <p class="text-[11px] text-slate-500 truncate">${escapeHtml(
            row.audit.norma_codigo
          )} · ${escapeHtml(vinculoLabel)} · ${escapeHtml(dateLabel)}</p>
        </div>

        <div class="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px]">
          <span class="font-semibold text-slate-700 tabular-nums">
            ${row.totalConfiguredProcesses} proc · ${row.totalAssignedShifts} turnos
          </span>
          ${
            row.neverAuditedEligibleCount > 0
              ? `<span class="px-1.5 py-0.2 rounded bg-rose-50 text-rose-800 border border-rose-200 font-bold text-[10px] whitespace-nowrap">⚠️ ${row.neverAuditedEligibleCount} nunca aud.</span>`
              : `<span class="text-slate-500 text-[10px]">${row.selectedSitesCount} sitio${
                  row.selectedSitesCount === 1 ? '' : 's'
                }</span>`
          }
        </div>
      </article>
    `;
  };

  const archiveProps = extractUniversalArchiveProps(archiveConfig, 'programacion');

  return renderUniversalTemplate<AuditProgramaSummaryRow>({
    domainKey: 'programa',
    tableId: 'programa-main',
    title: 'Programa de Auditoría por Certificado',
    subtitle:
      'Selección individual de procesos por sitio (8A) y turnos por proceso (8B) con historial multi-anual de cobertura sobre certificados con Paso 3 y Paso 4 completos.',
    entityLabel: 'certificados en programa',
    searchQuery: state.query,
    searchPlaceholder: 'Buscar por certificado, organización, norma, vínculo o auditoría...',
    searchInputId: 'programaSearchInput',
    clearSearchBtnId: 'clearProgramaSearchBtn',
    totalCount: summaryRows.length,
    filteredCount: sortedRows.length,
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen,
    sortState: { column: state.sortColumn, direction: state.sortDirection },
    columnWidths: tableColumnWidths?.['programa-main'],
    facetGroups,
    items: sortedRows,
    columns,
    getRowAttrs: (row) =>
      `data-action="select-programa-audit" data-audit-id="${escapeHtml(
        row.audit.id
      )}" title="Configurar Programa para ${escapeHtml(row.audit.numero_certificado)}"`,
    renderCard,
    actionsHtml: headerAddAuditHtml,
    loading,
    emptyStateTitle: 'Sin auditorías elegibles para Programa',
    emptyStateMessage:
      'Complete Paso 3 (Tipo y Fecha) y Paso 4 (Sitio) en al menos un certificado para habilitar la programación granular de procesos y turnos.',
    ...archiveProps,
  });
}

function renderProgramaDetailView(opts: {
  profile: UserProfile;
  state: ProgramaViewState;
  row: AuditProgramaSummaryRow;
  allAudits: ReadonlyArray<ProgramacionAuditEntity>;
  vinculos: ReadonlyArray<VinculoEntity>;
  allProcessesPorSitio: ReadonlyArray<ProcesoPorSitioLink>;
  allProcesses: ReadonlyArray<CandidateProcessEntity>;
  allTurnosPorSitio: ReadonlyArray<TurnoPorSitioLink>;
  isStaff: boolean;
  inCardBreadcrumbHtml?: string;
  headerAddAuditHtml?: string;
}): string {
  const {
    profile,
    state,
    row,
    allAudits,
    vinculos,
    allProcessesPorSitio,
    allProcesses,
    allTurnosPorSitio,
    isStaff,
  } = opts;
  const { audit, program } = row;

  const vinculo = program?.id_vinculo
    ? vinculos.find((v) => v.id === program.id_vinculo)
    : undefined;
  const canNavigateToCertificate =
    profile.role === 'ADMIN' || profile.role === 'WORKER' || profile.role === 'CLIENT';
  const completionMeta = getCompletionMeta(row.completionState);
  const isComplete = row.completionState === 'COMPLETO';
  const activeSitesPlan = (audit.sitiosPlan || []).filter((sp) => !sp.deleted_at);
  const needsAuditorAssignment =
    activeSitesPlan.length === 0 ||
    activeSitesPlan.some((sp) => {
      const balance = computeSiteDayBalance(sp);
      const activeTeamCount = (sp.equipoSitio || []).filter((m) => !m.deleted_at).length;
      return balance.demandedDays <= 0 || !balance.isBalanced || activeTeamCount === 0;
    });
  const dateLabel = formatDateSummaryCompact(resolveAuditPlannedDate(audit));

  const parents: DetailParentChip[] = [
    ...(vinculo
      ? [
          {
            label: 'Vínculo Grupal',
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
      : program
      ? [
          {
            label: 'Campaña Grupal',
            value: `${program.codigo_programa ? `${program.codigo_programa} · ` : ''}${program.etiqueta}`,
            symbol: '📋',
            navAction: {
              nav: 'auditorias',
              subview: 'designacion/sitio',
              entityType: 'programa_auditoria' as const,
              entityId: program.id,
            },
          },
        ]
      : []),
    ...(canNavigateToCertificate && audit.id_certificado
      ? [
          {
            label: 'Certificado',
            value: `${audit.numero_certificado} · ${audit.norma_codigo}`,
            symbol: '📜',
            navAction: {
              nav: 'certificacion',
              subview: 'certificates',
              entityType: 'cert' as const,
              entityId: audit.id_certificado,
            },
          },
        ]
      : []),
    {
      label: 'Organización',
      value: audit.organizacion_nombre,
      symbol: '🏢',
      ...(canNavigateToCertificate && audit.id_organizacion
        ? {
            navAction: {
              nav: 'certificacion',
              subview: 'organizations',
              entityType: 'org' as const,
              entityId: audit.id_organizacion,
            },
          }
        : {}),
    },
  ];

  const backToGroupHtml = vinculo
    ? `
      <button
        type="button"
        data-parent-nav="true"
        data-nav="auditorias"
        data-subview="vinculo"
        data-parent-type="vinculo"
        data-entity-id="${escapeHtml(vinculo.id)}"
        class="px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-indigo-50 text-slate-700 hover:text-indigo-800 transition-colors cursor-pointer whitespace-nowrap"
      >
        ← Volver al Vínculo Grupal
      </button>
    `
    : `
      <button
        type="button"
        data-nav="auditorias"
        data-subview="vinculo"
        class="px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-indigo-50 text-slate-700 hover:text-indigo-800 transition-colors cursor-pointer whitespace-nowrap"
      >
        ← Volver al Vínculo Grupal
      </button>
    `;

  const certQuickChipHtml =
    canNavigateToCertificate && audit.id_certificado
      ? `
        <button
          type="button"
          data-parent-nav="true"
          data-nav="certificacion"
          data-subview="certificates"
          data-parent-type="cert"
          data-entity-id="${escapeHtml(audit.id_certificado)}"
          class="px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 transition-colors cursor-pointer whitespace-nowrap"
        >
          📜 Certificado
        </button>
      `
      : '';

  const crossStepLinksHtml = program
    ? `
      <button
        type="button"
        data-nav="auditorias"
        data-subview="designacion/sitio"
        data-parent-nav="true"
        data-parent-type="programa_auditoria"
        data-entity-id="${escapeHtml(program.id)}"
        class="px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-indigo-50 text-slate-700 hover:text-indigo-800 transition-colors cursor-pointer whitespace-nowrap"
      >
        ← Paso 4: Sitio
      </button>
      <button
        type="button"
        data-nav="auditorias"
        data-subview="tiempo"
        data-parent-nav="true"
        data-parent-type="programa_auditoria"
        data-entity-id="${escapeHtml(program.id)}"
        class="px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-indigo-50 text-slate-700 hover:text-indigo-800 transition-colors cursor-pointer whitespace-nowrap"
      >
        ← Paso 6: Tiempo
      </button>
      ${
        !(isComplete && needsAuditorAssignment)
          ? `
            <button
              type="button"
              data-nav="auditorias"
              data-subview="asignacion"
              data-parent-nav="true"
              data-parent-type="programa_auditoria"
              data-entity-id="${escapeHtml(program.id)}"
              class="px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-indigo-50 text-slate-700 hover:text-indigo-800 transition-colors cursor-pointer whitespace-nowrap"
            >
              ← Paso 7: Asignación
            </button>
          `
          : ''
      }
    `
    : '';

  const completionBridgeLinksHtml = isComplete
    ? `
      <span class="inline-flex flex-wrap items-center gap-1.5" data-testid="programa-next-step-bridges">
        <button
          type="button"
          data-nav="auditorias"
          data-subview="calendar"
          class="px-2.5 py-1 rounded-md border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 transition-colors cursor-pointer whitespace-nowrap"
        >
          📅 Calendario
        </button>
        ${
          needsAuditorAssignment
            ? program
              ? `
                <button
                  type="button"
                  data-nav="auditorias"
                  data-subview="asignacion"
                  data-parent-nav="true"
                  data-parent-type="programa_auditoria"
                  data-entity-id="${escapeHtml(program.id)}"
                  class="px-2.5 py-1 rounded-md border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 transition-colors cursor-pointer whitespace-nowrap"
                >
                  👥 Asignación (Paso 7) →
                </button>
              `
              : `
                <button
                  type="button"
                  data-nav="auditorias"
                  data-subview="asignacion"
                  class="px-2.5 py-1 rounded-md border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 transition-colors cursor-pointer whitespace-nowrap"
                >
                  👥 Asignación (Paso 7) →
                </button>
              `
            : `
              <button
                type="button"
                data-action="go-audit-results"
                data-audit-id="${escapeHtml(audit.id)}"
                class="px-2.5 py-1 rounded-md border border-emerald-300 bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer whitespace-nowrap"
              >
                ✅ Resultado (Paso 10) →
              </button>
            `
        }
      </span>
    `
    : '';

  const parentMetaHtml = `
    <div class="flex flex-wrap items-center justify-between gap-2 w-full bg-slate-50/80 border border-slate-200 rounded-xl px-3 py-2">
      <div class="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
        ${backToGroupHtml}
        ${certQuickChipHtml}
        ${crossStepLinksHtml}
        ${
          isComplete
            ? `<span data-testid="programa-complete-chip" class="px-2.5 py-1 rounded-md bg-emerald-600 text-white font-bold whitespace-nowrap">✓ Programa Completo</span>`
            : `<span class="px-2.5 py-1 rounded-md bg-slate-900 text-white font-bold whitespace-nowrap">Paso 8 · Programa (Activo)</span>`
        }
        ${completionBridgeLinksHtml}
      </div>
      <span class="text-[11px] font-semibold text-slate-500 tabular-nums whitespace-nowrap">
        ${row.selectedSitesCount} sitio${row.selectedSitesCount === 1 ? '' : 's'} · ${row.totalConfiguredProcesses} procesos · ${row.totalAssignedShifts} turnos
      </span>
    </div>
  `;

  const miniStepSwitcherHtml = `
    <div
      class="flex flex-wrap items-center justify-between gap-2 bg-slate-50/90 border border-slate-200 rounded-xl p-2"
      role="tablist"
      aria-label="Mini-pasos de Programa"
    >
      <div class="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          role="tab"
          aria-selected="${state.activeMiniStep === 'procesos' ? 'true' : 'false'}"
          data-action="set-programa-mini-step"
          data-mini-step="procesos"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
            state.activeMiniStep === 'procesos'
              ? 'bg-slate-900 text-white shadow-2xs'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
          }"
        >
          <span>8A · Procesos</span>
          <span class="px-1.5 py-0.2 rounded-full text-[10px] tabular-nums ${
            state.activeMiniStep === 'procesos'
              ? 'bg-white/20 text-white'
              : 'bg-slate-100 text-slate-700'
          }">${row.totalConfiguredProcesses}</span>
        </button>

        <span class="text-slate-400 text-xs font-bold" aria-hidden="true">→</span>

        <button
          type="button"
          role="tab"
          aria-selected="${state.activeMiniStep === 'turnos' ? 'true' : 'false'}"
          data-action="set-programa-mini-step"
          data-mini-step="turnos"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
            state.activeMiniStep === 'turnos'
              ? 'bg-slate-900 text-white shadow-2xs'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
          }"
        >
          <span>8B · Turnos</span>
          <span class="px-1.5 py-0.2 rounded-full text-[10px] tabular-nums ${
            state.activeMiniStep === 'turnos'
              ? 'bg-white/20 text-white'
              : 'bg-slate-100 text-slate-700'
          }">${row.totalAssignedShifts}</span>
        </button>
      </div>

      ${
        row.neverAuditedEligibleCount > 0
          ? `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 text-rose-800 border border-rose-200 text-[11px] font-bold whitespace-nowrap">⚠️ ${row.neverAuditedEligibleCount} proceso${
              row.neverAuditedEligibleCount === 1 ? '' : 's'
            } nunca auditado${row.neverAuditedEligibleCount === 1 ? '' : 's'}</span>`
          : '<span class="inline-flex items-center px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold whitespace-nowrap">Sin procesos omitidos históricamente</span>'
      }
    </div>
  `;

  const miniStepBodyHtml =
    state.activeMiniStep === 'turnos'
      ? renderProgramaTurnosView({
          audit,
          program,
          allAudits,
          allProcessesPorSitio,
          allProcesses,
          allTurnosPorSitio,
          isStaff,
          editErrorMessage: state.editErrorMessage,
        })
      : renderProgramaProcesosView({
          audit,
          program,
          allAudits,
          allProcessesPorSitio,
          allProcesses,
          cycleWindowOffset: state.cycleWindowOffsetByAuditId[audit.id] ?? 0,
          openHistoryDrawerProcessIds: state.openHistoryDrawerProcessIds,
          isStaff,
          editErrorMessage: state.editErrorMessage,
        });

  const customRecordBodyHtml = `
    <div class="space-y-4">
      ${miniStepSwitcherHtml}
      ${miniStepBodyHtml}
    </div>
  `;

  return renderDetailPageTemplate({
    entityType: 'Programa de Auditoría',
    entitySymbol: '📋',
    title: `${audit.numero_certificado} — ${audit.organizacion_nombre}`,
    eyebrowCode: audit.codigo_auditoria || undefined,
    subtitle: `${audit.norma_codigo} · ${audit.tipo_auditoria} · ${dateLabel}`,
    statusBadge: {
      label: isComplete ? '✓ Programa Completo' : completionMeta.label,
      badgeClass: completionMeta.badgeClass,
    },
    backButton: {
      label: 'Volver',
      nav: 'auditorias',
      subview: 'programa',
      action: 'back-to-programa-list',
    },
    topInCardHtml: opts.inCardBreadcrumbHtml || '',
    extraActionButtonsHtml: opts.headerAddAuditHtml || '',
    parents,
    parentMetaHtml,
    tableName: 'auditoria',
    recordId: audit.id,
    attributes: [],
    customRecordBodyHtml,
  });
}
