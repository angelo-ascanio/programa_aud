import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import type { ConglomeradoEntity } from '../lib/conglomeradoDomain';
import type { VinculoEntity } from '../lib/vinculoDomain';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import type { CertificateRecord } from '../lib/searchControls';
import {
  formatAuditDateLabel,
  resolveLatestPlannedDate,
  type AuditDateEntry,
  type ProgramaAuditoriaEntity,
} from '../lib/auditPlanningEngine';
import type { ProgramacionAuditEntity } from '../lib/auditExecution';
import {
  getLinkedSiblingAudits,
  resolveAuditNavigation,
} from '../lib/certificateAuditSelector';
import {
  computeAuditUrgencyClassification,
  requiresFutureYearWarning,
  type TipoQueuePreset,
} from '../lib/designacionTipoDomain';
import {
  buildCertificateSitioRows,
  buildSiteCycleMatrixForAudit,
  sliceCycleWindowColumns,
  type CandidateSiteEntity,
  type CertificateSitioRow,
  type SiteCycleMatrixRow,
} from '../lib/designacionSitioDomain';
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
import {
  extractUniversalArchiveProps,
  type ArchiveMultiViewConfig,
} from '../lib/archiveGovernance';

export type DesignacionSitioSortColumn = 'urgencia' | 'certificado' | 'cobertura_sitios';

export interface DesignacionSitioViewState {
  queuePreset: TipoQueuePreset;
  query: string;
  viewMode: UniversalViewMode;
  isSidebarOpen: boolean;
  sortColumn: DesignacionSitioSortColumn | null;
  sortDirection: SortDirection;
  facetSelections: MultiViewSelectionMap;
  selectedCertId: string | null;
  selectedAuditId: string | null;
  /** Legacy compatibility field */
  selectedProgramId?: string | null;
  cycleWindowOffsetByAuditId: Record<string, number>;
  notesDraftBySitePlanId: Record<string, string>;
  savingSiteToggleKey: string | null;
  savingNotesSiteId: string | null;
  editErrorMessage: string | null;
}

export const DEFAULT_DESIGNACION_SITIO_STATE: DesignacionSitioViewState = {
  queuePreset: 'TODAS',
  query: '',
  viewMode: 'list',
  isSidebarOpen: true,
  sortColumn: null,
  sortDirection: 'none',
  facetSelections: {},
  selectedCertId: null,
  selectedAuditId: null,
  selectedProgramId: null,
  cycleWindowOffsetByAuditId: {},
  notesDraftBySitePlanId: {},
  savingSiteToggleKey: null,
  savingNotesSiteId: null,
  editErrorMessage: null,
};

export interface DesignacionSitioViewProps {
  profile: UserProfile;
  state: DesignacionSitioViewState;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  allAudits: ReadonlyArray<ProgramacionAuditEntity>;
  vinculos: ReadonlyArray<VinculoEntity>;
  conglomerados: ReadonlyArray<ConglomeradoEntity>;
  certificados: ReadonlyArray<CertificadoDetailEntity>;
  certificates?: ReadonlyArray<CertificateRecord>;
  referenceIsoDate?: string;
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

function getCandidateSitesForAudit(
  audit: ProgramacionAuditEntity,
  certificados: ReadonlyArray<CertificadoDetailEntity & { deleted_at?: string | null }>
): CandidateSiteEntity[] {
  const cert = certificados.find((c) => !c.deleted_at && c.id === audit.id_certificado);
  if (cert && cert.sitios && cert.sitios.length > 0) {
    return cert.sitios;
  }
  const activePlan = (audit.sitiosPlan || []).filter((sp) => !sp.deleted_at);
  return activePlan.map((sp) => ({
    id: sp.id_sitio,
    id_certificado: audit.id_certificado,
    numero_sitio: sp.numero_sitio,
    nombre_sitio: sp.nombre_sitio,
    direccion_sitio: sp.direccion_sitio || '',
    deleted_at: null,
  }));
}

function computeMobileVisibleWindowIndices(
  visibleCellsCount: number,
  currentAuditLocalIndex: number
): Set<number> {
  if (visibleCellsCount <= 3) {
    return new Set(Array.from({ length: visibleCellsCount }, (_, idx) => idx));
  }
  const center =
    currentAuditLocalIndex >= 0 && currentAuditLocalIndex < visibleCellsCount
      ? currentAuditLocalIndex
      : Math.floor(visibleCellsCount / 2);

  let start = center - 1;
  if (start < 0) start = 0;
  if (start + 3 > visibleCellsCount) start = visibleCellsCount - 3;
  return new Set([start, start + 1, start + 2]);
}

function matchesCertificateSitioPreset(
  row: CertificateSitioRow,
  preset: TipoQueuePreset
): boolean {
  if (preset === 'TODAS') return true;
  if (preset === 'PREPROGRAMADAS') {
    return row.latestPlannedDate?.tipo_fecha === 'PREPROGRAMADA_MES';
  }
  if (preset === 'FUTURO') {
    return row.urgency.rank === 4 || row.urgency.rank === 5;
  }
  return row.urgency.rank <= 3 || row.urgency.bucket === 'SIN_FECHA';
}

export function renderDesignacionSitioView(props: DesignacionSitioViewProps): string {
  const {
    profile,
    state,
    programs,
    allAudits,
    certificados,
    certificates = [],
    referenceIsoDate,
    loading = false,
    archiveConfig,
    tableColumnWidths,
    inCardBreadcrumbHtml = '',
    headerAddAuditHtml = '',
  } = props;

  const isStaff = isApprovedStaffProfile(profile);
  const auditsPool =
    allAudits.length > 0
      ? allAudits.filter((a) => !a.deleted_at)
      : programs.filter((p) => !p.deleted_at).flatMap((p) => p.auditorias.filter((a) => !a.deleted_at));

  const allRows = buildCertificateSitioRows({
    certificates,
    detailedCerts: certificados,
    audits: auditsPool,
    programs,
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

  if (resolvedCertId) {
    const certRow = allRows.find((r) => r.certId === resolvedCertId) ?? null;
    if (certRow) {
      const effectiveAuditId = state.selectedAuditId ?? legacyProgramFirstAudit?.id ?? null;
      return renderSitioDetailView({
        state,
        certRow,
        effectiveAuditId,
        allAudits: auditsPool,
        programs,
        certificados,
        isStaff,
        referenceIsoDate,
        inCardBreadcrumbHtml,
        headerAddAuditHtml,
      });
    }
  }

  return renderSitioMultiView({
    state,
    allRows,
    loading,
    archiveConfig,
    tableColumnWidths,
    headerAddAuditHtml,
  });
}

function renderSitioMultiView(opts: {
  state: DesignacionSitioViewState;
  allRows: ReadonlyArray<CertificateSitioRow>;
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

  const proximasCount = allRows.filter((r) => matchesCertificateSitioPreset(r, 'PROXIMAS')).length;
  const preprogramadasCount = allRows.filter((r) =>
    matchesCertificateSitioPreset(r, 'PREPROGRAMADAS')
  ).length;
  const futuroCount = allRows.filter((r) => matchesCertificateSitioPreset(r, 'FUTURO')).length;
  const todasCount = allRows.length;

  const presetRows = allRows.filter((r) => matchesCertificateSitioPreset(r, state.queuePreset));

  const facetCategories: MultiViewFacetCategory<CertificateSitioRow>[] = [
    {
      id: 'urgencia',
      label: 'Ventana Temporal',
      options: [
        { value: 'VENCIDA', label: 'Vencida' },
        { value: 'PROXIMA_30D', label: 'Próxima ≤ 30 días' },
        { value: 'ESTE_TRIMESTRE', label: 'Este trimestre' },
        { value: 'ESTE_ANIO', label: 'Año en curso' },
        { value: 'ANIO_MAS_1', label: 'Año +1' },
        { value: 'FUTURO_LEJANO', label: 'Futuro (+2/+3 años)' },
        { value: 'SIN_FECHA', label: 'Sin fecha programada' },
      ],
      extractValues: (r) => r.urgency.bucket,
    },
    {
      id: 'cobertura_sitios',
      label: 'Cobertura de Sitios',
      options: [
        { value: 'COMPLETO', label: 'Con sitios asignados ✓' },
        { value: 'PENDIENTE', label: 'Sin sitios / Sin auditorías' },
      ],
      extractValues: (r) => (r.hasSitesConfigured ? 'COMPLETO' : 'PENDIENTE'),
    },
    {
      id: 'vinculacion',
      label: 'Lote / Vínculo',
      options: [
        { value: 'VINCULADA', label: 'Auditoría vinculada' },
        { value: 'INDIVIDUAL', label: 'Auditoría individual' },
        { value: 'SIN_AUDITORIA', label: 'Sin auditorías' },
      ],
      extractValues: (r) =>
        r.totalAudits === 0 ? 'SIN_AUDITORIA' : r.isLinkedLatest ? 'VINCULADA' : 'INDIVIDUAL',
    },
  ];

  const searchOptions = {
    getSearchableText: (row: CertificateSitioRow): string => {
      const siteNames = row.latestAudit
        ? (row.latestAudit.sitiosPlan || [])
            .filter((sp) => !sp.deleted_at)
            .map((sp) => sp.nombre_sitio)
            .join(' ')
        : '';
      return [
        row.numero_certificado,
        row.organizacion_nombre,
        row.norma_codigo,
        row.latestAudit?.codigo_auditoria || '',
        row.latestProgram?.etiqueta || '',
        row.siteCoverageLabel,
        siteNames,
      ].join(' ');
    },
  };

  const facetGroups = computeReactiveFacetCounts(
    presetRows,
    state.query,
    facetCategories,
    state.facetSelections,
    searchOptions
  );

  const filteredRows = filterRecordsWithFacets(
    presetRows,
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
        case 'urgencia':
          return row.urgency.rank;
        case 'certificado':
          return row.numero_certificado.toLowerCase();
        case 'cobertura_sitios':
          return row.selectedSitesCount;
        default:
          return row.urgency.rank;
      }
    }
  );

  const columns: ColumnDefinition<CertificateSitioRow>[] = [
    {
      id: 'urgencia',
      header: 'Ventana',
      defaultWidthPct: 14,
      minWidthPx: 115,
      sortable: true,
      renderCell: (row) => `
        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${row.urgency.badgeClass} whitespace-nowrap">
          ${escapeHtml(row.urgency.label)}
        </span>
      `,
    },
    {
      id: 'certificado',
      header: 'Certificado & Organización',
      defaultWidthPct: 32,
      minWidthPx: 195,
      sortable: true,
      renderCell: (row) => {
        const dateLabel = formatDateSummaryCompact(row.latestPlannedDate);
        return `
          <div class="min-w-0 space-y-0.5">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="font-mono text-xs font-bold text-slate-900 truncate">${escapeHtml(row.numero_certificado)}</span>
              <span class="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                ${escapeHtml(row.norma_codigo)}
              </span>
            </div>
            <div class="text-[11px] text-slate-500 truncate">${escapeHtml(row.organizacion_nombre)} · ${escapeHtml(dateLabel)}</div>
          </div>
        `;
      },
    },
    {
      id: 'cobertura_sitios',
      header: 'Sitios Asignados',
      defaultWidthPct: 22,
      minWidthPx: 165,
      sortable: true,
      renderCell: (row) => `
        <div class="min-w-0 space-y-0.5">
          <div class="text-xs font-bold text-slate-800 truncate">
            ${escapeHtml(row.siteCoverageLabel)}
          </div>
          <div class="text-[11px] text-slate-500 truncate">
            ${row.totalAudits} auditoría${row.totalAudits === 1 ? '' : 's'}
          </div>
        </div>
      `,
    },
    {
      id: 'vinculacion',
      header: 'Lote',
      defaultWidthPct: 18,
      minWidthPx: 130,
      sortable: false,
      renderCell: (row) =>
        row.totalAudits === 0
          ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-500 border border-slate-200 whitespace-nowrap">Sin aud.</span>`
          : row.isLinkedLatest
          ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 whitespace-nowrap">Lote (${row.linkedSiblingCount})</span>`
          : `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">Individual</span>`,
    },
    {
      id: 'estado_paso',
      header: 'Estado Sitio',
      defaultWidthPct: 14,
      minWidthPx: 110,
      sortable: false,
      renderCell: (row) =>
        row.totalAudits === 0
          ? `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-500 border border-slate-200 whitespace-nowrap">Sin aud.</span>`
          : row.hasSitesConfigured
          ? `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap">Sitio ✓</span>`
          : `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">Pendiente</span>`,
    },
  ];

  const renderCard = (row: CertificateSitioRow): string => {
    const dateLabel = formatDateSummaryCompact(row.latestPlannedDate);
    return `
      <article
        role="button"
        tabindex="0"
        data-action="select-section-cert"
        data-cert-id="${escapeHtml(row.certId)}"
        aria-label="Seleccionar sitios para ${escapeHtml(row.numero_certificado)}"
        class="text-left bg-white border border-slate-200 hover:border-slate-400 rounded-xl p-3.5 shadow-2xs transition-all cursor-pointer space-y-2.5 flex flex-col justify-between"
      >
        <div class="space-y-1.5">
          <div class="flex items-center justify-between gap-2">
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${row.urgency.badgeClass}">
              ${escapeHtml(row.urgency.label)}
            </span>
            <span class="text-[11px] font-bold ${row.hasSitesConfigured ? 'text-emerald-700' : 'text-amber-700'}">
              ${row.totalAudits === 0 ? 'Sin aud.' : row.hasSitesConfigured ? 'Sitio ✓' : 'Pendiente'}
            </span>
          </div>
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="font-mono text-xs font-bold text-slate-900">${escapeHtml(row.numero_certificado)}</span>
            <span class="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              ${escapeHtml(row.norma_codigo)}
            </span>
          </div>
          <p class="text-[11px] text-slate-500 truncate">${escapeHtml(row.organizacion_nombre)}</p>
        </div>
        <div class="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px] text-slate-600">
          <span class="font-semibold truncate">${escapeHtml(row.siteCoverageLabel)}</span>
          <span class="shrink-0 text-slate-500 truncate">${escapeHtml(dateLabel)}</span>
        </div>
      </article>
    `;
  };

  const presetButton = (
    preset: TipoQueuePreset,
    label: string,
    count: number,
    activeClass: string
  ): string => {
    const isActive = state.queuePreset === preset;
    return `
      <button
        type="button"
        data-action="set-designacion-sitio-preset"
        data-preset="${preset}"
        aria-pressed="${isActive ? 'true' : 'false'}"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
          isActive
            ? activeClass
            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-transparent'
        }"
      >
        <span>${escapeHtml(label)}</span>
        <span class="px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
          isActive ? 'bg-white/20 text-white' : 'bg-white text-slate-700 border border-slate-200'
        }">${count}</span>
      </button>
    `;
  };

  const presetBarHtml = `
    <div class="flex flex-wrap items-center justify-between gap-2 bg-slate-50/80 border border-slate-200 rounded-xl px-3 py-2">
      <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Ventana temporal de certificados">
        ${presetButton('TODAS', 'Todos', todasCount, 'bg-slate-900 text-white shadow-2xs')}
        ${presetButton('PROXIMAS', 'Próximas a ejecutar', proximasCount, 'bg-slate-800 text-white shadow-2xs')}
        ${presetButton('PREPROGRAMADAS', 'Preprogramadas Mes', preprogramadasCount, 'bg-sky-700 text-white shadow-2xs')}
        ${presetButton('FUTURO', 'Futuro +1/+3 años', futuroCount, 'bg-indigo-700 text-white shadow-2xs')}
      </div>
    </div>
  `;

  const archiveProps = extractUniversalArchiveProps(archiveConfig, 'programacion');

  return renderUniversalTemplate<CertificateSitioRow>({
    domainKey: 'designacion-sitio',
    tableId: 'designacion-sitio-main',
    title: 'Designación → Sitio de Auditoría',
    subtitle:
      'Selector matriz multi-anual de sitios permanentes por certificado individual. Administre sedes auditables, historial IAF MD 1 y alcance por sitio.',
    entityLabel: 'certificados',
    searchQuery: state.query,
    searchPlaceholder: 'Buscar por certificado, organización, norma o sitio...',
    searchInputId: 'designacion-sitioSearchInput',
    clearSearchBtnId: 'clearDesignacionSitioSearchBtn',
    totalCount: presetRows.length,
    filteredCount: sortedRows.length,
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen,
    sortState: { column: state.sortColumn, direction: state.sortDirection },
    columnWidths: tableColumnWidths?.['designacion-sitio-main'],
    facetGroups,
    items: sortedRows,
    columns,
    getRowAttrs: (row) =>
      `data-action="select-section-cert" data-cert-id="${escapeHtml(row.certId)}" title="Configurar sitios de ${escapeHtml(row.numero_certificado)}"`,
    renderCard,
    actionsHtml: headerAddAuditHtml,
    inlineFormHtml: presetBarHtml,
    loading,
    emptyStateTitle:
      allRows.length > 0
        ? 'No hay certificados que coincidan con el filtro en Sitio'
        : 'Sin certificados disponibles en Designación → Sitio',
    emptyStateMessage:
      allRows.length > 0
        ? 'Ajuste el filtro temporal o de búsqueda.'
        : 'Use "+ Auditoría" para programar la primera auditoría y seleccionar sitios permanentes.',
    ...archiveProps,
  });
}

function renderSitioDetailView(opts: {
  state: DesignacionSitioViewState;
  certRow: CertificateSitioRow;
  effectiveAuditId: string | null;
  allAudits: ReadonlyArray<ProgramacionAuditEntity>;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  certificados: ReadonlyArray<CertificadoDetailEntity>;
  isStaff: boolean;
  referenceIsoDate?: string;
  inCardBreadcrumbHtml?: string;
  headerAddAuditHtml?: string;
}): string {
  const {
    state,
    certRow,
    effectiveAuditId,
    allAudits,
    programs,
    certificados,
    isStaff,
    referenceIsoDate,
    inCardBreadcrumbHtml = '',
    headerAddAuditHtml = '',
  } = opts;

  const navigation = resolveAuditNavigation(
    certRow.certId,
    effectiveAuditId,
    allAudits
  );
  const activeAudit = navigation.activeAudit;
  const linkedCtx = getLinkedSiblingAudits(activeAudit, allAudits, programs);

  const urgency = activeAudit
    ? computeAuditUrgencyClassification(
        resolveLatestPlannedDate(activeAudit.fechas) ?? activeAudit.latestDate ?? null,
        activeAudit.estado_ciclo || 'Borrador',
        referenceIsoDate
      )
    : certRow.urgency;
  const futureWarningMessage = requiresFutureYearWarning(urgency);

  const errorBannerHtml = state.editErrorMessage
    ? `
      <div role="alert" class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800 flex items-center gap-2">
        <span aria-hidden="true">⚠️</span>
        <span>${escapeHtml(state.editErrorMessage)}</span>
      </div>
    `
    : '';

  const renderMatrixSiteRow = (
    audit: ProgramacionAuditEntity,
    matrixRow: SiteCycleMatrixRow,
    windowOffset: number
  ): string => {
    const activePlanEntry = (audit.sitiosPlan || []).find(
      (sp) => !sp.deleted_at && sp.id_sitio === matrixRow.site.id
    );
    const toggleKey = `${audit.id}:${matrixRow.site.id}`;
    const isSavingSite = state.savingSiteToggleKey === toggleKey;
    const isBlockedLastSite = matrixRow.isSelectedInCurrentAudit && !matrixRow.canDeselect;
    const checkboxDisabled = !isStaff || isBlockedLastSite || isSavingSite;
    const checkboxId = `step4SiteChk_${audit.id}_${matrixRow.site.id}`;

    const sliced = sliceCycleWindowColumns(
      matrixRow.timelineCells,
      matrixRow.currentAuditIndex,
      windowOffset,
      5
    );
    const currentLocalIdx = sliced.visible.findIndex((c) => c.isCurrentAudit);
    const mobileVisibleSet = computeMobileVisibleWindowIndices(
      sliced.visible.length,
      currentLocalIdx
    );

    const addressText =
      matrixRow.site.direccion_sitio ||
      matrixRow.site.tipo_sitio ||
      'Dirección sin especificar';

    const noteDraftValue = activePlanEntry
      ? (state.notesDraftBySitePlanId ?? {})[activePlanEntry.id] ?? (activePlanEntry.notas_sitio || '')
      : '';
    const isSavingNotes = activePlanEntry
      ? state.savingNotesSiteId === activePlanEntry.id
      : false;

    return `
      <div
        data-testid="site-cycle-row"
        data-site-number="${matrixRow.site.numero_sitio}"
        class="p-3 rounded-xl border transition-colors space-y-2.5 ${
          matrixRow.isSelectedInCurrentAudit
            ? 'border-indigo-200 bg-indigo-50/25'
            : 'border-slate-200 bg-white'
        }"
      >
        <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5">
          <div class="min-w-0 flex-1 space-y-1.5">
            <label
              for="${escapeHtml(checkboxId)}"
              class="inline-flex items-start gap-2.5 min-h-[36px] w-full ${
                checkboxDisabled ? 'cursor-not-allowed opacity-85' : 'cursor-pointer'
              }"
            >
              <input
                type="checkbox"
                id="${escapeHtml(checkboxId)}"
                data-action="toggle-step4-site"
                data-audit-id="${escapeHtml(audit.id)}"
                data-site-id="${escapeHtml(matrixRow.site.id)}"
                data-sitio-auditoria-id="${escapeHtml(activePlanEntry?.id || '')}"
                data-currently-selected="${matrixRow.isSelectedInCurrentAudit ? 'true' : 'false'}"
                ${matrixRow.isSelectedInCurrentAudit ? 'checked' : ''}
                ${checkboxDisabled ? 'disabled' : ''}
                class="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
              />
              <span class="min-w-0 flex-1 space-y-0.5">
                <span class="flex flex-wrap items-center gap-1.5">
                  ${
                    matrixRow.isPrincipalHq
                      ? '<span class="inline-flex items-center px-2 py-0.2 rounded-md text-[10px] font-bold bg-indigo-100 text-indigo-900 border border-indigo-200 whitespace-nowrap">Sitio 0 (HQ)</span>'
                      : `<span class="inline-flex items-center px-2 py-0.2 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">Sitio #${matrixRow.site.numero_sitio}</span>`
                  }
                  <span class="text-xs font-bold text-slate-900 truncate">${escapeHtml(
                    matrixRow.site.nombre_sitio
                  )}</span>
                  ${
                    isSavingSite
                      ? '<span class="text-[10px] font-semibold text-indigo-600">Guardando...</span>'
                      : isBlockedLastSite && isStaff
                      ? '<span class="text-[10px] font-semibold text-slate-400">Mín. 1 sitio</span>'
                      : ''
                  }
                </span>
                <span class="block text-[11px] text-slate-500 truncate">${escapeHtml(addressText)}</span>
              </span>
            </label>

            <div class="flex flex-wrap items-center gap-1.5 pl-6">
              <span class="inline-flex items-center px-2 py-0.2 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                Última auditoría: ${escapeHtml(matrixRow.lastAuditedLabel)}
              </span>
              <span class="inline-flex items-center px-2 py-0.2 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                En ciclo: ${matrixRow.auditedCountInWindow}/${matrixRow.totalVisitsInWindow}
              </span>
            </div>
          </div>

          <div class="flex items-center gap-1.5 w-full lg:w-auto lg:min-w-[340px] lg:max-w-[440px]">
            <button
              type="button"
              data-action="page-step4-cycle"
              data-audit-id="${escapeHtml(audit.id)}"
              data-delta="-1"
              aria-label="Ventana de ciclo anterior para ${escapeHtml(audit.codigo_auditoria)}"
              ${!sliced.canPagePrev ? 'disabled' : ''}
              class="w-7 h-7 shrink-0 inline-flex items-center justify-center rounded-lg border text-xs font-bold transition-colors ${
                sliced.canPagePrev
                  ? 'border-slate-300 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer'
                  : 'border-slate-200 bg-slate-50 text-slate-300 cursor-not-allowed'
              }"
            >
              ◀
            </button>

            <div class="grid grid-cols-3 sm:grid-cols-5 gap-1.5 min-w-0 flex-1">
              ${
                sliced.visible.length === 0
                  ? '<div class="col-span-3 sm:col-span-5 text-center text-[10px] text-slate-400 py-1.5">Sin ciclo</div>'
                  : sliced.visible
                      .map((cell, colIdx) => {
                        const mobileVisibilityClass = mobileVisibleSet.has(colIdx)
                          ? 'flex'
                          : 'hidden sm:flex';
                        return `
                          <div
                            class="${mobileVisibilityClass} flex-col items-center justify-center rounded-lg border px-1.5 py-1 min-w-0 text-center ${cell.badgeClass}"
                            title="${escapeHtml(`${cell.yearLabel} · ${cell.auditTypeLabel} · ${cell.shortTag}`)}"
                          >
                            <span class="text-[10px] font-bold leading-tight truncate max-w-full">
                              ${escapeHtml(cell.yearLabel)}${cell.isCurrentAudit ? ' ★' : ''}
                            </span>
                            <span class="text-[9px] font-semibold leading-tight truncate max-w-full opacity-95">
                              ${escapeHtml(cell.shortTag)}
                            </span>
                          </div>
                        `;
                      })
                      .join('')
              }
            </div>

            <button
              type="button"
              data-action="page-step4-cycle"
              data-audit-id="${escapeHtml(audit.id)}"
              data-delta="1"
              aria-label="Ventana de ciclo siguiente para ${escapeHtml(audit.codigo_auditoria)}"
              ${!sliced.canPageNext ? 'disabled' : ''}
              class="w-7 h-7 shrink-0 inline-flex items-center justify-center rounded-lg border text-xs font-bold transition-colors ${
                sliced.canPageNext
                  ? 'border-slate-300 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer'
                  : 'border-slate-200 bg-slate-50 text-slate-300 cursor-not-allowed'
              }"
            >
              ▶
            </button>
          </div>
        </div>

        ${
          matrixRow.isSelectedInCurrentAudit && activePlanEntry
            ? `
              <div class="pl-6 pt-2 border-t border-indigo-100/80 flex flex-col sm:flex-row sm:items-center gap-2">
                ${
                  isStaff
                    ? `
                      <label for="sitioNotes_${escapeHtml(activePlanEntry.id)}" class="sr-only">
                        Observación / Alcance para ${escapeHtml(matrixRow.site.nombre_sitio)}
                      </label>
                      <input
                        type="text"
                        id="sitioNotes_${escapeHtml(activePlanEntry.id)}"
                        data-sitio-notes-id="${escapeHtml(activePlanEntry.id)}"
                        data-audit-id="${escapeHtml(audit.id)}"
                        maxlength="300"
                        value="${escapeHtml(noteDraftValue)}"
                        placeholder="Observación o alcance específico de esta sede en la auditoría..."
                        class="flex-1 h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                      />
                      <button
                        type="button"
                        data-action="save-sitio-notes"
                        data-sitio-auditoria-id="${escapeHtml(activePlanEntry.id)}"
                        data-audit-id="${escapeHtml(audit.id)}"
                        ${isSavingNotes ? 'disabled' : ''}
                        class="h-8 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-bold text-slate-800 cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
                      >
                        ${isSavingNotes ? 'Guardando...' : 'Guardar observación'}
                      </button>
                    `
                    : noteDraftValue
                    ? `
                      <div class="text-[11px] text-slate-600">
                        <span class="font-bold text-slate-700">Observación:</span>
                        <span>${escapeHtml(noteDraftValue)}</span>
                      </div>
                    `
                    : ''
                }
              </div>
            `
            : ''
        }
      </div>
    `;
  };

  let bodyHtml = '';
  if (activeAudit) {
    const candidateSites = getCandidateSitesForAudit(activeAudit, certificados);
    const matrixRows = buildSiteCycleMatrixForAudit(activeAudit, candidateSites, allAudits);
    const selectedCount = matrixRows.filter((m) => m.isSelectedInCurrentAudit).length;
    const windowOffset = (state.cycleWindowOffsetByAuditId ?? {})[activeAudit.id] ?? 0;

    bodyHtml = `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 bg-slate-50/70 border border-slate-200 rounded-xl px-3 py-2">
          <span>
            Marque los sitios auditables para <strong class="text-slate-800">${escapeHtml(
              activeAudit.numero_certificado
            )}</strong> (${escapeHtml(activeAudit.codigo_auditoria)}). <strong class="text-slate-800">Sitio 0 (HQ)</strong> aparece primero por defecto.
          </span>
          <button
            type="button"
            data-action="audit-breadcrumb-nav"
            data-target-subview="designacion/temporal"
            class="px-2.5 py-1 rounded-md border border-violet-200 bg-violet-50 hover:bg-violet-100 text-[11px] font-bold text-violet-900 cursor-pointer whitespace-nowrap"
          >
            Configurar Sitio Temporal →
          </button>
        </div>

        <section
          data-testid="site-cycle-matrix-card"
          data-audit-id="${escapeHtml(activeAudit.id)}"
          class="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden"
        >
          <header class="bg-slate-50/90 border-b border-slate-200 px-3.5 py-3 flex flex-wrap items-center justify-between gap-2">
            <div class="min-w-0 space-y-0.5">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="text-xs font-bold text-slate-900 truncate">${escapeHtml(
                  activeAudit.organizacion_nombre
                )}</span>
                <span class="font-mono text-[11px] font-bold px-1.5 py-0.2 rounded bg-white text-slate-800 border border-slate-300 whitespace-nowrap">
                  ${escapeHtml(activeAudit.numero_certificado)}
                </span>
                <span class="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-200/70 text-slate-700 whitespace-nowrap">
                  ${escapeHtml(activeAudit.norma_codigo)}
                </span>
                <span class="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200 whitespace-nowrap">
                  ${escapeHtml(activeAudit.codigo_auditoria)} · ${escapeHtml(activeAudit.tipo_auditoria)}
                </span>
              </div>
              <div class="text-[11px] text-slate-500">
                ${selectedCount} sitio${selectedCount === 1 ? '' : 's'} seleccionado${
                  selectedCount === 1 ? '' : 's'
                } de ${matrixRows.length} sede${matrixRows.length === 1 ? ' permanente' : 's permanentes'}
              </div>
            </div>
          </header>

          <div class="p-3 sm:p-3.5 space-y-2">
            ${
              matrixRows.length === 0
                ? `
                  <div class="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-500">
                    Este certificado no tiene sitios permanentes activos configurados en el directorio de Certificados.
                  </div>
                `
                : matrixRows
                    .map((mRow) => renderMatrixSiteRow(activeAudit, mRow, windowOffset))
                    .join('')
            }
          </div>
        </section>
      </div>
    `;
  }

  return renderAuditSectionShell({
    sectionTitle: 'Designación → Sitio',
    sectionSymbol: '📍',
    backSubview: 'designacion/sitio',
    certInfo: {
      id: certRow.certId,
      numero_certificado: certRow.numero_certificado,
      organizacion_nombre: certRow.organizacion_nombre,
      norma_codigo: certRow.norma_codigo,
      estatus: certRow.estatus,
    },
    navigation,
    programs,
    linkedSiblings: linkedCtx.siblings,
    showLinkedSiblings: true,
    isStaff,
    inCardBreadcrumbHtml,
    headerAddAuditHtml,
    tableName: 'auditoria_sitio',
    feedbackHtml: errorBannerHtml,
    futureWarningMessage,
    bodyHtml,
  });
}
