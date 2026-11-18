import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/accessControl';
import { canArchiveRecord } from '../lib/archiveGovernance';
import type { RequisitoLtree } from '../lib/extraDomain';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import {
  NO_APLICABLE_JUSTIFICACION_MAX_LENGTH,
  NO_APLICABLE_JUSTIFICACION_MIN_LENGTH,
  createEmptyNoAplicableFormDraft,
  createNoAplicableFormDraftFromEntity,
  filterRequisitosForCertificado,
  resolveNoAplicableDetailMode,
  type NoAplicableDetailEntity,
  type NoAplicableFormDraft,
  type NoAplicableViewState,
} from '../lib/noAplicableDomain';
import {
  renderDetailFormTopActions,
  renderDetailPageTemplate,
  type DetailParentChip,
} from './detailTemplate';

export interface NoAplicableViewProps {
  profile: UserProfile;
  state: NoAplicableViewState;
  noAplicable: NoAplicableDetailEntity | null;
  certificates: ReadonlyArray<CertificadoDetailEntity>;
  requirementsCatalog: ReadonlyArray<RequisitoLtree>;
  archivedNoAplicableIds?: ReadonlySet<string>;
}

export function renderNoAplicableView(props: NoAplicableViewProps): string {
  const {
    profile,
    state,
    noAplicable,
    certificates,
    requirementsCatalog,
    archivedNoAplicableIds,
  } = props;

  const isStaff = isApprovedStaffProfile(profile);
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

  const selectedReq =
    availableRequisitos.find((r) => r.id === draft.id_requisito) ||
    requirementsCatalog.find((r) => r.id === draft.id_requisito) ||
    null;

  const title = isCreateMode
    ? 'Declarar Exclusión'
    : noAplicable
    ? `Cláusula ${noAplicable.requisito_codigo} — ${noAplicable.requisito_titulo}`
    : 'Exclusión de Requisito (ISO 4.3)';

  const subtitle = isCreateMode
    ? selectedCert
      ? `${selectedCert.numero_certificado} · ${selectedCert.norma_codigo} (${selectedCert.organizacion_nombre})`
      : 'Declaración formal de requisito no aplicable conforme a ISO 9001 / ISO 17021-1 Cláusula 4.3'
    : noAplicable
    ? `${noAplicable.norma_codigo} · ${noAplicable.organizacion_nombre}`
    : '';

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
      ? renderNoAplicableParentSelectors({
          draft,
          certificates,
          selectedCert,
          availableRequisitos,
        })
      : undefined;

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

  const feedbackHtml = `
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
    eyebrowCode: isCreateMode ? 'ISO 4.3' : noAplicable?.numero_certificado || 'ISO 4.3',
    subtitle,
    statusBadge: {
      label: 'No Aplicable (ISO 4.3)',
      badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
      symbol: '🚫',
    },
    backButton: {
      label: 'Volver',
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
    childTabs: [],
  });
}

function renderNoAplicableParentSelectors(params: {
  draft: NoAplicableFormDraft;
  certificates: ReadonlyArray<CertificadoDetailEntity>;
  selectedCert: CertificadoDetailEntity | null;
  availableRequisitos: ReadonlyArray<RequisitoLtree>;
}): string {
  const { draft, certificates, selectedCert, availableRequisitos } = params;

  return `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
        <label for="naSelectCertificado" class="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Certificado de Conformidad *
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
                  ${escapeHtml(cert.numero_certificado)} — ${escapeHtml(cert.organizacion_nombre)} (${escapeHtml(cert.norma_codigo)})
                </option>
              `;
            })
            .join('')}
        </select>
        ${
          selectedCert
            ? `<p class="text-[11px] text-indigo-700 font-semibold">Norma evaluada: ${escapeHtml(selectedCert.norma_codigo)}</p>`
            : `<p class="text-[11px] text-slate-500">Al seleccionar un certificado se filtran las cláusulas de su norma.</p>`
        }
      </div>

      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
        <label for="naSelectRequisito" class="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Cláusula / Requisito Normativo *
        </label>
        <select
          id="naSelectRequisito"
          name="id_requisito"
          form="noAplicableDetailForm"
          required
          ${!selectedCert || availableRequisitos.length === 0 ? 'disabled' : ''}
          class="w-full text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:bg-slate-100 disabled:text-slate-400"
        >
          ${
            !selectedCert
              ? `<option value="">Seleccione primero un certificado...</option>`
              : availableRequisitos.length === 0
              ? `<option value="">No hay cláusulas adicionales disponibles en ${escapeHtml(selectedCert.norma_codigo)}</option>`
              : `
                <option value="">Seleccione una cláusula de ${escapeHtml(selectedCert.norma_codigo)}...</option>
                ${availableRequisitos
                  .map((req) => {
                    const isSelected = req.id === draft.id_requisito;
                    return `
                      <option value="${escapeHtml(req.id)}" ${isSelected ? 'selected' : ''}>
                        Cláusula ${escapeHtml(req.codigo)} — ${escapeHtml(req.titulo)}
                      </option>
                    `;
                  })
                  .join('')}
              `
          }
        </select>
        <p class="text-[11px] text-slate-500">
          ${
            selectedCert
              ? `${availableRequisitos.length} cláusula(s) disponible(s) para ${escapeHtml(selectedCert.norma_codigo)} (sin duplicados activos).`
              : 'Catálogo de requisitos vinculado automáticamente a la norma.'
          }
        </p>
      </div>
    </div>
  `;
}

function renderReadOnlyNoAplicableBody(noAplicable: NoAplicableDetailEntity): string {
  return `
    <div class="space-y-3">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-1">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cláusula Excluida</div>
          <div class="flex items-center gap-2 flex-wrap">
            <span class="inline-flex px-2 py-0.5 rounded font-mono text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200">
              Cláusula ${escapeHtml(noAplicable.requisito_codigo)}
            </span>
            <span class="text-xs font-bold text-slate-900">${escapeHtml(noAplicable.requisito_titulo)}</span>
          </div>
        </div>

        <div class="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-1">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Norma Aplicable</div>
          <div class="text-xs font-bold text-slate-900">${escapeHtml(noAplicable.norma_codigo)}</div>
          <div class="text-[11px] text-slate-500 truncate" title="${escapeHtml(noAplicable.norma_titulo)}">${escapeHtml(noAplicable.norma_titulo)}</div>
        </div>

        <div class="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-1">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ruta Jerárquica LTREE</div>
          <div class="text-xs font-mono font-bold text-indigo-700">${escapeHtml(noAplicable.ruta_materializada)}</div>
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
          : ''
      }

      <div class="space-y-1.5">
        <div class="flex items-center justify-between gap-2">
          <label for="naJustificacionInput" class="block text-xs font-bold text-slate-700">
            Justificación Técnica (Cláusula ISO 4.3) *
          </label>
          <span class="text-[11px] font-mono text-slate-500">
            <span id="naJustificacionCharCount">${charCount}</span> / ${NO_APLICABLE_JUSTIFICACION_MAX_LENGTH}
          </span>
        </div>
        <textarea
          id="naJustificacionInput"
          name="justificacion"
          rows="4"
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
