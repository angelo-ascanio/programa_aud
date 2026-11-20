import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import type { ConglomeradoEntity } from '../lib/conglomeradoDomain';
import type { VinculoEntity } from '../lib/vinculoDomain';
import {
  formatAuditDateLabel,
  resolveLatestPlannedDate,
  type AuditDateEntry,
  type AuditoriaSitioPlanItem,
  type ProgramaAuditoriaEntity,
  type SiteEvaluationModality,
} from '../lib/auditPlanningEngine';
import type { ProgramacionAuditEntity } from '../lib/auditExecution';
import type { AuditoriaSitioTemporalEntity } from '../lib/designacionTemporalDomain';
import {
  buildCampaignTiempoRows,
  type CampaignTiempoRow,
  type CertTiempoBreakdown,
} from '../lib/tiempoDomain';
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

export type TiempoSortColumn = 'campania' | 'total' | 'estado';

export interface TiempoViewState {
  query: string;
  viewMode: UniversalViewMode;
  isSidebarOpen: boolean;
  sortColumn: TiempoSortColumn | null;
  sortDirection: SortDirection;
  facetSelections: MultiViewSelectionMap;
  selectedProgramId: string | null;
  draftTimeBySitePlanId: Record<string, string>;
  savingSitePlanId: string | null;
  editErrorMessage: string | null;
}

export interface TiempoViewProps {
  profile: UserProfile;
  state: TiempoViewState;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  temporalSites: ReadonlyArray<AuditoriaSitioTemporalEntity>;
  vinculos: ReadonlyArray<VinculoEntity>;
  conglomerados: ReadonlyArray<ConglomeradoEntity>;
  referenceIsoDate?: string;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
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

const MODALITY_OPTIONS: ReadonlyArray<SiteEvaluationModality> = [
  'Presencial',
  'Remota',
  'Mixta',
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
  const active = audits.filter((a) => !a.deleted_at);
  const planned = active
    .map(
      (a) =>
        resolveLatestPlannedDate(a.fechas) ??
        (a.latestDate && !a.latestDate.deleted_at && a.latestDate.tipo_fecha !== 'REAL'
          ? a.latestDate
          : null)
    )
    .filter((d): d is AuditDateEntry => d !== null)
    .sort((a, b) => b.numero_secuencia - a.numero_secuencia);
  return planned[0] ?? null;
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

function hasCampaignTemporalSites(row: CampaignTiempoRow): boolean {
  return (
    row.campaignTemporalDaysUnique > 0 ||
    row.certBreakdowns.some(
      (b) => b.linkedTemporals.length > 0 || b.audit.tiene_sitio_temporal === true
    )
  );
}

/**
 * Renders the Step 6 (`Tiempo`) domain view:
 * - Clean List Directory & Cards Multi View (`tableId: 'tiempo-main'`) with reactive facets
 *   (`Estado Tiempo`, `Sitio Temporal`, `Ventana`), `<colgroup>` summing 100%, and 0 buttons in `<tbody>`.
 * - Operational Detail View per campaign/certificate/site with `0.25d` steppers, modality selector,
 *   deduplicated temporal summary banner, RBAC read-only enforcement, and Zero-UUID compliance.
 */
export function renderTiempoView(props: TiempoViewProps): string {
  const {
    profile,
    state,
    programs,
    temporalSites,
    vinculos,
    conglomerados,
    referenceIsoDate,
    loading,
    archiveConfig,
    tableColumnWidths,
  } = props;

  const isStaff = isApprovedStaffProfile(profile);
  const activeConglomerados = conglomerados.filter((g) => !g.deleted_at);
  const activeVinculos = vinculos.filter((v) => !v.deleted_at);
  const allRows = buildCampaignTiempoRows(programs, temporalSites, referenceIsoDate);

  if (state.selectedProgramId) {
    const selectedRow = allRows.find((r) => r.program.id === state.selectedProgramId);
    if (selectedRow) {
      return renderTiempoDetailView({
        state,
        row: selectedRow,
        vinculos: activeVinculos,
        conglomerados: activeConglomerados,
        isStaff,
      });
    }
  }

  return renderTiempoMultiView({
    state,
    allRows,
    vinculos: activeVinculos,
    conglomerados: activeConglomerados,
    loading,
    archiveConfig,
    tableColumnWidths,
  });
}

function renderTiempoMultiView(opts: {
  state: TiempoViewState;
  allRows: ReadonlyArray<CampaignTiempoRow>;
  vinculos: ReadonlyArray<VinculoEntity>;
  conglomerados: ReadonlyArray<ConglomeradoEntity>;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
}): string {
  const { state, allRows, vinculos, conglomerados, loading, archiveConfig, tableColumnWidths } = opts;

  const facetCategories: MultiViewFacetCategory<CampaignTiempoRow>[] = [
    {
      id: 'estado_tiempo',
      label: 'Estado Tiempo',
      options: [
        { value: 'INCOMPLETOS', label: 'Incompletos' },
        { value: 'COMPLETOS', label: 'Completos' },
      ],
      extractValues: (r) => (r.isComplete ? 'COMPLETOS' : 'INCOMPLETOS'),
    },
    {
      id: 'sitio_temporal',
      label: 'Sitio Temporal',
      options: [
        { value: 'CON_TEMPORAL', label: 'Con sitio temporal' },
        { value: 'SOLO_PERMANENTES', label: 'Solo sitios permanentes' },
      ],
      extractValues: (r) => (hasCampaignTemporalSites(r) ? 'CON_TEMPORAL' : 'SOLO_PERMANENTES'),
    },
    {
      id: 'ventana',
      label: 'Ventana',
      options: [
        { value: 'VENCIDA', label: 'Vencida' },
        { value: 'PROXIMA_30D', label: 'Próxima (≤30d)' },
        { value: 'ESTE_TRIMESTRE', label: 'Este Trimestre' },
        { value: 'ESTE_ANIO', label: 'Este Año' },
        { value: 'ANIO_MAS_1', label: 'Año +1' },
        { value: 'FUTURO_LEJANO', label: 'Futuro Lejano' },
        { value: 'SIN_FECHA', label: 'Sin fecha' },
      ],
      extractValues: (r) => r.urgency.bucket,
    },
  ];

  const searchOptions = {
    getSearchableText: (row: CampaignTiempoRow): string => {
      const cong = getConglomeradoForProgram(row.program, vinculos, conglomerados);
      const vinculo = row.program.id_vinculo
        ? vinculos.find((v) => v.id === row.program.id_vinculo)
        : undefined;
      const certsAndSites = row.certBreakdowns
        .map((b) => {
          const siteNames = b.activeSites.map((s) => s.nombre_sitio).join(' ');
          const temporalNames = b.linkedTemporals.map((t) => t.etiqueta).join(' ');
          return `${b.audit.numero_certificado} ${b.audit.organizacion_nombre} ${b.audit.norma_codigo} ${b.audit.codigo_auditoria} ${siteNames} ${temporalNames}`;
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
        certsAndSites,
      ].join(' ');
    },
  };

  const facetGroups = computeReactiveFacetCounts(
    allRows,
    state.query,
    facetCategories,
    state.facetSelections,
    searchOptions
  );

  const filteredRows = filterRecordsWithFacets(
    allRows,
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
        case 'campania':
          return row.program.etiqueta.toLowerCase();
        case 'total':
          return row.campaignGrandTotalDays;
        case 'estado':
          return row.isComplete ? 1 : 0;
        default:
          return row.isComplete ? 1 : 0;
      }
    }
  );

  const columns: ColumnDefinition<CampaignTiempoRow>[] = [
    {
      id: 'campania',
      header: 'Campaña / Vínculo',
      defaultWidthPct: 30,
      minWidthPx: 185,
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
          ? `${vinculo.codigo_vinculo ? `${vinculo.codigo_vinculo} · ` : ''}${dateLabel}`
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
            <div class="flex items-center gap-1.5 text-[11px] text-slate-500 min-w-0">
              <span class="truncate">${escapeHtml(subMeta)}</span>
              <span class="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold border shrink-0 ${row.urgency.badgeClass}">
                ${escapeHtml(row.urgency.label)}
              </span>
            </div>
          </div>
        `;
      },
    },
    {
      id: 'sitios',
      header: 'Sitios',
      defaultWidthPct: 14,
      minWidthPx: 100,
      sortable: false,
      renderCell: (row) => {
        const allocatedCount = Math.max(0, row.totalSitesCount - row.unallocatedSitesTotal);
        return `
          <div class="min-w-0 space-y-0.5 tabular-nums">
            <div class="text-xs font-semibold text-slate-800 whitespace-nowrap">
              ${row.totalSitesCount} sitio${row.totalSitesCount === 1 ? '' : 's'}
            </div>
            <div class="text-[11px] ${
              row.unallocatedSitesTotal > 0 ? 'text-amber-700 font-semibold' : 'text-emerald-700 font-medium'
            } whitespace-nowrap">
              ${allocatedCount} con tiempo
            </div>
          </div>
        `;
      },
    },
    {
      id: 'regular',
      header: 'Días Sitios',
      defaultWidthPct: 14,
      minWidthPx: 95,
      sortable: false,
      align: 'right',
      renderCell: (row) => `
        <span class="font-mono text-xs font-semibold text-slate-800 tabular-nums whitespace-nowrap">
          ${row.campaignRegularDays.toFixed(2)} d
        </span>
      `,
    },
    {
      id: 'temporal',
      header: 'Días Temp.',
      defaultWidthPct: 12,
      minWidthPx: 90,
      sortable: false,
      align: 'right',
      renderCell: (row) =>
        row.campaignTemporalDaysUnique > 0
          ? `<span class="font-mono text-xs font-semibold text-violet-700 tabular-nums whitespace-nowrap">${row.campaignTemporalDaysUnique.toFixed(2)} d</span>`
          : `<span class="font-mono text-xs text-slate-400 tabular-nums">—</span>`,
    },
    {
      id: 'total',
      header: 'Total Camp.',
      defaultWidthPct: 12,
      minWidthPx: 100,
      sortable: true,
      align: 'right',
      renderCell: (row) => `
        <span class="font-mono text-xs font-bold text-slate-900 tabular-nums whitespace-nowrap">
          ${row.campaignGrandTotalDays.toFixed(2)} d
        </span>
      `,
    },
    {
      id: 'estado',
      header: 'Estado',
      defaultWidthPct: 18,
      minWidthPx: 145,
      sortable: true,
      renderCell: (row) => {
        const label = row.isComplete
          ? 'Completo ✓'
          : `Incompleto (${row.unallocatedSitesTotal} en 0d)`;
        const cls = row.isComplete
          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
          : 'bg-amber-50 text-amber-800 border-amber-200';
        return `<span title="${escapeHtml(label)}" class="inline-flex items-center max-w-full truncate px-2 py-0.5 rounded-full text-[11px] font-bold border ${cls}">${escapeHtml(label)}</span>`;
      },
    },
  ];

  const renderCard = (row: CampaignTiempoRow): string => {
    const activeAudits = row.program.auditorias.filter((a) => !a.deleted_at);
    const latestPlanned = resolveProgramLatestPlannedDate(activeAudits);
    const dateLabel = formatDateSummaryCompact(latestPlanned);
    const allocatedCount = Math.max(0, row.totalSitesCount - row.unallocatedSitesTotal);

    return `
      <article
        role="button"
        tabindex="0"
        data-action="select-tiempo-program"
        data-program-id="${escapeHtml(row.program.id)}"
        aria-label="Gestionar tiempo de auditoría para ${escapeHtml(row.program.etiqueta)}"
        class="text-left bg-white border border-slate-200 hover:border-slate-400 rounded-xl p-3.5 shadow-2xs transition-all cursor-pointer space-y-2.5 flex flex-col justify-between"
      >
        <div class="space-y-1.5">
          <div class="flex items-center justify-between gap-2">
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${
              row.isComplete
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-amber-50 text-amber-800 border-amber-200'
            }">
              ${row.isComplete ? 'Completo ✓' : `Incompleto (${row.unallocatedSitesTotal} en 0d)`}
            </span>
            <span class="font-mono text-xs font-bold text-slate-900 tabular-nums">
              ${row.campaignGrandTotalDays.toFixed(2)} d
            </span>
          </div>
          <h3 class="text-sm font-bold text-slate-900 line-clamp-2">${escapeHtml(row.program.etiqueta)}</h3>
          <div class="flex items-center gap-1.5 flex-wrap text-[11px] text-slate-500">
            <span>${escapeHtml(dateLabel)}</span>
            <span class="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold border ${row.urgency.badgeClass}">
              ${escapeHtml(row.urgency.label)}
            </span>
          </div>
        </div>
        <div class="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px] tabular-nums">
          <span class="text-slate-600 font-medium">
            Reg: <strong class="font-mono text-slate-900">${row.campaignRegularDays.toFixed(2)}d</strong>
            ${
              row.campaignTemporalDaysUnique > 0
                ? ` · Temp: <strong class="font-mono text-violet-700">${row.campaignTemporalDaysUnique.toFixed(2)}d</strong>`
                : ''
            }
          </span>
          <span class="text-slate-500 font-semibold">${allocatedCount}/${row.totalSitesCount} sitios</span>
        </div>
      </article>
    `;
  };

  const emptyStateActionsHtml = `
    <div class="flex flex-wrap items-center justify-center gap-2">
      <button
        type="button"
        data-nav="auditorias"
        data-subview="designacion/tipo"
        class="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
      >
        Paso 3: Tipo
      </button>
      <button
        type="button"
        data-nav="auditorias"
        data-subview="designacion/sitio"
        class="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer inline-flex items-center gap-1.5"
      >
        <span>Ir a Paso 4: Sitio</span>
        <span aria-hidden="true">→</span>
      </button>
    </div>
  `;

  const archiveProps = extractUniversalArchiveProps(archiveConfig, 'programacion');

  return renderUniversalTemplate<CampaignTiempoRow>({
    domainKey: 'tiempo',
    tableId: 'tiempo-main',
    title: 'Auditoría → Tiempo (0.25d)',
    subtitle:
      'Presupuesto de días-auditor en pasos exactos de 0.25d por sitio regular con resumen integrado de Sitios Temporales (Paso 5) sin doble conteo.',
    entityLabel: 'campañas listas para tiempo',
    searchQuery: state.query,
    searchPlaceholder: 'Buscar por campaña, certificado, organización o sitio...',
    searchInputId: 'tiempoSearchInput',
    clearSearchBtnId: 'clearTiempoSearchBtn',
    totalCount: allRows.length,
    filteredCount: sortedRows.length,
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen,
    sortState: { column: state.sortColumn, direction: state.sortDirection },
    columnWidths: tableColumnWidths?.['tiempo-main'],
    facetGroups,
    items: sortedRows,
    columns,
    getRowAttrs: (row) =>
      `data-action="select-tiempo-program" data-program-id="${escapeHtml(row.program.id)}" title="Asignar tiempo de auditoría a ${escapeHtml(row.program.etiqueta)}"`,
    renderCard,
    loading,
    emptyStateTitle:
      allRows.length === 0
        ? 'No hay campañas con Pasos 3 y 4 completos'
        : 'No se encontraron campañas en Tiempo',
    emptyStateMessage:
      allRows.length === 0
        ? 'Para habilitar Paso 6 (Tiempo), complete primero Paso 3 (Tipo y Fecha planificada) y seleccione al menos 1 sitio permanente en Paso 4 (Sitio).'
        : 'Intente ajustar la búsqueda o restablecer los filtros de la barra lateral.',
    emptyStateActionHtml: allRows.length === 0 ? emptyStateActionsHtml : '',
    ...archiveProps,
  });
}

function renderTiempoDetailView(opts: {
  state: TiempoViewState;
  row: CampaignTiempoRow;
  vinculos: ReadonlyArray<VinculoEntity>;
  conglomerados: ReadonlyArray<ConglomeradoEntity>;
  isStaff: boolean;
}): string {
  const { state, row, vinculos, conglomerados, isStaff } = opts;
  const { program } = row;
  const vinculo = program.id_vinculo
    ? vinculos.find((v) => !v.deleted_at && v.id === program.id_vinculo)
    : undefined;
  const cong = getConglomeradoForProgram(program, vinculos, conglomerados);

  const uniqueSharedTemporalsCount = row.certBreakdowns.reduce((set, b) => {
    for (const t of b.linkedTemporals) {
      const activeCertsCount = t.certificados.filter((c) => !c.deleted_at).length;
      if (activeCertsCount > 1) set.add(t.id);
    }
    return set;
  }, new Set<string>()).size;

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

  const hasTemporalInCampaign = hasCampaignTemporalSites(row);

  const renderCrossStepLinks = (idPrefix: string): string => `
    <div class="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
      <button
        type="button"
        id="${idPrefix}_step4"
        data-nav="auditorias"
        data-subview="designacion/sitio"
        data-parent-nav="true"
        data-parent-type="programa_auditoria"
        data-entity-id="${escapeHtml(program.id)}"
        class="px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-indigo-50 text-slate-700 hover:text-indigo-800 transition-colors cursor-pointer whitespace-nowrap"
      >
        ← Paso 4: Sitio
      </button>
      ${
        hasTemporalInCampaign
          ? `
            <button
              type="button"
              id="${idPrefix}_step5"
              data-nav="auditorias"
              data-subview="designacion/temporal"
              data-parent-nav="true"
              data-parent-type="programa_auditoria"
              data-entity-id="${escapeHtml(program.id)}"
              class="px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-violet-50 text-slate-700 hover:text-violet-800 transition-colors cursor-pointer whitespace-nowrap"
            >
              ← Paso 5: Temporal
            </button>
          `
          : ''
      }
      <span class="px-2.5 py-1 rounded-md bg-slate-900 text-white font-bold whitespace-nowrap">
        Paso 6 · Tiempo (Activo)
      </span>
      <button
        type="button"
        id="${idPrefix}_step7"
        data-nav="auditorias"
        data-subview="asignacion"
        data-parent-nav="true"
        data-parent-type="programa_auditoria"
        data-entity-id="${escapeHtml(program.id)}"
        class="px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-indigo-50 text-slate-700 hover:text-indigo-800 transition-colors cursor-pointer whitespace-nowrap"
      >
        Paso 7: Asignación →
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
      ${renderCrossStepLinks('step6TopNav')}
      <span class="text-[11px] font-semibold text-slate-500 tabular-nums whitespace-nowrap">
        ${row.totalSitesCount - row.unallocatedSitesTotal}/${row.totalSitesCount} sitios con tiempo · ${row.campaignGrandTotalDays.toFixed(2)} d totales
      </span>
    </div>
  `;

  const feedbackHtml = state.editErrorMessage
    ? `
      <div role="alert" class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800 flex items-center gap-2">
        <span aria-hidden="true">⚠️</span>
        <span>${escapeHtml(state.editErrorMessage)}</span>
      </div>
    `
    : '';

  const summaryBannerHtml = `
    <section
      data-testid="tiempo-summary-banner"
      class="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 via-white to-violet-50/40 p-4 shadow-2xs space-y-2.5"
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2 text-xs sm:text-sm tabular-nums">
          <div class="px-3 py-1.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
            <span class="text-slate-500 font-medium">Sitios Regulares:</span>
            <strong class="font-mono text-slate-900 ml-1">${row.campaignRegularDays.toFixed(2)} d</strong>
          </div>
          <span class="font-bold text-slate-400" aria-hidden="true">+</span>
          <div class="px-3 py-1.5 rounded-xl bg-white border border-violet-200 shadow-2xs">
            <span class="text-violet-700 font-medium">Sitios Temporales (Paso 5):</span>
            <strong class="font-mono text-violet-900 ml-1">${row.campaignTemporalDaysUnique.toFixed(2)} d</strong>
          </div>
          <span class="font-bold text-slate-400" aria-hidden="true">=</span>
          <div class="px-3.5 py-1.5 rounded-xl bg-slate-900 text-white shadow-2xs">
            <span class="text-slate-300 font-medium">Total Campaña:</span>
            <strong class="font-mono font-bold ml-1">${row.campaignGrandTotalDays.toFixed(2)} días-auditor</strong>
          </div>
        </div>

        <div class="flex items-center gap-2">
          ${
            !isStaff
              ? '<span class="px-2.5 py-1 rounded-md bg-slate-200 text-slate-700 text-[11px] font-bold whitespace-nowrap">Solo lectura</span>'
              : row.isComplete
              ? '<span class="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold whitespace-nowrap">Todos los sitios asignados ✓</span>'
              : `<span class="px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-bold whitespace-nowrap">${row.unallocatedSitesTotal} sitio${row.unallocatedSitesTotal === 1 ? '' : 's'} pendiente${row.unallocatedSitesTotal === 1 ? '' : 's'} (0.00 d)</span>`
          }
        </div>
      </div>

      ${
        uniqueSharedTemporalsCount > 0
          ? `
            <p class="text-[11px] text-violet-800 bg-violet-50/80 border border-violet-200/80 rounded-lg px-2.5 py-1.5">
              Nota de consolidación: ${uniqueSharedTemporalsCount} sitio${
              uniqueSharedTemporalsCount === 1 ? '' : 's'
            } temporal${
              uniqueSharedTemporalsCount === 1 ? '' : 'es'
            } compartido${
              uniqueSharedTemporalsCount === 1 ? '' : 's'
            } entre múltiples certificados se contabiliza${
              uniqueSharedTemporalsCount === 1 ? '' : 'n'
            } una sola vez en el Total Campaña (sin doble conteo).
            </p>
          `
          : ''
      }
    </section>
  `;

  const renderSiteRow = (audit: ProgramacionAuditEntity, site: AuditoriaSitioPlanItem): string => {
    const isHq = site.numero_sitio === 0;
    const isSaving = state.savingSitePlanId === site.id;
    const draftStr =
      state.draftTimeBySitePlanId[site.id] !== undefined
        ? state.draftTimeBySitePlanId[site.id]
        : (site.tiempo_auditoria || 0).toFixed(2);
    const currentModality: SiteEvaluationModality = site.modalidad_evaluacion || 'Presencial';
    const isUnallocated = (site.tiempo_auditoria || 0) <= 0;

    return `
      <div
        data-testid="tiempo-site-row"
        data-site-plan-id="${escapeHtml(site.id)}"
        class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5 rounded-xl border px-3 py-2.5 transition-colors ${
          isUnallocated ? 'border-amber-200 bg-amber-50/30' : 'border-slate-200 bg-white'
        }"
      >
        <div class="min-w-0 space-y-0.5 flex-1">
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="px-1.5 py-0.2 rounded text-[10px] font-bold border ${
              isHq
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-slate-100 text-slate-700 border-slate-200'
            } whitespace-nowrap">
              ${isHq ? 'Sitio 0 · HQ' : `Sitio ${site.numero_sitio}`}
            </span>
            <span class="text-xs font-bold text-slate-900 truncate">
              ${escapeHtml(site.nombre_sitio)}
            </span>
            ${
              isUnallocated
                ? '<span class="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 whitespace-nowrap">Pendiente 0d</span>'
                : ''
            }
          </div>
          ${
            site.direccion_sitio
              ? `<p class="text-[11px] text-slate-500 truncate">${escapeHtml(site.direccion_sitio)}</p>`
              : ''
          }
        </div>

        <div class="flex flex-wrap items-center gap-2 shrink-0">
          ${
            isStaff
              ? `
                <label class="sr-only" for="tiempoModality_${escapeHtml(site.id)}">
                  Modalidad de evaluación para ${escapeHtml(site.nombre_sitio)}
                </label>
                <select
                  id="tiempoModality_${escapeHtml(site.id)}"
                  data-action="change-tiempo-site-modality"
                  data-site-plan-id="${escapeHtml(site.id)}"
                  data-audit-id="${escapeHtml(audit.id)}"
                  data-site-name="${escapeHtml(site.nombre_sitio)}"
                  ${isSaving ? 'disabled' : ''}
                  aria-label="Modalidad de evaluación para ${escapeHtml(site.nombre_sitio)}"
                  class="h-8 rounded-lg border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-700 focus:border-indigo-500 focus:outline-none disabled:opacity-60 cursor-pointer"
                >
                  ${MODALITY_OPTIONS.map(
                    (mod) => `
                      <option value="${mod}" ${currentModality === mod ? 'selected' : ''}>
                        ${mod}
                      </option>
                    `
                  ).join('')}
                </select>

                <div class="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg p-0.5">
                  <button
                    type="button"
                    data-action="step-tiempo-site-days"
                    data-site-plan-id="${escapeHtml(site.id)}"
                    data-audit-id="${escapeHtml(audit.id)}"
                    data-site-name="${escapeHtml(site.nombre_sitio)}"
                    data-current-days="${(site.tiempo_auditoria || 0).toFixed(2)}"
                    data-delta="-0.25"
                    ${isSaving || (site.tiempo_auditoria || 0) <= 0 ? 'disabled' : ''}
                    aria-label="Restar 0.25 días a ${escapeHtml(site.nombre_sitio)}"
                    class="h-7 px-2 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-bold text-slate-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed tabular-nums"
                  >
                    -0.25
                  </button>
                  <label class="sr-only" for="tiempoDaysInput_${escapeHtml(site.id)}">
                    Días-auditor para ${escapeHtml(site.nombre_sitio)}
                  </label>
                  <input
                    id="tiempoDaysInput_${escapeHtml(site.id)}"
                    type="number"
                    min="0"
                    step="0.25"
                    data-action="change-tiempo-site-days"
                    data-site-plan-id="${escapeHtml(site.id)}"
                    data-audit-id="${escapeHtml(audit.id)}"
                    data-site-name="${escapeHtml(site.nombre_sitio)}"
                    value="${escapeHtml(draftStr)}"
                    ${isSaving ? 'disabled' : ''}
                    aria-label="Días-auditor para ${escapeHtml(site.nombre_sitio)}"
                    class="w-20 h-7 rounded-md border border-slate-300 bg-white px-1.5 text-xs font-mono font-bold text-slate-900 text-center tabular-nums focus:border-indigo-500 focus:outline-none disabled:opacity-60"
                  />
                  <button
                    type="button"
                    data-action="step-tiempo-site-days"
                    data-site-plan-id="${escapeHtml(site.id)}"
                    data-audit-id="${escapeHtml(audit.id)}"
                    data-site-name="${escapeHtml(site.nombre_sitio)}"
                    data-current-days="${(site.tiempo_auditoria || 0).toFixed(2)}"
                    data-delta="0.25"
                    ${isSaving ? 'disabled' : ''}
                    aria-label="Sumar 0.25 días a ${escapeHtml(site.nombre_sitio)}"
                    class="h-7 px-2 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-bold text-slate-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed tabular-nums"
                  >
                    +0.25
                  </button>
                </div>
              `
              : `
                <span class="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-semibold">
                  ${escapeHtml(currentModality)}
                </span>
                <span class="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-900 text-white tabular-nums">
                  ${(site.tiempo_auditoria || 0).toFixed(2)} d
                </span>
              `
          }
        </div>
      </div>
    `;
  };

  const renderCertificateBreakdownCard = (breakdown: CertTiempoBreakdown): string => {
    const { audit, activeSites, regularDaysTotal, linkedTemporals, linkedTemporalDaysTotal } =
      breakdown;

    return `
      <section
        data-testid="tiempo-cert-card"
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
            <div class="text-[11px] text-slate-500 tabular-nums">
              ${activeSites.length} sitio${activeSites.length === 1 ? '' : 's'} seleccionado${
                activeSites.length === 1 ? '' : 's'
              } en Paso 4
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2 shrink-0">
            <span class="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-800 tabular-nums">
              Total certificado: <strong class="font-mono text-slate-900">${regularDaysTotal.toFixed(2)} d</strong>
            </span>
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${
              breakdown.isComplete
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-amber-50 text-amber-800 border-amber-200'
            } whitespace-nowrap">
              ${
                breakdown.isComplete
                  ? 'Completo ✓'
                  : `${breakdown.unallocatedSitesCount} en 0d`
              }
            </span>
          </div>
        </header>

        <div class="p-3 sm:p-3.5 space-y-2">
          ${activeSites.map((site) => renderSiteRow(audit, site)).join('')}
        </div>

        ${
          linkedTemporals.length > 0
            ? `
              <footer class="border-t border-violet-100 bg-violet-50/40 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
                <div class="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span class="font-bold text-violet-900">
                    Sitios Temporales vinculados (${linkedTemporalDaysTotal.toFixed(2)} d):
                  </span>
                  ${linkedTemporals
                    .map((t) => {
                      const sharedCount = t.certificados.filter((c) => !c.deleted_at).length;
                      const sharedText =
                        sharedCount > 1 ? ` (compartido en ${sharedCount} certs)` : '';
                      return `
                        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-violet-200 text-violet-900 font-semibold tabular-nums">
                          <span>${escapeHtml(t.etiqueta)}:</span>
                          <strong class="font-mono">${t.tiempo_auditoria.toFixed(2)} d</strong>
                          ${sharedText ? `<span class="text-violet-600 font-normal">${escapeHtml(sharedText)}</span>` : ''}
                        </span>
                      `;
                    })
                    .join('')}
                </div>
                <button
                  type="button"
                  data-nav="auditorias"
                  data-subview="designacion/temporal"
                  data-parent-nav="true"
                  data-parent-type="programa_auditoria"
                  data-entity-id="${escapeHtml(program.id)}"
                  class="text-[11px] font-bold text-violet-800 hover:text-violet-950 underline-offset-2 hover:underline cursor-pointer whitespace-nowrap"
                >
                  Editar en Temporal →
                </button>
              </footer>
            `
            : ''
        }
      </section>
    `;
  };

  const customRecordBodyHtml = `
    <div class="space-y-4">
      ${summaryBannerHtml}
      <div class="space-y-3">
        ${row.certBreakdowns.map((b) => renderCertificateBreakdownCard(b)).join('')}
      </div>

      <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
        <span class="text-[11px] text-slate-500">
          Una vez asignados los días de cada sitio en múltiplos de 0.25d, continúe hacia Asignación de Equipo o Programa.
        </span>
        <div class="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
          ${
            hasTemporalInCampaign
              ? `
                <button
                  type="button"
                  id="step6BottomNav_step5"
                  data-nav="auditorias"
                  data-subview="designacion/temporal"
                  data-parent-nav="true"
                  data-parent-type="programa_auditoria"
                  data-entity-id="${escapeHtml(program.id)}"
                  class="px-3 py-1.5 rounded-lg border border-violet-200 bg-violet-50 hover:bg-violet-100 text-violet-800 transition-colors cursor-pointer whitespace-nowrap"
                >
                  Editar en Temporal →
                </button>
              `
              : ''
          }
          <button
            type="button"
            id="step6BottomNav_step7"
            data-nav="auditorias"
            data-subview="asignacion"
            data-parent-nav="true"
            data-parent-type="programa_auditoria"
            data-entity-id="${escapeHtml(program.id)}"
            class="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white transition-colors cursor-pointer whitespace-nowrap"
          >
            Ir a Paso 7: Asignación →
          </button>
          <button
            type="button"
            id="step6BottomNav_step8"
            data-nav="auditorias"
            data-subview="programa"
            data-parent-nav="true"
            data-parent-type="programa_auditoria"
            data-entity-id="${escapeHtml(program.id)}"
            class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 transition-colors cursor-pointer whitespace-nowrap"
          >
            Ir a Paso 8: Programa →
          </button>
        </div>
      </div>
    </div>
  `;

  return renderDetailPageTemplate({
    entityType: 'Auditoría → Tiempo',
    entitySymbol: '⏳',
    title: program.etiqueta,
    eyebrowCode: program.codigo_programa || undefined,
    subtitle: `${program.tipo_vinculacion} · ${row.certBreakdowns.length} certificado${
      row.certBreakdowns.length === 1 ? '' : 's'
    } · ${row.campaignGrandTotalDays.toFixed(2)} d totales`,
    statusBadge: {
      label: row.isComplete
        ? 'Completo ✓'
        : `Incompleto (${row.unallocatedSitesTotal} en 0d)`,
      badgeClass: row.isComplete
        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
        : 'bg-amber-50 text-amber-800 border-amber-200',
    },
    backButton: {
      label: 'Volver',
      nav: 'auditorias',
      subview: 'tiempo',
      action: 'back-to-tiempo-list',
    },
    parents,
    parentMetaHtml,
    tableName: 'programa_auditoria',
    recordId: program.id,
    feedbackHtml,
    attributes: [],
    customRecordBodyHtml,
  });
}
