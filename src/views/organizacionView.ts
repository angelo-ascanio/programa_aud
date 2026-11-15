import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import {
  ORG_NOMBRE_MAX_LENGTH,
  ORG_RIF_MAX_LENGTH,
  countActiveCertificates,
  createEmptyOrganizacionFormDraft,
  createOrganizacionDraftFromEntity,
  filterOrganizaciones,
  formatActiveCertificateBadge,
  getCertificatesByOrganizacion,
  type CertificadoSummary,
  type ClientOrganizationAccessEntity,
  type OrganizacionDetailMode,
  type OrganizacionEntity,
  type OrganizacionFormDraft,
} from '../lib/activeCertificates';
import type { ProgramacionAuditEntity } from '../lib/auditExecution';
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
import { getClientAccessStatusVisual } from './clientAccessView';

export type OrganizacionChildTab = 'certificados' | 'auditorias' | 'accesos';

export interface OrganizacionViewState {
  selectedOrganizacionId: string | null;
  query: string;
  hasActiveCertificates: 'ALL' | 'WITH_ACTIVE' | 'WITHOUT_ACTIVE';
  selectedSectorIaf: string;
  viewMode: 'grid' | 'list';
  sortColumn:
    | 'nombre'
    | 'rif'
    | 'direccion_fiscal'
    | 'certificados_count'
    | 'certificados_activos'
    | 'sector'
    | null;
  sortDirection: SortDirection;
  isEditingAttributes: boolean;
  activeChildTab: OrganizacionChildTab;
  formDraft?: OrganizacionFormDraft;
  editFormData?: Partial<OrganizacionEntity>;
  editErrorMessage?: string | null;
  isSidebarOpen?: boolean;
  facetSelections?: MultiViewSelectionMap;
  isCreating?: boolean;
}

export interface OrganizacionViewProps {
  profile: UserProfile;
  state: OrganizacionViewState;
  organizaciones: OrganizacionEntity[];
  certificados: CertificadoSummary[];
  auditorias?: ProgramacionAuditEntity[];
  clientAccesses?: ReadonlyArray<ClientOrganizationAccessEntity>;
  profilesDirectory?: ReadonlyArray<UserProfile>;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  columnWidths?: Record<string, number>;
  tableColumnWidths?: Record<string, Record<string, number>>;
}

export function resolveOrganizacionDetailMode(
  state: OrganizacionViewState,
  isStaff: boolean,
  selectedOrg?: OrganizacionEntity
): OrganizacionDetailMode {
  if (!isStaff) {
    return 'read';
  }
  if (state.isCreating && !state.selectedOrganizacionId) {
    return 'add';
  }
  if (selectedOrg && state.isEditingAttributes) {
    return 'edit';
  }
  return 'read';
}

export function renderOrganizacionView(props: OrganizacionViewProps): string {
  const {
    profile,
    state,
    organizaciones,
    certificados,
    auditorias = [],
    clientAccesses = [],
    profilesDirectory = [],
    loading,
    archiveConfig,
    columnWidths,
    tableColumnWidths,
  } = props;

  const isStaff = isApprovedStaffProfile(profile);
  const activeOrgs = organizaciones.filter((o) => !o.deleted_at);

  if (state.selectedOrganizacionId) {
    const org = activeOrgs.find((o) => o.id === state.selectedOrganizacionId);
    if (org) {
      return renderOrganizacionDetailView({
        profile,
        state,
        org,
        certificados,
        auditorias,
        clientAccesses,
        profilesDirectory,
        isStaff,
        tableColumnWidths,
      });
    }
  }

  if (!state.selectedOrganizacionId && state.isCreating && isStaff) {
    return renderOrganizacionDetailView({
      profile,
      state,
      certificados,
      auditorias,
      clientAccesses,
      profilesDirectory,
      isStaff,
      tableColumnWidths,
    });
  }

  return renderOrganizacionDirectoryView({
    profile,
    state,
    organizaciones: activeOrgs,
    certificados,
    isStaff,
    loading,
    archiveConfig,
    columnWidths,
  });
}

function renderOrganizacionDirectoryView(props: {
  profile: UserProfile;
  state: OrganizacionViewState;
  organizaciones: OrganizacionEntity[];
  certificados: CertificadoSummary[];
  isStaff: boolean;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  columnWidths?: Record<string, number>;
}): string {
  const { state, organizaciones, certificados, isStaff, loading, archiveConfig, columnWidths } = props;

  const sectorMap = new Map<number, string>();
  for (const org of organizaciones) {
    if (org.sector_iaf_numero) {
      sectorMap.set(org.sector_iaf_numero, org.sector_principal || `Sector ${org.sector_iaf_numero}`);
    }
  }
  const sectorEntries = Array.from(sectorMap.entries()).sort(([a], [b]) => a - b);

  const facetCategories: MultiViewFacetCategory<OrganizacionEntity>[] = [
    {
      id: 'vigencia',
      label: 'Vigencia de Certificados',
      options: [
        { value: 'WITH_ACTIVE', label: 'Con Certificados Activos' },
        { value: 'WITHOUT_ACTIVE', label: 'Sin Certificados Activos' },
      ],
      extractValues: (org) =>
        countActiveCertificates(certificados, org.id) > 0 ? 'WITH_ACTIVE' : 'WITHOUT_ACTIVE',
    },
    ...(sectorEntries.length > 0
      ? [
          {
            id: 'sector_iaf',
            label: 'Sector IAF',
            options: sectorEntries.map(([secNum, secDesc]) => ({
              value: String(secNum),
              label: `Sector ${secNum} · ${secDesc}`,
            })),
            extractValues: (org: OrganizacionEntity) =>
              org.sector_iaf_numero ? String(org.sector_iaf_numero) : null,
          },
        ]
      : []),
  ];

  const effectiveSelections: MultiViewSelectionMap = state.facetSelections
    ? state.facetSelections
    : {
        vigencia:
          state.hasActiveCertificates !== 'ALL'
            ? new Set([state.hasActiveCertificates])
            : new Set<string>(),
        sector_iaf:
          state.selectedSectorIaf !== 'ALL'
            ? new Set([state.selectedSectorIaf])
            : new Set<string>(),
      };

  const searchOptions = {
    getSearchableText: (org: OrganizacionEntity) =>
      [
        org.nombre,
        org.rif,
        org.direccion_fiscal || '',
        org.sector_principal || '',
      ].join(' '),
  };

  const filteredOrgs = filterRecordsWithFacets(
    organizaciones,
    state.query,
    facetCategories,
    effectiveSelections,
    searchOptions
  );

  // Use canonical filterOrganizaciones sorting helper when sorting by legacy keys, or direct sortItems
  void filterOrganizaciones;
  const sortedOrgs = sortItems(
    filteredOrgs,
    state.sortColumn,
    state.sortDirection,
    (org, col) => {
      switch (col) {
        case 'nombre':
          return org.nombre;
        case 'rif':
          return org.rif || '';
        case 'direccion_fiscal':
          return org.direccion_fiscal || '';
        case 'sector':
          return org.sector_iaf_numero || 0;
        case 'certificados_count':
        case 'certificados_activos':
          return countActiveCertificates(certificados, org.id);
        default:
          return '';
      }
    }
  );

  const facetGroups = computeReactiveFacetCounts(
    organizaciones,
    state.query,
    facetCategories,
    effectiveSelections,
    searchOptions
  );

  const columns: ColumnDefinition<OrganizacionEntity>[] = [
    {
      id: 'nombre',
      header: 'Organización',
      sortable: true,
      defaultWidthPct: 34,
      minWidthPx: 180,
      renderCell: (org) => `
        <div class="min-w-0">
          <span class="block font-bold text-slate-900 truncate" title="${escapeHtml(org.nombre)}">
            ${escapeHtml(org.nombre)}
          </span>
        </div>
      `,
    },
    {
      id: 'rif',
      header: 'RIF / NIF',
      sortable: true,
      defaultWidthPct: 16,
      minWidthPx: 110,
      renderCell: (org) => `
        <span class="font-mono font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 whitespace-nowrap">
          ${escapeHtml(org.rif && org.rif !== 'RIF No Registrado' ? org.rif : 'Sin RIF')}
        </span>
      `,
    },
    {
      id: 'direccion_fiscal',
      header: 'Dirección Fiscal',
      sortable: true,
      defaultWidthPct: 34,
      minWidthPx: 180,
      renderCell: (org) => `
        <span class="block text-slate-600 truncate" title="${escapeHtml(org.direccion_fiscal || 'No especificada')}">
          ${escapeHtml(org.direccion_fiscal || 'No especificada')}
        </span>
      `,
    },
    {
      id: 'certificados_count',
      header: 'Certificados Activos',
      sortable: true,
      align: 'center',
      defaultWidthPct: 16,
      minWidthPx: 120,
      renderCell: (org) => {
        const activeCount = countActiveCertificates(certificados, org.id);
        const activeBadge = formatActiveCertificateBadge(activeCount);
        const totalCerts = getCertificatesByOrganizacion(certificados, org.id).length;
        return `
          <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${activeBadge.badgeClass}">
            <span aria-hidden="true">${activeBadge.symbol}</span>
            <span>${activeCount} de ${totalCerts}</span>
          </span>
        `;
      },
    },
  ];

  const renderCard = (org: OrganizacionEntity): string => {
    const activeCount = countActiveCertificates(certificados, org.id);
    const activeBadge = formatActiveCertificateBadge(activeCount);
    const totalOrgCerts = getCertificatesByOrganizacion(certificados, org.id).length;

    return `
      <div
        role="button"
        tabindex="0"
        data-action="select-org"
        data-org-id="${escapeHtml(org.id)}"
        aria-label="Abrir detalle de ${escapeHtml(org.nombre)}"
        class="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs hover:shadow-md hover:border-emerald-300 transition-all cursor-pointer flex flex-col justify-between space-y-4 group"
      >
        <div class="space-y-2">
          <div class="flex items-start justify-between gap-3">
            <div class="space-y-1 flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-base" aria-hidden="true">🏢</span>
                <h3 class="text-sm font-bold text-slate-900 group-hover:text-emerald-700 transition-colors truncate">
                  ${escapeHtml(org.nombre)}
                </h3>
              </div>
              <div class="flex items-center gap-2">
                <span class="font-mono text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                  RIF: ${escapeHtml(org.rif && org.rif !== 'RIF No Registrado' ? org.rif : 'Sin RIF')}
                </span>
              </div>
            </div>

            <span class="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border shrink-0 ${activeBadge.badgeClass}">
              <span aria-hidden="true">${activeBadge.symbol}</span>
              <span>${activeCount} Activos</span>
            </span>
          </div>
        </div>

        <div class="text-xs text-slate-600 space-y-1 pt-3 border-t border-slate-100">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Dirección Fiscal</div>
          <p class="text-xs text-slate-700 line-clamp-2">
            ${escapeHtml(org.direccion_fiscal || 'Dirección fiscal no registrada')}
          </p>
        </div>

        <div class="pt-3 border-t border-slate-100 flex items-center justify-between">
          <span class="text-[11px] text-slate-500">
            Total Certificados: <strong class="text-slate-900 tabular-nums">${totalOrgCerts}</strong>
          </span>
        </div>
      </div>
    `;
  };

  const actionsHtml = isStaff
    ? `
      <button
        type="button"
        data-action="open-create-org"
        title="Nueva Organización"
        aria-label="Nueva Organización"
        class="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-sky-700 hover:bg-sky-800 text-white transition-colors cursor-pointer shadow-2xs shrink-0"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      </button>
    `
    : '';

  return renderUniversalTemplate<OrganizacionEntity>({
    domainKey: 'organizaciones',
    tableId: 'cert-organizaciones-main',
    columnWidths,
    title: 'Organizaciones Clientes',
    subtitle:
      'Empresas titulares de sistemas de gestión certificados, RIF fiscal y métricas de certificados activos bajo ISO/IEC 17021-1:2015',
    entityLabel: 'organizaciones clientes',
    searchQuery: state.query,
    searchPlaceholder: 'Buscar por Razón Social, RIF o dirección fiscal... (Presione "/" para enfocar)',
    searchInputId: 'orgSearchInput',
    clearSearchBtnId: 'clearOrgSearchBtn',
    totalCount: organizaciones.length,
    filteredCount: sortedOrgs.length,
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen ?? true,
    sortState: {
      column: state.sortColumn,
      direction: state.sortDirection,
    },
    facetGroups,
    items: sortedOrgs,
    columns,
    getRowAttrs: (org) =>
      `data-action="select-org" data-org-id="${escapeHtml(org.id)}" title="Abrir detalle de ${escapeHtml(org.nombre)}"`,
    renderCard,
    emptyStateTitle: 'No se encontraron organizaciones clientes',
    emptyStateMessage:
      'Intente ajustar el término de búsqueda o restablecer las facetas laterales para visualizar todas las empresas registradas.',
    actionsHtml,
    loading,
    loadingMessage: 'Cargando directorio de organizaciones clientes...',
    ...extractUniversalArchiveProps(archiveConfig, 'organizaciones'),
  });
}

function renderOrganizacionDetailView(props: {
  profile: UserProfile;
  state: OrganizacionViewState;
  org?: OrganizacionEntity;
  certificados: CertificadoSummary[];
  auditorias: ProgramacionAuditEntity[];
  clientAccesses: ReadonlyArray<ClientOrganizationAccessEntity>;
  profilesDirectory: ReadonlyArray<UserProfile>;
  isStaff: boolean;
  tableColumnWidths?: Record<string, Record<string, number>>;
}): string {
  const {
    profile,
    state,
    org,
    certificados,
    auditorias,
    clientAccesses,
    profilesDirectory,
    isStaff,
    tableColumnWidths,
  } = props;

  const mode = resolveOrganizacionDetailMode(state, isStaff, org);
  const isCreateMode = mode === 'add';
  const isReadOnly = mode === 'read';

  const draft: OrganizacionFormDraft =
    mode === 'add'
      ? state.formDraft ?? createEmptyOrganizacionFormDraft()
      : mode === 'edit'
      ? state.formDraft ??
        (org ? createOrganizacionDraftFromEntity(org) : createEmptyOrganizacionFormDraft())
      : org
      ? createOrganizacionDraftFromEntity(org)
      : createEmptyOrganizacionFormDraft();

  const activeCount = org ? countActiveCertificates(certificados, org.id) : 0;
  const orgCertificates = org ? getCertificatesByOrganizacion(certificados, org.id) : [];
  const orgAudits = org
    ? auditorias.filter(
        (a) =>
          a.id_organizacion === org.id ||
          a.organizacion_nombre.trim().toLowerCase() === org.nombre.trim().toLowerCase()
      )
    : [];
  const orgAccesses =
    org && isStaff
      ? clientAccesses.filter((a) => !a.deleted_at && a.id_organizacion === org.id)
      : [];
  const activeBadge = formatActiveCertificateBadge(activeCount);

  const customTopActionsHtml = isStaff
    ? renderDetailFormTopActions({
        mode,
        isStaff: true,
        formId: 'organizacionDetailForm',
        saveBtnId: 'saveOrgFormBtn',
        cancelBtnId: 'cancelEditOrgBtn',
        editBtnId: 'startEditOrgBtn',
        saveTitle: isCreateMode ? 'Crear organización' : 'Guardar cambios',
        cancelTitle: isCreateMode ? 'Cancelar creación' : 'Cancelar edición',
        editTitle: 'Editar organización',
        showHistoryBtn: !isCreateMode,
        showArchiveBtn: !isCreateMode && canArchiveRecord(profile),
        extraAuditAttrs: org
          ? `data-table-name="organizacion" data-record-id="${escapeHtml(org.id)}" data-entity-name="${escapeHtml(org.nombre)}"`
          : '',
        extraArchiveAttrs: org
          ? `data-archive-table="organizacion" data-archive-id="${escapeHtml(org.id)}" data-archive-entity-label="Organización Cliente" data-archive-title="${escapeHtml(org.nombre)}" data-archive-subtitle="${escapeHtml(org.rif ? `RIF: ${org.rif}` : 'Sin RIF registrado')}"`
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
    isReadOnly && org
      ? renderReadOnlyOrganizacionAttributes(org, activeCount, orgCertificates.length)
      : renderOrganizacionFormBody(draft);

  const allowedTabs: OrganizacionChildTab[] = isStaff
    ? ['certificados', 'auditorias', 'accesos']
    : ['certificados', 'auditorias'];
  const activeTab: OrganizacionChildTab = allowedTabs.includes(state.activeChildTab)
    ? state.activeChildTab
    : 'certificados';

  const childTabs = isCreateMode
    ? []
    : [
        {
          id: 'certificados',
          label: 'Certificados',
          symbol: '📜',
          count: orgCertificates.length,
        },
        {
          id: 'auditorias',
          label: 'Auditorías',
          symbol: '🗓️',
          count: orgAudits.length,
        },
        ...(isStaff
          ? [
              {
                id: 'accesos',
                label: 'Accesos Clientes',
                symbol: '🔐',
                count: orgAccesses.length,
              },
            ]
          : []),
      ];

  return renderDetailPageTemplate({
    entityType: 'Organización Cliente',
    entitySymbol: '🏢',
    title: isCreateMode ? 'Nueva Organización' : org ? org.nombre : 'Organización Cliente',
    eyebrowCode:
      !isCreateMode && org?.rif && org.rif !== 'RIF No Registrado'
        ? `RIF: ${org.rif}`
        : undefined,
    subtitle: isCreateMode
      ? 'Registro maestro de organización cliente conforme a ISO/IEC 17021-1:2015.'
      : org
      ? `${orgCertificates.length} certificado${orgCertificates.length === 1 ? '' : 's'} registrado${orgCertificates.length === 1 ? '' : 's'} · ${activeCount} activo${activeCount === 1 ? '' : 's'}`
      : undefined,
    statusBadge: !isCreateMode
      ? {
          label: activeBadge.label,
          badgeClass: activeBadge.badgeClass,
          symbol: activeBadge.symbol,
        }
      : undefined,
    backButton: {
      label: 'Volver',
      nav: 'certificacion',
      subview: 'organizations',
      action: 'back-to-org-list',
    },
    isCreateMode,
    customTopActionsHtml,
    parents: [],
    tableName: 'organizacion',
    recordId: org?.id || 'org-new',
    feedbackHtml,
    attributes: [],
    customRecordBodyHtml,
    childTabs,
    activeChildTabId: activeTab,
    childTabAttrName: 'data-org-tab',
    renderChildTabContent: (tabId) => {
      if (!org) return '';
      if (tabId === 'auditorias') {
        return renderChildAuditsTable(orgAudits, org, tableColumnWidths);
      }
      if (tabId === 'accesos' && isStaff) {
        return renderChildClientAccessTable(
          orgAccesses,
          org,
          profilesDirectory,
          tableColumnWidths
        );
      }
      return renderChildCertificatesTable(
        orgCertificates,
        org,
        isStaff,
        tableColumnWidths
      );
    },
  });
}

function renderReadOnlyOrganizacionAttributes(
  org: OrganizacionEntity,
  activeCount: number,
  totalCount: number
): string {
  const displayRif =
    org.rif && org.rif !== 'RIF No Registrado' ? org.rif : 'Sin RIF registrado';

  return `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Razón Social</span>
        <p class="text-xs font-bold text-slate-900">${escapeHtml(org.nombre)}</p>
      </div>
      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">RIF / NIF Fiscal</span>
        <p class="text-xs font-mono font-bold text-slate-900">${escapeHtml(displayRif)}</p>
      </div>
      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Certificados Activos / Emitidos</span>
        <p class="text-xs font-bold text-slate-900 tabular-nums">${activeCount} activos (${totalCount} emitidos)</p>
      </div>
      <div class="sm:col-span-2 lg:col-span-3 bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Dirección Fiscal</span>
        <p class="text-xs font-medium text-slate-800">${escapeHtml(org.direccion_fiscal || 'No especificada')}</p>
      </div>
    </div>
  `;
}

function renderOrganizacionFormBody(draft: OrganizacionFormDraft): string {
  return `
    <form id="organizacionDetailForm" class="space-y-3" novalidate>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div class="md:col-span-2 bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
          <label for="orgNombreInput" class="block text-xs font-bold text-slate-700">
            Razón Social <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <input
            type="text"
            id="orgNombreInput"
            name="nombre"
            required
            maxlength="${ORG_NOMBRE_MAX_LENGTH}"
            value="${escapeHtml(draft.nombre)}"
            placeholder="Ej. Industrias Alfa C.A."
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
          />
        </div>

        <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
          <label for="orgRifInput" class="block text-xs font-bold text-slate-700">
            RIF / NIF Fiscal
          </label>
          <input
            type="text"
            id="orgRifInput"
            name="rif"
            maxlength="${ORG_RIF_MAX_LENGTH}"
            value="${escapeHtml(draft.rif)}"
            placeholder="Ej. J-40192831-2"
            class="w-full text-xs font-mono p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
          />
        </div>
      </div>

      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
        <label for="orgDireccionInput" class="block text-xs font-bold text-slate-700">
          Dirección Fiscal
        </label>
        <textarea
          id="orgDireccionInput"
          name="direccion_fiscal"
          rows="2"
          placeholder="Zona Industrial, Parcela 14, Valencia..."
          class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
        >${escapeHtml(draft.direccion_fiscal)}</textarea>
      </div>
    </form>
  `;
}

function renderChildCertificatesTable(
  certificados: CertificadoSummary[],
  org: OrganizacionEntity,
  isStaff: boolean,
  tableColumnWidths?: Record<string, Record<string, number>>
): string {
  const createBtnHtml = isStaff
    ? `
      <div class="flex items-center justify-between gap-2 pb-2.5">
        <p class="text-xs text-slate-500">
          Haga clic en una fila para inspeccionar o gestionar el certificado.
        </p>
        <button
          type="button"
          data-action="open-create-cert-from-org"
          data-org-id="${escapeHtml(org.id)}"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold transition-colors cursor-pointer shadow-2xs shrink-0"
        >
          <span aria-hidden="true">+</span>
          <span>Nuevo Certificado</span>
        </button>
      </div>
    `
    : '';

  if (certificados.length === 0) {
    return `
      ${createBtnHtml}
      <div class="p-8 text-center bg-slate-50/70 border border-slate-200 rounded-xl space-y-2">
        <div class="text-2xl" aria-hidden="true">📜</div>
        <h4 class="text-xs font-bold text-slate-800">No hay certificados registrados para esta organización</h4>
        <p class="text-xs text-slate-500 max-w-sm mx-auto">
          La organización ${escapeHtml(org.nombre)} aún no cuenta con certificados de conformidad expedidos o en estudio.
        </p>
      </div>
    `;
  }

  const columns: ColumnDefinition<CertificadoSummary>[] = [
    {
      id: 'numero_certificado',
      header: 'Código',
      defaultWidthPct: 24,
      minWidthPx: 120,
      renderCell: (c) => `
        <span class="font-mono font-bold text-slate-900 inline-flex items-center gap-1.5">
          <span aria-hidden="true">📜</span>
          <span>${escapeHtml(c.numero_certificado)}</span>
        </span>
      `,
    },
    {
      id: 'norma',
      header: 'Norma de Gestión',
      defaultWidthPct: 26,
      minWidthPx: 130,
      renderCell: (c) => `
        <div class="font-semibold text-slate-800 truncate">${escapeHtml(c.norma)}</div>
        ${c.esquema ? `<div class="text-[10px] text-slate-400 truncate">${escapeHtml(c.esquema)}</div>` : ''}
      `,
    },
    {
      id: 'vigencia',
      header: 'Vigencia',
      defaultWidthPct: 16,
      minWidthPx: 100,
      renderCell: (c) => {
        const emision = c.fecha_emision ? c.fecha_emision.slice(0, 4) : '—';
        const vencimiento = c.fecha_vencimiento ? c.fecha_vencimiento.slice(0, 4) : '—';
        return `<span class="font-mono text-slate-600">${escapeHtml(emision)} — ${escapeHtml(vencimiento)}</span>`;
      },
    },
    {
      id: 'sedes',
      header: 'Sedes',
      align: 'center',
      defaultWidthPct: 18,
      minWidthPx: 100,
      renderCell: (c) => `
        <span class="inline-flex px-2 py-0.5 rounded text-[11px] font-medium ${
          c.multisitio
            ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
            : 'bg-slate-100 text-slate-600 border border-slate-200'
        }">
          ${c.multisitio ? `${c.sitios_count || 2} sedes` : 'Sede única'}
        </span>
      `,
    },
    {
      id: 'estatus',
      header: 'Estatus',
      align: 'center',
      defaultWidthPct: 16,
      minWidthPx: 95,
      renderCell: (c) => {
        const estatusClean = (c.estatus || 'Activo').toLowerCase();
        let statusBadgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-200';
        if (estatusClean.includes('estudio') || estatusClean.includes('proceso')) {
          statusBadgeClass = 'bg-amber-50 text-amber-800 border-amber-200';
        } else if (estatusClean.includes('suspendido')) {
          statusBadgeClass = 'bg-rose-50 text-rose-800 border-rose-200';
        } else if (estatusClean.includes('cancelado') || estatusClean.includes('inactivo')) {
          statusBadgeClass = 'bg-slate-100 text-slate-600 border-slate-200';
        }
        return `
          <span class="inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusBadgeClass}">
            ${escapeHtml(c.estatus)}
          </span>
        `;
      },
    },
  ];

  return `
    ${createBtnHtml}
    ${renderListViewTable({
      tableId: 'org-tab-certificados',
      columns,
      items: certificados,
      columnWidths: tableColumnWidths?.['org-tab-certificados'],
      getRowAttrs: (c) =>
        `data-action="drilldown-to-cert" data-cert-id="${escapeHtml(c.id)}" data-cert-code="${escapeHtml(c.numero_certificado)}" title="Abrir certificado ${escapeHtml(c.numero_certificado)}"`,
    })}
  `;
}

function renderChildAuditsTable(
  auditorias: ProgramacionAuditEntity[],
  org: OrganizacionEntity,
  tableColumnWidths?: Record<string, Record<string, number>>
): string {
  if (auditorias.length === 0) {
    return `
      <div class="p-8 text-center bg-slate-50/70 border border-slate-200 rounded-xl space-y-2">
        <div class="text-2xl" aria-hidden="true">🗓️</div>
        <h4 class="text-xs font-bold text-slate-800">No hay auditorías programadas para esta organización</h4>
        <p class="text-xs text-slate-500 max-w-sm mx-auto">
          ${escapeHtml(org.nombre)} aún no registra jornadas de auditoría en el cronograma operativo.
        </p>
      </div>
    `;
  }

  const columns: ColumnDefinition<ProgramacionAuditEntity>[] = [
    {
      id: 'codigo_auditoria',
      header: 'Auditoría',
      defaultWidthPct: 18,
      minWidthPx: 110,
      renderCell: (aud) => `
        <span class="font-mono font-bold text-slate-900 inline-flex items-center gap-1.5">
          <span aria-hidden="true">🗓️</span>
          <span>${escapeHtml(aud.codigo_auditoria)}</span>
        </span>
      `,
    },
    {
      id: 'numero_certificado',
      header: 'Certificado',
      defaultWidthPct: 18,
      minWidthPx: 110,
      renderCell: (aud) =>
        `<span class="font-mono text-slate-700">${escapeHtml(aud.numero_certificado)}</span>`,
    },
    {
      id: 'modalidad',
      header: 'Tipo y Modalidad',
      defaultWidthPct: 22,
      minWidthPx: 130,
      renderCell: (aud) => `
        <span class="font-semibold text-slate-800">${escapeHtml(aud.tipo_auditoria)}</span>
        <span class="text-slate-400"> · </span>
        <span class="text-slate-600">${escapeHtml(aud.metodologia)}</span>
      `,
    },
    {
      id: 'fechas',
      header: 'Fechas',
      defaultWidthPct: 16,
      minWidthPx: 110,
      renderCell: (aud) =>
        `<span class="font-mono text-[11px] text-slate-600">${escapeHtml(aud.fecha_inicio)} → ${escapeHtml(aud.fecha_fin)}</span>`,
    },
    {
      id: 'auditor_lider',
      header: 'Auditor Líder',
      defaultWidthPct: 14,
      minWidthPx: 100,
      renderCell: (aud) =>
        `<span class="text-slate-800 truncate block">${escapeHtml(aud.auditor_lider)}</span>`,
    },
    {
      id: 'estatus',
      header: 'Estatus',
      align: 'center',
      defaultWidthPct: 12,
      minWidthPx: 90,
      renderCell: (aud) => {
        const isCompleted = aud.estatus === 'Completado' || aud.estatus === 'Cerrado';
        return `
          <span class="inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
            isCompleted
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-indigo-50 text-indigo-800 border-indigo-200'
          }">
            ${escapeHtml(aud.estatus)}
          </span>
        `;
      },
    },
  ];

  return renderListViewTable({
    tableId: 'org-tab-auditorias',
    columns,
    items: auditorias,
    columnWidths: tableColumnWidths?.['org-tab-auditorias'],
    getRowAttrs: (aud) =>
      `data-action="select-prog-audit" data-audit-id="${escapeHtml(aud.id)}" title="Abrir auditoría ${escapeHtml(aud.codigo_auditoria)}"`,
  });
}

function renderChildClientAccessTable(
  accesses: ReadonlyArray<ClientOrganizationAccessEntity>,
  org: OrganizacionEntity,
  profilesDirectory: ReadonlyArray<UserProfile>,
  tableColumnWidths?: Record<string, Record<string, number>>
): string {
  const headerBarHtml = `
    <div class="flex items-center justify-between gap-2 pb-2.5">
      <p class="text-xs text-slate-500">
        Control de usuarios portal autorizados en <span class="font-mono font-semibold text-slate-700">client_organization_access</span>.
      </p>
      <button
        type="button"
        data-action="open-create-client-access"
        data-org-id="${escapeHtml(org.id)}"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold transition-colors cursor-pointer shadow-2xs shrink-0"
      >
        <span aria-hidden="true">+</span>
        <span>Otorgar Acceso Cliente</span>
      </button>
    </div>
  `;

  if (accesses.length === 0) {
    return `
      ${headerBarHtml}
      <div class="p-8 text-center bg-slate-50/70 border border-slate-200 rounded-xl space-y-2">
        <div class="text-2xl" aria-hidden="true">🔐</div>
        <h4 class="text-xs font-bold text-slate-800">Sin usuarios cliente vinculados</h4>
        <p class="text-xs text-slate-500 max-w-sm mx-auto">
          Ningún usuario portal CLIENT tiene asignación activa para ${escapeHtml(org.nombre)}.
        </p>
      </div>
    `;
  }

  const columns: ColumnDefinition<ClientOrganizationAccessEntity>[] = [
    {
      id: 'usuario',
      header: 'Usuario Cliente',
      defaultWidthPct: 32,
      minWidthPx: 140,
      renderCell: (row) => {
        const matchedUser = profilesDirectory.find((p) => p.id === row.id_usuario);
        const userName = matchedUser?.nombre || row.usuario_nombre || 'Usuario Cliente';
        const userRole = matchedUser?.role || row.usuario_role || 'CLIENT';
        return `
          <div class="min-w-0">
            <span class="block font-bold text-slate-900 truncate">${escapeHtml(userName)}</span>
            <span class="block text-[10px] font-semibold text-slate-500">${escapeHtml(userRole)}</span>
          </div>
        `;
      },
    },
    {
      id: 'estado',
      header: 'Estado',
      align: 'center',
      defaultWidthPct: 18,
      minWidthPx: 100,
      renderCell: (row) => {
        const visual = getClientAccessStatusVisual(row.estado);
        return `
          <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${visual.badgeClass}">
            <span aria-hidden="true">${visual.symbol}</span>
            <span>${escapeHtml(visual.label)}</span>
          </span>
        `;
      },
    },
    {
      id: 'aprobado_por',
      header: 'Aprobado / Revisado por',
      defaultWidthPct: 24,
      minWidthPx: 130,
      renderCell: (row) => {
        const approverName =
          row.aprobado_por_nombre ||
          (row.aprobado_por
            ? profilesDirectory.find((p) => p.id === row.aprobado_por)?.nombre || 'Personal Aprobador'
            : 'Pendiente');
        return `<span class="block text-slate-700 truncate">${escapeHtml(approverName)}</span>`;
      },
    },
    {
      id: 'fechas',
      header: 'Solicitud / Respuesta',
      defaultWidthPct: 26,
      minWidthPx: 130,
      renderCell: (row) => {
        const sol = row.fecha_solicitud ? row.fecha_solicitud.slice(0, 10) : '—';
        const resp = row.fecha_respuesta ? row.fecha_respuesta.slice(0, 10) : 'Pendiente';
        return `
          <span class="font-mono text-[11px] text-slate-600 whitespace-nowrap">
            ${escapeHtml(sol)} · ${escapeHtml(resp)}
          </span>
        `;
      },
    },
  ];

  return `
    ${headerBarHtml}
    ${renderListViewTable({
      tableId: 'org-tab-accesos',
      columns,
      items: [...accesses],
      columnWidths: tableColumnWidths?.['org-tab-accesos'],
      getRowAttrs: (row) => {
        const matchedUser = profilesDirectory.find((p) => p.id === row.id_usuario);
        const userName = matchedUser?.nombre || row.usuario_nombre || 'Usuario Cliente';
        return `data-action="select-client-access" data-access-id="${escapeHtml(row.id)}" title="Gestionar acceso de ${escapeHtml(userName)}"`;
      },
    })}
  `;
}
