import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import {
  formatRiskCategoryBadge,
  INITIAL_ESTATUS_CATALOG,
  INITIAL_SUBSECTORES_IAF,
  type EstatusCatalogItem,
  type NormaEntity,
  type OrganismoAcreditacion,
  type SectorIafEntity,
  type SubsectorIafEntity,
} from '../lib/extraDomain';
import {
  createAcreditacionDraftFromEntity,
  createEmptyAcreditacionFormDraft,
  evaluateAccreditationExpiry,
  filterCoveredCertificatesForAccreditation,
  formatAcreditacionDirectoryStatusBadge,
  formatAcreditacionExpiryBadge,
  formatAcreditacionSectorsSummary,
  getAcreditacionSectorFacetValues,
  getSubsectoresForAccreditation,
  normalizeSafeHttpUrl,
  VALID_ACREDITACION_STATUSES,
  type AcreditacionDetailEntity,
  type AcreditacionDetailMode,
  type AcreditacionFormDraft,
  type AcreditacionSectorLink,
} from '../lib/acreditacionDomain';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import {
  computeReactiveFacetCounts,
  filterRecordsWithFacets,
  sortItems,
  type ColumnDefinition,
  type MultiViewFacetCategory,
  type MultiViewFacetOptionSpec,
  type MultiViewSelectionMap,
  type SortDirection,
} from '../lib/universalTemplate';
import { renderListViewTable, renderUniversalTemplate } from './universalTemplate';
import {
  renderDetailFormTopActions,
  renderDetailPageTemplate,
  renderDetailParentSelectCard,
  renderMultiViewAddButton,
  type DetailParentChip,
} from './detailTemplate';
import {
  canArchiveRecord,
  extractUniversalArchiveProps,
  type ArchiveMultiViewConfig,
} from '../lib/archiveGovernance';

export type AcreditacionChildTab = 'sectores' | 'certificados' | 'subsectores';

export interface AcreditacionViewState {
  selectedAccreditationId: string | null;
  activeChildTab?: AcreditacionChildTab;
  query: string;
  viewMode: 'grid' | 'list';
  sortColumn: string | null;
  sortDirection: SortDirection;
  isSidebarOpen?: boolean;
  facetSelections?: MultiViewSelectionMap;
  isCreating?: boolean;
  isEditingAttributes?: boolean;
  formDraft?: AcreditacionFormDraft;
  editErrorMessage?: string | null;
}

export interface AcreditacionViewProps {
  profile: UserProfile;
  state: AcreditacionViewState;
  acreditaciones: AcreditacionDetailEntity[];
  organismos: OrganismoAcreditacion[];
  normas: NormaEntity[];
  sectores: SectorIafEntity[];
  estatusList?: EstatusCatalogItem[];
  certificates?: ReadonlyArray<CertificadoDetailEntity>;
  subsectores?: ReadonlyArray<SubsectorIafEntity>;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
}

export function resolveAcreditacionDetailMode(
  state: AcreditacionViewState,
  isStaff: boolean,
  selectedItem?: AcreditacionDetailEntity
): AcreditacionDetailMode {
  if (!isStaff) {
    return 'read';
  }
  if (state.isCreating && !state.selectedAccreditationId) {
    return 'add';
  }
  if (selectedItem && state.isEditingAttributes) {
    return 'edit';
  }
  return 'read';
}

export function renderAcreditacionView(props: AcreditacionViewProps): string {
  const {
    profile,
    state,
    acreditaciones,
    organismos,
    normas,
    sectores,
    estatusList = INITIAL_ESTATUS_CATALOG,
    certificates = [],
    subsectores = INITIAL_SUBSECTORES_IAF,
    loading,
    archiveConfig,
    tableColumnWidths,
  } = props;
  const isStaff = isApprovedStaffProfile(profile);

  const activeAccreditations = acreditaciones.filter((a) => !a.deleted_at);
  const activeEstatus = estatusList.filter((e) => !e.deleted_at);
  const activeSectores = sectores.filter((s) => !s.deleted_at);

  // Add mode (full Detail View form, no inline Multi View form)
  if (isStaff && state.isCreating && !state.selectedAccreditationId) {
    return renderAcreditacionDetailView({
      profile,
      acr: undefined,
      state,
      isStaff,
      organismos,
      normas,
      sectores: activeSectores,
      estatusList: activeEstatus,
      certificates: [],
      subsectores: [],
      tableColumnWidths,
    });
  }

  // Detail mode (read or edit)
  if (state.selectedAccreditationId) {
    const selected = activeAccreditations.find((a) => a.id === state.selectedAccreditationId);
    if (selected) {
      return renderAcreditacionDetailView({
        profile,
        acr: selected,
        state,
        isStaff,
        organismos,
        normas,
        sectores: activeSectores,
        estatusList: activeEstatus,
        certificates,
        subsectores,
        tableColumnWidths,
      });
    }
  }

  return renderAcreditacionDirectoryView({
    state,
    acreditaciones: activeAccreditations,
    organismos,
    normas,
    sectores: activeSectores,
    estatusList: activeEstatus,
    isStaff,
    loading,
    archiveConfig,
    tableColumnWidths,
  });
}

function renderAcreditacionDirectoryView(params: {
  state: AcreditacionViewState;
  acreditaciones: AcreditacionDetailEntity[];
  organismos: OrganismoAcreditacion[];
  normas: NormaEntity[];
  sectores: SectorIafEntity[];
  estatusList: EstatusCatalogItem[];
  isStaff: boolean;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
}): string {
  const {
    state,
    acreditaciones,
    organismos,
    normas,
    sectores,
    estatusList,
    isStaff,
    loading,
    archiveConfig,
    tableColumnWidths,
  } = params;

  const orgMap = new Map<string, string>();
  for (const org of organismos) {
    orgMap.set(org.codigo, `${org.codigo} (${org.pais})`);
  }
  for (const acr of acreditaciones) {
    if (!orgMap.has(acr.organismo_codigo)) {
      orgMap.set(acr.organismo_codigo, `${acr.organismo_codigo} (${acr.organismo_pais})`);
    }
  }
  const orgOptions: MultiViewFacetOptionSpec[] = Array.from(orgMap.entries())
    .sort(([a], [b]) => a.localeCompare(b, 'es'))
    .map(([codigo, label]) => ({ value: codigo, label }));

  const normaSet = new Set<string>();
  for (const n of normas) {
    normaSet.add(n.codigo || n.norma);
  }
  for (const acr of acreditaciones) {
    normaSet.add(acr.norma_codigo);
  }
  const normaOptions: MultiViewFacetOptionSpec[] = Array.from(normaSet)
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map((codigo) => ({ value: codigo, label: codigo }));

  const sectorMap = new Map<number, string>();
  for (const sec of sectores) {
    sectorMap.set(sec.sector, sec.descripcion);
  }
  for (const acr of acreditaciones) {
    for (const sec of acr.sectores) {
      if (!sectorMap.has(sec.sector)) {
        sectorMap.set(sec.sector, sec.descripcion);
      }
    }
  }
  const sectorOptions: MultiViewFacetOptionSpec[] = Array.from(sectorMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([num, desc]) => ({
      value: String(num),
      label: `Sector ${num} · ${desc}`,
    }));

  const statusSet = new Set<string>();
  for (const item of estatusList) {
    if (
      item.estatus === 'Activo' ||
      item.estatus === 'Suspendido' ||
      item.estatus === 'Cancelado' ||
      acreditaciones.some((a) => a.id_estatus === item.id || a.estatus === item.estatus)
    ) {
      statusSet.add(item.estatus);
    }
  }
  for (const acr of acreditaciones) {
    if (acr.estatus) statusSet.add(acr.estatus);
  }
  if (statusSet.size === 0) {
    for (const fallback of VALID_ACREDITACION_STATUSES) {
      statusSet.add(fallback);
    }
  }
  const statusOptions: MultiViewFacetOptionSpec[] = Array.from(statusSet).map((s) => ({
    value: s,
    label: s,
  }));

  const facetCategories: MultiViewFacetCategory<AcreditacionDetailEntity>[] = [
    {
      id: 'organismo',
      label: 'Organismo de Acreditación',
      options: orgOptions,
      extractValues: (acr) => acr.organismo_codigo,
    },
    {
      id: 'norma',
      label: 'Norma ISO',
      options: normaOptions,
      extractValues: (acr) => acr.norma_codigo,
    },
    {
      id: 'sector_iaf',
      label: 'Sector IAF',
      options: sectorOptions,
      extractValues: (acr) => getAcreditacionSectorFacetValues(acr),
    },
    {
      id: 'estatus',
      label: 'Estatus',
      options: statusOptions,
      extractValues: (acr) => acr.estatus,
    },
  ];

  const effectiveSelections: MultiViewSelectionMap = state.facetSelections ?? {};

  const searchOptions = {
    getSearchableText: (acr: AcreditacionDetailEntity) => {
      const sectorSummary = formatAcreditacionSectorsSummary(acr.sectores);
      return [
        acr.numero_acreditacion,
        acr.organismo_codigo,
        acr.organismo_nombre,
        acr.organismo_pais,
        acr.norma_codigo,
        acr.norma_titulo,
        sectorSummary.shortLabel,
        sectorSummary.detailLabel,
        ...acr.sectores.map((s) => `Sector ${s.sector} ${s.descripcion}`),
        acr.estatus,
      ].join(' ');
    },
  };

  const filtered = filterRecordsWithFacets(
    acreditaciones,
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
      switch (col) {
        case 'numero_acreditacion':
          return item.numero_acreditacion;
        case 'organismo':
          return item.organismo_codigo;
        case 'norma':
          return item.norma_codigo;
        case 'sector_iaf':
          return item.sectores[0]?.sector ?? -1;
        case 'estatus':
          return item.estatus;
        case 'vigencia':
          return item.fecha_vencimiento || '9999-12-31';
        default:
          return (item as unknown as Record<string, unknown>)[col];
      }
    }
  );

  const facetGroups = computeReactiveFacetCounts(
    acreditaciones,
    state.query,
    facetCategories,
    effectiveSelections,
    searchOptions
  );

  const columns: ColumnDefinition<AcreditacionDetailEntity>[] = [
    {
      id: 'numero_acreditacion',
      header: 'Acreditación',
      sortable: true,
      defaultWidthPct: 18,
      minWidthPx: 140,
      renderCell: (acr) => `
        <span class="font-mono font-bold text-indigo-700 inline-flex items-center gap-1.5 truncate">
          <span aria-hidden="true">🏅</span>
          <span class="truncate">${escapeHtml(acr.numero_acreditacion)}</span>
        </span>
      `,
    },
    {
      id: 'organismo',
      header: 'Organismo',
      sortable: true,
      defaultWidthPct: 18,
      minWidthPx: 140,
      renderCell: (acr) => `
        <div class="space-y-0.5 min-w-0">
          <div class="font-bold text-slate-900 truncate" title="${escapeHtml(acr.organismo_codigo)} — ${escapeHtml(acr.organismo_pais)}">${escapeHtml(acr.organismo_codigo)} · ${escapeHtml(acr.organismo_pais)}</div>
          <div class="text-[11px] text-slate-500 truncate" title="${escapeHtml(acr.organismo_nombre)}">${escapeHtml(acr.organismo_nombre)}</div>
        </div>
      `,
    },
    {
      id: 'norma',
      header: 'Norma',
      sortable: true,
      defaultWidthPct: 18,
      minWidthPx: 130,
      renderCell: (acr) => `
        <span class="inline-flex px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 font-mono text-[11px] font-bold whitespace-nowrap">
          ${escapeHtml(acr.norma_codigo)}
        </span>
      `,
    },
    {
      id: 'sector_iaf',
      header: 'Sectores IAF',
      sortable: true,
      defaultWidthPct: 22,
      minWidthPx: 160,
      renderCell: (acr) => {
        const sectorMeta = formatAcreditacionSectorsSummary(acr.sectores);
        return `
          <div class="space-y-0.5 min-w-0">
            <div class="font-semibold text-slate-800 truncate">${escapeHtml(sectorMeta.shortLabel)}</div>
            <div class="text-[11px] text-slate-500 truncate" title="${escapeHtml(sectorMeta.detailLabel)}">${escapeHtml(sectorMeta.detailLabel)}</div>
          </div>
        `;
      },
    },
    {
      id: 'estatus',
      header: 'Estatus',
      sortable: true,
      align: 'center',
      defaultWidthPct: 12,
      minWidthPx: 110,
      renderCell: (acr) => {
        const badge = formatAcreditacionDirectoryStatusBadge(acr.estatus);
        return `
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border whitespace-nowrap ${badge.badgeClass}">
            <span>${badge.symbol}</span>
            <span>${escapeHtml(badge.label)}</span>
          </span>
        `;
      },
    },
    {
      id: 'vigencia',
      header: 'Vigencia',
      sortable: true,
      defaultWidthPct: 12,
      minWidthPx: 130,
      renderCell: (acr) => {
        const expiryEval = evaluateAccreditationExpiry(acr.fecha_vencimiento);
        const expiryBadge = formatAcreditacionExpiryBadge(expiryEval);
        return `
          <div class="space-y-0.5 whitespace-nowrap">
            <div class="font-mono text-[11px] text-slate-800 font-medium tabular-nums">${escapeHtml(acr.fecha_vencimiento || 'Indefinida')}</div>
            <span class="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold border ${expiryBadge.badgeClass}">
              ${escapeHtml(expiryBadge.label)}
            </span>
          </div>
        `;
      },
    },
  ];

  const renderCard = (acr: AcreditacionDetailEntity): string => {
    const statusBadge = formatAcreditacionDirectoryStatusBadge(acr.estatus);
    const expiryEval = evaluateAccreditationExpiry(acr.fecha_vencimiento);
    const expiryBadge = formatAcreditacionExpiryBadge(expiryEval);
    const sectorMeta = formatAcreditacionSectorsSummary(acr.sectores);

    return `
      <div
        data-action="select-accreditation"
        data-accreditation-id="${escapeHtml(acr.id)}"
        tabindex="0"
        role="button"
        title="Abrir detalle de acreditación ${escapeHtml(acr.numero_acreditacion)}"
        class="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs hover:shadow-xs hover:border-indigo-300 transition-all cursor-pointer space-y-3.5 flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <div class="space-y-2.5">
          <div class="flex items-start justify-between gap-2">
            <div class="space-y-1 min-w-0">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 text-white text-[11px] font-bold font-mono">
                  <span aria-hidden="true">🏛️</span>
                  <span>${escapeHtml(acr.organismo_codigo)}</span>
                </span>
                <span class="text-[11px] font-medium text-slate-500">${escapeHtml(acr.organismo_pais)}</span>
              </div>
              <h3 class="text-sm font-bold text-slate-900 font-mono truncate">
                ${escapeHtml(acr.numero_acreditacion)}
              </h3>
              <p class="text-xs text-slate-600 truncate" title="${escapeHtml(acr.organismo_nombre)}">
                ${escapeHtml(acr.organismo_nombre)}
              </p>
            </div>

            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${statusBadge.badgeClass} shrink-0">
              <span>${statusBadge.symbol}</span>
              <span>${escapeHtml(statusBadge.label)}</span>
            </span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
            <div class="bg-slate-50 border border-slate-200/80 rounded-lg px-2.5 py-1.5">
              <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Norma ISO</div>
              <div class="font-mono font-bold text-indigo-800 truncate">${escapeHtml(acr.norma_codigo)}</div>
            </div>
            <div class="bg-slate-50 border border-slate-200/80 rounded-lg px-2.5 py-1.5">
              <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sectores IAF</div>
              <div class="font-semibold text-slate-800 truncate" title="${escapeHtml(sectorMeta.detailLabel)}">${escapeHtml(sectorMeta.shortLabel)}</div>
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 pt-1">
            <div>
              <span class="text-slate-400">Concesión:</span>
              <span class="font-mono font-semibold text-slate-800 tabular-nums">${escapeHtml(acr.fecha_concesion)}</span>
            </div>
            <div class="flex items-center gap-1.5">
              <span class="text-slate-400">Vence:</span>
              <span class="font-mono font-semibold text-slate-800 tabular-nums">${escapeHtml(acr.fecha_vencimiento || 'Indefinida')}</span>
              <span class="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold border ${expiryBadge.badgeClass}">
                ${escapeHtml(expiryBadge.label)}
              </span>
            </div>
          </div>
        </div>

        <div class="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
          <span class="inline-flex items-center gap-1.5 font-semibold text-slate-700 tabular-nums">
            <span aria-hidden="true">📜</span>
            <span><strong class="font-mono text-slate-900">${acr.activeCertificatesCount}</strong> ${
              acr.activeCertificatesCount === 1 ? 'certificado' : 'certificados'
            }</span>
          </span>
          <span class="font-semibold text-indigo-600">Detalle →</span>
        </div>
      </div>
    `;
  };

  const actionsHtml = `
    <div class="flex items-center gap-2 shrink-0">
      <button
        type="button"
        data-action="open-organismos-directory"
        class="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 hover:text-slate-900 shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
      >
        <span aria-hidden="true">🏛️</span>
        <span>Organismos</span>
      </button>
      ${
        isStaff
          ? renderMultiViewAddButton('open-create-acreditacion', 'Nueva Acreditación')
          : ''
      }
    </div>
  `;

  return renderUniversalTemplate<AcreditacionDetailEntity>({
    domainKey: 'acreditaciones',
    tableId: 'extra-acreditaciones-main',
    title: 'Acreditaciones Vigentes',
    subtitle:
      'Alcances de acreditación oficial ISO/IEC 17011 ante organismos internacionales (ENAC, UKAS, ANAB) vinculados a normas ISO y sectores técnicos IAF.',
    entityLabel: 'acreditaciones registradas',
    searchQuery: state.query,
    searchPlaceholder:
      'Buscar por N° acreditación, organismo (ENAC, UKAS...), norma o sector IAF...',
    searchInputId: 'acreditacionSearchInput',
    clearSearchBtnId: 'clearAcreditacionSearchBtn',
    totalCount: acreditaciones.length,
    filteredCount: sorted.length,
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen ?? true,
    sortState: {
      column: state.sortColumn,
      direction: state.sortDirection,
    },
    columnWidths: tableColumnWidths?.['extra-acreditaciones-main'],
    getRowAttrs: (acr) =>
      `data-action="select-accreditation" data-accreditation-id="${escapeHtml(acr.id)}" title="Abrir detalle de acreditación ${escapeHtml(acr.numero_acreditacion)}"`,
    facetGroups,
    items: sorted,
    columns,
    renderCard,
    emptyStateTitle: 'No se encontraron acreditaciones',
    emptyStateMessage:
      'No hay alcances de acreditación que coincidan con la búsqueda o facetas seleccionadas.',
    actionsHtml,
    loading,
    loadingMessage: 'Cargando acreditaciones registradas...',
    ...extractUniversalArchiveProps(archiveConfig, 'acreditaciones'),
  });
}

function renderAcreditacionParentChipsHtml(parents: DetailParentChip[]): string {
  return `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
      ${parents
        .map((parent) => {
          const sym = parent.symbol
            ? `<span aria-hidden="true" class="shrink-0">${parent.symbol}</span>`
            : '';
          if (parent.navAction) {
            const nav = parent.navAction;
            return `
              <button
                type="button"
                data-parent-nav="true"
                data-nav="${escapeHtml(nav.nav)}"
                ${nav.subview ? `data-subview="${escapeHtml(nav.subview)}"` : ''}
                ${nav.entityType ? `data-parent-type="${escapeHtml(nav.entityType)}"` : ''}
                ${nav.entityId ? `data-entity-id="${escapeHtml(nav.entityId)}"` : ''}
                ${
                  nav.sectorNumber !== undefined
                    ? `data-sector-number="${escapeHtml(String(nav.sectorNumber))}"`
                    : ''
                }
                ${nav.targetTab ? `data-target-tab="${escapeHtml(nav.targetTab)}"` : ''}
                data-entity-value="${escapeHtml(parent.value)}"
                class="w-full text-left bg-slate-50/70 hover:bg-indigo-50/70 border border-slate-200/90 hover:border-indigo-300 rounded-xl p-2.5 sm:p-3 space-y-0.5 transition-colors cursor-pointer group flex flex-col justify-between min-w-0"
                title="Abrir ${escapeHtml(parent.label)}: ${escapeHtml(parent.value)}"
              >
                <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between gap-2 w-full">
                  <span class="inline-flex items-center gap-1.5 min-w-0 truncate">
                    ${sym}
                    <span class="truncate">${escapeHtml(parent.label)}</span>
                  </span>
                  <span class="text-indigo-500 text-xs shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden="true">→</span>
                </span>
                <span class="block text-xs font-bold text-indigo-700 group-hover:text-indigo-900 group-hover:underline truncate w-full">
                  ${escapeHtml(parent.value)}
                </span>
              </button>
            `;
          }
          return `
            <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5 min-w-0">
              <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 truncate">
                ${sym}
                <span class="truncate">${escapeHtml(parent.label)}</span>
              </div>
              <div class="text-xs font-bold text-slate-800 truncate">
                ${escapeHtml(parent.value)}
              </div>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderAcreditacionDetailView(params: {
  profile: UserProfile;
  acr?: AcreditacionDetailEntity;
  state: AcreditacionViewState;
  isStaff: boolean;
  organismos: OrganismoAcreditacion[];
  normas: NormaEntity[];
  sectores: SectorIafEntity[];
  estatusList: EstatusCatalogItem[];
  certificates: ReadonlyArray<CertificadoDetailEntity>;
  subsectores: ReadonlyArray<SubsectorIafEntity>;
  tableColumnWidths?: Record<string, Record<string, number>>;
}): string {
  const {
    profile,
    acr,
    state,
    isStaff,
    organismos,
    normas,
    sectores,
    estatusList,
    certificates,
    subsectores,
    tableColumnWidths,
  } = params;

  const mode = resolveAcreditacionDetailMode(state, isStaff, acr);
  const isCreateMode = mode === 'add';
  const isReadOnly = mode === 'read';

  const draft: AcreditacionFormDraft =
    mode === 'add'
      ? state.formDraft ?? createEmptyAcreditacionFormDraft()
      : mode === 'edit'
      ? state.formDraft ??
        (acr ? createAcreditacionDraftFromEntity(acr) : createEmptyAcreditacionFormDraft())
      : acr
      ? createAcreditacionDraftFromEntity(acr)
      : createEmptyAcreditacionFormDraft();

  const statusBadge = acr ? formatAcreditacionDirectoryStatusBadge(acr.estatus) : undefined;
  const expiryEval = acr ? evaluateAccreditationExpiry(acr.fecha_vencimiento) : undefined;
  const expiryBadge = expiryEval ? formatAcreditacionExpiryBadge(expiryEval) : undefined;
  const sectorMeta = acr ? formatAcreditacionSectorsSummary(acr.sectores) : undefined;

  const coveredCerts = acr ? filterCoveredCertificatesForAccreditation(acr, certificates) : [];
  const scopedSubsectores = acr ? getSubsectoresForAccreditation(acr, subsectores) : [];
  const activeTab: AcreditacionChildTab =
    state.activeChildTab === 'sectores'
      ? 'sectores'
      : state.activeChildTab === 'subsectores'
      ? 'subsectores'
      : 'certificados';

  const readParents: DetailParentChip[] = acr
    ? [
        {
          label: 'Organismo de Acreditación',
          value: `${acr.organismo_codigo} — ${acr.organismo_nombre} (${acr.organismo_pais})`,
          symbol: '🏛️',
          navAction: {
            nav: 'extra',
            subview: 'organismos',
            entityType: 'organismo_acreditacion',
            entityId: acr.id_organismo,
          },
        },
        {
          label: 'Norma ISO',
          value: acr.norma_codigo,
          symbol: '📘',
          navAction: {
            nav: 'extra',
            subview: 'standards',
            entityType: 'norma',
            entityId: acr.id_norma,
          },
        },
        {
          label: 'Estatus',
          value: acr.estatus,
          symbol: '🏷️',
          navAction: {
            nav: 'extra',
            subview: 'estatus',
            entityType: 'estatus',
            entityId: acr.id_estatus,
          },
        },
      ]
    : [];

  const editParentSelectsHtml = `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
      ${renderDetailParentSelectCard({
        mode,
        formId: 'acreditacionDetailForm',
        selectId: 'accredParentOrganismoSelect',
        name: 'id_organismo',
        label: 'Organismo de Acreditación',
        symbol: '🏛️',
        selectedValue: draft.id_organismo,
        placeholder: 'Seleccione organismo...',
        required: true,
        options: organismos.map((org) => ({
          value: org.id,
          label: `${org.codigo} — ${org.nombre} (${org.pais})`,
        })),
      })}
      ${renderDetailParentSelectCard({
        mode,
        formId: 'acreditacionDetailForm',
        selectId: 'accredParentNormaSelect',
        name: 'id_norma',
        label: 'Norma ISO',
        symbol: '📘',
        selectedValue: draft.id_norma,
        placeholder: 'Seleccione norma...',
        required: true,
        options: normas.map((norma) => ({
          value: norma.id,
          label: `${norma.codigo || norma.norma} — ${norma.titulo}`,
        })),
      })}
      ${renderDetailParentSelectCard({
        mode,
        formId: 'acreditacionDetailForm',
        selectId: 'accredParentEstatusSelect',
        name: 'id_estatus',
        label: 'Estatus',
        symbol: '🏷️',
        selectedValue: draft.id_estatus,
        placeholder: 'Seleccione estatus...',
        required: true,
        options: estatusList.map((est) => ({
          value: est.id,
          label: est.estatus,
        })),
      })}
    </div>
  `;

  const customParentZoneHtml = isReadOnly
    ? renderAcreditacionParentChipsHtml(readParents)
    : editParentSelectsHtml;

  const normalizedWebsiteUrl = acr ? normalizeSafeHttpUrl(acr.organismo_sitio_web) : null;
  const parentMetaHtml =
    isReadOnly && acr && normalizedWebsiteUrl
      ? `
        <a
          href="${escapeHtml(normalizedWebsiteUrl)}"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-xs font-semibold text-indigo-700 hover:text-indigo-900 transition-colors"
        >
          <span aria-hidden="true">🌐</span>
          <span>Sitio web ${escapeHtml(acr.organismo_codigo)}</span>
          <span aria-hidden="true">↗</span>
        </a>
      `
      : '';

  const feedbackHtml =
    !isReadOnly && state.editErrorMessage
      ? `
        <div role="alert" class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800 flex items-center gap-2">
          <span aria-hidden="true">⚠️</span>
          <span>${escapeHtml(state.editErrorMessage)}</span>
        </div>
      `
      : '';

  const effectiveCoveredCount = acr
    ? certificates.length > 0
      ? coveredCerts.length
      : acr.activeCertificatesCount
    : 0;

  const customRecordBodyHtml =
    isReadOnly && acr && expiryBadge && sectorMeta
      ? renderReadOnlyAcreditacionBody(acr, expiryBadge, sectorMeta, effectiveCoveredCount)
      : renderAcreditacionFormBody(draft, sectores);

  const customTopActionsHtml = isStaff
    ? renderDetailFormTopActions({
        mode,
        isStaff: true,
        formId: 'acreditacionDetailForm',
        saveBtnId: 'saveAcreditacionFormBtn',
        cancelBtnId: 'cancelEditAcreditacionBtn',
        editBtnId: 'startEditAcreditacionBtn',
        saveTitle: isCreateMode ? 'Crear acreditación' : 'Guardar cambios',
        cancelTitle: isCreateMode ? 'Cancelar creación' : 'Cancelar edición',
        editTitle: 'Editar acreditación',
        showHistoryBtn: !isCreateMode,
        showArchiveBtn: !isCreateMode && canArchiveRecord(profile),
        extraAuditAttrs: acr
          ? `data-table-name="acreditacion_norma" data-record-id="${escapeHtml(acr.id)}" data-entity-name="${escapeHtml(acr.numero_acreditacion)}"`
          : '',
        extraArchiveAttrs: acr
          ? `data-archive-table="acreditacion_norma" data-archive-id="${escapeHtml(acr.id)}" data-archive-entity-label="Acreditación ISO/IEC 17011" data-archive-title="${escapeHtml(acr.numero_acreditacion)}" data-archive-subtitle="${escapeHtml(`${acr.organismo_codigo} · ${acr.norma_codigo}`)}"`
          : '',
      })
    : undefined;

  return renderDetailPageTemplate({
    entityType: 'Acreditación ISO/IEC 17011',
    entitySymbol: '🏅',
    title: isCreateMode ? 'Nueva Acreditación' : acr?.numero_acreditacion || 'Acreditación',
    eyebrowCode: !isCreateMode && acr ? `${acr.organismo_codigo} · ${acr.norma_codigo}` : undefined,
    subtitle: isCreateMode
      ? 'Registro de alcance de acreditación ISO/IEC 17011 vinculado a organismo, norma, estatus y sectores IAF.'
      : acr
      ? `${acr.organismo_nombre} (${acr.organismo_pais}) · ${acr.norma_titulo}`
      : undefined,
    statusBadge:
      !isCreateMode && statusBadge
        ? {
            label: statusBadge.label,
            badgeClass: statusBadge.badgeClass,
            symbol: statusBadge.symbol,
          }
        : undefined,
    secondaryHeaderBadge:
      !isCreateMode && expiryBadge
        ? {
            label: expiryBadge.label,
            badgeClass: expiryBadge.badgeClass,
          }
        : undefined,
    backButton: {
      label: 'Volver a Acreditaciones Vigentes',
      nav: 'extra',
      subview: 'accreditations',
      action: 'back-to-accreditations-list',
    },
    customTopActionsHtml,
    isCreateMode,
    parents: [],
    customParentZoneHtml,
    parentMetaHtml,
    tableName: 'acreditacion_norma',
    recordId: acr?.id || '',
    feedbackHtml,
    attributes: [],
    customRecordBodyHtml,
    childTabs:
      !isCreateMode && acr
        ? [
            {
              id: 'sectores',
              label: 'Sectores IAF Amparados',
              symbol: '🏭',
              count: acr.sectores.length,
            },
            {
              id: 'certificados',
              label: 'Certificados Amparados',
              symbol: '📜',
              count: coveredCerts.length,
            },
            {
              id: 'subsectores',
              label: 'Sub-Sectores IAF del Alcance',
              symbol: '🧩',
              count: scopedSubsectores.length,
            },
          ]
        : [],
    activeChildTabId: activeTab,
    childTabAttrName: 'data-accred-tab',
    renderChildTabContent:
      !isCreateMode && acr
        ? (tabId) => {
            if (tabId === 'sectores') {
              return renderAcreditacionSectoresTab(
                acr,
                sectores,
                subsectores,
                isStaff,
                tableColumnWidths
              );
            }
            if (tabId === 'subsectores') {
              return renderAcreditacionSubsectoresTab(acr, scopedSubsectores, tableColumnWidths);
            }
            return renderAcreditacionCertificadosTab(acr, coveredCerts, tableColumnWidths);
          }
        : undefined,
  });
}

function renderReadOnlyAcreditacionBody(
  acr: AcreditacionDetailEntity,
  expiryBadge: { label: string; badgeClass: string },
  sectorMeta: { shortLabel: string; detailLabel: string },
  effectiveCoveredCount: number
): string {
  return `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <div class="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-1">
        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Número de Acreditación</div>
        <div class="text-xs font-mono font-bold text-slate-900">${escapeHtml(acr.numero_acreditacion)}</div>
        <div class="text-[11px] text-slate-500">${escapeHtml(acr.organismo_codigo)} · ${escapeHtml(acr.organismo_pais)}</div>
      </div>

      <div class="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-1">
        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sectores IAF Amparados</div>
        <div class="text-xs font-bold text-slate-900">${escapeHtml(sectorMeta.shortLabel)}</div>
        <div class="text-[11px] text-slate-500 line-clamp-2">${escapeHtml(sectorMeta.detailLabel)}</div>
      </div>

      <div class="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-1">
        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Vigencia & Expiración</div>
        <div class="text-xs font-mono font-semibold text-slate-800 tabular-nums">
          ${escapeHtml(acr.fecha_concesion)} → ${escapeHtml(acr.fecha_vencimiento || 'Indefinida')}
        </div>
        <div>
          <span class="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold border ${expiryBadge.badgeClass}">
            ${escapeHtml(expiryBadge.label)}
          </span>
        </div>
      </div>

      <div class="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-1">
        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Certificados Amparados</div>
        <div class="text-lg font-mono font-bold text-slate-900 tabular-nums">${effectiveCoveredCount}</div>
        <div class="text-[11px] text-slate-500">${
          effectiveCoveredCount === 1
            ? 'Certificado activo cubierto'
            : 'Certificados activos cubiertos'
        }</div>
      </div>
    </div>
  `;
}

function renderAcreditacionFormBody(
  draft: AcreditacionFormDraft,
  sectores: ReadonlyArray<SectorIafEntity>
): string {
  const selectedSectorSet = new Set(draft.sector_ids || []);
  const sortedSectores = [...sectores].sort((a, b) => a.sector - b.sector);

  return `
    <form id="acreditacionDetailForm" novalidate class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 sm:p-3.5 space-y-3.5">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="space-y-1">
          <label for="accredNumeroInput" class="block text-xs font-bold text-slate-700">
            N° de Acreditación <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <input
            id="accredNumeroInput"
            name="numero_acreditacion"
            type="text"
            required
            maxlength="100"
            value="${escapeHtml(draft.numero_acreditacion)}"
            placeholder="Ej. 01/C-SC002"
            class="w-full text-xs font-mono px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>

        <div class="space-y-1">
          <label for="accredFechaConcesionInput" class="block text-xs font-bold text-slate-700">
            Fecha de Concesión <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <input
            id="accredFechaConcesionInput"
            name="fecha_concesion"
            type="date"
            required
            value="${escapeHtml(draft.fecha_concesion)}"
            class="w-full text-xs font-mono px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>

        <div class="space-y-1">
          <label for="accredFechaVencimientoInput" class="block text-xs font-bold text-slate-700">
            Fecha de Vencimiento
          </label>
          <input
            id="accredFechaVencimientoInput"
            name="fecha_vencimiento"
            type="date"
            value="${escapeHtml(draft.fecha_vencimiento)}"
            class="w-full text-xs font-mono px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>
      </div>

      <div class="space-y-1.5 pt-2 border-t border-slate-200/80">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="text-xs font-bold text-slate-700">
            Sectores IAF Amparados en el Alcance (${selectedSectorSet.size} seleccionados)
          </span>
          <span class="text-[11px] text-slate-500">
            Los certificados solo se vinculan si coinciden con la norma y al menos un sector IAF seleccionado.
          </span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          ${sortedSectores
            .map((sec) => {
              const checked = selectedSectorSet.has(sec.id);
              return `
                <label class="flex items-start gap-2 p-2 rounded-lg border ${
                  checked
                    ? 'border-indigo-300 bg-indigo-50/70'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                } cursor-pointer transition-colors text-xs">
                  <input
                    type="checkbox"
                    name="sector_ids"
                    value="${escapeHtml(sec.id)}"
                    ${checked ? 'checked' : ''}
                    class="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span class="min-w-0">
                    <span class="block font-bold text-slate-900">Sector ${sec.sector}</span>
                    <span class="block text-[11px] text-slate-600 truncate" title="${escapeHtml(sec.descripcion)}">${escapeHtml(sec.descripcion)}</span>
                  </span>
                </label>
              `;
            })
            .join('')}
        </div>
      </div>
    </form>
  `;
}

function renderAcreditacionSectoresTab(
  acr: AcreditacionDetailEntity,
  allSectores: ReadonlyArray<SectorIafEntity>,
  subsectores: ReadonlyArray<SubsectorIafEntity>,
  isStaff: boolean,
  tableColumnWidths?: Record<string, Record<string, number>>
): string {
  const linkedIds = new Set(acr.sectores.map((s) => s.id_sector_iaf));
  const availableSectores = allSectores
    .filter((s) => !s.deleted_at && !linkedIds.has(s.id))
    .sort((a, b) => a.sector - b.sector);

  const columns: ColumnDefinition<AcreditacionSectorLink>[] = [
    {
      id: 'sector',
      header: 'Sector IAF',
      defaultWidthPct: 18,
      minWidthPx: 120,
      renderCell: (link) => `
        <span class="font-mono font-bold text-indigo-700 whitespace-nowrap">
          🏭 Sector ${link.sector}
        </span>
      `,
    },
    {
      id: 'descripcion',
      header: 'Descripción Técnica',
      defaultWidthPct: 62,
      minWidthPx: 240,
      renderCell: (link) => `
        <span class="block text-slate-700 font-medium truncate" title="${escapeHtml(link.descripcion)}">
          ${escapeHtml(link.descripcion)}
        </span>
      `,
    },
    {
      id: 'subsectores',
      header: 'Sub-Sectores',
      align: 'center',
      defaultWidthPct: 20,
      minWidthPx: 120,
      renderCell: (link) => {
        const count = subsectores.filter(
          (sub) =>
            !sub.deleted_at &&
            (sub.id_sector_iaf === link.id_sector_iaf || sub.sector_numero === link.sector)
        ).length;
        return `
          <span class="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 tabular-nums">
            ${count} ${count === 1 ? 'sub-sector' : 'sub-sectores'}
          </span>
        `;
      },
    },
  ];

  const managementStripHtml = isStaff
    ? `
      <div class="bg-slate-50/80 border border-slate-200 rounded-xl p-3 space-y-2.5">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 class="text-xs font-bold text-slate-900">
              Alcance de Sectores IAF Vinculados (${acr.sectores.length})
            </h3>
            <p class="text-[11px] text-slate-500">
              Agregue o desvincule sectores económicos IAF para delimitar qué certificados ampara esta acreditación.
            </p>
          </div>
          ${
            availableSectores.length > 0
              ? `
                <form id="linkAccredSectorForm" data-accreditation-id="${escapeHtml(acr.id)}" class="flex items-center gap-2 shrink-0">
                  <select
                    id="accredAddSectorSelect"
                    name="id_sector_iaf"
                    aria-label="Seleccionar Sector IAF a vincular"
                    required
                    class="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 max-w-xs"
                  >
                    <option value="">Seleccionar sector IAF...</option>
                    ${availableSectores
                      .map(
                        (s) =>
                          `<option value="${escapeHtml(s.id)}">Sector ${s.sector} — ${escapeHtml(s.descripcion)}</option>`
                      )
                      .join('')}
                  </select>
                  <button
                    type="submit"
                    id="linkAccredSectorBtn"
                    class="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 transition-colors cursor-pointer whitespace-nowrap shadow-2xs"
                  >
                    + Vincular Sector
                  </button>
                </form>
              `
              : `<span class="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">Todos los sectores IAF activos están vinculados</span>`
          }
        </div>

        ${
          acr.sectores.length > 0
            ? `
              <div class="flex flex-wrap items-center gap-1.5 pt-1">
                ${acr.sectores
                  .map(
                    (link) => `
                      <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-800 shadow-2xs">
                        <span>Sector ${link.sector}</span>
                        <button
                          type="button"
                          data-action="unlink-accred-sector"
                          data-accreditation-id="${escapeHtml(acr.id)}"
                          data-sector-id="${escapeHtml(link.id_sector_iaf)}"
                          title="Desvincular Sector ${link.sector}"
                          aria-label="Desvincular Sector ${link.sector}"
                          class="text-slate-400 hover:text-rose-600 transition-colors cursor-pointer font-bold leading-none"
                        >✕</button>
                      </span>
                    `
                  )
                  .join('')}
              </div>
            `
            : ''
        }
      </div>
    `
    : '';

  return `
    <div class="space-y-3">
      ${managementStripHtml}
      ${renderListViewTable({
        tableId: 'extra-accred-tab-sectores',
        items: [...acr.sectores],
        columns,
        columnWidths: tableColumnWidths?.['extra-accred-tab-sectores'],
        getRowAttrs: (link) =>
          `data-action="select-iaf-sector" data-sector-id="${escapeHtml(link.id_sector_iaf)}" title="Abrir Sector IAF ${link.sector}"`,
        emptyStateTitle: 'Sin sectores IAF vinculados',
        emptyStateMessage: `La acreditación ${escapeHtml(acr.numero_acreditacion)} aún no tiene sectores IAF asociados; mientras permanezca sin sectores no amparará certificados.`,
      })}
    </div>
  `;
}

function renderAcreditacionCertificadosTab(
  acr: AcreditacionDetailEntity,
  certificates: ReadonlyArray<CertificadoDetailEntity>,
  tableColumnWidths?: Record<string, Record<string, number>>
): string {
  const columns: ColumnDefinition<CertificadoDetailEntity>[] = [
    {
      id: 'numero_certificado',
      header: 'N° Certificado',
      defaultWidthPct: 18,
      minWidthPx: 140,
      renderCell: (cert) => `
        <span class="inline-flex items-center gap-1.5 font-mono font-bold text-indigo-700 truncate">
          <span aria-hidden="true">📜</span>
          <span class="truncate">${escapeHtml(cert.numero_certificado)}</span>
        </span>
      `,
    },
    {
      id: 'organizacion',
      header: 'Organización Cliente',
      defaultWidthPct: 28,
      minWidthPx: 180,
      renderCell: (cert) => `
        <span class="block font-semibold text-slate-800 truncate" title="${escapeHtml(cert.organizacion_nombre)}">
          ${escapeHtml(cert.organizacion_nombre)}
        </span>
      `,
    },
    {
      id: 'norma',
      header: 'Norma',
      defaultWidthPct: 14,
      minWidthPx: 110,
      renderCell: (cert) => `
        <span class="block font-mono text-slate-700 truncate">${escapeHtml(cert.norma_codigo)}</span>
      `,
    },
    {
      id: 'sector_iaf',
      header: 'Sector IAF',
      defaultWidthPct: 12,
      minWidthPx: 95,
      renderCell: (cert) => `
        <span class="block text-slate-600 whitespace-nowrap">Sector ${cert.sector_iaf}</span>
      `,
    },
    {
      id: 'vigencia',
      header: 'Vigencia',
      defaultWidthPct: 18,
      minWidthPx: 175,
      renderCell: (cert) => `
        <span class="block font-mono text-[11px] text-slate-600 whitespace-nowrap tabular-nums">
          ${escapeHtml(cert.fecha_emision)} → ${escapeHtml(cert.fecha_vencimiento)}
        </span>
      `,
    },
    {
      id: 'estatus',
      header: 'Estatus',
      align: 'center',
      defaultWidthPct: 10,
      minWidthPx: 95,
      renderCell: (cert) => `
        <span class="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
          ${escapeHtml(cert.estatus)}
        </span>
      `,
    },
  ];

  return renderListViewTable({
    tableId: 'extra-accred-tab-certs',
    items: [...certificates],
    columns,
    columnWidths: tableColumnWidths?.['extra-accred-tab-certs'],
    getRowAttrs: (cert) =>
      `data-action="select-cert" data-cert-id="${escapeHtml(cert.id)}" title="Abrir certificado ${escapeHtml(cert.numero_certificado)}"`,
    emptyStateTitle: 'Sin certificados activos amparados actualmente',
    emptyStateMessage:
      acr.sectores.length === 0
        ? `La acreditación ${escapeHtml(acr.numero_acreditacion)} no tiene sectores IAF vinculados. Vincule al menos un sector en la pestaña "Sectores IAF Amparados" para calcular certificados cubiertos.`
        : `No existen certificados activos emitidos bajo ${escapeHtml(acr.norma_codigo)} dentro de los sectores IAF amparados por ${escapeHtml(acr.numero_acreditacion)}.`,
  });
}

function renderAcreditacionSubsectoresTab(
  acr: AcreditacionDetailEntity,
  subsectores: ReadonlyArray<SubsectorIafEntity>,
  tableColumnWidths?: Record<string, Record<string, number>>
): string {
  const columns: ColumnDefinition<SubsectorIafEntity>[] = [
    {
      id: 'codigo',
      header: 'Código',
      defaultWidthPct: 14,
      minWidthPx: 100,
      renderCell: (sub) => `
        <span class="font-mono font-bold text-slate-900 whitespace-nowrap">${escapeHtml(sub.codigo)}</span>
      `,
    },
    {
      id: 'sector',
      header: 'Sector IAF',
      defaultWidthPct: 16,
      minWidthPx: 110,
      renderCell: (sub) => `
        <span class="text-slate-700 whitespace-nowrap">Sector ${sub.sector_numero}</span>
      `,
    },
    {
      id: 'descripcion',
      header: 'Descripción Técnica',
      defaultWidthPct: 52,
      minWidthPx: 220,
      renderCell: (sub) => `
        <span class="block text-slate-700 truncate" title="${escapeHtml(sub.descripcion)}">${escapeHtml(sub.descripcion)}</span>
      `,
    },
    {
      id: 'riesgo',
      header: 'Nivel de Riesgo',
      align: 'center',
      defaultWidthPct: 18,
      minWidthPx: 120,
      renderCell: (sub) => {
        const risk = formatRiskCategoryBadge(sub.categoria_riesgo);
        return `
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${risk.badgeClass}">
            <span>${risk.symbol}</span>
            <span>${escapeHtml(risk.label)}</span>
          </span>
        `;
      },
    },
  ];

  return renderListViewTable({
    tableId: 'extra-accred-tab-subsectores',
    items: [...subsectores],
    columns,
    columnWidths: tableColumnWidths?.['extra-accred-tab-subsectores'],
    emptyStateTitle: 'Sin sub-sectores IAF detallados',
    emptyStateMessage: `No hay sub-sectores técnicos registrados para el alcance sectorial de la acreditación ${escapeHtml(acr.numero_acreditacion)}.`,
  });
}
