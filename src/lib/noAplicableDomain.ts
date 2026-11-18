/**
 * Step 4.1: Requisitos No Aplicables Domain Module (`requisitos_no_aplicables_certificado`)
 * ISO/IEC 17021-1:2015 & ISO 9001:2015 Cláusula 4.3 Exclusions Management.
 * Pure TypeScript domain contracts, dynamic Norma clause filtering, and Zero-UUID resolution.
 */

import { containsRawUuid } from './breadcrumb';
import type { RequisitoLtree } from './extraDomain';
import type { CertificadoDetailEntity } from './multisiteSampling';
import { getAllSeededNormaRequirements, getScopedNormaRequirements } from './procesoDomain';

export type NoAplicableDetailMode = 'read' | 'add' | 'edit';

export interface NoAplicableFormDraft {
  id_certificado: string;
  id_requisito: string;
  justificacion: string;
}

export interface NoAplicableViewState {
  selectedNoAplicableId: string | null;
  originatingCertId: string | null;
  isCreating?: boolean;
  isEditingAttributes?: boolean;
  formDraft?: NoAplicableFormDraft;
  editErrorMessage?: string | null;
  archiveConfirmOpen?: boolean;
  archiveErrorMessage?: string | null;
}

export interface NoAplicableDetailEntity {
  id: string;
  id_certificado: string;
  numero_certificado: string;
  certificado_estatus: string;
  id_organizacion: string;
  organizacion_nombre: string;
  organizacion_rif: string;
  id_norma: string;
  norma_codigo: string;
  norma_titulo: string;
  id_requisito: string;
  requisito_codigo: string;
  requisito_titulo: string;
  requisito_descripcion?: string;
  ruta_materializada: string;
  justificacion: string;
  deleted_at: string | null;
}

export interface NoAplicableValidationResult {
  valid: boolean;
  error?: string;
  normalized?: {
    id_certificado: string;
    id_requisito: string;
    justificacion: string;
    requisito_codigo: string;
    requisito_titulo: string;
    ruta_materializada: string;
  };
}

export const NO_APLICABLE_JUSTIFICACION_MIN_LENGTH = 15;
export const NO_APLICABLE_JUSTIFICACION_MAX_LENGTH = 2000;

export function createEmptyNoAplicableFormDraft(
  prefillCertId?: string | null
): NoAplicableFormDraft {
  return {
    id_certificado: (prefillCertId || '').trim(),
    id_requisito: '',
    justificacion: '',
  };
}

export function createNoAplicableFormDraftFromEntity(
  entity: NoAplicableDetailEntity
): NoAplicableFormDraft {
  return {
    id_certificado: entity.id_certificado || '',
    id_requisito: entity.id_requisito || '',
    justificacion: entity.justificacion || '',
  };
}

export function resolveNoAplicableDetailMode(
  state: Pick<NoAplicableViewState, 'isCreating' | 'isEditingAttributes'>,
  isStaff: boolean,
  selectedEntity?: NoAplicableDetailEntity | null
): NoAplicableDetailMode {
  if (!isStaff) return 'read';
  if (state.isCreating) return 'add';
  if (selectedEntity && state.isEditingAttributes) return 'edit';
  return 'read';
}

/**
 * Resolves the active requirements catalog scoped strictly to the selected certificate's Norma,
 * excluding clauses already declared as non-applicable on that certificate (unless editing that exact record).
 */
export function filterRequisitosForCertificado(params: {
  certId: string;
  certificates: ReadonlyArray<CertificadoDetailEntity>;
  requirementsCatalog?: ReadonlyArray<RequisitoLtree>;
  currentNoAplicableId?: string | null;
  archivedNoAplicableIds?: ReadonlySet<string>;
}): RequisitoLtree[] {
  const {
    certId,
    certificates,
    requirementsCatalog = getAllSeededNormaRequirements(),
    currentNoAplicableId = null,
    archivedNoAplicableIds,
  } = params;

  const cleanCertId = (certId || '').trim();
  if (!cleanCertId) return [];

  const cert = certificates.find((c) => c.id === cleanCertId);
  if (!cert) return [];

  const scoped = getScopedNormaRequirements({
    id_norma: cert.id_norma,
    norma_codigo: cert.norma_codigo,
    requirementsCatalog,
  });

  const existingExclusions = (cert.noAplicables || []).filter(
    (na) => na.id !== currentNoAplicableId && !archivedNoAplicableIds?.has(na.id)
  );
  const excludedReqIds = new Set(existingExclusions.map((na) => na.id_requisito));
  const excludedReqCodes = new Set(
    existingExclusions.map((na) => na.requisito_codigo.trim().toLowerCase())
  );

  return scoped.filter((req) => {
    if (excludedReqIds.has(req.id)) return false;
    if (excludedReqCodes.has(req.codigo.trim().toLowerCase())) return false;
    return true;
  });
}

/**
 * Reconciles `NoAplicableFormDraft` when switching `id_certificado` in Zone 1,
 * automatically resetting `id_requisito` if it does not belong to the new certificate's Norma
 * or is already excluded on that certificate.
 */
export function reconcileNoAplicableDraftOnCertChange(params: {
  draft: NoAplicableFormDraft;
  nextCertId: string;
  certificates: ReadonlyArray<CertificadoDetailEntity>;
  requirementsCatalog?: ReadonlyArray<RequisitoLtree>;
  currentNoAplicableId?: string | null;
  archivedNoAplicableIds?: ReadonlySet<string>;
}): NoAplicableFormDraft {
  const available = filterRequisitosForCertificado({
    certId: params.nextCertId,
    certificates: params.certificates,
    requirementsCatalog: params.requirementsCatalog,
    currentNoAplicableId: params.currentNoAplicableId,
    archivedNoAplicableIds: params.archivedNoAplicableIds,
  });

  const keepsCurrentReq = available.some((r) => r.id === params.draft.id_requisito);
  return {
    ...params.draft,
    id_certificado: params.nextCertId,
    id_requisito: keepsCurrentReq ? params.draft.id_requisito : '',
  };
}

/**
 * Validates `NoAplicableFormDraft` against ISO/IEC 17021-1 / ISO 9001 Cláusula 4.3 rules
 * and PostgreSQL unique constraint `(id_certificado, id_requisito) WHERE deleted_at IS NULL`.
 */
export function validateNoAplicableDraft(params: {
  draft: NoAplicableFormDraft;
  certificates: ReadonlyArray<CertificadoDetailEntity>;
  requirementsCatalog?: ReadonlyArray<RequisitoLtree>;
  currentNoAplicableId?: string | null;
  archivedNoAplicableIds?: ReadonlySet<string>;
}): NoAplicableValidationResult {
  const {
    draft,
    certificates,
    requirementsCatalog = getAllSeededNormaRequirements(),
    currentNoAplicableId = null,
    archivedNoAplicableIds,
  } = params;

  const certId = (draft.id_certificado || '').trim();
  const reqId = (draft.id_requisito || '').trim();
  const justificacion = (draft.justificacion || '').trim();

  if (!certId) {
    return {
      valid: false,
      error: 'Debe seleccionar un certificado activo en la Zona Superior antes de declarar la exclusión.',
    };
  }

  const cert = certificates.find((c) => c.id === certId);
  if (!cert) {
    return {
      valid: false,
      error: 'El certificado seleccionado no se encuentra disponible o activo.',
    };
  }

  if (!reqId) {
    return {
      valid: false,
      error: 'Debe seleccionar la cláusula o requisito normativo a excluir.',
    };
  }

  const scopedNormaReqs = getScopedNormaRequirements({
    id_norma: cert.id_norma,
    norma_codigo: cert.norma_codigo,
    requirementsCatalog,
  });

  const matchedReq = scopedNormaReqs.find((r) => r.id === reqId);
  if (!matchedReq) {
    return {
      valid: false,
      error: `La cláusula seleccionada no pertenece a la norma ${cert.norma_codigo} del certificado.`,
    };
  }

  const duplicate = (cert.noAplicables || []).some(
    (na) =>
      na.id !== currentNoAplicableId &&
      !archivedNoAplicableIds?.has(na.id) &&
      (na.id_requisito === matchedReq.id ||
        na.requisito_codigo.trim().toLowerCase() === matchedReq.codigo.trim().toLowerCase())
  );
  if (duplicate) {
    return {
      valid: false,
      error: `La cláusula ${matchedReq.codigo} ya está declarada como no aplicable en el certificado ${cert.numero_certificado}.`,
    };
  }

  if (justificacion.length < NO_APLICABLE_JUSTIFICACION_MIN_LENGTH) {
    return {
      valid: false,
      error: `La justificación técnica (ISO 4.3) es obligatoria y debe contener al menos ${NO_APLICABLE_JUSTIFICACION_MIN_LENGTH} caracteres.`,
    };
  }

  if (justificacion.length > NO_APLICABLE_JUSTIFICACION_MAX_LENGTH) {
    return {
      valid: false,
      error: `La justificación técnica no puede superar los ${NO_APLICABLE_JUSTIFICACION_MAX_LENGTH} caracteres.`,
    };
  }

  if (containsRawUuid(justificacion)) {
    return {
      valid: false,
      error: 'La justificación técnica no debe incluir identificadores UUID internos.',
    };
  }

  return {
    valid: true,
    normalized: {
      id_certificado: cert.id,
      id_requisito: matchedReq.id,
      justificacion,
      requisito_codigo: matchedReq.codigo,
      requisito_titulo: matchedReq.titulo,
      ruta_materializada: matchedReq.ruta_materializada,
    },
  };
}

/**
 * Resolves a `NoAplicableDetailEntity` by exclusion ID across active certificates,
 * joining Organization, Certificate, Norma, and LTREE Requisito metadata cleanly without UUID exposure.
 */
export function resolveNoAplicableDetailById(params: {
  noAplicableId: string;
  certificates: ReadonlyArray<CertificadoDetailEntity>;
  requirementsCatalog?: ReadonlyArray<RequisitoLtree>;
  archivedNoAplicableIds?: ReadonlySet<string>;
}): NoAplicableDetailEntity | null {
  const {
    noAplicableId,
    certificates,
    requirementsCatalog = getAllSeededNormaRequirements(),
    archivedNoAplicableIds,
  } = params;

  if (!noAplicableId || archivedNoAplicableIds?.has(noAplicableId)) {
    return null;
  }

  for (const cert of certificates) {
    const match = (cert.noAplicables || []).find((na) => na.id === noAplicableId);
    if (!match) continue;

    const scopedReqs = getScopedNormaRequirements({
      id_norma: cert.id_norma,
      norma_codigo: cert.norma_codigo,
      requirementsCatalog,
    });
    const matchedReq =
      scopedReqs.find((r) => r.id === match.id_requisito) ||
      scopedReqs.find(
        (r) => r.codigo.trim().toLowerCase() === match.requisito_codigo.trim().toLowerCase()
      ) ||
      requirementsCatalog.find((r) => r.id === match.id_requisito);

    return {
      id: match.id,
      id_certificado: cert.id,
      numero_certificado: cert.numero_certificado,
      certificado_estatus: cert.estatus,
      id_organizacion: cert.id_organizacion,
      organizacion_nombre: cert.organizacion_nombre,
      organizacion_rif: cert.organizacion_rif,
      id_norma: matchedReq?.id_norma || cert.id_norma,
      norma_codigo: matchedReq?.norma_codigo || cert.norma_codigo,
      norma_titulo: cert.norma_titulo,
      id_requisito: matchedReq?.id || match.id_requisito,
      requisito_codigo: matchedReq?.codigo || match.requisito_codigo,
      requisito_titulo: matchedReq?.titulo || match.requisito_titulo,
      requisito_descripcion: matchedReq?.descripcion,
      ruta_materializada:
        matchedReq?.ruta_materializada || match.ruta_materializada || match.requisito_codigo,
      justificacion: match.justificacion,
      deleted_at: null,
    };
  }

  return null;
}
