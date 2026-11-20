/**
 * Step 1.2 — Conglomerado (`grupo_empresarial`) Pure Domain Engine
 *
 * Strictly typed (`strict: true`, 0 `any` / `as any`) and Zero-UUID compliant
 * in all user-facing labels and validation errors.
 */

import { assertValidUuid, isValidUuid } from './zeroUuid';
import type { OrganizacionEntity } from './activeCertificates';
import type { CertificadoDetailEntity } from './multisiteSampling';
import type { UserProfile } from './healthCheck';

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
  authorizedClientOrgIds: ReadonlyArray<string>
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
          (acc, o) => acc + (o.certificados_count ?? 0),
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
