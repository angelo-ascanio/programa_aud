import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import {
  createEmptyTipoFormDraft,
  createTipoFormDraftFromEntity,
  type CatalogSimpleDetailMode,
  type TipoAuditoriaCatalogItem,
  type TipoAuditoriaFormDraft,
} from '../lib/extraDomain';
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
import type { ProgramacionAuditEntity } from '../lib/auditExecution';
import {
  canArchiveRecord,
  extractUniversalArchiveProps,
  type ArchiveMultiViewConfig,
} from '../lib/archiveGovernance';

export interface TipoAuditoriaViewState {
  selectedTipoId: string | null;
  query: string;
  selectedCycle?: string;
  viewMode: 'grid' | 'list';
  sortColumn: string | null;
  sortDirection: SortDirection;
  isSidebarOpen?: boolean;
  facetSelections?: MultiViewSelectionMap;
  isCreating?: boolean;
  isEditingAttributes?: boolean;
  formDraft?: TipoAuditoriaFormDraft;
  editErrorMessage?: string | null;
}

export interface TipoAuditoriaViewProps {
  profile: UserProfile;
  state: TipoAuditoriaViewState;
  tiposList: TipoAuditoriaCatalogItem[];
  audits?: ProgramacionAuditEntity[];
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
}

export function resolveTipoAuditoriaDetailMode(
  state: TipoAuditoriaViewState,
  isStaff: boolean,
  selectedItem?: TipoAuditoriaCatalogItem
): CatalogSimpleDetailMode {
  if (!isStaff) {
    return 'read';
  }
  if (state.isCreating && !state.selectedTipoId) {
    return 'add';
  }
  if (selectedItem && state.isEditingAttributes) {
    return 'edit';
  }
  return 'read';
}

export function renderTipoAuditoriaView(props: TipoAuditoriaViewProps): string {
  const { profile, state, tiposList, audits = [], archiveConfig, tableColumnWidths } = props;
  const isStaff = isApprovedStaffProfile(profile);

  // Add mode
  if (isStaff && state.isCreating && !state.selectedTipoId) {
    return renderTipoDetailPage({
      profile,
      state,
      item: undefined,
      audits: [],
      tableColumnWidths,
    });
  }

  // Detail mode
  if (state.selectedTipoId) {
    const selectedItem =
      tiposList.find(
        (t) =>
          t.id === state.selectedTipoId ||
          t.tipo.toLowerCase() === state.selectedTipoId?.toLowerCase()
      ) || tiposList[0];

    if (selectedItem) {
      return renderTipoDetailPage({
        profile,
        state,
        item: selectedItem,
        audits: audits.filter(
          (a) => a.tipo_auditoria.toLowerCase() === selectedItem.tipo.toLowerCase()
        ),
        tableColumnWidths,
      });
    }
  }

  // Otherwise, render the Universal Multi View Directory
  return renderTipoDirectoryView({
    profile,
    state,
    tiposList,
    loading: props.loading,
    archiveConfig,
    tableColumnWidths,
  });
}

function getTipoCycleCategory(item: TipoAuditoriaCatalogItem): string {
  const stage = `${item.etapa_ciclo} ${item.tipo}`.toLowerCase();
  if (stage.includes('inicial') || stage.includes('etapa 1') || stage.includes('etapa 2')) {
    return 'Inicial';
  }
  if (stage.includes('vigilancia') || stage.includes('seguimiento')) {
    return 'Seguimiento';
  }
  if (
    stage.includes('recertificación') ||
    stage.includes('recertificacion') ||
    stage.includes('renovación') ||
    stage.includes('renovacion')
  ) {
    return 'Renovación';
  }
  return 'Especial';
}

function renderTipoDirectoryView(params: {
  profile: UserProfile;
  state: TipoAuditoriaViewState;
  tiposList: TipoAuditoriaCatalogItem[];
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
}): string {
  const { profile, state, tiposList, loading, archiveConfig, tableColumnWidths } = params;
  const isStaff = isApprovedStaffProfile(profile);

  const facetCategories: MultiViewFacetCategory<TipoAuditoriaCatalogItem>[] = [
    {
      id: 'ciclo',
      label: 'Categoría de Ciclo',
      options: ['Inicial', 'Seguimiento', 'Renovación', 'Especial'],
      extractValues: (item) => getTipoCycleCategory(item),
    },
  ];

  const effectiveSelections: MultiViewSelectionMap = state.facetSelections
    ? state.facetSelections
    : {
        ciclo:
          state.selectedCycle && state.selectedCycle !== 'ALL'
            ? new Set([state.selectedCycle])
            : new Set<string>(),
      };

  const searchOptions = {
    getSearchableText: (item: TipoAuditoriaCatalogItem) =>
      `${item.tipo} ${item.etapa_ciclo} ${item.descripcion} ${item.duracion_formula}`,
  };

  const filtered = filterRecordsWithFacets(
    tiposList,
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
        case 'tipo':
          return item.tipo;
        case 'etapa':
          return item.etapa_ciclo;
        case 'descripcion':
          return item.descripcion;
        case 'usage':
          return item.usage_count;
        default:
          return (item as unknown as Record<string, unknown>)[col];
      }
    }
  );

  const facetGroups = computeReactiveFacetCounts(
    tiposList,
    state.query,
    facetCategories,
    effectiveSelections,
    searchOptions
  );

  const columns: ColumnDefinition<TipoAuditoriaCatalogItem>[] = [
    {
      id: 'tipo',
      header: 'Modalidad Canónica',
      sortable: true,
      defaultWidthPct: 24,
      minWidthPx: 140,
      renderCell: (item) => `
        <span class="inline-flex items-center font-mono bg-indigo-50 text-indigo-800 border border-indigo-200 px-2 py-0.5 rounded text-xs font-bold">
          ${escapeHtml(item.tipo)}
        </span>
      `,
    },
    {
      id: 'descripcion',
      header: 'Propósito Normativo (ISO 17021-1)',
      sortable: true,
      defaultWidthPct: 40,
      minWidthPx: 220,
      renderCell: (item) => `
        <span class="block text-slate-600 truncate" title="${escapeHtml(item.descripcion)}">
          ${escapeHtml(item.descripcion)}
        </span>
      `,
    },
    {
      id: 'etapa',
      header: 'Etapa del Ciclo Trienal',
      sortable: true,
      defaultWidthPct: 20,
      minWidthPx: 140,
      renderCell: (item) => `
        <span class="inline-flex items-center gap-1 text-[11px] bg-slate-100 px-2 py-0.5 rounded text-slate-800 font-semibold max-w-full truncate">
          <span aria-hidden="true">🔄</span>
          <span class="truncate">${escapeHtml(item.etapa_ciclo)}</span>
        </span>
      `,
    },
    {
      id: 'usage',
      header: 'Auditorías',
      sortable: true,
      align: 'center',
      defaultWidthPct: 16,
      minWidthPx: 110,
      renderCell: (item) => `
        <span class="inline-flex items-center gap-1 font-mono font-bold px-2.5 py-0.5 rounded-full text-xs bg-slate-100 text-slate-800 border border-slate-200 tabular-nums">
          ${item.usage_count} ejecutadas
        </span>
      `,
    },
  ];

  const renderCard = (item: TipoAuditoriaCatalogItem): string => {
    return `
      <div
        data-action="select-tipo"
        data-tipo-id="${escapeHtml(item.id)}"
        tabindex="0"
        role="button"
        title="Abrir detalle de ${escapeHtml(item.tipo)}"
        class="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs hover:shadow-xs hover:border-indigo-300 transition-all space-y-3 flex flex-col justify-between cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <div class="space-y-2">
          <div class="flex items-center justify-between gap-2">
            <span class="font-mono bg-indigo-50 text-indigo-800 border border-indigo-200 px-2.5 py-1 rounded text-xs font-bold">
              ${escapeHtml(item.tipo)}
            </span>
            <span class="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
              ISO 17021-1
            </span>
          </div>
          <div class="text-[11px] font-bold text-slate-700 flex items-center gap-1">
            <span aria-hidden="true">🔄</span>
            <span>${escapeHtml(item.etapa_ciclo)}</span>
          </div>
          <p class="text-xs text-slate-600 leading-relaxed font-medium">
            ${escapeHtml(item.descripcion)}
          </p>
          <div class="text-[11px] text-slate-500 pt-1 border-t border-slate-100">
            <strong class="text-slate-700">Duración:</strong> ${escapeHtml(item.duracion_formula)}
          </div>
        </div>
        <div class="pt-3 flex items-center justify-between border-t border-slate-100 text-xs">
          <span class="font-mono text-slate-500 font-semibold tabular-nums">${item.usage_count} eventos</span>
          <span class="font-semibold text-indigo-600">Reglas de Ciclo →</span>
        </div>
      </div>
    `;
  };

  return renderUniversalTemplate<TipoAuditoriaCatalogItem>({
    domainKey: 'tipos',
    tableId: 'extra-tipos-main',
    title: 'Tipos de Auditoría de Certificación',
    subtitle:
      'Modalidades canónicas reguladas por ISO/IEC 17021-1:2015 para los ciclos de certificación inicial, vigilancia anual y renovación trienal.',
    entityLabel: 'tipos de auditoría',
    searchQuery: state.query,
    searchPlaceholder: 'Buscar tipo (Etapa 1, Vigilancia, Renovación...)...',
    searchInputId: 'tipoSearchInput',
    clearSearchBtnId: 'clearTipoSearchBtn',
    totalCount: tiposList.length,
    filteredCount: sorted.length,
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen ?? true,
    sortState: {
      column: state.sortColumn,
      direction: state.sortDirection,
    },
    columnWidths: tableColumnWidths?.['extra-tipos-main'],
    getRowAttrs: (item) =>
      `data-action="select-tipo" data-tipo-id="${escapeHtml(item.id)}" title="Abrir detalle de ${escapeHtml(item.tipo)}"`,
    facetGroups,
    items: sorted,
    columns,
    renderCard,
    actionsHtml: isStaff
      ? renderMultiViewAddButton('open-create-tipo', 'Nuevo Tipo de Auditoría')
      : '',
    emptyStateTitle: 'No se encontraron tipos de auditoría',
    emptyStateMessage: 'No se encontraron tipos de auditoría que coincidan con los filtros aplicados.',
    loading,
    ...extractUniversalArchiveProps(archiveConfig, 'tipos'),
  });
}

function renderTipoDetailPage(params: {
  profile: UserProfile;
  state: TipoAuditoriaViewState;
  item?: TipoAuditoriaCatalogItem;
  audits: ProgramacionAuditEntity[];
  tableColumnWidths?: Record<string, Record<string, number>>;
}): string {
  const { profile, state, item, audits, tableColumnWidths } = params;
  const isStaff = isApprovedStaffProfile(profile);
  const mode = resolveTipoAuditoriaDetailMode(state, isStaff, item);
  const isCreateMode = mode === 'add';
  const isReadOnly = mode === 'read';

  const draft: TipoAuditoriaFormDraft =
    mode === 'add'
      ? state.formDraft ?? createEmptyTipoFormDraft()
      : mode === 'edit'
      ? state.formDraft ??
        (item ? createTipoFormDraftFromEntity(item) : createEmptyTipoFormDraft())
      : item
      ? createTipoFormDraftFromEntity(item)
      : createEmptyTipoFormDraft();

  const feedbackHtml =
    !isReadOnly && state.editErrorMessage
      ? `
        <div role="alert" class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800 flex items-center gap-2">
          <span aria-hidden="true">⚠️</span>
          <span>${escapeHtml(state.editErrorMessage)}</span>
        </div>
      `
      : '';

  const recordFormHtml = isReadOnly
    ? `
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-1">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Modalidad Oficial
          </div>
          <div class="text-xs font-mono font-bold text-slate-900">
            ${escapeHtml(item?.tipo || draft.tipo || '—')}
          </div>
        </div>
        <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-1">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Etapa en Ciclo Trienal
          </div>
          <div class="text-xs font-semibold text-slate-900">
            ${escapeHtml(item?.etapa_ciclo || 'Modalidad Específica')}
          </div>
        </div>
        <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-1">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Eventos en el Sistema
          </div>
          <div class="text-xs font-semibold font-mono text-slate-900 tabular-nums">
            ${item?.usage_count ?? 0} Auditorías Registradas
          </div>
        </div>
        <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-1">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Fórmula de Duración (IAF MD 5)
          </div>
          <div class="text-xs font-medium text-slate-700">
            ${escapeHtml(item?.duracion_formula || 'Según tabla IAF MD 5')}
          </div>
        </div>
        <div class="sm:col-span-2 bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-1">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Requisitos de Reporte
          </div>
          <div class="text-xs font-medium text-slate-700">
            ${escapeHtml(item?.reporte_requerido || 'Informe técnico de auditoría')}
          </div>
        </div>
      </div>
    `
    : `
      <form id="tipoDetailForm" novalidate class="space-y-3 bg-slate-50/70 p-3 sm:p-3.5 border border-slate-200/90 rounded-xl">
        <div class="space-y-1.5 max-w-xl">
          <div class="flex items-center justify-between gap-2">
            <label for="tipoNombreInput" class="block text-xs font-bold text-slate-700">
              Nombre del Tipo de Auditoría <span class="text-rose-600" aria-hidden="true">*</span>
            </label>
            <span id="tipoCharCount" class="text-[11px] font-mono text-slate-500 tabular-nums">
              ${draft.tipo.length} / 50
            </span>
          </div>
          <input
            type="text"
            id="tipoNombreInput"
            name="tipo"
            value="${escapeHtml(draft.tipo)}"
            placeholder="Ej. Transferencia Especial"
            required
            maxlength="50"
            class="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-slate-900 focus:outline-none"
          />
          <p class="text-[11px] text-slate-500">
            Valor canónico persistido en <code>public.tipo_auditoria</code> (máximo 50 caracteres, único entre activos).
          </p>
        </div>
      </form>
    `;

  const auditColumns: ColumnDefinition<ProgramacionAuditEntity>[] = [
    {
      id: 'codigo_auditoria',
      header: 'Código Auditoría',
      defaultWidthPct: 20,
      minWidthPx: 130,
      renderCell: (a) => `
        <span class="inline-flex items-center gap-1.5 font-mono font-bold text-indigo-700">
          <span aria-hidden="true">🗓️</span>
          <span class="truncate">${escapeHtml(a.codigo_auditoria)}</span>
        </span>
      `,
    },
    {
      id: 'organizacion',
      header: 'Organización',
      defaultWidthPct: 30,
      minWidthPx: 160,
      renderCell: (a) => `
        <span class="block font-semibold text-slate-800 truncate" title="${escapeHtml(a.organizacion_nombre)}">
          ${escapeHtml(a.organizacion_nombre)}
        </span>
      `,
    },
    {
      id: 'norma',
      header: 'Norma',
      defaultWidthPct: 18,
      minWidthPx: 110,
      renderCell: (a) => `
        <span class="block text-slate-700 truncate">${escapeHtml(a.norma_codigo)}</span>
      `,
    },
    {
      id: 'fechas',
      header: 'Fechas',
      defaultWidthPct: 18,
      minWidthPx: 120,
      renderCell: (a) => `
        <span class="block font-mono text-[11px] text-slate-600 truncate">
          ${escapeHtml(a.fecha_inicio)} → ${escapeHtml(a.fecha_fin)}
        </span>
      `,
    },
    {
      id: 'estatus',
      header: 'Estatus',
      align: 'center',
      defaultWidthPct: 14,
      minWidthPx: 100,
      renderCell: (a) => `
        <span class="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-800 border border-slate-200">
          ${escapeHtml(a.estatus)}
        </span>
      `,
    },
  ];

  const tabAuditoriasHtml = renderListViewTable({
    tableId: 'extra-tipo-tab-audits',
    items: audits,
    columns: auditColumns,
    columnWidths: tableColumnWidths?.['extra-tipo-tab-audits'],
    getRowAttrs: (a) =>
      `data-action="select-prog-audit" data-audit-id="${escapeHtml(a.id)}" title="Abrir auditoría ${escapeHtml(a.codigo_auditoria)}"`,
    emptyStateTitle: 'Sin auditorías vinculadas',
    emptyStateMessage: `No hay auditorías programadas bajo la modalidad "${escapeHtml(item?.tipo || '')}".`,
  });

  const customTopActionsHtml = isStaff
    ? renderDetailFormTopActions({
        mode,
        isStaff: true,
        formId: 'tipoDetailForm',
        saveBtnId: 'saveTipoFormBtn',
        cancelBtnId: 'cancelEditTipoBtn',
        editBtnId: 'startEditTipoBtn',
        saveTitle: isCreateMode ? 'Crear tipo de auditoría' : 'Guardar cambios',
        cancelTitle: isCreateMode ? 'Cancelar creación' : 'Cancelar edición',
        editTitle: 'Editar tipo de auditoría',
        showHistoryBtn: !isCreateMode,
        showArchiveBtn: !isCreateMode && canArchiveRecord(profile),
        extraAuditAttrs: item
          ? `data-table-name="tipo_auditoria" data-record-id="${escapeHtml(item.id)}" data-entity-name="${escapeHtml(item.tipo)}"`
          : '',
        extraArchiveAttrs: item
          ? `data-archive-table="tipo_auditoria" data-archive-id="${escapeHtml(item.id)}" data-archive-entity-label="Tipo de Auditoría" data-archive-title="${escapeHtml(item.tipo)}" data-archive-subtitle="${escapeHtml(item.etapa_ciclo)}"`
          : '',
      })
    : undefined;

  return renderDetailPageTemplate({
    entityType: 'Modalidad Canónica de Auditoría',
    entitySymbol: '📑',
    title: isCreateMode ? 'Nuevo Tipo de Auditoría' : item?.tipo || 'Tipo de Auditoría',
    subtitle: isCreateMode
      ? 'Alta de nueva modalidad operativa de auditoría.'
      : item?.descripcion,
    statusBadge:
      !isCreateMode && item
        ? {
            label: item.etapa_ciclo,
            badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
            symbol: '🔄',
          }
        : undefined,
    backButton: {
      label: 'Volver al Catálogo de Tipos',
      nav: 'extra',
      subview: 'tipos',
      action: 'back-to-tipo-list',
    },
    customTopActionsHtml,
    isCreateMode,
    parents: [],
    tableName: 'tipo_auditoria',
    recordId: item?.id || '',
    feedbackHtml,
    attributes: [],
    customRecordBodyHtml: recordFormHtml,
    childTabs:
      !isCreateMode && item
        ? [{ id: 'auditorias', label: 'Auditorías Vinculadas', symbol: '🗓️', count: audits.length }]
        : [],
    activeChildTabId: 'auditorias',
    childTabAttrName: 'data-tipo-tab',
    renderChildTabContent: !isCreateMode && item ? () => tabAuditoriasHtml : undefined,
  });
}
