import { escapeHtml } from '../lib/html';
import type { AuditorDetailEntity } from '../lib/competencyMatrix';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
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
  resolveLatestAuditDate,
  type AuditDateEntry,
  type AuditLinkNature,
  type AuditPlanningStatusResult,
  type ProgramaAuditoriaEntity,
} from '../lib/auditPlanningEngine';
import { isAuditorQualifiedForAudit } from './sitioAuditoriaView';

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
                  return `
                    <button
                      type="button"
                      data-action="open-history-cycle"
                      data-program-id="${escapeHtml(cycle.programId)}"
                      data-audit-id="${escapeHtml(cycle.auditId)}"
                      title="Abrir ciclo histórico ${escapeHtml(cycle.codigo_auditoria)}"
                      class="w-full text-left rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/30 p-3 transition-colors cursor-pointer space-y-1.5"
                    >
                      <div class="flex flex-wrap items-center justify-between gap-2">
                        <div class="flex flex-wrap items-center gap-1.5 min-w-0">
                          <span class="font-mono text-xs font-bold text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                            ${escapeHtml(cycle.codigo_auditoria)}
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
