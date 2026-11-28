import { sanitizeZeroUuidMessage } from '../lib/dbBackupCsv';
import { escapeHtml } from '../lib/html';
import { APP_SHELL_CONTAINER_CLASS } from '../lib/layout';
import {
  SQL_SEED_SYNC_BLOCKS,
  type SqlSeedBlockSpec,
  type SqlSeedSectionSpec,
} from '../lib/sqlSeedSyncCatalog';
import type {
  DatabaseSeedSyncState,
  SeedSyncPreviewResponse,
  SeedSyncTableDiffSummary,
  SeedSyncTableLiveCount,
  SeedSyncTargetResult,
} from '../lib/sqlSeedSyncClient';
import { containsRawUuid } from '../lib/zeroUuid';

function sanitizeViewText(value: string | null | undefined, fallback = ''): string {
  const cleaned = sanitizeZeroUuidMessage(String(value ?? '')).trim();
  if (!cleaned || containsRawUuid(cleaned)) return fallback;
  return cleaned;
}

function formatFileSizeKb(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatTimestampEs(iso: string | null | undefined): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getSectionActiveRowCount(
  section: SqlSeedSectionSpec,
  tableCounts: Record<string, SeedSyncTableLiveCount> | undefined
): number | null {
  if (!tableCounts) return null;
  let sum = 0;
  let seenAny = false;
  for (const tbl of new Set(section.tables)) {
    const info = tableCounts[tbl];
    if (info && info.existsInDb) {
      sum += info.activeRows;
      seenAny = true;
    }
  }
  return seenAny ? sum : 0;
}

function getBlockStats(
  block: SqlSeedBlockSpec,
  selectedSet: ReadonlySet<string>,
  tableCounts: Record<string, SeedSyncTableLiveCount> | undefined
): {
  selectedCount: number;
  totalCount: number;
  allSelected: boolean;
  someSelected: boolean;
  activeRowsSum: number | null;
} {
  const totalCount = block.sections.length;
  const selectedCount = block.sections.filter((sec) => selectedSet.has(sec.id)).length;
  const allSelected = totalCount > 0 && selectedCount === totalCount;
  const someSelected = selectedCount > 0 && selectedCount < totalCount;

  if (!tableCounts) {
    return { selectedCount, totalCount, allSelected, someSelected, activeRowsSum: null };
  }

  const uniqueTables = new Set<string>();
  for (const sec of block.sections) {
    for (const tbl of sec.tables) uniqueTables.add(tbl);
  }
  let activeRowsSum = 0;
  for (const tbl of uniqueTables) {
    const info = tableCounts[tbl];
    if (info?.existsInDb) activeRowsSum += info.activeRows;
  }

  return { selectedCount, totalCount, allSelected, someSelected, activeRowsSum };
}

function renderSectionRow(
  section: SqlSeedSectionSpec,
  isSelected: boolean,
  disabled: boolean,
  tableCounts: Record<string, SeedSyncTableLiveCount> | undefined
): string {
  const activeCount = getSectionActiveRowCount(section, tableCounts);
  const isCertificado = section.id === 'certificacion.certificado';
  const isSpecialNorma = section.specialCase === 'NORMAS_CSV_SEED';
  const isResumen = section.id === 'auditorias.resumen';
  const isGroupedChild = Boolean(section.groupLabelEs);

  const inlineBadges: string[] = [];
  if (isCertificado) {
    inlineBadges.push(
      '<span class="text-[11px] font-semibold text-sky-700">Cascada Padre → Hijos automática</span>'
    );
  }
  if (isSpecialNorma) {
    inlineBadges.push(
      '<span class="text-[11px] font-semibold text-amber-700">Destino especial: 07_normas_requisitos_csv.sql</span>'
    );
  }
  if (isResumen) {
    inlineBadges.push(
      '<span class="text-[11px] font-semibold text-slate-600">Consolida todo el Bloque 1</span>'
    );
  }

  const secondaryLine = isCertificado
    ? section.cascadeSummaryEs
    : section.descriptionEs;

  const metaParts: string[] = [];
  if (activeCount !== null) {
    metaParts.push(`${activeCount.toLocaleString('es-ES')} activas`);
  }
  metaParts.push(`${section.tables.length} ${section.tables.length === 1 ? 'tabla' : 'tablas'}`);

  return `
    <label
      class="${isGroupedChild ? 'pl-8 pr-4' : 'px-4'} py-3 flex items-start gap-3 transition-colors ${
        disabled ? 'opacity-60 cursor-not-allowed' : 'hover:bg-slate-50/80 cursor-pointer'
      } ${isSelected ? 'bg-slate-50/70' : ''}"
    >
      <input
        type="checkbox"
        data-action="toggle-sync-section"
        data-section-id="${escapeHtml(section.id)}"
        ${isSelected ? 'checked' : ''}
        ${disabled ? 'disabled' : ''}
        class="mt-0.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900 shrink-0"
      />
      <div class="min-w-0 flex-1 space-y-0.5">
        <div class="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
          <span class="text-xs font-semibold text-slate-900">${escapeHtml(section.labelEs)}</span>
          <span class="text-[11px] text-slate-500 tabular-nums whitespace-nowrap">${escapeHtml(metaParts.join(' · '))}</span>
        </div>
        ${
          inlineBadges.length > 0
            ? `<div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">${inlineBadges.join('<span class="text-slate-300" aria-hidden="true">·</span>')}</div>`
            : ''
        }
        <p class="text-[11px] text-slate-500 leading-relaxed">
          ${escapeHtml(sanitizeViewText(secondaryLine))}
        </p>
      </div>
    </label>
  `;
}

function renderBlockCard(
  block: SqlSeedBlockSpec,
  state: DatabaseSeedSyncState,
  selectedSet: ReadonlySet<string>
): string {
  const busy = state.analyzing || state.applying;
  const stats = getBlockStats(block, selectedSet, state.catalog?.tableCounts);

  let lastGroupLabel: string | undefined;
  const sectionRowsHtml = block.sections
    .map((sec) => {
      let groupHeaderHtml = '';
      if (sec.groupLabelEs && sec.groupLabelEs !== lastGroupLabel) {
        groupHeaderHtml = `
          <div class="px-4 py-1.5 bg-slate-50 text-[11px] font-semibold text-slate-500">
            ${escapeHtml(sec.groupLabelEs)}
          </div>
        `;
      }
      lastGroupLabel = sec.groupLabelEs;
      return `${groupHeaderHtml}${renderSectionRow(
        sec,
        selectedSet.has(sec.id),
        busy,
        state.catalog?.tableCounts
      )}`;
    })
    .join('');

  const blockMetaParts: string[] = [
    `${stats.selectedCount}/${stats.totalCount} selec.`,
  ];
  if (stats.activeRowsSum !== null) {
    blockMetaParts.push(`${stats.activeRowsSum.toLocaleString('es-ES')} filas activas`);
  }

  return `
    <section
      data-sync-block-card="${escapeHtml(block.id)}"
      class="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col"
    >
      <div class="px-4 py-3.5 border-b border-slate-200 bg-slate-50/70 space-y-1">
        <label class="flex items-center justify-between gap-3 ${busy ? 'cursor-not-allowed' : 'cursor-pointer'}">
          <span class="inline-flex items-center gap-2.5 min-w-0">
            <input
              type="checkbox"
              data-action="toggle-sync-block"
              data-block-id="${escapeHtml(block.id)}"
              data-indeterminate="${stats.someSelected ? 'true' : 'false'}"
              aria-checked="${stats.allSelected ? 'true' : stats.someSelected ? 'mixed' : 'false'}"
              ${stats.allSelected ? 'checked' : ''}
              ${busy ? 'disabled' : ''}
              class="rounded border-slate-300 text-slate-900 focus:ring-slate-900 shrink-0"
            />
            <span class="text-sm font-bold text-slate-900 truncate">
              ${escapeHtml(block.labelEs)}
            </span>
          </span>
          <span class="text-[11px] font-medium text-slate-600 tabular-nums whitespace-nowrap shrink-0">
            ${escapeHtml(blockMetaParts.join(' · '))}
          </span>
        </label>
        <p class="text-[11px] text-slate-500 leading-relaxed pl-6">
          ${escapeHtml(block.descriptionEs)}
        </p>
      </div>

      <div class="divide-y divide-slate-100 flex-1">
        ${sectionRowsHtml}
      </div>
    </section>
  `;
}

function renderTargetSummaryCard(target: SeedSyncTargetResult): string {
  const statusLabel = !target.valid
    ? 'Validación con observaciones'
    : target.changed
      ? 'Cambios listos para aplicar'
      : 'Sin cambios pendientes';
  const statusColorClass = !target.valid
    ? 'text-rose-700'
    : target.changed
      ? 'text-emerald-700'
      : 'text-slate-500';

  const noteText = target.buildNormasSeedNoteEs
    ? `<p class="text-[11px] text-slate-600 leading-relaxed pt-1">${escapeHtml(
        sanitizeViewText(target.buildNormasSeedNoteEs)
      )}</p>`
    : '';

  const errorsHtml =
    target.validationErrors.length > 0
      ? `<ul class="pt-2 space-y-1 text-xs text-rose-700">
          ${target.validationErrors
            .map((e) => `<li>${escapeHtml(sanitizeViewText(e, 'Error de validación SQL.'))}</li>`)
            .join('')}
        </ul>`
      : '';

  return `
    <div class="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <code class="text-xs font-mono font-bold text-slate-900">${escapeHtml(target.targetFile)}</code>
        <span class="text-xs font-semibold ${statusColorClass}">${escapeHtml(statusLabel)}</span>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1 border-t border-slate-100">
        <div>
          <div class="text-[11px] text-slate-500">Nuevas</div>
          <div class="font-bold text-emerald-700 tabular-nums mt-0.5">${target.counts.toInsert.toLocaleString('es-ES')}</div>
        </div>
        <div>
          <div class="text-[11px] text-slate-500">Modificadas</div>
          <div class="font-bold text-amber-700 tabular-nums mt-0.5">${target.counts.toUpdate.toLocaleString('es-ES')}</div>
        </div>
        <div>
          <div class="text-[11px] text-slate-500">Archivadas / M:N</div>
          <div class="font-bold text-slate-800 tabular-nums mt-0.5">${target.counts.toArchiveOrDelete.toLocaleString('es-ES')}</div>
        </div>
        <div>
          <div class="text-[11px] text-slate-500">Tablas c/ cambio</div>
          <div class="font-bold text-slate-900 tabular-nums mt-0.5">${target.counts.tablesWithChanges.toLocaleString('es-ES')}</div>
        </div>
      </div>

      ${noteText}
      ${errorsHtml}
    </div>
  `;
}

function renderDiffTableRow(row: SeedSyncTableDiffSummary): string {
  const safeLabel = sanitizeViewText(row.tableLabelEs, row.table);
  const safeSamples = (row.sampleLabels || [])
    .map((label) => sanitizeViewText(label))
    .filter(Boolean)
    .slice(0, 3);
  const sampleText = safeSamples.length > 0 ? safeSamples.join(' · ') : '—';
  const fileLabel = row.targetFile ?? '06_datos_prueba.sql';
  const fkNote = row.isFkSupport ? ' · Soporte FK' : '';

  return `
    <tr class="${row.hasChanges ? 'bg-white hover:bg-slate-50/70' : 'bg-slate-50/30 text-slate-500'}">
      <td class="px-4 py-2.5 align-top">
        <div class="text-xs font-semibold text-slate-900 truncate">${escapeHtml(safeLabel)}</div>
        <div class="text-[11px] font-mono text-slate-500 truncate">${escapeHtml(row.table)}</div>
      </td>
      <td class="px-3 py-2.5 align-top text-[11px] text-slate-600">
        <div class="font-mono truncate">${escapeHtml(fileLabel)}</div>
        ${fkNote ? `<div class="text-slate-500">${escapeHtml(fkNote.replace(/^ · /, ''))}</div>` : ''}
      </td>
      <td class="px-3 py-2.5 align-top text-right text-xs font-semibold tabular-nums ${
        row.toInsert > 0 ? 'text-emerald-700' : 'text-slate-500'
      }">
        ${row.toInsert.toLocaleString('es-ES')}
      </td>
      <td class="px-3 py-2.5 align-top text-right text-xs font-semibold tabular-nums ${
        row.toUpdate > 0 ? 'text-amber-700' : 'text-slate-500'
      }">
        ${row.toUpdate.toLocaleString('es-ES')}
      </td>
      <td class="px-3 py-2.5 align-top text-right text-xs font-semibold tabular-nums ${
        row.toArchiveOrDelete > 0 ? 'text-slate-800' : 'text-slate-500'
      }">
        ${row.toArchiveOrDelete.toLocaleString('es-ES')}
      </td>
      <td class="px-3 py-2.5 align-top text-right text-xs tabular-nums text-slate-600">
        ${row.unchanged.toLocaleString('es-ES')}
      </td>
      <td class="px-4 py-2.5 align-top text-[11px] text-slate-600 truncate" title="${escapeHtml(sampleText)}">
        ${escapeHtml(sampleText)}
      </td>
    </tr>
  `;
}

function renderPreviewSection(preview: SeedSyncPreviewResponse): string {
  const targetCardsHtml = preview.targetResults
    .map((target) => renderTargetSummaryCard(target))
    .join('');

  const safeWarnings = preview.warnings
    .map((w) => sanitizeViewText(w))
    .filter(Boolean);

  const warningsHtml =
    safeWarnings.length > 0
      ? `
        <div class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 space-y-1">
          <div class="font-semibold">Advertencias operativas (${safeWarnings.length})</div>
          <ul class="list-disc pl-4 space-y-0.5">
            ${safeWarnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}
          </ul>
        </div>
      `
      : '';

  const cascadeItemsHtml =
    preview.plan.cascadeSummaries.length > 0
      ? `
        <div class="bg-white border border-slate-200 rounded-xl px-5 py-4 space-y-2">
          <div class="text-xs font-semibold text-slate-900">
            Alcance resuelto (${preview.plan.primaryTables.length} tablas principales${
              preview.plan.fkSupportTables.length > 0
                ? ` · ${preview.plan.fkSupportTables.length} tablas de soporte FK`
                : ''
            })
          </div>
          <ul class="space-y-1 text-[11px] text-slate-600">
            ${preview.plan.cascadeSummaries
              .map(
                (cs) => `
                  <li>
                    <span class="font-semibold text-slate-800">${escapeHtml(sanitizeViewText(cs.labelEs))}:</span>
                    <span>${escapeHtml(sanitizeViewText(cs.summaryEs))}</span>
                    <span class="text-slate-400">·</span>
                    <code class="font-mono text-slate-500">${escapeHtml(cs.targetFile)}</code>
                  </li>
                `
              )
              .join('')}
          </ul>
        </div>
      `
      : '';

  const rowsHtml =
    preview.summaryByTable.length > 0
      ? preview.summaryByTable.map((row) => renderDiffTableRow(row)).join('')
      : `
        <tr>
          <td colspan="7" class="px-4 py-6 text-center text-xs text-slate-500">
            No se encontraron diferencias para las secciones seleccionadas.
          </td>
        </tr>
      `;

  const snippetsText =
    preview.previewSnippets.length > 0
      ? preview.previewSnippets.join('\n\n')
      : '-- Sin fragmentos SQL pendientes para mostrar.';

  return `
    <div class="space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        ${targetCardsHtml}
      </div>

      ${warningsHtml}
      ${cascadeItemsHtml}

      <section class="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div class="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-sm font-bold text-slate-900">Resumen de diferencias por tabla</h2>
          <span class="text-xs text-slate-500 tabular-nums">
            ${preview.summaryByTable.length} tablas evaluadas
          </span>
        </div>
        <div class="overflow-x-auto">
          <table class="table-fixed w-full border-collapse">
            <colgroup>
              <col style="width: 28%" />
              <col style="width: 16%" />
              <col style="width: 9%" />
              <col style="width: 10%" />
              <col style="width: 11%" />
              <col style="width: 9%" />
              <col style="width: 17%" />
            </colgroup>
            <thead>
              <tr class="bg-slate-50 border-b border-slate-200 text-left text-[11px] font-semibold text-slate-600">
                <th scope="col" class="px-4 py-2.5">Tabla</th>
                <th scope="col" class="px-3 py-2.5">Archivo</th>
                <th scope="col" class="px-3 py-2.5 text-right">Nuevas</th>
                <th scope="col" class="px-3 py-2.5 text-right">Modificadas</th>
                <th scope="col" class="px-3 py-2.5 text-right">Archivadas / Enlaces</th>
                <th scope="col" class="px-3 py-2.5 text-right">Sin Cambios</th>
                <th scope="col" class="px-4 py-2.5">Ejemplos Legibles</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      </section>

      <details class="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <summary class="px-5 py-3.5 text-xs font-semibold text-slate-800 cursor-pointer hover:bg-slate-50 select-none">
          Inspeccionar SQL generado (${preview.previewSnippets.length} fragmentos)
        </summary>
        <div class="border-t border-slate-200 bg-slate-950 text-slate-100 p-4 overflow-x-auto max-h-96 overflow-y-auto">
          <pre class="text-[11px] font-mono leading-relaxed whitespace-pre-wrap">${escapeHtml(snippetsText)}</pre>
        </div>
      </details>
    </div>
  `;
}

function renderApplyConfirmationBanner(state: DatabaseSeedSyncState): string {
  const applied = state.applyResult;
  if (!applied) return '';

  const filesText = applied.updatedFiles
    .map((f) =>
      f.written
        ? `${f.fileName} actualizado (${formatFileSizeKb(f.sizeBytes)} · ${f.tablesChanged} tablas)`
        : `${f.fileName} sin cambios`
    )
    .join(' · ');

  return `
    <div class="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div class="space-y-1">
        <div class="text-xs font-bold text-emerald-900">
          Sincronización SQL aplicada correctamente · ${escapeHtml(formatTimestampEs(applied.appliedAt))}
        </div>
        <div class="text-xs text-emerald-800 tabular-nums">
          ${escapeHtml(sanitizeViewText(filesText))}
        </div>
      </div>
      <button
        type="button"
        data-nav="database-backup"
        data-nav-reset="true"
        class="px-3.5 py-2 border border-emerald-300 bg-white hover:bg-emerald-100/60 text-emerald-900 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-center"
      >
        Ir a Respaldo DB / Reinicio SQL
      </button>
    </div>
  `;
}

export function renderDatabaseSeedSyncView(state: DatabaseSeedSyncState): string {
  const blocks = state.catalog?.blocks ?? SQL_SEED_SYNC_BLOCKS;
  const totalSections = blocks.reduce((acc, blk) => acc + blk.sections.length, 0);
  const selectedSet = new Set(state.selectedSectionIds);
  const busy = state.analyzing || state.applying;

  const filesMetaText =
    state.catalog && state.catalog.files.length > 0
      ? state.catalog.files
          .map((f) =>
            f.exists
              ? `${f.fileName} (${formatFileSizeKb(f.sizeBytes)} · ${f.lineCount.toLocaleString('es-ES')} líneas)`
              : `${f.fileName} (no encontrado)`
          )
          .join(' · ')
      : state.loadingCatalog
        ? 'Cargando catálogo vivo y metadatos de scripts SQL...'
        : 'Reconcilia cambios de PostgreSQL hacia 06_datos_prueba.sql y 07_normas_requisitos_csv.sql.';

  const errorHtml = state.error
    ? `<div class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800">${escapeHtml(
        sanitizeViewText(state.error, 'Ocurrió un error al procesar la sincronización SQL.')
      )}</div>`
    : '';

  const applyBannerHtml = renderApplyConfirmationBanner(state);

  const blockCardsHtml = blocks
    .map((block) => renderBlockCard(block, state, selectedSet))
    .join('');

  const canPreview = state.selectedSectionIds.length > 0 && !busy;
  const canApply = Boolean(state.previewResult?.canApply) && !busy;

  let step2Hint = 'Paso 1: analiza las diferencias antes de aplicar cambios a disco.';
  if (state.previewResult) {
    if (!state.previewResult.hasChanges) {
      step2Hint = 'Los scripts SQL ya coinciden con los registros actuales de PostgreSQL.';
    } else if (!state.previewResult.canApply) {
      step2Hint = 'Corrige las observaciones de validación antes de guardar cambios.';
    } else {
      step2Hint = 'Vista previa validada y lista para escribir de forma atómica en disco.';
    }
  }

  return `
    <main class="flex-1 ${APP_SHELL_CONTAINER_CLASS} py-8 sm:py-10 space-y-5">
      <header class="bg-white border border-slate-200 rounded-xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div class="space-y-1">
          <div class="text-xs font-semibold text-slate-500">Administración · Sincronización SQL</div>
          <h1 class="text-2xl font-bold tracking-tight text-slate-900" style="text-wrap: balance;">
            Sincronización SQL de Scripts Semilla
          </h1>
          <p class="text-xs text-slate-500 tabular-nums">
            ${escapeHtml(sanitizeViewText(filesMetaText))}
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2 self-start lg:self-center">
          <button
            type="button"
            data-action="toggle-sync-all"
            ${busy ? 'disabled' : ''}
            class="px-3.5 py-2 border border-slate-300 hover:border-slate-400 disabled:opacity-50 text-slate-800 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            Seleccionar Todo
          </button>
          <button
            type="button"
            data-action="clear-sync-selection"
            ${busy || state.selectedSectionIds.length === 0 ? 'disabled' : ''}
            class="px-3.5 py-2 border border-slate-300 hover:border-slate-400 disabled:opacity-50 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            Limpiar Selección
          </button>
        </div>
      </header>

      ${errorHtml}
      ${applyBannerHtml}

      <section class="bg-white border border-slate-200 rounded-xl px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="text-xs text-slate-700 tabular-nums">
          <span class="font-semibold text-slate-900">${state.selectedSectionIds.length}</span> de ${totalSections} secciones seleccionadas
          ${state.loadingCatalog ? '<span class="text-slate-400"> · Actualizando conteo vivo...</span>' : ''}
        </div>

        <label class="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
          <input
            type="checkbox"
            data-action="toggle-sync-fk-support"
            ${state.includeFkSupport ? 'checked' : ''}
            ${busy ? 'disabled' : ''}
            class="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
          />
          <span>Incluir dependencias padre (FK) faltantes</span>
        </label>
      </section>

      <div class="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
        ${blockCardsHtml}
      </div>

      <section class="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div class="text-xs text-slate-600">
          ${escapeHtml(step2Hint)}
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-action="preview-sql-seed-sync"
            ${canPreview ? '' : 'disabled'}
            class="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            ${state.analyzing ? 'Analizando diferencias...' : '🔍 Analizar Diferencias (Vista Previa)'}
          </button>

          <button
            type="button"
            data-action="apply-sql-seed-sync"
            ${canApply ? '' : 'disabled'}
            class="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            ${state.applying ? 'Aplicando sincronización...' : '💾 Aplicar Sincronización a Archivos SQL'}
          </button>
        </div>
      </section>

      ${state.previewResult ? renderPreviewSection(state.previewResult) : ''}
    </main>
  `;
}
