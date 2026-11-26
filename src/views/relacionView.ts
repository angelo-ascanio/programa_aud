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
  buildOrgCertPickerModalModel,
  buildOrgMultiViewRows,
  type OrgMultiViewRow,
} from '../lib/orgMultiViewPickerDomain';
import {
  buildRelacionDetailModel,
  buildRelacionOrgFacetCategories,
  createRelacionOrgCertMetaResolver,
  DEFAULT_RELACION_VIEW_STATE,
  type RelacionDetailAuditRow,
  type RelacionDetailModel,
  type RelacionOrgCertMeta,
  type RelacionSortColumn,
  type RelacionViewState,
} from '../lib/relacionDomain';
import type { ColumnDefinition } from '../lib/universalTemplate';
import {
  extractUniversalArchiveProps,
  type ArchiveMultiViewConfig,
} from '../lib/archiveGovernance';
import {
  renderOrgCertPickerModal,
  renderOrgMultiView,
  type OrgPickerDomainColumn,
} from './orgMultiViewPickerView';
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
 * - Multi View centrada en `Organización` + Pop-up Modal agrupado por Auditoría Vinculada
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

  const isStaff = isApprovedStaffProfile(profile);
  const resolveCertMeta = createRelacionOrgCertMetaResolver();
  const orgRows = buildOrgMultiViewRows<RelacionOrgCertMeta>({
    profile,
    authorizedClientOrgIds,
    conglomerados,
    organizaciones,
    certificados,
    vinculos,
    programs,
    audits,
    resolveCertMeta,
  });

  const facetCategories = buildRelacionOrgFacetCategories(orgRows);

  const extraColumns: ColumnDefinition<OrgMultiViewRow<RelacionOrgCertMeta>>[] = [
    {
      id: 'naturaleza',
      header: 'Relación Predominante',
      defaultWidthPct: 26,
      minWidthPx: 155,
      sortable: true,
      getValue: (row) => row.certificates[0]?.domainExtra.effectiveNature ?? 'Individual',
      renderCell: (row) => {
        const natures = Array.from(
          new Set(row.certificates.map((c) => c.domainExtra.effectiveNature))
        );
        const primaryNature = natures[0] ?? 'Individual';
        const extraNatures = natures.length - 1;
        const customCount = row.certificates.filter(
          (c) => c.domainExtra.isCustomOrFree
        ).length;

        return `
          <div class="min-w-0 space-y-0.5">
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
            <div class="text-[11px] text-slate-500 truncate">
              ${
                customCount > 0
                  ? `${customCount} personalizada / libre`
                  : 'Base Bloque 2 alineada'
              }
            </div>
          </div>
        `;
      },
    },
  ];

  const renderCardExtra = (row: OrgMultiViewRow<RelacionOrgCertMeta>): string => {
    const natures = Array.from(
      new Set(row.certificates.map((c) => c.domainExtra.effectiveNature))
    );
    const primaryNature = natures[0] ?? 'Individual';
    const topAudits = row.certificates
      .map((c) => c.domainExtra)
      .filter((m) => m.hasAudits)
      .slice(0, 2);

    return `
      <div class="space-y-1.5">
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${getNatureBadgeClass(primaryNature)}">
            ${escapeHtml(primaryNature)}
          </span>
          ${
            natures.length > 1
              ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">+${natures.length - 1}</span>`
              : ''
          }
        </div>
        ${
          topAudits.length > 0
            ? `<div class="flex flex-wrap items-center gap-1">
                ${topAudits
                  .map(
                    (m) =>
                      `<span title="${escapeHtml(m.latestAuditTooltip)}" class="px-1.5 py-0.5 rounded font-mono text-[10px] font-bold bg-slate-50 text-slate-800 border border-slate-200">${escapeHtml(m.latestAuditCodename)}</span>`
                  )
                  .join('')}
              </div>`
            : ''
        }
      </div>
    `;
  };

  const pickerModel = state.pickerOrgId
    ? buildOrgCertPickerModalModel<RelacionOrgCertMeta>({
        orgId: state.pickerOrgId,
        modalSearchQuery: state.pickerSearchQuery ?? '',
        groupingMode: 'audit',
        orgRows,
        profile,
        authorizedClientOrgIds,
        conglomerados,
        organizaciones,
        certificados,
        vinculos,
        programs,
        audits,
        resolveCertMeta,
      })
    : null;

  const pickerDomainColumns: OrgPickerDomainColumn<RelacionOrgCertMeta>[] = [
    {
      id: 'ultima_auditoria',
      header: 'Última Auditoría',
      defaultWidthPct: 24,
      minWidthPx: 145,
      renderCell: (row) => {
        const meta = row.domainExtra;
        const cycleBadge = meta.estadoCiclo
          ? `<span class="inline-flex items-center px-1.5 py-0.2 rounded-full text-[10px] font-bold border whitespace-nowrap ${getCycleStatusBadgeClass(meta.estadoCiclo)}">${escapeHtml(meta.estadoCiclo)}</span>`
          : '';
        return `
          <div class="min-w-0 space-y-0.5" title="${escapeHtml(meta.latestAuditTooltip)}">
            <div class="font-mono text-xs font-bold text-slate-900 truncate">
              ${escapeHtml(meta.latestAuditCodename)}
            </div>
            <div class="truncate">${cycleBadge}</div>
          </div>
        `;
      },
    },
    {
      id: 'relacion',
      header: 'Relación',
      defaultWidthPct: 24,
      minWidthPx: 145,
      renderCell: (row) => {
        const meta = row.domainExtra;
        const originLabel = row.vinculo
          ? meta.matchesVinculoBase
            ? 'Base Bloque 2'
            : `Personalizada (base ${meta.baseVinculoNature})`
          : 'Libre';
        return `
          <div class="min-w-0 space-y-0.5">
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${getNatureBadgeClass(meta.effectiveNature)}">
              ${escapeHtml(meta.effectiveNature)}
            </span>
            <div class="text-[11px] text-slate-500 truncate">
              ${escapeHtml(originLabel)}
            </div>
          </div>
        `;
      },
    },
  ];

  const pickerModalHtml = pickerModel
    ? renderOrgCertPickerModal<RelacionOrgCertMeta>({
        model: pickerModel,
        domainColumns: pickerDomainColumns,
        subtitle:
          'Seleccione un certificado (agrupado por auditoría vinculada) para confirmar o ajustar su Relación.',
        emptySearchMessage:
          'No se encontraron certificados ni auditorías que coincidan con la búsqueda en esta organización.',
      })
    : '';

  const archiveProps = extractUniversalArchiveProps(archiveConfig, 'programacion');

  return renderOrgMultiView<RelacionOrgCertMeta>({
    domainKey: 'relacion',
    tableId: 'relacion-main',
    title: 'Relación de Auditorías',
    subtitle: 'Defina la relación de auditoría por organización y certificado.',
    entityLabel: 'organizaciones',
    groupingMode: 'audit',
    rows: orgRows,
    searchQuery: state.query,
    searchPlaceholder:
      'Buscar organización, conglomerado, certificado, norma, código o codename...',
    searchInputId: 'relacionSearchInput',
    clearSearchBtnId: 'clearRelacionSearchBtn',
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen,
    sortState: { column: state.sortColumn, direction: state.sortDirection },
    columnWidths: tableColumnWidths?.['relacion-main'],
    facetCategories,
    facetSelections: state.facetSelections || {},
    extraColumns,
    renderCardExtra,
    actionsHtml: isStaff ? headerAddAuditHtml : '',
    loading,
    emptyStateTitle: 'Sin organizaciones visibles en Relación',
    emptyStateMessage:
      'Ajuste los filtros laterales o cree una nueva auditoría para definir su relación.',
    pickerModalHtml,
    ...archiveProps,
  });
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
                          <div class="text-xs font-bold text-slate-900 truncate">
                            ${escapeHtml(row.codename)}
                          </div>
                          <div class="text-[11px] text-slate-500 truncate">
                            ${escapeHtml(row.tipo_auditoria)} · ${escapeHtml(row.estado_ciclo)}
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
        id_organizacion:
          detailedCert?.id_organizacion ??
          (rawCert && 'id_organizacion' in rawCert ? rawCert.id_organizacion : null) ??
          activeAudit?.id_organizacion ??
          null,
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
    backSubview: 'designacion/relacion',
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
