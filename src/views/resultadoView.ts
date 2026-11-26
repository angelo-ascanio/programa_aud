import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import {
  canMutateAuditExecution,
  isApprovedStaffProfile,
} from '../lib/accessControl';
import {
  DEFAULT_AUDIT_ALERT_CONFIG,
  type AlertConfigEntity,
} from '../lib/auditAlertsEngine';
import type { OrganizacionEntity } from '../lib/activeCertificates';
import type { ConglomeradoEntity } from '../lib/conglomeradoDomain';
import type { VinculoEntity } from '../lib/vinculoDomain';
import type { ProgramaAuditoriaEntity } from '../lib/auditPlanningEngine';
import type { AuditoriaSitioTemporalEntity } from '../lib/designacionTemporalDomain';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import type { CertificateRecord } from '../lib/searchControls';
import { resolveCertVersionSnapshotForAudit } from '../lib/certificadoVersionDomain';
import { resolveAuditNavigation } from '../lib/certificateAuditSelector';
import { resolveShortOrganizacionName } from '../lib/codenameDomain';
import {
  buildOrgCertPickerModalModel,
  buildOrgMultiViewRows,
  type OrgMultiViewRow,
} from '../lib/orgMultiViewPickerDomain';
import { mergeCertSourcesForOrgPicker } from '../lib/designacionTipoDomain';
import {
  getPhase5FindingTypeMeta,
  type Phase5FindingEntity,
  type ProgramacionAuditEntity,
  type ResultadoViewState,
} from '../lib/auditExecution';
import {
  buildCertificateResultadoRows,
  buildResultadoOrgFacetCategories,
  computeNcLimitsFromLatestReal,
  createResultadoOrgCertMetaResolver,
  evaluateNcCardStatus,
  extractDiscreteRealDates,
  filterRequirementsForAuditNorma,
  resolveCierreOffsetDays,
  resolveMaxRealDateIso,
  resolvePlanOffsetDays,
  type CertificateResultadoRow,
  type ResultadoOrgCertMeta,
} from '../lib/resultadoDomain';
import type { ColumnDefinition } from '../lib/universalTemplate';
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

export type { ResultadoViewState };

export interface ResultadoViewProps {
  profile: UserProfile;
  state: ResultadoViewState;
  audits: ProgramacionAuditEntity[];
  findings: Phase5FindingEntity[];
  processes: Array<{ id: string; nombre_proceso: string }>;
  requirements: Array<{ id: string; codigo: string; norma: string; titulo?: string }>;
  temporalSites?: ReadonlyArray<AuditoriaSitioTemporalEntity>;
  alertConfig?: AlertConfigEntity;
  programs?: ReadonlyArray<ProgramaAuditoriaEntity>;
  vinculos?: ReadonlyArray<VinculoEntity>;
  conglomerados?: ReadonlyArray<ConglomeradoEntity>;
  organizaciones?: ReadonlyArray<OrganizacionEntity>;
  authorizedClientOrgIds?: ReadonlyArray<string>;
  certificados?: ReadonlyArray<CertificadoDetailEntity>;
  certificates?: ReadonlyArray<CertificateRecord>;
  tableColumnWidths?: Record<string, Record<string, number>>;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
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
 * Step 3.3 — `6. Resultado` (`#/auditorias/resultado`):
 * - Organization-Based Multi View + grouped Pop-up Modal (`Última Auditoría`, `Fechas Reales`,
 *   `Hallazgos / NCs`) + compact `⚙ Plazos NC (+15d / +45d)` popup modal.
 * - Detail View via `renderAuditSectionShell` (`◀ / ▶` only, `showLinkedSiblings: false`)
 *   with strictly 2 blocks:
 *     Bloque A: Discrete Real Audit Dates (`REAL`) add / remove.
 *     Bloque B: Clause-only Non-Conformities (`id_proceso = NULL`) with automatic
 *               `MAX(fecha_real) + Plan/Cierre` limits & individual `Fecha Real Plan` / `Fecha Real Cierre`.
 */
export function renderResultadoView(props: ResultadoViewProps): string {
  const {
    profile,
    state,
    audits,
    findings,
    requirements,
    alertConfig = DEFAULT_AUDIT_ALERT_CONFIG,
    programs = [],
    vinculos = [],
    conglomerados = [],
    organizaciones = [],
    authorizedClientOrgIds = [],
    certificados = [],
    certificates = [],
    tableColumnWidths,
    loading = false,
    archiveConfig,
    inCardBreadcrumbHtml = '',
    headerAddAuditHtml = '',
  } = props;

  const isStaff = isApprovedStaffProfile(profile);
  const auditsPool = mergeAuditsPool(audits, programs);
  const activeFindings = findings.filter((f) => !f.deleted_at);

  const allRows = buildCertificateResultadoRows({
    audits: auditsPool,
    findings: activeFindings,
    certificados,
    certificates,
  });

  const resolvedCertId =
    state.selectedCertId && allRows.some((r) => r.certId === state.selectedCertId)
      ? state.selectedCertId
      : state.selectedResultAuditId
      ? auditsPool.find((a) => a.id === state.selectedResultAuditId)?.id_certificado ?? null
      : null;

  const resolvedHeaderAddAuditHtml = headerAddAuditHtml || renderAddAuditButton(isStaff);
  const offsetsModalHtml =
    isStaff && (state.isNcOffsetsModalOpen || state.isEditingAlertOffsets)
      ? renderNcOffsetsModal(state, alertConfig)
      : '';

  if (resolvedCertId) {
    const certRow = allRows.find((r) => r.certId === resolvedCertId) ?? null;
    if (certRow) {
      return renderResultadoDetailView({
        profile,
        isStaff,
        state,
        certRow,
        audits: auditsPool,
        programs,
        certificados,
        findings: activeFindings,
        requirements,
        alertConfig,
        inCardBreadcrumbHtml,
        headerAddAuditHtml: resolvedHeaderAddAuditHtml,
        modalsHtml: offsetsModalHtml,
      });
    }
  }

  return renderResultadoMultiView({
    profile,
    isStaff,
    state,
    auditsPool,
    programs,
    activeFindings,
    vinculos,
    conglomerados,
    organizaciones,
    authorizedClientOrgIds,
    certificados,
    certificates,
    alertConfig,
    tableColumnWidths,
    loading,
    archiveConfig,
    headerAddAuditHtml: resolvedHeaderAddAuditHtml,
    modalsHtml: offsetsModalHtml,
  });
}

function renderNcOffsetsModal(
  state: ResultadoViewState,
  alertConfig: AlertConfigEntity
): string {
  const planDays = resolvePlanOffsetDays(alertConfig);
  const cierreDays = resolveCierreOffsetDays(alertConfig);
  const draftPlan =
    state.alertOffsetDraft?.dias_limite_plan_nc ??
    state.alertOffsetDraft?.dias_limite_plan_accion ??
    String(planDays);
  const draftCierre =
    state.alertOffsetDraft?.dias_limite_cierre_nc ?? String(cierreDays);

  return `
    <div
      id="ncOffsetsModalBackdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ncOffsetsModalTitle"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-[1px] p-4"
    >
      <div class="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div class="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 bg-slate-50">
          <div>
            <h2 id="ncOffsetsModalTitle" class="text-sm font-bold text-slate-900">
              ⚙ Configurar Plazos de No Conformidades
            </h2>
            <p class="text-[11px] text-slate-500 mt-0.5">
              Días calendario calculados automáticamente desde la última fecha real auditada.
            </p>
          </div>
          <button
            type="button"
            data-action="close-nc-offsets-modal"
            aria-label="Cerrar configuración de plazos NC"
            class="h-8 w-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 text-sm font-bold cursor-pointer inline-flex items-center justify-center"
          >
            ×
          </button>
        </div>

        <form id="resultadoAlertOffsetsForm" class="p-5 space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label for="offsetPlanDaysInput" class="block text-xs font-bold text-slate-700 mb-1">
                Días para Plan de Acción
              </label>
              <input
                type="number"
                id="offsetPlanDaysInput"
                name="dias_limite_plan_nc"
                min="1"
                max="365"
                required
                value="${escapeHtml(draftPlan)}"
                ${state.savingAlertOffsets ? 'disabled' : ''}
                class="w-full text-sm font-mono font-semibold rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
              />
              <span class="block text-[11px] text-slate-500 mt-1">Por defecto: +15 días</span>
            </div>

            <div>
              <label for="offsetCierreDaysInput" class="block text-xs font-bold text-slate-700 mb-1">
                Días para Cierre de NC
              </label>
              <input
                type="number"
                id="offsetCierreDaysInput"
                name="dias_limite_cierre_nc"
                min="1"
                max="365"
                required
                value="${escapeHtml(draftCierre)}"
                ${state.savingAlertOffsets ? 'disabled' : ''}
                class="w-full text-sm font-mono font-semibold rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
              />
              <span class="block text-[11px] text-slate-500 mt-1">Por defecto: +45 días</span>
            </div>
          </div>

          ${
            state.alertOffsetError
              ? `<div class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">⚠️ ${escapeHtml(state.alertOffsetError)}</div>`
              : ''
          }

          <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              data-action="close-nc-offsets-modal"
              class="h-9 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              id="saveNcOffsetsBtn"
              ${state.savingAlertOffsets ? 'disabled' : ''}
              class="h-9 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-bold cursor-pointer"
            >
              ${state.savingAlertOffsets ? 'Guardando...' : 'Guardar Configuración'}
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function summarizeOrgResultado(row: OrgMultiViewRow<ResultadoOrgCertMeta>): {
  certsWithRealCount: number;
  totalRealDates: number;
  openNcs: number;
  closedNcs: number;
  totalNcs: number;
  completeCount: number;
  statusLabel: string;
  badgeClass: string;
} {
  let certsWithRealCount = 0;
  let totalRealDates = 0;
  let openNcs = 0;
  let closedNcs = 0;
  let totalNcs = 0;
  let completeCount = 0;

  for (const cert of row.certificates) {
    const ex = cert.domainExtra;
    if (ex.realDatesCount > 0) certsWithRealCount += 1;
    totalRealDates += ex.realDatesCount;
    openNcs += ex.openNcsCount;
    closedNcs += ex.closedNcsCount;
    totalNcs += ex.totalNcsCount;
    if (ex.statusKey === 'COMPLETO') completeCount += 1;
  }

  if (openNcs > 0) {
    return {
      certsWithRealCount,
      totalRealDates,
      openNcs,
      closedNcs,
      totalNcs,
      completeCount,
      statusLabel: 'Con NCs Abiertas',
      badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
    };
  }
  if (row.certificates.length > 0 && completeCount === row.certificates.length) {
    return {
      certsWithRealCount,
      totalRealDates,
      openNcs,
      closedNcs,
      totalNcs,
      completeCount,
      statusLabel: 'Completo ✓',
      badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    };
  }
  return {
    certsWithRealCount,
    totalRealDates,
    openNcs,
    closedNcs,
    totalNcs,
    completeCount,
    statusLabel: 'Pendiente',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  };
}

function renderResultadoMultiView(opts: {
  profile: UserProfile;
  isStaff: boolean;
  state: ResultadoViewState;
  auditsPool: ReadonlyArray<ProgramacionAuditEntity>;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  activeFindings: ReadonlyArray<Phase5FindingEntity>;
  vinculos: ReadonlyArray<VinculoEntity>;
  conglomerados: ReadonlyArray<ConglomeradoEntity>;
  organizaciones: ReadonlyArray<OrganizacionEntity>;
  authorizedClientOrgIds: ReadonlyArray<string>;
  certificados: ReadonlyArray<CertificadoDetailEntity>;
  certificates: ReadonlyArray<CertificateRecord>;
  alertConfig: AlertConfigEntity;
  tableColumnWidths?: Record<string, Record<string, number>>;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  headerAddAuditHtml?: string;
  modalsHtml?: string;
}): string {
  const {
    profile,
    isStaff,
    state,
    auditsPool,
    programs,
    activeFindings,
    vinculos,
    conglomerados,
    organizaciones,
    authorizedClientOrgIds,
    certificados,
    certificates,
    alertConfig,
    tableColumnWidths,
    loading = false,
    archiveConfig,
    headerAddAuditHtml = '',
    modalsHtml = '',
  } = opts;

  const planDays = resolvePlanOffsetDays(alertConfig);
  const cierreDays = resolveCierreOffsetDays(alertConfig);

  const mergedCerts = mergeCertSourcesForOrgPicker({
    certificados,
    certificates,
    audits: auditsPool,
    organizaciones,
  });

  const resolveCertMeta = createResultadoOrgCertMetaResolver({
    findings: activeFindings,
  });

  const orgRows = buildOrgMultiViewRows<ResultadoOrgCertMeta>({
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

  const facetCategories = buildResultadoOrgFacetCategories(orgRows);

  const extraColumns: ColumnDefinition<OrgMultiViewRow<ResultadoOrgCertMeta>>[] = [
    {
      id: 'reales',
      header: 'Fechas Reales',
      sortable: true,
      defaultWidthPct: 13,
      minWidthPx: 120,
      getValue: (r) => summarizeOrgResultado(r).totalRealDates,
      renderCell: (r) => {
        const stats = summarizeOrgResultado(r);
        return `
          <div class="min-w-0 space-y-0.5 tabular-nums">
            <span class="inline-flex px-2 py-0.5 rounded-md text-xs font-semibold border ${
              stats.totalRealDates > 0
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-slate-100 text-slate-600 border-slate-200'
            }">
              ${stats.certsWithRealCount}/${r.certsCount} con real
            </span>
            <div class="text-[11px] text-slate-500 truncate">${stats.totalRealDates} día(s)</div>
          </div>
        `;
      },
    },
    {
      id: 'ncs',
      header: 'NCs / Estado',
      sortable: true,
      defaultWidthPct: 13,
      minWidthPx: 120,
      getValue: (r) => {
        const stats = summarizeOrgResultado(r);
        return stats.openNcs * 1000 + stats.totalNcs;
      },
      renderCell: (r) => {
        const stats = summarizeOrgResultado(r);
        const ncText =
          stats.totalNcs === 0
            ? '0 NCs'
            : `${stats.openNcs} abierta(s) / ${stats.closedNcs} cerrada(s)`;
        return `
          <div class="min-w-0 space-y-0.5">
            <span class="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border truncate max-w-full ${stats.badgeClass}">
              ${escapeHtml(stats.statusLabel)}
            </span>
            <div class="text-[11px] font-medium text-slate-600 truncate">${escapeHtml(ncText)}</div>
          </div>
        `;
      },
    },
  ];

  const renderCardExtra = (r: OrgMultiViewRow<ResultadoOrgCertMeta>): string => {
    const stats = summarizeOrgResultado(r);
    const ncText =
      stats.totalNcs === 0
        ? '0 NCs'
        : `${stats.openNcs} abierta(s) / ${stats.closedNcs} cerrada(s)`;
    return `
      <div class="grid grid-cols-2 gap-2 text-xs bg-slate-50 border border-slate-100 rounded-lg p-2">
        <div class="min-w-0">
          <div class="text-[10px] font-semibold uppercase text-slate-500">Reales</div>
          <div class="font-semibold text-slate-800 truncate">${stats.certsWithRealCount}/${r.certsCount} con real</div>
        </div>
        <div class="min-w-0">
          <div class="text-[10px] font-semibold uppercase text-slate-500">Hallazgos</div>
          <div class="font-semibold text-slate-800 truncate">${escapeHtml(ncText)}</div>
        </div>
      </div>
    `;
  };

  const pickerModel = state.pickerOrgId
    ? buildOrgCertPickerModalModel<ResultadoOrgCertMeta>({
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

  const pickerDomainColumns: OrgPickerDomainColumn<ResultadoOrgCertMeta>[] = [
    {
      id: 'ultima_auditoria',
      header: 'Última Auditoría',
      defaultWidthPct: 16,
      minWidthPx: 140,
      renderCell: (row) => {
        const meta = row.domainExtra;
        return `
          <div class="min-w-0" title="${escapeHtml(meta.latestAuditTooltip)}">
            <div class="font-semibold text-slate-800 truncate">${escapeHtml(meta.latestAuditCodename)}</div>
            <div class="text-[11px] font-mono text-slate-500 truncate">${escapeHtml(meta.latestAuditDateLabel)}</div>
          </div>
        `;
      },
    },
    {
      id: 'fechas_reales',
      header: 'Fechas Reales',
      defaultWidthPct: 16,
      minWidthPx: 125,
      renderCell: (row) => {
        const meta = row.domainExtra;
        return `
          <span class="inline-flex px-2 py-0.5 rounded-md text-xs font-semibold border ${
            meta.realDatesCount > 0
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-slate-100 text-slate-600 border-slate-200'
          }">
            ${escapeHtml(meta.realDatesLabel)}
          </span>
        `;
      },
    },
    {
      id: 'hallazgos_ncs',
      header: 'Hallazgos / NCs',
      defaultWidthPct: 16,
      minWidthPx: 145,
      renderCell: (row) => {
        const meta = row.domainExtra;
        return `
          <div class="min-w-0 space-y-0.5">
            <div class="text-xs font-semibold text-slate-800 truncate">${escapeHtml(meta.ncsLabel)}</div>
            <span class="inline-flex px-2 py-0.2 rounded-full text-[10px] font-bold border ${meta.statusBadgeClass}">
              ${escapeHtml(meta.statusLabel)}
            </span>
          </div>
        `;
      },
    },
  ];

  const pickerModalHtml = pickerModel
    ? renderOrgCertPickerModal<ResultadoOrgCertMeta>({
        model: pickerModel,
        domainColumns: pickerDomainColumns,
        subtitle:
          'Seleccione un certificado (agrupado por auditoría vinculada) para registrar fechas reales y No Conformidades.',
        emptySearchMessage:
          'No se encontraron certificados ni resultados que coincidan con la búsqueda.',
      })
    : '';

  const actionsHtml = `
    <div class="flex flex-wrap items-center gap-2">
      ${headerAddAuditHtml}
      ${
        isStaff
          ? `
            <button
              type="button"
              id="openNcOffsetsModalBtn"
              data-action="open-nc-offsets-modal"
              class="h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold cursor-pointer inline-flex items-center gap-1.5 shadow-2xs"
            >
              <span aria-hidden="true">⚙</span>
              <span>Plazos NC (+${planDays}d / +${cierreDays}d)</span>
            </button>
          `
          : ''
      }
    </div>
  `;

  const feedbackBanner = state.alertOffsetSuccess
    ? `<div class="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800 mb-3">${escapeHtml(state.alertOffsetSuccess)}</div>`
    : '';

  const archiveProps = extractUniversalArchiveProps(archiveConfig, 'resultado');

  return renderOrgMultiView<ResultadoOrgCertMeta>({
    domainKey: 'resultado',
    tableId: 'resultado-main',
    title: 'Resultado de Auditorías',
    subtitle:
      'Registro de fechas reales discretas y No Conformidades por cláusula de norma por organización.',
    entityLabel: 'organizaciones en resultado',
    groupingMode: 'audit',
    rows: orgRows,
    searchQuery: state.searchQuery,
    searchPlaceholder: 'Buscar organización, conglomerado, certificado, norma o auditoría... (/)',
    searchInputId: 'resultadoSearchInput',
    clearSearchBtnId: 'clearResultadoSearchBtn',
    viewMode: state.displayMode === 'kanban' ? 'grid' : 'list',
    isSidebarOpen: state.isSidebarOpen ?? true,
    sortState: {
      column: state.sortColumn ?? null,
      direction: state.sortDirection ?? 'none',
    },
    columnWidths: tableColumnWidths?.['resultado-main'],
    facetCategories,
    facetSelections: state.facetSelections ?? {},
    extraColumns,
    renderCardExtra,
    topBannerHtml: feedbackBanner,
    actionsHtml,
    emptyStateTitle:
      orgRows.length === 0
        ? 'No hay organizaciones con certificados en Resultado'
        : 'No hay organizaciones que coincidan con el filtro',
    emptyStateMessage:
      orgRows.length === 0
        ? 'Registre certificados y programe una auditoría con "+ Auditoría" para capturar resultados.'
        : 'Ajuste la búsqueda o seleccione otro estado para inspeccionar resultados.',
    loading,
    loadingMessage: 'Cargando resultados por organización...',
    pickerModalHtml: [pickerModalHtml, modalsHtml].filter(Boolean).join('\n'),
    ...archiveProps,
  });
}

function renderResultadoDetailView(opts: {
  profile: UserProfile;
  isStaff: boolean;
  state: ResultadoViewState;
  certRow: CertificateResultadoRow;
  audits: ReadonlyArray<ProgramacionAuditEntity>;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  certificados?: ReadonlyArray<CertificadoDetailEntity>;
  findings: ReadonlyArray<Phase5FindingEntity>;
  requirements: Array<{ id: string; codigo: string; norma: string; titulo?: string }>;
  alertConfig: AlertConfigEntity;
  inCardBreadcrumbHtml: string;
  headerAddAuditHtml: string;
  modalsHtml: string;
}): string {
  const {
    profile,
    isStaff,
    state,
    certRow,
    audits,
    programs,
    certificados = [],
    findings,
    requirements,
    alertConfig,
    inCardBreadcrumbHtml,
    headerAddAuditHtml,
    modalsHtml,
  } = opts;

  const preferredAuditId = state.selectedResultAuditId ?? certRow.latestAudit?.id ?? null;
  const navigation = resolveAuditNavigation(
    certRow.certId,
    preferredAuditId,
    audits
  );
  const activeAudit = navigation.activeAudit;

  const canEditExecution = canMutateAuditExecution(activeAudit, profile);
  const planDays = resolvePlanOffsetDays(alertConfig);
  const cierreDays = resolveCierreOffsetDays(alertConfig);

  const extraHeaderActionsHtml = isStaff
    ? `
      <button
        type="button"
        id="openNcOffsetsModalBtn"
        data-action="open-nc-offsets-modal"
        class="h-8 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold cursor-pointer inline-flex items-center gap-1"
      >
        <span aria-hidden="true">⚙</span>
        <span>Plazos NC (+${planDays}d / +${cierreDays}d)</span>
      </button>
    `
    : '';

  const feedbackMessages = [
    state.realDateError,
    state.findingFormError,
    state.findingDatesError,
  ].filter((m): m is string => Boolean(m));
  const successMessages = [
    state.realDateSuccess,
    state.findingDatesSuccess,
    state.alertOffsetSuccess,
  ].filter((m): m is string => Boolean(m));

  const feedbackHtml = [
    ...feedbackMessages.map(
      (msg) =>
        `<div class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-800">⚠️ ${escapeHtml(msg)}</div>`
    ),
    ...successMessages.map(
      (msg) =>
        `<div class="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800">✓ ${escapeHtml(msg)}</div>`
    ),
  ].join('');

  const activeSnapshot =
    activeAudit && certificados.length > 0
      ? resolveCertVersionSnapshotForAudit(activeAudit, certificados)
      : null;
  const excludedReqIds = new Set(
    (activeSnapshot?.noAplicables ?? [])
      .map((na) => na.id_requisito)
      .filter(Boolean)
  );

  let bodyHtml = '';
  if (activeAudit) {
    const discreteDates = extractDiscreteRealDates(activeAudit);
    const maxRealIso = resolveMaxRealDateIso(activeAudit);
    const limits = computeNcLimitsFromLatestReal(maxRealIso, alertConfig);

    const allowedRequirements = filterRequirementsForAuditNorma(
      requirements,
      activeAudit.norma_codigo,
      excludedReqIds.size > 0 ? excludedReqIds : undefined
    );
    const clauseTitleMap = new Map<string, string>();
    for (const r of requirements) {
      if (r.titulo) clauseTitleMap.set(r.id, r.titulo);
    }

    const auditFindings = findings
      .filter((f) => !f.deleted_at && f.id_auditoria === activeAudit.id)
      .slice()
      .sort((a, b) => {
        const aNc = a.tipo === 'NC_MAYOR' || a.tipo === 'NC_MENOR' ? 0 : 1;
        const bNc = b.tipo === 'NC_MAYOR' || b.tipo === 'NC_MENOR' ? 0 : 1;
        if (aNc !== bNc) return aNc - bNc;
        return a.codigo_hallazgo.localeCompare(b.codigo_hallazgo, 'es');
      });

    // Bloque A — Fechas Reales Auditadas (discretas 1:N)
    const blockAHtml = `
      <section data-testid="resultado-block-real-dates" class="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3.5">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
          <div>
            <h3 class="text-sm font-bold text-slate-900">Bloque A · Fechas Reales Auditadas</h3>
            <p class="text-xs text-slate-500">
              Registre cada día real auditado de forma individual (puede agregar días sueltos o consecutivos).
            </p>
          </div>
          <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
            discreteDates.length > 0
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-amber-50 text-amber-800 border-amber-200'
          }">
            ${discreteDates.length} ${discreteDates.length === 1 ? 'día registrado' : 'días registrados'}
          </span>
        </div>

        <div class="flex flex-wrap items-center gap-2 min-h-8">
          ${
            discreteDates.length > 0
              ? discreteDates
                  .map(
                    (d) => `
                      <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-xs font-mono font-bold text-slate-800">
                        <span>${escapeHtml(d.dmyLabel)}</span>
                        ${
                          canEditExecution
                            ? `
                              <button
                                type="button"
                                data-action="archive-resultado-real-date"
                                data-date-id="${escapeHtml(d.id)}"
                                data-audit-id="${escapeHtml(activeAudit.id)}"
                                aria-label="Remover fecha real ${escapeHtml(d.dmyLabel)}"
                                class="ml-0.5 h-4 w-4 rounded hover:bg-rose-100 text-slate-500 hover:text-rose-700 text-xs font-bold cursor-pointer inline-flex items-center justify-center"
                              >
                                ×
                              </button>
                            `
                            : ''
                        }
                      </span>
                    `
                  )
                  .join('')
              : `<span class="text-xs text-slate-500">Sin fechas reales registradas todavía.</span>`
          }
        </div>

        ${
          canEditExecution
            ? `
              <form id="resultadoAddRealDateForm" data-audit-id="${escapeHtml(activeAudit.id)}" class="flex flex-wrap items-end gap-2.5 pt-1">
                <div>
                  <label for="resultadoNewRealDate" class="block text-xs font-bold text-slate-700 mb-1">
                    Fecha exacta auditada
                  </label>
                  <input
                    type="date"
                    id="resultadoNewRealDate"
                    name="fecha_real"
                    value="${escapeHtml(state.newRealDateDraft || '')}"
                    required
                    ${state.savingRealDate ? 'disabled' : ''}
                    class="h-9 text-xs font-mono font-semibold rounded-lg border border-slate-300 bg-white px-3 text-slate-900"
                  />
                </div>
                <button
                  type="submit"
                  id="addResultadoRealDateBtn"
                  ${state.savingRealDate ? 'disabled' : ''}
                  class="h-9 px-3.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-bold cursor-pointer inline-flex items-center gap-1.5"
                >
                  <span>+ Agregar Fecha Real</span>
                </button>
              </form>
            `
            : `<p class="text-[11px] text-slate-500">Solo lectura para el perfil actual (${escapeHtml(profile.role)}).</p>`
        }
      </section>
    `;

    // Bloque B — No Conformidades por Cláusula (`id_proceso = NULL`)
    const limitsBannerHtml = limits.hasRealDate
      ? `
        <div class="rounded-xl border border-sky-200 bg-sky-50/70 px-3.5 py-2.5 text-xs text-sky-950 font-medium">
          Última fecha real: <strong class="font-mono">${escapeHtml(limits.baseRealDmy || '')}</strong>
          · Límite Plan (+${limits.planOffsetDays}d): <strong class="font-mono">${escapeHtml(limits.planLimitDmy || '')}</strong>
          · Límite Cierre (+${limits.cierreOffsetDays}d): <strong class="font-mono">${escapeHtml(limits.cierreLimitDmy || '')}</strong>
        </div>
      `
      : `
        <div class="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900 font-medium">
          Las fechas límite (+${limits.planOffsetDays}d Plan y +${limits.cierreOffsetDays}d Cierre) se calcularán automáticamente al registrar al menos 1 fecha real en el Bloque A.
        </div>
      `;

    const newNcDraft = state.newNcDraft;
    const newNcFormHtml = canEditExecution
      ? `
        <form id="resultadoNewNcForm" data-audit-id="${escapeHtml(activeAudit.id)}" class="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
          <div class="text-xs font-bold text-slate-900">+ Nueva No Conformidad (${escapeHtml(activeAudit.norma_codigo)})</div>
          <div class="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div class="md:col-span-8">
              <label for="ncReqSelect" class="block text-xs font-bold text-slate-700 mb-1">
                Cláusula de la Norma
              </label>
              <select
                id="ncReqSelect"
                name="id_requisito"
                required
                ${state.savingNewNc || allowedRequirements.length === 0 ? 'disabled' : ''}
                class="w-full h-9 text-xs rounded-lg border border-slate-300 bg-white px-2.5 text-slate-900"
              >
                ${
                  allowedRequirements.length > 0
                    ? [
                        '<option value="">Seleccione una cláusula...</option>',
                        ...allowedRequirements.map(
                          (req) =>
                            `<option value="${escapeHtml(req.id)}" ${
                              newNcDraft?.id_requisito === req.id ? 'selected' : ''
                            }>${escapeHtml(req.label)}</option>`
                        ),
                      ].join('')
                    : `<option value="">Sin cláusulas cargadas para ${escapeHtml(activeAudit.norma_codigo)}</option>`
                }
              </select>
            </div>

            <div class="md:col-span-4">
              <label for="ncTypeSelect" class="block text-xs font-bold text-slate-700 mb-1">
                Tipo / Gravedad
              </label>
              <select
                id="ncTypeSelect"
                name="tipo"
                ${state.savingNewNc ? 'disabled' : ''}
                class="w-full h-9 text-xs rounded-lg border border-slate-300 bg-white px-2.5 text-slate-900"
              >
                <option value="NC_MENOR" ${newNcDraft?.tipo === 'NC_MAYOR' ? '' : 'selected'}>⚠️ NC Menor</option>
                <option value="NC_MAYOR" ${newNcDraft?.tipo === 'NC_MAYOR' ? 'selected' : ''}>🚨 NC Mayor</option>
              </select>
            </div>
          </div>

          <div>
            <label for="ncDescInput" class="block text-xs font-bold text-slate-700 mb-1">
              Descripción del hallazgo / evidencia
            </label>
            <textarea
              id="ncDescInput"
              name="descripcion"
              rows="2"
              required
              placeholder="Describa la desviación objetiva frente al requisito seleccionado..."
              ${state.savingNewNc ? 'disabled' : ''}
              class="w-full text-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
            >${escapeHtml(newNcDraft?.descripcion || '')}</textarea>
          </div>

          <div class="flex justify-end">
            <button
              type="submit"
              id="createClauseNcBtn"
              ${state.savingNewNc || allowedRequirements.length === 0 ? 'disabled' : ''}
              class="h-9 px-4 rounded-lg bg-sky-700 hover:bg-sky-800 disabled:opacity-60 text-white text-xs font-bold cursor-pointer inline-flex items-center gap-1.5"
            >
              <span>${state.savingNewNc ? 'Guardando NC...' : '+ Nueva No Conformidad'}</span>
            </button>
          </div>
        </form>
      `
      : '';

    const ncCardsHtml =
      auditFindings.length > 0
        ? auditFindings
            .map((f) => {
              const evalResult = evaluateNcCardStatus(
                f,
                maxRealIso,
                alertConfig,
                undefined,
                clauseTitleMap
              );
              const typeMeta = getPhase5FindingTypeMeta(f.tipo);
              const cardDraft = state.ncDatesDraftByFindingId?.[f.id];
              const planVal = cardDraft?.fecha_entrega_plan ?? evalResult.actualPlanIso ?? '';
              const cierreVal = cardDraft?.fecha_cierre_real ?? evalResult.actualCierreIso ?? '';
              const isSaving = state.savingFindingId === f.id;

              return `
                <article
                  data-testid="resultado-nc-card"
                  data-finding-id="${escapeHtml(f.id)}"
                  class="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
                >
                  <div class="flex flex-wrap items-start justify-between gap-2">
                    <div class="min-w-0 space-y-1">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="font-mono text-xs font-bold text-slate-900">${escapeHtml(f.codigo_hallazgo)}</span>
                        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border ${typeMeta.badgeClass}">
                          <span aria-hidden="true">${typeMeta.symbol}</span>
                          <span>${escapeHtml(typeMeta.shortLabel)}</span>
                        </span>
                        <span class="text-xs font-bold text-indigo-800">
                          Cláusula ${escapeHtml(evalResult.clauseLabel)}
                        </span>
                      </div>
                      <p class="text-xs text-slate-700">${escapeHtml(f.descripcion)}</p>
                    </div>

                    <div class="flex items-center gap-1.5 shrink-0">
                      <span class="inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${evalResult.statusBadgeClass}">
                        ${escapeHtml(evalResult.statusLabel)}
                      </span>
                      ${
                        isStaff
                          ? `
                            <button
                              type="button"
                              data-action="archive-finding"
                              data-finding-id="${escapeHtml(f.id)}"
                              aria-label="Archivar ${escapeHtml(f.codigo_hallazgo)}"
                              class="h-7 w-7 rounded-lg border border-slate-200 bg-white hover:bg-rose-50 hover:text-rose-700 text-slate-500 text-xs font-bold cursor-pointer inline-flex items-center justify-center"
                            >
                              ×
                            </button>
                          `
                          : ''
                      }
                    </div>
                  </div>

                  <div class="flex flex-wrap items-center gap-4 text-[11px] text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                    <span>
                      Límite Plan (+${planDays}d): <strong class="font-mono text-slate-900">${escapeHtml(evalResult.planLimitDmy)}</strong>
                      ${
                        evalResult.planComplianceNote
                          ? `<span class="ml-1 font-semibold ${
                              evalResult.planOnTime === false ? 'text-rose-700' : 'text-emerald-700'
                            }">(${escapeHtml(evalResult.planComplianceNote)})</span>`
                          : ''
                      }
                    </span>
                    <span>
                      Límite Cierre (+${cierreDays}d): <strong class="font-mono text-slate-900">${escapeHtml(evalResult.cierreLimitDmy)}</strong>
                      ${
                        evalResult.cierreComplianceNote
                          ? `<span class="ml-1 font-semibold ${
                              evalResult.cierreOnTime === false ? 'text-rose-700' : 'text-emerald-700'
                            }">(${escapeHtml(evalResult.cierreComplianceNote)})</span>`
                          : ''
                      }
                    </span>
                  </div>

                  <form
                    data-action="save-nc-dates-form"
                    data-finding-id="${escapeHtml(f.id)}"
                    data-audit-id="${escapeHtml(activeAudit.id)}"
                    class="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
                  >
                    <div class="sm:col-span-4">
                      <label class="block text-[11px] font-bold text-slate-700 mb-1">
                        Fecha Real Plan
                      </label>
                      <input
                        type="date"
                        data-nc-field="plan"
                        value="${escapeHtml(planVal)}"
                        ${!canEditExecution || isSaving ? 'disabled' : ''}
                        class="w-full h-9 text-xs font-mono rounded-lg border border-slate-300 bg-white px-2.5 text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
                      />
                    </div>

                    <div class="sm:col-span-4">
                      <label class="block text-[11px] font-bold text-slate-700 mb-1">
                        Fecha Real Cierre
                      </label>
                      <input
                        type="date"
                        data-nc-field="cierre"
                        value="${escapeHtml(cierreVal)}"
                        ${!canEditExecution || isSaving ? 'disabled' : ''}
                        class="w-full h-9 text-xs font-mono rounded-lg border border-slate-300 bg-white px-2.5 text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
                      />
                    </div>

                    <div class="sm:col-span-4 flex justify-end">
                      ${
                        canEditExecution
                          ? `
                            <button
                              type="submit"
                              ${isSaving ? 'disabled' : ''}
                              class="w-full sm:w-auto h-9 px-3.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-bold cursor-pointer whitespace-nowrap"
                            >
                              ${isSaving ? 'Guardando...' : 'Guardar fechas NC'}
                            </button>
                          `
                          : `<span class="text-[11px] text-slate-500">Solo lectura</span>`
                      }
                    </div>
                  </form>
                </article>
              `;
            })
            .join('')
        : `
          <div class="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-center text-xs text-slate-500">
            No hay No Conformidades registradas en esta auditoría.
          </div>
        `;

    const iso43ExclusionNoteHtml =
      excludedReqIds.size > 0
        ? `
          <div data-testid="resultado-iso43-exclusions-note" class="rounded-xl border border-indigo-200 bg-indigo-50/70 px-3.5 py-2 text-[11px] font-medium text-indigo-900">
            Exclusiones ISO 4.3 (v${activeSnapshot?.versionNumero ?? 1}): se omiten ${excludedReqIds.size} ${excludedReqIds.size === 1 ? 'cláusula no aplicable' : 'cláusulas no aplicables'} del selector de NC.
          </div>
        `
        : '';

    const blockBHtml = `
      <section data-testid="resultado-block-nc" class="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
          <div>
            <h3 class="text-sm font-bold text-slate-900">Bloque B · No Conformidades por Cláusula</h3>
            <p class="text-xs text-slate-500">
              Cada NC se asocia directamente a su cláusula de la norma y controla sus fechas reales de Plan y Cierre.
            </p>
          </div>
          <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold border bg-slate-100 text-slate-800 border-slate-200">
            ${auditFindings.length} ${auditFindings.length === 1 ? 'hallazgo' : 'hallazgos'}
          </span>
        </div>

        ${limitsBannerHtml}
        ${iso43ExclusionNoteHtml}
        ${newNcFormHtml}
        <div class="space-y-3">${ncCardsHtml}</div>
      </section>
    `;

    bodyHtml = `
      <div class="space-y-4">
        ${blockAHtml}
        ${blockBHtml}
      </div>
    `;
  }

  return `
    ${renderAuditSectionShell({
      sectionTitle: 'Resultado',
      sectionSymbol: '✅',
      backSubview: 'resultado',
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
      linkedSiblings: [],
      showLinkedSiblings: false,
      isStaff: canEditExecution,
      inCardBreadcrumbHtml,
      headerAddAuditHtml,
      extraHeaderActionsHtml,
      tableName: 'auditoria',
      feedbackHtml,
      bodyHtml,
      emptyAuditBodyHtml: `
        <div class="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
          Este certificado aún no tiene auditorías registradas para gestionar resultados.
        </div>
      `,
      modalsHtml,
    })}
  `;
}
