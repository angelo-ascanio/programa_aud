import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import type { OrganizacionEntity } from '../lib/activeCertificates';
import type { ConglomeradoEntity } from '../lib/conglomeradoDomain';
import type { VinculoEntity } from '../lib/vinculoDomain';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import type { CertificateRecord } from '../lib/searchControls';
import {
  formatAuditDateLabel,
  roundAuditDaysQuarter,
  type AuditDateEntry,
  type AuditoriaSitioPlanItem,
  type ProgramaAuditoriaEntity,
  type SiteEvaluationModality,
} from '../lib/auditPlanningEngine';
import type { ProgramacionAuditEntity } from '../lib/auditExecution';
import { resolveAuditNavigation } from '../lib/certificateAuditSelector';
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
import {
  formatAuditCodename,
  getAuditCodenameTooltip,
  resolveShortOrganizacionName,
} from '../lib/codenameDomain';

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

const QUICK_DAY_PRESETS: ReadonlyArray<number> = [0.5, 1.0, 2.0, 3.0];

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
        class="rounded-xl border border-violet-200 bg-violet-50/70 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
      >
        <div class="space-y-0.5 min-w-0">
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="px-1.5 py-0.2 rounded text-[10px] font-bold bg-violet-100 text-violet-900 border border-violet-200">
              SITIO TEMPORAL ACTIVO (1.5 Temporal)
            </span>
            <span class="font-bold text-violet-950 truncate">${escapeHtml(note.etiqueta)}</span>
            <span class="font-mono font-bold text-violet-900 bg-white border border-violet-200 rounded px-1.5 py-0.2 tabular-nums">
              ${note.diasDeclarados.toFixed(2)} días-auditor declarados
            </span>
          </div>
          <p class="text-[11px] text-violet-800">
            El tiempo del Sitio Temporal se declara en <strong>1.5 Temporal</strong>${
              note.ubicacion ? ` (${escapeHtml(note.ubicacion)})` : ''
            } y también requerirá asignación de auditores en <strong>3. Auditor</strong>.
          </p>
        </div>
        <button
          type="button"
          data-action="audit-breadcrumb-nav"
          data-target-subview="designacion/temporal"
          class="px-2.5 py-1.5 rounded-lg border border-violet-300 bg-white hover:bg-violet-100 text-violet-900 text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          Ver en 1.5 Temporal →
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
        class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 rounded-xl border px-3.5 py-3 transition-colors ${
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
              ${isHq ? 'Sitio 0 · Principal' : `Sitio #${site.numero_sitio}`}
            </span>
            <span class="text-xs sm:text-sm font-bold text-slate-900 truncate">
              ${escapeHtml(site.nombre_sitio)}
            </span>
            ${
              isUnallocated
                ? '<span class="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 whitespace-nowrap">Pendiente</span>'
                : '<span class="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap">Definido</span>'
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

                <div class="inline-flex items-center gap-1">
                  ${QUICK_DAY_PRESETS.map(
                    (presetVal) => `
                      <button
                        type="button"
                        data-action="set-tiempo-site-days-preset"
                        data-site-plan-id="${escapeHtml(site.id)}"
                        data-audit-id="${escapeHtml(audit.id)}"
                        data-site-name="${escapeHtml(site.nombre_sitio)}"
                        data-days="${presetVal.toFixed(2)}"
                        ${isSaving ? 'disabled' : ''}
                        class="h-7 px-2 rounded-md border text-[10px] font-mono font-bold tabular-nums cursor-pointer transition-colors ${
                          Math.abs(currentDays - presetVal) < 0.001
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                        }"
                      >
                        ${presetVal.toFixed(presetVal % 1 === 0 ? 1 : 2)}d
                      </button>
                    `
                  ).join('')}
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
      <section
        data-testid="tiempo-summary-banner"
        class="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 via-white to-indigo-50/30 p-4 shadow-2xs space-y-2.5"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-2 text-xs sm:text-sm tabular-nums">
            <div class="px-3 py-1.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
              <span class="text-slate-500 font-medium">Sitios Permanentes:</span>
              <strong class="font-mono text-slate-900 ml-1">${detail.sitesCount} sitio${detail.sitesCount === 1 ? '' : 's'}</strong>
            </div>
            <div class="px-3.5 py-1.5 rounded-xl bg-slate-900 text-white shadow-2xs">
              <span class="text-slate-300 font-medium">Total de Días de la Auditoría:</span>
              <strong class="font-mono font-bold ml-1">${detail.permanentDaysTotal.toFixed(2)} días-auditor</strong>
            </div>
            ${
              detail.temporalNote?.isActive
                ? `
                  <div class="px-3 py-1.5 rounded-xl bg-white border border-violet-200 shadow-2xs">
                    <span class="text-violet-700 font-medium">+ Sitio Temporal:</span>
                    <strong class="font-mono text-violet-900 ml-1">${detail.temporalNote.diasDeclarados.toFixed(2)} d</strong>
                  </div>
                `
                : ''
            }
          </div>

          <span class="px-2.5 py-1 rounded-full text-[11px] font-bold border whitespace-nowrap ${
            detail.isComplete
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-amber-50 text-amber-800 border-amber-200'
          }">
            ${
              detail.sitesCount === 0
                ? 'Pendiente: sin sitios designados'
                : detail.isComplete
                ? 'Completo ✓'
                : `Pendiente (${detail.unallocatedSitesCount} sitio${detail.unallocatedSitesCount === 1 ? '' : 's'} sin tiempo)`
            }
          </span>
        </div>

        ${renderTemporalInfoBanner(detail)}
      </section>
    `;

    const sitesAreaHtml =
      detail.sitesCount === 0
        ? `
          <div
            data-testid="tiempo-empty-sites-state"
            class="rounded-2xl border border-amber-200 bg-amber-50/40 p-6 text-center space-y-3"
          >
            <div class="text-2xl select-none" aria-hidden="true">📍</div>
            <h3 class="text-sm font-bold text-slate-900">Esta auditoría aún no tiene sitios designados</h3>
            <p class="text-xs text-slate-600 max-w-md mx-auto">
              Designe primero los sitios permanentes evaluables en <strong>1. Designación → Sitio</strong> para poder declarar sus días-auditor (0.25d).
            </p>
            <div class="pt-1 flex justify-center">
              <button
                type="button"
                data-action="audit-breadcrumb-nav"
                data-target-subview="designacion/sitio"
                class="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer inline-flex items-center gap-1.5"
              >
                <span>Ir a 1. Designación → Sitio</span>
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>
        `
        : `
          <section class="space-y-2.5">
            <div class="flex items-center justify-between gap-2">
              <h3 class="text-xs font-bold uppercase tracking-wider text-slate-600">
                Sitios Designados de la Auditoría (${detail.sitesCount})
              </h3>
              <span class="text-[11px] text-slate-500">
                Mínimo 0.25 d · Incrementos exactos de 0.25 d
              </span>
            </div>
            <div class="space-y-2">
              ${detail.activeSites.map((site) => renderSiteRow(activeAudit, site)).join('')}
            </div>
          </section>
        `;

    const footerActionsHtml = `
      <div class="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200">
        <span class="text-[11px] text-slate-500">
          Defina los días-auditor por sitio en incrementos de 0.25d antes de asignar el equipo en <strong>3. Auditor</strong>.
        </span>
        <div class="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
          <button
            type="button"
            data-action="audit-breadcrumb-nav"
            data-target-subview="designacion/sitio"
            class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 transition-colors cursor-pointer whitespace-nowrap"
          >
            ← 1.4 Sitio
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
      </div>
    `;

    bodyHtml = `
      <div class="space-y-4">
        ${summaryBannerHtml}
        ${sitesAreaHtml}
        ${footerActionsHtml}
      </div>
    `;
  }

  return renderAuditSectionShell({
    sectionTitle: '2. Tiempo',
    sectionSymbol: '⏳',
    backSubview: 'tiempo',
    certInfo: {
      id: certRow.certId,
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
    showLinkedSiblings: false,
    isStaff,
    inCardBreadcrumbHtml,
    headerAddAuditHtml,
    tableName: 'auditoria',
    feedbackHtml,
    bodyHtml,
  });
}

