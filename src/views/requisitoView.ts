import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import {
  REQUISITO_CODIGO_MAX_LENGTH,
  calculateLtreeIndentation,
  computeRequisitoLtreePath,
  createEmptyRequisitoFormDraft,
  createRequisitoDraftFromEntity,
  filterValidParentRequisitos,
  type NormaEntity,
  type RequisitoDetailMode,
  type RequisitoFormDraft,
  type RequisitoLtree,
} from '../lib/extraDomain';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import type { ColumnDefinition } from '../lib/universalTemplate';
import { renderListViewTable } from './universalTemplate';
import {
  renderDetailFormTopActions,
  renderDetailPageTemplate,
  renderDetailParentSelectCard,
  type DetailParentChip,
} from './detailTemplate';
import { canArchiveRecord } from '../lib/archiveGovernance';

export type RequisitoChildTab = 'subrequisitos' | 'procesos';

export interface RequisitoViewState {
  selectedRequisitoId: string | null;
  prefillNormaId?: string | null;
  prefillPadreId?: string | null;
  activeChildTab?: RequisitoChildTab;
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

export function renderRequisitoView(props: RequisitoViewProps): string {
  const {
    profile,
    state,
    requisitos,
    normas,
    certificados = [],
    tableColumnWidths,
  } = props;

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

  const resolvedParentReq = draft.id_requisito_padre
    ? activeRequisitos.find((r) => r.id === draft.id_requisito_padre)
    : selectedReq?.id_requisito_padre
    ? activeRequisitos.find((r) => r.id === selectedReq.id_requisito_padre)
    : undefined;

  const computedPathPreview = isReadOnly && selectedReq
    ? selectedReq.ruta_materializada
    : computeRequisitoLtreePath(draft.codigo, resolvedParentReq) || '—';

  const directSubrequisitos = selectedReq
    ? activeRequisitos
        .filter((r) => r.id_requisito_padre === selectedReq.id)
        .slice()
        .sort((a, b) =>
          a.ruta_materializada.localeCompare(b.ruta_materializada, 'es', { numeric: true })
        )
    : [];

  const linkedProcesos: RequisitoProcesoLinkRow[] = selectedReq
    ? collectLinkedProcesosForRequisito(selectedReq, certificados)
    : [];

  const customTopActionsHtml = isStaff
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
          ? `data-archive-table="requisito" data-archive-id="${escapeHtml(selectedReq.id)}" data-archive-entity-label="Requisito Normativo (LTREE)" data-archive-title="${escapeHtml(`Cláusula ${selectedReq.codigo}`)}" data-archive-subtitle="${escapeHtml(selectedReq.titulo || selectedReq.ruta_materializada)}"`
          : '',
      })
    : undefined;

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
        ...(resolvedParentReq
          ? [
              {
                label: 'Cláusula Padre',
                value: `${resolvedParentReq.codigo} — ${resolvedParentReq.titulo}`,
                symbol: '🌳',
                navAction: {
                  nav: 'extra',
                  subview: 'standards',
                  entityType: 'requisito' as const,
                  entityId: resolvedParentReq.id,
                  targetTab: 'subrequisitos',
                },
              },
            ]
          : []),
      ]
    : [];

  const customParentZoneHtml = !isReadOnly
    ? `
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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
            label: `${cand.codigo} — ${cand.titulo || `Cláusula ${cand.codigo}`} [${cand.ruta_materializada}]`,
          })),
        })}
      </div>
    `
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
    isReadOnly && selectedReq
      ? renderRequisitoReadOnlyBody(selectedReq)
      : renderRequisitoFormBody(draft, computedPathPreview, selectedReq);

  const activeTab: RequisitoChildTab =
    state.activeChildTab === 'procesos' ? 'procesos' : 'subrequisitos';

  return renderDetailPageTemplate({
    entityType: 'Requisito Normativo (LTREE)',
    entitySymbol: '🌳',
    title: isCreateMode
      ? 'Nuevo Requisito Normativo'
      : selectedReq
      ? `Cláusula ${selectedReq.codigo}`
      : 'Requisito Normativo',
    eyebrowCode:
      !isCreateMode && selectedReq ? selectedReq.ruta_materializada : undefined,
    subtitle: isCreateMode
      ? parentNorma
        ? `Alta jerárquica LTREE dentro de ${parentNorma.codigo} (${parentNorma.esquema}).`
        : 'Registro jerárquico de cláusula auditable en árbol LTREE.'
      : selectedReq?.titulo || undefined,
    statusBadge:
      !isCreateMode && selectedReq
        ? (() => {
            const indent = calculateLtreeIndentation(
              selectedReq.ruta_materializada,
              selectedReq.codigo
            );
            return {
              label: `NIVEL ${indent.level} · ${indent.isParent ? 'RAÍZ' : 'SUB-CLÁUSULA'}`,
              badgeClass: indent.isParent
                ? 'bg-slate-100 text-slate-800 border-slate-200'
                : 'bg-indigo-50 text-indigo-800 border-indigo-200',
              symbol: '🌳',
            };
          })()
        : undefined,
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
    childTabs:
      !isCreateMode && selectedReq
        ? [
            {
              id: 'subrequisitos',
              label: 'Sub-requisitos',
              symbol: '🌿',
              count: directSubrequisitos.length,
            },
            {
              id: 'procesos',
              label: 'Procesos Vinculados',
              symbol: '⚙️',
              count: linkedProcesos.length,
            },
          ]
        : [],
    activeChildTabId: activeTab,
    childTabAttrName: 'data-requisito-tab',
    renderChildTabContent:
      !isCreateMode && selectedReq
        ? (tabId) =>
            tabId === 'procesos'
              ? renderRequisitoProcesosTab(
                  selectedReq,
                  linkedProcesos,
                  tableColumnWidths
                )
              : renderRequisitoSubrequisitosTab(
                  selectedReq,
                  directSubrequisitos,
                  isStaff,
                  tableColumnWidths
                )
        : undefined,
  });
}

function collectLinkedProcesosForRequisito(
  req: RequisitoLtree,
  certificados: ReadonlyArray<CertificadoDetailEntity>
): RequisitoProcesoLinkRow[] {
  const rows: RequisitoProcesoLinkRow[] = [];
  const seenIds = new Set<string>();
  const targetCodeLower = req.codigo.trim().toLowerCase();

  for (const cert of certificados) {
    for (const proc of cert.procesos || []) {
      if (seenIds.has(proc.id)) continue;
      const matchedDetail = (proc.requisitos_detalle || []).some(
        (d) => d.codigo.trim().toLowerCase() === targetCodeLower
      );
      const matchedCode = (proc.clausulas_cubiertas || []).some(
        (code: string) => code.trim().toLowerCase() === targetCodeLower
      );
      if (matchedDetail || matchedCode) {
        seenIds.add(proc.id);
        rows.push({
          id: proc.id,
          id_certificado: cert.id,
          numero_certificado: cert.numero_certificado,
          nombre_proceso: proc.nombre_proceso,
          tipo: proc.tipo,
          responsable: proc.responsable || 'No asignado',
        });
      }
    }
  }
  return rows;
}

function renderRequisitoReadOnlyBody(req: RequisitoLtree): string {
  const indent = calculateLtreeIndentation(req.ruta_materializada, req.codigo);
  return `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Código de Cláusula
        </div>
        <div class="text-xs font-mono font-bold text-indigo-700">
          ${escapeHtml(req.codigo)}
        </div>
      </div>

      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Ruta Materializada (LTREE)
        </div>
        <div class="text-xs font-mono font-bold text-slate-900">
          ${escapeHtml(req.ruta_materializada)}
        </div>
      </div>

      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Nivel Jerárquico
        </div>
        <div class="text-xs font-semibold text-slate-900">
          Nivel ${indent.level} (${indent.isParent ? 'Cláusula Principal' : 'Sub-requisito dependiente'})
        </div>
      </div>

      ${
        req.titulo || req.descripcion
          ? `
            <div class="col-span-full bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-1">
              <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Descripción Normativa
              </div>
              ${
                req.titulo
                  ? `<div class="text-xs font-bold text-slate-900">${escapeHtml(req.titulo)}</div>`
                  : ''
              }
              ${
                req.descripcion
                  ? `<p class="text-xs text-slate-600 leading-relaxed">${escapeHtml(req.descripcion)}</p>`
                  : ''
              }
            </div>
          `
          : ''
      }
    </div>
  `;
}

function renderRequisitoFormBody(
  draft: RequisitoFormDraft,
  computedPathPreview: string,
  selectedReq?: RequisitoLtree
): string {
  return `
    <form id="requisitoDetailForm" novalidate class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 sm:p-3.5 space-y-3">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

        <div class="space-y-1">
          <span class="block text-xs font-bold text-slate-700">
            Previsualización Ruta LTREE (Automática)
          </span>
          <div
            id="reqRutaPreview"
            class="w-full px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50/70 text-xs font-mono font-bold text-indigo-800 min-h-[30px] flex items-center"
          >
            ${escapeHtml(computedPathPreview)}
          </div>
          <p class="text-[11px] text-slate-500">
            Calculada automáticamente según la cláusula padre y el código asignado.
          </p>
        </div>
      </div>

      ${
        selectedReq?.titulo
          ? `
            <div class="bg-white border border-slate-200 rounded-lg px-3 py-2 text-[11px] text-slate-600">
              <strong class="text-slate-800">Referencia de catálogo:</strong> ${escapeHtml(selectedReq.titulo)}
            </div>
          `
          : ''
      }
    </form>
  `;
}

function renderRequisitoSubrequisitosTab(
  req: RequisitoLtree,
  subrequisitos: ReadonlyArray<RequisitoLtree>,
  isStaff: boolean,
  tableColumnWidths?: Record<string, Record<string, number>>
): string {
  const columns: ColumnDefinition<RequisitoLtree>[] = [
    {
      id: 'codigo',
      header: 'Sub-cláusula',
      defaultWidthPct: 18,
      minWidthPx: 120,
      renderCell: (sub) => `
        <span class="font-mono font-bold text-indigo-700 whitespace-nowrap">
          🌿 ${escapeHtml(sub.codigo)}
        </span>
      `,
    },
    {
      id: 'titulo',
      header: 'Título / Referencia',
      defaultWidthPct: 44,
      minWidthPx: 200,
      renderCell: (sub) => `
        <span class="block font-semibold text-slate-800 truncate" title="${escapeHtml(sub.titulo || `Cláusula ${sub.codigo}`)}">
          ${escapeHtml(sub.titulo || `Cláusula ${sub.codigo}`)}
        </span>
      `,
    },
    {
      id: 'ruta_materializada',
      header: 'Ruta LTREE',
      defaultWidthPct: 24,
      minWidthPx: 140,
      renderCell: (sub) => `
        <span class="font-mono text-[11px] text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 whitespace-nowrap">
          ${escapeHtml(sub.ruta_materializada)}
        </span>
      `,
    },
    {
      id: 'nivel',
      header: 'Nivel',
      align: 'center',
      defaultWidthPct: 14,
      minWidthPx: 90,
      renderCell: (sub) => {
        const indent = calculateLtreeIndentation(sub.ruta_materializada, sub.codigo);
        return `
          <span class="font-mono text-xs font-semibold text-slate-700 tabular-nums">
            Nivel ${indent.level}
          </span>
        `;
      },
    },
  ];

  return `
    <div class="space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 class="text-sm font-bold text-slate-900">Sub-requisitos Directos de Cláusula ${escapeHtml(req.codigo)}</h3>
          <p class="text-xs text-slate-500">
            Cláusulas descendientes directas vinculadas dentro del árbol LTREE de ${escapeHtml(req.norma_codigo)}.
          </p>
        </div>
        ${
          isStaff
            ? `
              <button
                type="button"
                data-action="open-create-requisito"
                data-norma-id="${escapeHtml(req.id_norma)}"
                data-parent-req-id="${escapeHtml(req.id)}"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer shrink-0"
              >
                <span aria-hidden="true">+</span>
                <span>Agregar Sub-requisito</span>
              </button>
            `
            : ''
        }
      </div>

      ${renderListViewTable({
        tableId: 'requisito-tab-subrequisitos',
        items: [...subrequisitos],
        columns,
        columnWidths: tableColumnWidths?.['requisito-tab-subrequisitos'],
        getRowAttrs: (sub) =>
          `data-action="select-requisito" data-requisito-id="${escapeHtml(sub.id)}" title="Abrir cláusula ${escapeHtml(sub.codigo)}"`,
        emptyStateTitle: 'Sin sub-requisitos dependientes',
        emptyStateMessage: `La cláusula ${escapeHtml(req.codigo)} no tiene sub-requisitos registrados.`,
      })}
    </div>
  `;
}

function renderRequisitoProcesosTab(
  req: RequisitoLtree,
  rows: ReadonlyArray<RequisitoProcesoLinkRow>,
  tableColumnWidths?: Record<string, Record<string, number>>
): string {
  const columns: ColumnDefinition<RequisitoProcesoLinkRow>[] = [
    {
      id: 'proceso',
      header: 'Proceso Certificado',
      defaultWidthPct: 34,
      minWidthPx: 180,
      renderCell: (row) => `
        <span class="block font-bold text-indigo-700 truncate" title="${escapeHtml(row.nombre_proceso)}">
          ⚙️ ${escapeHtml(row.nombre_proceso)}
        </span>
      `,
    },
    {
      id: 'certificado',
      header: 'Certificado',
      defaultWidthPct: 22,
      minWidthPx: 140,
      renderCell: (row) => `
        <span class="font-mono font-semibold text-slate-700 whitespace-nowrap">
          📜 ${escapeHtml(row.numero_certificado)}
        </span>
      `,
    },
    {
      id: 'tipo',
      header: 'Tipo de Proceso',
      defaultWidthPct: 20,
      minWidthPx: 130,
      renderCell: (row) => `
        <span class="inline-flex px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-semibold">
          ${escapeHtml(row.tipo)}
        </span>
      `,
    },
    {
      id: 'responsable',
      header: 'Responsable',
      defaultWidthPct: 24,
      minWidthPx: 150,
      renderCell: (row) => `
        <span class="block text-slate-700 truncate" title="${escapeHtml(row.responsable)}">
          ${escapeHtml(row.responsable)}
        </span>
      `,
    },
  ];

  return `
    <div class="space-y-3">
      <div>
        <h3 class="text-sm font-bold text-slate-900">Procesos que Aplican Cláusula ${escapeHtml(req.codigo)}</h3>
        <p class="text-xs text-slate-500">
          Cobertura operativa en certificados activos (requisitos_por_proceso).
        </p>
      </div>

      ${renderListViewTable({
        tableId: 'requisito-tab-procesos',
        items: [...rows],
        columns,
        columnWidths: tableColumnWidths?.['requisito-tab-procesos'],
        getRowAttrs: (row) =>
          `data-action="select-proceso" data-proceso-id="${escapeHtml(row.id)}" title="Abrir proceso ${escapeHtml(row.nombre_proceso)}"`,
        emptyStateTitle: 'Sin procesos vinculados',
        emptyStateMessage: `Ningún proceso registrado referencia actualmente la cláusula ${escapeHtml(req.codigo)}.`,
      })}
    </div>
  `;
}
