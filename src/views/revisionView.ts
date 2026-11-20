import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import type { Phase5FindingEntity, ProgramacionAuditEntity } from '../lib/auditExecution';
import {
  buildRevisionQueueRows,
  formatRevisionDateDdMmYyyy,
  formatRevisionNcSummary,
  type RevisionAuditSummaryRow,
  type RevisionFormDraft,
} from '../lib/revisionDomain';
import {
  computeReactiveFacetCounts,
  filterRecordsWithFacets,
  type ColumnDefinition,
  type MultiViewFacetCategory,
  type MultiViewSelectionMap,
  type SortDirection,
} from '../lib/universalTemplate';
import { renderUniversalTemplate, type UniversalViewMode } from './universalTemplate';
import { renderDetailPageTemplate } from './detailTemplate';

export interface RevisionViewState {
  query: string;
  viewMode: UniversalViewMode;
  isSidebarOpen: boolean;
  sortColumn: 'auditoria' | 'cierre' | 'estado_revision' | null;
  sortDirection: SortDirection;
  facetSelections: MultiViewSelectionMap;
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
  loading?: boolean;
  tableColumnWidths?: Record<string, Record<string, number>>;
}

function getTodayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function createDefaultRevisionDraft(row: RevisionAuditSummaryRow): RevisionFormDraft {
  return {
    id_auditoria: row.audit.id,
    revisado: row.revisado,
    fecha_revision: row.fechaRevision || getTodayIsoDate(),
    documentacion_completa: row.documentacionCompleta,
    resumen_revision: row.resumenRevision || '',
  };
}

function sortRevisionRows(
  rows: ReadonlyArray<RevisionAuditSummaryRow>,
  sortColumn: RevisionViewState['sortColumn'],
  sortDirection: SortDirection
): RevisionAuditSummaryRow[] {
  if (!sortColumn || sortDirection === 'none') {
    return [...rows];
  }
  const factor = sortDirection === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    switch (sortColumn) {
      case 'auditoria':
        return (
          factor *
          `${a.audit.numero_certificado} ${a.audit.organizacion_nombre} ${a.audit.codigo_auditoria}`.localeCompare(
            `${b.audit.numero_certificado} ${b.audit.organizacion_nombre} ${b.audit.codigo_auditoria}`,
            'es'
          )
        );
      case 'cierre':
        return factor * a.closingDateIso.localeCompare(b.closingDateIso);
      case 'estado_revision': {
        const stateCmp = Number(a.revisado) - Number(b.revisado);
        if (stateCmp !== 0) return factor * stateCmp;
        const revA = a.fechaRevision || '';
        const revB = b.fechaRevision || '';
        return factor * revA.localeCompare(revB);
      }
      default:
        return 0;
    }
  });
}

function buildRevisionColumns(): ColumnDefinition<RevisionAuditSummaryRow>[] {
  return [
    {
      id: 'auditoria',
      header: 'Certificado & Org',
      defaultWidthPct: 30,
      minWidthPx: 185,
      sortable: true,
      renderCell: (row) => `
        <div class="min-w-0">
          <div class="font-bold text-slate-900 truncate">${escapeHtml(row.audit.numero_certificado)}</div>
          <div class="text-[11px] text-slate-600 truncate">${escapeHtml(row.audit.organizacion_nombre)}</div>
          <div class="text-[10px] font-mono text-slate-500 truncate">${escapeHtml(row.audit.codigo_auditoria)} · ${escapeHtml(row.audit.norma_codigo)}</div>
        </div>
      `,
    },
    {
      id: 'cierre',
      header: 'Fecha Cierre',
      defaultWidthPct: 16,
      minWidthPx: 115,
      sortable: true,
      renderCell: (row) => `
        <div class="min-w-0">
          <div class="font-mono font-semibold text-slate-800 truncate">${escapeHtml(row.closingDateIso)}</div>
          <div class="text-[10px] text-slate-500 truncate">${row.realEndIso ? `Real: ${escapeHtml(row.realEndIso)}` : 'Real registrada'}</div>
        </div>
      `,
    },
    {
      id: 'hallazgos',
      header: 'Resumen NC',
      defaultWidthPct: 16,
      minWidthPx: 115,
      sortable: false,
      renderCell: (row) => {
        const badgeCls =
          row.openNcs > 0
            ? 'bg-amber-50 text-amber-800 border-amber-200'
            : 'bg-emerald-50 text-emerald-700 border-emerald-200';
        return `
          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${badgeCls} truncate max-w-full">
            ${escapeHtml(formatRevisionNcSummary(row))}
          </span>
        `;
      },
    },
    {
      id: 'documentacion',
      header: 'Documentación',
      defaultWidthPct: 18,
      minWidthPx: 130,
      sortable: false,
      renderCell: (row) =>
        row.documentacionCompleta
          ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 truncate max-w-full">Completa ✓</span>`
          : `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 truncate max-w-full">Pendiente verificar</span>`,
    },
    {
      id: 'estado_revision',
      header: 'Revisión QA',
      defaultWidthPct: 20,
      minWidthPx: 140,
      sortable: true,
      renderCell: (row) => {
        if (row.revisado) {
          const revDate = formatRevisionDateDdMmYyyy(row.fechaRevision);
          return `
            <div class="min-w-0">
              <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-600 text-white truncate max-w-full">
                Revisada (${escapeHtml(revDate)})
              </span>
              ${
                row.revisadoPorNombre
                  ? `<div class="text-[10px] text-slate-500 truncate mt-0.5">Por ${escapeHtml(row.revisadoPorNombre)}</div>`
                  : ''
              }
            </div>
          `;
        }
        return `
          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-200 truncate max-w-full">
            Pendiente Revisión
          </span>
        `;
      },
    },
  ];
}

function renderRevisionCard(row: RevisionAuditSummaryRow): string {
  const statusPill = row.revisado
    ? `<span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-600 text-white">Revisada (${escapeHtml(formatRevisionDateDdMmYyyy(row.fechaRevision))})</span>`
    : `<span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-200">Pendiente Revisión</span>`;

  const docPill = row.documentacionCompleta
    ? `<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Completa ✓</span>`
    : `<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">Pendiente verificar</span>`;

  return `
    <article
      data-action="select-revision-audit"
      data-audit-id="${escapeHtml(row.audit.id)}"
      tabindex="0"
      role="button"
      class="bg-white border border-slate-200 hover:border-blue-300 rounded-xl p-4 shadow-2xs transition cursor-pointer flex flex-col gap-3"
    >
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="text-[11px] font-mono font-bold text-slate-500">${escapeHtml(row.audit.codigo_auditoria)} · ${escapeHtml(row.audit.norma_codigo)}</div>
          <h3 class="text-sm font-bold text-slate-900 truncate mt-0.5">${escapeHtml(row.audit.numero_certificado)}</h3>
          <p class="text-xs text-slate-600 truncate">${escapeHtml(row.audit.organizacion_nombre)}</p>
        </div>
        ${statusPill}
      </div>
      <div class="grid grid-cols-2 gap-2 text-xs bg-slate-50 border border-slate-100 rounded-lg p-2.5">
        <div>
          <div class="text-[10px] uppercase tracking-wide font-semibold text-slate-500">Fecha Cierre</div>
          <div class="font-mono font-semibold text-slate-800">${escapeHtml(row.closingDateIso)}</div>
        </div>
        <div>
          <div class="text-[10px] uppercase tracking-wide font-semibold text-slate-500">Resumen NC</div>
          <div class="font-semibold text-slate-800">${escapeHtml(formatRevisionNcSummary(row))}</div>
        </div>
      </div>
      <div class="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 text-xs">
        ${docPill}
        <span class="text-[11px] font-semibold text-blue-700">Inspeccionar QA →</span>
      </div>
    </article>
  `;
}

function renderRevisionDetailView(opts: {
  profile: UserProfile;
  state: RevisionViewState;
  row: RevisionAuditSummaryRow;
}): string {
  const { profile, state, row } = opts;
  const audit = row.audit;
  const isStaff = isApprovedStaffProfile(profile);
  const draft =
    state.formDraft && state.formDraft.id_auditoria === audit.id
      ? state.formDraft
      : createDefaultRevisionDraft(row);

  const realWindowLabel =
    row.realStartIso && row.realEndIso
      ? `${row.realStartIso} al ${row.realEndIso}`
      : row.realEndIso || 'Sin fecha REAL';

  const statusBadge = row.revisado
    ? {
        label: `Revisada (${formatRevisionDateDdMmYyyy(row.fechaRevision)})`,
        badgeClass: 'bg-emerald-600 text-white border-emerald-700',
      }
    : {
        label: 'Pendiente Revisión',
        badgeClass: 'bg-amber-100 text-amber-900 border-amber-200',
      };

  const feedbackBanner = [
    state.editErrorMessage
      ? `<div class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800">${escapeHtml(state.editErrorMessage)}</div>`
      : '',
    state.saveSuccessMessage
      ? `<div class="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-800">${escapeHtml(state.saveSuccessMessage)}</div>`
      : '',
  ]
    .filter(Boolean)
    .join('');

  const verificationLinksHtml = `
    <section class="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-3">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h3 class="text-sm font-bold text-slate-900">Verificación Documental del Ciclo</h3>
          <p class="text-xs text-slate-500">Enlaces directos para inspeccionar ejecución, hallazgos y alcance antes de aprobar QA.</p>
        </div>
        <span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
          row.openNcs > 0
            ? 'bg-amber-50 text-amber-800 border-amber-200'
            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
        }">
          ${escapeHtml(formatRevisionNcSummary(row))}
        </span>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <button
          type="button"
          data-action="open-revision-resultado"
          data-audit-id="${escapeHtml(audit.id)}"
          class="text-left p-3.5 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 transition cursor-pointer"
        >
          <div class="text-xs font-bold text-slate-900">📝 Paso 10 · Resultado</div>
          <div class="text-[11px] text-slate-600 mt-1">Revisar hallazgos, fechas REAL y decisión de cierre (${escapeHtml(audit.codigo_auditoria)}).</div>
        </button>
        <button
          type="button"
          data-action="open-revision-programa"
          data-audit-id="${escapeHtml(audit.id)}"
          class="text-left p-3.5 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 transition cursor-pointer"
        >
          <div class="text-xs font-bold text-slate-900">📋 Paso 7 · Programa</div>
          <div class="text-[11px] text-slate-600 mt-1">Consultar procesos, turnos y cobertura planificada por sitio.</div>
        </button>
        <button
          type="button"
          data-nav="certificacion"
          data-subview="certificates"
          data-entity-type="cert"
          data-entity-id="${escapeHtml(audit.id_certificado)}"
          class="text-left p-3.5 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 transition cursor-pointer"
        >
          <div class="text-xs font-bold text-slate-900">📜 Certificado ${escapeHtml(audit.numero_certificado)}</div>
          <div class="text-[11px] text-slate-600 mt-1">Verificar vigencia, organización y estado documental en Certificación.</div>
        </button>
      </div>
    </section>
  `;

  const qaGateHtml = isStaff
    ? `
      <section class="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 class="text-sm font-bold text-slate-900">Compuerta Final de Control de Calidad (QA)</h3>
            <p class="text-xs text-slate-500">Solo el personal autorizado (ADMIN / WORKER) puede verificar la documentación completa y aprobar la revisión post-cierre.</p>
          </div>
          ${
            row.revisado
              ? `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-600 text-white">✓ Aprobada por ${escapeHtml(row.revisadoPorNombre || 'Coordinador QA')}</span>`
              : `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-200">Pendiente de Aprobación QA</span>`
          }
        </div>

        ${feedbackBanner}

        <form id="revisionApprovalForm" data-audit-id="${escapeHtml(audit.id)}" class="space-y-4 bg-slate-50/90 border border-slate-200 rounded-xl p-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label for="revisionFechaInput" class="block text-xs font-bold text-slate-700 mb-1">
                Fecha de Revisión QA
              </label>
              <input
                type="date"
                id="revisionFechaInput"
                name="fecha_revision"
                value="${escapeHtml(draft.fecha_revision)}"
                min="${escapeHtml(row.closingDateIso)}"
                ${state.savingRevision ? 'disabled' : ''}
                class="w-full text-xs font-mono font-semibold rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
              />
              <p class="text-[11px] text-slate-500 mt-1">Debe ser igual o posterior al cierre (${escapeHtml(row.closingDateIso)}).</p>
            </div>

            <div class="flex items-start pt-1 md:pt-6">
              <label for="revisionDocCompletaCheckbox" class="inline-flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  id="revisionDocCompletaCheckbox"
                  name="documentacion_completa"
                  ${draft.documentacion_completa ? 'checked' : ''}
                  ${state.savingRevision ? 'disabled' : ''}
                  class="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span class="text-xs font-semibold text-slate-800">
                  Documentación completa verificada (expediente cerrado, evidencias, fechas reales y trazabilidad conformes).
                </span>
              </label>
            </div>
          </div>

          <div>
            <label for="revisionResumenInput" class="block text-xs font-bold text-slate-700 mb-1">
              Resumen de Revisión y Observaciones QA
            </label>
            <textarea
              id="revisionResumenInput"
              name="resumen_revision"
              rows="3"
              maxlength="1000"
              placeholder="Notas breves de verificación documental y conformidad post-cierre..."
              ${state.savingRevision ? 'disabled' : ''}
              class="w-full text-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
            >${escapeHtml(draft.resumen_revision)}</textarea>
          </div>

          <div class="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button
              type="submit"
              ${state.savingRevision ? 'disabled' : ''}
              class="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold cursor-pointer inline-flex items-center gap-1.5"
            >
              <span>${
                state.savingRevision
                  ? 'Guardando revisión...'
                  : row.revisado
                  ? 'Actualizar Revisión QA'
                  : 'Aprobar Revisión QA'
              }</span>
            </button>
          </div>
        </form>
      </section>
    `
    : `
      <section class="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-3">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 class="text-sm font-bold text-slate-900">Estado de Control de Calidad (Solo Lectura)</h3>
            <p class="text-xs text-slate-500">Consulta del dictamen final de revisión QA para su perfil (${escapeHtml(profile.role)}).</p>
          </div>
          ${
            row.revisado
              ? `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-600 text-white">✓ Revisada (${escapeHtml(formatRevisionDateDdMmYyyy(row.fechaRevision))})</span>`
              : `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-200">Pendiente de Revisión QA</span>`
          }
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div>
            <div class="text-[11px] font-semibold text-slate-500">Documentación</div>
            <div class="font-bold text-slate-900 mt-0.5">${row.documentacionCompleta ? 'Completa ✓' : 'Pendiente verificar'}</div>
          </div>
          <div>
            <div class="text-[11px] font-semibold text-slate-500">Fecha de Revisión</div>
            <div class="font-mono font-bold text-slate-900 mt-0.5">${escapeHtml(row.fechaRevision || 'Sin aprobar')}</div>
          </div>
          <div>
            <div class="text-[11px] font-semibold text-slate-500">Revisor QA</div>
            <div class="font-bold text-slate-900 mt-0.5">${escapeHtml(row.revisadoPorNombre || 'Pendiente')}</div>
          </div>
          <div class="md:col-span-3 pt-2 border-t border-slate-200">
            <div class="text-[11px] font-semibold text-slate-500">Resumen de Revisión</div>
            <div class="text-slate-700 mt-0.5">${escapeHtml(row.resumenRevision || 'Sin observaciones registradas aún.')}</div>
          </div>
        </div>
      </section>
    `;

  return `
    <div class="space-y-4">
      ${renderDetailPageTemplate({
        entityType: 'revision_auditoria',
        entitySymbol: '✅',
        eyebrowCode: `Paso 11 · ${audit.codigo_auditoria}`,
        title: `Revisión QA · ${audit.numero_certificado}`,
        subtitle: `${audit.organizacion_nombre} · ${audit.norma_codigo} (${audit.tipo_auditoria})`,
        statusBadge,
        backButton: {
          label: '← Volver a Revisión',
          nav: 'auditorias',
          subview: 'revision',
          action: 'back-to-revision-list',
        },
        parents: [
          {
            label: 'Certificado',
            value: audit.numero_certificado,
            symbol: '📜',
            navAction: {
              nav: 'certificacion',
              subview: 'certificates',
              entityType: 'cert',
              entityId: audit.id_certificado,
            },
          },
          ...(audit.id_organizacion
            ? [
                {
                  label: 'Organización',
                  value: audit.organizacion_nombre,
                  symbol: '🏢',
                  navAction: {
                    nav: 'certificacion',
                    subview: 'organizations',
                    entityType: 'org' as const,
                    entityId: audit.id_organizacion,
                  },
                },
              ]
            : []),
        ],
        tableName: 'auditoria',
        recordId: audit.id,
        attributes: [
          {
            label: 'Código de Auditoría',
            value: audit.codigo_auditoria,
            isMono: true,
          },
          {
            label: 'Ejecución Real (REAL)',
            value: realWindowLabel,
            isMono: true,
          },
          {
            label: 'Fecha de Cierre (Paso 10)',
            value: row.closingDateIso,
            isMono: true,
          },
          {
            label: 'Resumen No Conformidades',
            value: formatRevisionNcSummary(row),
            badgeClass:
              row.openNcs > 0
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200',
          },
          {
            label: 'Documentación',
            value: row.documentacionCompleta ? 'Completa ✓' : 'Pendiente verificar',
            badgeClass: row.documentacionCompleta
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-slate-100 text-slate-700 border-slate-200',
          },
          {
            label: 'Auditor Líder',
            value: audit.auditor_lider || 'Por asignar',
          },
          {
            label: 'Revisor QA',
            value: row.revisadoPorNombre || 'Pendiente de revisión',
          },
          {
            label: 'Fecha Revisión QA',
            value: row.fechaRevision || 'Sin aprobar',
            isMono: true,
          },
        ],
        extraSectionsHtml: `${verificationLinksHtml}${qaGateHtml}`,
      })}
    </div>
  `;
}

export function renderRevisionView(props: RevisionViewRenderProps): string {
  const { profile, state, audits, findings, actorNameById, loading = false, tableColumnWidths } = props;

  const allRows = buildRevisionQueueRows(audits, findings, actorNameById);
  const selectedRow = state.selectedAuditId
    ? allRows.find((r) => r.audit.id === state.selectedAuditId) || null
    : null;

  if (selectedRow) {
    return renderRevisionDetailView({ profile, state, row: selectedRow });
  }

  const facetCategories: MultiViewFacetCategory<RevisionAuditSummaryRow>[] = [
    {
      id: 'estado_revision',
      label: 'Estado de Revisión QA',
      options: [
        { value: 'PENDIENTE', label: 'Pendientes de Revisión' },
        { value: 'REVISADA', label: 'Revisadas' },
      ],
      extractValues: (row) => [row.revisado ? 'REVISADA' : 'PENDIENTE'],
    },
    {
      id: 'documentacion',
      label: 'Documentación',
      options: [
        { value: 'COMPLETA', label: 'Completa ✓' },
        { value: 'PENDIENTE', label: 'Pendiente verificar' },
      ],
      extractValues: (row) => [row.documentacionCompleta ? 'COMPLETA' : 'PENDIENTE'],
    },
    {
      id: 'norma',
      label: 'Norma',
      options: Array.from(new Set(allRows.map((r) => r.audit.norma_codigo)))
        .sort((a, b) => a.localeCompare(b, 'es'))
        .map((norma) => ({ value: norma, label: norma })),
      extractValues: (row) => [row.audit.norma_codigo],
    },
  ];

  const searchOptions = {
    getSearchableText: (row: RevisionAuditSummaryRow) =>
      `${row.audit.codigo_auditoria} ${row.audit.numero_certificado} ${row.audit.organizacion_nombre} ${row.audit.norma_codigo} ${row.audit.tipo_auditoria} ${row.revisadoPorNombre || ''} ${row.resumenRevision || ''}`,
  };

  const filteredRows = filterRecordsWithFacets(
    allRows,
    state.query,
    facetCategories,
    state.facetSelections || {},
    searchOptions
  );
  const facetGroups = computeReactiveFacetCounts(
    allRows,
    state.query,
    facetCategories,
    state.facetSelections || {},
    searchOptions
  );
  const sortedRows = sortRevisionRows(filteredRows, state.sortColumn, state.sortDirection);

  const pendingCount = allRows.filter((r) => !r.revisado).length;
  const reviewedCount = allRows.filter((r) => r.revisado).length;
  const zeroOpenNcCount = allRows.filter((r) => r.openNcs === 0).length;
  const isStaff = isApprovedStaffProfile(profile);

  const topBannerHtml = `
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
      <div class="bg-white border border-amber-200 rounded-xl px-4 py-3 shadow-2xs flex items-center justify-between">
        <div>
          <div class="text-[11px] font-semibold text-amber-800">Pendientes de Revisión</div>
          <div class="text-lg font-black text-slate-900">${pendingCount}</div>
        </div>
        <span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900">Cola QA</span>
      </div>
      <div class="bg-white border border-emerald-200 rounded-xl px-4 py-3 shadow-2xs flex items-center justify-between">
        <div>
          <div class="text-[11px] font-semibold text-emerald-800">Revisadas y Aprobadas</div>
          <div class="text-lg font-black text-slate-900">${reviewedCount}</div>
        </div>
        <span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">Histórico</span>
      </div>
      <div class="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-2xs flex items-center justify-between">
        <div>
          <div class="text-[11px] font-semibold text-slate-600">${isStaff ? 'Listas sin NCs abiertas' : 'Acceso Consulta'}</div>
          <div class="text-lg font-black text-slate-900">${isStaff ? zeroOpenNcCount : allRows.length}</div>
        </div>
        <span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">${isStaff ? 'Paso 10 Cerradas' : escapeHtml(profile.role)}</span>
      </div>
    </div>
  `;

  return renderUniversalTemplate<RevisionAuditSummaryRow>({
    domainKey: 'revision',
    tableId: 'revision-main',
    title: 'Revisión QA Post-Cierre',
    subtitle:
      'Compuerta final de control de calidad sobre auditorías cerradas en Resultado (Paso 10). Solo auditorías en estado Cerrada con fecha de cierre formal ingresan a revisión.',
    entityLabel: 'auditorías cerradas',
    searchQuery: state.query,
    searchPlaceholder: 'Buscar por certificado, organización, código de auditoría o revisor...',
    searchInputId: 'revisionSearchInput',
    clearSearchBtnId: 'clearRevisionSearchBtn',
    totalCount: allRows.length,
    filteredCount: sortedRows.length,
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen,
    sortState: {
      column: state.sortColumn,
      direction: state.sortDirection,
    },
    columnWidths: tableColumnWidths?.['revision-main'],
    topBannerHtml,
    facetGroups,
    items: sortedRows,
    columns: buildRevisionColumns(),
    getRowAttrs: (row) =>
      `data-action="select-revision-audit" data-audit-id="${escapeHtml(row.audit.id)}" tabindex="0" role="button"`,
    renderCard: renderRevisionCard,
    loading,
    loadingMessage: 'Cargando cola de revisión QA post-cierre...',
    emptyStateTitle: 'Sin auditorías cerradas en esta selección',
    emptyStateMessage:
      allRows.length === 0
        ? 'Las auditorías aparecerán en Revisión automáticamente tras registrar su Fecha de Cierre en Resultado (Paso 10).'
        : 'Ajuste la búsqueda o los filtros laterales para inspeccionar otras auditorías cerradas.',
  });
}
