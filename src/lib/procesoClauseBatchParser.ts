/**
 * Pure domain parser & hierarchical consolidator for smart multi-clause text selection
 * inside `#procesoRequisitosManagementPanel` (Block 2 -> Certificación -> Proceso -> Requisitos).
 *
 * Capabilities:
 * - Intelligent parsing of noisy/structured clause lists (commas, newlines, semicolons, pipes,
 *   bullets, parentheses, connector words, standard prefixes, case errors, missing/extra dots,
 *   underscores/slashes, and sibling hyphen ranges).
 * - Exact-level matching scoped strictly to the certificate's Norma (`9.1.1` !== `9.1.2`).
 * - Bottom-up parent consolidation (roll-up to the highest eligible ancestor up to the
 *   second level, i.e. `indentLevel >= 2`, never auto-consolidating into level-1 chapters;
 *   plus pruning redundant descendants when an ancestor is selected).
 * - ISO 4.3 `NO_APLICABLE` exclusion enforcement: blocks excluded clauses and their descendants,
 *   while still permitting selection of active parent clauses above an excluded child.
 * - Zero raw UUIDs in user-facing Spanish summaries.
 */

import { calculateLtreeIndentation, type RequisitoLtree } from './extraDomain';
import type { CertificadoDetailEntity } from './multisiteSampling';
import type { ProcesoBatchMode, ProcesoDetailEntity } from './procesoDomain';
import {
  annotateHierarchicalPickerRows,
  buildProcesoBatchPickerRows,
  getAvailableRequisitoOptionsForProceso,
  getScopedNormaRequirements,
} from './procesoDomain';
import { orderNormaRequisitosHierarchically } from './normaFullReader';

export interface ProcesoBatchTextSelectionResult {
  finalSelectedIds: string[];
  finalSelectedCodes: string[];
  directMatchedCodes: string[];
  rolledUpTransitions: Array<{ fromCodes: string[]; toCode: string }>;
  prunedChildCodes: string[];
  skippedExcludedCodes: string[];
  skippedAlreadyLinkedCodes: string[];
  invalidTokens: string[];
  normalizedMappings: Array<{ raw: string; matchedCode: string }>;
  recommendedBatchMode: ProcesoBatchMode;
  requiredExpandedAncestorIds: string[];
  summaryText: string;
}

const NOISE_WORDS = new Set([
  'clausula',
  'clausulas',
  'subclausula',
  'subclausulas',
  'requisito',
  'requisitos',
  'req',
  'reqs',
  'punto',
  'puntos',
  'numeral',
  'numerales',
  'apartado',
  'apartados',
  'seccion',
  'secciones',
  'inciso',
  'incisos',
  'norma',
  'normas',
  'clause',
  'clauses',
  'requirement',
  'requirements',
  'y',
  'e',
  'o',
  'u',
  'and',
  'or',
  'el',
  'la',
  'los',
  'las',
  'de',
  'del',
  'al',
  'para',
  'con',
  'en',
  'the',
  'iso',
  'ntf',
  'iec',
  'iso/iec',
]);

function stripDiacriticsLower(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function buildCodeCandidateVariants(rawToken: string): string[] {
  const candidates: string[] = [];
  const pushUnique = (val: string) => {
    const clean = val.trim().toLowerCase();
    if (clean && !candidates.includes(clean)) {
      candidates.push(clean);
    }
  };

  const trimmed = rawToken.trim().toLowerCase();
  if (!trimmed) return candidates;

  pushUnique(trimmed);

  // Strip common inline prefixes like "cl.4.1", "req:4.2", "§4.3", "#4.4"
  const prefixStripped = trimmed
    .replace(/^(?:clausula|cláusula|requisito|subclausula|subcláusula|cl|req|num|art|§|#)[:.\s-]*/i, '')
    .trim();
  if (prefixStripped && prefixStripped !== trimmed) {
    pushUnique(prefixStripped);
  }

  const baseForms = [trimmed, prefixStripped].filter(Boolean);
  for (const form of baseForms) {
    const dotted = form
      .replace(/[_/]+/g, '.')
      .replace(/\.{2,}/g, '.')
      .replace(/^\.+|\.+$/g, '');
    pushUnique(dotted);

    // Insert dots at digit<->letter boundaries (e.g., "4.3a" -> "4.3.a", "a11.2.6" -> "a.11.2.6")
    const boundaryDotted = dotted
      .replace(/(\d)([a-z])/gi, '$1.$2')
      .replace(/([a-z])(\d)/gi, '$1.$2')
      .replace(/\.{2,}/g, '.')
      .replace(/^\.+|\.+$/g, '');
    pushUnique(boundaryDotted);

    // Strip leading zeros on purely numeric segments (e.g., "04.01" -> "4.1")
    const noLeadingZeros = boundaryDotted
      .split('.')
      .map((seg) => (/^\d+$/.test(seg) ? String(Number(seg)) : seg))
      .join('.');
    pushUnique(noLeadingZeros);
  }

  return candidates;
}

function resolveTokenToRequisito(
  rawToken: string,
  reqByCodeLower: ReadonlyMap<string, RequisitoLtree>
): { req: RequisitoLtree | null; cleanedToken: string } {
  const cleanedToken = rawToken
    .replace(/^[\(\[\{"'“‘¿¡*•·§#\s]+/, '')
    .replace(/[\)\]\}"'”’.,:;!?\s]+$/, '')
    .trim();

  if (!cleanedToken) {
    return { req: null, cleanedToken: '' };
  }

  const candidates = buildCodeCandidateVariants(cleanedToken);
  for (const cand of candidates) {
    const hit = reqByCodeLower.get(cand);
    if (hit) {
      return { req: hit, cleanedToken };
    }
  }

  return { req: null, cleanedToken };
}

function isIgnorableNoiseToken(cleanedToken: string): boolean {
  if (!cleanedToken) return true;
  const plain = stripDiacriticsLower(cleanedToken);
  if (!plain) return true;
  if (NOISE_WORDS.has(plain)) return true;
  // Standard edition year tags like "9001:2015", "14001:2015", "27001:2022"
  if (/^\d{4,5}:\d{4}$/.test(plain)) return true;
  // Pure punctuation / separators
  if (/^[-–—_,.;:|/\\•·*]+$/.test(plain)) return true;
  return false;
}

interface HierarchyNodeInfo {
  req: RequisitoLtree;
  indentLevel: number;
  parentId: string | null;
  ancestorIds: string[];
  childrenIds: string[];
  alreadyLinked: boolean;
  isExcludedByIso43: boolean;
  disabled: boolean;
}

/**
 * Parses messy/structured clause list text, validates against the process's Norma and ISO 4.3
 * exclusions, merges optional existing selections, prunes redundant descendants, and rolls up
 * complete child sets up to the second level (never auto-consolidating into level-1 chapters).
 */
export function parseAndConsolidateProcesoBatchClauseInput(params: {
  rawText: string;
  cert?: CertificadoDetailEntity;
  currentProceso?: Pick<
    ProcesoDetailEntity,
    'id' | 'id_norma' | 'norma_codigo' | 'requisitos'
  > | null;
  idNorma?: string;
  normaCodigo?: string;
  requirementsCatalog?: ReadonlyArray<RequisitoLtree>;
  existingSelectedIds?: ReadonlyArray<string>;
  currentBatchMode?: ProcesoBatchMode;
  archivedProcesoIds?: ReadonlySet<string>;
  archivedNoAplicableIds?: ReadonlySet<string>;
}): ProcesoBatchTextSelectionResult {
  const {
    rawText,
    cert,
    currentProceso,
    requirementsCatalog,
    existingSelectedIds = [],
    currentBatchMode = 'mandatory',
    archivedProcesoIds,
    archivedNoAplicableIds,
  } = params;

  const targetNormaId = currentProceso?.id_norma || cert?.id_norma || params.idNorma || '';
  const targetNormaCodigo =
    currentProceso?.norma_codigo || cert?.norma_codigo || params.normaCodigo || '';

  const scopedReqs = orderNormaRequisitosHierarchically(
    getScopedNormaRequirements({
      id_norma: targetNormaId,
      norma_codigo: targetNormaCodigo,
      requirementsCatalog,
    })
  );

  const options = getAvailableRequisitoOptionsForProceso({
    id_norma: targetNormaId,
    norma_codigo: targetNormaCodigo,
    currentProcesoId: currentProceso?.id,
    linkedRequisitos: currentProceso?.requisitos || [],
    requirementsCatalog,
    cert,
    archivedNoAplicableIds,
    archivedProcesoIds,
  });
  const optionById = new Map(options.map((opt) => [opt.req.id, opt]));

  // Annotate hierarchy consistently with the batch picker UI
  const annotatedSeed = scopedReqs.map((req) => {
    const indent = calculateLtreeIndentation(req.ruta_materializada, req.codigo);
    return {
      req,
      indentLevel: Math.max(1, indent.level),
      parentId: null as string | null,
      ancestorIds: [] as string[],
      hasChildren: false,
      collapsibleLevel2Id: null as string | null,
    };
  });
  annotateHierarchicalPickerRows(annotatedSeed);

  const nodeById = new Map<string, HierarchyNodeInfo>();
  const reqByCodeLower = new Map<string, RequisitoLtree>();

  for (const row of annotatedSeed) {
    const opt = optionById.get(row.req.id);
    const alreadyLinked = opt?.alreadyLinkedToCurrentProceso ?? false;
    const isExcludedByIso43 = opt?.isExcludedByIso43 ?? false;
    const node: HierarchyNodeInfo = {
      req: row.req,
      indentLevel: row.indentLevel,
      parentId: row.parentId,
      ancestorIds: [...row.ancestorIds],
      childrenIds: [],
      alreadyLinked,
      isExcludedByIso43,
      disabled: alreadyLinked || isExcludedByIso43,
    };
    nodeById.set(row.req.id, node);
    reqByCodeLower.set(row.req.codigo.trim().toLowerCase(), row.req);
  }

  for (const node of nodeById.values()) {
    if (node.parentId) {
      const parent = nodeById.get(node.parentId);
      if (parent) {
        parent.childrenIds.push(node.req.id);
      }
    }
  }

  // 1. Preprocess standard headers & sibling hyphen ranges (e.g. "10.1 - 10.3", "4.3.a-c")
  let workingText = (rawText || '')
    .replace(/[\u2012\u2013\u2014\u2015\u2212]/g, '-')
    .replace(/\u00a0/g, ' ')
    // Strip explicit standard mentions like "ISO 9001:2015", "ISO/IEC 27001:2022", "NTF 4073"
    .replace(/\b(?:iso|ntf)(?:\s*\/\s*iec)?\s+\d{4,5}(?::\d{4})?\b/gi, ' ');

  const preInvalidTokens: string[] = [];
  const pushUniqueStr = (arr: string[], val: string) => {
    if (val && !arr.includes(val)) arr.push(val);
  };

  workingText = workingText.replace(
    /([A-Za-z0-9]+(?:[._/][A-Za-z0-9]+)*)\s*-\s*([A-Za-z0-9]+(?:[._/][A-Za-z0-9]+)*)/g,
    (fullMatch, leftRaw: string, rightRaw: string) => {
      const leftRes = resolveTokenToRequisito(leftRaw, reqByCodeLower);
      let rightRes = resolveTokenToRequisito(rightRaw, reqByCodeLower);

      // Handle shorthand end like "4.3.a-c" -> right becomes "4.3.c"
      if (leftRes.req && !rightRes.req && !/[._/]/.test(rightRaw)) {
        const leftParts = leftRes.req.codigo.split('.');
        if (leftParts.length > 1) {
          const shorthandCode = `${leftParts.slice(0, -1).join('.')}.${rightRaw.trim()}`;
          rightRes = resolveTokenToRequisito(shorthandCode, reqByCodeLower);
        }
      }

      if (leftRes.req && rightRes.req) {
        const leftNode = nodeById.get(leftRes.req.id);
        const rightNode = nodeById.get(rightRes.req.id);
        if (leftNode && rightNode && leftNode.parentId === rightNode.parentId) {
          const siblingPool = leftNode.parentId
            ? (nodeById.get(leftNode.parentId)?.childrenIds || [])
                .map((id) => nodeById.get(id)!.req)
            : annotatedSeed.filter((r) => r.parentId === null).map((r) => r.req);

          const startIdx = siblingPool.findIndex((r) => r.id === leftRes.req!.id);
          const endIdx = siblingPool.findIndex((r) => r.id === rightRes.req!.id);
          if (startIdx >= 0 && endIdx >= 0) {
            const lo = Math.min(startIdx, endIdx);
            const hi = Math.max(startIdx, endIdx);
            return ` ${siblingPool
              .slice(lo, hi + 1)
              .map((r) => r.codigo)
              .join(' ')} `;
          }
        }
      }

      // If left is valid and right is a prose word (e.g. "4.1 - Contexto"), keep left intact
      const looksLikeClauseRange =
        /[0-9]/.test(leftRaw) && (/[0-9]/.test(rightRaw) || /^[a-z]$/i.test(rightRaw.trim()));
      if (!looksLikeClauseRange) {
        return `${leftRaw} ${rightRaw}`;
      }

      pushUniqueStr(preInvalidTokens, fullMatch.trim());
      return ' ';
    }
  );

  // 2. Split on delimiters & parse individual tokens
  const rawChunks = workingText.split(/[\s,;\n\r|\t•·]+/);
  const directMatchedIds = new Set<string>();
  const directMatchedCodes: string[] = [];
  const skippedExcludedCodes: string[] = [];
  const skippedAlreadyLinkedCodes: string[] = [];
  const invalidTokens: string[] = [...preInvalidTokens];
  const normalizedMappings: Array<{ raw: string; matchedCode: string }> = [];

  for (const chunk of rawChunks) {
    if (!chunk) continue;
    const strippedRaw = chunk
      .replace(/^[\(\[\{"'“‘¿¡*•·\s]+/, '')
      .replace(/[\)\]\}"'”’.,:;!?\s]+$/, '')
      .trim();
    if (!strippedRaw || isIgnorableNoiseToken(strippedRaw)) continue;

    const { req, cleanedToken } = resolveTokenToRequisito(strippedRaw, reqByCodeLower);
    if (!req) {
      if (!isIgnorableNoiseToken(cleanedToken)) {
        pushUniqueStr(invalidTokens, cleanedToken);
      }
      continue;
    }

    const node = nodeById.get(req.id);
    if (!node) continue;

    if (node.isExcludedByIso43) {
      pushUniqueStr(skippedExcludedCodes, req.codigo);
      continue;
    }
    if (node.alreadyLinked) {
      pushUniqueStr(skippedAlreadyLinkedCodes, req.codigo);
      continue;
    }

    if (!directMatchedIds.has(req.id)) {
      directMatchedIds.add(req.id);
      directMatchedCodes.push(req.codigo);
    }

    if (
      cleanedToken.toLowerCase() !== req.codigo.trim().toLowerCase() &&
      !normalizedMappings.some(
        (m) => m.raw === cleanedToken && m.matchedCode === req.codigo
      )
    ) {
      normalizedMappings.push({ raw: cleanedToken, matchedCode: req.codigo });
    }
  }

  // 3. Merge existing valid checklist selection (if any)
  const workingSet = new Set<string>();
  for (const existingId of existingSelectedIds) {
    const cleanId = (existingId || '').trim();
    const node = nodeById.get(cleanId);
    if (node && !node.disabled) {
      workingSet.add(cleanId);
    }
  }
  for (const id of directMatchedIds) {
    workingSet.add(id);
  }

  // 4. Prune redundant descendants already covered by a selected ancestor
  const prunedChildCodes: string[] = [];
  for (const id of Array.from(workingSet)) {
    const node = nodeById.get(id);
    if (!node) continue;
    const coveredBySelectedAncestor = node.ancestorIds.some((ancId) =>
      workingSet.has(ancId)
    );
    if (coveredBySelectedAncestor) {
      workingSet.delete(id);
      pushUniqueStr(prunedChildCodes, node.req.codigo);
    }
  }

  // 5. Bottom-up parent consolidation: when all non-excluded direct children of an eligible
  //    parent are selected, roll up to that parent instead of keeping individual children —
  //    stopping at the second level (indentLevel >= 2). First-level chapter clauses (indentLevel === 1,
  //    e.g. "4", "5", "6") are excluded from automatic roll-up.
  const rolledUpTransitions: Array<{ fromCodes: string[]; toCode: string }> = [];
  const candidateParentsDesc = Array.from(nodeById.values())
    .filter((n) => n.childrenIds.length > 0 && !n.disabled && n.indentLevel >= 2)
    .sort((a, b) => b.indentLevel - a.indentLevel);

  let changed = true;
  while (changed) {
    changed = false;
    for (const parent of candidateParentsDesc) {
      if (workingSet.has(parent.req.id)) continue;

      const directChildren = parent.childrenIds
        .map((cid) => nodeById.get(cid))
        .filter((c): c is HierarchyNodeInfo => Boolean(c));

      // Active children are those not blocked by ISO 4.3 NO_APLICABLE exclusions
      const activeChildren = directChildren.filter((c) => !c.isExcludedByIso43);
      if (activeChildren.length === 0) continue;

      // Require every active direct child to be in the current working selection set
      // (already-linked children are excluded from roll-up so previously linked siblings don't trigger unexpected replacement)
      const allActiveChildrenSelected = activeChildren.every((c) =>
        workingSet.has(c.req.id)
      );
      if (!allActiveChildrenSelected) continue;

      const rolledCodes = activeChildren.map((c) => c.req.codigo);
      for (const c of activeChildren) {
        workingSet.delete(c.req.id);
      }
      workingSet.add(parent.req.id);
      rolledUpTransitions.push({
        fromCodes: rolledCodes,
        toCode: parent.req.codigo,
      });
      changed = true;
    }

    // Re-prune any descendants in case a higher ancestor rolled up
    if (changed) {
      for (const id of Array.from(workingSet)) {
        const node = nodeById.get(id);
        if (!node) continue;
        if (node.ancestorIds.some((ancId) => workingSet.has(ancId))) {
          workingSet.delete(id);
        }
      }
    }
  }

  // 6. Order deterministically by hierarchical tree order & compute UI expansion/mode metadata
  const finalSelectedIds: string[] = [];
  const finalSelectedCodes: string[] = [];
  const requiredExpandedAncestorSet = new Set<string>();

  for (const row of annotatedSeed) {
    if (!workingSet.has(row.req.id)) continue;
    finalSelectedIds.push(row.req.id);
    finalSelectedCodes.push(row.req.codigo);
    for (const ancId of row.ancestorIds) {
      requiredExpandedAncestorSet.add(ancId);
    }
  }

  // Determine whether the active batchMode hides any selected clause
  let recommendedBatchMode: ProcesoBatchMode = currentBatchMode;
  if (finalSelectedIds.length > 0 && currentBatchMode !== 'all') {
    const currentPicker = buildProcesoBatchPickerRows({
      cert,
      currentProceso,
      idNorma: targetNormaId,
      normaCodigo: targetNormaCodigo,
      requirementsCatalog,
      mode: currentBatchMode,
      archivedProcesoIds,
      archivedNoAplicableIds,
    });
    const visibleInCurrent = new Set(currentPicker.rows.map((r) => r.req.id));
    if (finalSelectedIds.some((id) => !visibleInCurrent.has(id))) {
      if (currentBatchMode === 'pending') {
        const mandatoryPicker = buildProcesoBatchPickerRows({
          cert,
          currentProceso,
          idNorma: targetNormaId,
          normaCodigo: targetNormaCodigo,
          requirementsCatalog,
          mode: 'mandatory',
          archivedProcesoIds,
          archivedNoAplicableIds,
        });
        const visibleInMandatory = new Set(mandatoryPicker.rows.map((r) => r.req.id));
        recommendedBatchMode = finalSelectedIds.every((id) =>
          visibleInMandatory.has(id)
        )
          ? 'mandatory'
          : 'all';
      } else {
        recommendedBatchMode = 'all';
      }
    }
  }

  // 7. Build concise Spanish Zero-UUID feedback summary
  const summaryParts: string[] = [];
  if (finalSelectedCodes.length > 0) {
    summaryParts.push(
      `Seleccionadas ${finalSelectedCodes.length} cláusula(s): ${finalSelectedCodes.join(', ')}.`
    );
  } else {
    summaryParts.push('No se seleccionaron cláusulas nuevas.');
  }
  if (rolledUpTransitions.length > 0) {
    const rollText = rolledUpTransitions
      .map((t) => `${t.fromCodes.join(' + ')} → ${t.toCode}`)
      .join('; ');
    summaryParts.push(`Consolidadas al padre: ${rollText}.`);
  }
  if (skippedExcludedCodes.length > 0) {
    summaryParts.push(
      `Omitidas por exclusión ISO 4.3: ${skippedExcludedCodes.join(', ')}.`
    );
  }
  if (skippedAlreadyLinkedCodes.length > 0) {
    summaryParts.push(
      `Ya vinculadas al proceso: ${skippedAlreadyLinkedCodes.join(', ')}.`
    );
  }
  if (invalidTokens.length > 0) {
    const normaHint = targetNormaCodigo ? ` en ${targetNormaCodigo}` : '';
    summaryParts.push(
      `No válidas o inexistentes${normaHint}: ${invalidTokens.join(', ')}.`
    );
  }

  return {
    finalSelectedIds,
    finalSelectedCodes,
    directMatchedCodes,
    rolledUpTransitions,
    prunedChildCodes,
    skippedExcludedCodes,
    skippedAlreadyLinkedCodes,
    invalidTokens,
    normalizedMappings,
    recommendedBatchMode,
    requiredExpandedAncestorIds: Array.from(requiredExpandedAncestorSet),
    summaryText: summaryParts.join(' '),
  };
}
