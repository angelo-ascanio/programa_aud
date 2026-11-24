/**
 * Step 2.2.2 — Contratos, Validadores y Constructores Puros de Persistencia Transaccional
 * para el Dominio `Sitio` (`procesos_por_sitio`) y Bloque 1 `Auditoría`:
 * - Paso 1 (`programa_auditoria` + `auditoria` + `auditoria_fecha` inicial)
 * - Gestor Multi-Fecha 1:N (`auditoria_fecha` + `syncDateRevisionToProgram`)
 * - Paso 2 Granular (`sitios_por_auditoria`, `procesos_sitio_auditoria`, `turnos_sitio_auditoria`,
 *   `turnos_proceso_sitio_auditoria`, `equipo_auditor_sitio`, `equipo_auditor_proceso_sitio`, `equipo_auditor`)
 * - Configuración de Alertas (`configuracion_alerta_auditoria`)
 *
 * Strictly typed (`strict: true`, `0 any`) and Zero-UUID compliant in all user-facing messages.
 */

import { isApprovedStaffProfile } from './accessControl';
import type { ArchiveDependencySummary } from './archiveGovernance';
import type {
  AlertConfigEntity,
  AuditCodeCandidate,
  AuditCycleStatus,
  AuditDateEntry,
  AuditDateEntryInput,
  AuditDatePrecision,
  AuditDateTag,
  AuditLinkLevel,
  AuditLinkNature,
  AuditorProcessRole,
  AuditorSiteRole,
  ProgramCodeCandidate,
  ProgramLinkingCertificateRef,
  SiteEvaluationModality,
} from './auditPlanningEngine';
import {
  AUDIT_LINK_NATURES,
  DEFAULT_AUDIT_ALERT_CONFIG,
  generateNextUniqueAuditCode,
  generateNextUniqueProgramCode,
  getNextAuditDateSequence,
  roundAuditDaysQuarter,
  sanitizeAuditCodeSegment,
  validateAuditDateEntryInput,
  validateProgramLinkingRules,
} from './auditPlanningEngine';
import {
  validateVinculoCertificatesHaveAlcance,
  type VinculoCertAlcanceCandidate,
} from './alcanceDomain';
import { translateDatabaseError, type UserProfile } from './healthCheck';
import type { CertificadoDetailEntity } from './multisiteSampling';
import type { VinculoEntity } from './vinculoDomain';
import { assertValidUuid, containsRawUuid, isValidUuid } from './zeroUuid';

const UUID_GLOBAL_REGEX =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

// ---------------------------------------------------------------------------
// Shared Result & Sanitization Helpers
// ---------------------------------------------------------------------------

export interface PersistenceMutationResult<T = undefined> {
  ok: boolean;
  data?: T;
  error?: string;
  warning?: string;
  restored?: boolean;
  localFallback?: boolean;
  dependencySummary?: ArchiveDependencySummary;
}

export function stripRawUuidsFromText(text: string): string {
  return text.replace(UUID_GLOBAL_REGEX, 'Referencia registrada').replace(/\s+/g, ' ').trim();
}

export function formatZeroUuidError(err: unknown, fallback = 'No se pudo completar la operación.'): string {
  const translated = translateDatabaseError(err);
  if (err instanceof Error && err.message.trim()) {
    const rawMsg = err.message.trim();
    const msgToClean = translated && translated !== rawMsg ? translated : rawMsg;
    return stripRawUuidsFromText(msgToClean);
  }
  const cleaned = stripRawUuidsFromText(translated || fallback);
  return cleaned || fallback;
}

export function assertApprovedStaffForMutation(
  profile: UserProfile | null | undefined
): { ok: true } | { ok: false; error: string } {
  if (!isApprovedStaffProfile(profile)) {
    return {
      ok: false,
      error: 'Acceso denegado: solo personal aprobado (ADMIN o WORKER) puede modificar la programación.',
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 1. Paso 1: `programa_auditoria` + `auditoria`
// ---------------------------------------------------------------------------

export function normalizeAuditLinkNature(raw: unknown): AuditLinkNature {
  const val = String(raw ?? '').trim();
  if (val === 'Multisitio' || val === 'Mixta') return 'Mixta';
  if (
    val === 'Individual' ||
    val === 'Combinada' ||
    val === 'Integrada' ||
    val === 'Conjunta' ||
    val === 'Simultánea' ||
    val === 'Multientidad'
  ) {
    return val;
  }
  return 'Individual';
}

export interface Step1CertificateAssignmentInput {
  id_certificado: string;
  id_tipo_auditoria?: string | null;
  id_metodologia?: string | null;
  codigo_auditoria?: string | null;
  estado_ciclo?: AuditCycleStatus;
  tiene_sitio_temporal?: boolean;
  objetivo?: string | null;
}

export interface SaveProgramaAuditoriaStep1Input {
  programId?: string | null;
  id_vinculo?: string | null;
  id_grupo_empresarial?: string | null;
  etiqueta: string;
  codigo_programa?: string | null;
  nivel_vinculacion: AuditLinkLevel;
  tipo_vinculacion: AuditLinkNature;
  tiene_sitio_temporal?: boolean;
  id_ciclo_origen?: string | null;
  notas?: string | null;
  certificates: ReadonlyArray<Step1CertificateAssignmentInput>;
  initialDate?: AuditDateEntryInput | null;
  isClosing?: boolean;
}

export interface ValidatedStep1CertificateRow {
  id_certificado: string;
  id_tipo_auditoria: string | null;
  id_metodologia: string | null;
  codigo_auditoria: string | null;
  estado_ciclo: AuditCycleStatus;
  tiene_sitio_temporal: boolean;
  objetivo: string | null;
}

export interface ValidatedStep1ProgramBundle {
  programId: string | null;
  programaPayload: {
    id_vinculo: string | null;
    id_grupo_empresarial: string | null;
    etiqueta: string;
    codigo_programa: string | null;
    nivel_vinculacion: AuditLinkLevel;
    tipo_vinculacion: AuditLinkNature;
    es_vinculada: boolean;
    tiene_sitio_temporal: boolean;
    id_ciclo_origen: string | null;
    notas: string | null;
  };
  certificateRows: ValidatedStep1CertificateRow[];
  initialDatePayload: {
    numero_secuencia: number;
    tag: AuditDateTag;
    tipo_fecha: AuditDatePrecision;
    anio: number | null;
    mes: number | null;
    fecha_inicio: string | null;
    fecha_fin: string | null;
    observacion: string | null;
  } | null;
  warnings: string[];
}

export const VALID_AUDIT_CYCLE_STATUSES: ReadonlySet<AuditCycleStatus> = new Set([
  'Borrador',
  'En Programación',
  'Programada',
  'En Ejecución',
  'Auditada',
  'Cerrada',
  'Reprogramada',
  'Cancelada',
]);

export function validateAndBuildStep1ProgramBundle(
  input: SaveProgramaAuditoriaStep1Input,
  certificatesCatalog: ReadonlyArray<
    Pick<CertificadoDetailEntity, 'id' | 'id_organizacion' | 'numero_certificado' | 'organizacion_nombre'>
  >
): { ok: true; value: ValidatedStep1ProgramBundle } | { ok: false; error: string } {
  let validProgramId: string | null = null;
  if (input.programId !== undefined && input.programId !== null && input.programId.trim() !== '') {
    validProgramId = assertValidUuid(input.programId, 'programa de auditoría');
  }

  let validVinculoId: string | null = null;
  if (input.id_vinculo !== undefined && input.id_vinculo !== null && input.id_vinculo.trim() !== '') {
    validVinculoId = assertValidUuid(input.id_vinculo, 'vínculo de auditoría');
  }

  let validGrupoId: string | null = null;
  if (
    input.id_grupo_empresarial !== undefined &&
    input.id_grupo_empresarial !== null &&
    input.id_grupo_empresarial.trim() !== ''
  ) {
    validGrupoId = assertValidUuid(input.id_grupo_empresarial, 'conglomerado');
  }

  const normalizedTipoVinculacion = normalizeAuditLinkNature(input.tipo_vinculacion);
  const programTieneSitioTemporal = Boolean(input.tiene_sitio_temporal);

  let validOrigenId: string | null = null;
  if (
    input.id_ciclo_origen !== undefined &&
    input.id_ciclo_origen !== null &&
    input.id_ciclo_origen.trim() !== ''
  ) {
    validOrigenId = assertValidUuid(input.id_ciclo_origen, 'ciclo de origen');
    if (validProgramId && validOrigenId === validProgramId) {
      return {
        ok: false,
        error: 'El ciclo de origen no puede referenciar al mismo programa de auditoría.',
      };
    }
  }

  const etiqueta = (input.etiqueta || '').trim();
  if (etiqueta.length < 2 || etiqueta.length > 180) {
    return {
      ok: false,
      error: 'La etiqueta del programa es obligatoria (entre 2 y 180 caracteres).',
    };
  }
  if (containsRawUuid(etiqueta)) {
    return {
      ok: false,
      error: 'La etiqueta del programa no debe contener identificadores UUID internos.',
    };
  }

  const codigoProgramaRaw = (input.codigo_programa || '').trim();
  if (codigoProgramaRaw.length > 40) {
    return {
      ok: false,
      error: 'El código del programa no puede exceder los 40 caracteres.',
    };
  }
  if (codigoProgramaRaw && containsRawUuid(codigoProgramaRaw)) {
    return {
      ok: false,
      error: 'El código del programa no debe contener identificadores UUID internos.',
    };
  }

  const notasRaw = (input.notas || '').trim();
  if (notasRaw && containsRawUuid(notasRaw)) {
    return {
      ok: false,
      error: 'Las notas del programa no deben contener identificadores UUID internos.',
    };
  }

  const certById = new Map(certificatesCatalog.map((c) => [c.id, c]));
  const linkingRefs: ProgramLinkingCertificateRef[] = [];
  const certificateRows: ValidatedStep1CertificateRow[] = [];

  for (const item of input.certificates) {
    const validCertId = assertValidUuid(item.id_certificado, 'certificado');
    const catalogCert = certById.get(validCertId);
    if (!catalogCert) {
      return {
        ok: false,
        error: 'Uno de los certificados seleccionados no existe o se encuentra archivado.',
      };
    }

    const validTipoId =
      item.id_tipo_auditoria && item.id_tipo_auditoria.trim() !== ''
        ? assertValidUuid(item.id_tipo_auditoria, 'tipo de auditoría')
        : null;
    const validMetId =
      item.id_metodologia && item.id_metodologia.trim() !== ''
        ? assertValidUuid(item.id_metodologia, 'metodología de auditoría')
        : null;

    const codigoAudRaw = (item.codigo_auditoria || '').trim();
    if (codigoAudRaw.length > 40) {
      return {
        ok: false,
        error: 'El código de auditoría no puede superar los 40 caracteres.',
      };
    }
    if (codigoAudRaw && containsRawUuid(codigoAudRaw)) {
      return {
        ok: false,
        error: 'El código de auditoría no debe contener identificadores UUID internos.',
      };
    }

    const objetivoRaw = (item.objetivo || '').trim();
    if (objetivoRaw && containsRawUuid(objetivoRaw)) {
      return {
        ok: false,
        error: 'El objetivo de auditoría no debe contener identificadores UUID internos.',
      };
    }

    const estadoCiclo: AuditCycleStatus = item.estado_ciclo ?? 'Borrador';
    if (!VALID_AUDIT_CYCLE_STATUSES.has(estadoCiclo)) {
      return {
        ok: false,
        error: 'El estado de ciclo seleccionado no es válido.',
      };
    }

    linkingRefs.push({
      id: catalogCert.id,
      id_organizacion: catalogCert.id_organizacion,
      numero_certificado: catalogCert.numero_certificado,
      organizacion_nombre: catalogCert.organizacion_nombre,
      deleted_at: null,
    });

    certificateRows.push({
      id_certificado: validCertId,
      id_tipo_auditoria: validTipoId,
      id_metodologia: validMetId,
      codigo_auditoria: codigoAudRaw || null,
      estado_ciclo: estadoCiclo,
      tiene_sitio_temporal: item.tiene_sitio_temporal ?? programTieneSitioTemporal,
      objetivo: objetivoRaw || null,
    });
  }

  const linkingResult = validateProgramLinkingRules(
    input.nivel_vinculacion,
    normalizedTipoVinculacion,
    linkingRefs,
    { isClosing: input.isClosing }
  );
  if (!linkingResult.valid) {
    return {
      ok: false,
      error: linkingResult.error || 'Las reglas de vinculación del programa no son válidas.',
    };
  }

  let initialDatePayload: ValidatedStep1ProgramBundle['initialDatePayload'] = null;
  if (input.initialDate) {
    const builtDate = buildAuditDateInsertPayload(
      '00000000-0000-0000-0000-000000000001',
      [],
      input.initialDate
    );
    if (!builtDate.ok) {
      return { ok: false, error: builtDate.error };
    }
    initialDatePayload = {
      numero_secuencia: 1,
      tag: 'Programación',
      tipo_fecha: builtDate.value.tipo_fecha,
      anio: builtDate.value.anio,
      mes: builtDate.value.mes,
      fecha_inicio: builtDate.value.fecha_inicio,
      fecha_fin: builtDate.value.fecha_fin,
      observacion: builtDate.value.observacion,
    };
  }

  return {
    ok: true,
    value: {
      programId: validProgramId,
      programaPayload: {
        id_vinculo: validVinculoId,
        id_grupo_empresarial: validGrupoId,
        etiqueta,
        codigo_programa: codigoProgramaRaw || null,
        nivel_vinculacion: input.nivel_vinculacion,
        tipo_vinculacion: normalizedTipoVinculacion,
        es_vinculada: linkingResult.es_vinculada,
        tiene_sitio_temporal: programTieneSitioTemporal,
        id_ciclo_origen: validOrigenId,
        notas: notasRaw || null,
      },
      certificateRows,
      initialDatePayload,
      warnings: linkingResult.warnings,
    },
  };
}

export interface ExistingProgramAuditRef {
  id: string;
  id_certificado: string;
  codigo_auditoria?: string | null;
  deleted_at?: string | null;
}

export interface ProgramAuditDiffResult {
  toInsert: ValidatedStep1CertificateRow[];
  toUpdate: Array<{ auditId: string; row: ValidatedStep1CertificateRow }>;
  toArchive: ExistingProgramAuditRef[];
}

export function diffProgramAuditCertificates(
  existingAudits: ReadonlyArray<ExistingProgramAuditRef>,
  desiredRows: ReadonlyArray<ValidatedStep1CertificateRow>
): ProgramAuditDiffResult {
  const activeExisting = existingAudits.filter((a) => !a.deleted_at);
  const existingByCertId = new Map(activeExisting.map((a) => [a.id_certificado, a]));
  const desiredCertIds = new Set(desiredRows.map((r) => r.id_certificado));

  const toInsert: ValidatedStep1CertificateRow[] = [];
  const toUpdate: Array<{ auditId: string; row: ValidatedStep1CertificateRow }> = [];

  for (const row of desiredRows) {
    const existing = existingByCertId.get(row.id_certificado);
    if (existing) {
      toUpdate.push({ auditId: existing.id, row });
    } else {
      toInsert.push(row);
    }
  }

  const toArchive = activeExisting.filter((a) => !desiredCertIds.has(a.id_certificado));

  return { toInsert, toUpdate, toArchive };
}

const LEVEL_BREADTH_RANK: Record<AuditLinkLevel, number> = {
  INDIVIDUAL: 1,
  NIVEL_1_INTRA_ORG: 2,
  NIVEL_2_INTER_ORG: 3,
};

export function shouldArchiveBeforeProgramLevelUpdate(
  existingLevel: AuditLinkLevel | null | undefined,
  nextLevel: AuditLinkLevel
): boolean {
  if (!existingLevel) return false;
  return LEVEL_BREADTH_RANK[nextLevel] < LEVEL_BREADTH_RANK[existingLevel];
}

// ---------------------------------------------------------------------------
// 2. Gestor Multi-Fecha 1:N (`auditoria_fecha`)
// ---------------------------------------------------------------------------

export type AuditDateRevisionPayload =
  | {
      action?: 'create';
      tipo_fecha: AuditDatePrecision;
      anio?: number | null;
      mes?: number | null;
      fecha_inicio?: string | null;
      fecha_fin?: string | null;
      observacion?: string | null;
    }
  | {
      action: 'update-observation';
      dateId: string;
      observacion: string | null;
    }
  | {
      action: 'archive';
      dateId: string;
      reason?: string | null;
    };

export interface BuiltAuditDateInsertPayload {
  id_auditoria: string;
  numero_secuencia: number;
  tag: AuditDateTag;
  tipo_fecha: AuditDatePrecision;
  anio: number | null;
  mes: number | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  observacion: string | null;
}

export function buildAuditDateInsertPayload(
  auditId: string,
  existingFechas: ReadonlyArray<AuditDateEntry>,
  input: AuditDateEntryInput,
  options: { allowReal?: boolean } = {}
): { ok: true; value: BuiltAuditDateInsertPayload } | { ok: false; error: string } {
  const validAuditId = assertValidUuid(auditId, 'auditoría');
  const nextSeq = getNextAuditDateSequence(existingFechas);
  const tag: AuditDateTag = nextSeq === 1 ? 'Programación' : 'Reprogramación';
  const isExactRange = input.tipo_fecha === 'PROGRAMADA_EXACTA' || input.tipo_fecha === 'REAL';

  const normalizedInput: AuditDateEntryInput = {
    tag,
    numero_secuencia: nextSeq,
    tipo_fecha: input.tipo_fecha,
    anio: input.tipo_fecha === 'PREPROGRAMADA_MES' ? (input.anio ?? null) : null,
    mes: input.tipo_fecha === 'PREPROGRAMADA_MES' ? (input.mes ?? null) : null,
    fecha_inicio: isExactRange ? (input.fecha_inicio?.trim() || null) : null,
    fecha_fin: isExactRange ? (input.fecha_fin?.trim() || null) : null,
    observacion: input.observacion ?? null,
  };

  const validation = validateAuditDateEntryInput(normalizedInput, options);
  if (!validation.valid) {
    return {
      ok: false,
      error: validation.error || 'La fecha de auditoría ingresada no es válida.',
    };
  }

  const obs = (input.observacion || '').trim();
  if (obs && containsRawUuid(obs)) {
    return {
      ok: false,
      error: 'La observación de la fecha no debe contener identificadores UUID internos.',
    };
  }

  return {
    ok: true,
    value: {
      id_auditoria: validAuditId,
      numero_secuencia: nextSeq,
      tag,
      tipo_fecha: input.tipo_fecha,
      anio: normalizedInput.anio ?? null,
      mes: normalizedInput.mes ?? null,
      fecha_inicio: normalizedInput.fecha_inicio ?? null,
      fecha_fin: normalizedInput.fecha_fin ?? null,
      observacion: obs || null,
    },
  };
}

export function validateAuditDateObservationUpdate(
  dateId: string,
  observacion: string | null | undefined
): { ok: true; dateId: string; observacion: string | null } | { ok: false; error: string } {
  const validDateId = assertValidUuid(dateId, 'fecha de auditoría');
  const trimmed = (observacion || '').trim();
  if (trimmed && containsRawUuid(trimmed)) {
    return {
      ok: false,
      error: 'La observación de la fecha no debe contener identificadores UUID internos.',
    };
  }
  return {
    ok: true,
    dateId: validDateId,
    observacion: trimmed || null,
  };
}

// ---------------------------------------------------------------------------
// 3. Paso 2 Granular (`sitios_por_auditoria`, procesos, turnos, auditores)
// ---------------------------------------------------------------------------

export interface UpsertSitioAuditoriaOptions {
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  notas_sitio?: string | null;
}

export interface BuiltSitioAuditoriaPayload {
  id_auditoria: string;
  id_sitio: string;
  tiempo_auditoria: number;
  modalidad_evaluacion: SiteEvaluationModality | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  notas_sitio: string | null;
}

const VALID_SITE_MODALITIES: ReadonlySet<SiteEvaluationModality> = new Set([
  'Presencial',
  'Remota',
  'Mixta',
]);

export function validateAndBuildSitioAuditoriaPayload(
  auditId: string,
  sitioId: string,
  tiempoDias: number,
  modalidad?: SiteEvaluationModality | null,
  options: UpsertSitioAuditoriaOptions = {}
): { ok: true; value: BuiltSitioAuditoriaPayload } | { ok: false; error: string } {
  const validAuditId = assertValidUuid(auditId, 'auditoría');
  const validSitioId = assertValidUuid(sitioId, 'sitio');

  if (!Number.isFinite(tiempoDias) || tiempoDias < 0) {
    return {
      ok: false,
      error: 'El tiempo de auditoría en sitio debe ser un número mayor o igual a 0.',
    };
  }
  const roundedDays = roundAuditDaysQuarter(tiempoDias);

  if (modalidad !== undefined && modalidad !== null && !VALID_SITE_MODALITIES.has(modalidad)) {
    return {
      ok: false,
      error: 'La modalidad de evaluación en sitio debe ser Presencial, Remota o Mixta.',
    };
  }

  const fechaInicio = options.fecha_inicio ? options.fecha_inicio.trim() : null;
  const fechaFin = options.fecha_fin ? options.fecha_fin.trim() : null;
  if (fechaInicio && fechaFin && fechaFin < fechaInicio) {
    return {
      ok: false,
      error: 'La fecha de fin asignada al sitio debe ser igual o posterior a su fecha de inicio.',
    };
  }

  const notas = (options.notas_sitio || '').trim();
  if (notas && containsRawUuid(notas)) {
    return {
      ok: false,
      error: 'Las notas del sitio no deben contener identificadores UUID internos.',
    };
  }

  return {
    ok: true,
    value: {
      id_auditoria: validAuditId,
      id_sitio: validSitioId,
      tiempo_auditoria: roundedDays,
      modalidad_evaluacion: modalidad ?? null,
      fecha_inicio: fechaInicio || null,
      fecha_fin: fechaFin || null,
      notas_sitio: notas || null,
    },
  };
}

export interface UpsertEquipoAuditorSitioInput {
  auditId?: string | null;
  sitioAuditoriaId: string;
  auditorId: string;
  rol_auditor: AuditorSiteRole;
  tiempo_auditoria: number;
  asignacion_completa_sitio: boolean;
}

const VALID_AUDITOR_SITE_ROLES: ReadonlySet<AuditorSiteRole> = new Set([
  'AUDITOR_LIDER',
  'AUDITOR',
  'AUDITOR_EN_ENTRENAMIENTO',
  'EXPERTO_TECNICO',
]);

const VALID_AUDITOR_PROCESS_ROLES: ReadonlySet<AuditorProcessRole> = new Set([
  'LIDER_PROCESO',
  'EVALUADOR',
  'APOYO_TECNICO',
  'OBSERVADOR',
]);

export function validateAndBuildEquipoAuditorSitioPayload(input: UpsertEquipoAuditorSitioInput):
  | {
      ok: true;
      value: {
        auditId: string | null;
        id_sitios_por_auditoria: string;
        id_auditor: string;
        rol_auditor: AuditorSiteRole;
        tiempo_auditoria: number;
        asignacion_completa_sitio: boolean;
      };
    }
  | { ok: false; error: string } {
  const validSitioAuditoriaId = assertValidUuid(input.sitioAuditoriaId, 'sitio de auditoría');
  const validAuditorId = assertValidUuid(input.auditorId, 'auditor');
  const validAuditId =
    input.auditId && input.auditId.trim() !== ''
      ? assertValidUuid(input.auditId, 'auditoría')
      : null;

  if (!VALID_AUDITOR_SITE_ROLES.has(input.rol_auditor)) {
    return {
      ok: false,
      error: 'El rol del auditor en el sitio no es válido.',
    };
  }

  if (!Number.isFinite(input.tiempo_auditoria) || input.tiempo_auditoria < 0) {
    return {
      ok: false,
      error: 'Los días-auditor asignados deben ser mayores o iguales a 0.',
    };
  }

  return {
    ok: true,
    value: {
      auditId: validAuditId,
      id_sitios_por_auditoria: validSitioAuditoriaId,
      id_auditor: validAuditorId,
      rol_auditor: input.rol_auditor,
      tiempo_auditoria: roundAuditDaysQuarter(input.tiempo_auditoria),
      asignacion_completa_sitio: Boolean(input.asignacion_completa_sitio),
    },
  };
}

export function validateAndBuildEquipoAuditorProcesoPayload(
  procesoSitioAuditoriaId: string,
  auditorId: string,
  rolEnProceso: AuditorProcessRole = 'EVALUADOR'
):
  | {
      ok: true;
      value: {
        id_procesos_sitio_auditoria: string;
        id_auditor: string;
        rol_en_proceso: AuditorProcessRole;
      };
    }
  | { ok: false; error: string } {
  const validPsaId = assertValidUuid(procesoSitioAuditoriaId, 'proceso en sitio de auditoría');
  const validAuditorId = assertValidUuid(auditorId, 'auditor');

  if (!VALID_AUDITOR_PROCESS_ROLES.has(rolEnProceso)) {
    return {
      ok: false,
      error: 'El rol del auditor en el proceso no es válido.',
    };
  }

  return {
    ok: true,
    value: {
      id_procesos_sitio_auditoria: validPsaId,
      id_auditor: validAuditorId,
      rol_en_proceso: rolEnProceso,
    },
  };
}

export function computeAuditTotalDaysFromActiveSites(
  sites: ReadonlyArray<{ tiempo_auditoria: number; deleted_at?: string | null }>
): number {
  const sum = sites
    .filter((s) => !s.deleted_at)
    .reduce((acc, s) => acc + roundAuditDaysQuarter(Number(s.tiempo_auditoria || 0)), 0);
  return roundAuditDaysQuarter(sum);
}

const SITE_ROLE_WEIGHT: Record<AuditorSiteRole, number> = {
  AUDITOR_LIDER: 4,
  AUDITOR: 3,
  EXPERTO_TECNICO: 2,
  AUDITOR_EN_ENTRENAMIENTO: 1,
};

/**
 * Mirrors PostgreSQL triggers `fn_sync_equipo_auditor_desde_sitio` and
 * `fn_sync_equipo_auditor_desde_proceso`, while also identifying orphaned auditors
 * after archival from `equipo_auditor_sitio` / `equipo_auditor_proceso_sitio`.
 */
export function deriveConsolidatedEquipoAuditorRoles(
  siteAssignments: ReadonlyArray<{
    id_auditor: string;
    rol_auditor: AuditorSiteRole;
    deleted_at?: string | null;
  }>,
  processAssignments: ReadonlyArray<{
    id_auditor: string;
    rol_en_proceso: AuditorProcessRole;
    deleted_at?: string | null;
  }>
): Map<string, AuditorSiteRole> {
  const roles = new Map<string, AuditorSiteRole>();

  for (const s of siteAssignments) {
    if (s.deleted_at || !isValidUuid(s.id_auditor)) continue;
    const prev = roles.get(s.id_auditor);
    if (!prev || SITE_ROLE_WEIGHT[s.rol_auditor] > SITE_ROLE_WEIGHT[prev]) {
      roles.set(s.id_auditor, s.rol_auditor);
    }
  }

  for (const p of processAssignments) {
    if (p.deleted_at || !isValidUuid(p.id_auditor)) continue;
    if (roles.has(p.id_auditor)) continue;
    roles.set(p.id_auditor, p.rol_en_proceso === 'APOYO_TECNICO' ? 'EXPERTO_TECNICO' : 'AUDITOR');
  }

  return roles;
}

// ---------------------------------------------------------------------------
// 4. Configuración de Alertas (`configuracion_alerta_auditoria`)
// ---------------------------------------------------------------------------

export interface SaveAlertConfigInput {
  dias_aviso_proxima: number;
  dias_aviso_preprogramada_sin_confirmar: number;
  alertar_atrasadas: boolean;
  alertar_conflicto_auditor: boolean;
  alertar_desfase_dias_o_span: boolean;
  ciclos_rotacion_auditor_lider: number;
  alertas_activas: boolean;
  dias_limite_plan_nc?: number;
  dias_limite_plan_accion?: number;
  dias_limite_cierre_nc?: number;
}

export function validateAndNormalizeAlertConfigInput(
  input: SaveAlertConfigInput
): { ok: true; value: Omit<AlertConfigEntity, 'id'> } | { ok: false; error: string } {
  const diasProxima = Math.trunc(Number(input.dias_aviso_proxima));
  if (!Number.isFinite(diasProxima) || diasProxima < 1 || diasProxima > 365) {
    return {
      ok: false,
      error: 'Los días de aviso previo para auditorías próximas deben estar entre 1 y 365.',
    };
  }

  const diasPreprog = Math.trunc(Number(input.dias_aviso_preprogramada_sin_confirmar));
  if (!Number.isFinite(diasPreprog) || diasPreprog < 1 || diasPreprog > 365) {
    return {
      ok: false,
      error:
        'Los días de aviso para auditorías preprogramadas sin confirmar deben estar entre 1 y 365.',
    };
  }

  const ciclosRotacion = Math.trunc(Number(input.ciclos_rotacion_auditor_lider));
  if (!Number.isFinite(ciclosRotacion) || ciclosRotacion < 2 || ciclosRotacion > 10) {
    return {
      ok: false,
      error: 'El umbral de rotación de Auditor Líder (ISO/IEC 17021-1) debe estar entre 2 y 10 ciclos.',
    };
  }

  const rawPlanDays =
    input.dias_limite_plan_nc ??
    input.dias_limite_plan_accion ??
    DEFAULT_AUDIT_ALERT_CONFIG.dias_limite_plan_nc ??
    DEFAULT_AUDIT_ALERT_CONFIG.dias_limite_plan_accion;
  const diasLimitePlan = Math.trunc(Number(rawPlanDays));
  if (!Number.isFinite(diasLimitePlan) || diasLimitePlan < 1 || diasLimitePlan > 180) {
    return {
      ok: false,
      error: 'El plazo límite para entrega del Plan de Acción (NC) debe estar entre 1 y 180 días.',
    };
  }

  const diasLimiteCierre =
    input.dias_limite_cierre_nc !== undefined
      ? Math.trunc(Number(input.dias_limite_cierre_nc))
      : DEFAULT_AUDIT_ALERT_CONFIG.dias_limite_cierre_nc;
  if (!Number.isFinite(diasLimiteCierre) || diasLimiteCierre < 1 || diasLimiteCierre > 365) {
    return {
      ok: false,
      error: 'El plazo límite para cierre de evidencia (NC) debe estar entre 1 y 365 días.',
    };
  }

  return {
    ok: true,
    value: {
      clave: DEFAULT_AUDIT_ALERT_CONFIG.clave,
      dias_aviso_proxima: diasProxima,
      dias_aviso_preprogramada_sin_confirmar: diasPreprog,
      alertar_atrasadas: Boolean(input.alertar_atrasadas),
      alertar_conflicto_auditor: Boolean(input.alertar_conflicto_auditor),
      alertar_desfase_dias_o_span: Boolean(input.alertar_desfase_dias_o_span),
      ciclos_rotacion_auditor_lider: ciclosRotacion,
      alertas_activas: Boolean(input.alertas_activas),
      dias_limite_plan_accion: diasLimitePlan,
      dias_limite_plan_nc: diasLimitePlan,
      dias_limite_cierre_nc: diasLimiteCierre,
    },
  };
}

// ---------------------------------------------------------------------------
// 5. Step 1.2 — Asignación de Códigos Únicos, Reintento `23505` y Rollback Huérfano
// ---------------------------------------------------------------------------

export const MAX_UNIQUE_CODE_RETRY_ATTEMPTS = 5;

export function resolveCampaignTargetYear(params: {
  dateMode?: AuditDatePrecision | null;
  anio?: number | null;
  fechaInicio?: string | null;
  fallbackYear?: number;
}): number {
  const { dateMode, anio, fechaInicio, fallbackYear } = params;
  if (
    dateMode === 'PREPROGRAMADA_MES' &&
    typeof anio === 'number' &&
    Number.isFinite(anio) &&
    anio >= 1900 &&
    anio <= 2200
  ) {
    return Math.trunc(anio);
  }
  const isoMatch = typeof fechaInicio === 'string' ? /^(\d{4})/.exec(fechaInicio.trim()) : null;
  if (isoMatch) {
    const parsed = Number.parseInt(isoMatch[1], 10);
    if (Number.isFinite(parsed) && parsed >= 1900 && parsed <= 2200) {
      return parsed;
    }
  }
  if (typeof anio === 'number' && Number.isFinite(anio) && anio >= 1900 && anio <= 2200) {
    return Math.trunc(anio);
  }
  return fallbackYear ?? new Date().getUTCFullYear();
}

export function isPostgresUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const obj = err as { code?: unknown; message?: unknown; details?: unknown };
  const code = String(obj.code ?? '').trim();
  const message = String(obj.message ?? '').toLowerCase();
  const details = String(obj.details ?? '').toLowerCase();
  return (
    code === '23505' ||
    message.includes('duplicate key') ||
    message.includes('unique constraint') ||
    message.includes('uq_programa_auditoria_codigo_active') ||
    message.includes('uq_auditoria_codigo_active') ||
    details.includes('codigo_programa') ||
    details.includes('codigo_auditoria')
  );
}

export function appendCollisionBreakerSuffix(
  baseCode: string,
  attempt: number,
  maxLength = 40
): string {
  const clean =
    baseCode
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, '') || 'COD';
  const suffix = `-R${attempt + 1}`;
  const maxBase = Math.max(1, maxLength - suffix.length);
  const head = clean.slice(0, maxBase).replace(/-+$/g, '') || clean.slice(0, maxBase);
  return `${head}${suffix}`.slice(0, maxLength);
}

export async function allocateProgramCodeWithFallback(params: {
  targetYear: number;
  activePrograms: ReadonlyArray<ProgramCodeCandidate>;
  triedCodes?: ReadonlySet<string>;
  fetchRemoteNextCode?: (year: number) => Promise<string | null>;
}): Promise<string> {
  const { targetYear, activePrograms, triedCodes, fetchRemoteNextCode } = params;
  if (fetchRemoteNextCode) {
    try {
      const remoteCode = (await fetchRemoteNextCode(targetYear))?.trim().toUpperCase();
      if (remoteCode && !triedCodes?.has(remoteCode)) {
        return remoteCode.slice(0, 40);
      }
    } catch {
      // Fallback transparently to local sequence generator
    }
  }
  const extraTried: ProgramCodeCandidate[] = triedCodes
    ? Array.from(triedCodes).map((code) => ({ codigo_programa: code, deleted_at: null }))
    : [];
  return generateNextUniqueProgramCode([...activePrograms, ...extraTried], targetYear);
}

export async function allocateAuditCodeWithFallback(params: {
  targetYear: number;
  numeroCertificado: string | null | undefined;
  activeAudits: ReadonlyArray<AuditCodeCandidate>;
  reservedCodes?: ReadonlySet<string>;
  triedCodes?: ReadonlySet<string>;
  fetchRemoteNextCode?: (year: number, certShort: string) => Promise<string | null>;
}): Promise<string> {
  const {
    targetYear,
    numeroCertificado,
    activeAudits,
    reservedCodes,
    triedCodes,
    fetchRemoteNextCode,
  } = params;
  const taken = new Set<string>();
  if (reservedCodes) {
    for (const code of reservedCodes) taken.add(code.trim().toUpperCase());
  }
  if (triedCodes) {
    for (const code of triedCodes) taken.add(code.trim().toUpperCase());
  }

  if (fetchRemoteNextCode) {
    try {
      const certShort = sanitizeAuditCodeSegment(numeroCertificado);
      const remoteCode = (await fetchRemoteNextCode(targetYear, certShort))?.trim().toUpperCase();
      if (remoteCode && !taken.has(remoteCode)) {
        return remoteCode.slice(0, 40);
      }
    } catch {
      // Fallback transparently to local sequence generator
    }
  }

  return generateNextUniqueAuditCode(activeAudits, targetYear, numeroCertificado, taken);
}

export interface CodeRetryInsertParams<TData> {
  initialCode?: string | null;
  allocateCode: (attempt: number, triedCodes: ReadonlySet<string>) => Promise<string>;
  attemptInsert: (
    code: string,
    attempt: number
  ) => Promise<{ data?: TData; error: unknown | null }>;
  isMissingSchemaError?: (err: unknown) => boolean;
  maxAttempts?: number;
}

export type CodeRetryInsertOutcome<TData> =
  | { status: 'ok'; code: string; data?: TData; attempts: number }
  | { status: 'missing-schema'; code: string; attempts: number }
  | { status: 'error'; code: string; error: unknown; attempts: number };

export async function insertWithUniqueCodeRetry<TData>(
  params: CodeRetryInsertParams<TData>
): Promise<CodeRetryInsertOutcome<TData>> {
  const maxAttempts = Math.max(
    1,
    Math.min(10, params.maxAttempts ?? MAX_UNIQUE_CODE_RETRY_ATTEMPTS)
  );
  const triedCodes = new Set<string>();
  const trimmedInitial = params.initialCode?.trim() || '';

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let candidateCode: string;
    if (attempt === 0 && trimmedInitial) {
      candidateCode = trimmedInitial.slice(0, 40);
    } else {
      const allocated = (await params.allocateCode(attempt, triedCodes)).trim().slice(0, 40);
      candidateCode =
        !allocated || triedCodes.has(allocated.toUpperCase())
          ? appendCollisionBreakerSuffix(allocated || trimmedInitial || 'COD', attempt, 40)
          : allocated;
    }

    triedCodes.add(candidateCode.toUpperCase());
    const result = await params.attemptInsert(candidateCode, attempt);

    if (!result.error) {
      return {
        status: 'ok',
        code: candidateCode,
        data: result.data,
        attempts: attempt + 1,
      };
    }

    if (params.isMissingSchemaError?.(result.error)) {
      return {
        status: 'missing-schema',
        code: candidateCode,
        attempts: attempt + 1,
      };
    }

    if (!isPostgresUniqueViolation(result.error) || attempt === maxAttempts - 1) {
      return {
        status: 'error',
        code: candidateCode,
        error: result.error,
        attempts: attempt + 1,
      };
    }
  }

  return {
    status: 'error',
    code: trimmedInitial,
    error: new Error('No se pudo asignar un código único tras varios intentos.'),
    attempts: maxAttempts,
  };
}

export async function rollbackOrphanProgramAndAudits(params: {
  programId: string;
  insertedAuditIds: ReadonlyArray<string>;
  reason?: string;
  archiveRecordFn: (
    table: 'programa_auditoria' | 'auditoria',
    recordId: string,
    reason: string
  ) => Promise<void>;
}): Promise<void> {
  const reason = params.reason || 'Rollback por fallo al crear auditoría hija';
  for (const auditId of params.insertedAuditIds) {
    if (!isValidUuid(auditId)) continue;
    try {
      await params.archiveRecordFn('auditoria', auditId, reason);
    } catch {
      // Best-effort cleanup
    }
  }
  if (isValidUuid(params.programId)) {
    try {
      await params.archiveRecordFn('programa_auditoria', params.programId, reason);
    } catch {
      // Best-effort cleanup
    }
  }
}

// ---------------------------------------------------------------------------
// 6. Paso 4.1 — Contratos y Validación de Subconjuntos del Wizard (+ Auditoría)
// ---------------------------------------------------------------------------

export interface Step3NewCycleCertTypeDraft {
  id_certificado: string;
  numero_certificado: string;
  organizacion_nombre: string;
  organizacion_abreviacion?: string | null;
  version_numero?: number | null;
  norma_codigo: string;
  id_tipo_auditoria: string;
  tipo_vinculacion: AuditLinkNature;
}

export interface Step3NewCycleDraft {
  id_vinculo: string;
  codigo_programa: string;
  etiqueta: string;
  dateMode: 'PREPROGRAMADA_MES' | 'PROGRAMADA_EXACTA';
  anio: number;
  mes: number;
  fecha_inicio: string;
  fecha_fin: string;
  fecha_programada?: string;
  observacion: string;
  certTypes: Step3NewCycleCertTypeDraft[];
  enabledCertCount?: number;
  nivel_vinculacion?: AuditLinkLevel;
  tipo_vinculacion?: AuditLinkNature;
}

export function isValidAuditLinkNature(raw: unknown): raw is AuditLinkNature {
  return (
    typeof raw === 'string' &&
    (AUDIT_LINK_NATURES as ReadonlyArray<string>).includes(raw.trim())
  );
}

/**
 * Derives the effective campaign linking level from the subset of enabled certificates:
 * - 1 cert -> `INDIVIDUAL`
 * - >1 certs from same organization -> `NIVEL_1_INTRA_ORG`
 * - >1 certs from distinct organizations -> `NIVEL_2_INTER_ORG`
 */
export function deriveProgramLinkLevelFromCertSubset(
  certs: ReadonlyArray<{ id_organizacion?: string | null }>
): AuditLinkLevel {
  if (certs.length <= 1) {
    return 'INDIVIDUAL';
  }
  const uniqueOrgs = new Set(
    certs.map((c) => (c.id_organizacion || '').trim()).filter(Boolean)
  );
  return uniqueOrgs.size > 1 ? 'NIVEL_2_INTER_ORG' : 'NIVEL_1_INTRA_ORG';
}

/**
 * Derives the parent `programa_auditoria.tipo_vinculacion` from the active rows:
 * - Homogeneous Col 1 natures -> that shared nature
 * - Heterogeneous Col 1 natures -> `'Mixta'`
 */
export function deriveProgramLinkNatureFromCertSubset(
  natures: ReadonlyArray<AuditLinkNature>
): AuditLinkNature {
  const validNatures = natures.filter((n) => isValidAuditLinkNature(n));
  if (validNatures.length === 0) {
    return 'Individual';
  }
  const distinct = new Set(validNatures);
  if (distinct.size === 1) {
    return validNatures[0];
  }
  return 'Mixta';
}

/**
 * Validates a Wizard / Step 3 cycle draft against an active `Vínculo` box,
 * explicitly allowing any non-empty subset (`>= 1`, including 1 single cert) of active
 * certificates from the same conglomerate, enforcing `id_tipo_auditoria`,
 * `tipo_vinculacion`, planned dates, Zero-UUID compliance, and active `Alcance`
 * strictly on the included subset.
 */
export function validateStep3NewCycleDraft(
  draft: Step3NewCycleDraft,
  vinculos: ReadonlyArray<VinculoEntity>,
  certificados?: ReadonlyArray<VinculoCertAlcanceCandidate>
): string | null {
  if (!isValidUuid(draft.id_vinculo)) {
    return 'Seleccione un vínculo configurado en Bloque 2 (Vínculo).';
  }

  const vinculo = vinculos.find((v) => !v.deleted_at && v.id === draft.id_vinculo);
  const activeVinculoCerts = vinculo
    ? vinculo.certificados.filter((c) => !c.deleted_at)
    : [];
  if (!vinculo || activeVinculoCerts.length === 0) {
    return 'El vínculo seleccionado no existe o no tiene certificados activos.';
  }

  const etiqueta = (draft.etiqueta || '').trim();
  if (!etiqueta) {
    return 'Indique un nombre o etiqueta para este ciclo de auditoría.';
  }
  if (containsRawUuid(etiqueta)) {
    return 'La etiqueta del ciclo no debe contener identificadores UUID internos.';
  }

  if (containsRawUuid(draft.codigo_programa || '')) {
    return 'El código del programa no debe contener identificadores UUID internos.';
  }

  if (containsRawUuid(draft.observacion || '')) {
    return 'La observación del ciclo no debe contener identificadores UUID internos.';
  }

  if (draft.dateMode === 'PREPROGRAMADA_MES') {
    if (draft.anio < 2020 || draft.anio > 2100 || draft.mes < 1 || draft.mes > 12) {
      return 'Indique un mes (1–12) y año válido para la preprogramación.';
    }
    const dateCheck = validateAuditDateEntryInput(
      {
        tipo_fecha: 'PREPROGRAMADA_MES',
        anio: draft.anio,
        mes: draft.mes,
      },
      { allowReal: false }
    );
    if (!dateCheck.valid) {
      return dateCheck.error || 'Indique un mes (1–12) y año válido para la preprogramación.';
    }
  } else if (draft.dateMode === 'PROGRAMADA_EXACTA') {
    const singleGoal = (draft.fecha_programada ?? '').trim();
    const startDate = draft.fecha_inicio.trim() || singleGoal;
    const endDate = draft.fecha_fin.trim() || singleGoal || startDate;
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(endDate) ||
      (singleGoal.length > 0 && !/^\d{4}-\d{2}-\d{2}$/.test(singleGoal))
    ) {
      return 'Indique una fecha objetivo programada exacta válida (YYYY-MM-DD).';
    }
    if (endDate < startDate) {
      return 'La fecha fin programada no puede ser anterior a la fecha de inicio.';
    }
    const dateCheck = validateAuditDateEntryInput(
      {
        tipo_fecha: 'PROGRAMADA_EXACTA',
        fecha_inicio: startDate,
        fecha_fin: endDate,
      },
      { allowReal: false }
    );
    if (!dateCheck.valid) {
      return (
        dateCheck.error ||
        'Indique una fecha objetivo programada exacta válida (YYYY-MM-DD).'
      );
    }
  } else {
    return 'Seleccione un modo de fecha programada válido (Preprogramada por Mes/Año o Programada Exacta).';
  }

  if (draft.certTypes.length === 0) {
    return 'Active al menos un certificado del vínculo para programar la auditoría.';
  }

  const activeVinculoCertById = new Map(
    activeVinculoCerts.map((c) => [c.id_certificado, c])
  );
  const catalogCertById = new Map(
    (certificados ?? [])
      .filter((c) => !c.deleted_at && c.id)
      .map((c) => [c.id, c])
  );

  const seenCertIds = new Set<string>();
  const selectedMembersForScopeCheck: Array<{
    id_certificado: string;
    numero_certificado?: string;
    organizacion_abreviacion?: string | null;
    deleted_at?: string | null;
    alcanceDetalle?: VinculoCertAlcanceCandidate['alcanceDetalle'];
    hasAlcance?: boolean;
  }> = [];

  for (const item of draft.certTypes) {
    if (!isValidUuid(item.id_certificado)) {
      return 'Uno de los certificados seleccionados no es válido.';
    }
    if (seenCertIds.has(item.id_certificado)) {
      return 'No se permite duplicar el mismo certificado dentro del ciclo de auditoría.';
    }
    seenCertIds.add(item.id_certificado);

    const vinculoMember = activeVinculoCertById.get(item.id_certificado);
    const catalogCert = catalogCertById.get(item.id_certificado) as
      | (VinculoCertAlcanceCandidate & { id_grupo_empresarial?: string | null })
      | undefined;
    if (!vinculoMember) {
      const belongsSameCong =
        Boolean(catalogCert?.id_grupo_empresarial) &&
        catalogCert?.id_grupo_empresarial === vinculo.id_grupo_empresarial;
      if (!belongsSameCong) {
        return `El certificado ${item.numero_certificado || 'seleccionado'} no pertenece al vínculo o conglomerado activo.`;
      }
    }

    if (!isValidUuid(item.id_tipo_auditoria)) {
      return `Seleccione el tipo de auditoría para el certificado ${item.numero_certificado}.`;
    }

    if (!isValidAuditLinkNature(item.tipo_vinculacion)) {
      return `Seleccione una relación / naturaleza válida para el certificado ${item.numero_certificado}.`;
    }

    const memberForScope: {
      id_certificado: string;
      numero_certificado?: string;
      organizacion_abreviacion?: string | null;
      deleted_at?: string | null;
      alcanceDetalle?: VinculoCertAlcanceCandidate['alcanceDetalle'];
      hasAlcance?: boolean;
    } = {
      id_certificado: item.id_certificado,
      numero_certificado:
        vinculoMember?.numero_certificado || item.numero_certificado,
      organizacion_abreviacion:
        vinculoMember?.organizacion_abreviacion ??
        item.organizacion_abreviacion ??
        null,
      deleted_at: null,
    };
    if (vinculoMember && 'alcanceDetalle' in vinculoMember) {
      memberForScope.alcanceDetalle = vinculoMember.alcanceDetalle;
    }
    if (vinculoMember && typeof vinculoMember.hasAlcance === 'boolean') {
      memberForScope.hasAlcance = vinculoMember.hasAlcance;
    }
    selectedMembersForScopeCheck.push(memberForScope);
  }

  const alcanceCheck = validateVinculoCertificatesHaveAlcance(
    selectedMembersForScopeCheck,
    certificados
  );
  if (!alcanceCheck.allowed) {
    return (
      alcanceCheck.reason ||
      'Uno o más certificados seleccionados no poseen un Alcance activo registrado.'
    );
  }

  return null;
}

