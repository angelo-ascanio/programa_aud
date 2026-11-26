/**
 * Step 9.1 — `Resumen` & Motor Automático Paralelo `estatus_auditoria` (`resumenDomain.ts`).
 *
 * Evalúa de forma independiente y paralela cada sección (`1.1`..`7`) de la auditoría,
 * detecta los próximos pasos desbloqueados ejecutables en paralelo y genera un
 * `estatus_auditoria` determinista compartido por `Resumen`, `Conglomerado → Auditorías`
 * y `Calendario`.
 *
 * Strictly typed (`strict: true`, 0 `any` / `as any`) and Zero-UUID compliant
 * in all user-facing labels, summaries, and hints.
 */

import type { Phase5FindingEntity, ProgramacionAuditEntity } from './auditExecution';
import {
  formatAuditDateLabel,
  roundAuditDaysQuarter,
  type ProgramaAuditoriaEntity,
} from './auditPlanningEngine';
import {
  buildCertificateMultiViewRows,
  type BuildCertificateMultiViewRowsParams,
  type CertificateMultiViewRow,
} from './certificateAuditSelector';
import { formatAuditCodename, getAuditCodenameTooltip } from './codenameDomain';
import { extractActivePlannedDates } from './designacionFechaDomain';
import {
  parseTemporalSiteDetails,
  resolveLinkedBatchTemporalState,
  type AuditoriaSitioTemporalEntity,
} from './designacionTemporalDomain';
import { resolveCertVersionSnapshotForAudit } from './certificadoVersionDomain';
import type { CertificadoDetailEntity } from './multisiteSampling';
import { extractDiscreteRealDates } from './resultadoDomain';
import type {
  OrgCertMetaResolver,
  OrgMultiViewRow,
} from './orgMultiViewPickerDomain';
import type { MultiViewFacetCategory } from './universalTemplate';
import { resolveLatestPlannedDate } from './auditPlanningEngine';

export type AuditSectionKey =
  | 'designacion/relacion'
  | 'designacion/tipo'
  | 'designacion/fecha'
  | 'designacion/sitio'
  | 'designacion/temporal'
  | 'tiempo'
  | 'auditor'
  | 'proceso'
  | 'turno'
  | 'resultado'
  | 'revision';

export type AuditSectionStatus = 'COMPLETO' | 'EN_PROGRESO' | 'PENDIENTE' | 'NO_APLICA';

export type ResumenAuditStatusLabel =
  | 'Sin Auditoría'
  | 'Cancelada'
  | 'Pendiente de Designación'
  | 'En Designación'
  | 'Por Asignar Tiempo'
  | 'Planificación en Progreso'
  | 'Programada / Lista para Ejecutar'
  | 'En Cierre de NC'
  | 'Pendiente de Revisión'
  | 'Completada ✓';

export interface AuditSectionSummaryCard {
  key: AuditSectionKey;
  stepTag: string;
  label: string;
  title: string;
  status: AuditSectionStatus;
  statusLabel: string;
  statusBadgeClass: string;
  cardBorderClass: string;
  unlocked: boolean;
  headlineValue: string;
  secondaryMeta: string;
  actionHint: string;
}

export interface ParallelNextAction {
  key: AuditSectionKey;
  stepTag: string;
  label: string;
  buttonLabel: string;
  status: AuditSectionStatus;
  actionHint: string;
}

export interface AuditStatusSummaryResult {
  auditId: string | null;
  codigo_auditoria: string;
  isCancelled: boolean;
  estatus_auditoria: ResumenAuditStatusLabel;
  estatusBadgeClass: string;
  completedCount: number;
  applicableCount: number;
  totalSectionsCount: number;
  progressPct: number;
  progressChip: string;
  cards: AuditSectionSummaryCard[];
  recommendedNextActions: ParallelNextAction[];
  openNcsCount: number;
  closedNcsCount: number;
  totalNcsCount: number;
  realDatesCount: number;
}

export interface ComputeAuditStatusSummaryInput {
  audit: ProgramacionAuditEntity | null | undefined;
  program?: ProgramaAuditoriaEntity | null;
  allAudits?: ReadonlyArray<ProgramacionAuditEntity>;
  programs?: ReadonlyArray<ProgramaAuditoriaEntity>;
  temporalSites?: ReadonlyArray<AuditoriaSitioTemporalEntity>;
  findings?: ReadonlyArray<Phase5FindingEntity>;
  detailedCerts?: ReadonlyArray<CertificadoDetailEntity>;
}

const SECTION_STATUS_VISUALS: Record<
  AuditSectionStatus,
  { label: string; badgeClass: string; borderClass: string }
> = {
  COMPLETO: {
    label: 'Completo ✓',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    borderClass: 'border-emerald-200 bg-white hover:border-emerald-400 hover:bg-emerald-50/20',
  },
  EN_PROGRESO: {
    label: 'En progreso',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    borderClass: 'border-amber-200 bg-white hover:border-amber-400 hover:bg-amber-50/20',
  },
  PENDIENTE: {
    label: 'Pendiente',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    borderClass: 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/20',
  },
  NO_APLICA: {
    label: 'No aplica',
    badgeClass: 'bg-slate-50 text-slate-500 border-slate-200',
    borderClass: 'border-slate-200/80 bg-slate-50/70 hover:border-slate-300',
  },
};

function formatIsoDmy(iso: string | null | undefined): string {
  if (!iso) return '—';
  const clean = iso.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean || '—';
  const [y, m, d] = clean.split('-');
  return `${d}/${m}/${y}`;
}

function formatDaysValue(days: number): string {
  const rounded = roundAuditDaysQuarter(days);
  if (Math.abs(rounded - Math.round(rounded)) < 0.001) {
    return String(Math.round(rounded));
  }
  return Number(rounded.toFixed(2)).toString();
}

function makeSectionCard(params: {
  key: AuditSectionKey;
  stepTag: string;
  label: string;
  status: AuditSectionStatus;
  unlocked: boolean;
  headlineValue: string;
  secondaryMeta?: string;
  actionHint?: string;
}): AuditSectionSummaryCard {
  const visual = SECTION_STATUS_VISUALS[params.status];
  return {
    key: params.key,
    stepTag: params.stepTag,
    label: params.label,
    title: `${params.stepTag} ${params.label}`,
    status: params.status,
    statusLabel: visual.label,
    statusBadgeClass: visual.badgeClass,
    cardBorderClass: visual.borderClass,
    unlocked: params.unlocked,
    headlineValue: params.headlineValue,
    secondaryMeta: params.secondaryMeta ?? '',
    actionHint: params.actionHint ?? '',
  };
}

/**
 * Pure, deterministic evaluator of all 11 audit sections (`1.1`..`7.`) respecting parallel branches.
 * Serves as the single source of truth for `estatus_auditoria` in `Resumen`,
 * `Conglomerado → Auditorías`, and `Calendario`.
 */
export function computeAuditStatusSummary(
  input: ComputeAuditStatusSummaryInput
): AuditStatusSummaryResult {
  const {
    audit,
    program = null,
    allAudits = [],
    programs = [],
    temporalSites = [],
    findings = [],
    detailedCerts = [],
  } = input;

  if (!audit || audit.deleted_at) {
    const emptyCards: AuditSectionSummaryCard[] = [
      makeSectionCard({
        key: 'designacion/relacion',
        stepTag: '1.1',
        label: 'Relación',
        status: 'PENDIENTE',
        unlocked: true,
        headlineValue: 'Por confirmar',
        actionHint: 'Confirme la naturaleza de relación',
      }),
      makeSectionCard({
        key: 'designacion/tipo',
        stepTag: '1.2',
        label: 'Tipo',
        status: 'PENDIENTE',
        unlocked: true,
        headlineValue: 'Sin auditoría',
        actionHint: 'Cree o seleccione una auditoría',
      }),
      makeSectionCard({
        key: 'designacion/fecha',
        stepTag: '1.3',
        label: 'Fecha',
        status: 'PENDIENTE',
        unlocked: true,
        headlineValue: 'Sin fecha',
      }),
      makeSectionCard({
        key: 'designacion/sitio',
        stepTag: '1.4',
        label: 'Sitio',
        status: 'PENDIENTE',
        unlocked: true,
        headlineValue: '0 sitios',
      }),
      makeSectionCard({
        key: 'designacion/temporal',
        stepTag: '1.5',
        label: 'Temporal',
        status: 'NO_APLICA',
        unlocked: true,
        headlineValue: 'Temporal OFF',
      }),
      makeSectionCard({
        key: 'tiempo',
        stepTag: '2.',
        label: 'Tiempo',
        status: 'PENDIENTE',
        unlocked: false,
        headlineValue: '0 días',
      }),
      makeSectionCard({
        key: 'auditor',
        stepTag: '3.',
        label: 'Auditor',
        status: 'PENDIENTE',
        unlocked: false,
        headlineValue: '0 auditores',
      }),
      makeSectionCard({
        key: 'proceso',
        stepTag: '4.',
        label: 'Proceso',
        status: 'PENDIENTE',
        unlocked: false,
        headlineValue: '0 procesos',
      }),
      makeSectionCard({
        key: 'turno',
        stepTag: '5.',
        label: 'Turno',
        status: 'PENDIENTE',
        unlocked: false,
        headlineValue: '0 turnos',
      }),
      makeSectionCard({
        key: 'resultado',
        stepTag: '6.',
        label: 'Resultado',
        status: 'PENDIENTE',
        unlocked: false,
        headlineValue: 'Sin fecha real',
      }),
      makeSectionCard({
        key: 'revision',
        stepTag: '7.',
        label: 'Revisión',
        status: 'PENDIENTE',
        unlocked: false,
        headlineValue: 'Pendiente',
      }),
    ];
    return {
      auditId: null,
      codigo_auditoria: 'Sin auditoría',
      isCancelled: false,
      estatus_auditoria: 'Sin Auditoría',
      estatusBadgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
      completedCount: 0,
      applicableCount: 10,
      totalSectionsCount: 11,
      progressPct: 0,
      progressChip: '0/10',
      cards: emptyCards,
      recommendedNextActions: [],
      openNcsCount: 0,
      closedNcsCount: 0,
      totalNcsCount: 0,
      realDatesCount: 0,
    };
  }

  const normalizedPrograms =
    programs.length > 0 ? programs : program ? [program] : [];
  const normalizedAudits = allAudits.length > 0 ? allAudits : [audit];

  const statusLower = (audit.estatus || '').trim().toLowerCase();
  const isCancelled = audit.estado_ciclo === 'Cancelada' || statusLower === 'cancelada';

  const resolvedProgram =
    program ??
    (audit.id_programa_auditoria
      ? normalizedPrograms.find((p) => !p.deleted_at && p.id === audit.id_programa_auditoria) ??
        null
      : null);
  const linkedSiblingCount = resolvedProgram
    ? resolvedProgram.auditorias.filter((a) => !a.deleted_at).length
    : 1;

  // 1.1 Designación → Relación (naturaleza confirmada en Bloque 1 sin mutar cajas Bloque 2)
  const resolvedRelacionNature =
    (audit.tipo_vinculacion || '').trim() ||
    (resolvedProgram?.tipo_vinculacion || '').trim() ||
    '';
  const relacionStatus: AuditSectionStatus = resolvedRelacionNature ? 'COMPLETO' : 'PENDIENTE';
  const relacionHeadline = resolvedRelacionNature || 'Por confirmar';
  const relacionSecondary =
    resolvedProgram?.nivel_vinculacion === 'NIVEL_2_INTER_ORG'
      ? 'Nivel 2 · Inter-Organizacional'
      : resolvedProgram?.nivel_vinculacion === 'NIVEL_1_INTRA_ORG'
      ? 'Nivel 1 · Intra-Organizacional'
      : resolvedRelacionNature === 'Individual'
      ? 'Nivel Individual'
      : '';
  const relacionCard = makeSectionCard({
    key: 'designacion/relacion',
    stepTag: '1.1',
    label: 'Relación',
    status: relacionStatus,
    unlocked: true,
    headlineValue: relacionHeadline,
    secondaryMeta: relacionSecondary,
    actionHint:
      relacionStatus === 'COMPLETO'
        ? ''
        : 'Confirme la naturaleza de relación de esta auditoría',
  });

  // 1.2 Designación → Tipo
  const hasTipoId = Boolean((audit.id_tipo_auditoria || '').trim());
  const tipoStatus: AuditSectionStatus = hasTipoId ? 'COMPLETO' : 'PENDIENTE';
  const tipoHeadline = hasTipoId
    ? audit.tipo_auditoria || 'Tipo asignado'
    : 'Sin tipo asignado';
  const tipoSecondary =
    linkedSiblingCount > 1
      ? `Lote vinculado: ${linkedSiblingCount} certificados`
      : audit.metodologia
      ? `Modalidad: ${audit.metodologia}`
      : '';

  const tipoCard = makeSectionCard({
    key: 'designacion/tipo',
    stepTag: '1.2',
    label: 'Tipo',
    status: tipoStatus,
    unlocked: true,
    headlineValue: tipoHeadline,
    secondaryMeta: tipoSecondary,
    actionHint: tipoStatus === 'COMPLETO' ? '' : 'Seleccione el tipo de auditoría',
  });

  // 1.3 Designación → Fecha (programada; paralelo tras creación)
  const plannedDates = extractActivePlannedDates(audit);
  const latestPlanned = plannedDates[plannedDates.length - 1] ?? null;
  const fallbackStart =
    !audit.fechas?.length && audit.fecha_inicio && /^\d{4}-\d{2}-\d{2}/.test(audit.fecha_inicio)
      ? audit.fecha_inicio.slice(0, 10)
      : null;
  const fallbackEnd =
    !audit.fechas?.length && audit.fecha_fin && /^\d{4}-\d{2}-\d{2}/.test(audit.fecha_fin)
      ? audit.fecha_fin.slice(0, 10)
      : fallbackStart;

  const hasPlannedDate = plannedDates.length > 0 || Boolean(fallbackStart);
  const fechaStatus: AuditSectionStatus = hasPlannedDate ? 'COMPLETO' : 'PENDIENTE';
  let fechaHeadline = 'Sin fecha programada';
  let fechaSecondary = '';
  if (latestPlanned) {
    if (latestPlanned.tipo_fecha === 'PREPROGRAMADA_MES' && latestPlanned.anio && latestPlanned.mes) {
      fechaHeadline = formatAuditDateLabel(latestPlanned);
      fechaSecondary = 'Pre-programada (Mes estimado)';
    } else if (latestPlanned.fecha_inicio) {
      const sFmt = formatIsoDmy(latestPlanned.fecha_inicio);
      const eFmt =
        latestPlanned.fecha_fin && latestPlanned.fecha_fin !== latestPlanned.fecha_inicio
          ? formatIsoDmy(latestPlanned.fecha_fin)
          : null;
      fechaHeadline = eFmt ? `${sFmt} – ${eFmt}` : sFmt;
      fechaSecondary =
        plannedDates.length > 1
          ? `Exacta · Reprog. #${plannedDates.length}`
          : 'Programada exacta';
    }
  } else if (fallbackStart) {
    const sFmt = formatIsoDmy(fallbackStart);
    const eFmt = fallbackEnd && fallbackEnd > fallbackStart ? formatIsoDmy(fallbackEnd) : null;
    fechaHeadline = eFmt ? `${sFmt} – ${eFmt}` : sFmt;
    fechaSecondary = 'Programada exacta';
  }

  const fechaCard = makeSectionCard({
    key: 'designacion/fecha',
    stepTag: '1.3',
    label: 'Fecha',
    status: fechaStatus,
    unlocked: true,
    headlineValue: fechaHeadline,
    secondaryMeta: fechaSecondary,
    actionHint: fechaStatus === 'COMPLETO' ? '' : 'Defina mes estimado o fechas exactas',
  });

  // 1.3 Designación → Sitio (strictly scoped to audit.id_certificado_version when version/site catalog exists)
  const rawActiveSites = (audit.sitiosPlan || []).filter((s) => !s.deleted_at);
  const matchedDetailedCert =
    detailedCerts.length > 0 && audit.id_certificado
      ? detailedCerts.find(
          (c) =>
            !('deleted_at' in c && Boolean((c as { deleted_at?: string | null }).deleted_at)) &&
            c.id === audit.id_certificado
        ) ?? null
      : null;
  const hasVersionedOrSiteData = Boolean(
    matchedDetailedCert &&
      ((matchedDetailedCert.versiones ?? []).some((v) => !v.deleted_at) ||
        (matchedDetailedCert.sitios ?? []).length > 0)
  );
  const versionSnapshot = hasVersionedOrSiteData
    ? resolveCertVersionSnapshotForAudit(audit, detailedCerts)
    : null;
  const allowedVersionSiteIds = versionSnapshot
    ? new Set(versionSnapshot.sitios.map((s) => s.id))
    : null;
  const activeSites =
    allowedVersionSiteIds &&
    !(allowedVersionSiteIds.size === 0 && rawActiveSites.length > 0 && !audit.id_certificado_version)
      ? rawActiveSites.filter((s) => allowedVersionSiteIds.has(s.id_sitio))
      : rawActiveSites;
  const sitioStatus: AuditSectionStatus = activeSites.length > 0 ? 'COMPLETO' : 'PENDIENTE';
  const temporalResolution = resolveLinkedBatchTemporalState(
    audit,
    normalizedAudits,
    normalizedPrograms,
    temporalSites
  );
  const isTemporalOn = temporalResolution.isTemporalEnabled;
  const hqSiteCount = activeSites.filter((s) => s.numero_sitio === 0).length;
  const branchCount = Math.max(0, activeSites.length - hqSiteCount);
  const sitioHeadline =
    activeSites.length > 0
      ? `${activeSites.length} ${activeSites.length === 1 ? 'sitio' : 'sitios'} · Temporal ${
          isTemporalOn ? 'ON' : 'OFF'
        }`
      : 'Sin sitios asignados';
  const sitioSecondary =
    activeSites.length > 0
      ? hqSiteCount > 0 && branchCount > 0
        ? `HQ + ${branchCount} ${branchCount === 1 ? 'sucursal' : 'sucursales'}`
        : hqSiteCount > 0
        ? 'Sede Principal (HQ)'
        : `${activeSites.length} sitio(s) seleccionados`
      : '';

  const sitioCard = makeSectionCard({
    key: 'designacion/sitio',
    stepTag: '1.4',
    label: 'Sitio',
    status: sitioStatus,
    unlocked: true,
    headlineValue: sitioHeadline,
    secondaryMeta: sitioSecondary,
    actionHint: sitioStatus === 'COMPLETO' ? '' : 'Seleccione los sitios permanentes a auditar',
  });

  // 1.5 Designación → Temporal (NO_APLICA si OFF; COMPLETO si ON con ubicación + tiempo > 0)
  const activeTemporalSites = temporalResolution.activeTemporalSites;
  let temporalStatus: AuditSectionStatus = 'NO_APLICA';
  let temporalHeadline = 'Temporal OFF';
  let temporalSecondary = 'Sin sitio temporal requerido';
  let temporalHint = '';
  let temporalDaysTotal = 0;
  let temporalHasPositiveTime = false;

  if (isTemporalOn) {
    temporalDaysTotal = roundAuditDaysQuarter(
      activeTemporalSites.reduce((sum, t) => sum + (t.tiempo_auditoria || 0), 0)
    );
    temporalHasPositiveTime =
      activeTemporalSites.length > 0 &&
      activeTemporalSites.every(
        (t) => Number.isFinite(t.tiempo_auditoria) && t.tiempo_auditoria > 0
      );

    if (activeTemporalSites.length === 0) {
      temporalStatus = 'PENDIENTE';
      temporalHeadline = 'Sin configurar';
      temporalSecondary = 'Switch Temporal activo (ON)';
      temporalHint = 'Registre ubicación y días del sitio temporal';
    } else {
      const firstTemp = temporalResolution.primaryTemporalSite ?? activeTemporalSites[0];
      const allHaveLocation = activeTemporalSites.every((t) => {
        const parsed = parseTemporalSiteDetails(t.comentario);
        return parsed.ubicacion.trim().length > 0;
      });
      const firstDetails = parseTemporalSiteDetails(firstTemp.comentario);
      if (temporalHasPositiveTime && allHaveLocation) {
        temporalStatus = 'COMPLETO';
        temporalHeadline = `${firstTemp.etiqueta || 'Sitio Temporal'} · ${formatDaysValue(
          temporalDaysTotal
        )} d`;
        temporalSecondary = firstDetails.ubicacion;
      } else {
        temporalStatus = 'EN_PROGRESO';
        temporalHeadline = `${firstTemp.etiqueta || 'Sitio Temporal'} · Incompleto`;
        temporalSecondary = allHaveLocation
          ? firstDetails.ubicacion
          : 'Ubicación pendiente';
        temporalHint =
          !allHaveLocation && !temporalHasPositiveTime
            ? 'Complete ubicación y tiempo (> 0d)'
            : !allHaveLocation
            ? 'Complete la ubicación del sitio temporal'
            : 'Defina un tiempo mayor a 0 días';
      }
    }
  }

  const temporalCard = makeSectionCard({
    key: 'designacion/temporal',
    stepTag: '1.5',
    label: 'Temporal',
    status: temporalStatus,
    unlocked: true,
    headlineValue: temporalHeadline,
    secondaryMeta: temporalSecondary,
    actionHint: temporalHint,
  });

  // 2. Tiempo (depende de 1.4 Sitio; paralelo con 4. Proceso)
  const permanentDaysTotal = roundAuditDaysQuarter(
    activeSites.reduce((sum, s) => sum + (s.tiempo_auditoria || 0), 0)
  );
  const sitesWithTime = activeSites.filter(
    (s) => Number.isFinite(s.tiempo_auditoria) && s.tiempo_auditoria > 0
  ).length;
  const tiempoUnlocked = activeSites.length > 0;
  let tiempoStatus: AuditSectionStatus = 'PENDIENTE';
  let tiempoHeadline = '0 días';
  let tiempoSecondary = '';
  let tiempoHint = '';

  if (!tiempoUnlocked) {
    tiempoStatus = 'PENDIENTE';
    tiempoHeadline = '0 días';
    tiempoHint = 'Defina sitios en 1.4 Sitio primero';
  } else if (sitesWithTime === activeSites.length && permanentDaysTotal > 0) {
    tiempoStatus = 'COMPLETO';
    tiempoHeadline = `${formatDaysValue(permanentDaysTotal)} días totales`;
    tiempoSecondary =
      isTemporalOn && temporalDaysTotal > 0
        ? `${activeSites.length}/${activeSites.length} sitios · +${formatDaysValue(
            temporalDaysTotal
          )}d temp.`
        : `${activeSites.length}/${activeSites.length} sitios con tiempo ✓`;
  } else if (sitesWithTime > 0) {
    tiempoStatus = 'EN_PROGRESO';
    tiempoHeadline = `${formatDaysValue(permanentDaysTotal)} d (${sitesWithTime}/${activeSites.length} sitios)`;
    tiempoHint = `Asigne tiempo en ${activeSites.length - sitesWithTime} sitio(s) restante(s)`;
  } else {
    tiempoStatus = 'PENDIENTE';
    tiempoHeadline = '0 días asignados';
    tiempoHint = 'Asigne días-auditor (> 0) por sitio';
  }

  const tiempoCard = makeSectionCard({
    key: 'tiempo',
    stepTag: '2.',
    label: 'Tiempo',
    status: tiempoStatus,
    unlocked: tiempoUnlocked,
    headlineValue: tiempoHeadline,
    secondaryMeta: tiempoSecondary,
    actionHint: tiempoHint,
  });

  // 3. Auditor (depende de 2. Tiempo y de 1.5 Temporal si está ON)
  let assignedRegularDays = 0;
  let regularBalancedSites = 0;
  const auditorIdsSet = new Set<string>();

  for (const site of activeSites) {
    const activeMembers = (site.equipoSitio || []).filter((m) => !m.deleted_at);
    const siteAssigned = roundAuditDaysQuarter(
      activeMembers.reduce((sum, m) => sum + (m.tiempo_auditoria || 0), 0)
    );
    assignedRegularDays = roundAuditDaysQuarter(assignedRegularDays + siteAssigned);
    if (
      site.tiempo_auditoria > 0 &&
      siteAssigned > 0 &&
      Math.abs(siteAssigned - site.tiempo_auditoria) <= 0.001
    ) {
      regularBalancedSites += 1;
    }
    for (const m of activeMembers) {
      if (m.id_auditor) auditorIdsSet.add(m.id_auditor);
    }
  }

  let assignedTemporalDays = 0;
  let temporalBalancedCount = 0;
  for (const tempSite of activeTemporalSites) {
    const activeMembers = (tempSite.equipoTemporal || []).filter((m) => !m.deleted_at);
    const tempAssigned = roundAuditDaysQuarter(
      activeMembers.reduce((sum, m) => sum + (m.tiempo_auditoria || 0), 0)
    );
    assignedTemporalDays = roundAuditDaysQuarter(assignedTemporalDays + tempAssigned);
    if (
      tempSite.tiempo_auditoria > 0 &&
      tempAssigned > 0 &&
      Math.abs(tempAssigned - tempSite.tiempo_auditoria) <= 0.001
    ) {
      temporalBalancedCount += 1;
    }
    for (const m of activeMembers) {
      if (m.id_auditor) auditorIdsSet.add(m.id_auditor);
    }
  }

  const totalRequiredDays = roundAuditDaysQuarter(
    permanentDaysTotal + (isTemporalOn ? temporalDaysTotal : 0)
  );
  const totalAssignedDays = roundAuditDaysQuarter(
    assignedRegularDays + (isTemporalOn ? assignedTemporalDays : 0)
  );
  const allRegularBalanced =
    activeSites.length > 0 && regularBalancedSites === activeSites.length;
  const allTemporalBalanced =
    !isTemporalOn ||
    (activeTemporalSites.length > 0 && temporalBalancedCount === activeTemporalSites.length);
  const auditorUnlocked =
    tiempoStatus === 'COMPLETO' && (!isTemporalOn || temporalHasPositiveTime);

  let auditorStatus: AuditSectionStatus = 'PENDIENTE';
  let auditorHeadline = '0 auditores';
  let auditorSecondary = '';
  let auditorHint = '';

  if (!auditorUnlocked) {
    auditorStatus = 'PENDIENTE';
    auditorHeadline = totalAssignedDays > 0 ? `${formatDaysValue(totalAssignedDays)} d` : 'Por asignar';
    auditorHint =
      tiempoStatus !== 'COMPLETO'
        ? 'Complete 2. Tiempo para habilitar balanceo'
        : 'Defina tiempo > 0 en 1.5 Temporal';
  } else if (allRegularBalanced && allTemporalBalanced && totalAssignedDays > 0) {
    auditorStatus = 'COMPLETO';
    const audCount = Math.max(1, auditorIdsSet.size);
    auditorHeadline = `${audCount} ${audCount === 1 ? 'auditor' : 'auditores'} · ${formatDaysValue(
      totalAssignedDays
    )}/${formatDaysValue(totalRequiredDays)} d ✓`;
    auditorSecondary = audit.auditor_lider ? `Líder: ${audit.auditor_lider}` : 'Equipo balanceado';
  } else {
    auditorStatus = totalAssignedDays > 0 ? 'EN_PROGRESO' : 'PENDIENTE';
    const diff = roundAuditDaysQuarter(totalRequiredDays - totalAssignedDays);
    auditorHeadline = `${formatDaysValue(totalAssignedDays)}/${formatDaysValue(totalRequiredDays)} d`;
    auditorSecondary =
      auditorIdsSet.size > 0
        ? `${auditorIdsSet.size} auditor(es) pre-asignados`
        : 'Sin equipo asignado';
    auditorHint =
      diff > 0.001
        ? `${Math.abs(diff - 1) < 0.001 ? 'Falta 1 día' : `Faltan ${formatDaysValue(diff)} días`} por asignar auditor`
        : diff < -0.001
        ? `Ajuste exceso de ${formatDaysValue(Math.abs(diff))} días`
        : 'Balancee los días por cada sitio';
  }

  const activeExpertAssignments = (audit.expertoTecnicoAsignaciones ?? []).filter(
    (item) => !item.deleted_at
  );
  if (activeExpertAssignments.length > 0) {
    const expertLabel = `${activeExpertAssignments.length} ${
      activeExpertAssignments.length === 1 ? 'exp. técnico' : 'exp. técnicos'
    }`;
    auditorSecondary = auditorSecondary
      ? `${auditorSecondary} · ${expertLabel}`
      : expertLabel;
  }

  const auditorCard = makeSectionCard({
    key: 'auditor',
    stepTag: '3.',
    label: 'Auditor',
    status: auditorStatus,
    unlocked: auditorUnlocked,
    headlineValue: auditorHeadline,
    secondaryMeta: auditorSecondary,
    actionHint: auditorHint,
  });

  // 4. Proceso (depende de 1.4 Sitio; paralelo con 2. Tiempo)
  const procesoUnlocked = activeSites.length > 0;
  let sitesWithProcesses = 0;
  let totalProcessesCount = 0;
  let totalPairsWithShifts = 0;

  const allowedVersionProcessIds =
    versionSnapshot && versionSnapshot.procesos.length > 0
      ? new Set(versionSnapshot.procesos.map((p) => p.id))
      : null;
  const embeddedTpsIds = versionSnapshot
    ? versionSnapshot.sitios.flatMap((s) =>
        (s.turnos_por_sitio || []).filter((t) => !t.deleted_at).map((t) => t.id)
      )
    : [];
  const allowedVersionTpsIds =
    embeddedTpsIds.length > 0 ? new Set(embeddedTpsIds) : null;

  for (const site of activeSites) {
    const rawProcs = (site.procesos || []).filter((p) => !p.deleted_at);
    const activeProcs =
      allowedVersionProcessIds !== null
        ? rawProcs.filter((p) => allowedVersionProcessIds.has(p.id_proceso))
        : rawProcs;
    if (activeProcs.length > 0) {
      sitesWithProcesses += 1;
    }
    totalProcessesCount += activeProcs.length;
    for (const proc of activeProcs) {
      const rawShifts = (proc.turnos || []).filter((t) => !t.deleted_at);
      const validShifts =
        allowedVersionTpsIds !== null
          ? rawShifts.filter(
              (t) => !t.id_turnos_por_sitio || allowedVersionTpsIds.has(t.id_turnos_por_sitio)
            )
          : rawShifts;
      if (validShifts.length > 0) {
        totalPairsWithShifts += 1;
      }
    }
  }

  let procesoStatus: AuditSectionStatus = 'PENDIENTE';
  let procesoHeadline = '0 procesos';
  let procesoSecondary = '';
  let procesoHint = '';

  if (!procesoUnlocked) {
    procesoStatus = 'PENDIENTE';
    procesoHeadline = '0 procesos';
    procesoHint = 'Defina sitios en 1.4 Sitio primero';
  } else if (sitesWithProcesses === activeSites.length && totalProcessesCount > 0) {
    procesoStatus = 'COMPLETO';
    procesoHeadline = `${totalProcessesCount} ${
      totalProcessesCount === 1 ? 'proceso' : 'procesos'
    }`;
    procesoSecondary = `${sitesWithProcesses}/${activeSites.length} sitios cubiertos ✓`;
  } else if (sitesWithProcesses > 0) {
    procesoStatus = 'EN_PROGRESO';
    procesoHeadline = `${totalProcessesCount} proceso(s) (${sitesWithProcesses}/${activeSites.length} sitios)`;
    procesoHint = `Faltan procesos en ${activeSites.length - sitesWithProcesses} sitio(s)`;
  } else {
    procesoStatus = 'PENDIENTE';
    procesoHeadline = '0 procesos';
    procesoHint = 'Seleccione ≥ 1 proceso por cada sitio';
  }

  const procesoCard = makeSectionCard({
    key: 'proceso',
    stepTag: '4.',
    label: 'Proceso',
    status: procesoStatus,
    unlocked: procesoUnlocked,
    headlineValue: procesoHeadline,
    secondaryMeta: procesoSecondary,
    actionHint: procesoHint,
  });

  // 5. Turno (depende de 4. Proceso)
  const turnoUnlocked = totalProcessesCount > 0;
  let turnoStatus: AuditSectionStatus = 'PENDIENTE';
  let turnoHeadline = '0 turnos';
  let turnoSecondary = '';
  let turnoHint = '';

  if (!turnoUnlocked) {
    turnoStatus = 'PENDIENTE';
    turnoHeadline = '0/0 turnos';
    turnoHint = 'Asigne procesos en 4. Proceso primero';
  } else if (
    totalPairsWithShifts === totalProcessesCount &&
    procesoStatus === 'COMPLETO'
  ) {
    turnoStatus = 'COMPLETO';
    turnoHeadline = `${totalPairsWithShifts}/${totalProcessesCount} turnos ✓`;
    turnoSecondary = '100% pares Sitio ↔ Proceso cubiertos';
  } else if (totalPairsWithShifts > 0) {
    turnoStatus = 'EN_PROGRESO';
    turnoHeadline = `${totalPairsWithShifts}/${totalProcessesCount} con turno`;
    turnoHint = `Falta turno en ${totalProcessesCount - totalPairsWithShifts} proceso(s)`;
  } else {
    turnoStatus = 'PENDIENTE';
    turnoHeadline = `0/${totalProcessesCount} con turno`;
    turnoHint = 'Asigne al menos 1 turno por cada proceso';
  }

  const turnoCard = makeSectionCard({
    key: 'turno',
    stepTag: '5.',
    label: 'Turno',
    status: turnoStatus,
    unlocked: turnoUnlocked,
    headlineValue: turnoHeadline,
    secondaryMeta: turnoSecondary,
    actionHint: turnoHint,
  });

  // 6. Resultado (fechas REAL + cierre de NCs)
  const realDates = extractDiscreteRealDates(audit);
  const realDatesCount = realDates.length;
  const auditFindings = findings.filter(
    (f) => !f.deleted_at && f.id_auditoria === audit.id
  );
  const ncFindings = auditFindings.filter(
    (f) => f.tipo === 'NC_MAYOR' || f.tipo === 'NC_MENOR'
  );
  const totalNcsCount = ncFindings.length;
  const closedNcsCount = ncFindings.filter((f) =>
    Boolean(
      f.cerrado ||
        (f.fecha_cierre_real && f.fecha_cierre_real.trim()) ||
        (f.fecha_cierre && f.fecha_cierre.trim())
    )
  ).length;
  const openNcsCount = totalNcsCount - closedNcsCount;

  const planningReady =
    relacionStatus === 'COMPLETO' &&
    tipoStatus === 'COMPLETO' &&
    fechaStatus === 'COMPLETO' &&
    sitioStatus === 'COMPLETO' &&
    (temporalStatus === 'COMPLETO' || temporalStatus === 'NO_APLICA') &&
    tiempoStatus === 'COMPLETO' &&
    auditorStatus === 'COMPLETO' &&
    procesoStatus === 'COMPLETO' &&
    turnoStatus === 'COMPLETO';

  const resultadoUnlocked = planningReady || realDatesCount > 0 || auditFindings.length > 0;
  let resultadoStatus: AuditSectionStatus = 'PENDIENTE';
  let resultadoHeadline = 'Sin fecha real';
  let resultadoSecondary = '';
  let resultadoHint = '';

  if (realDatesCount > 0 && openNcsCount === 0) {
    resultadoStatus = 'COMPLETO';
    resultadoHeadline =
      totalNcsCount === 0
        ? `${realDatesCount} ${realDatesCount === 1 ? 'fecha real' : 'fechas reales'} · 0 NCs`
        : `${totalNcsCount} ${totalNcsCount === 1 ? 'NC' : 'NCs'} (${closedNcsCount} cerrada${
            closedNcsCount === 1 ? '' : 's'
          } ✓)`;
    resultadoSecondary =
      auditFindings.length > totalNcsCount
        ? `${auditFindings.length - totalNcsCount} observación(es)/OM`
        : `Última real: ${realDates[realDates.length - 1].dmyLabel}`;
  } else if (realDatesCount > 0 && openNcsCount > 0) {
    resultadoStatus = 'EN_PROGRESO';
    resultadoHeadline = `${totalNcsCount} NC${totalNcsCount === 1 ? '' : 's'} (${closedNcsCount} cerrada${
      closedNcsCount === 1 ? '' : 's'
    })`;
    resultadoSecondary = `${openNcsCount} NC abierta(s)`;
    resultadoHint = `Registre fecha de cierre real en ${openNcsCount} NC(s)`;
  } else if (totalNcsCount > 0) {
    resultadoStatus = 'EN_PROGRESO';
    resultadoHeadline = `${totalNcsCount} NC(s) · Sin fecha real`;
    resultadoHint = 'Registre al menos 1 fecha real en 6. Resultado';
  } else {
    resultadoStatus = 'PENDIENTE';
    resultadoHeadline = 'Sin fecha real';
    resultadoHint = planningReady
      ? 'Registre fecha(s) real(es) de ejecución'
      : 'Pendiente de ejecución en sitio';
  }

  const resultadoCard = makeSectionCard({
    key: 'resultado',
    stepTag: '6.',
    label: 'Resultado',
    status: resultadoStatus,
    unlocked: resultadoUnlocked,
    headlineValue: resultadoHeadline,
    secondaryMeta: resultadoSecondary,
    actionHint: resultadoHint,
  });

  // 7. Revisión (fecha_revision registrada)
  const fechaRevisionRaw = (audit.fecha_revision || '').trim();
  const isReviewed = Boolean(fechaRevisionRaw) || audit.revisado === true;
  const revisionUnlocked = resultadoStatus === 'COMPLETO' || isReviewed;
  const revisionStatus: AuditSectionStatus = isReviewed ? 'COMPLETO' : 'PENDIENTE';
  const revisionHeadline = fechaRevisionRaw
    ? `Revisada ${formatIsoDmy(fechaRevisionRaw)}`
    : audit.revisado
    ? 'Revisada ✓'
    : 'Pendiente';
  const revisionSecondary = audit.resumen_revision?.trim() || '';

  const revisionCard = makeSectionCard({
    key: 'revision',
    stepTag: '7.',
    label: 'Revisión',
    status: revisionStatus,
    unlocked: revisionUnlocked,
    headlineValue: revisionHeadline,
    secondaryMeta: revisionSecondary,
    actionHint:
      revisionStatus === 'COMPLETO'
        ? ''
        : resultadoStatus === 'COMPLETO'
        ? 'Registre fecha de revisión QA'
        : 'Disponible tras completar 6. Resultado',
  });

  const cards: AuditSectionSummaryCard[] = [
    relacionCard,
    tipoCard,
    fechaCard,
    sitioCard,
    temporalCard,
    tiempoCard,
    auditorCard,
    procesoCard,
    turnoCard,
    resultadoCard,
    revisionCard,
  ];

  // Progress excludes N/A sections (e.g. 1.5 Temporal when OFF -> /10; /11 when ON)
  const applicableCards = cards.filter((c) => c.status !== 'NO_APLICA');
  const applicableCount = applicableCards.length;
  const completedCount = applicableCards.filter((c) => c.status === 'COMPLETO').length;
  const progressPct =
    applicableCount > 0 ? Math.round((completedCount / applicableCount) * 100) : 0;
  const progressChip = `${completedCount}/${applicableCount}`;

  // Parallel recommended next actions: every unlocked card that is PENDIENTE or EN_PROGRESO
  const recommendedNextActions: ParallelNextAction[] = isCancelled
    ? []
    : cards
        .filter(
          (c) => c.unlocked && (c.status === 'PENDIENTE' || c.status === 'EN_PROGRESO')
        )
        .map((c) => ({
          key: c.key,
          stepTag: c.stepTag,
          label: c.label,
          buttonLabel: `${c.status === 'EN_PROGRESO' ? 'Completar' : 'Definir'} ${c.stepTag} ${c.label} →`,
          status: c.status,
          actionHint: c.actionHint,
        }));

  // Deterministic estatus_auditoria
  let estatus_auditoria: ResumenAuditStatusLabel;
  let estatusBadgeClass: string;

  if (isCancelled) {
    estatus_auditoria = 'Cancelada';
    estatusBadgeClass = 'bg-rose-50 text-rose-800 border-rose-200';
  } else if (revisionStatus === 'COMPLETO') {
    estatus_auditoria = 'Completada ✓';
    estatusBadgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-200';
  } else if (resultadoStatus === 'COMPLETO') {
    estatus_auditoria = 'Pendiente de Revisión';
    estatusBadgeClass = 'bg-teal-50 text-teal-800 border-teal-200';
  } else if (realDatesCount > 0 && openNcsCount > 0) {
    estatus_auditoria = 'En Cierre de NC';
    estatusBadgeClass = 'bg-amber-50 text-amber-800 border-amber-200';
  } else if (planningReady) {
    estatus_auditoria = 'Programada / Lista para Ejecutar';
    estatusBadgeClass = 'bg-sky-50 text-sky-800 border-sky-200';
  } else if (
    tipoStatus !== 'COMPLETO' &&
    fechaStatus !== 'COMPLETO' &&
    sitioStatus !== 'COMPLETO'
  ) {
    estatus_auditoria = 'Pendiente de Designación';
    estatusBadgeClass = 'bg-slate-100 text-slate-700 border-slate-300';
  } else if (
    tipoStatus !== 'COMPLETO' ||
    fechaStatus !== 'COMPLETO' ||
    sitioStatus !== 'COMPLETO'
  ) {
    estatus_auditoria = 'En Designación';
    estatusBadgeClass = 'bg-cyan-50 text-cyan-800 border-cyan-200';
  } else if (
    tiempoStatus !== 'COMPLETO' &&
    procesoStatus === 'PENDIENTE' &&
    temporalStatus !== 'EN_PROGRESO'
  ) {
    estatus_auditoria = 'Por Asignar Tiempo';
    estatusBadgeClass = 'bg-orange-50 text-orange-800 border-orange-200';
  } else {
    estatus_auditoria = 'Planificación en Progreso';
    estatusBadgeClass = 'bg-indigo-50 text-indigo-800 border-indigo-200';
  }

  return {
    auditId: audit.id,
    codigo_auditoria: audit.codigo_auditoria || 'Auditoría',
    isCancelled,
    estatus_auditoria,
    estatusBadgeClass,
    completedCount,
    applicableCount,
    totalSectionsCount: cards.length,
    progressPct,
    progressChip,
    cards,
    recommendedNextActions,
    openNcsCount,
    closedNcsCount,
    totalNcsCount,
    realDatesCount,
  };
}

export interface CertificateResumenRow extends CertificateMultiViewRow {
  latestAuditCode: string;
  latestAuditCodename: string;
  latestAuditTooltip: string;
  latestAuditDateLabel: string;
  latestProgram: ProgramaAuditoriaEntity | null;
  statusSummary: AuditStatusSummaryResult;
  nextActionPreview: string;
  hasOpenNcsFlag: 'CON_NC_ABIERTA' | 'SIN_NC_ABIERTA';
  searchHaystack: string;
}

/**
 * Builds 1 row per visible Certificate for the `Resumen` Multi View (`#/auditorias/resumen`).
 */
export function buildCertificateResumenRows(
  params: BuildCertificateMultiViewRowsParams & {
    temporalSites?: ReadonlyArray<AuditoriaSitioTemporalEntity>;
    findings?: ReadonlyArray<Phase5FindingEntity>;
  }
): CertificateResumenRow[] {
  const { temporalSites = [], findings = [] } = params;
  const baseRows = buildCertificateMultiViewRows(params);
  const programs = params.programs ?? [];
  const fullDetailedCerts = (params.detailedCerts ?? []).filter(
    (dc): dc is CertificadoDetailEntity =>
      !('deleted_at' in dc && Boolean(dc.deleted_at)) &&
      'sitios' in dc &&
      Array.isArray(dc.sitios)
  );

  return baseRows.map((row) => {
    const latest = row.latestAudit;
    const statusSummary = computeAuditStatusSummary({
      audit: latest,
      program: row.latestProgram,
      allAudits: params.audits,
      programs,
      temporalSites,
      findings,
      detailedCerts: fullDetailedCerts,
    });

    const latestAuditDateLabel = row.latestPlannedDate
      ? formatAuditDateLabel(row.latestPlannedDate)
      : latest?.fecha_inicio
      ? formatIsoDmy(latest.fecha_inicio)
      : 'Sin fecha';

    const latestAuditCodename = latest ? formatAuditCodename(latest) : 'Sin auditorías';
    const latestAuditTooltip = latest ? getAuditCodenameTooltip(latest) : 'Sin auditorías';

    const nextActionPreview =
      statusSummary.recommendedNextActions.length > 0
        ? statusSummary.recommendedNextActions
            .slice(0, 2)
            .map((a) => `${a.stepTag} ${a.label}`)
            .join(' · ')
        : statusSummary.estatus_auditoria === 'Completada ✓'
        ? 'Ciclo completado'
        : '—';

    return {
      ...row,
      latestAuditCode: latest?.codigo_auditoria || 'Sin auditorías',
      latestAuditCodename,
      latestAuditTooltip,
      latestAuditDateLabel,
      statusSummary,
      nextActionPreview,
      hasOpenNcsFlag:
        statusSummary.openNcsCount > 0 ? 'CON_NC_ABIERTA' : 'SIN_NC_ABIERTA',
      searchHaystack: [
        row.numero_certificado,
        row.organizacion_nombre,
        row.organizacion_abreviacion || '',
        row.alcance_es || '',
        row.norma_codigo,
        latest?.codigo_auditoria || '',
        row.latestProgram?.codigo_programa || '',
        latest ? latestAuditCodename : '',
        latest?.tipo_auditoria || '',
        statusSummary.estatus_auditoria,
        nextActionPreview,
      ]
        .join(' ')
        .toLowerCase(),
    };
  });
}

// =============================================================================
// Step 3.3 — Organization Multi View & Picker Metadata (`Resumen`)
// =============================================================================

export interface ResumenOrgCertMeta {
  normaCodigo: string;
  latestAuditCode: string;
  latestAuditCodename: string;
  latestAuditTooltip: string;
  latestAuditDateLabel: string;
  statusSummary: AuditStatusSummaryResult;
  nextActionPreview: string;
  hasOpenNcsFlag: 'CON_NC_ABIERTA' | 'SIN_NC_ABIERTA';
}

export function createResumenOrgCertMetaResolver(params: {
  audits: ReadonlyArray<ProgramacionAuditEntity>;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  temporalSites?: ReadonlyArray<AuditoriaSitioTemporalEntity>;
  findings?: ReadonlyArray<Phase5FindingEntity>;
  detailedCerts?: ReadonlyArray<CertificadoDetailEntity>;
}): OrgCertMetaResolver<ResumenOrgCertMeta> {
  const {
    audits,
    programs,
    temporalSites = [],
    findings = [],
    detailedCerts = [],
  } = params;
  const fullDetailedCerts = detailedCerts.filter(
    (dc): dc is CertificadoDetailEntity =>
      !('deleted_at' in dc && Boolean(dc.deleted_at)) &&
      'sitios' in dc &&
      Array.isArray(dc.sitios)
  );

  return (ctx) => {
    const latest = ctx.latestAudit;
    const normaCodigo = ctx.certificado.norma_codigo || 'ISO';
    const statusSummary = computeAuditStatusSummary({
      audit: latest,
      program: ctx.program,
      allAudits: audits,
      programs,
      temporalSites,
      findings,
      detailedCerts: fullDetailedCerts,
    });
    const planned = latest
      ? resolveLatestPlannedDate(latest.fechas) ??
        (latest.latestDate && !latest.latestDate.deleted_at && latest.latestDate.tipo_fecha !== 'REAL'
          ? latest.latestDate
          : null)
      : null;
    const latestAuditDateLabel = planned
      ? formatAuditDateLabel(planned)
      : latest?.fecha_inicio
      ? formatIsoDmy(latest.fecha_inicio)
      : 'Sin fecha';
    const latestAuditCodename = latest ? formatAuditCodename(latest) : 'Sin auditorías';
    const latestAuditTooltip = latest ? getAuditCodenameTooltip(latest) : 'Sin auditorías';
    const nextActionPreview =
      statusSummary.recommendedNextActions.length > 0
        ? statusSummary.recommendedNextActions
            .slice(0, 2)
            .map((a) => `${a.stepTag} ${a.label}`)
            .join(' · ')
        : statusSummary.estatus_auditoria === 'Completada ✓'
        ? 'Ciclo completado'
        : '—';
    const hasOpenNcsFlag: 'CON_NC_ABIERTA' | 'SIN_NC_ABIERTA' =
      statusSummary.openNcsCount > 0 ? 'CON_NC_ABIERTA' : 'SIN_NC_ABIERTA';

    return {
      domainExtra: {
        normaCodigo,
        latestAuditCode: latest?.codigo_auditoria || 'Sin auditorías',
        latestAuditCodename,
        latestAuditTooltip,
        latestAuditDateLabel,
        statusSummary,
        nextActionPreview,
        hasOpenNcsFlag,
      },
      domainCells: {
        auditoria: `${latestAuditCodename} ${latestAuditDateLabel}`,
        avance: `${statusSummary.progressChip} ${statusSummary.progressPct}%`,
        estatus: statusSummary.estatus_auditoria,
      },
      searchText: [
        normaCodigo,
        latestAuditCodename,
        latest?.codigo_auditoria || '',
        latest?.tipo_auditoria || '',
        statusSummary.estatus_auditoria,
        nextActionPreview,
      ]
        .filter(Boolean)
        .join(' '),
    };
  };
}

export function buildResumenOrgFacetCategories(
  rows: ReadonlyArray<OrgMultiViewRow<ResumenOrgCertMeta>>
): MultiViewFacetCategory<OrgMultiViewRow<ResumenOrgCertMeta>>[] {
  const uniqueStatuses = Array.from(
    new Set(
      rows.flatMap((r) => r.certificates.map((c) => c.domainExtra.statusSummary.estatus_auditoria))
    )
  ).sort((a, b) => a.localeCompare(b, 'es'));

  const uniqueStandards = Array.from(
    new Set(rows.flatMap((r) => r.normas).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, 'es'));

  const uniqueConglomerados = Array.from(
    new Set(rows.map((r) => r.conglomeradoShortName).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, 'es'));

  return [
    ...(uniqueStatuses.length > 0
      ? [
          {
            id: 'estatus_auditoria',
            label: 'Estatus Auditoría',
            options: uniqueStatuses.map((s) => ({ value: s, label: s })),
            extractValues: (r: OrgMultiViewRow<ResumenOrgCertMeta>) =>
              Array.from(
                new Set(r.certificates.map((c) => c.domainExtra.statusSummary.estatus_auditoria))
              ),
          },
        ]
      : []),
    ...(uniqueStandards.length > 0
      ? [
          {
            id: 'norma',
            label: 'Norma',
            options: uniqueStandards.map((n) => ({ value: n, label: n })),
            extractValues: (r: OrgMultiViewRow<ResumenOrgCertMeta>) => r.normas,
          },
        ]
      : []),
    {
      id: 'ncs_abiertas',
      label: 'Con NCs Abiertas',
      options: [
        { value: 'CON_NC_ABIERTA', label: 'Con NCs Abiertas' },
        { value: 'SIN_NC_ABIERTA', label: 'Sin NCs Abiertas' },
      ],
      extractValues: (r) =>
        r.certificates.some((c) => c.domainExtra.hasOpenNcsFlag === 'CON_NC_ABIERTA')
          ? 'CON_NC_ABIERTA'
          : 'SIN_NC_ABIERTA',
    },
    ...(uniqueConglomerados.length > 0
      ? [
          {
            id: 'conglomerado',
            label: 'Conglomerado / Tipo',
            options: uniqueConglomerados.map((c) => ({ value: c, label: c })),
            extractValues: (r: OrgMultiViewRow<ResumenOrgCertMeta>) => r.conglomeradoShortName,
          },
        ]
      : []),
  ];
}

