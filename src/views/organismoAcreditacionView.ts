import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import type { OrganismoAcreditacion } from '../lib/extraDomain';
import {
  createEmptyOrganismoFormDraft,
  createOrganismoDraftFromEntity,
  formatAcreditacionDirectoryStatusBadge,
  formatAcreditacionSectorsSummary,
  normalizeSafeHttpUrl,
  type AcreditacionDetailEntity,
  type OrganismoDetailMode,
  type OrganismoFormDraft,
  type OrganismoViewState,
} from '../lib/acreditacionDomain';
import {
  computeReactiveFacetCounts,
  filterRecordsWithFacets,
  sortItems,
  type ColumnDefinition,
  type MultiViewFacetCategory,
  type MultiViewFacetOptionSpec,
  type MultiViewSelectionMap,
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

export interface OrganismoViewProps {
  profile: UserProfile;
  state: OrganismoViewState;
  organismos: OrganismoAcreditacion[];
  acreditaciones: AcreditacionDetailEntity[];
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
}

interface OrganismoDirectoryItem extends OrganismoAcreditacion {
  acreditaciones_count: number;
}

export function resolveOrganismoDetailMode(
  state: OrganismoViewState,
  isStaff: boolean,
  selectedItem?: OrganismoAcreditacion
): OrganismoDetailMode {
  if (!isStaff) {
    return 'read';
  }
  if (state.isCreating && !state.selectedOrganismoId) {
    return 'add';
  }
  if (selectedItem && state.isEditingAttributes) {
    return 'edit';
  }
  return 'read';
}

export function renderOrganismoAcreditacionView(props: OrganismoViewProps): string {
  const {
    profile,
    state,
    organismos,
    acreditaciones,
    loading,
    archiveConfig,
    tableColumnWidths,
  } = props;
  const isStaff = isApprovedStaffProfile(profile);
  const activeAccreditations = acreditaciones.filter((a) => !a.deleted_at);

  // Add mode
  if (isStaff && state.isCreating && !state.selectedOrganismoId) {
    return renderOrganismoDetailPage({
      profile,
      state,
      item: undefined,
      linkedAccreditations: [],
      tableColumnWidths,
    });
  }

  // Detail mode (read or edit)
  if (state.selectedOrganismoId) {
    const selectedItem = organismos.find((o) => o.id === state.selectedOrganismoId);
    if (selectedItem) {
      const linkedAccreditations = activeAccreditations.filter(
        (a) => a.id_organismo === selectedItem.id
      );
      return renderOrganismoDetailPage({
        profile,
        state,
        item: selectedItem,
        linkedAccreditations,
        tableColumnWidths,
      });
    }
  }

  return renderOrganismoDirectoryView({
    state,
    isStaff,
    organismos,
    acreditaciones: activeAccreditations,
    loading,
    archiveConfig,
    tableColumnWidths,
  });
}

function renderOrganismoDirectoryView(params: {
  state: OrganismoViewState;
  isStaff: boolean;
  organismos: OrganismoAcreditacion[];
  acreditaciones: AcreditacionDetailEntity[];
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
}): string {
  const {
    state,
    isStaff,
    organismos,
    acreditaciones,
    loading,
    archiveConfig,
    tableColumnWidths,
  } = params;

  const countsByOrg = new Map<string, number>();
  for (const acr of acreditaciones) {
    countsByOrg.set(acr.id_organismo, (countsByOrg.get(acr.id_organismo) || 0) + 1);
  }

  const enrichedItems: OrganismoDirectoryItem[] = organismos.map((org) => ({
    ...org,
    acreditaciones_count: countsByOrg.get(org.id) || 0,
  }));

  const paisOptions: MultiViewFacetOptionSpec[] = Array.from(
    new Set(enrichedItems.map((o) => o.pais.trim()).filter(Boolean))
  )
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map((pais) => ({ value: pais, label: pais }));

  const facetCategories: MultiViewFacetCategory<OrganismoDirectoryItem>[] = [
    {
      id: 'pais',
      label: 'País / Jurisdicción',
      options: paisOptions,
      extractValues: (org) => org.pais.trim(),
    },
    {
      id: 'cobertura',
      label: 'Alcances Otorgados',
      options: [
        { value: 'CON_ACREDITACIONES', label: 'Con acreditaciones activas' },
        { value: 'SIN_ACREDITACIONES', label: 'Sin acreditaciones' },
      ],
      extractValues: (org) =>
        org.acreditaciones_count > 0 ? 'CON_ACREDITACIONES' : 'SIN_ACREDITACIONES',
    },
  ];

  const effectiveSelections: MultiViewSelectionMap = state.facetSelections ?? {};

  const searchOptions = {
    getSearchableText: (org: OrganismoDirectoryItem) =>
      `${org.codigo} ${org.nombre} ${org.pais} ${org.sitio_web || ''}`,
  };

  const filtered = filterRecordsWithFacets(
    enrichedItems,
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
        case 'codigo':
          return item.codigo;
        case 'nombre':
          return item.nombre;
        case 'pais':
          return item.pais;
        case 'sitio_web':
          return item.sitio_web || '';
        case 'acreditaciones_count':
          return item.acreditaciones_count;
        default:
          return (item as unknown as Record<string, unknown>)[col];
      }
    }
  );

  const facetGroups = computeReactiveFacetCounts(
    enrichedItems,
    state.query,
    facetCategories,
    effectiveSelections,
    searchOptions
  );

  const columns: ColumnDefinition<OrganismoDirectoryItem>[] = [
    {
      id: 'codigo',
      header: 'Código',
      sortable: true,
      defaultWidthPct: 16,
      minWidthPx: 110,
      renderCell: (org) => `
        <span class="inline-flex items-center gap-1.5 font-mono font-bold text-indigo-700 truncate">
          <span aria-hidden="true">🏛️</span>
          <span>${escapeHtml(org.codigo)}</span>
        </span>
      `,
    },
    {
      id: 'nombre',
      header: 'Nombre Oficial',
      sortable: true,
      defaultWidthPct: 34,
      minWidthPx: 200,
      renderCell: (org) => `
        <span class="block font-semibold text-slate-900 truncate" title="${escapeHtml(org.nombre)}">
          ${escapeHtml(org.nombre)}
        </span>
      `,
    },
    {
      id: 'pais',
      header: 'País',
      sortable: true,
      defaultWidthPct: 20,
      minWidthPx: 130,
      renderCell: (org) => `
        <span class="block text-slate-700 font-medium truncate" title="${escapeHtml(org.pais)}">
          ${escapeHtml(org.pais)}
        </span>
      `,
    },
    {
      id: 'sitio_web',
      header: 'Sitio Web',
      sortable: true,
      defaultWidthPct: 16,
      minWidthPx: 140,
      renderCell: (org) => {
        const safeUrl = normalizeSafeHttpUrl(org.sitio_web);
        if (!safeUrl) {
          return `<span class="text-slate-400 text-[11px]">No registrado</span>`;
        }
        const displayHost = safeUrl.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
        return `
          <span class="block font-mono text-[11px] text-indigo-700 truncate" title="${escapeHtml(safeUrl)}">
            ${escapeHtml(displayHost)}
          </span>
        `;
      },
    },
    {
      id: 'acreditaciones_count',
      header: 'Acreditaciones',
      sortable: true,
      align: 'center',
      defaultWidthPct: 14,
      minWidthPx: 120,
      renderCell: (org) => `
        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200 font-mono tabular-nums">
          <span>${org.acreditaciones_count}</span>
        </span>
      `,
    },
  ];

  const renderCard = (org: OrganismoDirectoryItem): string => {
    const safeUrl = normalizeSafeHttpUrl(org.sitio_web);
    const displayHost = safeUrl
      ? safeUrl.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
      : 'Sin sitio web';

    return `
      <div
        data-action="select-organismo"
        data-organismo-id="${escapeHtml(org.id)}"
        tabindex="0"
        role="button"
        title="Abrir detalle de ${escapeHtml(org.codigo)}"
        class="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs hover:shadow-xs hover:border-indigo-300 transition-all space-y-3 flex flex-col justify-between cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <div class="space-y-2">
          <div class="flex items-center justify-between gap-2">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900 text-white text-xs font-bold font-mono">
              <span aria-hidden="true">🏛️</span>
              <span>${escapeHtml(org.codigo)}</span>
            </span>
            <span class="text-xs font-medium text-slate-500 truncate">${escapeHtml(org.pais)}</span>
          </div>
          <h3 class="text-sm font-bold text-slate-900 leading-snug line-clamp-2" title="${escapeHtml(org.nombre)}">
            ${escapeHtml(org.nombre)}
          </h3>
          <div class="text-[11px] font-mono text-slate-500 truncate pt-1 border-t border-slate-100">
            ${escapeHtml(displayHost)}
          </div>
        </div>
        <div class="pt-2 flex items-center justify-between border-t border-slate-100 text-xs">
          <span class="font-mono text-slate-600 font-semibold tabular-nums">
            ${org.acreditaciones_count} ${org.acreditaciones_count === 1 ? 'acreditación' : 'acreditaciones'}
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
        data-action="open-accreditations-directory"
        class="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 hover:text-slate-900 shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
      >
        <span aria-hidden="true">🏅</span>
        <span>Acreditaciones</span>
      </button>
      ${
        isStaff
          ? renderMultiViewAddButton('open-create-organismo', 'Nuevo Organismo')
          : ''
      }
    </div>
  `;

  return renderUniversalTemplate<OrganismoDirectoryItem>({
    domainKey: 'organismos',
    tableId: 'extra-organismos-main',
    title: 'Organismos de Acreditación',
    subtitle:
      'Entidades acreditadoras signatarias IAF/MLA (ENAC, UKAS, ANAB, ONAC) habilitadas para emitir alcances ISO/IEC 17011.',
    entityLabel: 'organismos registrados',
    searchQuery: state.query,
    searchPlaceholder: 'Buscar por sigla (ENAC, UKAS...), nombre oficial o país...',
    searchInputId: 'organismoSearchInput',
    clearSearchBtnId: 'clearOrganismoSearchBtn',
    totalCount: enrichedItems.length,
    filteredCount: sorted.length,
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen ?? true,
    sortState: {
      column: state.sortColumn,
      direction: state.sortDirection,
    },
    columnWidths: tableColumnWidths?.['extra-organismos-main'],
    getRowAttrs: (org) =>
      `data-action="select-organismo" data-organismo-id="${escapeHtml(org.id)}" title="Abrir detalle de ${escapeHtml(org.codigo)}"`,
    facetGroups,
    items: sorted,
    columns,
    renderCard,
    actionsHtml,
    emptyStateTitle: 'No se encontraron organismos',
    emptyStateMessage:
      'No se encontraron organismos de acreditación que coincidan con los filtros aplicados.',
    loading,
    loadingMessage: 'Cargando organismos de acreditación...',
    ...extractUniversalArchiveProps(archiveConfig, 'organismos'),
  });
}

function renderOrganismoDetailPage(params: {
  profile: UserProfile;
  state: OrganismoViewState;
  item?: OrganismoAcreditacion;
  linkedAccreditations: AcreditacionDetailEntity[];
  tableColumnWidths?: Record<string, Record<string, number>>;
}): string {
  const { profile, state, item, linkedAccreditations, tableColumnWidths } = params;
  const isStaff = isApprovedStaffProfile(profile);
  const mode = resolveOrganismoDetailMode(state, isStaff, item);
  const isCreateMode = mode === 'add';
  const isReadOnly = mode === 'read';

  const draft: OrganismoFormDraft =
    mode === 'add'
      ? state.formDraft ?? createEmptyOrganismoFormDraft()
      : mode === 'edit'
      ? state.formDraft ??
        (item ? createOrganismoDraftFromEntity(item) : createEmptyOrganismoFormDraft())
      : item
      ? createOrganismoDraftFromEntity(item)
      : createEmptyOrganismoFormDraft();

  const feedbackHtml =
    !isReadOnly && state.editErrorMessage
      ? `
        <div role="alert" class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800 flex items-center gap-2">
          <span aria-hidden="true">⚠️</span>
          <span>${escapeHtml(state.editErrorMessage)}</span>
        </div>
      `
      : '';

  const safeWebsiteUrl = normalizeSafeHttpUrl(item?.sitio_web);

  const customRecordBodyHtml = isReadOnly
    ? `
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-1">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Código / Sigla
          </div>
          <div class="text-xs font-mono font-bold text-slate-900">
            ${escapeHtml(item?.codigo || draft.codigo || '—')}
          </div>
        </div>
        <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-1 sm:col-span-2 lg:col-span-1">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Nombre Oficial
          </div>
          <div class="text-xs font-semibold text-slate-900">
            ${escapeHtml(item?.nombre || draft.nombre || '—')}
          </div>
        </div>
        <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-1">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            País / Jurisdicción
          </div>
          <div class="text-xs font-semibold text-slate-900">
            ${escapeHtml(item?.pais || draft.pais || '—')}
          </div>
        </div>
        <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-1">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Sitio Web Oficial
          </div>
          <div class="text-xs font-semibold">
            ${
              safeWebsiteUrl
                ? `
                  <a
                    href="${escapeHtml(safeWebsiteUrl)}"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1 text-indigo-700 hover:text-indigo-900 hover:underline font-mono truncate max-w-full"
                  >
                    <span class="truncate">${escapeHtml(safeWebsiteUrl)}</span>
                    <span aria-hidden="true">↗</span>
                  </a>
                `
                : `<span class="text-slate-400">No registrado</span>`
            }
          </div>
        </div>
      </div>
    `
    : `
      <form id="organismoDetailForm" novalidate class="bg-slate-50/70 p-3 sm:p-3.5 border border-slate-200/90 rounded-xl">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div class="space-y-1">
            <label for="organismoCodigoInput" class="block text-xs font-bold text-slate-700">
              Código / Sigla <span class="text-rose-600" aria-hidden="true">*</span>
            </label>
            <input
              type="text"
              id="organismoCodigoInput"
              name="codigo"
              value="${escapeHtml(draft.codigo)}"
              placeholder="Ej. ENAC"
              required
              maxlength="20"
              class="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono uppercase font-bold text-slate-900 focus:ring-2 focus:ring-slate-900 focus:outline-none"
            />
          </div>

          <div class="space-y-1 sm:col-span-2 lg:col-span-1">
            <label for="organismoNombreInput" class="block text-xs font-bold text-slate-700">
              Nombre Oficial <span class="text-rose-600" aria-hidden="true">*</span>
            </label>
            <input
              type="text"
              id="organismoNombreInput"
              name="nombre"
              value="${escapeHtml(draft.nombre)}"
              placeholder="Ej. Entidad Nacional de Acreditación"
              required
              maxlength="255"
              class="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-slate-900 focus:outline-none"
            />
          </div>

          <div class="space-y-1">
            <label for="organismoPaisInput" class="block text-xs font-bold text-slate-700">
              País <span class="text-rose-600" aria-hidden="true">*</span>
            </label>
            <input
              type="text"
              id="organismoPaisInput"
              name="pais"
              value="${escapeHtml(draft.pais)}"
              placeholder="Ej. España"
              required
              maxlength="100"
              class="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-slate-900 focus:outline-none"
            />
          </div>

          <div class="space-y-1">
            <label for="organismoSitioWebInput" class="block text-xs font-bold text-slate-700">
              Sitio Web Oficial
            </label>
            <input
              type="url"
              id="organismoSitioWebInput"
              name="sitio_web"
              value="${escapeHtml(draft.sitio_web)}"
              placeholder="https://www.enac.es"
              maxlength="255"
              class="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:ring-2 focus:ring-slate-900 focus:outline-none"
            />
          </div>
        </div>
      </form>
    `;

  const accredColumns: ColumnDefinition<AcreditacionDetailEntity>[] = [
    {
      id: 'numero_acreditacion',
      header: 'N° Acreditación',
      defaultWidthPct: 22,
      minWidthPx: 140,
      renderCell: (a) => `
        <span class="inline-flex items-center gap-1.5 font-mono font-bold text-indigo-700 truncate">
          <span aria-hidden="true">🏅</span>
          <span class="truncate">${escapeHtml(a.numero_acreditacion)}</span>
        </span>
      `,
    },
    {
      id: 'norma',
      header: 'Norma ISO',
      defaultWidthPct: 20,
      minWidthPx: 120,
      renderCell: (a) => `
        <span class="inline-flex px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 font-mono text-[11px] font-bold">
          ${escapeHtml(a.norma_codigo)}
        </span>
      `,
    },
    {
      id: 'sector_iaf',
      header: 'Sectores IAF',
      defaultWidthPct: 26,
      minWidthPx: 160,
      renderCell: (a) => {
        const meta = formatAcreditacionSectorsSummary(a.sectores);
        return `
          <span class="block text-slate-800 font-semibold truncate" title="${escapeHtml(meta.detailLabel)}">
            ${escapeHtml(meta.shortLabel)}
          </span>
        `;
      },
    },
    {
      id: 'vigencia',
      header: 'Vigencia',
      defaultWidthPct: 18,
      minWidthPx: 130,
      renderCell: (a) => `
        <span class="block font-mono text-[11px] text-slate-600 truncate tabular-nums">
          ${escapeHtml(a.fecha_concesion)} → ${escapeHtml(a.fecha_vencimiento || 'Indefinida')}
        </span>
      `,
    },
    {
      id: 'estatus',
      header: 'Estatus',
      align: 'center',
      defaultWidthPct: 14,
      minWidthPx: 110,
      renderCell: (a) => {
        const badge = formatAcreditacionDirectoryStatusBadge(a.estatus);
        return `
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border ${badge.badgeClass}">
            <span>${badge.symbol}</span>
            <span>${escapeHtml(badge.label)}</span>
          </span>
        `;
      },
    },
  ];

  const tabAcreditacionesHtml = !isCreateMode && item
    ? `
      <div class="space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 class="text-xs font-bold text-slate-900">
              Acreditaciones Otorgadas por ${escapeHtml(item.codigo)}
            </h3>
            <p class="text-[11px] text-slate-500">
              Alcances normativos y sectoriales activos vinculados a este organismo acreditador.
            </p>
          </div>
          ${
            isStaff
              ? `
                <button
                  type="button"
                  data-action="open-create-acreditacion"
                  data-organismo-id="${escapeHtml(item.id)}"
                  class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer shrink-0"
                >
                  <span>+ Nueva Acreditación</span>
                </button>
              `
              : ''
          }
        </div>
        ${renderListViewTable({
          tableId: 'org-accred-tab-acreditaciones',
          items: linkedAccreditations,
          columns: accredColumns,
          columnWidths: tableColumnWidths?.['org-accred-tab-acreditaciones'],
          getRowAttrs: (a) =>
            `data-action="select-accreditation" data-accreditation-id="${escapeHtml(a.id)}" title="Abrir acreditación ${escapeHtml(a.numero_acreditacion)}"`,
          emptyStateTitle: 'Sin acreditaciones registradas',
          emptyStateMessage: `${escapeHtml(item.codigo)} aún no tiene acreditaciones activas asociadas.`,
        })}
      </div>
    `
    : '';

  const customTopActionsHtml = isStaff
    ? renderDetailFormTopActions({
        mode,
        isStaff: true,
        formId: 'organismoDetailForm',
        saveBtnId: 'saveOrganismoFormBtn',
        cancelBtnId: 'cancelEditOrganismoBtn',
        editBtnId: 'startEditOrganismoBtn',
        saveTitle: isCreateMode ? 'Crear organismo' : 'Guardar cambios',
        cancelTitle: isCreateMode ? 'Cancelar creación' : 'Cancelar edición',
        editTitle: 'Editar organismo',
        showHistoryBtn: !isCreateMode,
        showArchiveBtn: !isCreateMode && canArchiveRecord(profile),
        extraAuditAttrs: item
          ? `data-table-name="organismo_acreditacion" data-record-id="${escapeHtml(item.id)}" data-entity-name="${escapeHtml(item.codigo)}"`
          : '',
        extraArchiveAttrs: item
          ? `data-archive-table="organismo_acreditacion" data-archive-id="${escapeHtml(item.id)}" data-archive-entity-label="Organismo de Acreditación" data-archive-title="${escapeHtml(item.codigo)}" data-archive-subtitle="${escapeHtml(item.nombre)}"`
          : '',
      })
    : undefined;

  return renderDetailPageTemplate({
    entityType: 'Organismo de Acreditación',
    entitySymbol: '🏛️',
    title: isCreateMode ? 'Nuevo Organismo de Acreditación' : item?.codigo || 'Organismo',
    subtitle: isCreateMode
      ? 'Alta de organismo acreditador ISO/IEC 17011 en el catálogo maestro.'
      : item
      ? `${item.nombre} (${item.pais})`
      : undefined,
    eyebrowCode: !isCreateMode && item ? item.pais : undefined,
    backButton: {
      label: 'Volver a Organismos de Acreditación',
      nav: 'extra',
      subview: 'organismos',
      action: 'back-to-organismos-list',
    },
    customTopActionsHtml,
    isCreateMode,
    parents: [],
    tableName: 'organismo_acreditacion',
    recordId: item?.id || '',
    feedbackHtml,
    attributes: [],
    customRecordBodyHtml,
    childTabs:
      !isCreateMode && item
        ? [
            {
              id: 'acreditaciones',
              label: 'Acreditaciones Otorgadas',
              symbol: '🏅',
              count: linkedAccreditations.length,
            },
          ]
        : [],
    activeChildTabId: 'acreditaciones',
    childTabAttrName: 'data-organismo-tab',
    renderChildTabContent: !isCreateMode && item ? () => tabAcreditacionesHtml : undefined,
  });
}
