import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/accessControl';
import { canArchiveRecord } from '../lib/archiveGovernance';
import {
  canArchiveTurno,
  computeShiftDurationLabel,
  createEmptyTurnoFormDraft,
  createTurnoFormDraftFromEntity,
  formatTurnoTime,
  isOvernightShift,
  resolveTurnoDetailMode,
  type TurnoAuditoriaLink,
  type TurnoDetailEntity,
  type TurnoFormDraft,
  type TurnoSitioLink,
} from '../lib/turnoDomain';
import { canUnlinkTurnoFromCert } from '../lib/certificadoShareDomain';
import { formatAuditCodename, getAuditCodenameTooltip } from '../lib/codenameDomain';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import { sortItems, type ColumnDefinition, type SortState } from '../lib/universalTemplate';
import { renderListViewTable } from './universalTemplate';
import {
  renderDetailFormTopActions,
  renderDetailPageTemplate,
  type DetailParentChip,
} from './detailTemplate';

export type TurnoChildTab = 'sitios' | 'auditorias';

export interface TurnoAvailableSiteOption {
  id: string;
  id_certificado: string;
  numero_certificado: string;
  numero_sitio: number;
  nombre_sitio: string;
}

export interface TurnoSharedCertContext {
  isSharedFromAnother: boolean;
  certId: string;
  certNumero?: string;
  ownerCertId?: string;
  ownerCertLabel?: string | null;
  linkId?: string | null;
  isClientCrossOrgRestricted?: boolean;
  sharedTargetsCount?: number;
}

export interface TurnoViewState {
  selectedTurnoId: string | null;
  originatingSitioId: string | null;
  activeChildTab: TurnoChildTab;
  isCreating?: boolean;
  prefillCertId?: string | null;
  prefillSitioId?: string | null;
  isEditingAttributes: boolean;
  formDraft?: TurnoFormDraft;
  editFormData?: {
    hora_entrada?: string;
    hora_salida?: string;
    descripcion?: string;
    id_sitio?: string;
    sharedContext?: TurnoSharedCertContext;
  };
  editErrorMessage?: string | null;
  archiveConfirmOpen?: boolean;
  archiveErrorMessage?: string | null;
  childSortState?: Partial<Record<TurnoChildTab, SortState>>;
}

export interface TurnoViewProps {
  profile: UserProfile;
  state: TurnoViewState;
  turno: TurnoDetailEntity | null;
  availableSites?: ReadonlyArray<TurnoAvailableSiteOption>;
  activeCertId?: string | null;
  activeCertVersionId?: string | null;
  isHistoricalCertVersion?: boolean;
  certificates?: ReadonlyArray<CertificadoDetailEntity>;
  authorizedClientOrgIds?: ReadonlyArray<string>;
  shareLinkId?: string | null;
  tableColumnWidths?: Record<string, Record<string, number>>;
}

const DEFAULT_TURNO_CHILD_SORT: SortState = { column: null, direction: 'none' };

export function renderTurnoView(props: TurnoViewProps): string {
  const {
    profile,
    state,
    turno,
    availableSites = [],
    activeCertId,
    isHistoricalCertVersion = false,
    certificates = [],
    authorizedClientOrgIds,
    shareLinkId,
    tableColumnWidths,
  } = props;

  const isHistoricalLock = Boolean(isHistoricalCertVersion);
  const isStaff = isApprovedStaffProfile(profile) && !isHistoricalLock;
  const mode = resolveTurnoDetailMode(state, isStaff, turno);
  const isCreateMode = mode === 'add';
  const activeTab: TurnoChildTab =
    state.activeChildTab === 'auditorias' ? 'auditorias' : 'sitios';

  const contextCertId = (
    activeCertId ||
    state.prefillCertId ||
    state.editFormData?.sharedContext?.certId ||
    turno?.parentSitio?.id_certificado ||
    ''
  ).trim();
  const contextCert =
    !isCreateMode && contextCertId && certificates.length > 0
      ? certificates.find((c) => c.id === contextCertId)
      : undefined;
  const contextShift =
    contextCert && turno
      ? (contextCert.turnos || []).find((t) => t.id === turno.id)
      : undefined;
  const fallbackContext = !isCreateMode ? state.editFormData?.sharedContext : undefined;

  const ownerCertId = (
    contextShift?.ownerCertId ||
    contextShift?.sharedFromCertId ||
    fallbackContext?.ownerCertId ||
    ''
  ).trim();
  const ownerCert =
    ownerCertId && certificates.length > 0
      ? certificates.find((c) => c.id === ownerCertId)
      : undefined;

  const isReceivingSharedContext = Boolean(
    !isCreateMode &&
      turno &&
      (contextShift
        ? Boolean(contextShift.sharedFromCertId) ||
          Boolean(ownerCertId && contextCertId && ownerCertId !== contextCertId)
        : Boolean(fallbackContext?.isSharedFromAnother))
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
      (certificates.length > 0
        ? !ownerOrgId || !authorizedOrgSet?.has(ownerOrgId)
        : Boolean(fallbackContext?.isClientCrossOrgRestricted ?? true))
  );

  const authorizedCertIdSet =
    isClientUser && authorizedOrgSet && certificates.length > 0
      ? new Set(
          certificates
            .filter((c) => authorizedOrgSet.has(c.id_organizacion.trim()))
            .map((c) => c.id)
        )
      : null;

  const displayedSitios =
    turno && authorizedCertIdSet
      ? turno.sitios.filter((s) => authorizedCertIdSet.has(s.id_certificado))
      : turno?.sitios ?? [];

  const draft: TurnoFormDraft =
    mode === 'add'
      ? state.formDraft ??
        (state.editFormData
          ? {
              hora_entrada: state.editFormData.hora_entrada ?? '08:00',
              hora_salida: state.editFormData.hora_salida ?? '16:00',
              descripcion: state.editFormData.descripcion ?? '',
              id_sitio: state.editFormData.id_sitio ?? state.prefillSitioId ?? '',
            }
          : createEmptyTurnoFormDraft(state.prefillSitioId))
      : mode === 'edit'
      ? state.formDraft ??
        (state.editFormData
          ? {
              hora_entrada:
                state.editFormData.hora_entrada ?? formatTurnoTime(turno?.hora_entrada),
              hora_salida:
                state.editFormData.hora_salida ?? formatTurnoTime(turno?.hora_salida),
              descripcion: state.editFormData.descripcion ?? turno?.descripcion ?? '',
              id_sitio: state.editFormData.id_sitio ?? turno?.parentSitio?.id_sitio ?? '',
            }
          : turno
          ? createTurnoFormDraftFromEntity(turno)
          : createEmptyTurnoFormDraft())
      : turno
      ? createTurnoFormDraftFromEntity(turno)
      : createEmptyTurnoFormDraft();

  const startFormatted = turno ? formatTurnoTime(turno.hora_entrada) : formatTurnoTime(draft.hora_entrada);
  const endFormatted = turno ? formatTurnoTime(turno.hora_salida) : formatTurnoTime(draft.hora_salida);
  const titleLabel = isCreateMode ? 'Nuevo Turno Operativo' : `${startFormatted} – ${endFormatted}`;
  const computedDuration = isCreateMode
    ? computeShiftDurationLabel(draft.hora_entrada, draft.hora_salida)
    : turno?.durationLabel || computeShiftDurationLabel(draft.hora_entrada, draft.hora_salida);
  const computedOvernight = isCreateMode
    ? isOvernightShift(draft.hora_entrada, draft.hora_salida)
    : Boolean(turno?.isOvernight);

  const archiveGuard = canArchiveTurno({
    assignedSitiosCount: turno?.sitios.length ?? 0,
  });

  // Contextual Parent Zone: populated in read/edit ONLY when opened from a specific Sitio
  const parents: DetailParentChip[] =
    !isCreateMode && turno?.parentSitio
      ? [
          {
            label: 'Sitio',
            value: `Sitio ${turno.parentSitio.numero_sitio} — ${turno.parentSitio.nombre_sitio}`,
            symbol: turno.parentSitio.numero_sitio === 0 ? '🏢' : '📍',
            navAction: {
              nav: 'certificacion',
              subview: 'certificates',
              entityType: 'sitio',
              entityId: turno.parentSitio.id_sitio,
            },
          },
          {
            label: 'Certificado',
            value: `${turno.parentSitio.numero_certificado} · ${turno.parentSitio.norma_codigo}`,
            symbol: '📜',
            navAction: {
              nav: 'certificacion',
              subview: 'certificates',
              entityType: 'cert',
              entityId: turno.parentSitio.id_certificado,
            },
          },
        ]
      : [];

  let parentMetaHtml = '';
  if (mode === 'read' && turno) {
    if (isReceivingSharedContext) {
      if (isClientCrossOrgRestricted) {
        parentMetaHtml = `
          <div class="flex flex-wrap items-center gap-2 pt-1">
            <span class="inline-flex items-center px-2.5 py-1 rounded-lg border border-indigo-200 bg-indigo-50 text-xs font-semibold text-indigo-800">
              Turno compartido dentro del conglomerado
            </span>
          </div>
        `;
      } else {
        const rawOriginLabel =
          ownerCert?.numero_certificado ||
          contextShift?.sharedFromCertLabel ||
          fallbackContext?.ownerCertLabel ||
          '';
        const originCertNum = rawOriginLabel
          ? rawOriginLabel.split(' · ')[0].trim()
          : 'certificado origen';
        const resolvedShareLinkId =
          shareLinkId ||
          contextShift?.sharedTargets?.find((st) => st.targetCertId === contextCertId)
            ?.linkId ||
          fallbackContext?.linkId ||
          '';
        const unlinkCheck = contextCertId
          ? canUnlinkTurnoFromCert({
              turno: {
                id: turno.id,
                descripcion: turno.descripcion,
                ownerCertId: ownerCertId || undefined,
                sharedFromCertId: ownerCertId || fallbackContext?.ownerCertId || contextCertId,
              },
              certId: contextCertId,
            })
          : { allowed: false };
        const unlinkBtnHtml =
          isStaff && contextCertId && unlinkCheck.allowed
            ? `
              <button
                type="button"
                data-action="unlink-shared-child"
                data-share-table="turno_certificado_compartido"
                data-share-link-id="${escapeHtml(resolvedShareLinkId)}"
                data-cert-id="${escapeHtml(contextCertId)}"
                data-entity-id="${escapeHtml(turno.id)}"
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
        contextShift?.sharedTargets?.length ?? fallbackContext?.sharedTargetsCount ?? 0;
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

  const customParentZoneHtml = isCreateMode
    ? renderTurnoCreateParentSelector(draft, availableSites, state.prefillCertId)
    : undefined;

  const customTopActionsHtml = isStaff
    ? renderDetailFormTopActions({
        mode,
        isStaff: true,
        formId: 'editTurnoForm',
        saveBtnId: 'saveTurnoFormBtn',
        cancelBtnId: 'cancelEditTurnoBtn',
        editBtnId: 'startEditTurnoBtn',
        saveTitle: isCreateMode ? 'Crear turno' : 'Guardar cambios',
        cancelTitle: isCreateMode ? 'Cancelar creación' : 'Cancelar edición',
        editTitle: 'Editar',
        showHistoryBtn: !isCreateMode,
        showArchiveBtn: !isCreateMode && canArchiveRecord(profile),
        archiveBtnDataAction: 'open-archive-turno',
        extraAuditAttrs: turno
          ? `data-table-name="turno" data-record-id="${escapeHtml(turno.id)}" data-entity-name="${escapeHtml(`${startFormatted} – ${endFormatted}`)}"`
          : '',
        extraArchiveAttrs: turno ? `data-turno-id="${escapeHtml(turno.id)}"` : '',
      })
    : '';

  const historicalBannerHtml =
    isHistoricalLock && !isCreateMode && turno
      ? `
        <div role="status" class="p-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium rounded-lg flex items-center gap-2">
          <span aria-hidden="true">🔒</span>
          <span><strong>Versión histórica en solo lectura:</strong> este turno pertenece a una versión anterior del certificado y no admite cambios.</span>
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
    ${
      isStaff && !isCreateMode && turno && state.archiveConfirmOpen
        ? archiveGuard.allowed
          ? `
            <div class="p-4 bg-rose-50/80 border border-rose-200 rounded-xl space-y-3">
              <div class="space-y-0.5">
                <h4 class="text-xs font-bold text-rose-900">Confirmar archivo lógico de turno operativo</h4>
                <p class="text-[11px] text-rose-800">
                  El turno <strong>${escapeHtml(titleLabel)}</strong> (${escapeHtml(turno.descripcion)}) pasará a estado archivado (soft-delete) manteniendo la trazabilidad en Historial de Cambios.
                </p>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
                <div class="sm:col-span-2">
                  <label for="archiveTurnoReasonInput" class="sr-only">Motivo de archivo</label>
                  <input
                    id="archiveTurnoReasonInput"
                    type="text"
                    placeholder="Motivo de archivo (opcional, ej. Ajuste de jornadas operativas)"
                    class="w-full text-xs rounded-lg border border-rose-300 bg-white px-2.5 py-1.5"
                  />
                </div>
                <div class="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    id="cancelArchiveTurnoBtn"
                    class="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    id="confirmArchiveTurnoBtn"
                    class="px-3 py-1.5 text-xs font-bold text-white bg-rose-700 hover:bg-rose-800 rounded-lg cursor-pointer"
                  >
                    Confirmar Archivo
                  </button>
                </div>
              </div>
            </div>
          `
          : `
            <div role="alert" class="p-4 bg-amber-50 border border-amber-300 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div class="text-xs font-medium text-amber-900">
                <strong class="font-bold">Archivo bloqueado:</strong> ${escapeHtml(archiveGuard.reason || 'Existen sedes activas vinculadas a este turno.')}
              </div>
              <button
                type="button"
                id="cancelArchiveTurnoBtn"
                class="px-3 py-1 text-xs font-semibold text-amber-900 bg-white border border-amber-300 hover:bg-amber-100 rounded-lg cursor-pointer self-start sm:self-auto"
              >
                Entendido
              </button>
            </div>
          `
        : ''
    }
  `;

  const customRecordBodyHtml =
    mode === 'add' || mode === 'edit'
      ? renderTurnoFormBody(draft, computedDuration, computedOvernight)
      : turno
      ? renderReadOnlyTurnoBody(turno, startFormatted, endFormatted)
      : '';

  return renderDetailPageTemplate({
    entityType: 'Turno Operativo',
    entitySymbol: computedOvernight ? '🌙' : '🕒',
    title: titleLabel,
    eyebrowCode: isCreateMode ? 'JORNADA OPERATIVA' : turno?.descripcion,
    subtitle: isCreateMode
      ? 'Configuración de franja horaria laboral y cruce de medianoche conforme a muestreo ISO/IEC 17021-1'
      : turno?.parentSitio
      ? `Contexto operativo en Sitio ${turno.parentSitio.numero_sitio} (${turno.parentSitio.nombre_sitio})`
      : `Jornada laboral aplicable en ${turno?.sitios.length ?? 0} sede(s) operativa(s)`,
    statusBadge: {
      label: `Duración: ${computedDuration}`,
      badgeClass: computedOvernight
        ? 'bg-indigo-50 text-indigo-900 border-indigo-300'
        : 'bg-emerald-50 text-emerald-900 border-emerald-200',
      symbol: computedOvernight ? '🌙' : '⏱️',
    },
    secondaryHeaderBadge: !isCreateMode && turno
      ? {
          label: `${displayedSitios.length} sede(s) vinculada(s)`,
          badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
        }
      : undefined,
    backButton: {
      label:
        !isCreateMode && turno?.parentSitio
          ? `Volver a Sitio ${turno.parentSitio.numero_sitio}`
          : 'Volver',
      nav: 'certificacion',
      subview: 'certificates',
      action: 'back-from-turno',
    },
    isCreateMode,
    customTopActionsHtml,
    parents,
    parentMetaHtml,
    customParentZoneHtml,
    tableName: 'turno',
    recordId: turno?.id || 'new',
    feedbackHtml,
    attributes: [],
    customRecordBodyHtml,
    childTabs:
      !isCreateMode && turno
        ? [
            {
              id: 'sitios',
              label: 'Sedes Operativas con este Turno',
              symbol: '📍',
              count: displayedSitios.length,
            },
            {
              id: 'auditorias',
              label: 'Auditorías en este Turno',
              symbol: '🗓️',
              count: turno.auditorias.length,
            },
          ]
        : [],
    activeChildTabId: activeTab,
    childTabAttrName: 'data-turno-tab',
    renderChildTabContent:
      !isCreateMode && turno
        ? (tabId) =>
            tabId === 'auditorias'
              ? renderTurnoAuditoriasTab(
                  turno,
                  turno.auditorias,
                  state.childSortState?.auditorias || DEFAULT_TURNO_CHILD_SORT,
                  tableColumnWidths?.['turno-tab-auditorias']
                )
              : renderTurnoSitiosTab(
                  turno,
                  displayedSitios,
                  state.childSortState?.sitios || DEFAULT_TURNO_CHILD_SORT,
                  tableColumnWidths?.['turno-tab-sitios']
                )
        : undefined,
  });
}

function renderTurnoCreateParentSelector(
  draft: TurnoFormDraft,
  availableSites: ReadonlyArray<TurnoAvailableSiteOption>,
  prefillCertId?: string | null
): string {
  const scopedSites = prefillCertId
    ? availableSites.filter((s) => s.id_certificado === prefillCertId)
    : availableSites;
  const siteOptions = scopedSites.length > 0 ? scopedSites : availableSites;

  return `
    <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
      <label for="turnoParentSitioSelect" class="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
        Sitio Operativo Inicial (Opcional — vínculo en turnos_por_sitio)
      </label>
      <select
        id="turnoParentSitioSelect"
        name="id_sitio"
        form="editTurnoForm"
        class="w-full text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
      >
        <option value="">Catálogo general (vincular a sedes posteriormente)</option>
        ${siteOptions
          .map((site) => {
            const selected = draft.id_sitio === site.id;
            return `
              <option value="${escapeHtml(site.id)}" ${selected ? 'selected' : ''}>
                Sitio ${site.numero_sitio} — ${escapeHtml(site.nombre_sitio)} (${escapeHtml(site.numero_certificado)})
              </option>
            `;
          })
          .join('')}
      </select>
      <p class="text-[11px] text-slate-500">
        Si selecciona una sede física, el nuevo turno quedará asignado inmediatamente a ese sitio y visible en el certificado.
      </p>
    </div>
  `;
}

function renderReadOnlyTurnoBody(
  turno: TurnoDetailEntity,
  startFormatted: string,
  endFormatted: string
): string {
  return `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <div class="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-1">
        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Horario de Entrada</div>
        <div class="text-sm font-mono font-bold text-slate-900">${escapeHtml(startFormatted)}</div>
      </div>

      <div class="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-1">
        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Horario de Salida</div>
        <div class="text-sm font-mono font-bold text-slate-900">${escapeHtml(endFormatted)}</div>
      </div>

      <div class="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-1">
        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Duración Calculada</div>
        <div>
          <span class="inline-flex px-2 py-0.5 rounded font-mono text-xs font-bold border ${
            turno.isOvernight
              ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
          }">
            ${escapeHtml(turno.durationLabel)}
          </span>
        </div>
      </div>

      <div class="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-1">
        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Descripción Operativa</div>
        <div class="text-xs font-bold text-slate-900">${escapeHtml(turno.descripcion)}</div>
      </div>
    </div>
  `;
}

function renderTurnoFormBody(
  draft: TurnoFormDraft,
  durationLabel: string,
  isOvernight: boolean
): string {
  const startVal = formatTurnoTime(draft.hora_entrada);
  const endVal = formatTurnoTime(draft.hora_salida);
  const descVal = draft.descripcion || '';

  return `
    <form id="editTurnoForm" class="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="space-y-1">
          <label for="editTurnoEntradaInput" class="block text-xs font-bold text-slate-700">Hora Entrada (HH:MM) *</label>
          <input
            id="editTurnoEntradaInput"
            name="hora_entrada"
            type="time"
            required
            value="${escapeHtml(startVal)}"
            class="w-full text-xs font-mono p-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        <div class="space-y-1">
          <label for="editTurnoSalidaInput" class="block text-xs font-bold text-slate-700">Hora Salida (HH:MM) *</label>
          <input
            id="editTurnoSalidaInput"
            name="hora_salida"
            type="time"
            required
            value="${escapeHtml(endVal)}"
            class="w-full text-xs font-mono p-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
          <p class="text-[10px] text-slate-500">Admite cruce de medianoche (ej. 22:00 → 06:00).</p>
        </div>

        <div class="space-y-1">
          <label for="editTurnoDescripcionInput" class="block text-xs font-bold text-slate-700">Descripción Operativa</label>
          <input
            id="editTurnoDescripcionInput"
            name="descripcion"
            type="text"
            placeholder="Ej. Turno Matutino Operativo"
            value="${escapeHtml(descVal)}"
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
          <p class="text-[10px] text-slate-500">
            Duración estimada: <strong class="font-mono ${isOvernight ? 'text-indigo-700' : 'text-emerald-700'}">${escapeHtml(durationLabel)}</strong>
          </p>
        </div>
      </div>
    </form>
  `;
}

function renderTurnoSitiosTab(
  turno: TurnoDetailEntity,
  sitios: ReadonlyArray<TurnoSitioLink>,
  sortState: SortState,
  columnWidths?: Record<string, number>
): string {
  const sorted = sortItems([...sitios], sortState.column, sortState.direction, (site, col) => {
    switch (col) {
      case 'sitio':
        return site.numero_sitio;
      case 'certificado':
        return site.numero_certificado;
      case 'organizacion':
        return site.organizacion_nombre;
      case 'direccion':
        return site.direccion_sitio;
      default:
        return '';
    }
  });

  const columns: ColumnDefinition<TurnoSitioLink>[] = [
    {
      id: 'sitio',
      header: 'Sitio Operativo',
      sortable: true,
      defaultWidthPct: 30,
      minWidthPx: 160,
      renderCell: (site) => {
        const isHq = site.numero_sitio === 0;
        return `
          <span class="inline-flex items-center gap-1.5 font-bold text-indigo-700 max-w-full">
            <span class="font-mono text-[11px] px-1.5 py-0.5 rounded shrink-0 ${
              isHq ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 border border-slate-200'
            }">
              Sitio ${site.numero_sitio}
            </span>
            <span class="truncate">${escapeHtml(site.nombre_sitio)}</span>
          </span>
        `;
      },
    },
    {
      id: 'certificado',
      header: 'Certificado',
      sortable: true,
      defaultWidthPct: 24,
      minWidthPx: 140,
      renderCell: (site) => `
        <div class="min-w-0">
          <div class="font-mono font-bold text-sky-700 truncate">📜 ${escapeHtml(site.numero_certificado)}</div>
          <div class="text-[11px] text-slate-500 truncate">${escapeHtml(site.norma_codigo)}</div>
        </div>
      `,
    },
    {
      id: 'organizacion',
      header: 'Organización',
      sortable: true,
      defaultWidthPct: 24,
      minWidthPx: 140,
      renderCell: (site) => `
        <span class="block font-medium text-slate-800 truncate" title="${escapeHtml(site.organizacion_nombre)}">
          ${escapeHtml(site.organizacion_nombre)}
        </span>
      `,
    },
    {
      id: 'direccion',
      header: 'Dirección',
      sortable: true,
      defaultWidthPct: 22,
      minWidthPx: 150,
      renderCell: (site) => `
        <span class="block text-slate-600 truncate" title="${escapeHtml(site.direccion_sitio)}">
          ${escapeHtml(site.direccion_sitio)}
        </span>
      `,
    },
  ];

  const startFormatted = formatTurnoTime(turno.hora_entrada);
  const endFormatted = formatTurnoTime(turno.hora_salida);

  return `
    <div class="space-y-3">
      <div>
        <h3 class="text-sm font-bold text-slate-900">Sedes Operativas con este Turno</h3>
        <p class="text-xs text-slate-500">
          Instalaciones físicas donde opera el turno ${escapeHtml(startFormatted)} – ${escapeHtml(endFormatted)}.
        </p>
      </div>

      ${renderListViewTable({
        tableId: 'turno-tab-sitios',
        items: sorted,
        columns,
        sortState,
        columnWidths,
        getRowAttrs: (site) =>
          `data-action="select-sitio" data-sitio-id="${escapeHtml(site.id_sitio)}" data-cert-id="${escapeHtml(site.id_certificado)}" title="Abrir detalle de Sitio ${site.numero_sitio} — ${escapeHtml(site.nombre_sitio)}"`,
        emptyStateTitle: 'Sin sedes operativas vinculadas a este turno',
        emptyStateMessage: `Ninguna sede física tiene actualmente asignada la franja horaria ${startFormatted} – ${endFormatted}.`,
      })}
    </div>
  `;
}

function renderTurnoAuditoriasTab(
  turno: TurnoDetailEntity,
  auditorias: ReadonlyArray<TurnoAuditoriaLink>,
  sortState: SortState,
  columnWidths?: Record<string, number>
): string {
  const sorted = sortItems([...auditorias], sortState.column, sortState.direction, (aud, col) => {
    switch (col) {
      case 'codigo_auditoria':
        return aud.codigo_auditoria;
      case 'sitio':
        return aud.nombre_sitio;
      case 'fecha_programacion':
        return aud.fecha_programacion;
      case 'metodologia':
        return aud.metodologia;
      case 'estatus':
        return aud.estatus;
      default:
        return '';
    }
  });

  const columns: ColumnDefinition<TurnoAuditoriaLink>[] = [
    {
      id: 'codigo_auditoria',
      header: 'Auditoría',
      sortable: true,
      defaultWidthPct: 24,
      minWidthPx: 140,
      renderCell: (aud) => {
        const codename = formatAuditCodename({
          codigo_auditoria: aud.codigo_auditoria,
          tipo_auditoria: aud.tipo_auditoria,
          fecha_inicio: aud.fecha_programacion,
        });
        const tooltip = getAuditCodenameTooltip({
          codigo_auditoria: aud.codigo_auditoria,
          tipo_auditoria: aud.tipo_auditoria,
          fecha_inicio: aud.fecha_programacion,
        });
        return `
        <div class="min-w-0" title="${escapeHtml(tooltip)}">
          <div class="font-mono font-bold text-indigo-700 inline-flex items-center gap-1 max-w-full">
            <span aria-hidden="true">🗓️</span>
            <span class="truncate">${escapeHtml(codename)}</span>
          </div>
          <div class="text-[11px] text-slate-500 truncate">${escapeHtml(aud.tipo_auditoria)} · ${escapeHtml(aud.numero_certificado)}</div>
        </div>
      `;
      },
    },
    {
      id: 'sitio',
      header: 'Sitio Evaluado',
      sortable: true,
      defaultWidthPct: 24,
      minWidthPx: 130,
      renderCell: (aud) => `
        <span class="block font-semibold text-slate-800 truncate">
          ${aud.numero_sitio !== null ? `Sitio ${aud.numero_sitio} — ` : ''}${escapeHtml(aud.nombre_sitio)}
        </span>
      `,
    },
    {
      id: 'fecha_programacion',
      header: 'Fecha',
      sortable: true,
      defaultWidthPct: 16,
      minWidthPx: 105,
      renderCell: (aud) => `
        <span class="font-mono text-slate-700 tabular-nums">${escapeHtml(aud.fecha_programacion)}</span>
      `,
    },
    {
      id: 'metodologia',
      header: 'Metodología',
      sortable: true,
      defaultWidthPct: 18,
      minWidthPx: 110,
      renderCell: (aud) => `
        <span class="block text-slate-700 truncate">${escapeHtml(aud.metodologia)}</span>
      `,
    },
    {
      id: 'estatus',
      header: 'Estado',
      align: 'center',
      sortable: true,
      defaultWidthPct: 18,
      minWidthPx: 100,
      renderCell: (aud) => {
        const isDone =
          aud.estatus === 'Completada' ||
          aud.estatus === 'Completado' ||
          aud.estatus === 'Cerrada' ||
          aud.estatus === 'Cerrado';
        return `
          <span class="inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
            isDone
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-indigo-50 text-indigo-800 border-indigo-200'
          }">
            ${escapeHtml(aud.estatus)}
          </span>
        `;
      },
    },
  ];

  const startFormatted = formatTurnoTime(turno.hora_entrada);
  const endFormatted = formatTurnoTime(turno.hora_salida);

  return `
    <div class="space-y-3">
      <div>
        <h3 class="text-sm font-bold text-slate-900">Auditorías en este Turno</h3>
        <p class="text-xs text-slate-500">
          Eventos de evaluación programados o ejecutados durante la cobertura de este turno.
        </p>
      </div>

      ${renderListViewTable({
        tableId: 'turno-tab-auditorias',
        items: sorted,
        columns,
        sortState,
        columnWidths,
        getRowAttrs: (aud) =>
          `data-action="select-prog-audit" data-audit-id="${escapeHtml(aud.id_auditoria)}" title="Abrir detalle de auditoría ${escapeHtml(aud.codigo_auditoria)}"`,
        emptyStateTitle: 'Sin auditorías programadas en este turno',
        emptyStateMessage: `No hay jornadas de auditoría asignadas actualmente a las sedes que operan en ${startFormatted} – ${endFormatted}.`,
      })}
    </div>
  `;
}
