import { stripHtmlToSearchText } from './clauseRenderer';
import {
  INITIAL_NORMAS,
  calculateLtreeIndentation,
  type NormaEntity,
  type RequisitoLtree,
  type RequisitoTranslationEntry,
} from './extraDomain';
import { expandNormasCatalogBundle } from './generated/normasCatalogBundle';

export interface PostgrestLikeError {
  message?: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
}

export interface PagedQueryResult<T> {
  data: ReadonlyArray<T> | null;
  error: PostgrestLikeError | null;
}

export interface PagedFetchOutcome<T> {
  data: T[];
  error: PostgrestLikeError | null;
  pagesFetched: number;
}

export interface RawNormaRow {
  id: string;
  esquema?: string | null;
  codigo?: string | null;
  titulo?: string | null;
  estatus?: string | null;
  fecha_publicacion?: string | null;
  norma?: string | null;
}

export interface RawRequisitoNormaJoin {
  id?: string | null;
  codigo?: string | null;
  norma?: string | null;
}

export interface RawRequisitoRow {
  id: string;
  id_norma?: string | null;
  id_requisito_padre?: string | null;
  codigo?: string | null;
  explicit_code?: boolean | null;
  ruta_materializada?: string | null;
  norma?: RawRequisitoNormaJoin | null;
}

export interface RawRequisitoTraduccionRow {
  id?: string | null;
  id_requisito: string;
  lang: string;
  title?: string | null;
  content_html?: string | null;
  updated_at?: string | null;
}

export interface HydratedLegacyRequirement {
  id: string;
  id_norma: string;
  id_requisito_padre?: string | null;
  codigo: string;
  ruta_materializada: string;
  norma: string;
  titulo: string;
  descripcion?: string;
}

export type RequisitoTranslationMap = Map<
  string,
  { es?: RequisitoTranslationEntry; en?: RequisitoTranslationEntry }
>;

const DEFAULT_PAGE_SIZE = 1000;
const MAX_PAGINATION_PAGES = 1000;
const PLAIN_SUMMARY_MAX_LENGTH = 240;

/**
 * Fetches all rows from a PostgREST/Supabase query using deterministic `.range(from, to)`
 * pagination so tables exceeding 1,000 rows (such as 2,188 clauses and 2,684 translations)
 * are never silently truncated.
 */
export async function fetchAllPagedRows<T>(
  queryFactory: (from: number, to: number) => Promise<PagedQueryResult<T>>,
  pageSize: number = DEFAULT_PAGE_SIZE
): Promise<PagedFetchOutcome<T>> {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const collected: T[] = [];
  let from = 0;
  let pagesFetched = 0;

  while (pagesFetched < MAX_PAGINATION_PAGES) {
    const to = from + safePageSize - 1;
    const result = await queryFactory(from, to);
    pagesFetched += 1;

    if (result.error) {
      return {
        data: collected,
        error: result.error,
        pagesFetched,
      };
    }

    const batch = Array.isArray(result.data) ? result.data : [];
    for (let i = 0; i < batch.length; i += 1) {
      collected.push(batch[i]);
    }

    if (batch.length < safePageSize) {
      break;
    }

    from += safePageSize;
  }

  return {
    data: collected,
    error: null,
    pagesFetched,
  };
}

/**
 * Indexes `requisito_traduccion` rows by `id_requisito` in O(n) for constant-time lookup.
 */
export function indexTranslationsByRequisitoId(
  rows: ReadonlyArray<RawRequisitoTraduccionRow>
): RequisitoTranslationMap {
  const map: RequisitoTranslationMap = new Map();

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const reqId = (row.id_requisito || '').trim();
    if (!reqId) continue;

    const langRaw = (row.lang || '').trim().toLowerCase();
    if (langRaw !== 'es' && langRaw !== 'en') continue;

    let bucket = map.get(reqId);
    if (!bucket) {
      bucket = {};
      map.set(reqId, bucket);
    }

    bucket[langRaw] = {
      id: row.id ? String(row.id) : undefined,
      id_requisito: reqId,
      lang: langRaw,
      title: String(row.title || '').trim(),
      content_html: String(row.content_html || ''),
      updated_at: row.updated_at ? String(row.updated_at) : null,
    };
  }

  return map;
}

/**
 * Builds a clean plain-text description snippet from bilingual HTML translations for tables and tooltips.
 */
export function extractPlainClauseDescription(
  translations?: { es?: RequisitoTranslationEntry; en?: RequisitoTranslationEntry },
  fallbackText?: string
): string | undefined {
  const htmlSource =
    (translations?.es?.content_html || '').trim() ||
    (translations?.en?.content_html || '').trim();
  if (!htmlSource) {
    return fallbackText;
  }

  const plain = stripHtmlToSearchText(htmlSource);
  if (!plain) {
    return fallbackText;
  }

  if (plain.length <= PLAIN_SUMMARY_MAX_LENGTH) {
    return plain;
  }
  return `${plain.slice(0, PLAIN_SUMMARY_MAX_LENGTH - 1).trimEnd()}…`;
}

let cachedBundleCatalog: {
  standards: NormaEntity[];
  requirementsCatalog: RequisitoLtree[];
  translationsByRequisitoId: RequisitoTranslationMap;
  clauseById: Map<string, RequisitoLtree>;
} | null = null;

/**
 * Returns cached offline/fallback 8 standards, 2,188 clauses, and 2,684 bilingual translations
 * expanded from `normasCatalogBundle.ts`.
 */
export function getBundledNormaCatalog(): {
  standards: NormaEntity[];
  requirementsCatalog: RequisitoLtree[];
  translationsByRequisitoId: RequisitoTranslationMap;
  clauseById: Map<string, RequisitoLtree>;
} {
  if (cachedBundleCatalog) {
    return cachedBundleCatalog;
  }

  const bundle = expandNormasCatalogBundle();
  const translationRows: RawRequisitoTraduccionRow[] = bundle.translations.map((t) => ({
    id: t.id,
    id_requisito: t.id_requisito,
    lang: t.lang,
    title: t.title,
    content_html: t.content_html,
  }));
  const translationsByRequisitoId = indexTranslationsByRequisitoId(translationRows);

  const countByNormaId = new Map<string, number>();
  for (const clause of bundle.clauses) {
    countByNormaId.set(clause.id_norma, (countByNormaId.get(clause.id_norma) ?? 0) + 1);
  }

  const standards: NormaEntity[] = bundle.standards.map((std) => {
    const initialMatch = INITIAL_NORMAS.find((n) => n.id === std.id);
    return {
      id: std.id,
      codigo: std.codigo,
      titulo: std.titulo,
      estatus: std.estatus,
      esquema: std.esquema,
      fecha_publicacion: std.fecha_publicacion,
      norma: std.norma,
      clausulas_count: countByNormaId.get(std.id) ?? 0,
      acreditaciones_count: initialMatch?.acreditaciones_count ?? 0,
    };
  });

  const requirementsCatalog: RequisitoLtree[] = bundle.clauses.map((clause) => {
    const trans = translationsByRequisitoId.get(clause.id);
    const titulo = trans?.es?.title || trans?.en?.title || '';
    const descripcion = extractPlainClauseDescription(trans);
    return {
      id: clause.id,
      id_norma: clause.id_norma,
      norma_codigo: clause.norma_codigo,
      id_requisito_padre: clause.id_requisito_padre,
      codigo: clause.codigo,
      explicit_code: clause.explicit_code,
      titulo,
      descripcion,
      translations: trans,
      ruta_materializada: clause.ruta_materializada,
      nivel: clause.nivel,
      es_padre: clause.es_padre,
      deleted_at: null,
    };
  });

  const clauseById = new Map<string, RequisitoLtree>();
  for (const req of requirementsCatalog) {
    clauseById.set(req.id, req);
  }

  cachedBundleCatalog = {
    standards,
    requirementsCatalog,
    translationsByRequisitoId,
    clauseById,
  };

  return cachedBundleCatalog;
}

/**
 * Pure O(n) calculation of active clause counts per standard (`clausulas_count`),
 * replacing legacy static estimates.
 */
export function computeNormaClausulaCounts(
  standards: ReadonlyArray<NormaEntity>,
  requirementsCatalog: ReadonlyArray<RequisitoLtree>
): Map<string, number> {
  const countsByNormaId = new Map<string, number>();
  const normaIdByLowerCode = new Map<string, string>();

  for (const std of standards) {
    countsByNormaId.set(std.id, 0);
    const codeKey = (std.codigo || std.norma || '').trim().toLowerCase();
    if (codeKey) {
      normaIdByLowerCode.set(codeKey, std.id);
    }
    const normaKey = (std.norma || '').trim().toLowerCase();
    if (normaKey && !normaIdByLowerCode.has(normaKey)) {
      normaIdByLowerCode.set(normaKey, std.id);
    }
  }

  for (const req of requirementsCatalog) {
    if (req.deleted_at) continue;
    let targetNormaId = countsByNormaId.has(req.id_norma) ? req.id_norma : undefined;
    if (!targetNormaId && req.norma_codigo) {
      targetNormaId = normaIdByLowerCode.get(req.norma_codigo.trim().toLowerCase());
    }
    if (targetNormaId) {
      countsByNormaId.set(targetNormaId, (countsByNormaId.get(targetNormaId) ?? 0) + 1);
    }
  }

  return countsByNormaId;
}

/**
 * Assembles active `NormaEntity[]`, `RequisitoLtree[]`, and legacy requirement projections
 * from paginated Supabase responses, degrading gracefully to `normasCatalogBundle.ts` when
 * `requisito_traduccion` is not yet migrated or when offline.
 */
export function assembleHydratedNormasAndRequisitos(params: {
  rawNormas?: ReadonlyArray<RawNormaRow> | null;
  rawRequisitos?: ReadonlyArray<RawRequisitoRow> | null;
  rawTranslations?: ReadonlyArray<RawRequisitoTraduccionRow> | null;
  translationsTableMissing?: boolean;
  existingStandardsFallback?: ReadonlyArray<NormaEntity>;
}): {
  standards: NormaEntity[];
  requirementsCatalog: RequisitoLtree[];
  requirements: HydratedLegacyRequirement[];
  usedTranslationFallback: boolean;
  usedOfflineBundleFallback: boolean;
} {
  const bundled = getBundledNormaCatalog();

  const bundledStandardById = new Map<string, NormaEntity>();
  const bundledStandardByCode = new Map<string, NormaEntity>();
  for (const std of bundled.standards) {
    bundledStandardById.set(std.id, std);
    bundledStandardByCode.set(std.codigo.trim().toLowerCase(), std);
  }

  let standards: NormaEntity[];
  if (Array.isArray(params.rawNormas) && params.rawNormas.length > 0) {
    standards = params.rawNormas.map((row) => {
      const id = String(row.id);
      const codigoStr = String(row.codigo || row.norma || '').trim();
      const normaStr = String(row.norma || row.codigo || '').trim();
      const bundleMatch =
        bundledStandardById.get(id) ||
        bundledStandardByCode.get(codigoStr.toLowerCase());
      const initialMatch =
        INITIAL_NORMAS.find((n) => n.id === id) ||
        INITIAL_NORMAS.find(
          (n) => n.codigo.trim().toLowerCase() === codigoStr.toLowerCase()
        );
      const rawEstatus = String(row.estatus || bundleMatch?.estatus || 'Vigente');
      const estatus: NormaEntity['estatus'] =
        rawEstatus === 'En Revisión' || rawEstatus === 'Obsoleta'
          ? rawEstatus
          : 'Vigente';

      return {
        id,
        esquema: String(row.esquema || bundleMatch?.esquema || initialMatch?.esquema || ''),
        codigo: codigoStr || bundleMatch?.codigo || 'Norma ISO',
        titulo: String(
          row.titulo ||
            bundleMatch?.titulo ||
            initialMatch?.titulo ||
            `Sistema de Gestión — ${normaStr || codigoStr}`
        ),
        estatus,
        fecha_publicacion: String(
          row.fecha_publicacion ||
            bundleMatch?.fecha_publicacion ||
            initialMatch?.fecha_publicacion ||
            '2015-09-15'
        ),
        norma: normaStr || bundleMatch?.norma || codigoStr,
        clausulas_count: 0,
        acreditaciones_count: initialMatch?.acreditaciones_count ?? 0,
        deleted_at: null,
      };
    });
  } else if (
    params.existingStandardsFallback &&
    params.existingStandardsFallback.length > 0
  ) {
    const existingIds = new Set(params.existingStandardsFallback.map((s) => s.id));
    standards = [
      ...params.existingStandardsFallback.map((s) => ({ ...s })),
      ...bundled.standards
        .filter((b) => !existingIds.has(b.id))
        .map((b) => ({ ...b })),
    ];
  } else {
    standards = bundled.standards.map((s) => ({ ...s }));
  }

  const normaById = new Map<string, NormaEntity>();
  for (const std of standards) {
    normaById.set(std.id, std);
  }

  let usedTranslationFallback = Boolean(params.translationsTableMissing);
  let usedOfflineBundleFallback = false;
  let requirementsCatalog: RequisitoLtree[];

  if (Array.isArray(params.rawRequisitos) && params.rawRequisitos.length > 0) {
    const dbTranslationsMap =
      !params.translationsTableMissing && Array.isArray(params.rawTranslations)
        ? indexTranslationsByRequisitoId(params.rawTranslations)
        : new Map<
            string,
            { es?: RequisitoTranslationEntry; en?: RequisitoTranslationEntry }
          >();

    if (params.translationsTableMissing) {
      usedTranslationFallback = true;
    }

    const parentIdSet = new Set<string>();
    for (const row of params.rawRequisitos) {
      if (row.id_requisito_padre) {
        parentIdSet.add(String(row.id_requisito_padre));
      }
    }

    requirementsCatalog = params.rawRequisitos.map((row) => {
      const reqId = String(row.id);
      const normaJoin = row.norma ?? null;
      const idNorma = String(row.id_norma || normaJoin?.id || '').trim();
      const matchedNorma = normaById.get(idNorma) || bundledStandardById.get(idNorma);
      const codigo = String(row.codigo || '').trim();
      const normaCodigo = String(
        normaJoin?.codigo ||
          normaJoin?.norma ||
          matchedNorma?.codigo ||
          matchedNorma?.norma ||
          'Norma ISO'
      );
      const bundleClause = bundled.clauseById.get(reqId);
      const rutaMaterializada = String(
        row.ruta_materializada || bundleClause?.ruta_materializada || codigo
      );
      const indent = calculateLtreeIndentation(rutaMaterializada, codigo);

      const transFromDb = dbTranslationsMap.get(reqId);
      const transFromBundle = params.translationsTableMissing
        ? bundled.translationsByRequisitoId.get(reqId)
        : undefined;
      const resolvedTranslations = transFromDb || transFromBundle;

      const titulo =
        resolvedTranslations?.es?.title ||
        resolvedTranslations?.en?.title ||
        bundleClause?.titulo ||
        '';
      const descripcion = extractPlainClauseDescription(
        resolvedTranslations,
        bundleClause?.descripcion
      );

      return {
        id: reqId,
        id_norma: idNorma || bundleClause?.id_norma || '',
        norma_codigo: normaCodigo,
        id_requisito_padre: row.id_requisito_padre
          ? String(row.id_requisito_padre)
          : null,
        codigo,
        explicit_code:
          typeof row.explicit_code === 'boolean'
            ? row.explicit_code
            : bundleClause?.explicit_code ?? false,
        titulo,
        descripcion,
        translations: resolvedTranslations,
        ruta_materializada: rutaMaterializada,
        nivel: indent.level,
        es_padre: parentIdSet.has(reqId),
        deleted_at: null,
      };
    });
  } else {
    usedOfflineBundleFallback = true;
    usedTranslationFallback = true;
    requirementsCatalog = bundled.requirementsCatalog.map((req) => ({
      ...req,
      translations: req.translations ? { ...req.translations } : undefined,
    }));
  }

  const counts = computeNormaClausulaCounts(standards, requirementsCatalog);
  const updatedStandards: NormaEntity[] = standards.map((std) => ({
    ...std,
    clausulas_count: counts.get(std.id) ?? 0,
  }));

  const requirements: HydratedLegacyRequirement[] = requirementsCatalog.map((req) => ({
    id: req.id,
    id_norma: req.id_norma,
    id_requisito_padre: req.id_requisito_padre,
    codigo: req.codigo,
    ruta_materializada: req.ruta_materializada,
    norma: req.norma_codigo,
    titulo: req.titulo,
    descripcion: req.descripcion,
  }));

  return {
    standards: updatedStandards,
    requirementsCatalog,
    requirements,
    usedTranslationFallback,
    usedOfflineBundleFallback,
  };
}
