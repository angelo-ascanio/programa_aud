import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import type { OrganizacionEntity } from '../lib/activeCertificates';
import type { ConglomeradoEntity } from '../lib/conglomeradoDomain';
import type { VinculoEntity } from '../lib/vinculoDomain';
import {
  resolveLatestPlannedDate,
  roundAuditDaysQuarter,
  type ProgramaAuditoriaEntity,
} from '../lib/auditPlanningEngine';
import type { ProgramacionAuditEntity } from '../lib/auditExecution';
import {
  getLinkedSiblingAudits,
  resolveAuditNavigation,
} from '../lib/certificateAuditSelector';
import {
  buildOrgCertPickerModalModel,
  buildOrgMultiViewRows,
  type OrgMultiViewRow,
} from '../lib/orgMultiViewPickerDomain';
import {
  computeAuditUrgencyClassification,
  mergeCertSourcesForOrgPicker,
  requiresFutureYearWarning,
} from '../lib/designacionTipoDomain';
import {
  buildCertificateTemporalRows,
  buildTemporalOrgFacetCategories,
  createBatchTemporalDraftFromResolution,
  createTemporalOrgCertMetaResolver,
  resolveLinkedBatchTemporalState,
  type AuditoriaSitioTemporalEntity,
  type BatchTemporalFormDraft,
  type CertificateTemporalRow,
  type TemporalOrgCertMeta,
  type TemporalSiteFormDraft,
} from '../lib/designacionTemporalDomain';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import type { CertificateRecord } from '../lib/searchControls';
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
import {
  extractUniversalArchiveProps,
  type ArchiveMultiViewConfig,
} from '../lib/archiveGovernance';

export type DesignacionTemporalSortColumn =
  | 'organizacion'
  | 'certificados'
  | 'auditorias'
  | 'estado'
  | 'tiempo'
  | 'certificado';

export interface DesignacionTemporalViewState {
  query: string;
  viewMode: UniversalViewMode;
  isSidebarOpen: boolean;
  sortColumn: DesignacionTemporalSortColumn | null;
  sortDirection: SortDirection;
  facetSelections: MultiViewSelectionMap;
  selectedCertId: string | null;
  selectedAuditId: string | null;
  pickerOrgId?: string | null;
  pickerSearchQuery?: string;
  draftAuditId: string | null;
  batchDraft: BatchTemporalFormDraft | null;
  confirmDisableBatch: boolean;
  /** Legacy compatibility fields */
  selectedProgramId?: string | null;
  isCreatingTemporalSite?: boolean;
  editingTemporalSiteId?: string | null;
  confirmArchiveTemporalId?: string | null;
  formDraft?: TemporalSiteFormDraft;
  editErrorMessage: string | null;
  saving: boolean;
}

export const DEFAULT_DESIGNACION_TEMPORAL_STATE: DesignacionTemporalViewState = {
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
  draftAuditId: null,
  batchDraft: null,
  confirmDisableBatch: false,
  selectedProgramId: null,
  editErrorMessage: null,
  saving: false,
};

export interface DesignacionTemporalViewProps {
  profile: UserProfile;
  state: DesignacionTemporalViewState;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  audits?: ReadonlyArray<ProgramacionAuditEntity>;
  temporalSites: ReadonlyArray<AuditoriaSitioTemporalEntity>;
  vinculos: ReadonlyArray<VinculoEntity>;
  conglomerados: ReadonlyArray<ConglomeradoEntity>;
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

export function renderDesignacionTemporalView(props: DesignacionTemporalViewProps): string {
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

  const allRows = buildCertificateTemporalRows({
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

  if (resolvedCertId) {
    const certRow = allRows.find((r) => r.certId === resolvedCertId) ?? null;
    if (certRow) {
      const effectiveAuditId = state.selectedAuditId ?? legacyProgramFirstAudit?.id ?? null;
      return renderTemporalDetailView({
        state,
        certRow,
        effectiveAuditId,
        audits: auditsPool,
        programs,
        temporalSites,
        certificados,
        isStaff,
        referenceIsoDate,
        inCardBreadcrumbHtml,
        headerAddAuditHtml,
      });
    }
  }

  const mergedCerts = mergeCertSourcesForOrgPicker({
    certificados,
    certificates,
    audits: auditsPool,
    organizaciones,
  });

  const resolveCertMeta = createTemporalOrgCertMetaResolver(
    temporalSites,
    auditsPool,
    programs
  );
  const orgRows = buildOrgMultiViewRows<TemporalOrgCertMeta>({
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

  const facetCategories = buildTemporalOrgFacetCategories(orgRows);

  const extraColumns: ColumnDefinition<OrgMultiViewRow<TemporalOrgCertMeta>>[] = [
    {
      id: 'estado',
      header: 'Temporal / Tiempo',
      defaultWidthPct: 26,
      minWidthPx: 155,
      sortable: true,
      getValue: (row) => {
        const hasOn = row.certificates.some(
          (c) => c.domainExtra.temporalStatus === 'ON'
        );
        if (hasOn) return 0;
        const hasOff = row.certificates.some(
          (c) => c.domainExtra.temporalStatus === 'OFF'
        );
        return hasOff ? 1 : 2;
      },
      renderCell: (row) => {
        const onCerts = row.certificates.filter(
          (c) => c.domainExtra.temporalStatus === 'ON'
        );
        const totalDays = row.certificates.reduce(
          (sum, c) => sum + c.domainExtra.temporalDays,
          0
        );
        const badgeCls =
          onCerts.length > 0
            ? 'bg-violet-50 text-violet-900 border-violet-300'
            : row.auditsCount > 0
            ? 'bg-slate-100 text-slate-600 border-slate-200'
            : 'bg-slate-50 text-slate-400 border-slate-200';
        const statusLabel =
          onCerts.length > 0
            ? `ON (${onCerts.length} cert.)`
            : row.auditsCount > 0
            ? 'OFF · Sin temporal'
            : 'Sin auditorías';
        const subLabel =
          onCerts.length > 0
            ? `${totalDays.toFixed(2)} d · ${onCerts[0].domainExtra.temporalLabel}`
            : '0.00 d';

        return `
          <div class="min-w-0 space-y-0.5">
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${badgeCls}">
              ${escapeHtml(statusLabel)}
            </span>
            <div class="text-[11px] text-slate-500 truncate tabular-nums">
              ${escapeHtml(subLabel)}
            </div>
          </div>
        `;
      },
    },
  ];

  const renderCardExtra = (row: OrgMultiViewRow<TemporalOrgCertMeta>): string => {
    const onCerts = row.certificates.filter(
      (c) => c.domainExtra.temporalStatus === 'ON'
    );
    const totalDays = row.certificates.reduce(
      (sum, c) => sum + c.domainExtra.temporalDays,
      0
    );
    const badgeCls =
      onCerts.length > 0
        ? 'bg-violet-50 text-violet-900 border-violet-300'
        : 'bg-slate-100 text-slate-600 border-slate-200';
    return `
      <div class="flex items-center justify-between gap-2 text-[11px]">
        <span class="inline-flex items-center px-2 py-0.5 rounded-full font-bold border whitespace-nowrap ${badgeCls}">
          ${onCerts.length > 0 ? `ON (${onCerts.length})` : 'OFF · Sin temporal'}
        </span>
        <span class="font-mono font-bold text-slate-800 tabular-nums">
          ${onCerts.length > 0 ? `${totalDays.toFixed(2)} d` : '—'}
        </span>
      </div>
    `;
  };

  const pickerModel = state.pickerOrgId
    ? buildOrgCertPickerModalModel<TemporalOrgCertMeta>({
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

  const pickerDomainColumns: OrgPickerDomainColumn<TemporalOrgCertMeta>[] = [
    {
      id: 'sitio_temporal',
      header: 'Sitio Temporal',
      defaultWidthPct: 24,
      minWidthPx: 155,
      renderCell: (row) => {
        const meta = row.domainExtra;
        const badgeCls =
          meta.temporalStatus === 'ON'
            ? 'bg-violet-50 text-violet-900 border-violet-300'
            : meta.temporalStatus === 'OFF'
            ? 'bg-slate-100 text-slate-600 border-slate-200'
            : 'bg-slate-50 text-slate-400 border-slate-200';
        return `
          <div class="min-w-0 space-y-0.5">
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${badgeCls}">
              ${escapeHtml(meta.temporalStatusLabel)}
            </span>
            <div class="text-[11px] font-semibold ${meta.temporalStatus === 'ON' ? 'text-slate-900' : 'text-slate-400'} truncate">
              ${escapeHtml(meta.temporalLabel)}
            </div>
          </div>
        `;
      },
    },
    {
      id: 'dias_temp',
      header: 'Días Temp.',
      align: 'right',
      defaultWidthPct: 24,
      minWidthPx: 140,
      renderCell: (row) => {
        const meta = row.domainExtra;
        const subText = meta.temporalUbicacion || meta.latestAuditCodename;
        return `
          <div class="min-w-0 space-y-0.5 text-right" title="${escapeHtml(meta.latestAuditTooltip)}">
            <div class="font-mono text-xs font-bold ${meta.temporalStatus === 'ON' ? 'text-slate-900' : 'text-slate-400'} tabular-nums">
              ${meta.temporalStatus === 'ON' ? `${meta.temporalDays.toFixed(2)} d` : '0.00 d'}
            </div>
            <div class="text-[11px] text-slate-500 truncate">
              ${escapeHtml(subText)}
            </div>
          </div>
        `;
      },
    },
  ];

  const pickerModalHtml = pickerModel
    ? renderOrgCertPickerModal<TemporalOrgCertMeta>({
        model: pickerModel,
        domainColumns: pickerDomainColumns,
        subtitle:
          'Seleccione un certificado (agrupado por auditoría vinculada) para configurar su Sitio Temporal.',
        emptySearchMessage:
          'No se encontraron certificados ni sitios temporales que coincidan con la búsqueda en esta organización.',
      })
    : '';

  const archiveProps = extractUniversalArchiveProps(archiveConfig, 'programacion');

  return renderOrgMultiView<TemporalOrgCertMeta>({
    domainKey: 'designacion-temporal',
    tableId: 'designacion-temporal-main',
    title: 'Designación → Sitios Temporales',
    subtitle: 'Gestione los sitios temporales por organización y certificado.',
    entityLabel: 'organizaciones',
    groupingMode: 'audit',
    rows: orgRows,
    searchQuery: state.query,
    searchPlaceholder:
      'Buscar organización, conglomerado, certificado, norma, proyecto temporal o codename...',
    searchInputId: 'designacion-temporalSearchInput',
    clearSearchBtnId: 'clearDesignacionTemporalSearchBtn',
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen,
    sortState: { column: state.sortColumn, direction: state.sortDirection },
    columnWidths: tableColumnWidths?.['designacion-temporal-main'],
    facetCategories,
    facetSelections: state.facetSelections,
    extraColumns,
    renderCardExtra,
    actionsHtml: isStaff ? headerAddAuditHtml : '',
    loading,
    emptyStateTitle: 'Sin organizaciones disponibles en Designación → Temporal',
    emptyStateMessage:
      'Use "+ Auditoría" para programar la primera auditoría y habilitar la gestión de Sitio Temporal.',
    pickerModalHtml,
    ...archiveProps,
  });
}

function renderTemporalDetailView(opts: {
  state: DesignacionTemporalViewState;
  certRow: CertificateTemporalRow;
  effectiveAuditId: string | null;
  audits: ReadonlyArray<ProgramacionAuditEntity>;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  temporalSites: ReadonlyArray<AuditoriaSitioTemporalEntity>;
  certificados?: ReadonlyArray<CertificadoDetailEntity>;
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
    temporalSites,
    certificados = [],
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
  const distinctLinkedCertsCount = new Set(
    linkedCtx.siblings.map((sib) => sib.audit.id_certificado)
  ).size;

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

  const resolution = resolveLinkedBatchTemporalState(
    activeAudit,
    audits,
    programs,
    temporalSites
  );
  const isTemporalEnabled = resolution.isTemporalEnabled;

  const draft: BatchTemporalFormDraft =
    activeAudit && state.draftAuditId === activeAudit.id && state.batchDraft !== null
      ? state.batchDraft
      : createBatchTemporalDraftFromResolution(resolution);

  const sharedBatchIndicatorHtml =
    activeAudit && distinctLinkedCertsCount > 1
      ? `
        <span
          data-testid="temporal-shared-batch-badge"
          title="Este Sitio Temporal se aplica conjuntamente a las ${distinctLinkedCertsCount} auditorías vinculadas del lote."
          class="inline-flex items-center px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-[11px] font-semibold text-violet-800 whitespace-nowrap"
        >
          Aplica al lote completo (${distinctLinkedCertsCount} certificados)
        </span>
      `
      : '';

  const masterSwitchHtml = activeAudit
    ? `
      <div class="rounded-xl border border-slate-200 bg-white px-3.5 py-3 space-y-2.5 shadow-2xs">
        <div class="flex flex-wrap items-center justify-between gap-2.5">
          <div class="flex flex-wrap items-center gap-2 min-w-0">
            <span class="text-xs sm:text-sm font-bold text-slate-900">
              ¿Incluye Sitio Temporal?
            </span>
            ${sharedBatchIndicatorHtml}
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button
              type="button"
              role="switch"
              aria-checked="${isTemporalEnabled ? 'true' : 'false'}"
              aria-label="¿Incluye Sitio Temporal?"
              data-action="toggle-batch-temporal-switch"
              data-audit-id="${escapeHtml(activeAudit.id)}"
              data-next-value="${isTemporalEnabled ? 'false' : 'true'}"
              ${!isStaff || state.saving ? 'disabled' : ''}
              class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 ${
                isTemporalEnabled ? 'bg-violet-600' : 'bg-slate-300'
              } ${!isStaff || state.saving ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}"
            >
              <span
                class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  isTemporalEnabled ? 'translate-x-5' : 'translate-x-0'
                }"
              ></span>
            </button>
            <span class="px-2 py-0.5 rounded-full text-[11px] font-bold border ${
              isTemporalEnabled
                ? 'bg-violet-100 text-violet-900 border-violet-300'
                : 'bg-slate-100 text-slate-600 border-slate-200'
            }">
              ${isTemporalEnabled ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>

        ${
          isStaff && state.confirmDisableBatch && isTemporalEnabled
            ? `
              <div
                data-testid="temporal-disable-confirm-banner"
                role="alert"
                class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 flex flex-wrap items-center justify-between gap-2"
              >
                <span class="text-xs font-semibold text-rose-900">
                  ¿Desactivar y archivar el Sitio Temporal (${resolution.totalTemporalDays.toFixed(2)} d)?
                </span>
                <div class="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    data-action="cancel-disable-batch-temporal"
                    ${state.saving ? 'disabled' : ''}
                    class="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    data-action="confirm-disable-batch-temporal"
                    data-audit-id="${escapeHtml(activeAudit.id)}"
                    ${state.saving ? 'disabled' : ''}
                    class="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
                  >
                    ${state.saving ? 'Archivando...' : 'Confirmar OFF'}
                  </button>
                </div>
              </div>
            `
            : ''
        }
      </div>
    `
    : '';

  const temporalFormOrOffStateHtml = activeAudit
    ? !isTemporalEnabled
      ? `
        <div
          data-testid="temporal-off-empty-state"
          class="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-6 text-center space-y-1"
        >
          <p class="text-xs font-bold text-slate-700">Sin Sitio Temporal</p>
          <p class="text-[11px] text-slate-500">
            Active el interruptor a <strong>ON</strong> si esta auditoría incluye una obra o proyecto temporal.
          </p>
        </div>
      `
      : `
        <form
          id="batchTemporalSiteForm"
          data-audit-id="${escapeHtml(activeAudit.id)}"
          class="rounded-xl border border-slate-200 bg-white p-3.5 space-y-3 shadow-2xs"
          novalidate
        >
          <div class="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div class="space-y-1 md:col-span-5">
              <label for="batchTemporalEtiquetaInput" class="block text-xs font-bold text-slate-700">
                Nombre / Proyecto Temporal <span class="text-rose-600">*</span>
              </label>
              <input
                type="text"
                id="batchTemporalEtiquetaInput"
                name="etiqueta"
                data-temporal-field="etiqueta"
                required
                maxlength="120"
                value="${escapeHtml(draft.etiqueta)}"
                placeholder="Ej. Proyecto Ampliación Planta Sur"
                ${!isStaff ? 'disabled' : ''}
                class="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-900 focus:border-violet-600 focus:outline-none disabled:bg-slate-100"
              />
            </div>

            <div class="space-y-1 md:col-span-4">
              <label for="batchTemporalUbicacionInput" class="block text-xs font-bold text-slate-700">
                Ubicación <span class="text-rose-600">*</span>
              </label>
              <input
                type="text"
                id="batchTemporalUbicacionInput"
                name="ubicacion"
                data-temporal-field="ubicacion"
                required
                maxlength="160"
                value="${escapeHtml(draft.ubicacion)}"
                placeholder="Ej. Zona Industrial Valencia, Nave 4"
                ${!isStaff ? 'disabled' : ''}
                class="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:border-violet-600 focus:outline-none disabled:bg-slate-100"
              />
            </div>

            <div class="space-y-1 md:col-span-3">
              <label for="temporalDaysInput" class="block text-xs font-bold text-slate-700">
                Días (0.25d) <span class="text-rose-600">*</span>
              </label>
              <div class="flex items-center gap-1">
                <button
                  type="button"
                  data-action="step-temporal-days"
                  data-delta="-0.25"
                  aria-label="Restar 0.25 días"
                  ${!isStaff ? 'disabled' : ''}
                  class="h-9 px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer shrink-0 tabular-nums disabled:opacity-50"
                >
                  -0.25
                </button>
                <input
                  type="number"
                  id="temporalDaysInput"
                  name="tiempo_auditoria"
                  data-temporal-field="tiempo_auditoria"
                  min="0.25"
                  step="0.25"
                  required
                  value="${escapeHtml(roundAuditDaysQuarter(draft.tiempo_auditoria || 1.0).toFixed(2))}"
                  ${!isStaff ? 'disabled' : ''}
                  class="w-full h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs font-mono font-bold text-slate-900 text-center tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:border-violet-600 focus:outline-none disabled:bg-slate-100"
                />
                <button
                  type="button"
                  data-action="step-temporal-days"
                  data-delta="0.25"
                  aria-label="Sumar 0.25 días"
                  ${!isStaff ? 'disabled' : ''}
                  class="h-9 px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer shrink-0 tabular-nums disabled:opacity-50"
                >
                  +0.25
                </button>
              </div>
            </div>
          </div>

          ${
            isStaff
              ? `
                <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="submit"
                    data-action="save-batch-temporal-site"
                    ${state.saving ? 'disabled' : ''}
                    class="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    ${state.saving ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              `
              : ''
          }
        </form>
      `
    : '';

  const footerNavHtml = activeAudit
    ? `
      <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 text-[11px] font-semibold">
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
          data-target-subview="tiempo"
          class="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white transition-colors cursor-pointer whitespace-nowrap"
        >
          Continuar a 2. Tiempo →
        </button>
      </div>
    `
    : '';

  const bodyHtml = activeAudit
    ? `<div class="space-y-3">${masterSwitchHtml}${temporalFormOrOffStateHtml}${footerNavHtml}</div>`
    : '';

  return renderAuditSectionShell({
    sectionTitle: 'Temporal',
    sectionSymbol: '⏱️',
    backSubview: 'designacion/temporal',
    certInfo: {
      id: certRow.certId,
      id_organizacion: certRow.id_organizacion ?? activeAudit?.id_organizacion ?? null,
      numero_certificado: certRow.numero_certificado,
      organizacion_nombre: certRow.organizacion_nombre,
      organizacion_abreviacion: certRow.organizacion_abreviacion ?? null,
      norma_codigo: certRow.norma_codigo,
      estatus: certRow.estatus,
      version_numero: certRow.activeVersionNumero ?? null,
      alcance_es: certRow.alcance_es ?? null,
      alcance_en: certRow.alcance_en ?? null,
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
    tableName: 'auditoria_sitio_temporal',
    feedbackHtml: errorBannerHtml,
    futureWarningMessage,
    bodyHtml,
  });
}
