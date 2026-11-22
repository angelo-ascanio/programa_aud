import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/accessControl';
import { canArchiveRecord } from '../lib/archiveGovernance';
import type { ProgramacionAuditEntity } from '../lib/auditExecution';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import {
  canArchiveSitio,
  canUnlinkSitioFromCert,
  computeSitioSummaryMetrics,
  createEmptySitioFormDraft,
  createSitioFormDraftFromEntity,
  formatShiftTime,
  getAvailableProcesosForSitio,
  INITIAL_TURNO_CATALOG,
  resolveSitioDetailById,
  resolveSitioDetailMode,
  suggestNextNumeroSitio,
  type ProcesoPorSitioLink,
  type SitioAuditoriaLink,
  type SitioDetailEntity,
  type SitioFormDraft,
  type SitioTurnoAssignment,
  type TurnoCatalogItem,
} from '../lib/sitioDomain';
import { sortItems, type ColumnDefinition, type SortState } from '../lib/universalTemplate';
import { renderListViewTable } from './universalTemplate';
import {
  renderDetailFormTopActions,
  renderDetailPageTemplate,
  type DetailParentChip,
} from './detailTemplate';

export type SitioChildTab = 'turnos' | 'procesos' | 'auditorias';

export interface SitioSharedCertContext {
  isSharedFromAnother: boolean;
  certId: string;
  certNumero?: string;
  ownerCertId?: string;
  ownerCertLabel?: string | null;
  linkId?: string | null;
  isClientCrossOrgRestricted?: boolean;
  sharedTargetsCount?: number;
}

export interface SitioViewState {
  selectedSitioId: string | null;
  activeChildTab: SitioChildTab;
  isCreating?: boolean;
  prefillCertId?: string | null;
  isEditingAttributes: boolean;
  formDraft?: SitioFormDraft;
  editFormData?: {
    id_certificado?: string;
    numero_sitio?: number | string;
    nombre_sitio?: string;
    direccion_sitio?: string;
    personal_count?: number | string;
    sharedContext?: SitioSharedCertContext;
  };
  editErrorMessage?: string | null;
  archiveConfirmOpen?: boolean;
  archiveErrorMessage?: string | null;
  isAssigningShift?: boolean;
  isAssigningProceso?: boolean;
  childSortState?: Partial<Record<SitioChildTab, SortState>>;
}

export interface SitioViewProps {
  profile: UserProfile;
  state: SitioViewState;
  sitio: SitioDetailEntity | null;
  activeCertId?: string | null;
  certificates?: ReadonlyArray<CertificadoDetailEntity>;
  authorizedClientOrgIds?: ReadonlyArray<string>;
  shareLinkId?: string | null;
  programacionAudits?: ReadonlyArray<ProgramacionAuditEntity>;
  archivedProcesoIds?: ReadonlySet<string>;
  siblingSites?: ReadonlyArray<{
    id: string;
    id_certificado: string;
    numero_sitio: number;
    deleted_at?: string | null;
  }>;
  shiftCatalog?: ReadonlyArray<TurnoCatalogItem>;
  tableColumnWidths?: Record<string, Record<string, number>>;
}

const DEFAULT_SITIO_CHILD_SORT: SortState = { column: null, direction: 'none' };

export function renderSitioView(props: SitioViewProps): string {
  const {
    profile,
    state,
    sitio: incomingSitio,
    activeCertId,
    certificates = [],
    authorizedClientOrgIds,
    shareLinkId,
    programacionAudits = [],
    archivedProcesoIds,
    siblingSites = [],
    shiftCatalog = INITIAL_TURNO_CATALOG,
    tableColumnWidths,
  } = props;

  const isStaff = isApprovedStaffProfile(profile);
  const prelimMode = resolveSitioDetailMode(state, isStaff, incomingSitio);
  const contextCertId = (
    activeCertId ||
    state.prefillCertId ||
    state.editFormData?.sharedContext?.certId ||
    incomingSitio?.id_certificado ||
    ''
  ).trim();

  const resolvedScopedSitio =
    prelimMode !== 'add' &&
    incomingSitio &&
    contextCertId &&
    certificates.length > 0 &&
    incomingSitio.id_certificado !== contextCertId
      ? resolveSitioDetailById({
          sitioId: incomingSitio.id,
          activeCertId: contextCertId,
          certificates,
          programacionAudits,
          shiftCatalog,
          archivedProcesoIds,
        }) || incomingSitio
      : incomingSitio;

  const sitio: SitioDetailEntity | null = resolvedScopedSitio
    ? {
        ...resolvedScopedSitio,
        procesos: resolvedScopedSitio.procesos.filter(
          (proc) =>
            !archivedProcesoIds?.has(proc.id_proceso) &&
            (!contextCertId || !proc.id_certificado || proc.id_certificado === contextCertId)
        ),
      }
    : null;

  const mode = resolveSitioDetailMode(state, isStaff, sitio);
  const isCreateMode = mode === 'add';
  const activeTab: SitioChildTab =
    state.activeChildTab === 'auditorias'
      ? 'auditorias'
      : state.activeChildTab === 'procesos'
      ? 'procesos'
      : 'turnos';

  const contextCert =
    !isCreateMode && contextCertId && certificates.length > 0
      ? certificates.find((c) => c.id === contextCertId)
      : undefined;
  const contextSitio =
    contextCert && sitio
      ? (contextCert.sitios || []).find((s) => s.id === sitio.id)
      : undefined;
  const fallbackContext = !isCreateMode ? state.editFormData?.sharedContext : undefined;

  const ownerCertId = (
    contextSitio?.ownerCertId ||
    contextSitio?.sharedFromCertId ||
    sitio?.ownerCertId ||
    sitio?.sharedFromCertId ||
    fallbackContext?.ownerCertId ||
    ''
  ).trim();
  const ownerCert =
    ownerCertId && certificates.length > 0
      ? certificates.find((c) => c.id === ownerCertId)
      : undefined;

  const isReceivingSharedContext = Boolean(
    !isCreateMode &&
      sitio &&
      (contextSitio
        ? Boolean(contextSitio.sharedFromCertId) ||
          Boolean(ownerCertId && contextCertId && ownerCertId !== contextCertId)
        : Boolean(sitio.sharedFromCertId) ||
          Boolean(ownerCertId && contextCertId && ownerCertId !== contextCertId) ||
          Boolean(fallbackContext?.isSharedFromAnother))
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

  const sharedOutCount =
    contextSitio?.sharedTargets?.length ??
    sitio?.sharedTargets?.length ??
    fallbackContext?.sharedTargetsCount ??
    0;

  const targetCertForCreate =
    certificates.find((c) => c.id === (state.formDraft?.id_certificado || state.prefillCertId || '')) ||
    null;
  const createCertSites = targetCertForCreate ? targetCertForCreate.sitios : [];

  const draft: SitioFormDraft =
    mode === 'add'
      ? state.formDraft ?? createEmptySitioFormDraft(state.prefillCertId, createCertSites)
      : mode === 'edit'
      ? state.formDraft ??
        (state.editFormData && sitio
          ? {
              id_certificado: state.editFormData.id_certificado ?? sitio.id_certificado,
              numero_sitio:
                state.editFormData.numero_sitio !== undefined
                  ? String(state.editFormData.numero_sitio)
                  : String(sitio.numero_sitio),
              nombre_sitio: state.editFormData.nombre_sitio ?? sitio.nombre_sitio,
              direccion_sitio: state.editFormData.direccion_sitio ?? sitio.direccion_sitio,
              personal_count:
                state.editFormData.personal_count !== undefined
                  ? String(state.editFormData.personal_count)
                  : String(sitio.personal_count ?? 10),
            }
          : sitio
          ? createSitioFormDraftFromEntity(sitio)
          : createEmptySitioFormDraft(state.prefillCertId))
      : sitio
      ? createSitioFormDraftFromEntity(sitio)
      : createEmptySitioFormDraft(state.prefillCertId);

  const selectedCert =
    certificates.find((c) => c.id === draft.id_certificado) ||
    (sitio ? certificates.find((c) => c.id === sitio.id_certificado) : undefined) ||
    null;

  const parsedNum = Number(draft.numero_sitio);
  const isHq = isCreateMode
    ? draft.numero_sitio.trim() !== '' && !Number.isNaN(parsedNum) && parsedNum === 0
    : Boolean(sitio && sitio.numero_sitio === 0);

  const archiveGuard = sitio
    ? canArchiveSitio({
        site: sitio,
        siblingSites,
        associatedAuditsCount: sitio.auditorias.length,
        sharedTargetsCount: isReceivingSharedContext ? 0 : sharedOutCount,
      })
    : { allowed: true };

  const parents: DetailParentChip[] =
    mode === 'read' && sitio
      ? [
          {
            label: 'Organización',
            value: `${sitio.organizacion_nombre} (${sitio.organizacion_rif})`,
            symbol: '🏢',
            navAction: {
              nav: 'certificacion',
              subview: 'organizations',
              entityType: 'org',
              entityId: sitio.id_organizacion,
            },
          },
          {
            label: 'Certificado',
            value: `${sitio.numero_certificado} · ${sitio.norma_codigo}`,
            symbol: '📜',
            navAction: {
              nav: 'certificacion',
              subview: 'certificates',
              entityType: 'cert',
              entityId: sitio.id_certificado,
              targetTab: 'sitios',
            },
          },
        ]
      : [];

  let parentMetaHtml = '';
  if (mode === 'read' && sitio) {
    if (isReceivingSharedContext) {
      if (isClientCrossOrgRestricted) {
        parentMetaHtml = `
          <div class="flex flex-wrap items-center gap-2 pt-1">
            <span class="inline-flex items-center px-2.5 py-1 rounded-lg border border-indigo-200 bg-indigo-50 text-xs font-semibold text-indigo-800">
              Sitio compartido dentro del conglomerado
            </span>
          </div>
        `;
      } else {
        const rawOriginLabel =
          ownerCert?.numero_certificado ||
          contextSitio?.sharedFromCertLabel ||
          sitio.sharedFromCertLabel ||
          fallbackContext?.ownerCertLabel ||
          '';
        const originCertNum = rawOriginLabel
          ? rawOriginLabel.split(' · ')[0].trim()
          : 'certificado origen';
        const resolvedShareLinkId =
          shareLinkId ||
          contextSitio?.sharedTargets?.find((st) => st.targetCertId === contextCertId)
            ?.linkId ||
          sitio.sharedTargets?.find((st) => st.targetCertId === contextCertId)?.linkId ||
          fallbackContext?.linkId ||
          '';
        const unlinkCheck = contextCertId
          ? canUnlinkSitioFromCert({
              site: {
                id: sitio.id,
                id_certificado: sitio.id_certificado,
                nombre_sitio: sitio.nombre_sitio,
                ownerCertId: ownerCertId || undefined,
                sharedFromCertId: ownerCertId || fallbackContext?.ownerCertId || contextCertId,
              },
              targetCertId: contextCertId,
              programacionAudits,
              associatedAuditsInTargetCertCount:
                sitio.auditorias.length > 0 ? sitio.auditorias.length : undefined,
            })
          : { allowed: false, reason: 'Contexto de certificado no válido.' };

        const unlinkControlHtml =
          isStaff && contextCertId && contextCertId !== ownerCertId
            ? unlinkCheck.allowed
              ? `
                <button
                  type="button"
                  data-action="unlink-shared-child"
                  data-share-table="sitio_certificado_compartido"
                  data-share-link-id="${escapeHtml(resolvedShareLinkId)}"
                  data-cert-id="${escapeHtml(contextCertId)}"
                  data-entity-id="${escapeHtml(sitio.id)}"
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                >
                  Desvincular de este certificado
                </button>
              `
              : `
                <button
                  type="button"
                  data-action="unlink-shared-child"
                  data-share-table="sitio_certificado_compartido"
                  data-share-link-id="${escapeHtml(resolvedShareLinkId)}"
                  data-cert-id="${escapeHtml(contextCertId)}"
                  data-entity-id="${escapeHtml(sitio.id)}"
                  disabled
                  title="${escapeHtml(unlinkCheck.reason || 'Desvinculación bloqueada por auditorías activas en este certificado.')}"
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-100 text-slate-500 text-xs font-semibold cursor-not-allowed whitespace-nowrap opacity-75"
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
            ${unlinkControlHtml}
          </div>
        `;
      }
    } else if (isStaff && sharedOutCount > 0) {
      parentMetaHtml = `
        <div class="flex flex-wrap items-center gap-2 pt-1">
          <span class="inline-flex items-center px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-100 text-xs font-medium text-slate-700 tabular-nums">
            Compartido con ${sharedOutCount} certificado${sharedOutCount === 1 ? '' : 's'} del conglomerado
          </span>
        </div>
      `;
    }
  }

  const customParentZoneHtml =
    mode === 'add' || mode === 'edit'
      ? renderSitioParentSelector({
          draft,
          sitio,
          certificates,
          selectedCert,
          isCreateMode,
        })
      : undefined;

  const customTopActionsHtml = isStaff
    ? renderDetailFormTopActions({
        mode,
        isStaff: true,
        formId: 'sitioDetailForm',
        saveBtnId: 'saveSitioFormBtn',
        cancelBtnId: 'cancelEditSitioBtn',
        editBtnId: 'startEditSitioBtn',
        saveTitle: isCreateMode ? 'Crear sede' : 'Guardar cambios',
        cancelTitle: isCreateMode ? 'Cancelar creación' : 'Cancelar edición',
        editTitle: 'Editar',
        showHistoryBtn: !isCreateMode,
        showArchiveBtn: !isCreateMode && canArchiveRecord(profile),
        archiveBtnDataAction: 'open-archive-sitio',
        extraAuditAttrs: sitio
          ? `data-table-name="sitio" data-record-id="${escapeHtml(sitio.id)}" data-entity-name="${escapeHtml(`Sitio ${sitio.numero_sitio} — ${sitio.nombre_sitio}`)}"`
          : '',
        extraArchiveAttrs: sitio ? `data-sitio-id="${escapeHtml(sitio.id)}"` : '',
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
    ${
      isStaff && !isCreateMode && sitio && state.archiveConfirmOpen
        ? archiveGuard.allowed
          ? `
            <div class="p-4 bg-rose-50/80 border border-rose-200 rounded-xl space-y-3">
              <div class="space-y-0.5">
                <h4 class="text-xs font-bold text-rose-900">Confirmar archivo lógico de sitio</h4>
                <p class="text-[11px] text-rose-800">
                  El sitio <strong>Sitio ${sitio.numero_sitio} — ${escapeHtml(sitio.nombre_sitio)}</strong> pasará a estado archivado (soft-delete) manteniendo la trazabilidad en Historial de Cambios.
                </p>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
                <div class="sm:col-span-2">
                  <label for="archiveSitioReasonInput" class="sr-only">Motivo de archivo</label>
                  <input
                    id="archiveSitioReasonInput"
                    type="text"
                    placeholder="Motivo de archivo (opcional, ej. Cierre operativo de sucursal)"
                    class="w-full text-xs rounded-lg border border-rose-300 bg-white px-2.5 py-1.5"
                  />
                </div>
                <div class="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    id="cancelArchiveSitioBtn"
                    class="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    id="confirmArchiveSitioBtn"
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
                <strong class="font-bold">Archivo bloqueado:</strong> ${escapeHtml(archiveGuard.reason || 'Existen dependencias activas asociadas a este sitio.')}
              </div>
              <button
                type="button"
                id="cancelArchiveSitioBtn"
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
      ? renderSitioFormBody(draft, isHq)
      : sitio
      ? renderReadOnlySitioBody(sitio, isHq)
      : '';

  const title = isCreateMode
    ? 'Nueva Sede Operativa'
    : sitio
    ? `Sitio ${sitio.numero_sitio} — ${sitio.nombre_sitio}`
    : 'Sitio Operativo';

  const eyebrowCode = isCreateMode
    ? selectedCert
      ? `${selectedCert.numero_certificado} · ${selectedCert.norma_codigo}`
      : 'ALTA DE SEDE'
    : sitio
    ? `${sitio.numero_certificado} · ${sitio.norma_codigo}`
    : '';

  const subtitle = isCreateMode
    ? selectedCert
      ? `${selectedCert.organizacion_nombre} (${selectedCert.organizacion_rif}) · Registro de instalación bajo alcance certificado`
      : 'Configuración de sede principal (Sitio 0) o sucursal operativa conforme a IAF MD 1:2018'
    : sitio
    ? `${sitio.organizacion_nombre} (${sitio.organizacion_rif}) · ${sitio.direccion_sitio}`
    : '';

  const statusBadge = isCreateMode
    ? isHq
      ? {
          label: 'Sede Principal (Sitio 0)',
          badgeClass: 'bg-amber-50 text-amber-900 border-amber-300',
          symbol: '★',
        }
      : {
          label: `Nueva Sucursal (Sitio #${Number.isNaN(parsedNum) ? '?' : parsedNum})`,
          badgeClass: 'bg-slate-100 text-slate-800 border-slate-200',
          symbol: '📍',
        }
    : isHq
    ? {
        label: 'Sede Principal (Sitio 0)',
        badgeClass: 'bg-amber-50 text-amber-900 border-amber-300',
        symbol: '★',
      }
    : {
        label: `Sucursal Operativa (Sitio #${sitio?.numero_sitio ?? 0})`,
        badgeClass: 'bg-slate-100 text-slate-800 border-slate-200',
        symbol: '📍',
      };

  const secondaryHeaderBadge =
    !isCreateMode && sitio
      ? {
          label: sitio.multisitio ? 'Alcance Multisitio' : 'Sede Única',
          badgeClass: sitio.multisitio
            ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
            : 'bg-slate-50 text-slate-700 border-slate-200',
        }
      : undefined;

  const metrics = sitio ? computeSitioSummaryMetrics(sitio) : null;

  return renderDetailPageTemplate({
    entityType: 'Sitio Operativo',
    entitySymbol: isHq ? '🏢' : '📍',
    title,
    eyebrowCode,
    subtitle,
    statusBadge,
    secondaryHeaderBadge,
    backButton: {
      label:
        !isCreateMode && sitio
          ? `Volver a ${sitio.numero_certificado}`
          : selectedCert
          ? `Volver a ${selectedCert.numero_certificado}`
          : 'Volver',
      nav: 'certificacion',
      subview: 'certificates',
      action: 'back-to-cert-from-sitio',
    },
    isCreateMode,
    customTopActionsHtml,
    parents,
    parentMetaHtml,
    customParentZoneHtml,
    tableName: 'sitio',
    recordId: sitio?.id || 'new',
    feedbackHtml,
    attributes: [],
    customRecordBodyHtml,
    childTabs:
      !isCreateMode && sitio && metrics
        ? [
            {
              id: 'turnos',
              label: 'Turnos Operativos Asignados',
              symbol: '🕒',
              count: metrics.turnosCount,
            },
            {
              id: 'procesos',
              label: 'Procesos del Sitio',
              symbol: '⚙️',
              count: metrics.procesosCount,
            },
            {
              id: 'auditorias',
              label: 'Auditorías en este Sitio',
              symbol: '🗓️',
              count: metrics.auditoriasCount,
            },
          ]
        : [],
    activeChildTabId: activeTab,
    childTabAttrName: 'data-sitio-tab',
    renderChildTabContent:
      !isCreateMode && sitio
        ? (tabId) =>
            tabId === 'auditorias'
              ? renderSitioAuditoriasTab(
                  sitio,
                  sitio.auditorias,
                  state.childSortState?.auditorias || DEFAULT_SITIO_CHILD_SORT,
                  tableColumnWidths?.['sitio-tab-auditorias']
                )
              : tabId === 'procesos'
              ? renderSitioProcesosTab({
                  sitio,
                  selectedCert,
                  procesos: sitio.procesos,
                  isStaff,
                  isAssigningProceso: state.isAssigningProceso !== false,
                  sortState: state.childSortState?.procesos || DEFAULT_SITIO_CHILD_SORT,
                  columnWidths: tableColumnWidths?.['sitio-tab-procesos'],
                })
              : renderSitioTurnosTab({
                  sitio,
                  turnos: sitio.turnos,
                  shiftCatalog,
                  isStaff,
                  isAssigningShift: Boolean(state.isAssigningShift),
                  sortState: state.childSortState?.turnos || DEFAULT_SITIO_CHILD_SORT,
                  columnWidths: tableColumnWidths?.['sitio-tab-turnos'],
                })
        : undefined,
  });
}

function renderSitioParentSelector(params: {
  draft: SitioFormDraft;
  sitio: SitioDetailEntity | null;
  certificates: ReadonlyArray<CertificadoDetailEntity>;
  selectedCert: CertificadoDetailEntity | null;
  isCreateMode: boolean;
}): string {
  const { draft, sitio, certificates, selectedCert, isCreateMode } = params;

  const certOptions =
    certificates.length > 0
      ? certificates
      : sitio
      ? [
          {
            id: sitio.id_certificado,
            numero_certificado: sitio.numero_certificado,
            norma_codigo: sitio.norma_codigo,
            organizacion_nombre: sitio.organizacion_nombre,
            sitios: [],
          },
        ]
      : [];

  const nextSuggested =
    selectedCert && isCreateMode
      ? suggestNextNumeroSitio(selectedCert.sitios)
      : null;

  return `
    <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
      <label for="sitioSelectCertificado" class="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
        Certificado de Conformidad <span class="text-rose-600" aria-hidden="true">*</span>
      </label>
      <select
        id="sitioSelectCertificado"
        name="id_certificado"
        form="sitioDetailForm"
        required
        class="w-full text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
      >
        <option value="">Seleccione un certificado...</option>
        ${certOptions
          .map((cert) => {
            const selected = draft.id_certificado === cert.id;
            return `
              <option value="${escapeHtml(cert.id)}" ${selected ? 'selected' : ''}>
                ${escapeHtml(cert.numero_certificado)} · ${escapeHtml(cert.norma_codigo)} (${escapeHtml(cert.organizacion_nombre)})
              </option>
            `;
          })
          .join('')}
      </select>
      <p class="text-[11px] text-slate-500">
        ${
          selectedCert && isCreateMode && nextSuggested !== null
            ? nextSuggested === 0
              ? `Este certificado aún no posee Sede Principal (Sitio 0); se sugiere iniciar con Sitio 0.`
              : `Sugerencia automática para este certificado: Sitio #${nextSuggested} (siguiente disponible).`
            : 'La sede queda vinculada al alcance geográfico del certificado seleccionado.'
        }
      </p>
    </div>
  `;
}

function renderReadOnlySitioBody(sitio: SitioDetailEntity, isHq: boolean): string {
  const metrics = computeSitioSummaryMetrics(sitio);

  return `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <div class="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-1">
        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Identificador de Sede</div>
        <div class="flex items-center gap-2">
          <span class="font-mono text-xs font-bold px-2 py-0.5 rounded ${
            isHq
              ? 'bg-slate-900 text-white'
              : 'bg-slate-100 text-slate-800 border border-slate-200'
          }">
            Sitio ${sitio.numero_sitio}
          </span>
          <span class="text-xs font-semibold text-slate-700">
            ${isHq ? 'Sede Principal (Sitio 0)' : escapeHtml(sitio.tipo_sitio || 'Sucursal Operativa')}
          </span>
        </div>
      </div>

      <div class="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-1">
        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Nombre de la Sede</div>
        <div class="text-xs font-bold text-slate-900">${escapeHtml(sitio.nombre_sitio)}</div>
        <div class="text-[11px] text-slate-500">
          ${sitio.personal_count !== undefined ? `Personal asignado: ${sitio.personal_count} personas` : 'Personal operativo cubierto'}
        </div>
      </div>

      <div class="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-1">
        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Certificado Asociado</div>
        <div class="text-xs font-mono font-bold text-slate-900">${escapeHtml(sitio.numero_certificado)}</div>
        <div class="text-[11px] text-slate-500">${escapeHtml(sitio.norma_codigo)} · Estatus ${escapeHtml(sitio.certificado_estatus)}</div>
      </div>

      <div class="sm:col-span-2 p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-1">
        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Dirección Física del Sitio</div>
        <div class="text-xs font-medium text-slate-900">${escapeHtml(sitio.direccion_sitio)}</div>
        ${
          sitio.actividades
            ? `<div class="text-[11px] text-slate-500 pt-0.5">${escapeHtml(sitio.actividades)}</div>`
            : ''
        }
      </div>

      <div class="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-1.5" data-sitio-summary-metrics="true">
        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Resumen Operativo del Sitio</div>
        <div class="grid grid-cols-3 gap-2 text-center">
          <div class="bg-white border border-slate-200/80 rounded-lg py-1.5 px-1">
            <div class="text-xs font-extrabold text-slate-900 tabular-nums">${metrics.turnosCount}</div>
            <div class="text-[10px] font-semibold text-slate-500 truncate">Turnos</div>
          </div>
          <div class="bg-white border border-slate-200/80 rounded-lg py-1.5 px-1">
            <div class="text-xs font-extrabold text-indigo-700 tabular-nums">${metrics.procesosCount}</div>
            <div class="text-[10px] font-semibold text-slate-500 truncate">Procesos</div>
          </div>
          <div class="bg-white border border-slate-200/80 rounded-lg py-1.5 px-1">
            <div class="text-xs font-extrabold text-slate-900 tabular-nums">${metrics.auditoriasCount}</div>
            <div class="text-[10px] font-semibold text-slate-500 truncate">Auditorías</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderSitioFormBody(draft: SitioFormDraft, isHq: boolean): string {
  return `
    <form id="sitioDetailForm" class="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="space-y-1">
          <label for="sitioNumeroInput" class="block text-xs font-bold text-slate-700">
            Número de Sitio <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <input
            id="sitioNumeroInput"
            name="numero_sitio"
            type="number"
            min="0"
            step="1"
            required
            value="${escapeHtml(draft.numero_sitio)}"
            class="w-full text-xs font-mono p-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
          <p class="text-[10px] text-slate-500">
            ${isHq ? '0 = Sede Principal (HQ) protegida por IAF MD 1.' : '0 = Sede Principal (HQ), ≥ 1 = Sucursales.'}
          </p>
        </div>

        <div class="sm:col-span-2 space-y-1">
          <label for="sitioNombreInput" class="block text-xs font-bold text-slate-700">
            Nombre de la Sede <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <input
            id="sitioNombreInput"
            name="nombre_sitio"
            type="text"
            maxlength="150"
            required
            placeholder="Ej. Planta Principal Caracas / Sucursal Valencia"
            value="${escapeHtml(draft.nombre_sitio)}"
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
          <p class="text-[10px] text-slate-500">Máximo 150 caracteres.</p>
        </div>

        <div class="sm:col-span-2 space-y-1">
          <label for="sitioDireccionInput" class="block text-xs font-bold text-slate-700">
            Dirección Física <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <input
            id="sitioDireccionInput"
            name="direccion_sitio"
            type="text"
            required
            placeholder="Ej. Zona Industrial Norte, Parcela 14, Valencia"
            value="${escapeHtml(draft.direccion_sitio)}"
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        <div class="space-y-1">
          <label for="sitioPersonalCountInput" class="block text-xs font-bold text-slate-700">
            Personal asignado <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <input
            id="sitioPersonalCountInput"
            name="personal_count"
            type="number"
            min="1"
            max="50000"
            step="1"
            required
            value="${escapeHtml(draft.personal_count ?? '10')}"
            class="w-full text-xs font-mono tabular-nums p-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
          <p class="text-[10px] text-slate-500">Entre 1 y 50,000 personas (base IAF MD 5).</p>
        </div>
      </div>
    </form>
  `;
}

function renderSitioTurnosTab(params: {
  sitio: SitioDetailEntity;
  turnos: ReadonlyArray<SitioTurnoAssignment>;
  shiftCatalog: ReadonlyArray<TurnoCatalogItem>;
  isStaff: boolean;
  isAssigningShift: boolean;
  sortState: SortState;
  columnWidths?: Record<string, number>;
}): string {
  const { sitio, turnos, shiftCatalog, isStaff, isAssigningShift, sortState, columnWidths } = params;
  const assignedTurnoIds = new Set(turnos.map((t) => t.id_turno));
  const availableShifts = shiftCatalog.filter((t) => !assignedTurnoIds.has(t.id));

  const sortedTurnos = sortItems([...turnos], sortState.column, sortState.direction, (t, col) => {
    switch (col) {
      case 'hora_entrada':
        return t.hora_entrada;
      case 'hora_salida':
        return t.hora_salida;
      case 'durationHoursLabel':
        return t.durationHoursLabel;
      case 'descripcion':
        return t.descripcion;
      default:
        return '';
    }
  });

  const columns: ColumnDefinition<SitioTurnoAssignment>[] = [
    {
      id: 'hora_entrada',
      header: 'Horario Entrada',
      sortable: true,
      defaultWidthPct: 18,
      minWidthPx: 110,
      renderCell: (turno) => `
        <span class="font-mono font-bold text-slate-900 tabular-nums">
          ${escapeHtml(formatShiftTime(turno.hora_entrada))}
        </span>
      `,
    },
    {
      id: 'hora_salida',
      header: 'Horario Salida',
      sortable: true,
      defaultWidthPct: 18,
      minWidthPx: 110,
      renderCell: (turno) => `
        <span class="font-mono font-bold text-slate-900 tabular-nums">
          ${escapeHtml(formatShiftTime(turno.hora_salida))}
        </span>
      `,
    },
    {
      id: 'durationHoursLabel',
      header: 'Duración',
      sortable: true,
      defaultWidthPct: 18,
      minWidthPx: 100,
      renderCell: (turno) => `
        <span class="inline-flex px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 font-mono text-[11px] font-bold">
          ${escapeHtml(turno.durationHoursLabel)}
        </span>
      `,
    },
    {
      id: 'descripcion',
      header: 'Descripción Operativa',
      sortable: true,
      defaultWidthPct: 46,
      minWidthPx: 180,
      renderCell: (turno) => `
        <span class="inline-flex items-center gap-1.5 font-bold text-indigo-700 max-w-full" title="${escapeHtml(turno.descripcion)}">
          <span aria-hidden="true" class="shrink-0">🕒</span>
          <span class="truncate">${escapeHtml(turno.descripcion)}</span>
        </span>
      `,
    },
  ];

  return `
    <div class="space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 class="text-sm font-bold text-slate-900">Turnos Operativos Asignados</h3>
          <p class="text-xs text-slate-500">
            Franjas horarias de operación vinculadas a Sitio ${sitio.numero_sitio} (${escapeHtml(sitio.nombre_sitio)}).
          </p>
        </div>

        ${
          isStaff
            ? `
              <button
                type="button"
                data-action="toggle-assign-sitio-turno"
                class="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer self-start sm:self-auto"
              >
                ${isAssigningShift ? '✕ Cerrar Gestión' : '⚙ Gestionar Turnos'}
              </button>
            `
            : ''
        }
      </div>

      ${
        isStaff && isAssigningShift
          ? `
            <div id="sitioTurnosManagementPanel" class="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <form id="assignSitioTurnoForm" class="flex flex-col sm:flex-row sm:items-end gap-3">
                <div class="flex-1 space-y-1">
                  <label for="assignSitioTurnoSelect" class="block text-xs font-bold text-slate-700">Vincular Turno Operativo (turnos_por_sitio)</label>
                  ${
                    availableShifts.length === 0
                      ? `<p class="text-xs text-slate-500 py-1.5">Todos los turnos del catálogo ya están asignados a este sitio.</p>`
                      : `
                        <select
                          id="assignSitioTurnoSelect"
                          name="id_turno"
                          required
                          class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white"
                        >
                          ${availableShifts
                            .map(
                              (shift) => `
                                <option value="${escapeHtml(shift.id)}">
                                  ${escapeHtml(formatShiftTime(shift.hora_entrada))} → ${escapeHtml(formatShiftTime(shift.hora_salida))} · ${escapeHtml(shift.descripcion)}
                                </option>
                              `
                            )
                            .join('')}
                        </select>
                      `
                  }
                </div>
                ${
                  availableShifts.length > 0
                    ? `
                      <button
                        type="submit"
                        class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors cursor-pointer shrink-0"
                      >
                        + Vincular Turno
                      </button>
                    `
                    : ''
                }
              </form>

              ${
                turnos.length > 0
                  ? `
                    <form id="unassignSitioTurnoForm" class="pt-3 border-t border-slate-200 flex flex-col sm:flex-row sm:items-end gap-3">
                      <div class="flex-1 space-y-1">
                        <label for="unassignSitioTurnoSelect" class="block text-xs font-bold text-slate-700">Desvincular Turno del Sitio</label>
                        <select
                          id="unassignSitioTurnoSelect"
                          name="id_turno"
                          required
                          class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white"
                        >
                          ${turnos
                            .map(
                              (t) => `
                                <option value="${escapeHtml(t.id_turno)}">
                                  ${escapeHtml(formatShiftTime(t.hora_entrada))} → ${escapeHtml(formatShiftTime(t.hora_salida))} · ${escapeHtml(t.descripcion)}
                                </option>
                              `
                            )
                            .join('')}
                        </select>
                      </div>
                      <button
                        type="submit"
                        class="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors cursor-pointer shrink-0"
                      >
                        Desvincular Turno
                      </button>
                    </form>
                  `
                  : ''
              }
            </div>
          `
          : ''
      }

      ${renderListViewTable({
        tableId: 'sitio-tab-turnos',
        items: sortedTurnos,
        columns,
        sortState,
        columnWidths,
        getRowAttrs: (turno) =>
          `data-action="select-turno-preview" data-turno-id="${escapeHtml(turno.id_turno)}" data-sitio-id="${escapeHtml(sitio.id)}" data-cert-id="${escapeHtml(sitio.id_certificado)}" title="Abrir detalle del turno ${escapeHtml(formatShiftTime(turno.hora_entrada))} – ${escapeHtml(formatShiftTime(turno.hora_salida))}"`,
        emptyStateTitle: 'No hay turnos asignados a este sitio',
        emptyStateMessage:
          'Utilice el botón "Gestionar Turnos" para vincular franjas horarias cubiertas en las auditorías de campo.',
      })}
    </div>
  `;
}

function getSitioProcesoTipoBadgeClass(tipo: string): string {
  switch (tipo) {
    case 'Estratégico':
      return 'bg-purple-50 text-purple-800 border-purple-200';
    case 'Medular':
      return 'bg-sky-50 text-sky-800 border-sky-200';
    case 'De Apoyo':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

function renderSitioProcesosTab(params: {
  sitio: SitioDetailEntity;
  selectedCert: CertificadoDetailEntity | null;
  procesos: ReadonlyArray<ProcesoPorSitioLink>;
  isStaff: boolean;
  isAssigningProceso: boolean;
  sortState: SortState;
  columnWidths?: Record<string, number>;
}): string {
  const { sitio, selectedCert, procesos, isStaff, isAssigningProceso, sortState, columnWidths } = params;
  const availableProcesos = selectedCert
    ? getAvailableProcesosForSitio(sitio.id, selectedCert)
    : [];

  const sortedProcesos = sortItems([...procesos], sortState.column, sortState.direction, (p, col) => {
    switch (col) {
      case 'nombre_proceso':
        return p.nombre_proceso;
      case 'tipo_proceso':
        return p.tipo_proceso;
      case 'clausulas_cubiertas': {
        const codes =
          p.requisitos_detalle && p.requisitos_detalle.length > 0
            ? p.requisitos_detalle.map((r) => r.codigo)
            : p.clausulas_cubiertas || [];
        return codes.join(', ');
      }
      default:
        return '';
    }
  });

  const columns: ColumnDefinition<ProcesoPorSitioLink>[] = [
    {
      id: 'nombre_proceso',
      header: 'Proceso',
      sortable: true,
      defaultWidthPct: 40,
      minWidthPx: 160,
      renderCell: (proc) => `
        <span class="inline-flex items-center gap-1.5 font-bold text-indigo-700 max-w-full" title="${escapeHtml(proc.nombre_proceso)}">
          <span aria-hidden="true" class="shrink-0">⚙️</span>
          <span class="truncate">${escapeHtml(proc.nombre_proceso)}</span>
        </span>
      `,
    },
    {
      id: 'tipo_proceso',
      header: 'Tipo',
      sortable: true,
      defaultWidthPct: 22,
      minWidthPx: 110,
      renderCell: (proc) => `
        <span class="inline-flex px-2 py-0.5 rounded text-[11px] font-bold border ${getSitioProcesoTipoBadgeClass(proc.tipo_proceso)}">
          ${escapeHtml(proc.tipo_proceso)}
        </span>
      `,
    },
    {
      id: 'clausulas_cubiertas',
      header: 'Cláusulas Cubiertas',
      sortable: true,
      defaultWidthPct: 38,
      minWidthPx: 150,
      renderCell: (proc) => {
        const detalle = proc.requisitos_detalle || [];
        const clausulas = proc.clausulas_cubiertas || [];
        const summary =
          detalle.length > 0
            ? detalle.map((r) => r.codigo).join(', ')
            : clausulas.join(', ');

        if (!summary) {
          return `<span class="text-[11px] text-slate-400 italic">Sin cláusulas asignadas</span>`;
        }

        return `
          <div class="flex items-center gap-1 overflow-hidden" title="${escapeHtml(summary)}">
            ${
              detalle.length > 0
                ? detalle
                    .map(
                      (req) => `
                        <span class="inline-flex items-center px-2 py-0.5 bg-slate-50 border border-slate-200 rounded text-[11px] font-mono font-bold text-sky-800 shrink-0" title="${escapeHtml(req.titulo)}">
                          ${escapeHtml(req.codigo)}
                        </span>
                      `
                    )
                    .join('')
                : clausulas
                    .map(
                      (code) => `
                        <span class="px-2 py-0.5 bg-slate-50 border border-slate-200 rounded text-[11px] font-mono font-bold text-slate-800 shrink-0">
                          ${escapeHtml(code)}
                        </span>
                      `
                    )
                    .join('')
            }
          </div>
        `;
      },
    },
  ];

  return `
    <div class="space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 class="text-sm font-bold text-slate-900">Procesos del Sitio</h3>
          <p class="text-xs text-slate-500">
            Procesos operativos de ${escapeHtml(sitio.numero_certificado)} ejecutados físicamente en Sitio ${sitio.numero_sitio} (${escapeHtml(sitio.nombre_sitio)}).
          </p>
        </div>

        ${
          isStaff
            ? `
              <button
                type="button"
                data-action="toggle-assign-sitio-proceso"
                class="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer self-start sm:self-auto"
              >
                ${isAssigningProceso ? '✕ Ocultar Gestión' : '⚙ Gestionar Procesos'}
              </button>
            `
            : ''
        }
      </div>

      ${
        isStaff && isAssigningProceso
          ? `
            <div id="sitioProcesosManagementPanel" class="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <form id="assignSitioProcesoForm" class="flex flex-col sm:flex-row sm:items-end gap-3">
                <div class="flex-1 space-y-1">
                  <label for="assignSitioProcesoSelect" class="block text-xs font-bold text-slate-700">
                    Vincular Proceso del Certificado a esta Sede
                  </label>
                  ${
                    availableProcesos.length === 0
                      ? `<p class="text-xs text-slate-500 py-1.5">No hay procesos adicionales disponibles en ${escapeHtml(sitio.numero_certificado)} para vincular a este sitio.</p>`
                      : `
                        <select
                          id="assignSitioProcesoSelect"
                          name="id_proceso"
                          required
                          class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        >
                          ${availableProcesos
                            .map(
                              (proc) => `
                                <option value="${escapeHtml(proc.id)}">
                                  ${escapeHtml(proc.nombre_proceso)} · ${escapeHtml(proc.tipo)}
                                </option>
                              `
                            )
                            .join('')}
                        </select>
                      `
                  }
                </div>
                ${
                  availableProcesos.length > 0
                    ? `
                      <button
                        type="submit"
                        data-action="link-sitio-proceso"
                        class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors cursor-pointer shrink-0"
                      >
                        + Vincular Proceso
                      </button>
                    `
                    : ''
                }
              </form>

              ${
                procesos.length > 0
                  ? `
                    <form id="archiveSitioProcesoForm" class="pt-3 border-t border-slate-200 flex flex-col sm:flex-row sm:items-end gap-3">
                      <div class="flex-1 space-y-1">
                        <label for="archiveSitioProcesoSelect" class="block text-xs font-bold text-slate-700">
                          Archivar Vínculo de Proceso en Sede (Soft-Delete)
                        </label>
                        <select
                          id="archiveSitioProcesoSelect"
                          name="id_proceso_sitio"
                          required
                          class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                        >
                          ${procesos
                            .map(
                              (link) => `
                                <option value="${escapeHtml(link.id)}" data-proceso-id="${escapeHtml(link.id_proceso)}">
                                  ${escapeHtml(link.nombre_proceso)} · ${escapeHtml(link.tipo_proceso)}
                                </option>
                              `
                            )
                            .join('')}
                        </select>
                      </div>
                      <button
                        type="submit"
                        data-action="archive-sitio-proceso"
                        data-archive-table="procesos_por_sitio"
                        data-toast-target="archiveGovernanceToast"
                        class="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors cursor-pointer shrink-0"
                      >
                        Archivar Vínculo
                      </button>
                    </form>
                  `
                  : ''
              }
            </div>
          `
          : ''
      }

      ${renderListViewTable({
        tableId: 'sitio-tab-procesos',
        items: sortedProcesos,
        columns,
        sortState,
        columnWidths,
        getRowAttrs: (proc) =>
          `data-action="select-proceso-preview" data-proceso-id="${escapeHtml(proc.id_proceso)}" data-cert-id="${escapeHtml(sitio.id_certificado)}" title="Abrir detalle de ${escapeHtml(proc.nombre_proceso)}"`,
        emptyStateTitle: 'Sin procesos vinculados a este sitio',
        emptyStateMessage: isStaff
          ? 'El planificador de auditorías requiere procesos activos del sitio. Seleccione un proceso disponible del certificado y pulse "+ Vincular Proceso".'
          : 'El planificador de auditorías requiere procesos activos del sitio; esta sede aún no registra procesos vinculados.',
      })}
    </div>
  `;
}

function renderSitioAuditoriasTab(
  sitio: SitioDetailEntity,
  auditorias: ReadonlyArray<SitioAuditoriaLink>,
  sortState: SortState,
  columnWidths?: Record<string, number>
): string {
  const sorted = sortItems([...auditorias], sortState.column, sortState.direction, (aud, col) => {
    switch (col) {
      case 'codigo_auditoria':
        return aud.codigo_auditoria;
      case 'fecha_programacion':
        return aud.fecha_programacion;
      case 'tipo_auditoria':
        return aud.tipo_auditoria;
      case 'metodologia':
        return aud.metodologia;
      case 'estatus':
        return aud.estatus;
      default:
        return '';
    }
  });

  const columns: ColumnDefinition<SitioAuditoriaLink>[] = [
    {
      id: 'codigo_auditoria',
      header: 'Código Auditoría',
      sortable: true,
      defaultWidthPct: 22,
      minWidthPx: 130,
      renderCell: (aud) => `
        <span class="font-mono font-bold text-indigo-700 inline-flex items-center gap-1.5 max-w-full">
          <span aria-hidden="true" class="shrink-0">🗓️</span>
          <span class="truncate">${escapeHtml(aud.codigo_auditoria)}</span>
        </span>
      `,
    },
    {
      id: 'fecha_programacion',
      header: 'Fecha',
      sortable: true,
      defaultWidthPct: 16,
      minWidthPx: 100,
      renderCell: (aud) => `
        <span class="font-mono text-slate-700 tabular-nums">${escapeHtml(aud.fecha_programacion)}</span>
      `,
    },
    {
      id: 'tipo_auditoria',
      header: 'Tipo',
      sortable: true,
      defaultWidthPct: 20,
      minWidthPx: 120,
      renderCell: (aud) => `
        <span class="block font-semibold text-slate-800 truncate">${escapeHtml(aud.tipo_auditoria)}</span>
      `,
    },
    {
      id: 'metodologia',
      header: 'Metodología',
      sortable: true,
      defaultWidthPct: 24,
      minWidthPx: 130,
      renderCell: (aud) => `
        <span class="block text-slate-700 truncate">
          ${escapeHtml(aud.metodologia)}${aud.modalidad_evaluacion ? ` (${escapeHtml(aud.modalidad_evaluacion)})` : ''}
        </span>
      `,
    },
    {
      id: 'estatus',
      header: 'Estado',
      align: 'center',
      sortable: true,
      defaultWidthPct: 18,
      minWidthPx: 105,
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

  return `
    <div class="space-y-3">
      <div>
        <h3 class="text-sm font-bold text-slate-900">Auditorías en este Sitio</h3>
        <p class="text-xs text-slate-500">
          Jornadas de evaluación programadas o ejecutadas que incluyen a Sitio ${sitio.numero_sitio} (${escapeHtml(sitio.nombre_sitio)}).
        </p>
      </div>

      ${renderListViewTable({
        tableId: 'sitio-tab-auditorias',
        items: sorted,
        columns,
        sortState,
        columnWidths,
        getRowAttrs: (aud) =>
          `data-action="select-prog-audit" data-audit-id="${escapeHtml(aud.id)}" title="Abrir detalle de auditoría ${escapeHtml(aud.codigo_auditoria)}"`,
        emptyStateTitle: 'Sin auditorías registradas en este sitio',
        emptyStateMessage: `Sitio ${sitio.numero_sitio} (${sitio.nombre_sitio}) aún no tiene jornadas vinculadas en la programación de auditorías.`,
      })}
    </div>
  `;
}
