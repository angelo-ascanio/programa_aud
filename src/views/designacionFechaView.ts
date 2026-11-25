import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import type { OrganizacionEntity } from '../lib/activeCertificates';
import type { ConglomeradoEntity } from '../lib/conglomeradoDomain';
import type { VinculoEntity } from '../lib/vinculoDomain';
import {
  formatAuditDateLabel,
  type ProgramaAuditoriaEntity,
} from '../lib/auditPlanningEngine';
import type { ProgramacionAuditEntity } from '../lib/auditExecution';
import {
  getLinkedSiblingAudits,
  resolveAuditNavigation,
} from '../lib/certificateAuditSelector';
import { formatAuditCodename, resolveShortOrganizacionName } from '../lib/codenameDomain';
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
  buildCertificateFechaRows,
  buildFechaOrgFacetCategories,
  buildPlannedDateDraftsFromAudit,
  createFechaOrgCertMetaResolver,
  extractRealExecutionDates,
  formatPlannedDateTableValue,
  resolveInitialFixedDraftId,
  resolveLastAddedPlannedDate,
  sortPlannedDraftsNewestFirst,
  type CertificateFechaRow,
  type FechaOrgCertMeta,
  type PlannedDateRowDraft,
} from '../lib/designacionFechaDomain';
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

export type DesignacionFechaSortColumn =
  | 'organizacion'
  | 'certificados'
  | 'auditorias'
  | 'fecha_vigente'
  | 'urgencia'
  | 'certificado'
  | 'estatus_cert';

export interface DesignacionFechaViewState {
  query: string;
  viewMode: UniversalViewMode;
  isSidebarOpen: boolean;
  sortColumn: DesignacionFechaSortColumn | null;
  sortDirection: SortDirection;
  facetSelections: MultiViewSelectionMap;
  selectedCertId: string | null;
  selectedAuditId: string | null;
  pickerOrgId?: string | null;
  pickerSearchQuery?: string;
  draftAuditId: string | null;
  drafts: PlannedDateRowDraft[] | null;
  editorMode: 'add' | 'edit' | null;
  editingLocalId: string | null;
  editorDraft: PlannedDateRowDraft | null;
  saving: boolean;
  editErrorMessage: string | null;
}

export const DEFAULT_DESIGNACION_FECHA_STATE: DesignacionFechaViewState = {
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
  drafts: null,
  editorMode: null,
  editingLocalId: null,
  editorDraft: null,
  saving: false,
  editErrorMessage: null,
};

export interface DesignacionFechaViewProps {
  profile: UserProfile;
  state: DesignacionFechaViewState;
  certificates?: ReadonlyArray<CertificateRecord>;
  detailedCerts?: ReadonlyArray<CertificadoDetailEntity>;
  organizaciones?: ReadonlyArray<OrganizacionEntity>;
  conglomerados?: ReadonlyArray<ConglomeradoEntity>;
  vinculos?: ReadonlyArray<VinculoEntity>;
  authorizedClientOrgIds?: ReadonlyArray<string>;
  audits: ReadonlyArray<ProgramacionAuditEntity>;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  referenceIsoDate?: string;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
  inCardBreadcrumbHtml?: string;
  headerAddAuditHtml?: string;
}

const MONTHS_ES: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1, label: 'Enero' },
  { value: 2, label: 'Febrero' },
  { value: 3, label: 'Marzo' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Mayo' },
  { value: 6, label: 'Junio' },
  { value: 7, label: 'Julio' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Septiembre' },
  { value: 10, label: 'Octubre' },
  { value: 11, label: 'Noviembre' },
  { value: 12, label: 'Diciembre' },
];

export function renderDesignacionFechaView(props: DesignacionFechaViewProps): string {
  const {
    profile,
    state,
    certificates = [],
    detailedCerts = [],
    organizaciones = [],
    conglomerados = [],
    vinculos = [],
    authorizedClientOrgIds = [],
    audits,
    programs,
    referenceIsoDate,
    loading = false,
    archiveConfig,
    tableColumnWidths,
    inCardBreadcrumbHtml = '',
    headerAddAuditHtml = '',
  } = props;

  const isStaff = isApprovedStaffProfile(profile);
  const allRows = buildCertificateFechaRows({
    certificates,
    detailedCerts,
    audits,
    programs,
    referenceIsoDate,
  });

  const resolvedCertId =
    state.selectedCertId && allRows.some((r) => r.certId === state.selectedCertId)
      ? state.selectedCertId
      : state.selectedAuditId
      ? audits.find((a) => !a.deleted_at && a.id === state.selectedAuditId)?.id_certificado ?? null
      : null;

  if (resolvedCertId) {
    const certRow = allRows.find((r) => r.certId === resolvedCertId) ?? null;
    if (certRow) {
      return renderFechaDetailView({
        state,
        certRow,
        detailedCerts,
        audits,
        programs,
        isStaff,
        referenceIsoDate,
        inCardBreadcrumbHtml,
        headerAddAuditHtml,
      });
    }
  }

  const mergedCerts = mergeCertSourcesForOrgPicker({
    certificados: detailedCerts,
    certificates,
    audits,
    organizaciones,
  });

  const resolveCertMeta = createFechaOrgCertMetaResolver(referenceIsoDate);
  const orgRows = buildOrgMultiViewRows<FechaOrgCertMeta>({
    profile,
    authorizedClientOrgIds,
    organizaciones,
    conglomerados,
    certificados: mergedCerts,
    audits,
    programs,
    vinculos,
    resolveCertMeta,
  });

  const facetCategories = buildFechaOrgFacetCategories(orgRows);

  const extraColumns: ColumnDefinition<OrgMultiViewRow<FechaOrgCertMeta>>[] = [
    {
      id: 'fecha_vigente',
      header: 'Últ. Fecha Programada',
      defaultWidthPct: 26,
      minWidthPx: 165,
      sortable: true,
      getValue: (row) => {
        if (row.certificates.length === 0) return '9999-12-31';
        const sorted = row.certificates
          .slice()
          .sort((a, b) => a.domainExtra.urgency.rank - b.domainExtra.urgency.rank);
        return sorted[0]?.domainExtra.urgency.effectiveStartIso || '9999-12-31';
      },
      renderCell: (row) => {
        const sorted = row.certificates
          .slice()
          .sort((a, b) => a.domainExtra.urgency.rank - b.domainExtra.urgency.rank);
        const lead = sorted[0]?.domainExtra;
        if (!lead) {
          return '<span class="text-[11px] text-slate-400">Sin certificados</span>';
        }
        return `
          <div class="min-w-0 space-y-0.5">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${lead.urgency.badgeClass}">
                ${escapeHtml(lead.urgency.label)}
              </span>
              <span class="text-xs font-semibold text-slate-800 truncate" title="${escapeHtml(lead.latestDateLabel)}">
                ${escapeHtml(lead.latestDateLabel)}
              </span>
            </div>
            <div class="text-[11px] text-slate-500 truncate">
              ${escapeHtml(lead.precisionLabel)}
            </div>
          </div>
        `;
      },
    },
  ];

  const renderCardExtra = (row: OrgMultiViewRow<FechaOrgCertMeta>): string => {
    const sorted = row.certificates
      .slice()
      .sort((a, b) => a.domainExtra.urgency.rank - b.domainExtra.urgency.rank);
    const lead = sorted[0]?.domainExtra;
    if (!lead) return '';
    return `
      <div class="flex items-center justify-between gap-2 text-[11px]">
        <span class="inline-flex items-center px-2 py-0.5 rounded-full font-bold border whitespace-nowrap ${lead.urgency.badgeClass}">
          ${escapeHtml(lead.urgency.label)}
        </span>
        <span class="font-semibold text-slate-800 truncate" title="${escapeHtml(lead.latestDateLabel)}">
          ${escapeHtml(lead.latestDateLabel)}
        </span>
      </div>
    `;
  };

  const pickerModel = state.pickerOrgId
    ? buildOrgCertPickerModalModel<FechaOrgCertMeta>({
        orgId: state.pickerOrgId,
        modalSearchQuery: state.pickerSearchQuery ?? '',
        groupingMode: 'audit',
        orgRows,
        profile,
        authorizedClientOrgIds,
        organizaciones,
        conglomerados,
        certificados: mergedCerts,
        audits,
        programs,
        vinculos,
        resolveCertMeta,
      })
    : null;

  const pickerDomainColumns: OrgPickerDomainColumn<FechaOrgCertMeta>[] = [
    {
      id: 'fecha_programada',
      header: 'Fecha Programada',
      defaultWidthPct: 24,
      minWidthPx: 150,
      renderCell: (row) => {
        const meta = row.domainExtra;
        const badgeCls =
          meta.precisionKind === 'PROGRAMADA_EXACTA'
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : meta.precisionKind === 'PREPROGRAMADA_MES'
            ? 'bg-sky-50 text-sky-700 border-sky-200'
            : 'bg-slate-100 text-slate-600 border-slate-200';
        return `
          <div class="min-w-0 space-y-0.5">
            <div class="text-xs font-semibold text-slate-900 truncate" title="${escapeHtml(meta.latestDateLabel)}">
              ${escapeHtml(meta.latestDateLabel)}
            </div>
            <span class="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold border whitespace-nowrap ${badgeCls}">
              ${escapeHtml(meta.precisionLabel)}
            </span>
          </div>
        `;
      },
    },
    {
      id: 'estado_urgencia',
      header: 'Estado / Urgencia',
      defaultWidthPct: 24,
      minWidthPx: 145,
      renderCell: (row) => {
        const meta = row.domainExtra;
        return `
          <div class="min-w-0 space-y-0.5" title="${escapeHtml(meta.latestAuditTooltip)}">
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${meta.urgency.badgeClass}">
              ${escapeHtml(meta.urgency.label)}
            </span>
            <div class="font-mono text-[11px] text-slate-500 truncate">
              ${escapeHtml(meta.latestAuditCodename)}
            </div>
          </div>
        `;
      },
    },
  ];

  const pickerModalHtml = pickerModel
    ? renderOrgCertPickerModal<FechaOrgCertMeta>({
        model: pickerModel,
        domainColumns: pickerDomainColumns,
        subtitle:
          'Seleccione un certificado (agrupado por auditoría vinculada) para definir o reprogramar sus fechas.',
        emptySearchMessage:
          'No se encontraron certificados ni fechas que coincidan con la búsqueda en esta organización.',
      })
    : '';

  const archiveProps = extractUniversalArchiveProps(archiveConfig, 'auditoria_fecha');

  return renderOrgMultiView<FechaOrgCertMeta>({
    domainKey: 'designacion-fecha',
    tableId: 'designacion-fecha-main',
    title: 'Designación → Fecha de Auditoría',
    subtitle:
      'Sub-paso 1.3 por organización: abra una organización para seleccionar su certificado y definir sus fechas programadas.',
    entityLabel: 'organizaciones',
    groupingMode: 'audit',
    rows: orgRows,
    searchQuery: state.query,
    searchPlaceholder:
      'Buscar organización, conglomerado, certificado, norma, fecha o codename...',
    searchInputId: 'designacion-fechaSearchInput',
    clearSearchBtnId: 'clearDesignacionFechaSearchBtn',
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen,
    sortState: { column: state.sortColumn, direction: state.sortDirection },
    columnWidths: tableColumnWidths?.['designacion-fecha-main'],
    facetCategories,
    facetSelections: state.facetSelections,
    extraColumns,
    renderCardExtra,
    actionsHtml: isStaff ? headerAddAuditHtml : '',
    loading,
    emptyStateTitle: 'Sin organizaciones disponibles en Designación → Fecha',
    emptyStateMessage:
      'Use "+ Auditoría" para programar la primera auditoría y definir sus fechas.',
    pickerModalHtml,
    ...archiveProps,
  });
}

function renderFechaDetailView(opts: {
  state: DesignacionFechaViewState;
  certRow: CertificateFechaRow;
  detailedCerts?: ReadonlyArray<CertificadoDetailEntity>;
  audits: ReadonlyArray<ProgramacionAuditEntity>;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  isStaff: boolean;
  referenceIsoDate?: string;
  inCardBreadcrumbHtml?: string;
  headerAddAuditHtml?: string;
}): string {
  const {
    state,
    certRow,
    detailedCerts = [],
    audits,
    programs,
    isStaff,
    referenceIsoDate,
    inCardBreadcrumbHtml = '',
    headerAddAuditHtml = '',
  } = opts;

  const navigation = resolveAuditNavigation(
    certRow.certId,
    state.selectedAuditId,
    audits
  );
  const activeAudit = navigation.activeAudit;
  const linkedCtx = getLinkedSiblingAudits(activeAudit, audits, programs);
  const siblingsCount = linkedCtx.siblings.length;

  const lastAddedPlanned = activeAudit
    ? resolveLastAddedPlannedDate(activeAudit.fechas) ??
      (activeAudit.latestDate &&
      !activeAudit.latestDate.deleted_at &&
      activeAudit.latestDate.tipo_fecha !== 'REAL'
        ? activeAudit.latestDate
        : null)
    : null;
  const lastAddedPlannedLabel = lastAddedPlanned
    ? formatAuditDateLabel(lastAddedPlanned)
    : activeAudit?.fecha_inicio
    ? activeAudit.fecha_inicio.slice(0, 10)
    : 'Sin fecha programada';

  const urgency = activeAudit
    ? computeAuditUrgencyClassification(
        lastAddedPlanned,
        activeAudit.estado_ciclo || 'Borrador',
        referenceIsoDate
      )
    : certRow.urgency;
  const futureWarningMessage = requiresFutureYearWarning(urgency);

  const errorBannerHtml =
    state.editErrorMessage && state.editorMode === null
      ? `
      <div role="alert" class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800 flex items-center gap-2">
        <span aria-hidden="true">⚠️</span>
        <span>${escapeHtml(state.editErrorMessage)}</span>
      </div>
    `
      : '';

  const drafts: PlannedDateRowDraft[] = activeAudit
    ? state.draftAuditId === activeAudit.id && state.drafts !== null
      ? state.drafts
      : buildPlannedDateDraftsFromAudit(activeAudit, referenceIsoDate)
    : [];

  const initialFixedId = resolveInitialFixedDraftId(drafts);
  const orderedNewestFirst = sortPlannedDraftsNewestFirst(drafts);
  const realDates = extractRealExecutionDates(activeAudit);

  const editorToolbarHtml = activeAudit
    ? `
      <div
        data-testid="fecha-editor-toolbar"
        class="flex flex-wrap items-center justify-between gap-2 pb-1"
      >
        <div class="min-w-0 space-y-0.5">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-xs font-bold uppercase tracking-wider text-slate-700">
              Fechas Programadas
            </h2>
            ${
              siblingsCount > 1
                ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-[11px] font-semibold text-indigo-800 whitespace-nowrap">Sincronizado con ${siblingsCount} auditorías vinculadas</span>`
                : ''
            }
          </div>
          <p class="text-[11px] text-slate-500">
            Fechas objetivo de planificación (las fechas reales se registran tras la ejecución).
          </p>
        </div>
        ${
          isStaff
            ? `
              <button
                type="button"
                data-action="open-add-planned-date"
                data-audit-id="${escapeHtml(activeAudit.id)}"
                ${state.saving ? 'disabled' : ''}
                title="Agregar fecha programada"
                aria-label="Agregar fecha programada"
                class="w-8 h-8 inline-flex items-center justify-center rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-base font-bold shadow-2xs transition-colors cursor-pointer shrink-0 disabled:opacity-50"
              >
                +
              </button>
            `
            : ''
        }
      </div>
    `
    : '';

  const unifiedTableHtml =
    orderedNewestFirst.length === 0
      ? `
        <div class="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-6 text-center space-y-1.5">
          <p class="text-xs font-bold text-slate-800">No hay fechas programadas registradas</p>
          <p class="text-xs text-slate-500 max-w-md mx-auto">
            ${
              isStaff
                ? 'Use el botón + para definir la fecha objetivo inicial (Año + Mes o Fecha Exacta).'
                : 'Aún no se han definido fechas programadas para esta auditoría.'
            }
          </p>
        </div>
      `
      : `
        <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
          <table id="designacion-fecha-detail-table" class="w-full min-w-[440px] sm:min-w-0 table-fixed text-left border-collapse">
            <colgroup>
              ${
                isStaff
                  ? '<col style="width: 34%"><col style="width: 52%"><col style="width: 14%">'
                  : '<col style="width: 40%"><col style="width: 60%">'
              }
            </colgroup>
            <thead class="bg-slate-50 border-b border-slate-200">
              <tr>
                <th scope="col" class="px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Fecha Programada
                </th>
                <th scope="col" class="px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Observación
                </th>
                ${
                  isStaff
                    ? `
                      <th scope="col" class="px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-600 text-right">
                        Acciones
                      </th>
                    `
                    : ''
                }
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 text-xs">
              ${orderedNewestFirst
                .map((draft) => {
                  const isInitialFixed = draft.localId === initialFixedId;
                  const formattedValue = formatPlannedDateTableValue(draft);
                  const precisionHint =
                    draft.tipo_fecha === 'PREPROGRAMADA_MES' ? 'YYYY-MM' : 'YYYY-MM-DD';
                  const obsText = draft.observacion.trim();

                  return `
                    <tr
                      data-testid="planned-date-row"
                      data-local-id="${escapeHtml(draft.localId)}"
                      data-is-initial-fixed="${isInitialFixed ? 'true' : 'false'}"
                      class="hover:bg-slate-50/80 transition-colors"
                    >
                      <td class="px-3.5 py-2.5 align-middle">
                        <div class="flex flex-wrap items-center gap-1.5 min-w-0">
                          <span class="font-semibold text-slate-900 truncate" title="${escapeHtml(formattedValue)}">${escapeHtml(formattedValue)}</span>
                          <span class="font-mono text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.2 shrink-0">${precisionHint}</span>
                        </div>
                      </td>
                      <td class="px-3.5 py-2.5 align-middle text-slate-600">
                        ${
                          obsText
                            ? `<span class="block truncate" title="${escapeHtml(obsText)}">${escapeHtml(obsText)}</span>`
                            : '<span class="text-slate-400">—</span>'
                        }
                      </td>
                      ${
                        isStaff
                          ? `
                            <td class="px-3.5 py-2.5 align-middle text-right">
                              <div class="inline-flex items-center justify-end gap-1.5">
                                <span
                                  role="button"
                                  tabindex="0"
                                  data-action="open-edit-planned-date"
                                  data-audit-id="${escapeHtml(activeAudit ? activeAudit.id : '')}"
                                  data-local-id="${escapeHtml(draft.localId)}"
                                  title="Editar fecha programada"
                                  aria-label="Editar fecha programada"
                                  class="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-slate-900/20"
                                >✏️</span>
                                ${
                                  !isInitialFixed
                                    ? `
                                      <span
                                        role="button"
                                        tabindex="0"
                                        data-action="delete-planned-date"
                                        data-audit-id="${escapeHtml(activeAudit ? activeAudit.id : '')}"
                                        data-local-id="${escapeHtml(draft.localId)}"
                                        title="Eliminar fecha programada"
                                        aria-label="Eliminar fecha programada"
                                        class="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-xs cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-rose-500/25"
                                      >🗑️</span>
                                    `
                                    : ''
                                }
                              </div>
                            </td>
                          `
                          : ''
                      }
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      `;

  const realSectionHtml =
    realDates.length > 0
      ? `
        <section class="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5 space-y-2">
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-xs font-bold uppercase tracking-wider text-emerald-900">
              Fechas Reales de Ejecución (REAL — Solo lectura)
            </h3>
            <span class="text-[11px] font-semibold text-emerald-700">
              Registradas en Resultado
            </span>
          </div>
          <div class="flex flex-wrap gap-2">
            ${realDates
              .map(
                (r) => `
                  <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-emerald-200 text-xs font-bold text-emerald-900">
                    <span>✓</span>
                    <span>${escapeHtml(formatAuditDateLabel(r))}</span>
                    ${r.observacion ? `<span class="text-[11px] font-normal text-slate-500">· ${escapeHtml(r.observacion)}</span>` : ''}
                  </span>
                `
              )
              .join('')}
          </div>
        </section>
      `
      : '';

  const editorModalHtml =
    isStaff && activeAudit && state.editorMode !== null && state.editorDraft !== null
      ? (() => {
          const ed = state.editorDraft;
          const isExact = ed.tipo_fecha === 'PROGRAMADA_EXACTA';
          const modalTitle =
            state.editorMode === 'edit'
              ? 'Editar fecha programada'
              : 'Agregar fecha programada';
          const batchScopeNote =
            siblingsCount > 1
              ? `Se aplicará a las ${siblingsCount} auditorías vinculadas; no modifica fechas reales.`
              : 'Fecha objetivo de planificación; no modifica fechas reales.';

          return `
            <div
              id="plannedDateEditorModal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="plannedDateEditorTitle"
              class="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[1px] flex items-center justify-center p-4"
            >
              <div class="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden">
                <div class="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2 bg-slate-50/70">
                  <h3 id="plannedDateEditorTitle" class="text-sm font-bold text-slate-900">
                    ${escapeHtml(modalTitle)}
                  </h3>
                  <button
                    type="button"
                    data-action="close-planned-date-modal"
                    title="Cerrar"
                    aria-label="Cerrar"
                    class="w-7 h-7 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-bold text-slate-600 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <form
                  id="plannedDateEditorForm"
                  data-audit-id="${escapeHtml(activeAudit.id)}"
                  class="p-4 space-y-3.5"
                  novalidate
                >
                  <p class="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2">
                    ${escapeHtml(batchScopeNote)}
                  </p>

                  ${
                    state.editErrorMessage
                      ? `
                        <div role="alert" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800 flex items-center gap-2">
                          <span aria-hidden="true">⚠️</span>
                          <span>${escapeHtml(state.editErrorMessage)}</span>
                        </div>
                      `
                      : ''
                  }

                  <div class="space-y-1">
                    <label for="fechaEditorTipoSelect" class="block text-[11px] font-bold text-slate-700">
                      Precisión de fecha (YYYY-MM vs YYYY-MM-DD)
                    </label>
                    <select
                      id="fechaEditorTipoSelect"
                      data-fecha-editor-field="tipo_fecha"
                      ${state.saving ? 'disabled' : ''}
                      class="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-900 focus:border-slate-900 focus:outline-none"
                    >
                      <option value="PREPROGRAMADA_MES" ${!isExact ? 'selected' : ''}>Año + Mes (YYYY-MM)</option>
                      <option value="PROGRAMADA_EXACTA" ${isExact ? 'selected' : ''}>Fecha Exacta (YYYY-MM-DD)</option>
                    </select>
                  </div>

                  ${
                    !isExact
                      ? `
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div class="space-y-1">
                            <label for="fechaEditorMesSelect" class="block text-[11px] font-bold text-slate-700">
                              Mes
                            </label>
                            <select
                              id="fechaEditorMesSelect"
                              data-fecha-editor-field="mes"
                              ${state.saving ? 'disabled' : ''}
                              class="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-900"
                            >
                              ${MONTHS_ES.map(
                                (m) =>
                                  `<option value="${m.value}" ${
                                    m.value === ed.mes ? 'selected' : ''
                                  }>${escapeHtml(m.label)}</option>`
                              ).join('')}
                            </select>
                          </div>
                          <div class="space-y-1">
                            <label for="fechaEditorAnioInput" class="block text-[11px] font-bold text-slate-700">
                              Año (YYYY)
                            </label>
                            <input
                              type="number"
                              id="fechaEditorAnioInput"
                              data-fecha-editor-field="anio"
                              min="2020"
                              max="2100"
                              value="${ed.anio}"
                              ${state.saving ? 'disabled' : ''}
                              class="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-mono font-bold text-slate-900"
                            />
                          </div>
                        </div>
                      `
                      : `
                        <div class="space-y-2.5">
                          <div class="flex items-center justify-between gap-2">
                            <label class="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                              <input
                                type="checkbox"
                                id="fechaEditorSingleDayToggle"
                                data-action="toggle-planned-editor-single-day"
                                ${ed.singleDay ? 'checked' : ''}
                                ${state.saving ? 'disabled' : ''}
                                class="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              <span>Fecha exacta de 1 solo día</span>
                            </label>
                          </div>
                          <div class="grid grid-cols-1 ${ed.singleDay ? 'sm:grid-cols-1' : 'sm:grid-cols-2'} gap-3">
                            <div class="space-y-1">
                              <label for="fechaEditorExactaInput" class="block text-[11px] font-bold text-slate-700">
                                ${ed.singleDay ? 'Fecha Objetivo (YYYY-MM-DD)' : 'Fecha Inicio (YYYY-MM-DD)'}
                              </label>
                              <input
                                type="date"
                                id="fechaEditorExactaInput"
                                data-fecha-editor-field="fecha_inicio"
                                value="${escapeHtml(ed.fecha_inicio)}"
                                ${state.saving ? 'disabled' : ''}
                                class="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-900"
                              />
                            </div>
                            ${
                              !ed.singleDay
                                ? `
                                  <div class="space-y-1">
                                    <label for="fechaEditorFinInput" class="block text-[11px] font-bold text-slate-700">
                                      Fecha Fin (YYYY-MM-DD)
                                    </label>
                                    <input
                                      type="date"
                                      id="fechaEditorFinInput"
                                      data-fecha-editor-field="fecha_fin"
                                      value="${escapeHtml(ed.fecha_fin)}"
                                      ${state.saving ? 'disabled' : ''}
                                      class="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-900"
                                    />
                                  </div>
                                `
                                : ''
                            }
                          </div>
                        </div>
                      `
                  }

                  <div class="space-y-1">
                    <label for="fechaEditorObsInput" class="block text-[11px] font-bold text-slate-700">
                      Observación (opcional)
                    </label>
                    <input
                      type="text"
                      id="fechaEditorObsInput"
                      data-fecha-editor-field="observacion"
                      maxlength="300"
                      value="${escapeHtml(ed.observacion)}"
                      placeholder="Ej. Ventana solicitada por coordinación operativa"
                      ${state.saving ? 'disabled' : ''}
                      class="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs text-slate-900"
                    />
                  </div>

                  <div class="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      data-action="close-planned-date-modal"
                      ${state.saving ? 'disabled' : ''}
                      class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer disabled:opacity-50"
                    >
                      ✕ Cancelar
                    </button>
                    <button
                      type="submit"
                      data-action="submit-planned-date-editor"
                      ${state.saving ? 'disabled' : ''}
                      class="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                    >
                      ${state.saving ? 'Guardando...' : '✓ Guardar'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          `;
        })()
      : '';

  const bodyHtml = activeAudit
    ? `
      <div class="space-y-3">
        ${editorToolbarHtml}
        ${unifiedTableHtml}
        ${realSectionHtml}
      </div>
    `
    : '';

  return renderAuditSectionShell({
    sectionTitle: 'Designación → Fecha',
    sectionSymbol: '📅',
    backSubview: 'designacion/fecha',
    compactMode: true,
    lastAddedPlannedLabel,
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
    certificados: detailedCerts,
    navigation,
    programs,
    linkedSiblings: linkedCtx.siblings,
    showLinkedSiblings: siblingsCount > 1,
    isStaff,
    inCardBreadcrumbHtml,
    headerAddAuditHtml,
    tableName: 'auditoria_fecha',
    feedbackHtml: errorBannerHtml,
    futureWarningMessage,
    bodyHtml,
    modalsHtml: editorModalHtml,
  });
}
