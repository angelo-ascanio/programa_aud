import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import type { VinculoEntity } from '../lib/vinculoDomain';
import {
  formatAuditDateLabel,
  resolveLatestPlannedDate,
  type AuditDateEntry,
  type ProgramaAuditoriaEntity,
} from '../lib/auditPlanningEngine';
import type { ProgramacionAuditEntity } from '../lib/auditExecution';
import type {
  CertificadoDetailEntity,
  ProcesoTipo,
  TurnoPorSitioLink,
} from '../lib/multisiteSampling';
import type { CertificateRecord } from '../lib/searchControls';
import type { ProcesoPorSitioLink } from '../lib/sitioDomain';
import {
  resolveAuditNavigation,
  type CertificateAuditNavigation,
} from '../lib/certificateAuditSelector';
import {
  buildAuditTurnoDetail,
  buildCertificateTurnoRows,
  resolveHomonymousTargetMatches,
  type AuditTurnoDetailModel,
  type CertTurnoStatus,
  type CertificateTurnoRow,
  type SiteTurnoMatrixModel,
  type SiteTurnoMatrixRow,
} from '../lib/turnoDomain';
import type { CandidateProcessEntity } from '../lib/programaCertificadoDomain';
import {
  computeReactiveFacetCounts,
  filterRecordsWithFacets,
  sortItems,
  type ColumnDefinition,
  type MultiViewFacetCategory,
  type MultiViewSelectionMap,
  type SortDirection,
  type UniversalViewMode,
} from '../lib/universalTemplate';
import { renderUniversalTemplate } from './universalTemplate';
import { renderAuditSectionShell } from './auditSectionShell';
import { renderAddAuditButton } from './auditCardBreadcrumb';
import {
  extractUniversalArchiveProps,
  type ArchiveMultiViewConfig,
} from '../lib/archiveGovernance';

export type ProgramaTurnosSortColumn =
  | 'certificado'
  | 'audit_date'
  | 'cobertura'
  | 'estado';

export interface ProgramaTurnosViewState {
  query: string;
  viewMode: UniversalViewMode;
  isSidebarOpen: boolean;
  sortColumn: ProgramaTurnosSortColumn | null;
  sortDirection: SortDirection;
  facetSelections: MultiViewSelectionMap;
  selectedCertId?: string | null;
  selectedAuditId?: string | null;
  /** Legacy compatibility field */
  selectedProgramId?: string | null;
  focusedSitePlanId: string | null;
  onlyPending: boolean;
  batchSelectedTpsIdsBySitePlanId: Record<string, string[]>;
  savingSitePlanId: string | null;
  editErrorMessage: string | null;
}

export const DEFAULT_PROGRAMA_TURNOS_STATE: ProgramaTurnosViewState = {
  query: '',
  viewMode: 'list',
  isSidebarOpen: true,
  sortColumn: null,
  sortDirection: 'none',
  facetSelections: {},
  selectedCertId: null,
  selectedAuditId: null,
  selectedProgramId: null,
  focusedSitePlanId: null,
  onlyPending: false,
  batchSelectedTpsIdsBySitePlanId: {},
  savingSitePlanId: null,
  editErrorMessage: null,
};

export interface ProgramaTurnosPageProps {
  profile: UserProfile;
  state: ProgramaTurnosViewState;
  audits: ReadonlyArray<ProgramacionAuditEntity>;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  vinculos?: ReadonlyArray<VinculoEntity>;
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

export interface ProgramaTurnosViewProps {
  audit: ProgramacionAuditEntity;
  program: ProgramaAuditoriaEntity | null;
  allAudits: ReadonlyArray<ProgramacionAuditEntity>;
  allProcessesPorSitio: ReadonlyArray<ProcesoPorSitioLink>;
  allProcesses: ReadonlyArray<CandidateProcessEntity>;
  allTurnosPorSitio: ReadonlyArray<TurnoPorSitioLink>;
  focusedSitePlanId?: string | null;
  onlyPending?: boolean;
  batchSelectedTpsIdsBySitePlanId?: Record<string, string[]>;
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

function extractProcessAndShiftCatalogFromCertificates(
  certificados: ReadonlyArray<CertificadoDetailEntity & { deleted_at?: string | null }>
): {
  allProcessesPorSitio: ProcesoPorSitioLink[];
  allProcesses: CandidateProcessEntity[];
  allTurnosPorSitio: TurnoPorSitioLink[];
} {
  const ppsMap = new Map<string, ProcesoPorSitioLink>();
  const procMap = new Map<string, CandidateProcessEntity>();
  const tpsMap = new Map<string, TurnoPorSitioLink>();

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
        turnos_por_sitio?: TurnoPorSitioLink[];
      };
      if (candidateSite.deleted_at) continue;
      for (const link of candidateSite.procesos_por_sitio || []) {
        if (!link.deleted_at && !ppsMap.has(link.id)) {
          ppsMap.set(link.id, link);
        }
      }
      for (const shiftLink of candidateSite.turnos_por_sitio || []) {
        if (!shiftLink.deleted_at && !tpsMap.has(shiftLink.id)) {
          tpsMap.set(shiftLink.id, shiftLink);
        }
      }
    }
  }

  return {
    allProcessesPorSitio: Array.from(ppsMap.values()),
    allProcesses: Array.from(procMap.values()),
    allTurnosPorSitio: Array.from(tpsMap.values()),
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

function getStatusMeta(statusKey: CertTurnoStatus): {
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

/**
 * Calcula porcentajes exactos que suman exactamente `100.00%` para las columnas
 * `Proceso` + `K` turnos del sitio (`<colgroup>`).
 */
function computeMatrixColumnWidthsPct(shiftColumnsCount: number): {
  processColPct: number;
  shiftColsPct: number[];
} {
  if (shiftColumnsCount <= 0) {
    return { processColPct: 100, shiftColsPct: [] };
  }
  const processColPct = shiftColumnsCount === 1 ? 56 : shiftColumnsCount === 2 ? 42 : 34;
  const remainingPct = Number((100 - processColPct).toFixed(2));
  const rawEach = Math.floor((remainingPct / shiftColumnsCount) * 100) / 100;
  const shiftColsPct = Array.from({ length: shiftColumnsCount }, () => rawEach);
  const allocated = rawEach * shiftColumnsCount;
  const remainder = Number((remainingPct - allocated).toFixed(2));
  shiftColsPct[shiftColumnsCount - 1] = Number(
    (shiftColsPct[shiftColumnsCount - 1] + remainder).toFixed(2)
  );
  return { processColPct, shiftColsPct };
}

function renderStickySiteNavigationBar(opts: {
  detailModel: AuditTurnoDetailModel;
  effectiveFocusedSiteId: string | null;
  onlyPending: boolean;
}): string {
  const { detailModel, effectiveFocusedSiteId, onlyPending } = opts;
  const sites = detailModel.sites;
  if (sites.length === 0) return '';

  const currentIdx = effectiveFocusedSiteId
    ? sites.findIndex((s) => s.sitePlan.id === effectiveFocusedSiteId)
    : -1;
  const prevSiteId =
    sites.length > 1
      ? currentIdx > 0
        ? sites[currentIdx - 1].sitePlan.id
        : currentIdx === -1
        ? null
        : null
      : null;
  const nextSiteId =
    sites.length > 1
      ? currentIdx === -1
        ? sites[0].sitePlan.id
        : currentIdx < sites.length - 1
        ? sites[currentIdx + 1].sitePlan.id
        : null
      : null;

  const progressPct =
    detailModel.totalPairs > 0
      ? Math.round((detailModel.coveredPairs / detailModel.totalPairs) * 100)
      : 0;

  return `
    <div
      data-testid="turno-sticky-site-nav"
      class="sticky top-2 z-20 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur-xs shadow-sm px-3.5 py-3 space-y-2.5"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex flex-wrap items-center gap-2 min-w-0">
          <span class="text-xs font-bold text-slate-900">
            Cobertura de Turnos
          </span>
          <span
            data-testid="turno-global-progress-badge"
            class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border tabular-nums ${
              detailModel.isComplete
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-amber-50 text-amber-800 border-amber-200'
            }"
          >
            ${detailModel.isComplete ? '✓ Completo' : 'Pendiente'} · ${detailModel.coveredPairs} / ${detailModel.totalPairs} Sitio↔Proceso (${progressPct}%)
          </span>
        </div>

        <div class="flex flex-wrap items-center gap-1.5 shrink-0">
          <button
            type="button"
            data-action="turno-toggle-only-pending"
            aria-pressed="${onlyPending ? 'true' : 'false'}"
            class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
              onlyPending
                ? 'bg-amber-600 border-amber-700 text-white shadow-2xs'
                : 'bg-white border-slate-300 text-slate-700 hover:bg-amber-50 hover:border-amber-300'
            }"
          >
            <span>Solo pendientes (${detailModel.pendingPairs})</span>
          </button>

          ${
            sites.length > 1
              ? `
                <div class="inline-flex items-center gap-1" role="group" aria-label="Recorrer sitios">
                  <button
                    type="button"
                    data-action="turno-step-site"
                    data-site-plan-id="${escapeHtml(prevSiteId || '')}"
                    ${!prevSiteId ? 'disabled' : ''}
                    class="px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors whitespace-nowrap ${
                      prevSiteId
                        ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer'
                        : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                    }"
                  >
                    ← Sitio anterior
                  </button>
                  <button
                    type="button"
                    data-action="turno-step-site"
                    data-site-plan-id="${escapeHtml(nextSiteId || '')}"
                    ${!nextSiteId ? 'disabled' : ''}
                    class="px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors whitespace-nowrap ${
                      nextSiteId
                        ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer'
                        : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                    }"
                  >
                    Sitio siguiente →
                  </button>
                </div>
              `
              : ''
          }
        </div>
      </div>

      <div
        class="flex flex-wrap items-center gap-1.5"
        role="tablist"
        aria-label="Navegación rápida de sitios en 5. Turno"
      >
        <button
          type="button"
          role="tab"
          aria-selected="${effectiveFocusedSiteId === null ? 'true' : 'false'}"
          data-action="turno-focus-site"
          data-site-plan-id=""
          class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
            effectiveFocusedSiteId === null
              ? 'bg-slate-900 border-slate-900 text-white shadow-2xs'
              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
          }"
        >
          <span>Todos los sitios</span>
          <span class="tabular-nums opacity-85">(${sites.length})</span>
        </button>

        ${sites
          .map((s) => {
            const isActive = effectiveFocusedSiteId === s.sitePlan.id;
            const statusGlyph =
              s.selectedProcessesCount === 0
                ? '·'
                : s.isSiteComplete
                ? '✓'
                : '⚠️';
            return `
              <button
                type="button"
                role="tab"
                aria-selected="${isActive ? 'true' : 'false'}"
                data-action="turno-focus-site"
                data-site-plan-id="${escapeHtml(s.sitePlan.id)}"
                class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-indigo-600 border-indigo-700 text-white shadow-2xs'
                    : s.isSiteComplete
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900 hover:bg-emerald-100/70'
                    : 'bg-amber-50/70 border-amber-200 text-amber-900 hover:bg-amber-100/70'
                }"
              >
                <span class="truncate max-w-[160px]">${escapeHtml(s.sitePlan.nombre_sitio)}</span>
                <span class="tabular-nums">· ${s.coveredProcessesCount}/${s.selectedProcessesCount} ${statusGlyph}</span>
              </button>
            `;
          })
          .join('')}
      </div>
    </div>
  `;
}

function renderSiteAntiFatigueToolbar(opts: {
  audit: ProgramacionAuditEntity;
  detailModel: AuditTurnoDetailModel;
  siteMatrix: SiteTurnoMatrixModel;
  selectedBatchShiftIds: ReadonlyArray<string>;
  isSaving: boolean;
  isStaff: boolean;
}): string {
  const {
    audit,
    detailModel,
    siteMatrix,
    selectedBatchShiftIds,
    isSaving,
    isStaff,
  } = opts;
  if (!isStaff || siteMatrix.rows.length === 0 || siteMatrix.siteShiftOptions.length === 0) {
    return '';
  }

  const { sitePlan, siteShiftOptions, pendingProcessesCount, isSingleShiftSite } = siteMatrix;
  const validShiftIds = new Set(siteShiftOptions.map((s) => s.id));
  const cleanSelectedBatch = selectedBatchShiftIds.filter((id) => validShiftIds.has(id));
  const propagationPreview =
    detailModel.sites.length > 1
      ? resolveHomonymousTargetMatches(detailModel, sitePlan.id)
      : null;

  return `
    <div
      data-testid="turno-anti-fatigue-toolbar"
      class="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 flex flex-col gap-2"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-[11px] font-bold uppercase tracking-wider text-slate-600">
          Aceleradores Anti-Fatiga del Sitio
        </span>

        <div class="flex flex-wrap items-center gap-1.5">
          ${
            isSingleShiftSite
              ? `
                <button
                  type="button"
                  data-action="turno-autofill-single-shift"
                  data-audit-id="${escapeHtml(audit.id)}"
                  data-site-plan-id="${escapeHtml(sitePlan.id)}"
                  ${isSaving || pendingProcessesCount === 0 ? 'disabled' : ''}
                  class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors whitespace-nowrap ${
                    !isSaving && pendingProcessesCount > 0
                      ? 'bg-emerald-600 border-emerald-700 text-white hover:bg-emerald-700 cursor-pointer'
                      : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                  }"
                >
                  <span>Cubrir pendientes con turno único</span>
                  ${
                    pendingProcessesCount > 0
                      ? `<span class="px-1.5 py-0.2 rounded-full bg-white/20 text-white text-[10px] tabular-nums">${pendingProcessesCount}</span>`
                      : ''
                  }
                </button>
              `
              : ''
          }

          ${
            propagationPreview
              ? `
                <button
                  type="button"
                  data-action="turno-propagate-homonymous"
                  data-audit-id="${escapeHtml(audit.id)}"
                  data-site-plan-id="${escapeHtml(sitePlan.id)}"
                  ${isSaving || propagationPreview.assignments.length === 0 ? 'disabled' : ''}
                  title="${
                    propagationPreview.assignments.length > 0
                      ? `Copiar turnos compatibles hacia ${propagationPreview.matchedProcessesCount} proceso(s) homónimo(s) en otros sitios`
                      : 'Configure turnos en este sitio con procesos homónimos pendientes en otras sedes'
                  }"
                  class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap ${
                    !isSaving && propagationPreview.assignments.length > 0
                      ? 'bg-indigo-600 border-indigo-700 text-white hover:bg-indigo-700 cursor-pointer'
                      : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                  }"
                >
                  <span>Propagar a procesos homónimos</span>
                  ${
                    propagationPreview.assignments.length > 0
                      ? `<span class="px-1.5 py-0.2 rounded-full bg-white/20 text-white text-[10px] font-bold tabular-nums">${propagationPreview.matchedProcessesCount}</span>`
                      : ''
                  }
                </button>
              `
              : ''
          }
        </div>
      </div>

      ${
        !isSingleShiftSite
          ? `
            <div class="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-200/80">
              <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Turnos para aplicar en lote a procesos pendientes">
                <span class="text-[11px] font-semibold text-slate-600 mr-1">
                  Lote a pendientes:
                </span>
                ${siteShiftOptions
                  .map((shiftOpt) => {
                    const start = shiftOpt.hora_entrada.slice(0, 5);
                    const end = shiftOpt.hora_salida.slice(0, 5);
                    const desc = (shiftOpt.descripcion || '').trim();
                    const isChipSelected = cleanSelectedBatch.includes(shiftOpt.id);
                    return `
                      <button
                        type="button"
                        data-action="turno-toggle-batch-chip"
                        data-site-plan-id="${escapeHtml(sitePlan.id)}"
                        data-tps-id="${escapeHtml(shiftOpt.id)}"
                        aria-pressed="${isChipSelected ? 'true' : 'false'}"
                        class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                          isChipSelected
                            ? 'bg-slate-900 border-slate-900 text-white shadow-2xs'
                            : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                        }"
                      >
                        <span aria-hidden="true">${isChipSelected ? '☑' : '☐'}</span>
                        <span class="tabular-nums font-bold">${escapeHtml(start)}–${escapeHtml(end)}</span>
                        ${desc ? `<span class="opacity-85">${escapeHtml(desc)}</span>` : ''}
                      </button>
                    `;
                  })
                  .join('')}
              </div>

              <button
                type="button"
                data-action="turno-apply-batch-pending"
                data-audit-id="${escapeHtml(audit.id)}"
                data-site-plan-id="${escapeHtml(sitePlan.id)}"
                ${isSaving || pendingProcessesCount === 0 || cleanSelectedBatch.length === 0 ? 'disabled' : ''}
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors whitespace-nowrap ${
                  !isSaving && pendingProcessesCount > 0 && cleanSelectedBatch.length > 0
                    ? 'bg-emerald-600 border-emerald-700 text-white hover:bg-emerald-700 cursor-pointer'
                    : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                }"
              >
                <span>Aplicar a ${pendingProcessesCount} proceso${pendingProcessesCount === 1 ? '' : 's'} pendiente${pendingProcessesCount === 1 ? '' : 's'}</span>
              </button>
            </div>
          `
          : ''
      }
    </div>
  `;
}

function renderMatrixRowCells(opts: {
  audit: ProgramacionAuditEntity;
  siteMatrix: SiteTurnoMatrixModel;
  row: SiteTurnoMatrixRow;
  isStaff: boolean;
}): string {
  const { audit, siteMatrix, row, isStaff } = opts;
  const assignedCount = row.assignedTpsIds.length;

  const coverageBadgeHtml = row.isCovered
    ? `
      <span
        data-testid="process-shift-coverage-badge"
        class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap tabular-nums"
      >
        ${assignedCount} turno${assignedCount === 1 ? '' : 's'}
      </span>
    `
    : `
      <span
        data-testid="process-shift-coverage-badge"
        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap"
      >
        <span aria-hidden="true">⚠️</span>
        <span>Pendiente turno</span>
      </span>
    `;

  const shiftCellsHtml = siteMatrix.columns
    .map((col) => {
      const checked = row.assignedTpsIds.includes(col.shift.id);
      const checkboxId = `progShiftChk_${siteMatrix.sitePlan.id}_${row.psa.id}_${col.shift.id}`;
      return `
        <td class="px-2 py-2.5 border-l border-slate-100 text-center align-middle">
          <label
            for="${escapeHtml(checkboxId)}"
            data-testid="programa-shift-chip"
            class="inline-flex items-center justify-center gap-1.5 min-h-[36px] w-full rounded-lg border px-2 py-1 text-[11px] font-semibold transition-colors ${
              checked
                ? 'bg-emerald-50 border-emerald-400 text-emerald-950'
                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
            } ${isStaff ? 'cursor-pointer' : 'cursor-not-allowed opacity-85'}"
          >
            <input
              type="checkbox"
              id="${escapeHtml(checkboxId)}"
              data-action="toggle-programa-process-shift"
              data-audit-id="${escapeHtml(audit.id)}"
              data-site-plan-id="${escapeHtml(siteMatrix.sitePlan.id)}"
              data-psa-id="${escapeHtml(row.psa.id)}"
              data-tps-id="${escapeHtml(col.shift.id)}"
              data-currently-selected="${checked ? 'true' : 'false'}"
              aria-label="${escapeHtml(`${row.procesoNombre} — ${col.description || col.timeRange}`)}"
              ${checked ? 'checked' : ''}
              ${!isStaff ? 'disabled' : ''}
              class="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 shrink-0"
            />
            <span class="sr-only">${escapeHtml(col.timeRange)}</span>
          </label>
        </td>
      `;
    })
    .join('');

  return `
    <tr
      data-testid="programa-turnos-process-card"
      data-psa-id="${escapeHtml(row.psa.id)}"
      class="border-t border-slate-200 transition-colors ${
        row.isCovered ? 'bg-white hover:bg-emerald-50/20' : 'bg-amber-50/25 hover:bg-amber-50/40'
      }"
    >
      <td class="px-3 py-2.5 align-middle">
        <div class="min-w-0 space-y-1">
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="text-xs font-bold text-slate-900 break-words">
              ${escapeHtml(row.procesoNombre)}
            </span>
            <span class="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold border ${getProcessTypeBadgeClass(
              row.procesoTipo
            )} whitespace-nowrap">
              ${escapeHtml(row.procesoTipo)}
            </span>
            ${coverageBadgeHtml}
          </div>
        </div>
      </td>
      ${shiftCellsHtml}
    </tr>
  `;
}

function renderSiteTurnoMatrixTable(opts: {
  audit: ProgramacionAuditEntity;
  siteMatrix: SiteTurnoMatrixModel;
  visibleRows: ReadonlyArray<SiteTurnoMatrixRow>;
  onlyPending: boolean;
  isSaving: boolean;
  isStaff: boolean;
}): string {
  const { audit, siteMatrix, visibleRows, onlyPending, isSaving, isStaff } = opts;

  if (siteMatrix.rows.length === 0) {
    return `
      <div class="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center space-y-2">
        <p class="text-xs text-slate-600">
          Este sitio aún no tiene procesos seleccionados en <strong>4. Proceso</strong>.
        </p>
        <button
          type="button"
          data-action="audit-breadcrumb-nav"
          data-target-subview="proceso"
          class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer"
        >
          Ir a 4. Proceso →
        </button>
      </div>
    `;
  }

  if (siteMatrix.siteShiftOptions.length === 0) {
    return '';
  }

  if (visibleRows.length === 0 && onlyPending) {
    return `
      <div class="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-center text-xs font-semibold text-emerald-900">
        ✓ Todos los procesos de este sitio (${siteMatrix.coveredProcessesCount}/${siteMatrix.selectedProcessesCount}) ya tienen turno asignado.
      </div>
    `;
  }

  const { processColPct, shiftColsPct } = computeMatrixColumnWidthsPct(
    siteMatrix.columns.length
  );

  const colgroupHtml = `
    <colgroup>
      <col style="width: ${processColPct}%;" />
      ${shiftColsPct
        .map((pct) => `<col style="width: ${pct}%;" />`)
        .join('')}
    </colgroup>
  `;

  return `
    <div class="overflow-x-auto rounded-xl border border-slate-200">
      <table
        data-testid="turno-matrix-table"
        class="w-full table-fixed border-collapse bg-white text-left"
      >
        ${colgroupHtml}
        <thead class="bg-slate-50 border-b border-slate-200">
          <tr>
            <th scope="col" class="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-600">
              Proceso (${visibleRows.length})
            </th>
            ${siteMatrix.columns
              .map((col) => {
                const visibleCheckedCount = visibleRows.filter((r) =>
                  r.assignedTpsIds.includes(col.shift.id)
                ).length;
                const allVisibleChecked =
                  visibleRows.length > 0 && visibleCheckedCount === visibleRows.length;
                const shortShiftTitle = col.description || col.timeRange;
                return `
                  <th scope="col" class="px-2 py-2 border-l border-slate-200 text-center align-top">
                    <div class="space-y-1">
                      <div class="text-[11px] font-bold text-slate-900 tabular-nums truncate">
                        ${escapeHtml(col.timeRange)}
                      </div>
                      ${
                        col.description
                          ? `<div class="text-[10px] font-medium text-slate-600 truncate" title="${escapeHtml(col.description)}">${escapeHtml(col.description)}</div>`
                          : ''
                      }
                      <div class="text-[10px] font-semibold text-slate-500 tabular-nums">
                        ${visibleCheckedCount}/${visibleRows.length}
                      </div>
                      ${
                        isStaff
                          ? `
                            <button
                              type="button"
                              data-action="turno-toggle-column-shift"
                              data-audit-id="${escapeHtml(audit.id)}"
                              data-site-plan-id="${escapeHtml(siteMatrix.sitePlan.id)}"
                              data-tps-id="${escapeHtml(col.shift.id)}"
                              ${isSaving ? 'disabled' : ''}
                              class="w-full inline-flex items-center justify-center gap-1 px-1.5 py-1 rounded-md border text-[10px] font-bold transition-colors cursor-pointer truncate ${
                                allVisibleChecked
                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-800'
                                  : 'bg-white border-slate-300 text-slate-700 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-900'
                              }"
                              title="${escapeHtml(
                                allVisibleChecked
                                  ? `Desmarcar ${shortShiftTitle}`
                                  : `Marcar todos [${shortShiftTitle}]`
                              )}"
                            >
                              <span aria-hidden="true">${allVisibleChecked ? '☐' : '☑'}</span>
                              <span class="truncate">${escapeHtml(
                                allVisibleChecked ? 'Quitar todos' : `Marcar todos [${shortShiftTitle}]`
                              )}</span>
                            </button>
                          `
                          : ''
                      }
                    </div>
                  </th>
                `;
              })
              .join('')}
          </tr>
        </thead>
        <tbody>
          ${visibleRows
            .map((row) =>
              renderMatrixRowCells({
                audit,
                siteMatrix,
                row,
                isStaff,
              })
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * Renderiza el cuerpo de detalle Anti-Fatiga para `5. Turno`, reutilizable de forma autónoma
 * y dentro del shell Certificate-Based (`renderAuditSectionShell`).
 */
export function renderProgramaTurnosDetailBody(props: ProgramaTurnosViewProps): string {
  const {
    audit,
    allAudits,
    allProcessesPorSitio,
    allProcesses,
    allTurnosPorSitio,
    focusedSitePlanId = null,
    onlyPending = false,
    batchSelectedTpsIdsBySitePlanId = {},
    savingSitePlanId = null,
    isStaff,
    editErrorMessage,
  } = props;

  const detailModel = buildAuditTurnoDetail({
    audit,
    allAudits,
    allProcessesPorSitio,
    allProcesses,
    allTurnosPorSitio,
  });

  const errorBannerHtml = editErrorMessage
    ? `
      <div role="alert" data-testid="programa-turnos-error" class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800 flex items-center gap-2">
        <span aria-hidden="true">⚠️</span>
        <span>${escapeHtml(editErrorMessage)}</span>
      </div>
    `
    : '';

  if (detailModel.sites.length === 0) {
    return `
      <div data-testid="programa-turnos-view" class="space-y-3">
        ${errorBannerHtml}
        <div class="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center space-y-2.5">
          <p class="text-xs text-slate-600">
            Esta auditoría aún no tiene sitios permanentes seleccionados en <strong>1.3 Sitio</strong>.
          </p>
          <button
            type="button"
            data-action="audit-breadcrumb-nav"
            data-target-subview="designacion/sitio"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 cursor-pointer"
          >
            <span>Ir a 1.3 Sitio</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    `;
  }

  const effectiveFocusedSiteId =
    focusedSitePlanId && detailModel.sites.some((s) => s.sitePlan.id === focusedSitePlanId)
      ? focusedSitePlanId
      : null;

  const stickyNavHtml = renderStickySiteNavigationBar({
    detailModel,
    effectiveFocusedSiteId,
    onlyPending,
  });

  const visibleSites = effectiveFocusedSiteId
    ? detailModel.sites.filter((s) => s.sitePlan.id === effectiveFocusedSiteId)
    : detailModel.sites;

  const sitesHtml = visibleSites
    .map((siteMatrix) => {
      const { sitePlan, siteBadgeLabel, siteShiftOptions, coveredProcessesCount, selectedProcessesCount } =
        siteMatrix;
      const isSaving = savingSitePlanId === sitePlan.id;
      const visibleRows = onlyPending
        ? siteMatrix.rows.filter((r) => !r.isCovered)
        : siteMatrix.rows;

      const noShiftsNoticeHtml =
        siteShiftOptions.length === 0
          ? `
            <div
              data-testid="programa-site-no-shifts-alert"
              class="rounded-xl border border-amber-200 bg-amber-50/90 p-3.5 flex flex-wrap items-center justify-between gap-2.5"
            >
              <div class="space-y-0.5 text-xs text-amber-950 min-w-0">
                <p class="font-bold">
                  ⚠️ Este sitio no tiene turnos configurados en el maestro (turnos_por_sitio)
                </p>
                <p class="text-[11px] text-amber-800">
                  ${
                    isStaff
                      ? 'Configure al menos un turno operativo en la ficha maestra del sitio antes de asignarlo a los procesos.'
                      : 'Un coordinador autorizado debe definir los turnos del sitio maestro para habilitar su asignación.'
                  }
                </p>
              </div>
              ${
                isStaff
                  ? `
                    <button
                      type="button"
                      data-parent-nav="true"
                      data-nav="certificacion"
                      data-subview="certificates"
                      data-parent-type="sitio"
                      data-entity-id="${escapeHtml(sitePlan.id_sitio)}"
                      class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-900 hover:bg-amber-800 text-xs font-semibold text-white transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <span>Certificado → Sitio</span>
                      <span aria-hidden="true">→</span>
                    </button>
                  `
                  : ''
              }
            </div>
          `
          : '';

      const toolbarHtml = renderSiteAntiFatigueToolbar({
        audit,
        detailModel,
        siteMatrix,
        selectedBatchShiftIds: batchSelectedTpsIdsBySitePlanId[sitePlan.id] ?? [],
        isSaving,
        isStaff,
      });

      const matrixHtml = renderSiteTurnoMatrixTable({
        audit,
        siteMatrix,
        visibleRows,
        onlyPending,
        isSaving,
        isStaff,
      });

      return `
        <section
          data-testid="programa-site-turnos-card"
          data-site-plan-id="${escapeHtml(sitePlan.id)}"
          class="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden"
        >
          <header class="bg-slate-50/90 border-b border-slate-200 px-3.5 py-3 flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-1.5 min-w-0">
              <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                sitePlan.numero_sitio === 0
                  ? 'bg-indigo-100 text-indigo-900 border-indigo-200'
                  : 'bg-slate-100 text-slate-700 border-slate-200'
              } whitespace-nowrap">
                ${escapeHtml(siteBadgeLabel)}
              </span>
              <h4 class="text-xs sm:text-sm font-bold text-slate-900 truncate">
                ${escapeHtml(sitePlan.nombre_sitio)}
              </h4>
            </div>
            <span
              data-testid="site-turnos-counter"
              class="text-[11px] font-semibold tabular-nums whitespace-nowrap ${
                selectedProcessesCount > 0 && siteMatrix.pendingProcessesCount === 0
                  ? 'text-emerald-700'
                  : 'text-slate-600'
              }"
            >
              ${coveredProcessesCount}/${selectedProcessesCount} proceso${selectedProcessesCount === 1 ? '' : 's'} con turno
            </span>
          </header>

          <div class="p-3 sm:p-3.5 space-y-3">
            ${noShiftsNoticeHtml}
            ${toolbarHtml}
            ${matrixHtml}
          </div>
        </section>
      `;
    })
    .join('');

  return `
    <div data-testid="programa-turnos-view" class="space-y-4">
      ${errorBannerHtml}
      ${stickyNavHtml}
      ${sitesHtml}
    </div>
  `;
}

/**
 * Step 7.1 — Renderiza la vista completa Certificate-Based de `5. Turno` (`#/auditorias/turno`):
 * Multi View por Certificados (`turno-main`) y Detail View con Matriz Anti-Fatiga dentro de `renderAuditSectionShell`.
 */
export function renderProgramaTurnosView(props: ProgramaTurnosPageProps): string {
  const {
    profile,
    state,
    audits: auditsProp,
    programs,
    certificados = [],
    certificates = [],
    authorizedClientOrgIds,
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

  const { allProcessesPorSitio, allProcesses, allTurnosPorSitio } =
    extractProcessAndShiftCatalogFromCertificates(certificados);

  const allRows = buildCertificateTurnoRows({
    certificates: scoped.certificates,
    detailedCerts: scoped.certificados,
    audits: scoped.audits,
    programs,
    referenceIsoDate,
    allProcessesPorSitio,
    allProcesses,
    allTurnosPorSitio,
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
        ? renderProgramaTurnosDetailBody({
            audit: activeAudit,
            program: activeProgram,
            allAudits: scoped.audits,
            allProcessesPorSitio,
            allProcesses,
            allTurnosPorSitio,
            focusedSitePlanId: state.focusedSitePlanId,
            onlyPending: state.onlyPending,
            batchSelectedTpsIdsBySitePlanId: state.batchSelectedTpsIdsBySitePlanId,
            savingSitePlanId: state.savingSitePlanId,
            isStaff,
            editErrorMessage: state.editErrorMessage,
          })
        : '';

      return renderAuditSectionShell({
        sectionTitle: '5. Turno',
        sectionSymbol: '⏱️',
        backSubview: 'turno',
        certInfo: {
          id: certRow.certId,
          numero_certificado: certRow.numero_certificado,
          organizacion_nombre: certRow.organizacion_nombre,
          norma_codigo: certRow.norma_codigo,
          estatus: certRow.estatus,
        },
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

  return renderTurnoMultiView({
    state,
    allRows,
    loading,
    archiveConfig,
    tableColumnWidths,
    headerAddAuditHtml: resolvedHeaderAddAuditHtml,
  });
}

function renderTurnoMultiView(opts: {
  state: ProgramaTurnosViewState;
  allRows: ReadonlyArray<CertificateTurnoRow>;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
  headerAddAuditHtml?: string;
}): string {
  const {
    state,
    allRows,
    loading = false,
    archiveConfig,
    tableColumnWidths,
    headerAddAuditHtml = '',
  } = opts;

  const uniqueStandards = Array.from(
    new Set(
      allRows
        .map((r) => (r.norma_codigo || '').trim())
        .filter((s) => s.length > 0)
    )
  ).sort((a, b) => a.localeCompare(b));

  const facetCategories: MultiViewFacetCategory<CertificateTurnoRow>[] = [
    {
      id: 'estado_turno',
      label: 'Estado Turnos',
      options: [
        { value: 'PENDIENTE', label: 'Pendiente' },
        { value: 'COMPLETO', label: 'Completo' },
        { value: 'SIN_AUDITORIA', label: 'Sin auditorías' },
      ],
      extractValues: (r) => r.statusKey,
    },
    ...(uniqueStandards.length > 0
      ? [
          {
            id: 'norma',
            label: 'Norma',
            options: uniqueStandards.map((norma) => ({ value: norma, label: norma })),
            extractValues: (r: CertificateTurnoRow) => (r.norma_codigo || '').trim(),
          },
        ]
      : []),
    {
      id: 'vinculacion',
      label: 'Lote / Vínculo',
      options: [
        { value: 'VINCULADA', label: 'Auditoría vinculada' },
        { value: 'INDIVIDUAL', label: 'Auditoría individual' },
        { value: 'SIN_AUDITORIA', label: 'Sin auditorías' },
      ],
      extractValues: (r) =>
        r.totalAudits === 0 ? 'SIN_AUDITORIA' : r.isLinkedLatest ? 'VINCULADA' : 'INDIVIDUAL',
    },
  ];

  const searchOptions = {
    getSearchableText: (row: CertificateTurnoRow): string => {
      const siteNames = (row.latestAudit?.sitiosPlan || [])
        .filter((s) => !s.deleted_at)
        .map((s) => s.nombre_sitio)
        .join(' ');
      return [
        row.numero_certificado,
        row.organizacion_nombre,
        row.norma_codigo,
        row.latestAudit?.codigo_auditoria || '',
        row.latestAudit?.tipo_auditoria || '',
        row.latestProgram?.etiqueta || '',
        siteNames,
      ].join(' ');
    },
  };

  const facetGroups = computeReactiveFacetCounts(
    allRows,
    state.query,
    facetCategories,
    state.facetSelections,
    searchOptions
  );

  const filteredRows = filterRecordsWithFacets(
    allRows,
    state.query,
    facetCategories,
    state.facetSelections,
    searchOptions
  );

  const sortedRows = sortItems(
    filteredRows,
    state.sortColumn,
    state.sortDirection,
    (row, col) => {
      switch (col) {
        case 'certificado':
          return `${row.numero_certificado} ${row.organizacion_nombre}`.toLowerCase();
        case 'audit_date':
          return row.urgency.effectiveStartIso || '9999-12-31';
        case 'cobertura':
          return row.selectedProcessesCount > 0
            ? row.coveredProcessesCount / row.selectedProcessesCount
            : 0;
        case 'estado':
          return getStatusMeta(row.statusKey).rank;
        default:
          return getStatusMeta(row.statusKey).rank;
      }
    }
  );

  const columns: ColumnDefinition<CertificateTurnoRow>[] = [
    {
      id: 'certificado',
      header: 'Certificado & Org',
      defaultWidthPct: 32,
      minWidthPx: 190,
      sortable: true,
      renderCell: (row) => `
        <div class="min-w-0 space-y-0.5">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="font-mono text-xs font-bold text-slate-900 truncate">${escapeHtml(
              row.numero_certificado
            )}</span>
            <span class="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
              ${escapeHtml(row.norma_codigo)}
            </span>
          </div>
          <div class="text-[11px] text-slate-500 truncate">${escapeHtml(
            row.organizacion_nombre
          )}</div>
        </div>
      `,
    },
    {
      id: 'audit_date',
      header: 'Última Auditoría',
      defaultWidthPct: 24,
      minWidthPx: 155,
      sortable: true,
      renderCell: (row) => {
        if (!row.latestAudit) {
          return '<span class="text-xs text-slate-400">Sin auditorías</span>';
        }
        const dateLabel = formatDateSummaryCompact(row.latestPlannedDate);
        return `
          <div class="min-w-0 space-y-0.5">
            <div class="text-xs font-semibold text-slate-800 truncate">${escapeHtml(
              row.latestAudit.codigo_auditoria
            )} · ${escapeHtml(row.latestAudit.tipo_auditoria)}</div>
            <div class="text-[11px] text-slate-500 truncate">${escapeHtml(dateLabel)}</div>
          </div>
        `;
      },
    },
    {
      id: 'cobertura',
      header: 'Cobertura Turnos',
      defaultWidthPct: 26,
      minWidthPx: 165,
      sortable: true,
      renderCell: (row) => {
        if (!row.latestAudit) {
          return '<span class="text-xs text-slate-400">—</span>';
        }
        return `
          <div class="min-w-0 space-y-0.5">
            <div class="text-xs font-bold text-slate-800 tabular-nums whitespace-nowrap">
              ${row.coveredProcessesCount} / ${row.selectedProcessesCount} Sitio↔Proceso cubiertos
            </div>
            <div class="text-[10px] text-slate-500 tabular-nums whitespace-nowrap">
              ${row.totalAssignedShifts} asignación${row.totalAssignedShifts === 1 ? '' : 'es'} en ${row.sitesCount} sitio${row.sitesCount === 1 ? '' : 's'}
            </div>
          </div>
        `;
      },
    },
    {
      id: 'estado',
      header: 'Estado',
      defaultWidthPct: 18,
      minWidthPx: 120,
      sortable: true,
      renderCell: (row) => {
        const meta = getStatusMeta(row.statusKey);
        return `
          <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border ${meta.badgeClass} whitespace-nowrap">
            ${escapeHtml(meta.label)}
          </span>
        `;
      },
    },
  ];

  const renderCard = (row: CertificateTurnoRow): string => {
    const meta = getStatusMeta(row.statusKey);
    const dateLabel = formatDateSummaryCompact(row.latestPlannedDate);
    return `
      <article
        role="button"
        tabindex="0"
        data-action="select-section-cert"
        data-cert-id="${escapeHtml(row.certId)}"
        aria-label="Configurar turnos de ${escapeHtml(row.numero_certificado)}"
        class="text-left bg-white border border-slate-200 hover:border-slate-400 rounded-xl p-3.5 shadow-2xs transition-all cursor-pointer space-y-2.5 flex flex-col justify-between"
      >
        <div class="space-y-1.5">
          <div class="flex items-center justify-between gap-2">
            <span class="font-mono text-xs font-bold text-slate-900 truncate">${escapeHtml(
              row.numero_certificado
            )}</span>
            <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${meta.badgeClass} shrink-0">
              ${escapeHtml(meta.label)}
            </span>
          </div>
          <h3 class="text-sm font-bold text-slate-900 line-clamp-1">${escapeHtml(
            row.organizacion_nombre
          )}</h3>
          <p class="text-[11px] text-slate-500 truncate">${escapeHtml(row.norma_codigo)} · ${
            row.latestAudit
              ? `${escapeHtml(row.latestAudit.codigo_auditoria)} · ${escapeHtml(dateLabel)}`
              : 'Sin auditorías'
          }</p>
        </div>

        <div class="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px] tabular-nums">
          <span class="font-semibold text-slate-700">
            ${row.coveredProcessesCount} / ${row.selectedProcessesCount} Sitio↔Proceso cubiertos
          </span>
          <span class="text-slate-500 text-[10px]">${row.sitesCount} sitio${row.sitesCount === 1 ? '' : 's'}</span>
        </div>
      </article>
    `;
  };

  const archiveProps = extractUniversalArchiveProps(archiveConfig, 'programacion');

  return renderUniversalTemplate<CertificateTurnoRow>({
    domainKey: 'turno',
    tableId: 'turno-main',
    title: '5. Turno',
    subtitle:
      'Matriz anti-fatiga Proceso × Turno del Sitio restringida a turnos_por_sitio, con cobertura de 1 clic, aplicación a pendientes y propagación a homónimos.',
    entityLabel: 'certificados',
    searchQuery: state.query,
    searchPlaceholder: 'Buscar por certificado, organización, norma, auditoría o sitio...',
    searchInputId: 'turnoSearchInput',
    clearSearchBtnId: 'clearTurnoSearchBtn',
    totalCount: allRows.length,
    filteredCount: sortedRows.length,
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen,
    sortState: { column: state.sortColumn, direction: state.sortDirection },
    columnWidths: tableColumnWidths?.['turno-main'],
    facetGroups,
    items: sortedRows,
    columns,
    getRowAttrs: (row) =>
      `data-action="select-section-cert" data-cert-id="${escapeHtml(
        row.certId
      )}" title="Configurar turnos de ${escapeHtml(row.numero_certificado)}"`,
    renderCard,
    actionsHtml: headerAddAuditHtml,
    loading,
    emptyStateTitle:
      allRows.length === 0 ? 'Sin certificados disponibles' : 'No se encontraron certificados en 5. Turno',
    emptyStateMessage:
      allRows.length === 0
        ? 'Complete 1.3 Sitio y 4. Proceso en al menos un certificado para asignar turnos.'
        : 'Ajuste la búsqueda o filtros en la barra lateral.',
    emptyStateActionHtml: allRows.length === 0 ? headerAddAuditHtml : '',
    ...archiveProps,
  });
}
