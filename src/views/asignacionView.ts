import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import type { OrganizacionEntity } from '../lib/activeCertificates';
import type { ConglomeradoEntity } from '../lib/conglomeradoDomain';
import type { VinculoEntity } from '../lib/vinculoDomain';
import type { CertificateRecord } from '../lib/searchControls';
import {
  formatAuditDateLabel,
  roundAuditDaysQuarter,
  type AuditDateEntry,
  type AuditorSiteRole,
  type ProgramaAuditoriaEntity,
} from '../lib/auditPlanningEngine';
import type { ProgramacionAuditEntity } from '../lib/auditExecution';
import {
  evaluateAuditorInSituStatus,
  formatAuditorDisplayLabel,
  type AuditorDetailEntity,
} from '../lib/competencyMatrix';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import { resolveAuditNavigation } from '../lib/certificateAuditSelector';
import type { AuditoriaSitioTemporalEntity } from '../lib/designacionTemporalDomain';
import {
  buildOrgCertPickerModalModel,
  buildOrgMultiViewRows,
  type OrgMultiViewRow,
} from '../lib/orgMultiViewPickerDomain';
import { mergeCertSourcesForOrgPicker } from '../lib/designacionTipoDomain';
import {
  AUDITOR_SITE_ROLE_SELECT_OPTIONS,
  EXPERTO_AUDITORIA_OBSERVACION_MAX_LENGTH,
  buildAuditAuditorDetail,
  buildAuditorOrgFacetCategories,
  buildCertificateAuditorRows,
  createAuditorOrgCertMetaResolver,
  evaluateAuditorCompetencyMatch,
  type AuditAuditableUnit,
  type AuditAuditorDetailModel,
  type AuditAuditorMemberItem,
  type AuditorOrgCertMeta,
  type CertificateAuditorRow,
} from '../lib/asignacionDomain';
import type { ExpertoTecnicoDetailEntity } from '../lib/expertoTecnicoDomain';
import type { AlertConfigEntity } from '../lib/auditAlertsEngine';
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
import {
  formatAuditCodename,
  getAuditCodenameTooltip,
  resolveShortOrganizacionName,
} from '../lib/codenameDomain';

export type AsignacionSortColumn =
  | 'organizacion'
  | 'certificados'
  | 'auditorias'
  | 'cobertura_equipo'
  | 'alertas'
  | 'certificado'
  | 'progreso'
  | 'estado';

export interface AsignacionViewState {
  query: string;
  viewMode: UniversalViewMode;
  isSidebarOpen: boolean;
  sortColumn: AsignacionSortColumn | null;
  sortDirection: SortDirection;
  facetSelections: MultiViewSelectionMap;
  selectedCertId?: string | null;
  selectedAuditId?: string | null;
  pickerOrgId?: string | null;
  pickerSearchQuery?: string;
  /** Legacy compatibility field */
  selectedProgramId?: string | null;
  draftTargetKind: 'REGULAR' | 'TEMPORAL';
  draftTargetId: string | null;
  draftAuditorId: string;
  draftRol: AuditorSiteRole;
  draftDays: string;
  editErrorMessage: string | null;
  draftExpertoId?: string;
  draftExpertoDays?: string;
  draftExpertoObservacion?: string;
  expertoEditObsDrafts?: Record<string, string>;
  expertoFeedbackMessage?: string | null;
}

export interface AsignacionViewProps {
  profile: UserProfile;
  state: AsignacionViewState;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  audits?: ReadonlyArray<ProgramacionAuditEntity>;
  temporalSites: ReadonlyArray<AuditoriaSitioTemporalEntity>;
  auditors: ReadonlyArray<AuditorDetailEntity>;
  expertos?: ReadonlyArray<ExpertoTecnicoDetailEntity>;
  certificados?: ReadonlyArray<CertificadoDetailEntity>;
  certificates?: ReadonlyArray<CertificateRecord>;
  vinculos?: ReadonlyArray<VinculoEntity>;
  conglomerados?: ReadonlyArray<ConglomeradoEntity>;
  organizaciones?: ReadonlyArray<OrganizacionEntity>;
  authorizedClientOrgIds?: ReadonlyArray<string>;
  alertConfig?: AlertConfigEntity;
  referenceIsoDate?: string;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
  inCardBreadcrumbHtml?: string;
  headerAddAuditHtml?: string;
}

export const DEFAULT_ASIGNACION_STATE: AsignacionViewState = {
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
  draftTargetKind: 'REGULAR',
  draftTargetId: null,
  draftAuditorId: '',
  draftRol: 'AUDITOR',
  draftDays: '1.00',
  editErrorMessage: null,
  draftExpertoId: '',
  draftExpertoDays: '1.00',
  draftExpertoObservacion: '',
  expertoEditObsDrafts: {},
  expertoFeedbackMessage: null,
};

const ROLE_OPTIONS: ReadonlyArray<{ value: AuditorSiteRole; label: string }> =
  AUDITOR_SITE_ROLE_SELECT_OPTIONS;

const ROLE_LABELS: Record<AuditorSiteRole, string> = {
  AUDITOR_LIDER: 'Auditor Líder',
  AUDITOR: 'Auditor',
  EXPERTO_TECNICO: 'Experto Técnico',
  AUDITOR_EN_ENTRENAMIENTO: 'Auditor en Entrenamiento',
};

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

function computeBalanceMetrics(opts: {
  assignedCount: number;
  assignedDays: number;
  requiredDays: number;
}): {
  pct: number;
  widthPct: number;
  barClass: string;
  deltaLabel: string;
  deltaBadgeClass: string;
  summaryText: string;
  isBalanced: boolean;
  isExcess: boolean;
} {
  const safeReq = Math.max(0, roundAuditDaysQuarter(opts.requiredDays));
  const safeAssigned = Math.max(0, roundAuditDaysQuarter(opts.assignedDays));
  const rawPct = safeReq > 0 ? Math.round((safeAssigned / safeReq) * 100) : 0;
  const widthPct = Math.min(100, Math.max(0, rawPct));
  const delta = Math.round((safeAssigned - safeReq) * 100) / 100;
  const isBalanced =
    opts.assignedCount >= 1 && safeReq > 0 && Math.abs(delta) < 0.001;
  const isExcess = delta > 0.001;

  let barClass = 'bg-slate-300';
  let deltaLabel = 'Sin tiempo requerido en 2. Tiempo';
  let deltaBadgeClass = 'bg-slate-100 text-slate-700 border-slate-200';

  if (safeReq <= 0) {
    barClass = 'bg-slate-300';
    deltaLabel = 'Tiempo requerido en 0.00 d';
    deltaBadgeClass = 'bg-amber-50 text-amber-800 border-amber-200';
  } else if (isBalanced) {
    barClass = 'bg-emerald-600';
    deltaLabel = 'Balance exacto ✓';
    deltaBadgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-200';
  } else if (isExcess) {
    barClass = 'bg-rose-600';
    deltaLabel = `Excede por ${delta.toFixed(2)} d`;
    deltaBadgeClass = 'bg-rose-50 text-rose-800 border-rose-200';
  } else {
    barClass = 'bg-amber-500';
    const missing = Math.max(0, roundAuditDaysQuarter(safeReq - safeAssigned));
    deltaLabel = `Faltan ${missing.toFixed(2)} d`;
    deltaBadgeClass = 'bg-amber-50 text-amber-800 border-amber-200';
  }

  return {
    pct: rawPct,
    widthPct,
    barClass,
    deltaLabel,
    deltaBadgeClass,
    summaryText: `Asignado: ${safeAssigned.toFixed(2)} d / Requerido: ${safeReq.toFixed(2)} d`,
    isBalanced,
    isExcess,
  };
}

function getCertStatusBadge(row: Pick<CertificateAuditorRow, 'statusKey' | 'hasExcessDiscrepancy'>): {
  label: string;
  cls: string;
} {
  if (row.statusKey === 'SIN_AUDITORIA') {
    return {
      label: 'Sin auditorías',
      cls: 'bg-slate-100 text-slate-600 border-slate-200',
    };
  }
  if (row.statusKey === 'COMPLETO') {
    return {
      label: 'Completo ✓',
      cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    };
  }
  if (row.statusKey === 'PENDIENTE') {
    return {
      label: 'Pendiente',
      cls: 'bg-slate-100 text-slate-700 border-slate-300',
    };
  }
  return {
    label: 'Desbalanceado',
    cls: row.hasExcessDiscrepancy
      ? 'bg-rose-50 text-rose-800 border-rose-200'
      : 'bg-amber-50 text-amber-800 border-amber-200',
  };
}

/**
 * Renders Step 3.3 `3. Auditor` (`#/auditorias/auditor`, alias `#/auditorias/asignacion`)
 * using the Organization-Based Multi View + grouped Pop-up Modal + single-audit Detail View
 * (`renderAuditSectionShell` with `showLinkedSiblings: false`).
 */
export function renderAsignacionView(props: AsignacionViewProps): string {
  const {
    profile,
    state,
    programs,
    audits: auditsProp,
    temporalSites,
    auditors,
    expertos = [],
    certificados = [],
    certificates = [],
    vinculos = [],
    conglomerados = [],
    organizaciones = [],
    authorizedClientOrgIds = [],
    alertConfig,
    referenceIsoDate,
    loading = false,
    archiveConfig,
    tableColumnWidths,
    inCardBreadcrumbHtml = '',
    headerAddAuditHtml = '',
  } = props;

  const isStaff = isApprovedStaffProfile(profile);
  const auditsPool = mergeAuditsPool(programs, auditsProp);

  const allRows = buildCertificateAuditorRows({
    certificates,
    detailedCerts: certificados,
    audits: auditsPool,
    programs,
    temporalSites,
    auditors,
    expertos,
    alertConfig,
    referenceIsoDate,
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
      ? auditsPool.find((a) => a.id === state.selectedAuditId)?.id_certificado ?? null
      : legacyProgramFirstAudit?.id_certificado ?? null;

  const resolvedHeaderAddAuditHtml = headerAddAuditHtml || renderAddAuditButton(isStaff);

  if (resolvedCertId) {
    const certRow = allRows.find((r) => r.certId === resolvedCertId) ?? null;
    if (certRow) {
      const effectiveAuditId = state.selectedAuditId ?? legacyProgramFirstAudit?.id ?? null;
      return renderAuditorDetailView({
        state,
        certRow,
        effectiveAuditId,
        audits: auditsPool,
        programs,
        temporalSites,
        auditors,
        expertos,
        certificados,
        alertConfig,
        isStaff,
        inCardBreadcrumbHtml,
        headerAddAuditHtml: resolvedHeaderAddAuditHtml,
      });
    }
  }

  return renderAuditorMultiView({
    profile,
    state,
    auditsPool,
    programs,
    temporalSites,
    auditors,
    expertos,
    vinculos,
    conglomerados,
    organizaciones,
    authorizedClientOrgIds,
    certificados,
    certificates,
    alertConfig,
    referenceIsoDate,
    loading,
    archiveConfig,
    tableColumnWidths,
    headerAddAuditHtml: resolvedHeaderAddAuditHtml,
  });
}

function summarizeOrgAuditorAlerts(row: OrgMultiViewRow<AuditorOrgCertMeta>): {
  iafGapsCount: number;
  uncoveredIafGapsCount: number;
  expertosTotal: number;
  conflictsCount: number;
  rotationsCount: number;
  competencyWarningsCount: number;
  totalAlerts: number;
} {
  let iafGapsCount = 0;
  let uncoveredIafGapsCount = 0;
  let expertosTotal = 0;
  let conflictsCount = 0;
  let rotationsCount = 0;
  let competencyWarningsCount = 0;
  for (const cert of row.certificates) {
    const ex = cert.domainExtra;
    if (ex.hasIafSectorGap) {
      iafGapsCount += 1;
      if (!ex.iafGapStatus?.coveredByAssignedExperts) {
        uncoveredIafGapsCount += 1;
      }
    }
    expertosTotal += ex.assignedExpertosCount;
    if (ex.hasScheduleConflict) conflictsCount += 1;
    if (ex.hasRotationWarning) rotationsCount += 1;
    if (ex.hasCompetencyWarning) competencyWarningsCount += 1;
  }
  return {
    iafGapsCount,
    uncoveredIafGapsCount,
    expertosTotal,
    conflictsCount,
    rotationsCount,
    competencyWarningsCount,
    totalAlerts:
      uncoveredIafGapsCount + conflictsCount + rotationsCount + competencyWarningsCount,
  };
}

function renderAuditorMultiView(opts: {
  profile: UserProfile;
  state: AsignacionViewState;
  auditsPool: ReadonlyArray<ProgramacionAuditEntity>;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  temporalSites: ReadonlyArray<AuditoriaSitioTemporalEntity>;
  auditors: ReadonlyArray<AuditorDetailEntity>;
  expertos: ReadonlyArray<ExpertoTecnicoDetailEntity>;
  vinculos: ReadonlyArray<VinculoEntity>;
  conglomerados: ReadonlyArray<ConglomeradoEntity>;
  organizaciones: ReadonlyArray<OrganizacionEntity>;
  authorizedClientOrgIds: ReadonlyArray<string>;
  certificados: ReadonlyArray<CertificadoDetailEntity>;
  certificates: ReadonlyArray<CertificateRecord>;
  alertConfig?: AlertConfigEntity;
  referenceIsoDate?: string;
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
    temporalSites,
    auditors,
    expertos,
    vinculos,
    conglomerados,
    organizaciones,
    authorizedClientOrgIds,
    certificados,
    certificates,
    alertConfig,
    referenceIsoDate,
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

  const resolveCertMeta = createAuditorOrgCertMetaResolver({
    audits: auditsPool,
    programs,
    temporalSites,
    auditors,
    expertos,
    certificados,
    alertConfig,
    referenceIsoDate,
  });

  const orgRows = buildOrgMultiViewRows<AuditorOrgCertMeta>({
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

  const facetCategories = buildAuditorOrgFacetCategories(orgRows);

  const extraColumns: ColumnDefinition<OrgMultiViewRow<AuditorOrgCertMeta>>[] = [
    {
      id: 'cobertura_equipo',
      header: 'Cobertura (d)',
      defaultWidthPct: 13,
      minWidthPx: 120,
      sortable: true,
      getValue: (row) => {
        const req = row.certificates.reduce((sum, c) => sum + c.domainExtra.requiredDays, 0);
        const asg = row.certificates.reduce((sum, c) => sum + c.domainExtra.assignedDays, 0);
        return req > 0 ? asg / req : 0;
      },
      renderCell: (row) => {
        const req = roundAuditDaysQuarter(
          row.certificates.reduce((sum, c) => sum + c.domainExtra.requiredDays, 0)
        );
        const asg = roundAuditDaysQuarter(
          row.certificates.reduce((sum, c) => sum + c.domainExtra.assignedDays, 0)
        );
        const pct = req > 0 ? Math.round((asg / req) * 100) : 0;
        const widthPct = Math.min(100, Math.max(0, pct));
        const isExact = req > 0 && Math.abs(asg - req) < 0.001;
        const isExcess = asg - req > 0.001;
        const barCls = isExact
          ? 'bg-emerald-600'
          : isExcess
          ? 'bg-rose-600'
          : req > 0
          ? 'bg-amber-500'
          : 'bg-slate-300';
        const completeCerts = row.certificates.filter(
          (c) => c.domainExtra.statusKey === 'COMPLETO'
        ).length;
        return `
          <div class="min-w-0 space-y-1 tabular-nums">
            <div class="flex items-center justify-between gap-1 text-[11px] tabular-nums">
              <span class="font-bold text-slate-900 truncate">${asg.toFixed(2)}/${req.toFixed(2)}d</span>
              <span class="text-[10px] text-slate-500 shrink-0">${completeCerts}/${row.certsCount}</span>
            </div>
            <div class="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
              <div class="h-full rounded-full ${barCls}" style="width: ${widthPct}%"></div>
            </div>
          </div>
        `;
      },
    },
    {
      id: 'alertas',
      header: 'Alertas',
      defaultWidthPct: 13,
      minWidthPx: 130,
      sortable: true,
      getValue: (row) => summarizeOrgAuditorAlerts(row).totalAlerts,
      renderCell: (row) => {
        const stats = summarizeOrgAuditorAlerts(row);
        const chips: string[] = [];
        if (stats.uncoveredIafGapsCount > 0) {
          chips.push(
            `<span class="inline-flex items-center max-w-full truncate px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">⚠ Brecha IAF (${stats.uncoveredIafGapsCount})</span>`
          );
        } else if (stats.iafGapsCount > 0) {
          chips.push(
            `<span class="inline-flex items-center max-w-full truncate px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">Brecha IAF cubierta</span>`
          );
        }
        if (stats.expertosTotal > 0) {
          chips.push(
            `<span class="inline-flex items-center max-w-full truncate px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">Exp. Técnico (${stats.expertosTotal})</span>`
          );
        }
        if (stats.conflictsCount > 0) {
          chips.push(
            `<span class="inline-flex items-center max-w-full truncate px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">Conflicto (${stats.conflictsCount})</span>`
          );
        }
        if (stats.rotationsCount > 0) {
          chips.push(
            `<span class="inline-flex items-center max-w-full truncate px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">Rotación</span>`
          );
        }
        if (stats.competencyWarningsCount > 0) {
          chips.push(
            `<span class="inline-flex items-center max-w-full truncate px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">Competencia</span>`
          );
        }
        if (chips.length === 0) {
          return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-emerald-50 text-emerald-800 border-emerald-200 whitespace-nowrap">Sin alertas ✓</span>`;
        }
        return `<div class="flex flex-wrap items-center gap-1 min-w-0 max-w-full">${chips.slice(0, 2).join('')}${
          chips.length > 2
            ? `<span class="text-[10px] font-semibold text-slate-500">+${chips.length - 2}</span>`
            : ''
        }</div>`;
      },
    },
  ];

  const renderCardExtra = (row: OrgMultiViewRow<AuditorOrgCertMeta>): string => {
    const req = roundAuditDaysQuarter(
      row.certificates.reduce((sum, c) => sum + c.domainExtra.requiredDays, 0)
    );
    const asg = roundAuditDaysQuarter(
      row.certificates.reduce((sum, c) => sum + c.domainExtra.assignedDays, 0)
    );
    const stats = summarizeOrgAuditorAlerts(row);
    const tags: string[] = [];
    if (stats.uncoveredIafGapsCount > 0) {
      tags.push(
        `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">⚠ Brecha IAF</span>`
      );
    }
    if (stats.expertosTotal > 0) {
      tags.push(
        `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">Exp. Técnico (${stats.expertosTotal})</span>`
      );
    }
    if (stats.conflictsCount > 0) {
      tags.push(
        `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">Conflicto</span>`
      );
    }
    return `
      <div class="space-y-1.5 text-[11px]">
        <div class="flex items-center justify-between gap-2 tabular-nums">
          <span class="font-mono font-bold text-slate-900">${asg.toFixed(2)} / ${req.toFixed(2)} d</span>
          <span class="text-slate-500">${
            stats.totalAlerts === 0 ? 'Sin alertas ✓' : `${stats.totalAlerts} alerta(s)`
          }</span>
        </div>
        ${tags.length > 0 ? `<div class="flex flex-wrap gap-1">${tags.join('')}</div>` : ''}
      </div>
    `;
  };

  const pickerModel = state.pickerOrgId
    ? buildOrgCertPickerModalModel<AuditorOrgCertMeta>({
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

  const pickerDomainColumns: OrgPickerDomainColumn<AuditorOrgCertMeta>[] = [
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
      id: 'equipo_expertos',
      header: 'Equipo / Experto(s)',
      defaultWidthPct: 18,
      minWidthPx: 155,
      renderCell: (row) => {
        const meta = row.domainExtra;
        const teamText =
          meta.assignedSummaries.length > 0
            ? meta.assignedSummaries
                .slice(0, 2)
                .map((m) => (m.isLeader ? `★ ${m.nombre}` : m.nombre))
                .join(', ')
            : 'Sin auditores asignados';
        const expertosText =
          meta.assignedExpertos.length > 0
            ? `Exp. Técnico: ${meta.assignedExpertos.map((e) => e.experto_nombre).join(', ')}`
            : '';
        const iafBadge = meta.hasIafSectorGap
          ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${
              meta.iafGapStatus?.coveredByAssignedExperts
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }">${
              meta.iafGapStatus?.coveredByAssignedExperts
                ? 'Brecha IAF · Cubierta'
                : '⚠ Brecha IAF'
            }</span>`
          : '';
        return `
          <div class="min-w-0 space-y-0.5">
            <div class="text-xs font-semibold text-slate-800 truncate" title="${escapeHtml(teamText)}">
              ${escapeHtml(teamText)}
            </div>
            <div class="flex flex-wrap items-center gap-1 min-w-0">
              ${iafBadge}
              ${
                expertosText
                  ? `<span class="text-[10px] font-semibold text-indigo-700 truncate" title="${escapeHtml(expertosText)}">${escapeHtml(expertosText)}</span>`
                  : ''
              }
            </div>
          </div>
        `;
      },
    },
    {
      id: 'cobertura_dias',
      header: 'Cobertura Días',
      defaultWidthPct: 14,
      minWidthPx: 130,
      renderCell: (row) => {
        const meta = row.domainExtra;
        const badge = getCertStatusBadge(meta);
        return `
          <div class="min-w-0 space-y-0.5 tabular-nums">
            <div class="font-mono text-xs font-bold text-slate-900 whitespace-nowrap">
              ${meta.assignedDays.toFixed(2)} / ${meta.requiredDays.toFixed(2)} d
            </div>
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.cls}">
              ${escapeHtml(badge.label)}
            </span>
          </div>
        `;
      },
    },
  ];

  const pickerModalHtml = pickerModel
    ? renderOrgCertPickerModal<AuditorOrgCertMeta>({
        model: pickerModel,
        domainColumns: pickerDomainColumns,
        subtitle:
          'Seleccione un certificado (agrupado por auditoría vinculada) para asignar equipo auditor, expertos técnicos y balance de días.',
        emptySearchMessage:
          'No se encontraron certificados, auditores ni expertos técnicos que coincidan con la búsqueda.',
      })
    : '';

  const archiveProps = extractUniversalArchiveProps(archiveConfig, 'programacion');

  return renderOrgMultiView<AuditorOrgCertMeta>({
    domainKey: 'auditor',
    tableId: 'asignacion-main',
    title: '3. Auditor (0.25d)',
    subtitle:
      'Equipo auditor, cobertura de brecha IAF y expertos técnicos por organización.',
    entityLabel: 'organizaciones',
    groupingMode: 'audit',
    rows: orgRows,
    searchQuery: state.query,
    searchPlaceholder:
      'Buscar organización, conglomerado, certificado, auditor, brecha IAF o exp. técnico...',
    searchInputId: 'asignacionSearchInput',
    clearSearchBtnId: 'clearAsignacionSearchBtn',
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen,
    sortState: { column: state.sortColumn, direction: state.sortDirection },
    columnWidths: tableColumnWidths?.['asignacion-main'],
    facetCategories,
    facetSelections: state.facetSelections,
    extraColumns,
    renderCardExtra,
    actionsHtml: headerAddAuditHtml,
    loading,
    emptyStateTitle:
      orgRows.length === 0
        ? 'No hay organizaciones con certificados disponibles'
        : 'No se encontraron organizaciones en 3. Auditor',
    emptyStateMessage:
      orgRows.length === 0
        ? 'Registre certificados y programe una auditoría con "+ Auditoría" para asignar auditores.'
        : 'Intente ajustar la búsqueda o restablecer los filtros de la barra lateral.',
    emptyStateActionHtml: orgRows.length === 0 ? headerAddAuditHtml : '',
    pickerModalHtml,
    ...archiveProps,
  });
}

function renderAuditorDetailView(opts: {
  state: AsignacionViewState;
  certRow: CertificateAuditorRow;
  effectiveAuditId: string | null;
  audits: ReadonlyArray<ProgramacionAuditEntity>;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  temporalSites: ReadonlyArray<AuditoriaSitioTemporalEntity>;
  auditors: ReadonlyArray<AuditorDetailEntity>;
  expertos: ReadonlyArray<ExpertoTecnicoDetailEntity>;
  certificados: ReadonlyArray<CertificadoDetailEntity>;
  alertConfig?: AlertConfigEntity;
  isStaff: boolean;
  inCardBreadcrumbHtml?: string;
  headerAddAuditHtml?: string;
}): string {
  const {
    state,
    certRow,
    effectiveAuditId,
    audits,
    programs,
    temporalSites,
    auditors,
    expertos,
    certificados,
    alertConfig,
    isStaff,
    inCardBreadcrumbHtml = '',
    headerAddAuditHtml = '',
  } = opts;

  const navigation = resolveAuditNavigation(certRow.certId, effectiveAuditId, audits);
  const activeAudit = navigation.activeAudit;

  const feedbackHtml = state.editErrorMessage
    ? `
      <div role="alert" data-testid="asignacion-error-banner" class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800 flex items-center gap-2">
        <span aria-hidden="true">⚠️</span>
        <span>${escapeHtml(state.editErrorMessage)}</span>
      </div>
    `
    : '';

  const renderMemberRow = (
    unit: AuditAuditableUnit,
    member: AuditAuditorMemberItem
  ): string => {
    const roleCls =
      member.rol === 'AUDITOR_LIDER'
        ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
        : member.rol === 'EXPERTO_TECNICO'
        ? 'bg-violet-50 text-violet-800 border-violet-200'
        : 'bg-slate-100 text-slate-700 border-slate-200';

    return `
      <div
        data-testid="asignacion-member-row"
        data-assignment-id="${escapeHtml(member.assignmentId)}"
        class="py-2 px-2.5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 border-b border-slate-100 last:border-b-0"
      >
        <div class="min-w-0 flex-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span class="text-xs font-bold text-slate-900">
            ${escapeHtml(member.auditorNombre)}
          </span>
          <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold border ${roleCls} whitespace-nowrap">
            ${escapeHtml(ROLE_LABELS[member.rol] || member.rol)}
          </span>
          <span class="px-1.5 py-0.5 rounded text-[10px] font-medium border ${member.competency.badgeClass} whitespace-nowrap">
            ${escapeHtml(member.competency.label)}
          </span>
          ${
            member.inSituWarning
              ? `<span data-testid="asignacion-member-insitu-badge" title="${escapeHtml(member.inSituWarning)} (no bloqueante)" class="px-1.5 py-0.5 rounded text-[10px] font-semibold border ${member.inSituBadgeClass || 'bg-amber-50 text-amber-800 border-amber-200'} whitespace-nowrap">${escapeHtml(member.inSituWarning)}</span>`
              : ''
          }
          ${
            member.observacionSectorWarning
              ? `<span data-testid="asignacion-member-obs-sector-badge" title="${escapeHtml(member.observacionSectorWarning.rawText)}" class="px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                  member.observacionSectorWarning.coveredByExperto
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-amber-50 text-amber-900 border-amber-200'
                } whitespace-nowrap">${
                  member.observacionSectorWarning.coveredByExperto
                    ? `Exp. Técnico asignado ✓ (Sector ${member.observacionSectorWarning.intersectedSectors.join(', ')})`
                    : `Req. Exp. Técnico (Sector ${member.observacionSectorWarning.intersectedSectors.join(', ')})`
                }</span>`
              : ''
          }
          ${
            member.hasScheduleConflict
              ? `<span title="${escapeHtml(member.scheduleConflictMessages.join(' | '))}" class="text-[10px] font-bold text-rose-700 whitespace-nowrap">⚠ Conflicto calendario</span>`
              : ''
          }
          ${
            member.hasRotationWarning
              ? `<span title="${escapeHtml(member.rotationWarningMessage || '')}" class="text-[10px] font-bold text-amber-800 whitespace-nowrap">⚠ Rotación Líder ISO 17021-1</span>`
              : ''
          }
        </div>

        <div class="flex flex-wrap items-center gap-1 shrink-0 tabular-nums">
          ${
            isStaff
              ? `
                <button
                  type="button"
                  data-action="step-asignacion-auditor-days"
                  data-target-kind="${unit.kind}"
                  data-target-id="${escapeHtml(unit.targetId)}"
                  data-audit-id="${escapeHtml(unit.auditId)}"
                  data-auditor-id="${escapeHtml(member.auditorId)}"
                  data-rol="${member.rol}"
                  data-whole-site="${member.wholeSite ? 'true' : 'false'}"
                  data-current-days="${member.days.toFixed(2)}"
                  data-delta="-0.25"
                  ${member.days <= 0.25 ? 'disabled' : ''}
                  aria-label="Restar 0.25 días a ${escapeHtml(member.auditorNombre)} en ${escapeHtml(unit.title)}"
                  class="h-7 px-2 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-bold text-slate-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  -0.25
                </button>
                <span class="font-mono text-xs font-bold text-slate-900 px-2 py-0.5 rounded bg-slate-50 border border-slate-200 min-w-[58px] text-center">
                  ${member.days.toFixed(2)} d
                </span>
                <button
                  type="button"
                  data-action="step-asignacion-auditor-days"
                  data-target-kind="${unit.kind}"
                  data-target-id="${escapeHtml(unit.targetId)}"
                  data-audit-id="${escapeHtml(unit.auditId)}"
                  data-auditor-id="${escapeHtml(member.auditorId)}"
                  data-rol="${member.rol}"
                  data-whole-site="${member.wholeSite ? 'true' : 'false'}"
                  data-current-days="${member.days.toFixed(2)}"
                  data-delta="0.25"
                  aria-label="Sumar 0.25 días a ${escapeHtml(member.auditorNombre)} en ${escapeHtml(unit.title)}"
                  class="h-7 px-2 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-bold text-slate-700 cursor-pointer whitespace-nowrap"
                >
                  +0.25
                </button>
                <button
                  type="button"
                  data-action="remove-asignacion-auditor"
                  data-target-kind="${unit.kind}"
                  data-assignment-id="${escapeHtml(member.assignmentId)}"
                  data-target-id="${escapeHtml(unit.targetId)}"
                  data-audit-id="${escapeHtml(unit.auditId)}"
                  aria-label="Retirar a ${escapeHtml(member.auditorNombre)} de ${escapeHtml(unit.title)}"
                  class="h-7 px-2 rounded-md border border-rose-200 bg-rose-50 hover:bg-rose-100 text-[11px] font-semibold text-rose-700 cursor-pointer ml-1 whitespace-nowrap"
                >
                  Quitar
                </button>
              `
              : `
                <span class="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-900 text-white">
                  ${member.days.toFixed(2)} d
                </span>
              `
          }
        </div>
      </div>
    `;
  };

  const renderAddAuditorControls = (
    detail: AuditAuditorDetailModel,
    unit: AuditAuditableUnit
  ): string => {
    if (!isStaff) return '';

    const assignedIds = new Set(unit.members.map((m) => m.auditorId));
    const conflictIds = new Set(detail.scheduleConflicts.map((c) => c.id_auditor));
    const rankedAuditors = auditors.slice().sort((a, b) => {
      const aAssigned = assignedIds.has(a.id) ? 1 : 0;
      const bAssigned = assignedIds.has(b.id) ? 1 : 0;
      if (aAssigned !== bAssigned) return aAssigned - bAssigned;
      const compA = evaluateAuditorCompetencyMatch(
        a,
        detail.audit.norma_codigo,
        detail.audit.sector_iaf,
        detail.subsectorCodigo
      ).level;
      const compB = evaluateAuditorCompetencyMatch(
        b,
        detail.audit.norma_codigo,
        detail.audit.sector_iaf,
        detail.subsectorCodigo
      ).level;
      const rankScore = (lvl: 'FULL' | 'NORMA_ONLY' | 'PARTIAL') =>
        lvl === 'FULL' ? 0 : lvl === 'NORMA_ONLY' ? 1 : 2;
      if (rankScore(compA) !== rankScore(compB)) {
        return rankScore(compA) - rankScore(compB);
      }
      return a.nombre.localeCompare(b.nombre);
    });

    const isFocusedDraft =
      state.draftTargetKind === unit.kind && state.draftTargetId === unit.targetId;
    const defaultAuditorId =
      isFocusedDraft &&
      state.draftAuditorId &&
      rankedAuditors.some((a) => a.id === state.draftAuditorId)
        ? state.draftAuditorId
        : rankedAuditors.find((a) => !assignedIds.has(a.id))?.id ||
          rankedAuditors[0]?.id ||
          '';
    const suggestedDays =
      unit.remainingDays >= 0.25
        ? unit.remainingDays
        : 0.25;
    const daysValue = isFocusedDraft ? state.draftDays : suggestedDays.toFixed(2);
    const activeRole = isFocusedDraft ? state.draftRol : 'AUDITOR';
    const disabledDueToZeroRequired = unit.requiredDays <= 0;

    return `
      <div
        data-testid="asignacion-inline-form"
        data-target-kind="${unit.kind}"
        data-target-id="${escapeHtml(unit.targetId)}"
        class="pt-2.5 border-t border-slate-100"
      >
        <div class="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
          <div class="sm:col-span-5">
            <label
              for="asignacionAuditorSelect_${escapeHtml(unit.targetId)}"
              class="block text-[11px] font-semibold text-slate-600 mb-1"
            >
              Auditor
            </label>
            <select
              id="asignacionAuditorSelect_${escapeHtml(unit.targetId)}"
              data-action="change-asignacion-draft-field"
              data-field="auditorId"
              ${disabledDueToZeroRequired || rankedAuditors.length === 0 ? 'disabled' : ''}
              aria-label="Seleccionar auditor para ${escapeHtml(unit.title)}"
              class="w-full h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-none disabled:opacity-50"
            >
              ${
                rankedAuditors.length === 0
                  ? '<option value="">Sin auditores disponibles</option>'
                  : rankedAuditors
                      .map((aud) => {
                        const match = evaluateAuditorCompetencyMatch(
                          aud,
                          detail.audit.norma_codigo,
                          detail.audit.sector_iaf,
                          detail.subsectorCodigo
                        );
                        const availHint = conflictIds.has(aud.id)
                          ? 'Conflicto agenda'
                          : assignedIds.has(aud.id)
                          ? 'Ya asignado'
                          : 'Disponible';
                        const compHint = match.level === 'FULL' ? '✓ Calificado' : match.label;
                        const inSitu = evaluateAuditorInSituStatus(aud);
                        const inSituTag =
                          inSitu === 'Vencido' || inSitu === 'Pendiente Evaluación'
                            ? ` · Ev. ${inSitu}`
                            : '';
                        const selected = aud.id === defaultAuditorId ? 'selected' : '';
                        const displayLabel = formatAuditorDisplayLabel(aud);
                        return `<option value="${escapeHtml(aud.id)}" ${selected}>${escapeHtml(displayLabel)} — ${escapeHtml(compHint)} · ${availHint}${escapeHtml(inSituTag)}</option>`;
                      })
                      .join('')
              }
            </select>
          </div>

          <div class="sm:col-span-3">
            <label
              for="asignacionRolSelect_${escapeHtml(unit.targetId)}"
              class="block text-[11px] font-semibold text-slate-600 mb-1"
            >
              Rol
            </label>
            <select
              id="asignacionRolSelect_${escapeHtml(unit.targetId)}"
              data-action="change-asignacion-draft-field"
              data-field="rol"
              ${disabledDueToZeroRequired ? 'disabled' : ''}
              aria-label="Rol del auditor en ${escapeHtml(unit.title)}"
              class="w-full h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-none disabled:opacity-50"
            >
              ${ROLE_OPTIONS.map(
                (r) =>
                  `<option value="${r.value}" ${activeRole === r.value ? 'selected' : ''}>${escapeHtml(r.label)}</option>`
              ).join('')}
            </select>
          </div>

          <div class="sm:col-span-2">
            <label
              for="asignacionDaysInput_${escapeHtml(unit.targetId)}"
              class="block text-[11px] font-semibold text-slate-600 mb-1"
            >
              Días (0.25)
            </label>
            <input
              id="asignacionDaysInput_${escapeHtml(unit.targetId)}"
              type="number"
              min="0.25"
              step="0.25"
              data-action="change-asignacion-draft-field"
              data-field="days"
              ${disabledDueToZeroRequired ? 'disabled' : ''}
              aria-label="Días-auditor a asignar en ${escapeHtml(unit.title)}"
              value="${escapeHtml(daysValue)}"
              class="w-full h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs font-mono font-bold text-slate-900 tabular-nums focus:border-slate-900 focus:outline-none disabled:opacity-50"
            />
          </div>

          <div class="sm:col-span-2">
            <button
              type="button"
              data-action="submit-asignacion-auditor"
              data-target-kind="${unit.kind}"
              data-target-id="${escapeHtml(unit.targetId)}"
              data-audit-id="${escapeHtml(unit.auditId)}"
              data-required-days="${Math.max(0, unit.requiredDays).toFixed(2)}"
              ${disabledDueToZeroRequired || rankedAuditors.length === 0 ? 'disabled' : ''}
              aria-label="Agregar auditor en ${escapeHtml(unit.title)}"
              title="${
                disabledDueToZeroRequired
                  ? 'Declare primero los días requeridos en 2. Tiempo'
                  : 'Agregar auditor con las jornadas indicadas'
              }"
              class="w-full h-8 px-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              Agregar
            </button>
          </div>
        </div>
      </div>
    `;
  };

  const renderUnitCard = (
    detail: AuditAuditorDetailModel,
    unit: AuditAuditableUnit
  ): string => {
    const isTemporal = unit.kind === 'TEMPORAL';
    const metrics = computeBalanceMetrics({
      assignedCount: unit.members.length,
      assignedDays: unit.assignedDays,
      requiredDays: unit.requiredDays,
    });

    const cardBorder = metrics.isBalanced
      ? 'border-emerald-200 bg-white'
      : metrics.isExcess
      ? 'border-rose-200 bg-rose-50/20'
      : isTemporal
      ? 'border-violet-300 bg-violet-50/20'
      : 'border-slate-200 bg-white';

    return `
      <article
        data-testid="${isTemporal ? 'asignacion-temporal-card' : 'asignacion-site-card'}"
        ${
          isTemporal
            ? `data-temporal-site-id="${escapeHtml(unit.targetId)}"`
            : `data-site-plan-id="${escapeHtml(unit.targetId)}"`
        }
        class="rounded-xl border ${cardBorder} p-3.5 space-y-2.5"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-2 min-w-0 flex-1">
            <span class="px-1.5 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap ${
              isTemporal
                ? 'bg-violet-100 text-violet-900 border-violet-300'
                : unit.isHq
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-slate-100 text-slate-700 border-slate-200'
            }">
              ${escapeHtml(unit.badgeLabel)}
            </span>
            <h4 class="text-xs sm:text-sm font-bold text-slate-900 truncate">${escapeHtml(
              unit.title
            )}</h4>
            ${
              unit.modalidad
                ? `<span class="text-[11px] text-slate-500 whitespace-nowrap">· ${escapeHtml(unit.modalidad)}</span>`
                : ''
            }
          </div>

          <div class="flex items-center gap-2 shrink-0 tabular-nums">
            <span class="font-mono text-[11px] font-semibold text-slate-600 whitespace-nowrap">
              ${escapeHtml(metrics.summaryText)}
            </span>
            <span class="px-2 py-0.5 rounded-md text-[11px] font-bold border ${metrics.deltaBadgeClass} whitespace-nowrap">
              ${escapeHtml(metrics.deltaLabel)}
            </span>
          </div>
        </div>

        <div class="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
          <div class="h-full rounded-full ${metrics.barClass} transition-all" style="width: ${metrics.widthPct}%"></div>
        </div>

        ${
          unit.hasMissingTime
            ? `
              <div class="rounded-lg border border-amber-200 bg-amber-50/80 px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-amber-900">
                <span>Este sitio tiene <strong>0.00 d</strong> requeridos.</span>
                <button
                  type="button"
                  data-action="audit-breadcrumb-nav"
                  data-target-subview="${isTemporal ? 'designacion/temporal' : 'tiempo'}"
                  class="font-bold underline cursor-pointer whitespace-nowrap"
                >
                  Ir a ${isTemporal ? '1.5 Temporal' : '2. Tiempo'} →
                </button>
              </div>
            `
            : ''
        }

        <div>
          ${
            unit.members.length === 0
              ? `<p class="text-[11px] italic text-slate-500 py-1">Sin auditores asignados.</p>`
              : unit.members.map((member) => renderMemberRow(unit, member)).join('')
          }
        </div>

        ${renderAddAuditorControls(detail, unit)}
      </article>
    `;
  };

  let bodyHtml = '';
  if (activeAudit) {
    const detail = buildAuditAuditorDetail({
      activeAudit,
      audits,
      programs,
      temporalSites,
      auditors,
      certificados,
      expertos,
      alertConfig,
    });

    const auditStatusBadge = getCertStatusBadge({
      statusKey: detail.statusKey,
      hasExcessDiscrepancy: detail.hasExcessDiscrepancy,
    });
    const globalMetrics = computeBalanceMetrics({
      assignedCount: detail.assignedSummaries.length,
      assignedDays: detail.assignedDaysTotal,
      requiredDays: detail.requiredDaysTotal,
    });

    const iafGapCompactMessage = detail.iafGapStatus.hasIafSectorGap
      ? detail.iafGapStatus.coveredByAssignedExperts
        ? `✓ ${detail.iafGapStatus.title} — Respaldada por Experto Técnico (${detail.iafGapStatus.coveringExpertNames.join(', ')}).`
        : `⚠ ${detail.iafGapStatus.message}${
            detail.iafGapStatus.affectedAuditors.length > 0
              ? ` Sin cobertura IAF: ${detail.iafGapStatus.affectedAuditors.map((a) => a.auditorNombre).join(', ')}.`
              : ''
          } Puede asignar un Experto Técnico (opcional).`
      : '';

    const iafGapBannerHtml = detail.iafGapStatus.hasIafSectorGap
      ? `
        <div
          role="status"
          data-testid="asignacion-iaf-gap-banner"
          class="rounded-lg border ${
            detail.iafGapStatus.coveredByAssignedExperts
              ? 'border-sky-200 bg-sky-50/80 text-sky-950'
              : 'border-amber-200 bg-amber-50/90 text-amber-950'
          } px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px]"
        >
          <span class="font-semibold">${escapeHtml(iafGapCompactMessage)}</span>
          <span class="text-[10px] font-bold opacity-80 whitespace-nowrap">No bloqueante</span>
        </div>
      `
      : '';

    const summaryBannerHtml = `
      <section
        data-testid="asignacion-summary-banner"
        class="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 space-y-2"
      >
        <div class="flex flex-wrap items-center justify-between gap-2 tabular-nums">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span>
              <span class="text-slate-500">Requerido:</span>
              <strong class="font-mono text-slate-950">${detail.requiredDaysTotal.toFixed(2)} d</strong>
            </span>
            <span class="text-slate-300" aria-hidden="true">·</span>
            <span>
              <span class="text-slate-500">Asignado:</span>
              <strong class="font-mono text-slate-950">${detail.assignedDaysTotal.toFixed(2)} d</strong>
            </span>
            <span class="text-slate-300" aria-hidden="true">·</span>
            <span>
              <span class="text-slate-500">Unidades:</span>
              <strong class="font-mono text-slate-950">${detail.balancedUnitsCount}/${detail.units.length}</strong>
            </span>
            ${
              detail.hasTemporalActive
                ? `<span class="text-slate-300" aria-hidden="true">·</span><span class="text-[11px] font-semibold text-violet-800">Incluye Temporal</span>`
                : ''
            }
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <span class="text-[11px] font-mono font-semibold text-slate-600 whitespace-nowrap">
              ${escapeHtml(globalMetrics.deltaLabel)}
            </span>
            <span class="px-2 py-0.5 rounded-md text-[11px] font-bold border ${auditStatusBadge.cls} whitespace-nowrap">
              ${escapeHtml(auditStatusBadge.label)}
            </span>
          </div>
        </div>

        <div class="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
          <div class="h-full rounded-full ${globalMetrics.barClass} transition-all" style="width: ${globalMetrics.widthPct}%"></div>
        </div>

        ${iafGapBannerHtml}

        ${
          detail.observacionSectoresAlerts.length > 0
            ? detail.observacionSectoresAlerts
                .map((obsAlert) => {
                  const sectorsText = obsAlert.intersectedSectors.join(', ');
                  const msg = obsAlert.coveredByExperto
                    ? `✓ Condición sectorial de ${obsAlert.auditorNombre} (Sector ${sectorsText}) cubierta con Experto Técnico asignado (${obsAlert.coveringExpertNames.join(', ')}).`
                    : `⚠ ${obsAlert.auditorNombre} requiere acompañamiento de Experto Técnico en Sector ${sectorsText} ("${obsAlert.rawText}"). Puede asignar un Experto Técnico global abajo.`;
                  return `
                    <div
                      role="status"
                      data-testid="asignacion-obs-sectores-banner"
                      class="rounded-lg border ${
                        obsAlert.coveredByExperto
                          ? 'border-emerald-200 bg-emerald-50/80 text-emerald-950'
                          : 'border-amber-200 bg-amber-50/90 text-amber-950'
                      } px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px]"
                    >
                      <span class="font-semibold">${escapeHtml(msg)}</span>
                      <span class="text-[10px] font-bold opacity-80 whitespace-nowrap">No bloqueante</span>
                    </div>
                  `;
                })
                .join('')
            : ''
        }

        ${
          detail.rotationSummary?.requiresRotation && detail.rotationSummary.warningMessage
            ? `
              <div class="rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-1.5 text-[11px] font-medium text-amber-900">
                ⚠️ ${escapeHtml(detail.rotationSummary.warningMessage)}
              </div>
            `
            : ''
        }

        ${
          detail.scheduleConflicts.length > 0
            ? `
              <div data-testid="asignacion-schedule-conflicts" class="rounded-lg border border-rose-200 bg-rose-50/80 px-3 py-1.5 space-y-0.5 text-[11px] text-rose-800">
                <div class="font-bold text-rose-900">
                  ⚠️ Conflictos de calendario (${detail.scheduleConflicts.length})
                </div>
                <ul class="space-y-0.5 list-disc pl-4">
                  ${detail.scheduleConflicts.map((c) => `<li>${escapeHtml(c.message)}</li>`).join('')}
                </ul>
              </div>
            `
            : ''
        }
      </section>
    `;

    const missingTemporalRecordWarningHtml = detail.temporalEnabledWithoutRecord
      ? `
        <div class="rounded-xl border border-violet-200 bg-violet-50/70 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-violet-950">
          <span>
            Sitio Temporal activo: falta registrar detalles en <strong>1.5 Temporal</strong>.
          </span>
          <button
            type="button"
            data-action="audit-breadcrumb-nav"
            data-target-subview="designacion/temporal"
            class="text-[11px] font-bold text-violet-900 hover:underline cursor-pointer whitespace-nowrap"
          >
            Completar 1.5 Temporal →
          </button>
        </div>
      `
      : '';

    const unitsAreaHtml = detail.hasNoAuditableUnits
      ? `
        <div
          data-testid="auditor-empty-sites-state"
          class="rounded-xl border border-dashed border-amber-300 bg-amber-50/40 p-6 text-center space-y-2.5"
        >
          <p class="text-xs font-bold text-slate-900">No hay sitios designados para asignar auditores</p>
          <div class="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              data-action="audit-breadcrumb-nav"
              data-target-subview="designacion/sitio"
              class="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-1.5"
            >
              <span>Ir a 1.4 Sitio</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      `
      : `
        <div class="space-y-3">
          ${detail.units.map((unit) => renderUnitCard(detail, unit)).join('')}
        </div>
      `;

    const scopeIafText =
      detail.scopeIafRequirements.length > 0
        ? detail.scopeIafRequirements
            .map((req) =>
              req.subsectorCodigo
                ? `Sub-Sector ${req.subsectorCodigo} (Sector ${req.sectorIaf})`
                : `Sector IAF ${req.sectorIaf}`
            )
            .join(' · ')
        : `Sector IAF ${detail.audit.sector_iaf}`;

    const rankedOptions = detail.rankedEligibleExpertos;
    const defaultExpertoId =
      state.draftExpertoId && rankedOptions.some((o) => o.expertoId === state.draftExpertoId)
        ? state.draftExpertoId
        : rankedOptions.find((o) => !o.isAlreadyAssigned && !o.isUnavailable)?.expertoId ||
          rankedOptions.find((o) => !o.isAlreadyAssigned)?.expertoId ||
          rankedOptions[0]?.expertoId ||
          '';
    const draftExpDays = state.draftExpertoDays || '1.00';
    const draftExpObs = state.draftExpertoObservacion || '';

    const expertosRowsHtml =
      detail.assignedExpertos.length === 0
        ? `
          <p class="text-xs text-slate-500 py-1">
            Sin expertos técnicos asignados (opcional).
          </p>
        `
        : detail.assignedExpertos
            .map((exp) => {
              const obsDraftValue =
                state.expertoEditObsDrafts?.[exp.id] !== undefined
                  ? state.expertoEditObsDrafts[exp.id]
                  : exp.observacion || '';
              const covSummary =
                exp.coveredIafLabels.length > 0
                  ? exp.coveredIafLabels.join(' · ')
                  : 'Cobertura IAF general';
              const statusNote =
                exp.experto_estatus === 'No disponible' ? 'No disponible' : 'Disponible';

              return `
                <div
                  data-testid="asignacion-experto-row"
                  data-experto-assignment-id="${escapeHtml(exp.id)}"
                  class="py-2 px-2.5 space-y-1.5 border-b border-slate-100 last:border-b-0"
                >
                  <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
                    <div class="min-w-0 flex-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span class="text-xs font-bold text-slate-900">
                        ${escapeHtml(exp.experto_nombre)}
                      </span>
                      <span class="text-[11px] font-medium ${
                        exp.experto_estatus === 'No disponible'
                          ? 'text-amber-800'
                          : 'text-emerald-700'
                      }">
                        ${escapeHtml(statusNote)}
                      </span>
                      <span aria-hidden="true" class="text-slate-300">·</span>
                      <span class="text-[11px] text-slate-600">
                        ${escapeHtml(covSummary)}
                      </span>
                    </div>

                    <div class="flex flex-wrap items-center gap-1 shrink-0 tabular-nums">
                      ${
                        isStaff
                          ? `
                            <button
                              type="button"
                              data-action="step-asignacion-experto-days"
                              data-assignment-id="${escapeHtml(exp.id)}"
                              data-audit-id="${escapeHtml(exp.id_auditoria)}"
                              data-experto-id="${escapeHtml(exp.id_experto_tecnico)}"
                              data-current-days="${exp.dias_asignados.toFixed(2)}"
                              data-delta="-0.25"
                              ${exp.dias_asignados <= 0.25 ? 'disabled' : ''}
                              aria-label="Restar 0.25 días a ${escapeHtml(exp.experto_nombre)}"
                              class="h-7 px-2 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-bold text-slate-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                            >
                              -0.25
                            </button>
                            <input
                              type="number"
                              step="0.25"
                              min="0.25"
                              data-action="change-asignacion-experto-row-days"
                              data-assignment-id="${escapeHtml(exp.id)}"
                              data-audit-id="${escapeHtml(exp.id_auditoria)}"
                              data-experto-id="${escapeHtml(exp.id_experto_tecnico)}"
                              aria-label="Días asignados a ${escapeHtml(exp.experto_nombre)}"
                              value="${exp.dias_asignados.toFixed(2)}"
                              class="w-18 h-7 rounded-md border border-slate-200 bg-white px-1.5 text-center font-mono text-xs font-bold text-slate-900 tabular-nums focus:border-slate-900 focus:outline-none"
                            />
                            <button
                              type="button"
                              data-action="step-asignacion-experto-days"
                              data-assignment-id="${escapeHtml(exp.id)}"
                              data-audit-id="${escapeHtml(exp.id_auditoria)}"
                              data-experto-id="${escapeHtml(exp.id_experto_tecnico)}"
                              data-current-days="${exp.dias_asignados.toFixed(2)}"
                              data-delta="0.25"
                              aria-label="Sumar 0.25 días a ${escapeHtml(exp.experto_nombre)}"
                              class="h-7 px-2 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-bold text-slate-700 cursor-pointer whitespace-nowrap"
                            >
                              +0.25
                            </button>
                            <button
                              type="button"
                              data-action="remove-asignacion-experto"
                              data-assignment-id="${escapeHtml(exp.id)}"
                              data-audit-id="${escapeHtml(exp.id_auditoria)}"
                              data-experto-id="${escapeHtml(exp.id_experto_tecnico)}"
                              aria-label="Quitar experto técnico ${escapeHtml(exp.experto_nombre)}"
                              class="h-7 px-2.5 rounded-md border border-rose-200 bg-rose-50 hover:bg-rose-100 text-[11px] font-semibold text-rose-700 cursor-pointer ml-1 whitespace-nowrap"
                            >
                              Quitar
                            </button>
                          `
                          : `
                            <span class="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-900 text-white">
                              ${exp.dias_asignados.toFixed(2)} d
                            </span>
                          `
                      }
                    </div>
                  </div>

                  ${
                    isStaff
                      ? `
                        <div class="flex flex-col sm:flex-row sm:items-center gap-1.5">
                          <input
                            type="text"
                            maxlength="${EXPERTO_AUDITORIA_OBSERVACION_MAX_LENGTH}"
                            data-action="change-asignacion-experto-row-obs"
                            data-assignment-id="${escapeHtml(exp.id)}"
                            aria-label="Observación de ${escapeHtml(exp.experto_nombre)}"
                            placeholder="Observación opcional..."
                            value="${escapeHtml(obsDraftValue)}"
                            class="flex-1 h-7 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-800 focus:border-slate-900 focus:outline-none"
                          />
                          <button
                            type="button"
                            data-action="save-asignacion-experto-obs"
                            data-assignment-id="${escapeHtml(exp.id)}"
                            data-audit-id="${escapeHtml(exp.id_auditoria)}"
                            data-experto-id="${escapeHtml(exp.id_experto_tecnico)}"
                            class="h-7 px-2.5 rounded-md border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-800 cursor-pointer whitespace-nowrap shrink-0"
                          >
                            Guardar obs.
                          </button>
                        </div>
                      `
                      : `
                        <p class="text-[11px] text-slate-600">
                          <strong>Observación:</strong> ${escapeHtml(exp.observacion || 'Sin observación.')}
                        </p>
                      `
                  }
                </div>
              `;
            })
            .join('');

    const addExpertoFormHtml = isStaff
      ? `
        <div
          data-testid="asignacion-experto-inline-form"
          data-audit-id="${escapeHtml(activeAudit.id)}"
          class="pt-2.5 border-t border-slate-100"
        >
          <div class="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
            <div class="sm:col-span-5">
              <label
                for="asignacionExpertoSelect_${escapeHtml(activeAudit.id)}"
                class="block text-[11px] font-semibold text-slate-600 mb-1"
              >
                Experto Técnico
              </label>
              <select
                id="asignacionExpertoSelect_${escapeHtml(activeAudit.id)}"
                data-action="change-asignacion-experto-draft"
                data-field="expertoId"
                ${rankedOptions.length === 0 ? 'disabled' : ''}
                aria-label="Seleccionar experto técnico para la auditoría"
                class="w-full h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-none disabled:opacity-50"
              >
                ${
                  rankedOptions.length === 0
                    ? '<option value="">Sin expertos técnicos registrados</option>'
                    : rankedOptions
                        .map((opt) => {
                          const selected = opt.expertoId === defaultExpertoId ? 'selected' : '';
                          return `<option value="${escapeHtml(opt.expertoId)}" ${selected}>${escapeHtml(opt.optionLabel)}</option>`;
                        })
                        .join('')
                }
              </select>
            </div>

            <div class="sm:col-span-2">
              <label
                for="asignacionExpertoDaysInput_${escapeHtml(activeAudit.id)}"
                class="block text-[11px] font-semibold text-slate-600 mb-1"
              >
                Días (0.25)
              </label>
              <input
                id="asignacionExpertoDaysInput_${escapeHtml(activeAudit.id)}"
                type="number"
                min="0.25"
                step="0.25"
                data-action="change-asignacion-experto-draft"
                data-field="days"
                aria-label="Días asignados al experto técnico"
                value="${escapeHtml(draftExpDays)}"
                class="w-full h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs font-mono font-bold text-slate-900 tabular-nums focus:border-slate-900 focus:outline-none"
              />
            </div>

            <div class="sm:col-span-3">
              <label
                for="asignacionExpertoObsInput_${escapeHtml(activeAudit.id)}"
                class="block text-[11px] font-semibold text-slate-600 mb-1"
              >
                Observación opcional
              </label>
              <input
                id="asignacionExpertoObsInput_${escapeHtml(activeAudit.id)}"
                type="text"
                maxlength="${EXPERTO_AUDITORIA_OBSERVACION_MAX_LENGTH}"
                data-action="change-asignacion-experto-draft"
                data-field="observacion"
                aria-label="Observación opcional del experto técnico"
                placeholder="Foco técnico o fechas..."
                value="${escapeHtml(draftExpObs)}"
                class="w-full h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
              />
            </div>

            <div class="sm:col-span-2">
              <button
                type="button"
                data-action="submit-asignacion-experto"
                data-audit-id="${escapeHtml(activeAudit.id)}"
                ${rankedOptions.length === 0 ? 'disabled' : ''}
                class="w-full h-8 px-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              >
                Agregar Experto
              </button>
            </div>
          </div>
        </div>
      `
      : '';

    const expertosSectionHtml = `
      <section
        data-testid="asignacion-expertos-section"
        class="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-xs sm:text-sm font-bold text-slate-900">
            Expertos Técnicos (Alcance Global)
          </h3>
          <span class="text-[11px] font-medium text-slate-500">
            ${detail.assignedExpertos.length} asignado${detail.assignedExpertos.length === 1 ? '' : 's'} · ${escapeHtml(scopeIafText)}
          </span>
        </div>

        ${
          state.expertoFeedbackMessage
            ? `<div role="status" class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-800">${escapeHtml(state.expertoFeedbackMessage)}</div>`
            : ''
        }

        <div>
          ${expertosRowsHtml}
        </div>

        ${addExpertoFormHtml}
      </section>
    `;

    const footerActionsHtml = `
      <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 text-[11px] font-semibold">
        <button
          type="button"
          data-action="audit-breadcrumb-nav"
          data-target-subview="tiempo"
          class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 transition-colors cursor-pointer whitespace-nowrap"
        >
          ← 2. Tiempo
        </button>
        <button
          type="button"
          data-action="audit-breadcrumb-nav"
          data-target-subview="proceso"
          class="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white transition-colors cursor-pointer whitespace-nowrap"
        >
          Continuar a 4. Proceso →
        </button>
      </div>
    `;

    bodyHtml = `
      <div class="space-y-3">
        ${summaryBannerHtml}
        ${missingTemporalRecordWarningHtml}
        ${unitsAreaHtml}
        ${expertosSectionHtml}
        ${footerActionsHtml}
      </div>
    `;
  }

  return renderAuditSectionShell({
    sectionTitle: '3. Auditor',
    sectionSymbol: '👥',
    backSubview: 'auditor',
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
    certificados,
    navigation,
    programs,
    showLinkedSiblings: false,
    isStaff,
    inCardBreadcrumbHtml,
    headerAddAuditHtml,
    tableName: 'auditoria',
    feedbackHtml,
    bodyHtml,
  });
}

