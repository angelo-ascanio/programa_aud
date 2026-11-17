import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/accessControl';
import { APP_SHELL_CONTAINER_CLASS } from '../lib/layout';
import type {
  CertificateRecord,
  SearchControlsFilterState,
} from '../lib/searchControls';
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
  type CertificadoSummary,
  type ClientOrganizationAccessEntity,
} from '../lib/activeCertificates';
import {
  renderCertificadoView,
  type CertificadoViewState,
} from './certificadoView';
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
  rif: string;
  direccion_fiscal?: string;
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
}

export function renderCertificacionView(
  profile: UserProfile,
  state: CertificacionViewState
): string {
  const activeSub = state.activeSubSection || 'certificates';

  let contentHtml = '';

  if (activeSub === 'organizations') {
    const orgList: OrganizacionEntity[] =
      state.allOrganizaciones !== undefined
        ? state.allOrganizaciones
        : INITIAL_ORGANIZACIONES;

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
        query: state.organizacionState?.query || '',
        hasActiveCertificates: state.organizacionState?.hasActiveCertificates || 'ALL',
        selectedSectorIaf: state.organizacionState?.selectedSectorIaf || 'ALL',
        viewMode: state.organizacionState?.viewMode || 'grid',
        sortColumn: state.organizacionState?.sortColumn || null,
        sortDirection: state.organizacionState?.sortDirection || 'none',
        isEditingAttributes: Boolean(state.organizacionState?.isEditingAttributes),
        activeChildTab: state.organizacionState?.activeChildTab || 'certificados',
        formDraft: state.organizacionState?.formDraft,
        editFormData: state.organizacionState?.editFormData,
        editErrorMessage: state.organizacionState?.editErrorMessage ?? null,
        isSidebarOpen: state.organizacionState?.isSidebarOpen ?? true,
        facetSelections: state.organizacionState?.facetSelections,
        isCreating: Boolean(state.organizacionState?.isCreating),
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
        certificados: certSummaries,
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
      });
    }
  } else {
    // certificates (and graceful fallback for retired 'sites'/'processes'/'shifts'/'drilldown' subviews)
    const certState: CertificadoViewState = {
      selectedCertId: state.certificadoState?.selectedCertId || null,
      activeChildTab: state.certificadoState?.activeChildTab || 'sitios',
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
    };

    const certList: CertificadoDetailEntity[] =
      state.allCertificadosDetailed !== undefined
        ? state.allCertificadosDetailed
        : INITIAL_CERTIFICADOS_DETAILED;

    const isStaff = isApprovedStaffProfile(profile);

    const selectedTelefonoId = state.telefonoState?.selectedTelefonoId || null;
    const isCreatingTelefono = Boolean(state.telefonoState?.isCreating) && isStaff;
    const resolvedTelefono = selectedTelefonoId
      ? resolveTelefonoDetailById({
          telefonoId: selectedTelefonoId,
          certificates: certList,
          archivedContactoIds: state.archivedContactoIds,
          archivedTelefonoIds: state.archivedTelefonoIds,
        })
      : null;

    const selectedEmailId = state.emailState?.selectedEmailId || null;
    const isCreatingEmail = Boolean(state.emailState?.isCreating) && isStaff;
    const resolvedEmail = selectedEmailId
      ? resolveEmailDetailById({
          emailId: selectedEmailId,
          certificates: certList,
          archivedContactoIds: state.archivedContactoIds,
          archivedEmailIds: state.archivedEmailIds,
        })
      : null;

    const selectedContactoId = state.contactoState?.selectedContactoId || null;
    const isCreatingContacto = Boolean(state.contactoState?.isCreating) && isStaff;
    const resolvedContacto = selectedContactoId
      ? resolveContactoDetailById({
          contactoId: selectedContactoId,
          certificates: certList,
          archivedContactoIds: state.archivedContactoIds,
          archivedTelefonoIds: state.archivedTelefonoIds,
          archivedEmailIds: state.archivedEmailIds,
        })
      : null;

    const selectedFechaId = state.fechaState?.selectedFechaId || null;
    const isCreatingFecha = Boolean(state.fechaState?.isCreating) && isStaff;
    const resolvedFecha = selectedFechaId
      ? resolveFechaDetailById({
          fechaId: selectedFechaId,
          certificates: certList,
          archivedFechaIds: state.archivedFechaIds,
        })
      : null;

    const selectedNoAplicableId = state.noAplicableState?.selectedNoAplicableId || null;
    const isCreatingNoAplicable = Boolean(state.noAplicableState?.isCreating) && isStaff;
    const resolvedNoAplicable = selectedNoAplicableId
      ? resolveNoAplicableDetailById({
          noAplicableId: selectedNoAplicableId,
          certificates: certList,
          requirementsCatalog: state.requirementsCatalog || getAllSeededNormaRequirements(),
          archivedNoAplicableIds: state.archivedNoAplicableIds,
        })
      : null;

    const selectedTurnoId = state.turnoState?.selectedTurnoId || null;
    const isCreatingTurno = Boolean(state.turnoState?.isCreating) && isStaff;
    const resolvedTurno = selectedTurnoId
      ? resolveTurnoDetailById({
          turnoId: selectedTurnoId,
          originatingSitioId: state.turnoState?.originatingSitioId ?? null,
          certificates: certList,
          programacionAudits: state.programacionAudits || [],
          shiftCatalog: state.shiftCatalog || INITIAL_TURNO_CATALOG,
          archivedSiteIds: state.archivedSiteIds,
          archivedTurnoIds: state.archivedTurnoIds,
        })
      : null;

    const selectedProcesoId = state.procesoState?.selectedProcesoId || null;
    const isCreatingProceso = Boolean(state.procesoState?.isCreating) && isStaff;
    const resolvedProceso = selectedProcesoId
      ? resolveProcesoDetailById({
          procesoId: selectedProcesoId,
          certificates: certList,
          programacionAudits: state.programacionAudits || [],
          phase5Findings: state.phase5Findings || INITIAL_PHASE5_FINDINGS,
          requirementsCatalog: state.requirementsCatalog || getAllSeededNormaRequirements(),
          archivedProcesoIds: state.archivedProcesoIds,
        })
      : null;

    const selectedSitioId = state.sitioState?.selectedSitioId || null;
    const isCreatingSitio = Boolean(state.sitioState?.isCreating) && isStaff;
    const resolvedSitio = selectedSitioId
      ? resolveSitioDetailById({
          sitioId: selectedSitioId,
          certificates: certList,
          programacionAudits: state.programacionAudits || [],
          shiftCatalog: state.shiftCatalog || INITIAL_TURNO_CATALOG,
          archivedSiteIds: state.archivedSiteIds,
        })
      : null;

    if (isCreatingTelefono || resolvedTelefono) {
      const telefonoViewState: TelefonoViewState = {
        selectedTelefonoId: resolvedTelefono?.id || selectedTelefonoId,
        originatingContactoId: state.telefonoState?.originatingContactoId ?? null,
        isCreating: isCreatingTelefono,
        isEditingAttributes: Boolean(state.telefonoState?.isEditingAttributes),
        formDraft: state.telefonoState?.formDraft,
        editFormData: state.telefonoState?.editFormData,
        editErrorMessage: state.telefonoState?.editErrorMessage ?? null,
      };

      contentHtml = renderTelefonoView({
        profile,
        state: telefonoViewState,
        telefono: isCreatingTelefono ? null : resolvedTelefono,
        certificates: certList,
        archivedContactoIds: state.archivedContactoIds,
      });
    } else if (isCreatingEmail || resolvedEmail) {
      const emailViewState: EmailViewState = {
        selectedEmailId: resolvedEmail?.id || selectedEmailId,
        originatingContactoId: state.emailState?.originatingContactoId ?? null,
        isCreating: isCreatingEmail,
        isEditingAttributes: Boolean(state.emailState?.isEditingAttributes),
        formDraft: state.emailState?.formDraft,
        editFormData: state.emailState?.editFormData,
        editErrorMessage: state.emailState?.editErrorMessage ?? null,
      };

      contentHtml = renderEmailView({
        profile,
        state: emailViewState,
        email: isCreatingEmail ? null : resolvedEmail,
        certificates: certList,
        archivedContactoIds: state.archivedContactoIds,
      });
    } else if (isCreatingContacto || resolvedContacto) {
      const contactoViewState: ContactoViewState = {
        selectedContactoId: resolvedContacto?.id || selectedContactoId,
        originatingCertId: state.contactoState?.originatingCertId ?? null,
        activeChildTab: state.contactoState?.activeChildTab || 'telefonos',
        isCreating: isCreatingContacto,
        isEditingAttributes: Boolean(state.contactoState?.isEditingAttributes),
        formDraft: state.contactoState?.formDraft,
        editFormData: state.contactoState?.editFormData,
        editErrorMessage: state.contactoState?.editErrorMessage ?? null,
        childSortState: state.contactoState?.childSortState,
      };

      contentHtml = renderContactoView({
        profile,
        state: contactoViewState,
        contacto: isCreatingContacto ? null : resolvedContacto,
        certificates: certList,
        tableColumnWidths: state.tableColumnWidths,
      });
    } else if (isCreatingFecha || resolvedFecha) {
      const fechaViewState: FechaViewState = {
        selectedFechaId: resolvedFecha?.id || selectedFechaId,
        originatingCertId: state.fechaState?.originatingCertId ?? null,
        isCreating: isCreatingFecha,
        isEditingAttributes: Boolean(state.fechaState?.isEditingAttributes),
        formDraft: state.fechaState?.formDraft,
        editFormData: state.fechaState?.editFormData,
        editErrorMessage: state.fechaState?.editErrorMessage ?? null,
      };

      contentHtml = renderFechaView({
        profile,
        state: fechaViewState,
        fecha: isCreatingFecha ? null : resolvedFecha,
        certificates: certList,
      });
    } else if (isCreatingNoAplicable || resolvedNoAplicable) {
      const noAplicableViewState: NoAplicableViewState = {
        selectedNoAplicableId: resolvedNoAplicable?.id || selectedNoAplicableId,
        originatingCertId: state.noAplicableState?.originatingCertId ?? null,
        isCreating: isCreatingNoAplicable,
        isEditingAttributes: Boolean(state.noAplicableState?.isEditingAttributes),
        formDraft: state.noAplicableState?.formDraft,
        editErrorMessage: state.noAplicableState?.editErrorMessage ?? null,
        archiveConfirmOpen: Boolean(state.noAplicableState?.archiveConfirmOpen),
        archiveErrorMessage: state.noAplicableState?.archiveErrorMessage ?? null,
      };

      contentHtml = renderNoAplicableView({
        profile,
        state: noAplicableViewState,
        noAplicable: isCreatingNoAplicable ? null : resolvedNoAplicable,
        certificates: certList,
        requirementsCatalog: state.requirementsCatalog || getAllSeededNormaRequirements(),
        archivedNoAplicableIds: state.archivedNoAplicableIds,
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
        isEditingAttributes: Boolean(state.turnoState?.isEditingAttributes),
        formDraft: state.turnoState?.formDraft,
        editFormData: state.turnoState?.editFormData,
        editErrorMessage: state.turnoState?.editErrorMessage ?? null,
        archiveConfirmOpen: Boolean(state.turnoState?.archiveConfirmOpen),
        archiveErrorMessage: state.turnoState?.archiveErrorMessage ?? null,
        childSortState: state.turnoState?.childSortState,
      };

      contentHtml = renderTurnoView({
        profile,
        state: turnoViewState,
        turno: isCreatingTurno ? null : resolvedTurno,
        availableSites,
        tableColumnWidths: state.tableColumnWidths,
      });
    } else if (isCreatingProceso || resolvedProceso) {
      const procesoViewState: ProcesoViewState = {
        selectedProcesoId: resolvedProceso?.id || selectedProcesoId,
        activeChildTab: state.procesoState?.activeChildTab || 'requisitos',
        isCreating: isCreatingProceso,
        prefillCertId: state.procesoState?.prefillCertId ?? null,
        isEditingAttributes: Boolean(state.procesoState?.isEditingAttributes),
        formDraft: state.procesoState?.formDraft,
        editFormData: state.procesoState?.editFormData,
        editErrorMessage: state.procesoState?.editErrorMessage ?? null,
        archiveConfirmOpen: Boolean(state.procesoState?.archiveConfirmOpen),
        archiveErrorMessage: state.procesoState?.archiveErrorMessage ?? null,
        isAssigningRequisito: Boolean(state.procesoState?.isAssigningRequisito),
        childSortState: state.procesoState?.childSortState,
      };

      contentHtml = renderProcesoView({
        profile,
        state: procesoViewState,
        proceso: isCreatingProceso ? null : resolvedProceso,
        certificates: certList,
        requirementsCatalog: state.requirementsCatalog || getAllSeededNormaRequirements(),
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
        isEditingAttributes: Boolean(state.sitioState?.isEditingAttributes),
        formDraft: state.sitioState?.formDraft,
        editFormData: state.sitioState?.editFormData,
        editErrorMessage: state.sitioState?.editErrorMessage ?? null,
        archiveConfirmOpen: Boolean(state.sitioState?.archiveConfirmOpen),
        archiveErrorMessage: state.sitioState?.archiveErrorMessage ?? null,
        isAssigningShift: Boolean(state.sitioState?.isAssigningShift),
        childSortState: state.sitioState?.childSortState,
      };

      contentHtml = renderSitioView({
        profile,
        state: sitioViewState,
        sitio: isCreatingSitio ? null : resolvedSitio,
        certificates: certList,
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
        certificates: certList,
        organizaciones: orgList,
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
