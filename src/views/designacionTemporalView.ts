import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import type { OrganizacionEntity } from '../lib/activeCertificates';
import type { ConglomeradoEntity } from '../lib/conglomeradoDomain';
import type { VinculoEntity } from '../lib/vinculoDomain';
import {
  formatAuditDateLabel,
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
import {
  formatAuditCodename,
  getAuditCodenameTooltip,
  resolveShortOrganizacionName,
} from '../lib/codenameDomain';

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
    subtitle:
      'Sub-paso 1.5 por organización: abra una organización para seleccionar su certificado y gestionar sitios temporales.',
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
  const siblingsCount = linkedCtx.siblings.length;

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

  const plannedLabel = activeAudit
    ? (() => {
        const planned = resolveLatestPlannedDate(activeAudit.fechas) ?? activeAudit.latestDate ?? null;
        return planned ? formatAuditDateLabel(planned) : 'Sin fecha programada';
      })()
    : '—';

  const batchBannerHtml = activeAudit
    ? `
      <div
        data-testid="temporal-linked-batch-banner"
        class="rounded-xl border border-violet-200 bg-violet-50/50 p-3 space-y-2"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-xs font-bold text-violet-950">
            El Sitio Temporal definido aquí aplica conjuntamente a ${
              siblingsCount === 1
                ? 'esta auditoría'
                : `las ${siblingsCount} auditorías vinculadas de este lote`
            }.
          </p>
          <span class="text-[11px] font-semibold text-violet-800">📅 ${escapeHtml(plannedLabel)}</span>
        </div>
        <div class="flex flex-wrap items-center gap-1.5">
          ${linkedCtx.siblings
            .map(
              (sib) => `
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-violet-200 text-[11px] font-semibold text-violet-950">
                  <span class="font-mono font-bold">${escapeHtml(sib.audit.numero_certificado)}</span>
                  ${
                    sib.audit.organizacion_abreviacion
                      ? `<span class="text-slate-600 font-bold">· ${escapeHtml(sib.audit.organizacion_abreviacion)}</span>`
                      : ''
                  }
                  ${
                    sib.audit.version_numero
                      ? `<span class="font-mono text-[10px] font-bold text-indigo-700">v${Math.floor(sib.audit.version_numero)}</span>`
                      : ''
                  }
                  <span class="text-violet-600">· ${escapeHtml(sib.audit.norma_codigo)}</span>
                </span>
              `
            )
            .join('')}
        </div>
      </div>
    `
    : '';

  const masterSwitchHtml = activeAudit
    ? `
      <div class="rounded-xl border border-slate-200 bg-white p-3.5 space-y-3 shadow-2xs">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div class="space-y-0.5">
            <div class="text-xs font-bold text-slate-900">
              ¿Esta auditoría vinculada auditará un Sitio Temporal?
            </div>
            <p class="text-[11px] text-slate-500">
              Active el interruptor para declarar una obra, proyecto o sede temporal y asignar su duración en múltiplos de 0.25 días.
            </p>
          </div>
          <div class="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              role="switch"
              aria-checked="${isTemporalEnabled ? 'true' : 'false'}"
              aria-label="¿Esta auditoría vinculada auditará un Sitio Temporal?"
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
            <span class="px-2.5 py-0.5 rounded-full text-xs font-bold border ${
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
                class="rounded-xl border border-rose-200 bg-rose-50 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5"
              >
                <div class="text-xs font-semibold text-rose-900">
                  Este lote ya tiene tiempo temporal (${resolution.totalTemporalDays.toFixed(
                    2
                  )} d) o equipo asignado. Si pasa a OFF se archivarán los registros temporales activos de todo el lote.
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    data-action="cancel-disable-batch-temporal"
                    ${state.saving ? 'disabled' : ''}
                    class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    data-action="confirm-disable-batch-temporal"
                    data-audit-id="${escapeHtml(activeAudit.id)}"
                    ${state.saving ? 'disabled' : ''}
                    class="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
                  >
                    ${state.saving ? 'Archivando...' : 'Confirmar OFF y Archivar'}
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
          class="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-8 text-center space-y-2"
        >
          <div class="text-xl select-none" aria-hidden="true">🏗️</div>
          <h3 class="text-sm font-bold text-slate-900">Sin Sitio Temporal</h3>
          <p class="text-xs text-slate-500 max-w-md mx-auto">
            Ninguna de las auditorías vinculadas de este lote contempla un sitio temporal actualmente. Active el interruptor superior a <strong>ON</strong> para declararlo.
          </p>
        </div>
      `
      : `
        <form
          id="batchTemporalSiteForm"
          data-audit-id="${escapeHtml(activeAudit.id)}"
          class="rounded-2xl border border-violet-200 bg-white p-4 space-y-4 shadow-2xs"
          novalidate
        >
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h3 class="text-sm font-bold text-slate-900">
                Configuración del Sitio Temporal del Lote
              </h3>
              <p class="text-[11px] text-slate-500">
                Los cambios se replicarán automáticamente en las ${siblingsCount} auditoría${
                  siblingsCount === 1 ? '' : 's'
                } del lote vinculado.
              </p>
            </div>
            ${
              resolution.primaryTemporalSite
                ? `
                  <span class="px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-[11px] font-semibold text-slate-700 tabular-nums">
                    Equipo asignado: ${resolution.assignedTeamDays.toFixed(2)} / ${resolution.totalTemporalDays.toFixed(2)} d
                  </span>
                `
                : ''
            }
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div class="space-y-1">
              <label for="batchTemporalEtiquetaInput" class="block text-xs font-bold text-slate-700">
                Nombre / Descripción del Proyecto Temporal <span class="text-rose-600">*</span>
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

            <div class="space-y-1">
              <label for="batchTemporalUbicacionInput" class="block text-xs font-bold text-slate-700">
                Ubicación / Ciudad / Dirección <span class="text-rose-600">*</span>
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

            <div class="space-y-1">
              <label for="temporalDaysInput" class="block text-xs font-bold text-slate-700">
                Tiempo de Auditoría (días · incrementos 0.25) <span class="text-rose-600">*</span>
              </label>
              <div class="flex items-center gap-1.5">
                <button
                  type="button"
                  data-action="step-temporal-days"
                  data-delta="-0.25"
                  aria-label="Restar 0.25 días"
                  ${!isStaff ? 'disabled' : ''}
                  class="h-9 px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer shrink-0 tabular-nums disabled:opacity-50"
                >
                  -0.25d
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
                  class="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-mono font-bold text-slate-900 text-center tabular-nums focus:border-violet-600 focus:outline-none disabled:bg-slate-100"
                />
                <button
                  type="button"
                  data-action="step-temporal-days"
                  data-delta="0.25"
                  aria-label="Sumar 0.25 días"
                  ${!isStaff ? 'disabled' : ''}
                  class="h-9 px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer shrink-0 tabular-nums disabled:opacity-50"
                >
                  +0.25d
                </button>
              </div>
            </div>

            <div class="space-y-1">
              <label for="batchTemporalFechaInput" class="block text-xs font-bold text-slate-700">
                Fecha Tentativa de Obra / Proyecto
              </label>
              <input
                type="date"
                id="batchTemporalFechaInput"
                name="fecha_tentativa"
                data-temporal-field="fecha_tentativa"
                value="${escapeHtml(draft.fecha_tentativa)}"
                ${!isStaff ? 'disabled' : ''}
                class="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-900 focus:border-violet-600 focus:outline-none disabled:bg-slate-100"
              />
            </div>

            <div class="md:col-span-2 space-y-1">
              <label for="batchTemporalNotasInput" class="block text-xs font-bold text-slate-700">
                Notas de Obra o Proyecto
              </label>
              <textarea
                id="batchTemporalNotasInput"
                name="notas"
                data-temporal-field="notas"
                rows="2"
                maxlength="300"
                placeholder="Detalle de procesos ejecutados en obra temporal, accesos o requisitos de seguridad."
                ${!isStaff ? 'disabled' : ''}
                class="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-900 focus:border-violet-600 focus:outline-none disabled:bg-slate-100"
              >${escapeHtml(draft.notas)}</textarea>
            </div>
          </div>

          ${
            isStaff
              ? `
                <div class="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="submit"
                    data-action="save-batch-temporal-site"
                    ${state.saving ? 'disabled' : ''}
                    class="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    ${
                      state.saving
                        ? 'Guardando...'
                        : siblingsCount > 1
                        ? `Guardar Sitio Temporal en Lote (${siblingsCount})`
                        : 'Guardar Sitio Temporal'
                    }
                  </button>
                </div>
              `
              : ''
          }
        </form>
      `
    : '';

  const bodyHtml = activeAudit
    ? `<div class="space-y-4">${batchBannerHtml}${masterSwitchHtml}${temporalFormOrOffStateHtml}</div>`
    : '';

  return renderAuditSectionShell({
    sectionTitle: 'Designación → Temporal',
    sectionSymbol: '⏱️',
    backSubview: 'designacion/temporal',
    certInfo: {
      id: certRow.certId,
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
    showLinkedSiblings: false,
    isStaff,
    inCardBreadcrumbHtml,
    headerAddAuditHtml,
    tableName: 'auditoria_sitio_temporal',
    feedbackHtml: errorBannerHtml,
    futureWarningMessage,
    bodyHtml,
  });
}
