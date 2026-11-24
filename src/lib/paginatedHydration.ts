import {
  countNormativeObligationTerms,
  stripHtmlToSearchText,
} from './clauseRenderer';
import {
  INITIAL_ORGANIZACIONES,
  type OrganizacionEntity,
  type OrganizacionVersionEntity,
} from './activeCertificates';
import {
  INITIAL_ESTATUS_CATALOG,
  INITIAL_NORMAS,
  INITIAL_SECTORES_IAF,
  INITIAL_SUBSECTORES_IAF,
  VALID_OBLIGATORIO_ORIGEN_VALUES,
  calculateLtreeIndentation,
  type EstatusCatalogItem,
  type NormaEntity,
  type ObligatorioOrigen,
  type RequisitoLtree,
  type RequisitoTranslationEntry,
  type SectorIafEntity,
  type SubsectorIafEntity,
} from './extraDomain';
import type {
  AlcanceCertificadoEntity,
  AlcanceCertificadoSharedTargetRef,
  CertificateCoberturaCache,
  CertificadoDetailEntity,
  CertificadoVersionSnapshot,
  ContactoCertificadoEntity,
  FechaCertificadoEntity,
  NonApplicableRequirementEntity,
  ProcessEntity,
  ShiftEntity,
  SiteEntity,
} from './multisiteSampling';
import {
  evaluateCertificateCoverage,
  type CertificateCoverageReport,
} from './coverageEngine';
import type { CertificateRecord } from './searchControls';
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
  es_obligatorio?: boolean | null;
  obligatorio_origen?: string | null;
  ruta_materializada?: string | null;
  norma?: RawRequisitoNormaJoin | null;
}

export function normalizeObligatorioOrigen(raw?: string | null): ObligatorioOrigen | undefined {
  if (!raw) return undefined;
  const upper = raw.trim().toUpperCase();
  return (VALID_OBLIGATORIO_ORIGEN_VALUES as ReadonlyArray<string>).includes(upper)
    ? (upper as ObligatorioOrigen)
    : undefined;
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
      es_obligatorio: clause.es_obligatorio,
      obligatorio_origen: clause.obligatorio_origen,
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

      const isParentNode = parentIdSet.has(reqId);
      const rootChapter = (codigo.split('.')[0] ?? '').trim();
      const hasOwnMustTerm =
        Boolean(resolvedTranslations?.es?.content_html && (() => {
          const c = countNormativeObligationTerms(resolvedTranslations.es!.content_html);
          return c.debe > 0 || c.shall > 0;
        })()) ||
        Boolean(resolvedTranslations?.en?.content_html && (() => {
          const c = countNormativeObligationTerms(resolvedTranslations.en!.content_html);
          return c.debe > 0 || c.shall > 0;
        })());

      let fallbackEsObligatorio: boolean;
      let fallbackOrigen: ObligatorioOrigen;
      if (['0', '1', '2', '3'].includes(rootChapter)) {
        fallbackEsObligatorio = false;
        fallbackOrigen = 'AUTO_CHAPTER';
      } else if (bundleClause && typeof bundleClause.es_obligatorio === 'boolean') {
        fallbackEsObligatorio = bundleClause.es_obligatorio;
        fallbackOrigen = bundleClause.obligatorio_origen ?? 'AUTO_TEXT';
      } else if (hasOwnMustTerm) {
        fallbackEsObligatorio = true;
        fallbackOrigen = 'AUTO_TEXT';
      } else {
        fallbackEsObligatorio = !isParentNode;
        fallbackOrigen = 'AUTO_STRUCTURAL';
      }

      const resolvedEsObligatorio =
        typeof row.es_obligatorio === 'boolean'
          ? row.es_obligatorio
          : fallbackEsObligatorio;
      const resolvedOrigen =
        normalizeObligatorioOrigen(row.obligatorio_origen) ?? fallbackOrigen;

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
        es_obligatorio: resolvedEsObligatorio,
        obligatorio_origen: resolvedOrigen,
        titulo,
        descripcion,
        translations: resolvedTranslations,
        ruta_materializada: rutaMaterializada,
        nivel: indent.level,
        es_padre: isParentNode,
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

// ============================================================================
// Step 3.1: `organizacion_version`, `certificado_version`, `alcance` +
// `alcance_certificado_compartido` Hydration & Version-Scoped Coverage Helpers
// ============================================================================

export interface RawOrganizacionRow {
  id: string;
  id_grupo_empresarial?: string | null;
  nombre?: string | null;
  abreviacion?: string | null;
  rif?: string | null;
  direccion_fiscal?: string | null;
  estatus?: string | null;
  deleted_at?: string | null;
}

export interface RawOrganizacionVersionRow {
  id: string;
  id_organizacion: string;
  version_numero: number;
  es_version_actual?: boolean | null;
  notas_version?: string | null;
  nombre?: string | null;
  abreviacion?: string | null;
  rif?: string | null;
  direccion_fiscal?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
}

export interface HydratedOrganizationSummaryRecord {
  id: string;
  nombre: string;
  abreviacion?: string;
  rif: string;
  direccion_fiscal?: string;
  id_organizacion_version_actual?: string;
  version_actual_numero?: number;
  versiones?: OrganizacionVersionEntity[];
  certificados_count: number;
}

export interface RawAlcanceRow {
  id: string;
  id_certificado: string;
  alcance_es?: string | null;
  alcance_en?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
}

export interface RawAlcanceCompartidoRow {
  id: string;
  id_alcance: string;
  id_certificado: string;
  created_at?: string | null;
  deleted_at?: string | null;
}

export interface RawCertificadoVersionRow {
  id: string;
  id_certificado: string;
  id_organizacion_version?: string | null;
  version_numero: number;
  es_version_actual?: boolean | null;
  notas_version?: string | null;
  id_estatus?: string | null;
  id_sector_iaf?: string | null;
  id_subsector_iaf?: string | null;
  multisitio?: boolean | null;
  deleted_at?: string | null;
}

interface SeedCertVersionConfig {
  id_organizacion_version: string;
  organizacion_abreviacion: string;
  id_certificado_version: string;
  version_actual_numero: number;
  alcanceId?: string;
  alcance_es?: string;
  alcance_en?: string | null;
  sharedFromAlcanceId?: string;
  sharedLinkId?: string;
  origenCertId?: string;
  origenCertNumero?: string;
  noAlcance?: boolean;
  extraHistoricalVersion?: {
    id: string;
    id_organizacion_version: string;
    version_numero: number;
    notas_version: string;
  };
}

const SEED_ORG_ABREV_BY_ID: Record<string, string> = {
  '30000000-0000-0000-0000-000000000001': 'IBEROMETAL',
  '30000000-0000-0000-0000-000000000002': 'CYBERCLOUD',
  '30000000-0000-0000-0000-000000000003': 'EXAMPLE',
  '30000000-0000-0000-0000-000000000004': 'ALIM-GDE',
  '30000000-0000-0000-0000-000000000005': 'EMP-PEQ',
};

const SEED_CERT_CONFIG_BY_ID: Record<string, SeedCertVersionConfig> = {
  '40000000-0000-0000-0000-000000000001': {
    id_organizacion_version: '31000000-0000-0000-0000-000000000101',
    organizacion_abreviacion: 'IBEROMETAL',
    id_certificado_version: '41000000-0000-0000-0000-000000000001',
    version_actual_numero: 1,
    alcanceId: 'a1c00000-0000-0000-0000-000000000001',
    alcance_es:
      'Manufactura, estampado en frío/caliente, fundición de precisión, mecanizado de acabado y comercialización nacional de componentes metálicos troquelados para automoción y línea blanca (sin diseño de producto bajo plano del cliente).',
    alcance_en:
      'Manufacture, cold/hot stamping, precision casting, finish machining, and national commercialization of stamped metal components for automotive and appliance industries (excluding product design under customer blueprints).',
  },
  '40000000-0000-0000-0000-000000000002': {
    id_organizacion_version: '31000000-0000-0000-0000-000000000101',
    organizacion_abreviacion: 'IBEROMETAL',
    id_certificado_version: '41000000-0000-0000-0000-000000000202',
    version_actual_numero: 2,
    alcanceId: 'a1c00000-0000-0000-0000-000000000002',
    alcance_es:
      'Gestión ambiental de operaciones de fundición controlada, tratamiento térmico, acabado superficial, manejo de residuos ferrosos, efluentes industriales y almacenamiento de insumos químicos.',
    alcance_en:
      'Environmental management of controlled foundry operations, heat treatment, surface finishing, ferrous waste handling, industrial effluents, and chemical inputs storage.',
    extraHistoricalVersion: {
      id: '41000000-0000-0000-0000-000000000002',
      id_organizacion_version: '31000000-0000-0000-0000-000000000001',
      version_numero: 1,
      notas_version: 'Versión histórica v1 (Otorgamiento 2022 y Renovación 2025 bajo Iberometal v1).',
    },
  },
  '40000000-0000-0000-0000-000000000010': {
    id_organizacion_version: '31000000-0000-0000-0000-000000000101',
    organizacion_abreviacion: 'IBEROMETAL',
    id_certificado_version: '41000000-0000-0000-0000-000000000010',
    version_actual_numero: 1,
    alcanceId: 'a1c00000-0000-0000-0000-000000000010',
    alcance_es:
      'Gestión de seguridad y salud en el trabajo en líneas de prensado hidráulico, fundición de aleaciones, izaje de cargas, mantenimiento eléctrico/mecánico y despacho industrial.',
    alcance_en:
      'Occupational health and safety management in hydraulic press lines, alloy casting, load lifting, electrical/mechanical maintenance, and industrial dispatch.',
  },
  '40000000-0000-0000-0000-000000000003': {
    id_organizacion_version: '31000000-0000-0000-0000-000000000002',
    organizacion_abreviacion: 'CYBERCLOUD',
    id_certificado_version: '41000000-0000-0000-0000-000000000003',
    version_actual_numero: 1,
    alcanceId: 'a1c00000-0000-0000-0000-000000000003',
    alcance_es:
      'Operación de centros de datos cloud, desarrollo de software seguro y servicios administrados de ciberseguridad.',
    alcance_en:
      'Cloud data center operations, secure software development, and managed cybersecurity services.',
  },
  '40000000-0000-0000-0000-000000000004': {
    id_organizacion_version: '31000000-0000-0000-0000-000000000003',
    organizacion_abreviacion: 'EXAMPLE',
    id_certificado_version: '41000000-0000-0000-0000-000000000004',
    version_actual_numero: 1,
    alcanceId: 'a1c00000-0000-0000-0000-000000000004',
    alcance_es:
      'Diseño de ingeniería de detalle, fabricación de estructuras metálicas pesadas, calderería, soldadura certificada, recubrimiento anticorrosivo y comercialización industrial.',
    alcance_en:
      'Detail engineering design, heavy steel structure manufacturing, boilermaking, certified welding, anticorrosive coating, and industrial commercialization.',
  },
  '40000000-0000-0000-0000-000000000005': {
    id_organizacion_version: '31000000-0000-0000-0000-000000000003',
    organizacion_abreviacion: 'EXAMPLE',
    id_certificado_version: '41000000-0000-0000-0000-000000000005',
    version_actual_numero: 1,
    alcanceId: 'a1c00000-0000-0000-0000-000000000005',
    alcance_es:
      'Gestión ambiental de fabricación estructural, granallado, cabinas de pintura industrial, control de emisiones atmosféricas y gestión integral de residuos peligrosos.',
    alcance_en: null,
  },
  '40000000-0000-0000-0000-000000000006': {
    id_organizacion_version: '31000000-0000-0000-0000-000000000003',
    organizacion_abreviacion: 'EXAMPLE',
    id_certificado_version: '41000000-0000-0000-0000-000000000006',
    version_actual_numero: 1,
    alcanceId: 'a1c00000-0000-0000-0000-000000000006',
    alcance_es:
      'Gestión de seguridad y salud laboral en trabajos en altura, soldadura, corte térmico y operación de puentes grúa en Planta Santa Cruz.',
    alcance_en: null,
  },
  '40000000-0000-0000-0000-000000000007': {
    id_organizacion_version: '31000000-0000-0000-0000-000000000002',
    organizacion_abreviacion: 'CYBERCLOUD',
    id_certificado_version: '41000000-0000-0000-0000-000000000007',
    version_actual_numero: 1,
    noAlcance: true,
  },
  '40000000-0000-0000-0000-000000000008': {
    id_organizacion_version: '31000000-0000-0000-0000-000000000101',
    organizacion_abreviacion: 'IBEROMETAL',
    id_certificado_version: '41000000-0000-0000-0000-000000000008',
    version_actual_numero: 1,
    sharedFromAlcanceId: 'a1c00000-0000-0000-0000-000000000001',
    sharedLinkId: 'a1c50000-0000-0000-0000-000000000001',
    origenCertId: '40000000-0000-0000-0000-000000000001',
    origenCertNumero: 'FN-QMS-2024-001',
  },
  '40000000-0000-0000-0000-000000000009': {
    id_organizacion_version: '31000000-0000-0000-0000-000000000003',
    organizacion_abreviacion: 'EXAMPLE',
    id_certificado_version: '41000000-0000-0000-0000-000000000009',
    version_actual_numero: 1,
    alcanceId: 'a1c00000-0000-0000-0000-000000000009',
    alcance_es:
      'Operaciones logísticas integradas, recepción, inspección en tránsito, consolidación de carga y despacho de estructuras y piezas metálicas para proyectos industriales.',
    alcance_en:
      'Integrated logistics operations, receiving, in-transit inspection, cargo consolidation, and industrial metal parts dispatch.',
  },
};

function deriveFallbackAbreviacion(nombre: string): string {
  const words = nombre
    .replace(/[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 1 && !['S.A', 'SA', 'SL', 'C.A', 'CA', 'DE', 'DEL', 'LA'].includes(w.toUpperCase()));
  if (words.length === 0) return 'ORG';
  return words[0].slice(0, 14).toUpperCase();
}

export function mapOrganizacionToSummaryRecord(
  org: OrganizacionEntity,
  certificadosCount?: number
): HydratedOrganizationSummaryRecord {
  return {
    id: org.id,
    nombre: org.nombre,
    abreviacion: org.abreviacion,
    rif: org.rif || 'RIF No Registrado',
    direccion_fiscal: org.direccion_fiscal || '',
    id_organizacion_version_actual: org.id_organizacion_version_actual,
    version_actual_numero: org.version_actual_numero,
    versiones: org.versiones ? org.versiones.map((v) => ({ ...v })) : undefined,
    certificados_count:
      typeof certificadosCount === 'number'
        ? certificadosCount
        : org.certificados_count ?? 1,
  };
}

/**
 * Hydrates `OrganizacionEntity[]` and `OrganizationRecord[]` summaries from `organizacion`
 * + `organizacion_version` (`version_numero DESC`), merging curated seed metadata cleanly
 * when running offline or before DB migration is applied.
 */
export function hydrateOrganizacionesWithVersions(params: {
  rawOrganizaciones?: ReadonlyArray<RawOrganizacionRow> | null;
  rawOrganizacionVersions?: ReadonlyArray<RawOrganizacionVersionRow> | null;
  groupNameById?: ReadonlyMap<string, string>;
  includeSeedFallback?: boolean;
  seedOrganizaciones?: ReadonlyArray<OrganizacionEntity>;
}): {
  allOrganizaciones: OrganizacionEntity[];
  organizations: HydratedOrganizationSummaryRecord[];
} {
  const seedList = params.seedOrganizaciones ?? INITIAL_ORGANIZACIONES;
  const seedById = new Map<string, OrganizacionEntity>(seedList.map((o) => [o.id, o]));

  const versionsByOrgId = new Map<string, OrganizacionVersionEntity[]>();
  if (Array.isArray(params.rawOrganizacionVersions)) {
    for (const row of params.rawOrganizacionVersions) {
      if (row.deleted_at) continue;
      const orgId = String(row.id_organizacion || '').trim();
      const verId = String(row.id || '').trim();
      if (!orgId || !verId) continue;
      const list = versionsByOrgId.get(orgId) || [];
      list.push({
        id: verId,
        id_organizacion: orgId,
        version_numero: Math.max(1, Number(row.version_numero ?? 1)),
        es_version_actual: Boolean(row.es_version_actual),
        notas_version: row.notas_version ? String(row.notas_version) : null,
        nombre: String(row.nombre || ''),
        abreviacion: String(row.abreviacion || ''),
        rif: row.rif ? String(row.rif) : null,
        direccion_fiscal: row.direccion_fiscal ? String(row.direccion_fiscal) : null,
        created_at: row.created_at ? String(row.created_at) : undefined,
        updated_at: row.updated_at ? String(row.updated_at) : undefined,
        deleted_at: null,
      });
      versionsByOrgId.set(orgId, list);
    }
    for (const [orgId, list] of versionsByOrgId.entries()) {
      list.sort((a, b) => b.version_numero - a.version_numero);
      versionsByOrgId.set(orgId, list);
    }
  }

  let hydratedFromDb: OrganizacionEntity[] = [];
  if (Array.isArray(params.rawOrganizaciones) && params.rawOrganizaciones.length > 0) {
    hydratedFromDb = params.rawOrganizaciones
      .filter((r) => !r.deleted_at)
      .map((row) => {
        const orgId = String(row.id);
        const seedMatch = seedById.get(orgId);
        const groupId = row.id_grupo_empresarial
          ? String(row.id_grupo_empresarial)
          : seedMatch?.id_grupo_empresarial;

        const dbVersions = versionsByOrgId.get(orgId) || [];
        const resolvedVersions =
          dbVersions.length > 0
            ? dbVersions
            : seedMatch?.versiones
            ? seedMatch.versiones
                .slice()
                .sort((a, b) => b.version_numero - a.version_numero)
            : undefined;
        const activeVersion =
          resolvedVersions?.find((v) => v.es_version_actual && !v.deleted_at) ??
          resolvedVersions?.[0];

        const resolvedNombre = String(
          activeVersion?.nombre || row.nombre || seedMatch?.nombre || 'Organización Cliente'
        );
        const resolvedAbrev = String(
          activeVersion?.abreviacion ||
            row.abreviacion ||
            seedMatch?.abreviacion ||
            SEED_ORG_ABREV_BY_ID[orgId] ||
            deriveFallbackAbreviacion(resolvedNombre)
        ).trim();
        const resolvedRif = String(
          activeVersion?.rif || row.rif || seedMatch?.rif || 'RIF No Registrado'
        );
        const resolvedDir =
          activeVersion?.direccion_fiscal ??
          (row.direccion_fiscal !== null && row.direccion_fiscal !== undefined
            ? String(row.direccion_fiscal)
            : seedMatch?.direccion_fiscal || '');

        return {
          ...seedMatch,
          id: orgId,
          id_grupo_empresarial: groupId,
          grupo_empresarial_nombre:
            (groupId && params.groupNameById?.get(groupId)) ||
            seedMatch?.grupo_empresarial_nombre,
          nombre: resolvedNombre,
          abreviacion: resolvedAbrev || undefined,
          rif: resolvedRif,
          direccion_fiscal: resolvedDir || '',
          id_organizacion_version_actual:
            activeVersion?.id ?? seedMatch?.id_organizacion_version_actual,
          version_actual_numero:
            activeVersion?.version_numero ?? seedMatch?.version_actual_numero ?? 1,
          versiones: resolvedVersions,
        };
      });
  }

  let allOrganizaciones: OrganizacionEntity[];
  if (hydratedFromDb.length > 0) {
    const dbOrgIds = new Set(hydratedFromDb.map((o) => o.id));
    allOrganizaciones = params.includeSeedFallback
      ? [...hydratedFromDb, ...seedList.filter((s) => !dbOrgIds.has(s.id))]
      : hydratedFromDb;
  } else {
    allOrganizaciones = params.includeSeedFallback
      ? seedList.map((o) => ({
          ...o,
          versiones: o.versiones
            ? o.versiones.slice().sort((a, b) => b.version_numero - a.version_numero)
            : undefined,
        }))
      : [];
  }

  const organizations: HydratedOrganizationSummaryRecord[] = allOrganizaciones.map((org) =>
    mapOrganizacionToSummaryRecord(org)
  );

  return { allOrganizaciones, organizations };
}

/**
 * Resolves the single active `AlcanceCertificadoEntity | null` for every visible certificate
 * from `public.alcance` + `public.alcance_certificado_compartido` (`deleted_at IS NULL`).
 */
export function assembleAlcanceByCertificate(params: {
  certificados: ReadonlyArray<{ id: string; numero_certificado: string }>;
  rawAlcances?: ReadonlyArray<RawAlcanceRow> | null;
  rawSharedAlcances?: ReadonlyArray<RawAlcanceCompartidoRow> | null;
}): Map<string, AlcanceCertificadoEntity | null> {
  const result = new Map<string, AlcanceCertificadoEntity | null>();
  const certNumberById = new Map<string, string>();
  for (const cert of params.certificados) {
    certNumberById.set(cert.id, cert.numero_certificado);
    result.set(cert.id, null);
  }

  const ownByCertId = new Map<string, RawAlcanceRow>();
  const activeAlcanceById = new Map<string, RawAlcanceRow>();
  for (const row of params.rawAlcances || []) {
    if (row.deleted_at) continue;
    const id = String(row.id || '').trim();
    const certId = String(row.id_certificado || '').trim();
    if (!id || !certId) continue;
    activeAlcanceById.set(id, row);
    if (!ownByCertId.has(certId)) {
      ownByCertId.set(certId, row);
    }
  }

  const targetsByAlcanceId = new Map<string, AlcanceCertificadoSharedTargetRef[]>();
  const sharedLinkByTargetCertId = new Map<string, RawAlcanceCompartidoRow>();
  for (const link of params.rawSharedAlcances || []) {
    if (link.deleted_at) continue;
    const linkId = String(link.id || '').trim();
    const alcanceId = String(link.id_alcance || '').trim();
    const targetCertId = String(link.id_certificado || '').trim();
    if (!linkId || !alcanceId || !targetCertId) continue;

    if (!sharedLinkByTargetCertId.has(targetCertId)) {
      sharedLinkByTargetCertId.set(targetCertId, link);
    }

    const refs = targetsByAlcanceId.get(alcanceId) || [];
    if (!refs.some((r) => r.certId === targetCertId)) {
      refs.push({
        linkId,
        certId: targetCertId,
        numero_certificado: certNumberById.get(targetCertId) || 'Certificado',
      });
      targetsByAlcanceId.set(alcanceId, refs);
    }
  }

  for (const cert of params.certificados) {
    const ownRow = ownByCertId.get(cert.id);
    if (ownRow) {
      result.set(cert.id, {
        id: String(ownRow.id),
        id_certificado: cert.id,
        alcance_es: String(ownRow.alcance_es || ''),
        alcance_en: ownRow.alcance_en !== null && ownRow.alcance_en !== undefined && String(ownRow.alcance_en).trim() !== ''
          ? String(ownRow.alcance_en)
          : null,
        esCompartido: false,
        id_share_link: null,
        origenCertificadoNumero: cert.numero_certificado,
        sharedTargetCerts: targetsByAlcanceId.get(String(ownRow.id)) || [],
        deleted_at: null,
      });
      continue;
    }

    const sharedLink = sharedLinkByTargetCertId.get(cert.id);
    if (sharedLink) {
      const sourceRow = activeAlcanceById.get(String(sharedLink.id_alcance));
      if (sourceRow) {
        result.set(cert.id, {
          id: String(sourceRow.id),
          id_certificado: String(sourceRow.id_certificado),
          alcance_es: String(sourceRow.alcance_es || ''),
          alcance_en: sourceRow.alcance_en !== null && sourceRow.alcance_en !== undefined && String(sourceRow.alcance_en).trim() !== ''
            ? String(sourceRow.alcance_en)
            : null,
          esCompartido: true,
          id_share_link: String(sharedLink.id),
          origenCertificadoNumero: certNumberById.get(String(sourceRow.id_certificado)) || null,
          sharedTargetCerts: targetsByAlcanceId.get(String(sourceRow.id)) || [],
          deleted_at: null,
        });
      }
    }
  }

  return result;
}

export function mapCoverageReportToCache(
  report: CertificateCoverageReport
): CertificateCoberturaCache {
  return {
    total_obligatorios: report.summary.totalObligatorios,
    cubiertos_por_proceso: report.summary.cubiertosPorProceso,
    excluidos_no_aplicables: report.summary.excluidosNoAplicables,
    pendientes: report.summary.pendientes,
    porcentaje_cobertura: report.summary.porcentajeCobertura,
    cobertura_completa: report.summary.coberturaCompleta,
  };
}

/**
 * Evaluates normative coverage for a certificate on demand for either the active version
 * or an explicit historical/specific `id_certificado_version`.
 */
export function evaluateCertificateVersionCoverage(params: {
  cert: CertificadoDetailEntity;
  requirementsCatalog: ReadonlyArray<RequisitoLtree>;
  targetVersionId?: string;
  archivedProcesoIds?: ReadonlySet<string>;
  archivedNoAplicableIds?: ReadonlySet<string>;
}): {
  versionId: string | undefined;
  report: CertificateCoverageReport;
  cobertura: CertificateCoberturaCache;
} {
  const effectiveVersionId =
    (params.targetVersionId || '').trim() ||
    (params.cert.selected_version_id || '').trim() ||
    (params.cert.id_certificado_version || '').trim() ||
    undefined;

  const report = evaluateCertificateCoverage({
    cert: params.cert,
    requirementsCatalog: params.requirementsCatalog,
    targetVersionId: effectiveVersionId,
    archivedProcesoIds: params.archivedProcesoIds,
    archivedNoAplicableIds: params.archivedNoAplicableIds,
  });

  return {
    versionId: effectiveVersionId,
    report,
    cobertura: mapCoverageReportToCache(report),
  };
}

function scopeVersionChildItems<T extends { id_certificado_version?: string }>(
  items: ReadonlyArray<T>,
  versionId: string,
  activeVersionId: string
): T[] {
  return items.filter((item) => {
    const itemVersion = (item.id_certificado_version || '').trim();
    if (itemVersion) {
      return itemVersion === versionId;
    }
    return versionId === activeVersionId;
  });
}

function scopeTurnosByVersionSitios(
  turnos: ReadonlyArray<ShiftEntity>,
  versionSites: ReadonlyArray<SiteEntity>,
  versionId: string,
  activeVersionId: string
): ShiftEntity[] {
  const versionSiteIds = new Set(versionSites.map((s) => s.id));
  return turnos.filter((turno) => {
    if (turno.id_certificado_version) {
      return turno.id_certificado_version === versionId;
    }
    if ((turno.sitios_vinculados || []).some((sid) => versionSiteIds.has(sid))) {
      return true;
    }
    return versionId === activeVersionId && (turno.sitios_vinculados || []).length === 0;
  });
}

/**
 * Groups `certificado_version` rows (`version_numero DESC`, without flat `alcance`) and
 * version-scoped sub-entities (`sitio`, `proceso`, `procesos_por_sitio`, `requisitos_por_proceso`,
 * `requisitos_no_aplicables_certificado`, `fecha_certificado`, `contacto_certificado`, and
 * `turnos` scoped via parent `id_sitio`) into `cert.versiones[]`, projecting the active
 * version onto top-level `CertificadoDetailEntity` fields.
 */
export function assembleCertificateVersionsAndChildCollections(params: {
  cert: CertificadoDetailEntity;
  rawVersions?: ReadonlyArray<RawCertificadoVersionRow> | null;
  estatusById?: ReadonlyMap<string, EstatusCatalogItem>;
  sectorById?: ReadonlyMap<string, SectorIafEntity>;
  subsectorById?: ReadonlyMap<string, SubsectorIafEntity>;
  orgVersionAbrevById?: ReadonlyMap<string, string>;
  requirementsCatalog?: ReadonlyArray<RequisitoLtree>;
  archivedProcesoIds?: ReadonlySet<string>;
  archivedNoAplicableIds?: ReadonlySet<string>;
}): CertificadoDetailEntity {
  const { cert } = params;
  const estatusLookup =
    params.estatusById ?? new Map(INITIAL_ESTATUS_CATALOG.map((e) => [e.id, e]));
  const sectorLookup =
    params.sectorById ?? new Map(INITIAL_SECTORES_IAF.map((s) => [s.id, s]));
  const subsectorLookup =
    params.subsectorById ?? new Map(INITIAL_SUBSECTORES_IAF.map((sub) => [sub.id, sub]));

  const seedMeta = SEED_CERT_CONFIG_BY_ID[cert.id];
  const rawRows = (params.rawVersions || [])
    .filter((r) => !r.deleted_at && r.id_certificado === cert.id)
    .slice()
    .sort((a, b) => Number(b.version_numero ?? 0) - Number(a.version_numero ?? 0));

  const fallbackActiveVersionId =
    cert.id_certificado_version ||
    seedMeta?.id_certificado_version ||
    `cv-v1-${cert.id}`;

  const syntheticRows: RawCertificadoVersionRow[] =
    rawRows.length > 0
      ? rawRows
      : [
          {
            id: fallbackActiveVersionId,
            id_certificado: cert.id,
            id_organizacion_version:
              cert.id_organizacion_version ?? seedMeta?.id_organizacion_version ?? '',
            version_numero: cert.version_actual_numero ?? seedMeta?.version_actual_numero ?? 1,
            es_version_actual: true,
            notas_version: null,
            id_estatus: cert.id_estatus,
            id_sector_iaf: cert.id_sector_iaf,
            id_subsector_iaf: cert.id_subsector_iaf,
            multisitio: cert.multisitio,
            deleted_at: null,
          },
          ...(seedMeta?.extraHistoricalVersion
            ? [
                {
                  id: seedMeta.extraHistoricalVersion.id,
                  id_certificado: cert.id,
                  id_organizacion_version: seedMeta.extraHistoricalVersion.id_organizacion_version,
                  version_numero: seedMeta.extraHistoricalVersion.version_numero,
                  es_version_actual: false,
                  notas_version: seedMeta.extraHistoricalVersion.notas_version,
                  id_estatus: cert.id_estatus,
                  id_sector_iaf: cert.id_sector_iaf,
                  id_subsector_iaf: cert.id_subsector_iaf,
                  multisitio: cert.multisitio,
                  deleted_at: null,
                },
              ]
            : []),
        ];

  const activeRow =
    syntheticRows.find((r) => Boolean(r.es_version_actual)) ?? syntheticRows[0];
  const activeVersionId = String(activeRow.id);

  const snapshots: CertificadoVersionSnapshot[] = syntheticRows
    .slice()
    .sort((a, b) => Number(b.version_numero ?? 0) - Number(a.version_numero ?? 0))
    .map((vRow) => {
      const verId = String(vRow.id);
      const idEst = String(vRow.id_estatus || cert.id_estatus || '');
      const matchedEstatus = estatusLookup.get(idEst);
      const idSec = String(vRow.id_sector_iaf || cert.id_sector_iaf || '');
      const matchedSector = sectorLookup.get(idSec);
      const idSub = String(vRow.id_subsector_iaf || cert.id_subsector_iaf || '');
      const matchedSub = subsectorLookup.get(idSub);
      const idOrgVer = String(
        vRow.id_organizacion_version ||
          cert.id_organizacion_version ||
          seedMeta?.id_organizacion_version ||
          ''
      );
      const orgVerAbrev =
        (idOrgVer && params.orgVersionAbrevById?.get(idOrgVer)) ||
        cert.organizacion_abreviacion ||
        seedMeta?.organizacion_abreviacion ||
        null;

      const versionSitios = scopeVersionChildItems(cert.sitios, verId, activeVersionId);
      const versionProcesos = scopeVersionChildItems(cert.procesos, verId, activeVersionId);
      const versionTurnos = scopeTurnosByVersionSitios(
        cert.turnos,
        versionSitios,
        verId,
        activeVersionId
      );
      const versionNoAplicables = scopeVersionChildItems(
        cert.noAplicables,
        verId,
        activeVersionId
      );
      const versionContactos = scopeVersionChildItems(cert.contactos, verId, activeVersionId);
      const versionFechas = scopeVersionChildItems(cert.fechas, verId, activeVersionId);

      const snapshot: CertificadoVersionSnapshot = {
        id: verId,
        id_certificado: cert.id,
        id_organizacion_version: idOrgVer,
        organizacion_abreviacion: orgVerAbrev,
        version_numero: Math.max(1, Number(vRow.version_numero ?? 1)),
        es_version_actual: verId === activeVersionId || Boolean(vRow.es_version_actual),
        notas_version: vRow.notas_version ? String(vRow.notas_version) : null,
        id_estatus: idEst,
        estatus: matchedEstatus?.estatus || cert.estatus,
        id_sector_iaf: idSec,
        sector_iaf: matchedSector?.sector ?? cert.sector_iaf,
        sector_iaf_descripcion:
          matchedSector?.descripcion || cert.sector_iaf_descripcion,
        id_subsector_iaf: idSub,
        subsector_iaf_codigo: matchedSub?.codigo ?? cert.subsector_iaf_codigo,
        subsector_iaf_descripcion:
          matchedSub?.descripcion ?? cert.subsector_iaf_descripcion,
        subsector_categoria_riesgo:
          matchedSub?.categoria_riesgo ?? cert.subsector_categoria_riesgo,
        multisitio:
          typeof vRow.multisitio === 'boolean' ? vRow.multisitio : cert.multisitio,
        sitios: versionSitios,
        procesos: versionProcesos,
        turnos: versionTurnos,
        noAplicables: versionNoAplicables,
        contactos: versionContactos,
        fechas: versionFechas,
        deleted_at: null,
      };

      if (params.requirementsCatalog && params.requirementsCatalog.length > 0) {
        const tempCertForEval: CertificadoDetailEntity = {
          ...cert,
          id_certificado_version: verId,
          selected_version_id: verId,
          version_actual_numero: snapshot.version_numero,
          sitios: versionSitios,
          procesos: versionProcesos,
          turnos: versionTurnos,
          noAplicables: versionNoAplicables,
          contactos: versionContactos,
        };
        const { cobertura } = evaluateCertificateVersionCoverage({
          cert: tempCertForEval,
          requirementsCatalog: params.requirementsCatalog,
          targetVersionId: verId,
          archivedProcesoIds: params.archivedProcesoIds,
          archivedNoAplicableIds: params.archivedNoAplicableIds,
        });
        snapshot.cobertura = cobertura;
      }

      return snapshot;
    });

  const activeSnapshot =
    snapshots.find((s) => s.es_version_actual) ?? snapshots[0];
  const activeFechas = scopeVersionChildItems(cert.fechas, activeVersionId, activeVersionId);

  const enriched: CertificadoDetailEntity = {
    ...cert,
    id_organizacion_version:
      activeSnapshot?.id_organizacion_version || cert.id_organizacion_version,
    organizacion_abreviacion:
      cert.organizacion_abreviacion ||
      activeSnapshot?.organizacion_abreviacion ||
      seedMeta?.organizacion_abreviacion ||
      SEED_ORG_ABREV_BY_ID[cert.id_organizacion],
    id_certificado_version: activeSnapshot?.id || activeVersionId,
    selected_version_id:
      cert.selected_version_id &&
      snapshots.some((s) => s.id === cert.selected_version_id)
        ? cert.selected_version_id
        : activeSnapshot?.id || activeVersionId,
    version_actual_numero: activeSnapshot?.version_numero ?? 1,
    versiones: snapshots,
    id_estatus: activeSnapshot?.id_estatus || cert.id_estatus,
    estatus: activeSnapshot?.estatus || cert.estatus,
    id_sector_iaf: activeSnapshot?.id_sector_iaf || cert.id_sector_iaf,
    sector_iaf: activeSnapshot?.sector_iaf ?? cert.sector_iaf,
    sector_iaf_descripcion:
      activeSnapshot?.sector_iaf_descripcion || cert.sector_iaf_descripcion,
    id_subsector_iaf: activeSnapshot?.id_subsector_iaf || cert.id_subsector_iaf,
    subsector_iaf_codigo:
      activeSnapshot?.subsector_iaf_codigo ?? cert.subsector_iaf_codigo,
    subsector_iaf_descripcion:
      activeSnapshot?.subsector_iaf_descripcion ?? cert.subsector_iaf_descripcion,
    subsector_categoria_riesgo:
      activeSnapshot?.subsector_categoria_riesgo ?? cert.subsector_categoria_riesgo,
    multisitio: activeSnapshot?.multisitio ?? cert.multisitio,
    sitios: activeSnapshot?.sitios ?? cert.sitios,
    procesos: activeSnapshot?.procesos ?? cert.procesos,
    turnos: activeSnapshot?.turnos ?? cert.turnos,
    noAplicables: activeSnapshot?.noAplicables ?? cert.noAplicables,
    contactos: activeSnapshot?.contactos ?? cert.contactos,
    fechas: activeFechas,
    cobertura: activeSnapshot?.cobertura ?? cert.cobertura,
  };

  return enriched;
}

export function buildCertificateSearchRecordFromDetail(
  cert: CertificadoDetailEntity
): CertificateRecord {
  const alcanceEs =
    cert.alcanceDetalle?.alcance_es ??
    (cert.alcance && cert.alcance.trim() ? cert.alcance.trim() : '');
  const alcanceEn = cert.alcanceDetalle?.alcance_en ?? null;
  const tieneAlcance = Boolean(cert.alcanceDetalle !== null && (cert.alcanceDetalle || alcanceEs));

  const coberturaPct = cert.cobertura
    ? Math.round(cert.cobertura.porcentaje_cobertura)
    : 86;
  const coberturaResumen = cert.cobertura
    ? {
        covered: cert.cobertura.cubiertos_por_proceso,
        nonApplicable: cert.cobertura.excluidos_no_aplicables,
        pending: cert.cobertura.pendientes,
        total: cert.cobertura.total_obligatorios,
      }
    : undefined;

  return {
    id: cert.id,
    numero_certificado: cert.numero_certificado,
    organizacion_id: cert.id_organizacion,
    organizacion_nombre: cert.organizacion_nombre,
    organizacion_abreviacion: cert.organizacion_abreviacion,
    organizacion_rif: cert.organizacion_rif,
    direccion_fiscal: cert.direccion_fiscal,
    norma_id: cert.id_norma,
    norma: cert.norma_codigo,
    esquema: cert.esquema,
    estatus: cert.estatus.toUpperCase(),
    sector_iaf: cert.sector_iaf,
    version_numero: cert.version_actual_numero ?? 1,
    multisitio: cert.multisitio,
    sitios_count: cert.sitios.length,
    cobertura_porcentaje: coberturaPct,
    cobertura_resumen: coberturaResumen,
    fecha_emision: cert.fecha_emision,
    fecha_vencimiento: cert.fecha_vencimiento,
    alcance: alcanceEs,
    alcance_es: alcanceEs,
    alcance_en: alcanceEn,
    tiene_alcance: tieneAlcance,
  };
}

/**
 * Enriches seeded `CertificadoDetailEntity[]` with `organizacion_version`, `certificado_version`,
 * `alcanceDetalle` (own/shared/null), and `CertificateRecord[]` with bilingual scope & abbreviation.
 */
export function normalizeSeededCertificadosWithVersionAndAlcance(
  seedCerts: ReadonlyArray<CertificadoDetailEntity>,
  organizaciones: ReadonlyArray<OrganizacionEntity> = INITIAL_ORGANIZACIONES,
  requirementsCatalog?: ReadonlyArray<RequisitoLtree>
): {
  certificados: CertificadoDetailEntity[];
  searchRecords: CertificateRecord[];
} {
  const orgById = new Map(organizaciones.map((o) => [o.id, o]));
  const orgVersionAbrevById = new Map<string, string>();
  for (const org of organizaciones) {
    for (const v of org.versiones || []) {
      if (v.abreviacion) {
        orgVersionAbrevById.set(v.id, v.abreviacion);
      }
    }
    if (org.id_organizacion_version_actual && org.abreviacion) {
      orgVersionAbrevById.set(org.id_organizacion_version_actual, org.abreviacion);
    }
  }

  const certNumberById = new Map(seedCerts.map((c) => [c.id, c.numero_certificado]));

  const normalized = seedCerts.map((cert) => {
    const org = orgById.get(cert.id_organizacion);
    const seedMeta = SEED_CERT_CONFIG_BY_ID[cert.id];
    const orgAbrev =
      cert.organizacion_abreviacion ||
      org?.abreviacion ||
      seedMeta?.organizacion_abreviacion ||
      SEED_ORG_ABREV_BY_ID[cert.id_organizacion];

    let resolvedAlcance: AlcanceCertificadoEntity | null;
    if (cert.alcanceDetalle !== undefined) {
      resolvedAlcance = cert.alcanceDetalle;
    } else if (seedMeta?.noAlcance) {
      resolvedAlcance = null;
    } else if (seedMeta?.sharedFromAlcanceId) {
      const originMeta = seedMeta.origenCertId
        ? SEED_CERT_CONFIG_BY_ID[seedMeta.origenCertId]
        : undefined;
      const originAlcanceEs = originMeta?.alcance_es || cert.alcance || '';
      resolvedAlcance = {
        id: seedMeta.sharedFromAlcanceId,
        id_certificado: seedMeta.origenCertId || cert.id,
        alcance_es: originAlcanceEs,
        alcance_en: originMeta?.alcance_en ?? null,
        esCompartido: true,
        id_share_link: seedMeta.sharedLinkId ?? null,
        origenCertificadoNumero:
          seedMeta.origenCertNumero ||
          (seedMeta.origenCertId ? certNumberById.get(seedMeta.origenCertId) || null : null),
        sharedTargetCerts: [
          {
            linkId: seedMeta.sharedLinkId || `share-${cert.id}`,
            certId: cert.id,
            numero_certificado: cert.numero_certificado,
          },
        ],
        deleted_at: null,
      };
    } else {
      const alcanceEs = (seedMeta?.alcance_es || cert.alcance || '').trim();
      if (!alcanceEs) {
        resolvedAlcance = null;
      } else {
        const sharedTargets: AlcanceCertificadoSharedTargetRef[] = [];
        for (const [otherId, otherMeta] of Object.entries(SEED_CERT_CONFIG_BY_ID)) {
          if (
            seedMeta?.alcanceId &&
            otherMeta.sharedFromAlcanceId === seedMeta.alcanceId &&
            certNumberById.has(otherId)
          ) {
            sharedTargets.push({
              linkId: otherMeta.sharedLinkId || `share-${otherId}`,
              certId: otherId,
              numero_certificado: certNumberById.get(otherId) || 'Certificado',
            });
          }
        }
        resolvedAlcance = {
          id: seedMeta?.alcanceId || `alc-${cert.id}`,
          id_certificado: cert.id,
          alcance_es: alcanceEs,
          alcance_en: seedMeta?.alcance_en ?? null,
          esCompartido: false,
          id_share_link: null,
          origenCertificadoNumero: cert.numero_certificado,
          sharedTargetCerts: sharedTargets,
          deleted_at: null,
        };
      }
    }

    const withAlcanceAndOrg: CertificadoDetailEntity = {
      ...cert,
      id_organizacion_version:
        cert.id_organizacion_version ||
        org?.id_organizacion_version_actual ||
        seedMeta?.id_organizacion_version,
      organizacion_abreviacion: orgAbrev,
      alcance: resolvedAlcance ? resolvedAlcance.alcance_es : '',
      alcanceDetalle: resolvedAlcance,
    };

    return assembleCertificateVersionsAndChildCollections({
      cert: withAlcanceAndOrg,
      orgVersionAbrevById,
      requirementsCatalog,
    });
  });

  const searchRecords = normalized.map(buildCertificateSearchRecordFromDetail);
  return { certificados: normalized, searchRecords };
}

export function resolveAuditCertificateVersionMeta(params: {
  id_certificado: string;
  rawIdCertificadoVersion?: string | null;
  rawVersionNumero?: number | null;
  certificados: ReadonlyArray<{
    id: string;
    id_certificado_version?: string;
    version_actual_numero?: number;
    versiones?: ReadonlyArray<{ id: string; version_numero: number; es_version_actual?: boolean }>;
  }>;
}): {
  id_certificado_version: string | null;
  version_numero: number | null;
} {
  const matchedCert = params.certificados.find((c) => c.id === params.id_certificado);
  const cleanVerId = (params.rawIdCertificadoVersion || '').trim();
  const explicitNum =
    typeof params.rawVersionNumero === 'number' && params.rawVersionNumero > 0
      ? Math.floor(params.rawVersionNumero)
      : null;

  if (cleanVerId) {
    const matchedVersion = matchedCert?.versiones?.find((v) => v.id === cleanVerId);
    const verNum =
      explicitNum ??
      (matchedVersion ? Math.max(1, Math.floor(matchedVersion.version_numero)) : null) ??
      (matchedCert?.id_certificado_version === cleanVerId
        ? matchedCert.version_actual_numero ?? null
        : null);
    return { id_certificado_version: cleanVerId, version_numero: verNum };
  }

  if (matchedCert) {
    const fallbackVerId = matchedCert.id_certificado_version || matchedCert.versiones?.[0]?.id || null;
    const fallbackNum =
      explicitNum ??
      matchedCert.version_actual_numero ??
      matchedCert.versiones?.[0]?.version_numero ??
      null;
    return {
      id_certificado_version: fallbackVerId,
      version_numero: fallbackNum,
    };
  }

  return { id_certificado_version: null, version_numero: explicitNum };
}
