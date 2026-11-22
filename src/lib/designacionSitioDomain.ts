/**
 * Refactor `Auditoría → Designación → Sitio`:
 * Lógica Pura de Asignación Multi-Sitio por Auditoría (Individual y Vinculada),
 * Bloqueo Obligatorio de `Sitio 0 (HQ)`, Cobertura Histórica/Futura por Certificado y Ordenamiento.
 *
 * Strictly typed (`strict: true`, 0 `any` / `as any`) and Zero-UUID compliant
 * in all user-facing strings.
 */

import {
  formatAuditDateLabel,
  resolveLatestPlannedDate,
  resolveLatestRealExecutionDate,
  type AuditDateEntry,
  type ProgramaAuditoriaEntity,
} from './auditPlanningEngine';
import type { ProgramacionAuditEntity } from './auditExecution';
import {
  buildCertificateMultiViewRows,
  getLinkedSiblingAudits,
  type BuildCertificateMultiViewRowsParams,
  type CertificateMultiViewRow,
} from './certificateAuditSelector';
import { sortSitesWithPrincipalFirst, type SiteEntity } from './multisiteSampling';
import {
  computeAuditUrgencyClassification,
  formatCompactLinkNature,
  getCertificateStatusBadgeMeta,
  resolveEffectivePlannedWindow,
  resolveLastAddedPlannedDate,
  type AuditUrgencyClassification,
  type TipoQueuePreset,
} from './designacionTipoDomain';
import { isValidUuid } from './zeroUuid';

export type SiteTimelineCellStatus =
  | 'AUDITADO'
  | 'NO_INCLUIDO'
  | 'SELECCIONADO'
  | 'PENDIENTE'
  | 'PREPROGRAMADO'
  | 'SIN_DEFINIR';

export type SiteAuditTemporalPhase = 'PAST' | 'CURRENT' | 'FUTURE';

export type SiteCoverageStatus =
  | 'CUBIERTO_ACTUAL'
  | 'CUBIERTO_PASADO'
  | 'PROGRAMADO_FUTURO'
  | 'SIN_COBERTURA';

export type SiteCoverageSortMode =
  | 'SITE_NUMBER'
  | 'UNVISITED_FIRST'
  | 'LEAST_AUDITED'
  | 'CURRENT_FIRST'
  | 'NAME_ASC';

export const SITE_COVERAGE_SORT_OPTIONS: ReadonlyArray<{
  value: SiteCoverageSortMode;
  label: string;
}> = [
  { value: 'SITE_NUMBER', label: 'N° de Sitio (HQ primero)' },
  { value: 'UNVISITED_FIRST', label: 'Sin cobertura primero' },
  { value: 'LEAST_AUDITED', label: 'Menor frecuencia / Más antiguos' },
  { value: 'CURRENT_FIRST', label: 'Asignados en auditoría actual' },
  { value: 'NAME_ASC', label: 'Nombre de sitio (A–Z)' },
];

export interface SiteCycleTimelineCell {
  auditId: string;
  auditCode: string;
  yearLabel: string;
  auditTypeLabel: string;
  dateLabel: string;
  temporalPhase: SiteAuditTemporalPhase;
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

export interface SitioAssignmentItem {
  site: CandidateSiteEntity;
  isPrincipalHq: boolean;
  isSelected: boolean;
  canToggle: boolean;
  lockedReason: 'HQ_MANDATORY' | 'READ_ONLY' | 'MIN_ONE_SITE' | null;
  sitioAuditoriaId: string | null;
  tiempoAuditoria: number;
  coverageStatus: SiteCoverageStatus;
  lastAuditedLabel: string;
}

export interface SitioLinkedAuditModel {
  audit: ProgramacionAuditEntity;
  isActive: boolean;
  certId: string;
  certNumero: string;
  normaCodigo: string;
  organizacionNombre: string;
  codigoAuditoria: string;
  tipoAuditoria: string;
  estadoCiclo: string;
  dateSummary: string;
  tiempoAuditoriaDays: number;
  siteItems: SitioAssignmentItem[];
  selectedCount: number;
  totalSitesCount: number;
  coveredUniqueCount: number;
  unvisitedSitesCount: number;
}

export interface SiteCoverageAuditColumn {
  auditId: string;
  auditCode: string;
  yearLabel: string;
  auditTypeLabel: string;
  dateLabel: string;
  temporalPhase: SiteAuditTemporalPhase;
}

export interface SiteCoverageRow {
  site: CandidateSiteEntity;
  isPrincipalHq: boolean;
  isAssignedCurrent: boolean;
  canToggleCurrent: boolean;
  sitioAuditoriaId: string | null;
  pastVisitCount: number;
  futureVisitCount: number;
  totalCoveredAcrossAudits: number;
  coverageStatus: SiteCoverageStatus;
  coverageBadgeLabel: string;
  coverageBadgeClass: string;
  lastAuditedIso: string | null;
  lastAuditedLabel: string;
  nextScheduledIso: string | null;
  nextScheduledLabel: string;
  cells: SiteCycleTimelineCell[];
}

export interface SiteCoverageModalModel {
  certId: string;
  certNumero: string;
  organizacionNombre: string;
  normaCodigo: string;
  currentAudit: ProgramacionAuditEntity;
  sortMode: SiteCoverageSortMode;
  totalSitesCount: number;
  pastCoveredSitesCount: number;
  currentAssignedCount: number;
  futureScheduledSitesCount: number;
  unvisitedSitesCount: number;
  allAuditColumns: SiteCoverageAuditColumn[];
  visibleAuditColumns: SiteCoverageAuditColumn[];
  windowStartIndex: number;
  canPagePrev: boolean;
  canPageNext: boolean;
  pastAuditsCount: number;
  futureAuditsCount: number;
  rows: SiteCoverageRow[];
}

export interface AuditSiteToggleValidationResult {
  valid: boolean;
  action: 'ADD' | 'REMOVE' | null;
  error: string | null;
  sitioAuditoriaId: string | null;
  isPrincipalHq: boolean;
}

export interface CertificateSitioRow extends CertificateMultiViewRow {
  selectedSitesCount: number;
  totalAvailableSites: number;
  hasSitesConfigured: boolean;
  siteCoverageLabel: string;
  assignedSitesPreview: string;
  linkShortLabel: string;
  linkFullTooltip: string;
  certStatusBadgeClass: string;
}

export function isPrincipalHqSite(site: Pick<SiteEntity, 'numero_sitio'>): boolean {
  return Number(site.numero_sitio) === 0;
}

/**
 * Evaluates whether an assigned site may be removed from an audit.
 * `Sitio 0 (HQ)` (`numero_sitio === 0`) is ALWAYS mandatory and cannot be removed.
 */
export function canRemoveSiteFromAudit(
  site: Pick<SiteEntity, 'id' | 'numero_sitio'>,
  activePlanItems: ReadonlyArray<{ id_sitio: string; numero_sitio?: number; deleted_at?: string | null }>
): boolean {
  if (isPrincipalHqSite(site)) {
    return false;
  }
  const active = activePlanItems.filter((sp) => !sp.deleted_at);
  const isAssigned = active.some((sp) => sp.id_sitio === site.id);
  if (!isAssigned) return false;
  return active.length > 1;
}

/**
 * Pure domain validator for adding or removing a site on an audit.
 * Enforces Zero-UUID errors, valid membership in the certificate, and mandatory `Sitio 0 (HQ)` lock.
 */
export function validateAuditSiteToggle(params: {
  audit: ProgramacionAuditEntity | null | undefined;
  siteId: string;
  certificateSites: ReadonlyArray<CandidateSiteEntity>;
  isStaff: boolean;
}): AuditSiteToggleValidationResult {
  const { audit, siteId, certificateSites, isStaff } = params;
  if (!isStaff) {
    return {
      valid: false,
      action: null,
      error: 'Solo personal administrativo aprobado puede modificar los sitios de auditoría.',
      sitioAuditoriaId: null,
      isPrincipalHq: false,
    };
  }
  if (!audit || audit.deleted_at || !isValidUuid(audit.id)) {
    return {
      valid: false,
      action: null,
      error: 'No se encontró la auditoría seleccionada para actualizar sus sitios.',
      sitioAuditoriaId: null,
      isPrincipalHq: false,
    };
  }
  if (!isValidUuid(siteId)) {
    return {
      valid: false,
      action: null,
      error: 'El sitio seleccionado no es válido.',
      sitioAuditoriaId: null,
      isPrincipalHq: false,
    };
  }

  const activeSites = certificateSites.filter((s) => !s.deleted_at);
  const targetSite = activeSites.find((s) => s.id === siteId) ?? null;
  const activePlan = (audit.sitiosPlan || []).filter((sp) => !sp.deleted_at);
  const existingPlan = activePlan.find((sp) => sp.id_sitio === siteId) ?? null;
  const isHq =
    (targetSite ? isPrincipalHqSite(targetSite) : false) ||
    (existingPlan ? Number(existingPlan.numero_sitio) === 0 : false);

  if (existingPlan) {
    if (isHq) {
      return {
        valid: false,
        action: null,
        error: 'El Sitio 0 (Sede Principal / HQ) es obligatorio en toda auditoría y no puede removerse.',
        sitioAuditoriaId: existingPlan.id,
        isPrincipalHq: true,
      };
    }
    if (activePlan.length <= 1) {
      return {
        valid: false,
        action: null,
        error: 'Cada auditoría debe conservar al menos 1 sitio permanente seleccionado.',
        sitioAuditoriaId: existingPlan.id,
        isPrincipalHq: false,
      };
    }
    return {
      valid: true,
      action: 'REMOVE',
      error: null,
      sitioAuditoriaId: existingPlan.id,
      isPrincipalHq: false,
    };
  }

  if (isHq) {
    return {
      valid: true,
      action: 'ADD',
      error: null,
      sitioAuditoriaId: null,
      isPrincipalHq: true,
    };
  }

  if (activeSites.length > 0 && !targetSite) {
    return {
      valid: false,
      action: null,
      error: 'El sitio seleccionado no pertenece a las sedes activas de este certificado.',
      sitioAuditoriaId: null,
      isPrincipalHq: false,
    };
  }

  return {
    valid: true,
    action: 'ADD',
    error: null,
    sitioAuditoriaId: null,
    isPrincipalHq: false,
  };
}

function getAuditChronologyKey(audit: ProgramacionAuditEntity): {
  sortKey: string;
  yearLabel: string;
  dateLabel: string;
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
      dateLabel: realDate.fecha_inicio.slice(0, 10).split('-').reverse().join('/'),
      isExecuted: true,
    };
  }

  const planned =
    resolveLastAddedPlannedDate(audit.fechas) ??
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
      dateLabel: planned ? formatAuditDateLabel(planned) : win.startIso.slice(0, 10),
      isExecuted: isClosedState,
    };
  }

  const fallback = audit.fecha_inicio || '9999-12-31';
  return {
    sortKey: fallback,
    yearLabel: /^\d{4}/.test(fallback) ? fallback.slice(0, 4) : 'S/F',
    dateLabel: /^\d{4}-\d{2}-\d{2}/.test(fallback)
      ? fallback.slice(0, 10).split('-').reverse().join('/')
      : 'Sin fecha',
    isExecuted: isClosedState,
  };
}

function resolveProgramPlannedDate(
  activeAudits: ReadonlyArray<ProgramacionAuditEntity>
): AuditDateEntry | null {
  const plannedDates = activeAudits
    .map(
      (a) =>
        resolveLastAddedPlannedDate(a.fechas) ??
        resolveLatestPlannedDate(a.fechas) ??
        (a.latestDate && !a.latestDate.deleted_at && a.latestDate.tipo_fecha !== 'REAL'
          ? a.latestDate
          : null)
    )
    .filter((d): d is AuditDateEntry => d !== null);

  if (plannedDates.length === 0) return null;
  return plannedDates.slice().sort((a, b) => b.numero_secuencia - a.numero_secuencia)[0] ?? null;
}

function collectChronologicalCertAudits(
  currentAudit: ProgramacionAuditEntity,
  allAudits: ReadonlyArray<ProgramacionAuditEntity>
): Array<{
  audit: ProgramacionAuditEntity;
  chrono: ReturnType<typeof getAuditChronologyKey>;
}> {
  const sourceAudits: ProgramacionAuditEntity[] = allAudits.some((a) => a.id === currentAudit.id)
    ? [...allAudits]
    : [...allAudits, currentAudit];

  return sourceAudits
    .filter(
      (a) =>
        !a.deleted_at &&
        a.id_certificado === currentAudit.id_certificado &&
        a.estado_ciclo !== 'Cancelada'
    )
    .map((a) => ({ audit: a, chrono: getAuditChronologyKey(a) }))
    .sort((x, y) => {
      const keyCmp = x.chrono.sortKey.localeCompare(y.chrono.sortKey);
      if (keyCmp !== 0) return keyCmp;
      return (x.audit.codigo_auditoria || '').localeCompare(y.audit.codigo_auditoria || '');
    });
}

function isSitePresentInAuditPlan(
  audit: ProgramacionAuditEntity,
  site: CandidateSiteEntity
): boolean {
  const activePlan = (audit.sitiosPlan || []).filter((sp) => !sp.deleted_at);
  if (activePlan.some((sp) => sp.id_sitio === site.id)) {
    return true;
  }
  return false;
}

/**
 * Builds the multi-year site auditability matrix for `currentAudit`, placing `Sitio 0 (HQ)`
 * first and evaluating all active, non-cancelled audits of the same certificate chronologically.
 * Enforces mandatory lock (`canDeselect = false`) on `Sitio 0 (HQ)`.
 */
export function buildSiteCycleMatrixForAudit(
  currentAudit: ProgramacionAuditEntity,
  certificateSites: ReadonlyArray<CandidateSiteEntity>,
  allAudits: ReadonlyArray<ProgramacionAuditEntity>
): SiteCycleMatrixRow[] {
  const orderedSites = sortSitesWithPrincipalFirst(
    certificateSites.filter((s) => !s.deleted_at)
  );

  const certAudits = collectChronologicalCertAudits(currentAudit, allAudits);
  const currentIdxRaw = certAudits.findIndex((item) => item.audit.id === currentAudit.id);
  const currentIdx = currentIdxRaw >= 0 ? currentIdxRaw : 0;

  const selectedNowIds = new Set(
    (currentAudit.sitiosPlan || []).filter((sp) => !sp.deleted_at).map((sp) => sp.id_sitio)
  );

  return orderedSites.map((site) => {
    const isHq = isPrincipalHqSite(site);
    let lastAuditedLabel = 'Nunca auditado';
    let auditedCount = 0;

    const timelineCells: SiteCycleTimelineCell[] = certAudits.map((entry, idx) => {
      const a = entry.audit;
      const isCurrent = a.id === currentAudit.id;
      const isIncluded =
        isSitePresentInAuditPlan(a, site) || (isCurrent && isHq);
      const isFuture = !isCurrent && idx > currentIdx;
      const temporalPhase: SiteAuditTemporalPhase = isCurrent
        ? 'CURRENT'
        : isFuture
        ? 'FUTURE'
        : 'PAST';

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
          shortTag = isHq ? '🔒 HQ' : '● Selec.';
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
        auditCode: a.codigo_auditoria || 'Auditoría',
        yearLabel: entry.chrono.yearLabel,
        auditTypeLabel: a.tipo_auditoria || 'Sin tipo',
        dateLabel: entry.chrono.dateLabel,
        temporalPhase,
        isCurrentAudit: isCurrent,
        isFutureAudit: isFuture,
        status,
        shortTag,
        badgeClass,
      };
    });

    const selectedInCurrent = selectedNowIds.has(site.id) || isHq;
    const canDeselect = isHq
      ? false
      : !selectedInCurrent || selectedNowIds.size > 1;

    return {
      site,
      isPrincipalHq: isHq,
      isSelectedInCurrentAudit: selectedInCurrent,
      canDeselect,
      lastAuditedLabel,
      auditedCountInWindow: auditedCount,
      totalVisitsInWindow: certAudits.length,
      timelineCells,
      currentAuditIndex: currentIdx,
    };
  });
}

function resolveSiteCoverageMeta(status: SiteCoverageStatus): {
  label: string;
  badgeClass: string;
} {
  switch (status) {
    case 'CUBIERTO_ACTUAL':
      return {
        label: 'En auditoría actual',
        badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
      };
    case 'CUBIERTO_PASADO':
      return {
        label: 'Auditado previo',
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      };
    case 'PROGRAMADO_FUTURO':
      return {
        label: 'Prog. futuro',
        badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
      };
    case 'SIN_COBERTURA':
    default:
      return {
        label: 'Sin visitar',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
      };
  }
}

export function sortSiteCoverageRows(
  rows: ReadonlyArray<SiteCoverageRow>,
  sortMode: SiteCoverageSortMode
): SiteCoverageRow[] {
  const list = rows.slice();
  const statusPriority: Record<SiteCoverageStatus, number> = {
    SIN_COBERTURA: 0,
    PROGRAMADO_FUTURO: 1,
    CUBIERTO_PASADO: 2,
    CUBIERTO_ACTUAL: 3,
  };

  return list.sort((a, b) => {
    switch (sortMode) {
      case 'UNVISITED_FIRST': {
        const pA = statusPriority[a.coverageStatus];
        const pB = statusPriority[b.coverageStatus];
        if (pA !== pB) return pA - pB;
        return a.site.numero_sitio - b.site.numero_sitio;
      }
      case 'LEAST_AUDITED': {
        if (a.pastVisitCount !== b.pastVisitCount) {
          return a.pastVisitCount - b.pastVisitCount;
        }
        const isoA = a.lastAuditedIso || '0000-00-00';
        const isoB = b.lastAuditedIso || '0000-00-00';
        if (isoA !== isoB) return isoA.localeCompare(isoB);
        return a.site.numero_sitio - b.site.numero_sitio;
      }
      case 'CURRENT_FIRST': {
        if (a.isAssignedCurrent !== b.isAssignedCurrent) {
          return a.isAssignedCurrent ? -1 : 1;
        }
        return a.site.numero_sitio - b.site.numero_sitio;
      }
      case 'NAME_ASC': {
        const nameCmp = (a.site.nombre_sitio || '').localeCompare(
          b.site.nombre_sitio || '',
          'es',
          { sensitivity: 'base' }
        );
        if (nameCmp !== 0) return nameCmp;
        return a.site.numero_sitio - b.site.numero_sitio;
      }
      case 'SITE_NUMBER':
      default:
        return a.site.numero_sitio - b.site.numero_sitio;
    }
  });
}

/**
 * Builds the Historical & Future Multi-Audit Site Coverage Guidance Modal model
 * for a certificate anchored at `currentAudit`.
 */
export function buildSiteCoverageModalModel(params: {
  currentAudit: ProgramacionAuditEntity;
  certificateSites: ReadonlyArray<CandidateSiteEntity>;
  allAudits: ReadonlyArray<ProgramacionAuditEntity>;
  sortMode?: SiteCoverageSortMode;
  windowOffset?: number;
  maxVisibleCols?: number;
  isStaff?: boolean;
}): SiteCoverageModalModel {
  const {
    currentAudit,
    certificateSites,
    allAudits,
    sortMode = 'SITE_NUMBER',
    windowOffset = 0,
    maxVisibleCols = 6,
    isStaff = true,
  } = params;

  const orderedSites = sortSitesWithPrincipalFirst(
    certificateSites.filter((s) => !s.deleted_at)
  );
  const certAudits = collectChronologicalCertAudits(currentAudit, allAudits);
  const currentIdxRaw = certAudits.findIndex((item) => item.audit.id === currentAudit.id);
  const currentIdx = currentIdxRaw >= 0 ? currentIdxRaw : 0;

  const allAuditColumns: SiteCoverageAuditColumn[] = certAudits.map((entry, idx) => ({
    auditId: entry.audit.id,
    auditCode: entry.audit.codigo_auditoria || 'Auditoría',
    yearLabel: entry.chrono.yearLabel,
    auditTypeLabel: entry.audit.tipo_auditoria || 'Sin tipo',
    dateLabel: entry.chrono.dateLabel,
    temporalPhase: idx === currentIdx ? 'CURRENT' : idx > currentIdx ? 'FUTURE' : 'PAST',
  }));

  const slicedCols = sliceCycleWindowColumns(
    allAuditColumns,
    currentIdx,
    windowOffset,
    maxVisibleCols
  );

  const currentPlanBySiteId = new Map(
    (currentAudit.sitiosPlan || [])
      .filter((sp) => !sp.deleted_at)
      .map((sp) => [sp.id_sitio, sp])
  );

  const rawRows: SiteCoverageRow[] = orderedSites.map((site) => {
    const isHq = isPrincipalHqSite(site);
    const currentPlan = currentPlanBySiteId.get(site.id) ?? null;
    const isAssignedCurrent = Boolean(currentPlan) || isHq;

    let pastVisitCount = 0;
    let futureVisitCount = 0;
    let lastAuditedIso: string | null = null;
    let lastAuditedLabel = 'Nunca auditado';
    let nextScheduledIso: string | null = null;
    let nextScheduledLabel = 'Sin programar';

    const cells: SiteCycleTimelineCell[] = certAudits.map((entry, idx) => {
      const a = entry.audit;
      const isCurrent = idx === currentIdx;
      const isFuture = idx > currentIdx;
      const temporalPhase: SiteAuditTemporalPhase = isCurrent
        ? 'CURRENT'
        : isFuture
        ? 'FUTURE'
        : 'PAST';
      const isIncluded =
        isSitePresentInAuditPlan(a, site) || (isCurrent && isHq);

      if (!isCurrent && !isFuture && isIncluded) {
        pastVisitCount += 1;
        lastAuditedIso = entry.chrono.sortKey;
        lastAuditedLabel = `${entry.chrono.dateLabel} · ${a.tipo_auditoria}`;
      } else if (isFuture && isIncluded) {
        futureVisitCount += 1;
        if (!nextScheduledIso) {
          nextScheduledIso = entry.chrono.sortKey;
          nextScheduledLabel = `${entry.chrono.dateLabel} · ${a.tipo_auditoria}`;
        }
      }

      let status: SiteTimelineCellStatus;
      let shortTag: string;
      let badgeClass: string;

      if (isCurrent) {
        if (isIncluded) {
          status = 'SELECCIONADO';
          shortTag = isHq ? '🔒 HQ' : '● Actual';
          badgeClass = 'bg-indigo-600 text-white border-indigo-700';
        } else {
          status = 'PENDIENTE';
          shortTag = '○ Libre';
          badgeClass = 'bg-white text-slate-500 border-slate-300';
        }
      } else if (!isFuture) {
        if (isIncluded) {
          status = 'AUDITADO';
          shortTag = '✓ Aud.';
          badgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-200';
        } else {
          status = 'NO_INCLUIDO';
          shortTag = '—';
          badgeClass = 'bg-slate-50 text-slate-400 border-slate-200';
        }
      } else {
        if (isIncluded) {
          status = 'PREPROGRAMADO';
          shortTag = '📅 Prog.';
          badgeClass = 'bg-sky-50 text-sky-800 border-sky-200';
        } else {
          status = 'SIN_DEFINIR';
          shortTag = '○';
          badgeClass = 'bg-slate-50 text-slate-400 border-slate-200';
        }
      }

      return {
        auditId: a.id,
        auditCode: a.codigo_auditoria || 'Auditoría',
        yearLabel: entry.chrono.yearLabel,
        auditTypeLabel: a.tipo_auditoria || 'Sin tipo',
        dateLabel: entry.chrono.dateLabel,
        temporalPhase,
        isCurrentAudit: isCurrent,
        isFutureAudit: isFuture,
        status,
        shortTag,
        badgeClass,
      };
    });

    const coverageStatus: SiteCoverageStatus = isAssignedCurrent
      ? 'CUBIERTO_ACTUAL'
      : pastVisitCount > 0
      ? 'CUBIERTO_PASADO'
      : futureVisitCount > 0
      ? 'PROGRAMADO_FUTURO'
      : 'SIN_COBERTURA';

    const meta = resolveSiteCoverageMeta(coverageStatus);
    const visibleCells = slicedCols.visible.map((col) => {
      const matched = cells.find((c) => c.auditId === col.auditId);
      return (
        matched ?? {
          auditId: col.auditId,
          auditCode: col.auditCode,
          yearLabel: col.yearLabel,
          auditTypeLabel: col.auditTypeLabel,
          dateLabel: col.dateLabel,
          temporalPhase: col.temporalPhase,
          isCurrentAudit: col.temporalPhase === 'CURRENT',
          isFutureAudit: col.temporalPhase === 'FUTURE',
          status: 'NO_INCLUIDO' as const,
          shortTag: '—',
          badgeClass: 'bg-slate-50 text-slate-400 border-slate-200',
        }
      );
    });

    return {
      site,
      isPrincipalHq: isHq,
      isAssignedCurrent,
      canToggleCurrent: isStaff && !isHq,
      sitioAuditoriaId: currentPlan?.id ?? null,
      pastVisitCount,
      futureVisitCount,
      totalCoveredAcrossAudits:
        pastVisitCount + (isAssignedCurrent ? 1 : 0) + futureVisitCount,
      coverageStatus,
      coverageBadgeLabel: meta.label,
      coverageBadgeClass: meta.badgeClass,
      lastAuditedIso,
      lastAuditedLabel,
      nextScheduledIso,
      nextScheduledLabel,
      cells: visibleCells,
    };
  });

  const sortedRows = sortSiteCoverageRows(rawRows, sortMode);

  return {
    certId: currentAudit.id_certificado,
    certNumero: currentAudit.numero_certificado || 'Certificado',
    organizacionNombre: currentAudit.organizacion_nombre || 'Organización',
    normaCodigo: currentAudit.norma_codigo || 'ISO',
    currentAudit,
    sortMode,
    totalSitesCount: rawRows.length,
    pastCoveredSitesCount: rawRows.filter((r) => r.pastVisitCount > 0).length,
    currentAssignedCount: rawRows.filter((r) => r.isAssignedCurrent).length,
    futureScheduledSitesCount: rawRows.filter((r) => r.futureVisitCount > 0).length,
    unvisitedSitesCount: rawRows.filter((r) => r.coverageStatus === 'SIN_COBERTURA').length,
    allAuditColumns,
    visibleAuditColumns: slicedCols.visible,
    windowStartIndex: slicedCols.startIndex,
    canPagePrev: slicedCols.canPagePrev,
    canPageNext: slicedCols.canPageNext,
    pastAuditsCount: allAuditColumns.filter((c) => c.temporalPhase === 'PAST').length,
    futureAuditsCount: allAuditColumns.filter((c) => c.temporalPhase === 'FUTURE').length,
    rows: sortedRows,
  };
}

/**
 * Builds independent per-audit multi-site assignment models for all linked audits
 * in the current context (`programa_auditoria`), preserving per-audit site sets
 * and enforcing mandatory `Sitio 0 (HQ)` lock on every audit.
 */
export function buildSitioLinkedAuditModels(params: {
  activeAudit: ProgramacionAuditEntity | null;
  allAudits: ReadonlyArray<ProgramacionAuditEntity>;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  getCandidateSites: (audit: ProgramacionAuditEntity) => CandidateSiteEntity[];
  isStaff: boolean;
}): SitioLinkedAuditModel[] {
  const { activeAudit, allAudits, programs, getCandidateSites, isStaff } = params;
  if (!activeAudit) return [];

  const linkedCtx = getLinkedSiblingAudits(activeAudit, allAudits, programs);

  return linkedCtx.siblings.map((sib) => {
    const audit = sib.audit;
    const candidateSites = sortSitesWithPrincipalFirst(
      getCandidateSites(audit).filter((s) => !s.deleted_at)
    );
    const activePlan = (audit.sitiosPlan || []).filter((sp) => !sp.deleted_at);
    const planBySiteId = new Map(activePlan.map((sp) => [sp.id_sitio, sp]));

    const coverageModel = buildSiteCoverageModalModel({
      currentAudit: audit,
      certificateSites: candidateSites,
      allAudits,
      sortMode: 'SITE_NUMBER',
      isStaff,
    });
    const coverageRowBySiteId = new Map(
      coverageModel.rows.map((r) => [r.site.id, r])
    );

    const planned =
      resolveLastAddedPlannedDate(audit.fechas) ??
      resolveLatestPlannedDate(audit.fechas) ??
      (audit.latestDate && !audit.latestDate.deleted_at && audit.latestDate.tipo_fecha !== 'REAL'
        ? audit.latestDate
        : null);

    const dateSummary = planned
      ? formatAuditDateLabel(planned)
      : audit.fecha_inicio
      ? audit.fecha_inicio.slice(0, 10)
      : 'Sin fecha';

    const siteItems: SitioAssignmentItem[] = candidateSites.map((site) => {
      const isHq = isPrincipalHqSite(site);
      const planEntry = planBySiteId.get(site.id) ?? null;
      const isSelected = Boolean(planEntry) || isHq;
      const covRow = coverageRowBySiteId.get(site.id);

      let lockedReason: SitioAssignmentItem['lockedReason'] = null;
      if (isHq) {
        lockedReason = 'HQ_MANDATORY';
      } else if (!isStaff) {
        lockedReason = 'READ_ONLY';
      } else if (isSelected && activePlan.length <= 1) {
        lockedReason = 'MIN_ONE_SITE';
      }

      return {
        site,
        isPrincipalHq: isHq,
        isSelected,
        canToggle: isStaff && !isHq && !(isSelected && activePlan.length <= 1),
        lockedReason,
        sitioAuditoriaId: planEntry?.id ?? null,
        tiempoAuditoria: Number(planEntry?.tiempo_auditoria ?? 0),
        coverageStatus: covRow?.coverageStatus ?? (isSelected ? 'CUBIERTO_ACTUAL' : 'SIN_COBERTURA'),
        lastAuditedLabel: covRow?.lastAuditedLabel ?? 'Nunca auditado',
      };
    });

    const selectedCount = siteItems.filter((item) => item.isSelected).length;
    const totalSitesCount = siteItems.length;
    const coveredUniqueCount = coverageModel.rows.filter(
      (r) => r.coverageStatus !== 'SIN_COBERTURA'
    ).length;

    return {
      audit,
      isActive: sib.isActive,
      certId: audit.id_certificado,
      certNumero: audit.numero_certificado || 'Certificado',
      normaCodigo: audit.norma_codigo || 'ISO',
      organizacionNombre: audit.organizacion_nombre || 'Organización',
      codigoAuditoria: audit.codigo_auditoria || 'Auditoría',
      tipoAuditoria: audit.tipo_auditoria || 'Sin tipo',
      estadoCiclo: audit.estado_ciclo || 'En Programación',
      dateSummary,
      tiempoAuditoriaDays: Number(audit.tiempo_auditoria ?? audit.dias_auditor ?? 0),
      siteItems,
      selectedCount,
      totalSitesCount,
      coveredUniqueCount,
      unvisitedSitesCount: coverageModel.unvisitedSitesCount,
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

/**
 * Certificate-Based Multi View rows for `1.3 Designación → Sitio`.
 */
export function buildCertificateSitioRows(
  params: BuildCertificateMultiViewRowsParams
): CertificateSitioRow[] {
  const baseRows = buildCertificateMultiViewRows(params);
  const certSitesById = new Map<string, CandidateSiteEntity[]>();

  for (const dc of params.detailedCerts ?? []) {
    if ('deleted_at' in dc && dc.deleted_at) continue;
    if ('sitios' in dc && Array.isArray(dc.sitios)) {
      const activeSites = dc.sitios.filter(
        (s) => !('deleted_at' in s && (s as { deleted_at?: string | null }).deleted_at)
      );
      certSitesById.set(dc.id, activeSites);
    }
  }

  return baseRows.map((row) => {
    const latest = row.latestAudit;
    const fallbackLatestDate =
      latest?.latestDate &&
      !latest.latestDate.deleted_at &&
      latest.latestDate.tipo_fecha !== 'REAL'
        ? latest.latestDate
        : null;
    const latestPlanned =
      resolveLastAddedPlannedDate(latest?.fechas) ??
      fallbackLatestDate ??
      row.latestPlannedDate;

    const urgency = computeAuditUrgencyClassification(
      latestPlanned,
      latest?.estado_ciclo || 'Borrador',
      params.referenceIsoDate
    );

    const activePlan = latest
      ? (latest.sitiosPlan || []).filter((sp) => !sp.deleted_at)
      : [];
    const certSites = certSitesById.get(row.certId) ?? [];
    const hasHqInCatalog = certSites.some((s) => isPrincipalHqSite(s));
    const hasHqInPlan = activePlan.some((sp) => Number(sp.numero_sitio) === 0);

    const effectiveSelectedIds = new Set(activePlan.map((sp) => sp.id_sitio));
    if (latest && hasHqInCatalog && !hasHqInPlan) {
      const hqSite = certSites.find((s) => isPrincipalHqSite(s));
      if (hqSite) effectiveSelectedIds.add(hqSite.id);
    }

    const selectedSitesCount = effectiveSelectedIds.size;
    const totalAvailableSites = Math.max(certSites.length, selectedSitesCount);
    const hasSitesConfigured = selectedSitesCount > 0;
    const siteCoverageLabel =
      row.totalAudits === 0
        ? 'Sin auditorías'
        : hasSitesConfigured
        ? `${selectedSitesCount} de ${totalAvailableSites} sede${
            totalAvailableSites === 1 ? '' : 's'
          }`
        : 'Sin sitios asignados';

    const orderedAssignedNames = activePlan
      .slice()
      .sort((a, b) => a.numero_sitio - b.numero_sitio)
      .map((sp) =>
        sp.numero_sitio === 0 ? 'Sitio 0 (HQ)' : `#${sp.numero_sitio} ${sp.nombre_sitio}`
      );
    const assignedSitesPreview =
      orderedAssignedNames.length > 0
        ? orderedAssignedNames.slice(0, 2).join(' · ') +
          (orderedAssignedNames.length > 2 ? ` +${orderedAssignedNames.length - 2}` : '')
        : row.totalAudits > 0 && hasHqInCatalog
        ? 'Sitio 0 (HQ)'
        : `${row.totalAudits} auditoría${row.totalAudits === 1 ? '' : 's'}`;

    const linkMeta = formatCompactLinkNature(
      row.latestProgram,
      row.linkedSiblingCount,
      row.totalAudits > 0
    );
    const statusMeta = getCertificateStatusBadgeMeta(row.estatus);

    return {
      ...row,
      latestPlannedDate: latestPlanned,
      urgency,
      selectedSitesCount,
      totalAvailableSites,
      hasSitesConfigured,
      siteCoverageLabel,
      assignedSitesPreview,
      linkShortLabel: linkMeta.short,
      linkFullTooltip: linkMeta.full,
      certStatusBadgeClass: statusMeta.badgeClass,
    };
  });
}
