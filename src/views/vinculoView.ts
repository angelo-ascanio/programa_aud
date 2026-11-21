import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import type { OrganizacionEntity } from '../lib/activeCertificates';
import type { ConglomeradoEntity } from '../lib/conglomeradoDomain';
import type { ProgramacionAuditEntity } from '../lib/auditExecution';
import {
  AUDIT_LINK_NATURES,
  type AuditLinkLevel,
  type AuditLinkNature,
  type ProgramaAuditoriaEntity,
} from '../lib/auditPlanningEngine';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import {
  buildConglomeradoVinculoSummaries,
  canArchiveVinculoBox,
  canDetachCertificateFromVinculo,
  inferVinculoBoxClassification,
  type ConglomeradoVinculoSummary,
  type SoftDeletableCertificado,
  type VinculoBoxCertMemberRef,
  type VinculoEntity,
} from '../lib/vinculoDomain';
import {
  computeReactiveFacetCounts,
  filterRecordsWithFacets,
  sortItems,
  type ColumnDefinition,
  type MultiViewFacetCategory,
  type MultiViewSelectionMap,
  type SortDirection,
  type UniversalViewMode,
} from '../lib/universalTemplate';
import { renderUniversalTemplate } from './universalTemplate';
import { renderAddAuditButton } from './auditCardBreadcrumb';
import {
  extractUniversalArchiveProps,
  type ArchiveMultiViewConfig,
} from '../lib/archiveGovernance';

export type VinculoSortColumn =
  | 'conglomerado'
  | 'organizaciones'
  | 'cajas'
  | 'libres';

export interface VinculoBoxDraft {
  etiqueta: string;
  tipo_vinculacion: AuditLinkNature;
  tiene_sitio_temporal: boolean;
  notas: string;
}

export interface VinculoViewState {
  query: string;
  viewMode: UniversalViewMode;
  isSidebarOpen: boolean;
  sortColumn: VinculoSortColumn | null;
  sortDirection: SortDirection;
  facetSelections: MultiViewSelectionMap;
  selectedConglomeradoId: string | null;
  editingBoxId: string | null;
  boxFormDraft?: VinculoBoxDraft;
  isCreatingBox: boolean;
  newBoxDraft?: VinculoBoxDraft;
  selectedTargetBoxByCertId: Record<string, string>;
  editErrorMessage: string | null;
}

export const DEFAULT_VINCULO_STATE: VinculoViewState = {
  query: '',
  viewMode: 'list',
  isSidebarOpen: true,
  sortColumn: null,
  sortDirection: 'none',
  facetSelections: {},
  selectedConglomeradoId: null,
  editingBoxId: null,
  boxFormDraft: undefined,
  isCreatingBox: false,
  newBoxDraft: undefined,
  selectedTargetBoxByCertId: {},
  editErrorMessage: null,
};

export interface VinculoViewProps {
  profile: UserProfile;
  state: VinculoViewState;
  vinculos: ReadonlyArray<VinculoEntity>;
  conglomerados: ReadonlyArray<ConglomeradoEntity>;
  organizaciones: ReadonlyArray<OrganizacionEntity>;
  certificados: ReadonlyArray<SoftDeletableCertificado>;
  auditPrograms: ReadonlyArray<ProgramaAuditoriaEntity>;
  programacionAudits: ReadonlyArray<ProgramacionAuditEntity>;
  authorizedClientOrgIds?: ReadonlyArray<string>;
  assignedAuditCertIds?: ReadonlyArray<string>;
  headerAddAuditHtml?: string;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
}

function getNivelLabel(nivel: AuditLinkLevel): string {
  switch (nivel) {
    case 'NIVEL_2_INTER_ORG':
      return 'Nivel 2 · Inter-Org';
    case 'NIVEL_1_INTRA_ORG':
      return 'Nivel 1 · Intra-Org';
    default:
      return 'Individual';
  }
}

function getNatureBadgeClass(nature: AuditLinkNature): string {
  switch (nature) {
    case 'Individual':
      return 'bg-sky-50 text-sky-800 border-sky-200';
    case 'Combinada':
      return 'bg-violet-50 text-violet-800 border-violet-200';
    case 'Integrada':
      return 'bg-indigo-50 text-indigo-800 border-indigo-200';
    case 'Mixta':
      return 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200';
    case 'Multientidad':
      return 'bg-teal-50 text-teal-800 border-teal-200';
    default:
      return 'bg-slate-100 text-slate-800 border-slate-300';
  }
}

function formatDeclaredSitesSummary(
  cert: CertificadoDetailEntity | undefined
): string {
  if (!cert) return 'Sin sitios declarados';
  const activeSites = cert.sitios || [];
  if (activeSites.length === 0) return 'Sin sitios declarados';
  const labels = activeSites.slice(0, 2).map((s) => {
    const loc = s.direccion_sitio ? ` (${s.direccion_sitio})` : '';
    return s.numero_sitio === 0
      ? `Sitio 0: ${s.nombre_sitio}${loc}`
      : `Sitio ${s.numero_sitio}: ${s.nombre_sitio}${loc}`;
  });
  if (activeSites.length > 2) {
    labels.push(`+${activeSites.length - 2} más`);
  }
  return labels.join(' · ');
}

export function renderVinculoView(props: VinculoViewProps): string {
  const {
    profile,
    state,
    vinculos,
    conglomerados,
    organizaciones,
    certificados,
    auditPrograms,
    programacionAudits,
    authorizedClientOrgIds = [],
    assignedAuditCertIds = [],
    headerAddAuditHtml,
    loading,
    archiveConfig,
    tableColumnWidths,
  } = props;

  const isStaff = isApprovedStaffProfile(profile);
  const effectiveAssignedCertIds =
    assignedAuditCertIds.length > 0
      ? assignedAuditCertIds
      : programacionAudits
          .filter((a) => !a.deleted_at)
          .map((a) => a.id_certificado);

  const summaries = buildConglomeradoVinculoSummaries({
    conglomerados,
    organizaciones,
    certificados,
    vinculos,
    auditPrograms,
    profile,
    authorizedClientOrgIds,
    assignedAuditCertIds: effectiveAssignedCertIds,
  });

  if (state.selectedConglomeradoId) {
    const selectedSummary = summaries.find(
      (s) => s.id === state.selectedConglomeradoId
    );
    if (selectedSummary) {
      return renderConglomeradoBoxesWorkspace({
        summary: selectedSummary,
        profile,
        state,
        certificados,
        auditPrograms,
        programacionAudits,
        authorizedClientOrgIds,
        assignedAuditCertIds: effectiveAssignedCertIds,
        headerAddAuditHtml: headerAddAuditHtml ?? renderAddAuditButton(isStaff),
        isStaff,
      });
    }
  }

  return renderVinculoConglomeradoMultiView({
    summaries,
    state,
    isStaff,
    loading,
    archiveConfig,
    tableColumnWidths,
    headerAddAuditHtml: headerAddAuditHtml ?? renderAddAuditButton(isStaff),
  });
}

function renderVinculoConglomeradoMultiView(opts: {
  summaries: ReadonlyArray<ConglomeradoVinculoSummary>;
  state: VinculoViewState;
  isStaff: boolean;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
  headerAddAuditHtml: string;
}): string {
  const {
    summaries,
    state,
    loading,
    archiveConfig,
    tableColumnWidths,
    headerAddAuditHtml,
  } = opts;

  const presentNatures = Array.from(
    new Set(summaries.flatMap((s) => s.activeNatures))
  );
  const natureOptions = [
    ...AUDIT_LINK_NATURES.filter((n) => presentNatures.includes(n)).map((n) => ({
      value: n,
      label: n,
    })),
    ...(summaries.some((s) => s.boxesCount === 0)
      ? [{ value: 'SIN_CAJAS', label: 'Sin cajas configuradas' }]
      : []),
  ];

  const facetCategories: MultiViewFacetCategory<ConglomeradoVinculoSummary>[] = [
    {
      id: 'disponibilidad',
      label: 'Estado LIBRE',
      options: [
        { value: 'CON_LIBRES', label: 'Con certificados LIBRE' },
        { value: 'TODOS_EN_CAJAS', label: 'Todos en cajas' },
      ],
      extractValues: (s) =>
        s.freeCertsCount > 0 ? 'CON_LIBRES' : 'TODOS_EN_CAJAS',
    },
    {
      id: 'composicion',
      label: 'Composición',
      options: [
        { value: 'MULTI_EMPRESA', label: 'Multi-empresa' },
        { value: 'SOLA', label: 'Sola' },
      ],
      extractValues: (s) => (s.isMultiOrg ? 'MULTI_EMPRESA' : 'SOLA'),
    },
    {
      id: 'naturaleza',
      label: 'Naturaleza activa',
      options: natureOptions,
      extractValues: (s) =>
        s.activeNatures.length > 0 ? s.activeNatures : ['SIN_CAJAS'],
    },
  ];

  const selections: MultiViewSelectionMap = state.facetSelections || {};
  const searchOptions = {
    getSearchableText: (s: ConglomeradoVinculoSummary) =>
      [
        s.nombreConglomerado,
        s.codigoGrupo || '',
        s.natureSummary,
        ...s.organizaciones.map((o) => `${o.nombre} ${o.rif}`),
        ...s.vinculos.flatMap((v) => [
          v.etiqueta,
          v.tipo_vinculacion,
          ...v.certificados
            .filter((c) => !c.deleted_at)
            .map((c) => `${c.numero_certificado} ${c.norma_codigo}`),
        ]),
      ].join(' '),
  };

  const facetGroups = computeReactiveFacetCounts(
    [...summaries],
    state.query,
    facetCategories,
    selections,
    searchOptions
  );

  const filteredSummaries = filterRecordsWithFacets(
    [...summaries],
    state.query,
    facetCategories,
    selections,
    searchOptions
  );

  const columns: ColumnDefinition<ConglomeradoVinculoSummary>[] = [
    {
      id: 'conglomerado',
      header: 'Conglomerado & Código',
      sortable: true,
      defaultWidthPct: 33,
      minWidthPx: 210,
      renderCell: (s) => `
        <div class="min-w-0">
          <span class="block font-bold text-slate-900 truncate" title="${escapeHtml(
            s.nombreConglomerado
          )}">${escapeHtml(s.nombreConglomerado)}</span>
          <span class="block text-[11px] font-mono text-slate-500 truncate">${escapeHtml(
            s.codigoGrupo || 'Sin código'
          )}</span>
        </div>
      `,
    },
    {
      id: 'organizaciones',
      header: 'Organizaciones',
      sortable: true,
      defaultWidthPct: 24,
      minWidthPx: 150,
      renderCell: (s) => {
        const orgNames = s.organizaciones.map((o) => o.nombre).join(' · ');
        const compLabel =
          s.organizacionesCount === 0
            ? 'Sin organizaciones'
            : s.organizacionesCount === 1
            ? '1 empresa'
            : `${s.organizacionesCount} empresas`;
        return `
          <div class="min-w-0">
            <span class="block text-xs font-semibold text-slate-800 whitespace-nowrap">${escapeHtml(
              compLabel
            )}</span>
            ${
              orgNames
                ? `<span class="block text-[11px] text-slate-500 truncate" title="${escapeHtml(
                    orgNames
                  )}">${escapeHtml(orgNames)}</span>`
                : ''
            }
          </div>
        `;
      },
    },
    {
      id: 'cajas',
      header: 'Cajas Configuradas',
      sortable: true,
      defaultWidthPct: 23,
      minWidthPx: 165,
      renderCell: (s) => `
        <div class="min-w-0">
          <span class="block text-xs font-bold text-slate-900 tabular-nums whitespace-nowrap">${
            s.boxesCount
          } ${s.boxesCount === 1 ? 'caja' : 'cajas'}</span>
          <span class="block text-[11px] text-slate-500 truncate" title="${escapeHtml(
            s.natureSummary
          )}">${escapeHtml(s.natureSummary)}</span>
        </div>
      `,
    },
    {
      id: 'libres',
      header: 'Libres / En cajas',
      sortable: true,
      defaultWidthPct: 20,
      minWidthPx: 150,
      renderCell: (s) => {
        const badgeClass =
          s.freeCertsCount > 0
            ? 'bg-amber-50 text-amber-800 border-amber-200'
            : s.totalCertsCount > 0
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : 'bg-slate-50 text-slate-600 border-slate-200';
        const freeLabel =
          s.freeCertsCount > 0
            ? `${s.freeCertsCount} ${s.freeCertsCount === 1 ? 'Libre' : 'Libres'}`
            : s.totalCertsCount > 0
            ? 'Todos en cajas'
            : 'Sin certs';
        return `
          <div class="min-w-0 space-y-0.5">
            <span class="inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold whitespace-nowrap ${badgeClass}">${escapeHtml(
          freeLabel
        )}</span>
            <span class="block text-[11px] text-slate-500 tabular-nums whitespace-nowrap">${
              s.boxedCertsCount
            }/${s.totalCertsCount} en cajas</span>
          </div>
        `;
      },
    },
  ];

  const sortedSummaries = sortItems(
    filteredSummaries,
    state.sortColumn,
    state.sortDirection,
    (s, col) => {
      switch (col) {
        case 'conglomerado':
          return s.nombreConglomerado;
        case 'organizaciones':
          return s.organizacionesCount;
        case 'cajas':
          return s.boxesCount;
        case 'libres':
          return s.freeCertsCount;
        default:
          return '';
      }
    }
  );

  const renderCard = (s: ConglomeradoVinculoSummary): string => {
    const freeBadgeClass =
      s.freeCertsCount > 0
        ? 'bg-amber-50 text-amber-800 border-amber-200'
        : s.totalCertsCount > 0
        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
        : 'bg-slate-50 text-slate-600 border-slate-200';
    const freeText =
      s.freeCertsCount > 0
        ? `${s.freeCertsCount} Libre${s.freeCertsCount === 1 ? '' : 's'}`
        : s.totalCertsCount > 0
        ? 'Todos en cajas'
        : 'Sin certificados';

    return `
      <article
        data-action="select-vinculo-conglomerado"
        data-conglomerado-id="${escapeHtml(s.id)}"
        tabindex="0"
        role="button"
        aria-label="Abrir espacio de cajas de ${escapeHtml(s.nombreConglomerado)}"
        class="group bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-400 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between gap-3"
      >
        <div class="space-y-2">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="text-[11px] font-mono text-slate-500 truncate">${escapeHtml(
                s.codigoGrupo || 'Sin código'
              )}</p>
              <h3 class="text-sm font-bold text-slate-900 group-hover:text-sky-800 transition-colors line-clamp-2">
                ${escapeHtml(s.nombreConglomerado)}
              </h3>
            </div>
            <span class="inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-semibold shrink-0 ${freeBadgeClass}">
              ${escapeHtml(freeText)}
            </span>
          </div>
          <p class="text-xs text-slate-600 truncate">
            🏢 ${s.organizacionesCount} ${
      s.organizacionesCount === 1 ? 'empresa' : 'empresas'
    } · ${s.boxedCertsCount}/${s.totalCertsCount} en cajas
          </p>
          <p class="text-[11px] text-slate-500 truncate" title="${escapeHtml(
            s.natureSummary
          )}">
            📦 ${s.boxesCount} ${s.boxesCount === 1 ? 'caja' : 'cajas'} (${escapeHtml(
      s.natureSummary
    )})
          </p>
        </div>

        <div class="pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600 gap-2">
          <span class="text-[11px] font-medium text-slate-500">${
            s.isMultiOrg ? 'Multi-empresa' : 'Individual'
          }</span>
          <span class="text-[11px] font-semibold text-sky-700 group-hover:underline">Abrir cajas →</span>
        </div>
      </article>
    `;
  };

  return renderUniversalTemplate<ConglomeradoVinculoSummary>({
    domainKey: 'vinculos',
    tableId: 'vinculo-main',
    title: 'Vínculo por Conglomerado',
    subtitle:
      'Seleccione un Conglomerado para organizar sus certificados LIBRE en cajas agrupadoras (Many-to-One) antes de Designación.',
    entityLabel: 'conglomerados',
    searchQuery: state.query,
    searchPlaceholder:
      'Buscar conglomerado, código, empresa, caja o certificado...',
    searchInputId: 'vinculoSearchInput',
    clearSearchBtnId: 'clearVinculoSearchBtn',
    totalCount: summaries.length,
    filteredCount: sortedSummaries.length,
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen,
    sortState: { column: state.sortColumn, direction: state.sortDirection },
    columnWidths: tableColumnWidths?.['vinculo-main'],
    facetGroups,
    items: sortedSummaries,
    columns,
    getRowAttrs: (s) =>
      `data-action="select-vinculo-conglomerado" data-conglomerado-id="${escapeHtml(
        s.id
      )}" title="Abrir espacio de cajas de ${escapeHtml(s.nombreConglomerado)}"`,
    renderCard,
    emptyStateTitle: 'No se encontraron conglomerados en Vínculo',
    emptyStateMessage:
      'Ajuste la búsqueda o los filtros laterales para localizar el conglomerado corporativo.',
    actionsHtml: headerAddAuditHtml,
    loading,
    loadingMessage: 'Cargando conglomerados y cajas de vínculo...',
    ...extractUniversalArchiveProps(archiveConfig, 'vinculos'),
  });
}

function renderConglomeradoBoxesWorkspace(opts: {
  summary: ConglomeradoVinculoSummary;
  profile: UserProfile;
  state: VinculoViewState;
  certificados: ReadonlyArray<SoftDeletableCertificado>;
  auditPrograms: ReadonlyArray<ProgramaAuditoriaEntity>;
  programacionAudits: ReadonlyArray<ProgramacionAuditEntity>;
  authorizedClientOrgIds: ReadonlyArray<string>;
  assignedAuditCertIds: ReadonlyArray<string>;
  headerAddAuditHtml: string;
  isStaff: boolean;
}): string {
  const {
    summary,
    profile,
    state,
    certificados,
    auditPrograms,
    programacionAudits,
    authorizedClientOrgIds,
    assignedAuditCertIds,
    headerAddAuditHtml,
    isStaff,
  } = opts;

  const isClient = profile.role === 'CLIENT';
  const isAuditor = profile.role === 'AUDITOR';
  const allowedClientOrgs = new Set(authorizedClientOrgIds);
  const allowedAuditorCerts = new Set(assignedAuditCertIds);
  const visibleOrgIds = new Set(summary.organizaciones.map((o) => o.id));

  const visibleCertsInCong = certificados.filter((c) => {
    if (c.deleted_at) return false;
    if (!visibleOrgIds.has(c.id_organizacion)) return false;
    if (isClient && !allowedClientOrgs.has(c.id_organizacion)) return false;
    if (isAuditor && !allowedAuditorCerts.has(c.id)) return false;
    return true;
  });

  const certById = new Map<string, CertificadoDetailEntity>(
    visibleCertsInCong.map((c) => [c.id, c])
  );

  const boxedCertIds = new Set<string>();
  for (const box of summary.vinculos) {
    if (box.deleted_at) continue;
    for (const member of box.certificados) {
      if (!member.deleted_at) {
        boxedCertIds.add(member.id_certificado);
      }
    }
  }

  const freeCerts = visibleCertsInCong
    .filter((c) => !boxedCertIds.has(c.id))
    .sort((a, b) => a.numero_certificado.localeCompare(b.numero_certificado, 'es'));

  const coverageBadgeClass =
    summary.freeCertsCount > 0
      ? 'bg-amber-50 text-amber-800 border-amber-200'
      : summary.totalCertsCount > 0
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : 'bg-slate-100 text-slate-700 border-slate-200';

  const newBoxDraft: VinculoBoxDraft = state.newBoxDraft ?? {
    etiqueta: '',
    tipo_vinculacion: 'Combinada',
    tiene_sitio_temporal: false,
    notas: '',
  };

  const newBoxFormHtml =
    isStaff && state.isCreatingBox
      ? `
        <form
          id="newVinculoBoxForm"
          data-conglomerado-id="${escapeHtml(summary.id)}"
          class="bg-slate-50 border border-slate-300 rounded-xl p-4 space-y-3"
          novalidate
        >
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-800">
              Nueva Caja Agrupadora — ${escapeHtml(summary.nombreConglomerado)}
            </h3>
            <button
              type="button"
              data-action="cancel-create-vinculo-box"
              class="text-xs font-semibold text-slate-500 hover:text-slate-900 cursor-pointer"
            >
              Cancelar
            </button>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div class="md:col-span-2 space-y-1">
              <label for="newBoxEtiquetaInput" class="block text-xs font-bold text-slate-700">
                Etiqueta de la Caja <span class="text-rose-600" aria-hidden="true">*</span>
              </label>
              <input
                id="newBoxEtiquetaInput"
                name="etiqueta"
                type="text"
                required
                maxlength="180"
                value="${escapeHtml(newBoxDraft.etiqueta)}"
                placeholder="Ej. Sitio 1 — SGC+SGA+SST o Sitio 4 — Combinada Alimentos"
                class="w-full text-xs px-2.5 py-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
              />
            </div>
            <div class="space-y-1">
              <label for="newBoxNaturalezaSelect" class="block text-xs font-bold text-slate-700">
                Naturaleza
              </label>
              <select
                id="newBoxNaturalezaSelect"
                name="tipo_vinculacion"
                class="w-full text-xs px-2.5 py-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
              >
                ${AUDIT_LINK_NATURES.map(
                  (nat) =>
                    `<option value="${escapeHtml(nat)}" ${
                      newBoxDraft.tipo_vinculacion === nat ? 'selected' : ''
                    }>${escapeHtml(nat)}</option>`
                ).join('')}
              </select>
            </div>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
            <label for="newBoxTemporalCheckbox" class="flex items-start gap-2 bg-white border border-amber-200 rounded-lg p-2.5 cursor-pointer">
              <input
                id="newBoxTemporalCheckbox"
                name="tiene_sitio_temporal"
                type="checkbox"
                ${newBoxDraft.tiene_sitio_temporal ? 'checked' : ''}
                class="mt-0.5 w-4 h-4 rounded border-amber-400 text-slate-900 cursor-pointer"
              />
              <span class="text-xs font-semibold text-slate-800">
                Incluye Sitio Temporal
                <span class="block text-[11px] font-normal text-slate-500">Habilita gestión de sitios temporales / proyecto en Designación.</span>
              </span>
            </label>
            <div class="space-y-1">
              <label for="newBoxNotasInput" class="block text-xs font-bold text-slate-700">
                Notas
              </label>
              <input
                id="newBoxNotasInput"
                name="notas"
                type="text"
                maxlength="300"
                value="${escapeHtml(newBoxDraft.notas)}"
                placeholder="Observaciones operativas de la caja..."
                class="w-full text-xs px-2.5 py-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
              />
            </div>
          </div>
          <div class="flex items-center justify-end gap-2">
            <button
              type="button"
              data-action="cancel-create-vinculo-box"
              class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              id="submitNewVinculoBoxBtn"
              class="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
            >
              Crear caja
            </button>
          </div>
        </form>
      `
      : '';

  const errorBannerHtml = state.editErrorMessage
    ? `
      <div role="alert" class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800 flex items-center gap-2">
        <span aria-hidden="true">⚠️</span>
        <span>${escapeHtml(state.editErrorMessage)}</span>
      </div>
    `
    : '';

  const activeBoxes = summary.vinculos.filter((v) => !v.deleted_at);

  const freePoolCardsHtml =
    freeCerts.length === 0
      ? `
        <div class="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-center">
          <p class="text-xs font-semibold text-slate-700">Sin certificados LIBRE pendientes en este conglomerado</p>
          <p class="text-[11px] text-slate-500 mt-0.5">Todos los certificados visibles ya están asignados en cajas agrupadoras.</p>
        </div>
      `
      : `
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
          ${freeCerts
            .map((cert) => {
              const selectedTarget =
                state.selectedTargetBoxByCertId[cert.id] || '';
              const sitesSummary = formatDeclaredSitesSummary(cert);
              return `
                <article
                  data-vinculo-free-cert-card="${escapeHtml(cert.id)}"
                  ${
                    isStaff
                      ? `draggable="true" data-vinculo-drag-cert-id="${escapeHtml(
                          cert.id
                        )}" data-vinculo-source-box-id=""`
                      : ''
                  }
                  class="bg-white border border-amber-200 rounded-xl p-3 space-y-2 shadow-2xs"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <button
                        type="button"
                        data-action="open-cert-resumen"
                        data-cert-id="${escapeHtml(cert.id)}"
                        title="Abrir Resumen de ${escapeHtml(cert.numero_certificado)}"
                        class="font-mono text-xs font-bold text-slate-900 hover:text-sky-700 hover:underline text-left cursor-pointer truncate block max-w-full"
                      >
                        ${escapeHtml(cert.numero_certificado)}
                      </button>
                      <p class="text-xs font-semibold text-slate-700 truncate">${escapeHtml(
                        cert.organizacion_nombre
                      )}</p>
                    </div>
                    <span class="inline-flex items-center px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-[10px] font-mono font-semibold text-amber-900 shrink-0">
                      ${escapeHtml(cert.norma_codigo)}
                    </span>
                  </div>
                  <p class="text-[11px] text-slate-500 truncate" title="${escapeHtml(
                    sitesSummary
                  )}">
                    📍 ${escapeHtml(sitesSummary)}
                  </p>
                  ${
                    isStaff
                      ? `
                        <div class="pt-2 border-t border-slate-100 space-y-1.5">
                          ${
                            activeBoxes.length > 0
                              ? `
                                <div class="flex items-center gap-1.5">
                                  <select
                                    data-action="select-target-box-for-cert"
                                    data-cert-id="${escapeHtml(cert.id)}"
                                    aria-label="Mover ${escapeHtml(
                                      cert.numero_certificado
                                    )} a caja"
                                    class="flex-1 min-w-0 text-[11px] px-2 py-1.5 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none truncate"
                                  >
                                    <option value="">Mover a caja...</option>
                                    ${activeBoxes
                                      .map(
                                        (box) =>
                                          `<option value="${escapeHtml(box.id)}" ${
                                            selectedTarget === box.id
                                              ? 'selected'
                                              : ''
                                          }>${escapeHtml(box.etiqueta)} (${escapeHtml(
                                            box.tipo_vinculacion
                                          )})</option>`
                                      )
                                      .join('')}
                                  </select>
                                  <button
                                    type="button"
                                    data-action="assign-cert-to-target-box"
                                    data-cert-id="${escapeHtml(cert.id)}"
                                    ${!selectedTarget ? 'disabled' : ''}
                                    class="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                                      selectedTarget
                                        ? 'bg-slate-900 hover:bg-slate-800 text-white cursor-pointer'
                                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                    }"
                                  >
                                    Asignar
                                  </button>
                                </div>
                              `
                              : ''
                          }
                          <div class="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              data-action="create-individual-box-for-cert"
                              data-cert-id="${escapeHtml(cert.id)}"
                              class="px-2.5 py-1 rounded-lg border border-sky-200 bg-sky-50 hover:bg-sky-100 text-sky-900 text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                            >
                              + Crear caja individual
                            </button>
                            <button
                              type="button"
                              data-action="open-cert-resumen"
                              data-cert-id="${escapeHtml(cert.id)}"
                              class="text-[11px] font-semibold text-indigo-700 hover:underline cursor-pointer whitespace-nowrap"
                            >
                              Abrir Resumen →
                            </button>
                          </div>
                        </div>
                      `
                      : `
                        <div class="pt-1.5 border-t border-slate-100 flex justify-end">
                          <button
                            type="button"
                            data-action="open-cert-resumen"
                            data-cert-id="${escapeHtml(cert.id)}"
                            class="text-[11px] font-semibold text-indigo-700 hover:underline cursor-pointer"
                          >
                            Abrir Resumen →
                          </button>
                        </div>
                      `
                  }
                </article>
              `;
            })
            .join('')}
        </div>
      `;

  const boxesGridHtml =
    activeBoxes.length === 0
      ? `
        <div class="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-8 text-center space-y-2">
          <div class="text-2xl" aria-hidden="true">📦</div>
          <h3 class="text-sm font-bold text-slate-900">Aún no hay cajas agrupadoras configuradas</h3>
          <p class="text-xs text-slate-500 max-w-md mx-auto">
            Cree una nueva caja agrupadora o utilice "+ Crear caja individual" sobre cualquier certificado LIBRE para habilitar la programación de auditorías.
          </p>
        </div>
      `
      : `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          ${activeBoxes
            .map((box) => {
              const boxCerts = box.certificados.filter((c) => !c.deleted_at);
              const memberRefs: VinculoBoxCertMemberRef[] = boxCerts.map(
                (c) => ({
                  id_certificado: c.id_certificado,
                  id_organizacion: c.id_organizacion,
                  norma_codigo: c.norma_codigo,
                })
              );
              const inferred = inferVinculoBoxClassification({
                currentNivel: box.nivel_vinculacion,
                currentTipo: box.tipo_vinculacion,
                certs: memberRefs,
              });
              const archiveCheck = canArchiveVinculoBox(
                box,
                auditPrograms,
                programacionAudits
              );
              const isEditingThisBox = isStaff && state.editingBoxId === box.id;
              const editDraft: VinculoBoxDraft =
                isEditingThisBox && state.boxFormDraft
                  ? state.boxFormDraft
                  : {
                      etiqueta: box.etiqueta,
                      tipo_vinculacion: box.tipo_vinculacion,
                      tiene_sitio_temporal: Boolean(box.tiene_sitio_temporal),
                      notas: box.notas || '',
                    };

              const otherBoxes = activeBoxes.filter((b) => b.id !== box.id);

              const boxHeaderHtml = isEditingThisBox
                ? `
                  <form
                    data-vinculo-edit-box-form="${escapeHtml(box.id)}"
                    data-vinculo-id="${escapeHtml(box.id)}"
                    class="bg-slate-50 border border-slate-300 rounded-xl p-3 space-y-2.5"
                    novalidate
                  >
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div class="space-y-1">
                        <label class="block text-[11px] font-bold text-slate-700">Etiqueta</label>
                        <input
                          name="etiqueta"
                          type="text"
                          required
                          maxlength="180"
                          value="${escapeHtml(editDraft.etiqueta)}"
                          class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
                        />
                      </div>
                      <div class="space-y-1">
                        <label class="block text-[11px] font-bold text-slate-700">Naturaleza</label>
                        <select
                          name="tipo_vinculacion"
                          class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
                        >
                          ${AUDIT_LINK_NATURES.map(
                            (nat) =>
                              `<option value="${escapeHtml(nat)}" ${
                                editDraft.tipo_vinculacion === nat
                                  ? 'selected'
                                  : ''
                              }>${escapeHtml(nat)}</option>`
                          ).join('')}
                        </select>
                      </div>
                    </div>
                    <label class="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                      <input
                        name="tiene_sitio_temporal"
                        type="checkbox"
                        ${editDraft.tiene_sitio_temporal ? 'checked' : ''}
                        class="w-4 h-4 rounded border-amber-400 text-slate-900 cursor-pointer"
                      />
                      <span>Incluye Sitio Temporal</span>
                    </label>
                    <div class="space-y-1">
                      <label class="block text-[11px] font-bold text-slate-700">Notas</label>
                      <input
                        name="notas"
                        type="text"
                        maxlength="300"
                        value="${escapeHtml(editDraft.notas)}"
                        placeholder="Notas de la caja..."
                        class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
                      />
                    </div>
                    <div class="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        data-action="cancel-edit-vinculo-box"
                        class="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        class="px-3 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
                      >
                        Guardar
                      </button>
                    </div>
                  </form>
                `
                : `
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0 space-y-1">
                      <div class="flex items-center gap-1.5 flex-wrap">
                        <h3 class="text-sm font-bold text-slate-900 truncate" title="${escapeHtml(
                          box.etiqueta
                        )}">
                          📦 ${escapeHtml(box.etiqueta)}
                        </h3>
                        <span class="inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold ${getNatureBadgeClass(
                          box.tipo_vinculacion
                        )}">
                          ${escapeHtml(box.tipo_vinculacion)}
                        </span>
                        <span class="inline-flex items-center px-2 py-0.5 rounded-md border border-slate-200 bg-slate-50 text-[10px] font-semibold text-slate-600">
                          ${escapeHtml(getNivelLabel(box.nivel_vinculacion))}
                        </span>
                        ${
                          box.tiene_sitio_temporal
                            ? '<span class="inline-flex items-center px-2 py-0.5 rounded-md border border-amber-200 bg-amber-50 text-[10px] font-semibold text-amber-800">⏱️ Sitio Temporal</span>'
                            : '<span class="inline-flex items-center px-2 py-0.5 rounded-md border border-slate-200 bg-white text-[10px] text-slate-500">Solo permanentes</span>'
                        }
                      </div>
                      ${
                        !isClient && box.notas
                          ? `<p class="text-[11px] text-slate-500">${escapeHtml(
                              box.notas
                            )}</p>`
                          : ''
                      }
                    </div>
                    ${
                      isStaff
                        ? `
                          <div class="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              data-action="start-edit-vinculo-box"
                              data-vinculo-id="${escapeHtml(box.id)}"
                              class="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
                            >
                              Editar caja
                            </button>
                            ${
                              boxCerts.length === 0
                                ? `
                                  <button
                                    type="button"
                                    data-action="archive-vinculo-box"
                                    data-vinculo-id="${escapeHtml(box.id)}"
                                    ${!archiveCheck.allowed ? 'disabled' : ''}
                                    title="${escapeHtml(
                                      archiveCheck.allowed
                                        ? 'Archivar caja vacía'
                                        : archiveCheck.reason ||
                                            'No se puede archivar'
                                    )}"
                                    class="px-2.5 py-1 rounded-lg border text-[11px] font-semibold whitespace-nowrap ${
                                      archiveCheck.allowed
                                        ? 'border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-800 cursor-pointer'
                                        : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                                    }"
                                  >
                                    Archivar caja
                                  </button>
                                `
                                : ''
                            }
                          </div>
                        `
                        : ''
                    }
                  </div>
                `;

              const suggestionBannerHtml =
                isStaff && inferred.needsUpdate && inferred.suggestionMessage
                  ? `
                    <div class="rounded-lg border border-indigo-200 bg-indigo-50/80 px-2.5 py-2 flex flex-wrap items-center justify-between gap-2">
                      <span class="text-[11px] font-semibold text-indigo-900">
                        💡 ${escapeHtml(inferred.suggestionMessage)}
                      </span>
                      <button
                        type="button"
                        data-action="apply-box-nature-suggestion"
                        data-vinculo-id="${escapeHtml(box.id)}"
                        data-suggested-nivel="${escapeHtml(inferred.recommendedNivel)}"
                        data-suggested-tipo="${escapeHtml(inferred.recommendedTipo)}"
                        class="px-2 py-1 rounded-md bg-indigo-700 hover:bg-indigo-800 text-white text-[10px] font-bold cursor-pointer whitespace-nowrap"
                      >
                        Aplicar ${escapeHtml(inferred.recommendedTipo)}
                      </button>
                    </div>
                  `
                  : '';

              const membersHtml =
                boxCerts.length === 0
                  ? `
                    <div class="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-center text-xs text-slate-500">
                      Caja vacía — Asigne certificados desde LIBRE o muévalos desde otra caja, o archive esta caja vacía.
                    </div>
                  `
                  : `
                    <div class="space-y-2">
                      ${boxCerts
                        .map((member) => {
                          const fullCert = certById.get(member.id_certificado);
                          const sitesText =
                            formatDeclaredSitesSummary(fullCert);
                          const detachCheck = canDetachCertificateFromVinculo(
                            member.id_certificado,
                            box.id,
                            auditPrograms,
                            programacionAudits
                          );
                          const targetKey = `${box.id}:${member.id_certificado}`;
                          const selectedTarget =
                            state.selectedTargetBoxByCertId[targetKey] ||
                            state.selectedTargetBoxByCertId[
                              member.id_certificado
                            ] ||
                            '';

                          return `
                            <div
                              data-vinculo-member-card="${escapeHtml(
                                member.id_certificado
                              )}"
                              ${
                                isStaff
                                  ? `draggable="true" data-vinculo-drag-cert-id="${escapeHtml(
                                      member.id_certificado
                                    )}" data-vinculo-source-box-id="${escapeHtml(
                                      box.id
                                    )}"`
                                  : ''
                              }
                              class="rounded-xl border border-slate-200 bg-slate-50/50 p-3 space-y-2"
                            >
                              <div class="flex items-start justify-between gap-2">
                                <div class="min-w-0 space-y-0.5">
                                  <div class="flex items-center gap-1.5 flex-wrap">
                                    <button
                                      type="button"
                                      data-action="open-cert-resumen"
                                      data-cert-id="${escapeHtml(
                                        member.id_certificado
                                      )}"
                                      class="font-mono text-xs font-bold text-slate-900 hover:text-sky-700 hover:underline cursor-pointer"
                                    >
                                      ${escapeHtml(member.numero_certificado)}
                                    </button>
                                    <span class="inline-flex items-center px-1.5 py-0.5 rounded border border-slate-200 bg-white text-[10px] font-mono text-slate-700">
                                      ${escapeHtml(member.norma_codigo)}
                                    </span>
                                    <span class="inline-flex items-center px-1.5 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-[10px] font-semibold text-emerald-800">
                                      ${escapeHtml(member.estatus)}
                                    </span>
                                  </div>
                                  <p class="text-xs font-semibold text-slate-700 truncate">
                                    🏢 ${escapeHtml(member.organizacion_nombre)}
                                  </p>
                                  <p class="text-[11px] text-slate-500 truncate" title="${escapeHtml(
                                    sitesText
                                  )}">
                                    📍 ${escapeHtml(sitesText)}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  data-action="open-cert-resumen"
                                  data-cert-id="${escapeHtml(
                                    member.id_certificado
                                  )}"
                                  class="px-2 py-1 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-[11px] font-bold cursor-pointer whitespace-nowrap shrink-0"
                                >
                                  Abrir Resumen →
                                </button>
                              </div>

                              ${
                                !detachCheck.allowed && detachCheck.reason
                                  ? `
                                    <div class="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-900">
                                      🔒 Integridad ISO: ${escapeHtml(
                                        detachCheck.reason
                                      )}
                                    </div>
                                  `
                                  : ''
                              }

                              ${
                                isStaff
                                  ? `
                                    <div class="pt-1.5 border-t border-slate-200/70 flex flex-wrap items-center gap-1.5">
                                      <select
                                        data-action="select-target-box-for-cert"
                                        data-cert-id="${escapeHtml(
                                          member.id_certificado
                                        )}"
                                        data-source-vinculo-id="${escapeHtml(
                                          box.id
                                        )}"
                                        aria-label="Mover ${escapeHtml(
                                          member.numero_certificado
                                        )} a otra caja o LIBRE"
                                        class="flex-1 min-w-[170px] text-[11px] px-2 py-1.5 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none truncate"
                                      >
                                        <option value="">Mover a otra caja...</option>
                                        ${otherBoxes
                                          .map(
                                            (ob) =>
                                              `<option value="${escapeHtml(
                                                ob.id
                                              )}" ${
                                                selectedTarget === ob.id
                                                  ? 'selected'
                                                  : ''
                                              }>Mover a: ${escapeHtml(
                                                ob.etiqueta
                                              )}</option>`
                                          )
                                          .join('')}
                                        <option value="__NEW_INDIVIDUAL__" ${
                                          selectedTarget === '__NEW_INDIVIDUAL__'
                                            ? 'selected'
                                            : ''
                                        }>Aislar en caja nueva (Individual)</option>
                                        <option value="__LIBRE__" ${
                                          selectedTarget === '__LIBRE__'
                                            ? 'selected'
                                            : ''
                                        }>Devolver a LIBRE${
                                    !detachCheck.allowed
                                      ? ' (Protegido por auditoría activa)'
                                      : ''
                                  }</option>
                                      </select>
                                      <button
                                        type="button"
                                        data-action="move-boxed-cert"
                                        data-cert-id="${escapeHtml(
                                          member.id_certificado
                                        )}"
                                        data-source-vinculo-id="${escapeHtml(
                                          box.id
                                        )}"
                                        ${!selectedTarget ? 'disabled' : ''}
                                        class="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap ${
                                          selectedTarget
                                            ? 'bg-slate-900 hover:bg-slate-800 text-white cursor-pointer'
                                            : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                        }"
                                      >
                                        Mover
                                      </button>
                                    </div>
                                  `
                                  : ''
                              }
                            </div>
                          `;
                        })
                        .join('')}
                    </div>
                  `;

              return `
                <section
                  data-vinculo-box-id="${escapeHtml(box.id)}"
                  data-vinculo-drop-box-id="${escapeHtml(box.id)}"
                  class="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-3 flex flex-col justify-between transition-colors"
                >
                  <div class="space-y-3">
                    ${boxHeaderHtml}
                    ${suggestionBannerHtml}
                    ${membersHtml}
                  </div>
                  <div class="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                    <span class="font-semibold tabular-nums">${
                      boxCerts.length
                    } certificado${boxCerts.length === 1 ? '' : 's'}</span>
                    <span class="font-mono">${escapeHtml(
                      box.codigo_vinculo || 'Caja activa'
                    )}</span>
                  </div>
                </section>
              `;
            })
            .join('')}
        </div>
      `;

  return `
    <div class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div class="px-4 sm:px-6 py-4 border-b border-slate-200 bg-slate-50/60 flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-start gap-3 min-w-0">
          <button
            type="button"
            data-action="back-to-vinculo-list"
            class="h-9 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer inline-flex items-center gap-1.5 shrink-0"
          >
            <span aria-hidden="true">←</span>
            <span>Volver</span>
          </button>
          <div class="min-w-0 space-y-1">
            <div class="flex items-center gap-2 flex-wrap">
              <h1 class="text-base sm:text-lg font-extrabold text-slate-900 truncate">
                🏛️ ${escapeHtml(summary.nombreConglomerado)}
              </h1>
              ${
                summary.codigoGrupo
                  ? `<span class="px-2 py-0.5 rounded-md border border-slate-200 bg-white text-[11px] font-mono font-semibold text-slate-600">${escapeHtml(
                      summary.codigoGrupo
                    )}</span>`
                  : ''
              }
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-md border text-[11px] font-bold ${coverageBadgeClass}">
                ${summary.boxedCertsCount}/${summary.totalCertsCount} certificados en cajas · ${summary.freeCertsCount} ${
    summary.freeCertsCount === 1 ? 'libre' : 'libres'
  }
              </span>
            </div>
            <p class="text-xs text-slate-500">
              Espacio de Cajas Agrupadoras · ${summary.organizacionesCount} ${
    summary.organizacionesCount === 1 ? 'organización' : 'organizaciones'
  } · ${summary.boxesCount} ${summary.boxesCount === 1 ? 'caja activa' : 'cajas activas'}
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2 flex-wrap shrink-0">
          ${headerAddAuditHtml}
          ${
            isStaff
              ? `
                <button
                  type="button"
                  id="openNewVinculoBoxBtn"
                  data-action="open-create-vinculo-box"
                  class="h-9 px-3.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-2xs whitespace-nowrap"
                >
                  <span aria-hidden="true">+</span>
                  <span>Nueva Caja</span>
                </button>
              `
              : ''
          }
        </div>
      </div>

      <div class="p-4 sm:p-6 space-y-5">
        ${errorBannerHtml}
        ${newBoxFormHtml}

        <section
          aria-labelledby="vinculoLibrePoolHeading"
          data-vinculo-drop-libre="true"
          class="bg-amber-50/40 border border-amber-200/80 rounded-2xl p-4 space-y-3"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="space-y-0.5">
              <h2 id="vinculoLibrePoolHeading" class="text-xs font-extrabold uppercase tracking-wider text-amber-900">
                ⚡ Bandeja LIBRE (${freeCerts.length})
              </h2>
              <p class="text-[11px] text-amber-800/80">
                Certificados sin caja en este conglomerado. Asígnelos a una caja existente o cree una caja individual antes de programar auditorías.
              </p>
            </div>
          </div>
          ${freePoolCardsHtml}
        </section>

        <section aria-labelledby="vinculoBoxesGridHeading" class="space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 id="vinculoBoxesGridHeading" class="text-xs font-extrabold uppercase tracking-wider text-slate-700">
              📦 Cajas Agrupadoras (${activeBoxes.length})
            </h2>
            <p class="text-[11px] text-slate-500">
              Haga clic en cualquier código o «Abrir Resumen →» para consultar el último historial de auditoría del certificado.
            </p>
          </div>
          ${boxesGridHtml}
        </section>
      </div>
    </div>
  `;
}
