import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import { canArchiveRecord, extractUniversalArchiveProps, type ArchiveMultiViewConfig } from '../lib/archiveGovernance';
import {
  EXPERTO_DISPONIBILIDAD_VALUES,
  EXPERTO_EMAIL_MAX_LENGTH,
  EXPERTO_NOMBRE_MAX_LENGTH,
  EXPERTO_NOTAS_MAX_LENGTH,
  EXPERTO_TELEFONO_MAX_LENGTH,
  EXPERTO_TIPO_EMAIL_OPTIONS,
  EXPERTO_TIPO_TELEFONO_OPTIONS,
  createEmptyExpertoCompetenciaDraft,
  createEmptyExpertoEmailDraft,
  createEmptyExpertoFormDraft,
  createEmptyExpertoTelefonoDraft,
  createExpertoDraftFromEntity,
  getExpertoDisponibilidadVisual,
  getExpertoSearchableText,
  getExpertoTotalCompetencyCount,
  resolveExpertoPrimaryContact,
  type ExpertoAuditHistorialItem,
  type ExpertoChildTab,
  type ExpertoCompetenciaFormDraft,
  type ExpertoDetailMode,
  type ExpertoEmailFormDraft,
  type ExpertoSectorLink,
  type ExpertoSubsectorLink,
  type ExpertoTecnicoDetailEntity,
  type ExpertoTecnicoFormDraft,
  type ExpertoTecnicoViewState,
  type ExpertoTelefonoFormDraft,
} from '../lib/expertoTecnicoDomain';
import type { SectorIafEntity, SubsectorIafEntity } from '../lib/extraDomain';
import { filterSubsectoresBySectorIaf } from '../lib/multisiteSampling';
import {
  computeReactiveFacetCounts,
  filterRecordsWithFacets,
  sortItems,
  type ColumnDefinition,
  type MultiViewFacetCategory,
  type MultiViewSelectionMap,
} from '../lib/universalTemplate';
import { renderListViewTable, renderUniversalTemplate } from './universalTemplate';
import {
  renderDetailFormTopActions,
  renderDetailPageTemplate,
  renderMultiViewAddButton,
} from './detailTemplate';
import {
  formatAuditCodename,
  getAuditCodenameTooltip,
  resolveShortOrganizacionName,
} from '../lib/codenameDomain';

export type { ExpertoTecnicoViewState, ExpertoChildTab };

export interface ExpertoTecnicoViewProps {
  profile: UserProfile;
  state: ExpertoTecnicoViewState;
  expertos: ExpertoTecnicoDetailEntity[];
  sectores?: ReadonlyArray<SectorIafEntity>;
  subsectores?: ReadonlyArray<SubsectorIafEntity>;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  columnWidths?: Record<string, number>;
  tableColumnWidths?: Record<string, Record<string, number>>;
}

export function resolveExpertoDetailMode(
  state: ExpertoTecnicoViewState,
  isStaff: boolean,
  selectedExperto?: ExpertoTecnicoDetailEntity
): ExpertoDetailMode {
  if (!isStaff) {
    return 'read';
  }
  if (state.isCreating && !state.selectedExpertoId) {
    return 'add';
  }
  if (selectedExperto && state.isEditingAttributes) {
    return 'edit';
  }
  return 'read';
}

export function renderExpertoTecnicoView(props: ExpertoTecnicoViewProps): string {
  const {
    profile,
    state,
    expertos,
    sectores = [],
    subsectores = [],
    loading = false,
    archiveConfig,
    columnWidths,
    tableColumnWidths,
  } = props;

  if (profile.role === 'CLIENT') {
    return `
      <div class="bg-white border border-amber-200 rounded-xl p-8 text-center space-y-2 shadow-2xs max-w-2xl mx-auto">
        <span class="text-2xl block" aria-hidden="true">🔒</span>
        <h2 class="text-sm font-bold text-slate-900">Acceso Restringido al Catálogo de Expertos Técnicos</h2>
        <p class="text-xs text-slate-600">
          El directorio de expertos técnicos está disponible únicamente para el cuerpo evaluador y personal autorizado de certificación.
        </p>
      </div>
    `;
  }

  const isStaff = isApprovedStaffProfile(profile);
  const activeExpertos = expertos.filter((e) => !e.deleted_at);

  if (state.selectedExpertoId) {
    const selectedExperto = activeExpertos.find((e) => e.id === state.selectedExpertoId);
    if (selectedExperto) {
      return renderExpertoDetailPage({
        profile,
        state,
        experto: selectedExperto,
        sectores,
        subsectores,
        isStaff,
        tableColumnWidths,
      });
    }
  }

  if (!state.selectedExpertoId && state.isCreating && isStaff) {
    return renderExpertoDetailPage({
      profile,
      state,
      sectores,
      subsectores,
      isStaff,
      tableColumnWidths,
    });
  }

  return renderExpertoDirectory({
    state,
    allExpertos: activeExpertos,
    isStaff,
    loading,
    archiveConfig,
    columnWidths,
  });
}

function getExpertoSectorNumbers(experto: ExpertoTecnicoDetailEntity): number[] {
  const nums = new Set<number>();
  for (const sec of experto.sectorLinks) {
    if (sec.sector_numero > 0) nums.add(sec.sector_numero);
  }
  for (const sub of experto.subsectorLinks) {
    if (sub.sector_numero > 0) nums.add(sub.sector_numero);
  }
  return Array.from(nums).sort((a, b) => a - b);
}

function getExpertoSubsectorCodes(experto: ExpertoTecnicoDetailEntity): string[] {
  return Array.from(new Set(experto.subsectorLinks.map((s) => s.subsector_codigo))).sort((a, b) =>
    a.localeCompare(b, 'es', { numeric: true })
  );
}

function renderExpertoDirectory(props: {
  state: ExpertoTecnicoViewState;
  allExpertos: ExpertoTecnicoDetailEntity[];
  isStaff: boolean;
  loading: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  columnWidths?: Record<string, number>;
}): string {
  const { state, allExpertos, isStaff, loading, archiveConfig, columnWidths } = props;

  const uniqueSectorNumbers = Array.from(
    new Set(allExpertos.flatMap((e) => getExpertoSectorNumbers(e)))
  ).sort((a, b) => a - b);

  const uniqueSubsectorCodes = Array.from(
    new Set(allExpertos.flatMap((e) => getExpertoSubsectorCodes(e)))
  ).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));

  const facetCategories: MultiViewFacetCategory<ExpertoTecnicoDetailEntity>[] = [
    {
      id: 'estatus',
      label: 'Disponibilidad',
      options: EXPERTO_DISPONIBILIDAD_VALUES.map((val) => ({ value: val, label: val })),
      extractValues: (exp) => [exp.estatus],
    },
    {
      id: 'sector_iaf',
      label: 'Sector IAF',
      options: uniqueSectorNumbers.map((num) => ({
        value: String(num),
        label: `Sector IAF ${num}`,
      })),
      extractValues: (exp) => getExpertoSectorNumbers(exp).map((n) => String(n)),
    },
    {
      id: 'subsector_iaf',
      label: 'Sub-Sector IAF',
      options: uniqueSubsectorCodes.map((code) => ({
        value: code,
        label: `Sub-Sector ${code}`,
      })),
      extractValues: (exp) => getExpertoSubsectorCodes(exp),
    },
  ];

  const effectiveSelections: MultiViewSelectionMap = state.facetSelections ?? {
    estatus: new Set<string>(),
    sector_iaf: new Set<string>(),
    subsector_iaf: new Set<string>(),
  };

  const searchOptions = {
    getSearchableText: (exp: ExpertoTecnicoDetailEntity) => getExpertoSearchableText(exp),
  };

  const filtered = filterRecordsWithFacets(
    allExpertos,
    state.query,
    facetCategories,
    effectiveSelections,
    searchOptions
  );

  const sorted = sortItems(filtered, state.sortColumn, state.sortDirection, (exp, col) => {
    switch (col) {
      case 'nombre':
        return exp.nombre;
      case 'estatus':
        return exp.estatus;
      case 'competencias':
        return getExpertoTotalCompetencyCount(exp);
      case 'auditorias':
        return exp.historialAuditorias.length;
      default:
        return '';
    }
  });

  const facetGroups = computeReactiveFacetCounts(
    allExpertos,
    state.query,
    facetCategories,
    effectiveSelections,
    searchOptions
  );

  // Strict Clean List columns summing to 100% — zero <button> inside <tbody>
  const columns: ColumnDefinition<ExpertoTecnicoDetailEntity>[] = [
    {
      id: 'nombre',
      header: 'Experto & Notas',
      sortable: true,
      defaultWidthPct: 26,
      minWidthPx: 170,
      renderCell: (exp) => `
        <div class="min-w-0">
          <span class="block font-bold text-slate-900 truncate" title="${escapeHtml(exp.nombre)}">
            ${escapeHtml(exp.nombre)}
          </span>
          ${
            exp.notas
              ? `<span class="block text-[11px] text-slate-500 truncate">${escapeHtml(exp.notas)}</span>`
              : `<span class="block text-[11px] text-slate-400 italic">Sin notas técnicas</span>`
          }
        </div>
      `,
    },
    {
      id: 'estatus',
      header: 'Disponibilidad',
      sortable: true,
      defaultWidthPct: 14,
      minWidthPx: 115,
      renderCell: (exp) => {
        const visual = getExpertoDisponibilidadVisual(exp.estatus);
        return `
          <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap ${visual.badgeClass}">
            <span class="w-1.5 h-1.5 rounded-full ${visual.dotClass}"></span>
            <span>${escapeHtml(visual.label)}</span>
          </span>
        `;
      },
    },
    {
      id: 'competencias',
      header: 'Sectores / Sub-Sectores IAF',
      sortable: true,
      defaultWidthPct: 28,
      minWidthPx: 160,
      renderCell: (exp) => {
        if (exp.sectorLinks.length === 0 && exp.subsectorLinks.length === 0) {
          return `<span class="text-slate-400 italic">Sin cobertura IAF</span>`;
        }
        return `
          <div class="flex flex-wrap gap-1 min-w-0">
            ${exp.sectorLinks
              .map(
                (s) => `
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200 whitespace-nowrap">
                    🏭 Sector ${s.sector_numero}
                  </span>
                `
              )
              .join('')}
            ${exp.subsectorLinks
              .map(
                (sub) => `
                  <span class="px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold bg-slate-100 text-slate-800 border border-slate-200 whitespace-nowrap">
                    🧩 ${escapeHtml(sub.subsector_codigo)}
                  </span>
                `
              )
              .join('')}
          </div>
        `;
      },
    },
    {
      id: 'contacto',
      header: 'Contacto',
      sortable: false,
      defaultWidthPct: 18,
      minWidthPx: 140,
      renderCell: (exp) => {
        const contact = resolveExpertoPrimaryContact(exp);
        if (!contact.primaryPhone && !contact.primaryEmail) {
          return `<span class="text-slate-400 italic">Sin contacto activo</span>`;
        }
        return `
          <div class="min-w-0 space-y-0.5 text-[11px]">
            ${
              contact.primaryPhone
                ? `<div class="text-slate-700 font-medium truncate">📞 ${escapeHtml(contact.primaryPhone)}${contact.extraPhonesCount > 0 ? ` (+${contact.extraPhonesCount})` : ''}</div>`
                : ''
            }
            ${
              contact.primaryEmail
                ? `<div class="text-slate-500 truncate">✉️ ${escapeHtml(contact.primaryEmail)}${contact.extraEmailsCount > 0 ? ` (+${contact.extraEmailsCount})` : ''}</div>`
                : ''
            }
          </div>
        `;
      },
    },
    {
      id: 'auditorias',
      header: 'Auditorías',
      sortable: true,
      align: 'center',
      defaultWidthPct: 14,
      minWidthPx: 100,
      renderCell: (exp) => {
        const count = exp.historialAuditorias.length;
        return `
          <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${
            count > 0
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-slate-100 text-slate-600 border-slate-200'
          }">
            <span class="tabular-nums">${count}</span>
            <span>${count === 1 ? 'auditoría' : 'auditorías'}</span>
          </span>
        `;
      },
    },
  ];

  const renderCard = (exp: ExpertoTecnicoDetailEntity): string => {
    const visual = getExpertoDisponibilidadVisual(exp.estatus);
    const contact = resolveExpertoPrimaryContact(exp);

    return `
      <div
        role="button"
        tabindex="0"
        data-action="select-experto"
        data-experto-id="${escapeHtml(exp.id)}"
        aria-label="Abrir detalle de ${escapeHtml(exp.nombre)}"
        class="bg-white border border-slate-200 hover:border-indigo-300 rounded-xl p-5 shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between space-y-4 group"
      >
        <div class="space-y-2">
          <div class="flex items-start justify-between gap-2">
            <div class="space-y-1 flex-1 min-w-0">
              <h3 class="text-sm font-bold text-slate-900 group-hover:text-indigo-700 transition-colors truncate">
                ${escapeHtml(exp.nombre)}
              </h3>
              <p class="text-xs text-slate-500 line-clamp-2">
                ${exp.notas ? escapeHtml(exp.notas) : 'Especialista técnico sin notas registradas.'}
              </p>
            </div>
            <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border shrink-0 ${visual.badgeClass}">
              <span class="w-1.5 h-1.5 rounded-full ${visual.dotClass}"></span>
              <span>${escapeHtml(visual.label)}</span>
            </span>
          </div>
        </div>

        <div class="text-xs text-slate-600 bg-slate-50/75 p-3 rounded-lg border border-slate-100 space-y-2">
          <div>
            <span class="text-[10px] uppercase font-bold text-slate-400 block mb-1">
              Cobertura Técnica IAF:
            </span>
            <div class="flex flex-wrap gap-1">
              ${exp.sectorLinks
                .map(
                  (s) => `
                    <span class="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200">
                      🏭 Sector ${s.sector_numero}
                    </span>
                  `
                )
                .join('')}
              ${exp.subsectorLinks
                .map(
                  (sub) => `
                    <span class="px-2 py-0.5 rounded font-mono text-[11px] font-semibold bg-white text-slate-800 border border-slate-200">
                      🧩 ${escapeHtml(sub.subsector_codigo)}
                    </span>
                  `
                )
                .join('')}
              ${
                exp.sectorLinks.length === 0 && exp.subsectorLinks.length === 0
                  ? '<span class="text-[11px] text-slate-400 italic">Sin sectores o sub-sectores IAF</span>'
                  : ''
              }
            </div>
          </div>

          <div class="pt-1 border-t border-slate-200/50 space-y-0.5 text-[11px] text-slate-600">
            <div class="truncate">
              ${
                contact.primaryPhone
                  ? `📞 ${escapeHtml(contact.primaryPhone)}${contact.extraPhonesCount > 0 ? ` (+${contact.extraPhonesCount})` : ''}`
                  : '📞 Sin teléfono registrado'
              }
            </div>
            <div class="truncate">
              ${
                contact.primaryEmail
                  ? `✉️ ${escapeHtml(contact.primaryEmail)}${contact.extraEmailsCount > 0 ? ` (+${contact.extraEmailsCount})` : ''}`
                  : '✉️ Sin correo registrado'
              }
            </div>
          </div>
        </div>

        <div class="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <span>Competencias IAF: <strong class="text-slate-700 tabular-nums">${getExpertoTotalCompetencyCount(exp)}</strong></span>
          <span class="font-semibold text-slate-700 tabular-nums">
            ${exp.historialAuditorias.length} auditoría${exp.historialAuditorias.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>
    `;
  };

  const actionsHtml = isStaff
    ? renderMultiViewAddButton('open-create-experto', 'Nuevo Experto')
    : '';

  return renderUniversalTemplate<ExpertoTecnicoDetailEntity>({
    domainKey: 'expertos',
    tableId: 'cert-expertos-main',
    columnWidths,
    title: 'Expertos Técnicos',
    subtitle:
      'Catálogo de especialistas técnicos por Sector IAF y Sub-Sector IAF conforme a ISO/IEC 17021-1:2015 cláusula 7.2.',
    entityLabel: 'expertos registrados',
    searchQuery: state.query,
    searchPlaceholder:
      'Buscar por nombre, sector IAF, sub-sector, teléfono o correo... (Presione "/" para enfocar)',
    searchInputId: 'expertoDirectorySearchInput',
    clearSearchBtnId: 'clearExpertoSearchBtn',
    totalCount: allExpertos.length,
    filteredCount: sorted.length,
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen ?? true,
    sortState: {
      column: state.sortColumn,
      direction: state.sortDirection,
    },
    facetGroups,
    items: sorted,
    columns,
    getRowAttrs: (exp) =>
      `data-action="select-experto" data-experto-id="${escapeHtml(exp.id)}" title="Abrir detalle de ${escapeHtml(exp.nombre)}"`,
    renderCard,
    emptyStateTitle: 'No se encontraron expertos técnicos',
    emptyStateMessage:
      'No hay expertos técnicos que coincidan con el término de búsqueda o las facetas seleccionadas.',
    actionsHtml,
    loading,
    loadingMessage: 'Cargando catálogo de expertos técnicos...',
    ...extractUniversalArchiveProps(archiveConfig, 'expertos'),
  });
}

function renderExpertoDetailPage(props: {
  profile: UserProfile;
  state: ExpertoTecnicoViewState;
  experto?: ExpertoTecnicoDetailEntity;
  sectores: ReadonlyArray<SectorIafEntity>;
  subsectores: ReadonlyArray<SubsectorIafEntity>;
  isStaff: boolean;
  tableColumnWidths?: Record<string, Record<string, number>>;
}): string {
  const {
    profile,
    state,
    experto,
    sectores,
    subsectores,
    isStaff,
    tableColumnWidths,
  } = props;

  const mode = resolveExpertoDetailMode(state, isStaff, experto);
  const isCreateMode = mode === 'add';
  const isReadOnly = mode === 'read';

  const draft: ExpertoTecnicoFormDraft =
    mode === 'add'
      ? state.formDraft ?? createEmptyExpertoFormDraft()
      : mode === 'edit'
      ? state.formDraft ??
        (experto ? createExpertoDraftFromEntity(experto) : createEmptyExpertoFormDraft())
      : experto
      ? createExpertoDraftFromEntity(experto)
      : createEmptyExpertoFormDraft();

  const statusVisual = getExpertoDisponibilidadVisual(experto?.estatus || 'Disponible');
  const activeTab: ExpertoChildTab =
    state.activeChildTab === 'contacto' || state.activeChildTab === 'historial'
      ? state.activeChildTab
      : 'competencias';

  const activePhones = (experto?.telefonos || []).filter((t) => !t.deleted_at);
  const activeEmails = (experto?.emails || []).filter((e) => !e.deleted_at);
  const totalCompetencias = experto ? getExpertoTotalCompetencyCount(experto) : 0;

  const customTopActionsHtml = isStaff
    ? renderDetailFormTopActions({
        mode,
        isStaff: true,
        formId: 'expertoDetailForm',
        saveBtnId: 'saveExpertoFormBtn',
        cancelBtnId: 'cancelEditExpertoBtn',
        editBtnId: 'startEditExpertoBtn',
        saveTitle: isCreateMode ? 'Crear experto técnico' : 'Guardar cambios',
        cancelTitle: isCreateMode ? 'Cancelar creación' : 'Cancelar edición',
        editTitle: 'Editar experto técnico',
        showHistoryBtn: !isCreateMode,
        showArchiveBtn: !isCreateMode && canArchiveRecord(profile),
        extraAuditAttrs: experto
          ? `data-table-name="experto_tecnico" data-record-id="${escapeHtml(experto.id)}" data-entity-name="${escapeHtml(experto.nombre)}"`
          : '',
        extraArchiveAttrs: experto
          ? `data-archive-table="experto_tecnico" data-archive-id="${escapeHtml(experto.id)}" data-archive-entity-label="Experto Técnico" data-archive-title="${escapeHtml(experto.nombre)}" data-archive-subtitle="${escapeHtml(experto.estatus)}"`
          : '',
      })
    : undefined;

  const feedbackHtml =
    !isReadOnly && state.editErrorMessage
      ? `
        <div role="alert" class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800 flex items-center gap-2">
          <span aria-hidden="true">⚠️</span>
          <span>${escapeHtml(state.editErrorMessage)}</span>
        </div>
      `
      : '';

  const customRecordBodyHtml =
    isReadOnly && experto
      ? renderReadOnlyExpertoAttributes(experto)
      : renderExpertoFormBody(draft, isCreateMode);

  const childTabs = isCreateMode
    ? []
    : [
        {
          id: 'competencias',
          label: 'Sectores y Sub-Sectores IAF',
          symbol: '🏭',
          count: totalCompetencias,
        },
        {
          id: 'contacto',
          label: 'Teléfonos y Emails',
          symbol: '📞',
          count: activePhones.length + activeEmails.length,
        },
        {
          id: 'historial',
          label: 'Historial de Auditorías',
          symbol: '📋',
          count: experto?.historialAuditorias.length ?? 0,
        },
      ];

  return renderDetailPageTemplate({
    entityType: 'Experto Técnico',
    entitySymbol: '🔬',
    title: isCreateMode ? 'Nuevo Experto Técnico' : experto ? experto.nombre : 'Experto Técnico',
    subtitle: isCreateMode
      ? 'Registro de especialista técnico no-auditor en public.experto_tecnico por Sector IAF y Sub-Sector IAF.'
      : experto
      ? `${experto.sectorLinks.length} sector${experto.sectorLinks.length === 1 ? '' : 'es'} IAF · ${experto.subsectorLinks.length} sub-sector${experto.subsectorLinks.length === 1 ? '' : 'es'} · ${activePhones.length + activeEmails.length} canal${activePhones.length + activeEmails.length === 1 ? '' : 'es'} de contacto`
      : undefined,
    statusBadge:
      !isCreateMode && experto
        ? {
            label: statusVisual.label,
            badgeClass: statusVisual.badgeClass,
            dotClass: statusVisual.dotClass,
          }
        : undefined,
    backButton: {
      label: 'Volver',
      nav: 'certificacion',
      subview: 'experts',
      action: 'back-to-experto-list',
    },
    isCreateMode,
    customTopActionsHtml,
    parents: [],
    tableName: 'experto_tecnico',
    recordId: experto?.id || 'experto-new',
    feedbackHtml,
    attributes: [],
    customRecordBodyHtml,
    childTabs,
    activeChildTabId: activeTab,
    childTabAttrName: 'data-experto-tab',
    renderChildTabContent: (tabId) => {
      if (!experto) return '';
      if (tabId === 'contacto') {
        return renderContactoChildTab({
          experto,
          state,
          isStaff,
        });
      }
      if (tabId === 'historial') {
        return renderHistorialChildTab(experto.historialAuditorias, tableColumnWidths);
      }
      return renderCompetenciasChildTab({
        experto,
        state,
        sectores,
        subsectores,
        isStaff,
        tableColumnWidths,
      });
    },
  });
}

function renderReadOnlyExpertoAttributes(experto: ExpertoTecnicoDetailEntity): string {
  const visual = getExpertoDisponibilidadVisual(experto.estatus);
  return `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
      <div class="sm:col-span-2 bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Nombre Completo</span>
        <p class="text-xs font-bold text-slate-900">${escapeHtml(experto.nombre)}</p>
      </div>
      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Disponibilidad para trabajar</span>
        <p class="text-xs font-bold text-slate-900">${escapeHtml(visual.label)}</p>
      </div>
      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Auditorías Acompañadas</span>
        <p class="text-xs font-bold text-slate-900 tabular-nums">
          ${experto.historialAuditorias.length} ${experto.historialAuditorias.length === 1 ? 'auditoría' : 'auditorías'}
        </p>
      </div>
      <div class="sm:col-span-2 lg:col-span-4 bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Notas del Perfil</span>
        <p class="text-xs text-slate-700 leading-relaxed">
          ${experto.notas ? escapeHtml(experto.notas) : '<span class="text-slate-400 italic">Sin notas registradas.</span>'}
        </p>
      </div>
    </div>
  `;
}

function renderExpertoFormBody(draft: ExpertoTecnicoFormDraft, isCreateMode: boolean): string {
  return `
    <form id="expertoDetailForm" class="space-y-3" novalidate>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div class="md:col-span-2 bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
          <label for="expertoNombreInput" class="block text-xs font-bold text-slate-700">
            Nombre Completo <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <input
            type="text"
            id="expertoNombreInput"
            name="nombre"
            required
            maxlength="${EXPERTO_NOMBRE_MAX_LENGTH}"
            value="${escapeHtml(draft.nombre)}"
            placeholder="Ej. Dra. Sofía Quintero"
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
          />
          <p class="text-[11px] text-slate-500">
            Nombre oficial del experto técnico (máx. ${EXPERTO_NOMBRE_MAX_LENGTH} caracteres).
          </p>
        </div>

        <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
          <label for="expertoEstatusSelect" class="block text-xs font-bold text-slate-700">
            Disponibilidad <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <select
            id="expertoEstatusSelect"
            name="estatus"
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
          >
            ${EXPERTO_DISPONIBILIDAD_VALUES.map(
              (val) => `
                <option value="${escapeHtml(val)}" ${draft.estatus === val ? 'selected' : ''}>
                  ${escapeHtml(val)}
                </option>
              `
            ).join('')}
          </select>
          <p class="text-[11px] text-slate-500">
            Estado operativo para asignación en equipos de auditoría.
          </p>
        </div>

        <div class="md:col-span-3 bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
          <label for="expertoNotasInput" class="block text-xs font-bold text-slate-700">
            Notas del Perfil Técnico
          </label>
          <textarea
            id="expertoNotasInput"
            name="notas"
            rows="3"
            maxlength="${EXPERTO_NOTAS_MAX_LENGTH}"
            placeholder="Especialidad sectorial, experiencia en procesos críticos, restricciones o disponibilidad..."
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
          >${escapeHtml(draft.notas)}</textarea>
          <p class="text-[11px] text-slate-500">
            ${
              isCreateMode
                ? 'Después de guardar el perfil podrá vincular Sectores/Sub-Sectores IAF, teléfonos y correos electrónicos.'
                : 'Los sectores IAF, teléfonos y correos se gestionan en sus pestañas dedicadas.'
            }
          </p>
        </div>
      </div>
    </form>
  `;
}

/**
 * TAB 1: Sectores y Sub-Sectores IAF (ZERO ISO Norms)
 */
function renderCompetenciasChildTab(params: {
  experto: ExpertoTecnicoDetailEntity;
  state: ExpertoTecnicoViewState;
  sectores: ReadonlyArray<SectorIafEntity>;
  subsectores: ReadonlyArray<SubsectorIafEntity>;
  isStaff: boolean;
  tableColumnWidths?: Record<string, Record<string, number>>;
}): string {
  const { experto, state, sectores, subsectores, isStaff, tableColumnWidths } = params;

  const compDraft: ExpertoCompetenciaFormDraft =
    state.competenciaDraft ?? createEmptyExpertoCompetenciaDraft(experto.id, 'sector_iaf');

  const sortedSectores = [...sectores]
    .filter((s) => !s.deleted_at)
    .sort((a, b) => a.sector - b.sector);

  const filteredSubsectores =
    compDraft.tipo === 'subsector_iaf' && compDraft.id_sector_iaf
      ? filterSubsectoresBySectorIaf({
          sectorId: compDraft.id_sector_iaf,
          sectores: sortedSectores.map((s) => ({
            id: s.id,
            sector: s.sector,
            descripcion: s.descripcion,
          })),
          subsectores: subsectores
            .filter((sub) => !sub.deleted_at)
            .map((sub) => ({
              id: sub.id,
              id_sector_iaf: sub.id_sector_iaf,
              sector_numero: sub.sector_numero,
              codigo: sub.codigo,
              descripcion: sub.descripcion,
              categoria_riesgo: sub.categoria_riesgo,
            })),
        })
      : [];

  const headerBarHtml = `
    <div class="flex flex-wrap items-center justify-between gap-2 pb-2.5">
      <p class="text-xs text-slate-500">
        Competencia técnica exclusiva por Sector IAF y Sub-Sector IAF (los expertos técnicos no califican por norma ISO).
      </p>
      ${
        isStaff && !state.isAddingCompetencia
          ? `
            <button
              type="button"
              data-action="open-add-experto-competencia"
              data-experto-id="${escapeHtml(experto.id)}"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold transition-colors cursor-pointer shadow-2xs shrink-0"
            >
              <span aria-hidden="true">+</span>
              <span>Asignar Sector / Sub-Sector IAF</span>
            </button>
          `
          : ''
      }
    </div>
  `;

  const inlineAddFormHtml =
    isStaff && state.isAddingCompetencia
      ? `
        <form
          id="expertoCompetenciaForm"
          class="bg-slate-50 border border-indigo-200 rounded-xl p-4 space-y-3 mb-4"
          novalidate
        >
          <div class="flex items-center justify-between gap-2">
            <h4 class="text-xs font-bold text-slate-900">
              Asignar Cobertura IAF al Experto Técnico
            </h4>
            <button
              type="button"
              data-action="cancel-add-experto-competencia"
              class="text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              Cancelar
            </button>
          </div>
          ${
            state.competenciaErrorMessage
              ? `
                <div role="alert" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
                  ⚠️ ${escapeHtml(state.competenciaErrorMessage)}
                </div>
              `
              : ''
          }
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div class="space-y-1">
              <label for="expCompSelectTipo" class="block text-[11px] font-bold text-slate-700">
                Nivel de Cobertura
              </label>
              <select
                id="expCompSelectTipo"
                name="tipo"
                class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
              >
                <option value="sector_iaf" ${compDraft.tipo === 'sector_iaf' ? 'selected' : ''}>
                  Sector IAF completo
                </option>
                <option value="subsector_iaf" ${compDraft.tipo === 'subsector_iaf' ? 'selected' : ''}>
                  Sub-Sector IAF específico
                </option>
              </select>
            </div>
            <div class="space-y-1">
              <label for="expCompSelectSector" class="block text-[11px] font-bold text-slate-700">
                Sector IAF <span class="text-rose-600">*</span>
              </label>
              <select
                id="expCompSelectSector"
                name="id_sector_iaf"
                class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
              >
                <option value="">Seleccione un Sector IAF...</option>
                ${sortedSectores
                  .map(
                    (s) => `
                      <option value="${escapeHtml(s.id)}" ${compDraft.id_sector_iaf === s.id ? 'selected' : ''}>
                        Sector IAF ${s.sector} — ${escapeHtml(s.descripcion)}
                      </option>
                    `
                  )
                  .join('')}
              </select>
            </div>
            ${
              compDraft.tipo === 'subsector_iaf'
                ? `
                  <div class="space-y-1">
                    <label for="expCompSelectSubsector" class="block text-[11px] font-bold text-slate-700">
                      Sub-Sector IAF <span class="text-rose-600">*</span>
                    </label>
                    <select
                      id="expCompSelectSubsector"
                      name="id_subsector_iaf"
                      ${!compDraft.id_sector_iaf ? 'disabled' : ''}
                      class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:border-slate-900 focus:outline-none"
                    >
                      <option value="">
                        ${
                          !compDraft.id_sector_iaf
                            ? 'Primero seleccione un Sector IAF...'
                            : filteredSubsectores.length === 0
                            ? 'Sin sub-sectores disponibles'
                            : 'Seleccione un Sub-Sector IAF...'
                        }
                      </option>
                      ${filteredSubsectores
                        .map(
                          (sub) => `
                            <option value="${escapeHtml(sub.id)}" ${compDraft.id_subsector_iaf === sub.id ? 'selected' : ''}>
                              ${escapeHtml(sub.codigo)} — ${escapeHtml(sub.descripcion || '')}
                            </option>
                          `
                        )
                        .join('')}
                    </select>
                  </div>
                `
                : `
                  <div class="flex items-end">
                    <button
                      type="submit"
                      id="saveExpertoCompetenciaBtn"
                      class="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer w-full md:w-auto"
                    >
                      Guardar Sector IAF
                    </button>
                  </div>
                `
            }
          </div>
          ${
            compDraft.tipo === 'subsector_iaf'
              ? `
                <div class="flex justify-end">
                  <button
                    type="submit"
                    id="saveExpertoCompetenciaBtn"
                    class="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer"
                  >
                    Guardar Sub-Sector IAF
                  </button>
                </div>
              `
              : ''
          }
        </form>
      `
      : '';

  const sectorColumns: ColumnDefinition<ExpertoSectorLink>[] = [
    {
      id: 'sector_numero',
      header: 'Sector IAF',
      defaultWidthPct: 28,
      minWidthPx: 120,
      renderCell: (item) => `
        <span class="font-bold text-indigo-800 inline-flex items-center gap-1.5">
          <span aria-hidden="true">🏭</span>
          <span>Sector IAF ${item.sector_numero}</span>
        </span>
      `,
    },
    {
      id: 'sector_descripcion',
      header: 'Descripción Técnica Sectorial',
      defaultWidthPct: 72,
      minWidthPx: 200,
      renderCell: (item) =>
        `<span class="text-slate-700 truncate block">${escapeHtml(item.sector_descripcion)}</span>`,
    },
  ];

  const subsectorColumns: ColumnDefinition<ExpertoSubsectorLink>[] = [
    {
      id: 'subsector_codigo',
      header: 'Sub-Sector',
      defaultWidthPct: 18,
      minWidthPx: 95,
      renderCell: (item) => `
        <span class="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
          ${escapeHtml(item.subsector_codigo)}
        </span>
      `,
    },
    {
      id: 'subsector_descripcion',
      header: 'Descripción Técnica',
      defaultWidthPct: 48,
      minWidthPx: 180,
      renderCell: (item) =>
        `<span class="text-slate-800 font-medium truncate block">${escapeHtml(item.subsector_descripcion)}</span>`,
    },
    {
      id: 'sector_numero',
      header: 'Sector Padre',
      defaultWidthPct: 18,
      minWidthPx: 100,
      renderCell: (item) =>
        `<span class="text-slate-600 font-semibold">Sector ${item.sector_numero}</span>`,
    },
    {
      id: 'categoria_riesgo',
      header: 'Riesgo IAF',
      align: 'center',
      defaultWidthPct: 16,
      minWidthPx: 95,
      renderCell: (item) => {
        const risk = item.categoria_riesgo || 'MEDIO';
        const badgeClass =
          risk === 'ALTO'
            ? 'bg-rose-50 text-rose-800 border-rose-200'
            : risk === 'BAJO'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : 'bg-amber-50 text-amber-800 border-amber-200';
        return `<span class="inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold border ${badgeClass}">${escapeHtml(risk)}</span>`;
      },
    },
  ];

  const sectorUnlinkBarHtml =
    isStaff && experto.sectorLinks.length > 0
      ? `
        <div class="flex flex-wrap items-center gap-1.5 pt-1">
          <span class="text-[11px] text-slate-500 font-medium">Desvincular sector:</span>
          ${experto.sectorLinks
            .map(
              (item) => `
                <button
                  type="button"
                  data-action="unlink-experto-sector"
                  data-experto-id="${escapeHtml(experto.id)}"
                  data-sector-id="${escapeHtml(item.id_sector_iaf)}"
                  aria-label="Desvincular Sector IAF ${item.sector_numero}"
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-semibold cursor-pointer transition-colors"
                >
                  <span>Sector ${item.sector_numero}</span>
                  <span aria-hidden="true">✕</span>
                </button>
              `
            )
            .join('')}
        </div>
      `
      : '';

  const subsectorUnlinkBarHtml =
    isStaff && experto.subsectorLinks.length > 0
      ? `
        <div class="flex flex-wrap items-center gap-1.5 pt-1">
          <span class="text-[11px] text-slate-500 font-medium">Desvincular sub-sector:</span>
          ${experto.subsectorLinks
            .map(
              (item) => `
                <button
                  type="button"
                  data-action="unlink-experto-subsector"
                  data-experto-id="${escapeHtml(experto.id)}"
                  data-subsector-id="${escapeHtml(item.id_subsector_iaf)}"
                  aria-label="Desvincular Sub-Sector ${escapeHtml(item.subsector_codigo)}"
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-semibold cursor-pointer transition-colors"
                >
                  <span class="font-mono">${escapeHtml(item.subsector_codigo)}</span>
                  <span aria-hidden="true">✕</span>
                </button>
              `
            )
            .join('')}
        </div>
      `
      : '';

  return `
    ${headerBarHtml}
    ${inlineAddFormHtml}
    <div class="space-y-4">
      <div class="space-y-1.5">
        <div class="flex items-center justify-between px-1">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-600">
            🏭 Sectores Técnicos IAF (${experto.sectorLinks.length})
          </h3>
        </div>
        ${renderListViewTable({
          tableId: 'experto-tab-sectores',
          columns: sectorColumns,
          items: experto.sectorLinks,
          columnWidths: tableColumnWidths?.['experto-tab-sectores'],
          emptyStateTitle: 'Sin sectores IAF asignados',
          emptyStateMessage:
            'Este experto técnico aún no tiene cobertura completa de Sector IAF registrada.',
        })}
        ${sectorUnlinkBarHtml}
      </div>

      <div class="space-y-1.5">
        <div class="flex items-center justify-between px-1">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-600">
            🧩 Sub-Sectores Técnicos IAF (${experto.subsectorLinks.length})
          </h3>
        </div>
        ${renderListViewTable({
          tableId: 'experto-tab-subsectores',
          columns: subsectorColumns,
          items: experto.subsectorLinks,
          columnWidths: tableColumnWidths?.['experto-tab-subsectores'],
          emptyStateTitle: 'Sin sub-sectores IAF asignados',
          emptyStateMessage:
            'Este experto técnico aún no tiene Sub-Sectores IAF específicos vinculados.',
        })}
        ${subsectorUnlinkBarHtml}
      </div>
    </div>
  `;
}

/**
 * TAB 2: Teléfonos y Emails (1:N inline add + soft-delete)
 */
function renderContactoChildTab(params: {
  experto: ExpertoTecnicoDetailEntity;
  state: ExpertoTecnicoViewState;
  isStaff: boolean;
}): string {
  const { experto, state, isStaff } = params;
  const activePhones = experto.telefonos.filter((t) => !t.deleted_at);
  const activeEmails = experto.emails.filter((e) => !e.deleted_at);

  const telDraft: ExpertoTelefonoFormDraft =
    state.telefonoDraft ?? createEmptyExpertoTelefonoDraft();
  const emailDraft: ExpertoEmailFormDraft =
    state.emailDraft ?? createEmptyExpertoEmailDraft();

  return `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <section class="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-3">
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-700">
            📞 Teléfonos (${activePhones.length})
          </h3>
          ${
            isStaff && !state.isAddingTelefono
              ? `
                <button
                  type="button"
                  data-action="open-add-experto-telefono"
                  class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold cursor-pointer transition-colors"
                >
                  <span aria-hidden="true">+</span>
                  <span>Agregar Teléfono</span>
                </button>
              `
              : ''
          }
        </div>

        ${
          isStaff && state.isAddingTelefono
            ? `
              <form id="expertoTelefonoForm" class="bg-white border border-indigo-200 rounded-lg p-3 space-y-2.5" novalidate>
                ${
                  state.telefonoErrorMessage
                    ? `<div role="alert" class="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">⚠️ ${escapeHtml(state.telefonoErrorMessage)}</div>`
                    : ''
                }
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label for="expTelNumeroInput" class="block text-[11px] font-bold text-slate-700 mb-1">
                      Número Telefónico <span class="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      id="expTelNumeroInput"
                      name="telefono"
                      maxlength="${EXPERTO_TELEFONO_MAX_LENGTH}"
                      value="${escapeHtml(telDraft.telefono)}"
                      placeholder="Ej. +58 414 555-0101"
                      class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label for="expTelTipoSelect" class="block text-[11px] font-bold text-slate-700 mb-1">
                      Tipo
                    </label>
                    <select
                      id="expTelTipoSelect"
                      name="tipo_telefono"
                      class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
                    >
                      ${EXPERTO_TIPO_TELEFONO_OPTIONS.map(
                        (opt) => `
                          <option value="${escapeHtml(opt)}" ${telDraft.tipo_telefono === opt ? 'selected' : ''}>
                            ${escapeHtml(opt)}
                          </option>
                        `
                      ).join('')}
                    </select>
                  </div>
                </div>
                <div class="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    data-action="cancel-add-experto-telefono"
                    class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    id="saveExpertoTelefonoBtn"
                    class="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
                  >
                    Guardar Teléfono
                  </button>
                </div>
              </form>
            `
            : ''
        }

        ${
          activePhones.length === 0
            ? `<p class="text-xs text-slate-500 italic py-3">Sin teléfonos registrados para este experto técnico.</p>`
            : `
              <div class="space-y-2">
                ${activePhones
                  .map(
                    (tel) => `
                      <div class="bg-white border border-slate-200 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                        <div class="min-w-0">
                          <div class="text-xs font-bold text-slate-900 font-mono truncate">${escapeHtml(tel.telefono)}</div>
                          <div class="text-[11px] text-slate-500">${escapeHtml(tel.tipo_telefono)}</div>
                        </div>
                        ${
                          isStaff
                            ? `
                              <button
                                type="button"
                                data-action="archive-experto-telefono"
                                data-telefono-id="${escapeHtml(tel.id)}"
                                aria-label="Archivar teléfono ${escapeHtml(tel.telefono)}"
                                class="px-2.5 py-1 rounded-md border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-semibold cursor-pointer shrink-0 transition-colors"
                              >
                                Archivar
                              </button>
                            `
                            : ''
                        }
                      </div>
                    `
                  )
                  .join('')}
              </div>
            `
        }
      </section>

      <section class="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-3">
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-700">
            ✉️ Correos Electrónicos (${activeEmails.length})
          </h3>
          ${
            isStaff && !state.isAddingEmail
              ? `
                <button
                  type="button"
                  data-action="open-add-experto-email"
                  class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold cursor-pointer transition-colors"
                >
                  <span aria-hidden="true">+</span>
                  <span>Agregar Email</span>
                </button>
              `
              : ''
          }
        </div>

        ${
          isStaff && state.isAddingEmail
            ? `
              <form id="expertoEmailForm" class="bg-white border border-indigo-200 rounded-lg p-3 space-y-2.5" novalidate>
                ${
                  state.emailErrorMessage
                    ? `<div role="alert" class="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">⚠️ ${escapeHtml(state.emailErrorMessage)}</div>`
                    : ''
                }
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label for="expEmailInput" class="block text-[11px] font-bold text-slate-700 mb-1">
                      Correo Electrónico <span class="text-rose-600">*</span>
                    </label>
                    <input
                      type="email"
                      id="expEmailInput"
                      name="email"
                      maxlength="${EXPERTO_EMAIL_MAX_LENGTH}"
                      value="${escapeHtml(emailDraft.email)}"
                      placeholder="Ej. experto@fondonorma.org"
                      class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label for="expEmailTipoSelect" class="block text-[11px] font-bold text-slate-700 mb-1">
                      Tipo
                    </label>
                    <select
                      id="expEmailTipoSelect"
                      name="tipo_email"
                      class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
                    >
                      ${EXPERTO_TIPO_EMAIL_OPTIONS.map(
                        (opt) => `
                          <option value="${escapeHtml(opt)}" ${emailDraft.tipo_email === opt ? 'selected' : ''}>
                            ${escapeHtml(opt)}
                          </option>
                        `
                      ).join('')}
                    </select>
                  </div>
                </div>
                <div class="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    data-action="cancel-add-experto-email"
                    class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    id="saveExpertoEmailBtn"
                    class="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
                  >
                    Guardar Email
                  </button>
                </div>
              </form>
            `
            : ''
        }

        ${
          activeEmails.length === 0
            ? `<p class="text-xs text-slate-500 italic py-3">Sin correos electrónicos registrados para este experto técnico.</p>`
            : `
              <div class="space-y-2">
                ${activeEmails
                  .map(
                    (em) => `
                      <div class="bg-white border border-slate-200 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                        <div class="min-w-0">
                          <div class="text-xs font-bold text-slate-900 truncate">${escapeHtml(em.email)}</div>
                          <div class="text-[11px] text-slate-500">${escapeHtml(em.tipo_email)}</div>
                        </div>
                        ${
                          isStaff
                            ? `
                              <button
                                type="button"
                                data-action="archive-experto-email"
                                data-email-id="${escapeHtml(em.id)}"
                                aria-label="Archivar correo ${escapeHtml(em.email)}"
                                class="px-2.5 py-1 rounded-md border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-semibold cursor-pointer shrink-0 transition-colors"
                              >
                                Archivar
                              </button>
                            `
                            : ''
                        }
                      </div>
                    `
                  )
                  .join('')}
              </div>
            `
        }
      </section>
    </div>
  `;
}

/**
 * TAB 3: Historial de Auditorías (public.experto_tecnico_auditoria)
 */
function renderHistorialChildTab(
  historial: ExpertoAuditHistorialItem[],
  tableColumnWidths?: Record<string, Record<string, number>>
): string {
  if (historial.length === 0) {
    return `
      <div class="p-8 text-center text-slate-500 text-xs bg-slate-50 rounded-xl border border-slate-200 space-y-2">
        <span class="text-2xl block" aria-hidden="true">📋</span>
        <p class="font-bold text-slate-800">Sin historial de acompañamientos técnicos</p>
        <p class="text-slate-500">
          Este experto técnico aún no ha participado en auditorías registradas en el sistema.
        </p>
      </div>
    `;
  }

  const columns: ColumnDefinition<ExpertoAuditHistorialItem>[] = [
    {
      id: 'codigo_auditoria',
      header: 'Auditoría',
      defaultWidthPct: 18,
      minWidthPx: 110,
      renderCell: (aud) => {
        const codenameInput = {
          codigo_auditoria: aud.codigo_auditoria,
          tipo_auditoria: aud.tipo_auditoria,
        };
        return `
        <span class="font-mono font-bold text-slate-900 inline-flex items-center gap-1.5" title="${escapeHtml(
          getAuditCodenameTooltip(codenameInput)
        )}">
          <span aria-hidden="true">📋</span>
          <span class="truncate">${escapeHtml(formatAuditCodename(codenameInput))}</span>
        </span>
      `;
      },
    },
    {
      id: 'organizacion_nombre',
      header: 'Organización Cliente',
      defaultWidthPct: 24,
      minWidthPx: 140,
      renderCell: (aud) =>
        `<span class="font-bold text-slate-800 truncate block" title="${escapeHtml(
          aud.organizacion_nombre
        )}">${escapeHtml(resolveShortOrganizacionName({ nombre: aud.organizacion_nombre }))}</span>`,
    },
    {
      id: 'numero_certificado',
      header: 'Certificado',
      defaultWidthPct: 17,
      minWidthPx: 110,
      renderCell: (aud) =>
        `<span class="font-mono font-semibold text-slate-700">${escapeHtml(aud.numero_certificado)}</span>`,
    },
    {
      id: 'dias_asignados',
      header: 'Días',
      align: 'center',
      defaultWidthPct: 11,
      minWidthPx: 75,
      renderCell: (aud) =>
        `<span class="font-mono font-bold text-indigo-700 tabular-nums">${aud.dias_asignados.toFixed(2)} d</span>`,
    },
    {
      id: 'observacion',
      header: 'Observación Técnica',
      defaultWidthPct: 30,
      minWidthPx: 150,
      renderCell: (aud) =>
        `<span class="text-slate-600 truncate block">${escapeHtml(aud.observacion || 'Acompañamiento técnico sectorial')}</span>`,
    },
  ];

  return renderListViewTable({
    tableId: 'experto-tab-historial',
    columns,
    items: historial,
    columnWidths: tableColumnWidths?.['experto-tab-historial'],
    getRowAttrs: (aud) =>
      `data-action="select-prog-audit-by-code" data-audit-code="${escapeHtml(aud.codigo_auditoria)}" title="Abrir auditoría ${escapeHtml(aud.codigo_auditoria)}"`,
  });
}
