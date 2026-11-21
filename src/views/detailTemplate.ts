import { escapeHtml } from '../lib/html';
import type { BreadcrumbEntityType } from '../lib/breadcrumb';

export interface DetailAttributeItem {
  label: string;
  value: string;
  isMono?: boolean;
  tooltip?: string;
  badgeClass?: string;
  colSpanFull?: boolean;
  linkAction?: {
    nav: string;
    subview?: string;
    entityType?: BreadcrumbEntityType;
    entityId?: string;
    label: string;
  };
}

export interface DetailParentChip {
  label: string;
  value: string;
  symbol?: string;
  navAction?: {
    nav: string;
    subview?: string;
    entityType?: BreadcrumbEntityType;
    entityId?: string;
    sectorNumber?: number;
    targetTab?: string;
  };
}

export interface DetailChildTab {
  id: string;
  label: string;
  symbol?: string;
  count: number;
  countBadgeClass?: string;
  statusDotClass?: string;
}

export interface DetailPageTemplateProps {
  entityType: string;
  entitySymbol: string;
  title: string;
  subtitle?: string;
  eyebrowCode?: string;
  statusBadge?: {
    label: string;
    badgeClass: string;
    symbol?: string;
    dotClass?: string;
  };
  secondaryHeaderBadge?: {
    label: string;
    badgeClass?: string;
  };
  backButton: {
    label: string;
    nav: string;
    subview?: string;
    action?: string;
  };
  editActionButton?: {
    id: string;
    visible: boolean;
    isEditing?: boolean;
    cancelId?: string;
  };
  extraActionButtonsHtml?: string;
  trailingActionButtonsHtml?: string;
  parents?: DetailParentChip[];
  /** @deprecated Prefer `parents` array; kept for backwards compatibility */
  parentInfo?: {
    parentLabel: string;
    parentName: string;
    navAction?: {
      nav: string;
      subview?: string;
      entityId?: string;
    };
  };
  parentMetaHtml?: string;
  tableName: string;
  recordId: string;
  recordActionsHtml?: string;
  feedbackHtml?: string;
  attributes: DetailAttributeItem[];
  customRecordBodyHtml?: string;
  editableScopeField?: {
    label: string;
    value: string;
    maxLength: number;
    fieldName: string;
  };
  childTabs?: DetailChildTab[];
  activeChildTabId?: string;
  childTabAttrName?: string;
  renderChildTabContent?: (activeTabId: string) => string;
  extraSectionsHtml?: string;
  betweenZone2AndZone3Html?: string;
  modalsHtml?: string;
  isCreateMode?: boolean;
  customParentZoneHtml?: string;
  customTopActionsHtml?: string;
  topInCardHtml?: string;
}

export function renderDetailPageTemplate(props: DetailPageTemplateProps): string {
  const {
    entityType,
    entitySymbol,
    title,
    subtitle,
    eyebrowCode,
    statusBadge,
    secondaryHeaderBadge,
    backButton,
    editActionButton,
    extraActionButtonsHtml = '',
    trailingActionButtonsHtml = '',
    parents = [],
    parentInfo,
    parentMetaHtml = '',
    tableName,
    recordId,
    recordActionsHtml = '',
    feedbackHtml = '',
    attributes,
    customRecordBodyHtml,
    editableScopeField,
    childTabs = [],
    activeChildTabId,
    childTabAttrName = 'data-detail-tab',
    renderChildTabContent,
    extraSectionsHtml = '',
    betweenZone2AndZone3Html = '',
    modalsHtml = '',
    isCreateMode = false,
    customParentZoneHtml,
    customTopActionsHtml,
    topInCardHtml = '',
  } = props;

  // Keep entityType referenced for clean TypeScript strictness without rendering a legacy eyebrow label
  void entityType;

  // Normalize legacy parentInfo into parents array when provided
  const resolvedParents: DetailParentChip[] =
    parents.length > 0
      ? parents
      : parentInfo
      ? [
          {
            label: parentInfo.parentLabel,
            value: parentInfo.parentName,
            symbol: '🏢',
            navAction: parentInfo.navAction
              ? {
                  nav: parentInfo.navAction.nav === 'drilldown' ? 'certificacion' : parentInfo.navAction.nav,
                  subview:
                    parentInfo.navAction.nav === 'drilldown'
                      ? 'organizations'
                      : parentInfo.navAction.subview,
                  entityType:
                    parentInfo.navAction.nav === 'drilldown' ? 'org' : undefined,
                  entityId: parentInfo.navAction.entityId,
                }
              : undefined,
          },
        ]
      : [];

  const hasCustomParentZone = Boolean(customParentZoneHtml && customParentZoneHtml.trim().length > 0);
  const hasParentZone = hasCustomParentZone || resolvedParents.length > 0 || Boolean(parentMetaHtml);
  const parentGridColsClass =
    resolvedParents.length >= 5
      ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'
      : resolvedParents.length === 4
      ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
      : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';

  // ZONE 1: Parent Zone (Top) — structured grid cards matching Direct Data zone; omitted cleanly on standalone root catalogs
  const parentZoneHtml = hasCustomParentZone
    ? `
      <section aria-label="Contexto y relaciones superiores" class="space-y-2">
        ${customParentZoneHtml}
        ${parentMetaHtml ? `<div class="flex flex-wrap items-center gap-2">${parentMetaHtml}</div>` : ''}
      </section>
      <hr class="border-t border-slate-200 my-2.5 sm:my-3" />
    `
    : hasParentZone
    ? `
      <section aria-label="Contexto y relaciones superiores" class="space-y-2">
        <div class="grid ${parentGridColsClass} gap-2.5">
          ${resolvedParents
            .map((parent) => {
              const sym = parent.symbol ? `<span aria-hidden="true" class="shrink-0">${parent.symbol}</span>` : '';
              if (parent.navAction) {
                const nav = parent.navAction;
                return `
                  <button
                    type="button"
                    data-parent-nav="true"
                    data-nav="${escapeHtml(nav.nav)}"
                    ${nav.subview ? `data-subview="${escapeHtml(nav.subview)}"` : ''}
                    ${nav.entityType ? `data-parent-type="${escapeHtml(nav.entityType)}"` : ''}
                    ${nav.entityId ? `data-entity-id="${escapeHtml(nav.entityId)}"` : ''}
                    ${
                      nav.sectorNumber !== undefined
                        ? `data-sector-number="${escapeHtml(String(nav.sectorNumber))}"`
                        : ''
                    }
                    ${nav.targetTab ? `data-target-tab="${escapeHtml(nav.targetTab)}"` : ''}
                    data-entity-value="${escapeHtml(parent.value)}"
                    class="w-full text-left bg-slate-50/70 hover:bg-indigo-50/70 border border-slate-200/90 hover:border-indigo-300 rounded-xl p-2.5 sm:p-3 space-y-0.5 transition-colors cursor-pointer group flex flex-col justify-between min-w-0"
                    title="Abrir ${escapeHtml(parent.label)}: ${escapeHtml(parent.value)}"
                  >
                    <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between gap-2 w-full">
                      <span class="inline-flex items-center gap-1.5 min-w-0 truncate">
                        ${sym}
                        <span class="truncate">${escapeHtml(parent.label)}</span>
                      </span>
                      <span class="text-indigo-500 text-xs shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden="true">→</span>
                    </span>
                    <span class="block text-xs font-bold text-indigo-700 group-hover:text-indigo-900 group-hover:underline truncate w-full">
                      ${escapeHtml(parent.value)}
                    </span>
                  </button>
                `;
              }
              return `
                <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5 min-w-0">
                  <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 truncate">
                    ${sym}
                    <span class="truncate">${escapeHtml(parent.label)}</span>
                  </div>
                  <div class="text-xs font-bold text-slate-800 truncate">
                    ${escapeHtml(parent.value)}
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
        ${parentMetaHtml ? `<div class="flex flex-wrap items-center gap-2">${parentMetaHtml}</div>` : ''}
      </section>
      <hr class="border-t border-slate-200 my-2.5 sm:my-3" />
    `
    : '';

  // ZONE 2: Record Zone Attributes (Middle)
  const attributesHtml =
    attributes.length > 0
      ? `
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2.5">
        ${attributes
          .map((attr) => {
            const spanClass = attr.colSpanFull ? 'col-span-full' : '';
            return `
              <div class="${spanClass} bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
                <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  ${escapeHtml(attr.label)}
                </div>
                <div class="text-xs text-slate-900 font-semibold ${attr.isMono ? 'font-mono' : ''}">
                  ${
                    attr.badgeClass
                      ? `
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${attr.badgeClass}">
                          ${escapeHtml(attr.value)}
                        </span>
                      `
                      : attr.linkAction
                      ? `
                        <button
                          type="button"
                          data-parent-nav="true"
                          data-nav="${escapeHtml(attr.linkAction.nav)}"
                          ${attr.linkAction.subview ? `data-subview="${escapeHtml(attr.linkAction.subview)}"` : ''}
                          ${attr.linkAction.entityType ? `data-parent-type="${escapeHtml(attr.linkAction.entityType)}"` : ''}
                          ${attr.linkAction.entityId ? `data-entity-id="${escapeHtml(attr.linkAction.entityId)}"` : ''}
                          class="text-indigo-600 hover:text-indigo-800 hover:underline font-semibold transition-colors cursor-pointer"
                        >
                          ${escapeHtml(attr.value)}
                        </button>
                      `
                      : escapeHtml(attr.value || '—')
                  }
                </div>
              </div>
            `;
          })
          .join('')}
      </div>
    `
      : '';

  const editableScopeHtml = editableScopeField
    ? `
      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-1.5">
        <div class="max-w-4xl space-y-2">
          <div class="flex items-center justify-between gap-2">
            <label for="detailScopeInput" class="text-xs font-bold uppercase tracking-wider text-slate-700">
              ${escapeHtml(editableScopeField.label)}
            </label>
            <div class="text-[11px] font-mono text-slate-400">
              <span id="scopeCharCount">${editableScopeField.value.length}</span> / ${editableScopeField.maxLength} caracteres
            </div>
          </div>
          <textarea
            id="detailScopeInput"
            name="${escapeHtml(editableScopeField.fieldName)}"
            maxlength="${editableScopeField.maxLength}"
            rows="3"
            class="w-full text-xs rounded-lg border border-slate-300 bg-white p-2.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
          >${escapeHtml(editableScopeField.value)}</textarea>
          <p class="text-[11px] text-slate-400">
            Alcance de certificación formal auditable conforme a ISO/IEC 17021-1:2015 cláusula 8.2.
          </p>
        </div>
      </div>
    `
    : '';

  // ROW 4: Multipage Children (Integrated inside the single big card; hidden in create mode)
  let childTabsHtml = '';
  if (!isCreateMode && childTabs.length > 0 && renderChildTabContent) {
    const activeTab = activeChildTabId || childTabs[0].id;
    childTabsHtml = `
      <section aria-label="Registros relacionados" class="border-t border-slate-200">
        <div class="px-4 pt-2 border-b border-slate-200 bg-slate-50/60 flex flex-wrap gap-1.5" role="tablist">
          ${childTabs
            .map((tab) => {
              const isActive = tab.id === activeTab;
              const badgeColorClass =
                tab.countBadgeClass ||
                (isActive ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-200/80 text-slate-600');
              return `
                <button
                  type="button"
                  role="tab"
                  ${childTabAttrName}="${escapeHtml(tab.id)}"
                  aria-selected="${isActive ? 'true' : 'false'}"
                  class="px-3 py-1.5 text-xs font-semibold rounded-t-lg transition-all cursor-pointer inline-flex items-center gap-1.5 border-b-2 ${
                    isActive
                      ? 'bg-white text-indigo-700 border-indigo-600 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-100/60'
                  }"
                >
                  ${tab.statusDotClass ? `<span class="w-1.5 h-1.5 rounded-full shrink-0 ${tab.statusDotClass}" aria-hidden="true"></span>` : ''}
                  ${tab.symbol ? `<span aria-hidden="true">${tab.symbol}</span>` : ''}
                  <span>${escapeHtml(tab.label)}</span>
                  <span class="text-[10px] px-1.5 py-0.2 rounded-full font-bold ${badgeColorClass}">
                    ${tab.count}
                  </span>
                </button>
              `;
            })
            .join('')}
        </div>

        <div class="p-3.5 sm:p-4">
          ${renderChildTabContent(activeTab)}
        </div>
      </section>
    `;
  }

  const topEditButtonHtml =
    editActionButton && editActionButton.visible
      ? editActionButton.isEditing
        ? `
          <button
            type="button"
            id="${escapeHtml(editActionButton.cancelId || `${editActionButton.id}Cancel`)}"
            title="Cancelar edición"
            aria-label="Cancelar edición"
            class="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 shadow-2xs transition-colors cursor-pointer"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        `
        : `
          <button
            type="button"
            id="${escapeHtml(editActionButton.id)}"
            title="Editar"
            aria-label="Editar"
            class="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 shadow-2xs transition-colors cursor-pointer"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>
        `
      : '';

  return `
    <div class="space-y-4">
      <!-- Single Big Card Container (Breadcrumb stays strictly outside above, optional Breadcrumb In-Card inside top edge) -->
      <div class="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        ${topInCardHtml}
        <!-- Row 1: Unified Single-Row Top Header ([←] + Icon + Title ... [✏️] [🕒] [🗑️]) -->
        <header class="${
          subtitle
            ? 'py-3 px-4 sm:px-5 border-b border-slate-200 bg-white space-y-1'
            : 'py-3 px-4 sm:px-5 border-b border-slate-200 bg-white'
        }">
          <div class="flex items-center justify-between gap-3 sm:gap-4 flex-wrap sm:flex-nowrap">
            <!-- Left Side: Back Button + Domain Icon + Flexible Record Title -->
            <div class="flex items-center gap-3 flex-1 min-w-[175px] sm:min-w-0">
              <button
                type="button"
                data-nav="${escapeHtml(backButton.nav)}"
                data-nav-back="true"
                ${backButton.subview ? `data-subview="${escapeHtml(backButton.subview)}"` : ''}
                ${backButton.action ? `data-action="${escapeHtml(backButton.action)}"` : ''}
                title="Volver"
                aria-label="Volver"
                class="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 hover:text-slate-900 shadow-2xs transition-colors cursor-pointer shrink-0"
              >
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M19 12H5" />
                  <path d="M12 19l-7-7 7-7" />
                </svg>
              </button>

              <div class="flex items-center gap-2 flex-1 min-w-0">
                <span class="text-lg sm:text-xl select-none shrink-0" aria-hidden="true">${entitySymbol}</span>
                <h1 class="text-lg sm:text-xl font-bold tracking-tight text-slate-900 truncate min-w-0" title="${escapeHtml(title)}">
                  ${escapeHtml(title)}
                </h1>
                ${
                  eyebrowCode
                    ? `<span class="hidden md:inline-flex font-mono text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 shrink-0">${escapeHtml(eyebrowCode)}</span>`
                    : ''
                }
                ${
                  statusBadge
                    ? `
                      <span class="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border shrink-0 ${statusBadge.badgeClass}">
                        ${statusBadge.dotClass ? `<span class="w-1.5 h-1.5 rounded-full ${statusBadge.dotClass}"></span>` : ''}
                        ${statusBadge.symbol ? `<span aria-hidden="true">${statusBadge.symbol}</span>` : ''}
                        <span>${escapeHtml(statusBadge.label)}</span>
                      </span>
                    `
                    : ''
                }
                ${
                  secondaryHeaderBadge
                    ? `
                      <span class="hidden lg:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border shrink-0 ${
                        secondaryHeaderBadge.badgeClass || 'bg-slate-100 text-slate-700 border-slate-200'
                      }">
                        ${escapeHtml(secondaryHeaderBadge.label)}
                      </span>
                    `
                    : ''
                }
              </div>
            </div>

            <!-- Right Side: Icon-Only Action Buttons ([✏️] [🕒] [🗑️] or Add/Edit [✕] [💾]) -->
            <div class="flex flex-wrap items-center justify-end gap-2 shrink-0 ml-auto sm:ml-0 max-w-full">
              ${
                customTopActionsHtml !== undefined
                  ? customTopActionsHtml
                  : `
                    ${extraActionButtonsHtml}
                    ${topEditButtonHtml}
                    ${
                      !isCreateMode
                        ? `
                      <button
                        type="button"
                        data-action="open-changelog"
                        data-table-name="${escapeHtml(tableName)}"
                        data-record-id="${escapeHtml(recordId)}"
                        data-entity-name="${escapeHtml(title)}"
                        title="Historial de Cambios"
                        aria-label="Historial de Cambios"
                        class="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 shadow-2xs transition-colors cursor-pointer shrink-0"
                      >
                        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <circle cx="12" cy="12" r="9" />
                          <polyline points="12 7 12 12 15.5 14" />
                        </svg>
                      </button>
                      ${trailingActionButtonsHtml}
                    `
                        : ''
                    }
                    ${recordActionsHtml}
                  `
              }
            </div>
          </div>

          ${
            subtitle
              ? `<p class="text-xs text-slate-500 font-medium pl-12 truncate" title="${escapeHtml(subtitle)}">${escapeHtml(subtitle)}</p>`
              : ''
          }
        </header>

        <!-- Row 2 (Parent Data) + Divider + Row 3 (Direct Record Data) -->
        <div class="p-3.5 sm:p-4">
          ${parentZoneHtml}

          <section aria-label="Detalle del registro" class="space-y-2.5">
            ${feedbackHtml}
            ${customRecordBodyHtml ?? `${attributesHtml}${editableScopeHtml}`}
          </section>
        </div>

        ${
          betweenZone2AndZone3Html
            ? `<div class="px-3.5 pb-3.5 sm:px-4 sm:pb-4">${betweenZone2AndZone3Html}</div>`
            : ''
        }

        <!-- Row 4: Multipage Children -->
        ${childTabsHtml}
      </div>
      ${extraSectionsHtml}
      ${modalsHtml}
    </div>
  `;
}

export interface DetailFormTopActionsParams {
  mode: 'read' | 'add' | 'edit';
  isStaff: boolean;
  formId: string;
  saveBtnId: string;
  cancelBtnId: string;
  editBtnId: string;
  saveTitle?: string;
  cancelTitle?: string;
  editTitle?: string;
  showHistoryBtn?: boolean;
  showArchiveBtn?: boolean;
  historyBtnDataAction?: string;
  archiveBtnDataAction?: string;
  extraAuditAttrs?: string;
  extraArchiveAttrs?: string;
}

/**
 * Generates standardized Row 1 header top-right action buttons.
 * Enforces strict ordering in 'add' | 'edit': Save FIRST (emerald), Cancel SECOND (rose).
 * In 'read' mode for staff: [✏️] Edit, [🕒] History (when showHistoryBtn !== false), [🗄️] Archive (when showArchiveBtn !== false).
 */
export function renderDetailFormTopActions(params: DetailFormTopActionsParams): string {
  const {
    mode,
    isStaff,
    formId,
    saveBtnId,
    cancelBtnId,
    editBtnId,
    saveTitle,
    cancelTitle,
    editTitle = 'Editar atributos',
    showHistoryBtn = true,
    showArchiveBtn = true,
    historyBtnDataAction = 'open-changelog',
    archiveBtnDataAction = 'open-archive-modal',
    extraAuditAttrs = '',
    extraArchiveAttrs = '',
  } = params;

  if (!isStaff) {
    return '';
  }

  if (mode === 'add' || mode === 'edit') {
    const resolvedSaveTitle =
      saveTitle || (mode === 'add' ? 'Crear registro' : 'Guardar cambios');
    const resolvedCancelTitle =
      cancelTitle || (mode === 'add' ? 'Cancelar creación' : 'Cancelar edición');

    return `
      <button
        type="submit"
        form="${escapeHtml(formId)}"
        id="${escapeHtml(saveBtnId)}"
        title="${escapeHtml(resolvedSaveTitle)}"
        aria-label="${escapeHtml(resolvedSaveTitle)}"
        class="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer shadow-2xs shrink-0"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </button>
      <button
        type="button"
        id="${escapeHtml(cancelBtnId)}"
        title="${escapeHtml(resolvedCancelTitle)}"
        aria-label="${escapeHtml(resolvedCancelTitle)}"
        class="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors cursor-pointer shadow-2xs shrink-0"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>
    `;
  }

  const editHtml = `
    <button
      type="button"
      id="${escapeHtml(editBtnId)}"
      title="${escapeHtml(editTitle)}"
      aria-label="${escapeHtml(editTitle)}"
      class="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 shadow-2xs transition-colors cursor-pointer shrink-0"
    >
      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    </button>
  `;

  const historyHtml = showHistoryBtn
    ? `
      <button
        type="button"
        data-action="${escapeHtml(historyBtnDataAction)}"
        ${extraAuditAttrs}
        title="Historial de Cambios"
        aria-label="Historial de Cambios"
        class="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 shadow-2xs transition-colors cursor-pointer shrink-0"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <polyline points="12 7 12 12 15.5 14" />
        </svg>
      </button>
    `
    : '';

  const archiveHtml = showArchiveBtn
    ? `
      <button
        type="button"
        data-action="${escapeHtml(archiveBtnDataAction)}"
        ${extraArchiveAttrs}
        title="Archivar"
        aria-label="Archivar"
        class="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 shadow-2xs transition-colors cursor-pointer shrink-0"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 6h18" />
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          <line x1="10" x2="10" y1="11" y2="17" />
          <line x1="14" x2="14" y1="11" y2="17" />
        </svg>
      </button>
    `
    : '';

  return `${editHtml}${historyHtml}${archiveHtml}`;
}

export interface DetailBooleanFieldParams {
  mode: 'read' | 'add' | 'edit';
  inputId: string;
  name: string;
  label: string;
  checked: boolean;
  trueText?: string;
  falseText?: string;
  formId?: string;
  helpText?: string;
}

/**
 * Renders standardized boolean fields across Detail Views:
 * - In 'read': high-contrast status badge (✓ Sí / ✕ No) matching multisitio styling.
 * - In 'add' | 'edit': enabled checkbox strictly WITHOUT asterisk `*` on the label.
 */
export function renderDetailBooleanField(params: DetailBooleanFieldParams): string {
  const {
    mode,
    inputId,
    name,
    label,
    checked,
    trueText = 'Sí',
    falseText = 'No',
    formId,
    helpText,
  } = params;

  if (mode === 'read') {
    const badgeClass = checked
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : 'bg-slate-100 text-slate-600 border-slate-300';
    const symbol = checked ? '✓' : '✕';
    const text = checked ? trueText : falseText;

    return `
      <div class="space-y-1">
        <span class="block text-xs font-bold text-slate-700">${escapeHtml(label)}</span>
        <div class="flex items-center min-h-[34px]">
          <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-bold border ${badgeClass}">
            <span aria-hidden="true">${symbol}</span>
            <span>${escapeHtml(text)}</span>
          </span>
        </div>
        ${helpText ? `<p class="text-[11px] text-slate-500">${escapeHtml(helpText)}</p>` : ''}
      </div>
    `;
  }

  return `
    <div class="space-y-1">
      <span class="block text-xs font-bold text-slate-700">${escapeHtml(label)}</span>
      <label
        for="${escapeHtml(inputId)}"
        class="inline-flex items-center justify-between gap-2 w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs font-semibold cursor-pointer"
      >
        <span class="inline-flex items-center gap-2 min-w-0">
          <input
            type="checkbox"
            id="${escapeHtml(inputId)}"
            name="${escapeHtml(name)}"
            ${formId ? `form="${escapeHtml(formId)}"` : ''}
            ${checked ? 'checked' : ''}
            class="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer shrink-0"
          />
          <span class="truncate">${escapeHtml(label)}</span>
        </span>
      </label>
      ${helpText ? `<p class="text-[11px] text-slate-500">${escapeHtml(helpText)}</p>` : ''}
    </div>
  `;
}

export interface DetailParentSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface DetailParentSelectCardParams {
  mode: 'read' | 'add' | 'edit';
  formId: string;
  selectId: string;
  name: string;
  label: string;
  symbol?: string;
  selectedValue: string;
  options: DetailParentSelectOption[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  navAction?: DetailParentChip['navAction'];
}

/**
 * Renders an editable Zone 1 parent selector card styled consistently with Certificado parent fields.
 */
export function renderDetailParentSelectCard(params: DetailParentSelectCardParams): string {
  const {
    mode,
    formId,
    selectId,
    name,
    label,
    symbol,
    selectedValue,
    options,
    placeholder = 'Seleccione...',
    required = true,
    disabled = false,
    navAction,
  } = params;

  const isReadOnly = mode === 'read' || disabled;
  const cardClass = isReadOnly
    ? 'bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-1.5 min-w-0'
    : 'bg-slate-50/90 border border-indigo-200 rounded-xl p-2.5 sm:p-3 space-y-1.5 min-w-0';
  const selectClass = isReadOnly
    ? 'w-full rounded-lg border border-slate-200 bg-slate-100/80 text-slate-800 cursor-not-allowed px-2.5 py-1.5 text-xs font-semibold truncate'
    : 'w-full rounded-lg border border-slate-300 bg-white text-slate-900 px-2.5 py-1.5 text-xs font-semibold focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none truncate';

  const navBtnHtml =
    isReadOnly && navAction
      ? `
        <button
          type="button"
          data-parent-nav="true"
          data-nav="${escapeHtml(navAction.nav)}"
          ${navAction.subview ? `data-subview="${escapeHtml(navAction.subview)}"` : ''}
          ${navAction.entityType ? `data-parent-type="${escapeHtml(navAction.entityType)}"` : ''}
          ${navAction.entityId ? `data-entity-id="${escapeHtml(navAction.entityId)}"` : ''}
          ${
            navAction.sectorNumber !== undefined
              ? `data-sector-number="${escapeHtml(String(navAction.sectorNumber))}"`
              : ''
          }
          ${navAction.targetTab ? `data-target-tab="${escapeHtml(navAction.targetTab)}"` : ''}
          title="Abrir ${escapeHtml(label)}"
          aria-label="Abrir ${escapeHtml(label)}"
          class="inline-flex items-center justify-center w-5 h-5 rounded border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-600 hover:text-indigo-800 text-[11px] font-bold transition-colors cursor-pointer shrink-0"
        >
          →
        </button>
      `
      : '';

  return `
    <div class="${cardClass}">
      <div class="flex items-center justify-between gap-2">
        <label
          for="${escapeHtml(selectId)}"
          class="text-[10px] font-bold uppercase tracking-wider text-slate-500 inline-flex items-center gap-1 min-w-0 truncate"
        >
          ${symbol ? `<span aria-hidden="true" class="shrink-0">${symbol}</span>` : ''}
          <span class="truncate">${escapeHtml(label)}</span>
          ${required ? `<span class="text-rose-600 shrink-0" aria-hidden="true">*</span>` : ''}
        </label>
        ${navBtnHtml}
      </div>
      <select
        form="${escapeHtml(formId)}"
        id="${escapeHtml(selectId)}"
        name="${escapeHtml(name)}"
        ${required ? 'required' : ''}
        ${isReadOnly ? 'disabled' : ''}
        class="${selectClass}"
      >
        <option value="" ${selectedValue === '' ? 'selected' : ''}>${escapeHtml(placeholder)}</option>
        ${options
          .map(
            (opt) =>
              `<option value="${escapeHtml(opt.value)}" ${
                opt.value === selectedValue ? 'selected' : ''
              } ${opt.disabled ? 'disabled' : ''}>${escapeHtml(opt.label)}</option>`
          )
          .join('')}
      </select>
    </div>
  `;
}

/**
 * Renders the standardized square Multi View "+" creation button.
 */
export function renderMultiViewAddButton(
  dataAction: string,
  title: string,
  extraAttrs = ''
): string {
  return `
    <button
      type="button"
      data-action="${escapeHtml(dataAction)}"
      title="${escapeHtml(title)}"
      aria-label="${escapeHtml(title)}"
      ${extraAttrs}
      class="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-sky-700 hover:bg-sky-800 text-white transition-colors cursor-pointer shadow-2xs shrink-0"
    >
      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </svg>
    </button>
  `;
}
