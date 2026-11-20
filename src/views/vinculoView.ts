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
import {
  canDetachCertificateFromVinculo,
  computeCertificateCommitmentSummaries,
  createEmptyVinculoFormDraft,
  createVinculoDraftFromEntity,
  filterFreeCertificatesInConglomerado,
  getCommitmentStatusLabel,
  type CertificateCommitmentSummary,
  type SoftDeletableCertificado,
  type VinculoEntity,
  type VinculoFormDraft,
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

export type VinculoSubMode = 'vinculos' | 'libres';
export type VinculoChildTab = 'certificados' | 'campanias';
export type VinculoSortColumn = 'etiqueta' | 'conglomerado' | 'naturaleza' | 'certificados';

export interface VinculoViewState {
  activeSubMode: VinculoSubMode;
  query: string;
  viewMode: UniversalViewMode;
  isSidebarOpen: boolean;
  sortColumn: VinculoSortColumn | null;
  sortDirection: SortDirection;
  facetSelections: MultiViewSelectionMap;
  selectedVinculoId: string | null;
  activeChildTab: VinculoChildTab;
  isCreating: boolean;
  isEditingAttributes: boolean;
  formDraft?: VinculoFormDraft;
  editErrorMessage: string | null;
  selectedFreeCertIdsForBatch: string[];
  addFreeCertId?: string | null;
}

export interface VinculoViewProps {
  profile: UserProfile;
  state: VinculoViewState;
  vinculos: ReadonlyArray<VinculoEntity>;
  conglomerados: ReadonlyArray<ConglomeradoEntity>;
  organizaciones: ReadonlyArray<OrganizacionEntity>;
  certificados: ReadonlyArray<SoftDeletableCertificado>;
  auditPrograms: ReadonlyArray<ProgramaAuditoriaEntity>;
  programacionAudits: ReadonlyArray<ProgramacionAuditEntity>;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
}

export function resolveVinculoDetailMode(
  state: VinculoViewState,
  isStaff: boolean,
  selectedVinculo?: VinculoEntity
): 'read' | 'add' | 'edit' {
  if (!isStaff) return 'read';
  if (state.isCreating && !state.selectedVinculoId) return 'add';
  if (selectedVinculo && state.isEditingAttributes) return 'edit';
  return 'read';
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

function getVinculoConglomeradoName(
  vinculo: VinculoEntity,
  conglomerados: ReadonlyArray<ConglomeradoEntity>
): string {
  const match = conglomerados.find((g) => g.id === vinculo.id_grupo_empresarial);
  return match?.nombre || vinculo.grupo_nombre || 'Conglomerado';
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
    loading,
    archiveConfig,
    tableColumnWidths,
  } = props;

  const isStaff = isApprovedStaffProfile(profile);
  const activeVinculos = vinculos.filter((v) => !v.deleted_at);
  const activeConglomerados = conglomerados.filter((g) => !g.deleted_at);

  const commitmentSummaries = computeCertificateCommitmentSummaries(
    certificados,
    organizaciones,
    activeConglomerados,
    activeVinculos
  );
  const freeSummaries = commitmentSummaries.filter((s) => s.status === 'LIBRE');

  if (state.selectedVinculoId) {
    const selectedVinculo = activeVinculos.find((v) => v.id === state.selectedVinculoId);
    if (selectedVinculo) {
      return renderVinculoDetailView({
        profile,
        state,
        vinculo: selectedVinculo,
        conglomerados: activeConglomerados,
        organizaciones,
        commitmentSummaries,
        auditPrograms,
        programacionAudits,
        isStaff,
        tableColumnWidths,
      });
    }
  }

  if (isStaff && state.isCreating) {
    return renderVinculoDetailView({
      profile,
      state,
      conglomerados: activeConglomerados,
      organizaciones,
      commitmentSummaries,
      auditPrograms,
      programacionAudits,
      isStaff,
      tableColumnWidths,
    });
  }

  const subModeSwitcherHtml = `
    <div class="flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 shadow-2xs">
      <div class="inline-flex items-center gap-1.5" role="group" aria-label="Modos de trabajo en Vínculo">
        <button
          type="button"
          data-action="set-vinculo-submode"
          data-submode="vinculos"
          aria-pressed="${state.activeSubMode === 'vinculos' ? 'true' : 'false'}"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
            state.activeSubMode === 'vinculos'
              ? 'bg-slate-900 text-white shadow-2xs'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }"
        >
          <span aria-hidden="true">🔗</span>
          <span>Vínculos (${activeVinculos.length})</span>
        </button>
        <button
          type="button"
          data-action="set-vinculo-submode"
          data-submode="libres"
          aria-pressed="${state.activeSubMode === 'libres' ? 'true' : 'false'}"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
            state.activeSubMode === 'libres'
              ? 'bg-amber-600 text-white shadow-2xs'
              : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
          }"
        >
          <span aria-hidden="true">⚡</span>
          <span>Certificados Libres (${freeSummaries.length})</span>
        </button>
      </div>
      <p class="text-[11px] text-slate-500">
        Asigne cada certificado <strong class="text-amber-800">Libre</strong> a <strong class="text-slate-700">Individual</strong> o <strong class="text-violet-800">Vinculado</strong> antes de pasar a Designación.
      </p>
    </div>
  `;

  if (state.activeSubMode === 'libres') {
    return `
      <div class="space-y-3">
        ${subModeSwitcherHtml}
        ${renderFreeCertificatesQueue({
          state,
          freeSummaries,
          isStaff,
          tableColumnWidths,
        })}
      </div>
    `;
  }

  return `
    <div class="space-y-3">
      ${subModeSwitcherHtml}
      ${renderVinculosMultiView({
        state,
        activeVinculos,
        activeConglomerados,
        isStaff,
        loading,
        archiveConfig,
        tableColumnWidths,
      })}
    </div>
  `;
}

function renderVinculosMultiView(opts: {
  state: VinculoViewState;
  activeVinculos: ReadonlyArray<VinculoEntity>;
  activeConglomerados: ReadonlyArray<ConglomeradoEntity>;
  isStaff: boolean;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
}): string {
  const {
    state,
    activeVinculos,
    activeConglomerados,
    isStaff,
    loading,
    archiveConfig,
    tableColumnWidths,
  } = opts;

  const uniqueCongOptions = Array.from(
    new Map(
      activeVinculos.map((v) => {
        const name = getVinculoConglomeradoName(v, activeConglomerados);
        return [v.id_grupo_empresarial, name];
      })
    ).entries()
  )
    .sort((a, b) => a[1].localeCompare(b[1], 'es'))
    .map(([value, label]) => ({ value, label }));

  const facetCategories: MultiViewFacetCategory<VinculoEntity>[] = [
    {
      id: 'temporal',
      label: 'Tiene Sitio Temporal',
      options: [
        { value: 'SI', label: 'Sí (Incluye sitio temporal)' },
        { value: 'NO', label: 'No (Solo sitios permanentes)' },
      ],
      extractValues: (v) => (v.tiene_sitio_temporal ? 'SI' : 'NO'),
    },
    {
      id: 'nivel',
      label: 'Nivel / Naturaleza',
      options: [
        { value: 'INDIVIDUAL', label: 'Individual' },
        { value: 'NIVEL_1_INTRA_ORG', label: 'Nivel 1 · Intra-Org' },
        { value: 'NIVEL_2_INTER_ORG', label: 'Nivel 2 · Inter-Org' },
      ],
      extractValues: (v) => v.nivel_vinculacion,
    },
    {
      id: 'conglomerado',
      label: 'Conglomerado',
      options: uniqueCongOptions,
      extractValues: (v) => v.id_grupo_empresarial,
    },
  ];

  const selections: MultiViewSelectionMap = state.facetSelections || {};
  const searchOptions = {
    getSearchableText: (v: VinculoEntity) =>
      [
        v.etiqueta,
        v.codigo_vinculo || '',
        getVinculoConglomeradoName(v, activeConglomerados),
        v.tipo_vinculacion,
        getNivelLabel(v.nivel_vinculacion),
        v.certificados
          .filter((c) => !c.deleted_at)
          .map((c) => `${c.numero_certificado} ${c.organizacion_nombre} ${c.norma_codigo}`)
          .join(' '),
      ].join(' '),
  };

  const facetGroups = computeReactiveFacetCounts(
    [...activeVinculos],
    state.query,
    facetCategories,
    selections,
    searchOptions
  );

  const filteredVinculos = filterRecordsWithFacets(
    [...activeVinculos],
    state.query,
    facetCategories,
    selections,
    searchOptions
  );

  const columns: ColumnDefinition<VinculoEntity>[] = [
    {
      id: 'etiqueta',
      header: 'Vínculo',
      sortable: true,
      defaultWidthPct: 30,
      minWidthPx: 185,
      renderCell: (v) => `
        <div class="min-w-0">
          <span class="block font-bold text-slate-900 truncate" title="${escapeHtml(v.etiqueta)}">${escapeHtml(v.etiqueta)}</span>
          <span class="block text-[11px] font-mono text-slate-500 truncate">${escapeHtml(
            v.codigo_vinculo || 'Sin código'
          )}</span>
        </div>
      `,
    },
    {
      id: 'conglomerado',
      header: 'Conglomerado',
      sortable: true,
      defaultWidthPct: 22,
      minWidthPx: 140,
      renderCell: (v) => {
        const congName = getVinculoConglomeradoName(v, activeConglomerados);
        return `<span class="block text-slate-700 font-medium truncate" title="${escapeHtml(congName)}">${escapeHtml(congName)}</span>`;
      },
    },
    {
      id: 'naturaleza',
      header: 'Tipo y Nivel',
      sortable: true,
      defaultWidthPct: 20,
      minWidthPx: 135,
      renderCell: (v) => {
        const badgeClass = v.es_vinculada
          ? 'bg-violet-50 text-violet-800 border-violet-200'
          : 'bg-sky-50 text-sky-800 border-sky-200';
        const label = v.es_vinculada
          ? `${getNivelLabel(v.nivel_vinculacion)} · ${v.tipo_vinculacion}`
          : 'Individual';
        return `<span class="inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold truncate max-w-full ${badgeClass}" title="${escapeHtml(label)}">${escapeHtml(label)}</span>`;
      },
    },
    {
      id: 'certificados',
      header: 'Certificados',
      sortable: true,
      defaultWidthPct: 16,
      minWidthPx: 120,
      renderCell: (v) => {
        const activeCerts = v.certificados.filter((c) => !c.deleted_at);
        const codes = activeCerts.map((c) => c.numero_certificado).join(', ');
        return `
          <div class="min-w-0">
            <span class="block font-semibold text-slate-800 tabular-nums whitespace-nowrap">${activeCerts.length} ${
              activeCerts.length === 1 ? 'cert' : 'certs'
            }</span>
            ${
              codes
                ? `<span class="block text-[11px] font-mono text-slate-500 truncate" title="${escapeHtml(codes)}">${escapeHtml(codes)}</span>`
                : ''
            }
          </div>
        `;
      },
    },
    {
      id: 'temporal',
      header: 'Sitio Temp.',
      sortable: false,
      defaultWidthPct: 12,
      minWidthPx: 95,
      renderCell: (v) =>
        v.tiene_sitio_temporal
          ? '<span class="inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold bg-amber-50 text-amber-800 border-amber-200 whitespace-nowrap">Sí (Temporal)</span>'
          : '<span class="inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-medium bg-slate-50 text-slate-600 border-slate-200 whitespace-nowrap">No</span>',
    },
  ];

  const sortedVinculos = sortItems(
    filteredVinculos,
    state.sortColumn,
    state.sortDirection,
    (v, col) => {
      switch (col) {
        case 'etiqueta':
          return v.etiqueta;
        case 'conglomerado':
          return getVinculoConglomeradoName(v, activeConglomerados);
        case 'naturaleza':
          return `${v.nivel_vinculacion} ${v.tipo_vinculacion}`;
        case 'certificados':
          return v.certificados.filter((c) => !c.deleted_at).length;
        default:
          return '';
      }
    }
  );

  const renderCard = (v: VinculoEntity): string => {
    const congName = getVinculoConglomeradoName(v, activeConglomerados);
    const activeCerts = v.certificados.filter((c) => !c.deleted_at);
    const natureLabel = v.es_vinculada
      ? `${getNivelLabel(v.nivel_vinculacion)} · ${v.tipo_vinculacion}`
      : 'Individual';
    const badgeClass = v.es_vinculada
      ? 'bg-violet-50 text-violet-800 border-violet-200'
      : 'bg-sky-50 text-sky-800 border-sky-200';
    const certCodes =
      activeCerts.length > 0
        ? activeCerts.map((c) => c.numero_certificado).join(' · ')
        : 'Sin certificados';

    return `
      <article
        data-action="select-vinculo"
        data-vinculo-id="${escapeHtml(v.id)}"
        tabindex="0"
        role="button"
        aria-label="Abrir vínculo ${escapeHtml(v.etiqueta)}"
        class="group bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-400 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between gap-3"
      >
        <div class="space-y-2">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="text-[11px] font-mono text-slate-500 truncate">${escapeHtml(
                v.codigo_vinculo || 'Sin código'
              )}</p>
              <h3 class="text-sm font-bold text-slate-900 group-hover:text-sky-800 transition-colors line-clamp-2">
                ${escapeHtml(v.etiqueta)}
              </h3>
            </div>
            <span class="inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-semibold shrink-0 ${badgeClass}">
              ${escapeHtml(v.es_vinculada ? 'Vinculado' : 'Individual')}
            </span>
          </div>
          <p class="text-xs text-slate-600 truncate" title="${escapeHtml(congName)}">
            🏛️ ${escapeHtml(congName)}
          </p>
          <p class="text-[11px] text-slate-500 truncate" title="${escapeHtml(natureLabel)}">
            ${escapeHtml(natureLabel)}
          </p>
          <p class="text-[11px] font-mono text-slate-600 truncate" title="${escapeHtml(certCodes)}">
            ${escapeHtml(certCodes)}
          </p>
        </div>

        <div class="pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600 gap-2">
          <span class="tabular-nums font-semibold text-slate-800">${activeCerts.length} ${
            activeCerts.length === 1 ? 'cert' : 'certs'
          }</span>
          ${
            v.tiene_sitio_temporal
              ? '<span class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">⏱️ Sitio Temp.</span>'
              : '<span class="text-[10px] text-slate-400">Sin sitio temp.</span>'
          }
          <span class="text-[11px] font-semibold text-sky-700 group-hover:underline">Ver detalle →</span>
        </div>
      </article>
    `;
  };

  const actionsHtml = isStaff
    ? `
      <button
        type="button"
        data-action="open-create-vinculo"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-2xs"
      >
        <span aria-hidden="true">+</span>
        <span>Nuevo Vínculo</span>
      </button>
    `
    : '';

  return renderUniversalTemplate<VinculoEntity>({
    domainKey: 'vinculos',
    tableId: 'vinculo-main',
    title: 'Vínculos de Certificados',
    subtitle:
      'Compromiso operativo de certificados (Individual o Vinculado Nivel 1 / Nivel 2) y habilitación de sitios temporales.',
    entityLabel: 'vínculos',
    searchQuery: state.query,
    searchPlaceholder: 'Buscar vínculo, código, conglomerado o certificado...',
    searchInputId: 'vinculoSearchInput',
    clearSearchBtnId: 'clearVinculoSearchBtn',
    totalCount: activeVinculos.length,
    filteredCount: sortedVinculos.length,
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen,
    sortState: { column: state.sortColumn, direction: state.sortDirection },
    columnWidths: tableColumnWidths?.['vinculo-main'],
    facetGroups,
    items: sortedVinculos,
    columns,
    getRowAttrs: (v) =>
      `data-action="select-vinculo" data-vinculo-id="${escapeHtml(v.id)}" title="Abrir detalle de ${escapeHtml(v.etiqueta)}"`,
    renderCard,
    emptyStateTitle: 'No se encontraron vínculos',
    emptyStateMessage:
      'Ajuste la búsqueda o filtros laterales, o utilice la pestaña Certificados Libres para comprometer certificados.',
    actionsHtml,
    loading,
    loadingMessage: 'Cargando vínculos de auditoría...',
    ...extractUniversalArchiveProps(archiveConfig, 'vinculos'),
  });
}

function renderFreeCertificatesQueue(opts: {
  state: VinculoViewState;
  freeSummaries: ReadonlyArray<CertificateCommitmentSummary>;
  isStaff: boolean;
  tableColumnWidths?: Record<string, Record<string, number>>;
}): string {
  const { state, freeSummaries, isStaff, tableColumnWidths } = opts;

  const q = state.query.trim().toLowerCase();
  const filteredFree = q
    ? freeSummaries.filter((s) =>
        [
          s.certificado.numero_certificado,
          s.certificado.organizacion_nombre,
          s.grupo_nombre,
          s.certificado.norma_codigo,
        ]
          .join(' ')
          .toLowerCase()
          .includes(q)
      )
    : [...freeSummaries];

  const selectedIds = new Set(state.selectedFreeCertIdsForBatch);
  const selectedSummaries = filteredFree.filter((s) => selectedIds.has(s.certificado.id));
  const selectedCongIds = new Set(
    selectedSummaries
      .map((s) => s.id_grupo_empresarial)
      .filter((id): id is string => Boolean(id))
  );
  const allSelectedHaveCong =
    selectedSummaries.length > 0 &&
    selectedSummaries.every((s) => Boolean(s.id_grupo_empresarial));
  const canBatchIndividual = isStaff && allSelectedHaveCong && selectedSummaries.length >= 1;
  const canBatchGroup =
    isStaff && allSelectedHaveCong && selectedSummaries.length >= 2 && selectedCongIds.size === 1;

  const mixedCongWarning =
    selectedSummaries.length >= 2 && selectedCongIds.size > 1
      ? `<p role="alert" class="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">⚠️ Para crear un Vínculo Grupal, seleccione certificados pertenecientes al mismo Conglomerado.</p>`
      : '';

  const errorBanner = state.editErrorMessage
    ? `<div role="alert" class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800 flex items-center gap-2"><span aria-hidden="true">⚠️</span><span>${escapeHtml(state.editErrorMessage)}</span></div>`
    : '';

  const batchBarHtml = isStaff
    ? `
      <div class="flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
        <div class="flex flex-wrap items-center gap-2 flex-1 min-w-[200px]">
          <input
            type="search"
            id="vinculoLibresSearchInput"
            value="${escapeHtml(state.query)}"
            placeholder="Filtrar certificados libres por número, empresa, conglomerado o norma..."
            class="w-full sm:max-w-sm text-xs px-3 py-1.5 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
          />
          <span class="text-xs text-slate-600 font-medium tabular-nums">
            ${selectedSummaries.length} seleccionado${selectedSummaries.length === 1 ? '' : 's'}
          </span>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            id="batchMarkIndividualBtn"
            data-action="batch-mark-individual"
            ${!canBatchIndividual ? 'disabled' : ''}
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              canBatchIndividual
                ? 'bg-sky-700 hover:bg-sky-800 text-white cursor-pointer'
                : 'bg-slate-200 text-slate-500 cursor-not-allowed'
            }"
          >
            <span>Pasar a Individual</span>
          </button>
          <button
            type="button"
            id="batchCreateGroupVinculoBtn"
            data-action="batch-create-group-vinculo"
            ${!canBatchGroup ? 'disabled' : ''}
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              canBatchGroup
                ? 'bg-slate-900 hover:bg-slate-800 text-white cursor-pointer'
                : 'bg-slate-200 text-slate-500 cursor-not-allowed'
            }"
          >
            <span>Crear Vínculo Grupal</span>
          </button>
        </div>
      </div>
      ${mixedCongWarning}
      ${errorBanner}
    `
    : `
      <div class="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs flex items-center justify-between gap-2">
        <input
          type="search"
          id="vinculoLibresSearchInput"
          value="${escapeHtml(state.query)}"
          placeholder="Filtrar certificados libres..."
          class="w-full sm:max-w-sm text-xs px-3 py-1.5 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
        />
        <span class="text-xs text-slate-500">Solo lectura</span>
      </div>
    `;

  if (filteredFree.length === 0) {
    return `
      ${batchBarHtml}
      <div class="p-10 text-center bg-white border border-slate-200 rounded-xl space-y-2">
        <div class="text-2xl" aria-hidden="true">✅</div>
        <h3 class="text-sm font-bold text-slate-900">No hay certificados libres pendientes</h3>
        <p class="text-xs text-slate-500 max-w-md mx-auto">
          Todos los certificados visibles ya se encuentran comprometidos en un vínculo Individual o Vinculado.
        </p>
      </div>
    `;
  }

  const columns: ColumnDefinition<CertificateCommitmentSummary>[] = [
    {
      id: 'certificado',
      header: 'Certificado',
      defaultWidthPct: 24,
      minWidthPx: 160,
      renderCell: (s) => {
        const isChecked = selectedIds.has(s.certificado.id);
        return `
          <div class="flex items-center gap-2 min-w-0">
            ${
              isStaff
                ? `<input type="checkbox" data-action="toggle-free-cert-checkbox" data-cert-id="${escapeHtml(s.certificado.id)}" aria-label="Seleccionar certificado ${escapeHtml(s.certificado.numero_certificado)}" ${isChecked ? 'checked' : ''} class="w-3.5 h-3.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900 shrink-0 cursor-pointer" />`
                : ''
            }
            <span class="font-mono font-bold text-slate-900 truncate" title="${escapeHtml(s.certificado.numero_certificado)}">${escapeHtml(s.certificado.numero_certificado)}</span>
          </div>
        `;
      },
    },
    {
      id: 'organizacion',
      header: 'Organización',
      defaultWidthPct: 28,
      minWidthPx: 170,
      renderCell: (s) =>
        `<span class="block text-slate-800 font-medium truncate" title="${escapeHtml(s.certificado.organizacion_nombre)}">${escapeHtml(s.certificado.organizacion_nombre)}</span>`,
    },
    {
      id: 'conglomerado',
      header: 'Conglomerado',
      defaultWidthPct: 22,
      minWidthPx: 145,
      renderCell: (s) =>
        `<span class="block text-slate-700 truncate" title="${escapeHtml(s.grupo_nombre)}">${escapeHtml(s.grupo_nombre)}</span>`,
    },
    {
      id: 'norma',
      header: 'Norma',
      defaultWidthPct: 14,
      minWidthPx: 110,
      renderCell: (s) =>
        `<span class="block text-slate-700 font-mono text-[11px] truncate" title="${escapeHtml(s.certificado.norma_codigo)}">${escapeHtml(s.certificado.norma_codigo)}</span>`,
    },
    {
      id: 'estatus',
      header: 'Estatus',
      defaultWidthPct: 12,
      minWidthPx: 95,
      renderCell: (s) => {
        const badge = getCommitmentStatusLabel(s.status);
        return `<span class="inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold whitespace-nowrap ${badge.badgeClass}">${escapeHtml(badge.label)}</span>`;
      },
    },
  ];

  return `
    ${batchBarHtml}
    ${renderListViewTable({
      tableId: 'vinculo-libres',
      columns,
      items: filteredFree,
      columnWidths: tableColumnWidths?.['vinculo-libres'],
      getRowAttrs: (s) =>
        isStaff
          ? `data-action="toggle-free-cert-row" data-cert-id="${escapeHtml(s.certificado.id)}" title="Seleccionar ${escapeHtml(s.certificado.numero_certificado)}"`
          : `title="${escapeHtml(s.certificado.numero_certificado)}"`,
    })}
  `;
}

function renderVinculoDetailView(opts: {
  profile: UserProfile;
  state: VinculoViewState;
  vinculo?: VinculoEntity;
  conglomerados: ReadonlyArray<ConglomeradoEntity>;
  organizaciones: ReadonlyArray<OrganizacionEntity>;
  commitmentSummaries: ReadonlyArray<CertificateCommitmentSummary>;
  auditPrograms: ReadonlyArray<ProgramaAuditoriaEntity>;
  programacionAudits: ReadonlyArray<ProgramacionAuditEntity>;
  isStaff: boolean;
  tableColumnWidths?: Record<string, Record<string, number>>;
}): string {
  const {
    profile,
    state,
    vinculo,
    conglomerados,
    organizaciones,
    commitmentSummaries,
    auditPrograms,
    programacionAudits,
    isStaff,
    tableColumnWidths,
  } = opts;

  const mode = resolveVinculoDetailMode(state, isStaff, vinculo);
  const isCreateMode = mode === 'add';
  const isReadOnly = mode === 'read';

  const defaultCongId = conglomerados[0]?.id || '';
  const draft: VinculoFormDraft =
    mode === 'add'
      ? state.formDraft ?? createEmptyVinculoFormDraft({ id_grupo_empresarial: defaultCongId })
      : mode === 'edit'
      ? state.formDraft ??
        (vinculo ? createVinculoDraftFromEntity(vinculo) : createEmptyVinculoFormDraft())
      : vinculo
      ? createVinculoDraftFromEntity(vinculo)
      : createEmptyVinculoFormDraft();

  const congName = vinculo ? getVinculoConglomeradoName(vinculo, conglomerados) : 'Conglomerado';
  const activeCerts = vinculo ? vinculo.certificados.filter((c) => !c.deleted_at) : [];

  const linkedPrograms = vinculo
    ? auditPrograms.filter(
        (p) =>
          !p.deleted_at &&
          (p.id_vinculo === vinculo.id ||
            p.auditorias.some((a) =>
              activeCerts.some((vc) => vc.id_certificado === a.id_certificado)
            ))
      )
    : [];

  const customTopActionsHtml = isStaff
    ? renderDetailFormTopActions({
        mode,
        isStaff: true,
        formId: 'vinculoDetailForm',
        saveBtnId: 'saveVinculoFormBtn',
        cancelBtnId: 'cancelEditVinculoBtn',
        editBtnId: 'startEditVinculoBtn',
        saveTitle: isCreateMode ? 'Crear vínculo' : 'Guardar cambios',
        cancelTitle: isCreateMode ? 'Cancelar creación' : 'Cancelar edición',
        editTitle: 'Editar vínculo',
        showHistoryBtn: !isCreateMode,
        showArchiveBtn: !isCreateMode && canArchiveRecord(profile),
        extraAuditAttrs: vinculo
          ? `data-table-name="vinculo" data-record-id="${escapeHtml(vinculo.id)}" data-entity-name="${escapeHtml(vinculo.etiqueta)}"`
          : '',
        extraArchiveAttrs: vinculo
          ? `data-archive-table="vinculo" data-archive-id="${escapeHtml(vinculo.id)}" data-archive-entity-label="Vínculo" data-archive-title="${escapeHtml(vinculo.etiqueta)}" data-archive-subtitle="${escapeHtml(vinculo.codigo_vinculo || congName)}"`
          : '',
      })
    : undefined;

  const feedbackHtml = state.editErrorMessage
    ? `
      <div role="alert" class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800 flex items-center gap-2">
        <span aria-hidden="true">⚠️</span>
        <span>${escapeHtml(state.editErrorMessage)}</span>
      </div>
    `
    : '';

  const customRecordBodyHtml =
    isReadOnly && vinculo
      ? renderReadOnlyVinculoAttributes(vinculo, congName)
      : renderVinculoFormBody({
          draft,
          conglomerados,
          commitmentSummaries,
          editingVinculo: vinculo,
        });

  const activeTab: VinculoChildTab =
    state.activeChildTab === 'campanias' ? 'campanias' : 'certificados';

  const childTabs = isCreateMode
    ? []
    : [
        {
          id: 'certificados',
          label: 'Certificados vinculados',
          symbol: '📜',
          count: activeCerts.length,
        },
        {
          id: 'campanias',
          label: 'Campañas de Auditoría',
          symbol: '🧭',
          count: linkedPrograms.length,
        },
      ];

  const statusBadge =
    !isCreateMode && vinculo
      ? {
          label: vinculo.es_vinculada
            ? `Vinculado · ${vinculo.tipo_vinculacion}`
            : 'Individual',
          badgeClass: vinculo.es_vinculada
            ? 'bg-violet-50 text-violet-800 border-violet-200'
            : 'bg-sky-50 text-sky-800 border-sky-200',
        }
      : undefined;

  const parents =
    !isCreateMode && vinculo
      ? [
          {
            label: 'Conglomerado',
            value: congName,
            symbol: '🏛️',
            navAction: {
              nav: 'certificacion',
              subview: 'conglomerados',
              entityType: 'conglomerado' as const,
              entityId: vinculo.id_grupo_empresarial,
            },
          },
        ]
      : [];

  return renderDetailPageTemplate({
    entityType: 'Vínculo de Auditoría',
    entitySymbol: '🔗',
    title: isCreateMode ? 'Nuevo Vínculo' : vinculo ? vinculo.etiqueta : 'Vínculo',
    eyebrowCode: !isCreateMode && vinculo?.codigo_vinculo ? vinculo.codigo_vinculo : undefined,
    subtitle: isCreateMode
      ? 'Comprometa certificados libres de un mismo conglomerado para habilitar Designación y Programación.'
      : vinculo
      ? `${getNivelLabel(vinculo.nivel_vinculacion)} · ${activeCerts.length} certificado${
          activeCerts.length === 1 ? '' : 's'
        }${vinculo.tiene_sitio_temporal ? ' · Incluye sitio temporal' : ''}`
      : undefined,
    statusBadge,
    backButton: {
      label: 'Volver',
      nav: 'auditorias',
      subview: 'vinculo',
      action: 'back-to-vinculo-list',
    },
    isCreateMode,
    customTopActionsHtml,
    parents,
    tableName: 'vinculo',
    recordId: vinculo?.id || 'vinculo-new',
    feedbackHtml,
    attributes: [],
    customRecordBodyHtml,
    childTabs,
    activeChildTabId: activeTab,
    childTabAttrName: 'data-vinculo-tab',
    renderChildTabContent: (tabId) => {
      if (!vinculo) return '';
      if (tabId === 'campanias') {
        return renderVinculoCampaniasTab(linkedPrograms, vinculo, tableColumnWidths);
      }
      return renderVinculoCertificadosTab({
        vinculo,
        commitmentSummaries,
        organizaciones,
        auditPrograms,
        programacionAudits,
        isStaff,
        addFreeCertId: state.addFreeCertId || '',
      });
    },
  });
}

function renderReadOnlyVinculoAttributes(
  vinculo: VinculoEntity,
  congName: string
): string {
  return `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
      <div class="sm:col-span-2 bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Etiqueta del Vínculo</span>
        <p class="text-xs font-bold text-slate-900">${escapeHtml(vinculo.etiqueta)}</p>
      </div>
      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Código</span>
        <p class="text-xs font-mono font-bold text-slate-900">${escapeHtml(
          vinculo.codigo_vinculo || 'Sin código'
        )}</p>
      </div>
      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Conglomerado</span>
        <p class="text-xs font-bold text-slate-900 truncate" title="${escapeHtml(congName)}">${escapeHtml(congName)}</p>
      </div>
      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Nivel de Vinculación</span>
        <p class="text-xs font-bold text-slate-900">${escapeHtml(
          getNivelLabel(vinculo.nivel_vinculacion)
        )}</p>
      </div>
      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Naturaleza / Tipo</span>
        <p class="text-xs font-bold text-slate-900">${escapeHtml(vinculo.tipo_vinculacion)}</p>
      </div>
      <div class="sm:col-span-2 bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Sitio Temporal / Proyecto</span>
        <p class="text-xs font-bold ${vinculo.tiene_sitio_temporal ? 'text-amber-800' : 'text-slate-700'}">
          ${
            vinculo.tiene_sitio_temporal
              ? '⏱️ Sí — Este vínculo incluye al menos un sitio temporal / proyecto'
              : 'No — Solo sitios permanentes'
          }
        </p>
      </div>
      <div class="sm:col-span-2 lg:col-span-4 bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Notas Operativas</span>
        <p class="text-xs font-medium text-slate-700">${escapeHtml(
          vinculo.notas || 'Sin notas registradas'
        )}</p>
      </div>
    </div>
  `;
}

function renderVinculoFormBody(opts: {
  draft: VinculoFormDraft;
  conglomerados: ReadonlyArray<ConglomeradoEntity>;
  commitmentSummaries: ReadonlyArray<CertificateCommitmentSummary>;
  editingVinculo?: VinculoEntity;
}): string {
  const { draft, conglomerados, commitmentSummaries, editingVinculo } = opts;

  const selectedCertSet = new Set(draft.certificadoIds);
  const eligibleCerts = commitmentSummaries.filter((s) => {
    if (draft.id_grupo_empresarial && s.id_grupo_empresarial !== draft.id_grupo_empresarial) {
      return false;
    }
    if (s.status === 'LIBRE') return true;
    if (editingVinculo && s.vinculo?.id === editingVinculo.id) return true;
    return false;
  });

  const allowedNatures: ReadonlyArray<AuditLinkNature> =
    draft.nivel_vinculacion === 'INDIVIDUAL'
      ? ['Individual']
      : AUDIT_LINK_NATURES.filter((n) => n !== 'Individual');

  return `
    <form id="vinculoDetailForm" class="space-y-3" novalidate>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
          <label for="vinculoConglomeradoSelect" class="block text-xs font-bold text-slate-700">
            Conglomerado <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <select
            id="vinculoConglomeradoSelect"
            name="id_grupo_empresarial"
            required
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
          >
            <option value="">Seleccionar conglomerado...</option>
            ${conglomerados
              .map(
                (g) =>
                  `<option value="${escapeHtml(g.id)}" ${
                    g.id === draft.id_grupo_empresarial ? 'selected' : ''
                  }>${escapeHtml(g.nombre)}</option>`
              )
              .join('')}
          </select>
        </div>

        <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
          <label for="vinculoEtiquetaInput" class="block text-xs font-bold text-slate-700">
            Etiqueta del Vínculo <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <input
            type="text"
            id="vinculoEtiquetaInput"
            name="etiqueta"
            required
            maxlength="200"
            value="${escapeHtml(draft.etiqueta)}"
            placeholder="Ej. Grupo Industrial · Integrada 9001/14001"
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
          />
        </div>

        <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
          <label for="vinculoCodigoInput" class="block text-xs font-bold text-slate-700">
            Código de Vínculo
          </label>
          <input
            type="text"
            id="vinculoCodigoInput"
            name="codigo_vinculo"
            maxlength="40"
            value="${escapeHtml(draft.codigo_vinculo)}"
            placeholder="Ej. VINC-N1-02"
            class="w-full text-xs font-mono p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
          />
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
          <label for="vinculoNivelSelect" class="block text-xs font-bold text-slate-700">
            Nivel de Vinculación <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <select
            id="vinculoNivelSelect"
            name="nivel_vinculacion"
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
          >
            <option value="INDIVIDUAL" ${draft.nivel_vinculacion === 'INDIVIDUAL' ? 'selected' : ''}>Individual (1 certificado)</option>
            <option value="NIVEL_1_INTRA_ORG" ${draft.nivel_vinculacion === 'NIVEL_1_INTRA_ORG' ? 'selected' : ''}>Nivel 1 · Intra-Organizacional (2+ certs misma empresa)</option>
            <option value="NIVEL_2_INTER_ORG" ${draft.nivel_vinculacion === 'NIVEL_2_INTER_ORG' ? 'selected' : ''}>Nivel 2 · Inter-Organizacional (mismo conglomerado)</option>
          </select>
        </div>

        <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
          <label for="vinculoTipoSelect" class="block text-xs font-bold text-slate-700">
            Tipo / Naturaleza <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <select
            id="vinculoTipoSelect"
            name="tipo_vinculacion"
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
          >
            ${allowedNatures
              .map(
                (nat) =>
                  `<option value="${escapeHtml(nat)}" ${
                    draft.tipo_vinculacion === nat ? 'selected' : ''
                  }>${escapeHtml(nat)}</option>`
              )
              .join('')}
          </select>
        </div>
      </div>

      <div class="bg-amber-50/60 border border-amber-200/90 rounded-xl p-3">
        <label for="vinculoSitioTemporalCheckbox" class="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            id="vinculoSitioTemporalCheckbox"
            name="tiene_sitio_temporal"
            ${draft.tiene_sitio_temporal ? 'checked' : ''}
            class="mt-0.5 w-4 h-4 rounded border-amber-400 text-slate-900 focus:ring-slate-900 cursor-pointer"
          />
          <span class="text-xs font-semibold text-slate-800">
            Este vínculo incluye al menos un sitio temporal / proyecto
            <span class="block text-[11px] font-normal text-slate-600 mt-0.5">
              Habilita la pestaña de Designación → Temporal para las campañas de auditoría asociadas a este vínculo.
            </span>
          </span>
        </label>
      </div>

      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-2">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-bold text-slate-700">
            Certificados incluidos (${draft.certificadoIds.length}) <span class="text-rose-600" aria-hidden="true">*</span>
          </span>
          <span class="text-[11px] text-slate-500">
            Solo certificados Libres del conglomerado seleccionado
          </span>
        </div>
        ${
          eligibleCerts.length === 0
            ? `<p class="text-xs text-slate-500 py-2">No hay certificados disponibles en el conglomerado seleccionado.</p>`
            : `
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                ${eligibleCerts
                  .map((s) => {
                    const checked = selectedCertSet.has(s.certificado.id);
                    return `
                      <label class="flex items-start gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                        checked
                          ? 'bg-slate-900/5 border-slate-900/40'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }">
                        <input
                          type="checkbox"
                          name="vinculo_cert_id"
                          value="${escapeHtml(s.certificado.id)}"
                          ${checked ? 'checked' : ''}
                          class="mt-0.5 w-3.5 h-3.5 rounded border-slate-300 text-slate-900 cursor-pointer"
                        />
                        <span class="min-w-0">
                          <span class="block font-mono font-bold text-slate-900 truncate">${escapeHtml(s.certificado.numero_certificado)}</span>
                          <span class="block text-[11px] text-slate-600 truncate">${escapeHtml(s.certificado.organizacion_nombre)} · ${escapeHtml(s.certificado.norma_codigo)}</span>
                        </span>
                      </label>
                    `;
                  })
                  .join('')}
              </div>
            `
        }
      </div>

      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
        <label for="vinculoNotasInput" class="block text-xs font-bold text-slate-700">
          Notas Operativas
        </label>
        <textarea
          id="vinculoNotasInput"
          name="notas"
          rows="2"
          placeholder="Observaciones sobre la agrupación o alcance de sitios temporales..."
          class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
        >${escapeHtml(draft.notas)}</textarea>
      </div>
    </form>
  `;
}

function renderVinculoCertificadosTab(opts: {
  vinculo: VinculoEntity;
  commitmentSummaries: ReadonlyArray<CertificateCommitmentSummary>;
  organizaciones: ReadonlyArray<OrganizacionEntity>;
  auditPrograms: ReadonlyArray<ProgramaAuditoriaEntity>;
  programacionAudits: ReadonlyArray<ProgramacionAuditEntity>;
  isStaff: boolean;
  addFreeCertId: string;
}): string {
  const {
    vinculo,
    commitmentSummaries,
    auditPrograms,
    programacionAudits,
    isStaff,
    addFreeCertId,
  } = opts;

  const activeCerts = vinculo.certificados.filter((c) => !c.deleted_at);
  const freeInSameCong = filterFreeCertificatesInConglomerado(
    commitmentSummaries,
    vinculo.id_grupo_empresarial
  );

  const addFreePanelHtml = isStaff
    ? `
      <div class="mb-3 bg-slate-50/80 border border-slate-200 rounded-xl p-3 space-y-2">
        <div class="flex flex-col sm:flex-row sm:items-end gap-2">
          <div class="flex-1 min-w-0 space-y-1">
            <label for="addFreeCertToVinculoSelect" class="block text-xs font-bold text-slate-700">
              Agregar certificado Libre del mismo Conglomerado
            </label>
            <select
              id="addFreeCertToVinculoSelect"
              name="addFreeCertId"
              class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
            >
              <option value="">Seleccionar certificado libre disponible...</option>
              ${freeInSameCong
                .map(
                  (s) =>
                    `<option value="${escapeHtml(s.certificado.id)}" ${
                      s.certificado.id === addFreeCertId ? 'selected' : ''
                    }>${escapeHtml(s.certificado.numero_certificado)} — ${escapeHtml(
                      s.certificado.organizacion_nombre
                    )} (${escapeHtml(s.certificado.norma_codigo)})</option>`
                )
                .join('')}
            </select>
          </div>
          <button
            type="button"
            id="confirmAddFreeCertToVinculoBtn"
            data-action="add-free-cert-to-vinculo"
            data-vinculo-id="${escapeHtml(vinculo.id)}"
            ${!addFreeCertId ? 'disabled' : ''}
            class="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              addFreeCertId
                ? 'bg-slate-900 hover:bg-slate-800 text-white cursor-pointer'
                : 'bg-slate-200 text-slate-500 cursor-not-allowed'
            }"
          >
            <span>+ Agregar al Vínculo</span>
          </button>
        </div>
        ${
          freeInSameCong.length === 0
            ? '<p class="text-[11px] text-slate-500">No hay otros certificados Libres en este conglomerado.</p>'
            : ''
        }
      </div>
    `
    : '';

  if (activeCerts.length === 0) {
    return `
      ${addFreePanelHtml}
      <div class="p-8 text-center bg-slate-50/70 border border-slate-200 rounded-xl space-y-2">
        <div class="text-2xl" aria-hidden="true">📜</div>
        <h4 class="text-xs font-bold text-slate-800">Sin certificados vinculados</h4>
        <p class="text-xs text-slate-500 max-w-sm mx-auto">
          Este vínculo no posee certificados activos asociados.
        </p>
      </div>
    `;
  }

  const cardsHtml = activeCerts
    .map((cert) => {
      const detachCheck = canDetachCertificateFromVinculo(
        cert.id_certificado,
        vinculo.id,
        auditPrograms,
        programacionAudits
      );
      return `
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white border border-slate-200 rounded-xl px-3.5 py-2.5">
          <div class="min-w-0 space-y-0.5">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-mono text-xs font-bold text-slate-900">${escapeHtml(cert.numero_certificado)}</span>
              <span class="inline-flex items-center px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-[10px] font-mono text-slate-700">${escapeHtml(cert.norma_codigo)}</span>
              <span class="inline-flex items-center px-1.5 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-[10px] font-semibold text-emerald-800">${escapeHtml(cert.estatus)}</span>
            </div>
            <p class="text-xs text-slate-600 truncate">${escapeHtml(cert.organizacion_nombre)}</p>
            ${
              !detachCheck.allowed && detachCheck.reason
                ? `<p class="text-[11px] text-amber-800">${escapeHtml(detachCheck.reason)}</p>`
                : ''
            }
          </div>
          ${
            isStaff
              ? `
                <button
                  type="button"
                  data-action="detach-cert-from-vinculo"
                  data-vinculo-id="${escapeHtml(vinculo.id)}"
                  data-cert-id="${escapeHtml(cert.id_certificado)}"
                  ${!detachCheck.allowed ? 'disabled' : ''}
                  title="${escapeHtml(
                    detachCheck.allowed
                      ? 'Desvincular certificado y devolverlo a estado Libre'
                      : detachCheck.reason || 'Desvinculación bloqueada'
                  )}"
                  class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    detachCheck.allowed
                      ? 'border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100 cursor-pointer'
                      : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                  }"
                >
                  <span>Desvincular (volver a Libre)</span>
                </button>
              `
              : ''
          }
        </div>
      `;
    })
    .join('');

  return `
    ${addFreePanelHtml}
    <div class="space-y-2">${cardsHtml}</div>
  `;
}

function renderVinculoCampaniasTab(
  programs: ReadonlyArray<ProgramaAuditoriaEntity>,
  vinculo: VinculoEntity,
  tableColumnWidths?: Record<string, Record<string, number>>
): string {
  const jumpBannerHtml = `
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2 bg-slate-50/80 border border-slate-200 rounded-xl px-3.5 py-2.5">
      <p class="text-xs text-slate-700">
        Continúe la planificación operativa de <strong>${escapeHtml(vinculo.etiqueta)}</strong> en el paso de Designación.
      </p>
      <button
        type="button"
        data-nav="auditorias"
        data-subview="designacion/tipo"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
      >
        <span>Ir a Paso 3: Designación → Tipo →</span>
      </button>
    </div>
  `;

  if (programs.length === 0) {
    return `
      ${jumpBannerHtml}
      <div class="p-8 text-center bg-slate-50/70 border border-slate-200 rounded-xl space-y-2">
        <div class="text-2xl" aria-hidden="true">🧭</div>
        <h4 class="text-xs font-bold text-slate-800">Sin campañas de auditoría asociadas</h4>
        <p class="text-xs text-slate-500 max-w-sm mx-auto">
          Inicie una nueva campaña en Designación → Tipo utilizando este vínculo.
        </p>
      </div>
    `;
  }

  const columns: ColumnDefinition<ProgramaAuditoriaEntity>[] = [
    {
      id: 'programa',
      header: 'Campaña / Programa',
      defaultWidthPct: 40,
      minWidthPx: 180,
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
      id: 'tipo',
      header: 'Naturaleza',
      defaultWidthPct: 24,
      minWidthPx: 120,
      renderCell: (prog) =>
        `<span class="font-semibold text-slate-700 whitespace-nowrap">${escapeHtml(prog.tipo_vinculacion)}</span>`,
    },
    {
      id: 'temporal',
      header: 'Sitio Temp.',
      defaultWidthPct: 18,
      minWidthPx: 95,
      renderCell: (prog) =>
        prog.tiene_sitio_temporal
          ? '<span class="text-amber-800 font-semibold whitespace-nowrap">Sí</span>'
          : '<span class="text-slate-500 whitespace-nowrap">No</span>',
    },
    {
      id: 'auditorias',
      header: 'Auditorías',
      align: 'right',
      defaultWidthPct: 18,
      minWidthPx: 95,
      renderCell: (prog) =>
        `<span class="tabular-nums font-semibold text-slate-800 whitespace-nowrap">${prog.auditorias.length}</span>`,
    },
  ];

  return `
    ${jumpBannerHtml}
    ${renderListViewTable({
      tableId: 'vinculo-tab-campanias',
      columns,
      items: [...programs],
      columnWidths: tableColumnWidths?.['vinculo-tab-campanias'],
      getRowAttrs: (prog) =>
        `data-nav="auditorias" data-subview="programa" data-program-id="${escapeHtml(prog.id)}" title="Abrir campaña ${escapeHtml(prog.etiqueta)}"`,
    })}
  `;
}
