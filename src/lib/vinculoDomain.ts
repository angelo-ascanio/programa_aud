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
import {
  assertCertificateCanGenerateAudits,
  hasCertificateActiveAlcance,
  validateVinculoCertificatesHaveAlcance,
  type AlcanceCertificadoEntity,
  type VinculoCertAlcanceCandidate,
} from './alcanceDomain';

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
  organizacion_abreviacion?: string | null;
  estatus: string;
  hasAlcance?: boolean;
  alcanceDetalle?: AlcanceCertificadoEntity | null;
  deleted_at?: string | null;
}

export interface CertificateCommitmentSummary {
  certificado: CertificadoDetailEntity;
  id_grupo_empresarial: string | null;
  grupo_nombre: string;
  status: CertCommitmentStatus;
  vinculo: VinculoEntity | null;
  hasAlcance: boolean;
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
  hasAlcance?: boolean;
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
      const hasAlcance =
        typeof c.hasAlcance === 'boolean'
          ? c.hasAlcance
          : hasCertificateActiveAlcance(c);
      const canGenerateAudits = validCong && status !== 'LIBRE' && hasAlcance;
      const blockReason = !validCong
        ? 'La organización requiere un Conglomerado activo en Certificación → Conglomerado.'
        : status === 'LIBRE' && !hasAlcance
        ? 'Certificado en estado Libre y sin Alcance activo: registre o comparta un Alcance y asígnelo a Individual o Vinculado antes de programar auditorías.'
        : status === 'LIBRE'
        ? 'Certificado en estado Libre: asígnelo a Individual o Vinculado antes de programar auditorías.'
        : !hasAlcance
        ? assertCertificateCanGenerateAudits(c).reason
        : null;
      return {
        certificado: c,
        id_grupo_empresarial: validCong && grupo ? grupo.id : null,
        grupo_nombre: validCong && grupo ? grupo.nombre : 'Sin conglomerado',
        status,
        vinculo: v,
        hasAlcance,
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
  if (!summary.hasAlcance) {
    return {
      allowed: false,
      reason:
        summary.blockReason ||
        assertCertificateCanGenerateAudits(summary.certificado).reason,
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
      .map((v) => {
        const visibleCerts = v.certificados.filter(
          (c) => !c.deleted_at && allowedCerts.has(c.id_certificado)
        );
        const hasUnassignedSibling = v.certificados.some(
          (c) => !c.deleted_at && !allowedCerts.has(c.id_certificado)
        );
        return {
          ...v,
          notas: hasUnassignedSibling ? null : v.notas,
          certificados: visibleCerts,
        };
      })
      .filter((v) => v.certificados.length > 0);
  }
  const allowedOrgs = new Set(authorizedClientOrgIds);
  return vinculos
    .map((v) => {
      const visibleCerts = v.certificados.filter(
        (c) => !c.deleted_at && allowedOrgs.has(c.id_organizacion)
      );
      const hasUnauthorizedSibling =
        v.nivel_vinculacion === 'NIVEL_2_INTER_ORG' ||
        v.certificados.some(
          (c) => !c.deleted_at && !allowedOrgs.has(c.id_organizacion)
        );
      return {
        ...v,
        notas: hasUnauthorizedSibling ? null : v.notas,
        certificados: visibleCerts,
      };
    })
    .filter((v) => v.certificados.length > 0);
}

export const INITIAL_VINCULOS: ReadonlyArray<VinculoEntity> = [
  {
    id: '25000000-0000-0000-0000-000000000001',
    id_grupo_empresarial: '20000000-0000-0000-0000-000000000001',
    grupo_nombre: 'Grupo Industrial Iberometal',
    codigo_vinculo: 'VINC-N1-01',
    etiqueta: 'Iberometal · Vínculo Integrado SGC',
    nivel_vinculacion: 'NIVEL_1_INTRA_ORG',
    tipo_vinculacion: 'Integrada',
    es_vinculada: true,
    tiene_sitio_temporal: true,
    notas: 'Vínculo principal de Grupo Industrial Iberometal con soporte de sitio temporal.',
    certificados: [
      {
        id: '26000000-0000-0000-0000-000000000001',
        id_vinculo: '25000000-0000-0000-0000-000000000001',
        id_certificado: '40000000-0000-0000-0000-000000000001',
        numero_certificado: 'FN-QMS-2024-001',
        norma_codigo: 'ISO 9001:2015',
        id_organizacion: '30000000-0000-0000-0000-000000000001',
        organizacion_nombre: 'Iberometal Componentes S.A.',
        estatus: 'ACTIVO',
        deleted_at: null,
      },
    ],
    deleted_at: null,
  },
  {
    id: '25000000-0000-0000-0000-000000000002',
    id_grupo_empresarial: '20000000-0000-0000-0000-000000000002',
    grupo_nombre: 'Corporación Petroquímica Andina',
    codigo_vinculo: 'VINC-IND-01',
    etiqueta: 'Petroquímica · Vínculo Individual SST',
    nivel_vinculacion: 'INDIVIDUAL',
    tipo_vinculacion: 'Individual',
    es_vinculada: false,
    tiene_sitio_temporal: false,
    notas: 'Compromiso individual para certificación ISO 45001.',
    certificados: [
      {
        id: '26000000-0000-0000-0000-000000000002',
        id_vinculo: '25000000-0000-0000-0000-000000000002',
        id_certificado: '40000000-0000-0000-0000-000000000002',
        numero_certificado: 'FN-OHS-2023-018',
        norma_codigo: 'ISO 45001:2018',
        id_organizacion: '30000000-0000-0000-0000-000000000002',
        organizacion_nombre: 'Petroquímica del Centro C.A.',
        estatus: 'ACTIVO',
        deleted_at: null,
      },
    ],
    deleted_at: null,
  },
];

export function createEmptyVinculoFormDraft(
  overrides?: Partial<VinculoFormDraft>
): VinculoFormDraft {
  return {
    id_grupo_empresarial: overrides?.id_grupo_empresarial ?? '',
    codigo_vinculo: overrides?.codigo_vinculo ?? '',
    etiqueta: overrides?.etiqueta ?? '',
    nivel_vinculacion: overrides?.nivel_vinculacion ?? 'INDIVIDUAL',
    tipo_vinculacion: overrides?.tipo_vinculacion ?? 'Individual',
    tiene_sitio_temporal: overrides?.tiene_sitio_temporal ?? false,
    notas: overrides?.notas ?? '',
    certificadoIds: overrides?.certificadoIds ? [...overrides.certificadoIds] : [],
  };
}

export function createVinculoDraftFromEntity(entity: VinculoEntity): VinculoFormDraft {
  return {
    id_grupo_empresarial: entity.id_grupo_empresarial,
    codigo_vinculo: entity.codigo_vinculo || '',
    etiqueta: entity.etiqueta,
    nivel_vinculacion: entity.nivel_vinculacion,
    tipo_vinculacion: entity.tipo_vinculacion,
    tiene_sitio_temporal: Boolean(entity.tiene_sitio_temporal),
    notas: entity.notas || '',
    certificadoIds: entity.certificados
      .filter((c) => !c.deleted_at)
      .map((c) => c.id_certificado),
  };
}

// =========================================================================
// Step 4.1 — Conglomerado-Centered Multi View & Grouping Boxes Domain Engine
// =========================================================================

export interface ConglomeradoVinculoNatureCount {
  tipo: AuditLinkNature;
  count: number;
}

export interface ConglomeradoVinculoSummary {
  id: string;
  conglomerado: ConglomeradoEntity;
  nombreConglomerado: string;
  codigoGrupo: string | null;
  organizaciones: OrganizacionEntity[];
  organizacionesCount: number;
  isMultiOrg: boolean;
  vinculos: VinculoEntity[];
  boxesCount: number;
  totalCertsCount: number;
  boxedCertsCount: number;
  freeCertsCount: number;
  activeNatures: AuditLinkNature[];
  natureCounts: ConglomeradoVinculoNatureCount[];
  natureSummary: string;
}

export interface BuildConglomeradoVinculoSummariesInput {
  conglomerados: ReadonlyArray<ConglomeradoEntity>;
  organizaciones: ReadonlyArray<OrganizacionEntity>;
  certificados: ReadonlyArray<SoftDeletableCertificado>;
  vinculos: ReadonlyArray<VinculoEntity>;
  auditPrograms?: ReadonlyArray<ProgramaAuditoriaEntity>;
  profile?: UserProfile | null;
  authorizedClientOrgIds?: ReadonlyArray<string>;
  assignedAuditCertIds?: ReadonlyArray<string>;
}

export interface VinculoBoxCertMemberRef {
  id_certificado: string;
  id_organizacion: string;
  norma_codigo: string;
}

export interface InferredBoxClassification {
  recommendedNivel: AuditLinkLevel;
  recommendedTipo: AuditLinkNature;
  esVinculada: boolean;
  needsUpdate: boolean;
  suggestionMessage: string | null;
}

export interface VinculoCoherenceResolution {
  valid: boolean;
  errorMessage: string | null;
  nivel_vinculacion: AuditLinkLevel;
  tipo_vinculacion: AuditLinkNature;
  es_vinculada: boolean;
}

export type BoxTransferTarget =
  | { kind: 'LIBRE' }
  | { kind: 'NEW_INDIVIDUAL' }
  | { kind: 'EXISTING_BOX'; vinculoId: string };

export interface BoxTransferPlanInput {
  certId: string;
  conglomeradoId: string;
  sourceVinculoId: string | null;
  target: BoxTransferTarget;
  vinculos: ReadonlyArray<VinculoEntity>;
  certificados: ReadonlyArray<SoftDeletableCertificado>;
  organizaciones: ReadonlyArray<OrganizacionEntity>;
  auditPrograms: ReadonlyArray<ProgramaAuditoriaEntity>;
  audits?: ReadonlyArray<ProgramacionAuditEntity>;
  programacionAudits?: ReadonlyArray<ProgramacionAuditEntity>;
}

export interface BoxTransferPlanResult {
  allowed: boolean;
  errorMessage: string | null;
  certId: string;
  sourceVinculoId: string | null;
  target: BoxTransferTarget;
  sourceWillBecomeEmpty: boolean;
  sourceNextClassification: InferredBoxClassification | null;
  targetNextClassification: InferredBoxClassification | null;
}

const NATURE_PLURAL_LABELS: Record<AuditLinkNature, { singular: string; plural: string }> = {
  Individual: { singular: 'Individual', plural: 'Individuales' },
  Combinada: { singular: 'Combinada', plural: 'Combinadas' },
  Integrada: { singular: 'Integrada', plural: 'Integradas' },
  Conjunta: { singular: 'Conjunta', plural: 'Conjuntas' },
  'Simultánea': { singular: 'Simultánea', plural: 'Simultáneas' },
  Multientidad: { singular: 'Multientidad', plural: 'Multientidades' },
  Mixta: { singular: 'Mixta', plural: 'Mixtas' },
};

export function formatBoxNatureSummary(
  vinculos: ReadonlyArray<VinculoEntity>
): {
  activeNatures: AuditLinkNature[];
  natureCounts: ConglomeradoVinculoNatureCount[];
  summaryText: string;
} {
  const activeBoxes = vinculos.filter((v) => !v.deleted_at);
  if (activeBoxes.length === 0) {
    return {
      activeNatures: [],
      natureCounts: [],
      summaryText: 'Sin cajas configuradas',
    };
  }

  const countMap = new Map<AuditLinkNature, number>();
  for (const box of activeBoxes) {
    countMap.set(box.tipo_vinculacion, (countMap.get(box.tipo_vinculacion) || 0) + 1);
  }

  const natureCounts: ConglomeradoVinculoNatureCount[] = Array.from(countMap.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
    .map(([tipo, count]) => ({ tipo, count }));

  const activeNatures = natureCounts.map((item) => item.tipo);
  const summaryText = natureCounts
    .map(({ tipo, count }) => {
      const labels = NATURE_PLURAL_LABELS[tipo] || { singular: tipo, plural: tipo };
      return `${count} ${count === 1 ? labels.singular : labels.plural}`;
    })
    .join(' · ');

  return { activeNatures, natureCounts, summaryText };
}

export function buildConglomeradoVinculoSummaries(
  input: BuildConglomeradoVinculoSummariesInput
): ConglomeradoVinculoSummary[] {
  const {
    conglomerados,
    organizaciones,
    certificados,
    vinculos,
    auditPrograms = [],
    profile,
    authorizedClientOrgIds = [],
    assignedAuditCertIds = [],
  } = input;
  void auditPrograms;

  const hasProfile = profile !== undefined;
  if (hasProfile && (!profile || profile.status !== 'APPROVED')) {
    return [];
  }

  const isClient = hasProfile && profile?.role === 'CLIENT';
  const isAuditor = hasProfile && profile?.role === 'AUDITOR';
  const allowedClientOrgSet = new Set(authorizedClientOrgIds);
  const allowedAuditorCertSet = new Set(assignedAuditCertIds);

  const activeOrgs = organizaciones.filter((o) => {
    if (o.deleted_at) return false;
    if (isClient) return allowedClientOrgSet.has(o.id);
    return true;
  });

  const activeCerts = certificados.filter((c) => {
    if (c.deleted_at) return false;
    if (isClient) return allowedClientOrgSet.has(c.id_organizacion);
    if (isAuditor) return allowedAuditorCertSet.has(c.id);
    return true;
  });

  const activeCertIds = new Set(activeCerts.map((c) => c.id));
  const orgIdsWithVisibleCertsForAuditor = new Set(
    activeCerts.map((c) => c.id_organizacion)
  );

  const scopedVinculos = hasProfile && profile
    ? scopeVinculosForProfile(
        vinculos.filter((v) => !v.deleted_at),
        profile,
        authorizedClientOrgIds,
        assignedAuditCertIds
      )
    : vinculos
        .filter((v) => !v.deleted_at)
        .map((v) => ({
          ...v,
          certificados: v.certificados.filter((c) => !c.deleted_at),
        }));

  const orgsByCong = new Map<string, OrganizacionEntity[]>();
  for (const org of activeOrgs) {
    if (!org.id_grupo_empresarial) continue;
    if (isAuditor && !orgIdsWithVisibleCertsForAuditor.has(org.id)) continue;
    const list = orgsByCong.get(org.id_grupo_empresarial) || [];
    list.push(org);
    orgsByCong.set(org.id_grupo_empresarial, list);
  }

  const vinculosByCong = new Map<string, VinculoEntity[]>();
  for (const v of scopedVinculos) {
    if (v.deleted_at) continue;
    const list = vinculosByCong.get(v.id_grupo_empresarial) || [];
    list.push(v);
    vinculosByCong.set(v.id_grupo_empresarial, list);
  }

  const summaries: ConglomeradoVinculoSummary[] = [];

  for (const cong of conglomerados) {
    if (cong.deleted_at) continue;

    const congOrgs = (orgsByCong.get(cong.id) || [])
      .slice()
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    const congBoxes = vinculosByCong.get(cong.id) || [];

    if (isClient && congOrgs.length === 0) continue;
    if (isAuditor && congOrgs.length === 0 && congBoxes.length === 0) continue;

    const congOrgIds = new Set(congOrgs.map((o) => o.id));
    const congCerts = activeCerts.filter((c) => congOrgIds.has(c.id_organizacion));

    const boxedCertIdSet = new Set<string>();
    for (const box of congBoxes) {
      for (const member of box.certificados) {
        if (!member.deleted_at && activeCertIds.has(member.id_certificado)) {
          boxedCertIdSet.add(member.id_certificado);
        }
      }
    }

    const totalCertsCount = congCerts.length;
    const boxedCertsCount = congCerts.filter((c) => boxedCertIdSet.has(c.id)).length;
    const freeCertsCount = Math.max(0, totalCertsCount - boxedCertsCount);
    const { activeNatures, natureCounts, summaryText } =
      formatBoxNatureSummary(congBoxes);

    summaries.push({
      id: cong.id,
      conglomerado: cong,
      nombreConglomerado: cong.nombre,
      codigoGrupo: cong.codigo_grupo,
      organizaciones: congOrgs,
      organizacionesCount: congOrgs.length,
      isMultiOrg: !cong.es_individual_auto || congOrgs.length > 1,
      vinculos: congBoxes,
      boxesCount: congBoxes.length,
      totalCertsCount,
      boxedCertsCount,
      freeCertsCount,
      activeNatures,
      natureCounts,
      natureSummary: summaryText,
    });
  }

  return summaries.sort((a, b) => {
    if (b.freeCertsCount !== a.freeCertsCount) {
      return b.freeCertsCount - a.freeCertsCount;
    }
    return a.nombreConglomerado.localeCompare(b.nombreConglomerado, 'es');
  });
}

export function inferVinculoBoxClassification(opts: {
  currentNivel: AuditLinkLevel;
  currentTipo: AuditLinkNature;
  certs: ReadonlyArray<VinculoBoxCertMemberRef>;
}): InferredBoxClassification {
  const { currentNivel, currentTipo, certs } = opts;

  if (certs.length === 0) {
    return {
      recommendedNivel: currentNivel,
      recommendedTipo: currentTipo,
      esVinculada: currentNivel !== 'INDIVIDUAL',
      needsUpdate: false,
      suggestionMessage: null,
    };
  }

  if (certs.length === 1) {
    const needsUpdate =
      currentNivel !== 'INDIVIDUAL' || currentTipo !== 'Individual';
    return {
      recommendedNivel: 'INDIVIDUAL',
      recommendedTipo: 'Individual',
      esVinculada: false,
      needsUpdate,
      suggestionMessage: needsUpdate
        ? 'Esta caja contiene 1 solo certificado; puede ajustarla a Individual si no agrupará más certificados.'
        : null,
    };
  }

  const uniqueOrgs = new Set(certs.map((c) => c.id_organizacion));
  const uniqueNorms = new Set(
    certs.map((c) => c.norma_codigo.trim().toLowerCase()).filter(Boolean)
  );
  const isInterOrg = uniqueOrgs.size >= 2;
  const recommendedNivel: AuditLinkLevel = isInterOrg
    ? 'NIVEL_2_INTER_ORG'
    : 'NIVEL_1_INTRA_ORG';

  let recommendedTipo: AuditLinkNature;
  if (currentTipo !== 'Individual') {
    recommendedTipo = currentTipo;
  } else if (uniqueNorms.size >= 2) {
    recommendedTipo = 'Combinada';
  } else if (isInterOrg) {
    recommendedTipo = 'Multientidad';
  } else {
    recommendedTipo = 'Integrada';
  }

  const needsUpdate =
    currentNivel !== recommendedNivel || currentTipo !== recommendedTipo;

  let suggestionMessage: string | null = null;
  if (needsUpdate) {
    suggestionMessage = isInterOrg
      ? `Agrupa ${certs.length} certificados de ${uniqueOrgs.size} organizaciones distintas; se sugiere Nivel 2 (${recommendedTipo}).`
      : `Agrupa ${certs.length} certificados en la misma organización; se sugiere Nivel 1 (${recommendedTipo}).`;
  }

  return {
    recommendedNivel,
    recommendedTipo,
    esVinculada: true,
    needsUpdate,
    suggestionMessage,
  };
}

export function resolveVinculoCoherenceForSave(opts: {
  requestedTipo: AuditLinkNature;
  certs: ReadonlyArray<VinculoBoxCertMemberRef>;
}): VinculoCoherenceResolution {
  const { requestedTipo, certs } = opts;

  if (requestedTipo === 'Individual') {
    if (certs.length > 1) {
      return {
        valid: false,
        errorMessage:
          'Una caja con naturaleza Individual admite como máximo 1 certificado activo.',
        nivel_vinculacion: 'INDIVIDUAL',
        tipo_vinculacion: 'Individual',
        es_vinculada: false,
      };
    }
    return {
      valid: true,
      errorMessage: null,
      nivel_vinculacion: 'INDIVIDUAL',
      tipo_vinculacion: 'Individual',
      es_vinculada: false,
    };
  }

  const uniqueOrgs = new Set(certs.map((c) => c.id_organizacion));
  const nivel_vinculacion: AuditLinkLevel =
    uniqueOrgs.size >= 2 || requestedTipo === 'Multientidad'
      ? 'NIVEL_2_INTER_ORG'
      : 'NIVEL_1_INTRA_ORG';

  return {
    valid: true,
    errorMessage: null,
    nivel_vinculacion,
    tipo_vinculacion: requestedTipo,
    es_vinculada: true,
  };
}

export function validateVinculoBoxMetadataDraft(opts: {
  etiqueta: string;
  tipo_vinculacion: AuditLinkNature;
  tiene_sitio_temporal?: boolean;
  notas?: string;
  certs: ReadonlyArray<VinculoBoxCertMemberRef>;
}): VinculoCoherenceResolution {
  if (!opts.etiqueta || opts.etiqueta.trim().length < 2) {
    return {
      valid: false,
      errorMessage: 'La etiqueta de la caja debe tener al menos 2 caracteres.',
      nivel_vinculacion: 'INDIVIDUAL',
      tipo_vinculacion: opts.tipo_vinculacion,
      es_vinculada: opts.tipo_vinculacion !== 'Individual',
    };
  }

  return resolveVinculoCoherenceForSave({
    requestedTipo: opts.tipo_vinculacion,
    certs: opts.certs,
  });
}

export function validateBoxTransferPlan(
  input: BoxTransferPlanInput
): BoxTransferPlanResult {
  const {
    certId,
    conglomeradoId,
    sourceVinculoId,
    target,
    vinculos,
    certificados,
    organizaciones,
    auditPrograms,
  } = input;
  const audits = input.programacionAudits ?? input.audits ?? [];

  const fail = (errorMessage: string): BoxTransferPlanResult => ({
    allowed: false,
    errorMessage,
    certId,
    sourceVinculoId,
    target,
    sourceWillBecomeEmpty: false,
    sourceNextClassification: null,
    targetNextClassification: null,
  });

  if (!isValidUuid(certId) || !isValidUuid(conglomeradoId)) {
    return fail('Identificador inválido para reubicar el certificado.');
  }

  const cert = certificados.find((c) => !c.deleted_at && c.id === certId);
  if (!cert) {
    return fail('El certificado seleccionado no existe o fue archivado.');
  }

  const org = organizaciones.find(
    (o) => !o.deleted_at && o.id === cert.id_organizacion
  );
  if (!org || org.id_grupo_empresarial !== conglomeradoId) {
    return fail(
      `El certificado ${cert.numero_certificado} no pertenece a una organización activa de este conglomerado.`
    );
  }

  const activeBoxes = vinculos.filter((v) => !v.deleted_at);
  const currentBoxesWithCert = activeBoxes.filter((v) =>
    v.certificados.some((vc) => !vc.deleted_at && vc.id_certificado === certId)
  );

  if (!sourceVinculoId) {
    if (currentBoxesWithCert.length > 0) {
      return fail(
        `El certificado ${cert.numero_certificado} ya pertenece a la caja «${currentBoxesWithCert[0].etiqueta}» y no puede asignarse a dos cajas simultáneamente.`
      );
    }
    if (target.kind === 'LIBRE') {
      return fail(`El certificado ${cert.numero_certificado} ya se encuentra en LIBRE.`);
    }
  } else {
    if (!isValidUuid(sourceVinculoId)) {
      return fail('La caja origen seleccionada no es válida.');
    }
    const sourceBox = activeBoxes.find((v) => v.id === sourceVinculoId);
    if (!sourceBox || sourceBox.id_grupo_empresarial !== conglomeradoId) {
      return fail('La caja origen ya no está disponible en este conglomerado.');
    }
    const isInSource = sourceBox.certificados.some(
      (vc) => !vc.deleted_at && vc.id_certificado === certId
    );
    if (!isInSource) {
      return fail(
        `El certificado ${cert.numero_certificado} ya no forma parte de la caja origen.`
      );
    }
    if (target.kind === 'EXISTING_BOX' && target.vinculoId === sourceVinculoId) {
      return fail(
        `El certificado ${cert.numero_certificado} ya está asignado dentro de esta caja.`
      );
    }

    const detachCheck = canDetachCertificateFromVinculo(
      certId,
      sourceVinculoId,
      auditPrograms,
      audits
    );
    if (!detachCheck.allowed) {
      return fail(
        detachCheck.reason ||
          `No se puede mover ${cert.numero_certificado}: tiene auditorías activas en esta caja.`
      );
    }
  }

  let sourceWillBecomeEmpty = false;
  let sourceNextClassification: InferredBoxClassification | null = null;
  if (sourceVinculoId) {
    const sourceBox = activeBoxes.find((v) => v.id === sourceVinculoId)!;
    const remainingRefs: VinculoBoxCertMemberRef[] = sourceBox.certificados
      .filter((vc) => !vc.deleted_at && vc.id_certificado !== certId)
      .map((vc) => ({
        id_certificado: vc.id_certificado,
        id_organizacion: vc.id_organizacion,
        norma_codigo: vc.norma_codigo,
      }));
    sourceWillBecomeEmpty = remainingRefs.length === 0;
    sourceNextClassification =
      remainingRefs.length > 0
        ? inferVinculoBoxClassification({
            currentNivel: sourceBox.nivel_vinculacion,
            currentTipo: sourceBox.tipo_vinculacion,
            certs: remainingRefs,
          })
        : null;
  }

  let targetNextClassification: InferredBoxClassification | null = null;
  if (target.kind === 'EXISTING_BOX') {
    if (!isValidUuid(target.vinculoId)) {
      return fail('Seleccione una caja destino válida.');
    }
    const targetBox = activeBoxes.find((v) => v.id === target.vinculoId);
    if (!targetBox || targetBox.id_grupo_empresarial !== conglomeradoId) {
      return fail('La caja destino seleccionada no pertenece a este conglomerado.');
    }
    const alreadyInTarget = targetBox.certificados.some(
      (vc) => !vc.deleted_at && vc.id_certificado === certId
    );
    if (alreadyInTarget) {
      return fail(
        `El certificado ${cert.numero_certificado} ya pertenece a la caja destino.`
      );
    }

    const nextTargetRefs: VinculoBoxCertMemberRef[] = [
      ...targetBox.certificados
        .filter((vc) => !vc.deleted_at)
        .map((vc) => ({
          id_certificado: vc.id_certificado,
          id_organizacion: vc.id_organizacion,
          norma_codigo: vc.norma_codigo,
        })),
      {
        id_certificado: cert.id,
        id_organizacion: cert.id_organizacion,
        norma_codigo: cert.norma_codigo,
      },
    ];

    targetNextClassification = inferVinculoBoxClassification({
      currentNivel: targetBox.nivel_vinculacion,
      currentTipo: targetBox.tipo_vinculacion,
      certs: nextTargetRefs,
    });
  }

  return {
    allowed: true,
    errorMessage: null,
    certId,
    sourceVinculoId,
    target,
    sourceWillBecomeEmpty,
    sourceNextClassification,
    targetNextClassification,
  };
}

export function canArchiveVinculoBox(
  box: VinculoEntity,
  auditPrograms: ReadonlyArray<ProgramaAuditoriaEntity>,
  programacionAudits: ReadonlyArray<ProgramacionAuditEntity>
): { allowed: boolean; reason: string | null } {
  const activeMembers = box.certificados.filter((c) => !c.deleted_at);
  if (activeMembers.length > 0) {
    return {
      allowed: false,
      reason: `No se puede archivar la caja «${box.etiqueta}» mientras contenga ${activeMembers.length} certificado(s). Muévalos o devuélvalos a LIBRE primero.`,
    };
  }

  const linkedPrograms = new Set(
    auditPrograms
      .filter((p) => !p.deleted_at && p.id_vinculo === box.id)
      .map((p) => p.id)
  );
  const activeAudit = programacionAudits.find((a) => {
    if (a.deleted_at) return false;
    if (!a.id_programa_auditoria || !linkedPrograms.has(a.id_programa_auditoria)) {
      return false;
    }
    const cycleState = a.estado_ciclo || 'Borrador';
    return !DETACH_ALLOWED_AUDIT_STATES.has(cycleState);
  });

  if (activeAudit) {
    return {
      allowed: false,
      reason: `No se puede archivar la caja «${box.etiqueta}» porque tiene la auditoría ${activeAudit.codigo_auditoria} activa.`,
    };
  }

  return { allowed: true, reason: null };
}

export interface VinculoBoxAlcanceGateResult {
  hasAlcance: boolean;
  canGenerateAudits: boolean;
  missingCertLabels: string[];
  reason: string | null;
}

/**
 * Evaluates whether a Vínculo box has >=1 active certificate and every member
 * certificate possesses an active `Alcance` (`Certificación → Certificado → Alcance`).
 */
export function evaluateVinculoBoxAlcanceGate(
  box: VinculoEntity,
  certificados: ReadonlyArray<SoftDeletableCertificado>,
  organizaciones: ReadonlyArray<OrganizacionEntity> = []
): VinculoBoxAlcanceGateResult {
  const activeMembers = box.certificados.filter((c) => !c.deleted_at);
  if (activeMembers.length === 0) {
    return {
      hasAlcance: false,
      canGenerateAudits: false,
      missingCertLabels: [],
      reason:
        'La caja agrupadora está vacía: asigne al menos un certificado con Alcance activo antes de generar una auditoría.',
    };
  }

  const orgAbrevById = new Map<string, string>();
  for (const org of organizaciones) {
    if (!org.deleted_at && org.abreviacion) {
      orgAbrevById.set(org.id, org.abreviacion);
    }
  }

  const candidates: VinculoCertAlcanceCandidate[] = certificados
    .filter((c) => !c.deleted_at)
    .map((c) => ({
      ...c,
      organizacion_abreviacion:
        c.organizacion_abreviacion ?? orgAbrevById.get(c.id_organizacion) ?? null,
    }));

  const enrichedMembers = activeMembers.map((m) => ({
    ...m,
    organizacion_abreviacion:
      m.organizacion_abreviacion ?? orgAbrevById.get(m.id_organizacion) ?? null,
  }));

  const gate = validateVinculoCertificatesHaveAlcance(enrichedMembers, candidates);
  if (!gate.allowed) {
    const missingCertLabels = (gate.missingCerts ?? []).map((mc) =>
      mc.abreviacion ? `${mc.numero_certificado} (${mc.abreviacion})` : mc.numero_certificado
    );
    return {
      hasAlcance: false,
      canGenerateAudits: false,
      missingCertLabels,
      reason:
        gate.reason ||
        'Uno o más certificados de este vínculo no poseen un Alcance activo. Defina o comparta el Alcance en Certificación → Certificado → Alcance.',
    };
  }

  return {
    hasAlcance: true,
    canGenerateAudits: true,
    missingCertLabels: [],
    reason: null,
  };
}


