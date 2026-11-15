import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/accessControl';
import { canArchiveRecord, renderArchivarButtonHtml } from '../lib/archiveGovernance';
import {
  CANONICAL_TIPO_EMAIL_VALUES,
  getEmailTipoVisual,
  type EmailDetailEntity,
} from '../lib/certificadoSubEntities';
import { renderDetailPageTemplate, type DetailParentChip } from './detailTemplate';

export interface EmailViewState {
  selectedEmailId: string | null;
  isEditingAttributes: boolean;
  editFormData?: {
    email?: string;
    tipo_email?: string;
  };
  editErrorMessage?: string | null;
  saveSuccessMessage?: string | null;
}

export interface EmailViewProps {
  profile: UserProfile;
  state: EmailViewState;
  email: EmailDetailEntity;
}

export function renderEmailView(props: EmailViewProps): string {
  const { profile, state, email } = props;

  const isStaff = isApprovedStaffProfile(profile);
  const isEditing = Boolean(state.isEditingAttributes) && isStaff;
  const tipoVisual = getEmailTipoVisual(email.tipo_email);

  const parents: DetailParentChip[] = [
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
  ];

  const trailingActionButtonsHtml =
    isStaff && !isEditing && canArchiveRecord(profile)
      ? renderArchivarButtonHtml({
          tableName: 'email_contacto_certificado',
          recordId: email.id,
          entityLabel: 'Correo Electrónico de Contacto',
          recordTitle: email.email,
          recordSubtitle: `${email.tipo_email} · ${email.contacto_nombre}`,
          iconOnly: true,
        })
      : '';

  const feedbackHtml = `
    ${
      state.saveSuccessMessage
        ? `
          <div class="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium rounded-lg flex items-center gap-2">
            <span aria-hidden="true">✓</span>
            <span>${escapeHtml(state.saveSuccessMessage)}</span>
          </div>
        `
        : ''
    }
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
  `;

  const customRecordBodyHtml = isEditing
    ? renderEditEmailForm(email, state.editFormData)
    : `
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
    `;

  return renderDetailPageTemplate({
    entityType: 'Correo de Contacto',
    entitySymbol: '✉️',
    title: email.email,
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
    editActionButton: {
      id: 'startEditEmailBtn',
      visible: isStaff,
      isEditing,
      cancelId: 'cancelEditEmailBtn',
    },
    trailingActionButtonsHtml,
    parents,
    tableName: 'email_contacto_certificado',
    recordId: email.id,
    feedbackHtml,
    attributes: [],
    customRecordBodyHtml,
    childTabs: [],
  });
}

function renderEditEmailForm(
  email: EmailDetailEntity,
  formData?: EmailViewState['editFormData']
): string {
  const emailVal = formData?.email ?? email.email;
  const tipoVal = formData?.tipo_email ?? (email.tipo_email || 'Trabajo');
  const hasCustomTipo = !CANONICAL_TIPO_EMAIL_VALUES.some(
    (t) => t.toLowerCase() === tipoVal.trim().toLowerCase()
  );

  return `
    <form id="editEmailForm" data-email-id="${escapeHtml(email.id)}" class="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="space-y-1">
          <label for="editEmailInput" class="block text-xs font-bold text-slate-700">Correo Electrónico *</label>
          <input
            id="editEmailInput"
            name="email"
            type="email"
            required
            maxlength="200"
            value="${escapeHtml(emailVal)}"
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        <div class="space-y-1">
          <label for="editEmailTipoSelect" class="block text-xs font-bold text-slate-700">Tipo de Correo *</label>
          <select
            id="editEmailTipoSelect"
            name="tipo_email"
            required
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            ${CANONICAL_TIPO_EMAIL_VALUES.map(
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
      </div>

      <div class="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
        <button
          type="button"
          id="cancelEditEmailBtnSecondary"
          class="px-4 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
        >
          Cancelar
        </button>
        <button
          type="submit"
          class="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-2xs transition-colors cursor-pointer"
        >
          💾 Guardar Email
        </button>
      </div>
    </form>
  `;
}
