import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fsSync from 'node:fs';
import zlib from 'node:zlib';
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import express from 'express';
import type { Request, Response } from 'express';
import { Client as PgClient } from 'pg';
import {
  DB_TABLES_TOPO_ORDER,
  getDbTableDefinition,
  isKnownPublicTable,
  planCsvImport,
  sanitizeZeroUuidMessage,
  serializeRowsToCsv,
  summarizeBackupBundle,
  type DbBackupBundle,
  type DbBackupSchemaColumn,
  type DbBackupSchemaConstraint,
} from './src/lib/dbBackupCsv';
import { buildZipArchive } from './src/lib/zipArchive';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadJsonFallbackConfig(filePath: string): void {
  try {
    if (!fsSync.existsSync(filePath)) return;
    const parsed = JSON.parse(fsSync.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value.trim() && !process.env[key]) {
        process.env[key] = value.trim();
      }
    }
  } catch {
    // ignore malformed optional config
  }
}

loadJsonFallbackConfig(path.resolve(__dirname, 'supabase.config.json'));
dotenv.config({ path: path.resolve(__dirname, 'supabase.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '.env'), override: true, quiet: true });

function resolvePort(): number {
  const portArgIndex = process.argv.indexOf('--port');
  if (portArgIndex !== -1 && process.argv[portArgIndex + 1]) {
    const val = Number(process.argv[portArgIndex + 1]);
    if (!isNaN(val) && val > 0) return val;
  }
  const isStartScript = process.env.npm_lifecycle_event === 'start';
  const isProd = process.env.NODE_ENV === 'production' && isStartScript;
  if (!isProd) {
    return 3000;
  }
  const envPort = Number(process.env.PORT);
  return !isNaN(envPort) && envPort > 0 ? envPort : 3000;
}

function resolveHost(): string {
  const hostArgIndex = process.argv.indexOf('--host');
  if (hostArgIndex !== -1 && process.argv[hostArgIndex + 1]) {
    return process.argv[hostArgIndex + 1];
  }
  return '0.0.0.0';
}

const PORT = resolvePort();
const HOST = resolveHost();
const QUERIES_DIR = path.resolve(__dirname, 'public', 'supabase', 'queries');
const DEFAULT_SUPABASE_URL = 'https://ufowtgmpaahyshdxlnlq.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_p8Gu4e4nS2DgPG-BqS6vAw_V_5owfv4';

interface ExecutedScript {
  file: string;
  durationMs: number;
}

function resolveSupabaseRuntimeConfig(): {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseToken: string;
  databaseKey: string;
  projectRef: string | null;
} {
  let supabaseUrl = (process.env.VITE_SUPABASE_URL || '').trim();
  if (!supabaseUrl || supabaseUrl.includes('your-project')) {
    supabaseUrl = DEFAULT_SUPABASE_URL;
  }
  let supabaseAnonKey = (process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (
    !supabaseAnonKey ||
    supabaseAnonKey.includes('your-anon') ||
    supabaseAnonKey.includes('your-publishable')
  ) {
    supabaseAnonKey = DEFAULT_SUPABASE_ANON_KEY;
  }
  const supabaseToken = (process.env.VITE_SUPABASE_TOKEN || '').trim();
  const databaseKey = (process.env.VITE_SUPABASE_DATABASE_KEY || '').trim();
  const projectRef = extractProjectRef(supabaseUrl);

  return {
    supabaseUrl,
    supabaseAnonKey,
    supabaseToken,
    databaseKey,
    projectRef,
  };
}

function extractProjectRef(supabaseUrl: string): string | null {
  try {
    const parsed = new URL(supabaseUrl.trim());
    const [ref] = parsed.hostname.split('.');
    return ref || null;
  } catch {
    return null;
  }
}

async function listOrderedSqlFiles(): Promise<string[]> {
  const entries = await fs.readdir(QUERIES_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

async function runViaManagementApi<T = Record<string, unknown>>(
  projectRef: string,
  token: string,
  sql: string
): Promise<T[]> {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    }
  );

  if (!response.ok) {
    let message = `Supabase query failed with HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { message?: string; error?: string };
      message = body.message || body.error || message;
    } catch {
      const text = await response.text().catch(() => '');
      if (text) message = text;
    }
    throw new Error(message);
  }

  const data = (await response.json().catch(() => [])) as unknown;
  return Array.isArray(data) ? (data as T[]) : [];
}

function createPgClient(projectRef: string, databaseKey: string): PgClient {
  return new PgClient({
    host: `db.${projectRef}.supabase.co`,
    port: 5432,
    user: 'postgres',
    password: databaseKey,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  });
}

async function withDbClient<T>(fn: (client: PgClient) => Promise<T>): Promise<T> {
  const { projectRef, databaseKey } = resolveSupabaseRuntimeConfig();
  if (!projectRef || !databaseKey) {
    throw new Error('Se requiere VITE_SUPABASE_DATABASE_KEY para operaciones de administración directa.');
  }
  const client = createPgClient(projectRef, databaseKey);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function withDbTransaction<T>(fn: (client: PgClient) => Promise<T>): Promise<T> {
  return withDbClient(async (client) => {
    await client.query('BEGIN');
    try {
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    }
  });
}

function quoteIdent(identifier: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(`Identificador SQL inválido.`);
  }
  return `"${identifier}"`;
}

function buildSqlLiteralFallback(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'NULL';
  }
  if (typeof value === 'object') {
    const json = JSON.stringify(value).replace(/'/g, "''");
    return `'${json}'`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function queryRows<T extends Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const { projectRef, databaseKey, supabaseToken } = resolveSupabaseRuntimeConfig();
  if (projectRef && databaseKey) {
    return withDbClient(async (client) => {
      const result = await client.query<T>(sql, params);
      return result.rows;
    });
  }
  if (projectRef && supabaseToken) {
    let interpolated = sql;
    params.forEach((val, idx) => {
      const token = `$${idx + 1}`;
      interpolated = interpolated.replaceAll(token, buildSqlLiteralFallback(val));
    });
    return runViaManagementApi<T>(projectRef, supabaseToken, interpolated);
  }
  throw new Error('Faltan credenciales de base de datos en el servidor.');
}

async function requireApprovedAdmin(
  req: Request,
  res: Response
): Promise<{ userId: string } | null> {
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const accessToken = match?.[1]?.trim() || '';

  if (!accessToken) {
    res.status(401).json({
      ok: false,
      error: 'Autenticación requerida para acceder al centro de respaldo.',
    });
    return null;
  }

  const { supabaseUrl, supabaseAnonKey } = resolveSupabaseRuntimeConfig();
  try {
    const authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!authRes.ok) {
      res.status(401).json({
        ok: false,
        error: 'Sesión inválida o expirada.',
      });
      return null;
    }

    const userData = (await authRes.json()) as { id?: string };
    const userId = typeof userData.id === 'string' ? userData.id : '';
    if (!userId) {
      res.status(401).json({
        ok: false,
        error: 'No se pudo identificar al usuario autenticado.',
      });
      return null;
    }

    const profiles = await queryRows<{ role: string; status: string }>(
      'SELECT role::text AS role, status::text AS status FROM public.profiles WHERE id = $1 LIMIT 1',
      [userId]
    );
    const profile = profiles[0];
    if (!profile || profile.role !== 'ADMIN' || profile.status !== 'APPROVED') {
      res.status(403).json({
        ok: false,
        error: 'Acceso denegado: operación reservada exclusivamente para administradores aprobados.',
      });
      return null;
    }

    return { userId };
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : 'Error verificando credenciales.';
    res.status(500).json({
      ok: false,
      error: sanitizeZeroUuidMessage(rawMsg),
    });
    return null;
  }
}

function sortSelfReferentialRowsForRestore(
  tableName: string,
  rows: ReadonlyArray<Record<string, unknown>>
): Array<Record<string, unknown>> {
  if (rows.length <= 1) return [...rows];
  if (tableName === 'requisito') {
    const byId = new Map<string, Record<string, unknown>>();
    for (const r of rows) {
      if (typeof r.id === 'string') byId.set(r.id, r);
    }
    const ordered: Array<Record<string, unknown>> = [];
    const visited = new Set<string>();
    const visit = (row: Record<string, unknown>) => {
      const id = typeof row.id === 'string' ? row.id : '';
      if (id && visited.has(id)) return;
      const parentId = typeof row.id_requisito_padre === 'string' ? row.id_requisito_padre : '';
      if (parentId && parentId !== id && byId.has(parentId) && !visited.has(parentId)) {
        visit(byId.get(parentId)!);
      }
      if (id) visited.add(id);
      ordered.push(row);
    };
    for (const r of rows) visit(r);
    return ordered;
  }
  if (tableName === 'programa_auditoria') {
    const byId = new Map<string, Record<string, unknown>>();
    for (const r of rows) {
      if (typeof r.id === 'string') byId.set(r.id, r);
    }
    const ordered: Array<Record<string, unknown>> = [];
    const visited = new Set<string>();
    const visit = (row: Record<string, unknown>) => {
      const id = typeof row.id === 'string' ? row.id : '';
      if (id && visited.has(id)) return;
      const originId = typeof row.id_ciclo_origen === 'string' ? row.id_ciclo_origen : '';
      if (originId && originId !== id && byId.has(originId) && !visited.has(originId)) {
        visit(byId.get(originId)!);
      }
      if (id) visited.add(id);
      ordered.push(row);
    };
    for (const r of rows) visit(r);
    return ordered;
  }
  return [...rows];
}

async function fetchPublicColumnsByTable(): Promise<Map<string, DbBackupSchemaColumn[]>> {
  const cols = await queryRows<{
    table_name: string;
    column_name: string;
    data_type: string;
    udt_name: string;
    is_nullable: string;
    column_default: string | null;
    ordinal_position: number;
  }>(
    `SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default, ordinal_position
     FROM information_schema.columns
     WHERE table_schema = 'public'
     ORDER BY table_name, ordinal_position`
  );
  const map = new Map<string, DbBackupSchemaColumn[]>();
  for (const col of cols) {
    if (!isKnownPublicTable(col.table_name)) continue;
    const list = map.get(col.table_name) ?? [];
    list.push(col);
    map.set(col.table_name, list);
  }
  return map;
}

async function fetchPublicConstraints(): Promise<DbBackupSchemaConstraint[]> {
  const rows = await queryRows<{
    table_name: string;
    constraint_name: string;
    constraint_type: string;
    columns: string[];
    foreign_table_name: string | null;
    foreign_columns: string[] | null;
  }>(
    `SELECT
       cls.relname AS table_name,
       con.conname AS constraint_name,
       CASE con.contype
         WHEN 'p' THEN 'PRIMARY KEY'
         WHEN 'f' THEN 'FOREIGN KEY'
         WHEN 'u' THEN 'UNIQUE'
         ELSE 'CHECK'
       END AS constraint_type,
       ARRAY(
         SELECT a.attname::text
         FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
         JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
         ORDER BY k.ord
       ) AS columns,
       fcls.relname AS foreign_table_name,
       CASE
         WHEN con.confrelid = 0 THEN NULL
         ELSE ARRAY(
           SELECT a.attname::text
           FROM unnest(con.confkey) WITH ORDINALITY AS k(attnum, ord)
           JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.attnum
           ORDER BY k.ord
         )
       END AS foreign_columns
     FROM pg_constraint con
     JOIN pg_class cls ON cls.oid = con.conrelid
     JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
     LEFT JOIN pg_class fcls ON fcls.oid = con.confrelid
     WHERE nsp.nspname = 'public'
       AND con.contype IN ('p', 'f', 'u')
     ORDER BY cls.relname, con.contype, con.conname`
  );
  return rows.filter((r) => isKnownPublicTable(r.table_name));
}

function formatSqlValueForColumn(
  value: unknown,
  colInfo: DbBackupSchemaColumn | undefined
): unknown {
  if (value === undefined) return null;
  if (value === null) return null;
  if (colInfo && (colInfo.udt_name === 'jsonb' || colInfo.udt_name === 'json')) {
    return typeof value === 'string' ? value : JSON.stringify(value);
  }
  return value;
}

function buildColumnCastSuffix(colInfo: DbBackupSchemaColumn | undefined): string {
  if (!colInfo) return '';
  if (colInfo.udt_name === 'ltree') return '::ltree';
  if (colInfo.udt_name === 'jsonb') return '::jsonb';
  if (colInfo.udt_name === 'json') return '::json';
  return '';
}

async function insertRowsInChunks(
  client: PgClient,
  tableName: string,
  columns: readonly DbBackupSchemaColumn[],
  rows: ReadonlyArray<Record<string, unknown>>,
  options: { overridingSystemValue?: boolean; onConflictDoNothing?: boolean } = {}
): Promise<void> {
  if (rows.length === 0 || columns.length === 0) return;

  const colByName = new Map(columns.map((c) => [c.column_name, c]));
  const colNames = columns.map((c) => c.column_name);
  const colListSql = colNames.map(quoteIdent).join(', ');
  const chunkSize = Math.max(1, Math.min(100, Math.floor(6000 / Math.max(1, colNames.length))));

  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const values: unknown[] = [];
    const tuplesSql: string[] = [];

    for (const row of chunk) {
      const placeholders: string[] = [];
      for (const colName of colNames) {
        const colInfo = colByName.get(colName);
        values.push(formatSqlValueForColumn(row[colName], colInfo));
        placeholders.push(`$${values.length}${buildColumnCastSuffix(colInfo)}`);
      }
      tuplesSql.push(`(${placeholders.join(', ')})`);
    }

    const overridingClause = options.overridingSystemValue ? ' OVERRIDING SYSTEM VALUE' : '';
    const conflictClause = options.onConflictDoNothing ? ' ON CONFLICT DO NOTHING' : '';
    const sql = `INSERT INTO public.${quoteIdent(tableName)} (${colListSql})${overridingClause} VALUES ${tuplesSql.join(', ')}${conflictClause}`;
    await client.query(sql, values);
  }
}

async function runAllQueriesInOrder(): Promise<{
  executedFiles: ExecutedScript[];
  totalDurationMs: number;
}> {
  const { projectRef, supabaseToken, databaseKey } = resolveSupabaseRuntimeConfig();

  if (!projectRef) {
    throw new Error('VITE_SUPABASE_URL is missing or invalid in .env / supabase.env.');
  }

  if (!supabaseToken && !databaseKey) {
    throw new Error(
      'Missing Supabase database credentials in .env / supabase.env (VITE_SUPABASE_TOKEN or VITE_SUPABASE_DATABASE_KEY).'
    );
  }

  const sqlFiles = await listOrderedSqlFiles();
  if (sqlFiles.length === 0) {
    throw new Error('No .sql files were found in public/supabase/queries/.');
  }

  const totalStart = performance.now();
  const executedFiles: ExecutedScript[] = [];

  const executeViaPgClient = async (): Promise<void> => {
    const client = createPgClient(projectRef, databaseKey);
    await client.connect();
    try {
      for (const file of sqlFiles) {
        const fileStart = performance.now();
        const sql = await fs.readFile(path.join(QUERIES_DIR, file), 'utf8');
        try {
          await client.query(sql);
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          throw new Error(`Failed executing ${file}: ${reason}`);
        }
        executedFiles.push({
          file,
          durationMs: Math.round(performance.now() - fileStart),
        });
      }
    } finally {
      await client.end();
    }
  };

  if (supabaseToken) {
    let tokenAuthFailed = false;
    for (let idx = 0; idx < sqlFiles.length; idx += 1) {
      const file = sqlFiles[idx];
      const fileStart = performance.now();
      const sql = await fs.readFile(path.join(QUERIES_DIR, file), 'utf8');
      try {
        await runViaManagementApi(projectRef, supabaseToken, sql);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        if (
          idx === 0 &&
          databaseKey &&
          /invalid access token|unauthorized|401|403/i.test(reason)
        ) {
          tokenAuthFailed = true;
          break;
        }
        throw new Error(`Failed executing ${file}: ${reason}`);
      }
      executedFiles.push({
        file,
        durationMs: Math.round(performance.now() - fileStart),
      });
    }

    if (tokenAuthFailed) {
      executedFiles.length = 0;
      await executeViaPgClient();
    }
  } else {
    await executeViaPgClient();
  }

  return {
    executedFiles,
    totalDurationMs: Math.round(performance.now() - totalStart),
  };
}

function buildCsvImportDependencyTables(tableName: string): string[] {
  const def = getDbTableDefinition(tableName);
  if (!def) return [];
  const needed = new Set<string>([tableName]);
  for (const fk of def.fkRefs) {
    needed.add(fk.targetTable);
    if (fk.column === 'id_certificado') {
      needed.add('certificado_version');
    }
    if (fk.column === 'id_organizacion_version') {
      needed.add('certificado');
      needed.add('organizacion_version');
    }
  }
  return [...needed];
}

async function createServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  });

  app.post('/api/reset-db', async (_req: Request, res: Response) => {
    try {
      const result = await runAllQueriesInOrder();
      res.status(200).json({
        ok: true,
        executedFiles: result.executedFiles,
        totalDurationMs: result.totalDurationMs,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected database reset error.';
      res.status(500).json({
        ok: false,
        error: sanitizeZeroUuidMessage(message),
      });
    }
  });

  app.get('/api/admin/db/tables', async (req: Request, res: Response) => {
    const admin = await requireApprovedAdmin(req, res);
    if (!admin) return;

    try {
      const unionParts = DB_TABLES_TOPO_ORDER.map((tableName) => {
        const def = getDbTableDefinition(tableName);
        const safeTable = quoteIdent(tableName);
        if (def?.hasSoftDelete) {
          return `SELECT '${tableName}' AS table_name, COUNT(*)::int AS total_rows, COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS active_rows FROM public.${safeTable}`;
        }
        return `SELECT '${tableName}' AS table_name, COUNT(*)::int AS total_rows, COUNT(*)::int AS active_rows FROM public.${safeTable}`;
      });

      const counts = await queryRows<{
        table_name: string;
        total_rows: number;
        active_rows: number;
      }>(unionParts.join(' UNION ALL '));

      const countByTable = new Map(counts.map((c) => [c.table_name, c]));
      const tables = DB_TABLES_TOPO_ORDER.map((tableName) => {
        const def = getDbTableDefinition(tableName)!;
        const stats = countByTable.get(tableName);
        const totalRows = Number(stats?.total_rows ?? 0);
        const activeRows = Number(stats?.active_rows ?? 0);
        const archivedRows = Math.max(0, totalRows - activeRows);
        return {
          name: def.name,
          labelEs: def.labelEs,
          groupEs: def.groupEs,
          totalRows,
          activeRows,
          archivedRows,
          csvImportSupported: def.csvImportSupported,
        };
      });

      res.status(200).json({ ok: true, tables });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al consultar tablas.';
      res.status(500).json({ ok: false, error: sanitizeZeroUuidMessage(message) });
    }
  });

  app.get('/api/admin/db/backup', async (req: Request, res: Response) => {
    const admin = await requireApprovedAdmin(req, res);
    if (!admin) return;

    try {
      const [colsByTable, constraints, sqlManifest] = await Promise.all([
        fetchPublicColumnsByTable(),
        fetchPublicConstraints(),
        listOrderedSqlFiles(),
      ]);

      const data: Record<string, Array<Record<string, unknown>>> = {};
      let totalRows = 0;
      let activeRows = 0;
      let archivedRows = 0;

      await withDbClient(async (client) => {
        for (const tableName of DB_TABLES_TOPO_ORDER) {
          const safeTable = quoteIdent(tableName);
          const result = await client.query<Record<string, unknown>>(
            `SELECT * FROM public.${safeTable}`
          );
          const sortedRows = sortSelfReferentialRowsForRestore(tableName, result.rows);
          data[tableName] = sortedRows;
          totalRows += sortedRows.length;
          for (const row of sortedRows) {
            if (row.deleted_at !== null && row.deleted_at !== undefined && row.deleted_at !== '') {
              archivedRows += 1;
            } else {
              activeRows += 1;
            }
          }
        }
      });

      const allColumns: DbBackupSchemaColumn[] = [];
      for (const tableName of DB_TABLES_TOPO_ORDER) {
        const list = colsByTable.get(tableName);
        if (list) allColumns.push(...list);
      }

      const exportedAt = new Date().toISOString();
      const bundle: DbBackupBundle = {
        app: 'programa_aud',
        schema_version: '1.0',
        exported_at: exportedAt,
        metadata: {
          table_count: DB_TABLES_TOPO_ORDER.length,
          total_rows: totalRows,
          active_rows: activeRows,
          archived_rows: archivedRows,
          sql_manifest: sqlManifest,
        },
        schema: {
          tables_order: [...DB_TABLES_TOPO_ORDER],
          columns: allColumns,
          constraints,
        },
        data,
      };

      const stamp = exportedAt.slice(0, 16).replace(/:/g, '-').replace('T', '_');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="programa_aud_backup_${stamp}.json"`
      );
      res.status(200).send(JSON.stringify(bundle, null, 2));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error generando el respaldo completo.';
      res.status(500).json({ ok: false, error: sanitizeZeroUuidMessage(message) });
    }
  });

  app.post('/api/admin/db/restore', async (req: Request, res: Response) => {
    const admin = await requireApprovedAdmin(req, res);
    if (!admin) return;

    const validation = summarizeBackupBundle(req.body);
    if (!validation.ok) {
      res.status(400).json({ ok: false, error: validation.error });
      return;
    }

    const startedAt = performance.now();
    try {
      const colsByTable = await fetchPublicColumnsByTable();
      let tablesRestored = 0;
      let rowsRestored = 0;

      await withDbTransaction(async (client) => {
        await client.query("SET LOCAL session_replication_role = 'replica'");

        const authUsersRes = await client.query<{ id: string }>('SELECT id::text AS id FROM auth.users');
        const validAuthUserIds = new Set(authUsersRes.rows.map((u) => u.id.toLowerCase()));

        // Preserve current admin profile row if missing from backup or if auth.users lacks old backup user IDs
        const currentAdminProfileRes = await client.query<Record<string, unknown>>(
          'SELECT * FROM public.profiles WHERE id = $1 LIMIT 1',
          [admin.userId]
        );
        const currentAdminProfile = currentAdminProfileRes.rows[0] ?? null;

        const truncateList = DB_TABLES_TOPO_ORDER.map((t) => `public.${quoteIdent(t)}`).join(', ');
        await client.query(`TRUNCATE TABLE ${truncateList} RESTART IDENTITY CASCADE`);

        for (const tableName of DB_TABLES_TOPO_ORDER) {
          const tableCols = colsByTable.get(tableName) ?? [];
          if (tableCols.length === 0) continue;
          const validColNames = new Set(tableCols.map((c) => c.column_name));

          let rows = sortSelfReferentialRowsForRestore(
            tableName,
            validation.bundle.data[tableName] ?? []
          );

          if (tableName === 'profiles') {
            rows = rows.filter(
              (r) => typeof r.id === 'string' && validAuthUserIds.has(r.id.toLowerCase())
            );
            if (
              currentAdminProfile &&
              !rows.some(
                (r) =>
                  typeof r.id === 'string' &&
                  r.id.toLowerCase() === admin.userId.toLowerCase()
              )
            ) {
              rows.push(currentAdminProfile);
            }
          }

          if (rows.length === 0) continue;

          // Keep only columns existing in current DB schema
          const columnsToInsert = tableCols.filter((c) =>
            rows.some((row) => Object.prototype.hasOwnProperty.call(row, c.column_name) && row[c.column_name] !== undefined)
          );
          if (columnsToInsert.length === 0) continue;

          // Null out invalid auth.users references on deleted_by / approved_by / performed_by if auth environment differs
          const sanitizedRows = rows.map((row) => {
            const copy: Record<string, unknown> = {};
            for (const col of columnsToInsert) {
              if (!validColNames.has(col.column_name)) continue;
              let val = row[col.column_name];
              if (
                (col.column_name === 'deleted_by' || col.column_name === 'performed_by') &&
                typeof val === 'string' &&
                !validAuthUserIds.has(val.toLowerCase())
              ) {
                val = null;
              }
              copy[col.column_name] = val;
            }
            return copy;
          });

          await insertRowsInChunks(client, tableName, columnsToInsert, sanitizedRows, {
            overridingSystemValue: tableName === 'audit_log',
          });
          tablesRestored += 1;
          rowsRestored += sanitizedRows.length;
        }

        await client.query(
          `SELECT setval(
            pg_get_serial_sequence('public.audit_log', 'id'),
            COALESCE((SELECT MAX(id) FROM public.audit_log), 1),
            EXISTS(SELECT 1 FROM public.audit_log)
          )`
        );
      });

      const durationMs = Math.round(performance.now() - startedAt);
      res.status(200).json({
        ok: true,
        tablesRestored,
        rowsRestored,
        durationMs,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error restaurando el respaldo.';
      res.status(500).json({
        ok: false,
        error: sanitizeZeroUuidMessage(message),
      });
    }
  });

  app.get('/api/admin/db/export-csv', async (req: Request, res: Response) => {
    const admin = await requireApprovedAdmin(req, res);
    if (!admin) return;

    const tableName = typeof req.query.table === 'string' ? req.query.table.trim() : '';
    if (!tableName || !isKnownPublicTable(tableName)) {
      res.status(400).json({ ok: false, error: 'Tabla solicitada no válida para exportación CSV.' });
      return;
    }

    try {
      const colsByTable = await fetchPublicColumnsByTable();
      const columns = (colsByTable.get(tableName) ?? []).map((c) => c.column_name);
      const rows = await queryRows<Record<string, unknown>>(
        `SELECT * FROM public.${quoteIdent(tableName)}`
      );
      const csvText = serializeRowsToCsv(columns, rows);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${tableName}.csv"`);
      res.status(200).send(Buffer.from(csvText, 'utf8'));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error exportando tabla a CSV.';
      res.status(500).json({ ok: false, error: sanitizeZeroUuidMessage(message) });
    }
  });

  app.get('/api/admin/db/export-all-csv', async (req: Request, res: Response) => {
    const admin = await requireApprovedAdmin(req, res);
    if (!admin) return;

    try {
      const colsByTable = await fetchPublicColumnsByTable();
      const now = new Date();
      const zipEntries: Array<{ name: string; data: Uint8Array; modifiedAt: Date }> = [];

      await withDbClient(async (client) => {
        for (const tableName of DB_TABLES_TOPO_ORDER) {
          const columns = (colsByTable.get(tableName) ?? []).map((c) => c.column_name);
          const result = await client.query<Record<string, unknown>>(
            `SELECT * FROM public.${quoteIdent(tableName)}`
          );
          const csvText = serializeRowsToCsv(columns, result.rows);
          zipEntries.push({
            name: `${tableName}.csv`,
            data: new TextEncoder().encode(csvText),
            modifiedAt: now,
          });
        }
      });

      const zipBytes = buildZipArchive(zipEntries, {
        compress: (raw) => zlib.deflateRawSync(raw),
      });
      const stamp = now.toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="programa_aud_csv_${stamp}.zip"`
      );
      res.status(200).send(Buffer.from(zipBytes));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error generando archivo ZIP.';
      res.status(500).json({ ok: false, error: sanitizeZeroUuidMessage(message) });
    }
  });

  app.post('/api/admin/db/import-csv/preview', async (req: Request, res: Response) => {
    const admin = await requireApprovedAdmin(req, res);
    if (!admin) return;

    const body = (req.body || {}) as { tableName?: unknown; csvText?: unknown };
    const tableName = typeof body.tableName === 'string' ? body.tableName.trim() : '';
    const csvText = typeof body.csvText === 'string' ? body.csvText : '';

    const def = getDbTableDefinition(tableName);
    if (!def) {
      res.status(400).json({ ok: false, error: 'Tabla destino no válida.' });
      return;
    }
    if (!def.csvImportSupported) {
      res.status(400).json({
        ok: false,
        error: `La tabla "${def.labelEs}" no admite importación CSV directa.`,
      });
      return;
    }
    if (!csvText.trim()) {
      res.status(400).json({ ok: false, error: 'El archivo CSV está vacío.' });
      return;
    }

    try {
      const colsByTable = await fetchPublicColumnsByTable();
      const validCols = (colsByTable.get(tableName) ?? []).map((c) => c.column_name);
      const neededTables = buildCsvImportDependencyTables(tableName);
      const existingDataByTable: Record<string, Array<Record<string, unknown>>> = {};

      await withDbClient(async (client) => {
        for (const tbl of neededTables) {
          const result = await client.query<Record<string, unknown>>(
            `SELECT * FROM public.${quoteIdent(tbl)}`
          );
          existingDataByTable[tbl] = result.rows;
        }
      });

      const plan = planCsvImport({
        tableName,
        csvText,
        existingDataByTable,
        validColumns: validCols,
        generateUuid: () => crypto.randomUUID(),
      });

      res.status(200).json({
        ok: true,
        summary: plan.summary,
        previewRows: plan.previewRows,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error analizando el archivo CSV.';
      res.status(400).json({ ok: false, error: sanitizeZeroUuidMessage(message) });
    }
  });

  app.post('/api/admin/db/import-csv/commit', async (req: Request, res: Response) => {
    const admin = await requireApprovedAdmin(req, res);
    if (!admin) return;

    const body = (req.body || {}) as { tableName?: unknown; csvText?: unknown };
    const tableName = typeof body.tableName === 'string' ? body.tableName.trim() : '';
    const csvText = typeof body.csvText === 'string' ? body.csvText : '';

    const def = getDbTableDefinition(tableName);
    if (!def || !def.csvImportSupported) {
      res.status(400).json({ ok: false, error: 'Tabla destino no válida para importación CSV.' });
      return;
    }
    if (!csvText.trim()) {
      res.status(400).json({ ok: false, error: 'El archivo CSV está vacío.' });
      return;
    }

    try {
      const colsByTable = await fetchPublicColumnsByTable();
      const tableCols = colsByTable.get(tableName) ?? [];
      const colByName = new Map(tableCols.map((c) => [c.column_name, c]));
      const neededTables = buildCsvImportDependencyTables(tableName);

      const resultPayload = await withDbTransaction(async (client) => {
        const existingDataByTable: Record<string, Array<Record<string, unknown>>> = {};
        for (const tbl of neededTables) {
          const rowsRes = await client.query<Record<string, unknown>>(
            `SELECT * FROM public.${quoteIdent(tbl)}`
          );
          existingDataByTable[tbl] = rowsRes.rows;
        }

        const plan = planCsvImport({
          tableName,
          csvText,
          existingDataByTable,
          validColumns: tableCols.map((c) => c.column_name),
          generateUuid: () => crypto.randomUUID(),
        });

        let insertedCount = 0;
        let runtimeSkipped = 0;

        for (const item of plan.insertPayloads) {
          const keys = Object.keys(item.record).filter(
            (col) => colByName.has(col) && item.record[col] !== undefined
          );
          if (keys.length === 0) continue;
          const colsSql = keys.map(quoteIdent).join(', ');
          const values: unknown[] = [];
          const placeholders = keys.map((k) => {
            const colInfo = colByName.get(k);
            values.push(formatSqlValueForColumn(item.record[k], colInfo));
            return `$${values.length}${buildColumnCastSuffix(colInfo)}`;
          });

          const sql = `INSERT INTO public.${quoteIdent(tableName)} (${colsSql}) VALUES (${placeholders.join(', ')}) ON CONFLICT DO NOTHING`;
          const insertRes = await client.query(sql, values);
          if ((insertRes.rowCount ?? 0) > 0) {
            insertedCount += 1;
          } else {
            runtimeSkipped += 1;
          }
        }

        return {
          insertedCount,
          skippedCount: plan.summary.toSkip + runtimeSkipped,
          errorCount: plan.summary.errors,
          previewRows: plan.previewRows,
        };
      });

      res.status(200).json({
        ok: true,
        ...resultPayload,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error importando registros CSV.';
      res.status(400).json({ ok: false, error: sanitizeZeroUuidMessage(message) });
    }
  });

  const isStartScript = process.env.npm_lifecycle_event === 'start';
  const hasDistBuild = fsSync.existsSync(path.resolve(__dirname, 'dist', 'index.html'));
  const useProdStatic = isStartScript || (process.env.NODE_ENV === 'production' && hasDistBuild);

  let mountedVite = false;
  if (!useProdStatic) {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          hmr: false,
          ws: false,
        },
        appType: 'spa',
      });
      app.use(vite.middlewares);
      mountedVite = true;
    } catch (err) {
      console.warn('Vite dev middleware failed to initialize, falling back to static dist:', err);
      mountedVite = false;
    }
  }

  if (!mountedVite) {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.use((req: Request, res: Response, next) => {
      if ((req.method === 'GET' || req.method === 'HEAD') && !req.path.startsWith('/api/')) {
        res.sendFile(path.join(distDir, 'index.html'));
        return;
      }
      next();
    });
  }

  const server = app.listen(PORT, HOST, () => {
    console.log(`Server listening on http://${HOST}:${PORT}`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use by another process.`);
    } else {
      console.error('Server error:', err);
    }
    process.exit(1);
  });
}

createServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
