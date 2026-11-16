import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import {
  NORMA_CODIGO_MAX_LENGTH,
  NORMA_ESQUEMA_MAX_LENGTH,
  NORMA_NOMBRE_MAX_LENGTH,
  NORMA_TITULO_MAX_LENGTH,
  VALID_NORMA_STATUSES,
  calculateLtreeIndentation,
  createEmptyNormaFormDraft,
  createNormaDraftFromEntity,
  formatAcreditacionStatusBadge,
  formatNormaStatusBadge,
  type AcreditacionNormaIaf,
  type NormaDetailMode,
  type NormaEntity,
  type NormaFormDraft,
  type OrganismoAcreditacion,
  type RequisitoLtree,
  type SectorIafEntity,
} from '../lib/extraDomain';
import { formatAcreditacionSectorsSummary } from '../lib/acreditacionDomain';
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
import {
  canArchiveRecord,
  extractUniversalArchiveProps,
  type ArchiveMultiViewConfig,
} from '../lib/archiveGovernance';

export interface NormaViewState {
  selectedNormaId: string | null;
  activeChildTab: 'acreditacion' | 'requisitos' | 'certificados';
  query: string;
  selectedStatus: string;
  selectedScheme: string;
  viewMode: 'grid' | 'list';
  sortColumn: string | null;
  sortDirection: SortDirection;
  isSidebarOpen?: boolean;
  facetSelections?: MultiViewSelectionMap;
  isCreating?: boolean;
  isEditingAttributes?: boolean;
  formDraft?: NormaFormDraft;
  editErrorMessage?: string | null;
}

export interface NormaViewProps {
  profile: UserProfile;
  state: NormaViewState;
  normas: NormaEntity[];
  acreditaciones: AcreditacionNormaIaf[];
  organismos: OrganismoAcreditacion[];
  requisitos: RequisitoLtree[];
  sectores?: SectorIafEntity[];
  certificados?: CertificadoDetailEntity[];
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
}

export function resolveNormaDetailMode(
  state: NormaViewState,
  isStaff: boolean,
  selectedNorma?: NormaEntity
): NormaDetailMode {
  if (!isStaff) {
    return 'read';
  }
  if (state.isCreating && !state.selectedNormaId) {
    return 'add';
  }
  if (selectedNorma && state.isEditingAttributes) {
    return 'edit';
  }
  return 'read';
}

export function renderNormaView(props: NormaViewProps): string {
  const {
    profile,
    state,
    normas,
    acreditaciones,
    organismos,
    requisitos,
    certificados = [],
    loading,
    archiveConfig,
    tableColumnWidths,
  } = props;

  const isStaff = isApprovedStaffProfile(profile);
  const activeNormas = normas.filter((n) => !n.deleted_at);

  // Add mode (`isCreating` without `selectedNormaId`)
  if (isStaff && state.isCreating && !state.selectedNormaId) {
    return renderNormaDetailPage({
      profile,
      state,
      mode: 'add',
      norma: undefined,
      activeTab: state.activeChildTab || 'acreditacion',
      acreditaciones: [],
      organismos,
      requisitos: [],
      certificados: [],
      isStaff,
      tableColumnWidths,
    });
  }

  // Read / Edit mode for selected Norma
  if (state.selectedNormaId) {
    const selectedNorma = activeNormas.find((n) => n.id === state.selectedNormaId) || activeNormas[0];
    if (selectedNorma) {
      const mode = resolveNormaDetailMode(state, isStaff, selectedNorma);
      const normaReqs = requisitos.filter(
        (r) =>
          !r.deleted_at &&
          (r.id_norma === selectedNorma.id ||
            r.norma_codigo.toLowerCase() === selectedNorma.codigo.toLowerCase())
      );
      return renderNormaDetailPage({
        profile,
        state,
        mode,
        norma: selectedNorma,
        activeTab: state.activeChildTab,
        acreditaciones: acreditaciones.filter(
          (a) => a.id_norma === selectedNorma.id || a.norma_codigo === selectedNorma.codigo
        ),
        organismos,
        requisitos: normaReqs,
        certificados: certificados.filter(
          (c) =>
            c.id_norma === selectedNorma.id ||
            c.norma_codigo.toLowerCase() === selectedNorma.codigo.toLowerCase()
        ),
        isStaff,
        tableColumnWidths,
      });
    }
  }

  // Otherwise, render the Universal Multi View Clean List Directory
  return renderNormaDirectoryView({
    profile,
    state,
    normas: activeNormas,
    acreditaciones,
    requisitos,
    loading,
    archiveConfig,
    isStaff,
    tableColumnWidths,
  });
}

/**
 * Universal Multi View Directory for Normas (Clean List: zero <button> in <td>, 100% colgroup sum)
 */
function renderNormaDirectoryView(params: {
  profile: UserProfile;
  state: NormaViewState;
  normas: NormaEntity[];
  acreditaciones: AcreditacionNormaIaf[];
  requisitos: RequisitoLtree[];
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  isStaff: boolean;
  tableColumnWidths?: Record<string, Record<string, number>>;
}): string {
  const {
    state,
    normas,
    acreditaciones,
    requisitos,
    loading,
    archiveConfig,
    isStaff,
    tableColumnWidths,
  } = params;

  const uniqueSchemes = Array.from(new Set(normas.map((n) => n.esquema))).sort();
  const uniqueStatuses = [...VALID_NORMA_STATUSES];

  const getClausulasCount = (norma: NormaEntity): number => {
    const liveCount = requisitos.filter(
      (r) =>
        !r.deleted_at &&
        (r.id_norma === norma.id ||
          r.norma_codigo.toLowerCase() === norma.codigo.toLowerCase())
    ).length;
    return liveCount > 0 ? liveCount : norma.clausulas_count;
  };

  const facetCategories: MultiViewFacetCategory<NormaEntity>[] = [
    {
      id: 'esquema',
      label: 'Esquema',
      options: uniqueSchemes.map((sc) => ({ value: sc, label: sc })),
      extractValues: (norma) => norma.esquema,
    },
    {
      id: 'estatus',
      label: 'Estatus',
      options: uniqueStatuses.map((st) => ({ value: st, label: st })),
      extractValues: (norma) => norma.estatus,
    },
  ];

  const effectiveSelections: MultiViewSelectionMap = state.facetSelections
    ? state.facetSelections
    : {
        esquema:
          state.selectedScheme && state.selectedScheme !== 'ALL'
            ? new Set([state.selectedScheme])
            : new Set<string>(),
        estatus:
          state.selectedStatus && state.selectedStatus !== 'ALL'
            ? new Set([state.selectedStatus])
            : new Set<string>(),
      };

  const searchOptions = {
    getSearchableText: (norma: NormaEntity) =>
      `${norma.codigo} ${norma.titulo} ${norma.esquema} ${norma.estatus}`,
  };

  const filtered = filterRecordsWithFacets(
    normas,
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
        case 'titulo':
          return item.titulo;
        case 'esquema':
          return item.esquema;
        case 'estatus':
          return item.estatus;
        case 'clausulas':
          return getClausulasCount(item);
        case 'acreditaciones':
          return acreditaciones.filter(
            (a) => a.id_norma === item.id || a.norma_codigo === item.codigo
          ).length || item.acreditaciones_count;
        default:
          return (item as unknown as Record<string, unknown>)[col];
      }
    }
  );

  const facetGroups = computeReactiveFacetCounts(
    normas,
    state.query,
    facetCategories,
    effectiveSelections,
    searchOptions
  );

  // Strict 6 Clean List columns summing to 100%, zero <button> inside <td>, zero acciones column
  const columns: ColumnDefinition<NormaEntity>[] = [
    {
      id: 'codigo',
      header: 'Código',
      sortable: true,
      defaultWidthPct: 18,
      minWidthPx: 140,
      renderCell: (norma) => `
        <span class="inline-flex items-center gap-1.5 font-mono font-bold text-indigo-700 whitespace-nowrap truncate">
          <span aria-hidden="true">📘</span>
          <span class="truncate">${escapeHtml(norma.codigo)}</span>
        </span>
      `,
    },
    {
      id: 'titulo',
      header: 'Título Oficial',
      sortable: true,
      defaultWidthPct: 34,
      minWidthPx: 220,
      renderCell: (norma) => `
        <span class="text-slate-700 font-medium block truncate" title="${escapeHtml(norma.titulo)}">
          ${escapeHtml(norma.titulo)}
        </span>
      `,
    },
    {
      id: 'esquema',
      header: 'Esquema',
      sortable: true,
      defaultWidthPct: 16,
      minWidthPx: 140,
      renderCell: (norma) => `
        <span class="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 truncate max-w-full" title="${escapeHtml(norma.esquema)}">
          ${escapeHtml(norma.esquema)}
        </span>
      `,
    },
    {
      id: 'estatus',
      header: 'Estatus',
      sortable: true,
      align: 'center',
      defaultWidthPct: 12,
      minWidthPx: 110,
      renderCell: (norma) => {
        const statusMeta = formatNormaStatusBadge(norma.estatus);
        return `
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${statusMeta.badgeClass} whitespace-nowrap">
            <span>${statusMeta.symbol}</span>
            <span>${escapeHtml(statusMeta.label)}</span>
          </span>
        `;
      },
    },
    {
      id: 'clausulas',
      header: 'Cláusulas',
      sortable: true,
      align: 'center',
      defaultWidthPct: 10,
      minWidthPx: 90,
      renderCell: (norma) => `
        <span class="font-mono font-semibold text-slate-700 tabular-nums">${getClausulasCount(norma)}</span>
      `,
    },
    {
      id: 'acreditaciones',
      header: 'Acreditaciones',
      sortable: true,
      align: 'center',
      defaultWidthPct: 10,
      minWidthPx: 110,
      renderCell: (norma) => {
        const normaAccreds = acreditaciones.filter(
          (a) => a.id_norma === norma.id || a.norma_codigo === norma.codigo
        );
        const orgBadges = normaAccreds
          .map(
            (a) => `
            <span class="inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
              ${escapeHtml(a.organismo_codigo)}
            </span>
          `
          )
          .join('');
        return `
          <div class="flex items-center justify-center gap-1 flex-wrap">
            ${orgBadges || '<span class="text-slate-400 text-[10px]">Sin acreditar</span>'}
          </div>
        `;
      },
    },
  ];

  const renderCard = (norma: NormaEntity): string => {
    const statusMeta = formatNormaStatusBadge(norma.estatus);
    const normaAccreds = acreditaciones.filter(
      (a) => a.id_norma === norma.id || a.norma_codigo === norma.codigo
    );
    const clausulasCount = getClausulasCount(norma);

    return `
      <div
        data-action="select-norma"
        data-norma-id="${escapeHtml(norma.id)}"
        tabindex="0"
        role="button"
        title="Abrir detalle de ${escapeHtml(norma.codigo)}"
        class="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs hover:shadow-xs hover:border-indigo-300 transition-all cursor-pointer space-y-3 flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <div class="space-y-2">
          <div class="flex items-start justify-between gap-2">
            <div class="space-y-1 min-w-0">
              <span class="inline-flex px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 text-xs font-bold border border-indigo-200 font-mono">
                ${escapeHtml(norma.codigo)}
              </span>
              <h3 class="text-sm font-bold text-slate-900 leading-snug">
                ${escapeHtml(norma.titulo)}
              </h3>
            </div>
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${statusMeta.badgeClass} shrink-0">
              <span>${statusMeta.symbol}</span>
              <span>${escapeHtml(statusMeta.label)}</span>
            </span>
          </div>

          <div class="text-xs text-slate-500 font-medium">
            <span class="text-slate-400">Esquema:</span> ${escapeHtml(norma.esquema)}
          </div>

          <div class="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-slate-600">
            <span class="inline-flex items-center gap-1 bg-slate-50 px-2 py-1 rounded border border-slate-200">
              <span aria-hidden="true">🌳</span>
              <span><strong>${clausulasCount}</strong> Cláusulas ltree</span>
            </span>
            <span class="inline-flex items-center gap-1 bg-slate-50 px-2 py-1 rounded border border-slate-200">
              <span aria-hidden="true">🏛️</span>
              <span><strong>${normaAccreds.length}</strong> Acreditación(es)</span>
            </span>
            <span class="inline-flex items-center gap-1 bg-slate-50 px-2 py-1 rounded border border-slate-200">
              <span aria-hidden="true">📅</span>
              <span>Publicada: ${escapeHtml(norma.fecha_publicacion || 'Sin fecha')}</span>
            </span>
          </div>
        </div>

        <div class="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
          <div class="flex items-center gap-1 flex-wrap">
            ${normaAccreds
              .map(
                (a) => `
                <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200" title="Acreditado por ${escapeHtml(a.organismo_nombre)}">
                  ${escapeHtml(a.organismo_codigo)}
                </span>
              `
              )
              .join('') || '<span class="text-[10px] text-slate-400">Sin acreditaciones</span>'}
          </div>
          <span class="font-semibold text-indigo-600 shrink-0">Detalle →</span>
        </div>
      </div>
    `;
  };

  return renderUniversalTemplate({
    domainKey: 'normas',
    tableId: 'extra-normas-main',
    title: 'Normas de Sistemas de Gestión',
    subtitle:
      'Estándares internacionales certificables, acreditaciones vigentes ante organismos oficiales (ENAC, UKAS, ANAB) y árbol jerárquico de cláusulas normativas ltree.',
    entityLabel: 'normas certificables',
    searchQuery: state.query,
    searchPlaceholder: 'Buscar por código (ISO 9001, 14001...), título o esquema...',
    searchInputId: 'normaSearchInput',
    clearSearchBtnId: 'clearNormaSearchBtn',
    totalCount: normas.length,
    filteredCount: sorted.length,
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen ?? true,
    sortState: {
      column: state.sortColumn,
      direction: state.sortDirection,
    },
    columnWidths: tableColumnWidths?.['extra-normas-main'],
    getRowAttrs: (norma) =>
      `data-action="select-norma" data-norma-id="${escapeHtml(norma.id)}" title="Abrir detalle de ${escapeHtml(norma.codigo)}"`,
    facetGroups,
    items: sorted,
    columns,
    renderCard,
    emptyStateTitle: 'No se encontraron normas',
    emptyStateMessage: 'No se encontraron normas que coincidan con los filtros aplicados.',
    actionsHtml: isStaff
      ? renderMultiViewAddButton('open-create-norma', 'Nueva Norma')
      : undefined,
    loading,
    ...extractUniversalArchiveProps(archiveConfig, 'normas'),
  });
}

/**
 * Standardized 3-Zone Detail Page for Norma ('read' | 'add' | 'edit')
 */
function renderNormaDetailPage(params: {
  profile: UserProfile;
  state: NormaViewState;
  mode: NormaDetailMode;
  norma?: NormaEntity;
  activeTab: 'acreditacion' | 'requisitos' | 'certificados';
  acreditaciones: AcreditacionNormaIaf[];
  organismos: OrganismoAcreditacion[];
  requisitos: RequisitoLtree[];
  certificados: CertificadoDetailEntity[];
  isStaff: boolean;
  tableColumnWidths?: Record<string, Record<string, number>>;
}): string {
  const {
    profile,
    state,
    mode,
    norma,
    activeTab,
    acreditaciones,
    requisitos,
    certificados,
    isStaff,
    tableColumnWidths,
  } = params;

  const isCreateMode = mode === 'add';
  const isReadOnly = mode === 'read';

  const draft: NormaFormDraft =
    mode === 'add'
      ? state.formDraft ?? createEmptyNormaFormDraft()
      : mode === 'edit'
      ? state.formDraft ??
        (norma ? createNormaDraftFromEntity(norma) : createEmptyNormaFormDraft())
      : norma
      ? createNormaDraftFromEntity(norma)
      : createEmptyNormaFormDraft();

  const statusMeta = !isCreateMode && norma ? formatNormaStatusBadge(norma.estatus) : undefined;

  const customTopActionsHtml = isStaff
    ? renderDetailFormTopActions({
        mode,
        isStaff: true,
        formId: 'normaDetailForm',
        saveBtnId: 'saveNormaFormBtn',
        cancelBtnId: 'cancelEditNormaBtn',
        editBtnId: 'startEditNormaBtn',
        saveTitle: isCreateMode ? 'Crear norma' : 'Guardar cambios',
        cancelTitle: isCreateMode ? 'Cancelar creación' : 'Cancelar edición',
        editTitle: 'Editar norma',
        showHistoryBtn: !isCreateMode,
        showArchiveBtn: !isCreateMode && canArchiveRecord(profile),
        extraAuditAttrs: norma
          ? `data-table-name="norma" data-record-id="${escapeHtml(norma.id)}" data-entity-name="${escapeHtml(norma.codigo)}"`
          : '',
        extraArchiveAttrs: norma
          ? `data-archive-table="norma" data-archive-id="${escapeHtml(norma.id)}" data-archive-entity-label="Norma de Sistema de Gestión" data-archive-title="${escapeHtml(norma.codigo)}" data-archive-subtitle="${escapeHtml(norma.titulo)}"`
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

  const customRecordBodyHtml =
    isReadOnly && norma
      ? renderNormaReadOnlyBody(norma, requisitos.length, acreditaciones.length)
      : renderNormaFormBody(draft);

  // Tab 1: Acreditaciones (Clean List via renderListViewTable, clickable row → acreditacionView, CTA '+' navigates to acreditacionView 'add')
  const acreditacionColumns: ColumnDefinition<AcreditacionNormaIaf>[] = [
    {
      id: 'organismo',
      header: 'Organismo',
      defaultWidthPct: 28,
      minWidthPx: 180,
      renderCell: (acc) => `
        <div class="min-w-0">
          <div class="font-bold text-slate-900 flex items-center gap-1.5 truncate">
            <span aria-hidden="true">🏛️</span>
            <span class="truncate">${escapeHtml(acc.organismo_nombre)}</span>
            <span class="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200 font-bold shrink-0">
              ${escapeHtml(acc.organismo_codigo)}
            </span>
          </div>
          <div class="text-[11px] text-slate-400 truncate">País: ${escapeHtml(acc.organismo_pais)}</div>
        </div>
      `,
    },
    {
      id: 'numero_acreditacion',
      header: 'N° Acreditación',
      defaultWidthPct: 20,
      minWidthPx: 140,
      renderCell: (acc) => `
        <span class="font-mono font-bold text-indigo-700 whitespace-nowrap">
          🏅 ${escapeHtml(acc.numero_acreditacion)}
        </span>
      `,
    },
    {
      id: 'sector_iaf',
      header: 'Sectores IAF Amparados',
      defaultWidthPct: 22,
      minWidthPx: 160,
      renderCell: (acc) => {
        const meta = formatAcreditacionSectorsSummary(acc.sectores || []);
        return meta.count > 0
          ? `
            <div class="min-w-0">
              <div class="font-semibold text-slate-800 truncate">${escapeHtml(meta.shortLabel)}</div>
              <div class="text-[11px] text-slate-500 truncate" title="${escapeHtml(meta.detailLabel)}">
                ${escapeHtml(meta.detailLabel)}
              </div>
            </div>
          `
          : `<span class="text-slate-400 italic">${escapeHtml(meta.shortLabel)}</span>`;
      },
    },
    {
      id: 'vigencia',
      header: 'Período de Validez',
      defaultWidthPct: 18,
      minWidthPx: 140,
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
      defaultWidthPct: 12,
      minWidthPx: 110,
      renderCell: (acc) => {
        const accStatus = formatAcreditacionStatusBadge(acc.estatus);
        return `
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${accStatus.badgeClass} whitespace-nowrap">
            <span>${accStatus.symbol}</span>
            <span>${escapeHtml(accStatus.label)}</span>
          </span>
        `;
      },
    },
  ];

  const tabAcreditacionHtml = !isCreateMode && norma
    ? `
      <div class="space-y-3">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 class="text-sm font-bold text-slate-900">Alcances de Acreditación Oficial</h3>
            <p class="text-xs text-slate-500">
              Acreditaciones concedidas por organismos reconocidos internacionalmente bajo ISO/IEC 17021-1
            </p>
          </div>
          ${
            isStaff
              ? `
                <button
                  type="button"
                  data-action="open-create-acreditacion"
                  data-norma-id="${escapeHtml(norma.id)}"
                  class="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 transition-colors cursor-pointer inline-flex items-center gap-1.5 self-start sm:self-auto shrink-0"
                >
                  <span aria-hidden="true">+</span>
                  <span>Nueva Acreditación</span>
                </button>
              `
              : ''
          }
        </div>

        ${renderListViewTable({
          tableId: 'norma-tab-acreditaciones',
          items: acreditaciones,
          columns: acreditacionColumns,
          columnWidths: tableColumnWidths?.['norma-tab-acreditaciones'],
          getRowAttrs: (acc) =>
            `data-action="select-accreditation" data-accreditation-id="${escapeHtml(acc.id)}" title="Abrir acreditación ${escapeHtml(acc.numero_acreditacion)}"`,
          emptyStateTitle: 'Sin acreditaciones registradas',
          emptyStateMessage: 'No hay acreditaciones registradas para esta norma.',
        })}
      </div>
    `
    : '';

  // Tab 2: Requisitos LTREE (Clean List ordered hierarchically via ruta_materializada, clickable row → requisitoView)
  const sortedRequisitos = requisitos
    .slice()
    .sort((a, b) =>
      a.ruta_materializada.localeCompare(b.ruta_materializada, 'es', { numeric: true })
    );

  const requisitoColumns: ColumnDefinition<RequisitoLtree>[] = [
    {
      id: 'codigo',
      header: 'Cláusula',
      defaultWidthPct: 18,
      minWidthPx: 140,
      renderCell: (req) => {
        const indent = calculateLtreeIndentation(req.ruta_materializada, req.codigo);
        const padLeft = Math.min(48, Math.max(0, indent.indentPx));
        return `
          <div class="flex items-center gap-2 min-w-0" style="padding-left: ${padLeft}px;">
            <span class="font-mono text-xs font-bold px-2 py-0.5 rounded shrink-0 ${
              indent.isParent
                ? 'bg-slate-900 text-white'
                : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
            }">
              ${escapeHtml(req.codigo)}
            </span>
          </div>
        `;
      },
    },
    {
      id: 'titulo',
      header: 'Título y Alcance Normativo',
      defaultWidthPct: 44,
      minWidthPx: 220,
      renderCell: (req) => `
        <div class="min-w-0">
          <div class="text-xs font-bold text-slate-900 truncate" title="${escapeHtml(req.titulo || `Cláusula ${req.codigo}`)}">
            ${escapeHtml(req.titulo || `Cláusula ${req.codigo}`)}
          </div>
          ${
            req.descripcion
              ? `<div class="text-[11px] text-slate-500 truncate" title="${escapeHtml(req.descripcion)}">${escapeHtml(req.descripcion)}</div>`
              : ''
          }
        </div>
      `,
    },
    {
      id: 'ruta_materializada',
      header: 'Ruta LTREE',
      defaultWidthPct: 22,
      minWidthPx: 140,
      renderCell: (req) => `
        <span class="font-mono text-[11px] text-indigo-700 bg-indigo-50/70 px-2 py-0.5 rounded border border-indigo-200/80 whitespace-nowrap">
          ${escapeHtml(req.ruta_materializada)}
        </span>
      `,
    },
    {
      id: 'nivel',
      header: 'Nivel',
      align: 'center',
      defaultWidthPct: 16,
      minWidthPx: 110,
      renderCell: (req) => {
        const indent = calculateLtreeIndentation(req.ruta_materializada, req.codigo);
        return `
          <span class="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${
            indent.isParent
              ? 'bg-slate-100 text-slate-800 border-slate-200'
              : 'bg-sky-50 text-sky-800 border-sky-200'
          }">
            Nivel ${indent.level} · ${indent.isParent ? 'Raíz' : 'Sub-cláusula'}
          </span>
        `;
      },
    },
  ];

  const tabRequisitosHtml = !isCreateMode && norma
    ? `
      <div class="space-y-3">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 class="text-sm font-bold text-slate-900">Árbol Jerárquico de Cláusulas (ltree)</h3>
            <p class="text-xs text-slate-500">
              Estructura normativa jerárquica con cálculo automático de ruta materializada LTREE.
            </p>
          </div>
          <div class="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <span class="text-xs font-semibold px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-200">
              PostgreSQL ltree · ${sortedRequisitos.length} Cláusulas
            </span>
            ${
              isStaff
                ? `
                  <button
                    type="button"
                    data-action="open-create-requisito"
                    data-norma-id="${escapeHtml(norma.id)}"
                    class="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 transition-colors cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <span aria-hidden="true">+</span>
                    <span>Nuevo Requisito</span>
                  </button>
                `
                : ''
            }
          </div>
        </div>

        ${renderListViewTable({
          tableId: 'norma-tab-requisitos',
          items: sortedRequisitos,
          columns: requisitoColumns,
          columnWidths: tableColumnWidths?.['norma-tab-requisitos'],
          getRowAttrs: (req) =>
            `data-action="select-requisito" data-requisito-id="${escapeHtml(req.id)}" title="Abrir cláusula ${escapeHtml(req.codigo)}"`,
          emptyStateTitle: 'Sin cláusulas registradas',
          emptyStateMessage: 'No hay requisitos normativos registrados para esta norma.',
        })}
      </div>
    `
    : '';

  // Tab 3: Certificados emitidos bajo esta Norma (Clean List via renderListViewTable)
  const certificadoColumns: ColumnDefinition<CertificadoDetailEntity>[] = [
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
      header: 'Organización Cliente',
      defaultWidthPct: 34,
      minWidthPx: 180,
      renderCell: (c) => `
        <span class="block font-semibold text-slate-800 truncate" title="${escapeHtml(c.organizacion_nombre)}">
          🏢 ${escapeHtml(c.organizacion_nombre)}
        </span>
      `,
    },
    {
      id: 'sector_iaf',
      header: 'Sector IAF',
      defaultWidthPct: 16,
      minWidthPx: 120,
      renderCell: (c) => `
        <span class="text-slate-700 whitespace-nowrap">Sector IAF ${c.sector_iaf}</span>
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
      defaultWidthPct: 12,
      minWidthPx: 100,
      renderCell: (c) => `
        <span class="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-800 border border-slate-200 whitespace-nowrap">
          ${escapeHtml(c.estatus)}
        </span>
      `,
    },
  ];

  const tabCertificadosHtml = !isCreateMode && norma
    ? `
      <div class="space-y-3">
        <div>
          <h3 class="text-sm font-bold text-slate-900">Certificados Emitidos bajo ${escapeHtml(norma.codigo)}</h3>
          <p class="text-xs text-slate-500">
            Organizaciones certificadas y estado vigente bajo este estándar internacional.
          </p>
        </div>

        ${renderListViewTable({
          tableId: 'norma-tab-certificados',
          items: certificados,
          columns: certificadoColumns,
          columnWidths: tableColumnWidths?.['norma-tab-certificados'],
          getRowAttrs: (c) =>
            `data-action="select-cert" data-cert-id="${escapeHtml(c.id)}" title="Abrir certificado ${escapeHtml(c.numero_certificado)}"`,
          emptyStateTitle: 'Sin certificados emitidos',
          emptyStateMessage: 'No hay certificados registrados para esta norma.',
        })}
      </div>
    `
    : '';

  return renderDetailPageTemplate({
    entityType: 'Norma de Sistema de Gestión',
    entitySymbol: '📘',
    title: isCreateMode
      ? 'Nueva Norma ISO'
      : norma?.titulo || 'Norma de Sistema de Gestión',
    eyebrowCode: !isCreateMode && norma ? norma.codigo : undefined,
    subtitle: isCreateMode
      ? 'Registro de estándar certificable, esquema técnico y publicación oficial.'
      : norma
      ? `Esquema: ${norma.esquema}`
      : undefined,
    statusBadge:
      !isCreateMode && statusMeta
        ? {
            label: statusMeta.label,
            badgeClass: statusMeta.badgeClass,
            symbol: statusMeta.symbol,
          }
        : undefined,
    backButton: {
      label: 'Volver al Catálogo de Normas',
      nav: 'extra',
      subview: 'standards',
      action: 'back-to-normas-list',
    },
    customTopActionsHtml,
    isCreateMode,
    parents: [],
    tableName: 'norma',
    recordId: norma?.id || '',
    feedbackHtml,
    attributes: [],
    customRecordBodyHtml,
    childTabs:
      !isCreateMode && norma
        ? [
            { id: 'acreditacion', label: 'Acreditaciones', symbol: '🏛️', count: acreditaciones.length },
            { id: 'requisitos', label: 'Requisitos (ltree)', symbol: '🌳', count: sortedRequisitos.length },
            { id: 'certificados', label: 'Certificados', symbol: '📜', count: certificados.length },
          ]
        : [],
    activeChildTabId: activeTab,
    childTabAttrName: 'data-norma-tab',
    renderChildTabContent:
      !isCreateMode && norma
        ? (tabId) => {
            if (tabId === 'requisitos') return tabRequisitosHtml;
            if (tabId === 'certificados') return tabCertificadosHtml;
            return tabAcreditacionHtml;
          }
        : undefined,
  });
}

function renderNormaReadOnlyBody(
  norma: NormaEntity,
  clausulasCount: number,
  acreditacionesCount: number
): string {
  const statusMeta = formatNormaStatusBadge(norma.estatus);
  return `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Código Canónico
        </div>
        <div class="text-xs font-mono font-bold text-indigo-700">
          ${escapeHtml(norma.codigo)}
        </div>
      </div>

      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Esquema de Certificación
        </div>
        <div class="text-xs font-semibold text-slate-900">
          ${escapeHtml(norma.esquema)}
        </div>
      </div>

      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Norma Corta / Etiqueta
        </div>
        <div class="text-xs font-semibold text-slate-900">
          ${escapeHtml(norma.norma || norma.codigo)}
        </div>
      </div>

      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Estatus y Publicación
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${statusMeta.badgeClass}">
            <span>${statusMeta.symbol}</span>
            <span>${escapeHtml(statusMeta.label)}</span>
          </span>
          <span class="text-[11px] font-mono text-slate-600 tabular-nums">
            ${escapeHtml(norma.fecha_publicacion || 'Sin fecha')}
          </span>
        </div>
      </div>

      <div class="sm:col-span-2 lg:col-span-3 bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Título Oficial de la Norma
        </div>
        <div class="text-xs font-semibold text-slate-900 leading-relaxed">
          ${escapeHtml(norma.titulo)}
        </div>
      </div>

      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Cobertura Estructural
        </div>
        <div class="text-xs font-semibold text-slate-800 tabular-nums">
          ${clausulasCount} cláusulas · ${acreditacionesCount} acreditaciones
        </div>
      </div>
    </div>
  `;
}

function renderNormaFormBody(draft: NormaFormDraft): string {
  return `
    <form id="normaDetailForm" novalidate class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 sm:p-3.5 space-y-3">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div class="space-y-1">
          <label for="normaCodigoInput" class="block text-xs font-bold text-slate-700">
            Código Canónico <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <input
            id="normaCodigoInput"
            name="codigo"
            type="text"
            required
            maxlength="${NORMA_CODIGO_MAX_LENGTH}"
            value="${escapeHtml(draft.codigo)}"
            placeholder="Ej. ISO 9001:2015"
            class="w-full text-xs font-mono font-bold px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>

        <div class="space-y-1">
          <label for="normaEsquemaInput" class="block text-xs font-bold text-slate-700">
            Esquema de Certificación <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <input
            id="normaEsquemaInput"
            name="esquema"
            type="text"
            required
            maxlength="${NORMA_ESQUEMA_MAX_LENGTH}"
            value="${escapeHtml(draft.esquema)}"
            placeholder="Ej. SGC - Calidad"
            class="w-full text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>

        <div class="space-y-1">
          <label for="normaNombreInput" class="block text-xs font-bold text-slate-700">
            Nombre Corto (norma) <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <input
            id="normaNombreInput"
            name="norma"
            type="text"
            required
            maxlength="${NORMA_NOMBRE_MAX_LENGTH}"
            value="${escapeHtml(draft.norma)}"
            placeholder="Ej. ISO 9001:2015"
            class="w-full text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>

        <div class="space-y-1">
          <label for="normaEstatusSelect" class="block text-xs font-bold text-slate-700">
            Estatus de Vigencia <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <select
            id="normaEstatusSelect"
            name="estatus"
            required
            class="w-full text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            ${VALID_NORMA_STATUSES.map(
              (st) =>
                `<option value="${escapeHtml(st)}" ${draft.estatus === st ? 'selected' : ''}>${escapeHtml(st)}</option>`
            ).join('')}
          </select>
        </div>

        <div class="space-y-1">
          <label for="normaFechaPubInput" class="block text-xs font-bold text-slate-700">
            Fecha de Publicación Oficial
          </label>
          <input
            id="normaFechaPubInput"
            name="fecha_publicacion"
            type="date"
            value="${escapeHtml(draft.fecha_publicacion)}"
            class="w-full text-xs font-mono px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>
      </div>

      <div class="space-y-1">
        <label for="normaTituloInput" class="block text-xs font-bold text-slate-700">
          Título Oficial <span class="text-rose-600" aria-hidden="true">*</span>
        </label>
        <input
          id="normaTituloInput"
          name="titulo"
          type="text"
          required
          maxlength="${NORMA_TITULO_MAX_LENGTH}"
          value="${escapeHtml(draft.titulo)}"
          placeholder="Ej. Sistemas de Gestión de la Calidad — Requisitos"
          class="w-full text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
        />
      </div>
    </form>
  `;
}
