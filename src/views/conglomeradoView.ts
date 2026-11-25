import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import type { OrganizacionEntity } from '../lib/activeCertificates';
import type { ProgramaAuditoriaEntity } from '../lib/auditPlanningEngine';
import type { Phase5FindingEntity, ProgramacionAuditEntity } from '../lib/auditExecution';
import type { AuditoriaSitioTemporalEntity } from '../lib/designacionTemporalDomain';
import type { AlertConfigEntity } from '../lib/auditAlertsEngine';
import {
  formatAuditCodename,
  getAuditCodenameTooltip,
  resolveShortConglomeradoName,
  resolveShortOrganizacionName,
} from '../lib/codenameDomain';
import {
  buildConglomeradoAuditsList,
  computeOrgActiveCertificatesMap,
  createConglomeradoDraftFromEntity,
  createEmptyConglomeradoFormDraft,
  getEligibleSoloOrganizationsForRebucket,
  planOrganizationRebucket,
  validateOrganizationDetachFromConglomerado,
  type ActiveCertCountingRef,
  type ConglomeradoAuditListItem,
  type ConglomeradoFormDraft,
  type ConglomeradoVinculoRef,
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

export type ConglomeradoChildTab = 'organizaciones' | 'auditorias' | 'vinculos';
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
  detachTargetOrgId?: string | null;
  detachErrorMessage?: string | null;
}

export interface ConglomeradoViewProps {
  profile: UserProfile;
  state: ConglomeradoViewState;
  conglomerados: ReadonlyArray<ConglomeradoWithStats>;
  allOrganizaciones?: ReadonlyArray<OrganizacionEntity>;
  certificados?: ReadonlyArray<ActiveCertCountingRef>;
  auditPrograms?: ReadonlyArray<ProgramaAuditoriaEntity>;
  programacionAudits?: ReadonlyArray<ProgramacionAuditEntity>;
  vinculos?: ReadonlyArray<ConglomeradoVinculoRef>;
  temporalSites?: ReadonlyArray<AuditoriaSitioTemporalEntity>;
  phase5Findings?: ReadonlyArray<Phase5FindingEntity>;
  alertConfig?: AlertConfigEntity;
  authorizedClientOrgIds?: ReadonlyArray<string>;
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
    certificados,
    auditPrograms = [],
    programacionAudits = [],
    vinculos = [],
    temporalSites = [],
    phase5Findings = [],
    alertConfig,
    authorizedClientOrgIds = [],
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
        certificados,
        auditPrograms,
        programacionAudits,
        vinculos,
        temporalSites,
        phase5Findings,
        alertConfig,
        authorizedClientOrgIds,
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
      certificados,
      auditPrograms,
      programacionAudits,
      vinculos,
      temporalSites,
      phase5Findings,
      alertConfig,
      authorizedClientOrgIds,
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
        g.abreviacion || '',
        resolveShortConglomeradoName(g),
        g.codigo_grupo || '',
        g.organizaciones
          .map((o) => `${o.nombre} ${o.abreviacion || ''} ${resolveShortOrganizacionName(o)}`)
          .join(' '),
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
        const shortName = resolveShortConglomeradoName(g);
        const subParts = [
          shortName !== g.nombre ? g.nombre : '',
          g.codigo_grupo || (g.es_individual_auto ? 'Auto 1:1' : 'Corporativo'),
        ].filter(Boolean);
        const showDistinctAbrev =
          Boolean(g.abreviacion) &&
          g.abreviacion!.trim().toLowerCase() !== shortName.trim().toLowerCase();
        return `
          <div class="min-w-0">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="font-bold text-slate-900 truncate" title="${escapeHtml(g.nombre)}">${escapeHtml(shortName)}</span>
              ${
                showDistinctAbrev
                  ? `<span class="inline-flex items-center px-1.5 py-0.2 rounded border border-indigo-200 bg-indigo-50 text-[10px] font-mono font-bold text-indigo-800 shrink-0">${escapeHtml(g.abreviacion!)}</span>`
                  : ''
              }
            </div>
            <span class="block text-[11px] text-slate-500 truncate" title="${escapeHtml(g.nombre)}">${escapeHtml(subParts.join(' · '))}</span>
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
        if (g.organizaciones.length === 0) {
          return '<span class="block text-slate-400 truncate">Sin empresas vinculadas</span>';
        }
        const namesTooltip = g.organizaciones
          .map((o) => (o.abreviacion ? `[${o.abreviacion}] ${o.nombre}` : o.nombre))
          .join(' · ');
        const itemsHtml = g.organizaciones
          .map((o) => {
            const orgShort = resolveShortOrganizacionName(o);
            if (o.abreviacion && o.abreviacion.trim().toLowerCase() === orgShort.trim().toLowerCase()) {
              return `<span class="inline-flex items-center px-1.5 py-0.5 rounded border border-slate-200 bg-slate-100 text-[10px] font-mono font-bold text-slate-700 mr-1.5" title="${escapeHtml(o.nombre)}">${escapeHtml(orgShort)}</span>`;
            }
            const abrevBadge = o.abreviacion
              ? `<span class="inline-flex items-center px-1 py-0.5 rounded border border-slate-200 bg-slate-100 text-[10px] font-mono font-bold text-slate-700 mr-1">${escapeHtml(o.abreviacion)}</span>`
              : '';
            return `<span class="inline-flex items-center mr-2" title="${escapeHtml(o.nombre)}">${abrevBadge}<span class="text-slate-700">${escapeHtml(orgShort)}</span></span>`;
          })
          .join('');
        return `<div class="truncate" title="${escapeHtml(namesTooltip)}">${itemsHtml}</div>`;
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
    const shortName = resolveShortConglomeradoName(g);
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
        ? g.organizaciones
            .map((o) => (o.abreviacion ? `[${o.abreviacion}] ${o.nombre}` : o.nombre))
            .join(' · ')
        : 'Sin empresas asociadas';
    const orgBadgesHtml =
      g.organizaciones.length > 0
        ? g.organizaciones
            .slice(0, 3)
            .map((o) => {
              const orgShort = resolveShortOrganizacionName(o);
              if (o.abreviacion && o.abreviacion.trim().toLowerCase() === orgShort.trim().toLowerCase()) {
                return `
                  <span class="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-100 font-mono text-[10px] font-bold text-slate-700 truncate max-w-[160px]" title="${escapeHtml(o.nombre)}">${escapeHtml(orgShort)}</span>
                `;
              }
              return `
                <span class="inline-flex items-center gap-1 text-[11px] text-slate-700" title="${escapeHtml(o.nombre)}">
                  ${
                    o.abreviacion
                      ? `<span class="px-1 py-0.5 rounded border border-slate-200 bg-slate-100 font-mono text-[10px] font-bold text-slate-700">${escapeHtml(o.abreviacion)}</span>`
                      : ''
                  }
                  <span class="truncate max-w-[160px]">${escapeHtml(orgShort)}</span>
                </span>
              `;
            })
            .join('<span class="text-slate-300">·</span>')
        : '<span class="text-xs text-slate-500">Sin empresas asociadas</span>';

    const showDistinctCardAbrev =
      Boolean(g.abreviacion) &&
      g.abreviacion!.trim().toLowerCase() !== shortName.trim().toLowerCase();

    return `
      <article
        data-action="select-conglomerado"
        data-conglomerado-id="${escapeHtml(g.id)}"
        tabindex="0"
        role="button"
        title="${escapeHtml(g.nombre)}"
        aria-label="Abrir conglomerado ${escapeHtml(shortName)}"
        class="group bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-400 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between gap-3"
      >
        <div class="space-y-2">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="flex items-center gap-1.5 min-w-0">
                <p class="text-[11px] font-mono text-slate-500 truncate">${escapeHtml(codeLabel)}</p>
                ${
                  showDistinctCardAbrev
                    ? `<span class="px-1.5 py-0.2 rounded border border-indigo-200 bg-indigo-50 text-[10px] font-mono font-bold text-indigo-800 shrink-0">${escapeHtml(g.abreviacion!)}</span>`
                    : ''
                }
              </div>
              <h3 class="text-sm font-bold text-slate-900 group-hover:text-sky-800 transition-colors line-clamp-2" title="${escapeHtml(g.nombre)}">
                ${escapeHtml(shortName)}
              </h3>
              ${
                shortName !== g.nombre
                  ? `<p class="text-[11px] text-slate-500 truncate" title="${escapeHtml(g.nombre)}">${escapeHtml(g.nombre)}</p>`
                  : ''
              }
            </div>
            <span class="text-[11px] font-semibold whitespace-nowrap ${
              g.bucketKind === 'MULTI_ORG' ? 'text-indigo-700' : 'text-slate-600'
            }">
              ${escapeHtml(compositionLabel)}
            </span>
          </div>
          <div class="flex flex-wrap items-center gap-1.5" title="${escapeHtml(orgNames)}">
            ${orgBadgesHtml}
          </div>
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
    subtitle: 'Agrupaciones corporativas e individuales 1:1 para vinculación Nivel 2.',
    entityLabel: 'conglomerados',
    searchQuery: state.query,
    searchPlaceholder: 'Buscar conglomerado, abreviación o empresa...',
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
  certificados?: ReadonlyArray<ActiveCertCountingRef>;
  auditPrograms: ReadonlyArray<ProgramaAuditoriaEntity>;
  programacionAudits: ReadonlyArray<ProgramacionAuditEntity>;
  vinculos: ReadonlyArray<ConglomeradoVinculoRef>;
  temporalSites: ReadonlyArray<AuditoriaSitioTemporalEntity>;
  phase5Findings: ReadonlyArray<Phase5FindingEntity>;
  alertConfig?: AlertConfigEntity;
  authorizedClientOrgIds: ReadonlyArray<string>;
  isStaff: boolean;
  tableColumnWidths?: Record<string, Record<string, number>>;
}): string {
  const {
    profile,
    state,
    group,
    allGroups,
    allOrganizaciones,
    certificados,
    auditPrograms,
    programacionAudits,
    vinculos,
    temporalSites,
    phase5Findings,
    alertConfig,
    authorizedClientOrgIds,
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

  const activeCertCountByOrgId =
    certificados !== undefined ? computeOrgActiveCertificatesMap(certificados) : null;

  const memberOrgs = group ? group.organizaciones : [];
  const activeGroupCertsCount = group
    ? activeCertCountByOrgId
      ? memberOrgs.reduce((acc, o) => acc + (activeCertCountByOrgId.get(o.id) ?? 0), 0)
      : group.certificadosCount
    : 0;

  const groupAudits = group
    ? buildConglomeradoAuditsList({
        group,
        auditPrograms,
        programacionAudits,
        certificados,
        vinculos,
        temporalSites,
        findings: phase5Findings,
        alertConfig,
        profile,
        authorizedClientOrgIds,
      })
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
      ? renderReadOnlyConglomeradoAttributes(group, activeGroupCertsCount, activeCertCountByOrgId !== null)
      : renderConglomeradoFormBody(draft);

  const activeTab: 'organizaciones' | 'auditorias' =
    state.activeChildTab === 'auditorias' || state.activeChildTab === 'vinculos'
      ? 'auditorias'
      : 'organizaciones';

  const childTabs = isCreateMode
    ? []
    : [
        {
          id: 'organizaciones',
          label: 'Organizaciones',
          symbol: '🏢',
          count: memberOrgs.length,
        },
        {
          id: 'auditorias',
          label: 'Auditorías',
          symbol: '🗓️',
          count: groupAudits.length,
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

  const certsSuffix =
    activeCertCountByOrgId !== null
      ? activeGroupCertsCount === 1
        ? 'certificado activo'
        : 'certificados activos'
      : activeGroupCertsCount === 1
      ? 'certificado'
      : 'certificados';

  const detailShortName = group ? resolveShortConglomeradoName(group) : '';
  return renderDetailPageTemplate({
    entityType: 'Conglomerado Empresarial',
    entitySymbol: '🏛️',
    title: isCreateMode
      ? 'Nuevo Conglomerado'
      : group
      ? detailShortName
      : 'Conglomerado',
    eyebrowCode:
      !isCreateMode && (group?.abreviacion || group?.codigo_grupo)
        ? [group.abreviacion, group.codigo_grupo].filter(Boolean).join(' · ')
        : undefined,
    subtitle: isCreateMode
      ? 'Agrupación corporativa para gestión multi-empresa Nivel 2.'
      : group
      ? `${group.nombre !== detailShortName ? `${group.nombre} · ` : ''}${group.organizacionesCount} organización${group.organizacionesCount === 1 ? '' : 'es'} · ${activeGroupCertsCount} ${certsSuffix}`
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
      if (tabId === 'auditorias' || tabId === 'vinculos') {
        return renderChildAuditsTable(groupAudits, group, tableColumnWidths);
      }
      return renderChildOrgsAndRebucketPanel({
        group,
        allGroups,
        allOrganizaciones,
        activeCertCountByOrgId,
        vinculos,
        auditPrograms,
        isStaff,
        rebucketTargetOrgId: state.rebucketTargetOrgId || '',
        rebucketErrorMessage: state.rebucketErrorMessage || null,
        detachTargetOrgId: state.detachTargetOrgId || '',
        detachErrorMessage: state.detachErrorMessage || null,
        tableColumnWidths,
      });
    },
  });
}

function renderReadOnlyConglomeradoAttributes(
  group: ConglomeradoWithStats,
  certsCount: number,
  usesActiveCount: boolean
): string {
  const codeDisplay = group.codigo_grupo
    ? group.codigo_grupo
    : group.es_individual_auto
    ? 'Auto 1:1'
    : 'Sin código asignado';
  const shortDisplay = resolveShortConglomeradoName(group);
  const compositionDisplay =
    group.bucketKind === 'MULTI_ORG'
      ? `Multi-empresa (${group.organizacionesCount} organizaciones)`
      : group.bucketKind === 'SOLO'
      ? 'Sola (1 organización)'
      : 'Vacío (0 organizaciones)';
  const certsNoun = usesActiveCount
    ? certsCount === 1
      ? 'certificado activo'
      : 'certificados activos'
    : certsCount === 1
    ? 'certificado'
    : 'certificados';

  return `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Nombre Corto / Abrev.</span>
        <p class="text-xs font-bold text-indigo-800">${escapeHtml(shortDisplay)}${
          !group.abreviacion ? ' <span class="text-[10px] font-normal text-slate-500">(auto)</span>' : ''
        }</p>
      </div>
      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Nombre Legal</span>
        <p class="text-xs font-bold text-slate-900">${escapeHtml(group.nombre)}</p>
      </div>
      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Código Grupo</span>
        <p class="text-xs font-mono font-bold text-slate-900">${escapeHtml(codeDisplay)}</p>
      </div>
      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Composición y Certificados</span>
        <p class="text-xs font-bold text-slate-900 tabular-nums">${escapeHtml(compositionDisplay)} · ${certsCount} ${certsNoun}</p>
      </div>
      <div class="sm:col-span-2 lg:col-span-4 bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Notas Corporativas</span>
        <p class="text-xs font-medium text-slate-700">${escapeHtml(group.notas || 'Sin notas corporativas registradas')}</p>
      </div>
    </div>
  `;
}

function renderConglomeradoFormBody(draft: ConglomeradoFormDraft): string {
  const autoHint = resolveShortConglomeradoName({
    nombre: draft.nombre || 'Holding Corporativo Andino',
    codigo_grupo: draft.codigo_grupo,
  });
  return `
    <form id="conglomeradoDetailForm" class="space-y-3" novalidate>
      <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
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
          <label for="conglomeradoAbreviacionInput" class="block text-xs font-bold text-slate-700">
            Abreviación / Nombre Corto
          </label>
          <input
            type="text"
            id="conglomeradoAbreviacionInput"
            name="abreviacion"
            maxlength="24"
            value="${escapeHtml(draft.abreviacion)}"
            placeholder="${escapeHtml(autoHint)} (auto si vacío)"
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
  activeCertCountByOrgId: Map<string, number> | null;
  vinculos: ReadonlyArray<ConglomeradoVinculoRef>;
  auditPrograms: ReadonlyArray<ProgramaAuditoriaEntity>;
  isStaff: boolean;
  rebucketTargetOrgId: string;
  rebucketErrorMessage: string | null;
  detachTargetOrgId: string;
  detachErrorMessage: string | null;
  tableColumnWidths?: Record<string, Record<string, number>>;
}): string {
  const {
    group,
    allGroups,
    allOrganizaciones,
    activeCertCountByOrgId,
    vinculos,
    auditPrograms,
    isStaff,
    rebucketTargetOrgId,
    rebucketErrorMessage,
    detachTargetOrgId,
    detachErrorMessage,
    tableColumnWidths,
  } = opts;

  const groupNameById = new Map<string, string>();
  for (const g of allGroups) {
    groupNameById.set(g.id, g.nombre);
  }

  const candidateSoloOptions = getEligibleSoloOrganizationsForRebucket(allGroups, group.id);
  const candidateOrgIdSet = new Set(candidateSoloOptions.map((item) => item.organizacion.id));

  const selectedPlan =
    isStaff && rebucketTargetOrgId
      ? candidateOrgIdSet.has(rebucketTargetOrgId)
        ? planOrganizationRebucket(rebucketTargetOrgId, group.id, allOrganizaciones, allGroups)
        : {
            valid: false,
            errorMessage:
              'Solo se pueden incorporar organizaciones individuales (SOLO) que no pertenezcan a otro conglomerado multi-empresa.',
            organizationId: rebucketTargetOrgId,
            sourceGroupId: '',
            targetGroupId: group.id,
            willArchiveSourceGroup: false,
            sourceRemainingOrgCount: 0,
            targetNewOrgCount: group.organizaciones.length,
          }
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

  const rebucketPanelHtml = `
    <div class="bg-slate-50/80 border border-slate-200 rounded-xl p-3 space-y-2">
      <div class="flex flex-col sm:flex-row sm:items-end gap-2">
        <div class="flex-1 min-w-0 space-y-1">
          <label for="rebucketOrgSelect" class="block text-xs font-bold text-slate-700">
            Incorporar organización individual (SOLO)
          </label>
          <select
            id="rebucketOrgSelect"
            name="rebucketTargetOrgId"
            ${candidateSoloOptions.length === 0 ? 'disabled' : ''}
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
          >
            <option value="">${
              candidateSoloOptions.length === 0
                ? 'No hay organizaciones individuales (SOLO) disponibles'
                : 'Seleccionar organización individual para incorporar...'
            }</option>
            ${candidateSoloOptions
              .map(({ organizacion, sourceGroupName }) => {
                const abrevPrefix = organizacion.abreviacion
                  ? `[${organizacion.abreviacion}] `
                  : '';
                return `<option value="${escapeHtml(organizacion.id)}" ${
                  organizacion.id === rebucketTargetOrgId ? 'selected' : ''
                }>${escapeHtml(abrevPrefix)}${escapeHtml(organizacion.nombre)} (Sola · ${escapeHtml(sourceGroupName)})</option>`;
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
          <span>Incorporar al conglomerado</span>
        </button>
      </div>
      ${rebucketPreviewHtml}
    </div>
  `;

  const canDetach = isStaff && group.organizaciones.length > 1;
  const detachValidation =
    canDetach && detachTargetOrgId
      ? validateOrganizationDetachFromConglomerado({
          group,
          orgId: detachTargetOrgId,
          vinculos,
          auditPrograms,
        })
      : null;

  let detachFeedbackHtml = '';
  if (detachErrorMessage) {
    detachFeedbackHtml = `
      <p role="alert" class="text-xs font-semibold text-rose-700 mt-1.5">
        ⚠️ ${escapeHtml(detachErrorMessage)}
      </p>
    `;
  } else if (detachValidation) {
    if (!detachValidation.valid && detachValidation.errorMessage) {
      detachFeedbackHtml = `
        <p role="alert" class="text-xs font-semibold text-rose-700 mt-1.5">
          ⚠️ ${escapeHtml(detachValidation.errorMessage)}
        </p>
      `;
    } else if (detachValidation.valid && detachValidation.organization) {
      detachFeedbackHtml = `
        <p class="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-2">
          Se creará un conglomerado individual 1:1 para «${escapeHtml(
            detachValidation.organization.nombre
          )}» sin afectar sus certificados ni auditorías.
        </p>
      `;
    }
  }

  const detachPanelHtml = canDetach
    ? `
      <div class="bg-slate-50/80 border border-slate-200 rounded-xl p-3 space-y-2">
        <div class="flex flex-col sm:flex-row sm:items-end gap-2">
          <div class="flex-1 min-w-0 space-y-1">
            <label for="detachOrgSelect" class="block text-xs font-bold text-slate-700">
              Separar organización del conglomerado
            </label>
            <select
              id="detachOrgSelect"
              name="detachTargetOrgId"
              class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
            >
              <option value="">Seleccionar organización miembro a separar...</option>
              ${group.organizaciones
                .map((org) => {
                  const abrevPrefix = org.abreviacion ? `[${org.abreviacion}] ` : '';
                  const versionMeta =
                    typeof org.version_actual_numero === 'number' && org.version_actual_numero > 0
                      ? ` · v${org.version_actual_numero}`
                      : '';
                  const rifMeta =
                    org.rif && org.rif !== 'RIF No Registrado' ? ` · ${org.rif}` : '';
                  return `<option value="${escapeHtml(org.id)}" ${
                    org.id === detachTargetOrgId ? 'selected' : ''
                  }>${escapeHtml(abrevPrefix)}${escapeHtml(org.nombre)}${escapeHtml(versionMeta)}${escapeHtml(rifMeta)}</option>`;
                })
                .join('')}
            </select>
          </div>
          <button
            type="button"
            id="confirmDetachOrgBtn"
            data-action="detach-org-from-conglomerado"
            data-conglomerado-id="${escapeHtml(group.id)}"
            ${!detachValidation?.valid ? 'disabled' : ''}
            class="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              detachValidation?.valid
                ? 'bg-rose-700 hover:bg-rose-800 text-white cursor-pointer'
                : 'bg-slate-200 text-slate-500 cursor-not-allowed'
            }"
          >
            <span>Separar del grupo</span>
          </button>
        </div>
        ${detachFeedbackHtml}
      </div>
    `
    : '';

  const staffControlsHtml = isStaff
    ? `
      <div class="mb-3 grid grid-cols-1 ${canDetach ? 'lg:grid-cols-2' : ''} gap-3">
        ${rebucketPanelHtml}
        ${detachPanelHtml}
      </div>
    `
    : '';

  if (group.organizaciones.length === 0) {
    return `
      ${staffControlsHtml}
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
      renderCell: (org) => {
        const abrevBadge = org.abreviacion
          ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded border border-slate-200 bg-slate-100 text-[10px] font-mono font-bold text-slate-700 shrink-0">${escapeHtml(org.abreviacion)}</span>`
          : '';
        const versionBadge =
          typeof org.version_actual_numero === 'number' && org.version_actual_numero > 0
            ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded border border-sky-200 bg-sky-50 text-[10px] font-mono font-bold text-sky-800 shrink-0">v${org.version_actual_numero}</span>`
            : '';
        const fullTitle = [
          org.abreviacion ? `[${org.abreviacion}]` : '',
          org.nombre,
          org.version_actual_numero ? `v${org.version_actual_numero}` : '',
        ]
          .filter(Boolean)
          .join(' ');
        return `
          <div class="flex items-center gap-1.5 min-w-0" title="${escapeHtml(fullTitle)}">
            ${abrevBadge}
            <span class="font-bold text-slate-900 truncate">${escapeHtml(org.nombre)}</span>
            ${versionBadge}
          </div>
        `;
      },
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
        const count =
          activeCertCountByOrgId !== null
            ? activeCertCountByOrgId.get(org.id) ?? 0
            : org.certificados_count ?? 0;
        const unit =
          activeCertCountByOrgId !== null
            ? count === 1
              ? 'activo'
              : 'activos'
            : count === 1
            ? 'cert'
            : 'certs';
        return `<span class="tabular-nums font-semibold text-slate-800 whitespace-nowrap">${count} ${unit}</span>`;
      },
    },
  ];

  return `
    ${staffControlsHtml}
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

function renderChildAuditsTable(
  audits: ReadonlyArray<ConglomeradoAuditListItem>,
  group: ConglomeradoWithStats,
  tableColumnWidths?: Record<string, Record<string, number>>
): string {
  if (audits.length === 0) {
    return `
      <div class="p-8 text-center bg-slate-50/70 border border-slate-200 rounded-xl space-y-2">
        <div class="text-2xl" aria-hidden="true">🗓️</div>
        <h4 class="text-xs font-bold text-slate-800">Sin auditorías asociadas</h4>
        <p class="text-xs text-slate-500 max-w-sm mx-auto">
          Ninguna auditoría activa está asociada actualmente a las organizaciones de ${escapeHtml(group.nombre)}.
        </p>
      </div>
    `;
  }

  const columns: ColumnDefinition<ConglomeradoAuditListItem>[] = [
    {
      id: 'certificado_org',
      header: 'Certificado & Org',
      defaultWidthPct: 32,
      minWidthPx: 180,
      renderCell: (item) => {
        const certVersionChip = item.certificado_version_numero
          ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded border border-indigo-200 bg-indigo-50 text-[10px] font-mono font-bold text-indigo-800 shrink-0">v${item.certificado_version_numero}</span>`
          : '';
        const orgAbrevBadge = item.organizacion_abreviacion
          ? `<span class="inline-flex items-center px-1 py-0.5 rounded border border-slate-200 bg-slate-100 text-[10px] font-mono font-bold text-slate-700 shrink-0">${escapeHtml(item.organizacion_abreviacion)}</span>`
          : '';
        const certTitle = item.certificado_version_numero
          ? `${item.audit.numero_certificado} · v${item.certificado_version_numero}`
          : item.audit.numero_certificado;
        const orgTitle = [
          item.audit.norma_codigo,
          item.organizacion_abreviacion ? `[${item.organizacion_abreviacion}]` : '',
          item.audit.organizacion_nombre,
        ]
          .filter(Boolean)
          .join(' · ');
        const orgShort = resolveShortOrganizacionName({
          nombre: item.audit.organizacion_nombre,
          abreviacion: item.organizacion_abreviacion,
        });
        const showDistinctOrgAbrev =
          Boolean(orgAbrevBadge) &&
          (item.organizacion_abreviacion || '').trim().toLowerCase() !== orgShort.trim().toLowerCase();
        return `
          <div class="min-w-0 space-y-0.5">
            <div class="flex items-center gap-1.5 min-w-0" title="${escapeHtml(certTitle)}">
              <span class="font-mono text-xs font-bold text-slate-900 truncate">${escapeHtml(item.audit.numero_certificado)}</span>
              ${certVersionChip}
            </div>
            <div class="flex items-center gap-1.5 text-[11px] text-slate-600 min-w-0" title="${escapeHtml(orgTitle)}">
              <span class="shrink-0">${escapeHtml(item.audit.norma_codigo)}</span>
              <span class="text-slate-300 shrink-0">·</span>
              ${showDistinctOrgAbrev ? orgAbrevBadge : ''}
              <span class="truncate">${escapeHtml(orgShort)}</span>
            </div>
          </div>
        `;
      },
    },
    {
      id: 'auditoria_tipo',
      header: 'Auditoría & Tipo',
      defaultWidthPct: 26,
      minWidthPx: 150,
      renderCell: (item) => {
        const codename = formatAuditCodename(item.audit);
        const codenameTooltip = getAuditCodenameTooltip(item.audit);
        const subline = item.vinculoEtiqueta
          ? `${item.audit.tipo_auditoria} · ${item.vinculoEtiqueta}`
          : item.audit.tipo_auditoria;
        return `
          <div class="min-w-0">
            <div class="text-xs font-bold text-slate-900 truncate" title="${escapeHtml(codenameTooltip)}">
              ${escapeHtml(codename)}
            </div>
            <div class="text-[11px] text-slate-500 truncate" title="${escapeHtml(subline)}">
              ${escapeHtml(subline)}
            </div>
          </div>
        `;
      },
    },
    {
      id: 'fecha',
      header: 'Fecha',
      defaultWidthPct: 22,
      minWidthPx: 140,
      renderCell: (item) =>
        `<span class="text-xs font-semibold text-slate-800 block truncate" title="${escapeHtml(
          item.dateLabel
        )}">${escapeHtml(item.dateLabel)}</span>`,
    },
    {
      id: 'estatus_auditoria',
      header: 'Estatus Auditoría',
      align: 'center',
      defaultWidthPct: 20,
      minWidthPx: 120,
      renderCell: (item) =>
        `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${item.estatusBadgeClass}">${escapeHtml(
          item.estatus_auditoria
        )}</span>`,
    },
  ];

  return renderListViewTable({
    tableId: 'conglomerado-tab-auditorias',
    columns,
    items: [...audits],
    columnWidths: tableColumnWidths?.['conglomerado-tab-auditorias'],
    getRowAttrs: (item) =>
      `data-action="open-audit-resumen" data-cert-id="${escapeHtml(
        item.audit.id_certificado
      )}" data-audit-id="${escapeHtml(item.audit.id)}" title="Abrir resumen de ${escapeHtml(
        formatAuditCodename(item.audit)
      )}"`,
  });
}
