/**
 * Step 4.1: Requisitos No Aplicables Domain Module (`requisitos_no_aplicables_certificado`)
 * ISO/IEC 17021-1:2015 & ISO 9001:2015 Cláusula 4.3 Exclusions Management.
 * Pure TypeScript domain contracts, dynamic Norma clause filtering, and Zero-UUID resolution.
 */

import { containsRawUuid } from './breadcrumb';
import {
  isLtreeSelfOrDescendant,
  previewNonApplicableSmartMutation,
  type NonApplicableSmartMutationPreview,
  type SmartMutationPrunedLink,
} from './coverageEngine';
import type { RequisitoLtree } from './extraDomain';
import type { CertificadoDetailEntity } from './multisiteSampling';
import { orderNormaRequisitosHierarchically } from './normaFullReader';
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

/**
 * Wraps `previewNonApplicableSmartMutation` for reactive pre-submit preview and post-submit telemetry.
 */
export function computeNoAplicableMutationPreview(params: {
  cert: CertificadoDetailEntity;
  targetRequisitoId: string;
  requirementsCatalog?: ReadonlyArray<RequisitoLtree>;
  archivedProcesoIds?: ReadonlySet<string>;
}): NonApplicableSmartMutationPreview {
  const {
    cert,
    targetRequisitoId,
    requirementsCatalog = getAllSeededNormaRequirements(),
    archivedProcesoIds,
  } = params;

  const cleanReqId = (targetRequisitoId || '').trim();
  if (!cleanReqId) {
    return { willMutate: false, prunedLinks: [], affectedProcessCount: 0 };
  }

  const scopedNormaReqs = getScopedNormaRequirements({
    id_norma: cert.id_norma,
    norma_codigo: cert.norma_codigo,
    requirementsCatalog,
  });
  const targetReq = scopedNormaReqs.find((r) => r.id === cleanReqId);
  if (!targetReq) {
    return { willMutate: false, prunedLinks: [], affectedProcessCount: 0 };
  }

  return previewNonApplicableSmartMutation({
    cert,
    targetRequisito: targetReq,
    requirementsCatalog,
    archivedProcesoIds,
  });
}

export type NoAplicableAncestorAdvisoryType =
  | 'NONE'
  | 'COVERED_BY_EXCLUDED_ANCESTOR'
  | 'COVERS_EXCLUDED_DESCENDANTS';

export interface NoAplicableAncestorAdvisory {
  type: NoAplicableAncestorAdvisoryType;
  overlappingCodigos: string[];
  message: string | null;
}

/**
 * Detects whether the selected clause lies underneath an already-excluded parent clause
 * (redundant exclusion) or sits above existing child exclusions (subtree absorption).
 */
export function computeNoAplicableAncestorAdvisory(params: {
  cert: CertificadoDetailEntity;
  targetRequisitoId: string;
  requirementsCatalog?: ReadonlyArray<RequisitoLtree>;
  currentNoAplicableId?: string | null;
  archivedNoAplicableIds?: ReadonlySet<string>;
}): NoAplicableAncestorAdvisory {
  const {
    cert,
    targetRequisitoId,
    requirementsCatalog = getAllSeededNormaRequirements(),
    currentNoAplicableId = null,
    archivedNoAplicableIds,
  } = params;

  const cleanReqId = (targetRequisitoId || '').trim();
  if (!cleanReqId) {
    return { type: 'NONE', overlappingCodigos: [], message: null };
  }

  const scopedNormaReqs = getScopedNormaRequirements({
    id_norma: cert.id_norma,
    norma_codigo: cert.norma_codigo,
    requirementsCatalog,
  });
  const targetReq = scopedNormaReqs.find((r) => r.id === cleanReqId);
  if (!targetReq || !targetReq.ruta_materializada) {
    return { type: 'NONE', overlappingCodigos: [], message: null };
  }

  const activeExclusions = (cert.noAplicables || []).filter(
    (na) => na.id !== currentNoAplicableId && !archivedNoAplicableIds?.has(na.id)
  );
  if (activeExclusions.length === 0) {
    return { type: 'NONE', overlappingCodigos: [], message: null };
  }

  const byId = new Map(scopedNormaReqs.map((r) => [r.id, r]));
  const byCodeLower = new Map(scopedNormaReqs.map((r) => [r.codigo.trim().toLowerCase(), r]));

  const ancestorCodigos: string[] = [];
  const descendantCodigos: string[] = [];

  for (const excl of activeExclusions) {
    const matchedReq =
      byId.get(excl.id_requisito) ||
      byCodeLower.get((excl.requisito_codigo || '').trim().toLowerCase());
    const exclPath = (matchedReq?.ruta_materializada || excl.ruta_materializada || '').trim();
    const exclCodigo = matchedReq?.codigo || excl.requisito_codigo;
    if (!exclPath) continue;

    if (
      excl.id_requisito !== targetReq.id &&
      isLtreeSelfOrDescendant(targetReq.ruta_materializada, exclPath)
    ) {
      ancestorCodigos.push(exclCodigo);
    } else if (
      excl.id_requisito !== targetReq.id &&
      isLtreeSelfOrDescendant(exclPath, targetReq.ruta_materializada)
    ) {
      descendantCodigos.push(exclCodigo);
    }
  }

  if (ancestorCodigos.length > 0) {
    const sortedAncestors = Array.from(new Set(ancestorCodigos)).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    );
    return {
      type: 'COVERED_BY_EXCLUDED_ANCESTOR',
      overlappingCodigos: sortedAncestors,
      message: `La cláusula ${targetReq.codigo} ya está cubierta automáticamente por la exclusión activa de su cláusula superior (${sortedAncestors.join(', ')}) bajo ISO 4.3.`,
    };
  }

  if (descendantCodigos.length > 0) {
    const sortedDescendants = Array.from(new Set(descendantCodigos)).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    );
    return {
      type: 'COVERS_EXCLUDED_DESCENDANTS',
      overlappingCodigos: sortedDescendants,
      message: `Al declarar como No Aplicable la cláusula ${targetReq.codigo}, su alcance descendente absorberá ${sortedDescendants.length === 1 ? 'la exclusión hija activa' : 'las exclusiones hijas activas'}: ${sortedDescendants.join(', ')}.`,
    };
  }

  return { type: 'NONE', overlappingCodigos: [], message: null };
}

export interface NoAplicableClauseSelectOption {
  req: RequisitoLtree;
  isDuplicateExclusion: boolean;
  activeProcessCount: number;
  processNames: string[];
}

/**
 * Builds hierarchically ordered `<select>` options for `noAplicableView.ts`:
 * disables only active duplicate exclusions on the certificate, while annotating
 * process-covered clauses `(En uso por N proceso(s))` without ever disabling them.
 */
export function buildNoAplicableClauseOptions(params: {
  cert: CertificadoDetailEntity;
  requirementsCatalog?: ReadonlyArray<RequisitoLtree>;
  currentNoAplicableId?: string | null;
  archivedNoAplicableIds?: ReadonlySet<string>;
  archivedProcesoIds?: ReadonlySet<string>;
}): NoAplicableClauseSelectOption[] {
  const {
    cert,
    requirementsCatalog = getAllSeededNormaRequirements(),
    currentNoAplicableId = null,
    archivedNoAplicableIds,
    archivedProcesoIds,
  } = params;

  const scoped = orderNormaRequisitosHierarchically(
    getScopedNormaRequirements({
      id_norma: cert.id_norma,
      norma_codigo: cert.norma_codigo,
      requirementsCatalog,
    })
  );

  const existingExclusions = (cert.noAplicables || []).filter(
    (na) => na.id !== currentNoAplicableId && !archivedNoAplicableIds?.has(na.id)
  );
  const excludedIds = new Set(existingExclusions.map((na) => na.id_requisito));
  const excludedCodes = new Set(
    existingExclusions.map((na) => na.requisito_codigo.trim().toLowerCase())
  );

  return scoped.map((req) => {
    const isDuplicateExclusion =
      excludedIds.has(req.id) || excludedCodes.has(req.codigo.trim().toLowerCase());
    const preview = previewNonApplicableSmartMutation({
      cert,
      targetRequisito: req,
      requirementsCatalog,
      archivedProcesoIds,
    });
    const processNames = Array.from(
      new Set(preview.prunedLinks.map((link) => link.nombre_proceso))
    );

    return {
      req,
      isDuplicateExclusion,
      activeProcessCount: preview.affectedProcessCount,
      processNames,
    };
  });
}

export interface GroupedSmartMutationProcess {
  nombre_proceso: string;
  codigos: string[];
}

/**
 * Groups Smart-Mutation pruned links by process name with naturally sorted clause codes
 * for the amber preview banner in `noAplicableView.ts`.
 */
export function groupPrunedLinksByProcess(
  prunedLinks: ReadonlyArray<SmartMutationPrunedLink>
): GroupedSmartMutationProcess[] {
  const byProceso = new Map<string, Set<string>>();
  for (const link of prunedLinks) {
    const procName = (link.nombre_proceso || 'Proceso del sistema').trim();
    let codes = byProceso.get(procName);
    if (!codes) {
      codes = new Set<string>();
      byProceso.set(procName, codes);
    }
    if (link.codigo) {
      codes.add(link.codigo.trim());
    }
  }

  return Array.from(byProceso.entries()).map(([nombre_proceso, codeSet]) => ({
    nombre_proceso,
    codigos: Array.from(codeSet).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    ),
  }));
}

