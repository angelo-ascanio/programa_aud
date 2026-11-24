import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import type { Phase5FindingEntity, ProgramacionAuditEntity } from '../lib/auditExecution';
import {
  formatAuditDateLabel,
  resolveLatestPlannedDate,
  type ProgramaAuditoriaEntity,
} from '../lib/auditPlanningEngine';
import { resolveAuditNavigation } from '../lib/certificateAuditSelector';
import { resolveCertVersionSnapshotForAudit } from '../lib/certificadoVersionDomain';
import type { AuditoriaSitioTemporalEntity } from '../lib/designacionTemporalDomain';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import type { CertificateRecord } from '../lib/searchControls';
import {
  buildCertificateResumenRows,
  computeAuditStatusSummary,
  type AuditSectionSummaryCard,
  type AuditStatusSummaryResult,
  type CertificateResumenRow,
} from '../lib/resumenDomain';
import {
  computeReactiveFacetCounts,
  filterRecordsWithFacets,
  sortItems,
  type ColumnDefinition,
  type MultiViewFacetCategory,
  type MultiViewSelectionMap,
  type SortDirection,
} from '../lib/universalTemplate';
import { renderUniversalTemplate, type UniversalViewMode } from './universalTemplate';
import { renderAuditSectionShell } from './auditSectionShell';
import { renderAddAuditButton } from './auditCardBreadcrumb';

export type ResumenSortColumn =
  | 'certificado'
  | 'ultima_auditoria'
  | 'avance'
  | 'estatus';

export interface ResumenViewState {
  query: string;
  viewMode: UniversalViewMode;
  isSidebarOpen: boolean;
  sortColumn: ResumenSortColumn | null;
  sortDirection: SortDirection;
  facetSelections: MultiViewSelectionMap;
  selectedCertId: string | null;
  selectedAuditId: string | null;
}

export const DEFAULT_RESUMEN_STATE: ResumenViewState = {
  query: '',
  viewMode: 'list',
  isSidebarOpen: true,
  sortColumn: null,
  sortDirection: 'none',
  facetSelections: {},
  selectedCertId: null,
  selectedAuditId: null,
};

export interface ResumenViewRenderProps {
  profile: UserProfile;
  state: ResumenViewState;
  audits: ReadonlyArray<ProgramacionAuditEntity>;
  programs?: ReadonlyArray<ProgramaAuditoriaEntity>;
  temporalSites?: ReadonlyArray<AuditoriaSitioTemporalEntity>;
  findings?: ReadonlyArray<Phase5FindingEntity>;
  certificados?: ReadonlyArray<CertificadoDetailEntity>;
  certificates?: ReadonlyArray<CertificateRecord>;
  loading?: boolean;
  tableColumnWidths?: Record<string, Record<string, number>>;
  inCardBreadcrumbHtml?: string;
  headerAddAuditHtml?: string;
}

function mergeAuditsPool(
  auditsProp: ReadonlyArray<ProgramacionAuditEntity>,
  programs: ReadonlyArray<ProgramaAuditoriaEntity>
): ProgramacionAuditEntity[] {
  const byId = new Map<string, ProgramacionAuditEntity>();
  for (const a of auditsProp) {
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

/**
 * Step 9.1 — `Resumen` (`#/auditorias/resumen`):
 * - Certificate-Based Multi View (`Certificado & Org`, `Última Auditoría`, `Avance Secciones`, `Estatus Auditoría`).
 * - Detail View (`renderAuditSectionShell` `◀ / ▶`, In-Card Breadcrumb):
 *   unified `estatus_auditoria` header, `"Qué sigue (Paralelo)"` quick-jump bar,
 *   and responsive grid of 10 interactive section summary cards (`1.1..7`) with direct 1-click navigation.
 */
export function renderResumenView(props: ResumenViewRenderProps): string {
  const {
    profile,
    state,
    audits,
    programs = [],
    temporalSites = [],
    findings = [],
    certificados = [],
    certificates = [],
    loading = false,
    tableColumnWidths,
    inCardBreadcrumbHtml = '',
    headerAddAuditHtml = '',
  } = props;

  const isStaff = isApprovedStaffProfile(profile);
  const auditsPool = mergeAuditsPool(audits, programs);
  const allRows = buildCertificateResumenRows({
    audits: auditsPool,
    programs,
    temporalSites,
    findings,
    detailedCerts: certificados,
    certificates,
  });

  const resolvedCertId =
    state.selectedCertId && allRows.some((r) => r.certId === state.selectedCertId)
      ? state.selectedCertId
      : state.selectedAuditId
      ? auditsPool.find((a) => a.id === state.selectedAuditId)?.id_certificado ?? null
      : null;

  const resolvedHeaderAddAuditHtml = headerAddAuditHtml || renderAddAuditButton(isStaff);

  if (resolvedCertId) {
    const certRow = allRows.find((r) => r.certId === resolvedCertId) ?? null;
    if (certRow) {
      return renderResumenDetailView({
        isStaff,
        state,
        certRow,
        audits: auditsPool,
        programs,
        temporalSites,
        findings,
        certificados,
        inCardBreadcrumbHtml,
        headerAddAuditHtml: resolvedHeaderAddAuditHtml,
      });
    }
  }

  return renderResumenMultiView({
    state,
    allRows,
    loading,
    tableColumnWidths,
    headerAddAuditHtml: resolvedHeaderAddAuditHtml,
  });
}

function renderResumenMultiView(opts: {
  state: ResumenViewState;
  allRows: ReadonlyArray<CertificateResumenRow>;
  loading?: boolean;
  tableColumnWidths?: Record<string, Record<string, number>>;
  headerAddAuditHtml?: string;
}): string {
  const {
    state,
    allRows,
    loading = false,
    tableColumnWidths,
    headerAddAuditHtml = '',
  } = opts;

  const facetCategories: MultiViewFacetCategory<CertificateResumenRow>[] = [
    {
      id: 'estatus_auditoria',
      label: 'Estatus Auditoría',
      extractValues: (r) => r.statusSummary.estatus_auditoria,
    },
    {
      id: 'norma',
      label: 'Norma',
      extractValues: (r) => r.norma_codigo,
    },
    {
      id: 'ncs_abiertas',
      label: 'Con NCs Abiertas',
      options: [
        { value: 'CON_NC_ABIERTA', label: 'Con NCs Abiertas' },
        { value: 'SIN_NC_ABIERTA', label: 'Sin NCs Abiertas' },
      ],
      extractValues: (r) => r.hasOpenNcsFlag,
    },
  ];

  const selections: MultiViewSelectionMap = state.facetSelections || {};
  const searchOptions = {
    getSearchableText: (r: CertificateResumenRow) => r.searchHaystack,
  };

  const filtered = filterRecordsWithFacets(
    allRows,
    state.query,
    facetCategories,
    selections,
    searchOptions
  );

  const sorted = sortItems(
    filtered,
    state.sortColumn ?? null,
    state.sortDirection ?? 'none',
    (row, col) => {
      switch (col) {
        case 'certificado':
          return `${row.numero_certificado} ${row.organizacion_nombre}`;
        case 'ultima_auditoria':
          return `${row.latestAuditCode} ${row.latestAuditDateLabel}`;
        case 'avance':
          return row.statusSummary.progressPct;
        case 'estatus':
          return row.statusSummary.estatus_auditoria;
        default:
          return '';
      }
    }
  );

  const facetGroups = computeReactiveFacetCounts(
    allRows,
    state.query,
    facetCategories,
    selections,
    searchOptions
  );

  // Strict 4-column colgroup (32 + 24 + 18 + 26 = 100%) and 0 <button> inside <tbody>
  const columns: ColumnDefinition<CertificateResumenRow>[] = [
    {
      id: 'certificado',
      header: 'Certificado & Org',
      sortable: true,
      defaultWidthPct: 32,
      minWidthPx: 180,
      renderCell: (row) => {
        const verChip =
          typeof row.activeVersionNumero === 'number' && row.activeVersionNumero >= 1
            ? `<span class="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-300 shrink-0">v${Math.floor(row.activeVersionNumero)}</span>`
            : '';
        const abrevChip = row.organizacion_abreviacion
          ? `<span class="px-1.5 py-0.2 rounded text-[10px] font-bold bg-white text-slate-700 border border-slate-200 shrink-0">${escapeHtml(row.organizacion_abreviacion)}</span>`
          : '';
        const noAlcanceChip =
          row.hasAlcance === false
            ? `<span class="px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200 shrink-0">Sin alcance</span>`
            : '';
        const scopeTitle = row.alcance_es
          ? `Alcance: ${row.alcance_es}`
          : 'Sin Alcance activo registrado en Certificación → Certificado → Alcance.';
        return `
        <div class="min-w-0 space-y-0.5" title="${escapeHtml(scopeTitle)}">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="font-mono text-xs font-bold text-slate-900 truncate">${escapeHtml(
              row.numero_certificado
            )}</span>
            ${verChip}
            ${abrevChip}
            ${noAlcanceChip}
          </div>
          <div class="text-[11px] text-slate-600 truncate">
            ${escapeHtml(row.norma_codigo)} · ${escapeHtml(row.organizacion_nombre)}
          </div>
        </div>
      `;
      },
    },
    {
      id: 'ultima_auditoria',
      header: 'Última Auditoría',
      sortable: true,
      defaultWidthPct: 24,
      minWidthPx: 150,
      renderCell: (row) => {
        const sub = row.latestAudit
          ? `${row.latestAudit.tipo_auditoria} · ${row.latestAuditDateLabel}`
          : 'Sin auditoría vinculada';
        return `
          <div class="min-w-0">
            <div class="font-mono text-xs font-bold text-slate-900 truncate" title="${escapeHtml(
              row.latestAuditCode
            )}">
              ${escapeHtml(row.latestAuditCode)}
            </div>
            <div class="text-[11px] text-slate-500 truncate" title="${escapeHtml(sub)}">
              ${escapeHtml(sub)}
            </div>
          </div>
        `;
      },
    },
    {
      id: 'avance',
      header: 'Avance Secciones',
      sortable: true,
      defaultWidthPct: 18,
      minWidthPx: 120,
      renderCell: (row) => {
        const pct = row.statusSummary.progressPct;
        return `
          <div class="min-w-0 space-y-1">
            <div class="flex items-center justify-between gap-2 text-[11px] font-bold text-slate-800 tabular-nums">
              <span>${escapeHtml(row.statusSummary.progressChip)} listas</span>
              <span class="text-slate-500">${pct}%</span>
            </div>
            <div class="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div class="h-full rounded-full ${
                pct >= 100
                  ? 'bg-emerald-500'
                  : pct >= 50
                  ? 'bg-indigo-500'
                  : 'bg-amber-500'
              }" style="width: ${pct}%;"></div>
            </div>
          </div>
        `;
      },
    },
    {
      id: 'estatus',
      header: 'Estatus Auditoría',
      sortable: true,
      defaultWidthPct: 26,
      minWidthPx: 160,
      renderCell: (row) => {
        const openNcsNote =
          row.statusSummary.openNcsCount > 0
            ? `<div class="text-[10px] font-semibold text-rose-700 truncate">${row.statusSummary.openNcsCount} NC abierta(s)</div>`
            : `<div class="text-[10px] text-slate-500 truncate" title="${escapeHtml(
                row.nextActionPreview
              )}">${escapeHtml(row.nextActionPreview)}</div>`;
        return `
          <div class="min-w-0 space-y-0.5">
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border truncate max-w-full ${row.statusSummary.estatusBadgeClass}">
              ${escapeHtml(row.statusSummary.estatus_auditoria)}
            </span>
            ${openNcsNote}
          </div>
        `;
      },
    },
  ];

  const renderCard = (row: CertificateResumenRow): string => {
    const pct = row.statusSummary.progressPct;
    const verChip =
      typeof row.activeVersionNumero === 'number' && row.activeVersionNumero >= 1
        ? `<span class="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-300 shrink-0">v${Math.floor(row.activeVersionNumero)}</span>`
        : '';
    const abrevChip = row.organizacion_abreviacion
      ? `<span class="px-1.5 py-0.2 rounded text-[10px] font-bold bg-white text-slate-700 border border-slate-200 shrink-0">${escapeHtml(row.organizacion_abreviacion)}</span>`
      : '';
    const noAlcanceChip =
      row.hasAlcance === false
        ? `<span class="px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200 shrink-0">Sin alcance</span>`
        : '';
    const scopeTitle = row.alcance_es
      ? `Alcance: ${row.alcance_es}`
      : 'Sin Alcance activo registrado en Certificación → Certificado → Alcance.';
    return `
      <article
        data-action="select-section-cert"
        data-cert-id="${escapeHtml(row.certId)}"
        tabindex="0"
        title="${escapeHtml(scopeTitle)}"
        class="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs hover:shadow-sm hover:border-indigo-300 transition-all flex flex-col justify-between gap-3 cursor-pointer"
      >
        <div class="space-y-2.5">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 space-y-0.5">
              <div class="flex flex-wrap items-center gap-1.5 min-w-0">
                <span class="font-mono text-xs font-bold text-slate-900 truncate">
                  ${escapeHtml(row.numero_certificado)}
                </span>
                ${verChip}
                ${abrevChip}
                ${noAlcanceChip}
              </div>
              <div class="text-xs font-semibold text-slate-700 truncate">
                ${escapeHtml(row.organizacion_nombre)}
              </div>
            </div>
            <span class="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-bold text-slate-700 shrink-0">
              ${escapeHtml(row.norma_codigo)}
            </span>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${row.statusSummary.estatusBadgeClass}">
              ${escapeHtml(row.statusSummary.estatus_auditoria)}
            </span>
            <span class="text-[11px] font-bold text-slate-700 tabular-nums">
              ${escapeHtml(row.statusSummary.progressChip)} (${pct}%)
            </span>
          </div>

          <div class="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div class="h-full rounded-full ${
              pct >= 100
                ? 'bg-emerald-500'
                : pct >= 50
                ? 'bg-indigo-500'
                : 'bg-amber-500'
            }" style="width: ${pct}%;"></div>
          </div>
        </div>

        <div class="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px] text-slate-600">
          <span class="font-mono font-semibold truncate">${escapeHtml(row.latestAuditCode)}</span>
          <span class="truncate text-indigo-700 font-semibold">${escapeHtml(
            row.nextActionPreview
          )}</span>
        </div>
      </article>
    `;
  };

  return renderUniversalTemplate<CertificateResumenRow>({
    domainKey: 'resumen',
    tableId: 'resumen-main',
    title: 'Resumen Ejecutivo de Auditorías',
    subtitle:
      'Tablero automático paralelo por Certificado: estado integral (1.1–7), avance real y próximos pasos desbloqueados',
    entityLabel: 'certificados',
    searchQuery: state.query,
    searchPlaceholder:
      'Buscar por certificado, organización, norma, auditoría o estatus... (Presione "/" para enfocar)',
    searchInputId: 'resumenSearchInput',
    clearSearchBtnId: 'clearResumenSearchBtn',
    totalCount: allRows.length,
    filteredCount: sorted.length,
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen ?? true,
    sortState: {
      column: state.sortColumn ?? null,
      direction: state.sortDirection ?? 'none',
    },
    columnWidths: tableColumnWidths?.['resumen-main'],
    getRowAttrs: (row) =>
      `data-action="select-section-cert" data-cert-id="${escapeHtml(
        row.certId
      )}" tabindex="0" title="Abrir Resumen de ${escapeHtml(row.numero_certificado)}"`,
    facetGroups,
    items: sorted,
    columns,
    renderCard,
    emptyStateTitle: 'No hay certificados con estos criterios en Resumen',
    emptyStateMessage:
      'Ajuste el buscador o las facetas laterales para visualizar el estado de las auditorías.',
    actionsHtml: headerAddAuditHtml,
    loading,
    loadingMessage: 'Evaluando estado integral de auditorías...',
  });
}

function renderSectionSummaryCard(params: {
  card: AuditSectionSummaryCard;
  certId: string;
  auditId: string;
}): string {
  const { card, certId, auditId } = params;
  const isLockedHint = !card.unlocked && card.status === 'PENDIENTE';
  const stepBadgeClass =
    card.status === 'COMPLETO'
      ? 'bg-emerald-100 text-emerald-900 border-emerald-200'
      : card.status === 'EN_PROGRESO'
      ? 'bg-amber-100 text-amber-900 border-amber-200'
      : card.status === 'NO_APLICA'
      ? 'bg-slate-200/70 text-slate-600 border-slate-300'
      : 'bg-slate-100 text-slate-700 border-slate-200';

  return `
    <button
      type="button"
      data-action="jump-resumen-section"
      data-section-key="${escapeHtml(card.key)}"
      data-target-subview="${escapeHtml(card.key)}"
      data-cert-id="${escapeHtml(certId)}"
      data-audit-id="${escapeHtml(auditId)}"
      aria-label="Ir a sección ${escapeHtml(card.title)}: ${escapeHtml(card.statusLabel)}"
      class="group w-full text-left rounded-xl border p-4 transition-all cursor-pointer flex flex-col justify-between gap-2.5 shadow-2xs ${card.cardBorderClass}"
    >
      <div class="space-y-2 w-full">
        <div class="flex items-center justify-between gap-2">
          <div class="inline-flex items-center gap-1.5 min-w-0">
            <span class="px-1.5 py-0.5 rounded border text-[10px] font-mono font-bold shrink-0 ${stepBadgeClass}">
              ${escapeHtml(card.stepTag)}
            </span>
            <h3 class="text-xs font-bold text-slate-900 truncate">
              ${escapeHtml(card.label)}
            </h3>
          </div>
          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${card.statusBadgeClass}">
            ${escapeHtml(card.statusLabel)}
          </span>
        </div>

        <div class="text-sm font-bold text-slate-900 leading-snug break-words">
          ${escapeHtml(card.headlineValue)}
        </div>

        ${
          card.secondaryMeta
            ? `<div class="text-[11px] text-slate-600 font-medium truncate" title="${escapeHtml(
                card.secondaryMeta
              )}">${escapeHtml(card.secondaryMeta)}</div>`
            : ''
        }
      </div>

      <div class="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 w-full text-[11px]">
        <span class="${
          isLockedHint ? 'text-slate-400' : card.actionHint ? 'text-amber-800 font-semibold' : 'text-slate-500'
        } truncate">
          ${escapeHtml(card.actionHint || 'Sección lista')}
        </span>
        <span class="font-bold text-indigo-700 group-hover:text-indigo-900 shrink-0 whitespace-nowrap">
          Abrir →
        </span>
      </div>
    </button>
  `;
}

function renderResumenExecutiveBanner(params: {
  summary: AuditStatusSummaryResult;
  activeAudit: ProgramacionAuditEntity;
  program: ProgramaAuditoriaEntity | null;
  certId: string;
  versionNumero?: number | null;
  orgAbrev?: string | null;
  alcanceEs?: string | null;
  hasAlcance?: boolean;
}): string {
  const {
    summary,
    activeAudit,
    program,
    certId,
    versionNumero = null,
    orgAbrev = null,
    alcanceEs = null,
    hasAlcance,
  } = params;
  const plannedDate = resolveLatestPlannedDate(activeAudit.fechas) ?? null;
  const plannedLabel = plannedDate
    ? formatAuditDateLabel(plannedDate)
    : activeAudit.fecha_inicio || 'Sin fecha programada';

  const nextPillsHtml =
    summary.recommendedNextActions.length > 0
      ? `
        <div
          data-testid="resumen-next-parallel-bar"
          class="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3.5 flex flex-wrap items-center justify-between gap-2.5"
        >
          <div class="space-y-0.5">
            <div class="text-[10px] font-bold uppercase tracking-wider text-indigo-800">
              Qué sigue (Paralelo)
            </div>
            <p class="text-xs text-slate-700">
              Secciones desbloqueadas que puede completar en paralelo ahora mismo:
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            ${summary.recommendedNextActions
              .map(
                (action) => `
                  <button
                    type="button"
                    data-action="jump-resumen-section"
                    data-target-subview="${escapeHtml(action.key)}"
                    data-cert-id="${escapeHtml(certId)}"
                    data-audit-id="${escapeHtml(activeAudit.id)}"
                    class="px-3 py-1.5 rounded-full bg-white hover:bg-indigo-600 text-indigo-800 hover:text-white border border-indigo-300 text-xs font-bold shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
                  >
                    ${escapeHtml(action.buttonLabel)}
                  </button>
                `
              )
              .join('')}
          </div>
        </div>
      `
      : '';

  return `
    <div class="space-y-4">
      <div class="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="space-y-1 min-w-0">
            <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Estatus Automático de Auditoría
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <span
                data-testid="resumen-estatus-badge"
                class="inline-flex items-center px-3 py-1 rounded-full text-xs font-extrabold border ${summary.estatusBadgeClass}"
              >
                ${escapeHtml(summary.estatus_auditoria)}
              </span>
              <span class="font-mono text-xs font-bold text-slate-800 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                ${escapeHtml(activeAudit.codigo_auditoria)}
              </span>
              ${
                typeof versionNumero === 'number' && versionNumero >= 1
                  ? `<span class="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-300 text-[10px] font-mono font-bold">v${Math.floor(versionNumero)}</span>`
                  : ''
              }
              ${
                orgAbrev
                  ? `<span class="px-2 py-0.5 rounded-md bg-white text-slate-700 border border-slate-200 text-[10px] font-bold">${escapeHtml(orgAbrev)}</span>`
                  : ''
              }
              <span class="text-xs font-semibold text-slate-600">
                ${escapeHtml(activeAudit.tipo_auditoria || 'Sin tipo')} · ${escapeHtml(plannedLabel)}
              </span>
              ${
                program && program.es_vinculada
                  ? `<span class="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200 text-[10px] font-bold">${escapeHtml(
                      program.tipo_vinculacion
                    )}</span>`
                  : ''
              }
            </div>
            ${
              alcanceEs
                ? `<div class="text-[11px] text-slate-600 pt-0.5" title="${escapeHtml(alcanceEs)}">
                     <span class="font-bold text-slate-700">Alcance:</span> ${escapeHtml(alcanceEs)}
                   </div>`
                : hasAlcance === false
                ? `<div class="pt-0.5">
                     <span class="inline-flex items-center px-2 py-0.5 rounded-md border border-rose-200 bg-rose-50 text-[10px] font-bold text-rose-800">Sin alcance</span>
                   </div>`
                : ''
            }
          </div>

          <div class="min-w-[200px] sm:text-right space-y-1">
            <div class="text-xs font-bold text-slate-800 tabular-nums">
              ${summary.completedCount} / ${summary.applicableCount} secciones listas (${summary.progressPct}%)
            </div>
            <div class="w-full sm:w-52 h-2 rounded-full bg-slate-200 overflow-hidden ml-auto">
              <div
                class="h-full rounded-full transition-all ${
                  summary.progressPct >= 100
                    ? 'bg-emerald-500'
                    : summary.progressPct >= 50
                    ? 'bg-indigo-600'
                    : 'bg-amber-500'
                }"
                style="width: ${summary.progressPct}%;"
              ></div>
            </div>
          </div>
        </div>
      </div>

      ${nextPillsHtml}

      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3" data-testid="resumen-sections-grid">
        ${summary.cards
          .map((card) =>
            renderSectionSummaryCard({
              card,
              certId,
              auditId: activeAudit.id,
            })
          )
          .join('')}
      </div>
    </div>
  `;
}

function renderResumenDetailView(opts: {
  isStaff: boolean;
  state: ResumenViewState;
  certRow: CertificateResumenRow;
  audits: ReadonlyArray<ProgramacionAuditEntity>;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  temporalSites: ReadonlyArray<AuditoriaSitioTemporalEntity>;
  findings: ReadonlyArray<Phase5FindingEntity>;
  certificados?: ReadonlyArray<CertificadoDetailEntity>;
  inCardBreadcrumbHtml: string;
  headerAddAuditHtml: string;
}): string {
  const {
    isStaff,
    state,
    certRow,
    audits,
    programs,
    temporalSites,
    findings,
    certificados = [],
    inCardBreadcrumbHtml,
    headerAddAuditHtml,
  } = opts;

  const navigation = resolveAuditNavigation(certRow.certId, state.selectedAuditId, audits);
  const activeAudit = navigation.activeAudit;
  const activeProgram =
    activeAudit?.id_programa_auditoria
      ? programs.find((p) => !p.deleted_at && p.id === activeAudit.id_programa_auditoria) ?? null
      : null;

  const activeSnapshot =
    activeAudit && certificados.length > 0
      ? resolveCertVersionSnapshotForAudit(activeAudit, certificados)
      : null;

  const summary = computeAuditStatusSummary({
    audit: activeAudit,
    program: activeProgram,
    allAudits: audits,
    programs,
    temporalSites,
    findings,
    detailedCerts: certificados,
  });

  const bodyHtml = activeAudit
    ? renderResumenExecutiveBanner({
        summary,
        activeAudit,
        program: activeProgram,
        certId: certRow.certId,
        versionNumero: activeSnapshot?.versionNumero ?? certRow.activeVersionNumero ?? null,
        orgAbrev: activeSnapshot?.organizacionAbreviacion ?? certRow.organizacion_abreviacion ?? null,
        alcanceEs: activeSnapshot?.alcance_es || certRow.alcance_es || null,
        hasAlcance: activeSnapshot ? activeSnapshot.hasAlcance : certRow.hasAlcance,
      })
    : '';

  return renderAuditSectionShell({
    sectionTitle: 'Resumen',
    sectionSymbol: '📊',
    backSubview: 'resumen',
    certInfo: {
      id: certRow.certId,
      numero_certificado: certRow.numero_certificado,
      organizacion_nombre: activeSnapshot?.organizacionNombre || certRow.organizacion_nombre,
      organizacion_abreviacion:
        activeSnapshot?.organizacionAbreviacion ?? certRow.organizacion_abreviacion ?? null,
      norma_codigo: certRow.norma_codigo,
      estatus: certRow.estatus,
      version_numero: activeSnapshot?.versionNumero ?? certRow.activeVersionNumero ?? null,
      alcance_es: activeSnapshot?.alcance_es || certRow.alcance_es || null,
      alcance_en: activeSnapshot?.alcance_en ?? certRow.alcance_en ?? null,
      hasAlcance: activeSnapshot ? activeSnapshot.hasAlcance : certRow.hasAlcance,
    },
    certificados,
    navigation,
    programs,
    showLinkedSiblings: false,
    isStaff,
    inCardBreadcrumbHtml,
    headerAddAuditHtml,
    tableName: 'auditoria',
    bodyHtml,
  });
}
