import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import type { OrganizacionEntity } from '../lib/activeCertificates';
import type { ConglomeradoEntity } from '../lib/conglomeradoDomain';
import type { VinculoEntity } from '../lib/vinculoDomain';
import type { Phase5FindingEntity, ProgramacionAuditEntity } from '../lib/auditExecution';
import type { ProgramaAuditoriaEntity } from '../lib/auditPlanningEngine';
import {
  getLinkedSiblingAudits,
  resolveAuditNavigation,
} from '../lib/certificateAuditSelector';
import { resolveCertVersionSnapshotForAudit } from '../lib/certificadoVersionDomain';
import { resolveShortOrganizacionName } from '../lib/codenameDomain';
import type { AuditoriaSitioTemporalEntity } from '../lib/designacionTemporalDomain';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import type { CertificateRecord } from '../lib/searchControls';
import {
  buildOrgCertPickerModalModel,
  buildOrgMultiViewRows,
  type OrgMultiViewRow,
} from '../lib/orgMultiViewPickerDomain';
import { mergeCertSourcesForOrgPicker } from '../lib/designacionTipoDomain';
import {
  buildCertificateResumenRows,
  buildResumenOrgFacetCategories,
  computeAuditStatusSummary,
  createResumenOrgCertMetaResolver,
  type AuditSectionSummaryCard,
  type AuditStatusSummaryResult,
  type CertificateResumenRow,
  type ResumenOrgCertMeta,
} from '../lib/resumenDomain';
import type {
  ColumnDefinition,
  MultiViewSelectionMap,
  SortDirection,
} from '../lib/universalTemplate';
import type { UniversalViewMode } from './universalTemplate';
import {
  renderOrgCertPickerModal,
  renderOrgMultiView,
  type OrgPickerDomainColumn,
} from './orgMultiViewPickerView';
import { renderAuditSectionShell } from './auditSectionShell';
import { renderAddAuditButton } from './auditCardBreadcrumb';

export type ResumenSortColumn =
  | 'organizacion'
  | 'certificados'
  | 'auditorias'
  | 'avance_global'
  | 'estatus_auditoria'
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
  pickerOrgId?: string | null;
  pickerSearchQuery?: string;
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
  pickerOrgId: null,
  pickerSearchQuery: '',
};

export interface ResumenViewRenderProps {
  profile: UserProfile;
  state: ResumenViewState;
  audits: ReadonlyArray<ProgramacionAuditEntity>;
  programs?: ReadonlyArray<ProgramaAuditoriaEntity>;
  temporalSites?: ReadonlyArray<AuditoriaSitioTemporalEntity>;
  findings?: ReadonlyArray<Phase5FindingEntity>;
  vinculos?: ReadonlyArray<VinculoEntity>;
  conglomerados?: ReadonlyArray<ConglomeradoEntity>;
  organizaciones?: ReadonlyArray<OrganizacionEntity>;
  authorizedClientOrgIds?: ReadonlyArray<string>;
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
 * Step 3.3 — `Resumen` (`#/auditorias/resumen`):
 * - Organization-Based Multi View (`Avance Global %`, `Estatus Auditoría`) + grouped Pop-up Modal
 *   (`Última Auditoría`, `Avance (X/7)`, `Estatus Auditoría`).
 * - Detail View (`renderAuditSectionShell` `◀ / ▶`, In-Card Breadcrumb):
 *   unified `estatus_auditoria` header, `"Qué sigue (Paralelo)"` quick-jump bar,
 *   and responsive grid of interactive section summary cards (`1..7`: Designación hasta Revisión) with direct 1-click navigation.
 */
export function renderResumenView(props: ResumenViewRenderProps): string {
  const {
    profile,
    state,
    audits,
    programs = [],
    temporalSites = [],
    findings = [],
    vinculos = [],
    conglomerados = [],
    organizaciones = [],
    authorizedClientOrgIds = [],
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
    profile,
    state,
    auditsPool,
    programs,
    temporalSites,
    findings,
    vinculos,
    conglomerados,
    organizaciones,
    authorizedClientOrgIds,
    certificados,
    certificates,
    loading,
    tableColumnWidths,
    headerAddAuditHtml: resolvedHeaderAddAuditHtml,
  });
}

function summarizeOrgResumen(row: OrgMultiViewRow<ResumenOrgCertMeta>): {
  avgPct: number;
  completeCount: number;
  openNcsCount: number;
  dominantStatus: string;
  badgeClass: string;
} {
  if (row.certificates.length === 0) {
    return {
      avgPct: 0,
      completeCount: 0,
      openNcsCount: 0,
      dominantStatus: 'Sin auditoría',
      badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
    };
  }
  let pctSum = 0;
  let completeCount = 0;
  let openNcsCount = 0;
  for (const cert of row.certificates) {
    const sum = cert.domainExtra.statusSummary;
    pctSum += sum.progressPct;
    if (sum.estatus_auditoria === 'Completada ✓') completeCount += 1;
    openNcsCount += sum.openNcsCount;
  }
  const avgPct = Math.round(pctSum / row.certificates.length);
  const firstPending =
    row.certificates.find((c) => c.domainExtra.statusSummary.openNcsCount > 0) ??
    row.certificates.find((c) => c.domainExtra.statusSummary.estatus_auditoria !== 'Completada ✓') ??
    row.certificates[0];
  const dominantStatus =
    completeCount === row.certificates.length
      ? 'Completada ✓'
      : firstPending.domainExtra.statusSummary.estatus_auditoria;
  const badgeClass =
    completeCount === row.certificates.length
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : firstPending.domainExtra.statusSummary.estatusBadgeClass;

  return {
    avgPct,
    completeCount,
    openNcsCount,
    dominantStatus,
    badgeClass,
  };
}

function renderResumenMultiView(opts: {
  profile: UserProfile;
  state: ResumenViewState;
  auditsPool: ReadonlyArray<ProgramacionAuditEntity>;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  temporalSites: ReadonlyArray<AuditoriaSitioTemporalEntity>;
  findings: ReadonlyArray<Phase5FindingEntity>;
  vinculos: ReadonlyArray<VinculoEntity>;
  conglomerados: ReadonlyArray<ConglomeradoEntity>;
  organizaciones: ReadonlyArray<OrganizacionEntity>;
  authorizedClientOrgIds: ReadonlyArray<string>;
  certificados: ReadonlyArray<CertificadoDetailEntity>;
  certificates: ReadonlyArray<CertificateRecord>;
  loading?: boolean;
  tableColumnWidths?: Record<string, Record<string, number>>;
  headerAddAuditHtml?: string;
}): string {
  const {
    profile,
    state,
    auditsPool,
    programs,
    temporalSites,
    findings,
    vinculos,
    conglomerados,
    organizaciones,
    authorizedClientOrgIds,
    certificados,
    certificates,
    loading = false,
    tableColumnWidths,
    headerAddAuditHtml = '',
  } = opts;

  const mergedCerts = mergeCertSourcesForOrgPicker({
    certificados,
    certificates,
    audits: auditsPool,
    organizaciones,
  });

  const resolveCertMeta = createResumenOrgCertMetaResolver({
    audits: auditsPool,
    programs,
    temporalSites,
    findings,
    detailedCerts: certificados,
  });

  const orgRows = buildOrgMultiViewRows<ResumenOrgCertMeta>({
    profile,
    authorizedClientOrgIds,
    organizaciones,
    conglomerados,
    certificados: mergedCerts,
    audits: auditsPool,
    programs,
    vinculos,
    resolveCertMeta,
  });

  const facetCategories = buildResumenOrgFacetCategories(orgRows);

  // Strict 26% extra columns complementing 74% base columns (30 + 22 + 22 = 74%)
  const extraColumns: ColumnDefinition<OrgMultiViewRow<ResumenOrgCertMeta>>[] = [
    {
      id: 'avance_global',
      header: 'Avance',
      sortable: true,
      defaultWidthPct: 13,
      minWidthPx: 115,
      getValue: (row) => summarizeOrgResumen(row).avgPct,
      renderCell: (row) => {
        const stats = summarizeOrgResumen(row);
        const pct = stats.avgPct;
        return `
          <div class="min-w-0 space-y-1">
            <div class="flex items-center justify-between gap-1.5 text-[11px] font-bold text-slate-800 tabular-nums">
              <span class="truncate">${stats.completeCount}/${row.certsCount} listas</span>
              <span class="text-slate-600 shrink-0">${pct}%</span>
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
      id: 'estatus_auditoria',
      header: 'Estatus',
      sortable: true,
      defaultWidthPct: 13,
      minWidthPx: 120,
      getValue: (row) => summarizeOrgResumen(row).dominantStatus,
      renderCell: (row) => {
        const stats = summarizeOrgResumen(row);
        const openNcsNote =
          stats.openNcsCount > 0
            ? `<div class="text-[10px] font-semibold text-rose-700 truncate">${stats.openNcsCount} NC abierta(s)</div>`
            : `<div class="text-[10px] text-slate-500 truncate">${row.auditsCount} auditoría(s)</div>`;
        return `
          <div class="min-w-0 space-y-0.5">
            <span title="${escapeHtml(stats.dominantStatus)}" class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border max-w-full overflow-hidden ${stats.badgeClass}">
              <span class="truncate">${escapeHtml(stats.dominantStatus)}</span>
            </span>
            ${openNcsNote}
          </div>
        `;
      },
    },
  ];

  const renderCardExtra = (row: OrgMultiViewRow<ResumenOrgCertMeta>): string => {
    const stats = summarizeOrgResumen(row);
    const pct = stats.avgPct;
    return `
      <div class="space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${stats.badgeClass}">
            ${escapeHtml(stats.dominantStatus)}
          </span>
          <span class="text-[11px] font-bold text-slate-700 tabular-nums">
            ${stats.completeCount}/${row.certsCount} listas (${pct}%)
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
    `;
  };

  const pickerModel = state.pickerOrgId
    ? buildOrgCertPickerModalModel<ResumenOrgCertMeta>({
        orgId: state.pickerOrgId,
        modalSearchQuery: state.pickerSearchQuery ?? '',
        groupingMode: 'audit',
        orgRows,
        profile,
        authorizedClientOrgIds,
        organizaciones,
        conglomerados,
        certificados: mergedCerts,
        audits: auditsPool,
        programs,
        vinculos,
        resolveCertMeta,
      })
    : null;

  const pickerDomainColumns: OrgPickerDomainColumn<ResumenOrgCertMeta>[] = [
    {
      id: 'ultima_auditoria',
      header: 'Última Auditoría',
      defaultWidthPct: 16,
      minWidthPx: 140,
      renderCell: (row) => {
        const meta = row.domainExtra;
        const sub = row.latestAudit
          ? `${row.latestAudit.tipo_auditoria} · ${meta.latestAuditDateLabel}`
          : 'Sin auditoría vinculada';
        return `
          <div class="min-w-0">
            <div class="text-xs font-bold text-slate-900 truncate" title="${escapeHtml(
              meta.latestAuditTooltip
            )}">
              ${escapeHtml(meta.latestAuditCodename)}
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
      header: 'Avance (X/7)',
      defaultWidthPct: 16,
      minWidthPx: 125,
      renderCell: (row) => {
        const meta = row.domainExtra;
        const pct = meta.statusSummary.progressPct;
        return `
          <div class="min-w-0 space-y-1">
            <div class="flex items-center justify-between gap-2 text-[11px] font-bold text-slate-800 tabular-nums">
              <span>${escapeHtml(meta.statusSummary.progressChip)} listas</span>
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
      id: 'estatus_auditoria',
      header: 'Estatus',
      defaultWidthPct: 21,
      minWidthPx: 155,
      renderCell: (row) => {
        const meta = row.domainExtra;
        const openNcsNote =
          meta.statusSummary.openNcsCount > 0
            ? `<div class="text-[10px] font-semibold text-rose-700 truncate">${meta.statusSummary.openNcsCount} NC abierta(s)</div>`
            : `<div class="text-[10px] text-slate-500 truncate" title="${escapeHtml(
                meta.nextActionPreview
              )}">${escapeHtml(meta.nextActionPreview)}</div>`;
        return `
          <div class="min-w-0 space-y-0.5">
            <span title="${escapeHtml(meta.statusSummary.estatus_auditoria)}" class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border max-w-full overflow-hidden ${meta.statusSummary.estatusBadgeClass}">
              <span class="truncate">${escapeHtml(meta.statusSummary.estatus_auditoria)}</span>
            </span>
            ${openNcsNote}
          </div>
        `;
      },
    },
  ];

  const pickerModalHtml = pickerModel
    ? renderOrgCertPickerModal<ResumenOrgCertMeta>({
        model: pickerModel,
        domainColumns: pickerDomainColumns,
        subtitle:
          'Seleccione un certificado (agrupado por auditoría vinculada) para inspeccionar el avance integral de las 7 secciones.',
        emptySearchMessage:
          'No se encontraron certificados ni resúmenes que coincidan con la búsqueda.',
      })
    : '';

  return renderOrgMultiView<ResumenOrgCertMeta>({
    domainKey: 'resumen',
    tableId: 'resumen-main',
    title: 'Resumen Ejecutivo de Auditorías',
    subtitle: 'Estado integral (1–7), avance real y próximos pasos por organización.',
    entityLabel: 'organizaciones',
    groupingMode: 'audit',
    rows: orgRows,
    searchQuery: state.query,
    searchPlaceholder:
      'Buscar organización, conglomerado, certificado, norma, auditoría o estatus... (Presione "/" para enfocar)',
    searchInputId: 'resumenSearchInput',
    clearSearchBtnId: 'clearResumenSearchBtn',
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen ?? true,
    sortState: {
      column: state.sortColumn ?? null,
      direction: state.sortDirection ?? 'none',
    },
    columnWidths: tableColumnWidths?.['resumen-main'],
    facetCategories,
    facetSelections: state.facetSelections ?? {},
    extraColumns,
    renderCardExtra,
    emptyStateTitle:
      orgRows.length === 0
        ? 'No hay organizaciones con certificados disponibles en Resumen'
        : 'No hay organizaciones con estos criterios en Resumen',
    emptyStateMessage:
      orgRows.length === 0
        ? 'Registre certificados y programe una auditoría con "+ Auditoría" para ver su avance.'
        : 'Ajuste el buscador o las facetas laterales para visualizar el estado de las auditorías.',
    actionsHtml: headerAddAuditHtml,
    loading,
    loadingMessage: 'Evaluando estado integral de auditorías por organización...',
    pickerModalHtml,
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
}): string {
  const { summary, activeAudit, program, certId } = params;

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
              <span class="text-xs font-semibold text-slate-700">
                ${escapeHtml(activeAudit.tipo_auditoria || 'Sin tipo')}
              </span>
              ${
                program && program.es_vinculada
                  ? `<span class="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200 text-[10px] font-bold">${escapeHtml(
                      program.tipo_vinculacion
                    )}</span>`
                  : ''
              }
            </div>
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
  const linkedCtx = getLinkedSiblingAudits(activeAudit, audits, programs);
  const activeProgram =
    linkedCtx.program ??
    (activeAudit?.id_programa_auditoria
      ? programs.find((p) => !p.deleted_at && p.id === activeAudit.id_programa_auditoria) ?? null
      : null);

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
      })
    : '';

  return renderAuditSectionShell({
    sectionTitle: 'Resumen',
    sectionSymbol: '📊',
    backSubview: 'resumen',
    certInfo: {
      id: certRow.certId,
      id_organizacion: certRow.id_organizacion ?? activeAudit?.id_organizacion ?? null,
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
    linkedSiblings: linkedCtx.siblings,
    showLinkedSiblings: linkedCtx.siblings.length > 1,
    isStaff,
    inCardBreadcrumbHtml,
    headerAddAuditHtml,
    tableName: 'auditoria',
    bodyHtml,
  });
}
