import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import type { OrganizacionEntity } from '../lib/activeCertificates';
import type { ConglomeradoEntity } from '../lib/conglomeradoDomain';
import type { ProgramacionAuditEntity } from '../lib/auditExecution';
import {
  AUDIT_LINK_NATURES,
  type AuditLinkNature,
  type ProgramaAuditoriaEntity,
} from '../lib/auditPlanningEngine';
import {
  resolveShortConglomeradoName,
  resolveShortOrganizacionName,
} from '../lib/codenameDomain';
import {
  DEFAULT_VINCULO_VIEW_STATE,
  buildVinculoConglomeradoRows,
  canArchiveVinculoBox,
  canDetachCertificateFromVinculo,
  isCertNatureOverridden,
  resolveCertEffectiveNatureInBox,
  scopeVinculoConglomeradosByRole,
  validateAssignCertToBox,
  type ConglomeradoVinculoSummary,
  type SoftDeletableCertificado,
  type VinculoBoxDraft,
  type VinculoEntity,
  type VinculoSortColumn,
  type VinculoViewState,
} from '../lib/vinculoDomain';
import {
  computeReactiveFacetCounts,
  filterRecordsWithFacets,
  sortItems,
  type ColumnDefinition,
  type MultiViewFacetCategory,
  type MultiViewSelectionMap,
} from '../lib/universalTemplate';
import { renderUniversalTemplate } from './universalTemplate';
import {
  extractUniversalArchiveProps,
  type ArchiveMultiViewConfig,
} from '../lib/archiveGovernance';

export type { VinculoBoxDraft, VinculoSortColumn, VinculoViewState };
export { DEFAULT_VINCULO_VIEW_STATE };
export const DEFAULT_VINCULO_STATE: VinculoViewState = DEFAULT_VINCULO_VIEW_STATE;

export interface VinculoViewProps {
  profile: UserProfile;
  state: VinculoViewState;
  vinculos: ReadonlyArray<VinculoEntity>;
  conglomerados: ReadonlyArray<ConglomeradoEntity>;
  organizaciones: ReadonlyArray<OrganizacionEntity>;
  certificados: ReadonlyArray<SoftDeletableCertificado>;
  auditPrograms?: ReadonlyArray<ProgramaAuditoriaEntity>;
  programacionAudits?: ReadonlyArray<ProgramacionAuditEntity>;
  authorizedClientOrgIds?: ReadonlyArray<string>;
  assignedAuditCertIds?: ReadonlyArray<string>;
  headerAddAuditHtml?: string;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
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

export function renderVinculoView(props: VinculoViewProps): string {
  const {
    profile,
    state,
    vinculos,
    conglomerados,
    organizaciones,
    certificados,
    authorizedClientOrgIds = [],
    loading,
    archiveConfig,
    tableColumnWidths,
  } = props;

  const scoped = scopeVinculoConglomeradosByRole({
    profile,
    conglomerados,
    organizaciones,
    certificados,
    vinculos,
    authorizedClientOrgIds,
  });

  if (!scoped.hasAccess) {
    return `
      <section class="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 text-center max-w-xl mx-auto my-6">
        <p class="text-sm font-bold text-slate-900">Acceso restringido</p>
        <p class="text-xs text-slate-600 mt-1.5">${escapeHtml(
          scoped.accessDeniedReason || 'No autorizado para consultar Vínculo.'
        )}</p>
      </section>
    `;
  }

  const summaries = buildVinculoConglomeradoRows({
    profile,
    conglomerados: scoped.conglomerados,
    organizaciones: scoped.organizaciones,
    certificados: scoped.certificados,
    vinculos: scoped.vinculos,
    authorizedClientOrgIds,
  });

  if (state.selectedConglomeradoId) {
    const selectedSummary = summaries.find(
      (s) => s.id === state.selectedConglomeradoId
    );
    if (selectedSummary) {
      return renderConglomeradoBoxesWorkspace({
        summary: selectedSummary,
        state,
        organizaciones: scoped.organizaciones,
        certificados: scoped.certificados,
        vinculos: scoped.vinculos,
        isStaff: scoped.canEdit,
      });
    }
  }

  return renderVinculoConglomeradoMultiView({
    summaries,
    state,
    loading,
    archiveConfig,
    tableColumnWidths,
  });
}

function renderVinculoConglomeradoMultiView(opts: {
  summaries: ReadonlyArray<ConglomeradoVinculoSummary>;
  state: VinculoViewState;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
}): string {
  const {
    summaries,
    state,
    loading,
    archiveConfig,
    tableColumnWidths,
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
        s.nombreCorto,
        s.nombreConglomerado,
        s.codigoGrupo || '',
        s.natureSummary,
        ...s.organizaciones.map(
          (o) =>
            `${resolveShortOrganizacionName({
              nombre: o.nombre,
              abreviacion: o.abreviacion,
            })} ${o.nombre} ${o.rif}`
        ),
        ...s.vinculos.flatMap((v) => [
          v.etiqueta,
          v.tipo_vinculacion,
          ...v.certificados
            .filter((c) => !c.deleted_at)
            .map(
              (c) =>
                `${c.numero_certificado} ${c.norma_codigo} ${c.organizacion_abreviacion || ''}`
            ),
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
      header: 'Conglomerado',
      sortable: true,
      defaultWidthPct: 34,
      minWidthPx: 200,
      renderCell: (s) => `
        <div class="min-w-0">
          <span class="block font-bold text-slate-900 truncate" title="${escapeHtml(
            s.nombreConglomerado
          )}">${escapeHtml(s.nombreCorto)}</span>
          ${
            s.codigoGrupo
              ? `<span class="block text-[11px] font-mono text-slate-500 truncate">${escapeHtml(
                  s.codigoGrupo
                )}</span>`
              : ''
          }
        </div>
      `,
    },
    {
      id: 'organizaciones',
      header: 'Organizaciones',
      sortable: true,
      defaultWidthPct: 22,
      minWidthPx: 140,
      renderCell: (s) => {
        const orgNames = s.organizaciones
          .map((o) =>
            resolveShortOrganizacionName({
              nombre: o.nombre,
              abreviacion: o.abreviacion,
            })
          )
          .join(' · ');
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
      header: 'Cajas',
      sortable: true,
      defaultWidthPct: 24,
      minWidthPx: 150,
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
      header: 'LIBRE / En cajas',
      sortable: true,
      defaultWidthPct: 20,
      minWidthPx: 140,
      renderCell: (s) => {
        const freeColorClass =
          s.freeCertsCount > 0
            ? 'text-amber-800 bg-amber-50 border-amber-200'
            : s.totalCertsCount > 0
            ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
            : 'text-slate-600 bg-slate-50 border-slate-200';
        const freeLabel =
          s.freeCertsCount > 0
            ? `${s.freeCertsCount} ${s.freeCertsCount === 1 ? 'Libre' : 'Libres'}`
            : s.totalCertsCount > 0
            ? 'Todos en cajas'
            : 'Sin certs';
        return `
          <div class="min-w-0 space-y-0.5">
            <span class="inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold whitespace-nowrap tabular-nums ${freeColorClass}">${escapeHtml(
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
          return s.nombreCorto;
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
    const freeColorClass =
      s.freeCertsCount > 0
        ? 'text-amber-800 bg-amber-50 border-amber-200'
        : s.totalCertsCount > 0
        ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
        : 'text-slate-600 bg-slate-50 border-slate-200';
    const freeText =
      s.freeCertsCount > 0
        ? `${s.freeCertsCount} Libre${s.freeCertsCount === 1 ? '' : 's'}`
        : s.totalCertsCount > 0
        ? 'Todos en cajas'
        : 'Sin certs';

    return `
      <article
        data-action="select-vinculo-conglomerado"
        data-conglomerado-id="${escapeHtml(s.id)}"
        tabindex="0"
        role="button"
        aria-label="Abrir cajas de ${escapeHtml(s.nombreCorto)}"
        class="group bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-400 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between gap-3"
      >
        <div class="space-y-1.5">
          <div class="flex items-start justify-between gap-2">
            <h3 class="text-sm font-bold text-slate-900 group-hover:text-sky-800 transition-colors line-clamp-2" title="${escapeHtml(
              s.nombreConglomerado
            )}">
              ${escapeHtml(s.nombreCorto)}
            </h3>
            <span class="inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-semibold shrink-0 tabular-nums ${freeColorClass}">
              ${escapeHtml(freeText)}
            </span>
          </div>
          <p class="text-xs text-slate-600 tabular-nums truncate">
            ${s.boxesCount} ${s.boxesCount === 1 ? 'caja' : 'cajas'} · ${s.boxedCertsCount}/${s.totalCertsCount} en cajas
          </p>
        </div>
        <div class="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <span class="truncate">${escapeHtml(s.natureSummary)}</span>
          <span class="font-semibold text-sky-700 shrink-0">Abrir →</span>
        </div>
      </article>
    `;
  };

  return renderUniversalTemplate<ConglomeradoVinculoSummary>({
    domainKey: 'vinculos',
    tableId: 'vinculo-main',
    title: 'Vínculo por Conglomerado',
    subtitle: 'Agrupe certificados en cajas por conglomerado.',
    entityLabel: 'conglomerados',
    searchQuery: state.query,
    searchPlaceholder: 'Buscar conglomerado, empresa, caja o certificado...',
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
      )}" title="Abrir cajas de ${escapeHtml(s.nombreCorto)}"`,
    renderCard,
    emptyStateTitle: 'No se encontraron conglomerados en Vínculo',
    emptyStateMessage:
      'Ajuste la búsqueda o los filtros para localizar un conglomerado.',
    actionsHtml: '',
    loading,
    loadingMessage: 'Cargando conglomerados y cajas de vínculo...',
    ...extractUniversalArchiveProps(archiveConfig, 'vinculos'),
  });
}

export function renderVinculoAssignModal(opts: {
  cert: SoftDeletableCertificado;
  conglomeradoId: string;
  conglomeradoName: string;
  boxes: ReadonlyArray<VinculoEntity>;
  allCertificados: ReadonlyArray<SoftDeletableCertificado>;
  organizaciones: ReadonlyArray<OrganizacionEntity>;
  expandedBoxIds: ReadonlyArray<string>;
  errorMessage: string | null;
}): string {
  const {
    cert,
    conglomeradoId,
    conglomeradoName,
    boxes,
    allCertificados,
    organizaciones,
    expandedBoxIds,
    errorMessage,
  } = opts;

  const orgById = new Map(
    organizaciones.filter((o) => !o.deleted_at).map((o) => [o.id, o])
  );
  const certOrg = orgById.get(cert.id_organizacion);
  const certShortOrg = resolveShortOrganizacionName({
    nombre: certOrg?.nombre || cert.organizacion_nombre,
    abreviacion: certOrg?.abreviacion ?? cert.organizacion_abreviacion,
  });

  const expandedSet = new Set(expandedBoxIds);
  const activeBoxes = boxes
    .filter((b) => !b.deleted_at)
    .slice()
    .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es'));

  const boxesHtml =
    activeBoxes.length === 0
      ? `
        <div class="border border-dashed border-slate-200 rounded-xl p-4 text-center text-xs text-slate-500">
          No hay cajas activas en ${escapeHtml(conglomeradoName)}. Cree una caja nueva abajo para asignar este certificado.
        </div>
      `
      : `
        <div class="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
          ${activeBoxes
            .map((box) => {
              const isExpanded = expandedSet.has(box.id);
              const activeMembers = box.certificados.filter((m) => !m.deleted_at);
              const plan = validateAssignCertToBox({
                certId: cert.id,
                targetBoxId: box.id,
                conglomeradoId,
                vinculos: boxes,
                certificados: allCertificados,
                organizaciones,
              });

              const membersListHtml = isExpanded
                ? `
                  <div
                    data-assign-modal-box-members="${escapeHtml(box.id)}"
                    class="px-4 py-2.5 bg-slate-50/80 border-t border-slate-100 space-y-1.5"
                  >
                    ${
                      activeMembers.length === 0
                        ? `<p class="text-[11px] text-slate-500 italic">Caja vacía</p>`
                        : activeMembers
                            .map((member) => {
                              const mOrg = orgById.get(member.id_organizacion);
                              const mShortOrg = resolveShortOrganizacionName({
                                nombre: mOrg?.nombre || member.organizacion_nombre,
                                abreviacion:
                                  mOrg?.abreviacion ?? member.organizacion_abreviacion,
                              });
                              const overridden = isCertNatureOverridden(box, member);
                              const effectiveNature = resolveCertEffectiveNatureInBox(
                                box,
                                member
                              );
                              return `
                                <div class="flex items-center justify-between gap-2 text-xs text-slate-700">
                                  <div class="min-w-0 flex items-center gap-2 truncate">
                                    <span class="font-mono font-semibold text-slate-900 shrink-0">${escapeHtml(
                                      member.numero_certificado
                                    )}</span>
                                    <span class="text-slate-400">·</span>
                                    <span class="text-slate-600 truncate">${escapeHtml(
                                      member.norma_codigo
                                    )}</span>
                                    <span class="text-slate-400">·</span>
                                    <span class="text-slate-600 truncate">${escapeHtml(
                                      mShortOrg
                                    )}</span>
                                  </div>
                                  ${
                                    overridden
                                      ? `<span class="px-1.5 py-0.5 rounded border text-[10px] font-semibold shrink-0 ${getNatureBadgeClass(
                                          effectiveNature
                                        )}">${escapeHtml(effectiveNature)}</span>`
                                      : ''
                                  }
                                </div>
                              `;
                            })
                            .join('')
                    }
                  </div>
                `
                : '';

              return `
                <div data-assign-modal-box-row="${escapeHtml(box.id)}" class="bg-white">
                  <div class="px-3.5 py-2.5 flex items-center justify-between gap-3">
                    <div class="flex items-center gap-2 min-w-0 flex-1">
                      <button
                        type="button"
                        data-action="toggle-assign-modal-box"
                        data-vinculo-id="${escapeHtml(box.id)}"
                        aria-expanded="${isExpanded ? 'true' : 'false'}"
                        aria-label="${
                          isExpanded ? 'Colapsar' : 'Expandir'
                        } caja ${escapeHtml(box.etiqueta)}"
                        class="w-7 h-7 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold inline-flex items-center justify-center shrink-0 cursor-pointer"
                      >
                        ${isExpanded ? '▾' : '▸'}
                      </button>
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2 flex-wrap">
                          <span class="text-xs font-bold text-slate-900 truncate">${escapeHtml(
                            box.etiqueta
                          )}</span>
                          <span class="px-1.5 py-0.5 rounded border text-[10px] font-semibold whitespace-nowrap ${getNatureBadgeClass(
                            box.tipo_vinculacion
                          )}">${escapeHtml(box.tipo_vinculacion)}</span>
                          <span class="text-[11px] text-slate-500 tabular-nums whitespace-nowrap">${
                            activeMembers.length
                          } ${activeMembers.length === 1 ? 'cert.' : 'certs.'}</span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      data-action="confirm-assign-cert-to-box"
                      data-vinculo-id="${escapeHtml(box.id)}"
                      data-cert-id="${escapeHtml(cert.id)}"
                      ${!plan.allowed ? 'disabled' : ''}
                      title="${escapeHtml(
                        plan.allowed
                          ? `Asignar ${cert.numero_certificado} a ${box.etiqueta}`
                          : plan.errorMessage || 'No disponible para este certificado'
                      )}"
                      class="h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                        plan.allowed
                          ? 'bg-slate-900 hover:bg-slate-800 text-white cursor-pointer'
                          : 'bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed'
                      }"
                    >
                      Asignar aquí
                    </button>
                  </div>
                  ${membersListHtml}
                </div>
              `;
            })
            .join('')}
        </div>
      `;

  return `
    <div
      id="vinculoAssignModal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="vinculoAssignModalTitle"
      class="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] flex items-center justify-center p-4 overflow-y-auto"
    >
      <div class="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-xl overflow-hidden my-auto">
        <div class="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 id="vinculoAssignModalTitle" class="text-sm font-bold text-slate-900">
              Asignar certificado a caja
            </h2>
            <p class="text-xs text-slate-600 mt-0.5 truncate">
              <span class="font-mono font-semibold text-slate-900">${escapeHtml(
                cert.numero_certificado
              )}</span> · ${escapeHtml(cert.norma_codigo)} · ${escapeHtml(certShortOrg)}
            </p>
          </div>
          <button
            type="button"
            data-action="close-vinculo-assign-modal"
            aria-label="Cerrar modal de asignación"
            class="w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 text-sm font-bold inline-flex items-center justify-center shrink-0 cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div class="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          ${
            errorMessage
              ? `<div class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800">${escapeHtml(
                  errorMessage
                )}</div>`
              : ''
          }

          <div class="space-y-2">
            <p class="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Cajas en ${escapeHtml(conglomeradoName)}
            </p>
            ${boxesHtml}
          </div>

          <form
            id="assignModalQuickCreateBoxForm"
            data-cert-id="${escapeHtml(cert.id)}"
            class="border border-slate-200 rounded-xl bg-slate-50/70 p-3.5 space-y-3"
          >
            <p class="text-xs font-bold text-slate-800">
              Crear nueva caja y asignar
            </p>
            <div class="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
              <div class="sm:col-span-6 space-y-1">
                <label class="block text-[11px] font-semibold text-slate-700" for="quickCreateBoxEtiqueta">
                  Etiqueta
                </label>
                <input
                  id="quickCreateBoxEtiqueta"
                  name="etiqueta"
                  type="text"
                  required
                  placeholder="Ej: Planta Turmero"
                  class="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                />
              </div>
              <div class="sm:col-span-6 space-y-1">
                <label class="block text-[11px] font-semibold text-slate-700" for="quickCreateBoxNaturaleza">
                  Naturaleza
                </label>
                <select
                  id="quickCreateBoxNaturaleza"
                  name="tipo_vinculacion"
                  class="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                >
                  ${AUDIT_LINK_NATURES.map(
                    (n) =>
                      `<option value="${escapeHtml(n)}" ${
                        n === 'Combinada' ? 'selected' : ''
                      }>${escapeHtml(n)}</option>`
                  ).join('')}
                </select>
              </div>
            </div>
            <div class="flex items-center justify-end">
              <button
                type="submit"
                class="h-8 px-3.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
              >
                Crear caja y asignar
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;
}

function renderConglomeradoBoxesWorkspace(opts: {
  summary: ConglomeradoVinculoSummary;
  state: VinculoViewState;
  organizaciones: ReadonlyArray<OrganizacionEntity>;
  certificados: ReadonlyArray<SoftDeletableCertificado>;
  vinculos: ReadonlyArray<VinculoEntity>;
  isStaff: boolean;
}): string {
  const {
    summary,
    state,
    organizaciones,
    certificados,
    vinculos,
    isStaff,
  } = opts;

  const orgById = new Map<string, OrganizacionEntity>();
  for (const org of [...organizaciones, ...summary.organizaciones]) {
    if (!org.deleted_at) {
      orgById.set(org.id, org);
    }
  }

  const visibleOrgIds = new Set(summary.organizaciones.map((o) => o.id));
  const visibleCertsInCong = certificados.filter(
    (c) => !c.deleted_at && visibleOrgIds.has(c.id_organizacion)
  );

  const boxedCertIds = new Set<string>();
  for (const box of summary.vinculos) {
    if (box.deleted_at) continue;
    for (const item of box.certificados) {
      if (!item.deleted_at) {
        boxedCertIds.add(item.id_certificado);
      }
    }
  }

  const freeCerts = visibleCertsInCong
    .filter((c) => !boxedCertIds.has(c.id))
    .slice()
    .sort((a, b) =>
      a.numero_certificado.localeCompare(b.numero_certificado, 'es')
    );

  const activeBoxes = summary.vinculos
    .filter((v) => !v.deleted_at)
    .slice()
    .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es'));

  const errorBannerHtml = state.editErrorMessage
    ? `
      <div class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-800">
        ${escapeHtml(state.editErrorMessage)}
      </div>
    `
    : '';

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
          class="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3"
        >
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-700">
              Nueva Caja Agrupadora
            </h3>
            <button
              type="button"
              data-action="cancel-create-vinculo-box"
              class="text-xs font-semibold text-slate-500 hover:text-slate-900 cursor-pointer"
            >
              Cancelar
            </button>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div class="md:col-span-5 space-y-1">
              <label class="block text-[11px] font-semibold text-slate-700" for="newBoxEtiquetaInput">
                Etiqueta
              </label>
              <input
                id="newBoxEtiquetaInput"
                name="etiqueta"
                type="text"
                required
                value="${escapeHtml(newBoxDraft.etiqueta)}"
                placeholder="Ej: Planta Turmero"
                class="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
              />
            </div>
            <div class="md:col-span-4 space-y-1">
              <label class="block text-[11px] font-semibold text-slate-700" for="newBoxTipoSelect">
                Naturaleza predeterminada
              </label>
              <select
                id="newBoxTipoSelect"
                name="tipo_vinculacion"
                class="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
              >
                ${AUDIT_LINK_NATURES.map(
                  (n) =>
                    `<option value="${escapeHtml(n)}" ${
                      newBoxDraft.tipo_vinculacion === n ? 'selected' : ''
                    }>${escapeHtml(n)}</option>`
                ).join('')}
              </select>
            </div>
            <div class="md:col-span-3 flex items-center gap-2 pb-1.5">
              <input
                id="newBoxSitioTemporal"
                name="tiene_sitio_temporal"
                type="checkbox"
                ${newBoxDraft.tiene_sitio_temporal ? 'checked' : ''}
                class="w-4 h-4 rounded border-slate-300 text-slate-900"
              />
              <label for="newBoxSitioTemporal" class="text-xs font-medium text-slate-700 cursor-pointer">
                Sitio temporal
              </label>
            </div>
          </div>
          <div class="flex items-center justify-end gap-2">
            <button
              type="button"
              data-action="cancel-create-vinculo-box"
              class="h-8 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              class="h-8 px-3.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
            >
              Guardar caja
            </button>
          </div>
        </form>
      `
      : '';

  const freeCertsHtml =
    freeCerts.length === 0
      ? `
        <p class="text-xs text-slate-500 py-2">
          Todos los certificados activos están asignados a cajas.
        </p>
      `
      : `
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
          ${freeCerts
            .map((cert) => {
              const org = orgById.get(cert.id_organizacion);
              const shortOrg = resolveShortOrganizacionName({
                nombre: org?.nombre || cert.organizacion_nombre,
                abreviacion: org?.abreviacion ?? cert.organizacion_abreviacion,
              });

              if (isStaff) {
                return `
                  <button
                    type="button"
                    data-action="open-vinculo-assign-modal"
                    data-cert-id="${escapeHtml(cert.id)}"
                    data-vinculo-free-cert-card="${escapeHtml(cert.id)}"
                    title="Asignar ${escapeHtml(cert.numero_certificado)} a una caja"
                    class="w-full text-left bg-white border border-amber-200/90 hover:border-slate-400 hover:shadow-xs rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2.5 transition-all cursor-pointer"
                  >
                    <div class="min-w-0">
                      <div class="flex items-center gap-2 min-w-0">
                        <span class="font-mono text-xs font-bold text-slate-900 truncate">${escapeHtml(
                          cert.numero_certificado
                        )}</span>
                        <span class="text-xs text-slate-600 truncate">${escapeHtml(
                          cert.norma_codigo
                        )}</span>
                      </div>
                      <p class="text-[11px] text-slate-500 truncate mt-0.5">${escapeHtml(
                        shortOrg
                      )}</p>
                    </div>
                    <span class="text-[11px] font-semibold text-sky-700 whitespace-nowrap shrink-0">
                      Asignar →
                    </span>
                  </button>
                `;
              }

              return `
                <div
                  data-vinculo-free-cert-card="${escapeHtml(cert.id)}"
                  class="bg-white border border-amber-200/90 rounded-xl px-3.5 py-2.5"
                >
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="font-mono text-xs font-bold text-slate-900 truncate">${escapeHtml(
                      cert.numero_certificado
                    )}</span>
                    <span class="text-xs text-slate-600 truncate">${escapeHtml(
                      cert.norma_codigo
                    )}</span>
                  </div>
                  <p class="text-[11px] text-slate-500 truncate mt-0.5">${escapeHtml(
                    shortOrg
                  )}</p>
                </div>
              `;
            })
            .join('')}
        </div>
      `;

  const boxesGridHtml =
    activeBoxes.length === 0
      ? `
        <div class="border border-dashed border-slate-200 rounded-xl p-6 text-center text-xs text-slate-500">
          Aún no existen cajas agrupadoras en ${escapeHtml(summary.nombreCorto)}.
        </div>
      `
      : `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          ${activeBoxes
            .map((box) => {
              const isEditing = isStaff && state.editingBoxId === box.id;
              const activeMembers = box.certificados
                .filter((m) => !m.deleted_at)
                .slice()
                .sort((a, b) =>
                  a.numero_certificado.localeCompare(b.numero_certificado, 'es')
                );
              const editDraft: VinculoBoxDraft =
                isEditing && state.boxFormDraft
                  ? state.boxFormDraft
                  : {
                      etiqueta: box.etiqueta,
                      tipo_vinculacion: box.tipo_vinculacion,
                      tiene_sitio_temporal: Boolean(box.tiene_sitio_temporal),
                      notas: box.notas || '',
                    };
              const archiveCheck = canArchiveVinculoBox(box);

              if (isEditing) {
                return `
                  <section
                    data-vinculo-box-id="${escapeHtml(box.id)}"
                    class="bg-white border border-slate-300 rounded-xl p-4 space-y-3.5 shadow-xs"
                  >
                    <form
                      data-vinculo-edit-box-form="${escapeHtml(box.id)}"
                      data-vinculo-id="${escapeHtml(box.id)}"
                      class="space-y-3"
                    >
                      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div class="space-y-1">
                          <label class="block text-[11px] font-semibold text-slate-700" for="editBoxEtiqueta-${escapeHtml(
                            box.id
                          )}">
                            Etiqueta
                          </label>
                          <input
                            id="editBoxEtiqueta-${escapeHtml(box.id)}"
                            name="etiqueta"
                            type="text"
                            required
                            value="${escapeHtml(editDraft.etiqueta)}"
                            class="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                          />
                        </div>
                        <div class="space-y-1">
                          <label class="block text-[11px] font-semibold text-slate-700" for="editBoxNaturaleza-${escapeHtml(
                            box.id
                          )}">
                            Naturaleza
                          </label>
                          <select
                            id="editBoxNaturaleza-${escapeHtml(box.id)}"
                            name="tipo_vinculacion"
                            class="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                          >
                            ${AUDIT_LINK_NATURES.map(
                              (n) =>
                                `<option value="${escapeHtml(n)}" ${
                                  editDraft.tipo_vinculacion === n ? 'selected' : ''
                                }>${escapeHtml(n)}</option>`
                            ).join('')}
                          </select>
                        </div>
                      </div>

                      <div class="flex flex-wrap items-center justify-between gap-2">
                        <label class="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                          <input
                            name="tiene_sitio_temporal"
                            type="checkbox"
                            ${editDraft.tiene_sitio_temporal ? 'checked' : ''}
                            class="w-4 h-4 rounded border-slate-300 text-slate-900"
                          />
                          <span>Sitio temporal</span>
                        </label>
                        <div class="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            data-action="archive-vinculo-box"
                            data-vinculo-id="${escapeHtml(box.id)}"
                            ${!archiveCheck.allowed ? 'disabled' : ''}
                            title="${escapeHtml(
                              archiveCheck.allowed
                                ? `Archivar caja ${box.etiqueta}`
                                : archiveCheck.reason || 'Vacíe la caja antes de archivarla'
                            )}"
                            class="h-8 px-2.5 rounded-lg border text-xs font-semibold whitespace-nowrap shrink-0 ${
                              archiveCheck.allowed
                                ? 'border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 cursor-pointer'
                                : 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
                            }"
                          >
                            Archivar caja
                          </button>
                          <button
                            type="button"
                            data-action="cancel-edit-vinculo-box"
                            class="h-8 px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            class="h-8 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            Guardar
                          </button>
                        </div>
                      </div>
                    </form>

                    <div class="pt-3 border-t border-slate-100 space-y-2">
                      ${
                        activeMembers.length === 0
                          ? `<p class="text-xs text-slate-500 italic">Caja vacía</p>`
                          : activeMembers
                              .map((member) => {
                                const mOrg = orgById.get(member.id_organizacion);
                                const shortOrg = resolveShortOrganizacionName({
                                  nombre: mOrg?.nombre || member.organizacion_nombre,
                                  abreviacion:
                                    mOrg?.abreviacion ??
                                    member.organizacion_abreviacion,
                                });
                                const detachCheck = canDetachCertificateFromVinculo(
                                  member.id_certificado,
                                  box.id
                                );
                                return `
                                  <div
                                    data-vinculo-member-card="${escapeHtml(
                                      member.id_certificado
                                    )}"
                                    class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2"
                                  >
                                    <div class="min-w-0 flex-1">
                                      <div class="flex items-center gap-1.5 min-w-0">
                                        <span class="font-mono text-xs font-bold text-slate-900 truncate">${escapeHtml(
                                          member.numero_certificado
                                        )}</span>
                                        <span class="text-slate-400">·</span>
                                        <span class="text-xs text-slate-600 truncate">${escapeHtml(
                                          member.norma_codigo
                                        )}</span>
                                      </div>
                                      <p class="text-[11px] text-slate-500 truncate">${escapeHtml(
                                        shortOrg
                                      )}</p>
                                    </div>
                                    <div class="flex items-center gap-1.5 shrink-0">
                                      <select
                                        data-action="change-cert-nature-override"
                                        data-vinculo-id="${escapeHtml(box.id)}"
                                        data-cert-id="${escapeHtml(
                                          member.id_certificado
                                        )}"
                                        aria-label="Naturaleza para ${escapeHtml(
                                          member.numero_certificado
                                        )}"
                                        class="h-7 px-2 rounded-lg border border-slate-300 bg-white text-[11px] text-slate-800"
                                      >
                                        <option value="" ${
                                          !member.tipo_vinculacion_override
                                            ? 'selected'
                                            : ''
                                        }>Heredar (${escapeHtml(
                                  box.tipo_vinculacion
                                )})</option>
                                        ${AUDIT_LINK_NATURES.map(
                                          (n) =>
                                            `<option value="${escapeHtml(n)}" ${
                                              member.tipo_vinculacion_override === n
                                                ? 'selected'
                                                : ''
                                            }>${escapeHtml(n)}</option>`
                                        ).join('')}
                                      </select>
                                      <button
                                        type="button"
                                        data-action="detach-cert-to-libre"
                                        data-vinculo-id="${escapeHtml(box.id)}"
                                        data-cert-id="${escapeHtml(
                                          member.id_certificado
                                        )}"
                                        ${!detachCheck.allowed ? 'disabled' : ''}
                                        class="h-7 px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-amber-50 hover:border-amber-300 hover:text-amber-900 text-[11px] font-semibold text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
                                      >
                                        Desvincular
                                      </button>
                                    </div>
                                  </div>
                                `;
                              })
                              .join('')
                      }
                    </div>
                  </section>
                `;
              }

              // Read Mode: ultra-clean card (box label + discrete edit icon + compact members)
              return `
                <section
                  data-vinculo-box-id="${escapeHtml(box.id)}"
                  class="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
                >
                  <div class="flex items-center justify-between gap-2">
                    <h3 class="text-sm font-bold text-slate-900 truncate">
                      ${escapeHtml(box.etiqueta)}
                    </h3>
                    ${
                      isStaff
                        ? `
                          <button
                            type="button"
                            data-action="start-edit-vinculo-box"
                            data-vinculo-id="${escapeHtml(box.id)}"
                            aria-label="Editar caja ${escapeHtml(box.etiqueta)}"
                            title="Editar caja"
                            class="w-7 h-7 rounded-lg border border-transparent hover:border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-900 text-xs inline-flex items-center justify-center shrink-0 cursor-pointer"
                          >
                            ✎
                          </button>
                        `
                        : ''
                    }
                  </div>

                  <div class="divide-y divide-slate-100">
                    ${
                      activeMembers.length === 0
                        ? `<p class="text-xs text-slate-400 italic py-1">Caja vacía</p>`
                        : activeMembers
                            .map((member) => {
                              const mOrg = orgById.get(member.id_organizacion);
                              const shortOrg = resolveShortOrganizacionName({
                                nombre: mOrg?.nombre || member.organizacion_nombre,
                                abreviacion:
                                  mOrg?.abreviacion ??
                                  member.organizacion_abreviacion,
                              });
                              const overridden = isCertNatureOverridden(box, member);
                              const effectiveNature = resolveCertEffectiveNatureInBox(
                                box,
                                member
                              );
                              return `
                                <div
                                  data-vinculo-member-card="${escapeHtml(
                                    member.id_certificado
                                  )}"
                                  class="py-1.5 first:pt-0 last:pb-0 flex items-center justify-between gap-2"
                                >
                                  <div class="min-w-0 flex items-center gap-1.5 text-xs truncate">
                                    <span class="font-mono font-semibold text-slate-900 shrink-0">${escapeHtml(
                                      member.numero_certificado
                                    )}</span>
                                    <span class="text-slate-300">·</span>
                                    <span class="text-slate-600 shrink-0">${escapeHtml(
                                      member.norma_codigo
                                    )}</span>
                                    <span class="text-slate-300">·</span>
                                    <span class="text-slate-500 truncate">${escapeHtml(
                                      shortOrg
                                    )}</span>
                                  </div>
                                  ${
                                    overridden
                                      ? `<span data-vinculo-override-badge="true" class="px-1.5 py-0.5 rounded border text-[10px] font-semibold whitespace-nowrap shrink-0 ${getNatureBadgeClass(
                                          effectiveNature
                                        )}">${escapeHtml(effectiveNature)}</span>`
                                      : ''
                                  }
                                </div>
                              `;
                            })
                            .join('')
                    }
                  </div>
                </section>
              `;
            })
            .join('')}
        </div>
      `;

  const modalCert =
    isStaff && state.assignModalCertId
      ? freeCerts.find((c) => c.id === state.assignModalCertId) || null
      : null;

  const modalHtml = modalCert
    ? renderVinculoAssignModal({
        cert: modalCert,
        conglomeradoId: summary.id,
        conglomeradoName: summary.nombreCorto,
        boxes: activeBoxes.length > 0 ? activeBoxes : vinculos.filter((v) => !v.deleted_at && v.id_grupo_empresarial === summary.id),
        allCertificados: visibleCertsInCong,
        organizaciones: Array.from(orgById.values()),
        expandedBoxIds: state.assignModalExpandedBoxIds || [],
        errorMessage: state.assignModalErrorMessage ?? null,
      })
    : '';

  return `
    <div class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div class="px-4 sm:px-6 py-4 border-b border-slate-200 bg-slate-50/60 flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <button
            type="button"
            data-action="back-to-vinculo-list"
            class="h-8 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <span aria-hidden="true">←</span>
            <span>Volver</span>
          </button>
          <div class="min-w-0">
            <h1 class="text-base sm:text-lg font-bold text-slate-900 truncate" title="${escapeHtml(
              summary.nombreConglomerado
            )}">
              ${escapeHtml(
                resolveShortConglomeradoName({
                  nombre: summary.nombreConglomerado,
                  abreviacion: summary.conglomerado.abreviacion,
                  codigo_grupo: summary.codigoGrupo,
                })
              )}
            </h1>
            <p class="text-xs text-slate-500 tabular-nums">
              ${summary.boxedCertsCount}/${summary.totalCertsCount} en cajas · ${summary.freeCertsCount} ${
    summary.freeCertsCount === 1 ? 'libre' : 'libres'
  }
            </p>
          </div>
        </div>
        ${
          isStaff
            ? `
              <button
                type="button"
                id="openNewVinculoBoxBtn"
                data-action="open-create-vinculo-box"
                class="h-8 px-3.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <span aria-hidden="true">+</span>
                <span>Nueva Caja</span>
              </button>
            `
            : ''
        }
      </div>

      <div class="p-4 sm:p-6 space-y-6">
        ${errorBannerHtml}
        ${newBoxFormHtml}

        <section aria-labelledby="vinculoLibrePoolHeading" class="space-y-2.5">
          <h2 id="vinculoLibrePoolHeading" class="text-xs font-bold uppercase tracking-wider text-slate-700">
            Certificados LIBRE (${freeCerts.length})
          </h2>
          ${freeCertsHtml}
        </section>

        <section aria-labelledby="vinculoBoxesGridHeading" class="space-y-3">
          <h2 id="vinculoBoxesGridHeading" class="text-xs font-bold uppercase tracking-wider text-slate-700">
            Cajas Agrupadoras (${activeBoxes.length})
          </h2>
          ${boxesGridHtml}
        </section>
      </div>
    </div>
    ${modalHtml}
  `;
}
