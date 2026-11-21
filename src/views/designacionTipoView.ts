import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import type { OrganizacionEntity } from '../lib/activeCertificates';
import type { ConglomeradoEntity } from '../lib/conglomeradoDomain';
import type { TipoAuditoriaCatalogItem } from '../lib/extraDomain';
import {
  formatAuditDateLabel,
  resolveLatestAuditDate,
  type AuditDateEntry,
  type ProgramaAuditoriaEntity,
} from '../lib/auditPlanningEngine';
import type { ProgramacionAuditEntity } from '../lib/auditExecution';
import {
  computeCertificateCommitmentSummaries,
  type SoftDeletableCertificado,
  type VinculoEntity,
} from '../lib/vinculoDomain';
import {
  buildCampaignStep3Rows,
  buildNextReprogramDateSequence,
  matchesTipoQueuePreset,
  requiresFutureYearWarning,
  type CampaignStep3Row,
  type ReprogramDateDraft,
  type Step3NewCycleCertTypeDraft,
  type Step3NewCycleDraft,
  type TipoQueuePreset,
} from '../lib/designacionTipoDomain';
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

export type DesignacionTipoChildTab = 'fechas' | 'certificados';
export type DesignacionTipoSortColumn = 'urgencia' | 'campania' | 'fecha_vigente';

export interface DesignacionTipoViewState {
  queuePreset: TipoQueuePreset;
  query: string;
  viewMode: UniversalViewMode;
  isSidebarOpen: boolean;
  sortColumn: DesignacionTipoSortColumn | null;
  sortDirection: SortDirection;
  facetSelections: MultiViewSelectionMap;
  selectedProgramId: string | null;
  activeChildTab: DesignacionTipoChildTab;
  isCreating: boolean;
  isEditingAttributes: boolean;
  newCycleDraft?: Step3NewCycleDraft;
  reprogramDraft?: ReprogramDateDraft;
  isReprogramming: boolean;
  editErrorMessage: string | null;
}

export interface DesignacionTipoViewProps {
  profile: UserProfile;
  state: DesignacionTipoViewState;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  vinculos: ReadonlyArray<VinculoEntity>;
  conglomerados: ReadonlyArray<ConglomeradoEntity>;
  certificados: ReadonlyArray<SoftDeletableCertificado>;
  organizaciones: ReadonlyArray<OrganizacionEntity>;
  tiposCatalog: ReadonlyArray<TipoAuditoriaCatalogItem>;
  referenceIsoDate?: string;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
  inCardBreadcrumbHtml?: string;
  headerAddAuditHtml?: string;
}

const MONTHS_ES: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1, label: 'Enero' },
  { value: 2, label: 'Febrero' },
  { value: 3, label: 'Marzo' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Mayo' },
  { value: 6, label: 'Junio' },
  { value: 7, label: 'Julio' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Septiembre' },
  { value: 10, label: 'Octubre' },
  { value: 11, label: 'Noviembre' },
  { value: 12, label: 'Diciembre' },
];

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

function getConglomeradoNameForRow(
  row: CampaignStep3Row,
  conglomerados: ReadonlyArray<ConglomeradoEntity>
): string {
  const targetId =
    row.vinculo?.id_grupo_empresarial || row.program.id_grupo_empresarial || null;
  if (targetId) {
    const cong = conglomerados.find((g) => !g.deleted_at && g.id === targetId);
    if (cong) return cong.nombre;
  }
  return row.vinculo?.grupo_nombre || 'Conglomerado';
}

function summarizeAuditTypesCompact(
  audits: ReadonlyArray<ProgramacionAuditEntity>
): string {
  const active = audits.filter((a) => !a.deleted_at);
  if (active.length === 0) return 'Sin certificados';
  return active
    .map((a) => {
      const shortNorm = a.norma_codigo.replace(/:\d{4}$/, '').trim();
      const tipoLabel = a.tipo_auditoria || 'Por definir';
      return `${shortNorm}: ${tipoLabel}`;
    })
    .join(' · ');
}

function getPrecisionFacetValue(entry: AuditDateEntry | null): string {
  if (!entry) return 'SIN_FECHA';
  return entry.tipo_fecha === 'PROGRAMADA_EXACTA' ? 'PROGRAMADA_EXACTA' : 'PREPROGRAMADA_MES';
}

function formatIsoShortEs(iso: string | null | undefined): string {
  if (!iso || iso.length < 10) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function formatDateTimelineSummary(entry: AuditDateEntry): string {
  if (entry.tipo_fecha === 'PREPROGRAMADA_MES' && entry.anio && entry.mes) {
    const monthName = MONTHS_ES.find((m) => m.value === entry.mes)?.label || `Mes ${entry.mes}`;
    return `${monthName} ${entry.anio}`;
  }
  if (entry.fecha_inicio) {
    const start = formatIsoShortEs(entry.fecha_inicio);
    const end = entry.fecha_fin ? formatIsoShortEs(entry.fecha_fin) : start;
    return start === end ? start : `${start} – ${end}`;
  }
  return formatAuditDateLabel(entry);
}

function resolvePrimaryCampaignFechas(
  audits: ReadonlyArray<ProgramacionAuditEntity>
): AuditDateEntry[] {
  const active = audits.filter((a) => !a.deleted_at);
  if (active.length === 0) return [];
  const withDates = active
    .map((a) => (a.fechas || []).filter((f) => !f.deleted_at))
    .sort((a, b) => b.length - a.length);
  return (withDates[0] || []).slice().sort((a, b) => a.numero_secuencia - b.numero_secuencia);
}

export function renderDesignacionTipoView(props: DesignacionTipoViewProps): string {
  const {
    profile,
    state,
    programs,
    vinculos,
    conglomerados,
    certificados,
    organizaciones,
    tiposCatalog,
    referenceIsoDate,
    loading,
    archiveConfig,
    tableColumnWidths,
    inCardBreadcrumbHtml = '',
    headerAddAuditHtml = '',
  } = props;

  const isStaff = isApprovedStaffProfile(profile);
  const activeConglomerados = conglomerados.filter((g) => !g.deleted_at);
  const activeVinculos = vinculos.filter(
    (v) => !v.deleted_at && v.certificados.some((c) => !c.deleted_at)
  );
  const activeTipos = tiposCatalog.filter((t) => !t.deleted_at);

  const commitmentSummaries = computeCertificateCommitmentSummaries(
    certificados,
    organizaciones,
    activeConglomerados,
    vinculos.filter((v) => !v.deleted_at)
  );
  const freeCertsCount = commitmentSummaries.filter((s) => s.status === 'LIBRE').length;

  const allRows = buildCampaignStep3Rows(programs, vinculos, referenceIsoDate);

  if (state.selectedProgramId) {
    const selectedRow = allRows.find((r) => r.program.id === state.selectedProgramId);
    if (selectedRow) {
      return renderStep3DetailView({
        profile,
        state,
        row: selectedRow,
        conglomerados: activeConglomerados,
        tiposCatalog: activeTipos,
        isStaff,
        referenceIsoDate,
        archiveConfig,
        inCardBreadcrumbHtml,
        headerAddAuditHtml,
      });
    }
  }

  if (isStaff && state.isCreating) {
    return renderStep3CreateView({
      state,
      vinculos: activeVinculos,
      tiposCatalog: activeTipos,
      freeCertsCount,
      isStaff,
      referenceIsoDate,
    });
  }

  return renderStep3MultiView({
    state,
    allRows,
    conglomerados: activeConglomerados,
    freeCertsCount,
    isStaff,
    loading,
    archiveConfig,
    tableColumnWidths,
    headerAddAuditHtml,
  });
}

function renderStep3MultiView(opts: {
  state: DesignacionTipoViewState;
  allRows: ReadonlyArray<CampaignStep3Row>;
  conglomerados: ReadonlyArray<ConglomeradoEntity>;
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
    conglomerados,
    freeCertsCount,
    isStaff,
    loading,
    archiveConfig,
    tableColumnWidths,
    headerAddAuditHtml = '',
  } = opts;

  const proximasCount = allRows.filter((r) => matchesTipoQueuePreset(r, 'PROXIMAS')).length;
  const preprogramadasCount = allRows.filter((r) =>
    matchesTipoQueuePreset(r, 'PREPROGRAMADAS')
  ).length;
  const futuroCount = allRows.filter((r) => matchesTipoQueuePreset(r, 'FUTURO')).length;
  const todasCount = allRows.length;

  const presetRows = allRows.filter((r) => matchesTipoQueuePreset(r, state.queuePreset));

  const facetCategories: MultiViewFacetCategory<CampaignStep3Row>[] = [
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
      id: 'precision_fecha',
      label: 'Precisión de Fecha',
      options: [
        { value: 'PREPROGRAMADA_MES', label: 'Preprogramada (Mes/Año)' },
        { value: 'PROGRAMADA_EXACTA', label: 'Programada Exacta' },
        { value: 'SIN_FECHA', label: 'Sin fecha' },
      ],
      extractValues: (r) => getPrecisionFacetValue(r.latestPlannedDate),
    },
    {
      id: 'estado_paso',
      label: 'Completitud Designación',
      options: [
        { value: 'TIPO_OK', label: 'Tipo ✓ Completo' },
        { value: 'TIPO_PEND', label: 'Tipo ○ Pendiente' },
        { value: 'SITIO_OK', label: 'Sitio ✓ Asignado' },
      ],
      extractValues: (r) => {
        const vals: string[] = [r.step3Complete ? 'TIPO_OK' : 'TIPO_PEND'];
        if (r.step4Complete) vals.push('SITIO_OK');
        return vals;
      },
    },
    {
      id: 'naturaleza',
      label: 'Naturaleza de Vínculo',
      options: [
        { value: 'Individual', label: 'Individual' },
        { value: 'Combinada', label: 'Combinada' },
        { value: 'Integrada', label: 'Integrada' },
        { value: 'Conjunta', label: 'Conjunta' },
        { value: 'Simultánea', label: 'Simultánea' },
        { value: 'Multientidad', label: 'Multientidad' },
        { value: 'Mixta', label: 'Mixta' },
      ],
      extractValues: (r) => r.program.tipo_vinculacion,
    },
  ];

  const searchOptions = {
    getSearchableText: (row: CampaignStep3Row): string => {
      const congName = getConglomeradoNameForRow(row, conglomerados);
      const auditBlob = row.program.auditorias
        .filter((a) => !a.deleted_at)
        .map(
          (a) =>
            `${a.numero_certificado} ${a.organizacion_nombre} ${a.norma_codigo} ${a.tipo_auditoria} ${a.codigo_auditoria}`
        )
        .join(' ');
      const dateLabel = formatAuditDateLabel(row.latestPlannedDate);

      return [
        row.program.etiqueta,
        row.program.codigo_programa || '',
        row.program.tipo_vinculacion,
        row.vinculo?.etiqueta || '',
        row.vinculo?.codigo_vinculo || '',
        row.urgency.label,
        dateLabel,
        congName,
        auditBlob,
      ].join(' ');
    },
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
        case 'campania':
          return row.program.etiqueta.toLowerCase();
        case 'fecha_vigente':
          return row.urgency.effectiveStartIso || '9999-12-31';
        default:
          return row.urgency.rank;
      }
    }
  );

  const columns: ColumnDefinition<CampaignStep3Row>[] = [
    {
      id: 'urgencia',
      header: 'Ventana',
      defaultWidthPct: 15,
      minWidthPx: 115,
      sortable: true,
      renderCell: (row) => `
        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${row.urgency.badgeClass} whitespace-nowrap">
          ${escapeHtml(row.urgency.label)}
        </span>
      `,
    },
    {
      id: 'campania',
      header: 'Campaña / Vínculo',
      defaultWidthPct: 28,
      minWidthPx: 180,
      sortable: true,
      renderCell: (row) => {
        const congName = getConglomeradoNameForRow(row, conglomerados);
        const linkSummary = row.vinculo
          ? `${row.vinculo.codigo_vinculo ? `${row.vinculo.codigo_vinculo} · ` : ''}${row.vinculo.etiqueta}`
          : `${row.program.tipo_vinculacion} · ${congName}`;
        return `
          <div class="min-w-0 space-y-0.5">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="font-bold text-slate-900 truncate">${escapeHtml(row.program.etiqueta)}</span>
              ${
                row.program.codigo_programa
                  ? `<span class="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 shrink-0">${escapeHtml(row.program.codigo_programa)}</span>`
                  : ''
              }
            </div>
            <div class="text-[11px] text-slate-500 truncate">${escapeHtml(linkSummary)}</div>
          </div>
        `;
      },
    },
    {
      id: 'fecha_vigente',
      header: 'Fecha Programada',
      defaultWidthPct: 21,
      minWidthPx: 150,
      sortable: true,
      renderCell: (row) => {
        const dateLabel = row.latestPlannedDate
          ? formatDateTimelineSummary(row.latestPlannedDate)
          : 'Sin fecha planificada';
        const precisionBadge =
          row.latestPlannedDate?.tipo_fecha === 'PROGRAMADA_EXACTA'
            ? '<span class="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Exacta</span>'
            : row.latestPlannedDate?.tipo_fecha === 'PREPROGRAMADA_MES'
            ? '<span class="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">Mes</span>'
            : '';
        const reprogBadge =
          row.reprogramCount > 0
            ? `<span class="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">Reprog. #${row.reprogramCount + 1}</span>`
            : '';
        return `
          <div class="min-w-0 space-y-1">
            <div class="text-xs font-semibold text-slate-800 truncate">${escapeHtml(dateLabel)}</div>
            <div class="flex flex-wrap items-center gap-1">${precisionBadge}${reprogBadge}</div>
          </div>
        `;
      },
    },
    {
      id: 'tipos_cert',
      header: 'Certificados & Tipos',
      defaultWidthPct: 24,
      minWidthPx: 175,
      sortable: false,
      renderCell: (row) => {
        const activeCount = row.program.auditorias.filter((a) => !a.deleted_at).length;
        const summary = summarizeAuditTypesCompact(row.program.auditorias);
        return `
          <div class="min-w-0 space-y-0.5">
            <div class="text-[11px] font-bold text-slate-700">
              ${activeCount} certificado${activeCount === 1 ? '' : 's'}
            </div>
            <div class="text-[11px] text-slate-500 truncate" title="${escapeHtml(summary)}">
              ${escapeHtml(summary)}
            </div>
          </div>
        `;
      },
    },
    {
      id: 'estado_paso',
      header: 'Designación',
      defaultWidthPct: 12,
      minWidthPx: 105,
      sortable: false,
      renderCell: (row) => `
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border whitespace-nowrap ${
          row.step3Complete
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : 'bg-amber-50 text-amber-800 border-amber-200'
        }">
          <span>Tipo ${row.step3Complete ? '✓' : '○'}</span>
          <span aria-hidden="true">·</span>
          <span>Sitio ${row.step4Complete ? '✓' : '○'}</span>
        </span>
      `,
    },
  ];

  const renderCard = (row: CampaignStep3Row): string => {
    const activeCount = row.program.auditorias.filter((a) => !a.deleted_at).length;
    const dateLabel = row.latestPlannedDate
      ? formatDateTimelineSummary(row.latestPlannedDate)
      : 'Sin fecha planificada';
    return `
      <article
        role="button"
        tabindex="0"
        data-action="select-step3-program"
        data-program-id="${escapeHtml(row.program.id)}"
        aria-label="Abrir campaña ${escapeHtml(row.program.etiqueta)}"
        class="text-left bg-white border border-slate-200 hover:border-slate-400 rounded-xl p-3.5 shadow-2xs transition-all cursor-pointer space-y-2.5 flex flex-col justify-between"
      >
        <div class="space-y-1.5">
          <div class="flex items-center justify-between gap-2">
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${row.urgency.badgeClass}">
              ${escapeHtml(row.urgency.label)}
            </span>
            <span class="text-[11px] font-semibold ${
              row.step3Complete ? 'text-emerald-700' : 'text-amber-700'
            }">
              Tipo ${row.step3Complete ? '✓' : '○'} · Sitio ${row.step4Complete ? '✓' : '○'}
            </span>
          </div>
          <h3 class="text-sm font-bold text-slate-900 line-clamp-2">${escapeHtml(row.program.etiqueta)}</h3>
          <p class="text-[11px] text-slate-500 truncate">
            ${escapeHtml(row.vinculo?.etiqueta || row.program.tipo_vinculacion)}
          </p>
        </div>
        <div class="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px] text-slate-600">
          <span class="font-semibold truncate">${escapeHtml(dateLabel)}</span>
          <span class="shrink-0 font-bold text-slate-700">${activeCount} cert${
            activeCount === 1 ? '' : 's'
          }${row.reprogramCount > 0 ? ` · Reprog. #${row.reprogramCount + 1}` : ''}</span>
        </div>
      </article>
    `;
  };

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
        <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Horizonte temporal de campañas">
          ${presetButton('PROXIMAS', 'Próximas a ejecutar', proximasCount, 'bg-slate-900 text-white shadow-2xs')}
          ${presetButton('PREPROGRAMADAS', 'Preprogramadas Mes', preprogramadasCount, 'bg-sky-700 text-white shadow-2xs')}
          ${presetButton('FUTURO', 'Futuro +1/+3 años', futuroCount, 'bg-indigo-700 text-white shadow-2xs')}
          ${presetButton('TODAS', 'Todas', todasCount, 'bg-slate-800 text-white shadow-2xs')}
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
                ${freeCertsCount} certificado${freeCertsCount === 1 ? '' : 's'} Libre${freeCertsCount === 1 ? '' : 's'} sin vínculo → Ir a Vínculo
              </button>
            `
            : ''
        }
      </div>
      ${
        state.queuePreset === 'PROXIMAS' && futuroCount > 0
          ? `
            <p class="text-[11px] text-slate-500 px-1">
              Protección anti-futuro activa: ocultando ${futuroCount} ciclo${
                futuroCount === 1 ? '' : 's'
              } futuro${futuroCount === 1 ? '' : 's'} (+1/+3 años). Use <strong>Futuro +1/+3 años</strong> o <strong>Todas</strong> para inspeccionarlos.
            </p>
          `
          : ''
      }
    </div>
  `;

  const archiveProps = extractUniversalArchiveProps(archiveConfig, 'programacion');

  return renderUniversalTemplate<CampaignStep3Row>({
    domainKey: 'designacion-tipo',
    tableId: 'designacion-tipo-main',
    title: 'Designación → Tipo de Auditoría',
    subtitle:
      'Cola operativa ordenada por inminencia temporal. Asigne el tipo de auditoría por certificado y gestione reprogramaciones 1:N.',
    entityLabel: 'campañas',
    searchQuery: state.query,
    searchPlaceholder: 'Buscar por campaña, vínculo, certificado o tipo de auditoría...',
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
      `data-action="select-step3-program" data-program-id="${escapeHtml(row.program.id)}" title="Abrir campaña ${escapeHtml(row.program.etiqueta)}"`,
    renderCard,
    actionsHtml: isStaff
      ? `<div class="flex flex-wrap items-center gap-2">${headerAddAuditHtml}${renderMultiViewAddButton('open-create-step3-cycle', 'Nuevo ciclo de auditoría')}</div>`
      : '',
    inlineFormHtml: presetBarHtml,
    loading,
    emptyStateTitle:
      state.queuePreset === 'PROXIMAS' && allRows.length > 0
        ? 'No hay campañas próximas en esta vista'
        : 'Sin campañas registradas en Designación → Tipo',
    emptyStateMessage:
      state.queuePreset === 'PROXIMAS' && futuroCount > 0
        ? 'Cambie el filtro temporal a "Futuro +1/+3 años" o "Todas", o cree un nuevo ciclo desde un Vínculo.'
        : 'Cree un nuevo ciclo de auditoría a partir de un Vínculo activo para designar tipos y fechas.',
    ...archiveProps,
  });
}

function renderStep3CreateView(opts: {
  state: DesignacionTipoViewState;
  vinculos: ReadonlyArray<VinculoEntity>;
  tiposCatalog: ReadonlyArray<TipoAuditoriaCatalogItem>;
  freeCertsCount: number;
  isStaff: boolean;
  referenceIsoDate?: string;
}): string {
  const { state, vinculos, tiposCatalog, freeCertsCount, isStaff, referenceIsoDate } = opts;

  const draft: Step3NewCycleDraft =
    state.newCycleDraft ?? createEmptyStep3NewCycleDraft(vinculos, tiposCatalog, referenceIsoDate);

  const selectedVinculo = vinculos.find((v) => v.id === draft.id_vinculo);
  const certRows: Step3NewCycleCertTypeDraft[] =
    draft.certTypes.length > 0
      ? draft.certTypes
      : buildCertTypesDraftForVinculo(selectedVinculo, tiposCatalog[0]?.id || '');

  const freeBannerHtml =
    freeCertsCount > 0
      ? `
        <div class="rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <span class="text-xs font-semibold text-amber-900">
            Hay ${freeCertsCount} certificado${freeCertsCount === 1 ? '' : 's'} Libre${
              freeCertsCount === 1 ? '' : 's'
            } sin vínculo (no aparecen aquí hasta comprometerse en Paso 2).
          </span>
          <button
            type="button"
            data-nav="auditorias"
            data-subview="vinculo"
            class="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
          >
            Ir a Vínculo →
          </button>
        </div>
      `
      : '';

  const feedbackHtml = state.editErrorMessage
    ? `
      <div role="alert" class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800 flex items-center gap-2">
        <span aria-hidden="true">⚠️</span>
        <span>${escapeHtml(state.editErrorMessage)}</span>
      </div>
    `
    : '';

  const formHtml = `
    <form id="step3NewCycleForm" class="space-y-4" novalidate>
      ${freeBannerHtml}

      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div class="md:col-span-2 bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
          <label for="step3VinculoSelect" class="block text-xs font-bold text-slate-700">
            Vínculo de Origen (Individual o Agrupado) <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <select
            id="step3VinculoSelect"
            name="id_vinculo"
            required
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
          >
            <option value="">Seleccione un vínculo configurado...</option>
            ${vinculos
              .map((v) => {
                const count = v.certificados.filter((c) => !c.deleted_at).length;
                const modeLabel = v.es_vinculada ? v.tipo_vinculacion : 'Individual';
                const congLabel = v.grupo_nombre || 'Conglomerado';
                const label = `${v.etiqueta} (${modeLabel} · ${count} cert${
                  count === 1 ? '' : 's'
                } · ${congLabel})`;
                return `<option value="${escapeHtml(v.id)}" ${
                  v.id === draft.id_vinculo ? 'selected' : ''
                }>${escapeHtml(label)}</option>`;
              })
              .join('')}
          </select>
        </div>

        <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
          <label for="step3CodigoProgramaInput" class="block text-xs font-bold text-slate-700">
            Código de Campaña
          </label>
          <input
            type="text"
            id="step3CodigoProgramaInput"
            name="codigo_programa"
            maxlength="40"
            value="${escapeHtml(draft.codigo_programa)}"
            placeholder="Ej. PROG-2026-004"
            class="w-full text-xs font-mono p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
          />
        </div>
      </div>

      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
        <label for="step3EtiquetaInput" class="block text-xs font-bold text-slate-700">
          Etiqueta del Ciclo / Campaña <span class="text-rose-600" aria-hidden="true">*</span>
        </label>
        <input
          type="text"
          id="step3EtiquetaInput"
          name="etiqueta"
          required
          maxlength="200"
          value="${escapeHtml(draft.etiqueta)}"
          placeholder="Ej. Planta Santa Cruz — Seguimiento 2"
          class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
        />
      </div>

      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3.5 space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="text-xs font-bold text-slate-700">
            Fecha Inicial Planificada <span class="text-rose-600" aria-hidden="true">*</span>
          </span>
          <div class="inline-flex items-center gap-1.5" role="group" aria-label="Modo de fecha inicial">
            <button
              type="button"
              data-action="set-step3-create-datemode"
              data-datemode="PREPROGRAMADA_MES"
              aria-pressed="${draft.dateMode === 'PREPROGRAMADA_MES' ? 'true' : 'false'}"
              class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                draft.dateMode === 'PREPROGRAMADA_MES'
                  ? 'bg-sky-700 text-white shadow-2xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }"
            >
              Preprogramación Mes + Año
            </button>
            <button
              type="button"
              data-action="set-step3-create-datemode"
              data-datemode="PROGRAMADA_EXACTA"
              aria-pressed="${draft.dateMode === 'PROGRAMADA_EXACTA' ? 'true' : 'false'}"
              class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                draft.dateMode === 'PROGRAMADA_EXACTA'
                  ? 'bg-emerald-700 text-white shadow-2xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }"
            >
              Fecha Exacta
            </button>
          </div>
        </div>

        ${
          draft.dateMode === 'PREPROGRAMADA_MES'
            ? `
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div class="space-y-1">
                  <label for="step3CreateMesSelect" class="block text-[11px] font-bold text-slate-600">Mes</label>
                  <select
                    id="step3CreateMesSelect"
                    name="mes"
                    class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
                  >
                    ${MONTHS_ES.map(
                      (m) =>
                        `<option value="${m.value}" ${
                          m.value === draft.mes ? 'selected' : ''
                        }>${escapeHtml(m.label)}</option>`
                    ).join('')}
                  </select>
                </div>
                <div class="space-y-1">
                  <label for="step3CreateAnioInput" class="block text-[11px] font-bold text-slate-600">Año</label>
                  <input
                    type="number"
                    id="step3CreateAnioInput"
                    name="anio"
                    min="2020"
                    max="2100"
                    value="${draft.anio}"
                    class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
                  />
                </div>
              </div>
            `
            : `
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div class="space-y-1">
                  <label for="step3CreateFechaInicioInput" class="block text-[11px] font-bold text-slate-600">Fecha de Inicio</label>
                  <input
                    type="date"
                    id="step3CreateFechaInicioInput"
                    name="fecha_inicio"
                    value="${escapeHtml(draft.fecha_inicio)}"
                    class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
                  />
                </div>
                <div class="space-y-1">
                  <label for="step3CreateFechaFinInput" class="block text-[11px] font-bold text-slate-600">Fecha Fin</label>
                  <input
                    type="date"
                    id="step3CreateFechaFinInput"
                    name="fecha_fin"
                    value="${escapeHtml(draft.fecha_fin)}"
                    class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
                  />
                </div>
              </div>
            `
        }

        <div class="space-y-1">
          <label for="step3CreateObservacionInput" class="block text-[11px] font-bold text-slate-600">
            Nota de Programación Inicial #1
          </label>
          <input
            type="text"
            id="step3CreateObservacionInput"
            name="observacion"
            maxlength="300"
            value="${escapeHtml(draft.observacion)}"
            placeholder="Ej. Ventana acordada con el cliente para ciclo trienal"
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
          />
        </div>
      </div>

      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3.5 space-y-2.5">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-bold text-slate-700">
            Matriz de Tipo de Auditoría por Certificado (${certRows.length}) <span class="text-rose-600" aria-hidden="true">*</span>
          </span>
          <span class="text-[11px] text-slate-500">
            Cada certificado puede tener su propio tipo en auditorías combinadas o mixtas
          </span>
        </div>

        ${
          certRows.length === 0
            ? `<p class="text-xs text-slate-500 py-2">Seleccione un vínculo con certificados activos para designar tipos.</p>`
            : `
              <div class="space-y-2">
                ${certRows
                  .map((certItem) => {
                    const selectId = `step3CertTipo_${certItem.id_certificado}`;
                    return `
                      <div class="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center bg-white border border-slate-200 rounded-lg p-2.5">
                        <div class="md:col-span-7 min-w-0">
                          <div class="flex items-center gap-2 flex-wrap">
                            <span class="font-mono text-xs font-bold text-slate-900">${escapeHtml(certItem.numero_certificado)}</span>
                            <span class="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                              ${escapeHtml(certItem.norma_codigo)}
                            </span>
                          </div>
                          <div class="text-[11px] text-slate-500 truncate">${escapeHtml(certItem.organizacion_nombre)}</div>
                        </div>
                        <div class="md:col-span-5">
                          <label for="${escapeHtml(selectId)}" class="sr-only">
                            Tipo de auditoría para ${escapeHtml(certItem.numero_certificado)}
                          </label>
                          <select
                            id="${escapeHtml(selectId)}"
                            name="cert_tipo_${escapeHtml(certItem.id_certificado)}"
                            data-step3-cert-tipo="${escapeHtml(certItem.id_certificado)}"
                            required
                            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
                          >
                            <option value="">Seleccionar tipo de auditoría...</option>
                            ${tiposCatalog
                              .map(
                                (t) =>
                                  `<option value="${escapeHtml(t.id)}" ${
                                    t.id === certItem.id_tipo_auditoria ? 'selected' : ''
                                  }>${escapeHtml(t.tipo)} (${escapeHtml(t.etapa_ciclo)})</option>`
                              )
                              .join('')}
                          </select>
                        </div>
                      </div>
                    `;
                  })
                  .join('')}
              </div>
            `
        }
      </div>
    </form>
  `;

  return renderDetailPageTemplate({
    entityType: 'Ciclo de Auditoría (Paso 3)',
    entitySymbol: '🏷️',
    title: 'Nuevo Ciclo · Designación de Tipo',
    subtitle:
      'Inicie una campaña desde un Vínculo activo y designe el tipo de auditoría por certificado.',
    backButton: {
      label: 'Volver',
      nav: 'auditorias',
      subview: 'designacion/tipo',
      action: 'back-to-step3-list',
    },
    isCreateMode: true,
    customTopActionsHtml: renderDetailFormTopActions({
      mode: 'add',
      isStaff,
      formId: 'step3NewCycleForm',
      saveBtnId: 'saveStep3NewCycleBtn',
      cancelBtnId: 'cancelStep3NewCycleBtn',
      editBtnId: 'editStep3CycleBtn',
      saveTitle: 'Crear ciclo en Paso 3',
      cancelTitle: 'Cancelar creación',
    }),
    tableName: 'programa_auditoria',
    recordId: 'step3-new',
    feedbackHtml,
    attributes: [],
    customRecordBodyHtml: formHtml,
  });
}

function renderStep3DetailView(opts: {
  profile: UserProfile;
  state: DesignacionTipoViewState;
  row: CampaignStep3Row;
  conglomerados: ReadonlyArray<ConglomeradoEntity>;
  tiposCatalog: ReadonlyArray<TipoAuditoriaCatalogItem>;
  isStaff: boolean;
  referenceIsoDate?: string;
  archiveConfig?: ArchiveMultiViewConfig;
  inCardBreadcrumbHtml?: string;
  headerAddAuditHtml?: string;
}): string {
  const {
    profile,
    state,
    row,
    conglomerados,
    tiposCatalog,
    isStaff,
    referenceIsoDate,
    archiveConfig,
    inCardBreadcrumbHtml = '',
    headerAddAuditHtml = '',
  } = opts;
  const { program, vinculo } = row;
  const activeAudits = program.auditorias.filter((a) => !a.deleted_at);
  const mode: 'read' | 'edit' = isStaff && state.isEditingAttributes ? 'edit' : 'read';
  const congId = vinculo?.id_grupo_empresarial || program.id_grupo_empresarial || null;
  const congName = getConglomeradoNameForRow(row, conglomerados);

  const parents = [
    ...(congId
      ? [
          {
            label: 'Conglomerado',
            value: congName,
            symbol: '🏛️',
            navAction: {
              nav: 'certificacion',
              subview: 'conglomerados',
              entityType: 'conglomerado' as const,
              entityId: congId,
            },
          },
        ]
      : []),
    ...(vinculo
      ? [
          {
            label: 'Vínculo',
            value: `${vinculo.codigo_vinculo ? `${vinculo.codigo_vinculo} · ` : ''}${vinculo.etiqueta}`,
            symbol: '🔗',
            navAction: {
              nav: 'auditorias',
              subview: 'vinculo',
              entityType: 'vinculo' as const,
              entityId: vinculo.id,
            },
          },
        ]
      : []),
  ];

  const parentMetaHtml = `
    <div class="flex flex-wrap items-center justify-between gap-2 w-full bg-slate-50/80 border border-slate-200 rounded-xl px-3 py-2">
      <div class="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
        <span class="px-2 py-0.5 rounded-md bg-slate-900 text-white font-bold">
          Paso 3 · Tipo (Activo)
        </span>
        <span class="text-slate-400" aria-hidden="true">→</span>
        <button
          type="button"
          data-nav="auditorias"
          data-subview="designacion/sitio"
          data-parent-nav="true"
          data-parent-type="programa_auditoria"
          data-entity-id="${escapeHtml(program.id)}"
          class="px-2 py-0.5 rounded-md border border-slate-200 bg-white hover:bg-indigo-50 text-slate-700 hover:text-indigo-800 transition-colors cursor-pointer"
        >
          Paso 4: Sitio ${row.step4Complete ? '✓' : '→'}
        </button>
        <span class="text-slate-400" aria-hidden="true">→</span>
        <button
          type="button"
          data-nav="auditorias"
          data-subview="programa"
          data-parent-nav="true"
          data-parent-type="programa_auditoria"
          data-entity-id="${escapeHtml(program.id)}"
          class="px-2 py-0.5 rounded-md border border-slate-200 bg-white hover:bg-indigo-50 text-slate-700 hover:text-indigo-800 transition-colors cursor-pointer"
        >
          Paso 8: Programa →
        </button>
      </div>
      <span class="text-[11px] font-semibold text-slate-500">
        ${activeAudits.length} certificado${activeAudits.length === 1 ? '' : 's'} en campaña
      </span>
    </div>
  `;

  const futureWarningText = requiresFutureYearWarning(row.urgency);
  const futureBannerHtml =
    row.urgency.isFutureTrapRisk && futureWarningText
      ? `
        <div
          role="alert"
          data-testid="future-cycle-warning-banner"
          class="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs font-semibold text-amber-950 flex items-start gap-2"
        >
          <span aria-hidden="true">⚠️</span>
          <div>
            <span class="font-bold">Ciclo Futuro (Año ${escapeHtml(
              String(row.urgency.targetYear ?? '')
            )}):</span>
            <span>${escapeHtml(futureWarningText)}</span>
          </div>
        </div>
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

  const feedbackHtml = `${futureBannerHtml}${errorBannerHtml}`;

  const dateDisplay = row.latestPlannedDate
    ? formatDateTimelineSummary(row.latestPlannedDate)
    : 'Sin fecha planificada';

  const customRecordBodyHtml =
    mode === 'read'
      ? `
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div class="sm:col-span-2 bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Campaña / Programa</span>
            <p class="text-xs font-bold text-slate-900">${escapeHtml(program.etiqueta)}</p>
          </div>
          <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Fecha Planificada Vigente</span>
            <p class="text-xs font-bold text-slate-900">${escapeHtml(dateDisplay)}</p>
          </div>
          <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Naturaleza</span>
            <p class="text-xs font-bold text-slate-900">${escapeHtml(program.tipo_vinculacion)}</p>
          </div>
          <div class="sm:col-span-2 lg:col-span-4 bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Notas de Campaña</span>
            <p class="text-xs font-medium text-slate-700">${escapeHtml(
              program.notas || 'Sin notas registradas.'
            )}</p>
          </div>
        </div>
      `
      : `
        <form id="step3EditProgramForm" class="space-y-3" novalidate>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div class="md:col-span-2 bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1">
              <label for="step3EditEtiquetaInput" class="block text-xs font-bold text-slate-700">
                Etiqueta del Ciclo <span class="text-rose-600" aria-hidden="true">*</span>
              </label>
              <input
                type="text"
                id="step3EditEtiquetaInput"
                name="etiqueta"
                required
                maxlength="200"
                value="${escapeHtml(program.etiqueta)}"
                class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
              />
            </div>
            <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1">
              <label for="step3EditCodigoInput" class="block text-xs font-bold text-slate-700">
                Código
              </label>
              <input
                type="text"
                id="step3EditCodigoInput"
                name="codigo_programa"
                maxlength="40"
                value="${escapeHtml(program.codigo_programa || '')}"
                class="w-full text-xs font-mono p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
              />
            </div>
          </div>

          <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-2">
            <span class="block text-xs font-bold text-slate-700">
              Tipos de Auditoría por Certificado
            </span>
            <div class="space-y-2">
              ${activeAudits
                .map(
                  (audit) => `
                    <div class="grid grid-cols-1 md:grid-cols-12 gap-2 items-center bg-white border border-slate-200 rounded-lg p-2.5">
                      <div class="md:col-span-7 min-w-0">
                        <div class="font-mono text-xs font-bold text-slate-900">${escapeHtml(audit.numero_certificado)}</div>
                        <div class="text-[11px] text-slate-500 truncate">${escapeHtml(audit.organizacion_nombre)} · ${escapeHtml(audit.norma_codigo)}</div>
                      </div>
                      <div class="md:col-span-5">
                        <select
                          name="edit_audit_tipo_${escapeHtml(audit.id)}"
                          data-edit-audit-id="${escapeHtml(audit.id)}"
                          class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
                        >
                          <option value="">Seleccionar tipo...</option>
                          ${tiposCatalog
                            .map((t) => {
                              const isSelected =
                                (audit.id_tipo_auditoria && audit.id_tipo_auditoria === t.id) ||
                                (!audit.id_tipo_auditoria && audit.tipo_auditoria === t.tipo);
                              return `<option value="${escapeHtml(t.id)}" ${
                                isSelected ? 'selected' : ''
                              }>${escapeHtml(t.tipo)} (${escapeHtml(t.etapa_ciclo)})</option>`;
                            })
                            .join('')}
                        </select>
                      </div>
                    </div>
                  `
                )
                .join('')}
            </div>
          </div>

          <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1">
            <label for="step3EditNotasInput" class="block text-xs font-bold text-slate-700">Notas</label>
            <textarea
              id="step3EditNotasInput"
              name="notas"
              rows="2"
              maxlength="1000"
              class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
            >${escapeHtml(program.notas || '')}</textarea>
          </div>
        </form>
      `;

  const campaignFechas = resolvePrimaryCampaignFechas(activeAudits);
  const activeTab: DesignacionTipoChildTab =
    state.activeChildTab === 'certificados' ? 'certificados' : 'fechas';

  const canArchive = canArchiveRecord(profile);
  const customTopActionsHtml = renderDetailFormTopActions({
    mode,
    isStaff,
    formId: 'step3EditProgramForm',
    saveBtnId: 'saveStep3ProgramBtn',
    cancelBtnId: 'cancelEditStep3ProgramBtn',
    editBtnId: 'startEditStep3ProgramBtn',
    showArchiveBtn: canArchive,
    extraAuditAttrs: `data-table-name="programa_auditoria" data-record-id="${escapeHtml(program.id)}" data-entity-name="${escapeHtml(program.etiqueta)}"`,
    extraArchiveAttrs: `data-table-name="programa_auditoria" data-record-id="${escapeHtml(program.id)}" data-entity-name="${escapeHtml(program.etiqueta)}"`,
  });

  return renderDetailPageTemplate({
    entityType: 'Designación → Tipo',
    entitySymbol: '🏷️',
    title: program.etiqueta,
    eyebrowCode: program.codigo_programa || undefined,
    subtitle: `${program.tipo_vinculacion} · ${activeAudits.length} certificado${
      activeAudits.length === 1 ? '' : 's'
    }`,
    statusBadge: {
      label: row.urgency.label,
      badgeClass: row.urgency.badgeClass,
    },
    backButton: {
      label: 'Volver',
      nav: 'auditorias',
      subview: 'designacion/tipo',
      action: 'back-to-step3-list',
    },
    topInCardHtml: inCardBreadcrumbHtml,
    customTopActionsHtml: `${headerAddAuditHtml}${customTopActionsHtml}`,
    parents,
    parentMetaHtml,
    tableName: 'programa_auditoria',
    recordId: program.id,
    feedbackHtml,
    attributes: [],
    customRecordBodyHtml,
    childTabs: [
      {
        id: 'fechas',
        label: 'Programación y Reprogramaciones 1:N',
        symbol: '🗓️',
        count: campaignFechas.length,
      },
      {
        id: 'certificados',
        label: 'Tipos por Certificado',
        symbol: '📜',
        count: activeAudits.length,
      },
    ],
    activeChildTabId: activeTab,
    childTabAttrName: 'data-step3-tab',
    renderChildTabContent: (tabId) => {
      if (tabId === 'certificados') {
        return renderStep3CertificatesTab({
          program,
          audits: activeAudits,
          tiposCatalog,
          isStaff,
        });
      }
      return renderStep3DatesTimelineTab({
        state,
        program,
        audits: activeAudits,
        fechas: campaignFechas,
        isStaff,
        referenceIsoDate,
      });
    },
  });
}

function renderStep3DatesTimelineTab(opts: {
  state: DesignacionTipoViewState;
  program: ProgramaAuditoriaEntity;
  audits: ReadonlyArray<ProgramacionAuditEntity>;
  fechas: ReadonlyArray<AuditDateEntry>;
  isStaff: boolean;
  referenceIsoDate?: string;
}): string {
  const { state, program, audits, fechas, isStaff, referenceIsoDate } = opts;
  const latestPlanned = resolveLatestAuditDate(
    fechas.filter((f) => !f.deleted_at && f.tipo_fecha !== 'REAL')
  );
  const nextSeq = buildNextReprogramDateSequence(fechas);
  const draft: ReprogramDateDraft =
    state.reprogramDraft ??
    createDefaultReprogramDateDraft(
      audits[0]?.id || '',
      latestPlanned,
      referenceIsoDate
    );

  const headerBar = `
    <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
      <div class="space-y-0.5">
        <h3 class="text-xs font-bold uppercase tracking-wider text-slate-700">
          Historial Cronológico 1:N (Sin sobrescribir secuencias previas)
        </h3>
        <p class="text-[11px] text-slate-500">
          Cada reprogramación agrega una nueva secuencia (#2, #3...) preservando el registro histórico.
        </p>
      </div>
      ${
        isStaff && !state.isReprogramming
          ? `
            <button
              type="button"
              id="openStep3ReprogramBtn"
              data-action="open-step3-reprogram"
              data-program-id="${escapeHtml(program.id)}"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shadow-2xs"
            >
              <span>+ Reprogramar (#${nextSeq})</span>
            </button>
          `
          : ''
      }
    </div>
  `;

  const reprogFormHtml =
    isStaff && state.isReprogramming
      ? `
        <form
          id="step3ReprogramForm"
          data-program-id="${escapeHtml(program.id)}"
          class="mb-4 rounded-xl border border-indigo-200 bg-indigo-50/40 p-3.5 space-y-3"
          novalidate
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-xs font-bold text-indigo-950">
              Registrar Reprogramación #${nextSeq}
            </span>
            <div class="inline-flex items-center gap-1.5" role="group" aria-label="Precisión de fecha de reprogramación">
              <button
                type="button"
                data-action="set-step3-reprogram-mode"
                data-datemode="PREPROGRAMADA_MES"
                aria-pressed="${draft.tipo_fecha === 'PREPROGRAMADA_MES' ? 'true' : 'false'}"
                class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  draft.tipo_fecha === 'PREPROGRAMADA_MES'
                    ? 'bg-sky-700 text-white'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }"
              >
                Mes + Año
              </button>
              <button
                type="button"
                data-action="set-step3-reprogram-mode"
                data-datemode="PROGRAMADA_EXACTA"
                aria-pressed="${draft.tipo_fecha === 'PROGRAMADA_EXACTA' ? 'true' : 'false'}"
                class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  draft.tipo_fecha === 'PROGRAMADA_EXACTA'
                    ? 'bg-emerald-700 text-white'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }"
              >
                Fecha Exacta
              </button>
            </div>
          </div>

          ${
            draft.tipo_fecha === 'PREPROGRAMADA_MES'
              ? `
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div class="space-y-1">
                    <label for="step3ReprogramMesSelect" class="block text-[11px] font-bold text-slate-700">Nuevo Mes</label>
                    <select
                      id="step3ReprogramMesSelect"
                      name="mes"
                      class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
                    >
                      ${MONTHS_ES.map(
                        (m) =>
                          `<option value="${m.value}" ${
                            m.value === draft.mes ? 'selected' : ''
                          }>${escapeHtml(m.label)}</option>`
                      ).join('')}
                    </select>
                  </div>
                  <div class="space-y-1">
                    <label for="step3ReprogramAnioInput" class="block text-[11px] font-bold text-slate-700">Nuevo Año</label>
                    <input
                      type="number"
                      id="step3ReprogramAnioInput"
                      name="anio"
                      min="2020"
                      max="2100"
                      value="${draft.anio}"
                      class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                </div>
              `
              : `
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div class="space-y-1">
                    <label for="step3ReprogramFechaInicioInput" class="block text-[11px] font-bold text-slate-700">Fecha Inicio</label>
                    <input
                      type="date"
                      id="step3ReprogramFechaInicioInput"
                      name="fecha_inicio"
                      value="${escapeHtml(draft.fecha_inicio)}"
                      class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                  <div class="space-y-1">
                    <label for="step3ReprogramFechaFinInput" class="block text-[11px] font-bold text-slate-700">Fecha Fin</label>
                    <input
                      type="date"
                      id="step3ReprogramFechaFinInput"
                      name="fecha_fin"
                      value="${escapeHtml(draft.fecha_fin)}"
                      class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                </div>
              `
          }

          <div class="space-y-1">
            <label for="step3ReprogramObservacionInput" class="block text-[11px] font-bold text-slate-700">
              Motivo / Observación de Reprogramación <span class="text-rose-600" aria-hidden="true">*</span>
            </label>
            <input
              type="text"
              id="step3ReprogramObservacionInput"
              name="observacion"
              required
              maxlength="300"
              value="${escapeHtml(draft.observacion)}"
              placeholder="Ej. Reprogramación solicitada por parada de planta del cliente"
              class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
            />
          </div>

          <div class="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              id="cancelStep3ReprogramBtn"
              data-action="cancel-step3-reprogram"
              class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              id="submitStep3ReprogramBtn"
              class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer shadow-2xs"
            >
              Guardar Reprogramación #${nextSeq}
            </button>
          </div>
        </form>
      `
      : '';

  const timelineHtml =
    fechas.length === 0
      ? `
        <div class="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-4 text-center text-xs text-slate-500">
          Esta campaña aún no tiene registros de fecha en <code>auditoria_fecha</code>.
        </div>
      `
      : `
        <ol class="space-y-2.5" aria-label="Línea de tiempo de programación y reprogramaciones">
          ${fechas
            .map((entry) => {
              const isLatestPlanned = latestPlanned?.id === entry.id;
              const seqLabel = `${entry.tag} #${entry.numero_secuencia}`;
              const typeBadge =
                entry.tipo_fecha === 'REAL'
                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                  : entry.tipo_fecha === 'PROGRAMADA_EXACTA'
                  ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                  : 'bg-sky-50 text-sky-800 border-sky-200';
              const typeText =
                entry.tipo_fecha === 'REAL'
                  ? 'Fecha Real Ejecutada'
                  : entry.tipo_fecha === 'PROGRAMADA_EXACTA'
                  ? 'Programada Exacta'
                  : 'Preprogramada Mes/Año';

              return `
                <li class="rounded-xl border p-3 flex flex-wrap items-start justify-between gap-2 ${
                  isLatestPlanned
                    ? 'border-indigo-300 bg-indigo-50/30 shadow-2xs'
                    : 'border-slate-200 bg-white'
                }">
                  <div class="space-y-1 min-w-0">
                    <div class="flex flex-wrap items-center gap-1.5">
                      <span class="text-xs font-bold text-slate-900">${escapeHtml(seqLabel)}</span>
                      <span class="inline-flex items-center px-2 py-0.2 rounded-full text-[10px] font-bold border ${typeBadge}">
                        ${escapeHtml(typeText)}
                      </span>
                      ${
                        isLatestPlanned
                          ? '<span class="inline-flex items-center px-2 py-0.2 rounded-full text-[10px] font-bold bg-emerald-600 text-white">Vigente</span>'
                          : ''
                      }
                    </div>
                    <div class="text-xs font-semibold text-slate-800">
                      ${escapeHtml(formatDateTimelineSummary(entry))}
                    </div>
                    ${
                      entry.observacion
                        ? `<p class="text-[11px] text-slate-600">${escapeHtml(entry.observacion)}</p>`
                        : ''
                    }
                  </div>
                </li>
              `;
            })
            .join('')}
        </ol>
      `;

  return `${headerBar}${reprogFormHtml}${timelineHtml}`;
}

function renderStep3CertificatesTab(opts: {
  program: ProgramaAuditoriaEntity;
  audits: ReadonlyArray<ProgramacionAuditEntity>;
  tiposCatalog: ReadonlyArray<TipoAuditoriaCatalogItem>;
  isStaff: boolean;
}): string {
  const { program, audits, tiposCatalog, isStaff } = opts;

  const actionsBar = `
    <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
      <div class="space-y-0.5">
        <h3 class="text-xs font-bold uppercase tracking-wider text-slate-700">
          Certificados de la Campaña y Tipo de Auditoría Designado
        </h3>
        <p class="text-[11px] text-slate-500">
          Configure el tipo individualmente por certificado y continúe hacia Designación → Sitio (Paso 4) o Programa (Paso 8).
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-nav="auditorias"
          data-subview="designacion/sitio"
          data-parent-nav="true"
          data-parent-type="programa_auditoria"
          data-entity-id="${escapeHtml(program.id)}"
          class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 transition-colors cursor-pointer whitespace-nowrap"
        >
          Configurar Sitios (Paso 4) →
        </button>
        <button
          type="button"
          data-nav="auditorias"
          data-subview="programa"
          data-parent-nav="true"
          data-parent-type="programa_auditoria"
          data-entity-id="${escapeHtml(program.id)}"
          class="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
        >
          Ir a Programa de Cert. (Paso 8) →
        </button>
      </div>
    </div>
  `;

  if (audits.length === 0) {
    return `${actionsBar}<p class="text-xs text-slate-500">No hay certificados asociados a esta campaña.</p>`;
  }

  return `
    ${actionsBar}
    <div class="space-y-2.5">
      ${audits
        .map((audit) => {
          const siteCount = (audit.sitiosPlan || []).filter((s) => !s.deleted_at).length;
          return `
            <div class="rounded-xl border border-slate-200 bg-white p-3 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
              <div class="md:col-span-7 min-w-0 space-y-0.5">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="font-mono text-xs font-bold text-slate-900">${escapeHtml(audit.numero_certificado)}</span>
                  <span class="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                    ${escapeHtml(audit.norma_codigo)}
                  </span>
                  <span class="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-50 text-slate-600 border border-slate-200">
                    ${escapeHtml(audit.codigo_auditoria)}
                  </span>
                </div>
                <div class="text-xs text-slate-600 truncate">${escapeHtml(audit.organizacion_nombre)}</div>
                <div class="text-[11px] text-slate-500">
                  Estado ciclo: <strong>${escapeHtml(audit.estado_ciclo || 'Borrador')}</strong> · Sitios designados: <strong>${siteCount}</strong>
                </div>
              </div>
              <div class="md:col-span-5">
                ${
                  isStaff
                    ? `
                      <label for="step3InlineTipo_${escapeHtml(audit.id)}" class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Tipo de Auditoría
                      </label>
                      <select
                        id="step3InlineTipo_${escapeHtml(audit.id)}"
                        data-action="change-step3-audit-tipo"
                        data-audit-id="${escapeHtml(audit.id)}"
                        class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
                      >
                        <option value="">Seleccionar tipo...</option>
                        ${tiposCatalog
                          .map((t) => {
                            const selected =
                              (audit.id_tipo_auditoria && audit.id_tipo_auditoria === t.id) ||
                              (!audit.id_tipo_auditoria && audit.tipo_auditoria === t.tipo);
                            return `<option value="${escapeHtml(t.id)}" ${
                              selected ? 'selected' : ''
                            }>${escapeHtml(t.tipo)} (${escapeHtml(t.etapa_ciclo)})</option>`;
                          })
                          .join('')}
                      </select>
                    `
                    : `
                      <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tipo de Auditoría</div>
                      <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 mt-1">
                        ${escapeHtml(audit.tipo_auditoria || 'Por definir')}
                      </span>
                    `
                }
              </div>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}
