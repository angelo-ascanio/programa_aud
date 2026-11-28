import { sanitizeZeroUuidMessage } from './dbBackupCsv';
import type { SqlRowRecord, SyncDiffSummary } from './sqlSeedGenerator';
import {
  getSyncSectionSpec,
  type ResolvedSyncSelectionPlan,
  type SqlSeedBlockSpec,
  type SqlSeedTargetFile,
} from './sqlSeedSyncCatalog';
import { isValidUuid } from './zeroUuid';

export interface SeedSyncTableDiffSummary extends SyncDiffSummary {
  targetFile?: SqlSeedTargetFile;
  isFkSupport?: boolean;
}

export interface SeedSyncTargetFileStatus {
  fileName: SqlSeedTargetFile;
  relativePath: string;
  exists: boolean;
  sizeBytes: number;
  updatedAt: string | null;
  lineCount: number;
}

export interface SeedSyncTableLiveCount {
  tableName: string;
  labelEs: string;
  targetFile: SqlSeedTargetFile;
  existsInDb: boolean;
  totalRows: number;
  activeRows: number;
  archivedRows: number;
}

export interface SeedSyncCatalogResponse {
  ok: true;
  blocks: readonly SqlSeedBlockSpec[];
  files: SeedSyncTargetFileStatus[];
  tableCounts: Record<string, SeedSyncTableLiveCount>;
  generatedAt: string;
}

export interface SeedSyncTargetResult {
  targetFile: SqlSeedTargetFile;
  changed: boolean;
  valid: boolean;
  validationErrors: string[];
  warnings: string[];
  summaryByTable: SeedSyncTableDiffSummary[];
  diffSnippets: string[];
  counts: {
    tablesWithChanges: number;
    toInsert: number;
    toUpdate: number;
    toArchiveOrDelete: number;
    phaseACellUpdates?: number;
    phaseBUpdatesById?: number;
    phaseBInserts?: number;
    phaseBArchivedUpserts?: number;
    phaseBDeletedMnLinks?: number;
  };
  historicalUuidPreserved?: boolean;
  crossFileReferencesDetected?: number;
  buildNormasSeedNoteEs?: string;
}

export interface SeedSyncPreviewResponse {
  ok: true;
  plan: ResolvedSyncSelectionPlan;
  targetResults: SeedSyncTargetResult[];
  summaryByTable: SeedSyncTableDiffSummary[];
  warnings: string[];
  previewSnippets: string[];
  hasChanges: boolean;
  canApply: boolean;
}

export interface SeedSyncUpdatedFileInfo {
  fileName: SqlSeedTargetFile;
  relativePath: string;
  written: boolean;
  changed: boolean;
  sizeBytes: number;
  tablesChanged: number;
}

export interface SeedSyncApplyResponse {
  ok: true;
  plan: ResolvedSyncSelectionPlan;
  updatedFiles: SeedSyncUpdatedFileInfo[];
  summaryByTable: SeedSyncTableDiffSummary[];
  warnings: string[];
  appliedAt: string;
}

export interface DatabaseSeedSyncState {
  catalog: SeedSyncCatalogResponse | null;
  loadingCatalog: boolean;
  selectedSectionIds: string[];
  includeFkSupport: boolean;
  analyzing: boolean;
  applying: boolean;
  previewResult: SeedSyncPreviewResponse | null;
  applyResult: SeedSyncApplyResponse | null;
  error: string | null;
}

export function createInitialDatabaseSeedSyncState(): DatabaseSeedSyncState {
  return {
    catalog: null,
    loadingCatalog: false,
    selectedSectionIds: [],
    includeFkSupport: true,
    analyzing: false,
    applying: false,
    previewResult: null,
    applyResult: null,
    error: null,
  };
}

export type SeedSyncPayloadValidationResult =
  | {
      ok: true;
      selectedSectionIds: string[];
      includeFkSupport: boolean;
    }
  | {
      ok: false;
      error: string;
    };

/**
 * Valida y normaliza la carga útil `{ selectedSectionIds, includeFkSupport }`
 * antes de resolver el plan topológico de sincronización SQL.
 */
export function validateSeedSyncRequestPayload(rawBody: unknown): SeedSyncPayloadValidationResult {
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return {
      ok: false,
      error: 'Solicitud inválida: debes enviar la lista de secciones SQL a sincronizar.',
    };
  }

  const candidate = rawBody as {
    selectedSectionIds?: unknown;
    includeFkSupport?: unknown;
  };

  if (!Array.isArray(candidate.selectedSectionIds)) {
    return {
      ok: false,
      error: 'Debes enviar el arreglo "selectedSectionIds" con al menos una sección válida.',
    };
  }

  if (
    candidate.includeFkSupport !== undefined &&
    typeof candidate.includeFkSupport !== 'boolean'
  ) {
    return {
      ok: false,
      error: 'El parámetro "includeFkSupport" debe ser booleano (true o false).',
    };
  }

  const normalizedIds: string[] = [];
  const seen = new Set<string>();
  const invalidIds: string[] = [];

  for (const rawItem of candidate.selectedSectionIds) {
    if (typeof rawItem !== 'string') {
      return {
        ok: false,
        error: 'Todos los identificadores en "selectedSectionIds" deben ser texto válido.',
      };
    }
    const trimmed = rawItem.trim();
    if (!trimmed) continue;
    if (!getSyncSectionSpec(trimmed)) {
      invalidIds.push(trimmed);
      continue;
    }
    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      normalizedIds.push(trimmed);
    }
  }

  if (invalidIds.length > 0) {
    return {
      ok: false,
      error: sanitizeZeroUuidMessage(
        `Sección(es) de sincronización SQL no reconocida(s): ${invalidIds.join(', ')}.`
      ),
    };
  }

  if (normalizedIds.length === 0) {
    return {
      ok: false,
      error: 'Selecciona al menos una sección operativa para analizar o sincronizar.',
    };
  }

  return {
    ok: true,
    selectedSectionIds: normalizedIds,
    includeFkSupport: candidate.includeFkSupport ?? true,
  };
}

function splitTopLevelSqlTuples(valuesBody: string): string[] {
  const tuples: string[] = [];
  let inSingleQuote = false;
  let depth = 0;
  let tupleStart = -1;

  for (let i = 0; i < valuesBody.length; i += 1) {
    const ch = valuesBody[i];
    if (inSingleQuote) {
      if (ch === "'") {
        if (valuesBody[i + 1] === "'") {
          i += 1;
        } else {
          inSingleQuote = false;
        }
      }
      continue;
    }

    if (ch === "'") {
      inSingleQuote = true;
      continue;
    }

    if (ch === '-' && valuesBody[i + 1] === '-') {
      const nl = valuesBody.indexOf('\n', i);
      if (nl === -1) break;
      i = nl;
      continue;
    }

    if (ch === '(') {
      if (depth === 0) tupleStart = i + 1;
      depth += 1;
    } else if (ch === ')') {
      depth -= 1;
      if (depth === 0 && tupleStart !== -1) {
        tuples.push(valuesBody.slice(tupleStart, i));
        tupleStart = -1;
      }
    }
  }

  return tuples;
}

function splitTupleValues(tupleBody: string): string[] {
  const cells: string[] = [];
  let inSingleQuote = false;
  let parenDepth = 0;
  let cellStart = 0;

  for (let i = 0; i < tupleBody.length; i += 1) {
    const ch = tupleBody[i];
    if (inSingleQuote) {
      if (ch === "'") {
        if (tupleBody[i + 1] === "'") {
          i += 1;
        } else {
          inSingleQuote = false;
        }
      }
      continue;
    }

    if (ch === "'") {
      inSingleQuote = true;
      continue;
    }

    if (ch === '(') {
      parenDepth += 1;
      continue;
    }
    if (ch === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
      continue;
    }

    if (ch === ',' && parenDepth === 0) {
      cells.push(tupleBody.slice(cellStart, i).trim());
      cellStart = i + 1;
    }
  }

  cells.push(tupleBody.slice(cellStart).trim());
  return cells;
}

function extractSqlStringLiteralUuid(cellSql: string): string | null {
  const cleaned = cellSql.replace(/::[a-zA-Z0-9_.\s]+$/g, '').trim();
  const match = cleaned.match(/^'([^']+)'$/);
  if (!match) return null;
  const candidate = match[1].trim().toLowerCase();
  if (!isValidUuid(candidate)) return null;
  if (candidate === '00000000-0000-0000-0000-000000000000') return null;
  return candidate;
}

/**
 * Extrae los UUIDs reales de usuarios sembrados en `public/supabase/queries/05_usuarios.sql`
 * (`INSERT INTO auth.users` e `INSERT INTO public.profiles`) ignorando `instance_id` nulo.
 */
export function extractSeededUserIdsFrom05Sql(sql05Content: string): ReadonlySet<string> {
  const userIds = new Set<string>();
  const insertRegex =
    /INSERT\s+INTO\s+(?:auth\.users|(?:public\.)?profiles)\s*\(([^)]+)\)\s*VALUES\s*([\s\S]*?)(?:ON\s+CONFLICT|;)/gi;

  let match: RegExpExecArray | null = insertRegex.exec(sql05Content);
  while (match) {
    const columns = match[1]
      .split(',')
      .map((col) => col.trim().replace(/^"|"$/g, '').toLowerCase());
    const idIndex = columns.indexOf('id');

    if (idIndex !== -1) {
      const tuples = splitTopLevelSqlTuples(match[2]);
      for (const tupleBody of tuples) {
        const cells = splitTupleValues(tupleBody);
        if (idIndex < cells.length) {
          const uuid = extractSqlStringLiteralUuid(cells[idIndex]);
          if (uuid) {
            userIds.add(uuid);
          }
        }
      }
    }

    match = insertRegex.exec(sql05Content);
  }

  return userIds;
}

export interface FilteredClientAccessResult {
  rows: SqlRowRecord[];
  excludedCount: number;
  clearedApproverCount: number;
  warnings: string[];
}

/**
 * Filtra filas de `client_organization_access` cuyo `id_usuario` no existe en
 * `05_usuarios.sql` para evitar errores FK (`23503`) al reiniciar `00 → 07`.
 * También limpia referencias opcionales `aprobado_por` fuera de `05_usuarios.sql`.
 */
export function filterClientOrganizationAccessWith05Users(
  rows: readonly SqlRowRecord[],
  seededUserIds05: ReadonlySet<string>
): FilteredClientAccessResult {
  const keptRows: SqlRowRecord[] = [];
  let excludedCount = 0;
  let clearedApproverCount = 0;

  for (const row of rows) {
    const userId =
      typeof row.id_usuario === 'string' ? row.id_usuario.trim().toLowerCase() : '';
    if (!userId || !seededUserIds05.has(userId)) {
      excludedCount += 1;
      continue;
    }

    const approverId =
      typeof row.aprobado_por === 'string' ? row.aprobado_por.trim().toLowerCase() : '';
    if (approverId && !seededUserIds05.has(approverId)) {
      clearedApproverCount += 1;
      keptRows.push({
        ...row,
        aprobado_por: null,
      });
    } else {
      keptRows.push(row);
    }
  }

  const warnings: string[] = [];
  if (excludedCount > 0) {
    warnings.push(
      `Se omitieron ${excludedCount} asignación(es) de acceso cliente (client_organization_access) en 06_datos_prueba.sql porque su usuario asociado fue creado manualmente en Supabase Auth y no existe en 05_usuarios.sql.`
    );
  }
  if (clearedApproverCount > 0) {
    warnings.push(
      `Se limpió el campo opcional aprobado_por en ${clearedApproverCount} asignación(es) de acceso cliente cuyo aprobador no está registrado en 05_usuarios.sql.`
    );
  }

  return {
    rows: keptRows,
    excludedCount,
    clearedApproverCount,
    warnings,
  };
}

export interface SeedSyncClientOptions {
  fetchFn?: typeof fetch;
  getAccessToken?: () => Promise<string | null>;
}

async function defaultGetAccessToken(): Promise<string | null> {
  const { supabase } = await import('./supabase');
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function getAdminAuthHeaders(
  options?: SeedSyncClientOptions
): Promise<Record<string, string>> {
  const token = await (options?.getAccessToken ?? defaultGetAccessToken)();
  if (!token || !token.trim()) {
    throw new Error('Tu sesión expiró. Inicia sesión nuevamente como Administrador.');
  }
  return {
    Authorization: `Bearer ${token.trim()}`,
  };
}

async function parseJsonResponse<T>(
  res: Response,
  fallbackError: string
): Promise<T> {
  const payload = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
  } & Partial<T>;

  if (!res.ok || !payload.ok) {
    throw new Error(sanitizeZeroUuidMessage(payload.error || fallbackError));
  }

  return payload as T;
}

export async function fetchSeedSyncCatalog(
  options?: SeedSyncClientOptions
): Promise<SeedSyncCatalogResponse> {
  const headers = await getAdminAuthHeaders(options);
  const fetchImpl = options?.fetchFn ?? globalThis.fetch;
  const res = await fetchImpl('/api/admin/db/seed-sync/catalog', {
    method: 'GET',
    headers,
  });
  return parseJsonResponse<SeedSyncCatalogResponse>(
    res,
    'No se pudo cargar el catálogo de sincronización SQL.'
  );
}

export async function previewSqlSeedSync(
  selectedSectionIds: readonly string[],
  includeFkSupport = true,
  options?: SeedSyncClientOptions
): Promise<SeedSyncPreviewResponse> {
  const authHeaders = await getAdminAuthHeaders(options);
  const fetchImpl = options?.fetchFn ?? globalThis.fetch;
  const res = await fetchImpl('/api/admin/db/seed-sync/preview', {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      selectedSectionIds: [...selectedSectionIds],
      includeFkSupport,
    }),
  });
  return parseJsonResponse<SeedSyncPreviewResponse>(
    res,
    'No se pudo analizar la vista previa de sincronización SQL.'
  );
}

export async function applySqlSeedSync(
  selectedSectionIds: readonly string[],
  includeFkSupport = true,
  options?: SeedSyncClientOptions
): Promise<SeedSyncApplyResponse> {
  const authHeaders = await getAdminAuthHeaders(options);
  const fetchImpl = options?.fetchFn ?? globalThis.fetch;
  const res = await fetchImpl('/api/admin/db/seed-sync/apply', {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      selectedSectionIds: [...selectedSectionIds],
      includeFkSupport,
    }),
  });
  return parseJsonResponse<SeedSyncApplyResponse>(
    res,
    'No se pudo aplicar la sincronización hacia los archivos SQL.'
  );
}
