/**
 * Phase 4.2.3: Turno Domain Module (`turno` + `turnos_por_sitio` + `turnos_sitio_auditoria`)
 * Supports overnight shift duration calculation, reciprocal Sitio drill-down, and shift audits.
 */

import type { ProgramacionAuditEntity } from './auditExecution';
import type {
  AuditoriaProcesoSitioItem,
  AuditoriaSitioPlanItem,
  AuditoriaTurnoProcesoLink,
} from './auditPlanningEngine';
import { containsRawUuid } from './breadcrumb';
import {
  buildCertificateMultiViewRows,
  type BuildCertificateMultiViewRowsParams,
  type CertificateMultiViewRow,
} from './certificateAuditSelector';
import { resolveCertVersionSnapshotForAudit } from './certificadoVersionDomain';
import type {
  CertificadoDetailEntity,
  ProcesoTipo,
  TurnoPorSitioLink,
} from './multisiteSampling';
import {
  buildProcessHistoryForSite,
  normalizeProcessNameKey,
  resolveSiteShiftOptionsForProcess,
  type CandidateProcessEntity,
} from './programaCertificadoDomain';
import {
  INITIAL_TURNO_CATALOG,
  formatShiftTime,
  type ProcesoPorSitioLink,
  type TurnoCatalogItem,
} from './sitioDomain';
import {
  formatAuditDateLabel,
  resolveLatestPlannedDate,
} from './auditPlanningEngine';
import {
  formatAuditCodename,
  getAuditCodenameTooltip,
} from './codenameDomain';
import type {
  OrgCertMetaResolver,
  OrgMultiViewRow,
} from './orgMultiViewPickerDomain';
import type { MultiViewFacetCategory } from './universalTemplate';

export type TurnoDetailMode = 'read' | 'add' | 'edit';

export interface TurnoFormDraft {
  hora_entrada: string;
  hora_salida: string;
  descripcion: string;
  id_sitio?: string;
}

export interface TurnoSitioLink {
  id_sitio: string;
  numero_sitio: number;
  nombre_sitio: string;
  direccion_sitio: string;
  id_certificado: string;
  numero_certificado: string;
  norma_codigo: string;
  id_organizacion: string;
  organizacion_nombre: string;
}

export interface TurnoAuditoriaLink {
  id_auditoria: string;
  codigo_auditoria: string;
  tipo_auditoria: string;
  metodologia: string;
  fecha_programacion: string;
  estatus: string;
  id_sitio: string | null;
  numero_sitio: number | null;
  nombre_sitio: string;
  id_certificado: string;
  numero_certificado: string;
}

export interface TurnoParentSitioContext {
  id_sitio: string;
  numero_sitio: number;
  nombre_sitio: string;
  id_certificado: string;
  numero_certificado: string;
  norma_codigo: string;
}

export interface TurnoDetailEntity {
  id: string;
  hora_entrada: string;
  hora_salida: string;
  descripcion: string;
  durationLabel: string;
  isOvernight: boolean;
  deleted_at: string | null;
  parentSitio: TurnoParentSitioContext | null;
  sitios: TurnoSitioLink[];
  auditorias: TurnoAuditoriaLink[];
}

export interface TurnoInputValidationParams {
  hora_entrada: string;
  hora_salida: string;
  descripcion?: string;
}

export interface TurnoInputValidationResult {
  valid: boolean;
  error?: string;
  normalized?: {
    hora_entrada: string;
    hora_salida: string;
    descripcion: string;
    durationLabel: string;
  };
}

export interface TurnoArchiveGuardResult {
  allowed: boolean;
  reason?: string;
}

function parseMinutes(rawTime: string | null | undefined): number | null {
  if (!rawTime) return null;
  const match = /^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(rawTime.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours * 60 + minutes;
}

/**
 * Formats shift time as `HH:MM`.
 */
export function formatTurnoTime(rawTime: string | null | undefined): string {
  return formatShiftTime(rawTime);
}

/**
 * Normalizes a valid `HH:MM` or `HH:MM:SS` input into PostgreSQL `TIME` string `HH:MM:00`.
 */
export function normalizeTurnoTimeForDb(rawTime: string): string {
  const formatted = formatTurnoTime(rawTime);
  if (/^\d{2}:\d{2}$/.test(formatted)) {
    return `${formatted}:00`;
  }
  return rawTime.trim();
}

/**
 * Calculates shift duration in `"Xh XXm"` format, appending `" (nocturno)"`
 * when the shift wraps past midnight (`endMin <= startMin`, e.g. `22:00` → `06:00` = `"8h 00m (nocturno)"`).
 */
export function computeShiftDurationLabel(
  horaEntrada: string | null | undefined,
  horaSalida: string | null | undefined
): string {
  const startMin = parseMinutes(horaEntrada);
  const endMin = parseMinutes(horaSalida);
  if (startMin === null || endMin === null) {
    return '—';
  }
  const isOvernight = endMin <= startMin;
  const diff = isOvernight ? endMin - startMin + 24 * 60 : endMin - startMin;
  const hours = Math.floor(diff / 60);
  const minutes = diff % 60;
  const base = `${hours}h ${String(minutes).padStart(2, '0')}m`;
  return isOvernight ? `${base} (nocturno)` : base;
}

export function isOvernightShift(
  horaEntrada: string | null | undefined,
  horaSalida: string | null | undefined
): boolean {
  const startMin = parseMinutes(horaEntrada);
  const endMin = parseMinutes(horaSalida);
  if (startMin === null || endMin === null) return false;
  return endMin <= startMin;
}

/**
 * Validates shift schedule attributes (`hora_entrada` and `hora_salida` valid `HH:MM` and unequal).
 */
export function validateTurnoInput(
  params: TurnoInputValidationParams
): TurnoInputValidationResult {
  const startFormatted = formatTurnoTime(params.hora_entrada);
  const endFormatted = formatTurnoTime(params.hora_salida);

  if (parseMinutes(params.hora_entrada) === null) {
    return {
      valid: false,
      error: 'La hora de entrada debe tener formato válido HH:MM (ej. 07:00).',
    };
  }
  if (parseMinutes(params.hora_salida) === null) {
    return {
      valid: false,
      error: 'La hora de salida debe tener formato válido HH:MM (ej. 15:00).',
    };
  }
  if (startFormatted === endFormatted) {
    return {
      valid: false,
      error: 'La hora de salida debe ser distinta a la hora de entrada.',
    };
  }

  const descripcion = (params.descripcion || '').trim() || `Turno ${startFormatted} – ${endFormatted}`;
  if (containsRawUuid(descripcion)) {
    return {
      valid: false,
      error: 'La descripción operativa del turno no debe incluir identificadores UUID internos.',
    };
  }

  return {
    valid: true,
    normalized: {
      hora_entrada: normalizeTurnoTimeForDb(startFormatted),
      hora_salida: normalizeTurnoTimeForDb(endFormatted),
      descripcion,
      durationLabel: computeShiftDurationLabel(startFormatted, endFormatted),
    },
  };
}

export function createEmptyTurnoFormDraft(prefillSitioId?: string | null): TurnoFormDraft {
  return {
    hora_entrada: '08:00',
    hora_salida: '16:00',
    descripcion: '',
    id_sitio: (prefillSitioId || '').trim(),
  };
}

export function createTurnoFormDraftFromEntity(
  turno: Pick<TurnoDetailEntity, 'hora_entrada' | 'hora_salida' | 'descripcion' | 'parentSitio'>
): TurnoFormDraft {
  return {
    hora_entrada: formatTurnoTime(turno.hora_entrada),
    hora_salida: formatTurnoTime(turno.hora_salida),
    descripcion: turno.descripcion || '',
    id_sitio: turno.parentSitio?.id_sitio || '',
  };
}

export function resolveTurnoDetailMode(
  state: { isCreating?: boolean; isEditingAttributes?: boolean },
  isStaff: boolean,
  selectedTurno?: TurnoDetailEntity | null
): TurnoDetailMode {
  if (!isStaff) return 'read';
  if (state.isCreating) return 'add';
  if (selectedTurno && state.isEditingAttributes) return 'edit';
  return 'read';
}

export function validateTurnoFormDraft(
  draft: TurnoFormDraft
): TurnoInputValidationResult {
  return validateTurnoInput({
    hora_entrada: draft.hora_entrada,
    hora_salida: draft.hora_salida,
    descripcion: draft.descripcion,
  });
}

/**
 * Governance guard matching `get_archive_dependency_summary('turno', ...)`:
 * Blocks archiving a shift while active `turnos_por_sitio` or `turno_certificado_compartido` links exist.
 */
export function canArchiveTurno(params: {
  assignedSitiosCount: number;
  sharedCertificatesCount?: number;
}): TurnoArchiveGuardResult {
  const assignedCount = Math.max(0, params.assignedSitiosCount);
  const sharedCount = Math.max(0, params.sharedCertificatesCount ?? 0);

  if (assignedCount > 0 && sharedCount > 0) {
    return {
      allowed: false,
      reason: `No se puede archivar este turno porque está asignado a ${assignedCount} sede(s) operativa(s) y compartido con ${sharedCount} certificado(s) del conglomerado. Desvincúlelo primero.`,
    };
  }
  if (assignedCount > 0) {
    return {
      allowed: false,
      reason: `No se puede archivar este turno porque está asignado a ${assignedCount} sede(s) operativa(s). Desvincúlelo primero de las sedes.`,
    };
  }
  if (sharedCount > 0) {
    return {
      allowed: false,
      reason: `No se puede archivar este turno porque está compartido con ${sharedCount} certificado(s) del conglomerado. Desvincúlelo primero de los certificados receptores.`,
    };
  }
  return { allowed: true };
}

/**
 * Resolves a `TurnoDetailEntity` by ID, joining all operating sites (`turnos_por_sitio`)
 * and scheduled audits (`turnos_sitio_auditoria`).
 * Populates `parentSitio` ONLY when `originatingSitioId` is provided and resolves cleanly.
 */
export function resolveTurnoDetailById(params: {
  turnoId: string;
  originatingSitioId?: string | null;
  activeCertId?: string | null;
  activeCertVersionId?: string | null;
  certificates: ReadonlyArray<CertificadoDetailEntity>;
  programacionAudits: ReadonlyArray<ProgramacionAuditEntity>;
  shiftCatalog?: ReadonlyArray<TurnoCatalogItem>;
  archivedSiteIds?: ReadonlySet<string>;
  archivedTurnoIds?: ReadonlySet<string>;
}): TurnoDetailEntity | null {
  const {
    turnoId,
    originatingSitioId,
    activeCertId = null,
    certificates,
    programacionAudits,
    shiftCatalog = INITIAL_TURNO_CATALOG,
    archivedSiteIds,
    archivedTurnoIds,
  } = params;

  if (!turnoId || archivedTurnoIds?.has(turnoId)) {
    return null;
  }

  const orderedCertificates = activeCertId
    ? [
        ...certificates.filter((c) => c.id === activeCertId),
        ...certificates.filter((c) => c.id !== activeCertId),
      ]
    : certificates;

  // Locate shift definition from active certificate context, catalog, or remaining certificates
  let baseShift: { id: string; hora_entrada: string; hora_salida: string; descripcion: string } | null = null;
  if (activeCertId) {
    const activeCert = certificates.find((c) => c.id === activeCertId);
    const activeFound = activeCert?.turnos.find((t) => t.id === turnoId);
    if (activeFound) {
      baseShift = {
        id: activeFound.id,
        hora_entrada: activeFound.hora_entrada,
        hora_salida: activeFound.hora_salida,
        descripcion: activeFound.descripcion,
      };
    }
  }

  if (!baseShift) {
    baseShift = shiftCatalog.find((t) => t.id === turnoId) || null;
  }

  if (!baseShift) {
    for (const cert of orderedCertificates) {
      const found = cert.turnos.find((t) => t.id === turnoId);
      if (found) {
        baseShift = {
          id: found.id,
          hora_entrada: found.hora_entrada,
          hora_salida: found.hora_salida,
          descripcion: found.descripcion,
        };
        break;
      }
    }
  }

  if (!baseShift) {
    return null;
  }

  const cleanShiftDesc = baseShift.descripcion.trim().toLowerCase();

  // Resolve all operating sites linked to this shift across active certificates
  const sitios: TurnoSitioLink[] = [];
  const seenSitioIds = new Set<string>();

  for (const cert of certificates) {
    const certHasShift = cert.turnos.some((t) => t.id === baseShift!.id);
    const certShiftEntry = cert.turnos.find((t) => t.id === baseShift!.id) || null;

    for (const site of cert.sitios) {
      if (archivedSiteIds?.has(site.id)) continue;
      if (seenSitioIds.has(site.id)) continue;

      const rangeLabel = `${formatTurnoTime(baseShift.hora_entrada)} – ${formatTurnoTime(baseShift.hora_salida)}`.toLowerCase();
      const linkedInTurnosPorSitio = (site.turnos_por_sitio || []).some(
        (tps) => !tps.deleted_at && tps.id_turno === baseShift!.id
      );
      const linkedInSiteLabels = (site.turnos_vinculados || []).some(
        (lbl) =>
          lbl.trim().toLowerCase() === cleanShiftDesc ||
          lbl.trim().toLowerCase() === rangeLabel ||
          lbl === baseShift!.id
      );
      const linkedInCertShift =
        certHasShift &&
        (certShiftEntry?.sitios_vinculados || []).some(
          (name) => name.trim().toLowerCase() === site.nombre_sitio.trim().toLowerCase()
        );

      if (linkedInTurnosPorSitio || linkedInSiteLabels || linkedInCertShift) {
        seenSitioIds.add(site.id);
        sitios.push({
          id_sitio: site.id,
          numero_sitio: site.numero_sitio,
          nombre_sitio: site.nombre_sitio,
          direccion_sitio: site.direccion_sitio,
          id_certificado: cert.id,
          numero_certificado: cert.numero_certificado,
          norma_codigo: cert.norma_codigo,
          id_organizacion: cert.id_organizacion,
          organizacion_nombre: cert.organizacion_nombre,
        });
      }
    }
  }

  // Contextual parent Sitio ONLY when navigated from a specific Sitio
  let parentSitio: TurnoParentSitioContext | null = null;
  if (originatingSitioId && !archivedSiteIds?.has(originatingSitioId)) {
    for (const cert of certificates) {
      const site = cert.sitios.find((s) => s.id === originatingSitioId);
      if (site) {
        parentSitio = {
          id_sitio: site.id,
          numero_sitio: site.numero_sitio,
          nombre_sitio: site.nombre_sitio,
          id_certificado: cert.id,
          numero_certificado: cert.numero_certificado,
          norma_codigo: cert.norma_codigo,
        };
        break;
      }
    }
  }

  // Resolve audits evaluating sites with this shift
  const auditorias: TurnoAuditoriaLink[] = [];
  const seenAuditSiteKeys = new Set<string>();

  for (const audit of programacionAudits) {
    const matchingSites = audit.sitiosMuestreo.filter((sm) =>
      sitios.some(
        (linkedSite) =>
          linkedSite.id_certificado === audit.id_certificado &&
          (linkedSite.id_sitio === sm.id_sitio || linkedSite.numero_sitio === sm.numero_sitio)
      )
    );
    for (const sm of matchingSites) {
      const matchedSite = sitios.find(
        (s) =>
          s.id_certificado === audit.id_certificado &&
          (s.id_sitio === sm.id_sitio || s.numero_sitio === sm.numero_sitio)
      );
      if (!matchedSite) continue;
      const key = `${audit.id}::${matchedSite.id_sitio}`;
      if (seenAuditSiteKeys.has(key)) continue;
      seenAuditSiteKeys.add(key);
      auditorias.push({
        id_auditoria: audit.id,
        codigo_auditoria: audit.codigo_auditoria,
        tipo_auditoria: audit.tipo_auditoria,
        metodologia: audit.metodologia,
        fecha_programacion: sm.fecha_asignada || audit.fecha_inicio,
        estatus: audit.estatus,
        id_sitio: matchedSite.id_sitio,
        numero_sitio: matchedSite.numero_sitio,
        nombre_sitio: matchedSite.nombre_sitio,
        id_certificado: audit.id_certificado,
        numero_certificado: audit.numero_certificado,
      });
    }
  }

  for (const cert of certificates) {
    for (const certAud of cert.auditorias) {
      const matchingCertSites = sitios.filter(
        (s) =>
          s.id_certificado === cert.id &&
          (!certAud.sitios_alcance ||
            certAud.sitios_alcance.length === 0 ||
            certAud.sitios_alcance.some(
              (lbl) => lbl.trim().toLowerCase() === s.nombre_sitio.trim().toLowerCase()
            ))
      );
      for (const matchedSite of matchingCertSites) {
        const key = `${certAud.id}::${matchedSite.id_sitio}`;
        if (seenAuditSiteKeys.has(key)) continue;
        seenAuditSiteKeys.add(key);
        auditorias.push({
          id_auditoria: certAud.id,
          codigo_auditoria: certAud.codigo_auditoria,
          tipo_auditoria: certAud.tipo_auditoria,
          metodologia: certAud.metodologia,
          fecha_programacion: certAud.fecha_programacion,
          estatus: certAud.estatus,
          id_sitio: matchedSite.id_sitio,
          numero_sitio: matchedSite.numero_sitio,
          nombre_sitio: matchedSite.nombre_sitio,
          id_certificado: cert.id,
          numero_certificado: cert.numero_certificado,
        });
      }
    }
  }

  return {
    id: baseShift.id,
    hora_entrada: baseShift.hora_entrada,
    hora_salida: baseShift.hora_salida,
    descripcion: baseShift.descripcion,
    durationLabel: computeShiftDurationLabel(baseShift.hora_entrada, baseShift.hora_salida),
    isOvernight: isOvernightShift(baseShift.hora_entrada, baseShift.hora_salida),
    deleted_at: null,
    parentSitio,
    sitios,
    auditorias,
  };
}

// =============================================================================
// Step 7.1 — `5. Turno` Certificate-Based Multi View & Anti-Fatigue Matrix Engine
// =============================================================================

export type CertTurnoStatus = 'COMPLETO' | 'PENDIENTE' | 'SIN_AUDITORIA';

export interface CertificateTurnoRow extends CertificateMultiViewRow {
  sitesCount: number;
  selectedProcessesCount: number;
  coveredProcessesCount: number;
  pendingProcessesCount: number;
  totalAssignedShifts: number;
  statusKey: CertTurnoStatus;
}

export interface SiteTurnoMatrixRow {
  psa: AuditoriaProcesoSitioItem;
  procesoMeta: CandidateProcessEntity | null;
  procesoNombre: string;
  normalizedNameKey: string;
  procesoTipo: ProcesoTipo;
  assignedTpsIds: string[];
  tpsaRecordByTpsId: Record<string, string>;
  isCovered: boolean;
}

export interface SiteTurnoColumnSummary {
  shift: TurnoPorSitioLink;
  timeRange: string;
  description: string;
  checkedCount: number;
  totalRowsCount: number;
  allRowsChecked: boolean;
}

export interface SiteTurnoMatrixModel {
  sitePlan: AuditoriaSitioPlanItem;
  siteBadgeLabel: string;
  siteShiftOptions: TurnoPorSitioLink[];
  rows: SiteTurnoMatrixRow[];
  columns: SiteTurnoColumnSummary[];
  selectedProcessesCount: number;
  coveredProcessesCount: number;
  pendingProcessesCount: number;
  isSingleShiftSite: boolean;
  isSiteComplete: boolean;
}

export interface AuditTurnoDetailModel {
  audit: ProgramacionAuditEntity;
  sites: SiteTurnoMatrixModel[];
  totalPairs: number;
  coveredPairs: number;
  pendingPairs: number;
  sitesWithPendingCount: number;
  isComplete: boolean;
}

export interface BatchShiftAssignmentTarget {
  sitePlanId: string;
  psaId: string;
  tpsId: string;
}

export interface ColumnShiftToggleTarget {
  psaId: string;
  tpsId: string;
  tpsaRecordId: string | null;
}

export interface ColumnShiftTogglePlan {
  mode: 'CHECK' | 'UNCHECK' | 'NOOP';
  targets: ColumnShiftToggleTarget[];
}

export interface HomonymousPropagationResult {
  assignments: BatchShiftAssignmentTarget[];
  matchedProcessesCount: number;
  skippedIncompatibleShiftsCount: number;
}

export function formatMatrixShiftLabel(shift: TurnoPorSitioLink): {
  timeRange: string;
  description: string;
} {
  const start = formatTurnoTime(shift.hora_entrada);
  const end = formatTurnoTime(shift.hora_salida);
  const timeRange = start && end ? `${start} – ${end}` : 'Horario por definir';
  const rawDesc = (shift.descripcion || '').trim();
  const description =
    rawDesc && rawDesc.toLowerCase() !== `turno ${timeRange}`.toLowerCase()
      ? rawDesc
      : '';
  return { timeRange, description };
}

function matchAssignedShiftOption(
  link: AuditoriaTurnoProcesoLink,
  siteShiftOptions: ReadonlyArray<TurnoPorSitioLink>
): TurnoPorSitioLink | null {
  if (link.deleted_at) return null;
  if (link.id_turnos_por_sitio) {
    const byTpsId = siteShiftOptions.find((opt) => opt.id === link.id_turnos_por_sitio);
    if (byTpsId) return byTpsId;
  }
  if (link.id_turnos_sitio_auditoria) {
    const byTsa = siteShiftOptions.find((opt) => opt.id === link.id_turnos_sitio_auditoria);
    if (byTsa) return byTsa;
  }
  const start = formatTurnoTime(link.hora_entrada);
  const end = formatTurnoTime(link.hora_salida);
  if (start && end) {
    const descKey = normalizeProcessNameKey(link.descripcion_turno);
    const exactTuple = siteShiftOptions.find(
      (opt) =>
        formatTurnoTime(opt.hora_entrada) === start &&
        formatTurnoTime(opt.hora_salida) === end &&
        (!descKey || normalizeProcessNameKey(opt.descripcion) === descKey)
    );
    if (exactTuple) return exactTuple;
  }
  return null;
}

/**
 * Construye el modelo matricial `Proceso × Turno del Sitio` para un sitio de auditoría.
 * Restringe columnas estrictamente a `turnos_por_sitio` activos de ese `id_sitio`.
 */
export function buildSiteTurnoMatrix(opts: {
  audit: ProgramacionAuditEntity;
  sitePlan: AuditoriaSitioPlanItem;
  allAudits: ReadonlyArray<ProgramacionAuditEntity>;
  allProcessesPorSitio: ReadonlyArray<ProcesoPorSitioLink>;
  allProcesses: ReadonlyArray<CandidateProcessEntity>;
  allTurnosPorSitio: ReadonlyArray<TurnoPorSitioLink>;
}): SiteTurnoMatrixModel {
  const {
    audit,
    sitePlan,
    allAudits,
    allProcessesPorSitio,
    allProcesses,
    allTurnosPorSitio,
  } = opts;

  const siteShiftOptions = resolveSiteShiftOptionsForProcess(
    sitePlan.id_sitio,
    allTurnosPorSitio
  );
  const activeProcs = (sitePlan.procesos || []).filter((p) => !p.deleted_at);
  const processById = new Map(
    allProcesses.filter((p) => !p.deleted_at).map((p) => [p.id, p])
  );
  const siteLinks = allProcessesPorSitio.filter(
    (l) => !l.deleted_at && l.id_sitio === sitePlan.id_sitio
  );
  const historyRows = buildProcessHistoryForSite(
    audit,
    sitePlan,
    siteLinks,
    allProcesses,
    allAudits
  );
  const historyProcByPpsId = new Map(
    historyRows.map((hr) => [hr.ppsLink.id, hr.proceso])
  );

  const rows: SiteTurnoMatrixRow[] = activeProcs.map((psa) => {
    const procesoMeta =
      historyProcByPpsId.get(psa.id_procesos_por_sitio) ??
      processById.get(psa.id_proceso) ??
      null;
    const procesoNombre =
      procesoMeta?.nombre_proceso || psa.proceso_nombre || 'Proceso Operativo';
    const procesoTipo: ProcesoTipo = procesoMeta?.tipo ?? 'Medular';

    const assignedSet = new Set<string>();
    const tpsaRecordByTpsId: Record<string, string> = {};
    for (const t of psa.turnos || []) {
      const matched = matchAssignedShiftOption(t, siteShiftOptions);
      if (matched) {
        assignedSet.add(matched.id);
        if (!tpsaRecordByTpsId[matched.id]) {
          tpsaRecordByTpsId[matched.id] = t.id;
        }
      }
    }

    const assignedTpsIds = Array.from(assignedSet);
    return {
      psa,
      procesoMeta,
      procesoNombre,
      normalizedNameKey: normalizeProcessNameKey(procesoNombre),
      procesoTipo,
      assignedTpsIds,
      tpsaRecordByTpsId,
      isCovered: assignedTpsIds.length >= 1,
    };
  });

  const columns: SiteTurnoColumnSummary[] = siteShiftOptions.map((shift) => {
    const { timeRange, description } = formatMatrixShiftLabel(shift);
    const checkedCount = rows.filter((r) => r.assignedTpsIds.includes(shift.id)).length;
    return {
      shift,
      timeRange,
      description,
      checkedCount,
      totalRowsCount: rows.length,
      allRowsChecked: rows.length > 0 && checkedCount === rows.length,
    };
  });

  const coveredProcessesCount = rows.filter((r) => r.isCovered).length;
  const pendingProcessesCount = rows.length - coveredProcessesCount;
  const siteBadgeLabel =
    sitePlan.numero_sitio === 0 ? 'Sitio 0 (HQ)' : `Sitio #${sitePlan.numero_sitio}`;

  return {
    sitePlan,
    siteBadgeLabel,
    siteShiftOptions,
    rows,
    columns,
    selectedProcessesCount: rows.length,
    coveredProcessesCount,
    pendingProcessesCount,
    isSingleShiftSite: siteShiftOptions.length === 1,
    isSiteComplete: rows.length > 0 && pendingProcessesCount === 0,
  };
}

function resolveVersionScopedTurnoInputs(opts: {
  audit: ProgramacionAuditEntity;
  allProcessesPorSitio: ReadonlyArray<ProcesoPorSitioLink>;
  allProcesses: ReadonlyArray<CandidateProcessEntity>;
  allTurnosPorSitio: ReadonlyArray<TurnoPorSitioLink>;
  certificados?: ReadonlyArray<CertificadoDetailEntity>;
}): {
  activeSites: AuditoriaSitioPlanItem[];
  scopedProcessesPorSitio: ReadonlyArray<ProcesoPorSitioLink>;
  scopedProcesses: ReadonlyArray<CandidateProcessEntity>;
  scopedTurnosPorSitio: ReadonlyArray<TurnoPorSitioLink>;
} {
  const {
    audit,
    allProcessesPorSitio,
    allProcesses,
    allTurnosPorSitio,
    certificados,
  } = opts;
  const rawSites = (audit.sitiosPlan || [])
    .filter((sp) => !sp.deleted_at)
    .slice()
    .sort((a, b) => a.numero_sitio - b.numero_sitio);

  if (!certificados || certificados.length === 0) {
    return {
      activeSites: rawSites,
      scopedProcessesPorSitio: allProcessesPorSitio,
      scopedProcesses: allProcesses,
      scopedTurnosPorSitio: allTurnosPorSitio,
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
      scopedTurnosPorSitio: allTurnosPorSitio,
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
      scopedTurnosPorSitio: allTurnosPorSitio,
    };
  }

  const knownCertSiteIds = new Set<string>([
    ...(cert.sitios ?? []).map((s) => s.id),
    ...(cert.versiones ?? []).flatMap((v) => (v.sitios ?? []).map((s) => s.id)),
  ]);
  if (
    rawSites.length > 0 &&
    knownCertSiteIds.size > 0 &&
    !rawSites.some((sp) => knownCertSiteIds.has(sp.id_sitio))
  ) {
    return {
      activeSites: rawSites,
      scopedProcessesPorSitio: allProcessesPorSitio,
      scopedProcesses: allProcesses,
      scopedTurnosPorSitio: allTurnosPorSitio,
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

  const embeddedTps = snapshot.sitios.flatMap((s) =>
    (s.turnos_por_sitio || []).filter((t) => !t.deleted_at)
  );
  const allowedShiftIds =
    snapshot.turnos.length > 0 ? new Set(snapshot.turnos.map((t) => t.id)) : null;
  const scopedTurnosPorSitio =
    embeddedTps.length > 0
      ? embeddedTps
      : shouldScopeSites
      ? allTurnosPorSitio.filter(
          (t) =>
            !t.deleted_at &&
            allowedSiteIds.has(t.id_sitio) &&
            (!allowedShiftIds || allowedShiftIds.has(t.id_turno))
        )
      : allTurnosPorSitio;

  return {
    activeSites,
    scopedProcessesPorSitio,
    scopedProcesses,
    scopedTurnosPorSitio,
  };
}

/**
 * Construye el modelo completo de detalle para `5. Turno` de una auditoría individual.
 */
export function buildAuditTurnoDetail(opts: {
  audit: ProgramacionAuditEntity;
  allAudits: ReadonlyArray<ProgramacionAuditEntity>;
  allProcessesPorSitio: ReadonlyArray<ProcesoPorSitioLink>;
  allProcesses: ReadonlyArray<CandidateProcessEntity>;
  allTurnosPorSitio: ReadonlyArray<TurnoPorSitioLink>;
  certificados?: ReadonlyArray<CertificadoDetailEntity>;
}): AuditTurnoDetailModel {
  const {
    audit,
    allAudits,
    allProcessesPorSitio,
    allProcesses,
    allTurnosPorSitio,
    certificados,
  } = opts;
  const scoped = resolveVersionScopedTurnoInputs({
    audit,
    allProcessesPorSitio,
    allProcesses,
    allTurnosPorSitio,
    certificados,
  });

  const sites = scoped.activeSites.map((sitePlan) =>
    buildSiteTurnoMatrix({
      audit,
      sitePlan,
      allAudits,
      allProcessesPorSitio: scoped.scopedProcessesPorSitio,
      allProcesses: scoped.scopedProcesses,
      allTurnosPorSitio: scoped.scopedTurnosPorSitio,
    })
  );

  const totalPairs = sites.reduce((sum, s) => sum + s.selectedProcessesCount, 0);
  const coveredPairs = sites.reduce((sum, s) => sum + s.coveredProcessesCount, 0);
  const pendingPairs = Math.max(0, totalPairs - coveredPairs);
  const sitesWithPendingCount = sites.filter(
    (s) => s.selectedProcessesCount > 0 && s.pendingProcessesCount > 0
  ).length;

  return {
    audit,
    sites,
    totalPairs,
    coveredPairs,
    pendingPairs,
    sitesWithPendingCount,
    isComplete: totalPairs > 0 && pendingPairs === 0,
  };
}

/**
 * Step 7.1 — Construye las filas Certificate-Based del Multi View `5. Turno`.
 */
export function buildCertificateTurnoRows(
  params: BuildCertificateMultiViewRowsParams & {
    allProcessesPorSitio: ReadonlyArray<ProcesoPorSitioLink>;
    allProcesses: ReadonlyArray<CandidateProcessEntity>;
    allTurnosPorSitio: ReadonlyArray<TurnoPorSitioLink>;
  }
): CertificateTurnoRow[] {
  const baseRows = buildCertificateMultiViewRows(params);
  const allAudits = params.audits.filter((a) => !a.deleted_at);

  return baseRows.map((row) => {
    if (!row.latestAudit) {
      return {
        ...row,
        sitesCount: 0,
        selectedProcessesCount: 0,
        coveredProcessesCount: 0,
        pendingProcessesCount: 0,
        totalAssignedShifts: 0,
        statusKey: 'SIN_AUDITORIA',
      };
    }

    const detail = buildAuditTurnoDetail({
      audit: row.latestAudit,
      allAudits,
      allProcessesPorSitio: params.allProcessesPorSitio,
      allProcesses: params.allProcesses,
      allTurnosPorSitio: params.allTurnosPorSitio,
      certificados: params.detailedCerts as ReadonlyArray<CertificadoDetailEntity> | undefined,
    });

    const totalAssignedShifts = detail.sites.reduce(
      (sum, s) => sum + s.rows.reduce((rSum, r) => rSum + r.assignedTpsIds.length, 0),
      0
    );

    const statusKey: CertTurnoStatus = detail.isComplete ? 'COMPLETO' : 'PENDIENTE';

    return {
      ...row,
      sitesCount: detail.sites.length,
      selectedProcessesCount: detail.totalPairs,
      coveredProcessesCount: detail.coveredPairs,
      pendingProcessesCount: detail.pendingPairs,
      totalAssignedShifts,
      statusKey,
    };
  });
}

/**
 * Acelerador 1: Para sitios con exactamente 1 turno configurado en `turnos_por_sitio`,
 * devuelve los pares `{ sitePlanId, psaId, tpsId }` para cubrir todos los procesos pendientes.
 */
export function computeSingleShiftPendingTargets(
  siteMatrix: SiteTurnoMatrixModel
): BatchShiftAssignmentTarget[] {
  if (siteMatrix.siteShiftOptions.length !== 1) return [];
  const onlyShift = siteMatrix.siteShiftOptions[0];
  return siteMatrix.rows
    .filter((r) => !r.isCovered)
    .map((r) => ({
      sitePlanId: siteMatrix.sitePlan.id,
      psaId: r.psa.id,
      tpsId: onlyShift.id,
    }));
}

/**
 * Acelerador 2: Aplica una selección batch de 1..N turnos válidos del sitio sobre
 * todos los procesos aún pendientes (`!isCovered`) del sitio.
 */
export function computeBatchApplyShiftsToPending(
  siteMatrix: SiteTurnoMatrixModel,
  selectedTpsIds: ReadonlyArray<string>
): BatchShiftAssignmentTarget[] {
  const validShiftIds = new Set(siteMatrix.siteShiftOptions.map((s) => s.id));
  const cleanShiftIds = Array.from(
    new Set(selectedTpsIds.filter((id) => validShiftIds.has(id)))
  );
  if (cleanShiftIds.length === 0) return [];

  const targets: BatchShiftAssignmentTarget[] = [];
  for (const row of siteMatrix.rows) {
    if (row.isCovered) continue;
    for (const tpsId of cleanShiftIds) {
      if (!row.assignedTpsIds.includes(tpsId)) {
        targets.push({
          sitePlanId: siteMatrix.sitePlan.id,
          psaId: row.psa.id,
          tpsId,
        });
      }
    }
  }
  return targets;
}

/**
 * Acelerador 3: Calcula el toggle de columna completa (`☑ Marcar todos [Turno X]`).
 * Si todas las filas objetivo ya tienen el turno marcado, propone `UNCHECK`; de lo contrario,
 * propone `CHECK` solo sobre las filas que aún no lo tienen.
 */
export function computeColumnShiftTogglePlan(
  siteMatrix: SiteTurnoMatrixModel,
  tpsId: string,
  visiblePsaIds?: ReadonlyArray<string>
): ColumnShiftTogglePlan {
  const isValidShift = siteMatrix.siteShiftOptions.some((s) => s.id === tpsId);
  if (!isValidShift) {
    return { mode: 'NOOP', targets: [] };
  }

  const visibleSet = visiblePsaIds ? new Set(visiblePsaIds) : null;
  const targetRows = visibleSet
    ? siteMatrix.rows.filter((r) => visibleSet.has(r.psa.id))
    : siteMatrix.rows;

  if (targetRows.length === 0) {
    return { mode: 'NOOP', targets: [] };
  }

  const allChecked = targetRows.every((r) => r.assignedTpsIds.includes(tpsId));
  if (allChecked) {
    return {
      mode: 'UNCHECK',
      targets: targetRows.map((r) => ({
        psaId: r.psa.id,
        tpsId,
        tpsaRecordId: r.tpsaRecordByTpsId[tpsId] ?? null,
      })),
    };
  }

  return {
    mode: 'CHECK',
    targets: targetRows
      .filter((r) => !r.assignedTpsIds.includes(tpsId))
      .map((r) => ({
        psaId: r.psa.id,
        tpsId,
        tpsaRecordId: null,
      })),
  };
}

function resolveCompatibleShiftInTargetSite(
  sourceShift: TurnoPorSitioLink,
  targetSiteShifts: ReadonlyArray<TurnoPorSitioLink>
): TurnoPorSitioLink | null {
  if (sourceShift.id_turno) {
    const byTurnoId = targetSiteShifts.find((ts) => ts.id_turno === sourceShift.id_turno);
    if (byTurnoId) return byTurnoId;
  }

  const srcStart = formatTurnoTime(sourceShift.hora_entrada);
  const srcEnd = formatTurnoTime(sourceShift.hora_salida);
  const srcDesc = normalizeProcessNameKey(sourceShift.descripcion);

  if (srcStart && srcEnd) {
    const exactMatch = targetSiteShifts.find(
      (ts) =>
        formatTurnoTime(ts.hora_entrada) === srcStart &&
        formatTurnoTime(ts.hora_salida) === srcEnd &&
        (!srcDesc || !ts.descripcion || normalizeProcessNameKey(ts.descripcion) === srcDesc)
    );
    if (exactMatch) return exactMatch;

    const scheduleOnlyMatch = targetSiteShifts.find(
      (ts) =>
        formatTurnoTime(ts.hora_entrada) === srcStart &&
        formatTurnoTime(ts.hora_salida) === srcEnd
    );
    if (scheduleOnlyMatch) return scheduleOnlyMatch;
  }

  return null;
}

/**
 * Acelerador 4: Propagación inteligente a procesos homónimos en otros sitios.
 * Copia los turnos configurados en `sourceSitePlanId` (para `sourcePsaId` o todos los
 * procesos cubiertos del sitio origen) hacia procesos homónimos en los demás sitios,
 * intersectando estrictamente con `turnos_por_sitio` válidos en cada sitio destino.
 */
export function resolveHomonymousTargetMatches(
  auditModel: AuditTurnoDetailModel,
  sourceSitePlanId: string,
  sourcePsaId?: string
): HomonymousPropagationResult {
  const sourceSite = auditModel.sites.find((s) => s.sitePlan.id === sourceSitePlanId);
  if (!sourceSite) {
    return {
      assignments: [],
      matchedProcessesCount: 0,
      skippedIncompatibleShiftsCount: 0,
    };
  }

  const sourceOptionById = new Map(sourceSite.siteShiftOptions.map((s) => [s.id, s]));
  const sourceRows = sourceSite.rows.filter(
    (r) => r.assignedTpsIds.length > 0 && (!sourcePsaId || r.psa.id === sourcePsaId)
  );
  if (sourceRows.length === 0) {
    return {
      assignments: [],
      matchedProcessesCount: 0,
      skippedIncompatibleShiftsCount: 0,
    };
  }

  const targetSites = auditModel.sites.filter((s) => s.sitePlan.id !== sourceSitePlanId);
  const assignments: BatchShiftAssignmentTarget[] = [];
  const seenKeys = new Set<string>();
  const matchedTargetPsaIds = new Set<string>();
  let skippedIncompatibleShiftsCount = 0;

  for (const srcRow of sourceRows) {
    const srcShifts = srcRow.assignedTpsIds
      .map((id) => sourceOptionById.get(id))
      .filter((s): s is TurnoPorSitioLink => Boolean(s));
    if (srcShifts.length === 0) continue;

    for (const targetSite of targetSites) {
      if (targetSite.siteShiftOptions.length === 0) {
        skippedIncompatibleShiftsCount += srcShifts.length;
        continue;
      }

      const targetRows = targetSite.rows.filter(
        (tr) =>
          (srcRow.psa.id_proceso && tr.psa.id_proceso === srcRow.psa.id_proceso) ||
          (srcRow.normalizedNameKey.length > 0 &&
            tr.normalizedNameKey === srcRow.normalizedNameKey)
      );

      for (const targetRow of targetRows) {
        let rowMatchedAny = false;
        for (const srcShift of srcShifts) {
          const compatibleTarget = resolveCompatibleShiftInTargetSite(
            srcShift,
            targetSite.siteShiftOptions
          );
          if (!compatibleTarget) {
            skippedIncompatibleShiftsCount += 1;
            continue;
          }
          rowMatchedAny = true;
          if (targetRow.assignedTpsIds.includes(compatibleTarget.id)) continue;
          const dedupeKey = `${targetSite.sitePlan.id}:${targetRow.psa.id}:${compatibleTarget.id}`;
          if (seenKeys.has(dedupeKey)) continue;
          seenKeys.add(dedupeKey);
          assignments.push({
            sitePlanId: targetSite.sitePlan.id,
            psaId: targetRow.psa.id,
            tpsId: compatibleTarget.id,
          });
        }
        if (rowMatchedAny) {
          matchedTargetPsaIds.add(targetRow.psa.id);
        }
      }
    }
  }

  return {
    assignments,
    matchedProcessesCount: matchedTargetPsaIds.size,
    skippedIncompatibleShiftsCount,
  };
}

/**
 * Evalúa si el paso `5. Turno` de una auditoría está completo (`100%` de pares `Sitio ↔ Proceso`
 * seleccionados tienen `>= 1` turno asignado).
 */
export function evaluateAuditTurnoCompleteness(
  audit: ProgramacionAuditEntity,
  allTurnosPorSitio?: ReadonlyArray<TurnoPorSitioLink>
): {
  totalPairs: number;
  coveredPairs: number;
  pendingPairs: number;
  isComplete: boolean;
} {
  const activeSites = (audit.sitiosPlan || []).filter((sp) => !sp.deleted_at);
  let totalPairs = 0;
  let coveredPairs = 0;

  for (const sp of activeSites) {
    const siteShifts = allTurnosPorSitio
      ? resolveSiteShiftOptionsForProcess(sp.id_sitio, allTurnosPorSitio)
      : null;
    const activeProcs = (sp.procesos || []).filter((p) => !p.deleted_at);
    for (const psa of activeProcs) {
      totalPairs += 1;
      const hasValidShift = siteShifts
        ? (psa.turnos || []).some((t) => Boolean(matchAssignedShiftOption(t, siteShifts)))
        : (psa.turnos || []).some((t) => !t.deleted_at);
      if (hasValidShift) {
        coveredPairs += 1;
      }
    }
  }

  const pendingPairs = Math.max(0, totalPairs - coveredPairs);
  return {
    totalPairs,
    coveredPairs,
    pendingPairs,
    isComplete: totalPairs > 0 && pendingPairs === 0,
  };
}

// =============================================================================
// Step 3.3 — Organization Multi View & Picker Metadata (`5. Turno`)
// =============================================================================

export interface TurnoOrgCertMeta {
  normaCodigo: string;
  latestAuditCodename: string;
  latestAuditTooltip: string;
  latestDateSummary: string;
  sitesCount: number;
  selectedProcessesCount: number;
  coveredProcessesCount: number;
  pendingProcessesCount: number;
  totalAssignedShifts: number;
  statusKey: CertTurnoStatus;
}

export function createTurnoOrgCertMetaResolver(params: {
  audits: ReadonlyArray<ProgramacionAuditEntity>;
  allProcessesPorSitio: ReadonlyArray<ProcesoPorSitioLink>;
  allProcesses: ReadonlyArray<CandidateProcessEntity>;
  allTurnosPorSitio: ReadonlyArray<TurnoPorSitioLink>;
  certificados?: ReadonlyArray<CertificadoDetailEntity>;
}): OrgCertMetaResolver<TurnoOrgCertMeta> {
  const { audits, allProcessesPorSitio, allProcesses, allTurnosPorSitio, certificados } = params;
  const activeAudits = audits.filter((a) => !a.deleted_at);

  return (ctx) => {
    const latest = ctx.latestAudit;
    const normaCodigo = ctx.certificado.norma_codigo || 'ISO';
    if (!latest) {
      return {
        domainExtra: {
          normaCodigo,
          latestAuditCodename: 'Sin auditorías',
          latestAuditTooltip: 'Sin auditorías registradas',
          latestDateSummary: 'Sin fecha planificada',
          sitesCount: 0,
          selectedProcessesCount: 0,
          coveredProcessesCount: 0,
          pendingProcessesCount: 0,
          totalAssignedShifts: 0,
          statusKey: 'SIN_AUDITORIA',
        },
        domainCells: {
          auditoria: 'Sin auditorías',
          turnos: '0 / 0 cubiertos',
          estado: 'Sin auditorías',
        },
        searchText: `${normaCodigo} Sin auditorias`,
      };
    }

    const detail = buildAuditTurnoDetail({
      audit: latest,
      allAudits: activeAudits,
      allProcessesPorSitio,
      allProcesses,
      allTurnosPorSitio,
      certificados,
    });
    const totalAssignedShifts = detail.sites.reduce(
      (sum, s) => sum + s.rows.reduce((rSum, r) => rSum + r.assignedTpsIds.length, 0),
      0
    );
    const statusKey: CertTurnoStatus = detail.isComplete ? 'COMPLETO' : 'PENDIENTE';
    const planned =
      resolveLatestPlannedDate(latest.fechas) ??
      (latest.latestDate && !latest.latestDate.deleted_at && latest.latestDate.tipo_fecha !== 'REAL'
        ? latest.latestDate
        : null);
    const latestDateSummary = planned
      ? formatAuditDateLabel(planned)
      : latest.fecha_inicio
      ? latest.fecha_inicio.slice(0, 10).split('-').reverse().join('/')
      : 'Sin fecha planificada';
    const latestAuditCodename = formatAuditCodename(latest);
    const latestAuditTooltip = getAuditCodenameTooltip(latest);
    const siteNames = detail.sites.map((s) => s.sitePlan.nombre_sitio).join(' ');
    const statusLabel = statusKey === 'COMPLETO' ? 'Completo' : 'Pendiente';

    return {
      domainExtra: {
        normaCodigo,
        latestAuditCodename,
        latestAuditTooltip,
        latestDateSummary,
        sitesCount: detail.sites.length,
        selectedProcessesCount: detail.totalPairs,
        coveredProcessesCount: detail.coveredPairs,
        pendingProcessesCount: detail.pendingPairs,
        totalAssignedShifts,
        statusKey,
      },
      domainCells: {
        auditoria: `${latestAuditCodename} ${latestDateSummary}`,
        turnos: `${detail.coveredPairs}/${detail.totalPairs} cubiertos ${totalAssignedShifts} turnos`,
        estado: statusLabel,
      },
      searchText: [
        normaCodigo,
        latestAuditCodename,
        latest.codigo_auditoria,
        latest.tipo_auditoria,
        siteNames,
        statusLabel,
      ]
        .filter(Boolean)
        .join(' '),
    };
  };
}

export function buildTurnoOrgFacetCategories(
  rows: ReadonlyArray<OrgMultiViewRow<TurnoOrgCertMeta>>
): MultiViewFacetCategory<OrgMultiViewRow<TurnoOrgCertMeta>>[] {
  const uniqueStandards = Array.from(
    new Set(rows.flatMap((r) => r.normas).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, 'es'));

  const uniqueConglomerados = Array.from(
    new Set(rows.map((r) => r.conglomeradoShortName).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, 'es'));

  return [
    {
      id: 'estado_turno',
      label: 'Estado Turnos',
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
    ...(uniqueStandards.length > 0
      ? [
          {
            id: 'norma',
            label: 'Norma',
            options: uniqueStandards.map((norma) => ({ value: norma, label: norma })),
            extractValues: (r: OrgMultiViewRow<TurnoOrgCertMeta>) => r.normas,
          },
        ]
      : []),
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
    ...(uniqueConglomerados.length > 0
      ? [
          {
            id: 'conglomerado',
            label: 'Conglomerado / Tipo',
            options: uniqueConglomerados.map((c) => ({ value: c, label: c })),
            extractValues: (r: OrgMultiViewRow<TurnoOrgCertMeta>) => r.conglomeradoShortName,
          },
        ]
      : []),
  ];
}

