import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import type { OrganizacionEntity } from '../lib/activeCertificates';
import type { ConglomeradoEntity } from '../lib/conglomeradoDomain';
import type { TipoAuditoriaCatalogItem } from '../lib/extraDomain';
import {
  formatAuditDateLabel,
  type ProgramaAuditoriaEntity,
} from '../lib/auditPlanningEngine';
import type { ProgramacionAuditEntity } from '../lib/auditExecution';
import {
  getLinkedSiblingAudits,
  resolveAuditNavigation,
} from '../lib/certificateAuditSelector';
import { resolveShortOrganizacionName } from '../lib/codenameDomain';
import type { SoftDeletableCertificado, VinculoEntity } from '../lib/vinculoDomain';
import {
  buildOrgCertPickerModalModel,
  buildOrgMultiViewRows,
  type OrgMultiViewRow,
} from '../lib/orgMultiViewPickerDomain';
import {
  buildCertificateTipoRows,
  buildTipoLinkedAuditRows,
  buildTipoOrgFacetCategories,
  computeAuditUrgencyClassification,
  createTipoOrgCertMetaResolver,
  mergeCertSourcesForOrgPicker,
  requiresFutureYearWarning,
  resolveLastAddedPlannedDate,
  type CertificateTipoRow,
  type TipoOrgCertMeta,
  type TipoQueuePreset,
} from '../lib/designacionTipoDomain';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import type { CertificateRecord } from '../lib/searchControls';
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

export type DesignacionTipoSortColumn =
  | 'organizacion'
  | 'certificados'
  | 'auditorias'
  | 'tipo'
  | 'urgencia'
  | 'certificado'
  | 'estatus_cert'
  | 'fecha_vigente';

export interface DesignacionTipoViewState {
  query: string;
  viewMode: UniversalViewMode;
  isSidebarOpen: boolean;
  sortColumn: DesignacionTipoSortColumn | null;
  sortDirection: SortDirection;
  facetSelections: MultiViewSelectionMap;
  selectedCertId: string | null;
  selectedAuditId: string | null;
  pickerOrgId?: string | null;
  pickerSearchQuery?: string;
  selectedProgramId?: string | null;
  queuePreset?: TipoQueuePreset;
  savingAuditId?: string | null;
  editErrorMessage: string | null;
}

export const DEFAULT_DESIGNACION_TIPO_STATE: DesignacionTipoViewState = {
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
  savingAuditId: null,
  editErrorMessage: null,
};

export interface DesignacionTipoViewProps {
  profile: UserProfile;
  state: DesignacionTipoViewState;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  audits?: ReadonlyArray<ProgramacionAuditEntity>;
  vinculos?: ReadonlyArray<VinculoEntity>;
  conglomerados?: ReadonlyArray<ConglomeradoEntity>;
  certificados?: ReadonlyArray<SoftDeletableCertificado | CertificadoDetailEntity>;
  certificates?: ReadonlyArray<CertificateRecord>;
  organizaciones?: ReadonlyArray<OrganizacionEntity>;
  authorizedClientOrgIds?: ReadonlyArray<string>;
  tiposCatalog: ReadonlyArray<TipoAuditoriaCatalogItem>;
  referenceIsoDate?: string;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
  inCardBreadcrumbHtml?: string;
  headerAddAuditHtml?: string;
}

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

export function renderDesignacionTipoView(props: DesignacionTipoViewProps): string {
  const {
    profile,
    state,
    programs,
    audits: auditsProp,
    vinculos = [],
    conglomerados = [],
    certificados = [],
    certificates = [],
    organizaciones = [],
    authorizedClientOrgIds = [],
    tiposCatalog,
    referenceIsoDate,
    loading = false,
    archiveConfig,
    tableColumnWidths,
    inCardBreadcrumbHtml = '',
    headerAddAuditHtml = '',
  } = props;

  const isStaff = isApprovedStaffProfile(profile);
  const activeTipos = tiposCatalog.filter((t) => !t.deleted_at);
  const auditsPool = mergeAuditsPool(programs, auditsProp);

  const softCerts: SoftDeletableCertificado[] = certificados.map((c) => ({
    ...c,
    deleted_at: 'deleted_at' in c ? c.deleted_at ?? null : null,
  }));
  const detailedForSelector = softCerts.filter((c) => !c.deleted_at);

  const allRows = buildCertificateTipoRows({
    certificates,
    detailedCerts: detailedForSelector,
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
      return renderTipoDetailView({
        state,
        certRow,
        effectiveAuditId,
        audits: auditsPool,
        programs,
        certificados: detailedForSelector,
        tiposCatalog: activeTipos,
        isStaff,
        referenceIsoDate,
        inCardBreadcrumbHtml,
        headerAddAuditHtml,
      });
    }
  }

  const mergedCerts = mergeCertSourcesForOrgPicker({
    certificados: detailedForSelector,
    certificates,
    audits: auditsPool,
    organizaciones,
  });

  const resolveCertMeta = createTipoOrgCertMetaResolver(referenceIsoDate);
  const orgRows = buildOrgMultiViewRows<TipoOrgCertMeta>({
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

  const facetCategories = buildTipoOrgFacetCategories(orgRows);

  const extraColumns: ColumnDefinition<OrgMultiViewRow<TipoOrgCertMeta>>[] = [
    {
      id: 'tipo',
      header: 'Tipo / Ventana Vigente',
      defaultWidthPct: 26,
      minWidthPx: 165,
      sortable: true,
      getValue: (row) => {
        if (row.certificates.length === 0) return 999;
        return Math.min(...row.certificates.map((c) => c.domainExtra.urgency.rank));
      },
      renderCell: (row) => {
        const sortedCerts = row.certificates
          .slice()
          .sort((a, b) => a.domainExtra.urgency.rank - b.domainExtra.urgency.rank);
        const lead = sortedCerts[0]?.domainExtra;
        if (!lead) {
          return '<span class="text-[11px] text-slate-400">Sin certificados</span>';
        }
        const definedCount = row.certificates.filter(
          (c) => c.domainExtra.hasTipoDefined
        ).length;
        return `
          <div class="min-w-0 space-y-0.5">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${lead.urgency.badgeClass}">
                ${escapeHtml(lead.urgency.label)}
              </span>
              <span class="text-xs font-bold ${lead.hasTipoDefined ? 'text-slate-900' : 'text-amber-700'} truncate" title="${escapeHtml(lead.latestTipoAudit)}">
                ${escapeHtml(lead.latestTipoAudit)}
              </span>
            </div>
            <div class="text-[11px] text-slate-500 truncate tabular-nums">
              ${definedCount} de ${row.certsCount} con tipo definido
            </div>
          </div>
        `;
      },
    },
  ];

  const renderCardExtra = (row: OrgMultiViewRow<TipoOrgCertMeta>): string => {
    const sortedCerts = row.certificates
      .slice()
      .sort((a, b) => a.domainExtra.urgency.rank - b.domainExtra.urgency.rank);
    const lead = sortedCerts[0]?.domainExtra;
    if (!lead) return '';
    return `
      <div class="flex items-center justify-between gap-2 text-[11px]">
        <span class="inline-flex items-center px-2 py-0.5 rounded-full font-bold border whitespace-nowrap ${lead.urgency.badgeClass}">
          ${escapeHtml(lead.urgency.label)}
        </span>
        <span class="font-semibold ${lead.hasTipoDefined ? 'text-slate-800' : 'text-amber-700'} truncate">
          ${escapeHtml(lead.latestTipoAudit)}
        </span>
      </div>
    `;
  };

  const pickerModel = state.pickerOrgId
    ? buildOrgCertPickerModalModel<TipoOrgCertMeta>({
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

  const pickerDomainColumns: OrgPickerDomainColumn<TipoOrgCertMeta>[] = [
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
    {
      id: 'tipo_asignado',
      header: 'Tipo Asignado',
      defaultWidthPct: 24,
      minWidthPx: 150,
      renderCell: (row) => {
        const meta = row.domainExtra;
        return `
          <div class="min-w-0 space-y-0.5">
            <div class="text-xs font-bold ${meta.hasTipoDefined ? 'text-slate-900' : 'text-amber-700'} truncate" title="${escapeHtml(meta.latestTipoAudit)}">
              ${escapeHtml(meta.latestTipoAudit)}
            </div>
            <div class="text-[11px] text-slate-500 truncate">
              ${escapeHtml(meta.latestDateSummary)}
            </div>
          </div>
        `;
      },
    },
  ];

  const pickerModalHtml = pickerModel
    ? renderOrgCertPickerModal<TipoOrgCertMeta>({
        model: pickerModel,
        domainColumns: pickerDomainColumns,
        subtitle:
          'Seleccione un certificado (agrupado por auditoría vinculada) para definir o ajustar su Tipo de Auditoría.',
        emptySearchMessage:
          'No se encontraron certificados ni auditorías que coincidan con la búsqueda en esta organización.',
      })
    : '';

  const archiveProps = extractUniversalArchiveProps(archiveConfig, 'programacion');

  return renderOrgMultiView<TipoOrgCertMeta>({
    domainKey: 'designacion-tipo',
    tableId: 'designacion-tipo-main',
    title: 'Designación → Tipo de Auditoría',
    subtitle:
      'Sub-paso 1.2 por organización: abra una organización para seleccionar su certificado y asignar el tipo de auditoría.',
    entityLabel: 'organizaciones',
    groupingMode: 'audit',
    rows: orgRows,
    searchQuery: state.query,
    searchPlaceholder:
      'Buscar organización, conglomerado, certificado, norma, tipo o código...',
    searchInputId: 'designacion-tipoSearchInput',
    clearSearchBtnId: 'clearDesignacionTipoSearchBtn',
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen,
    sortState: { column: state.sortColumn, direction: state.sortDirection },
    columnWidths: tableColumnWidths?.['designacion-tipo-main'],
    facetCategories,
    facetSelections: state.facetSelections,
    extraColumns,
    renderCardExtra,
    actionsHtml: isStaff ? headerAddAuditHtml : '',
    loading,
    emptyStateTitle: 'Sin organizaciones disponibles en Designación → Tipo',
    emptyStateMessage:
      'Use "+ Auditoría" para programar la primera auditoría y designar su tipo.',
    pickerModalHtml,
    ...archiveProps,
  });
}

function renderTipoDetailView(opts: {
  state: DesignacionTipoViewState;
  certRow: CertificateTipoRow;
  effectiveAuditId: string | null;
  audits: ReadonlyArray<ProgramacionAuditEntity>;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  certificados: ReadonlyArray<SoftDeletableCertificado>;
  tiposCatalog: ReadonlyArray<TipoAuditoriaCatalogItem>;
  isStaff: boolean;
  referenceIsoDate?: string;
  inCardBreadcrumbHtml?: string;
  headerAddAuditHtml?: string;
}): string {
  const {
    state,
    certRow,
    effectiveAuditId,
    audits,
    programs,
    certificados,
    tiposCatalog,
    isStaff,
    referenceIsoDate,
    inCardBreadcrumbHtml = '',
    headerAddAuditHtml = '',
  } = opts;

  const fullDetailedCerts = certificados.filter(
    (c): c is CertificadoDetailEntity & { deleted_at?: string | null } =>
      !c.deleted_at && 'sitios' in c && Array.isArray(c.sitios)
  );
  const navigation = resolveAuditNavigation(
    certRow.certId,
    effectiveAuditId,
    audits
  );
  const activeAudit = navigation.activeAudit;
  const linkedCtx = getLinkedSiblingAudits(activeAudit, audits, programs);
  const linkedRows = buildTipoLinkedAuditRows(activeAudit, audits, programs, certificados);
  const siblingsCount = linkedRows.length;
  const missingAlcanceRows = linkedRows.filter((r) => !r.hasAlcance);

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

  const errorBannerHtml = state.editErrorMessage
    ? `
      <div role="alert" class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-800 flex items-center gap-2">
        <span aria-hidden="true">⚠️</span>
        <span>${escapeHtml(state.editErrorMessage)}</span>
      </div>
    `
    : '';

  const toolbarHtml = activeAudit
    ? `
      <div
        data-testid="tipo-editor-toolbar"
        class="flex flex-wrap items-center justify-between gap-2 pb-1"
      >
        <div class="flex flex-wrap items-center gap-2 min-w-0">
          <h2 class="text-xs font-bold uppercase tracking-wider text-slate-700">
            ${siblingsCount > 1 ? 'Tipo por Auditoría Vinculada' : 'Tipo de Auditoría'}
          </h2>
          ${
            siblingsCount > 1
              ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-[11px] font-semibold text-indigo-800 whitespace-nowrap">${siblingsCount} vinculadas · Asignación individual</span>`
              : ''
          }
        </div>
      </div>
    `
    : '';

  const detailTableHtml = activeAudit
    ? `
      <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
        <table id="designacion-tipo-detail-table" class="w-full min-w-[520px] sm:min-w-0 table-fixed text-left border-collapse">
          <colgroup>
            <col style="width: 40%">
            <col style="width: 24%">
            <col style="width: 36%">
          </colgroup>
          <thead class="bg-slate-50 border-b border-slate-200">
            <tr>
              <th scope="col" class="px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Certificado &amp; Auditoría
              </th>
              <th scope="col" class="px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Fecha
              </th>
              <th scope="col" class="px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Tipo de Auditoría
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 text-xs">
            ${linkedRows
              .map((row) => {
                const aud = row.audit;
                const isSavingThis = state.savingAuditId === aud.id;
                const hasMatchedOption = tiposCatalog.some(
                  (t) =>
                    (aud.id_tipo_auditoria && aud.id_tipo_auditoria === t.id) ||
                    (!aud.id_tipo_auditoria && aud.tipo_auditoria === t.tipo)
                );

                return `
                  <tr
                    data-testid="tipo-audit-row"
                    data-audit-id="${escapeHtml(aud.id)}"
                    data-is-active="${row.isActive ? 'true' : 'false'}"
                    class="${
                      row.isActive && siblingsCount > 1
                        ? 'bg-indigo-50/35 hover:bg-indigo-50/55'
                        : 'hover:bg-slate-50/80'
                    } transition-colors"
                  >
                    <td class="px-3.5 py-2.5 align-middle">
                      <div class="min-w-0 space-y-0.5">
                        <div class="flex flex-wrap items-center gap-1.5 min-w-0">
                          ${
                            row.isActive && siblingsCount > 1
                              ? '<span class="px-1.5 py-0.2 rounded bg-slate-900 text-white text-[10px] font-bold shrink-0">Activa</span>'
                              : ''
                          }
                          <span class="font-mono text-xs font-bold text-slate-900 truncate">${escapeHtml(row.numero_certificado)}</span>
                          ${
                            row.organizacion_abreviacion
                              ? `<span class="px-1.5 py-0.2 rounded text-[10px] font-bold bg-white text-slate-700 border border-slate-200 shrink-0">${escapeHtml(
                                  row.organizacion_abreviacion
                                )}</span>`
                              : ''
                          }
                          ${
                            row.version_numero
                              ? `<span class="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0">v${row.version_numero}</span>`
                              : ''
                          }
                          <span class="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                            ${escapeHtml(row.norma_codigo)}
                          </span>
                          <span
                            title="${escapeHtml(row.codenameTooltip)}"
                            class="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-white text-slate-700 border border-slate-200 shrink-0"
                          >
                            ${escapeHtml(row.codename)}
                          </span>
                          ${
                            !row.hasAlcance
                              ? `<span class="px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200 shrink-0">Sin alcance</span>`
                              : ''
                          }
                        </div>
                        <div class="text-[11px] text-slate-500 truncate" title="${escapeHtml(row.organizacion_nombre)}">
                          ${escapeHtml(
                            resolveShortOrganizacionName({
                              nombre: row.organizacion_nombre,
                              abreviacion: row.organizacion_abreviacion,
                            })
                          )}
                        </div>
                      </div>
                    </td>
                    <td class="px-3.5 py-2.5 align-middle">
                      <div class="min-w-0 space-y-0.5">
                        <div class="text-xs font-semibold text-slate-800 truncate" title="${escapeHtml(row.dateSummary)}">
                          ${escapeHtml(row.dateSummary)}
                        </div>
                        <div class="text-[11px] text-slate-500 truncate">${escapeHtml(row.estado_ciclo)}</div>
                      </div>
                    </td>
                    <td class="px-3.5 py-2.5 align-middle">
                      ${
                        isStaff
                          ? `
                            <div class="space-y-1">
                              <select
                                id="step3InlineTipo_${escapeHtml(aud.id)}"
                                data-action="change-step3-audit-tipo"
                                data-audit-id="${escapeHtml(aud.id)}"
                                aria-label="Tipo de auditoría para ${escapeHtml(row.numero_certificado)} (${escapeHtml(row.codename)})"
                                ${isSavingThis || !row.hasAlcance ? 'disabled' : ''}
                                ${isSavingThis ? 'aria-busy="true"' : ''}
                                title="${escapeHtml(
                                  !row.hasAlcance
                                    ? 'Defina o comparta un Alcance en Certificación → Certificado → Alcance antes de asignar o modificar auditorías.'
                                    : 'Seleccionar tipo de auditoría'
                                )}"
                                class="w-full h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-900 focus:border-slate-900 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                              >
                                <option value="" disabled ${!hasMatchedOption ? 'selected' : ''}>Seleccionar tipo...</option>
                                ${tiposCatalog
                                  .map((t) => {
                                    const selected =
                                      (aud.id_tipo_auditoria && aud.id_tipo_auditoria === t.id) ||
                                      (!aud.id_tipo_auditoria && aud.tipo_auditoria === t.tipo);
                                    return `<option value="${escapeHtml(t.id)}" ${
                                      selected ? 'selected' : ''
                                    }>${escapeHtml(t.tipo)}</option>`;
                                  })
                                  .join('')}
                              </select>
                              ${
                                isSavingThis
                                  ? '<span class="block text-[10px] font-semibold text-indigo-700">Guardando...</span>'
                                  : !row.hasAlcance
                                  ? '<span class="block text-[10px] font-semibold text-rose-700">Bloqueado: sin Alcance activo</span>'
                                  : ''
                              }
                            </div>
                          `
                          : `
                            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                              row.hasTipoDefined
                                ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                : 'bg-amber-50 text-amber-800 border-amber-200'
                            } whitespace-nowrap">
                              ${escapeHtml(row.tipo_auditoria)}
                            </span>
                          `
                      }
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

  const missingAlcanceAlertHtml =
    missingAlcanceRows.length > 0
      ? `
        <div role="alert" data-testid="tipo-alcance-blocker" class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-900 space-y-1">
          <p>🚫 Uno o más certificados no poseen un Alcance activo en Certificación → Certificado → Alcance. La asignación de tipo está bloqueada hasta definir o compartir su Alcance:</p>
          <p class="text-[11px] font-mono text-rose-800">${escapeHtml(
            missingAlcanceRows
              .map((r) =>
                r.organizacion_abreviacion
                  ? `${r.numero_certificado} (${r.organizacion_abreviacion})`
                  : r.numero_certificado
              )
              .join(', ')
          )}</p>
        </div>
      `
      : '';

  const bodyHtml = activeAudit
    ? `
      <div class="space-y-3">
        ${missingAlcanceAlertHtml}
        ${toolbarHtml}
        ${detailTableHtml}
      </div>
    `
    : '';

  return renderAuditSectionShell({
    sectionTitle: 'Designación → Tipo',
    sectionSymbol: '🏷️',
    backSubview: 'designacion/tipo',
    compactMode: true,
    lastAddedPlannedLabel,
    certInfo: {
      id: certRow.certId,
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
    certificados: fullDetailedCerts,
    navigation,
    programs,
    linkedSiblings: linkedCtx.siblings,
    showLinkedSiblings: siblingsCount > 1,
    isStaff,
    inCardBreadcrumbHtml,
    headerAddAuditHtml,
    tableName: 'auditoria',
    feedbackHtml: errorBannerHtml,
    futureWarningMessage,
    bodyHtml,
  });
}
