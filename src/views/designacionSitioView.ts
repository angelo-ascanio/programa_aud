import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import type { OrganizacionEntity } from '../lib/activeCertificates';
import type { ConglomeradoEntity } from '../lib/conglomeradoDomain';
import type { VinculoEntity } from '../lib/vinculoDomain';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import { resolveCertVersionSnapshotForAudit } from '../lib/certificadoVersionDomain';
import type { CertificateRecord } from '../lib/searchControls';
import {
  formatAuditDateLabel,
  type AuditDateEntry,
  type ProgramaAuditoriaEntity,
} from '../lib/auditPlanningEngine';
import type { ProgramacionAuditEntity } from '../lib/auditExecution';
import {
  getLinkedSiblingAudits,
  resolveAuditNavigation,
} from '../lib/certificateAuditSelector';
import {
  buildOrgCertPickerModalModel,
  buildOrgMultiViewRows,
  type OrgMultiViewRow,
} from '../lib/orgMultiViewPickerDomain';
import {
  computeAuditUrgencyClassification,
  mergeCertSourcesForOrgPicker,
  requiresFutureYearWarning,
  resolveLastAddedPlannedDate,
  type TipoQueuePreset,
} from '../lib/designacionTipoDomain';
import {
  DEFAULT_SITIO_DETAIL_QUERY_OPTIONS,
  SITE_COVERAGE_SORT_OPTIONS,
  SITIO_DETAIL_FILTER_OPTIONS,
  SITIO_DETAIL_SORT_OPTIONS,
  buildActiveSitioAuditModel,
  buildCertificateSitioRows,
  buildSiteCoverageModalModel,
  buildSitioOrgFacetCategories,
  createSitioOrgCertMetaResolver,
  filterAndSortSitioAssignments,
  type CandidateSiteEntity,
  type CertificateSitioRow,
  type SiteCoverageSortMode,
  type SitioAssignmentItem,
  type SitioDetailFilterMode,
  type SitioDetailSortMode,
  type SitioLinkedAuditModel,
  type SitioOrgCertMeta,
} from '../lib/designacionSitioDomain';
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
import {
  extractUniversalArchiveProps,
  type ArchiveMultiViewConfig,
} from '../lib/archiveGovernance';
import {
  formatAuditCodename,
  getAuditCodenameTooltip,
  resolveShortOrganizacionName,
} from '../lib/codenameDomain';
import { isValidUuid } from '../lib/zeroUuid';

export type DesignacionSitioSortColumn =
  | 'organizacion'
  | 'certificados'
  | 'auditorias'
  | 'cobertura_sitios'
  | 'urgencia'
  | 'certificado'
  | 'estatus_cert';

export interface DesignacionSitioViewState {
  query: string;
  viewMode: UniversalViewMode;
  isSidebarOpen: boolean;
  sortColumn: DesignacionSitioSortColumn | null;
  sortDirection: SortDirection;
  facetSelections: MultiViewSelectionMap;
  selectedCertId: string | null;
  selectedAuditId: string | null;
  pickerOrgId?: string | null;
  pickerSearchQuery?: string;
  /** Legacy compatibility fields */
  selectedProgramId?: string | null;
  queuePreset?: TipoQueuePreset;
  cycleWindowOffsetByAuditId: Record<string, number>;
  notesDraftBySitePlanId: Record<string, string>;
  savingSiteToggleKey: string | null;
  savingNotesSiteId: string | null;
  editErrorMessage: string | null;
  coverageModalCertId: string | null;
  coverageModalAuditId: string | null;
  coverageSortMode: SiteCoverageSortMode;
  coverageWindowOffset: number;
  /** Mapa por auditId: por defecto FALSE (colapsada) */
  isSitePanelExpandedByAuditId: Record<string, boolean>;
  /** Filtro activo dentro de la tarjeta del certificado activo */
  detailFilterMode: SitioDetailFilterMode;
  /** Entero N >= 0 cuando detailFilterMode === 'NOT_AUDITED_LAST_N' */
  notAuditedLastN: number;
  /** Ordenamiento activo dentro de la tarjeta */
  detailSortMode: SitioDetailSortMode;
  /** Búsqueda rápida inline para listas de 30–80+ sitios */
  detailSearchQuery: string;
}

export const DEFAULT_DESIGNACION_SITIO_STATE: DesignacionSitioViewState = {
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
  notesDraftBySitePlanId: {},
  savingSiteToggleKey: null,
  savingNotesSiteId: null,
  editErrorMessage: null,
  coverageModalCertId: null,
  coverageModalAuditId: null,
  coverageSortMode: 'SITE_NUMBER',
  coverageWindowOffset: 0,
  isSitePanelExpandedByAuditId: {},
  detailFilterMode: DEFAULT_SITIO_DETAIL_QUERY_OPTIONS.filterMode,
  notAuditedLastN: DEFAULT_SITIO_DETAIL_QUERY_OPTIONS.notAuditedLastN,
  detailSortMode: DEFAULT_SITIO_DETAIL_QUERY_OPTIONS.sortMode,
  detailSearchQuery: DEFAULT_SITIO_DETAIL_QUERY_OPTIONS.searchQuery ?? '',
};

export interface DesignacionSitioViewProps {
  profile: UserProfile;
  state: DesignacionSitioViewState;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  allAudits: ReadonlyArray<ProgramacionAuditEntity>;
  vinculos: ReadonlyArray<VinculoEntity>;
  conglomerados: ReadonlyArray<ConglomeradoEntity>;
  organizaciones?: ReadonlyArray<OrganizacionEntity>;
  authorizedClientOrgIds?: ReadonlyArray<string>;
  certificados: ReadonlyArray<CertificadoDetailEntity>;
  certificates?: ReadonlyArray<CertificateRecord>;
  referenceIsoDate?: string;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
  inCardBreadcrumbHtml?: string;
  headerAddAuditHtml?: string;
}

const PREFERRED_CERT_STATUS_ORDER: readonly string[] = [
  'Activo',
  'Estudio',
  'Suspendido',
  'Cancelado',
  'Retirado',
  'Vencido',
  'En Espera',
  'Inactivo',
];

function buildCertificateStatusFacetOptions(
  allRows: ReadonlyArray<CertificateSitioRow>
): Array<{ value: string; label: string }> {
  const uniqueValues = Array.from(
    new Set(
      allRows
        .map((r) => (r.estatus || '').trim())
        .filter((s) => s.length > 0)
    )
  );

  uniqueValues.sort((a, b) => {
    const idxA = PREFERRED_CERT_STATUS_ORDER.findIndex(
      (p) => p.toLowerCase() === a.toLowerCase()
    );
    const idxB = PREFERRED_CERT_STATUS_ORDER.findIndex(
      (p) => p.toLowerCase() === b.toLowerCase()
    );
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b, 'es');
  });

  return uniqueValues.map((status) => ({
    value: status,
    label: status,
  }));
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

function getCandidateSitesForAudit(
  audit: ProgramacionAuditEntity,
  certificados: ReadonlyArray<CertificadoDetailEntity & { deleted_at?: string | null }>
): CandidateSiteEntity[] {
  const activeCerts = certificados.filter((c) => !c.deleted_at);
  if (activeCerts.length > 0) {
    const snapshot = resolveCertVersionSnapshotForAudit(audit, activeCerts);
    if (snapshot.sitios.length > 0) {
      return snapshot.sitios;
    }
  }
  const activePlan = (audit.sitiosPlan || []).filter((sp) => !sp.deleted_at);
  return activePlan.map((sp) => ({
    id: sp.id_sitio,
    id_certificado: audit.id_certificado,
    numero_sitio: sp.numero_sitio,
    nombre_sitio: sp.nombre_sitio,
    direccion_sitio: sp.direccion_sitio || '',
    deleted_at: null,
  }));
}

function mergeAuditsPool(
  programs: ReadonlyArray<ProgramaAuditoriaEntity>,
  allAudits: ReadonlyArray<ProgramacionAuditEntity>
): ProgramacionAuditEntity[] {
  const byId = new Map<string, ProgramacionAuditEntity>();
  for (const a of allAudits) {
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

export function renderDesignacionSitioView(props: DesignacionSitioViewProps): string {
  const {
    profile,
    state,
    programs,
    allAudits,
    vinculos = [],
    conglomerados = [],
    organizaciones = [],
    authorizedClientOrgIds = [],
    certificados,
    certificates = [],
    referenceIsoDate,
    loading = false,
    archiveConfig,
    tableColumnWidths,
    inCardBreadcrumbHtml = '',
    headerAddAuditHtml = '',
  } = props;

  const isStaff = isApprovedStaffProfile(profile);
  const auditsPool = mergeAuditsPool(programs, allAudits);

  const allRows = buildCertificateSitioRows({
    certificates,
    detailedCerts: certificados,
    audits: auditsPool,
    programs,
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

  if (resolvedCertId) {
    const certRow = allRows.find((r) => r.certId === resolvedCertId) ?? null;
    if (certRow) {
      const effectiveAuditId = state.selectedAuditId ?? legacyProgramFirstAudit?.id ?? null;
      return renderSitioDetailView({
        state,
        certRow,
        effectiveAuditId,
        allAudits: auditsPool,
        programs,
        certificados,
        isStaff,
        referenceIsoDate,
        inCardBreadcrumbHtml,
        headerAddAuditHtml,
      });
    }
  }

  const mergedCerts = mergeCertSourcesForOrgPicker({
    certificados,
    certificates,
    audits: auditsPool,
    organizaciones,
  });

  const resolveCertMeta = createSitioOrgCertMetaResolver(referenceIsoDate);
  const orgRows = buildOrgMultiViewRows<SitioOrgCertMeta>({
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

  const facetCategories = buildSitioOrgFacetCategories(orgRows);

  const extraColumns: ColumnDefinition<OrgMultiViewRow<SitioOrgCertMeta>>[] = [
    {
      id: 'cobertura_sitios',
      header: 'Sitios Asignados',
      defaultWidthPct: 26,
      minWidthPx: 165,
      sortable: true,
      getValue: (row) =>
        row.certificates.reduce(
          (sum, c) => sum + c.domainExtra.selectedSitesCount,
          0
        ),
      renderCell: (row) => {
        const totalSelected = row.certificates.reduce(
          (sum, c) => sum + c.domainExtra.selectedSitesCount,
          0
        );
        const totalAvailable = row.certificates.reduce(
          (sum, c) => sum + c.domainExtra.totalAvailableSites,
          0
        );
        const configuredCerts = row.certificates.filter(
          (c) => c.domainExtra.hasSitesConfigured
        ).length;
        const leadPreview =
          row.certificates.find((c) => c.domainExtra.hasSitesConfigured)?.domainExtra
            .assignedSitesPreview ?? 'Sin sitios asignados';

        return `
          <div class="min-w-0 space-y-0.5">
            <div class="text-xs font-semibold text-slate-800 truncate tabular-nums">
              ${totalSelected} de ${totalAvailable} sedes (${configuredCerts}/${row.certsCount} cert.)
            </div>
            <div class="text-[11px] text-slate-500 truncate" title="${escapeHtml(leadPreview)}">
              ${escapeHtml(leadPreview)}
            </div>
          </div>
        `;
      },
    },
  ];

  const renderCardExtra = (row: OrgMultiViewRow<SitioOrgCertMeta>): string => {
    const totalSelected = row.certificates.reduce(
      (sum, c) => sum + c.domainExtra.selectedSitesCount,
      0
    );
    const totalAvailable = row.certificates.reduce(
      (sum, c) => sum + c.domainExtra.totalAvailableSites,
      0
    );
    const configuredCerts = row.certificates.filter(
      (c) => c.domainExtra.hasSitesConfigured
    ).length;
    return `
      <div class="flex items-center justify-between gap-2 text-[11px] text-slate-700">
        <span class="font-semibold truncate tabular-nums">📍 ${totalSelected} de ${totalAvailable} sedes</span>
        <span class="shrink-0 font-bold ${configuredCerts > 0 ? 'text-emerald-700' : 'text-amber-700'}">
          ${configuredCerts}/${row.certsCount} cert.
        </span>
      </div>
    `;
  };

  const pickerModel = state.pickerOrgId
    ? buildOrgCertPickerModalModel<SitioOrgCertMeta>({
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

  const pickerDomainColumns: OrgPickerDomainColumn<SitioOrgCertMeta>[] = [
    {
      id: 'sitios_designados',
      header: 'Sitios Designados',
      defaultWidthPct: 24,
      minWidthPx: 155,
      renderCell: (row) => {
        const meta = row.domainExtra;
        return `
          <div class="min-w-0 space-y-0.5">
            <div class="text-xs font-semibold ${meta.hasSitesConfigured ? 'text-slate-900' : 'text-amber-700'} truncate tabular-nums">
              ${escapeHtml(meta.siteCoverageLabel)}
            </div>
            <div class="text-[11px] text-slate-500 truncate" title="${escapeHtml(meta.assignedSitesPreview)}">
              ${escapeHtml(meta.assignedSitesPreview)}
            </div>
          </div>
        `;
      },
    },
    {
      id: 'ultima_auditoria',
      header: 'Última Auditoría',
      defaultWidthPct: 24,
      minWidthPx: 145,
      renderCell: (row) => {
        const meta = row.domainExtra;
        return `
          <div class="min-w-0 space-y-0.5" title="${escapeHtml(meta.latestAuditTooltip)}">
            <div class="font-mono text-xs font-bold text-slate-900 truncate">
              ${escapeHtml(meta.latestAuditCodename)}
            </div>
            <div>
              <span class="inline-flex items-center px-1.5 py-0.2 rounded-full text-[10px] font-bold border whitespace-nowrap ${meta.urgency.badgeClass}">
                ${escapeHtml(meta.urgency.label)}
              </span>
            </div>
          </div>
        `;
      },
    },
  ];

  const pickerModalHtml = pickerModel
    ? renderOrgCertPickerModal<SitioOrgCertMeta>({
        model: pickerModel,
        domainColumns: pickerDomainColumns,
        subtitle:
          'Seleccione un certificado (agrupado por auditoría vinculada) para designar sus sitios permanentes y cobertura.',
        emptySearchMessage:
          'No se encontraron certificados ni sitios que coincidan con la búsqueda en esta organización.',
      })
    : '';

  const archiveProps = extractUniversalArchiveProps(archiveConfig, 'sitios_por_auditoria');

  return renderOrgMultiView<SitioOrgCertMeta>({
    domainKey: 'designacion-sitio',
    tableId: 'designacion-sitio-main',
    title: 'Designación → Sitio',
    subtitle:
      'Sub-paso 1.4 por organización: abra una organización para seleccionar su certificado y designar sus sitios permanentes.',
    entityLabel: 'organizaciones',
    groupingMode: 'audit',
    rows: orgRows,
    searchQuery: state.query,
    searchPlaceholder:
      'Buscar organización, conglomerado, certificado, norma, sitio o codename...',
    searchInputId: 'designacion-sitioSearchInput',
    clearSearchBtnId: 'clearDesignacionSitioSearchBtn',
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen,
    sortState: { column: state.sortColumn, direction: state.sortDirection },
    columnWidths: tableColumnWidths?.['designacion-sitio-main'],
    facetCategories,
    facetSelections: state.facetSelections,
    extraColumns,
    renderCardExtra,
    actionsHtml: isStaff ? headerAddAuditHtml : '',
    loading,
    emptyStateTitle: 'Sin organizaciones disponibles en Designación → Sitio',
    emptyStateMessage:
      'Use "+ Auditoría" para programar la primera auditoría y asignar sus sitios.',
    pickerModalHtml,
    ...archiveProps,
  });
}

const RAW_UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function safeShortLabel(raw: string | null | undefined, fallback: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed || isValidUuid(trimmed) || RAW_UUID_REGEX.test(trimmed)) {
    return fallback;
  }
  return trimmed;
}

const COMPACT_FILTER_LABELS: Record<SitioDetailFilterMode, string> = {
  ALL: 'Todos',
  SELECTED: 'Seleccionados',
  UNSELECTED: 'No seleccionados',
  LINK_SELECTED: 'Seleccionados en vínculo',
  NOT_AUDITED_LAST_N: 'No auditados en últimas N',
  SHARED_ONLY: 'Solo compartidos',
  UNVISITED_CYCLE: 'Nunca auditados',
};

const COMPACT_SORT_LABELS: Record<SitioDetailSortMode, string> = {
  SITE_NUMBER: 'N° de sitio',
  SELECTED_FIRST: 'Seleccionados primero',
  LEAST_RECENTLY_AUDITED: 'Más antiguos / Sin visitar',
  PERSONAL_DESC: 'Mayor personal',
  NAME_ASC: 'Nombre (A–Z)',
};

function renderSiteAssignmentRow(opts: {
  audit: ProgramacionAuditEntity;
  item: SitioAssignmentItem;
  savingSiteToggleKey: string | null;
  isStaff: boolean;
}): string {
  const { audit, item, savingSiteToggleKey, isStaff } = opts;
  const {
    site,
    isPrincipalHq,
    isSelected,
    canToggle,
    sitioAuditoriaId,
    isSharedSite,
    sharedFromCertLabel,
    personalCount,
    isSelectedInLinkedSibling,
    linkedSiblingCertLabels,
  } = item;
  const toggleKey = `${audit.id}:${site.id}`;
  const isSaving = savingSiteToggleKey === toggleKey;
  const checkboxId = `step4SiteChk_${audit.id}_${site.id}`;
  const disabled = !canToggle || isSaving;
  const addressText =
    site.direccion_sitio || site.tipo_sitio || 'Dirección sin especificar';

  const rowSurfaceClass = isPrincipalHq
    ? 'border-slate-200 bg-slate-50/90'
    : isSelected
    ? 'border-indigo-200 bg-indigo-50/35'
    : 'border-slate-200 bg-white hover:bg-slate-50/80';

  const sharedBadgeHtml = isSharedSite
    ? `<span title="${escapeHtml(
        sharedFromCertLabel
          ? `Compartido desde ${sharedFromCertLabel}`
          : 'Sitio compartido'
      )}" class="px-1.5 py-0 rounded bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-medium shrink-0">Compartido</span>`
    : '';

  const personalBadgeHtml =
    personalCount !== null
      ? `<span class="text-[10px] text-slate-500 tabular-nums shrink-0">${personalCount} pers.</span>`
      : '';

  const secondaryStatusHint = isSaving
    ? '<span class="text-[10px] font-semibold text-indigo-600 shrink-0">Guardando...</span>'
    : isPrincipalHq
    ? '<span class="text-[10px] font-semibold text-slate-500 whitespace-nowrap shrink-0" title="Sitio principal HQ obligatorio en toda auditoría">🔒 HQ</span>'
    : isSelected && !canToggle && isStaff
    ? '<span class="text-[10px] font-semibold text-slate-400 whitespace-nowrap shrink-0">Mín. 1</span>'
    : isSelectedInLinkedSibling
    ? `<span title="${escapeHtml(
        `Seleccionado en: ${linkedSiblingCertLabels.join(', ')}`
      )}" class="text-[10px] font-medium text-indigo-600 whitespace-nowrap shrink-0">en vínculo</span>`
    : '';

  return `
    <label
      for="${escapeHtml(checkboxId)}"
      data-testid="sitio-assignment-row"
      data-audit-id="${escapeHtml(audit.id)}"
      data-site-id="${escapeHtml(site.id)}"
      data-site-number="${site.numero_sitio}"
      data-hq-locked="${isPrincipalHq ? 'true' : 'false'}"
      data-shared-site="${isSharedSite ? 'true' : 'false'}"
      class="flex items-start justify-between gap-2 px-2.5 py-1.5 rounded-lg border transition-colors min-h-[38px] ${rowSurfaceClass} ${
        disabled ? 'cursor-not-allowed' : 'cursor-pointer'
      }"
    >
      <span class="flex items-start gap-2 min-w-0 flex-1">
        <input
          type="checkbox"
          id="${escapeHtml(checkboxId)}"
          data-action="toggle-step4-site"
          data-audit-id="${escapeHtml(audit.id)}"
          data-site-id="${escapeHtml(site.id)}"
          data-sitio-auditoria-id="${escapeHtml(sitioAuditoriaId || '')}"
          data-currently-selected="${isSelected ? 'true' : 'false'}"
          data-hq-locked="${isPrincipalHq ? 'true' : 'false'}"
          ${isSelected ? 'checked' : ''}
          ${disabled ? 'disabled' : ''}
          class="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
        />
        <span class="min-w-0 flex-1">
          <span class="flex items-center gap-1.5 min-w-0">
            <span class="font-mono text-[10px] font-bold text-slate-500 shrink-0">${
              isPrincipalHq ? 'Sitio 0' : `#${site.numero_sitio}`
            }</span>
            <span class="text-xs font-semibold text-slate-900 truncate">${escapeHtml(
              site.nombre_sitio
            )}</span>
            ${sharedBadgeHtml}
            ${personalBadgeHtml}
          </span>
          <span class="block text-[11px] text-slate-500 truncate">${escapeHtml(addressText)}</span>
        </span>
      </span>
      ${secondaryStatusHint}
    </label>
  `;
}

function renderActiveAuditSiteCard(opts: {
  model: SitioLinkedAuditModel;
  allAudits: ReadonlyArray<ProgramacionAuditEntity>;
  siblingsCount: number;
  state: DesignacionSitioViewState;
  isStaff: boolean;
}): string {
  const { model, allAudits, siblingsCount, state, isStaff } = opts;
  const { audit } = model;

  const isExpanded = Boolean((state.isSitePanelExpandedByAuditId || {})[audit.id]);
  const filterMode: SitioDetailFilterMode = state.detailFilterMode ?? 'ALL';
  const sortMode: SitioDetailSortMode = state.detailSortMode ?? 'SITE_NUMBER';
  const rawLastN = Number.isFinite(state.notAuditedLastN) ? Math.trunc(state.notAuditedLastN) : 1;
  const notAuditedLastN = Math.max(0, rawLastN);
  const searchQuery = state.detailSearchQuery ?? '';
  const hasSharedSites = model.siteItems.some((item) => item.isSharedSite);

  const coverageBtnClass =
    model.unvisitedSitesCount > 0
      ? 'border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900'
      : 'border-slate-300 bg-white hover:bg-slate-100 text-slate-700';

  const panelBodyId = `sitioActiveAuditPanelBody_${audit.id}`;

  let expandedBodyHtml = '';
  if (isExpanded) {
    const visibleItems = filterAndSortSitioAssignments(model.siteItems, audit, allAudits, {
      filterMode,
      notAuditedLastN,
      sortMode,
      searchQuery,
    });

    const filterOptions = SITIO_DETAIL_FILTER_OPTIONS.filter((opt) => {
      if (opt.value === 'LINK_SELECTED') {
        return siblingsCount > 1 || filterMode === 'LINK_SELECTED';
      }
      if (opt.value === 'SHARED_ONLY') {
        return hasSharedSites || filterMode === 'SHARED_ONLY';
      }
      return true;
    });

    const showQuickSearch = model.totalSitesCount >= 8 || searchQuery.trim().length > 0;
    const gridScrollClass =
      visibleItems.length > 16 ? 'max-h-[540px] overflow-y-auto pr-1' : '';

    expandedBodyHtml = `
      <div id="${escapeHtml(panelBodyId)}" class="p-3 sm:p-3.5 space-y-2.5 border-t border-slate-100">
        ${
          model.siteItems.length === 0
            ? `
              <div class="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-500">
                Este certificado no tiene sitios permanentes activos configurados.
              </div>
            `
            : `
              <div class="flex flex-wrap items-center gap-2">
                <select
                  id="sitioDetailFilterSelect"
                  data-action="change-sitio-detail-filter"
                  aria-label="Filtrar sitios de la auditoría"
                  class="h-7 px-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-900 focus:border-slate-900 focus:outline-none"
                >
                  ${filterOptions
                    .map(
                      (opt) =>
                        `<option value="${opt.value}" ${
                          opt.value === filterMode ? 'selected' : ''
                        }>${escapeHtml(COMPACT_FILTER_LABELS[opt.value] || opt.label)}</option>`
                    )
                    .join('')}
                </select>

                ${
                  filterMode === 'NOT_AUDITED_LAST_N'
                    ? `
                      <label class="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 whitespace-nowrap">
                        <span>N</span>
                        <input
                          id="sitioNotAuditedLastNInput"
                          type="number"
                          min="0"
                          step="1"
                          data-action="change-sitio-last-n"
                          aria-label="Últimas N auditorías previas"
                          title="Número de auditorías previas (0 = mostrar todos)"
                          value="${notAuditedLastN}"
                          class="h-7 w-14 px-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-900 text-center tabular-nums focus:border-slate-900 focus:outline-none"
                        />
                        <span class="text-[10px] font-normal text-slate-500">0 = todos</span>
                      </label>
                    `
                    : ''
                }

                <select
                  id="sitioDetailSortSelect"
                  data-action="change-sitio-detail-sort"
                  aria-label="Ordenar sitios de la auditoría"
                  class="h-7 px-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-900 focus:border-slate-900 focus:outline-none"
                >
                  ${SITIO_DETAIL_SORT_OPTIONS.map(
                    (opt) =>
                      `<option value="${opt.value}" ${
                        opt.value === sortMode ? 'selected' : ''
                      }>${escapeHtml(COMPACT_SORT_LABELS[opt.value] || opt.label)}</option>`
                  ).join('')}
                </select>

                ${
                  showQuickSearch
                    ? `
                      <input
                        id="sitioDetailQuickSearch"
                        type="search"
                        data-action="change-sitio-detail-search"
                        aria-label="Filtrar sede"
                        placeholder="Filtrar sede..."
                        value="${escapeHtml(searchQuery)}"
                        class="h-7 w-full sm:w-44 px-2.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
                      />
                    `
                    : ''
                }

                <span
                  data-testid="sitio-visible-count"
                  class="ml-auto text-[11px] font-medium text-slate-500 tabular-nums whitespace-nowrap"
                >
                  Mostrando ${visibleItems.length} de ${model.totalSitesCount}
                </span>
              </div>

              ${
                visibleItems.length === 0
                  ? `
                    <div
                      data-testid="sitio-filter-empty-state"
                      class="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 flex items-center justify-between gap-2 text-xs text-slate-600"
                    >
                      <span>Sin sitios que coincidan con el filtro aplicado.</span>
                      <button
                        type="button"
                        data-action="reset-sitio-detail-filters"
                        class="text-xs font-semibold text-indigo-700 hover:text-indigo-900 hover:underline cursor-pointer shrink-0"
                      >
                        Limpiar filtros
                      </button>
                    </div>
                  `
                  : `
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-1.5 ${gridScrollClass}">
                      ${visibleItems
                        .map((item) =>
                          renderSiteAssignmentRow({
                            audit,
                            item,
                            savingSiteToggleKey: state.savingSiteToggleKey,
                            isStaff,
                          })
                        )
                        .join('')}
                    </div>
                  `
              }
            `
        }
      </div>
    `;
  }

  return `
    <div
      data-testid="sitio-active-audit-card"
      class="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden"
    >
      <section
        data-testid="sitio-audit-section"
        data-audit-id="${escapeHtml(audit.id)}"
        data-is-active="true"
      >
        <div class="px-3.5 py-2.5 flex items-center justify-between gap-2 bg-slate-50/70">
          <button
            type="button"
            data-action="toggle-sitio-panel-collapse"
            data-audit-id="${escapeHtml(audit.id)}"
            aria-expanded="${isExpanded ? 'true' : 'false'}"
            aria-controls="${escapeHtml(panelBodyId)}"
            class="min-w-0 flex-1 flex items-center gap-2 text-left cursor-pointer group focus:outline-none"
          >
            <span
              aria-hidden="true"
              class="inline-flex items-center justify-center w-5 h-5 rounded border border-slate-200 bg-white group-hover:bg-slate-100 text-[10px] font-bold text-slate-600 shrink-0"
            >
              ${isExpanded ? '▼' : '▶'}
            </span>
            <span class="text-xs font-bold text-slate-900 truncate">
              Sitios permanentes asignados
            </span>
            <span class="ml-auto sm:ml-2 text-xs font-semibold text-slate-700 tabular-nums whitespace-nowrap">
              ${model.selectedCount} / ${model.totalSitesCount} sitio${
                model.totalSitesCount === 1 ? '' : 's'
              }
            </span>
          </button>

          <button
            type="button"
            data-action="open-sitio-coverage-modal"
            data-cert-id="${escapeHtml(model.certId)}"
            data-audit-id="${escapeHtml(audit.id)}"
            title="Ver cobertura histórica y futura (${model.coveredUniqueCount}/${model.totalSitesCount})"
            class="px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap tabular-nums shrink-0 ${coverageBtnClass}"
          >
            Cobertura
          </button>
        </div>
        ${expandedBodyHtml}
      </section>
    </div>
  `;
}

function renderCoverageModalHtml(opts: {
  state: DesignacionSitioViewState;
  allAudits: ReadonlyArray<ProgramacionAuditEntity>;
  certificados: ReadonlyArray<CertificadoDetailEntity>;
  isStaff: boolean;
}): string {
  const { state, allAudits, certificados, isStaff } = opts;
  if (!state.coverageModalAuditId && !state.coverageModalCertId) return '';

  const targetAudit =
    (state.coverageModalAuditId
      ? allAudits.find((a) => !a.deleted_at && a.id === state.coverageModalAuditId)
      : null) ??
    (state.coverageModalCertId
      ? allAudits.find((a) => !a.deleted_at && a.id_certificado === state.coverageModalCertId)
      : null);

  if (!targetAudit) return '';

  const candidateSites = getCandidateSitesForAudit(targetAudit, certificados);
  const model = buildSiteCoverageModalModel({
    currentAudit: targetAudit,
    certificateSites: candidateSites,
    allAudits,
    sortMode: state.coverageSortMode || 'SITE_NUMBER',
    windowOffset: state.coverageWindowOffset || 0,
    maxVisibleCols: 6,
    isStaff,
  });

  const visibleCols = model.visibleAuditColumns;
  const colCount = visibleCols.length;
  const auditColWidthPct =
    colCount > 0 ? Math.floor((52 / colCount) * 100) / 100 : 0;
  const lastAuditColWidthPct =
    colCount > 0
      ? Number((52 - auditColWidthPct * (colCount - 1)).toFixed(2))
      : 0;

  const colgroupHtml =
    colCount > 0
      ? `
        <colgroup>
          <col style="width: 30%">
          <col style="width: 18%">
          ${visibleCols
            .map((_, idx) => {
              const w = idx === colCount - 1 ? lastAuditColWidthPct : auditColWidthPct;
              return `<col style="width: ${w}%">`;
            })
            .join('')}
        </colgroup>
      `
      : `
        <colgroup>
          <col style="width: 60%">
          <col style="width: 40%">
        </colgroup>
      `;

  const phaseLabel = (phase: 'PAST' | 'CURRENT' | 'FUTURE'): string =>
    phase === 'PAST' ? 'Pasada' : phase === 'CURRENT' ? 'Actual ★' : 'Futura';

  const phaseHeaderClass = (phase: 'PAST' | 'CURRENT' | 'FUTURE'): string =>
    phase === 'CURRENT'
      ? 'bg-indigo-50 text-indigo-900'
      : phase === 'FUTURE'
      ? 'bg-sky-50/70 text-sky-900'
      : 'bg-slate-50 text-slate-600';

  return `
    <div
      id="sitioCoverageModal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sitioCoverageModalTitle"
      class="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[1px] flex items-center justify-center p-3 sm:p-5"
    >
      <div class="w-full max-w-5xl max-h-[90vh] rounded-2xl border border-slate-200 bg-white shadow-xl flex flex-col overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-200 bg-slate-50/80 flex items-start justify-between gap-3">
          <div class="min-w-0 space-y-0.5">
            <h3 id="sitioCoverageModalTitle" class="text-sm font-bold text-slate-900">
              Cobertura Histórica y Futura de Sitios
            </h3>
            <p class="text-xs text-slate-600 truncate" title="${escapeHtml(
              `${model.organizacionNombre} · ${getAuditCodenameTooltip(model.currentAudit)}`
            )}">
              <span class="font-mono font-bold text-slate-800">${escapeHtml(model.certNumero)}</span>
              ${
                model.versionNumero
                  ? ` <span class="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">v${model.versionNumero}</span>`
                  : ''
              }
              · ${escapeHtml(
                resolveShortOrganizacionName({
                  nombre: model.organizacionNombre,
                  abreviacion: model.organizacionAbreviacion,
                })
              )}
              · <span title="${escapeHtml(getAuditCodenameTooltip(model.currentAudit))}">${escapeHtml(
                formatAuditCodename(model.currentAudit)
              )}</span>
            </p>
          </div>
          <button
            type="button"
            data-action="close-sitio-coverage-modal"
            title="Cerrar cobertura de sitios"
            aria-label="Cerrar cobertura de sitios"
            class="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-bold text-slate-600 cursor-pointer shrink-0"
          >
            ✕
          </button>
        </div>

        <div class="px-4 py-2.5 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums">
            <span class="text-slate-600">
              Total sedes: <strong class="text-slate-900">${model.totalSitesCount}</strong>
            </span>
            <span class="text-slate-600">
              Auditadas (pasado): <strong class="text-emerald-700">${model.pastCoveredSitesCount}</strong>
            </span>
            <span class="text-slate-600">
              Auditoría actual: <strong class="text-indigo-700">${model.currentAssignedCount}</strong>
            </span>
            <span class="text-slate-600">
              Prog. futuro: <strong class="text-sky-700">${model.futureScheduledSitesCount}</strong>
            </span>
            <span class="${
              model.unvisitedSitesCount > 0 ? 'text-amber-800 font-semibold' : 'text-emerald-700 font-semibold'
            }">
              Sin visitar: <strong>${model.unvisitedSitesCount}</strong>
            </span>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <label for="sitioCoverageSortSelect" class="text-[11px] font-semibold text-slate-600 whitespace-nowrap">
              Ordenar:
            </label>
            <select
              id="sitioCoverageSortSelect"
              data-action="change-sitio-coverage-sort"
              aria-label="Ordenar sitios en cobertura"
              class="h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-900 focus:border-slate-900 focus:outline-none"
            >
              ${SITE_COVERAGE_SORT_OPTIONS.map(
                (opt) =>
                  `<option value="${opt.value}" ${
                    opt.value === model.sortMode ? 'selected' : ''
                  }>${escapeHtml(opt.label)}</option>`
              ).join('')}
            </select>

            ${
              model.allAuditColumns.length > model.visibleAuditColumns.length
                ? `
                  <div class="inline-flex items-center gap-1">
                    <button
                      type="button"
                      data-action="page-sitio-coverage-window"
                      data-delta="-1"
                      aria-label="Auditorías anteriores del certificado"
                      ${!model.canPagePrev ? 'disabled' : ''}
                      class="w-7 h-7 inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700 disabled:opacity-40 cursor-pointer"
                    >
                      ◀
                    </button>
                    <button
                      type="button"
                      data-action="page-sitio-coverage-window"
                      data-delta="1"
                      aria-label="Auditorías siguientes del certificado"
                      ${!model.canPageNext ? 'disabled' : ''}
                      class="w-7 h-7 inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700 disabled:opacity-40 cursor-pointer"
                    >
                      ▶
                    </button>
                  </div>
                `
                : ''
            }
          </div>
        </div>

        <div class="flex-1 overflow-auto p-4 space-y-3">
          ${
            state.editErrorMessage
              ? `
                <div role="alert" data-testid="sitio-modal-alert" class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-800 flex items-center gap-2">
                  <span aria-hidden="true">⚠️</span>
                  <span>${escapeHtml(state.editErrorMessage)}</span>
                </div>
              `
              : ''
          }
          ${
            model.rows.length === 0
              ? `
                <div class="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-500">
                  Este certificado no tiene sitios permanentes registrados.
                </div>
              `
              : `
                <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                  <table id="sitioCoverageTable" class="w-full min-w-[640px] table-fixed text-left border-collapse">
                    ${colgroupHtml}
                    <thead class="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th scope="col" class="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                          Sitio
                        </th>
                        <th scope="col" class="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                          Cobertura
                        </th>
                        ${visibleCols
                          .map((col) => {
                            const headerCodename = col.codename || `${col.yearLabel} · ${col.auditTypeLabel}`;
                            const headerTitle = `${col.codenameTooltip || col.auditCode} · ${col.dateLabel}`;
                            return `
                              <th
                                scope="col"
                                class="px-2 py-2 text-center border-l border-slate-200 ${phaseHeaderClass(
                                  col.temporalPhase
                                )}"
                                title="${escapeHtml(headerTitle)}"
                              >
                                <div class="text-[10px] font-bold uppercase tracking-wider leading-tight">
                                  ${escapeHtml(phaseLabel(col.temporalPhase))}
                                </div>
                                <div class="text-[11px] font-bold text-slate-900 leading-tight truncate tabular-nums">
                                  ${escapeHtml(headerCodename)}
                                </div>
                              </th>
                            `;
                          })
                          .join('')}
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 text-xs">
                      ${model.rows
                        .map((row) => {
                          const isUnvisited = row.coverageStatus === 'SIN_COBERTURA';
                          const rowHighlight = isUnvisited
                            ? 'bg-amber-50/40 hover:bg-amber-50/70'
                            : row.isAssignedCurrent
                            ? 'bg-indigo-50/20 hover:bg-indigo-50/40'
                            : 'hover:bg-slate-50/80';

                          return `
                            <tr
                              data-testid="coverage-modal-row"
                              data-site-number="${row.site.numero_sitio}"
                              data-coverage-status="${row.coverageStatus}"
                              class="${rowHighlight} transition-colors"
                            >
                              <td class="px-3 py-2 align-middle">
                                <div class="min-w-0 space-y-0.5">
                                  <div class="flex items-center gap-1.5 min-w-0">
                                    <span class="font-mono text-[10px] font-bold text-slate-500 shrink-0">${
                                      row.isPrincipalHq ? 'Sitio 0' : `#${row.site.numero_sitio}`
                                    }</span>
                                    <span class="font-semibold text-slate-900 truncate" title="${escapeHtml(
                                      row.site.nombre_sitio
                                    )}">${escapeHtml(row.site.nombre_sitio)}</span>
                                    ${
                                      row.site.sharedFromCertId
                                        ? `<span title="${escapeHtml(
                                            `Compartido desde ${safeShortLabel(
                                              row.site.sharedFromCertLabel,
                                              'Certificado origen'
                                            )}`
                                          )}" class="px-1.5 py-0 rounded bg-slate-100 text-slate-600 border border-slate-200 text-[9px] font-medium shrink-0">Compartido</span>`
                                        : ''
                                    }
                                  </div>
                                  <div class="text-[11px] text-slate-500 truncate">
                                    ${escapeHtml(
                                      row.site.direccion_sitio || 'Dirección sin especificar'
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td class="px-3 py-2 align-middle">
                                <div class="space-y-0.5">
                                  <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${row.coverageBadgeClass} whitespace-nowrap">
                                    ${escapeHtml(row.coverageBadgeLabel)}
                                  </span>
                                  <div class="text-[10px] text-slate-500 truncate" title="${escapeHtml(
                                    row.lastAuditedLabel
                                  )}">
                                    ${escapeHtml(
                                      row.pastVisitCount > 0
                                        ? `${row.pastVisitCount} prev. · ${row.lastAuditedLabel}`
                                        : row.futureVisitCount > 0
                                        ? `Próx: ${row.nextScheduledLabel}`
                                        : 'Nunca auditado'
                                    )}
                                  </div>
                                </div>
                              </td>
                              ${row.cells
                                .map((cell) => {
                                  if (cell.isCurrentAudit) {
                                    const modalChkId = `modalSiteChk_${model.currentAudit.id}_${row.site.id}`;
                                    const isSaving =
                                      state.savingSiteToggleKey ===
                                      `${model.currentAudit.id}:${row.site.id}`;
                                    const disabled = !row.canToggleCurrent || isSaving;
                                    return `
                                      <td class="px-2 py-2 align-middle text-center border-l border-slate-100 bg-indigo-50/25">
                                        <label
                                          for="${escapeHtml(modalChkId)}"
                                          class="inline-flex flex-col items-center justify-center gap-0.5 ${
                                            disabled ? 'cursor-not-allowed' : 'cursor-pointer'
                                          }"
                                        >
                                          <input
                                            type="checkbox"
                                            id="${escapeHtml(modalChkId)}"
                                            data-action="toggle-step4-site"
                                            data-audit-id="${escapeHtml(model.currentAudit.id)}"
                                            data-site-id="${escapeHtml(row.site.id)}"
                                            data-sitio-auditoria-id="${escapeHtml(
                                              row.sitioAuditoriaId || ''
                                            )}"
                                            data-currently-selected="${
                                              row.isAssignedCurrent ? 'true' : 'false'
                                            }"
                                            data-hq-locked="${row.isPrincipalHq ? 'true' : 'false'}"
                                            ${row.isAssignedCurrent ? 'checked' : ''}
                                            ${disabled ? 'disabled' : ''}
                                            aria-label="Incluir ${escapeHtml(
                                              row.site.nombre_sitio
                                            )} en ${escapeHtml(formatAuditCodename(model.currentAudit))}"
                                            class="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                          />
                                          <span class="text-[10px] font-semibold ${
                                            row.isPrincipalHq
                                              ? 'text-slate-600'
                                              : row.isAssignedCurrent
                                              ? 'text-indigo-700'
                                              : 'text-slate-400'
                                          }">
                                            ${
                                              row.isPrincipalHq
                                                ? '🔒 HQ'
                                                : row.isAssignedCurrent
                                                ? 'Asignado'
                                                : 'Libre'
                                            }
                                          </span>
                                        </label>
                                      </td>
                                    `;
                                  }

                                  return `
                                    <td class="px-2 py-2 align-middle text-center border-l border-slate-100">
                                      <span
                                        title="${escapeHtml(
                                          `${cell.codenameTooltip || cell.auditCode} · ${cell.dateLabel}`
                                        )}"
                                        class="inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold ${cell.badgeClass} whitespace-nowrap"
                                      >
                                        ${escapeHtml(cell.shortTag)}
                                      </span>
                                    </td>
                                  `;
                                })
                                .join('')}
                            </tr>
                          `;
                        })
                        .join('')}
                    </tbody>
                  </table>
                </div>
              `
          }
        </div>

        <div class="px-4 py-2.5 border-t border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
          <div class="flex flex-wrap items-center gap-3">
            <span><strong class="text-emerald-700">✓ Aud.</strong> Pasado</span>
            <span><strong class="text-indigo-700">● Asignado</strong> Actual</span>
            <span><strong class="text-sky-700">📅 Prog.</strong> Futuro</span>
            <span><strong class="text-amber-700">Sin visitar</strong> Pendiente de cobertura</span>
          </div>
          <button
            type="button"
            data-action="close-sitio-coverage-modal"
            class="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderSitioDetailView(opts: {
  state: DesignacionSitioViewState;
  certRow: CertificateSitioRow;
  effectiveAuditId: string | null;
  allAudits: ReadonlyArray<ProgramacionAuditEntity>;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  certificados: ReadonlyArray<CertificadoDetailEntity>;
  isStaff: boolean;
  referenceIsoDate?: string;
  inCardBreadcrumbHtml?: string;
  headerAddAuditHtml?: string;
}): string {
  const {
    state,
    certRow,
    effectiveAuditId,
    allAudits,
    programs,
    certificados,
    isStaff,
    referenceIsoDate,
    inCardBreadcrumbHtml = '',
    headerAddAuditHtml = '',
  } = opts;

  const navigation = resolveAuditNavigation(
    certRow.certId,
    effectiveAuditId,
    allAudits
  );
  const activeAudit = navigation.activeAudit;
  const linkedCtx = getLinkedSiblingAudits(activeAudit, allAudits, programs);

  const lastAddedPlanned = activeAudit
    ? resolveLastAddedPlannedDate(activeAudit.fechas) ??
      (activeAudit.latestDate &&
      !activeAudit.latestDate.deleted_at &&
      activeAudit.latestDate.tipo_fecha !== 'REAL'
        ? activeAudit.latestDate
        : null)
    : null;
  const lastAddedPlannedLabel = lastAddedPlanned
    ? formatAuditDateLabel(lastAddedPlanned)
    : activeAudit?.fecha_inicio
    ? activeAudit.fecha_inicio.slice(0, 10)
    : 'Sin fecha programada';

  const urgency = activeAudit
    ? computeAuditUrgencyClassification(
        lastAddedPlanned,
        activeAudit.estado_ciclo || 'Borrador',
        referenceIsoDate
      )
    : certRow.urgency;
  const futureWarningMessage = requiresFutureYearWarning(urgency);

  const isModalOpen = Boolean(state.coverageModalAuditId || state.coverageModalCertId);
  const errorBannerHtml =
    state.editErrorMessage && !isModalOpen
      ? `
      <div role="alert" class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-800 flex items-center gap-2">
        <span aria-hidden="true">⚠️</span>
        <span>${escapeHtml(state.editErrorMessage)}</span>
      </div>
    `
      : '';

  const activeModel = buildActiveSitioAuditModel({
    activeAudit,
    allAudits,
    programs,
    getCandidateSites: (aud) => getCandidateSitesForAudit(aud, certificados),
    isStaff,
  });
  const siblingsCount = linkedCtx.siblings.length;

  const bodyHtml =
    activeAudit && activeModel
      ? renderActiveAuditSiteCard({
          model: activeModel,
          allAudits,
          siblingsCount,
          state,
          isStaff,
        })
      : '';

  const coverageModalHtml = renderCoverageModalHtml({
    state,
    allAudits,
    certificados,
    isStaff,
  });

  return renderAuditSectionShell({
    sectionTitle: 'Sitio',
    sectionSymbol: '📍',
    backSubview: 'designacion/sitio',
    lastAddedPlannedLabel,
    certInfo: {
      id: certRow.certId,
      id_organizacion: certRow.id_organizacion ?? activeAudit?.id_organizacion ?? null,
      numero_certificado: certRow.numero_certificado,
      organizacion_nombre: certRow.organizacion_nombre,
      organizacion_abreviacion: certRow.organizacion_abreviacion ?? null,
      norma_codigo: certRow.norma_codigo,
      estatus: certRow.estatus,
      version_numero: certRow.activeVersionNumero ?? null,
      alcance_es: certRow.alcance_es ?? null,
      alcance_en: certRow.alcance_en ?? null,
      hasAlcance: certRow.hasAlcance,
    },
    certificados,
    navigation,
    programs,
    linkedSiblings: linkedCtx.siblings,
    showLinkedSiblings: siblingsCount > 1,
    isStaff,
    inCardBreadcrumbHtml,
    headerAddAuditHtml,
    tableName: 'auditoria_sitio',
    feedbackHtml: errorBannerHtml,
    futureWarningMessage,
    bodyHtml,
    modalsHtml: coverageModalHtml,
  });
}
