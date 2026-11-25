/**
 * Step 3.1 — Renderer Compartido: Multi View por `Organización` + Pop-up Agrupado por Auditoría Vinculada
 *
 * Provee los dos renderizadores reutilizables para las 13 secciones (`Vínculo` + 12 subvistas de Bloque 1):
 * 1. `renderOrgMultiView(...)`: envuelve `renderUniversalTemplate` con filas por `Organización`,
 *    facetas laterales reactivas, vista Grid (tarjetas clicables) y vista List (`table-fixed`,
 *    `<colgroup>` 100%, 0 `<button>` en `<tbody>`).
 * 2. `renderOrgCertPickerModal(...)`: pop-up modal accesible (`role="dialog"`, `aria-modal="true"`)
 *    con barra de búsqueda interna única y tabla estructurada con `rowspan` dinámico en Columna 1
 *    (agrupando certificados por su auditoría vinculada o caja de vínculo) y 1 certificado por fila
 *    en Columna 2 + columnas extensibles de dominio.
 *
 * Invariantes:
 * - TypeScript `strict: true` con 0 `any` / `as any`.
 * - Zero-UUID en contenido visible, tooltips y placeholders.
 * - Idioma 100% español.
 * - `table-fixed`, `<colgroup>` sumando `100%` y `0 <button>` dentro de `<tbody>`.
 */

import type { ArchivedItemEntry } from '../lib/archiveGovernance';
import type { ActorDirectoryEntry } from '../lib/auditLog';
import type { AuditLinkNature } from '../lib/auditPlanningEngine';
import { escapeHtml } from '../lib/html';
import {
  buildDefaultOrgMultiViewFacetCategories,
  filterOrgMultiViewRows,
  sanitizePickerText,
  type OrgCertPickerModalModel,
  type OrgMultiViewRow,
  type OrgPickerGroupingMode,
  type OrgPickerTableRow,
} from '../lib/orgMultiViewPickerDomain';
import {
  computeReactiveFacetCounts,
  resolveColumnWidthPercentages,
  sortItems,
  type ColumnDefinition,
  type FacetGroup,
  type MultiViewFacetCategory,
  type MultiViewSelectionMap,
  type SortState,
  type UniversalViewMode,
} from '../lib/universalTemplate';
import { renderUniversalTemplate } from './universalTemplate';

export interface OrgPickerDomainColumn<TSectionCertMeta = Record<string, never>> {
  id: string;
  header: string;
  align?: 'left' | 'center' | 'right';
  defaultWidthPct?: number;
  minWidthPx?: number;
  className?: string;
  renderCell: (row: OrgPickerTableRow<TSectionCertMeta>) => string;
}

export interface OrgMultiViewProps<TSectionCertMeta = Record<string, never>> {
  domainKey?: string;
  tableId?: string;
  title: string;
  subtitle?: string;
  entityLabel?: string;
  groupingMode?: OrgPickerGroupingMode;
  rows: ReadonlyArray<OrgMultiViewRow<TSectionCertMeta>>;
  searchQuery: string;
  searchPlaceholder?: string;
  searchInputId?: string;
  clearSearchBtnId?: string;
  viewMode: UniversalViewMode;
  isSidebarOpen?: boolean;
  sortState?: SortState;
  columnWidths?: Record<string, number>;
  facetCategories?: ReadonlyArray<MultiViewFacetCategory<OrgMultiViewRow<TSectionCertMeta>>>;
  facetSelections?: MultiViewSelectionMap;
  precomputedFacetGroups?: FacetGroup[];
  precomputedFilteredRows?: ReadonlyArray<OrgMultiViewRow<TSectionCertMeta>>;
  extraColumns?: ReadonlyArray<ColumnDefinition<OrgMultiViewRow<TSectionCertMeta>>>;
  renderCardExtra?: (row: OrgMultiViewRow<TSectionCertMeta>) => string;
  actionsHtml?: string;
  topBannerHtml?: string;
  inlineFormHtml?: string;
  emptyStateTitle?: string;
  emptyStateMessage?: string;
  emptyStateActionHtml?: string;
  loading?: boolean;
  loadingMessage?: string;
  canInspectArchived?: boolean;
  showArchived?: boolean;
  archivedItems?: ArchivedItemEntry[];
  actorDirectory?: Record<string, ActorDirectoryEntry>;
  restoringId?: string | null;
  pickerModalHtml?: string;
}

export interface OrgCertPickerModalProps<TSectionCertMeta = Record<string, never>> {
  model: OrgCertPickerModalModel<TSectionCertMeta> | null | undefined;
  domainColumns?: ReadonlyArray<OrgPickerDomainColumn<TSectionCertMeta>>;
  subtitle?: string;
  emptySearchMessage?: string;
  columnWidths?: Record<string, number>;
}

function getNatureBadgeClass(nature: AuditLinkNature | null): string {
  switch (nature) {
    case 'Combinada':
      return 'bg-violet-50 text-violet-800 border-violet-200';
    case 'Integrada':
      return 'bg-indigo-50 text-indigo-800 border-indigo-200';
    case 'Conjunta':
      return 'bg-blue-50 text-blue-800 border-blue-200';
    case 'Simultánea':
      return 'bg-cyan-50 text-cyan-800 border-cyan-200';
    case 'Multientidad':
      return 'bg-teal-50 text-teal-800 border-teal-200';
    case 'Mixta':
      return 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200';
    case 'Individual':
      return 'bg-sky-50 text-sky-800 border-sky-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

function formatNormasSummary(normas: ReadonlyArray<string>): string {
  if (normas.length === 0) return 'Sin norma';
  if (normas.length <= 2) return normas.join(', ');
  return `${normas.slice(0, 2).join(', ')} (+${normas.length - 2})`;
}

/**
 * Renderiza el Multi View estandarizado basado en `Organización` sobre `renderUniversalTemplate`.
 * Al hacer clic en cualquier fila (List) o tarjeta (Grid), dispara `open-org-cert-picker`.
 */
export function renderOrgMultiView<TSectionCertMeta = Record<string, never>>(
  props: OrgMultiViewProps<TSectionCertMeta>
): string {
  const {
    domainKey,
    tableId,
    title,
    subtitle,
    entityLabel = 'organizaciones',
    groupingMode = 'audit',
    rows,
    searchQuery,
    searchPlaceholder = "Buscar por organización, certificado, norma, código o codename... (Presione '/' para enfocar)",
    searchInputId,
    clearSearchBtnId,
    viewMode,
    isSidebarOpen = true,
    sortState = { column: null, direction: 'none' },
    columnWidths,
    facetCategories = buildDefaultOrgMultiViewFacetCategories<TSectionCertMeta>(),
    facetSelections = {},
    precomputedFacetGroups,
    precomputedFilteredRows,
    extraColumns = [],
    renderCardExtra,
    actionsHtml = '',
    topBannerHtml = '',
    inlineFormHtml = '',
    emptyStateTitle = 'No se encontraron organizaciones',
    emptyStateMessage = 'Ajuste la búsqueda o los filtros laterales para visualizar organizaciones y certificados disponibles.',
    emptyStateActionHtml = '',
    loading = false,
    loadingMessage = 'Cargando organizaciones...',
    canInspectArchived = false,
    showArchived = false,
    archivedItems = [],
    actorDirectory,
    restoringId = null,
    pickerModalHtml = '',
  } = props;

  const searchOptions = {
    getSearchableText: (row: OrgMultiViewRow<TSectionCertMeta>) => row.searchHaystack,
  };

  const facetGroups =
    precomputedFacetGroups ??
    computeReactiveFacetCounts(
      [...rows],
      searchQuery,
      facetCategories,
      facetSelections,
      searchOptions
    );

  const filtered = precomputedFilteredRows
    ? [...precomputedFilteredRows]
    : filterOrgMultiViewRows(rows, searchQuery, facetCategories, facetSelections);

  const hasExtraCols = extraColumns.length > 0;
  const standardColumns: ColumnDefinition<OrgMultiViewRow<TSectionCertMeta>>[] = [
    {
      id: 'organizacion',
      header: 'Organización',
      sortable: true,
      defaultWidthPct: hasExtraCols ? 30 : 42,
      minWidthPx: 170,
      getValue: (row) => row.nombreCorto,
      renderCell: (row) => {
        const secondaryParts = [row.conglomeradoShortName, row.rif].filter(Boolean).join(' · ');
        return `
          <div class="min-w-0 space-y-0.5">
            <div class="font-bold text-slate-900 truncate" title="${escapeHtml(row.nombre)}">
              ${escapeHtml(row.nombreCorto)}
            </div>
            <div class="text-[11px] text-slate-500 truncate" title="${escapeHtml(secondaryParts)}">
              ${escapeHtml(secondaryParts || 'Independiente')}
            </div>
          </div>
        `;
      },
    },
    {
      id: 'certificados',
      header: 'Certificados',
      sortable: true,
      defaultWidthPct: hasExtraCols ? 22 : 28,
      minWidthPx: 120,
      getValue: (row) => row.certsCount,
      renderCell: (row) => {
        const normasLabel = formatNormasSummary(row.normas);
        return `
          <div class="min-w-0 space-y-0.5">
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-200 tabular-nums">
              ${row.certsCount} ${row.certsCount === 1 ? 'certificado' : 'certificados'}
            </span>
            <div class="text-[11px] text-slate-500 truncate" title="${escapeHtml(row.normas.join(', '))}">
              ${escapeHtml(normasLabel)}
            </div>
          </div>
        `;
      },
    },
    {
      id: 'auditorias',
      header: groupingMode === 'vinculo' ? 'Vínculos / Cajas' : 'Auditorías / Vínculos',
      sortable: true,
      defaultWidthPct: hasExtraCols ? 22 : 30,
      minWidthPx: 130,
      getValue: (row) =>
        groupingMode === 'vinculo' ? row.linkedVinculoBoxesCount : row.auditsCount,
      renderCell: (row) => {
        const linkedCount =
          groupingMode === 'vinculo'
            ? row.linkedVinculoBoxesCount
            : row.linkedAuditGroupsCount;
        const auditText = `${row.auditsCount} ${row.auditsCount === 1 ? 'auditoría' : 'auditorías'}`;
        const linkedBadge =
          linkedCount > 0
            ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-50 text-violet-800 border border-violet-200 whitespace-nowrap">${linkedCount} ${
                linkedCount === 1 ? 'vinculada' : 'vinculadas'
              }</span>`
            : `<span class="text-[11px] text-slate-400">Sin vinculadas</span>`;
        return `
          <div class="min-w-0 space-y-0.5">
            <div class="text-xs font-semibold text-slate-800 tabular-nums truncate">${escapeHtml(auditText)}</div>
            <div class="truncate">${linkedBadge}</div>
          </div>
        `;
      },
    },
  ];

  const allColumns: ColumnDefinition<OrgMultiViewRow<TSectionCertMeta>>[] = [
    ...standardColumns,
    ...extraColumns,
  ];

  const sortedItems = sortItems(
    filtered,
    sortState.column,
    sortState.direction,
    (row, colId) => {
      const colDef = allColumns.find((c) => c.id === colId);
      if (colDef?.getValue) return colDef.getValue(row);
      if (colId === 'organizacion') return row.nombreCorto;
      if (colId === 'certificados') return row.certsCount;
      if (colId === 'auditorias') return row.auditsCount;
      return row.nombreCorto;
    }
  );

  const universalHtml = renderUniversalTemplate<OrgMultiViewRow<TSectionCertMeta>>({
    domainKey,
    tableId,
    title,
    subtitle,
    entityLabel,
    searchQuery,
    searchPlaceholder,
    searchInputId,
    clearSearchBtnId,
    totalCount: rows.length,
    filteredCount: sortedItems.length,
    viewMode,
    isSidebarOpen,
    sortState,
    columnWidths,
    getRowAttrs: (row) =>
      `data-action="open-org-cert-picker" data-org-id="${escapeHtml(row.orgId)}"`,
    facetGroups,
    items: sortedItems,
    columns: allColumns,
    renderCard: (row) => {
      const linkedCount =
        groupingMode === 'vinculo'
          ? row.linkedVinculoBoxesCount
          : row.linkedAuditGroupsCount;
      const extraHtml = renderCardExtra ? renderCardExtra(row) : '';
      const normasLabel = formatNormasSummary(row.normas);
      return `
        <article
          role="button"
          tabindex="0"
          data-action="open-org-cert-picker"
          data-org-id="${escapeHtml(row.orgId)}"
          aria-label="Seleccionar certificados de ${escapeHtml(row.nombreCorto)}"
          class="group bg-white border border-slate-200 rounded-xl p-4 shadow-2xs hover:border-indigo-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition-all cursor-pointer flex flex-col justify-between gap-3"
        >
          <div class="space-y-2 min-w-0">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <h3 class="text-sm font-bold text-slate-900 truncate" title="${escapeHtml(row.nombre)}">
                  ${escapeHtml(row.nombreCorto)}
                </h3>
                <p class="text-[11px] text-slate-500 truncate">
                  ${escapeHtml(row.conglomeradoShortName)}${row.rif ? ` · ${escapeHtml(row.rif)}` : ''}
                </p>
              </div>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 tabular-nums whitespace-nowrap shrink-0">
                ${row.certsCount} cert.
              </span>
            </div>

            <div class="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span class="px-2 py-0.5 rounded bg-slate-50 border border-slate-200 text-slate-700 truncate max-w-full" title="${escapeHtml(row.normas.join(', '))}">
                ${escapeHtml(normasLabel)}
              </span>
              ${
                linkedCount > 0
                  ? `<span class="px-2 py-0.5 rounded bg-violet-50 border border-violet-200 text-violet-800 font-semibold whitespace-nowrap">${linkedCount} ${
                      linkedCount === 1 ? 'vinculada' : 'vinculadas'
                    }</span>`
                  : ''
              }
            </div>

            ${extraHtml}
          </div>

          <div class="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px]">
            <span class="text-slate-500 tabular-nums">
              ${row.auditsCount} ${row.auditsCount === 1 ? 'auditoría' : 'auditorías'}
            </span>
            <span class="font-semibold text-indigo-600 group-hover:text-indigo-700 whitespace-nowrap">
              Ver certificados →
            </span>
          </div>
        </article>
      `;
    },
    actionsHtml,
    topBannerHtml,
    inlineFormHtml,
    emptyStateTitle,
    emptyStateMessage,
    emptyStateActionHtml,
    loading,
    loadingMessage,
    canInspectArchived,
    showArchived,
    archivedItems,
    actorDirectory,
    restoringId,
  });

  return pickerModalHtml ? `${universalHtml}\n${pickerModalHtml}` : universalHtml;
}

function buildDefaultDomainColumns<TSectionCertMeta>(): OrgPickerDomainColumn<TSectionCertMeta>[] {
  return [
    {
      id: 'auditoria_estado',
      header: 'Auditoría / Estatus',
      defaultWidthPct: 44,
      minWidthPx: 140,
      renderCell: (row) => {
        const auditCode = sanitizePickerText(row.latestAudit?.codigo_auditoria);
        const auditText = sanitizePickerText(row.domainCells.auditoria, 'Sin auditorías');
        const estatusText = sanitizePickerText(row.domainCells.estatus, row.estatus);
        return `
          <div class="min-w-0 space-y-0.5">
            <div class="text-xs font-semibold text-slate-800 truncate" title="${escapeHtml(
              auditCode ? `${auditText} · ${auditCode}` : auditText
            )}">
              ${escapeHtml(auditText)}
            </div>
            <div class="text-[11px] text-slate-500 truncate">
              ${escapeHtml(estatusText)}
            </div>
          </div>
        `;
      },
    },
  ];
}

interface ModalTableColumnSpec<TSectionCertMeta> {
  id: string;
  header: string;
  align?: 'left' | 'center' | 'right';
  defaultWidthPct?: number;
  minWidthPx?: number;
  className?: string;
  renderCell?: (row: OrgPickerTableRow<TSectionCertMeta>) => string;
}

/**
 * Renderiza el Pop-up Modal por `Organización`:
 * - Barra de búsqueda interna única (`data-action="search-org-picker-modal"`).
 * - Tabla estructurada (`table-fixed`, `<colgroup>` 100%, `0 <button>` en `<tbody>`).
 * - Columna 1 con `rowspan` dinámico para auditorías vinculadas (solo en `row.isFirstRowInGroup`).
 * - Columna 2 con 1 certificado por fila.
 * - Columnas 3..N extensibles por dominio.
 */
export function renderOrgCertPickerModal<TSectionCertMeta = Record<string, never>>(
  props: OrgCertPickerModalProps<TSectionCertMeta>
): string {
  const {
    model,
    domainColumns,
    subtitle = 'Seleccione un certificado para abrir la Vista Detalle de esta sección.',
    emptySearchMessage = 'No hay certificados que coincidan con el criterio de búsqueda.',
    columnWidths,
  } = props;

  if (!model) return '';

  const resolvedDomainColumns =
    domainColumns && domainColumns.length > 0
      ? domainColumns
      : buildDefaultDomainColumns<TSectionCertMeta>();

  const col1Header =
    model.groupingMode === 'vinculo'
      ? 'Vínculo / Agrupación'
      : 'Auditoría Vinculada / Tipo';

  const allColumns: ModalTableColumnSpec<TSectionCertMeta>[] = [
    {
      id: 'auditoria_vinculada',
      header: col1Header,
      align: 'left',
      defaultWidthPct: 26,
      minWidthPx: 135,
    },
    {
      id: 'certificado',
      header: 'Certificado',
      align: 'left',
      defaultWidthPct: 26,
      minWidthPx: 140,
    },
    ...resolvedDomainColumns.map((col) => ({
      id: col.id,
      header: col.header,
      align: col.align ?? 'left',
      defaultWidthPct: col.defaultWidthPct,
      minWidthPx: col.minWidthPx ?? 96,
      className: col.className,
      renderCell: col.renderCell,
    })),
  ];

  const normalizedWidths = resolveColumnWidthPercentages(allColumns, columnWidths);
  const colgroupHtml = `
    <colgroup>
      ${allColumns
        .map((col) => {
          const pct = normalizedWidths[col.id] ?? 100 / allColumns.length;
          const minW = col.minWidthPx ?? 96;
          return `<col data-col-id="${escapeHtml(col.id)}" data-min-width="${minW}" style="width: ${pct.toFixed(2)}%;" />`;
        })
        .join('')}
    </colgroup>
  `;

  const hasModalQuery = model.searchQuery.length > 0;
  const countsLabel = `${model.totalCertsCount} ${
    model.totalCertsCount === 1 ? 'certificado' : 'certificados'
  } · ${model.totalAuditsCount} ${
    model.totalAuditsCount === 1 ? 'auditoría' : 'auditorías'
  }${
    model.linkedGroupsCount > 0
      ? ` · ${model.linkedGroupsCount} ${
          model.linkedGroupsCount === 1 ? 'grupo vinculado' : 'grupos vinculados'
        }`
      : ''
  }`;

  const tableHtml =
    model.rows.length === 0
      ? `
        <div class="rounded-xl border border-slate-200 bg-slate-50/70 p-8 text-center space-y-2">
          <div class="text-2xl select-none" aria-hidden="true">🔍</div>
          <p class="text-xs font-bold text-slate-800">Sin coincidencias</p>
          <p class="text-xs text-slate-500 max-w-md mx-auto">${escapeHtml(emptySearchMessage)}</p>
        </div>
      `
      : `
        <div class="bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-2xs">
          <table
            id="orgCertPickerModalTable"
            data-testid="org-picker-modal-table"
            class="w-full min-w-[640px] table-fixed text-left text-xs text-slate-700 border-collapse"
          >
            ${colgroupHtml}
            <thead class="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              <tr>
                ${allColumns
                  .map((col) => {
                    const alignClass =
                      col.align === 'center'
                        ? 'text-center'
                        : col.align === 'right'
                        ? 'text-right'
                        : 'text-left';
                    return `
                      <th
                        scope="col"
                        data-col-header="${escapeHtml(col.id)}"
                        class="px-3 py-2.5 border-r border-slate-200/60 last:border-r-0 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap ${alignClass} ${col.className || ''}"
                      >
                        <span class="block truncate" title="${escapeHtml(col.header)}">${escapeHtml(
                          col.header
                        )}</span>
                      </th>
                    `;
                  })
                  .join('')}
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200/70">
              ${model.rows
                .map((row) => {
                  const certIdEsc = escapeHtml(row.certId);
                  const auditIdEsc = escapeHtml(row.auditId || '');
                  const versionLabel =
                    row.version_numero !== null ? `v${row.version_numero}` : '';

                  // Column 1: rendered ONLY when row.isFirstRowInGroup === true
                  // When groupRowSpan > 1, mark cell with a non-navigating action so clicking
                  // the shared rowspan cell beside rows 2+ never ambiguously opens row 1.
                  const col1Html = row.isFirstRowInGroup
                    ? (() => {
                        const badgeCountLabel = row.isLinkedGroup
                          ? row.groupTotalCount > row.groupRowSpan
                            ? `${row.groupBadgeText} (${row.groupRowSpan}/${row.groupTotalCount})`
                            : `${row.groupBadgeText} (${row.groupRowSpan})`
                          : row.groupBadgeText;
                        const isMultiRowSpan = row.groupRowSpan > 1;
                        const groupCellAttrs = isMultiRowSpan
                          ? 'data-action="org-picker-group-info" data-picker-group-cell="true"'
                          : `data-action="select-org-picker-cert" data-cert-id="${certIdEsc}" data-audit-id="${auditIdEsc}"`;
                        return `
                          <td
                            rowspan="${row.groupRowSpan}"
                            ${groupCellAttrs}
                            title="${escapeHtml(row.groupLabel)}"
                            class="px-3 py-2.5 border-r border-slate-200/70 align-top min-w-0 ${
                              row.isLinkedGroup ? 'bg-violet-50/35' : 'bg-slate-50/50'
                            } ${isMultiRowSpan ? 'cursor-default' : 'cursor-pointer'}"
                          >
                            <div class="min-w-0 space-y-1">
                              <span class="inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-bold max-w-full truncate ${getNatureBadgeClass(
                                row.groupNature
                              )}">
                                ${escapeHtml(badgeCountLabel)}
                              </span>
                              ${
                                row.groupSubLabel
                                  ? `<div class="text-[11px] text-slate-600 truncate" title="${escapeHtml(
                                      row.groupSubLabel
                                    )}">${escapeHtml(row.groupSubLabel)}</div>`
                                  : ''
                              }
                            </div>
                          </td>
                        `;
                      })()
                    : '';

                  const col2Html = `
                    <td
                      data-action="select-org-picker-cert"
                      data-cert-id="${certIdEsc}"
                      data-audit-id="${auditIdEsc}"
                      class="px-3 py-2.5 border-r border-slate-200/60 align-middle min-w-0 overflow-hidden cursor-pointer hover:bg-indigo-50/60 transition-colors"
                    >
                      <div class="min-w-0 space-y-0.5">
                        <div class="flex items-center gap-1.5 min-w-0">
                          <span class="font-mono font-bold text-slate-900 truncate">${escapeHtml(
                            row.numero_certificado
                          )}</span>
                          ${
                            versionLabel
                              ? `<span class="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-mono font-semibold text-slate-700 shrink-0">${escapeHtml(
                                  versionLabel
                                )}</span>`
                              : ''
                          }
                        </div>
                        <div class="text-[11px] text-slate-500 truncate">${escapeHtml(
                          row.norma_codigo
                        )}</div>
                      </div>
                    </td>
                  `;

                  const domainCellsHtml = resolvedDomainColumns
                    .map((col) => {
                      const alignClass =
                        col.align === 'center'
                          ? 'text-center'
                          : col.align === 'right'
                          ? 'text-right'
                          : 'text-left';
                      return `
                        <td
                          data-action="select-org-picker-cert"
                          data-cert-id="${certIdEsc}"
                          data-audit-id="${auditIdEsc}"
                          class="px-3 py-2.5 border-r border-slate-200/60 last:border-r-0 align-middle min-w-0 overflow-hidden cursor-pointer hover:bg-indigo-50/60 transition-colors ${alignClass} ${col.className || ''}"
                        >
                          <div class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap [&>*]:max-w-full [&>*]:truncate">
                            ${col.renderCell(row)}
                          </div>
                        </td>
                      `;
                    })
                    .join('');

                  return `
                    <tr
                      data-action="select-org-picker-cert"
                      data-cert-id="${certIdEsc}"
                      data-audit-id="${auditIdEsc}"
                      data-group-key="${escapeHtml(row.groupKey)}"
                      tabindex="0"
                      class="cursor-pointer hover:bg-indigo-50/40 focus-visible:outline-none focus-visible:bg-indigo-50/60 transition-colors"
                    >
                      ${col1Html}
                      ${col2Html}
                      ${domainCellsHtml}
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      `;

  return `
    <div
      id="orgCertPickerModal"
      data-testid="org-cert-picker-modal"
      data-action="close-org-picker-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="orgCertPickerTitle"
      class="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-[1px] flex items-center justify-center p-4"
    >
      <div class="w-full max-w-4xl max-h-[88vh] bg-white border border-slate-200 rounded-2xl shadow-xl flex flex-col overflow-hidden">
        <header class="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
          <div class="min-w-0 space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <h2
                id="orgCertPickerTitle"
                title="${escapeHtml(model.orgNombre)}"
                class="text-base font-bold text-slate-900 truncate"
              >
                ${escapeHtml(model.orgNombreCorto)}
              </h2>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 tabular-nums whitespace-nowrap">
                ${escapeHtml(countsLabel)}
              </span>
            </div>
            <p class="text-xs text-slate-500">
              ${escapeHtml(subtitle)}
            </p>
          </div>
          <button
            type="button"
            data-action="close-org-picker-modal"
            aria-label="Cerrar selector de certificados"
            title="Cerrar"
            class="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
          >
            ✕
          </button>
        </header>

        <div class="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
          <div class="relative flex-1 min-w-[220px]">
            <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-xs" aria-hidden="true">
              🔍
            </span>
            <input
              type="search"
              id="orgPickerModalSearchInput"
              data-action="search-org-picker-modal"
              autocomplete="off"
              value="${escapeHtml(model.searchQuery)}"
              placeholder="Buscar certificado, norma, versión o auditoría vinculada..."
              aria-label="Buscar certificado en esta organización"
              class="w-full h-9 text-xs rounded-lg border border-slate-200 bg-white pl-9 pr-9 shadow-2xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
            ${
              hasModalQuery
                ? `
                  <button
                    type="button"
                    id="clearOrgPickerModalSearchBtn"
                    data-action="clear-org-picker-modal-search"
                    aria-label="Limpiar búsqueda del selector"
                    title="Limpiar búsqueda"
                    class="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    ✕
                  </button>
                `
                : ''
            }
          </div>
          <span class="text-[11px] font-semibold text-slate-500 tabular-nums whitespace-nowrap">
            Mostrando ${model.filteredCertsCount} de ${model.totalCertsCount} ${
    model.totalCertsCount === 1 ? 'certificado' : 'certificados'
  }
          </span>
        </div>

        <div class="p-4 sm:p-5 overflow-y-auto flex-1">
          ${tableHtml}
        </div>

        <footer class="px-5 py-3 border-t border-slate-200 bg-slate-50/70 flex items-center justify-between gap-3">
          <span class="text-[11px] text-slate-500">
            Haga clic en un certificado para abrir su Vista Detalle.
          </span>
          <button
            type="button"
            data-action="close-org-picker-modal"
            class="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
        </footer>
      </div>
    </div>
  `;
}
