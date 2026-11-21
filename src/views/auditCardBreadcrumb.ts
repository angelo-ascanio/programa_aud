import { escapeHtml } from '../lib/html';
import type {
  AuditCardBreadcrumbModel,
  AuditSelectionCandidate,
} from '../lib/breadcrumb';
import { formatAuditDateLabel, resolveLatestPlannedDate } from '../lib/auditPlanningEngine';

export interface AuditCardBreadcrumbRenderOptions {
  model: AuditCardBreadcrumbModel;
  auditsForCert?: ReadonlyArray<
    AuditSelectionCandidate & {
      numero_certificado?: string;
      tipo_auditoria?: string;
      organizacion_nombre?: string;
      estado_ciclo?: string;
    }
  >;
  activeCertLabel?: string | null;
  isStaff?: boolean;
  /** Render the context switcher bar even if only 1 audit exists, so certificate context & navigation remain explicit */
  showContextBar?: boolean;
}

function formatAuditOptionLabel(
  audit: AuditSelectionCandidate & {
    tipo_auditoria?: string;
    estado_ciclo?: string;
  }
): string {
  const code = audit.codigo_auditoria || 'Auditoría';
  const tipo = audit.tipo_auditoria ? ` · ${audit.tipo_auditoria}` : '';
  const latestPlanned = resolveLatestPlannedDate(audit.fechas as never);
  const datePart = latestPlanned
    ? ` (${formatAuditDateLabel(latestPlanned)})`
    : audit.fecha_inicio
    ? ` (${audit.fecha_inicio.slice(0, 10)})`
    : '';
  return `${code}${tipo}${datePart}`;
}

/**
 * Reusable persistent `+ Auditoría` trigger button for card headers in Bloque 1
 * (Multi Views and Detail Views 1..7 + Resumen). Never placed inside `<tbody>`.
 */
export function renderAddAuditButton(isStaff: boolean): string {
  if (!isStaff) return '';
  return `
    <button
      type="button"
      data-action="open-add-audit-wizard"
      title="Programar nueva auditoría (Asistente de 3 fases)"
      aria-label="+ Auditoría"
      class="h-9 px-3.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-2xs shrink-0 whitespace-nowrap"
    >
      <span aria-hidden="true">+</span>
      <span>Auditoría</span>
    </button>
  `;
}

/**
 * Renders the Breadcrumb In-Card at the top inside Detail Views 1..7 & Resumen:
 * - Left track: `1. Designación` (hover expands inline showing Tipo | Fecha | Sitio | Temporal) .. `7. Revisión`
 * - Right track: visually separated `Resumen`
 * - Optional compact Shared Audit Switcher (`◀` / `<select>` / `▶`) preserving `(selectedCertId, selectedAuditId)` across hops
 */
export function renderAuditCardBreadcrumb(opts: AuditCardBreadcrumbRenderOptions): string {
  const {
    model,
    auditsForCert = [],
    activeCertLabel,
    showContextBar = true,
  } = opts;

  if (!model.visible) {
    return '';
  }

  const leftTrackHtml = model.steps
    .map((step) => {
      if (step.children && step.children.length > 0) {
        const subLinksHtml = step.children
          .map((child, idx) => {
            const divider =
              idx > 0
                ? '<span class="text-slate-300 select-none" aria-hidden="true">|</span>'
                : '';
            return `
              ${divider}
              <button
                type="button"
                data-action="audit-breadcrumb-nav"
                data-target-subview="${escapeHtml(child.id)}"
                aria-current="${child.isActive ? 'page' : 'false'}"
                class="px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  child.isActive
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-white hover:text-slate-900'
                }"
              >
                ${escapeHtml(child.label)}
              </button>
            `;
          })
          .join('');

        return `
          <div
            data-breadcrumb-designacion="true"
            class="group/desig inline-flex items-center gap-1 rounded-lg border transition-colors ${
              step.isActive
                ? 'bg-slate-900/5 border-slate-900/25 px-1.5 py-0.5'
                : 'bg-white border-slate-200 hover:border-slate-300 px-1.5 py-0.5'
            }"
          >
            <button
              type="button"
              data-action="audit-breadcrumb-nav"
              data-target-subview="${escapeHtml(step.targetSubview)}"
              aria-current="${step.isActive ? 'step' : 'false'}"
              class="inline-flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                step.isActive
                  ? 'text-slate-900'
                  : 'text-slate-700 hover:text-slate-900'
              }"
            >
              <span>${step.stepNumber}. ${escapeHtml(step.label)}</span>
              ${
                step.isActive && model.activeDesignacionSubstep
                  ? `<span class="group-hover/desig:hidden group-focus-within/desig:hidden px-1.5 py-0.2 rounded bg-slate-900 text-white text-[10px] font-bold">${escapeHtml(
                      model.activeDesignacionSubstep.label
                    )}</span>`
                  : ''
              }
            </button>
            <div
              data-breadcrumb-designacion-substeps="true"
              class="hidden group-hover/desig:inline-flex group-focus-within/desig:inline-flex items-center gap-0.5 pl-1 border-l border-slate-200"
            >
              ${subLinksHtml}
            </div>
          </div>
        `;
      }

      return `
        <button
          type="button"
          data-action="audit-breadcrumb-nav"
          data-target-subview="${escapeHtml(step.targetSubview)}"
          aria-current="${step.isActive ? 'page' : 'false'}"
          class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
            step.isActive
              ? 'bg-slate-900 text-white border-slate-900 shadow-2xs font-bold'
              : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-white hover:text-slate-900'
          }"
        >
          <span>${step.stepNumber}. ${escapeHtml(step.label)}</span>
        </button>
      `;
    })
    .join('');

  const resumenBtnHtml = `
    <div class="flex items-center gap-2 sm:pl-2 sm:border-l sm:border-slate-200 shrink-0 ml-auto">
      <button
        type="button"
        data-action="audit-breadcrumb-nav"
        data-target-subview="${escapeHtml(model.resumenStep.targetSubview)}"
        aria-current="${model.resumenStep.isActive ? 'page' : 'false'}"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
          model.resumenStep.isActive
            ? 'bg-indigo-700 text-white border-indigo-700 shadow-2xs'
            : 'bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100'
        }"
      >
        <span aria-hidden="true">${model.resumenStep.symbol}</span>
        <span>${escapeHtml(model.resumenStep.label)}</span>
      </button>
    </div>
  `;

  const activeAuditId = model.selection.selectedAuditId;
  const activeIdx = activeAuditId
    ? auditsForCert.findIndex((a) => a.id === activeAuditId)
    : -1;
  const hasPrev = auditsForCert.length > 1 && activeIdx > 0;
  const hasNext =
    auditsForCert.length > 1 && activeIdx >= 0 && activeIdx < auditsForCert.length - 1;

  const contextStripHtml =
    showContextBar && (auditsForCert.length > 0 || activeCertLabel)
      ? `
        <div class="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-slate-600">
          <div class="inline-flex items-center gap-1.5 min-w-0">
            ${
              activeCertLabel
                ? `<span class="font-bold text-slate-700 truncate">${escapeHtml(activeCertLabel)}</span>`
                : ''
            }
          </div>
          ${
            auditsForCert.length > 0
              ? `
                <div class="inline-flex items-center gap-1.5 ml-auto">
                  <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Auditoría activa:</span>
                  ${
                    auditsForCert.length > 1
                      ? `
                        <button
                          type="button"
                          data-action="step-shared-audit"
                          data-audit-id="${escapeHtml(auditsForCert[activeIdx - 1]?.id || '')}"
                          ${!hasPrev ? 'disabled' : ''}
                          title="Auditoría más reciente"
                          aria-label="Auditoría más reciente"
                          class="inline-flex items-center justify-center w-6 h-6 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >◀</button>
                      `
                      : ''
                  }
                  <select
                    data-action="select-shared-audit"
                    aria-label="Seleccionar auditoría del certificado"
                    class="h-7 max-w-[260px] px-2 rounded-md border border-slate-200 bg-white text-[11px] font-semibold text-slate-800 focus:border-slate-900 focus:outline-none truncate"
                  >
                    ${auditsForCert
                      .map((aud) => {
                        const isSel = aud.id === activeAuditId;
                        return `<option value="${escapeHtml(aud.id)}" ${
                          isSel ? 'selected' : ''
                        }>${escapeHtml(formatAuditOptionLabel(aud))}</option>`;
                      })
                      .join('')}
                  </select>
                  ${
                    auditsForCert.length > 1
                      ? `
                        <button
                          type="button"
                          data-action="step-shared-audit"
                          data-audit-id="${escapeHtml(auditsForCert[activeIdx + 1]?.id || '')}"
                          ${!hasNext ? 'disabled' : ''}
                          title="Auditoría anterior"
                          aria-label="Auditoría anterior"
                          class="inline-flex items-center justify-center w-6 h-6 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >▶</button>
                      `
                      : ''
                  }
                </div>
              `
              : ''
          }
        </div>
      `
      : '';

  return `
    <div
      data-audit-card-breadcrumb="true"
      class="px-4 sm:px-5 pt-3 pb-2 bg-white border-b border-slate-100 space-y-2"
    >
      <nav
        aria-label="Flujo de Auditoría (In-Card)"
        class="bg-slate-50 border border-slate-200 rounded-xl p-1.5 flex flex-wrap items-center justify-between gap-2"
      >
        <div class="flex flex-wrap items-center gap-1.5 min-w-0">
          ${leftTrackHtml}
        </div>
        ${resumenBtnHtml}
      </nav>
      ${contextStripHtml}
    </div>
  `;
}
