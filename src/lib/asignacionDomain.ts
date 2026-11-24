/**
 * Step 6.1 (`3. Auditor`, antes `Asignación`) — Lógica Pura Certificate-Based de conciliación
 * de equipos de auditores sobre sitios permanentes (`equipo_auditor_sitio`) y Sitio Temporal
 * activo (`equipo_auditor_sitio_temporal`), con validación estricta `SUM(días) === requerido`,
 * competencia ISO/IEC 17021-1 (`norma` + `sector_iaf` + `subsector_iaf`), conflictos y rotación.
 *
 * Strictly typed (`strict: true`, 0 `any` / `as any`) and Zero-UUID compliant
 * in all user-facing strings and validation errors.
 */

import { assertValidUuid, isValidUuid } from './zeroUuid';
import {
  computeSiteDayBalance,
  resolveLatestPlannedDate,
  roundAuditDaysQuarter,
  type AuditorSiteRole,
  type ProgramaAuditoriaEntity,
  type SiteEvaluationModality,
} from './auditPlanningEngine';
import type { ProgramacionAuditEntity } from './auditExecution';
import type { AuditorDetailEntity } from './competencyMatrix';
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
}

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
    return 'El sitio seleccionado aún no tiene días-auditor requeridos en 2. Tiempo (o 1.4 Temporal).';
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

  const buildMember = (m: {
    id: string;
    id_auditor: string;
    auditor_nombre: string;
    rol_auditor: AuditorSiteRole;
    tiempo_auditoria: number;
    asignacion_completa_sitio?: boolean;
  }): AuditAuditorMemberItem => {
    const audObj = auditorById.get(m.id_auditor);
    const competency = audObj
      ? evaluateAuditorCompetencyMatch(
          audObj,
          activeAudit.norma_codigo,
          activeAudit.sector_iaf,
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

    const existing = auditorMap.get(m.id_auditor);
    if (existing) {
      existing.totalDays = roundAuditDaysQuarter(existing.totalDays + m.tiempo_auditoria);
      if (isLeader) existing.isLeader = true;
    } else {
      auditorMap.set(m.id_auditor, {
        auditorId: m.id_auditor,
        nombre: m.auditor_nombre || audObj?.nombre || 'Auditor Calificado',
        isLeader,
        totalDays: roundAuditDaysQuarter(m.tiempo_auditoria),
      });
    }

    return {
      assignmentId: m.id,
      auditorId: m.id_auditor,
      auditorNombre: m.auditor_nombre || audObj?.nombre || 'Auditor Calificado',
      rol: m.rol_auditor,
      days: roundAuditDaysQuarter(m.tiempo_auditoria),
      wholeSite: m.asignacion_completa_sitio ?? true,
      competency,
      hasScheduleConflict: hasMemberConflict,
      scheduleConflictMessages: memberConflicts.map((c) => c.message),
      hasRotationWarning: hasMemberRotation,
      rotationWarningMessage: hasMemberRotation ? rotationSummary.warningMessage : null,
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
        : details.fecha_tentativa || 'Sitio Temporal Activo (1.4 Temporal)',
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
    alertConfig?: AlertConfigEntity;
  }
): CertificateAuditorRow[] {
  const baseRows = buildCertificateMultiViewRows(params);
  const programs = params.programs ?? [];
  const certs = (params.detailedCerts ?? []) as ReadonlyArray<CertificadoDetailEntity>;
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
      };
    }

    const detail = buildAuditAuditorDetail({
      activeAudit: row.latestAudit,
      audits: params.audits,
      programs,
      temporalSites: params.temporalSites,
      auditors: params.auditors,
      certificados: certs,
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

