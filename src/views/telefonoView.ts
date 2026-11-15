import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/accessControl';
import { canArchiveRecord } from '../lib/archiveGovernance';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import {
  TELEFONO_TIPO_OPTIONS,
  createEmptyTelefonoFormDraft,
  createTelefonoFormDraftFromEntity,
  getAvailableContactosForChannel,
  getTelefonoTipoVisual,
  resolveTelefonoDetailMode,
  type TelefonoDetailEntity,
  type TelefonoFormDraft,
} from '../lib/certificadoSubEntities';
import {
  renderDetailFormTopActions,
  renderDetailPageTemplate,
  renderDetailParentSelectCard,
  type DetailParentChip,
} from './detailTemplate';

export interface TelefonoViewState {
  selectedTelefonoId: string | null;
  originatingContactoId?: string | null;
  isCreating?: boolean;
  isEditingAttributes: boolean;
  formDraft?: TelefonoFormDraft;
  editFormData?: {
    id_contacto?: string;
    telefono?: string;
    tipo_telefono?: string;
  };
  editErrorMessage?: string | null;
}

export interface TelefonoViewProps {
  profile: UserProfile;
  state: TelefonoViewState;
  telefono: TelefonoDetailEntity | null;
  certificates?: ReadonlyArray<CertificadoDetailEntity>;
  archivedContactoIds?: ReadonlySet<string>;
}

export function renderTelefonoView(props: TelefonoViewProps): string {
  const {
    profile,
    state,
    telefono,
    certificates = [],
    archivedContactoIds,
  } = props;

  const isStaff = isApprovedStaffProfile(profile);
  const mode = resolveTelefonoDetailMode(state, isStaff, telefono);
  const isCreateMode = mode === 'add';

  const draft: TelefonoFormDraft =
    mode === 'add'
      ? state.formDraft ?? createEmptyTelefonoFormDraft(state.originatingContactoId)
      : mode === 'edit'
      ? state.formDraft ??
        (state.editFormData && telefono
          ? {
              id_contacto: state.editFormData.id_contacto ?? telefono.id_contacto,
              telefono: state.editFormData.telefono ?? telefono.telefono,
              tipo_telefono: state.editFormData.tipo_telefono ?? telefono.tipo_telefono,
            }
          : telefono
          ? createTelefonoFormDraftFromEntity(telefono)
          : createEmptyTelefonoFormDraft(state.originatingContactoId))
      : telefono
      ? createTelefonoFormDraftFromEntity(telefono)
      : createEmptyTelefonoFormDraft(state.originatingContactoId);

  const scopedContactoId =
    draft.id_contacto || state.originatingContactoId || telefono?.id_contacto || '';
  const contactOptionsList = getAvailableContactosForChannel({
    certificates,
    scopedContactoId,
    archivedContactoIds,
  });
  const selectedContactOpt =
    contactOptionsList.find((c) => c.id === draft.id_contacto) || null;

  const activeTipo = isCreateMode
    ? draft.tipo_telefono
    : telefono?.tipo_telefono || draft.tipo_telefono;
  const tipoVisual = getTelefonoTipoVisual(activeTipo);

  const parents: DetailParentChip[] =
    mode === 'read' && telefono
      ? [
          {
            label: 'Certificado',
            value: `${telefono.numero_certificado} · ${telefono.norma_codigo}`,
            symbol: '📜',
            navAction: {
              nav: 'certificacion',
              subview: 'certificates',
              entityType: 'cert',
              entityId: telefono.id_certificado,
              targetTab: 'contactos',
            },
          },
          {
            label: 'Contacto',
            value: telefono.contacto_cargo?.trim()
              ? `${telefono.contacto_nombre} · ${telefono.contacto_cargo.trim()}`
              : telefono.contacto_nombre,
            symbol: '👤',
            navAction: {
              nav: 'certificacion',
              subview: 'certificates',
              entityType: 'contacto_certificado',
              entityId: telefono.id_contacto,
              targetTab: 'telefonos',
            },
          },
        ]
      : [];

  const selectOptions =
    contactOptionsList.length > 0
      ? contactOptionsList.map((opt) => ({
          value: opt.id,
          label: opt.label,
        }))
      : telefono
      ? [
          {
            value: telefono.id_contacto,
            label: telefono.contacto_cargo?.trim()
              ? `${telefono.contacto_nombre} · ${telefono.contacto_cargo.trim()}`
              : telefono.contacto_nombre,
          },
        ]
      : [];

  const customParentZoneHtml =
    mode === 'add' || mode === 'edit'
      ? `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
          <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-1 min-w-0">
            <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <span aria-hidden="true">📜</span>
              <span>Certificado</span>
            </div>
            <div class="text-xs font-bold ${selectedContactOpt || telefono ? 'text-slate-800' : 'text-slate-400 italic'} truncate">
              ${
                selectedContactOpt
                  ? `${escapeHtml(selectedContactOpt.numero_certificado)} · ${escapeHtml(selectedContactOpt.organizacion_nombre)}`
                  : telefono
                  ? `${escapeHtml(telefono.numero_certificado)} · ${escapeHtml(telefono.norma_codigo)}`
                  : 'Se resuelve al seleccionar un contacto'
              }
            </div>
          </div>
          ${renderDetailParentSelectCard({
            mode,
            formId: 'telefonoDetailForm',
            selectId: 'telefonoSelectContacto',
            name: 'id_contacto',
            label: 'Contacto del Certificado',
            symbol: '👤',
            selectedValue: draft.id_contacto,
            options: selectOptions,
            placeholder: 'Seleccione un contacto...',
          })}
        </div>
      `
      : undefined;

  const customTopActionsHtml = isStaff
    ? renderDetailFormTopActions({
        mode,
        isStaff: true,
        formId: 'telefonoDetailForm',
        saveBtnId: 'saveTelefonoFormBtn',
        cancelBtnId: 'cancelEditTelefonoBtn',
        editBtnId: 'startEditTelefonoBtn',
        saveTitle: isCreateMode ? 'Agregar teléfono' : 'Guardar cambios',
        cancelTitle: isCreateMode ? 'Cancelar creación' : 'Cancelar edición',
        editTitle: 'Editar teléfono',
        showHistoryBtn: !isCreateMode,
        showArchiveBtn: !isCreateMode && Boolean(telefono) && canArchiveRecord(profile),
        extraAuditAttrs: telefono
          ? `data-table-name="telefono_contacto_certificado" data-record-id="${escapeHtml(telefono.id)}" data-entity-name="${escapeHtml(telefono.telefono)}"`
          : '',
        extraArchiveAttrs: telefono
          ? `data-archive-table="telefono_contacto_certificado" data-archive-id="${escapeHtml(telefono.id)}" data-archive-entity-label="Teléfono de Contacto" data-archive-title="${escapeHtml(telefono.telefono)}" data-archive-subtitle="${escapeHtml(`${telefono.tipo_telefono} · ${telefono.contacto_nombre}`)}"`
          : '',
      })
    : '';

  const feedbackHtml = state.editErrorMessage
    ? `
      <div role="alert" class="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium rounded-lg flex items-center gap-2">
        <span aria-hidden="true">✕</span>
        <span>${escapeHtml(state.editErrorMessage)}</span>
      </div>
    `
    : '';

  const customRecordBodyHtml =
    mode === 'add' || mode === 'edit'
      ? renderTelefonoDetailForm(draft, telefono)
      : telefono
      ? `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div class="p-3 bg-slate-50/70 border border-slate-200/90 rounded-xl space-y-1">
            <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Número de Teléfono</div>
            <div class="text-sm font-mono font-bold text-slate-900">${escapeHtml(telefono.telefono)}</div>
          </div>

          <div class="p-3 bg-slate-50/70 border border-slate-200/90 rounded-xl space-y-1">
            <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tipo de Teléfono</div>
            <div>
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${tipoVisual.badgeClass}">
                ${escapeHtml(tipoVisual.label)}
              </span>
            </div>
          </div>
        </div>
      `
      : '';

  return renderDetailPageTemplate({
    entityType: 'Teléfono de Contacto',
    entitySymbol: '📞',
    title: isCreateMode ? 'Nuevo Teléfono' : telefono?.telefono || 'Teléfono de Contacto',
    subtitle: isCreateMode
      ? selectedContactOpt
        ? `Contacto: ${selectedContactOpt.nombre} · ${selectedContactOpt.numero_certificado}`
        : 'Registro de número telefónico del contacto'
      : undefined,
    statusBadge: {
      label: tipoVisual.label,
      badgeClass: tipoVisual.badgeClass,
    },
    backButton: {
      label: 'Volver',
      nav: 'certificacion',
      subview: 'certificates',
      action: 'back-from-telefono',
    },
    isCreateMode,
    customTopActionsHtml,
    parents,
    customParentZoneHtml,
    tableName: 'telefono_contacto_certificado',
    recordId: telefono?.id || 'new',
    feedbackHtml,
    attributes: [],
    customRecordBodyHtml,
    childTabs: [],
  });
}

function renderTelefonoDetailForm(
  draft: TelefonoFormDraft,
  telefono: TelefonoDetailEntity | null
): string {
  const tipoVal = draft.tipo_telefono || 'Oficina';
  const hasCustomTipo = !TELEFONO_TIPO_OPTIONS.some(
    (t) => t.toLowerCase() === tipoVal.trim().toLowerCase()
  );

  return `
    <form
      id="telefonoDetailForm"
      ${telefono ? `data-telefono-id="${escapeHtml(telefono.id)}"` : ''}
      class="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4"
    >
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="space-y-1">
          <label for="editTelefonoTipoSelect" class="block text-xs font-bold text-slate-700">
            Tipo de Teléfono <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <select
            id="editTelefonoTipoSelect"
            name="tipo_telefono"
            required
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          >
            ${TELEFONO_TIPO_OPTIONS.map(
              (t) => `
                <option value="${escapeHtml(t)}" ${tipoVal.trim().toLowerCase() === t.toLowerCase() ? 'selected' : ''}>
                  ${escapeHtml(t)}
                </option>
              `
            ).join('')}
            ${
              hasCustomTipo
                ? `<option value="${escapeHtml(tipoVal)}" selected>${escapeHtml(tipoVal)}</option>`
                : ''
            }
          </select>
        </div>

        <div class="space-y-1">
          <label for="editTelefonoInput" class="block text-xs font-bold text-slate-700">
            Número de Teléfono <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <input
            id="editTelefonoInput"
            name="telefono"
            type="tel"
            required
            minlength="7"
            maxlength="50"
            placeholder="Ej. +58 241 8324100"
            value="${escapeHtml(draft.telefono)}"
            class="w-full text-xs font-mono p-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>
      </div>
    </form>
  `;
}
