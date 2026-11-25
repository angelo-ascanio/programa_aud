import { escapeHtml } from '../lib/html';
import type { AuditorDetailEntity } from '../lib/competencyMatrix';
import {
  sortSitesWithPrincipalFirst,
  type CertificadoDetailEntity,
  type ProcesoPorSitioLink,
  type SiteEntity,
  type TurnoPorSitioLink,
} from '../lib/multisiteSampling';
import type { ProgramacionAuditEntity } from '../lib/auditExecution';
import {
  DEFAULT_AUDIT_ALERT_CONFIG,
  buildCertificateAuditHistoryDigest,
  computeAuditCalendarSpanDays,
  detectAuditorScheduleConflicts,
  validateAuditorCapacityAgainstSpan,
  type AlertConfigEntity,
} from '../lib/auditAlertsEngine';
import {
  computeSiteDayBalance,
  evaluateSitePlanningCompleteness,
  resolveEffectiveAuditorsForProcess,
  resolveLatestAuditDate,
  type AuditDateEntry,
  type AuditLinkNature,
  type AuditPlanningStatusResult,
  type AuditoriaEquipoSitioItem,
  type AuditoriaProcesoSitioItem,
  type AuditoriaSitioPlanItem,
  type AuditorSiteRole,
  type ProgramaAuditoriaEntity,
  type SiteEvaluationModality,
} from '../lib/auditPlanningEngine';
import { isAuditorQualifiedForAudit } from './sitioAuditoriaView';
import { formatAuditCodename, getAuditCodenameTooltip } from '../lib/codenameDomain';

export interface CertificateHistoryPanelParams {
  certId: string;
  certNumber?: string;
  orgName?: string;
  normaCode?: string;
  currentAuditId?: string | null;
  currentProgram?: ProgramaAuditoriaEntity | null;
  allPrograms: ReadonlyArray<ProgramaAuditoriaEntity>;
  certDetail?: CertificadoDetailEntity | null;
  alertConfig?: AlertConfigEntity | null;
  isOpen: boolean;
  currentTipoVinculacionOverride?: AuditLinkNature | null;
  originProgramIdOverride?: string | null;
}

function formatShortDmy(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return isoDate;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function resolveEffectiveDateForPlanner(audit: ProgramacionAuditEntity): AuditDateEntry | null {
  const canonical = resolveLatestAuditDate(audit.fechas) ?? audit.latestDate ?? null;
  if (canonical) return canonical;
  if (audit.fecha_inicio && /^\d{4}-\d{2}-\d{2}$/.test(audit.fecha_inicio.trim())) {
    const start = audit.fecha_reprogramacion?.trim() || audit.fecha_inicio.trim();
    const end =
      audit.fecha_fin &&
      /^\d{4}-\d{2}-\d{2}$/.test(audit.fecha_fin.trim()) &&
      audit.fecha_fin.trim() >= start
        ? audit.fecha_fin.trim()
        : start;
    return {
      id: `effective-${audit.id}`,
      id_auditoria: audit.id,
      numero_secuencia: audit.fecha_reprogramacion ? 2 : 1,
      tag: audit.fecha_reprogramacion ? 'Reprogramación' : 'Programación',
      tipo_fecha: 'REAL',
      anio: null,
      mes: null,
      fecha_inicio: start,
      fecha_fin: end,
      observacion: null,
      deleted_at: null,
    };
  }
  return null;
}

function collectCycleVisitSnapshot(audit: ProgramacionAuditEntity | undefined): {
  sitesLabel: string;
  processesTurnosLabel: string;
  teamLabel: string;
} {
  if (!audit) {
    return {
      sitesLabel: 'Sin detalle de sitios',
      processesTurnosLabel: 'Sin procesos registrados',
      teamLabel: 'Sin equipo asignado',
    };
  }

  const activePlanSites = (audit.sitiosPlan || []).filter((s) => !s.deleted_at);
  let sitesLabel = '';
  if (activePlanSites.length > 0) {
    sitesLabel = activePlanSites
      .map((s) => (s.numero_sitio === 0 ? `Sitio 0 (${s.nombre_sitio})` : `Sitio #${s.numero_sitio} (${s.nombre_sitio})`))
      .join(', ');
  } else if (audit.sitiosMuestreo && audit.sitiosMuestreo.length > 0) {
    sitesLabel = audit.sitiosMuestreo
      .map((s) => (s.numero_sitio === 0 ? `Sitio 0 (${s.nombre_sitio})` : `Sitio #${s.numero_sitio} (${s.nombre_sitio})`))
      .join(', ');
  } else {
    sitesLabel = 'Sin sitios registrados';
  }

  const procNames = new Set<string>();
  let totalTurnos = 0;
  for (const site of activePlanSites) {
    for (const proc of site.procesos || []) {
      if (proc.deleted_at) continue;
      if (proc.proceso_nombre) procNames.add(proc.proceso_nombre);
      totalTurnos += (proc.turnos || []).filter((t) => !t.deleted_at).length;
    }
  }
  if (procNames.size === 0) {
    for (const row of audit.matrizNormativa || []) {
      if (row.proceso_nombre) procNames.add(row.proceso_nombre);
    }
  }
  const procArray = Array.from(procNames);
  const processesTurnosLabel =
    procArray.length > 0
      ? `${procArray.slice(0, 3).join(', ')}${procArray.length > 3 ? ` (+${procArray.length - 3})` : ''} · ${totalTurnos} turno${totalTurnos === 1 ? '' : 's'}`
      : 'Sin procesos registrados';

  const teamNames = new Map<string, string>();
  if (audit.auditor_lider && audit.auditor_lider.trim()) {
    const trimmedLeader = audit.auditor_lider.trim();
    const leaderDisplay = /\bl[ií]der\b/i.test(trimmedLeader)
      ? trimmedLeader
      : `${trimmedLeader} (Líder)`;
    teamNames.set(audit.auditor_lider_id || trimmedLeader, leaderDisplay);
  }
  for (const m of audit.equipo || []) {
    if (m.nombre && !teamNames.has(m.id_auditor || m.nombre)) {
      teamNames.set(m.id_auditor || m.nombre, `${m.nombre}${m.rol ? ` (${m.rol})` : ''}`);
    }
  }
  for (const site of activePlanSites) {
    for (const m of site.equipoSitio || []) {
      if (m.deleted_at || !m.auditor_nombre) continue;
      const key = m.id_auditor || m.auditor_nombre;
      if (!teamNames.has(key)) {
        teamNames.set(key, m.auditor_nombre);
      }
    }
  }
  const teamLabel =
    teamNames.size > 0 ? Array.from(teamNames.values()).join(', ') : 'Sin equipo asignado';

  return { sitesLabel, processesTurnosLabel, teamLabel };
}

/**
 * Step 4.1.1 (Parte 1) — Panel Colapsable "Historial del Certificado y Evolución de Ciclos".
 * Disponible desde la selección de certificado en `'add'`, `'edit'` y `'read'`.
 * Estricto Zero-UUID, Zero inline style= y XSS-safe (`escapeHtml`).
 */
export function renderCertificateHistoryPanel(params: CertificateHistoryPanelParams): string {
  const {
    certId,
    certNumber,
    orgName,
    normaCode,
    currentAuditId,
    currentProgram,
    allPrograms,
    certDetail,
    alertConfig,
    isOpen,
    currentTipoVinculacionOverride,
    originProgramIdOverride,
  } = params;

  const threshold =
    alertConfig?.ciclos_rotacion_auditor_lider ??
    DEFAULT_AUDIT_ALERT_CONFIG.ciclos_rotacion_auditor_lider;

  const digest = buildCertificateAuditHistoryDigest(
    certId,
    currentAuditId,
    allPrograms,
    certDetail ? { procesos: certDetail.procesos } : undefined,
    threshold
  );

  const effectiveCurrentNature: AuditLinkNature | null =
    currentTipoVinculacionOverride ??
    digest.currentTipoVinculacion ??
    currentProgram?.tipo_vinculacion ??
    null;

  const resolvedOriginId =
    originProgramIdOverride ?? currentProgram?.id_ciclo_origen ?? null;
  const originProgram = resolvedOriginId
    ? allPrograms.find((p) => !p.deleted_at && p.id === resolvedOriginId)
    : undefined;

  const hasEvolution =
    digest.hasLinkingEvolution ||
    Boolean(
      digest.previousTipoVinculacion &&
        effectiveCurrentNature &&
        digest.previousTipoVinculacion !== effectiveCurrentNature
    ) ||
    Boolean(originProgram && effectiveCurrentNature && originProgram.tipo_vinculacion !== effectiveCurrentNature);

  const prevNatureForEvolution =
    digest.previousTipoVinculacion || originProgram?.tipo_vinculacion || null;
  const evolutionSummaryText =
    hasEvolution && prevNatureForEvolution && effectiveCurrentNature
      ? `${prevNatureForEvolution} → ${effectiveCurrentNature}`
      : originProgram
        ? `Continuidad desde ${originProgram.codigo_programa || originProgram.etiqueta}`
        : null;

  const priorCount = digest.previousCycles.length;
  const uncoveredCount = digest.unauditedProcessesFromLastCycle.length;
  const recentCycles = digest.previousCycles.slice(0, 5);

  const auditLookup = new Map<
    string,
    { program: ProgramaAuditoriaEntity; audit: ProgramacionAuditEntity }
  >();
  for (const p of allPrograms) {
    if (p.deleted_at) continue;
    for (const a of p.auditorias || []) {
      if (!a.deleted_at) {
        auditLookup.set(a.id, { program: p, audit: a });
      }
    }
  }

  const certHeaderMeta = [certNumber, normaCode, orgName].filter(Boolean).join(' · ');

  let expandedContentHtml = '';
  if (isOpen) {
    const continuityBannerHtml =
      evolutionSummaryText ||
      digest.leadAuditorRotation.requiresRotation ||
      uncoveredCount > 0 ||
      priorCount > 0
        ? `
          <div class="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
            ${
              evolutionSummaryText
                ? `
                  <div class="flex flex-wrap items-center gap-2 text-xs text-indigo-900 bg-indigo-50/70 border border-indigo-200 rounded-lg px-2.5 py-2">
                    <span class="font-bold">♻️ Evolución de Ciclo:</span>
                    <span class="font-semibold">${escapeHtml(
                      prevNatureForEvolution && effectiveCurrentNature && prevNatureForEvolution !== effectiveCurrentNature
                        ? `Ciclo previo: ${prevNatureForEvolution} → Ciclo actual: ${effectiveCurrentNature}`
                        : evolutionSummaryText
                    )}</span>
                    ${
                      originProgram
                        ? `<span class="text-[11px] text-indigo-700">(${escapeHtml(
                            originProgram.codigo_programa || originProgram.etiqueta
                          )})</span>`
                        : ''
                    }
                  </div>
                `
                : ''
            }
            ${
              digest.leadAuditorRotation.requiresRotation && digest.leadAuditorRotation.warningMessage
                ? `
                  <div role="status" class="flex flex-wrap items-center gap-2 text-xs text-amber-950 bg-amber-50 border border-amber-300 rounded-lg px-2.5 py-2">
                    <span class="font-bold">⚠️ Rotación ISO/IEC 17021-1:</span>
                    <span>${escapeHtml(digest.leadAuditorRotation.warningMessage)}</span>
                  </div>
                `
                : ''
            }
            ${
              uncoveredCount > 0
                ? `
                  <div class="rounded-lg border border-amber-200 bg-amber-50/60 px-2.5 py-2 space-y-1.5">
                    <div class="text-xs font-bold text-amber-950">
                      📌 Procesos del certificado ausentes en la última visita previa (${uncoveredCount}):
                    </div>
                    <div class="flex flex-wrap gap-1.5">
                      ${digest.unauditedProcessesFromLastCycle
                        .map(
                          (proc) => `
                            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-white text-amber-900 border border-amber-200">
                              <span>${escapeHtml(proc.nombre_proceso)}</span>
                              <span class="text-[10px] text-amber-700">(${escapeHtml(proc.tipo)})</span>
                            </span>
                          `
                        )
                        .join('')}
                    </div>
                  </div>
                `
                : priorCount > 0 && (certDetail?.procesos?.length || 0) > 0
                  ? `
                    <div class="text-xs text-emerald-800 bg-emerald-50/70 border border-emerald-200 rounded-lg px-2.5 py-1.5 font-medium">
                      ✓ Todos los procesos activos del certificado estuvieron cubiertos en la última visita previa.
                    </div>
                  `
                  : ''
            }
          </div>
        `
        : '';

    const timelineListHtml =
      recentCycles.length > 0
        ? `
          <div class="space-y-2">
            <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Línea de Tiempo Compacta (Últimos ${recentCycles.length} de ${priorCount} ciclo${priorCount === 1 ? '' : 's'})
            </div>
            <div class="space-y-2">
              ${recentCycles
                .map((cycle) => {
                  const found = auditLookup.get(cycle.auditId);
                  const progCode =
                    found?.program.codigo_programa?.trim() || cycle.program_etiqueta;
                  const visit = collectCycleVisitSnapshot(found?.audit);
                  const codename = formatAuditCodename(
                    found?.audit ?? {
                      codigo_auditoria: cycle.codigo_auditoria,
                      tipo_auditoria: cycle.tipo_auditoria,
                    }
                  );
                  const codenameTooltip = getAuditCodenameTooltip(
                    found?.audit ?? {
                      codigo_auditoria: cycle.codigo_auditoria,
                      tipo_auditoria: cycle.tipo_auditoria,
                    }
                  );
                  return `
                    <button
                      type="button"
                      data-action="open-history-cycle"
                      data-program-id="${escapeHtml(cycle.programId)}"
                      data-audit-id="${escapeHtml(cycle.auditId)}"
                      title="Abrir ciclo histórico ${escapeHtml(codenameTooltip)}"
                      class="w-full text-left rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/30 p-3 transition-colors cursor-pointer space-y-1.5"
                    >
                      <div class="flex flex-wrap items-center justify-between gap-2">
                        <div class="flex flex-wrap items-center gap-1.5 min-w-0">
                          <span class="font-mono text-xs font-bold text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200" title="${escapeHtml(codenameTooltip)}">
                            ${escapeHtml(codename)}
                          </span>
                          <span class="text-xs font-bold text-slate-900 truncate">
                            ${escapeHtml(progCode)}
                          </span>
                          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-slate-100 text-slate-700 border-slate-200">
                            ${escapeHtml(cycle.tipo_vinculacion)}
                          </span>
                          <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-50 text-sky-800 border border-sky-200">
                            ${escapeHtml(cycle.tipo_auditoria)}
                          </span>
                        </div>
                        <div class="flex items-center gap-2 text-[11px] font-mono font-semibold text-slate-700 shrink-0">
                          <span>📅 ${escapeHtml(cycle.dateLabel)}</span>
                          <span class="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200">
                            ${cycle.tiempo_auditoria.toFixed(2)} d
                          </span>
                          <span class="text-indigo-700 font-sans font-bold">Ver →</span>
                        </div>
                      </div>
                      <div class="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px] text-slate-600 pt-1 border-t border-slate-100">
                        <div class="truncate" title="${escapeHtml(visit.sitesLabel)}">
                          <span class="font-semibold text-slate-800">Sitios:</span> ${escapeHtml(visit.sitesLabel)}
                        </div>
                        <div class="truncate" title="${escapeHtml(visit.processesTurnosLabel)}">
                          <span class="font-semibold text-slate-800">Procesos y Turnos:</span> ${escapeHtml(visit.processesTurnosLabel)}
                        </div>
                        <div class="truncate" title="${escapeHtml(visit.teamLabel)}">
                          <span class="font-semibold text-slate-800">Equipo:</span> ${escapeHtml(visit.teamLabel)}
                        </div>
                      </div>
                    </button>
                  `;
                })
                .join('')}
            </div>
          </div>
        `
        : `
          <div class="p-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-500">
            Este certificado aún no registra ciclos históricos previos en la plataforma.
          </div>
        `;

    expandedContentHtml = `
      <div id="certHistoryPanelBody" class="pt-3 border-t border-slate-200/80 space-y-2.5">
        ${continuityBannerHtml}
        ${timelineListHtml}
      </div>
    `;
  }

  return `
    <section
      data-testid="cert-history-panel"
      aria-label="Historial del Certificado y Evolución de Ciclos"
      class="rounded-xl border border-slate-200 bg-slate-50/75 p-3 space-y-2"
    >
      <button
        type="button"
        id="toggleCertHistoryPanelBtn"
        data-action="toggle-cert-history-panel"
        aria-expanded="${isOpen ? 'true' : 'false'}"
        class="w-full flex flex-wrap items-center justify-between gap-2 text-left cursor-pointer"
      >
        <div class="flex flex-wrap items-center gap-2 min-w-0">
          <span class="text-xs font-bold text-slate-900">
            📜 Historial del Certificado y Evolución de Ciclos
          </span>
          ${
            certHeaderMeta
              ? `<span class="text-[11px] font-medium text-slate-500 truncate">${escapeHtml(certHeaderMeta)}</span>`
              : ''
          }
        </div>
        <div class="flex flex-wrap items-center gap-1.5 shrink-0">
          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border bg-white text-slate-700 border-slate-200">
            ${priorCount} ciclo(s) previo(s)
          </span>
          ${
            evolutionSummaryText
              ? `
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border bg-indigo-50 text-indigo-800 border-indigo-200">
                  Evolución de Ciclo${
                    prevNatureForEvolution && effectiveCurrentNature && prevNatureForEvolution !== effectiveCurrentNature
                      ? `: ${escapeHtml(prevNatureForEvolution)} → ${escapeHtml(effectiveCurrentNature)}`
                      : ''
                  }
                </span>
              `
              : ''
          }
          ${
            digest.leadAuditorRotation.requiresRotation
              ? `
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border bg-amber-100 text-amber-900 border-amber-300">
                  ⚠️ Rotación Líder
                </span>
              `
              : ''
          }
          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
            uncoveredCount > 0
              ? 'bg-amber-50 text-amber-800 border-amber-200'
              : 'bg-white text-slate-600 border-slate-200'
          }">
            ${uncoveredCount} proceso(s) sin cobertura reciente
          </span>
          <span class="inline-flex items-center justify-center w-6 h-6 rounded-md border border-slate-200 bg-white text-slate-600 text-[11px] font-bold" aria-hidden="true">
            ${isOpen ? '▴' : '▾'}
          </span>
        </div>
      </button>

      ${expandedContentHtml}
    </section>
  `;
}

export interface AuditPlannerHudParams {
  audit: ProgramacionAuditEntity;
  auditStatus: AuditPlanningStatusResult;
  allPrograms: ReadonlyArray<ProgramaAuditoriaEntity>;
  allAuditors: ReadonlyArray<AuditorDetailEntity>;
  filterQualifiedOnly: boolean;
  canPlan: boolean;
}

/**
 * Step 4.1.1 (Parte 1) — Barra Global de Salud y Planner HUD en cabecera de pestaña `'planificacion'`.
 * Muestra progreso (`computeAuditPlanningStatus`), Cubo 1 vs Cubo 2, contraste contra Rango Calendario Real,
 * conflictos de agenda entre programas y filtro de competencia (`auditor_esta_calificado`).
 * Cero `any`, Zero-UUID y cero inline `style=`.
 */
export function renderAuditPlannerHud(params: AuditPlannerHudParams): string {
  const {
    audit,
    auditStatus,
    allPrograms,
    allAuditors,
    filterQualifiedOnly,
    canPlan,
  } = params;

  const bal = auditStatus.balanceSummary;
  const pct = Math.max(0, Math.min(100, Math.round(auditStatus.completionPercent)));
  const barFillClass =
    pct === 100
      ? 'fill-emerald-600'
      : pct >= 50
        ? 'fill-indigo-600'
        : 'fill-amber-500';

  const latestDate = resolveEffectiveDateForPlanner(audit);
  const calendarSpanDays =
    latestDate && latestDate.tipo_fecha === 'REAL'
      ? computeAuditCalendarSpanDays(latestDate)
      : null;
  const capacityCheck =
    latestDate && latestDate.tipo_fecha === 'REAL'
      ? validateAuditorCapacityAgainstSpan(bal.auditorTotals, calendarSpanDays)
      : { calendarSpanDays: null, hasWarnings: false, overloadedAuditors: [], warnings: [] };

  const auditorCount = bal.auditorTotals.length;

  let calendarContrastHtml = '';
  if (latestDate && latestDate.tipo_fecha === 'REAL' && calendarSpanDays !== null) {
    const startDmy = formatShortDmy(latestDate.fecha_inicio);
    const endDmy = formatShortDmy(latestDate.fecha_fin || latestDate.fecha_inicio);
    const compatible = !capacityCheck.hasWarnings && bal.totalAuditorAssignedDays > 0;
    const summarySpanText = `${bal.totalAuditorAssignedDays.toFixed(2)} días-auditor / ${auditorCount} auditor${auditorCount === 1 ? '' : 'es'} en ${calendarSpanDays} día${calendarSpanDays === 1 ? '' : 's'} calendario`;

    calendarContrastHtml = `
      <div class="rounded-xl border border-slate-200 bg-white p-2.5 sm:p-3 space-y-1.5">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="text-xs font-semibold text-slate-800">
            Rango Calendario: <strong>${calendarSpanDays} día${calendarSpanDays === 1 ? '' : 's'}</strong> (${escapeHtml(startDmy)} → ${escapeHtml(endDmy)}) · Capacidad máx. por auditor: <span class="font-mono font-bold">${calendarSpanDays.toFixed(2)}d</span>
          </span>
          ${
            compatible
              ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">✓ Compatible con rango calendario</span>`
              : capacityCheck.hasWarnings
                ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-200">⚠️ Excede capacidad del rango</span>`
                : `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">Sin días asignados</span>`
          }
        </div>
        <div class="text-[11px] font-mono text-slate-600">${escapeHtml(summarySpanText)}</div>
        ${
          capacityCheck.hasWarnings
            ? `
              <div role="status" class="text-[11px] text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5 space-y-0.5">
                ${capacityCheck.warnings.map((w) => `<div>⚠️ ${escapeHtml(w)}</div>`).join('')}
              </div>
            `
            : ''
        }
      </div>
    `;
  } else if (latestDate && latestDate.tipo_fecha === 'PREPROGRAMADA_MES') {
    calendarContrastHtml = `
      <div class="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950">
        <span class="font-semibold">⏳ Fecha exacta pendiente de confirmar (Mes/Año)</span>
        <span class="text-[11px] text-amber-800">Registre un rango Real para validar capacidad diaria por auditor.</span>
      </div>
    `;
  } else {
    calendarContrastHtml = `
      <div class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
        📅 Sin fecha vigente registrada — defina una fecha estimada o rango real en el Gestor Multi-Fecha 1:N.
      </div>
    `;
  }

  // Schedule conflicts involving current program or auditors participating in this audit
  const currentProgramId = audit.id_programa_auditoria || '';
  const auditAuditorIds = new Set<string>();
  if (audit.auditor_lider_id) auditAuditorIds.add(audit.auditor_lider_id);
  for (const m of audit.equipo || []) {
    if (m.id_auditor) auditAuditorIds.add(m.id_auditor);
  }
  for (const sp of audit.sitiosPlan || []) {
    if (sp.deleted_at) continue;
    for (const m of sp.equipoSitio || []) {
      if (!m.deleted_at && m.id_auditor) auditAuditorIds.add(m.id_auditor);
    }
  }

  const allConflicts = detectAuditorScheduleConflicts(allPrograms);
  const relevantConflicts = allConflicts.filter(
    (c) =>
      (currentProgramId &&
        (c.program_a_id === currentProgramId || c.program_b_id === currentProgramId)) ||
      auditAuditorIds.has(c.id_auditor)
  );

  const conflictsHtml =
    relevantConflicts.length > 0
      ? `
        <div role="status" class="rounded-xl border border-rose-200 bg-rose-50/80 p-2.5 space-y-1 text-xs text-rose-900">
          <div class="font-bold">⚠️ Conflictos de Agenda Detectados (${relevantConflicts.length})</div>
          ${relevantConflicts
            .map((c) => `<div class="text-[11px]">• ${escapeHtml(c.message)}</div>`)
            .join('')}
        </div>
      `
      : '';

  const activeAuditors = allAuditors || [];
  const qualifiedAuditorsCount = activeAuditors.filter(
    (a) => isAuditorQualifiedForAudit(a, audit).qualified
  ).length;

  const bucketDeltaText =
    bal.totalSiteDemandedDays === 0 && bal.totalAuditorAssignedDays === 0
      ? 'Sin asignar'
      : bal.bucketDelta === 0
        ? 'Cuadrado ✓'
        : bal.bucketDelta < 0
          ? `Faltan ${Math.abs(bal.bucketDelta).toFixed(2)} d`
          : `Exceso +${bal.bucketDelta.toFixed(2)} d`;

  const bucketStatusClass =
    bal.totalSiteDemandedDays === 0 && bal.totalAuditorAssignedDays === 0
      ? 'text-slate-600'
      : bal.isBalanced
        ? 'text-emerald-700'
        : 'text-rose-700';

  const pendingItems = auditStatus.pendingReasons.slice(0, 4);

  return `
    <section
      data-testid="audit-planner-hud"
      aria-label="Barra Global de Salud y Planner HUD"
      class="rounded-xl border border-slate-200 bg-slate-50/90 p-3 sm:p-3.5 space-y-3"
    >
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div class="bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-0.5">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Requerido en Sitios (Cubo 1)
          </div>
          <div class="font-mono text-sm font-bold text-slate-900">
            ${bal.totalSiteDemandedDays.toFixed(2)} d
          </div>
        </div>

        <div class="bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-0.5">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Asignado a Auditores (Cubo 2)
          </div>
          <div class="font-mono text-sm font-bold text-slate-900">
            ${bal.totalAuditorAssignedDays.toFixed(2)} d
          </div>
        </div>

        <div class="bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-0.5">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Cuadre Dual-Bucket
          </div>
          <div class="text-xs font-bold ${bucketStatusClass}">
            ${escapeHtml(bucketDeltaText)}
          </div>
        </div>

        <div class="bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-1">
          <div class="flex items-center justify-between gap-2">
            <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Completitud
            </span>
            <span class="font-mono text-xs font-bold text-indigo-700">
              ${pct}% · ${escapeHtml(auditStatus.primaryTag)}
            </span>
          </div>
          <svg
            viewBox="0 0 100 8"
            preserveAspectRatio="none"
            role="progressbar"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow="${pct}"
            aria-label="Completitud de planificación (${pct}%)"
            class="w-full h-2 rounded-full overflow-hidden bg-slate-200 block"
          >
            <rect x="0" y="0" width="${pct}" height="8" rx="4" class="${barFillClass}" />
          </svg>
        </div>
      </div>

      ${calendarContrastHtml}
      ${conflictsHtml}

      <div class="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2">
        <div class="flex flex-wrap items-center gap-2 min-w-0 text-xs">
          ${
            pendingItems.length > 0
              ? `
                <span class="font-bold text-amber-800">Pendientes:</span>
                <span class="text-slate-600">${escapeHtml(pendingItems.join(' · '))}</span>
              `
              : `<span class="font-bold text-emerald-700">✓ Planificación completa (fechas, sitios, procesos, turnos y equipo cuadrados)</span>`
          }
        </div>

        <div class="flex flex-wrap items-center gap-2 shrink-0">
          <label class="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 ${
            canPlan ? 'cursor-pointer' : 'cursor-not-allowed opacity-75'
          } select-none">
            <input
              type="checkbox"
              id="plannerQualifiedFilterToggle"
              data-action="toggle-planner-qualified-filter"
              role="switch"
              aria-checked="${filterQualifiedOnly ? 'true' : 'false'}"
              ${filterQualifiedOnly ? 'checked' : ''}
              ${canPlan ? '' : 'disabled'}
              class="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span>Solo auditores calificados para esta Norma y Sub-Sector IAF</span>
            <span class="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700">
              ${qualifiedAuditorsCount}/${activeAuditors.length}
            </span>
          </label>
        </div>
      </div>

      ${
        !filterQualifiedOnly
          ? `
            <div role="status" class="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950">
              ⚠️ Sin calificación completa: el selector de auditores incluirá personal sin acreditación total en ${escapeHtml(audit.norma_codigo)} · IAF ${audit.sector_iaf}.
            </div>
          `
          : ''
      }
    </section>
  `;
}

export interface AuditPlannerTreeParams {
  audit: ProgramacionAuditEntity;
  certDetail?: CertificadoDetailEntity | null;
  planSites: ReadonlyArray<AuditoriaSitioPlanItem>;
  allAuditors: ReadonlyArray<AuditorDetailEntity>;
  filterQualifiedOnly: boolean;
  expandedSiteIds: ReadonlyArray<string>;
  canPlan: boolean;
  canNavigateToSite?: boolean;
}

const SITE_ROLE_SELECT_OPTIONS: ReadonlyArray<{ value: AuditorSiteRole; label: string }> = [
  { value: 'AUDITOR_LIDER', label: 'Auditor Líder' },
  { value: 'AUDITOR', label: 'Auditor de Equipo' },
  { value: 'AUDITOR_EN_ENTRENAMIENTO', label: 'Auditor en Entrenamiento' },
  { value: 'EXPERTO_TECNICO', label: 'Experto Técnico' },
];

const SITE_MODALITY_OPTIONS: readonly SiteEvaluationModality[] = [
  'Presencial',
  'Remota',
  'Mixta',
];

function formatPlannerSiteRole(role: AuditorSiteRole): string {
  const match = SITE_ROLE_SELECT_OPTIONS.find((opt) => opt.value === role);
  return match ? match.label : 'Auditor de Equipo';
}

function formatShortShiftTime(rawTime: string | null | undefined): string {
  if (!rawTime) return '';
  const m = /^(\d{1,2}):(\d{2})/.exec(rawTime.trim());
  if (!m) return rawTime;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

function resolveCertificateSitesForTree(
  audit: ProgramacionAuditEntity,
  certDetail: CertificadoDetailEntity | null | undefined,
  planSites: ReadonlyArray<AuditoriaSitioPlanItem>
): SiteEntity[] {
  if (certDetail?.sitios && certDetail.sitios.length > 0) {
    return sortSitesWithPrincipalFirst(certDetail.sitios);
  }
  const bySiteId = new Map<string, SiteEntity>();
  for (const ms of audit.sitiosMuestreo || []) {
    bySiteId.set(ms.id_sitio, {
      id: ms.id_sitio,
      id_certificado: audit.id_certificado,
      numero_sitio: ms.numero_sitio,
      nombre_sitio: ms.nombre_sitio,
      direccion_sitio: ms.direccion_sitio || '',
      turnos_vinculados: [],
      turnos_por_sitio: [],
      procesos_por_sitio: [],
    });
  }
  for (const sp of planSites) {
    if (sp.deleted_at || bySiteId.has(sp.id_sitio)) continue;
    bySiteId.set(sp.id_sitio, {
      id: sp.id_sitio,
      id_certificado: audit.id_certificado,
      numero_sitio: sp.numero_sitio,
      nombre_sitio: sp.nombre_sitio,
      direccion_sitio: sp.direccion_sitio || '',
      turnos_vinculados: [],
      turnos_por_sitio: [],
      procesos_por_sitio: [],
    });
  }
  return sortSitesWithPrincipalFirst(Array.from(bySiteId.values()));
}

function resolveSiteTurnosPorSitio(site: SiteEntity): TurnoPorSitioLink[] {
  return (site.turnos_por_sitio || []).filter((t) => !t.deleted_at);
}

function resolveSiteProcesosPorSitio(site: SiteEntity): ProcesoPorSitioLink[] {
  return (site.procesos_por_sitio || []).filter((p) => !p.deleted_at);
}

function isTurnoLinkActiveOnProcess(
  activeProc: AuditoriaProcesoSitioItem,
  tps: TurnoPorSitioLink
): boolean {
  const activeTurnos = (activeProc.turnos || []).filter((t) => !t.deleted_at);
  return activeTurnos.some(
    (t) =>
      (t.id_turnos_por_sitio && t.id_turnos_por_sitio === tps.id) ||
      (!t.id_turnos_por_sitio &&
        t.descripcion_turno &&
        t.descripcion_turno.trim().toLowerCase() === tps.descripcion.trim().toLowerCase())
  );
}

function renderProcessCardHtml(params: {
  audit: ProgramacionAuditEntity;
  site: SiteEntity;
  sitePlan: AuditoriaSitioPlanItem;
  pps: ProcesoPorSitioLink;
  activePsa: AuditoriaProcesoSitioItem | undefined;
  siteTurnos: ReadonlyArray<TurnoPorSitioLink>;
  activeEquipo: ReadonlyArray<AuditoriaEquipoSitioItem>;
  eligibleCandidates: ReadonlyArray<AuditorDetailEntity>;
  auditorById: ReadonlyMap<string, AuditorDetailEntity>;
  siteIndex: number;
  procIndex: number;
  canPlan: boolean;
  canNavigateToSite: boolean;
}): string {
  const {
    audit,
    site,
    sitePlan,
    pps,
    activePsa,
    siteTurnos,
    activeEquipo,
    eligibleCandidates,
    auditorById,
    siteIndex,
    procIndex,
    canPlan,
    canNavigateToSite,
  } = params;

  const isProcChecked = Boolean(activePsa);
  const clausulas = pps.clausulas_cubiertas || [];
  const clausulasPreview =
    clausulas.length > 0
      ? `Cláusulas: ${clausulas.slice(0, 5).join(', ')}${
          clausulas.length > 5 ? ` (+${clausulas.length - 5})` : ''
        }`
      : '';

  let activeBodyHtml = '';
  if (activePsa) {
    const activeTurnosCount = (activePsa.turnos || []).filter((t) => !t.deleted_at).length;

    let turnosSectionHtml = '';
    if (siteTurnos.length === 0) {
      turnosSectionHtml = `
        <div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-2.5 py-2 text-[11px] text-amber-900">
          <span>⚠️ Este sitio no tiene turnos configurados en su ficha operativa.</span>
          ${
            canNavigateToSite
              ? `
                <button
                  type="button"
                  data-action="select-sitio"
                  data-sitio-id="${escapeHtml(site.id)}"
                  data-cert-id="${escapeHtml(audit.id_certificado)}"
                  data-target-tab="turnos"
                  class="px-2 py-1 rounded border border-amber-300 bg-white hover:bg-amber-50 text-amber-900 font-bold cursor-pointer"
                >
                  → Ir al Sitio
                </button>
              `
              : ''
          }
        </div>
      `;
    } else {
      const chipsHtml = siteTurnos
        .map((tps, tIdx) => {
          const isSelected = isTurnoLinkActiveOnProcess(activePsa, tps);
          const timeRange =
            tps.hora_entrada && tps.hora_salida
              ? `${formatShortShiftTime(tps.hora_entrada)}–${formatShortShiftTime(tps.hora_salida)}`
              : '';
          const chipLabel = timeRange ? `${tps.descripcion} (${timeRange})` : tps.descripcion;
          if (!canPlan) {
            return isSelected
              ? `<span class="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border bg-sky-50 text-sky-900 border-sky-200">✓ ${escapeHtml(chipLabel)}</span>`
              : '';
          }
          return `
            <button
              type="button"
              data-action="toggle-planner-process-turno"
              data-audit-id="${escapeHtml(audit.id)}"
              data-sitio-id="${escapeHtml(site.id)}"
              data-sitio-auditoria-id="${escapeHtml(sitePlan.id)}"
              data-psa-id="${escapeHtml(activePsa.id)}"
              data-tps-id="${escapeHtml(tps.id)}"
              data-focus-key="proc-turno-${siteIndex}-${procIndex}-${tIdx}"
              aria-pressed="${isSelected ? 'true' : 'false'}"
              aria-label="${escapeHtml(isSelected ? 'Desmarcar' : 'Seleccionar')} turno ${escapeHtml(chipLabel)} en ${escapeHtml(pps.nombre_proceso)}"
              class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-sky-600 text-white border-sky-600 shadow-2xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-sky-300 hover:bg-sky-50/50'
              }"
            >
              <span aria-hidden="true">${isSelected ? '✓' : '+'}</span>
              <span>${escapeHtml(chipLabel)}</span>
            </button>
          `;
        })
        .filter(Boolean)
        .join('');

      turnosSectionHtml = `
        <div class="space-y-1.5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Turnos del Proceso (1..N)
            </span>
            ${
              activeTurnosCount === 0
                ? `<span role="status" class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-300">⚠️ Selecciona al menos 1 turno</span>`
                : `<span class="text-[11px] font-semibold text-sky-700">${activeTurnosCount} turno${activeTurnosCount === 1 ? '' : 's'} activo${activeTurnosCount === 1 ? '' : 's'}</span>`
            }
          </div>
          <div class="flex flex-wrap gap-1.5">
            ${
              chipsHtml ||
              '<span class="text-[11px] text-amber-800 font-medium">Ningún turno seleccionado en modo lectura.</span>'
            }
          </div>
        </div>
      `;
    }

    // Nivel 3b: Cobertura Granular por Proceso (Heredados "Todo el sitio" + M:N co-evaluación)
    const effectiveAuditors = resolveEffectiveAuditorsForProcess(sitePlan, activePsa);
    const wholeSiteAuditors = activeEquipo.filter((m) => m.asignacion_completa_sitio);
    const explicitProcEquipo = (activePsa.equipoProceso || []).filter((m) => !m.deleted_at);
    const explicitAuditorIds = new Set(explicitProcEquipo.map((m) => m.id_auditor));

    // Candidate pool for M:N interactive chips: non-whole-site site team + already explicitly linked
    const granularChipCandidates = new Map<
      string,
      { id: string; nombre: string; fromSiteTeam: boolean }
    >();
    for (const m of activeEquipo) {
      if (!m.asignacion_completa_sitio) {
        granularChipCandidates.set(m.id_auditor, {
          id: m.id_auditor,
          nombre: m.auditor_nombre,
          fromSiteTeam: true,
        });
      }
    }
    for (const pm of explicitProcEquipo) {
      if (!granularChipCandidates.has(pm.id_auditor)) {
        const audDetail = auditorById.get(pm.id_auditor);
        granularChipCandidates.set(pm.id_auditor, {
          id: pm.id_auditor,
          nombre: pm.auditor_nombre || audDetail?.nombre || 'Auditor',
          fromSiteTeam: false,
        });
      }
    }

    const inheritedPillsHtml = wholeSiteAuditors
      .map((m) => {
        const qual = isAuditorQualifiedForAudit(auditorById.get(m.id_auditor), audit);
        return `
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-900 border border-indigo-200">
            <span>✓ ${escapeHtml(m.auditor_nombre)} (Todo el sitio)</span>
            ${
              !qual.qualified
                ? `<span class="text-[10px] text-amber-800" title="${escapeHtml(qual.label)}">⚠️</span>`
                : ''
            }
          </span>
        `;
      })
      .join('');

    const granularChipsHtml = Array.from(granularChipCandidates.values())
      .map((cand, aIdx) => {
        const isAssigned = explicitAuditorIds.has(cand.id);
        const qual = isAuditorQualifiedForAudit(auditorById.get(cand.id), audit);
        if (!canPlan) {
          return isAssigned
            ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-900 border border-emerald-200">✓ ${escapeHtml(cand.nombre)} (Evaluador M:N)</span>`
            : '';
        }
        return `
          <button
            type="button"
            data-action="toggle-planner-process-auditor"
            data-audit-id="${escapeHtml(audit.id)}"
            data-sitio-auditoria-id="${escapeHtml(sitePlan.id)}"
            data-psa-id="${escapeHtml(activePsa.id)}"
            data-auditor-id="${escapeHtml(cand.id)}"
            data-focus-key="proc-aud-${siteIndex}-${procIndex}-${aIdx}"
            aria-pressed="${isAssigned ? 'true' : 'false'}"
            aria-label="${escapeHtml(isAssigned ? 'Retirar' : 'Asignar')} a ${escapeHtml(cand.nombre)} en proceso ${escapeHtml(pps.nombre_proceso)}"
            class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors cursor-pointer ${
              isAssigned
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50'
            }"
          >
            <span aria-hidden="true">${isAssigned ? '✓' : '+'}</span>
            <span>${escapeHtml(cand.nombre)}</span>
            ${
              !qual.qualified
                ? `<span class="text-[10px] ${isAssigned ? 'text-amber-100' : 'text-amber-700'}">⚠️</span>`
                : ''
            }
          </button>
        `;
      })
      .filter(Boolean)
      .join('');

    // Additional eligible auditors not yet shown as whole-site or granular chip
    const wholeSiteIds = new Set(wholeSiteAuditors.map((m) => m.id_auditor));
    const pickerAuditorsForProcess = eligibleCandidates.filter(
      (a) => !wholeSiteIds.has(a.id) && !explicitAuditorIds.has(a.id) && !granularChipCandidates.has(a.id)
    );

    const addProcessAuditorBarHtml =
      canPlan && pickerAuditorsForProcess.length > 0
        ? `
          <div class="flex flex-wrap items-center gap-1.5 pt-1">
            <select
              data-planner-proc-auditor-select="${escapeHtml(activePsa.id)}"
              aria-label="Seleccionar evaluador adicional para ${escapeHtml(pps.nombre_proceso)}"
              class="px-2 py-1 bg-white border border-slate-300 rounded-lg text-[11px] text-slate-900 focus:outline-none focus:border-indigo-500"
            >
              <option value="">+ Co-evaluar proceso con...</option>
              ${pickerAuditorsForProcess
                .map((aud) => {
                  const qual = isAuditorQualifiedForAudit(aud, audit);
                  return `<option value="${escapeHtml(aud.id)}">${escapeHtml(
                    `${aud.nombre} (${qual.qualified ? '✓ Calificado' : '⚠️ Sin calificación completa'})`
                  )}</option>`;
                })
                .join('')}
            </select>
            <button
              type="button"
              data-action="add-planner-process-auditor"
              data-audit-id="${escapeHtml(audit.id)}"
              data-sitio-auditoria-id="${escapeHtml(sitePlan.id)}"
              data-psa-id="${escapeHtml(activePsa.id)}"
              data-focus-key="proc-add-aud-${siteIndex}-${procIndex}"
              class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-[11px] font-bold transition-colors cursor-pointer"
            >
              + Asignar M:N
            </button>
          </div>
        `
        : '';

    const coverageSectionHtml = `
      <div class="pt-2 border-t border-slate-200/80 space-y-1.5">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Cobertura Granular por Proceso (M:N)
          </span>
          ${
            effectiveAuditors.length === 0
              ? `<span role="status" class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">⚠️ Sin auditor asignado</span>`
              : `<span class="text-[11px] font-semibold text-emerald-700">${effectiveAuditors.length} auditor${effectiveAuditors.length === 1 ? '' : 'es'} efectivo${effectiveAuditors.length === 1 ? '' : 's'}</span>`
          }
        </div>
        <div class="flex flex-wrap items-center gap-1.5">
          ${inheritedPillsHtml}
          ${granularChipsHtml}
          ${
            !inheritedPillsHtml && !granularChipsHtml
              ? `<span class="text-[11px] text-slate-500">Agregue auditores al sitio o asígnelos puntualmente a este proceso.</span>`
              : ''
          }
        </div>
        ${addProcessAuditorBarHtml}
      </div>
    `;

    activeBodyHtml = `
      <div class="mt-2.5 pt-2.5 border-t border-slate-200/80 space-y-2.5">
        ${turnosSectionHtml}
        ${coverageSectionHtml}
      </div>
    `;
  }

  return `
    <div
      data-testid="planner-process-card"
      class="rounded-xl border p-2.5 sm:p-3 transition-colors ${
        isProcChecked
          ? 'bg-white border-indigo-200 shadow-2xs'
          : 'bg-slate-50/70 border-slate-200'
      }"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-start gap-2.5 min-w-0">
          ${
            canPlan
              ? `
                <input
                  type="checkbox"
                  data-action="toggle-planner-process"
                  data-audit-id="${escapeHtml(audit.id)}"
                  data-sitio-id="${escapeHtml(site.id)}"
                  data-sitio-auditoria-id="${escapeHtml(sitePlan.id)}"
                  data-pps-id="${escapeHtml(pps.id)}"
                  data-psa-id="${escapeHtml(activePsa?.id || '')}"
                  data-focus-key="proc-toggle-${siteIndex}-${procIndex}"
                  aria-label="Incluir proceso ${escapeHtml(pps.nombre_proceso)} en ${escapeHtml(site.nombre_sitio)}"
                  ${isProcChecked ? 'checked' : ''}
                  class="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                />
              `
              : `
                <span class="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold shrink-0 ${
                  isProcChecked
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : 'bg-slate-100 text-slate-500 border border-slate-200'
                }">${isProcChecked ? '✓' : '○'}</span>
              `
          }
          <div class="min-w-0 space-y-0.5">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="text-xs font-bold text-slate-900">${escapeHtml(pps.nombre_proceso)}</span>
              <span class="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                ${escapeHtml(pps.tipo_proceso)}
              </span>
            </div>
            ${
              clausulasPreview
                ? `<div class="text-[11px] text-slate-500 font-mono">${escapeHtml(clausulasPreview)}</div>`
                : ''
            }
          </div>
        </div>
        <span class="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${
          isProcChecked
            ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
            : 'bg-slate-100 text-slate-600 border-slate-200'
        }">
          ${isProcChecked ? 'En Alcance' : 'No Incluido'}
        </span>
      </div>
      ${activeBodyHtml}
    </div>
  `;
}

function renderSiteTeamBucket2SectionHtml(params: {
  audit: ProgramacionAuditEntity;
  site: SiteEntity;
  sitePlan: AuditoriaSitioPlanItem;
  activeEquipo: ReadonlyArray<AuditoriaEquipoSitioItem>;
  eligibleCandidates: ReadonlyArray<AuditorDetailEntity>;
  auditorById: ReadonlyMap<string, AuditorDetailEntity>;
  siteIndex: number;
  canPlan: boolean;
}): string {
  const {
    audit,
    site,
    sitePlan,
    activeEquipo,
    eligibleCandidates,
    auditorById,
    siteIndex,
    canPlan,
  } = params;

  const siteBal = computeSiteDayBalance(sitePlan);
  const assignedIds = new Set(activeEquipo.map((m) => m.id_auditor));
  const addableAuditors = eligibleCandidates.filter((a) => !assignedIds.has(a.id));

  const membersHtml =
    activeEquipo.length > 0
      ? activeEquipo
          .map((member, mIdx) => {
            const audDetail = auditorById.get(member.id_auditor);
            const qual = isAuditorQualifiedForAudit(audDetail, audit);
            return `
              <div
                data-testid="planner-site-auditor-row"
                class="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-slate-200 bg-white p-2.5"
              >
                <div class="flex flex-wrap items-center gap-2 min-w-0">
                  <span class="text-xs font-bold text-slate-900">${escapeHtml(member.auditor_nombre)}</span>
                  <span class="inline-flex px-2 py-0.5 rounded text-[10px] font-bold border ${qual.badgeClass}" title="${escapeHtml(qual.label)}">
                    ${escapeHtml(qual.label)}
                  </span>
                </div>

                <div class="flex flex-wrap items-center gap-2">
                  ${
                    canPlan
                      ? `
                        <select
                          data-action="change-planner-site-auditor-role"
                          data-audit-id="${escapeHtml(audit.id)}"
                          data-sitio-auditoria-id="${escapeHtml(sitePlan.id)}"
                          data-auditor-id="${escapeHtml(member.id_auditor)}"
                          data-days="${member.tiempo_auditoria}"
                          data-whole-site="${member.asignacion_completa_sitio ? 'true' : 'false'}"
                          data-focus-key="site-aud-role-${siteIndex}-${mIdx}"
                          aria-label="Rol de ${escapeHtml(member.auditor_nombre)} en ${escapeHtml(site.nombre_sitio)}"
                          class="px-2 py-1 bg-white border border-slate-300 rounded-lg text-[11px] font-semibold text-slate-800 focus:outline-none focus:border-indigo-500"
                        >
                          ${SITE_ROLE_SELECT_OPTIONS.map(
                            (opt) =>
                              `<option value="${opt.value}" ${
                                member.rol_auditor === opt.value ? 'selected' : ''
                              }>${escapeHtml(opt.label)}</option>`
                          ).join('')}
                        </select>

                        <div class="inline-flex items-center rounded-lg border border-slate-300 bg-white overflow-hidden">
                          <button
                            type="button"
                            data-action="step-planner-auditor-days"
                            data-delta="-0.25"
                            data-audit-id="${escapeHtml(audit.id)}"
                            data-sitio-auditoria-id="${escapeHtml(sitePlan.id)}"
                            data-auditor-id="${escapeHtml(member.id_auditor)}"
                            data-role="${escapeHtml(member.rol_auditor)}"
                            data-current-days="${member.tiempo_auditoria}"
                            data-whole-site="${member.asignacion_completa_sitio ? 'true' : 'false'}"
                            data-focus-key="site-aud-minus-${siteIndex}-${mIdx}"
                            aria-label="Restar 0.25 días a ${escapeHtml(member.auditor_nombre)} en ${escapeHtml(site.nombre_sitio)}"
                            class="px-2 py-1 text-xs font-mono font-bold text-slate-700 hover:bg-slate-100 border-r border-slate-200 cursor-pointer"
                          >
                            -0.25
                          </button>
                          <input
                            type="number"
                            step="0.25"
                            min="0"
                            value="${member.tiempo_auditoria.toFixed(2)}"
                            data-action="change-planner-auditor-days"
                            data-audit-id="${escapeHtml(audit.id)}"
                            data-sitio-auditoria-id="${escapeHtml(sitePlan.id)}"
                            data-auditor-id="${escapeHtml(member.id_auditor)}"
                            data-role="${escapeHtml(member.rol_auditor)}"
                            data-whole-site="${member.asignacion_completa_sitio ? 'true' : 'false'}"
                            data-focus-key="site-aud-days-${siteIndex}-${mIdx}"
                            aria-label="Días Cubo 2 de ${escapeHtml(member.auditor_nombre)} en ${escapeHtml(site.nombre_sitio)}"
                            class="w-16 px-1.5 py-1 text-center text-xs font-mono font-bold text-slate-900 focus:outline-none"
                          />
                          <button
                            type="button"
                            data-action="step-planner-auditor-days"
                            data-delta="0.25"
                            data-audit-id="${escapeHtml(audit.id)}"
                            data-sitio-auditoria-id="${escapeHtml(sitePlan.id)}"
                            data-auditor-id="${escapeHtml(member.id_auditor)}"
                            data-role="${escapeHtml(member.rol_auditor)}"
                            data-current-days="${member.tiempo_auditoria}"
                            data-whole-site="${member.asignacion_completa_sitio ? 'true' : 'false'}"
                            data-focus-key="site-aud-plus-${siteIndex}-${mIdx}"
                            aria-label="Sumar 0.25 días a ${escapeHtml(member.auditor_nombre)} en ${escapeHtml(site.nombre_sitio)}"
                            class="px-2 py-1 text-xs font-mono font-bold text-slate-700 hover:bg-slate-100 border-l border-slate-200 cursor-pointer"
                          >
                            +0.25
                          </button>
                        </div>

                        <button
                          type="button"
                          role="switch"
                          aria-checked="${member.asignacion_completa_sitio ? 'true' : 'false'}"
                          data-action="toggle-planner-whole-site"
                          data-audit-id="${escapeHtml(audit.id)}"
                          data-sitio-auditoria-id="${escapeHtml(sitePlan.id)}"
                          data-auditor-id="${escapeHtml(member.id_auditor)}"
                          data-role="${escapeHtml(member.rol_auditor)}"
                          data-days="${member.tiempo_auditoria}"
                          data-next-whole-site="${member.asignacion_completa_sitio ? 'false' : 'true'}"
                          data-focus-key="site-aud-whole-${siteIndex}-${mIdx}"
                          aria-label="Asignar a todo el Sitio para ${escapeHtml(member.auditor_nombre)}"
                          class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                            member.asignacion_completa_sitio
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                              : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-indigo-50/60 hover:border-indigo-300'
                          }"
                        >
                          <span aria-hidden="true">${member.asignacion_completa_sitio ? '✓' : '○'}</span>
                          <span>Asignar a todo el Sitio</span>
                        </button>

                        <button
                          type="button"
                          data-action="remove-planner-site-auditor"
                          data-equipo-sitio-id="${escapeHtml(member.id)}"
                          data-audit-id="${escapeHtml(audit.id)}"
                          data-focus-key="site-aud-remove-${siteIndex}-${mIdx}"
                          aria-label="Retirar a ${escapeHtml(member.auditor_nombre)} del sitio ${escapeHtml(site.nombre_sitio)}"
                          class="px-2 py-1 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-semibold cursor-pointer"
                        >
                          Retirar
                        </button>
                      `
                      : `
                        <span class="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold border bg-slate-50 text-slate-800 border-slate-200">
                          ${escapeHtml(formatPlannerSiteRole(member.rol_auditor))}
                        </span>
                        <span class="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-900">
                          ${member.tiempo_auditoria.toFixed(2)} d
                        </span>
                        <span class="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          member.asignacion_completa_sitio
                            ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                        }">
                          ${member.asignacion_completa_sitio ? 'Todo el sitio' : 'Por proceso (M:N)'}
                        </span>
                      `
                  }
                </div>
              </div>
            `;
          })
          .join('')
      : `
        <div class="rounded-xl border border-dashed border-slate-300 bg-white/80 p-3 text-xs text-slate-500">
          Sin auditores asignados en este sitio todavía (Cubo 2 = 0.00 d).
        </div>
      `;

  const remainingDays = Math.max(0, Number((siteBal.demandedDays - siteBal.assignedDays).toFixed(2)));
  const defaultNewDays = remainingDays > 0 ? remainingDays : siteBal.demandedDays > 0 ? siteBal.demandedDays : 0.25;

  const addAuditorBarHtml = canPlan
    ? `
      <div class="rounded-xl border border-indigo-200/80 bg-indigo-50/40 p-2.5 space-y-2">
        <div class="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
          <div class="md:col-span-5 space-y-1">
            <label class="block text-[10px] font-bold uppercase tracking-wider text-slate-600">
              Auditor Disponible
            </label>
            <select
              data-planner-add-auditor-select="${escapeHtml(sitePlan.id)}"
              aria-label="Seleccionar auditor para añadir a ${escapeHtml(site.nombre_sitio)}"
              class="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
            >
              <option value="">Seleccione auditor...</option>
              ${addableAuditors
                .map((aud) => {
                  const qual = isAuditorQualifiedForAudit(aud, audit);
                  return `<option value="${escapeHtml(aud.id)}">${escapeHtml(
                    `${aud.nombre} (${qual.qualified ? '✓ Calificado' : '⚠️ Sin calificación completa'})`
                  )}</option>`;
                })
                .join('')}
            </select>
          </div>

          <div class="md:col-span-3 space-y-1">
            <label class="block text-[10px] font-bold uppercase tracking-wider text-slate-600">
              Rol en Sitio
            </label>
            <select
              data-planner-add-role-select="${escapeHtml(sitePlan.id)}"
              aria-label="Rol inicial del auditor en ${escapeHtml(site.nombre_sitio)}"
              class="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
            >
              ${SITE_ROLE_SELECT_OPTIONS.map(
                (opt) =>
                  `<option value="${opt.value}" ${
                    opt.value === (activeEquipo.length === 0 ? 'AUDITOR_LIDER' : 'AUDITOR')
                      ? 'selected'
                      : ''
                  }>${escapeHtml(opt.label)}</option>`
              ).join('')}
            </select>
          </div>

          <div class="md:col-span-2 space-y-1">
            <label class="block text-[10px] font-bold uppercase tracking-wider text-slate-600">
              Días (0.25d)
            </label>
            <input
              type="number"
              step="0.25"
              min="0"
              value="${defaultNewDays.toFixed(2)}"
              data-planner-add-days-input="${escapeHtml(sitePlan.id)}"
              aria-label="Días iniciales para añadir auditor en ${escapeHtml(site.nombre_sitio)}"
              class="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div class="md:col-span-2">
            <button
              type="button"
              data-action="add-planner-site-auditor"
              data-audit-id="${escapeHtml(audit.id)}"
              data-sitio-auditoria-id="${escapeHtml(sitePlan.id)}"
              data-focus-key="site-add-aud-${siteIndex}"
              class="w-full px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors cursor-pointer"
            >
              + Añadir
            </button>
          </div>
        </div>

        <label class="inline-flex items-center gap-2 text-[11px] font-semibold text-indigo-950 cursor-pointer select-none">
          <input
            type="checkbox"
            data-planner-add-whole-check="${escapeHtml(sitePlan.id)}"
            checked
            class="h-3.5 w-3.5 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span>Modo rápido: Asignar a todo el Sitio (cubre automáticamente todos los procesos del sitio)</span>
        </label>
      </div>
    `
    : '';

  return `
    <div class="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2.5">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-xs font-bold text-slate-900">
          👥 Equipo en este Sitio y Días Asignados (Cubo 2)
        </span>
        <span class="font-mono text-[11px] font-bold px-2 py-0.5 rounded border ${
          siteBal.isBalanced
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : 'bg-rose-50 text-rose-800 border-rose-200'
        }">
          Cubo 2: ${siteBal.assignedDays.toFixed(2)} d / Cubo 1: ${siteBal.demandedDays.toFixed(2)} d
        </span>
      </div>
      <div class="space-y-2">
        ${membersHtml}
      </div>
      ${addAuditorBarHtml}
    </div>
  `;
}

/**
 * Step 4.1.2 (Parte 2) — Constructor Visual Tipo Árbol / Acordeón
 * (`Certificado → Sitios → Procesos del Sitio → 1..N Turnos → Auditores + Días 0.25d`).
 * Estricto `0 any`, Zero-UUID, cero inline `style=` y XSS-safe (`escapeHtml`).
 */
export function renderAuditPlannerTree(params: AuditPlannerTreeParams): string {
  const {
    audit,
    certDetail = null,
    planSites,
    allAuditors,
    filterQualifiedOnly,
    expandedSiteIds,
    canPlan,
    canNavigateToSite = canPlan,
  } = params;

  const certSites = resolveCertificateSitesForTree(audit, certDetail, planSites);
  const expandedSet = new Set(expandedSiteIds || []);
  const planBySiteId = new Map<string, AuditoriaSitioPlanItem>();
  for (const sp of planSites) {
    if (!sp.deleted_at) {
      planBySiteId.set(sp.id_sitio, sp);
    }
  }

  const auditorById = new Map(allAuditors.map((a) => [a.id, a]));
  const eligibleCandidates = filterQualifiedOnly
    ? allAuditors.filter((a) => isAuditorQualifiedForAudit(a, audit).qualified)
    : [...allAuditors];

  if (certSites.length === 0) {
    return `
      <section
        data-testid="audit-planner-tree"
        aria-label="Constructor Visual del Plan de Auditoría"
        class="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center space-y-2"
      >
        <div class="text-xs font-bold text-slate-800">
          El certificado ${escapeHtml(audit.numero_certificado)} no registra sedes operativas todavía.
        </div>
        <p class="text-[11px] text-slate-500">
          Cree al menos la Sede Principal (Sitio 0) en Certificación para planificar días, procesos y equipo.
        </p>
      </section>
    `;
  }

  const siteNodesHtml = certSites
    .map((site, siteIndex) => {
      const sitePlan = planBySiteId.get(site.id);
      const isIncluded = Boolean(sitePlan);
      const isExpanded = expandedSet.has(site.id);
      const siteTag = site.numero_sitio === 0 ? 'Sitio 0 (HQ)' : `Sitio #${site.numero_sitio}`;
      const siteProcesses = resolveSiteProcesosPorSitio(site);
      const siteTurnos = resolveSiteTurnosPorSitio(site);

      let siteHeaderControlsHtml = '';
      if (isIncluded && sitePlan) {
        const siteBal = computeSiteDayBalance(sitePlan);
        const siteCompleteness = evaluateSitePlanningCompleteness(sitePlan);
        const balanceBadgeText =
          siteBal.demandedDays === 0 && siteBal.assignedDays === 0
            ? 'Sin días'
            : siteBal.isBalanced
              ? 'Cuadrado ✓'
              : siteBal.delta < 0
                ? `Faltan ${Math.abs(siteBal.delta).toFixed(2)} d`
                : `Exceso +${siteBal.delta.toFixed(2)} d`;
        const balanceBadgeClass =
          siteBal.demandedDays === 0 && siteBal.assignedDays === 0
            ? 'bg-amber-50 text-amber-800 border-amber-200'
            : siteBal.isBalanced
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200';
        const activeModalidad: SiteEvaluationModality =
          sitePlan.modalidad_evaluacion || 'Presencial';

        siteHeaderControlsHtml = `
          ${
            canPlan
              ? `
                <div class="inline-flex items-center rounded-lg border border-slate-300 bg-white overflow-hidden">
                  <button
                    type="button"
                    data-action="step-planner-site-days"
                    data-delta="-0.25"
                    data-audit-id="${escapeHtml(audit.id)}"
                    data-sitio-id="${escapeHtml(site.id)}"
                    data-sitio-auditoria-id="${escapeHtml(sitePlan.id)}"
                    data-current-days="${sitePlan.tiempo_auditoria}"
                    data-modalidad="${escapeHtml(activeModalidad)}"
                    data-focus-key="site-minus-${siteIndex}"
                    aria-label="Restar 0.25 días a ${escapeHtml(site.nombre_sitio)}"
                    class="px-2 py-1 text-xs font-mono font-bold text-slate-700 hover:bg-slate-100 border-r border-slate-200 cursor-pointer"
                  >
                    -0.25
                  </button>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    value="${sitePlan.tiempo_auditoria.toFixed(2)}"
                    data-action="change-planner-site-days"
                    data-audit-id="${escapeHtml(audit.id)}"
                    data-sitio-id="${escapeHtml(site.id)}"
                    data-sitio-auditoria-id="${escapeHtml(sitePlan.id)}"
                    data-modalidad="${escapeHtml(activeModalidad)}"
                    data-focus-key="site-days-${siteIndex}"
                    aria-label="Días Cubo 1 para ${escapeHtml(site.nombre_sitio)}"
                    class="w-16 px-1.5 py-1 text-center text-xs font-mono font-bold text-slate-900 focus:outline-none"
                  />
                  <button
                    type="button"
                    data-action="step-planner-site-days"
                    data-delta="0.25"
                    data-audit-id="${escapeHtml(audit.id)}"
                    data-sitio-id="${escapeHtml(site.id)}"
                    data-sitio-auditoria-id="${escapeHtml(sitePlan.id)}"
                    data-current-days="${sitePlan.tiempo_auditoria}"
                    data-modalidad="${escapeHtml(activeModalidad)}"
                    data-focus-key="site-plus-${siteIndex}"
                    aria-label="Sumar 0.25 días a ${escapeHtml(site.nombre_sitio)}"
                    class="px-2 py-1 text-xs font-mono font-bold text-slate-700 hover:bg-slate-100 border-l border-slate-200 cursor-pointer"
                  >
                    +0.25
                  </button>
                </div>

                <select
                  data-action="change-planner-site-modality"
                  data-audit-id="${escapeHtml(audit.id)}"
                  data-sitio-id="${escapeHtml(site.id)}"
                  data-sitio-auditoria-id="${escapeHtml(sitePlan.id)}"
                  data-current-days="${sitePlan.tiempo_auditoria}"
                  data-focus-key="site-mod-${siteIndex}"
                  aria-label="Modalidad en ${escapeHtml(site.nombre_sitio)}"
                  class="px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:border-indigo-500"
                >
                  ${SITE_MODALITY_OPTIONS.map(
                    (mod) =>
                      `<option value="${mod}" ${
                        activeModalidad === mod ? 'selected' : ''
                      }>${mod}</option>`
                  ).join('')}
                </select>
              `
              : `
                <span class="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-900">
                  Cubo 1: ${sitePlan.tiempo_auditoria.toFixed(2)} d
                </span>
                <span class="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold border bg-slate-50 text-slate-700 border-slate-200">
                  ${escapeHtml(activeModalidad)}
                </span>
              `
          }

          <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${balanceBadgeClass}">
            <span>${escapeHtml(balanceBadgeText)}</span>
            <span class="font-mono text-[10px] opacity-80">(${siteBal.assignedDays.toFixed(2)}/${siteBal.demandedDays.toFixed(2)}d)</span>
          </span>

          ${
            !siteCompleteness.isComplete
              ? `<span class="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">${siteCompleteness.completeProcesses}/${siteCompleteness.totalProcesses} proc. listos</span>`
              : ''
          }

          <button
            type="button"
            data-action="open-sitio-auditoria"
            data-sitio-auditoria-id="${escapeHtml(sitePlan.id)}"
            data-program-id="${escapeHtml(audit.id_programa_auditoria || '')}"
            data-audit-id="${escapeHtml(audit.id)}"
            class="px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-indigo-50 hover:border-indigo-200 text-[11px] font-semibold text-indigo-700 cursor-pointer"
          >
            Ficha Sitio →
          </button>
        `;
      }

      let expandedBodyHtml = '';
      if (isExpanded) {
        if (!isIncluded || !sitePlan) {
          expandedBodyHtml = `
            <div class="p-3.5 border-t border-slate-200 bg-slate-50/70 text-xs text-slate-600 flex flex-wrap items-center justify-between gap-2">
              <span>
                ${
                  canPlan
                    ? 'Este sitio del certificado no está incluido en esta auditoría. Active el interruptor para planificar días (Cubo 1), procesos, turnos y auditores.'
                    : 'Este sitio no fue incluido en el alcance de esta auditoría.'
                }
              </span>
            </div>
          `;
        } else {
          const activeEquipo = (sitePlan.equipoSitio || []).filter((m) => !m.deleted_at);
          const activePlanProcs = (sitePlan.procesos || []).filter((p) => !p.deleted_at);

          let nivel2ProcessesHtml = '';
          if (siteProcesses.length === 0) {
            nivel2ProcessesHtml = `
              <div
                data-testid="empty-site-processes-guard"
                role="status"
                class="rounded-xl border border-amber-300 bg-amber-50 p-3 flex flex-wrap items-center justify-between gap-2.5 text-xs text-amber-950"
              >
                <div class="space-y-0.5">
                  <div class="font-bold">⚠️ Este sitio aún no tiene procesos vinculados en su ficha operativa.</div>
                  <div class="text-[11px] text-amber-900">
                    Vincule procesos en la configuración del Sitio (Certificación) para poder seleccionarlos en la auditoría.
                  </div>
                </div>
                ${
                  canNavigateToSite
                    ? `
                      <button
                        type="button"
                        data-action="select-sitio"
                        data-sitio-id="${escapeHtml(site.id)}"
                        data-cert-id="${escapeHtml(audit.id_certificado)}"
                        data-target-tab="procesos"
                        class="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors cursor-pointer shrink-0"
                      >
                        → Ir al Sitio
                      </button>
                    `
                    : ''
                }
              </div>
            `;
          } else {
            nivel2ProcessesHtml = `
              <div class="space-y-2">
                ${siteProcesses
                  .map((pps, procIndex) => {
                    const activePsa = activePlanProcs.find(
                      (p) =>
                        p.id_procesos_por_sitio === pps.id || p.id_proceso === pps.id_proceso
                    );
                    return renderProcessCardHtml({
                      audit,
                      site,
                      sitePlan,
                      pps,
                      activePsa,
                      siteTurnos,
                      activeEquipo,
                      eligibleCandidates,
                      auditorById,
                      siteIndex,
                      procIndex,
                      canPlan,
                      canNavigateToSite,
                    });
                  })
                  .join('')}
              </div>
            `;
          }

          const nivel3TeamHtml = renderSiteTeamBucket2SectionHtml({
            audit,
            site,
            sitePlan,
            activeEquipo,
            eligibleCandidates,
            auditorById,
            siteIndex,
            canPlan,
          });

          expandedBodyHtml = `
            <div class="p-3 sm:p-3.5 border-t border-slate-200 bg-slate-50/40 space-y-3">
              ${nivel3TeamHtml}

              <div class="space-y-2">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <span class="text-xs font-bold text-slate-900">
                    ⚙️ Procesos del Sitio, Turnos (1..N) y Cobertura Granular (${activePlanProcs.length}/${siteProcesses.length} en alcance)
                  </span>
                </div>
                ${nivel2ProcessesHtml}
              </div>
            </div>
          `;
        }
      }

      return `
        <article
          data-testid="planner-site-node"
          data-site-id="${escapeHtml(site.id)}"
          class="rounded-xl border overflow-hidden transition-colors ${
            isIncluded
              ? 'border-indigo-200 bg-white shadow-2xs'
              : 'border-slate-200 bg-slate-50/60'
          }"
        >
          <div class="p-3 flex flex-wrap items-center justify-between gap-2.5 bg-white">
            <div class="flex items-start gap-2.5 min-w-0">
              <button
                type="button"
                data-action="toggle-planner-site-expand"
                data-sitio-id="${escapeHtml(site.id)}"
                data-focus-key="site-expand-${siteIndex}"
                aria-expanded="${isExpanded ? 'true' : 'false'}"
                aria-label="Expandir o contraer ${escapeHtml(siteTag)} ${escapeHtml(site.nombre_sitio)}"
                class="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer shrink-0"
              >
                ${isExpanded ? '▾' : '▸'}
              </button>

              <div class="min-w-0 space-y-0.5">
                <div class="flex flex-wrap items-center gap-1.5">
                  <span class="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                    site.numero_sitio === 0
                      ? 'bg-indigo-100 text-indigo-900 border-indigo-200'
                      : 'bg-slate-100 text-slate-700 border-slate-200'
                  }">
                    ${escapeHtml(siteTag)}
                  </span>
                  <span class="text-xs font-bold text-slate-900">${escapeHtml(site.nombre_sitio)}</span>
                  <span class="text-[11px] text-slate-500">
                    · ${siteProcesses.length} proceso${siteProcesses.length === 1 ? '' : 's'} · ${siteTurnos.length} turno${siteTurnos.length === 1 ? '' : 's'}
                  </span>
                </div>
                ${
                  site.direccion_sitio
                    ? `<div class="text-[11px] text-slate-500 truncate" title="${escapeHtml(site.direccion_sitio)}">${escapeHtml(site.direccion_sitio)}</div>`
                    : ''
                }
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              ${
                canPlan
                  ? `
                    <label class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-pointer select-none ${
                      isIncluded
                        ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                        : 'bg-slate-100 text-slate-700 border-slate-200'
                    }">
                      <input
                        type="checkbox"
                        role="switch"
                        aria-checked="${isIncluded ? 'true' : 'false'}"
                        data-action="toggle-planner-site"
                        data-audit-id="${escapeHtml(audit.id)}"
                        data-sitio-id="${escapeHtml(site.id)}"
                        data-sitio-auditoria-id="${escapeHtml(sitePlan?.id || '')}"
                        data-focus-key="site-include-${siteIndex}"
                        aria-label="Incluir ${escapeHtml(site.nombre_sitio)} en la auditoría"
                        ${isIncluded ? 'checked' : ''}
                        class="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                      <span>${isIncluded ? 'Incluido' : 'Incluir'}</span>
                    </label>
                  `
                  : `
                    <span class="inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                      isIncluded
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }">
                      ${isIncluded ? 'Incluido' : 'No Incluido'}
                    </span>
                  `
              }
              ${siteHeaderControlsHtml}
            </div>
          </div>

          ${expandedBodyHtml}
        </article>
      `;
    })
    .join('');

  return `
    <section
      data-testid="audit-planner-tree"
      aria-label="Constructor Visual del Plan de Auditoría"
      class="space-y-3"
    >
      <div class="flex flex-wrap items-center justify-between gap-2 px-1">
        <div class="text-xs font-bold text-slate-800">
          🌳 Árbol de Planificación Operativa (${certSites.length} sede${certSites.length === 1 ? '' : 's'} del certificado)
        </div>
        <div class="text-[11px] text-slate-500">
          Certificado → Sitios → Procesos del Sitio → Turnos (1..N) → Auditores + Días (0.25d)
        </div>
      </div>
      <div class="space-y-2.5">
        ${siteNodesHtml}
      </div>
    </section>
  `;
}

