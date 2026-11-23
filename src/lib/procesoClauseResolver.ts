/**
 * @deprecated Replaced by binary `id_norma` equality planner (`planShareProcesos` /
 * `planSyncProcesoRequisitos` in `./certificadoShareDomain`).
 *
 * Legacy compatibility shim kept strictly for `shareModalView.ts` and `src/main.ts`
 * until `step_1.3.md` migrates the UI modal. All slow cross-standard semantic/HLS/token
 * heuristics have been removed:
 * - Same `id_norma`: maps clauses 1:1 while blocking ISO 4.3 exclusions (`EXCLUDED_ISO43`).
 * - Different `id_norma`: returns `isCrossStandard: true` with empty entries/options and `[]`.
 *
 * Strictly typed (`strict: true`, 0 `any` / `as any`) and Zero-UUID compliant.
 */

import { assertValidUuid, containsRawUuid, isValidUuid } from './zeroUuid';
import {
  isClauseBlockedByCertificateExclusions,
  isLtreeSelfOrDescendant,
} from './coverageEngine';
import type { RequisitoLtree } from './extraDomain';
import type { CertificadoDetailEntity, ProcessEntity } from './multisiteSampling';
import { orderNormaRequisitosHierarchically } from './normaFullReader';
import {
  canLinkRequisitoToProceso,
  getAllSeededNormaRequirements,
  getScopedNormaRequirements,
} from './procesoDomain';

export type ClauseResolutionStatus =
  | 'EXACT_SAME_NORM'
  | 'HIERARCHICAL_ROLLUP'
  | 'HIERARCHICAL_ROLLDOWN'
  | 'HLS_EQUIVALENT'
  | 'SEMANTIC_COLLISION'
  | 'NO_EQUIVALENT'
  | 'EXCLUDED_ISO43';

export interface ClauseResolutionEntry {
  entryKey: string;
  status: ClauseResolutionStatus;
  sourceClauses: string[];
  sourceTitles: string[];
  sourceRequisitos: RequisitoLtree[];
  targetCandidate: RequisitoLtree | null;
  descendantTargetCandidates: RequisitoLtree[];
  preselected: boolean;
  disabled: boolean;
  warningMessage: string | null;
  informativeNote: string | null;
  blockingExclusionCodigo?: string;
  blockingJustificacion?: string;
}

export interface ClauseResolutionSummaryCounts {
  autoMappedCount: number;
  hierarchicalCount: number;
  semanticCollisionCount: number;
  noEquivalentCount: number;
  excludedIso43Count: number;
}

export interface ProcesoTargetClauseResolutionPlan {
  procesoId: string;
  sourceCertId: string;
  targetCertId: string;
  sourceNormaId: string;
  sourceNormaCodigo: string;
  targetNormaId: string;
  targetNormaCodigo: string;
  isCrossStandard: boolean;
  entries: ClauseResolutionEntry[];
  summaryCounts: ClauseResolutionSummaryCounts;
  availableManualTargetOptions: RequisitoLtree[];
}

export interface ResolveProcesoClausesForTargetCertParams {
  proceso: ProcessEntity;
  sourceCert: CertificadoDetailEntity;
  targetCert: CertificadoDetailEntity;
  requirementsCatalog?: ReadonlyArray<RequisitoLtree>;
  archivedNoAplicableIds?: ReadonlySet<string>;
}

export interface BuildFinalTargetRequisitoIdsParams {
  resolutionPlan: ProcesoTargetClauseResolutionPlan;
  selectedTargetReqIdsByEntryKey?: Readonly<
    Record<string, string | ReadonlyArray<string> | null | undefined>
  >;
  extraManualTargetReqIds?: ReadonlyArray<string>;
  targetCert?: CertificadoDetailEntity;
  requirementsCatalog?: ReadonlyArray<RequisitoLtree>;
  archivedNoAplicableIds?: ReadonlySet<string>;
}

function sanitizeMessageText(text: string): string {
  if (!containsRawUuid(text)) return text;
  return text.replace(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    'registro'
  );
}

function collectSourceClausesForCert(
  proceso: ProcessEntity,
  sourceCertId: string
): Array<{ codigo: string; titulo?: string }> {
  const scoped = proceso.requisitos_by_certificado?.[sourceCertId];
  const rawCodes = scoped
    ? scoped.clausulas_cubiertas || []
    : proceso.clausulas_cubiertas || [];
  const rawDetails = scoped
    ? scoped.requisitos_detalle || []
    : proceso.requisitos_detalle || [];

  const seenLower = new Set<string>();
  const result: Array<{ codigo: string; titulo?: string }> = [];

  for (const det of rawDetails) {
    const code = (det.codigo || '').trim();
    const lower = code.toLowerCase();
    if (!lower || seenLower.has(lower)) continue;
    seenLower.add(lower);
    result.push({ codigo: code, titulo: det.titulo?.trim() });
  }

  for (const raw of rawCodes) {
    const code = (raw || '').trim();
    const lower = code.toLowerCase();
    if (!lower || seenLower.has(lower)) continue;
    seenLower.add(lower);
    result.push({ codigo: code });
  }

  return result;
}

function findDescendantsInNorma(
  parentReq: RequisitoLtree,
  normaReqs: ReadonlyArray<RequisitoLtree>
): RequisitoLtree[] {
  const parentCodePrefix = `${parentReq.codigo.trim().toLowerCase()}.`;
  const parentPath = (parentReq.ruta_materializada || '').trim();

  return normaReqs.filter((candidate) => {
    if (candidate.id === parentReq.id) return false;
    if (candidate.codigo.trim().toLowerCase().startsWith(parentCodePrefix)) {
      return true;
    }
    if (parentPath && candidate.ruta_materializada) {
      return isLtreeSelfOrDescendant(candidate.ruta_materializada, parentPath);
    }
    return false;
  });
}

function normalizeSelectedIdValue(
  value: string | ReadonlyArray<string> | null | undefined
): string[] {
  if (!value) return [];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (trimmed) out.push(trimmed);
  }
  return out;
}

/**
 * @deprecated Use `planShareProcesos` from `./certificadoShareDomain`.
 *
 * Binary deterministic resolver:
 * - Same `id_norma`: maps clauses 1:1 filtering ISO 4.3 exclusions (`EXCLUDED_ISO43`).
 * - Different `id_norma`: returns `isCrossStandard = true` with zero clauses (`entries: []`).
 */
export function resolveProcesoClausesForTargetCert(
  params: ResolveProcesoClausesForTargetCertParams
): ProcesoTargetClauseResolutionPlan {
  const {
    proceso,
    sourceCert,
    targetCert,
    requirementsCatalog = getAllSeededNormaRequirements(),
    archivedNoAplicableIds,
  } = params;

  const procesoId = assertValidUuid(proceso.id, 'proceso');
  const sourceCertId = assertValidUuid(sourceCert.id, 'certificado origen');
  const targetCertId = assertValidUuid(targetCert.id, 'certificado destino');
  const sourceNormaId = sourceCert.id_norma
    ? assertValidUuid(sourceCert.id_norma, 'norma origen')
    : '';
  const targetNormaId = targetCert.id_norma
    ? assertValidUuid(targetCert.id_norma, 'norma destino')
    : '';

  const isSameNormId = Boolean(
    sourceNormaId && targetNormaId && sourceNormaId === targetNormaId
  );
  const isCrossStandard = !isSameNormId;

  const emptySummaryCounts: ClauseResolutionSummaryCounts = {
    autoMappedCount: 0,
    hierarchicalCount: 0,
    semanticCollisionCount: 0,
    noEquivalentCount: 0,
    excludedIso43Count: 0,
  };

  if (isCrossStandard) {
    return {
      procesoId,
      sourceCertId,
      targetCertId,
      sourceNormaId,
      sourceNormaCodigo: sourceCert.norma_codigo,
      targetNormaId,
      targetNormaCodigo: targetCert.norma_codigo,
      isCrossStandard: true,
      entries: [],
      summaryCounts: emptySummaryCounts,
      availableManualTargetOptions: [],
    };
  }

  const targetReqs = orderNormaRequisitosHierarchically(
    getScopedNormaRequirements({
      id_norma: targetNormaId,
      norma_codigo: targetCert.norma_codigo,
      requirementsCatalog,
    })
  );

  const targetByLowerCode = new Map<string, RequisitoLtree>();
  for (const req of targetReqs) {
    targetByLowerCode.set(req.codigo.trim().toLowerCase(), req);
  }

  const availableManualTargetOptions = targetReqs.filter(
    (req) =>
      !isClauseBlockedByCertificateExclusions({
        cert: targetCert,
        targetRequisito: req,
        requirementsCatalog,
        archivedNoAplicableIds,
      }).blocked
  );

  const sourceClausesList = collectSourceClausesForCert(proceso, sourceCertId);
  const entries: ClauseResolutionEntry[] = [];

  for (const item of sourceClausesList) {
    const cleanCode = item.codigo.trim();
    const lowerCode = cleanCode.toLowerCase();
    const directTarget = targetByLowerCode.get(lowerCode) ?? null;
    const sourceTitle = sanitizeMessageText(
      directTarget?.titulo || item.titulo || `Cláusula ${cleanCode}`
    );

    if (!directTarget) {
      entries.push({
        entryKey: `clause:${cleanCode}`,
        status: 'NO_EQUIVALENT',
        sourceClauses: [cleanCode],
        sourceTitles: [sourceTitle],
        sourceRequisitos: [],
        targetCandidate: null,
        descendantTargetCandidates: [],
        preselected: false,
        disabled: false,
        warningMessage: sanitizeMessageText(
          `La cláusula ${cleanCode} no se encuentra activa en el catálogo de ${targetCert.norma_codigo}.`
        ),
        informativeNote: null,
      });
      continue;
    }

    const exclusionCheck = isClauseBlockedByCertificateExclusions({
      cert: targetCert,
      targetRequisito: directTarget,
      requirementsCatalog,
      archivedNoAplicableIds,
    });

    if (exclusionCheck.blocked) {
      const blockingCode =
        exclusionCheck.blockingExclusionCodigo || directTarget.codigo;
      entries.push({
        entryKey: `clause:${cleanCode}`,
        status: 'EXCLUDED_ISO43',
        sourceClauses: [cleanCode],
        sourceTitles: [sourceTitle],
        sourceRequisitos: [directTarget],
        targetCandidate: directTarget,
        descendantTargetCandidates: [],
        preselected: false,
        disabled: true,
        warningMessage: sanitizeMessageText(
          `Excluida por ISO 4.3 en certificado destino (cláusula ${blockingCode}).`
        ),
        informativeNote: null,
        blockingExclusionCodigo: blockingCode,
        blockingJustificacion: exclusionCheck.blockingJustificacion
          ? sanitizeMessageText(exclusionCheck.blockingJustificacion)
          : undefined,
      });
      continue;
    }

    entries.push({
      entryKey: `clause:${cleanCode}`,
      status: 'EXACT_SAME_NORM',
      sourceClauses: [cleanCode],
      sourceTitles: [sourceTitle],
      sourceRequisitos: [directTarget],
      targetCandidate: directTarget,
      descendantTargetCandidates: findDescendantsInNorma(directTarget, targetReqs),
      preselected: true,
      disabled: false,
      warningMessage: null,
      informativeNote: sanitizeMessageText(
        `Misma norma (${targetCert.norma_codigo}): ${directTarget.codigo} — ${directTarget.titulo}.`
      ),
    });
  }

  const summaryCounts: ClauseResolutionSummaryCounts = {
    autoMappedCount: entries.filter((e) => e.status === 'EXACT_SAME_NORM').length,
    hierarchicalCount: 0,
    semanticCollisionCount: 0,
    noEquivalentCount: entries.filter((e) => e.status === 'NO_EQUIVALENT').length,
    excludedIso43Count: entries.filter((e) => e.status === 'EXCLUDED_ISO43').length,
  };

  return {
    procesoId,
    sourceCertId,
    targetCertId,
    sourceNormaId,
    sourceNormaCodigo: sourceCert.norma_codigo,
    targetNormaId,
    targetNormaCodigo: targetCert.norma_codigo,
    isCrossStandard: false,
    entries,
    summaryCounts,
    availableManualTargetOptions,
  };
}

/**
 * @deprecated Use `planShareProcesos` / `planSyncProcesoRequisitos` from `./certificadoShareDomain`.
 *
 * Returns `[]` unconditionally when `resolutionPlan.isCrossStandard === true`.
 * For same-norm plans, resolves selected/preselected clauses filtered by ISO 4.3.
 */
export function buildFinalTargetRequisitoIds(
  params: BuildFinalTargetRequisitoIdsParams
): string[] {
  const {
    resolutionPlan,
    selectedTargetReqIdsByEntryKey,
    extraManualTargetReqIds = [],
    targetCert,
    requirementsCatalog,
    archivedNoAplicableIds,
  } = params;

  if (resolutionPlan.isCrossStandard) {
    return [];
  }

  const validTargetReqById = new Map<string, RequisitoLtree>();
  for (const option of resolutionPlan.availableManualTargetOptions) {
    if (
      !resolutionPlan.targetNormaId ||
      option.id_norma === resolutionPlan.targetNormaId
    ) {
      validTargetReqById.set(option.id, option);
    }
  }

  if (requirementsCatalog) {
    const scoped = getScopedNormaRequirements({
      id_norma: resolutionPlan.targetNormaId,
      norma_codigo: resolutionPlan.targetNormaCodigo,
      requirementsCatalog,
    });
    for (const req of scoped) {
      if (
        resolutionPlan.targetNormaId &&
        req.id_norma !== resolutionPlan.targetNormaId
      ) {
        continue;
      }
      if (
        targetCert &&
        isClauseBlockedByCertificateExclusions({
          cert: targetCert,
          targetRequisito: req,
          requirementsCatalog,
          archivedNoAplicableIds,
        }).blocked
      ) {
        validTargetReqById.delete(req.id);
        continue;
      }
      if (!validTargetReqById.has(req.id)) {
        const wasExcludedInPlan = resolutionPlan.entries.some(
          (e) =>
            e.status === 'EXCLUDED_ISO43' &&
            e.targetCandidate?.id === req.id
        );
        if (!wasExcludedInPlan) {
          validTargetReqById.set(req.id, req);
        }
      }
    }
  }

  const candidateIds: string[] = [];

  for (const entry of resolutionPlan.entries) {
    if (entry.disabled || entry.status === 'EXCLUDED_ISO43') {
      continue;
    }

    const hasExplicitSelection =
      selectedTargetReqIdsByEntryKey !== undefined &&
      Object.prototype.hasOwnProperty.call(
        selectedTargetReqIdsByEntryKey,
        entry.entryKey
      );

    if (hasExplicitSelection) {
      const explicitIds = normalizeSelectedIdValue(
        selectedTargetReqIdsByEntryKey[entry.entryKey]
      );
      for (const id of explicitIds) {
        candidateIds.push(id);
      }
    } else if (entry.preselected && entry.targetCandidate) {
      candidateIds.push(entry.targetCandidate.id);
    }
  }

  for (const extraId of extraManualTargetReqIds) {
    const clean = (extraId || '').trim();
    if (clean) candidateIds.push(clean);
  }

  const targetProcesoStub = {
    id_norma: resolutionPlan.targetNormaId,
    norma_codigo: resolutionPlan.targetNormaCodigo,
    requisitos: [] as Array<{
      id_requisito: string;
      codigo: string;
      titulo: string;
      ruta_materializada: string;
      nivel: number;
      id_norma: string;
      norma_codigo: string;
    }>,
  };

  const acceptedReqs: RequisitoLtree[] = [];
  const acceptedIds = new Set<string>();

  for (const reqId of candidateIds) {
    if (!isValidUuid(reqId) && validTargetReqById.size === 0) continue;
    if (acceptedIds.has(reqId)) continue;

    const targetReq = validTargetReqById.get(reqId);
    if (!targetReq) continue;

    if (
      resolutionPlan.targetNormaId &&
      targetReq.id_norma !== resolutionPlan.targetNormaId
    ) {
      continue;
    }

    const linkCheck = canLinkRequisitoToProceso({
      proceso: targetProcesoStub,
      requisito: targetReq,
      cert: targetCert,
      requirementsCatalog,
      archivedNoAplicableIds,
    });
    if (!linkCheck.allowed) continue;

    acceptedIds.add(targetReq.id);
    acceptedReqs.push(targetReq);
    targetProcesoStub.requisitos.push({
      id_requisito: targetReq.id,
      codigo: targetReq.codigo,
      titulo: targetReq.titulo,
      ruta_materializada: targetReq.ruta_materializada,
      nivel: targetReq.nivel,
      id_norma: targetReq.id_norma,
      norma_codigo: targetReq.norma_codigo,
    });
  }

  return orderNormaRequisitosHierarchically(acceptedReqs).map((r) => r.id);
}
