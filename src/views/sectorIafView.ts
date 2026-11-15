import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import {
  createEmptySectorIafFormDraft,
  createSectorIafDraftFromEntity,
  formatAcreditacionStatusBadge,
  formatRiskCategoryBadge,
  resolveSectorIafDescription,
  type AcreditacionNormaIaf,
  type SectorIafDetailMode,
  type SectorIafEntity,
  type SectorIafFormDraft,
  type SubsectorIafEntity,
} from '../lib/extraDomain';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import {
  getQualificationStatusVisual,
  type AuditorDetailEntity,
} from '../lib/competencyMatrix';
import {
  computeReactiveFacetCounts,
  filterRecordsWithFacets,
  sortItems,
  type ColumnDefinition,
  type MultiViewFacetCategory,
  type MultiViewSelectionMap,
  type SortDirection,
} from '../lib/universalTemplate';
import { renderListViewTable, renderUniversalTemplate } from './universalTemplate';
import {
  renderDetailFormTopActions,
  renderDetailPageTemplate,
  renderMultiViewAddButton,
} from './detailTemplate';
import {
  canArchiveRecord,
  extractUniversalArchiveProps,
  type ArchiveMultiViewConfig,
} from '../lib/archiveGovernance';

export type SectorIafChildTab =
  | 'subsectores'
  | 'acreditaciones'
  | 'certificados'
  | 'auditores';

export interface SectorIafViewState {
  selectedSectorId: string | null;
  activeChildTab: SectorIafChildTab;
  query: string;
  selectedRisk: string;
  viewMode: 'grid' | 'list';
  sortColumn: string | null;
  sortDirection: SortDirection;
  isSidebarOpen?: boolean;
  facetSelections?: MultiViewSelectionMap;
  isCreating?: boolean;
  isEditingAttributes?: boolean;
  formDraft?: SectorIafFormDraft;
  editErrorMessage?: string | null;
}

export interface SectorIafViewProps {
  profile: UserProfile;
  state: SectorIafViewState;
  sectores: SectorIafEntity[];
  subsectores: SubsectorIafEntity[];
  acreditaciones?: AcreditacionNormaIaf[];
  certificados?: CertificadoDetailEntity[];
  auditores?: AuditorDetailEntity[];
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
}

interface SectorComputedMetrics {
  relatedSubs: SubsectorIafEntity[];
  relatedCertsCount: number;
  relatedAuditorsCount: number;
  highestRisk: 'ALTO' | 'MEDIO' | 'BAJO' | null;
  riskRank: number;
}

interface SectorAuditorRow {
  id: string;
  nombre: string;
  titulo_profesional: string;
  codigo_credencial: string;
  normas_acreditadas: string[];
  subsectores_label: string;
  calificacion: string;
}

export function resolveSectorIafDetailMode(
  state: SectorIafViewState,
  isStaff: boolean,
  selectedItem?: SectorIafEntity
): SectorIafDetailMode {
  if (!isStaff) {
    return 'read';
  }
  if (state.isCreating && !state.selectedSectorId) {
    return 'add';
  }
  if (selectedItem && state.isEditingAttributes) {
    return 'edit';
  }
  return 'read';
}

function computeSectorMetrics(
  sec: SectorIafEntity,
  subsectores: ReadonlyArray<SubsectorIafEntity>,
  certificados: ReadonlyArray<CertificadoDetailEntity>,
  auditores: ReadonlyArray<AuditorDetailEntity>
): SectorComputedMetrics {
  const relatedSubs = subsectores.filter(
    (sub) =>
      !sub.deleted_at &&
      (sub.id_sector_iaf === sec.id || sub.sector_numero === sec.sector)
  );
  const relatedCertsCount = certificados.filter(
    (c) => c.id_sector_iaf === sec.id || c.sector_iaf === sec.sector
  ).length;
  const matchingAuditors = auditores.filter((aud) =>
    aud.sectores_iaf.includes(sec.sector)
  );
  const relatedAuditorsCount =
    auditores.length > 0 ? matchingAuditors.length : sec.auditores_count;

  let highestRisk: 'ALTO' | 'MEDIO' | 'BAJO' | null = null;
  let riskRank = 0;
  for (const sub of relatedSubs) {
    const r = sub.categoria_riesgo.toUpperCase();
    if (r === 'ALTO') {
      highestRisk = 'ALTO';
      riskRank = 3;
      break;
    }
    if (r === 'MEDIO' && riskRank < 2) {
      highestRisk = 'MEDIO';
      riskRank = 2;
    } else if (r === 'BAJO' && riskRank < 1) {
      highestRisk = 'BAJO';
      riskRank = 1;
    }
  }

  return {
    relatedSubs,
    relatedCertsCount,
    relatedAuditorsCount,
    highestRisk,
    riskRank,
  };
}

export function renderSectorIafView(props: SectorIafViewProps): string {
  const {
    profile,
    state,
    sectores,
    subsectores,
    acreditaciones = [],
    certificados = [],
    auditores = [],
    loading,
    archiveConfig,
    tableColumnWidths,
  } = props;
  const isStaff = isApprovedStaffProfile(profile);
  const activeSectores = sectores.filter((s) => !s.deleted_at);
  const activeSubsectores = subsectores.filter((sub) => !sub.deleted_at);

  // Add Mode -> standardized 3-zone Detail Page (Zone 3 hidden)
  if (isStaff && state.isCreating && !state.selectedSectorId) {
    return renderSectorDetailPage({
      profile,
      sector: undefined,
      state,
      activeTab: 'subsectores',
      subsectores: [],
      acreditaciones: [],
      certificados: [],
      auditores: [],
      isStaff,
      tableColumnWidths,
    });
  }

  // Detail Mode (read or edit)
  if (state.selectedSectorId) {
    const selectedSector = activeSectores.find(
      (s) => s.id === state.selectedSectorId || String(s.sector) === state.selectedSectorId
    );

    if (selectedSector) {
      return renderSectorDetailPage({
        profile,
        sector: selectedSector,
        state,
        activeTab: state.activeChildTab,
        subsectores: activeSubsectores.filter(
          (sub) =>
            sub.id_sector_iaf === selectedSector.id ||
            sub.sector_numero === selectedSector.sector
        ),
        acreditaciones: acreditaciones.filter(
          (acc) =>
            acc.id_sector_iaf === selectedSector.id ||
            acc.sector_iaf_numero === selectedSector.sector
        ),
        certificados: certificados.filter(
          (c) =>
            c.id_sector_iaf === selectedSector.id ||
            c.sector_iaf === selectedSector.sector
        ),
        auditores: auditores.filter((aud) =>
          aud.sectores_iaf.includes(selectedSector.sector)
        ),
        isStaff,
        tableColumnWidths,
      });
    }
  }

  // Multi View Directory
  return renderSectorDirectoryView({
    isStaff,
    state,
    sectores: activeSectores,
    subsectores: activeSubsectores,
    certificados,
    auditores,
    loading,
    archiveConfig,
    tableColumnWidths,
  });
}

function renderSectorDirectoryView(params: {
  isStaff: boolean;
  state: SectorIafViewState;
  sectores: SectorIafEntity[];
  subsectores: SubsectorIafEntity[];
  certificados: CertificadoDetailEntity[];
  auditores: AuditorDetailEntity[];
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
}): string {
  const {
    isStaff,
    state,
    sectores,
    subsectores,
    certificados,
    auditores,
    loading,
    archiveConfig,
    tableColumnWidths,
  } = params;

  const metricsBySectorId = new Map<string, SectorComputedMetrics>();
  for (const sec of sectores) {
    metricsBySectorId.set(
      sec.id,
      computeSectorMetrics(sec, subsectores, certificados, auditores)
    );
  }
  const getMetrics = (sec: SectorIafEntity): SectorComputedMetrics =>
    metricsBySectorId.get(sec.id) ||
    computeSectorMetrics(sec, subsectores, certificados, auditores);

  const facetCategories: MultiViewFacetCategory<SectorIafEntity>[] = [
    {
      id: 'riesgo',
      label: 'Nivel de Riesgo Sub-Sector',
      options: [
        { value: 'ALTO', label: 'Alto Riesgo (ALTO)' },
        { value: 'MEDIO', label: 'Riesgo Medio (MEDIO)' },
        { value: 'BAJO', label: 'Bajo Riesgo (BAJO)' },
      ],
      extractValues: (sec) => {
        const risks = new Set<string>();
        for (const sub of getMetrics(sec).relatedSubs) {
          risks.add(sub.categoria_riesgo.toUpperCase());
        }
        return Array.from(risks);
      },
    },
    {
      id: 'auditores',
      label: 'Con Auditores Calificados',
      options: [
        { value: 'CON_AUDITORES', label: 'Con Auditores Calificados' },
        { value: 'SIN_AUDITORES', label: 'Sin Auditores Calificados' },
      ],
      extractValues: (sec) =>
        getMetrics(sec).relatedAuditorsCount > 0 ? 'CON_AUDITORES' : 'SIN_AUDITORES',
    },
  ];

  const effectiveSelections: MultiViewSelectionMap = state.facetSelections
    ? state.facetSelections
    : {
        riesgo:
          state.selectedRisk && state.selectedRisk !== 'ALL'
            ? new Set([state.selectedRisk.toUpperCase()])
            : new Set<string>(),
        auditores: new Set<string>(),
      };

  const searchOptions = {
    getSearchableText: (sec: SectorIafEntity) => {
      const subText = getMetrics(sec)
        .relatedSubs.map((sub) => `${sub.codigo} ${sub.descripcion}`)
        .join(' ');
      return `IAF ${sec.sector} ${sec.descripcion} ${subText}`;
    },
  };

  const filtered = filterRecordsWithFacets(
    sectores,
    state.query,
    facetCategories,
    effectiveSelections,
    searchOptions
  );

  const sorted = sortItems(
    filtered,
    state.sortColumn,
    state.sortDirection,
    (item, col) => {
      const m = getMetrics(item);
      switch (col) {
        case 'sector':
          return item.sector;
        case 'descripcion':
          return item.descripcion;
        case 'nivel_riesgo':
          return m.riskRank;
        case 'subsectores_count':
        case 'subsectores':
          return m.relatedSubs.length;
        case 'certificados_count':
          return m.relatedCertsCount;
        case 'auditores_count':
        case 'auditores':
          return m.relatedAuditorsCount;
        default:
          return (item as unknown as Record<string, unknown>)[col];
      }
    }
  );

  const facetGroups = computeReactiveFacetCounts(
    sectores,
    state.query,
    facetCategories,
    effectiveSelections,
    searchOptions
  );

  // Strict 6 Clean List columns summing to 100%, zero <button> inside <td>
  const columns: ColumnDefinition<SectorIafEntity>[] = [
    {
      id: 'sector',
      header: 'Sector IAF',
      sortable: true,
      defaultWidthPct: 16,
      minWidthPx: 120,
      renderCell: (sec) => `
        <span class="font-mono font-bold text-indigo-700 inline-flex items-center gap-1.5 whitespace-nowrap">
          <span aria-hidden="true">🏭</span>
          <span>IAF ${sec.sector}</span>
        </span>
      `,
    },
    {
      id: 'descripcion',
      header: 'Descripción Técnica Oficial',
      sortable: true,
      defaultWidthPct: 34,
      minWidthPx: 220,
      renderCell: (sec) => `
        <span class="block text-slate-700 font-medium truncate" title="${escapeHtml(sec.descripcion)}">
          ${escapeHtml(sec.descripcion)}
        </span>
      `,
    },
    {
      id: 'nivel_riesgo',
      header: 'Nivel de Riesgo',
      sortable: true,
      align: 'center',
      defaultWidthPct: 14,
      minWidthPx: 130,
      renderCell: (sec) => {
        const m = getMetrics(sec);
        if (!m.highestRisk) {
          return `
            <span class="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200 whitespace-nowrap">
              Sin definir
            </span>
          `;
        }
        const badge = formatRiskCategoryBadge(m.highestRisk);
        return `
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${badge.badgeClass}">
            <span aria-hidden="true">${badge.symbol}</span>
            <span>${escapeHtml(badge.label)}</span>
          </span>
        `;
      },
    },
    {
      id: 'subsectores_count',
      header: 'Sub-Sectores',
      sortable: true,
      align: 'center',
      defaultWidthPct: 14,
      minWidthPx: 120,
      renderCell: (sec) => {
        const count = getMetrics(sec).relatedSubs.length;
        return `
          <span class="inline-flex items-center gap-1 font-mono font-bold px-2 py-0.5 rounded text-[11px] bg-slate-100 text-slate-700 border border-slate-200 tabular-nums whitespace-nowrap">
            ${count} ${count === 1 ? 'sub-sector' : 'sub-sectores'}
          </span>
        `;
      },
    },
    {
      id: 'certificados_count',
      header: 'Certificados',
      sortable: true,
      align: 'center',
      defaultWidthPct: 12,
      minWidthPx: 110,
      renderCell: (sec) => {
        const count = getMetrics(sec).relatedCertsCount;
        return `
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 tabular-nums whitespace-nowrap">
            <span aria-hidden="true">📜</span>
            <span>${count}</span>
          </span>
        `;
      },
    },
    {
      id: 'auditores_count',
      header: 'Auditores',
      sortable: true,
      align: 'center',
      defaultWidthPct: 10,
      minWidthPx: 100,
      renderCell: (sec) => {
        const count = getMetrics(sec).relatedAuditorsCount;
        return `
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 tabular-nums whitespace-nowrap">
            <span aria-hidden="true">👥</span>
            <span>${count}</span>
          </span>
        `;
      },
    },
  ];

  const renderCard = (sec: SectorIafEntity): string => {
    const m = getMetrics(sec);
    const riskBadge = m.highestRisk ? formatRiskCategoryBadge(m.highestRisk) : null;

    return `
      <div
        data-action="select-sector-iaf"
        data-sector-id="${escapeHtml(sec.id)}"
        tabindex="0"
        role="button"
        title="Abrir Sector IAF ${sec.sector}"
        class="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs hover:shadow-xs hover:border-indigo-300 transition-all cursor-pointer space-y-3 flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <div class="space-y-2">
          <div class="flex items-start justify-between gap-2">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-800 text-xs font-bold border border-indigo-200 font-mono">
              <span aria-hidden="true">🏭</span>
              <span>Sector IAF ${sec.sector}</span>
            </span>
            ${
              riskBadge
                ? `
                  <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${riskBadge.badgeClass}">
                    <span aria-hidden="true">${riskBadge.symbol}</span>
                    <span>${escapeHtml(riskBadge.label)}</span>
                  </span>
                `
                : `
                  <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                    Acreditado
                  </span>
                `
            }
          </div>

          <h3 class="text-sm font-bold text-slate-900 leading-snug">
            ${escapeHtml(sec.descripcion)}
          </h3>

          <div class="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-slate-600">
            <span class="inline-flex items-center gap-1 bg-slate-50 px-2 py-1 rounded border border-slate-200 font-mono">
              <span aria-hidden="true">🧩</span>
              <span><strong>${m.relatedSubs.length}</strong> Sub-sectores</span>
            </span>
            <span class="inline-flex items-center gap-1 bg-slate-50 px-2 py-1 rounded border border-slate-200 font-mono">
              <span aria-hidden="true">📜</span>
              <span><strong>${m.relatedCertsCount}</strong> Certs</span>
            </span>
            <span class="inline-flex items-center gap-1 bg-slate-50 px-2 py-1 rounded border border-slate-200">
              <span aria-hidden="true">👥</span>
              <span><strong>${m.relatedAuditorsCount}</strong> Evaluadores</span>
            </span>
          </div>

          ${
            m.relatedSubs.length > 0
              ? `
                <div class="pt-1 flex flex-wrap gap-1">
                  ${m.relatedSubs
                    .map((s) => {
                      const rMeta = formatRiskCategoryBadge(s.categoria_riesgo);
                      return `
                        <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-50 text-slate-700 border border-slate-200" title="${escapeHtml(s.descripcion)} (${rMeta.label})">
                          ${escapeHtml(s.codigo)}
                        </span>
                      `;
                    })
                    .join('')}
                </div>
              `
              : ''
          }
        </div>

        <div class="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>ISO/IEC 17021-1</span>
          <span class="font-semibold text-indigo-600">Detalle →</span>
        </div>
      </div>
    `;
  };

  const actionsHtml = isStaff
    ? renderMultiViewAddButton('open-create-sector-iaf', 'Nuevo Sector IAF')
    : '';

  return renderUniversalTemplate({
    domainKey: 'iaf',
    tableId: 'extra-sectores-main',
    title: 'Sectores Técnicos de Acreditación IAF',
    subtitle:
      'Taxonomía técnica internacional de sectores económicos, códigos de sub-sectores jerárquicos (17.1, 17.2...) y categorización de riesgo para la cualificación de auditores.',
    entityLabel: 'sectores IAF',
    searchQuery: state.query,
    searchPlaceholder: 'Buscar por número (14, 17, 28...) o actividad industrial...',
    searchInputId: 'iafSearchInput',
    clearSearchBtnId: 'clearIafSearchBtn',
    totalCount: sectores.length,
    filteredCount: sorted.length,
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen ?? true,
    sortState: {
      column: state.sortColumn,
      direction: state.sortDirection,
    },
    columnWidths: tableColumnWidths?.['extra-sectores-main'],
    getRowAttrs: (sec) =>
      `data-action="select-sector-iaf" data-sector-id="${escapeHtml(sec.id)}" title="Abrir Sector IAF ${sec.sector}"`,
    facetGroups,
    items: sorted,
    columns,
    renderCard,
    emptyStateTitle: 'No se encontraron sectores IAF',
    emptyStateMessage: 'No se encontraron sectores que coincidan con los filtros aplicados.',
    actionsHtml,
    loading,
    loadingMessage: 'Cargando sectores IAF registrados...',
    ...extractUniversalArchiveProps(archiveConfig, 'iaf'),
  });
}

/**
 * Standardized 3-Zone Detail Page for Sector IAF ('read' | 'add' | 'edit')
 */
function renderSectorDetailPage(params: {
  profile: UserProfile;
  sector?: SectorIafEntity;
  state: SectorIafViewState;
  activeTab: SectorIafChildTab;
  subsectores: SubsectorIafEntity[];
  acreditaciones: AcreditacionNormaIaf[];
  certificados: CertificadoDetailEntity[];
  auditores: AuditorDetailEntity[];
  isStaff: boolean;
  tableColumnWidths?: Record<string, Record<string, number>>;
}): string {
  const {
    profile,
    sector,
    state,
    activeTab,
    subsectores,
    acreditaciones,
    certificados,
    auditores,
    isStaff,
    tableColumnWidths,
  } = params;

  const mode = resolveSectorIafDetailMode(state, isStaff, sector);
  const isCreateMode = mode === 'add';
  const isReadOnly = mode === 'read';

  const draft: SectorIafFormDraft =
    mode === 'add'
      ? state.formDraft ?? createEmptySectorIafFormDraft()
      : mode === 'edit'
      ? state.formDraft ??
        (sector ? createSectorIafDraftFromEntity(sector) : createEmptySectorIafFormDraft())
      : sector
      ? createSectorIafDraftFromEntity(sector)
      : createEmptySectorIafFormDraft();

  const qualifiedCount = sector
    ? auditores.length > 0
      ? auditores.length
      : sector.auditores_count
    : 0;

  const customTopActionsHtml = isStaff
    ? renderDetailFormTopActions({
        mode,
        isStaff: true,
        formId: 'sectorIafDetailForm',
        saveBtnId: 'saveSectorIafFormBtn',
        cancelBtnId: 'cancelEditSectorIafBtn',
        editBtnId: 'startEditSectorIafBtn',
        saveTitle: isCreateMode ? 'Crear sector IAF' : 'Guardar cambios',
        cancelTitle: isCreateMode ? 'Cancelar creación' : 'Cancelar edición',
        editTitle: 'Editar sector IAF',
        showHistoryBtn: !isCreateMode,
        showArchiveBtn: !isCreateMode && canArchiveRecord(profile),
        extraAuditAttrs: sector
          ? `data-table-name="sector_iaf" data-record-id="${escapeHtml(sector.id)}" data-entity-name="${escapeHtml(`Sector IAF ${sector.sector}`)}"`
          : '',
        extraArchiveAttrs: sector
          ? `data-archive-table="sector_iaf" data-archive-id="${escapeHtml(sector.id)}" data-archive-entity-label="Sector Técnico IAF" data-archive-title="${escapeHtml(`Sector IAF ${sector.sector}`)}" data-archive-subtitle="${escapeHtml(sector.descripcion)}"`
          : '',
      })
    : undefined;

  const feedbackHtml =
    !isReadOnly && state.editErrorMessage
      ? `
        <div role="alert" class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800 flex items-center gap-2">
          <span aria-hidden="true">⚠️</span>
          <span>${escapeHtml(state.editErrorMessage)}</span>
        </div>
      `
      : '';

  const customRecordBodyHtml = !isReadOnly
    ? renderSectorIafFormBody(draft)
    : undefined;

  const attributes =
    isReadOnly && sector
      ? [
          { label: 'Código de Sector', value: `Sector IAF ${sector.sector}`, isMono: true },
          {
            label: 'Sub-Sectores Definidos',
            value: `${subsectores.length} Sub-sector(es)`,
          },
          {
            label: 'Certificados Emitidos',
            value: `${certificados.length} Certificado(s)`,
          },
          {
            label: 'Auditores Calificados',
            value: `${qualifiedCount} Evaluadores Calificados`,
          },
        ]
      : [];

  return renderDetailPageTemplate({
    entityType: 'Sector Técnico IAF',
    entitySymbol: '🏭',
    title: isCreateMode
      ? 'Nuevo Sector IAF'
      : sector
      ? `Sector IAF ${sector.sector}`
      : 'Sector IAF',
    eyebrowCode: !isCreateMode && sector ? `IAF ${sector.sector}` : undefined,
    subtitle: isCreateMode
      ? 'Registro de sector técnico IAF (1–99) conforme a la taxonomía ISO/IEC 17021-1 / IAF MD 5.'
      : sector?.descripcion,
    statusBadge: !isCreateMode
      ? {
          label: 'ACREDITADO',
          badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
          symbol: '✓',
        }
      : undefined,
    backButton: {
      label: 'Volver al Directorio de Sectores IAF',
      nav: 'extra',
      subview: 'iaf',
      action: 'back-to-iaf-list',
    },
    customTopActionsHtml,
    isCreateMode,
    parents: [],
    tableName: 'sector_iaf',
    recordId: sector?.id || '',
    feedbackHtml,
    attributes,
    customRecordBodyHtml,
    childTabs:
      !isCreateMode && sector
        ? [
            {
              id: 'subsectores',
              label: 'Sub-Sectores',
              symbol: '🧩',
              count: subsectores.length,
            },
            {
              id: 'acreditaciones',
              label: 'Acreditaciones',
              symbol: '🏅',
              count: acreditaciones.length,
            },
            {
              id: 'certificados',
              label: 'Certificados',
              symbol: '📜',
              count: certificados.length,
            },
            {
              id: 'auditores',
              label: 'Auditores Calificados',
              symbol: '👥',
              count: qualifiedCount,
            },
          ]
        : [],
    activeChildTabId: activeTab,
    childTabAttrName: 'data-iaf-tab',
    renderChildTabContent:
      !isCreateMode && sector
        ? (tabId) => {
            if (tabId === 'acreditaciones') {
              return renderSectorAcreditacionesTab(sector, acreditaciones, tableColumnWidths);
            }
            if (tabId === 'certificados') {
              return renderSectorCertificadosTab(sector, certificados, tableColumnWidths);
            }
            if (tabId === 'auditores') {
              return renderSectorAuditoresTab(
                sector,
                subsectores,
                auditores,
                tableColumnWidths
              );
            }
            return renderSectorSubsectoresTab(
              sector,
              subsectores,
              isStaff,
              tableColumnWidths
            );
          }
        : undefined,
  });
}

function renderSectorIafFormBody(draft: SectorIafFormDraft): string {
  const parsed = Number((draft.sector || '').trim());
  const hasValidPreview = Number.isInteger(parsed) && parsed >= 1 && parsed <= 99;
  const previewText = hasValidPreview
    ? resolveSectorIafDescription(parsed)
    : 'Ingrese un número entero entre 1 y 99 para previsualizar la descripción técnica IAF.';

  return `
    <form id="sectorIafDetailForm" novalidate class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 sm:p-3.5">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
        <div class="space-y-1">
          <label for="sectorNumeroInput" class="block text-xs font-bold text-slate-700">
            Número de Sector IAF (1–99) <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <input
            id="sectorNumeroInput"
            name="sector"
            type="number"
            min="1"
            max="99"
            step="1"
            required
            value="${escapeHtml(draft.sector)}"
            placeholder="Ej. 18"
            class="w-full text-xs font-mono font-bold px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
          <p class="text-[11px] text-slate-500">
            Código entero positivo único conforme a tabla EA/IAF MD 5.
          </p>
        </div>

        <div class="sm:col-span-2 bg-white border border-slate-200 rounded-xl p-3 space-y-1">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Vista Previa de Descripción Técnica IAF
          </div>
          <div
            id="sectorDescriptionPreview"
            class="text-xs font-semibold ${hasValidPreview ? 'text-slate-900' : 'text-slate-400 italic'}"
          >
            ${escapeHtml(previewText)}
          </div>
        </div>
      </div>
    </form>
  `;
}

function renderSectorSubsectoresTab(
  sector: SectorIafEntity,
  subsectores: SubsectorIafEntity[],
  isStaff: boolean,
  tableColumnWidths?: Record<string, Record<string, number>>
): string {
  const columns: ColumnDefinition<SubsectorIafEntity>[] = [
    {
      id: 'codigo',
      header: 'Código',
      defaultWidthPct: 14,
      minWidthPx: 100,
      renderCell: (sub) => `
        <span class="font-mono font-bold text-indigo-700 whitespace-nowrap">
          ${escapeHtml(sub.codigo)}
        </span>
      `,
    },
    {
      id: 'descripcion',
      header: 'Descripción Técnica Detallada',
      defaultWidthPct: 44,
      minWidthPx: 220,
      renderCell: (sub) => `
        <span class="block text-slate-700 font-medium truncate" title="${escapeHtml(sub.descripcion)}">
          ${escapeHtml(sub.descripcion)}
        </span>
      `,
    },
    {
      id: 'categoria_riesgo',
      header: 'Categoría de Riesgo ISO',
      align: 'center',
      defaultWidthPct: 18,
      minWidthPx: 140,
      renderCell: (sub) => {
        const riskMeta = formatRiskCategoryBadge(sub.categoria_riesgo);
        return `
          <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${riskMeta.badgeClass}">
            <span aria-hidden="true">${riskMeta.symbol}</span>
            <span>${escapeHtml(riskMeta.label)}</span>
          </span>
        `;
      },
    },
    {
      id: 'auditores',
      header: 'Auditores Especialistas',
      defaultWidthPct: 24,
      minWidthPx: 170,
      renderCell: (sub) => {
        if (!sub.auditores_nombres || sub.auditores_nombres.length === 0) {
          return `<span class="text-slate-400 italic">Sin auditores asignados</span>`;
        }
        return `
          <span class="block text-slate-700 truncate" title="${escapeHtml(sub.auditores_nombres.join(', '))}">
            👤 ${escapeHtml(sub.auditores_nombres.join(' · '))}
          </span>
        `;
      },
    },
  ];

  return `
    <div class="space-y-3">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 class="text-sm font-bold text-slate-900">Sub-Sectores Técnicos Registrados</h3>
          <p class="text-xs text-slate-500">
            Desglose granular de actividades económicas y categorización de riesgo bajo ISO/IEC 17021-1
          </p>
        </div>
        ${
          isStaff
            ? `
              <button
                type="button"
                data-action="open-create-subsector-iaf"
                data-sector-id="${escapeHtml(sector.id)}"
                class="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 transition-colors cursor-pointer inline-flex items-center gap-1.5 self-start sm:self-auto shadow-2xs shrink-0"
              >
                <span aria-hidden="true">+</span>
                <span>Nuevo Sub-Sector IAF</span>
              </button>
            `
            : ''
        }
      </div>

      ${renderListViewTable({
        tableId: 'sector-tab-subsectores',
        items: subsectores,
        columns,
        columnWidths: tableColumnWidths?.['sector-tab-subsectores'],
        getRowAttrs: (sub) =>
          `data-action="select-subsector-iaf" data-subsector-id="${escapeHtml(sub.id)}" title="Abrir Sub-Sector ${escapeHtml(sub.codigo)}"`,
        emptyStateTitle: 'Sin sub-sectores registrados',
        emptyStateMessage: 'No se han registrado sub-sectores técnicos para este sector IAF.',
      })}
    </div>
  `;
}

function renderSectorAcreditacionesTab(
  sector: SectorIafEntity,
  acreditaciones: AcreditacionNormaIaf[],
  tableColumnWidths?: Record<string, Record<string, number>>
): string {
  const columns: ColumnDefinition<AcreditacionNormaIaf>[] = [
    {
      id: 'numero_acreditacion',
      header: 'N° Acreditación',
      defaultWidthPct: 20,
      minWidthPx: 140,
      renderCell: (acc) => `
        <span class="font-mono font-bold text-indigo-700 whitespace-nowrap">
          ${escapeHtml(acc.numero_acreditacion)}
        </span>
      `,
    },
    {
      id: 'organismo',
      header: 'Organismo',
      defaultWidthPct: 28,
      minWidthPx: 170,
      renderCell: (acc) => `
        <span class="block truncate" title="${escapeHtml(`${acc.organismo_codigo} — ${acc.organismo_nombre}`)}">
          <strong class="text-slate-900">${escapeHtml(acc.organismo_codigo)}</strong>
          <span class="text-slate-500 ml-1">${escapeHtml(acc.organismo_nombre)}</span>
        </span>
      `,
    },
    {
      id: 'norma',
      header: 'Norma Amparada',
      defaultWidthPct: 20,
      minWidthPx: 130,
      renderCell: (acc) => `
        <span class="font-semibold text-slate-800 whitespace-nowrap">
          📘 ${escapeHtml(acc.norma_codigo)}
        </span>
      `,
    },
    {
      id: 'vigencia',
      header: 'Vigencia',
      defaultWidthPct: 18,
      minWidthPx: 150,
      renderCell: (acc) => `
        <span class="font-mono text-[11px] text-slate-600 whitespace-nowrap tabular-nums">
          ${escapeHtml(acc.fecha_concesion)} → ${escapeHtml(acc.fecha_vencimiento || 'Indefinida')}
        </span>
      `,
    },
    {
      id: 'estatus',
      header: 'Estado',
      align: 'center',
      defaultWidthPct: 14,
      minWidthPx: 120,
      renderCell: (acc) => {
        const accStatus = formatAcreditacionStatusBadge(acc.estatus);
        return `
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap ${accStatus.badgeClass}">
            <span aria-hidden="true">${accStatus.symbol}</span>
            <span>${escapeHtml(accStatus.label)}</span>
          </span>
        `;
      },
    },
  ];

  return `
    <div class="space-y-3">
      <div>
        <h3 class="text-sm font-bold text-slate-900">Acreditaciones Vigentes en Sector IAF ${sector.sector}</h3>
        <p class="text-xs text-slate-500">
          Alcances de acreditación otorgados por organismos oficiales (ENAC, UKAS, ANAB) para este sector económico.
        </p>
      </div>

      ${renderListViewTable({
        tableId: 'sector-tab-acreditaciones',
        items: acreditaciones,
        columns,
        columnWidths: tableColumnWidths?.['sector-tab-acreditaciones'],
        getRowAttrs: (acc) =>
          `data-action="select-accreditation" data-accreditation-id="${escapeHtml(acc.id)}" title="Abrir acreditación ${escapeHtml(acc.numero_acreditacion)}"`,
        emptyStateTitle: 'Sin acreditaciones específicas',
        emptyStateMessage: 'No hay acreditaciones específicas asignadas a este sector IAF.',
      })}
    </div>
  `;
}

function renderSectorCertificadosTab(
  sector: SectorIafEntity,
  certificados: CertificadoDetailEntity[],
  tableColumnWidths?: Record<string, Record<string, number>>
): string {
  const columns: ColumnDefinition<CertificadoDetailEntity>[] = [
    {
      id: 'numero_certificado',
      header: 'N° Certificado',
      defaultWidthPct: 20,
      minWidthPx: 140,
      renderCell: (c) => `
        <span class="font-mono font-bold text-indigo-700 whitespace-nowrap">
          📜 ${escapeHtml(c.numero_certificado)}
        </span>
      `,
    },
    {
      id: 'organizacion',
      header: 'Organización',
      defaultWidthPct: 30,
      minWidthPx: 180,
      renderCell: (c) => `
        <span class="block font-semibold text-slate-800 truncate" title="${escapeHtml(c.organizacion_nombre)}">
          🏢 ${escapeHtml(c.organizacion_nombre)}
        </span>
      `,
    },
    {
      id: 'norma',
      header: 'Norma',
      defaultWidthPct: 18,
      minWidthPx: 120,
      renderCell: (c) => `
        <span class="font-medium text-slate-700 whitespace-nowrap">
          ${escapeHtml(c.norma_codigo)}
        </span>
      `,
    },
    {
      id: 'vigencia',
      header: 'Vigencia',
      defaultWidthPct: 18,
      minWidthPx: 150,
      renderCell: (c) => `
        <span class="font-mono text-[11px] text-slate-600 whitespace-nowrap tabular-nums">
          ${escapeHtml(c.fecha_emision)} → ${escapeHtml(c.fecha_vencimiento)}
        </span>
      `,
    },
    {
      id: 'estatus',
      header: 'Estatus',
      align: 'center',
      defaultWidthPct: 14,
      minWidthPx: 100,
      renderCell: (c) => `
        <span class="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-800 border border-slate-200 whitespace-nowrap">
          ${escapeHtml(c.estatus)}
        </span>
      `,
    },
  ];

  return `
    <div class="space-y-3">
      <div>
        <h3 class="text-sm font-bold text-slate-900">Certificados Emitidos en Sector IAF ${sector.sector}</h3>
        <p class="text-xs text-slate-500">
          Certificados activos e históricos clasificados bajo este código sectorial.
        </p>
      </div>

      ${renderListViewTable({
        tableId: 'sector-tab-certificados',
        items: certificados,
        columns,
        columnWidths: tableColumnWidths?.['sector-tab-certificados'],
        getRowAttrs: (c) =>
          `data-action="select-cert" data-cert-id="${escapeHtml(c.id)}" title="Abrir certificado ${escapeHtml(c.numero_certificado)}"`,
        emptyStateTitle: 'Sin certificados en este sector',
        emptyStateMessage: 'No hay certificados registrados en este sector IAF.',
      })}
    </div>
  `;
}

function renderSectorAuditoresTab(
  sector: SectorIafEntity,
  subsectores: SubsectorIafEntity[],
  auditores: AuditorDetailEntity[],
  tableColumnWidths?: Record<string, Record<string, number>>
): string {
  const rows: SectorAuditorRow[] =
    auditores.length > 0
      ? auditores.map((aud) => {
          const sectorComps = aud.competencias.filter(
            (c) => c.sector_iaf_numero === sector.sector
          );
          const subCodes = Array.from(
            new Set(
              sectorComps
                .map((c) => c.subsector_iaf_codigo)
                .filter((code): code is string => Boolean(code))
            )
          );
          return {
            id: aud.id,
            nombre: aud.nombre,
            titulo_profesional: aud.titulo_profesional,
            codigo_credencial: aud.codigo_credencial,
            normas_acreditadas: aud.normas_acreditadas,
            subsectores_label:
              subCodes.length > 0 ? subCodes.join(', ') : 'Sector completo',
            calificacion: aud.calificacion,
          };
        })
      : Array.from(new Set(subsectores.flatMap((s) => s.auditores_nombres || []))).map(
          (name) => ({
            id: '',
            nombre: name,
            titulo_profesional: '',
            codigo_credencial: '—',
            normas_acreditadas: ['Según matriz de competencia'],
            subsectores_label: `Sector IAF ${sector.sector}`,
            calificacion: 'Calificado',
          })
        );

  const columns: ColumnDefinition<SectorAuditorRow>[] = [
    {
      id: 'auditor',
      header: 'Auditor',
      defaultWidthPct: 28,
      minWidthPx: 180,
      renderCell: (aud) => `
        <div class="min-w-0">
          <div class="font-bold text-indigo-700 truncate">🪪 ${escapeHtml(aud.nombre)}</div>
          ${
            aud.titulo_profesional
              ? `<div class="text-[11px] text-slate-500 truncate">${escapeHtml(aud.titulo_profesional)}</div>`
              : ''
          }
        </div>
      `,
    },
    {
      id: 'credencial',
      header: 'Credencial',
      defaultWidthPct: 16,
      minWidthPx: 120,
      renderCell: (aud) => `
        <span class="font-mono font-semibold text-slate-700 whitespace-nowrap">
          ${escapeHtml(aud.codigo_credencial)}
        </span>
      `,
    },
    {
      id: 'normas',
      header: 'Normas Calificadas',
      defaultWidthPct: 22,
      minWidthPx: 150,
      renderCell: (aud) => `
        <div class="flex flex-wrap gap-1">
          ${aud.normas_acreditadas
            .map(
              (n) =>
                `<span class="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-semibold">${escapeHtml(n)}</span>`
            )
            .join('')}
        </div>
      `,
    },
    {
      id: 'subsectores',
      header: `Sub-Sectores en IAF ${sector.sector}`,
      defaultWidthPct: 20,
      minWidthPx: 140,
      renderCell: (aud) => `
        <span class="font-mono text-[11px] text-slate-700 truncate block">
          ${escapeHtml(aud.subsectores_label)}
        </span>
      `,
    },
    {
      id: 'calificacion',
      header: 'Calificación',
      align: 'center',
      defaultWidthPct: 14,
      minWidthPx: 120,
      renderCell: (aud) => {
        const qualVisual = getQualificationStatusVisual(aud.calificacion);
        return `
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap ${qualVisual.badgeClass}">
            <span class="w-1.5 h-1.5 rounded-full ${qualVisual.dotClass}"></span>
            <span>${escapeHtml(qualVisual.label)}</span>
          </span>
        `;
      },
    },
  ];

  return `
    <div class="space-y-3">
      <div>
        <h3 class="text-sm font-bold text-slate-900">Evaluadores Técnicos con Competencia Sectorial</h3>
        <p class="text-xs text-slate-500">
          Auditores habilitados para liderar o evaluar auditorías en el Sector IAF ${sector.sector}
        </p>
      </div>

      ${renderListViewTable({
        tableId: 'sector-tab-auditores',
        items: rows,
        columns,
        columnWidths: tableColumnWidths?.['sector-tab-auditores'],
        getRowAttrs: (aud) =>
          aud.id
            ? `data-action="select-auditor" data-auditor-id="${escapeHtml(aud.id)}" title="Abrir auditor ${escapeHtml(aud.nombre)}"`
            : '',
        emptyStateTitle: 'Sin auditores calificados',
        emptyStateMessage: 'No hay auditores calificados registrados para este sector IAF.',
      })}
    </div>
  `;
}
