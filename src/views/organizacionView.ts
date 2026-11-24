import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import {
  ORG_ABREVIACION_MAX_LENGTH,
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
  type OrganizacionVersionEntity,
} from '../lib/activeCertificates';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import type { ProgramacionAuditEntity } from '../lib/auditExecution';
import {
  CERT_VERSION_ORG_ACTION_LABELS,
  type CertVersionOrgAction,
  type CertVersionOrgResolutionItem,
} from '../lib/organizacionVersionDomain';
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
  type DetailParentChip,
} from './detailTemplate';
import {
  planOrganizationRebucket,
  type ConglomeradoEntity,
} from '../lib/conglomeradoDomain';
import {
  canArchiveRecord,
  extractUniversalArchiveProps,
  type ArchiveMultiViewConfig,
} from '../lib/archiveGovernance';
import { getClientAccessStatusVisual } from './clientAccessView';

export type OrganizacionChildTab = 'certificados' | 'auditorias' | 'accesos';

export interface OrganizacionCertResolutionModalState {
  isOpen: boolean;
  orgId: string;
  newOrgVersionId: string;
  newOrgVersionNumero: number;
  items: CertVersionOrgResolutionItem[];
  submitting?: boolean;
  errorMessage?: string | null;
}

export interface OrganizacionViewState {
  selectedOrganizacionId: string | null;
  selectedOrgVersionId?: string | null;
  query: string;
  hasActiveCertificates: 'ALL' | 'WITH_ACTIVE' | 'WITHOUT_ACTIVE';
  selectedSectorIaf: string;
  viewMode: 'grid' | 'list';
  sortColumn:
    | 'nombre'
    | 'abreviacion'
    | 'rif'
    | 'direccion_fiscal'
    | 'certificados_count'
    | 'certificados_activos'
    | 'sector'
    | null;
  sortDirection: SortDirection;
  isEditingAttributes: boolean;
  isCreatingVersion?: boolean;
  activeChildTab: OrganizacionChildTab;
  formDraft?: OrganizacionFormDraft;
  editFormData?: Partial<OrganizacionEntity>;
  editErrorMessage?: string | null;
  isSidebarOpen?: boolean;
  facetSelections?: MultiViewSelectionMap;
  isCreating?: boolean;
  certResolutionModal?: OrganizacionCertResolutionModalState | null;
}

export interface OrganizacionViewProps {
  profile: UserProfile;
  state: OrganizacionViewState;
  organizaciones: OrganizacionEntity[];
  certificados: CertificadoSummary[];
  allCertificadosDetailed?: ReadonlyArray<CertificadoDetailEntity>;
  conglomerados?: ReadonlyArray<ConglomeradoEntity>;
  auditorias?: ProgramacionAuditEntity[];
  clientAccesses?: ReadonlyArray<ClientOrganizationAccessEntity>;
  profilesDirectory?: ReadonlyArray<UserProfile>;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  columnWidths?: Record<string, number>;
  tableColumnWidths?: Record<string, Record<string, number>>;
}

function buildFallbackOrgVersion(org: OrganizacionEntity): OrganizacionVersionEntity {
  const verNum =
    typeof org.version_actual_numero === 'number' && org.version_actual_numero > 0
      ? Math.trunc(org.version_actual_numero)
      : 1;
  return {
    id: org.id_organizacion_version_actual || `org-ver-${verNum}`,
    id_organizacion: org.id,
    version_numero: verNum,
    es_version_actual: true,
    notas_version: null,
    nombre: org.nombre,
    abreviacion: (org.abreviacion || '').trim(),
    rif: org.rif && org.rif !== 'RIF No Registrado' ? org.rif : null,
    direccion_fiscal: org.direccion_fiscal || null,
    deleted_at: null,
  };
}

export function resolveOrgVersionsDescending(
  org: OrganizacionEntity
): OrganizacionVersionEntity[] {
  const activeRows = (org.versiones || [])
    .filter((v) => !v.deleted_at)
    .slice()
    .sort((a, b) => b.version_numero - a.version_numero);
  if (activeRows.length > 0) {
    return activeRows;
  }
  return [buildFallbackOrgVersion(org)];
}

export function resolveActiveOrgVersion(org: OrganizacionEntity): OrganizacionVersionEntity {
  const versions = resolveOrgVersionsDescending(org);
  return versions.find((v) => v.es_version_actual) || versions[0];
}

export function resolveSelectedOrgVersion(
  org: OrganizacionEntity,
  selectedOrgVersionId?: string | null
): OrganizacionVersionEntity {
  const versions = resolveOrgVersionsDescending(org);
  if (selectedOrgVersionId) {
    const matched = versions.find((v) => v.id === selectedOrgVersionId);
    if (matched) return matched;
  }
  return versions.find((v) => v.es_version_actual) || versions[0];
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
    allCertificadosDetailed = [],
    conglomerados = [],
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
        allOrgs: activeOrgs,
        conglomerados,
        certificados,
        allCertificadosDetailed,
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
      allOrgs: activeOrgs,
      conglomerados,
      certificados,
      allCertificadosDetailed,
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
    getSearchableText: (org: OrganizacionEntity) => {
      const activeVer = resolveActiveOrgVersion(org);
      return [
        activeVer.nombre || org.nombre,
        activeVer.abreviacion || org.abreviacion || '',
        activeVer.rif || org.rif,
        activeVer.direccion_fiscal || org.direccion_fiscal || '',
        org.sector_principal || '',
      ].join(' ');
    },
  };

  const filteredOrgs = filterRecordsWithFacets(
    organizaciones,
    state.query,
    facetCategories,
    effectiveSelections,
    searchOptions
  );

  // Preserve canonical filterOrganizaciones reference for compatibility
  void filterOrganizaciones;
  const sortedOrgs = sortItems(
    filteredOrgs,
    state.sortColumn,
    state.sortDirection,
    (org, col) => {
      const activeVer = resolveActiveOrgVersion(org);
      switch (col) {
        case 'nombre':
          return activeVer.nombre || org.nombre;
        case 'abreviacion':
          return activeVer.abreviacion || org.abreviacion || '';
        case 'rif':
          return activeVer.rif || org.rif || '';
        case 'direccion_fiscal':
          return activeVer.direccion_fiscal || org.direccion_fiscal || '';
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
      defaultWidthPct: 27,
      minWidthPx: 170,
      renderCell: (org) => {
        const activeVer = resolveActiveOrgVersion(org);
        const displayName = activeVer.nombre || org.nombre;
        const verNum = activeVer.version_numero || org.version_actual_numero || 1;
        return `
          <div class="flex items-center gap-2 min-w-0">
            <span class="font-bold text-slate-900 truncate min-w-0" title="${escapeHtml(displayName)}">
              ${escapeHtml(displayName)}
            </span>
            <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-100 text-slate-600 border border-slate-200 shrink-0 tabular-nums">
              v${verNum}
            </span>
          </div>
        `;
      },
    },
    {
      id: 'abreviacion',
      header: 'Abreviación',
      sortable: true,
      defaultWidthPct: 13,
      minWidthPx: 100,
      renderCell: (org) => {
        const activeVer = resolveActiveOrgVersion(org);
        const abrev = (activeVer.abreviacion || org.abreviacion || '').trim();
        return abrev
          ? `
            <span class="inline-flex items-center font-mono text-[11px] font-bold text-sky-800 bg-sky-50 px-2 py-0.5 rounded border border-sky-200 whitespace-nowrap">
              ${escapeHtml(abrev)}
            </span>
          `
          : `<span class="text-slate-400 text-xs">—</span>`;
      },
    },
    {
      id: 'rif',
      header: 'RIF / NIF',
      sortable: true,
      defaultWidthPct: 14,
      minWidthPx: 105,
      renderCell: (org) => {
        const activeVer = resolveActiveOrgVersion(org);
        const rifVal = activeVer.rif || org.rif;
        return `
          <span class="font-mono font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 whitespace-nowrap">
            ${escapeHtml(rifVal && rifVal !== 'RIF No Registrado' ? rifVal : 'Sin RIF')}
          </span>
        `;
      },
    },
    {
      id: 'direccion_fiscal',
      header: 'Dirección Fiscal',
      sortable: true,
      defaultWidthPct: 27,
      minWidthPx: 170,
      renderCell: (org) => {
        const activeVer = resolveActiveOrgVersion(org);
        const dir = activeVer.direccion_fiscal || org.direccion_fiscal || 'No especificada';
        return `
          <span class="block text-slate-600 truncate" title="${escapeHtml(dir)}">
            ${escapeHtml(dir)}
          </span>
        `;
      },
    },
    {
      id: 'certificados_count',
      header: 'Certificados Activos',
      sortable: true,
      align: 'center',
      defaultWidthPct: 19,
      minWidthPx: 130,
      renderCell: (org) => {
        const activeCount = countActiveCertificates(certificados, org.id);
        const activeBadge = formatActiveCertificateBadge(activeCount);
        const totalCerts = getCertificatesByOrganizacion(certificados, org.id).length;
        return `
          <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap tabular-nums ${activeBadge.badgeClass}">
            <span aria-hidden="true">${activeBadge.symbol}</span>
            <span>${activeCount} de ${totalCerts}</span>
          </span>
        `;
      },
    },
  ];

  const renderCard = (org: OrganizacionEntity): string => {
    const activeVer = resolveActiveOrgVersion(org);
    const displayName = activeVer.nombre || org.nombre;
    const abrev = (activeVer.abreviacion || org.abreviacion || '').trim();
    const verNum = activeVer.version_numero || org.version_actual_numero || 1;
    const rifVal = activeVer.rif || org.rif;
    const dirVal = activeVer.direccion_fiscal || org.direccion_fiscal;
    const activeCount = countActiveCertificates(certificados, org.id);
    const activeBadge = formatActiveCertificateBadge(activeCount);
    const totalOrgCerts = getCertificatesByOrganizacion(certificados, org.id).length;

    return `
      <div
        role="button"
        tabindex="0"
        data-action="select-org"
        data-org-id="${escapeHtml(org.id)}"
        aria-label="Abrir detalle de ${escapeHtml(displayName)}"
        class="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs hover:shadow-md hover:border-emerald-300 transition-all cursor-pointer flex flex-col justify-between space-y-4 group"
      >
        <div class="space-y-2">
          <div class="flex items-start justify-between gap-3">
            <div class="space-y-1.5 flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-base shrink-0" aria-hidden="true">🏢</span>
                <h3 class="text-sm font-bold text-slate-900 group-hover:text-emerald-700 transition-colors truncate">
                  ${escapeHtml(displayName)}
                </h3>
              </div>
              <div class="flex flex-wrap items-center gap-1.5">
                ${
                  abrev
                    ? `
                      <span class="font-mono text-[11px] font-bold text-sky-800 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                        ${escapeHtml(abrev)}
                      </span>
                    `
                    : ''
                }
                <span class="font-mono text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                  RIF: ${escapeHtml(rifVal && rifVal !== 'RIF No Registrado' ? rifVal : 'Sin RIF')}
                </span>
                <span class="font-mono text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 tabular-nums">
                  v${verNum}
                </span>
              </div>
            </div>

            <span class="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border shrink-0 whitespace-nowrap ${activeBadge.badgeClass}">
              <span aria-hidden="true">${activeBadge.symbol}</span>
              <span>${activeCount} Activos</span>
            </span>
          </div>
        </div>

        <div class="text-xs text-slate-600 space-y-1 pt-3 border-t border-slate-100">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Dirección Fiscal</div>
          <p class="text-xs text-slate-700 line-clamp-2">
            ${escapeHtml(dirVal || 'Dirección fiscal no registrada')}
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
      'Empresas titulares de sistemas de gestión certificados, abreviación maestra, RIF fiscal y trazabilidad de versiones bajo ISO/IEC 17021-1:2015',
    entityLabel: 'organizaciones clientes',
    searchQuery: state.query,
    searchPlaceholder:
      'Buscar por Razón Social, Abreviación, RIF o dirección fiscal... (Presione "/" para enfocar)',
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
    getRowAttrs: (org) => {
      const activeVer = resolveActiveOrgVersion(org);
      return `data-action="select-org" data-org-id="${escapeHtml(org.id)}" title="Abrir detalle de ${escapeHtml(activeVer.nombre || org.nombre)}"`;
    },
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
  allOrgs: ReadonlyArray<OrganizacionEntity>;
  conglomerados: ReadonlyArray<ConglomeradoEntity>;
  certificados: CertificadoSummary[];
  allCertificadosDetailed: ReadonlyArray<CertificadoDetailEntity>;
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
    allOrgs,
    conglomerados,
    certificados,
    allCertificadosDetailed,
    auditorias,
    clientAccesses,
    profilesDirectory,
    isStaff,
    tableColumnWidths,
  } = props;

  const activeGroups = conglomerados.filter((g) => !g.deleted_at);
  const parentGroup = org?.id_grupo_empresarial
    ? activeGroups.find((g) => g.id === org.id_grupo_empresarial)
    : undefined;
  const resolvedParentGroupName =
    parentGroup?.nombre || org?.grupo_empresarial_nombre || 'Grupo Individual 1:1';
  const currentGroupOrgCount = org?.id_grupo_empresarial
    ? allOrgs.filter((o) => !o.deleted_at && o.id_grupo_empresarial === org.id_grupo_empresarial)
        .length
    : 1;

  const mode = resolveOrganizacionDetailMode(state, isStaff, org);
  const isCreateMode = mode === 'add';
  const isCreatingVersion = Boolean(!isCreateMode && org && isStaff && state.isCreatingVersion);
  const isReadOnly = mode === 'read' && !isCreatingVersion;

  const versions = org ? resolveOrgVersionsDescending(org) : [];
  const activeVersion = org ? resolveActiveOrgVersion(org) : undefined;
  const selectedVersion = org
    ? isCreatingVersion || mode === 'edit'
      ? activeVersion
      : resolveSelectedOrgVersion(org, state.selectedOrgVersionId)
    : undefined;
  const isHistoricalSelected = Boolean(
    !isCreateMode &&
      !isCreatingVersion &&
      mode === 'read' &&
      selectedVersion &&
      !selectedVersion.es_version_actual
  );

  const activeDraftSource = (): OrganizacionFormDraft => {
    if (!org) return createEmptyOrganizacionFormDraft();
    const base = createOrganizacionDraftFromEntity(org);
    if (activeVersion) {
      return {
        ...base,
        nombre: activeVersion.nombre || base.nombre,
        abreviacion: activeVersion.abreviacion || base.abreviacion || '',
        rif: activeVersion.rif || '',
        direccion_fiscal: activeVersion.direccion_fiscal ?? '',
        notas_version: '',
      };
    }
    return base;
  };

  const draft: OrganizacionFormDraft =
    mode === 'add'
      ? state.formDraft ?? createEmptyOrganizacionFormDraft()
      : mode === 'edit' || isCreatingVersion
      ? state.formDraft ?? activeDraftSource()
      : activeDraftSource();

  const activeCount = org ? countActiveCertificates(certificados, org.id) : 0;
  const orgCertificates = org ? getCertificatesByOrganizacion(certificados, org.id) : [];
  const orgDetailedCerts = org
    ? allCertificadosDetailed.filter((c) => !c.deleted_at && c.id_organizacion === org.id)
    : [];
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

  const versionSelectorHtml =
    !isCreateMode && org && versions.length > 1 && mode === 'read' && !isCreatingVersion
      ? `
        <div class="flex items-center gap-1.5">
          <label for="orgVersionSelect" class="sr-only">Versión de organización</label>
          <select
            id="orgVersionSelect"
            data-action="select-org-version"
            aria-label="Versión de organización"
            class="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-800 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none cursor-pointer"
          >
            ${versions
              .map((v) => {
                const isSelected = selectedVersion?.id === v.id;
                const statusSuffix = v.es_version_actual ? 'Actual' : 'Histórica';
                return `<option value="${escapeHtml(v.id)}" ${
                  isSelected ? 'selected' : ''
                }>v${v.version_numero} · ${escapeHtml(statusSuffix)}</option>`;
              })
              .join('')}
          </select>
        </div>
      `
      : '';

  let customTopActionsHtml: string | undefined;
  if (isCreatingVersion && isStaff && org) {
    customTopActionsHtml = `
      <button
        type="submit"
        form="organizacionVersionForm"
        id="saveCreateOrgVersionBtn"
        title="Confirmar Nueva Versión"
        aria-label="Confirmar Nueva Versión"
        class="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer shadow-2xs shrink-0"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </button>
      <button
        type="button"
        id="cancelCreateOrgVersionBtn"
        data-action="cancel-create-org-version"
        title="Cancelar nueva versión"
        aria-label="Cancelar nueva versión"
        class="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors cursor-pointer shadow-2xs shrink-0"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>
    `;
  } else if (isStaff && (mode === 'add' || mode === 'edit')) {
    customTopActionsHtml = renderDetailFormTopActions({
      mode,
      isStaff: true,
      formId: 'organizacionDetailForm',
      saveBtnId: 'saveOrgFormBtn',
      cancelBtnId: 'cancelEditOrgBtn',
      editBtnId: 'startEditOrgBtn',
      saveTitle: isCreateMode ? 'Crear organización' : 'Guardar cambios',
      cancelTitle: isCreateMode ? 'Cancelar creación' : 'Cancelar edición',
      editTitle: 'Editar',
    });
  } else if (isStaff && org) {
    const disabledAttr = isHistoricalSelected ? 'disabled aria-disabled="true"' : '';
    const editTitle = isHistoricalSelected
      ? 'Solo puede editar desde la versión activa'
      : 'Editar versión activa';
    const versionTitle = isHistoricalSelected
      ? 'Solo puede derivar una nueva versión desde la versión activa'
      : 'Crear Nueva Versión';
    const archiveBtnHtml = canArchiveRecord(profile)
      ? `
        <button
          type="button"
          data-action="open-archive-modal"
          data-archive-table="organizacion"
          data-archive-id="${escapeHtml(org.id)}"
          data-archive-entity-label="Organización Cliente"
          data-archive-title="${escapeHtml(selectedVersion?.nombre || org.nombre)}"
          data-archive-subtitle="${escapeHtml(
            selectedVersion?.rif ? `RIF: ${selectedVersion.rif}` : 'Sin RIF registrado'
          )}"
          title="Archivar"
          aria-label="Archivar"
          class="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 shadow-2xs transition-colors cursor-pointer shrink-0"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            <line x1="10" x2="10" y1="11" y2="17" />
            <line x1="14" x2="14" y1="11" y2="17" />
          </svg>
        </button>
      `
      : '';

    customTopActionsHtml = `
      ${versionSelectorHtml}
      <button
        type="button"
        id="startEditOrgBtn"
        ${disabledAttr}
        title="${escapeHtml(editTitle)}"
        aria-label="Editar"
        class="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 text-xs font-semibold shadow-2xs transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
        <span>Editar</span>
      </button>
      <button
        type="button"
        id="openCreateOrgVersionBtn"
        data-action="open-create-org-version"
        data-org-id="${escapeHtml(org.id)}"
        ${disabledAttr}
        title="${escapeHtml(versionTitle)}"
        aria-label="Crear Nueva Versión"
        class="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border border-sky-200 bg-sky-50 hover:bg-sky-100 text-sky-800 text-xs font-semibold shadow-2xs transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
        <span>Crear Nueva Versión</span>
      </button>
      <button
        type="button"
        data-action="open-changelog"
        data-table-name="organizacion"
        data-record-id="${escapeHtml(org.id)}"
        data-entity-name="${escapeHtml(selectedVersion?.nombre || org.nombre)}"
        title="Historial de Cambios"
        aria-label="Historial de Cambios"
        class="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 shadow-2xs transition-colors cursor-pointer shrink-0"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <polyline points="12 7 12 12 15.5 14" />
        </svg>
      </button>
      ${archiveBtnHtml}
    `;
  } else if (!isStaff && versionSelectorHtml) {
    customTopActionsHtml = versionSelectorHtml;
  }

  const historicalBannerHtml =
    isHistoricalSelected && selectedVersion
      ? `
        <div role="status" class="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-semibold text-amber-900 flex items-center gap-2">
          <span aria-hidden="true">🔒</span>
          <span>Visualizando versión histórica v${selectedVersion.version_numero} (solo lectura). Los cambios solo pueden realizarse o derivar versiones desde la versión activa.</span>
        </div>
      `
      : '';

  const errorBannerHtml =
    (!isReadOnly || isCreatingVersion) && state.editErrorMessage
      ? `
        <div role="alert" class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800 flex items-center gap-2">
          <span aria-hidden="true">⚠️</span>
          <span>${escapeHtml(state.editErrorMessage)}</span>
        </div>
      `
      : '';

  const feedbackHtml = `${historicalBannerHtml}${errorBannerHtml}`;

  const customRecordBodyHtml = isCreatingVersion && org && activeVersion
    ? renderCreateOrganizacionVersionForm({
        draft,
        activeVersion,
      })
    : isReadOnly && org
    ? renderReadOnlyOrganizacionAttributes(
        org,
        selectedVersion,
        activeCount,
        orgCertificates.length,
        resolvedParentGroupName
      )
    : renderOrganizacionFormBody({
        draft,
        mode,
        org,
        activeVersion,
        allOrgs,
        conglomerados: activeGroups,
        currentGroupOrgCount,
      });

  const allowedTabs: OrganizacionChildTab[] = isStaff
    ? ['certificados', 'auditorias', 'accesos']
    : ['certificados', 'auditorias'];
  const activeTab: OrganizacionChildTab = allowedTabs.includes(state.activeChildTab)
    ? state.activeChildTab
    : 'certificados';

  const historicalLinkedCount =
    isHistoricalSelected && selectedVersion && orgDetailedCerts.length > 0
      ? countCertVersionsForOrgVersion(orgDetailedCerts, selectedVersion.id)
      : orgCertificates.length;

  const childTabs = isCreateMode
    ? []
    : [
        {
          id: 'certificados',
          label: 'Certificados',
          symbol: '📜',
          count: historicalLinkedCount,
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

  const displayName = !isCreateMode && selectedVersion
    ? selectedVersion.nombre
    : isCreateMode
    ? 'Nueva Organización'
    : org?.nombre || 'Organización Cliente';
  const displayAbrev = !isCreateMode
    ? (selectedVersion?.abreviacion || org?.abreviacion || '').trim()
    : '';
  const displayRif = !isCreateMode
    ? selectedVersion?.rif || (org?.rif && org.rif !== 'RIF No Registrado' ? org.rif : '')
    : '';
  const eyebrowCodeValue = displayAbrev || (displayRif ? `RIF: ${displayRif}` : '');

  const modalsHtml =
    state.certResolutionModal?.isOpen && org && state.certResolutionModal.orgId === org.id
      ? renderOrganizacionCertResolutionModal(
          state.certResolutionModal,
          activeVersion?.nombre || org.nombre
        )
      : '';

  return renderDetailPageTemplate({
    entityType: 'Organización Cliente',
    entitySymbol: '🏢',
    title: displayName,
    eyebrowCode: eyebrowCodeValue || undefined,
    subtitle: isCreateMode
      ? 'Registro maestro de organización cliente conforme a ISO/IEC 17021-1:2015.'
      : isCreatingVersion && activeVersion
      ? `Derivación manual de nueva versión desde v${activeVersion.version_numero} (${activeVersion.abreviacion || org?.abreviacion || ''}).`
      : org
      ? `${orgCertificates.length} certificado${orgCertificates.length === 1 ? '' : 's'} registrado${orgCertificates.length === 1 ? '' : 's'} · ${activeCount} activo${activeCount === 1 ? '' : 's'}${displayRif ? ` · RIF: ${displayRif}` : ''}`
      : undefined,
    statusBadge: !isCreateMode
      ? {
          label: `${activeCount} Activo${activeCount === 1 ? '' : 's'}`,
          badgeClass: activeBadge.badgeClass,
          symbol: activeBadge.symbol,
        }
      : undefined,
    secondaryHeaderBadge:
      !isCreateMode && selectedVersion
        ? {
            label: isHistoricalSelected
              ? `Versión Histórica · v${selectedVersion.version_numero} · Solo lectura`
              : `Versión Actual · v${selectedVersion.version_numero}`,
            badgeClass: isHistoricalSelected
              ? 'bg-amber-50 text-amber-800 border-amber-200'
              : 'bg-sky-50 text-sky-800 border-sky-200',
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
    parents:
      !isCreateMode && org
        ? ([
            {
              label: 'Conglomerado',
              value: resolvedParentGroupName,
              symbol: '🏛️',
              navAction: org.id_grupo_empresarial
                ? {
                    nav: 'certificacion',
                    subview: 'conglomerados',
                    entityType: 'conglomerado',
                    entityId: org.id_grupo_empresarial,
                  }
                : undefined,
            },
          ] satisfies DetailParentChip[])
        : [],
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
      return renderChildCertificatesTable({
        certificados: orgCertificates,
        detailedCerts: orgDetailedCerts,
        org,
        selectedVersion,
        isHistoricalSelected,
        isStaff: isStaff && !isHistoricalSelected && !isCreatingVersion,
        tableColumnWidths,
      });
    },
    modalsHtml,
  });
}

function renderReadOnlyOrganizacionAttributes(
  org: OrganizacionEntity,
  selectedVersion: OrganizacionVersionEntity | undefined,
  activeCount: number,
  totalCount: number,
  parentGroupName: string
): string {
  const nombre = selectedVersion?.nombre || org.nombre;
  const abreviacion = (selectedVersion?.abreviacion || org.abreviacion || '').trim() || '—';
  const rawRif = selectedVersion ? selectedVersion.rif : org.rif;
  const displayRif =
    rawRif && rawRif !== 'RIF No Registrado' ? rawRif : 'Sin RIF registrado';
  const direccion =
    (selectedVersion ? selectedVersion.direccion_fiscal : org.direccion_fiscal) ||
    'No especificada';
  const verNum = selectedVersion?.version_numero || org.version_actual_numero || 1;
  const verIsActive = selectedVersion ? selectedVersion.es_version_actual : true;
  const notas = selectedVersion?.notas_version;

  return `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Razón Social</span>
        <p class="text-xs font-bold text-slate-900">${escapeHtml(nombre)}</p>
      </div>
      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Abreviación</span>
        <p class="text-xs font-mono font-bold text-sky-800">${escapeHtml(abreviacion)}</p>
      </div>
      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">RIF / NIF Fiscal</span>
        <p class="text-xs font-mono font-bold text-slate-900">${escapeHtml(displayRif)}</p>
      </div>
      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Versión Visualizada</span>
        <p class="text-xs font-bold ${verIsActive ? 'text-sky-800' : 'text-amber-800'} tabular-nums">
          ${verIsActive ? `Versión Actual · v${verNum}` : `Versión Histórica · v${verNum} · Solo lectura`}
        </p>
      </div>
      <div class="sm:col-span-2 bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Dirección Fiscal</span>
        <p class="text-xs font-medium text-slate-800">${escapeHtml(direccion)}</p>
      </div>
      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Conglomerado</span>
        <p class="text-xs font-semibold text-slate-900 truncate" title="${escapeHtml(parentGroupName)}">${escapeHtml(parentGroupName)}</p>
      </div>
      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Certificados Activos / Emitidos</span>
        <p class="text-xs font-bold text-slate-900 tabular-nums">${activeCount} activos (${totalCount} emitidos)</p>
      </div>
      ${
        notas
          ? `
            <div class="sm:col-span-2 lg:col-span-4 bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
              <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Notas de Versión (v${verNum})</span>
              <p class="text-xs text-slate-700">${escapeHtml(notas)}</p>
            </div>
          `
          : ''
      }
    </div>
  `;
}

function renderOrganizacionFormBody(opts: {
  draft: OrganizacionFormDraft;
  mode: OrganizacionDetailMode;
  org?: OrganizacionEntity;
  activeVersion?: OrganizacionVersionEntity;
  allOrgs: ReadonlyArray<OrganizacionEntity>;
  conglomerados: ReadonlyArray<ConglomeradoEntity>;
  currentGroupOrgCount: number;
}): string {
  const { draft, mode, org, activeVersion, allOrgs, conglomerados, currentGroupOrgCount } = opts;
  const isAddMode = mode === 'add';
  const sortedGroups = conglomerados
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  const selectedGroupId = draft.id_grupo_empresarial || '';
  const orgCountByGroup = new Map<string, number>();
  for (const o of allOrgs) {
    if (o.deleted_at || !o.id_grupo_empresarial) continue;
    orgCountByGroup.set(
      o.id_grupo_empresarial,
      (orgCountByGroup.get(o.id_grupo_empresarial) || 0) + 1
    );
  }

  let rebucketPreviewHtml = '';
  if (!isAddMode && org && selectedGroupId && selectedGroupId !== org.id_grupo_empresarial) {
    const plan = planOrganizationRebucket(org.id, selectedGroupId, allOrgs, conglomerados);
    if (plan.valid) {
      const sourceName =
        conglomerados.find((g) => g.id === plan.sourceGroupId)?.nombre ||
        org.grupo_empresarial_nombre ||
        'Conglomerado origen';
      rebucketPreviewHtml = plan.willArchiveSourceGroup
        ? `
          <p class="text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-1.5">
            El conglomerado origen («${escapeHtml(sourceName)}») quedará vacío y se archivará automáticamente al guardar.
          </p>
        `
        : `
          <p class="text-[11px] font-medium text-sky-800 bg-sky-50 border border-sky-200 rounded-lg px-2.5 py-1.5 mt-1.5">
            El conglomerado «${escapeHtml(sourceName)}» conservará ${plan.sourceRemainingOrgCount} organización${plan.sourceRemainingOrgCount === 1 ? '' : 'es'}.
          </p>
        `;
    }
  }

  const canSeparateToIndividual =
    !isAddMode && org && currentGroupOrgCount > 1;
  const activeVerNum = activeVersion?.version_numero || org?.version_actual_numero || 1;

  return `
    <form id="organizacionDetailForm" class="space-y-3" novalidate>
      ${
        !isAddMode
          ? `
            <p class="text-[11px] font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              Edición libre sobre la versión activa <strong>v${activeVerNum}</strong>: actualiza estos atributos sin crear una nueva versión.
            </p>
          `
          : ''
      }
      <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
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
          <label for="orgAbreviacionInput" class="block text-xs font-bold text-slate-700">
            Abreviación <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <input
            type="text"
            id="orgAbreviacionInput"
            name="abreviacion"
            required
            maxlength="${ORG_ABREVIACION_MAX_LENGTH}"
            value="${escapeHtml(draft.abreviacion || '')}"
            placeholder="Ej. MET-VAL"
            class="w-full text-xs font-mono uppercase p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
          />
          <p id="orgAbreviacionHint" class="text-[11px] text-slate-500">
            Código corto único (máx. ${ORG_ABREVIACION_MAX_LENGTH} caracteres).
          </p>
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
        <div class="flex flex-wrap items-center justify-between gap-2">
          <label for="orgGrupoEmpresarialSelect" class="block text-xs font-bold text-slate-700">
            Conglomerado Empresarial
          </label>
          ${
            canSeparateToIndividual && org
              ? `
                <button
                  type="button"
                  id="separateOrgToIndividualBtn"
                  data-action="separate-org-to-individual"
                  data-org-id="${escapeHtml(org.id)}"
                  class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-700 transition-colors cursor-pointer"
                >
                  <span>Separar a grupo individual propio</span>
                </button>
              `
              : ''
          }
        </div>
        <select
          id="orgGrupoEmpresarialSelect"
          name="id_grupo_empresarial"
          class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
        >
          ${
            isAddMode
              ? `<option value="" ${!selectedGroupId ? 'selected' : ''}>Automático — Crear conglomerado individual propio (1:1)</option>`
              : ''
          }
          ${sortedGroups
            .map((g) => {
              const count = orgCountByGroup.get(g.id) || 0;
              return `<option value="${escapeHtml(g.id)}" ${
                g.id === selectedGroupId ? 'selected' : ''
              }>${escapeHtml(g.nombre)} (${count} org${count === 1 ? '' : 's'})</option>`;
            })
            .join('')}
        </select>
        ${rebucketPreviewHtml}
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

function renderCreateOrganizacionVersionForm(opts: {
  draft: OrganizacionFormDraft;
  activeVersion: OrganizacionVersionEntity;
}): string {
  const { draft, activeVersion } = opts;
  const nextVersionNumber = activeVersion.version_numero + 1;

  return `
    <form id="organizacionVersionForm" class="space-y-3" novalidate>
      <div class="rounded-xl border border-sky-200 bg-sky-50/80 px-3.5 py-2.5 text-xs text-sky-900 space-y-0.5">
        <div class="font-bold">Crear Nueva Versión (v${nextVersionNumber})</div>
        <p class="text-[11px] text-sky-800">
          Para versionar esta organización debe modificar al menos un campo (Razón Social, Abreviación, RIF o Dirección Fiscal) respecto a la versión activa v${activeVersion.version_numero}.
        </p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div class="md:col-span-2 bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
          <label for="orgVersionNombreInput" class="block text-xs font-bold text-slate-700">
            Razón Social <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <input
            type="text"
            id="orgVersionNombreInput"
            name="nombre"
            required
            maxlength="${ORG_NOMBRE_MAX_LENGTH}"
            value="${escapeHtml(draft.nombre)}"
            placeholder="Ej. Industrias Alfa S.A."
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
          />
        </div>

        <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
          <label for="orgVersionAbreviacionInput" class="block text-xs font-bold text-slate-700">
            Abreviación <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <input
            type="text"
            id="orgVersionAbreviacionInput"
            name="abreviacion"
            required
            maxlength="${ORG_ABREVIACION_MAX_LENGTH}"
            value="${escapeHtml(draft.abreviacion || '')}"
            placeholder="Ej. MET-VAL"
            class="w-full text-xs font-mono uppercase p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
          />
          <p id="orgVersionAbreviacionHint" class="text-[11px] text-slate-500">
            Código corto único (máx. ${ORG_ABREVIACION_MAX_LENGTH} caracteres).
          </p>
        </div>

        <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
          <label for="orgVersionRifInput" class="block text-xs font-bold text-slate-700">
            RIF / NIF Fiscal
          </label>
          <input
            type="text"
            id="orgVersionRifInput"
            name="rif"
            maxlength="${ORG_RIF_MAX_LENGTH}"
            value="${escapeHtml(draft.rif)}"
            placeholder="Ej. J-40192831-2"
            class="w-full text-xs font-mono p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
          />
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
          <label for="orgVersionDireccionInput" class="block text-xs font-bold text-slate-700">
            Dirección Fiscal
          </label>
          <textarea
            id="orgVersionDireccionInput"
            name="direccion_fiscal"
            rows="2"
            placeholder="Zona Industrial, Parcela 14, Valencia..."
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
          >${escapeHtml(draft.direccion_fiscal)}</textarea>
        </div>

        <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
          <label for="orgVersionNotasInput" class="block text-xs font-bold text-slate-700">
            Notas de Versión (Opcional)
          </label>
          <textarea
            id="orgVersionNotasInput"
            name="notas_version"
            rows="2"
            placeholder="Motivo del cambio de razón social, abreviación o domicilio fiscal..."
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
          >${escapeHtml(draft.notas_version || '')}</textarea>
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-end gap-2 pt-1">
        <button
          type="button"
          data-action="cancel-create-org-version"
          class="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors cursor-pointer whitespace-nowrap"
        >
          Cancelar
        </button>
        <button
          type="button"
          data-action="submit-create-org-version"
          class="px-4 py-2 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold transition-colors cursor-pointer shadow-2xs whitespace-nowrap"
        >
          Confirmar Nueva Versión
        </button>
      </div>
    </form>
  `;
}

interface HistoricalCertVersionLinkRow {
  id: string;
  id_certificado: string;
  numero_certificado: string;
  norma: string;
  esquema?: string;
  version_numero: number;
  es_version_actual: boolean;
  estatus: string;
  id_organizacion_version: string;
}

function countCertVersionsForOrgVersion(
  detailedCerts: ReadonlyArray<CertificadoDetailEntity>,
  orgVersionId: string
): number {
  let count = 0;
  for (const cert of detailedCerts) {
    if (cert.deleted_at) continue;
    const versions = (cert.versiones || []).filter((v) => !v.deleted_at);
    if (versions.length > 0) {
      for (const v of versions) {
        if (v.id_organizacion_version === orgVersionId) {
          count += 1;
        }
      }
    } else if (cert.id_organizacion_version === orgVersionId) {
      count += 1;
    }
  }
  return count;
}

function collectHistoricalCertVersionRows(
  detailedCerts: ReadonlyArray<CertificadoDetailEntity>,
  orgVersionId: string
): HistoricalCertVersionLinkRow[] {
  const rows: HistoricalCertVersionLinkRow[] = [];
  for (const cert of detailedCerts) {
    if (cert.deleted_at) continue;
    const versions = (cert.versiones || []).filter((v) => !v.deleted_at);
    if (versions.length > 0) {
      for (const v of versions) {
        if (v.id_organizacion_version === orgVersionId) {
          rows.push({
            id: v.id,
            id_certificado: cert.id,
            numero_certificado: cert.numero_certificado,
            norma: cert.norma_codigo || cert.norma_titulo || 'ISO',
            esquema: cert.esquema,
            version_numero: v.version_numero,
            es_version_actual: Boolean(v.es_version_actual),
            estatus: v.estatus || cert.estatus,
            id_organizacion_version: v.id_organizacion_version,
          });
        }
      }
    } else if (cert.id_organizacion_version === orgVersionId) {
      rows.push({
        id: cert.id_certificado_version || cert.id,
        id_certificado: cert.id,
        numero_certificado: cert.numero_certificado,
        norma: cert.norma_codigo || cert.norma_titulo || 'ISO',
        esquema: cert.esquema,
        version_numero: cert.version_actual_numero || 1,
        es_version_actual: true,
        estatus: cert.estatus,
        id_organizacion_version: orgVersionId,
      });
    }
  }
  return rows;
}

function getCertStatusBadgeClass(estatus: string): string {
  const estatusClean = (estatus || 'Activo').toLowerCase();
  if (estatusClean.includes('estudio') || estatusClean.includes('proceso')) {
    return 'bg-amber-50 text-amber-800 border-amber-200';
  }
  if (estatusClean.includes('suspendido')) {
    return 'bg-rose-50 text-rose-800 border-rose-200';
  }
  if (estatusClean.includes('cancelado') || estatusClean.includes('inactivo')) {
    return 'bg-slate-100 text-slate-600 border-slate-200';
  }
  return 'bg-emerald-50 text-emerald-800 border-emerald-200';
}

function renderChildCertificatesTable(opts: {
  certificados: CertificadoSummary[];
  detailedCerts: ReadonlyArray<CertificadoDetailEntity>;
  org: OrganizacionEntity;
  selectedVersion?: OrganizacionVersionEntity;
  isHistoricalSelected: boolean;
  isStaff: boolean;
  tableColumnWidths?: Record<string, Record<string, number>>;
}): string {
  const {
    certificados,
    detailedCerts,
    org,
    selectedVersion,
    isHistoricalSelected,
    isStaff,
    tableColumnWidths,
  } = opts;

  if (isHistoricalSelected && selectedVersion) {
    const historicalRows = collectHistoricalCertVersionRows(detailedCerts, selectedVersion.id);
    if (historicalRows.length === 0) {
      return `
        <div class="p-8 text-center bg-slate-50/70 border border-slate-200 rounded-xl space-y-2">
          <div class="text-2xl" aria-hidden="true">📜</div>
          <h4 class="text-xs font-bold text-slate-800">
            Ninguna versión de certificado apunta históricamente a v${selectedVersion.version_numero}
          </h4>
          <p class="text-xs text-slate-500 max-w-md mx-auto">
            Todas las versiones de certificado vigentes de ${escapeHtml(org.nombre)} fueron vinculadas a una versión posterior de la organización.
          </p>
        </div>
      `;
    }

    const histColumns: ColumnDefinition<HistoricalCertVersionLinkRow>[] = [
      {
        id: 'numero_certificado',
        header: 'Código',
        defaultWidthPct: 22,
        minWidthPx: 120,
        renderCell: (row) => `
          <span class="font-mono font-bold text-slate-900 inline-flex items-center gap-1.5">
            <span aria-hidden="true">📜</span>
            <span>${escapeHtml(row.numero_certificado)}</span>
          </span>
        `,
      },
      {
        id: 'norma',
        header: 'Norma de Gestión',
        defaultWidthPct: 28,
        minWidthPx: 130,
        renderCell: (row) => `
          <div class="font-semibold text-slate-800 truncate">${escapeHtml(row.norma)}</div>
          ${row.esquema ? `<div class="text-[10px] text-slate-400 truncate">${escapeHtml(row.esquema)}</div>` : ''}
        `,
      },
      {
        id: 'version_cert',
        header: 'Versión Cert.',
        align: 'center',
        defaultWidthPct: 16,
        minWidthPx: 95,
        renderCell: (row) => `
          <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200 tabular-nums">
            v${row.version_numero} · ${row.es_version_actual ? 'Actual' : 'Histórica'}
          </span>
        `,
      },
      {
        id: 'vinculacion_org',
        header: 'Vinculación Org.',
        align: 'center',
        defaultWidthPct: 20,
        minWidthPx: 120,
        renderCell: () => `
          <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap tabular-nums">
            Org v${selectedVersion.version_numero} (Histórica)
          </span>
        `,
      },
      {
        id: 'estatus',
        header: 'Estatus',
        align: 'center',
        defaultWidthPct: 14,
        minWidthPx: 90,
        renderCell: (row) => `
          <span class="inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${getCertStatusBadgeClass(row.estatus)}">
            ${escapeHtml(row.estatus)}
          </span>
        `,
      },
    ];

    return `
      <div class="pb-2.5">
        <p class="text-xs text-slate-600">
          Versiones de certificado vinculadas históricamente a <strong>v${selectedVersion.version_numero}</strong> (${escapeHtml(selectedVersion.nombre)}).
        </p>
      </div>
      ${renderListViewTable({
        tableId: 'org-tab-certificados',
        columns: histColumns,
        items: historicalRows,
        columnWidths: tableColumnWidths?.['org-tab-certificados'],
        getRowAttrs: (row) =>
          `data-action="drilldown-to-cert" data-cert-id="${escapeHtml(row.id_certificado)}" data-cert-code="${escapeHtml(row.numero_certificado)}" title="Abrir certificado ${escapeHtml(row.numero_certificado)}"`,
      })}
    `;
  }

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

  const detailByCertId = new Map<string, CertificadoDetailEntity>();
  for (const det of detailedCerts) {
    detailByCertId.set(det.id, det);
  }
  const versionsById = new Map<string, OrganizacionVersionEntity>();
  for (const v of resolveOrgVersionsDescending(org)) {
    versionsById.set(v.id, v);
  }

  const columns: ColumnDefinition<CertificadoSummary>[] = [
    {
      id: 'numero_certificado',
      header: 'Código',
      defaultWidthPct: 22,
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
      defaultWidthPct: 14,
      minWidthPx: 95,
      renderCell: (c) => {
        const emision = c.fecha_emision ? c.fecha_emision.slice(0, 4) : '—';
        const vencimiento = c.fecha_vencimiento ? c.fecha_vencimiento.slice(0, 4) : '—';
        return `<span class="font-mono text-slate-600">${escapeHtml(emision)} — ${escapeHtml(vencimiento)}</span>`;
      },
    },
    {
      id: 'vinculacion_org',
      header: 'Versión Org.',
      align: 'center',
      defaultWidthPct: 14,
      minWidthPx: 95,
      renderCell: (c) => {
        const det = detailByCertId.get(c.id);
        const linkedOrgVerId = det?.id_organizacion_version || selectedVersion?.id || '';
        const linkedOrgVer = linkedOrgVerId ? versionsById.get(linkedOrgVerId) : undefined;
        const orgVerNum = linkedOrgVer?.version_numero || selectedVersion?.version_numero || 1;
        const certVerNum = det?.version_actual_numero || 1;
        return `
          <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap tabular-nums">
            Cert v${certVerNum} · Org v${orgVerNum}
          </span>
        `;
      },
    },
    {
      id: 'sedes',
      header: 'Sedes',
      align: 'center',
      defaultWidthPct: 12,
      minWidthPx: 90,
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
      defaultWidthPct: 12,
      minWidthPx: 90,
      renderCell: (c) => `
        <span class="inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${getCertStatusBadgeClass(c.estatus)}">
          ${escapeHtml(c.estatus)}
        </span>
      `,
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

export function renderOrganizacionCertResolutionModal(
  modalState: OrganizacionCertResolutionModalState,
  orgName?: string
): string {
  if (!modalState.isOpen) return '';

  const errorBannerHtml = modalState.errorMessage
    ? `
      <div role="alert" class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800 flex items-center gap-2">
        <span aria-hidden="true">⚠️</span>
        <span>${escapeHtml(modalState.errorMessage)}</span>
      </div>
    `
    : '';

  const rowsHtml = modalState.items
    .map((item) => {
      const selectId = `orgCertResSelect-${escapeHtml(item.id_certificado_version)}`;
      const isActual = Boolean(item.es_version_actual);
      const selectedAction: CertVersionOrgAction =
        item.action === 'MANTENER_ANTERIOR' || item.action === 'VINCULAR_NUEVA'
          ? item.action
          : isActual
          ? 'VINCULAR_NUEVA'
          : 'MANTENER_ANTERIOR';

      return `
        <tr class="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70">
          <td class="px-3 py-2.5 align-middle">
            <div class="font-mono text-xs font-bold text-slate-900 truncate" title="${escapeHtml(item.numero_certificado)}">
              ${escapeHtml(item.numero_certificado)}
            </div>
            <div class="text-[11px] text-slate-600 truncate">${escapeHtml(item.norma_codigo)}</div>
          </td>
          <td class="px-3 py-2.5 align-middle text-center">
            <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200 tabular-nums">
              v${item.version_numero}
            </span>
          </td>
          <td class="px-3 py-2.5 align-middle text-center">
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${
              isActual
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-amber-50 text-amber-800 border-amber-200'
            }">
              ${isActual ? 'Versión Actual' : 'Versión Histórica'}
            </span>
          </td>
          <td class="px-3 py-2.5 align-middle">
            <label for="${selectId}" class="sr-only">
              Decisión para ${escapeHtml(item.numero_certificado)} v${item.version_numero}
            </label>
            <select
              id="${selectId}"
              data-action="change-org-cert-resolution"
              data-org-cert-res-id="${escapeHtml(item.id_certificado_version)}"
              ${modalState.submitting ? 'disabled' : ''}
              class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
            >
              <option value="MANTENER_ANTERIOR" ${
                selectedAction === 'MANTENER_ANTERIOR' ? 'selected' : ''
              }>${escapeHtml(CERT_VERSION_ORG_ACTION_LABELS.MANTENER_ANTERIOR)}</option>
              <option value="VINCULAR_NUEVA" ${
                selectedAction === 'VINCULAR_NUEVA' ? 'selected' : ''
              }>${escapeHtml(CERT_VERSION_ORG_ACTION_LABELS.VINCULAR_NUEVA)}</option>
            </select>
          </td>
        </tr>
      `;
    })
    .join('');

  return `
    <div
      id="orgCertResolutionModalBackdrop"
      class="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="orgCertResolutionModalTitle"
    >
      <div class="w-full max-w-4xl bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden my-auto">
        <header class="px-5 py-4 border-b border-slate-200 bg-slate-50/70 space-y-1">
          <h2 id="orgCertResolutionModalTitle" class="text-sm font-bold text-slate-900">
            Vincular versiones de certificado a la nueva versión de organización (v${modalState.newOrgVersionNumero})
          </h2>
          <p class="text-xs text-slate-600">
            ${
              orgName
                ? `${escapeHtml(orgName)} · `
                : ''
            }Defina qué versiones de certificado permanecen en la versión anterior y cuáles se vinculan a v${modalState.newOrgVersionNumero}.
          </p>
        </header>

        <div class="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          ${errorBannerHtml}
          <div class="overflow-x-auto border border-slate-200 rounded-xl">
            <table id="orgCertResolutionTable" class="w-full table-fixed text-left border-collapse">
              <colgroup>
                <col style="width: 27%" />
                <col style="width: 13%" />
                <col style="width: 18%" />
                <col style="width: 42%" />
              </colgroup>
              <thead class="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th scope="col" class="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Certificado y Norma
                  </th>
                  <th scope="col" class="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 text-center">
                    Versión Cert.
                  </th>
                  <th scope="col" class="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 text-center">
                    Estado Actual
                  </th>
                  <th scope="col" class="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Decisión
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 bg-white">
                ${rowsHtml}
              </tbody>
            </table>
          </div>
        </div>

        <footer class="px-5 py-3.5 border-t border-slate-200 bg-slate-50/70 flex items-center justify-end gap-3">
          <button
            type="button"
            id="confirmOrgCertResolutionBtn"
            data-action="confirm-org-cert-resolution"
            ${modalState.submitting ? 'disabled' : ''}
            class="px-4 py-2 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold transition-colors cursor-pointer shadow-2xs whitespace-nowrap disabled:opacity-50"
          >
            ${modalState.submitting ? 'Confirmando...' : 'Confirmar Vinculación'}
          </button>
        </footer>
      </div>
    </div>
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
