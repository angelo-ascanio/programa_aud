/**
 * Paso 1.2: Motor Puro de Serialización PostgreSQL Idempotente y Comparación/Diff
 *
 * Responsabilidades:
 * 1. Serializar literales PostgreSQL de forma segura (`NULL`, `BOOLEAN`, `NUMERIC`,
 *    `DATE`, `TIME`, `TIMESTAMPTZ`, `LTREE`, `JSONB`, `TEXT` / `E'...'`) sin jamás
 *    introducir delimitadores `$$` desbalanceados.
 * 2. Ordenar filas respetando jerarquías auto-referenciales (`id_requisito_padre`,
 *    `id_ciclo_origen`), versiones (`es_version_actual`) y Convención Sitio 0.
 * 3. Clasificar diferencias entre la base viva y los registros semilla existentes
 *    ignorando timestamps volátiles (`created_at`, `updated_at`) y generando resúmenes
 *    en español con cumplimiento estricto **Zero-UUID**.
 * 4. Emitir sentencias SQL idempotentes (`INSERT ... ON CONFLICT ... DO UPDATE/NOTHING`)
 *    para filas activas, archivadas lógicamente (`deleted_at IS NOT NULL`, 0 `DELETE`
 *    en tablas protegidas), llaves únicas mutadas y tablas puente M:N puras.
 */

import {
  SQL_SYNC_TABLE_METADATA,
  type SqlSyncTableMetadata,
  getSyncTableMetadata,
} from './sqlSeedSyncCatalog';
import { containsRawUuid } from './zeroUuid';

export type SqlRowRecord = Record<string, unknown>;

export type SqlLiteralDataType =
  | 'uuid'
  | 'boolean'
  | 'number'
  | 'date'
  | 'time'
  | 'timestamptz'
  | 'ltree'
  | 'jsonb'
  | 'text';

export interface FormatSqlLiteralOptions {
  columnName?: string;
  dataType?: SqlLiteralDataType;
  meta?: SqlSyncTableMetadata | null;
}

export type RowDiffStatus = 'unchanged' | 'new' | 'updated' | 'archived' | 'removed_mn';

export interface ClassifiedRowDiff<T extends SqlRowRecord = SqlRowRecord> {
  status: RowDiffStatus;
  liveRow?: T;
  existingRow?: T;
  changedColumns: string[];
  matchedBy: 'pk' | 'natural_key' | 'none';
  mutatedUniqueKey: boolean;
  displayLabel: string;
}

export interface SyncDiffSummary {
  table: string;
  tableLabelEs: string;
  sinCambios: number;
  nuevas: number;
  modificadas: number;
  archivadasOEliminadas: number;
  toInsert: number;
  toUpdate: number;
  toArchiveOrDelete: number;
  unchanged: number;
  hasChanges: boolean;
  sampleLabels: string[];
}

export interface TableDiffResult<T extends SqlRowRecord = SqlRowRecord> {
  tableName: string;
  labelEs: string;
  counts: {
    unchanged: number;
    new: number;
    updated: number;
    archived: number;
    removedMn: number;
  };
  items: ClassifiedRowDiff<T>[];
  summary: SyncDiffSummary;
}

export interface ComputeTableDiffOptions {
  /** Columnas a comparar explícitamente (por defecto: unión de columnas relevantes excluyendo created_at/updated_at). */
  compareColumns?: readonly string[];
  /** Identificadores de registros padre sincronizados para detectar bajas en tablas M:N puras. */
  scopedParentFilter?: {
    column: string;
    allowedValues: ReadonlySet<string>;
  };
  /** Resuelve etiquetas humanas legibles sin UUIDs para sampleLabels en UI. */
  labelResolver?: (row: SqlRowRecord, tableName: string) => string | null;
}

export interface BuildTableStatementsOptions {
  /** Orden explícito de columnas para el INSERT. */
  columns?: readonly string[];
  /** Incluir actualización explícita de filas archivadas (`deleted_at IS NOT NULL`). Default: true. */
  includeArchivedRows?: boolean;
  /** Incluir `DELETE FROM` acotado para vínculos eliminados en tablas M:N puras. Default: true. */
  includeRemovedMnLinks?: boolean;
  /** Batch size máximo para agrupar inserts activos homogéneos. Default: 1 (1 fila o agrupado). */
  batchSize?: number;
}

export interface TableSyncStatementsResult {
  tableName: string;
  statements: string[];
  sqlBlock: string;
  warnings: string[];
  counts: {
    inserts: number;
    updatesById: number;
    archivedUpserts: number;
    deletedMnLinks: number;
  };
}

/**
 * Tablas soft-delete hijas de `01_creacion.sql` que NO poseen columna `updated_at`.
 */
const TABLES_WITHOUT_UPDATED_AT = new Set<string>([
  'client_organization_access',
  'turnos_por_sitio',
  'comentarios_por_auditoria',
  'sitios_por_auditoria',
  'turnos_sitio_auditoria',
  'turnos_proceso_sitio_auditoria',
  'equipo_auditor_proceso_sitio',
  'norma_auditor',
  'sector_iaf_auditor',
  'subsector_iaf_auditor',
  'sector_iaf_experto',
  'subsector_iaf_experto',
  'requisitos_por_proceso',
  'equipo_auditor',
]);

const VOLATILE_DIFF_COLUMNS = new Set<string>(['created_at', 'updated_at']);

const UUID_LIKE_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL_CHAR_REGEX = /[\u0000-\u001f\\]/;
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_ONLY_REGEX = /^\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

export function tableSupportsUpdatedAt(tableName: string): boolean {
  return !TABLES_WITHOUT_UPDATED_AT.has(tableName);
}

export function tableSupportsDeleteReason(tableName: string): boolean {
  const meta = getSyncTableMetadata(tableName);
  return meta?.kind === 'soft_delete_core';
}

function escapeSqlSingleQuotes(text: string): string {
  return text.replace(/'/g, "''");
}

/**
 * Evita emitir la secuencia literal `$$` para no alterar parsers ni aserciones de delimitadores pares.
 */
function neutralizeDollarQuotesInQuotedSql(quotedSql: string, isEString: boolean): string {
  if (!quotedSql.includes('$$')) return quotedSql;
  const separator = isEString ? "$' || E'$" : "$' || '$";
  let result = quotedSql;
  while (result.includes('$$')) {
    result = result.split('$$').join(separator);
  }
  return result;
}

function formatStandardQuotedText(text: string): string {
  const clean = text.replace(/\u0000/g, '');
  if (!CONTROL_CHAR_REGEX.test(clean)) {
    return neutralizeDollarQuotesInQuotedSql(`'${escapeSqlSingleQuotes(clean)}'`, false);
  }

  let escaped = '';
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (ch === '\\') {
      escaped += '\\\\';
    } else if (ch === "'") {
      escaped += "''";
    } else if (ch === '\n') {
      escaped += '\\n';
    } else if (ch === '\r') {
      escaped += '\\r';
    } else if (ch === '\t') {
      escaped += '\\t';
    } else {
      const code = ch.charCodeAt(0);
      if (code < 0x20) {
        escaped += `\\x${code.toString(16).padStart(2, '0')}`;
      } else {
        escaped += ch;
      }
    }
  }
  return neutralizeDollarQuotesInQuotedSql(`E'${escaped}'`, true);
}

function inferLiteralDataType(
  value: unknown,
  options?: FormatSqlLiteralOptions
): SqlLiteralDataType {
  if (options?.dataType) return options.dataType;
  const col = options?.columnName ?? '';
  const meta = options?.meta;

  if (meta?.ltreeColumns?.includes(col)) return 'ltree';
  if (meta?.jsonColumns?.includes(col)) return 'jsonb';
  if (meta?.booleanColumns?.includes(col)) return 'boolean';
  if (meta?.numberColumns?.includes(col)) return 'number';
  if (meta?.dateColumns?.includes(col)) return 'date';

  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (value instanceof Date) return 'timestamptz';
  if (typeof value === 'object' && value !== null) return 'jsonb';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if ((col === 'id' || col.startsWith('id_') || col === 'deleted_by' || col === 'aprobado_por') && UUID_LIKE_REGEX.test(trimmed)) {
      return 'uuid';
    }
    if ((col === 'hora_entrada' || col === 'hora_salida') && TIME_ONLY_REGEX.test(trimmed)) {
      return 'time';
    }
  }
  return 'text';
}

/**
 * Serializa cualquier valor JavaScript a un literal SQL PostgreSQL válido, determinista
 * y libre de `$$` desbalanceados.
 */
export function formatSqlLiteral(
  value: unknown,
  options?: FormatSqlLiteralOptions
): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  const dataType = inferLiteralDataType(value, options);

  if (dataType === 'boolean') {
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (typeof value === 'string') {
      const lower = value.trim().toLowerCase();
      if (lower === 'true' || lower === 't' || lower === '1') return 'TRUE';
      if (lower === 'false' || lower === 'f' || lower === '0') return 'FALSE';
    }
    if (typeof value === 'number') {
      return value !== 0 ? 'TRUE' : 'FALSE';
    }
    return 'NULL';
  }

  if (dataType === 'number') {
    const num = typeof value === 'number' ? value : Number(String(value).trim());
    if (!Number.isFinite(num)) return 'NULL';
    return String(num);
  }

  if (dataType === 'ltree') {
    const raw = String(value).trim();
    if (!raw) return 'NULL';
    return `${formatStandardQuotedText(raw)}::ltree`;
  }

  if (dataType === 'jsonb') {
    let serialized: string;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return 'NULL';
      try {
        serialized = JSON.stringify(JSON.parse(trimmed));
      } catch {
        serialized = JSON.stringify(value);
      }
    } else {
      serialized = JSON.stringify(value);
    }
    return `${formatStandardQuotedText(serialized)}::jsonb`;
  }

  if (dataType === 'date') {
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return 'NULL';
      return formatStandardQuotedText(value.toISOString().slice(0, 10));
    }
    const text = String(value).trim();
    if (!text) return 'NULL';
    if (DATE_ONLY_REGEX.test(text)) {
      return formatStandardQuotedText(text);
    }
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) {
      return formatStandardQuotedText(parsed.toISOString().slice(0, 10));
    }
    return formatStandardQuotedText(text);
  }

  if (dataType === 'timestamptz' || value instanceof Date) {
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return 'NULL';
      return formatStandardQuotedText(value.toISOString());
    }
    const text = String(value).trim();
    return text ? formatStandardQuotedText(text) : 'NULL';
  }

  if (dataType === 'uuid') {
    const text = String(value).trim();
    return text ? formatStandardQuotedText(text) : 'NULL';
  }

  if (dataType === 'time') {
    const text = String(value).trim();
    return text ? formatStandardQuotedText(text) : 'NULL';
  }

  return formatStandardQuotedText(String(value));
}

function getStringField(row: SqlRowRecord, key: string): string {
  const val = row[key];
  return typeof val === 'string' ? val.trim() : val === null || val === undefined ? '' : String(val).trim();
}

function getNumberField(row: SqlRowRecord, key: string): number {
  const val = row[key];
  const n = typeof val === 'number' ? val : Number(val);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Ordena filas de una misma tabla respetando:
 * - Auto-referencias (`requisito.id_requisito_padre`, `programa_auditoria.id_ciclo_origen`) mediante toposort BFS.
 * - Versiones (`organizacion_version`, `certificado_version`) con `version_numero ASC` y `es_version_actual ASC`.
 * - Convención Sitio 0 (`sitio` por `numero_sitio ASC`).
 * - Secuencia cronológica (`auditoria_fecha` por `numero_secuencia ASC`).
 */
export function sortRowsForTopologicalInsert<T extends SqlRowRecord>(
  tableName: string,
  rows: readonly T[],
  metaOverride?: SqlSyncTableMetadata | null
): T[] {
  const meta = metaOverride ?? getSyncTableMetadata(tableName);
  const copy = [...rows];

  if (tableName === 'organizacion_version' || tableName === 'certificado_version') {
    const parentKey = tableName === 'organizacion_version' ? 'id_organizacion' : 'id_certificado';
    return copy.sort((a, b) => {
      const pCmp = getStringField(a, parentKey).localeCompare(getStringField(b, parentKey));
      if (pCmp !== 0) return pCmp;
      const actA = a.es_version_actual === true ? 1 : 0;
      const actB = b.es_version_actual === true ? 1 : 0;
      if (actA !== actB) return actA - actB;
      return getNumberField(a, 'version_numero') - getNumberField(b, 'version_numero');
    });
  }

  if (tableName === 'sitio') {
    return copy.sort((a, b) => {
      const cCmp = getStringField(a, 'id_certificado_version').localeCompare(
        getStringField(b, 'id_certificado_version')
      );
      if (cCmp !== 0) return cCmp;
      return getNumberField(a, 'numero_sitio') - getNumberField(b, 'numero_sitio');
    });
  }

  if (tableName === 'auditoria_fecha') {
    return copy.sort((a, b) => {
      const aCmp = getStringField(a, 'id_auditoria').localeCompare(getStringField(b, 'id_auditoria'));
      if (aCmp !== 0) return aCmp;
      return getNumberField(a, 'numero_secuencia') - getNumberField(b, 'numero_secuencia');
    });
  }

  const selfCol = meta?.selfReferentialColumn;
  if (!selfCol || copy.length <= 1) {
    return copy;
  }

  // Topological sort BFS para árboles auto-referenciales (`requisito`, `programa_auditoria`)
  const rowById = new Map<string, T>();
  const childrenByParent = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  const originalIndex = new Map<string, number>();

  copy.forEach((row, idx) => {
    const id = getStringField(row, 'id') || `__idx_${idx}`;
    rowById.set(id, row);
    originalIndex.set(id, idx);
    inDegree.set(id, 0);
  });

  for (const [id, row] of rowById.entries()) {
    const parentId = getStringField(row, selfCol);
    if (parentId && parentId !== id && rowById.has(parentId)) {
      inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
      const list = childrenByParent.get(parentId) ?? [];
      list.push(id);
      childrenByParent.set(parentId, list);
    }
  }

  const compareTie = (idA: string, idB: string): number => {
    const rA = rowById.get(idA)!;
    const rB = rowById.get(idB)!;
    if (tableName === 'requisito') {
      const nivDiff = getNumberField(rA, 'nivel') - getNumberField(rB, 'nivel');
      if (nivDiff !== 0) return nivDiff;
      const rutaCmp = getStringField(rA, 'ruta_materializada').localeCompare(
        getStringField(rB, 'ruta_materializada')
      );
      if (rutaCmp !== 0) return rutaCmp;
    }
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

  // En caso extremo de ciclo residual, anexar restantes en orden determinista
  if (orderedIds.length < copy.length) {
    const remaining = Array.from(rowById.keys())
      .filter((id) => !emitted.has(id))
      .sort(compareTie);
    orderedIds.push(...remaining);
  }

  return orderedIds.map((id) => rowById.get(id)!);
}

function normalizeComparableValue(
  value: unknown,
  columnName: string,
  meta: SqlSyncTableMetadata | null
): string {
  if (value === null || value === undefined) return '__NULL__';

  if (meta?.booleanColumns?.includes(columnName) || typeof value === 'boolean') {
    if (value === true || value === 'true' || value === 't' || value === 1) return 'bool:true';
    if (value === false || value === 'false' || value === 'f' || value === 0) return 'bool:false';
  }

  if (meta?.numberColumns?.includes(columnName) || typeof value === 'number') {
    const n = typeof value === 'number' ? value : Number(String(value).trim());
    if (Number.isFinite(n)) return `num:${n}`;
  }

  if (meta?.dateColumns?.includes(columnName)) {
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? '__NULL__' : `date:${value.toISOString().slice(0, 10)}`;
    }
    const trimmed = String(value).trim();
    if (!trimmed) return '__NULL__';
    if (DATE_ONLY_REGEX.test(trimmed)) return `date:${trimmed}`;
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return `date:${parsed.toISOString().slice(0, 10)}`;
  }

  if (meta?.jsonColumns?.includes(columnName) || typeof value === 'object') {
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? '__NULL__' : `ts:${value.toISOString()}`;
    }
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      return `json:${JSON.stringify(parsed)}`;
    } catch {
      return `str:${String(value).trim()}`;
    }
  }

  if (columnName === 'deleted_at') {
    const trimmed = String(value).trim();
    if (!trimmed) return '__NULL__';
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? `str:${trimmed}` : `ts:${parsed.toISOString()}`;
  }

  return `str:${String(value).trim()}`;
}

function buildCompositeTupleKey(
  row: SqlRowRecord,
  columns: readonly string[],
  meta: SqlSyncTableMetadata | null
): string | null {
  const parts: string[] = [];
  for (const col of columns) {
    const raw = row[col];
    if (raw === null || raw === undefined || String(raw).trim() === '') {
      return null;
    }
    const norm = normalizeComparableValue(raw, col, meta);
    parts.push(norm.toLowerCase());
  }
  return parts.join('|');
}

function resolveZeroUuidDisplayLabel(
  row: SqlRowRecord | undefined,
  meta: SqlSyncTableMetadata | null,
  tableName: string,
  customResolver?: (row: SqlRowRecord, tableName: string) => string | null
): string {
  if (!row) return `${meta?.labelEs ?? tableName} (registro)`;

  if (customResolver) {
    const custom = customResolver(row, tableName);
    if (custom && custom.trim() && !containsRawUuid(custom)) {
      return custom.trim().slice(0, 90);
    }
  }

  const candidates = meta?.displayLabelColumns ?? [];
  const cleanParts: string[] = [];
  for (const col of candidates) {
    const raw = row[col];
    if (raw === null || raw === undefined) continue;
    const text =
      raw instanceof Date
        ? Number.isNaN(raw.getTime())
          ? ''
          : raw.toISOString().slice(0, 10)
        : String(raw).replace(/\s+/g, ' ').trim();
    if (!text || containsRawUuid(text)) continue;
    cleanParts.push(text);
  }

  if (cleanParts.length > 0) {
    return cleanParts.join(' · ').slice(0, 90);
  }

  return `${meta?.labelEs ?? tableName} (registro)`;
}

function uniqueKeyColumnsForMutationCheck(meta: SqlSyncTableMetadata | null): Set<string> {
  const cols = new Set<string>();
  if (!meta) return cols;
  for (const keyTuple of meta.naturalKeys) {
    for (const col of keyTuple) {
      if (col !== 'id') cols.add(col);
    }
  }
  return cols;
}

/**
 * Compara las filas vivas de PostgreSQL contra los registros ya presentes en el archivo SQL
 * y clasifica diferencias (`unchanged`, `new`, `updated`, `archived`, `removed_mn`) generando
 * un resumen **Zero-UUID** en español.
 */
export function computeTableSyncDiff<T extends SqlRowRecord>(
  tableName: string,
  liveRows: readonly T[],
  existingSeedRows: readonly T[],
  options?: ComputeTableDiffOptions
): TableDiffResult<T> {
  const meta = getSyncTableMetadata(tableName);
  const labelEs = meta?.labelEs ?? tableName;
  const pkCols = meta?.pkColumns ?? ['id'];
  const uniqueMutationCols = uniqueKeyColumnsForMutationCheck(meta);

  const existingByPk = new Map<string, T>();
  const existingByNatural = new Map<string, T>();
  const matchedExistingRefs = new Set<T>();

  for (const row of existingSeedRows) {
    const pkKey = buildCompositeTupleKey(row, pkCols, meta);
    if (pkKey && !existingByPk.has(pkKey)) {
      existingByPk.set(pkKey, row);
    }
    if (meta) {
      for (const nkCols of meta.naturalKeys) {
        const nk = buildCompositeTupleKey(row, nkCols, meta);
        if (nk && !existingByNatural.has(nk)) {
          existingByNatural.set(nk, row);
        }
      }
    }
  }

  const items: ClassifiedRowDiff<T>[] = [];
  let unchangedCount = 0;
  let newCount = 0;
  let updatedCount = 0;
  let archivedCount = 0;
  let removedMnCount = 0;

  for (const liveRow of liveRows) {
    let existingRow: T | undefined;
    let matchedBy: 'pk' | 'natural_key' | 'none' = 'none';

    const pkKey = buildCompositeTupleKey(liveRow, pkCols, meta);
    if (pkKey && existingByPk.has(pkKey)) {
      existingRow = existingByPk.get(pkKey);
      matchedBy = 'pk';
    } else if (meta) {
      for (const nkCols of meta.naturalKeys) {
        const nk = buildCompositeTupleKey(liveRow, nkCols, meta);
        if (nk && existingByNatural.has(nk)) {
          existingRow = existingByNatural.get(nk);
          matchedBy = 'natural_key';
          break;
        }
      }
    }

    const displayLabel = resolveZeroUuidDisplayLabel(
      liveRow,
      meta,
      tableName,
      options?.labelResolver
    );
    const isArchived = liveRow.deleted_at !== null && liveRow.deleted_at !== undefined;

    if (!existingRow) {
      if (isArchived) {
        archivedCount += 1;
        items.push({
          status: 'archived',
          liveRow,
          changedColumns: [],
          matchedBy: 'none',
          mutatedUniqueKey: false,
          displayLabel,
        });
      } else {
        newCount += 1;
        items.push({
          status: 'new',
          liveRow,
          changedColumns: [],
          matchedBy: 'none',
          mutatedUniqueKey: false,
          displayLabel,
        });
      }
      continue;
    }

    matchedExistingRefs.add(existingRow);

    const candidateCols = options?.compareColumns
      ? [...options.compareColumns]
      : Array.from(
          new Set([...Object.keys(liveRow), ...Object.keys(existingRow)])
        ).filter((col) => !VOLATILE_DIFF_COLUMNS.has(col));

    const changedColumns: string[] = [];
    for (const col of candidateCols) {
      // Si empató por natural_key y el seed original no traía id explícito, no marcar `id` como cambio falso
      if (col === 'id' && matchedBy === 'natural_key' && (existingRow.id === undefined || existingRow.id === null)) {
        continue;
      }
      const normLive = normalizeComparableValue(liveRow[col], col, meta);
      const normExisting = normalizeComparableValue(existingRow[col], col, meta);
      if (normLive !== normExisting) {
        changedColumns.push(col);
      }
    }

    const wasArchived = existingRow.deleted_at !== null && existingRow.deleted_at !== undefined;
    const mutatedUniqueKey =
      matchedBy === 'pk' && changedColumns.some((col) => uniqueMutationCols.has(col));

    if (changedColumns.length === 0) {
      unchangedCount += 1;
      items.push({
        status: 'unchanged',
        liveRow,
        existingRow,
        changedColumns: [],
        matchedBy,
        mutatedUniqueKey: false,
        displayLabel,
      });
    } else if (isArchived && !wasArchived) {
      archivedCount += 1;
      items.push({
        status: 'archived',
        liveRow,
        existingRow,
        changedColumns,
        matchedBy,
        mutatedUniqueKey,
        displayLabel,
      });
    } else {
      updatedCount += 1;
      items.push({
        status: 'updated',
        liveRow,
        existingRow,
        changedColumns,
        matchedBy,
        mutatedUniqueKey,
        displayLabel,
      });
    }
  }

  // Detectar bajas explícitas únicamente en tablas de enlace M:N puras
  if (meta?.kind === 'pure_mn_link') {
    for (const existingRow of existingSeedRows) {
      if (matchedExistingRefs.has(existingRow)) continue;
      if (options?.scopedParentFilter) {
        const parentVal = getStringField(existingRow, options.scopedParentFilter.column);
        if (!options.scopedParentFilter.allowedValues.has(parentVal)) {
          continue;
        }
      }
      removedMnCount += 1;
      items.push({
        status: 'removed_mn',
        existingRow,
        changedColumns: [],
        matchedBy: 'pk',
        mutatedUniqueKey: false,
        displayLabel: resolveZeroUuidDisplayLabel(
          existingRow,
          meta,
          tableName,
          options?.labelResolver
        ),
      });
    }
  }

  const sampleLabels: string[] = [];
  for (const item of items) {
    if (item.status === 'unchanged') continue;
    if (!sampleLabels.includes(item.displayLabel)) {
      sampleLabels.push(item.displayLabel);
    }
    if (sampleLabels.length >= 5) break;
  }

  const archivadasOEliminadas = archivedCount + removedMnCount;
  const summary: SyncDiffSummary = {
    table: tableName,
    tableLabelEs: labelEs,
    sinCambios: unchangedCount,
    nuevas: newCount,
    modificadas: updatedCount,
    archivadasOEliminadas,
    toInsert: newCount,
    toUpdate: updatedCount,
    toArchiveOrDelete: archivadasOEliminadas,
    unchanged: unchangedCount,
    hasChanges: newCount + updatedCount + archivadasOEliminadas > 0,
    sampleLabels,
  };

  return {
    tableName,
    labelEs,
    counts: {
      unchanged: unchangedCount,
      new: newCount,
      updated: updatedCount,
      archived: archivedCount,
      removedMn: removedMnCount,
    },
    items,
    summary,
  };
}

function extractConflictColumnNames(conflictClause: string): Set<string> {
  const cols = new Set<string>();
  const parenStart = conflictClause.indexOf('(');
  if (parenStart === -1) return cols;

  // Extraer contenido balanceado del primer bloque `(...)` antes de `WHERE`
  let depth = 0;
  let inside = '';
  for (let i = parenStart; i < conflictClause.length; i += 1) {
    const ch = conflictClause[i];
    if (ch === '(') {
      depth += 1;
      if (depth === 1) continue;
    } else if (ch === ')') {
      depth -= 1;
      if (depth === 0) break;
    }
    if (depth >= 1) inside += ch;
  }

  for (const expr of inside.split(',')) {
    const identMatches = expr.match(/\b[a-z_][a-z0-9_]*\b/gi) ?? [];
    for (const ident of identMatches) {
      const lower = ident.toLowerCase();
      if (lower === 'lower' || lower === 'upper' || lower === 'trim') continue;
      cols.add(lower);
    }
  }
  return cols;
}

function resolveInsertColumns(
  rows: readonly SqlRowRecord[],
  meta: SqlSyncTableMetadata | null,
  explicitColumns?: readonly string[]
): string[] {
  const excluded = new Set(meta?.excludedInsertColumns ?? []);
  excluded.add('created_at');
  excluded.add('updated_at');

  if (explicitColumns && explicitColumns.length > 0) {
    return explicitColumns.filter((c) => !excluded.has(c));
  }

  const colSet = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!excluded.has(key)) colSet.add(key);
    }
  }
  return Array.from(colSet);
}

function buildUpdateSetClausesForUpsert(
  tableName: string,
  insertCols: readonly string[],
  conflictCols: ReadonlySet<string>,
  meta: SqlSyncTableMetadata | null,
  mode: 'active' | 'archived'
): string[] {
  const sets: string[] = [];

  for (const col of insertCols) {
    if (col === 'id' || conflictCols.has(col)) continue;
    if (col === 'deleted_at' || col === 'deleted_by' || col === 'delete_reason') continue;
    sets.push(`${col} = EXCLUDED.${col}`);
  }

  if (meta && (meta.kind === 'soft_delete_core' || meta.kind === 'soft_delete_child')) {
    const colSet = new Set(insertCols);
    if (mode === 'active') {
      sets.push('deleted_at = NULL');
      sets.push('deleted_by = NULL');
      if (tableSupportsDeleteReason(tableName)) {
        sets.push('delete_reason = NULL');
      }
    } else {
      sets.push(colSet.has('deleted_at') ? 'deleted_at = EXCLUDED.deleted_at' : 'deleted_at = NULL');
      sets.push(colSet.has('deleted_by') ? 'deleted_by = EXCLUDED.deleted_by' : 'deleted_by = NULL');
      if (tableSupportsDeleteReason(tableName)) {
        sets.push(
          colSet.has('delete_reason') ? 'delete_reason = EXCLUDED.delete_reason' : 'delete_reason = NULL'
        );
      }
    }
  }

  if (tableSupportsUpdatedAt(tableName)) {
    sets.push('updated_at = NOW()');
  }

  return sets;
}

function buildInsertStatementForRows(
  tableName: string,
  rows: readonly SqlRowRecord[],
  cols: readonly string[],
  conflictClause: string,
  meta: SqlSyncTableMetadata | null,
  mode: 'active' | 'archived' | 'mn'
): string {
  const valuesSql = rows
    .map((row) => {
      const literals = cols.map((col) =>
        formatSqlLiteral(row[col], { columnName: col, meta })
      );
      return `    (${literals.join(', ')})`;
    })
    .join(',\n');

  const header = `INSERT INTO public.${tableName} (${cols.join(', ')}) VALUES\n${valuesSql}`;

  if (mode === 'mn') {
    return `${header}\nON CONFLICT ${conflictClause} DO NOTHING;`;
  }

  const conflictCols = extractConflictColumnNames(conflictClause);
  const setClauses = buildUpdateSetClausesForUpsert(tableName, cols, conflictCols, meta, mode);
  if (setClauses.length === 0) {
    return `${header}\nON CONFLICT ${conflictClause} DO NOTHING;`;
  }

  return `${header}\nON CONFLICT ${conflictClause} DO UPDATE SET\n    ${setClauses.join(',\n    ')};`;
}

function buildSequentialVersionUpsertDoBlock(
  tableName: 'certificado_version' | 'organizacion_version',
  row: SqlRowRecord,
  cols: readonly string[],
  meta: SqlSyncTableMetadata | null,
  mode: 'active' | 'archived'
): string {
  const parentCol = tableName === 'certificado_version' ? 'id_certificado' : 'id_organizacion';
  const idVal = row.id;
  const parentVal = row[parentCol];
  const verVal = row.version_numero;

  const updateSetLines: string[] = [];
  for (const col of cols) {
    if (col === 'id' || col === parentCol || col === 'version_numero') continue;
    if (col === 'deleted_at' || col === 'deleted_by' || col === 'delete_reason') continue;
    updateSetLines.push(
      `${col} = ${formatSqlLiteral(row[col], { columnName: col, meta })}`
    );
  }
  if (mode === 'active') {
    updateSetLines.push('deleted_at = NULL', 'deleted_by = NULL');
    if (tableSupportsDeleteReason(tableName)) {
      updateSetLines.push('delete_reason = NULL');
    }
  } else {
    updateSetLines.push(
      `deleted_at = ${formatSqlLiteral(row.deleted_at ?? null, { columnName: 'deleted_at', meta })}`,
      `deleted_by = ${formatSqlLiteral(row.deleted_by ?? null, { columnName: 'deleted_by', meta })}`
    );
    if (tableSupportsDeleteReason(tableName)) {
      updateSetLines.push(
        `delete_reason = ${formatSqlLiteral(row.delete_reason ?? null, { columnName: 'delete_reason', meta })}`
      );
    }
  }
  if (tableSupportsUpdatedAt(tableName)) {
    updateSetLines.push('updated_at = NOW()');
  }

  const insertLiterals = cols.map((col) =>
    formatSqlLiteral(row[col], { columnName: col, meta })
  );
  const insertStmt = `INSERT INTO public.${tableName} (${cols.join(', ')}) VALUES\n            (${insertLiterals.join(', ')});`;

  const branches: string[] = [];
  if (idVal !== null && idVal !== undefined && String(idVal).trim() !== '') {
    const idLit = formatSqlLiteral(idVal, { columnName: 'id', dataType: 'uuid', meta });
    branches.push(
      `IF EXISTS (SELECT 1 FROM public.${tableName} WHERE id = ${idLit}) THEN\n` +
        `        UPDATE public.${tableName} SET\n` +
        `            ${updateSetLines.join(',\n            ')}\n` +
        `        WHERE id = ${idLit};`
    );
  }
  if (
    parentVal !== null &&
    parentVal !== undefined &&
    String(parentVal).trim() !== '' &&
    verVal !== null &&
    verVal !== undefined
  ) {
    const parentLit = formatSqlLiteral(parentVal, { columnName: parentCol, dataType: 'uuid', meta });
    const verLit = formatSqlLiteral(verVal, { columnName: 'version_numero', meta });
    const kw = branches.length > 0 ? 'ELSIF' : 'IF';
    const idAssign =
      idVal !== null && idVal !== undefined && String(idVal).trim() !== ''
        ? [`id = ${formatSqlLiteral(idVal, { columnName: 'id', dataType: 'uuid', meta })}`, ...updateSetLines]
        : updateSetLines;
    branches.push(
      `${kw} EXISTS (SELECT 1 FROM public.${tableName} WHERE ${parentCol} = ${parentLit} AND version_numero = ${verLit} AND deleted_at IS NULL) THEN\n` +
        `        UPDATE public.${tableName} SET\n` +
        `            ${idAssign.join(',\n            ')}\n` +
        `        WHERE ${parentCol} = ${parentLit} AND version_numero = ${verLit} AND deleted_at IS NULL;`
    );
  }

  let body: string;
  if (branches.length > 0) {
    body = `BEGIN\n    ${branches.join('\n    ')}\n    ELSE\n        ${insertStmt}\n    END IF;\nEND`;
  } else {
    body = `BEGIN\n    ${insertStmt}\nEND`;
  }

  let tag = '$fnver$';
  let suffix = 1;
  while (body.includes(tag)) {
    tag = `$fnver_${suffix}$`;
    suffix += 1;
  }

  return `DO ${tag}\n${body} ${tag};`;
}

function buildUpdateByIdStatement(
  tableName: string,
  row: SqlRowRecord,
  cols: readonly string[],
  meta: SqlSyncTableMetadata | null
): string | null {
  const idVal = row.id;
  if (idVal === null || idVal === undefined || String(idVal).trim() === '') {
    return null;
  }

  const sets: string[] = [];
  for (const col of cols) {
    if (col === 'id') continue;
    sets.push(`${col} = ${formatSqlLiteral(row[col], { columnName: col, meta })}`);
  }
  if (tableSupportsUpdatedAt(tableName)) {
    sets.push('updated_at = NOW()');
  }
  if (sets.length === 0) return null;

  return `UPDATE public.${tableName} SET\n    ${sets.join(',\n    ')}\nWHERE id = ${formatSqlLiteral(idVal, { columnName: 'id', dataType: 'uuid', meta })};`;
}

function buildDeleteMnStatement(
  tableName: string,
  row: SqlRowRecord,
  meta: SqlSyncTableMetadata
): string | null {
  if (meta.kind !== 'pure_mn_link') {
    throw new Error(
      `Operación prohibida: no se puede generar DELETE FROM en la tabla protegida "${tableName}".`
    );
  }
  const predicates: string[] = [];
  for (const pkCol of meta.pkColumns) {
    const val = row[pkCol];
    if (val === null || val === undefined || String(val).trim() === '') {
      return null;
    }
    predicates.push(`${pkCol} = ${formatSqlLiteral(val, { columnName: pkCol, meta })}`);
  }
  if (predicates.length === 0) return null;
  return `DELETE FROM public.${tableName} WHERE ${predicates.join(' AND ')};`;
}

/**
 * Construye sentencias SQL idempotentes a partir de un `TableDiffResult` o un arreglo directo de filas.
 * - Nunca emite `DELETE FROM` en tablas protegidas por `fn_prevent_hard_delete()`.
 * - Resuelve llaves únicas mutadas con `UPDATE ... WHERE id = ...` para prevenir colisiones `23505`.
 * - Maneja filas archivadas (`deleted_at IS NOT NULL`) vía `ON CONFLICT (id) DO UPDATE`.
 */
export function buildTableSyncStatements<T extends SqlRowRecord>(
  tableName: string,
  diffOrRows: TableDiffResult<T> | readonly T[],
  options?: BuildTableStatementsOptions
): TableSyncStatementsResult {
  const meta = getSyncTableMetadata(tableName);
  const warnings: string[] = [];

  if (meta?.kind === 'trigger_derived') {
    const note = `-- Tabla public.${tableName} sincronizada automáticamente por triggers de PostgreSQL (sin INSERT manual).`;
    warnings.push(
      `La tabla ${tableName} se calcula automáticamente mediante triggers y no requiere sentencias manuales.`
    );
    return {
      tableName,
      statements: [],
      sqlBlock: note,
      warnings,
      counts: { inserts: 0, updatesById: 0, archivedUpserts: 0, deletedMnLinks: 0 },
    };
  }

  const includeArchivedRows = options?.includeArchivedRows !== false;
  const includeRemovedMnLinks = options?.includeRemovedMnLinks !== false;
  const batchSize = Math.max(1, options?.batchSize ?? 100);

  let activeRowsToUpsert: T[] = [];
  let mutatedUniqueRows: T[] = [];
  let archivedRows: T[] = [];
  let removedMnRows: T[] = [];

  if (Array.isArray(diffOrRows)) {
    const sorted = sortRowsForTopologicalInsert(tableName, diffOrRows as readonly T[], meta);
    for (const row of sorted) {
      const isArchived = row.deleted_at !== null && row.deleted_at !== undefined;
      if (isArchived && meta && (meta.kind === 'soft_delete_core' || meta.kind === 'soft_delete_child')) {
        archivedRows.push(row);
      } else {
        activeRowsToUpsert.push(row);
      }
    }
  } else {
    const diff = diffOrRows as TableDiffResult<T>;
    const rawActive: T[] = [];
    for (const item of diff.items) {
      if (item.status === 'unchanged') continue;
      if (item.status === 'removed_mn') {
        if (item.existingRow) removedMnRows.push(item.existingRow);
        continue;
      }
      const row = item.liveRow;
      if (!row) continue;

      if (item.status === 'archived') {
        archivedRows.push(row);
      } else if (item.mutatedUniqueKey && item.matchedBy === 'pk') {
        mutatedUniqueRows.push(row);
      } else {
        rawActive.push(row);
      }
    }
    activeRowsToUpsert = sortRowsForTopologicalInsert(tableName, rawActive, meta);
    mutatedUniqueRows = sortRowsForTopologicalInsert(tableName, mutatedUniqueRows, meta);
    archivedRows = sortRowsForTopologicalInsert(tableName, archivedRows, meta);
  }

  const allSampleRows = [...mutatedUniqueRows, ...activeRowsToUpsert, ...archivedRows];
  const insertCols = resolveInsertColumns(allSampleRows, meta, options?.columns);

  const statements: string[] = [];
  let updatesById = 0;
  let inserts = 0;
  let archivedUpserts = 0;
  let deletedMnLinks = 0;

  // 1. Actualizaciones quirúrgicas por `id` cuando cambió una llave única natural en un registro existente
  for (const row of mutatedUniqueRows) {
    const stmt = buildUpdateByIdStatement(tableName, row, insertCols, meta);
    if (stmt) {
      statements.push(stmt);
      updatesById += 1;
    }
  }

  const isSequentialVersionTable =
    tableName === 'certificado_version' || tableName === 'organizacion_version';

  // 2. Inserciones / Upserts idempotentes para filas activas o M:N
  if (activeRowsToUpsert.length > 0 && insertCols.length > 0) {
    if (isSequentialVersionTable) {
      for (const row of activeRowsToUpsert) {
        statements.push(
          buildSequentialVersionUpsertDoBlock(tableName, row, insertCols, meta, 'active')
        );
        inserts += 1;
      }
    } else {
      const mode = meta?.kind === 'pure_mn_link' ? 'mn' : 'active';
      const conflictClause = meta?.conflictClauseActive ?? `(${(meta?.pkColumns ?? ['id']).join(', ')})`;

      for (let i = 0; i < activeRowsToUpsert.length; i += batchSize) {
        const chunk = activeRowsToUpsert.slice(i, i + batchSize);
        statements.push(
          buildInsertStatementForRows(tableName, chunk, insertCols, conflictClause, meta, mode)
        );
        inserts += chunk.length;
      }
    }
  }

  // 3. Filas archivadas lógicamente (`deleted_at IS NOT NULL`) vía ON CONFLICT (id) DO UPDATE (jamás DELETE)
  if (includeArchivedRows && archivedRows.length > 0 && insertCols.length > 0) {
    if (isSequentialVersionTable) {
      for (const row of archivedRows) {
        statements.push(
          buildSequentialVersionUpsertDoBlock(tableName, row, insertCols, meta, 'archived')
        );
        archivedUpserts += 1;
      }
    } else {
      const pkConflict = `(${(meta?.pkColumns ?? ['id']).join(', ')})`;
      for (let i = 0; i < archivedRows.length; i += batchSize) {
        const chunk = archivedRows.slice(i, i + batchSize);
        statements.push(
          buildInsertStatementForRows(tableName, chunk, insertCols, pkConflict, meta, 'archived')
        );
        archivedUpserts += chunk.length;
      }
    }
  }

  // 4. Bajas de vínculos M:N puros (`pure_mn_link` únicamente)
  if (includeRemovedMnLinks && removedMnRows.length > 0 && meta) {
    for (const row of removedMnRows) {
      const delStmt = buildDeleteMnStatement(tableName, row, meta);
      if (delStmt) {
        statements.push(delStmt);
        deletedMnLinks += 1;
      }
    }
  }

  return {
    tableName,
    statements,
    sqlBlock: statements.join('\n\n'),
    warnings,
    counts: {
      inserts,
      updatesById,
      archivedUpserts,
      deletedMnLinks,
    },
  };
}

/**
 * Valida invariante global de delimitadores `$$` balanceados sobre cualquier script SQL generado.
 */
export function hasBalancedDollarDelimiters(sqlText: string): boolean {
  const matches = sqlText.match(/\$\$/g);
  return (matches ? matches.length : 0) % 2 === 0;
}

/**
 * Helper auxiliar para listar tablas conocidas por el generador (reexportación limpia para consumidores).
 */
export function getAllGeneratorSupportedTables(): string[] {
  return Object.keys(SQL_SYNC_TABLE_METADATA);
}
