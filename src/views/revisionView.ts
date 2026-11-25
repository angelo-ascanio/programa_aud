import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import type { ProgramaAuditoriaEntity } from '../lib/auditPlanningEngine';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import type { CertificateRecord } from '../lib/searchControls';
import { resolveAuditNavigation } from '../lib/certificateAuditSelector';
import { resolveShortOrganizacionName } from '../lib/codenameDomain';
import type { Phase5FindingEntity, ProgramacionAuditEntity } from '../lib/auditExecution';
import {
  buildAuditRevisionContext,
  buildCertificateRevisionRows,
  type CertificateRevisionRow,
  type RevisionFormDraft,
} from '../lib/revisionDomain';
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

export interface RevisionViewState {
  query: string;
  viewMode: UniversalViewMode;
  isSidebarOpen: boolean;
  sortColumn: 'certificado' | 'ultima_auditoria' | 'fecha_revision' | 'estado' | null;
  sortDirection: SortDirection;
  facetSelections: MultiViewSelectionMap;
  selectedCertId?: string | null;
  selectedAuditId: string | null;
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
 * Step 8.1 — `7. Revisión` (`#/auditorias/revision`):
 * - Certificate-Based Multi View (`Certificado & Org`, `Última Auditoría`, `Fecha de Revisión`, `Estado`).
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
    state,
    allRows,
    loading,
    tableColumnWidths,
    headerAddAuditHtml: resolvedHeaderAddAuditHtml,
  });
}

function renderRevisionMultiView(opts: {
  state: RevisionViewState;
  allRows: ReadonlyArray<CertificateRevisionRow>;
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

  const facetCategories: MultiViewFacetCategory<CertificateRevisionRow>[] = [
    {
      id: 'estado_revision',
      label: 'Estado de Revisión',
      options: [
        { value: 'PENDIENTE', label: 'Pendiente' },
        { value: 'REVISADA', label: 'Revisada ✓' },
      ],
      extractValues: (r) => r.statusKey,
    },
    {
      id: 'norma',
      label: 'Norma',
      extractValues: (r) => r.norma_codigo,
    },
  ];

  const selections: MultiViewSelectionMap = state.facetSelections || {};
  const searchOptions = {
    getSearchableText: (r: CertificateRevisionRow) => r.searchHaystack,
  };

  const filtered = filterRecordsWithFacets(
    allRows,
    state.query,
    facetCategories,
    selections,
    searchOptions
  );
  const facetGroups = computeReactiveFacetCounts(
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
    (r, col) => {
      switch (col) {
        case 'certificado':
          return `${r.numero_certificado} ${r.organizacion_nombre}`;
        case 'ultima_auditoria':
          return `${r.latestAuditTipo} ${r.latestAuditDateLabel}`;
        case 'fecha_revision':
          return r.fechaRevisionIso || '';
        case 'estado':
          return r.statusLabel;
        default:
          return '';
      }
    }
  );

  // Strict 4-column table-fixed colgroup (35 + 25 + 20 + 20 = 100%) and 0 <button> in <tbody>
  const columns: ColumnDefinition<CertificateRevisionRow>[] = [
    {
      id: 'certificado',
      header: 'Certificado & Org',
      sortable: true,
      defaultWidthPct: 35,
      minWidthPx: 200,
      renderCell: (r) => {
        const verChip =
          typeof r.activeVersionNumero === 'number' && r.activeVersionNumero >= 1
            ? `<span class="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-300 shrink-0">v${Math.floor(r.activeVersionNumero)}</span>`
            : '';
        const noAlcanceChip =
          r.hasAlcance === false
            ? `<span class="px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200 shrink-0">Sin alcance</span>`
            : '';
        const shortOrgName = resolveShortOrganizacionName({
          nombre: r.organizacion_nombre,
          abreviacion: r.organizacion_abreviacion,
        });
        const scopeTitle = r.alcance_es
          ? `${r.organizacion_nombre} · Alcance: ${r.alcance_es}`
          : `${r.organizacion_nombre} · Sin Alcance activo registrado en Certificación → Certificado → Alcance.`;
        return `
        <div class="min-w-0 space-y-0.5" title="${escapeHtml(scopeTitle)}">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="font-bold text-slate-900 truncate">${escapeHtml(r.numero_certificado)}</span>
            ${verChip}
            <span class="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 shrink-0">${escapeHtml(r.norma_codigo)}</span>
            ${noAlcanceChip}
          </div>
          <div class="text-xs text-slate-600 truncate">${escapeHtml(shortOrgName)}</div>
        </div>
      `;
      },
    },
    {
      id: 'ultima_auditoria',
      header: 'Última Auditoría',
      sortable: true,
      defaultWidthPct: 25,
      minWidthPx: 160,
      renderCell: (r) => `
        <div class="min-w-0" title="${escapeHtml(r.latestAuditTooltip)}">
          <div class="font-semibold text-slate-800 truncate">${escapeHtml(r.latestAuditCodename)}</div>
          <div class="text-[11px] font-mono text-slate-500 truncate">${escapeHtml(r.latestAuditDateLabel)}</div>
        </div>
      `,
    },
    {
      id: 'fecha_revision',
      header: 'Fecha de Revisión',
      sortable: true,
      defaultWidthPct: 20,
      minWidthPx: 130,
      renderCell: (r) => `
        <span class="font-mono text-xs ${
          r.fechaRevisionIso ? 'font-bold text-slate-900' : 'text-slate-500'
        }">
          ${escapeHtml(r.fechaRevisionLabel)}
        </span>
      `,
    },
    {
      id: 'estado',
      header: 'Estado',
      sortable: true,
      defaultWidthPct: 20,
      minWidthPx: 130,
      renderCell: (r) => `
        <span class="inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold border truncate max-w-full ${r.statusBadgeClass}">
          ${escapeHtml(r.statusLabel)}
        </span>
      `,
    },
  ];

  const renderCard = (r: CertificateRevisionRow): string => {
    const verChip =
      typeof r.activeVersionNumero === 'number' && r.activeVersionNumero >= 1
        ? `<span class="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-300 shrink-0">v${Math.floor(r.activeVersionNumero)}</span>`
        : '';
    const noAlcanceChip =
      r.hasAlcance === false
        ? `<span class="px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200 shrink-0">Sin alcance</span>`
        : '';
    const shortOrgName = resolveShortOrganizacionName({
      nombre: r.organizacion_nombre,
      abreviacion: r.organizacion_abreviacion,
    });
    const scopeTitle = r.alcance_es
      ? `${r.organizacion_nombre} · Alcance: ${r.alcance_es}`
      : `${r.organizacion_nombre} · Sin Alcance activo registrado en Certificación → Certificado → Alcance.`;
    return `
    <article
      data-action="select-section-cert"
      data-cert-id="${escapeHtml(r.certId)}"
      tabindex="0"
      role="button"
      title="${escapeHtml(scopeTitle)}"
      class="bg-white border border-slate-200 hover:border-sky-300 rounded-xl p-4 shadow-2xs transition cursor-pointer flex flex-col gap-2.5"
    >
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0 space-y-0.5">
          <div class="flex flex-wrap items-center gap-1.5 min-w-0">
            <span class="text-sm font-bold text-slate-900 truncate">${escapeHtml(r.numero_certificado)}</span>
            ${verChip}
            ${noAlcanceChip}
          </div>
          <div class="text-xs text-slate-600 truncate">${escapeHtml(shortOrgName)}</div>
          <div class="text-[11px] text-slate-500 truncate">${escapeHtml(r.norma_codigo)}</div>
        </div>
        <span class="inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold border shrink-0 ${r.statusBadgeClass}">
          ${escapeHtml(r.statusLabel)}
        </span>
      </div>
      <div class="grid grid-cols-2 gap-2 text-xs bg-slate-50 border border-slate-100 rounded-lg p-2.5">
        <div class="min-w-0" title="${escapeHtml(r.latestAuditTooltip)}">
          <div class="text-[10px] font-semibold uppercase text-slate-500">Última Auditoría</div>
          <div class="font-semibold text-slate-800 truncate">${escapeHtml(r.latestAuditCodename)}</div>
        </div>
        <div class="min-w-0">
          <div class="text-[10px] font-semibold uppercase text-slate-500">Fecha Revisión</div>
          <div class="font-mono font-semibold text-slate-800 truncate">${escapeHtml(r.fechaRevisionLabel)}</div>
        </div>
      </div>
    </article>
  `;
  };

  return renderUniversalTemplate<CertificateRevisionRow>({
    domainKey: 'revision',
    tableId: 'revision-main',
    title: 'Revisión de Auditorías',
    subtitle:
      'Registro simple de fecha de revisión y observaciones por certificado.',
    entityLabel: 'certificados en revisión',
    searchQuery: state.query,
    searchPlaceholder: 'Buscar por certificado, organización, norma o fecha de revisión...',
    searchInputId: 'revisionSearchInput',
    clearSearchBtnId: 'clearRevisionSearchBtn',
    totalCount: allRows.length,
    filteredCount: sorted.length,
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen,
    sortState: {
      column: state.sortColumn,
      direction: state.sortDirection,
    },
    columnWidths: tableColumnWidths?.['revision-main'],
    facetGroups,
    items: sorted,
    columns,
    getRowAttrs: (r) =>
      `data-action="select-section-cert" data-cert-id="${escapeHtml(r.certId)}" tabindex="0" role="button"`,
    renderCard,
    actionsHtml: headerAddAuditHtml,
    loading,
    loadingMessage: 'Cargando revisiones por certificado...',
    emptyStateTitle: 'Sin certificados en esta selección',
    emptyStateMessage:
      'Ajuste la búsqueda o los filtros laterales para revisar otro certificado.',
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
      <section class="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div class="min-w-0">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Tipo de Auditoría</div>
          <div class="font-bold text-slate-900 mt-0.5 truncate">${escapeHtml(context.tipoAuditoria)}</div>
        </div>
        <div class="min-w-0">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Fechas Reales</div>
          <div class="font-mono font-semibold text-slate-800 mt-0.5">${escapeHtml(context.realDatesSummary)}</div>
        </div>
        <div class="min-w-0">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500">No Conformidades</div>
          <div class="font-semibold text-slate-800 mt-0.5">${escapeHtml(context.ncsSummary)}</div>
        </div>
      </section>
    `;

    const formOrReadOnlyHtml = isStaff
      ? `
        <section class="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <form id="revisionSaveForm" data-audit-id="${escapeHtml(activeAudit.id)}" class="space-y-4">
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
                class="w-full sm:w-64 h-9 text-xs font-mono font-semibold rounded-lg border border-slate-300 bg-white px-3 text-slate-900"
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
                class="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold cursor-pointer inline-flex items-center gap-1.5"
              >
                <span>${state.savingRevision ? 'Guardando...' : 'Guardar Revisión'}</span>
              </button>
            </div>
          </form>
        </section>
      `
      : `
        <section class="bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-xs">
          <div class="font-bold text-slate-900">
            Revisión de Auditoría (Solo Lectura · ${escapeHtml(profile.role)})
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 border border-slate-100 rounded-lg p-3.5">
            <div>
              <div class="text-[10px] font-bold uppercase text-slate-500">Fecha de Revisión</div>
              <div class="font-mono font-bold text-slate-900 mt-0.5">${escapeHtml(
                activeAudit.fecha_revision
                  ? activeAudit.fecha_revision.slice(0, 10).split('-').reverse().join('/')
                  : 'Pendiente'
              )}</div>
            </div>
            <div>
              <div class="text-[10px] font-bold uppercase text-slate-500">Comentario de Revisión</div>
              <div class="text-slate-700 mt-0.5">${escapeHtml(
                activeAudit.resumen_revision || 'Sin comentarios registrados.'
              )}</div>
            </div>
          </div>
        </section>
      `;

    bodyHtml = `<div class="space-y-4">${summaryCardHtml}${formOrReadOnlyHtml}</div>`;
  }

  return renderAuditSectionShell({
    sectionTitle: 'Revisión',
    sectionSymbol: '🕵️',
    backSubview: 'revision',
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
