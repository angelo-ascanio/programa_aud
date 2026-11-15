import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import {
  createEmptyMetodologiaFormDraft,
  createMetodologiaFormDraftFromEntity,
  type CatalogSimpleDetailMode,
  type MetodologiaAuditoriaCatalogItem,
  type MetodologiaAuditoriaFormDraft,
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

export interface MetodologiaAuditoriaViewState {
  selectedMetodologiaId: string | null;
  query: string;
  viewMode: 'grid' | 'list';
  sortColumn: string | null;
  sortDirection: SortDirection;
  isSidebarOpen?: boolean;
  facetSelections?: MultiViewSelectionMap;
  isCreating?: boolean;
  isEditingAttributes?: boolean;
  formDraft?: MetodologiaAuditoriaFormDraft;
  editErrorMessage?: string | null;
}

export interface MetodologiaAuditoriaViewProps {
  profile: UserProfile;
  state: MetodologiaAuditoriaViewState;
  metodologiasList: MetodologiaAuditoriaCatalogItem[];
  audits?: ProgramacionAuditEntity[];
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
}

export function resolveMetodologiaDetailMode(
  state: MetodologiaAuditoriaViewState,
  isStaff: boolean,
  selectedItem?: MetodologiaAuditoriaCatalogItem
): CatalogSimpleDetailMode {
  if (!isStaff) {
    return 'read';
  }
  if (state.isCreating && !state.selectedMetodologiaId) {
    return 'add';
  }
  if (selectedItem && state.isEditingAttributes) {
    return 'edit';
  }
  return 'read';
}

export function renderMetodologiaAuditoriaView(
  props: MetodologiaAuditoriaViewProps
): string {
  const {
    profile,
    state,
    metodologiasList,
    audits = [],
    archiveConfig,
    tableColumnWidths,
  } = props;
  const isStaff = isApprovedStaffProfile(profile);

  // Add mode
  if (isStaff && state.isCreating && !state.selectedMetodologiaId) {
    return renderMetodologiaDetailPage({
      profile,
      state,
      item: undefined,
      audits: [],
      tableColumnWidths,
    });
  }

  // Detail mode
  if (state.selectedMetodologiaId) {
    const selectedItem =
      metodologiasList.find(
        (m) =>
          m.id === state.selectedMetodologiaId ||
          m.metodologia.toLowerCase() === state.selectedMetodologiaId?.toLowerCase()
      ) || metodologiasList[0];

    if (selectedItem) {
      return renderMetodologiaDetailPage({
        profile,
        state,
        item: selectedItem,
        audits: audits.filter(
          (a) => a.metodologia.toLowerCase() === selectedItem.metodologia.toLowerCase()
        ),
        tableColumnWidths,
      });
    }
  }

  // Otherwise, render the Universal Multi View Directory
  return renderMetodologiaDirectoryView({
    profile,
    state,
    metodologiasList,
    loading: props.loading,
    archiveConfig,
    tableColumnWidths,
  });
}

function renderMetodologiaDirectoryView(params: {
  profile: UserProfile;
  state: MetodologiaAuditoriaViewState;
  metodologiasList: MetodologiaAuditoriaCatalogItem[];
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
}): string {
  const { profile, state, metodologiasList, loading, archiveConfig, tableColumnWidths } = params;
  const isStaff = isApprovedStaffProfile(profile);

  const facetCategories: MultiViewFacetCategory<MetodologiaAuditoriaCatalogItem>[] = [
    {
      id: 'modalidad',
      label: 'Modalidad',
      options: ['Presencial', 'Remota', 'Mixta'],
      extractValues: (item) => item.metodologia,
    },
  ];

  const effectiveSelections: MultiViewSelectionMap = state.facetSelections || {
    modalidad: new Set<string>(),
  };

  const searchOptions = {
    getSearchableText: (item: MetodologiaAuditoriaCatalogItem) =>
      `${item.metodologia} ${item.descripcion} ${item.protocolo_tic} ${item.regla_muestreo}`,
  };

  const filtered = filterRecordsWithFacets(
    metodologiasList,
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
        case 'metodologia':
          return item.metodologia;
        case 'descripcion':
          return item.descripcion;
        case 'protocolo':
          return item.protocolo_tic;
        case 'usage':
          return item.usage_count;
        default:
          return (item as unknown as Record<string, unknown>)[col];
      }
    }
  );

  const facetGroups = computeReactiveFacetCounts(
    metodologiasList,
    state.query,
    facetCategories,
    effectiveSelections,
    searchOptions
  );

  const columns: ColumnDefinition<MetodologiaAuditoriaCatalogItem>[] = [
    {
      id: 'metodologia',
      header: 'Metodología',
      sortable: true,
      defaultWidthPct: 24,
      minWidthPx: 140,
      renderCell: (item) => `
        <span class="inline-flex items-center font-mono bg-teal-50 text-teal-800 border border-teal-200 px-2.5 py-0.5 rounded text-xs font-bold">
          ${escapeHtml(item.metodologia)}
        </span>
      `,
    },
    {
      id: 'descripcion',
      header: 'Descripción Técnica',
      sortable: true,
      defaultWidthPct: 40,
      minWidthPx: 220,
      renderCell: (item) => `
        <span class="block text-slate-700 font-medium truncate" title="${escapeHtml(item.descripcion)}">
          ${escapeHtml(item.descripcion)}
        </span>
      `,
    },
    {
      id: 'protocolo',
      header: 'Protocolo TIC (IAF MD 4)',
      sortable: true,
      defaultWidthPct: 20,
      minWidthPx: 150,
      renderCell: (item) => `
        <span class="block text-slate-600 truncate" title="${escapeHtml(item.protocolo_tic)}">
          ${escapeHtml(item.protocolo_tic)}
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

  const renderCard = (item: MetodologiaAuditoriaCatalogItem): string => {
    return `
      <div
        data-action="select-metodologia"
        data-metodologia-id="${escapeHtml(item.id)}"
        tabindex="0"
        role="button"
        title="Abrir detalle de ${escapeHtml(item.metodologia)}"
        class="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs hover:shadow-xs hover:border-indigo-300 transition-all space-y-3 flex flex-col justify-between cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <div class="space-y-2">
          <div class="flex items-center justify-between gap-2">
            <span class="font-mono bg-teal-50 text-teal-800 border border-teal-200 px-2.5 py-1 rounded text-xs font-bold">
              ${escapeHtml(item.metodologia)}
            </span>
            <span class="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
              IAF MD 4
            </span>
          </div>
          <p class="text-xs text-slate-600 leading-relaxed font-medium">
            ${escapeHtml(item.descripcion)}
          </p>
          <div class="text-[11px] text-slate-500 pt-1 border-t border-slate-100 space-y-1">
            <div><strong class="text-slate-700">Protocolo TIC:</strong> ${escapeHtml(item.protocolo_tic)}</div>
            <div><strong class="text-slate-700">Muestreo:</strong> ${escapeHtml(item.regla_muestreo)}</div>
          </div>
        </div>
        <div class="pt-3 flex items-center justify-between border-t border-slate-100 text-xs">
          <span class="font-mono text-slate-500 font-semibold tabular-nums">${item.usage_count} usos</span>
          <span class="font-semibold text-indigo-600">Detalle & TIC →</span>
        </div>
      </div>
    `;
  };

  return renderUniversalTemplate<MetodologiaAuditoriaCatalogItem>({
    domainKey: 'metodologias',
    tableId: 'extra-metodologias-main',
    title: 'Metodologías de Ejecución de Auditoría',
    subtitle:
      'Metodologías canónicas bajo ISO 19011:2018 y documento obligatorio IAF MD 4 para auditorías presenciales, remotas e híbridas.',
    entityLabel: 'metodologías',
    searchQuery: state.query,
    searchPlaceholder: 'Buscar metodología (Presencial, Remota, Mixta)...',
    searchInputId: 'metodologiaSearchInput',
    clearSearchBtnId: 'clearMetodologiaSearchBtn',
    totalCount: metodologiasList.length,
    filteredCount: sorted.length,
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen ?? true,
    sortState: {
      column: state.sortColumn,
      direction: state.sortDirection,
    },
    columnWidths: tableColumnWidths?.['extra-metodologias-main'],
    getRowAttrs: (item) =>
      `data-action="select-metodologia" data-metodologia-id="${escapeHtml(item.id)}" title="Abrir detalle de ${escapeHtml(item.metodologia)}"`,
    facetGroups,
    items: sorted,
    columns,
    renderCard,
    actionsHtml: isStaff
      ? renderMultiViewAddButton('open-create-metodologia', 'Nueva Metodología')
      : '',
    emptyStateTitle: 'No se encontraron metodologías',
    emptyStateMessage: 'No se encontraron metodologías que coincidan con los filtros aplicados.',
    loading,
    ...extractUniversalArchiveProps(archiveConfig, 'metodologias'),
  });
}

function renderMetodologiaDetailPage(params: {
  profile: UserProfile;
  state: MetodologiaAuditoriaViewState;
  item?: MetodologiaAuditoriaCatalogItem;
  audits: ProgramacionAuditEntity[];
  tableColumnWidths?: Record<string, Record<string, number>>;
}): string {
  const { profile, state, item, audits, tableColumnWidths } = params;
  const isStaff = isApprovedStaffProfile(profile);
  const mode = resolveMetodologiaDetailMode(state, isStaff, item);
  const isCreateMode = mode === 'add';
  const isReadOnly = mode === 'read';

  const draft: MetodologiaAuditoriaFormDraft =
    mode === 'add'
      ? state.formDraft ?? createEmptyMetodologiaFormDraft()
      : mode === 'edit'
      ? state.formDraft ??
        (item
          ? createMetodologiaFormDraftFromEntity(item)
          : createEmptyMetodologiaFormDraft())
      : item
      ? createMetodologiaFormDraftFromEntity(item)
      : createEmptyMetodologiaFormDraft();

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
            Modalidad de Ejecución
          </div>
          <div class="text-xs font-mono font-bold text-slate-900">
            ${escapeHtml(item?.metodologia || draft.metodologia || '—')}
          </div>
        </div>
        <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-1">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Normativa de Referencia
          </div>
          <div class="text-xs font-semibold text-slate-900">
            ISO 19011:2018 / IAF MD 4
          </div>
        </div>
        <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-1">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Auditorías Realizadas
          </div>
          <div class="text-xs font-semibold font-mono text-slate-900 tabular-nums">
            ${item?.usage_count ?? 0} Eventos Ejecutados
          </div>
        </div>
        <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-1">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Protocolo TIC Requerido
          </div>
          <div class="text-xs font-medium text-slate-700">
            ${escapeHtml(item?.protocolo_tic || 'Protocolo TIC estándar')}
          </div>
        </div>
        <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-1">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Reglas de Muestreo de Evidencias
          </div>
          <div class="text-xs font-medium text-slate-700">
            ${escapeHtml(item?.regla_muestreo || 'Según plan de auditoría')}
          </div>
        </div>
        <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-1">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Seguridad & Confidencialidad
          </div>
          <div class="text-xs font-medium text-slate-700">
            ${escapeHtml(item?.seguridad_confidencialidad || 'ISO/IEC 17021-1 cl. 8.4')}
          </div>
        </div>
      </div>
    `
    : `
      <form id="metodologiaDetailForm" novalidate class="space-y-3 bg-slate-50/70 p-3 sm:p-3.5 border border-slate-200/90 rounded-xl">
        <div class="space-y-1.5 max-w-xl">
          <div class="flex items-center justify-between gap-2">
            <label for="metodologiaNombreInput" class="block text-xs font-bold text-slate-700">
              Nombre de la Metodología <span class="text-rose-600" aria-hidden="true">*</span>
            </label>
            <span id="metodologiaCharCount" class="text-[11px] font-mono text-slate-500 tabular-nums">
              ${draft.metodologia.length} / 50
            </span>
          </div>
          <input
            type="text"
            id="metodologiaNombreInput"
            name="metodologia"
            value="${escapeHtml(draft.metodologia)}"
            placeholder="Ej. Híbrida Asistida"
            required
            maxlength="50"
            class="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-slate-900 focus:outline-none"
          />
          <p class="text-[11px] text-slate-500">
            Valor canónico persistido en <code>public.metodologia_auditoria</code> (máximo 50 caracteres, único entre activos).
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
      id: 'modalidad',
      header: 'Modalidad',
      defaultWidthPct: 18,
      minWidthPx: 120,
      renderCell: (a) => `
        <span class="block text-slate-700 truncate">${escapeHtml(a.tipo_auditoria)} · ${escapeHtml(a.norma_codigo)}</span>
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
    tableId: 'extra-metodologia-tab-audits',
    items: audits,
    columns: auditColumns,
    columnWidths: tableColumnWidths?.['extra-metodologia-tab-audits'],
    getRowAttrs: (a) =>
      `data-action="select-prog-audit" data-audit-id="${escapeHtml(a.id)}" title="Abrir auditoría ${escapeHtml(a.codigo_auditoria)}"`,
    emptyStateTitle: 'Sin auditorías vinculadas',
    emptyStateMessage: `No hay auditorías ejecutadas con metodología "${escapeHtml(item?.metodologia || '')}".`,
  });

  const customTopActionsHtml = isStaff
    ? renderDetailFormTopActions({
        mode,
        isStaff: true,
        formId: 'metodologiaDetailForm',
        saveBtnId: 'saveMetodologiaFormBtn',
        cancelBtnId: 'cancelEditMetodologiaBtn',
        editBtnId: 'startEditMetodologiaBtn',
        saveTitle: isCreateMode ? 'Crear metodología' : 'Guardar cambios',
        cancelTitle: isCreateMode ? 'Cancelar creación' : 'Cancelar edición',
        editTitle: 'Editar metodología',
        showHistoryBtn: !isCreateMode,
        showArchiveBtn: !isCreateMode && canArchiveRecord(profile),
        extraAuditAttrs: item
          ? `data-table-name="metodologia_auditoria" data-record-id="${escapeHtml(item.id)}" data-entity-name="${escapeHtml(item.metodologia)}"`
          : '',
        extraArchiveAttrs: item
          ? `data-archive-table="metodologia_auditoria" data-archive-id="${escapeHtml(item.id)}" data-archive-entity-label="Metodología de Auditoría" data-archive-title="${escapeHtml(item.metodologia)}" data-archive-subtitle="ISO 19011 / IAF MD 4"`
          : '',
      })
    : undefined;

  return renderDetailPageTemplate({
    entityType: 'Metodología Canónica (ISO 19011 / IAF MD 4)',
    entitySymbol: '🌐',
    title: isCreateMode ? 'Nueva Metodología' : item?.metodologia || 'Metodología',
    subtitle: isCreateMode
      ? 'Alta de nueva metodología de ejecución de auditoría.'
      : item?.descripcion,
    statusBadge:
      !isCreateMode && item
        ? {
            label: 'NORMALIZADA',
            badgeClass: 'bg-teal-50 text-teal-800 border-teal-200',
            symbol: '✓',
          }
        : undefined,
    backButton: {
      label: 'Volver al Catálogo de Metodologías',
      nav: 'extra',
      subview: 'metodologias',
      action: 'back-to-metodologia-list',
    },
    customTopActionsHtml,
    isCreateMode,
    parents: [],
    tableName: 'metodologia_auditoria',
    recordId: item?.id || '',
    feedbackHtml,
    attributes: [],
    customRecordBodyHtml: recordFormHtml,
    childTabs:
      !isCreateMode && item
        ? [{ id: 'auditorias', label: 'Auditorías Vinculadas', symbol: '🗓️', count: audits.length }]
        : [],
    activeChildTabId: 'auditorias',
    childTabAttrName: 'data-metodologia-tab',
    renderChildTabContent: !isCreateMode && item ? () => tabAuditoriasHtml : undefined,
  });
}
