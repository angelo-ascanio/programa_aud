import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import {
  createEmptyEstatusFormDraft,
  createEstatusFormDraftFromEntity,
  type CatalogSimpleDetailMode,
  type EstatusCatalogItem,
  type EstatusFormDraft,
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
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import type { ProgramacionAuditEntity } from '../lib/auditExecution';
import {
  formatAuditCodename,
  getAuditCodenameTooltip,
  resolveShortOrganizacionName,
} from '../lib/codenameDomain';
import {
  canArchiveRecord,
  extractUniversalArchiveProps,
  type ArchiveMultiViewConfig,
} from '../lib/archiveGovernance';

export interface EstatusViewState {
  selectedEstatusId: string | null;
  activeChildTab?: 'reglas' | 'certificados' | 'auditorias';
  query: string;
  selectedCategory?: string;
  viewMode: 'grid' | 'list';
  sortColumn: string | null;
  sortDirection: SortDirection;
  isSidebarOpen?: boolean;
  facetSelections?: MultiViewSelectionMap;
  isCreating?: boolean;
  isEditingAttributes?: boolean;
  formDraft?: EstatusFormDraft;
  editErrorMessage?: string | null;
}

export interface EstatusViewProps {
  profile: UserProfile;
  state: EstatusViewState;
  estatusList: EstatusCatalogItem[];
  certificados?: CertificadoDetailEntity[];
  audits?: ProgramacionAuditEntity[];
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
}

export function resolveEstatusDetailMode(
  state: EstatusViewState,
  isStaff: boolean,
  selectedItem?: EstatusCatalogItem
): CatalogSimpleDetailMode {
  if (!isStaff) {
    return 'read';
  }
  if (state.isCreating && !state.selectedEstatusId) {
    return 'add';
  }
  if (selectedItem && state.isEditingAttributes) {
    return 'edit';
  }
  return 'read';
}

export function renderEstatusView(props: EstatusViewProps): string {
  const {
    profile,
    state,
    estatusList,
    certificados = [],
    audits = [],
    archiveConfig,
    tableColumnWidths,
  } = props;
  const isStaff = isApprovedStaffProfile(profile);

  // Add mode
  if (isStaff && state.isCreating && !state.selectedEstatusId) {
    return renderEstatusDetailPage({
      profile,
      state,
      item: undefined,
      activeTab: 'certificados',
      certificados: [],
      audits: [],
      tableColumnWidths,
    });
  }

  // Detail mode (read or edit)
  if (state.selectedEstatusId) {
    const selectedItem =
      estatusList.find(
        (e) =>
          e.id === state.selectedEstatusId ||
          e.estatus.toLowerCase() === state.selectedEstatusId?.toLowerCase()
      ) || estatusList[0];

    if (selectedItem) {
      return renderEstatusDetailPage({
        profile,
        state,
        item: selectedItem,
        activeTab: state.activeChildTab || 'certificados',
        certificados: certificados.filter(
          (c) => c.estatus.toLowerCase() === selectedItem.estatus.toLowerCase()
        ),
        audits: audits.filter(
          (a) => a.estatus.toLowerCase() === selectedItem.estatus.toLowerCase()
        ),
        tableColumnWidths,
      });
    }
  }

  // Otherwise, render the Universal Multi View Directory
  return renderEstatusDirectoryView({
    profile,
    state,
    estatusList,
    loading: props.loading,
    archiveConfig,
    tableColumnWidths,
  });
}

function getStatusBadgeClasses(colorToken: string): string {
  switch (colorToken) {
    case 'emerald':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    case 'sky':
      return 'bg-sky-50 text-sky-800 border-sky-200';
    case 'amber':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'rose':
      return 'bg-rose-50 text-rose-800 border-rose-200';
    case 'indigo':
      return 'bg-indigo-50 text-indigo-800 border-indigo-200';
    case 'teal':
      return 'bg-teal-50 text-teal-800 border-teal-200';
    case 'orange':
      return 'bg-orange-50 text-orange-800 border-orange-200';
    case 'slate':
    default:
      return 'bg-slate-100 text-slate-800 border-slate-200';
  }
}

function getEstatusOperationalUsage(item: EstatusCatalogItem): string {
  if (item.usage_count === 0) return 'SIN_USO';
  if (item.categoria_aplicable.toLowerCase().includes('certificado')) {
    return 'EN_CERTIFICADOS';
  }
  return 'EN_AUDITORIAS';
}

function renderEstatusDirectoryView(params: {
  profile: UserProfile;
  state: EstatusViewState;
  estatusList: EstatusCatalogItem[];
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
}): string {
  const { profile, state, estatusList, loading, archiveConfig, tableColumnWidths } = params;
  const isStaff = isApprovedStaffProfile(profile);

  const facetCategories: MultiViewFacetCategory<EstatusCatalogItem>[] = [
    {
      id: 'uso',
      label: 'Uso Operativo',
      options: [
        { value: 'EN_CERTIFICADOS', label: 'En Certificados' },
        { value: 'EN_AUDITORIAS', label: 'En Auditorías / Gestión' },
        { value: 'SIN_USO', label: 'Sin Uso' },
      ],
      extractValues: (item) => getEstatusOperationalUsage(item),
    },
  ];

  const effectiveSelections: MultiViewSelectionMap = state.facetSelections
    ? state.facetSelections
    : {
        uso:
          state.selectedCategory && state.selectedCategory !== 'ALL'
            ? new Set([
                state.selectedCategory.toLowerCase().includes('certificado')
                  ? 'EN_CERTIFICADOS'
                  : 'EN_AUDITORIAS',
              ])
            : new Set<string>(),
      };

  const searchOptions = {
    getSearchableText: (item: EstatusCatalogItem) =>
      `${item.estatus} ${item.descripcion} ${item.categoria_aplicable}`,
  };

  const filtered = filterRecordsWithFacets(
    estatusList,
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
        case 'estatus':
          return item.estatus;
        case 'descripcion':
          return item.descripcion;
        case 'categoria':
          return item.categoria_aplicable;
        case 'usage':
          return item.usage_count;
        default:
          return (item as unknown as Record<string, unknown>)[col];
      }
    }
  );

  const facetGroups = computeReactiveFacetCounts(
    estatusList,
    state.query,
    facetCategories,
    effectiveSelections,
    searchOptions
  );

  const columns: ColumnDefinition<EstatusCatalogItem>[] = [
    {
      id: 'estatus',
      header: 'Estatus Canónico',
      sortable: true,
      defaultWidthPct: 22,
      minWidthPx: 140,
      renderCell: (item) => {
        const badgeClass = getStatusBadgeClasses(item.color_token);
        return `
          <span class="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-bold border ${badgeClass}">
            ${escapeHtml(item.estatus)}
          </span>
        `;
      },
    },
    {
      id: 'descripcion',
      header: 'Significado y Regla Operativa',
      sortable: true,
      defaultWidthPct: 36,
      minWidthPx: 200,
      renderCell: (item) => `
        <span class="block text-slate-700 font-medium truncate" title="${escapeHtml(item.descripcion)}">
          ${escapeHtml(item.descripcion)}
        </span>
      `,
    },
    {
      id: 'categoria',
      header: 'Ámbito de Aplicación',
      sortable: true,
      defaultWidthPct: 24,
      minWidthPx: 150,
      renderCell: (item) => `
        <span class="inline-flex items-center text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium truncate max-w-full" title="${escapeHtml(item.categoria_aplicable)}">
          ${escapeHtml(item.categoria_aplicable)}
        </span>
      `,
    },
    {
      id: 'usage',
      header: 'Métricas de Uso',
      sortable: true,
      align: 'center',
      defaultWidthPct: 18,
      minWidthPx: 120,
      renderCell: (item) => `
        <span class="inline-flex items-center gap-1 font-mono font-bold px-2.5 py-0.5 rounded-full text-xs bg-slate-100 text-slate-800 border border-slate-200 tabular-nums">
          <span aria-hidden="true">📊</span>
          <span>${item.usage_count} registros</span>
        </span>
      `,
    },
  ];

  const renderCard = (item: EstatusCatalogItem): string => {
    const badgeClass = getStatusBadgeClasses(item.color_token);
    return `
      <div
        data-action="select-estatus"
        data-estatus-id="${escapeHtml(item.id)}"
        tabindex="0"
        role="button"
        title="Abrir detalle de ${escapeHtml(item.estatus)}"
        class="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs hover:shadow-xs hover:border-indigo-300 transition-all space-y-3 flex flex-col justify-between cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <div class="space-y-2">
          <div class="flex items-center justify-between gap-2">
            <span class="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold border ${badgeClass}">
              ${escapeHtml(item.estatus)}
            </span>
            <span class="text-[10px] font-mono text-slate-400">Canónico</span>
          </div>
          <p class="text-xs text-slate-600 leading-relaxed font-medium">
            ${escapeHtml(item.descripcion)}
          </p>
          <div class="text-[11px] text-slate-400 pt-1 border-t border-slate-100">
            <strong class="text-slate-600">Ámbito:</strong> ${escapeHtml(item.categoria_aplicable)}
          </div>
        </div>
        <div class="pt-2 flex items-center justify-between border-t border-slate-100 text-xs">
          <span class="font-mono text-slate-500 font-semibold tabular-nums">${item.usage_count} usos</span>
          <span class="font-semibold text-indigo-600">Detalle →</span>
        </div>
      </div>
    `;
  };

  return renderUniversalTemplate<EstatusCatalogItem>({
    domainKey: 'estatus',
    tableId: 'extra-estatus-main',
    title: 'Estatus Canónicos del Sistema',
    subtitle:
      'Padrón estandarizado de los estados del ciclo de vida de auditorías, certificados, no conformidades y organizaciones cliente.',
    entityLabel: 'estatus operativos',
    searchQuery: state.query,
    searchPlaceholder: 'Buscar estatus (Activo, Suspendido, En Ejecución...)...',
    searchInputId: 'estatusSearchInput',
    clearSearchBtnId: 'clearEstatusSearchBtn',
    totalCount: estatusList.length,
    filteredCount: sorted.length,
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen ?? true,
    sortState: {
      column: state.sortColumn,
      direction: state.sortDirection,
    },
    columnWidths: tableColumnWidths?.['extra-estatus-main'],
    getRowAttrs: (item) =>
      `data-action="select-estatus" data-estatus-id="${escapeHtml(item.id)}" title="Abrir detalle de ${escapeHtml(item.estatus)}"`,
    facetGroups,
    items: sorted,
    columns,
    renderCard,
    actionsHtml: isStaff
      ? renderMultiViewAddButton('open-create-estatus', 'Nuevo Estatus')
      : '',
    emptyStateTitle: 'No se encontraron estatus',
    emptyStateMessage: 'No se encontraron estatus que coincidan con los filtros aplicados.',
    loading,
    ...extractUniversalArchiveProps(archiveConfig, 'estatus'),
  });
}

function renderEstatusDetailPage(params: {
  profile: UserProfile;
  state: EstatusViewState;
  item?: EstatusCatalogItem;
  activeTab: 'reglas' | 'certificados' | 'auditorias';
  certificados: CertificadoDetailEntity[];
  audits: ProgramacionAuditEntity[];
  tableColumnWidths?: Record<string, Record<string, number>>;
}): string {
  const {
    profile,
    state,
    item,
    activeTab,
    certificados,
    audits,
    tableColumnWidths,
  } = params;
  const isStaff = isApprovedStaffProfile(profile);
  const mode = resolveEstatusDetailMode(state, isStaff, item);
  const isCreateMode = mode === 'add';
  const isReadOnly = mode === 'read';

  const draft: EstatusFormDraft =
    mode === 'add'
      ? state.formDraft ?? createEmptyEstatusFormDraft()
      : mode === 'edit'
      ? state.formDraft ??
        (item ? createEstatusFormDraftFromEntity(item) : createEmptyEstatusFormDraft())
      : item
      ? createEstatusFormDraftFromEntity(item)
      : createEmptyEstatusFormDraft();

  const badgeClass = getStatusBadgeClasses(item?.color_token || 'slate');

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
            Denominación Canónica
          </div>
          <div>
            <span class="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-bold border ${badgeClass}">
              ${escapeHtml(item?.estatus || draft.estatus || '—')}
            </span>
          </div>
        </div>
        <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-1">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Ámbitos de Aplicación
          </div>
          <div class="text-xs text-slate-900 font-semibold">
            ${escapeHtml(item?.categoria_aplicable || 'Certificados, Auditorías')}
          </div>
        </div>
        <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-1">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Registros en el Sistema
          </div>
          <div class="text-xs text-slate-900 font-semibold font-mono tabular-nums">
            ${item?.usage_count ?? 0} Entidades Asignadas
          </div>
        </div>
        <div class="col-span-full bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-1">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Significado y Regla Operativa
          </div>
          <div class="text-xs text-slate-700 font-medium leading-relaxed">
            ${escapeHtml(item?.descripcion || 'Estado operativo del catálogo del sistema.')}
          </div>
        </div>
      </div>
    `
    : `
      <form id="estatusDetailForm" novalidate class="space-y-3 bg-slate-50/70 p-3 sm:p-3.5 border border-slate-200/90 rounded-xl">
        <div class="space-y-1.5 max-w-xl">
          <div class="flex items-center justify-between gap-2">
            <label for="estatusNombreInput" class="block text-xs font-bold text-slate-700">
              Denominación del Estatus <span class="text-rose-600" aria-hidden="true">*</span>
            </label>
            <span id="estatusCharCount" class="text-[11px] font-mono text-slate-500 tabular-nums">
              ${draft.estatus.length} / 50
            </span>
          </div>
          <input
            type="text"
            id="estatusNombreInput"
            name="estatus"
            value="${escapeHtml(draft.estatus)}"
            placeholder="Ej. En Revisión Técnica"
            required
            maxlength="50"
            class="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-slate-900 focus:outline-none"
          />
          <p class="text-[11px] text-slate-500">
            Valor canónico persistido en <code>public.estatus</code> (máximo 50 caracteres, único entre activos).
          </p>
        </div>
      </form>
    `;

  const certColumns: ColumnDefinition<CertificadoDetailEntity>[] = [
    {
      id: 'numero_certificado',
      header: 'N° Certificado',
      defaultWidthPct: 24,
      minWidthPx: 140,
      renderCell: (c) => `
        <span class="inline-flex items-center gap-1.5 font-mono font-bold text-indigo-700">
          <span aria-hidden="true">📜</span>
          <span class="truncate">${escapeHtml(c.numero_certificado)}</span>
        </span>
      `,
    },
    {
      id: 'organizacion',
      header: 'Organización',
      defaultWidthPct: 36,
      minWidthPx: 180,
      renderCell: (c) => `
        <span class="block font-semibold text-slate-800 truncate" title="${escapeHtml(c.organizacion_nombre)}">
          ${escapeHtml(c.organizacion_nombre)}
        </span>
      `,
    },
    {
      id: 'norma',
      header: 'Norma',
      defaultWidthPct: 18,
      minWidthPx: 110,
      renderCell: (c) => `
        <span class="block text-slate-700 truncate">${escapeHtml(c.norma_codigo)}</span>
      `,
    },
    {
      id: 'vigencia',
      header: 'Vigencia',
      defaultWidthPct: 22,
      minWidthPx: 140,
      renderCell: (c) => `
        <span class="block font-mono text-[11px] text-slate-600 truncate">
          ${escapeHtml(c.fecha_emision)} → ${escapeHtml(c.fecha_vencimiento)}
        </span>
      `,
    },
  ];

  const tabCertificadosHtml = renderListViewTable({
    tableId: 'extra-estatus-tab-certs',
    items: certificados,
    columns: certColumns,
    columnWidths: tableColumnWidths?.['extra-estatus-tab-certs'],
    getRowAttrs: (c) =>
      `data-action="select-cert" data-cert-id="${escapeHtml(c.id)}" title="Abrir certificado ${escapeHtml(c.numero_certificado)}"`,
    emptyStateTitle: 'Sin certificados asociados',
    emptyStateMessage: `No hay certificados con estatus "${escapeHtml(item?.estatus || '')}".`,
  });

  const auditColumns: ColumnDefinition<ProgramacionAuditEntity>[] = [
    {
      id: 'codigo_auditoria',
      header: 'Auditoría',
      defaultWidthPct: 22,
      minWidthPx: 130,
      renderCell: (a) => `
        <span class="inline-flex items-center gap-1.5 font-mono font-bold text-indigo-700" title="${escapeHtml(getAuditCodenameTooltip(a))}">
          <span aria-hidden="true">🗓️</span>
          <span class="truncate">${escapeHtml(formatAuditCodename(a))}</span>
        </span>
      `,
    },
    {
      id: 'organizacion',
      header: 'Organización',
      defaultWidthPct: 34,
      minWidthPx: 180,
      renderCell: (a) => `
        <span class="block font-semibold text-slate-800 truncate" title="${escapeHtml(a.organizacion_nombre)}">
          ${escapeHtml(resolveShortOrganizacionName({ nombre: a.organizacion_nombre, abreviacion: a.organizacion_abreviacion }))}
        </span>
      `,
    },
    {
      id: 'modalidad',
      header: 'Modalidad',
      defaultWidthPct: 24,
      minWidthPx: 140,
      renderCell: (a) => `
        <span class="block text-slate-700 truncate">${escapeHtml(a.tipo_auditoria)} · ${escapeHtml(a.metodologia)}</span>
      `,
    },
    {
      id: 'fechas',
      header: 'Fechas',
      defaultWidthPct: 20,
      minWidthPx: 130,
      renderCell: (a) => `
        <span class="block font-mono text-[11px] text-slate-600 truncate">
          ${escapeHtml(a.fecha_inicio)} → ${escapeHtml(a.fecha_fin)}
        </span>
      `,
    },
  ];

  const tabAuditoriasHtml = renderListViewTable({
    tableId: 'extra-estatus-tab-audits',
    items: audits,
    columns: auditColumns,
    columnWidths: tableColumnWidths?.['extra-estatus-tab-audits'],
    getRowAttrs: (a) =>
      `data-action="select-prog-audit" data-audit-id="${escapeHtml(a.id)}" title="Abrir auditoría ${escapeHtml(a.codigo_auditoria)}"`,
    emptyStateTitle: 'Sin auditorías asociadas',
    emptyStateMessage: `No hay auditorías con estatus "${escapeHtml(item?.estatus || '')}".`,
  });

  const tabReglasHtml = `
    <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
      <h3 class="text-xs font-bold uppercase tracking-wider text-slate-700">Reglas Normativas del Ciclo de Vida</h3>
      <p class="text-xs text-slate-600 leading-relaxed">
        En conformidad con <strong>ISO/IEC 17021-1:2015 cláusulas 9.6 y 9.7</strong>, este estatus forma parte del ciclo de vida controlado de la certificación. Los cambios a este estatus requieren registro auditable en <code>public.audit_log</code> con trazabilidad forense del actor responsable y justificación técnica correspondiente.
      </p>
    </div>
  `;

  const customTopActionsHtml = isStaff
    ? renderDetailFormTopActions({
        mode,
        isStaff: true,
        formId: 'estatusDetailForm',
        saveBtnId: 'saveEstatusFormBtn',
        cancelBtnId: 'cancelEditEstatusBtn',
        editBtnId: 'startEditEstatusBtn',
        saveTitle: isCreateMode ? 'Crear estatus' : 'Guardar cambios',
        cancelTitle: isCreateMode ? 'Cancelar creación' : 'Cancelar edición',
        editTitle: 'Editar estatus',
        showHistoryBtn: !isCreateMode,
        showArchiveBtn: !isCreateMode && canArchiveRecord(profile),
        extraAuditAttrs: item
          ? `data-table-name="estatus" data-record-id="${escapeHtml(item.id)}" data-entity-name="${escapeHtml(item.estatus)}"`
          : '',
        extraArchiveAttrs: item
          ? `data-archive-table="estatus" data-archive-id="${escapeHtml(item.id)}" data-archive-entity-label="Estatus Canónico" data-archive-title="${escapeHtml(item.estatus)}" data-archive-subtitle="${escapeHtml(item.categoria_aplicable)}"`
          : '',
      })
    : undefined;

  return renderDetailPageTemplate({
    entityType: 'Estatus Canónico',
    entitySymbol: '🏷️',
    title: isCreateMode ? 'Nuevo Estatus' : item?.estatus || 'Estatus',
    subtitle: isCreateMode
      ? 'Alta de nuevo estado operativo en el catálogo maestro.'
      : item?.descripcion,
    statusBadge:
      !isCreateMode && item
        ? {
            label: item.estatus,
            badgeClass,
          }
        : undefined,
    backButton: {
      label: 'Volver al Catálogo de Estatus',
      nav: 'extra',
      subview: 'estatus',
      action: 'back-to-estatus-list',
    },
    customTopActionsHtml,
    isCreateMode,
    parents: [],
    tableName: 'estatus',
    recordId: item?.id || '',
    feedbackHtml,
    attributes: [],
    customRecordBodyHtml: recordFormHtml,
    childTabs:
      !isCreateMode && item
        ? [
            { id: 'certificados', label: 'Certificados', symbol: '📜', count: certificados.length },
            { id: 'auditorias', label: 'Auditorías', symbol: '🗓️', count: audits.length },
            { id: 'reglas', label: 'Reglas del Ciclo', symbol: '⚖️', count: 1 },
          ]
        : [],
    activeChildTabId: activeTab,
    childTabAttrName: 'data-estatus-tab',
    renderChildTabContent:
      !isCreateMode && item
        ? (tabId) => {
            if (tabId === 'auditorias') return tabAuditoriasHtml;
            if (tabId === 'reglas') return tabReglasHtml;
            return tabCertificadosHtml;
          }
        : undefined,
  });
}
