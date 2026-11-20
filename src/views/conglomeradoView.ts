import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import type { OrganizacionEntity } from '../lib/activeCertificates';
import type { ProgramaAuditoriaEntity } from '../lib/auditPlanningEngine';
import {
  createConglomeradoDraftFromEntity,
  createEmptyConglomeradoFormDraft,
  planOrganizationRebucket,
  type ConglomeradoFormDraft,
  type ConglomeradoWithStats,
} from '../lib/conglomeradoDomain';
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
} from './detailTemplate';
import {
  canArchiveRecord,
  extractUniversalArchiveProps,
  type ArchiveMultiViewConfig,
} from '../lib/archiveGovernance';

export type ConglomeradoChildTab = 'organizaciones' | 'vinculos';
export type ConglomeradoSortColumn = 'conglomerado' | 'tipo_agrupacion' | 'certificados';

export interface ConglomeradoViewState {
  selectedConglomeradoId: string | null;
  query: string;
  viewMode: 'grid' | 'list';
  sortColumn: ConglomeradoSortColumn | null;
  sortDirection: SortDirection;
  isEditingAttributes: boolean;
  activeChildTab: ConglomeradoChildTab;
  formDraft?: ConglomeradoFormDraft;
  editErrorMessage?: string | null;
  isSidebarOpen?: boolean;
  facetSelections?: MultiViewSelectionMap;
  isCreating?: boolean;
  rebucketTargetOrgId?: string | null;
  rebucketErrorMessage?: string | null;
}

export interface ConglomeradoViewProps {
  profile: UserProfile;
  state: ConglomeradoViewState;
  conglomerados: ReadonlyArray<ConglomeradoWithStats>;
  allOrganizaciones?: ReadonlyArray<OrganizacionEntity>;
  auditPrograms?: ReadonlyArray<ProgramaAuditoriaEntity>;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  columnWidths?: Record<string, number>;
  tableColumnWidths?: Record<string, Record<string, number>>;
}

export function resolveConglomeradoDetailMode(
  state: ConglomeradoViewState,
  isStaff: boolean,
  selectedGroup?: ConglomeradoWithStats
): 'read' | 'add' | 'edit' {
  if (!isStaff) return 'read';
  if (state.isCreating && !state.selectedConglomeradoId) return 'add';
  if (selectedGroup && state.isEditingAttributes) return 'edit';
  return 'read';
}

export function renderConglomeradoView(props: ConglomeradoViewProps): string {
  const {
    profile,
    state,
    conglomerados,
    allOrganizaciones = [],
    auditPrograms = [],
    loading,
    archiveConfig,
    columnWidths,
    tableColumnWidths,
  } = props;

  const isStaff = isApprovedStaffProfile(profile);
  const activeGroups = conglomerados.filter((g) => !g.deleted_at);

  if (state.selectedConglomeradoId) {
    const selectedGroup = activeGroups.find((g) => g.id === state.selectedConglomeradoId);
    if (selectedGroup) {
      return renderConglomeradoDetailView({
        profile,
        state,
        group: selectedGroup,
        allGroups: activeGroups,
        allOrganizaciones,
        auditPrograms,
        isStaff,
        tableColumnWidths,
      });
    }
  }

  if (isStaff && state.isCreating) {
    return renderConglomeradoDetailView({
      profile,
      state,
      allGroups: activeGroups,
      allOrganizaciones,
      auditPrograms,
      isStaff,
      tableColumnWidths,
    });
  }

  const facetCategories: MultiViewFacetCategory<ConglomeradoWithStats>[] = [
    {
      id: 'bucket',
      label: 'Estado Agrupación',
      options: [
        { value: 'SOLO', label: 'Organizaciones solas / sin agrupar' },
        { value: 'MULTI_ORG', label: 'Conglomerados multi-empresa' },
      ],
      extractValues: (g) => g.bucketKind,
    },
    {
      id: 'certificados',
      label: 'Certificados',
      options: [
        { value: 'WITH_CERTS', label: 'Con certificados' },
        { value: 'WITHOUT_CERTS', label: 'Sin certificados' },
      ],
      extractValues: (g) => (g.certificadosCount > 0 ? 'WITH_CERTS' : 'WITHOUT_CERTS'),
    },
  ];

  const selections: MultiViewSelectionMap = state.facetSelections || {};
  const searchOptions = {
    getSearchableText: (g: ConglomeradoWithStats) =>
      [
        g.nombre,
        g.codigo_grupo || '',
        g.organizaciones.map((o) => o.nombre).join(' '),
        g.notas || '',
      ].join(' '),
  };

  const facetGroups = computeReactiveFacetCounts(
    activeGroups,
    state.query,
    facetCategories,
    selections,
    searchOptions
  );

  const filteredGroups = filterRecordsWithFacets(
    activeGroups,
    state.query,
    facetCategories,
    selections,
    searchOptions
  );

  const columns: ColumnDefinition<ConglomeradoWithStats>[] = [
    {
      id: 'conglomerado',
      header: 'Conglomerado',
      sortable: true,
      defaultWidthPct: 38,
      minWidthPx: 200,
      renderCell: (g) => {
        const subMeta = g.codigo_grupo
          ? g.codigo_grupo
          : g.es_individual_auto
          ? 'Auto 1:1'
          : 'Corporativo';
        return `
          <div class="min-w-0">
            <span class="block font-bold text-slate-900 truncate" title="${escapeHtml(g.nombre)}">${escapeHtml(g.nombre)}</span>
            <span class="block text-[11px] font-mono text-slate-500 truncate">${escapeHtml(subMeta)}</span>
          </div>
        `;
      },
    },
    {
      id: 'tipo_agrupacion',
      header: 'Composición',
      sortable: true,
      defaultWidthPct: 24,
      minWidthPx: 150,
      renderCell: (g) => {
        if (g.bucketKind === 'MULTI_ORG') {
          return `<span class="font-semibold text-indigo-800 whitespace-nowrap">Multi-empresa (${g.organizacionesCount} orgs)</span>`;
        }
        if (g.bucketKind === 'SOLO') {
          return `<span class="font-medium text-slate-700 whitespace-nowrap">Sola (1 org)</span>`;
        }
        return `<span class="text-slate-400 whitespace-nowrap">Vacío (0 orgs)</span>`;
      },
    },
    {
      id: 'organizaciones',
      header: 'Empresas',
      sortable: false,
      defaultWidthPct: 24,
      minWidthPx: 160,
      renderCell: (g) => {
        const names =
          g.organizaciones.length > 0
            ? g.organizaciones.map((o) => o.nombre).join(' · ')
            : 'Sin empresas vinculadas';
        return `<span class="block text-slate-700 truncate" title="${escapeHtml(names)}">${escapeHtml(names)}</span>`;
      },
    },
    {
      id: 'certificados',
      header: 'Certificados',
      sortable: true,
      align: 'right',
      defaultWidthPct: 14,
      minWidthPx: 100,
      renderCell: (g) =>
        `<span class="tabular-nums font-semibold text-slate-800 whitespace-nowrap">${g.certificadosCount} ${
          g.certificadosCount === 1 ? 'cert' : 'certs'
        }</span>`,
    },
  ];

  const sortCol = state.sortColumn;
  const sortDir = state.sortDirection;
  const sortedGroups = sortItems(
    filteredGroups,
    sortCol,
    sortDir,
    (g, col) => {
      switch (col) {
        case 'conglomerado':
          return g.nombre;
        case 'tipo_agrupacion':
          return (
            (g.bucketKind === 'MULTI_ORG' ? 2 : g.bucketKind === 'SOLO' ? 1 : 0) * 1000 +
            g.organizacionesCount
          );
        case 'certificados':
          return g.certificadosCount;
        default:
          return '';
      }
    }
  );

  const renderCard = (g: ConglomeradoWithStats): string => {
    const codeLabel = g.codigo_grupo
      ? g.codigo_grupo
      : g.es_individual_auto
      ? 'Auto 1:1'
      : 'Sin código';
    const compositionLabel =
      g.bucketKind === 'MULTI_ORG'
        ? `Multi-empresa · ${g.organizacionesCount} orgs`
        : g.bucketKind === 'SOLO'
        ? 'Sola · 1 org'
        : 'Vacío · 0 orgs';
    const orgNames =
      g.organizaciones.length > 0
        ? g.organizaciones.map((o) => o.nombre).join(' · ')
        : 'Sin empresas asociadas';

    return `
      <article
        data-action="select-conglomerado"
        data-conglomerado-id="${escapeHtml(g.id)}"
        tabindex="0"
        role="button"
        aria-label="Abrir conglomerado ${escapeHtml(g.nombre)}"
        class="group bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-400 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between gap-3"
      >
        <div class="space-y-2">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="text-[11px] font-mono text-slate-500 truncate">${escapeHtml(codeLabel)}</p>
              <h3 class="text-sm font-bold text-slate-900 group-hover:text-sky-800 transition-colors line-clamp-2">
                ${escapeHtml(g.nombre)}
              </h3>
            </div>
            <span class="text-[11px] font-semibold whitespace-nowrap ${
              g.bucketKind === 'MULTI_ORG' ? 'text-indigo-700' : 'text-slate-600'
            }">
              ${escapeHtml(compositionLabel)}
            </span>
          </div>
          <p class="text-xs text-slate-600 line-clamp-2" title="${escapeHtml(orgNames)}">
            ${escapeHtml(orgNames)}
          </p>
        </div>

        <div class="pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
          <span class="tabular-nums font-semibold text-slate-800">${g.certificadosCount} ${
            g.certificadosCount === 1 ? 'cert' : 'certs'
          }</span>
          <span class="text-[11px] font-semibold text-sky-700 group-hover:underline">Ver detalle →</span>
        </div>
      </article>
    `;
  };

  const actionsHtml = isStaff
    ? `
      <button
        type="button"
        data-action="open-create-conglomerado"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-2xs"
      >
        <span aria-hidden="true">+</span>
        <span>Nuevo Conglomerado</span>
      </button>
    `
    : '';

  return renderUniversalTemplate<ConglomeradoWithStats>({
    domainKey: 'conglomerados',
    tableId: 'conglomerados-main',
    title: 'Conglomerados Empresariales',
    subtitle:
      'Agrupaciones corporativas (holding / multi-empresa) e individuales 1:1 para vinculación Nivel 2.',
    entityLabel: 'conglomerados',
    searchQuery: state.query,
    searchPlaceholder: 'Buscar conglomerado, código o empresa...',
    searchInputId: 'conglomeradoSearchInput',
    clearSearchBtnId: 'clearConglomeradoSearchBtn',
    totalCount: activeGroups.length,
    filteredCount: sortedGroups.length,
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen ?? true,
    sortState: { column: sortCol, direction: sortDir },
    columnWidths,
    facetGroups,
    items: sortedGroups,
    columns,
    getRowAttrs: (g) =>
      `data-action="select-conglomerado" data-conglomerado-id="${escapeHtml(g.id)}" title="Abrir detalle de ${escapeHtml(g.nombre)}"`,
    renderCard,
    emptyStateTitle: 'No se encontraron conglomerados',
    emptyStateMessage:
      'Intente ajustar el término de búsqueda o restablecer las facetas laterales para visualizar todas las agrupaciones.',
    actionsHtml,
    loading,
    loadingMessage: 'Cargando conglomerados empresariales...',
    ...extractUniversalArchiveProps(archiveConfig, 'conglomerados'),
  });
}

function renderConglomeradoDetailView(props: {
  profile: UserProfile;
  state: ConglomeradoViewState;
  group?: ConglomeradoWithStats;
  allGroups: ReadonlyArray<ConglomeradoWithStats>;
  allOrganizaciones: ReadonlyArray<OrganizacionEntity>;
  auditPrograms: ReadonlyArray<ProgramaAuditoriaEntity>;
  isStaff: boolean;
  tableColumnWidths?: Record<string, Record<string, number>>;
}): string {
  const {
    profile,
    state,
    group,
    allGroups,
    allOrganizaciones,
    auditPrograms,
    isStaff,
    tableColumnWidths,
  } = props;

  const mode = resolveConglomeradoDetailMode(state, isStaff, group);
  const isCreateMode = mode === 'add';
  const isReadOnly = mode === 'read';

  const draft: ConglomeradoFormDraft =
    mode === 'add'
      ? state.formDraft ?? createEmptyConglomeradoFormDraft()
      : mode === 'edit'
      ? state.formDraft ??
        (group ? createConglomeradoDraftFromEntity(group) : createEmptyConglomeradoFormDraft())
      : group
      ? createConglomeradoDraftFromEntity(group)
      : createEmptyConglomeradoFormDraft();

  const memberOrgs = group ? group.organizaciones : [];
  const memberOrgIds = new Set(memberOrgs.map((o) => o.id));
  const memberOrgNames = new Set(memberOrgs.map((o) => o.nombre.trim().toLowerCase()));

  const linkedPrograms = group
    ? auditPrograms.filter(
        (prog) =>
          !prog.deleted_at &&
          prog.auditorias.some(
            (aud) =>
              (aud.id_organizacion && memberOrgIds.has(aud.id_organizacion)) ||
              memberOrgNames.has(aud.organizacion_nombre.trim().toLowerCase())
          )
      )
    : [];

  const customTopActionsHtml = isStaff
    ? renderDetailFormTopActions({
        mode,
        isStaff: true,
        formId: 'conglomeradoDetailForm',
        saveBtnId: 'saveConglomeradoFormBtn',
        cancelBtnId: 'cancelEditConglomeradoBtn',
        editBtnId: 'startEditConglomeradoBtn',
        saveTitle: isCreateMode ? 'Crear conglomerado' : 'Guardar cambios',
        cancelTitle: isCreateMode ? 'Cancelar creación' : 'Cancelar edición',
        editTitle: 'Editar conglomerado',
        showHistoryBtn: !isCreateMode,
        showArchiveBtn: !isCreateMode && canArchiveRecord(profile),
        extraAuditAttrs: group
          ? `data-table-name="grupo_empresarial" data-record-id="${escapeHtml(group.id)}" data-entity-name="${escapeHtml(group.nombre)}"`
          : '',
        extraArchiveAttrs: group
          ? `data-archive-table="grupo_empresarial" data-archive-id="${escapeHtml(group.id)}" data-archive-entity-label="Conglomerado" data-archive-title="${escapeHtml(group.nombre)}" data-archive-subtitle="${escapeHtml(group.codigo_grupo || (group.es_individual_auto ? 'Grupo individual 1:1' : 'Corporativo'))}"`
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
    isReadOnly && group
      ? renderReadOnlyConglomeradoAttributes(group)
      : renderConglomeradoFormBody(draft);

  const activeTab: ConglomeradoChildTab =
    state.activeChildTab === 'vinculos' ? 'vinculos' : 'organizaciones';

  const childTabs = isCreateMode
    ? []
    : [
        {
          id: 'organizaciones',
          label: 'Organizaciones miembro',
          symbol: '🏢',
          count: memberOrgs.length,
        },
        {
          id: 'vinculos',
          label: 'Vínculos de Auditoría asociados',
          symbol: '🔗',
          count: linkedPrograms.length,
        },
      ];

  const statusLabel =
    group?.bucketKind === 'MULTI_ORG'
      ? `Multi-empresa (${group.organizacionesCount} orgs)`
      : group?.bucketKind === 'SOLO'
      ? 'Sola (1 org)'
      : 'Vacío (0 orgs)';
  const statusBadgeClass =
    group?.bucketKind === 'MULTI_ORG'
      ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
      : 'bg-slate-100 text-slate-700 border-slate-200';

  return renderDetailPageTemplate({
    entityType: 'Conglomerado Empresarial',
    entitySymbol: '🏛️',
    title: isCreateMode ? 'Nuevo Conglomerado' : group ? group.nombre : 'Conglomerado',
    eyebrowCode: !isCreateMode && group?.codigo_grupo ? group.codigo_grupo : undefined,
    subtitle: isCreateMode
      ? 'Agrupación corporativa para gestión multi-empresa y programas combinados Nivel 2.'
      : group
      ? `${group.organizacionesCount} organización${group.organizacionesCount === 1 ? '' : 'es'} · ${group.certificadosCount} certificado${group.certificadosCount === 1 ? '' : 's'}`
      : undefined,
    statusBadge: !isCreateMode && group
      ? {
          label: statusLabel,
          badgeClass: statusBadgeClass,
        }
      : undefined,
    backButton: {
      label: 'Volver',
      nav: 'certificacion',
      subview: 'conglomerados',
      action: 'back-to-conglomerado-list',
    },
    isCreateMode,
    customTopActionsHtml,
    parents: [],
    tableName: 'grupo_empresarial',
    recordId: group?.id || 'conglomerado-new',
    feedbackHtml,
    attributes: [],
    customRecordBodyHtml,
    childTabs,
    activeChildTabId: activeTab,
    childTabAttrName: 'data-conglomerado-tab',
    renderChildTabContent: (tabId) => {
      if (!group) return '';
      if (tabId === 'vinculos') {
        return renderChildProgramsTable(linkedPrograms, group, tableColumnWidths);
      }
      return renderChildOrgsAndRebucketPanel({
        group,
        allGroups,
        allOrganizaciones,
        isStaff,
        rebucketTargetOrgId: state.rebucketTargetOrgId || '',
        rebucketErrorMessage: state.rebucketErrorMessage || null,
        tableColumnWidths,
      });
    },
  });
}

function renderReadOnlyConglomeradoAttributes(group: ConglomeradoWithStats): string {
  const codeDisplay = group.codigo_grupo
    ? group.codigo_grupo
    : group.es_individual_auto
    ? 'Auto 1:1'
    : 'Sin código asignado';
  const compositionDisplay =
    group.bucketKind === 'MULTI_ORG'
      ? `Multi-empresa (${group.organizacionesCount} organizaciones)`
      : group.bucketKind === 'SOLO'
      ? 'Sola (1 organización)'
      : 'Vacío (0 organizaciones)';

  return `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
      <div class="sm:col-span-2 bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Nombre del Conglomerado</span>
        <p class="text-xs font-bold text-slate-900">${escapeHtml(group.nombre)}</p>
      </div>
      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Código Grupo</span>
        <p class="text-xs font-mono font-bold text-slate-900">${escapeHtml(codeDisplay)}</p>
      </div>
      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Composición y Certificados</span>
        <p class="text-xs font-bold text-slate-900 tabular-nums">${escapeHtml(compositionDisplay)} · ${group.certificadosCount} ${
          group.certificadosCount === 1 ? 'certificado' : 'certificados'
        }</p>
      </div>
      <div class="sm:col-span-2 lg:col-span-4 bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Notas Corporativas</span>
        <p class="text-xs font-medium text-slate-700">${escapeHtml(group.notas || 'Sin notas corporativas registradas')}</p>
      </div>
    </div>
  `;
}

function renderConglomeradoFormBody(draft: ConglomeradoFormDraft): string {
  return `
    <form id="conglomeradoDetailForm" class="space-y-3" novalidate>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div class="md:col-span-2 bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
          <label for="conglomeradoNombreInput" class="block text-xs font-bold text-slate-700">
            Nombre del Conglomerado <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <input
            type="text"
            id="conglomeradoNombreInput"
            name="nombre"
            required
            maxlength="200"
            value="${escapeHtml(draft.nombre)}"
            placeholder="Ej. Holding Corporativo Andino"
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
          />
        </div>

        <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
          <label for="conglomeradoCodigoInput" class="block text-xs font-bold text-slate-700">
            Código de Grupo
          </label>
          <input
            type="text"
            id="conglomeradoCodigoInput"
            name="codigo_grupo"
            maxlength="40"
            value="${escapeHtml(draft.codigo_grupo)}"
            placeholder="Ej. CONG-CORP-01"
            class="w-full text-xs font-mono p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
          />
        </div>
      </div>

      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
        <label for="conglomeradoNotasInput" class="block text-xs font-bold text-slate-700">
          Notas Corporativas
        </label>
        <textarea
          id="conglomeradoNotasInput"
          name="notas"
          rows="2"
          placeholder="Observaciones sobre estructura societaria o elegibilidad Nivel 2..."
          class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
        >${escapeHtml(draft.notas)}</textarea>
      </div>
    </form>
  `;
}

function renderChildOrgsAndRebucketPanel(opts: {
  group: ConglomeradoWithStats;
  allGroups: ReadonlyArray<ConglomeradoWithStats>;
  allOrganizaciones: ReadonlyArray<OrganizacionEntity>;
  isStaff: boolean;
  rebucketTargetOrgId: string;
  rebucketErrorMessage: string | null;
  tableColumnWidths?: Record<string, Record<string, number>>;
}): string {
  const {
    group,
    allGroups,
    allOrganizaciones,
    isStaff,
    rebucketTargetOrgId,
    rebucketErrorMessage,
    tableColumnWidths,
  } = opts;

  const groupNameById = new Map<string, string>();
  for (const g of allGroups) {
    groupNameById.set(g.id, g.nombre);
  }

  const candidateOrgs = allOrganizaciones
    .filter((o) => !o.deleted_at && o.id_grupo_empresarial !== group.id)
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  const selectedPlan =
    isStaff && rebucketTargetOrgId
      ? planOrganizationRebucket(rebucketTargetOrgId, group.id, allOrganizaciones, allGroups)
      : null;

  let rebucketPreviewHtml = '';
  if (rebucketErrorMessage) {
    rebucketPreviewHtml = `
      <p role="alert" class="text-xs font-semibold text-rose-700 mt-1.5">
        ⚠️ ${escapeHtml(rebucketErrorMessage)}
      </p>
    `;
  } else if (selectedPlan) {
    if (!selectedPlan.valid && selectedPlan.errorMessage) {
      rebucketPreviewHtml = `
        <p role="alert" class="text-xs font-semibold text-rose-700 mt-1.5">
          ⚠️ ${escapeHtml(selectedPlan.errorMessage)}
        </p>
      `;
    } else if (selectedPlan.valid) {
      const sourceName =
        groupNameById.get(selectedPlan.sourceGroupId) || 'Conglomerado origen';
      rebucketPreviewHtml = selectedPlan.willArchiveSourceGroup
        ? `
          <p class="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-2">
            El conglomerado origen («${escapeHtml(sourceName)}») quedará vacío y se archivará automáticamente.
          </p>
        `
        : `
          <p class="text-xs font-medium text-sky-800 bg-sky-50 border border-sky-200 rounded-lg px-2.5 py-1.5 mt-2">
            Se trasladará desde «${escapeHtml(sourceName)}» (conservará ${selectedPlan.sourceRemainingOrgCount} organización${selectedPlan.sourceRemainingOrgCount === 1 ? '' : 'es'}).
          </p>
        `;
    }
  }

  const rebucketPanelHtml = isStaff
    ? `
      <div class="mb-3 bg-slate-50/80 border border-slate-200 rounded-xl p-3 space-y-2">
        <div class="flex flex-col sm:flex-row sm:items-end gap-2">
          <div class="flex-1 min-w-0 space-y-1">
            <label for="rebucketOrgSelect" class="block text-xs font-bold text-slate-700">
              Mover otra organización sola o externa a este conglomerado
            </label>
            <select
              id="rebucketOrgSelect"
              name="rebucketTargetOrgId"
              class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
            >
              <option value="">Seleccionar organización para re-agrupar...</option>
              ${candidateOrgs
                .map((org) => {
                  const sourceName =
                    (org.id_grupo_empresarial && groupNameById.get(org.id_grupo_empresarial)) ||
                    org.grupo_empresarial_nombre ||
                    'Grupo actual';
                  const isSoloSource = allGroups.some(
                    (g) => g.id === org.id_grupo_empresarial && g.bucketKind === 'SOLO'
                  );
                  const suffix = isSoloSource ? `Sola · ${sourceName}` : sourceName;
                  return `<option value="${escapeHtml(org.id)}" ${
                    org.id === rebucketTargetOrgId ? 'selected' : ''
                  }>${escapeHtml(org.nombre)} (${escapeHtml(suffix)})</option>`;
                })
                .join('')}
            </select>
          </div>
          <button
            type="button"
            id="confirmRebucketOrgBtn"
            data-action="confirm-rebucket-org"
            data-target-conglomerado-id="${escapeHtml(group.id)}"
            ${!selectedPlan?.valid ? 'disabled' : ''}
            class="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              selectedPlan?.valid
                ? 'bg-slate-900 hover:bg-slate-800 text-white cursor-pointer'
                : 'bg-slate-200 text-slate-500 cursor-not-allowed'
            }"
          >
            <span>Mover a este conglomerado</span>
          </button>
        </div>
        ${rebucketPreviewHtml}
      </div>
    `
    : '';

  if (group.organizaciones.length === 0) {
    return `
      ${rebucketPanelHtml}
      <div class="p-8 text-center bg-slate-50/70 border border-slate-200 rounded-xl space-y-2">
        <div class="text-2xl" aria-hidden="true">🏢</div>
        <h4 class="text-xs font-bold text-slate-800">Sin organizaciones miembro</h4>
        <p class="text-xs text-slate-500 max-w-sm mx-auto">
          Este conglomerado no posee empresas activas asociadas actualmente.
        </p>
      </div>
    `;
  }

  const columns: ColumnDefinition<OrganizacionEntity>[] = [
    {
      id: 'nombre',
      header: 'Organización',
      defaultWidthPct: 44,
      minWidthPx: 180,
      renderCell: (org) =>
        `<span class="font-bold text-slate-900 truncate block" title="${escapeHtml(org.nombre)}">${escapeHtml(org.nombre)}</span>`,
    },
    {
      id: 'rif',
      header: 'RIF / NIF',
      defaultWidthPct: 22,
      minWidthPx: 110,
      renderCell: (org) =>
        `<span class="font-mono text-slate-700 whitespace-nowrap">${escapeHtml(
          org.rif && org.rif !== 'RIF No Registrado' ? org.rif : 'Sin RIF'
        )}</span>`,
    },
    {
      id: 'sector',
      header: 'Sector / Dirección',
      defaultWidthPct: 20,
      minWidthPx: 120,
      renderCell: (org) =>
        `<span class="text-slate-600 truncate block">${escapeHtml(
          org.sector_principal || org.direccion_fiscal || 'No especificado'
        )}</span>`,
    },
    {
      id: 'certificados',
      header: 'Certificados',
      align: 'right',
      defaultWidthPct: 14,
      minWidthPx: 95,
      renderCell: (org) => {
        const count = org.certificados_count ?? 0;
        return `<span class="tabular-nums font-semibold text-slate-800 whitespace-nowrap">${count} ${
          count === 1 ? 'cert' : 'certs'
        }</span>`;
      },
    },
  ];

  return `
    ${rebucketPanelHtml}
    ${renderListViewTable({
      tableId: 'conglomerado-tab-organizaciones',
      columns,
      items: group.organizaciones,
      columnWidths: tableColumnWidths?.['conglomerado-tab-organizaciones'],
      getRowAttrs: (org) =>
        `data-action="open-org-from-conglomerado" data-org-id="${escapeHtml(org.id)}" title="Abrir organización ${escapeHtml(org.nombre)}"`,
    })}
  `;
}

function renderChildProgramsTable(
  programs: ReadonlyArray<ProgramaAuditoriaEntity>,
  group: ConglomeradoWithStats,
  tableColumnWidths?: Record<string, Record<string, number>>
): string {
  if (programs.length === 0) {
    return `
      <div class="p-8 text-center bg-slate-50/70 border border-slate-200 rounded-xl space-y-2">
        <div class="text-2xl" aria-hidden="true">🔗</div>
        <h4 class="text-xs font-bold text-slate-800">Sin programas o vínculos de auditoría</h4>
        <p class="text-xs text-slate-500 max-w-sm mx-auto">
          Ningún programa de auditoría está vinculado actualmente a las organizaciones de ${escapeHtml(group.nombre)}.
        </p>
      </div>
    `;
  }

  const columns: ColumnDefinition<ProgramaAuditoriaEntity>[] = [
    {
      id: 'programa',
      header: 'Programa de Auditoría',
      defaultWidthPct: 36,
      minWidthPx: 170,
      renderCell: (prog) => `
        <div class="min-w-0">
          <span class="block font-bold text-slate-900 truncate">${escapeHtml(prog.etiqueta)}</span>
          ${
            prog.codigo_programa
              ? `<span class="block text-[11px] font-mono text-slate-500 truncate">${escapeHtml(prog.codigo_programa)}</span>`
              : ''
          }
        </div>
      `,
    },
    {
      id: 'nivel',
      header: 'Nivel de Vinculación',
      defaultWidthPct: 24,
      minWidthPx: 130,
      renderCell: (prog) => {
        const label =
          prog.nivel_vinculacion === 'NIVEL_2_INTER_ORG'
            ? 'Nivel 2 · Inter-Org'
            : prog.nivel_vinculacion === 'NIVEL_1_INTRA_ORG'
            ? 'Nivel 1 · Intra-Org'
            : 'Individual';
        return `<span class="font-semibold text-slate-700 whitespace-nowrap">${escapeHtml(label)}</span>`;
      },
    },
    {
      id: 'empresas',
      header: 'Organizaciones',
      defaultWidthPct: 26,
      minWidthPx: 140,
      renderCell: (prog) => {
        const orgNames = Array.from(
          new Set(prog.auditorias.map((a) => a.organizacion_nombre).filter(Boolean))
        ).join(' · ');
        return `<span class="text-slate-600 truncate block" title="${escapeHtml(orgNames)}">${escapeHtml(
          orgNames || '—'
        )}</span>`;
      },
    },
    {
      id: 'auditorias',
      header: 'Auditorías',
      align: 'right',
      defaultWidthPct: 14,
      minWidthPx: 90,
      renderCell: (prog) =>
        `<span class="tabular-nums font-semibold text-slate-800 whitespace-nowrap">${prog.auditorias.length}</span>`,
    },
  ];

  return renderListViewTable({
    tableId: 'conglomerado-tab-vinculos',
    columns,
    items: [...programs],
    columnWidths: tableColumnWidths?.['conglomerado-tab-vinculos'],
    getRowAttrs: (prog) => {
      const firstAuditId = prog.auditorias[0]?.id || '';
      return `data-action="open-program-from-conglomerado" data-program-id="${escapeHtml(prog.id)}" data-audit-id="${escapeHtml(firstAuditId)}" title="Abrir programa ${escapeHtml(prog.etiqueta)}"`;
    },
  });
}
