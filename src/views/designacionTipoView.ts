import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import type { OrganizacionEntity } from '../lib/activeCertificates';
import type { ConglomeradoEntity } from '../lib/conglomeradoDomain';
import type { TipoAuditoriaCatalogItem } from '../lib/extraDomain';
import {
  formatAuditDateLabel,
  resolveLatestPlannedDate,
  type AuditDateEntry,
  type ProgramaAuditoriaEntity,
} from '../lib/auditPlanningEngine';
import type { ProgramacionAuditEntity } from '../lib/auditExecution';
import {
  getLinkedSiblingAudits,
  resolveAuditNavigation,
} from '../lib/certificateAuditSelector';
import {
  computeCertificateCommitmentSummaries,
  type SoftDeletableCertificado,
  type VinculoEntity,
} from '../lib/vinculoDomain';
import {
  buildCertificateTipoRows,
  computeAuditUrgencyClassification,
  requiresFutureYearWarning,
  type CertificateTipoRow,
  type ReprogramDateDraft,
  type Step3NewCycleCertTypeDraft,
  type Step3NewCycleDraft,
  type TipoQueuePreset,
} from '../lib/designacionTipoDomain';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import type { CertificateRecord } from '../lib/searchControls';
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
import { renderAuditSectionShell } from './auditSectionShell';
import {
  extractUniversalArchiveProps,
  type ArchiveMultiViewConfig,
} from '../lib/archiveGovernance';

export type DesignacionTipoChildTab = 'fechas' | 'certificados';
export type DesignacionTipoSortColumn = 'urgencia' | 'certificado' | 'fecha_vigente' | 'tipo';

export interface DesignacionTipoViewState {
  queuePreset: TipoQueuePreset;
  query: string;
  viewMode: UniversalViewMode;
  isSidebarOpen: boolean;
  sortColumn: DesignacionTipoSortColumn | null;
  sortDirection: SortDirection;
  facetSelections: MultiViewSelectionMap;
  selectedCertId: string | null;
  selectedAuditId: string | null;
  /** Legacy compatibility field (no longer primary key) */
  selectedProgramId?: string | null;
  activeChildTab?: DesignacionTipoChildTab;
  isCreating?: boolean;
  isEditingAttributes?: boolean;
  isReprogramming?: boolean;
  savingAuditId?: string | null;
  editErrorMessage: string | null;
}

export const DEFAULT_DESIGNACION_TIPO_STATE: DesignacionTipoViewState = {
  queuePreset: 'TODAS',
  query: '',
  viewMode: 'list',
  isSidebarOpen: true,
  sortColumn: null,
  sortDirection: 'none',
  facetSelections: {},
  selectedCertId: null,
  selectedAuditId: null,
  selectedProgramId: null,
  savingAuditId: null,
  editErrorMessage: null,
};

export interface DesignacionTipoViewProps {
  profile: UserProfile;
  state: DesignacionTipoViewState;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  audits?: ReadonlyArray<ProgramacionAuditEntity>;
  vinculos: ReadonlyArray<VinculoEntity>;
  conglomerados: ReadonlyArray<ConglomeradoEntity>;
  certificados: ReadonlyArray<SoftDeletableCertificado | CertificadoDetailEntity>;
  certificates?: ReadonlyArray<CertificateRecord>;
  organizaciones: ReadonlyArray<OrganizacionEntity>;
  tiposCatalog: ReadonlyArray<TipoAuditoriaCatalogItem>;
  referenceIsoDate?: string;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
  inCardBreadcrumbHtml?: string;
  headerAddAuditHtml?: string;
}

export function createEmptyStep3NewCycleDraft(
  vinculos: ReadonlyArray<VinculoEntity>,
  tiposCatalog: ReadonlyArray<TipoAuditoriaCatalogItem>,
  referenceIsoDate?: string
): Step3NewCycleDraft {
  const activeVinculos = vinculos.filter(
    (v) => !v.deleted_at && v.certificados.some((c) => !c.deleted_at)
  );
  const firstVinculo = activeVinculos[0];
  const activeTipos = tiposCatalog.filter((t) => !t.deleted_at);
  const defaultTipoId = activeTipos[0]?.id || '';
  const refDate = referenceIsoDate || new Date().toISOString().slice(0, 10);
  const currentYear = Number(refDate.slice(0, 4)) || new Date().getFullYear();
  const currentMonth = Number(refDate.slice(5, 7)) || new Date().getMonth() + 1;

  return {
    id_vinculo: firstVinculo?.id || '',
    codigo_programa: '',
    etiqueta: firstVinculo ? `${firstVinculo.etiqueta} — Nuevo Ciclo` : '',
    dateMode: 'PREPROGRAMADA_MES',
    anio: currentYear,
    mes: currentMonth,
    fecha_inicio: refDate,
    fecha_fin: refDate,
    observacion: '',
    certTypes: buildCertTypesDraftForVinculo(firstVinculo, defaultTipoId),
  };
}

export function buildCertTypesDraftForVinculo(
  vinculo: VinculoEntity | undefined,
  defaultTipoId: string,
  previousSelections?: ReadonlyMap<string, string>
): Step3NewCycleCertTypeDraft[] {
  if (!vinculo) return [];
  return vinculo.certificados
    .filter((c) => !c.deleted_at)
    .map((c) => ({
      id_certificado: c.id_certificado,
      numero_certificado: c.numero_certificado,
      organizacion_nombre: c.organizacion_nombre,
      norma_codigo: c.norma_codigo,
      id_tipo_auditoria: previousSelections?.get(c.id_certificado) ?? defaultTipoId,
    }));
}

export function createDefaultReprogramDateDraft(
  auditId: string,
  latestPlannedDate: AuditDateEntry | null,
  referenceIsoDate?: string
): ReprogramDateDraft {
  const refDate = referenceIsoDate || new Date().toISOString().slice(0, 10);
  const currentYear = Number(refDate.slice(0, 4)) || new Date().getFullYear();
  const currentMonth = Number(refDate.slice(5, 7)) || new Date().getMonth() + 1;

  const isExact = latestPlannedDate?.tipo_fecha === 'PROGRAMADA_EXACTA';
  return {
    id_auditoria: auditId,
    tipo_fecha: isExact ? 'PROGRAMADA_EXACTA' : 'PREPROGRAMADA_MES',
    anio: latestPlannedDate?.anio ?? currentYear,
    mes: latestPlannedDate?.mes ?? currentMonth,
    fecha_inicio: latestPlannedDate?.fecha_inicio || refDate,
    fecha_fin: latestPlannedDate?.fecha_fin || latestPlannedDate?.fecha_inicio || refDate,
    observacion: '',
  };
}

function matchesCertificateTipoPreset(
  row: CertificateTipoRow,
  preset: TipoQueuePreset
): boolean {
  if (preset === 'TODAS') return true;
  if (preset === 'PREPROGRAMADAS') {
    return row.latestPlannedDate?.tipo_fecha === 'PREPROGRAMADA_MES';
  }
  if (preset === 'FUTURO') {
    return row.urgency.rank === 4 || row.urgency.rank === 5;
  }
  return row.urgency.rank <= 3 || row.urgency.bucket === 'SIN_FECHA';
}

function mergeAuditsPool(
  programs: ReadonlyArray<ProgramaAuditoriaEntity>,
  auditsProp?: ReadonlyArray<ProgramacionAuditEntity>
): ProgramacionAuditEntity[] {
  const byId = new Map<string, ProgramacionAuditEntity>();
  for (const a of auditsProp ?? []) {
    if (!a.deleted_at) byId.set(a.id, a);
  }
  for (const prog of programs) {
    if (prog.deleted_at) continue;
    for (const a of prog.auditorias) {
      if (!a.deleted_at && !byId.has(a.id)) byId.set(a.id, a);
    }
  }
  return Array.from(byId.values());
}

export function renderDesignacionTipoView(props: DesignacionTipoViewProps): string {
  const {
    profile,
    state,
    programs,
    audits: auditsProp,
    vinculos,
    conglomerados,
    certificados,
    certificates = [],
    organizaciones,
    tiposCatalog,
    referenceIsoDate,
    loading = false,
    archiveConfig,
    tableColumnWidths,
    inCardBreadcrumbHtml = '',
    headerAddAuditHtml = '',
  } = props;

  const isStaff = isApprovedStaffProfile(profile);
  const activeConglomerados = conglomerados.filter((g) => !g.deleted_at);
  const activeVinculos = vinculos.filter((v) => !v.deleted_at);
  const activeTipos = tiposCatalog.filter((t) => !t.deleted_at);
  const auditsPool = mergeAuditsPool(programs, auditsProp);

  const softCerts: SoftDeletableCertificado[] = certificados.map((c) => ({
    ...c,
    deleted_at: 'deleted_at' in c ? c.deleted_at ?? null : null,
  }));

  const commitmentSummaries = computeCertificateCommitmentSummaries(
    softCerts,
    organizaciones,
    activeConglomerados,
    activeVinculos
  );
  const freeCertsCount = commitmentSummaries.filter((s) => s.status === 'LIBRE').length;

  const detailedForSelector = softCerts.filter((c) => !c.deleted_at);

  const allRows = buildCertificateTipoRows({
    certificates,
    detailedCerts: detailedForSelector,
    audits: auditsPool,
    programs,
    referenceIsoDate,
  });

  const legacyProgramFirstAudit = state.selectedProgramId
    ? programs
        .find((p) => !p.deleted_at && p.id === state.selectedProgramId)
        ?.auditorias.find((a) => !a.deleted_at) ?? null
    : null;

  const resolvedCertId =
    state.selectedCertId && allRows.some((r) => r.certId === state.selectedCertId)
      ? state.selectedCertId
      : state.selectedAuditId
      ? auditsPool.find((a) => a.id === state.selectedAuditId)?.id_certificado ?? null
      : legacyProgramFirstAudit?.id_certificado ?? null;

  if (resolvedCertId) {
    const certRow = allRows.find((r) => r.certId === resolvedCertId) ?? null;
    if (certRow) {
      const effectiveAuditId = state.selectedAuditId ?? legacyProgramFirstAudit?.id ?? null;
      return renderTipoDetailView({
        state,
        certRow,
        effectiveAuditId,
        audits: auditsPool,
        programs,
        tiposCatalog: activeTipos,
        isStaff,
        referenceIsoDate,
        inCardBreadcrumbHtml,
        headerAddAuditHtml,
      });
    }
  }

  return renderTipoMultiView({
    state,
    allRows,
    freeCertsCount,
    isStaff,
    loading,
    archiveConfig,
    tableColumnWidths,
    headerAddAuditHtml,
  });
}

function renderTipoMultiView(opts: {
  state: DesignacionTipoViewState;
  allRows: ReadonlyArray<CertificateTipoRow>;
  freeCertsCount: number;
  isStaff: boolean;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
  headerAddAuditHtml?: string;
}): string {
  const {
    state,
    allRows,
    freeCertsCount,
    isStaff,
    loading = false,
    archiveConfig,
    tableColumnWidths,
    headerAddAuditHtml = '',
  } = opts;

  const proximasCount = allRows.filter((r) => matchesCertificateTipoPreset(r, 'PROXIMAS')).length;
  const preprogramadasCount = allRows.filter((r) =>
    matchesCertificateTipoPreset(r, 'PREPROGRAMADAS')
  ).length;
  const futuroCount = allRows.filter((r) => matchesCertificateTipoPreset(r, 'FUTURO')).length;
  const todasCount = allRows.length;

  const presetRows = allRows.filter((r) => matchesCertificateTipoPreset(r, state.queuePreset));

  const facetCategories: MultiViewFacetCategory<CertificateTipoRow>[] = [
    {
      id: 'urgencia',
      label: 'Ventana Temporal',
      options: [
        { value: 'VENCIDA', label: 'Vencida' },
        { value: 'PROXIMA_30D', label: 'Próxima ≤ 30 días' },
        { value: 'ESTE_TRIMESTRE', label: 'Este trimestre' },
        { value: 'ESTE_ANIO', label: 'Año en curso' },
        { value: 'ANIO_MAS_1', label: 'Año +1' },
        { value: 'FUTURO_LEJANO', label: 'Futuro (+2/+3 años)' },
        { value: 'SIN_FECHA', label: 'Sin fecha programada' },
      ],
      extractValues: (r) => r.urgency.bucket,
    },
    {
      id: 'estado_tipo',
      label: 'Estado de Tipo',
      options: [
        { value: 'DEFINIDO', label: 'Tipo definido ✓' },
        { value: 'POR_DEFINIR', label: 'Por definir / Sin auditorías' },
      ],
      extractValues: (r) => (r.hasTipoDefined ? 'DEFINIDO' : 'POR_DEFINIR'),
    },
    {
      id: 'vinculacion',
      label: 'Lote / Vínculo',
      options: [
        { value: 'VINCULADA', label: 'Auditoría vinculada' },
        { value: 'INDIVIDUAL', label: 'Auditoría individual' },
        { value: 'SIN_AUDITORIA', label: 'Sin auditorías' },
      ],
      extractValues: (r) =>
        r.totalAudits === 0 ? 'SIN_AUDITORIA' : r.isLinkedLatest ? 'VINCULADA' : 'INDIVIDUAL',
    },
  ];

  const searchOptions = {
    getSearchableText: (row: CertificateTipoRow): string =>
      [
        row.numero_certificado,
        row.organizacion_nombre,
        row.norma_codigo,
        row.latestTipoAudit,
        row.latestAuditCode,
        row.latestDateSummary,
        row.latestProgram?.etiqueta || '',
      ].join(' '),
  };

  const facetGroups = computeReactiveFacetCounts(
    presetRows,
    state.query,
    facetCategories,
    state.facetSelections,
    searchOptions
  );

  const filteredRows = filterRecordsWithFacets(
    presetRows,
    state.query,
    facetCategories,
    state.facetSelections,
    searchOptions
  );

  const sortedRows = sortItems(
    filteredRows,
    state.sortColumn,
    state.sortDirection,
    (row, col) => {
      switch (col) {
        case 'urgencia':
          return row.urgency.rank;
        case 'certificado':
          return row.numero_certificado.toLowerCase();
        case 'fecha_vigente':
          return row.urgency.effectiveStartIso || '9999-12-31';
        case 'tipo':
          return row.latestTipoAudit.toLowerCase();
        default:
          return row.urgency.rank;
      }
    }
  );

  const columns: ColumnDefinition<CertificateTipoRow>[] = [
    {
      id: 'urgencia',
      header: 'Ventana',
      defaultWidthPct: 14,
      minWidthPx: 115,
      sortable: true,
      renderCell: (row) => `
        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${row.urgency.badgeClass} whitespace-nowrap">
          ${escapeHtml(row.urgency.label)}
        </span>
      `,
    },
    {
      id: 'certificado',
      header: 'Certificado & Organización',
      defaultWidthPct: 30,
      minWidthPx: 195,
      sortable: true,
      renderCell: (row) => `
        <div class="min-w-0 space-y-0.5">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="font-mono text-xs font-bold text-slate-900 truncate">${escapeHtml(row.numero_certificado)}</span>
            <span class="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
              ${escapeHtml(row.norma_codigo)}
            </span>
          </div>
          <div class="text-[11px] text-slate-500 truncate">${escapeHtml(row.organizacion_nombre)}</div>
        </div>
      `,
    },
    {
      id: 'tipo',
      header: 'Último Tipo Designado',
      defaultWidthPct: 22,
      minWidthPx: 165,
      sortable: true,
      renderCell: (row) => `
        <div class="min-w-0 space-y-0.5">
          <div class="text-xs font-bold ${row.hasTipoDefined ? 'text-slate-900' : 'text-amber-700'} truncate">
            ${escapeHtml(row.latestTipoAudit)}
          </div>
          <div class="text-[11px] text-slate-500 truncate">
            ${escapeHtml(row.latestAuditCode)} · ${row.totalAudits} aud.
          </div>
        </div>
      `,
    },
    {
      id: 'fecha_vigente',
      header: 'Última Fecha Programada',
      defaultWidthPct: 20,
      minWidthPx: 155,
      sortable: true,
      renderCell: (row) => `
        <div class="min-w-0 space-y-0.5">
          <div class="text-xs font-semibold text-slate-800 truncate">${escapeHtml(row.latestDateSummary)}</div>
          <div class="text-[11px] text-slate-500 truncate">${escapeHtml(
            row.latestProgram?.etiqueta || (row.totalAudits > 0 ? 'Campaña activa' : 'Pendiente de programar')
          )}</div>
        </div>
      `,
    },
    {
      id: 'vinculacion',
      header: 'Lote',
      defaultWidthPct: 14,
      minWidthPx: 110,
      sortable: false,
      renderCell: (row) =>
        row.totalAudits === 0
          ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-500 border border-slate-200 whitespace-nowrap">Sin aud.</span>`
          : row.isLinkedLatest
          ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 whitespace-nowrap">Lote (${row.linkedSiblingCount})</span>`
          : `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">Individual</span>`,
    },
  ];

  const renderCard = (row: CertificateTipoRow): string => `
    <article
      role="button"
      tabindex="0"
      data-action="select-section-cert"
      data-cert-id="${escapeHtml(row.certId)}"
      aria-label="Abrir tipos de auditoría para ${escapeHtml(row.numero_certificado)}"
      class="text-left bg-white border border-slate-200 hover:border-slate-400 rounded-xl p-3.5 shadow-2xs transition-all cursor-pointer space-y-2.5 flex flex-col justify-between"
    >
      <div class="space-y-1.5">
        <div class="flex items-center justify-between gap-2">
          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${row.urgency.badgeClass}">
            ${escapeHtml(row.urgency.label)}
          </span>
          <span class="text-[11px] font-bold ${row.hasTipoDefined ? 'text-emerald-700' : 'text-amber-700'}">
            ${escapeHtml(row.latestTipoAudit)}
          </span>
        </div>
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="font-mono text-xs font-bold text-slate-900">${escapeHtml(row.numero_certificado)}</span>
          <span class="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            ${escapeHtml(row.norma_codigo)}
          </span>
        </div>
        <p class="text-[11px] text-slate-500 truncate">${escapeHtml(row.organizacion_nombre)}</p>
      </div>
      <div class="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px] text-slate-600">
        <span class="font-semibold truncate">${escapeHtml(row.latestDateSummary)}</span>
        <span class="shrink-0 font-bold text-slate-700 tabular-nums">${row.totalAudits} aud.${
          row.isLinkedLatest ? ` · Lote (${row.linkedSiblingCount})` : ''
        }</span>
      </div>
    </article>
  `;

  const presetButton = (
    preset: TipoQueuePreset,
    label: string,
    count: number,
    activeClass: string
  ): string => {
    const isActive = state.queuePreset === preset;
    return `
      <button
        type="button"
        data-action="set-designacion-tipo-preset"
        data-preset="${preset}"
        aria-pressed="${isActive ? 'true' : 'false'}"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
          isActive
            ? activeClass
            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-transparent'
        }"
      >
        <span>${escapeHtml(label)}</span>
        <span class="px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
          isActive ? 'bg-white/20 text-white' : 'bg-white text-slate-700 border border-slate-200'
        }">${count}</span>
      </button>
    `;
  };

  const presetBarHtml = `
    <div class="space-y-2">
      <div class="flex flex-wrap items-center justify-between gap-2 bg-slate-50/80 border border-slate-200 rounded-xl px-3 py-2">
        <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtro de ventana temporal">
          ${presetButton('TODAS', 'Todos', todasCount, 'bg-slate-900 text-white shadow-2xs')}
          ${presetButton('PROXIMAS', 'Próximas a ejecutar', proximasCount, 'bg-slate-800 text-white shadow-2xs')}
          ${presetButton('PREPROGRAMADAS', 'Preprogramadas Mes', preprogramadasCount, 'bg-sky-700 text-white shadow-2xs')}
          ${presetButton('FUTURO', 'Futuro +1/+3 años', futuroCount, 'bg-indigo-700 text-white shadow-2xs')}
        </div>
        ${
          isStaff && freeCertsCount > 0
            ? `
              <button
                type="button"
                data-nav="auditorias"
                data-subview="vinculo"
                class="text-[11px] font-semibold text-amber-800 hover:text-amber-950 underline cursor-pointer whitespace-nowrap"
              >
                ${freeCertsCount} certificado${freeCertsCount === 1 ? '' : 's'} Libre${freeCertsCount === 1 ? '' : 's'} → Vínculo
              </button>
            `
            : ''
        }
      </div>
    </div>
  `;

  const archiveProps = extractUniversalArchiveProps(archiveConfig, 'programacion');

  return renderUniversalTemplate<CertificateTipoRow>({
    domainKey: 'designacion-tipo',
    tableId: 'designacion-tipo-main',
    title: 'Designación → Tipo de Auditoría',
    subtitle:
      'Vista basada en certificados. Abra un certificado para revisar su historial y ajustar el tipo de auditoría en las auditorías vinculadas del lote.',
    entityLabel: 'certificados',
    searchQuery: state.query,
    searchPlaceholder: 'Buscar por certificado, organización, norma, tipo o código...',
    searchInputId: 'designacion-tipoSearchInput',
    clearSearchBtnId: 'clearDesignacionTipoSearchBtn',
    totalCount: presetRows.length,
    filteredCount: sortedRows.length,
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen,
    sortState: { column: state.sortColumn, direction: state.sortDirection },
    columnWidths: tableColumnWidths?.['designacion-tipo-main'],
    facetGroups,
    items: sortedRows,
    columns,
    getRowAttrs: (row) =>
      `data-action="select-section-cert" data-cert-id="${escapeHtml(row.certId)}" title="Abrir tipos de auditoría para ${escapeHtml(row.numero_certificado)}"`,
    renderCard,
    actionsHtml: isStaff ? headerAddAuditHtml : '',
    inlineFormHtml: presetBarHtml,
    loading,
    emptyStateTitle:
      allRows.length > 0
        ? 'No hay certificados que coincidan con este filtro'
        : 'Sin certificados disponibles en Designación → Tipo',
    emptyStateMessage:
      allRows.length > 0
        ? 'Cambie el filtro temporal o ajuste su búsqueda.'
        : 'Use "+ Auditoría" para vincular y programar la primera auditoría.',
    ...archiveProps,
  });
}

function formatAuditShortDateSummary(audit: ProgramacionAuditEntity): string {
  const planned =
    resolveLatestPlannedDate(audit.fechas) ??
    (audit.latestDate && !audit.latestDate.deleted_at ? audit.latestDate : null);
  if (planned) return formatAuditDateLabel(planned);
  return audit.fecha_inicio ? audit.fecha_inicio.slice(0, 10) : 'Sin fecha';
}

function renderTipoDetailView(opts: {
  state: DesignacionTipoViewState;
  certRow: CertificateTipoRow;
  effectiveAuditId: string | null;
  audits: ReadonlyArray<ProgramacionAuditEntity>;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  tiposCatalog: ReadonlyArray<TipoAuditoriaCatalogItem>;
  isStaff: boolean;
  referenceIsoDate?: string;
  inCardBreadcrumbHtml?: string;
  headerAddAuditHtml?: string;
}): string {
  const {
    state,
    certRow,
    effectiveAuditId,
    audits,
    programs,
    tiposCatalog,
    isStaff,
    referenceIsoDate,
    inCardBreadcrumbHtml = '',
    headerAddAuditHtml = '',
  } = opts;

  const navigation = resolveAuditNavigation(
    certRow.certId,
    effectiveAuditId,
    audits
  );
  const activeAudit = navigation.activeAudit;
  const linkedCtx = getLinkedSiblingAudits(activeAudit, audits, programs);
  const activeProgram = linkedCtx.program;

  const urgency = activeAudit
    ? computeAuditUrgencyClassification(
        resolveLatestPlannedDate(activeAudit.fechas) ?? activeAudit.latestDate ?? null,
        activeAudit.estado_ciclo || 'Borrador',
        referenceIsoDate
      )
    : certRow.urgency;
  const futureWarningMessage = requiresFutureYearWarning(urgency);

  const errorBannerHtml = state.editErrorMessage
    ? `
      <div role="alert" class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800 flex items-center gap-2">
        <span aria-hidden="true">⚠️</span>
        <span>${escapeHtml(state.editErrorMessage)}</span>
      </div>
    `
    : '';

  const linkedSiblingsSectionHtml = activeAudit
    ? `
      <section class="space-y-2.5" data-testid="tipo-linked-batch-section">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 class="text-xs font-bold uppercase tracking-wider text-slate-700">
              ${
                linkedCtx.siblings.length > 1
                  ? `Auditorías Vinculadas en este Lote (${linkedCtx.siblings.length})`
                  : 'Tipo de Auditoría Activa'
              }
            </h2>
            <p class="text-[11px] text-slate-500">
              ${
                activeProgram
                  ? `${escapeHtml(activeProgram.etiqueta)} · ${escapeHtml(activeProgram.tipo_vinculacion)} ·`
                  : 'Auditoría individual del certificado.'
              } Seleccione el tipo de auditoría directamente por cada certificado del lote.
            </p>
          </div>
          ${
            isStaff
              ? `
                <button
                  type="button"
                  data-action="audit-breadcrumb-nav"
                  data-target-subview="designacion/fecha"
                  class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-800 cursor-pointer whitespace-nowrap"
                >
                  Configurar Fechas en Lote →
                </button>
              `
              : ''
          }
        </div>

        <div class="space-y-2">
          ${linkedCtx.siblings
            .map((sib) => {
              const aud = sib.audit;
              const isSavingThis = state.savingAuditId === aud.id;
              const dateSummary = formatAuditShortDateSummary(aud);
              return `
                <div
                  data-testid="tipo-sibling-card"
                  data-audit-id="${escapeHtml(aud.id)}"
                  class="rounded-xl border p-3 grid grid-cols-1 md:grid-cols-12 gap-3 items-center transition-colors ${
                    sib.isActive
                      ? 'border-indigo-300 bg-indigo-50/30 shadow-2xs'
                      : 'border-slate-200 bg-white'
                  }"
                >
                  <div class="md:col-span-7 min-w-0 space-y-1">
                    <div class="flex flex-wrap items-center gap-1.5">
                      ${
                        sib.isActive
                          ? '<span class="px-2 py-0.5 rounded bg-slate-900 text-white text-[10px] font-bold whitespace-nowrap">Activa</span>'
                          : ''
                      }
                      <span class="font-mono text-xs font-bold text-slate-900">${escapeHtml(aud.numero_certificado)}</span>
                      <span class="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                        ${escapeHtml(aud.norma_codigo)}
                      </span>
                      <span class="px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-white text-slate-600 border border-slate-200">
                        ${escapeHtml(aud.codigo_auditoria)}
                      </span>
                    </div>
                    <div class="text-xs text-slate-600 truncate">${escapeHtml(aud.organizacion_nombre)}</div>
                    <div class="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      <span>📅 ${escapeHtml(dateSummary)}</span>
                      <span>· Estado: <strong class="text-slate-700">${escapeHtml(aud.estado_ciclo || 'Planificada')}</strong></span>
                      ${
                        !sib.isActive
                          ? `
                            <button
                              type="button"
                              data-action="select-linked-sibling-audit"
                              data-audit-id="${escapeHtml(aud.id)}"
                              data-cert-id="${escapeHtml(aud.id_certificado)}"
                              class="text-indigo-700 hover:text-indigo-900 font-bold hover:underline cursor-pointer"
                            >
                              Ver historial de este cert. →
                            </button>
                          `
                          : ''
                      }
                    </div>
                  </div>

                  <div class="md:col-span-5">
                    ${
                      isStaff
                        ? `
                          <label for="step3InlineTipo_${escapeHtml(aud.id)}" class="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                            Tipo de Auditoría ${isSavingThis ? '(Guardando...)' : ''}
                          </label>
                          <select
                            id="step3InlineTipo_${escapeHtml(aud.id)}"
                            data-action="change-step3-audit-tipo"
                            data-audit-id="${escapeHtml(aud.id)}"
                            ${isSavingThis ? 'disabled' : ''}
                            class="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-900 focus:border-slate-900 focus:outline-none disabled:opacity-60"
                          >
                            <option value="">Seleccionar tipo...</option>
                            ${tiposCatalog
                              .map((t) => {
                                const selected =
                                  (aud.id_tipo_auditoria && aud.id_tipo_auditoria === t.id) ||
                                  (!aud.id_tipo_auditoria && aud.tipo_auditoria === t.tipo);
                                return `<option value="${escapeHtml(t.id)}" ${
                                  selected ? 'selected' : ''
                                }>${escapeHtml(t.tipo)} (${escapeHtml(t.etapa_ciclo)})</option>`;
                              })
                              .join('')}
                          </select>
                        `
                        : `
                          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tipo de Auditoría</div>
                          <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 mt-1">
                            ${escapeHtml(aud.tipo_auditoria || 'Por definir')}
                          </span>
                        `
                    }
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
      </section>
    `
    : '';

  const historySectionHtml = `
    <section class="space-y-2.5 pt-3 border-t border-slate-200" data-testid="cert-audit-history-section">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 class="text-xs font-bold uppercase tracking-wider text-slate-700">
            Historial de Auditorías del Certificado (${navigation.auditsForCert.length})
          </h2>
          <p class="text-[11px] text-slate-500">
            Ordenado desde la auditoría más reciente. Seleccione cualquier ciclo histórico o use ◀ / ▶ arriba.
          </p>
        </div>
      </div>
      ${
        navigation.auditsForCert.length === 0
          ? `<p class="text-xs text-slate-500">No hay auditorías registradas para este certificado.</p>`
          : `
            <ol class="space-y-2">
              ${navigation.auditsForCert
                .map((aud, idx) => {
                  const isCurrent = activeAudit?.id === aud.id;
                  const prog = aud.id_programa_auditoria
                    ? programs.find((p) => !p.deleted_at && p.id === aud.id_programa_auditoria) ?? null
                    : null;
                  const siblingCount = prog ? prog.auditorias.filter((x) => !x.deleted_at).length : 1;
                  const dateSummary = formatAuditShortDateSummary(aud);
                  return `
                    <li class="rounded-xl border p-2.5 flex flex-wrap items-center justify-between gap-2 ${
                      isCurrent ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white'
                    }">
                      <div class="min-w-0 space-y-0.5">
                        <div class="flex flex-wrap items-center gap-1.5">
                          <span class="font-mono text-xs font-bold text-slate-900">${escapeHtml(aud.codigo_auditoria)}</span>
                          <span class="px-2 py-0.2 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                            ${escapeHtml(aud.tipo_auditoria || 'Sin tipo')}
                          </span>
                          <span class="px-2 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            ${siblingCount > 1 ? `Lote (${siblingCount})` : 'Individual'}
                          </span>
                          ${
                            isCurrent
                              ? '<span class="px-2 py-0.2 rounded-full text-[10px] font-bold bg-emerald-600 text-white">Activa</span>'
                              : idx === 0
                              ? '<span class="px-2 py-0.2 rounded-full text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">Más reciente</span>'
                              : ''
                          }
                        </div>
                        <div class="text-[11px] text-slate-500">
                          📅 ${escapeHtml(dateSummary)} · Estado: ${escapeHtml(aud.estado_ciclo || 'Planificada')}
                          ${prog ? ` · Campaña: ${escapeHtml(prog.etiqueta)}` : ''}
                        </div>
                      </div>
                      ${
                        !isCurrent
                          ? `
                            <button
                              type="button"
                              data-action="select-section-audit"
                              data-audit-id="${escapeHtml(aud.id)}"
                              data-cert-id="${escapeHtml(certRow.certId)}"
                              class="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-bold text-slate-800 cursor-pointer whitespace-nowrap"
                            >
                              Seleccionar
                            </button>
                          `
                          : ''
                      }
                    </li>
                  `;
                })
                .join('')}
            </ol>
          `
      }
    </section>
  `;

  const bodyHtml = activeAudit
    ? `<div class="space-y-5">${linkedSiblingsSectionHtml}${historySectionHtml}</div>`
    : '';

  return renderAuditSectionShell({
    sectionTitle: 'Designación → Tipo',
    sectionSymbol: '🏷️',
    backSubview: 'designacion/tipo',
    certInfo: {
      id: certRow.certId,
      numero_certificado: certRow.numero_certificado,
      organizacion_nombre: certRow.organizacion_nombre,
      norma_codigo: certRow.norma_codigo,
      estatus: certRow.estatus,
    },
    navigation,
    programs,
    linkedSiblings: linkedCtx.siblings,
    showLinkedSiblings: true,
    isStaff,
    inCardBreadcrumbHtml,
    headerAddAuditHtml,
    tableName: 'auditoria',
    feedbackHtml: errorBannerHtml,
    futureWarningMessage,
    bodyHtml,
  });
}
