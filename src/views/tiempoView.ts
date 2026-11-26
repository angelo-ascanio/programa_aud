import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import type { OrganizacionEntity } from '../lib/activeCertificates';
import type { ConglomeradoEntity } from '../lib/conglomeradoDomain';
import type { VinculoEntity } from '../lib/vinculoDomain';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import type { CertificateRecord } from '../lib/searchControls';
import {
  roundAuditDaysQuarter,
  type AuditoriaSitioPlanItem,
  type ProgramaAuditoriaEntity,
  type SiteEvaluationModality,
} from '../lib/auditPlanningEngine';
import type { ProgramacionAuditEntity } from '../lib/auditExecution';
import {
  getLinkedSiblingAudits,
  resolveAuditNavigation,
} from '../lib/certificateAuditSelector';
import type { AuditoriaSitioTemporalEntity } from '../lib/designacionTemporalDomain';
import {
  buildOrgCertPickerModalModel,
  buildOrgMultiViewRows,
  type OrgMultiViewRow,
} from '../lib/orgMultiViewPickerDomain';
import { mergeCertSourcesForOrgPicker } from '../lib/designacionTipoDomain';
import {
  buildAuditTiempoDetail,
  buildCertificateTiempoRows,
  buildTiempoOrgFacetCategories,
  createTiempoOrgCertMetaResolver,
  type AuditTiempoDetailModel,
  type CertificateTiempoRow,
  type TiempoOrgCertMeta,
} from '../lib/tiempoDomain';
import type {
  ColumnDefinition,
  MultiViewSelectionMap,
  SortDirection,
  UniversalViewMode,
} from '../lib/universalTemplate';
import {
  renderOrgCertPickerModal,
  renderOrgMultiView,
  type OrgPickerDomainColumn,
} from './orgMultiViewPickerView';
import { renderAuditSectionShell } from './auditSectionShell';
import { renderAddAuditButton } from './auditCardBreadcrumb';
import {
  extractUniversalArchiveProps,
  type ArchiveMultiViewConfig,
} from '../lib/archiveGovernance';

export type TiempoSortColumn =
  | 'organizacion'
  | 'certificados'
  | 'auditorias'
  | 'tiempo_total'
  | 'estado_tiempo'
  | 'certificado'
  | 'sitios'
  | 'total';

export interface TiempoViewState {
  query: string;
  viewMode: UniversalViewMode;
  isSidebarOpen: boolean;
  sortColumn: TiempoSortColumn | null;
  sortDirection: SortDirection;
  facetSelections: MultiViewSelectionMap;
  selectedCertId?: string | null;
  selectedAuditId?: string | null;
  pickerOrgId?: string | null;
  pickerSearchQuery?: string;
  /** Legacy compatibility field */
  selectedProgramId?: string | null;
  draftTimeBySitePlanId: Record<string, string>;
  savingSitePlanId: string | null;
  editErrorMessage: string | null;
}

export const DEFAULT_TIEMPO_STATE: TiempoViewState = {
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
  selectedProgramId: null,
  draftTimeBySitePlanId: {},
  savingSitePlanId: null,
  editErrorMessage: null,
};

export interface TiempoViewProps {
  profile: UserProfile;
  state: TiempoViewState;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  audits?: ReadonlyArray<ProgramacionAuditEntity>;
  temporalSites: ReadonlyArray<AuditoriaSitioTemporalEntity>;
  vinculos?: ReadonlyArray<VinculoEntity>;
  conglomerados?: ReadonlyArray<ConglomeradoEntity>;
  organizaciones?: ReadonlyArray<OrganizacionEntity>;
  authorizedClientOrgIds?: ReadonlyArray<string>;
  certificados?: ReadonlyArray<CertificadoDetailEntity>;
  certificates?: ReadonlyArray<CertificateRecord>;
  referenceIsoDate?: string;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
  inCardBreadcrumbHtml?: string;
  headerAddAuditHtml?: string;
}

const MODALITY_OPTIONS: ReadonlyArray<SiteEvaluationModality> = [
  'Presencial',
  'Remota',
  'Mixta',
];

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

/**
 * Renders Step 3.3 `2. Tiempo` (`#/auditorias/tiempo`) using the Organization-Based Multi View
 * + grouped Pop-up Modal (`Última Auditoría`, `Sitios / Temporal`, `Tiempo Total (d)`)
 * + single-audit Detail View (`renderAuditSectionShell` with `◀ / ▶`, `0.25d` steppers/inputs/presets).
 */
export function renderTiempoView(props: TiempoViewProps): string {
  const {
    profile,
    state,
    programs,
    audits: auditsProp,
    temporalSites,
    vinculos = [],
    conglomerados = [],
    organizaciones = [],
    authorizedClientOrgIds = [],
    certificados = [],
    certificates = [],
    referenceIsoDate,
    loading = false,
    archiveConfig,
    tableColumnWidths,
    inCardBreadcrumbHtml = '',
    headerAddAuditHtml = '',
  } = props;

  const isStaff = isApprovedStaffProfile(profile);
  const auditsPool = mergeAuditsPool(programs, auditsProp);

  const allRows = buildCertificateTiempoRows({
    certificates,
    detailedCerts: certificados,
    audits: auditsPool,
    programs,
    temporalSites,
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

  const resolvedHeaderAddAuditHtml = headerAddAuditHtml || renderAddAuditButton(isStaff);

  if (resolvedCertId) {
    const certRow = allRows.find((r) => r.certId === resolvedCertId) ?? null;
    if (certRow) {
      const effectiveAuditId = state.selectedAuditId ?? legacyProgramFirstAudit?.id ?? null;
      return renderTiempoDetailView({
        state,
        certRow,
        effectiveAuditId,
        audits: auditsPool,
        programs,
        temporalSites,
        certificados,
        isStaff,
        inCardBreadcrumbHtml,
        headerAddAuditHtml: resolvedHeaderAddAuditHtml,
      });
    }
  }

  return renderTiempoMultiView({
    profile,
    state,
    auditsPool,
    programs,
    temporalSites,
    vinculos,
    conglomerados,
    organizaciones,
    authorizedClientOrgIds,
    certificados,
    certificates,
    referenceIsoDate,
    loading,
    archiveConfig,
    tableColumnWidths,
    headerAddAuditHtml: resolvedHeaderAddAuditHtml,
  });
}

function summarizeOrgTiempo(row: OrgMultiViewRow<TiempoOrgCertMeta>): {
  totalDays: number;
  totalTemporalDays: number;
  completeCount: number;
  pendingCount: number;
  noAuditCount: number;
  statusKey: 'COMPLETO' | 'PENDIENTE' | 'SIN_AUDITORIA';
  statusLabel: string;
  badgeClass: string;
} {
  let totalDays = 0;
  let totalTemporalDays = 0;
  let completeCount = 0;
  let pendingCount = 0;
  let noAuditCount = 0;

  for (const cert of row.certificates) {
    const ex = cert.domainExtra;
    totalDays += ex.permanentDaysTotal;
    if (ex.hasTemporalActive) totalTemporalDays += ex.temporalDays;
    if (ex.statusKey === 'COMPLETO') completeCount += 1;
    else if (ex.statusKey === 'PENDIENTE') pendingCount += 1;
    else noAuditCount += 1;
  }

  totalDays = roundAuditDaysQuarter(totalDays);
  totalTemporalDays = roundAuditDaysQuarter(totalTemporalDays);

  if (row.certificates.length === 0 || noAuditCount === row.certificates.length) {
    return {
      totalDays,
      totalTemporalDays,
      completeCount,
      pendingCount,
      noAuditCount,
      statusKey: 'SIN_AUDITORIA',
      statusLabel: 'Sin auditorías',
      badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
    };
  }
  if (pendingCount === 0 && completeCount > 0) {
    return {
      totalDays,
      totalTemporalDays,
      completeCount,
      pendingCount,
      noAuditCount,
      statusKey: 'COMPLETO',
      statusLabel: 'Completo ✓',
      badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    };
  }
  return {
    totalDays,
    totalTemporalDays,
    completeCount,
    pendingCount,
    noAuditCount,
    statusKey: 'PENDIENTE',
    statusLabel: 'Pendiente',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  };
}

function renderTiempoMultiView(opts: {
  profile: UserProfile;
  state: TiempoViewState;
  auditsPool: ReadonlyArray<ProgramacionAuditEntity>;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  temporalSites: ReadonlyArray<AuditoriaSitioTemporalEntity>;
  vinculos: ReadonlyArray<VinculoEntity>;
  conglomerados: ReadonlyArray<ConglomeradoEntity>;
  organizaciones: ReadonlyArray<OrganizacionEntity>;
  authorizedClientOrgIds: ReadonlyArray<string>;
  certificados: ReadonlyArray<CertificadoDetailEntity>;
  certificates: ReadonlyArray<CertificateRecord>;
  referenceIsoDate?: string;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
  headerAddAuditHtml?: string;
}): string {
  const {
    profile,
    state,
    auditsPool,
    programs,
    temporalSites,
    vinculos,
    conglomerados,
    organizaciones,
    authorizedClientOrgIds,
    certificados,
    certificates,
    referenceIsoDate,
    loading = false,
    archiveConfig,
    tableColumnWidths,
    headerAddAuditHtml = '',
  } = opts;

  const mergedCerts = mergeCertSourcesForOrgPicker({
    certificados,
    certificates,
    audits: auditsPool,
    organizaciones,
  });

  const resolveCertMeta = createTiempoOrgCertMetaResolver({
    audits: auditsPool,
    programs,
    temporalSites,
    certificados,
    referenceIsoDate,
  });

  const orgRows = buildOrgMultiViewRows<TiempoOrgCertMeta>({
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

  const facetCategories = buildTiempoOrgFacetCategories(orgRows);

  const extraColumns: ColumnDefinition<OrgMultiViewRow<TiempoOrgCertMeta>>[] = [
    {
      id: 'tiempo_total',
      header: 'Tiempo Org (d)',
      defaultWidthPct: 13,
      minWidthPx: 120,
      sortable: true,
      getValue: (row) => summarizeOrgTiempo(row).totalDays,
      renderCell: (row) => {
        const stats = summarizeOrgTiempo(row);
        return `
          <div class="min-w-0 space-y-0.5 tabular-nums">
            <div class="font-mono text-xs font-bold text-slate-900 whitespace-nowrap">
              ${stats.totalDays.toFixed(2)} días
            </div>
            <div class="text-[11px] truncate ${
              stats.totalTemporalDays > 0 ? 'text-violet-700 font-semibold' : 'text-slate-500'
            }">
              ${
                stats.totalTemporalDays > 0
                  ? `+${stats.totalTemporalDays.toFixed(2)}d temporal`
                  : `${stats.completeCount}/${row.certsCount} completos`
              }
            </div>
          </div>
        `;
      },
    },
    {
      id: 'estado_tiempo',
      header: 'Estado Tiempo',
      defaultWidthPct: 13,
      minWidthPx: 120,
      sortable: true,
      getValue: (row) => summarizeOrgTiempo(row).statusLabel,
      renderCell: (row) => {
        const stats = summarizeOrgTiempo(row);
        return `
          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${stats.badgeClass}">
            ${escapeHtml(stats.statusLabel)}
          </span>
        `;
      },
    },
  ];

  const renderCardExtra = (row: OrgMultiViewRow<TiempoOrgCertMeta>): string => {
    const stats = summarizeOrgTiempo(row);
    return `
      <div class="flex items-center justify-between gap-2 text-[11px] tabular-nums">
        <span class="font-mono font-bold text-slate-900">${stats.totalDays.toFixed(2)} días</span>
        <span class="inline-flex items-center px-2 py-0.2 rounded-full text-[10px] font-bold border ${stats.badgeClass}">
          ${escapeHtml(stats.statusLabel)}
        </span>
      </div>
    `;
  };

  const pickerModel = state.pickerOrgId
    ? buildOrgCertPickerModalModel<TiempoOrgCertMeta>({
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

  const pickerDomainColumns: OrgPickerDomainColumn<TiempoOrgCertMeta>[] = [
    {
      id: 'ultima_auditoria',
      header: 'Última Auditoría',
      defaultWidthPct: 19,
      minWidthPx: 150,
      renderCell: (row) => {
        const meta = row.domainExtra;
        return `
          <div class="min-w-0 space-y-0.5" title="${escapeHtml(meta.latestAuditTooltip)}">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="font-mono text-xs font-bold text-slate-900 truncate">${escapeHtml(meta.latestAuditCodename)}</span>
              <span class="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold border shrink-0 ${meta.urgency.badgeClass}">
                ${escapeHtml(meta.urgency.label)}
              </span>
            </div>
            <div class="text-[11px] text-slate-500 truncate">${escapeHtml(meta.latestDateSummary)}</div>
          </div>
        `;
      },
    },
    {
      id: 'sitios_temporal',
      header: 'Sitios / Temporal',
      defaultWidthPct: 16,
      minWidthPx: 140,
      renderCell: (row) => {
        const meta = row.domainExtra;
        if (meta.statusKey === 'SIN_AUDITORIA') {
          return `<span class="text-xs text-slate-400">—</span>`;
        }
        const subText =
          meta.sitesCount === 0
            ? 'Sin sitios en 1.4'
            : meta.hasTemporalActive
            ? `Temporal ON (${meta.temporalDays.toFixed(2)} d)`
            : `${meta.allocatedSitesCount}/${meta.sitesCount} con tiempo`;
        return `
          <div class="min-w-0 space-y-0.5 tabular-nums">
            <div class="text-xs font-bold text-slate-900 whitespace-nowrap">
              ${meta.sitesCount} sitio${meta.sitesCount === 1 ? '' : '(s)'}
            </div>
            <div class="text-[11px] truncate ${
              meta.hasTemporalActive
                ? 'text-violet-700 font-semibold'
                : meta.sitesCount === 0
                ? 'text-amber-700 font-medium'
                : 'text-slate-500'
            }">
              ${escapeHtml(subText)}
            </div>
          </div>
        `;
      },
    },
    {
      id: 'tiempo_total',
      header: 'Tiempo Total (d)',
      defaultWidthPct: 16,
      minWidthPx: 140,
      renderCell: (row) => {
        const meta = row.domainExtra;
        if (meta.statusKey === 'SIN_AUDITORIA') {
          return `
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-slate-100 text-slate-600 border-slate-200 whitespace-nowrap">
              Sin auditorías
            </span>
          `;
        }
        const isComplete = meta.statusKey === 'COMPLETO';
        const badgeCls = isComplete
          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
          : 'bg-amber-50 text-amber-800 border-amber-200';
        const badgeLabel = isComplete ? 'Completo ✓' : 'Pendiente';
        return `
          <div class="flex items-center justify-between gap-2 min-w-0 tabular-nums">
            <span class="font-mono text-xs font-bold text-slate-900 whitespace-nowrap">
              ${meta.permanentDaysTotal.toFixed(2)} d
            </span>
            <span class="inline-flex items-center px-2 py-0.2 rounded-full text-[10px] font-bold border shrink-0 ${badgeCls}">
              ${badgeLabel}
            </span>
          </div>
        `;
      },
    },
  ];

  const pickerModalHtml = pickerModel
    ? renderOrgCertPickerModal<TiempoOrgCertMeta>({
        model: pickerModel,
        domainColumns: pickerDomainColumns,
        subtitle:
          'Seleccione un certificado (agrupado por auditoría vinculada) para definir días-auditor (0.25d) por sitio designado.',
        emptySearchMessage:
          'No se encontraron certificados, sitios ni auditorías que coincidan con la búsqueda.',
      })
    : '';

  const archiveProps = extractUniversalArchiveProps(archiveConfig, 'programacion');

  return renderOrgMultiView<TiempoOrgCertMeta>({
    domainKey: 'tiempo',
    tableId: 'tiempo-main',
    title: '2. Tiempo (0.25d)',
    subtitle:
      'Presupuesto de días-auditor por sitio designado en incrementos de 0.25d por organización.',
    entityLabel: 'organizaciones',
    groupingMode: 'audit',
    rows: orgRows,
    searchQuery: state.query,
    searchPlaceholder: 'Buscar organización, conglomerado, certificado, norma, auditoría o sitio...',
    searchInputId: 'tiempoSearchInput',
    clearSearchBtnId: 'clearTiempoSearchBtn',
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen,
    sortState: { column: state.sortColumn, direction: state.sortDirection },
    columnWidths: tableColumnWidths?.['tiempo-main'],
    facetCategories,
    facetSelections: state.facetSelections,
    extraColumns,
    renderCardExtra,
    actionsHtml: headerAddAuditHtml,
    loading,
    emptyStateTitle:
      orgRows.length === 0
        ? 'No hay organizaciones con certificados disponibles'
        : 'No se encontraron organizaciones en 2. Tiempo',
    emptyStateMessage:
      orgRows.length === 0
        ? 'Registre certificados y programe una auditoría con "+ Auditoría" para declarar duraciones.'
        : 'Intente ajustar la búsqueda o restablecer los filtros de la barra lateral.',
    emptyStateActionHtml: orgRows.length === 0 ? headerAddAuditHtml : '',
    pickerModalHtml,
    ...archiveProps,
  });
}

function renderTiempoDetailView(opts: {
  state: TiempoViewState;
  certRow: CertificateTiempoRow;
  effectiveAuditId: string | null;
  audits: ReadonlyArray<ProgramacionAuditEntity>;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  temporalSites: ReadonlyArray<AuditoriaSitioTemporalEntity>;
  certificados?: ReadonlyArray<CertificadoDetailEntity>;
  isStaff: boolean;
  inCardBreadcrumbHtml?: string;
  headerAddAuditHtml?: string;
}): string {
  const {
    state,
    certRow,
    effectiveAuditId,
    audits,
    programs,
    temporalSites,
    certificados = [],
    isStaff,
    inCardBreadcrumbHtml = '',
    headerAddAuditHtml = '',
  } = opts;

  const navigation = resolveAuditNavigation(certRow.certId, effectiveAuditId, audits);
  const activeAudit = navigation.activeAudit;
  const linkedCtx = getLinkedSiblingAudits(activeAudit, audits, programs);
  const distinctLinkedCertsCount = new Set(
    linkedCtx.siblings.map((sib) => sib.audit.id_certificado)
  ).size;

  const feedbackHtml = state.editErrorMessage
    ? `
      <div role="alert" data-testid="tiempo-error-banner" class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800 flex items-center gap-2">
        <span aria-hidden="true">⚠️</span>
        <span>${escapeHtml(state.editErrorMessage)}</span>
      </div>
    `
    : '';

  const renderTemporalInfoBanner = (detail: AuditTiempoDetailModel): string => {
    const note = detail.temporalNote;
    if (!note || !note.isActive) return '';

    return `
      <div
        data-testid="tiempo-temporal-note"
        class="rounded-xl border border-violet-200 bg-violet-50/70 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs"
      >
        <span class="text-violet-950 min-w-0 sm:truncate leading-snug">
          Sitio Temporal activo: <strong>${escapeHtml(note.etiqueta)}</strong> · <span class="font-mono font-bold tabular-nums whitespace-nowrap">${note.diasDeclarados.toFixed(2)} d</span>
        </span>
        <button
          type="button"
          data-action="audit-breadcrumb-nav"
          data-target-subview="designacion/temporal"
          class="text-[11px] font-bold text-violet-800 hover:text-violet-950 hover:underline cursor-pointer whitespace-nowrap shrink-0"
        >
          Editar en 1.5 Temporal →
        </button>
      </div>
    `;
  };

  const renderSiteRow = (audit: ProgramacionAuditEntity, site: AuditoriaSitioPlanItem): string => {
    const isHq = site.numero_sitio === 0;
    const isSaving = state.savingSitePlanId === site.id;
    const currentDays = Number(site.tiempo_auditoria || 0);
    const draftStr =
      state.draftTimeBySitePlanId[site.id] !== undefined
        ? state.draftTimeBySitePlanId[site.id]
        : currentDays.toFixed(2);
    const currentModality: SiteEvaluationModality = site.modalidad_evaluacion || 'Presencial';
    const isUnallocated = currentDays < 0.25;

    return `
      <div
        data-testid="tiempo-site-row"
        data-site-plan-id="${escapeHtml(site.id)}"
        class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 rounded-xl border px-3 py-2.5 transition-colors ${
          isUnallocated ? 'border-amber-200 bg-amber-50/30' : 'border-slate-200 bg-white'
        }"
      >
        <div class="flex items-center gap-1.5 min-w-0 flex-1">
          <span class="px-1.5 py-0.5 rounded text-[10px] font-bold border ${
            isHq
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-slate-100 text-slate-700 border-slate-200'
          } whitespace-nowrap shrink-0">
            ${isHq ? 'Sitio 0 · Principal' : `Sitio #${site.numero_sitio}`}
          </span>
          <span class="text-xs sm:text-sm font-bold text-slate-900 truncate">
            ${escapeHtml(site.nombre_sitio)}
          </span>
          ${
            isUnallocated
              ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 whitespace-nowrap shrink-0">Pendiente</span>'
              : '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap shrink-0">Definido</span>'
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
                  class="h-8 rounded-lg border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-700 focus:border-slate-900 focus:outline-none disabled:opacity-60 cursor-pointer"
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
                    data-current-days="${currentDays.toFixed(2)}"
                    data-delta="-0.25"
                    ${isSaving || currentDays <= 0.25 ? 'disabled' : ''}
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
                    min="0.25"
                    step="0.25"
                    data-action="change-tiempo-site-days"
                    data-site-plan-id="${escapeHtml(site.id)}"
                    data-audit-id="${escapeHtml(audit.id)}"
                    data-site-name="${escapeHtml(site.nombre_sitio)}"
                    value="${escapeHtml(draftStr)}"
                    ${isSaving ? 'disabled' : ''}
                    aria-label="Días-auditor para ${escapeHtml(site.nombre_sitio)}"
                    class="w-20 h-7 rounded-md border border-slate-300 bg-white px-1.5 text-xs font-mono font-bold text-slate-900 text-center tabular-nums focus:border-slate-900 focus:outline-none disabled:opacity-60"
                  />
                  <button
                    type="button"
                    data-action="step-tiempo-site-days"
                    data-site-plan-id="${escapeHtml(site.id)}"
                    data-audit-id="${escapeHtml(audit.id)}"
                    data-site-name="${escapeHtml(site.nombre_sitio)}"
                    data-current-days="${currentDays.toFixed(2)}"
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
                  ${currentDays.toFixed(2)} d
                </span>
              `
          }
        </div>
      </div>
    `;
  };

  let bodyHtml = '';
  if (activeAudit) {
    const detail = buildAuditTiempoDetail({
      activeAudit,
      audits,
      programs,
      temporalSites,
      certificados,
    });

    const summaryBannerHtml = `
      <div
        data-testid="tiempo-summary-banner"
        class="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 tabular-nums"
      >
        <div class="flex items-center gap-2 text-xs sm:text-sm">
          <span class="font-semibold text-slate-700">
            Total: <strong class="font-mono text-slate-950">${detail.permanentDaysTotal.toFixed(2)} d</strong>
          </span>
          <span class="text-[11px] text-slate-500">
            · ${detail.sitesCount} sitio${detail.sitesCount === 1 ? '' : 's'}
          </span>
        </div>

        <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${
          detail.isComplete
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : 'bg-amber-50 text-amber-800 border-amber-200'
        }">
          ${
            detail.sitesCount === 0
              ? 'Pendiente · Sin sitios'
              : detail.isComplete
              ? 'Completo ✓'
              : `Pendiente (${detail.unallocatedSitesCount})`
          }
        </span>
      </div>
    `;

    const temporalNoteHtml = renderTemporalInfoBanner(detail);

    const sitesAreaHtml =
      detail.sitesCount === 0
        ? `
          <div
            data-testid="tiempo-empty-sites-state"
            class="rounded-xl border border-dashed border-amber-300 bg-amber-50/40 px-4 py-6 text-center space-y-2.5"
          >
            <p class="text-xs font-bold text-slate-900">Sin sitios permanentes designados</p>
            <div>
              <button
                type="button"
                data-action="audit-breadcrumb-nav"
                data-target-subview="designacion/sitio"
                class="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer inline-flex items-center gap-1.5"
              >
                <span>Ir a 1.4 Sitio</span>
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>
        `
        : `
          <div class="space-y-2">
            ${detail.activeSites.map((site) => renderSiteRow(activeAudit, site)).join('')}
          </div>
        `;

    const footerActionsHtml = `
      <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 text-[11px] font-semibold">
        <button
          type="button"
          data-action="audit-breadcrumb-nav"
          data-target-subview="designacion/temporal"
          class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 transition-colors cursor-pointer whitespace-nowrap"
        >
          ← 1.5 Temporal
        </button>
        <button
          type="button"
          data-action="audit-breadcrumb-nav"
          data-target-subview="auditor"
          class="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white transition-colors cursor-pointer whitespace-nowrap"
        >
          Ir a 3. Auditor →
        </button>
      </div>
    `;

    bodyHtml = `
      <div class="space-y-3">
        ${summaryBannerHtml}
        ${temporalNoteHtml}
        ${sitesAreaHtml}
        ${footerActionsHtml}
      </div>
    `;
  }

  return renderAuditSectionShell({
    sectionTitle: 'Tiempo',
    sectionSymbol: '⏳',
    backSubview: 'tiempo',
    certInfo: {
      id: certRow.certId,
      id_organizacion: certRow.id_organizacion ?? activeAudit?.id_organizacion ?? null,
      numero_certificado: certRow.numero_certificado,
      organizacion_nombre: certRow.organizacion_nombre,
      organizacion_abreviacion: certRow.organizacion_abreviacion,
      norma_codigo: certRow.norma_codigo,
      estatus: certRow.estatus,
      version_numero: certRow.activeVersionNumero,
      alcance_es: certRow.alcance_es,
      alcance_en: certRow.alcance_en,
      hasAlcance: certRow.hasAlcance,
    },
    certificados,
    navigation,
    programs,
    linkedSiblings: linkedCtx.siblings,
    showLinkedSiblings: distinctLinkedCertsCount > 1,
    isStaff,
    inCardBreadcrumbHtml,
    headerAddAuditHtml,
    tableName: 'auditoria',
    feedbackHtml,
    bodyHtml,
  });
}

