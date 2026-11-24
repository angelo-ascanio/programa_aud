import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/accessControl';
import { canArchiveRecord } from '../lib/archiveGovernance';
import { canUnlinkContactoFromCert } from '../lib/certificadoShareDomain';
import type {
  CertificadoDetailEntity,
  EmailContactoEntity,
  TelefonoContactoEntity,
} from '../lib/multisiteSampling';
import {
  createContactoFormDraftFromEntity,
  createEmptyContactoFormDraft,
  getEmailTipoVisual,
  getTelefonoTipoVisual,
  resolveContactoDetailMode,
  type ContactoDetailEntity,
  type ContactoFormDraft,
} from '../lib/certificadoSubEntities';
import { sortItems, type ColumnDefinition, type SortState } from '../lib/universalTemplate';
import {
  renderDetailFormTopActions,
  renderDetailPageTemplate,
  renderDetailParentSelectCard,
  type DetailParentChip,
} from './detailTemplate';
import { renderListViewTable } from './universalTemplate';

export type ContactoChildTab = 'telefonos' | 'emails';

export interface ContactoViewState {
  selectedContactoId: string | null;
  originatingCertId?: string | null;
  activeChildTab: ContactoChildTab;
  isCreating?: boolean;
  isEditingAttributes: boolean;
  formDraft?: ContactoFormDraft;
  editFormData?: {
    id_certificado?: string;
    nombre?: string;
    cargo?: string;
  };
  editErrorMessage?: string | null;
  childSortState?: Partial<Record<ContactoChildTab, SortState>>;
}

export interface ContactoViewProps {
  profile: UserProfile;
  state: ContactoViewState;
  contacto: ContactoDetailEntity | null;
  activeCertVersionId?: string | null;
  isHistoricalCertVersion?: boolean;
  certificates?: ReadonlyArray<CertificadoDetailEntity>;
  authorizedClientOrgIds?: ReadonlyArray<string>;
  shareLinkId?: string | null;
  tableColumnWidths?: Record<string, Record<string, number>>;
}

export function renderContactoView(props: ContactoViewProps): string {
  const {
    profile,
    state,
    contacto,
    isHistoricalCertVersion = false,
    certificates = [],
    authorizedClientOrgIds,
    shareLinkId,
    tableColumnWidths,
  } = props;

  const isHistoricalLock = Boolean(isHistoricalCertVersion);
  const isStaff = isApprovedStaffProfile(profile) && !isHistoricalLock;
  const mode = resolveContactoDetailMode(state, isStaff, contacto);
  const isCreateMode = mode === 'add';
  const activeTab: ContactoChildTab =
    state.activeChildTab === 'emails' ? 'emails' : 'telefonos';

  const contextCert =
    !isCreateMode && state.originatingCertId
      ? certificates.find((c) => c.id === state.originatingCertId)
      : undefined;
  const contextContact =
    contextCert && contacto
      ? (contextCert.contactos || []).find((c) => c.id === contacto.id)
      : undefined;

  const effectiveCertId = contextCert?.id || contacto?.id_certificado || '';
  const effectiveCertNum =
    contextCert?.numero_certificado || contacto?.numero_certificado || '';
  const effectiveNorma = contextCert?.norma_codigo || contacto?.norma_codigo || '';
  const effectiveOrgId = contextCert?.id_organizacion || contacto?.id_organizacion || '';
  const effectiveOrgNombre =
    contextCert?.organizacion_nombre || contacto?.organizacion_nombre || '';
  const effectiveOrgRif = contextCert?.organizacion_rif || contacto?.organizacion_rif || '';

  const ownerCertId =
    contextContact?.ownerCertId ||
    contextContact?.sharedFromCertId ||
    contacto?.owner_cert_id ||
    contacto?.id_certificado ||
    '';
  const ownerCert = ownerCertId
    ? certificates.find((c) => c.id === ownerCertId)
    : undefined;

  const isReceivingSharedContext = Boolean(
    !isCreateMode &&
      contacto &&
      ((ownerCertId && effectiveCertId && effectiveCertId !== ownerCertId) ||
        Boolean(contextContact?.sharedFromCertId) ||
        Boolean(contacto.is_shared_context))
  );

  const isClientUser = profile.role === 'CLIENT';
  const authorizedOrgSet = isClientUser
    ? new Set(
        (authorizedClientOrgIds !== undefined
          ? authorizedClientOrgIds
          : certificates.map((c) => c.id_organizacion)
        )
          .map((id) => id.trim())
          .filter(Boolean)
      )
    : null;
  const ownerOrgId = ownerCert?.id_organizacion?.trim() || '';
  const isClientCrossOrgRestricted = Boolean(
    isClientUser &&
      isReceivingSharedContext &&
      (!ownerOrgId || !authorizedOrgSet?.has(ownerOrgId))
  );

  const draft: ContactoFormDraft =
    mode === 'add'
      ? state.formDraft ?? createEmptyContactoFormDraft(state.originatingCertId)
      : mode === 'edit'
      ? state.formDraft ??
        (state.editFormData && contacto
          ? {
              id_certificado:
                state.editFormData.id_certificado ??
                (ownerCertId || contacto.id_certificado),
              nombre: state.editFormData.nombre ?? contacto.nombre,
              cargo: state.editFormData.cargo ?? (contacto.cargo || ''),
            }
          : contacto
          ? createContactoFormDraftFromEntity(contacto)
          : createEmptyContactoFormDraft(state.originatingCertId))
      : contacto
      ? createContactoFormDraftFromEntity(contacto)
      : createEmptyContactoFormDraft(state.originatingCertId);

  const selectedCert =
    certificates.find((c) => c.id === draft.id_certificado) ||
    (contacto ? certificates.find((c) => c.id === contacto.id_certificado) : undefined) ||
    null;

  const parents: DetailParentChip[] =
    mode === 'read' && contacto
      ? [
          {
            label: 'Organización',
            value: effectiveOrgRif
              ? `${effectiveOrgNombre} (${effectiveOrgRif})`
              : effectiveOrgNombre,
            symbol: '🏢',
            navAction: {
              nav: 'certificacion',
              subview: 'organizations',
              entityType: 'org',
              entityId: effectiveOrgId,
            },
          },
          {
            label: 'Certificado',
            value: `${effectiveCertNum} · ${effectiveNorma}`,
            symbol: '📜',
            navAction: {
              nav: 'certificacion',
              subview: 'certificates',
              entityType: 'cert',
              entityId: effectiveCertId,
              targetTab: 'contactos',
            },
          },
        ]
      : [];

  let parentMetaHtml = '';
  if (mode === 'read' && contacto) {
    if (isReceivingSharedContext) {
      if (isClientCrossOrgRestricted) {
        parentMetaHtml = `
          <div class="flex flex-wrap items-center gap-2 pt-1">
            <span class="inline-flex items-center px-2.5 py-1 rounded-lg border border-indigo-200 bg-indigo-50 text-xs font-semibold text-indigo-800">
              Contacto compartido dentro del conglomerado
            </span>
          </div>
        `;
      } else {
        const originCertNum =
          ownerCert?.numero_certificado ||
          contacto.owner_numero_certificado ||
          (contacto.shared_from_cert_label
            ? contacto.shared_from_cert_label.split(' · ')[0].trim()
            : '') ||
          'certificado origen';
        const resolvedShareLinkId =
          shareLinkId ||
          contextContact?.sharedTargets?.find(
            (st) => st.targetCertId === effectiveCertId
          )?.linkId ||
          contacto.shared_targets?.find((st) => st.targetCertId === effectiveCertId)
            ?.linkId ||
          '';
        const unlinkCheck = canUnlinkContactoFromCert({
          contacto: {
            id: contacto.id,
            id_certificado: contacto.id_certificado,
            ownerCertId,
            nombre: contacto.nombre,
          },
          certId: effectiveCertId,
        });
        const unlinkBtnHtml =
          isStaff && unlinkCheck.allowed
            ? `
              <button
                type="button"
                data-action="unlink-shared-child"
                data-share-table="contacto_certificado_compartido"
                data-share-link-id="${escapeHtml(resolvedShareLinkId)}"
                data-cert-id="${escapeHtml(effectiveCertId)}"
                data-entity-id="${escapeHtml(contacto.id)}"
                class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                Desvincular de este certificado
              </button>
            `
            : '';

        parentMetaHtml = `
          <div class="flex flex-wrap items-center justify-between gap-2 pt-1 w-full">
            <span class="inline-flex items-center px-2.5 py-1 rounded-lg border border-indigo-200 bg-indigo-50 text-xs font-semibold text-indigo-800">
              Compartido desde ${escapeHtml(originCertNum)}
            </span>
            ${unlinkBtnHtml}
          </div>
        `;
      }
    } else if (isStaff) {
      const sharedOutCount =
        contextContact?.sharedTargets?.length ??
        contacto.shared_targets?.length ??
        contacto.shared_targets_count ??
        0;
      if (sharedOutCount > 0) {
        parentMetaHtml = `
          <div class="flex flex-wrap items-center gap-2 pt-1">
            <span class="inline-flex items-center px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-100 text-xs font-medium text-slate-700 tabular-nums">
              Compartido con ${sharedOutCount} certificado${sharedOutCount === 1 ? '' : 's'} del conglomerado
            </span>
          </div>
        `;
      }
    }
  }

  const certOptions =
    certificates.length > 0
      ? certificates.map((c) => ({
          value: c.id,
          label: `${c.numero_certificado} — ${c.organizacion_nombre} (${c.norma_codigo})`,
        }))
      : contacto
      ? [
          {
            value: contacto.id_certificado,
            label: `${contacto.numero_certificado} — ${contacto.organizacion_nombre} (${contacto.norma_codigo})`,
          },
        ]
      : [];

  const customParentZoneHtml =
    mode === 'add' || mode === 'edit'
      ? `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
          ${renderDetailParentSelectCard({
            mode,
            formId: 'contactoDetailForm',
            selectId: 'contactoSelectCertificado',
            name: 'id_certificado',
            label: 'Certificado de Conformidad',
            symbol: '📜',
            selectedValue: draft.id_certificado,
            options: certOptions,
            placeholder: 'Seleccione un certificado...',
          })}
          <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-1 min-w-0">
            <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <span aria-hidden="true">🏢</span>
              <span>Organización</span>
            </div>
            <div class="text-xs font-bold ${selectedCert || contacto ? 'text-slate-800' : 'text-slate-400 italic'} truncate">
              ${
                selectedCert
                  ? `${escapeHtml(selectedCert.organizacion_nombre)} (${escapeHtml(selectedCert.organizacion_rif)})`
                  : contacto
                  ? `${escapeHtml(contacto.organizacion_nombre)} (${escapeHtml(contacto.organizacion_rif)})`
                  : 'Se resuelve al seleccionar un certificado'
              }
            </div>
          </div>
        </div>
      `
      : undefined;

  const customTopActionsHtml = isStaff
    ? renderDetailFormTopActions({
        mode,
        isStaff: true,
        formId: 'contactoDetailForm',
        saveBtnId: 'saveContactoFormBtn',
        cancelBtnId: 'cancelEditContactoBtn',
        editBtnId: 'startEditContactoBtn',
        saveTitle: isCreateMode ? 'Crear contacto' : 'Guardar cambios',
        cancelTitle: isCreateMode ? 'Cancelar creación' : 'Cancelar edición',
        editTitle: 'Editar contacto',
        showHistoryBtn: !isCreateMode,
        showArchiveBtn: !isCreateMode && Boolean(contacto) && canArchiveRecord(profile),
        extraAuditAttrs: contacto
          ? `data-table-name="contacto_certificado" data-record-id="${escapeHtml(contacto.id)}" data-entity-name="${escapeHtml(contacto.nombre)}"`
          : '',
        extraArchiveAttrs: contacto
          ? `data-archive-table="contacto_certificado" data-archive-id="${escapeHtml(contacto.id)}" data-archive-entity-label="Contacto de Certificado" data-archive-title="${escapeHtml(contacto.nombre)}" data-archive-subtitle="${escapeHtml(
              contacto.cargo?.trim()
                ? `${contacto.cargo.trim()} · ${contacto.numero_certificado}`
                : contacto.numero_certificado
            )}"`
          : '',
      })
    : '';

  const historicalBannerHtml =
    isHistoricalLock && !isCreateMode && contacto
      ? `
        <div role="status" class="p-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium rounded-lg flex items-center gap-2">
          <span aria-hidden="true">🔒</span>
          <span><strong>Versión histórica en solo lectura:</strong> este contacto pertenece a una versión anterior del certificado y no admite cambios.</span>
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
  `;

  const cargoDisplay = contacto?.cargo?.trim() || 'Sin cargo especificado';

  const customRecordBodyHtml =
    mode === 'add' || mode === 'edit'
      ? renderContactoDetailForm(draft, contacto)
      : contacto
      ? `
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
      `
      : '';

  return renderDetailPageTemplate({
    entityType: 'Contacto de Certificado',
    entitySymbol: '👤',
    title: isCreateMode ? 'Nuevo Contacto' : contacto?.nombre || 'Contacto de Certificado',
    subtitle: isCreateMode
      ? selectedCert
        ? `${selectedCert.numero_certificado} · ${selectedCert.organizacion_nombre}`
        : 'Registro de contacto autorizado para el certificado'
      : undefined,
    statusBadge:
      !isCreateMode && contacto?.cargo?.trim()
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
    isCreateMode,
    customTopActionsHtml,
    parents,
    parentMetaHtml,
    customParentZoneHtml,
    tableName: 'contacto_certificado',
    recordId: contacto?.id || 'new',
    feedbackHtml,
    attributes: [],
    customRecordBodyHtml,
    childTabs:
      !isCreateMode && contacto
        ? [
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
          ]
        : [],
    activeChildTabId: activeTab,
    childTabAttrName: 'data-contacto-tab',
    renderChildTabContent:
      !isCreateMode && contacto
        ? (tabId) => {
            if (tabId === 'emails') {
              return renderContactoEmailsTab({
                contacto,
                isStaff,
                sortState: state.childSortState?.emails || { column: null, direction: 'none' },
                columnWidths: tableColumnWidths?.['contacto-tab-emails'],
              });
            }
            return renderContactoTelefonosTab({
              contacto,
              isStaff,
              sortState: state.childSortState?.telefonos || { column: null, direction: 'none' },
              columnWidths: tableColumnWidths?.['contacto-tab-telefonos'],
            });
          }
        : undefined,
  });
}

function renderContactoDetailForm(
  draft: ContactoFormDraft,
  contacto: ContactoDetailEntity | null
): string {
  return `
    <form
      id="contactoDetailForm"
      ${contacto ? `data-contacto-id="${escapeHtml(contacto.id)}"` : ''}
      class="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4"
    >
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="space-y-1">
          <label for="editContactoNombreInput" class="block text-xs font-bold text-slate-700">
            Nombre Completo <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <input
            id="editContactoNombreInput"
            name="nombre"
            type="text"
            required
            minlength="2"
            maxlength="180"
            placeholder="Ej. María Fernanda Salazar"
            value="${escapeHtml(draft.nombre)}"
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
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
            value="${escapeHtml(draft.cargo)}"
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>
      </div>
    </form>
  `;
}

function renderContactoTelefonosTab(params: {
  contacto: ContactoDetailEntity;
  isStaff: boolean;
  sortState: SortState;
  columnWidths?: Record<string, number>;
}): string {
  const { contacto, isStaff, sortState, columnWidths } = params;

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
        <button
          type="button"
          data-action="open-create-telefono"
          data-contacto-id="${escapeHtml(contacto.id)}"
          class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
        >
          <span aria-hidden="true">+</span>
          <span>Agregar Teléfono</span>
        </button>
      </div>
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

  return `${toolbarHtml}${tableHtml}`;
}

function renderContactoEmailsTab(params: {
  contacto: ContactoDetailEntity;
  isStaff: boolean;
  sortState: SortState;
  columnWidths?: Record<string, number>;
}): string {
  const { contacto, isStaff, sortState, columnWidths } = params;

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
        <button
          type="button"
          data-action="open-create-email"
          data-contacto-id="${escapeHtml(contacto.id)}"
          class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
        >
          <span aria-hidden="true">+</span>
          <span>Agregar Correo</span>
        </button>
      </div>
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

  return `${toolbarHtml}${tableHtml}`;
}
