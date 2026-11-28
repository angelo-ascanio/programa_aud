import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/accessControl';
import { canArchiveRecord } from '../lib/archiveGovernance';
import {
  getPhase5FindingTypeMeta,
  type Phase5FindingEntity,
  type ProgramacionAuditEntity,
} from '../lib/auditExecution';
import { formatAuditCodename, getAuditCodenameTooltip } from '../lib/codenameDomain';
import type { RequisitoLtree } from '../lib/extraDomain';
import {
  getProcessTypeVisual,
  type CertificadoDetailEntity,
  type ProcesoTipo,
} from '../lib/multisiteSampling';
import {
  VALID_PROCESO_TIPOS,
  buildProcesoBatchPickerRows,
  canArchiveProceso,
  computeLinkedClauseSubtreeCounts,
  computeProcesoBatchSelectionSummary,
  createEmptyProcesoFormDraft,
  createProcesoFormDraftFromEntity,
  filterVisibleHierarchyRows,
  getAllSeededNormaRequirements,
  getDefaultExpandedClauseIds,
  getScopedNormaRequirements,
  resolveProcesoDetailById,
  resolveProcesoDetailMode,
  type ProcesoAuditoriaLink,
  type ProcesoBatchMode,
  type ProcesoBatchPickerRow,
  type ProcesoDetailEntity,
  type ProcesoFormDraft,
  type ProcesoHallazgoLink,
  type ProcesoRequisitoLink,
} from '../lib/procesoDomain';
import { sortItems, type ColumnDefinition, type SortState } from '../lib/universalTemplate';
import { renderListViewTable } from './universalTemplate';
import {
  renderDetailFormTopActions,
  renderDetailPageTemplate,
  type DetailParentChip,
} from './detailTemplate';

export type ProcesoChildTab = 'requisitos' | 'hallazgos' | 'auditorias';

export interface ProcesoSharedCertContext {
  isSharedFromAnother: boolean;
  certId: string;
  certNumero?: string;
  ownerCertId?: string;
  ownerCertLabel?: string | null;
  linkId?: string | null;
  isClientCrossOrgRestricted?: boolean;
  sharedTargetsCount?: number;
}

export interface ProcesoViewState {
  selectedProcesoId: string | null;
  activeChildTab: ProcesoChildTab;
  isCreating?: boolean;
  prefillCertId?: string | null;
  isEditingAttributes: boolean;
  formDraft?: ProcesoFormDraft;
  editFormData?: {
    id_certificado?: string;
    nombre_proceso?: string;
    tipo?: ProcesoTipo;
    responsable?: string;
    sharedContext?: ProcesoSharedCertContext;
  };
  editErrorMessage?: string | null;
  archiveConfirmOpen?: boolean;
  archiveErrorMessage?: string | null;
  isAssigningRequisito?: boolean;
  batchFilterQuery?: string;
  batchMode?: ProcesoBatchMode;
  selectedBatchRequisitoIds?: string[];
  expandedBatchClauseIds?: string[];
  searchExpandedBatchClauseIds?: string[];
  childSortState?: Partial<Record<ProcesoChildTab, SortState>>;
}

export interface ProcesoViewProps {
  profile: UserProfile;
  state: ProcesoViewState;
  proceso: ProcesoDetailEntity | null;
  activeCertId?: string | null;
  activeCertVersionId?: string | null;
  isHistoricalCertVersion?: boolean;
  certificates?: ReadonlyArray<CertificadoDetailEntity>;
  authorizedClientOrgIds?: ReadonlyArray<string>;
  shareLinkId?: string | null;
  programacionAudits?: ReadonlyArray<ProgramacionAuditEntity>;
  phase5Findings?: ReadonlyArray<Phase5FindingEntity>;
  requirementsCatalog?: ReadonlyArray<RequisitoLtree>;
  archivedNoAplicableIds?: ReadonlySet<string>;
  archivedProcesoIds?: ReadonlySet<string>;
  tableColumnWidths?: Record<string, Record<string, number>>;
}

const DEFAULT_PROCESO_CHILD_SORT: SortState = { column: null, direction: 'none' };

export function renderProcesoView(props: ProcesoViewProps): string {
  const {
    profile,
    state,
    proceso: incomingProceso,
    activeCertId,
    isHistoricalCertVersion = false,
    certificates = [],
    authorizedClientOrgIds,
    shareLinkId,
    programacionAudits = [],
    phase5Findings = [],
    requirementsCatalog = getAllSeededNormaRequirements(),
    archivedNoAplicableIds,
    archivedProcesoIds,
    tableColumnWidths,
  } = props;

  const isHistoricalLock = Boolean(isHistoricalCertVersion);
  const isStaff = isApprovedStaffProfile(profile) && !isHistoricalLock;
  const prelimMode = resolveProcesoDetailMode(state, isStaff, incomingProceso);
  const contextCertId = (
    activeCertId ||
    state.prefillCertId ||
    state.editFormData?.sharedContext?.certId ||
    incomingProceso?.id_certificado ||
    ''
  ).trim();

  const resolvedScopedProceso =
    prelimMode !== 'add' &&
    incomingProceso &&
    contextCertId &&
    certificates.length > 0 &&
    incomingProceso.id_certificado !== contextCertId
      ? resolveProcesoDetailById({
          procesoId: incomingProceso.id,
          activeCertId: contextCertId,
          activeCertVersionId: props.activeCertVersionId,
          certificates,
          programacionAudits,
          phase5Findings,
          requirementsCatalog,
          archivedProcesoIds,
        }) || incomingProceso
      : incomingProceso;

  const scopedNormaReqIds =
    resolvedScopedProceso
      ? new Set(
          getScopedNormaRequirements({
            id_norma: resolvedScopedProceso.id_norma,
            norma_codigo: resolvedScopedProceso.norma_codigo,
            requirementsCatalog,
          }).map((r) => r.id)
        )
      : null;

  const catalogReqById = new Map<string, RequisitoLtree>(
    requirementsCatalog.map((r) => [r.id, r])
  );
  const filteredRequisitos = resolvedScopedProceso
    ? resolvedScopedProceso.requisitos.filter((link) => {
        if (scopedNormaReqIds && scopedNormaReqIds.has(link.id_requisito)) {
          return true;
        }
        const catalogEntry = catalogReqById.get(link.id_requisito);
        if (catalogEntry) {
          if (resolvedScopedProceso.id_norma && catalogEntry.id_norma) {
            return catalogEntry.id_norma === resolvedScopedProceso.id_norma;
          }
          return (
            catalogEntry.norma_codigo.trim().toLowerCase() ===
            resolvedScopedProceso.norma_codigo.trim().toLowerCase()
          );
        }
        if (link.norma_codigo && resolvedScopedProceso.norma_codigo) {
          return (
            link.norma_codigo.trim().toLowerCase() ===
            resolvedScopedProceso.norma_codigo.trim().toLowerCase()
          );
        }
        return true;
      })
    : [];

  const proceso: ProcesoDetailEntity | null = resolvedScopedProceso
    ? {
        ...resolvedScopedProceso,
        requisitos: filteredRequisitos,
      }
    : null;

  const mode = resolveProcesoDetailMode(state, isStaff, proceso);
  const isCreateMode = mode === 'add';
  const activeTab: ProcesoChildTab =
    state.activeChildTab === 'hallazgos' || state.activeChildTab === 'auditorias'
      ? state.activeChildTab
      : 'requisitos';

  const contextCert =
    !isCreateMode && contextCertId && certificates.length > 0
      ? certificates.find((c) => c.id === contextCertId)
      : undefined;
  const contextProceso =
    contextCert && proceso
      ? (contextCert.procesos || []).find((p) => p.id === proceso.id)
      : undefined;
  const anyMatchingProceso =
    !contextProceso && proceso && certificates.length > 0
      ? certificates.flatMap((c) => c.procesos || []).find((p) => p.id === proceso.id)
      : undefined;
  const processShareMeta = contextProceso ?? anyMatchingProceso;
  const fallbackContext = !isCreateMode ? state.editFormData?.sharedContext : undefined;

  const ownerCertId = (
    processShareMeta?.ownerCertId ||
    processShareMeta?.sharedFromCertId ||
    fallbackContext?.ownerCertId ||
    ''
  ).trim();
  const ownerCert =
    ownerCertId && certificates.length > 0
      ? certificates.find((c) => c.id === ownerCertId)
      : undefined;

  const isReceivingSharedContext = Boolean(
    !isCreateMode &&
      proceso &&
      (contextProceso
        ? Boolean(contextProceso.sharedFromCertId) ||
          Boolean(ownerCertId && contextCertId && ownerCertId !== contextCertId)
        : Boolean(ownerCertId && contextCertId && ownerCertId !== contextCertId) ||
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
    processShareMeta?.sharedTargets?.length ??
    fallbackContext?.sharedTargetsCount ??
    0;

  interface ProcesoPeerSharingSummary {
    sameNormSyncedPeers: Array<{ certId: string; numero_certificado: string; norma_codigo: string }>;
    sameNormUnsyncedPeers: Array<{ certId: string; numero_certificado: string; norma_codigo: string }>;
    diffNormPeers: Array<{ certId: string; numero_certificado: string; norma_codigo: string }>;
  }

  const computeProcesoPeerSharingSummary = (): ProcesoPeerSharingSummary => {
    const summary: ProcesoPeerSharingSummary = {
      sameNormSyncedPeers: [],
      sameNormUnsyncedPeers: [],
      diffNormPeers: [],
    };
    if (isCreateMode || !proceso || certificates.length === 0 || isClientCrossOrgRestricted) {
      return summary;
    }

    const activeCertIdTrimmed = proceso.id_certificado.trim();
    const activeNormaId = (proceso.id_norma || '').trim();
    const activeNormaCodigo = (proceso.norma_codigo || '').trim().toLowerCase();

    const ownerProcEntity = ownerCert
      ? (ownerCert.procesos || []).find(
          (p) => p.id === proceso.id && !archivedProcesoIds?.has(p.id)
        )
      : processShareMeta;

    const isActiveLinkSynced = (() => {
      if (!isReceivingSharedContext) return true;
      if (contextProceso?.sharedLinkSincronizarRequisitos !== undefined) {
        return Boolean(contextProceso.sharedLinkSincronizarRequisitos);
      }
      if (
        contextProceso?.requisitos_by_certificado?.[activeCertIdTrimmed]?.sincronizar_requisitos !==
        undefined
      ) {
        return Boolean(
          contextProceso.requisitos_by_certificado[activeCertIdTrimmed].sincronizar_requisitos
        );
      }
      const ref = (ownerProcEntity?.sharedTargets || []).find(
        (st) => st.targetCertId.trim() === activeCertIdTrimmed
      );
      return Boolean(ref?.sincronizar_requisitos);
    })();

    const seenPeerIds = new Set<string>([activeCertIdTrimmed]);
    const ownerSharedTargetMap = new Map(
      (ownerProcEntity?.sharedTargets || processShareMeta?.sharedTargets || []).map((st) => [
        st.targetCertId.trim(),
        st,
      ])
    );

    for (const candidateCert of certificates) {
      if (candidateCert.deleted_at) continue;
      const candId = candidateCert.id.trim();
      if (!candId || seenPeerIds.has(candId)) continue;
      if (isClientUser && !authorizedOrgSet?.has((candidateCert.id_organizacion || '').trim())) {
        continue;
      }

      const candProc = (candidateCert.procesos || []).find(
        (p) => p.id === proceso.id && !archivedProcesoIds?.has(p.id)
      );
      const isLinkedViaTargets = ownerSharedTargetMap.has(candId);
      const isOwnerPeer = Boolean(ownerCertId && candId === ownerCertId);
      if (!candProc && !isLinkedViaTargets && !isOwnerPeer) continue;

      seenPeerIds.add(candId);

      const candNormaId = (candidateCert.id_norma || '').trim();
      const candNormaCodigo = (candidateCert.norma_codigo || '').trim().toLowerCase();
      const isSameNorm =
        activeNormaId && candNormaId
          ? activeNormaId === candNormaId
          : Boolean(activeNormaCodigo && candNormaCodigo && activeNormaCodigo === candNormaCodigo);

      if (!isSameNorm) {
        summary.diffNormPeers.push({
          certId: candId,
          numero_certificado: candidateCert.numero_certificado,
          norma_codigo: candidateCert.norma_codigo,
        });
        continue;
      }

      const candSynced = (() => {
        if (!isActiveLinkSynced) return false;
        if (isOwnerPeer) return true;
        if (candProc?.sharedLinkSincronizarRequisitos !== undefined) {
          return Boolean(candProc.sharedLinkSincronizarRequisitos);
        }
        if (candProc?.requisitos_by_certificado?.[candId]?.sincronizar_requisitos !== undefined) {
          return Boolean(candProc.requisitos_by_certificado[candId].sincronizar_requisitos);
        }
        return Boolean(ownerSharedTargetMap.get(candId)?.sincronizar_requisitos);
      })();

      if (candSynced) {
        summary.sameNormSyncedPeers.push({
          certId: candId,
          numero_certificado: candidateCert.numero_certificado,
          norma_codigo: candidateCert.norma_codigo,
        });
      } else {
        summary.sameNormUnsyncedPeers.push({
          certId: candId,
          numero_certificado: candidateCert.numero_certificado,
          norma_codigo: candidateCert.norma_codigo,
        });
      }
    }

    return summary;
  };

  const peerSharingSummary = computeProcesoPeerSharingSummary();

  const draft: ProcesoFormDraft =
    mode === 'add'
      ? state.formDraft ?? createEmptyProcesoFormDraft(state.prefillCertId)
      : mode === 'edit'
      ? state.formDraft ??
        (state.editFormData && proceso
          ? {
              id_certificado: state.editFormData.id_certificado ?? proceso.id_certificado,
              nombre_proceso: state.editFormData.nombre_proceso ?? proceso.nombre_proceso,
              tipo: state.editFormData.tipo ?? proceso.tipo,
              responsable: state.editFormData.responsable ?? (proceso.responsable || ''),
            }
          : proceso
          ? createProcesoFormDraftFromEntity(proceso)
          : createEmptyProcesoFormDraft(state.prefillCertId))
      : proceso
      ? createProcesoFormDraftFromEntity(proceso)
      : createEmptyProcesoFormDraft(state.prefillCertId);

  const selectedCert =
    certificates.find((c) => c.id === draft.id_certificado) ||
    (proceso ? certificates.find((c) => c.id === proceso.id_certificado) : undefined) ||
    null;

  const visual = getProcessTypeVisual(isCreateMode ? draft.tipo : proceso?.tipo || draft.tipo);
  const archiveGuard = proceso
    ? canArchiveProceso({
        associatedHallazgosCount: proceso.hallazgos.length,
        associatedAuditoriasCount: proceso.auditorias.length,
        sharedCertsCount: isReceivingSharedContext ? 0 : sharedOutCount,
      })
    : { allowed: true };

  const parents: DetailParentChip[] =
    mode === 'read' && proceso
      ? [
          {
            label: 'Organización',
            value: `${proceso.organizacion_nombre} (${proceso.organizacion_rif})`,
            symbol: '🏢',
            navAction: {
              nav: 'certificacion',
              subview: 'organizations',
              entityType: 'org',
              entityId: proceso.id_organizacion,
            },
          },
          {
            label: 'Certificado',
            value: `${proceso.numero_certificado} · ${proceso.norma_codigo}`,
            symbol: '📜',
            navAction: {
              nav: 'certificacion',
              subview: 'certificates',
              entityType: 'cert',
              entityId: proceso.id_certificado,
              targetTab: 'procesos',
            },
          },
          {
            label: 'Norma',
            value: proceso.norma_codigo,
            symbol: '📘',
            navAction: {
              nav: 'extra',
              subview: 'standards',
              entityType: 'norma',
              entityId: proceso.id_norma,
            },
          },
        ]
      : [];

  let parentMetaHtml = '';
  if (mode === 'read' && proceso) {
    if (isReceivingSharedContext) {
      if (isClientCrossOrgRestricted) {
        parentMetaHtml = `
          <div class="flex flex-wrap items-center gap-2 pt-1">
            <span class="inline-flex items-center px-2.5 py-1 rounded-lg border border-indigo-200 bg-indigo-50 text-xs font-semibold text-indigo-800">
              Proceso compartido dentro del conglomerado
            </span>
          </div>
        `;
      } else {
        const rawOriginLabel =
          ownerCert?.numero_certificado ||
          processShareMeta?.sharedFromCertLabel ||
          fallbackContext?.ownerCertLabel ||
          '';
        const originCertNum = rawOriginLabel
          ? rawOriginLabel.split(' · ')[0].trim()
          : 'certificado origen';
        const resolvedShareLinkId =
          shareLinkId ||
          processShareMeta?.sharedTargets?.find((st) => st.targetCertId === contextCertId)
            ?.linkId ||
          fallbackContext?.linkId ||
          '';
        const unlinkBtnHtml =
          isStaff && contextCertId && contextCertId !== ownerCertId
            ? `
              <button
                type="button"
                data-action="unlink-shared-child"
                data-share-table="proceso_certificado_compartido"
                data-share-link-id="${escapeHtml(resolvedShareLinkId)}"
                data-cert-id="${escapeHtml(contextCertId)}"
                data-entity-id="${escapeHtml(proceso.id)}"
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
      ? renderProcesoParentSelector({
          draft,
          proceso,
          certificates,
          selectedCert,
        })
      : undefined;

  const customTopActionsHtml = isStaff
    ? renderDetailFormTopActions({
        mode,
        isStaff: true,
        formId: 'procesoDetailForm',
        saveBtnId: 'saveProcesoFormBtn',
        cancelBtnId: 'cancelEditProcesoBtn',
        editBtnId: 'startEditProcesoBtn',
        saveTitle: isCreateMode ? 'Crear proceso' : 'Guardar cambios',
        cancelTitle: isCreateMode ? 'Cancelar creación' : 'Cancelar edición',
        editTitle: 'Editar',
        showHistoryBtn: !isCreateMode,
        showArchiveBtn: !isCreateMode && canArchiveRecord(profile),
        archiveBtnDataAction: 'open-archive-proceso',
        extraAuditAttrs: proceso
          ? `data-table-name="proceso" data-record-id="${escapeHtml(proceso.id)}" data-entity-name="${escapeHtml(proceso.nombre_proceso)}"`
          : '',
        extraArchiveAttrs: proceso ? `data-proceso-id="${escapeHtml(proceso.id)}"` : '',
      })
    : '';

  const historicalBannerHtml =
    isHistoricalLock && !isCreateMode && proceso
      ? `
        <div role="status" class="p-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium rounded-lg flex items-center gap-2">
          <span aria-hidden="true">🔒</span>
          <span><strong>Versión histórica en solo lectura:</strong> este proceso pertenece a una versión anterior del certificado y no admite cambios.</span>
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
      isStaff && !isCreateMode && proceso && state.archiveConfirmOpen
        ? archiveGuard.allowed
          ? `
            <div class="p-4 bg-rose-50/80 border border-rose-200 rounded-xl space-y-3">
              <div class="space-y-0.5">
                <h4 class="text-xs font-bold text-rose-900">Confirmar archivo lógico de proceso</h4>
                <p class="text-[11px] text-rose-800">
                  El proceso <strong>${escapeHtml(proceso.nombre_proceso)}</strong> pasará a estado archivado (soft-delete) preservando la trazabilidad en Historial de Cambios.
                </p>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
                <div class="sm:col-span-2">
                  <label for="archiveProcesoReasonInput" class="sr-only">Motivo de archivo</label>
                  <input
                    id="archiveProcesoReasonInput"
                    type="text"
                    placeholder="Motivo de archivo (opcional, ej. Reorganización de mapa de procesos)"
                    class="w-full text-xs rounded-lg border border-rose-300 bg-white px-2.5 py-1.5"
                  />
                </div>
                <div class="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    id="cancelArchiveProcesoBtn"
                    class="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    id="confirmArchiveProcesoBtn"
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
                <strong class="font-bold">Archivo bloqueado:</strong> ${escapeHtml(archiveGuard.reason || 'Existen dependencias activas asociadas a este proceso.')}
              </div>
              <button
                type="button"
                id="cancelArchiveProcesoBtn"
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
      ? renderProcesoFormBody(draft)
      : proceso
      ? renderReadOnlyProcesoBody(proceso, visual.badgeClass, visual.icon)
      : '';

  const title = isCreateMode
    ? 'Nuevo Proceso del Sistema'
    : proceso?.nombre_proceso || 'Proceso del Sistema';

  const eyebrowCode = isCreateMode
    ? selectedCert
      ? `${selectedCert.numero_certificado} · ${selectedCert.norma_codigo}`
      : 'MAPA DE PROCESOS'
    : proceso
    ? `${proceso.numero_certificado} · ${proceso.norma_codigo}`
    : '';

  const subtitle = isCreateMode
    ? selectedCert
      ? `${selectedCert.organizacion_nombre} (${selectedCert.organizacion_rif}) · Clasificación bajo norma ${selectedCert.norma_codigo}`
      : 'Registro de proceso estratégico, medular o de apoyo dentro del alcance certificado'
    : proceso
    ? `${proceso.organizacion_nombre} (${proceso.organizacion_rif})${
        proceso.responsable ? ` · Responsable: ${proceso.responsable}` : ''
      }`
    : '';

  const secondaryHeaderBadge =
    !isCreateMode && proceso
      ? {
          label: `${proceso.requisitos.length} cláusula${proceso.requisitos.length === 1 ? '' : 's'} mapeada${proceso.requisitos.length === 1 ? '' : 's'}`,
          badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
        }
      : undefined;

  return renderDetailPageTemplate({
    entityType: 'Proceso del Sistema',
    entitySymbol: visual.icon,
    title,
    eyebrowCode,
    subtitle,
    statusBadge: {
      label: visual.label,
      badgeClass: visual.badgeClass,
      symbol: visual.icon,
    },
    secondaryHeaderBadge,
    backButton: {
      label:
        !isCreateMode && proceso
          ? `Volver a ${proceso.numero_certificado}`
          : selectedCert
          ? `Volver a ${selectedCert.numero_certificado}`
          : 'Volver',
      nav: 'certificacion',
      subview: 'certificates',
      action: 'back-to-cert-from-proceso',
    },
    isCreateMode,
    customTopActionsHtml,
    parents,
    parentMetaHtml,
    customParentZoneHtml,
    tableName: 'proceso',
    recordId: proceso?.id || 'new',
    feedbackHtml,
    attributes: [],
    customRecordBodyHtml,
    childTabs:
      !isCreateMode && proceso
        ? [
            {
              id: 'requisitos',
              label: 'Requisitos Normativos Vinculados',
              symbol: '📐',
              count: proceso.requisitos.length,
            },
            {
              id: 'hallazgos',
              label: 'Hallazgos Asociados',
              symbol: '📌',
              count: proceso.hallazgos.length,
            },
            {
              id: 'auditorias',
              label: 'Auditorías Programadas',
              symbol: '🗓️',
              count: proceso.auditorias.length,
            },
          ]
        : [],
    activeChildTabId: activeTab,
    childTabAttrName: 'data-proceso-tab',
    renderChildTabContent:
      !isCreateMode && proceso
        ? (tabId) => {
            if (tabId === 'hallazgos') {
              return renderProcesoHallazgosTab(
                proceso,
                proceso.hallazgos,
                state.childSortState?.hallazgos || DEFAULT_PROCESO_CHILD_SORT,
                tableColumnWidths?.['proceso-tab-hallazgos'],
                programacionAudits
              );
            }
            if (tabId === 'auditorias') {
              return renderProcesoAuditoriasTab(
                proceso,
                proceso.auditorias,
                state.childSortState?.auditorias || DEFAULT_PROCESO_CHILD_SORT,
                tableColumnWidths?.['proceso-tab-auditorias']
              );
            }
            return renderProcesoRequisitosTab({
              proceso,
              requisitos: proceso.requisitos,
              parentCert:
                certificates.find((c) => c.id === proceso.id_certificado) || undefined,
              peerSharingSummary,
              requirementsCatalog,
              archivedNoAplicableIds,
              archivedProcesoIds,
              isStaff,
              isAssigningRequisito: Boolean(state.isAssigningRequisito),
              batchMode: state.batchMode || 'mandatory',
              batchFilterQuery: state.batchFilterQuery || '',
              selectedBatchRequisitoIds: state.selectedBatchRequisitoIds || [],
              expandedBatchClauseIds:
                (state.batchFilterQuery || '').trim().length > 0
                  ? state.searchExpandedBatchClauseIds
                  : state.expandedBatchClauseIds,
              sortState: state.childSortState?.requisitos || DEFAULT_PROCESO_CHILD_SORT,
              columnWidths: tableColumnWidths?.['proceso-tab-requisitos'],
            });
          }
        : undefined,
  });
}

function renderProcesoParentSelector(params: {
  draft: ProcesoFormDraft;
  proceso: ProcesoDetailEntity | null;
  certificates: ReadonlyArray<CertificadoDetailEntity>;
  selectedCert: CertificadoDetailEntity | null;
}): string {
  const { draft, proceso, certificates, selectedCert } = params;

  const certOptions =
    certificates.length > 0
      ? certificates
      : proceso
      ? [
          {
            id: proceso.id_certificado,
            numero_certificado: proceso.numero_certificado,
            norma_codigo: proceso.norma_codigo,
            organizacion_nombre: proceso.organizacion_nombre,
          },
        ]
      : [];

  return `
    <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
      <label for="procesoSelectCertificado" class="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
        Certificado y Norma Evaluada <span class="text-rose-600" aria-hidden="true">*</span>
      </label>
      <select
        id="procesoSelectCertificado"
        name="id_certificado"
        form="procesoDetailForm"
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
          selectedCert
            ? `Norma del certificado: ${escapeHtml(selectedCert.norma_codigo)}. Las cláusulas vinculables se filtran estrictamente a esta norma.`
            : 'Seleccione el certificado padre para habilitar la cobertura normativa correspondiente.'
        }
      </p>
    </div>
  `;
}

function renderReadOnlyProcesoBody(
  proceso: ProcesoDetailEntity,
  badgeClass: string,
  icon: string
): string {
  return `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <div class="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-1">
        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Nombre del Proceso</div>
        <div class="text-xs font-bold text-slate-900">${escapeHtml(proceso.nombre_proceso)}</div>
        <div class="text-[11px] text-slate-500">Responsable: ${escapeHtml(proceso.responsable || 'Por designar')}</div>
      </div>

      <div class="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-1">
        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Clasificación</div>
        <div>
          <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${badgeClass}">
            <span aria-hidden="true">${icon}</span>
            <span>${escapeHtml(proceso.tipo)}</span>
          </span>
        </div>
      </div>

      <div class="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-1">
        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cobertura LTREE</div>
        <div class="text-xs font-mono font-bold text-indigo-800">
          ${proceso.requisitos.length} cláusula(s) ISO
        </div>
        <div class="text-[11px] text-slate-500">${escapeHtml(proceso.norma_codigo)}</div>
      </div>

      <div class="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-1">
        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Certificado Vinculado</div>
        <div class="text-xs font-mono font-bold text-slate-900">${escapeHtml(proceso.numero_certificado)}</div>
        <div class="text-[11px] text-slate-500">Estatus ${escapeHtml(proceso.certificado_estatus)}</div>
      </div>
    </div>
  `;
}

function renderProcesoFormBody(draft: ProcesoFormDraft): string {
  return `
    <form id="procesoDetailForm" class="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="sm:col-span-2 space-y-1">
          <label for="procesoNombreInput" class="block text-xs font-bold text-slate-700">
            Nombre del Proceso <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <input
            id="procesoNombreInput"
            name="nombre_proceso"
            type="text"
            maxlength="150"
            required
            placeholder="Ej. Gestión Comercial y Ventas / Manufactura"
            value="${escapeHtml(draft.nombre_proceso)}"
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
          <p class="text-[10px] text-slate-500">Máximo 150 caracteres; único dentro del certificado.</p>
        </div>

        <div class="space-y-1">
          <label for="procesoTipoSelect" class="block text-xs font-bold text-slate-700">
            Clasificación <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <select
            id="procesoTipoSelect"
            name="tipo"
            required
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            ${VALID_PROCESO_TIPOS.map(
              (t) => `<option value="${escapeHtml(t)}" ${draft.tipo === t ? 'selected' : ''}>${escapeHtml(t)}</option>`
            ).join('')}
          </select>
        </div>

        <div class="sm:col-span-3 space-y-1">
          <label for="procesoResponsableInput" class="block text-xs font-bold text-slate-700">Responsable del Proceso</label>
          <input
            id="procesoResponsableInput"
            name="responsable"
            type="text"
            placeholder="Ej. Ing. Roberto Silva (Jefe de Planta)"
            value="${escapeHtml(draft.responsable || '')}"
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
      </div>
    </form>
  `;
}

const BATCH_TREE_INDENT_CLASSES: readonly string[] = [
  'pl-2.5',
  'pl-2.5',
  'pl-6',
  'pl-10',
  'pl-14',
  'pl-16',
  'pl-20',
];

function getBatchRowIndentClass(level: number): string {
  const clamped = Math.max(1, Math.min(level, BATCH_TREE_INDENT_CLASSES.length - 1));
  return BATCH_TREE_INDENT_CLASSES[clamped] || 'pl-2.5';
}

export function renderProcesoBatchRowsSubsetHtml(params: {
  rows: ReadonlyArray<ProcesoBatchPickerRow>;
  selectedIdSet: ReadonlySet<string>;
  expandedSet: ReadonlySet<string>;
  isSearching: boolean;
}): string {
  const { rows, selectedIdSet, expandedSet, isSearching } = params;

  return rows
    .map((row) => {
      const indentClass = getBatchRowIndentClass(
        isSearching ? (row.ancestorIds?.length || 0) + 1 : row.indentLevel
      );
      const isChecked = !row.disabled && selectedIdSet.has(row.req.id);
      const isCollapsible = row.hasChildren;
      const isExpanded = isCollapsible && expandedSet.has(row.req.id);

      const statusBadges: string[] = [];
      if (row.isExcludedByIso43) {
        const blockVia = row.blockingExclusionCodigo
          ? ` (vía Cláusula ${row.blockingExclusionCodigo})`
          : '';
        statusBadges.push(
          `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-rose-50 text-rose-800 border-rose-200">⛔ Excluida ISO 4.3${escapeHtml(blockVia)}</span>`
        );
      } else if (row.alreadyLinkedToCurrentProceso) {
        statusBadges.push(
          `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-emerald-50 text-emerald-700 border-emerald-200">✓ Ya vinculada a este proceso</span>`
        );
      } else {
        if (row.coveredByOtherProcesoNames.length > 0) {
          statusBadges.push(
            `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-indigo-50 text-indigo-800 border-indigo-200">🔗 Cubierta en: ${escapeHtml(row.coveredByOtherProcesoNames.join(', '))}</span>`
          );
        }
        if (row.isPendingMandatory) {
          statusBadges.push(
            `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-amber-50 text-amber-800 border-amber-200">⚠️ Pendiente obligatoria</span>`
          );
        } else if (!row.isMandatory) {
          statusBadges.push(
            `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-slate-100 text-slate-600 border-slate-200">ℹ️ Informativa</span>`
          );
        }
      }

      const subtreeHintHtml =
        (row.req.es_padre || row.mandatorySubtreeCount > 0) && row.mandatorySubtreeCount > 0
          ? `<span class="text-[11px] font-semibold text-indigo-700 shrink-0 whitespace-nowrap">(+${row.mandatorySubtreeCount} subcláusula${row.mandatorySubtreeCount === 1 ? '' : 's'} obligatoria${row.mandatorySubtreeCount === 1 ? '' : 's'})</span>`
          : '';

      const toggleControlHtml = isCollapsible
        ? `
          <button
            type="button"
            data-action="toggle-proceso-batch-node"
            data-node-id="${escapeHtml(row.req.id)}"
            aria-expanded="${isExpanded}"
            title="${isExpanded ? 'Contraer subcláusulas' : 'Desplegar subcláusulas'}"
            class="w-5 h-5 inline-flex items-center justify-center rounded hover:bg-slate-200/80 text-slate-600 transition-colors cursor-pointer shrink-0"
          >
            <svg class="w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        `
        : `<span class="w-5 shrink-0" aria-hidden="true"></span>`;

      const leadText = row.hasTitle
        ? `${row.req.codigo} ${row.titleText}:`
        : row.req.codigo;
      const tooltipText = row.rawText ? `${leadText} ${row.rawText}` : leadText;
      const primaryColorClass = row.disabled ? 'text-slate-500' : 'text-slate-900';
      const primaryLeadHtml = row.hasTitle
        ? `<span class="font-bold ${primaryColorClass}"><span class="font-mono">${escapeHtml(row.req.codigo)}</span> ${escapeHtml(row.titleText)}:</span>`
        : `<span class="font-mono font-bold ${primaryColorClass}">${escapeHtml(row.req.codigo)}</span>`;
      const rawTextHtml = row.rawText
        ? ` <span class="font-normal ${row.disabled ? 'text-slate-400' : 'text-slate-500'}">${escapeHtml(row.rawText)}</span>`
        : '';

      return `
        <div
          data-batch-clause-row="true"
          data-requisito-id="${escapeHtml(row.req.id)}"
          data-codigo="${escapeHtml(row.req.codigo)}"
          data-ancestor-ids="${escapeHtml((row.ancestorIds || []).join(','))}"
          class="flex items-center justify-between gap-2 py-2 pr-3 ${indentClass} ${
            row.disabled
              ? 'bg-slate-50/70 text-slate-400 opacity-85'
              : isChecked
              ? 'bg-indigo-50/60 hover:bg-indigo-50'
              : 'hover:bg-slate-50'
          } transition-colors"
        >
          <div class="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
            ${toggleControlHtml}
            <label class="flex items-center gap-2 min-w-0 flex-1 overflow-hidden ${row.disabled ? 'cursor-not-allowed' : 'cursor-pointer'}">
              <input
                type="checkbox"
                name="batch_requisito_id"
                value="${escapeHtml(row.req.id)}"
                ${isChecked ? 'checked' : ''}
                ${row.disabled ? 'disabled' : ''}
                class="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0 ${
                  row.disabled ? 'cursor-not-allowed' : 'cursor-pointer'
                }"
              />
              <span class="block min-w-0 flex-1 truncate text-xs" title="${escapeHtml(tooltipText)}">
                ${primaryLeadHtml}${rawTextHtml}
              </span>
              ${subtreeHintHtml}
            </label>
          </div>
          ${
            statusBadges.length > 0
              ? `<span class="flex flex-wrap items-center gap-1.5 shrink-0">${statusBadges.join('')}</span>`
              : ''
          }
        </div>
      `;
    })
    .join('');
}

export function renderProcesoBatchChecklistRowsHtml(params: {
  rows: ReadonlyArray<ProcesoBatchPickerRow>;
  selectedIdSet: ReadonlySet<string>;
  expandedBatchClauseIds?: ReadonlySet<string> | ReadonlyArray<string>;
  filterQuery?: string;
}): string {
  const { rows, selectedIdSet, expandedBatchClauseIds } = params;
  const effectiveExpandedSet =
    expandedBatchClauseIds === undefined
      ? new Set(getDefaultExpandedClauseIds(rows))
      : expandedBatchClauseIds instanceof Set
      ? expandedBatchClauseIds
      : new Set(expandedBatchClauseIds);
  const visibleRows = filterVisibleHierarchyRows(rows, expandedBatchClauseIds);

  if (visibleRows.length === 0) {
    return `
      <div class="p-6 text-center text-xs text-slate-500">
        No se encontraron cláusulas que coincidan con el filtro seleccionado.
      </div>
    `;
  }

  const isSearching = Boolean(params.filterQuery && params.filterQuery.trim().length > 0);
  return renderProcesoBatchRowsSubsetHtml({
    rows: visibleRows,
    selectedIdSet,
    expandedSet: effectiveExpandedSet,
    isSearching,
  });
}

export function renderProcesoBatchSummaryText(summary: {
  selectedCount: number;
  totalMandatoryCovered: number;
}): string {
  const { selectedCount, totalMandatoryCovered } = summary;
  return `${selectedCount} cláusula${selectedCount === 1 ? '' : 's'} seleccionada${selectedCount === 1 ? '' : 's'} (cubre ${totalMandatoryCovered} obligatoria${totalMandatoryCovered === 1 ? '' : 's'} en total)`;
}

function renderProcesoRequisitosTab(params: {
  proceso: ProcesoDetailEntity;
  requisitos: ReadonlyArray<ProcesoRequisitoLink>;
  parentCert?: CertificadoDetailEntity;
  peerSharingSummary: {
    sameNormSyncedPeers: ReadonlyArray<{ certId: string; numero_certificado: string; norma_codigo: string }>;
    sameNormUnsyncedPeers: ReadonlyArray<{ certId: string; numero_certificado: string; norma_codigo: string }>;
    diffNormPeers: ReadonlyArray<{ certId: string; numero_certificado: string; norma_codigo: string }>;
  };
  requirementsCatalog: ReadonlyArray<RequisitoLtree>;
  archivedNoAplicableIds?: ReadonlySet<string>;
  archivedProcesoIds?: ReadonlySet<string>;
  isStaff: boolean;
  isAssigningRequisito: boolean;
  batchMode: ProcesoBatchMode;
  batchFilterQuery: string;
  selectedBatchRequisitoIds: ReadonlyArray<string>;
  expandedBatchClauseIds?: ReadonlyArray<string>;
  sortState: SortState;
  columnWidths?: Record<string, number>;
}): string {
  const {
    proceso,
    requisitos,
    parentCert,
    peerSharingSummary,
    requirementsCatalog,
    archivedNoAplicableIds,
    archivedProcesoIds,
    isStaff,
    isAssigningRequisito,
    batchMode,
    batchFilterQuery,
    selectedBatchRequisitoIds,
    expandedBatchClauseIds,
    sortState,
    columnWidths,
  } = params;

  const pickerData = buildProcesoBatchPickerRows({
    cert: parentCert,
    currentProceso: proceso,
    idNorma: proceso.id_norma,
    normaCodigo: proceso.norma_codigo,
    requirementsCatalog,
    mode: batchMode,
    filterQuery: batchFilterQuery,
    archivedNoAplicableIds,
    archivedProcesoIds,
  });

  const selectedIdSet = new Set(selectedBatchRequisitoIds);
  const summary = computeProcesoBatchSelectionSummary({
    selectedReqIds: selectedBatchRequisitoIds,
    scopedReqs: pickerData.scopedReqs,
    coverageReport: pickerData.coverageReport,
  });

  const linkedSubtreeCounts = computeLinkedClauseSubtreeCounts({
    linkedRequisitos: requisitos,
    scopedReqs: pickerData.scopedReqs,
    coverageReport: pickerData.coverageReport,
  });

  const sortedRequisitos = sortItems([...requisitos], sortState.column, sortState.direction, (req, col) => {
    switch (col) {
      case 'codigo':
        return req.codigo;
      case 'titulo':
        return req.titulo;
      case 'ruta_materializada':
        return req.ruta_materializada;
      case 'norma_codigo':
        return req.norma_codigo;
      default:
        return '';
    }
  });

  const columns: ColumnDefinition<ProcesoRequisitoLink>[] = [
    {
      id: 'codigo',
      header: 'Cláusula',
      sortable: true,
      defaultWidthPct: 16,
      minWidthPx: 105,
      renderCell: (req) => `
        <span class="font-mono font-bold text-sky-800 whitespace-nowrap">
          Cláusula ${escapeHtml(req.codigo)}
        </span>
      `,
    },
    {
      id: 'titulo',
      header: 'Título del Requisito',
      sortable: true,
      defaultWidthPct: 44,
      minWidthPx: 200,
      renderCell: (req) => {
        const subtreeCount = linkedSubtreeCounts.get(req.id_requisito) || 0;
        return `
          <div class="min-w-0" title="${escapeHtml(req.titulo)}">
            <div class="flex items-center gap-2 min-w-0">
              <span class="font-semibold text-slate-900 truncate">${escapeHtml(req.titulo)}</span>
              ${
                subtreeCount > 0
                  ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-indigo-50 text-indigo-800 border-indigo-200 shrink-0 whitespace-nowrap">${escapeHtml(req.codigo)} (cubre ${subtreeCount} subcláusula${subtreeCount === 1 ? '' : 's'})</span>`
                  : ''
              }
            </div>
            ${
              req.descripcion
                ? `<div class="text-[11px] font-normal text-slate-500 truncate pt-0.5">${escapeHtml(req.descripcion)}</div>`
                : ''
            }
          </div>
        `;
      },
    },
    {
      id: 'ruta_materializada',
      header: 'Ruta LTREE',
      sortable: true,
      defaultWidthPct: 22,
      minWidthPx: 130,
      renderCell: (req) => `
        <span class="inline-flex px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200 font-mono text-[11px] font-bold">
          ${escapeHtml(req.ruta_materializada)}
        </span>
      `,
    },
    {
      id: 'norma_codigo',
      header: 'Norma',
      sortable: true,
      defaultWidthPct: 18,
      minWidthPx: 115,
      renderCell: (req) => `
        <span class="block text-slate-700 truncate">${escapeHtml(req.norma_codigo)}</span>
      `,
    },
  ];

  const modePills: Array<{ id: ProcesoBatchMode; label: string }> = [
    { id: 'mandatory', label: 'Solo Obligatorias' },
    { id: 'pending', label: 'Solo Pendientes' },
    { id: 'all', label: 'Todas' },
  ];

  return `
    <div class="space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 class="text-sm font-bold text-slate-900">Requisitos Normativos Vinculados</h3>
          <p class="text-xs text-slate-500">
            Cláusulas LTREE de <strong>${escapeHtml(proceso.norma_codigo)}</strong> asignadas a ${escapeHtml(proceso.nombre_proceso)}.
          </p>
        </div>

        ${
          isStaff
            ? `
              <button
                type="button"
                data-action="toggle-assign-proceso-req"
                class="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer self-start sm:self-auto"
              >
                ${isAssigningRequisito ? '✕ Cerrar Cobertura' : '+ Vincular Cláusulas'}
              </button>
            `
            : ''
        }
      </div>

      ${(() => {
        const sameNormSyncedCount = peerSharingSummary.sameNormSyncedPeers.length;
        const sameNormUnsyncedCount = peerSharingSummary.sameNormUnsyncedPeers.length;
        const totalSameNormCount = sameNormSyncedCount + sameNormUnsyncedCount;
        const diffNormCount = peerSharingSummary.diffNormPeers.length;
        if (totalSameNormCount === 0 && diffNormCount === 0) return '';

        const sameNormCertLabels = [
          ...peerSharingSummary.sameNormSyncedPeers,
          ...peerSharingSummary.sameNormUnsyncedPeers,
        ]
          .map((p) => p.numero_certificado)
          .join(', ');

        const sameNormCardHtml =
          totalSameNormCount > 0
            ? (() => {
                const hasUnsynced = sameNormUnsyncedCount > 0;
                const badgeText =
                  sameNormSyncedCount > 0 && !hasUnsynced
                    ? 'Sincronización activa'
                    : hasUnsynced && sameNormSyncedCount === 0
                    ? 'Requisitos independientes'
                    : 'Sincronización parcial';
                const badgeClass =
                  sameNormSyncedCount > 0 && !hasUnsynced
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : hasUnsynced && sameNormSyncedCount === 0
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-indigo-50 text-indigo-800 border-indigo-200';
                const messageText =
                  sameNormSyncedCount > 0 && !hasUnsynced
                    ? `Sincronización activa con ${sameNormSyncedCount} cert(s) de ${proceso.norma_codigo} (${sameNormCertLabels}).`
                    : hasUnsynced && sameNormSyncedCount === 0
                    ? `Compartido sin requisitos sincronizados con ${sameNormUnsyncedCount} cert(s) de ${proceso.norma_codigo} (${sameNormCertLabels}).`
                    : `Sincronización activa con ${sameNormSyncedCount} cert(s) y ${sameNormUnsyncedCount} cert(s) independiente(s) de ${proceso.norma_codigo} (${sameNormCertLabels}).`;
                const buttonLabel = hasUnsynced
                  ? 'Compartir conjunto de cláusulas'
                  : 'Sincronizar Requisitos Ahora';

                return `
                  <div class="rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div class="flex flex-wrap items-center gap-2 min-w-0">
                      <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border shrink-0 ${badgeClass}">
                        ${escapeHtml(badgeText)}
                      </span>
                      <span class="text-xs text-slate-700 leading-snug">
                        ${escapeHtml(messageText)}
                      </span>
                    </div>
                    ${
                      isStaff
                        ? `
                          <button
                            type="button"
                            data-action="sync-shared-proceso-reqs"
                            data-proceso-id="${escapeHtml(proceso.id)}"
                            data-cert-id="${escapeHtml(proceso.id_certificado)}"
                            data-enable-sync="true"
                            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-300 bg-white hover:bg-indigo-50 text-indigo-700 text-xs font-bold transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                          >
                            ${escapeHtml(buttonLabel)}
                          </button>
                        `
                        : ''
                    }
                  </div>
                `;
              })()
            : '';

        const diffNormCardHtml =
          diffNormCount > 0
            ? `
              <div class="rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2 text-xs text-slate-600 flex flex-wrap items-center gap-2">
                <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border bg-slate-100 text-slate-700 border-slate-300 shrink-0">
                  Norma distinta
                </span>
                <span>
                  Compartido con ${diffNormCount} cert(s) de otra norma con requisitos independientes (no se mezclan cláusulas entre normas).
                </span>
              </div>
            `
            : '';

        return `<div class="space-y-2">${sameNormCardHtml}${diffNormCardHtml}</div>`;
      })()}

      ${
        isStaff && isAssigningRequisito
          ? `
            <div id="procesoRequisitosManagementPanel" class="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
              <form id="assignProcesoRequisitosBatchForm" class="space-y-3">
                <div class="space-y-2">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 class="text-xs font-bold uppercase tracking-wider text-slate-700">
                        Selector Jerárquico de Subárboles (${escapeHtml(proceso.norma_codigo)})
                      </h4>
                      <p class="text-[11px] text-slate-500">
                        Marcar una cláusula padre vincula automáticamente todo su subárbol activo mediante LTREE.
                      </p>
                    </div>
                    <div class="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        data-action="select-pending-mandatory-clauses"
                        class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer"
                      >
                        ✓ Seleccionar Todas las Pendientes
                      </button>
                      <button
                        type="button"
                        data-action="clear-proceso-batch-selection"
                        class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                      >
                        Limpiar Selección
                      </button>
                    </div>
                  </div>

                  <div class="flex flex-col lg:flex-row lg:items-center gap-2">
                    <div class="relative flex-1 min-w-[220px]">
                      <div class="pointer-events-none absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-400">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
                          <circle cx="11" cy="11" r="7" />
                          <path stroke-linecap="round" d="m20 20-3.5-3.5" />
                        </svg>
                      </div>
                      <input
                        id="procesoBatchFilterInput"
                        type="text"
                        data-action="filter-proceso-batch-clauses"
                        value="${escapeHtml(batchFilterQuery)}"
                        placeholder="Filtrar cláusula por código, título o texto (ES / EN)..."
                        autocomplete="off"
                        class="w-full h-8 text-xs rounded-lg border border-slate-300 bg-white pl-8 pr-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                    </div>
                    <div class="inline-flex flex-wrap items-center gap-1" role="group" aria-label="Filtro de visibilidad de cláusulas">
                      ${modePills
                        .map((pill) => {
                          const isActive = batchMode === pill.id;
                          return `
                            <button
                              type="button"
                              data-action="set-proceso-batch-mode"
                              data-batch-mode="${pill.id}"
                              aria-pressed="${isActive}"
                              class="px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                                isActive
                                  ? 'bg-slate-900 text-white border-slate-900'
                                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                              }"
                            >
                              ${escapeHtml(pill.label)}
                            </button>
                          `;
                        })
                        .join('')}
                    </div>
                  </div>
                </div>

                <div
                  id="procesoBatchChecklistContainer"
                  class="max-h-96 overflow-y-auto divide-y divide-slate-200/80 rounded-xl border border-slate-200 bg-white"
                >
                  ${renderProcesoBatchChecklistRowsHtml({
                    rows: pickerData.rows,
                    selectedIdSet,
                    expandedBatchClauseIds,
                    filterQuery: batchFilterQuery,
                  })}
                </div>

                <div
                  id="procesoBatchStickySummaryBar"
                  class="sticky bottom-2 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-200 bg-white/95 backdrop-blur px-3.5 py-2.5 shadow-sm"
                >
                  <span id="procesoBatchSummaryText" class="text-xs font-bold text-slate-800 tabular-nums">
                    ${escapeHtml(renderProcesoBatchSummaryText(summary))}
                  </span>
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      data-action="toggle-assign-proceso-req"
                      class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      id="submitProcesoBatchBtn"
                      class="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors cursor-pointer"
                    >
                      Vincular Seleccionadas
                    </button>
                  </div>
                </div>
              </form>

              ${
                requisitos.length > 0
                  ? `
                    <form id="unassignProcesoRequisitoForm" class="pt-3 border-t border-slate-200 flex flex-col sm:flex-row sm:items-end gap-3">
                      <div class="flex-1 space-y-1">
                        <label for="unassignProcesoReqSelect" class="block text-xs font-bold text-slate-700">Desvincular Cláusula del Proceso</label>
                        <select
                          id="unassignProcesoReqSelect"
                          name="codigo"
                          required
                          class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white"
                        >
                          ${requisitos
                            .map(
                              (req) => `
                                <option value="${escapeHtml(req.codigo)}" data-req-id="${escapeHtml(req.id_requisito)}">
                                  Cláusula ${escapeHtml(req.codigo)} — ${escapeHtml(req.titulo)}
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
                        Desvincular Cláusula
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
        tableId: 'proceso-tab-requisitos',
        items: sortedRequisitos,
        columns,
        sortState,
        columnWidths,
        getRowAttrs: (req) =>
          `data-action="select-proceso-requisito" data-requisito-id="${escapeHtml(req.id_requisito)}" data-norma-id="${escapeHtml(req.id_norma)}" data-codigo="${escapeHtml(req.codigo)}" title="Ver cláusula ${escapeHtml(req.codigo)} en ${escapeHtml(req.norma_codigo)}"`,
        emptyStateTitle: 'Sin requisitos normativos vinculados',
        emptyStateMessage: `Utilice el botón "+ Vincular Cláusulas" para asociar cláusulas LTREE de ${proceso.norma_codigo} a este proceso.`,
      })}
    </div>
  `;
}

function renderProcesoHallazgosTab(
  proceso: ProcesoDetailEntity,
  hallazgos: ReadonlyArray<ProcesoHallazgoLink>,
  sortState: SortState,
  columnWidths?: Record<string, number>,
  programacionAudits: ReadonlyArray<ProgramacionAuditEntity> = []
): string {
  const auditById = new Map(programacionAudits.map((a) => [a.id, a]));
  const sorted = sortItems([...hallazgos], sortState.column, sortState.direction, (h, col) => {
    switch (col) {
      case 'tipo':
        return h.tipo;
      case 'requisito_codigo':
        return h.requisito_codigo;
      case 'descripcion':
        return h.descripcion;
      case 'cerrado':
        return h.cerrado ? 'Cerrado' : 'Abierto';
      case 'codigo_auditoria':
        return h.codigo_auditoria;
      default:
        return '';
    }
  });

  const columns: ColumnDefinition<ProcesoHallazgoLink>[] = [
    {
      id: 'tipo',
      header: 'Tipo',
      sortable: true,
      defaultWidthPct: 16,
      minWidthPx: 110,
      renderCell: (h) => {
        const tMeta = getPhase5FindingTypeMeta(h.tipo);
        return `
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border ${tMeta.badgeClass}">
            <span aria-hidden="true">${tMeta.symbol}</span>
            <span>${escapeHtml(tMeta.shortLabel)}</span>
          </span>
        `;
      },
    },
    {
      id: 'requisito_codigo',
      header: 'Cláusula',
      sortable: true,
      defaultWidthPct: 14,
      minWidthPx: 95,
      renderCell: (h) => `
        <span class="font-mono font-bold text-indigo-700 whitespace-nowrap">
          Cláusula ${escapeHtml(h.requisito_codigo)}
        </span>
      `,
    },
    {
      id: 'descripcion',
      header: 'Descripción',
      sortable: true,
      defaultWidthPct: 38,
      minWidthPx: 180,
      renderCell: (h) => `
        <div class="min-w-0" title="${escapeHtml(h.descripcion)}">
          <div class="font-mono text-[10px] text-slate-500 truncate">${escapeHtml(h.codigo_hallazgo)}</div>
          <p class="text-slate-700 truncate">${escapeHtml(h.descripcion)}</p>
        </div>
      `,
    },
    {
      id: 'cerrado',
      header: 'Estado',
      align: 'center',
      sortable: true,
      defaultWidthPct: 14,
      minWidthPx: 95,
      renderCell: (h) => `
        <span class="inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
          h.cerrado
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : 'bg-amber-50 text-amber-800 border-amber-200'
        }">
          ${h.cerrado ? 'Cerrado' : 'Abierto'}
        </span>
      `,
    },
    {
      id: 'codigo_auditoria',
      header: 'Auditoría',
      align: 'right',
      sortable: true,
      defaultWidthPct: 18,
      minWidthPx: 115,
      renderCell: (h) => {
        const matchedAudit = auditById.get(h.id_auditoria);
        const codename = matchedAudit
          ? formatAuditCodename(matchedAudit)
          : h.codigo_auditoria;
        const tooltip = matchedAudit
          ? getAuditCodenameTooltip(matchedAudit)
          : h.codigo_auditoria;
        return `
        <span class="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700" title="${escapeHtml(tooltip)}">
          <span class="font-mono">${escapeHtml(codename)}</span>
          <span aria-hidden="true">→</span>
        </span>
      `;
      },
    },
  ];

  return `
    <div class="space-y-3">
      <div>
        <h3 class="text-sm font-bold text-slate-900">Hallazgos Asociados</h3>
        <p class="text-xs text-slate-500">
          Desviaciones y observaciones detectadas durante auditorías sobre ${escapeHtml(proceso.nombre_proceso)}.
        </p>
      </div>

      ${renderListViewTable({
        tableId: 'proceso-tab-hallazgos',
        items: sorted,
        columns,
        sortState,
        columnWidths,
        getRowAttrs: (h) =>
          `data-action="go-audit-results" data-audit-id="${escapeHtml(h.id_auditoria)}" title="Ver hallazgo en Resultado de auditoría ${escapeHtml(h.codigo_auditoria)}"`,
        emptyStateTitle: 'Sin hallazgos registrados para este proceso',
        emptyStateMessage: `No existen no conformidades, observaciones ni oportunidades de mejora vinculadas a ${proceso.nombre_proceso}.`,
      })}
    </div>
  `;
}

function renderProcesoAuditoriasTab(
  proceso: ProcesoDetailEntity,
  auditorias: ReadonlyArray<ProcesoAuditoriaLink>,
  sortState: SortState,
  columnWidths?: Record<string, number>
): string {
  const sorted = sortItems([...auditorias], sortState.column, sortState.direction, (row, col) => {
    switch (col) {
      case 'codigo_auditoria':
        return row.codigo_auditoria;
      case 'nombre_sitio':
        return row.nombre_sitio;
      case 'turno_label':
        return row.turno_label;
      case 'fecha_programacion':
        return row.fecha_programacion;
      case 'estatus':
        return row.estatus;
      default:
        return '';
    }
  });

  const columns: ColumnDefinition<ProcesoAuditoriaLink>[] = [
    {
      id: 'codigo_auditoria',
      header: 'Auditoría',
      sortable: true,
      defaultWidthPct: 24,
      minWidthPx: 140,
      renderCell: (row) => {
        const codename = formatAuditCodename({
          codigo_auditoria: row.codigo_auditoria,
          tipo_auditoria: row.tipo_auditoria,
          fecha_inicio: row.fecha_programacion,
        });
        const tooltip = getAuditCodenameTooltip({
          codigo_auditoria: row.codigo_auditoria,
          tipo_auditoria: row.tipo_auditoria,
          fecha_inicio: row.fecha_programacion,
        });
        return `
        <div class="min-w-0" title="${escapeHtml(tooltip)}">
          <div class="font-mono font-bold text-indigo-700 inline-flex items-center gap-1 max-w-full">
            <span aria-hidden="true" class="shrink-0">🗓️</span>
            <span class="truncate">${escapeHtml(codename)}</span>
          </div>
          <div class="text-[11px] text-slate-500 truncate">${escapeHtml(row.tipo_auditoria)} · ${escapeHtml(row.metodologia)}</div>
        </div>
      `;
      },
    },
    {
      id: 'nombre_sitio',
      header: 'Sitio Evaluado',
      sortable: true,
      defaultWidthPct: 22,
      minWidthPx: 130,
      renderCell: (row) => `
        <span class="block font-semibold text-slate-800 truncate">
          ${row.numero_sitio !== null ? `Sitio ${row.numero_sitio} — ` : ''}${escapeHtml(row.nombre_sitio)}
        </span>
      `,
    },
    {
      id: 'turno_label',
      header: 'Turno Operativo',
      sortable: true,
      defaultWidthPct: 24,
      minWidthPx: 150,
      renderCell: (row) => `
        <span class="block font-medium text-slate-700 truncate" title="${escapeHtml(row.turno_label)}">
          ${row.id_turno ? `🕒 ${escapeHtml(row.turno_label)}` : escapeHtml(row.turno_label)}
        </span>
      `,
    },
    {
      id: 'fecha_programacion',
      header: 'Fecha',
      sortable: true,
      defaultWidthPct: 15,
      minWidthPx: 100,
      renderCell: (row) => `
        <span class="font-mono text-slate-700 tabular-nums">${escapeHtml(row.fecha_programacion)}</span>
      `,
    },
    {
      id: 'estatus',
      header: 'Estado',
      align: 'center',
      sortable: true,
      defaultWidthPct: 15,
      minWidthPx: 100,
      renderCell: (row) => {
        const isDone =
          row.estatus === 'Completada' ||
          row.estatus === 'Completado' ||
          row.estatus === 'Cerrada' ||
          row.estatus === 'Cerrado';
        return `
          <span class="inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
            isDone
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-indigo-50 text-indigo-800 border-indigo-200'
          }">
            ${escapeHtml(row.estatus)}
          </span>
        `;
      },
    },
  ];

  return `
    <div class="space-y-3">
      <div>
        <h3 class="text-sm font-bold text-slate-900">Auditorías Programadas</h3>
        <p class="text-xs text-slate-500">
          Sedes, turnos y eventos de auditoría que evalúan ${escapeHtml(proceso.nombre_proceso)}.
        </p>
      </div>

      ${renderListViewTable({
        tableId: 'proceso-tab-auditorias',
        items: sorted,
        columns,
        sortState,
        columnWidths,
        getRowAttrs: (row) =>
          `data-action="select-prog-audit" data-audit-id="${escapeHtml(row.id_auditoria)}" title="Abrir detalle de auditoría ${escapeHtml(row.codigo_auditoria)}"`,
        emptyStateTitle: 'Sin auditorías programadas para este proceso',
        emptyStateMessage: `${proceso.nombre_proceso} aún no figura en el programa de evaluación de sitios y turnos.`,
      })}
    </div>
  `;
}
