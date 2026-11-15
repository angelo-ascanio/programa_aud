import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/accessControl';
import { canArchiveRecord } from '../lib/archiveGovernance';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import {
  EMAIL_TIPO_OPTIONS,
  createEmailFormDraftFromEntity,
  createEmptyEmailFormDraft,
  getAvailableContactosForChannel,
  getEmailTipoVisual,
  resolveEmailDetailMode,
  type EmailDetailEntity,
  type EmailFormDraft,
} from '../lib/certificadoSubEntities';
import {
  renderDetailFormTopActions,
  renderDetailPageTemplate,
  renderDetailParentSelectCard,
  type DetailParentChip,
} from './detailTemplate';

export interface EmailViewState {
  selectedEmailId: string | null;
  originatingContactoId?: string | null;
  isCreating?: boolean;
  isEditingAttributes: boolean;
  formDraft?: EmailFormDraft;
  editFormData?: {
    id_contacto?: string;
    email?: string;
    tipo_email?: string;
  };
  editErrorMessage?: string | null;
}

export interface EmailViewProps {
  profile: UserProfile;
  state: EmailViewState;
  email: EmailDetailEntity | null;
  certificates?: ReadonlyArray<CertificadoDetailEntity>;
  archivedContactoIds?: ReadonlySet<string>;
}

export function renderEmailView(props: EmailViewProps): string {
  const {
    profile,
    state,
    email,
    certificates = [],
    archivedContactoIds,
  } = props;

  const isStaff = isApprovedStaffProfile(profile);
  const mode = resolveEmailDetailMode(state, isStaff, email);
  const isCreateMode = mode === 'add';

  const draft: EmailFormDraft =
    mode === 'add'
      ? state.formDraft ?? createEmptyEmailFormDraft(state.originatingContactoId)
      : mode === 'edit'
      ? state.formDraft ??
        (state.editFormData && email
          ? {
              id_contacto: state.editFormData.id_contacto ?? email.id_contacto,
              email: state.editFormData.email ?? email.email,
              tipo_email: state.editFormData.tipo_email ?? email.tipo_email,
            }
          : email
          ? createEmailFormDraftFromEntity(email)
          : createEmptyEmailFormDraft(state.originatingContactoId))
      : email
      ? createEmailFormDraftFromEntity(email)
      : createEmptyEmailFormDraft(state.originatingContactoId);

  const scopedContactoId =
    draft.id_contacto || state.originatingContactoId || email?.id_contacto || '';
  const contactOptionsList = getAvailableContactosForChannel({
    certificates,
    scopedContactoId,
    archivedContactoIds,
  });
  const selectedContactOpt =
    contactOptionsList.find((c) => c.id === draft.id_contacto) || null;

  const activeTipo = isCreateMode
    ? draft.tipo_email
    : email?.tipo_email || draft.tipo_email;
  const tipoVisual = getEmailTipoVisual(activeTipo);

  const parents: DetailParentChip[] =
    mode === 'read' && email
      ? [
          {
            label: 'Certificado',
            value: `${email.numero_certificado} · ${email.norma_codigo}`,
            symbol: '📜',
            navAction: {
              nav: 'certificacion',
              subview: 'certificates',
              entityType: 'cert',
              entityId: email.id_certificado,
              targetTab: 'contactos',
            },
          },
          {
            label: 'Contacto',
            value: email.contacto_cargo?.trim()
              ? `${email.contacto_nombre} · ${email.contacto_cargo.trim()}`
              : email.contacto_nombre,
            symbol: '👤',
            navAction: {
              nav: 'certificacion',
              subview: 'certificates',
              entityType: 'contacto_certificado',
              entityId: email.id_contacto,
              targetTab: 'emails',
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
      : email
      ? [
          {
            value: email.id_contacto,
            label: email.contacto_cargo?.trim()
              ? `${email.contacto_nombre} · ${email.contacto_cargo.trim()}`
              : email.contacto_nombre,
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
            <div class="text-xs font-bold ${selectedContactOpt || email ? 'text-slate-800' : 'text-slate-400 italic'} truncate">
              ${
                selectedContactOpt
                  ? `${escapeHtml(selectedContactOpt.numero_certificado)} · ${escapeHtml(selectedContactOpt.organizacion_nombre)}`
                  : email
                  ? `${escapeHtml(email.numero_certificado)} · ${escapeHtml(email.norma_codigo)}`
                  : 'Se resuelve al seleccionar un contacto'
              }
            </div>
          </div>
          ${renderDetailParentSelectCard({
            mode,
            formId: 'emailDetailForm',
            selectId: 'emailSelectContacto',
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
        formId: 'emailDetailForm',
        saveBtnId: 'saveEmailFormBtn',
        cancelBtnId: 'cancelEditEmailBtn',
        editBtnId: 'startEditEmailBtn',
        saveTitle: isCreateMode ? 'Agregar correo electrónico' : 'Guardar cambios',
        cancelTitle: isCreateMode ? 'Cancelar creación' : 'Cancelar edición',
        editTitle: 'Editar correo',
        showHistoryBtn: !isCreateMode,
        showArchiveBtn: !isCreateMode && Boolean(email) && canArchiveRecord(profile),
        extraAuditAttrs: email
          ? `data-table-name="email_contacto_certificado" data-record-id="${escapeHtml(email.id)}" data-entity-name="${escapeHtml(email.email)}"`
          : '',
        extraArchiveAttrs: email
          ? `data-archive-table="email_contacto_certificado" data-archive-id="${escapeHtml(email.id)}" data-archive-entity-label="Correo Electrónico de Contacto" data-archive-title="${escapeHtml(email.email)}" data-archive-subtitle="${escapeHtml(`${email.tipo_email} · ${email.contacto_nombre}`)}"`
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
      ? renderEmailDetailForm(draft, email)
      : email
      ? `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div class="p-3 bg-slate-50/70 border border-slate-200/90 rounded-xl space-y-1">
            <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Correo Electrónico</div>
            <div class="text-sm font-semibold text-slate-900 break-all">${escapeHtml(email.email)}</div>
          </div>

          <div class="p-3 bg-slate-50/70 border border-slate-200/90 rounded-xl space-y-1">
            <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tipo de Correo</div>
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
    entityType: 'Correo de Contacto',
    entitySymbol: '✉️',
    title: isCreateMode ? 'Nuevo Correo Electrónico' : email?.email || 'Correo de Contacto',
    subtitle: isCreateMode
      ? selectedContactOpt
        ? `Contacto: ${selectedContactOpt.nombre} · ${selectedContactOpt.numero_certificado}`
        : 'Registro de dirección electrónica del contacto'
      : undefined,
    statusBadge: {
      label: tipoVisual.label,
      badgeClass: tipoVisual.badgeClass,
    },
    backButton: {
      label: 'Volver',
      nav: 'certificacion',
      subview: 'certificates',
      action: 'back-from-email',
    },
    isCreateMode,
    customTopActionsHtml,
    parents,
    customParentZoneHtml,
    tableName: 'email_contacto_certificado',
    recordId: email?.id || 'new',
    feedbackHtml,
    attributes: [],
    customRecordBodyHtml,
    childTabs: [],
  });
}

function renderEmailDetailForm(
  draft: EmailFormDraft,
  email: EmailDetailEntity | null
): string {
  const tipoVal = draft.tipo_email || 'Trabajo';
  const hasCustomTipo = !EMAIL_TIPO_OPTIONS.some(
    (t) => t.toLowerCase() === tipoVal.trim().toLowerCase()
  );

  return `
    <form
      id="emailDetailForm"
      ${email ? `data-email-id="${escapeHtml(email.id)}"` : ''}
      class="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4"
    >
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="space-y-1">
          <label for="editEmailTipoSelect" class="block text-xs font-bold text-slate-700">
            Tipo de Correo <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <select
            id="editEmailTipoSelect"
            name="tipo_email"
            required
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          >
            ${EMAIL_TIPO_OPTIONS.map(
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
          <label for="editEmailInput" class="block text-xs font-bold text-slate-700">
            Correo Electrónico <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <input
            id="editEmailInput"
            name="email"
            type="email"
            required
            maxlength="200"
            placeholder="Ej. nombre@empresa.com"
            value="${escapeHtml(draft.email)}"
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>
      </div>
    </form>
  `;
}
