import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/accessControl';
import { canArchiveRecord } from '../lib/archiveGovernance';
import type { RequisitoLtree } from '../lib/extraDomain';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import type { NonApplicableSmartMutationPreview } from '../lib/coverageEngine';
import {
  NO_APLICABLE_JUSTIFICACION_MAX_LENGTH,
  NO_APLICABLE_JUSTIFICACION_MIN_LENGTH,
  buildNoAplicablePickerRows,
  computeNoAplicableAncestorAdvisory,
  computeNoAplicableMutationPreview,
  createEmptyNoAplicableFormDraft,
  createNoAplicableFormDraftFromEntity,
  filterRequisitosForCertificado,
  groupPrunedLinksByProcess,
  resolveNoAplicableDetailMode,
  type NoAplicableAncestorAdvisory,
  type NoAplicableClauseMode,
  type NoAplicableDetailEntity,
  type NoAplicableFormDraft,
  type NoAplicablePickerRow,
  type NoAplicableViewState,
} from '../lib/noAplicableDomain';
import {
  filterVisibleHierarchyRows,
  getDefaultExpandedClauseIds,
} from '../lib/procesoDomain';
import {
  renderDetailFormTopActions,
  renderDetailPageTemplate,
  type DetailParentChip,
} from './detailTemplate';

export interface NoAplicableViewProps {
  profile: UserProfile;
  state: NoAplicableViewState;
  noAplicable: NoAplicableDetailEntity | null;
  activeCertVersionId?: string | null;
  isHistoricalCertVersion?: boolean;
  certificates: ReadonlyArray<CertificadoDetailEntity>;
  requirementsCatalog: ReadonlyArray<RequisitoLtree>;
  archivedNoAplicableIds?: ReadonlySet<string>;
  archivedProcesoIds?: ReadonlySet<string>;
}

export function renderNoAplicableView(props: NoAplicableViewProps): string {
  const {
    profile,
    state,
    noAplicable,
    isHistoricalCertVersion = false,
    certificates,
    requirementsCatalog,
    archivedNoAplicableIds,
    archivedProcesoIds,
  } = props;

  const isHistoricalLock = Boolean(isHistoricalCertVersion);
  const isStaff = isApprovedStaffProfile(profile) && !isHistoricalLock;
  const mode = resolveNoAplicableDetailMode(state, isStaff, noAplicable);
  const isCreateMode = mode === 'add';

  const draft: NoAplicableFormDraft =
    mode === 'add'
      ? state.formDraft ?? createEmptyNoAplicableFormDraft(state.originatingCertId)
      : mode === 'edit'
      ? state.formDraft ??
        (noAplicable
          ? createNoAplicableFormDraftFromEntity(noAplicable)
          : createEmptyNoAplicableFormDraft(state.originatingCertId))
      : noAplicable
      ? createNoAplicableFormDraftFromEntity(noAplicable)
      : createEmptyNoAplicableFormDraft(state.originatingCertId);

  const selectedCert =
    certificates.find((c) => c.id === draft.id_certificado) ||
    (noAplicable ? certificates.find((c) => c.id === noAplicable.id_certificado) : undefined) ||
    null;

  const availableRequisitos = filterRequisitosForCertificado({
    certId: draft.id_certificado,
    certificates,
    requirementsCatalog,
    currentNoAplicableId: mode === 'edit' ? noAplicable?.id || null : null,
    archivedNoAplicableIds,
  });

  const clauseFilterQuery = state.clauseFilterQuery || '';
  const clauseMode: NoAplicableClauseMode = state.clauseMode || 'all';
  const pickerRows: NoAplicablePickerRow[] = selectedCert
    ? buildNoAplicablePickerRows({
        cert: selectedCert,
        requirementsCatalog,
        currentNoAplicableId: mode === 'edit' ? noAplicable?.id || null : null,
        mode: clauseMode,
        filterQuery: clauseFilterQuery,
        archivedNoAplicableIds,
        archivedProcesoIds,
      })
    : [];
  const expandedClauseIds =
    clauseFilterQuery.trim().length > 0
      ? state.searchExpandedClauseIds
      : state.expandedClauseIds;

  const selectedReq =
    availableRequisitos.find((r) => r.id === draft.id_requisito) ||
    requirementsCatalog.find((r) => r.id === draft.id_requisito) ||
    null;

  const mutationPreview: NonApplicableSmartMutationPreview =
    (mode === 'add' || mode === 'edit') && selectedCert && draft.id_requisito
      ? computeNoAplicableMutationPreview({
          cert: selectedCert,
          targetRequisitoId: draft.id_requisito,
          requirementsCatalog,
          archivedProcesoIds,
        })
      : { willMutate: false, prunedLinks: [], affectedProcessCount: 0 };

  const ancestorAdvisory: NoAplicableAncestorAdvisory =
    (mode === 'add' || mode === 'edit') && selectedCert && draft.id_requisito
      ? computeNoAplicableAncestorAdvisory({
          cert: selectedCert,
          targetRequisitoId: draft.id_requisito,
          requirementsCatalog,
          currentNoAplicableId: mode === 'edit' ? noAplicable?.id || null : null,
          archivedNoAplicableIds,
        })
      : { type: 'NONE', overlappingCodigos: [], message: null };

  const title = isCreateMode
    ? 'Declarar Exclusión'
    : noAplicable
    ? `Cláusula ${noAplicable.requisito_codigo} — ${noAplicable.requisito_titulo}`
    : 'Exclusión de Requisito (ISO 4.3)';

  const eyebrowCode = isCreateMode
    ? selectedCert
      ? `${selectedCert.numero_certificado} · ${selectedCert.norma_codigo}`
      : 'ISO 4.3'
    : noAplicable
    ? `${noAplicable.numero_certificado} · ${noAplicable.norma_codigo}`
    : 'ISO 4.3';

  const subtitle = isCreateMode
    ? selectedCert
      ? `${selectedCert.organizacion_nombre} (${selectedCert.organizacion_rif}) · Exclusiones bajo norma ${selectedCert.norma_codigo}`
      : 'Declaración formal de requisito no aplicable conforme a ISO 9001 / ISO 17021-1 Cláusula 4.3'
    : noAplicable
    ? `${noAplicable.organizacion_nombre} (${noAplicable.organizacion_rif}) · Exclusión ISO 4.3`
    : '';

  const secondaryHeaderBadge =
    isCreateMode && selectedCert
      ? {
          label: `${selectedCert.noAplicables.length} exclusión${selectedCert.noAplicables.length === 1 ? '' : 'es'} declarada${selectedCert.noAplicables.length === 1 ? '' : 's'}`,
          badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
        }
      : !isCreateMode && noAplicable
      ? {
          label: `Cláusula ${noAplicable.requisito_codigo}`,
          badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
        }
      : undefined;

  const parents: DetailParentChip[] =
    mode === 'read' && noAplicable
      ? [
          {
            label: 'Organización',
            value: `${noAplicable.organizacion_nombre} (${noAplicable.organizacion_rif})`,
            symbol: '🏢',
            navAction: {
              nav: 'certificacion',
              subview: 'organizations',
              entityType: 'org',
              entityId: noAplicable.id_organizacion,
            },
          },
          {
            label: 'Certificado',
            value: `${noAplicable.numero_certificado} · ${noAplicable.norma_codigo}`,
            symbol: '📜',
            navAction: {
              nav: 'certificacion',
              subview: 'certificates',
              entityType: 'cert',
              entityId: noAplicable.id_certificado,
              targetTab: 'no_aplicables',
            },
          },
          {
            label: 'Norma',
            value: noAplicable.norma_codigo,
            symbol: '📘',
            navAction: {
              nav: 'extra',
              subview: 'standards',
              entityType: 'norma',
              entityId: noAplicable.id_norma,
            },
          },
          {
            label: 'Cláusula / Requisito',
            value: `${noAplicable.requisito_codigo} — ${noAplicable.requisito_titulo}`,
            symbol: '🧩',
            navAction: {
              nav: 'extra',
              subview: 'standards',
              entityType: 'requisito',
              entityId: noAplicable.id_requisito,
            },
          },
        ]
      : [];

  const customParentZoneHtml =
    mode === 'add' || mode === 'edit'
      ? renderNoAplicableParentSelector({
          draft,
          certificates,
          selectedCert,
        })
      : undefined;

  const betweenZone2AndZone3Html =
    mode === 'add' || mode === 'edit'
      ? renderNoAplicableClausePickerSection({
          draft,
          selectedCert,
          availableRequisitos,
          pickerRows,
          clauseFilterQuery,
          clauseMode,
          expandedClauseIds,
          selectedReq,
          mutationPreview,
          ancestorAdvisory,
          isCreateMode,
        })
      : '';

  const customTopActionsHtml = isStaff
    ? renderDetailFormTopActions({
        mode,
        isStaff: true,
        formId: 'noAplicableDetailForm',
        saveBtnId: 'saveNoAplicableBtn',
        cancelBtnId: 'cancelNoAplicableBtn',
        editBtnId: 'startEditNoAplicableBtn',
        saveTitle: isCreateMode ? 'Declarar exclusión' : 'Guardar cambios',
        cancelTitle: isCreateMode ? 'Cancelar declaración' : 'Cancelar edición',
        editTitle: 'Editar exclusión',
        showHistoryBtn: !isCreateMode,
        showArchiveBtn: !isCreateMode && canArchiveRecord(profile),
        archiveBtnDataAction: 'open-archive-no-aplicable',
        extraAuditAttrs: noAplicable
          ? `data-table-name="requisitos_no_aplicables_certificado" data-record-id="${escapeHtml(noAplicable.id)}" data-entity-name="${escapeHtml(`Cláusula ${noAplicable.requisito_codigo} · ${noAplicable.numero_certificado}`)}"`
          : '',
        extraArchiveAttrs: noAplicable
          ? `data-no-aplicable-id="${escapeHtml(noAplicable.id)}"`
          : '',
      })
    : '';

  const historicalBannerHtml =
    isHistoricalLock && !isCreateMode && noAplicable
      ? `
        <div role="status" class="p-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium rounded-lg flex items-center gap-2">
          <span aria-hidden="true">🔒</span>
          <span><strong>Versión histórica en solo lectura:</strong> esta exclusión ISO 4.3 corresponde a una versión anterior del certificado y no admite cambios.</span>
        </div>
      `
      : '';

  const feedbackHtml = `
    ${historicalBannerHtml}
    ${
      state.editErrorMessage
        ? `
          <div role="alert" class="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium rounded-lg flex items-center gap-2">
            <span aria-hidden="true">✕</span>
            <span>${escapeHtml(state.editErrorMessage)}</span>
          </div>
        `
        : ''
    }
    ${
      state.archiveErrorMessage
        ? `
          <div role="alert" class="p-3 bg-amber-50 border border-amber-300 text-amber-900 text-xs font-medium rounded-lg flex items-center gap-2">
            <span aria-hidden="true">⚠️</span>
            <span>${escapeHtml(state.archiveErrorMessage)}</span>
          </div>
        `
        : ''
    }
  `;

  const customRecordBodyHtml =
    mode === 'add' || mode === 'edit'
      ? renderNoAplicableFormBody({
          draft,
          selectedCert,
          selectedReq,
        })
      : noAplicable
      ? renderReadOnlyNoAplicableBody(noAplicable)
      : '';

  return renderDetailPageTemplate({
    entityType: 'Exclusión de Requisito',
    entitySymbol: '🚫',
    title,
    eyebrowCode,
    subtitle,
    statusBadge: {
      label: 'No Aplicable (ISO 4.3)',
      badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
      symbol: '🚫',
    },
    secondaryHeaderBadge,
    backButton: {
      label:
        !isCreateMode && noAplicable
          ? `Volver a ${noAplicable.numero_certificado}`
          : selectedCert
          ? `Volver a ${selectedCert.numero_certificado}`
          : 'Volver',
      nav: 'certificacion',
      subview: 'certificates',
      action: 'back-from-no-aplicable',
    },
    isCreateMode,
    customTopActionsHtml,
    parents,
    customParentZoneHtml,
    tableName: 'requisitos_no_aplicables_certificado',
    recordId: noAplicable?.id || 'new',
    feedbackHtml,
    attributes: [],
    customRecordBodyHtml,
    betweenZone2AndZone3Html,
    childTabs: [],
  });
}

const NA_TREE_INDENT_CLASSES: readonly string[] = [
  'pl-2.5',
  'pl-2.5',
  'pl-6',
  'pl-10',
  'pl-14',
  'pl-16',
  'pl-20',
];

function getNoAplicableRowIndentClass(level: number): string {
  const clamped = Math.max(1, Math.min(level, NA_TREE_INDENT_CLASSES.length - 1));
  return NA_TREE_INDENT_CLASSES[clamped] || 'pl-2.5';
}

export function renderNoAplicableRowsSubsetHtml(params: {
  rows: ReadonlyArray<NoAplicablePickerRow>;
  selectedReqId: string;
  expandedSet: ReadonlySet<string>;
  isSearching: boolean;
}): string {
  const { rows, selectedReqId, expandedSet, isSearching } = params;

  return rows
    .map((row) => {
      const indentClass = getNoAplicableRowIndentClass(
        isSearching ? (row.ancestorIds?.length || 0) + 1 : row.indentLevel
      );
      const isSelected = !row.disabled && selectedReqId === row.req.id;
      const isCollapsible = row.hasChildren;
      const isExpanded = isCollapsible && expandedSet.has(row.req.id);

      const statusBadges: string[] = [];
      if (row.isDuplicateExclusion) {
        statusBadges.push(
          `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-rose-50 text-rose-800 border-rose-200">⛔ Ya excluida directamente</span>`
        );
      } else if (row.activeProcessCount > 0) {
        const procTooltip =
          row.processNames.length > 0
            ? `En uso por: ${row.processNames.join(', ')}`
            : 'En uso por procesos activos';
        statusBadges.push(
          `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-indigo-50 text-indigo-800 border-indigo-200" title="${escapeHtml(procTooltip)}">🔗 En uso por ${row.activeProcessCount} proceso(s)</span>`
        );
      }

      const toggleControlHtml = isCollapsible
        ? `
          <button
            type="button"
            data-action="toggle-no-aplicable-clause-node"
            data-node-id="${escapeHtml(row.req.id)}"
            aria-expanded="${isExpanded}"
            title="${isExpanded ? 'Contraer subcláusulas' : 'Desplegar subcláusulas'}"
            class="w-5 h-5 inline-flex items-center justify-center rounded hover:bg-slate-200/80 text-slate-600 transition-colors cursor-pointer shrink-0"
          >
            <svg class="w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        `
        : `<span class="w-5 shrink-0" aria-hidden="true"></span>`;

      const leadText = row.hasTitle
        ? `${row.req.codigo} ${row.titleText}:`
        : row.req.codigo;
      const tooltipText = row.rawText ? `${leadText} ${row.rawText}` : leadText;
      const primaryColorClass = row.disabled ? 'text-slate-500' : 'text-slate-900';
      const primaryLeadHtml = row.hasTitle
        ? `<span class="font-bold ${primaryColorClass}"><span class="font-mono">${escapeHtml(row.req.codigo)}</span> ${escapeHtml(row.titleText)}:</span>`
        : `<span class="font-mono font-bold ${primaryColorClass}">${escapeHtml(row.req.codigo)}</span>`;
      const rawTextHtml = row.rawText
        ? ` <span class="font-normal ${row.disabled ? 'text-slate-400' : 'text-slate-500'}">${escapeHtml(row.rawText)}</span>`
        : '';

      return `
        <div
          data-na-clause-row="true"
          data-requisito-id="${escapeHtml(row.req.id)}"
          data-codigo="${escapeHtml(row.req.codigo)}"
          data-ancestor-ids="${escapeHtml((row.ancestorIds || []).join(','))}"
          class="flex items-center justify-between gap-2 py-2 pr-3 ${indentClass} ${
            row.disabled
              ? 'bg-slate-50/70 text-slate-400 opacity-85'
              : isSelected
              ? 'bg-indigo-50/60 hover:bg-indigo-50'
              : 'hover:bg-slate-50'
          } transition-colors"
        >
          <div class="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
            ${toggleControlHtml}
            <label class="flex items-center gap-2 min-w-0 flex-1 overflow-hidden ${row.disabled ? 'cursor-not-allowed' : 'cursor-pointer'}">
              <input
                type="radio"
                name="na_picker_requisito"
                value="${escapeHtml(row.req.id)}"
                ${isSelected ? 'checked' : ''}
                ${row.disabled ? 'disabled' : ''}
                class="h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0 ${
                  row.disabled ? 'cursor-not-allowed' : 'cursor-pointer'
                }"
              />
              <span class="block min-w-0 flex-1 truncate text-xs" title="${escapeHtml(tooltipText)}">
                ${primaryLeadHtml}${rawTextHtml}
              </span>
            </label>
          </div>
          ${
            statusBadges.length > 0
              ? `<span class="flex flex-wrap items-center gap-1.5 shrink-0">${statusBadges.join('')}</span>`
              : ''
          }
        </div>
      `;
    })
    .join('');
}

export function renderNoAplicableChecklistRowsHtml(params: {
  rows: ReadonlyArray<NoAplicablePickerRow>;
  selectedReqId: string;
  expandedClauseIds?: ReadonlySet<string> | ReadonlyArray<string>;
  filterQuery?: string;
}): string {
  const { rows, selectedReqId, expandedClauseIds } = params;
  const isSearching = Boolean(params.filterQuery && params.filterQuery.trim().length > 0);
  const effectiveExpandedSet =
    expandedClauseIds === undefined
      ? new Set(getDefaultExpandedClauseIds(rows))
      : expandedClauseIds instanceof Set
      ? expandedClauseIds
      : new Set(expandedClauseIds);
  const visibleRows = filterVisibleHierarchyRows(rows, expandedClauseIds);

  if (visibleRows.length === 0) {
    return `
      <div class="p-6 text-center text-xs text-slate-500">
        No se encontraron cláusulas que coincidan con el filtro seleccionado.
      </div>
    `;
  }

  return renderNoAplicableRowsSubsetHtml({
    rows: visibleRows,
    selectedReqId,
    expandedSet: effectiveExpandedSet,
    isSearching,
  });
}

function renderNoAplicableParentSelector(params: {
  draft: NoAplicableFormDraft;
  certificates: ReadonlyArray<CertificadoDetailEntity>;
  selectedCert: CertificadoDetailEntity | null;
}): string {
  const { draft, certificates, selectedCert } = params;

  return `
    <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
      <label for="naSelectCertificado" class="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
        Certificado y Norma Evaluada <span class="text-rose-600" aria-hidden="true">*</span>
      </label>
      <select
        id="naSelectCertificado"
        name="id_certificado"
        form="noAplicableDetailForm"
        required
        class="w-full text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
      >
        <option value="">Seleccione un certificado...</option>
        ${certificates
          .map((cert) => {
            const isSelected = cert.id === draft.id_certificado;
            return `
              <option value="${escapeHtml(cert.id)}" ${isSelected ? 'selected' : ''}>
                ${escapeHtml(cert.numero_certificado)} · ${escapeHtml(cert.norma_codigo)} (${escapeHtml(cert.organizacion_nombre)})
              </option>
            `;
          })
          .join('')}
      </select>
      <p class="text-[11px] text-slate-500">
        ${
          selectedCert
            ? `Norma del certificado: ${escapeHtml(selectedCert.norma_codigo)}. Las cláusulas disponibles se filtran estrictamente a esta norma.`
            : 'Seleccione el certificado padre para habilitar el selector jerárquico de cláusulas.'
        }
      </p>
    </div>
  `;
}

function renderNoAplicableClausePickerSection(params: {
  draft: NoAplicableFormDraft;
  selectedCert: CertificadoDetailEntity | null;
  availableRequisitos: ReadonlyArray<RequisitoLtree>;
  pickerRows: ReadonlyArray<NoAplicablePickerRow>;
  clauseFilterQuery: string;
  clauseMode: NoAplicableClauseMode;
  expandedClauseIds?: ReadonlyArray<string>;
  selectedReq: RequisitoLtree | null;
  mutationPreview: NonApplicableSmartMutationPreview;
  ancestorAdvisory: NoAplicableAncestorAdvisory;
  isCreateMode: boolean;
}): string {
  const {
    draft,
    selectedCert,
    availableRequisitos,
    pickerRows,
    clauseFilterQuery,
    clauseMode,
    expandedClauseIds,
    selectedReq,
    mutationPreview,
    ancestorAdvisory,
    isCreateMode,
  } = params;

  const groupedPruned = mutationPreview.willMutate
    ? groupPrunedLinksByProcess(mutationPreview.prunedLinks)
    : [];

  const smartMutationBannerHtml =
    mutationPreview.willMutate && selectedReq
      ? `
        <div
          id="noAplicableSmartMutationPreview"
          role="status"
          class="p-3.5 rounded-xl border border-amber-300 bg-amber-50/90 text-amber-950 space-y-2"
        >
          <div class="flex items-center gap-2 text-xs font-bold text-amber-900">
            <span>⚡ Mutación Inteligente (No Bloqueante): Reasignación automática al guardar</span>
          </div>
          <p class="text-xs text-amber-900 leading-relaxed">
            Declarar <strong>Cláusula ${escapeHtml(selectedReq.codigo)}</strong> (y su subárbol) como <strong>No Aplicable (ISO 4.3)</strong> desvinculará automáticamente <strong>${mutationPreview.prunedLinks.length} asignación(es)</strong> activas en <strong>${mutationPreview.affectedProcessCount} proceso(s)</strong>:
          </p>
          <ul class="space-y-1 text-xs text-amber-900 pl-2">
            ${groupedPruned
              .map(
                (group) =>
                  `<li>• <strong>${escapeHtml(group.nombre_proceso)}:</strong> Cláusula${group.codigos.length === 1 ? '' : 's'} <span class="font-mono font-semibold">${escapeHtml(group.codigos.join(', '))}</span></li>`
              )
              .join('')}
          </ul>
        </div>
      `
      : '';

  const ancestorHintHtml =
    ancestorAdvisory.type !== 'NONE' && ancestorAdvisory.message && selectedReq
      ? `
        <div
          id="noAplicableAncestorHint"
          role="note"
          class="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-100/80 text-slate-700 text-xs flex items-start gap-2"
        >
          <span aria-hidden="true" class="shrink-0">ℹ️</span>
          <span>
            ${
              ancestorAdvisory.type === 'COVERED_BY_EXCLUDED_ANCESTOR'
                ? `La cláusula ${escapeHtml(selectedReq.codigo)} ya hereda exclusión de ${escapeHtml(ancestorAdvisory.overlappingCodigos.join(', '))}. ${escapeHtml(ancestorAdvisory.message)}`
                : escapeHtml(ancestorAdvisory.message)
            }
          </span>
        </div>
      `
      : '';

  const modePills: Array<{ id: NoAplicableClauseMode; label: string }> = [
    { id: 'all', label: 'Todas' },
    { id: 'in_use', label: 'En uso por procesos' },
    { id: 'pending', label: 'Disponibles' },
  ];

  const summaryText = selectedReq
    ? `Cláusula ${selectedReq.codigo} seleccionada (exclusión ISO 4.3 de subárbol LTREE)`
    : 'Ninguna cláusula seleccionada';

  return `
    <div class="border-t border-slate-200 pt-4 space-y-4">
      ${smartMutationBannerHtml}
      ${ancestorHintHtml}

      <div id="naClausePickerPanel" class="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
        <div class="space-y-2">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 class="text-xs font-bold uppercase tracking-wider text-slate-700">
                Selector Jerárquico de Subárboles (${escapeHtml(selectedCert?.norma_codigo || 'ISO 4.3')})
              </h4>
              <p class="text-[11px] text-slate-500">
                ${
                  selectedCert
                    ? `${availableRequisitos.length} cláusula(s) en ${escapeHtml(selectedCert.norma_codigo)} · Marcar una cláusula padre excluye automáticamente su subárbol activo mediante LTREE.`
                    : 'Seleccione un certificado arriba para desplegar la estructura jerárquica de cláusulas.'
                }
              </p>
            </div>
            ${
              selectedCert && draft.id_requisito
                ? `
                  <button
                    type="button"
                    data-action="clear-no-aplicable-selection"
                    class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Limpiar Selección
                  </button>
                `
                : ''
            }
          </div>

          ${
            selectedCert
              ? `
                <div class="flex flex-col lg:flex-row lg:items-center gap-2">
                  <div class="relative flex-1 min-w-[220px]">
                    <div class="pointer-events-none absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-400">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="11" cy="11" r="7" />
                        <path stroke-linecap="round" d="m20 20-3.5-3.5" />
                      </svg>
                    </div>
                    <input
                      id="naClauseFilterInput"
                      type="text"
                      data-action="filter-no-aplicable-clauses"
                      value="${escapeHtml(clauseFilterQuery)}"
                      placeholder="Filtrar cláusula por código, título o texto (ES / EN)..."
                      autocomplete="off"
                      class="w-full h-8 text-xs rounded-lg border border-slate-300 bg-white pl-8 pr-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                  <div class="inline-flex flex-wrap items-center gap-1" role="group" aria-label="Filtro de cláusulas no aplicables">
                    ${modePills
                      .map((pill) => {
                        const isActive = clauseMode === pill.id;
                        return `
                          <button
                            type="button"
                            data-action="set-no-aplicable-clause-mode"
                            data-na-mode="${pill.id}"
                            aria-pressed="${isActive}"
                            class="px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                              isActive
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                            }"
                          >
                            ${escapeHtml(pill.label)}
                          </button>
                        `;
                      })
                      .join('')}
                  </div>
                </div>
              `
              : ''
          }
        </div>

        ${
          selectedCert
            ? `
              <div
                id="naClauseChecklistContainer"
                class="max-h-96 overflow-y-auto divide-y divide-slate-200/80 rounded-xl border border-slate-200 bg-white"
              >
                ${renderNoAplicableChecklistRowsHtml({
                  rows: pickerRows,
                  selectedReqId: draft.id_requisito,
                  expandedClauseIds,
                  filterQuery: clauseFilterQuery,
                })}
              </div>

              <div
                id="naBatchStickySummaryBar"
                class="sticky bottom-2 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-200 bg-white/95 backdrop-blur px-3.5 py-2.5 shadow-sm"
              >
                <span id="naBatchSummaryText" class="text-xs font-bold text-slate-800">
                  ${escapeHtml(summaryText)}
                </span>
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    data-action="cancel-no-aplicable-footer"
                    class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    form="noAplicableDetailForm"
                    class="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors cursor-pointer"
                  >
                    ${isCreateMode ? 'Declarar Exclusión' : 'Guardar Cambios'}
                  </button>
                </div>
              </div>
            `
            : `
              <div class="p-6 text-center text-xs text-slate-500 rounded-xl border border-dashed border-slate-300 bg-white">
                Seleccione primero un certificado para desplegar el selector jerárquico de cláusulas.
              </div>
            `
        }
      </div>
    </div>
  `;
}

function renderReadOnlyNoAplicableBody(noAplicable: NoAplicableDetailEntity): string {
  return `
    <div class="space-y-3">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div class="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-1">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cláusula Excluida</div>
          <div class="text-xs font-bold text-slate-900">
            <span class="font-mono text-rose-700">Cláusula ${escapeHtml(noAplicable.requisito_codigo)}</span>
          </div>
          <div class="text-[11px] text-slate-600 truncate" title="${escapeHtml(noAplicable.requisito_titulo)}">
            ${escapeHtml(noAplicable.requisito_titulo)}
          </div>
        </div>

        <div class="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-1">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Norma Aplicable</div>
          <div class="text-xs font-bold text-slate-900">${escapeHtml(noAplicable.norma_codigo)}</div>
          <div class="text-[11px] text-slate-500 truncate" title="${escapeHtml(noAplicable.norma_titulo)}">${escapeHtml(noAplicable.norma_titulo)}</div>
        </div>

        <div class="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-1">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ruta Jerárquica LTREE</div>
          <div class="text-xs font-mono font-bold text-indigo-800">${escapeHtml(noAplicable.ruta_materializada)}</div>
          <div class="text-[11px] text-slate-500">Exclusión ISO 4.3</div>
        </div>

        <div class="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-1">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Certificado Vinculado</div>
          <div class="text-xs font-mono font-bold text-slate-900">${escapeHtml(noAplicable.numero_certificado)}</div>
          <div class="text-[11px] text-slate-500 truncate" title="${escapeHtml(noAplicable.organizacion_nombre)}">${escapeHtml(noAplicable.organizacion_nombre)}</div>
        </div>
      </div>

      <div class="p-4 bg-slate-50/70 border border-slate-200 rounded-xl space-y-1.5">
        <div class="flex items-center justify-between gap-2">
          <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Justificación Técnica Obligatoria (ISO 4.3)
          </span>
          <span class="text-[10px] font-semibold px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
            No Aplicable Declarado
          </span>
        </div>
        <p class="text-xs text-slate-800 leading-relaxed whitespace-pre-line font-medium">
          ${escapeHtml(noAplicable.justificacion)}
        </p>
      </div>

      ${
        noAplicable.requisito_descripcion
          ? `
            <div class="p-3.5 bg-white border border-slate-200 rounded-xl space-y-1">
              <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Descripción del Requisito Normativo</div>
              <p class="text-xs text-slate-600 leading-relaxed">${escapeHtml(noAplicable.requisito_descripcion)}</p>
            </div>
          `
          : ''
      }
    </div>
  `;
}

function renderNoAplicableFormBody(params: {
  draft: NoAplicableFormDraft;
  selectedCert: CertificadoDetailEntity | null;
  selectedReq: RequisitoLtree | null;
}): string {
  const { draft, selectedCert, selectedReq } = params;
  const charCount = draft.justificacion.length;

  return `
    <form id="noAplicableDetailForm" class="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
      <input
        type="hidden"
        id="naSelectRequisito"
        name="id_requisito"
        value="${escapeHtml(draft.id_requisito)}"
      />

      ${
        selectedReq
          ? `
            <div class="p-3 bg-white border border-slate-200 rounded-lg flex flex-wrap items-center justify-between gap-2">
              <div class="space-y-0.5 min-w-0">
                <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Requisito Seleccionado</div>
                <div class="text-xs font-bold text-slate-900">
                  <span class="font-mono text-rose-700">Cláusula ${escapeHtml(selectedReq.codigo)}</span> — ${escapeHtml(selectedReq.titulo)}
                </div>
                ${
                  selectedReq.descripcion
                    ? `<p class="text-[11px] text-slate-500">${escapeHtml(selectedReq.descripcion)}</p>`
                    : ''
                }
              </div>
              <span class="font-mono text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 shrink-0">
                ${escapeHtml(selectedReq.ruta_materializada)}
              </span>
            </div>
          `
          : `
            <div class="p-3 bg-white border border-dashed border-slate-300 rounded-lg text-xs text-slate-500">
              Seleccione una cláusula normativa en el selector jerárquico inferior para asociarla a esta exclusión ISO 4.3.
            </div>
          `
      }

      <div class="space-y-1.5">
        <div class="flex items-center justify-between gap-2">
          <label for="naJustificacionInput" class="block text-xs font-bold text-slate-700">
            Justificación Técnica (Cláusula ISO 4.3) <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <span class="text-[11px] font-mono text-slate-500">
            <span id="naJustificacionCharCount">${charCount}</span> / ${NO_APLICABLE_JUSTIFICACION_MAX_LENGTH}
          </span>
        </div>
        <textarea
          id="naJustificacionInput"
          name="justificacion"
          rows="3"
          required
          minlength="${NO_APLICABLE_JUSTIFICACION_MIN_LENGTH}"
          maxlength="${NO_APLICABLE_JUSTIFICACION_MAX_LENGTH}"
          placeholder="Explique por qué este requisito no es aplicable al alcance del sistema de gestión sin afectar la conformidad del producto/servicio..."
          class="w-full text-xs p-3 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 leading-relaxed"
        >${escapeHtml(draft.justificacion)}</textarea>
        <p class="text-[11px] text-slate-500">
          Requisito ISO/IEC 17021-1 e ISO 9001 Cláusula 4.3: sustente técnicamente la exclusión (mínimo ${NO_APLICABLE_JUSTIFICACION_MIN_LENGTH} caracteres${selectedCert ? ` para ${escapeHtml(selectedCert.norma_codigo)}` : ''}).
        </p>
      </div>
    </form>
  `;
}
