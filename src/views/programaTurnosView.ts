import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import type { OrganizacionEntity } from '../lib/activeCertificates';
import type { ConglomeradoEntity } from '../lib/conglomeradoDomain';
import type { VinculoEntity } from '../lib/vinculoDomain';
import {
  formatAuditDateLabel,
  resolveLatestPlannedDate,
  type AuditDateEntry,
  type ProgramaAuditoriaEntity,
} from '../lib/auditPlanningEngine';
import {
  formatAuditCodename,
  getAuditCodenameTooltip,
  resolveShortOrganizacionName,
} from '../lib/codenameDomain';
import type { ProgramacionAuditEntity } from '../lib/auditExecution';
import type {
  CertificadoDetailEntity,
  TurnoPorSitioLink,
} from '../lib/multisiteSampling';
import type { CertificateRecord } from '../lib/searchControls';
import type { ProcesoPorSitioLink } from '../lib/sitioDomain';
import {
  resolveAuditNavigation,
  type CertificateAuditNavigation,
} from '../lib/certificateAuditSelector';
import {
  buildOrgCertPickerModalModel,
  buildOrgMultiViewRows,
  type OrgMultiViewRow,
} from '../lib/orgMultiViewPickerDomain';
import { mergeCertSourcesForOrgPicker } from '../lib/designacionTipoDomain';
import {
  buildAuditTurnoDetail,
  buildCertificateTurnoRows,
  buildTurnoOrgFacetCategories,
  createTurnoOrgCertMetaResolver,
  resolveHomonymousTargetMatches,
  type AuditTurnoDetailModel,
  type CertTurnoStatus,
  type CertificateTurnoRow,
  type SiteTurnoMatrixModel,
  type SiteTurnoMatrixRow,
  type TurnoOrgCertMeta,
} from '../lib/turnoDomain';
import type { CandidateProcessEntity } from '../lib/programaCertificadoDomain';
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

export type ProgramaTurnosSortColumn =
  | 'organizacion'
  | 'certificados'
  | 'auditorias'
  | 'cobertura_turnos'
  | 'estado_matriz'
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
  pickerOrgId?: string | null;
  pickerSearchQuery?: string;
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
  pickerOrgId: null,
  pickerSearchQuery: '',
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

export interface ProgramaTurnosViewProps {
  audit: ProgramacionAuditEntity;
  program: ProgramaAuditoriaEntity | null;
  allAudits: ReadonlyArray<ProgramacionAuditEntity>;
  allProcessesPorSitio: ReadonlyArray<ProcesoPorSitioLink>;
  allProcesses: ReadonlyArray<CandidateProcessEntity>;
  allTurnosPorSitio: ReadonlyArray<TurnoPorSitioLink>;
  certificados?: ReadonlyArray<CertificadoDetailEntity>;
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
      class="sticky top-2 z-20 rounded-xl border border-slate-200 bg-white/95 backdrop-blur-xs shadow-2xs px-3 py-2 flex flex-wrap items-center justify-between gap-2"
    >
      <div
        class="flex flex-wrap items-center gap-1 min-w-0"
        role="tablist"
        aria-label="Navegación rápida de sitios en 5. Turno"
      >
        <button
          type="button"
          role="tab"
          aria-selected="${effectiveFocusedSiteId === null ? 'true' : 'false'}"
          data-action="turno-focus-site"
          data-site-plan-id=""
          title="Todos los sitios"
          class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
            effectiveFocusedSiteId === null
              ? 'bg-slate-900 border-slate-900 text-white'
              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
          }"
        >
          <span>Todos (${sites.length})</span>
        </button>

        ${sites
          .map((s) => {
            const isActive = effectiveFocusedSiteId === s.sitePlan.id;
            const statusGlyph =
              s.selectedProcessesCount > 0 && s.isSiteComplete ? ' ✓' : '';
            return `
              <button
                type="button"
                role="tab"
                aria-selected="${isActive ? 'true' : 'false'}"
                data-action="turno-focus-site"
                data-site-plan-id="${escapeHtml(s.sitePlan.id)}"
                class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-indigo-600 border-indigo-700 text-white'
                    : s.isSiteComplete
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900 hover:bg-emerald-100/70'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }"
              >
                <span class="truncate max-w-[150px]">${escapeHtml(s.sitePlan.nombre_sitio)}</span>
                <span class="tabular-nums opacity-85">· ${s.coveredProcessesCount}/${s.selectedProcessesCount}${statusGlyph}</span>
              </button>
            `;
          })
          .join('')}

        ${
          sites.length > 1
            ? `
              <div class="inline-flex items-center gap-1 ml-0.5" role="group" aria-label="Recorrer sitios">
                <button
                  type="button"
                  data-action="turno-step-site"
                  data-site-plan-id="${escapeHtml(prevSiteId || '')}"
                  aria-label="Sitio anterior"
                  title="Sitio anterior"
                  ${!prevSiteId ? 'disabled' : ''}
                  class="px-2 py-1 rounded-md border text-[11px] font-semibold transition-colors whitespace-nowrap ${
                    prevSiteId
                      ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer'
                      : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                  }"
                >
                  ←
                </button>
                <button
                  type="button"
                  data-action="turno-step-site"
                  data-site-plan-id="${escapeHtml(nextSiteId || '')}"
                  aria-label="Sitio siguiente"
                  title="Sitio siguiente"
                  ${!nextSiteId ? 'disabled' : ''}
                  class="px-2 py-1 rounded-md border text-[11px] font-semibold transition-colors whitespace-nowrap ${
                    nextSiteId
                      ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer'
                      : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                  }"
                >
                  →
                </button>
              </div>
            `
            : ''
        }
      </div>

      <div class="flex flex-wrap items-center gap-1.5 shrink-0">
        <span
          data-testid="turno-global-progress-badge"
          class="inline-flex items-center px-2 py-1 rounded-md text-[11px] font-bold border tabular-nums ${
            detailModel.isComplete
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-amber-50 text-amber-800 border-amber-200'
          }"
        >
          ${detailModel.coveredPairs}/${detailModel.totalPairs} (${progressPct}%)
        </span>
        <button
          type="button"
          data-action="turno-toggle-only-pending"
          aria-pressed="${onlyPending ? 'true' : 'false'}"
          class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
            onlyPending
              ? 'bg-amber-600 border-amber-700 text-white'
              : 'bg-white border-slate-300 text-slate-700 hover:bg-amber-50 hover:border-amber-300'
          }"
        >
          <span>Solo pendientes (${detailModel.pendingPairs})</span>
        </button>
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

  const actionButtonsHtml = !isSingleShiftSite
    ? `
      <div class="flex items-center gap-1.5 shrink-0 ml-auto">
        <button
          type="button"
          data-action="turno-apply-batch-pending"
          data-audit-id="${escapeHtml(audit.id)}"
          data-site-plan-id="${escapeHtml(sitePlan.id)}"
          ${isSaving || pendingProcessesCount === 0 || cleanSelectedBatch.length === 0 ? 'disabled' : ''}
          title="Aplicar a ${pendingProcessesCount} proceso${pendingProcessesCount === 1 ? '' : 's'} pendiente${pendingProcessesCount === 1 ? '' : 's'}"
          class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] font-bold transition-colors whitespace-nowrap tabular-nums ${
            !isSaving && pendingProcessesCount > 0 && cleanSelectedBatch.length > 0
              ? 'bg-emerald-600 border-emerald-700 text-white hover:bg-emerald-700 cursor-pointer'
              : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
          }"
        >
          <span>Aplicar (${pendingProcessesCount})</span>
        </button>
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
                    : 'Propagar a procesos homónimos pendientes en otras sedes'
                }"
                class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] font-semibold transition-colors whitespace-nowrap tabular-nums ${
                  !isSaving && propagationPreview.assignments.length > 0
                    ? 'bg-indigo-600 border-indigo-700 text-white hover:bg-indigo-700 cursor-pointer'
                    : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                }"
              >
                <span>Propagar (${propagationPreview.matchedProcessesCount})</span>
              </button>
            `
            : ''
        }
      </div>
    `
    : propagationPreview
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
            : 'Propagar a procesos homónimos pendientes en otras sedes'
        }"
        class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] font-semibold transition-colors whitespace-nowrap tabular-nums shrink-0 ml-auto ${
          !isSaving && propagationPreview.assignments.length > 0
            ? 'bg-indigo-600 border-indigo-700 text-white hover:bg-indigo-700 cursor-pointer'
            : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
        }"
      >
        <span>Propagar (${propagationPreview.matchedProcessesCount})</span>
      </button>
    `
    : '';

  return `
    <div
      data-testid="turno-anti-fatigue-toolbar"
      class="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 flex flex-wrap items-center justify-between gap-2"
    >
      <div class="flex flex-wrap items-center gap-1.5 min-w-0 flex-1">
        ${
          !isSingleShiftSite
            ? `
              <span class="text-[11px] font-semibold text-slate-600 whitespace-nowrap">
                Seleccionar turno:
              </span>
              <div class="flex flex-wrap items-center gap-1" role="group" aria-label="Turnos para aplicar en lote a procesos pendientes">
                ${siteShiftOptions
                  .map((shiftOpt) => {
                    const start = shiftOpt.hora_entrada.slice(0, 5);
                    const end = shiftOpt.hora_salida.slice(0, 5);
                    const desc = (shiftOpt.descripcion || '').trim();
                    const isChipSelected = cleanSelectedBatch.includes(shiftOpt.id);
                    const chipTitle = desc ? `${start}–${end} · ${desc}` : `${start}–${end}`;
                    return `
                      <button
                        type="button"
                        data-action="turno-toggle-batch-chip"
                        data-site-plan-id="${escapeHtml(sitePlan.id)}"
                        data-tps-id="${escapeHtml(shiftOpt.id)}"
                        aria-pressed="${isChipSelected ? 'true' : 'false'}"
                        title="${escapeHtml(chipTitle)}"
                        class="inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap max-w-[230px] ${
                          isChipSelected
                            ? 'bg-slate-900 border-slate-900 text-white'
                            : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                        }"
                      >
                        <span aria-hidden="true" class="shrink-0">${isChipSelected ? '☑' : '☐'}</span>
                        <span class="tabular-nums font-bold shrink-0">${escapeHtml(start)}–${escapeHtml(end)}</span>
                        ${desc ? `<span class="opacity-85 truncate max-w-[130px]">${escapeHtml(desc)}</span>` : ''}
                      </button>
                    `;
                  })
                  .join('')}
              </div>
            `
            : `
              <button
                type="button"
                data-action="turno-autofill-single-shift"
                data-audit-id="${escapeHtml(audit.id)}"
                data-site-plan-id="${escapeHtml(sitePlan.id)}"
                ${isSaving || pendingProcessesCount === 0 ? 'disabled' : ''}
                title="Cubrir pendientes con turno único"
                class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] font-bold transition-colors whitespace-nowrap tabular-nums ${
                  !isSaving && pendingProcessesCount > 0
                    ? 'bg-emerald-600 border-emerald-700 text-white hover:bg-emerald-700 cursor-pointer'
                    : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                }"
              >
                <span>Turno único (${pendingProcessesCount})</span>
              </button>
            `
        }
      </div>

      ${actionButtonsHtml}
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
        class="text-[11px] font-semibold text-emerald-700 whitespace-nowrap tabular-nums"
      >
        ${assignedCount} turno${assignedCount === 1 ? '' : 's'}
      </span>
    `
    : `
      <span
        data-testid="process-shift-coverage-badge"
        class="text-[11px] font-semibold text-amber-700 whitespace-nowrap"
      >
        Pendiente
      </span>
    `;

  const shiftCellsHtml = siteMatrix.columns
    .map((col) => {
      const checked = row.assignedTpsIds.includes(col.shift.id);
      const checkboxId = `progShiftChk_${siteMatrix.sitePlan.id}_${row.psa.id}_${col.shift.id}`;
      return `
        <td class="px-2 py-2 border-l border-slate-100 text-center align-middle">
          <label
            for="${escapeHtml(checkboxId)}"
            data-testid="programa-shift-chip"
            class="inline-flex items-center justify-center gap-1.5 min-h-[32px] w-full rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
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
        row.isCovered ? 'bg-white hover:bg-emerald-50/15' : 'bg-amber-50/20 hover:bg-amber-50/35'
      }"
    >
      <td class="px-3 py-2 align-middle">
        <div class="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span class="text-xs font-bold text-slate-900 break-words">
            ${escapeHtml(row.procesoNombre)}
          </span>
          <span class="text-[11px] font-medium text-slate-500 whitespace-nowrap">
            ${escapeHtml(row.procesoTipo)}
          </span>
          <span class="text-slate-300" aria-hidden="true">·</span>
          ${coverageBadgeHtml}
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
                                allVisibleChecked ? 'Quitar' : 'Todos'
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
    certificados,
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
    certificados,
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
              class="rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950"
            >
              <span class="font-semibold">
                ⚠️ Sin turnos configurados en <strong>turnos_por_sitio</strong>.
              </span>
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
                      class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-900 hover:bg-amber-800 text-[11px] font-semibold text-white transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <span>Certificado → Sitio →</span>
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
          class="rounded-xl border border-slate-200 bg-white overflow-hidden"
        >
          <header class="bg-slate-50/80 border-b border-slate-200 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-1.5 min-w-0">
              <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                sitePlan.numero_sitio === 0
                  ? 'bg-slate-900 text-white border-slate-900'
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
              ${coveredProcessesCount}/${selectedProcessesCount} cubiertos
            </span>
          </header>

          <div class="p-3 space-y-2.5">
            ${noShiftsNoticeHtml}
            ${toolbarHtml}
            ${matrixHtml}
          </div>
        </section>
      `;
    })
    .join('');

  return `
    <div data-testid="programa-turnos-view" class="space-y-3">
      ${errorBannerHtml}
      ${stickyNavHtml}
      ${sitesHtml}
    </div>
  `;
}

/**
 * Step 3.3 — Renderiza la vista completa de `5. Turno` (`#/auditorias/turno`):
 * Multi View por Organización + Pop-up Agrupado por Auditoría Vinculada + Detail View con Matriz Anti-Fatiga dentro de `renderAuditSectionShell`.
 */
export function renderProgramaTurnosView(props: ProgramaTurnosPageProps): string {
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

  const { allProcessesPorSitio, allProcesses, allTurnosPorSitio } =
    extractProcessAndShiftCatalogFromCertificates(scoped.certificados);

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
            certificados: scoped.certificados,
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
          id_organizacion: certRow.id_organizacion ?? activeAudit?.id_organizacion ?? null,
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

  return renderTurnoMultiView({
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
    allTurnosPorSitio,
    loading,
    archiveConfig,
    tableColumnWidths,
    headerAddAuditHtml: resolvedHeaderAddAuditHtml,
  });
}

function renderTurnoMultiView(opts: {
  profile: UserProfile;
  state: ProgramaTurnosViewState;
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
  allTurnosPorSitio: ReadonlyArray<TurnoPorSitioLink>;
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
    allTurnosPorSitio,
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

  const resolveCertMeta = createTurnoOrgCertMetaResolver({
    audits: auditsPool,
    allProcessesPorSitio,
    allProcesses,
    allTurnosPorSitio,
    certificados,
  });

  const orgRows = buildOrgMultiViewRows<TurnoOrgCertMeta>({
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

  const facetCategories = buildTurnoOrgFacetCategories(orgRows);

  const extraColumns: ColumnDefinition<OrgMultiViewRow<TurnoOrgCertMeta>>[] = [
    {
      id: 'cobertura_turnos',
      header: 'Turnos',
      defaultWidthPct: 13,
      minWidthPx: 120,
      sortable: true,
      getValue: (row) => {
        const covered = row.certificates.reduce(
          (sum, c) => sum + c.domainExtra.coveredProcessesCount,
          0
        );
        const total = row.certificates.reduce(
          (sum, c) => sum + c.domainExtra.selectedProcessesCount,
          0
        );
        return total > 0 ? covered / total : 0;
      },
      renderCell: (row) => {
        const covered = row.certificates.reduce(
          (sum, c) => sum + c.domainExtra.coveredProcessesCount,
          0
        );
        const total = row.certificates.reduce(
          (sum, c) => sum + c.domainExtra.selectedProcessesCount,
          0
        );
        const shifts = row.certificates.reduce(
          (sum, c) => sum + c.domainExtra.totalAssignedShifts,
          0
        );
        return `
          <div class="min-w-0 space-y-0.5 tabular-nums">
            <div class="text-xs font-bold text-slate-900 whitespace-nowrap">
              ${covered} / ${total} pares
            </div>
            <div class="text-[11px] text-slate-500 truncate">
              ${shifts} asignación${shifts === 1 ? '' : 'es'}
            </div>
          </div>
        `;
      },
    },
    {
      id: 'estado_matriz',
      header: 'Estado Matriz',
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

  const renderCardExtra = (row: OrgMultiViewRow<TurnoOrgCertMeta>): string => {
    const covered = row.certificates.reduce(
      (sum, c) => sum + c.domainExtra.coveredProcessesCount,
      0
    );
    const total = row.certificates.reduce(
      (sum, c) => sum + c.domainExtra.selectedProcessesCount,
      0
    );
    const shifts = row.certificates.reduce(
      (sum, c) => sum + c.domainExtra.totalAssignedShifts,
      0
    );
    return `
      <div class="flex items-center justify-between gap-2 text-[11px] tabular-nums">
        <span class="font-semibold text-slate-800">${covered} / ${total} Sitio↔Proceso</span>
        <span class="text-slate-500">${shifts} turnos</span>
      </div>
    `;
  };

  const pickerModel = state.pickerOrgId
    ? buildOrgCertPickerModalModel<TurnoOrgCertMeta>({
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

  const pickerDomainColumns: OrgPickerDomainColumn<TurnoOrgCertMeta>[] = [
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
      id: 'turnos_asignados',
      header: 'Turnos Asignados',
      defaultWidthPct: 18,
      minWidthPx: 150,
      renderCell: (row) => {
        const meta = row.domainExtra;
        if (meta.statusKey === 'SIN_AUDITORIA') {
          return '<span class="text-xs text-slate-400">—</span>';
        }
        return `
          <div class="min-w-0 space-y-0.5 tabular-nums">
            <div class="text-xs font-bold text-slate-800 whitespace-nowrap">
              ${meta.coveredProcessesCount} / ${meta.selectedProcessesCount} cubiertos
            </div>
            <div class="text-[10px] text-slate-500 whitespace-nowrap">
              ${meta.totalAssignedShifts} asignación${meta.totalAssignedShifts === 1 ? '' : 'es'} en ${meta.sitesCount} sitio${meta.sitesCount === 1 ? '' : 's'}
            </div>
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
    ? renderOrgCertPickerModal<TurnoOrgCertMeta>({
        model: pickerModel,
        domainColumns: pickerDomainColumns,
        subtitle:
          'Seleccione un certificado (agrupado por auditoría vinculada) para asignar turnos en la Matriz Proceso × Turno.',
        emptySearchMessage:
          'No se encontraron certificados ni auditorías que coincidan con la búsqueda en esta organización.',
      })
    : '';

  const archiveProps = extractUniversalArchiveProps(archiveConfig, 'programacion');

  return renderOrgMultiView<TurnoOrgCertMeta>({
    domainKey: 'turno',
    tableId: 'turno-main',
    title: '5. Turno',
    subtitle:
      'Matriz de asignación Proceso × Turno por organización y sitio.',
    entityLabel: 'organizaciones',
    groupingMode: 'audit',
    rows: orgRows,
    searchQuery: state.query,
    searchPlaceholder:
      'Buscar organización, conglomerado, certificado, norma, auditoría o sitio...',
    searchInputId: 'turnoSearchInput',
    clearSearchBtnId: 'clearTurnoSearchBtn',
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen,
    sortState: { column: state.sortColumn, direction: state.sortDirection },
    columnWidths: tableColumnWidths?.['turno-main'],
    facetCategories,
    facetSelections: state.facetSelections,
    extraColumns,
    renderCardExtra,
    actionsHtml: headerAddAuditHtml,
    loading,
    emptyStateTitle:
      orgRows.length === 0
        ? 'Sin organizaciones disponibles'
        : 'No se encontraron organizaciones en 5. Turno',
    emptyStateMessage:
      orgRows.length === 0
        ? 'Complete 1.4 Sitio y 4. Proceso en al menos un certificado para asignar turnos.'
        : 'Ajuste la búsqueda o filtros en la barra lateral.',
    emptyStateActionHtml: orgRows.length === 0 ? headerAddAuditHtml : '',
    pickerModalHtml,
    ...archiveProps,
  });
}
