import { supabase } from './supabase';
import {
  sanitizeZeroUuidMessage,
  type CsvImportPlanResult,
  type DbBackupBundle,
} from './dbBackupCsv';
import type { DbTableLiveSummary } from '../views/databaseBackupView';

async function getAdminAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error('Tu sesión expiró. Inicia sesión nuevamente como Administrador.');
  }
  return {
    Authorization: `Bearer ${token}`,
  };
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function parseDownloadFilename(contentDisposition: string | null, fallbackName: string): string {
  if (!contentDisposition) return fallbackName;
  const match = contentDisposition.match(/filename="?([^";\n]+)"?/i);
  return match?.[1]?.trim() || fallbackName;
}

export async function fetchDatabaseTablesSummary(): Promise<DbTableLiveSummary[]> {
  const headers = await getAdminAuthHeaders();
  const res = await fetch('/api/admin/db/tables', { headers });
  const payload = (await res.json()) as {
    ok?: boolean;
    error?: string;
    tables?: DbTableLiveSummary[];
  };
  if (!res.ok || !payload.ok) {
    throw new Error(sanitizeZeroUuidMessage(payload.error || 'No se pudieron consultar las tablas.'));
  }
  return payload.tables ?? [];
}

export async function downloadFullDatabaseBackup(): Promise<string> {
  const headers = await getAdminAuthHeaders();
  const res = await fetch('/api/admin/db/backup', { headers });
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(sanitizeZeroUuidMessage(errBody.error || 'No se pudo generar el respaldo completo.'));
  }
  const filename = parseDownloadFilename(
    res.headers.get('content-disposition'),
    `programa_aud_backup_${new Date().toISOString().slice(0, 10)}.json`
  );
  const blob = await res.blob();
  triggerBlobDownload(blob, filename);
  return filename;
}

export async function restoreFullDatabaseBackup(bundle: DbBackupBundle): Promise<{
  tablesRestored: number;
  rowsRestored: number;
  durationMs: number;
}> {
  const authHeaders = await getAdminAuthHeaders();
  const res = await fetch('/api/admin/db/restore', {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(bundle),
  });
  const payload = (await res.json()) as {
    ok?: boolean;
    error?: string;
    tablesRestored?: number;
    rowsRestored?: number;
    durationMs?: number;
  };
  if (!res.ok || !payload.ok) {
    throw new Error(sanitizeZeroUuidMessage(payload.error || 'No se pudo restaurar el respaldo.'));
  }
  return {
    tablesRestored: payload.tablesRestored ?? 0,
    rowsRestored: payload.rowsRestored ?? 0,
    durationMs: payload.durationMs ?? 0,
  };
}

export async function downloadSingleTableCsv(tableName: string): Promise<string> {
  const headers = await getAdminAuthHeaders();
  const res = await fetch(`/api/admin/db/export-csv?table=${encodeURIComponent(tableName)}`, {
    headers,
  });
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(sanitizeZeroUuidMessage(errBody.error || 'Error al exportar la tabla a CSV.'));
  }
  const filename = parseDownloadFilename(
    res.headers.get('content-disposition'),
    `${tableName}.csv`
  );
  const blob = await res.blob();
  triggerBlobDownload(blob, filename);
  return filename;
}

export async function downloadAllTablesCsvZip(): Promise<string> {
  const headers = await getAdminAuthHeaders();
  const res = await fetch('/api/admin/db/export-all-csv', { headers });
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(sanitizeZeroUuidMessage(errBody.error || 'Error al exportar las tablas en ZIP.'));
  }
  const filename = parseDownloadFilename(
    res.headers.get('content-disposition'),
    `programa_aud_csv_${new Date().toISOString().slice(0, 10)}.zip`
  );
  const blob = await res.blob();
  triggerBlobDownload(blob, filename);
  return filename;
}

export async function previewTableCsvImport(
  tableName: string,
  csvText: string
): Promise<CsvImportPlanResult> {
  const authHeaders = await getAdminAuthHeaders();
  const res = await fetch('/api/admin/db/import-csv/preview', {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tableName, csvText }),
  });
  const payload = (await res.json()) as {
    ok?: boolean;
    error?: string;
    summary?: CsvImportPlanResult['summary'];
    previewRows?: CsvImportPlanResult['previewRows'];
  };
  if (!res.ok || !payload.ok || !payload.summary) {
    throw new Error(sanitizeZeroUuidMessage(payload.error || 'Error al analizar el archivo CSV.'));
  }
  return {
    summary: payload.summary,
    previewRows: payload.previewRows ?? [],
    insertPayloads: [],
  };
}

export async function commitTableCsvImport(
  tableName: string,
  csvText: string
): Promise<{
  insertedCount: number;
  skippedCount: number;
  errorCount: number;
  previewRows: CsvImportPlanResult['previewRows'];
}> {
  const authHeaders = await getAdminAuthHeaders();
  const res = await fetch('/api/admin/db/import-csv/commit', {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tableName, csvText }),
  });
  const payload = (await res.json()) as {
    ok?: boolean;
    error?: string;
    insertedCount?: number;
    skippedCount?: number;
    errorCount?: number;
    previewRows?: CsvImportPlanResult['previewRows'];
  };
  if (!res.ok || !payload.ok) {
    throw new Error(sanitizeZeroUuidMessage(payload.error || 'Error al importar el archivo CSV.'));
  }
  return {
    insertedCount: payload.insertedCount ?? 0,
    skippedCount: payload.skippedCount ?? 0,
    errorCount: payload.errorCount ?? 0,
    previewRows: payload.previewRows ?? [],
  };
}

export function downloadClientTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  triggerBlobDownload(blob, filename);
}
