import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import type { ConglomeradoEntity } from '../lib/conglomeradoDomain';
import type { VinculoEntity } from '../lib/vinculoDomain';
import {
  formatAuditDateLabel,
  resolveLatestPlannedDate,
  roundAuditDaysQuarter,
  type AuditDateEntry,
  type ProgramaAuditoriaEntity,
} from '../lib/auditPlanningEngine';
import type { ProgramacionAuditEntity } from '../lib/auditExecution';
import {
  computeCampaignTemporalRows,
  getTemporalPendingStatusMeta,
  type AuditoriaSitioTemporalEntity,
  type CampaignTemporalRow,
  type TemporalSiteFormDraft,
} from '../lib/designacionTemporalDomain';
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

export type DesignacionTemporalSortColumn = 'campania' | 'tiempo' | 'estado';

export interface DesignacionTemporalViewState {
  query: string;
  viewMode: UniversalViewMode;
  isSidebarOpen: boolean;
  sortColumn: DesignacionTemporalSortColumn | null;
  sortDirection: SortDirection;
  facetSelections: MultiViewSelectionMap;
  selectedProgramId: string | null;
  isCreatingTemporalSite: boolean;
  editingTemporalSiteId: string | null;
  confirmArchiveTemporalId: string | null;
  formDraft?: TemporalSiteFormDraft;
  editErrorMessage: string | null;
  saving: boolean;
}

export interface DesignacionTemporalViewProps {
  profile: UserProfile;
  state: DesignacionTemporalViewState;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  temporalSites: ReadonlyArray<AuditoriaSitioTemporalEntity>;
  vinculos: ReadonlyArray<VinculoEntity>;
  conglomerados: ReadonlyArray<ConglomeradoEntity>;
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
  if (planned.length > 0) return planned[0];

  const fallbackAnyDate = active
    .map((a) => {
      if (a.latestDate && !a.latestDate.deleted_at) return a.latestDate;
      const activeFechas = (a.fechas || [])
        .filter((f) => !f.deleted_at)
        .sort((x, y) => y.numero_secuencia - x.numero_secuencia);
      return activeFechas[0] ?? null;
    })
    .filter((d): d is AuditDateEntry => d !== null)
    .sort((a, b) => b.numero_secuencia - a.numero_secuencia);
  return fallbackAnyDate[0] ?? null;
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

function countCoveredCertificates(row: CampaignTemporalRow): number {
  const certAuditIds = new Set<string>();
  for (const t of row.temporalSites) {
    if (t.deleted_at) continue;
    for (const c of t.certificados) {
      if (!c.deleted_at && c.id_auditoria_certificado) {
        certAuditIds.add(c.id_auditoria_certificado);
      }
    }
  }
  return certAuditIds.size;
}

export function renderDesignacionTemporalView(props: DesignacionTemporalViewProps): string {
  const {
    profile,
    state,
    programs,
    temporalSites,
    vinculos,
    conglomerados,
    loading,
    archiveConfig,
    tableColumnWidths,
    inCardBreadcrumbHtml = '',
    headerAddAuditHtml = '',
  } = props;

  const isStaff = isApprovedStaffProfile(profile);
  const activeConglomerados = conglomerados.filter((g) => !g.deleted_at);
  const activeVinculos = vinculos.filter((v) => !v.deleted_at);
  const allRows = computeCampaignTemporalRows(programs, temporalSites);

  if (state.selectedProgramId) {
    const selectedRow = allRows.find((r) => r.program.id === state.selectedProgramId);
    if (selectedRow) {
      return renderStep5DetailView({
        state,
        row: selectedRow,
        vinculos: activeVinculos,
        conglomerados: activeConglomerados,
        isStaff,
        inCardBreadcrumbHtml,
        headerAddAuditHtml,
      });
    }
  }

  return renderStep5MultiView({
    state,
    allRows,
    vinculos: activeVinculos,
    conglomerados: activeConglomerados,
    loading,
    archiveConfig,
    tableColumnWidths,
    headerAddAuditHtml,
  });
}

function renderStep5MultiView(opts: {
  state: DesignacionTemporalViewState;
  allRows: ReadonlyArray<CampaignTemporalRow>;
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

  const facetCategories: MultiViewFacetCategory<CampaignTemporalRow>[] = [
    {
      id: 'pendientes',
      label: 'Pendientes',
      options: [
        { value: 'SIN_SITIO_TEMPORAL', label: 'Sin sitio configurado' },
        { value: 'SIN_TIEMPO', label: 'Sin tiempo asignado' },
        { value: 'SIN_AUDITORES', label: 'Sin auditores asignados' },
        { value: 'COMPLETO', label: 'Completo' },
      ],
      extractValues: (r) => r.pendingStatus,
    },
  ];

  const searchOptions = {
    getSearchableText: (row: CampaignTemporalRow): string => {
      const cong = getConglomeradoForProgram(row.program, vinculos, conglomerados);
      const vinculo = row.program.id_vinculo
        ? vinculos.find((v) => v.id === row.program.id_vinculo)
        : undefined;
      const auditsText = row.program.auditorias
        .filter((a) => !a.deleted_at)
        .map(
          (a) =>
            `${a.numero_certificado} ${a.organizacion_nombre} ${a.norma_codigo} ${a.codigo_auditoria}`
        )
        .join(' ');
      const temporalsText = row.temporalSites
        .map((t) => `${t.etiqueta} ${t.comentario || ''}`)
        .join(' ');
      return [
        row.program.etiqueta,
        row.program.codigo_programa || '',
        row.program.tipo_vinculacion,
        vinculo?.etiqueta || '',
        vinculo?.codigo_vinculo || '',
        cong.nombre,
        auditsText,
        temporalsText,
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

  const statusOrder: Record<CampaignTemporalRow['pendingStatus'], number> = {
    SIN_SITIO_TEMPORAL: 0,
    SIN_TIEMPO: 1,
    SIN_AUDITORES: 2,
    COMPLETO: 3,
  };

  const sortedRows = sortItems(
    filteredRows,
    state.sortColumn,
    state.sortDirection,
    (row, col) => {
      switch (col) {
        case 'campania':
          return row.program.etiqueta.toLowerCase();
        case 'tiempo':
          return row.totalTemporalDays;
        case 'estado':
          return statusOrder[row.pendingStatus];
        default:
          return statusOrder[row.pendingStatus];
      }
    }
  );

  const columns: ColumnDefinition<CampaignTemporalRow>[] = [
    {
      id: 'campania',
      header: 'Campaña / Vínculo',
      defaultWidthPct: 31,
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
      id: 'temporales',
      header: 'Sitios Temporales',
      defaultWidthPct: 24,
      minWidthPx: 165,
      sortable: false,
      renderCell: (row) => {
        if (row.temporalSites.length === 0) {
          return `<span class="text-xs font-medium text-slate-400">Sin configurar</span>`;
        }
        const labels = row.temporalSites.map((t) => t.etiqueta).join(', ');
        return `
          <div class="min-w-0 space-y-0.5">
            <div class="text-xs font-semibold text-slate-800 truncate" title="${escapeHtml(labels)}">
              ${escapeHtml(labels)}
            </div>
            <div class="text-[11px] text-slate-500 tabular-nums">
              ${row.temporalSites.length} sitio${row.temporalSites.length === 1 ? '' : 's'} temporal${
          row.temporalSites.length === 1 ? '' : 'es'
        }
            </div>
          </div>
        `;
      },
    },
    {
      id: 'tiempo',
      header: 'Tiempo Total',
      defaultWidthPct: 13,
      minWidthPx: 105,
      sortable: true,
      align: 'right',
      renderCell: (row) => `
        <span class="font-mono text-xs font-bold text-slate-900 tabular-nums">
          ${row.totalTemporalDays.toFixed(2)} d
        </span>
      `,
    },
    {
      id: 'certificados',
      header: 'Certs. Asociados',
      defaultWidthPct: 17,
      minWidthPx: 145,
      sortable: false,
      renderCell: (row) => {
        const coveredCount = countCoveredCertificates(row);
        return `
          <span class="text-xs font-semibold text-slate-700 tabular-nums">
            ${coveredCount} cert${coveredCount === 1 ? '' : 's'} cubiertos
          </span>
        `;
      },
    },
    {
      id: 'estado',
      header: 'Estado',
      defaultWidthPct: 15,
      minWidthPx: 120,
      sortable: true,
      renderCell: (row) => {
        const meta = getTemporalPendingStatusMeta(row.pendingStatus);
        return `
          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${meta.badgeClass}">
            ${escapeHtml(meta.shortLabel)}
          </span>
        `;
      },
    },
  ];

  const renderCard = (row: CampaignTemporalRow): string => {
    const meta = getTemporalPendingStatusMeta(row.pendingStatus);
    const coveredCount = countCoveredCertificates(row);
    const activeAudits = row.program.auditorias.filter((a) => !a.deleted_at);
    const latestPlanned = resolveProgramLatestPlannedDate(activeAudits);
    const dateLabel = formatDateSummaryCompact(latestPlanned);

    return `
      <article
        role="button"
        tabindex="0"
        data-action="select-step5-program"
        data-program-id="${escapeHtml(row.program.id)}"
        aria-label="Gestionar sitios temporales para ${escapeHtml(row.program.etiqueta)}"
        class="text-left bg-white border border-slate-200 hover:border-slate-400 rounded-xl p-3.5 shadow-2xs transition-all cursor-pointer space-y-2.5 flex flex-col justify-between"
      >
        <div class="space-y-1.5">
          <div class="flex items-center justify-between gap-2">
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${meta.badgeClass}">
              ${escapeHtml(meta.shortLabel)}
            </span>
            <span class="font-mono text-xs font-bold text-slate-900 tabular-nums">
              ${row.totalTemporalDays.toFixed(2)} d
            </span>
          </div>
          <h3 class="text-sm font-bold text-slate-900 line-clamp-2">${escapeHtml(row.program.etiqueta)}</h3>
          <p class="text-[11px] text-slate-500 truncate">${escapeHtml(dateLabel)} · ${escapeHtml(row.program.tipo_vinculacion)}</p>
        </div>
        <div class="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px]">
          <span class="font-semibold text-slate-700 tabular-nums">
            ${
              row.temporalSites.length === 0
                ? 'Sin configurar'
                : `${row.temporalSites.length} temporal${row.temporalSites.length === 1 ? '' : 'es'}`
            }
          </span>
          <span class="text-slate-500 font-medium tabular-nums">${coveredCount} cert${coveredCount === 1 ? '' : 's'}</span>
        </div>
      </article>
    `;
  };

  const goStep4BtnHtml = `
    <button
      type="button"
      data-nav="auditorias"
      data-subview="designacion/sitio"
      data-action="go-step4-for-temporal"
      class="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer inline-flex items-center gap-1.5"
    >
      <span>Ir a Paso 4: Sitio</span>
      <span aria-hidden="true">→</span>
    </button>
  `;

  const archiveProps = extractUniversalArchiveProps(archiveConfig, 'programacion');

  return renderUniversalTemplate<CampaignTemporalRow>({
    domainKey: 'designacion-temporal',
    tableId: 'designacion-temporal-main',
    title: 'Designación → Sitios Temporales',
    subtitle:
      'Configuración de obras, proyectos y sitios temporales en pasos de 0.25 días con atribución M:N a certificados de la campaña.',
    entityLabel: 'campañas con temporal',
    searchQuery: state.query,
    searchPlaceholder: 'Buscar por campaña, sitio temporal, certificado u organización...',
    searchInputId: 'designacion-temporalSearchInput',
    clearSearchBtnId: 'clearDesignacionTemporalSearchBtn',
    totalCount: allRows.length,
    filteredCount: sortedRows.length,
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen,
    sortState: { column: state.sortColumn, direction: state.sortDirection },
    columnWidths: tableColumnWidths?.['designacion-temporal-main'],
    facetGroups,
    items: sortedRows,
    columns,
    getRowAttrs: (row) =>
      `data-action="select-step5-program" data-program-id="${escapeHtml(row.program.id)}" title="Gestionar sitios temporales de ${escapeHtml(row.program.etiqueta)}"`,
    renderCard,
    actionsHtml: headerAddAuditHtml,
    loading,
    emptyStateTitle:
      allRows.length === 0
        ? 'No hay campañas activas con Sitio Temporal'
        : 'No se encontraron campañas con temporal',
    emptyStateMessage:
      allRows.length === 0
        ? 'Para habilitar Paso 5 (Temporal), active primero el indicador "¿Incluye Sitio Temporal / Proyecto?" dentro de Paso 4: Sitio en una campaña con Paso 3 completo.'
        : 'Intente ajustar el término de búsqueda o restablecer los filtros de la barra lateral.',
    emptyStateActionHtml: allRows.length === 0 ? goStep4BtnHtml : '',
    ...archiveProps,
  });
}

function renderStep5DetailView(opts: {
  state: DesignacionTemporalViewState;
  row: CampaignTemporalRow;
  vinculos: ReadonlyArray<VinculoEntity>;
  conglomerados: ReadonlyArray<ConglomeradoEntity>;
  isStaff: boolean;
  inCardBreadcrumbHtml?: string;
  headerAddAuditHtml?: string;
}): string {
  const { state, row, vinculos, conglomerados, isStaff } = opts;
  const { program } = row;
  const activeAudits = program.auditorias.filter((a) => !a.deleted_at);
  const temporalAnchorAudits = activeAudits.filter((a) => a.tiene_sitio_temporal === true);
  const vinculo = program.id_vinculo
    ? vinculos.find((v) => !v.deleted_at && v.id === program.id_vinculo)
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
      <span class="px-2.5 py-1 rounded-md bg-slate-900 text-white font-bold whitespace-nowrap">
        Paso 5 · Temporal (Activo)
      </span>
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
      ${renderCrossStepLinks('step5TopNav')}
      <span class="text-[11px] font-semibold text-slate-500 tabular-nums whitespace-nowrap">
        ${row.temporalSites.length} sitio${row.temporalSites.length === 1 ? '' : 's'} temporal${
    row.temporalSites.length === 1 ? '' : 'es'
  } · ${row.totalTemporalDays.toFixed(2)} d
      </span>
    </div>
  `;

  const errorBannerHtml = state.editErrorMessage
    ? `
      <div role="alert" class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800 flex items-center gap-2">
        <span aria-hidden="true">⚠️</span>
        <span>${escapeHtml(state.editErrorMessage)}</span>
      </div>
    `
    : '';

  const isFormOpen = isStaff && (state.isCreatingTemporalSite || Boolean(state.editingTemporalSiteId));
  const editingSite = state.editingTemporalSiteId
    ? row.temporalSites.find((t) => t.id === state.editingTemporalSiteId)
    : undefined;
  const draft: TemporalSiteFormDraft = state.formDraft ?? {
    id_auditoria: row.anchorAudit.id,
    etiqueta: 'Sitio Temporal',
    comentario: '',
    tiempo_auditoria: 1.0,
    targetAuditCertIds: activeAudits.map((a) => a.id),
  };

  const statusMeta = getTemporalPendingStatusMeta(row.pendingStatus);

  const formHtml = isFormOpen
    ? `
      <form
        id="temporalSiteForm"
        data-action="submit-temporal-site-form"
        data-program-id="${escapeHtml(program.id)}"
        ${editingSite ? `data-editing-temporal-id="${escapeHtml(editingSite.id)}"` : ''}
        class="rounded-2xl border border-indigo-200 bg-indigo-50/30 p-4 space-y-4"
      >
        <div class="flex items-center justify-between gap-2 border-b border-indigo-100 pb-2.5">
          <div>
            <h2 class="text-sm font-bold text-slate-900">
              ${editingSite ? `Editar Sitio Temporal · ${escapeHtml(editingSite.etiqueta)}` : 'Nuevo Sitio Temporal / Proyecto'}
            </h2>
            <p class="text-[11px] text-slate-500">
              Defina la etiqueta (por defecto "Sitio Temporal"), duración en múltiplos de 0.25 días y certificados cubiertos.
            </p>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <div class="space-y-1">
            <label for="temporalAnchorAuditSelect" class="block text-xs font-bold text-slate-700">
              Auditoría Ancla con Temporal Activo <span class="text-rose-600">*</span>
            </label>
            <select
              id="temporalAnchorAuditSelect"
              name="id_auditoria"
              ${editingSite ? 'disabled' : ''}
              class="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-600 disabled:cursor-not-allowed"
            >
              ${temporalAnchorAudits
                .map(
                  (a) => `
                    <option value="${escapeHtml(a.id)}" ${
                      a.id === draft.id_auditoria ? 'selected' : ''
                    }>
                      ${escapeHtml(`${a.numero_certificado} · ${a.organizacion_nombre} (${a.codigo_auditoria})`)}
                    </option>
                  `
                )
                .join('')}
            </select>
          </div>

          <div class="space-y-1">
            <label for="temporalDaysInput" class="block text-xs font-bold text-slate-700">
              Tiempo de Auditoría Temporal (pasos 0.25 d) <span class="text-rose-600">*</span>
            </label>
            <div class="flex items-center gap-1.5">
              <button
                type="button"
                data-action="step-temporal-days"
                data-delta="-0.25"
                aria-label="Restar 0.25 días"
                class="h-9 px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer shrink-0 tabular-nums"
              >
                -0.25d
              </button>
              <input
                type="number"
                id="temporalDaysInput"
                name="tiempo_auditoria"
                min="0.25"
                step="0.25"
                required
                value="${escapeHtml(roundAuditDaysQuarter(draft.tiempo_auditoria || 0.25).toFixed(2))}"
                class="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-mono font-bold text-slate-900 text-center tabular-nums focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                type="button"
                data-action="step-temporal-days"
                data-delta="0.25"
                aria-label="Sumar 0.25 días"
                class="h-9 px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer shrink-0 tabular-nums"
              >
                +0.25d
              </button>
            </div>
          </div>

          <div class="space-y-1">
            <label for="temporalLabelInput" class="block text-xs font-bold text-slate-700">
              Etiqueta del Sitio Temporal
            </label>
            <input
              type="text"
              id="temporalLabelInput"
              name="etiqueta"
              maxlength="120"
              placeholder="Sitio Temporal"
              value="${escapeHtml(draft.etiqueta)}"
              class="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <p class="text-[11px] text-slate-500">Si se deja vacío se asignará "Sitio Temporal".</p>
          </div>

          <div class="space-y-1">
            <label for="temporalCommentInput" class="block text-xs font-bold text-slate-700">
              Comentario / Alcance de Obra o Proyecto
            </label>
            <input
              type="text"
              id="temporalCommentInput"
              name="comentario"
              maxlength="300"
              placeholder="Ej. Proyecto de ampliación nave B / obra activa"
              value="${escapeHtml(draft.comentario)}"
              class="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <fieldset class="space-y-2 border-t border-indigo-100 pt-3">
          <legend class="text-xs font-bold text-slate-800">
            Certificados Asociados en la Campaña <span class="text-rose-600">*</span>
            <span class="font-normal text-slate-500">(mínimo 1 certificado)</span>
          </legend>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            ${activeAudits
              .map((a) => {
                const isChecked = draft.targetAuditCertIds.includes(a.id);
                const chkId = `temporalCertChk_${a.id}`;
                return `
                  <label
                    for="${escapeHtml(chkId)}"
                    class="flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                      isChecked
                        ? 'border-indigo-300 bg-white shadow-2xs'
                        : 'border-slate-200 bg-slate-50/70 hover:bg-white'
                    }"
                  >
                    <input
                      type="checkbox"
                      id="${escapeHtml(chkId)}"
                      name="targetAuditCertIds"
                      value="${escapeHtml(a.id)}"
                      ${isChecked ? 'checked' : ''}
                      class="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0 cursor-pointer"
                    />
                    <span class="min-w-0 flex-1 space-y-0.5">
                      <span class="block font-mono text-xs font-bold text-slate-900 truncate">
                        ${escapeHtml(a.numero_certificado)}
                      </span>
                      <span class="block text-[11px] font-semibold text-slate-700 truncate">
                        ${escapeHtml(a.organizacion_nombre)}
                      </span>
                      <span class="block text-[10px] text-slate-500 truncate">
                        ${escapeHtml(a.norma_codigo)} · ${escapeHtml(a.codigo_auditoria)}
                      </span>
                    </span>
                  </label>
                `;
              })
              .join('')}
          </div>
        </fieldset>

        <div class="flex items-center justify-end gap-2 pt-2 border-t border-indigo-100">
          <button
            type="button"
            data-action="cancel-temporal-site-form"
            ${state.saving ? 'disabled' : ''}
            class="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            ${state.saving ? 'disabled' : ''}
            class="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
          >
            ${state.saving ? 'Guardando...' : editingSite ? 'Guardar Cambios' : 'Crear Sitio Temporal'}
          </button>
        </div>
      </form>
    `
    : '';

  const siteCardsHtml =
    row.temporalSites.length === 0
      ? `
        <div class="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-6 text-center space-y-1.5">
          <p class="text-xs font-bold text-slate-800">No hay sitios temporales registrados en esta campaña</p>
          <p class="text-xs text-slate-500 max-w-md mx-auto">
            La auditoría tiene activo el indicador de Sitio Temporal en Paso 4. Use "+ Agregar Sitio Temporal" arriba para registrar el proyecto con su duración en 0.25d y certificados asociados.
          </p>
        </div>
      `
      : `
        <div class="space-y-3">
          ${row.temporalSites
            .map((site) => {
              const anchor = activeAudits.find((a) => a.id === site.id_auditoria) || row.anchorAudit;
              const activeTeam = site.equipoTemporal.filter((m) => !m.deleted_at);
              const assignedTeamDays = roundAuditDaysQuarter(
                activeTeam.reduce((sum, m) => sum + (m.tiempo_auditoria || 0), 0)
              );
              const activeCerts = site.certificados.filter((c) => !c.deleted_at);
              const isConfirmingArchive = isStaff && state.confirmArchiveTemporalId === site.id;
              const isTeamBalanced =
                site.tiempo_auditoria > 0 && Math.abs(assignedTeamDays - site.tiempo_auditoria) <= 0.001;

              return `
                <article
                  data-testid="temporal-site-card"
                  data-temporal-site-id="${escapeHtml(site.id)}"
                  class="rounded-xl border border-slate-200 bg-white p-3.5 space-y-3 shadow-2xs"
                >
                  <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2.5">
                    <div class="min-w-0 space-y-1">
                      <div class="flex flex-wrap items-center gap-2">
                        <h3 class="text-sm font-bold text-slate-900">${escapeHtml(site.etiqueta)}</h3>
                        <span class="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-slate-900 text-white tabular-nums">
                          ${site.tiempo_auditoria.toFixed(2)} d
                        </span>
                        <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                          isTeamBalanced
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-amber-50 text-amber-800 border-amber-200'
                        } tabular-nums">
                          Equipo: ${assignedTeamDays.toFixed(2)} / ${site.tiempo_auditoria.toFixed(2)} d
                        </span>
                      </div>
                      <p class="text-[11px] text-slate-500">
                        Ancla: <strong class="text-slate-700">${escapeHtml(
                          `${anchor.numero_certificado} · ${anchor.codigo_auditoria}`
                        )}</strong>
                      </p>
                      ${
                        site.comentario
                          ? `<p class="text-xs text-slate-600">${escapeHtml(site.comentario)}</p>`
                          : ''
                      }
                    </div>

                    ${
                      isStaff
                        ? `
                          <div class="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              data-action="edit-temporal-site"
                              data-temporal-site-id="${escapeHtml(site.id)}"
                              class="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              data-action="request-archive-temporal-site"
                              data-temporal-site-id="${escapeHtml(site.id)}"
                              class="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-xs font-semibold text-rose-700 cursor-pointer"
                            >
                              Archivar
                            </button>
                          </div>
                        `
                        : ''
                    }
                  </div>

                  <div class="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
                    <span class="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1">
                      Certificados:
                    </span>
                    ${
                      activeCerts.length === 0
                        ? '<span class="text-[11px] text-rose-600 font-semibold">Sin certificados vinculados</span>'
                        : activeCerts
                            .map(
                              (c) => `
                                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-800 border border-slate-200">
                                  <span class="font-mono font-bold">${escapeHtml(c.numero_certificado)}</span>
                                  <span class="text-slate-500">· ${escapeHtml(c.organizacion_nombre)}</span>
                                </span>
                              `
                            )
                            .join('')
                    }
                  </div>

                  <div class="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 bg-slate-50/70 rounded-lg px-2.5 py-1.5 border border-slate-200/70">
                    <div class="flex flex-wrap items-center gap-1.5">
                      <span class="font-bold text-slate-700">Equipo Temporal:</span>
                      ${
                        activeTeam.length === 0
                          ? '<span class="text-amber-700 font-semibold">Sin auditores asignados (asignar en Paso 7)</span>'
                          : activeTeam
                              .map(
                                (m) => `
                                  <span class="px-1.5 py-0.2 rounded bg-white border border-slate-200 font-medium text-slate-800 tabular-nums">
                                    ${escapeHtml(m.auditor_nombre)} (${m.tiempo_auditoria.toFixed(2)} d)
                                  </span>
                                `
                              )
                              .join('')
                      }
                    </div>
                  </div>

                  ${
                    isConfirmingArchive
                      ? `
                        <div class="rounded-lg border border-rose-200 bg-rose-50/80 p-3 space-y-2">
                          <p class="text-xs font-bold text-rose-900">
                            ¿Archivar "${escapeHtml(site.etiqueta)}" y sus ${activeCerts.length} vínculo(s) a certificado?
                          </p>
                          <div class="flex flex-col sm:flex-row sm:items-center gap-2">
                            <input
                              type="text"
                              id="archiveTemporalReasonInput"
                              maxlength="200"
                              placeholder="Motivo de archivo (opcional)"
                              class="flex-1 h-8 rounded-lg border border-rose-200 bg-white px-2.5 text-xs text-slate-900 focus:border-rose-400 focus:outline-none"
                            />
                            <div class="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                data-action="cancel-archive-temporal-site"
                                class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                data-action="confirm-archive-temporal-site"
                                data-temporal-site-id="${escapeHtml(site.id)}"
                                ${state.saving ? 'disabled' : ''}
                                class="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                              >
                                Confirmar Archivo
                              </button>
                            </div>
                          </div>
                        </div>
                      `
                      : ''
                  }
                </article>
              `;
            })
            .join('')}
        </div>
      `;

  const customRecordBodyHtml = `
    <div class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 py-2.5">
        <div class="flex flex-wrap items-center gap-2 text-xs">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusMeta.badgeClass}">
            ${escapeHtml(statusMeta.label)}
          </span>
          <span class="text-slate-600 tabular-nums">
            Total temporal: <strong class="font-mono text-slate-900">${row.totalTemporalDays.toFixed(2)} d</strong>
            · Asignado a equipo: <strong class="font-mono text-slate-900">${row.assignedTemporalDays.toFixed(2)} d</strong>
          </span>
        </div>

        <div class="flex items-center gap-2">
          ${
            !isStaff
              ? '<span class="px-2 py-0.5 rounded bg-slate-200 text-slate-700 text-[11px] font-bold whitespace-nowrap">Solo lectura</span>'
              : !isFormOpen && temporalAnchorAudits.length > 0
              ? `
                <button
                  type="button"
                  data-action="open-create-temporal-site"
                  data-program-id="${escapeHtml(program.id)}"
                  class="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
                >
                  + Agregar Sitio Temporal
                </button>
              `
              : ''
          }
        </div>
      </div>

      ${formHtml}
      ${siteCardsHtml}

      <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
        <span class="text-[11px] text-slate-500">
          Continúe a Tiempo (Paso 6) o Asignación de Equipo (Paso 7) para asignar auditores al tiempo temporal.
        </span>
        <div class="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
          <button
            type="button"
            id="step5BottomNav_step6"
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
            id="step5BottomNav_step7"
            data-nav="auditorias"
            data-subview="asignacion"
            data-parent-nav="true"
            data-parent-type="programa_auditoria"
            data-entity-id="${escapeHtml(program.id)}"
            class="px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-indigo-50 text-slate-700 hover:text-indigo-800 transition-colors cursor-pointer whitespace-nowrap"
          >
            Paso 7: Asignación →
          </button>
        </div>
      </div>
    </div>
  `;

  return renderDetailPageTemplate({
    entityType: 'Designación → Temporal',
    entitySymbol: '⏱️',
    title: program.etiqueta,
    eyebrowCode: program.codigo_programa || undefined,
    subtitle: `${program.tipo_vinculacion} · ${activeAudits.length} certificado${
      activeAudits.length === 1 ? '' : 's'
    } · ${row.totalTemporalDays.toFixed(2)} d temporales`,
    statusBadge: {
      label: statusMeta.shortLabel,
      badgeClass: statusMeta.badgeClass,
    },
    backButton: {
      label: 'Volver',
      nav: 'auditorias',
      subview: 'designacion/temporal',
      action: 'back-to-step5-list',
    },
    topInCardHtml: opts.inCardBreadcrumbHtml || '',
    extraActionButtonsHtml: opts.headerAddAuditHtml || '',
    parents,
    parentMetaHtml,
    tableName: 'programa_auditoria',
    recordId: program.id,
    feedbackHtml: errorBannerHtml,
    attributes: [],
    customRecordBodyHtml,
  });
}
