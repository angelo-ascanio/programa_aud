import { escapeHtml } from '../lib/html';
import type {
  AuditoriaSitioPlanItem,
  ProgramaAuditoriaEntity,
} from '../lib/auditPlanningEngine';
import type { ProgramacionAuditEntity } from '../lib/auditExecution';
import type { ProcesoTipo } from '../lib/multisiteSampling';
import type { ProcesoPorSitioLink } from '../lib/sitioDomain';
import { sliceCycleWindowColumns } from '../lib/designacionSitioDomain';
import {
  buildProcessHistoryForSite,
  computeQuickProcessSelectionIds,
  type CandidateProcessEntity,
  type ProcessCycleCell,
  type ProcessHistoryRow,
} from '../lib/programaCertificadoDomain';

export interface ProgramaProcesosViewProps {
  audit: ProgramacionAuditEntity;
  program: ProgramaAuditoriaEntity | null;
  allAudits: ReadonlyArray<ProgramacionAuditEntity>;
  allProcessesPorSitio: ReadonlyArray<ProcesoPorSitioLink>;
  allProcesses: ReadonlyArray<CandidateProcessEntity>;
  cycleWindowOffset: number;
  openHistoryDrawerProcessIds: ReadonlyArray<string>;
  isStaff: boolean;
  editErrorMessage?: string | null;
}

function getProcessTypeBadgeClass(tipo: ProcesoTipo): string {
  switch (tipo) {
    case 'Medular':
      return 'bg-sky-50 text-sky-800 border-sky-200';
    case 'Estratégico':
      return 'bg-indigo-50 text-indigo-800 border-indigo-200';
    case 'De Apoyo':
      return 'bg-slate-100 text-slate-700 border-slate-200';
    case 'Otro':
    default:
      return 'bg-amber-50 text-amber-800 border-amber-200';
  }
}

function computeMobileVisibleWindowIndices(
  visibleCellsCount: number,
  currentAuditLocalIndex: number
): Set<number> {
  if (visibleCellsCount <= 3) {
    return new Set(Array.from({ length: visibleCellsCount }, (_, idx) => idx));
  }
  const center =
    currentAuditLocalIndex >= 0 && currentAuditLocalIndex < visibleCellsCount
      ? currentAuditLocalIndex
      : Math.floor(visibleCellsCount / 2);

  let start = center - 1;
  if (start < 0) start = 0;
  if (start + 3 > visibleCellsCount) start = visibleCellsCount - 3;
  return new Set([start, start + 1, start + 2]);
}

function resolveCycleCellVisual(cell: ProcessCycleCell): {
  label: string;
  symbol: string;
  badgeClass: string;
  statusTitle: string;
} {
  if (cell.isCurrent) {
    return {
      label: cell.yearLabel === 'S/F' ? 'Actual' : cell.yearLabel,
      symbol: cell.included ? '●' : '○',
      badgeClass: cell.included
        ? 'bg-indigo-600 text-white border-indigo-700'
        : 'bg-indigo-50 text-indigo-800 border-indigo-300',
      statusTitle: cell.included ? 'Actual · Seleccionado' : 'Actual · Sin seleccionar',
    };
  }
  if (cell.isFuture) {
    return {
      label: cell.yearLabel,
      symbol: cell.included ? '📅' : '·',
      badgeClass: cell.included
        ? 'bg-sky-50 text-sky-900 border-sky-200'
        : 'bg-slate-50 text-slate-500 border-slate-200',
      statusTitle: cell.included ? 'Futuro · Preprogramado' : 'Futuro · Sin programar',
    };
  }
  if (cell.included) {
    return {
      label: cell.yearLabel,
      symbol: '✓',
      badgeClass: 'bg-emerald-50 text-emerald-900 border-emerald-200',
      statusTitle: 'Auditado en visita anterior',
    };
  }
  return {
    label: cell.yearLabel,
    symbol: '—',
    badgeClass: 'bg-slate-50 text-slate-500 border-slate-200',
    statusTitle: 'No incluido en esta visita',
  };
}

function renderProcessHistoryDrawer(
  row: ProcessHistoryRow,
  drawerKey: string
): string {
  return `
    <div
      data-testid="programa-process-history-drawer"
      data-drawer-key="${escapeHtml(drawerKey)}"
      class="mt-2.5 rounded-xl border border-slate-200 bg-slate-50/90 p-3 space-y-2"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-[11px] font-bold text-slate-800">
          Programa Anterior / Futuro — ${escapeHtml(row.proceso.nombre_proceso)}
        </span>
        <span class="text-[10px] font-semibold text-slate-500">
          ${row.totalVisitsInCycle} visita${row.totalVisitsInCycle === 1 ? '' : 's'} en el ciclo del certificado
        </span>
      </div>

      ${
        row.cycleCells.length === 0
          ? '<p class="text-[11px] text-slate-500">No existen visitas registradas en el ciclo de este certificado.</p>'
          : `
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              ${row.cycleCells
                .map((cell) => {
                  const visual = resolveCycleCellVisual(cell);
                  const shiftsText =
                    cell.shiftLabels.length > 0
                      ? cell.shiftLabels.join(', ')
                      : cell.included
                      ? 'Sin turnos asignados'
                      : 'No incluido';
                  const auditorsText =
                    cell.auditorNames.length > 0
                      ? cell.auditorNames.join(', ')
                      : cell.included
                      ? 'Equipo general del sitio'
                      : '—';
                  return `
                    <div class="rounded-lg border border-slate-200 bg-white p-2.5 space-y-1 text-[11px] min-w-0">
                      <div class="flex items-center justify-between gap-1.5">
                        <span class="font-bold text-slate-900 truncate">
                          ${escapeHtml(cell.auditType)} · ${escapeHtml(cell.yearLabel)}
                        </span>
                        <span class="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold border ${visual.badgeClass} shrink-0">
                          ${escapeHtml(visual.symbol)} ${escapeHtml(cell.isCurrent ? 'Actual' : cell.isFuture ? 'Futuro' : cell.included ? 'Incluido' : 'Omitido')}
                        </span>
                      </div>
                      <div class="text-slate-600 truncate" title="${escapeHtml(shiftsText)}">
                        <span class="font-semibold text-slate-700">Turnos:</span> ${escapeHtml(shiftsText)}
                      </div>
                      <div class="text-slate-600 truncate" title="${escapeHtml(auditorsText)}">
                        <span class="font-semibold text-slate-700">Auditores:</span> ${escapeHtml(auditorsText)}
                      </div>
                    </div>
                  `;
                })
                .join('')}
            </div>
          `
      }
    </div>
  `;
}

function renderProcessHistoryCard(opts: {
  audit: ProgramacionAuditEntity;
  sitePlan: AuditoriaSitioPlanItem;
  row: ProcessHistoryRow;
  cycleWindowOffset: number;
  isDrawerOpen: boolean;
  isStaff: boolean;
}): string {
  const { audit, sitePlan, row, cycleWindowOffset, isDrawerOpen, isStaff } = opts;
  const checkboxId = `progProcChk_${sitePlan.id}_${row.ppsLink.id}`;
  const drawerKey = `${sitePlan.id}:${row.ppsLink.id}`;

  const sliced = sliceCycleWindowColumns(
    row.cycleCells,
    row.currentAuditIndex,
    cycleWindowOffset,
    5
  );
  const currentLocalIdx = sliced.visible.findIndex((c) => c.isCurrent);
  const mobileVisibleSet = computeMobileVisibleWindowIndices(
    sliced.visible.length,
    currentLocalIdx
  );

  const historyBadgeHtml = row.neverAudited
    ? `
      <span
        data-testid="never-audited-badge"
        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200 whitespace-nowrap"
      >
        <span aria-hidden="true">⚠️</span>
        <span>Nunca auditado</span>
      </span>
    `
    : `
      <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
        ${escapeHtml(
          row.lastAuditedText === 'Nunca auditado' && row.isSelectedNow
            ? 'Incluido en visita actual'
            : row.lastAuditedText
        )}
      </span>
    `;

  const cycleCountLabel = `Auditado ${row.timesAuditedInCycle} de ${row.totalVisitsInCycle} ${
    row.totalVisitsInCycle === 1 ? 'vez' : 'veces'
  }`;

  return `
    <div
      data-testid="programa-process-card"
      data-pps-id="${escapeHtml(row.ppsLink.id)}"
      class="rounded-xl border p-3 transition-colors space-y-2.5 ${
        row.isSelectedNow
          ? 'border-indigo-200 bg-indigo-50/25'
          : row.neverAudited
          ? 'border-amber-200 bg-amber-50/20'
          : 'border-slate-200 bg-white'
      }"
    >
      <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <label
          for="${escapeHtml(checkboxId)}"
          class="inline-flex items-start gap-2.5 min-w-0 flex-1 ${
            isStaff ? 'cursor-pointer' : 'cursor-not-allowed opacity-90'
          }"
        >
          <input
            type="checkbox"
            id="${escapeHtml(checkboxId)}"
            data-action="toggle-programa-process"
            data-audit-id="${escapeHtml(audit.id)}"
            data-site-plan-id="${escapeHtml(sitePlan.id)}"
            data-pps-id="${escapeHtml(row.ppsLink.id)}"
            data-proceso-id="${escapeHtml(row.proceso.id)}"
            data-currently-selected="${row.isSelectedNow ? 'true' : 'false'}"
            ${row.isSelectedNow ? 'checked' : ''}
            ${!isStaff ? 'disabled' : ''}
            class="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
          />
          <span class="min-w-0 flex-1 space-y-1">
            <span class="flex flex-wrap items-center gap-1.5">
              <span class="text-xs font-bold text-slate-900 break-words">
                ${escapeHtml(row.proceso.nombre_proceso)}
              </span>
              <span class="inline-flex items-center px-2 py-0.2 rounded-md text-[10px] font-bold border ${getProcessTypeBadgeClass(
                row.proceso.tipo
              )} whitespace-nowrap">
                ${escapeHtml(row.proceso.tipo)}
              </span>
            </span>
            ${
              row.proceso.clausulas_cubiertas && row.proceso.clausulas_cubiertas.length > 0
                ? `<span class="block text-[10px] text-slate-500 truncate">Cláusulas: ${escapeHtml(
                    row.proceso.clausulas_cubiertas.slice(0, 6).join(', ')
                  )}${row.proceso.clausulas_cubiertas.length > 6 ? '…' : ''}</span>`
                : ''
            }
          </span>
        </label>

        <div class="flex flex-wrap items-center gap-1.5 pl-6 sm:pl-0 shrink-0">
          ${historyBadgeHtml}
          <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap tabular-nums">
            ${escapeHtml(cycleCountLabel)}
          </span>
        </div>
      </div>

      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-2 pt-1.5 border-t border-slate-100">
        <div class="flex items-center gap-1.5 min-w-0 flex-1">
          <button
            type="button"
            data-action="page-programa-cycle"
            data-audit-id="${escapeHtml(audit.id)}"
            data-delta="-1"
            aria-label="Ventana de ciclo anterior para ${escapeHtml(row.proceso.nombre_proceso)}"
            ${!sliced.canPagePrev ? 'disabled' : ''}
            class="w-7 h-7 shrink-0 inline-flex items-center justify-center rounded-lg border text-xs font-bold transition-colors ${
              sliced.canPagePrev
                ? 'border-slate-300 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer'
                : 'border-slate-200 bg-slate-50 text-slate-300 cursor-not-allowed'
            }"
          >
            ◀
          </button>

          <div class="grid grid-cols-3 sm:grid-cols-5 gap-1.5 min-w-0 flex-1 max-w-md">
            ${
              sliced.visible.length === 0
                ? '<div class="col-span-3 sm:col-span-5 text-center text-[10px] text-slate-400 py-1">Sin visitas</div>'
                : sliced.visible
                    .map((cell, colIdx) => {
                      const visual = resolveCycleCellVisual(cell);
                      const mobileVisibilityClass = mobileVisibleSet.has(colIdx)
                        ? 'flex'
                        : 'hidden sm:flex';
                      return `
                        <div
                          class="${mobileVisibilityClass} flex-col items-center justify-center rounded-lg border px-1.5 py-1 min-w-0 text-center ${visual.badgeClass}"
                          title="${escapeHtml(`${cell.yearLabel} · ${cell.auditType} · ${visual.statusTitle}`)}"
                        >
                          <span class="text-[10px] font-bold leading-tight truncate max-w-full">
                            ${escapeHtml(visual.label)} ${escapeHtml(visual.symbol)}
                          </span>
                          <span class="text-[9px] font-medium leading-tight truncate max-w-full opacity-90">
                            ${escapeHtml(cell.auditType)}
                          </span>
                        </div>
                      `;
                    })
                    .join('')
            }
          </div>

          <button
            type="button"
            data-action="page-programa-cycle"
            data-audit-id="${escapeHtml(audit.id)}"
            data-delta="1"
            aria-label="Ventana de ciclo siguiente para ${escapeHtml(row.proceso.nombre_proceso)}"
            ${!sliced.canPageNext ? 'disabled' : ''}
            class="w-7 h-7 shrink-0 inline-flex items-center justify-center rounded-lg border text-xs font-bold transition-colors ${
              sliced.canPageNext
                ? 'border-slate-300 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer'
                : 'border-slate-200 bg-slate-50 text-slate-300 cursor-not-allowed'
            }"
          >
            ▶
          </button>
        </div>

        <button
          type="button"
          data-action="toggle-programa-process-drawer"
          data-drawer-key="${escapeHtml(drawerKey)}"
          aria-expanded="${isDrawerOpen ? 'true' : 'false'}"
          class="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
            isDrawerOpen
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
          }"
        >
          <span aria-hidden="true">📂</span>
          <span>Ver Programa Anterior / Futuro</span>
        </button>
      </div>

      ${isDrawerOpen ? renderProcessHistoryDrawer(row, drawerKey) : ''}
    </div>
  `;
}

export function renderProgramaProcesosView(props: ProgramaProcesosViewProps): string {
  const {
    audit,
    allAudits,
    allProcessesPorSitio,
    allProcesses,
    cycleWindowOffset,
    openHistoryDrawerProcessIds,
    isStaff,
    editErrorMessage,
  } = props;

  const activeSites = (audit.sitiosPlan || [])
    .filter((sp) => !sp.deleted_at)
    .slice()
    .sort((a, b) => a.numero_sitio - b.numero_sitio);

  const errorBannerHtml = editErrorMessage
    ? `
      <div role="alert" data-testid="programa-procesos-error" class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800 flex items-center gap-2">
        <span aria-hidden="true">⚠️</span>
        <span>${escapeHtml(editErrorMessage)}</span>
      </div>
    `
    : '';

  const introBarHtml = `
    <div class="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 bg-slate-50/80 border border-slate-200 rounded-xl px-3 py-2">
      <span>
        Seleccione los procesos auditables por sitio según el vínculo activo <strong class="text-slate-800">procesos_por_sitio</strong>. Priorice procesos marcados como <strong class="text-rose-800">Nunca auditado</strong>.
      </span>
      ${
        !isStaff
          ? '<span class="px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-bold whitespace-nowrap">Solo lectura</span>'
          : ''
      }
    </div>
  `;

  if (activeSites.length === 0) {
    return `
      <div class="space-y-3">
        ${errorBannerHtml}
        ${introBarHtml}
        <div class="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-600">
          Esta auditoría aún no tiene sitios permanentes seleccionados en Paso 4 (Designación → Sitio).
        </div>
      </div>
    `;
  }

  const sitesHtml = activeSites
    .map((sitePlan) => {
      const siteLinks = allProcessesPorSitio.filter(
        (l) => !l.deleted_at && l.id_sitio === sitePlan.id_sitio
      );
      const rows = buildProcessHistoryForSite(
        audit,
        sitePlan,
        siteLinks,
        allProcesses,
        allAudits
      );
      const selectedCount = rows.filter((r) => r.isSelectedNow).length;
      const neverAuditedCount = rows.filter((r) => r.neverAudited).length;

      const medularesDelta = computeQuickProcessSelectionIds(rows, 'MEDULARES');
      const noAuditadosDelta = computeQuickProcessSelectionIds(rows, 'NO_AUDITADOS_ULTIMO');
      const copiarDelta = computeQuickProcessSelectionIds(rows, 'COPIAR_ANTERIOR');

      const siteBadgeLabel =
        sitePlan.numero_sitio === 0 ? 'Sitio 0 (HQ)' : `Sitio #${sitePlan.numero_sitio}`;

      return `
        <section
          data-testid="programa-site-processes-card"
          data-site-plan-id="${escapeHtml(sitePlan.id)}"
          class="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden"
        >
          <header class="bg-slate-50/90 border-b border-slate-200 px-3.5 py-3 space-y-2.5">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex flex-wrap items-center gap-1.5 min-w-0">
                <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                  sitePlan.numero_sitio === 0
                    ? 'bg-indigo-100 text-indigo-900 border-indigo-200'
                    : 'bg-slate-100 text-slate-700 border-slate-200'
                } whitespace-nowrap">
                  ${escapeHtml(siteBadgeLabel)}
                </span>
                <h3 class="text-xs sm:text-sm font-bold text-slate-900 truncate">
                  ${escapeHtml(sitePlan.nombre_sitio)}
                </h3>
                ${
                  neverAuditedCount > 0
                    ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200 whitespace-nowrap">⚠️ ${neverAuditedCount} nunca aud.</span>`
                    : ''
                }
              </div>
              <span class="text-[11px] font-semibold text-slate-600 tabular-nums whitespace-nowrap">
                ${selectedCount}/${rows.length} proceso${rows.length === 1 ? '' : 's'} seleccionado${
                  selectedCount === 1 ? '' : 's'
                }
              </span>
            </div>

            ${
              rows.length > 0
                ? `
                  <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Acciones rápidas de selección de procesos">
                    <button
                      type="button"
                      data-action="programa-quick-select"
                      data-audit-id="${escapeHtml(audit.id)}"
                      data-site-plan-id="${escapeHtml(sitePlan.id)}"
                      data-preset="MEDULARES"
                      ${!isStaff || medularesDelta.length === 0 ? 'disabled' : ''}
                      class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors whitespace-nowrap ${
                        isStaff && medularesDelta.length > 0
                          ? 'bg-white border-sky-300 text-sky-900 hover:bg-sky-50 cursor-pointer'
                          : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                      }"
                    >
                      <span>Seleccionar todos los Medulares</span>
                      ${
                        medularesDelta.length > 0
                          ? `<span class="px-1.5 py-0.2 rounded-full bg-sky-100 text-sky-900 text-[10px] font-bold">${medularesDelta.length}</span>`
                          : ''
                      }
                    </button>

                    <button
                      type="button"
                      data-action="programa-quick-select"
                      data-audit-id="${escapeHtml(audit.id)}"
                      data-site-plan-id="${escapeHtml(sitePlan.id)}"
                      data-preset="NO_AUDITADOS_ULTIMO"
                      ${!isStaff || noAuditadosDelta.length === 0 ? 'disabled' : ''}
                      class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors whitespace-nowrap ${
                        isStaff && noAuditadosDelta.length > 0
                          ? 'bg-white border-amber-300 text-amber-900 hover:bg-amber-50 cursor-pointer'
                          : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                      }"
                    >
                      <span>Seleccionar no auditados en el último año</span>
                      ${
                        noAuditadosDelta.length > 0
                          ? `<span class="px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-900 text-[10px] font-bold">${noAuditadosDelta.length}</span>`
                          : ''
                      }
                    </button>

                    <button
                      type="button"
                      data-action="programa-quick-select"
                      data-audit-id="${escapeHtml(audit.id)}"
                      data-site-plan-id="${escapeHtml(sitePlan.id)}"
                      data-preset="COPIAR_ANTERIOR"
                      ${!isStaff || copiarDelta.length === 0 ? 'disabled' : ''}
                      class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors whitespace-nowrap ${
                        isStaff && copiarDelta.length > 0
                          ? 'bg-white border-indigo-300 text-indigo-900 hover:bg-indigo-50 cursor-pointer'
                          : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                      }"
                    >
                      <span>Copiar del ciclo anterior</span>
                      ${
                        copiarDelta.length > 0
                          ? `<span class="px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-900 text-[10px] font-bold">${copiarDelta.length}</span>`
                          : ''
                      }
                    </button>
                  </div>
                `
                : ''
            }
          </header>

          <div class="p-3 sm:p-3.5 space-y-2.5">
            ${
              rows.length === 0
                ? `
                  <div class="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-500">
                    Este sitio no tiene procesos activos vinculados en <strong>procesos_por_sitio</strong>. Vincúlelos desde Certificados → Sitio antes de programarlos.
                  </div>
                `
                : rows
                    .map((row) =>
                      renderProcessHistoryCard({
                        audit,
                        sitePlan,
                        row,
                        cycleWindowOffset,
                        isDrawerOpen: openHistoryDrawerProcessIds.includes(
                          `${sitePlan.id}:${row.ppsLink.id}`
                        ),
                        isStaff,
                      })
                    )
                    .join('')
            }
          </div>
        </section>
      `;
    })
    .join('');

  return `
    <div class="space-y-4">
      ${errorBannerHtml}
      ${introBarHtml}
      ${sitesHtml}
    </div>
  `;
}
