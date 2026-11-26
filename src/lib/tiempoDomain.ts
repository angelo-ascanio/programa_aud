/**
 * Step 6.1 (`2. Tiempo`) — Lógica Pura Certificate-Based para presupuesto de días-auditor
 * por sitio en múltiplos exactos de `0.25d`, resumen en tiempo real y nota de Sitio Temporal.
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
import {
  buildCertificateMultiViewRows,
  type BuildCertificateMultiViewRowsParams,
  type CertificateMultiViewRow,
} from './certificateAuditSelector';
import { resolveCertVersionSnapshotForAudit } from './certificadoVersionDomain';
import type { CertificadoDetailEntity } from './multisiteSampling';
import {
  parseTemporalSiteDetails,
  resolveLinkedBatchTemporalState,
  type AuditoriaSitioTemporalEntity,
} from './designacionTemporalDomain';
import {
  computeAuditUrgencyClassification,
  type AuditUrgencyClassification,
} from './designacionTipoDomain';
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

export type TiempoCompletionFilter = 'ALL' | 'INCOMPLETOS' | 'COMPLETOS';

export type CertTiempoStatus = 'COMPLETO' | 'PENDIENTE' | 'SIN_AUDITORIA';

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

export interface CertificateTiempoRow extends CertificateMultiViewRow {
  sitesCount: number;
  allocatedSitesCount: number;
  unallocatedSitesCount: number;
  permanentDaysTotal: number;
  hasTemporalActive: boolean;
  temporalDays: number;
  temporalLabel: string;
  statusKey: CertTiempoStatus;
}

export interface AuditTiempoTemporalNote {
  isActive: boolean;
  hasConfiguredRecord: boolean;
  temporalSiteId: string | null;
  etiqueta: string;
  ubicacion: string;
  diasDeclarados: number;
  isSharedBatch: boolean;
  sharedCertsCount: number;
}

export interface AuditTiempoDetailModel {
  audit: ProgramacionAuditEntity;
  activeSites: AuditoriaSitioPlanItem[];
  sitesCount: number;
  allocatedSitesCount: number;
  unallocatedSitesCount: number;
  permanentDaysTotal: number;
  isComplete: boolean;
  temporalNote: AuditTiempoTemporalNote | null;
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
 * Validates a positive `>= 0.25d` quarter-day allocation for a designated permanent site.
 */
export function validatePositiveSiteTimeUpdate(
  days: number,
  siteName: string
): string | null {
  if (!Number.isFinite(days) || days < 0.25) {
    return `El tiempo para "${siteName}" debe ser de al menos 0.25 días (ej. 0.50, 1.00, 2.00).`;
  }
  if (!isValidQuarterDayAmount(days)) {
    return `El tiempo para "${siteName}" debe expresarse en múltiplos exactos de 0.25 días (ej. 0.50, 1.25, 2.00).`;
  }
  return null;
}

function resolveTemporalForAudit(
  activeAudit: ProgramacionAuditEntity,
  audits: ReadonlyArray<ProgramacionAuditEntity>,
  programs: ReadonlyArray<ProgramaAuditoriaEntity>,
  temporalSites: ReadonlyArray<AuditoriaSitioTemporalEntity>
): AuditTiempoTemporalNote | null {
  const res = resolveLinkedBatchTemporalState(activeAudit, audits, programs, temporalSites);
  const directCertTemp =
    res.primaryTemporalSite ??
    temporalSites.find(
      (t) =>
        !t.deleted_at &&
        (t.id_auditoria === activeAudit.id ||
          t.certificados.some((cl) => !cl.deleted_at && cl.id_auditoria_certificado === activeAudit.id))
    ) ??
    null;

  const isActive = res.isTemporalEnabled || Boolean(directCertTemp);
  if (!isActive) return null;

  const details = parseTemporalSiteDetails(directCertTemp?.comentario);
  const activeCertLinksCount = directCertTemp
    ? directCertTemp.certificados.filter((cl) => !cl.deleted_at).length
    : 0;

  return {
    isActive: true,
    hasConfiguredRecord: Boolean(directCertTemp),
    temporalSiteId: directCertTemp?.id ?? null,
    etiqueta: directCertTemp?.etiqueta || 'Sitio Temporal (pendiente de configurar en 1.5 Temporal)',
    ubicacion: details.ubicacion,
    diasDeclarados: directCertTemp ? roundAuditDaysQuarter(directCertTemp.tiempo_auditoria || 0) : 0,
    isSharedBatch: res.batchAudits.length > 1 || activeCertLinksCount > 1,
    sharedCertsCount: Math.max(activeCertLinksCount, res.batchAudits.length),
  };
}

function resolveScopedPlanSitesForAudit(
  audit: ProgramacionAuditEntity,
  certificados?: ReadonlyArray<CertificadoDetailEntity>
): AuditoriaSitioPlanItem[] {
  const activeSites = (audit.sitiosPlan || []).filter((s) => !s.deleted_at);
  if (!certificados || certificados.length === 0) return activeSites;
  const cert = certificados.find(
    (c) => !('deleted_at' in c && c.deleted_at) && c.id === audit.id_certificado
  );
  if (!cert) return activeSites;
  const hasVersionedOrSiteData =
    (cert.versiones ?? []).some((v) => !v.deleted_at) ||
    (cert.sitios ?? []).length > 0;
  if (!hasVersionedOrSiteData) return activeSites;
  const snapshot = resolveCertVersionSnapshotForAudit(audit, certificados);
  const allowedSiteIds = new Set(snapshot.sitios.map((s) => s.id));
  if (allowedSiteIds.size === 0 && activeSites.length > 0 && !audit.id_certificado_version) {
    return activeSites;
  }
  return activeSites.filter((s) => allowedSiteIds.has(s.id_sitio));
}

/**
 * Step 6.1 — Builds the Certificate-Based Multi View rows for `2. Tiempo`.
 * Lists ALL visible certificates (sorted by audit priority) showing latest audit permanent sites count
 * and declared permanent audit days + temporal site status.
 */
export function buildCertificateTiempoRows(
  params: BuildCertificateMultiViewRowsParams & {
    temporalSites: ReadonlyArray<AuditoriaSitioTemporalEntity>;
  }
): CertificateTiempoRow[] {
  const baseRows = buildCertificateMultiViewRows(params);
  const programs = params.programs ?? [];

  return baseRows.map((row) => {
    if (!row.latestAudit) {
      return {
        ...row,
        sitesCount: 0,
        allocatedSitesCount: 0,
        unallocatedSitesCount: 0,
        permanentDaysTotal: 0,
        hasTemporalActive: false,
        temporalDays: 0,
        temporalLabel: '',
        statusKey: 'SIN_AUDITORIA',
      };
    }

    const activeSites = resolveScopedPlanSitesForAudit(
      row.latestAudit,
      params.detailedCerts as ReadonlyArray<CertificadoDetailEntity> | undefined
    );
    const sitesCount = activeSites.length;
    const allocatedSitesCount = activeSites.filter((s) => (s.tiempo_auditoria || 0) >= 0.25).length;
    const unallocatedSitesCount = Math.max(0, sitesCount - allocatedSitesCount);
    const permanentDaysTotal = roundAuditDaysQuarter(
      activeSites.reduce((sum, s) => sum + Math.max(0, s.tiempo_auditoria || 0), 0)
    );
    const tempNote = resolveTemporalForAudit(
      row.latestAudit,
      params.audits,
      programs,
      params.temporalSites
    );

    const statusKey: CertTiempoStatus =
      sitesCount > 0 && unallocatedSitesCount === 0 ? 'COMPLETO' : 'PENDIENTE';

    return {
      ...row,
      sitesCount,
      allocatedSitesCount,
      unallocatedSitesCount,
      permanentDaysTotal,
      hasTemporalActive: Boolean(tempNote?.isActive),
      temporalDays: tempNote?.diasDeclarados ?? 0,
      temporalLabel: tempNote?.etiqueta ?? '',
      statusKey,
    };
  });
}

/**
 * Step 6.1 — Builds the single-audit Detail View model for `2. Tiempo`.
 * Permanent sites are ordered `Sitio 0` (HQ) first, followed by ascending `numero_sitio`.
 */
export function buildAuditTiempoDetail(opts: {
  activeAudit: ProgramacionAuditEntity;
  audits: ReadonlyArray<ProgramacionAuditEntity>;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  temporalSites: ReadonlyArray<AuditoriaSitioTemporalEntity>;
  certificados?: ReadonlyArray<CertificadoDetailEntity>;
}): AuditTiempoDetailModel {
  const { activeAudit, audits, programs, temporalSites, certificados } = opts;
  const activeSites = resolveScopedPlanSitesForAudit(activeAudit, certificados)
    .slice()
    .sort((a, b) => a.numero_sitio - b.numero_sitio);

  const sitesCount = activeSites.length;
  const allocatedSitesCount = activeSites.filter((s) => (s.tiempo_auditoria || 0) >= 0.25).length;
  const unallocatedSitesCount = Math.max(0, sitesCount - allocatedSitesCount);
  const permanentDaysTotal = roundAuditDaysQuarter(
    activeSites.reduce((sum, s) => sum + Math.max(0, s.tiempo_auditoria || 0), 0)
  );
  const temporalNote = resolveTemporalForAudit(activeAudit, audits, programs, temporalSites);

  return {
    audit: activeAudit,
    activeSites,
    sitesCount,
    allocatedSitesCount,
    unallocatedSitesCount,
    permanentDaysTotal,
    isComplete: sitesCount > 0 && unallocatedSitesCount === 0,
    temporalNote,
  };
}

/**
 * Legacy helper retained for backward compatibility with campaign-level tests/consumers.
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

// =============================================================================
// Step 3.3 — Organization Multi View & Picker Metadata (`2. Tiempo`)
// =============================================================================

export interface TiempoOrgCertMeta {
  normaCodigo: string;
  latestAuditCodename: string;
  latestAuditTooltip: string;
  latestDateSummary: string;
  urgency: AuditUrgencyClassification;
  sitesCount: number;
  allocatedSitesCount: number;
  unallocatedSitesCount: number;
  permanentDaysTotal: number;
  hasTemporalActive: boolean;
  temporalDays: number;
  temporalLabel: string;
  totalDaysWithTemporal: number;
  statusKey: CertTiempoStatus;
  isLinkedLatest: boolean;
}

function formatTiempoPlannedDateSummary(
  audit: ProgramacionAuditEntity | null
): string {
  if (!audit) return 'Sin fecha planificada';
  const planned =
    resolveLatestPlannedDate(audit.fechas) ??
    (audit.latestDate && !audit.latestDate.deleted_at && audit.latestDate.tipo_fecha !== 'REAL'
      ? audit.latestDate
      : null);
  if (!planned) {
    if (audit.fecha_inicio && /^\d{4}-\d{2}-\d{2}/.test(audit.fecha_inicio)) {
      return audit.fecha_inicio.slice(0, 10).split('-').reverse().join('/');
    }
    return 'Sin fecha planificada';
  }
  return formatAuditDateLabel(planned);
}

export function createTiempoOrgCertMetaResolver(params: {
  audits: ReadonlyArray<ProgramacionAuditEntity>;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  temporalSites: ReadonlyArray<AuditoriaSitioTemporalEntity>;
  certificados?: ReadonlyArray<CertificadoDetailEntity>;
  referenceIsoDate?: string;
}): OrgCertMetaResolver<TiempoOrgCertMeta> {
  const { audits, programs, temporalSites, certificados, referenceIsoDate } = params;

  return (ctx) => {
    const latest = ctx.latestAudit;
    const normaCodigo = ctx.certificado.norma_codigo || 'ISO';
    if (!latest) {
      const urgency = computeAuditUrgencyClassification(null, 'Borrador', referenceIsoDate);
      return {
        domainExtra: {
          normaCodigo,
          latestAuditCodename: 'Sin auditorías',
          latestAuditTooltip: 'Sin auditorías programadas',
          latestDateSummary: 'Sin fecha planificada',
          urgency,
          sitesCount: 0,
          allocatedSitesCount: 0,
          unallocatedSitesCount: 0,
          permanentDaysTotal: 0,
          hasTemporalActive: false,
          temporalDays: 0,
          temporalLabel: '',
          totalDaysWithTemporal: 0,
          statusKey: 'SIN_AUDITORIA',
          isLinkedLatest: false,
        },
        domainCells: {
          auditoria: 'Sin auditorías',
          sitios: 'Sin sitios',
          tiempo: '0.00 d · Sin auditorías',
        },
        searchText: `${normaCodigo} Sin auditorias`,
      };
    }

    const activeSites = resolveScopedPlanSitesForAudit(latest, certificados);
    const sitesCount = activeSites.length;
    const allocatedSitesCount = activeSites.filter((s) => (s.tiempo_auditoria || 0) >= 0.25).length;
    const unallocatedSitesCount = Math.max(0, sitesCount - allocatedSitesCount);
    const permanentDaysTotal = roundAuditDaysQuarter(
      activeSites.reduce((sum, s) => sum + Math.max(0, s.tiempo_auditoria || 0), 0)
    );
    const tempNote = resolveTemporalForAudit(latest, audits, programs, temporalSites);
    const hasTemporalActive = Boolean(tempNote?.isActive);
    const temporalDays = tempNote?.diasDeclarados ?? 0;
    const temporalLabel = tempNote?.etiqueta ?? '';
    const totalDaysWithTemporal = roundAuditDaysQuarter(permanentDaysTotal + temporalDays);
    const statusKey: CertTiempoStatus =
      sitesCount > 0 && unallocatedSitesCount === 0 ? 'COMPLETO' : 'PENDIENTE';

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
    const latestAuditCodename = formatAuditCodename(latest);
    const latestAuditTooltip = getAuditCodenameTooltip(latest);
    const latestDateSummary = formatTiempoPlannedDateSummary(latest);
    const isLinkedLatest = Boolean(
      (ctx.program && ctx.program.auditorias.filter((a) => !a.deleted_at).length > 1) ||
        (latest.tipo_vinculacion && latest.tipo_vinculacion !== 'Individual')
    );
    const siteNames = activeSites.map((s) => s.nombre_sitio).join(' ');

    return {
      domainExtra: {
        normaCodigo,
        latestAuditCodename,
        latestAuditTooltip,
        latestDateSummary,
        urgency,
        sitesCount,
        allocatedSitesCount,
        unallocatedSitesCount,
        permanentDaysTotal,
        hasTemporalActive,
        temporalDays,
        temporalLabel,
        totalDaysWithTemporal,
        statusKey,
        isLinkedLatest,
      },
      domainCells: {
        auditoria: `${latestAuditCodename} ${latestDateSummary} ${urgency.label}`,
        sitios: `${sitesCount} sitios ${hasTemporalActive ? `Temporal ON ${temporalLabel}` : 'Solo permanentes'}`,
        tiempo: `${permanentDaysTotal.toFixed(2)} d ${statusKey === 'COMPLETO' ? 'Completo' : 'Pendiente'}`,
      },
      searchText: [
        normaCodigo,
        latestAuditCodename,
        latest.codigo_auditoria,
        latest.tipo_auditoria,
        temporalLabel,
        siteNames,
        statusKey === 'COMPLETO' ? 'Completo' : 'Pendiente',
      ]
        .filter(Boolean)
        .join(' '),
    };
  };
}

export function buildTiempoOrgFacetCategories(
  rows: ReadonlyArray<OrgMultiViewRow<TiempoOrgCertMeta>>
): MultiViewFacetCategory<OrgMultiViewRow<TiempoOrgCertMeta>>[] {
  const uniqueStandards = Array.from(
    new Set(rows.flatMap((r) => r.normas).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, 'es'));

  const uniqueConglomerados = Array.from(
    new Set(rows.map((r) => r.conglomeradoShortName).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, 'es'));

  return [
    {
      id: 'estado_tiempo',
      label: 'Estado Tiempo',
      options: [
        { value: 'PENDIENTE', label: 'Pendiente' },
        { value: 'COMPLETO', label: 'Completo' },
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
        { value: 'CON_TEMPORAL', label: 'Con Sitio Temporal ON' },
        { value: 'SOLO_PERMANENTES', label: 'Solo permanentes' },
      ],
      extractValues: (r) =>
        r.certificates.some((c) => c.domainExtra.hasTemporalActive)
          ? 'CON_TEMPORAL'
          : 'SOLO_PERMANENTES',
    },
    {
      id: 'vinculacion',
      label: 'Lote / Vínculo',
      options: [
        { value: 'VINCULADA', label: 'Auditoría vinculada' },
        { value: 'INDIVIDUAL', label: 'Auditoría individual' },
        { value: 'SIN_AUDITORIA', label: 'Sin auditorías' },
      ],
      extractValues: (r) => {
        if (r.auditsCount === 0) return 'SIN_AUDITORIA';
        return r.hasLinkedAudits ? 'VINCULADA' : 'INDIVIDUAL';
      },
    },
    ...(uniqueStandards.length > 0
      ? [
          {
            id: 'norma',
            label: 'Norma',
            options: uniqueStandards.map((n) => ({ value: n, label: n })),
            extractValues: (r: OrgMultiViewRow<TiempoOrgCertMeta>) => r.normas,
          },
        ]
      : []),
    ...(uniqueConglomerados.length > 0
      ? [
          {
            id: 'conglomerado',
            label: 'Conglomerado / Tipo',
            options: uniqueConglomerados.map((c) => ({ value: c, label: c })),
            extractValues: (r: OrgMultiViewRow<TiempoOrgCertMeta>) => r.conglomeradoShortName,
          },
        ]
      : []),
  ];
}


