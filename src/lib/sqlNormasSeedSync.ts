/**
 * Paso 2.1: Sincronizador Especializado `Extra → Norma` sobre
 * `public/supabase/queries/07_normas_requisitos_csv.sql`
 *
 * Responsabilidades:
 * 1. Enrutamiento estricto de `extra.norma` (`norma`, `requisito`, `requisito_traduccion`)
 *    hacia `public/supabase/queries/07_normas_requisitos_csv.sql`, manteniendo
 *    coherencia FK transversal con `06_datos_prueba.sql` (que se ejecuta antes en
 *    resets `00 → 07`).
 * 2. Parseo e indexación de `07_normas_requisitos_csv.sql` sin falsos positivos de
 *    columnas sintéticas ni saltos CRLF/LF en HTML bilingüe ES/EN.
 * 3. Generación idempotente canónica (`buildNormas07SqlDocument`) compatible con
 *    `scripts/buildNormasSeed.ts`:
 *    - Bloque 1 (`public.norma`) + archivados vía `ON CONFLICT (id) DO UPDATE`.
 *    - Bloque 2 (`public.requisito`) ordenado estrictamente padre antes que hijo
 *      (`nivel ASC` + topological BFS), con `ruta_materializada::ltree` y fidelidad
 *      real a `es_obligatorio` / `obligatorio_origen = 'MANUAL'`.
 *    - Bloque 3 (`public.requisito_traduccion`) en lotes deterministas con escape SQL
 *      seguro (cero `$$` desbalanceados, cero `DELETE FROM`).
 * 4. Validación histórica de los 7 UUIDs ISO 9001:2015, sintaxis `LTREE`, cálculo de
 *    `SyncDiffSummary` Zero-UUID y helpers `previewNormas07Sync` / `applyNormas07Sync`.
 */

import { computeRequisitoLtreePath } from './extraDomain';
import {
  CSV_STANDARD_DEFINITIONS,
  HISTORICAL_CLAUSE_UUID_BY_EXTERNAL_KEY,
  LTREE_PATH_PATTERN,
} from './requisitoCsvImporter';
import {
  parseExistingSqlSeedRecords,
  validateUpdatedSeedSql,
  type ParsedSeedRecord,
  type ParsedSqlSeedIndex,
  type SqlSeedValidationResult,
} from './sqlSeedFileUpdater';
import {
  computeTableSyncDiff,
  formatSqlLiteral,
  hasBalancedDollarDelimiters,
  type SqlRowRecord,
  type SyncDiffSummary,
  type TableDiffResult,
} from './sqlSeedGenerator';
import {
  getSyncTableMetadata,
  resolveSyncSelectionPlan,
  type SqlSeedTargetFile,
} from './sqlSeedSyncCatalog';
import { containsRawUuid } from './zeroUuid';

export const NORMAS_07_TARGET_FILE: SqlSeedTargetFile = '07_normas_requisitos_csv.sql';
export const NORMAS_07_SECTION_ID = 'extra.norma' as const;
export const NORMAS_07_TABLES = ['norma', 'requisito', 'requisito_traduccion'] as const;
export type Normas07TableName = (typeof NORMAS_07_TABLES)[number];

export const NORMAS_07_BUILD_SEED_NOTE_ES =
  '07_normas_requisitos_csv.sql se sincronizó directamente desde el estado vivo en PostgreSQL (Extra → Norma). El generador scripts/buildNormasSeed.ts y src/lib/generated/normasCatalogBundle.ts permanecen disponibles si actualizas los CSV originales en public/requisitos/.';

/**
 * Columnas persistidas reales en `01_creacion.sql` para evitar falsos positivos
 * por propiedades derivadas de UI (`nivel`, `es_padre`, `norma_codigo`, `vigente`, etc.).
 */
const NORMA_COMPARE_COLUMNS: readonly string[] = [
  'id',
  'esquema',
  'codigo',
  'titulo',
  'estatus',
  'fecha_publicacion',
  'norma',
  'deleted_at',
  'deleted_by',
  'delete_reason',
];

const REQUISITO_COMPARE_COLUMNS: readonly string[] = [
  'id',
  'id_norma',
  'id_requisito_padre',
  'codigo',
  'ruta_materializada',
  'explicit_code',
  'external_key',
  'es_obligatorio',
  'obligatorio_origen',
  'deleted_at',
  'deleted_by',
  'delete_reason',
];

const TRADUCCION_COMPARE_COLUMNS: readonly string[] = [
  'id',
  'id_requisito',
  'lang',
  'title',
  'content_html',
  'deleted_at',
  'deleted_by',
];

const BASE_06_REFERENCING_NORMA_TABLES: readonly string[] = [
  'acreditacion_norma',
  'certificado',
  'norma_auditor',
];

const BASE_06_REFERENCING_REQUISITO_TABLES: readonly string[] = [
  'requisitos_por_proceso',
  'requisitos_no_aplicables_certificado',
  'hallazgo',
];

const CANONICAL_STANDARD_ORDER = new Map<string, number>(
  CSV_STANDARD_DEFINITIONS.map((std, index) => [std.id, index])
);

const BASE_06_KNOWN_NORMA_IDS = new Set<string>(
  CSV_STANDARD_DEFINITIONS.slice(0, 5).map((std) => std.id)
);

const HISTORICAL_EXTERNAL_KEY_BY_UUID = new Map<string, string>(
  Object.entries(HISTORICAL_CLAUSE_UUID_BY_EXTERNAL_KEY).map(([extKey, uuid]) => [uuid, extKey])
);

export type Normas07LiveDatasetInput =
  | {
      norma?: readonly SqlRowRecord[];
      requisito?: readonly SqlRowRecord[];
      requisito_traduccion?: readonly SqlRowRecord[];
    }
  | Readonly<Record<string, readonly SqlRowRecord[]>>;

export interface ExtraNormaRoutingResolution {
  selectedSectionIds: string[];
  includesExtraNorma: boolean;
  targetFileForNormas: SqlSeedTargetFile;
  routedTables: readonly Normas07TableName[];
  alsoTouches06DatosPrueba: boolean;
  tablesFor06: string[];
  tablesFor07: string[];
}

export interface ParsedNormas07Records {
  norma: SqlRowRecord[];
  requisito: SqlRowRecord[];
  requisito_traduccion: SqlRowRecord[];
  recordsByTable: {
    norma: ParsedSeedRecord[];
    requisito: ParsedSeedRecord[];
    requisito_traduccion: ParsedSeedRecord[];
  };
  index: ParsedSqlSeedIndex;
  warnings: string[];
}

export interface HistoricalUuidMismatch {
  externalKey: string;
  actualCodigo: string;
  reason: string;
}

export interface HistoricalUuidCheckResult {
  valid: boolean;
  totalExpected: number;
  iso9001Present: boolean;
  preservedKeys: string[];
  missingKeys: string[];
  mismatches: HistoricalUuidMismatch[];
  errors: string[];
  warnings: string[];
}

export interface CrossFileNormaReference {
  tableName: string;
  normaCodigo: string;
  normaTitulo: string;
  referenceCount: number;
}

export interface CrossFileRequisitoReference {
  tableName: string;
  normaCodigo: string;
  requisitoCodigo: string;
  referenceCount: number;
}

export interface CrossFileNormaCoherenceResult {
  hasCrossFileReferences: boolean;
  referencedNewNormas: Array<{ codigo: string; titulo: string }>;
  normaReferences: CrossFileNormaReference[];
  requisitoReferences: CrossFileRequisitoReference[];
  warnings: string[];
  optional06NormaStubSql: string | null;
}

export interface Normas07ValidationResult extends SqlSeedValidationResult {
  validLtreePaths: boolean;
  validTopologicalOrder: boolean;
  historicalUuidsPreserved: boolean;
  ltreeCastCount: number;
  hasRequiredConflictTargets: boolean;
}

export interface BuildNormas07DocumentOptions {
  /** Tamaño de lote determinista para `public.requisito` (default: 250, recomendado 100–250). */
  requisitoBatchSize?: number;
  /** Tamaño de lote determinista para `public.requisito_traduccion` (default: 150). */
  traduccionBatchSize?: number;
  /** Etiqueta de origen en cabecera del script. */
  generatedByLabel?: string;
}

export interface Normas07SyncOptions extends BuildNormas07DocumentOptions {
  /** Contenido actual de `06_datos_prueba.sql` para verificar coherencia FK en resets `00 → 07`. */
  existing06SqlContent?: string;
  /** Filas vivas de tablas de `06` para detectar referencias hacia normas nuevas (#9+) o nuevas cláusulas. */
  live06RowsByTable?: Readonly<Record<string, readonly SqlRowRecord[]>>;
  /** Resolver opcional Zero-UUID para etiquetas humanas en `sampleLabels`. */
  labelResolver?: (row: SqlRowRecord, tableName: string) => string | null;
}

export interface Normas07DiffResult {
  norma: TableDiffResult<SqlRowRecord>;
  requisito: TableDiffResult<SqlRowRecord>;
  requisito_traduccion: TableDiffResult<SqlRowRecord>;
  summaryByTable: Record<Normas07TableName, SyncDiffSummary>;
  orderedSummaries: SyncDiffSummary[];
  hasChanges: boolean;
}

export interface Normas07SyncResult {
  targetFile: SqlSeedTargetFile;
  nextSqlContent: string;
  changed: boolean;
  summaryByTable: Record<Normas07TableName, SyncDiffSummary>;
  orderedSummaries: SyncDiffSummary[];
  diffSnippets: string[];
  warnings: string[];
  validation: Normas07ValidationResult;
  historicalUuidCheck: HistoricalUuidCheckResult;
  crossFileCoherence: CrossFileNormaCoherenceResult;
  buildNormasSeedNoteEs: string;
  counts: {
    normasActive: number;
    normasArchived: number;
    requisitosActive: number;
    requisitosArchived: number;
    traduccionesActive: number;
    traduccionesArchived: number;
    tablesWithChanges: number;
    toInsert: number;
    toUpdate: number;
    toArchive: number;
  };
}

function getTrimmedString(row: SqlRowRecord, key: string): string {
  const val = row[key];
  if (typeof val === 'string') return val.trim();
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function isArchivedRow(row: SqlRowRecord): boolean {
  return row.deleted_at !== null && row.deleted_at !== undefined && String(row.deleted_at).trim() !== '';
}

function sanitizeZeroUuidText(text: string, fallback: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean || containsRawUuid(clean)) return fallback;
  return clean;
}

function chunkArray<T>(items: readonly T[], size: number): T[][] {
  const safeSize = Math.max(1, Math.floor(size));
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += safeSize) {
    out.push(items.slice(i, i + safeSize));
  }
  return out;
}

function normalizeDateString(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) {
    return Number.isNaN(val.getTime()) ? null : val.toISOString().slice(0, 10);
  }
  const text = String(val).trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString().slice(0, 10);
}

function normalizeHtmlNewlines(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function normalizeLiveNormaRow(row: SqlRowRecord): SqlRowRecord {
  const codigo = getTrimmedString(row, 'codigo') || getTrimmedString(row, 'norma');
  const normaName = getTrimmedString(row, 'norma') || codigo;
  const titulo = getTrimmedString(row, 'titulo') || normaName;
  const estatus = getTrimmedString(row, 'estatus') || 'Vigente';
  const esquema = getTrimmedString(row, 'esquema') || 'General';

  return {
    id: getTrimmedString(row, 'id'),
    esquema,
    codigo,
    titulo,
    estatus,
    fecha_publicacion: normalizeDateString(row.fecha_publicacion),
    norma: normaName,
    deleted_at: row.deleted_at ?? null,
    deleted_by: row.deleted_by ?? null,
    delete_reason: row.delete_reason ?? null,
  };
}

function normalizeLiveRequisitoRow(row: SqlRowRecord): SqlRowRecord {
  const parentIdRaw = getTrimmedString(row, 'id_requisito_padre');
  const extKeyRaw = getTrimmedString(row, 'external_key');
  const rutaRaw = getTrimmedString(row, 'ruta_materializada');

  return {
    id: getTrimmedString(row, 'id'),
    id_norma: getTrimmedString(row, 'id_norma'),
    id_requisito_padre: parentIdRaw || null,
    codigo: getTrimmedString(row, 'codigo'),
    ruta_materializada: rutaRaw,
    explicit_code: row.explicit_code === true || row.explicit_code === 'true' || row.explicit_code === 1,
    external_key: extKeyRaw || null,
    es_obligatorio:
      row.es_obligatorio === undefined || row.es_obligatorio === null
        ? true
        : row.es_obligatorio === true || row.es_obligatorio === 'true' || row.es_obligatorio === 1,
    obligatorio_origen: getTrimmedString(row, 'obligatorio_origen') || 'AUTO_TEXT',
    deleted_at: row.deleted_at ?? null,
    deleted_by: row.deleted_by ?? null,
    delete_reason: row.delete_reason ?? null,
  };
}

function normalizeLiveTraduccionRow(row: SqlRowRecord): SqlRowRecord {
  const lang = getTrimmedString(row, 'lang').toLowerCase() === 'en' ? 'en' : 'es';
  const rawTitle = typeof row.title === 'string' ? row.title.replace(/\r\n/g, '\n').replace(/\r/g, '\n') : '';

  return {
    id: getTrimmedString(row, 'id'),
    id_requisito: getTrimmedString(row, 'id_requisito'),
    lang,
    title: rawTitle,
    content_html: normalizeHtmlNewlines(row.content_html),
    deleted_at: row.deleted_at ?? null,
    deleted_by: row.deleted_by ?? null,
  };
}

function extractLiveTables(liveData: Normas07LiveDatasetInput): {
  normas: SqlRowRecord[];
  requisitos: SqlRowRecord[];
  traducciones: SqlRowRecord[];
} {
  const rawNormas = Array.isArray(liveData.norma) ? liveData.norma : [];
  const rawRequisitos = Array.isArray(liveData.requisito) ? liveData.requisito : [];
  const rawTraducciones = Array.isArray(liveData.requisito_traduccion)
    ? liveData.requisito_traduccion
    : [];

  return {
    normas: rawNormas.map(normalizeLiveNormaRow),
    requisitos: rawRequisitos.map(normalizeLiveRequisitoRow),
    traducciones: rawTraducciones.map(normalizeLiveTraduccionRow),
  };
}

/**
 * Resuelve el enrutamiento oficial de `Extra → Norma` dentro del catálogo de sincronización.
 * Garantiza que `norma`, `requisito` y `requisito_traduccion` apunten exclusivamente a
 * `07_normas_requisitos_csv.sql` (nunca a `06_datos_prueba.sql`).
 */
export function resolveExtraNormaSyncTarget(
  selectedSectionIds: readonly string[],
  includeParentFkDependencies = true
): ExtraNormaRoutingResolution {
  const plan = resolveSyncSelectionPlan(selectedSectionIds, { includeParentFkDependencies });
  const includesExtraNorma = plan.hasSpecialNormasCase || plan.tablesFor07.length > 0;

  return {
    selectedSectionIds: plan.selectedSectionIds,
    includesExtraNorma,
    targetFileForNormas: NORMAS_07_TARGET_FILE,
    routedTables: includesExtraNorma ? [...NORMAS_07_TABLES] : [],
    alsoTouches06DatosPrueba: plan.tablesFor06.length > 0,
    tablesFor06: plan.tablesFor06,
    tablesFor07: plan.tablesFor07,
  };
}

/**
 * Parsea `public/supabase/queries/07_normas_requisitos_csv.sql` y normaliza las filas
 * de `norma`, `requisito` y `requisito_traduccion` eliminando propiedades sintéticas
 * no presentes en el DDL real de PostgreSQL (ej. `vigente`).
 */
export function parseNormas07SqlRecords(sqlContent: string): ParsedNormas07Records {
  const index = parseExistingSqlSeedRecords(sqlContent);

  const normaRecs = index.recordsByTable['norma'] ?? [];
  const requisitoRecs = index.recordsByTable['requisito'] ?? [];
  const traduccionRecs = index.recordsByTable['requisito_traduccion'] ?? [];

  const norma = normaRecs.map((rec) => {
    const clean: SqlRowRecord = { ...rec.row };
    if (!rec.insertColumns.includes('vigente')) {
      delete clean.vigente;
    }
    return normalizeLiveNormaRow(clean);
  });

  const requisito = requisitoRecs.map((rec) => normalizeLiveRequisitoRow(rec.row));
  const requisito_traduccion = traduccionRecs.map((rec) => normalizeLiveTraduccionRow(rec.row));

  return {
    norma,
    requisito,
    requisito_traduccion,
    recordsByTable: {
      norma: normaRecs,
      requisito: requisitoRecs,
      requisito_traduccion: traduccionRecs,
    },
    index,
    warnings: [...index.warnings],
  };
}

/**
 * Ordena estándares de forma determinista: primero los 8 estándares canónicos en su
 * orden oficial y luego cualquier norma adicional por código y UUID.
 */
export function sortNormasDeterministically<T extends SqlRowRecord>(normas: readonly T[]): T[] {
  return [...normas].sort((a, b) => {
    const idA = getTrimmedString(a, 'id');
    const idB = getTrimmedString(b, 'id');
    const ordA = CANONICAL_STANDARD_ORDER.get(idA) ?? Number.MAX_SAFE_INTEGER;
    const ordB = CANONICAL_STANDARD_ORDER.get(idB) ?? Number.MAX_SAFE_INTEGER;
    if (ordA !== ordB) return ordA - ordB;
    const codCmp = getTrimmedString(a, 'codigo').localeCompare(getTrimmedString(b, 'codigo'));
    if (codCmp !== 0) return codCmp;
    return idA.localeCompare(idB);
  });
}

function computeRequisitoDepthAndOrder(
  rows: readonly SqlRowRecord[]
): Map<string, number> {
  const byId = new Map<string, SqlRowRecord>();
  for (const row of rows) {
    const id = getTrimmedString(row, 'id');
    if (id) byId.set(id, row);
  }

  const depthCache = new Map<string, number>();
  const resolveDepth = (id: string, visiting: Set<string>): number => {
    const cached = depthCache.get(id);
    if (cached !== undefined) return cached;
    const row = byId.get(id);
    if (!row) return 1;

    const ruta = getTrimmedString(row, 'ruta_materializada');
    if (ruta && LTREE_PATH_PATTERN.test(ruta)) {
      const segs = ruta.split('.').length;
      depthCache.set(id, segs);
      return segs;
    }

    const parentId = getTrimmedString(row, 'id_requisito_padre');
    if (!parentId || parentId === id || !byId.has(parentId) || visiting.has(parentId)) {
      depthCache.set(id, 1);
      return 1;
    }
    visiting.add(id);
    const d = 1 + resolveDepth(parentId, visiting);
    depthCache.set(id, d);
    return d;
  };

  for (const id of byId.keys()) {
    resolveDepth(id, new Set<string>());
  }
  return depthCache;
}

/**
 * Ordenamiento topológico estricto para `public.requisito`:
 * - Siempre garantiza que todo `id_requisito_padre` aparezca antes que sus hijos (incluso entre lotes).
 * - Ordena por `nivel ASC`, orden canónico de `norma`, `ruta_materializada` y `codigo`.
 */
export function sortRequisitosTopologicallyFor07<T extends SqlRowRecord>(rows: readonly T[]): T[] {
  if (rows.length <= 1) return [...rows];

  const rowById = new Map<string, T>();
  const originalIndex = new Map<string, number>();
  const childrenByParent = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  rows.forEach((row, idx) => {
    const id = getTrimmedString(row, 'id') || `__idx_${idx}`;
    rowById.set(id, row);
    originalIndex.set(id, idx);
    inDegree.set(id, 0);
  });

  for (const [id, row] of rowById.entries()) {
    const parentId = getTrimmedString(row, 'id_requisito_padre');
    if (parentId && parentId !== id && rowById.has(parentId)) {
      inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
      const list = childrenByParent.get(parentId) ?? [];
      list.push(id);
      childrenByParent.set(parentId, list);
    }
  }

  const depthById = computeRequisitoDepthAndOrder(rows);

  const compareTie = (idA: string, idB: string): number => {
    const rA = rowById.get(idA)!;
    const rB = rowById.get(idB)!;

    const nivelA = depthById.get(idA) ?? 1;
    const nivelB = depthById.get(idB) ?? 1;
    if (nivelA !== nivelB) return nivelA - nivelB;

    const stdA = CANONICAL_STANDARD_ORDER.get(getTrimmedString(rA, 'id_norma')) ?? Number.MAX_SAFE_INTEGER;
    const stdB = CANONICAL_STANDARD_ORDER.get(getTrimmedString(rB, 'id_norma')) ?? Number.MAX_SAFE_INTEGER;
    if (stdA !== stdB) return stdA - stdB;

    const normCmp = getTrimmedString(rA, 'id_norma').localeCompare(getTrimmedString(rB, 'id_norma'));
    if (normCmp !== 0) return normCmp;

    const rutaCmp = getTrimmedString(rA, 'ruta_materializada').localeCompare(
      getTrimmedString(rB, 'ruta_materializada')
    );
    if (rutaCmp !== 0) return rutaCmp;

    const codCmp = getTrimmedString(rA, 'codigo').localeCompare(getTrimmedString(rB, 'codigo'));
    if (codCmp !== 0) return codCmp;

    return (originalIndex.get(idA) ?? 0) - (originalIndex.get(idB) ?? 0);
  };

  const queue = Array.from(rowById.keys())
    .filter((id) => (inDegree.get(id) ?? 0) === 0)
    .sort(compareTie);

  const orderedIds: string[] = [];
  const emitted = new Set<string>();

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (emitted.has(currentId)) continue;
    emitted.add(currentId);
    orderedIds.push(currentId);

    const children = childrenByParent.get(currentId) ?? [];
    for (const childId of children) {
      const nextDeg = (inDegree.get(childId) ?? 1) - 1;
      inDegree.set(childId, nextDeg);
      if (nextDeg <= 0 && !emitted.has(childId)) {
        queue.push(childId);
      }
    }
    queue.sort(compareTie);
  }

  if (orderedIds.length < rows.length) {
    const remaining = Array.from(rowById.keys())
      .filter((id) => !emitted.has(id))
      .sort(compareTie);
    orderedIds.push(...remaining);
  }

  return orderedIds.map((id) => rowById.get(id)!);
}

/**
 * Verifica la preservación de los 7 UUIDs históricos de ISO 9001:2015 referenciados
 * por FK en `06_datos_prueba.sql` y `src/lib/requisitoCsvImporter.ts`.
 */
export function verifyHistoricalIso9001Uuids(
  requisitos: readonly SqlRowRecord[],
  sqlContent?: string
): HistoricalUuidCheckResult {
  const iso9001Id = 'e0000000-0000-0000-0000-000000009001';
  const byExternalKey = new Map<string, SqlRowRecord>();
  const byId = new Map<string, SqlRowRecord>();
  let iso9001Present = false;

  for (const row of requisitos) {
    const id = getTrimmedString(row, 'id');
    const idNorma = getTrimmedString(row, 'id_norma');
    const extKey = getTrimmedString(row, 'external_key');
    if (idNorma === iso9001Id) iso9001Present = true;
    if (id) byId.set(id, row);
    if (extKey) byExternalKey.set(extKey, row);
  }

  const preservedKeys: string[] = [];
  const missingKeys: string[] = [];
  const mismatches: HistoricalUuidMismatch[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const [extKey, expectedUuid] of Object.entries(HISTORICAL_CLAUSE_UUID_BY_EXTERNAL_KEY)) {
    const rowByExt = byExternalKey.get(extKey);
    const rowByExpectedId = byId.get(expectedUuid);

    if (rowByExt) {
      const actualId = getTrimmedString(rowByExt, 'id');
      const codigo = getTrimmedString(rowByExt, 'codigo') || extKey;
      if (actualId !== expectedUuid) {
        const msg = `El UUID histórico de ISO 9001:2015 para la cláusula "${codigo}" (${extKey}) fue alterado y rompería FKs en 06_datos_prueba.sql.`;
        mismatches.push({ externalKey: extKey, actualCodigo: codigo, reason: msg });
        errors.push(msg);
      } else {
        if (typeof sqlContent === 'string' && !sqlContent.includes(expectedUuid)) {
          const msg = `El script SQL generado no contiene la cláusula histórica ISO 9001:2015 "${codigo}" (${extKey}).`;
          mismatches.push({ externalKey: extKey, actualCodigo: codigo, reason: msg });
          errors.push(msg);
        } else {
          preservedKeys.push(extKey);
        }
      }
      continue;
    }

    if (rowByExpectedId) {
      const actualExt = getTrimmedString(rowByExpectedId, 'external_key');
      const codigo = getTrimmedString(rowByExpectedId, 'codigo') || extKey;
      if (actualExt && actualExt !== extKey) {
        const msg = `La cláusula histórica ISO 9001:2015 "${codigo}" cambió su clave externa de "${extKey}" a "${actualExt}".`;
        mismatches.push({ externalKey: extKey, actualCodigo: codigo, reason: msg });
        errors.push(msg);
      } else if (typeof sqlContent === 'string' && !sqlContent.includes(expectedUuid)) {
        const msg = `El script SQL generado omitió la cláusula histórica ISO 9001:2015 "${codigo}".`;
        mismatches.push({ externalKey: extKey, actualCodigo: codigo, reason: msg });
        errors.push(msg);
      } else {
        preservedKeys.push(extKey);
      }
      continue;
    }

    missingKeys.push(extKey);
    if (iso9001Present) {
      warnings.push(
        `La cláusula histórica ISO 9001:2015 (${extKey}) no está presente en el subconjunto actual de BD; verifica que 06_datos_prueba.sql no dependa de ella en tu entorno.`
      );
    }
  }

  // Verificar colisión inversa: ningún UUID histórico usado por otro external_key
  for (const row of requisitos) {
    const id = getTrimmedString(row, 'id');
    const extKey = getTrimmedString(row, 'external_key');
    const expectedExt = HISTORICAL_EXTERNAL_KEY_BY_UUID.get(id);
    if (expectedExt && extKey && extKey !== expectedExt && !mismatches.some((m) => m.externalKey === expectedExt)) {
      const codigo = getTrimmedString(row, 'codigo') || expectedExt;
      const msg = `El identificador histórico reservado para "${expectedExt}" está asignado a "${codigo}" (${extKey}).`;
      mismatches.push({ externalKey: expectedExt, actualCodigo: codigo, reason: msg });
      errors.push(msg);
    }
  }

  return {
    valid: errors.length === 0,
    totalExpected: Object.keys(HISTORICAL_CLAUSE_UUID_BY_EXTERNAL_KEY).length,
    iso9001Present,
    preservedKeys,
    missingKeys,
    mismatches,
    errors,
    warnings,
  };
}

function buildNormaLabelMap(normas: readonly SqlRowRecord[]): Map<string, { codigo: string; titulo: string }> {
  const map = new Map<string, { codigo: string; titulo: string }>();
  for (const std of CSV_STANDARD_DEFINITIONS) {
    map.set(std.id, { codigo: std.codigo, titulo: std.titulo });
  }
  for (const row of normas) {
    const id = getTrimmedString(row, 'id');
    const codigo = getTrimmedString(row, 'codigo') || getTrimmedString(row, 'norma');
    const titulo = getTrimmedString(row, 'titulo') || codigo;
    if (id && codigo) {
      map.set(id, { codigo, titulo });
    }
  }
  return map;
}

/**
 * Evalúa coherencia transversal entre `07_normas_requisitos_csv.sql` y `06_datos_prueba.sql`.
 * Recuerda que en un reset `00 → 07`, `06_datos_prueba.sql` se ejecuta **antes** que `07_normas_requisitos_csv.sql`:
 * si existen normas nuevas (#9+) en BD referenciadas por tablas de `06` (`acreditacion_norma`,
 * `certificado`, `norma_auditor`), emite advertencias claras Zero-UUID y prepara un stub
 * idempotente mínimo para `06_datos_prueba.sql` si se requiere.
 */
export function analyzeNormasCrossFileCoherence(
  liveNormas: readonly SqlRowRecord[],
  liveRequisitos: readonly SqlRowRecord[],
  options?: Pick<Normas07SyncOptions, 'existing06SqlContent' | 'live06RowsByTable'>
): CrossFileNormaCoherenceResult {
  const existing06Ids = new Set<string>(BASE_06_KNOWN_NORMA_IDS);
  const existing06ReqIds = new Set<string>();

  if (options?.existing06SqlContent) {
    const parsed06 = parseExistingSqlSeedRecords(options.existing06SqlContent);
    for (const r of parsed06.rowsByTable['norma'] ?? []) {
      const id = getTrimmedString(r, 'id');
      if (id) existing06Ids.add(id);
    }
    for (const r of parsed06.rowsByTable['requisito'] ?? []) {
      const id = getTrimmedString(r, 'id');
      if (id) existing06ReqIds.add(id);
    }
  }

  const normaById = new Map<string, SqlRowRecord>();
  for (const n of liveNormas) {
    const id = getTrimmedString(n, 'id');
    if (id) normaById.set(id, n);
  }
  const normaLabels = buildNormaLabelMap(liveNormas);

  const reqById = new Map<string, SqlRowRecord>();
  for (const r of liveRequisitos) {
    const id = getTrimmedString(r, 'id');
    if (id) reqById.set(id, r);
  }

  const normaReferences: CrossFileNormaReference[] = [];
  const requisitoReferences: CrossFileRequisitoReference[] = [];
  const newReferencedNormaIds = new Set<string>();
  const newReferencedReqByTable = new Map<string, { tableName: string; normaCodigo: string; reqCodigo: string; count: number }>();

  const live06 = options?.live06RowsByTable ?? {};

  for (const tbl of BASE_06_REFERENCING_NORMA_TABLES) {
    const rows = live06[tbl] ?? [];
    const countsByNorma = new Map<string, number>();
    for (const row of rows) {
      if (isArchivedRow(row)) continue;
      const normaId = getTrimmedString(row, 'id_norma');
      if (!normaId || existing06Ids.has(normaId)) continue;
      countsByNorma.set(normaId, (countsByNorma.get(normaId) ?? 0) + 1);
      newReferencedNormaIds.add(normaId);
    }
    for (const [normaId, count] of countsByNorma.entries()) {
      const lbl = normaLabels.get(normaId);
      normaReferences.push({
        tableName: tbl,
        normaCodigo: sanitizeZeroUuidText(lbl?.codigo ?? 'Norma nueva', 'Norma nueva'),
        normaTitulo: sanitizeZeroUuidText(lbl?.titulo ?? 'Estándar nuevo', 'Estándar nuevo'),
        referenceCount: count,
      });
    }
  }

  if (options?.existing06SqlContent) {
    for (const tbl of BASE_06_REFERENCING_REQUISITO_TABLES) {
      const rows = live06[tbl] ?? [];
      for (const row of rows) {
        if (isArchivedRow(row)) continue;
        const reqId = getTrimmedString(row, 'id_requisito');
        if (!reqId || existing06ReqIds.has(reqId)) continue;
        const reqRow = reqById.get(reqId);
        if (!reqRow) continue;
        const normaId = getTrimmedString(reqRow, 'id_norma');
        const normaCod = sanitizeZeroUuidText(normaLabels.get(normaId)?.codigo ?? 'Norma', 'Norma');
        const reqCod = sanitizeZeroUuidText(getTrimmedString(reqRow, 'codigo') || 'Cláusula', 'Cláusula');
        const key = `${tbl}::${normaCod}::${reqCod}`;
        const prev = newReferencedReqByTable.get(key);
        if (prev) {
          prev.count += 1;
        } else {
          newReferencedReqByTable.set(key, {
            tableName: tbl,
            normaCodigo: normaCod,
            reqCodigo: reqCod,
            count: 1,
          });
        }
      }
    }
  }

  for (const item of newReferencedReqByTable.values()) {
    requisitoReferences.push({
      tableName: item.tableName,
      normaCodigo: item.normaCodigo,
      requisitoCodigo: item.reqCodigo,
      referenceCount: item.count,
    });
  }

  const referencedNewNormas = Array.from(newReferencedNormaIds)
    .map((id) => normaById.get(id))
    .filter((row): row is SqlRowRecord => Boolean(row))
    .map((row) => ({
      codigo: sanitizeZeroUuidText(getTrimmedString(row, 'codigo') || 'Norma nueva', 'Norma nueva'),
      titulo: sanitizeZeroUuidText(getTrimmedString(row, 'titulo') || 'Estándar nuevo', 'Estándar nuevo'),
    }));

  const warnings: string[] = [];
  if (normaReferences.length > 0) {
    const descList = normaReferences
      .slice(0, 6)
      .map((ref) => `${ref.tableName} → ${ref.normaCodigo} (${ref.referenceCount})`)
      .join(', ');
    warnings.push(
      `Coherencia 06 ↔ 07: En un reset completo (00 → 07), 06_datos_prueba.sql se ejecuta ANTES que 07_normas_requisitos_csv.sql. Se detectaron referencias hacia normas nuevas no pre-sembradas en 06 (${descList}). Incluye el respaldo FK mínimo de public.norma en 06_datos_prueba.sql o sincroniza dichas normas antes de ejecutar un reset limpio.`
    );
  }

  if (requisitoReferences.length > 0) {
    const reqList = requisitoReferences
      .slice(0, 6)
      .map((ref) => `${ref.tableName} → ${ref.normaCodigo} · ${ref.requisitoCodigo}`)
      .join(', ');
    warnings.push(
      `Coherencia 06 ↔ 07: Tablas operativas de 06_datos_prueba.sql referencian cláusulas aún no pre-sembradas en la Sección 9 de 06 (${reqList}). En un reset 00 → 07 asegúrate de contar con su fila mínima previa o ejecutar 07 antes de insertar esas relaciones.`
    );
  }

  const stubNormas = Array.from(newReferencedNormaIds)
    .map((id) => normaById.get(id))
    .filter((row): row is SqlRowRecord => Boolean(row));

  const optional06NormaStubSql =
    stubNormas.length > 0 ? build06BaseNormaFkStubSql(stubNormas) : null;

  return {
    hasCrossFileReferences: normaReferences.length > 0 || requisitoReferences.length > 0,
    referencedNewNormas,
    normaReferences,
    requisitoReferences,
    warnings,
    optional06NormaStubSql,
  };
}

/**
 * Genera un respaldo FK idempotente mínimo de `public.norma` para `06_datos_prueba.sql`
 * cuando certificados, acreditaciones o competencias de auditores en `06` referencian
 * una norma nueva (#9+) cuya definición completa vive en `07_normas_requisitos_csv.sql`.
 */
export function build06BaseNormaFkStubSql(newNormas: readonly SqlRowRecord[]): string {
  const ordered = sortNormasDeterministically(newNormas.map(normalizeLiveNormaRow));
  if (ordered.length === 0) return '';

  const normaMeta = getSyncTableMetadata('norma');
  const valuesSql = ordered
    .map((n) => {
      const fechaSql = n.fecha_publicacion
        ? `${formatSqlLiteral(n.fecha_publicacion, { columnName: 'fecha_publicacion', meta: normaMeta })}::date`
        : 'NULL';
      return `    (${formatSqlLiteral(n.id, { columnName: 'id', dataType: 'uuid', meta: normaMeta })}, ${formatSqlLiteral(n.esquema, { columnName: 'esquema', meta: normaMeta })}, ${formatSqlLiteral(n.codigo, { columnName: 'codigo', meta: normaMeta })}, ${formatSqlLiteral(n.titulo, { columnName: 'titulo', meta: normaMeta })}, ${formatSqlLiteral(n.estatus, { columnName: 'estatus', meta: normaMeta })}, ${fechaSql}, ${formatSqlLiteral(n.norma, { columnName: 'norma', meta: normaMeta })})`;
    })
    .join(',\n');

  return [
    '-- Respaldo FK mínimo de normas nuevas referenciadas en 06_datos_prueba.sql (definición completa en 07_normas_requisitos_csv.sql)',
    'INSERT INTO public.norma (id, esquema, codigo, titulo, estatus, fecha_publicacion, norma) VALUES',
    valuesSql,
    'ON CONFLICT (codigo) WHERE deleted_at IS NULL DO UPDATE SET',
    '    esquema = EXCLUDED.esquema,',
    '    titulo = EXCLUDED.titulo,',
    '    estatus = EXCLUDED.estatus,',
    '    fecha_publicacion = EXCLUDED.fecha_publicacion,',
    '    norma = EXCLUDED.norma,',
    '    updated_at = NOW()',
    'WHERE public.norma.esquema IS DISTINCT FROM EXCLUDED.esquema',
    '   OR public.norma.titulo IS DISTINCT FROM EXCLUDED.titulo',
    '   OR public.norma.estatus IS DISTINCT FROM EXCLUDED.estatus',
    '   OR public.norma.fecha_publicacion IS DISTINCT FROM EXCLUDED.fecha_publicacion',
    '   OR public.norma.norma IS DISTINCT FROM EXCLUDED.norma;',
  ].join('\n');
}

function resolveEffectiveLtreeForRow(
  row: SqlRowRecord,
  byId: ReadonlyMap<string, SqlRowRecord>
): string {
  const explicit = getTrimmedString(row, 'ruta_materializada');
  if (explicit) return explicit;

  const codigo = getTrimmedString(row, 'codigo');
  const parentId = getTrimmedString(row, 'id_requisito_padre');
  const parent = parentId ? byId.get(parentId) : undefined;
  const parentRuta = parent ? getTrimmedString(parent, 'ruta_materializada') : '';
  const parentCodigo = parent ? getTrimmedString(parent, 'codigo') : '';

  if (codigo && (!parentId || (parentRuta && parentCodigo))) {
    return computeRequisitoLtreePath(
      codigo,
      parentId ? { codigo: parentCodigo, ruta_materializada: parentRuta } : null
    );
  }
  return '';
}

function buildNormaBlockSql(
  normas: readonly SqlRowRecord[],
  meta = getSyncTableMetadata('norma')
): { sql: string; activeCount: number; archivedCount: number } {
  const ordered = sortNormasDeterministically(normas);
  const active = ordered.filter((n) => !isArchivedRow(n));
  const archived = ordered.filter((n) => isArchivedRow(n));
  const chunks: string[] = [];

  if (active.length > 0) {
    const values = active
      .map((std) => {
        const fechaSql = std.fecha_publicacion
          ? `${formatSqlLiteral(std.fecha_publicacion, { columnName: 'fecha_publicacion', meta })}::date`
          : 'NULL';
        return `    (${formatSqlLiteral(std.id, { columnName: 'id', dataType: 'uuid', meta })}, ${formatSqlLiteral(std.esquema, { columnName: 'esquema', meta })}, ${formatSqlLiteral(std.codigo, { columnName: 'codigo', meta })}, ${formatSqlLiteral(std.titulo, { columnName: 'titulo', meta })}, ${formatSqlLiteral(std.estatus, { columnName: 'estatus', meta })}, ${fechaSql}, ${formatSqlLiteral(std.norma, { columnName: 'norma', meta })})`;
      })
      .join(',\n');

    chunks.push(
      [
        `-- 1. Normas Certificables Canónicas (${active.length} ${active.length === 1 ? 'Norma' : 'Normas'})`,
        'INSERT INTO public.norma (id, esquema, codigo, titulo, estatus, fecha_publicacion, norma) VALUES',
        values,
        'ON CONFLICT (codigo) WHERE deleted_at IS NULL DO UPDATE SET',
        '    esquema = EXCLUDED.esquema,',
        '    titulo = EXCLUDED.titulo,',
        '    estatus = EXCLUDED.estatus,',
        '    fecha_publicacion = EXCLUDED.fecha_publicacion,',
        '    norma = EXCLUDED.norma,',
        '    updated_at = NOW()',
        'WHERE public.norma.esquema IS DISTINCT FROM EXCLUDED.esquema',
        '   OR public.norma.titulo IS DISTINCT FROM EXCLUDED.titulo',
        '   OR public.norma.estatus IS DISTINCT FROM EXCLUDED.estatus',
        '   OR public.norma.fecha_publicacion IS DISTINCT FROM EXCLUDED.fecha_publicacion',
        '   OR public.norma.norma IS DISTINCT FROM EXCLUDED.norma;',
      ].join('\n')
    );
  }

  if (archived.length > 0) {
    const values = archived
      .map((std) => {
        const fechaSql = std.fecha_publicacion
          ? `${formatSqlLiteral(std.fecha_publicacion, { columnName: 'fecha_publicacion', meta })}::date`
          : 'NULL';
        return `    (${formatSqlLiteral(std.id, { columnName: 'id', dataType: 'uuid', meta })}, ${formatSqlLiteral(std.esquema, { columnName: 'esquema', meta })}, ${formatSqlLiteral(std.codigo, { columnName: 'codigo', meta })}, ${formatSqlLiteral(std.titulo, { columnName: 'titulo', meta })}, ${formatSqlLiteral(std.estatus, { columnName: 'estatus', meta })}, ${fechaSql}, ${formatSqlLiteral(std.norma, { columnName: 'norma', meta })}, ${formatSqlLiteral(std.deleted_at, { columnName: 'deleted_at', dataType: 'timestamptz', meta })}, ${formatSqlLiteral(std.deleted_by, { columnName: 'deleted_by', dataType: 'uuid', meta })}, ${formatSqlLiteral(std.delete_reason, { columnName: 'delete_reason', meta })})`;
      })
      .join(',\n');

    chunks.push(
      [
        `-- 1b. Normas Archivadas Lógicamente (${archived.length}) — Cero DELETE físico`,
        'INSERT INTO public.norma (id, esquema, codigo, titulo, estatus, fecha_publicacion, norma, deleted_at, deleted_by, delete_reason) VALUES',
        values,
        'ON CONFLICT (id) DO UPDATE SET',
        '    esquema = EXCLUDED.esquema,',
        '    codigo = EXCLUDED.codigo,',
        '    titulo = EXCLUDED.titulo,',
        '    estatus = EXCLUDED.estatus,',
        '    fecha_publicacion = EXCLUDED.fecha_publicacion,',
        '    norma = EXCLUDED.norma,',
        '    deleted_at = EXCLUDED.deleted_at,',
        '    deleted_by = EXCLUDED.deleted_by,',
        '    delete_reason = EXCLUDED.delete_reason,',
        '    updated_at = NOW();',
      ].join('\n')
    );
  }

  return {
    sql: chunks.join('\n\n'),
    activeCount: active.length,
    archivedCount: archived.length,
  };
}

function buildRequisitoBlockSql(
  requisitos: readonly SqlRowRecord[],
  batchSize: number,
  meta = getSyncTableMetadata('requisito')
): { sql: string; activeCount: number; archivedCount: number } {
  const byId = new Map<string, SqlRowRecord>();
  for (const r of requisitos) {
    const id = getTrimmedString(r, 'id');
    if (id) byId.set(id, r);
  }

  const enriched = requisitos.map((r) => {
    const ruta = resolveEffectiveLtreeForRow(r, byId);
    return ruta && ruta !== r.ruta_materializada ? { ...r, ruta_materializada: ruta } : r;
  });

  const active = sortRequisitosTopologicallyFor07(enriched.filter((r) => !isArchivedRow(r)));
  const archived = sortRequisitosTopologicallyFor07(enriched.filter((r) => isArchivedRow(r)));
  const chunks: string[] = [];

  if (active.length > 0) {
    const batches = chunkArray(active, batchSize);
    batches.forEach((batch, batchIndex) => {
      const values = batch
        .map((clause) => {
          const parentSql = clause.id_requisito_padre
            ? formatSqlLiteral(clause.id_requisito_padre, { columnName: 'id_requisito_padre', dataType: 'uuid', meta })
            : 'NULL';
          const rutaRaw = getTrimmedString(clause, 'ruta_materializada');
          const rutaSql = rutaRaw
            ? formatSqlLiteral(rutaRaw, { columnName: 'ruta_materializada', dataType: 'ltree', meta })
            : 'NULL::ltree';
          const explicitSql = clause.explicit_code === true ? 'TRUE' : 'FALSE';
          const extKeySql = clause.external_key
            ? formatSqlLiteral(clause.external_key, { columnName: 'external_key', meta })
            : 'NULL';
          const obligatorioSql = clause.es_obligatorio === true ? 'TRUE' : 'FALSE';
          const origenSql = formatSqlLiteral(clause.obligatorio_origen || 'AUTO_TEXT', {
            columnName: 'obligatorio_origen',
            meta,
          });

          return `    (${formatSqlLiteral(clause.id, { columnName: 'id', dataType: 'uuid', meta })}, ${formatSqlLiteral(clause.id_norma, { columnName: 'id_norma', dataType: 'uuid', meta })}, ${parentSql}, ${formatSqlLiteral(clause.codigo, { columnName: 'codigo', meta })}, ${rutaSql}, ${explicitSql}, ${extKeySql}, ${obligatorioSql}, ${origenSql})`;
        })
        .join(',\n');

      chunks.push(
        [
          `-- 2.${batchIndex + 1} Cláusulas Jerárquicas (lote ${batchIndex + 1}/${batches.length}, ${batch.length} filas)`,
          'INSERT INTO public.requisito (id, id_norma, id_requisito_padre, codigo, ruta_materializada, explicit_code, external_key, es_obligatorio, obligatorio_origen) VALUES',
          values,
          'ON CONFLICT (id_norma, codigo) WHERE deleted_at IS NULL DO UPDATE SET',
          '    id_requisito_padre = EXCLUDED.id_requisito_padre,',
          '    ruta_materializada = EXCLUDED.ruta_materializada,',
          '    explicit_code = EXCLUDED.explicit_code,',
          '    external_key = EXCLUDED.external_key,',
          '    es_obligatorio = CASE',
          "        WHEN public.requisito.obligatorio_origen = 'MANUAL' AND EXCLUDED.obligatorio_origen <> 'MANUAL' THEN public.requisito.es_obligatorio",
          '        ELSE EXCLUDED.es_obligatorio',
          '    END,',
          '    obligatorio_origen = CASE',
          "        WHEN public.requisito.obligatorio_origen = 'MANUAL' AND EXCLUDED.obligatorio_origen <> 'MANUAL' THEN public.requisito.obligatorio_origen",
          '        ELSE EXCLUDED.obligatorio_origen',
          '    END,',
          '    updated_at = NOW()',
          'WHERE public.requisito.id_requisito_padre IS DISTINCT FROM EXCLUDED.id_requisito_padre',
          '   OR public.requisito.ruta_materializada IS DISTINCT FROM EXCLUDED.ruta_materializada',
          '   OR public.requisito.explicit_code IS DISTINCT FROM EXCLUDED.explicit_code',
          '   OR public.requisito.external_key IS DISTINCT FROM EXCLUDED.external_key',
          "   OR ((public.requisito.obligatorio_origen <> 'MANUAL' OR EXCLUDED.obligatorio_origen = 'MANUAL') AND (public.requisito.es_obligatorio IS DISTINCT FROM EXCLUDED.es_obligatorio OR public.requisito.obligatorio_origen IS DISTINCT FROM EXCLUDED.obligatorio_origen));",
        ].join('\n')
      );
    });
  }

  if (archived.length > 0) {
    const batches = chunkArray(archived, batchSize);
    batches.forEach((batch, batchIndex) => {
      const values = batch
        .map((clause) => {
          const parentSql = clause.id_requisito_padre
            ? formatSqlLiteral(clause.id_requisito_padre, { columnName: 'id_requisito_padre', dataType: 'uuid', meta })
            : 'NULL';
          const rutaRaw = getTrimmedString(clause, 'ruta_materializada');
          const rutaSql = rutaRaw
            ? formatSqlLiteral(rutaRaw, { columnName: 'ruta_materializada', dataType: 'ltree', meta })
            : 'NULL::ltree';
          const explicitSql = clause.explicit_code === true ? 'TRUE' : 'FALSE';
          const extKeySql = clause.external_key
            ? formatSqlLiteral(clause.external_key, { columnName: 'external_key', meta })
            : 'NULL';
          const obligatorioSql = clause.es_obligatorio === true ? 'TRUE' : 'FALSE';
          const origenSql = formatSqlLiteral(clause.obligatorio_origen || 'AUTO_TEXT', {
            columnName: 'obligatorio_origen',
            meta,
          });

          return `    (${formatSqlLiteral(clause.id, { columnName: 'id', dataType: 'uuid', meta })}, ${formatSqlLiteral(clause.id_norma, { columnName: 'id_norma', dataType: 'uuid', meta })}, ${parentSql}, ${formatSqlLiteral(clause.codigo, { columnName: 'codigo', meta })}, ${rutaSql}, ${explicitSql}, ${extKeySql}, ${obligatorioSql}, ${origenSql}, ${formatSqlLiteral(clause.deleted_at, { columnName: 'deleted_at', dataType: 'timestamptz', meta })}, ${formatSqlLiteral(clause.deleted_by, { columnName: 'deleted_by', dataType: 'uuid', meta })}, ${formatSqlLiteral(clause.delete_reason, { columnName: 'delete_reason', meta })})`;
        })
        .join(',\n');

      chunks.push(
        [
          `-- 2b.${batchIndex + 1} Cláusulas Archivadas Lógicamente (lote ${batchIndex + 1}/${batches.length}, ${batch.length} filas) — Cero DELETE físico`,
          'INSERT INTO public.requisito (id, id_norma, id_requisito_padre, codigo, ruta_materializada, explicit_code, external_key, es_obligatorio, obligatorio_origen, deleted_at, deleted_by, delete_reason) VALUES',
          values,
          'ON CONFLICT (id) DO UPDATE SET',
          '    id_norma = EXCLUDED.id_norma,',
          '    id_requisito_padre = EXCLUDED.id_requisito_padre,',
          '    codigo = EXCLUDED.codigo,',
          '    ruta_materializada = EXCLUDED.ruta_materializada,',
          '    explicit_code = EXCLUDED.explicit_code,',
          '    external_key = EXCLUDED.external_key,',
          '    es_obligatorio = EXCLUDED.es_obligatorio,',
          '    obligatorio_origen = EXCLUDED.obligatorio_origen,',
          '    deleted_at = EXCLUDED.deleted_at,',
          '    deleted_by = EXCLUDED.deleted_by,',
          '    delete_reason = EXCLUDED.delete_reason,',
          '    updated_at = NOW();',
        ].join('\n')
      );
    });
  }

  return {
    sql: chunks.join('\n\n'),
    activeCount: active.length,
    archivedCount: archived.length,
  };
}

function buildTraduccionesBlockSql(
  traducciones: readonly SqlRowRecord[],
  orderedRequisitos: readonly SqlRowRecord[],
  batchSize: number,
  meta = getSyncTableMetadata('requisito_traduccion')
): { sql: string; activeCount: number; archivedCount: number } {
  const reqOrder = new Map<string, number>();
  orderedRequisitos.forEach((req, idx) => {
    const id = getTrimmedString(req, 'id');
    if (id && !reqOrder.has(id)) reqOrder.set(id, idx);
  });

  const sorted = [...traducciones].sort((a, b) => {
    const reqIdA = getTrimmedString(a, 'id_requisito');
    const reqIdB = getTrimmedString(b, 'id_requisito');
    const ordA = reqOrder.get(reqIdA) ?? Number.MAX_SAFE_INTEGER;
    const ordB = reqOrder.get(reqIdB) ?? Number.MAX_SAFE_INTEGER;
    if (ordA !== ordB) return ordA - ordB;
    const reqCmp = reqIdA.localeCompare(reqIdB);
    if (reqCmp !== 0) return reqCmp;
    const langA = getTrimmedString(a, 'lang');
    const langB = getTrimmedString(b, 'lang');
    if (langA !== langB) return langA === 'es' ? -1 : 1;
    return getTrimmedString(a, 'id').localeCompare(getTrimmedString(b, 'id'));
  });

  const active = sorted.filter((t) => !isArchivedRow(t));
  const archived = sorted.filter((t) => isArchivedRow(t));
  const chunks: string[] = [];

  if (active.length > 0) {
    const batches = chunkArray(active, batchSize);
    batches.forEach((batch, batchIndex) => {
      const values = batch
        .map(
          (tr) =>
            `    (${formatSqlLiteral(tr.id, { columnName: 'id', dataType: 'uuid', meta })}, ${formatSqlLiteral(tr.id_requisito, { columnName: 'id_requisito', dataType: 'uuid', meta })}, ${formatSqlLiteral(tr.lang, { columnName: 'lang', meta })}, ${formatSqlLiteral(tr.title ?? '', { columnName: 'title', meta })}, ${formatSqlLiteral(normalizeHtmlNewlines(tr.content_html), { columnName: 'content_html', meta })})`
        )
        .join(',\n');

      chunks.push(
        [
          `-- 3.${batchIndex + 1} Traducciones de Cláusulas ES/EN (lote ${batchIndex + 1}/${batches.length}, ${batch.length} filas)`,
          'INSERT INTO public.requisito_traduccion (id, id_requisito, lang, title, content_html) VALUES',
          values,
          'ON CONFLICT (id_requisito, lang) WHERE deleted_at IS NULL DO UPDATE SET',
          '    title = EXCLUDED.title,',
          '    content_html = EXCLUDED.content_html,',
          '    updated_at = NOW()',
          'WHERE public.requisito_traduccion.title IS DISTINCT FROM EXCLUDED.title',
          '   OR public.requisito_traduccion.content_html IS DISTINCT FROM EXCLUDED.content_html;',
        ].join('\n')
      );
    });
  }

  if (archived.length > 0) {
    const batches = chunkArray(archived, batchSize);
    batches.forEach((batch, batchIndex) => {
      const values = batch
        .map(
          (tr) =>
            `    (${formatSqlLiteral(tr.id, { columnName: 'id', dataType: 'uuid', meta })}, ${formatSqlLiteral(tr.id_requisito, { columnName: 'id_requisito', dataType: 'uuid', meta })}, ${formatSqlLiteral(tr.lang, { columnName: 'lang', meta })}, ${formatSqlLiteral(tr.title ?? '', { columnName: 'title', meta })}, ${formatSqlLiteral(normalizeHtmlNewlines(tr.content_html), { columnName: 'content_html', meta })}, ${formatSqlLiteral(tr.deleted_at, { columnName: 'deleted_at', dataType: 'timestamptz', meta })}, ${formatSqlLiteral(tr.deleted_by, { columnName: 'deleted_by', dataType: 'uuid', meta })})`
        )
        .join(',\n');

      chunks.push(
        [
          `-- 3b.${batchIndex + 1} Traducciones Archivadas Lógicamente (lote ${batchIndex + 1}/${batches.length}, ${batch.length} filas) — Cero DELETE físico`,
          'INSERT INTO public.requisito_traduccion (id, id_requisito, lang, title, content_html, deleted_at, deleted_by) VALUES',
          values,
          'ON CONFLICT (id) DO UPDATE SET',
          '    id_requisito = EXCLUDED.id_requisito,',
          '    lang = EXCLUDED.lang,',
          '    title = EXCLUDED.title,',
          '    content_html = EXCLUDED.content_html,',
          '    deleted_at = EXCLUDED.deleted_at,',
          '    deleted_by = EXCLUDED.deleted_by,',
          '    updated_at = NOW();',
        ].join('\n')
      );
    });
  }

  return {
    sql: chunks.join('\n\n'),
    activeCount: active.length,
    archivedCount: archived.length,
  };
}

/**
 * Construye el script SQL completo, determinista e idempotente para
 * `public/supabase/queries/07_normas_requisitos_csv.sql` a partir del estado vivo de BD.
 */
export function buildNormas07SqlDocument(
  liveData: Normas07LiveDatasetInput,
  options?: BuildNormas07DocumentOptions
): string {
  const { normas, requisitos, traducciones } = extractLiveTables(liveData);
  const reqBatchSize = Math.max(1, options?.requisitoBatchSize ?? 250);
  const trBatchSize = Math.max(1, options?.traduccionBatchSize ?? 150);

  const orderedRequisitosAll = sortRequisitosTopologicallyFor07(requisitos);
  const normaBlock = buildNormaBlockSql(normas);
  const reqBlock = buildRequisitoBlockSql(orderedRequisitosAll, reqBatchSize);
  const trBlock = buildTraduccionesBlockSql(traducciones, orderedRequisitosAll, trBatchSize);

  const generatedBy =
    options?.generatedByLabel ??
    'Sincronizado automáticamente desde BD viva · Extra → Norma';

  const archivedSummaryParts: string[] = [];
  if (normaBlock.archivedCount > 0) archivedSummaryParts.push(`${normaBlock.archivedCount} normas arch.`);
  if (reqBlock.archivedCount > 0) archivedSummaryParts.push(`${reqBlock.archivedCount} cláusulas arch.`);
  if (trBlock.archivedCount > 0) archivedSummaryParts.push(`${trBlock.archivedCount} trad. arch.`);
  const archivedSuffix =
    archivedSummaryParts.length > 0 ? ` | Archivados: ${archivedSummaryParts.join(', ')}` : '';

  const sections = [
    '-- ============================================================================',
    `-- FILE 7: 07_NORMAS_REQUISITOS_CSV.SQL (${generatedBy})`,
    `-- Normas: ${normaBlock.activeCount} | Cláusulas LTREE: ${reqBlock.activeCount} | Traducciones ES/EN: ${trBlock.activeCount}${archivedSuffix}`,
    '-- Ejecución idempotente en orden topológico (padres antes que hijos).',
    '-- ============================================================================',
  ];

  if (normaBlock.sql) sections.push('', normaBlock.sql);
  if (reqBlock.sql) sections.push('', reqBlock.sql);
  if (trBlock.sql) sections.push('', trBlock.sql);
  sections.push('');

  return sections.join('\n');
}

/**
 * Valida todas las invariantes críticas de `07_normas_requisitos_csv.sql`:
 * - `$$` balanceados, comillas/paréntesis balanceados y cero `DELETE FROM`.
 * - Toda cláusula posee `ruta_materializada` válida (`LTREE_PATH_PATTERN`) y cast `::ltree`.
 * - Orden topológico estricto (`id_requisito_padre` precede siempre a sus hijos).
 * - Presencia de los targets `ON CONFLICT` parciales (`WHERE deleted_at IS NULL`) y
 *   preservación de los 7 UUIDs históricos ISO 9001:2015.
 */
export function validateNormas07Sql(
  sqlContent: string,
  liveData?: Normas07LiveDatasetInput
): Normas07ValidationResult {
  const baseValidation = validateUpdatedSeedSql(sqlContent);
  const errors = [...baseValidation.errors];
  const warnings = [...baseValidation.warnings];

  const parsed = parseNormas07SqlRecords(sqlContent);
  const normaLabels = buildNormaLabelMap(parsed.norma);

  let validLtreePaths = true;
  let validTopologicalOrder = true;
  let ltreeCastCount = 0;

  const activeRequisitos = parsed.recordsByTable.requisito.filter((r) => !isArchivedRow(r.row));
  const archivedRequisitos = parsed.recordsByTable.requisito.filter((r) => isArchivedRow(r.row));

  const checkTopologicalAndLtreeGroup = (recs: readonly ParsedSeedRecord[], groupName: string): void => {
    const seenIds = new Set<string>();
    for (const rec of recs) {
      const id = getTrimmedString(rec.row, 'id');
      const codigo = sanitizeZeroUuidText(getTrimmedString(rec.row, 'codigo') || 'Cláusula', 'Cláusula');
      const normaCod = sanitizeZeroUuidText(
        normaLabels.get(getTrimmedString(rec.row, 'id_norma'))?.codigo ?? 'Norma',
        'Norma'
      );
      const ruta = getTrimmedString(rec.row, 'ruta_materializada');

      if (!ruta || !LTREE_PATH_PATTERN.test(ruta)) {
        validLtreePaths = false;
        errors.push(`Ruta LTREE inválida en ${normaCod} · cláusula "${codigo}": "${ruta}".`);
      }

      const rutaCell = rec.cellsByColumn['ruta_materializada'];
      if (rutaCell) {
        if (rutaCell.castSuffix.toLowerCase() === '::ltree') {
          ltreeCastCount += 1;
        } else {
          validLtreePaths = false;
          errors.push(`Falta cast explícito ::ltree en ${normaCod} · cláusula "${codigo}".`);
        }
      }

      const parentId = getTrimmedString(rec.row, 'id_requisito_padre');
      if (parentId && !seenIds.has(parentId)) {
        const parentExistsInGroup = recs.some((other) => getTrimmedString(other.row, 'id') === parentId);
        if (parentExistsInGroup) {
          validTopologicalOrder = false;
          errors.push(
            `Orden topológico inválido en ${groupName}: la cláusula ${normaCod} · "${codigo}" aparece antes que su padre.`
          );
        }
      }

      if (id) seenIds.add(id);
    }
  };

  checkTopologicalAndLtreeGroup(activeRequisitos, 'cláusulas activas');
  checkTopologicalAndLtreeGroup(archivedRequisitos, 'cláusulas archivadas');

  // Validar también sobre filas vivas si se entregaron explícitamente (por ej. ruta_materializada corrupta)
  if (liveData) {
    const { normas: liveNormas, requisitos: liveRequisitos } = extractLiveTables(liveData);
    const liveNormaLabels = buildNormaLabelMap(liveNormas);
    for (const req of liveRequisitos) {
      const ruta = getTrimmedString(req, 'ruta_materializada');
      if (ruta && !LTREE_PATH_PATTERN.test(ruta)) {
        validLtreePaths = false;
        const codigo = sanitizeZeroUuidText(getTrimmedString(req, 'codigo') || 'Cláusula', 'Cláusula');
        const normaCod = sanitizeZeroUuidText(
          liveNormaLabels.get(getTrimmedString(req, 'id_norma'))?.codigo ?? 'Norma',
          'Norma'
        );
        const msg = `La ruta LTREE viva de ${normaCod} · cláusula "${codigo}" no cumple LTREE_PATH_PATTERN ("${ruta}").`;
        if (!errors.includes(msg)) errors.push(msg);
      }
    }
  }

  const checkRequisitosForHistorical = liveData
    ? extractLiveTables(liveData).requisitos
    : parsed.requisito;
  const historicalCheck = verifyHistoricalIso9001Uuids(checkRequisitosForHistorical, sqlContent);
  for (const err of historicalCheck.errors) {
    if (!errors.includes(err)) errors.push(err);
  }
  for (const warn of historicalCheck.warnings) {
    if (!warnings.includes(warn)) warnings.push(warn);
  }

  const hasNormaRows = parsed.norma.some((n) => !isArchivedRow(n));
  const hasReqRows = parsed.requisito.some((r) => !isArchivedRow(r));
  const hasTrRows = parsed.requisito_traduccion.some((t) => !isArchivedRow(t));

  let hasRequiredConflictTargets = true;
  if (hasNormaRows && !/ON\s+CONFLICT\s*\(\s*codigo\s*\)\s+WHERE\s+deleted_at\s+IS\s+NULL\s+DO\s+UPDATE/i.test(sqlContent)) {
    hasRequiredConflictTargets = false;
    errors.push('Falta cláusula ON CONFLICT (codigo) WHERE deleted_at IS NULL DO UPDATE en public.norma.');
  }
  if (
    hasReqRows &&
    !/ON\s+CONFLICT\s*\(\s*id_norma\s*,\s*codigo\s*\)\s+WHERE\s+deleted_at\s+IS\s+NULL\s+DO\s+UPDATE/i.test(sqlContent)
  ) {
    hasRequiredConflictTargets = false;
    errors.push('Falta cláusula ON CONFLICT (id_norma, codigo) WHERE deleted_at IS NULL DO UPDATE en public.requisito.');
  }
  if (
    hasTrRows &&
    !/ON\s+CONFLICT\s*\(\s*id_requisito\s*,\s*lang\s*\)\s+WHERE\s+deleted_at\s+IS\s+NULL\s+DO\s+UPDATE/i.test(sqlContent)
  ) {
    hasRequiredConflictTargets = false;
    errors.push(
      'Falta cláusula ON CONFLICT (id_requisito, lang) WHERE deleted_at IS NULL DO UPDATE en public.requisito_traduccion.'
    );
  }

  // Asegurar cero `DELETE FROM` explícitamente (incluyendo cualquier variante)
  const zeroProtectedDeletes =
    baseValidation.zeroProtectedDeletes && !/\bDELETE\s+FROM\b/i.test(sqlContent);
  if (!zeroProtectedDeletes && baseValidation.zeroProtectedDeletes) {
    errors.push('Se detectó una sentencia DELETE FROM prohibida en 07_normas_requisitos_csv.sql.');
  }

  const balancedDollars = hasBalancedDollarDelimiters(sqlContent);
  const valid =
    errors.length === 0 &&
    baseValidation.balancedQuotesAndParens &&
    balancedDollars &&
    zeroProtectedDeletes &&
    validLtreePaths &&
    validTopologicalOrder &&
    historicalCheck.valid &&
    hasRequiredConflictTargets;

  return {
    ...baseValidation,
    valid,
    errors,
    warnings,
    balancedDollarDelimiters: balancedDollars,
    zeroProtectedDeletes,
    validLtreePaths,
    validTopologicalOrder,
    historicalUuidsPreserved: historicalCheck.valid,
    ltreeCastCount,
    hasRequiredConflictTargets,
  };
}

function buildNormasZeroUuidLabelResolver(
  normas: readonly SqlRowRecord[],
  requisitos: readonly SqlRowRecord[],
  customResolver?: (row: SqlRowRecord, tableName: string) => string | null
): (row: SqlRowRecord, tableName: string) => string | null {
  const normaLabels = buildNormaLabelMap(normas);
  const reqMap = new Map<string, { codigo: string; idNorma: string }>();
  for (const r of requisitos) {
    const id = getTrimmedString(r, 'id');
    if (id) {
      reqMap.set(id, {
        codigo: getTrimmedString(r, 'codigo') || 'Cláusula',
        idNorma: getTrimmedString(r, 'id_norma'),
      });
    }
  }

  return (row: SqlRowRecord, tableName: string): string | null => {
    if (customResolver) {
      const custom = customResolver(row, tableName);
      if (custom && custom.trim() && !containsRawUuid(custom)) {
        return custom.trim();
      }
    }

    if (tableName === 'norma') {
      const codigo = getTrimmedString(row, 'codigo') || getTrimmedString(row, 'norma');
      const titulo = getTrimmedString(row, 'titulo');
      return sanitizeZeroUuidText(
        [codigo, titulo].filter(Boolean).join(' · '),
        'Norma certificable'
      );
    }

    if (tableName === 'requisito') {
      const normaId = getTrimmedString(row, 'id_norma');
      const normaCodigo = normaLabels.get(normaId)?.codigo ?? 'Norma';
      const codigo = getTrimmedString(row, 'codigo') || getTrimmedString(row, 'external_key') || 'Cláusula';
      return sanitizeZeroUuidText(`${normaCodigo} · ${codigo}`, 'Cláusula normativa');
    }

    if (tableName === 'requisito_traduccion') {
      const reqId = getTrimmedString(row, 'id_requisito');
      const reqInfo = reqMap.get(reqId);
      const normaCodigo = reqInfo ? normaLabels.get(reqInfo.idNorma)?.codigo : undefined;
      const lang = getTrimmedString(row, 'lang') || 'es';
      const title = getTrimmedString(row, 'title');
      const prefix = [normaCodigo, reqInfo?.codigo].filter(Boolean).join(' · ');
      const label = [prefix ? `${prefix} [${lang}]` : `[${lang}]`, title].filter(Boolean).join(' · ');
      return sanitizeZeroUuidText(label, `Traducción [${lang}]`);
    }

    return null;
  };
}

/**
 * Compara los registros actuales de `07_normas_requisitos_csv.sql` contra el estado vivo
 * de PostgreSQL para `norma`, `requisito` y `requisito_traduccion`.
 */
export function computeNormas07SyncDiff(
  current07SqlContent: string,
  liveData: Normas07LiveDatasetInput,
  options?: Pick<Normas07SyncOptions, 'labelResolver'>
): Normas07DiffResult {
  const existing = parseNormas07SqlRecords(current07SqlContent);
  const { normas, requisitos, traducciones } = extractLiveTables(liveData);

  const labelResolver = buildNormasZeroUuidLabelResolver(
    [...existing.norma, ...normas],
    [...existing.requisito, ...requisitos],
    options?.labelResolver
  );

  const normaDiff = computeTableSyncDiff('norma', normas, existing.norma, {
    compareColumns: NORMA_COMPARE_COLUMNS,
    labelResolver,
  });

  const requisitoDiff = computeTableSyncDiff('requisito', requisitos, existing.requisito, {
    compareColumns: REQUISITO_COMPARE_COLUMNS,
    labelResolver,
  });

  const traduccionDiff = computeTableSyncDiff(
    'requisito_traduccion',
    traducciones,
    existing.requisito_traduccion,
    {
      compareColumns: TRADUCCION_COMPARE_COLUMNS,
      labelResolver,
    }
  );

  const summaryByTable: Record<Normas07TableName, SyncDiffSummary> = {
    norma: normaDiff.summary,
    requisito: requisitoDiff.summary,
    requisito_traduccion: traduccionDiff.summary,
  };
  const orderedSummaries: SyncDiffSummary[] = [
    normaDiff.summary,
    requisitoDiff.summary,
    traduccionDiff.summary,
  ];

  return {
    norma: normaDiff,
    requisito: requisitoDiff,
    requisito_traduccion: traduccionDiff,
    summaryByTable,
    orderedSummaries,
    hasChanges: orderedSummaries.some((s) => s.hasChanges),
  };
}

function buildNormasDiffSnippets(diff: Normas07DiffResult): string[] {
  const snippets: string[] = [];
  const tables: Array<{ table: Normas07TableName; res: TableDiffResult<SqlRowRecord> }> = [
    { table: 'norma', res: diff.norma },
    { table: 'requisito', res: diff.requisito },
    { table: 'requisito_traduccion', res: diff.requisito_traduccion },
  ];

  for (const { res } of tables) {
    for (const item of res.items) {
      if (item.status === 'unchanged') continue;
      if (snippets.length >= 40) break;

      const label = sanitizeZeroUuidText(item.displayLabel, res.labelEs);
      if (item.status === 'new') {
        snippets.push(`-- [+ ${res.labelEs}] ${label}`);
      } else if (item.status === 'archived') {
        snippets.push(`-- [Archivado lógico · ${res.labelEs}] ${label}`);
      } else if (item.status === 'updated') {
        const cols = item.changedColumns.filter((c) => !c.includes('id_') && c !== 'id');
        const colNote = cols.length > 0 ? ` (${cols.join(', ')})` : '';
        snippets.push(`-- [~ ${res.labelEs}] ${label}${colNote}`);
      }
    }
  }

  return snippets;
}

function runNormas07Sync(
  current07SqlContent: string,
  liveData: Normas07LiveDatasetInput,
  options?: Normas07SyncOptions
): Normas07SyncResult {
  const { normas, requisitos, traducciones } = extractLiveTables(liveData);
  const diff = computeNormas07SyncDiff(current07SqlContent, liveData, options);
  const historicalUuidCheck = verifyHistoricalIso9001Uuids(requisitos);
  const crossFileCoherence = analyzeNormasCrossFileCoherence(normas, requisitos, options);

  const hasChanges = diff.hasChanges;
  const candidateSql = hasChanges
    ? buildNormas07SqlDocument(liveData, {
        requisitoBatchSize: options?.requisitoBatchSize,
        traduccionBatchSize: options?.traduccionBatchSize,
        generatedByLabel: options?.generatedByLabel,
      })
    : current07SqlContent;

  const validation = validateNormas07Sql(candidateSql, liveData);
  const nextSqlContent = hasChanges ? candidateSql : current07SqlContent;
  const changed = nextSqlContent !== current07SqlContent;

  const warnings: string[] = [];
  for (const w of validation.warnings) {
    if (!containsRawUuid(w) && !warnings.includes(w)) warnings.push(w);
  }
  for (const w of crossFileCoherence.warnings) {
    if (!containsRawUuid(w) && !warnings.includes(w)) warnings.push(w);
  }
  warnings.push(NORMAS_07_BUILD_SEED_NOTE_ES);

  const normasActive = normas.filter((n) => !isArchivedRow(n)).length;
  const normasArchived = normas.length - normasActive;
  const requisitosActive = requisitos.filter((r) => !isArchivedRow(r)).length;
  const requisitosArchived = requisitos.length - requisitosActive;
  const traduccionesActive = traducciones.filter((t) => !isArchivedRow(t)).length;
  const traduccionesArchived = traducciones.length - traduccionesActive;

  const tablesWithChanges = diff.orderedSummaries.filter((s) => s.hasChanges).length;
  const toInsert = diff.orderedSummaries.reduce((acc, s) => acc + s.toInsert, 0);
  const toUpdate = diff.orderedSummaries.reduce((acc, s) => acc + s.toUpdate, 0);
  const toArchive = diff.orderedSummaries.reduce((acc, s) => acc + s.toArchiveOrDelete, 0);

  return {
    targetFile: NORMAS_07_TARGET_FILE,
    nextSqlContent,
    changed,
    summaryByTable: diff.summaryByTable,
    orderedSummaries: diff.orderedSummaries,
    diffSnippets: buildNormasDiffSnippets(diff),
    warnings: Array.from(new Set(warnings)),
    validation,
    historicalUuidCheck,
    crossFileCoherence,
    buildNormasSeedNoteEs: NORMAS_07_BUILD_SEED_NOTE_ES,
    counts: {
      normasActive,
      normasArchived,
      requisitosActive,
      requisitosArchived,
      traduccionesActive,
      traduccionesArchived,
      tablesWithChanges,
      toInsert,
      toUpdate,
      toArchive,
    },
  };
}

/**
 * Vista previa no destructiva para `Extra → Norma` sobre `07_normas_requisitos_csv.sql`.
 */
export function previewNormas07Sync(
  current07SqlContent: string,
  liveData: Normas07LiveDatasetInput,
  options?: Normas07SyncOptions
): Normas07SyncResult {
  return runNormas07Sync(current07SqlContent, liveData, options);
}

/**
 * Genera y valida el contenido final de `07_normas_requisitos_csv.sql` reconciliado desde
 * PostgreSQL (listo para escritura atómica en disco en el Paso 2.2).
 */
export function applyNormas07Sync(
  current07SqlContent: string,
  liveData: Normas07LiveDatasetInput,
  options?: Normas07SyncOptions
): Normas07SyncResult {
  return runNormas07Sync(current07SqlContent, liveData, options);
}
