/**
 * Paso 1.3: Reconciliador e Indexador Incremental Seguro para `public/supabase/queries/06_datos_prueba.sql`
 *
 * Responsabilidades:
 * 1. `parseExistingSqlSeedRecords`: Analiza `INSERT INTO` (multilínea, `''`, `E'...'`, `||`, casts
 *    `::uuid`/`::ltree`/`::jsonb`/`::DATE`, expresiones dinámicas `NOW()`/`CURRENT_DATE`), bloques `DO $$`
 *    (`DECLARE` + `FOR ... IN SELECT * FROM (VALUES ...)`) y `UPDATE` de nivel superior (como Sección 22b
 *    o bloques administrados `-- [ADMIN_SYNC_BEGIN:...]`), construyendo índices por `id` y por `naturalKeys`.
 * 2. `applyDatabaseSyncTo06Sql`: Estrategia dual:
 *    - Fase A: Actualización quirúrgica in-place de celdas literales en tuplas `base_insert` cuando cambia
 *      una columna presente en el `INSERT` original (evitando colisiones `23505` en índices únicos parciales
 *      mutados al re-ejecutar `00 → 07`).
 *    - Fase B: Emisión idempotente ordenada topológicamente (Padre → Hijo) dentro de bloques administrados
 *      `-- [ADMIN_SYNC_BEGIN:<key>] ... -- [ADMIN_SYNC_END:<key>]` al final del archivo (`extra` → `certificacion`
 *      → `auditorias`) para registros nuevos, archivados lógicos (`deleted_at IS NOT NULL`), actualizaciones
 *      en columnas no presentes en el `INSERT` base / bloques `DO $$`, y bajas en tablas M:N puras.
 * 3. `validateUpdatedSeedSql`: Verifica balanceo par de `$$`, conservación íntegra de secciones base `1.`..`29.`,
 *    preservación de bloques `DO $$` históricos, ausencia total de `DELETE FROM` en las 57 tablas protegidas y
 *    `equipo_auditor`, balanceo de comillas/paréntesis y validez de marcadores administrados.
 * 4. `previewDatabaseSyncTo06Sql`: Ejecuta la reconciliación sin efectos secundarios y retorna vista previa
 *    completa con resúmenes Zero-UUID, `diffSnippets`, advertencias y validación.
 */

import {
  SQL_SEED_SYNC_BLOCKS,
  SQL_SYNC_TABLE_METADATA,
  SQL_SYNC_TABLES_TOPO_ORDER,
  type SqlSeedBlockId,
  type SqlSyncTableMetadata,
  getSyncTableMetadata,
  sortTablesTopologically,
} from './sqlSeedSyncCatalog';
import {
  type SqlRowRecord,
  type SyncDiffSummary,
  type TableDiffResult,
  buildTableSyncStatements,
  computeTableSyncDiff,
  formatSqlLiteral,
  hasBalancedDollarDelimiters,
  tableSupportsUpdatedAt,
} from './sqlSeedGenerator';
import { containsRawUuid } from './zeroUuid';

export interface ParsedSeedCell {
  column: string;
  rawSql: string;
  value: unknown;
  isDynamicExpression: boolean;
  valueStartOffset: number;
  valueEndOffset: number;
  castSuffix: string;
}

export type ParsedRecordSource = 'base_insert' | 'do_block' | 'managed_sync';

export interface ParsedSeedRecord {
  tableName: string;
  row: SqlRowRecord;
  columns: string[];
  insertColumns: string[];
  dynamicColumns: string[];
  overlayUpdatedColumns: string[];
  overlayDynamicColumns: string[];
  overlaySource?: 'base_update' | 'managed_sync';
  source: ParsedRecordSource;
  managedBlockKey?: string;
  cellsByColumn: Record<string, ParsedSeedCell>;
  tupleStartOffset: number;
  tupleEndOffset: number;
}

export interface ManagedSyncBlockLocation {
  key: string;
  beginOffset: number;
  endOffset: number;
  innerStartOffset: number;
  innerEndOffset: number;
  innerSql: string;
}

export interface BaseSectionHeaderInfo {
  sectionNumber: string;
  headerLine: string;
  offset: number;
}

export interface ParsedSqlSeedIndex {
  recordsByTable: Record<string, ParsedSeedRecord[]>;
  rowsByTable: Record<string, SqlRowRecord[]>;
  byIdByTable: Record<string, Record<string, ParsedSeedRecord>>;
  byNaturalKeyByTable: Record<string, Record<string, ParsedSeedRecord>>;
  managedBlocks: ManagedSyncBlockLocation[];
  baseSectionHeaders: BaseSectionHeaderInfo[];
  historicalDoBlocks: string[];
  warnings: string[];
}

export interface SqlSeedValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  dollarDelimiterCount: number;
  balancedDollarDelimiters: boolean;
  preservedBaseSections: boolean;
  preservedHistoricalDoBlocks: boolean;
  zeroProtectedDeletes: boolean;
  balancedQuotesAndParens: boolean;
  validManagedMarkers: boolean;
}

export interface ScopedParentFilter {
  column: string;
  allowedValues: ReadonlySet<string>;
}

export interface ApplyDatabaseSyncOptions {
  /** Clave explícita del bloque `-- [ADMIN_SYNC_BEGIN:<key>]`. Si se omite, agrupa en `extra` / `certificacion` / `auditorias`. */
  managedBlockKey?: string;
  /** Subconjunto de tablas a reconciliar (en orden topológico). Si se omite, reconcilia todas las presentes en `liveRowsByTable`. */
  tablesToSync?: readonly string[];
  /** Ignora divergencia en columnas cuya semilla usa `NOW()` / `CURRENT_DATE` salvo si el valor vivo es NULL (default: true). */
  ignoreDynamicExpressionDrift?: boolean;
  /** Filtros de padre acotado para detectar bajas en tablas M:N puras (`requisitos_por_proceso`, etc.). */
  scopedParentFiltersByTable?: Record<string, ScopedParentFilter>;
  /** Resolver opcional Zero-UUID para etiquetas humanas en `sampleLabels`. */
  labelResolver?: (row: SqlRowRecord, tableName: string) => string | null;
  /** Batch size máximo para sentencias INSERT generadas en Fase B (default: 100). */
  batchSize?: number;
}

export interface SqlSeedUpdaterResult {
  nextSqlContent: string;
  changed: boolean;
  summaryByTable: Record<string, SyncDiffSummary>;
  orderedSummaries: SyncDiffSummary[];
  diffSnippets: string[];
  warnings: string[];
  validation: SqlSeedValidationResult;
  counts: {
    phaseACellUpdates: number;
    phaseBUpdatesById: number;
    phaseBInserts: number;
    phaseBArchivedUpserts: number;
    phaseBDeletedMnLinks: number;
    tablesWithChanges: number;
  };
}

interface SqlToken {
  type: 'word' | 'number' | 'string' | 'dollar_string' | 'symbol';
  raw: string;
  upper: string;
  start: number;
  end: number;
}

interface RawStatementSlice {
  sql: string;
  start: number;
  end: number;
  tokens: SqlToken[];
}

interface VarBinding {
  value: unknown;
  isDynamic: boolean;
}

const CANONICAL_BLOCK_ORDER: readonly SqlSeedBlockId[] = ['extra', 'certificacion', 'auditorias'];

const BLOCK_BY_TABLE = new Map<string, SqlSeedBlockId>();
for (const block of SQL_SEED_SYNC_BLOCKS) {
  for (const section of block.sections) {
    for (const tbl of section.tables) {
      if (!BLOCK_BY_TABLE.has(tbl)) {
        BLOCK_BY_TABLE.set(tbl, block.id);
      }
    }
  }
}
// Refuerzo explícito para tablas derivadas o de soporte
BLOCK_BY_TABLE.set('configuracion_alerta_auditoria', 'auditorias');
BLOCK_BY_TABLE.set('equipo_auditor', 'auditorias');

const DYNAMIC_IDENTIFIERS = new Set<string>([
  'NOW',
  'CURRENT_DATE',
  'CURRENT_TIMESTAMP',
  'CLOCK_TIMESTAMP',
  'LOCALTIMESTAMP',
  'STATEMENT_TIMESTAMP',
  'TRANSACTION_TIMESTAMP',
  'TIMEZONE',
  'INTERVAL',
  'UUID_GENERATE_V4',
  'GEN_RANDOM_UUID',
]);

const TABLES_AUTO_RESOLVING_CERT_VERSION = new Set<string>([
  'fecha_certificado',
  'contacto_certificado',
  'sitio',
  'proceso',
  'procesos_por_sitio',
  'requisitos_por_proceso',
  'requisitos_no_aplicables_certificado',
  'contacto_certificado_compartido',
  'turno_certificado_compartido',
  'proceso_certificado_compartido',
  'sitio_certificado_compartido',
]);

/**
 * Valores por defecto no-nulos definidos en `01_creacion.sql` cuando un `INSERT` omite la columna.
 * Permite evitar falsos positivos en `computeTableSyncDiff` manteniendo detección real cuando cambian.
 */
const SCHEMA_NON_NULL_DEFAULTS_BY_TABLE: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
  norma: { vigente: true },
  auditor: { activo: true, evaluacion_in_situ: false },
  experto_tecnico: { estatus: 'Disponible' },
  grupo_empresarial: { es_individual_auto: false },
  organizacion_version: { es_version_actual: false },
  certificado_version: { es_version_actual: false, multisitio: false },
  certificado: { multisitio: false },
  proceso_certificado_compartido: { sincronizar_requisitos: false },
  vinculo: { nivel_vinculacion: 'INDIVIDUAL', tipo_vinculacion: 'Individual', es_vinculada: false, tiene_sitio_temporal: false },
  programa_auditoria: { nivel_vinculacion: 'INDIVIDUAL', tipo_vinculacion: 'Individual', es_vinculada: false, tiene_sitio_temporal: false },
  auditoria: {
    tiempo_auditoria: 0,
    estado_ciclo: 'Borrador',
    revisado: false,
    documentacion_completa: false,
    tiene_sitio_temporal: false,
  },
  auditoria_fecha: { tag: 'Programación' },
  auditoria_sitio_temporal: { etiqueta: 'Sitio Temporal', tiempo_auditoria: 0 },
  sitios_por_auditoria: { tiempo_auditoria: 0 },
  equipo_auditor_sitio: { rol_auditor: 'AUDITOR', tiempo_auditoria: 0, asignacion_completa_sitio: false },
  equipo_auditor_sitio_temporal: { rol_auditor: 'AUDITOR', tiempo_auditoria: 0 },
  equipo_auditor_proceso_sitio: { rol_en_proceso: 'EVALUADOR' },
  hallazgo: { cerrado: false },
  configuracion_alerta_auditoria: {
    clave: 'DEFAULT',
    dias_aviso_proxima: 15,
    dias_aviso_preprogramada_sin_confirmar: 30,
    alertar_atrasadas: true,
    alertar_conflicto_auditor: true,
    alertar_desfase_dias_o_span: true,
    ciclos_rotacion_auditor_lider: 3,
    dias_limite_plan_accion: 15,
    dias_limite_plan_nc: 15,
    dias_limite_cierre_nc: 45,
    alertas_activas: true,
  },
};

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isWordStartChar(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
}

function isWordContinueChar(ch: string): boolean {
  return isWordStartChar(ch) || (ch >= '0' && ch <= '9');
}

function isDigitChar(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function matchDollarTag(sql: string, pos: number): string | null {
  if (sql[pos] !== '$') return null;
  let j = pos + 1;
  if (j < sql.length && sql[j] === '$') {
    return '$$';
  }
  if (j < sql.length && isWordStartChar(sql[j])) {
    j += 1;
    while (j < sql.length && isWordContinueChar(sql[j])) {
      j += 1;
    }
    if (j < sql.length && sql[j] === '$') {
      return sql.slice(pos, j + 1);
    }
  }
  return null;
}

interface LexScanResult {
  tokens: SqlToken[];
  unclosedSingleQuote: boolean;
  unclosedBlockComment: boolean;
  unclosedDollarQuote: boolean;
  parenDepth: number;
  negativeParenDepth: boolean;
}

function lexPostgreSql(sql: string, baseOffset = 0): LexScanResult {
  const tokens: SqlToken[] = [];
  let i = 0;
  const len = sql.length;
  let parenDepth = 0;
  let negativeParenDepth = false;
  let unclosedSingleQuote = false;
  let unclosedBlockComment = false;
  let unclosedDollarQuote = false;

  while (i < len) {
    const ch = sql[i];

    // Espacios en blanco
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1;
      continue;
    }

    // Comentario de una línea -- ...
    if (ch === '-' && sql[i + 1] === '-') {
      i += 2;
      while (i < len && sql[i] !== '\n') {
        i += 1;
      }
      continue;
    }

    // Comentario de bloque /* ... */ (anidable en PostgreSQL)
    if (ch === '/' && sql[i + 1] === '*') {
      let depth = 1;
      i += 2;
      while (i < len && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') {
          depth += 1;
          i += 2;
        } else if (sql[i] === '*' && sql[i + 1] === '/') {
          depth -= 1;
          i += 2;
        } else {
          i += 1;
        }
      }
      if (depth > 0) {
        unclosedBlockComment = true;
      }
      continue;
    }

    // Dollar-quoted literal $$...$$ o $tag$...$tag$
    if (ch === '$') {
      const tag = matchDollarTag(sql, i);
      if (tag) {
        const start = i;
        i += tag.length;
        const closeIdx = sql.indexOf(tag, i);
        if (closeIdx === -1) {
          unclosedDollarQuote = true;
          tokens.push({
            type: 'dollar_string',
            raw: sql.slice(start),
            upper: '',
            start: baseOffset + start,
            end: baseOffset + len,
          });
          i = len;
        } else {
          const end = closeIdx + tag.length;
          tokens.push({
            type: 'dollar_string',
            raw: sql.slice(start, end),
            upper: '',
            start: baseOffset + start,
            end: baseOffset + end,
          });
          i = end;
        }
        continue;
      }
    }

    // PostgreSQL E'...' o cadena estándar '...'
    if ((ch === 'E' || ch === 'e') && sql[i + 1] === "'") {
      const start = i;
      i += 2;
      let closed = false;
      while (i < len) {
        if (sql[i] === '\\') {
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            i += 2;
            continue;
          }
          i += 1;
          closed = true;
          break;
        }
        i += 1;
      }
      if (!closed) unclosedSingleQuote = true;
      tokens.push({
        type: 'string',
        raw: sql.slice(start, i),
        upper: '',
        start: baseOffset + start,
        end: baseOffset + i,
      });
      continue;
    }

    if (ch === "'") {
      const start = i;
      i += 1;
      let closed = false;
      while (i < len) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            i += 2;
            continue;
          }
          i += 1;
          closed = true;
          break;
        }
        i += 1;
      }
      if (!closed) unclosedSingleQuote = true;
      tokens.push({
        type: 'string',
        raw: sql.slice(start, i),
        upper: '',
        start: baseOffset + start,
        end: baseOffset + i,
      });
      continue;
    }

    // Identificador entre comillas dobles "..."
    if (ch === '"') {
      const start = i;
      i += 1;
      while (i < len) {
        if (sql[i] === '"') {
          if (sql[i + 1] === '"') {
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      const raw = sql.slice(start, i);
      tokens.push({
        type: 'word',
        raw,
        upper: raw.slice(1, -1).replace(/""/g, '"').toUpperCase(),
        start: baseOffset + start,
        end: baseOffset + i,
      });
      continue;
    }

    // Números (incluyendo ceros iniciales como 01..09 o decimales 2.50)
    if (isDigitChar(ch)) {
      const start = i;
      while (i < len && isDigitChar(sql[i])) i += 1;
      if (sql[i] === '.' && isDigitChar(sql[i + 1] ?? '')) {
        i += 1;
        while (i < len && isDigitChar(sql[i])) i += 1;
      }
      const raw = sql.slice(start, i);
      tokens.push({
        type: 'number',
        raw,
        upper: raw,
        start: baseOffset + start,
        end: baseOffset + i,
      });
      continue;
    }

    // Palabras / identificadores
    if (isWordStartChar(ch)) {
      const start = i;
      i += 1;
      while (i < len && isWordContinueChar(sql[i])) {
        i += 1;
      }
      const raw = sql.slice(start, i);
      tokens.push({
        type: 'word',
        raw,
        upper: raw.toUpperCase(),
        start: baseOffset + start,
        end: baseOffset + i,
      });
      continue;
    }

    // Símbolos compuestos ::, ||, :=
    const two = sql.slice(i, i + 2);
    if (two === '::' || two === '||' || two === ':=' || two === '<>' || two === '!=' || two === '<=' || two === '>=') {
      tokens.push({
        type: 'symbol',
        raw: two,
        upper: two,
        start: baseOffset + i,
        end: baseOffset + i + 2,
      });
      i += 2;
      continue;
    }

    if (ch === '(') parenDepth += 1;
    if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth < 0) negativeParenDepth = true;
    }

    tokens.push({
      type: 'symbol',
      raw: ch,
      upper: ch,
      start: baseOffset + i,
      end: baseOffset + i + 1,
    });
    i += 1;
  }

  return {
    tokens,
    unclosedSingleQuote,
    unclosedBlockComment,
    unclosedDollarQuote,
    parenDepth,
    negativeParenDepth,
  };
}

function splitTokensIntoStatements(tokens: readonly SqlToken[], sql: string, baseOffset = 0): RawStatementSlice[] {
  const statements: RawStatementSlice[] = [];
  let current: SqlToken[] = [];

  for (const tok of tokens) {
    if (tok.type === 'symbol' && tok.raw === ';') {
      if (current.length > 0) {
        const start = current[0].start;
        const end = tok.end;
        statements.push({
          sql: sql.slice(start - baseOffset, end - baseOffset),
          start,
          end,
          tokens: current,
        });
        current = [];
      }
    } else {
      current.push(tok);
    }
  }

  if (current.length > 0) {
    const start = current[0].start;
    const end = current[current.length - 1].end;
    statements.push({
      sql: sql.slice(start - baseOffset, end - baseOffset),
      start,
      end,
      tokens: current,
    });
  }

  return statements;
}

function decodeSqlSingleQuotedLiteral(rawToken: string): string {
  if ((rawToken[0] === 'E' || rawToken[0] === 'e') && rawToken[1] === "'") {
    const inner = rawToken.slice(2, -1);
    let out = '';
    for (let i = 0; i < inner.length; i += 1) {
      const ch = inner[i];
      if (ch === "'" && inner[i + 1] === "'") {
        out += "'";
        i += 1;
        continue;
      }
      if (ch === '\\' && i + 1 < inner.length) {
        const next = inner[i + 1];
        if (next === 'n') {
          out += '\n';
          i += 1;
        } else if (next === 'r') {
          out += '\r';
          i += 1;
        } else if (next === 't') {
          out += '\t';
          i += 1;
        } else if (next === '\\') {
          out += '\\';
          i += 1;
        } else if (next === "'") {
          out += "'";
          i += 1;
        } else if (next === 'x' && /^[0-9a-fA-F]{2}/.test(inner.slice(i + 2, i + 4))) {
          out += String.fromCharCode(parseInt(inner.slice(i + 2, i + 4), 16));
          i += 3;
        } else {
          out += next;
          i += 1;
        }
        continue;
      }
      out += ch;
    }
    return out;
  }

  const inner = rawToken.slice(1, -1);
  return inner.replace(/''/g, "'");
}

function decodeDollarQuotedLiteral(rawToken: string): string {
  const firstEnd = rawToken.indexOf('$', 1);
  if (firstEnd === -1) return rawToken;
  const tagLen = firstEnd + 1;
  if (rawToken.length < tagLen * 2) return rawToken;
  return rawToken.slice(tagLen, rawToken.length - tagLen);
}

function normalizeIdentifierName(tok: SqlToken): string {
  if (tok.raw.startsWith('"') && tok.raw.endsWith('"')) {
    return tok.raw.slice(1, -1).replace(/""/g, '"').toLowerCase();
  }
  return tok.raw.toLowerCase();
}

function readTableIdentifier(tokens: readonly SqlToken[], startIdx: number): { tableName: string; nextIdx: number } | null {
  if (startIdx >= tokens.length) return null;
  const first = tokens[startIdx];
  if (first.type !== 'word') return null;

  if (
    tokens[startIdx + 1]?.type === 'symbol' &&
    tokens[startIdx + 1].raw === '.' &&
    tokens[startIdx + 2]?.type === 'word'
  ) {
    return {
      tableName: normalizeIdentifierName(tokens[startIdx + 2]),
      nextIdx: startIdx + 3,
    };
  }

  return {
    tableName: normalizeIdentifierName(first),
    nextIdx: startIdx + 1,
  };
}

function findMatchingParenTokenIdx(tokens: readonly SqlToken[], openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < tokens.length; i += 1) {
    if (tokens[i].type === 'symbol' && tokens[i].raw === '(') depth += 1;
    if (tokens[i].type === 'symbol' && tokens[i].raw === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function splitTokensByTopLevelComma(tokens: readonly SqlToken[]): SqlToken[][] {
  const parts: SqlToken[][] = [];
  let current: SqlToken[] = [];
  let depth = 0;

  for (const tok of tokens) {
    if (tok.type === 'symbol' && tok.raw === '(') depth += 1;
    else if (tok.type === 'symbol' && tok.raw === ')') depth -= 1;

    if (depth === 0 && tok.type === 'symbol' && tok.raw === ',') {
      parts.push(current);
      current = [];
    } else {
      current.push(tok);
    }
  }
  if (current.length > 0) {
    parts.push(current);
  }
  return parts;
}

function stripOuterCastSuffix(tokens: readonly SqlToken[]): { core: SqlToken[]; castSuffix: string; castType: string | null } {
  // Detecta trailing `::type` al nivel 0 (por ejemplo `::UUID`, `::ltree`, `::jsonb`, `::DATE`)
  if (tokens.length >= 3) {
    const secondLast = tokens[tokens.length - 2];
    const last = tokens[tokens.length - 1];
    if (secondLast.type === 'symbol' && secondLast.raw === '::' && last.type === 'word') {
      return {
        core: tokens.slice(0, -2),
        castSuffix: `::${last.raw}`,
        castType: last.upper,
      };
    }
  }
  return { core: [...tokens], castSuffix: '', castType: null };
}

function evaluateSqlExpressionTokens(
  exprTokens: readonly SqlToken[],
  fullSql: string,
  baseOffset: number,
  varBindings?: ReadonlyMap<string, VarBinding>
): { value: unknown; isDynamic: boolean; castSuffix: string } {
  if (exprTokens.length === 0) {
    return { value: null, isDynamic: false, castSuffix: '' };
  }

  // Verificar si contiene expresiones dinámicas de tiempo/UUID
  for (const tok of exprTokens) {
    if (tok.type === 'word' && DYNAMIC_IDENTIFIERS.has(tok.upper)) {
      return {
        value: '__DYNAMIC_SQL__',
        isDynamic: true,
        castSuffix: '',
      };
    }
  }

  const { core, castSuffix, castType } = stripOuterCastSuffix(exprTokens);
  if (core.length === 0) {
    return { value: null, isDynamic: false, castSuffix };
  }

  // Desenvolver paréntesis redundantes alrededor de una expresión literal simple
  let inner = core;
  while (
    inner.length >= 2 &&
    inner[0].type === 'symbol' &&
    inner[0].raw === '(' &&
    findMatchingParenTokenIdx(inner, 0) === inner.length - 1
  ) {
    inner = inner.slice(1, -1);
  }

  // Referencia de variable `v_foo` o `v_ov.campo` en bloques `DO $$`
  if (varBindings) {
    if (inner.length === 1 && inner[0].type === 'word') {
      const bound = varBindings.get(inner[0].raw.toLowerCase());
      if (bound) {
        return { value: bound.value, isDynamic: bound.isDynamic, castSuffix };
      }
    }
    if (
      inner.length === 3 &&
      inner[0].type === 'word' &&
      inner[1].type === 'symbol' &&
      inner[1].raw === '.' &&
      inner[2].type === 'word'
    ) {
      const compound = `${inner[0].raw.toLowerCase()}.${inner[2].raw.toLowerCase()}`;
      const bound = varBindings.get(compound);
      if (bound) {
        return { value: bound.value, isDynamic: bound.isDynamic, castSuffix };
      }
    }
  }

  // NULL
  if (inner.length === 1 && inner[0].type === 'word' && inner[0].upper === 'NULL') {
    return { value: null, isDynamic: false, castSuffix };
  }

  // BOOLEAN
  if (inner.length === 1 && inner[0].type === 'word' && (inner[0].upper === 'TRUE' || inner[0].upper === 'FALSE')) {
    return { value: inner[0].upper === 'TRUE', isDynamic: false, castSuffix };
  }

  // Número positivo o negativo
  if (inner.length === 1 && inner[0].type === 'number') {
    return { value: Number(inner[0].raw), isDynamic: false, castSuffix };
  }
  if (
    inner.length === 2 &&
    inner[0].type === 'symbol' &&
    inner[0].raw === '-' &&
    inner[1].type === 'number'
  ) {
    return { value: -Number(inner[1].raw), isDynamic: false, castSuffix };
  }

  // Cadena simple o concatenación con `||` (ej. de `neutralizeDollarQuotesInQuotedSql`)
  const canDecodeConcat = inner.every(
    (tok, idx) =>
      (idx % 2 === 0 && (tok.type === 'string' || tok.type === 'dollar_string')) ||
      (idx % 2 === 1 && tok.type === 'symbol' && tok.raw === '||')
  );
  if (canDecodeConcat && inner.length % 2 === 1) {
    let combined = '';
    for (let idx = 0; idx < inner.length; idx += 2) {
      const tok = inner[idx];
      if (tok.type === 'dollar_string') {
        combined += decodeDollarQuotedLiteral(tok.raw);
      } else {
        combined += decodeSqlSingleQuotedLiteral(tok.raw);
      }
    }
    if (castType === 'JSONB' || castType === 'JSON') {
      try {
        return { value: JSON.parse(combined), isDynamic: false, castSuffix };
      } catch {
        return { value: combined, isDynamic: false, castSuffix };
      }
    }
    return { value: combined, isDynamic: false, castSuffix };
  }

  // Fallback conservador: guardar SQL crudo recortado sin perder información
  const rawStart = inner[0].start - baseOffset;
  const rawEnd = inner[inner.length - 1].end - baseOffset;
  return {
    value: fullSql.slice(rawStart, rawEnd).trim(),
    isDynamic: false,
    castSuffix,
  };
}

/**
 * Localiza todos los bloques administrados `-- [ADMIN_SYNC_BEGIN:<key>] ... -- [ADMIN_SYNC_END:<key>]`.
 */
export function findManagedSyncBlocks(sqlContent: string): ManagedSyncBlockLocation[] {
  const blocks: ManagedSyncBlockLocation[] = [];
  const beginRegex = /^-- \[ADMIN_SYNC_BEGIN:([a-zA-Z0-9_.-]+)\][^\r\n]*$/gm;
  const endRegex = /^-- \[ADMIN_SYNC_END:([a-zA-Z0-9_.-]+)\][^\r\n]*$/gm;

  const begins: Array<{ key: string; start: number; lineEnd: number }> = [];
  const ends: Array<{ key: string; start: number; lineEnd: number }> = [];

  let m: RegExpExecArray | null;
  while ((m = beginRegex.exec(sqlContent)) !== null) {
    begins.push({ key: m[1], start: m.index, lineEnd: m.index + m[0].length });
  }
  while ((m = endRegex.exec(sqlContent)) !== null) {
    ends.push({ key: m[1], start: m.index, lineEnd: m.index + m[0].length });
  }

  let endCursor = 0;
  for (const b of begins) {
    while (endCursor < ends.length && ends[endCursor].start < b.lineEnd) {
      endCursor += 1;
    }
    if (endCursor < ends.length && ends[endCursor].key === b.key) {
      const e = ends[endCursor];
      const innerStart =
        sqlContent[b.lineEnd] === '\r' && sqlContent[b.lineEnd + 1] === '\n'
          ? b.lineEnd + 2
          : sqlContent[b.lineEnd] === '\n'
          ? b.lineEnd + 1
          : b.lineEnd;
      const innerEnd = e.start;
      blocks.push({
        key: b.key,
        beginOffset: b.start,
        endOffset: e.lineEnd,
        innerStartOffset: innerStart,
        innerEndOffset: innerEnd,
        innerSql: sqlContent.slice(innerStart, innerEnd),
      });
      endCursor += 1;
    }
  }

  return blocks;
}

function findManagedKeyAtOffset(
  blocks: readonly ManagedSyncBlockLocation[],
  offset: number
): string | undefined {
  for (const b of blocks) {
    if (offset >= b.beginOffset && offset <= b.endOffset) {
      return b.key;
    }
  }
  return undefined;
}

function stripManagedBlocks(sqlContent: string): string {
  const blocks = findManagedSyncBlocks(sqlContent);
  if (blocks.length === 0) return sqlContent;
  let out = '';
  let cursor = 0;
  for (const b of blocks) {
    out += sqlContent.slice(cursor, b.beginOffset);
    cursor = b.endOffset;
  }
  out += sqlContent.slice(cursor);
  return out;
}

function normalizeComparableForKey(value: unknown, columnName: string, meta: SqlSyncTableMetadata | null): string | null {
  if (value === null || value === undefined) return null;
  if (meta?.booleanColumns?.includes(columnName) || typeof value === 'boolean') {
    if (value === true || value === 'true' || value === 't' || value === 1) return 'bool:true';
    if (value === false || value === 'false' || value === 'f' || value === 0) return 'bool:false';
  }
  if (meta?.numberColumns?.includes(columnName) || typeof value === 'number') {
    const n = typeof value === 'number' ? value : Number(String(value).trim());
    if (Number.isFinite(n)) return `num:${n}`;
  }
  if (meta?.dateColumns?.includes(columnName) && typeof value === 'string') {
    const trimmed = value.trim();
    if (DATE_ONLY_REGEX.test(trimmed)) return `date:${trimmed}`;
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return `date:${parsed.toISOString().slice(0, 10)}`;
  }
  const text = String(value).trim();
  return text ? `str:${text.toLowerCase()}` : null;
}

function buildCompositeKeyFromRow(
  row: SqlRowRecord,
  columns: readonly string[],
  meta: SqlSyncTableMetadata | null
): string | null {
  const parts: string[] = [];
  for (const col of columns) {
    const norm = normalizeComparableForKey(row[col], col, meta);
    if (!norm) return null;
    parts.push(norm);
  }
  return parts.join('|');
}

function applyDefaultsToParsedRow(tableName: string, row: SqlRowRecord): void {
  const defaults = SCHEMA_NON_NULL_DEFAULTS_BY_TABLE[tableName];
  if (!defaults) return;
  for (const [col, defVal] of Object.entries(defaults)) {
    if (row[col] === undefined) {
      row[col] = defVal;
    }
  }
}

function parseInsertStatement(
  stmt: RawStatementSlice,
  fullSql: string,
  baseOffset: number,
  source: ParsedRecordSource,
  managedBlockKey: string | undefined,
  varBindings?: ReadonlyMap<string, VarBinding>
): ParsedSeedRecord[] {
  const tokens = stmt.tokens;
  if (
    tokens.length < 7 ||
    tokens[0].type !== 'word' ||
    tokens[0].upper !== 'INSERT' ||
    tokens[1].type !== 'word' ||
    tokens[1].upper !== 'INTO'
  ) {
    return [];
  }

  const tblInfo = readTableIdentifier(tokens, 2);
  if (!tblInfo) return [];
  const { tableName, nextIdx } = tblInfo;

  let cursor = nextIdx;
  if (tokens[cursor]?.type !== 'symbol' || tokens[cursor].raw !== '(') {
    return [];
  }
  const colsEndIdx = findMatchingParenTokenIdx(tokens, cursor);
  if (colsEndIdx === -1) return [];

  const columnGroups = splitTokensByTopLevelComma(tokens.slice(cursor + 1, colsEndIdx));
  const insertColumns = columnGroups
    .map((grp) => (grp.length > 0 ? normalizeIdentifierName(grp[0]) : ''))
    .filter(Boolean);

  cursor = colsEndIdx + 1;
  if (tokens[cursor]?.type !== 'word' || tokens[cursor].upper !== 'VALUES') {
    return [];
  }
  cursor += 1;

  const records: ParsedSeedRecord[] = [];
  while (cursor < tokens.length) {
    const tok = tokens[cursor];
    if (tok.type === 'word' && (tok.upper === 'ON' || tok.upper === 'RETURNING')) {
      break;
    }
    if (tok.type !== 'symbol' || tok.raw !== '(') {
      break;
    }

    const tupleCloseIdx = findMatchingParenTokenIdx(tokens, cursor);
    if (tupleCloseIdx === -1) break;

    const tupleStartOffset = tok.start;
    const tupleEndOffset = tokens[tupleCloseIdx].end;
    const cellTokenLists = splitTokensByTopLevelComma(tokens.slice(cursor + 1, tupleCloseIdx));

    if (cellTokenLists.length === insertColumns.length) {
      const row: SqlRowRecord = {};
      const dynamicColumns: string[] = [];
      const cellsByColumn: Record<string, ParsedSeedCell> = {};

      for (let cIdx = 0; cIdx < insertColumns.length; cIdx += 1) {
        const col = insertColumns[cIdx];
        const cellTokens = cellTokenLists[cIdx];
        const evaluated = evaluateSqlExpressionTokens(cellTokens, fullSql, baseOffset, varBindings);
        const valStart = cellTokens.length > 0 ? cellTokens[0].start : tupleStartOffset;
        const valEnd = cellTokens.length > 0 ? cellTokens[cellTokens.length - 1].end : tupleEndOffset;
        const rawCellSql = fullSql.slice(valStart - baseOffset, valEnd - baseOffset).trim();

        row[col] = evaluated.value;
        if (evaluated.isDynamic) {
          dynamicColumns.push(col);
        }

        if (source === 'base_insert') {
          cellsByColumn[col] = {
            column: col,
            rawSql: rawCellSql,
            value: evaluated.value,
            isDynamicExpression: evaluated.isDynamic,
            valueStartOffset: valStart,
            valueEndOffset: valEnd,
            castSuffix: evaluated.castSuffix,
          };
        }
      }

      applyDefaultsToParsedRow(tableName, row);

      records.push({
        tableName,
        row,
        columns: Object.keys(row),
        insertColumns: [...insertColumns],
        dynamicColumns,
        overlayUpdatedColumns: [],
        overlayDynamicColumns: [],
        source,
        managedBlockKey,
        cellsByColumn,
        tupleStartOffset,
        tupleEndOffset,
      });
    }

    cursor = tupleCloseIdx + 1;
    if (tokens[cursor]?.type === 'symbol' && tokens[cursor].raw === ',') {
      cursor += 1;
    } else {
      break;
    }
  }

  return records;
}

interface ParsedUpdateAssignment {
  column: string;
  value: unknown;
  isDynamic: boolean;
}

interface ParsedUpdateById {
  tableName: string;
  id: string;
  assignments: ParsedUpdateAssignment[];
}

function parseUpdateByIdStatement(
  stmt: RawStatementSlice,
  fullSql: string,
  baseOffset: number
): ParsedUpdateById | null {
  const tokens = stmt.tokens;
  if (tokens.length < 8 || tokens[0].type !== 'word' || tokens[0].upper !== 'UPDATE') {
    return null;
  }

  const tblInfo = readTableIdentifier(tokens, 1);
  if (!tblInfo) return null;
  const { tableName, nextIdx } = tblInfo;

  let cursor = nextIdx;
  // Alias opcional antes de SET (no usado en Sección 22b, pero seguro soportarlo)
  if (tokens[cursor]?.type === 'word' && tokens[cursor].upper !== 'SET') {
    cursor += 1;
  }
  if (tokens[cursor]?.type !== 'word' || tokens[cursor].upper !== 'SET') {
    return null;
  }
  cursor += 1;

  // Buscar WHERE al nivel 0
  let whereIdx = -1;
  let depth = 0;
  for (let i = cursor; i < tokens.length; i += 1) {
    if (tokens[i].type === 'symbol' && tokens[i].raw === '(') depth += 1;
    else if (tokens[i].type === 'symbol' && tokens[i].raw === ')') depth -= 1;
    else if (depth === 0 && tokens[i].type === 'word' && tokens[i].upper === 'WHERE') {
      whereIdx = i;
      break;
    }
  }
  if (whereIdx === -1) return null;

  const setGroups = splitTokensByTopLevelComma(tokens.slice(cursor, whereIdx));
  const assignments: ParsedUpdateAssignment[] = [];

  for (const grp of setGroups) {
    const eqIdx = grp.findIndex((t) => t.type === 'symbol' && t.raw === '=');
    if (eqIdx <= 0) continue;
    const col = normalizeIdentifierName(grp[0]);
    const exprTokens = grp.slice(eqIdx + 1);
    const evaluated = evaluateSqlExpressionTokens(exprTokens, fullSql, baseOffset);
    assignments.push({
      column: col,
      value: evaluated.value,
      isDynamic: evaluated.isDynamic,
    });
  }

  // Extraer `WHERE id = '<uuid>'`
  const whereTokens = tokens.slice(whereIdx + 1);
  let targetId: string | null = null;
  for (let i = 0; i + 2 < whereTokens.length; i += 1) {
    const isBareId = whereTokens[i].type === 'word' && normalizeIdentifierName(whereTokens[i]) === 'id';
    const isAliasedId =
      i >= 2 &&
      whereTokens[i - 2].type === 'word' &&
      whereTokens[i - 1].type === 'symbol' &&
      whereTokens[i - 1].raw === '.' &&
      isBareId;
    if ((isBareId || isAliasedId) && whereTokens[i + 1].type === 'symbol' && whereTokens[i + 1].raw === '=') {
      // Tomar hasta AND u otro operador lógico
      let endExpr = i + 2;
      while (
        endExpr < whereTokens.length &&
        !(whereTokens[endExpr].type === 'word' && (whereTokens[endExpr].upper === 'AND' || whereTokens[endExpr].upper === 'OR'))
      ) {
        endExpr += 1;
      }
      const idEval = evaluateSqlExpressionTokens(whereTokens.slice(i + 2, endExpr), fullSql, baseOffset);
      if (typeof idEval.value === 'string' && idEval.value.trim()) {
        targetId = idEval.value.trim();
        break;
      }
    }
  }

  if (!targetId) return null;
  return { tableName, id: targetId, assignments };
}

interface ParsedDeleteMnPredicate {
  tableName: string;
  predicates: Record<string, unknown>;
}

function parseDeleteMnStatement(
  stmt: RawStatementSlice,
  fullSql: string,
  baseOffset: number
): ParsedDeleteMnPredicate | null {
  const tokens = stmt.tokens;
  if (
    tokens.length < 7 ||
    tokens[0].type !== 'word' ||
    tokens[0].upper !== 'DELETE' ||
    tokens[1].type !== 'word' ||
    tokens[1].upper !== 'FROM'
  ) {
    return null;
  }

  const tblInfo = readTableIdentifier(tokens, 2);
  if (!tblInfo) return null;
  const { tableName, nextIdx } = tblInfo;
  if (tokens[nextIdx]?.type !== 'word' || tokens[nextIdx].upper !== 'WHERE') {
    return null;
  }

  const whereTokens = tokens.slice(nextIdx + 1);
  const predicates: Record<string, unknown> = {};
  let cursor = 0;
  while (cursor < whereTokens.length) {
    if (whereTokens[cursor].type === 'word' && whereTokens[cursor].upper === 'AND') {
      cursor += 1;
      continue;
    }
    if (
      cursor + 2 < whereTokens.length &&
      whereTokens[cursor].type === 'word' &&
      whereTokens[cursor + 1].type === 'symbol' &&
      whereTokens[cursor + 1].raw === '='
    ) {
      const col = normalizeIdentifierName(whereTokens[cursor]);
      let endExpr = cursor + 2;
      while (
        endExpr < whereTokens.length &&
        !(whereTokens[endExpr].type === 'word' && whereTokens[endExpr].upper === 'AND')
      ) {
        endExpr += 1;
      }
      const valEval = evaluateSqlExpressionTokens(whereTokens.slice(cursor + 2, endExpr), fullSql, baseOffset);
      predicates[col] = valEval.value;
      cursor = endExpr;
    } else {
      break;
    }
  }

  if (Object.keys(predicates).length === 0) return null;
  return { tableName, predicates };
}

function parseDeclareScalarBindings(bodyTokens: readonly SqlToken[], bodySql: string, bodyOffset: number): Map<string, VarBinding> {
  const bindings = new Map<string, VarBinding>();
  const beginIdx = bodyTokens.findIndex((t) => t.type === 'word' && t.upper === 'BEGIN');
  if (beginIdx <= 0) return bindings;

  const declareSlice = bodyTokens.slice(0, beginIdx);
  const declStmts = splitTokensIntoStatements(declareSlice, bodySql, bodyOffset);
  for (const decl of declStmts) {
    const tks = decl.tokens;
    const startIdx = tks[0]?.type === 'word' && tks[0].upper === 'DECLARE' ? 1 : 0;
    const assignIdx = tks.findIndex((t, idx) => idx > startIdx && t.type === 'symbol' && t.raw === ':=');
    if (assignIdx <= startIdx) continue;
    const varName = tks[startIdx].raw.toLowerCase();
    const exprTokens = tks.slice(assignIdx + 1);
    const evaluated = evaluateSqlExpressionTokens(exprTokens, bodySql, bodyOffset, bindings);
    bindings.set(varName, { value: evaluated.value, isDynamic: evaluated.isDynamic });
  }
  return bindings;
}

function parseDoBlockStatements(
  stmt: RawStatementSlice,
  fullSql: string
): ParsedSeedRecord[] {
  const tokens = stmt.tokens;
  if (tokens.length < 2 || tokens[0].type !== 'word' || tokens[0].upper !== 'DO') {
    return [];
  }
  const dollarTok = tokens.find((t) => t.type === 'dollar_string');
  if (!dollarTok) return [];

  const bodySql = decodeDollarQuotedLiteral(dollarTok.raw);
  const dollarTagEnd = dollarTok.raw.indexOf('$', 1) + 1;
  const bodyOffset = dollarTok.start + dollarTagEnd;
  const bodyLex = lexPostgreSql(bodySql, bodyOffset);
  const bodyTokens = bodyLex.tokens;

  const scalarBindings = parseDeclareScalarBindings(bodyTokens, bodySql, bodyOffset);
  const results: ParsedSeedRecord[] = [];

  // Detectar si existe `FOR <loopVar> IN SELECT * FROM (VALUES ...) AS <alias>(<cols>)`
  const forIdx = bodyTokens.findIndex((t) => t.type === 'word' && t.upper === 'FOR');
  let loopRowBindings: Array<Map<string, VarBinding>> = [];

  if (forIdx !== -1 && bodyTokens[forIdx + 1]?.type === 'word') {
    const loopVar = bodyTokens[forIdx + 1].raw.toLowerCase();
    const valuesKwIdx = bodyTokens.findIndex((t, idx) => idx > forIdx && t.type === 'word' && t.upper === 'VALUES');
    if (valuesKwIdx !== -1) {
      let cursor = valuesKwIdx + 1;
      const valueTuples: SqlToken[][] = [];
      while (cursor < bodyTokens.length && bodyTokens[cursor].type === 'symbol' && bodyTokens[cursor].raw === '(') {
        const closeIdx = findMatchingParenTokenIdx(bodyTokens, cursor);
        if (closeIdx === -1) break;
        valueTuples.push(bodyTokens.slice(cursor + 1, closeIdx));
        cursor = closeIdx + 1;
        if (bodyTokens[cursor]?.type === 'symbol' && bodyTokens[cursor].raw === ',') {
          cursor += 1;
        } else {
          break;
        }
      }

      // Buscar `AS t(col1, col2, ...)` tras el cierre de `(VALUES ...)`
      let aliasCols: string[] = [];
      let aliasName = '';
      for (let scan = cursor; scan < Math.min(bodyTokens.length, cursor + 8); scan += 1) {
        if (
          bodyTokens[scan].type === 'word' &&
          bodyTokens[scan].upper === 'AS' &&
          bodyTokens[scan + 1]?.type === 'word' &&
          bodyTokens[scan + 2]?.type === 'symbol' &&
          bodyTokens[scan + 2].raw === '('
        ) {
          aliasName = bodyTokens[scan + 1].raw.toLowerCase();
          const colsEnd = findMatchingParenTokenIdx(bodyTokens, scan + 2);
          if (colsEnd !== -1) {
            aliasCols = splitTokensByTopLevelComma(bodyTokens.slice(scan + 3, colsEnd))
              .map((grp) => (grp.length > 0 ? normalizeIdentifierName(grp[0]) : ''))
              .filter(Boolean);
          }
          break;
        }
      }

      if (aliasCols.length > 0 && valueTuples.length > 0) {
        loopRowBindings = valueTuples
          .map((tupleSlice) => {
            const cells = splitTokensByTopLevelComma(tupleSlice);
            if (cells.length !== aliasCols.length) return null;
            const rowMap = new Map<string, VarBinding>(scalarBindings);
            for (let i = 0; i < aliasCols.length; i += 1) {
              const evalCell = evaluateSqlExpressionTokens(cells[i], fullSql, 0, scalarBindings);
              rowMap.set(`${loopVar}.${aliasCols[i]}`, {
                value: evalCell.value,
                isDynamic: evalCell.isDynamic,
              });
              if (aliasName) {
                rowMap.set(`${aliasName}.${aliasCols[i]}`, {
                  value: evalCell.value,
                  isDynamic: evalCell.isDynamic,
                });
              }
            }
            return rowMap;
          })
          .filter((item): item is Map<string, VarBinding> => item !== null);
      }
    }
  }

  // Buscar cualquier `INSERT INTO ... VALUES ...` dentro del bloque DO $$ (saltando `IF`/`ELSE`/etc.)
  const bindingSets = loopRowBindings.length > 0 ? loopRowBindings : [scalarBindings];
  for (let i = 0; i + 1 < bodyTokens.length; i += 1) {
    if (bodyTokens[i].type === 'word' && bodyTokens[i].upper === 'INSERT' && bodyTokens[i + 1].upper === 'INTO') {
      // Encontrar el `;` que cierra este INSERT
      let endTokIdx = i + 2;
      while (endTokIdx < bodyTokens.length && !(bodyTokens[endTokIdx].type === 'symbol' && bodyTokens[endTokIdx].raw === ';')) {
        endTokIdx += 1;
      }
      const insertTokens = bodyTokens.slice(i, endTokIdx);
      const insertSlice: RawStatementSlice = {
        sql: fullSql.slice(insertTokens[0].start, insertTokens[insertTokens.length - 1].end),
        start: insertTokens[0].start,
        end: insertTokens[insertTokens.length - 1].end,
        tokens: insertTokens,
      };

      for (const bindings of bindingSets) {
        const parsed = parseInsertStatement(insertSlice, fullSql, 0, 'do_block', undefined, bindings);
        results.push(...parsed);
      }
      i = endTokIdx;
    }
  }

  return results;
}

function extractBaseSectionHeaders(sqlContent: string): BaseSectionHeaderInfo[] {
  const outsideManaged = stripManagedBlocks(sqlContent);
  const headers: BaseSectionHeaderInfo[] = [];
  const regex = /^-- (\d+[a-z]?)\.\s+[^\r\n]+$/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(outsideManaged)) !== null) {
    headers.push({
      sectionNumber: match[1],
      headerLine: match[0].trim(),
      offset: match.index,
    });
  }
  return headers;
}

function extractHistoricalDoBlocks(sqlContent: string): string[] {
  const outsideManaged = stripManagedBlocks(sqlContent);
  const lex = lexPostgreSql(outsideManaged, 0);
  const statements = splitTokensIntoStatements(lex.tokens, outsideManaged, 0);
  const doBlocks: string[] = [];
  for (const stmt of statements) {
    if (stmt.tokens[0]?.type === 'word' && stmt.tokens[0].upper === 'DO') {
      doBlocks.push(stmt.sql.trim());
    }
  }
  return doBlocks;
}

/**
 * Parsea `06_datos_prueba.sql` completo (sentencias base `INSERT`, bloques `DO $$`, `UPDATE` de nivel superior
 * como Sección 22b y bloques administrados `-- [ADMIN_SYNC_BEGIN:...] ... -- [ADMIN_SYNC_END:...]`).
 * Construye índices en memoria por `id` y por `naturalKeys` de `sqlSeedSyncCatalog.ts`.
 */
export function parseExistingSqlSeedRecords(sqlContent: string): ParsedSqlSeedIndex {
  const managedBlocks = findManagedSyncBlocks(sqlContent);
  const baseSectionHeaders = extractBaseSectionHeaders(sqlContent);
  const historicalDoBlocks = extractHistoricalDoBlocks(sqlContent);
  const warnings: string[] = [];

  const lex = lexPostgreSql(sqlContent, 0);
  const statements = splitTokensIntoStatements(lex.tokens, sqlContent, 0);

  const recordsByTable: Record<string, ParsedSeedRecord[]> = {};
  const byIdByTable: Record<string, Record<string, ParsedSeedRecord>> = {};
  const byNaturalKeyByTable: Record<string, Record<string, ParsedSeedRecord>> = {};

  const ensureTableBuckets = (tableName: string): void => {
    if (!recordsByTable[tableName]) recordsByTable[tableName] = [];
    if (!byIdByTable[tableName]) byIdByTable[tableName] = {};
    if (!byNaturalKeyByTable[tableName]) byNaturalKeyByTable[tableName] = {};
  };

  const upsertParsedRecord = (rec: ParsedSeedRecord): void => {
    ensureTableBuckets(rec.tableName);
    const meta = getSyncTableMetadata(rec.tableName);
    const idStr = typeof rec.row.id === 'string' ? rec.row.id.trim() : '';
    const existingById = idStr ? byIdByTable[rec.tableName][idStr] : undefined;

    if (existingById) {
      // Fusión ordenada por ejecución (ej. si ADMIN_SYNC re-inserta o actualiza una fila ya declarada)
      const idx = recordsByTable[rec.tableName].indexOf(existingById);
      if (idx !== -1) {
        recordsByTable[rec.tableName][idx] = rec;
      }
      byIdByTable[rec.tableName][idStr] = rec;
      return;
    }

    // Verificar colisión por llave natural solo cuando no existen dos PK `id` explícitas distintas
    if (meta && meta.naturalKeys.length > 0) {
      for (const nkCols of meta.naturalKeys) {
        const nk = buildCompositeKeyFromRow(rec.row, nkCols, meta);
        if (nk && byNaturalKeyByTable[rec.tableName][nk]) {
          const prev = byNaturalKeyByTable[rec.tableName][nk];
          const prevId = typeof prev.row.id === 'string' ? prev.row.id.trim() : '';
          if (idStr && prevId && idStr !== prevId) {
            continue;
          }
          const idx = recordsByTable[rec.tableName].indexOf(prev);
          if (idx !== -1) {
            recordsByTable[rec.tableName][idx] = rec;
          }
          if (idStr) byIdByTable[rec.tableName][idStr] = rec;
          byNaturalKeyByTable[rec.tableName][nk] = rec;
          return;
        }
      }
    }

    recordsByTable[rec.tableName].push(rec);
    if (idStr) {
      byIdByTable[rec.tableName][idStr] = rec;
    }
    if (meta) {
      for (const nkCols of meta.naturalKeys) {
        const nk = buildCompositeKeyFromRow(rec.row, nkCols, meta);
        if (nk && !byNaturalKeyByTable[rec.tableName][nk]) {
          byNaturalKeyByTable[rec.tableName][nk] = rec;
        }
      }
    }
  };

  for (const stmt of statements) {
    const first = stmt.tokens[0];
    if (!first || first.type !== 'word') continue;

    const managedKey = findManagedKeyAtOffset(managedBlocks, stmt.start);
    const recordSource: ParsedRecordSource = managedKey ? 'managed_sync' : 'base_insert';

    if (first.upper === 'INSERT') {
      const parsed = parseInsertStatement(stmt, sqlContent, 0, recordSource, managedKey);
      for (const rec of parsed) {
        upsertParsedRecord(rec);
      }
    } else if (first.upper === 'DO') {
      const parsedDo = parseDoBlockStatements(stmt, sqlContent);
      for (const rec of parsedDo) {
        upsertParsedRecord(rec);
      }
    } else if (first.upper === 'UPDATE') {
      const parsedUpd = parseUpdateByIdStatement(stmt, sqlContent, 0);
      if (parsedUpd) {
        ensureTableBuckets(parsedUpd.tableName);
        const existing = byIdByTable[parsedUpd.tableName][parsedUpd.id];
        if (existing) {
          for (const assign of parsedUpd.assignments) {
            if (assign.column === 'updated_at') continue;
            existing.row[assign.column] = assign.value;
            if (!existing.columns.includes(assign.column)) {
              existing.columns.push(assign.column);
            }
            if (!existing.overlayUpdatedColumns.includes(assign.column)) {
              existing.overlayUpdatedColumns.push(assign.column);
            }
            if (assign.isDynamic && !existing.overlayDynamicColumns.includes(assign.column)) {
              existing.overlayDynamicColumns.push(assign.column);
            } else if (!assign.isDynamic) {
              existing.overlayDynamicColumns = existing.overlayDynamicColumns.filter((c) => c !== assign.column);
              existing.dynamicColumns = existing.dynamicColumns.filter((c) => c !== assign.column);
            }
          }
          existing.overlaySource = managedKey ? 'managed_sync' : 'base_update';
        }
      }
    } else if (first.upper === 'DELETE' && managedKey) {
      const parsedDel = parseDeleteMnStatement(stmt, sqlContent, 0);
      if (parsedDel) {
        const meta = getSyncTableMetadata(parsedDel.tableName);
        if (meta?.kind === 'pure_mn_link' && recordsByTable[parsedDel.tableName]) {
          recordsByTable[parsedDel.tableName] = recordsByTable[parsedDel.tableName].filter((rec) => {
            for (const [k, v] of Object.entries(parsedDel.predicates)) {
              const normRec = normalizeComparableForKey(rec.row[k], k, meta);
              const normDel = normalizeComparableForKey(v, k, meta);
              if (normRec !== normDel) return true;
            }
            return false;
          });
        }
      }
    }
  }

  // Resolver `id_certificado_version` implícito por trigger en filas base (ej. Sección 23/24/27)
  const activeCertVersionByCertId = new Map<string, string>();
  const highestCertVersionByCertId = new Map<string, { version: number; id: string }>();
  for (const cvRec of recordsByTable['certificado_version'] ?? []) {
    const certId = typeof cvRec.row.id_certificado === 'string' ? cvRec.row.id_certificado.trim() : '';
    const cvId = typeof cvRec.row.id === 'string' ? cvRec.row.id.trim() : '';
    if (!certId || !cvId) continue;
    const verNum = typeof cvRec.row.version_numero === 'number' ? cvRec.row.version_numero : Number(cvRec.row.version_numero ?? 0);
    if (cvRec.row.es_version_actual === true) {
      activeCertVersionByCertId.set(certId, cvId);
    }
    const prev = highestCertVersionByCertId.get(certId);
    if (!prev || verNum >= prev.version) {
      highestCertVersionByCertId.set(certId, { version: verNum, id: cvId });
    }
  }

  for (const [tableName, recs] of Object.entries(recordsByTable)) {
    const meta = getSyncTableMetadata(tableName);
    if (!meta) continue;
    if (TABLES_AUTO_RESOLVING_CERT_VERSION.has(tableName)) {
      for (const rec of recs) {
        if (rec.row.id_certificado_version === undefined || rec.row.id_certificado_version === null) {
          const certId = typeof rec.row.id_certificado === 'string' ? rec.row.id_certificado.trim() : '';
          const resolvedCv =
            activeCertVersionByCertId.get(certId) ?? highestCertVersionByCertId.get(certId)?.id;
          if (resolvedCv) {
            rec.row.id_certificado_version = resolvedCv;
            if (!rec.columns.includes('id_certificado_version')) {
              rec.columns.push('id_certificado_version');
            }
          }
        }
      }
    }

    // Reconstruir índices finales tras resoluciones y bajas M:N
    const idMap: Record<string, ParsedSeedRecord> = {};
    const nkMap: Record<string, ParsedSeedRecord> = {};
    for (const rec of recs) {
      const idStr = typeof rec.row.id === 'string' ? rec.row.id.trim() : '';
      if (idStr) idMap[idStr] = rec;
      for (const nkCols of meta.naturalKeys) {
        const nk = buildCompositeKeyFromRow(rec.row, nkCols, meta);
        if (nk && !nkMap[nk]) {
          nkMap[nk] = rec;
        }
      }
    }
    byIdByTable[tableName] = idMap;
    byNaturalKeyByTable[tableName] = nkMap;
  }

  const rowsByTable: Record<string, SqlRowRecord[]> = {};
  for (const [tableName, recs] of Object.entries(recordsByTable)) {
    rowsByTable[tableName] = recs.map((r) => r.row);
  }

  return {
    recordsByTable,
    rowsByTable,
    byIdByTable,
    byNaturalKeyByTable,
    managedBlocks,
    baseSectionHeaders,
    historicalDoBlocks,
    warnings,
  };
}

function resolveMatchedSeedRecord(
  tableName: string,
  liveRow: SqlRowRecord,
  index: ParsedSqlSeedIndex
): ParsedSeedRecord | undefined {
  const meta = getSyncTableMetadata(tableName);
  const idStr = typeof liveRow.id === 'string' ? liveRow.id.trim() : '';
  if (idStr && index.byIdByTable[tableName]?.[idStr]) {
    return index.byIdByTable[tableName][idStr];
  }
  if (meta) {
    for (const nkCols of meta.naturalKeys) {
      const nk = buildCompositeKeyFromRow(liveRow, nkCols, meta);
      if (nk && index.byNaturalKeyByTable[tableName]?.[nk]) {
        return index.byNaturalKeyByTable[tableName][nk];
      }
    }
  }
  return undefined;
}

function buildComparisonAlignedSeedRows(
  tableName: string,
  liveRows: readonly SqlRowRecord[],
  index: ParsedSqlSeedIndex,
  ignoreDynamicDrift: boolean
): SqlRowRecord[] {
  const existingRecs = index.recordsByTable[tableName] ?? [];
  if (existingRecs.length === 0) return [];

  const liveByRecRef = new Map<ParsedSeedRecord, SqlRowRecord>();
  for (const liveRow of liveRows) {
    const matched = resolveMatchedSeedRecord(tableName, liveRow, index);
    if (matched && !liveByRecRef.has(matched)) {
      liveByRecRef.set(matched, liveRow);
    }
  }

  return existingRecs.map((rec) => {
    const clone: SqlRowRecord = { ...rec.row };
    const matchedLive = liveByRecRef.get(rec);
    if (!matchedLive) return clone;

    if (ignoreDynamicDrift) {
      const dynamicSet = new Set([...rec.dynamicColumns, ...rec.overlayDynamicColumns]);
      for (const dynCol of dynamicSet) {
        if (matchedLive[dynCol] !== null && matchedLive[dynCol] !== undefined) {
          clone[dynCol] = matchedLive[dynCol];
        }
      }
    }

    // Si la tabla heredó id_certificado_version implícitamente vía trigger y no tenía columna explícita,
    // alinear si ambos son strings no vacíos solo cuando el INSERT base lo omitió
    if (
      TABLES_AUTO_RESOLVING_CERT_VERSION.has(tableName) &&
      !rec.insertColumns.includes('id_certificado_version') &&
      matchedLive.id_certificado_version !== undefined &&
      matchedLive.id_certificado_version !== null &&
      clone.id_certificado_version === undefined
    ) {
      clone.id_certificado_version = matchedLive.id_certificado_version;
    }

    return clone;
  });
}

function buildDiffForTableAgainstIndex(
  tableName: string,
  liveRows: readonly SqlRowRecord[],
  index: ParsedSqlSeedIndex,
  options?: ApplyDatabaseSyncOptions
): TableDiffResult<SqlRowRecord> {
  const ignoreDynamicDrift = options?.ignoreDynamicExpressionDrift !== false;
  const alignedExisting = buildComparisonAlignedSeedRows(tableName, liveRows, index, ignoreDynamicDrift);
  return computeTableSyncDiff(tableName, liveRows, alignedExisting, {
    scopedParentFilter: options?.scopedParentFiltersByTable?.[tableName],
    labelResolver: options?.labelResolver,
  });
}

function resolveCanonicalBlockKeyForTable(tableName: string, explicitKey?: string): string {
  if (explicitKey && explicitKey.trim()) return explicitKey.trim();
  return BLOCK_BY_TABLE.get(tableName) ?? 'certificacion';
}

function extractManagedStatementsByTable(innerSql: string): Map<string, string[]> {
  const byTable = new Map<string, string[]>();
  const lex = lexPostgreSql(innerSql, 0);
  const stmts = splitTokensIntoStatements(lex.tokens, innerSql, 0);

  for (const stmt of stmts) {
    const tks = stmt.tokens;
    if (tks.length === 0 || tks[0].type !== 'word') continue;
    let tblInfo: { tableName: string; nextIdx: number } | null = null;
    if (tks[0].upper === 'INSERT' && tks[1]?.upper === 'INTO') {
      tblInfo = readTableIdentifier(tks, 2);
    } else if (tks[0].upper === 'UPDATE') {
      tblInfo = readTableIdentifier(tks, 1);
    } else if (tks[0].upper === 'DELETE' && tks[1]?.upper === 'FROM') {
      tblInfo = readTableIdentifier(tks, 2);
    }
    if (!tblInfo) continue;

    const trimmedStmt = stmt.sql.trim();
    const list = byTable.get(tblInfo.tableName) ?? [];
    list.push(trimmedStmt.endsWith(';') ? trimmedStmt : `${trimmedStmt};`);
    byTable.set(tblInfo.tableName, list);
  }

  return byTable;
}

function buildSurgicalUpdateByIdForExistingRow(
  tableName: string,
  liveRow: SqlRowRecord,
  changedCols: readonly string[],
  meta: SqlSyncTableMetadata | null
): string | null {
  const idVal = liveRow.id;
  if (idVal === null || idVal === undefined || String(idVal).trim() === '') {
    return null;
  }

  const updateCols = changedCols.filter((c) => c !== 'id' && c !== 'created_at' && c !== 'updated_at');
  if (updateCols.length === 0) return null;

  const setClauses = updateCols.map(
    (col) => `${col} = ${formatSqlLiteral(liveRow[col], { columnName: col, meta })}`
  );
  if (tableSupportsUpdatedAt(tableName)) {
    setClauses.push('updated_at = NOW()');
  }

  const distinctPredicates = updateCols.map(
    (col) => `${col} IS DISTINCT FROM ${formatSqlLiteral(liveRow[col], { columnName: col, meta })}`
  );
  const idLiteral = formatSqlLiteral(idVal, { columnName: 'id', dataType: 'uuid', meta });

  return [
    `UPDATE public.${tableName} SET`,
    `    ${setClauses.join(',\n    ')}`,
    `WHERE id = ${idLiteral}`,
    `  AND (${distinctPredicates.join('\n    OR ')});`,
  ].join('\n');
}

function upsertManagedBlocksIntoSql(
  sqlWithoutOldOrUpdatedBlocks: string,
  newBodiesByBlockKey: ReadonlyMap<string, string>,
  explicitManagedBlockKey?: string
): string {
  const existingBlocks = findManagedSyncBlocks(sqlWithoutOldOrUpdatedBlocks);
  let workingSql = sqlWithoutOldOrUpdatedBlocks;

  // 1. Reemplazar o eliminar bloques ya existentes en orden inverso para preservar offsets
  const handledKeys = new Set<string>();
  const reversedExisting = [...existingBlocks].sort((a, b) => b.beginOffset - a.beginOffset);

  for (const loc of reversedExisting) {
    if (!newBodiesByBlockKey.has(loc.key)) {
      continue;
    }
    handledKeys.add(loc.key);
    const body = (newBodiesByBlockKey.get(loc.key) ?? '').trim();
    if (!body) {
      // Eliminar bloque administrado vacío junto con saltos de línea sobrantes
      let rmStart = loc.beginOffset;
      while (rmStart > 0 && (workingSql[rmStart - 1] === '\n' || workingSql[rmStart - 1] === '\r')) {
        rmStart -= 1;
      }
      workingSql = `${workingSql.slice(0, rmStart)}${workingSql.slice(loc.endOffset)}`;
    } else {
      const replacement = `-- [ADMIN_SYNC_BEGIN:${loc.key}]\n${body}\n-- [ADMIN_SYNC_END:${loc.key}]`;
      workingSql = `${workingSql.slice(0, loc.beginOffset)}${replacement}${workingSql.slice(loc.endOffset)}`;
    }
  }

  // 2. Insertar bloques nuevos que no existían previamente respetando orden canónico `extra -> certificacion -> auditorias`
  const orderedNewKeys = explicitManagedBlockKey
    ? [explicitManagedBlockKey]
    : [...CANONICAL_BLOCK_ORDER, ...Array.from(newBodiesByBlockKey.keys()).filter((k) => !CANONICAL_BLOCK_ORDER.includes(k as SqlSeedBlockId))];

  for (const key of orderedNewKeys) {
    if (handledKeys.has(key)) continue;
    const body = (newBodiesByBlockKey.get(key) ?? '').trim();
    if (!body) continue;
    handledKeys.add(key);

    const renderedBlock = `-- [ADMIN_SYNC_BEGIN:${key}]\n${body}\n-- [ADMIN_SYNC_END:${key}]`;
    const currentBlocks = findManagedSyncBlocks(workingSql);

    if (!explicitManagedBlockKey && CANONICAL_BLOCK_ORDER.includes(key as SqlSeedBlockId)) {
      const myOrder = CANONICAL_BLOCK_ORDER.indexOf(key as SqlSeedBlockId);
      const nextCanonicalBlock = currentBlocks.find((b) => {
        const idx = CANONICAL_BLOCK_ORDER.indexOf(b.key as SqlSeedBlockId);
        return idx !== -1 && idx > myOrder;
      });
      if (nextCanonicalBlock) {
        const before = workingSql.slice(0, nextCanonicalBlock.beginOffset).replace(/\s+$/, '');
        const after = workingSql.slice(nextCanonicalBlock.beginOffset);
        workingSql = `${before}\n\n${renderedBlock}\n\n${after}`;
        continue;
      }
    }

    const trimmedEnd = workingSql.replace(/\s+$/, '');
    workingSql = `${trimmedEnd}\n\n${renderedBlock}\n`;
  }

  // Normalizar salto final único cuando hay bloques administrados
  if (!workingSql.endsWith('\n')) {
    workingSql += '\n';
  }
  return workingSql;
}

/**
 * Valida todas las invariantes críticas sobre un contenido candidato de `06_datos_prueba.sql`:
 * - Delimitadores `$$` balanceados.
 * - Conservación íntegra de secciones base (`1.`..`29.`) y bloques históricos `DO $$`.
 * - Cero `DELETE FROM` sobre las 57 tablas protegidas + `equipo_auditor`.
 * - Comillas, paréntesis y marcadores `-- [ADMIN_SYNC_BEGIN:...]`/`END` balanceados.
 */
export function validateUpdatedSeedSql(
  nextSqlContent: string,
  originalSqlContent?: string
): SqlSeedValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const dollarCount = (nextSqlContent.match(/\$\$/g) ?? []).length;
  const balancedDollars = hasBalancedDollarDelimiters(nextSqlContent);
  if (!balancedDollars) {
    errors.push(`Delimitadores $$ desbalanceados (conteo impar: ${dollarCount}).`);
  }

  // Verificar marcadores ADMIN_SYNC_BEGIN / END pareados y sin anidación
  const markerLines = [...nextSqlContent.matchAll(/^-- \[ADMIN_SYNC_(BEGIN|END):([a-zA-Z0-9_.-]+)\][^\r\n]*$/gm)];
  let validManagedMarkers = true;
  let openKey: string | null = null;
  const seenKeys = new Set<string>();
  for (const m of markerLines) {
    const kind = m[1];
    const key = m[2];
    if (kind === 'BEGIN') {
      if (openKey !== null) {
        validManagedMarkers = false;
        errors.push(`Marcador ADMIN_SYNC_BEGIN:${key} anidado dentro de ${openKey}.`);
      } else if (seenKeys.has(key)) {
        validManagedMarkers = false;
        errors.push(`Bloque administrado duplicado para la clave "${key}".`);
      }
      openKey = key;
      seenKeys.add(key);
    } else {
      if (openKey !== key) {
        validManagedMarkers = false;
        errors.push(`Marcador ADMIN_SYNC_END:${key} no coincide con el bloque abierto (${openKey ?? 'ninguno'}).`);
      }
      openKey = null;
    }
  }
  if (openKey !== null) {
    validManagedMarkers = false;
    errors.push(`Falta el marcador de cierre ADMIN_SYNC_END:${openKey}.`);
  }

  // Verificar sintaxis léxica, paréntesis, comillas y prohibición de DELETE en tablas protegidas
  const lex = lexPostgreSql(nextSqlContent, 0);
  const balancedQuotesAndParens =
    !lex.unclosedSingleQuote &&
    !lex.unclosedBlockComment &&
    !lex.unclosedDollarQuote &&
    lex.parenDepth === 0 &&
    !lex.negativeParenDepth;

  if (lex.unclosedSingleQuote) {
    errors.push('Cadena SQL entre comillas simples sin cerrar en el archivo resultante.');
  }
  if (lex.unclosedBlockComment) {
    errors.push('Comentario de bloque /* ... */ sin cerrar en el archivo resultante.');
  }
  if (lex.unclosedDollarQuote) {
    errors.push('Bloque dollar-quoted $$ sin cerrar en el archivo resultante.');
  }
  if (lex.parenDepth !== 0 || lex.negativeParenDepth) {
    errors.push(`Paréntesis SQL desbalanceados (profundidad final: ${lex.parenDepth}).`);
  }

  // Verificar que los bloques administrados terminan sus sentencias en punto y coma
  const managedBlocks = findManagedSyncBlocks(nextSqlContent);
  for (const mb of managedBlocks) {
    const innerLex = lexPostgreSql(mb.innerSql, 0);
    if (innerLex.tokens.length > 0) {
      const lastTok = innerLex.tokens[innerLex.tokens.length - 1];
      if (lastTok.type !== 'symbol' || lastTok.raw !== ';') {
        validManagedMarkers = false;
        errors.push(`El bloque administrado "${mb.key}" contiene una sentencia sin terminación ";".`);
      }
    }
  }

  // Prohibición estricta de DELETE FROM sobre tablas protegidas
  let zeroProtectedDeletes = true;
  const statements = splitTokensIntoStatements(lex.tokens, nextSqlContent, 0);
  for (const stmt of statements) {
    const tks = stmt.tokens;
    for (let i = 0; i + 2 < tks.length; i += 1) {
      if (tks[i].type === 'word' && tks[i].upper === 'DELETE' && tks[i + 1].type === 'word' && tks[i + 1].upper === 'FROM') {
        const tblInfo = readTableIdentifier(tks, i + 2);
        if (tblInfo) {
          const meta = getSyncTableMetadata(tblInfo.tableName);
          if (!meta || meta.kind !== 'pure_mn_link') {
            zeroProtectedDeletes = false;
            errors.push(
              `Sentencia DELETE FROM prohibida sobre la tabla protegida "${tblInfo.tableName}".`
            );
          }
        }
      }
    }
  }

  // Preservación de secciones base y bloques históricos DO $$
  let preservedBaseSections = true;
  let preservedHistoricalDoBlocks = true;

  if (typeof originalSqlContent === 'string' && originalSqlContent.length > 0) {
    const origSections = extractBaseSectionHeaders(originalSqlContent).map((s) => s.headerLine);
    const nextSections = extractBaseSectionHeaders(nextSqlContent).map((s) => s.headerLine);
    if (origSections.length !== nextSections.length) {
      preservedBaseSections = false;
      errors.push(
        `Se perdió o alteró la cantidad de secciones base (${origSections.length} esperadas vs ${nextSections.length} encontradas).`
      );
    } else {
      for (let i = 0; i < origSections.length; i += 1) {
        if (origSections[i] !== nextSections[i]) {
          preservedBaseSections = false;
          errors.push(`Sección base alterada: "${origSections[i]}" vs "${nextSections[i]}".`);
          break;
        }
      }
    }

    const origDos = extractHistoricalDoBlocks(originalSqlContent);
    const nextDos = extractHistoricalDoBlocks(nextSqlContent);
    if (origDos.length !== nextDos.length) {
      preservedHistoricalDoBlocks = false;
      errors.push(
        `Bloques DO $$ históricos modificados o eliminados (${origDos.length} esperados vs ${nextDos.length} encontrados).`
      );
    } else {
      for (let i = 0; i < origDos.length; i += 1) {
        if (origDos[i] !== nextDos[i]) {
          preservedHistoricalDoBlocks = false;
          errors.push(`El bloque histórico DO $$ #${i + 1} fue alterado inesperadamente.`);
          break;
        }
      }
    }
  }

  return {
    valid:
      errors.length === 0 &&
      balancedDollars &&
      preservedBaseSections &&
      preservedHistoricalDoBlocks &&
      zeroProtectedDeletes &&
      balancedQuotesAndParens &&
      validManagedMarkers,
    errors,
    warnings,
    dollarDelimiterCount: dollarCount,
    balancedDollarDelimiters: balancedDollars,
    preservedBaseSections,
    preservedHistoricalDoBlocks,
    zeroProtectedDeletes,
    balancedQuotesAndParens,
    validManagedMarkers,
  };
}

/**
 * Aplica de forma determinista e idempotente la reconciliación BD → `06_datos_prueba.sql`:
 * - Fase A: actualiza en sitio celdas literales de tuplas `base_insert` cuyas columnas cambiaron.
 * - Fase B: genera bloques administrados `-- [ADMIN_SYNC_BEGIN:<key>] ... -- [ADMIN_SYNC_END:<key>]`
 *   ordenados topológicamente para filas nuevas, archivadas, updates no cubiertos en Fase A y bajas M:N.
 */
export function applyDatabaseSyncTo06Sql(
  currentSqlContent: string,
  liveRowsByTable: Readonly<Record<string, readonly SqlRowRecord[]>>,
  options?: ApplyDatabaseSyncOptions
): SqlSeedUpdaterResult {
  const warnings: string[] = [];
  const effectiveIndex = parseExistingSqlSeedRecords(currentSqlContent);
  warnings.push(...effectiveIndex.warnings);

  const requestedTablesRaw = options?.tablesToSync
    ? Array.from(options.tablesToSync)
    : Object.keys(liveRowsByTable);

  const targetTables = sortTablesTopologically(
    requestedTablesRaw.filter((tbl) => {
      const meta = getSyncTableMetadata(tbl);
      if (!meta) return false;
      if (meta.targetFile !== '06_datos_prueba.sql') {
        warnings.push(`La tabla "${tbl}" pertenece a 07_normas_requisitos_csv.sql y se omitió en la sincronización de 06_datos_prueba.sql.`);
        return false;
      }
      return true;
    })
  );

  const summaryByTable: Record<string, SyncDiffSummary> = {};
  const orderedSummaries: SyncDiffSummary[] = [];
  const effectiveDiffsByTable = new Map<string, TableDiffResult<SqlRowRecord>>();
  const diffSnippets: string[] = [];

  for (const tableName of targetTables) {
    const liveRows = liveRowsByTable[tableName] ?? [];
    const diff = buildDiffForTableAgainstIndex(tableName, liveRows, effectiveIndex, options);
    summaryByTable[tableName] = diff.summary;
    orderedSummaries.push(diff.summary);
    effectiveDiffsByTable.set(tableName, diff);
  }

  const tablesWithChangesCount = orderedSummaries.filter((s) => s.hasChanges).length;
  if (tablesWithChangesCount === 0) {
    const validation = validateUpdatedSeedSql(currentSqlContent, currentSqlContent);
    return {
      nextSqlContent: currentSqlContent,
      changed: false,
      summaryByTable,
      orderedSummaries,
      diffSnippets: [],
      warnings,
      validation,
      counts: {
        phaseACellUpdates: 0,
        phaseBUpdatesById: 0,
        phaseBInserts: 0,
        phaseBArchivedUpserts: 0,
        phaseBDeletedMnLinks: 0,
        tablesWithChanges: 0,
      },
    };
  }

  // Paso 1 (Fase A): Evaluar actualizaciones quirúrgicas in-place contra las tuplas base fuera de ADMIN_SYNC
  const baseSqlOnly = stripManagedBlocks(currentSqlContent);
  const baseIndex = parseExistingSqlSeedRecords(baseSqlOnly);

  interface CellPatch {
    start: number;
    end: number;
    replacementSql: string;
    snippet: string;
  }

  const cellPatches: CellPatch[] = [];
  const ignoreDynamicDrift = options?.ignoreDynamicExpressionDrift !== false;

  for (const tableName of targetTables) {
    const meta = getSyncTableMetadata(tableName);
    if (!meta || meta.kind === 'trigger_derived') continue;
    const liveRows = liveRowsByTable[tableName] ?? [];
    const baseDiff = buildDiffForTableAgainstIndex(tableName, liveRows, baseIndex, options);

    for (const item of baseDiff.items) {
      if ((item.status !== 'updated' && item.status !== 'archived') || !item.liveRow) continue;
      const baseRec = resolveMatchedSeedRecord(tableName, item.liveRow, baseIndex);
      if (!baseRec || baseRec.source !== 'base_insert') continue;

      const overlaySet = new Set(baseRec.overlayUpdatedColumns);
      for (const col of item.changedColumns) {
        if (col === 'id' || col === 'created_at' || col === 'updated_at') continue;
        // No sobreescribir en la tupla base si la columna fue alterada por Sección 22b (base_update)
        if (overlaySet.has(col)) continue;

        const cell = baseRec.cellsByColumn[col];
        if (!cell) continue;
        if (
          ignoreDynamicDrift &&
          cell.isDynamicExpression &&
          item.liveRow[col] !== null &&
          item.liveRow[col] !== undefined
        ) {
          continue;
        }

        const newLiteral = formatSqlLiteral(item.liveRow[col], { columnName: col, meta });
        if (newLiteral === cell.rawSql) continue;

        cellPatches.push({
          start: cell.valueStartOffset,
          end: cell.valueEndOffset,
          replacementSql: newLiteral,
          snippet: `-- [Fase A · ${meta.labelEs}] ${item.displayLabel}: ${col} = ${newLiteral}`,
        });
      }
    }
  }

  // Aplicar parches Fase A en orden descendente de offset sobre currentSqlContent
  let workingSql = currentSqlContent;
  const sortedPatches = [...cellPatches].sort((a, b) => b.start - a.start);
  let lastPatchedStart = Number.POSITIVE_INFINITY;
  let phaseACellUpdates = 0;

  for (const patch of sortedPatches) {
    if (patch.end > lastPatchedStart) continue; // Guarda anti-solapamiento
    workingSql = `${workingSql.slice(0, patch.start)}${patch.replacementSql}${workingSql.slice(patch.end)}`;
    lastPatchedStart = patch.start;
    phaseACellUpdates += 1;
    if (diffSnippets.length < 40 && !containsRawUuid(patch.snippet)) {
      diffSnippets.push(patch.snippet);
    } else if (diffSnippets.length < 40) {
      diffSnippets.push(`-- [Fase A] ${patch.replacementSql}`);
    }
  }

  // Paso 2 (Fase B): Con las tuplas base ya parcheadas por Fase A, construir los bloques ADMIN_SYNC
  const patchedBaseOnly = stripManagedBlocks(workingSql);
  const patchedBaseIndex = parseExistingSqlSeedRecords(patchedBaseOnly);

  // Conservar sentencias administradas previas de tablas que NO forman parte de targetTables
  const existingBlocksBeforePatch = findManagedSyncBlocks(workingSql);
  const preservedStatementsByBlockAndTable = new Map<string, Map<string, string[]>>();
  const targetTableSet = new Set(targetTables);

  for (const mb of existingBlocksBeforePatch) {
    const byTbl = extractManagedStatementsByTable(mb.innerSql);
    const kept = new Map<string, string[]>();
    for (const [tbl, stmts] of byTbl.entries()) {
      if (!targetTableSet.has(tbl)) {
        kept.set(tbl, stmts);
      }
    }
    preservedStatementsByBlockAndTable.set(mb.key, kept);
  }

  // Preparar cubetas por clave de bloque administrado (`extra`, `certificacion`, `auditorias`, o explícita)
  const blockKeysToRebuild = new Set<string>();
  for (const tbl of targetTables) {
    blockKeysToRebuild.add(resolveCanonicalBlockKeyForTable(tbl, options?.managedBlockKey));
  }
  for (const mb of existingBlocksBeforePatch) {
    if (options?.managedBlockKey && mb.key === options.managedBlockKey) {
      blockKeysToRebuild.add(mb.key);
    } else if (!options?.managedBlockKey && CANONICAL_BLOCK_ORDER.includes(mb.key as SqlSeedBlockId)) {
      blockKeysToRebuild.add(mb.key);
    }
  }

  const newBodiesByBlockKey = new Map<string, string>();
  let phaseBUpdatesById = 0;
  let phaseBInserts = 0;
  let phaseBArchivedUpserts = 0;
  let phaseBDeletedMnLinks = 0;

  for (const blockKey of blockKeysToRebuild) {
    const blockTargetTables = targetTables.filter(
      (tbl) => resolveCanonicalBlockKeyForTable(tbl, options?.managedBlockKey) === blockKey
    );
    const preservedMap = preservedStatementsByBlockAndTable.get(blockKey) ?? new Map<string, string[]>();
    const allTablesForBlock = sortTablesTopologically([
      ...blockTargetTables,
      ...Array.from(preservedMap.keys()),
    ]);

    const blockSqlChunks: string[] = [];

    for (const tableName of allTablesForBlock) {
      if (!targetTableSet.has(tableName)) {
        const preservedStmts = preservedMap.get(tableName) ?? [];
        if (preservedStmts.length > 0) {
          blockSqlChunks.push(preservedStmts.join('\n\n'));
        }
        continue;
      }

      const meta = getSyncTableMetadata(tableName);
      if (!meta) continue;
      if (meta.kind === 'trigger_derived') {
        const effectiveDiff = effectiveDiffsByTable.get(tableName);
        if (effectiveDiff?.summary.hasChanges) {
          warnings.push(
            `La tabla ${tableName} se deriva por triggers de PostgreSQL y no requiere sentencias manuales.`
          );
        }
        continue;
      }

      const liveRows = liveRowsByTable[tableName] ?? [];
      const postPhaseADiff = buildDiffForTableAgainstIndex(tableName, liveRows, patchedBaseIndex, options);

      const tableStatements: string[] = [];
      const remainingItemsForGenerator: TableDiffResult<SqlRowRecord>['items'] = [];

      for (const item of postPhaseADiff.items) {
        if (item.status === 'unchanged') continue;

        if ((item.status === 'updated' || item.status === 'archived') && item.matchedBy !== 'none' && item.liveRow) {
          // Fila ya existe en la base (ej. bloque `DO $$`, columna ausente en `INSERT` base, `deleted_at`, o Sección 22b)
          const surgicalUpdate = buildSurgicalUpdateByIdForExistingRow(
            tableName,
            item.liveRow,
            item.changedColumns,
            meta
          );
          if (surgicalUpdate) {
            tableStatements.push(surgicalUpdate);
            phaseBUpdatesById += 1;
            continue;
          }
        }

        remainingItemsForGenerator.push(item);
      }

      if (remainingItemsForGenerator.length > 0) {
        const filteredDiff: TableDiffResult<SqlRowRecord> = {
          ...postPhaseADiff,
          items: remainingItemsForGenerator,
        };
        const genRes = buildTableSyncStatements(tableName, filteredDiff, {
          batchSize: options?.batchSize ?? 100,
        });
        warnings.push(...genRes.warnings);
        if (genRes.statements.length > 0) {
          tableStatements.push(...genRes.statements);
        }
        phaseBUpdatesById += genRes.counts.updatesById;
        phaseBInserts += genRes.counts.inserts;
        phaseBArchivedUpserts += genRes.counts.archivedUpserts;
        phaseBDeletedMnLinks += genRes.counts.deletedMnLinks;
      }

      if (tableStatements.length > 0) {
        const sectionText = `-- [${meta.labelEs} · public.${tableName}]\n${tableStatements.join('\n\n')}`;
        blockSqlChunks.push(sectionText);
        for (const stmt of tableStatements) {
          if (diffSnippets.length < 40) {
            diffSnippets.push(stmt);
          }
        }
      }
    }

    newBodiesByBlockKey.set(blockKey, blockSqlChunks.join('\n\n'));
  }

  const nextSqlContent = upsertManagedBlocksIntoSql(
    workingSql,
    newBodiesByBlockKey,
    options?.managedBlockKey
  );

  const changed = nextSqlContent !== currentSqlContent;
  const validation = validateUpdatedSeedSql(nextSqlContent, currentSqlContent);

  return {
    nextSqlContent,
    changed,
    summaryByTable,
    orderedSummaries,
    diffSnippets,
    warnings: Array.from(new Set(warnings)),
    validation,
    counts: {
      phaseACellUpdates,
      phaseBUpdatesById,
      phaseBInserts,
      phaseBArchivedUpserts,
      phaseBDeletedMnLinks,
      tablesWithChanges: tablesWithChangesCount,
    },
  };
}

/**
 * Vista previa no destructiva de los cambios propuestos sobre `06_datos_prueba.sql`.
 */
export function previewDatabaseSyncTo06Sql(
  currentSqlContent: string,
  liveRowsByTable: Readonly<Record<string, readonly SqlRowRecord[]>>,
  options?: ApplyDatabaseSyncOptions
): SqlSeedUpdaterResult {
  return applyDatabaseSyncTo06Sql(currentSqlContent, liveRowsByTable, options);
}

export function getCanonicalAdminSyncBlockOrder(): readonly SqlSeedBlockId[] {
  return CANONICAL_BLOCK_ORDER;
}

export function getSupported06SyncTables(): string[] {
  return SQL_SYNC_TABLES_TOPO_ORDER.filter(
    (tbl) => SQL_SYNC_TABLE_METADATA[tbl]?.targetFile === '06_datos_prueba.sql'
  );
}
