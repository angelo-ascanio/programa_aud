import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import {
  CLIENT_ACCESS_MOTIVO_MAX_LENGTH,
  createClientAccessDraftFromEntity,
  createEmptyClientAccessFormDraft,
  type ClientAccessDetailMode,
  type ClientAccessEstado,
  type ClientAccessFormDraft,
  type ClientOrganizationAccessEntity,
  type OrganizacionEntity,
} from '../lib/activeCertificates';
import {
  renderDetailFormTopActions,
  renderDetailPageTemplate,
  renderDetailParentSelectCard,
  type DetailParentChip,
} from './detailTemplate';
import { canArchiveRecord } from '../lib/archiveGovernance';

export interface ClientAccessViewState {
  selectedAccessId: string | null;
  prefillOrganizacionId?: string | null;
  isCreating?: boolean;
  isEditingAttributes?: boolean;
  formDraft?: ClientAccessFormDraft;
  editErrorMessage?: string | null;
}

export interface ClientAccessViewProps {
  profile: UserProfile;
  state: ClientAccessViewState;
  accesses: ReadonlyArray<ClientOrganizationAccessEntity>;
  organizaciones: ReadonlyArray<OrganizacionEntity>;
  profiles: ReadonlyArray<UserProfile>;
}

export function getClientAccessStatusVisual(estado: ClientAccessEstado): {
  label: string;
  badgeClass: string;
  dotClass: string;
  symbol: string;
} {
  switch (estado) {
    case 'APPROVED':
      return {
        label: 'Aprobado',
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        dotClass: 'bg-emerald-500',
        symbol: '✓',
      };
    case 'REJECTED':
      return {
        label: 'Rechazado',
        badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
        dotClass: 'bg-rose-500',
        symbol: '✕',
      };
    default:
      return {
        label: 'Pendiente',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
        dotClass: 'bg-amber-500',
        symbol: '⏳',
      };
  }
}

export function resolveClientAccessDetailMode(
  state: ClientAccessViewState,
  isStaff: boolean,
  selectedRow?: ClientOrganizationAccessEntity
): ClientAccessDetailMode {
  if (!isStaff) {
    return 'read';
  }
  if (state.isCreating && !state.selectedAccessId) {
    return 'add';
  }
  if (selectedRow && state.isEditingAttributes) {
    return 'edit';
  }
  return 'read';
}

function formatAccessDate(rawDate: string | null | undefined): string {
  if (!rawDate) return '—';
  const trimmed = rawDate.trim();
  if (trimmed.length >= 10) {
    return trimmed.slice(0, 10);
  }
  return trimmed;
}

export function renderClientAccessView(props: ClientAccessViewProps): string {
  const { profile, state, accesses, organizaciones, profiles } = props;
  const isStaff = isApprovedStaffProfile(profile);

  if (!isStaff) {
    return `
      <div class="bg-white border border-rose-200 rounded-2xl p-6 text-center space-y-3 shadow-xs">
        <div class="text-2xl" aria-hidden="true">🔒</div>
        <h2 class="text-sm font-bold text-slate-900">Acceso Restringido a Personal Autorizado</h2>
        <p class="text-xs text-slate-600 max-w-md mx-auto">
          Solo el personal técnico aprobado (ADMIN / WORKER) puede consultar o gestionar concesiones de acceso cliente.
        </p>
        <div>
          <button
            type="button"
            data-action="back-to-client-access-parent"
            class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
          >
            ← Volver
          </button>
        </div>
      </div>
    `;
  }

  const activeAccesses = accesses.filter((a) => !a.deleted_at);
  const selectedRow = state.selectedAccessId
    ? activeAccesses.find((a) => a.id === state.selectedAccessId)
    : undefined;

  const mode = resolveClientAccessDetailMode(state, isStaff, selectedRow);
  const isCreateMode = mode === 'add';
  const isReadOnly = mode === 'read';

  const draft: ClientAccessFormDraft =
    mode === 'add'
      ? state.formDraft ??
        createEmptyClientAccessFormDraft(state.prefillOrganizacionId || '')
      : mode === 'edit'
      ? state.formDraft ??
        (selectedRow
          ? createClientAccessDraftFromEntity(selectedRow)
          : createEmptyClientAccessFormDraft(state.prefillOrganizacionId || ''))
      : selectedRow
      ? createClientAccessDraftFromEntity(selectedRow)
      : createEmptyClientAccessFormDraft(state.prefillOrganizacionId || '');

  const activeOrgs = organizaciones
    .filter((o) => !o.deleted_at)
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  const clientProfiles = profiles
    .filter((p) => p.role === 'CLIENT')
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  const resolvedOrg =
    activeOrgs.find((o) => o.id === (selectedRow?.id_organizacion || draft.id_organizacion)) ||
    undefined;
  const resolvedOrgName =
    resolvedOrg?.nombre || selectedRow?.organizacion_nombre || 'Organización Cliente';
  const resolvedOrgRif = resolvedOrg?.rif || selectedRow?.organizacion_rif || '';

  const resolvedUserProfile = profiles.find(
    (p) => p.id === (selectedRow?.id_usuario || draft.id_usuario)
  );
  const resolvedUserName =
    resolvedUserProfile?.nombre || selectedRow?.usuario_nombre || 'Usuario Cliente';
  const resolvedUserRole =
    resolvedUserProfile?.role || selectedRow?.usuario_role || 'CLIENT';

  const resolvedApproverName =
    selectedRow?.aprobado_por_nombre ||
    (selectedRow?.aprobado_por
      ? profiles.find((p) => p.id === selectedRow.aprobado_por)?.nombre || 'Personal Aprobador'
      : 'Pendiente de revisión');

  const statusVisual = getClientAccessStatusVisual(
    selectedRow ? selectedRow.estado : draft.estado
  );

  const customTopActionsHtml = renderDetailFormTopActions({
    mode,
    isStaff: true,
    formId: 'clientAccessDetailForm',
    saveBtnId: 'saveClientAccessBtn',
    cancelBtnId: 'cancelClientAccessBtn',
    editBtnId: 'startEditClientAccessBtn',
    saveTitle: isCreateMode ? 'Otorgar acceso cliente' : 'Guardar cambios',
    cancelTitle: isCreateMode ? 'Cancelar creación' : 'Cancelar edición',
    editTitle: 'Editar acceso cliente',
    showHistoryBtn: !isCreateMode,
    showArchiveBtn: !isCreateMode && canArchiveRecord(profile),
    extraAuditAttrs: selectedRow
      ? `data-table-name="client_organization_access" data-record-id="${escapeHtml(selectedRow.id)}" data-entity-name="${escapeHtml(`${resolvedUserName} · ${resolvedOrgName}`)}"`
      : '',
    extraArchiveAttrs: selectedRow
      ? `data-archive-table="client_organization_access" data-archive-id="${escapeHtml(selectedRow.id)}" data-archive-entity-label="Acceso de Cliente" data-archive-title="${escapeHtml(`${resolvedUserName} · ${resolvedOrgName}`)}" data-archive-subtitle="${escapeHtml(`Estado: ${statusVisual.label}`)}"`
      : '',
  });

  const readParents: DetailParentChip[] = selectedRow
    ? [
        {
          label: 'Organización',
          value: resolvedOrgRif ? `${resolvedOrgName} (${resolvedOrgRif})` : resolvedOrgName,
          symbol: '🏢',
          navAction: {
            nav: 'certificacion',
            subview: 'organizations',
            entityType: 'org',
            entityId: selectedRow.id_organizacion,
            targetTab: 'accesos',
          },
        },
        {
          label: 'Usuario Cliente',
          value: `${resolvedUserName} · ${resolvedUserRole}`,
          symbol: '👤',
        },
      ]
    : [];

  const userOptions = [...clientProfiles];
  if (
    draft.id_usuario &&
    !userOptions.some((u) => u.id === draft.id_usuario)
  ) {
    userOptions.unshift({
      id: draft.id_usuario,
      nombre: resolvedUserName,
      role: resolvedUserRole === 'ADMIN' || resolvedUserRole === 'WORKER' || resolvedUserRole === 'AUDITOR' ? resolvedUserRole : 'CLIENT',
      status: 'APPROVED',
    });
  }

  const orgOptions = [...activeOrgs];
  if (
    draft.id_organizacion &&
    !orgOptions.some((o) => o.id === draft.id_organizacion)
  ) {
    orgOptions.unshift({
      id: draft.id_organizacion,
      nombre: resolvedOrgName,
      rif: resolvedOrgRif,
    });
  }

  const customParentZoneHtml = !isReadOnly
    ? `
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        ${renderDetailParentSelectCard({
          mode,
          formId: 'clientAccessDetailForm',
          selectId: 'clientAccessOrgSelect',
          name: 'id_organizacion',
          label: 'Organización',
          symbol: '🏢',
          selectedValue: draft.id_organizacion,
          placeholder: 'Seleccione organización cliente...',
          required: true,
          options: orgOptions.map((org) => ({
            value: org.id,
            label: org.rif && org.rif !== 'RIF No Registrado'
              ? `${org.nombre} (${org.rif})`
              : org.nombre,
          })),
        })}
        ${renderDetailParentSelectCard({
          mode,
          formId: 'clientAccessDetailForm',
          selectId: 'clientAccessUserSelect',
          name: 'id_usuario',
          label: 'Usuario Cliente',
          symbol: '👤',
          selectedValue: draft.id_usuario,
          placeholder: 'Seleccione usuario CLIENT...',
          required: true,
          options: userOptions.map((u) => ({
            value: u.id,
            label: `${u.nombre} · ${u.role}${u.status && u.status !== 'APPROVED' ? ` (${u.status})` : ''}`,
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
    isReadOnly && selectedRow
      ? `
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-1">
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Estado de Acceso</span>
            <div>
              <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${statusVisual.badgeClass}">
                <span class="w-1.5 h-1.5 rounded-full ${statusVisual.dotClass}"></span>
                <span>${escapeHtml(statusVisual.label)}</span>
              </span>
            </div>
          </div>
          <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Fecha de Solicitud</span>
            <p class="text-xs font-mono font-bold text-slate-900">${escapeHtml(formatAccessDate(selectedRow.fecha_solicitud))}</p>
          </div>
          <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Fecha de Respuesta</span>
            <p class="text-xs font-mono font-bold text-slate-900">${escapeHtml(formatAccessDate(selectedRow.fecha_respuesta))}</p>
          </div>
          <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Aprobado / Revisado por</span>
            <p class="text-xs font-bold text-slate-900 truncate">${escapeHtml(resolvedApproverName)}</p>
          </div>
          ${
            selectedRow.motivo_rechazo
              ? `
                <div class="sm:col-span-2 lg:col-span-4 bg-rose-50/60 border border-rose-200 rounded-xl p-2.5 sm:p-3 space-y-0.5">
                  <span class="block text-[10px] font-bold uppercase tracking-wider text-rose-600">Motivo de Rechazo (Trazabilidad ISO)</span>
                  <p class="text-xs font-medium text-rose-900">${escapeHtml(selectedRow.motivo_rechazo)}</p>
                </div>
              `
              : ''
          }
        </div>
      `
      : `
        <form id="clientAccessDetailForm" class="space-y-3" novalidate>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
              <label for="clientAccessEstadoSelect" class="block text-xs font-bold text-slate-700">
                Estado de Autorización <span class="text-rose-600" aria-hidden="true">*</span>
              </label>
              <select
                id="clientAccessEstadoSelect"
                name="estado"
                required
                class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-900 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
              >
                <option value="APPROVED" ${draft.estado === 'APPROVED' ? 'selected' : ''}>APPROVED · Acceso Aprobado</option>
                <option value="PENDING" ${draft.estado === 'PENDING' ? 'selected' : ''}>PENDING · Pendiente de Revisión</option>
                <option value="REJECTED" ${draft.estado === 'REJECTED' ? 'selected' : ''}>REJECTED · Acceso Rechazado</option>
              </select>
            </div>

            <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1">
              <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Gobernanza de Auditoría</span>
              <p class="text-xs text-slate-600 leading-relaxed">
                Al aprobar o rechazar, el sistema registrará automáticamente al revisor y la marca de tiempo de respuesta en <span class="font-mono font-semibold text-slate-800">client_organization_access</span>.
              </p>
            </div>
          </div>

          <div id="clientAccessMotivoContainer" class="${
            draft.estado === 'REJECTED' ? 'block' : 'hidden'
          } bg-rose-50/50 border border-rose-200 rounded-xl p-3 space-y-1.5">
            <div class="flex items-center justify-between gap-2">
              <label for="clientAccessMotivoInput" class="block text-xs font-bold text-rose-900">
                Motivo de Rechazo <span class="text-rose-600" aria-hidden="true">*</span>
              </label>
              <span class="text-[11px] font-mono text-rose-600">
                <span id="clientAccessMotivoCount">${draft.motivo_rechazo.length}</span> / ${CLIENT_ACCESS_MOTIVO_MAX_LENGTH}
              </span>
            </div>
            <textarea
              id="clientAccessMotivoInput"
              name="motivo_rechazo"
              rows="2"
              maxlength="${CLIENT_ACCESS_MOTIVO_MAX_LENGTH}"
              ${draft.estado === 'REJECTED' ? 'required' : ''}
              placeholder="Indique la justificación documental del rechazo (mínimo 5 caracteres)..."
              class="w-full rounded-lg border border-rose-300 bg-white p-2.5 text-xs text-slate-900 focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
            >${escapeHtml(draft.motivo_rechazo)}</textarea>
          </div>
        </form>
      `;

  return renderDetailPageTemplate({
    entityType: 'Acceso de Cliente',
    entitySymbol: '🔐',
    title: isCreateMode
      ? 'Otorgar Acceso Cliente'
      : selectedRow
      ? `${resolvedUserName} · ${resolvedOrgName}`
      : 'Acceso de Cliente',
    subtitle: isCreateMode
      ? 'Vinculación contextual de usuario portal CLIENT con organización cliente bajo RLS.'
      : `Concesión de acceso portal para ${resolvedOrgName}`,
    statusBadge:
      !isCreateMode && selectedRow
        ? {
            label: statusVisual.label,
            badgeClass: statusVisual.badgeClass,
            dotClass: statusVisual.dotClass,
          }
        : undefined,
    backButton: {
      label: 'Volver',
      nav: 'certificacion',
      subview: 'organizations',
      action: 'back-to-client-access-parent',
    },
    isCreateMode,
    customTopActionsHtml,
    parents: readParents,
    customParentZoneHtml,
    tableName: 'client_organization_access',
    recordId: selectedRow?.id || 'acceso-new',
    feedbackHtml,
    attributes: [],
    customRecordBodyHtml,
    childTabs: [],
  });
}
