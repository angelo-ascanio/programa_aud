/**
 * Step 8.1 — `Programa`: Lógica Pura Multi-Anual por Certificado / Sitio / Proceso / Turnos.
 *
 * - Compuerta de entrada: auditorías individuales que completaron Paso 3 (`Tipo`) AND Paso 4 (`Sitio`),
 *   ejecutándose en paralelo con Pasos 5 (`Temporal`), 6 (`Tiempo`) y 7 (`Asignación`).
 * - Restricción estricta a procesos enlazados en `procesos_por_sitio` activos por `id_sitio`.
 * - Motor histórico y futuro por proceso (`"Nunca auditado"`, `"Hace N años"`, `"Auditado X de Y veces"`,
 *   y celdas por visita `cycleCells` con turnos y auditores para el drawer colapsable).
 * - Acciones rápidas de selección (`'MEDULARES'`, `'NO_AUDITADOS_ULTIMO'`, `'COPIAR_ANTERIOR'`).
 *
 * Strictly typed (`strict: true`, 0 `any` / `as any`) and Zero-UUID compliant
 * in all user-facing labels.
 */

import {
  resolveAuditCycleStatus,
  resolveLatestPlannedDate,
  resolveLatestRealExecutionDate,
  type AuditoriaSitioPlanItem,
  type AuditoriaTurnoProcesoLink,
  type ProgramaAuditoriaEntity,
} from './auditPlanningEngine';
import type { ProgramacionAuditEntity } from './auditExecution';
import type {
  CertificadoDetailEntity,
  NonApplicableRequirementEntity,
  ProcessEntity,
  TurnoPorSitioLink,
} from './multisiteSampling';
import type { ProcesoPorSitioLink } from './sitioDomain';
import { resolveCertVersionSnapshotForAudit } from './certificadoVersionDomain';
import { resolveEffectivePlannedWindow } from './designacionTipoDomain';
import {
  buildCertificateMultiViewRows,
  type BuildCertificateMultiViewRowsParams,
  type CertificateMultiViewRow,
} from './certificateAuditSelector';

export type ProgramaCertCompletionState =
  | 'PENDIENTE_PROCESOS'
  | 'PENDIENTE_TURNOS'
  | 'COMPLETO';

export type QuickProcessSelectionPreset =
  | 'MEDULARES'
  | 'NO_AUDITADOS_ULTIMO'
  | 'COPIAR_ANTERIOR';

export type CandidateProcessEntity = ProcessEntity & {
  deleted_at?: string | null;
};

export interface ProcessCycleCell {
  auditId: string;
  yearLabel: string;
  auditType: string;
  isCurrent: boolean;
  isFuture: boolean;
  included: boolean;
  shiftLabels: string[];
  auditorNames: string[];
}

export interface ProcessHistoryRow {
  ppsLink: ProcesoPorSitioLink;
  proceso: CandidateProcessEntity;
  isSelectedNow: boolean;
  currentProcesoSitioAuditoriaId: string | null;
  assignedShiftIds: string[];
  neverAudited: boolean;
  notAuditedInLastVisit: boolean;
  lastAuditedText: string;
  timesAuditedInCycle: number;
  totalVisitsInCycle: number;
  cycleCells: ProcessCycleCell[];
  currentAuditIndex: number;
}

export interface AuditProgramaSummaryRow {
  audit: ProgramacionAuditEntity;
  program: ProgramaAuditoriaEntity | null;
  selectedSitesCount: number;
  totalConfiguredProcesses: number;
  sitesMissingProcesses: number;
  processesMissingShifts: number;
  totalAssignedShifts: number;
  completionState: ProgramaCertCompletionState;
  neverAuditedEligibleCount: number;
}

function getAuditOrderInfo(audit: ProgramacionAuditEntity): {
  sortKey: string;
  yearLabel: string;
  yearNum: number;
  isExecuted: boolean;
} {
  const hasActiveFechas = Boolean(audit.fechas && audit.fechas.some((f) => !f.deleted_at));
  const real = hasActiveFechas
    ? resolveLatestRealExecutionDate(audit.fechas)
    : audit.latestDate && !audit.latestDate.deleted_at && audit.latestDate.tipo_fecha === 'REAL'
      ? audit.latestDate
      : null;

  if (real?.fecha_inicio) {
    const parsedYear = Number(real.fecha_inicio.slice(0, 4));
    return {
      sortKey: real.fecha_inicio,
      yearLabel: real.fecha_inicio.slice(0, 4),
      yearNum: Number.isFinite(parsedYear) ? parsedYear : 9999,
      isExecuted: true,
    };
  }

  const cycleStatus = resolveAuditCycleStatus(audit.estado_ciclo, audit.estatus);
  const estatusNormalized = (audit.estatus || '').trim().toLowerCase();
  const isClosed =
    cycleStatus === 'Auditada' ||
    String(cycleStatus) === 'Cerrada' ||
    estatusNormalized === 'cerrada' ||
    estatusNormalized === 'cerrado';

  const planned = hasActiveFechas
    ? resolveLatestPlannedDate(audit.fechas)
    : audit.latestDate && !audit.latestDate.deleted_at && audit.latestDate.tipo_fecha !== 'REAL'
      ? audit.latestDate
      : null;

  const win = resolveEffectivePlannedWindow(planned);
  if (win.startIso && win.year) {
    return {
      sortKey: win.startIso,
      yearLabel: String(win.year),
      yearNum: win.year,
      isExecuted: isClosed,
    };
  }

  if (audit.fecha_inicio && /^\d{4}-\d{2}-\d{2}$/.test(audit.fecha_inicio.trim())) {
    const iso = audit.fecha_inicio.trim();
    const parsedYear = Number(iso.slice(0, 4));
    return {
      sortKey: iso,
      yearLabel: iso.slice(0, 4),
      yearNum: Number.isFinite(parsedYear) ? parsedYear : 9999,
      isExecuted: isClosed,
    };
  }

  return {
    sortKey: '9999-12-31',
    yearLabel: 'S/F',
    yearNum: 9999,
    isExecuted: isClosed,
  };
}

function formatShiftLabel(link: AuditoriaTurnoProcesoLink): string {
  const desc = (link.descripcion_turno || '').trim();
  const start = (link.hora_entrada || '').trim().slice(0, 5);
  const end = (link.hora_salida || '').trim().slice(0, 5);
  const range = start && end ? `${start}–${end}` : '';
  if (desc && range) return `${desc} (${range})`;
  if (desc) return desc;
  if (range) return range;
  return 'Turno asignado';
}

function hasStep3Completed(audit: ProgramacionAuditEntity): boolean {
  return (
    Boolean(audit.id_tipo_auditoria) &&
    ((audit.fechas || []).some((f) => !f.deleted_at && f.tipo_fecha !== 'REAL') ||
      Boolean(audit.latestDate))
  );
}

/**
 * Construye la matriz histórica y futura de procesos elegibles para un sitio en auditoría:
 * - Restringe estrictamente a vínculos activos de `procesos_por_sitio` del `sitePlan.id_sitio`.
 * - Recorre todas las auditorías activas no canceladas del mismo `id_certificado`.
 * - Calcula frecuencia en el ciclo, última ejecución (`"Nunca auditado"`, `"Hace N años"`, etc.)
 *   y celdas por visita (`cycleCells`) con turnos y equipo asignado por proceso.
 */
function procesoBelongsToCert(
  proc: CandidateProcessEntity,
  certId: string
): boolean {
  if (proc.id_certificado === certId) return true;
  if (proc.sharedFromCertId) return true;
  if (proc.sharedTargets?.some((st) => st.targetCertId === certId)) return true;
  if (proc.requisitos_by_certificado?.[certId]) return true;
  return false;
}

export function buildProcessHistoryForSite(
  currentAudit: ProgramacionAuditEntity,
  sitePlan: AuditoriaSitioPlanItem,
  siteProcesses: ReadonlyArray<ProcesoPorSitioLink>,
  allProcesses: ReadonlyArray<CandidateProcessEntity>,
  allAudits: ReadonlyArray<ProgramacionAuditEntity>
): ProcessHistoryRow[] {
  const processById = new Map<string, CandidateProcessEntity>(
    allProcesses
      .filter(
        (p) =>
          !p.deleted_at &&
          (!currentAudit.id_certificado ||
            procesoBelongsToCert(p, currentAudit.id_certificado))
      )
      .map((p) => [p.id, p])
  );

  const candidateAudits = allAudits.some((a) => a.id === currentAudit.id)
    ? allAudits
    : [...allAudits, currentAudit];

  const certAudits = candidateAudits
    .filter((a) => {
      if (a.deleted_at) return false;
      if (a.id_certificado !== currentAudit.id_certificado) return false;
      const cycleStatus = resolveAuditCycleStatus(a.estado_ciclo, a.estatus);
      return cycleStatus !== 'Cancelada';
    })
    .map((a) => ({ audit: a, ord: getAuditOrderInfo(a) }))
    .sort((x, y) => {
      const cmp = x.ord.sortKey.localeCompare(y.ord.sortKey);
      if (cmp !== 0) return cmp;
      return x.audit.codigo_auditoria.localeCompare(y.audit.codigo_auditoria);
    });

  const currentIdxRaw = certAudits.findIndex((item) => item.audit.id === currentAudit.id);
  const currentIdx = currentIdxRaw >= 0 ? currentIdxRaw : 0;
  const currentOrd = certAudits[currentIdx]?.ord ?? getAuditOrderInfo(currentAudit);

  const lastExecutedBeforeCurrent = certAudits
    .slice(0, currentIdx)
    .reverse()
    .find((item) => item.ord.isExecuted);

  const activeSiteProcesos = (sitePlan.procesos || []).filter((ps) => !ps.deleted_at);
  const selectedByPpsId = new Map(
    activeSiteProcesos
      .filter((ps) => Boolean(ps.id_procesos_por_sitio))
      .map((ps) => [ps.id_procesos_por_sitio, ps])
  );
  const selectedByProcessId = new Map(
    activeSiteProcesos.map((ps) => [ps.id_proceso, ps])
  );

  const activeLinks = siteProcesses.filter(
    (l) =>
      !l.deleted_at &&
      (!l.id_certificado || l.id_certificado === currentAudit.id_certificado) &&
      l.id_sitio === sitePlan.id_sitio &&
      processById.has(l.id_proceso)
  );

  return activeLinks.map((pps) => {
    const proc = processById.get(pps.id_proceso)!;
    const currentPs =
      selectedByPpsId.get(pps.id) ?? selectedByProcessId.get(pps.id_proceso) ?? null;

    let lastAuditedText = 'Nunca auditado';
    let neverAudited = true;
    let auditedCount = 0;

    const cycleCells: ProcessCycleCell[] = certAudits.map((entry, idx) => {
      const a = entry.audit;
      const isCurrent = a.id === currentAudit.id;
      const isFuture = !isCurrent && idx > currentIdx;

      const matchingSite = (a.sitiosPlan || []).find(
        (sp) => !sp.deleted_at && sp.id_sitio === sitePlan.id_sitio
      );
      const matchingProc = (matchingSite?.procesos || []).find(
        (pr) =>
          !pr.deleted_at &&
          (pr.id_procesos_por_sitio === pps.id || pr.id_proceso === proc.id)
      );
      const included = Boolean(matchingProc);
      const shiftLabels = (matchingProc?.turnos || [])
        .filter((t) => !t.deleted_at)
        .map((t) => formatShiftLabel(t));
      const auditorNames = (matchingProc?.equipoProceso || [])
        .filter((e) => !e.deleted_at)
        .map((e) => (e.auditor_nombre || '').trim())
        .filter((name) => name.length > 0);

      if (included && entry.ord.isExecuted && !isCurrent && !isFuture) {
        auditedCount += 1;
        neverAudited = false;
        if (entry.ord.yearNum < 9999) {
          const currentYearRef =
            currentOrd.yearNum < 9999 ? currentOrd.yearNum : new Date().getUTCFullYear();
          const yearsDiff = Math.max(0, currentYearRef - entry.ord.yearNum);
          const agoLabel =
            yearsDiff === 0
              ? 'Este año'
              : yearsDiff === 1
                ? 'Hace 1 año'
                : `Hace ${yearsDiff} años`;
          lastAuditedText = `${agoLabel} (${a.tipo_auditoria} · ${entry.ord.yearLabel})`;
        } else {
          lastAuditedText = `${a.tipo_auditoria} · ${entry.ord.yearLabel}`;
        }
      } else if (included && isCurrent && entry.ord.isExecuted) {
        auditedCount += 1;
        neverAudited = false;
      }

      return {
        auditId: a.id,
        yearLabel: entry.ord.yearLabel,
        auditType: a.tipo_auditoria,
        isCurrent,
        isFuture,
        included,
        shiftLabels,
        auditorNames,
      };
    });

    let notAuditedInLastVisit = true;
    if (lastExecutedBeforeCurrent) {
      const prevCell = cycleCells.find((c) => c.auditId === lastExecutedBeforeCurrent.audit.id);
      notAuditedInLastVisit = !(prevCell?.included);
    }

    return {
      ppsLink: pps,
      proceso: proc,
      isSelectedNow: Boolean(currentPs),
      currentProcesoSitioAuditoriaId: currentPs?.id || null,
      assignedShiftIds: (currentPs?.turnos || [])
        .filter((t) => !t.deleted_at)
        .map((t) => t.id_turnos_sitio_auditoria),
      neverAudited,
      notAuditedInLastVisit,
      lastAuditedText,
      timesAuditedInCycle: auditedCount,
      totalVisitsInCycle: certAudits.length,
      cycleCells,
      currentAuditIndex: currentIdx,
    };
  });
}

/**
 * Calcula el delta de IDs de `procesos_por_sitio` aún no seleccionados en la visita actual
 * según el preset rápido solicitado:
 * - `'MEDULARES'`: procesos con `tipo === 'Medular'`.
 * - `'NO_AUDITADOS_ULTIMO'`: procesos marcados como `neverAudited` o `notAuditedInLastVisit`.
 * - `'COPIAR_ANTERIOR'`: procesos incluidos en la visita inmediatamente anterior de la línea de ciclo.
 */
export function computeQuickProcessSelectionIds(
  rows: ReadonlyArray<ProcessHistoryRow>,
  preset: QuickProcessSelectionPreset
): string[] {
  const unselected = rows.filter((r) => !r.isSelectedNow);
  if (preset === 'MEDULARES') {
    return unselected
      .filter((r) => r.proceso.tipo === 'Medular')
      .map((r) => r.ppsLink.id);
  }
  if (preset === 'NO_AUDITADOS_ULTIMO') {
    return unselected
      .filter((r) => r.neverAudited || r.notAuditedInLastVisit)
      .map((r) => r.ppsLink.id);
  }
  return unselected
    .filter((r) => {
      const prevIdx = r.currentAuditIndex - 1;
      return prevIdx >= 0 && r.cycleCells[prevIdx]?.included === true;
    })
    .map((r) => r.ppsLink.id);
}

/**
 * Construye el resumen por auditoría/certificado para Paso 8 (`Programa`),
 * aplicando estrictamente la compuerta de entrada Paso 3 (`Tipo`) AND Paso 4 (`Sitio`),
 * y clasificando cada registro en `'PENDIENTE_PROCESOS' | 'PENDIENTE_TURNOS' | 'COMPLETO'`.
 */
export function buildAuditProgramaSummaryRows(
  audits: ReadonlyArray<ProgramacionAuditEntity>,
  programs: ReadonlyArray<ProgramaAuditoriaEntity>,
  allProcessesPorSitio: ReadonlyArray<ProcesoPorSitioLink>,
  allProcesses: ReadonlyArray<CandidateProcessEntity>
): AuditProgramaSummaryRow[] {
  const programById = new Map(
    programs.filter((p) => !p.deleted_at).map((p) => [p.id, p])
  );
  const result: AuditProgramaSummaryRow[] = [];

  for (const audit of audits) {
    if (audit.deleted_at) continue;
    const activeSites = (audit.sitiosPlan || []).filter((s) => !s.deleted_at);
    if (!hasStep3Completed(audit) || activeSites.length === 0) continue;

    let sitesMissingProcesses = 0;
    let totalConfiguredProcesses = 0;
    let processesMissingShifts = 0;
    let totalAssignedShifts = 0;
    let neverAuditedEligibleCount = 0;

    for (const sp of activeSites) {
      const activeProcs = (sp.procesos || []).filter((p) => !p.deleted_at);
      if (activeProcs.length === 0) sitesMissingProcesses += 1;
      totalConfiguredProcesses += activeProcs.length;

      for (const proc of activeProcs) {
        const shifts = (proc.turnos || []).filter((t) => !t.deleted_at);
        if (shifts.length === 0) processesMissingShifts += 1;
        totalAssignedShifts += shifts.length;
      }

      const history = buildProcessHistoryForSite(
        audit,
        sp,
        allProcessesPorSitio,
        allProcesses,
        audits
      );
      neverAuditedEligibleCount += history.filter((h) => h.neverAudited).length;
    }

    const completionState: ProgramaCertCompletionState =
      sitesMissingProcesses > 0 || totalConfiguredProcesses === 0
        ? 'PENDIENTE_PROCESOS'
        : processesMissingShifts > 0
          ? 'PENDIENTE_TURNOS'
          : 'COMPLETO';

    result.push({
      audit,
      program: audit.id_programa_auditoria
        ? programById.get(audit.id_programa_auditoria) ?? null
        : null,
      selectedSitesCount: activeSites.length,
      totalConfiguredProcesses,
      sitesMissingProcesses,
      processesMissingShifts,
      totalAssignedShifts,
      completionState,
      neverAuditedEligibleCount,
    });
  }

  return result;
}

/**
 * Devuelve únicamente las opciones activas de `turnos_por_sitio` pertenecientes al `siteId`.
 */
export function resolveSiteShiftOptionsForProcess(
  siteId: string,
  turnosPorSitio: ReadonlyArray<TurnoPorSitioLink>
): TurnoPorSitioLink[] {
  return turnosPorSitio.filter((t) => !t.deleted_at && t.id_sitio === siteId);
}

// =============================================================================
// Step 7.1 — `4. Proceso` Certificate-Based Multi View & Site Batch Helpers
// =============================================================================

export type CertProcesoStatus = 'COMPLETO' | 'PENDIENTE' | 'SIN_AUDITORIA';

export interface CertificateProcesoRow extends CertificateMultiViewRow {
  sitesCount: number;
  configuredSitesCount: number;
  selectedProcessesCount: number;
  eligibleProcessesCount: number;
  neverAuditedEligibleCount: number;
  statusKey: CertProcesoStatus;
}

export interface SiteProcesoPlanEvaluation {
  sitePlan: AuditoriaSitioPlanItem;
  rows: ProcessHistoryRow[];
  selectedCount: number;
  eligibleCount: number;
  neverAuditedCount: number;
  selectAllDeltaIds: string[];
  clearRecordIds: string[];
}

export interface AuditProcesoDetailModel {
  audit: ProgramacionAuditEntity;
  sites: SiteProcesoPlanEvaluation[];
  sitesCount: number;
  sitesConfiguredCount: number;
  totalSelectedProcesses: number;
  totalEligibleProcesses: number;
  neverAuditedEligibleCount: number;
  noAplicables?: NonApplicableRequirementEntity[];
  isComplete: boolean;
}

/**
 * Normaliza el nombre de un proceso eliminando diacríticos y espacios redundantes
 * para empatar procesos homónimos entre distintos sitios de una misma auditoría.
 */
export function normalizeProcessNameKey(name: string | null | undefined): string {
  return (name || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Calcula los IDs de `procesos_por_sitio` faltantes para marcar en una sola operación batch
 * ("Seleccionar todos") dentro de un sitio de auditoría.
 */
export function computeSiteSelectAllIds(rows: ReadonlyArray<ProcessHistoryRow>): string[] {
  return rows.filter((r) => !r.isSelectedNow).map((r) => r.ppsLink.id);
}

/**
 * Devuelve los IDs activos de `procesos_sitio_auditoria` a archivar ("Limpiar")
 * para reiniciar la selección de procesos en un sitio.
 */
export function computeSiteClearRecordIds(rows: ReadonlyArray<ProcessHistoryRow>): string[] {
  return rows
    .filter((r) => r.isSelectedNow && Boolean(r.currentProcesoSitioAuditoriaId))
    .map((r) => r.currentProcesoSitioAuditoriaId as string);
}

function resolveVersionScopedProcessInputs(opts: {
  audit: ProgramacionAuditEntity;
  allProcessesPorSitio: ReadonlyArray<ProcesoPorSitioLink>;
  allProcesses: ReadonlyArray<CandidateProcessEntity>;
  certificados?: ReadonlyArray<CertificadoDetailEntity>;
}): {
  activeSites: AuditoriaSitioPlanItem[];
  scopedProcessesPorSitio: ReadonlyArray<ProcesoPorSitioLink>;
  scopedProcesses: ReadonlyArray<CandidateProcessEntity>;
  noAplicables: NonApplicableRequirementEntity[];
} {
  const { audit, allProcessesPorSitio, allProcesses, certificados } = opts;
  const rawSites = (audit.sitiosPlan || [])
    .filter((sp) => !sp.deleted_at)
    .slice()
    .sort((a, b) => a.numero_sitio - b.numero_sitio);

  if (!certificados || certificados.length === 0) {
    return {
      activeSites: rawSites,
      scopedProcessesPorSitio: allProcessesPorSitio,
      scopedProcesses: allProcesses,
      noAplicables: [],
    };
  }

  const cert = certificados.find(
    (c) => !('deleted_at' in c && c.deleted_at) && c.id === audit.id_certificado
  );
  if (!cert) {
    return {
      activeSites: rawSites,
      scopedProcessesPorSitio: allProcessesPorSitio,
      scopedProcesses: allProcesses,
      noAplicables: [],
    };
  }

  const snapshot = resolveCertVersionSnapshotForAudit(audit, certificados);
  const hasVersionedOrSiteData =
    (cert.versiones ?? []).some((v) => !v.deleted_at) ||
    (cert.sitios ?? []).length > 0 ||
    (cert.procesos ?? []).length > 0;

  if (!hasVersionedOrSiteData) {
    return {
      activeSites: rawSites,
      scopedProcessesPorSitio: allProcessesPorSitio,
      scopedProcesses: allProcesses,
      noAplicables: snapshot.noAplicables,
    };
  }

  const shouldScopeSites =
    snapshot.sitios.length > 0 || Boolean(audit.id_certificado_version);
  const allowedSiteIds = new Set(snapshot.sitios.map((s) => s.id));
  const activeSites = shouldScopeSites
    ? rawSites.filter((sp) => allowedSiteIds.has(sp.id_sitio))
    : rawSites;

  const embeddedPps = snapshot.sitios.flatMap((s) =>
    (s.procesos_por_sitio || []).filter((l) => !l.deleted_at)
  );
  const scopedProcessesPorSitio =
    embeddedPps.length > 0
      ? embeddedPps
      : shouldScopeSites
      ? allProcessesPorSitio.filter((l) => !l.deleted_at && allowedSiteIds.has(l.id_sitio))
      : allProcessesPorSitio;

  const scopedProcesses =
    snapshot.procesos.length > 0
      ? (snapshot.procesos as CandidateProcessEntity[])
      : Boolean(audit.id_certificado_version) && (cert.procesos ?? []).length > 0
      ? ([] as CandidateProcessEntity[])
      : allProcesses;

  return {
    activeSites,
    scopedProcessesPorSitio,
    scopedProcesses,
    noAplicables: snapshot.noAplicables,
  };
}

/**
 * Construye el modelo de detalle por sitio para `4. Proceso` de una auditoría individual,
 * ordenando los sitios con `Sitio 0 (HQ)` primero y luego `numero_sitio` ascendente.
 */
export function buildAuditProcesoDetail(opts: {
  audit: ProgramacionAuditEntity;
  allAudits: ReadonlyArray<ProgramacionAuditEntity>;
  allProcessesPorSitio: ReadonlyArray<ProcesoPorSitioLink>;
  allProcesses: ReadonlyArray<CandidateProcessEntity>;
  certificados?: ReadonlyArray<CertificadoDetailEntity>;
}): AuditProcesoDetailModel {
  const { audit, allAudits, allProcessesPorSitio, allProcesses, certificados } = opts;
  const scoped = resolveVersionScopedProcessInputs({
    audit,
    allProcessesPorSitio,
    allProcesses,
    certificados,
  });
  const activeSites = scoped.activeSites;

  let sitesConfiguredCount = 0;
  let totalSelectedProcesses = 0;
  let totalEligibleProcesses = 0;
  let neverAuditedEligibleCount = 0;

  const sites: SiteProcesoPlanEvaluation[] = activeSites.map((sitePlan) => {
    const siteLinks = scoped.scopedProcessesPorSitio.filter(
      (l) =>
        !l.deleted_at &&
        (!l.id_certificado || l.id_certificado === audit.id_certificado) &&
        l.id_sitio === sitePlan.id_sitio
    );
    const rows = buildProcessHistoryForSite(
      audit,
      sitePlan,
      siteLinks,
      scoped.scopedProcesses,
      allAudits
    );
    const selectedCount = rows.filter((r) => r.isSelectedNow).length;
    const eligibleCount = rows.length;
    const neverAuditedCount = rows.filter((r) => r.neverAudited).length;
    if (selectedCount > 0) sitesConfiguredCount += 1;
    totalSelectedProcesses += selectedCount;
    totalEligibleProcesses += eligibleCount;
    neverAuditedEligibleCount += neverAuditedCount;

    return {
      sitePlan,
      rows,
      selectedCount,
      eligibleCount,
      neverAuditedCount,
      selectAllDeltaIds: computeSiteSelectAllIds(rows),
      clearRecordIds: computeSiteClearRecordIds(rows),
    };
  });

  const isComplete =
    activeSites.length > 0 &&
    sitesConfiguredCount === activeSites.length &&
    totalSelectedProcesses > 0;

  return {
    audit,
    sites,
    sitesCount: activeSites.length,
    sitesConfiguredCount,
    totalSelectedProcesses,
    totalEligibleProcesses,
    neverAuditedEligibleCount,
    noAplicables: scoped.noAplicables,
    isComplete,
  };
}

/**
 * Step 7.1 — Construye las filas Certificate-Based del Multi View `4. Proceso`.
 * Cada certificado muestra el avance de sitios/procesos seleccionados en su última auditoría.
 */
export function buildCertificateProcesoRows(
  params: BuildCertificateMultiViewRowsParams & {
    allProcessesPorSitio: ReadonlyArray<ProcesoPorSitioLink>;
    allProcesses: ReadonlyArray<CandidateProcessEntity>;
  }
): CertificateProcesoRow[] {
  const baseRows = buildCertificateMultiViewRows(params);
  const allAudits = params.audits.filter((a) => !a.deleted_at);

  return baseRows.map((row) => {
    if (!row.latestAudit) {
      return {
        ...row,
        sitesCount: 0,
        configuredSitesCount: 0,
        selectedProcessesCount: 0,
        eligibleProcessesCount: 0,
        neverAuditedEligibleCount: 0,
        statusKey: 'SIN_AUDITORIA',
      };
    }

    const detail = buildAuditProcesoDetail({
      audit: row.latestAudit,
      allAudits,
      allProcessesPorSitio: params.allProcessesPorSitio,
      allProcesses: params.allProcesses,
      certificados: params.detailedCerts as ReadonlyArray<CertificadoDetailEntity> | undefined,
    });

    const statusKey: CertProcesoStatus = detail.isComplete ? 'COMPLETO' : 'PENDIENTE';

    return {
      ...row,
      sitesCount: detail.sitesCount,
      configuredSitesCount: detail.sitesConfiguredCount,
      selectedProcessesCount: detail.totalSelectedProcesses,
      eligibleProcessesCount: detail.totalEligibleProcesses,
      neverAuditedEligibleCount: detail.neverAuditedEligibleCount,
      statusKey,
    };
  });
}
