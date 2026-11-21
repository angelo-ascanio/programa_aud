import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import {
  formatAuditDateLabel,
  type ProgramaAuditoriaEntity,
} from '../lib/auditPlanningEngine';
import type { ProgramacionAuditEntity } from '../lib/auditExecution';
import {
  getLinkedSiblingAudits,
  resolveAuditNavigation,
} from '../lib/certificateAuditSelector';
import {
  computeAuditUrgencyClassification,
  requiresFutureYearWarning,
} from '../lib/designacionTipoDomain';
import {
  buildCertificateFechaRows,
  buildPlannedDateDraftsFromAudit,
  extractRealExecutionDates,
  type CertificateFechaRow,
  type PlannedDateRowDraft,
} from '../lib/designacionFechaDomain';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import type { CertificateRecord } from '../lib/searchControls';
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
import { renderAuditSectionShell } from './auditSectionShell';
import {
  extractUniversalArchiveProps,
  type ArchiveMultiViewConfig,
} from '../lib/archiveGovernance';

export type DesignacionFechaSortColumn =
  | 'urgencia'
  | 'certificado'
  | 'estatus_cert'
  | 'fecha_vigente';

export interface DesignacionFechaViewState {
  query: string;
  viewMode: UniversalViewMode;
  isSidebarOpen: boolean;
  sortColumn: DesignacionFechaSortColumn | null;
  sortDirection: SortDirection;
  facetSelections: MultiViewSelectionMap;
  selectedCertId: string | null;
  selectedAuditId: string | null;
  draftAuditId: string | null;
  drafts: PlannedDateRowDraft[] | null;
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
  draftAuditId: null,
  drafts: null,
  saving: false,
  editErrorMessage: null,
};

export interface DesignacionFechaViewProps {
  profile: UserProfile;
  state: DesignacionFechaViewState;
  certificates?: ReadonlyArray<CertificateRecord>;
  detailedCerts?: ReadonlyArray<CertificadoDetailEntity>;
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
        audits,
        programs,
        isStaff,
        referenceIsoDate,
        inCardBreadcrumbHtml,
        headerAddAuditHtml,
      });
    }
  }

  return renderFechaMultiView({
    state,
    allRows,
    loading,
    archiveConfig,
    tableColumnWidths,
    headerAddAuditHtml,
  });
}

const PREFERRED_CERT_STATUS_ORDER: readonly string[] = [
  'Activo',
  'Estudio',
  'Suspendido',
  'Cancelado',
  'Retirado',
  'Vencido',
  'En Espera',
  'Inactivo',
];

function buildCertificateStatusFacetOptions(
  allRows: ReadonlyArray<CertificateFechaRow>
): Array<{ value: string; label: string }> {
  const uniqueValues = Array.from(
    new Set(
      allRows
        .map((r) => (r.estatus || '').trim())
        .filter((s) => s.length > 0)
    )
  );

  uniqueValues.sort((a, b) => {
    const idxA = PREFERRED_CERT_STATUS_ORDER.findIndex(
      (p) => p.toLowerCase() === a.toLowerCase()
    );
    const idxB = PREFERRED_CERT_STATUS_ORDER.findIndex(
      (p) => p.toLowerCase() === b.toLowerCase()
    );
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b, 'es');
  });

  return uniqueValues.map((status) => ({
    value: status,
    label: status,
  }));
}

function renderFechaMultiView(opts: {
  state: DesignacionFechaViewState;
  allRows: ReadonlyArray<CertificateFechaRow>;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
  headerAddAuditHtml?: string;
}): string {
  const {
    state,
    allRows,
    loading = false,
    archiveConfig,
    tableColumnWidths,
    headerAddAuditHtml = '',
  } = opts;

  const statusFacetOptions = buildCertificateStatusFacetOptions(allRows);

  const facetCategories: MultiViewFacetCategory<CertificateFechaRow>[] = [
    {
      id: 'urgencia',
      label: 'Ventana Temporal',
      options: [
        { value: 'VENCIDA', label: 'Vencida' },
        { value: 'PROXIMA_30D', label: 'Próxima ≤ 30 días' },
        { value: 'ESTE_TRIMESTRE', label: 'Este trimestre' },
        { value: 'ESTE_ANIO', label: 'Año en curso' },
        { value: 'ANIO_MAS_1', label: 'Año +1' },
        { value: 'FUTURO_LEJANO', label: 'Futuro (+2/+3 años)' },
        { value: 'SIN_FECHA', label: 'Sin fecha programada' },
      ],
      extractValues: (r) => r.urgency.bucket,
    },
    {
      id: 'estatus_certificado',
      label: 'Estatus Certificado',
      options: statusFacetOptions,
      extractValues: (r) => (r.estatus || '').trim() || 'Sin estatus',
    },
    {
      id: 'precision',
      label: 'Modalidad de Fecha',
      options: [
        { value: 'PROGRAMADA_EXACTA', label: 'Fecha Exacta' },
        { value: 'PREPROGRAMADA_MES', label: 'Mes + Año' },
        { value: 'SIN_FECHA', label: 'Sin fecha' },
      ],
      extractValues: (r) => r.precisionKind,
    },
    {
      id: 'vinculacion',
      label: 'Vínculo',
      options: [
        { value: 'VINCULADA', label: 'Auditoría vinculada' },
        { value: 'INDIVIDUAL', label: 'Auditoría individual' },
        { value: 'SIN_AUDITORIA', label: 'Sin auditorías' },
      ],
      extractValues: (r) =>
        r.totalAudits === 0 ? 'SIN_AUDITORIA' : r.isLinkedLatest ? 'VINCULADA' : 'INDIVIDUAL',
    },
  ];

  const searchOptions = {
    getSearchableText: (row: CertificateFechaRow): string =>
      [
        row.numero_certificado,
        row.organizacion_nombre,
        row.norma_codigo,
        row.estatus,
        row.latestDateLabel,
        row.precisionLabel,
        row.linkShortLabel,
        row.linkFullTooltip,
        row.latestAudit?.codigo_auditoria || '',
        row.latestAudit?.tipo_auditoria || '',
        row.latestProgram?.etiqueta || '',
      ].join(' '),
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
        case 'urgencia':
          return row.urgency.rank;
        case 'certificado':
          return row.numero_certificado.toLowerCase();
        case 'estatus_cert':
          return row.estatus.toLowerCase();
        case 'fecha_vigente':
          return row.urgency.effectiveStartIso || '9999-12-31';
        default:
          return row.urgency.rank;
      }
    }
  );

  const columns: ColumnDefinition<CertificateFechaRow>[] = [
    {
      id: 'urgencia',
      header: 'Ventana',
      defaultWidthPct: 13,
      minWidthPx: 110,
      sortable: true,
      renderCell: (row) => `
        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${row.urgency.badgeClass} whitespace-nowrap">
          ${escapeHtml(row.urgency.label)}
        </span>
      `,
    },
    {
      id: 'certificado',
      header: 'Certificado & Organización',
      defaultWidthPct: 31,
      minWidthPx: 195,
      sortable: true,
      renderCell: (row) => `
        <div class="min-w-0 space-y-0.5">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="font-mono text-xs font-bold text-slate-900 truncate">${escapeHtml(row.numero_certificado)}</span>
            <span class="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
              ${escapeHtml(row.norma_codigo)}
            </span>
          </div>
          <div class="text-[11px] text-slate-500 truncate">${escapeHtml(row.organizacion_nombre)}</div>
        </div>
      `,
    },
    {
      id: 'estatus_cert',
      header: 'Estatus Cert.',
      defaultWidthPct: 13,
      minWidthPx: 110,
      sortable: true,
      renderCell: (row) => `
        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${row.certStatusBadgeClass} whitespace-nowrap">
          ${escapeHtml(row.estatus || 'Sin estatus')}
        </span>
      `,
    },
    {
      id: 'fecha_vigente',
      header: 'Últ. Fecha Programada',
      defaultWidthPct: 27,
      minWidthPx: 175,
      sortable: true,
      renderCell: (row) => {
        const badgeCls =
          row.precisionKind === 'PROGRAMADA_EXACTA'
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : row.precisionKind === 'PREPROGRAMADA_MES'
            ? 'bg-sky-50 text-sky-700 border-sky-200'
            : 'bg-slate-100 text-slate-600 border-slate-200';
        return `
          <div class="min-w-0 space-y-0.5">
            <div class="text-xs font-semibold text-slate-800 truncate" title="${escapeHtml(row.latestDateLabel)}">${escapeHtml(row.latestDateLabel)}</div>
            <span class="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold border ${badgeCls}">
              ${escapeHtml(row.precisionLabel)}
            </span>
          </div>
        `;
      },
    },
    {
      id: 'vinculacion',
      header: 'Vínculo',
      defaultWidthPct: 16,
      minWidthPx: 115,
      sortable: false,
      renderCell: (row) => {
        const linkCls =
          row.totalAudits === 0
            ? 'font-semibold bg-slate-100 text-slate-500 border-slate-200'
            : row.isLinkedLatest
            ? 'font-bold bg-indigo-50 text-indigo-800 border-indigo-200'
            : 'font-semibold bg-slate-100 text-slate-700 border-slate-200';
        return `<span title="${escapeHtml(row.linkFullTooltip)}" class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border ${linkCls} whitespace-nowrap">${escapeHtml(row.linkShortLabel)}</span>`;
      },
    },
  ];

  const renderCard = (row: CertificateFechaRow): string => {
    const linkCls =
      row.totalAudits === 0
        ? 'font-semibold bg-slate-100 text-slate-500 border-slate-200'
        : row.isLinkedLatest
        ? 'font-bold bg-indigo-50 text-indigo-800 border-indigo-200'
        : 'font-semibold bg-slate-100 text-slate-700 border-slate-200';

    return `
      <article
        role="button"
        tabindex="0"
        data-action="select-section-cert"
        data-cert-id="${escapeHtml(row.certId)}"
        aria-label="Gestionar fechas de ${escapeHtml(row.numero_certificado)}"
        class="text-left bg-white border border-slate-200 hover:border-slate-400 rounded-xl p-3.5 shadow-2xs transition-all cursor-pointer space-y-2.5 flex flex-col justify-between"
      >
        <div class="space-y-1.5">
          <div class="flex items-center justify-between gap-2">
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${row.urgency.badgeClass} whitespace-nowrap">
              ${escapeHtml(row.urgency.label)}
            </span>
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${row.certStatusBadgeClass} whitespace-nowrap">
              ${escapeHtml(row.estatus || 'Sin estatus')}
            </span>
          </div>
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="font-mono text-xs font-bold text-slate-900">${escapeHtml(row.numero_certificado)}</span>
            <span class="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              ${escapeHtml(row.norma_codigo)}
            </span>
          </div>
          <p class="text-[11px] text-slate-500 truncate">${escapeHtml(row.organizacion_nombre)}</p>
        </div>
        <div class="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px] text-slate-600">
          <span class="font-semibold truncate" title="${escapeHtml(row.latestDateLabel)}">📅 ${escapeHtml(row.latestDateLabel)}</span>
          <span
            title="${escapeHtml(row.linkFullTooltip)}"
            class="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] border ${linkCls} whitespace-nowrap"
          >
            ${escapeHtml(row.linkShortLabel)}
          </span>
        </div>
      </article>
    `;
  };

  const archiveProps = extractUniversalArchiveProps(archiveConfig, 'auditoria_fecha');

  return renderUniversalTemplate<CertificateFechaRow>({
    domainKey: 'designacion-fecha',
    tableId: 'designacion-fecha-main',
    title: 'Designación → Fecha de Auditoría',
    subtitle:
      'Gestión de fechas programadas (Mes + Año o Fecha Exacta) sincronizadas automáticamente con todo el lote vinculado.',
    entityLabel: 'certificados',
    searchQuery: state.query,
    searchPlaceholder: 'Buscar por certificado, organización, norma o fecha...',
    searchInputId: 'designacion-fechaSearchInput',
    clearSearchBtnId: 'clearDesignacionFechaSearchBtn',
    totalCount: allRows.length,
    filteredCount: sortedRows.length,
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen,
    sortState: { column: state.sortColumn, direction: state.sortDirection },
    columnWidths: tableColumnWidths?.['designacion-fecha-main'],
    facetGroups,
    items: sortedRows,
    columns,
    getRowAttrs: (row) =>
      `data-action="select-section-cert" data-cert-id="${escapeHtml(row.certId)}" title="Abrir fechas de ${escapeHtml(row.numero_certificado)}"`,
    renderCard,
    actionsHtml: headerAddAuditHtml,
    loading,
    emptyStateTitle: 'Sin certificados registrados en Designación → Fecha',
    emptyStateMessage:
      'Use "+ Auditoría" para programar la primera auditoría y definir sus fechas.',
    ...archiveProps,
  });
}

function renderFechaDetailView(opts: {
  state: DesignacionFechaViewState;
  certRow: CertificateFechaRow;
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

  const urgency = activeAudit
    ? computeAuditUrgencyClassification(
        activeAudit.fechas?.find((f) => !f.deleted_at && f.tipo_fecha !== 'REAL') ??
          activeAudit.latestDate ??
          null,
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

  const drafts: PlannedDateRowDraft[] = activeAudit
    ? state.draftAuditId === activeAudit.id && state.drafts !== null
      ? state.drafts
      : buildPlannedDateDraftsFromAudit(activeAudit, referenceIsoDate)
    : [];

  const realDates = extractRealExecutionDates(activeAudit);

  const batchBannerHtml = activeAudit
    ? `
      <div
        data-testid="fecha-linked-batch-banner"
        class="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5"
      >
        <div class="space-y-1 min-w-0">
          <p class="text-xs font-bold text-indigo-950">
            Las fechas programadas configuradas aquí se aplicarán simultáneamente a ${
              siblingsCount === 1
                ? 'esta auditoría'
                : `las ${siblingsCount} auditorías vinculadas de este lote`
            }.
          </p>
          <div class="flex flex-wrap items-center gap-1.5">
            ${linkedCtx.siblings
              .map(
                (sib) => `
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-indigo-200 text-[11px] font-semibold text-indigo-900">
                    <span class="font-mono font-bold">${escapeHtml(sib.audit.numero_certificado)}</span>
                    <span class="text-indigo-600">· ${escapeHtml(sib.audit.norma_codigo)}</span>
                  </span>
                `
              )
              .join('')}
          </div>
        </div>
        ${
          isStaff
            ? `
              <div class="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  data-action="add-planned-date-row"
                  data-audit-id="${escapeHtml(activeAudit.id)}"
                  ${state.saving ? 'disabled' : ''}
                  class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-800 cursor-pointer whitespace-nowrap disabled:opacity-50"
                >
                  + Agregar fecha
                </button>
                <button
                  type="submit"
                  form="designacionFechaBatchForm"
                  data-action="save-planned-dates-batch"
                  ${state.saving ? 'disabled' : ''}
                  class="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
                >
                  ${
                    state.saving
                      ? 'Guardando...'
                      : siblingsCount > 1
                      ? `Guardar en Lote (${siblingsCount})`
                      : 'Guardar Fechas'
                  }
                </button>
              </div>
            `
            : ''
        }
      </div>
    `
    : '';

  const rowsHtml =
    drafts.length === 0
      ? `
        <div class="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-6 text-center space-y-2">
          <p class="text-xs font-bold text-slate-800">No hay fechas programadas registradas en este lote</p>
          <p class="text-xs text-slate-500 max-w-md mx-auto">
            ${
              isStaff
                ? 'Agregue una o más fechas preprogramadas (Mes + Año) o Fechas Exactas para sincronizar el calendario del lote.'
                : 'Aún no se han definido fechas programadas para esta auditoría.'
            }
          </p>
        </div>
      `
      : `
        <div class="space-y-3">
          ${drafts
            .map((draft, idx) => {
              const isExact = draft.tipo_fecha === 'PROGRAMADA_EXACTA';
              return `
                <div
                  data-testid="planned-date-row"
                  data-local-id="${escapeHtml(draft.localId)}"
                  class="rounded-xl border border-slate-200 bg-white p-3.5 space-y-3 shadow-2xs"
                >
                  <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="px-2 py-0.5 rounded bg-slate-900 text-white text-[10px] font-mono font-bold">
                        #${idx + 1}
                      </span>
                      ${
                        isStaff
                          ? `
                            <select
                              data-fecha-field="tag"
                              data-local-id="${escapeHtml(draft.localId)}"
                              aria-label="Etiqueta de fecha #${idx + 1}"
                              class="h-7 px-2 rounded-md border border-slate-300 bg-white text-[11px] font-bold text-slate-800 focus:border-slate-900 focus:outline-none"
                            >
                              <option value="Programación" ${draft.tag === 'Programación' ? 'selected' : ''}>Programación</option>
                              <option value="Reprogramación" ${draft.tag === 'Reprogramación' ? 'selected' : ''}>Reprogramación</option>
                            </select>
                          `
                          : `<span class="text-xs font-bold text-slate-900">${escapeHtml(draft.tag)}</span>`
                      }
                    </div>

                    <div class="flex flex-wrap items-center gap-1.5">
                      <div class="inline-flex items-center gap-1" role="group" aria-label="Modalidad de fecha #${idx + 1}">
                        <button
                          type="button"
                          data-action="set-planned-date-mode"
                          data-local-id="${escapeHtml(draft.localId)}"
                          data-mode="PREPROGRAMADA_MES"
                          aria-pressed="${!isExact ? 'true' : 'false'}"
                          ${!isStaff ? 'disabled' : ''}
                          class="px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors whitespace-nowrap ${
                            !isExact
                              ? 'bg-sky-700 text-white shadow-2xs'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          } ${!isStaff ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}"
                        >
                          Mes + Año
                        </button>
                        <button
                          type="button"
                          data-action="set-planned-date-mode"
                          data-local-id="${escapeHtml(draft.localId)}"
                          data-mode="PROGRAMADA_EXACTA"
                          aria-pressed="${isExact ? 'true' : 'false'}"
                          ${!isStaff ? 'disabled' : ''}
                          class="px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors whitespace-nowrap ${
                            isExact
                              ? 'bg-emerald-700 text-white shadow-2xs'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          } ${!isStaff ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}"
                        >
                          Fecha Exacta
                        </button>
                      </div>

                      ${
                        isStaff
                          ? `
                            <button
                              type="button"
                              data-action="remove-planned-date-row"
                              data-local-id="${escapeHtml(draft.localId)}"
                              title="Remover fecha #${idx + 1}"
                              aria-label="Remover fecha #${idx + 1}"
                              class="px-2.5 py-1 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-[11px] font-bold text-rose-700 cursor-pointer whitespace-nowrap"
                            >
                              Remover
                            </button>
                          `
                          : ''
                      }
                    </div>
                  </div>

                  ${
                    !isExact
                      ? `
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div class="space-y-1">
                            <label for="fechaMes_${escapeHtml(draft.localId)}" class="block text-[11px] font-bold text-slate-700">
                              Mes Preprogramado
                            </label>
                            <select
                              id="fechaMes_${escapeHtml(draft.localId)}"
                              data-fecha-field="mes"
                              data-local-id="${escapeHtml(draft.localId)}"
                              ${!isStaff ? 'disabled' : ''}
                              class="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-900 disabled:bg-slate-100"
                            >
                              ${MONTHS_ES.map(
                                (m) =>
                                  `<option value="${m.value}" ${
                                    m.value === draft.mes ? 'selected' : ''
                                  }>${escapeHtml(m.label)}</option>`
                              ).join('')}
                            </select>
                          </div>
                          <div class="space-y-1">
                            <label for="fechaAnio_${escapeHtml(draft.localId)}" class="block text-[11px] font-bold text-slate-700">
                              Año
                            </label>
                            <input
                              type="number"
                              id="fechaAnio_${escapeHtml(draft.localId)}"
                              data-fecha-field="anio"
                              data-local-id="${escapeHtml(draft.localId)}"
                              min="2020"
                              max="2100"
                              value="${draft.anio}"
                              ${!isStaff ? 'disabled' : ''}
                              class="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-mono font-bold text-slate-900 disabled:bg-slate-100"
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
                                data-action="toggle-planned-date-single-day"
                                data-local-id="${escapeHtml(draft.localId)}"
                                ${draft.singleDay ? 'checked' : ''}
                                ${!isStaff ? 'disabled' : ''}
                                class="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              <span>Auditoría de 1 solo día</span>
                            </label>
                          </div>
                          <div class="grid grid-cols-1 ${draft.singleDay ? 'sm:grid-cols-1' : 'sm:grid-cols-2'} gap-3">
                            <div class="space-y-1">
                              <label for="fechaInicio_${escapeHtml(draft.localId)}" class="block text-[11px] font-bold text-slate-700">
                                ${draft.singleDay ? 'Fecha de Auditoría' : 'Fecha de Inicio'}
                              </label>
                              <input
                                type="date"
                                id="fechaInicio_${escapeHtml(draft.localId)}"
                                data-fecha-field="fecha_inicio"
                                data-local-id="${escapeHtml(draft.localId)}"
                                value="${escapeHtml(draft.fecha_inicio)}"
                                ${!isStaff ? 'disabled' : ''}
                                class="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-900 disabled:bg-slate-100"
                              />
                            </div>
                            ${
                              !draft.singleDay
                                ? `
                                  <div class="space-y-1">
                                    <label for="fechaFin_${escapeHtml(draft.localId)}" class="block text-[11px] font-bold text-slate-700">
                                      Fecha Fin
                                    </label>
                                    <input
                                      type="date"
                                      id="fechaFin_${escapeHtml(draft.localId)}"
                                      data-fecha-field="fecha_fin"
                                      data-local-id="${escapeHtml(draft.localId)}"
                                      value="${escapeHtml(draft.fecha_fin)}"
                                      ${!isStaff ? 'disabled' : ''}
                                      class="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-900 disabled:bg-slate-100"
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
                    <label for="fechaObs_${escapeHtml(draft.localId)}" class="block text-[11px] font-bold text-slate-700">
                      Observación / Motivo (opcional)
                    </label>
                    <input
                      type="text"
                      id="fechaObs_${escapeHtml(draft.localId)}"
                      data-fecha-field="observacion"
                      data-local-id="${escapeHtml(draft.localId)}"
                      maxlength="300"
                      value="${escapeHtml(draft.observacion)}"
                      placeholder="Ej. Ventana solicitada por coordinación operativa"
                      ${!isStaff ? 'disabled' : ''}
                      class="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 disabled:bg-slate-100"
                    />
                  </div>
                </div>
              `;
            })
            .join('')}
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

  const bodyHtml = activeAudit
    ? `
      <form id="designacionFechaBatchForm" data-audit-id="${escapeHtml(activeAudit.id)}" class="space-y-4" novalidate>
        ${batchBannerHtml}
        ${rowsHtml}
        ${realSectionHtml}
      </form>
    `
    : '';

  return renderAuditSectionShell({
    sectionTitle: 'Designación → Fecha',
    sectionSymbol: '📅',
    backSubview: 'designacion/fecha',
    certInfo: {
      id: certRow.certId,
      numero_certificado: certRow.numero_certificado,
      organizacion_nombre: certRow.organizacion_nombre,
      norma_codigo: certRow.norma_codigo,
      estatus: certRow.estatus,
    },
    navigation,
    programs,
    linkedSiblings: linkedCtx.siblings,
    showLinkedSiblings: false,
    isStaff,
    inCardBreadcrumbHtml,
    headerAddAuditHtml,
    tableName: 'auditoria_fecha',
    feedbackHtml: errorBannerHtml,
    futureWarningMessage,
    bodyHtml,
  });
}
