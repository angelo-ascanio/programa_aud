import { escapeHtml } from '../lib/html';
import type {
  AuditoriaProcesoSitioItem,
  AuditoriaSitioPlanItem,
  ProgramaAuditoriaEntity,
} from '../lib/auditPlanningEngine';
import type { ProgramacionAuditEntity } from '../lib/auditExecution';
import type { ProcesoTipo, TurnoPorSitioLink } from '../lib/multisiteSampling';
import type { ProcesoPorSitioLink } from '../lib/sitioDomain';
import { formatTurnoTime } from '../lib/turnoDomain';
import {
  buildProcessHistoryForSite,
  resolveSiteShiftOptionsForProcess,
  type CandidateProcessEntity,
} from '../lib/programaCertificadoDomain';

export interface ProgramaTurnosViewProps {
  audit: ProgramacionAuditEntity;
  program: ProgramaAuditoriaEntity | null;
  allAudits: ReadonlyArray<ProgramacionAuditEntity>;
  allProcessesPorSitio: ReadonlyArray<ProcesoPorSitioLink>;
  allProcesses: ReadonlyArray<CandidateProcessEntity>;
  allTurnosPorSitio: ReadonlyArray<TurnoPorSitioLink>;
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

function isShiftAssignedToProcess(
  proc: AuditoriaProcesoSitioItem,
  shiftOption: TurnoPorSitioLink
): boolean {
  return (proc.turnos || []).some(
    (t) =>
      !t.deleted_at &&
      (t.id_turnos_por_sitio === shiftOption.id ||
        t.id_turnos_sitio_auditoria === shiftOption.id)
  );
}

function formatShiftOptionDisplay(shift: TurnoPorSitioLink): {
  timeRange: string;
  description: string;
} {
  const start = formatTurnoTime(shift.hora_entrada);
  const end = formatTurnoTime(shift.hora_salida);
  const timeRange = start && end ? `${start} – ${end}` : 'Horario por definir';
  const rawDesc = (shift.descripcion || '').trim();
  const description =
    rawDesc && rawDesc.toLowerCase() !== `turno ${timeRange}`.toLowerCase()
      ? rawDesc
      : '';
  return { timeRange, description };
}

function renderProcessShiftCard(opts: {
  audit: ProgramacionAuditEntity;
  sitePlan: AuditoriaSitioPlanItem;
  proc: AuditoriaProcesoSitioItem;
  procesoMeta: CandidateProcessEntity | null;
  siteShiftOptions: ReadonlyArray<TurnoPorSitioLink>;
  isStaff: boolean;
}): string {
  const { audit, sitePlan, proc, procesoMeta, siteShiftOptions, isStaff } = opts;
  const activeShifts = (proc.turnos || []).filter((t) => !t.deleted_at);
  const assignedCount = activeShifts.length;
  const procName = procesoMeta?.nombre_proceso || proc.proceso_nombre || 'Proceso Operativo';
  const procTipo: ProcesoTipo = procesoMeta?.tipo ?? 'Medular';

  const coverageBadgeHtml =
    assignedCount >= 1
      ? `
        <span
          data-testid="process-shift-coverage-badge"
          class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap tabular-nums"
        >
          ${assignedCount} turno(s)
        </span>
      `
      : `
        <span
          data-testid="process-shift-coverage-badge"
          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap"
        >
          <span aria-hidden="true">⚠️</span>
          <span>Pendiente turno</span>
        </span>
      `;

  const chipsHtml =
    siteShiftOptions.length === 0
      ? `
        <p class="text-[11px] text-amber-800 font-medium">
          No existen turnos disponibles en el sitio maestro para vincular a este proceso.
        </p>
      `
      : `
        <div
          class="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Turnos disponibles para ${escapeHtml(procName)}"
        >
          ${siteShiftOptions
            .map((shiftOpt) => {
              const checked = isShiftAssignedToProcess(proc, shiftOpt);
              const checkboxId = `progShiftChk_${sitePlan.id}_${proc.id}_${shiftOpt.id}`;
              const { timeRange, description } = formatShiftOptionDisplay(shiftOpt);
              return `
                <label
                  for="${escapeHtml(checkboxId)}"
                  data-testid="programa-shift-chip"
                  class="inline-flex items-center gap-2 min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors ${
                    checked
                      ? 'bg-emerald-50 border-emerald-400 text-emerald-950 shadow-2xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  } ${isStaff ? 'cursor-pointer' : 'cursor-not-allowed opacity-85'}"
                >
                  <input
                    type="checkbox"
                    id="${escapeHtml(checkboxId)}"
                    data-action="toggle-programa-process-shift"
                    data-audit-id="${escapeHtml(audit.id)}"
                    data-site-plan-id="${escapeHtml(sitePlan.id)}"
                    data-psa-id="${escapeHtml(proc.id)}"
                    data-tps-id="${escapeHtml(shiftOpt.id)}"
                    data-currently-selected="${checked ? 'true' : 'false'}"
                    ${checked ? 'checked' : ''}
                    ${!isStaff ? 'disabled' : ''}
                    class="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 shrink-0"
                  />
                  <span class="tabular-nums font-bold">${escapeHtml(timeRange)}</span>
                  ${
                    description
                      ? `<span class="text-[11px] font-medium opacity-80">${escapeHtml(description)}</span>`
                      : ''
                  }
                </label>
              `;
            })
            .join('')}
        </div>
      `;

  return `
    <div
      data-testid="programa-turnos-process-card"
      data-psa-id="${escapeHtml(proc.id)}"
      class="rounded-xl border p-3.5 transition-colors space-y-2.5 ${
        assignedCount >= 1
          ? 'border-emerald-200 bg-emerald-50/15'
          : 'border-amber-200 bg-amber-50/20'
      }"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex flex-wrap items-center gap-1.5 min-w-0">
          <span class="text-xs font-bold text-slate-900 break-words">
            ${escapeHtml(procName)}
          </span>
          <span class="inline-flex items-center px-2 py-0.2 rounded-md text-[10px] font-bold border ${getProcessTypeBadgeClass(
            procTipo
          )} whitespace-nowrap">
            ${escapeHtml(procTipo)}
          </span>
        </div>
        ${coverageBadgeHtml}
      </div>

      ${chipsHtml}
    </div>
  `;
}

export function renderProgramaTurnosView(props: ProgramaTurnosViewProps): string {
  const {
    audit,
    allAudits,
    allProcessesPorSitio,
    allProcesses,
    allTurnosPorSitio,
    isStaff,
    editErrorMessage,
  } = props;

  const activeSites = (audit.sitiosPlan || [])
    .filter((sp) => !sp.deleted_at)
    .slice()
    .sort((a, b) => a.numero_sitio - b.numero_sitio);

  const errorBannerHtml = editErrorMessage
    ? `
      <div role="alert" data-testid="programa-turnos-error" class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800 flex items-center gap-2">
        <span aria-hidden="true">⚠️</span>
        <span>${escapeHtml(editErrorMessage)}</span>
      </div>
    `
    : '';

  const headerBarHtml = `
    <div class="flex flex-wrap items-center justify-between gap-2 bg-slate-50/80 border border-slate-200 rounded-xl px-3.5 py-2.5">
      <div class="space-y-0.5 min-w-0">
        <h3 class="text-xs sm:text-sm font-bold text-slate-900">
          Mini-Paso 8B · Asignación Multi-Turno por Proceso
        </h3>
        <p class="text-[11px] text-slate-600">
          Asigne <strong>1 o más turnos</strong> operativos del sitio a cada proceso seleccionado en 8A para completar el programa.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2 shrink-0">
        ${
          !isStaff
            ? '<span class="px-2 py-0.5 rounded bg-slate-200 text-slate-700 text-[11px] font-bold whitespace-nowrap">Solo lectura</span>'
            : ''
        }
        <button
          type="button"
          data-action="set-programa-mini-step"
          data-mini-step="procesos"
          class="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
        >
          ← Volver a 8A · Procesos
        </button>
      </div>
    </div>
  `;

  if (activeSites.length === 0) {
    return `
      <div data-testid="programa-turnos-view" class="space-y-3">
        ${errorBannerHtml}
        ${headerBarHtml}
        <div class="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-600">
          Esta auditoría aún no tiene sitios permanentes seleccionados en Paso 4 (Designación → Sitio).
        </div>
      </div>
    `;
  }

  const processById = new Map(
    allProcesses.filter((p) => !p.deleted_at).map((p) => [p.id, p])
  );

  const sitesHtml = activeSites
    .map((sitePlan) => {
      const siteBadgeLabel =
        sitePlan.numero_sitio === 0 ? 'Sitio 0 (HQ)' : `Sitio #${sitePlan.numero_sitio}`;
      const siteShiftOptions = resolveSiteShiftOptionsForProcess(
        sitePlan.id_sitio,
        allTurnosPorSitio
      );
      const activeProcs = (sitePlan.procesos || []).filter((p) => !p.deleted_at);

      const siteLinks = allProcessesPorSitio.filter(
        (l) => !l.deleted_at && l.id_sitio === sitePlan.id_sitio
      );
      const historyRows = buildProcessHistoryForSite(
        audit,
        sitePlan,
        siteLinks,
        allProcesses,
        allAudits
      );
      const historyProcByPpsId = new Map(
        historyRows.map((hr) => [hr.ppsLink.id, hr.proceso])
      );

      const coveredCount = activeProcs.filter(
        (p) => (p.turnos || []).filter((t) => !t.deleted_at).length >= 1
      ).length;
      const pendingProcessesCount = activeProcs.length - coveredCount;
      const primaryShift = siteShiftOptions[0] ?? null;

      const noShiftsNoticeHtml =
        siteShiftOptions.length === 0
          ? `
            <div
              data-testid="programa-site-no-shifts-alert"
              class="rounded-xl border border-amber-200 bg-amber-50/90 p-3.5 flex flex-wrap items-center justify-between gap-2.5"
            >
              <div class="space-y-0.5 text-xs text-amber-950 min-w-0">
                <p class="font-bold">
                  ⚠️ Este sitio no tiene turnos configurados en el maestro (turnos_por_sitio)
                </p>
                <p class="text-[11px] text-amber-800">
                  ${
                    isStaff
                      ? 'Configure al menos un turno operativo en la ficha maestra del sitio antes de asignarlo a los procesos.'
                      : 'Un coordinador autorizado debe definir los turnos del sitio maestro para habilitar su asignación.'
                  }
                </p>
              </div>
              ${
                isStaff
                  ? `
                    <button
                      type="button"
                      data-parent-nav="true"
                      data-nav="certificacion"
                      data-subview="certificates"
                      data-parent-type="sitio"
                      data-entity-id="${escapeHtml(sitePlan.id_sitio)}"
                      class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-900 hover:bg-amber-800 text-xs font-semibold text-white transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <span>Certificado → Sitio</span>
                      <span aria-hidden="true">→</span>
                    </button>
                  `
                  : ''
              }
            </div>
          `
          : '';

      const bulkApplyHtml =
        isStaff && primaryShift && activeProcs.length > 0
          ? `
            <button
              type="button"
              data-action="apply-programa-primary-shift"
              data-audit-id="${escapeHtml(audit.id)}"
              data-site-plan-id="${escapeHtml(sitePlan.id)}"
              data-tps-id="${escapeHtml(primaryShift.id)}"
              ${pendingProcessesCount === 0 ? 'disabled' : ''}
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap ${
                pendingProcessesCount > 0
                  ? 'bg-white border-emerald-300 text-emerald-900 hover:bg-emerald-50 cursor-pointer'
                  : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
              }"
            >
              <span>Aplicar Turno Principal a procesos sin turno</span>
              ${
                pendingProcessesCount > 0
                  ? `<span class="px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-900 text-[10px] font-bold tabular-nums">${pendingProcessesCount}</span>`
                  : ''
              }
            </button>
          `
          : '';

      return `
        <section
          data-testid="programa-site-turnos-card"
          data-site-plan-id="${escapeHtml(sitePlan.id)}"
          class="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden"
        >
          <header class="bg-slate-50/90 border-b border-slate-200 px-3.5 py-3 space-y-2">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex flex-wrap items-center gap-1.5 min-w-0">
                <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                  sitePlan.numero_sitio === 0
                    ? 'bg-indigo-100 text-indigo-900 border-indigo-200'
                    : 'bg-slate-100 text-slate-700 border-slate-200'
                } whitespace-nowrap">
                  ${escapeHtml(siteBadgeLabel)}
                </span>
                <h4 class="text-xs sm:text-sm font-bold text-slate-900 truncate">
                  ${escapeHtml(sitePlan.nombre_sitio)}
                </h4>
              </div>
              <span class="text-[11px] font-semibold tabular-nums whitespace-nowrap ${
                activeProcs.length > 0 && pendingProcessesCount === 0
                  ? 'text-emerald-700'
                  : 'text-slate-600'
              }">
                ${coveredCount}/${activeProcs.length} proceso${activeProcs.length === 1 ? '' : 's'} con turno
              </span>
            </div>

            ${
              bulkApplyHtml
                ? `<div class="flex flex-wrap items-center justify-between gap-2">
                    <span class="text-[11px] text-slate-500">
                      Turno principal del sitio: <strong class="text-slate-700 tabular-nums">${escapeHtml(
                        formatTurnoTime(primaryShift.hora_entrada)
                      )} – ${escapeHtml(formatTurnoTime(primaryShift.hora_salida))}</strong>
                    </span>
                    ${bulkApplyHtml}
                  </div>`
                : ''
            }
          </header>

          <div class="p-3 sm:p-3.5 space-y-2.5">
            ${noShiftsNoticeHtml}
            ${
              activeProcs.length === 0
                ? `
                  <div class="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center space-y-2">
                    <p class="text-xs text-slate-600">
                      Este sitio aún no tiene procesos marcados en Mini-Paso 8A.
                    </p>
                    <button
                      type="button"
                      data-action="set-programa-mini-step"
                      data-mini-step="procesos"
                      class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer"
                    >
                      Ir a 8A · Seleccionar procesos
                    </button>
                  </div>
                `
                : activeProcs
                    .map((proc) => {
                      const procesoMeta =
                        historyProcByPpsId.get(proc.id_procesos_por_sitio) ??
                        processById.get(proc.id_proceso) ??
                        null;
                      return renderProcessShiftCard({
                        audit,
                        sitePlan,
                        proc,
                        procesoMeta,
                        siteShiftOptions,
                        isStaff,
                      });
                    })
                    .join('')
            }
          </div>
        </section>
      `;
    })
    .join('');

  return `
    <div data-testid="programa-turnos-view" class="space-y-4">
      ${errorBannerHtml}
      ${headerBarHtml}
      ${sitesHtml}
    </div>
  `;
}
