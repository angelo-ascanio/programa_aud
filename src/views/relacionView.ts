import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import type { OrganizacionEntity } from '../lib/activeCertificates';
import type { ConglomeradoEntity } from '../lib/conglomeradoDomain';
import type { ProgramacionAuditEntity } from '../lib/auditExecution';
import type { ProgramaAuditoriaEntity } from '../lib/auditPlanningEngine';
import {
  getLinkedSiblingAudits,
  resolveAuditNavigation,
} from '../lib/certificateAuditSelector';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import type { SoftDeletableCertificado, VinculoEntity } from '../lib/vinculoDomain';
import {
  buildRelacionDetailModel,
  buildRelacionMultiRows,
  buildRelacionPickerModel,
  DEFAULT_RELACION_VIEW_STATE,
  filterRelacionMultiRows,
  RELACION_FACET_CATEGORIES,
  type RelacionDetailAuditRow,
  type RelacionDetailModel,
  type RelacionMultiRow,
  type RelacionPickerModel,
  type RelacionSortColumn,
  type RelacionViewState,
} from '../lib/relacionDomain';
import {
  computeReactiveFacetCounts,
  type ColumnDefinition,
} from '../lib/universalTemplate';
import {
  extractUniversalArchiveProps,
  type ArchiveMultiViewConfig,
} from '../lib/archiveGovernance';
import { renderUniversalTemplate } from './universalTemplate';
import { renderAuditSectionShell } from './auditSectionShell';

export { DEFAULT_RELACION_VIEW_STATE as DEFAULT_RELACION_STATE };
export type { RelacionSortColumn, RelacionViewState };

export interface RelacionViewProps {
  profile: UserProfile;
  state: RelacionViewState;
  conglomerados?: ReadonlyArray<ConglomeradoEntity>;
  organizaciones?: ReadonlyArray<OrganizacionEntity>;
  certificados?: ReadonlyArray<SoftDeletableCertificado | CertificadoDetailEntity>;
  vinculos?: ReadonlyArray<VinculoEntity>;
  programs?: ReadonlyArray<ProgramaAuditoriaEntity>;
  audits?: ReadonlyArray<ProgramacionAuditEntity>;
  authorizedClientOrgIds?: ReadonlyArray<string>;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
  inCardBreadcrumbHtml?: string;
  headerAddAuditHtml?: string;
}

function getNatureBadgeClass(nature: string): string {
  switch (nature) {
    case 'Integrada':
      return 'bg-indigo-50 text-indigo-800 border-indigo-200';
    case 'Combinada':
      return 'bg-sky-50 text-sky-800 border-sky-200';
    case 'Conjunta':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    case 'Simultánea':
      return 'bg-violet-50 text-violet-800 border-violet-200';
    case 'Multientidad':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'Mixta':
      return 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

function getCycleStatusBadgeClass(status: string): string {
  switch (status) {
    case 'Cerrada':
    case 'Auditada':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    case 'En Ejecución':
      return 'bg-sky-50 text-sky-800 border-sky-200';
    case 'Programada':
      return 'bg-indigo-50 text-indigo-800 border-indigo-200';
    case 'En Programación':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'Reprogramada':
      return 'bg-orange-50 text-orange-800 border-orange-200';
    case 'Cancelada':
      return 'bg-rose-50 text-rose-800 border-rose-200';
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200';
  }
}

function mergeAuditsPool(
  audits: ReadonlyArray<ProgramacionAuditEntity>,
  programs: ReadonlyArray<ProgramaAuditoriaEntity>
): ProgramacionAuditEntity[] {
  const byId = new Map<string, ProgramacionAuditEntity>();
  for (const a of audits) {
    if (!a.deleted_at) byId.set(a.id, a);
  }
  for (const prog of programs) {
    if (prog.deleted_at) continue;
    for (const a of prog.auditorias) {
      if (!a.deleted_at && !byId.has(a.id)) byId.set(a.id, a);
    }
  }
  return Array.from(byId.values());
}

/**
 * Step 3.2 — Vista principal de `Relación` (Bloque 1 Paso 1):
 * - Multi View centrada en Organizaciones / Conglomerados + Pop-up Selector por Certificado/Auditoría
 * - Detail View limpia ("Less Is More" estilo `Tipo`) envuelta en `renderAuditSectionShell`
 */
export function renderRelacionView(props: RelacionViewProps): string {
  const {
    profile,
    state,
    conglomerados = [],
    organizaciones = [],
    certificados = [],
    vinculos = [],
    programs = [],
    audits = [],
    authorizedClientOrgIds = [],
    loading = false,
    archiveConfig,
    tableColumnWidths,
    inCardBreadcrumbHtml = '',
    headerAddAuditHtml = '',
  } = props;

  if (state.selectedCertId || state.selectedAuditId) {
    const detailModel = buildRelacionDetailModel({
      profile,
      authorizedClientOrgIds,
      conglomerados,
      organizaciones,
      certificados,
      vinculos,
      programs,
      audits,
      selectedCertId: state.selectedCertId,
      selectedAuditId: state.selectedAuditId,
    });

    if (detailModel.hasSelection) {
      return renderRelacionDetailView({
        profile,
        state,
        model: detailModel,
        authorizedClientOrgIds,
        certificados,
        programs,
        audits,
        inCardBreadcrumbHtml,
        headerAddAuditHtml,
      });
    }
  }

  const multiRows = buildRelacionMultiRows({
    profile,
    authorizedClientOrgIds,
    conglomerados,
    organizaciones,
    certificados,
    vinculos,
    programs,
    audits,
  });

  const multiViewHtml = renderRelacionMultiView({
    profile,
    state,
    allRows: multiRows,
    loading,
    archiveConfig,
    tableColumnWidths,
    headerAddAuditHtml,
  });

  const pickerModel = state.pickerTargetGroupKey
    ? buildRelacionPickerModel({
        profile,
        authorizedClientOrgIds,
        conglomerados,
        organizaciones,
        certificados,
        vinculos,
        programs,
        audits,
        pickerTargetGroupKey: state.pickerTargetGroupKey,
        multiRows,
      })
    : null;

  return pickerModel
    ? `${multiViewHtml}${renderRelacionPickerModal(pickerModel)}`
    : multiViewHtml;
}

export function renderRelacionMultiView(opts: {
  profile: UserProfile;
  state: RelacionViewState;
  allRows: ReadonlyArray<RelacionMultiRow>;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
  headerAddAuditHtml?: string;
}): string {
  const {
    profile,
    state,
    allRows,
    loading = false,
    archiveConfig,
    tableColumnWidths,
    headerAddAuditHtml = '',
  } = opts;

  const isStaff = isApprovedStaffProfile(profile);
  const selections = state.facetSelections || {};

  const facetGroups = computeReactiveFacetCounts(
    allRows,
    state.query,
    RELACION_FACET_CATEGORIES,
    selections,
    {
      getSearchableText: (row) => row.searchHaystack,
    }
  );

  const { filteredRows } = filterRelacionMultiRows(allRows, {
    query: state.query,
    facetSelections: selections,
    sortColumn: state.sortColumn,
    sortDirection: state.sortDirection,
  });

  // Strict 5-column colgroup summing 100% (26 + 26 + 18 + 16 + 14 = 100), zero <button> inside <tbody>
  const columns: ColumnDefinition<RelacionMultiRow>[] = [
    {
      id: 'organizacion',
      header: 'Organización / Conglomerado',
      defaultWidthPct: 26,
      minWidthPx: 180,
      sortable: true,
      renderCell: (row) => {
        const kindBadge =
          row.groupKind === 'CONGLOMERADO'
            ? `<span class="px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 shrink-0">Grupo (${row.orgIds.length})</span>`
            : `<span class="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 shrink-0">Org.</span>`;
        const subText =
          row.groupKind === 'CONGLOMERADO' && row.orgShortNames.length > 0
            ? row.orgShortNames.join(', ')
            : row.fullName !== row.displayName
            ? row.fullName
            : row.conglomeradoShortName;

        return `
          <div class="min-w-0 space-y-0.5" title="${escapeHtml(row.fullName)}">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="text-xs font-bold text-slate-900 truncate">${escapeHtml(row.displayName)}</span>
              ${kindBadge}
            </div>
            <div class="text-[11px] text-slate-500 truncate">${escapeHtml(subText)}</div>
          </div>
        `;
      },
    },
    {
      id: 'auditorias',
      header: 'Certificados y Codenames',
      defaultWidthPct: 26,
      minWidthPx: 180,
      sortable: true,
      renderCell: (row) => {
        const topCodenames = row.audits.slice(0, 2);
        const extraAudits = row.audits.length - topCodenames.length;
        const codenamesHtml =
          topCodenames.length > 0
            ? topCodenames
                .map(
                  (a) =>
                    `<span title="${escapeHtml(a.codenameTooltip)}" class="px-1.5 py-0.2 rounded font-mono text-[10px] font-bold bg-white text-slate-800 border border-slate-200 shrink-0">${escapeHtml(a.codename)}</span>`
                )
                .join('')
            : '<span class="text-[11px] text-slate-400">Sin auditorías</span>';

        return `
          <div class="min-w-0 space-y-0.5">
            <div class="flex items-center gap-1 min-w-0 overflow-hidden">
              ${codenamesHtml}
              ${
                extraAudits > 0
                  ? `<span class="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 shrink-0">+${extraAudits}</span>`
                  : ''
              }
            </div>
            <div class="text-[11px] text-slate-500 truncate tabular-nums">
              ${row.certsCount} cert. · ${row.auditsCount} aud.
            </div>
          </div>
        `;
      },
    },
    {
      id: 'naturaleza',
      header: 'Naturaleza',
      defaultWidthPct: 18,
      minWidthPx: 130,
      sortable: true,
      renderCell: (row) => {
        const primaryNature = row.effectiveNatures[0] ?? 'Individual';
        const extraNatures = row.effectiveNatures.length - 1;
        return `
          <div class="flex items-center gap-1 min-w-0">
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${getNatureBadgeClass(primaryNature)}">
              ${escapeHtml(primaryNature)}
            </span>
            ${
              extraNatures > 0
                ? `<span class="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 shrink-0">+${extraNatures}</span>`
                : ''
            }
          </div>
        `;
      },
    },
    {
      id: 'vinculos',
      header: 'Base Bloque 2',
      defaultWidthPct: 16,
      minWidthPx: 120,
      sortable: true,
      renderCell: (row) => {
        if (row.vinculoBoxes.length > 0) {
          const primaryBox = row.vinculoBoxes[0];
          const extraBoxes = row.vinculoBoxes.length - 1;
          return `
            <div class="flex items-center gap-1 min-w-0 max-w-full" title="${escapeHtml(primaryBox.etiqueta)}">
              <span class="inline-block min-w-0 max-w-full truncate px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200">
                ${escapeHtml(primaryBox.etiqueta)}
              </span>
              ${
                extraBoxes > 0
                  ? `<span class="px-1 py-0.2 rounded text-[10px] font-bold bg-slate-100 text-slate-600 shrink-0">+${extraBoxes}</span>`
                  : ''
              }
            </div>
          `;
        }
        return `
          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
            Libre
          </span>
        `;
      },
    },
    {
      id: 'grupo',
      header: 'Ciclo Actual',
      defaultWidthPct: 14,
      minWidthPx: 110,
      sortable: true,
      renderCell: (row) => {
        const primaryStatus = row.estadosCiclo[0] ?? null;
        if (!primaryStatus) {
          return '<span class="text-[11px] text-slate-400 whitespace-nowrap">Sin ciclo</span>';
        }
        return `
          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${getCycleStatusBadgeClass(primaryStatus)}">
            ${escapeHtml(primaryStatus)}
          </span>
        `;
      },
    },
  ];

  const renderCard = (row: RelacionMultiRow): string => {
    const primaryNature = row.effectiveNatures[0] ?? 'Individual';
    const primaryStatus = row.estadosCiclo[0] ?? 'Sin ciclo';
    const primaryBoxLabel = row.vinculoBoxes[0]?.etiqueta ?? 'Libre';
    const topAudits = row.audits.slice(0, 3);

    return `
      <article
        role="button"
        tabindex="0"
        data-action="open-relacion-picker"
        data-group-key="${escapeHtml(row.groupKey)}"
        aria-label="Seleccionar certificado o auditoría de ${escapeHtml(row.displayName)}"
        class="text-left bg-white border border-slate-200 hover:border-slate-400 rounded-xl p-3.5 shadow-2xs transition-all cursor-pointer space-y-2.5 flex flex-col justify-between"
      >
        <div class="space-y-2">
          <div class="flex items-center justify-between gap-2">
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${getNatureBadgeClass(primaryNature)}">
              ${escapeHtml(primaryNature)}
            </span>
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${getCycleStatusBadgeClass(primaryStatus)}">
              ${escapeHtml(primaryStatus)}
            </span>
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-1.5 min-w-0">
              <h3 class="text-xs font-bold text-slate-900 truncate">${escapeHtml(row.displayName)}</h3>
              ${
                row.groupKind === 'CONGLOMERADO'
                  ? `<span class="px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 shrink-0">${row.orgIds.length} org.</span>`
                  : ''
              }
            </div>
            <p class="text-[11px] text-slate-500 truncate">${escapeHtml(primaryBoxLabel)} · ${row.certsCount} cert.</p>
          </div>
          <div class="flex flex-wrap items-center gap-1">
            ${
              topAudits.length > 0
                ? topAudits
                    .map(
                      (a) =>
                        `<span title="${escapeHtml(a.codenameTooltip)}" class="px-1.5 py-0.5 rounded font-mono text-[10px] font-bold bg-slate-50 text-slate-800 border border-slate-200">${escapeHtml(a.codename)}</span>`
                    )
                    .join('')
                : '<span class="text-[11px] text-slate-400">Sin auditorías activas</span>'
            }
          </div>
        </div>
        <div class="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-600">
          <span class="tabular-nums">${row.auditsCount} auditoría(s)</span>
          <span class="font-bold text-indigo-700">Seleccionar →</span>
        </div>
      </article>
    `;
  };

  const archiveProps = extractUniversalArchiveProps(archiveConfig, 'programacion');

  return renderUniversalTemplate<RelacionMultiRow>({
    domainKey: 'relacion',
    tableId: 'relacion-main',
    title: 'Relación de Auditorías',
    subtitle:
      'Paso 1 del ciclo de auditoría por organización o conglomerado, naturaleza efectiva y base de Vínculo.',
    entityLabel: 'grupos',
    searchQuery: state.query,
    searchPlaceholder:
      'Buscar por organización, conglomerado, certificado, codename o naturaleza...',
    searchInputId: 'relacionSearchInput',
    clearSearchBtnId: 'clearRelacionSearchBtn',
    totalCount: allRows.length,
    filteredCount: filteredRows.length,
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen,
    sortState: { column: state.sortColumn, direction: state.sortDirection },
    columnWidths: tableColumnWidths?.['relacion-main'],
    facetGroups,
    items: filteredRows,
    columns,
    getRowAttrs: (row) =>
      `data-action="open-relacion-picker" data-group-key="${escapeHtml(row.groupKey)}" title="Seleccionar certificado o auditoría de ${escapeHtml(row.displayName)}"`,
    renderCard,
    actionsHtml: isStaff ? headerAddAuditHtml : '',
    loading,
    emptyStateTitle: 'Sin organizaciones o conglomerados visibles en Relación',
    emptyStateMessage:
      'Ajuste los filtros laterales o cree una nueva auditoría para definir su relación.',
    ...archiveProps,
  });
}

export function renderRelacionPickerModal(pickerModel: RelacionPickerModel): string {
  const certsHtml =
    pickerModel.certificates.length === 0
      ? `
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
          Este grupo no posee certificados activos disponibles para selección.
        </div>
      `
      : pickerModel.certificates
          .map((cert) => {
            const boxLabel = cert.vinculoBoxLabel ? cert.vinculoBoxLabel : 'Libre';
            const auditsHtml =
              cert.audits.length === 0
                ? `
                  <button
                    type="button"
                    data-action="select-relacion-audit"
                    data-cert-id="${escapeHtml(cert.certId)}"
                    data-audit-id=""
                    class="w-full text-left px-3 py-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 hover:bg-indigo-50/60 hover:border-indigo-300 transition-colors cursor-pointer flex items-center justify-between gap-2 text-xs"
                  >
                    <span class="font-semibold text-slate-600">Sin auditorías programadas — Abrir detalle del certificado</span>
                    <span class="font-bold text-indigo-700 shrink-0">Abrir →</span>
                  </button>
                `
                : cert.audits
                    .map(
                      (aud) => `
                        <button
                          type="button"
                          data-action="select-relacion-audit"
                          data-cert-id="${escapeHtml(cert.certId)}"
                          data-audit-id="${escapeHtml(aud.auditId)}"
                          title="${escapeHtml(aud.codenameTooltip)}"
                          class="w-full text-left px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-indigo-50/50 hover:border-indigo-300 transition-colors cursor-pointer flex flex-wrap items-center justify-between gap-2"
                        >
                          <div class="flex flex-wrap items-center gap-2 min-w-0">
                            <span class="font-mono text-xs font-bold text-slate-900">
                              ${escapeHtml(aud.codename)}
                            </span>
                            <span class="px-1.5 py-0.2 rounded font-mono text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                              ${escapeHtml(aud.codigo_auditoria)}
                            </span>
                          </div>
                          <div class="flex flex-wrap items-center gap-1.5 shrink-0">
                            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${getNatureBadgeClass(aud.effectiveNature)}">
                              ${escapeHtml(aud.effectiveNature)}
                            </span>
                            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${getCycleStatusBadgeClass(aud.estado_ciclo)}">
                              ${escapeHtml(aud.estado_ciclo)}
                            </span>
                          </div>
                        </button>
                      `
                    )
                    .join('');

            return `
              <section
                data-testid="relacion-picker-cert-group"
                data-cert-id="${escapeHtml(cert.certId)}"
                class="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2"
              >
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="flex flex-wrap items-center gap-1.5 min-w-0">
                    <span class="font-mono text-xs font-bold text-slate-900">
                      ${escapeHtml(cert.numero_certificado)}
                    </span>
                    <span class="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-white text-slate-700 border border-slate-200">
                      ${escapeHtml(cert.norma_codigo)}
                    </span>
                    <span class="text-[11px] text-slate-600 truncate">
                      ${escapeHtml(cert.orgShortName)}
                    </span>
                  </div>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white text-slate-700 border border-slate-200 shrink-0">
                    ${escapeHtml(boxLabel)} · Base: ${escapeHtml(cert.baseVinculoNature)}
                  </span>
                </div>
                <div class="space-y-1.5">
                  ${auditsHtml}
                </div>
              </section>
            `;
          })
          .join('');

  return `
    <div
      id="relacionPickerModal"
      data-testid="relacion-picker-modal"
      data-action="close-relacion-picker-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="relacionPickerTitle"
      class="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4"
    >
      <div class="w-full max-w-2xl max-h-[85vh] bg-white border border-slate-200 rounded-2xl shadow-xl flex flex-col overflow-hidden">
        <header class="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
          <div class="min-w-0 space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <h2 id="relacionPickerTitle" class="text-base font-bold text-slate-900 truncate">
                ${escapeHtml(pickerModel.displayName)}
              </h2>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 tabular-nums">
                ${pickerModel.totalCertsCount} cert. · ${pickerModel.totalAuditsCount} aud.
              </span>
            </div>
            <p class="text-xs text-slate-500">
              Seleccione un certificado y su auditoría (más reciente primero) para gestionar su Relación.
            </p>
          </div>
          <button
            type="button"
            data-action="close-relacion-picker"
            aria-label="Cerrar selector de auditorías"
            class="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
          >
            ✕
          </button>
        </header>

        <div class="p-4 sm:p-5 overflow-y-auto space-y-3">
          ${certsHtml}
        </div>

        <footer class="px-5 py-3 border-t border-slate-200 bg-slate-50/70 flex items-center justify-end">
          <button
            type="button"
            data-action="close-relacion-picker"
            class="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
        </footer>
      </div>
    </div>
  `;
}

function resolveDetailStatusBadgeMeta(opts: {
  row: RelacionDetailAuditRow;
  rawAudit: ProgramacionAuditEntity | null;
}): { label: 'Confirmada' | 'Personalizada' | 'Pendiente' | 'Cancelada'; cls: string } {
  const { row, rawAudit } = opts;
  if (row.estado_ciclo === 'Cancelada') {
    return {
      label: 'Cancelada',
      cls: 'bg-rose-50 text-rose-800 border-rose-200',
    };
  }
  if (!row.matchesVinculoBase) {
    return {
      label: 'Personalizada',
      cls: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    };
  }
  const hasExplicitAuditNature = Boolean(
    rawAudit?.tipo_vinculacion && rawAudit.tipo_vinculacion.trim().length > 0
  );
  if (row.hasVinculoBox || hasExplicitAuditNature) {
    return {
      label: 'Confirmada',
      cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    };
  }
  return {
    label: 'Pendiente',
    cls: 'bg-amber-50 text-amber-800 border-amber-200',
  };
}

export function renderRelacionDetailView(opts: {
  profile: UserProfile;
  state: RelacionViewState;
  model: RelacionDetailModel;
  authorizedClientOrgIds?: ReadonlyArray<string>;
  certificados?: ReadonlyArray<SoftDeletableCertificado | CertificadoDetailEntity>;
  programs?: ReadonlyArray<ProgramaAuditoriaEntity>;
  audits?: ReadonlyArray<ProgramacionAuditEntity>;
  inCardBreadcrumbHtml?: string;
  headerAddAuditHtml?: string;
}): string {
  const {
    profile,
    state,
    model,
    authorizedClientOrgIds = [],
    certificados = [],
    programs = [],
    audits = [],
    inCardBreadcrumbHtml = '',
    headerAddAuditHtml = '',
  } = opts;

  const isStaff = isApprovedStaffProfile(profile);
  const allowedClientOrgSet = new Set(authorizedClientOrgIds);
  const rawAuditsPool = mergeAuditsPool(audits, programs);
  const auditsPool = rawAuditsPool.filter((a) => {
    if (isStaff) return true;
    if (profile.role === 'AUDITOR') {
      return (
        a.auditor_lider_id === profile.id ||
        a.equipo.some((m) => m.id_auditor === profile.id)
      );
    }
    if (profile.role === 'CLIENT') {
      return allowedClientOrgSet.has(a.id_organizacion);
    }
    return false;
  });
  const scopedAuditIdSet = new Set(auditsPool.map((a) => a.id));
  const scopedPrograms: ProgramaAuditoriaEntity[] = programs
    .filter((p) => !p.deleted_at)
    .map((p) => ({
      ...p,
      auditorias: (p.auditorias || []).filter(
        (a) => !a.deleted_at && scopedAuditIdSet.has(a.id)
      ),
    }))
    .filter((p) => isStaff || p.auditorias.length > 0);

  const rawAuditById = new Map(auditsPool.map((a) => [a.id, a]));
  const fullDetailedCerts = certificados.filter(
    (c): c is CertificadoDetailEntity & { deleted_at?: string | null } =>
      !c.deleted_at && 'sitios' in c && Array.isArray(c.sitios)
  );
  const softCerts = certificados.filter((c) => !c.deleted_at);
  const resolvedCertId = model.selectedCertId || model.selectedCertSummary?.certId || '';
  const rawCert = softCerts.find((c) => c.id === resolvedCertId) ?? null;

  const navigation = resolveAuditNavigation(
    resolvedCertId,
    model.selectedAuditId,
    auditsPool
  );
  const activeAudit = navigation.activeAudit;
  const linkedCtx = getLinkedSiblingAudits(activeAudit, auditsPool, scopedPrograms);
  const activeBatchCount = model.audits.length;

  const errorBannerHtml = state.editErrorMessage
    ? `
      <div role="alert" class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-800 flex items-center gap-2">
        <span aria-hidden="true">⚠️</span>
        <span>${escapeHtml(state.editErrorMessage)}</span>
      </div>
    `
    : '';

  const selectedRow = model.selectedAuditRow;
  const isLinkedCampaign = Boolean(model.programSummary?.isLinkedCampaign && activeBatchCount > 1);

  const quickActionsHtml =
    model.canEdit && selectedRow
      ? `
        <div class="flex flex-wrap items-center gap-2">
          ${
            !selectedRow.matchesVinculoBase && selectedRow.estado_ciclo !== 'Cancelada'
              ? `
                <button
                  type="button"
                  data-action="apply-relacion-vinculo-base"
                  data-audit-id="${escapeHtml(selectedRow.auditId)}"
                  data-base-nature="${escapeHtml(selectedRow.baseVinculoNature)}"
                  ${state.savingAuditId === selectedRow.auditId ? 'disabled' : ''}
                  class="h-8 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  Aplicar base Bloque 2 (${escapeHtml(selectedRow.baseVinculoNature)})
                </button>
              `
              : ''
          }
          ${
            isLinkedCampaign
              ? `
                <label class="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                  <span>Campaña (${activeBatchCount}):</span>
                  <select
                    id="relacionBatchNatureSelect"
                    data-action="change-batch-relacion"
                    data-audit-id="${escapeHtml(selectedRow.auditId)}"
                    aria-label="Aplicar relación a toda la campaña"
                    ${state.savingAuditId ? 'disabled' : ''}
                    class="h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800 focus:border-slate-900 focus:outline-none disabled:opacity-50"
                  >
                    <option value="">Aplicar a lote...</option>
                    ${model.availableNatures
                      .map(
                        (nature) =>
                          `<option value="${escapeHtml(nature)}">${escapeHtml(nature)}</option>`
                      )
                      .join('')}
                  </select>
                </label>
              `
              : ''
          }
        </div>
      `
      : '';

  const toolbarHtml = `
    <div
      data-testid="relacion-detail-toolbar"
      class="flex flex-wrap items-center justify-between gap-2 pb-1"
    >
      <div class="flex flex-wrap items-center gap-2 min-w-0">
        <h2 class="text-xs font-bold uppercase tracking-wider text-slate-700">
          ${activeBatchCount > 1 ? 'Relación por Auditoría Vinculada' : 'Relación de Auditoría'}
        </h2>
        ${
          activeBatchCount > 1
            ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-[11px] font-semibold text-indigo-800 whitespace-nowrap">${activeBatchCount} en campaña</span>`
            : ''
        }
      </div>
      ${quickActionsHtml}
    </div>
  `;

  // Strict 5-col table: 22 + 18 + 22 + 24 + 14 = 100%, zero <button> inside <tbody>
  const detailTableHtml =
    model.audits.length > 0
      ? `
        <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
          <table id="relacion-detail-table" class="w-full min-w-[640px] sm:min-w-0 table-fixed text-left border-collapse">
            <colgroup>
              <col style="width: 22%">
              <col style="width: 18%">
              <col style="width: 22%">
              <col style="width: 24%">
              <col style="width: 14%">
            </colgroup>
            <thead class="bg-slate-50 border-b border-slate-200">
              <tr>
                <th scope="col" class="px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Certificado y Norma
                </th>
                <th scope="col" class="px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Codename / Auditoría
                </th>
                <th scope="col" class="px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Base Bloque 2
                </th>
                <th scope="col" class="px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Relación de Auditoría
                </th>
                <th scope="col" class="px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 text-xs">
              ${model.audits
                .map((row) => {
                  const isSavingThis = state.savingAuditId === row.auditId;
                  const isCancelled = row.estado_ciclo === 'Cancelada';
                  const rawAudit = rawAuditById.get(row.auditId) ?? null;
                  const statusMeta = resolveDetailStatusBadgeMeta({ row, rawAudit });
                  const baseLabel = row.vinculoBoxLabel ? row.vinculoBoxLabel : 'Sin caja';

                  return `
                    <tr
                      data-testid="relacion-audit-row"
                      data-audit-id="${escapeHtml(row.auditId)}"
                      data-is-active="${row.isSelectedAudit ? 'true' : 'false'}"
                      class="${
                        row.isSelectedAudit && activeBatchCount > 1
                          ? 'bg-indigo-50/35 hover:bg-indigo-50/55'
                          : 'hover:bg-slate-50/80'
                      } transition-colors"
                    >
                      <td class="px-3.5 py-2.5 align-middle min-w-0">
                        <div class="min-w-0 space-y-0.5">
                          <div class="flex flex-wrap items-center gap-1.5 min-w-0">
                            ${
                              row.isSelectedAudit && activeBatchCount > 1
                                ? '<span class="px-1.5 py-0.2 rounded bg-slate-900 text-white text-[10px] font-bold shrink-0">Activa</span>'
                                : ''
                            }
                            <span class="font-mono text-xs font-bold text-slate-900 truncate">
                              ${escapeHtml(row.numero_certificado)}
                            </span>
                            <span class="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                              ${escapeHtml(row.norma_codigo)}
                            </span>
                          </div>
                          <div class="text-[11px] text-slate-500 truncate">
                            ${escapeHtml(row.orgShortName)}
                          </div>
                        </div>
                      </td>

                      <td class="px-3.5 py-2.5 align-middle min-w-0">
                        <div class="min-w-0 space-y-0.5" title="${escapeHtml(row.codenameTooltip)}">
                          <div class="font-mono text-xs font-bold text-slate-900 truncate">
                            ${escapeHtml(row.codename)}
                          </div>
                          <div class="text-[11px] text-slate-500 truncate">
                            ${escapeHtml(row.codigo_auditoria)} · ${escapeHtml(row.estado_ciclo)}
                          </div>
                        </div>
                      </td>

                      <td class="px-3.5 py-2.5 align-middle min-w-0">
                        <div class="min-w-0 space-y-0.5">
                          <div class="text-xs font-semibold ${row.hasVinculoBox ? 'text-indigo-800' : 'text-slate-600'} truncate" title="${escapeHtml(baseLabel)}">
                            ${escapeHtml(baseLabel)}
                          </div>
                          <div class="text-[11px] text-slate-500 truncate">
                            Base: ${escapeHtml(row.baseVinculoNature)}
                          </div>
                        </div>
                      </td>

                      <td class="px-3.5 py-2.5 align-middle min-w-0">
                        ${
                          model.canEdit
                            ? `
                              <div class="space-y-1">
                                <select
                                  id="relacionAuditSelect_${escapeHtml(row.auditId)}"
                                  data-action="change-audit-relacion"
                                  data-audit-id="${escapeHtml(row.auditId)}"
                                  aria-label="Relación de auditoría para ${escapeHtml(row.numero_certificado)} (${escapeHtml(row.codename)})"
                                  ${isSavingThis || isCancelled ? 'disabled' : ''}
                                  ${isSavingThis ? 'aria-busy="true"' : ''}
                                  class="w-full h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-900 focus:border-slate-900 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                  ${model.availableNatures
                                    .map(
                                      (nature) =>
                                        `<option value="${escapeHtml(nature)}" ${
                                          row.effectiveAuditNature === nature ? 'selected' : ''
                                        }>${escapeHtml(nature)}</option>`
                                    )
                                    .join('')}
                                </select>
                                ${
                                  isSavingThis
                                    ? '<span class="block text-[10px] font-semibold text-indigo-700">Guardando...</span>'
                                    : ''
                                }
                              </div>
                            `
                            : `
                              <span
                                data-testid="relacion-readonly-nature"
                                class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border whitespace-nowrap ${getNatureBadgeClass(row.effectiveAuditNature)}"
                              >
                                ${escapeHtml(row.effectiveAuditNature)}
                              </span>
                            `
                        }
                      </td>

                      <td class="px-3.5 py-2.5 align-middle min-w-0">
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${statusMeta.cls}">
                          ${escapeHtml(statusMeta.label)}
                        </span>
                      </td>
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      `
      : '';

  const detailedCert = fullDetailedCerts.find((c) => c.id === resolvedCertId) ?? null;
  const certInfo = model.selectedCertSummary
    ? {
        id: model.selectedCertSummary.certId,
        numero_certificado: model.selectedCertSummary.numero_certificado,
        organizacion_nombre:
          rawCert?.organizacion_nombre || model.selectedCertSummary.orgShortName,
        organizacion_abreviacion:
          rawCert?.organizacion_abreviacion ?? model.selectedCertSummary.orgShortName,
        norma_codigo: model.selectedCertSummary.norma_codigo,
        estatus: rawCert?.estatus || 'Activo',
        version_numero: model.selectedCertSummary.versionNumero,
        alcance_es:
          detailedCert?.alcanceDetalle?.alcance_es ??
          detailedCert?.alcance ??
          rawCert?.alcance ??
          null,
        alcance_en: detailedCert?.alcanceDetalle?.alcance_en ?? null,
        hasAlcance: Boolean(
          detailedCert?.alcanceDetalle?.alcance_es ||
            detailedCert?.alcance ||
            rawCert?.alcance
        ),
      }
    : null;

  const bodyHtml = `
    <div class="space-y-3">
      ${toolbarHtml}
      ${detailTableHtml}
    </div>
  `;

  return renderAuditSectionShell({
    sectionTitle: 'Relación',
    sectionSymbol: '🔗',
    backSubview: 'relacion',
    compactMode: true,
    certInfo,
    certificados: fullDetailedCerts,
    navigation,
    programs: scopedPrograms,
    linkedSiblings: linkedCtx.siblings,
    showLinkedSiblings: linkedCtx.siblings.length > 1,
    isStaff: model.canEdit,
    inCardBreadcrumbHtml,
    headerAddAuditHtml,
    tableName: 'auditoria',
    feedbackHtml: errorBannerHtml,
    bodyHtml,
  });
}
