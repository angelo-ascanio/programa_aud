/**
 * Step 6.1 — `Tiempo`: Lógica Pura para presupuesto de días-auditor (múltiplos exactos de 0.25d),
 * compuerta insalvable Pasos 3 + 4, clasificación Incompletos/Completos y desglose por certificado
 * evitando doble conteo de Sitios Temporales compartidos en campañas multi-certificado.
 *
 * Strictly typed (`strict: true`, 0 `any` / `as any`) and Zero-UUID compliant
 * in all user-facing labels and validation errors.
 */

import {
  resolveLatestPlannedDate,
  roundAuditDaysQuarter,
  type AuditoriaSitioPlanItem,
  type ProgramaAuditoriaEntity,
} from './auditPlanningEngine';
import type { ProgramacionAuditEntity } from './auditExecution';
import type { AuditoriaSitioTemporalEntity } from './designacionTemporalDomain';
import {
  computeAuditUrgencyClassification,
  type AuditUrgencyClassification,
} from './designacionTipoDomain';

export type TiempoCompletionFilter = 'ALL' | 'INCOMPLETOS' | 'COMPLETOS';

export interface CertTiempoBreakdown {
  audit: ProgramacionAuditEntity;
  activeSites: AuditoriaSitioPlanItem[];
  regularDaysTotal: number;
  linkedTemporals: AuditoriaSitioTemporalEntity[];
  linkedTemporalDaysTotal: number;
  unallocatedSitesCount: number;
  isComplete: boolean;
}

export interface CampaignTiempoRow {
  program: ProgramaAuditoriaEntity;
  urgency: AuditUrgencyClassification;
  certBreakdowns: CertTiempoBreakdown[];
  campaignRegularDays: number;
  campaignTemporalDaysUnique: number;
  campaignGrandTotalDays: number;
  unallocatedSitesTotal: number;
  totalSitesCount: number;
  isComplete: boolean;
}

/**
 * Validates that a numeric audit-day amount is finite, non-negative,
 * and an exact multiple of `0.25` days.
 */
export function isValidQuarterDayAmount(value: number): boolean {
  if (!Number.isFinite(value) || value < 0) return false;
  const scaled = Math.round(value * 4);
  return Math.abs(scaled / 4 - value) < 0.0001;
}

/**
 * Validates a manual or stepped day update for a site against non-negative
 * and `0.25d` quarter-day precision rules. Returns a human-readable Spanish
 * error string or `null` when valid.
 */
export function validateSiteTimeUpdate(
  days: number,
  siteName: string
): string | null {
  if (!Number.isFinite(days) || days < 0) {
    return `El tiempo para "${siteName}" no puede ser negativo.`;
  }
  if (!isValidQuarterDayAmount(days)) {
    return `El tiempo para "${siteName}" debe expresarse en múltiplos exactos de 0.25 días (ej. 0.50, 1.25, 2.00).`;
  }
  return null;
}

/**
 * Builds and sorts Step 6 (`Tiempo`) campaign rows.
 * - Entry gate: enforces Step 3 (`id_tipo_auditoria` + active planned date) AND
 *   Step 4 (`>= 1` active site in `sitiosPlan`) across every active audit in the campaign.
 * - Deduplicates shared temporary sites (`campaignTemporalDaysUnique`) so multi-certificate
 *   campaigns count each `AuditoriaSitioTemporalEntity` once in `campaignGrandTotalDays`,
 *   while exposing per-certificate `linkedTemporalDaysTotal` for coordinator visibility.
 * - Sorts incomplete campaigns first, then by `urgency.rank` and `effectiveStartIso`.
 */
export function buildCampaignTiempoRows(
  programs: ReadonlyArray<ProgramaAuditoriaEntity>,
  temporalSites: ReadonlyArray<AuditoriaSitioTemporalEntity>,
  referenceIsoDate: string = new Date().toISOString().slice(0, 10)
): CampaignTiempoRow[] {
  const rows: CampaignTiempoRow[] = [];

  for (const program of programs) {
    if (program.deleted_at) continue;
    const activeAudits = program.auditorias.filter((a) => !a.deleted_at);
    if (activeAudits.length === 0) continue;

    // Compuerta insalvable: Paso 3 AND Paso 4 completos
    const eligible = activeAudits.every((a) => {
      const hasStep3 =
        Boolean(a.id_tipo_auditoria) &&
        ((a.fechas || []).some((f) => !f.deleted_at && f.tipo_fecha !== 'REAL') ||
          Boolean(a.latestDate));
      const hasStep4 = (a.sitiosPlan || []).filter((s) => !s.deleted_at).length >= 1;
      return hasStep3 && hasStep4;
    });
    if (!eligible) continue;

    const auditIds = new Set(activeAudits.map((a) => a.id));
    const campaignTemporals = temporalSites.filter(
      (t) => !t.deleted_at && auditIds.has(t.id_auditoria)
    );

    const certBreakdowns: CertTiempoBreakdown[] = activeAudits.map((audit) => {
      const activeSites = (audit.sitiosPlan || [])
        .filter((s) => !s.deleted_at)
        .slice()
        .sort((a, b) => a.numero_sitio - b.numero_sitio);
      const regularDaysTotal = roundAuditDaysQuarter(
        activeSites.reduce((sum, s) => sum + (s.tiempo_auditoria || 0), 0)
      );
      const linkedTemporals = campaignTemporals.filter((t) =>
        t.certificados.some((c) => !c.deleted_at && c.id_auditoria_certificado === audit.id)
      );
      const linkedTemporalDaysTotal = roundAuditDaysQuarter(
        linkedTemporals.reduce((sum, t) => sum + (t.tiempo_auditoria || 0), 0)
      );
      const unallocatedSitesCount = activeSites.filter((s) => (s.tiempo_auditoria || 0) <= 0).length;
      return {
        audit,
        activeSites,
        regularDaysTotal,
        linkedTemporals,
        linkedTemporalDaysTotal,
        unallocatedSitesCount,
        isComplete: activeSites.length > 0 && unallocatedSitesCount === 0,
      };
    });

    const campaignRegularDays = roundAuditDaysQuarter(
      certBreakdowns.reduce((sum, b) => sum + b.regularDaysTotal, 0)
    );
    const campaignTemporalDaysUnique = roundAuditDaysQuarter(
      campaignTemporals.reduce((sum, t) => sum + (t.tiempo_auditoria || 0), 0)
    );
    const campaignGrandTotalDays = roundAuditDaysQuarter(
      campaignRegularDays + campaignTemporalDaysUnique
    );
    const unallocatedSitesTotal = certBreakdowns.reduce(
      (sum, b) => sum + b.unallocatedSitesCount,
      0
    );
    const totalSitesCount = certBreakdowns.reduce((sum, b) => sum + b.activeSites.length, 0);

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
      certBreakdowns,
      campaignRegularDays,
      campaignTemporalDaysUnique,
      campaignGrandTotalDays,
      unallocatedSitesTotal,
      totalSitesCount,
      isComplete: unallocatedSitesTotal === 0 && totalSitesCount > 0,
    });
  }

  return rows.sort((a, b) => {
    if (a.isComplete !== b.isComplete) return a.isComplete ? 1 : -1;
    if (a.urgency.rank !== b.urgency.rank) return a.urgency.rank - b.urgency.rank;
    return (a.urgency.effectiveStartIso || '9999-12-31').localeCompare(
      b.urgency.effectiveStartIso || '9999-12-31'
    );
  });
}
