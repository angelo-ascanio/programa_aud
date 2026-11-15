import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import {
  AUDITOR_NOMBRE_MAX_LENGTH,
  createAuditorDraftFromEntity,
  createEmptyAuditorFormDraft,
  getAuditorNormaLinks,
  getAuditorSectorLinks,
  getAuditorSubsectorLinks,
  getCredentialValidityState,
  getQualificationStatusVisual,
  type AuditorChildTab,
  type AuditorDetailEntity,
  type AuditorDetailMode,
  type AuditorFormDraft,
  type AuditoriaRealizadaEntity,
  type AuditorNormaLink,
  type AuditorSectorLink,
  type AuditorSubsectorLink,
  type AuditorViewState,
} from '../lib/competencyMatrix';
import type { NormaEntity, SectorIafEntity, SubsectorIafEntity } from '../lib/extraDomain';
import {
  computeReactiveFacetCounts,
  filterRecordsWithFacets,
  sortItems,
  type ColumnDefinition,
  type MultiViewFacetCategory,
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

export type { AuditorViewState, AuditorChildTab };

export interface AuditorViewProps {
  profile: UserProfile;
  state: AuditorViewState;
  auditors: AuditorDetailEntity[];
  normas?: ReadonlyArray<NormaEntity>;
  sectores?: ReadonlyArray<SectorIafEntity>;
  subsectores?: ReadonlyArray<SubsectorIafEntity>;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  columnWidths?: Record<string, number>;
  tableColumnWidths?: Record<string, Record<string, number>>;
}

export function resolveAuditorDetailMode(
  state: AuditorViewState,
  isStaff: boolean,
  selectedAuditor?: AuditorDetailEntity
): AuditorDetailMode {
  if (!isStaff) {
    return 'read';
  }
  if (state.isCreating && !state.selectedAuditorId) {
    return 'add';
  }
  if (selectedAuditor && state.isEditingAttributes) {
    return 'edit';
  }
  return 'read';
}

export function renderAuditorView(props: AuditorViewProps): string {
  const {
    profile,
    state,
    auditors,
    normas = [],
    sectores = [],
    subsectores = [],
    loading = false,
    archiveConfig,
    columnWidths,
    tableColumnWidths,
  } = props;

  const isStaff = isApprovedStaffProfile(profile);

  if (state.selectedAuditorId) {
    const selectedAuditor = auditors.find((a) => a.id === state.selectedAuditorId);
    if (selectedAuditor) {
      return renderAuditorDetailPage({
        profile,
        state,
        auditor: selectedAuditor,
        normas,
        sectores,
        subsectores,
        isStaff,
        tableColumnWidths,
      });
    }
  }

  if (!state.selectedAuditorId && state.isCreating && isStaff) {
    return renderAuditorDetailPage({
      profile,
      state,
      normas,
      sectores,
      subsectores,
      isStaff,
      tableColumnWidths,
    });
  }

  return renderAuditorDirectory({
    profile,
    state,
    allAuditors: auditors,
    normas,
    sectores,
    subsectores,
    isStaff,
    loading,
    archiveConfig,
    columnWidths,
  });
}

function getAuditorValidityStates(auditor: AuditorDetailEntity): string[] {
  if (!auditor.competencias || auditor.competencias.length === 0) {
    return ['Vigente'];
  }
  const states = new Set<string>();
  for (const comp of auditor.competencias) {
    states.add(getCredentialValidityState(comp.fecha_vencimiento));
  }
  return Array.from(states);
}

/**
 * Renders the Universal Multi View Clean List & Grid Directory for Auditores
 */
function renderAuditorDirectory(props: {
  profile: UserProfile;
  state: AuditorViewState;
  allAuditors: AuditorDetailEntity[];
  normas: ReadonlyArray<NormaEntity>;
  sectores: ReadonlyArray<SectorIafEntity>;
  subsectores: ReadonlyArray<SubsectorIafEntity>;
  isStaff: boolean;
  loading: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  columnWidths?: Record<string, number>;
}): string {
  const {
    state,
    allAuditors,
    normas,
    sectores,
    subsectores,
    isStaff,
    loading,
    archiveConfig,
    columnWidths,
  } = props;

  const getNormaLabels = (aud: AuditorDetailEntity): string[] => {
    const links = getAuditorNormaLinks(aud, normas);
    if (links.length > 0) {
      return links.map((l) => l.norma_codigo);
    }
    return aud.normas_acreditadas;
  };

  const getSectorNumbers = (aud: AuditorDetailEntity): number[] => {
    const links = getAuditorSectorLinks(aud, sectores);
    if (links.length > 0) {
      return links.map((l) => l.sector_numero);
    }
    return aud.sectores_iaf;
  };

  const uniqueNormas = Array.from(
    new Set(allAuditors.flatMap((a) => getNormaLabels(a)))
  ).sort((a, b) => a.localeCompare(b, 'es'));

  const uniqueSectors = Array.from(
    new Set(allAuditors.flatMap((a) => getSectorNumbers(a)))
  ).sort((a, b) => a - b);

  const facetCategories: MultiViewFacetCategory<AuditorDetailEntity>[] = [
    {
      id: 'norma',
      label: 'Norma Calificada',
      options: uniqueNormas.map((n) => ({ value: n, label: n })),
      extractValues: (aud) => getNormaLabels(aud),
    },
    {
      id: 'sector_iaf',
      label: 'Sector IAF',
      options: uniqueSectors.map((s) => ({ value: String(s), label: `Sector IAF ${s}` })),
      extractValues: (aud) => getSectorNumbers(aud).map((s) => String(s)),
    },
    {
      id: 'vigencia',
      label: 'Vigencia de Credenciales',
      options: [
        { value: 'Vigente', label: 'Vigente' },
        { value: 'Por Vencer', label: 'Por Vencer' },
        { value: 'Vencido', label: 'Vencido' },
      ],
      extractValues: (aud) => getAuditorValidityStates(aud),
    },
  ];

  const effectiveSelections: MultiViewSelectionMap = state.facetSelections
    ? state.facetSelections
    : {
        norma:
          state.selectedStandard !== 'ALL' ? new Set([state.selectedStandard]) : new Set<string>(),
        sector_iaf:
          state.selectedSectorIaf !== 'ALL'
            ? new Set([state.selectedSectorIaf])
            : new Set<string>(),
        vigencia: new Set<string>(),
      };

  const searchOptions = {
    getSearchableText: (aud: AuditorDetailEntity) =>
      [
        aud.nombre,
        aud.codigo_credencial,
        aud.email,
        aud.titulo_profesional,
        aud.categoria_profesional,
        aud.calificacion,
        getNormaLabels(aud).join(' '),
        getSectorNumbers(aud)
          .map((s) => `Sector ${s}`)
          .join(' '),
      ].join(' '),
  };

  let filtered = filterRecordsWithFacets(
    allAuditors,
    state.query,
    facetCategories,
    effectiveSelections,
    searchOptions
  );

  if (!state.facetSelections && state.selectedCalificacion !== 'ALL') {
    filtered = filtered.filter((a) => a.calificacion === state.selectedCalificacion);
  }

  const sorted = sortItems(filtered, state.sortColumn, state.sortDirection, (aud, col) => {
    switch (col) {
      case 'nombre':
        return aud.nombre;
      case 'codigo_credencial':
        return aud.codigo_credencial;
      case 'calificacion':
        return aud.calificacion;
      case 'normas':
      case 'normas_acreditadas':
        return getNormaLabels(aud).length;
      case 'sectores':
      case 'sectores_iaf':
        return getSectorNumbers(aud).length;
      case 'auditorias_count':
        return aud.historialAuditorias.length;
      default:
        return '';
    }
  });

  const facetGroups = computeReactiveFacetCounts(
    allAuditors,
    state.query,
    facetCategories,
    effectiveSelections,
    searchOptions
  );

  // Strict Clean List columns summing strictly to 100% — zero <button>/<a>/<input> inside <td>
  const columns: ColumnDefinition<AuditorDetailEntity>[] = [
    {
      id: 'nombre',
      header: 'Auditor',
      sortable: true,
      defaultWidthPct: 28,
      minWidthPx: 180,
      renderCell: (auditor) => `
        <div class="min-w-0">
          <span class="block font-bold text-slate-900 truncate" title="${escapeHtml(auditor.nombre)}">
            ${escapeHtml(auditor.nombre)}
          </span>
          ${
            auditor.titulo_profesional
              ? `<span class="block text-[11px] text-slate-500 truncate">${escapeHtml(auditor.titulo_profesional)}</span>`
              : ''
          }
        </div>
      `,
    },
    {
      id: 'normas_acreditadas',
      header: 'Normas Acreditadas',
      sortable: true,
      defaultWidthPct: 28,
      minWidthPx: 150,
      renderCell: (auditor) => {
        const normaLabels = getNormaLabels(auditor);
        if (normaLabels.length === 0) {
          return `<span class="text-slate-400 italic">Sin normas asignadas</span>`;
        }
        return `
          <div class="flex flex-wrap gap-1 min-w-0">
            ${normaLabels
              .map(
                (n) => `
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-800 border border-slate-200 whitespace-nowrap">
                    ${escapeHtml(n)}
                  </span>
                `
              )
              .join('')}
          </div>
        `;
      },
    },
    {
      id: 'sectores_iaf',
      header: 'Sectores IAF',
      sortable: true,
      defaultWidthPct: 26,
      minWidthPx: 140,
      renderCell: (auditor) => {
        const sectorNums = getSectorNumbers(auditor);
        const subsectorCount = getAuditorSubsectorLinks(auditor, subsectores).length;
        if (sectorNums.length === 0 && subsectorCount === 0) {
          return `<span class="text-slate-400 italic">Sin sectores IAF</span>`;
        }
        const sectorsLabel = sectorNums.map((s) => `S${s}`).join(', ');
        return `
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold whitespace-nowrap">
              <span aria-hidden="true">🏭</span>
              <span>${escapeHtml(sectorsLabel || `${sectorNums.length} sectores`)}</span>
            </span>
            ${
              subsectorCount > 0
                ? `<span class="text-[11px] text-slate-500 font-medium whitespace-nowrap">${subsectorCount} sub-sec.</span>`
                : ''
            }
          </div>
        `;
      },
    },
    {
      id: 'auditorias_count',
      header: 'Auditorías',
      sortable: true,
      align: 'center',
      defaultWidthPct: 18,
      minWidthPx: 110,
      renderCell: (auditor) => {
        const count = auditor.historialAuditorias.length;
        return `
          <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${
            count > 0
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-slate-100 text-slate-600 border-slate-200'
          }">
            <span class="tabular-nums">${count}</span>
            <span>${count === 1 ? 'auditoría' : 'auditorías'}</span>
          </span>
        `;
      },
    },
  ];

  const renderCard = (auditor: AuditorDetailEntity): string => {
    const statusVisual = getQualificationStatusVisual(auditor.calificacion);
    const normaLabels = getNormaLabels(auditor);
    const sectorLinks = getAuditorSectorLinks(auditor, sectores);
    const subsectorLinks = getAuditorSubsectorLinks(auditor, subsectores);

    return `
      <div
        role="button"
        tabindex="0"
        data-action="select-auditor"
        data-auditor-id="${escapeHtml(auditor.id)}"
        aria-label="Abrir detalle de ${escapeHtml(auditor.nombre)}"
        class="bg-white border border-slate-200 hover:border-indigo-300 rounded-xl p-5 shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between space-y-4 group"
      >
        <div class="space-y-2">
          <div class="flex items-start justify-between gap-2">
            <div class="space-y-1 flex-1 min-w-0">
              ${
                auditor.codigo_credencial
                  ? `
                    <span class="inline-block font-mono text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                      🪪 ${escapeHtml(auditor.codigo_credencial)}
                    </span>
                  `
                  : ''
              }
              <h3 class="text-sm font-bold text-slate-900 group-hover:text-indigo-700 transition-colors truncate">
                ${escapeHtml(auditor.nombre)}
              </h3>
              ${
                auditor.titulo_profesional
                  ? `<p class="text-xs text-slate-500 line-clamp-1">${escapeHtml(auditor.titulo_profesional)}</p>`
                  : ''
              }
            </div>

            <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border shrink-0 ${statusVisual.badgeClass}">
              <span class="w-1.5 h-1.5 rounded-full ${statusVisual.dotClass}"></span>
              <span>${escapeHtml(statusVisual.label)}</span>
            </span>
          </div>
        </div>

        <div class="text-xs text-slate-600 bg-slate-50/75 p-3 rounded-lg border border-slate-100 space-y-2">
          <div>
            <span class="text-[10px] uppercase font-bold text-slate-400 block mb-1">Normas Acreditadas:</span>
            <div class="flex flex-wrap gap-1">
              ${
                normaLabels.length > 0
                  ? normaLabels
                      .map(
                        (n) => `
                          <span class="px-2 py-0.5 rounded text-[11px] font-semibold bg-white text-slate-800 border border-slate-200">
                            📘 ${escapeHtml(n)}
                          </span>
                        `
                      )
                      .join('')
                  : '<span class="text-[11px] text-slate-400 italic">Sin normas asignadas</span>'
              }
            </div>
          </div>

          <div class="flex items-center justify-between pt-1 border-t border-slate-200/50">
            <span class="text-slate-500 text-[11px]">Sectores IAF Calificados:</span>
            <span class="font-medium text-slate-800 inline-flex items-center gap-1">
              <span aria-hidden="true">🏭</span>
              <span>${sectorLinks.length} sectores (${subsectorLinks.length} subsectores)</span>
            </span>
          </div>
        </div>

        <div class="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <span class="truncate max-w-[190px]">
            ${auditor.email ? `✉️ ${escapeHtml(auditor.email)}` : 'Evaluador ISO/IEC 17021-1'}
          </span>
          <span class="font-semibold text-slate-700 tabular-nums">
            ${auditor.historialAuditorias.length} auditoría${auditor.historialAuditorias.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>
    `;
  };

  const actionsHtml = isStaff
    ? renderMultiViewAddButton('open-create-auditor', 'Nuevo Auditor')
    : '';

  return renderUniversalTemplate<AuditorDetailEntity>({
    domainKey: 'auditores',
    tableId: 'cert-auditores-main',
    columnWidths,
    title: 'Equipo de Auditores',
    subtitle:
      'Cuerpo de evaluadores técnicos calificados bajo ISO/IEC 17021-1:2015 cláusula 7.2 e ISO 19011:2018',
    entityLabel: 'auditores registrados',
    searchQuery: state.query,
    searchPlaceholder: 'Buscar por nombre, norma o sector IAF... (Presione "/" para enfocar)',
    searchInputId: 'auditorDirectorySearchInput',
    clearSearchBtnId: 'clearAuditorSearchBtn',
    totalCount: allAuditors.length,
    filteredCount: sorted.length,
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen ?? true,
    sortState: {
      column: state.sortColumn,
      direction: state.sortDirection,
    },
    facetGroups,
    items: sorted,
    columns,
    getRowAttrs: (aud) =>
      `data-action="select-auditor" data-auditor-id="${escapeHtml(aud.id)}" title="Abrir detalle de ${escapeHtml(aud.nombre)}"`,
    renderCard,
    emptyStateTitle: 'No se encontraron auditores',
    emptyStateMessage:
      'No hay evaluadores que coincidan con el término de búsqueda o las facetas seleccionadas.',
    actionsHtml,
    loading,
    loadingMessage: 'Cargando cuerpo de auditores y competencias...',
    ...extractUniversalArchiveProps(archiveConfig, 'auditores'),
  });
}

/**
 * Standardized 3-Zone Detail Page Architecture ('read' | 'add' | 'edit') & Competency Matrix
 */
function renderAuditorDetailPage(props: {
  profile: UserProfile;
  state: AuditorViewState;
  auditor?: AuditorDetailEntity;
  normas: ReadonlyArray<NormaEntity>;
  sectores: ReadonlyArray<SectorIafEntity>;
  subsectores: ReadonlyArray<SubsectorIafEntity>;
  isStaff: boolean;
  tableColumnWidths?: Record<string, Record<string, number>>;
}): string {
  const {
    profile,
    state,
    auditor,
    normas,
    sectores,
    subsectores,
    isStaff,
    tableColumnWidths,
  } = props;

  const mode = resolveAuditorDetailMode(state, isStaff, auditor);
  const isCreateMode = mode === 'add';
  const isReadOnly = mode === 'read';

  const draft: AuditorFormDraft =
    mode === 'add'
      ? state.formDraft ?? createEmptyAuditorFormDraft()
      : mode === 'edit'
      ? state.formDraft ??
        (auditor ? createAuditorDraftFromEntity(auditor) : createEmptyAuditorFormDraft())
      : auditor
      ? createAuditorDraftFromEntity(auditor)
      : createEmptyAuditorFormDraft();

  const normaLinks = auditor ? getAuditorNormaLinks(auditor, normas) : [];
  const sectorLinks = auditor ? getAuditorSectorLinks(auditor, sectores) : [];
  const subsectorLinks = auditor ? getAuditorSubsectorLinks(auditor, subsectores) : [];
  const totalCompetencies = normaLinks.length + sectorLinks.length + subsectorLinks.length;

  const statusVisual = getQualificationStatusVisual(auditor?.calificacion || 'Calificado');
  const activeTab: AuditorChildTab = state.activeChildTab === 'historial' ? 'historial' : 'competencias';

  const customTopActionsHtml = isStaff
    ? renderDetailFormTopActions({
        mode,
        isStaff: true,
        formId: 'auditorDetailForm',
        saveBtnId: 'saveAuditorFormBtn',
        cancelBtnId: 'cancelEditAuditorBtn',
        editBtnId: 'startEditAuditorBtn',
        saveTitle: isCreateMode ? 'Crear auditor' : 'Guardar cambios',
        cancelTitle: isCreateMode ? 'Cancelar creación' : 'Cancelar edición',
        editTitle: 'Editar auditor',
        showHistoryBtn: !isCreateMode,
        showArchiveBtn: !isCreateMode && canArchiveRecord(profile),
        extraAuditAttrs: auditor
          ? `data-table-name="auditor" data-record-id="${escapeHtml(auditor.id)}" data-entity-name="${escapeHtml(auditor.nombre)}"`
          : '',
        extraArchiveAttrs: auditor
          ? `data-archive-table="auditor" data-archive-id="${escapeHtml(auditor.id)}" data-archive-entity-label="Auditor Evaluador" data-archive-title="${escapeHtml(auditor.nombre)}" data-archive-subtitle="${escapeHtml(auditor.codigo_credencial || 'Evaluador Técnico')}"`
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
    isReadOnly && auditor
      ? renderReadOnlyAuditorAttributes(auditor, normaLinks, sectorLinks, subsectorLinks)
      : renderAuditorFormBody(draft, isCreateMode);

  const childTabs = isCreateMode
    ? []
    : [
        {
          id: 'competencias',
          label: 'Competencias',
          symbol: '🛡️',
          count: totalCompetencies,
        },
        {
          id: 'historial',
          label: 'Historial de Auditorías',
          symbol: '📋',
          count: auditor?.historialAuditorias.length ?? 0,
        },
      ];

  return renderDetailPageTemplate({
    entityType: 'Auditor Calificado',
    entitySymbol: '🪪',
    title: isCreateMode ? 'Nuevo Auditor' : auditor ? auditor.nombre : 'Auditor Calificado',
    eyebrowCode: !isCreateMode && auditor?.codigo_credencial ? auditor.codigo_credencial : undefined,
    subtitle: isCreateMode
      ? 'Registro maestro de evaluador técnico en public.auditor conforme a ISO/IEC 17021-1:2015.'
      : auditor
      ? `${normaLinks.length} norma${normaLinks.length === 1 ? '' : 's'} · ${sectorLinks.length} sector${sectorLinks.length === 1 ? '' : 'es'} IAF · ${subsectorLinks.length} sub-sector${subsectorLinks.length === 1 ? '' : 'es'}`
      : undefined,
    statusBadge:
      !isCreateMode && auditor
        ? {
            label: statusVisual.label,
            badgeClass: statusVisual.badgeClass,
            dotClass: statusVisual.dotClass,
          }
        : undefined,
    backButton: {
      label: 'Volver',
      nav: 'certificacion',
      subview: 'auditors',
      action: 'back-to-auditor-list',
    },
    isCreateMode,
    customTopActionsHtml,
    parents: [],
    tableName: 'auditor',
    recordId: auditor?.id || 'auditor-new',
    feedbackHtml,
    attributes: [],
    customRecordBodyHtml,
    childTabs,
    activeChildTabId: activeTab,
    childTabAttrName: 'data-auditor-tab',
    renderChildTabContent: (tabId) => {
      if (!auditor) return '';
      if (tabId === 'historial') {
        return renderHistorialChildTab(auditor.historialAuditorias, tableColumnWidths);
      }
      return renderCompetenciasChildTab({
        auditor,
        normaLinks,
        sectorLinks,
        subsectorLinks,
        isStaff,
        tableColumnWidths,
      });
    },
  });
}

function renderReadOnlyAuditorAttributes(
  auditor: AuditorDetailEntity,
  normaLinks: AuditorNormaLink[],
  sectorLinks: AuditorSectorLink[],
  subsectorLinks: AuditorSubsectorLink[]
): string {
  return `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
      <div class="sm:col-span-2 bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Nombre Completo</span>
        <p class="text-xs font-bold text-slate-900">${escapeHtml(auditor.nombre)}</p>
      </div>
      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Normas Acreditadas</span>
        <p class="text-xs font-bold text-slate-900 tabular-nums">
          ${normaLinks.length} ${normaLinks.length === 1 ? 'norma calificada' : 'normas calificadas'}
        </p>
      </div>
      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Sectores / Sub-Sectores IAF</span>
        <p class="text-xs font-bold text-slate-900 tabular-nums">
          ${sectorLinks.length} sectores · ${subsectorLinks.length} sub-sectores
        </p>
      </div>
      ${
        auditor.codigo_credencial
          ? `
            <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
              <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Credencial de Registro</span>
              <p class="text-xs font-mono font-bold text-slate-900">${escapeHtml(auditor.codigo_credencial)}</p>
            </div>
          `
          : ''
      }
      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Auditorías Ejecutadas</span>
        <p class="text-xs font-bold text-slate-900 tabular-nums">
          ${auditor.historialAuditorias.length} ${auditor.historialAuditorias.length === 1 ? 'jornada registrada' : 'jornadas registradas'}
        </p>
      </div>
    </div>
  `;
}

function renderAuditorFormBody(draft: AuditorFormDraft, isCreateMode: boolean): string {
  return `
    <form id="auditorDetailForm" class="space-y-3" novalidate>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
          <label for="auditorNombreInput" class="block text-xs font-bold text-slate-700">
            Nombre Completo <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <input
            type="text"
            id="auditorNombreInput"
            name="nombre"
            required
            maxlength="${AUDITOR_NOMBRE_MAX_LENGTH}"
            value="${escapeHtml(draft.nombre)}"
            placeholder="Ej. Ing. Elena Mendoza"
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
          />
          <p class="text-[11px] text-slate-500">
            Campo maestro persistido en <span class="font-mono font-semibold text-slate-700">public.auditor.nombre</span> (máx. ${AUDITOR_NOMBRE_MAX_LENGTH} caracteres).
          </p>
        </div>

        <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1">
          <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Matriz de Competencias ISO/IEC 17021-1
          </span>
          <p class="text-xs text-slate-600 leading-relaxed">
            ${
              isCreateMode
                ? 'Una vez creado el auditor, utilice la pestaña Competencias para vincular Normas ISO, Sectores IAF y Sub-Sectores IAF.'
                : 'Las competencias normativas y sectoriales se gestionan individualmente desde la pestaña Competencias.'
            }
          </p>
        </div>
      </div>
    </form>
  `;
}

/**
 * TAB 1: Matriz de Competencias M:N (norma_auditor, sector_iaf_auditor, subsector_iaf_auditor)
 */
function renderCompetenciasChildTab(params: {
  auditor: AuditorDetailEntity;
  normaLinks: AuditorNormaLink[];
  sectorLinks: AuditorSectorLink[];
  subsectorLinks: AuditorSubsectorLink[];
  isStaff: boolean;
  tableColumnWidths?: Record<string, Record<string, number>>;
}): string {
  const { auditor, normaLinks, sectorLinks, subsectorLinks, isStaff, tableColumnWidths } = params;

  const headerBarHtml = `
    <div class="flex flex-wrap items-center justify-between gap-2 pb-2.5">
      <p class="text-xs text-slate-500">
        Haga clic en una fila para inspeccionar o desvincular la competencia técnica bajo ISO/IEC 17021-1.
      </p>
      ${
        isStaff
          ? `
            <button
              type="button"
              data-action="open-add-competency"
              data-auditor-id="${escapeHtml(auditor.id)}"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold transition-colors cursor-pointer shadow-2xs shrink-0"
            >
              <span aria-hidden="true">+</span>
              <span>Asignar Competencia</span>
            </button>
          `
          : ''
      }
    </div>
  `;

  const normaColumns: ColumnDefinition<AuditorNormaLink>[] = [
    {
      id: 'norma_codigo',
      header: 'Norma ISO',
      defaultWidthPct: 30,
      minWidthPx: 130,
      renderCell: (item) => `
        <span class="font-bold text-slate-900 inline-flex items-center gap-1.5">
          <span aria-hidden="true">📘</span>
          <span>${escapeHtml(item.norma_codigo)}</span>
        </span>
      `,
    },
    {
      id: 'norma_titulo',
      header: 'Título del Estándar',
      defaultWidthPct: 50,
      minWidthPx: 180,
      renderCell: (item) =>
        `<span class="text-slate-700 truncate block">${escapeHtml(item.norma_titulo || 'Sistema de Gestión Certificado')}</span>`,
    },
    {
      id: 'esquema',
      header: 'Esquema',
      defaultWidthPct: 20,
      minWidthPx: 110,
      renderCell: (item) =>
        `<span class="font-mono text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">${escapeHtml(item.esquema || 'ISO')}</span>`,
    },
  ];

  const sectorColumns: ColumnDefinition<AuditorSectorLink>[] = [
    {
      id: 'sector_numero',
      header: 'Sector IAF',
      defaultWidthPct: 28,
      minWidthPx: 120,
      renderCell: (item) => `
        <span class="font-bold text-indigo-800 inline-flex items-center gap-1.5">
          <span aria-hidden="true">🏭</span>
          <span>Sector IAF ${item.sector_numero}</span>
        </span>
      `,
    },
    {
      id: 'sector_descripcion',
      header: 'Descripción Técnica Sectorial',
      defaultWidthPct: 72,
      minWidthPx: 200,
      renderCell: (item) =>
        `<span class="text-slate-700 truncate block">${escapeHtml(item.sector_descripcion)}</span>`,
    },
  ];

  const subsectorColumns: ColumnDefinition<AuditorSubsectorLink>[] = [
    {
      id: 'subsector_codigo',
      header: 'Sub-Sector',
      defaultWidthPct: 20,
      minWidthPx: 100,
      renderCell: (item) => `
        <span class="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
          ${escapeHtml(item.subsector_codigo)}
        </span>
      `,
    },
    {
      id: 'subsector_descripcion',
      header: 'Descripción Técnica',
      defaultWidthPct: 45,
      minWidthPx: 160,
      renderCell: (item) =>
        `<span class="text-slate-800 font-medium truncate block">${escapeHtml(item.subsector_descripcion)}</span>`,
    },
    {
      id: 'sector_numero',
      header: 'Sector Padre',
      defaultWidthPct: 18,
      minWidthPx: 100,
      renderCell: (item) =>
        `<span class="text-slate-600 font-semibold">Sector ${item.sector_numero}</span>`,
    },
    {
      id: 'categoria_riesgo',
      header: 'Riesgo IAF',
      align: 'center',
      defaultWidthPct: 17,
      minWidthPx: 100,
      renderCell: (item) => {
        const risk = item.categoria_riesgo || 'MEDIO';
        const badgeClass =
          risk === 'ALTO'
            ? 'bg-rose-50 text-rose-800 border-rose-200'
            : risk === 'BAJO'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : 'bg-amber-50 text-amber-800 border-amber-200';
        return `<span class="inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold border ${badgeClass}">${escapeHtml(risk)}</span>`;
      },
    },
  ];

  return `
    ${headerBarHtml}
    <div class="space-y-4">
      <div class="space-y-1.5">
        <div class="flex items-center justify-between px-1">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-600">
            📘 Normas ISO Acreditadas (${normaLinks.length})
          </h3>
        </div>
        ${renderListViewTable({
          tableId: 'auditor-tab-normas',
          columns: normaColumns,
          items: normaLinks,
          columnWidths: tableColumnWidths?.['auditor-tab-normas'],
          emptyStateTitle: 'Sin normas asignadas',
          emptyStateMessage: 'Este auditor aún no tiene normas vinculadas en norma_auditor.',
          getRowAttrs: (item) =>
            `data-action="select-competencia-auditor" data-comp-tipo="norma" data-auditor-id="${escapeHtml(auditor.id)}" data-target-id="${escapeHtml(item.id_norma)}" title="Inspeccionar competencia ${escapeHtml(item.norma_codigo)}"`,
        })}
      </div>

      <div class="space-y-1.5">
        <div class="flex items-center justify-between px-1">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-600">
            🏭 Sectores Técnicos IAF (${sectorLinks.length})
          </h3>
        </div>
        ${renderListViewTable({
          tableId: 'auditor-tab-sectores',
          columns: sectorColumns,
          items: sectorLinks,
          columnWidths: tableColumnWidths?.['auditor-tab-sectores'],
          emptyStateTitle: 'Sin sectores IAF asignados',
          emptyStateMessage: 'Este auditor aún no tiene sectores IAF vinculados en sector_iaf_auditor.',
          getRowAttrs: (item) =>
            `data-action="select-competencia-auditor" data-comp-tipo="sector_iaf" data-auditor-id="${escapeHtml(auditor.id)}" data-target-id="${escapeHtml(item.id_sector_iaf)}" title="Inspeccionar competencia Sector IAF ${item.sector_numero}"`,
        })}
      </div>

      <div class="space-y-1.5">
        <div class="flex items-center justify-between px-1">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-600">
            🧩 Sub-Sectores Técnicos IAF (${subsectorLinks.length})
          </h3>
        </div>
        ${renderListViewTable({
          tableId: 'auditor-tab-subsectores',
          columns: subsectorColumns,
          items: subsectorLinks,
          columnWidths: tableColumnWidths?.['auditor-tab-subsectores'],
          emptyStateTitle: 'Sin sub-sectores IAF asignados',
          emptyStateMessage:
            'Este auditor aún no tiene sub-sectores específicos vinculados en subsector_iaf_auditor.',
          getRowAttrs: (item) =>
            `data-action="select-competencia-auditor" data-comp-tipo="subsector_iaf" data-auditor-id="${escapeHtml(auditor.id)}" data-target-id="${escapeHtml(item.id_subsector_iaf)}" title="Inspeccionar competencia Sub-Sector ${escapeHtml(item.subsector_codigo)}"`,
        })}
      </div>
    </div>
  `;
}

/**
 * TAB 2: Historial de Auditorías Realizadas (public.auditoria)
 */
function renderHistorialChildTab(
  historial: AuditoriaRealizadaEntity[],
  tableColumnWidths?: Record<string, Record<string, number>>
): string {
  if (historial.length === 0) {
    return `
      <div class="p-8 text-center text-slate-500 text-xs bg-slate-50 rounded-xl border border-slate-200 space-y-2">
        <span class="text-2xl block" aria-hidden="true">📋</span>
        <p class="font-bold text-slate-800">Sin historial de auditorías ejecutadas</p>
        <p class="text-slate-500">Este auditor aún no ha participado en jornadas de auditoría registradas en el sistema.</p>
      </div>
    `;
  }

  const columns: ColumnDefinition<AuditoriaRealizadaEntity>[] = [
    {
      id: 'codigo_auditoria',
      header: 'Auditoría',
      defaultWidthPct: 18,
      minWidthPx: 110,
      renderCell: (aud) => `
        <span class="font-mono font-bold text-slate-900 inline-flex items-center gap-1.5">
          <span aria-hidden="true">📋</span>
          <span>${escapeHtml(aud.codigo_auditoria)}</span>
        </span>
      `,
    },
    {
      id: 'organizacion_nombre',
      header: 'Organización Cliente',
      defaultWidthPct: 24,
      minWidthPx: 140,
      renderCell: (aud) =>
        `<span class="font-bold text-slate-800 truncate block">${escapeHtml(aud.organizacion_nombre)}</span>`,
    },
    {
      id: 'numero_certificado',
      header: 'Certificado',
      defaultWidthPct: 18,
      minWidthPx: 110,
      renderCell: (aud) =>
        `<span class="font-mono font-semibold text-slate-700">${escapeHtml(aud.numero_certificado)}</span>`,
    },
    {
      id: 'modalidad',
      header: 'Modalidad',
      defaultWidthPct: 16,
      minWidthPx: 110,
      renderCell: (aud) =>
        `<span class="text-slate-700">${escapeHtml(aud.tipo_auditoria)} · ${escapeHtml(aud.metodologia)}</span>`,
    },
    {
      id: 'rol_en_auditoria',
      header: 'Rol',
      defaultWidthPct: 12,
      minWidthPx: 95,
      renderCell: (aud) =>
        `<span class="font-medium text-indigo-700">${escapeHtml(aud.rol_en_auditoria)}</span>`,
    },
    {
      id: 'estatus',
      header: 'Estatus',
      align: 'center',
      defaultWidthPct: 12,
      minWidthPx: 90,
      renderCell: (aud) => {
        const isCompleted = aud.estatus === 'Completada' || aud.estatus === 'Cerrada';
        return `
          <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
            isCompleted
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-indigo-50 text-indigo-800 border-indigo-200'
          }">
            <span>${escapeHtml(aud.estatus)}</span>
          </span>
        `;
      },
    },
  ];

  return renderListViewTable({
    tableId: 'auditor-tab-historial',
    columns,
    items: historial,
    columnWidths: tableColumnWidths?.['auditor-tab-historial'],
    getRowAttrs: (aud) =>
      `data-action="select-prog-audit-by-code" data-audit-code="${escapeHtml(aud.codigo_auditoria)}" title="Abrir auditoría ${escapeHtml(aud.codigo_auditoria)}"`,
  });
}
