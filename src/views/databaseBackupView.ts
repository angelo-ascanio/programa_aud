import { escapeHtml } from '../lib/html';
import { APP_SHELL_CONTAINER_CLASS } from '../lib/layout';
import {
  DB_TABLE_DEFINITIONS,
  type BackupBundleSummary,
  type CsvImportPlanResult,
  type DbBackupBundle,
  type DbTableGroup,
} from '../lib/dbBackupCsv';

export type DatabaseBackupTab = 'backup' | 'csv-export' | 'csv-import';

export interface DbTableLiveSummary {
  name: string;
  labelEs: string;
  groupEs: DbTableGroup;
  activeRows: number;
  archivedRows: number;
  totalRows: number;
  csvImportSupported: boolean;
}

export interface DatabaseBackupState {
  activeTab: DatabaseBackupTab;
  loadingTables: boolean;
  tables: DbTableLiveSummary[];
  tableSearchQuery: string;
  tableGroupFilter: 'ALL' | DbTableGroup;
  exportingBackup: boolean;
  exportingZip: boolean;
  exportingCsvTable: string | null;
  restoreFileName: string | null;
  restoreBundle: DbBackupBundle | null;
  restoreSummary: BackupBundleSummary | null;
  restoreConfirmed: boolean;
  restoring: boolean;
  resetConfirmOpen: boolean;
  resettingDb: boolean;
  importTable: string;
  importFileName: string | null;
  importCsvText: string;
  importAnalyzing: boolean;
  importCommitting: boolean;
  importPlan: CsvImportPlanResult | null;
  statusMessage: string | null;
  errorMessage: string | null;
}

export function createInitialDatabaseBackupState(): DatabaseBackupState {
  return {
    activeTab: 'backup',
    loadingTables: false,
    tables: [],
    tableSearchQuery: '',
    tableGroupFilter: 'ALL',
    exportingBackup: false,
    exportingZip: false,
    exportingCsvTable: null,
    restoreFileName: null,
    restoreBundle: null,
    restoreSummary: null,
    restoreConfirmed: false,
    restoring: false,
    resetConfirmOpen: false,
    resettingDb: false,
    importTable: 'organizacion',
    importFileName: null,
    importCsvText: '',
    importAnalyzing: false,
    importCommitting: false,
    importPlan: null,
    statusMessage: null,
    errorMessage: null,
  };
}

function formatDateTimeEs(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderBackupTab(state: DatabaseBackupState): string {
  const preview = state.restoreSummary;

  const previewHtml = preview
    ? `
      <div class="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="text-xs font-semibold text-slate-900">
            Vista previa · ${escapeHtml(state.restoreFileName || 'respaldo.json')}
          </div>
          <span class="text-xs text-slate-500 tabular-nums">
            Exportado: ${escapeHtml(formatDateTimeEs(preview.exportedAt))}
          </span>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div class="bg-white border border-slate-200 rounded-lg px-3 py-2">
            <div class="text-slate-500">Tablas</div>
            <div class="font-bold text-slate-900 tabular-nums mt-0.5">${preview.nonEmptyTables} / ${preview.tableCount}</div>
          </div>
          <div class="bg-white border border-slate-200 rounded-lg px-3 py-2">
            <div class="text-slate-500">Total filas</div>
            <div class="font-bold text-slate-900 tabular-nums mt-0.5">${preview.totalRows.toLocaleString('es-ES')}</div>
          </div>
          <div class="bg-white border border-slate-200 rounded-lg px-3 py-2">
            <div class="text-slate-500">Activas</div>
            <div class="font-bold text-emerald-700 tabular-nums mt-0.5">${preview.activeRows.toLocaleString('es-ES')}</div>
          </div>
          <div class="bg-white border border-slate-200 rounded-lg px-3 py-2">
            <div class="text-slate-500">Archivadas</div>
            <div class="font-bold text-slate-700 tabular-nums mt-0.5">${preview.archivedRows.toLocaleString('es-ES')}</div>
          </div>
        </div>

        ${
          preview.topTables.length > 0
            ? `<div class="text-xs text-slate-600">
                Principales tablas: ${preview.topTables
                  .slice(0, 4)
                  .map((t) => `${escapeHtml(t.labelEs)} (${t.totalRows})`)
                  .join(' · ')}
              </div>`
            : ''
        }

        <div class="pt-2 border-t border-slate-200 space-y-3">
          <div class="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Esta acción reemplazará los datos actuales de la base de datos por el contenido del respaldo seleccionado.
          </div>

          <label class="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
            <input
              id="dbBackupConfirmCheckbox"
              type="checkbox"
              ${state.restoreConfirmed ? 'checked' : ''}
              ${state.restoring ? 'disabled' : ''}
              class="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
            />
            <span>Confirmo que deseo reemplazar los datos actuales con este respaldo.</span>
          </label>

          <div class="flex flex-wrap items-center gap-2">
            <button
              id="dbRestoreConfirmBtn"
              type="button"
              ${!state.restoreConfirmed || state.restoring ? 'disabled' : ''}
              class="px-4 py-2 bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              ${state.restoring ? 'Restaurando base de datos...' : 'Restaurar base de datos'}
            </button>
            <button
              id="dbRestoreClearBtn"
              type="button"
              ${state.restoring ? 'disabled' : ''}
              class="px-3 py-2 border border-slate-300 hover:border-slate-400 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    `
    : '';

  return `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <section class="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between gap-4">
        <div class="space-y-1.5">
          <h2 class="text-sm font-bold text-slate-900">Exportar respaldo completo</h2>
          <p class="text-xs text-slate-500 leading-relaxed">
            Descarga un archivo JSON con estructura de esquema y todos los registros activos y archivados.
          </p>
        </div>

        <div class="pt-2">
          <button
            id="dbDownloadFullBackupBtn"
            type="button"
            ${state.exportingBackup ? 'disabled' : ''}
            class="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            ${state.exportingBackup ? 'Generando respaldo...' : 'Descargar respaldo (.json)'}
          </button>
        </div>
      </section>

      <section class="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between gap-4">
        <div class="space-y-1.5">
          <h2 class="text-sm font-bold text-slate-900">Reinicio a datos base</h2>
          <p class="text-xs text-slate-500 leading-relaxed">
            Re-ejecuta los scripts SQL iniciales (00–07) para restablecer esquema y datos de prueba.
          </p>
        </div>

        <div class="pt-2">
          ${
            state.resetConfirmOpen
              ? `<div class="flex flex-wrap items-center gap-2">
                  <button
                    id="dbResetSqlConfirmBtn"
                    type="button"
                    ${state.resettingDb ? 'disabled' : ''}
                    class="px-4 py-2 bg-rose-700 hover:bg-rose-800 disabled:opacity-60 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    ${state.resettingDb ? 'Reiniciando SQL...' : 'Confirmar reinicio SQL'}
                  </button>
                  <button
                    id="dbResetSqlCancelBtn"
                    type="button"
                    ${state.resettingDb ? 'disabled' : ''}
                    class="px-3 py-2 border border-slate-300 hover:border-slate-400 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>`
              : `<button
                  id="dbResetSqlOpenBtn"
                  type="button"
                  class="px-4 py-2.5 border border-slate-300 hover:border-slate-400 text-slate-800 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Reiniciar base de datos (SQL)
                </button>`
          }
        </div>
      </section>

      <section class="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 space-y-3">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="space-y-1">
            <h2 class="text-sm font-bold text-slate-900">Restaurar desde respaldo</h2>
            <p class="text-xs text-slate-500">
              Selecciona un archivo <code>.json</code> exportado previamente para revisar su contenido antes de restaurar.
            </p>
          </div>
          <label class="inline-flex items-center px-4 py-2 bg-white border border-slate-300 hover:border-slate-400 text-slate-800 text-xs font-semibold rounded-lg transition-colors cursor-pointer shrink-0">
            <input
              id="dbRestoreFileInput"
              type="file"
              accept=".json,application/json"
              class="sr-only"
              ${state.restoring ? 'disabled' : ''}
            />
            <span>Seleccionar respaldo (.json)</span>
          </label>
        </div>

        ${previewHtml}
      </section>
    </div>
  `;
}

function renderCsvExportTab(state: DatabaseBackupState): string {
  const query = state.tableSearchQuery.trim().toLowerCase();
  const filteredTables = state.tables.filter((t) => {
    if (state.tableGroupFilter !== 'ALL' && t.groupEs !== state.tableGroupFilter) {
      return false;
    }
    if (!query) return true;
    return (
      t.name.toLowerCase().includes(query) ||
      t.labelEs.toLowerCase().includes(query) ||
      t.groupEs.toLowerCase().includes(query)
    );
  });

  const rowsHtml =
    state.loadingTables && state.tables.length === 0
      ? `<div class="p-6 text-center text-xs text-slate-500">Cargando tablas de la base de datos...</div>`
      : filteredTables.length === 0
        ? `<div class="p-6 text-center text-xs text-slate-500">No se encontraron tablas con ese filtro.</div>`
        : filteredTables
            .map((tbl) => {
              const isExportingThis = state.exportingCsvTable === tbl.name;
              return `
                <div class="px-5 py-3 flex items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors">
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="text-xs font-semibold text-slate-900">${escapeHtml(tbl.labelEs)}</span>
                      <code class="text-[11px] font-mono text-slate-500">${escapeHtml(tbl.name)}</code>
                    </div>
                    <div class="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                      ${escapeHtml(tbl.groupEs)} · ${tbl.activeRows.toLocaleString('es-ES')} activos${
                        tbl.archivedRows > 0 ? ` · ${tbl.archivedRows.toLocaleString('es-ES')} archivados` : ''
                      }
                    </div>
                  </div>
                  <button
                    type="button"
                    data-export-csv-table="${escapeHtml(tbl.name)}"
                    ${isExportingThis ? 'disabled' : ''}
                    class="px-3 py-1.5 border border-slate-300 hover:border-slate-400 disabled:opacity-60 text-slate-800 text-xs font-semibold rounded-lg transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                  >
                    ${isExportingThis ? 'Exportando...' : 'Descargar CSV'}
                  </button>
                </div>
              `;
            })
            .join('');

  const groups: Array<'ALL' | DbTableGroup> = ['ALL', 'Catálogos Base', 'Certificación', 'Auditoría', 'Sistema'];

  return `
    <div class="space-y-4">
      <section class="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div class="space-y-1">
          <h2 class="text-sm font-bold text-slate-900">Exportar todas las tablas (.zip)</h2>
          <p class="text-xs text-slate-500">
            Genera un archivo ZIP con un CSV UTF-8 por cada tabla pública.
          </p>
        </div>
        <button
          id="dbExportAllCsvZipBtn"
          type="button"
          ${state.exportingZip ? 'disabled' : ''}
          class="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer shrink-0 whitespace-nowrap"
        >
          ${state.exportingZip ? 'Generando ZIP...' : 'Exportar todas (ZIP)'}
        </button>
      </section>

      <section class="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div class="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <input
            id="dbTableSearchInput"
            type="search"
            value="${escapeHtml(state.tableSearchQuery)}"
            placeholder="Buscar tabla por nombre o módulo..."
            class="w-full sm:w-72 px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
          />
          <select
            id="dbTableGroupSelect"
            aria-label="Filtrar por módulo"
            class="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            ${groups
              .map(
                (grp) =>
                  `<option value="${escapeHtml(grp)}" ${
                    state.tableGroupFilter === grp ? 'selected' : ''
                  }>${grp === 'ALL' ? 'Todos los módulos' : escapeHtml(grp)}</option>`
              )
              .join('')}
          </select>
        </div>
        <div class="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
          ${rowsHtml}
        </div>
      </section>
    </div>
  `;
}

function renderCsvImportTab(state: DatabaseBackupState): string {
  const importableTables = DB_TABLE_DEFINITIONS.filter((def) => def.csvImportSupported);
  const selectedDef =
    importableTables.find((d) => d.name === state.importTable) ?? importableTables[0];
  const plan = state.importPlan;

  const previewHtml = plan
    ? `
      <div class="mt-5 pt-5 border-t border-slate-200 space-y-4">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div class="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <div class="text-slate-500">Filas analizadas</div>
            <div class="font-bold text-slate-900 tabular-nums mt-0.5">${plan.summary.totalRows}</div>
          </div>
          <div class="bg-emerald-50/70 border border-emerald-200 rounded-lg px-3 py-2">
            <div class="text-emerald-800">Nuevos a insertar</div>
            <div class="font-bold text-emerald-900 tabular-nums mt-0.5">${plan.summary.toInsert}</div>
          </div>
          <div class="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <div class="text-slate-600">Existentes (omitidos)</div>
            <div class="font-bold text-slate-800 tabular-nums mt-0.5">${plan.summary.toSkip}</div>
          </div>
          <div class="bg-rose-50/70 border border-rose-200 rounded-lg px-3 py-2">
            <div class="text-rose-800">Con error</div>
            <div class="font-bold text-rose-900 tabular-nums mt-0.5">${plan.summary.errors}</div>
          </div>
        </div>

        <div class="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-72 overflow-y-auto">
          ${plan.previewRows
            .slice(0, 60)
            .map((row) => {
              const statusText =
                row.action === 'INSERT'
                  ? '<span class="text-xs font-semibold text-emerald-700 whitespace-nowrap">Insertar</span>'
                  : row.action === 'SKIP_EXISTING'
                    ? '<span class="text-xs font-semibold text-slate-500 whitespace-nowrap">Omitir</span>'
                    : '<span class="text-xs font-semibold text-rose-700 whitespace-nowrap">Error</span>';
              return `
                <div class="px-4 py-2.5 flex items-start justify-between gap-4 text-xs">
                  <div class="min-w-0">
                    <div class="font-semibold text-slate-900 truncate">
                      Fila ${row.lineNumber} · ${escapeHtml(row.displayLabel)}
                    </div>
                    <div class="text-slate-500 mt-0.5">${escapeHtml(row.detail)}</div>
                  </div>
                  <div class="shrink-0">${statusText}</div>
                </div>
              `;
            })
            .join('')}
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <button
            id="dbImportCsvCommitBtn"
            type="button"
            ${plan.summary.toInsert === 0 || state.importCommitting ? 'disabled' : ''}
            class="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            ${
              state.importCommitting
                ? 'Importando registros...'
                : `Confirmar importación (${plan.summary.toInsert} nuevos)`
            }
          </button>
          <button
            id="dbImportCsvResetBtn"
            type="button"
            ${state.importCommitting ? 'disabled' : ''}
            class="px-3.5 py-2 border border-slate-300 hover:border-slate-400 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Limpiar vista previa
          </button>
        </div>
      </div>
    `
    : '';

  return `
    <section class="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
      <div class="space-y-1">
        <h2 class="text-sm font-bold text-slate-900">Importar CSV (solo registros nuevos)</h2>
        <p class="text-xs text-slate-500 leading-relaxed">
          Acepta IDs simples (1, 2, ORG-1) o referencias por código/nombre. Los registros existentes se omiten automáticamente sin duplicar.
        </p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
        <label class="block space-y-1.5">
          <span class="text-xs font-semibold text-slate-700">Tabla destino</span>
          <select
            id="dbImportTableSelect"
            ${state.importAnalyzing || state.importCommitting ? 'disabled' : ''}
            class="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            ${importableTables
              .map(
                (def) =>
                  `<option value="${escapeHtml(def.name)}" ${
                    def.name === selectedDef.name ? 'selected' : ''
                  }>${escapeHtml(def.labelEs)} (${escapeHtml(def.name)})</option>`
              )
              .join('')}
          </select>
        </label>

        <div class="flex flex-wrap items-center gap-2.5">
          <button
            id="dbDownloadSampleCsvBtn"
            type="button"
            class="px-3.5 py-2 border border-slate-300 hover:border-slate-400 text-slate-800 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Descargar plantilla CSV
          </button>

          <label class="inline-flex items-center px-3.5 py-2 bg-white border border-slate-300 hover:border-slate-400 text-slate-800 text-xs font-semibold rounded-lg transition-colors cursor-pointer">
            <input
              id="dbImportCsvFileInput"
              type="file"
              accept=".csv,text/csv"
              class="sr-only"
              ${state.importAnalyzing || state.importCommitting ? 'disabled' : ''}
            />
            <span>${state.importFileName ? escapeHtml(state.importFileName) : 'Cargar archivo (.csv)'}</span>
          </label>

          <button
            id="dbAnalyzeCsvBtn"
            type="button"
            ${!state.importCsvText.trim() || state.importAnalyzing || state.importCommitting ? 'disabled' : ''}
            class="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            ${state.importAnalyzing ? 'Analizando...' : 'Analizar CSV'}
          </button>
        </div>
      </div>

      ${previewHtml}
    </section>
  `;
}

export function renderDatabaseBackupView(state: DatabaseBackupState): string {
  const totalActive = state.tables.reduce((acc, t) => acc + t.activeRows, 0);
  const totalArchived = state.tables.reduce((acc, t) => acc + t.archivedRows, 0);

  const tabs: Array<{ id: DatabaseBackupTab; label: string }> = [
    { id: 'backup', label: 'Respaldo y Restauración' },
    { id: 'csv-export', label: 'Exportar CSV' },
    { id: 'csv-import', label: 'Importar CSV' },
  ];

  const feedbackHtml = state.errorMessage
    ? `<div class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800">${escapeHtml(state.errorMessage)}</div>`
    : state.statusMessage
      ? `<div class="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800">${escapeHtml(state.statusMessage)}</div>`
      : '';

  let tabBodyHtml = '';
  if (state.activeTab === 'backup') {
    tabBodyHtml = renderBackupTab(state);
  } else if (state.activeTab === 'csv-export') {
    tabBodyHtml = renderCsvExportTab(state);
  } else {
    tabBodyHtml = renderCsvImportTab(state);
  }

  return `
    <main class="flex-1 ${APP_SHELL_CONTAINER_CLASS} py-8 sm:py-10 space-y-5">
      <header class="bg-white border border-slate-200 rounded-xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div class="space-y-1">
          <div class="text-xs font-semibold text-slate-500">Administración · Respaldo y CSV</div>
          <h1 class="text-2xl font-bold tracking-tight text-slate-900">
            Centro de Respaldo y Gestión de Datos
          </h1>
          <p class="text-xs text-slate-500 tabular-nums">
            ${
              state.tables.length > 0
                ? `${state.tables.length} tablas · ${totalActive.toLocaleString('es-ES')} registros activos · ${totalArchived.toLocaleString('es-ES')} archivados`
                : 'Respaldos completos JSON, exportación CSV/ZIP e importación con resolución de IDs.'
            }
          </p>
        </div>

        <div class="inline-flex p-1 bg-slate-100 rounded-lg self-start lg:self-center">
          ${tabs
            .map(
              (tab) => `
                <button
                  type="button"
                  data-db-backup-tab="${tab.id}"
                  class="px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    state.activeTab === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }"
                >
                  ${escapeHtml(tab.label)}
                </button>
              `
            )
            .join('')}
        </div>
      </header>

      ${feedbackHtml}

      ${tabBodyHtml}
    </main>
  `;
}
