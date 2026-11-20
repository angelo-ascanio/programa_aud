/**
 * Step 2.2 — Vínculo (`vinculo` + `vinculo_certificado`) Pure Commitment Domain Engine
 *
 * Strictly typed (`strict: true`, 0 `any` / `as any`) and Zero-UUID compliant
 * in all user-facing labels and validation errors.
 */

import { assertValidUuid, isValidUuid } from './zeroUuid';
import type { OrganizacionEntity } from './activeCertificates';
import type { CertificadoDetailEntity } from './multisiteSampling';
import type {
  AuditLinkLevel,
  AuditLinkNature,
  ProgramaAuditoriaEntity,
} from './auditPlanningEngine';
import type { ProgramacionAuditEntity } from './auditExecution';
import {
  hasOrganizationValidConglomerado,
  type ConglomeradoEntity,
} from './conglomeradoDomain';
import type { UserProfile } from './healthCheck';

export type CertCommitmentStatus = 'LIBRE' | 'INDIVIDUAL' | 'VINCULADO';

export interface VinculoEntity {
  id: string;
  id_grupo_empresarial: string;
  grupo_nombre?: string;
  codigo_vinculo: string | null;
  etiqueta: string;
  nivel_vinculacion: AuditLinkLevel;
  tipo_vinculacion: AuditLinkNature;
  es_vinculada: boolean;
  tiene_sitio_temporal: boolean;
  notas: string | null;
  certificados: VinculoCertificadoItem[];
  deleted_at?: string | null;
  deleted_by?: string | null;
  delete_reason?: string | null;
}

export interface VinculoCertificadoItem {
  id: string;
  id_vinculo: string;
  id_certificado: string;
  numero_certificado: string;
  norma_codigo: string;
  id_organizacion: string;
  organizacion_nombre: string;
  estatus: string;
  deleted_at?: string | null;
}

export interface CertificateCommitmentSummary {
  certificado: CertificadoDetailEntity;
  id_grupo_empresarial: string | null;
  grupo_nombre: string;
  status: CertCommitmentStatus;
  vinculo: VinculoEntity | null;
  canGenerateAudits: boolean;
  blockReason: string | null;
}

export interface VinculoFormDraft {
  id_grupo_empresarial: string;
  codigo_vinculo: string;
  etiqueta: string;
  nivel_vinculacion: AuditLinkLevel;
  tipo_vinculacion: AuditLinkNature;
  tiene_sitio_temporal: boolean;
  notas: string;
  certificadoIds: string[];
}

const DETACH_ALLOWED_AUDIT_STATES: ReadonlySet<string> = new Set([
  'Cerrada',
  'Cancelada',
  'Auditada',
]);

export function getCommitmentStatusLabel(status: CertCommitmentStatus): {
  label: string;
  badgeClass: string;
} {
  switch (status) {
    case 'VINCULADO':
      return {
        label: 'Vinculado',
        badgeClass: 'bg-violet-50 text-violet-800 border-violet-200',
      };
    case 'INDIVIDUAL':
      return {
        label: 'Individual',
        badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
      };
    default:
      return {
        label: 'Libre',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-300',
      };
  }
}

export type SoftDeletableCertificado = CertificadoDetailEntity & {
  deleted_at?: string | null;
};

export function computeCertificateCommitmentSummaries(
  certificados: ReadonlyArray<SoftDeletableCertificado>,
  organizaciones: ReadonlyArray<OrganizacionEntity>,
  conglomerados: ReadonlyArray<ConglomeradoEntity>,
  vinculos: ReadonlyArray<VinculoEntity>
): CertificateCommitmentSummary[] {
  const orgById = new Map(
    organizaciones.filter((o) => !o.deleted_at).map((o) => [o.id, o])
  );
  const congById = new Map(
    conglomerados.filter((g) => !g.deleted_at).map((g) => [g.id, g])
  );
  const vinculoByCertId = new Map<string, VinculoEntity>();

  for (const v of vinculos) {
    if (v.deleted_at) continue;
    for (const item of v.certificados) {
      if (!item.deleted_at) {
        vinculoByCertId.set(item.id_certificado, v);
      }
    }
  }

  return certificados
    .filter((c) => !c.deleted_at)
    .map((c) => {
      const org = orgById.get(c.id_organizacion);
      const validCong = hasOrganizationValidConglomerado(org, conglomerados);
      const grupo =
        org && org.id_grupo_empresarial
          ? congById.get(org.id_grupo_empresarial)
          : undefined;
      const v = vinculoByCertId.get(c.id) || null;
      const status: CertCommitmentStatus = !v
        ? 'LIBRE'
        : v.es_vinculada
        ? 'VINCULADO'
        : 'INDIVIDUAL';
      const canGenerateAudits = validCong && status !== 'LIBRE';
      const blockReason = !validCong
        ? 'La organización requiere un Conglomerado activo en Certificación → Conglomerado.'
        : status === 'LIBRE'
        ? 'Certificado en estado Libre: asígnelo a Individual o Vinculado antes de programar auditorías.'
        : null;
      return {
        certificado: c,
        id_grupo_empresarial: validCong && grupo ? grupo.id : null,
        grupo_nombre: validCong && grupo ? grupo.nombre : 'Sin conglomerado',
        status,
        vinculo: v,
        canGenerateAudits,
        blockReason,
      };
    });
}

export function canCertificateEnterDesignacion(
  summary: CertificateCommitmentSummary
): { allowed: boolean; reason: string | null } {
  if (!summary.id_grupo_empresarial) {
    return {
      allowed: false,
      reason:
        summary.blockReason ||
        'La organización requiere un Conglomerado activo en Certificación → Conglomerado.',
    };
  }
  if (summary.status === 'LIBRE' || !summary.canGenerateAudits) {
    return {
      allowed: false,
      reason:
        summary.blockReason ||
        'Certificado en estado Libre: asígnelo a Individual o Vinculado antes de programar auditorías.',
    };
  }
  return { allowed: true, reason: null };
}

export function filterFreeCertificatesInConglomerado(
  summaries: ReadonlyArray<CertificateCommitmentSummary>,
  grupoId?: string | null
): CertificateCommitmentSummary[] {
  return summaries.filter(
    (s) =>
      s.status === 'LIBRE' &&
      s.id_grupo_empresarial !== null &&
      (!grupoId || s.id_grupo_empresarial === grupoId)
  );
}

export function validateVinculoFormDraft(
  draft: VinculoFormDraft,
  existingVinculos: ReadonlyArray<VinculoEntity>,
  certificados: ReadonlyArray<SoftDeletableCertificado>,
  organizaciones: ReadonlyArray<OrganizacionEntity>,
  editingVinculoId?: string | null
): string | null {
  if (!isValidUuid(draft.id_grupo_empresarial)) {
    return 'Seleccione un conglomerado válido para configurar el vínculo.';
  }
  assertValidUuid(draft.id_grupo_empresarial, 'conglomerado');

  if (!draft.etiqueta.trim() || draft.etiqueta.trim().length < 2) {
    return 'La etiqueta del vínculo debe tener al menos 2 caracteres.';
  }

  if (draft.certificadoIds.length === 0) {
    return 'Debe asociar al menos un certificado al vínculo.';
  }

  const seenCertIds = new Set<string>();
  for (const certId of draft.certificadoIds) {
    assertValidUuid(certId, 'certificado');
    if (seenCertIds.has(certId)) {
      return 'No se permite duplicar el mismo certificado dentro de un vínculo.';
    }
    seenCertIds.add(certId);
  }

  if (draft.nivel_vinculacion === 'INDIVIDUAL') {
    if (draft.certificadoIds.length !== 1) {
      return 'Un vínculo Individual debe contener exactamente 1 certificado.';
    }
    if (draft.tipo_vinculacion !== 'Individual') {
      return 'El tipo de vinculación debe ser Individual cuando el nivel es Individual.';
    }
  } else {
    if (draft.certificadoIds.length < 2) {
      return 'Un vínculo agrupado requiere al menos 2 certificados.';
    }
    if (draft.tipo_vinculacion === 'Individual') {
      return 'Seleccione una naturaleza de vinculación grupal (Combinada, Integrada, Conjunta, Simultánea, Multientidad o Mixta).';
    }
  }

  const orgById = new Map(
    organizaciones.filter((o) => !o.deleted_at).map((o) => [o.id, o])
  );
  const certById = new Map(
    certificados.filter((c) => !c.deleted_at).map((c) => [c.id, c])
  );
  const orgIds = new Set<string>();

  for (const cid of draft.certificadoIds) {
    const cert = certById.get(cid);
    const org = cert ? orgById.get(cert.id_organizacion) : undefined;
    if (!cert || !org) {
      return 'Uno de los certificados seleccionados ya no está activo.';
    }
    if (org.id_grupo_empresarial !== draft.id_grupo_empresarial) {
      return `El certificado ${cert.numero_certificado} pertenece a otro conglomerado y no puede vincularse aquí.`;
    }
    orgIds.add(org.id);
  }

  if (draft.nivel_vinculacion === 'NIVEL_1_INTRA_ORG' && orgIds.size > 1) {
    return 'Un vínculo Nivel 1 (Intra-Organizacional) solo admite certificados de la misma organización.';
  }

  const busyCert = existingVinculos
    .filter((v) => !v.deleted_at && v.id !== editingVinculoId)
    .flatMap((v) => v.certificados.filter((vc) => !vc.deleted_at))
    .find((vc) => seenCertIds.has(vc.id_certificado));
  if (busyCert) {
    return `El certificado ${busyCert.numero_certificado} ya pertenece a otro vínculo activo. Desvincúlelo primero.`;
  }

  return null;
}

export function canDetachCertificateFromVinculo(
  certId: string,
  vinculoId: string,
  programs: ReadonlyArray<ProgramaAuditoriaEntity>,
  audits: ReadonlyArray<ProgramacionAuditEntity>
): { allowed: boolean; reason: string | null } {
  const relatedPrograms = new Set(
    programs
      .filter((p) => !p.deleted_at && p.id_vinculo === vinculoId)
      .map((p) => p.id)
  );
  const blockingAudit = audits.find((a) => {
    if (a.deleted_at || a.id_certificado !== certId) return false;
    if (!a.id_programa_auditoria || !relatedPrograms.has(a.id_programa_auditoria)) {
      return false;
    }
    const cycleState = a.estado_ciclo || 'Borrador';
    return !DETACH_ALLOWED_AUDIT_STATES.has(cycleState);
  });
  if (blockingAudit) {
    const cycleLabel = blockingAudit.estado_ciclo || 'Borrador';
    return {
      allowed: false,
      reason: `No se puede desvincular ${blockingAudit.numero_certificado}: tiene la auditoría ${blockingAudit.codigo_auditoria} en estado ${cycleLabel}.`,
    };
  }
  return { allowed: true, reason: null };
}

export function scopeVinculosForProfile(
  vinculos: ReadonlyArray<VinculoEntity>,
  profile: UserProfile | null,
  authorizedClientOrgIds: ReadonlyArray<string>,
  assignedAuditCertIds: ReadonlyArray<string>
): VinculoEntity[] {
  if (!profile || profile.status !== 'APPROVED') return [];
  if (profile.role === 'ADMIN' || profile.role === 'WORKER') {
    return vinculos.slice();
  }
  if (profile.role === 'AUDITOR') {
    const allowedCerts = new Set(assignedAuditCertIds);
    return vinculos
      .map((v) => ({
        ...v,
        certificados: v.certificados.filter(
          (c) => !c.deleted_at && allowedCerts.has(c.id_certificado)
        ),
      }))
      .filter((v) => v.certificados.length > 0);
  }
  const allowedOrgs = new Set(authorizedClientOrgIds);
  return vinculos
    .map((v) => ({
      ...v,
      certificados: v.certificados.filter(
        (c) => !c.deleted_at && allowedOrgs.has(c.id_organizacion)
      ),
    }))
    .filter((v) => v.certificados.length > 0);
}
