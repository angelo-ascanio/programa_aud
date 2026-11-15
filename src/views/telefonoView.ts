import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/accessControl';
import { canArchiveRecord, renderArchivarButtonHtml } from '../lib/archiveGovernance';
import {
  CANONICAL_TIPO_TELEFONO_VALUES,
  getTelefonoTipoVisual,
  type TelefonoDetailEntity,
} from '../lib/certificadoSubEntities';
import { renderDetailPageTemplate, type DetailParentChip } from './detailTemplate';

export interface TelefonoViewState {
  selectedTelefonoId: string | null;
  isEditingAttributes: boolean;
  editFormData?: {
    telefono?: string;
    tipo_telefono?: string;
  };
  editErrorMessage?: string | null;
  saveSuccessMessage?: string | null;
}

export interface TelefonoViewProps {
  profile: UserProfile;
  state: TelefonoViewState;
  telefono: TelefonoDetailEntity;
}

export function renderTelefonoView(props: TelefonoViewProps): string {
  const { profile, state, telefono } = props;

  const isStaff = isApprovedStaffProfile(profile);
  const isEditing = Boolean(state.isEditingAttributes) && isStaff;
  const tipoVisual = getTelefonoTipoVisual(telefono.tipo_telefono);

  const parents: DetailParentChip[] = [
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
  ];

  const trailingActionButtonsHtml =
    isStaff && !isEditing && canArchiveRecord(profile)
      ? renderArchivarButtonHtml({
          tableName: 'telefono_contacto_certificado',
          recordId: telefono.id,
          entityLabel: 'Teléfono de Contacto',
          recordTitle: telefono.telefono,
          recordSubtitle: `${telefono.tipo_telefono} · ${telefono.contacto_nombre}`,
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
    ? renderEditTelefonoForm(telefono, state.editFormData)
    : `
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
    `;

  return renderDetailPageTemplate({
    entityType: 'Teléfono de Contacto',
    entitySymbol: '📞',
    title: telefono.telefono,
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
    editActionButton: {
      id: 'startEditTelefonoBtn',
      visible: isStaff,
      isEditing,
      cancelId: 'cancelEditTelefonoBtn',
    },
    trailingActionButtonsHtml,
    parents,
    tableName: 'telefono_contacto_certificado',
    recordId: telefono.id,
    feedbackHtml,
    attributes: [],
    customRecordBodyHtml,
    childTabs: [],
  });
}

function renderEditTelefonoForm(
  telefono: TelefonoDetailEntity,
  formData?: TelefonoViewState['editFormData']
): string {
  const telefonoVal = formData?.telefono ?? telefono.telefono;
  const tipoVal = formData?.tipo_telefono ?? (telefono.tipo_telefono || 'Oficina');
  const hasCustomTipo = !CANONICAL_TIPO_TELEFONO_VALUES.some(
    (t) => t.toLowerCase() === tipoVal.trim().toLowerCase()
  );

  return `
    <form id="editTelefonoForm" data-telefono-id="${escapeHtml(telefono.id)}" class="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="space-y-1">
          <label for="editTelefonoInput" class="block text-xs font-bold text-slate-700">Número de Teléfono *</label>
          <input
            id="editTelefonoInput"
            name="telefono"
            type="tel"
            required
            minlength="7"
            maxlength="50"
            value="${escapeHtml(telefonoVal)}"
            class="w-full text-xs font-mono p-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        <div class="space-y-1">
          <label for="editTelefonoTipoSelect" class="block text-xs font-bold text-slate-700">Tipo de Teléfono *</label>
          <select
            id="editTelefonoTipoSelect"
            name="tipo_telefono"
            required
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            ${CANONICAL_TIPO_TELEFONO_VALUES.map(
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
          id="cancelEditTelefonoBtnSecondary"
          class="px-4 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
        >
          Cancelar
        </button>
        <button
          type="submit"
          class="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-2xs transition-colors cursor-pointer"
        >
          💾 Guardar Teléfono
        </button>
      </div>
    </form>
  `;
}
