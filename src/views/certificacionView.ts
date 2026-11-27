import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/accessControl';
import { APP_SHELL_CONTAINER_CLASS } from '../lib/layout';
import type {
  CertificateRecord,
  SearchControlsFilterState,
} from '../lib/searchControls';
import {
  renderConglomeradoView,
  type ConglomeradoViewState,
} from './conglomeradoView';
import {
  INITIAL_CONGLOMERADOS,
  buildConglomeradosWithStats,
  computeOrgActiveCertificatesMap,
  scopeConglomeradosForProfile,
  type ActiveCertCountingRef,
  type ConglomeradoEntity,
  type ConglomeradoVinculoRef,
} from '../lib/conglomeradoDomain';
import type { ProgramaAuditoriaEntity } from '../lib/auditPlanningEngine';
import type { AuditoriaSitioTemporalEntity } from '../lib/designacionTemporalDomain';
import type { AlertConfigEntity } from '../lib/auditAlertsEngine';
import {
  renderOrganizacionView,
  type OrganizacionViewState,
} from './organizacionView';
import {
  renderClientAccessView,
  type ClientAccessViewState,
} from './clientAccessView';
import {
  INITIAL_ORGANIZACIONES,
  type OrganizacionEntity,
  type OrganizacionVersionEntity,
  type CertificadoSummary,
  type ClientOrganizationAccessEntity,
} from '../lib/activeCertificates';
import {
  renderCertificadoView,
  resolveProjectedCertVersionContext,
  type CertificadoViewState,
} from './certificadoView';
import {
  renderVinculoView,
  DEFAULT_VINCULO_STATE,
  type VinculoViewState,
} from './vinculoView';
import type { VinculoEntity } from '../lib/vinculoDomain';
import {
  INITIAL_CERTIFICADOS_DETAILED,
  type CertificadoDetailEntity,
} from '../lib/multisiteSampling';
import {
  renderAuditorView,
  type AuditorViewState,
} from './auditorView';
import {
  renderCompetenciaAuditorView,
  type CompetenciaAuditorViewState,
} from './competenciaAuditorView';
import {
  INITIAL_AUDITORES_DETAILED,
  type AuditorDetailEntity,
} from '../lib/competencyMatrix';
import {
  renderExpertoTecnicoView,
  type ExpertoTecnicoViewState,
} from './expertoTecnicoView';
import {
  INITIAL_EXPERTOS_TECNICOS,
  createDefaultExpertoTecnicoViewState,
  type ExpertoTecnicoDetailEntity,
} from '../lib/expertoTecnicoDomain';
import type { ProgramacionAuditEntity, Phase5FindingEntity } from '../lib/auditExecution';
import { INITIAL_PHASE5_FINDINGS } from '../lib/auditExecution';
import type {
  EstatusCatalogItem,
  NormaEntity,
  RequisitoLtree,
  SectorIafEntity,
  SubsectorIafEntity,
} from '../lib/extraDomain';
import {
  INITIAL_TURNO_CATALOG,
  resolveSitioDetailById,
  type TurnoCatalogItem,
} from '../lib/sitioDomain';
import { renderSitioView, type SitioViewState } from './sitioView';
import {
  getAllSeededNormaRequirements,
  resolveProcesoDetailById,
} from '../lib/procesoDomain';
import { renderProcesoView, type ProcesoViewState } from './procesoView';
import { resolveTurnoDetailById } from '../lib/turnoDomain';
import {
  renderTurnoView,
  type TurnoAvailableSiteOption,
  type TurnoViewState,
} from './turnoView';
import {
  resolveNoAplicableDetailById,
  type NoAplicableViewState,
} from '../lib/noAplicableDomain';
import { renderNoAplicableView } from './noAplicableView';
import {
  resolveContactoDetailById,
  resolveEmailDetailById,
  resolveFechaDetailById,
  resolveTelefonoDetailById,
} from '../lib/certificadoSubEntities';
import { renderFechaView, type FechaViewState } from './fechaView';
import { renderContactoView, type ContactoViewState } from './contactoView';
import { renderTelefonoView, type TelefonoViewState } from './telefonoView';
import { renderEmailView, type EmailViewState } from './emailView';
import type { ArchiveMultiViewConfig } from '../lib/archiveGovernance';

export interface OrganizationRecord {
  id: string;
  nombre: string;
  abreviacion?: string;
  rif: string;
  direccion_fiscal?: string;
  id_organizacion_version_actual?: string;
  version_actual_numero?: number;
  versiones?: OrganizacionVersionEntity[];
  certificados_count: number;
}

export interface SiteRecord {
  id: string;
  numero_sitio: number;
  nombre_sitio: string;
  direccion_sitio: string;
  numero_certificado: string;
  turnos_count: number;
}

export interface ProcessRecord {
  id: string;
  nombre_proceso: string;
  numero_certificado: string;
  clausulas_cubiertas: string[];
}

export interface ShiftRecord {
  id: string;
  hora_entrada: string;
  hora_salida: string;
  descripcion: string;
  sitios_vinculados: string[];
}

export interface CertificacionViewState {
  activeSubSection: string;
  filters: SearchControlsFilterState;
  filteredCertificates: CertificateRecord[];
  allCertificates: CertificateRecord[];
  availableStatuses: string[];
  availableStandards: string[];
  organizations: OrganizationRecord[];
  sites: SiteRecord[];
  processes: ProcessRecord[];
  shifts: ShiftRecord[];
  loading: boolean;
  conglomeradoState?: Partial<ConglomeradoViewState>;
  allConglomerados?: ConglomeradoEntity[];
  auditPrograms?: ProgramaAuditoriaEntity[];
  allVinculos?: ReadonlyArray<ConglomeradoVinculoRef>;
  allVinculosDetailed?: ReadonlyArray<VinculoEntity>;
  vinculoState?: Partial<VinculoViewState>;
  allTemporalSites?: ReadonlyArray<AuditoriaSitioTemporalEntity>;
  auditAlertConfig?: AlertConfigEntity;
  authorizedClientOrgIds?: ReadonlyArray<string>;
  organizacionState?: Partial<OrganizacionViewState>;
  allOrganizaciones?: OrganizacionEntity[];
  clientAccessState?: Partial<ClientAccessViewState>;
  clientAccesses?: ClientOrganizationAccessEntity[];
  profilesDirectory?: UserProfile[];
  certificadoState?: Partial<CertificadoViewState>;
  allCertificadosDetailed?: CertificadoDetailEntity[];
  auditorState?: Partial<AuditorViewState>;
  competenciaAuditorState?: Partial<CompetenciaAuditorViewState>;
  allAuditorsDetailed?: AuditorDetailEntity[];
  expertoTecnicoState?: Partial<ExpertoTecnicoViewState>;
  allExpertosTecnicos?: ExpertoTecnicoDetailEntity[];
  programacionAudits?: ProgramacionAuditEntity[];
  sitioState?: Partial<SitioViewState>;
  procesoState?: Partial<ProcesoViewState>;
  turnoState?: Partial<TurnoViewState>;
  noAplicableState?: Partial<NoAplicableViewState>;
  fechaState?: Partial<FechaViewState>;
  contactoState?: Partial<ContactoViewState>;
  telefonoState?: Partial<TelefonoViewState>;
  emailState?: Partial<EmailViewState>;
  shiftCatalog?: TurnoCatalogItem[];
  requirementsCatalog?: ReadonlyArray<RequisitoLtree>;
  standardsCatalog?: ReadonlyArray<NormaEntity>;
  estatusCatalog?: ReadonlyArray<EstatusCatalogItem>;
  iafSectors?: ReadonlyArray<SectorIafEntity>;
  iafSubsectors?: SubsectorIafEntity[];
  phase5Findings?: ReadonlyArray<Phase5FindingEntity>;
  archivedSiteIds?: ReadonlySet<string>;
  archivedProcesoIds?: ReadonlySet<string>;
  archivedTurnoIds?: ReadonlySet<string>;
  archivedNoAplicableIds?: ReadonlySet<string>;
  archivedFechaIds?: ReadonlySet<string>;
  archivedContactoIds?: ReadonlySet<string>;
  archivedTelefonoIds?: ReadonlySet<string>;
  archivedEmailIds?: ReadonlySet<string>;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
  authUserEmail?: string | null;
}

export function renderCertificacionView(
  profile: UserProfile,
  state: CertificacionViewState
): string {
  const activeSub = state.activeSubSection || 'certificates';

  let contentHtml = '';

  if (activeSub === 'conglomerados') {
    const groupList: ConglomeradoEntity[] =
      state.allConglomerados !== undefined
        ? state.allConglomerados
        : INITIAL_CONGLOMERADOS;
    const orgList: OrganizacionEntity[] =
      state.allOrganizaciones !== undefined
        ? state.allOrganizaciones
        : INITIAL_ORGANIZACIONES;
    const certRefs =
      state.allCertificadosDetailed && state.allCertificadosDetailed.length > 0
        ? state.allCertificadosDetailed
        : state.allCertificates
            .filter((c): c is typeof c & { organizacion_id: string } =>
              Boolean(c.organizacion_id)
            )
            .map((c) => ({
              id_organizacion: c.organizacion_id,
              deleted_at: null,
            }));

    const detailVersionByCertId = new Map<string, number>();
    for (const det of state.allCertificadosDetailed || []) {
      if (det.id && typeof det.version_actual_numero === 'number' && det.version_actual_numero > 0) {
        detailVersionByCertId.set(det.id, det.version_actual_numero);
      }
    }

    const congCertCountingRefs: ActiveCertCountingRef[] =
      state.allCertificates.length > 0
        ? state.allCertificates.map((c) => ({
            id: c.id,
            numero_certificado: c.numero_certificado,
            norma: c.norma,
            id_organizacion: c.organizacion_id,
            organizacion_id: c.organizacion_id,
            estatus: c.estatus,
            version_actual_numero: c.version_numero ?? detailVersionByCertId.get(c.id),
            deleted_at: null,
          }))
        : (state.allCertificadosDetailed || []).map((c) => ({
            id: c.id,
            numero_certificado: c.numero_certificado,
            norma_codigo: c.norma_codigo,
            id_organizacion: c.id_organizacion,
            estatus: c.estatus,
            version_actual_numero: c.version_actual_numero,
            deleted_at: null,
          }));

    const activeCertCountByOrgId = computeOrgActiveCertificatesMap(congCertCountingRefs);
    const stats = buildConglomeradosWithStats(groupList, orgList, certRefs);
    const scopedStats = scopeConglomeradosForProfile(
      stats,
      profile,
      state.authorizedClientOrgIds || [],
      congCertCountingRefs.length > 0 ? activeCertCountByOrgId : undefined
    );

    const congState: ConglomeradoViewState = {
      selectedConglomeradoId: state.conglomeradoState?.selectedConglomeradoId || null,
      query: state.conglomeradoState?.query || '',
      viewMode: state.conglomeradoState?.viewMode || 'grid',
      sortColumn: state.conglomeradoState?.sortColumn || null,
      sortDirection: state.conglomeradoState?.sortDirection || 'none',
      isEditingAttributes: Boolean(state.conglomeradoState?.isEditingAttributes),
      activeChildTab: state.conglomeradoState?.activeChildTab || 'organizaciones',
      formDraft: state.conglomeradoState?.formDraft,
      editErrorMessage: state.conglomeradoState?.editErrorMessage ?? null,
      isSidebarOpen: state.conglomeradoState?.isSidebarOpen ?? true,
      facetSelections: state.conglomeradoState?.facetSelections,
      isCreating: Boolean(state.conglomeradoState?.isCreating),
      rebucketTargetOrgId: state.conglomeradoState?.rebucketTargetOrgId ?? null,
      rebucketErrorMessage: state.conglomeradoState?.rebucketErrorMessage ?? null,
      detachTargetOrgId: state.conglomeradoState?.detachTargetOrgId ?? null,
      detachErrorMessage: state.conglomeradoState?.detachErrorMessage ?? null,
    };

    contentHtml = renderConglomeradoView({
      profile,
      state: congState,
      conglomerados: scopedStats,
      allOrganizaciones: orgList,
      certificados: congCertCountingRefs,
      auditPrograms: state.auditPrograms || [],
      programacionAudits: state.programacionAudits || [],
      vinculos: state.allVinculos || [],
      temporalSites: state.allTemporalSites || [],
      phase5Findings: state.phase5Findings || [],
      alertConfig: state.auditAlertConfig,
      authorizedClientOrgIds: state.authorizedClientOrgIds || [],
      loading: state.loading,
      archiveConfig: state.archiveConfig,
      columnWidths: state.tableColumnWidths?.['conglomerados-main'],
      tableColumnWidths: state.tableColumnWidths,
    });
  } else if (activeSub === 'organizations') {
    const orgList: OrganizacionEntity[] =
      state.allOrganizaciones !== undefined
        ? state.allOrganizaciones
        : INITIAL_ORGANIZACIONES;
    const groupList: ConglomeradoEntity[] =
      state.allConglomerados !== undefined
        ? state.allConglomerados
        : INITIAL_CONGLOMERADOS;

    if (state.clientAccessState?.selectedAccessId || state.clientAccessState?.isCreating) {
      const accessState: ClientAccessViewState = {
        selectedAccessId: state.clientAccessState?.selectedAccessId || null,
        prefillOrganizacionId: state.clientAccessState?.prefillOrganizacionId ?? null,
        isCreating: Boolean(state.clientAccessState?.isCreating),
        isEditingAttributes: Boolean(state.clientAccessState?.isEditingAttributes),
        formDraft: state.clientAccessState?.formDraft,
        editErrorMessage: state.clientAccessState?.editErrorMessage ?? null,
      };
      contentHtml = renderClientAccessView({
        profile,
        state: accessState,
        accesses: state.clientAccesses || [],
        organizaciones: orgList,
        profiles: state.profilesDirectory || [],
      });
    } else {
      const orgState: OrganizacionViewState = {
        selectedOrganizacionId: state.organizacionState?.selectedOrganizacionId || null,
        selectedOrgVersionId: state.organizacionState?.selectedOrgVersionId ?? null,
        query: state.organizacionState?.query || '',
        hasActiveCertificates: state.organizacionState?.hasActiveCertificates || 'ALL',
        selectedSectorIaf: state.organizacionState?.selectedSectorIaf || 'ALL',
        viewMode: state.organizacionState?.viewMode || 'grid',
        sortColumn: state.organizacionState?.sortColumn || null,
        sortDirection: state.organizacionState?.sortDirection || 'none',
        isEditingAttributes: Boolean(state.organizacionState?.isEditingAttributes),
        isCreatingVersion: Boolean(state.organizacionState?.isCreatingVersion),
        activeChildTab: state.organizacionState?.activeChildTab || 'certificados',
        formDraft: state.organizacionState?.formDraft,
        editFormData: state.organizacionState?.editFormData,
        editErrorMessage: state.organizacionState?.editErrorMessage ?? null,
        isSidebarOpen: state.organizacionState?.isSidebarOpen ?? true,
        facetSelections: state.organizacionState?.facetSelections,
        isCreating: Boolean(state.organizacionState?.isCreating),
        certResolutionModal: state.organizacionState?.certResolutionModal ?? null,
      };

      const certSummaries: CertificadoSummary[] = state.allCertificates.map((c) => ({
        id: c.id,
        numero_certificado: c.numero_certificado,
        id_organizacion: c.organizacion_id,
        organizacion_id: c.organizacion_id,
        organizacion_nombre: c.organizacion_nombre,
        norma: c.norma,
        esquema: c.esquema,
        estatus: c.estatus,
        sector_iaf: c.sector_iaf,
        multisitio: c.multisitio,
        sitios_count: c.sitios_count,
        fecha_emision: c.fecha_emision,
        fecha_vencimiento: c.fecha_vencimiento,
        cobertura_porcentaje: c.cobertura_porcentaje,
      }));

      contentHtml = renderOrganizacionView({
        profile,
        state: orgState,
        organizaciones: orgList,
        conglomerados: groupList,
        certificados: certSummaries,
        allCertificadosDetailed:
          state.allCertificadosDetailed ?? INITIAL_CERTIFICADOS_DETAILED,
        auditorias: state.programacionAudits || [],
        clientAccesses: state.clientAccesses || [],
        profilesDirectory: state.profilesDirectory || [],
        loading: state.loading,
        archiveConfig: state.archiveConfig,
        columnWidths: state.tableColumnWidths?.['cert-organizaciones-main'],
        tableColumnWidths: state.tableColumnWidths,
      });
    }
  } else if (activeSub === 'auditors') {
    const audList: AuditorDetailEntity[] =
      state.allAuditorsDetailed !== undefined
        ? state.allAuditorsDetailed
        : INITIAL_AUDITORES_DETAILED;

    if (state.competenciaAuditorState?.isOpen) {
      const compState: CompetenciaAuditorViewState = {
        isOpen: true,
        mode: state.competenciaAuditorState.mode === 'add' ? 'add' : 'read',
        selectedComp: state.competenciaAuditorState.selectedComp ?? null,
        prefillAuditorId: state.competenciaAuditorState.prefillAuditorId ?? null,
        formDraft: state.competenciaAuditorState.formDraft,
        errorMessage: state.competenciaAuditorState.errorMessage ?? null,
        confirmUnlink: Boolean(state.competenciaAuditorState.confirmUnlink),
      };

      contentHtml = renderCompetenciaAuditorView({
        profile,
        state: compState,
        auditors: audList,
        normas: state.standardsCatalog ? [...state.standardsCatalog] : [],
        sectores: state.iafSectors ? [...state.iafSectors] : [],
        subsectores: state.iafSubsectors ? [...state.iafSubsectors] : [],
      });
    } else {
      const audState: AuditorViewState = {
        ...state.auditorState,
        selectedAuditorId: state.auditorState?.selectedAuditorId || null,
        activeChildTab: state.auditorState?.activeChildTab || 'competencias',
        query: state.auditorState?.query || '',
        selectedCalificacion: state.auditorState?.selectedCalificacion || 'ALL',
        selectedStandard: state.auditorState?.selectedStandard || 'ALL',
        selectedSectorIaf: state.auditorState?.selectedSectorIaf || 'ALL',
        viewMode: state.auditorState?.viewMode || 'grid',
        sortColumn: state.auditorState?.sortColumn || null,
        sortDirection: state.auditorState?.sortDirection || 'none',
        isEditingAttributes: Boolean(state.auditorState?.isEditingAttributes),
        formDraft: state.auditorState?.formDraft,
        editFormData: state.auditorState?.editFormData,
        editErrorMessage: state.auditorState?.editErrorMessage,
        isSidebarOpen: state.auditorState?.isSidebarOpen ?? true,
        facetSelections: state.auditorState?.facetSelections,
        isCreating: Boolean(state.auditorState?.isCreating),
        createErrorMessage: state.auditorState?.createErrorMessage,
      };

      contentHtml = renderAuditorView({
        profile,
        state: audState,
        auditors: audList,
        normas: state.standardsCatalog ? [...state.standardsCatalog] : undefined,
        sectores: state.iafSectors ? [...state.iafSectors] : undefined,
        subsectores: state.iafSubsectors ? [...state.iafSubsectors] : undefined,
        loading: state.loading,
        archiveConfig: state.archiveConfig,
        columnWidths: state.tableColumnWidths?.['cert-auditores-main'],
        tableColumnWidths: state.tableColumnWidths,
        authUserEmail: state.authUserEmail,
      });
    }
  } else if (activeSub === 'experts') {
    const expList: ExpertoTecnicoDetailEntity[] =
      state.allExpertosTecnicos !== undefined
        ? state.allExpertosTecnicos
        : INITIAL_EXPERTOS_TECNICOS;
    const defaultExpState = createDefaultExpertoTecnicoViewState();
    const expState: ExpertoTecnicoViewState = {
      ...defaultExpState,
      ...state.expertoTecnicoState,
      facetSelections: state.expertoTecnicoState?.facetSelections ?? {},
    };

    contentHtml = renderExpertoTecnicoView({
      profile,
      state: expState,
      expertos: expList,
      sectores: state.iafSectors ? [...state.iafSectors] : undefined,
      subsectores: state.iafSubsectors,
      loading: state.loading,
      archiveConfig: state.archiveConfig,
      columnWidths: state.tableColumnWidths?.['cert-expertos-main'],
      tableColumnWidths: state.tableColumnWidths,
    });
  } else if (activeSub === 'vinculo') {
    const isFullVinculoEntity = (
      ref: ConglomeradoVinculoRef | VinculoEntity
    ): ref is VinculoEntity =>
      'id_grupo_empresarial' in ref && 'es_vinculada' in ref;

    const orgList: OrganizacionEntity[] =
      state.allOrganizaciones !== undefined
        ? state.allOrganizaciones
        : INITIAL_ORGANIZACIONES;
    const congList: ConglomeradoEntity[] =
      state.allConglomerados !== undefined
        ? state.allConglomerados
        : INITIAL_CONGLOMERADOS;
    const certList: CertificadoDetailEntity[] =
      state.allCertificadosDetailed !== undefined
        ? state.allCertificadosDetailed
        : INITIAL_CERTIFICADOS_DETAILED;
    const vinculoList: ReadonlyArray<VinculoEntity> =
      state.allVinculosDetailed ??
      (state.allVinculos || []).filter(isFullVinculoEntity);

    const vinculoState: VinculoViewState = {
      ...DEFAULT_VINCULO_STATE,
      ...state.vinculoState,
      facetSelections: state.vinculoState?.facetSelections ?? {},
      selectedTargetBoxByCertId:
        state.vinculoState?.selectedTargetBoxByCertId ?? {},
      assignModalExpandedBoxIds:
        state.vinculoState?.assignModalExpandedBoxIds ?? [],
    };

    contentHtml = renderVinculoView({
      profile,
      state: vinculoState,
      vinculos: vinculoList,
      conglomerados: congList,
      organizaciones: orgList,
      certificados: certList,
      auditPrograms: state.auditPrograms || [],
      programacionAudits: state.programacionAudits || [],
      authorizedClientOrgIds: state.authorizedClientOrgIds || [],
      loading: state.loading,
      archiveConfig: state.archiveConfig,
      tableColumnWidths: state.tableColumnWidths,
    });
  } else {
    // certificates (and graceful fallback for retired 'sites'/'processes'/'shifts'/'drilldown' subviews)
    const certState: CertificadoViewState = {
      selectedCertId: state.certificadoState?.selectedCertId || null,
      selectedVersionId: state.certificadoState?.selectedVersionId ?? null,
      activeChildTab: state.certificadoState?.activeChildTab || 'alcance',
      query: state.certificadoState?.query || '',
      selectedStandard: state.certificadoState?.selectedStandard || 'ALL',
      selectedStatus: state.certificadoState?.selectedStatus || 'ALL',
      selectedSectorIaf: state.certificadoState?.selectedSectorIaf || 'ALL',
      viewMode: state.certificadoState?.viewMode || 'grid',
      sortColumn: state.certificadoState?.sortColumn || null,
      sortDirection: state.certificadoState?.sortDirection || 'none',
      childSortState: state.certificadoState?.childSortState,
      isEditingAttributes: Boolean(state.certificadoState?.isEditingAttributes),
      formDraft: state.certificadoState?.formDraft,
      editFormData: state.certificadoState?.editFormData,
      editErrorMessage: state.certificadoState?.editErrorMessage,
      originatingOrganizacionId: state.certificadoState?.originatingOrganizacionId || null,
      isSidebarOpen: state.certificadoState?.isSidebarOpen ?? true,
      facetSelections: state.certificadoState?.facetSelections,
      isCreating: Boolean(state.certificadoState?.isCreating),
      createErrorMessage: state.certificadoState?.createErrorMessage,
      isCoverageMapOpen: Boolean(state.certificadoState?.isCoverageMapOpen),
      coverageMapFilter: state.certificadoState?.coverageMapFilter ?? null,
      selectedPendingRequisitoId: state.certificadoState?.selectedPendingRequisitoId ?? null,
      alcanceLangView: state.certificadoState?.alcanceLangView ?? 'es',
      isEditingAlcance: Boolean(state.certificadoState?.isEditingAlcance),
      isCreatingAlcance: Boolean(state.certificadoState?.isCreatingAlcance),
      alcanceDraft: state.certificadoState?.alcanceDraft,
      alcanceErrorMessage: state.certificadoState?.alcanceErrorMessage ?? null,
      isCreatingVersion: Boolean(state.certificadoState?.isCreatingVersion),
      versionNotesDraft: state.certificadoState?.versionNotesDraft ?? null,
      auditResolutionModal: state.certificadoState?.auditResolutionModal ?? null,
    };

    const rawCertList: CertificadoDetailEntity[] =
      state.allCertificadosDetailed !== undefined
        ? state.allCertificadosDetailed
        : INITIAL_CERTIFICADOS_DETAILED;

    const activeContextCertId =
      state.sitioState?.prefillCertId ||
      state.sitioState?.editFormData?.sharedContext?.certId ||
      state.procesoState?.prefillCertId ||
      state.procesoState?.editFormData?.sharedContext?.certId ||
      state.turnoState?.prefillCertId ||
      state.turnoState?.editFormData?.sharedContext?.certId ||
      state.contactoState?.originatingCertId ||
      state.fechaState?.originatingCertId ||
      state.noAplicableState?.originatingCertId ||
      certState.selectedCertId ||
      null;

    const activeContextCert = activeContextCertId
      ? rawCertList.find((c) => c.id === activeContextCertId)
      : undefined;

    const activeVersionContext = activeContextCert
      ? resolveProjectedCertVersionContext(
          activeContextCert,
          activeContextCertId === certState.selectedCertId
            ? certState.selectedVersionId
            : activeContextCert.selected_version_id
        )
      : null;

    const activeCertVersionId =
      activeVersionContext?.selectedVersion?.id ??
      activeVersionContext?.projectedCert.id_certificado_version ??
      null;
    const isHistoricalCertVersion = Boolean(activeVersionContext?.isHistoricalSelected);

    const certList: CertificadoDetailEntity[] = activeVersionContext
      ? rawCertList.map((c) =>
          c.id === activeVersionContext.projectedCert.id
            ? activeVersionContext.projectedCert
            : c
        )
      : rawCertList;

    const isStaff = isApprovedStaffProfile(profile);
    const isEffectiveSubStaff = isStaff && !isHistoricalCertVersion;

    const selectedTelefonoId = state.telefonoState?.selectedTelefonoId || null;
    const isCreatingTelefono = Boolean(state.telefonoState?.isCreating) && isEffectiveSubStaff;
    const resolvedTelefono = selectedTelefonoId
      ? resolveTelefonoDetailById({
          telefonoId: selectedTelefonoId,
          certificates: certList,
          activeCertContextId: activeContextCertId,
          activeCertVersionId,
          archivedContactoIds: state.archivedContactoIds,
          archivedTelefonoIds: state.archivedTelefonoIds,
        })
      : null;

    const selectedEmailId = state.emailState?.selectedEmailId || null;
    const isCreatingEmail = Boolean(state.emailState?.isCreating) && isEffectiveSubStaff;
    const resolvedEmail = selectedEmailId
      ? resolveEmailDetailById({
          emailId: selectedEmailId,
          certificates: certList,
          activeCertContextId: activeContextCertId,
          activeCertVersionId,
          archivedContactoIds: state.archivedContactoIds,
          archivedEmailIds: state.archivedEmailIds,
        })
      : null;

    const selectedContactoId = state.contactoState?.selectedContactoId || null;
    const isCreatingContacto = Boolean(state.contactoState?.isCreating) && isEffectiveSubStaff;
    const resolvedContacto = selectedContactoId
      ? resolveContactoDetailById({
          contactoId: selectedContactoId,
          certificates: certList,
          activeCertContextId: activeContextCertId,
          activeCertVersionId,
          archivedContactoIds: state.archivedContactoIds,
          archivedTelefonoIds: state.archivedTelefonoIds,
          archivedEmailIds: state.archivedEmailIds,
        })
      : null;

    const selectedFechaId = state.fechaState?.selectedFechaId || null;
    const isCreatingFecha = Boolean(state.fechaState?.isCreating) && isEffectiveSubStaff;
    const resolvedFecha = selectedFechaId
      ? resolveFechaDetailById({
          fechaId: selectedFechaId,
          certificates: certList,
          activeCertVersionId,
          archivedFechaIds: state.archivedFechaIds,
        })
      : null;

    const selectedNoAplicableId = state.noAplicableState?.selectedNoAplicableId || null;
    const isCreatingNoAplicable =
      Boolean(state.noAplicableState?.isCreating) && isEffectiveSubStaff;
    const resolvedNoAplicable = selectedNoAplicableId
      ? resolveNoAplicableDetailById({
          noAplicableId: selectedNoAplicableId,
          certificates: certList,
          requirementsCatalog: state.requirementsCatalog || getAllSeededNormaRequirements(),
          archivedNoAplicableIds: state.archivedNoAplicableIds,
        })
      : null;

    const selectedTurnoId = state.turnoState?.selectedTurnoId || null;
    const isCreatingTurno = Boolean(state.turnoState?.isCreating) && isEffectiveSubStaff;
    const resolvedTurno = selectedTurnoId
      ? resolveTurnoDetailById({
          turnoId: selectedTurnoId,
          originatingSitioId: state.turnoState?.originatingSitioId ?? null,
          activeCertId: activeContextCertId,
          certificates: certList,
          programacionAudits: state.programacionAudits || [],
          shiftCatalog: state.shiftCatalog || INITIAL_TURNO_CATALOG,
          archivedSiteIds: state.archivedSiteIds,
          archivedTurnoIds: state.archivedTurnoIds,
        })
      : null;

    const selectedProcesoId = state.procesoState?.selectedProcesoId || null;
    const isCreatingProceso = Boolean(state.procesoState?.isCreating) && isEffectiveSubStaff;
    const resolvedProceso = selectedProcesoId
      ? resolveProcesoDetailById({
          procesoId: selectedProcesoId,
          activeCertId: activeContextCertId,
          certificates: certList,
          programacionAudits: state.programacionAudits || [],
          phase5Findings: state.phase5Findings || INITIAL_PHASE5_FINDINGS,
          requirementsCatalog: state.requirementsCatalog || getAllSeededNormaRequirements(),
          archivedProcesoIds: state.archivedProcesoIds,
        })
      : null;

    const selectedSitioId = state.sitioState?.selectedSitioId || null;
    const isCreatingSitio = Boolean(state.sitioState?.isCreating) && isEffectiveSubStaff;
    const resolvedSitio = selectedSitioId
      ? resolveSitioDetailById({
          sitioId: selectedSitioId,
          activeCertId: activeContextCertId,
          certificates: certList,
          programacionAudits: state.programacionAudits || [],
          shiftCatalog: state.shiftCatalog || INITIAL_TURNO_CATALOG,
          archivedSiteIds: state.archivedSiteIds,
          archivedProcesoIds: state.archivedProcesoIds,
        })
      : null;

    if (isCreatingTelefono || resolvedTelefono) {
      const telefonoViewState: TelefonoViewState = {
        selectedTelefonoId: resolvedTelefono?.id || selectedTelefonoId,
        originatingContactoId: state.telefonoState?.originatingContactoId ?? null,
        isCreating: isCreatingTelefono,
        isEditingAttributes:
          !isHistoricalCertVersion && Boolean(state.telefonoState?.isEditingAttributes),
        formDraft: state.telefonoState?.formDraft,
        editFormData: state.telefonoState?.editFormData,
        editErrorMessage: state.telefonoState?.editErrorMessage ?? null,
      };

      contentHtml = renderTelefonoView({
        profile,
        state: telefonoViewState,
        telefono: isCreatingTelefono ? null : resolvedTelefono,
        isHistoricalCertVersion,
        certificates: certList,
        archivedContactoIds: state.archivedContactoIds,
      });
    } else if (isCreatingEmail || resolvedEmail) {
      const emailViewState: EmailViewState = {
        selectedEmailId: resolvedEmail?.id || selectedEmailId,
        originatingContactoId: state.emailState?.originatingContactoId ?? null,
        isCreating: isCreatingEmail,
        isEditingAttributes:
          !isHistoricalCertVersion && Boolean(state.emailState?.isEditingAttributes),
        formDraft: state.emailState?.formDraft,
        editFormData: state.emailState?.editFormData,
        editErrorMessage: state.emailState?.editErrorMessage ?? null,
      };

      contentHtml = renderEmailView({
        profile,
        state: emailViewState,
        email: isCreatingEmail ? null : resolvedEmail,
        isHistoricalCertVersion,
        certificates: certList,
        archivedContactoIds: state.archivedContactoIds,
      });
    } else if (isCreatingContacto || resolvedContacto) {
      const contactoViewState: ContactoViewState = {
        selectedContactoId: resolvedContacto?.id || selectedContactoId,
        originatingCertId: state.contactoState?.originatingCertId ?? null,
        activeChildTab: state.contactoState?.activeChildTab || 'telefonos',
        isCreating: isCreatingContacto,
        isEditingAttributes:
          !isHistoricalCertVersion && Boolean(state.contactoState?.isEditingAttributes),
        formDraft: state.contactoState?.formDraft,
        editFormData: state.contactoState?.editFormData,
        editErrorMessage: state.contactoState?.editErrorMessage ?? null,
        childSortState: state.contactoState?.childSortState,
      };

      contentHtml = renderContactoView({
        profile,
        state: contactoViewState,
        contacto: isCreatingContacto ? null : resolvedContacto,
        activeCertVersionId,
        isHistoricalCertVersion,
        certificates: certList,
        authorizedClientOrgIds: state.authorizedClientOrgIds,
        tableColumnWidths: state.tableColumnWidths,
      });
    } else if (isCreatingFecha || resolvedFecha) {
      const fechaViewState: FechaViewState = {
        selectedFechaId: resolvedFecha?.id || selectedFechaId,
        originatingCertId: state.fechaState?.originatingCertId ?? null,
        isCreating: isCreatingFecha,
        isEditingAttributes:
          !isHistoricalCertVersion && Boolean(state.fechaState?.isEditingAttributes),
        formDraft: state.fechaState?.formDraft,
        editFormData: state.fechaState?.editFormData,
        editErrorMessage: state.fechaState?.editErrorMessage ?? null,
      };

      contentHtml = renderFechaView({
        profile,
        state: fechaViewState,
        fecha: isCreatingFecha ? null : resolvedFecha,
        activeCertVersionId,
        isHistoricalCertVersion,
        certificates: certList,
      });
    } else if (isCreatingNoAplicable || resolvedNoAplicable) {
      const noAplicableViewState: NoAplicableViewState = {
        selectedNoAplicableId: resolvedNoAplicable?.id || selectedNoAplicableId,
        originatingCertId: state.noAplicableState?.originatingCertId ?? null,
        isCreating: isCreatingNoAplicable,
        isEditingAttributes:
          !isHistoricalCertVersion && Boolean(state.noAplicableState?.isEditingAttributes),
        formDraft: state.noAplicableState?.formDraft,
        editErrorMessage: state.noAplicableState?.editErrorMessage ?? null,
        archiveConfirmOpen:
          !isHistoricalCertVersion && Boolean(state.noAplicableState?.archiveConfirmOpen),
        archiveErrorMessage: state.noAplicableState?.archiveErrorMessage ?? null,
        clauseFilterQuery: state.noAplicableState?.clauseFilterQuery ?? '',
        clauseMode: state.noAplicableState?.clauseMode ?? 'all',
        expandedClauseIds: state.noAplicableState?.expandedClauseIds,
        searchExpandedClauseIds: state.noAplicableState?.searchExpandedClauseIds,
      };

      contentHtml = renderNoAplicableView({
        profile,
        state: noAplicableViewState,
        noAplicable: isCreatingNoAplicable ? null : resolvedNoAplicable,
        activeCertVersionId,
        isHistoricalCertVersion,
        certificates: certList,
        requirementsCatalog: state.requirementsCatalog || getAllSeededNormaRequirements(),
        archivedNoAplicableIds: state.archivedNoAplicableIds,
        archivedProcesoIds: state.archivedProcesoIds,
      });
    } else if (isCreatingTurno || resolvedTurno) {
      const availableSites: TurnoAvailableSiteOption[] = certList.flatMap((c) =>
        (c.sitios || [])
          .filter((s) => !state.archivedSiteIds?.has(s.id))
          .map((s) => ({
            id: s.id,
            id_certificado: c.id,
            numero_certificado: c.numero_certificado,
            numero_sitio: s.numero_sitio,
            nombre_sitio: s.nombre_sitio,
          }))
      );
      const turnoViewState: TurnoViewState = {
        selectedTurnoId: resolvedTurno?.id || selectedTurnoId,
        originatingSitioId: state.turnoState?.originatingSitioId ?? null,
        activeChildTab: state.turnoState?.activeChildTab || 'sitios',
        isCreating: isCreatingTurno,
        prefillCertId: state.turnoState?.prefillCertId ?? null,
        prefillSitioId: state.turnoState?.prefillSitioId ?? null,
        isEditingAttributes:
          !isHistoricalCertVersion && Boolean(state.turnoState?.isEditingAttributes),
        formDraft: state.turnoState?.formDraft,
        editFormData: state.turnoState?.editFormData,
        editErrorMessage: state.turnoState?.editErrorMessage ?? null,
        archiveConfirmOpen:
          !isHistoricalCertVersion && Boolean(state.turnoState?.archiveConfirmOpen),
        archiveErrorMessage: state.turnoState?.archiveErrorMessage ?? null,
        childSortState: state.turnoState?.childSortState,
      };

      contentHtml = renderTurnoView({
        profile,
        state: turnoViewState,
        turno: isCreatingTurno ? null : resolvedTurno,
        availableSites,
        activeCertId: activeContextCertId,
        activeCertVersionId,
        isHistoricalCertVersion,
        certificates: certList,
        authorizedClientOrgIds: state.authorizedClientOrgIds,
        tableColumnWidths: state.tableColumnWidths,
      });
    } else if (isCreatingProceso || resolvedProceso) {
      const procesoViewState: ProcesoViewState = {
        selectedProcesoId: resolvedProceso?.id || selectedProcesoId,
        activeChildTab: state.procesoState?.activeChildTab || 'requisitos',
        isCreating: isCreatingProceso,
        prefillCertId: state.procesoState?.prefillCertId ?? null,
        isEditingAttributes:
          !isHistoricalCertVersion && Boolean(state.procesoState?.isEditingAttributes),
        formDraft: state.procesoState?.formDraft,
        editFormData: state.procesoState?.editFormData,
        editErrorMessage: state.procesoState?.editErrorMessage ?? null,
        archiveConfirmOpen:
          !isHistoricalCertVersion && Boolean(state.procesoState?.archiveConfirmOpen),
        archiveErrorMessage: state.procesoState?.archiveErrorMessage ?? null,
        isAssigningRequisito:
          !isHistoricalCertVersion && Boolean(state.procesoState?.isAssigningRequisito),
        batchFilterQuery: state.procesoState?.batchFilterQuery ?? '',
        batchMode: state.procesoState?.batchMode ?? 'mandatory',
        selectedBatchRequisitoIds: state.procesoState?.selectedBatchRequisitoIds ?? [],
        expandedBatchClauseIds: state.procesoState?.expandedBatchClauseIds,
        searchExpandedBatchClauseIds: state.procesoState?.searchExpandedBatchClauseIds,
        childSortState: state.procesoState?.childSortState,
      };

      contentHtml = renderProcesoView({
        profile,
        state: procesoViewState,
        proceso: isCreatingProceso ? null : resolvedProceso,
        activeCertId: activeContextCertId,
        activeCertVersionId,
        isHistoricalCertVersion,
        certificates: certList,
        authorizedClientOrgIds: state.authorizedClientOrgIds,
        programacionAudits: state.programacionAudits || [],
        phase5Findings: state.phase5Findings || INITIAL_PHASE5_FINDINGS,
        requirementsCatalog: state.requirementsCatalog || getAllSeededNormaRequirements(),
        archivedNoAplicableIds: state.archivedNoAplicableIds,
        archivedProcesoIds: state.archivedProcesoIds,
        tableColumnWidths: state.tableColumnWidths,
      });
    } else if (isCreatingSitio || resolvedSitio) {
      const siblingSites = certList.flatMap((c) =>
        c.sitios
          .filter((s) => !state.archivedSiteIds?.has(s.id))
          .map((s) => ({
            id: s.id,
            id_certificado: c.id,
            numero_sitio: s.numero_sitio,
            deleted_at: null,
          }))
      );

      const sitioViewState: SitioViewState = {
        selectedSitioId: resolvedSitio?.id || selectedSitioId,
        activeChildTab: state.sitioState?.activeChildTab || 'turnos',
        isCreating: isCreatingSitio,
        prefillCertId: state.sitioState?.prefillCertId ?? null,
        isEditingAttributes:
          !isHistoricalCertVersion && Boolean(state.sitioState?.isEditingAttributes),
        formDraft: state.sitioState?.formDraft,
        editFormData: state.sitioState?.editFormData,
        editErrorMessage: state.sitioState?.editErrorMessage ?? null,
        archiveConfirmOpen:
          !isHistoricalCertVersion && Boolean(state.sitioState?.archiveConfirmOpen),
        archiveErrorMessage: state.sitioState?.archiveErrorMessage ?? null,
        isAssigningShift:
          !isHistoricalCertVersion && Boolean(state.sitioState?.isAssigningShift),
        isAssigningProceso: isHistoricalCertVersion
          ? false
          : state.sitioState?.isAssigningProceso,
        childSortState: state.sitioState?.childSortState,
      };

      contentHtml = renderSitioView({
        profile,
        state: sitioViewState,
        sitio: isCreatingSitio ? null : resolvedSitio,
        activeCertId: activeContextCertId,
        activeCertVersionId,
        isHistoricalCertVersion,
        certificates: certList,
        authorizedClientOrgIds: state.authorizedClientOrgIds,
        programacionAudits: state.programacionAudits || [],
        archivedProcesoIds: state.archivedProcesoIds,
        siblingSites,
        shiftCatalog: state.shiftCatalog || INITIAL_TURNO_CATALOG,
        tableColumnWidths: state.tableColumnWidths,
      });
    } else {
      const orgList: OrganizacionEntity[] =
        state.allOrganizaciones !== undefined
          ? state.allOrganizaciones
          : INITIAL_ORGANIZACIONES;

      contentHtml = renderCertificadoView({
        profile,
        state: certState,
        certificates: rawCertList,
        organizaciones: orgList,
        conglomerados: state.allConglomerados,
        authorizedClientOrgIds: state.authorizedClientOrgIds,
        normas: state.standardsCatalog ? [...state.standardsCatalog] : undefined,
        estatusList: state.estatusCatalog ? [...state.estatusCatalog] : undefined,
        sectores: state.iafSectors ? [...state.iafSectors] : undefined,
        subsectores: state.iafSubsectors,
        requirementsCatalog: state.requirementsCatalog || getAllSeededNormaRequirements(),
        archivedProcesoIds: state.archivedProcesoIds,
        archivedNoAplicableIds: state.archivedNoAplicableIds,
        loading: state.loading,
        archiveConfig: state.archiveConfig,
        columnWidths: state.tableColumnWidths?.['certificados-main'],
        tableColumnWidths: state.tableColumnWidths,
      });
    }
  }

  return `
    <main class="flex-1 ${APP_SHELL_CONTAINER_CLASS} pt-1.5 pb-8 space-y-4">
      ${contentHtml}
    </main>
  `;
}
