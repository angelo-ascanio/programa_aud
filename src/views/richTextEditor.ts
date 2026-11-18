import { escapeHtml } from '../lib/html';
import {
  buildClauseRenderMaps,
  resolveClauseHtml,
  type ClauseRenderNode,
} from '../lib/clauseRenderer';
import type { RequisitoFormDraft, RequisitoLtree } from '../lib/extraDomain';
import {
  buildChildPlaceholderSuggestions,
  computeBilingualDraftStatus,
  countUnreferencedChildClauses,
  normalizeEditorHtmlOutput,
  type ChildPlaceholderOption,
  type RichTextEditorLang,
  type RichTextEditorMode,
} from '../lib/richTextEditor';

export interface BilingualClauseEditorProps {
  activeLang: RichTextEditorLang;
  activeMode: RichTextEditorMode;
  draft: Pick<
    RequisitoFormDraft,
    'title_es' | 'content_html_es' | 'title_en' | 'content_html_en'
  >;
  clauseId?: string;
  clauseCode?: string;
  clauseParentId?: string;
  idNorma?: string;
  normaRequisitos?: ReadonlyArray<RequisitoLtree>;
  linkPopoverOpen?: boolean;
  linkDraftUrl?: string;
  linkDraftLabel?: string;
  linkErrorMessage?: string | null;
  pickerOpen?: boolean;
  pickerQuery?: string;
  autocompleteOpen?: boolean;
  autocompleteQuery?: string;
  autocompleteActiveIndex?: number;
  unreferencedChildCount?: number;
  disabled?: boolean;
}

const EDITOR_PROSE_CLASSES =
  'clause-html-prose text-sm text-slate-800 leading-relaxed space-y-2 [&_p]:my-1.5 [&_div]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_strong]:font-bold [&_strong]:text-slate-900 [&_em]:italic [&_u]:underline [&_table]:w-full [&_table]:border-collapse [&_table]:my-2.5 [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-100 [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_td]:border [&_td]:border-slate-200 [&_td]:px-2.5 [&_td]:py-1.5 [&_td]:text-xs [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-slate-600 [&_a]:text-indigo-700 [&_a]:underline';

function toPreviewRenderNodes(
  normaRequisitos: ReadonlyArray<RequisitoLtree>,
  props: BilingualClauseEditorProps
): {
  previewClauseId: string;
  clausesById: Map<string, ClauseRenderNode>;
  clausesByNormaAndCode: Map<string, ClauseRenderNode>;
} {
  const targetNormaId = props.idNorma || 'preview-norma';
  const targetClauseId = props.clauseId || 'preview-current-clause';
  const targetCode = (props.clauseCode || 'borrador').trim() || 'borrador';

  const nodes: ClauseRenderNode[] = normaRequisitos.map((req) => ({
    id: req.id,
    id_norma: req.id_norma,
    codigo: req.codigo,
    id_requisito_padre: req.id_requisito_padre,
    explicit_code: req.explicit_code,
    translations: req.translations
      ? { ...req.translations }
      : req.descripcion && req.descripcion.trim()
      ? {
          es: {
            lang: 'es',
            title: req.titulo || '',
            content_html: `<p>${escapeHtml(req.descripcion.trim())}</p>`,
          },
        }
      : {},
  }));

  const normalizedEs = normalizeEditorHtmlOutput(props.draft.content_html_es);
  const normalizedEn = normalizeEditorHtmlOutput(props.draft.content_html_en);

  const draftTranslations: ClauseRenderNode['translations'] = {};
  if (normalizedEs || props.draft.title_es.trim()) {
    draftTranslations.es = {
      lang: 'es',
      title: props.draft.title_es.trim(),
      content_html: normalizedEs,
    };
  }
  if (normalizedEn || props.draft.title_en.trim()) {
    draftTranslations.en = {
      lang: 'en',
      title: props.draft.title_en.trim(),
      content_html: normalizedEn,
    };
  }

  const existingIdx = nodes.findIndex((n) => n.id === targetClauseId);
  if (existingIdx >= 0) {
    nodes[existingIdx] = {
      ...nodes[existingIdx],
      codigo: targetCode,
      translations: draftTranslations,
    };
  } else {
    nodes.push({
      id: targetClauseId,
      id_norma: targetNormaId,
      codigo: targetCode,
      translations: draftTranslations,
    });
  }

  const maps = buildClauseRenderMaps(nodes);
  return {
    previewClauseId: targetClauseId,
    clausesById: maps.clausesById,
    clausesByNormaAndCode: maps.clausesByNormaAndCode,
  };
}

function renderToolbarButton(params: {
  action?: string;
  cmd?: string;
  label: string;
  shortContent: string;
  title: string;
  disabled: boolean;
  extraAttributes?: string;
  variant?: 'default' | 'accent' | 'muted';
}): string {
  const {
    action = 'editor-cmd',
    cmd,
    label,
    shortContent,
    title,
    disabled,
    extraAttributes = '',
    variant = 'default',
  } = params;

  const variantClasses =
    variant === 'accent'
      ? 'border-indigo-200 bg-indigo-50/90 text-indigo-800 hover:bg-indigo-100 hover:border-indigo-300'
      : variant === 'muted'
      ? 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      : 'border-slate-200 bg-white text-slate-700 hover:bg-indigo-50 hover:text-indigo-800 hover:border-indigo-200';

  return `
    <button
      type="button"
      data-action="${escapeHtml(action)}"
      ${cmd ? `data-editor-cmd="${escapeHtml(cmd)}"` : ''}
      ${extraAttributes}
      aria-label="${escapeHtml(label)}"
      title="${escapeHtml(title)}"
      ${disabled ? 'disabled aria-disabled="true"' : ''}
      class="inline-flex items-center justify-center gap-1 min-h-[30px] px-2 py-1 rounded-md border text-xs font-semibold transition-colors ${
        disabled
          ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
          : `${variantClasses} cursor-pointer`
      }"
    >
      ${shortContent}
    </button>
  `;
}

function renderInlineLinkPopover(params: {
  isOpen: boolean;
  urlValue: string;
  labelValue: string;
  errorMessage: string | null;
}): string {
  const { isOpen, urlValue, labelValue, errorMessage } = params;
  return `
    <div
      id="reqEditorLinkPopover"
      data-testid="editor-link-popover"
      role="dialog"
      aria-label="Insertar enlace HTTPS"
      class="${
        isOpen ? 'flex' : 'hidden'
      } flex-col gap-2.5 w-72 sm:w-80 rounded-xl border border-slate-300 bg-white p-3 shadow-lg z-30 mt-1.5 sm:mt-0 sm:absolute sm:left-0 sm:top-full"
    >
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs font-bold text-slate-800">Insertar enlace externo</span>
        <span class="text-[10px] font-mono text-slate-500">^https?://</span>
      </div>

      <div class="space-y-1">
        <label for="reqEditorLinkUrlInput" class="block text-[11px] font-semibold text-slate-700">
          URL del enlace
        </label>
        <input
          id="reqEditorLinkUrlInput"
          type="url"
          data-editor-link-field="url"
          value="${escapeHtml(urlValue)}"
          placeholder="https://www.iso.org/..."
          class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div class="space-y-1">
        <label for="reqEditorLinkLabelInput" class="block text-[11px] font-semibold text-slate-700">
          Texto visible (opcional)
        </label>
        <input
          id="reqEditorLinkLabelInput"
          type="text"
          data-editor-link-field="label"
          value="${escapeHtml(labelValue)}"
          placeholder="Ej. Referencia normativa ISO"
          class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      ${
        errorMessage
          ? `
            <p role="alert" class="text-[11px] font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-2 py-1">
              ${escapeHtml(errorMessage)}
            </p>
          `
          : ''
      }

      <div class="flex items-center justify-end gap-1.5 pt-1">
        <button
          type="button"
          data-action="confirm-editor-link"
          class="px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors cursor-pointer"
        >
          Insertar enlace
        </button>
        <button
          type="button"
          data-action="close-editor-link-popover"
          class="px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
        >
          Cancelar
        </button>
      </div>
    </div>
  `;
}

export function renderClausePlaceholderPickerOptions(params: {
  options: ReadonlyArray<ChildPlaceholderOption>;
  filterQuery?: string;
  isCreateMode?: boolean;
}): string {
  const { options, filterQuery = '', isCreateMode = false } = params;
  if (options.length === 0) {
    const cleanQuery = filterQuery.trim();
    const emptyMsg = cleanQuery
      ? `Sin coincidencias para "${cleanQuery}".`
      : isCreateMode
      ? 'No hay cláusulas disponibles en esta norma para referenciar.'
      : 'Esta cláusula no tiene sub-cláusulas directas activas.';
    return `
      <div class="px-3 py-4 text-center text-xs italic text-slate-500">
        ${escapeHtml(emptyMsg)}
      </div>
    `;
  }

  return options
    .map((opt) => {
      const badgeHtml = opt.alreadyInserted
        ? '<span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">✓ Insertado</span>'
        : '<span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 shrink-0">Disponible</span>';
      return `
        <button
          type="button"
          data-action="insert-clause-placeholder"
          data-clause-token="${escapeHtml(opt.token)}"
          data-clause-codigo="${escapeHtml(opt.codigo)}"
          class="w-full text-left px-2.5 py-2 rounded-lg border border-transparent hover:border-indigo-200 hover:bg-indigo-50/70 transition-colors cursor-pointer flex items-start justify-between gap-2 group"
        >
          <div class="min-w-0 flex-1 space-y-0.5">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="font-mono text-xs font-bold text-indigo-700 shrink-0">${escapeHtml(opt.codigo)}</span>
              <span class="font-mono text-[10px] text-slate-500 truncate">${escapeHtml(opt.token)}</span>
            </div>
            <p class="text-[11px] text-slate-700 truncate">${escapeHtml(opt.titlePreview)}</p>
          </div>
          ${badgeHtml}
        </button>
      `;
    })
    .join('');
}

export function renderClausePlaceholderPickerPopover(params: {
  isOpen: boolean;
  query: string;
  options: ReadonlyArray<ChildPlaceholderOption>;
  isCreateMode?: boolean;
}): string {
  const { isOpen, query, options, isCreateMode = false } = params;
  return `
    <div
      id="reqEditorClausePickerPopover"
      data-testid="editor-clause-picker-popover"
      role="dialog"
      aria-label="Selector de sub-cláusulas para insertar placeholder"
      class="${
        isOpen ? 'flex' : 'hidden'
      } flex-col gap-2 w-80 sm:w-96 rounded-xl border border-slate-300 bg-white p-3 shadow-lg z-30 mt-1.5 sm:mt-0 sm:left-0 sm:top-full sm:absolute"
    >
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs font-bold text-slate-800">
          ${isCreateMode ? 'Insertar referencia {clause_...}' : 'Sub-cláusulas directas {clause_...}'}
        </span>
        <button
          type="button"
          data-action="close-clause-placeholder-picker"
          aria-label="Cerrar selector de sub-cláusulas"
          class="text-xs font-bold text-slate-400 hover:text-slate-700 px-1.5 py-0.5 rounded cursor-pointer"
        >
          ✕
        </button>
      </div>

      <input
        id="reqEditorClausePickerSearch"
        type="text"
        data-editor-picker-search="true"
        value="${escapeHtml(query)}"
        placeholder="Filtrar por código o título (ej. 5.1)..."
        aria-label="Filtrar sub-cláusula"
        class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />

      <div
        id="reqEditorClausePickerList"
        class="max-h-60 overflow-y-auto divide-y divide-slate-100 space-y-0.5 pr-0.5"
      >
        ${renderClausePlaceholderPickerOptions({
          options,
          filterQuery: query,
          isCreateMode,
        })}
      </div>
    </div>
  `;
}

export function renderClauseAutocompleteMenu(params: {
  isOpen: boolean;
  query: string;
  options: ReadonlyArray<ChildPlaceholderOption>;
  activeIndex: number;
}): string {
  const { isOpen, query, options, activeIndex } = params;
  const clampedIndex =
    options.length > 0
      ? Math.max(0, Math.min(options.length - 1, activeIndex))
      : -1;

  const listBody =
    options.length === 0
      ? `<div class="px-3 py-2.5 text-xs italic text-slate-500">Sin sub-cláusulas coincidentes${
          query ? ` para "${escapeHtml(query)}"` : ''
        }.</div>`
      : options
          .map((opt, idx) => {
            const isSelected = idx === clampedIndex;
            return `
              <button
                type="button"
                role="option"
                aria-selected="${isSelected ? 'true' : 'false'}"
                data-action="confirm-autocomplete-clause"
                data-clause-token="${escapeHtml(opt.token)}"
                data-clause-codigo="${escapeHtml(opt.codigo)}"
                data-autocomplete-index="${idx}"
                class="w-full text-left px-2.5 py-1.5 rounded-lg border transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                  isSelected
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                    : 'bg-white border-transparent hover:bg-slate-50 text-slate-800'
                }"
              >
                <div class="min-w-0 flex-1 flex items-center gap-2">
                  <span class="font-mono text-xs font-bold text-indigo-700 shrink-0">${escapeHtml(opt.codigo)}</span>
                  <span class="text-[11px] text-slate-700 truncate">${escapeHtml(opt.titlePreview)}</span>
                </div>
                <span class="font-mono text-[10px] shrink-0 ${
                  opt.alreadyInserted ? 'text-emerald-700 font-bold' : 'text-slate-400'
                }">
                  ${opt.alreadyInserted ? '✓' : escapeHtml(opt.token)}
                </span>
              </button>
            `;
          })
          .join('');

  return `
    <div
      id="reqEditorClauseAutocomplete"
      data-testid="editor-clause-autocomplete"
      role="listbox"
      aria-label="Autocompletado de sub-cláusulas"
      class="${
        isOpen ? 'flex' : 'hidden'
      } flex-col w-80 sm:w-96 max-w-[calc(100%-1rem)] rounded-xl border border-indigo-200 bg-white shadow-xl z-40 overflow-hidden mt-1"
    >
      <div class="px-2.5 py-1.5 bg-indigo-50/70 border-b border-indigo-100 flex items-center justify-between gap-2 text-[10px] font-semibold text-indigo-800">
        <span>Autocompletar placeholder {clause_...}</span>
        ${
          query
            ? `<span class="font-mono bg-white px-1.5 py-0.5 rounded border border-indigo-200">{${escapeHtml(query)}</span>`
            : ''
        }
      </div>
      <div id="reqEditorClauseAutocompleteList" class="max-h-52 overflow-y-auto p-1 space-y-0.5">
        ${listBody}
      </div>
      <div class="px-2.5 py-1 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-500 flex items-center justify-between">
        <span>↑↓ Navegar · Enter Insertar · Esc Cerrar</span>
      </div>
    </div>
  `;
}

/**
 * Renders the standalone, responsive, zero-dependency Bilingual Rich Text HTML Editor
 * for authoring normative clauses in Spanish (`es`) and English (`en`) across
 * `Visual`, `HTML`, and live `Vista Previa` modes.
 */
export function renderBilingualClauseEditor(props: BilingualClauseEditorProps): string {
  const activeLang: RichTextEditorLang = props.activeLang === 'en' ? 'en' : 'es';
  const activeMode: RichTextEditorMode =
    props.activeMode === 'html' || props.activeMode === 'preview'
      ? props.activeMode
      : 'visual';
  const disabled = Boolean(props.disabled);
  const toolbarDisabled = disabled || activeMode === 'preview';

  const status = computeBilingualDraftStatus(props.draft);
  const activeTitle =
    activeLang === 'es' ? props.draft.title_es || '' : props.draft.title_en || '';
  const activeRawHtml =
    activeLang === 'es'
      ? props.draft.content_html_es || ''
      : props.draft.content_html_en || '';
  const sanitizedVisualHtml = normalizeEditorHtmlOutput(activeRawHtml);

  const langTabs: ReadonlyArray<{
    id: RichTextEditorLang;
    label: string;
    shortFlag: string;
    hasContent: boolean;
    statusLabel: 'Con contenido' | 'Vacío';
  }> = [
    {
      id: 'es',
      label: 'Español (ES)',
      shortFlag: '🇪🇸',
      hasContent: status.es.hasContent,
      statusLabel: status.es.label,
    },
    {
      id: 'en',
      label: 'English (EN)',
      shortFlag: '🇬🇧',
      hasContent: status.en.hasContent,
      statusLabel: status.en.label,
    },
  ];

  const editorModes: ReadonlyArray<{
    id: RichTextEditorMode;
    label: string;
    title: string;
  }> = [
    {
      id: 'visual',
      label: 'Visual',
      title: 'Edición visual enriquecida (contenteditable)',
    },
    {
      id: 'html',
      label: 'HTML',
      title: 'Edición directa de código fuente HTML limpio',
    },
    {
      id: 'preview',
      label: 'Vista Previa',
      title: 'Previsualización en vivo con expansión de placeholders {clause_...}',
    },
  ];

  const allNormaReqs = props.normaRequisitos ?? [];
  const pickerSuggestions = buildChildPlaceholderSuggestions(
    props.clauseId,
    allNormaReqs,
    activeLang,
    activeRawHtml,
    props.pickerQuery ?? '',
    props.clauseParentId
  );
  const autocompleteSuggestions = buildChildPlaceholderSuggestions(
    props.clauseId,
    allNormaReqs,
    activeLang,
    activeRawHtml,
    props.autocompleteQuery ?? '',
    props.clauseParentId
  );

  const computedUnreferenced = countUnreferencedChildClauses(
    props.clauseId,
    allNormaReqs,
    activeRawHtml
  );
  const unreferencedCount = Math.max(
    0,
    Math.trunc(
      props.unreferencedChildCount !== undefined
        ? props.unreferencedChildCount
        : computedUnreferenced
    )
  );
  const subclauseSlotLabel =
    unreferencedCount > 0
      ? `<span>+ { } Sub-cláusula</span><span data-editor-unreferenced-count="true" class="inline-flex items-center px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">${unreferencedCount}</span>`
      : '<span>+ { } Sub-cláusula</span>';

  const unreferencedBadgeHtml =
    unreferencedCount > 0 && !toolbarDisabled
      ? `
        <button
          type="button"
          id="reqEditorUnreferencedBadgeBtn"
          data-action="insert-missing-child-clauses"
          data-testid="unreferenced-children-badge"
          title="Insertar ${unreferencedCount} ${
            unreferencedCount === 1 ? 'sub-cláusula sin referenciar' : 'sub-cláusulas sin referenciar'
          }"
          class="inline-flex items-center gap-1 min-h-[30px] px-2 py-1 rounded-md border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap"
        >
          <span>${unreferencedCount} ${
            unreferencedCount === 1 ? 'sub-cláusula sin referenciar' : 'sub-cláusulas sin referenciar'
          }</span>
        </button>
      `
      : '';

  const autocompleteMenuHtml =
    activeMode !== 'preview' && !disabled
      ? renderClauseAutocompleteMenu({
          isOpen: Boolean(props.autocompleteOpen),
          query: props.autocompleteQuery ?? '',
          options: autocompleteSuggestions,
          activeIndex: props.autocompleteActiveIndex ?? 0,
        })
      : '';

  let workspaceHtml = '';

  if (activeMode === 'visual') {
    const visualAriaLabel =
      activeLang === 'es'
        ? 'Editor visual de contenido normativo en Español'
        : 'Visual normative clause content editor in English';

    workspaceHtml = `
      <div class="relative bg-white">
        <div
          id="reqEditorVisualCanvas"
          role="textbox"
          aria-multiline="true"
          aria-label="${escapeHtml(visualAriaLabel)}"
          contenteditable="${disabled ? 'false' : 'true'}"
          data-editor-canvas="visual"
          data-editor-lang="${activeLang}"
          class="min-h-[240px] max-h-[520px] overflow-y-auto p-4 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500/40 ${EDITOR_PROSE_CLASSES}"
        >${sanitizedVisualHtml}</div>
        ${
          !sanitizedVisualHtml
            ? `<p id="reqEditorVisualEmptyHint" class="px-4 pb-3 text-xs italic text-slate-400 pointer-events-none select-none">Sin contenido redactado en ${
                activeLang === 'es' ? 'español' : 'inglés'
              }. Escribe arriba, teclea { para autocompletar o usa la barra de formato.</p>`
            : ''
        }
        <div
          id="reqEditorAutocompleteAnchor"
          class="absolute left-3 top-11 z-40 max-w-[calc(100%-1.5rem)] pointer-events-auto"
        >
          ${autocompleteMenuHtml}
        </div>
      </div>
    `;
  } else if (activeMode === 'html') {
    const htmlAriaLabel =
      activeLang === 'es'
        ? 'Editor de código fuente HTML en Español'
        : 'HTML source editor in English';

    workspaceHtml = `
      <div class="relative bg-slate-50/40">
        <textarea
          id="reqEditorHtmlTextarea"
          data-editor-canvas="html"
          data-editor-lang="${activeLang}"
          aria-label="${escapeHtml(htmlAriaLabel)}"
          rows="12"
          spellcheck="false"
          ${disabled ? 'disabled' : ''}
          placeholder="${
            activeLang === 'es'
              ? '<p>La organización debe determinar...</p>'
              : '<p>The organization shall determine...</p>'
          }"
          class="w-full min-h-[240px] p-4 font-mono text-xs leading-relaxed text-slate-800 bg-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500/40 resize-y"
        >${escapeHtml(activeRawHtml)}</textarea>
        <div
          id="reqEditorAutocompleteAnchor"
          class="absolute left-3 top-11 z-40 max-w-[calc(100%-1.5rem)] pointer-events-auto"
        >
          ${autocompleteMenuHtml}
        </div>
      </div>
    `;
  } else {
    const previewMaps = toPreviewRenderNodes(props.normaRequisitos ?? [], props);
    const resolved = resolveClauseHtml({
      clauseId: previewMaps.previewClauseId,
      lang: activeLang,
      clausesById: previewMaps.clausesById,
      clausesByNormaAndCode: previewMaps.clausesByNormaAndCode,
      interactiveLinks: false,
    });

    const warnings: string[] = [];
    if (resolved.unresolvedTokens.length > 0) {
      warnings.push(
        `Placeholders sin definir en esta norma: ${resolved.unresolvedTokens
          .map((code) => `{clause_${code}}`)
          .join(', ')}`
      );
    }
    if (resolved.cycleDetected) {
      warnings.push(
        'Se detectó una referencia circular protegida al expandir placeholders.'
      );
    }

    const previewHeading =
      activeTitle.trim() ||
      (activeLang === 'es' ? 'Sin título en Español' : 'Untitled in English');

    workspaceHtml = `
      <div
        id="reqEditorPreviewPane"
        data-editor-canvas="preview"
        data-editor-lang="${activeLang}"
        class="min-h-[240px] p-4 sm:p-5 bg-slate-50/40 space-y-3"
      >
        <div class="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/80">
          <div class="flex flex-wrap items-center gap-2 min-w-0">
            ${
              props.clauseCode
                ? `<span class="font-mono text-xs font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">${escapeHtml(
                    props.clauseCode
                  )}</span>`
                : ''
            }
            <h4 class="text-sm font-bold text-slate-900 truncate">
              ${escapeHtml(previewHeading)}
            </h4>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            ${
              resolved.resolvedChildCodes.length > 0
                ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">${resolved.resolvedChildCodes.length} sub-cláusulas expandidas</span>`
                : ''
            }
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white text-slate-700 border border-slate-200">
              ${activeLang === 'es' ? '🇪🇸 Vista Previa ES' : '🇬🇧 Preview EN'}
            </span>
          </div>
        </div>

        ${
          warnings.length > 0
            ? `
              <div role="status" class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 space-y-1">
                ${warnings.map((w) => `<p>${escapeHtml(w)}</p>`).join('')}
              </div>
            `
            : ''
        }

        ${
          resolved.html
            ? `<div class="${EDITOR_PROSE_CLASSES} rounded-lg bg-white border border-slate-200 p-4">${resolved.html}</div>`
            : `<div class="rounded-lg border border-dashed border-slate-300 bg-white/80 p-6 text-center text-xs italic text-slate-500">Sin contenido redactado en ${
                activeLang === 'es' ? 'español' : 'inglés'
              } para previsualizar.</div>`
        }
      </div>
    `;
  }

  const titleLabel =
    activeLang === 'es'
      ? 'Título de la cláusula (Español)'
      : 'Clause title (English)';
  const titlePlaceholder =
    activeLang === 'es'
      ? 'Ej. Comprensión de la organización y de su contexto'
      : 'E.g. Understanding the organization and its context';

  return `
    <section
      data-testid="bilingual-clause-editor"
      data-active-lang="${activeLang}"
      data-active-mode="${activeMode}"
      aria-label="Editor bilingüe de contenido normativo"
      class="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-visible"
    >
      <header class="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 bg-slate-50/80 border-b border-slate-200 rounded-t-xl">
        <div
          role="group"
          aria-label="Idioma del borrador normativo"
          class="flex flex-wrap items-center gap-1.5"
        >
          ${langTabs
            .map((tab) => {
              const isSelected = tab.id === activeLang;
              return `
                <button
                  type="button"
                  data-action="set-editor-lang"
                  data-editor-lang="${tab.id}"
                  aria-pressed="${isSelected ? 'true' : 'false'}"
                  class="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-white text-indigo-800 border-indigo-300 shadow-2xs'
                      : 'bg-slate-100/80 text-slate-600 border-transparent hover:bg-white hover:text-slate-900'
                  }"
                >
                  <span aria-hidden="true">${tab.shortFlag}</span>
                  <span>${escapeHtml(tab.label)}</span>
                  <span
                    data-editor-status-lang="${tab.id}"
                    class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${
                      tab.hasContent
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                    }"
                  >
                    ${escapeHtml(tab.statusLabel)}
                  </span>
                </button>
              `;
            })
            .join('')}
        </div>

        <div
          role="group"
          aria-label="Modo del editor"
          class="inline-flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-100/90 p-1"
        >
          ${editorModes
            .map((modeOpt) => {
              const isActive = modeOpt.id === activeMode;
              return `
                <button
                  type="button"
                  data-action="set-editor-mode"
                  data-editor-mode="${modeOpt.id}"
                  aria-pressed="${isActive ? 'true' : 'false'}"
                  title="${escapeHtml(modeOpt.title)}"
                  class="px-2.5 py-1 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-white text-indigo-700 border border-indigo-200 shadow-2xs'
                      : 'text-slate-600 border border-transparent hover:text-slate-900 hover:bg-white/60'
                  }"
                >
                  ${escapeHtml(modeOpt.label)}
                </button>
              `;
            })
            .join('')}
        </div>
      </header>

      <div class="px-3 sm:px-4 py-3 border-b border-slate-200/80 bg-white">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-1">
          <label for="reqEditorTitleInput" class="text-xs font-bold text-slate-700">
            ${escapeHtml(titleLabel)}
          </label>
          <span class="text-[11px] font-medium text-slate-500">
            ${
              activeLang === 'es'
                ? `EN: ${status.en.hasTitle ? 'Título listo' : 'Sin título'} · ${status.en.label}`
                : `ES: ${status.es.hasTitle ? 'Título listo' : 'Sin título'} · ${status.es.label}`
            }
          </span>
        </div>
        <input
          id="reqEditorTitleInput"
          type="text"
          maxlength="500"
          data-editor-field="title"
          data-editor-lang="${activeLang}"
          value="${escapeHtml(activeTitle)}"
          placeholder="${escapeHtml(titlePlaceholder)}"
          ${disabled ? 'disabled' : ''}
          class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div
        role="toolbar"
        aria-label="Herramientas de formato normativo"
        class="relative flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-slate-200 bg-slate-50/90"
      >
        <div class="flex flex-wrap items-center gap-1 pr-2 border-r border-slate-200">
          ${renderToolbarButton({
            cmd: 'bold',
            label: 'Negrita',
            shortContent: '<span class="font-extrabold">B</span>',
            title: 'Negrita (<strong>)',
            disabled: toolbarDisabled,
          })}
          ${renderToolbarButton({
            cmd: 'italic',
            label: 'Cursiva',
            shortContent: '<span class="italic font-serif font-bold">I</span>',
            title: 'Cursiva (<em>)',
            disabled: toolbarDisabled,
          })}
          ${renderToolbarButton({
            cmd: 'paragraph',
            label: 'Párrafo o bloque',
            shortContent: '<span class="font-mono">¶</span>',
            title: 'Convertir en párrafo (<p>)',
            disabled: toolbarDisabled,
          })}
        </div>

        <div class="flex flex-wrap items-center gap-1 pr-2 border-r border-slate-200">
          ${renderToolbarButton({
            cmd: 'unordered-list',
            label: 'Lista con viñetas',
            shortContent: '<span>• Lista</span>',
            title: 'Lista con viñetas (<ul>)',
            disabled: toolbarDisabled,
          })}
          ${renderToolbarButton({
            cmd: 'ordered-list',
            label: 'Lista numerada',
            shortContent: '<span>1. Lista</span>',
            title: 'Lista numerada (<ol>)',
            disabled: toolbarDisabled,
          })}
        </div>

        <div class="flex flex-wrap items-center gap-1 pr-2 border-r border-slate-200">
          ${renderToolbarButton({
            cmd: 'insert-note',
            label: 'Insertar NOTA normativa',
            shortContent: '<span>NOTA</span>',
            title: 'Insertar bloque NOTA normativa',
            disabled: toolbarDisabled,
          })}
          ${renderToolbarButton({
            cmd: 'insert-table',
            label: 'Insertar Tabla 2 por 2',
            shortContent: '<span>Tabla 2×2</span>',
            title: 'Insertar tabla 2×2 de requisitos',
            disabled: toolbarDisabled,
          })}
          <div class="relative inline-flex flex-col sm:block">
            ${renderToolbarButton({
              action: 'toggle-editor-link-popover',
              label: 'Enlace https://',
              shortContent: '<span>Enlace https://</span>',
              title: 'Insertar enlace seguro https:// o http://',
              disabled: toolbarDisabled,
              extraAttributes: `aria-expanded="${
                props.linkPopoverOpen ? 'true' : 'false'
              }" aria-controls="reqEditorLinkPopover"`,
            })}
            ${renderInlineLinkPopover({
              isOpen: Boolean(props.linkPopoverOpen) && !toolbarDisabled,
              urlValue: props.linkDraftUrl ?? '',
              labelValue: props.linkDraftLabel ?? '',
              errorMessage: props.linkErrorMessage ?? null,
            })}
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-1 pr-2 border-r border-slate-200">
          <div class="relative inline-flex flex-col sm:block">
            ${renderToolbarButton({
              action: 'toggle-clause-placeholder-picker',
              label: 'Insertar sub-cláusula',
              shortContent: subclauseSlotLabel,
              title: 'Insertar placeholder {clause_...} de sub-cláusula',
              disabled: toolbarDisabled,
              variant: 'accent',
              extraAttributes: `data-testid="editor-subclause-slot" aria-expanded="${
                props.pickerOpen ? 'true' : 'false'
              }" aria-controls="reqEditorClausePickerPopover"`,
            })}
            ${renderClausePlaceholderPickerPopover({
              isOpen: Boolean(props.pickerOpen) && !toolbarDisabled,
              query: props.pickerQuery ?? '',
              options: pickerSuggestions,
              isCreateMode: !props.clauseId,
            })}
          </div>
          <span id="reqEditorUnreferencedBadgeSlot" class="inline-flex items-center">
            ${unreferencedBadgeHtml}
          </span>
        </div>

        <div class="flex flex-wrap items-center gap-1 ml-auto">
          ${renderToolbarButton({
            cmd: 'clear-format',
            label: 'Limpiar formato',
            shortContent: '<span>Limpiar formato</span>',
            title: 'Quitar formato en línea',
            disabled: toolbarDisabled,
            variant: 'muted',
          })}
          ${renderToolbarButton({
            cmd: 'undo',
            label: 'Deshacer',
            shortContent: '<span>Deshacer</span>',
            title: 'Deshacer último cambio',
            disabled: toolbarDisabled,
            variant: 'muted',
          })}
        </div>
      </div>

      ${workspaceHtml}

      <footer class="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t border-slate-200 bg-slate-50/70 rounded-b-xl text-[11px] text-slate-500">
        <span>
          ${
            activeMode === 'visual'
              ? 'Modo Visual · Formato semántico limpio y seguro.'
              : activeMode === 'html'
              ? 'Modo HTML · Etiquetas permitidas: p, div, strong, em, ul, ol, li, table, a.'
              : 'Vista Previa · Resuelve placeholders {clause_...} antes de guardar.'
          }
        </span>
        <span id="reqEditorFooterLangStatus" class="font-mono text-[10px] text-slate-400">
          ES: ${escapeHtml(status.es.label)} · EN: ${escapeHtml(status.en.label)}
        </span>
      </footer>
    </section>
  `;
}
