/**
 * Step 1.2 — Conglomerado (`grupo_empresarial`) Pure Domain Engine
 *
 * Strictly typed (`strict: true`, 0 `any` / `as any`) and Zero-UUID compliant
 * in all user-facing labels and validation errors.
 */

import { assertValidUuid, isValidUuid } from './zeroUuid';
import {
  countActiveCertificates,
  type CertificadoSummary,
  type OrganizacionEntity,
} from './activeCertificates';
import type { CertificadoDetailEntity } from './multisiteSampling';
import type { UserProfile } from './healthCheck';
import {
  formatAuditDateLabel,
  resolveLatestAuditDate,
  type AuditDateEntry,
  type ProgramaAuditoriaEntity,
} from './auditPlanningEngine';
import type { ProgramacionAuditEntity } from './auditExecution';
import type { AuditoriaSitioTemporalEntity } from './designacionTemporalDomain';
import type { AlertConfigEntity } from './auditAlertsEngine';
import {
  getPipelineStageBadgeMeta,
  resolveCurrentPipelineStage,
  type PipelineStageOneWord,
} from './pipelineEngine';

export type ConglomeradoBucketKind = 'SOLO' | 'MULTI_ORG' | 'VACIO';

export interface ConglomeradoEntity {
  id: string;
  codigo_grupo: string | null;
  nombre: string;
  es_individual_auto: boolean;
  notas: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
  delete_reason?: string | null;
}

export interface ConglomeradoWithStats extends ConglomeradoEntity {
  organizaciones: OrganizacionEntity[];
  organizacionesCount: number;
  certificadosCount: number;
  bucketKind: ConglomeradoBucketKind;
}

export interface ConglomeradoFormDraft {
  codigo_grupo: string;
  nombre: string;
  notas: string;
}

export interface RebucketPlanResult {
  valid: boolean;
  errorMessage: string | null;
  organizationId: string;
  sourceGroupId: string;
  targetGroupId: string;
  willArchiveSourceGroup: boolean;
  sourceRemainingOrgCount: number;
  targetNewOrgCount: number;
}

export type ConglomeradoCertRef = Pick<CertificadoDetailEntity, 'id_organizacion'> & {
  deleted_at?: string | null;
};

export interface ActiveCertCountingRef {
  id?: string;
  numero_certificado?: string;
  norma?: string;
  norma_codigo?: string;
  id_organizacion?: string;
  organizacion_id?: string;
  estatus: string;
  deleted_at?: string | null;
}

export interface EligibleSoloOrganizationOption {
  organizacion: OrganizacionEntity;
  sourceGroupId: string;
  sourceGroupName: string;
}

export interface ConglomeradoVinculoRef {
  id: string;
  etiqueta: string;
  codigo_vinculo?: string | null;
  nivel_vinculacion?: string;
  tipo_vinculacion?: string;
  deleted_at?: string | null;
  certificados?: ReadonlyArray<{
    id_certificado: string;
    id_organizacion: string;
    deleted_at?: string | null;
  }>;
}

export interface OrganizationDetachValidationInput {
  group: ConglomeradoWithStats | null | undefined;
  orgId: string;
  vinculos?: ReadonlyArray<ConglomeradoVinculoRef>;
  auditPrograms?: ReadonlyArray<ProgramaAuditoriaEntity>;
}

export interface OrganizationDetachValidationResult {
  valid: boolean;
  errorMessage: string | null;
  organization: OrganizacionEntity | null;
  conflictLabel: string | null;
}

export type ConglomeradoAuditStatusLabel = PipelineStageOneWord | 'Cancelada';

export interface ConglomeradoAuditListItem {
  audit: ProgramacionAuditEntity;
  program: ProgramaAuditoriaEntity | null;
  vinculoEtiqueta: string;
  dateLabel: string;
  sortDateKey: string;
  createdAtKey: string;
  estatus_auditoria: ConglomeradoAuditStatusLabel;
  estatusBadgeClass: string;
}

export interface BuildConglomeradoAuditsListInput {
  group: ConglomeradoWithStats;
  auditPrograms?: ReadonlyArray<ProgramaAuditoriaEntity>;
  programacionAudits?: ReadonlyArray<ProgramacionAuditEntity>;
  vinculos?: ReadonlyArray<ConglomeradoVinculoRef>;
  temporalSites?: ReadonlyArray<AuditoriaSitioTemporalEntity>;
  alertConfig?: AlertConfigEntity;
  profile?: UserProfile | null;
  authorizedClientOrgIds?: ReadonlyArray<string>;
}

export const INITIAL_CONGLOMERADOS: ConglomeradoEntity[] = [
  {
    id: '20000000-0000-0000-0000-000000000001',
    codigo_grupo: 'CONG-IND-01',
    nombre: 'Grupo Industrial Iberometal',
    es_individual_auto: false,
    notas: 'Conglomerado corporativo multi-empresa habilitado para vinculación Nivel 2.',
  },
  {
    id: '20000000-0000-0000-0000-000000000002',
    codigo_grupo: 'CONG-CYB-01',
    nombre: 'CyberCloud Solutions S.L.',
    es_individual_auto: true,
    notas: 'Grupo individual 1:1 creado para organización independiente.',
  },
  {
    id: '20000000-0000-0000-0000-000000000003',
    codigo_grupo: 'CONG-BIO-01',
    nombre: 'BioAlimentos del Sur S.A.',
    es_individual_auto: true,
    notas: 'Grupo individual 1:1 creado para organización independiente.',
  },
];

export function createEmptyConglomeradoFormDraft(): ConglomeradoFormDraft {
  return { codigo_grupo: '', nombre: '', notas: '' };
}

export function createConglomeradoDraftFromEntity(
  entity: ConglomeradoEntity
): ConglomeradoFormDraft {
  return {
    codigo_grupo: entity.codigo_grupo || '',
    nombre: entity.nombre,
    notas: entity.notas || '',
  };
}

export function validateConglomeradoDraft(
  draft: ConglomeradoFormDraft,
  existing: ReadonlyArray<ConglomeradoEntity>,
  editingId?: string | null
): string | null {
  const nombre = draft.nombre.trim();
  if (nombre.length < 2) {
    return 'El nombre del conglomerado debe tener al menos 2 caracteres.';
  }
  const normalizedName = nombre.toLowerCase();
  const duplicateName = existing.some(
    (g) =>
      !g.deleted_at &&
      g.id !== editingId &&
      g.nombre.trim().toLowerCase() === normalizedName
  );
  if (duplicateName) {
    return `Ya existe un conglomerado activo llamado "${nombre}".`;
  }
  const code = draft.codigo_grupo.trim();
  if (code.length > 0) {
    const duplicateCode = existing.some(
      (g) =>
        !g.deleted_at &&
        g.id !== editingId &&
        (g.codigo_grupo || '').trim().toLowerCase() === code.toLowerCase()
    );
    if (duplicateCode) {
      return `El código de conglomerado "${code}" ya está asignado a otro registro activo.`;
    }
  }
  return null;
}

export function resolveConglomeradoBucketKind(
  activeOrgsCount: number
): ConglomeradoBucketKind {
  if (activeOrgsCount <= 0) return 'VACIO';
  if (activeOrgsCount === 1) return 'SOLO';
  return 'MULTI_ORG';
}

export function computeOrgActiveCertificatesMap(
  certificados: ReadonlyArray<ActiveCertCountingRef>
): Map<string, number> {
  const summaries: CertificadoSummary[] = [];
  const orgIds = new Set<string>();

  for (const cert of certificados) {
    if (cert.deleted_at) continue;
    const orgId = (cert.id_organizacion || cert.organizacion_id || '').trim();
    if (!orgId) continue;
    orgIds.add(orgId);
    summaries.push({
      id: cert.id || `${orgId}-${summaries.length}`,
      numero_certificado: cert.numero_certificado || '',
      id_organizacion: orgId,
      organizacion_id: orgId,
      norma: cert.norma || cert.norma_codigo || '',
      estatus: cert.estatus,
    });
  }

  const counts = new Map<string, number>();
  for (const orgId of orgIds) {
    counts.set(orgId, countActiveCertificates(summaries, orgId));
  }
  return counts;
}

export function getEligibleSoloOrganizationsForRebucket(
  conglomerados: ReadonlyArray<ConglomeradoWithStats>,
  targetGroupId: string
): EligibleSoloOrganizationOption[] {
  const options: EligibleSoloOrganizationOption[] = [];
  for (const group of conglomerados) {
    if (group.deleted_at || group.id === targetGroupId) continue;
    if (group.bucketKind !== 'SOLO') continue;
    const activeMembers = group.organizaciones.filter((o) => !o.deleted_at);
    if (activeMembers.length !== 1) continue;
    const org = activeMembers[0];
    if (org.id_grupo_empresarial === targetGroupId) continue;
    options.push({
      organizacion: org,
      sourceGroupId: group.id,
      sourceGroupName: group.nombre,
    });
  }
  return options.sort((a, b) =>
    a.organizacion.nombre.localeCompare(b.organizacion.nombre, 'es')
  );
}

export function validateOrganizationDetachFromConglomerado(
  input: OrganizationDetachValidationInput
): OrganizationDetachValidationResult {
  const { group, orgId, vinculos = [], auditPrograms = [] } = input;
  if (!group || group.deleted_at) {
    return {
      valid: false,
      errorMessage: 'El conglomerado no está disponible para separación organizacional.',
      organization: null,
      conflictLabel: null,
    };
  }

  const activeMembers = group.organizaciones.filter((o) => !o.deleted_at);
  if (activeMembers.length <= 1) {
    return {
      valid: false,
      errorMessage:
        'Este conglomerado solo tiene una organización miembro; no requiere separación individual.',
      organization: null,
      conflictLabel: null,
    };
  }

  if (!orgId || !isValidUuid(orgId)) {
    return {
      valid: false,
      errorMessage: 'Seleccione una organización miembro válida para separar del conglomerado.',
      organization: null,
      conflictLabel: null,
    };
  }

  const org = activeMembers.find((o) => o.id === orgId) || null;
  if (!org) {
    return {
      valid: false,
      errorMessage: 'La organización seleccionada no pertenece a este conglomerado.',
      organization: null,
      conflictLabel: null,
    };
  }

  for (const vinculo of vinculos) {
    if (vinculo.deleted_at) continue;
    const activeCerts = (vinculo.certificados || []).filter((c) => !c.deleted_at);
    const hasSelf = activeCerts.some((c) => c.id_organizacion === orgId);
    const hasOther = activeCerts.some(
      (c) => Boolean(c.id_organizacion) && c.id_organizacion !== orgId
    );
    if (hasSelf && hasOther) {
      const conflictLabel = (
        vinculo.etiqueta ||
        vinculo.codigo_vinculo ||
        'Vínculo Nivel 2'
      ).trim();
      return {
        valid: false,
        errorMessage: `Operación bloqueada: "${org.nombre}" participa en el vínculo inter-organizacional activo "${conflictLabel}". Desvincule o ajuste ese vínculo antes de separar la organización.`,
        organization: org,
        conflictLabel,
      };
    }
  }

  for (const program of auditPrograms) {
    if (program.deleted_at) continue;
    const activeAudits = program.auditorias.filter(
      (a) =>
        !a.deleted_at &&
        a.estado_ciclo !== 'Cerrada' &&
        a.estado_ciclo !== 'Cancelada'
    );
    const hasSelf = activeAudits.some((a) => a.id_organizacion === orgId);
    const hasOther = activeAudits.some(
      (a) => Boolean(a.id_organizacion) && a.id_organizacion !== orgId
    );
    if (hasSelf && hasOther) {
      const conflictLabel = (
        program.etiqueta ||
        program.codigo_programa ||
        'Vínculo Nivel 2'
      ).trim();
      return {
        valid: false,
        errorMessage: `Operación bloqueada: "${org.nombre}" participa en el vínculo inter-organizacional activo "${conflictLabel}". Desvincule o ajuste ese vínculo antes de separar la organización.`,
        organization: org,
        conflictLabel,
      };
    }
  }

  return {
    valid: true,
    errorMessage: null,
    organization: org,
    conflictLabel: null,
  };
}

function formatFallbackAuditDateLabel(audit: ProgramacionAuditEntity): string {
  const start = (audit.fecha_reprogramacion || audit.fecha_inicio || '').trim();
  const end = (audit.fecha_fin || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(start)) {
    return 'Sin fecha';
  }
  const formatIso = (iso: string): string => {
    const clean = iso.slice(0, 10);
    const [y, m, d] = clean.split('-');
    return y && m && d ? `${d}/${m}/${y}` : clean;
  };
  const startFmt = formatIso(start);
  if (/^\d{4}-\d{2}-\d{2}/.test(end) && end.slice(0, 10) > start.slice(0, 10)) {
    return `${startFmt} – ${formatIso(end)}`;
  }
  return startFmt;
}

function resolveAuditSortDateKey(
  audit: ProgramacionAuditEntity,
  latestDate: AuditDateEntry | null
): string {
  if (latestDate && !latestDate.deleted_at) {
    if (latestDate.fecha_inicio && /^\d{4}-\d{2}-\d{2}/.test(latestDate.fecha_inicio)) {
      return latestDate.fecha_inicio.slice(0, 10);
    }
    if (latestDate.anio && latestDate.mes) {
      return `${latestDate.anio}-${String(latestDate.mes).padStart(2, '0')}-01`;
    }
  }
  const fallback = (audit.fecha_reprogramacion || audit.fecha_inicio || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(fallback)) {
    return fallback.slice(0, 10);
  }
  return '';
}

function resolveConglomeradoAuditStatus(
  audit: ProgramacionAuditEntity,
  temporalSites: ReadonlyArray<AuditoriaSitioTemporalEntity>
): { label: ConglomeradoAuditStatusLabel; badgeClass: string } {
  const statusNorm = (audit.estatus || '').trim().toLowerCase();
  if (audit.estado_ciclo === 'Cancelada' || statusNorm === 'cancelada') {
    return {
      label: 'Cancelada',
      badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
    };
  }
  const stage = resolveCurrentPipelineStage(audit, temporalSites);
  const meta = getPipelineStageBadgeMeta(stage);
  const cleanBadgeClass = meta.badgeClass.replace(/\bhover:[^\s]+/g, '').trim();
  return {
    label: stage,
    badgeClass: cleanBadgeClass,
  };
}

export function buildConglomeradoAuditsList(
  input: BuildConglomeradoAuditsListInput
): ConglomeradoAuditListItem[] {
  const {
    group,
    auditPrograms = [],
    programacionAudits = [],
    vinculos = [],
    temporalSites = [],
    alertConfig,
    profile = null,
    authorizedClientOrgIds = [],
  } = input;
  void alertConfig;

  let visibleMembers = group.organizaciones.filter((o) => !o.deleted_at);
  const isClient = profile?.role === 'CLIENT';
  if (isClient) {
    if (profile.status !== 'APPROVED') return [];
    const allowedSet = new Set(authorizedClientOrgIds);
    visibleMembers = visibleMembers.filter((o) => allowedSet.has(o.id));
  }

  if (visibleMembers.length === 0) return [];

  const memberOrgIds = new Set(visibleMembers.map((o) => o.id));
  const memberOrgNames = new Set(visibleMembers.map((o) => o.nombre.trim().toLowerCase()));

  const vinculoById = new Map(
    vinculos.filter((v) => !v.deleted_at).map((v) => [v.id, v])
  );
  const programById = new Map<string, ProgramaAuditoriaEntity>();
  const programByAuditId = new Map<string, ProgramaAuditoriaEntity>();
  const auditMap = new Map<string, ProgramacionAuditEntity>();

  const registerAudit = (candidate: ProgramacionAuditEntity): void => {
    if (candidate.deleted_at) return;
    const existing = auditMap.get(candidate.id);
    if (!existing) {
      auditMap.set(candidate.id, candidate);
      return;
    }
    const existingFechasCount = (existing.fechas || []).filter((f) => !f.deleted_at).length;
    const candidateFechasCount = (candidate.fechas || []).filter((f) => !f.deleted_at).length;
    const existingSitesCount = (existing.sitiosPlan || []).filter((s) => !s.deleted_at).length;
    const candidateSitesCount = (candidate.sitiosPlan || []).filter((s) => !s.deleted_at).length;
    auditMap.set(candidate.id, {
      ...existing,
      ...candidate,
      fechas: candidateFechasCount >= existingFechasCount ? candidate.fechas : existing.fechas,
      latestDate: candidate.latestDate || existing.latestDate,
      sitiosPlan: candidateSitesCount >= existingSitesCount ? candidate.sitiosPlan : existing.sitiosPlan,
      created_at: candidate.created_at || existing.created_at,
    });
  };

  for (const audit of programacionAudits) {
    registerAudit(audit);
  }

  for (const prog of auditPrograms) {
    if (prog.deleted_at) continue;
    programById.set(prog.id, prog);
    for (const audit of prog.auditorias) {
      if (audit.deleted_at) continue;
      programByAuditId.set(audit.id, prog);
      registerAudit(audit);
    }
  }

  const items: ConglomeradoAuditListItem[] = [];
  for (const audit of auditMap.values()) {
    const auditOrgId = (audit.id_organizacion || '').trim();
    const matchesOrg = auditOrgId
      ? memberOrgIds.has(auditOrgId)
      : !isClient && memberOrgNames.has(audit.organizacion_nombre.trim().toLowerCase());
    if (!matchesOrg) continue;

    const program =
      (audit.id_programa_auditoria && programById.get(audit.id_programa_auditoria)) ||
      programByAuditId.get(audit.id) ||
      null;
    const linkedVinculo =
      program?.id_vinculo ? vinculoById.get(program.id_vinculo) || null : null;
    const vinculoEtiqueta =
      linkedVinculo?.etiqueta || program?.etiqueta || '';

    const latestDate = resolveLatestAuditDate(audit.fechas) ?? audit.latestDate ?? null;
    const dateLabel =
      latestDate && !latestDate.deleted_at
        ? formatAuditDateLabel(latestDate)
        : formatFallbackAuditDateLabel(audit);
    const sortDateKey = resolveAuditSortDateKey(audit, latestDate);
    const createdAtKey = (audit.created_at || '').trim();
    const resolvedStatus = resolveConglomeradoAuditStatus(audit, temporalSites);

    items.push({
      audit,
      program,
      vinculoEtiqueta,
      dateLabel,
      sortDateKey,
      createdAtKey,
      estatus_auditoria: resolvedStatus.label,
      estatusBadgeClass: resolvedStatus.badgeClass,
    });
  }

  return items.sort((a, b) => {
    if (a.sortDateKey !== b.sortDateKey) {
      return b.sortDateKey.localeCompare(a.sortDateKey);
    }
    if (a.createdAtKey !== b.createdAtKey) {
      return b.createdAtKey.localeCompare(a.createdAtKey);
    }
    return (b.audit.codigo_auditoria || '').localeCompare(a.audit.codigo_auditoria || '');
  });
}

export function buildConglomeradosWithStats(
  conglomerados: ReadonlyArray<ConglomeradoEntity>,
  organizaciones: ReadonlyArray<OrganizacionEntity>,
  certificados: ReadonlyArray<ConglomeradoCertRef>
): ConglomeradoWithStats[] {
  const certsByOrg = new Map<string, number>();
  for (const cert of certificados) {
    if (cert.deleted_at) continue;
    certsByOrg.set(cert.id_organizacion, (certsByOrg.get(cert.id_organizacion) || 0) + 1);
  }

  const orgsByGroup = new Map<string, OrganizacionEntity[]>();
  for (const org of organizaciones) {
    if (org.deleted_at || !org.id_grupo_empresarial) continue;
    const list = orgsByGroup.get(org.id_grupo_empresarial) || [];
    list.push(org);
    orgsByGroup.set(org.id_grupo_empresarial, list);
  }

  return conglomerados
    .filter((g) => !g.deleted_at)
    .map((g) => {
      const groupOrgs = (orgsByGroup.get(g.id) || [])
        .slice()
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      const certificadosCount = groupOrgs.reduce(
        (sum, o) => sum + (certsByOrg.get(o.id) ?? o.certificados_count ?? 0),
        0
      );
      return {
        ...g,
        organizaciones: groupOrgs,
        organizacionesCount: groupOrgs.length,
        certificadosCount,
        bucketKind: resolveConglomeradoBucketKind(groupOrgs.length),
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

export function filterConglomeradosByBucketKind(
  conglomerados: ReadonlyArray<ConglomeradoWithStats>,
  bucketKind: ConglomeradoBucketKind | 'ALL'
): ConglomeradoWithStats[] {
  if (bucketKind === 'ALL') return conglomerados.slice();
  return conglomerados.filter((g) => g.bucketKind === bucketKind);
}

export function planOrganizationRebucket(
  organizationId: string,
  targetGroupId: string,
  organizaciones: ReadonlyArray<OrganizacionEntity>,
  conglomerados: ReadonlyArray<ConglomeradoEntity>
): RebucketPlanResult {
  if (!isValidUuid(organizationId) || !isValidUuid(targetGroupId)) {
    return {
      valid: false,
      errorMessage: 'Identificador inválido para re-agrupación de organización.',
      organizationId,
      sourceGroupId: '',
      targetGroupId,
      willArchiveSourceGroup: false,
      sourceRemainingOrgCount: 0,
      targetNewOrgCount: 0,
    };
  }

  const org = organizaciones.find((o) => !o.deleted_at && o.id === organizationId);
  if (!org) {
    return {
      valid: false,
      errorMessage: 'La organización seleccionada no existe o está archivada.',
      organizationId,
      sourceGroupId: '',
      targetGroupId,
      willArchiveSourceGroup: false,
      sourceRemainingOrgCount: 0,
      targetNewOrgCount: 0,
    };
  }

  const sourceGroupId = (org.id_grupo_empresarial || '').trim();
  if (!isValidUuid(sourceGroupId)) {
    return {
      valid: false,
      errorMessage: 'La organización seleccionada no posee un conglomerado origen válido.',
      organizationId,
      sourceGroupId: '',
      targetGroupId,
      willArchiveSourceGroup: false,
      sourceRemainingOrgCount: 0,
      targetNewOrgCount: 0,
    };
  }

  assertValidUuid(organizationId, 'organización');
  assertValidUuid(targetGroupId, 'conglomerado destino');
  assertValidUuid(sourceGroupId, 'conglomerado origen');

  const target = conglomerados.find((g) => !g.deleted_at && g.id === targetGroupId);
  if (!target) {
    return {
      valid: false,
      errorMessage: 'El conglomerado destino no existe o está archivado.',
      organizationId,
      sourceGroupId,
      targetGroupId,
      willArchiveSourceGroup: false,
      sourceRemainingOrgCount: 0,
      targetNewOrgCount: 0,
    };
  }

  if (sourceGroupId === targetGroupId) {
    return {
      valid: false,
      errorMessage: 'La organización ya pertenece al conglomerado seleccionado.',
      organizationId,
      sourceGroupId,
      targetGroupId,
      willArchiveSourceGroup: false,
      sourceRemainingOrgCount: 0,
      targetNewOrgCount: 0,
    };
  }

  const sourceRemainingOrgCount = organizaciones.filter(
    (o) => !o.deleted_at && o.id_grupo_empresarial === sourceGroupId && o.id !== org.id
  ).length;
  const targetCurrentCount = organizaciones.filter(
    (o) => !o.deleted_at && o.id_grupo_empresarial === targetGroupId
  ).length;

  return {
    valid: true,
    errorMessage: null,
    organizationId,
    sourceGroupId,
    targetGroupId,
    willArchiveSourceGroup: sourceRemainingOrgCount === 0,
    sourceRemainingOrgCount,
    targetNewOrgCount: targetCurrentCount + 1,
  };
}

export function scopeConglomeradosForProfile(
  conglomerados: ReadonlyArray<ConglomeradoWithStats>,
  profile: UserProfile | null,
  authorizedClientOrgIds: ReadonlyArray<string>,
  activeCertCountByOrgId?: Map<string, number>
): ConglomeradoWithStats[] {
  if (!profile || profile.status !== 'APPROVED') return [];
  if (profile.role === 'ADMIN' || profile.role === 'WORKER') {
    return conglomerados.slice();
  }
  if (profile.role === 'AUDITOR') {
    return [];
  }
  const allowed = new Set(authorizedClientOrgIds);
  return conglomerados
    .map((g): ConglomeradoWithStats | null => {
      const visibleOrgs = g.organizaciones.filter((o) => allowed.has(o.id));
      if (visibleOrgs.length === 0) return null;
      return {
        ...g,
        organizaciones: visibleOrgs,
        organizacionesCount: visibleOrgs.length,
        certificadosCount: visibleOrgs.reduce(
          (acc, o) =>
            acc + (activeCertCountByOrgId?.get(o.id) ?? o.certificados_count ?? 0),
          0
        ),
        bucketKind: resolveConglomeradoBucketKind(visibleOrgs.length),
      };
    })
    .filter((item): item is ConglomeradoWithStats => item !== null);
}

export function hasOrganizationValidConglomerado(
  org: OrganizacionEntity | undefined,
  conglomerados: ReadonlyArray<ConglomeradoEntity>
): boolean {
  if (!org || org.deleted_at || !org.id_grupo_empresarial) return false;
  return conglomerados.some((g) => !g.deleted_at && g.id === org.id_grupo_empresarial);
}
