import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import type { ConglomeradoEntity } from '../lib/conglomeradoDomain';
import type { VinculoEntity } from '../lib/vinculoDomain';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import {
  formatAuditDateLabel,
  resolveLatestPlannedDate,
  type AuditDateEntry,
  type ProgramaAuditoriaEntity,
} from '../lib/auditPlanningEngine';
import type { ProgramacionAuditEntity } from '../lib/auditExecution';
import {
  requiresFutureYearWarning,
  type TipoQueuePreset,
} from '../lib/designacionTipoDomain';
import {
  buildCampaignStep4Rows,
  buildSiteCycleMatrixForAudit,
  matchesStep4Preset,
  sliceCycleWindowColumns,
  type CampaignStep4Row,
  type CandidateSiteEntity,
  type SiteCycleMatrixRow,
} from '../lib/designacionSitioDomain';
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
import { renderDetailPageTemplate } from './detailTemplate';
import {
  extractUniversalArchiveProps,
  type ArchiveMultiViewConfig,
} from '../lib/archiveGovernance';

export type DesignacionSitioSortColumn = 'urgencia' | 'campania' | 'cobertura_sitios';

export interface DesignacionSitioViewState {
  queuePreset: TipoQueuePreset;
  query: string;
  viewMode: UniversalViewMode;
  isSidebarOpen: boolean;
  sortColumn: DesignacionSitioSortColumn | null;
  sortDirection: SortDirection;
  facetSelections: MultiViewSelectionMap;
  selectedProgramId: string | null;
  selectedAuditId: string | null;
  cycleWindowOffsetByAuditId: Record<string, number>;
  editErrorMessage: string | null;
  savingSiteToggleKey: string | null;
}

export interface DesignacionSitioViewProps {
  profile: UserProfile;
  state: DesignacionSitioViewState;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  allAudits: ReadonlyArray<ProgramacionAuditEntity>;
  vinculos: ReadonlyArray<VinculoEntity>;
  conglomerados: ReadonlyArray<ConglomeradoEntity>;
  certificados: ReadonlyArray<CertificadoDetailEntity>;
  referenceIsoDate?: string;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
  inCardBreadcrumbHtml?: string;
  headerAddAuditHtml?: string;
}

const MONTHS_ES_SHORT: ReadonlyArray<string> = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

function formatDateSummaryCompact(entry: AuditDateEntry | null): string {
  if (!entry) return 'Sin fecha planificada';
  if (entry.tipo_fecha === 'PREPROGRAMADA_MES' && entry.anio && entry.mes) {
    const mName = MONTHS_ES_SHORT[entry.mes - 1] || `M${entry.mes}`;
    return `${mName} ${entry.anio}`;
  }
  if (entry.fecha_inicio) {
    const start = entry.fecha_inicio.slice(0, 10).split('-').reverse().join('/');
    const end = entry.fecha_fin
      ? entry.fecha_fin.slice(0, 10).split('-').reverse().join('/')
      : start;
    return start === end ? start : `${start} – ${end}`;
  }
  return formatAuditDateLabel(entry);
}

function resolveProgramLatestPlannedDate(
  audits: ReadonlyArray<ProgramacionAuditEntity>
): AuditDateEntry | null {
  const dates = audits
    .filter((a) => !a.deleted_at)
    .map(
      (a) =>
        resolveLatestPlannedDate(a.fechas) ??
        (a.latestDate && !a.latestDate.deleted_at && a.latestDate.tipo_fecha !== 'REAL'
          ? a.latestDate
          : null)
    )
    .filter((d): d is AuditDateEntry => d !== null)
    .sort((a, b) => b.numero_secuencia - a.numero_secuencia);
  return dates[0] ?? null;
}

function getConglomeradoForProgram(
  program: ProgramaAuditoriaEntity,
  vinculos: ReadonlyArray<VinculoEntity>,
  conglomerados: ReadonlyArray<ConglomeradoEntity>
): { id: string | null; nombre: string } {
  const vinculo = program.id_vinculo
    ? vinculos.find((v) => !v.deleted_at && v.id === program.id_vinculo)
    : undefined;
  const congId = vinculo?.id_grupo_empresarial || program.id_grupo_empresarial || null;
  if (congId) {
    const cong = conglomerados.find((g) => !g.deleted_at && g.id === congId);
    if (cong) return { id: cong.id, nombre: cong.nombre };
  }
  return { id: congId, nombre: vinculo?.grupo_nombre || 'Conglomerado' };
}

function getCandidateSitesForAudit(
  audit: ProgramacionAuditEntity,
  certificados: ReadonlyArray<CertificadoDetailEntity & { deleted_at?: string | null }>
): CandidateSiteEntity[] {
  const cert = certificados.find((c) => !c.deleted_at && c.id === audit.id_certificado);
  if (cert && cert.sitios && cert.sitios.length > 0) {
    return cert.sitios;
  }
  // Fallback synthesis from already selected sites if catalog cert detail isn't loaded yet
  const activePlan = (audit.sitiosPlan || []).filter((sp) => !sp.deleted_at);
  return activePlan.map((sp) => ({
    id: sp.id_sitio,
    id_certificado: audit.id_certificado,
    numero_sitio: sp.numero_sitio,
    nombre_sitio: sp.nombre_sitio,
    direccion_sitio: sp.direccion_sitio || '',
    deleted_at: null,
  }));
}

function computeMobileVisibleWindowIndices(
  visibleCellsCount: number,
  currentAuditLocalIndex: number
): Set<number> {
  if (visibleCellsCount <= 3) {
    return new Set(Array.from({ length: visibleCellsCount }, (_, idx) => idx));
  }
  const center =
    currentAuditLocalIndex >= 0 && currentAuditLocalIndex < visibleCellsCount
      ? currentAuditLocalIndex
      : Math.floor(visibleCellsCount / 2);

  let start = center - 1;
  if (start < 0) start = 0;
  if (start + 3 > visibleCellsCount) start = visibleCellsCount - 3;
  return new Set([start, start + 1, start + 2]);
}

export function renderDesignacionSitioView(props: DesignacionSitioViewProps): string {
  const {
    profile,
    state,
    programs,
    allAudits,
    vinculos,
    conglomerados,
    certificados,
    referenceIsoDate,
    loading,
    archiveConfig,
    tableColumnWidths,
    inCardBreadcrumbHtml = '',
    headerAddAuditHtml = '',
  } = props;

  const isStaff = isApprovedStaffProfile(profile);
  const activeConglomerados = conglomerados.filter((g) => !g.deleted_at);
  const activeVinculos = vinculos.filter((v) => !v.deleted_at);
  const allRows = buildCampaignStep4Rows(programs, referenceIsoDate);

  if (state.selectedProgramId) {
    const selectedRow = allRows.find((r) => r.program.id === state.selectedProgramId);
    if (selectedRow) {
      return renderStep4DetailView({
        state,
        row: selectedRow,
        allAudits,
        vinculos: activeVinculos,
        conglomerados: activeConglomerados,
        certificados,
        isStaff,
        inCardBreadcrumbHtml,
        headerAddAuditHtml,
      });
    }
  }

  return renderStep4MultiView({
    state,
    allRows,
    allAudits,
    vinculos: activeVinculos,
    conglomerados: activeConglomerados,
    loading,
    archiveConfig,
    tableColumnWidths,
    headerAddAuditHtml,
  });
}

function renderStep4MultiView(opts: {
  state: DesignacionSitioViewState;
  allRows: ReadonlyArray<CampaignStep4Row>;
  allAudits: ReadonlyArray<ProgramacionAuditEntity>;
  vinculos: ReadonlyArray<VinculoEntity>;
  conglomerados: ReadonlyArray<ConglomeradoEntity>;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
  headerAddAuditHtml?: string;
}): string {
  const {
    state,
    allRows,
    vinculos,
    conglomerados,
    loading,
    archiveConfig,
    tableColumnWidths,
    headerAddAuditHtml = '',
  } = opts;

  const proximasCount = allRows.filter((r) => matchesStep4Preset(r, 'PROXIMAS')).length;
  const preprogramadasCount = allRows.filter((r) =>
    matchesStep4Preset(r, 'PREPROGRAMADAS')
  ).length;
  const futuroCount = allRows.filter((r) => matchesStep4Preset(r, 'FUTURO')).length;
  const todasCount = allRows.length;

  const presetRows = allRows.filter((r) => matchesStep4Preset(r, state.queuePreset));

  const facetCategories: MultiViewFacetCategory<CampaignStep4Row>[] = [
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
      id: 'cobertura_sitios',
      label: 'Cobertura de Sitios',
      options: [
        { value: 'COMPLETO', label: 'Sitio ✓ Completo' },
        { value: 'PENDIENTE', label: 'Pendiente por asignar' },
      ],
      extractValues: (r) => (r.step4Complete ? 'COMPLETO' : 'PENDIENTE'),
    },
    {
      id: 'sitio_temporal',
      label: 'Sitio Temporal / Proyecto',
      options: [
        { value: 'ACTIVO', label: 'Con Sitio Temporal' },
        { value: 'NO', label: 'Solo Sitios Permanentes' },
      ],
      extractValues: (r) => (r.hasAnyTemporalSiteEnabled ? 'ACTIVO' : 'NO'),
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
    getSearchableText: (row: CampaignStep4Row): string => {
      const cong = getConglomeradoForProgram(row.program, vinculos, conglomerados);
      const vinculo = row.program.id_vinculo
        ? vinculos.find((v) => v.id === row.program.id_vinculo)
        : undefined;
      const auditsText = row.program.auditorias
        .filter((a) => !a.deleted_at)
        .map((a) => {
          const siteNames = (a.sitiosPlan || [])
            .filter((sp) => !sp.deleted_at)
            .map((sp) => sp.nombre_sitio)
            .join(' ');
          return `${a.numero_certificado} ${a.organizacion_nombre} ${a.norma_codigo} ${a.codigo_auditoria} ${siteNames}`;
        })
        .join(' ');
      return [
        row.program.etiqueta,
        row.program.codigo_programa || '',
        row.program.tipo_vinculacion,
        vinculo?.etiqueta || '',
        vinculo?.codigo_vinculo || '',
        cong.nombre,
        row.urgency.label,
        auditsText,
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
        case 'cobertura_sitios':
          return row.totalSelectedSites;
        default:
          return row.urgency.rank;
      }
    }
  );

  const columns: ColumnDefinition<CampaignStep4Row>[] = [
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
      defaultWidthPct: 32,
      minWidthPx: 190,
      sortable: true,
      renderCell: (row) => {
        const activeAudits = row.program.auditorias.filter((a) => !a.deleted_at);
        const latestPlanned = resolveProgramLatestPlannedDate(activeAudits);
        const dateLabel = formatDateSummaryCompact(latestPlanned);
        const vinculo = row.program.id_vinculo
          ? vinculos.find((v) => v.id === row.program.id_vinculo)
          : undefined;
        const cong = getConglomeradoForProgram(row.program, vinculos, conglomerados);
        const subMeta = vinculo
          ? `${vinculo.codigo_vinculo ? `${vinculo.codigo_vinculo} · ` : ''}${vinculo.etiqueta} · ${dateLabel}`
          : `${row.program.tipo_vinculacion} · ${cong.nombre} · ${dateLabel}`;

        return `
          <div class="min-w-0 space-y-0.5">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="font-bold text-slate-900 truncate">${escapeHtml(row.program.etiqueta)}</span>
              ${
                row.program.codigo_programa
                  ? `<span class="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200 shrink-0">${escapeHtml(row.program.codigo_programa)}</span>`
                  : ''
              }
            </div>
            <div class="text-[11px] text-slate-500 truncate">${escapeHtml(subMeta)}</div>
          </div>
        `;
      },
    },
    {
      id: 'cobertura_sitios',
      header: 'Sitios Seleccionados',
      defaultWidthPct: 25,
      minWidthPx: 170,
      sortable: true,
      renderCell: (row) => `
        <div class="min-w-0 space-y-0.5">
          <div class="text-xs font-bold text-slate-800">
            ${row.totalSelectedSites} sitio${row.totalSelectedSites === 1 ? '' : 's'}
          </div>
          <div class="text-[11px] text-slate-500 truncate">
            ${row.certsWithSitesCount}/${row.totalCerts} certs con sede
          </div>
        </div>
      `,
    },
    {
      id: 'temporal',
      header: 'Sitio Temp.',
      defaultWidthPct: 14,
      minWidthPx: 105,
      sortable: false,
      renderCell: (row) =>
        row.hasAnyTemporalSiteEnabled
          ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-violet-50 text-violet-800 border border-violet-200 whitespace-nowrap">Activo</span>`
          : `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-500 border border-slate-200 whitespace-nowrap">No</span>`,
    },
    {
      id: 'estado_paso',
      header: 'Estado Sitio',
      defaultWidthPct: 14,
      minWidthPx: 105,
      sortable: false,
      renderCell: (row) =>
        row.step4Complete
          ? `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap">Sitio ✓</span>`
          : `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">Pendiente</span>`,
    },
  ];

  const renderCard = (row: CampaignStep4Row): string => {
    const activeAudits = row.program.auditorias.filter((a) => !a.deleted_at);
    const latestPlanned = resolveProgramLatestPlannedDate(activeAudits);
    const dateLabel = formatDateSummaryCompact(latestPlanned);

    return `
      <article
        role="button"
        tabindex="0"
        data-action="select-step4-program"
        data-program-id="${escapeHtml(row.program.id)}"
        aria-label="Seleccionar sitios para campaña ${escapeHtml(row.program.etiqueta)}"
        class="text-left bg-white border border-slate-200 hover:border-slate-400 rounded-xl p-3.5 shadow-2xs transition-all cursor-pointer space-y-2.5 flex flex-col justify-between"
      >
        <div class="space-y-1.5">
          <div class="flex items-center justify-between gap-2">
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${row.urgency.badgeClass}">
              ${escapeHtml(row.urgency.label)}
            </span>
            <span class="text-[11px] font-bold ${
              row.step4Complete ? 'text-emerald-700' : 'text-amber-700'
            }">
              ${row.step4Complete ? 'Sitio ✓' : 'Pendiente'}
            </span>
          </div>
          <h3 class="text-sm font-bold text-slate-900 line-clamp-2">${escapeHtml(row.program.etiqueta)}</h3>
          <p class="text-[11px] text-slate-500 truncate">${escapeHtml(dateLabel)} · ${escapeHtml(row.program.tipo_vinculacion)}</p>
        </div>
        <div class="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px]">
          <span class="font-semibold text-slate-700">${row.totalSelectedSites} sitio${
            row.totalSelectedSites === 1 ? '' : 's'
          } · ${row.certsWithSitesCount}/${row.totalCerts} certs</span>
          ${
            row.hasAnyTemporalSiteEnabled
              ? '<span class="px-1.5 py-0.2 rounded bg-violet-50 text-violet-800 border border-violet-200 font-bold text-[10px]">Temp. Activo</span>'
              : '<span class="text-slate-400 font-medium text-[10px]">Solo perm.</span>'
          }
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
        data-action="set-designacion-sitio-preset"
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
        <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Horizonte temporal de campañas para selección de sitios">
          ${presetButton('PROXIMAS', 'Próximas a ejecutar', proximasCount, 'bg-slate-900 text-white shadow-2xs')}
          ${presetButton('PREPROGRAMADAS', 'Preprogramadas Mes', preprogramadasCount, 'bg-sky-700 text-white shadow-2xs')}
          ${presetButton('FUTURO', 'Futuro +1/+3 años', futuroCount, 'bg-indigo-700 text-white shadow-2xs')}
          ${presetButton('TODAS', 'Todas', todasCount, 'bg-slate-800 text-white shadow-2xs')}
        </div>
      </div>
      ${
        state.queuePreset === 'PROXIMAS' && futuroCount > 0
          ? `
            <p class="text-[11px] text-slate-500 px-1">
              Protección anti-futuro activa: ocultando ${futuroCount} ciclo${
                futuroCount === 1 ? '' : 's'
              } futuro${futuroCount === 1 ? '' : 's'} (+1/+3 años). Cambie a <strong>Futuro +1/+3 años</strong> o <strong>Todas</strong> para planificar sitios adelantados.
            </p>
          `
          : ''
      }
    </div>
  `;

  const archiveProps = extractUniversalArchiveProps(archiveConfig, 'programacion');

  return renderUniversalTemplate<CampaignStep4Row>({
    domainKey: 'designacion-sitio',
    tableId: 'designacion-sitio-main',
    title: 'Designación → Sitio de Auditoría',
    subtitle:
      'Selector matriz multi-anual de sitios permanentes por certificado. Verifique el historial trienal y active el indicador de sitio temporal cuando aplique.',
    entityLabel: 'campañas',
    searchQuery: state.query,
    searchPlaceholder: 'Buscar por campaña, vínculo, certificado o sitio...',
    searchInputId: 'designacion-sitioSearchInput',
    clearSearchBtnId: 'clearDesignacionSitioSearchBtn',
    totalCount: presetRows.length,
    filteredCount: sortedRows.length,
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen,
    sortState: { column: state.sortColumn, direction: state.sortDirection },
    columnWidths: tableColumnWidths?.['designacion-sitio-main'],
    facetGroups,
    items: sortedRows,
    columns,
    getRowAttrs: (row) =>
      `data-action="select-step4-program" data-program-id="${escapeHtml(row.program.id)}" title="Configurar sitios de ${escapeHtml(row.program.etiqueta)}"`,
    renderCard,
    actionsHtml: headerAddAuditHtml,
    inlineFormHtml: presetBarHtml,
    loading,
    emptyStateTitle:
      state.queuePreset === 'PROXIMAS' && allRows.length > 0
        ? 'No hay campañas próximas en Designación → Sitio'
        : 'Sin campañas registradas para selección de sitios',
    emptyStateMessage:
      state.queuePreset === 'PROXIMAS' && futuroCount > 0
        ? 'Use el filtro "Futuro +1/+3 años" o "Todas" para inspeccionar ciclos posteriores.'
        : 'Cree un ciclo en Designación → Tipo (Paso 3) para habilitar la selección matriz de sitios.',
    ...archiveProps,
  });
}

function renderStep4DetailView(opts: {
  state: DesignacionSitioViewState;
  row: CampaignStep4Row;
  allAudits: ReadonlyArray<ProgramacionAuditEntity>;
  vinculos: ReadonlyArray<VinculoEntity>;
  conglomerados: ReadonlyArray<ConglomeradoEntity>;
  certificados: ReadonlyArray<CertificadoDetailEntity>;
  isStaff: boolean;
  inCardBreadcrumbHtml?: string;
  headerAddAuditHtml?: string;
}): string {
  const {
    state,
    row,
    allAudits,
    vinculos,
    conglomerados,
    certificados,
    isStaff,
  } = opts;
  const { program } = row;
  const activeAudits = program.auditorias.filter((a) => !a.deleted_at);
  const vinculo = program.id_vinculo
    ? vinculos.find((v) => v.id === program.id_vinculo)
    : undefined;
  const cong = getConglomeradoForProgram(program, vinculos, conglomerados);

  const parents = [
    ...(cong.id
      ? [
          {
            label: 'Conglomerado',
            value: cong.nombre,
            symbol: '🏛️',
            navAction: {
              nav: 'certificacion',
              subview: 'conglomerados',
              entityType: 'conglomerado' as const,
              entityId: cong.id,
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

  const temporalNavEnabled = row.hasAnyTemporalSiteEnabled;

  const renderCrossStepLinks = (idPrefix: string): string => `
    <div class="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
      <button
        type="button"
        id="${idPrefix}_step3"
        data-nav="auditorias"
        data-subview="designacion/tipo"
        data-parent-nav="true"
        data-parent-type="programa_auditoria"
        data-entity-id="${escapeHtml(program.id)}"
        class="px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-indigo-50 text-slate-700 hover:text-indigo-800 transition-colors cursor-pointer whitespace-nowrap"
      >
        ← Paso 3: Tipo
      </button>
      <span class="px-2.5 py-1 rounded-md bg-slate-900 text-white font-bold whitespace-nowrap">
        Paso 4 · Sitio (Activo)
      </span>
      <button
        type="button"
        id="${idPrefix}_step5"
        ${
          temporalNavEnabled
            ? `data-nav="auditorias" data-subview="designacion/temporal" data-parent-nav="true" data-parent-type="programa_auditoria" data-entity-id="${escapeHtml(program.id)}"`
            : `disabled aria-disabled="true" title="Active el switch de Sitio Temporal / Proyecto en al menos una auditoría para habilitar Paso 5"`
        }
        class="px-2.5 py-1 rounded-md border transition-colors whitespace-nowrap ${
          temporalNavEnabled
            ? 'border-violet-300 bg-violet-50 hover:bg-violet-100 text-violet-900 cursor-pointer'
            : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
        }"
      >
        Paso 5: Temporal →
      </button>
      <button
        type="button"
        id="${idPrefix}_step6"
        data-nav="auditorias"
        data-subview="tiempo"
        data-parent-nav="true"
        data-parent-type="programa_auditoria"
        data-entity-id="${escapeHtml(program.id)}"
        class="px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-indigo-50 text-slate-700 hover:text-indigo-800 transition-colors cursor-pointer whitespace-nowrap"
      >
        Paso 6: Tiempo →
      </button>
      <button
        type="button"
        id="${idPrefix}_step8"
        data-nav="auditorias"
        data-subview="programa"
        data-parent-nav="true"
        data-parent-type="programa_auditoria"
        data-entity-id="${escapeHtml(program.id)}"
        class="px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-indigo-50 text-slate-700 hover:text-indigo-800 transition-colors cursor-pointer whitespace-nowrap"
      >
        Paso 8: Programa →
      </button>
    </div>
  `;

  const parentMetaHtml = `
    <div class="flex flex-wrap items-center justify-between gap-2 w-full bg-slate-50/80 border border-slate-200 rounded-xl px-3 py-2">
      ${renderCrossStepLinks('step4TopNav')}
      <span class="text-[11px] font-semibold text-slate-500 whitespace-nowrap">
        ${row.totalSelectedSites} sitio${row.totalSelectedSites === 1 ? '' : 's'} · ${row.certsWithSitesCount}/${row.totalCerts} certs
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

  const renderMatrixSiteRow = (
    audit: ProgramacionAuditEntity,
    matrixRow: SiteCycleMatrixRow,
    windowOffset: number
  ): string => {
    const activePlanEntry = (audit.sitiosPlan || []).find(
      (sp) => !sp.deleted_at && sp.id_sitio === matrixRow.site.id
    );
    const toggleKey = `${audit.id}:${matrixRow.site.id}`;
    const isSavingSite = state.savingSiteToggleKey === toggleKey;
    const isBlockedLastSite = matrixRow.isSelectedInCurrentAudit && !matrixRow.canDeselect;
    const checkboxDisabled = !isStaff || isBlockedLastSite || isSavingSite;
    const checkboxId = `step4SiteChk_${audit.id}_${matrixRow.site.id}`;

    const sliced = sliceCycleWindowColumns(
      matrixRow.timelineCells,
      matrixRow.currentAuditIndex,
      windowOffset,
      5
    );
    const currentLocalIdx = sliced.visible.findIndex((c) => c.isCurrentAudit);
    const mobileVisibleSet = computeMobileVisibleWindowIndices(
      sliced.visible.length,
      currentLocalIdx
    );

    const addressText =
      matrixRow.site.direccion_sitio ||
      matrixRow.site.tipo_sitio ||
      'Dirección sin especificar';

    return `
      <div
        data-testid="site-cycle-row"
        data-site-number="${matrixRow.site.numero_sitio}"
        class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5 p-3 rounded-xl border transition-colors ${
          matrixRow.isSelectedInCurrentAudit
            ? 'border-indigo-200 bg-indigo-50/25'
            : 'border-slate-200 bg-white'
        }"
      >
        <div class="min-w-0 flex-1 space-y-1.5">
          <label
            for="${escapeHtml(checkboxId)}"
            class="inline-flex items-start gap-2.5 min-h-[36px] w-full ${
              checkboxDisabled ? 'cursor-not-allowed opacity-85' : 'cursor-pointer'
            }"
          >
            <input
              type="checkbox"
              id="${escapeHtml(checkboxId)}"
              data-action="toggle-step4-site"
              data-audit-id="${escapeHtml(audit.id)}"
              data-site-id="${escapeHtml(matrixRow.site.id)}"
              data-sitio-auditoria-id="${escapeHtml(activePlanEntry?.id || '')}"
              data-currently-selected="${matrixRow.isSelectedInCurrentAudit ? 'true' : 'false'}"
              ${matrixRow.isSelectedInCurrentAudit ? 'checked' : ''}
              ${checkboxDisabled ? 'disabled' : ''}
              class="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
            />
            <span class="min-w-0 flex-1 space-y-0.5">
              <span class="flex flex-wrap items-center gap-1.5">
                ${
                  matrixRow.isPrincipalHq
                    ? '<span class="inline-flex items-center px-2 py-0.2 rounded-md text-[10px] font-bold bg-indigo-100 text-indigo-900 border border-indigo-200 whitespace-nowrap">Sitio 0 (HQ)</span>'
                    : `<span class="inline-flex items-center px-2 py-0.2 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">Sitio #${matrixRow.site.numero_sitio}</span>`
                }
                <span class="text-xs font-bold text-slate-900 truncate">${escapeHtml(
                  matrixRow.site.nombre_sitio
                )}</span>
                ${
                  isSavingSite
                    ? '<span class="text-[10px] font-semibold text-indigo-600">Guardando...</span>'
                    : isBlockedLastSite && isStaff
                    ? '<span class="text-[10px] font-semibold text-slate-400">Mín. 1 sitio</span>'
                    : ''
                }
              </span>
              <span class="block text-[11px] text-slate-500 truncate">${escapeHtml(
                addressText
              )}</span>
            </span>
          </label>

          <div class="flex flex-wrap items-center gap-1.5 pl-6">
            <span class="inline-flex items-center px-2 py-0.2 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              Última auditoría: ${escapeHtml(matrixRow.lastAuditedLabel)}
            </span>
            <span class="inline-flex items-center px-2 py-0.2 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              En ciclo: ${matrixRow.auditedCountInWindow}/${matrixRow.totalVisitsInWindow}
            </span>
          </div>
        </div>

        <div class="flex items-center gap-1.5 w-full lg:w-auto lg:min-w-[340px] lg:max-w-[440px]">
          <button
            type="button"
            data-action="page-step4-cycle"
            data-audit-id="${escapeHtml(audit.id)}"
            data-delta="-1"
            aria-label="Ventana de ciclo anterior para ${escapeHtml(audit.codigo_auditoria)}"
            ${!sliced.canPagePrev ? 'disabled' : ''}
            class="w-7 h-7 shrink-0 inline-flex items-center justify-center rounded-lg border text-xs font-bold transition-colors ${
              sliced.canPagePrev
                ? 'border-slate-300 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer'
                : 'border-slate-200 bg-slate-50 text-slate-300 cursor-not-allowed'
            }"
          >
            ◀
          </button>

          <div class="grid grid-cols-3 sm:grid-cols-5 gap-1.5 min-w-0 flex-1">
            ${
              sliced.visible.length === 0
                ? '<div class="col-span-3 sm:col-span-5 text-center text-[10px] text-slate-400 py-1.5">Sin ciclo</div>'
                : sliced.visible
                    .map((cell, colIdx) => {
                      const mobileVisibilityClass = mobileVisibleSet.has(colIdx)
                        ? 'flex'
                        : 'hidden sm:flex';
                      return `
                        <div
                          class="${mobileVisibilityClass} flex-col items-center justify-center rounded-lg border px-1.5 py-1 min-w-0 text-center ${cell.badgeClass}"
                          title="${escapeHtml(`${cell.yearLabel} · ${cell.auditTypeLabel} · ${cell.shortTag}`)}"
                        >
                          <span class="text-[10px] font-bold leading-tight truncate max-w-full">
                            ${escapeHtml(cell.yearLabel)}${cell.isCurrentAudit ? ' ★' : ''}
                          </span>
                          <span class="text-[9px] font-semibold leading-tight truncate max-w-full opacity-95">
                            ${escapeHtml(cell.shortTag)}
                          </span>
                        </div>
                      `;
                    })
                    .join('')
            }
          </div>

          <button
            type="button"
            data-action="page-step4-cycle"
            data-audit-id="${escapeHtml(audit.id)}"
            data-delta="1"
            aria-label="Ventana de ciclo siguiente para ${escapeHtml(audit.codigo_auditoria)}"
            ${!sliced.canPageNext ? 'disabled' : ''}
            class="w-7 h-7 shrink-0 inline-flex items-center justify-center rounded-lg border text-xs font-bold transition-colors ${
              sliced.canPageNext
                ? 'border-slate-300 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer'
                : 'border-slate-200 bg-slate-50 text-slate-300 cursor-not-allowed'
            }"
          >
            ▶
          </button>
        </div>
      </div>
    `;
  };

  const renderCertificateMatrixCard = (audit: ProgramacionAuditEntity): string => {
    const candidateSites = getCandidateSitesForAudit(audit, certificados);
    const matrixRows = buildSiteCycleMatrixForAudit(audit, candidateSites, allAudits);
    const selectedCount = matrixRows.filter((m) => m.isSelectedInCurrentAudit).length;
    const windowOffset = state.cycleWindowOffsetByAuditId[audit.id] ?? 0;
    const isTemporalEnabled = audit.tiene_sitio_temporal === true;
    const isSavingTemporal = state.savingSiteToggleKey === `temporal:${audit.id}`;
    const temporalSwitchDisabled = !isStaff || isSavingTemporal;

    return `
      <section
        data-testid="site-cycle-matrix-card"
        data-audit-id="${escapeHtml(audit.id)}"
        class="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden"
      >
        <header class="bg-slate-50/90 border-b border-slate-200 px-3.5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
          <div class="min-w-0 space-y-0.5">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="text-xs font-bold text-slate-900 truncate">${escapeHtml(
                audit.organizacion_nombre
              )}</span>
              <span class="font-mono text-[11px] font-bold px-1.5 py-0.2 rounded bg-white text-slate-800 border border-slate-300 whitespace-nowrap">
                ${escapeHtml(audit.numero_certificado)}
              </span>
              <span class="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-200/70 text-slate-700 whitespace-nowrap">
                ${escapeHtml(audit.norma_codigo)}
              </span>
              <span class="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200 whitespace-nowrap">
                ${escapeHtml(audit.codigo_auditoria)} · ${escapeHtml(audit.tipo_auditoria)}
              </span>
            </div>
            <div class="text-[11px] text-slate-500">
              ${selectedCount} sitio${selectedCount === 1 ? '' : 's'} seleccionado${
                selectedCount === 1 ? '' : 's'
              } de ${matrixRows.length} sede${matrixRows.length === 1 ? ' permanente' : 's permanentes'}
            </div>
          </div>

          <div class="flex items-center justify-between sm:justify-end gap-2 shrink-0 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5">
            <span class="text-[11px] font-semibold text-slate-700">
              ¿Incluye Sitio Temporal / Proyecto?
            </span>
            <button
              type="button"
              role="switch"
              aria-checked="${isTemporalEnabled ? 'true' : 'false'}"
              data-action="toggle-step4-temporal"
              data-audit-id="${escapeHtml(audit.id)}"
              data-next-value="${isTemporalEnabled ? 'false' : 'true'}"
              ${temporalSwitchDisabled ? 'disabled' : ''}
              class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                isTemporalEnabled ? 'bg-violet-600' : 'bg-slate-300'
              } ${temporalSwitchDisabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}"
            >
              <span
                class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  isTemporalEnabled ? 'translate-x-4' : 'translate-x-0'
                }"
              ></span>
            </button>
            <span class="text-[10px] font-bold ${
              isTemporalEnabled ? 'text-violet-800' : 'text-slate-500'
            } min-w-[20px]">
              ${isSavingTemporal ? '...' : isTemporalEnabled ? 'Sí' : 'No'}
            </span>
          </div>
        </header>

        <div class="p-3 sm:p-3.5 space-y-2">
          ${
            matrixRows.length === 0
              ? `
                <div class="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-500">
                  Este certificado no tiene sitios permanentes activos configurados en el directorio de Certificados.
                </div>
              `
              : matrixRows
                  .map((mRow) => renderMatrixSiteRow(audit, mRow, windowOffset))
                  .join('')
          }
        </div>
      </section>
    `;
  };

  const customRecordBodyHtml = `
    <div class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 bg-slate-50/70 border border-slate-200 rounded-xl px-3 py-2">
        <span>
          Marque los sitios auditables por certificado inspeccionando su historial en ciclos anteriores. <strong class="text-slate-800">Sitio 0 (HQ)</strong> aparece primero por defecto.
        </span>
        ${
          !isStaff
            ? '<span class="px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-bold whitespace-nowrap">Solo lectura</span>'
            : ''
        }
      </div>

      ${
        activeAudits.length === 0
          ? '<p class="text-xs text-slate-500">No hay auditorías activas dentro de esta campaña.</p>'
          : activeAudits.map((a) => renderCertificateMatrixCard(a)).join('')
      }

      <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
        <span class="text-[11px] text-slate-500">
          Flujo post-sitio: continúe en paralelo hacia Tipo, Temporal, Tiempo o Programa.
        </span>
        ${renderCrossStepLinks('step4BottomNav')}
      </div>
    </div>
  `;

  return renderDetailPageTemplate({
    entityType: 'Designación → Sitio',
    entitySymbol: '📍',
    title: program.etiqueta,
    eyebrowCode: program.codigo_programa || undefined,
    subtitle: `${program.tipo_vinculacion} · ${activeAudits.length} certificado${
      activeAudits.length === 1 ? '' : 's'
    } · ${row.totalSelectedSites} sitio${row.totalSelectedSites === 1 ? '' : 's'} asignado${
      row.totalSelectedSites === 1 ? '' : 's'
    }`,
    statusBadge: {
      label: row.urgency.label,
      badgeClass: row.urgency.badgeClass,
    },
    backButton: {
      label: 'Volver',
      nav: 'auditorias',
      subview: 'designacion/sitio',
      action: 'back-to-step4-list',
    },
    topInCardHtml: opts.inCardBreadcrumbHtml || '',
    extraActionButtonsHtml: opts.headerAddAuditHtml || '',
    parents,
    parentMetaHtml,
    tableName: 'programa_auditoria',
    recordId: program.id,
    feedbackHtml,
    attributes: [],
    customRecordBodyHtml,
  });
}
