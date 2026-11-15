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
  modalsHtml?: string;
  isCreateMode?: boolean;
  customParentZoneHtml?: string;
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
    modalsHtml = '',
    isCreateMode = false,
    customParentZoneHtml,
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
                  ${tab.symbol ? `<span aria-hidden="true">${tab.symbol}</span>` : ''}
                  <span>${escapeHtml(tab.label)}</span>
                  <span class="text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    isActive ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-200/80 text-slate-600'
                  }">
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
      <!-- Single Big Card Container (Breadcrumb stays strictly outside above) -->
      <div class="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <!-- Row 1: Unified Single-Row Top Header ([←] + Icon + Title ... [✏️] [🕒] [🗑️]) -->
        <header class="${
          subtitle
            ? 'py-3 px-4 sm:px-5 border-b border-slate-200 bg-white space-y-1'
            : 'py-3 px-4 sm:px-5 border-b border-slate-200 bg-white'
        }">
          <div class="flex items-center justify-between gap-3 sm:gap-4">
            <!-- Left Side: Back Button + Domain Icon + Flexible Record Title -->
            <div class="flex items-center gap-3 flex-1 min-w-0">
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

            <!-- Right Side: Icon-Only Action Buttons ([✏️] [🕒] [🗑️]) -->
            <div class="flex items-center gap-2 shrink-0">
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

        <!-- Row 4: Multipage Children -->
        ${childTabsHtml}
      </div>
      ${extraSectionsHtml}
      ${modalsHtml}
    </div>
  `;
}
