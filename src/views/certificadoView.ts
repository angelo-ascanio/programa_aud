import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { INITIAL_ORGANIZACIONES, type OrganizacionEntity } from '../lib/activeCertificates';
import {
  countMultisiteBranches,
  createCertificadoFormDraftFromEntity,
  createEmptyCertificadoFormDraft,
  filterSubsectoresBySectorIaf,
  formatContactEmailsSummary,
  formatContactPhonesSummary,
  formatMultisiteBranchCountText,
  getFechaTemporalStatus,
  getFechaTipoVisual,
  sortSitesWithPrincipalFirst,
  getProcessTypeVisual,
  type CertCoverageMapFilter,
  type CertificadoDetailEntity,
  type CertificadoDetailMode,
  type CertificadoFormDraft,
  type CertificadoViewState,
  type CertificadoChildTab,
  type ContactoCertificadoEntity,
  type FechaCertificadoEntity,
  type SiteEntity,
  type ProcessEntity,
  type ShiftEntity,
  type NonApplicableRequirementEntity,
  type AuditEntity,
} from '../lib/multisiteSampling';
import {
  INITIAL_ESTATUS_CATALOG,
  INITIAL_NORMAS,
  INITIAL_SECTORES_IAF,
  INITIAL_SUBSECTORES_IAF,
  type EstatusCatalogItem,
  type NormaEntity,
  type RequisitoLtree,
  type SectorIafEntity,
  type SubsectorIafEntity,
} from '../lib/extraDomain';
import {
  computeProcessDownwardCoverageCount,
  countExcludedSubtreeDescendants,
  evaluateCertificateCoverage,
  type CertificateCoverageReport,
  type ClauseCoverageNodeResult,
  type ClauseCoverageState,
} from '../lib/coverageEngine';
import { getAllSeededNormaRequirements } from '../lib/procesoDomain';
import {
  computeReactiveFacetCounts,
  filterRecordsWithFacets,
  sortItems,
  type ColumnDefinition,
  type MultiViewFacetCategory,
  type MultiViewSelectionMap,
  type SortState,
} from '../lib/universalTemplate';
import { renderListViewTable, renderUniversalTemplate } from './universalTemplate';
import { renderDetailPageTemplate, type DetailChildTab } from './detailTemplate';
import {
  canArchiveRecord,
  extractUniversalArchiveProps,
  renderArchivarButtonHtml,
  type ArchiveMultiViewConfig,
} from '../lib/archiveGovernance';

export type { CertificadoViewState, CertificadoChildTab, CertificadoDetailMode };

export interface CertificadoViewProps {
  profile: UserProfile;
  state: CertificadoViewState;
  certificates: CertificadoDetailEntity[];
  organizaciones?: OrganizacionEntity[];
  normas?: NormaEntity[];
  estatusList?: EstatusCatalogItem[];
  sectores?: SectorIafEntity[];
  subsectores?: SubsectorIafEntity[];
  requirementsCatalog?: ReadonlyArray<RequisitoLtree>;
  archivedProcesoIds?: ReadonlySet<string>;
  archivedNoAplicableIds?: ReadonlySet<string>;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  columnWidths?: Record<string, number>;
  tableColumnWidths?: Record<string, Record<string, number>>;
}

/**
 * Returns canonical operational status styling.
 */
function getStatusBadge(status: string): { label: string; badgeClass: string; dotClass: string } {
  const norm = (status || '').toUpperCase();
  switch (norm) {
    case 'ACTIVO':
    case 'VIGENTE':
      return {
        label: 'ACTIVO',
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        dotClass: 'bg-emerald-500',
      };
    case 'ESTUDIO':
    case 'EN_PROCESO':
      return {
        label: 'EN ESTUDIO',
        badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
        dotClass: 'bg-sky-500',
      };
    case 'SUSPENDIDO':
      return {
        label: 'SUSPENDIDO',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
        dotClass: 'bg-amber-500',
      };
    case 'CANCELADO':
    case 'INACTIVO':
      return {
        label: 'CANCELADO',
        badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
        dotClass: 'bg-rose-500',
      };
    case 'PLANIFICADO':
    case 'PLANIFICADA':
      return {
        label: 'PLANIFICADO',
        badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
        dotClass: 'bg-indigo-500',
      };
    case 'EN EJECUCIÓN':
    case 'EN EJECUCION':
      return {
        label: 'EN EJECUCIÓN',
        badgeClass: 'bg-teal-50 text-teal-800 border-teal-200',
        dotClass: 'bg-teal-500',
      };
    default:
      return {
        label: status || 'DESCONOCIDO',
        badgeClass: 'bg-slate-50 text-slate-700 border-slate-200',
        dotClass: 'bg-slate-400',
      };
  }
}

/**
 * Primary view entry point: Renders either the universal directory or the 4-zone detail page.
 */
export function renderCertificadoView(props: CertificadoViewProps): string {
  const {
    profile,
    state,
    certificates,
    organizaciones = [],
    normas = INITIAL_NORMAS,
    estatusList = INITIAL_ESTATUS_CATALOG,
    sectores = INITIAL_SECTORES_IAF,
    subsectores = INITIAL_SUBSECTORES_IAF,
    requirementsCatalog,
    archivedProcesoIds,
    archivedNoAplicableIds,
    loading = false,
    archiveConfig,
    columnWidths,
    tableColumnWidths,
  } = props;

  const isStaff =
    profile.status === 'APPROVED' &&
    (profile.role === 'ADMIN' || profile.role === 'WORKER');

  if (state.selectedCertId) {
    const selectedCert = certificates.find((c) => c.id === state.selectedCertId);
    if (selectedCert) {
      return renderCertificadoDetailPage({
        profile,
        state,
        cert: selectedCert,
        organizaciones: organizaciones.length > 0 ? organizaciones : INITIAL_ORGANIZACIONES,
        normas,
        estatusList,
        sectores,
        subsectores,
        requirementsCatalog,
        archivedProcesoIds,
        archivedNoAplicableIds,
        tableColumnWidths,
      });
    }
  }

  if (!state.selectedCertId && state.isCreating && isStaff) {
    return renderCertificadoDetailPage({
      profile,
      state,
      organizaciones: organizaciones.length > 0 ? organizaciones : INITIAL_ORGANIZACIONES,
      normas,
      estatusList,
      sectores,
      subsectores,
      requirementsCatalog,
      archivedProcesoIds,
      archivedNoAplicableIds,
      tableColumnWidths,
    });
  }

  return renderCertificadoDirectory(
    profile,
    state,
    certificates,
    loading,
    archiveConfig,
    columnWidths
  );
}

/**
 * Renders the Universal Multi View Directory for Certificados (Decluttered Clean Layout).
 * NOTE: The "Cobertura Normativa" column is strictly excluded from the list view.
 */
function renderCertificadoDirectory(
  profile: UserProfile,
  state: CertificadoViewState,
  allCertificates: CertificadoDetailEntity[],
  loading: boolean,
  archiveConfig?: ArchiveMultiViewConfig,
  columnWidths?: Record<string, number>
): string {
  const isStaff =
    (profile.role === 'ADMIN' || profile.role === 'WORKER') &&
    (!profile.status || profile.status === 'APPROVED');

  const sectorMap = new Map<number, string>();
  for (const cert of allCertificates) {
    if (cert.sector_iaf) {
      sectorMap.set(cert.sector_iaf, cert.sector_iaf_descripcion || `Sector ${cert.sector_iaf}`);
    }
  }
  const sectorEntries = Array.from(sectorMap.entries()).sort(([a], [b]) => a - b);

  const facetCategories: MultiViewFacetCategory<CertificadoDetailEntity>[] = [
    {
      id: 'estatus',
      label: 'Estatus',
      extractValues: (c) => c.estatus,
    },
    {
      id: 'norma',
      label: 'Norma ISO',
      extractValues: (c) => c.norma_codigo,
    },
    {
      id: 'sector_iaf',
      label: 'Sector IAF',
      options: sectorEntries.map(([num, desc]) => ({
        value: String(num),
        label: `Sector ${num} · ${desc}`,
      })),
      extractValues: (c) => String(c.sector_iaf),
    },
    {
      id: 'modalidad',
      label: 'Modalidad',
      options: [
        { value: 'MULTISITIO', label: 'Multisitio' },
        { value: 'SEDE_UNICA', label: 'Sede Única' },
      ],
      extractValues: (c) =>
        c.multisitio || countMultisiteBranches(c.sitios) > 0 ? 'MULTISITIO' : 'SEDE_UNICA',
    },
  ];

  const effectiveSelections: MultiViewSelectionMap = state.facetSelections
    ? state.facetSelections
    : {
        estatus:
          state.selectedStatus !== 'ALL' ? new Set([state.selectedStatus]) : new Set<string>(),
        norma:
          state.selectedStandard !== 'ALL' ? new Set([state.selectedStandard]) : new Set<string>(),
        sector_iaf:
          state.selectedSectorIaf !== 'ALL' ? new Set([state.selectedSectorIaf]) : new Set<string>(),
        modalidad: new Set<string>(),
      };

  const searchOptions = {
    getSearchableText: (cert: CertificadoDetailEntity) =>
      [
        cert.numero_certificado,
        cert.organizacion_nombre,
        cert.organizacion_rif,
        cert.norma_codigo,
        cert.esquema,
        cert.alcance,
        cert.sector_iaf_descripcion,
      ].join(' '),
  };

  const filtered = filterRecordsWithFacets(
    allCertificates,
    state.query,
    facetCategories,
    effectiveSelections,
    searchOptions
  );

  const sorted = sortItems(filtered, state.sortColumn, state.sortDirection, (cert, col) => {
    switch (col) {
      case 'numero_certificado':
        return cert.numero_certificado;
      case 'organizacion':
        return cert.organizacion_nombre;
      case 'norma':
        return cert.norma_codigo;
      case 'estatus':
        return cert.estatus;
      case 'vigencia':
        return cert.fecha_vencimiento || '';
      case 'sedes':
        return countMultisiteBranches(cert.sitios);
      default:
        return '';
    }
  });

  const facetGroups = computeReactiveFacetCounts(
    allCertificates,
    state.query,
    facetCategories,
    effectiveSelections,
    searchOptions
  );

  // MANDATORY CLEAN LIST RULE (Step 2.1):
  // Exact 6 domain columns: Organización, Código de Certificado, Norma, Sedes Multisitio, Estatus, Vigencia.
  // Zero "Acciones" column and zero interactive controls inside table cells (full-row click on <tr>).
  const columns: ColumnDefinition<CertificadoDetailEntity>[] = [
    {
      id: 'organizacion',
      header: 'Organización',
      sortable: true,
      defaultWidthPct: 23,
      minWidthPx: 140,
      renderCell: (cert) => `
        <div class="min-w-0 text-left">
          <div
            class="font-bold text-slate-900 truncate"
            title="${escapeHtml(cert.organizacion_nombre)}"
          >
            ${escapeHtml(cert.organizacion_nombre)}
          </div>
          <div
            class="text-[11px] font-mono text-slate-500 font-normal truncate"
            title="RIF: ${escapeHtml(cert.organizacion_rif)}"
          >
            RIF: ${escapeHtml(cert.organizacion_rif)}
          </div>
        </div>
      `,
    },
    {
      id: 'numero_certificado',
      header: 'Código de Certificado',
      sortable: true,
      defaultWidthPct: 19,
      minWidthPx: 120,
      renderCell: (cert) => `
        <span
          title="${escapeHtml(cert.numero_certificado)}"
          class="inline-block max-w-full truncate font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 align-middle"
        >
          📜 ${escapeHtml(cert.numero_certificado)}
        </span>
      `,
    },
    {
      id: 'norma',
      header: 'Norma',
      sortable: true,
      defaultWidthPct: 16,
      minWidthPx: 100,
      renderCell: (cert) => `
        <div class="min-w-0">
          <div class="font-semibold text-slate-800 truncate" title="${escapeHtml(cert.norma_codigo)}">
            ${escapeHtml(cert.norma_codigo)}
          </div>
          <div class="text-[11px] text-slate-500 truncate" title="${escapeHtml(cert.esquema)}">
            ${escapeHtml(cert.esquema)}
          </div>
        </div>
      `,
    },
    {
      id: 'sedes',
      header: 'Sedes Multisitio',
      sortable: true,
      align: 'center',
      defaultWidthPct: 17,
      minWidthPx: 110,
      renderCell: (cert) => {
        const branchCount = countMultisiteBranches(cert.sitios);
        const branchText = formatMultisiteBranchCountText(branchCount);
        return `
          <span
            title="${escapeHtml(branchText)}"
            class="inline-flex max-w-full items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
              branchCount > 0 ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-slate-100 text-slate-600'
            }"
          >
            <span class="shrink-0">${branchCount > 0 ? '🏢' : '📍'}</span>
            <span class="truncate">${escapeHtml(branchText)}</span>
          </span>
        `;
      },
    },
    {
      id: 'estatus',
      header: 'Estatus',
      sortable: true,
      align: 'center',
      defaultWidthPct: 13,
      minWidthPx: 95,
      renderCell: (cert) => {
        const statusVisual = getStatusBadge(cert.estatus);
        return `
          <span
            title="${escapeHtml(statusVisual.label)}"
            class="inline-flex max-w-full items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${statusVisual.badgeClass}"
          >
            <span class="w-1.5 h-1.5 shrink-0 rounded-full ${statusVisual.dotClass}"></span>
            <span class="truncate">${escapeHtml(statusVisual.label)}</span>
          </span>
        `;
      },
    },
    {
      id: 'vigencia',
      header: 'Vigencia',
      sortable: true,
      align: 'right',
      defaultWidthPct: 12,
      minWidthPx: 95,
      renderCell: (cert) => `
        <div
          title="${escapeHtml(cert.fecha_emision)} → ${escapeHtml(cert.fecha_vencimiento)}"
          class="min-w-0 font-mono text-[11px] text-slate-700 tabular-nums leading-tight"
        >
          <div class="truncate">${escapeHtml(cert.fecha_emision)}</div>
          <div class="text-slate-400 truncate">→ ${escapeHtml(cert.fecha_vencimiento)}</div>
        </div>
      `,
    },
  ];

  const renderCard = (cert: CertificadoDetailEntity): string => {
    const branchCount = countMultisiteBranches(cert.sitios);
    const branchText = formatMultisiteBranchCountText(branchCount);
    const statusVisual = getStatusBadge(cert.estatus);

    return `
      <div
        data-action="select-cert"
        data-cert-id="${escapeHtml(cert.id)}"
        class="bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-5 shadow-xs hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between space-y-4 group"
      >
        <div class="space-y-2">
          <div class="flex items-center justify-between gap-2">
            <span class="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              📜 ${escapeHtml(cert.numero_certificado)}
            </span>
            <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${statusVisual.badgeClass}">
              <span class="w-1.5 h-1.5 rounded-full ${statusVisual.dotClass}"></span>
              <span>${escapeHtml(statusVisual.label)}</span>
            </span>
          </div>

          <div>
            <h3 class="text-base font-bold text-slate-900 group-hover:text-sky-700 transition-colors">
              ${escapeHtml(cert.organizacion_nombre)}
            </h3>
            <div class="flex items-center gap-2 text-xs text-slate-500 pt-0.5">
              <span class="font-mono">RIF: ${escapeHtml(cert.organizacion_rif)}</span>
              <span>·</span>
              <span>${escapeHtml(cert.norma_codigo)}</span>
            </div>
          </div>
        </div>

        <div class="text-xs text-slate-600 bg-slate-50/75 p-3 rounded-lg border border-slate-100 space-y-1.5">
          <div class="flex items-center justify-between gap-2">
            <span class="text-slate-500 text-[11px]">Sector IAF ${cert.sector_iaf}:</span>
            <span class="font-medium text-slate-800 truncate max-w-[200px] xl:max-w-[300px]" title="${escapeHtml(cert.sector_iaf_descripcion)}">
              ${escapeHtml(cert.sector_iaf_descripcion)}
            </span>
          </div>
          <div class="flex items-center justify-between pt-1 border-t border-slate-200/50">
            <span class="text-slate-500 text-[11px]">Esquema Multisitio:</span>
            <span class="font-medium text-slate-800 inline-flex items-center gap-1">
              <span>${branchCount > 0 ? '🏢' : '📍'}</span>
              <span>${branchText}</span>
            </span>
          </div>
        </div>

        <div class="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span class="font-mono text-[11px] tabular-nums">Vigencia: ${escapeHtml(cert.fecha_vencimiento)}</span>
        </div>
      </div>
    `;
  };

  const actionsHtml = isStaff
    ? `
      <button
        type="button"
        data-action="open-create-cert"
        title="Nuevo Certificado"
        aria-label="Nuevo Certificado"
        class="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-sky-700 hover:bg-sky-800 text-white transition-colors cursor-pointer shadow-2xs shrink-0"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      </button>
    `
    : '';

  return renderUniversalTemplate<CertificadoDetailEntity>({
    domainKey: 'certificados',
    tableId: 'certificados-main',
    title: 'Certificados de Conformidad',
    subtitle:
      'Gestión de certificados emitidos bajo ISO/IEC 17021-1:2015, alcance técnico, sedes multisitio y trazabilidad',
    entityLabel: 'certificados registrados',
    searchQuery: state.query,
    searchPlaceholder: 'Buscar por N° Certificado, organización, RIF, norma o alcance... (Presione "/" para enfocar)',
    searchInputId: 'certDirectorySearchInput',
    clearSearchBtnId: 'clearCertSearchBtn',
    totalCount: allCertificates.length,
    filteredCount: sorted.length,
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen ?? true,
    sortState: {
      column: state.sortColumn,
      direction: state.sortDirection,
    },
    columnWidths,
    getRowAttrs: (cert) =>
      `data-action="select-cert" data-cert-id="${escapeHtml(cert.id)}" title="Abrir detalle de ${escapeHtml(cert.numero_certificado)}"`,
    facetGroups,
    items: sorted,
    columns,
    renderCard,
    emptyStateTitle: 'No se encontraron certificados',
    emptyStateMessage:
      'No hay registros que coincidan con el término de búsqueda o las facetas seleccionadas.',
    actionsHtml,
    loading,
    loadingMessage: 'Cargando certificados emitidos...',
    ...extractUniversalArchiveProps(archiveConfig, 'certificados'),
  });
}

export interface RenderCertificadoDetailPageParams {
  profile: UserProfile;
  state: CertificadoViewState;
  cert?: CertificadoDetailEntity;
  organizaciones?: OrganizacionEntity[];
  normas?: NormaEntity[];
  estatusList?: EstatusCatalogItem[];
  sectores?: SectorIafEntity[];
  subsectores?: SubsectorIafEntity[];
  requirementsCatalog?: ReadonlyArray<RequisitoLtree>;
  archivedProcesoIds?: ReadonlySet<string>;
  archivedNoAplicableIds?: ReadonlySet<string>;
  tableColumnWidths?: Record<string, Record<string, number>>;
}

/**
 * Resolves the active Certificado Detail mode with strict RBAC enforcement:
 * Non-staff users (`CLIENT` / `AUDITOR` / unapproved) always resolve to `'read'`.
 */
export function resolveCertificadoDetailMode(
  state: CertificadoViewState,
  isStaff: boolean,
  selectedCert?: CertificadoDetailEntity
): CertificadoDetailMode {
  if (!isStaff) {
    return 'read';
  }
  if (state.isCreating && !state.selectedCertId) {
    return 'add';
  }
  if (selectedCert && state.isEditingAttributes) {
    return 'edit';
  }
  return 'read';
}

interface ParentFieldCardSpec {
  selectId: string;
  name: keyof Pick<
    CertificadoFormDraft,
    'id_organizacion' | 'id_norma' | 'id_estatus' | 'id_sector_iaf' | 'id_subsector_iaf'
  >;
  label: string;
  symbol: string;
  selectedValue: string;
  options: Array<{ id: string; label: string }>;
  navAction?: {
    nav: string;
    subview: string;
    entityType: string;
    entityId: string;
    sectorNumber?: number;
    targetTab?: string;
    entityValue: string;
  };
}

function renderCertificadoParentFieldsZone(params: {
  mode: CertificadoDetailMode;
  draft: CertificadoFormDraft;
  cert?: CertificadoDetailEntity;
  organizaciones: OrganizacionEntity[];
  normas: NormaEntity[];
  estatusList: EstatusCatalogItem[];
  sectores: SectorIafEntity[];
  subsectores: SubsectorIafEntity[];
}): string {
  const { mode, draft, cert, organizaciones, normas, estatusList, sectores, subsectores } = params;
  const isReadOnly = mode === 'read';

  // Defensively ensure current cert FKs are present in catalog options
  const mergedOrganizaciones: OrganizacionEntity[] = [...organizaciones];
  if (cert?.id_organizacion && !mergedOrganizaciones.some((o) => o.id === cert.id_organizacion)) {
    mergedOrganizaciones.push({
      id: cert.id_organizacion,
      nombre: cert.organizacion_nombre || 'Organización asignada',
      rif: cert.organizacion_rif || 'N/D',
    });
  }

  const mergedNormas: NormaEntity[] = [...normas];
  if (cert?.id_norma && !mergedNormas.some((n) => n.id === cert.id_norma)) {
    mergedNormas.push({
      id: cert.id_norma,
      codigo: cert.norma_codigo || 'Norma asignada',
      titulo: cert.norma_titulo || cert.norma_codigo || 'Norma asignada',
      estatus: 'Vigente',
      esquema: cert.esquema || 'SGC',
      fecha_publicacion: '',
      norma: cert.norma_codigo || 'Norma asignada',
      clausulas_count: 0,
      acreditaciones_count: 0,
    });
  }

  const mergedEstatus: EstatusCatalogItem[] = [...estatusList];
  if (cert?.id_estatus && !mergedEstatus.some((e) => e.id === cert.id_estatus)) {
    mergedEstatus.push({
      id: cert.id_estatus,
      estatus: cert.estatus || 'Estatus asignado',
      descripcion: cert.estatus || 'Estatus asignado',
      categoria_aplicable: 'Certificados',
      color_token: 'slate',
      usage_count: 0,
    });
  }

  const mergedSectores: SectorIafEntity[] = [...sectores];
  if (cert?.id_sector_iaf && !mergedSectores.some((s) => s.id === cert.id_sector_iaf)) {
    mergedSectores.push({
      id: cert.id_sector_iaf,
      sector: cert.sector_iaf,
      descripcion: cert.sector_iaf_descripcion || `Sector ${cert.sector_iaf}`,
      subsectores_count: 0,
      auditores_count: 0,
    });
  }
  mergedSectores.sort((a, b) => a.sector - b.sector);

  const mergedSubsectores: SubsectorIafEntity[] = [...subsectores];
  if (cert?.id_subsector_iaf && !mergedSubsectores.some((sub) => sub.id === cert.id_subsector_iaf)) {
    mergedSubsectores.push({
      id: cert.id_subsector_iaf,
      id_sector_iaf: cert.id_sector_iaf,
      sector_numero: cert.sector_iaf,
      codigo: cert.subsector_iaf_codigo || `${cert.sector_iaf}.1`,
      descripcion: cert.subsector_iaf_descripcion || 'Sub-Sector IAF asignado',
      categoria_riesgo: cert.subsector_categoria_riesgo || 'MEDIO',
      auditores_nombres: [],
    });
  }

  const filteredSubsectores = filterSubsectoresBySectorIaf({
    sectorId: draft.id_sector_iaf,
    sectores: mergedSectores,
    subsectores: mergedSubsectores,
  });

  const subsectorDisplayValue = cert
    ? cert.subsector_iaf_codigo && cert.subsector_iaf_descripcion
      ? `${cert.subsector_iaf_codigo} · ${cert.subsector_iaf_descripcion}`
      : cert.subsector_iaf_codigo
      ? `Sub-Sector ${cert.subsector_iaf_codigo}`
      : cert.subsector_categoria_riesgo
      ? `Riesgo ${cert.subsector_categoria_riesgo}`
      : 'Sub-Sector IAF asignado'
    : '';

  const fields: ParentFieldCardSpec[] = [
    {
      selectId: 'certParentOrganizacionSelect',
      name: 'id_organizacion',
      label: 'Organización',
      symbol: '🏢',
      selectedValue: draft.id_organizacion,
      options: mergedOrganizaciones.map((o) => ({
        id: o.id,
        label: o.rif ? `${o.nombre} (${o.rif})` : o.nombre,
      })),
      navAction: cert
        ? {
            nav: 'certificacion',
            subview: 'organizations',
            entityType: 'org',
            entityId: cert.id_organizacion,
            entityValue: `${cert.organizacion_nombre} (${cert.organizacion_rif})`,
          }
        : undefined,
    },
    {
      selectId: 'certParentNormaSelect',
      name: 'id_norma',
      label: 'Norma',
      symbol: '📘',
      selectedValue: draft.id_norma,
      options: mergedNormas.map((n) => ({
        id: n.id,
        label: n.codigo,
      })),
      navAction: cert
        ? {
            nav: 'extra',
            subview: 'standards',
            entityType: 'norma',
            entityId: cert.id_norma,
            entityValue: cert.norma_codigo,
          }
        : undefined,
    },
    {
      selectId: 'certParentEstatusSelect',
      name: 'id_estatus',
      label: 'Estatus',
      symbol: '🏷️',
      selectedValue: draft.id_estatus,
      options: mergedEstatus.map((e) => ({
        id: e.id,
        label: e.estatus,
      })),
      navAction: cert
        ? {
            nav: 'extra',
            subview: 'estatus',
            entityType: 'estatus',
            entityId: cert.id_estatus || cert.estatus,
            entityValue: cert.estatus,
          }
        : undefined,
    },
    {
      selectId: 'certParentSectorIafSelect',
      name: 'id_sector_iaf',
      label: 'Sector IAF',
      symbol: '🏭',
      selectedValue: draft.id_sector_iaf,
      options: mergedSectores.map((s) => ({
        id: s.id,
        label: `Sector ${s.sector} · ${s.descripcion}`,
      })),
      navAction: cert
        ? {
            nav: 'extra',
            subview: 'iaf',
            entityType: 'sector_iaf',
            entityId: cert.id_sector_iaf,
            sectorNumber: cert.sector_iaf,
            entityValue: `Sector ${cert.sector_iaf} · ${cert.sector_iaf_descripcion}`,
          }
        : undefined,
    },
    {
      selectId: 'certParentSubsectorIafSelect',
      name: 'id_subsector_iaf',
      label: 'Sub-Sector IAF',
      symbol: '🧩',
      selectedValue: draft.id_subsector_iaf,
      options: filteredSubsectores.map((sub) => ({
        id: sub.id,
        label: `${sub.codigo} · ${sub.descripcion}`,
      })),
      navAction: cert
        ? {
            nav: 'extra',
            subview: 'iaf',
            entityType: 'subsector_iaf',
            entityId: cert.id_subsector_iaf,
            sectorNumber: cert.sector_iaf,
            entityValue: subsectorDisplayValue,
          }
        : undefined,
    },
  ];

  const selectControlClass = isReadOnly
    ? 'w-full rounded-lg border border-slate-200 bg-slate-100/80 text-slate-800 cursor-not-allowed px-2.5 py-1.5 text-xs font-semibold truncate'
    : 'w-full rounded-lg border border-slate-300 bg-white text-slate-900 px-2.5 py-1.5 text-xs font-semibold focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none truncate';

  return `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5">
      ${fields
        .map((field) => {
          const navBtnHtml =
            isReadOnly && field.navAction
              ? `
                <button
                  type="button"
                  data-parent-nav="true"
                  data-nav="${escapeHtml(field.navAction.nav)}"
                  data-subview="${escapeHtml(field.navAction.subview)}"
                  data-parent-type="${escapeHtml(field.navAction.entityType)}"
                  data-entity-id="${escapeHtml(field.navAction.entityId)}"
                  ${
                    field.navAction.sectorNumber !== undefined
                      ? `data-sector-number="${escapeHtml(String(field.navAction.sectorNumber))}"`
                      : ''
                  }
                  ${
                    field.navAction.targetTab
                      ? `data-target-tab="${escapeHtml(field.navAction.targetTab)}"`
                      : ''
                  }
                  data-entity-value="${escapeHtml(field.navAction.entityValue)}"
                  title="Abrir ${escapeHtml(field.label)}: ${escapeHtml(field.navAction.entityValue)}"
                  aria-label="Abrir ${escapeHtml(field.label)}"
                  class="inline-flex items-center justify-center w-5 h-5 rounded border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-600 hover:text-indigo-800 text-[11px] font-bold transition-colors cursor-pointer shrink-0"
                >
                  →
                </button>
              `
              : '';

          return `
            <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-1.5 min-w-0">
              <div class="flex items-center justify-between gap-2">
                <label
                  for="${escapeHtml(field.selectId)}"
                  class="text-[10px] font-bold uppercase tracking-wider text-slate-500 inline-flex items-center gap-1 min-w-0 truncate"
                >
                  <span aria-hidden="true" class="shrink-0">${field.symbol}</span>
                  <span class="truncate">${escapeHtml(field.label)}</span>
                  <span class="text-rose-600 shrink-0" aria-hidden="true">*</span>
                </label>
                ${navBtnHtml}
              </div>
              <select
                id="${escapeHtml(field.selectId)}"
                name="${escapeHtml(field.name)}"
                form="certificadoDetailForm"
                required
                ${isReadOnly ? 'disabled' : ''}
                class="${selectControlClass}"
              >
                <option value="" ${field.selectedValue === '' ? 'selected' : ''}>Seleccione...</option>
                ${field.options
                  .map(
                    (opt) =>
                      `<option value="${escapeHtml(opt.id)}" ${
                        opt.id === field.selectedValue ? 'selected' : ''
                      }>${escapeHtml(opt.label)}</option>`
                  )
                  .join('')}
              </select>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderCertificadoRecordFieldsZone(params: {
  mode: CertificadoDetailMode;
  draft: CertificadoFormDraft;
  cert?: CertificadoDetailEntity;
}): string {
  const { mode, draft, cert } = params;
  const isReadOnly = mode === 'read';
  const alcanceLength = draft.alcance.length;
  const isAlcanceTooShort = alcanceLength < 10;
  const isAlcanceTooLong = alcanceLength > 1000;
  const showShortWarning =
    !isReadOnly && ((mode === 'edit' && isAlcanceTooShort) || (mode === 'add' && alcanceLength > 0 && isAlcanceTooShort));

  const branchCount = cert ? countMultisiteBranches(cert.sitios) : 0;
  const multisitioStatusSummary = cert
    ? draft.multisitio
      ? `Sí · Esquema Multisitio (${formatMultisiteBranchCountText(branchCount)})`
      : 'No · Sede Única (Principal)'
    : draft.multisitio
    ? 'Sí · Esquema Multisitio'
    : 'No · Sede Única';

  const inputControlClass = isReadOnly
    ? 'w-full px-3 py-1.5 bg-slate-100/80 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800 cursor-not-allowed'
    : 'w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-slate-900 focus:outline-none';

  const textareaControlClass = isReadOnly
    ? 'w-full p-2.5 bg-slate-100/80 border border-slate-200 rounded-lg text-xs text-slate-800 font-sans leading-relaxed cursor-not-allowed resize-none'
    : `w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 font-sans focus:ring-2 focus:ring-slate-900 focus:outline-none leading-relaxed ${
        showShortWarning || isAlcanceTooLong ? 'border-rose-300 focus:ring-rose-500' : ''
      }`;

  const multisitioContainerClass = isReadOnly
    ? draft.multisitio
      ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900 cursor-not-allowed'
      : 'border-slate-200 bg-slate-100/80 text-slate-600 cursor-not-allowed'
    : 'border-slate-300 bg-white text-slate-800 cursor-pointer';

  const multisitioControlHtml = isReadOnly
    ? `
      <span class="relative inline-flex items-center justify-center w-4 h-4 shrink-0">
        <input
          type="checkbox"
          id="certMultisitioCheckbox"
          name="multisitio"
          ${draft.multisitio ? 'checked' : ''}
          disabled
          class="appearance-none h-4 w-4 rounded border ${
            draft.multisitio
              ? 'border-emerald-600 bg-emerald-600'
              : 'border-slate-300 bg-white'
          } cursor-not-allowed"
        />
        ${
          draft.multisitio
            ? `<svg class="w-3 h-3 text-white pointer-events-none absolute" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="4 10 8 14 16 6" /></svg>`
            : ''
        }
      </span>
    `
    : `
      <input
        type="checkbox"
        id="certMultisitioCheckbox"
        name="multisitio"
        ${draft.multisitio ? 'checked' : ''}
        class="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer shrink-0"
      />
    `;

  return `
    <form id="certificadoDetailForm" class="space-y-3 bg-slate-50/70 p-3 sm:p-3.5 border border-slate-200/90 rounded-xl">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
        <div class="space-y-1">
          <label for="certNumeroInput" class="block text-xs font-bold text-slate-700">
            Número de Certificado <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <input
            type="text"
            id="certNumeroInput"
            name="numero_certificado"
            value="${escapeHtml(draft.numero_certificado)}"
            placeholder="Ej. FN-QMS-2026-001"
            required
            minlength="3"
            maxlength="100"
            ${isReadOnly ? 'disabled' : ''}
            class="${inputControlClass}"
          />
        </div>
        <div class="space-y-1">
          <span class="block text-xs font-bold text-slate-700">
            Esquema Multisitio
          </span>
          <label
            for="certMultisitioCheckbox"
            class="inline-flex items-center justify-between gap-2 w-full px-3 py-1.5 rounded-lg border ${multisitioContainerClass} text-xs ${
              isReadOnly && draft.multisitio ? 'font-bold' : 'font-semibold'
            }"
          >
            <span class="inline-flex items-center gap-2 min-w-0">
              ${multisitioControlHtml}
              <span id="certMultisitioLabelText" class="truncate">${escapeHtml(multisitioStatusSummary)}</span>
            </span>
            <span id="certMultisitioIcon" aria-hidden="true" class="shrink-0">${draft.multisitio ? '🏢' : '📍'}</span>
          </label>
        </div>
      </div>

      <div class="space-y-1">
        <div class="flex items-center justify-between gap-2">
          <label for="certAlcanceInput" class="text-xs font-bold text-slate-700">
            Alcance de la Certificación (ISO/IEC 17021-1:2015 cláusula 8.2.2) <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <span
            id="certAlcanceLiveCounter"
            class="text-xs font-mono font-bold tabular-nums ${
              showShortWarning || isAlcanceTooLong ? 'text-rose-600' : 'text-slate-600'
            }"
          >
            (${alcanceLength} / 1000 caracteres)
          </span>
        </div>
        <textarea
          id="certAlcanceInput"
          name="alcance"
          rows="3"
          required
          minlength="10"
          maxlength="1000"
          placeholder="Describa el alcance técnico de productos, servicios y procesos cubiertos (10 a 1000 caracteres)..."
          ${isReadOnly ? 'disabled' : ''}
          class="${textareaControlClass}"
        >${escapeHtml(draft.alcance)}</textarea>
        ${
          showShortWarning
            ? `<p id="alcanceLengthError" class="text-[11px] text-rose-600 font-medium">⚠️ El texto debe tener al menos 10 caracteres.</p>`
            : isAlcanceTooLong
            ? `<p id="alcanceLengthError" class="text-[11px] text-rose-600 font-medium">⚠️ El texto no puede exceder 1000 caracteres.</p>`
            : ''
        }
      </div>
    </form>
  `;
}

function getCoverageEstadoBadge(estado: ClauseCoverageState): {
  label: string;
  badgeClass: string;
} {
  switch (estado) {
    case 'CUBIERTO':
      return {
        label: 'CUBIERTO',
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      };
    case 'NO_APLICABLE':
      return {
        label: 'NO_APLICABLE',
        badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
      };
    case 'PENDIENTE':
      return {
        label: 'PENDIENTE',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
      };
    case 'PARCIAL':
      return {
        label: 'PARCIAL',
        badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
      };
    case 'MIXTO':
      return {
        label: 'MIXTO',
        badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
      };
    case 'INFORMATIVA':
    default:
      return {
        label: 'INFORMATIVA',
        badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
      };
  }
}

function formatCoverageOriginText(node: ClauseCoverageNodeResult): string {
  if (node.estado === 'CUBIERTO') {
    if (node.directProcessNames.length > 0) {
      return node.directProcessNames.join(', ');
    }
    const inheritedNames = (node.inheritedProcessNames || []).join(', ');
    if (inheritedNames && node.inheritedFromProcessCodigo) {
      return `${inheritedNames} (vía ${node.inheritedFromProcessCodigo})`;
    }
    if (node.inheritedFromProcessCodigo) {
      return `Cubierta vía ${node.inheritedFromProcessCodigo}`;
    }
    return 'Cubierta por proceso';
  }

  if (node.estado === 'NO_APLICABLE') {
    const reasonSuffix = node.exclusionReason ? ` — ${node.exclusionReason}` : '';
    if (node.inheritedExclusionCodigo) {
      return `Excluida bajo ${node.inheritedExclusionCodigo}${reasonSuffix}`;
    }
    return `Exclusión directa ISO 4.3${reasonSuffix}`;
  }

  if (node.estado === 'PENDIENTE') {
    return 'Sin asignar';
  }

  if (node.mandatoryDescendantCount > 0) {
    const resolvedCount = node.coveredDescendantCount + node.excludedDescendantCount;
    return `${resolvedCount}/${node.mandatoryDescendantCount} obligatorias resueltas`;
  }
  return 'Cláusula informativa / estructural';
}

function renderCertificadoCoverageCockpit(params: {
  cert: CertificadoDetailEntity;
  state: CertificadoViewState;
  coverageReport: CertificateCoverageReport;
  isStaff: boolean;
  archivedProcesoIds?: ReadonlySet<string>;
  tableColumnWidths?: Record<string, Record<string, number>>;
}): string {
  const {
    cert,
    state,
    coverageReport,
    isStaff,
    archivedProcesoIds,
    tableColumnWidths,
  } = params;
  const { summary } = coverageReport;

  const isUnassigned =
    summary.totalObligatorios > 0 &&
    !summary.hasAnyDirectAssignments &&
    summary.excluidosNoAplicables === 0;
  const roundedPct = Math.round(summary.porcentajeCobertura * 10) / 10;
  const pctLabel = Number.isInteger(roundedPct) ? String(roundedPct) : roundedPct.toFixed(1);

  const statusPillHtml = isUnassigned
    ? `
      <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border bg-slate-100 text-slate-700 border-slate-200">
        <span class="w-1.5 h-1.5 rounded-full bg-slate-400" aria-hidden="true"></span>
        <span>Sin cobertura asignada</span>
      </span>
    `
    : summary.coberturaCompleta
    ? `
      <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border bg-emerald-50 text-emerald-800 border-emerald-200">
        <span>✓ Cobertura Normativa Completa (${escapeHtml(pctLabel)}%)</span>
      </span>
    `
    : `
      <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border bg-amber-50 text-amber-800 border-amber-200">
        <span>⚠️ Cobertura Incompleta · Faltan ${summary.pendientes} cláusula${summary.pendientes === 1 ? '' : 's'} obligatoria${summary.pendientes === 1 ? '' : 's'}</span>
      </span>
    `;

  const denom = Math.max(1, summary.totalObligatorios);
  const coveredWidth =
    summary.totalObligatorios === 0
      ? 100
      : Math.min(100, (summary.cubiertosPorProceso / denom) * 100);
  const excludedWidth =
    summary.totalObligatorios === 0
      ? 0
      : Math.min(100 - coveredWidth, (summary.excluidosNoAplicables / denom) * 100);
  const pendingWidth = Math.max(0, 100 - coveredWidth - excludedWidth);

  const isMapOpen = Boolean(state.isCoverageMapOpen);

  let drawerHtml = '';
  if (isMapOpen) {
    const defaultFilter: CertCoverageMapFilter =
      summary.pendientes > 0 ? 'PENDIENTE' : 'ALL_MANDATORY';
    const activeFilter: CertCoverageMapFilter = state.coverageMapFilter ?? defaultFilter;

    const informativeNodes = coverageReport.nodes.filter((n) => !n.es_obligatorio);
    const filterButtons: Array<{
      id: CertCoverageMapFilter;
      label: string;
      count: number;
    }> = [
      { id: 'PENDIENTE', label: 'Pendientes', count: summary.pendientes },
      { id: 'ALL_MANDATORY', label: 'Todas Obligatorias', count: summary.totalObligatorios },
      { id: 'CUBIERTO', label: 'Cubiertas', count: summary.cubiertosPorProceso },
      { id: 'NO_APLICABLE', label: 'No Aplicables', count: summary.excluidosNoAplicables },
      { id: 'INFORMATIVA', label: 'Informativas', count: informativeNodes.length },
    ];

    const filteredNodes = coverageReport.nodes.filter((n) => {
      switch (activeFilter) {
        case 'PENDIENTE':
          return n.es_obligatorio && n.estado === 'PENDIENTE';
        case 'ALL_MANDATORY':
          return n.es_obligatorio;
        case 'CUBIERTO':
          return n.es_obligatorio && n.estado === 'CUBIERTO';
        case 'NO_APLICABLE':
          return n.es_obligatorio && n.estado === 'NO_APLICABLE';
        case 'INFORMATIVA':
          return !n.es_obligatorio;
        default:
          return n.es_obligatorio;
      }
    });

    const selectedPendingId = state.selectedPendingRequisitoId || null;
    const selectedPendingNode = selectedPendingId
      ? filteredNodes.find(
          (n) => n.id_requisito === selectedPendingId && n.estado === 'PENDIENTE'
        ) ||
        coverageReport.nodes.find(
          (n) => n.id_requisito === selectedPendingId && n.estado === 'PENDIENTE'
        )
      : undefined;

    const activeProcesos = (cert.procesos || []).filter(
      (p) => !archivedProcesoIds?.has(p.id)
    );

    const quickResolveBarHtml =
      isStaff && selectedPendingNode
        ? `
          <div
            data-testid="coverage-quick-resolve-bar"
            class="flex flex-wrap items-center justify-between gap-2.5 px-3 py-2 rounded-xl border border-amber-300 bg-amber-50/90"
          >
            <div class="flex items-center gap-2 min-w-0">
              <span class="px-2 py-0.5 rounded bg-amber-100 border border-amber-300 font-mono text-xs font-bold text-amber-900 shrink-0">
                ${escapeHtml(selectedPendingNode.codigo)}
              </span>
              <span class="text-xs font-semibold text-amber-950 truncate" title="${escapeHtml(selectedPendingNode.titulo)}">
                ${escapeHtml(selectedPendingNode.titulo)}
              </span>
            </div>
            <div class="flex flex-wrap items-center gap-2 shrink-0">
              ${
                activeProcesos.length > 0
                  ? `
                    <div class="inline-flex items-center gap-1.5">
                      <select
                        id="coverageQuickAssignProcesoSelect"
                        aria-label="Seleccionar proceso para asignar cláusula pendiente"
                        class="text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-800 px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 max-w-[220px]"
                      >
                        <option value="">Asignar a Proceso ▾</option>
                        ${activeProcesos
                          .map(
                            (p) =>
                              `<option value="${escapeHtml(p.id)}">${escapeHtml(p.nombre_proceso)} (${escapeHtml(p.tipo)})</option>`
                          )
                          .join('')}
                      </select>
                      <button
                        type="button"
                        data-action="quick-assign-pending-clause"
                        data-cert-id="${escapeHtml(cert.id)}"
                        data-requisito-id="${escapeHtml(selectedPendingNode.id_requisito)}"
                        class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer"
                      >
                        <span>✓ Asignar</span>
                      </button>
                    </div>
                  `
                  : `
                    <button
                      type="button"
                      data-action="open-create-proceso"
                      data-cert-id="${escapeHtml(cert.id)}"
                      class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer"
                    >
                      <span>+ Crear Proceso</span>
                    </button>
                  `
              }
              <button
                type="button"
                data-action="quick-declare-non-applicable"
                data-cert-id="${escapeHtml(cert.id)}"
                data-requisito-id="${escapeHtml(selectedPendingNode.id_requisito)}"
                class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-800 text-xs font-bold transition-colors cursor-pointer"
              >
                <span aria-hidden="true">🚫</span>
                <span>Declarar No Aplicable</span>
              </button>
              <button
                type="button"
                data-action="clear-pending-clause-selection"
                title="Deseleccionar cláusula"
                aria-label="Deseleccionar cláusula"
                class="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-amber-200 bg-white hover:bg-amber-100 text-amber-800 text-xs font-bold transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>
          </div>
        `
        : '';

    const columns: ColumnDefinition<ClauseCoverageNodeResult>[] = [
      {
        id: 'codigo',
        header: 'Cláusula',
        sortable: false,
        defaultWidthPct: 15,
        minWidthPx: 100,
        renderCell: (node) => {
          const isSelected =
            node.estado === 'PENDIENTE' && selectedPendingNode?.id_requisito === node.id_requisito;
          return `
            <span class="inline-flex items-center gap-1 whitespace-nowrap font-mono text-xs font-bold px-2 py-0.5 rounded border ${
              isSelected
                ? 'bg-amber-100 text-amber-950 border-amber-400 ring-2 ring-amber-300/70'
                : 'bg-slate-100 text-slate-900 border-slate-200'
            }" title="${escapeHtml(node.codigo)}">
              ${isSelected ? '<span aria-hidden="true" class="text-amber-700">▶</span>' : ''}
              <span>${escapeHtml(node.codigo)}</span>
            </span>
          `;
        },
      },
      {
        id: 'titulo',
        header: 'Requisito Normativo',
        sortable: false,
        defaultWidthPct: 35,
        minWidthPx: 160,
        renderCell: (node) => `
          <span class="block text-xs font-semibold text-slate-800 truncate" title="${escapeHtml(node.titulo)}">
            ${escapeHtml(node.titulo)}
          </span>
        `,
      },
      {
        id: 'estado',
        header: 'Estado Cobertura',
        sortable: false,
        align: 'center',
        defaultWidthPct: 18,
        minWidthPx: 120,
        renderCell: (node) => {
          const visual = getCoverageEstadoBadge(node.estado);
          return `
            <span class="inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-full text-[11px] font-bold border ${visual.badgeClass}">
              ${escapeHtml(visual.label)}
            </span>
          `;
        },
      },
      {
        id: 'origen',
        header: 'Asignación / Origen',
        sortable: false,
        defaultWidthPct: 32,
        minWidthPx: 160,
        renderCell: (node) => {
          const originText = formatCoverageOriginText(node);
          const mutedClass =
            node.estado === 'PENDIENTE'
              ? 'text-amber-800 font-semibold'
              : node.estado === 'NO_APLICABLE'
              ? 'text-rose-800'
              : node.estado === 'CUBIERTO'
              ? 'text-emerald-800 font-medium'
              : 'text-slate-500';
          return `
            <span class="block text-xs ${mutedClass} truncate" title="${escapeHtml(originText)}">
              ${escapeHtml(originText)}
            </span>
          `;
        },
      },
    ];

    const tableHtml = renderListViewTable({
      tableId: 'cert-coverage-map',
      items: filteredNodes,
      columns,
      sortState: DEFAULT_CHILD_SORT,
      columnWidths: tableColumnWidths?.['cert-coverage-map'],
      getRowAttrs: (node) => {
        const isSelected =
          node.estado === 'PENDIENTE' && selectedPendingNode?.id_requisito === node.id_requisito;
        const owningProcesoId =
          node.directProcessIds[0] || node.inheritedProcessIds?.[0] || '';
        const owningProcesoName =
          node.directProcessNames[0] || node.inheritedProcessNames?.[0] || 'Proceso';
        const exclusionId = node.effectiveExclusionId || node.exclusionId || '';
        const rowTitle =
          node.estado === 'CUBIERTO' && owningProcesoId
            ? `Abrir proceso: ${owningProcesoName}`
            : node.estado === 'NO_APLICABLE' && exclusionId
            ? `Abrir exclusión cláusula ${node.codigo}`
            : node.estado === 'PENDIENTE'
            ? `Seleccionar cláusula pendiente ${node.codigo}`
            : `Abrir requisito ${node.codigo}`;

        return `data-action="select-coverage-map-row" data-coverage-state="${escapeHtml(node.estado)}" data-requisito-id="${escapeHtml(node.id_requisito)}" data-cert-id="${escapeHtml(cert.id)}" ${owningProcesoId ? `data-proceso-id="${escapeHtml(owningProcesoId)}"` : ''} ${exclusionId ? `data-no-aplicable-id="${escapeHtml(exclusionId)}"` : ''} ${isSelected ? 'data-selected-pending="true"' : ''} title="${escapeHtml(rowTitle)}"`;
      },
      emptyStateTitle:
        activeFilter === 'PENDIENTE'
          ? 'Sin cláusulas obligatorias pendientes'
          : 'Sin cláusulas en esta categoría',
      emptyStateMessage:
        activeFilter === 'PENDIENTE'
          ? 'Todas las cláusulas obligatorias de la norma cuentan con cobertura de procesos o exclusión ISO 4.3.'
          : 'No hay cláusulas registradas bajo el filtro seleccionado.',
    });

    drawerHtml = `
      <div
        data-testid="cert-coverage-map-drawer"
        class="pt-3 mt-3 border-t border-slate-200/80 space-y-3"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div role="group" aria-label="Filtros del Mapa de Cobertura" class="flex flex-wrap items-center gap-1.5">
            ${filterButtons
              .map((btn) => {
                const active = btn.id === activeFilter;
                return `
                  <button
                    type="button"
                    data-action="set-cert-coverage-filter"
                    data-coverage-filter="${btn.id}"
                    aria-pressed="${active ? 'true' : 'false'}"
                    class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                      active
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }"
                  >
                    <span>${escapeHtml(btn.label)}</span>
                    <span class="px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      active ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-700'
                    }">
                      ${btn.count}
                    </span>
                  </button>
                `;
              })
              .join('')}
          </div>
          <span class="text-[11px] text-slate-500">
            Mostrando ${filteredNodes.length} cláusula${filteredNodes.length === 1 ? '' : 's'}
          </span>
        </div>

        ${quickResolveBarHtml}
        <div class="overflow-x-auto max-h-[420px] overflow-y-auto rounded-xl">
          <div class="min-w-[680px]">
            ${tableHtml}
          </div>
        </div>
      </div>
    `;
  }

  return `
    <section
      data-testid="cert-coverage-hud"
      aria-label="Panel de cobertura normativa del certificado"
      class="rounded-xl border border-slate-200/90 bg-slate-50/75 p-3 sm:p-3.5"
    >
      <div class="flex flex-wrap items-center justify-between gap-2.5">
        <div class="flex flex-wrap items-center gap-2 min-w-0">
          <span class="text-xs font-bold uppercase tracking-wider text-slate-500">
            Cobertura Normativa (${escapeHtml(cert.norma_codigo)})
          </span>
          ${statusPillHtml}
        </div>

        <button
          type="button"
          data-action="toggle-cert-coverage-map"
          aria-expanded="${isMapOpen ? 'true' : 'false'}"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors cursor-pointer shrink-0 ${
            isMapOpen
              ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700 shadow-2xs'
              : 'bg-white text-slate-800 border-slate-300 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-800 shadow-2xs'
          }"
        >
          <span aria-hidden="true">📊</span>
          <span>${isMapOpen ? 'Ocultar Mapa de Cobertura' : 'Ver Mapa de Cobertura'}</span>
        </button>
      </div>

      <div class="mt-2.5 space-y-1.5">
        <svg
          viewBox="0 0 100 8"
          preserveAspectRatio="none"
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow="${Math.round(summary.porcentajeCobertura)}"
          aria-label="Progreso de cobertura normativa (${escapeHtml(pctLabel)}%)"
          class="w-full h-2.5 rounded-full overflow-hidden bg-slate-200 block"
        >
          <rect x="0" y="0" width="${coveredWidth.toFixed(2)}" height="8" class="fill-emerald-500" />
          <rect x="${coveredWidth.toFixed(2)}" y="0" width="${excludedWidth.toFixed(2)}" height="8" class="fill-rose-400" />
          <rect x="${(coveredWidth + excludedWidth).toFixed(2)}" y="0" width="${pendingWidth.toFixed(2)}" height="8" class="fill-amber-400" />
        </svg>

        <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] font-medium text-slate-600">
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span class="inline-flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-emerald-500 shrink-0" aria-hidden="true"></span>
              <span>Cubiertas por Procesos: <strong class="text-slate-900 tabular-nums">${summary.cubiertosPorProceso}</strong></span>
            </span>
            <span class="inline-flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-rose-400 shrink-0" aria-hidden="true"></span>
              <span>No Aplicables ISO 4.3: <strong class="text-slate-900 tabular-nums">${summary.excluidosNoAplicables}</strong></span>
            </span>
            <span class="inline-flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-amber-400 shrink-0" aria-hidden="true"></span>
              <span>Pendientes: <strong class="text-slate-900 tabular-nums">${summary.pendientes}</strong></span>
            </span>
          </div>
          <span class="font-mono font-bold text-slate-800 tabular-nums">
            Total Obligatorias: ${summary.totalObligatorios} (${escapeHtml(pctLabel)}%)
          </span>
        </div>
      </div>

      ${drawerHtml}
    </section>
  `;
}

/**
 * Standardized Unified Detail Page (Read disabled / Add enabled / Edit enabled) & List-Only Child Tabs
 */
export function renderCertificadoDetailPage(
  params: RenderCertificadoDetailPageParams
): string {
  const {
    profile,
    state,
    cert,
    organizaciones = INITIAL_ORGANIZACIONES,
    normas = INITIAL_NORMAS,
    estatusList = INITIAL_ESTATUS_CATALOG,
    sectores = INITIAL_SECTORES_IAF,
    subsectores = INITIAL_SUBSECTORES_IAF,
    requirementsCatalog,
    archivedProcesoIds,
    archivedNoAplicableIds,
    tableColumnWidths,
  } = params;

  const isStaff =
    profile.status === 'APPROVED' &&
    (profile.role === 'ADMIN' || profile.role === 'WORKER');
  const detailMode = resolveCertificadoDetailMode(state, isStaff, cert);
  const isCreateMode = detailMode === 'add';

  const draft: CertificadoFormDraft =
    detailMode === 'add'
      ? state.formDraft ?? createEmptyCertificadoFormDraft()
      : detailMode === 'edit'
      ? state.formDraft ??
        (cert
          ? {
              ...createCertificadoFormDraftFromEntity(cert),
              numero_certificado:
                state.editFormData?.numero_certificado ?? cert.numero_certificado,
              multisitio: state.editFormData?.multisitio ?? cert.multisitio,
              alcance: state.editFormData?.alcance ?? cert.alcance,
            }
          : createEmptyCertificadoFormDraft())
      : cert
      ? createCertificadoFormDraftFromEntity(cert)
      : createEmptyCertificadoFormDraft();

  const validTabs: CertificadoChildTab[] = [
    'sitios',
    'no_aplicables',
    'procesos',
    'turnos',
    'auditorias',
    'fechas',
    'contactos',
  ];
  const activeTab: CertificadoChildTab = validTabs.includes(state.activeChildTab)
    ? state.activeChildTab
    : 'sitios';

  const sortedSites = cert ? sortSitesWithPrincipalFirst(cert.sitios) : [];

  const effectiveCatalog =
    requirementsCatalog && requirementsCatalog.length > 0
      ? requirementsCatalog
      : getAllSeededNormaRequirements();

  const coverageReport =
    !isCreateMode && cert
      ? evaluateCertificateCoverage({
          cert,
          requirementsCatalog: effectiveCatalog,
          archivedProcesoIds,
          archivedNoAplicableIds,
        })
      : null;

  const coverageHudHtml =
    detailMode === 'read' && !isCreateMode && cert && coverageReport
      ? renderCertificadoCoverageCockpit({
          cert,
          state,
          coverageReport,
          isStaff,
          archivedProcesoIds,
          tableColumnWidths,
        })
      : '';

  const canArchive = canArchiveRecord(profile);
  const archiveBtnHtml =
    canArchive && cert
      ? renderArchivarButtonHtml({
          tableName: 'certificado',
          recordId: cert.id,
          entityLabel: 'Certificado de Conformidad',
          recordTitle: cert.numero_certificado,
          recordSubtitle: `${cert.organizacion_nombre} · ${cert.norma_codigo}`,
          iconOnly: true,
        })
      : '';

  const trailingActionButtonsHtml =
    isStaff && detailMode === 'read' && cert ? archiveBtnHtml : '';

  const activeErrorMessage =
    detailMode === 'add' ? state.createErrorMessage : state.editErrorMessage;

  const feedbackHtml = activeErrorMessage
    ? `
      <div class="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-medium">
        ⚠️ ${escapeHtml(activeErrorMessage)}
      </div>
    `
    : '';

  const customParentZoneHtml = renderCertificadoParentFieldsZone({
    mode: detailMode,
    draft,
    cert: detailMode === 'add' ? undefined : cert,
    organizaciones,
    normas,
    estatusList,
    sectores,
    subsectores,
  });

  const customRecordBodyHtml = renderCertificadoRecordFieldsZone({
    mode: detailMode,
    draft,
    cert: detailMode === 'add' ? undefined : cert,
  });

  const customTopActionsHtml =
    isStaff && (detailMode === 'add' || detailMode === 'edit')
      ? `
        <button
          type="submit"
          id="saveCertFormBtn"
          form="certificadoDetailForm"
          title="${isCreateMode ? 'Crear certificado' : 'Guardar cambios'}"
          aria-label="${isCreateMode ? 'Crear certificado' : 'Guardar cambios'}"
          class="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-emerald-600 bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-colors cursor-pointer shrink-0"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
            <polyline points="7 3 7 8 15 8" />
          </svg>
        </button>
        <button
          type="button"
          id="cancelEditCertBtn"
          title="${isCreateMode ? 'Cancelar creación' : 'Cancelar edición'}"
          aria-label="${isCreateMode ? 'Cancelar creación' : 'Cancelar edición'}"
          class="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 shadow-2xs transition-colors cursor-pointer shrink-0"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      `
      : undefined;

  const childTabs: DetailChildTab[] =
    !isCreateMode && cert
      ? (() => {
          const procComplete =
            Boolean(coverageReport?.summary.coberturaCompleta) &&
            (coverageReport?.summary.totalObligatorios ?? 0) > 0;
          const procUnassigned =
            !coverageReport?.summary.hasAnyDirectAssignments &&
            (coverageReport?.summary.excluidosNoAplicables ?? 0) === 0;
          const procStatusDotClass = procComplete
            ? 'bg-emerald-500'
            : procUnassigned
            ? 'bg-slate-400'
            : 'bg-amber-500';
          const procBadgeClass = procComplete
            ? 'bg-emerald-100 text-emerald-800'
            : procUnassigned
            ? 'bg-slate-200/80 text-slate-600'
            : 'bg-amber-100 text-amber-800';

          const naCount = cert.noAplicables.length;
          const naStatusDotClass = naCount > 0 ? 'bg-rose-500' : 'bg-slate-400';
          const naBadgeClass =
            naCount > 0 ? 'bg-rose-100 text-rose-800' : 'bg-slate-200/80 text-slate-600';

          return [
            { id: 'sitios', label: 'Sitio', symbol: '📍', count: cert.sitios.length },
            {
              id: 'no_aplicables',
              label: 'No Aplicable',
              symbol: '🚫',
              count: naCount,
              statusDotClass: naStatusDotClass,
              countBadgeClass: naBadgeClass,
            },
            {
              id: 'procesos',
              label: 'Proceso',
              symbol: '⚙️',
              count: cert.procesos.length,
              statusDotClass: procStatusDotClass,
              countBadgeClass: procBadgeClass,
            },
            { id: 'turnos', label: 'Turno', symbol: '⏱️', count: cert.turnos.length },
            { id: 'auditorias', label: 'Auditoría', symbol: '📋', count: cert.auditorias.length },
            { id: 'fechas', label: 'Fecha', symbol: '📅', count: (cert.fechas || []).length },
            {
              id: 'contactos',
              label: 'Contacto',
              symbol: '👤',
              count: (cert.contactos || []).length,
            },
          ];
        })()
      : [];

  return renderDetailPageTemplate({
    entityType: 'Certificado de Conformidad',
    entitySymbol: '📜',
    title: isCreateMode ? 'Nuevo Certificado' : cert?.numero_certificado || 'Certificado',
    backButton: {
      label: 'Volver a Certificados',
      nav: 'certificacion',
      subview: 'certificates',
      action: 'back-to-cert-list',
    },
    editActionButton: {
      id: 'startEditCertBtn',
      visible: isStaff && !isCreateMode,
      isEditing: detailMode === 'edit',
      cancelId: 'cancelEditCertBtn',
    },
    trailingActionButtonsHtml,
    customTopActionsHtml,
    isCreateMode,
    customParentZoneHtml,
    parents: [],
    tableName: 'certificado',
    recordId: cert?.id || '',
    feedbackHtml,
    attributes: [],
    customRecordBodyHtml,
    betweenZone2AndZone3Html: coverageHudHtml,
    childTabs,
    activeChildTabId: activeTab,
    childTabAttrName: 'data-cert-tab',
    renderChildTabContent:
      !isCreateMode && cert
        ? (tabId) =>
            renderActiveChildTab(
              tabId as CertificadoChildTab,
              sortedSites,
              cert,
              state,
              tableColumnWidths,
              isStaff,
              coverageReport
            )
        : undefined,
  });
}

const DEFAULT_CHILD_SORT: SortState = { column: null, direction: 'none' };

/**
 * Dispatches and renders one of the 7 list-view specialized child tabs.
 */
function renderActiveChildTab(
  tab: CertificadoChildTab,
  sortedSites: SiteEntity[],
  cert: CertificadoDetailEntity,
  state: CertificadoViewState,
  tableColumnWidths?: Record<string, Record<string, number>>,
  isStaff = false,
  coverageReport: CertificateCoverageReport | null = null
): string {
  const childSortState = state.childSortState;
  switch (tab) {
    case 'sitios':
      return renderSitiosChildTab(
        sortedSites,
        cert.id,
        childSortState?.sitios || DEFAULT_CHILD_SORT,
        tableColumnWidths?.['cert-tab-sitios'],
        isStaff
      );
    case 'procesos':
      return renderProcesosChildTab(
        cert.procesos,
        cert.id,
        childSortState?.procesos || DEFAULT_CHILD_SORT,
        tableColumnWidths?.['cert-tab-procesos'],
        isStaff,
        coverageReport
      );
    case 'turnos':
      return renderTurnosChildTab(
        cert.turnos,
        cert.id,
        childSortState?.turnos || DEFAULT_CHILD_SORT,
        tableColumnWidths?.['cert-tab-turnos'],
        isStaff
      );
    case 'no_aplicables':
      return renderNoAplicablesChildTab(
        cert.noAplicables,
        cert,
        childSortState?.no_aplicables || DEFAULT_CHILD_SORT,
        tableColumnWidths?.['cert-tab-no_aplicables'],
        isStaff,
        coverageReport
      );
    case 'auditorias':
      return renderAuditoriasChildTab(
        cert.auditorias,
        childSortState?.auditorias || DEFAULT_CHILD_SORT,
        tableColumnWidths?.['cert-tab-auditorias']
      );
    case 'fechas':
      return renderFechasChildTab(
        cert.fechas || [],
        cert.id,
        childSortState?.fechas || DEFAULT_CHILD_SORT,
        tableColumnWidths?.['cert-tab-fechas'],
        isStaff
      );
    case 'contactos':
      return renderContactosChildTab(
        cert.contactos || [],
        cert.id,
        childSortState?.contactos || DEFAULT_CHILD_SORT,
        tableColumnWidths?.['cert-tab-contactos'],
        isStaff
      );
    default:
      return renderSitiosChildTab(
        sortedSites,
        cert.id,
        childSortState?.sitios || DEFAULT_CHILD_SORT,
        tableColumnWidths?.['cert-tab-sitios']
      );
  }
}

/**
 * TAB 1: Sitio (public.sitio) — Sortable, Resizable, Full-Row-Clickable List View
 * MANDATORY REQUIREMENT: Site 0 (Headquarters) is ALWAYS RENDERED FIRST by default (`direction === 'none'`).
 */
function renderSitiosChildTab(
  sites: SiteEntity[],
  certId: string,
  sortState: SortState,
  columnWidths?: Record<string, number>,
  isStaff = false
): string {
  const orderedSites =
    !sortState.column || sortState.direction === 'none'
      ? sortSitesWithPrincipalFirst(sites)
      : sortItems(sites, sortState.column, sortState.direction, (s, col) => {
          switch (col) {
            case 'numero_sitio':
              return s.numero_sitio;
            case 'nombre_sitio':
              return s.nombre_sitio;
            case 'tipo_sitio':
              return s.numero_sitio === 0 ? 'Sede Central / Principal' : 'Sucursal Operativa';
            case 'direccion_sitio':
              return s.direccion_sitio;
            case 'personal_count':
              return s.personal_count ?? -1;
            case 'turnos_vinculados':
              return (s.turnos_vinculados || ['Turno Diurno']).join(', ');
            default:
              return '';
          }
        });

  const columns: ColumnDefinition<SiteEntity>[] = [
    {
      id: 'numero_sitio',
      header: 'N° Sede',
      sortable: true,
      defaultWidthPct: 12,
      minWidthPx: 85,
      renderCell: (site) => {
        const isHq = site.numero_sitio === 0;
        return `
          <span class="inline-block font-mono font-bold text-xs px-2 py-0.5 rounded ${
            isHq
              ? 'bg-slate-900 text-white'
              : 'bg-slate-100 text-slate-800 border border-slate-200'
          }">
            Sede #${site.numero_sitio}
          </span>
        `;
      },
    },
    {
      id: 'nombre_sitio',
      header: 'Nombre de la Sede',
      sortable: true,
      defaultWidthPct: 24,
      minWidthPx: 140,
      renderCell: (site) => {
        const isHq = site.numero_sitio === 0;
        return `
          <div class="min-w-0" title="${escapeHtml(site.nombre_sitio)}">
            <div class="flex items-center gap-1.5 min-w-0">
              <span aria-hidden="true" class="shrink-0">${isHq ? '🏢' : '📍'}</span>
              <span class="font-bold text-indigo-700 truncate">${escapeHtml(site.nombre_sitio)}</span>
            </div>
            ${
              site.actividades
                ? `<p class="text-[11px] text-slate-500 font-normal truncate pt-0.5" title="${escapeHtml(site.actividades)}">${escapeHtml(site.actividades)}</p>`
                : ''
            }
          </div>
        `;
      },
    },
    {
      id: 'tipo_sitio',
      header: 'Tipo de Sede',
      sortable: true,
      defaultWidthPct: 18,
      minWidthPx: 120,
      renderCell: (site) => {
        const isHq = site.numero_sitio === 0;
        return isHq
          ? `
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-amber-50 text-amber-900 border border-amber-300 shadow-2xs">
              <span>★</span>
              <span class="truncate">Sede Central / Principal</span>
            </span>
          `
          : `
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
              <span class="truncate">Sucursal Operativa</span>
            </span>
          `;
      },
    },
    {
      id: 'direccion_sitio',
      header: 'Dirección Física',
      sortable: true,
      defaultWidthPct: 22,
      minWidthPx: 130,
      renderCell: (site) => `
        <span class="block text-slate-700 truncate" title="${escapeHtml(site.direccion_sitio)}">
          ${escapeHtml(site.direccion_sitio)}
        </span>
      `,
    },
    {
      id: 'personal_count',
      header: 'Personal',
      align: 'center',
      sortable: true,
      defaultWidthPct: 10,
      minWidthPx: 80,
      renderCell: (site) => `
        <span class="font-mono font-medium text-slate-700 tabular-nums">
          ${site.personal_count !== undefined ? `${site.personal_count} personas` : '—'}
        </span>
      `,
    },
    {
      id: 'turnos_vinculados',
      header: 'Turnos Asignados',
      sortable: true,
      defaultWidthPct: 14,
      minWidthPx: 100,
      renderCell: (site) => {
        const shifts = site.turnos_vinculados || ['Turno Diurno'];
        return `
          <div class="flex items-center gap-1 overflow-hidden" title="${escapeHtml(shifts.join(', '))}">
            ${shifts
              .map(
                (t) => `
              <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                ${escapeHtml(t)}
              </span>
            `
              )
              .join('')}
          </div>
        `;
      },
    },
  ];

  const tableHtml = renderListViewTable({
    tableId: 'cert-tab-sitios',
    items: orderedSites,
    columns,
    sortState,
    columnWidths,
    getRowAttrs: (site) =>
      `data-action="select-sitio-preview" data-sitio-id="${escapeHtml(site.id)}" data-cert-id="${escapeHtml(certId)}" title="Abrir detalle de ${escapeHtml(site.nombre_sitio)}"`,
    emptyStateTitle: 'Sin sedes registradas',
    emptyStateMessage: 'No hay sedes o plantas registradas para este certificado.',
  });

  if (!isStaff) {
    return tableHtml;
  }

  return `
    <div class="space-y-3">
      <div class="flex items-center justify-end">
        <button
          type="button"
          data-action="open-create-sitio"
          data-cert-id="${escapeHtml(certId)}"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
        >
          <span aria-hidden="true">+</span>
          <span>Nueva Sede</span>
        </button>
      </div>
      ${tableHtml}
    </div>
  `;
}

/**
 * TAB 2: Proceso (public.proceso) — Sortable, Resizable, Full-Row-Clickable List View
 */
function renderProcesosChildTab(
  procesos: ProcessEntity[],
  certId: string,
  sortState: SortState,
  columnWidths?: Record<string, number>,
  isStaff = false,
  coverageReport: CertificateCoverageReport | null = null
): string {
  const sorted = sortItems(procesos, sortState.column, sortState.direction, (p, col) => {
    switch (col) {
      case 'nombre_proceso':
        return p.nombre_proceso;
      case 'tipo':
        return p.tipo;
      case 'responsable':
        return p.responsable || 'Por designar';
      case 'clausulas_cubiertas':
        return p.requisitos_detalle && p.requisitos_detalle.length > 0
          ? p.requisitos_detalle.map((r) => r.codigo).join(', ')
          : p.clausulas_cubiertas.join(', ');
      default:
        return '';
    }
  });

  const columns: ColumnDefinition<ProcessEntity>[] = [
    {
      id: 'nombre_proceso',
      header: 'Proceso',
      sortable: true,
      defaultWidthPct: 26,
      minWidthPx: 140,
      renderCell: (proc) => {
        const visual = getProcessTypeVisual(proc.tipo);
        return `
          <span class="inline-flex items-center gap-1.5 font-bold text-indigo-700 max-w-full" title="${escapeHtml(proc.nombre_proceso)}">
            <span aria-hidden="true" class="shrink-0">${visual.icon}</span>
            <span class="truncate">${escapeHtml(proc.nombre_proceso)}</span>
          </span>
        `;
      },
    },
    {
      id: 'tipo',
      header: 'Tipo',
      sortable: true,
      defaultWidthPct: 14,
      minWidthPx: 95,
      renderCell: (proc) => {
        const visual = getProcessTypeVisual(proc.tipo);
        return `
          <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${visual.badgeClass}">
            <span class="truncate">${escapeHtml(visual.label)}</span>
          </span>
        `;
      },
    },
    {
      id: 'responsable',
      header: 'Responsable',
      sortable: true,
      defaultWidthPct: 20,
      minWidthPx: 115,
      renderCell: (proc) => `
        <span class="block text-slate-700 truncate" title="${escapeHtml(proc.responsable || 'Por designar')}">
          ${escapeHtml(proc.responsable || 'Por designar')}
        </span>
      `,
    },
    {
      id: 'clausulas_cubiertas',
      header: 'Cláusulas Normativas Cubiertas',
      sortable: true,
      defaultWidthPct: 40,
      minWidthPx: 180,
      renderCell: (proc) => {
        const clauseSummary =
          proc.requisitos_detalle && proc.requisitos_detalle.length > 0
            ? proc.requisitos_detalle.map((r) => r.codigo).join(', ')
            : proc.clausulas_cubiertas.join(', ');
        const downwardSummary = coverageReport
          ? computeProcessDownwardCoverageCount({
              clausulasCubiertas: proc.clausulas_cubiertas,
              requisitosDetalle: proc.requisitos_detalle,
              coverageReport,
            })
          : null;
        const downwardLabel =
          downwardSummary && downwardSummary.directCount > 0
            ? `${downwardSummary.directCount} directa${downwardSummary.directCount === 1 ? '' : 's'} · cubre ${downwardSummary.mandatoryCoveredCount} obligatoria${downwardSummary.mandatoryCoveredCount === 1 ? '' : 's'}`
            : '';

        return `
          <div class="flex items-center gap-1.5 overflow-hidden" title="${escapeHtml(downwardLabel ? `${downwardLabel}${clauseSummary ? ` (${clauseSummary})` : ''}` : clauseSummary)}">
            ${
              downwardLabel
                ? `
                  <span class="inline-flex items-center px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold shrink-0">
                    ${escapeHtml(downwardLabel)}
                  </span>
                `
                : ''
            }
            ${
              proc.requisitos_detalle && proc.requisitos_detalle.length > 0
                ? proc.requisitos_detalle
                    .map(
                      (req) => `
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-50 border border-slate-200 rounded text-[11px] shrink-0" title="${escapeHtml(req.titulo)}">
                    <span class="font-mono font-bold text-sky-800">${escapeHtml(req.codigo)}</span>
                  </span>
                `
                    )
                    .join('')
                : proc.clausulas_cubiertas
                    .map(
                      (c) => `
                  <span class="px-2 py-0.5 bg-slate-50 border border-slate-200 rounded text-[11px] font-mono font-bold text-slate-800 shrink-0">
                    ${escapeHtml(c)}
                  </span>
                `
                    )
                    .join('')
            }
          </div>
        `;
      },
    },
  ];

  const tableHtml = renderListViewTable({
    tableId: 'cert-tab-procesos',
    items: sorted,
    columns,
    sortState,
    columnWidths,
    getRowAttrs: (proc) =>
      `data-action="select-proceso-preview" data-proceso-id="${escapeHtml(proc.id)}" data-cert-id="${escapeHtml(certId)}" title="Abrir detalle de ${escapeHtml(proc.nombre_proceso)}"`,
    emptyStateTitle: 'Sin procesos registrados',
    emptyStateMessage: 'No hay procesos del sistema de gestión registrados para este certificado.',
  });

  if (!isStaff) {
    return tableHtml;
  }

  return `
    <div class="space-y-3">
      <div class="flex items-center justify-end">
        <button
          type="button"
          data-action="open-create-proceso"
          data-cert-id="${escapeHtml(certId)}"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
        >
          <span aria-hidden="true">+</span>
          <span>Nuevo Proceso</span>
        </button>
      </div>
      ${tableHtml}
    </div>
  `;
}

/**
 * TAB 3: Turno (public.turno) — Sortable, Resizable, Full-Row-Clickable List View
 */
function renderTurnosChildTab(
  turnos: ShiftEntity[],
  certId: string,
  sortState: SortState,
  columnWidths?: Record<string, number>,
  isStaff = false
): string {
  const sorted = sortItems(turnos, sortState.column, sortState.direction, (t, col) => {
    switch (col) {
      case 'descripcion':
        return t.descripcion;
      case 'horario':
        return `${t.hora_entrada}-${t.hora_salida}`;
      case 'empleados_activos':
        return t.empleados_activos ?? -1;
      case 'sitios_vinculados':
        return t.sitios_vinculados.join(', ');
      default:
        return '';
    }
  });

  const columns: ColumnDefinition<ShiftEntity>[] = [
    {
      id: 'descripcion',
      header: 'Turno Operativo',
      sortable: true,
      defaultWidthPct: 28,
      minWidthPx: 140,
      renderCell: (turno) => `
        <span class="inline-flex items-center gap-1.5 font-bold text-indigo-700 max-w-full" title="${escapeHtml(turno.descripcion)}">
          <span aria-hidden="true" class="shrink-0">⏱️</span>
          <span class="truncate">${escapeHtml(turno.descripcion)}</span>
        </span>
      `,
    },
    {
      id: 'horario',
      header: 'Horario',
      sortable: true,
      defaultWidthPct: 22,
      minWidthPx: 120,
      renderCell: (turno) => `
        <span class="font-mono font-semibold text-indigo-700 tabular-nums">
          ${escapeHtml(turno.hora_entrada)} — ${escapeHtml(turno.hora_salida)}
        </span>
      `,
    },
    {
      id: 'empleados_activos',
      header: 'Personal',
      align: 'center',
      sortable: true,
      defaultWidthPct: 16,
      minWidthPx: 90,
      renderCell: (turno) => `
        <span class="font-mono text-slate-700 tabular-nums">
          ${turno.empleados_activos !== undefined ? `${turno.empleados_activos} trabajadores` : 'Estándar'}
        </span>
      `,
    },
    {
      id: 'sitios_vinculados',
      header: 'Sedes Vinculadas',
      sortable: true,
      defaultWidthPct: 34,
      minWidthPx: 150,
      renderCell: (turno) => `
        <div class="flex items-center gap-1 overflow-hidden" title="${escapeHtml(turno.sitios_vinculados.join(', '))}">
          ${turno.sitios_vinculados
            .map(
              (s) => `
            <span class="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-medium border border-slate-200 shrink-0">
              📍 ${escapeHtml(s)}
            </span>
          `
            )
            .join('')}
        </div>
      `,
    },
  ];

  const tableHtml = renderListViewTable({
    tableId: 'cert-tab-turnos',
    items: sorted,
    columns,
    sortState,
    columnWidths,
    getRowAttrs: (turno) =>
      `data-action="select-turno-preview" data-turno-id="${escapeHtml(turno.id)}" data-cert-id="${escapeHtml(certId)}" title="Abrir detalle de ${escapeHtml(turno.descripcion)}"`,
    emptyStateTitle: 'Sin turnos configurados',
    emptyStateMessage: 'No hay turnos productivos configurados para las sedes de este certificado.',
  });

  if (!isStaff) {
    return tableHtml;
  }

  return `
    <div class="space-y-3">
      <div class="flex items-center justify-end">
        <button
          type="button"
          data-action="open-create-turno"
          data-cert-id="${escapeHtml(certId)}"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
        >
          <span aria-hidden="true">+</span>
          <span>Nuevo Turno</span>
        </button>
      </div>
      ${tableHtml}
    </div>
  `;
}

/**
 * TAB 2: No Aplicable (public.requisitos_no_aplicables_certificado) — Sortable, Resizable List View
 */
function renderNoAplicablesChildTab(
  noAplicables: NonApplicableRequirementEntity[],
  cert: CertificadoDetailEntity,
  sortState: SortState,
  columnWidths?: Record<string, number>,
  isStaff = false,
  coverageReport: CertificateCoverageReport | null = null
): string {
  const sorted = sortItems(noAplicables, sortState.column, sortState.direction, (item, col) => {
    switch (col) {
      case 'requisito_codigo':
        return item.requisito_codigo;
      case 'requisito_titulo':
        return item.requisito_titulo;
      case 'justificacion':
        return item.justificacion;
      default:
        return '';
    }
  });

  const columns: ColumnDefinition<NonApplicableRequirementEntity>[] = [
    {
      id: 'requisito_codigo',
      header: 'Cláusula',
      sortable: true,
      defaultWidthPct: 22,
      minWidthPx: 120,
      renderCell: (item) => {
        const subtreeCount = coverageReport
          ? countExcludedSubtreeDescendants({
              exclusion: item,
              coverageReport,
            })
          : 0;
        const subtreeBadge =
          subtreeCount > 0
            ? ` <span class="font-sans font-semibold text-[10px] text-rose-700">(+${subtreeCount} subcláusula${subtreeCount === 1 ? '' : 's'})</span>`
            : '';
        return `
          <span class="inline-flex flex-wrap items-center gap-1 px-2 py-0.5 bg-rose-50 text-rose-800 border border-rose-200 font-mono text-xs font-bold rounded">
            <span>Cláusula ${escapeHtml(item.requisito_codigo)}</span>${subtreeBadge}
          </span>
        `;
      },
    },
    {
      id: 'requisito_titulo',
      header: 'Requisito Excluido',
      sortable: true,
      defaultWidthPct: 30,
      minWidthPx: 150,
      renderCell: (item) => `
        <span class="block font-bold text-slate-900 truncate" title="${escapeHtml(item.requisito_titulo)}">
          ${escapeHtml(item.requisito_titulo)}
        </span>
      `,
    },
    {
      id: 'justificacion',
      header: 'Justificación Técnica Obligatoria (ISO 4.3)',
      sortable: true,
      defaultWidthPct: 48,
      minWidthPx: 200,
      renderCell: (item) => `
        <span class="block text-slate-700 truncate" title="${escapeHtml(item.justificacion)}">
          ${escapeHtml(item.justificacion)}
        </span>
      `,
    },
  ];

  const emptyStateHtml = `
    <div class="p-8 text-center text-slate-600 text-xs bg-emerald-50/50 rounded-xl border border-emerald-200 space-y-2">
      <span class="text-2xl block">✓</span>
      <h4 class="text-sm font-bold text-emerald-900">Aplicabilidad Completa</h4>
      <p class="text-xs text-emerald-700 max-w-md mx-auto">
        Este certificado aplica la totalidad de los requisitos de la norma evaluada sin exclusiones declaradas bajo la cláusula 4.3.
      </p>
    </div>
  `;

  const tableHtml = renderListViewTable({
    tableId: 'cert-tab-no_aplicables',
    items: sorted,
    columns,
    sortState,
    columnWidths,
    getRowAttrs: (item) =>
      `data-action="select-no-aplicable" data-no-aplicable-id="${escapeHtml(item.id)}" data-requisito-id="${escapeHtml(item.id_requisito)}" data-norma-id="${escapeHtml(cert.id_norma)}" data-codigo="${escapeHtml(item.requisito_codigo)}" data-cert-id="${escapeHtml(cert.id)}" title="Abrir detalle de exclusión ${escapeHtml(item.requisito_codigo)}"`,
    emptyStateHtml,
  });

  if (!isStaff) {
    return tableHtml;
  }

  return `
    <div class="space-y-3">
      <div class="flex items-center justify-end">
        <button
          type="button"
          data-action="open-create-no-aplicable"
          data-cert-id="${escapeHtml(cert.id)}"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
        >
          <span aria-hidden="true">+</span>
          <span>Declarar Exclusión</span>
        </button>
      </div>
      ${tableHtml}
    </div>
  `;
}

/**
 * TAB 5: Auditoría (public.auditoria) — Sortable, Resizable, Full-Row-Clickable List View
 */
function renderAuditoriasChildTab(
  auditorias: AuditEntity[],
  sortState: SortState,
  columnWidths?: Record<string, number>
): string {
  const sorted = sortItems(auditorias, sortState.column, sortState.direction, (aud, col) => {
    switch (col) {
      case 'codigo_auditoria':
        return aud.codigo_auditoria;
      case 'tipo_auditoria':
        return aud.tipo_auditoria;
      case 'metodologia':
        return aud.metodologia;
      case 'fecha_programacion':
        return aud.fecha_programacion;
      case 'auditor_lider':
        return aud.auditor_lider;
      case 'estatus':
        return aud.estatus;
      default:
        return '';
    }
  });

  const columns: ColumnDefinition<AuditEntity>[] = [
    {
      id: 'codigo_auditoria',
      header: 'Código Auditoría',
      sortable: true,
      defaultWidthPct: 18,
      minWidthPx: 110,
      renderCell: (aud) => `
        <span class="inline-flex items-center gap-1.5 font-mono font-bold text-indigo-600 max-w-full" title="${escapeHtml(aud.codigo_auditoria)}">
          <span aria-hidden="true" class="shrink-0">📋</span>
          <span class="truncate">${escapeHtml(aud.codigo_auditoria)}</span>
        </span>
      `,
    },
    {
      id: 'tipo_auditoria',
      header: 'Modalidad',
      sortable: true,
      defaultWidthPct: 16,
      minWidthPx: 100,
      renderCell: (aud) => `
        <span class="block font-semibold text-slate-800 truncate" title="${escapeHtml(aud.tipo_auditoria)}">
          ${escapeHtml(aud.tipo_auditoria)}
        </span>
      `,
    },
    {
      id: 'metodologia',
      header: 'Metodología',
      sortable: true,
      defaultWidthPct: 14,
      minWidthPx: 90,
      renderCell: (aud) => `
        <span class="inline-block px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
          ${escapeHtml(aud.metodologia)}
        </span>
      `,
    },
    {
      id: 'fecha_programacion',
      header: 'Fecha Programada',
      sortable: true,
      defaultWidthPct: 16,
      minWidthPx: 105,
      renderCell: (aud) => `
        <span class="font-mono text-[11px] text-slate-700 tabular-nums">
          ${escapeHtml(aud.fecha_programacion)}
        </span>
      `,
    },
    {
      id: 'auditor_lider',
      header: 'Auditor Líder',
      sortable: true,
      defaultWidthPct: 22,
      minWidthPx: 120,
      renderCell: (aud) => `
        <span class="block text-slate-800 truncate" title="${escapeHtml(aud.auditor_lider)}">
          ${escapeHtml(aud.auditor_lider)}
        </span>
      `,
    },
    {
      id: 'estatus',
      header: 'Estatus',
      align: 'center',
      sortable: true,
      defaultWidthPct: 14,
      minWidthPx: 95,
      renderCell: (aud) => {
        const isCompleted = aud.estatus === 'Completada' || aud.estatus === 'Cerrada';
        return `
          <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
            isCompleted
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-indigo-50 text-indigo-800 border border-indigo-200'
          }">
            <span>${isCompleted ? '✓' : '🕒'}</span>
            <span class="truncate">${escapeHtml(aud.estatus)}</span>
          </span>
        `;
      },
    },
  ];

  return renderListViewTable({
    tableId: 'cert-tab-auditorias',
    items: sorted,
    columns,
    sortState,
    columnWidths,
    getRowAttrs: (aud) =>
      `data-action="select-prog-audit-by-code" data-audit-code="${escapeHtml(aud.codigo_auditoria)}" data-audit-id="${escapeHtml(aud.id)}" title="Abrir auditoría ${escapeHtml(aud.codigo_auditoria)}"`,
    emptyStateTitle: 'Sin auditorías registradas',
    emptyStateMessage: 'No hay auditorías registradas para este certificado.',
  });
}

/**
 * TAB 6: Fecha (public.fecha_certificado) — Sortable, Resizable, Full-Row-Clickable List View
 */
function renderFechasChildTab(
  fechas: FechaCertificadoEntity[],
  certId: string,
  sortState: SortState,
  columnWidths?: Record<string, number>,
  isStaff = false
): string {
  const sorted = sortItems(fechas, sortState.column, sortState.direction, (f, col) => {
    switch (col) {
      case 'tipo_fecha':
        return f.tipo_fecha;
      case 'fecha':
        return f.fecha;
      case 'estado_temporal':
        return getFechaTemporalStatus(f.fecha, f.tipo_fecha).label;
      default:
        return '';
    }
  });

  const columns: ColumnDefinition<FechaCertificadoEntity>[] = [
    {
      id: 'tipo_fecha',
      header: 'Tipo de Fecha',
      sortable: true,
      defaultWidthPct: 38,
      minWidthPx: 140,
      renderCell: (f) => {
        const visual = getFechaTipoVisual(f.tipo_fecha);
        return `
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${visual.badgeClass}">
            ${escapeHtml(visual.label)}
          </span>
        `;
      },
    },
    {
      id: 'fecha',
      header: 'Fecha',
      sortable: true,
      defaultWidthPct: 30,
      minWidthPx: 120,
      renderCell: (f) => `
        <span class="font-mono text-xs font-bold text-slate-900 tabular-nums">
          ${escapeHtml(f.fecha)}
        </span>
      `,
    },
    {
      id: 'estado_temporal',
      header: 'Referencia Temporal',
      sortable: true,
      align: 'center',
      defaultWidthPct: 32,
      minWidthPx: 130,
      renderCell: (f) => {
        const temporal = getFechaTemporalStatus(f.fecha, f.tipo_fecha);
        return `
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${temporal.badgeClass}">
            ${escapeHtml(temporal.label)}
          </span>
        `;
      },
    },
  ];

  const tableHtml = renderListViewTable({
    tableId: 'cert-tab-fechas',
    items: sorted,
    columns,
    sortState,
    columnWidths,
    getRowAttrs: (f) =>
      `data-action="select-fecha-detail" data-fecha-id="${escapeHtml(f.id)}" data-cert-id="${escapeHtml(certId)}" title="Ver detalle de ${escapeHtml(f.tipo_fecha)} · ${escapeHtml(f.fecha)}"`,
    emptyStateTitle: 'Sin fechas registradas',
    emptyStateMessage: 'No hay eventos cronológicos registrados para este certificado.',
  });

  if (!isStaff) {
    return tableHtml;
  }

  return `
    <div class="space-y-3">
      <div class="flex items-center justify-end">
        <button
          type="button"
          data-action="open-create-fecha"
          data-cert-id="${escapeHtml(certId)}"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
        >
          <span aria-hidden="true">+</span>
          <span>Nueva Fecha</span>
        </button>
      </div>
      ${tableHtml}
    </div>
  `;
}

/**
 * TAB 7: Contacto (public.contacto_certificado) — Sortable, Resizable, Full-Row-Clickable List View
 */
function renderContactosChildTab(
  contactos: ContactoCertificadoEntity[],
  certId: string,
  sortState: SortState,
  columnWidths?: Record<string, number>,
  isStaff = false
): string {
  const sorted = sortItems(contactos, sortState.column, sortState.direction, (c, col) => {
    switch (col) {
      case 'nombre':
        return c.nombre;
      case 'cargo':
        return c.cargo || 'No especificado';
      case 'telefonos_resumen':
        return formatContactPhonesSummary(c.telefonos);
      case 'emails_resumen':
        return formatContactEmailsSummary(c.emails);
      default:
        return '';
    }
  });

  const columns: ColumnDefinition<ContactoCertificadoEntity>[] = [
    {
      id: 'nombre',
      header: 'Nombre Completo',
      sortable: true,
      defaultWidthPct: 28,
      minWidthPx: 150,
      renderCell: (c) => `
        <span class="inline-flex items-center gap-1.5 font-bold text-indigo-700 max-w-full" title="${escapeHtml(c.nombre)}">
          <span aria-hidden="true" class="shrink-0">👤</span>
          <span class="truncate">${escapeHtml(c.nombre)}</span>
        </span>
      `,
    },
    {
      id: 'cargo',
      header: 'Cargo / Rol',
      sortable: true,
      defaultWidthPct: 24,
      minWidthPx: 120,
      renderCell: (c) => {
        const cargoLabel = c.cargo?.trim() || 'No especificado';
        return `
          <span class="block ${c.cargo?.trim() ? 'text-slate-700 font-medium' : 'text-slate-400 italic'} truncate" title="${escapeHtml(cargoLabel)}">
            ${escapeHtml(cargoLabel)}
          </span>
        `;
      },
    },
    {
      id: 'telefonos_resumen',
      header: 'Teléfonos',
      sortable: true,
      defaultWidthPct: 23,
      minWidthPx: 130,
      renderCell: (c) => {
        const summary = formatContactPhonesSummary(c.telefonos);
        return `
          <span class="block font-mono text-xs text-slate-700 truncate" title="${escapeHtml(summary)}">
            ${escapeHtml(summary)}
          </span>
        `;
      },
    },
    {
      id: 'emails_resumen',
      header: 'Correos Electrónicos',
      sortable: true,
      defaultWidthPct: 25,
      minWidthPx: 140,
      renderCell: (c) => {
        const summary = formatContactEmailsSummary(c.emails);
        return `
          <span class="block text-xs text-slate-700 truncate" title="${escapeHtml(summary)}">
            ${escapeHtml(summary)}
          </span>
        `;
      },
    },
  ];

  const tableHtml = renderListViewTable({
    tableId: 'cert-tab-contactos',
    items: sorted,
    columns,
    sortState,
    columnWidths,
    getRowAttrs: (c) =>
      `data-action="select-contacto-detail" data-contacto-id="${escapeHtml(c.id)}" data-cert-id="${escapeHtml(certId)}" title="Ver detalle de ${escapeHtml(c.nombre)}"`,
    emptyStateTitle: 'Sin contactos registrados',
    emptyStateMessage: 'No hay contactos autorizados asociados a este certificado.',
  });

  if (!isStaff) {
    return tableHtml;
  }

  return `
    <div class="space-y-3">
      <div class="flex items-center justify-end">
        <button
          type="button"
          data-action="open-create-contacto"
          data-cert-id="${escapeHtml(certId)}"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
        >
          <span aria-hidden="true">+</span>
          <span>Nuevo Contacto</span>
        </button>
      </div>
      ${tableHtml}
    </div>
  `;
}