import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import type { OrganizacionEntity } from '../lib/activeCertificates';
import type { ConglomeradoEntity } from '../lib/conglomeradoDomain';
import type { VinculoEntity } from '../lib/vinculoDomain';
import type { ProgramaAuditoriaEntity } from '../lib/auditPlanningEngine';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import type { CertificateRecord } from '../lib/searchControls';
import { resolveAuditNavigation } from '../lib/certificateAuditSelector';
import { resolveShortOrganizacionName } from '../lib/codenameDomain';
import type { Phase5FindingEntity, ProgramacionAuditEntity } from '../lib/auditExecution';
import {
  buildOrgCertPickerModalModel,
  buildOrgMultiViewRows,
  type OrgMultiViewRow,
} from '../lib/orgMultiViewPickerDomain';
import { mergeCertSourcesForOrgPicker } from '../lib/designacionTipoDomain';
import {
  buildAuditRevisionContext,
  buildCertificateRevisionRows,
  buildRevisionOrgFacetCategories,
  createRevisionOrgCertMetaResolver,
  type CertificateRevisionRow,
  type RevisionFormDraft,
  type RevisionOrgCertMeta,
} from '../lib/revisionDomain';
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

export interface RevisionViewState {
  query: string;
  viewMode: UniversalViewMode;
  isSidebarOpen: boolean;
  sortColumn:
    | 'organizacion'
    | 'certificados'
    | 'auditorias'
    | 'revisadas_qa'
    | 'certificado'
    | 'ultima_auditoria'
    | 'fecha_revision'
    | 'estado'
    | null;
  sortDirection: SortDirection;
  facetSelections: MultiViewSelectionMap;
  selectedCertId?: string | null;
  selectedAuditId: string | null;
  pickerOrgId?: string | null;
  pickerSearchQuery?: string;
  formDraft?: RevisionFormDraft;
  savingRevision: boolean;
  editErrorMessage: string | null;
  saveSuccessMessage?: string | null;
}

export const DEFAULT_REVISION_STATE: RevisionViewState = {
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
  formDraft: undefined,
  savingRevision: false,
  editErrorMessage: null,
  saveSuccessMessage: null,
};

export interface RevisionViewRenderProps {
  profile: UserProfile;
  state: RevisionViewState;
  audits: ReadonlyArray<ProgramacionAuditEntity>;
  findings: ReadonlyArray<Phase5FindingEntity>;
  actorNameById: ReadonlyMap<string, string>;
  programs?: ReadonlyArray<ProgramaAuditoriaEntity>;
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
 * Step 3.3 — `7. Revisión` (`#/auditorias/revision`):
 * - Organization-Based Multi View (`Revisadas / Pendientes QA`) + grouped Pop-up Modal
 *   (`Última Auditoría`, `Fecha Revisión`, `Estado QA`).
 * - Simplified Detail View (`renderAuditSectionShell` `◀ / ▶` only):
 *   compact audit context (`Tipo`, discrete real dates, NC closed/open totals) +
 *   `Fecha de Revisión` (`<input type="date">`), `Comentario de Revisión (Opcional)` (`<textarea>`),
 *   and `Guardar Revisión` (`ADMIN`/`WORKER` only).
 */
export function renderRevisionView(props: RevisionViewRenderProps): string {
  const {
    profile,
    state,
    audits,
    findings,
    actorNameById,
    programs = [],
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
  const allRows = buildCertificateRevisionRows({
    audits: auditsPool,
    actorNameById,
    certificados,
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
      return renderRevisionDetailView({
        profile,
        isStaff,
        state,
        certRow,
        audits: auditsPool,
        programs,
        certificados,
        findings,
        inCardBreadcrumbHtml,
        headerAddAuditHtml: resolvedHeaderAddAuditHtml,
      });
    }
  }

  return renderRevisionMultiView({
    profile,
    state,
    auditsPool,
    programs,
    actorNameById,
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

function summarizeOrgRevision(row: OrgMultiViewRow<RevisionOrgCertMeta>): {
  reviewedCount: number;
  pendingCount: number;
  badgeClass: string;
  label: string;
} {
  let reviewedCount = 0;
  let pendingCount = 0;
  for (const cert of row.certificates) {
    if (cert.domainExtra.statusKey === 'REVISADA') reviewedCount += 1;
    else pendingCount += 1;
  }
  const allReviewed = row.certificates.length > 0 && pendingCount === 0;
  return {
    reviewedCount,
    pendingCount,
    badgeClass: allReviewed
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : 'bg-amber-50 text-amber-800 border-amber-200',
    label: allReviewed ? 'Revisada ✓' : 'Pendiente QA',
  };
}

function renderRevisionMultiView(opts: {
  profile: UserProfile;
  state: RevisionViewState;
  auditsPool: ReadonlyArray<ProgramacionAuditEntity>;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  actorNameById: ReadonlyMap<string, string>;
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
    actorNameById,
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

  const resolveCertMeta = createRevisionOrgCertMetaResolver({
    actorNameById,
  });

  const orgRows = buildOrgMultiViewRows<RevisionOrgCertMeta>({
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

  const facetCategories = buildRevisionOrgFacetCategories(orgRows);

  // Single 26% extra column complementing 74% base columns (30 + 22 + 22 = 74%)
  const extraColumns: ColumnDefinition<OrgMultiViewRow<RevisionOrgCertMeta>>[] = [
    {
      id: 'revisadas_qa',
      header: 'Revisadas / Pendientes QA',
      sortable: true,
      defaultWidthPct: 26,
      minWidthPx: 200,
      getValue: (r) => {
        const stats = summarizeOrgRevision(r);
        return stats.reviewedCount * 100 - stats.pendingCount;
      },
      renderCell: (r) => {
        const stats = summarizeOrgRevision(r);
        return `
          <div class="flex items-center justify-between gap-2 min-w-0 tabular-nums">
            <span class="text-xs font-semibold text-slate-800 truncate">
              ${stats.reviewedCount} revisada(s) · ${stats.pendingCount} pendiente(s)
            </span>
            <span class="inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold border shrink-0 ${stats.badgeClass}">
              ${escapeHtml(stats.label)}
            </span>
          </div>
        `;
      },
    },
  ];

  const renderCardExtra = (r: OrgMultiViewRow<RevisionOrgCertMeta>): string => {
    const stats = summarizeOrgRevision(r);
    return `
      <div class="flex items-center justify-between gap-2 text-xs">
        <span class="font-semibold text-slate-700">${stats.reviewedCount} revisada(s) · ${stats.pendingCount} pendiente(s)</span>
        <span class="inline-flex px-2 py-0.2 rounded-full text-[10px] font-bold border ${stats.badgeClass}">
          ${escapeHtml(stats.label)}
        </span>
      </div>
    `;
  };

  const pickerModel = state.pickerOrgId
    ? buildOrgCertPickerModalModel<RevisionOrgCertMeta>({
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

  const pickerDomainColumns: OrgPickerDomainColumn<RevisionOrgCertMeta>[] = [
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
      id: 'fecha_revision',
      header: 'Fecha Revisión',
      defaultWidthPct: 16,
      minWidthPx: 120,
      renderCell: (row) => {
        const meta = row.domainExtra;
        return `
          <span class="font-mono text-xs ${
            meta.fechaRevisionIso ? 'font-bold text-slate-900' : 'text-slate-500'
          }">
            ${escapeHtml(meta.fechaRevisionLabel)}
          </span>
        `;
      },
    },
    {
      id: 'estado_qa',
      header: 'Estado QA',
      defaultWidthPct: 16,
      minWidthPx: 125,
      renderCell: (row) => {
        const meta = row.domainExtra;
        return `
          <span class="inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold border truncate max-w-full ${meta.statusBadgeClass}">
            ${escapeHtml(meta.statusLabel)}
          </span>
        `;
      },
    },
  ];

  const pickerModalHtml = pickerModel
    ? renderOrgCertPickerModal<RevisionOrgCertMeta>({
        model: pickerModel,
        domainColumns: pickerDomainColumns,
        subtitle:
          'Seleccione un certificado (agrupado por auditoría vinculada) para registrar fecha y observaciones de revisión QA.',
        emptySearchMessage:
          'No se encontraron certificados ni revisiones que coincidan con la búsqueda.',
      })
    : '';

  return renderOrgMultiView<RevisionOrgCertMeta>({
    domainKey: 'revision',
    tableId: 'revision-main',
    title: 'Revisión de Auditorías',
    subtitle:
      'Registro simple de fecha de revisión y observaciones QA por organización.',
    entityLabel: 'organizaciones en revisión',
    groupingMode: 'audit',
    rows: orgRows,
    searchQuery: state.query,
    searchPlaceholder: 'Buscar organización, conglomerado, certificado, norma o fecha de revisión...',
    searchInputId: 'revisionSearchInput',
    clearSearchBtnId: 'clearRevisionSearchBtn',
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen,
    sortState: {
      column: state.sortColumn,
      direction: state.sortDirection,
    },
    columnWidths: tableColumnWidths?.['revision-main'],
    facetCategories,
    facetSelections: state.facetSelections || {},
    extraColumns,
    renderCardExtra,
    actionsHtml: headerAddAuditHtml,
    loading,
    loadingMessage: 'Cargando revisiones por organización...',
    emptyStateTitle:
      orgRows.length === 0
        ? 'No hay organizaciones con certificados en Revisión'
        : 'Sin organizaciones en esta selección',
    emptyStateMessage:
      orgRows.length === 0
        ? 'Registre certificados y programe auditorías con "+ Auditoría" para registrar revisiones.'
        : 'Ajuste la búsqueda o los filtros laterales para revisar otra organización.',
    pickerModalHtml,
  });
}

function renderRevisionDetailView(opts: {
  profile: UserProfile;
  isStaff: boolean;
  state: RevisionViewState;
  certRow: CertificateRevisionRow;
  audits: ReadonlyArray<ProgramacionAuditEntity>;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  certificados?: ReadonlyArray<CertificadoDetailEntity>;
  findings: ReadonlyArray<Phase5FindingEntity>;
  inCardBreadcrumbHtml: string;
  headerAddAuditHtml: string;
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
    inCardBreadcrumbHtml,
    headerAddAuditHtml,
  } = opts;

  const preferredAuditId = state.selectedAuditId ?? certRow.latestAudit?.id ?? null;
  const navigation = resolveAuditNavigation(
    certRow.certId,
    preferredAuditId,
    audits
  );
  const activeAudit = navigation.activeAudit;

  const feedbackHtml = [
    state.editErrorMessage
      ? `<div class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-800">⚠️ ${escapeHtml(state.editErrorMessage)}</div>`
      : '',
    state.saveSuccessMessage
      ? `<div class="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800">✓ ${escapeHtml(state.saveSuccessMessage)}</div>`
      : '',
  ]
    .filter(Boolean)
    .join('');

  let bodyHtml = '';
  if (activeAudit) {
    const context = buildAuditRevisionContext(activeAudit, findings);
    const activeDraft: RevisionFormDraft =
      state.formDraft && state.formDraft.id_auditoria === activeAudit.id
        ? state.formDraft
        : {
            id_auditoria: activeAudit.id,
            revisado: true,
            fecha_revision: activeAudit.fecha_revision
              ? activeAudit.fecha_revision.slice(0, 10)
              : '',
            resumen_revision: activeAudit.resumen_revision || '',
          };

    const summaryCardHtml = `
      <section
        data-testid="revision-summary-strip"
        class="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-xs"
      >
        <span class="inline-flex items-center gap-1.5 min-w-0">
          <span class="font-semibold text-slate-500">Tipo:</span>
          <strong class="font-bold text-slate-900">${escapeHtml(context.tipoAuditoria)}</strong>
        </span>
        <span class="inline-flex items-center gap-1.5 min-w-0">
          <span class="font-semibold text-slate-500">Fechas Reales:</span>
          <strong class="font-mono font-semibold text-slate-800">${escapeHtml(context.realDatesSummary)}</strong>
        </span>
        <span class="inline-flex items-center gap-1.5 min-w-0">
          <span class="font-semibold text-slate-500">No Conformidades:</span>
          <strong class="font-semibold text-slate-800">${escapeHtml(context.ncsSummary)}</strong>
        </span>
      </section>
    `;

    const formOrReadOnlyHtml = isStaff
      ? `
        <section class="bg-white border border-slate-200 rounded-xl p-4">
          <form id="revisionSaveForm" data-audit-id="${escapeHtml(activeAudit.id)}" class="space-y-3">
            <div>
              <label for="revisionDateInput" class="block text-xs font-bold text-slate-700 mb-1">
                Fecha de Revisión
              </label>
              <input
                type="date"
                id="revisionDateInput"
                name="fecha_revision"
                required
                value="${escapeHtml(activeDraft.fecha_revision)}"
                ${state.savingRevision ? 'disabled' : ''}
                class="w-full sm:w-60 h-8 text-xs font-mono font-semibold rounded-lg border border-slate-300 bg-white px-2.5 text-slate-900"
              />
            </div>

            <div>
              <label for="revisionCommentInput" class="block text-xs font-bold text-slate-700 mb-1">
                Comentario de Revisión (Opcional)
              </label>
              <textarea
                id="revisionCommentInput"
                name="resumen_revision"
                rows="3"
                maxlength="1000"
                placeholder="Observaciones breves sobre la revisión de la auditoría..."
                ${state.savingRevision ? 'disabled' : ''}
                class="w-full text-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
              >${escapeHtml(activeDraft.resumen_revision)}</textarea>
            </div>

            <div class="flex justify-end">
              <button
                type="submit"
                id="saveRevisionBtn"
                ${state.savingRevision ? 'disabled' : ''}
                class="h-8 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold cursor-pointer inline-flex items-center gap-1.5"
              >
                <span>${state.savingRevision ? 'Guardando...' : 'Guardar Revisión'}</span>
              </button>
            </div>
          </form>
        </section>
      `
      : `
        <section class="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5 text-xs">
          <div class="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
            <span class="font-bold text-slate-900">Revisión QA</span>
            <span class="text-[11px] font-semibold text-slate-500">Solo Lectura · ${escapeHtml(profile.role)}</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Fecha de Revisión</div>
              <div class="font-mono font-bold text-slate-900 mt-0.5">${escapeHtml(
                activeAudit.fecha_revision
                  ? activeAudit.fecha_revision.slice(0, 10).split('-').reverse().join('/')
                  : 'Pendiente'
              )}</div>
            </div>
            <div>
              <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Comentario de Revisión</div>
              <div class="text-slate-700 mt-0.5">${escapeHtml(
                activeAudit.resumen_revision || 'Sin comentarios registrados.'
              )}</div>
            </div>
          </div>
        </section>
      `;

    bodyHtml = `<div class="space-y-3">${summaryCardHtml}${formOrReadOnlyHtml}</div>`;
  }

  return renderAuditSectionShell({
    sectionTitle: 'Revisión',
    sectionSymbol: '🕵️',
    backSubview: 'revision',
    certInfo: {
      id: certRow.certId,
      id_organizacion: certRow.id_organizacion,
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
    linkedSiblings: [],
    showLinkedSiblings: false,
    isStaff,
    inCardBreadcrumbHtml,
    headerAddAuditHtml,
    tableName: 'auditoria',
    feedbackHtml,
    bodyHtml,
    emptyAuditBodyHtml: `
      <div class="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
        Este certificado aún no tiene auditorías registradas para revisar.
      </div>
    `,
  });
}
