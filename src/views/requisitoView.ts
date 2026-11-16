import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import {
  buildClauseRenderMaps,
  countNormativeObligationTerms,
  resolveClauseHtml,
  type ClauseLanguage,
  type ClauseRenderNode,
  type NormativeObligationCounts,
  type ResolvedClauseResult,
} from '../lib/clauseRenderer';
import {
  REQUISITO_CODIGO_MAX_LENGTH,
  buildRequisitoNavigationContext,
  createEmptyRequisitoFormDraft,
  createRequisitoDraftFromEntity,
  filterValidParentRequisitos,
  getRequisitoBilingualTitles,
  sliceRequisitoSiblingsWindow,
  type NormaEntity,
  type RequisitoDetailMode,
  type RequisitoFormDraft,
  type RequisitoLtree,
  type RequisitoNavigationContext,
} from '../lib/extraDomain';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import {
  renderDetailBooleanField,
  renderDetailFormTopActions,
  renderDetailPageTemplate,
  renderDetailParentSelectCard,
  type DetailParentChip,
} from './detailTemplate';
import { renderBilingualClauseEditor } from './richTextEditor';
import type { RichTextEditorLang, RichTextEditorMode } from '../lib/richTextEditor';
import { canArchiveRecord } from '../lib/archiveGovernance';

export type RequisitoChildTab = 'subrequisitos' | 'procesos';
export type RequisitoLangMode = 'es' | 'en' | 'both';

export interface RequisitoViewState {
  selectedRequisitoId: string | null;
  prefillNormaId?: string | null;
  prefillPadreId?: string | null;
  activeChildTab?: RequisitoChildTab;
  langMode?: RequisitoLangMode;
  isContentCollapsed?: boolean;
  editorLang?: RichTextEditorLang;
  editorMode?: RichTextEditorMode;
  linkPopoverOpen?: boolean;
  linkDraftUrl?: string;
  linkDraftLabel?: string;
  linkErrorMessage?: string | null;
  clausePickerOpen?: boolean;
  clausePickerQuery?: string;
  isCreating?: boolean;
  isEditingAttributes?: boolean;
  formDraft?: RequisitoFormDraft;
  editErrorMessage?: string | null;
}

export interface RequisitoProcesoLinkRow {
  id: string;
  id_certificado: string;
  numero_certificado: string;
  nombre_proceso: string;
  tipo: string;
  responsable: string;
}

export interface RequisitoViewProps {
  profile: UserProfile;
  state: RequisitoViewState;
  requisitos: ReadonlyArray<RequisitoLtree>;
  normas: ReadonlyArray<NormaEntity>;
  certificados?: ReadonlyArray<CertificadoDetailEntity>;
  tableColumnWidths?: Record<string, Record<string, number>>;
}

export function resolveRequisitoDetailMode(
  state: RequisitoViewState,
  isStaff: boolean,
  selectedRequisito?: RequisitoLtree
): RequisitoDetailMode {
  if (!isStaff) {
    return 'read';
  }
  if (state.isCreating && !state.selectedRequisitoId) {
    return 'add';
  }
  if (selectedRequisito && state.isEditingAttributes) {
    return 'edit';
  }
  return 'read';
}

function resolveLangMode(raw?: string): RequisitoLangMode {
  if (raw === 'en' || raw === 'both') return raw;
  return 'es';
}

function toClauseRenderNodes(
  normaRequisitos: ReadonlyArray<RequisitoLtree>
): ClauseRenderNode[] {
  return normaRequisitos.map((req) => {
    const legacyEsHtml =
      !req.translations && req.descripcion && req.descripcion.trim()
        ? `<p>${escapeHtml(req.descripcion.trim())}</p>`
        : '';
    return {
      id: req.id,
      id_norma: req.id_norma,
      codigo: req.codigo,
      id_requisito_padre: req.id_requisito_padre,
      explicit_code: req.explicit_code,
      translations: req.translations
        ? req.translations
        : legacyEsHtml
        ? {
            es: {
              lang: 'es',
              title: req.titulo || '',
              content_html: legacyEsHtml,
            },
          }
        : {},
    };
  });
}

export function renderRequisitoView(props: RequisitoViewProps): string {
  const { profile, state, requisitos, normas } = props;

  const isStaff = isApprovedStaffProfile(profile);
  const activeNormas = normas
    .filter((n) => !n.deleted_at)
    .slice()
    .sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));
  const activeRequisitos = requisitos.filter((r) => !r.deleted_at);

  const selectedReq = state.selectedRequisitoId
    ? activeRequisitos.find((r) => r.id === state.selectedRequisitoId)
    : undefined;

  const mode = resolveRequisitoDetailMode(state, isStaff, selectedReq);
  const isCreateMode = mode === 'add';
  const isReadOnly = mode === 'read';
  const langMode = resolveLangMode(state.langMode);

  const draft: RequisitoFormDraft =
    mode === 'add'
      ? state.formDraft ??
        createEmptyRequisitoFormDraft(
          state.prefillNormaId || '',
          state.prefillPadreId || ''
        )
      : mode === 'edit'
      ? state.formDraft ??
        (selectedReq
          ? createRequisitoDraftFromEntity(selectedReq)
          : createEmptyRequisitoFormDraft(
              state.prefillNormaId || '',
              state.prefillPadreId || ''
            ))
      : selectedReq
      ? createRequisitoDraftFromEntity(selectedReq)
      : createEmptyRequisitoFormDraft(
          state.prefillNormaId || '',
          state.prefillPadreId || ''
        );

  const targetNormaId =
    draft.id_norma || selectedReq?.id_norma || state.prefillNormaId || '';
  const parentNorma = activeNormas.find((n) => n.id === targetNormaId);

  const validParentCandidates = filterValidParentRequisitos(
    activeRequisitos,
    targetNormaId,
    isCreateMode ? undefined : selectedReq?.id
  );

  const normaRequisitos = targetNormaId
    ? activeRequisitos.filter((r) => r.id_norma === targetNormaId)
    : activeRequisitos;

  const navContext: RequisitoNavigationContext | null = selectedReq
    ? buildRequisitoNavigationContext(selectedReq, normaRequisitos)
    : null;

  const directSubrequisitos = navContext ? navContext.directChildren : [];

  const staffTopActionsHtml = isStaff
    ? renderDetailFormTopActions({
        mode,
        isStaff: true,
        formId: 'requisitoDetailForm',
        saveBtnId: 'saveRequisitoFormBtn',
        cancelBtnId: 'cancelEditRequisitoBtn',
        editBtnId: 'startEditRequisitoBtn',
        saveTitle: isCreateMode ? 'Crear requisito' : 'Guardar cambios',
        cancelTitle: isCreateMode ? 'Cancelar creación' : 'Cancelar edición',
        editTitle: 'Editar requisito',
        showHistoryBtn: !isCreateMode,
        showArchiveBtn: !isCreateMode && canArchiveRecord(profile),
        extraAuditAttrs: selectedReq
          ? `data-table-name="requisito" data-record-id="${escapeHtml(selectedReq.id)}" data-entity-name="${escapeHtml(`Cláusula ${selectedReq.codigo}`)}"`
          : '',
        extraArchiveAttrs: selectedReq
          ? `data-archive-table="requisito" data-archive-id="${escapeHtml(selectedReq.id)}" data-archive-entity-label="Requisito Normativo" data-archive-title="${escapeHtml(`Cláusula ${selectedReq.codigo}`)}" data-archive-subtitle="${escapeHtml(getRequisitoBilingualTitles(selectedReq).primaryTitle || `Cláusula ${selectedReq.codigo}`)}"`
          : '',
      })
    : '';

  const addSubclauseBtnHtml =
    isStaff && isReadOnly && selectedReq
      ? `
        <button
          type="button"
          data-action="open-create-requisito"
          data-norma-id="${escapeHtml(selectedReq.id_norma)}"
          data-parent-req-id="${escapeHtml(selectedReq.id)}"
          title="Agregar Sub-cláusula"
          aria-label="Agregar Sub-cláusula"
          class="inline-flex items-center justify-center gap-1 px-2.5 h-9 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer shrink-0"
        >
          <span aria-hidden="true">+</span>
          <span class="hidden sm:inline">Sub-cláusula</span>
        </button>
      `
      : '';

  // Keep empty string for non-staff so detailTemplate does not fall back to default changelog/edit buttons
  const customTopActionsHtml = isStaff
    ? [addSubclauseBtnHtml, staffTopActionsHtml].filter(Boolean).join('')
    : '';

  const readParents: DetailParentChip[] = selectedReq
    ? [
        {
          label: 'Norma ISO',
          value: parentNorma
            ? `${parentNorma.codigo} — ${parentNorma.titulo}`
            : selectedReq.norma_codigo,
          symbol: '📘',
          navAction: {
            nav: 'extra',
            subview: 'standards',
            entityType: 'norma',
            entityId: parentNorma?.id || selectedReq.id_norma,
            targetTab: 'requisitos',
          },
        },
        ...(navContext?.parentReq
          ? [
              {
                label: 'Cláusula Padre',
                value: `${navContext.parentReq.codigo} — ${getRequisitoBilingualTitles(navContext.parentReq).primaryTitle}`,
                symbol: '🌳',
                navAction: {
                  nav: 'extra',
                  subview: 'standards',
                  entityType: 'requisito' as const,
                  entityId: navContext.parentReq.id,
                  targetTab: 'subrequisitos',
                },
              },
            ]
          : []),
      ]
    : [];

  const customParentZoneHtml = !isReadOnly
    ? `
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        ${renderDetailParentSelectCard({
          mode,
          formId: 'requisitoDetailForm',
          selectId: 'reqParentNormaSelect',
          name: 'id_norma',
          label: 'Norma ISO',
          symbol: '📘',
          selectedValue: targetNormaId,
          placeholder: 'Seleccione Norma ISO...',
          required: true,
          options: activeNormas.map((n) => ({
            value: n.id,
            label: `${n.codigo} — ${n.esquema}`,
          })),
        })}

        ${renderDetailParentSelectCard({
          mode,
          formId: 'requisitoDetailForm',
          selectId: 'reqParentRequisitoSelect',
          name: 'id_requisito_padre',
          label: 'Cláusula Padre (Opcional)',
          symbol: '🌳',
          selectedValue: draft.id_requisito_padre || '',
          placeholder: 'Ninguno (Cláusula raíz)',
          required: false,
          options: validParentCandidates.map((cand) => ({
            value: cand.id,
            label: `${cand.codigo} — ${getRequisitoBilingualTitles(cand).primaryTitle}`,
          })),
        })}
      </div>
    `
    : undefined;

  const feedbackHtml =
    !isReadOnly && state.editErrorMessage
      ? `
        <div role="alert" class="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800 flex items-center gap-2">
          <span aria-hidden="true">⚠️</span>
          <span>${escapeHtml(state.editErrorMessage)}</span>
        </div>
      `
      : '';

  const navigationZoneHtml =
    isReadOnly && selectedReq && navContext
      ? renderRequisitoNavigationZone({
          selectedReq,
          navContext,
          directSubrequisitos,
        })
      : '';

  const customRecordBodyHtml =
    isReadOnly && selectedReq
      ? renderRequisitoReadOnlyBody({
          req: selectedReq,
          normaRequisitos,
          langMode,
          isContentCollapsed: Boolean(state.isContentCollapsed),
          isStaff,
          navigationZoneHtml,
        })
      : renderRequisitoFormBody({
          mode: isCreateMode ? 'add' : 'edit',
          draft,
          selectedReq,
          state,
          targetNormaId,
          normaRequisitos,
        });

  return renderDetailPageTemplate({
    entityType: 'Requisito Normativo',
    entitySymbol: '🌳',
    title: isCreateMode
      ? 'Nuevo Requisito Normativo'
      : selectedReq
      ? `Cláusula ${selectedReq.codigo}`
      : 'Requisito Normativo',
    backButton: {
      label: 'Volver a la Norma',
      nav: 'extra',
      subview: 'standards',
      action: 'back-to-requisito-parent',
    },
    customTopActionsHtml,
    isCreateMode,
    parents: isReadOnly ? readParents : [],
    customParentZoneHtml,
    tableName: 'requisito',
    recordId: selectedReq?.id || '',
    feedbackHtml,
    attributes: [],
    customRecordBodyHtml,
    childTabs: [],
    extraSectionsHtml: '',
  });
}

function renderRequisitoNavigationZone(params: {
  selectedReq: RequisitoLtree;
  navContext: RequisitoNavigationContext;
  directSubrequisitos: ReadonlyArray<RequisitoLtree>;
}): string {
  const { selectedReq, navContext, directSubrequisitos } = params;
  const { siblings, prevSibling, nextSibling } = navContext;

  if (siblings.length === 0 && directSubrequisitos.length === 0) {
    return '';
  }

  const prevBtnHtml = prevSibling
    ? `
      <button
        type="button"
        data-action="select-requisito"
        data-requisito-id="${escapeHtml(prevSibling.id)}"
        class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-indigo-50 hover:border-indigo-300 text-slate-700 hover:text-indigo-800 text-xs font-semibold transition-colors cursor-pointer shrink-0 self-center"
        title="Cláusula anterior: ${escapeHtml(prevSibling.codigo)}"
      >
        <span aria-hidden="true">←</span>
        <span class="hidden sm:inline">Anterior</span>
        <span class="hidden md:inline font-mono text-[11px] text-slate-500">(${escapeHtml(prevSibling.codigo)})</span>
      </button>
    `
    : `
      <button
        type="button"
        disabled
        aria-disabled="true"
        class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-400 text-xs font-semibold cursor-not-allowed shrink-0 self-center"
        title="Sin cláusula anterior en este nivel"
      >
        <span aria-hidden="true">←</span>
        <span class="hidden sm:inline">Anterior</span>
      </button>
    `;

  const nextBtnHtml = nextSibling
    ? `
      <button
        type="button"
        data-action="select-requisito"
        data-requisito-id="${escapeHtml(nextSibling.id)}"
        class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-indigo-50 hover:border-indigo-300 text-slate-700 hover:text-indigo-800 text-xs font-semibold transition-colors cursor-pointer shrink-0 self-center"
        title="Siguiente cláusula: ${escapeHtml(nextSibling.codigo)}"
      >
        <span class="hidden md:inline font-mono text-[11px] text-slate-500">(${escapeHtml(nextSibling.codigo)})</span>
        <span class="hidden sm:inline">Siguiente</span>
        <span aria-hidden="true">→</span>
      </button>
    `
    : `
      <button
        type="button"
        disabled
        aria-disabled="true"
        class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-400 text-xs font-semibold cursor-not-allowed shrink-0 self-center"
        title="Sin cláusula siguiente en este nivel"
      >
        <span class="hidden sm:inline">Siguiente</span>
        <span aria-hidden="true">→</span>
      </button>
    `;

  const windowSlice = sliceRequisitoSiblingsWindow(siblings, selectedReq.id, 9);
  const needsCompactSelect = siblings.length > 9;

  const siblingPillsHtml = windowSlice.visibleSiblings
    .map((sib) => {
      const isCurrent = sib.id === selectedReq.id;
      const sibTitles = getRequisitoBilingualTitles(sib);
      const sibTitleLabel = sibTitles.isUnauthoredTitle ? '' : sibTitles.primaryTitle;
      return `
        <button
          type="button"
          data-action="select-requisito"
          data-requisito-id="${escapeHtml(sib.id)}"
          ${isCurrent ? 'aria-current="page"' : ''}
          title="${escapeHtml(`${sib.codigo} — ${sibTitles.primaryTitle}`)}"
          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border transition-colors cursor-pointer max-w-[150px] sm:max-w-[185px] min-w-0 ${
            isCurrent
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-indigo-50 hover:text-indigo-800 hover:border-indigo-300'
          }"
        >
          <span class="font-mono font-bold shrink-0">${escapeHtml(sib.codigo)}</span>
          ${
            sibTitleLabel
              ? `<span class="truncate ${isCurrent ? 'text-indigo-100' : 'text-slate-600'}">${escapeHtml(sibTitleLabel)}</span>`
              : ''
          }
        </button>
      `;
    })
    .join('');

  const compactJumpSelectHtml = needsCompactSelect
    ? `
      <select
        id="reqSiblingJumpSelect"
        data-action="jump-requisito-sibling"
        aria-label="Saltar a cláusula hermana del mismo nivel"
        class="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer max-w-[175px]"
      >
        ${siblings
          .map((sib) => {
            const sibTitle = getRequisitoBilingualTitles(sib).primaryTitle;
            return `<option value="${escapeHtml(sib.id)}" ${
              sib.id === selectedReq.id ? 'selected' : ''
            }>${escapeHtml(`${sib.codigo} — ${sibTitle}`)}</option>`;
          })
          .join('')}
      </select>
    `
    : '';

  const childPillsHtml =
    directSubrequisitos.length > 0
      ? directSubrequisitos
          .map((sub) => {
            const titles = getRequisitoBilingualTitles(sub);
            const titleLabel = titles.isUnauthoredTitle ? '' : titles.primaryTitle;
            return `
              <button
                type="button"
                data-action="select-requisito"
                data-requisito-id="${escapeHtml(sub.id)}"
                title="${escapeHtml(`${sub.codigo} — ${titles.primaryTitle}`)}"
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-indigo-200 bg-white hover:bg-indigo-50 hover:border-indigo-300 text-indigo-800 text-[11px] font-semibold transition-colors cursor-pointer max-w-[165px] sm:max-w-[215px] min-w-0"
              >
                <span class="font-mono font-bold shrink-0">${escapeHtml(sub.codigo)}</span>
                ${
                  titleLabel
                    ? `<span class="text-slate-600 truncate">${escapeHtml(titleLabel)}</span>`
                    : ''
                }
              </button>
            `;
          })
          .join('')
      : `<span class="text-[11px] italic text-slate-400 leading-tight">Sin sub-cláusulas directas</span>`;

  return `
    <section
      aria-label="Navegación de cláusulas hermanas y sub-cláusulas directas"
      class="rounded-xl border border-slate-200/90 bg-slate-50/70 p-2 sm:p-2.5"
    >
      <div class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
        ${prevBtnHtml}

        <div class="flex flex-col gap-1.5 min-w-0">
          <nav
            aria-label="Cláusulas hermanas del mismo nivel"
            class="flex flex-wrap items-center justify-center gap-1 min-w-0"
          >
            ${
              windowSlice.hiddenBefore > 0
                ? `<span class="text-[11px] font-mono text-slate-400 px-1" title="${windowSlice.hiddenBefore} cláusulas anteriores">…</span>`
                : ''
            }
            ${siblingPillsHtml}
            ${
              windowSlice.hiddenAfter > 0
                ? `<span class="text-[11px] font-mono text-slate-400 px-1" title="${windowSlice.hiddenAfter} cláusulas posteriores">…</span>`
                : ''
            }
            ${compactJumpSelectHtml}
          </nav>

          <nav
            aria-label="Sub-cláusulas directas"
            class="flex flex-wrap items-center justify-center gap-1 min-w-0 pt-1 border-t border-slate-200/70"
          >
            ${childPillsHtml}
          </nav>
        </div>

        ${nextBtnHtml}
      </div>
    </section>
  `;
}

const CLAUSE_PROSE_CLASSES =
  'clause-html-prose text-sm text-slate-800 leading-relaxed space-y-1.5 [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1 [&_li]:my-0.5 [&_strong]:font-bold [&_strong]:text-slate-900 [&_table]:w-full [&_table]:border-collapse [&_table]:my-2 [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-100 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_td]:border [&_td]:border-slate-200 [&_td]:px-2 [&_td]:py-1 [&_td]:text-xs [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-slate-600 [&_a]:text-indigo-700 [&_a]:underline';

function renderLanguageToggleGroup(langMode: RequisitoLangMode): string {
  const options: ReadonlyArray<{
    id: RequisitoLangMode;
    label: string;
    title: string;
  }> = [
    {
      id: 'es',
      label: 'es',
      title: 'Ver redacción normativa en Español',
    },
    {
      id: 'en',
      label: 'en',
      title: 'Ver redacción normativa en Inglés',
    },
    {
      id: 'both',
      label: 'ambos',
      title: 'Comparar lado a lado Español e Inglés (auditoría shall vs debe)',
    },
  ];

  return `
    <div
      role="group"
      aria-label="Idioma del contenido normativo"
      class="inline-flex flex-wrap items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-100/80 p-0.5"
    >
      ${options
        .map((opt) => {
          const active = opt.id === langMode;
          return `
            <button
              type="button"
              data-action="set-requisito-lang-mode"
              data-lang-mode="${opt.id}"
              aria-pressed="${active ? 'true' : 'false'}"
              title="${escapeHtml(opt.title)}"
              class="px-2.5 py-0.5 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                active
                  ? 'bg-white text-indigo-700 shadow-2xs border border-indigo-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60 border border-transparent'
              }"
            >
              ${escapeHtml(opt.label)}
            </button>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderNormativeObligationBadges(counts: NormativeObligationCounts): string {
  const badges: Array<{ label: string; count: number; cls: string }> = [
    {
      label: 'debe',
      count: counts.debe,
      cls: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    },
    {
      label: 'debería',
      count: counts.deberia,
      cls: 'bg-sky-50 text-sky-800 border-sky-200',
    },
    {
      label: 'shall',
      count: counts.shall,
      cls: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    },
    {
      label: 'should',
      count: counts.should,
      cls: 'bg-sky-50 text-sky-800 border-sky-200',
    },
  ].filter((item) => item.count > 0);

  if (badges.length === 0) {
    return '';
  }

  return `
    <div
      aria-label="Conteo de términos normativos"
      class="flex flex-wrap items-center gap-1"
    >
      ${badges
        .map(
          (item) => `
            <span
              data-normative-badge="${escapeHtml(item.label)}"
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border tabular-nums ${item.cls}"
            >
              <span>${escapeHtml(item.label)}:</span>
              <span class="font-mono">${item.count}</span>
            </span>
          `
        )
        .join('')}
    </div>
  `;
}

function renderSingleLanguageClauseCard(params: {
  req: RequisitoLtree;
  requestedLang: ClauseLanguage;
  resolved: ResolvedClauseResult;
  compactColumn?: boolean;
}): string {
  const { req, requestedLang, resolved, compactColumn = false } = params;
  const langFlag = requestedLang === 'es' ? '🇪🇸 Español' : '🇬🇧 English';
  const usedFlag = resolved.usedLang === 'en' ? '🇬🇧 English' : '🇪🇸 Español';
  const badgeLabel = resolved.isFallbackLang ? `${usedFlag} (respaldo)` : langFlag;
  const requestedLabel = requestedLang === 'es' ? 'español' : 'inglés';
  const usedLabel = resolved.usedLang === 'es' ? 'español' : 'inglés';

  const fallbackBannerHtml = resolved.isFallbackLang
    ? `
      <div
        role="status"
        class="rounded-lg border border-amber-200 bg-amber-50/90 px-2.5 py-1.5 text-xs text-amber-900 flex items-start justify-between gap-2"
      >
        <span class="flex items-start gap-2 min-w-0">
          <span aria-hidden="true" class="shrink-0">🌐</span>
          <span>
            El contenido solicitado en <strong>${requestedLabel}</strong> no está redactado en esta cláusula; se muestra el texto disponible en <strong>${usedLabel}</strong>.
          </span>
        </span>
        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border bg-amber-50 text-amber-800 border-amber-200 shrink-0">
          ${escapeHtml(badgeLabel)}
        </span>
      </div>
    `
    : '';

  if (!resolved.html || resolved.usedLang === 'none') {
    return `
      <div class="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-1.5">
        ${
          compactColumn
            ? `<div class="text-xs font-bold text-slate-700">${escapeHtml(langFlag)}</div>`
            : ''
        }
        <p class="text-xs italic text-slate-500">
          Sin contenido redactado en ${requestedLabel} para la cláusula ${escapeHtml(req.codigo)}.
        </p>
      </div>
    `;
  }

  const compactHeaderHtml = compactColumn
    ? `
      <div class="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-100">
        <span class="text-xs font-bold text-slate-700">${escapeHtml(langFlag)}</span>
      </div>
    `
    : '';

  return `
    <article
      aria-label="${escapeHtml(`${langFlag} · Cláusula ${req.codigo}`)}"
      class="rounded-xl border border-slate-200 bg-white ${compactColumn ? 'p-2.5 sm:p-3' : 'p-3 sm:p-3.5'} space-y-2 shadow-2xs"
    >
      ${compactHeaderHtml}
      ${fallbackBannerHtml}
      <div class="${CLAUSE_PROSE_CLASSES}">
        ${resolved.html}
      </div>
    </article>
  `;
}

function renderUnauthoredEmptyState(req: RequisitoLtree, isStaff: boolean): string {
  return `
    <div class="rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-4 sm:p-5 text-center space-y-2.5">
      <div class="inline-flex items-center justify-center w-9 h-9 rounded-full bg-amber-100 text-amber-800 text-base" aria-hidden="true">
        📝
      </div>
      <div class="max-w-xl mx-auto space-y-1">
        <h4 class="text-sm font-bold text-slate-900">
          Cláusula ${escapeHtml(req.codigo)} pendiente de redacción normativa
        </h4>
        <p class="text-xs text-slate-600 leading-relaxed">
          Esta cláusula cuenta con su estructura jerárquica registrada, pero el cuerpo normativo bilingüe (ES / EN) aún no ha sido redactado.
        </p>
      </div>
      ${
        isStaff
          ? `
            <div>
              <button
                type="button"
                data-action="start-edit-requisito"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer"
              >
                <span aria-hidden="true">✏️</span>
                <span>Redactar contenido normativo</span>
              </button>
            </div>
          `
          : ''
      }
    </div>
  `;
}

function accumulateNormativeCounts(
  target: NormativeObligationCounts,
  html: string,
  usedLang: ClauseLanguage | 'none'
): void {
  if (!html || usedLang === 'none') return;
  const counts = countNormativeObligationTerms(html);
  if (usedLang === 'es') {
    target.debe += counts.debe;
    target.deberia += counts.deberia;
  } else {
    target.shall += counts.shall;
    target.should += counts.should;
  }
}

function renderRequisitoReadOnlyBody(params: {
  req: RequisitoLtree;
  normaRequisitos: ReadonlyArray<RequisitoLtree>;
  langMode: RequisitoLangMode;
  isContentCollapsed: boolean;
  isStaff: boolean;
  navigationZoneHtml: string;
}): string {
  const {
    req,
    normaRequisitos,
    langMode,
    isContentCollapsed,
    isStaff,
    navigationZoneHtml,
  } = params;
  const nodes = toClauseRenderNodes(normaRequisitos);
  const { clausesById, clausesByNormaAndCode } = buildClauseRenderMaps(nodes);

  const obligationCounts: NormativeObligationCounts = {
    debe: 0,
    deberia: 0,
    shall: 0,
    should: 0,
  };

  let renderedContentPanelHtml = '';
  if (langMode === 'both') {
    const esResolved = resolveClauseHtml({
      clauseId: req.id,
      lang: 'es',
      clausesById,
      clausesByNormaAndCode,
      maxDepth: 10,
      interactiveLinks: true,
    });
    const enResolved = resolveClauseHtml({
      clauseId: req.id,
      lang: 'en',
      clausesById,
      clausesByNormaAndCode,
      maxDepth: 10,
      interactiveLinks: true,
    });

    accumulateNormativeCounts(obligationCounts, esResolved.html, esResolved.usedLang);
    if (!esResolved.isFallbackLang || enResolved.usedLang !== esResolved.usedLang) {
      accumulateNormativeCounts(obligationCounts, enResolved.html, enResolved.usedLang);
    }

    if (esResolved.usedLang === 'none' && enResolved.usedLang === 'none') {
      renderedContentPanelHtml = renderUnauthoredEmptyState(req, isStaff);
    } else {
      renderedContentPanelHtml = `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
          ${renderSingleLanguageClauseCard({
            req,
            requestedLang: 'es',
            resolved: esResolved,
            compactColumn: true,
          })}
          ${renderSingleLanguageClauseCard({
            req,
            requestedLang: 'en',
            resolved: enResolved,
            compactColumn: true,
          })}
        </div>
      `;
    }
  } else {
    const requestedLang: ClauseLanguage = langMode === 'en' ? 'en' : 'es';
    const resolved = resolveClauseHtml({
      clauseId: req.id,
      lang: requestedLang,
      clausesById,
      clausesByNormaAndCode,
      maxDepth: 10,
      interactiveLinks: true,
    });

    accumulateNormativeCounts(obligationCounts, resolved.html, resolved.usedLang);

    renderedContentPanelHtml =
      resolved.usedLang === 'none' || !resolved.html
        ? renderUnauthoredEmptyState(req, isStaff)
        : renderSingleLanguageClauseCard({
            req,
            requestedLang,
            resolved,
          });
  }

  const normativeBadgesHtml = renderNormativeObligationBadges(obligationCounts);

  return `
    <div class="space-y-2.5">
      <div class="inline-flex items-center gap-2 rounded-lg border border-slate-200/90 bg-slate-50/70 px-2.5 py-1">
        <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Código
        </span>
        <span class="text-xs font-mono font-bold text-indigo-700">
          ${escapeHtml(req.codigo)}
        </span>
      </div>

      ${navigationZoneHtml}

      <div
        aria-label="Bloque de contenido normativo"
        class="rounded-xl border border-slate-200/90 bg-slate-50/60 p-2.5 sm:p-3 space-y-2.5"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            id="toggleRequisitoContentBtn"
            data-action="toggle-requisito-content"
            aria-expanded="${!isContentCollapsed}"
            aria-controls="requisitoHtmlContentBody"
            class="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700 hover:text-indigo-700 transition-colors cursor-pointer"
          >
            <svg
              class="w-3.5 h-3.5 transition-transform duration-150 ${isContentCollapsed ? '-rotate-90' : 'rotate-0'}"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
            <span>CONTENIDO</span>
          </button>

          <div class="flex flex-wrap items-center justify-end gap-2 ml-auto">
            ${normativeBadgesHtml}
            ${renderLanguageToggleGroup(langMode)}
          </div>
        </div>

        ${
          !isContentCollapsed
            ? `<div id="requisitoHtmlContentBody">${renderedContentPanelHtml}</div>`
            : ''
        }
      </div>
    </div>
  `;
}

function renderRequisitoFormBody(params: {
  mode: 'add' | 'edit';
  draft: RequisitoFormDraft;
  selectedReq?: RequisitoLtree;
  state: RequisitoViewState;
  targetNormaId: string;
  normaRequisitos: ReadonlyArray<RequisitoLtree>;
}): string {
  const { mode, draft, selectedReq, state, targetNormaId, normaRequisitos } = params;
  const referenceTitle = selectedReq
    ? getRequisitoBilingualTitles(selectedReq).primaryTitle
    : '';
  const editorLang: RichTextEditorLang = state.editorLang === 'en' ? 'en' : 'es';
  const editorMode: RichTextEditorMode =
    state.editorMode === 'html' || state.editorMode === 'preview'
      ? state.editorMode
      : 'visual';

  return `
    <form id="requisitoDetailForm" novalidate class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-3">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div class="space-y-1">
          <label for="reqCodigoInput" class="block text-xs font-bold text-slate-700">
            Código de Cláusula <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <input
            id="reqCodigoInput"
            name="codigo"
            type="text"
            required
            maxlength="${REQUISITO_CODIGO_MAX_LENGTH}"
            value="${escapeHtml(draft.codigo)}"
            placeholder="Ej. 4, 4.1, 8.5.1"
            class="w-full text-xs font-mono font-bold px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
          <p class="text-[11px] text-slate-500">
            Máximo ${REQUISITO_CODIGO_MAX_LENGTH} caracteres (numeración ISO o Anexo SL).
          </p>
        </div>

        ${renderDetailBooleanField({
          mode,
          inputId: 'reqExplicitCodeInput',
          name: 'explicit_code',
          label: 'Código explícito en texto normativo',
          checked: Boolean(draft.explicit_code),
          formId: 'requisitoDetailForm',
          helpText: 'Oculta el prefijo automático cuando la redacción ya incluye la numeración.',
        })}
      </div>

      ${
        referenceTitle
          ? `
            <div class="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-600">
              <strong class="text-slate-800">Referencia de catálogo:</strong> ${escapeHtml(referenceTitle)}
            </div>
          `
          : ''
      }

      ${renderBilingualClauseEditor({
        activeLang: editorLang,
        activeMode: editorMode,
        draft,
        clauseId: mode === 'edit' ? selectedReq?.id : undefined,
        clauseCode: draft.codigo || selectedReq?.codigo || '',
        clauseParentId: draft.id_requisito_padre || undefined,
        idNorma: targetNormaId,
        normaRequisitos,
        linkPopoverOpen: Boolean(state.linkPopoverOpen),
        linkDraftUrl: state.linkDraftUrl ?? '',
        linkDraftLabel: state.linkDraftLabel ?? '',
        linkErrorMessage: state.linkErrorMessage ?? null,
        pickerOpen: Boolean(state.clausePickerOpen),
        pickerQuery: state.clausePickerQuery ?? '',
      })}
    </form>
  `;
}
