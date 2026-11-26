import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import type { OrganizacionEntity } from '../lib/activeCertificates';
import type { ConglomeradoEntity } from '../lib/conglomeradoDomain';
import type { VinculoEntity } from '../lib/vinculoDomain';
import type {
  AuditoriaSitioPlanItem,
  ProgramaAuditoriaEntity,
} from '../lib/auditPlanningEngine';
import type { ProgramacionAuditEntity } from '../lib/auditExecution';
import type {
  CertificadoDetailEntity,
  ProcesoTipo,
} from '../lib/multisiteSampling';
import type { CertificateRecord } from '../lib/searchControls';
import type { ProcesoPorSitioLink } from '../lib/sitioDomain';
import { sliceCycleWindowColumns } from '../lib/designacionSitioDomain';
import {
  resolveAuditNavigation,
  type CertificateAuditNavigation,
} from '../lib/certificateAuditSelector';
import {
  formatAuditDateLabel,
  resolveLatestPlannedDate,
  type AuditDateEntry,
} from '../lib/auditPlanningEngine';
import {
  formatAuditCodename,
  getAuditCodenameTooltip,
  resolveShortOrganizacionName,
} from '../lib/codenameDomain';
import {
  buildOrgCertPickerModalModel,
  buildOrgMultiViewRows,
  type OrgMultiViewRow,
} from '../lib/orgMultiViewPickerDomain';
import { mergeCertSourcesForOrgPicker } from '../lib/designacionTipoDomain';
import {
  buildAuditProcesoDetail,
  buildCertificateProcesoRows,
  buildProcesoOrgFacetCategories,
  buildProcessHistoryForSite,
  computeQuickProcessSelectionIds,
  computeSiteClearRecordIds,
  computeSiteSelectAllIds,
  createProcesoOrgCertMetaResolver,
  type CandidateProcessEntity,
  type CertProcesoStatus,
  type CertificateProcesoRow,
  type ProcessCycleCell,
  type ProcessHistoryRow,
  type ProcesoOrgCertMeta,
} from '../lib/programaCertificadoDomain';
import type {
  ColumnDefinition,
  MultiViewSelectionMap,
  SortDirection,
  UniversalViewMode,
} from '../lib/universalTemplate';
import {
  renderOrgCertPickerModal,
  renderOrgMultiView,
  type OrgPickerDomainColumn,
} from './orgMultiViewPickerView';
import { renderAuditSectionShell } from './auditSectionShell';
import { renderAddAuditButton } from './auditCardBreadcrumb';
import {
  extractUniversalArchiveProps,
  type ArchiveMultiViewConfig,
} from '../lib/archiveGovernance';

export type ProgramaProcesosSortColumn =
  | 'organizacion'
  | 'certificados'
  | 'auditorias'
  | 'procesos_cubiertos'
  | 'estado_cobertura'
  | 'certificado'
  | 'audit_date'
  | 'procesos'
  | 'estado';

export interface ProgramaProcesosViewState {
  query: string;
  viewMode: UniversalViewMode;
  isSidebarOpen: boolean;
  sortColumn: ProgramaProcesosSortColumn | null;
  sortDirection: SortDirection;
  facetSelections: MultiViewSelectionMap;
  selectedCertId?: string | null;
  selectedAuditId?: string | null;
  pickerOrgId?: string | null;
  pickerSearchQuery?: string;
  /** Legacy compatibility field */
  selectedProgramId?: string | null;
  cycleWindowOffsetByAuditId: Record<string, number>;
  openHistoryDrawerProcessIds: string[];
  savingSitePlanId: string | null;
  editErrorMessage: string | null;
}

export const DEFAULT_PROGRAMA_PROCESOS_STATE: ProgramaProcesosViewState = {
  query: '',
  viewMode: 'list',
  isSidebarOpen: true,
  sortColumn: null,
  sortDirection: 'none',
  facetSelections: {},
  selectedCertId: null,
  selectedAuditId: null,
  pickerOrgId: null,
  pickerSearchQuery: '',
  selectedProgramId: null,
  cycleWindowOffsetByAuditId: {},
  openHistoryDrawerProcessIds: [],
  savingSitePlanId: null,
  editErrorMessage: null,
};

export interface ProgramaProcesosPageProps {
  profile: UserProfile;
  state: ProgramaProcesosViewState;
  audits: ReadonlyArray<ProgramacionAuditEntity>;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  vinculos?: ReadonlyArray<VinculoEntity>;
  conglomerados?: ReadonlyArray<ConglomeradoEntity>;
  organizaciones?: ReadonlyArray<OrganizacionEntity>;
  certificados?: ReadonlyArray<CertificadoDetailEntity>;
  certificates?: ReadonlyArray<CertificateRecord>;
  authorizedClientOrgIds?: ReadonlyArray<string>;
  referenceIsoDate?: string;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
  inCardBreadcrumbHtml?: string;
  headerAddAuditHtml?: string;
}

export interface ProgramaProcesosViewProps {
  audit: ProgramacionAuditEntity;
  program: ProgramaAuditoriaEntity | null;
  allAudits: ReadonlyArray<ProgramacionAuditEntity>;
  allProcessesPorSitio: ReadonlyArray<ProcesoPorSitioLink>;
  allProcesses: ReadonlyArray<CandidateProcessEntity>;
  certificados?: ReadonlyArray<CertificadoDetailEntity>;
  cycleWindowOffset: number;
  openHistoryDrawerProcessIds: ReadonlyArray<string>;
  savingSitePlanId?: string | null;
  isStaff: boolean;
  editErrorMessage?: string | null;
}

const MONTHS_ES_SHORT: ReadonlyArray<string> = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

function mergeAuditsPool(
  programs: ReadonlyArray<ProgramaAuditoriaEntity>,
  auditsProp?: ReadonlyArray<ProgramacionAuditEntity>
): ProgramacionAuditEntity[] {
  const byId = new Map<string, ProgramacionAuditEntity>();
  for (const a of auditsProp ?? []) {
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

function formatDateSummaryCompact(entry: AuditDateEntry | null): string {
  if (!entry) return 'Sin fecha planificada';
  if (entry.tipo_fecha === 'PREPROGRAMADA_MES' && entry.anio && entry.mes) {
    const mName = MONTHS_ES_SHORT[entry.mes - 1] || `M${entry.mes}`;
    return `${mName} ${entry.anio}`;
  }
  if (entry.fecha_inicio) {
    const start = entry.fecha_inicio.slice(0, 10).split('-').reverse().join('/');
    const end = entry.fecha_fin
      ? entry.fecha_fin.slice(0, 10).split('-').reverse().join('/')
      : start;
    return start === end ? start : `${start} – ${end}`;
  }
  return formatAuditDateLabel(entry);
}

function extractProcessCatalogFromCertificates(
  certificados: ReadonlyArray<CertificadoDetailEntity & { deleted_at?: string | null }>
): {
  allProcessesPorSitio: ProcesoPorSitioLink[];
  allProcesses: CandidateProcessEntity[];
} {
  const ppsMap = new Map<string, ProcesoPorSitioLink>();
  const procMap = new Map<string, CandidateProcessEntity>();

  for (const cert of certificados) {
    if (cert.deleted_at) continue;
    for (const proc of cert.procesos || []) {
      const candidate = proc as CandidateProcessEntity;
      if (!candidate.deleted_at && !procMap.has(candidate.id)) {
        procMap.set(candidate.id, candidate);
      }
    }
    for (const site of cert.sitios || []) {
      const candidateSite = site as {
        deleted_at?: string | null;
        procesos_por_sitio?: ProcesoPorSitioLink[];
      };
      if (candidateSite.deleted_at) continue;
      for (const link of candidateSite.procesos_por_sitio || []) {
        if (!link.deleted_at && !ppsMap.has(link.id)) {
          ppsMap.set(link.id, link);
        }
      }
    }
  }

  return {
    allProcessesPorSitio: Array.from(ppsMap.values()),
    allProcesses: Array.from(procMap.values()),
  };
}

function scopeRecordsByRbac(opts: {
  profile: UserProfile;
  audits: ReadonlyArray<ProgramacionAuditEntity>;
  certificados: ReadonlyArray<CertificadoDetailEntity>;
  certificates: ReadonlyArray<CertificateRecord>;
  authorizedClientOrgIds?: ReadonlyArray<string>;
}): {
  audits: ProgramacionAuditEntity[];
  certificados: CertificadoDetailEntity[];
  certificates: CertificateRecord[];
} {
  const { profile, audits, certificados, certificates, authorizedClientOrgIds } = opts;
  if (!profile || profile.status !== 'APPROVED') {
    return { audits: [], certificados: [], certificates: [] };
  }

  const activeAudits = audits.filter((a) => !a.deleted_at);
  if (isApprovedStaffProfile(profile)) {
    return {
      audits: activeAudits,
      certificados: [...certificados],
      certificates: [...certificates],
    };
  }

  if (profile.role === 'AUDITOR') {
    const visibleAudits = activeAudits.filter(
      (a) =>
        a.auditor_lider_id === profile.id ||
        (a.equipo || []).some((m) => m.id_auditor === profile.id)
    );
    const certIds = new Set(visibleAudits.map((a) => a.id_certificado));
    return {
      audits: visibleAudits,
      certificados: certificados.filter((c) => certIds.has(c.id)),
      certificates: certificates.filter((c) => certIds.has(c.id)),
    };
  }

  if (profile.role === 'CLIENT') {
    if (authorizedClientOrgIds && authorizedClientOrgIds.length > 0) {
      const orgSet = new Set(authorizedClientOrgIds);
      const visibleCertIds = new Set(
        certificados.filter((c) => orgSet.has(c.id_organizacion)).map((c) => c.id)
      );
      return {
        audits: activeAudits.filter((a) => orgSet.has(a.id_organizacion)),
        certificados: certificados.filter((c) => orgSet.has(c.id_organizacion)),
        certificates: certificates.filter(
          (c) => visibleCertIds.has(c.id) || (c.organizacion_id ? orgSet.has(c.organizacion_id) : false)
        ),
      };
    }
    return {
      audits: activeAudits,
      certificados: [...certificados],
      certificates: [...certificates],
    };
  }

  return { audits: [], certificados: [], certificates: [] };
}

function getStatusMeta(statusKey: CertProcesoStatus): {
  label: string;
  badgeClass: string;
  rank: number;
} {
  switch (statusKey) {
    case 'COMPLETO':
      return {
        label: 'Completo ✓',
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        rank: 2,
      };
    case 'PENDIENTE':
      return {
        label: 'Pendiente',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
        rank: 0,
      };
    case 'SIN_AUDITORIA':
    default:
      return {
        label: 'Sin auditorías',
        badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
        rank: 1,
      };
  }
}

function getProcessTypeBadgeClass(tipo: ProcesoTipo): string {
  switch (tipo) {
    case 'Medular':
      return 'bg-sky-50 text-sky-800 border-sky-200';
    case 'Estratégico':
      return 'bg-indigo-50 text-indigo-800 border-indigo-200';
    case 'De Apoyo':
      return 'bg-slate-100 text-slate-700 border-slate-200';
    case 'Otro':
    default:
      return 'bg-amber-50 text-amber-800 border-amber-200';
  }
}

function computeMobileVisibleWindowIndices(
  visibleCellsCount: number,
  currentAuditLocalIndex: number
): Set<number> {
  if (visibleCellsCount <= 3) {
    return new Set(Array.from({ length: visibleCellsCount }, (_, idx) => idx));
  }
  const center =
    currentAuditLocalIndex >= 0 && currentAuditLocalIndex < visibleCellsCount
      ? currentAuditLocalIndex
      : Math.floor(visibleCellsCount / 2);

  let start = center - 1;
  if (start < 0) start = 0;
  if (start + 3 > visibleCellsCount) start = visibleCellsCount - 3;
  return new Set([start, start + 1, start + 2]);
}

function resolveCycleCellVisual(cell: ProcessCycleCell): {
  label: string;
  symbol: string;
  badgeClass: string;
  statusTitle: string;
} {
  if (cell.isCurrent) {
    return {
      label: cell.yearLabel === 'S/F' ? 'Actual' : cell.yearLabel,
      symbol: cell.included ? '●' : '○',
      badgeClass: cell.included
        ? 'bg-indigo-600 text-white border-indigo-700'
        : 'bg-indigo-50 text-indigo-800 border-indigo-300',
      statusTitle: cell.included ? 'Actual · Seleccionado' : 'Actual · Sin seleccionar',
    };
  }
  if (cell.isFuture) {
    return {
      label: cell.yearLabel,
      symbol: cell.included ? '📅' : '·',
      badgeClass: cell.included
        ? 'bg-sky-50 text-sky-900 border-sky-200'
        : 'bg-slate-50 text-slate-500 border-slate-200',
      statusTitle: cell.included ? 'Futuro · Preprogramado' : 'Futuro · Sin programar',
    };
  }
  if (cell.included) {
    return {
      label: cell.yearLabel,
      symbol: '✓',
      badgeClass: 'bg-emerald-50 text-emerald-900 border-emerald-200',
      statusTitle: 'Auditado en visita anterior',
    };
  }
  return {
    label: cell.yearLabel,
    symbol: '—',
    badgeClass: 'bg-slate-50 text-slate-500 border-slate-200',
    statusTitle: 'No incluido en esta visita',
  };
}

function renderProcessHistoryDrawer(
  row: ProcessHistoryRow,
  drawerKey: string
): string {
  return `
    <div
      data-testid="programa-process-history-drawer"
      data-drawer-key="${escapeHtml(drawerKey)}"
      class="mt-2.5 rounded-xl border border-slate-200 bg-slate-50/90 p-3 space-y-2"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-[11px] font-bold text-slate-800">
          Programa Anterior / Futuro — ${escapeHtml(row.proceso.nombre_proceso)}
        </span>
        <span class="text-[10px] font-semibold text-slate-500">
          ${row.totalVisitsInCycle} visita${row.totalVisitsInCycle === 1 ? '' : 's'} en el ciclo del certificado
        </span>
      </div>

      ${
        row.cycleCells.length === 0
          ? '<p class="text-[11px] text-slate-500">No existen visitas registradas en el ciclo de este certificado.</p>'
          : `
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              ${row.cycleCells
                .map((cell) => {
                  const visual = resolveCycleCellVisual(cell);
                  const shiftsText =
                    cell.shiftLabels.length > 0
                      ? cell.shiftLabels.join(', ')
                      : cell.included
                      ? 'Sin turnos asignados'
                      : 'No incluido';
                  const auditorsText =
                    cell.auditorNames.length > 0
                      ? cell.auditorNames.join(', ')
                      : cell.included
                      ? 'Equipo general del sitio'
                      : '—';
                  return `
                    <div class="rounded-lg border border-slate-200 bg-white p-2.5 space-y-1 text-[11px] min-w-0">
                      <div class="flex items-center justify-between gap-1.5">
                        <span class="font-bold text-slate-900 truncate">
                          ${escapeHtml(cell.auditType)} · ${escapeHtml(cell.yearLabel)}
                        </span>
                        <span class="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold border ${visual.badgeClass} shrink-0">
                          ${escapeHtml(visual.symbol)} ${escapeHtml(cell.isCurrent ? 'Actual' : cell.isFuture ? 'Futuro' : cell.included ? 'Incluido' : 'Omitido')}
                        </span>
                      </div>
                      <div class="text-slate-600 truncate" title="${escapeHtml(shiftsText)}">
                        <span class="font-semibold text-slate-700">Turnos:</span> ${escapeHtml(shiftsText)}
                      </div>
                      <div class="text-slate-600 truncate" title="${escapeHtml(auditorsText)}">
                        <span class="font-semibold text-slate-700">Auditores:</span> ${escapeHtml(auditorsText)}
                      </div>
                    </div>
                  `;
                })
                .join('')}
            </div>
          `
      }
    </div>
  `;
}

function renderProcessHistoryCard(opts: {
  audit: ProgramacionAuditEntity;
  sitePlan: AuditoriaSitioPlanItem;
  row: ProcessHistoryRow;
  cycleWindowOffset: number;
  isDrawerOpen: boolean;
  isStaff: boolean;
}): string {
  const { audit, sitePlan, row, cycleWindowOffset, isDrawerOpen, isStaff } = opts;
  const checkboxId = `progProcChk_${sitePlan.id}_${row.ppsLink.id}`;
  const drawerKey = `${sitePlan.id}:${row.ppsLink.id}`;

  const sliced = sliceCycleWindowColumns(
    row.cycleCells,
    row.currentAuditIndex,
    cycleWindowOffset,
    5
  );
  const currentLocalIdx = sliced.visible.findIndex((c) => c.isCurrent);
  const mobileVisibleSet = computeMobileVisibleWindowIndices(
    sliced.visible.length,
    currentLocalIdx
  );

  const historyBadgeHtml = row.neverAudited
    ? `
      <span
        data-testid="never-audited-badge"
        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200 whitespace-nowrap"
      >
        <span aria-hidden="true">⚠️</span>
        <span>Nunca auditado</span>
      </span>
    `
    : `
      <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
        ${escapeHtml(
          row.lastAuditedText === 'Nunca auditado' && row.isSelectedNow
            ? 'Incluido en visita actual'
            : row.lastAuditedText
        )}
      </span>
    `;

  const cycleCountLabel = `Auditado ${row.timesAuditedInCycle} de ${row.totalVisitsInCycle} ${
    row.totalVisitsInCycle === 1 ? 'vez' : 'veces'
  }`;

  return `
    <div
      data-testid="programa-process-card"
      data-pps-id="${escapeHtml(row.ppsLink.id)}"
      class="rounded-xl border p-3 transition-colors space-y-2.5 ${
        row.isSelectedNow
          ? 'border-indigo-200 bg-indigo-50/25'
          : row.neverAudited
          ? 'border-amber-200 bg-amber-50/20'
          : 'border-slate-200 bg-white'
      }"
    >
      <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <label
          for="${escapeHtml(checkboxId)}"
          class="inline-flex items-start gap-2.5 min-w-0 flex-1 ${
            isStaff ? 'cursor-pointer' : 'cursor-not-allowed opacity-90'
          }"
        >
          <input
            type="checkbox"
            id="${escapeHtml(checkboxId)}"
            data-action="toggle-programa-process"
            data-audit-id="${escapeHtml(audit.id)}"
            data-site-plan-id="${escapeHtml(sitePlan.id)}"
            data-pps-id="${escapeHtml(row.ppsLink.id)}"
            data-proceso-id="${escapeHtml(row.proceso.id)}"
            data-currently-selected="${row.isSelectedNow ? 'true' : 'false'}"
            ${row.isSelectedNow ? 'checked' : ''}
            ${!isStaff ? 'disabled' : ''}
            class="mt-0.5 h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
          />
          <span class="min-w-0 flex-1 space-y-1">
            <span class="flex flex-wrap items-center gap-1.5">
              <span class="text-xs font-bold text-slate-900 break-words">
                ${escapeHtml(row.proceso.nombre_proceso)}
              </span>
              <span class="inline-flex items-center px-2 py-0.2 rounded-md text-[10px] font-bold border ${getProcessTypeBadgeClass(
                row.proceso.tipo
              )} whitespace-nowrap">
                ${escapeHtml(row.proceso.tipo)}
              </span>
            </span>
            ${
              row.proceso.clausulas_cubiertas && row.proceso.clausulas_cubiertas.length > 0
                ? `<span class="block text-[10px] text-slate-500 truncate">Cláusulas: ${escapeHtml(
                    row.proceso.clausulas_cubiertas.slice(0, 6).join(', ')
                  )}${row.proceso.clausulas_cubiertas.length > 6 ? '…' : ''}</span>`
                : ''
            }
          </span>
        </label>

        <div class="flex flex-wrap items-center gap-1.5 pl-7 sm:pl-0 shrink-0">
          ${historyBadgeHtml}
          <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap tabular-nums">
            ${escapeHtml(cycleCountLabel)}
          </span>
        </div>
      </div>

      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-2 pt-1.5 border-t border-slate-100">
        <div class="flex items-center gap-1.5 min-w-0 flex-1">
          <button
            type="button"
            data-action="page-programa-cycle"
            data-audit-id="${escapeHtml(audit.id)}"
            data-delta="-1"
            aria-label="Ventana de ciclo anterior para ${escapeHtml(row.proceso.nombre_proceso)}"
            ${!sliced.canPagePrev ? 'disabled' : ''}
            class="w-7 h-7 shrink-0 inline-flex items-center justify-center rounded-lg border text-xs font-bold transition-colors ${
              sliced.canPagePrev
                ? 'border-slate-300 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer'
                : 'border-slate-200 bg-slate-50 text-slate-300 cursor-not-allowed'
            }"
          >
            ◀
          </button>

          <div class="grid grid-cols-3 sm:grid-cols-5 gap-1.5 min-w-0 flex-1 max-w-md">
            ${
              sliced.visible.length === 0
                ? '<div class="col-span-3 sm:col-span-5 text-center text-[10px] text-slate-400 py-1">Sin visitas</div>'
                : sliced.visible
                    .map((cell, colIdx) => {
                      const visual = resolveCycleCellVisual(cell);
                      const mobileVisibilityClass = mobileVisibleSet.has(colIdx)
                        ? 'flex'
                        : 'hidden sm:flex';
                      return `
                        <div
                          class="${mobileVisibilityClass} flex-col items-center justify-center rounded-lg border px-1.5 py-1 min-w-0 text-center ${visual.badgeClass}"
                          title="${escapeHtml(`${cell.yearLabel} · ${cell.auditType} · ${visual.statusTitle}`)}"
                        >
                          <span class="text-[10px] font-bold leading-tight truncate max-w-full">
                            ${escapeHtml(visual.label)} ${escapeHtml(visual.symbol)}
                          </span>
                          <span class="text-[9px] font-medium leading-tight truncate max-w-full opacity-90">
                            ${escapeHtml(cell.auditType)}
                          </span>
                        </div>
                      `;
                    })
                    .join('')
            }
          </div>

          <button
            type="button"
            data-action="page-programa-cycle"
            data-audit-id="${escapeHtml(audit.id)}"
            data-delta="1"
            aria-label="Ventana de ciclo siguiente para ${escapeHtml(row.proceso.nombre_proceso)}"
            ${!sliced.canPageNext ? 'disabled' : ''}
            class="w-7 h-7 shrink-0 inline-flex items-center justify-center rounded-lg border text-xs font-bold transition-colors ${
              sliced.canPageNext
                ? 'border-slate-300 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer'
                : 'border-slate-200 bg-slate-50 text-slate-300 cursor-not-allowed'
            }"
          >
            ▶
          </button>
        </div>

        <button
          type="button"
          data-action="toggle-programa-process-drawer"
          data-drawer-key="${escapeHtml(drawerKey)}"
          aria-expanded="${isDrawerOpen ? 'true' : 'false'}"
          class="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
            isDrawerOpen
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
          }"
        >
          <span aria-hidden="true">📂</span>
          <span>Ver Programa Anterior / Futuro</span>
        </button>
      </div>

      ${isDrawerOpen ? renderProcessHistoryDrawer(row, drawerKey) : ''}
    </div>
  `;
}

/**
 * Renderiza el cuerpo de detalle sitio-a-sitio para `4. Proceso`, reutilizable de forma autónoma
 * y dentro del shell Certificate-Based (`renderAuditSectionShell`).
 */
export function renderProgramaProcesosDetailBody(props: ProgramaProcesosViewProps): string {
  const {
    audit,
    allAudits,
    allProcessesPorSitio,
    allProcesses,
    certificados,
    cycleWindowOffset,
    openHistoryDrawerProcessIds,
    savingSitePlanId = null,
    isStaff,
    editErrorMessage,
  } = props;

  const detailModel = buildAuditProcesoDetail({
    audit,
    allAudits,
    allProcessesPorSitio,
    allProcesses,
    certificados,
  });

  const activeNoAplicables = detailModel.noAplicables ?? [];
  const noAplicablesLabels = activeNoAplicables
    .map((na) =>
      [na.requisito_codigo?.trim(), na.requisito_titulo?.trim()].filter(Boolean).join(' · ')
    )
    .filter((lbl) => lbl.length > 0);
  const noAplicablesNoteHtml =
    activeNoAplicables.length > 0
      ? `<div data-testid="proceso-iso43-exclusions" class="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-amber-900 bg-amber-50/80 border border-amber-200 rounded-lg px-2.5 py-1" title="${escapeHtml(noAplicablesLabels.join(' | ') || 'Exclusiones ISO 4.3 de la versión')}">
           <span class="font-bold whitespace-nowrap">Exclusiones ISO 4.3 (${activeNoAplicables.length}):</span>
           <span class="truncate">${escapeHtml(noAplicablesLabels.join(' · ') || `${activeNoAplicables.length} cláusula(s) no aplicable(s)`)}</span>
         </div>`
      : '';

  const errorBannerHtml = editErrorMessage
    ? `
      <div role="alert" data-testid="programa-procesos-error" class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800 flex items-center gap-2">
        <span aria-hidden="true">⚠️</span>
        <span>${escapeHtml(editErrorMessage)}</span>
      </div>
    `
    : '';

  const summaryBarHtml = `
    <div
      data-testid="programa-procesos-summary-bar"
      class="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-slate-200 bg-slate-50/90 px-3.5 py-2.5"
    >
      <div class="space-y-0.5 min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-xs font-bold text-slate-900">
            Selección de Procesos por Sitio
          </span>
          <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border tabular-nums ${
            detailModel.isComplete
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-amber-50 text-amber-800 border-amber-200'
          }">
            ${detailModel.isComplete ? '✓ Completo' : 'Pendiente'} · ${detailModel.totalSelectedProcesses} / ${detailModel.totalEligibleProcesses} proc. en ${detailModel.sitesCount} sitio${detailModel.sitesCount === 1 ? '' : 's'}
          </span>
        </div>
        <p class="text-[11px] text-slate-600">
          Seleccione los procesos a auditar estrictamente desde <strong class="text-slate-800">procesos_por_sitio</strong> por cada sitio de <strong class="text-slate-800">1.4 Sitio</strong>.
        </p>
        ${noAplicablesNoteHtml}
      </div>

      <div class="flex flex-wrap items-center gap-2 shrink-0">
        ${
          detailModel.totalSelectedProcesses > 0
            ? `
              <button
                type="button"
                data-action="audit-breadcrumb-nav"
                data-target-subview="turno"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-white cursor-pointer whitespace-nowrap transition-colors"
              >
                <span>Continuar a 5. Turno</span>
                <span aria-hidden="true">→</span>
              </button>
            `
            : ''
        }
      </div>
    </div>
  `;

  if (detailModel.sites.length === 0) {
    return `
      <div data-testid="programa-procesos-view" class="space-y-3">
        ${errorBannerHtml}
        ${summaryBarHtml}
        <div class="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center space-y-2.5">
          <p class="text-xs text-slate-600">
            Esta auditoría aún no tiene sitios permanentes seleccionados en <strong>1.4 Sitio</strong>.
          </p>
          <button
            type="button"
            data-action="audit-breadcrumb-nav"
            data-target-subview="designacion/sitio"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 cursor-pointer"
          >
            <span>Ir a 1.4 Sitio</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    `;
  }

  const sitesHtml = detailModel.sites
    .map((siteEval) => {
      const { sitePlan, rows, selectedCount, neverAuditedCount } = siteEval;
      const selectAllDeltaIds = computeSiteSelectAllIds(rows);
      const clearRecordIds = computeSiteClearRecordIds(rows);
      const isSiteSaving = savingSitePlanId === sitePlan.id;

      const medularesDelta = computeQuickProcessSelectionIds(rows, 'MEDULARES');
      const noAuditadosDelta = computeQuickProcessSelectionIds(rows, 'NO_AUDITADOS_ULTIMO');
      const copiarDelta = computeQuickProcessSelectionIds(rows, 'COPIAR_ANTERIOR');

      const siteBadgeLabel =
        sitePlan.numero_sitio === 0 ? 'Sitio 0 (HQ)' : `Sitio #${sitePlan.numero_sitio}`;

      return `
        <section
          data-testid="programa-site-processes-card"
          data-site-plan-id="${escapeHtml(sitePlan.id)}"
          class="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden"
        >
          <header class="bg-slate-50/90 border-b border-slate-200 px-3.5 py-3 space-y-2.5">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex flex-wrap items-center gap-1.5 min-w-0">
                <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                  sitePlan.numero_sitio === 0
                    ? 'bg-indigo-100 text-indigo-900 border-indigo-200'
                    : 'bg-slate-100 text-slate-700 border-slate-200'
                } whitespace-nowrap">
                  ${escapeHtml(siteBadgeLabel)}
                </span>
                <h3 class="text-xs sm:text-sm font-bold text-slate-900 truncate">
                  ${escapeHtml(sitePlan.nombre_sitio)}
                </h3>
                ${
                  neverAuditedCount > 0
                    ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200 whitespace-nowrap">⚠️ ${neverAuditedCount} nunca aud.</span>`
                    : ''
                }
              </div>

              <div class="flex flex-wrap items-center gap-2 shrink-0">
                <span
                  data-testid="site-processes-counter"
                  class="text-[11px] font-semibold tabular-nums whitespace-nowrap ${
                    selectedCount > 0 ? 'text-emerald-800' : 'text-slate-600'
                  }"
                >
                  ${selectedCount} de ${rows.length} proceso${rows.length === 1 ? '' : 's'} seleccionado${
                    selectedCount === 1 ? '' : 's'
                  }
                </span>

                ${
                  rows.length > 0
                    ? `
                      <div class="inline-flex items-center gap-1.5" role="group" aria-label="Acciones en lote para ${escapeHtml(sitePlan.nombre_sitio)}">
                        <button
                          type="button"
                          data-action="programa-select-all-site"
                          data-audit-id="${escapeHtml(audit.id)}"
                          data-site-plan-id="${escapeHtml(sitePlan.id)}"
                          ${!isStaff || isSiteSaving || selectAllDeltaIds.length === 0 ? 'disabled' : ''}
                          class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-colors whitespace-nowrap ${
                            isStaff && !isSiteSaving && selectAllDeltaIds.length > 0
                              ? 'bg-indigo-600 border-indigo-700 text-white hover:bg-indigo-700 cursor-pointer'
                              : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                          }"
                        >
                          <span aria-hidden="true">☑</span>
                          <span>Seleccionar todos</span>
                        </button>
                        <button
                          type="button"
                          data-action="programa-clear-site"
                          data-audit-id="${escapeHtml(audit.id)}"
                          data-site-plan-id="${escapeHtml(sitePlan.id)}"
                          ${!isStaff || isSiteSaving || clearRecordIds.length === 0 ? 'disabled' : ''}
                          class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors whitespace-nowrap ${
                            isStaff && !isSiteSaving && clearRecordIds.length > 0
                              ? 'bg-white border-slate-300 text-slate-700 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-800 cursor-pointer'
                              : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                          }"
                        >
                          <span aria-hidden="true">☐</span>
                          <span>Limpiar</span>
                        </button>
                      </div>
                    `
                    : ''
                }
              </div>
            </div>

            ${
              rows.length > 0
                ? `
                  <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Acciones rápidas de selección de procesos">
                    <button
                      type="button"
                      data-action="programa-quick-select"
                      data-audit-id="${escapeHtml(audit.id)}"
                      data-site-plan-id="${escapeHtml(sitePlan.id)}"
                      data-preset="MEDULARES"
                      ${!isStaff || isSiteSaving || medularesDelta.length === 0 ? 'disabled' : ''}
                      class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors whitespace-nowrap ${
                        isStaff && !isSiteSaving && medularesDelta.length > 0
                          ? 'bg-white border-sky-300 text-sky-900 hover:bg-sky-50 cursor-pointer'
                          : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                      }"
                    >
                      <span>Seleccionar todos los Medulares</span>
                      ${
                        medularesDelta.length > 0
                          ? `<span class="px-1.5 py-0.2 rounded-full bg-sky-100 text-sky-900 text-[10px] font-bold">${medularesDelta.length}</span>`
                          : ''
                      }
                    </button>

                    <button
                      type="button"
                      data-action="programa-quick-select"
                      data-audit-id="${escapeHtml(audit.id)}"
                      data-site-plan-id="${escapeHtml(sitePlan.id)}"
                      data-preset="NO_AUDITADOS_ULTIMO"
                      ${!isStaff || isSiteSaving || noAuditadosDelta.length === 0 ? 'disabled' : ''}
                      class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors whitespace-nowrap ${
                        isStaff && !isSiteSaving && noAuditadosDelta.length > 0
                          ? 'bg-white border-amber-300 text-amber-900 hover:bg-amber-50 cursor-pointer'
                          : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                      }"
                    >
                      <span>Seleccionar no auditados en el último año</span>
                      ${
                        noAuditadosDelta.length > 0
                          ? `<span class="px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-900 text-[10px] font-bold">${noAuditadosDelta.length}</span>`
                          : ''
                      }
                    </button>

                    <button
                      type="button"
                      data-action="programa-quick-select"
                      data-audit-id="${escapeHtml(audit.id)}"
                      data-site-plan-id="${escapeHtml(sitePlan.id)}"
                      data-preset="COPIAR_ANTERIOR"
                      ${!isStaff || isSiteSaving || copiarDelta.length === 0 ? 'disabled' : ''}
                      class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors whitespace-nowrap ${
                        isStaff && !isSiteSaving && copiarDelta.length > 0
                          ? 'bg-white border-indigo-300 text-indigo-900 hover:bg-indigo-50 cursor-pointer'
                          : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                      }"
                    >
                      <span>Copiar del ciclo anterior</span>
                      ${
                        copiarDelta.length > 0
                          ? `<span class="px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-900 text-[10px] font-bold">${copiarDelta.length}</span>`
                          : ''
                      }
                    </button>
                  </div>
                `
                : ''
            }
          </header>

          <div class="p-3 sm:p-3.5 space-y-2.5">
            ${
              rows.length === 0
                ? `
                  <div class="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-500">
                    Este sitio no tiene procesos activos vinculados en <strong>procesos_por_sitio</strong>. Vincúlelos desde Certificados → Sitio antes de programarlos.
                  </div>
                `
                : rows
                    .map((row) =>
                      renderProcessHistoryCard({
                        audit,
                        sitePlan,
                        row,
                        cycleWindowOffset,
                        isDrawerOpen: openHistoryDrawerProcessIds.includes(
                          `${sitePlan.id}:${row.ppsLink.id}`
                        ),
                        isStaff,
                      })
                    )
                    .join('')
            }
          </div>
        </section>
      `;
    })
    .join('');

  return `
    <div data-testid="programa-procesos-view" class="space-y-4">
      ${errorBannerHtml}
      ${summaryBarHtml}
      ${sitesHtml}
    </div>
  `;
}

/**
 * Step 3.3 — Renderiza la vista completa de `4. Proceso` (`#/auditorias/proceso`):
 * Multi View por Organización + Pop-up Agrupado por Auditoría Vinculada + Detail View con `renderAuditSectionShell`.
 */
export function renderProgramaProcesosView(props: ProgramaProcesosPageProps): string {
  const {
    profile,
    state,
    audits: auditsProp,
    programs,
    vinculos = [],
    conglomerados = [],
    organizaciones = [],
    certificados = [],
    certificates = [],
    authorizedClientOrgIds = [],
    referenceIsoDate,
    loading = false,
    archiveConfig,
    tableColumnWidths,
    inCardBreadcrumbHtml = '',
    headerAddAuditHtml = '',
  } = props;

  const isStaff = isApprovedStaffProfile(profile);
  const auditsPool = mergeAuditsPool(programs, auditsProp);
  const scoped = scopeRecordsByRbac({
    profile,
    audits: auditsPool,
    certificados,
    certificates,
    authorizedClientOrgIds,
  });

  const { allProcessesPorSitio, allProcesses } =
    extractProcessCatalogFromCertificates(scoped.certificados);

  const allRows = buildCertificateProcesoRows({
    certificates: scoped.certificates,
    detailedCerts: scoped.certificados,
    audits: scoped.audits,
    programs,
    referenceIsoDate,
    allProcessesPorSitio,
    allProcesses,
  });

  const legacyProgramFirstAudit = state.selectedProgramId
    ? programs
        .find((p) => !p.deleted_at && p.id === state.selectedProgramId)
        ?.auditorias.find((a) => !a.deleted_at) ?? null
    : null;

  const resolvedCertId =
    state.selectedCertId && allRows.some((r) => r.certId === state.selectedCertId)
      ? state.selectedCertId
      : state.selectedAuditId
      ? scoped.audits.find((a) => a.id === state.selectedAuditId)?.id_certificado ?? null
      : legacyProgramFirstAudit?.id_certificado ?? null;

  const resolvedHeaderAddAuditHtml = headerAddAuditHtml || renderAddAuditButton(isStaff);

  if (resolvedCertId) {
    const certRow = allRows.find((r) => r.certId === resolvedCertId) ?? null;
    if (certRow) {
      const effectiveAuditId = state.selectedAuditId ?? legacyProgramFirstAudit?.id ?? null;
      const navigation: CertificateAuditNavigation = resolveAuditNavigation(
        certRow.certId,
        effectiveAuditId,
        scoped.audits
      );
      const activeAudit = navigation.activeAudit;
      const activeProgram = activeAudit?.id_programa_auditoria
        ? programs.find((p) => !p.deleted_at && p.id === activeAudit.id_programa_auditoria) ?? null
        : null;

      const bodyHtml = activeAudit
        ? renderProgramaProcesosDetailBody({
            audit: activeAudit,
            program: activeProgram,
            allAudits: scoped.audits,
            allProcessesPorSitio,
            allProcesses,
            certificados: scoped.certificados,
            cycleWindowOffset: state.cycleWindowOffsetByAuditId[activeAudit.id] ?? 0,
            openHistoryDrawerProcessIds: state.openHistoryDrawerProcessIds,
            savingSitePlanId: state.savingSitePlanId,
            isStaff,
            editErrorMessage: state.editErrorMessage,
          })
        : '';

      return renderAuditSectionShell({
        sectionTitle: '4. Proceso',
        sectionSymbol: '⚙️',
        backSubview: 'proceso',
        certInfo: {
          id: certRow.certId,
          numero_certificado: certRow.numero_certificado,
          organizacion_nombre: certRow.organizacion_nombre,
          organizacion_abreviacion: certRow.organizacion_abreviacion,
          norma_codigo: certRow.norma_codigo,
          estatus: certRow.estatus,
          version_numero: certRow.activeVersionNumero,
          alcance_es: certRow.alcance_es,
          alcance_en: certRow.alcance_en,
          hasAlcance: certRow.hasAlcance,
        },
        certificados: scoped.certificados,
        navigation,
        programs,
        showLinkedSiblings: false,
        isStaff,
        inCardBreadcrumbHtml,
        headerAddAuditHtml: resolvedHeaderAddAuditHtml,
        tableName: 'auditoria',
        bodyHtml,
      });
    }
  }

  return renderProcesoMultiView({
    profile,
    state,
    auditsPool: scoped.audits,
    programs,
    vinculos,
    conglomerados,
    organizaciones,
    authorizedClientOrgIds,
    certificados: scoped.certificados,
    certificates: scoped.certificates,
    allProcessesPorSitio,
    allProcesses,
    loading,
    archiveConfig,
    tableColumnWidths,
    headerAddAuditHtml: resolvedHeaderAddAuditHtml,
  });
}

function renderProcesoMultiView(opts: {
  profile: UserProfile;
  state: ProgramaProcesosViewState;
  auditsPool: ReadonlyArray<ProgramacionAuditEntity>;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  vinculos: ReadonlyArray<VinculoEntity>;
  conglomerados: ReadonlyArray<ConglomeradoEntity>;
  organizaciones: ReadonlyArray<OrganizacionEntity>;
  authorizedClientOrgIds: ReadonlyArray<string>;
  certificados: ReadonlyArray<CertificadoDetailEntity>;
  certificates: ReadonlyArray<CertificateRecord>;
  allProcessesPorSitio: ReadonlyArray<ProcesoPorSitioLink>;
  allProcesses: ReadonlyArray<CandidateProcessEntity>;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
  headerAddAuditHtml?: string;
}): string {
  const {
    profile,
    state,
    auditsPool,
    programs,
    vinculos,
    conglomerados,
    organizaciones,
    authorizedClientOrgIds,
    certificados,
    certificates,
    allProcessesPorSitio,
    allProcesses,
    loading = false,
    archiveConfig,
    tableColumnWidths,
    headerAddAuditHtml = '',
  } = opts;

  const mergedCerts = mergeCertSourcesForOrgPicker({
    certificados,
    certificates,
    audits: auditsPool,
    organizaciones,
  });

  const resolveCertMeta = createProcesoOrgCertMetaResolver({
    audits: auditsPool,
    allProcessesPorSitio,
    allProcesses,
    certificados,
  });

  const orgRows = buildOrgMultiViewRows<ProcesoOrgCertMeta>({
    profile,
    authorizedClientOrgIds,
    organizaciones,
    conglomerados,
    certificados: mergedCerts,
    audits: auditsPool,
    programs,
    vinculos,
    resolveCertMeta,
  });

  const facetCategories = buildProcesoOrgFacetCategories(orgRows);

  const extraColumns: ColumnDefinition<OrgMultiViewRow<ProcesoOrgCertMeta>>[] = [
    {
      id: 'procesos_cubiertos',
      header: 'Procesos',
      defaultWidthPct: 13,
      minWidthPx: 120,
      sortable: true,
      getValue: (row) =>
        row.certificates.reduce((sum, c) => sum + c.domainExtra.selectedProcessesCount, 0),
      renderCell: (row) => {
        const selectedTotal = row.certificates.reduce(
          (sum, c) => sum + c.domainExtra.selectedProcessesCount,
          0
        );
        const eligibleTotal = row.certificates.reduce(
          (sum, c) => sum + c.domainExtra.eligibleProcessesCount,
          0
        );
        const neverAuditedTotal = row.certificates.reduce(
          (sum, c) => sum + c.domainExtra.neverAuditedEligibleCount,
          0
        );
        const sitesTotal = row.certificates.reduce(
          (sum, c) => sum + c.domainExtra.sitesCount,
          0
        );
        return `
          <div class="min-w-0 space-y-0.5 tabular-nums">
            <div class="text-xs font-bold text-slate-900 whitespace-nowrap">
              ${selectedTotal} / ${eligibleTotal} proc.
            </div>
            ${
              neverAuditedTotal > 0
                ? `<span class="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200 whitespace-nowrap">⚠️ ${neverAuditedTotal} nunca aud.</span>`
                : `<div class="text-[11px] text-slate-500 truncate">${sitesTotal} sitio${
                    sitesTotal === 1 ? '' : 's'
                  }</div>`
            }
          </div>
        `;
      },
    },
    {
      id: 'estado_cobertura',
      header: 'Estado',
      defaultWidthPct: 13,
      minWidthPx: 115,
      sortable: true,
      getValue: (row) => {
        if (row.certificates.length === 0) return 9;
        return Math.min(...row.certificates.map((c) => getStatusMeta(c.domainExtra.statusKey).rank));
      },
      renderCell: (row) => {
        const withAudits = row.certificates.filter(
          (c) => c.domainExtra.statusKey !== 'SIN_AUDITORIA'
        );
        if (withAudits.length === 0) {
          const meta = getStatusMeta('SIN_AUDITORIA');
          return `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border ${meta.badgeClass} whitespace-nowrap">${escapeHtml(meta.label)}</span>`;
        }
        const pendingCount = withAudits.filter(
          (c) => c.domainExtra.statusKey !== 'COMPLETO'
        ).length;
        const meta = getStatusMeta(pendingCount === 0 ? 'COMPLETO' : 'PENDIENTE');
        const label =
          pendingCount === 0
            ? 'Completo ✓'
            : `${pendingCount} pendiente${pendingCount === 1 ? '' : 's'}`;
        return `
          <div class="min-w-0 space-y-0.5">
            <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border ${meta.badgeClass} whitespace-nowrap">
              ${escapeHtml(label)}
            </span>
            <div class="text-[10px] text-slate-500 tabular-nums truncate">
              ${withAudits.length - pendingCount}/${withAudits.length} cert. cubiertos
            </div>
          </div>
        `;
      },
    },
  ];

  const renderCardExtra = (row: OrgMultiViewRow<ProcesoOrgCertMeta>): string => {
    const selectedTotal = row.certificates.reduce(
      (sum, c) => sum + c.domainExtra.selectedProcessesCount,
      0
    );
    const eligibleTotal = row.certificates.reduce(
      (sum, c) => sum + c.domainExtra.eligibleProcessesCount,
      0
    );
    const neverAuditedTotal = row.certificates.reduce(
      (sum, c) => sum + c.domainExtra.neverAuditedEligibleCount,
      0
    );
    return `
      <div class="flex items-center justify-between gap-2 text-[11px] tabular-nums">
        <span class="font-semibold text-slate-800">${selectedTotal} / ${eligibleTotal} procesos</span>
        ${
          neverAuditedTotal > 0
            ? `<span class="px-1.5 py-0.2 rounded bg-rose-50 text-rose-800 border border-rose-200 font-bold text-[10px] whitespace-nowrap">⚠️ ${neverAuditedTotal} nunca aud.</span>`
            : ''
        }
      </div>
    `;
  };

  const pickerModel = state.pickerOrgId
    ? buildOrgCertPickerModalModel<ProcesoOrgCertMeta>({
        orgId: state.pickerOrgId,
        modalSearchQuery: state.pickerSearchQuery ?? '',
        groupingMode: 'audit',
        orgRows,
        profile,
        authorizedClientOrgIds,
        organizaciones,
        conglomerados,
        certificados: mergedCerts,
        audits: auditsPool,
        programs,
        vinculos,
        resolveCertMeta,
      })
    : null;

  const pickerDomainColumns: OrgPickerDomainColumn<ProcesoOrgCertMeta>[] = [
    {
      id: 'ultima_auditoria',
      header: 'Última Auditoría',
      defaultWidthPct: 16,
      minWidthPx: 140,
      renderCell: (row) => {
        const meta = row.domainExtra;
        return `
          <div class="min-w-0 space-y-0.5" title="${escapeHtml(meta.latestAuditTooltip)}">
            <div class="font-mono text-xs font-bold text-slate-900 truncate">
              ${escapeHtml(meta.latestAuditCodename)}
            </div>
            <div class="text-[11px] text-slate-500 truncate">
              ${escapeHtml(meta.latestDateSummary)}
            </div>
          </div>
        `;
      },
    },
    {
      id: 'sitios_procesos',
      header: 'Sitios / Procesos',
      defaultWidthPct: 18,
      minWidthPx: 145,
      renderCell: (row) => {
        const meta = row.domainExtra;
        if (meta.statusKey === 'SIN_AUDITORIA') {
          return '<span class="text-xs text-slate-400">—</span>';
        }
        return `
          <div class="min-w-0 space-y-0.5 tabular-nums">
            <div class="text-xs font-bold text-slate-800 whitespace-nowrap">
              ${meta.selectedProcessesCount} / ${meta.eligibleProcessesCount} proc. en ${meta.sitesCount} sitio${
                meta.sitesCount === 1 ? '' : 's'
              }
            </div>
            ${
              meta.neverAuditedEligibleCount > 0
                ? `<span class="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200 whitespace-nowrap">⚠️ ${meta.neverAuditedEligibleCount} nunca aud.</span>`
                : `<div class="text-[10px] text-slate-500 whitespace-nowrap">${meta.configuredSitesCount}/${meta.sitesCount} sitios cubiertos</div>`
            }
          </div>
        `;
      },
    },
    {
      id: 'estado',
      header: 'Estado',
      defaultWidthPct: 14,
      minWidthPx: 115,
      renderCell: (row) => {
        const meta = getStatusMeta(row.domainExtra.statusKey);
        return `
          <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border ${meta.badgeClass} whitespace-nowrap">
            ${escapeHtml(meta.label)}
          </span>
        `;
      },
    },
  ];

  const pickerModalHtml = pickerModel
    ? renderOrgCertPickerModal<ProcesoOrgCertMeta>({
        model: pickerModel,
        domainColumns: pickerDomainColumns,
        subtitle:
          'Seleccione un certificado (agrupado por auditoría vinculada) para programar procesos por sitio y revisar su historial multi-anual.',
        emptySearchMessage:
          'No se encontraron certificados ni auditorías que coincidan con la búsqueda en esta organización.',
      })
    : '';

  const archiveProps = extractUniversalArchiveProps(archiveConfig, 'programacion');

  return renderOrgMultiView<ProcesoOrgCertMeta>({
    domainKey: 'proceso',
    tableId: 'proceso-main',
    title: '4. Proceso',
    subtitle:
      'Selección de procesos auditables por organización y sitio e historial multi-anual.',
    entityLabel: 'organizaciones',
    groupingMode: 'audit',
    rows: orgRows,
    searchQuery: state.query,
    searchPlaceholder:
      'Buscar organización, conglomerado, certificado, norma, auditoría o sitio...',
    searchInputId: 'procesoSearchInput',
    clearSearchBtnId: 'clearProcesoSearchBtn',
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen,
    sortState: { column: state.sortColumn, direction: state.sortDirection },
    columnWidths: tableColumnWidths?.['proceso-main'],
    facetCategories,
    facetSelections: state.facetSelections,
    extraColumns,
    renderCardExtra,
    actionsHtml: headerAddAuditHtml,
    loading,
    emptyStateTitle:
      orgRows.length === 0
        ? 'Sin organizaciones disponibles'
        : 'No se encontraron organizaciones en 4. Proceso',
    emptyStateMessage:
      orgRows.length === 0
        ? 'Complete 1.4 Sitio en al menos un certificado para habilitar la selección de procesos.'
        : 'Ajuste la búsqueda o filtros en la barra lateral.',
    emptyStateActionHtml: orgRows.length === 0 ? headerAddAuditHtml : '',
    pickerModalHtml,
    ...archiveProps,
  });
}
