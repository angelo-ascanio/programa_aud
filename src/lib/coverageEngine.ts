/**
 * Step 2.1: Pure TypeScript Normative Coverage Engine & Smart-Mutation State Reconciler
 * Isomorphic 1:1 mirror of PostgreSQL `evaluar_cobertura_certificado`,
 * `resumen_cobertura_certificado`, and `declarar_no_aplicable_con_mutacion`.
 */
import { countNormativeObligationTerms, stripHtmlToSearchText } from './clauseRenderer';
import type { RequisitoLtree } from './extraDomain';
import type {
  CertificadoDetailEntity,
  NonApplicableRequirementEntity,
  ProcessCertificateClausesEntry,
  ProcessEntity,
  ProcessRequirementMapping,
} from './multisiteSampling';
import { orderNormaRequisitosHierarchically } from './normaFullReader';
import { syncActiveCertVersionSnapshot } from './certificadoVersionDomain';

export type ClauseCoverageState =
  | 'CUBIERTO'
  | 'NO_APLICABLE'
  | 'INFORMATIVA'
  | 'PARCIAL'
  | 'MIXTO'
  | 'PENDIENTE';

export interface ClauseCoverageNodeResult {
  id_requisito: string;
  codigo: string;
  titulo: string;
  ruta_materializada: string;
  nivel: number;
  es_padre: boolean;
  es_obligatorio: boolean;
  estado: ClauseCoverageState;
  directProcessIds: string[];
  directProcessNames: string[];
  inheritedFromProcessCodigo: string | null;
  inheritedProcessIds?: string[];
  inheritedProcessNames?: string[];
  exclusionId: string | null;
  effectiveExclusionId?: string | null;
  exclusionReason: string | null;
  inheritedExclusionCodigo: string | null;
  mandatoryDescendantCount: number;
  coveredDescendantCount: number;
  excludedDescendantCount: number;
  pendingDescendantCount: number;
}

export interface CertificateCoverageSummary {
  id_certificado: string;
  id_certificado_version?: string;
  id_norma: string;
  totalObligatorios: number;
  cubiertosPorProceso: number;
  excluidosNoAplicables: number;
  pendientes: number;
  porcentajeCobertura: number;
  coberturaCompleta: boolean;
  hasAnyDirectAssignments: boolean;
}

export interface ExcludedSubtreeRootInfo {
  exclusionId: string;
  codigo: string;
  ruta_materializada: string;
}

export interface CertificateCoverageReport {
  summary: CertificateCoverageSummary;
  nodes: ClauseCoverageNodeResult[];
  nodeByRequisitoId: ReadonlyMap<string, ClauseCoverageNodeResult>;
  pendingMandatoryNodes: ClauseCoverageNodeResult[];
  excludedSubtreeRoots: ReadonlyMap<string, ExcludedSubtreeRootInfo>;
}

export interface SmartMutationPrunedLink {
  id_proceso: string;
  nombre_proceso: string;
  codigo: string;
  ruta_materializada: string;
}

export interface EvaluateCertificateCoverageParams {
  cert: CertificadoDetailEntity;
  requirementsCatalog: ReadonlyArray<RequisitoLtree>;
  targetVersionId?: string;
  archivedProcesoIds?: ReadonlySet<string>;
  archivedNoAplicableIds?: ReadonlySet<string>;
}

export interface PreviewNonApplicableSmartMutationParams {
  cert: CertificadoDetailEntity;
  targetRequisito: Pick<RequisitoLtree, 'id' | 'id_norma' | 'codigo' | 'ruta_materializada'>;
  requirementsCatalog: ReadonlyArray<RequisitoLtree>;
  archivedProcesoIds?: ReadonlySet<string>;
}

export interface NonApplicableSmartMutationPreview {
  willMutate: boolean;
  prunedLinks: SmartMutationPrunedLink[];
  affectedProcessCount: number;
}

export interface SmartMutationProcessLike {
  id: string;
  clausulas_cubiertas: string[];
  requisitos_detalle?: ProcessRequirementMapping[];
  requisitos_by_certificado?: Record<string, ProcessCertificateClausesEntry>;
  ownerCertId?: string;
}

export interface ApplyNonApplicableSmartMutationParams<
  TProcess extends SmartMutationProcessLike = SmartMutationProcessLike,
> {
  certificates: ReadonlyArray<CertificadoDetailEntity>;
  processes: ReadonlyArray<TProcess>;
  targetCertId: string;
  exclusion: NonApplicableRequirementEntity;
  targetRequisito: Pick<RequisitoLtree, 'id' | 'id_norma' | 'codigo' | 'ruta_materializada'>;
  requirementsCatalog: ReadonlyArray<RequisitoLtree>;
  mode?: 'upsert' | 'restore';
  archivedProcesoIds?: ReadonlySet<string>;
}

export interface ApplyNonApplicableSmartMutationResult<
  TProcess extends SmartMutationProcessLike = SmartMutationProcessLike,
> {
  nextCertificates: CertificadoDetailEntity[];
  nextProcesses: TProcess[];
  prunedLinks: SmartMutationPrunedLink[];
}

export interface IsClauseBlockedByExclusionsParams {
  cert: CertificadoDetailEntity;
  targetRequisito: Pick<RequisitoLtree, 'id' | 'id_norma' | 'codigo' | 'ruta_materializada'>;
  requirementsCatalog: ReadonlyArray<RequisitoLtree>;
  archivedNoAplicableIds?: ReadonlySet<string>;
}

export interface ClauseExclusionBlockResult {
  blocked: boolean;
  blockingExclusionCodigo?: string;
  blockingJustificacion?: string;
}

const NON_MANDATORY_ROOT_CHAPTERS = new Set(['0', '1', '2', '3']);

/**
 * Pure LTREE descendant predicate mirroring PostgreSQL `candidatePath <@ ancestorPath`.
 * Prevents prefix collisions (e.g., `'4.4_10'` under `'4.4_1'` returns `false`) via dot boundary checks.
 */
export function isLtreeSelfOrDescendant(
  candidatePath: string,
  ancestorPath: string
): boolean {
  const c = (candidatePath || '').trim();
  const a = (ancestorPath || '').trim();
  if (!c || !a) return false;
  return c === a || c.startsWith(`${a}.`);
}

function clauseHasOwnObligationTerms(req: RequisitoLtree): boolean {
  const esHtml = req.translations?.es?.content_html ?? '';
  const enHtml = req.translations?.en?.content_html ?? '';
  if (esHtml || enHtml) {
    const esCounts = countNormativeObligationTerms(esHtml);
    const enCounts = countNormativeObligationTerms(enHtml);
    return (
      esCounts.debe > 0 ||
      esCounts.shall > 0 ||
      enCounts.debe > 0 ||
      enCounts.shall > 0
    );
  }
  const desc = (req.descripcion || '').trim();
  if (!desc) return false;
  const descCounts = countNormativeObligationTerms(desc);
  return descCounts.debe > 0 || descCounts.shall > 0;
}

function getRootChapterSegment(codigo: string): string {
  return (codigo || '').trim().split('.')[0]?.trim() ?? '';
}

/**
 * Deterministic hybrid mandatory-obligation classifier mirroring Step 1.1:
 * honors explicit/manual boolean `es_obligatorio`, or evaluates `AUTO_CHAPTER` ->
 * `AUTO_TEXT` (`debe`/`shall`) -> `AUTO_INHERITED` -> `AUTO_STRUCTURAL`.
 */
export function resolveRequisitoIsMandatory(
  req: RequisitoLtree,
  standardHasTranslations: boolean,
  ancestorHasOwnMust: boolean
): boolean {
  if (typeof req.es_obligatorio === 'boolean') {
    return req.es_obligatorio;
  }

  const rootChapter = getRootChapterSegment(req.codigo);
  if (NON_MANDATORY_ROOT_CHAPTERS.has(rootChapter)) {
    return false;
  }

  if (standardHasTranslations) {
    if (clauseHasOwnObligationTerms(req)) {
      return true;
    }
    if (ancestorHasOwnMust) {
      return true;
    }
    return false;
  }

  return !req.es_padre;
}

function scopeNormaClauses(
  cert: Pick<CertificadoDetailEntity, 'id_norma' | 'norma_codigo'>,
  requirementsCatalog: ReadonlyArray<RequisitoLtree>
): RequisitoLtree[] {
  const active = requirementsCatalog.filter((r) => !r.deleted_at);
  const cleanNormaId = (cert.id_norma || '').trim();
  const cleanNormaCode = (cert.norma_codigo || '').trim().toLowerCase();
  const hasIdMatches =
    Boolean(cleanNormaId) && active.some((r) => r.id_norma === cleanNormaId);

  const scoped = active.filter((r) =>
    hasIdMatches
      ? r.id_norma === cleanNormaId
      : Boolean(cleanNormaCode) && r.norma_codigo.trim().toLowerCase() === cleanNormaCode
  );

  return orderNormaRequisitosHierarchically(scoped);
}

function resolveClauseObligationMap(
  normaClauses: ReadonlyArray<RequisitoLtree>
): ReadonlyMap<string, boolean> {
  let standardHasTranslations = false;
  const byId = new Map<string, RequisitoLtree>();
  const ownMustById = new Map<string, boolean>();

  for (const req of normaClauses) {
    byId.set(req.id, req);
    const esHtml = req.translations?.es?.content_html ?? '';
    const enHtml = req.translations?.en?.content_html ?? '';
    if (
      (esHtml && stripHtmlToSearchText(esHtml).length > 0) ||
      (enHtml && stripHtmlToSearchText(enHtml).length > 0)
    ) {
      standardHasTranslations = true;
    }
    ownMustById.set(req.id, clauseHasOwnObligationTerms(req));
  }

  const mandatoryById = new Map<string, boolean>();
  for (const req of normaClauses) {
    let ancestorHasOwnMust = false;
    let cursorParentId = req.id_requisito_padre ?? null;
    const visited = new Set<string>([req.id]);

    while (cursorParentId && !visited.has(cursorParentId)) {
      visited.add(cursorParentId);
      const parentClause = byId.get(cursorParentId);
      if (!parentClause) break;
      if (
        !NON_MANDATORY_ROOT_CHAPTERS.has(getRootChapterSegment(parentClause.codigo)) &&
        ownMustById.get(parentClause.id)
      ) {
        ancestorHasOwnMust = true;
        break;
      }
      cursorParentId = parentClause.id_requisito_padre ?? null;
    }

    if (!ancestorHasOwnMust && req.ruta_materializada) {
      for (const candidate of normaClauses) {
        if (
          candidate.id !== req.id &&
          !NON_MANDATORY_ROOT_CHAPTERS.has(getRootChapterSegment(candidate.codigo)) &&
          ownMustById.get(candidate.id) &&
          isLtreeSelfOrDescendant(req.ruta_materializada, candidate.ruta_materializada)
        ) {
          ancestorHasOwnMust = true;
          break;
        }
      }
    }

    mandatoryById.set(
      req.id,
      resolveRequisitoIsMandatory(req, standardHasTranslations, ancestorHasOwnMust)
    );
  }

  return mandatoryById;
}

interface ResolvedExclusionEntry {
  exclusionId: string;
  id_requisito: string;
  codigo: string;
  ruta_materializada: string;
  justificacion: string;
}

interface ResolvedProcessClauseLink {
  id_proceso: string;
  nombre_proceso: string;
  id_requisito: string;
  codigo: string;
  ruta_materializada: string;
}

function buildClauseLookup(normaClauses: ReadonlyArray<RequisitoLtree>): {
  byId: Map<string, RequisitoLtree>;
  byLowerCode: Map<string, RequisitoLtree>;
} {
  const byId = new Map<string, RequisitoLtree>();
  const byLowerCode = new Map<string, RequisitoLtree>();
  for (const req of normaClauses) {
    byId.set(req.id, req);
    byLowerCode.set(req.codigo.trim().toLowerCase(), req);
  }
  return { byId, byLowerCode };
}

function resolveEffectiveCoverageVersionId(
  cert: CertificadoDetailEntity,
  explicitTargetVersionId?: string
): string | undefined {
  const cleanExplicit = (explicitTargetVersionId || '').trim();
  if (cleanExplicit) return cleanExplicit;
  const cleanSelected = (cert.selected_version_id || '').trim();
  if (cleanSelected) return cleanSelected;
  const cleanCurrent = (cert.id_certificado_version || '').trim();
  return cleanCurrent || undefined;
}

function resolveVersionScopedExclusions(
  cert: CertificadoDetailEntity,
  effectiveVersionId: string | undefined,
  explicitTargetVersionId?: string
): ReadonlyArray<NonApplicableRequirementEntity> {
  if (!effectiveVersionId) {
    return cert.noAplicables || [];
  }
  const matchedSnapshot = cert.versiones?.find(
    (v) => v.id === effectiveVersionId && !v.deleted_at
  );
  if (matchedSnapshot && Array.isArray(matchedSnapshot.noAplicables)) {
    return matchedSnapshot.noAplicables;
  }

  const baseList = cert.noAplicables || [];
  const hasExplicitVersion = Boolean((explicitTargetVersionId || '').trim());
  const defaultCertVersionId = (cert.id_certificado_version || '').trim();

  return baseList.filter((item) => {
    const itemVersion = (item.id_certificado_version || '').trim();
    if (itemVersion) {
      return itemVersion === effectiveVersionId;
    }
    if (hasExplicitVersion) {
      if (defaultCertVersionId) {
        return defaultCertVersionId === effectiveVersionId;
      }
      return !cert.versiones || cert.versiones.length === 0;
    }
    return true;
  });
}

function resolveVersionScopedProcesses(
  cert: CertificadoDetailEntity,
  effectiveVersionId: string | undefined,
  explicitTargetVersionId?: string
): ReadonlyArray<ProcessEntity> {
  if (!effectiveVersionId) {
    return cert.procesos || [];
  }
  const matchedSnapshot = cert.versiones?.find(
    (v) => v.id === effectiveVersionId && !v.deleted_at
  );
  if (matchedSnapshot && Array.isArray(matchedSnapshot.procesos)) {
    return matchedSnapshot.procesos;
  }

  const baseList = cert.procesos || [];
  const hasExplicitVersion = Boolean((explicitTargetVersionId || '').trim());
  const defaultCertVersionId = (cert.id_certificado_version || '').trim();

  return baseList.filter((proc) => {
    const procVersion = (proc.id_certificado_version || '').trim();
    if (procVersion) {
      return procVersion === effectiveVersionId;
    }
    if (hasExplicitVersion) {
      if (defaultCertVersionId) {
        return defaultCertVersionId === effectiveVersionId;
      }
      return !cert.versiones || cert.versiones.length === 0;
    }
    return true;
  });
}

function collectActiveExclusions(
  cert: CertificadoDetailEntity,
  normaClauses: ReadonlyArray<RequisitoLtree>,
  archivedNoAplicableIds?: ReadonlySet<string>,
  effectiveVersionId?: string,
  explicitTargetVersionId?: string
): ResolvedExclusionEntry[] {
  const { byId, byLowerCode } = buildClauseLookup(normaClauses);
  const resolved: ResolvedExclusionEntry[] = [];
  const scopedExclusions = resolveVersionScopedExclusions(
    cert,
    effectiveVersionId,
    explicitTargetVersionId
  );

  for (const na of scopedExclusions) {
    if (archivedNoAplicableIds?.has(na.id)) continue;
    const matchedReq =
      byId.get(na.id_requisito) ||
      byLowerCode.get((na.requisito_codigo || '').trim().toLowerCase());
    const ruta = (matchedReq?.ruta_materializada || na.ruta_materializada || '').trim();
    const codigo = matchedReq?.codigo || na.requisito_codigo;
    if (!matchedReq && !ruta) continue;

    resolved.push({
      exclusionId: na.id,
      id_requisito: matchedReq?.id || na.id_requisito,
      codigo,
      ruta_materializada: ruta,
      justificacion: na.justificacion || '',
    });
  }

  return resolved;
}

function extractProcessClauseCodesForCert(
  proc: Pick<
    ProcessEntity,
    'clausulas_cubiertas' | 'requisitos_detalle' | 'requisitos_by_certificado'
  >,
  certId: string,
  effectiveVersionId?: string
): string[] {
  const versionKey = effectiveVersionId ? `${certId}:${effectiveVersionId}` : '';
  const scoped =
    (versionKey ? proc.requisitos_by_certificado?.[versionKey] : undefined) ||
    proc.requisitos_by_certificado?.[certId];
  if (scoped) {
    return [
      ...(scoped.clausulas_cubiertas || []),
      ...(scoped.requisitos_detalle || []).map((d) => d.codigo),
    ];
  }
  return [
    ...(proc.clausulas_cubiertas || []),
    ...(proc.requisitos_detalle || []).map((d) => d.codigo),
  ];
}

function collectActiveProcessLinks(
  cert: CertificadoDetailEntity,
  normaClauses: ReadonlyArray<RequisitoLtree>,
  archivedProcesoIds?: ReadonlySet<string>,
  effectiveVersionId?: string,
  explicitTargetVersionId?: string
): { links: ResolvedProcessClauseLink[]; hasAnyDirectAssignments: boolean } {
  const { byLowerCode } = buildClauseLookup(normaClauses);
  const links: ResolvedProcessClauseLink[] = [];
  let hasAnyDirectAssignments = false;
  const scopedProcesses = resolveVersionScopedProcesses(
    cert,
    effectiveVersionId,
    explicitTargetVersionId
  );

  for (const proc of scopedProcesses) {
    if (archivedProcesoIds?.has(proc.id)) continue;

    const seenProcCodes = new Set<string>();
    const rawCodes = extractProcessClauseCodesForCert(proc, cert.id, effectiveVersionId);

    for (const rawCode of rawCodes) {
      const cleanCode = (rawCode || '').trim();
      const lowerCode = cleanCode.toLowerCase();
      if (!lowerCode || seenProcCodes.has(lowerCode)) continue;
      seenProcCodes.add(lowerCode);
      hasAnyDirectAssignments = true;

      const matchedReq = byLowerCode.get(lowerCode);
      if (!matchedReq) continue;

      links.push({
        id_proceso: proc.id,
        nombre_proceso: proc.nombre_proceso,
        id_requisito: matchedReq.id,
        codigo: matchedReq.codigo,
        ruta_materializada: matchedReq.ruta_materializada,
      });
    }
  }

  return { links, hasAnyDirectAssignments };
}

/**
 * Evaluates full hierarchical normative coverage for a certificate, matching PostgreSQL
 * `evaluar_cobertura_certificado` & `resumen_cobertura_certificado` 1:1.
 * When `targetVersionId` (or `cert.selected_version_id` / `cert.id_certificado_version`)
 * is provided, evaluates strictly the processes and exclusions scoped to that version.
 */
export function evaluateCertificateCoverage(
  params: EvaluateCertificateCoverageParams
): CertificateCoverageReport {
  const {
    cert,
    requirementsCatalog,
    targetVersionId,
    archivedProcesoIds,
    archivedNoAplicableIds,
  } = params;

  const effectiveVersionId = resolveEffectiveCoverageVersionId(cert, targetVersionId);
  const normaClauses = scopeNormaClauses(cert, requirementsCatalog);
  const mandatoryById = resolveClauseObligationMap(normaClauses);
  const activeExclusions = collectActiveExclusions(
    cert,
    normaClauses,
    archivedNoAplicableIds,
    effectiveVersionId,
    targetVersionId
  );
  const { links: processLinks, hasAnyDirectAssignments } = collectActiveProcessLinks(
    cert,
    normaClauses,
    archivedProcesoIds,
    effectiveVersionId,
    targetVersionId
  );

  const excludedSubtreeRoots = new Map<string, ExcludedSubtreeRootInfo>();
  for (const excl of activeExclusions) {
    excludedSubtreeRoots.set(excl.id_requisito, {
      exclusionId: excl.exclusionId,
      codigo: excl.codigo,
      ruta_materializada: excl.ruta_materializada,
    });
  }

  // Pass 1: Direct & downward (<@) exclusion/process evaluation per clause
  const nodes: ClauseCoverageNodeResult[] = normaClauses.map((req) => {
    const esObligatorio = mandatoryById.get(req.id) ?? false;
    const reqPath = (req.ruta_materializada || '').trim();

    const matchingExclusions = activeExclusions.filter(
      (excl) =>
        excl.id_requisito === req.id ||
        isLtreeSelfOrDescendant(reqPath, excl.ruta_materializada)
    );

    if (matchingExclusions.length > 0) {
      const directExcl = matchingExclusions.find((e) => e.id_requisito === req.id);
      const closestAncestorExcl = matchingExclusions
        .slice()
        .sort((a, b) => b.ruta_materializada.length - a.ruta_materializada.length)[0];

      return {
        id_requisito: req.id,
        codigo: req.codigo,
        titulo: req.titulo || req.codigo,
        ruta_materializada: req.ruta_materializada,
        nivel: req.nivel,
        es_padre: req.es_padre,
        es_obligatorio: esObligatorio,
        estado: 'NO_APLICABLE',
        directProcessIds: [],
        directProcessNames: [],
        inheritedFromProcessCodigo: null,
        inheritedProcessIds: [],
        inheritedProcessNames: [],
        exclusionId: directExcl ? directExcl.exclusionId : null,
        effectiveExclusionId: directExcl
          ? directExcl.exclusionId
          : closestAncestorExcl.exclusionId,
        exclusionReason: directExcl
          ? directExcl.justificacion
          : closestAncestorExcl.justificacion,
        inheritedExclusionCodigo: directExcl ? null : closestAncestorExcl.codigo,
        mandatoryDescendantCount: 0,
        coveredDescendantCount: 0,
        excludedDescendantCount: 0,
        pendingDescendantCount: 0,
      };
    }

    const matchingProcessLinks = processLinks.filter(
      (link) =>
        link.id_requisito === req.id ||
        isLtreeSelfOrDescendant(reqPath, link.ruta_materializada)
    );

    if (matchingProcessLinks.length > 0) {
      const directLinks = matchingProcessLinks.filter((l) => l.id_requisito === req.id);
      const directProcessIds: string[] = [];
      const directProcessNames: string[] = [];
      const seenProc = new Set<string>();
      for (const link of directLinks) {
        if (!seenProc.has(link.id_proceso)) {
          seenProc.add(link.id_proceso);
          directProcessIds.push(link.id_proceso);
          directProcessNames.push(link.nombre_proceso);
        }
      }

      const inheritedProcessIds: string[] = [];
      const inheritedProcessNames: string[] = [];
      const seenAllProc = new Set<string>(directProcessIds);
      for (const link of matchingProcessLinks) {
        if (!seenAllProc.has(link.id_proceso)) {
          seenAllProc.add(link.id_proceso);
          inheritedProcessIds.push(link.id_proceso);
          inheritedProcessNames.push(link.nombre_proceso);
        }
      }

      let inheritedFromProcessCodigo: string | null = null;
      if (directProcessIds.length === 0) {
        const closestAncestorLink = matchingProcessLinks
          .slice()
          .sort((a, b) => b.ruta_materializada.length - a.ruta_materializada.length)[0];
        inheritedFromProcessCodigo = closestAncestorLink?.codigo ?? null;
      }

      return {
        id_requisito: req.id,
        codigo: req.codigo,
        titulo: req.titulo || req.codigo,
        ruta_materializada: req.ruta_materializada,
        nivel: req.nivel,
        es_padre: req.es_padre,
        es_obligatorio: esObligatorio,
        estado: 'CUBIERTO',
        directProcessIds,
        directProcessNames,
        inheritedFromProcessCodigo,
        inheritedProcessIds,
        inheritedProcessNames,
        exclusionId: null,
        effectiveExclusionId: null,
        exclusionReason: null,
        inheritedExclusionCodigo: null,
        mandatoryDescendantCount: 0,
        coveredDescendantCount: 0,
        excludedDescendantCount: 0,
        pendingDescendantCount: 0,
      };
    }

    return {
      id_requisito: req.id,
      codigo: req.codigo,
      titulo: req.titulo || req.codigo,
      ruta_materializada: req.ruta_materializada,
      nivel: req.nivel,
      es_padre: req.es_padre,
      es_obligatorio: esObligatorio,
      estado: esObligatorio ? 'PENDIENTE' : 'INFORMATIVA',
      directProcessIds: [],
      directProcessNames: [],
      inheritedFromProcessCodigo: null,
      inheritedProcessIds: [],
      inheritedProcessNames: [],
      exclusionId: null,
      effectiveExclusionId: null,
      exclusionReason: null,
      inheritedExclusionCodigo: null,
      mandatoryDescendantCount: 0,
      coveredDescendantCount: 0,
      excludedDescendantCount: 0,
      pendingDescendantCount: 0,
    };
  });

  // Pass 2: Descendant statistics & container rollup for non-mandatory nodes
  const mandatoryNodes = nodes.filter((n) => n.es_obligatorio);

  for (const node of nodes) {
    if (!node.ruta_materializada) continue;

    let mandatoryDescendantCount = 0;
    let coveredDescendantCount = 0;
    let excludedDescendantCount = 0;
    let pendingDescendantCount = 0;

    for (const candidate of mandatoryNodes) {
      if (candidate.id_requisito === node.id_requisito) continue;
      if (
        isLtreeSelfOrDescendant(candidate.ruta_materializada, node.ruta_materializada)
      ) {
        mandatoryDescendantCount += 1;
        if (candidate.estado === 'CUBIERTO') {
          coveredDescendantCount += 1;
        } else if (candidate.estado === 'NO_APLICABLE') {
          excludedDescendantCount += 1;
        } else if (candidate.estado === 'PENDIENTE') {
          pendingDescendantCount += 1;
        }
      }
    }

    node.mandatoryDescendantCount = mandatoryDescendantCount;
    node.coveredDescendantCount = coveredDescendantCount;
    node.excludedDescendantCount = excludedDescendantCount;
    node.pendingDescendantCount = pendingDescendantCount;

    if (
      !node.es_obligatorio &&
      node.estado !== 'NO_APLICABLE' &&
      node.estado !== 'CUBIERTO'
    ) {
      if (mandatoryDescendantCount === 0) {
        node.estado = 'INFORMATIVA';
      } else if (
        pendingDescendantCount > 0 &&
        (coveredDescendantCount > 0 || excludedDescendantCount > 0)
      ) {
        node.estado = 'PARCIAL';
      } else if (pendingDescendantCount > 0) {
        node.estado = 'PENDIENTE';
      } else if (coveredDescendantCount > 0 && excludedDescendantCount > 0) {
        node.estado = 'MIXTO';
      } else if (excludedDescendantCount > 0 && coveredDescendantCount === 0) {
        node.estado = 'NO_APLICABLE';
      } else {
        node.estado = 'CUBIERTO';
      }
    }
  }

  // Summary tally strictly over mandatory nodes M(N)
  const totalObligatorios = mandatoryNodes.length;
  let cubiertosPorProceso = 0;
  let excluidosNoAplicables = 0;
  const pendingMandatoryNodes: ClauseCoverageNodeResult[] = [];

  for (const node of mandatoryNodes) {
    if (node.estado === 'CUBIERTO') {
      cubiertosPorProceso += 1;
    } else if (node.estado === 'NO_APLICABLE') {
      excluidosNoAplicables += 1;
    } else {
      pendingMandatoryNodes.push(node);
    }
  }

  const pendientes = totalObligatorios - cubiertosPorProceso - excluidosNoAplicables;
  const porcentajeCobertura =
    totalObligatorios === 0
      ? 100
      : Math.round(
          ((cubiertosPorProceso + excluidosNoAplicables) / totalObligatorios) * 10000
        ) / 100;

  const nodeByRequisitoId = new Map<string, ClauseCoverageNodeResult>();
  for (const node of nodes) {
    nodeByRequisitoId.set(node.id_requisito, node);
  }

  return {
    summary: {
      id_certificado: cert.id,
      ...(effectiveVersionId ? { id_certificado_version: effectiveVersionId } : {}),
      id_norma: cert.id_norma,
      totalObligatorios,
      cubiertosPorProceso,
      excluidosNoAplicables,
      pendientes,
      porcentajeCobertura,
      coberturaCompleta: pendientes === 0,
      hasAnyDirectAssignments,
    },
    nodes,
    nodeByRequisitoId,
    pendingMandatoryNodes,
    excludedSubtreeRoots,
  };
}

/**
 * Pure Smart-Mutation preview: identifies active process-clause links on `cert`
 * that lie inside `targetRequisito`'s downward LTREE subtree (<@) and would be pruned.
 */
export function previewNonApplicableSmartMutation(
  params: PreviewNonApplicableSmartMutationParams
): NonApplicableSmartMutationPreview {
  const { cert, targetRequisito, requirementsCatalog, archivedProcesoIds } = params;

  if (
    targetRequisito.id_norma &&
    cert.id_norma &&
    targetRequisito.id_norma !== cert.id_norma
  ) {
    return { willMutate: false, prunedLinks: [], affectedProcessCount: 0 };
  }

  const targetPath = (targetRequisito.ruta_materializada || '').trim();
  const normaClauses = scopeNormaClauses(cert, requirementsCatalog);
  const { byLowerCode } = buildClauseLookup(normaClauses);

  const prunedLinks: SmartMutationPrunedLink[] = [];
  const affectedProcessIds = new Set<string>();

  for (const proc of cert.procesos || []) {
    if (archivedProcesoIds?.has(proc.id)) continue;

    const seenProcCodes = new Set<string>();
    const rawCodes = extractProcessClauseCodesForCert(proc, cert.id);

    for (const rawCode of rawCodes) {
      const cleanCode = (rawCode || '').trim();
      const lowerCode = cleanCode.toLowerCase();
      if (!lowerCode || seenProcCodes.has(lowerCode)) continue;
      seenProcCodes.add(lowerCode);

      const matchedReq = byLowerCode.get(lowerCode);
      const linkedPath = (matchedReq?.ruta_materializada || '').trim();
      const isDirectMatch =
        Boolean(matchedReq?.id && matchedReq.id === targetRequisito.id) ||
        lowerCode === (targetRequisito.codigo || '').trim().toLowerCase();
      const isSubtreeMatch =
        Boolean(targetPath && linkedPath) &&
        isLtreeSelfOrDescendant(linkedPath, targetPath);

      if (isDirectMatch || isSubtreeMatch) {
        affectedProcessIds.add(proc.id);
        prunedLinks.push({
          id_proceso: proc.id,
          nombre_proceso: proc.nombre_proceso,
          codigo: matchedReq?.codigo || cleanCode,
          ruta_materializada: linkedPath || targetPath,
        });
      }
    }
  }

  return {
    willMutate: prunedLinks.length > 0,
    prunedLinks,
    affectedProcessCount: affectedProcessIds.size,
  };
}

/**
 * Pure immutable reducer reconciling certificate exclusions and process clause links
 * after declaring or restoring an ISO 4.3 Non-Applicable clause (Smart Mutation).
 */
export function applyNonApplicableSmartMutationToState<
  TProcess extends SmartMutationProcessLike = SmartMutationProcessLike,
>(
  params: ApplyNonApplicableSmartMutationParams<TProcess>
): ApplyNonApplicableSmartMutationResult<TProcess> {
  const {
    certificates,
    processes,
    targetCertId,
    exclusion,
    targetRequisito,
    requirementsCatalog,
    archivedProcesoIds,
  } = params;

  const targetCert = certificates.find((c) => c.id === targetCertId);
  if (!targetCert) {
    return {
      nextCertificates: [...certificates],
      nextProcesses: [...processes],
      prunedLinks: [],
    };
  }

  const preview = previewNonApplicableSmartMutation({
    cert: targetCert,
    targetRequisito,
    requirementsCatalog,
    archivedProcesoIds,
  });

  const prunedByProcessId = new Map<string, Set<string>>();
  for (const link of preview.prunedLinks) {
    let codeSet = prunedByProcessId.get(link.id_proceso);
    if (!codeSet) {
      codeSet = new Set<string>();
      prunedByProcessId.set(link.id_proceso, codeSet);
    }
    codeSet.add(link.codigo.trim().toLowerCase());
  }

  const nextCertificates = certificates.map((cert) => {
    if (cert.id !== targetCertId) return cert;

    const existingList = cert.noAplicables || [];
    const existingIndex = existingList.findIndex(
      (na) =>
        na.id === exclusion.id ||
        (exclusion.id_requisito && na.id_requisito === exclusion.id_requisito)
    );
    const nextNoAplicables =
      existingIndex >= 0
        ? existingList.map((na, idx) => (idx === existingIndex ? exclusion : na))
        : [...existingList, exclusion];

    const nextCertProcesos = (cert.procesos || []).map((proc) => {
      const toRemove = prunedByProcessId.get(proc.id);
      if (!toRemove || toRemove.size === 0) return proc;

      const filterCodes = (codes: ReadonlyArray<string>): string[] =>
        codes.filter((code) => !toRemove.has(code.trim().toLowerCase()));
      const filterDetails = (
        details: ReadonlyArray<ProcessRequirementMapping> | undefined
      ): ProcessRequirementMapping[] | undefined =>
        details
          ? details.filter((det) => !toRemove.has(det.codigo.trim().toLowerCase()))
          : undefined;

      const existingByCert = proc.requisitos_by_certificado;
      const scopedEntry = existingByCert?.[targetCertId];
      const nextByCert = existingByCert
        ? {
            ...existingByCert,
            ...(scopedEntry
              ? {
                  [targetCertId]: {
                    clausulas_cubiertas: filterCodes(scopedEntry.clausulas_cubiertas || []),
                    requisitos_detalle: filterDetails(scopedEntry.requisitos_detalle),
                  },
                }
              : {}),
          }
        : undefined;

      const shouldPruneFlatOnCertProc =
        !existingByCert ||
        !proc.ownerCertId ||
        proc.ownerCertId === targetCertId ||
        proc.id_certificado === targetCertId;

      return {
        ...proc,
        clausulas_cubiertas: shouldPruneFlatOnCertProc
          ? filterCodes(proc.clausulas_cubiertas || [])
          : proc.clausulas_cubiertas,
        requisitos_detalle: shouldPruneFlatOnCertProc
          ? filterDetails(proc.requisitos_detalle)
          : proc.requisitos_detalle,
        ...(nextByCert ? { requisitos_by_certificado: nextByCert } : {}),
      };
    });

    return syncActiveCertVersionSnapshot({
      ...cert,
      noAplicables: nextNoAplicables,
      procesos: nextCertProcesos,
    });
  });

  const nextProcesses = processes.map((proc) => {
    const toRemove = prunedByProcessId.get(proc.id);
    if (!toRemove || toRemove.size === 0) return proc;

    const filterCodes = (codes: ReadonlyArray<string>): string[] =>
      codes.filter((code) => !toRemove.has(code.trim().toLowerCase()));
    const filterDetails = (
      details: ReadonlyArray<ProcessRequirementMapping> | undefined
    ): ProcessRequirementMapping[] | undefined =>
      details
        ? details.filter((det) => !toRemove.has(det.codigo.trim().toLowerCase()))
        : undefined;

    const existingByCert = proc.requisitos_by_certificado;
    const scopedEntry = existingByCert?.[targetCertId];
    const nextByCert = existingByCert
      ? {
          ...existingByCert,
          ...(scopedEntry
            ? {
                [targetCertId]: {
                  clausulas_cubiertas: filterCodes(scopedEntry.clausulas_cubiertas || []),
                  requisitos_detalle: filterDetails(scopedEntry.requisitos_detalle),
                },
              }
            : {}),
        }
      : undefined;

    const hasOtherCertEntries = Boolean(
      existingByCert && Object.keys(existingByCert).some((cid) => cid !== targetCertId)
    );
    const shouldPruneFlat = proc.ownerCertId
      ? proc.ownerCertId === targetCertId
      : !hasOtherCertEntries;

    return {
      ...proc,
      clausulas_cubiertas: shouldPruneFlat
        ? filterCodes(proc.clausulas_cubiertas || [])
        : proc.clausulas_cubiertas,
      ...(proc.requisitos_detalle
        ? {
            requisitos_detalle: shouldPruneFlat
              ? filterDetails(proc.requisitos_detalle)
              : proc.requisitos_detalle,
          }
        : {}),
      ...(nextByCert ? { requisitos_by_certificado: nextByCert } : {}),
    };
  });

  return {
    nextCertificates,
    nextProcesses,
    prunedLinks: preview.prunedLinks,
  };
}

/**
 * Checks whether a candidate clause is blocked by any active ISO 4.3 exclusion
 * on the target certificate (directly or via LTREE ancestor).
 */
export function isClauseBlockedByCertificateExclusions(
  params: IsClauseBlockedByExclusionsParams
): ClauseExclusionBlockResult {
  const { cert, targetRequisito, requirementsCatalog, archivedNoAplicableIds } = params;
  const normaClauses = scopeNormaClauses(cert, requirementsCatalog);
  const activeExclusions = collectActiveExclusions(
    cert,
    normaClauses,
    archivedNoAplicableIds
  );

  const targetPath = (targetRequisito.ruta_materializada || '').trim();
  const targetCodeLower = (targetRequisito.codigo || '').trim().toLowerCase();

  for (const excl of activeExclusions) {
    const isMatch =
      excl.id_requisito === targetRequisito.id ||
      excl.codigo.trim().toLowerCase() === targetCodeLower ||
      isLtreeSelfOrDescendant(targetPath, excl.ruta_materializada);

    if (isMatch) {
      return {
        blocked: true,
        blockingExclusionCodigo: excl.codigo,
        blockingJustificacion: excl.justificacion,
      };
    }
  }

  return { blocked: false };
}

/**
 * Computes direct clause count and effective downward mandatory clauses covered
 * by a single process within the evaluated certificate coverage report.
 */
export function computeProcessDownwardCoverageCount(params: {
  clausulasCubiertas: ReadonlyArray<string>;
  requisitosDetalle?: ReadonlyArray<{ codigo: string }>;
  coverageReport: CertificateCoverageReport;
}): { directCount: number; mandatoryCoveredCount: number } {
  const { clausulasCubiertas, requisitosDetalle, coverageReport } = params;
  const directCodes = new Set<string>();
  for (const code of clausulasCubiertas || []) {
    const clean = (code || '').trim().toLowerCase();
    if (clean) directCodes.add(clean);
  }
  for (const det of requisitosDetalle || []) {
    const clean = (det.codigo || '').trim().toLowerCase();
    if (clean) directCodes.add(clean);
  }

  if (directCodes.size === 0) {
    return { directCount: 0, mandatoryCoveredCount: 0 };
  }

  const rootPaths: string[] = [];
  for (const node of coverageReport.nodes) {
    if (
      directCodes.has(node.codigo.trim().toLowerCase()) &&
      node.ruta_materializada
    ) {
      rootPaths.push(node.ruta_materializada);
    }
  }

  let mandatoryCoveredCount = 0;
  for (const node of coverageReport.nodes) {
    if (!node.es_obligatorio || node.estado !== 'CUBIERTO') continue;
    const isCoveredByProc =
      directCodes.has(node.codigo.trim().toLowerCase()) ||
      (node.ruta_materializada
        ? rootPaths.some((rootPath) =>
            isLtreeSelfOrDescendant(node.ruta_materializada, rootPath)
          )
        : false);
    if (isCoveredByProc) {
      mandatoryCoveredCount += 1;
    }
  }

  return {
    directCount: directCodes.size,
    mandatoryCoveredCount,
  };
}

/**
 * Counts active descendant clauses covered downward under an ISO 4.3 exclusion root.
 */
export function countExcludedSubtreeDescendants(params: {
  exclusion: Pick<
    NonApplicableRequirementEntity,
    'id_requisito' | 'requisito_codigo' | 'ruta_materializada'
  >;
  coverageReport: CertificateCoverageReport;
}): number {
  const { exclusion, coverageReport } = params;
  const matchedNode =
    coverageReport.nodeByRequisitoId.get(exclusion.id_requisito) ||
    coverageReport.nodes.find(
      (n) =>
        n.codigo.trim().toLowerCase() ===
        (exclusion.requisito_codigo || '').trim().toLowerCase()
    );

  const rootPath = (
    matchedNode?.ruta_materializada ||
    exclusion.ruta_materializada ||
    ''
  ).trim();
  const rootId = matchedNode?.id_requisito || exclusion.id_requisito;
  if (!rootPath) return 0;

  let count = 0;
  for (const node of coverageReport.nodes) {
    if (node.id_requisito === rootId) continue;
    if (isLtreeSelfOrDescendant(node.ruta_materializada, rootPath)) {
      count += 1;
    }
  }
  return count;
}
