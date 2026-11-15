import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/accessControl';
import { canArchiveRecord, renderArchivarButtonHtml } from '../lib/archiveGovernance';
import type {
  EmailContactoEntity,
  TelefonoContactoEntity,
} from '../lib/multisiteSampling';
import {
  CANONICAL_TIPO_EMAIL_VALUES,
  CANONICAL_TIPO_TELEFONO_VALUES,
  getEmailTipoVisual,
  getTelefonoTipoVisual,
  type ContactoDetailEntity,
} from '../lib/certificadoSubEntities';
import { sortItems, type ColumnDefinition, type SortState } from '../lib/universalTemplate';
import { renderDetailPageTemplate, type DetailParentChip } from './detailTemplate';
import { renderListViewTable } from './universalTemplate';

export type ContactoChildTab = 'telefonos' | 'emails';

export interface ContactoViewState {
  selectedContactoId: string | null;
  activeChildTab: ContactoChildTab;
  isEditingAttributes: boolean;
  editFormData?: {
    nombre?: string;
    cargo?: string;
  };
  editErrorMessage?: string | null;
  saveSuccessMessage?: string | null;
  isCreatingTelefono?: boolean;
  telefonoCreateError?: string | null;
  isCreatingEmail?: boolean;
  emailCreateError?: string | null;
  childSortState?: Partial<Record<ContactoChildTab, SortState>>;
}

export interface ContactoViewProps {
  profile: UserProfile;
  state: ContactoViewState;
  contacto: ContactoDetailEntity;
  tableColumnWidths?: Record<string, Record<string, number>>;
}

export function renderContactoView(props: ContactoViewProps): string {
  const { profile, state, contacto, tableColumnWidths } = props;

  const isStaff = isApprovedStaffProfile(profile);
  const isEditing = Boolean(state.isEditingAttributes) && isStaff;
  const activeTab: ContactoChildTab =
    state.activeChildTab === 'emails' ? 'emails' : 'telefonos';

  const parents: DetailParentChip[] = [
    {
      label: 'Organización',
      value: `${contacto.organizacion_nombre} (${contacto.organizacion_rif})`,
      symbol: '🏢',
      navAction: {
        nav: 'certificacion',
        subview: 'organizations',
        entityType: 'org',
        entityId: contacto.id_organizacion,
      },
    },
    {
      label: 'Certificado',
      value: `${contacto.numero_certificado} · ${contacto.norma_codigo}`,
      symbol: '📜',
      navAction: {
        nav: 'certificacion',
        subview: 'certificates',
        entityType: 'cert',
        entityId: contacto.id_certificado,
        targetTab: 'contactos',
      },
    },
  ];

  const trailingActionButtonsHtml =
    isStaff && !isEditing && canArchiveRecord(profile)
      ? renderArchivarButtonHtml({
          tableName: 'contacto_certificado',
          recordId: contacto.id,
          entityLabel: 'Contacto de Certificado',
          recordTitle: contacto.nombre,
          recordSubtitle: contacto.cargo?.trim()
            ? `${contacto.cargo.trim()} · ${contacto.numero_certificado}`
            : contacto.numero_certificado,
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

  const cargoDisplay = contacto.cargo?.trim() || 'Sin cargo especificado';

  const customRecordBodyHtml = isEditing
    ? renderEditContactoForm(contacto, state.editFormData)
    : `
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div class="p-3 bg-slate-50/70 border border-slate-200/90 rounded-xl space-y-1">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Nombre Completo</div>
          <div class="text-xs font-bold text-slate-900">${escapeHtml(contacto.nombre)}</div>
        </div>

        <div class="p-3 bg-slate-50/70 border border-slate-200/90 rounded-xl space-y-1">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cargo / Rol</div>
          <div class="text-xs ${contacto.cargo?.trim() ? 'font-semibold text-slate-800' : 'text-slate-400 italic'}">
            ${escapeHtml(cargoDisplay)}
          </div>
        </div>

        <div class="p-3 bg-slate-50/70 border border-slate-200/90 rounded-xl space-y-1">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Teléfonos Activos</div>
          <div class="text-sm font-mono font-bold text-slate-900 tabular-nums">${contacto.telefonos.length}</div>
        </div>

        <div class="p-3 bg-slate-50/70 border border-slate-200/90 rounded-xl space-y-1">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Correos Activos</div>
          <div class="text-sm font-mono font-bold text-slate-900 tabular-nums">${contacto.emails.length}</div>
        </div>
      </div>
    `;

  return renderDetailPageTemplate({
    entityType: 'Contacto de Certificado',
    entitySymbol: '👤',
    title: contacto.nombre,
    statusBadge: contacto.cargo?.trim()
      ? {
          label: contacto.cargo.trim(),
          badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
        }
      : undefined,
    backButton: {
      label: 'Volver',
      nav: 'certificacion',
      subview: 'certificates',
      action: 'back-from-contacto',
    },
    editActionButton: {
      id: 'startEditContactoBtn',
      visible: isStaff,
      isEditing,
      cancelId: 'cancelEditContactoBtn',
    },
    trailingActionButtonsHtml,
    parents,
    tableName: 'contacto_certificado',
    recordId: contacto.id,
    feedbackHtml,
    attributes: [],
    customRecordBodyHtml,
    childTabs: [
      {
        id: 'telefonos',
        label: 'Teléfono',
        symbol: '📞',
        count: contacto.telefonos.length,
      },
      {
        id: 'emails',
        label: 'Email',
        symbol: '✉️',
        count: contacto.emails.length,
      },
    ],
    activeChildTabId: activeTab,
    childTabAttrName: 'data-contacto-tab',
    renderChildTabContent: (tabId) => {
      if (tabId === 'emails') {
        return renderContactoEmailsTab({
          contacto,
          isStaff,
          state,
          sortState: state.childSortState?.emails || { column: null, direction: 'none' },
          columnWidths: tableColumnWidths?.['contacto-tab-emails'],
        });
      }
      return renderContactoTelefonosTab({
        contacto,
        isStaff,
        state,
        sortState: state.childSortState?.telefonos || { column: null, direction: 'none' },
        columnWidths: tableColumnWidths?.['contacto-tab-telefonos'],
      });
    },
  });
}

function renderEditContactoForm(
  contacto: ContactoDetailEntity,
  formData?: ContactoViewState['editFormData']
): string {
  const nombreVal = formData?.nombre ?? contacto.nombre;
  const cargoVal = formData?.cargo ?? (contacto.cargo || '');

  return `
    <form id="editContactoForm" data-contacto-id="${escapeHtml(contacto.id)}" class="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="space-y-1">
          <label for="editContactoNombreInput" class="block text-xs font-bold text-slate-700">Nombre Completo *</label>
          <input
            id="editContactoNombreInput"
            name="nombre"
            type="text"
            required
            minlength="2"
            maxlength="180"
            value="${escapeHtml(nombreVal)}"
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        <div class="space-y-1">
          <label for="editContactoCargoInput" class="block text-xs font-bold text-slate-700">Cargo / Rol</label>
          <input
            id="editContactoCargoInput"
            name="cargo"
            type="text"
            maxlength="150"
            placeholder="Opcional"
            value="${escapeHtml(cargoVal)}"
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
      </div>

      <div class="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
        <button
          type="button"
          id="cancelEditContactoBtnSecondary"
          class="px-4 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
        >
          Cancelar
        </button>
        <button
          type="submit"
          class="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-2xs transition-colors cursor-pointer"
        >
          💾 Guardar Contacto
        </button>
      </div>
    </form>
  `;
}

function renderContactoTelefonosTab(params: {
  contacto: ContactoDetailEntity;
  isStaff: boolean;
  state: ContactoViewState;
  sortState: SortState;
  columnWidths?: Record<string, number>;
}): string {
  const { contacto, isStaff, state, sortState, columnWidths } = params;

  const sorted = sortItems(
    contacto.telefonos,
    sortState.column,
    sortState.direction,
    (t, col) => {
      switch (col) {
        case 'tipo_telefono':
          return t.tipo_telefono;
        case 'telefono':
          return t.telefono;
        default:
          return '';
      }
    }
  );

  const columns: ColumnDefinition<TelefonoContactoEntity>[] = [
    {
      id: 'tipo_telefono',
      header: 'Tipo',
      sortable: true,
      defaultWidthPct: 34,
      minWidthPx: 120,
      renderCell: (t) => {
        const visual = getTelefonoTipoVisual(t.tipo_telefono);
        return `
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${visual.badgeClass}">
            ${escapeHtml(visual.label)}
          </span>
        `;
      },
    },
    {
      id: 'telefono',
      header: 'Número de Teléfono',
      sortable: true,
      defaultWidthPct: 66,
      minWidthPx: 180,
      renderCell: (t) => `
        <span class="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-indigo-700 max-w-full" title="${escapeHtml(t.telefono)}">
          <span aria-hidden="true" class="shrink-0">📞</span>
          <span class="truncate">${escapeHtml(t.telefono)}</span>
        </span>
      `,
    },
  ];

  const toolbarHtml = isStaff
    ? `
      <div class="flex items-center justify-between gap-2 mb-2.5">
        <span class="text-xs font-medium text-slate-500">Números telefónicos asociados al contacto</span>
        ${
          !state.isCreatingTelefono
            ? `
              <button
                type="button"
                data-action="open-create-telefono"
                class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold transition-colors cursor-pointer shadow-2xs"
              >
                + Agregar Teléfono
              </button>
            `
            : ''
        }
      </div>
    `
    : '';

  const createFormHtml =
    isStaff && state.isCreatingTelefono
      ? `
        <form id="createTelefonoContactoForm" data-contacto-id="${escapeHtml(contacto.id)}" class="mb-3 p-3 rounded-xl border border-sky-200 bg-sky-50/70 space-y-2.5">
          <div class="flex items-center justify-between gap-2">
            <h4 class="text-xs font-bold text-slate-900">Agregar Teléfono al Contacto</h4>
            <button type="button" data-action="close-create-telefono" class="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer">✕ Cancelar</button>
          </div>
          ${
            state.telefonoCreateError
              ? `<div role="alert" class="rounded-lg bg-rose-50 border border-rose-200 px-2.5 py-1.5 text-xs font-medium text-rose-800">${escapeHtml(state.telefonoCreateError)}</div>`
              : ''
          }
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
            <div>
              <label for="createTelefonoTipoSelect" class="block text-[11px] font-semibold text-slate-700 mb-1">Tipo *</label>
              <select id="createTelefonoTipoSelect" name="tipo_telefono" class="w-full text-xs rounded-lg border border-slate-300 bg-white px-2.5 py-1.5">
                ${CANONICAL_TIPO_TELEFONO_VALUES.map(
                  (t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`
                ).join('')}
              </select>
            </div>
            <div>
              <label for="createTelefonoValueInput" class="block text-[11px] font-semibold text-slate-700 mb-1">Teléfono *</label>
              <input id="createTelefonoValueInput" name="telefono" type="tel" required minlength="7" maxlength="50" placeholder="Ej. +58 241 8324100" class="w-full text-xs rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono" />
            </div>
            <div class="flex justify-end">
              <button type="submit" class="w-full sm:w-auto px-3.5 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold transition-colors cursor-pointer">
                Guardar Teléfono
              </button>
            </div>
          </div>
        </form>
      `
      : '';

  const tableHtml = renderListViewTable({
    tableId: 'contacto-tab-telefonos',
    items: sorted,
    columns,
    sortState,
    columnWidths,
    getRowAttrs: (t) =>
      `data-action="select-telefono-detail" data-telefono-id="${escapeHtml(t.id)}" data-contacto-id="${escapeHtml(contacto.id)}" title="Abrir detalle de ${escapeHtml(t.telefono)}"`,
    emptyStateTitle: 'Sin teléfonos registrados',
    emptyStateMessage: 'Este contacto no tiene números telefónicos activos.',
  });

  return `${toolbarHtml}${createFormHtml}${tableHtml}`;
}

function renderContactoEmailsTab(params: {
  contacto: ContactoDetailEntity;
  isStaff: boolean;
  state: ContactoViewState;
  sortState: SortState;
  columnWidths?: Record<string, number>;
}): string {
  const { contacto, isStaff, state, sortState, columnWidths } = params;

  const sorted = sortItems(
    contacto.emails,
    sortState.column,
    sortState.direction,
    (em, col) => {
      switch (col) {
        case 'tipo_email':
          return em.tipo_email;
        case 'email':
          return em.email;
        default:
          return '';
      }
    }
  );

  const columns: ColumnDefinition<EmailContactoEntity>[] = [
    {
      id: 'tipo_email',
      header: 'Tipo',
      sortable: true,
      defaultWidthPct: 34,
      minWidthPx: 120,
      renderCell: (em) => {
        const visual = getEmailTipoVisual(em.tipo_email);
        return `
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${visual.badgeClass}">
            ${escapeHtml(visual.label)}
          </span>
        `;
      },
    },
    {
      id: 'email',
      header: 'Correo Electrónico',
      sortable: true,
      defaultWidthPct: 66,
      minWidthPx: 180,
      renderCell: (em) => `
        <span class="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 max-w-full" title="${escapeHtml(em.email)}">
          <span aria-hidden="true" class="shrink-0">✉️</span>
          <span class="truncate">${escapeHtml(em.email)}</span>
        </span>
      `,
    },
  ];

  const toolbarHtml = isStaff
    ? `
      <div class="flex items-center justify-between gap-2 mb-2.5">
        <span class="text-xs font-medium text-slate-500">Direcciones de correo asociadas al contacto</span>
        ${
          !state.isCreatingEmail
            ? `
              <button
                type="button"
                data-action="open-create-email"
                class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold transition-colors cursor-pointer shadow-2xs"
              >
                + Agregar Email
              </button>
            `
            : ''
        }
      </div>
    `
    : '';

  const createFormHtml =
    isStaff && state.isCreatingEmail
      ? `
        <form id="createEmailContactoForm" data-contacto-id="${escapeHtml(contacto.id)}" class="mb-3 p-3 rounded-xl border border-sky-200 bg-sky-50/70 space-y-2.5">
          <div class="flex items-center justify-between gap-2">
            <h4 class="text-xs font-bold text-slate-900">Agregar Email al Contacto</h4>
            <button type="button" data-action="close-create-email" class="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer">✕ Cancelar</button>
          </div>
          ${
            state.emailCreateError
              ? `<div role="alert" class="rounded-lg bg-rose-50 border border-rose-200 px-2.5 py-1.5 text-xs font-medium text-rose-800">${escapeHtml(state.emailCreateError)}</div>`
              : ''
          }
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
            <div>
              <label for="createEmailTipoSelect" class="block text-[11px] font-semibold text-slate-700 mb-1">Tipo *</label>
              <select id="createEmailTipoSelect" name="tipo_email" class="w-full text-xs rounded-lg border border-slate-300 bg-white px-2.5 py-1.5">
                ${CANONICAL_TIPO_EMAIL_VALUES.map(
                  (t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`
                ).join('')}
              </select>
            </div>
            <div>
              <label for="createEmailValueInput" class="block text-[11px] font-semibold text-slate-700 mb-1">Correo Electrónico *</label>
              <input id="createEmailValueInput" name="email" type="email" required maxlength="200" placeholder="Ej. nombre@empresa.com" class="w-full text-xs rounded-lg border border-slate-300 bg-white px-2.5 py-1.5" />
            </div>
            <div class="flex justify-end">
              <button type="submit" class="w-full sm:w-auto px-3.5 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold transition-colors cursor-pointer">
                Guardar Email
              </button>
            </div>
          </div>
        </form>
      `
      : '';

  const tableHtml = renderListViewTable({
    tableId: 'contacto-tab-emails',
    items: sorted,
    columns,
    sortState,
    columnWidths,
    getRowAttrs: (em) =>
      `data-action="select-email-detail" data-email-id="${escapeHtml(em.id)}" data-contacto-id="${escapeHtml(contacto.id)}" title="Abrir detalle de ${escapeHtml(em.email)}"`,
    emptyStateTitle: 'Sin correos registrados',
    emptyStateMessage: 'Este contacto no tiene direcciones de correo activas.',
  });

  return `${toolbarHtml}${createFormHtml}${tableHtml}`;
}
