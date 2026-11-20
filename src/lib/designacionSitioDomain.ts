/**
 * Step 4.2 — `Designación → Sitio`: Lógica Pura Matriz Multi-Anual de Sitios,
 * Ventana Deslizante Responsiva, Guardia Temporal y Cola Anti-Futuro.
 *
 * Strictly typed (`strict: true`, 0 `any` / `as any`) and Zero-UUID compliant
 * in all user-facing strings.
 */

import {
  resolveLatestPlannedDate,
  resolveLatestRealExecutionDate,
  type AuditDateEntry,
  type ProgramaAuditoriaEntity,
} from './auditPlanningEngine';
import type { ProgramacionAuditEntity } from './auditExecution';
import { sortSitesWithPrincipalFirst, type SiteEntity } from './multisiteSampling';
import {
  computeAuditUrgencyClassification,
  resolveEffectivePlannedWindow,
  type AuditUrgencyClassification,
  type TipoQueuePreset,
} from './designacionTipoDomain';

export type SiteTimelineCellStatus =
  | 'AUDITADO'
  | 'NO_INCLUIDO'
  | 'SELECCIONADO'
  | 'PENDIENTE'
  | 'PREPROGRAMADO'
  | 'SIN_DEFINIR';

export interface SiteCycleTimelineCell {
  auditId: string;
  yearLabel: string;
  auditTypeLabel: string;
  isCurrentAudit: boolean;
  isFutureAudit: boolean;
  status: SiteTimelineCellStatus;
  shortTag: string;
  badgeClass: string;
}

export interface SiteCycleMatrixRow {
  site: SiteEntity;
  isPrincipalHq: boolean;
  isSelectedInCurrentAudit: boolean;
  canDeselect: boolean;
  lastAuditedLabel: string;
  auditedCountInWindow: number;
  totalVisitsInWindow: number;
  timelineCells: SiteCycleTimelineCell[];
  currentAuditIndex: number;
}

export interface CampaignStep4Row {
  program: ProgramaAuditoriaEntity;
  urgency: AuditUrgencyClassification;
  totalCerts: number;
  certsWithSitesCount: number;
  totalSelectedSites: number;
  hasAnyTemporalSiteEnabled: boolean;
  step4Complete: boolean;
}

export interface TemporalSiteRowLike {
  id: string;
  id_auditoria: string;
  deleted_at?: string | null;
}

export type CandidateSiteEntity = SiteEntity & {
  deleted_at?: string | null;
};

function getAuditChronologyKey(audit: ProgramacionAuditEntity): {
  sortKey: string;
  yearLabel: string;
  isExecuted: boolean;
} {
  const realDate =
    resolveLatestRealExecutionDate(audit.fechas) ??
    (audit.latestDate && !audit.latestDate.deleted_at && audit.latestDate.tipo_fecha === 'REAL'
      ? audit.latestDate
      : null);

  if (realDate?.fecha_inicio) {
    return {
      sortKey: realDate.fecha_inicio,
      yearLabel: realDate.fecha_inicio.slice(0, 4),
      isExecuted: true,
    };
  }

  const planned =
    resolveLatestPlannedDate(audit.fechas) ??
    (audit.latestDate && !audit.latestDate.deleted_at && audit.latestDate.tipo_fecha !== 'REAL'
      ? audit.latestDate
      : null);

  const isClosedState = ['Auditada', 'Cerrada'].includes(audit.estado_ciclo || '');
  const win = resolveEffectivePlannedWindow(planned);
  if (win.startIso && win.year) {
    return {
      sortKey: win.startIso,
      yearLabel: String(win.year),
      isExecuted: isClosedState,
    };
  }

  const fallback = audit.fecha_inicio || '9999-12-31';
  return {
    sortKey: fallback,
    yearLabel: /^\d{4}/.test(fallback) ? fallback.slice(0, 4) : 'S/F',
    isExecuted: isClosedState,
  };
}

function resolveProgramPlannedDate(
  activeAudits: ReadonlyArray<ProgramacionAuditEntity>
): AuditDateEntry | null {
  const plannedDates = activeAudits
    .map(
      (a) =>
        resolveLatestPlannedDate(a.fechas) ??
        (a.latestDate && !a.latestDate.deleted_at && a.latestDate.tipo_fecha !== 'REAL'
          ? a.latestDate
          : null)
    )
    .filter((d): d is AuditDateEntry => d !== null);

  if (plannedDates.length === 0) return null;
  return plannedDates.slice().sort((a, b) => b.numero_secuencia - a.numero_secuencia)[0] ?? null;
}

/**
 * Builds the multi-year site auditability matrix for `currentAudit`, placing `Sitio 0 (HQ)`
 * first and evaluating all active, non-cancelled audits of the same certificate chronologically.
 */
export function buildSiteCycleMatrixForAudit(
  currentAudit: ProgramacionAuditEntity,
  certificateSites: ReadonlyArray<CandidateSiteEntity>,
  allAudits: ReadonlyArray<ProgramacionAuditEntity>
): SiteCycleMatrixRow[] {
  const orderedSites = sortSitesWithPrincipalFirst(
    certificateSites.filter((s) => !s.deleted_at)
  );

  const sourceAudits: ProgramacionAuditEntity[] = allAudits.some((a) => a.id === currentAudit.id)
    ? [...allAudits]
    : [...allAudits, currentAudit];

  const certAudits = sourceAudits
    .filter(
      (a) =>
        !a.deleted_at &&
        a.id_certificado === currentAudit.id_certificado &&
        a.estado_ciclo !== 'Cancelada'
    )
    .map((a) => ({ audit: a, chrono: getAuditChronologyKey(a) }))
    .sort((x, y) => x.chrono.sortKey.localeCompare(y.chrono.sortKey));

  const currentIdxRaw = certAudits.findIndex((item) => item.audit.id === currentAudit.id);
  const currentIdx = currentIdxRaw >= 0 ? currentIdxRaw : 0;

  const selectedNowIds = new Set(
    (currentAudit.sitiosPlan || []).filter((sp) => !sp.deleted_at).map((sp) => sp.id_sitio)
  );

  return orderedSites.map((site) => {
    let lastAuditedLabel = 'Nunca auditado';
    let auditedCount = 0;

    const timelineCells: SiteCycleTimelineCell[] = certAudits.map((entry, idx) => {
      const a = entry.audit;
      const isCurrent = a.id === currentAudit.id;
      const isIncluded = (a.sitiosPlan || []).some(
        (sp) => !sp.deleted_at && sp.id_sitio === site.id
      );
      const isFuture = !isCurrent && idx > currentIdx;

      if (entry.chrono.isExecuted && isIncluded && !isCurrent && !isFuture) {
        auditedCount += 1;
        lastAuditedLabel = `${entry.chrono.sortKey.split('-').reverse().join('/')} · ${a.tipo_auditoria}`;
      } else if (isCurrent && isIncluded && entry.chrono.isExecuted) {
        auditedCount += 1;
      }

      let status: SiteTimelineCellStatus;
      let shortTag: string;
      let badgeClass: string;

      if (isCurrent) {
        if (isIncluded) {
          status = 'SELECCIONADO';
          shortTag = '● Selec.';
          badgeClass = 'bg-indigo-600 text-white border-indigo-700';
        } else {
          status = 'PENDIENTE';
          shortTag = '○ Libre';
          badgeClass = 'bg-white text-slate-600 border-slate-300';
        }
      } else if (!isFuture) {
        if (isIncluded) {
          status = 'AUDITADO';
          shortTag = '✓ Aud.';
          badgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-200';
        } else {
          status = 'NO_INCLUIDO';
          shortTag = '— Omit.';
          badgeClass = 'bg-slate-50 text-slate-400 border-slate-200';
        }
      } else {
        if (isIncluded) {
          status = 'PREPROGRAMADO';
          shortTag = '📅 Pre.';
          badgeClass = 'bg-sky-50 text-sky-800 border-sky-200';
        } else {
          status = 'SIN_DEFINIR';
          shortTag = '○ Fut.';
          badgeClass = 'bg-slate-50 text-slate-500 border-slate-200';
        }
      }

      return {
        auditId: a.id,
        yearLabel: entry.chrono.yearLabel,
        auditTypeLabel: a.tipo_auditoria,
        isCurrentAudit: isCurrent,
        isFutureAudit: isFuture,
        status,
        shortTag,
        badgeClass,
      };
    });

    const selectedInCurrent = selectedNowIds.has(site.id);
    return {
      site,
      isPrincipalHq: site.numero_sitio === 0,
      isSelectedInCurrentAudit: selectedInCurrent,
      canDeselect: !selectedInCurrent || selectedNowIds.size > 1,
      lastAuditedLabel,
      auditedCountInWindow: auditedCount,
      totalVisitsInWindow: certAudits.length,
      timelineCells,
      currentAuditIndex: currentIdx,
    };
  });
}

/**
 * Slices a responsive horizontal window of cycle timeline columns anchored around `anchorIndex`
 * and shifted by `windowOffset`, preventing screen overflow (`maxVisibleCols`: 5 desktop / 3-4 mobile).
 */
export function sliceCycleWindowColumns<T>(
  cells: ReadonlyArray<T>,
  anchorIndex: number,
  windowOffset: number,
  maxVisibleCols: number
): { visible: T[]; canPagePrev: boolean; canPageNext: boolean; startIndex: number } {
  const safeMaxCols = Math.max(1, Math.floor(maxVisibleCols));
  if (cells.length <= safeMaxCols) {
    return {
      visible: cells.slice(),
      canPagePrev: false,
      canPageNext: false,
      startIndex: 0,
    };
  }

  const idealCenter = anchorIndex + windowOffset;
  const half = Math.floor(safeMaxCols / 2);
  let start = idealCenter - half;
  if (start < 0) start = 0;
  if (start + safeMaxCols > cells.length) start = cells.length - safeMaxCols;

  return {
    visible: cells.slice(start, start + safeMaxCols),
    canPagePrev: start > 0,
    canPageNext: start + safeMaxCols < cells.length,
    startIndex: start,
  };
}

/**
 * Prevents disabling `auditoria.tiene_sitio_temporal` while active temporary sites exist in Step 5.
 * Never exposes UUIDs in user-facing rejection reasons.
 */
export function canToggleTemporalSiteOff(
  auditId: string,
  temporalSites: ReadonlyArray<TemporalSiteRowLike>
): { allowed: boolean; reason: string | null } {
  const activeCount = temporalSites.filter(
    (t) => !t.deleted_at && t.id_auditoria === auditId
  ).length;
  if (activeCount > 0) {
    return {
      allowed: false,
      reason: `Esta auditoría tiene ${activeCount} sitio(s) temporal(es) activos en Paso 5 (Temporal). Archívelos antes de desactivar el indicador temporal.`,
    };
  }
  return { allowed: true, reason: null };
}

/**
 * Builds and sorts Step 4 campaign rows by imminence (`urgency.rank ASC`, then `effectiveStartIso ASC`)
 * so distant future cycles never shadow imminent audits.
 */
export function buildCampaignStep4Rows(
  programs: ReadonlyArray<ProgramaAuditoriaEntity>,
  referenceIsoDate: string = new Date().toISOString().slice(0, 10)
): CampaignStep4Row[] {
  const rows: CampaignStep4Row[] = [];

  for (const program of programs) {
    if (program.deleted_at) continue;
    const activeAudits = program.auditorias.filter((a) => !a.deleted_at);
    if (activeAudits.length === 0) continue;

    const planned = resolveProgramPlannedDate(activeAudits);
    const urgency = computeAuditUrgencyClassification(
      planned,
      activeAudits[0]?.estado_ciclo || 'Borrador',
      referenceIsoDate
    );

    const certsWithSitesCount = activeAudits.filter(
      (a) => (a.sitiosPlan || []).filter((s) => !s.deleted_at).length >= 1
    ).length;
    const totalSelectedSites = activeAudits.reduce(
      (sum, a) => sum + (a.sitiosPlan || []).filter((s) => !s.deleted_at).length,
      0
    );
    const hasAnyTemporalSiteEnabled = activeAudits.some(
      (a) => a.tiene_sitio_temporal === true
    );

    rows.push({
      program,
      urgency,
      totalCerts: activeAudits.length,
      certsWithSitesCount,
      totalSelectedSites,
      hasAnyTemporalSiteEnabled,
      step4Complete: certsWithSitesCount === activeAudits.length,
    });
  }

  return rows.sort((a, b) => {
    if (a.urgency.rank !== b.urgency.rank) return a.urgency.rank - b.urgency.rank;
    return (a.urgency.effectiveStartIso || '9999-12-31').localeCompare(
      b.urgency.effectiveStartIso || '9999-12-31'
    );
  });
}

/**
 * Evaluates whether a Step 4 campaign row belongs to the active anti-future queue preset.
 */
export function matchesStep4Preset(
  row: CampaignStep4Row,
  preset: TipoQueuePreset
): boolean {
  if (preset === 'TODAS') return true;
  if (preset === 'FUTURO') return row.urgency.rank === 4 || row.urgency.rank === 5;
  if (preset === 'PREPROGRAMADAS') {
    const activeAudits = row.program.auditorias.filter((a) => !a.deleted_at);
    const latest = resolveProgramPlannedDate(activeAudits);
    return latest?.tipo_fecha === 'PREPROGRAMADA_MES';
  }
  return row.urgency.rank <= 3 || row.urgency.bucket === 'SIN_FECHA';
}
