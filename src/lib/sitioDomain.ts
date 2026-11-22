/**
 * Phase 4.2.2: Sitio Domain Module (`sitio` + `turnos_por_sitio` + `sitios_por_auditoria`)
 * Compliant with ISO/IEC 17021-1:2015, IAF MD 1:2018 (Site 0 HQ governance), and Zero-UUID presentation.
 */

import type { ProgramacionAuditEntity } from './auditExecution';
import { containsRawUuid } from './breadcrumb';
import type {
  CertificadoDetailEntity,
  ProcesoPorSitioLink,
  ProcessEntity,
  SiteEntity,
} from './multisiteSampling';

export type { ProcesoPorSitioLink };
export type SitioEntity = SiteEntity;

export type SitioDetailMode = 'read' | 'add' | 'edit';

export interface SitioFormDraft {
  id_certificado: string;
  numero_sitio: string;
  nombre_sitio: string;
  direccion_sitio: string;
  personal_count?: string;
}

export interface TurnoCatalogItem {
  id: string;
  hora_entrada: string;
  hora_salida: string;
  descripcion: string;
}

export interface SitioTurnoAssignment {
  id: string;
  id_sitio: string;
  id_turno: string;
  hora_entrada: string;
  hora_salida: string;
  descripcion: string;
  durationHoursLabel: string;
}

export interface SitioAuditoriaLink {
  id: string;
  codigo_auditoria: string;
  fecha_programacion: string;
  tipo_auditoria: string;
  metodologia: string;
  estatus: string;
  modalidad_evaluacion?: string;
}

export interface SitioDetailEntity {
  id: string;
  id_certificado: string;
  numero_certificado: string;
  multisitio: boolean;
  certificado_estatus: string;
  norma_codigo: string;
  id_organizacion: string;
  organizacion_nombre: string;
  organizacion_rif: string;
  numero_sitio: number;
  nombre_sitio: string;
  direccion_sitio: string;
  tipo_sitio?: SiteEntity['tipo_sitio'];
  personal_count?: number;
  actividades?: string;
  deleted_at: string | null;
  turnos: SitioTurnoAssignment[];
  turnos_vinculados: string[];
  procesos: ProcesoPorSitioLink[];
  procesos_vinculados: string[];
  auditorias: SitioAuditoriaLink[];
  ownerCertId?: string;
  sharedFromCertId?: string | null;
  sharedFromCertLabel?: string | null;
  sharedTargets?: SiteEntity['sharedTargets'];
}

export interface ProcesoPorSitioValidationResult {
  valid: boolean;
  error?: string;
  site?: SitioEntity;
  proceso?: ProcessEntity;
}

export interface SitioSummaryMetrics {
  turnosCount: number;
  procesosCount: number;
  auditoriasCount: number;
  turnosLabels: string[];
  procesosLabels: string[];
}

export interface SitioInputValidationParams {
  numero_sitio: number | string;
  nombre_sitio: string;
  direccion_sitio: string;
  id_certificado: string;
  personal_count?: number | string;
  currentSitioId?: string;
  originalSitio?: {
    id_certificado: string;
    numero_sitio: number;
    associatedAuditsCount?: number;
  };
  existingSites?: ReadonlyArray<{
    id: string;
    id_certificado: string;
    numero_sitio: number;
    deleted_at?: string | null;
  }>;
}

export interface SitioInputValidationResult {
  valid: boolean;
  error?: string;
  normalized?: {
    id_certificado: string;
    numero_sitio: number;
    nombre_sitio: string;
    direccion_sitio: string;
    personal_count: number;
  };
}

export interface SitioArchiveGuardResult {
  allowed: boolean;
  reason?: string;
}

export interface SitioUnlinkGuardResult {
  allowed: boolean;
  reason?: string;
}

export const INITIAL_TURNO_CATALOG: TurnoCatalogItem[] = [
  {
    id: '70000000-0000-0000-0000-000000000001',
    hora_entrada: '07:00:00',
    hora_salida: '15:00:00',
    descripcion: 'Turno Matutino Operativo',
  },
  {
    id: '70000000-0000-0000-0000-000000000002',
    hora_entrada: '15:00:00',
    hora_salida: '23:00:00',
    descripcion: 'Turno Vespertino Operativo',
  },
  {
    id: '70000000-0000-0000-0000-000000000003',
    hora_entrada: '23:00:00',
    hora_salida: '07:00:00',
    descripcion: 'Turno Nocturno Continuo',
  },
  {
    id: '70000000-0000-0000-0000-000000000004',
    hora_entrada: '08:00:00',
    hora_salida: '17:00:00',
    descripcion: 'Turno Administrativo y Comercial',
  },
  {
    id: '70000000-0000-0000-0000-000000000005',
    hora_entrada: '06:00:00',
    hora_salida: '14:00:00',
    descripcion: 'Turno Temprano de Recepción y Despacho',
  },
  {
    id: '70000000-0000-0000-0000-000000000006',
    hora_entrada: '07:00:00',
    hora_salida: '19:00:00',
    descripcion: 'Turno Especial Guardia / Mantenimiento Extendido',
  },
];

/**
 * Formats a database TIME string (`HH:MM:SS`) as concise `HH:MM`.
 */
export function formatShiftTime(rawTime: string | null | undefined): string {
  if (!rawTime) return '—';
  const match = /^(\d{1,2}):(\d{2})/.exec(rawTime.trim());
  if (!match) return rawTime;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function parseMinutesSinceMidnight(rawTime: string | null | undefined): number | null {
  if (!rawTime) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(rawTime.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}

/**
 * Computes human-readable duration label for a shift, supporting overnight wraparound.
 */
export function computeShiftDurationLabel(
  horaEntrada: string | null | undefined,
  horaSalida: string | null | undefined
): string {
  const startMin = parseMinutesSinceMidnight(horaEntrada);
  const endMin = parseMinutesSinceMidnight(horaSalida);
  if (startMin === null || endMin === null) {
    return '—';
  }
  let diff = endMin - startMin;
  if (diff <= 0) {
    diff += 24 * 60;
  }
  const wholeHours = Math.floor(diff / 60);
  const remMinutes = diff % 60;
  if (remMinutes === 0) {
    return `${wholeHours} h`;
  }
  return `${wholeHours} h ${remMinutes} min`;
}

/**
 * Suggests the next `numero_sitio` for a certificate:
 * - Returns `0` if no active Sede Central (`numero_sitio === 0`) exists yet on the certificate.
 * - Otherwise returns `max(numero_sitio) + 1` among active sites.
 */
export function suggestNextNumeroSitio(
  sites: ReadonlyArray<{ numero_sitio: number; deleted_at?: string | null }>
): number {
  const active = sites.filter((s) => !s.deleted_at);
  if (active.length === 0) return 0;
  const hasCentral = active.some((s) => s.numero_sitio === 0);
  if (!hasCentral) return 0;
  const maxNum = active.reduce((acc, s) => (s.numero_sitio > acc ? s.numero_sitio : acc), 0);
  return maxNum + 1;
}

export function createEmptySitioFormDraft(
  prefillCertId?: string | null,
  existingSitesForCert?: ReadonlyArray<{ numero_sitio: number; deleted_at?: string | null }>
): SitioFormDraft {
  const cleanCertId = (prefillCertId || '').trim();
  const suggested =
    cleanCertId && existingSitesForCert
      ? suggestNextNumeroSitio(existingSitesForCert)
      : 0;
  return {
    id_certificado: cleanCertId,
    numero_sitio: String(suggested),
    nombre_sitio: '',
    direccion_sitio: '',
    personal_count: '10',
  };
}

export function createSitioFormDraftFromEntity(
  sitio: Pick<
    SitioDetailEntity,
    'id_certificado' | 'numero_sitio' | 'nombre_sitio' | 'direccion_sitio' | 'personal_count'
  >
): SitioFormDraft {
  return {
    id_certificado: sitio.id_certificado,
    numero_sitio: String(sitio.numero_sitio),
    nombre_sitio: sitio.nombre_sitio,
    direccion_sitio: sitio.direccion_sitio,
    personal_count: String(sitio.personal_count ?? 10),
  };
}

export function resolveSitioDetailMode(
  state: { isCreating?: boolean; isEditingAttributes?: boolean },
  isStaff: boolean,
  selectedSitio?: SitioDetailEntity | null
): SitioDetailMode {
  if (!isStaff) return 'read';
  if (state.isCreating) return 'add';
  if (selectedSitio && state.isEditingAttributes) return 'edit';
  return 'read';
}

/**
 * Validates `sitio` create/edit payloads:
 * - `id_certificado` must be selected
 * - `numero_sitio` must be an integer >= 0 (0 = Sede Principal HQ)
 * - `numero_sitio` must be unique within the same certificate among active sites
 * - Protects Sede Central (`numero_sitio === 0`) from degradation/reassignment while active branches or audits depend on it
 * - `nombre_sitio` (2..150 chars) and `direccion_sitio` (>= 5 chars) must be non-empty and free of raw UUIDs
 */
export function validateSitioInput(params: SitioInputValidationParams): SitioInputValidationResult {
  const idCertificado = (params.id_certificado || '').trim();
  if (!idCertificado) {
    return {
      valid: false,
      error: 'Debe seleccionar el certificado de conformidad al que pertenece el sitio.',
    };
  }

  const rawNum =
    typeof params.numero_sitio === 'string' ? params.numero_sitio.trim() : params.numero_sitio;
  const parsedNum = Number(rawNum);

  if (
    rawNum === '' ||
    rawNum === null ||
    rawNum === undefined ||
    Number.isNaN(parsedNum) ||
    !Number.isInteger(parsedNum) ||
    parsedNum < 0
  ) {
    return {
      valid: false,
      error: 'El número de sitio debe ser un entero mayor o igual a 0 (0 corresponde a Sede Principal HQ).',
    };
  }

  const nombreSitio = (params.nombre_sitio || '').trim();
  if (nombreSitio.length < 2) {
    return {
      valid: false,
      error: 'El nombre de la sede es obligatorio (mínimo 2 caracteres).',
    };
  }
  if (nombreSitio.length > 150) {
    return {
      valid: false,
      error: 'El nombre de la sede no puede superar los 150 caracteres.',
    };
  }
  if (containsRawUuid(nombreSitio)) {
    return {
      valid: false,
      error: 'El nombre de la sede no debe incluir identificadores UUID internos.',
    };
  }

  const direccionSitio = (params.direccion_sitio || '').trim();
  if (direccionSitio.length < 5) {
    return {
      valid: false,
      error: 'La dirección física del sitio es obligatoria (mínimo 5 caracteres).',
    };
  }
  if (containsRawUuid(direccionSitio)) {
    return {
      valid: false,
      error: 'La dirección física del sitio no debe incluir identificadores UUID internos.',
    };
  }

  if (params.originalSitio && params.originalSitio.numero_sitio === 0) {
    const activeSecondaryOnOriginal = (params.existingSites || []).filter(
      (s) =>
        !s.deleted_at &&
        s.id !== params.currentSitioId &&
        s.id_certificado === params.originalSitio!.id_certificado &&
        s.numero_sitio > 0
    ).length;
    const auditsOnOriginal = params.originalSitio.associatedAuditsCount ?? 0;

    if (
      params.originalSitio.id_certificado !== idCertificado &&
      (activeSecondaryOnOriginal > 0 || auditsOnOriginal > 0)
    ) {
      return {
        valid: false,
        error:
          'No se puede reasignar la Sede Principal (Sitio 0) a otro certificado mientras existan sucursales activas o auditorías vinculadas.',
      };
    }

    if (parsedNum !== 0 && (activeSecondaryOnOriginal > 0 || auditsOnOriginal > 0)) {
      return {
        valid: false,
        error:
          'No se puede degradar la Sede Principal (Sitio 0) mientras existan sucursales activas o auditorías vinculadas en el certificado.',
      };
    }
  }

  if (params.existingSites && params.existingSites.length > 0) {
    const duplicate = params.existingSites.some(
      (s) =>
        !s.deleted_at &&
        s.id !== params.currentSitioId &&
        s.id_certificado === idCertificado &&
        s.numero_sitio === parsedNum
    );
    if (duplicate) {
      return {
        valid: false,
        error: `Ya existe un sitio activo con el número ${parsedNum} dentro de este certificado.`,
      };
    }
  }

  let resolvedPersonalCount = 10;
  if (params.personal_count !== undefined) {
    const rawPersonal =
      typeof params.personal_count === 'string'
        ? params.personal_count.trim()
        : params.personal_count;
    const parsedPersonal = Number(rawPersonal);
    if (
      rawPersonal === '' ||
      rawPersonal === null ||
      Number.isNaN(parsedPersonal) ||
      !Number.isInteger(parsedPersonal) ||
      parsedPersonal < 1 ||
      parsedPersonal > 50000
    ) {
      return {
        valid: false,
        error: 'El personal asignado debe ser un número entero entre 1 y 50,000.',
      };
    }
    resolvedPersonalCount = parsedPersonal;
  }

  return {
    valid: true,
    normalized: {
      id_certificado: idCertificado,
      numero_sitio: parsedNum,
      nombre_sitio: nombreSitio,
      direccion_sitio: direccionSitio,
      personal_count: resolvedPersonalCount,
    },
  };
}

export function validateSitioFormDraft(params: {
  draft: SitioFormDraft;
  currentSitioId?: string;
  originalSitio?: SitioInputValidationParams['originalSitio'];
  existingSites?: SitioInputValidationParams['existingSites'];
}): SitioInputValidationResult {
  return validateSitioInput({
    id_certificado: params.draft.id_certificado,
    numero_sitio: params.draft.numero_sitio,
    nombre_sitio: params.draft.nombre_sitio,
    direccion_sitio: params.draft.direccion_sitio,
    personal_count: params.draft.personal_count,
    currentSitioId: params.currentSitioId,
    originalSitio: params.originalSitio,
    existingSites: params.existingSites,
  });
}

/**
 * Governance rule (`get_archive_dependency_summary` + IAF MD 1):
 * - Blocks archiving any site actively shared via `sitio_certificado_compartido`.
 * - Blocks archiving `Sitio 0` (Sede Principal HQ) while active secondary sites (`numero_sitio > 0`) exist.
 * - Blocks archiving any site (including `Sitio 0`) while associated audits (`sitios_por_auditoria`) exist.
 */
export function canArchiveSitio(params: {
  site: Pick<SitioDetailEntity, 'id' | 'id_certificado' | 'numero_sitio'> & {
    sharedTargets?: ReadonlyArray<unknown>;
  };
  siblingSites: ReadonlyArray<{
    id: string;
    id_certificado: string;
    numero_sitio: number;
    deleted_at?: string | null;
  }>;
  associatedAuditsCount: number;
  sharedTargetsCount?: number;
}): SitioArchiveGuardResult {
  const { site, siblingSites, associatedAuditsCount } = params;
  const activeSharedCount =
    params.sharedTargetsCount ??
    (Array.isArray(site.sharedTargets) ? site.sharedTargets.length : 0);

  if (activeSharedCount > 0) {
    return {
      allowed: false,
      reason: `No se puede archivar este sitio porque está compartido activamente con ${activeSharedCount} certificado(s) hermano(s) del conglomerado.`,
    };
  }

  if (site.numero_sitio === 0) {
    const activeSecondaryCount = siblingSites.filter(
      (s) =>
        s.id !== site.id &&
        s.id_certificado === site.id_certificado &&
        !s.deleted_at &&
        s.numero_sitio > 0
    ).length;

    if (activeSecondaryCount > 0) {
      return {
        allowed: false,
        reason: `No se puede archivar la Sede Principal (Sitio 0) mientras existan ${activeSecondaryCount} sede(s) secundaria(s) activa(s) en este certificado.`,
      };
    }
  }

  if (associatedAuditsCount > 0) {
    return {
      allowed: false,
      reason: `No se puede archivar este sitio porque está vinculado a ${associatedAuditsCount} auditoría(s) registrada(s).`,
    };
  }

  return { allowed: true };
}

/**
 * Prevents unlinking a shared site from a receiving certificate (`targetCertId`)
 * when active `sitios_por_auditoria` records reference that site in that certificate,
 * or when `targetCertId` is the owner certificate of the site.
 */
export function canUnlinkSitioFromCert(params: {
  site: Pick<
    SiteEntity,
    'id' | 'id_certificado' | 'nombre_sitio' | 'ownerCertId' | 'sharedFromCertId'
  >;
  targetCertId: string;
  programacionAudits?: ReadonlyArray<ProgramacionAuditEntity>;
  associatedAuditsInTargetCertCount?: number;
}): SitioUnlinkGuardResult {
  const { site, targetCertId, programacionAudits = [] } = params;
  const cleanCertId = (targetCertId || '').trim();
  if (!cleanCertId) {
    return {
      allowed: false,
      reason: 'El certificado seleccionado no posee un identificador válido para desvincular.',
    };
  }

  const ownerCertId = (site.ownerCertId || site.id_certificado || '').trim();
  if (ownerCertId && cleanCertId === ownerCertId && !site.sharedFromCertId) {
    return {
      allowed: false,
      reason: `No se puede desvincular "${site.nombre_sitio}" desde su certificado propietario. Utilice Archivar si ya no tiene dependencias activas.`,
    };
  }

  const activeAuditsInTarget =
    params.associatedAuditsInTargetCertCount ??
    programacionAudits.filter((audit) => {
      if (audit.deleted_at) return false;
      if (audit.id_certificado !== cleanCertId) return false;
      const inPlan = (audit.sitiosPlan || []).some(
        (sp) => !sp.deleted_at && sp.id_sitio === site.id
      );
      const inSampling = (audit.sitiosMuestreo || []).some(
        (sm) => sm.id_sitio === site.id
      );
      return inPlan || inSampling;
    }).length;

  if (activeAuditsInTarget > 0) {
    return {
      allowed: false,
      reason: `No se puede desvincular este sitio del certificado porque tiene ${activeAuditsInTarget} auditoría(s) activa(s) programada(s) sobre esta sede.`,
    };
  }

  return { allowed: true };
}

function procesoBelongsToCertContext(proc: ProcessEntity, certId: string): boolean {
  if (proc.id_certificado === certId) return true;
  if (proc.sharedFromCertId) return true;
  if (proc.sharedTargets?.some((st) => st.targetCertId === certId)) return true;
  if (proc.requisitos_by_certificado?.[certId]) return true;
  return false;
}

/**
 * Collects active process IDs already linked to a given site within `certId`.
 */
function collectLinkedProcesoIdsForSite(
  site: SitioEntity,
  certProcesos: ReadonlyArray<ProcessEntity>,
  archivedProcesoIds: ReadonlySet<string> | undefined,
  certId: string
): Set<string> {
  const linkedIds = new Set<string>();
  const certProcesoIds = new Set(
    certProcesos
      .filter((p) => !archivedProcesoIds?.has(p.id) && procesoBelongsToCertContext(p, certId))
      .map((p) => p.id)
  );
  const isSharedSite =
    Boolean(site.sharedFromCertId) ||
    Boolean(site.ownerCertId && site.ownerCertId !== certId) ||
    (site.sharedTargets?.length ?? 0) > 0;

  for (const link of site.procesos_por_sitio || []) {
    if (link.deleted_at) continue;
    if (archivedProcesoIds?.has(link.id_proceso)) continue;
    if (link.id_certificado && link.id_certificado !== certId) continue;
    if (!link.id_certificado && isSharedSite && !certProcesoIds.has(link.id_proceso)) {
      continue;
    }
    linkedIds.add(link.id_proceso);
  }

  for (const label of site.procesos_vinculados || []) {
    const clean = label.trim().toLowerCase();
    if (!clean) continue;
    const matched = certProcesos.find(
      (p) =>
        !archivedProcesoIds?.has(p.id) &&
        procesoBelongsToCertContext(p, certId) &&
        (p.id === label.trim() || p.nombre_proceso.trim().toLowerCase() === clean)
    );
    if (matched) {
      linkedIds.add(matched.id);
    }
  }

  return linkedIds;
}

/**
 * Returns active processes belonging to (or actively shared with) `cert.id`
 * that are not yet actively linked to `sitioId` in `cert.id`.
 */
export function getAvailableProcesosForSitio(
  sitioId: string,
  cert: CertificadoDetailEntity,
  archivedProcesoIds?: ReadonlySet<string>
): ProcessEntity[] {
  const cleanSitioId = (sitioId || '').trim();
  if (!cleanSitioId) return [];

  const targetSite = cert.sitios.find(
    (s) =>
      s.id === cleanSitioId &&
      (s.id_certificado === cert.id ||
        Boolean(s.sharedFromCertId) ||
        Boolean(s.sharedTargets?.some((st) => st.targetCertId === cert.id))) &&
      !(s as SitioEntity & { deleted_at?: string | null }).deleted_at
  );
  if (!targetSite) return [];

  const activeCertProcesos = cert.procesos.filter(
    (p) =>
      procesoBelongsToCertContext(p, cert.id) &&
      !archivedProcesoIds?.has(p.id) &&
      !(p as ProcessEntity & { deleted_at?: string | null }).deleted_at
  );

  const linkedIds = collectLinkedProcesoIdsForSite(
    targetSite,
    activeCertProcesos,
    archivedProcesoIds,
    cert.id
  );

  return activeCertProcesos
    .filter((p) => !linkedIds.has(p.id))
    .sort((a, b) => a.nombre_proceso.localeCompare(b.nombre_proceso, 'es'));
}

/**
 * Pure cross-certificate & duplicate-prevention validator for `procesos_por_sitio`.
 */
export function validateProcesoPorSitioAssignment(
  sitioId: string,
  procesoId: string,
  cert: CertificadoDetailEntity,
  options?: {
    archivedSiteIds?: ReadonlySet<string>;
    archivedProcesoIds?: ReadonlySet<string>;
  }
): ProcesoPorSitioValidationResult {
  const cleanSitioId = (sitioId || '').trim();
  const cleanProcesoId = (procesoId || '').trim();

  if (!cleanSitioId || !cleanProcesoId) {
    return {
      valid: false,
      error: 'Debe seleccionar una sede y un proceso válidos para vincular.',
    };
  }

  const targetSite = cert.sitios.find((s) => s.id === cleanSitioId);
  const siteBelongsToCert = Boolean(
    targetSite &&
      (targetSite.id_certificado === cert.id ||
        Boolean(targetSite.sharedFromCertId) ||
        Boolean(targetSite.sharedTargets?.some((st) => st.targetCertId === cert.id)))
  );
  if (
    !targetSite ||
    options?.archivedSiteIds?.has(targetSite.id) ||
    (targetSite as SitioEntity & { deleted_at?: string | null }).deleted_at ||
    !siteBelongsToCert
  ) {
    return {
      valid: false,
      error: 'La sede seleccionada no pertenece activamente a este certificado o está archivada.',
    };
  }

  const targetProceso = cert.procesos.find((p) => p.id === cleanProcesoId);
  if (
    !targetProceso ||
    options?.archivedProcesoIds?.has(targetProceso.id) ||
    (targetProceso as ProcessEntity & { deleted_at?: string | null }).deleted_at ||
    !procesoBelongsToCertContext(targetProceso, cert.id)
  ) {
    return {
      valid: false,
      error:
        'Validación cruzada rechazada: el proceso seleccionado no pertenece activamente al mismo certificado de la sede.',
    };
  }

  const linkedIds = collectLinkedProcesoIdsForSite(
    targetSite,
    cert.procesos,
    options?.archivedProcesoIds,
    cert.id
  );
  if (linkedIds.has(targetProceso.id)) {
    return {
      valid: false,
      error: `El proceso "${targetProceso.nombre_proceso}" ya se encuentra vinculado activamente a esta sede.`,
    };
  }

  return {
    valid: true,
    site: targetSite,
    proceso: targetProceso,
  };
}

/**
 * Computes consistent summary metrics for a Sitio Detail header/body,
 * including `procesos_vinculados` alongside `turnos_vinculados`.
 */
export function computeSitioSummaryMetrics(
  sitio: Pick<
    SitioDetailEntity,
    'turnos' | 'procesos' | 'auditorias' | 'turnos_vinculados' | 'procesos_vinculados'
  >
): SitioSummaryMetrics {
  const turnosLabels =
    sitio.turnos.length > 0
      ? sitio.turnos.map((t) => t.descripcion)
      : [...(sitio.turnos_vinculados || [])];
  const procesosLabels =
    sitio.procesos.length > 0
      ? sitio.procesos.map((p) => p.nombre_proceso)
      : [...(sitio.procesos_vinculados || [])];

  return {
    turnosCount: turnosLabels.length,
    procesosCount: procesosLabels.length,
    auditoriasCount: sitio.auditorias.length,
    turnosLabels,
    procesosLabels,
  };
}

/**
 * Resolves a complete `SitioDetailEntity` by ID from reactive certificates,
 * audit schedules, and shift catalog entries.
 * Supports `activeCertId` for sites shared across certificates so `turnos`, `procesos`,
 * and `auditorias` reflect the active certificate context exclusively.
 */
export function resolveSitioDetailById(params: {
  sitioId: string;
  activeCertId?: string | null;
  certificates: ReadonlyArray<CertificadoDetailEntity>;
  programacionAudits: ReadonlyArray<ProgramacionAuditEntity>;
  shiftCatalog?: ReadonlyArray<TurnoCatalogItem>;
  archivedSiteIds?: ReadonlySet<string>;
  archivedProcesoIds?: ReadonlySet<string>;
}): SitioDetailEntity | null {
  const {
    sitioId,
    activeCertId = null,
    certificates,
    programacionAudits,
    shiftCatalog = INITIAL_TURNO_CATALOG,
    archivedSiteIds,
    archivedProcesoIds,
  } = params;

  if (!sitioId || archivedSiteIds?.has(sitioId)) {
    return null;
  }

  const orderedCertificates = activeCertId
    ? [
        ...certificates.filter((c) => c.id === activeCertId),
        ...certificates.filter((c) => c.id !== activeCertId),
      ]
    : certificates;

  for (const cert of orderedCertificates) {
    const matchedSite = cert.sitios.find((s) => s.id === sitioId);
    if (!matchedSite) continue;

    const isSharedSiteContext =
      Boolean(matchedSite.sharedFromCertId) ||
      Boolean(matchedSite.ownerCertId && matchedSite.ownerCertId !== cert.id) ||
      (matchedSite.sharedTargets?.length ?? 0) > 0;

    // Resolve operational shift assignments for this site scoped to `cert.turnos`
    const assignments: SitioTurnoAssignment[] = [];
    const addedTurnoIds = new Set<string>();

    for (const tps of matchedSite.turnos_por_sitio || []) {
      if (tps.deleted_at || addedTurnoIds.has(tps.id_turno)) continue;
      const certShift = cert.turnos.find((t) => t.id === tps.id_turno);
      if (isSharedSiteContext && !certShift) continue;
      addedTurnoIds.add(tps.id_turno);
      assignments.push({
        id: tps.id || `${matchedSite.id}::${tps.id_turno}`,
        id_sitio: matchedSite.id,
        id_turno: tps.id_turno,
        hora_entrada: certShift?.hora_entrada ?? tps.hora_entrada,
        hora_salida: certShift?.hora_salida ?? tps.hora_salida,
        descripcion: certShift?.descripcion ?? tps.descripcion,
        durationHoursLabel: computeShiftDurationLabel(
          certShift?.hora_entrada ?? tps.hora_entrada,
          certShift?.hora_salida ?? tps.hora_salida
        ),
      });
    }

    const linkedLabels = matchedSite.turnos_vinculados || [];
    for (const label of linkedLabels) {
      const cleanLabel = label.trim().toLowerCase();
      const fromCertShift = cert.turnos.find(
        (t) =>
          t.descripcion.trim().toLowerCase() === cleanLabel ||
          t.id === label
      );
      const fromCatalog = isSharedSiteContext
        ? undefined
        : shiftCatalog.find(
            (t) =>
              t.descripcion.trim().toLowerCase() === cleanLabel ||
              t.id === label
          );
      const resolved = fromCertShift || fromCatalog;
      if (resolved && !addedTurnoIds.has(resolved.id)) {
        addedTurnoIds.add(resolved.id);
        assignments.push({
          id: `${matchedSite.id}::${resolved.id}`,
          id_sitio: matchedSite.id,
          id_turno: resolved.id,
          hora_entrada: resolved.hora_entrada,
          hora_salida: resolved.hora_salida,
          descripcion: resolved.descripcion,
          durationHoursLabel: computeShiftDurationLabel(
            resolved.hora_entrada,
            resolved.hora_salida
          ),
        });
      }
    }

    // Fallback: also include certificate shifts mentioning site name
    for (const certShift of cert.turnos) {
      if (addedTurnoIds.has(certShift.id)) continue;
      const matchesSiteName = (certShift.sitios_vinculados || []).some(
        (name) => name.trim().toLowerCase() === matchedSite.nombre_sitio.trim().toLowerCase()
      );
      if (matchesSiteName) {
        addedTurnoIds.add(certShift.id);
        assignments.push({
          id: `${matchedSite.id}::${certShift.id}`,
          id_sitio: matchedSite.id,
          id_turno: certShift.id,
          hora_entrada: certShift.hora_entrada,
          hora_salida: certShift.hora_salida,
          descripcion: certShift.descripcion,
          durationHoursLabel: computeShiftDurationLabel(
            certShift.hora_entrada,
            certShift.hora_salida
          ),
        });
      }
    }

    // Resolve audits linked to this site from Programación and Certificate fallback
    const audits: SitioAuditoriaLink[] = [];
    const seenAuditIds = new Set<string>();

    for (const audit of programacionAudits) {
      if (audit.id_certificado !== cert.id) continue;
      const siteSampling = audit.sitiosMuestreo.find(
        (sm) =>
          sm.id_sitio === matchedSite.id ||
          sm.numero_sitio === matchedSite.numero_sitio
      );
      if (siteSampling) {
        seenAuditIds.add(audit.id);
        audits.push({
          id: audit.id,
          codigo_auditoria: audit.codigo_auditoria,
          fecha_programacion: siteSampling.fecha_asignada || audit.fecha_inicio,
          tipo_auditoria: audit.tipo_auditoria,
          metodologia: audit.metodologia,
          estatus: audit.estatus,
          modalidad_evaluacion: siteSampling.modalidad_evaluacion,
        });
      }
    }

    for (const certAudit of cert.auditorias) {
      if (seenAuditIds.has(certAudit.id)) continue;
      const includedByName =
        !certAudit.sitios_alcance ||
        certAudit.sitios_alcance.length === 0 ||
        certAudit.sitios_alcance.some(
          (name) => name.trim().toLowerCase() === matchedSite.nombre_sitio.trim().toLowerCase()
        );
      if (includedByName) {
        seenAuditIds.add(certAudit.id);
        audits.push({
          id: certAudit.id,
          codigo_auditoria: certAudit.codigo_auditoria,
          fecha_programacion: certAudit.fecha_programacion,
          tipo_auditoria: certAudit.tipo_auditoria,
          metodologia: certAudit.metodologia,
          estatus: certAudit.estatus,
        });
      }
    }

    // Resolve operational processes linked to this site scoped strictly to `cert.id`
    const procesos: ProcesoPorSitioLink[] = [];
    const addedProcesoIds = new Set<string>();

    for (const link of matchedSite.procesos_por_sitio || []) {
      if (link.deleted_at || archivedProcesoIds?.has(link.id_proceso)) continue;
      if (link.id_certificado && link.id_certificado !== cert.id) continue;
      const procMeta = cert.procesos.find(
        (p) =>
          p.id === link.id_proceso &&
          !archivedProcesoIds?.has(p.id) &&
          procesoBelongsToCertContext(p, cert.id)
      );
      if (!link.id_certificado && isSharedSiteContext && !procMeta) {
        continue;
      }
      if (addedProcesoIds.has(link.id_proceso)) continue;
      addedProcesoIds.add(link.id_proceso);

      const scopedEntry = procMeta?.requisitos_by_certificado?.[cert.id];
      procesos.push({
        id: link.id,
        id_certificado: link.id_certificado ?? cert.id,
        id_sitio: matchedSite.id,
        id_proceso: link.id_proceso,
        nombre_proceso: procMeta?.nombre_proceso ?? link.nombre_proceso,
        tipo_proceso: procMeta?.tipo ?? link.tipo_proceso,
        clausulas_cubiertas:
          scopedEntry?.clausulas_cubiertas ??
          procMeta?.clausulas_cubiertas ??
          link.clausulas_cubiertas ??
          [],
        requisitos_detalle:
          scopedEntry?.requisitos_detalle ??
          procMeta?.requisitos_detalle ??
          link.requisitos_detalle,
        deleted_at: null,
      });
    }

    for (const label of matchedSite.procesos_vinculados || []) {
      const cleanLabel = label.trim().toLowerCase();
      if (!cleanLabel) continue;
      const matchedProc = cert.procesos.find(
        (p) =>
          !archivedProcesoIds?.has(p.id) &&
          procesoBelongsToCertContext(p, cert.id) &&
          (p.id === label.trim() || p.nombre_proceso.trim().toLowerCase() === cleanLabel)
      );
      if (matchedProc && !addedProcesoIds.has(matchedProc.id)) {
        addedProcesoIds.add(matchedProc.id);
        const scopedEntry = matchedProc.requisitos_by_certificado?.[cert.id];
        procesos.push({
          id: `${matchedSite.id}::${matchedProc.id}`,
          id_certificado: cert.id,
          id_sitio: matchedSite.id,
          id_proceso: matchedProc.id,
          nombre_proceso: matchedProc.nombre_proceso,
          tipo_proceso: matchedProc.tipo,
          clausulas_cubiertas:
            scopedEntry?.clausulas_cubiertas ?? matchedProc.clausulas_cubiertas,
          requisitos_detalle:
            scopedEntry?.requisitos_detalle ?? matchedProc.requisitos_detalle,
          deleted_at: null,
        });
      }
    }

    return {
      id: matchedSite.id,
      id_certificado: cert.id,
      numero_certificado: cert.numero_certificado,
      multisitio: cert.multisitio,
      certificado_estatus: cert.estatus,
      norma_codigo: cert.norma_codigo,
      id_organizacion: cert.id_organizacion,
      organizacion_nombre: cert.organizacion_nombre,
      organizacion_rif: cert.organizacion_rif,
      numero_sitio: matchedSite.numero_sitio,
      nombre_sitio: matchedSite.nombre_sitio,
      direccion_sitio: matchedSite.direccion_sitio,
      tipo_sitio: matchedSite.tipo_sitio,
      personal_count: matchedSite.personal_count,
      actividades: matchedSite.actividades,
      deleted_at: null,
      turnos: assignments,
      turnos_vinculados: assignments.map((a) => a.descripcion),
      procesos,
      procesos_vinculados: procesos.map((p) => p.nombre_proceso),
      auditorias: audits,
      ownerCertId: matchedSite.ownerCertId ?? matchedSite.id_certificado,
      sharedFromCertId: matchedSite.sharedFromCertId ?? null,
      sharedFromCertLabel: matchedSite.sharedFromCertLabel ?? null,
      sharedTargets: matchedSite.sharedTargets,
    };
  }

  return null;
}
