/**
 * Step 2.2 — Deterministic Cross-Standard Normative Clause Resolution Engine (`Proceso ↔ Requisito`)
 *
 * Strictly typed (`strict: true`, 0 `any` / `as any`) and Zero-UUID compliant
 * in all user-facing warnings, collision descriptions, and validation messages.
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
import { normalizeSearchToken } from './searchControls';

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

const STOPWORDS = new Set([
  'a',
  'al',
  'and',
  'ante',
  'con',
  'de',
  'del',
  'el',
  'en',
  'for',
  'in',
  'la',
  'las',
  'los',
  'of',
  'on',
  'or',
  'para',
  'por',
  'su',
  'sus',
  'the',
  'to',
  'un',
  'una',
  'unos',
  'y',
]);

const HLS_CORE_CHAPTERS = new Set([
  '4.1',
  '4.2',
  '4.3',
  '4.4',
  '5.1',
  '5.2',
  '5.3',
  '6.1',
  '6.2',
  '6.3',
  '7.1',
  '7.2',
  '7.3',
  '7.4',
  '7.5',
  '9.1',
  '9.2',
  '9.3',
  '10.1',
  '10.2',
  '10.3',
]);

const HLS_ROLLUP_ELIGIBLE_PREFIXES = new Set([
  '4.1',
  '4.2',
  '4.3',
  '4.4',
  '5.1',
  '5.2',
  '5.3',
  '6.1',
  '6.2',
  '6.3',
  '7.1',
  '7.2',
  '7.3',
  '7.4',
  '7.5',
  '9.1',
  '9.2',
  '9.3',
  '10.1',
  '10.2',
  '10.3',
]);

const HLS_CANONICAL_TOPICS: Readonly<Record<string, ReadonlyArray<string>>> = {
  '4.1': ['contexto', 'organizacion', 'cuestiones', 'context', 'organization'],
  '4.2': ['partes', 'interesadas', 'necesidades', 'expectativas', 'interested', 'parties'],
  '4.3': ['alcance', 'sistema', 'gestion', 'scope', 'management'],
  '4.4': ['sistema', 'gestion', 'procesos', 'management', 'system', 'processes'],
  '5.1': ['liderazgo', 'compromiso', 'leadership', 'commitment'],
  '5.2': ['politica', 'policy'],
  '5.3': ['roles', 'responsabilidades', 'autoridades', 'responsibilities', 'authorities'],
  '6.1': ['riesgos', 'oportunidades', 'risks', 'opportunities'],
  '6.2': ['objetivos', 'planificacion', 'objectives', 'planning'],
  '6.3': ['planificacion', 'cambios', 'planning', 'changes'],
  '7.1': ['recursos', 'resources'],
  '7.2': ['competencia', 'competence'],
  '7.3': ['toma', 'conciencia', 'awareness'],
  '7.4': ['comunicacion', 'communication'],
  '7.5': ['informacion', 'documentada', 'documented', 'information'],
  '9.1': ['seguimiento', 'medicion', 'analisis', 'evaluacion', 'monitoring', 'measurement'],
  '9.2': ['auditoria', 'interna', 'internal', 'audit'],
  '9.3': ['revision', 'direccion', 'management', 'review'],
  '10.1': ['mejora', 'generalidades', 'improvement'],
  '10.2': ['conformidad', 'accion', 'correctiva', 'incidente', 'nonconformity', 'corrective'],
  '10.3': ['mejora', 'continua', 'continual', 'improvement'],
};

type IsoDisciplineFamily =
  | 'ISO_9001'
  | 'ISO_14001'
  | 'ISO_45001'
  | 'ISO_27001'
  | 'CUSTOM';

function normalizeStandardFamily(normaCodigo: string | null | undefined): IsoDisciplineFamily {
  const token = normalizeSearchToken(normaCodigo);
  if (token.includes('9001')) return 'ISO_9001';
  if (token.includes('14001')) return 'ISO_14001';
  if (token.includes('45001')) return 'ISO_45001';
  if (token.includes('27001')) return 'ISO_27001';
  return 'CUSTOM';
}

function sanitizeMessageText(text: string): string {
  if (!containsRawUuid(text)) return text;
  return text.replace(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    'registro'
  );
}

function tokenizeSemanticTitle(value: string | null | undefined): Set<string> {
  const clean = normalizeSearchToken(value);
  if (!clean) return new Set();
  const tokens = clean
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  return new Set(tokens);
}

function collectRequirementSemanticTokens(
  req: Pick<RequisitoLtree, 'titulo' | 'translations'> | null | undefined,
  fallbackTitle?: string
): Set<string> {
  const combined = new Set<string>();
  if (fallbackTitle) {
    for (const token of tokenizeSemanticTitle(fallbackTitle)) {
      combined.add(token);
    }
  }
  if (!req) return combined;
  for (const text of [
    req.titulo,
    req.translations?.es?.title,
    req.translations?.en?.title,
  ]) {
    for (const token of tokenizeSemanticTitle(text)) {
      combined.add(token);
    }
  }
  return combined;
}

function computeSemanticSimilarity(tokensA: Set<string>, tokensB: Set<string>): {
  overlapCoeff: number;
  jaccard: number;
  sharedCount: number;
} {
  if (tokensA.size === 0 || tokensB.size === 0) {
    return { overlapCoeff: 0, jaccard: 0, sharedCount: 0 };
  }
  let sharedCount = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) sharedCount += 1;
  }
  const minSize = Math.min(tokensA.size, tokensB.size);
  const unionSize = tokensA.size + tokensB.size - sharedCount;
  return {
    overlapCoeff: minSize > 0 ? sharedCount / minSize : 0,
    jaccard: unionSize > 0 ? sharedCount / unionSize : 0,
    sharedCount,
  };
}

function isHlsTopicSemanticallyAligned(params: {
  code: string;
  sourceTokens: Set<string>;
  targetTokens: Set<string>;
}): boolean {
  const { code, sourceTokens, targetTokens } = params;
  const { overlapCoeff, sharedCount } = computeSemanticSimilarity(sourceTokens, targetTokens);
  if (overlapCoeff >= 0.45 && sharedCount >= 1) {
    return true;
  }

  // Bilingual support: both norms match canonical Annex SL keywords for this HLS code
  const canonicalTopics = HLS_CANONICAL_TOPICS[code];
  if (canonicalTopics && canonicalTopics.length > 0) {
    const sourceHasTopic = canonicalTopics.some((kw) => sourceTokens.has(kw));
    const targetHasTopic = canonicalTopics.some((kw) => targetTokens.has(kw));
    if (sourceHasTopic && targetHasTopic) {
      return true;
    }
  }

  return false;
}

function detectExplicitCrossStandardCollision(params: {
  code: string;
  sourceFamily: IsoDisciplineFamily;
  targetFamily: IsoDisciplineFamily;
  sourceTitle: string;
  targetTitle: string;
  sourceTokens: Set<string>;
  targetTokens: Set<string>;
}): { isCollision: boolean; reason: string | null } {
  const {
    code,
    sourceFamily,
    targetFamily,
    sourceTitle,
    targetTitle,
    sourceTokens,
    targetTokens,
  } = params;

  const cleanCode = code.trim();
  const isDifferentFamily = sourceFamily !== targetFamily || sourceFamily === 'CUSTOM';

  // Rule 1: Known high-risk semantic collisions across ISO disciplines
  if (cleanCode === '8.2' && isDifferentFamily) {
    const bothEmergencias =
      (sourceFamily === 'ISO_14001' && targetFamily === 'ISO_45001') ||
      (sourceFamily === 'ISO_45001' && targetFamily === 'ISO_14001');
    const { overlapCoeff } = computeSemanticSimilarity(sourceTokens, targetTokens);
    if (!bothEmergencias || overlapCoeff < 0.5) {
      return {
        isCollision: true,
        reason: `Colisión semántica en cláusula 8.2: origen «${sourceTitle}» difiere de destino «${targetTitle}».`,
      };
    }
  }

  if (cleanCode === '8.3' && isDifferentFamily) {
    return {
      isCollision: true,
      reason: `Colisión semántica en cláusula 8.3: origen «${sourceTitle}» difiere del significado normativo de destino «${targetTitle}».`,
    };
  }

  if (cleanCode === '8.1' && isDifferentFamily) {
    return {
      isCollision: true,
      reason: `Colisión operativa en cláusula 8.1: el control operacional origen («${sourceTitle}») cambia de enfoque en destino («${targetTitle}»).`,
    };
  }

  // Rule 2: Dynamic safety net for Chapter 8, 7.1.x technical subclauses, and custom CSV norms
  const isChapter8 = cleanCode === '8' || cleanCode.startsWith('8.');
  const isTechnical71Sub = cleanCode.startsWith('7.1.');
  const { overlapCoeff, jaccard } = computeSemanticSimilarity(sourceTokens, targetTokens);

  if ((isChapter8 || isTechnical71Sub) && isDifferentFamily) {
    if (overlapCoeff < 0.45 || jaccard < 0.25) {
      return {
        isCollision: true,
        reason: `Colisión semántica en cláusula ${cleanCode}: origen «${sourceTitle}» no coincide temáticamente con destino «${targetTitle}».`,
      };
    }
  }

  // Rule 3: Even for HLS chapters, block unexpected CSV overrides when titles diverge completely
  if (HLS_CORE_CHAPTERS.has(cleanCode)) {
    const aligned = isHlsTopicSemanticallyAligned({
      code: cleanCode,
      sourceTokens,
      targetTokens,
    });
    if (!aligned) {
      return {
        isCollision: true,
        reason: `Colisión semántica detectada en cláusula ${cleanCode}: origen «${sourceTitle}» diverge de destino «${targetTitle}».`,
      };
    }
  } else if (!isChapter8 && !isTechnical71Sub && isDifferentFamily) {
    if (overlapCoeff < 0.4 && jaccard < 0.25) {
      return {
        isCollision: true,
        reason: `Colisión semántica en cláusula ${cleanCode}: origen «${sourceTitle}» diverge de destino «${targetTitle}».`,
      };
    }
  }

  return { isCollision: false, reason: null };
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

function findDescendantsByCodePrefix(
  parentCode: string,
  normaReqs: ReadonlyArray<RequisitoLtree>
): RequisitoLtree[] {
  const prefix = `${parentCode.trim().toLowerCase()}.`;
  return normaReqs.filter((candidate) =>
    candidate.codigo.trim().toLowerCase().startsWith(prefix)
  );
}

function findRollupTargetCandidate(params: {
  sourceCode: string;
  sourceTokens: Set<string>;
  sourceFamily: IsoDisciplineFamily;
  targetFamily: IsoDisciplineFamily;
  targetByLowerCode: ReadonlyMap<string, RequisitoLtree>;
}): { candidate: RequisitoLtree | null; ancestorCollisionCandidate: RequisitoLtree | null } {
  const { sourceCode, sourceTokens, sourceFamily, targetFamily, targetByLowerCode } = params;
  const segments = sourceCode.trim().split('.');
  // Walk up from immediate parent down to level-2 clauses (e.g. 4.4.1 -> 4.4)
  for (let len = segments.length - 1; len >= 2; len -= 1) {
    const ancestorCode = segments.slice(0, len).join('.');
    const candidate = targetByLowerCode.get(ancestorCode.toLowerCase());
    if (!candidate) continue;

    // Only accept rollup automatically into structurally compatible HLS chapters or semantically aligned nodes
    const prefixBase = segments.slice(0, 2).join('.');
    const isStructurallyCompatiblePrefix =
      HLS_ROLLUP_ELIGIBLE_PREFIXES.has(prefixBase) ||
      HLS_CORE_CHAPTERS.has(ancestorCode);

    if (isStructurallyCompatiblePrefix) {
      const targetTokens = collectRequirementSemanticTokens(candidate);
      const isAligned =
        HLS_ROLLUP_ELIGIBLE_PREFIXES.has(prefixBase) ||
        isHlsTopicSemanticallyAligned({
          code: ancestorCode,
          sourceTokens,
          targetTokens,
        });
      if (isAligned) {
        return { candidate, ancestorCollisionCandidate: null };
      }
      return { candidate: null, ancestorCollisionCandidate: candidate };
    }

    // For non-HLS chapters (e.g. 8.x), check discipline + semantic alignment strictly
    const targetTokens = collectRequirementSemanticTokens(candidate);
    const { overlapCoeff } = computeSemanticSimilarity(sourceTokens, targetTokens);
    const sameDiscipline = sourceFamily === targetFamily && sourceFamily !== 'CUSTOM';
    if (sameDiscipline && overlapCoeff >= 0.45) {
      return { candidate, ancestorCollisionCandidate: null };
    }
    return { candidate: null, ancestorCollisionCandidate: candidate };
  }

  return { candidate: null, ancestorCollisionCandidate: null };
}

/**
 * Deterministic resolver evaluating how each normative clause assigned to `proceso`
 * in `sourceCert` maps onto `targetCert`'s standard (`id_norma`) and ISO 4.3 exclusions.
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

  const isSameNormId = Boolean(sourceNormaId && targetNormaId && sourceNormaId === targetNormaId);
  const isCrossStandard = !isSameNormId;

  const sourceFamily = normalizeStandardFamily(sourceCert.norma_codigo);
  const targetFamily = normalizeStandardFamily(targetCert.norma_codigo);

  const sourceReqs = orderNormaRequisitosHierarchically(
    getScopedNormaRequirements({
      id_norma: sourceNormaId,
      norma_codigo: sourceCert.norma_codigo,
      requirementsCatalog,
    })
  );
  const targetReqs = orderNormaRequisitosHierarchically(
    getScopedNormaRequirements({
      id_norma: targetNormaId,
      norma_codigo: targetCert.norma_codigo,
      requirementsCatalog,
    })
  );

  const sourceByLowerCode = new Map<string, RequisitoLtree>();
  for (const req of sourceReqs) {
    sourceByLowerCode.set(req.codigo.trim().toLowerCase(), req);
  }

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
  const rollupGroupByTargetId = new Map<string, number>();

  for (const item of sourceClausesList) {
    const cleanCode = item.codigo.trim();
    const lowerCode = cleanCode.toLowerCase();
    const sourceReq = sourceByLowerCode.get(lowerCode) ?? null;
    const sourceTitle = sanitizeMessageText(
      sourceReq?.titulo || item.titulo || `Cláusula ${cleanCode}`
    );
    const sourceDescendants = sourceReq
      ? findDescendantsInNorma(sourceReq, sourceReqs)
      : findDescendantsByCodePrefix(cleanCode, sourceReqs);

    const directTarget = targetByLowerCode.get(lowerCode) ?? null;

    // Case A: Same normative standard (`EXACT_SAME_NORM` or `EXCLUDED_ISO43`)
    if (!isCrossStandard) {
      if (!directTarget) {
        entries.push({
          entryKey: `clause:${cleanCode}`,
          status: 'NO_EQUIVALENT',
          sourceClauses: [cleanCode],
          sourceTitles: [sourceTitle],
          sourceRequisitos: sourceReq ? [sourceReq] : [],
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
        const blockingCode = exclusionCheck.blockingExclusionCodigo || directTarget.codigo;
        entries.push({
          entryKey: `clause:${cleanCode}`,
          status: 'EXCLUDED_ISO43',
          sourceClauses: [cleanCode],
          sourceTitles: [sourceTitle],
          sourceRequisitos: sourceReq ? [sourceReq] : [],
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
        sourceRequisitos: sourceReq ? [sourceReq] : [],
        targetCandidate: directTarget,
        descendantTargetCandidates: findDescendantsInNorma(directTarget, targetReqs),
        preselected: true,
        disabled: false,
        warningMessage: null,
        informativeNote: sanitizeMessageText(
          `Mapeo directo 1:1 en ${targetCert.norma_codigo}: ${directTarget.codigo} — ${directTarget.titulo}.`
        ),
      });
      continue;
    }

    // Case B: Cross-standard resolution
    const sourceTokens = collectRequirementSemanticTokens(sourceReq, sourceTitle);

    if (directTarget) {
      const exclusionCheck = isClauseBlockedByCertificateExclusions({
        cert: targetCert,
        targetRequisito: directTarget,
        requirementsCatalog,
        archivedNoAplicableIds,
      });

      if (exclusionCheck.blocked) {
        const blockingCode = exclusionCheck.blockingExclusionCodigo || directTarget.codigo;
        entries.push({
          entryKey: `clause:${cleanCode}`,
          status: 'EXCLUDED_ISO43',
          sourceClauses: [cleanCode],
          sourceTitles: [sourceTitle],
          sourceRequisitos: sourceReq ? [sourceReq] : [],
          targetCandidate: directTarget,
          descendantTargetCandidates: [],
          preselected: false,
          disabled: true,
          warningMessage: sanitizeMessageText(
            `La cláusula destino ${directTarget.codigo} está excluida como No Aplicable (ISO 4.3 bajo ${blockingCode}).`
          ),
          informativeNote: null,
          blockingExclusionCodigo: blockingCode,
          blockingJustificacion: exclusionCheck.blockingJustificacion
            ? sanitizeMessageText(exclusionCheck.blockingJustificacion)
            : undefined,
        });
        continue;
      }

      const targetTokens = collectRequirementSemanticTokens(directTarget);
      const collisionCheck = detectExplicitCrossStandardCollision({
        code: cleanCode,
        sourceFamily,
        targetFamily,
        sourceTitle,
        targetTitle: directTarget.titulo,
        sourceTokens,
        targetTokens,
      });

      if (collisionCheck.isCollision) {
        entries.push({
          entryKey: `clause:${cleanCode}`,
          status: 'SEMANTIC_COLLISION',
          sourceClauses: [cleanCode],
          sourceTitles: [sourceTitle],
          sourceRequisitos: sourceReq ? [sourceReq] : [],
          targetCandidate: directTarget,
          descendantTargetCandidates: [],
          preselected: false,
          disabled: false,
          warningMessage: sanitizeMessageText(
            collisionCheck.reason ||
              `Colisión semántica entre ${sourceCert.norma_codigo} (${sourceTitle}) y ${targetCert.norma_codigo} (${directTarget.titulo}).`
          ),
          informativeNote: sanitizeMessageText(
            `Origen: «${sourceTitle}» vs Destino: «${directTarget.titulo}». Requiere confirmación manual.`
          ),
        });
        continue;
      }

      const targetDescendants = findDescendantsInNorma(directTarget, targetReqs);
      const isRolldown =
        targetDescendants.length > 0 && sourceDescendants.length === 0;
      const isRollupFromTree =
        sourceDescendants.length > 0 && targetDescendants.length === 0;

      if (isRolldown) {
        const childrenLabel = targetDescendants.map((d) => d.codigo).join(', ');
        entries.push({
          entryKey: `clause:${cleanCode}`,
          status: 'HIERARCHICAL_ROLLDOWN',
          sourceClauses: [cleanCode],
          sourceTitles: [sourceTitle],
          sourceRequisitos: sourceReq ? [sourceReq] : [],
          targetCandidate: directTarget,
          descendantTargetCandidates: targetDescendants,
          preselected: true,
          disabled: false,
          warningMessage: null,
          informativeNote: sanitizeMessageText(
            `Cobertura jerárquica descendente (<@) en ${targetCert.norma_codigo}: al vincular ${directTarget.codigo} («${directTarget.titulo}») quedan cubiertas sus subcláusulas ${childrenLabel}.`
          ),
        });
        continue;
      }

      if (isRollupFromTree) {
        entries.push({
          entryKey: `clause:${cleanCode}`,
          status: 'HIERARCHICAL_ROLLUP',
          sourceClauses: [cleanCode],
          sourceTitles: [sourceTitle],
          sourceRequisitos: sourceReq ? [sourceReq] : [],
          targetCandidate: directTarget,
          descendantTargetCandidates: [],
          preselected: true,
          disabled: false,
          warningMessage: null,
          informativeNote: sanitizeMessageText(
            `Equivalencia consolidada en ${targetCert.norma_codigo}: ${directTarget.codigo} («${directTarget.titulo}»).`
          ),
        });
        continue;
      }

      entries.push({
        entryKey: `clause:${cleanCode}`,
        status: 'HLS_EQUIVALENT',
        sourceClauses: [cleanCode],
        sourceTitles: [sourceTitle],
        sourceRequisitos: sourceReq ? [sourceReq] : [],
        targetCandidate: directTarget,
        descendantTargetCandidates: targetDescendants,
        preselected: true,
        disabled: false,
        warningMessage: null,
        informativeNote: sanitizeMessageText(
          `Equivalencia HLS (${cleanCode}): origen «${sourceTitle}» → destino «${directTarget.titulo}».`
        ),
      });
      continue;
    }

    // Direct code missing in target: check downward expansion (parent -> children only) vs upward rollup (child -> parent)
    const targetChildrenOnly = findDescendantsByCodePrefix(cleanCode, targetReqs).filter(
      (child) =>
        !isClauseBlockedByCertificateExclusions({
          cert: targetCert,
          targetRequisito: child,
          requirementsCatalog,
          archivedNoAplicableIds,
        }).blocked
    );

    if (targetChildrenOnly.length > 0 && HLS_ROLLUP_ELIGIBLE_PREFIXES.has(cleanCode)) {
      const firstChild = targetChildrenOnly[0];
      const childrenLabel = targetChildrenOnly.map((c) => c.codigo).join(', ');
      entries.push({
        entryKey: `clause:${cleanCode}`,
        status: 'HIERARCHICAL_ROLLDOWN',
        sourceClauses: [cleanCode],
        sourceTitles: [sourceTitle],
        sourceRequisitos: sourceReq ? [sourceReq] : [],
        targetCandidate: firstChild,
        descendantTargetCandidates: targetChildrenOnly,
        preselected: true,
        disabled: false,
        warningMessage: null,
        informativeNote: sanitizeMessageText(
          `La norma destino desglosa ${cleanCode} en subcláusulas (${childrenLabel}); se sugiere ${firstChild.codigo} con opciones de expansión manual.`
        ),
      });
      continue;
    }

    const { candidate: rollupTarget, ancestorCollisionCandidate } = findRollupTargetCandidate({
      sourceCode: cleanCode,
      sourceTokens,
      sourceFamily,
      targetFamily,
      targetByLowerCode,
    });

    if (rollupTarget) {
      const exclusionCheck = isClauseBlockedByCertificateExclusions({
        cert: targetCert,
        targetRequisito: rollupTarget,
        requirementsCatalog,
        archivedNoAplicableIds,
      });

      if (exclusionCheck.blocked) {
        const blockingCode = exclusionCheck.blockingExclusionCodigo || rollupTarget.codigo;
        entries.push({
          entryKey: `clause:${cleanCode}`,
          status: 'EXCLUDED_ISO43',
          sourceClauses: [cleanCode],
          sourceTitles: [sourceTitle],
          sourceRequisitos: sourceReq ? [sourceReq] : [],
          targetCandidate: rollupTarget,
          descendantTargetCandidates: [],
          preselected: false,
          disabled: true,
          warningMessage: sanitizeMessageText(
            `El padre equivalente ${rollupTarget.codigo} está excluido por ISO 4.3 (${blockingCode}) en el certificado destino.`
          ),
          informativeNote: null,
          blockingExclusionCodigo: blockingCode,
          blockingJustificacion: exclusionCheck.blockingJustificacion
            ? sanitizeMessageText(exclusionCheck.blockingJustificacion)
            : undefined,
        });
        continue;
      }

      const existingIdx = rollupGroupByTargetId.get(rollupTarget.id);
      if (existingIdx !== undefined) {
        const existingEntry = entries[existingIdx];
        if (!existingEntry.sourceClauses.includes(cleanCode)) {
          existingEntry.sourceClauses.push(cleanCode);
        }
        existingEntry.sourceTitles.push(sourceTitle);
        if (sourceReq) {
          existingEntry.sourceRequisitos.push(sourceReq);
        }
        existingEntry.informativeNote = sanitizeMessageText(
          `Agrupación jerárquica (${existingEntry.sourceClauses.join(', ')}) → ${rollupTarget.codigo} («${rollupTarget.titulo}»).`
        );
      } else {
        const newIdx = entries.length;
        rollupGroupByTargetId.set(rollupTarget.id, newIdx);
        entries.push({
          entryKey: `rollup:${rollupTarget.codigo}`,
          status: 'HIERARCHICAL_ROLLUP',
          sourceClauses: [cleanCode],
          sourceTitles: [sourceTitle],
          sourceRequisitos: sourceReq ? [sourceReq] : [],
          targetCandidate: rollupTarget,
          descendantTargetCandidates: [],
          preselected: true,
          disabled: false,
          warningMessage: null,
          informativeNote: sanitizeMessageText(
            `Agrupación jerárquica (${cleanCode}) → ${rollupTarget.codigo} («${rollupTarget.titulo}»).`
          ),
        });
      }
      continue;
    }

    if (ancestorCollisionCandidate) {
      entries.push({
        entryKey: `clause:${cleanCode}`,
        status: 'SEMANTIC_COLLISION',
        sourceClauses: [cleanCode],
        sourceTitles: [sourceTitle],
        sourceRequisitos: sourceReq ? [sourceReq] : [],
        targetCandidate: ancestorCollisionCandidate,
        descendantTargetCandidates: [],
        preselected: false,
        disabled: false,
        warningMessage: sanitizeMessageText(
          `La subcláusula origen ${cleanCode} («${sourceTitle}») pertenece a un capítulo padre distinto en ${targetCert.norma_codigo} (${ancestorCollisionCandidate.codigo} «${ancestorCollisionCandidate.titulo}»).`
        ),
        informativeNote: null,
      });
      continue;
    }

    entries.push({
      entryKey: `clause:${cleanCode}`,
      status: 'NO_EQUIVALENT',
      sourceClauses: [cleanCode],
      sourceTitles: [sourceTitle],
      sourceRequisitos: sourceReq ? [sourceReq] : [],
      targetCandidate: null,
      descendantTargetCandidates: [],
      preselected: false,
      disabled: false,
      warningMessage: sanitizeMessageText(
        `La cláusula ${cleanCode} («${sourceTitle}») no tiene equivalente directo en ${targetCert.norma_codigo}. Puede omitirse o vincularse manualmente a otra cláusula destino.`
      ),
      informativeNote: null,
    });
  }

  const summaryCounts: ClauseResolutionSummaryCounts = {
    autoMappedCount: 0,
    hierarchicalCount: 0,
    semanticCollisionCount: 0,
    noEquivalentCount: 0,
    excludedIso43Count: 0,
  };

  for (const entry of entries) {
    if (entry.status === 'EXACT_SAME_NORM' || entry.status === 'HLS_EQUIVALENT') {
      summaryCounts.autoMappedCount += 1;
    } else if (
      entry.status === 'HIERARCHICAL_ROLLUP' ||
      entry.status === 'HIERARCHICAL_ROLLDOWN'
    ) {
      summaryCounts.hierarchicalCount += 1;
    } else if (entry.status === 'SEMANTIC_COLLISION') {
      summaryCounts.semanticCollisionCount += 1;
    } else if (entry.status === 'NO_EQUIVALENT') {
      summaryCounts.noEquivalentCount += 1;
    } else if (entry.status === 'EXCLUDED_ISO43') {
      summaryCounts.excludedIso43Count += 1;
    }
  }

  return {
    procesoId,
    sourceCertId,
    targetCertId,
    sourceNormaId,
    sourceNormaCodigo: sourceCert.norma_codigo,
    targetNormaId,
    targetNormaCodigo: targetCert.norma_codigo,
    isCrossStandard,
    entries,
    summaryCounts,
    availableManualTargetOptions,
  };
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
 * Resolves the final deduplicated, parent-before-child ordered list of `id_requisito`
 * guaranteed to belong strictly to `resolutionPlan.targetNormaId` and pass ISO 4.3 /
 * `canLinkRequisitoToProceso` governance checks.
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

    // Strict cross-norm guard: reject any foreign id_norma unconditionally
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
