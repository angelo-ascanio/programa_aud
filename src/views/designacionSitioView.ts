import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import type { ConglomeradoEntity } from '../lib/conglomeradoDomain';
import type { VinculoEntity } from '../lib/vinculoDomain';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import type { CertificateRecord } from '../lib/searchControls';
import {
  formatAuditDateLabel,
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
  resolveLastAddedPlannedDate,
  type TipoQueuePreset,
} from '../lib/designacionTipoDomain';
import {
  SITE_COVERAGE_SORT_OPTIONS,
  buildCertificateSitioRows,
  buildSiteCoverageModalModel,
  buildSitioLinkedAuditModels,
  type CandidateSiteEntity,
  type CertificateSitioRow,
  type SiteCoverageSortMode,
  type SitioAssignmentItem,
  type SitioLinkedAuditModel,
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

export type DesignacionSitioSortColumn =
  | 'urgencia'
  | 'certificado'
  | 'estatus_cert'
  | 'cobertura_sitios';

export interface DesignacionSitioViewState {
  query: string;
  viewMode: UniversalViewMode;
  isSidebarOpen: boolean;
  sortColumn: DesignacionSitioSortColumn | null;
  sortDirection: SortDirection;
  facetSelections: MultiViewSelectionMap;
  selectedCertId: string | null;
  selectedAuditId: string | null;
  /** Legacy compatibility fields */
  selectedProgramId?: string | null;
  queuePreset?: TipoQueuePreset;
  cycleWindowOffsetByAuditId: Record<string, number>;
  notesDraftBySitePlanId: Record<string, string>;
  savingSiteToggleKey: string | null;
  savingNotesSiteId: string | null;
  editErrorMessage: string | null;
  coverageModalCertId: string | null;
  coverageModalAuditId: string | null;
  coverageSortMode: SiteCoverageSortMode;
  coverageWindowOffset: number;
}

export const DEFAULT_DESIGNACION_SITIO_STATE: DesignacionSitioViewState = {
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
  coverageModalCertId: null,
  coverageModalAuditId: null,
  coverageSortMode: 'SITE_NUMBER',
  coverageWindowOffset: 0,
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

const PREFERRED_CERT_STATUS_ORDER: readonly string[] = [
  'Activo',
  'Estudio',
  'Suspendido',
  'Cancelado',
  'Retirado',
  'Vencido',
  'En Espera',
  'Inactivo',
];

function buildCertificateStatusFacetOptions(
  allRows: ReadonlyArray<CertificateSitioRow>
): Array<{ value: string; label: string }> {
  const uniqueValues = Array.from(
    new Set(
      allRows
        .map((r) => (r.estatus || '').trim())
        .filter((s) => s.length > 0)
    )
  );

  uniqueValues.sort((a, b) => {
    const idxA = PREFERRED_CERT_STATUS_ORDER.findIndex(
      (p) => p.toLowerCase() === a.toLowerCase()
    );
    const idxB = PREFERRED_CERT_STATUS_ORDER.findIndex(
      (p) => p.toLowerCase() === b.toLowerCase()
    );
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b, 'es');
  });

  return uniqueValues.map((status) => ({
    value: status,
    label: status,
  }));
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

function mergeAuditsPool(
  programs: ReadonlyArray<ProgramaAuditoriaEntity>,
  allAudits: ReadonlyArray<ProgramacionAuditEntity>
): ProgramacionAuditEntity[] {
  const byId = new Map<string, ProgramacionAuditEntity>();
  for (const a of allAudits) {
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
  const auditsPool = mergeAuditsPool(programs, allAudits);

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

  const statusFacetOptions = buildCertificateStatusFacetOptions(allRows);

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
      id: 'estatus_certificado',
      label: 'Estatus Certificado',
      options: statusFacetOptions,
      extractValues: (r) => (r.estatus || '').trim() || 'Sin estatus',
    },
    {
      id: 'cobertura_sitios',
      label: 'Cobertura de Sitios',
      options: [
        { value: 'COMPLETO', label: 'Con sitios asignados' },
        { value: 'PENDIENTE', label: 'Sin sitios / Sin auditorías' },
      ],
      extractValues: (r) => (r.hasSitesConfigured ? 'COMPLETO' : 'PENDIENTE'),
    },
    {
      id: 'vinculacion',
      label: 'Vínculo',
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
        row.estatus,
        row.latestAudit?.codigo_auditoria || '',
        row.latestProgram?.etiqueta || '',
        row.siteCoverageLabel,
        row.assignedSitesPreview,
        row.linkShortLabel,
        siteNames,
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
        case 'urgencia':
          return row.urgency.rank;
        case 'certificado':
          return row.numero_certificado.toLowerCase();
        case 'estatus_cert':
          return row.estatus.toLowerCase();
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
      defaultWidthPct: 13,
      minWidthPx: 110,
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
      defaultWidthPct: 31,
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
      id: 'estatus_cert',
      header: 'Estatus Cert.',
      defaultWidthPct: 13,
      minWidthPx: 110,
      sortable: true,
      renderCell: (row) => `
        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${row.certStatusBadgeClass} whitespace-nowrap">
          ${escapeHtml(row.estatus || 'Sin estatus')}
        </span>
      `,
    },
    {
      id: 'cobertura_sitios',
      header: 'Sitios Asignados',
      defaultWidthPct: 27,
      minWidthPx: 175,
      sortable: true,
      renderCell: (row) => `
        <div class="min-w-0 space-y-0.5">
          <div class="text-xs font-semibold text-slate-800 truncate tabular-nums">
            ${escapeHtml(row.siteCoverageLabel)}
          </div>
          <div class="text-[11px] text-slate-500 truncate" title="${escapeHtml(row.assignedSitesPreview)}">
            ${escapeHtml(row.assignedSitesPreview)}
          </div>
        </div>
      `,
    },
    {
      id: 'vinculacion',
      header: 'Vínculo',
      defaultWidthPct: 16,
      minWidthPx: 115,
      sortable: false,
      renderCell: (row) => {
        const linkCls =
          row.totalAudits === 0
            ? 'font-semibold bg-slate-100 text-slate-500 border-slate-200'
            : row.isLinkedLatest
            ? 'font-bold bg-indigo-50 text-indigo-800 border-indigo-200'
            : 'font-semibold bg-slate-100 text-slate-700 border-slate-200';
        return `<span title="${escapeHtml(row.linkFullTooltip)}" class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border ${linkCls} whitespace-nowrap">${escapeHtml(row.linkShortLabel)}</span>`;
      },
    },
  ];

  const renderCard = (row: CertificateSitioRow): string => {
    const linkCls =
      row.totalAudits === 0
        ? 'font-semibold bg-slate-100 text-slate-500 border-slate-200'
        : row.isLinkedLatest
        ? 'font-bold bg-indigo-50 text-indigo-800 border-indigo-200'
        : 'font-semibold bg-slate-100 text-slate-700 border-slate-200';

    return `
      <article
        role="button"
        tabindex="0"
        data-action="select-section-cert"
        data-cert-id="${escapeHtml(row.certId)}"
        aria-label="Gestionar sitios de ${escapeHtml(row.numero_certificado)}"
        class="text-left bg-white border border-slate-200 hover:border-slate-400 rounded-xl p-3.5 shadow-2xs transition-all cursor-pointer space-y-2.5 flex flex-col justify-between"
      >
        <div class="space-y-1.5">
          <div class="flex items-center justify-between gap-2">
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${row.urgency.badgeClass} whitespace-nowrap">
              ${escapeHtml(row.urgency.label)}
            </span>
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${row.certStatusBadgeClass} whitespace-nowrap">
              ${escapeHtml(row.estatus || 'Sin estatus')}
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
          <span class="font-semibold truncate tabular-nums" title="${escapeHtml(row.assignedSitesPreview)}">📍 ${escapeHtml(row.siteCoverageLabel)}</span>
          <span
            title="${escapeHtml(row.linkFullTooltip)}"
            class="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] border ${linkCls} whitespace-nowrap"
          >
            ${escapeHtml(row.linkShortLabel)}
          </span>
        </div>
      </article>
    `;
  };

  const archiveProps = extractUniversalArchiveProps(archiveConfig, 'sitios_por_auditoria');

  return renderUniversalTemplate<CertificateSitioRow>({
    domainKey: 'designacion-sitio',
    tableId: 'designacion-sitio-main',
    title: 'Designación → Sitio',
    subtitle:
      'Asignación individual de sitios permanentes por auditoría (Sitio 0 HQ obligatorio) y cobertura multi-ciclo.',
    entityLabel: 'certificados',
    searchQuery: state.query,
    searchPlaceholder: 'Buscar por certificado, organización, norma o sitio...',
    searchInputId: 'designacion-sitioSearchInput',
    clearSearchBtnId: 'clearDesignacionSitioSearchBtn',
    totalCount: allRows.length,
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
    loading,
    emptyStateTitle: 'Sin certificados disponibles en Designación → Sitio',
    emptyStateMessage:
      'Use "+ Auditoría" para programar la primera auditoría y asignar sus sitios.',
    ...archiveProps,
  });
}

function renderSiteAssignmentRow(opts: {
  audit: ProgramacionAuditEntity;
  item: SitioAssignmentItem;
  savingSiteToggleKey: string | null;
  isStaff: boolean;
}): string {
  const { audit, item, savingSiteToggleKey, isStaff } = opts;
  const { site, isPrincipalHq, isSelected, canToggle, sitioAuditoriaId, coverageStatus } = item;
  const toggleKey = `${audit.id}:${site.id}`;
  const isSaving = savingSiteToggleKey === toggleKey;
  const checkboxId = `step4SiteChk_${audit.id}_${site.id}`;
  const disabled = !canToggle || isSaving;
  const addressText =
    site.direccion_sitio || site.tipo_sitio || 'Dirección sin especificar';

  const rowSurfaceClass = isPrincipalHq
    ? 'border-slate-200 bg-slate-50/90'
    : isSelected
    ? 'border-indigo-200 bg-indigo-50/35'
    : 'border-slate-200 bg-white hover:bg-slate-50/80';

  const secondaryStatusHint = isSaving
    ? '<span class="text-[10px] font-semibold text-indigo-600 shrink-0">Guardando...</span>'
    : isPrincipalHq
    ? '<span class="text-[10px] font-semibold text-slate-500 whitespace-nowrap shrink-0" title="Sitio principal HQ obligatorio en toda auditoría">🔒 HQ obligatorio</span>'
    : !isSelected && coverageStatus === 'SIN_COBERTURA'
    ? '<span class="text-[10px] font-semibold text-amber-700 whitespace-nowrap shrink-0">Sin visitar</span>'
    : isSelected && !canToggle && isStaff
    ? '<span class="text-[10px] font-semibold text-slate-400 whitespace-nowrap shrink-0">Mín. 1 sitio</span>'
    : '';

  return `
    <label
      for="${escapeHtml(checkboxId)}"
      data-testid="sitio-assignment-row"
      data-audit-id="${escapeHtml(audit.id)}"
      data-site-id="${escapeHtml(site.id)}"
      data-site-number="${site.numero_sitio}"
      data-hq-locked="${isPrincipalHq ? 'true' : 'false'}"
      class="flex items-start justify-between gap-2.5 px-3 py-2 rounded-lg border transition-colors min-h-[42px] ${rowSurfaceClass} ${
        disabled ? 'cursor-not-allowed' : 'cursor-pointer'
      }"
    >
      <span class="flex items-start gap-2.5 min-w-0 flex-1">
        <input
          type="checkbox"
          id="${escapeHtml(checkboxId)}"
          data-action="toggle-step4-site"
          data-audit-id="${escapeHtml(audit.id)}"
          data-site-id="${escapeHtml(site.id)}"
          data-sitio-auditoria-id="${escapeHtml(sitioAuditoriaId || '')}"
          data-currently-selected="${isSelected ? 'true' : 'false'}"
          data-hq-locked="${isPrincipalHq ? 'true' : 'false'}"
          ${isSelected ? 'checked' : ''}
          ${disabled ? 'disabled' : ''}
          class="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
        />
        <span class="min-w-0 flex-1">
          <span class="flex items-center gap-1.5 min-w-0">
            <span class="font-mono text-[10px] font-bold text-slate-500 shrink-0">${
              isPrincipalHq ? 'Sitio 0' : `#${site.numero_sitio}`
            }</span>
            <span class="text-xs font-semibold text-slate-900 truncate">${escapeHtml(
              site.nombre_sitio
            )}</span>
          </span>
          <span class="block text-[11px] text-slate-500 truncate">${escapeHtml(addressText)}</span>
        </span>
      </span>
      ${secondaryStatusHint}
    </label>
  `;
}

function renderAuditSiteSection(opts: {
  model: SitioLinkedAuditModel;
  siblingsCount: number;
  savingSiteToggleKey: string | null;
  isStaff: boolean;
}): string {
  const { model, siblingsCount, savingSiteToggleKey, isStaff } = opts;
  const { audit } = model;

  const coverageBtnLabel =
    model.unvisitedSitesCount > 0
      ? `Cobertura · ${model.unvisitedSitesCount} sin visitar`
      : `Cobertura · ${model.coveredUniqueCount}/${model.totalSitesCount}`;

  const coverageBtnClass =
    model.unvisitedSitesCount > 0
      ? 'border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900'
      : 'border-slate-300 bg-white hover:bg-slate-100 text-slate-700';

  return `
    <section
      data-testid="sitio-audit-section"
      data-audit-id="${escapeHtml(audit.id)}"
      data-is-active="${model.isActive ? 'true' : 'false'}"
      class="divide-y divide-slate-100"
    >
      <div class="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 ${
        model.isActive && siblingsCount > 1 ? 'bg-indigo-50/35' : 'bg-slate-50/70'
      }">
        <div class="min-w-0 flex flex-wrap items-center gap-1.5">
          ${
            model.isActive && siblingsCount > 1
              ? '<span class="px-1.5 py-0.2 rounded bg-slate-900 text-white text-[10px] font-bold shrink-0">Activa</span>'
              : ''
          }
          <span class="font-mono text-xs font-bold text-slate-900 whitespace-nowrap">${escapeHtml(
            model.certNumero
          )}</span>
          <span class="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-white text-slate-700 border border-slate-200 whitespace-nowrap">${escapeHtml(
            model.normaCodigo
          )}</span>
          <span class="text-xs font-semibold text-slate-700 truncate">${escapeHtml(
            model.codigoAuditoria
          )} · ${escapeHtml(model.tipoAuditoria)} · ${escapeHtml(model.dateSummary)}</span>
          ${
            siblingsCount > 1
              ? `<span class="text-[11px] text-slate-500 truncate">· ${escapeHtml(
                  model.organizacionNombre
                )}</span>`
              : ''
          }
        </div>

        <div class="flex flex-wrap items-center gap-2 shrink-0">
          <span class="text-[11px] font-semibold text-slate-600 tabular-nums whitespace-nowrap">
            ${model.selectedCount} de ${model.totalSitesCount} sitio${
              model.totalSitesCount === 1 ? '' : 's'
            }
          </span>
          <button
            type="button"
            data-action="open-sitio-coverage-modal"
            data-cert-id="${escapeHtml(model.certId)}"
            data-audit-id="${escapeHtml(audit.id)}"
            class="px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap tabular-nums ${coverageBtnClass}"
          >
            ${escapeHtml(coverageBtnLabel)}
          </button>
        </div>
      </div>

      <div class="p-3 sm:p-3.5">
        ${
          model.siteItems.length === 0
            ? `
              <div class="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-500">
                Este certificado no tiene sitios permanentes activos configurados.
              </div>
            `
            : `
              <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                ${model.siteItems
                  .map((item) =>
                    renderSiteAssignmentRow({
                      audit,
                      item,
                      savingSiteToggleKey,
                      isStaff,
                    })
                  )
                  .join('')}
              </div>
            `
        }
      </div>
    </section>
  `;
}

function renderCoverageModalHtml(opts: {
  state: DesignacionSitioViewState;
  allAudits: ReadonlyArray<ProgramacionAuditEntity>;
  certificados: ReadonlyArray<CertificadoDetailEntity>;
  isStaff: boolean;
}): string {
  const { state, allAudits, certificados, isStaff } = opts;
  if (!state.coverageModalAuditId && !state.coverageModalCertId) return '';

  const targetAudit =
    (state.coverageModalAuditId
      ? allAudits.find((a) => !a.deleted_at && a.id === state.coverageModalAuditId)
      : null) ??
    (state.coverageModalCertId
      ? allAudits.find((a) => !a.deleted_at && a.id_certificado === state.coverageModalCertId)
      : null);

  if (!targetAudit) return '';

  const candidateSites = getCandidateSitesForAudit(targetAudit, certificados);
  const model = buildSiteCoverageModalModel({
    currentAudit: targetAudit,
    certificateSites: candidateSites,
    allAudits,
    sortMode: state.coverageSortMode || 'SITE_NUMBER',
    windowOffset: state.coverageWindowOffset || 0,
    maxVisibleCols: 6,
    isStaff,
  });

  const visibleCols = model.visibleAuditColumns;
  const colCount = visibleCols.length;
  const auditColWidthPct =
    colCount > 0 ? Math.floor((52 / colCount) * 100) / 100 : 0;
  const lastAuditColWidthPct =
    colCount > 0
      ? Number((52 - auditColWidthPct * (colCount - 1)).toFixed(2))
      : 0;

  const colgroupHtml =
    colCount > 0
      ? `
        <colgroup>
          <col style="width: 30%">
          <col style="width: 18%">
          ${visibleCols
            .map((_, idx) => {
              const w = idx === colCount - 1 ? lastAuditColWidthPct : auditColWidthPct;
              return `<col style="width: ${w}%">`;
            })
            .join('')}
        </colgroup>
      `
      : `
        <colgroup>
          <col style="width: 60%">
          <col style="width: 40%">
        </colgroup>
      `;

  const phaseLabel = (phase: 'PAST' | 'CURRENT' | 'FUTURE'): string =>
    phase === 'PAST' ? 'Pasada' : phase === 'CURRENT' ? 'Actual ★' : 'Futura';

  const phaseHeaderClass = (phase: 'PAST' | 'CURRENT' | 'FUTURE'): string =>
    phase === 'CURRENT'
      ? 'bg-indigo-50 text-indigo-900'
      : phase === 'FUTURE'
      ? 'bg-sky-50/70 text-sky-900'
      : 'bg-slate-50 text-slate-600';

  return `
    <div
      id="sitioCoverageModal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sitioCoverageModalTitle"
      class="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[1px] flex items-center justify-center p-3 sm:p-5"
    >
      <div class="w-full max-w-5xl max-h-[90vh] rounded-2xl border border-slate-200 bg-white shadow-xl flex flex-col overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-200 bg-slate-50/80 flex items-start justify-between gap-3">
          <div class="min-w-0 space-y-0.5">
            <h3 id="sitioCoverageModalTitle" class="text-sm font-bold text-slate-900">
              Cobertura Histórica y Futura de Sitios
            </h3>
            <p class="text-xs text-slate-600 truncate">
              <span class="font-mono font-bold text-slate-800">${escapeHtml(model.certNumero)}</span>
              · ${escapeHtml(model.organizacionNombre)}
              · Referencia: ${escapeHtml(model.currentAudit.codigo_auditoria)} (${escapeHtml(
                model.currentAudit.tipo_auditoria
              )})
            </p>
          </div>
          <button
            type="button"
            data-action="close-sitio-coverage-modal"
            title="Cerrar cobertura de sitios"
            aria-label="Cerrar cobertura de sitios"
            class="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-bold text-slate-600 cursor-pointer shrink-0"
          >
            ✕
          </button>
        </div>

        <div class="px-4 py-2.5 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums">
            <span class="text-slate-600">
              Total sedes: <strong class="text-slate-900">${model.totalSitesCount}</strong>
            </span>
            <span class="text-slate-600">
              Auditadas (pasado): <strong class="text-emerald-700">${model.pastCoveredSitesCount}</strong>
            </span>
            <span class="text-slate-600">
              Auditoría actual: <strong class="text-indigo-700">${model.currentAssignedCount}</strong>
            </span>
            <span class="text-slate-600">
              Prog. futuro: <strong class="text-sky-700">${model.futureScheduledSitesCount}</strong>
            </span>
            <span class="${
              model.unvisitedSitesCount > 0 ? 'text-amber-800 font-semibold' : 'text-emerald-700 font-semibold'
            }">
              Sin visitar: <strong>${model.unvisitedSitesCount}</strong>
            </span>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <label for="sitioCoverageSortSelect" class="text-[11px] font-semibold text-slate-600 whitespace-nowrap">
              Ordenar:
            </label>
            <select
              id="sitioCoverageSortSelect"
              data-action="change-sitio-coverage-sort"
              aria-label="Ordenar sitios en cobertura"
              class="h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-900 focus:border-slate-900 focus:outline-none"
            >
              ${SITE_COVERAGE_SORT_OPTIONS.map(
                (opt) =>
                  `<option value="${opt.value}" ${
                    opt.value === model.sortMode ? 'selected' : ''
                  }>${escapeHtml(opt.label)}</option>`
              ).join('')}
            </select>

            ${
              model.allAuditColumns.length > model.visibleAuditColumns.length
                ? `
                  <div class="inline-flex items-center gap-1">
                    <button
                      type="button"
                      data-action="page-sitio-coverage-window"
                      data-delta="-1"
                      aria-label="Auditorías anteriores del certificado"
                      ${!model.canPagePrev ? 'disabled' : ''}
                      class="w-7 h-7 inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700 disabled:opacity-40 cursor-pointer"
                    >
                      ◀
                    </button>
                    <button
                      type="button"
                      data-action="page-sitio-coverage-window"
                      data-delta="1"
                      aria-label="Auditorías siguientes del certificado"
                      ${!model.canPageNext ? 'disabled' : ''}
                      class="w-7 h-7 inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700 disabled:opacity-40 cursor-pointer"
                    >
                      ▶
                    </button>
                  </div>
                `
                : ''
            }
          </div>
        </div>

        <div class="flex-1 overflow-auto p-4 space-y-3">
          ${
            state.editErrorMessage
              ? `
                <div role="alert" data-testid="sitio-modal-alert" class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-800 flex items-center gap-2">
                  <span aria-hidden="true">⚠️</span>
                  <span>${escapeHtml(state.editErrorMessage)}</span>
                </div>
              `
              : ''
          }
          ${
            model.rows.length === 0
              ? `
                <div class="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-500">
                  Este certificado no tiene sitios permanentes registrados.
                </div>
              `
              : `
                <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                  <table id="sitioCoverageTable" class="w-full min-w-[640px] table-fixed text-left border-collapse">
                    ${colgroupHtml}
                    <thead class="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th scope="col" class="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                          Sitio
                        </th>
                        <th scope="col" class="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                          Cobertura
                        </th>
                        ${visibleCols
                          .map(
                            (col) => `
                              <th
                                scope="col"
                                class="px-2 py-2 text-center border-l border-slate-200 ${phaseHeaderClass(
                                  col.temporalPhase
                                )}"
                                title="${escapeHtml(`${col.auditCode} · ${col.auditTypeLabel} · ${col.dateLabel}`)}"
                              >
                                <div class="text-[10px] font-bold uppercase tracking-wider leading-tight">
                                  ${escapeHtml(phaseLabel(col.temporalPhase))}
                                </div>
                                <div class="text-[11px] font-bold text-slate-900 leading-tight truncate tabular-nums">
                                  ${escapeHtml(col.yearLabel)} · ${escapeHtml(col.auditTypeLabel)}
                                </div>
                                <div class="text-[10px] font-mono text-slate-500 leading-tight truncate">
                                  ${escapeHtml(col.auditCode)}
                                </div>
                              </th>
                            `
                          )
                          .join('')}
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 text-xs">
                      ${model.rows
                        .map((row) => {
                          const isUnvisited = row.coverageStatus === 'SIN_COBERTURA';
                          const rowHighlight = isUnvisited
                            ? 'bg-amber-50/40 hover:bg-amber-50/70'
                            : row.isAssignedCurrent
                            ? 'bg-indigo-50/20 hover:bg-indigo-50/40'
                            : 'hover:bg-slate-50/80';

                          return `
                            <tr
                              data-testid="coverage-modal-row"
                              data-site-number="${row.site.numero_sitio}"
                              data-coverage-status="${row.coverageStatus}"
                              class="${rowHighlight} transition-colors"
                            >
                              <td class="px-3 py-2 align-middle">
                                <div class="min-w-0 space-y-0.5">
                                  <div class="flex items-center gap-1.5 min-w-0">
                                    <span class="font-mono text-[10px] font-bold text-slate-500 shrink-0">${
                                      row.isPrincipalHq ? 'Sitio 0' : `#${row.site.numero_sitio}`
                                    }</span>
                                    <span class="font-semibold text-slate-900 truncate" title="${escapeHtml(
                                      row.site.nombre_sitio
                                    )}">${escapeHtml(row.site.nombre_sitio)}</span>
                                  </div>
                                  <div class="text-[11px] text-slate-500 truncate">
                                    ${escapeHtml(
                                      row.site.direccion_sitio || 'Dirección sin especificar'
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td class="px-3 py-2 align-middle">
                                <div class="space-y-0.5">
                                  <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${row.coverageBadgeClass} whitespace-nowrap">
                                    ${escapeHtml(row.coverageBadgeLabel)}
                                  </span>
                                  <div class="text-[10px] text-slate-500 truncate" title="${escapeHtml(
                                    row.lastAuditedLabel
                                  )}">
                                    ${escapeHtml(
                                      row.pastVisitCount > 0
                                        ? `${row.pastVisitCount} prev. · ${row.lastAuditedLabel}`
                                        : row.futureVisitCount > 0
                                        ? `Próx: ${row.nextScheduledLabel}`
                                        : 'Nunca auditado'
                                    )}
                                  </div>
                                </div>
                              </td>
                              ${row.cells
                                .map((cell) => {
                                  if (cell.isCurrentAudit) {
                                    const modalChkId = `modalSiteChk_${model.currentAudit.id}_${row.site.id}`;
                                    const isSaving =
                                      state.savingSiteToggleKey ===
                                      `${model.currentAudit.id}:${row.site.id}`;
                                    const disabled = !row.canToggleCurrent || isSaving;
                                    return `
                                      <td class="px-2 py-2 align-middle text-center border-l border-slate-100 bg-indigo-50/25">
                                        <label
                                          for="${escapeHtml(modalChkId)}"
                                          class="inline-flex flex-col items-center justify-center gap-0.5 ${
                                            disabled ? 'cursor-not-allowed' : 'cursor-pointer'
                                          }"
                                        >
                                          <input
                                            type="checkbox"
                                            id="${escapeHtml(modalChkId)}"
                                            data-action="toggle-step4-site"
                                            data-audit-id="${escapeHtml(model.currentAudit.id)}"
                                            data-site-id="${escapeHtml(row.site.id)}"
                                            data-sitio-auditoria-id="${escapeHtml(
                                              row.sitioAuditoriaId || ''
                                            )}"
                                            data-currently-selected="${
                                              row.isAssignedCurrent ? 'true' : 'false'
                                            }"
                                            data-hq-locked="${row.isPrincipalHq ? 'true' : 'false'}"
                                            ${row.isAssignedCurrent ? 'checked' : ''}
                                            ${disabled ? 'disabled' : ''}
                                            aria-label="Incluir ${escapeHtml(
                                              row.site.nombre_sitio
                                            )} en ${escapeHtml(model.currentAudit.codigo_auditoria)}"
                                            class="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                          />
                                          <span class="text-[10px] font-semibold ${
                                            row.isPrincipalHq
                                              ? 'text-slate-600'
                                              : row.isAssignedCurrent
                                              ? 'text-indigo-700'
                                              : 'text-slate-400'
                                          }">
                                            ${
                                              row.isPrincipalHq
                                                ? '🔒 HQ'
                                                : row.isAssignedCurrent
                                                ? 'Asignado'
                                                : 'Libre'
                                            }
                                          </span>
                                        </label>
                                      </td>
                                    `;
                                  }

                                  return `
                                    <td class="px-2 py-2 align-middle text-center border-l border-slate-100">
                                      <span
                                        title="${escapeHtml(
                                          `${cell.auditCode} · ${cell.auditTypeLabel} · ${cell.dateLabel}`
                                        )}"
                                        class="inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold ${cell.badgeClass} whitespace-nowrap"
                                      >
                                        ${escapeHtml(cell.shortTag)}
                                      </span>
                                    </td>
                                  `;
                                })
                                .join('')}
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

        <div class="px-4 py-2.5 border-t border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
          <div class="flex flex-wrap items-center gap-3">
            <span><strong class="text-emerald-700">✓ Aud.</strong> Pasado</span>
            <span><strong class="text-indigo-700">● Asignado</strong> Actual</span>
            <span><strong class="text-sky-700">📅 Prog.</strong> Futuro</span>
            <span><strong class="text-amber-700">Sin visitar</strong> Pendiente de cobertura</span>
          </div>
          <button
            type="button"
            data-action="close-sitio-coverage-modal"
            class="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  `;
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

  const lastAddedPlanned = activeAudit
    ? resolveLastAddedPlannedDate(activeAudit.fechas) ??
      (activeAudit.latestDate &&
      !activeAudit.latestDate.deleted_at &&
      activeAudit.latestDate.tipo_fecha !== 'REAL'
        ? activeAudit.latestDate
        : null)
    : null;
  const lastAddedPlannedLabel = lastAddedPlanned
    ? formatAuditDateLabel(lastAddedPlanned)
    : activeAudit?.fecha_inicio
    ? activeAudit.fecha_inicio.slice(0, 10)
    : 'Sin fecha programada';

  const urgency = activeAudit
    ? computeAuditUrgencyClassification(
        lastAddedPlanned,
        activeAudit.estado_ciclo || 'Borrador',
        referenceIsoDate
      )
    : certRow.urgency;
  const futureWarningMessage = requiresFutureYearWarning(urgency);

  const isModalOpen = Boolean(state.coverageModalAuditId || state.coverageModalCertId);
  const errorBannerHtml =
    state.editErrorMessage && !isModalOpen
      ? `
      <div role="alert" class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-800 flex items-center gap-2">
        <span aria-hidden="true">⚠️</span>
        <span>${escapeHtml(state.editErrorMessage)}</span>
      </div>
    `
      : '';

  const linkedModels = buildSitioLinkedAuditModels({
    activeAudit,
    allAudits,
    programs,
    getCandidateSites: (aud) => getCandidateSitesForAudit(aud, certificados),
    isStaff,
  });
  const siblingsCount = linkedModels.length;
  const activeModel = linkedModels.find((m) => m.isActive) ?? linkedModels[0] ?? null;

  const toolbarHtml =
    activeAudit && activeModel
      ? `
        <div
          data-testid="sitio-editor-toolbar"
          class="flex flex-wrap items-center justify-between gap-2 pb-1"
        >
          <div class="flex flex-wrap items-center gap-2 min-w-0">
            <h2 class="text-xs font-bold uppercase tracking-wider text-slate-700">
              ${siblingsCount > 1 ? 'Sitios por Auditoría Vinculada' : 'Sitios de la Auditoría'}
            </h2>
            ${
              siblingsCount > 1
                ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-[11px] font-semibold text-indigo-800 whitespace-nowrap">${siblingsCount} vinculadas · Asignación individual</span>`
                : ''
            }
          </div>
          <button
            type="button"
            data-action="open-sitio-coverage-modal"
            data-cert-id="${escapeHtml(activeModel.certId)}"
            data-audit-id="${escapeHtml(activeModel.audit.id)}"
            class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
          >
            Historial y Cobertura Multi-Ciclo
          </button>
        </div>
      `
      : '';

  const bodyHtml =
    activeAudit && linkedModels.length > 0
      ? `
        <div class="space-y-3">
          ${toolbarHtml}
          <div
            data-testid="sitio-linked-audits-container"
            class="rounded-xl border border-slate-200 bg-white shadow-2xs divide-y divide-slate-200 overflow-hidden"
          >
            ${linkedModels
              .map((model) =>
                renderAuditSiteSection({
                  model,
                  siblingsCount,
                  savingSiteToggleKey: state.savingSiteToggleKey,
                  isStaff,
                })
              )
              .join('')}
          </div>
        </div>
      `
      : '';

  const coverageModalHtml = renderCoverageModalHtml({
    state,
    allAudits,
    certificados,
    isStaff,
  });

  return renderAuditSectionShell({
    sectionTitle: 'Designación → Sitio',
    sectionSymbol: '📍',
    backSubview: 'designacion/sitio',
    compactMode: true,
    lastAddedPlannedLabel,
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
    showLinkedSiblings: siblingsCount > 1,
    isStaff,
    inCardBreadcrumbHtml,
    headerAddAuditHtml,
    tableName: 'auditoria_sitio',
    feedbackHtml: errorBannerHtml,
    futureWarningMessage,
    bodyHtml,
    modalsHtml: coverageModalHtml,
  });
}
