/**
 * Step 7.1 — `Asignación`: Lógica Pura de conciliación de equipos de auditores
 * (sitios regulares `equipo_auditor_sitio` + sitios temporales `equipo_auditor_sitio_temporal`),
 * compuerta de entrada desde Paso 6 (y Paso 5 cuando aplica sitio temporal),
 * validación estricta `SUM == Asignado` en múltiplos de `0.25d`, y evaluación de
 * competencia ISO/IEC 17021-1 (`norma` + `sector_iaf` + `subsector_iaf`).
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
} from './auditPlanningEngine';
import type { AuditorDetailEntity } from './competencyMatrix';
import type { AuditoriaSitioTemporalEntity } from './designacionTemporalDomain';
import { isValidQuarterDayAmount } from './tiempoDomain';
import {
  computeAuditUrgencyClassification,
  type AuditUrgencyClassification,
} from './designacionTipoDomain';

export type AsignacionStatusFilter = 'ALL' | 'SIN_ASIGNAR' | 'DESCUADRADO' | 'COMPLETO';

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
    return 'El sitio seleccionado aún no tiene días-auditor requeridos en Paso 6 (Tiempo).';
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
 * Builds Step 7 (`Asignación`) campaign reconciliation rows.
 * - Entry gate: enforces Step 6 (`sitiosPlan` with `tiempo_auditoria > 0` for all active audits/sites)
 *   and Step 5 (`auditoria_sitio_temporal` with `tiempo_auditoria > 0`) whenever `tiene_sitio_temporal === true`.
 * - Reconciles each regular site (`REGULAR`) and temporary site (`TEMPORAL`) strictly (`|delta| <= 0.001`).
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

    // Compuerta: Paso 6 completo (+ Paso 5 tiempo si temporal está encendido)
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
        reconciliations.push({
          kind: 'REGULAR',
          targetId: s.id,
          auditId: a.id,
          label: `${a.numero_certificado} · ${s.numero_sitio === 0 ? 'Sitio 0 HQ' : `Sitio #${s.numero_sitio}`} (${s.nombre_sitio})`,
          requiredDays: bal.demandedDays,
          assignedDays: bal.assignedDays,
          deltaDays: bal.delta,
          isBalanced: bal.isBalanced,
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
      const assigned = roundAuditDaysQuarter(
        t.equipoTemporal
          .filter((m) => !m.deleted_at)
          .reduce((sum, m) => sum + m.tiempo_auditoria, 0)
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
        isBalanced: requiredDays > 0 && Math.abs(delta) <= 0.001,
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
