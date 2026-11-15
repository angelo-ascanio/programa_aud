import type { UserProfile } from '../lib/healthCheck';
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
  INITIAL_ORGANIZACIONES,
  type OrganizacionEntity,
  type CertificadoSummary,
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
import { renderTurnoView, type TurnoViewState } from './turnoView';
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
  certificadoState?: Partial<CertificadoViewState>;
  allCertificadosDetailed?: CertificadoDetailEntity[];
  auditorState?: Partial<AuditorViewState>;
  allAuditorsDetailed?: AuditorDetailEntity[];
  programacionAudits?: ProgramacionAuditEntity[];
  sitioState?: Partial<SitioViewState>;
  procesoState?: Partial<ProcesoViewState>;
  turnoState?: Partial<TurnoViewState>;
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
      editFormData: state.organizacionState?.editFormData,
      editErrorMessage: state.organizacionState?.editErrorMessage,
      saveSuccessMessage: state.organizacionState?.saveSuccessMessage,
      isSidebarOpen: state.organizacionState?.isSidebarOpen ?? true,
      facetSelections: state.organizacionState?.facetSelections,
      isCreating: Boolean(state.organizacionState?.isCreating),
      createErrorMessage: state.organizacionState?.createErrorMessage,
    };

    const orgList: OrganizacionEntity[] =
      state.allOrganizaciones !== undefined
        ? state.allOrganizaciones
        : INITIAL_ORGANIZACIONES;

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
      loading: state.loading,
      archiveConfig: state.archiveConfig,
    });
  } else if (activeSub === 'auditors') {
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
      editFormData: state.auditorState?.editFormData,
      editErrorMessage: state.auditorState?.editErrorMessage,
      saveSuccessMessage: state.auditorState?.saveSuccessMessage,
      isAddCompetencyModalOpen: Boolean(state.auditorState?.isAddCompetencyModalOpen),
      isSidebarOpen: state.auditorState?.isSidebarOpen ?? true,
      facetSelections: state.auditorState?.facetSelections,
      isCreating: Boolean(state.auditorState?.isCreating),
      createErrorMessage: state.auditorState?.createErrorMessage,
    };

    const audList: AuditorDetailEntity[] =
      state.allAuditorsDetailed !== undefined
        ? state.allAuditorsDetailed
        : INITIAL_AUDITORES_DETAILED;

    contentHtml = renderAuditorView({
      profile,
      state: audState,
      auditors: audList,
      loading: state.loading,
      archiveConfig: state.archiveConfig,
    });
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
      saveSuccessMessage: state.certificadoState?.saveSuccessMessage,
      originatingOrganizacionId: state.certificadoState?.originatingOrganizacionId || null,
      isSidebarOpen: state.certificadoState?.isSidebarOpen ?? true,
      facetSelections: state.certificadoState?.facetSelections,
      isCreating: Boolean(state.certificadoState?.isCreating),
      createErrorMessage: state.certificadoState?.createErrorMessage,
      isCreatingFecha: Boolean(state.certificadoState?.isCreatingFecha),
      fechaErrorMessage: state.certificadoState?.fechaErrorMessage,
      isCreatingContacto: Boolean(state.certificadoState?.isCreatingContacto),
      contactoErrorMessage: state.certificadoState?.contactoErrorMessage,
      previewFechaId: state.certificadoState?.previewFechaId ?? null,
      previewContactoId: state.certificadoState?.previewContactoId ?? null,
    };

    const certList: CertificadoDetailEntity[] =
      state.allCertificadosDetailed !== undefined
        ? state.allCertificadosDetailed
        : INITIAL_CERTIFICADOS_DETAILED;

    const selectedTelefonoId = state.telefonoState?.selectedTelefonoId || null;
    const resolvedTelefono = selectedTelefonoId
      ? resolveTelefonoDetailById({
          telefonoId: selectedTelefonoId,
          certificates: certList,
          archivedContactoIds: state.archivedContactoIds,
          archivedTelefonoIds: state.archivedTelefonoIds,
        })
      : null;

    const selectedEmailId = state.emailState?.selectedEmailId || null;
    const resolvedEmail = selectedEmailId
      ? resolveEmailDetailById({
          emailId: selectedEmailId,
          certificates: certList,
          archivedContactoIds: state.archivedContactoIds,
          archivedEmailIds: state.archivedEmailIds,
        })
      : null;

    const selectedContactoId = state.contactoState?.selectedContactoId || null;
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
    const resolvedFecha = selectedFechaId
      ? resolveFechaDetailById({
          fechaId: selectedFechaId,
          certificates: certList,
          archivedFechaIds: state.archivedFechaIds,
        })
      : null;

    const selectedTurnoId = state.turnoState?.selectedTurnoId || null;
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
    const resolvedSitio = selectedSitioId
      ? resolveSitioDetailById({
          sitioId: selectedSitioId,
          certificates: certList,
          programacionAudits: state.programacionAudits || [],
          shiftCatalog: state.shiftCatalog || INITIAL_TURNO_CATALOG,
          archivedSiteIds: state.archivedSiteIds,
        })
      : null;

    if (resolvedTelefono) {
      const telefonoViewState: TelefonoViewState = {
        selectedTelefonoId,
        isEditingAttributes: Boolean(state.telefonoState?.isEditingAttributes),
        editFormData: state.telefonoState?.editFormData,
        editErrorMessage: state.telefonoState?.editErrorMessage ?? null,
        saveSuccessMessage: state.telefonoState?.saveSuccessMessage ?? null,
      };

      contentHtml = renderTelefonoView({
        profile,
        state: telefonoViewState,
        telefono: resolvedTelefono,
      });
    } else if (resolvedEmail) {
      const emailViewState: EmailViewState = {
        selectedEmailId,
        isEditingAttributes: Boolean(state.emailState?.isEditingAttributes),
        editFormData: state.emailState?.editFormData,
        editErrorMessage: state.emailState?.editErrorMessage ?? null,
        saveSuccessMessage: state.emailState?.saveSuccessMessage ?? null,
      };

      contentHtml = renderEmailView({
        profile,
        state: emailViewState,
        email: resolvedEmail,
      });
    } else if (resolvedContacto) {
      const contactoViewState: ContactoViewState = {
        selectedContactoId,
        activeChildTab: state.contactoState?.activeChildTab || 'telefonos',
        isEditingAttributes: Boolean(state.contactoState?.isEditingAttributes),
        editFormData: state.contactoState?.editFormData,
        editErrorMessage: state.contactoState?.editErrorMessage ?? null,
        saveSuccessMessage: state.contactoState?.saveSuccessMessage ?? null,
        isCreatingTelefono: Boolean(state.contactoState?.isCreatingTelefono),
        telefonoCreateError: state.contactoState?.telefonoCreateError ?? null,
        isCreatingEmail: Boolean(state.contactoState?.isCreatingEmail),
        emailCreateError: state.contactoState?.emailCreateError ?? null,
        childSortState: state.contactoState?.childSortState,
      };

      contentHtml = renderContactoView({
        profile,
        state: contactoViewState,
        contacto: resolvedContacto,
        tableColumnWidths: state.tableColumnWidths,
      });
    } else if (resolvedFecha) {
      const fechaViewState: FechaViewState = {
        selectedFechaId,
        isEditingAttributes: Boolean(state.fechaState?.isEditingAttributes),
        editFormData: state.fechaState?.editFormData,
        editErrorMessage: state.fechaState?.editErrorMessage ?? null,
        saveSuccessMessage: state.fechaState?.saveSuccessMessage ?? null,
      };

      contentHtml = renderFechaView({
        profile,
        state: fechaViewState,
        fecha: resolvedFecha,
      });
    } else if (resolvedTurno) {
      const turnoViewState: TurnoViewState = {
        selectedTurnoId,
        originatingSitioId: state.turnoState?.originatingSitioId ?? null,
        activeChildTab: state.turnoState?.activeChildTab || 'sitios',
        isEditingAttributes: Boolean(state.turnoState?.isEditingAttributes),
        editFormData: state.turnoState?.editFormData,
        editErrorMessage: state.turnoState?.editErrorMessage ?? null,
        saveSuccessMessage: state.turnoState?.saveSuccessMessage ?? null,
        archiveConfirmOpen: Boolean(state.turnoState?.archiveConfirmOpen),
        archiveErrorMessage: state.turnoState?.archiveErrorMessage ?? null,
      };

      contentHtml = renderTurnoView({
        profile,
        state: turnoViewState,
        turno: resolvedTurno,
      });
    } else if (resolvedProceso) {
      const procesoViewState: ProcesoViewState = {
        selectedProcesoId,
        activeChildTab: state.procesoState?.activeChildTab || 'requisitos',
        isEditingAttributes: Boolean(state.procesoState?.isEditingAttributes),
        editFormData: state.procesoState?.editFormData,
        editErrorMessage: state.procesoState?.editErrorMessage ?? null,
        saveSuccessMessage: state.procesoState?.saveSuccessMessage ?? null,
        archiveConfirmOpen: Boolean(state.procesoState?.archiveConfirmOpen),
        archiveErrorMessage: state.procesoState?.archiveErrorMessage ?? null,
        isAssigningRequisito: Boolean(state.procesoState?.isAssigningRequisito),
        requisitoActionMessage: state.procesoState?.requisitoActionMessage ?? null,
      };

      contentHtml = renderProcesoView({
        profile,
        state: procesoViewState,
        proceso: resolvedProceso,
        requirementsCatalog: state.requirementsCatalog || getAllSeededNormaRequirements(),
      });
    } else if (resolvedSitio) {
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
        selectedSitioId,
        activeChildTab: state.sitioState?.activeChildTab || 'turnos',
        isEditingAttributes: Boolean(state.sitioState?.isEditingAttributes),
        editFormData: state.sitioState?.editFormData,
        editErrorMessage: state.sitioState?.editErrorMessage ?? null,
        saveSuccessMessage: state.sitioState?.saveSuccessMessage ?? null,
        archiveConfirmOpen: Boolean(state.sitioState?.archiveConfirmOpen),
        archiveErrorMessage: state.sitioState?.archiveErrorMessage ?? null,
        isAssigningShift: Boolean(state.sitioState?.isAssigningShift),
        shiftActionMessage: state.sitioState?.shiftActionMessage ?? null,
      };

      contentHtml = renderSitioView({
        profile,
        state: sitioViewState,
        sitio: resolvedSitio,
        siblingSites,
        shiftCatalog: state.shiftCatalog || INITIAL_TURNO_CATALOG,
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
