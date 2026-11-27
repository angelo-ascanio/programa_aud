/**
 * Step 6.1 (`3. Auditor`, antes `Asignación`) — Lógica Pura Certificate-Based de conciliación
 * de equipos de auditores sobre sitios permanentes (`equipo_auditor_sitio`) y Sitio Temporal
 * activo (`equipo_auditor_sitio_temporal`), con validación estricta `SUM(días) === requerido`,
 * competencia ISO/IEC 17021-1 (`norma` + `sector_iaf` + `subsector_iaf`), conflictos y rotación.
 *
 * Strictly typed (`strict: true`, 0 `any` / `as any`) and Zero-UUID compliant
 * in all user-facing strings and validation errors.
 */

import { assertValidUuid, containsRawUuid, isValidUuid } from './zeroUuid';
import {
  computeSiteDayBalance,
  resolveLatestPlannedDate,
  roundAuditDaysQuarter,
  type AuditorSiteRole,
  type ProgramaAuditoriaEntity,
  type SiteEvaluationModality,
} from './auditPlanningEngine';
import type {
  ExpertoTecnicoAuditoriaEntity,
  ProgramacionAuditEntity,
} from './auditExecution';
import {
  classifyAuditorObservacionSector,
  detectDuplicateAuditorNames,
  evaluateAuditorInSituStatus,
  formatAuditorDisplayLabel,
  getAuditorInSituStatusVisual,
  type AuditorDetailEntity,
  type AuditorInSituStatus,
} from './competencyMatrix';

export { formatAuditorDisplayLabel, detectDuplicateAuditorNames };
import type {
  ExpertoDisponibilidad,
  ExpertoTecnicoDetailEntity,
} from './expertoTecnicoDomain';
import type { CertificadoDetailEntity } from './multisiteSampling';
import { resolveCertVersionSnapshotForAudit } from './certificadoVersionDomain';
import {
  parseTemporalSiteDetails,
  resolveLinkedBatchTemporalState,
  type AuditoriaSitioTemporalEntity,
} from './designacionTemporalDomain';
import { isValidQuarterDayAmount } from './tiempoDomain';
import {
  computeAuditUrgencyClassification,
  type AuditUrgencyClassification,
} from './designacionTipoDomain';
import {
  buildCertificateMultiViewRows,
  type BuildCertificateMultiViewRowsParams,
  type CertificateMultiViewRow,
} from './certificateAuditSelector';
import {
  formatAuditCodename,
  getAuditCodenameTooltip,
} from './codenameDomain';
import type {
  OrgCertMetaResolver,
  OrgMultiViewRow,
} from './orgMultiViewPickerDomain';
import type { MultiViewFacetCategory } from './universalTemplate';
import { formatAuditDateLabel } from './auditPlanningEngine';
import {
  buildCertificateAuditHistoryDigest,
  detectAuditorScheduleConflicts,
  type AlertConfigEntity,
  type LeadAuditorRotationSummary,
  type ProgramAuditorScheduleConflict,
} from './auditAlertsEngine';

export type AsignacionStatusFilter = 'ALL' | 'SIN_ASIGNAR' | 'DESCUADRADO' | 'COMPLETO';

export type CertAuditorStatus = 'PENDIENTE' | 'DESBALANCEADO' | 'COMPLETO' | 'SIN_AUDITORIA';

export interface SiteAssignmentReconciliation {
  kind: 'REGULAR' | 'TEMPORAL';
  targetId: string;
  auditId: string;
  label: string;
  requiredDays: number;
  assignedDays: number;
  deltaDays: number;
  isBalanced: boolean;
  hasNoTeam: boolean;
  coveragePct: number;
}

export interface CampaignAsignacionRow {
  program: ProgramaAuditoriaEntity;
  urgency: AuditUrgencyClassification;
  siteReconciliations: SiteAssignmentReconciliation[];
  totalRequiredDays: number;
  totalAssignedDays: number;
  statusKey: Exclude<AsignacionStatusFilter, 'ALL'>;
  hasCompetencyWarning: boolean;
  hasRotationWarning: boolean;
}

export interface AuditAuditorMemberItem {
  assignmentId: string;
  auditorId: string;
  auditorNombre: string;
  rol: AuditorSiteRole;
  days: number;
  wholeSite: boolean;
  competency: {
    level: 'FULL' | 'NORMA_ONLY' | 'PARTIAL';
    label: string;
    badgeClass: string;
  };
  hasScheduleConflict: boolean;
  scheduleConflictMessages: string[];
  hasRotationWarning: boolean;
  rotationWarningMessage: string | null;
  inSituStatus?: AuditorInSituStatus;
  inSituWarning?: string | null;
  inSituBadgeClass?: string;
  observacionSectorWarning?: {
    intersectedSectors: number[];
    rawText: string;
    coveredByExperto: boolean;
    coveringExpertNames: string[];
  } | null;
}

export interface AuditObservacionSectorAlert {
  auditorId: string;
  auditorNombre: string;
  intersectedSectors: number[];
  rawText: string;
  coveredByExperto: boolean;
  coveringExpertNames: string[];
}

export interface AuditAuditableUnit {
  kind: 'REGULAR' | 'TEMPORAL';
  targetId: string;
  auditId: string;
  numeroSitio: number | null;
  isHq: boolean;
  badgeLabel: string;
  title: string;
  subtitle: string;
  modalidad: SiteEvaluationModality | null;
  requiredDays: number;
  assignedDays: number;
  deltaDays: number;
  remainingDays: number;
  coveragePct: number;
  hasNoTeam: boolean;
  hasMissingTime: boolean;
  isBalanced: boolean;
  isExcess: boolean;
  members: AuditAuditorMemberItem[];
}

export interface AssignedAuditorSummaryItem {
  auditorId: string;
  nombre: string;
  isLeader: boolean;
  totalDays: number;
}

export interface AuditScopeIafRequirement {
  sectorIaf: number;
  subsectorCodigo: string | null;
  subsectorDescripcion?: string | null;
  normaCodigos: string[];
  certNumbers: string[];
}

export interface AuditIafGapAffectedAuditor {
  auditorId: string;
  auditorNombre: string;
  competencyLevel: 'NORMA_ONLY' | 'PARTIAL';
  competencyLabel: string;
}

export interface AuditIafGapStatus {
  hasIafSectorGap: boolean;
  allAuditorsMissingIaf: boolean;
  missingCount: number;
  totalAssignedAuditors: number;
  targetSectorLabel: string;
  title: string;
  message: string;
  recommendationNote: string;
  affectedAuditors: AuditIafGapAffectedAuditor[];
  coveredByAssignedExperts: boolean;
  coveringExpertNames: string[];
  availableEligibleExpertsCount: number;
}

export type ExpertoCoverageTier =
  | 'EXACT_ALL'
  | 'PARTIAL_BATCH'
  | 'SECTOR_ONLY'
  | 'NONE';

export interface RankedExpertoOption {
  expertoId: string;
  nombre: string;
  estatus: ExpertoDisponibilidad;
  isUnavailable: boolean;
  isAlreadyAssigned: boolean;
  coverageTier: ExpertoCoverageTier;
  coveredIafLabels: string[];
  optionLabel: string;
}

export interface AssignedExpertoAuditoriaItem {
  id: string;
  id_auditoria: string;
  id_experto_tecnico: string;
  experto_nombre: string;
  experto_estatus: ExpertoDisponibilidad;
  dias_asignados: number;
  observacion: string | null;
  coveredIafLabels: string[];
  coversScopeGap: boolean;
}

export interface AuditAuditorDetailModel {
  audit: ProgramacionAuditEntity;
  cert: CertificadoDetailEntity | null;
  subsectorCodigo: string | null;
  units: AuditAuditableUnit[];
  regularUnitsCount: number;
  hasTemporalActive: boolean;
  temporalEnabledWithoutRecord: boolean;
  requiredDaysTotal: number;
  assignedDaysTotal: number;
  deltaDaysTotal: number;
  balancedUnitsCount: number;
  statusKey: Exclude<CertAuditorStatus, 'SIN_AUDITORIA'>;
  hasMissingRequiredTime: boolean;
  hasNoAuditableUnits: boolean;
  scheduleConflicts: ProgramAuditorScheduleConflict[];
  rotationSummary: LeadAuditorRotationSummary | null;
  hasCompetencyWarning: boolean;
  hasRotationWarning: boolean;
  hasScheduleConflict: boolean;
  hasExcessDiscrepancy: boolean;
  alertReasons: string[];
  assignedSummaries: AssignedAuditorSummaryItem[];
  scopeIafRequirements: AuditScopeIafRequirement[];
  iafGapStatus: AuditIafGapStatus;
  observacionSectoresAlerts: AuditObservacionSectorAlert[];
  assignedExpertos: AssignedExpertoAuditoriaItem[];
  rankedEligibleExpertos: RankedExpertoOption[];
}

export interface CertificateAuditorRow extends CertificateMultiViewRow {
  requiredDays: number;
  assignedDays: number;
  regularRequiredDays: number;
  temporalRequiredDays: number;
  hasTemporalActive: boolean;
  sitesCount: number;
  balancedSitesCount: number;
  statusKey: CertAuditorStatus;
  hasCompetencyWarning: boolean;
  hasRotationWarning: boolean;
  hasScheduleConflict: boolean;
  hasExcessDiscrepancy: boolean;
  alertReasons: string[];
  assignedSummaries: AssignedAuditorSummaryItem[];
  assignedExpertosCount?: number;
  hasIafSectorGap?: boolean;
}

export const EXPERTO_AUDITORIA_OBSERVACION_MAX_LENGTH = 500;

/**
 * Per-site auditor role select options for new assignments (`EXPERTO_TECNICO` is
 * intentionally omitted because technical experts now have their own global entity
 * and `experto_tecnico_auditoria` assignment section).
 */
export const AUDITOR_SITE_ROLE_SELECT_OPTIONS: ReadonlyArray<{
  value: AuditorSiteRole;
  label: string;
}> = [
  { value: 'AUDITOR_LIDER', label: 'Auditor Líder' },
  { value: 'AUDITOR', label: 'Auditor' },
  { value: 'AUDITOR_EN_ENTRENAMIENTO', label: 'Auditor en Entrenamiento' },
];

const VALID_AUDITOR_SITE_ROLES: ReadonlySet<AuditorSiteRole> = new Set([
  'AUDITOR_LIDER',
  'AUDITOR',
  'AUDITOR_EN_ENTRENAMIENTO',
  'EXPERTO_TECNICO',
]);

function roundSignedQuarterDays(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 4) / 4;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Evaluates an auditor's ISO/IEC 17021-1 qualification against standard (`normaCodigo`),
 * IAF sector (`sectorIaf`), and optional IAF sub-sector (`subsectorCodigo`).
 */
export function evaluateAuditorCompetencyMatch(
  auditor: AuditorDetailEntity,
  normaCodigo: string,
  sectorIaf: number,
  subsectorCodigo?: string | null
): {
  level: 'FULL' | 'NORMA_ONLY' | 'PARTIAL';
  label: string;
  badgeClass: string;
} {
  const normBase = normaCodigo.toLowerCase().split(':')[0].trim();
  const hasNorma =
    Boolean(normBase) &&
    (auditor.normas_acreditadas.some((n) => n.toLowerCase().includes(normBase)) ||
      auditor.competencias.some((c) => c.norma_codigo.toLowerCase().includes(normBase)));

  const hasIaf =
    auditor.sectores_iaf.includes(sectorIaf) ||
    auditor.competencias.some((c) => c.sector_iaf_numero === sectorIaf);

  const normalizedSubsector = typeof subsectorCodigo === 'string' ? subsectorCodigo.trim().toLowerCase() : '';
  const hasSubsector =
    !normalizedSubsector ||
    Boolean(
      auditor.subsectorLinks?.some((s) => s.subsector_codigo.toLowerCase().includes(normalizedSubsector))
    ) ||
    auditor.competencias.some((c) =>
      (c.subsector_iaf_codigo || '').toLowerCase().includes(normalizedSubsector)
    );

  if (hasNorma && hasIaf && hasSubsector) {
    return {
      level: 'FULL',
      label: `✓ Calificado (${normaCodigo} · IAF ${sectorIaf})`,
      badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    };
  }
  if (hasNorma && hasIaf) {
    return {
      level: 'NORMA_ONLY',
      label: `⚠ Sin subsector IAF (${subsectorCodigo?.trim() || 'N/D'})`,
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    };
  }
  if (hasNorma) {
    return {
      level: 'NORMA_ONLY',
      label: `⚠ Falta IAF ${sectorIaf}`,
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    };
  }
  return {
    level: 'PARTIAL',
    label: 'ℹ️ Experto / Sin Norma Base',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
  };
}

/**
 * Validates an auditor's `0.25d` assignment against role validity, positive quarter-day steps,
 * UUID integrity, and strict site budget ceiling (`otherAssignedDaysSum + days <= targetRequiredDays`).
 * Returns a Zero-UUID Spanish error message or `null` when valid.
 */
export function validateAuditorTimeAssignment(
  auditorId: string,
  days: number,
  rol: AuditorSiteRole,
  targetRequiredDays: number,
  otherAssignedDaysSum: number
): string | null {
  if (!isValidUuid(auditorId)) {
    return 'Seleccione un auditor válido.';
  }
  assertValidUuid(auditorId, 'auditor');

  if (!isValidQuarterDayAmount(days) || days <= 0) {
    return 'Las jornadas asignadas al auditor deben ser mayores a 0 en múltiplos de 0.25 días.';
  }
  if (!VALID_AUDITOR_SITE_ROLES.has(rol)) {
    return 'Rol de auditor inválido.';
  }
  if (!Number.isFinite(targetRequiredDays) || targetRequiredDays <= 0) {
    return 'El sitio seleccionado aún no tiene días-auditor requeridos en 2. Tiempo (o 1.5 Temporal).';
  }
  const safeOtherSum = Number.isFinite(otherAssignedDaysSum) && otherAssignedDaysSum >= 0
    ? otherAssignedDaysSum
    : 0;
  const projected = roundAuditDaysQuarter(safeOtherSum + days);
  if (projected > targetRequiredDays + 0.001) {
    return `La suma (${projected.toFixed(2)} d) excede los días requeridos del sitio (${targetRequiredDays.toFixed(2)} d).`;
  }
  return null;
}

/**
 * Strict unit balance rule required by Step 6.1 (`3. Auditor`):
 * complete ONLY when `assignedCount >= 1` AND `requiredDays > 0` AND `Math.abs(assignedDays - requiredDays) < 0.001`.
 */
export function isAuditableUnitExactlyBalanced(
  assignedCount: number,
  assignedDays: number,
  requiredDays: number
): boolean {
  return (
    assignedCount >= 1 &&
    requiredDays > 0 &&
    Math.abs(assignedDays - requiredDays) < 0.001
  );
}

/**
 * Collects distinct `(sector_iaf, subsector_iaf)` pairs across the active audit
 * and its linked sibling audits (same `id_programa_auditoria`).
 */
export function collectAuditScopeIafRequirements(
  activeAudit: ProgramacionAuditEntity,
  audits: ReadonlyArray<ProgramacionAuditEntity>,
  programs: ReadonlyArray<ProgramaAuditoriaEntity>,
  certificados: ReadonlyArray<CertificadoDetailEntity>
): AuditScopeIafRequirement[] {
  const scopeAuditsMap = new Map<string, ProgramacionAuditEntity>();
  scopeAuditsMap.set(activeAudit.id, activeAudit);

  const progId = activeAudit.id_programa_auditoria || '';
  if (progId) {
    const matchedProgram = programs.find((p) => !p.deleted_at && p.id === progId);
    if (matchedProgram) {
      for (const a of matchedProgram.auditorias) {
        if (!a.deleted_at && !scopeAuditsMap.has(a.id)) {
          scopeAuditsMap.set(a.id, a);
        }
      }
    }
    for (const a of audits) {
      if (!a.deleted_at && a.id_programa_auditoria === progId && !scopeAuditsMap.has(a.id)) {
        scopeAuditsMap.set(a.id, a);
      }
    }
  }

  const byKey = new Map<string, AuditScopeIafRequirement>();
  for (const aud of scopeAuditsMap.values()) {
    const cert =
      certificados.find((c) => !('deleted_at' in c && c.deleted_at) && c.id === aud.id_certificado) ??
      null;
    const snapshot = cert ? resolveCertVersionSnapshotForAudit(aud, certificados) : null;
    const sectorIaf = Number(cert?.sector_iaf ?? aud.sector_iaf ?? 0);
    if (!Number.isFinite(sectorIaf) || sectorIaf <= 0) continue;

    const rawSub = snapshot?.subsectorIafCodigo ?? cert?.subsector_iaf_codigo ?? null;
    const subsectorCodigo = rawSub && rawSub.trim() ? rawSub.trim() : null;
    const subsectorDescripcion = cert?.subsector_iaf_descripcion ?? null;
    const key = `${sectorIaf}::${(subsectorCodigo || '').toLowerCase()}`;
    const existing = byKey.get(key);
    if (existing) {
      if (aud.norma_codigo && !existing.normaCodigos.includes(aud.norma_codigo)) {
        existing.normaCodigos.push(aud.norma_codigo);
      }
      if (aud.numero_certificado && !existing.certNumbers.includes(aud.numero_certificado)) {
        existing.certNumbers.push(aud.numero_certificado);
      }
    } else {
      byKey.set(key, {
        sectorIaf,
        subsectorCodigo,
        subsectorDescripcion,
        normaCodigos: aud.norma_codigo ? [aud.norma_codigo] : [],
        certNumbers: aud.numero_certificado ? [aud.numero_certificado] : [],
      });
    }
  }

  return Array.from(byKey.values());
}

function evaluateExpertoCoverageForRequirement(
  experto: ExpertoTecnicoDetailEntity,
  req: AuditScopeIafRequirement
): 'EXACT_SUBSECTOR' | 'FULL_SECTOR' | 'SAME_SECTOR_OTHER_SUBSECTOR' | 'NONE' {
  const normSub = (req.subsectorCodigo || '').trim().toLowerCase();
  const hasFullSector = experto.sectorLinks.some((s) => s.sector_numero === req.sectorIaf);
  const hasExactSub = Boolean(
    normSub &&
      experto.subsectorLinks.some(
        (sub) => sub.subsector_codigo.trim().toLowerCase() === normSub
      )
  );

  if (normSub) {
    if (hasExactSub) return 'EXACT_SUBSECTOR';
    if (hasFullSector) return 'FULL_SECTOR';
    const hasSameSectorOtherSub = experto.subsectorLinks.some(
      (sub) => sub.sector_numero === req.sectorIaf
    );
    return hasSameSectorOtherSub ? 'SAME_SECTOR_OTHER_SUBSECTOR' : 'NONE';
  }

  return hasFullSector ? 'FULL_SECTOR' : 'NONE';
}

export function evaluateExpertoScopeCoverage(
  experto: ExpertoTecnicoDetailEntity,
  scopeRequirements: ReadonlyArray<AuditScopeIafRequirement>
): {
  coverageTier: ExpertoCoverageTier;
  coveredIafLabels: string[];
  coversAnyRequirement: boolean;
} {
  if (scopeRequirements.length === 0) {
    return {
      coverageTier: 'NONE',
      coveredIafLabels: [],
      coversAnyRequirement: false,
    };
  }

  let matchedCount = 0;
  let exactSubMatchCount = 0;
  let sameSectorPartialCount = 0;
  const labels: string[] = [];

  for (const req of scopeRequirements) {
    const match = evaluateExpertoCoverageForRequirement(experto, req);
    if (match === 'EXACT_SUBSECTOR') {
      matchedCount += 1;
      exactSubMatchCount += 1;
      labels.push(`Sub-Sector ${req.subsectorCodigo}`);
    } else if (match === 'FULL_SECTOR') {
      matchedCount += 1;
      labels.push(
        req.subsectorCodigo
          ? `Sector ${req.sectorIaf} (cubre ${req.subsectorCodigo})`
          : `Sector IAF ${req.sectorIaf}`
      );
    } else if (match === 'SAME_SECTOR_OTHER_SUBSECTOR') {
      sameSectorPartialCount += 1;
    }
  }

  const coverageTier: ExpertoCoverageTier =
    matchedCount === scopeRequirements.length && (exactSubMatchCount > 0 || matchedCount > 0)
      ? 'EXACT_ALL'
      : matchedCount > 0
      ? 'PARTIAL_BATCH'
      : sameSectorPartialCount > 0
      ? 'SECTOR_ONLY'
      : 'NONE';

  return {
    coverageTier,
    coveredIafLabels: labels,
    coversAnyRequirement: matchedCount > 0,
  };
}

/**
 * Ranks active (`!deleted_at`) Technical Experts by availability and IAF sector/subsector
 * match against the audit or linked batch scope.
 */
export function rankEligibleExpertosForAudit(params: {
  expertos: ReadonlyArray<ExpertoTecnicoDetailEntity>;
  scopeRequirements: ReadonlyArray<AuditScopeIafRequirement>;
  assignedExpertoIds?: ReadonlySet<string> | ReadonlyArray<string>;
}): RankedExpertoOption[] {
  const assignedSet =
    params.assignedExpertoIds instanceof Set
      ? params.assignedExpertoIds
      : new Set(params.assignedExpertoIds ?? []);

  const activeExpertos = params.expertos.filter((e) => !e.deleted_at);

  const ranked = activeExpertos.map((exp): RankedExpertoOption & { sortScore: number } => {
    const isUnavailable = exp.estatus === 'No disponible';
    const isAlreadyAssigned = assignedSet.has(exp.id);
    const cov = evaluateExpertoScopeCoverage(exp, params.scopeRequirements);

    let tierRank = 3;
    if (cov.coverageTier === 'EXACT_ALL') tierRank = 0;
    else if (cov.coverageTier === 'PARTIAL_BATCH') tierRank = 1;
    else if (cov.coverageTier === 'SECTOR_ONLY') tierRank = 2;

    const availabilityPenalty = isUnavailable ? 10 : 0;
    const assignedPenalty = isAlreadyAssigned ? 5 : 0;
    const sortScore = availabilityPenalty + tierRank + assignedPenalty;

    const covHint =
      cov.coveredIafLabels.length > 0
        ? cov.coveredIafLabels.join(', ')
        : cov.coverageTier === 'SECTOR_ONLY'
        ? 'Otro subsector del mismo sector'
        : 'Sin competencia IAF en alcance';

    const statusTag = isUnavailable ? '[No disponible]' : 'Disponible';
    const assignedTag = isAlreadyAssigned ? ' · Ya asignado' : '';
    const optionLabel = `${exp.nombre} — ${covHint} · ${statusTag}${assignedTag}`;

    return {
      expertoId: exp.id,
      nombre: exp.nombre,
      estatus: exp.estatus,
      isUnavailable,
      isAlreadyAssigned,
      coverageTier: cov.coverageTier,
      coveredIafLabels: cov.coveredIafLabels,
      optionLabel,
      sortScore,
    };
  });

  ranked.sort((a, b) => {
    if (a.sortScore !== b.sortScore) return a.sortScore - b.sortScore;
    return a.nombre.localeCompare(b.nombre, 'es');
  });

  return ranked.map(({ sortScore: _discard, ...rest }) => rest);
}

/**
 * Validates a global `experto_tecnico_auditoria` assignment draft (independent of per-site auditor day sum).
 */
export function validateExpertoAuditoriaAssignmentDraft(params: {
  auditId: string;
  expertoId: string;
  diasAsignados: number;
  observacion?: string | null;
  existingAssignments: ReadonlyArray<Pick<ExpertoTecnicoAuditoriaEntity, 'id' | 'id_experto_tecnico' | 'deleted_at'>>;
  allowSelfId?: string | null;
}): {
  valid: boolean;
  message: string | null;
  normalized?: {
    id_auditoria: string;
    id_experto_tecnico: string;
    dias_asignados: number;
    observacion: string | null;
  };
} {
  if (!isValidUuid(params.auditId)) {
    return { valid: false, message: 'Auditoría inválida para asignar experto técnico.' };
  }
  assertValidUuid(params.auditId, 'auditoría');

  if (!isValidUuid(params.expertoId)) {
    return { valid: false, message: 'Seleccione un experto técnico válido.' };
  }
  assertValidUuid(params.expertoId, 'experto técnico');

  if (!isValidQuarterDayAmount(params.diasAsignados) || params.diasAsignados <= 0) {
    return {
      valid: false,
      message:
        'Los días asignados al experto técnico deben ser mayores a 0 en múltiplos de 0.25 días.',
    };
  }

  const trimmedObs = typeof params.observacion === 'string' ? params.observacion.trim() : '';
  if (trimmedObs.length > EXPERTO_AUDITORIA_OBSERVACION_MAX_LENGTH) {
    return {
      valid: false,
      message: `La observación del experto técnico no puede exceder los ${EXPERTO_AUDITORIA_OBSERVACION_MAX_LENGTH} caracteres.`,
    };
  }
  if (trimmedObs && containsRawUuid(trimmedObs)) {
    return {
      valid: false,
      message: 'La observación del experto técnico no puede contener identificadores internos.',
    };
  }

  const isDuplicate = params.existingAssignments.some(
    (a) =>
      !a.deleted_at &&
      a.id_experto_tecnico === params.expertoId &&
      (!params.allowSelfId || a.id !== params.allowSelfId)
  );
  if (isDuplicate) {
    return {
      valid: false,
      message: 'Este experto técnico ya está asignado a la auditoría.',
    };
  }

  return {
    valid: true,
    message: null,
    normalized: {
      id_auditoria: params.auditId,
      id_experto_tecnico: params.expertoId,
      dias_asignados: roundAuditDaysQuarter(params.diasAsignados),
      observacion: trimmedObs || null,
    },
  };
}

/**
 * Computes non-blocking IAF sector/sub-sector competency gap status for an audit's assigned team.
 */
export function computeAuditIafGapStatus(params: {
  activeAudit: ProgramacionAuditEntity;
  subsectorCodigo: string | null;
  units: ReadonlyArray<AuditAuditableUnit>;
  scopeRequirements: ReadonlyArray<AuditScopeIafRequirement>;
  assignedExpertos: ReadonlyArray<AssignedExpertoAuditoriaItem>;
  rankedEligibleExpertos: ReadonlyArray<RankedExpertoOption>;
}): AuditIafGapStatus {
  const {
    activeAudit,
    subsectorCodigo,
    units,
    scopeRequirements,
    assignedExpertos,
    rankedEligibleExpertos,
  } = params;

  const targetSectorLabel = subsectorCodigo
    ? `Sub-Sector ${subsectorCodigo}`
    : `Sector IAF ${activeAudit.sector_iaf}`;

  const distinctMembers = new Map<string, AuditAuditorMemberItem>();
  for (const unit of units) {
    for (const member of unit.members) {
      if (!distinctMembers.has(member.auditorId)) {
        distinctMembers.set(member.auditorId, member);
      }
    }
  }

  const totalAssignedAuditors = distinctMembers.size;
  const affectedAuditors: AuditIafGapAffectedAuditor[] = [];
  for (const member of distinctMembers.values()) {
    if (
      member.competency.level !== 'FULL' &&
      member.competency.label !== 'ℹ️ Perfil no cargado'
    ) {
      affectedAuditors.push({
        auditorId: member.auditorId,
        auditorNombre: member.auditorNombre,
        competencyLevel: member.competency.level,
        competencyLabel: member.competency.label,
      });
    }
  }

  const coveringExpertNames = assignedExpertos
    .filter((exp) => exp.coversScopeGap)
    .map((exp) => exp.experto_nombre);
  const coveredByAssignedExperts = coveringExpertNames.length > 0;
  const availableEligibleExpertsCount = rankedEligibleExpertos.filter(
    (opt) =>
      !opt.isUnavailable &&
      (opt.coverageTier === 'EXACT_ALL' || opt.coverageTier === 'PARTIAL_BATCH')
  ).length;

  if (totalAssignedAuditors === 0 || affectedAuditors.length === 0) {
    return {
      hasIafSectorGap: false,
      allAuditorsMissingIaf: false,
      missingCount: 0,
      totalAssignedAuditors,
      targetSectorLabel,
      title: '',
      message: '',
      recommendationNote: '',
      affectedAuditors: [],
      coveredByAssignedExperts,
      coveringExpertNames,
      availableEligibleExpertsCount,
    };
  }

  const allAuditorsMissingIaf = affectedAuditors.length === totalAssignedAuditors;
  const batchSuffix =
    scopeRequirements.length > 1
      ? ` (alcance de lote con ${scopeRequirements.length} sectores/subsectores IAF)`
      : '';

  const title = allAuditorsMissingIaf
    ? `Todo el equipo auditor carece de competencia IAF completa en ${targetSectorLabel}`
    : `Parte del equipo auditor carece de competencia IAF completa en ${targetSectorLabel}`;

  const message = allAuditorsMissingIaf
    ? `Equipo sin competencia IAF completa en ${targetSectorLabel} (Calificado en norma ${activeAudit.norma_codigo})${batchSuffix}.`
    : `${affectedAuditors.length} de ${totalAssignedAuditors} auditores del equipo carecen de competencia IAF completa en ${targetSectorLabel} (${activeAudit.norma_codigo})${batchSuffix}.`;

  const recommendationNote = coveredByAssignedExperts
    ? `Cobertura respaldada por Experto Técnico asignado: ${coveringExpertNames.join(', ')}.`
    : availableEligibleExpertsCount > 0
    ? `Indicador no bloqueante: hay ${availableEligibleExpertsCount} experto${
        availableEligibleExpertsCount === 1 ? '' : 's'
      } técnico${availableEligibleExpertsCount === 1 ? '' : 's'} disponible${
        availableEligibleExpertsCount === 1 ? '' : 's'
      } para este alcance (asignación opcional).`
    : 'Indicador no bloqueante: puede continuar y guardar la auditoría o asignar un Experto Técnico global si lo requiere.';

  return {
    hasIafSectorGap: true,
    allAuditorsMissingIaf,
    missingCount: affectedAuditors.length,
    totalAssignedAuditors,
    targetSectorLabel,
    title,
    message,
    recommendationNote,
    affectedAuditors,
    coveredByAssignedExperts,
    coveringExpertNames,
    availableEligibleExpertsCount,
  };
}

function buildSynthesizedProgramsForHistory(
  audits: ReadonlyArray<ProgramacionAuditEntity>,
  programs: ReadonlyArray<ProgramaAuditoriaEntity>
): ProgramaAuditoriaEntity[] {
  const activePrograms = programs.filter((p) => !p.deleted_at);
  const coveredAuditIds = new Set<string>();
  for (const p of activePrograms) {
    for (const a of p.auditorias) {
      if (!a.deleted_at) coveredAuditIds.add(a.id);
    }
  }
  const extraPrograms: ProgramaAuditoriaEntity[] = [];
  for (const a of audits) {
    if (a.deleted_at || coveredAuditIds.has(a.id)) continue;
    extraPrograms.push({
      id: a.id_programa_auditoria || a.id,
      id_vinculo: null,
      id_grupo_empresarial: null,
      codigo_programa: a.codigo_auditoria,
      etiqueta: `${a.numero_certificado} · ${a.organizacion_nombre}`,
      nivel_vinculacion: 'INDIVIDUAL',
      tipo_vinculacion: 'Individual',
      es_vinculada: false,
      tiene_sitio_temporal: Boolean(a.tiene_sitio_temporal),
      id_ciclo_origen: null,
      notas: null,
      deleted_at: null,
      auditorias: [a],
    });
  }
  return [...activePrograms, ...extraPrograms];
}

function resolveTemporalEntityForAudit(
  activeAudit: ProgramacionAuditEntity,
  audits: ReadonlyArray<ProgramacionAuditEntity>,
  programs: ReadonlyArray<ProgramaAuditoriaEntity>,
  temporalSites: ReadonlyArray<AuditoriaSitioTemporalEntity>
): {
  isTemporalEnabled: boolean;
  temporalSite: AuditoriaSitioTemporalEntity | null;
} {
  const res = resolveLinkedBatchTemporalState(activeAudit, audits, programs, temporalSites);
  const directMatch =
    res.primaryTemporalSite ??
    temporalSites.find(
      (t) =>
        !t.deleted_at &&
        (t.id_auditoria === activeAudit.id ||
          t.certificados.some((cl) => !cl.deleted_at && cl.id_auditoria_certificado === activeAudit.id))
    ) ??
    null;

  return {
    isTemporalEnabled: res.isTemporalEnabled || Boolean(directMatch),
    temporalSite: directMatch,
  };
}

/**
 * Step 6.1 — Builds unified auditable units (`REGULAR` sites ordered `Sitio 0` first + active `TEMPORAL` site)
 * and live reconciliation diagnostics for a single Certificate audit in `3. Auditor`.
 */
export function buildAuditAuditorDetail(opts: {
  activeAudit: ProgramacionAuditEntity;
  audits: ReadonlyArray<ProgramacionAuditEntity>;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  temporalSites: ReadonlyArray<AuditoriaSitioTemporalEntity>;
  auditors: ReadonlyArray<AuditorDetailEntity>;
  certificados: ReadonlyArray<CertificadoDetailEntity>;
  expertos?: ReadonlyArray<ExpertoTecnicoDetailEntity>;
  auditExpertAssignments?: ReadonlyArray<ExpertoTecnicoAuditoriaEntity>;
  alertConfig?: AlertConfigEntity;
  precomputedConflicts?: ReadonlyArray<ProgramAuditorScheduleConflict>;
  precomputedProgramsPool?: ReadonlyArray<ProgramaAuditoriaEntity>;
}): AuditAuditorDetailModel {
  const {
    activeAudit,
    audits,
    programs,
    temporalSites,
    auditors,
    certificados,
    expertos = [],
    auditExpertAssignments,
    alertConfig,
    precomputedConflicts,
    precomputedProgramsPool,
  } = opts;

  const programsPool = precomputedProgramsPool ?? buildSynthesizedProgramsForHistory(audits, programs);
  const allConflicts = precomputedConflicts ?? detectAuditorScheduleConflicts(programsPool);
  const auditorById = new Map(auditors.map((a) => [a.id, a]));
  const cert = certificados.find((c) => !('deleted_at' in c && c.deleted_at) && c.id === activeAudit.id_certificado) ?? null;
  const snapshot = cert ? resolveCertVersionSnapshotForAudit(activeAudit, certificados) : null;
  const subsectorCodigo = snapshot?.subsectorIafCodigo ?? cert?.subsector_iaf_codigo ?? null;
  const rotationThreshold = alertConfig?.ciclos_rotacion_auditor_lider ?? 3;

  const digest = buildCertificateAuditHistoryDigest(
    activeAudit.id_certificado,
    activeAudit.id,
    programsPool,
    null,
    rotationThreshold
  );
  const rotationSummary = digest.leadAuditorRotation;

  const auditProgramId = activeAudit.id_programa_auditoria || activeAudit.id;
  const auditConflicts = allConflicts.filter(
    (c) =>
      c.program_a_id === auditProgramId ||
      c.program_b_id === auditProgramId
  );

  const auditorMap = new Map<string, AssignedAuditorSummaryItem>();
  let hasCompetencyWarning = false;
  let hasRotationWarning = false;
  const assignedLeadIds = new Set<string>();

  const resolvedSectorIaf = Number(cert?.sector_iaf ?? activeAudit.sector_iaf ?? 0);

  const scopeIafRequirements = collectAuditScopeIafRequirements(
    activeAudit,
    audits,
    programs,
    certificados
  );
  const expertoById = new Map(expertos.map((e) => [e.id, e]));
  const rawExpertAssignments = (
    auditExpertAssignments ??
    activeAudit.expertoTecnicoAsignaciones ??
    []
  ).filter((item) => !item.deleted_at);

  const activeAuditReq: AuditScopeIafRequirement | null =
    Number.isFinite(resolvedSectorIaf) && resolvedSectorIaf > 0
      ? {
          sectorIaf: resolvedSectorIaf,
          subsectorCodigo,
          normaCodigos: activeAudit.norma_codigo ? [activeAudit.norma_codigo] : [],
          certNumbers: activeAudit.numero_certificado ? [activeAudit.numero_certificado] : [],
        }
      : null;

  const assignedExpertos: AssignedExpertoAuditoriaItem[] = rawExpertAssignments.map((item) => {
    const expObj = expertoById.get(item.id_experto_tecnico);
    const cov = expObj
      ? evaluateExpertoScopeCoverage(expObj, scopeIafRequirements)
      : {
          coverageTier: 'NONE' as const,
          coveredIafLabels: [],
          coversAnyRequirement: false,
        };
    const activeAuditCovMatch =
      expObj && activeAuditReq
        ? evaluateExpertoCoverageForRequirement(expObj, activeAuditReq)
        : 'NONE';
    const coversActiveAuditGap = activeAuditReq
      ? activeAuditCovMatch === 'EXACT_SUBSECTOR' || activeAuditCovMatch === 'FULL_SECTOR'
      : cov.coversAnyRequirement;
    return {
      id: item.id,
      id_auditoria: item.id_auditoria,
      id_experto_tecnico: item.id_experto_tecnico,
      experto_nombre: item.experto_nombre || expObj?.nombre || 'Experto Técnico',
      experto_estatus: item.experto_estatus || expObj?.estatus || 'Disponible',
      dias_asignados: roundAuditDaysQuarter(item.dias_asignados),
      observacion: item.observacion ?? null,
      coveredIafLabels: cov.coveredIafLabels,
      coversScopeGap: coversActiveAuditGap,
    };
  });

  const targetAuditSectors = new Set<number>();
  if (Number.isFinite(resolvedSectorIaf) && resolvedSectorIaf > 0) {
    targetAuditSectors.add(resolvedSectorIaf);
  }
  for (const req of scopeIafRequirements) {
    if (Number.isFinite(req.sectorIaf) && req.sectorIaf > 0) {
      targetAuditSectors.add(req.sectorIaf);
    }
  }
  const observacionAlertsMap = new Map<string, AuditObservacionSectorAlert>();

  const buildMember = (m: {
    id: string;
    id_auditor: string;
    auditor_nombre: string;
    rol_auditor: AuditorSiteRole;
    tiempo_auditoria: number;
    asignacion_completa_sitio?: boolean;
  }): AuditAuditorMemberItem => {
    const audObj = auditorById.get(m.id_auditor);
    const resolvedMemberName = audObj
      ? formatAuditorDisplayLabel(audObj)
      : m.auditor_nombre || 'Auditor Calificado';
    const competency = audObj
      ? evaluateAuditorCompetencyMatch(
          audObj,
          activeAudit.norma_codigo,
          resolvedSectorIaf,
          subsectorCodigo
        )
      : {
          level: 'PARTIAL' as const,
          label: 'ℹ️ Perfil no cargado',
          badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
        };
    if (audObj && competency.level !== 'FULL') {
      hasCompetencyWarning = true;
    }

    const memberConflicts = auditConflicts.filter((c) => c.id_auditor === m.id_auditor);
    const hasMemberConflict = memberConflicts.length > 0;
    const isLeader = m.rol_auditor === 'AUDITOR_LIDER';
    if (isLeader) assignedLeadIds.add(m.id_auditor);

    const hasMemberRotation = Boolean(
      isLeader &&
        rotationSummary.requiresRotation &&
        rotationSummary.leadAuditorId === m.id_auditor
    );
    if (hasMemberRotation) {
      hasRotationWarning = true;
    }

    const inSituStatus = audObj ? evaluateAuditorInSituStatus(audObj) : undefined;
    const inSituVisual = inSituStatus ? getAuditorInSituStatusVisual(inSituStatus) : undefined;
    const inSituWarning =
      inSituStatus === 'Vencido'
        ? 'Ev. In Situ vencida'
        : inSituStatus === 'S/R'
        ? 'Ev. In Situ S/R'
        : inSituStatus === 'Pendiente Evaluación'
        ? 'Ev. In Situ pendiente'
        : inSituStatus === 'Condicionado'
        ? 'Ev. In Situ condicionada'
        : null;

    let observacionSectorWarning: AuditAuditorMemberItem['observacionSectorWarning'] = null;
    if (audObj && targetAuditSectors.size > 0) {
      const obsClass = classifyAuditorObservacionSector(audObj);
      if (obsClass.requiereExpertoTecnico) {
        const intersectedSectors =
          obsClass.sectoresCondicionados.length > 0
            ? obsClass.sectoresCondicionados.filter((sec) => targetAuditSectors.has(sec))
            : Array.from(targetAuditSectors).sort((a, b) => a - b);

        if (intersectedSectors.length > 0) {
          const coveringExpertNames = assignedExpertos
            .filter((assigned) => {
              const expObj = expertoById.get(assigned.id_experto_tecnico);
              if (!expObj) return assigned.coversScopeGap;
              return intersectedSectors.some((sec) => {
                const reqsForSec = scopeIafRequirements.filter((r) => r.sectorIaf === sec);
                if (reqsForSec.length > 0) {
                  return reqsForSec.some((req) => {
                    const covMatch = evaluateExpertoCoverageForRequirement(expObj, req);
                    return covMatch === 'EXACT_SUBSECTOR' || covMatch === 'FULL_SECTOR';
                  });
                }
                return (
                  expObj.sectorLinks.some((s) => s.sector_numero === sec) ||
                  expObj.subsectorLinks.some((sub) => sub.sector_numero === sec)
                );
              });
            })
            .map((e) => e.experto_nombre);

          const coveredByExperto = coveringExpertNames.length > 0;
          observacionSectorWarning = {
            intersectedSectors,
            rawText: obsClass.textoAlerta,
            coveredByExperto,
            coveringExpertNames,
          };
          if (!observacionAlertsMap.has(m.id_auditor)) {
            observacionAlertsMap.set(m.id_auditor, {
              auditorId: m.id_auditor,
              auditorNombre: resolvedMemberName,
              intersectedSectors,
              rawText: obsClass.textoAlerta,
              coveredByExperto,
              coveringExpertNames,
            });
          }
        }
      }
    }

    const existing = auditorMap.get(m.id_auditor);
    if (existing) {
      existing.totalDays = roundAuditDaysQuarter(existing.totalDays + m.tiempo_auditoria);
      if (isLeader) existing.isLeader = true;
    } else {
      auditorMap.set(m.id_auditor, {
        auditorId: m.id_auditor,
        nombre: resolvedMemberName,
        isLeader,
        totalDays: roundAuditDaysQuarter(m.tiempo_auditoria),
      });
    }

    return {
      assignmentId: m.id,
      auditorId: m.id_auditor,
      auditorNombre: resolvedMemberName,
      rol: m.rol_auditor,
      days: roundAuditDaysQuarter(m.tiempo_auditoria),
      wholeSite: m.asignacion_completa_sitio ?? true,
      competency,
      hasScheduleConflict: hasMemberConflict,
      scheduleConflictMessages: memberConflicts.map((c) => c.message),
      hasRotationWarning: hasMemberRotation,
      rotationWarningMessage: hasMemberRotation ? rotationSummary.warningMessage : null,
      inSituStatus,
      inSituWarning,
      inSituBadgeClass: inSituVisual?.badgeClass,
      observacionSectorWarning,
    };
  };

  const rawActivePlanSites = (activeAudit.sitiosPlan || []).filter((s) => !s.deleted_at);
  const shouldScopeBySnapshot =
    Boolean(cert && snapshot) &&
    ((cert!.versiones ?? []).some((v) => !v.deleted_at) || (cert!.sitios ?? []).length > 0) &&
    (snapshot!.sitios.length > 0 || Boolean(activeAudit.id_certificado_version));
  const snapshotSiteIds = shouldScopeBySnapshot
    ? new Set(snapshot!.sitios.map((s) => s.id))
    : null;
  const orderedSites = (
    snapshotSiteIds
      ? rawActivePlanSites.filter((s) => snapshotSiteIds.has(s.id_sitio))
      : rawActivePlanSites
  )
    .slice()
    .sort((a, b) => a.numero_sitio - b.numero_sitio);

  const units: AuditAuditableUnit[] = orderedSites.map((site) => {
    const activeTeam = (site.equipoSitio || []).filter((m) => !m.deleted_at);
    const members = activeTeam.map((m) => buildMember(m));
    const requiredDays = roundAuditDaysQuarter(Math.max(0, site.tiempo_auditoria || 0));
    const assignedDays = roundAuditDaysQuarter(
      members.reduce((sum, m) => sum + Math.max(0, m.days), 0)
    );
    const deltaDays = roundSignedQuarterDays(assignedDays - requiredDays);
    const remainingDays = Math.max(0, roundAuditDaysQuarter(requiredDays - assignedDays));
    const isBalanced = isAuditableUnitExactlyBalanced(members.length, assignedDays, requiredDays);
    const isHq = site.numero_sitio === 0;

    return {
      kind: 'REGULAR',
      targetId: site.id,
      auditId: activeAudit.id,
      numeroSitio: site.numero_sitio,
      isHq,
      badgeLabel: isHq ? 'Sitio 0 · HQ' : `Sitio #${site.numero_sitio}`,
      title: site.nombre_sitio,
      subtitle: site.direccion_sitio || '',
      modalidad: site.modalidad_evaluacion || 'Presencial',
      requiredDays,
      assignedDays,
      deltaDays,
      remainingDays,
      coveragePct: requiredDays > 0 ? Math.min(100, Math.round((assignedDays / requiredDays) * 100)) : 0,
      hasNoTeam: members.length === 0,
      hasMissingTime: requiredDays <= 0,
      isBalanced,
      isExcess: deltaDays > 0.001,
      members,
    };
  });

  const tempResolved = resolveTemporalEntityForAudit(
    activeAudit,
    audits,
    programs,
    temporalSites
  );
  const temporalEnabledWithoutRecord =
    tempResolved.isTemporalEnabled && !tempResolved.temporalSite;

  if (tempResolved.isTemporalEnabled && tempResolved.temporalSite) {
    const t = tempResolved.temporalSite;
    const details = parseTemporalSiteDetails(t.comentario);
    const activeTeam = (t.equipoTemporal || []).filter((m) => !m.deleted_at);
    const members = activeTeam.map((m) => buildMember(m));
    const requiredDays = roundAuditDaysQuarter(Math.max(0, t.tiempo_auditoria || 0));
    const assignedDays = roundAuditDaysQuarter(
      members.reduce((sum, m) => sum + Math.max(0, m.days), 0)
    );
    const deltaDays = roundSignedQuarterDays(assignedDays - requiredDays);
    const remainingDays = Math.max(0, roundAuditDaysQuarter(requiredDays - assignedDays));
    const isBalanced = isAuditableUnitExactlyBalanced(members.length, assignedDays, requiredDays);

    units.push({
      kind: 'TEMPORAL',
      targetId: t.id,
      auditId: t.id_auditoria,
      numeroSitio: null,
      isHq: false,
      badgeLabel: 'TEMPORAL',
      title: `Sitio Temporal — ${t.etiqueta}`,
      subtitle: details.ubicacion
        ? `${details.ubicacion}${details.fecha_tentativa ? ` · ${details.fecha_tentativa}` : ''}`
        : details.fecha_tentativa || 'Sitio Temporal Activo (1.5 Temporal)',
      modalidad: null,
      requiredDays,
      assignedDays,
      deltaDays,
      remainingDays,
      coveragePct: requiredDays > 0 ? Math.min(100, Math.round((assignedDays / requiredDays) * 100)) : 0,
      hasNoTeam: members.length === 0,
      hasMissingTime: requiredDays <= 0,
      isBalanced,
      isExcess: deltaDays > 0.001,
      members,
    });
  }

  if (
    !hasRotationWarning &&
    rotationSummary.requiresRotation &&
    rotationSummary.leadAuditorId &&
    (assignedLeadIds.has(rotationSummary.leadAuditorId) ||
      (assignedLeadIds.size === 0 && activeAudit.auditor_lider_id === rotationSummary.leadAuditorId))
  ) {
    hasRotationWarning = true;
  }

  const requiredDaysTotal = roundAuditDaysQuarter(
    units.reduce((sum, u) => sum + u.requiredDays, 0)
  );
  const assignedDaysTotal = roundAuditDaysQuarter(
    units.reduce((sum, u) => sum + u.assignedDays, 0)
  );
  const deltaDaysTotal = roundSignedQuarterDays(assignedDaysTotal - requiredDaysTotal);
  const balancedUnitsCount = units.filter((u) => u.isBalanced).length;
  const hasExcessDiscrepancy = units.some((u) => u.isExcess);
  const hasMissingRequiredTime =
    temporalEnabledWithoutRecord || units.some((u) => u.hasMissingTime);
  const hasNoAuditableUnits = units.length === 0 && !temporalEnabledWithoutRecord;

  const hasAnyTeam = units.some((u) => u.members.length > 0);
  const allBalanced =
    units.length > 0 &&
    !temporalEnabledWithoutRecord &&
    units.every((u) => u.isBalanced);

  const statusKey: Exclude<CertAuditorStatus, 'SIN_AUDITORIA'> = allBalanced
    ? 'COMPLETO'
    : !hasAnyTeam
    ? 'PENDIENTE'
    : 'DESBALANCEADO';

  const hasScheduleConflict = auditConflicts.length > 0;
  const alertReasons: string[] = [];
  if (hasScheduleConflict) {
    alertReasons.push(
      `${auditConflicts.length} conflicto${auditConflicts.length === 1 ? '' : 's'} de calendario`
    );
  }
  if (hasRotationWarning) {
    alertReasons.push('Alerta rotación de Auditor Líder ISO 17021-1');
  }
  if (hasCompetencyWarning) {
    alertReasons.push('Competencia parcial (norma/IAF/subsector)');
  }
  if (hasExcessDiscrepancy) {
    alertReasons.push('Exceso de días asignados en sitio');
  }

  const assignedExpertoIds = new Set(assignedExpertos.map((e) => e.id_experto_tecnico));
  const rankedEligibleExpertos = rankEligibleExpertosForAudit({
    expertos,
    scopeRequirements: scopeIafRequirements,
    assignedExpertoIds,
  });

  const iafGapStatus = computeAuditIafGapStatus({
    activeAudit,
    subsectorCodigo,
    units,
    scopeRequirements: scopeIafRequirements,
    assignedExpertos,
    rankedEligibleExpertos,
  });

  const assignedSummaries = Array.from(auditorMap.values()).sort((a, b) => {
    if (a.isLeader !== b.isLeader) return a.isLeader ? -1 : 1;
    return b.totalDays - a.totalDays;
  });

  return {
    audit: activeAudit,
    cert,
    subsectorCodigo,
    units,
    regularUnitsCount: orderedSites.length,
    hasTemporalActive: tempResolved.isTemporalEnabled,
    temporalEnabledWithoutRecord,
    requiredDaysTotal,
    assignedDaysTotal,
    deltaDaysTotal,
    balancedUnitsCount,
    statusKey,
    hasMissingRequiredTime,
    hasNoAuditableUnits,
    scheduleConflicts: auditConflicts,
    rotationSummary,
    hasCompetencyWarning,
    hasRotationWarning,
    hasScheduleConflict,
    hasExcessDiscrepancy,
    alertReasons,
    assignedSummaries,
    scopeIafRequirements,
    iafGapStatus,
    observacionSectoresAlerts: Array.from(observacionAlertsMap.values()),
    assignedExpertos,
    rankedEligibleExpertos,
  };
}

/**
 * Step 6.1 — Builds the Certificate-Based Multi View rows for `3. Auditor`.
 * Evaluates each certificate's most recent audit including permanent sites + active `Sitio Temporal`.
 */
export function buildCertificateAuditorRows(
  params: BuildCertificateMultiViewRowsParams & {
    temporalSites: ReadonlyArray<AuditoriaSitioTemporalEntity>;
    auditors: ReadonlyArray<AuditorDetailEntity>;
    expertos?: ReadonlyArray<ExpertoTecnicoDetailEntity>;
    alertConfig?: AlertConfigEntity;
  }
): CertificateAuditorRow[] {
  const baseRows = buildCertificateMultiViewRows(params);
  const programs = params.programs ?? [];
  const certs = (params.detailedCerts ?? []) as ReadonlyArray<CertificadoDetailEntity>;
  const programasExpertos = params.expertos ?? [];
  const programsPool = buildSynthesizedProgramsForHistory(params.audits, programs);
  const allConflicts = detectAuditorScheduleConflicts(programsPool);

  return baseRows.map((row) => {
    if (!row.latestAudit) {
      return {
        ...row,
        requiredDays: 0,
        assignedDays: 0,
        regularRequiredDays: 0,
        temporalRequiredDays: 0,
        hasTemporalActive: false,
        sitesCount: 0,
        balancedSitesCount: 0,
        statusKey: 'SIN_AUDITORIA',
        hasCompetencyWarning: false,
        hasRotationWarning: false,
        hasScheduleConflict: false,
        hasExcessDiscrepancy: false,
        alertReasons: [],
        assignedSummaries: [],
        assignedExpertosCount: 0,
        hasIafSectorGap: false,
      };
    }

    const detail = buildAuditAuditorDetail({
      activeAudit: row.latestAudit,
      audits: params.audits,
      programs,
      temporalSites: params.temporalSites,
      auditors: params.auditors,
      certificados: certs,
      expertos: programasExpertos,
      alertConfig: params.alertConfig,
      precomputedConflicts: allConflicts,
      precomputedProgramsPool: programsPool,
    });

    const regularRequiredDays = roundAuditDaysQuarter(
      detail.units
        .filter((u) => u.kind === 'REGULAR')
        .reduce((sum, u) => sum + u.requiredDays, 0)
    );
    const temporalRequiredDays = roundAuditDaysQuarter(
      detail.units
        .filter((u) => u.kind === 'TEMPORAL')
        .reduce((sum, u) => sum + u.requiredDays, 0)
    );

    return {
      ...row,
      requiredDays: detail.requiredDaysTotal,
      assignedDays: detail.assignedDaysTotal,
      regularRequiredDays,
      temporalRequiredDays,
      hasTemporalActive: detail.hasTemporalActive,
      sitesCount: detail.units.length,
      balancedSitesCount: detail.balancedUnitsCount,
      statusKey: detail.statusKey,
      hasCompetencyWarning: detail.hasCompetencyWarning,
      hasRotationWarning: detail.hasRotationWarning,
      hasScheduleConflict: detail.hasScheduleConflict,
      hasExcessDiscrepancy: detail.hasExcessDiscrepancy,
      alertReasons: detail.alertReasons,
      assignedSummaries: detail.assignedSummaries,
      assignedExpertosCount: detail.assignedExpertos.length,
      hasIafSectorGap: detail.iafGapStatus.hasIafSectorGap,
    };
  });
}

/**
 * Legacy helper retained for backward compatibility with campaign-level tests/consumers.
 */
export function buildCampaignAsignacionRows(
  programs: ReadonlyArray<ProgramaAuditoriaEntity>,
  temporalSites: ReadonlyArray<AuditoriaSitioTemporalEntity>,
  referenceIsoDate: string = new Date().toISOString().slice(0, 10)
): CampaignAsignacionRow[] {
  const rows: CampaignAsignacionRow[] = [];

  for (const program of programs) {
    if (program.deleted_at) continue;
    const activeAudits = program.auditorias.filter((a) => !a.deleted_at);
    if (activeAudits.length === 0) continue;

    const allHaveTime = activeAudits.every((a) => {
      const sites = (a.sitiosPlan || []).filter((s) => !s.deleted_at);
      return sites.length > 0 && sites.every((s) => s.tiempo_auditoria > 0);
    });
    if (!allHaveTime) continue;

    const auditIds = new Set(activeAudits.map((a) => a.id));
    const campaignTemporals = temporalSites.filter(
      (t) => !t.deleted_at && auditIds.has(t.id_auditoria)
    );
    const hasMissingTemporalTime =
      activeAudits.some((a) => a.tiene_sitio_temporal === true) &&
      (campaignTemporals.length === 0 || campaignTemporals.some((t) => t.tiempo_auditoria <= 0));
    if (hasMissingTemporalTime) continue;

    const reconciliations: SiteAssignmentReconciliation[] = [];

    for (const a of activeAudits) {
      const orderedSites = (a.sitiosPlan || [])
        .filter((sp) => !sp.deleted_at)
        .slice()
        .sort((left, right) => left.numero_sitio - right.numero_sitio);

      for (const s of orderedSites) {
        const bal = computeSiteDayBalance(s);
        const membersCount = (s.equipoSitio || []).filter((m) => !m.deleted_at).length;
        reconciliations.push({
          kind: 'REGULAR',
          targetId: s.id,
          auditId: a.id,
          label: `${a.numero_certificado} · ${s.numero_sitio === 0 ? 'Sitio 0 HQ' : `Sitio #${s.numero_sitio}`} (${s.nombre_sitio})`,
          requiredDays: bal.demandedDays,
          assignedDays: bal.assignedDays,
          deltaDays: bal.delta,
          isBalanced: isAuditableUnitExactlyBalanced(membersCount, bal.assignedDays, bal.demandedDays),
          hasNoTeam: bal.assignedDays <= 0,
          coveragePct:
            bal.demandedDays > 0
              ? Math.min(100, Math.round((bal.assignedDays / bal.demandedDays) * 100))
              : 0,
        });
      }
    }

    for (const t of campaignTemporals) {
      const requiredDays = roundAuditDaysQuarter(t.tiempo_auditoria);
      const activeTeam = t.equipoTemporal.filter((m) => !m.deleted_at);
      const assigned = roundAuditDaysQuarter(
        activeTeam.reduce((sum, m) => sum + m.tiempo_auditoria, 0)
      );
      const delta = roundSignedQuarterDays(assigned - requiredDays);
      reconciliations.push({
        kind: 'TEMPORAL',
        targetId: t.id,
        auditId: t.id_auditoria,
        label: `⏱️ ${t.etiqueta} (Temporal)`,
        requiredDays,
        assignedDays: assigned,
        deltaDays: delta,
        isBalanced: isAuditableUnitExactlyBalanced(activeTeam.length, assigned, requiredDays),
        hasNoTeam: assigned <= 0,
        coveragePct:
          requiredDays > 0
            ? Math.min(100, Math.round((assigned / requiredDays) * 100))
            : 0,
      });
    }

    const totalRequiredDays = roundAuditDaysQuarter(
      reconciliations.reduce((sum, r) => sum + r.requiredDays, 0)
    );
    const totalAssignedDays = roundAuditDaysQuarter(
      reconciliations.reduce((sum, r) => sum + r.assignedDays, 0)
    );
    const allBalanced = reconciliations.length > 0 && reconciliations.every((r) => r.isBalanced);
    const statusKey: Exclude<AsignacionStatusFilter, 'ALL'> =
      totalAssignedDays === 0
        ? 'SIN_ASIGNAR'
        : allBalanced
        ? 'COMPLETO'
        : 'DESCUADRADO';

    const planned =
      resolveLatestPlannedDate(activeAudits[0]?.fechas) ??
      (activeAudits[0]?.latestDate && activeAudits[0].latestDate.tipo_fecha !== 'REAL'
        ? activeAudits[0].latestDate
        : null);
    const urgency = computeAuditUrgencyClassification(
      planned,
      activeAudits[0]?.estado_ciclo || 'Borrador',
      referenceIsoDate
    );

    rows.push({
      program,
      urgency,
      siteReconciliations: reconciliations,
      totalRequiredDays,
      totalAssignedDays,
      statusKey,
      hasCompetencyWarning: false,
      hasRotationWarning: false,
    });
  }

  return rows;
}

// =============================================================================
// Step 3.3 — Organization Multi View & Picker Metadata (`3. Auditor`)
// =============================================================================

export interface AuditorOrgCertMeta {
  normaCodigo: string;
  latestAuditCodename: string;
  latestAuditTooltip: string;
  latestDateSummary: string;
  urgency: AuditUrgencyClassification;
  requiredDays: number;
  assignedDays: number;
  regularRequiredDays: number;
  temporalRequiredDays: number;
  hasTemporalActive: boolean;
  sitesCount: number;
  balancedSitesCount: number;
  statusKey: CertAuditorStatus;
  hasCompetencyWarning: boolean;
  hasRotationWarning: boolean;
  hasScheduleConflict: boolean;
  hasExcessDiscrepancy: boolean;
  alertReasons: string[];
  assignedSummaries: AssignedAuditorSummaryItem[];
  assignedExpertosCount: number;
  assignedExpertos: AssignedExpertoAuditoriaItem[];
  hasIafSectorGap: boolean;
  iafGapStatus: AuditIafGapStatus | null;
}

export function createAuditorOrgCertMetaResolver(params: {
  audits: ReadonlyArray<ProgramacionAuditEntity>;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  temporalSites: ReadonlyArray<AuditoriaSitioTemporalEntity>;
  auditors: ReadonlyArray<AuditorDetailEntity>;
  expertos?: ReadonlyArray<ExpertoTecnicoDetailEntity>;
  certificados?: ReadonlyArray<CertificadoDetailEntity>;
  alertConfig?: AlertConfigEntity;
  referenceIsoDate?: string;
}): OrgCertMetaResolver<AuditorOrgCertMeta> {
  const {
    audits,
    programs,
    temporalSites,
    auditors,
    expertos = [],
    certificados = [],
    alertConfig,
    referenceIsoDate,
  } = params;

  const activeAudits = audits.filter((a) => !a.deleted_at);
  const programsPool = buildSynthesizedProgramsForHistory(activeAudits, programs);
  const allConflicts = detectAuditorScheduleConflicts(programsPool);

  return (ctx) => {
    const latest = ctx.latestAudit;
    const normaCodigo = ctx.certificado.norma_codigo || 'ISO';
    if (!latest) {
      const urgency = computeAuditUrgencyClassification(null, 'Borrador', referenceIsoDate);
      return {
        domainExtra: {
          normaCodigo,
          latestAuditCodename: 'Sin auditorías',
          latestAuditTooltip: 'Sin auditorías registradas',
          latestDateSummary: 'Sin fecha planificada',
          urgency,
          requiredDays: 0,
          assignedDays: 0,
          regularRequiredDays: 0,
          temporalRequiredDays: 0,
          hasTemporalActive: false,
          sitesCount: 0,
          balancedSitesCount: 0,
          statusKey: 'SIN_AUDITORIA',
          hasCompetencyWarning: false,
          hasRotationWarning: false,
          hasScheduleConflict: false,
          hasExcessDiscrepancy: false,
          alertReasons: [],
          assignedSummaries: [],
          assignedExpertosCount: 0,
          assignedExpertos: [],
          hasIafSectorGap: false,
          iafGapStatus: null,
        },
        domainCells: {
          auditoria: 'Sin auditorías',
          equipo: 'Sin equipo',
          cobertura: '0.00 / 0.00 d',
        },
        searchText: `${normaCodigo} Sin auditorias`,
      };
    }

    const detail = buildAuditAuditorDetail({
      activeAudit: latest,
      audits: activeAudits,
      programs,
      temporalSites,
      auditors,
      certificados,
      expertos,
      alertConfig,
      precomputedConflicts: allConflicts,
      precomputedProgramsPool: programsPool,
    });

    const regularRequiredDays = roundAuditDaysQuarter(
      detail.units
        .filter((u) => u.kind === 'REGULAR')
        .reduce((sum, u) => sum + u.requiredDays, 0)
    );
    const temporalRequiredDays = roundAuditDaysQuarter(
      detail.units
        .filter((u) => u.kind === 'TEMPORAL')
        .reduce((sum, u) => sum + u.requiredDays, 0)
    );
    const planned =
      resolveLatestPlannedDate(latest.fechas) ??
      (latest.latestDate && !latest.latestDate.deleted_at && latest.latestDate.tipo_fecha !== 'REAL'
        ? latest.latestDate
        : null);
    const urgency = computeAuditUrgencyClassification(
      planned,
      latest.estado_ciclo || latest.estatus || 'Borrador',
      referenceIsoDate
    );
    const latestDateSummary = planned
      ? formatAuditDateLabel(planned)
      : latest.fecha_inicio
      ? latest.fecha_inicio.slice(0, 10).split('-').reverse().join('/')
      : 'Sin fecha planificada';
    const latestAuditCodename = formatAuditCodename(latest);
    const latestAuditTooltip = getAuditCodenameTooltip(latest);

    const hasIafGap = detail.iafGapStatus.hasIafSectorGap;
    const allAlertReasons = hasIafGap
      ? [
          ...detail.alertReasons,
          detail.iafGapStatus.coveredByAssignedExperts
            ? 'Brecha IAF cubierta por Experto Técnico'
            : detail.iafGapStatus.title || 'Brecha IAF · Requiere Experto Técnico',
        ]
      : detail.alertReasons;

    const teamNames = detail.assignedSummaries.map((m) => m.nombre).join(' ');
    const expertoNames = detail.assignedExpertos.map((e) => e.experto_nombre).join(' ');
    const iafSearchTokens = hasIafGap
      ? `brecha iaf sin cobertura sector subsector iaf experto tecnico ${detail.iafGapStatus.targetSectorLabel} ${detail.iafGapStatus.message}`
      : '';
    const expertSearchTokens =
      detail.assignedExpertos.length > 0
        ? `experto tecnico exp. tecnico ${expertoNames}`
        : '';

    return {
      domainExtra: {
        normaCodigo,
        latestAuditCodename,
        latestAuditTooltip,
        latestDateSummary,
        urgency,
        requiredDays: detail.requiredDaysTotal,
        assignedDays: detail.assignedDaysTotal,
        regularRequiredDays,
        temporalRequiredDays,
        hasTemporalActive: detail.hasTemporalActive,
        sitesCount: detail.units.length,
        balancedSitesCount: detail.balancedUnitsCount,
        statusKey: detail.statusKey,
        hasCompetencyWarning: detail.hasCompetencyWarning,
        hasRotationWarning: detail.hasRotationWarning,
        hasScheduleConflict: detail.hasScheduleConflict,
        hasExcessDiscrepancy: detail.hasExcessDiscrepancy,
        alertReasons: allAlertReasons,
        assignedSummaries: detail.assignedSummaries,
        assignedExpertosCount: detail.assignedExpertos.length,
        assignedExpertos: detail.assignedExpertos,
        hasIafSectorGap: hasIafGap,
        iafGapStatus: detail.iafGapStatus,
      },
      domainCells: {
        auditoria: `${latestAuditCodename} ${latestDateSummary}`,
        equipo: [teamNames, expertoNames, allAlertReasons.join(' ')].filter(Boolean).join(' '),
        cobertura: `${detail.assignedDaysTotal.toFixed(2)} / ${detail.requiredDaysTotal.toFixed(2)} d ${detail.statusKey}`,
      },
      searchText: [
        normaCodigo,
        latestAuditCodename,
        latest.codigo_auditoria,
        latest.tipo_auditoria,
        teamNames,
        expertSearchTokens,
        iafSearchTokens,
        allAlertReasons.join(' '),
      ]
        .filter(Boolean)
        .join(' '),
    };
  };
}

export function buildAuditorOrgFacetCategories(
  rows: ReadonlyArray<OrgMultiViewRow<AuditorOrgCertMeta>>
): MultiViewFacetCategory<OrgMultiViewRow<AuditorOrgCertMeta>>[] {
  const uniqueStandards = Array.from(
    new Set(rows.flatMap((r) => r.normas).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, 'es'));

  const uniqueConglomerados = Array.from(
    new Set(rows.map((r) => r.conglomeradoShortName).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, 'es'));

  return [
    {
      id: 'estado',
      label: 'Estado de Cobertura',
      options: [
        { value: 'PENDIENTE', label: 'Pendiente' },
        { value: 'DESBALANCEADO', label: 'Desbalanceado' },
        { value: 'COMPLETO', label: 'Completo ✓' },
        { value: 'SIN_AUDITORIA', label: 'Sin auditorías' },
      ],
      extractValues: (r) => {
        if (r.certificates.length === 0) return ['SIN_AUDITORIA'];
        return Array.from(new Set(r.certificates.map((c) => c.domainExtra.statusKey)));
      },
    },
    {
      id: 'sitio_temporal',
      label: 'Sitio Temporal',
      options: [
        { value: 'CON_TEMPORAL', label: 'Incluye Sitio Temporal' },
        { value: 'SOLO_PERMANENTES', label: 'Solo permanentes' },
      ],
      extractValues: (r) =>
        r.certificates.some((c) => c.domainExtra.hasTemporalActive)
          ? 'CON_TEMPORAL'
          : 'SOLO_PERMANENTES',
    },
    {
      id: 'alertas',
      label: 'Alertas y Expertos',
      options: [
        { value: 'BRECHA_IAF', label: 'Brecha IAF / Sin Experto' },
        { value: 'CON_EXPERTO', label: 'Con Experto Técnico' },
        { value: 'CONFLICTO_CALENDARIO', label: 'Con conflicto de calendario' },
        { value: 'ROTACION_LIDER', label: 'Alerta rotación Líder' },
        { value: 'COMPETENCIA_PARCIAL', label: 'Competencia parcial' },
      ],
      extractValues: (r) => {
        const vals = new Set<string>();
        for (const c of r.certificates) {
          const ex = c.domainExtra;
          if (ex.hasIafSectorGap) vals.add('BRECHA_IAF');
          if (ex.assignedExpertosCount > 0) vals.add('CON_EXPERTO');
          if (ex.hasScheduleConflict) vals.add('CONFLICTO_CALENDARIO');
          if (ex.hasRotationWarning) vals.add('ROTACION_LIDER');
          if (ex.hasCompetencyWarning) vals.add('COMPETENCIA_PARCIAL');
        }
        return Array.from(vals);
      },
    },
    ...(uniqueStandards.length > 0
      ? [
          {
            id: 'norma',
            label: 'Norma',
            options: uniqueStandards.map((n) => ({ value: n, label: n })),
            extractValues: (r: OrgMultiViewRow<AuditorOrgCertMeta>) => r.normas,
          },
        ]
      : []),
    ...(uniqueConglomerados.length > 0
      ? [
          {
            id: 'conglomerado',
            label: 'Conglomerado / Tipo',
            options: uniqueConglomerados.map((c) => ({ value: c, label: c })),
            extractValues: (r: OrgMultiViewRow<AuditorOrgCertMeta>) => r.conglomeradoShortName,
          },
        ]
      : []),
  ];
}


