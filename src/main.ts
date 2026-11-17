import './index.css';
import type { User } from '@supabase/supabase-js';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './lib/supabase';
import {
  buildSelfProfileUpdatePayload,
  canAccessRoute,
  canModifyProfileRole,
  evaluateAdminAccess,
  formatResetSummary,
  shouldUpdateProfileRole,
  TEST_ACCOUNTS,
  translateDatabaseError,
  validatePasswordChangeInput,
  type ActiveRoute,
  type DomainRoute,
  type HealthCheckItem,
  type ProfileFilter,
  type UserProfile,
  type UserRole,
  type UserStatus,
} from './lib/healthCheck';
import { APP_SHELL_CONTAINER_CLASS } from './lib/layout';
import { escapeHtml } from './lib/html';
import { isValidUuid } from './lib/zeroUuid';
import { renderHeader, type HeaderDropdownId } from './views/header';
import { renderAuthView, type AuthViewState } from './views/authView';
import { renderDashboardView } from './views/dashboardView';
import {
  renderProfileView,
  type ClientOrgAccessSummary,
  type ProfileFormState,
} from './views/profileView';
import { renderApprovalsView } from './views/approvalsView';
import { renderDatabaseStatusView } from './views/databaseStatusView';
import {
  renderAuditoriasView,
  type AuditRecord,
  type AuditorRecord,
} from './views/auditoriasView';
import {
  renderCertificacionView,
  type OrganizationRecord,
  type SiteRecord,
  type ProcessRecord,
  type ShiftRecord,
} from './views/certificacionView';
import type {
  OrganizacionChildTab,
  OrganizacionViewState,
} from './views/organizacionView';
import type { ClientAccessViewState } from './views/clientAccessView';
import type {
  CompetenciaAuditorViewState,
  SelectedCompetenciaAuditor,
} from './views/competenciaAuditorView';
import {
  renderExtraView,
  type StandardRecord,
  type RequirementRecord,
  type IafRecord,
  type CatalogItem,
} from './views/extraView';
import { renderNormaRequisitosTableSection } from './views/normaView';
import {
  renderFullNormaSearchSummaryText,
  renderNormativeObligationBadges,
  type RequisitoChildTab,
  type RequisitoReaderScope,
} from './views/requisitoView';
import {
  buildChildPlaceholderSuggestions,
  buildIsoNoteHtmlSnippet,
  buildSafeAnchorHtmlSnippet,
  buildSimpleTableHtmlSnippet,
  computeBilingualDraftStatus,
  countUnreferencedChildClauses,
  detectInlineBraceTrigger,
  hasEditorHtmlContent,
  insertTextAtCursor,
  normalizeEditorHtmlOutput,
  replaceInlineBraceTrigger,
  validateClausePlaceholderReferences,
  validateSafeHttpUrl,
  wrapSelectionWithTag,
  type ChildPlaceholderOption,
  type RichTextEditorLang,
  type RichTextEditorMode,
} from './lib/richTextEditor';
import {
  renderClauseAutocompleteMenu,
  renderClausePlaceholderPickerOptions,
} from './views/richTextEditor';
import type {
  AcreditacionChildTab,
  AcreditacionViewState,
} from './views/acreditacionView';
import type { SectorIafChildTab } from './views/sectorIafView';
import type {
  SubsectorIafChildTab,
  SubsectorIafViewState,
} from './views/subsectorIafView';
import type { SitioChildTab, SitioViewState } from './views/sitioView';
import type { ProcesoChildTab, ProcesoViewState } from './views/procesoView';
import type { TurnoChildTab, TurnoViewState } from './views/turnoView';
import type { FechaViewState } from './views/fechaView';
import type { ContactoChildTab, ContactoViewState } from './views/contactoView';
import type { TelefonoViewState } from './views/telefonoView';
import type { EmailViewState } from './views/emailView';
import {
  extractUniqueStandards,
  extractUniqueStatuses,
  filterCertificateRecords,
  getStoredViewMode,
  SAMPLE_CERTIFICATE_RECORDS,
  setStoredViewMode,
  type CertificateRecord,
  type CoverageBreakdown,
  type ViewMode,
} from './lib/searchControls';
import {
  INITIAL_FINDINGS,
  type FindingRecord,
  type FindingType,
} from './lib/auditDomain';
import {
  createNewCertificadoBreadcrumbSegment,
  createNewEntityBreadcrumbSegment,
  resetBreadcrumbToDomain,
  pushBreadcrumb,
  popToBreadcrumb,
  popToParentBreadcrumb,
  getDomainLabel,
  getSubviewLabel,
  type BreadcrumbEntityType,
  type BreadcrumbSegment,
} from './lib/breadcrumb';
import { renderBreadcrumbBar } from './views/breadcrumbView';
import { renderAuditLogModal } from './views/auditLogModal';
import { renderArchiveModal, renderArchiveToast } from './views/archiveModalView';
import {
  ARCHIVE_REASON_MAX_LENGTH,
  buildRestorePayload,
  buildSoftDeletePayload,
  canArchiveRecord,
  canInspectArchivedRecords,
  computeLocalArchiveDependencySummary,
  createInitialArchiveModalState,
  getArchiveTableDisplayLabel,
  mergeArchiveDependencySummaries,
  parseArchiveDependencySummary,
  sanitizeArchiveReason,
  type ArchivableTable,
  type ArchiveModalState,
  type ArchiveMultiViewConfig,
  type ArchiveToastState,
  type ArchivedItemEntry,
} from './lib/archiveGovernance';
import {
  SEEDED_ACTOR_DIRECTORY,
  type ActorDirectoryEntry,
  type AuditLogEntry,
} from './lib/auditLog';
import {
  canEditAuditScheduleOrTeam,
  canMutateAuditExecution,
  canViewAuditLogForEntity,
  computeDashboardSummaryMetrics,
  isApprovedStaffProfile,
  normalizeDomainSubview,
  scopeCertificateRecordsForProfile,
  scopeDetailedCertsForProfile,
  scopeLegacyAuditsForProfile,
  scopeLegacyFindingsForProfile,
  scopeOrganizacionEntitiesForProfile,
  scopeOrganizationsForProfile,
  scopePhase5FindingsForProfile,
  scopeProgramacionAuditsForProfile,
  scopeSitesOrProcessesForCertificates,
} from './lib/accessControl';
import {
  clearFacetSelections,
  cycleSortDirection,
  DEFAULT_MIN_COLUMN_WIDTH_PX,
  resizeAdjacentColumns,
  resolveColumnWidthPercentages,
  toggleFacetSelection,
  type MultiViewSelectionMap,
  type SortDirection,
  type SortState,
} from './lib/universalTemplate';
import {
  INITIAL_NORMAS,
  INITIAL_SECTORES_IAF,
  INITIAL_ESTATUS_CATALOG,
  INITIAL_TIPOS_AUDITORIA_CATALOG,
  INITIAL_METODOLOGIAS_CATALOG,
  INITIAL_ACREDITACIONES,
  INITIAL_SUBSECTORES_IAF,
  INITIAL_ORGANISMOS,
  INITIAL_REQUISITOS_LTREE,
  buildEstatusCatalogItem,
  buildMetodologiaAuditoriaCatalogItem,
  buildTipoAuditoriaCatalogItem,
  calculateLtreeIndentation,
  computeRequisitoLtreePath,
  createEmptyEstatusFormDraft,
  createEmptyMetodologiaFormDraft,
  createEmptyNormaFormDraft,
  createEmptyRequisitoFormDraft,
  createEmptySectorIafFormDraft,
  createEmptySubsectorIafFormDraft,
  createEmptyTipoFormDraft,
  createEstatusFormDraftFromEntity,
  createMetodologiaFormDraftFromEntity,
  createNormaDraftFromEntity,
  createRequisitoDraftFromEntity,
  createSectorIafDraftFromEntity,
  createSubsectorIafDraftFromEntity,
  createTipoFormDraftFromEntity,
  filterValidParentRequisitos,
  resolveSectorIafDescription,
  validateEstatusDraft,
  validateMetodologiaAuditoriaDraft,
  validateNormaDraft,
  validateRequisitoDraft,
  validateSectorIafDraft,
  validateSubsectorIafDraft,
  validateTipoAuditoriaDraft,
  type AcreditacionNormaIaf,
  type EstatusCatalogItem,
  type EstatusFormDraft,
  type MetodologiaAuditoriaCatalogItem,
  type MetodologiaAuditoriaFormDraft,
  type NormaEntity,
  type NormaFormDraft,
  type OrganismoAcreditacion,
  type RequisitoFormDraft,
  type RequisitoLtree,
  type RequisitoTranslationEntry,
  type SectorIafEntity,
  type SectorIafFormDraft,
  type SubsectorIafEntity,
  type SubsectorIafFormDraft,
  type SubsectorRiskCategory,
  type TipoAuditoriaCatalogItem,
  type TipoAuditoriaFormDraft,
} from './lib/extraDomain';
import {
  assembleHydratedNormasAndRequisitos,
  computeNormaClausulaCounts,
  extractPlainClauseDescription,
  fetchAllPagedRows,
  getBundledNormaCatalog,
  indexTranslationsByRequisitoId,
  normalizeObligatorioOrigen,
  type RawNormaRow,
  type RawRequisitoRow,
  type RawRequisitoTraduccionRow,
} from './lib/paginatedHydration';
import {
  renderNormaFullReaderBody,
} from './lib/normaFullReader';
import {
  buildInitialAcreditacionEntities,
  computeActiveCertificatesCountForAccreditation,
  createAcreditacionDraftFromEntity,
  createEmptyAcreditacionFormDraft,
  createEmptyOrganismoFormDraft,
  createOrganismoDraftFromEntity,
  enrichAcreditacionesWithImpact,
  mapSupabaseAcreditacionRows,
  toLegacyAcreditacionNormaIaf,
  validateAcreditacionDraft,
  validateOrganismoDraft,
  type AcreditacionDetailEntity,
  type AcreditacionFormDraft,
  type AcreditacionSectorLink,
  type CertificateCoverageInput,
  type OrganismoFormDraft,
  type SupabaseAcreditacionJoinRow,
} from './lib/acreditacionDomain';
import {
  INITIAL_ORGANIZACIONES,
  createClientAccessDraftFromEntity,
  createEmptyClientAccessFormDraft,
  createEmptyOrganizacionFormDraft,
  createOrganizacionDraftFromEntity,
  validateClientAccessDraft,
  validateOrganizacionDraft,
  type ClientAccessEstado,
  type ClientAccessFormDraft,
  type ClientOrganizationAccessEntity,
  type OrganizacionEntity,
  type OrganizacionFormDraft,
} from './lib/activeCertificates';
import {
  INITIAL_CERTIFICADOS_DETAILED,
  createCertificadoFormDraftFromEntity,
  createEmptyCertificadoFormDraft,
  deriveCertificateVigenciaDates,
  filterSubsectoresBySectorIaf,
  reconcileSubsectorSelectionOnSectorChange,
  validateCertificadoFormDraft,
  type CertificadoDetailEntity,
  type CertificadoDetailMode,
  type CertificadoFormDraft,
  type CertificadoViewState,
  type CertificadoChildTab,
  type ContactoCertificadoEntity,
  type EmailContactoEntity,
  type FechaCertificadoEntity,
  type NonApplicableRequirementEntity,
  type ProcessEntity,
  type ProcesoTipo,
  type SiteEntity,
  type TelefonoContactoEntity,
} from './lib/multisiteSampling';
import {
  INITIAL_TURNO_CATALOG,
  canArchiveSitio,
  createEmptySitioFormDraft,
  createSitioFormDraftFromEntity,
  resolveSitioDetailById,
  suggestNextNumeroSitio,
  validateSitioFormDraft,
  validateSitioInput,
  type SitioFormDraft,
  type TurnoCatalogItem,
} from './lib/sitioDomain';
import {
  canArchiveProceso,
  canLinkRequisitoToProceso,
  createEmptyProcesoFormDraft,
  createProcesoFormDraftFromEntity,
  getAllSeededNormaRequirements,
  getScopedNormaRequirements,
  resolveProcesoDetailById,
  validateProcesoFormDraft,
  validateProcesoInput,
  type ProcesoFormDraft,
} from './lib/procesoDomain';
import {
  canArchiveTurno,
  createEmptyTurnoFormDraft,
  createTurnoFormDraftFromEntity,
  formatTurnoTime,
  resolveTurnoDetailById,
  validateTurnoFormDraft,
  validateTurnoInput,
  type TurnoFormDraft,
} from './lib/turnoDomain';
import {
  createEmptyNoAplicableFormDraft,
  createNoAplicableFormDraftFromEntity,
  reconcileNoAplicableDraftOnCertChange,
  resolveNoAplicableDetailById,
  validateNoAplicableDraft,
  type NoAplicableFormDraft,
  type NoAplicableViewState,
} from './lib/noAplicableDomain';
import {
  createContactoFormDraftFromEntity,
  createEmailFormDraftFromEntity,
  createEmptyContactoFormDraft,
  createEmptyEmailFormDraft,
  createEmptyFechaFormDraft,
  createEmptyTelefonoFormDraft,
  createFechaFormDraftFromEntity,
  createTelefonoFormDraftFromEntity,
  isMissingTableOrSchemaError,
  resolveContactoDetailById,
  resolveEmailDetailById,
  resolveFechaDetailById,
  resolveTelefonoDetailById,
  translateCertSubEntityDbError,
  validateContactoInput,
  validateEmailInput,
  validateFechaInput,
  validateTelefonoInput,
  type ContactoFormDraft,
  type EmailFormDraft,
  type FechaFormDraft,
  type TelefonoFormDraft,
} from './lib/certificadoSubEntities';
import {
  INITIAL_AUDITORES_DETAILED,
  addCompetenciaLinkToAuditor,
  applyCompetenciaSectorCascade,
  createAuditorDraftFromEntity,
  createEmptyAuditorFormDraft,
  createEmptyCompetenciaFormDraft,
  getCredentialValidityState,
  removeCompetenciaLinkFromAuditor,
  validateAuditorDraft,
  validateCompetenciaDraft,
  type AuditorDetailEntity,
  type AuditorFormDraft,
  type AuditorNormaLink,
  type AuditorSectorLink,
  type AuditorSubsectorLink,
  type AuditorSortColumn,
  type AuditorViewState,
  type AuditorChildTab,
  type CompetenciaAuditorFormDraft,
  type CompetenciaTipo,
} from './lib/competencyMatrix';
import {
  INITIAL_PROGRAMACION_AUDITS,
  INITIAL_PHASE5_FINDINGS,
  createSessionAuditLogEntry,
  evaluateIso17021Recommendation,
  validateFindingLifecycleUpdate,
  validatePhase5FindingInput,
  validateRecommendationSignature,
  type AuditMethodology,
  type AuditTeamRole,
  type CalendarioViewState,
  type CalendarDisplayMode,
  type FindingLifecycleStatus,
  type FindingsDisplayMode,
  type NormativeVerificationStatus,
  type Phase5FindingEntity,
  type ProgramacionAuditEntity,
  type ProgramacionChildTab,
  type ProgramacionViewState,
  type ResultadoViewState,
  type SiteEvaluationMode,
} from './lib/auditExecution';

interface AppState {
  booting: boolean;
  user: User | null;
  profile: UserProfile | null;
  authorizedClientOrgIds: string[];
  clientAccessRows: ClientOrgAccessSummary[];
  profileForm: ProfileFormState;
  activeRoute: ActiveRoute;
  activeSubSection: string | null;
  openMenu: HeaderDropdownId | null;
  breadcrumbs: BreadcrumbSegment[];
  auditLogModal: {
    isOpen: boolean;
    entityName: string;
    tableName: string;
    recordId: string;
    entries: AuditLogEntry[];
    actorDirectory?: Record<string, ActorDirectoryEntry>;
    loading: boolean;
    errorMessage: string | null;
  };
  archiveGovernance: {
    showArchived: boolean;
    modal: ArchiveModalState;
    toast: ArchiveToastState | null;
    restoringId: string | null;
    archivedRecordsByTable: Record<string, ArchivedItemEntry[]>;
    archivedSnapshotsByKey: Record<string, unknown>;
    archivedCatalogIds: Set<string>;
  };
  auth: AuthViewState;
  approvals: {
    profiles: UserProfile[];
    filter: ProfileFilter;
    loading: boolean;
    updatingId: string | null;
    errorMessage: string | null;
    successMessage: string | null;
  };
  dbCheck: {
    checks: HealthCheckItem[];
    running: boolean;
    lastCheckedAt: string | null;
  };
  exploration: {
    records: CertificateRecord[];
    loading: boolean;
    query: string;
    selectedStatus: string;
    selectedStandard: string;
    viewMode: ViewMode;
  };
  domainData: {
    audits: AuditRecord[];
    auditors: AuditorRecord[];
    organizations: OrganizationRecord[];
    sites: SiteRecord[];
    processes: ProcessRecord[];
    shifts: ShiftRecord[];
    standards: StandardRecord[];
    requirements: RequirementRecord[];
    iafSectors: IafRecord[];
    iafSubsectors: SubsectorIafEntity[];
    catalogs: CatalogItem[];
    findings: FindingRecord[];
    allOrganizaciones: OrganizacionEntity[];
    allClientAccesses: ClientOrganizationAccessEntity[];
    allCertificadosDetailed: CertificadoDetailEntity[];
    allAuditorsDetailed: AuditorDetailEntity[];
    allOrganismos: OrganismoAcreditacion[];
    allAcreditaciones: AcreditacionDetailEntity[];
    shiftCatalog: TurnoCatalogItem[];
    requirementsCatalog: RequisitoLtree[];
    estatusCatalog: EstatusCatalogItem[];
    tiposCatalog: TipoAuditoriaCatalogItem[];
    metodologiasCatalog: MetodologiaAuditoriaCatalogItem[];
    archivedSiteIds: Set<string>;
    archivedProcesoIds: Set<string>;
    archivedTurnoIds: Set<string>;
    archivedNoAplicableIds: Set<string>;
    archivedFechaIds: Set<string>;
    archivedContactoIds: Set<string>;
    archivedTelefonoIds: Set<string>;
    archivedEmailIds: Set<string>;
    programacionAudits: ProgramacionAuditEntity[];
    phase5Findings: Phase5FindingEntity[];
    sessionAuditLogs: AuditLogEntry[];
    loading: boolean;
  };
  auditPlanning: {
    isModalOpen: boolean;
  };
  tableColumnWidths: Record<string, Record<string, number>>;
  programacionDomain: ProgramacionViewState;
  calendarioDomain: CalendarioViewState;
  resultadoDomain: ResultadoViewState;
  organizacionDomain: OrganizacionViewState;
  clientAccessDomain: ClientAccessViewState;
  certificadoDomain: CertificadoViewState;
  sitioDomain: SitioViewState;
  procesoDomain: ProcesoViewState;
  turnoDomain: TurnoViewState;
  noAplicableDomain: NoAplicableViewState;
  fechaDomain: FechaViewState;
  contactoDomain: ContactoViewState;
  telefonoDomain: TelefonoViewState;
  emailDomain: EmailViewState;
  auditorDomain: AuditorViewState;
  competenciaAuditorDomain: CompetenciaAuditorViewState;
  extraDomain: {
    selectedNormaId: string | null;
    activeNormaTab: 'requisitos' | 'acreditacion' | 'certificados';
    normaSearchQuery: string;
    normaRequisitoQuery: string;
    normaFilterStatus: string;
    normaFilterScheme: string;
    normaViewMode: 'grid' | 'list';
    normaSortColumn: string | null;
    normaSortDirection: SortDirection;
    normaIsSidebarOpen: boolean;
    normaFacetSelections: MultiViewSelectionMap;
    isCreatingNorma: boolean;
    isEditingNorma: boolean;
    normaFormDraft?: NormaFormDraft;
    normaEditError: string | null;

    selectedRequisitoId: string | null;
    prefillRequisitoNormaId: string | null;
    prefillRequisitoPadreId: string | null;
    requisitoReaderScope: RequisitoReaderScope;
    requisitoFullNormaQuery: string;
    activeRequisitoTab: RequisitoChildTab;
    requisitoLangMode: 'es' | 'en' | 'both';
    requisitoContentCollapsed: boolean;
    requisitoEditorLang: RichTextEditorLang;
    requisitoEditorMode: RichTextEditorMode;
    requisitoEditorLinkPopoverOpen: boolean;
    requisitoEditorLinkUrl: string;
    requisitoEditorLinkLabel: string;
    requisitoEditorLinkError: string | null;
    requisitoEditorPickerOpen: boolean;
    requisitoEditorPickerQuery: string;
    isCreatingRequisito: boolean;
    isEditingRequisito: boolean;
    requisitoFormDraft?: RequisitoFormDraft;
    requisitoEditError: string | null;

    selectedSectorId: string | null;
    activeSectorTab: SectorIafChildTab;
    iafSearchQuery: string;
    iafFilterRisk: string;
    iafViewMode: 'grid' | 'list';
    iafSortColumn: string | null;
    iafSortDirection: SortDirection;
    iafIsSidebarOpen: boolean;
    iafFacetSelections: MultiViewSelectionMap;
    isCreatingSector: boolean;
    isEditingSector: boolean;
    sectorFormDraft?: SectorIafFormDraft;
    sectorEditError: string | null;

    selectedSubsectorId: string | null;
    prefillSubsectorSectorId: string | null;
    activeSubsectorTab: SubsectorIafChildTab;
    isCreatingSubsector: boolean;
    isEditingSubsector: boolean;
    subsectorFormDraft?: SubsectorIafFormDraft;
    subsectorEditError: string | null;

    selectedEstatusId: string | null;
    activeEstatusTab: 'reglas' | 'certificados' | 'auditorias';
    estatusSearchQuery: string;
    estatusViewMode: 'grid' | 'list';
    estatusSortColumn: string | null;
    estatusSortDirection: SortDirection;
    estatusIsSidebarOpen: boolean;
    estatusFacetSelections: MultiViewSelectionMap;
    isCreatingEstatus: boolean;
    isEditingEstatus: boolean;
    estatusFormDraft?: EstatusFormDraft;
    estatusEditError: string | null;

    selectedTipoId: string | null;
    tipoSearchQuery: string;
    tipoViewMode: 'grid' | 'list';
    tipoSortColumn: string | null;
    tipoSortDirection: SortDirection;
    tipoIsSidebarOpen: boolean;
    tipoFacetSelections: MultiViewSelectionMap;
    isCreatingTipo: boolean;
    isEditingTipo: boolean;
    tipoFormDraft?: TipoAuditoriaFormDraft;
    tipoEditError: string | null;

    selectedMetodologiaId: string | null;
    metodologiaSearchQuery: string;
    metodologiaViewMode: 'grid' | 'list';
    metodologiaSortColumn: string | null;
    metodologiaSortDirection: SortDirection;
    metodologiaIsSidebarOpen: boolean;
    metodologiaFacetSelections: MultiViewSelectionMap;
    isCreatingMetodologia: boolean;
    isEditingMetodologia: boolean;
    metodologiaFormDraft?: MetodologiaAuditoriaFormDraft;
    metodologiaEditError: string | null;

    selectedOrganismoId: string | null;
    activeOrganismoTab: 'acreditaciones';
    organismoSearchQuery: string;
    organismoViewMode: 'grid' | 'list';
    organismoSortColumn: string | null;
    organismoSortDirection: SortDirection;
    organismoIsSidebarOpen: boolean;
    organismoFacetSelections: MultiViewSelectionMap;
    isCreatingOrganismo: boolean;
    isEditingOrganismo: boolean;
    organismoFormDraft?: OrganismoFormDraft;
    organismoEditError: string | null;

    selectedAccreditationId: string | null;
    activeAccreditationTab: AcreditacionChildTab;
    accredSearchQuery: string;
    accredViewMode: 'grid' | 'list';
    accredSortColumn: string | null;
    accredSortDirection: SortDirection;
    accredIsSidebarOpen: boolean;
    accredFacetSelections: MultiViewSelectionMap;
    isCreatingAccreditation: boolean;
    isEditingAccreditation: boolean;
    accredFormDraft?: AcreditacionFormDraft;
    accredEditErrorMessage: string | null;
  };
}

function createInitialChecks(): HealthCheckItem[] {
  return [
    {
      id: 'connection',
      label: 'Connection & Login Service',
      description: 'Confirms the database server and sign-in service are reachable.',
      state: 'pending',
      detail: 'Waiting to check...',
    },
    {
      id: 'admin',
      label: 'Administrator Permissions',
      description: 'Confirms your admin account is active and authorized.',
      state: 'pending',
      detail: 'Waiting to check...',
    },
    {
      id: 'records',
      label: 'Core Business Records',
      description: 'Confirms organizations, certificates, audits, and findings can be read.',
      state: 'pending',
      detail: 'Waiting to check...',
    },
    {
      id: 'coverage',
      label: 'Standards & Coverage Engine',
      description: 'Runs the audit coverage check on a certificate.',
      state: 'pending',
      detail: 'Waiting to check...',
    },
    {
      id: 'governance',
      label: 'Change History & Client Access',
      description: 'Confirms activity logs and client organization requests are readable.',
      state: 'pending',
      detail: 'Waiting to check...',
    },
  ];
}

const INITIAL_AUDITS: AuditRecord[] = [
  {
    id: '80000000-0000-0000-0000-000000000001',
    numero_certificado: 'FN-QMS-2024-001',
    organizacion_nombre: 'Iberometal Componentes S.A.',
    tipo_auditoria: 'RECERTIFICACION',
    metodologia: 'PRESENCIAL',
    fecha_programacion: '2024-11-20',
    auditor_lider: 'Ing. Carlos Mendoza (Auditor Líder)',
    estatus: 'PLANIFICADA',
  },
];

const INITIAL_AUDITORS: AuditorRecord[] = [
  {
    id: '10000000-0000-0000-0000-000000000001',
    nombre: 'Ing. Carlos Mendoza',
    rol: 'Auditor Líder Certificado',
    normas: ['ISO 9001:2015', 'ISO 14001:2015'],
    sectores_iaf: [17, 28],
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    nombre: 'Auditor Técnico Evaluador',
    rol: 'Auditor Técnico Calificado',
    normas: ['ISO 9001:2015'],
    sectores_iaf: [17],
  },
];

const INITIAL_ORGANIZATIONS: OrganizationRecord[] = [
  {
    id: '30000000-0000-0000-0000-000000000001',
    nombre: 'Iberometal Componentes S.A.',
    rif: 'J-30492817-0',
    direccion_fiscal: 'Zona Industrial Carabobo, Valencia',
    certificados_count: 1,
  },
  {
    id: '30000000-0000-0000-0000-000000000002',
    nombre: 'CyberCloud Solutions S.L.',
    rif: 'J-40819234-5',
    direccion_fiscal: 'Torre David, Chacao, Caracas',
    certificados_count: 2,
  },
];

const INITIAL_SITES: SiteRecord[] = [
  {
    id: '50000000-0000-0000-0000-000000000001',
    numero_sitio: 1,
    nombre_sitio: 'Planta Valencia',
    direccion_sitio: 'Zona Industrial Carabobo, Valencia',
    numero_certificado: 'FN-QMS-2024-001',
    turnos_count: 2,
  },
];

const INITIAL_PROCESSES: ProcessRecord[] = [
  {
    id: '60000000-0000-0000-0000-000000000001',
    nombre_proceso: 'Troquelado y Fundición',
    numero_certificado: 'FN-QMS-2024-001',
    clausulas_cubiertas: ['4.1', '8.5'],
  },
];

const INITIAL_SHIFTS: ShiftRecord[] = [
  {
    id: '70000000-0000-0000-0000-000000000001',
    hora_entrada: '07:00:00',
    hora_salida: '15:00:00',
    descripcion: 'Turno Matutino Operativo',
    sitios_vinculados: ['Planta Valencia'],
  },
  {
    id: '70000000-0000-0000-0000-000000000002',
    hora_entrada: '15:00:00',
    hora_salida: '23:00:00',
    descripcion: 'Turno Vespertino / Nocturno',
    sitios_vinculados: ['Planta Valencia'],
  },
];

const INITIAL_STANDARDS: StandardRecord[] = [
  { id: 'e0000000-0000-0000-0000-000000009001', esquema: 'SGC - Calidad', norma: 'ISO 9001:2015', clausulas_count: 7 },
  { id: 'e0000000-0000-0000-0000-000000014001', esquema: 'SGA - Gestión Ambiental', norma: 'ISO 14001:2015', clausulas_count: 5 },
  { id: 'e0000000-0000-0000-0000-000000045001', esquema: 'SST - Seguridad y Salud Laboral', norma: 'ISO 45001:2018', clausulas_count: 11 },
  { id: 'e0000000-0000-0000-0000-000000027001', esquema: 'SGSI - Seguridad de la Información', norma: 'ISO/IEC 27001:2022', clausulas_count: 9 },
];

const INITIAL_REQUIREMENTS: RequirementRecord[] = [
  { id: 'f0000000-0000-0000-0000-000000000004', codigo: '4', ruta_materializada: '4', norma: 'ISO 9001:2015' },
  { id: 'f0000000-0000-0000-0000-000000000041', codigo: '4.1', ruta_materializada: '4.4_1', norma: 'ISO 9001:2015' },
  { id: 'f0000000-0000-0000-0000-000000000042', codigo: '4.2', ruta_materializada: '4.4_2', norma: 'ISO 9001:2015' },
  { id: 'f0000000-0000-0000-0000-000000000005', codigo: '5', ruta_materializada: '5', norma: 'ISO 9001:2015' },
  { id: 'f0000000-0000-0000-0000-000000000051', codigo: '5.1', ruta_materializada: '5.5_1', norma: 'ISO 9001:2015' },
  { id: 'f0000000-0000-0000-0000-000000000008', codigo: '8', ruta_materializada: '8', norma: 'ISO 9001:2015' },
  { id: 'f0000000-0000-0000-0000-000000000085', codigo: '8.5', ruta_materializada: '8.8_5', norma: 'ISO 9001:2015' },
];

const INITIAL_IAF: IafRecord[] = [
  { id: 'd0000000-0000-0000-0000-000000000014', sector: 14, descripcion: 'Productos químicos, fibras sintéticas y farmacéuticos' },
  { id: 'd0000000-0000-0000-0000-000000000017', sector: 17, descripcion: 'Metales básicos y productos metálicos elaborados' },
  { id: 'd0000000-0000-0000-0000-000000000028', sector: 28, descripcion: 'Construcción e ingeniería civil' },
  { id: 'd0000000-0000-0000-0000-000000000033', sector: 33, descripcion: 'Tecnología de la información y comunicaciones' },
  { id: 'd0000000-0000-0000-0000-000000000035', sector: 35, descripcion: 'Otros servicios profesionales y de ensayo' },
];

const INITIAL_CATALOGS: CatalogItem[] = [
  { categoria: 'estatus', valor: 'ACTIVO' },
  { categoria: 'estatus', valor: 'EN_PROCESO' },
  { categoria: 'estatus', valor: 'SUSPENDIDO' },
  { categoria: 'estatus', valor: 'CANCELADO' },
  { categoria: 'estatus', valor: 'PLANIFICADA' },
  { categoria: 'tipo_auditoria', valor: 'ETAPA_1' },
  { categoria: 'tipo_auditoria', valor: 'ETAPA_2' },
  { categoria: 'tipo_auditoria', valor: 'VIGILANCIA_1' },
  { categoria: 'tipo_auditoria', valor: 'RECERTIFICACION' },
  { categoria: 'metodologia', valor: 'PRESENCIAL' },
  { categoria: 'metodologia', valor: 'REMOTA' },
  { categoria: 'metodologia', valor: 'HIBRIDA' },
];

function parseHashRoute(): { route: ActiveRoute; subview: string | null } {
  try {
    const raw = window.location.hash.replace(/^#\/?/, '').trim();
    if (!raw) return { route: 'dashboard', subview: null };
    const parts = raw.split('/');
    const firstRaw = (parts[0] || '').trim().toLowerCase();
    const second = parts[1] || null;

    if (firstRaw === 'drilldown') {
      return { route: 'certificacion', subview: 'certificates' };
    }

    if (firstRaw === 'auditorias' || firstRaw === 'certificacion' || firstRaw === 'extra') {
      const domain = firstRaw as DomainRoute;
      return { route: domain, subview: normalizeDomainSubview(domain, second) };
    }

    if (
      firstRaw === 'dashboard' ||
      firstRaw === 'profile' ||
      firstRaw === 'approvals' ||
      firstRaw === 'database'
    ) {
      return { route: firstRaw as ActiveRoute, subview: null };
    }
  } catch {
    // fallback
  }
  return { route: 'dashboard', subview: null };
}

function syncUrlHash(route: ActiveRoute, subview: string | null, replace = false): void {
  try {
    const target = subview ? `#/${route}/${subview}` : `#/${route}`;
    if (window.location.hash !== target) {
      if (replace) {
        window.history.replaceState(null, '', target);
      } else {
        window.history.pushState(null, '', target);
      }
    }
  } catch {
    // ignore
  }
}

let isSigningOut = false;
let activeSessionLoadKey: string | null = null;

const state: AppState = {
  booting: true,
  user: null,
  profile: null,
  authorizedClientOrgIds: [],
  clientAccessRows: [],
  profileForm: {
    nombreInput: '',
    savingProfile: false,
    profileFeedback: null,
    profileError: null,
    passwordSectionOpen: false,
    newPasswordInput: '',
    confirmPasswordInput: '',
    savingPassword: false,
    passwordFeedback: null,
    passwordError: null,
  },
  activeRoute: 'dashboard',
  activeSubSection: null,
  openMenu: null,
  breadcrumbs: resetBreadcrumbToDomain('dashboard'),
  auditLogModal: {
    isOpen: false,
    entityName: '',
    tableName: '',
    recordId: '',
    entries: [],
    actorDirectory: { ...SEEDED_ACTOR_DIRECTORY },
    loading: false,
    errorMessage: null,
  },
  auth: {
    mode: 'login',
    errorMessage: null,
    successMessage: null,
    submitting: false,
    quickLoginEmail: null,
    email: '',
    nombre: '',
    requestedRole: 'CLIENT',
    resetModalOpen: false,
    resettingDb: false,
    resetErrorMessage: null,
  },
  approvals: {
    profiles: [],
    filter: 'PENDING',
    loading: false,
    updatingId: null,
    errorMessage: null,
    successMessage: null,
  },
  dbCheck: {
    checks: createInitialChecks(),
    running: false,
    lastCheckedAt: null,
  },
  exploration: {
    records: [...SAMPLE_CERTIFICATE_RECORDS],
    loading: false,
    query: '',
    selectedStatus: 'ALL',
    selectedStandard: 'ALL',
    viewMode: getStoredViewMode('grid'),
  },
  domainData: {
    audits: [...INITIAL_AUDITS],
    auditors: [...INITIAL_AUDITORS],
    organizations: [...INITIAL_ORGANIZATIONS],
    sites: [...INITIAL_SITES],
    processes: [...INITIAL_PROCESSES],
    shifts: [...INITIAL_SHIFTS],
    standards: [...INITIAL_STANDARDS],
    requirements: [...INITIAL_REQUIREMENTS],
    iafSectors: [...INITIAL_IAF],
    iafSubsectors: INITIAL_SUBSECTORES_IAF.map((s) => ({ ...s })),
    catalogs: [...INITIAL_CATALOGS],
    findings: [...INITIAL_FINDINGS],
    allOrganizaciones: [...INITIAL_ORGANIZACIONES],
    allClientAccesses: [],
    allCertificadosDetailed: [...INITIAL_CERTIFICADOS_DETAILED],
    allAuditorsDetailed: [...INITIAL_AUDITORES_DETAILED],
    allOrganismos: INITIAL_ORGANISMOS.map((o) => ({ ...o })),
    allAcreditaciones: buildInitialAcreditacionEntities(),
    shiftCatalog: [...INITIAL_TURNO_CATALOG],
    requirementsCatalog: getAllSeededNormaRequirements(),
    estatusCatalog: [...INITIAL_ESTATUS_CATALOG],
    tiposCatalog: [...INITIAL_TIPOS_AUDITORIA_CATALOG],
    metodologiasCatalog: [...INITIAL_METODOLOGIAS_CATALOG],
    archivedSiteIds: new Set<string>(),
    archivedProcesoIds: new Set<string>(),
    archivedTurnoIds: new Set<string>(),
    archivedNoAplicableIds: new Set<string>(),
    archivedFechaIds: new Set<string>(),
    archivedContactoIds: new Set<string>(),
    archivedTelefonoIds: new Set<string>(),
    archivedEmailIds: new Set<string>(),
    programacionAudits: INITIAL_PROGRAMACION_AUDITS.map((a) => ({
      ...a,
      equipo: a.equipo.map((m) => ({ ...m })),
      sitiosMuestreo: a.sitiosMuestreo.map((s) => ({ ...s })),
      matrizNormativa: a.matrizNormativa.map((n) => ({ ...n })),
      recomendacion: a.recomendacion ? { ...a.recomendacion } : null,
    })),
    phase5Findings: INITIAL_PHASE5_FINDINGS.map((f) => ({ ...f })),
    sessionAuditLogs: [],
    loading: false,
  },
  archiveGovernance: {
    showArchived: false,
    modal: createInitialArchiveModalState(),
    toast: null,
    restoringId: null,
    archivedRecordsByTable: {},
    archivedSnapshotsByKey: {},
    archivedCatalogIds: new Set<string>(),
  },
  auditPlanning: {
    isModalOpen: false,
  },
  tableColumnWidths: {},
  programacionDomain: {
    selectedAuditId: null,
    activeChildTab: 'equipo',
    query: '',
    selectedTipo: 'ALL',
    selectedMetodologia: 'ALL',
    selectedEstatus: 'ALL',
    selectedAuditorLider: 'ALL',
    viewMode: 'grid',
    sortColumn: null,
    sortDirection: 'none',
    isPlanningModalOpen: false,
    isEditingAttributes: false,
    isAddingTeamMember: false,
    editErrorMessage: null,
    saveSuccessMessage: null,
    isSidebarOpen: true,
    facetSelections: {},
  },
  calendarioDomain: {
    displayMode: 'month',
    referenceYear: 2024,
    referenceMonth: 11,
    filterAuditorId: 'ALL',
    filterStandard: 'ALL',
    filterMethodology: 'ALL',
    drawerAuditId: null,
  },
  resultadoDomain: {
    selectedAuditId: 'ALL',
    activeAuditIdForDecision: INITIAL_PROGRAMACION_AUDITS[0]?.id || '',
    displayMode: 'list',
    filterType: 'ALL',
    filterLifecycle: 'ALL',
    searchQuery: '',
    isLoggingFinding: false,
    inspectingFindingId: null,
    recommendationError: null,
    recommendationSuccess: null,
    findingFormError: null,
  },
  organizacionDomain: {
    selectedOrganizacionId: null,
    query: '',
    hasActiveCertificates: 'ALL',
    selectedSectorIaf: 'ALL',
    viewMode: 'grid',
    sortColumn: null,
    sortDirection: 'none',
    isEditingAttributes: false,
    activeChildTab: 'certificados',
    formDraft: undefined,
    editFormData: undefined,
    editErrorMessage: null,
    isSidebarOpen: true,
    facetSelections: {},
    isCreating: false,
  },
  clientAccessDomain: {
    selectedAccessId: null,
    prefillOrganizacionId: null,
    isCreating: false,
    isEditingAttributes: false,
    formDraft: undefined,
    editErrorMessage: null,
  },
  certificadoDomain: {
    selectedCertId: null,
    activeChildTab: 'sitios',
    query: '',
    selectedStandard: 'ALL',
    selectedStatus: 'ALL',
    selectedSectorIaf: 'ALL',
    viewMode: 'grid',
    sortColumn: null,
    sortDirection: 'none',
    childSortState: {},
    isEditingAttributes: false,
    editFormData: undefined,
    editErrorMessage: null,
    originatingOrganizacionId: null,
    isSidebarOpen: true,
    facetSelections: {},
    isCreating: false,
    createErrorMessage: null,
  },
  sitioDomain: {
    selectedSitioId: null,
    activeChildTab: 'turnos',
    isCreating: false,
    prefillCertId: null,
    isEditingAttributes: false,
    formDraft: undefined,
    editFormData: undefined,
    editErrorMessage: null,
    archiveConfirmOpen: false,
    archiveErrorMessage: null,
    isAssigningShift: false,
    childSortState: {},
  },
  procesoDomain: {
    selectedProcesoId: null,
    activeChildTab: 'requisitos',
    isCreating: false,
    prefillCertId: null,
    isEditingAttributes: false,
    formDraft: undefined,
    editFormData: undefined,
    editErrorMessage: null,
    archiveConfirmOpen: false,
    archiveErrorMessage: null,
    isAssigningRequisito: false,
    childSortState: {},
  },
  turnoDomain: {
    selectedTurnoId: null,
    originatingSitioId: null,
    activeChildTab: 'sitios',
    isCreating: false,
    prefillCertId: null,
    prefillSitioId: null,
    isEditingAttributes: false,
    formDraft: undefined,
    editFormData: undefined,
    editErrorMessage: null,
    archiveConfirmOpen: false,
    archiveErrorMessage: null,
    childSortState: {},
  },
  noAplicableDomain: {
    selectedNoAplicableId: null,
    originatingCertId: null,
    isCreating: false,
    isEditingAttributes: false,
    formDraft: undefined,
    editErrorMessage: null,
    archiveConfirmOpen: false,
    archiveErrorMessage: null,
  },
  fechaDomain: {
    selectedFechaId: null,
    originatingCertId: null,
    isCreating: false,
    isEditingAttributes: false,
    formDraft: undefined,
    editFormData: undefined,
    editErrorMessage: null,
  },
  contactoDomain: {
    selectedContactoId: null,
    originatingCertId: null,
    activeChildTab: 'telefonos',
    isCreating: false,
    isEditingAttributes: false,
    formDraft: undefined,
    editFormData: undefined,
    editErrorMessage: null,
    childSortState: {},
  },
  telefonoDomain: {
    selectedTelefonoId: null,
    originatingContactoId: null,
    isCreating: false,
    isEditingAttributes: false,
    formDraft: undefined,
    editFormData: undefined,
    editErrorMessage: null,
  },
  emailDomain: {
    selectedEmailId: null,
    originatingContactoId: null,
    isCreating: false,
    isEditingAttributes: false,
    formDraft: undefined,
    editFormData: undefined,
    editErrorMessage: null,
  },
  auditorDomain: {
    selectedAuditorId: null,
    activeChildTab: 'competencias',
    query: '',
    selectedCalificacion: 'ALL',
    selectedStandard: 'ALL',
    selectedSectorIaf: 'ALL',
    viewMode: 'grid',
    sortColumn: null,
    sortDirection: 'none',
    isEditingAttributes: false,
    formDraft: undefined,
    editFormData: undefined,
    editErrorMessage: null,
    isSidebarOpen: true,
    facetSelections: {},
    isCreating: false,
    createErrorMessage: null,
  },
  competenciaAuditorDomain: {
    isOpen: false,
    mode: 'read',
    selectedComp: null,
    prefillAuditorId: null,
    formDraft: undefined,
    errorMessage: null,
    confirmUnlink: false,
  },
  extraDomain: {
    selectedNormaId: null,
    activeNormaTab: 'requisitos',
    normaSearchQuery: '',
    normaRequisitoQuery: '',
    normaFilterStatus: 'ALL',
    normaFilterScheme: 'ALL',
    normaViewMode: 'grid',
    normaSortColumn: null,
    normaSortDirection: 'none',
    normaIsSidebarOpen: true,
    normaFacetSelections: {},
    isCreatingNorma: false,
    isEditingNorma: false,
    normaFormDraft: undefined,
    normaEditError: null,

    selectedRequisitoId: null,
    prefillRequisitoNormaId: null,
    prefillRequisitoPadreId: null,
    requisitoReaderScope: 'clause',
    requisitoFullNormaQuery: '',
    activeRequisitoTab: 'subrequisitos',
    requisitoLangMode: 'es',
    requisitoContentCollapsed: false,
    requisitoEditorLang: 'es',
    requisitoEditorMode: 'visual',
    requisitoEditorLinkPopoverOpen: false,
    requisitoEditorLinkUrl: '',
    requisitoEditorLinkLabel: '',
    requisitoEditorLinkError: null,
    requisitoEditorPickerOpen: false,
    requisitoEditorPickerQuery: '',
    isCreatingRequisito: false,
    isEditingRequisito: false,
    requisitoFormDraft: undefined,
    requisitoEditError: null,

    selectedSectorId: null,
    activeSectorTab: 'subsectores',
    iafSearchQuery: '',
    iafFilterRisk: 'ALL',
    iafViewMode: 'grid',
    iafSortColumn: null,
    iafSortDirection: 'none',
    iafIsSidebarOpen: true,
    iafFacetSelections: {},
    isCreatingSector: false,
    isEditingSector: false,
    sectorFormDraft: undefined,
    sectorEditError: null,

    selectedSubsectorId: null,
    prefillSubsectorSectorId: null,
    activeSubsectorTab: 'certificados',
    isCreatingSubsector: false,
    isEditingSubsector: false,
    subsectorFormDraft: undefined,
    subsectorEditError: null,

    selectedEstatusId: null,
    activeEstatusTab: 'certificados',
    estatusSearchQuery: '',
    estatusViewMode: 'grid',
    estatusSortColumn: null,
    estatusSortDirection: 'none',
    estatusIsSidebarOpen: true,
    estatusFacetSelections: {},
    isCreatingEstatus: false,
    isEditingEstatus: false,
    estatusFormDraft: undefined,
    estatusEditError: null,

    selectedTipoId: null,
    tipoSearchQuery: '',
    tipoViewMode: 'grid',
    tipoSortColumn: null,
    tipoSortDirection: 'none',
    tipoIsSidebarOpen: true,
    tipoFacetSelections: {},
    isCreatingTipo: false,
    isEditingTipo: false,
    tipoFormDraft: undefined,
    tipoEditError: null,

    selectedMetodologiaId: null,
    metodologiaSearchQuery: '',
    metodologiaViewMode: 'grid',
    metodologiaSortColumn: null,
    metodologiaSortDirection: 'none',
    metodologiaIsSidebarOpen: true,
    metodologiaFacetSelections: {},
    isCreatingMetodologia: false,
    isEditingMetodologia: false,
    metodologiaFormDraft: undefined,
    metodologiaEditError: null,

    selectedOrganismoId: null,
    activeOrganismoTab: 'acreditaciones',
    organismoSearchQuery: '',
    organismoViewMode: 'grid',
    organismoSortColumn: null,
    organismoSortDirection: 'none',
    organismoIsSidebarOpen: true,
    organismoFacetSelections: {},
    isCreatingOrganismo: false,
    isEditingOrganismo: false,
    organismoFormDraft: undefined,
    organismoEditError: null,

    selectedAccreditationId: null,
    activeAccreditationTab: 'certificados',
    accredSearchQuery: '',
    accredViewMode: 'grid',
    accredSortColumn: null,
    accredSortDirection: 'none',
    accredIsSidebarOpen: true,
    accredFacetSelections: {},
    isCreatingAccreditation: false,
    isEditingAccreditation: false,
    accredFormDraft: undefined,
    accredEditErrorMessage: null,
  },
};

function isApprovedAdmin(): boolean {
  return evaluateAdminAccess(state.profile).allowed;
}

function isApprovedStaff(): boolean {
  return isApprovedStaffProfile(state.profile);
}

function canMutateAuditById(auditId: string | null | undefined): boolean {
  if (!state.profile || state.profile.status !== 'APPROVED') return false;
  if (isApprovedStaff()) return true;
  if (!auditId) return false;
  const audit = state.domainData.programacionAudits.find((a) => a.id === auditId);
  return canMutateAuditExecution(audit, state.profile);
}

let floatingToastTimerId: number | null = null;

function dismissFloatingToast(): void {
  if (floatingToastTimerId !== null) {
    window.clearTimeout(floatingToastTimerId);
    floatingToastTimerId = null;
  }
  state.archiveGovernance.toast = null;
  document.getElementById('archiveGovernanceToast')?.remove();
}

function scheduleFloatingToastAutoDismiss(durationMs = 4500): void {
  if (floatingToastTimerId !== null) {
    window.clearTimeout(floatingToastTimerId);
  }
  floatingToastTimerId = window.setTimeout(() => {
    floatingToastTimerId = null;
    state.archiveGovernance.toast = null;
    document.getElementById('archiveGovernanceToast')?.remove();
  }, durationMs);
}

function showFloatingToast(
  message: string,
  tone: ArchiveToastState['tone'] = 'success',
  durationMs = 4500
): void {
  state.archiveGovernance.toast = { message, tone };
  scheduleFloatingToastAutoDismiss(durationMs);
}

function render(): void {
  const root = document.getElementById('app');
  if (!root) return;

  if (state.booting) {
    root.innerHTML = `
      ${renderHeader({
        profile: null,
        email: null,
        isAdmin: false,
        activeRoute: 'dashboard',
        activeSubSection: null,
        pendingCount: 0,
        openMenu: null,
      })}
      <main class="flex-1 flex items-center justify-center px-4 py-12">
        <div class="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8 text-center">
          <p class="text-sm font-medium text-slate-700">Loading workspace...</p>
        </div>
      </main>
    `;
    return;
  }

  if (!state.user || !state.profile) {
    root.innerHTML = `
      ${renderHeader({
        profile: null,
        email: null,
        isAdmin: false,
        activeRoute: 'dashboard',
        activeSubSection: null,
        pendingCount: 0,
        openMenu: null,
      })}
      ${renderAuthView(state.auth)}
    `;
    bindAuthEvents();
    return;
  }

  const admin = isApprovedAdmin();
  const staff = isApprovedStaff();
  const pendingCount = state.approvals.profiles.filter((p) => p.status === 'PENDING').length;

  const scopedProgramacionAudits = scopeProgramacionAuditsForProfile(
    state.domainData.programacionAudits,
    state.profile,
    state.authorizedClientOrgIds
  );
  const scopedPhase5Findings = scopePhase5FindingsForProfile(
    state.domainData.phase5Findings,
    scopedProgramacionAudits,
    state.profile
  );
  const scopedExplorationRecords = scopeCertificateRecordsForProfile(
    state.exploration.records,
    state.profile,
    state.authorizedClientOrgIds,
    scopedProgramacionAudits
  );
  const scopedDetailedCerts = scopeDetailedCertsForProfile(
    state.domainData.allCertificadosDetailed,
    state.profile,
    state.authorizedClientOrgIds,
    scopedProgramacionAudits
  );
  const scopedAllOrganizaciones = scopeOrganizacionEntitiesForProfile(
    state.domainData.allOrganizaciones,
    state.profile,
    state.authorizedClientOrgIds,
    scopedProgramacionAudits
  );
  const scopedOrganizations = scopeOrganizationsForProfile(
    state.domainData.organizations,
    state.profile,
    state.authorizedClientOrgIds,
    scopedProgramacionAudits,
    scopedExplorationRecords
  );
  const scopedLegacyAudits = scopeLegacyAuditsForProfile(
    state.domainData.audits,
    state.profile,
    scopedProgramacionAudits,
    scopedExplorationRecords
  );
  const scopedLegacyFindings = scopeLegacyFindingsForProfile(
    state.domainData.findings,
    scopedLegacyAudits,
    scopedExplorationRecords,
    state.profile
  );
  const scopedSites = scopeSitesOrProcessesForCertificates(
    state.domainData.sites,
    scopedExplorationRecords,
    state.profile
  );
  const scopedProcesses = scopeSitesOrProcessesForCertificates(
    state.domainData.processes,
    scopedExplorationRecords,
    state.profile
  );

  const isAuditorContextualCertAccess =
    state.profile.role === 'AUDITOR' &&
    state.profile.status === 'APPROVED' &&
    state.activeRoute === 'certificacion' &&
    (Boolean(state.organizacionDomain.selectedOrganizacionId) ||
      Boolean(state.certificadoDomain.selectedCertId) ||
      Boolean(state.sitioDomain.selectedSitioId) ||
      Boolean(state.procesoDomain.selectedProcesoId) ||
      Boolean(state.turnoDomain.selectedTurnoId) ||
      Boolean(state.fechaDomain.selectedFechaId) ||
      Boolean(state.contactoDomain.selectedContactoId) ||
      Boolean(state.telefonoDomain.selectedTelefonoId) ||
      Boolean(state.emailDomain.selectedEmailId));

  let effectiveRoute: ActiveRoute = state.activeRoute;
  if (!canAccessRoute(state.profile, effectiveRoute) && !isAuditorContextualCertAccess) {
    effectiveRoute = 'dashboard';
    state.activeRoute = 'dashboard';
    state.activeSubSection = null;
  }

  const effectiveResultadoState: ResultadoViewState = {
    ...state.resultadoDomain,
    activeAuditIdForDecision: scopedProgramacionAudits.some(
      (a) => a.id === state.resultadoDomain.activeAuditIdForDecision
    )
      ? state.resultadoDomain.activeAuditIdForDecision
      : scopedProgramacionAudits[0]?.id || '',
  };

  const canInspectArchived = canInspectArchivedRecords(state.profile);
  const allArchivedEntries: ArchivedItemEntry[] = canInspectArchived
    ? Object.values(state.archiveGovernance.archivedRecordsByTable).flat()
    : [];
  const archiveConfig: ArchiveMultiViewConfig = {
    canInspectArchived,
    showArchived: canInspectArchived && state.archiveGovernance.showArchived,
    archivedItems: allArchivedEntries,
    actorDirectory: buildActorDirectory(),
    restoringId: state.archiveGovernance.restoringId,
  };

  let bodyHtml = '';
  if (effectiveRoute === 'approvals' && staff) {
    bodyHtml = renderApprovalsView({
      profiles: state.approvals.profiles,
      filter: state.approvals.filter,
      loading: state.approvals.loading,
      updatingId: state.approvals.updatingId,
      errorMessage: state.approvals.errorMessage,
      successMessage: state.approvals.successMessage,
      currentAdminId: state.user.id,
      readOnly: !admin,
    });
  } else if (effectiveRoute === 'database' && admin) {
    bodyHtml = renderDatabaseStatusView(
      state.dbCheck.checks,
      state.dbCheck.running,
      state.dbCheck.lastCheckedAt
    );
  } else if (effectiveRoute === 'profile') {
    bodyHtml = renderProfileView({
      profile: state.profile,
      userEmail: state.user.email || '',
      formState: state.profileForm,
      clientAccessItems: state.clientAccessRows,
      auditorsDetailed: state.domainData.allAuditorsDetailed,
    });
  } else if (effectiveRoute === 'auditorias') {
    bodyHtml = renderAuditoriasView(state.profile, {
      activeSubSection: state.activeSubSection || 'scheduling',
      programacionState: state.programacionDomain,
      calendarioState: state.calendarioDomain,
      resultadoState: effectiveResultadoState,
      programacionAudits: scopedProgramacionAudits,
      phase5Findings: scopedPhase5Findings,
      allAuditorsDetailed: state.domainData.allAuditorsDetailed,
      certificates: scopedExplorationRecords,
      processes: scopedProcesses,
      requirements: state.domainData.requirements,
      standards: state.domainData.standards,
      loading: state.domainData.loading,
      archiveConfig,
    });
  } else if (effectiveRoute === 'certificacion') {
    const filteredRecords = filterCertificateRecords(scopedExplorationRecords, {
      query: state.exploration.query,
      selectedStatus: state.exploration.selectedStatus,
      selectedStandard: state.exploration.selectedStandard,
    });
    const availableStatuses = extractUniqueStatuses(scopedExplorationRecords);
    const availableStandards = extractUniqueStandards(scopedExplorationRecords);

    bodyHtml = renderCertificacionView(state.profile, {
      activeSubSection: state.activeSubSection || 'certificates',
      filters: {
        query: state.exploration.query,
        selectedStatus: state.exploration.selectedStatus,
        selectedStandard: state.exploration.selectedStandard,
        viewMode: state.exploration.viewMode,
      },
      filteredCertificates: filteredRecords,
      allCertificates: scopedExplorationRecords,
      availableStatuses,
      availableStandards,
      organizations: scopedOrganizations,
      sites: scopedSites,
      processes: scopedProcesses,
      shifts: state.domainData.shifts,
      loading: state.exploration.loading,
      organizacionState: state.organizacionDomain,
      allOrganizaciones: scopedAllOrganizaciones,
      clientAccessState: state.clientAccessDomain,
      clientAccesses: state.domainData.allClientAccesses,
      profilesDirectory: state.approvals.profiles,
      certificadoState: state.certificadoDomain,
      allCertificadosDetailed: scopedDetailedCerts,
      auditorState: state.auditorDomain,
      competenciaAuditorState: state.competenciaAuditorDomain,
      allAuditorsDetailed: state.domainData.allAuditorsDetailed,
      programacionAudits: scopedProgramacionAudits,
      sitioState: state.sitioDomain,
      procesoState: state.procesoDomain,
      turnoState: state.turnoDomain,
      noAplicableState: state.noAplicableDomain,
      fechaState: state.fechaDomain,
      contactoState: state.contactoDomain,
      telefonoState: state.telefonoDomain,
      emailState: state.emailDomain,
      shiftCatalog: state.domainData.shiftCatalog,
      requirementsCatalog: state.domainData.requirementsCatalog,
      standardsCatalog: getResolvedNormasCatalog(),
      estatusCatalog: getResolvedEstatusCatalog(),
      iafSectors: getResolvedSectoresCatalog(),
      iafSubsectors: getResolvedSubsectoresCatalog(),
      phase5Findings: scopedPhase5Findings,
      archivedSiteIds: state.domainData.archivedSiteIds,
      archivedProcesoIds: state.domainData.archivedProcesoIds,
      archivedTurnoIds: state.domainData.archivedTurnoIds,
      archivedNoAplicableIds: state.domainData.archivedNoAplicableIds,
      archivedFechaIds: state.domainData.archivedFechaIds,
      archivedContactoIds: state.domainData.archivedContactoIds,
      archivedTelefonoIds: state.domainData.archivedTelefonoIds,
      archivedEmailIds: state.domainData.archivedEmailIds,
      archiveConfig,
      tableColumnWidths: state.tableColumnWidths,
    });
  } else if (effectiveRoute === 'extra') {
    const coverageCerts: CertificateCoverageInput[] = [];
    const seenCertKeys = new Set<string>();
    for (const c of scopedDetailedCerts) {
      const key = c.numero_certificado || c.id;
      seenCertKeys.add(key);
      coverageCerts.push({
        id: c.id,
        estatus: c.estatus,
        id_norma: c.id_norma,
        norma_codigo: c.norma_codigo,
        id_sector_iaf: c.id_sector_iaf,
        sector_iaf: c.sector_iaf,
      });
    }
    for (const r of scopedExplorationRecords) {
      const key = r.numero_certificado || r.id;
      if (seenCertKeys.has(key)) continue;
      seenCertKeys.add(key);
      coverageCerts.push({
        id: r.id,
        estatus: r.estatus,
        norma_id: r.norma_id,
        norma: r.norma,
        sector_iaf: r.sector_iaf,
      });
    }
    const enrichedAcreditaciones = enrichAcreditacionesWithImpact(
      state.domainData.allAcreditaciones,
      coverageCerts
    );
    const acreditacionViewState: Partial<AcreditacionViewState> = {
      selectedAccreditationId: state.extraDomain.selectedAccreditationId,
      activeChildTab: state.extraDomain.activeAccreditationTab,
      query: state.extraDomain.accredSearchQuery,
      viewMode: state.extraDomain.accredViewMode,
      sortColumn: state.extraDomain.accredSortColumn,
      sortDirection: state.extraDomain.accredSortDirection,
      isSidebarOpen: state.extraDomain.accredIsSidebarOpen,
      facetSelections: state.extraDomain.accredFacetSelections,
      isCreating: state.extraDomain.isCreatingAccreditation,
      isEditingAttributes: state.extraDomain.isEditingAccreditation,
      formDraft: state.extraDomain.accredFormDraft,
      editErrorMessage: state.extraDomain.accredEditErrorMessage,
    };

    const mergedExtraRequirements: RequirementRecord[] = [];
    const seenReqIds = new Set<string>();
    const seenNormaCodeKeys = new Set<string>();
    const pushReqRecord = (r: RequirementRecord) => {
      const codeKey = `${(r.norma || '').trim().toLowerCase()}::${(r.codigo || '').trim().toLowerCase()}`;
      if (seenReqIds.has(r.id) || (r.norma && r.codigo && seenNormaCodeKeys.has(codeKey))) return;
      seenReqIds.add(r.id);
      if (r.norma && r.codigo) seenNormaCodeKeys.add(codeKey);
      mergedExtraRequirements.push(r);
    };
    state.domainData.requirementsCatalog.forEach((req) =>
      pushReqRecord({
        id: req.id,
        id_norma: req.id_norma,
        id_requisito_padre: req.id_requisito_padre,
        codigo: req.codigo,
        ruta_materializada: req.ruta_materializada,
        norma: req.norma_codigo,
        titulo: req.titulo,
        descripcion: req.descripcion,
      })
    );
    state.domainData.requirements.forEach(pushReqRecord);

    bodyHtml = renderExtraView(state.profile, {
      activeSubSection: state.activeSubSection || 'standards',
      standards: state.domainData.standards,
      requirements: mergedExtraRequirements,
      requirementsCatalog: state.domainData.requirementsCatalog,
      iafSectors: state.domainData.iafSectors,
      subsectores: state.domainData.iafSubsectors,
      catalogs: state.domainData.catalogs,
      loading: state.domainData.loading,
      organismos: state.domainData.allOrganismos,
      accreditations: enrichedAcreditaciones,
      certificates: scopedDetailedCerts,
      auditors: state.domainData.allAuditorsDetailed,
      audits: scopedProgramacionAudits,
      estatusCatalog: state.domainData.estatusCatalog,
      tiposCatalog: state.domainData.tiposCatalog,
      metodologiasCatalog: state.domainData.metodologiasCatalog,
      archivedRecordIds: state.archiveGovernance.archivedCatalogIds,
      archiveConfig,
      tableColumnWidths: state.tableColumnWidths,
      normaState: {
        selectedNormaId: state.extraDomain.selectedNormaId,
        activeChildTab: state.extraDomain.activeNormaTab,
        query: state.extraDomain.normaSearchQuery,
        requisitoQuery: state.extraDomain.normaRequisitoQuery,
        selectedStatus: state.extraDomain.normaFilterStatus,
        selectedScheme: state.extraDomain.normaFilterScheme,
        viewMode: state.extraDomain.normaViewMode,
        sortColumn: state.extraDomain.normaSortColumn,
        sortDirection: state.extraDomain.normaSortDirection,
        isSidebarOpen: state.extraDomain.normaIsSidebarOpen,
        facetSelections: state.extraDomain.normaFacetSelections,
        isCreating: state.extraDomain.isCreatingNorma,
        isEditingAttributes: state.extraDomain.isEditingNorma,
        formDraft: state.extraDomain.normaFormDraft,
        editErrorMessage: state.extraDomain.normaEditError,
      },
      requisitoState: {
        selectedRequisitoId: state.extraDomain.selectedRequisitoId,
        prefillNormaId: state.extraDomain.prefillRequisitoNormaId,
        prefillPadreId: state.extraDomain.prefillRequisitoPadreId,
        readerScope: state.extraDomain.requisitoReaderScope,
        fullNormaQuery: state.extraDomain.requisitoFullNormaQuery,
        activeChildTab: state.extraDomain.activeRequisitoTab,
        langMode: state.extraDomain.requisitoLangMode,
        isContentCollapsed: state.extraDomain.requisitoContentCollapsed,
        editorLang: state.extraDomain.requisitoEditorLang,
        editorMode: state.extraDomain.requisitoEditorMode,
        linkPopoverOpen: state.extraDomain.requisitoEditorLinkPopoverOpen,
        linkDraftUrl: state.extraDomain.requisitoEditorLinkUrl,
        linkDraftLabel: state.extraDomain.requisitoEditorLinkLabel,
        linkErrorMessage: state.extraDomain.requisitoEditorLinkError,
        clausePickerOpen: state.extraDomain.requisitoEditorPickerOpen,
        clausePickerQuery: state.extraDomain.requisitoEditorPickerQuery,
        isCreating: state.extraDomain.isCreatingRequisito,
        isEditingAttributes: state.extraDomain.isEditingRequisito,
        formDraft: state.extraDomain.requisitoFormDraft,
        editErrorMessage: state.extraDomain.requisitoEditError,
      },
      iafState: {
        selectedSectorId: state.extraDomain.selectedSectorId,
        activeChildTab: state.extraDomain.activeSectorTab,
        query: state.extraDomain.iafSearchQuery,
        selectedRisk: state.extraDomain.iafFilterRisk,
        viewMode: state.extraDomain.iafViewMode,
        sortColumn: state.extraDomain.iafSortColumn,
        sortDirection: state.extraDomain.iafSortDirection,
        isSidebarOpen: state.extraDomain.iafIsSidebarOpen,
        facetSelections: state.extraDomain.iafFacetSelections,
        isCreating: state.extraDomain.isCreatingSector,
        isEditingAttributes: state.extraDomain.isEditingSector,
        formDraft: state.extraDomain.sectorFormDraft,
        editErrorMessage: state.extraDomain.sectorEditError,
      },
      subsectorState: {
        selectedSubsectorId: state.extraDomain.selectedSubsectorId,
        prefillSectorId: state.extraDomain.prefillSubsectorSectorId,
        activeChildTab: state.extraDomain.activeSubsectorTab,
        isCreating: state.extraDomain.isCreatingSubsector,
        isEditingAttributes: state.extraDomain.isEditingSubsector,
        formDraft: state.extraDomain.subsectorFormDraft,
        editErrorMessage: state.extraDomain.subsectorEditError,
      } satisfies Partial<SubsectorIafViewState>,
      acreditacionState: acreditacionViewState,
      organismoState: {
        selectedOrganismoId: state.extraDomain.selectedOrganismoId,
        activeChildTab: state.extraDomain.activeOrganismoTab,
        query: state.extraDomain.organismoSearchQuery,
        viewMode: state.extraDomain.organismoViewMode,
        sortColumn: state.extraDomain.organismoSortColumn,
        sortDirection: state.extraDomain.organismoSortDirection,
        isSidebarOpen: state.extraDomain.organismoIsSidebarOpen,
        facetSelections: state.extraDomain.organismoFacetSelections,
        isCreating: state.extraDomain.isCreatingOrganismo,
        isEditingAttributes: state.extraDomain.isEditingOrganismo,
        formDraft: state.extraDomain.organismoFormDraft,
        editErrorMessage: state.extraDomain.organismoEditError,
      },
      estatusState: {
        selectedEstatusId: state.extraDomain.selectedEstatusId,
        activeChildTab: state.extraDomain.activeEstatusTab,
        query: state.extraDomain.estatusSearchQuery,
        viewMode: state.extraDomain.estatusViewMode,
        sortColumn: state.extraDomain.estatusSortColumn,
        sortDirection: state.extraDomain.estatusSortDirection,
        isSidebarOpen: state.extraDomain.estatusIsSidebarOpen,
        facetSelections: state.extraDomain.estatusFacetSelections,
        isCreating: state.extraDomain.isCreatingEstatus,
        isEditingAttributes: state.extraDomain.isEditingEstatus,
        formDraft: state.extraDomain.estatusFormDraft,
        editErrorMessage: state.extraDomain.estatusEditError,
      },
      tipoState: {
        selectedTipoId: state.extraDomain.selectedTipoId,
        query: state.extraDomain.tipoSearchQuery,
        viewMode: state.extraDomain.tipoViewMode,
        sortColumn: state.extraDomain.tipoSortColumn,
        sortDirection: state.extraDomain.tipoSortDirection,
        isSidebarOpen: state.extraDomain.tipoIsSidebarOpen,
        facetSelections: state.extraDomain.tipoFacetSelections,
        isCreating: state.extraDomain.isCreatingTipo,
        isEditingAttributes: state.extraDomain.isEditingTipo,
        formDraft: state.extraDomain.tipoFormDraft,
        editErrorMessage: state.extraDomain.tipoEditError,
      },
      metodologiaState: {
        selectedMetodologiaId: state.extraDomain.selectedMetodologiaId,
        query: state.extraDomain.metodologiaSearchQuery,
        viewMode: state.extraDomain.metodologiaViewMode,
        sortColumn: state.extraDomain.metodologiaSortColumn,
        sortDirection: state.extraDomain.metodologiaSortDirection,
        isSidebarOpen: state.extraDomain.metodologiaIsSidebarOpen,
        facetSelections: state.extraDomain.metodologiaFacetSelections,
        isCreating: state.extraDomain.isCreatingMetodologia,
        isEditingAttributes: state.extraDomain.isEditingMetodologia,
        formDraft: state.extraDomain.metodologiaFormDraft,
        editErrorMessage: state.extraDomain.metodologiaEditError,
      },
    });
  } else {
    const summaryMetrics = computeDashboardSummaryMetrics({
      profile: state.profile,
      scopedOrganizaciones: scopedAllOrganizaciones,
      scopedCertificados: scopedDetailedCerts,
      scopedAuditorias: scopedProgramacionAudits,
      acreditaciones:
        state.domainData.allAcreditaciones.length > 0
          ? state.domainData.allAcreditaciones.map(toLegacyAcreditacionNormaIaf)
          : INITIAL_ACREDITACIONES,
      scopedHallazgos: scopedPhase5Findings,
    });

    bodyHtml = renderDashboardView(
      state.profile,
      state.user.email || '',
      summaryMetrics
    );
  }

  const activeEl = document.activeElement as HTMLElement | null;
  const isInputActive = activeEl?.tagName === 'INPUT' || activeEl?.tagName === 'TEXTAREA';
  const activeInputId = isInputActive ? activeEl?.id || null : null;
  const searchCursorStart = isInputActive ? (activeEl as HTMLInputElement).selectionStart : null;
  const searchCursorEnd = isInputActive ? (activeEl as HTMLInputElement).selectionEnd : null;

  const breadcrumbBarHtml = renderBreadcrumbBar({ trail: state.breadcrumbs });
  const auditModalHtml = renderAuditLogModal(state.auditLogModal);
  const archiveModalHtml = renderArchiveModal(state.archiveGovernance.modal);
  const archiveToastHtml = renderArchiveToast(state.archiveGovernance.toast);

  root.innerHTML = `
    ${renderHeader({
      profile: state.profile,
      email: state.user.email || '',
      isAdmin: admin,
      canViewApprovals: staff,
      activeRoute: effectiveRoute,
      activeSubSection: state.activeSubSection,
      pendingCount,
      openMenu: state.openMenu,
    })}
    ${
      state.breadcrumbs && state.breadcrumbs.length > 1
        ? `<div class="${APP_SHELL_CONTAINER_CLASS} pt-1.5 pb-0">${breadcrumbBarHtml}</div>`
        : ''
    }
    ${bodyHtml}
    ${auditModalHtml}
    ${archiveModalHtml}
    ${archiveToastHtml}
  `;

  bindAuthenticatedEvents();

  if (activeInputId) {
    const restoredInput = document.getElementById(activeInputId) as HTMLInputElement | null;
    if (restoredInput) {
      restoredInput.focus();
      if (searchCursorStart !== null && searchCursorEnd !== null) {
        try {
          restoredInput.setSelectionRange(searchCursorStart, searchCursorEnd);
        } catch {
          // ignore non-text inputs
        }
      }
    }
  }
}

function bindAuthEvents(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-auth-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.authMode === 'signup' ? 'signup' : 'login';
      state.auth = {
        ...state.auth,
        mode,
        errorMessage: null,
        successMessage: null,
      };
      render();
    });
  });

  document.getElementById('loginForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const emailInput = document.getElementById('loginEmail') as HTMLInputElement | null;
    const passwordInput = document.getElementById('loginPassword') as HTMLInputElement | null;
    const email = emailInput?.value.trim() || '';
    const password = passwordInput?.value || '';
    void signInWithCredentials(email, password, null);
  });

  document.querySelectorAll<HTMLButtonElement>('[data-quick-login]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const email = btn.dataset.quickLogin || '';
      const account = TEST_ACCOUNTS.find((a) => a.email === email);
      if (account) {
        void signInWithCredentials(account.email, account.password, account.email);
      }
    });
  });

  document.getElementById('signupForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('signupName') as HTMLInputElement | null;
    const emailInput = document.getElementById('signupEmail') as HTMLInputElement | null;
    const passwordInput = document.getElementById('signupPassword') as HTMLInputElement | null;
    const roleSelect = document.getElementById('signupRole') as HTMLSelectElement | null;

    const nombre = nameInput?.value.trim() || '';
    const email = emailInput?.value.trim() || '';
    const password = passwordInput?.value || '';
    const role = (roleSelect?.value || 'CLIENT') as UserRole;

    void handleSignUp(nombre, email, password, role);
  });

  document.getElementById('openResetDbModalBtn')?.addEventListener('click', () => {
    state.auth = {
      ...state.auth,
      resetModalOpen: true,
      resetErrorMessage: null,
    };
    render();
  });

  document.getElementById('cancelResetDbBtn')?.addEventListener('click', () => {
    if (state.auth.resettingDb) return;
    state.auth = {
      ...state.auth,
      resetModalOpen: false,
      resetErrorMessage: null,
    };
    render();
  });

  document.getElementById('resetDbBackdrop')?.addEventListener('click', (e) => {
    if (e.target !== e.currentTarget || state.auth.resettingDb) return;
    state.auth = {
      ...state.auth,
      resetModalOpen: false,
      resetErrorMessage: null,
    };
    render();
  });

  document.getElementById('confirmResetDbBtn')?.addEventListener('click', () => {
    void handleResetDatabase();
  });
}

function inferEntityTypeFromSegment(seg: BreadcrumbSegment): BreadcrumbEntityType | null {
  if (seg.entityType) return seg.entityType;
  if (seg.id.startsWith('org-')) return 'org';
  if (seg.id.startsWith('acceso_cliente-') || seg.id.startsWith('acceso-cliente-')) return 'acceso_cliente';
  if (seg.id.startsWith('cert-')) return 'cert';
  if (seg.id.startsWith('sitio-')) return 'sitio';
  if (seg.id.startsWith('proceso-')) return 'proceso';
  if (seg.id.startsWith('turno-')) return 'turno';
  if (seg.id.startsWith('fecha_certificado-') || seg.id.startsWith('fecha-')) return 'fecha_certificado';
  if (seg.id.startsWith('contacto_certificado-') || seg.id.startsWith('contacto-')) return 'contacto_certificado';
  if (seg.id.startsWith('telefono_contacto-') || seg.id.startsWith('telefono-')) return 'telefono_contacto';
  if (seg.id.startsWith('email_contacto-') || seg.id.startsWith('email-')) return 'email_contacto';
  if (seg.id.startsWith('no_aplicable-') || seg.id.startsWith('no-aplicable-')) return 'no_aplicable';
  if (seg.id.startsWith('competencia_auditor-') || seg.id.startsWith('competencia-auditor-')) return 'competencia_auditor';
  if (seg.id.startsWith('aud-')) return 'auditor';
  if (seg.id.startsWith('prog-audit-') || seg.id.startsWith('resultados-')) return 'audit';
  if (seg.id.startsWith('norma-')) return 'norma';
  if (seg.id.startsWith('requisito-')) return 'requisito';
  if (seg.id.startsWith('sector-')) return 'sector_iaf';
  if (seg.id.startsWith('subsector_iaf-') || seg.id.startsWith('subsector-')) return 'subsector_iaf';
  if (seg.id.startsWith('organismo_acreditacion-') || seg.id.startsWith('organismo-')) return 'organismo_acreditacion';
  if (seg.id.startsWith('estatus-')) return 'estatus';
  if (seg.id.startsWith('tipo-')) return 'tipo';
  if (seg.id.startsWith('metodologia-')) return 'metodologia';
  if (seg.id.startsWith('accreditation-')) return 'accreditation';
  return null;
}

function getResolvedNormasCatalog(): NormaEntity[] {
  const archivedIds = state.archiveGovernance.archivedCatalogIds;
  const raw = state.domainData.standards;
  const mapped: NormaEntity[] =
    raw && raw.length > 0
      ? raw.map((s, idx) => {
          const fallback =
            INITIAL_NORMAS.find(
              (n) => n.id === s.id || n.codigo === (s.codigo || s.norma)
            ) || INITIAL_NORMAS[idx % INITIAL_NORMAS.length];
          return {
            id: s.id || fallback.id,
            codigo: s.codigo || s.norma || fallback.codigo,
            titulo:
              s.titulo ||
              (fallback.codigo === s.norma
                ? fallback.titulo
                : `Sistema de Gestión — ${s.esquema}`),
            estatus:
              (s.estatus as 'Vigente' | 'En Revisión' | 'Obsoleta') ||
              fallback.estatus ||
              'Vigente',
            esquema: s.esquema || fallback.esquema,
            fecha_publicacion:
              s.fecha_publicacion || fallback.fecha_publicacion || '2015-09-15',
            norma: s.norma || fallback.norma,
            clausulas_count: s.clausulas_count ?? fallback.clausulas_count ?? 7,
            acreditaciones_count:
              s.acreditaciones_count ?? fallback.acreditaciones_count ?? 1,
          };
        })
      : [...INITIAL_NORMAS];
  return mapped.filter((n) => !archivedIds.has(n.id));
}

function getActiveRequisitosForNorma(norma: NormaEntity): RequisitoLtree[] {
  const archivedIds = state.archiveGovernance.archivedCatalogIds;
  const base =
    state.domainData.requirementsCatalog.length > 0
      ? state.domainData.requirementsCatalog
      : getAllSeededNormaRequirements();
  return base.filter(
    (r) =>
      !r.deleted_at &&
      !archivedIds.has(r.id) &&
      (r.id_norma === norma.id ||
        r.norma_codigo.trim().toLowerCase() === norma.codigo.trim().toLowerCase())
  );
}

function getResolvedEstatusCatalog(): EstatusCatalogItem[] {
  const archivedIds = state.archiveGovernance.archivedCatalogIds;
  const raw =
    state.domainData.estatusCatalog.length > 0
      ? state.domainData.estatusCatalog
      : INITIAL_ESTATUS_CATALOG;
  return raw.filter((e) => !archivedIds.has(e.id));
}

function getResolvedTiposCatalog(): TipoAuditoriaCatalogItem[] {
  const archivedIds = state.archiveGovernance.archivedCatalogIds;
  const raw =
    state.domainData.tiposCatalog.length > 0
      ? state.domainData.tiposCatalog
      : INITIAL_TIPOS_AUDITORIA_CATALOG;
  return raw.filter((t) => !archivedIds.has(t.id));
}

function getResolvedMetodologiasCatalog(): MetodologiaAuditoriaCatalogItem[] {
  const archivedIds = state.archiveGovernance.archivedCatalogIds;
  const raw =
    state.domainData.metodologiasCatalog.length > 0
      ? state.domainData.metodologiasCatalog
      : INITIAL_METODOLOGIAS_CATALOG;
  return raw.filter((m) => !archivedIds.has(m.id));
}

function getResolvedSectoresCatalog(): SectorIafEntity[] {
  const archivedIds = state.archiveGovernance.archivedCatalogIds;
  const raw = state.domainData.iafSectors;
  const mapped: SectorIafEntity[] =
    raw && raw.length > 0
      ? raw.map((sec, idx) => {
          const fallback =
            INITIAL_SECTORES_IAF.find((s) => s.id === sec.id || s.sector === sec.sector) ||
            INITIAL_SECTORES_IAF[idx % INITIAL_SECTORES_IAF.length];
          return {
            id: sec.id || fallback.id,
            sector: sec.sector || fallback.sector,
            descripcion: sec.descripcion || fallback.descripcion,
            subsectores_count:
              sec.subsectores_count ??
              (fallback.sector === sec.sector ? fallback.subsectores_count : 1),
            auditores_count:
              sec.auditores_count ??
              (fallback.sector === sec.sector ? fallback.auditores_count : 1),
          };
        })
      : [...INITIAL_SECTORES_IAF];
  return mapped
    .filter((s) => !archivedIds.has(s.id))
    .sort((a, b) => a.sector - b.sector);
}

function getResolvedSubsectoresCatalog(): SubsectorIafEntity[] {
  const archivedIds = state.archiveGovernance.archivedCatalogIds;
  const raw =
    state.domainData.iafSubsectors.length > 0
      ? state.domainData.iafSubsectors
      : INITIAL_SUBSECTORES_IAF;
  return raw.filter((sub) => !archivedIds.has(sub.id));
}

function clearAllEntitySelections(): void {
  state.organizacionDomain.selectedOrganizacionId = null;
  state.organizacionDomain.isEditingAttributes = false;
  state.organizacionDomain.formDraft = undefined;
  state.organizacionDomain.editFormData = undefined;
  state.organizacionDomain.editErrorMessage = null;
  state.organizacionDomain.isCreating = false;

  state.clientAccessDomain.selectedAccessId = null;
  state.clientAccessDomain.prefillOrganizacionId = null;
  state.clientAccessDomain.isCreating = false;
  state.clientAccessDomain.isEditingAttributes = false;
  state.clientAccessDomain.formDraft = undefined;
  state.clientAccessDomain.editErrorMessage = null;

  state.certificadoDomain.selectedCertId = null;
  state.certificadoDomain.isEditingAttributes = false;
  state.certificadoDomain.formDraft = undefined;
  state.certificadoDomain.editFormData = undefined;
  state.certificadoDomain.editErrorMessage = null;
  state.certificadoDomain.isCreating = false;
  state.certificadoDomain.createErrorMessage = null;

  state.sitioDomain.selectedSitioId = null;
  state.sitioDomain.isCreating = false;
  state.sitioDomain.prefillCertId = null;
  state.sitioDomain.isEditingAttributes = false;
  state.sitioDomain.formDraft = undefined;
  state.sitioDomain.editFormData = undefined;
  state.sitioDomain.editErrorMessage = null;
  state.sitioDomain.archiveConfirmOpen = false;
  state.sitioDomain.archiveErrorMessage = null;
  state.sitioDomain.isAssigningShift = false;

  state.procesoDomain.selectedProcesoId = null;
  state.procesoDomain.isCreating = false;
  state.procesoDomain.prefillCertId = null;
  state.procesoDomain.isEditingAttributes = false;
  state.procesoDomain.formDraft = undefined;
  state.procesoDomain.editFormData = undefined;
  state.procesoDomain.editErrorMessage = null;
  state.procesoDomain.archiveConfirmOpen = false;
  state.procesoDomain.archiveErrorMessage = null;
  state.procesoDomain.isAssigningRequisito = false;

  state.turnoDomain.selectedTurnoId = null;
  state.turnoDomain.originatingSitioId = null;
  state.turnoDomain.isCreating = false;
  state.turnoDomain.prefillCertId = null;
  state.turnoDomain.prefillSitioId = null;
  state.turnoDomain.isEditingAttributes = false;
  state.turnoDomain.formDraft = undefined;
  state.turnoDomain.editFormData = undefined;
  state.turnoDomain.editErrorMessage = null;
  state.turnoDomain.archiveConfirmOpen = false;
  state.turnoDomain.archiveErrorMessage = null;

  state.noAplicableDomain.selectedNoAplicableId = null;
  state.noAplicableDomain.originatingCertId = null;
  state.noAplicableDomain.isCreating = false;
  state.noAplicableDomain.isEditingAttributes = false;
  state.noAplicableDomain.formDraft = undefined;
  state.noAplicableDomain.editErrorMessage = null;
  state.noAplicableDomain.archiveConfirmOpen = false;
  state.noAplicableDomain.archiveErrorMessage = null;

  state.fechaDomain.selectedFechaId = null;
  state.fechaDomain.originatingCertId = null;
  state.fechaDomain.isCreating = false;
  state.fechaDomain.isEditingAttributes = false;
  state.fechaDomain.formDraft = undefined;
  state.fechaDomain.editFormData = undefined;
  state.fechaDomain.editErrorMessage = null;

  state.contactoDomain.selectedContactoId = null;
  state.contactoDomain.originatingCertId = null;
  state.contactoDomain.isCreating = false;
  state.contactoDomain.isEditingAttributes = false;
  state.contactoDomain.formDraft = undefined;
  state.contactoDomain.editFormData = undefined;
  state.contactoDomain.editErrorMessage = null;

  state.telefonoDomain.selectedTelefonoId = null;
  state.telefonoDomain.originatingContactoId = null;
  state.telefonoDomain.isCreating = false;
  state.telefonoDomain.isEditingAttributes = false;
  state.telefonoDomain.formDraft = undefined;
  state.telefonoDomain.editFormData = undefined;
  state.telefonoDomain.editErrorMessage = null;

  state.emailDomain.selectedEmailId = null;
  state.emailDomain.originatingContactoId = null;
  state.emailDomain.isCreating = false;
  state.emailDomain.isEditingAttributes = false;
  state.emailDomain.formDraft = undefined;
  state.emailDomain.editFormData = undefined;
  state.emailDomain.editErrorMessage = null;

  state.auditorDomain.selectedAuditorId = null;
  state.auditorDomain.isEditingAttributes = false;
  state.auditorDomain.formDraft = undefined;
  state.auditorDomain.editFormData = undefined;
  state.auditorDomain.editErrorMessage = null;
  state.auditorDomain.isCreating = false;
  state.auditorDomain.createErrorMessage = null;

  state.competenciaAuditorDomain.isOpen = false;
  state.competenciaAuditorDomain.mode = 'read';
  state.competenciaAuditorDomain.selectedComp = null;
  state.competenciaAuditorDomain.prefillAuditorId = null;
  state.competenciaAuditorDomain.formDraft = undefined;
  state.competenciaAuditorDomain.errorMessage = null;
  state.competenciaAuditorDomain.confirmUnlink = false;

  state.programacionDomain.selectedAuditId = null;
  state.programacionDomain.isEditingAttributes = false;
  state.programacionDomain.isAddingTeamMember = false;
  state.programacionDomain.isPlanningModalOpen = false;
  state.programacionDomain.editErrorMessage = null;
  state.programacionDomain.saveSuccessMessage = null;

  state.calendarioDomain.drawerAuditId = null;
  state.resultadoDomain.inspectingFindingId = null;

  state.extraDomain.selectedNormaId = null;
  state.extraDomain.isCreatingNorma = false;
  state.extraDomain.isEditingNorma = false;
  state.extraDomain.normaFormDraft = undefined;
  state.extraDomain.normaEditError = null;
  state.extraDomain.selectedRequisitoId = null;
  state.extraDomain.prefillRequisitoNormaId = null;
  state.extraDomain.prefillRequisitoPadreId = null;
  state.extraDomain.requisitoReaderScope = 'clause';
  state.extraDomain.requisitoFullNormaQuery = '';
  state.extraDomain.isCreatingRequisito = false;
  state.extraDomain.isEditingRequisito = false;
  state.extraDomain.requisitoEditorMode = 'visual';
  state.extraDomain.requisitoEditorLinkPopoverOpen = false;
  state.extraDomain.requisitoEditorLinkUrl = '';
  state.extraDomain.requisitoEditorLinkLabel = '';
  state.extraDomain.requisitoEditorLinkError = null;
  state.extraDomain.requisitoEditorPickerOpen = false;
  state.extraDomain.requisitoEditorPickerQuery = '';
  state.extraDomain.requisitoFormDraft = undefined;
  state.extraDomain.requisitoEditError = null;
  state.extraDomain.selectedSectorId = null;
  state.extraDomain.isCreatingSector = false;
  state.extraDomain.isEditingSector = false;
  state.extraDomain.sectorFormDraft = undefined;
  state.extraDomain.sectorEditError = null;
  state.extraDomain.selectedSubsectorId = null;
  state.extraDomain.prefillSubsectorSectorId = null;
  state.extraDomain.isCreatingSubsector = false;
  state.extraDomain.isEditingSubsector = false;
  state.extraDomain.subsectorFormDraft = undefined;
  state.extraDomain.subsectorEditError = null;
  state.extraDomain.selectedEstatusId = null;
  state.extraDomain.isCreatingEstatus = false;
  state.extraDomain.isEditingEstatus = false;
  state.extraDomain.estatusFormDraft = undefined;
  state.extraDomain.estatusEditError = null;
  state.extraDomain.selectedTipoId = null;
  state.extraDomain.isCreatingTipo = false;
  state.extraDomain.isEditingTipo = false;
  state.extraDomain.tipoFormDraft = undefined;
  state.extraDomain.tipoEditError = null;
  state.extraDomain.selectedMetodologiaId = null;
  state.extraDomain.isCreatingMetodologia = false;
  state.extraDomain.isEditingMetodologia = false;
  state.extraDomain.metodologiaFormDraft = undefined;
  state.extraDomain.metodologiaEditError = null;
  state.extraDomain.selectedOrganismoId = null;
  state.extraDomain.isCreatingOrganismo = false;
  state.extraDomain.isEditingOrganismo = false;
  state.extraDomain.organismoFormDraft = undefined;
  state.extraDomain.organismoEditError = null;
  state.extraDomain.selectedAccreditationId = null;
  state.extraDomain.isCreatingAccreditation = false;
  state.extraDomain.isEditingAccreditation = false;
  state.extraDomain.accredFormDraft = undefined;
  state.extraDomain.accredEditErrorMessage = null;
}

function applyBreadcrumbSegmentState(targetSeg: BreadcrumbSegment): void {
  state.activeRoute = targetSeg.route;
  state.activeSubSection = targetSeg.subview || null;
  state.openMenu = null;

  clearAllEntitySelections();

  const entityType = inferEntityTypeFromSegment(targetSeg);
  const entityId = targetSeg.entityId || null;
  const tab = targetSeg.tab || null;

  if (entityType === 'org') {
    if (entityId) {
      state.organizacionDomain.selectedOrganizacionId = entityId;
      state.organizacionDomain.activeChildTab =
        tab === 'auditorias'
          ? 'auditorias'
          : tab === 'accesos' && isApprovedStaff()
          ? 'accesos'
          : 'certificados';
    } else if (targetSeg.id === 'org-new' && isApprovedStaff()) {
      state.organizacionDomain.isCreating = true;
      state.organizacionDomain.formDraft = createEmptyOrganizacionFormDraft();
    }
  } else if (entityType === 'acceso_cliente') {
    if (isApprovedStaff()) {
      state.activeRoute = 'certificacion';
      state.activeSubSection = 'organizations';
      if (entityId) {
        state.clientAccessDomain.selectedAccessId = entityId;
      } else if (targetSeg.id === 'acceso_cliente-new') {
        const parentOrgId = targetSeg.parentEntityId || '';
        state.clientAccessDomain.isCreating = true;
        state.clientAccessDomain.prefillOrganizacionId = parentOrgId || null;
        state.clientAccessDomain.formDraft = createEmptyClientAccessFormDraft(parentOrgId);
      }
    }
  } else if (entityType === 'sitio') {
    state.activeRoute = 'certificacion';
    state.activeSubSection = 'certificates';
    if (entityId) {
      state.sitioDomain.selectedSitioId = entityId;
      state.sitioDomain.activeChildTab = tab === 'auditorias' ? 'auditorias' : 'turnos';
    } else if (targetSeg.id === 'sitio-new' && isApprovedStaff()) {
      const parentCertId = targetSeg.parentEntityId || null;
      const parentCert = parentCertId
        ? state.domainData.allCertificadosDetailed.find((c) => c.id === parentCertId)
        : undefined;
      const activeCertSites = parentCert
        ? parentCert.sitios.filter((s) => !state.domainData.archivedSiteIds.has(s.id))
        : [];
      state.sitioDomain.isCreating = true;
      state.sitioDomain.prefillCertId = parentCertId;
      state.sitioDomain.formDraft = createEmptySitioFormDraft(parentCertId, activeCertSites);
    }
  } else if (entityType === 'proceso') {
    state.activeRoute = 'certificacion';
    state.activeSubSection = 'certificates';
    if (entityId) {
      state.procesoDomain.selectedProcesoId = entityId;
      state.procesoDomain.activeChildTab =
        tab === 'hallazgos' || tab === 'auditorias' ? tab : 'requisitos';
    } else if (targetSeg.id === 'proceso-new' && isApprovedStaff()) {
      const parentCertId = targetSeg.parentEntityId || null;
      state.procesoDomain.isCreating = true;
      state.procesoDomain.prefillCertId = parentCertId;
      state.procesoDomain.formDraft = createEmptyProcesoFormDraft(parentCertId);
    }
  } else if (entityType === 'turno') {
    state.activeRoute = 'certificacion';
    state.activeSubSection = 'certificates';
    if (entityId) {
      state.turnoDomain.selectedTurnoId = entityId;
      state.turnoDomain.originatingSitioId = targetSeg.originatingSitioId || null;
      state.turnoDomain.activeChildTab = tab === 'auditorias' ? 'auditorias' : 'sitios';
    } else if (targetSeg.id === 'turno-new' && isApprovedStaff()) {
      const parentCertId = targetSeg.parentEntityId || null;
      const parentCert = parentCertId
        ? state.domainData.allCertificadosDetailed.find((c) => c.id === parentCertId)
        : undefined;
      const defaultSitioId =
        targetSeg.originatingSitioId ||
        (parentCert && parentCert.sitios.length === 1 ? parentCert.sitios[0].id : '');
      state.turnoDomain.isCreating = true;
      state.turnoDomain.prefillCertId = parentCertId;
      state.turnoDomain.prefillSitioId = defaultSitioId || null;
      state.turnoDomain.formDraft = createEmptyTurnoFormDraft(defaultSitioId);
    }
  } else if (entityType === 'no_aplicable') {
    state.activeRoute = 'certificacion';
    state.activeSubSection = 'certificates';
    if (entityId) {
      state.noAplicableDomain.selectedNoAplicableId = entityId;
      state.noAplicableDomain.originatingCertId = targetSeg.parentEntityId || null;
    } else if (targetSeg.id === 'no_aplicable-new' && isApprovedStaff()) {
      const parentCertId = targetSeg.parentEntityId || null;
      state.noAplicableDomain.isCreating = true;
      state.noAplicableDomain.originatingCertId = parentCertId;
      state.noAplicableDomain.formDraft = createEmptyNoAplicableFormDraft(parentCertId);
    }
  } else if (entityType === 'fecha_certificado') {
    state.activeRoute = 'certificacion';
    state.activeSubSection = 'certificates';
    if (entityId) {
      state.fechaDomain.selectedFechaId = entityId;
      state.fechaDomain.originatingCertId = targetSeg.parentEntityId || null;
    } else if (targetSeg.id === 'fecha_certificado-new' && isApprovedStaff()) {
      const parentCertId = targetSeg.parentEntityId || null;
      state.fechaDomain.isCreating = true;
      state.fechaDomain.originatingCertId = parentCertId;
      state.fechaDomain.formDraft = createEmptyFechaFormDraft(parentCertId);
    }
  } else if (entityType === 'contacto_certificado') {
    state.activeRoute = 'certificacion';
    state.activeSubSection = 'certificates';
    if (entityId) {
      state.contactoDomain.selectedContactoId = entityId;
      state.contactoDomain.originatingCertId = targetSeg.parentEntityId || null;
      state.contactoDomain.activeChildTab = tab === 'emails' ? 'emails' : 'telefonos';
    } else if (targetSeg.id === 'contacto_certificado-new' && isApprovedStaff()) {
      const parentCertId = targetSeg.parentEntityId || null;
      state.contactoDomain.isCreating = true;
      state.contactoDomain.originatingCertId = parentCertId;
      state.contactoDomain.formDraft = createEmptyContactoFormDraft(parentCertId);
    }
  } else if (entityType === 'telefono_contacto') {
    state.activeRoute = 'certificacion';
    state.activeSubSection = 'certificates';
    if (entityId) {
      state.telefonoDomain.selectedTelefonoId = entityId;
      state.telefonoDomain.originatingContactoId = targetSeg.parentEntityId || null;
    } else if (targetSeg.id === 'telefono_contacto-new' && isApprovedStaff()) {
      const parentContactoId = targetSeg.parentEntityId || null;
      state.telefonoDomain.isCreating = true;
      state.telefonoDomain.originatingContactoId = parentContactoId;
      state.telefonoDomain.formDraft = createEmptyTelefonoFormDraft(parentContactoId);
    }
  } else if (entityType === 'email_contacto') {
    state.activeRoute = 'certificacion';
    state.activeSubSection = 'certificates';
    if (entityId) {
      state.emailDomain.selectedEmailId = entityId;
      state.emailDomain.originatingContactoId = targetSeg.parentEntityId || null;
    } else if (targetSeg.id === 'email_contacto-new' && isApprovedStaff()) {
      const parentContactoId = targetSeg.parentEntityId || null;
      state.emailDomain.isCreating = true;
      state.emailDomain.originatingContactoId = parentContactoId;
      state.emailDomain.formDraft = createEmptyEmailFormDraft(parentContactoId);
    }
  } else if (entityType === 'cert') {
    if (entityId) {
      state.certificadoDomain.selectedCertId = entityId;
      if (
        tab === 'sitios' ||
        tab === 'procesos' ||
        tab === 'turnos' ||
        tab === 'no_aplicables' ||
        tab === 'auditorias' ||
        tab === 'fechas' ||
        tab === 'contactos'
      ) {
        state.certificadoDomain.activeChildTab = tab;
      } else {
        state.certificadoDomain.activeChildTab = 'sitios';
      }
    } else if (targetSeg.id === 'cert-new' && isApprovedStaff()) {
      state.certificadoDomain.isCreating = true;
      state.certificadoDomain.formDraft = {
        ...createEmptyCertificadoFormDraft(),
        id_organizacion: targetSeg.parentEntityId || '',
      };
    }
  } else if (entityType === 'auditor') {
    if (entityId) {
      state.auditorDomain.selectedAuditorId = entityId;
      state.auditorDomain.activeChildTab = tab === 'historial' ? 'historial' : 'competencias';
    } else if (targetSeg.id === 'auditor-new' && isApprovedStaff()) {
      state.auditorDomain.isCreating = true;
      state.auditorDomain.formDraft = createEmptyAuditorFormDraft();
    }
  } else if (entityType === 'competencia_auditor') {
    state.activeRoute = 'certificacion';
    state.activeSubSection = 'auditors';
    if (targetSeg.id === 'competencia_auditor-new' && isApprovedStaff()) {
      const parentAudId = targetSeg.parentEntityId || '';
      state.competenciaAuditorDomain = {
        isOpen: true,
        mode: 'add',
        selectedComp: null,
        prefillAuditorId: parentAudId || null,
        formDraft: createEmptyCompetenciaFormDraft(parentAudId, 'norma'),
        errorMessage: null,
        confirmUnlink: false,
      };
    } else if (entityId) {
      const [compAudId, compTipoRaw, compTargetId] = entityId.split(':');
      const compTipo: CompetenciaTipo =
        compTipoRaw === 'sector_iaf' || compTipoRaw === 'subsector_iaf'
          ? compTipoRaw
          : 'norma';
      if (compAudId && compTargetId) {
        const selectedComp: SelectedCompetenciaAuditor = {
          id_auditor: compAudId,
          tipo: compTipo,
          targetId: compTargetId,
        };
        state.competenciaAuditorDomain = {
          isOpen: true,
          mode: 'read',
          selectedComp,
          prefillAuditorId: compAudId,
          formDraft: undefined,
          errorMessage: null,
          confirmUnlink: false,
        };
      }
    }
  } else if (entityType === 'audit' && entityId) {
    if (targetSeg.subview === 'findings') {
      state.resultadoDomain.activeAuditIdForDecision = entityId;
      state.resultadoDomain.selectedAuditId = entityId;
    } else {
      state.programacionDomain.selectedAuditId = entityId;
      state.programacionDomain.activeChildTab =
        tab === 'muestreo' || tab === 'matriz' || tab === 'hallazgos' ? tab : 'equipo';
    }
  } else if (entityType === 'norma') {
    if (entityId) {
      state.extraDomain.selectedNormaId = entityId;
      state.extraDomain.activeNormaTab =
        tab === 'acreditacion' || tab === 'certificados' ? tab : 'requisitos';
    } else if (targetSeg.id === 'norma-new' && isApprovedStaff()) {
      state.extraDomain.isCreatingNorma = true;
      state.extraDomain.normaFormDraft = createEmptyNormaFormDraft();
    }
  } else if (entityType === 'requisito') {
    state.activeRoute = 'extra';
    state.activeSubSection = 'standards';
    if (tab === 'full_norma' || targetSeg.id.startsWith('requisito-full-')) {
      state.extraDomain.requisitoReaderScope = 'full_norma';
      state.extraDomain.prefillRequisitoNormaId = targetSeg.parentEntityId || null;
      state.extraDomain.selectedRequisitoId = entityId || null;
      state.extraDomain.requisitoFullNormaQuery = '';
      state.extraDomain.requisitoContentCollapsed = false;
    } else if (entityId) {
      state.extraDomain.requisitoReaderScope = 'clause';
      state.extraDomain.selectedRequisitoId = entityId;
      state.extraDomain.activeRequisitoTab = tab === 'procesos' ? 'procesos' : 'subrequisitos';
    } else if (targetSeg.id === 'requisito-new' && isApprovedStaff()) {
      const parentId = targetSeg.parentEntityId || '';
      const matchedParentReq = state.domainData.requirementsCatalog.find((r) => r.id === parentId);
      const prefillNormaId = matchedParentReq ? matchedParentReq.id_norma : parentId;
      const prefillPadreId = matchedParentReq ? matchedParentReq.id : '';
      state.extraDomain.isCreatingRequisito = true;
      state.extraDomain.prefillRequisitoNormaId = prefillNormaId || null;
      state.extraDomain.prefillRequisitoPadreId = prefillPadreId || null;
      state.extraDomain.requisitoFormDraft = createEmptyRequisitoFormDraft(
        prefillNormaId,
        prefillPadreId
      );
    }
  } else if (entityType === 'sector_iaf') {
    if (entityId) {
      state.extraDomain.selectedSectorId = entityId;
      state.extraDomain.activeSectorTab =
        tab === 'auditores' || tab === 'acreditaciones' || tab === 'certificados'
          ? tab
          : 'subsectores';
    } else if (targetSeg.id === 'sector_iaf-new' && isApprovedStaff()) {
      state.extraDomain.isCreatingSector = true;
      state.extraDomain.sectorFormDraft = createEmptySectorIafFormDraft();
    }
  } else if (entityType === 'subsector_iaf') {
    if (entityId) {
      state.extraDomain.selectedSubsectorId = entityId;
      state.extraDomain.activeSubsectorTab =
        tab === 'auditores' ? 'auditores' : 'certificados';
    } else if (targetSeg.id === 'subsector_iaf-new' && isApprovedStaff()) {
      const parentSecId = targetSeg.parentEntityId || '';
      state.extraDomain.prefillSubsectorSectorId = parentSecId || null;
      state.extraDomain.isCreatingSubsector = true;
      state.extraDomain.subsectorFormDraft = createEmptySubsectorIafFormDraft(parentSecId);
    }
  } else if (entityType === 'organismo_acreditacion') {
    if (entityId) {
      state.extraDomain.selectedOrganismoId = entityId;
      state.extraDomain.activeOrganismoTab = 'acreditaciones';
    } else if (targetSeg.id === 'organismo_acreditacion-new' && isApprovedStaff()) {
      state.extraDomain.isCreatingOrganismo = true;
      state.extraDomain.organismoFormDraft = createEmptyOrganismoFormDraft();
    }
  } else if (entityType === 'accreditation') {
    if (entityId) {
      state.extraDomain.selectedAccreditationId = entityId;
      state.extraDomain.activeAccreditationTab =
        tab === 'subsectores' ? 'subsectores' : 'certificados';
    } else if (targetSeg.id === 'accreditation-new' && isApprovedStaff()) {
      state.extraDomain.isCreatingAccreditation = true;
      state.extraDomain.accredFormDraft = createEmptyAcreditacionFormDraft(
        targetSeg.parentEntityId ? { id_organismo: targetSeg.parentEntityId } : undefined
      );
    }
  } else if (entityType === 'estatus') {
    if (entityId) {
      state.extraDomain.selectedEstatusId = entityId;
      state.extraDomain.activeEstatusTab =
        tab === 'auditorias' || tab === 'reglas' ? tab : 'certificados';
    } else if (targetSeg.id === 'estatus-new' && isApprovedStaff()) {
      state.extraDomain.isCreatingEstatus = true;
      state.extraDomain.estatusFormDraft = createEmptyEstatusFormDraft();
    }
  } else if (entityType === 'tipo') {
    if (entityId) {
      state.extraDomain.selectedTipoId = entityId;
    } else if (targetSeg.id === 'tipo-new' && isApprovedStaff()) {
      state.extraDomain.isCreatingTipo = true;
      state.extraDomain.tipoFormDraft = createEmptyTipoFormDraft();
    }
  } else if (entityType === 'metodologia') {
    if (entityId) {
      state.extraDomain.selectedMetodologiaId = entityId;
    } else if (targetSeg.id === 'metodologia-new' && isApprovedStaff()) {
      state.extraDomain.isCreatingMetodologia = true;
      state.extraDomain.metodologiaFormDraft = createEmptyMetodologiaFormDraft();
    }
  }

  if (targetSeg.route === 'profile') {
    state.profileForm = {
      ...state.profileForm,
      nombreInput: state.profile?.nombre || '',
      profileFeedback: null,
      profileError: null,
      passwordFeedback: null,
      passwordError: null,
    };
  }

  syncUrlHash(state.activeRoute, state.activeSubSection);
}

function backtrackToParentBreadcrumb(): void {
  const { trail, target } = popToParentBreadcrumb(state.breadcrumbs);
  state.breadcrumbs = trail;
  if (target) {
    applyBreadcrumbSegmentState(target);
  }
}

function syncCurrentBreadcrumbTab(tab: string): void {
  if (state.breadcrumbs.length === 0) return;
  const lastIdx = state.breadcrumbs.length - 1;
  state.breadcrumbs = state.breadcrumbs.map((seg, idx) =>
    idx === lastIdx ? { ...seg, tab } : seg
  );
}

interface MultiViewDomainAdapter {
  getQuery: () => string;
  setQuery: (q: string) => void;
  getViewMode: () => 'grid' | 'list';
  setViewMode: (m: 'grid' | 'list') => void;
  getIsSidebarOpen: () => boolean;
  setIsSidebarOpen: (open: boolean) => void;
  getFacetSelections: () => MultiViewSelectionMap;
  setFacetSelections: (next: MultiViewSelectionMap) => void;
  cycleSort: (col: string) => void;
  clearLegacyFilters?: () => void;
}

function getMultiViewDomainAdapter(domainKey: string): MultiViewDomainAdapter | null {
  switch (domainKey) {
    case 'organizaciones':
      return {
        getQuery: () => state.organizacionDomain.query,
        setQuery: (q) => {
          state.organizacionDomain.query = q;
        },
        getViewMode: () => state.organizacionDomain.viewMode,
        setViewMode: (m) => {
          state.organizacionDomain.viewMode = m;
        },
        getIsSidebarOpen: () => state.organizacionDomain.isSidebarOpen ?? true,
        setIsSidebarOpen: (open) => {
          state.organizacionDomain.isSidebarOpen = open;
        },
        getFacetSelections: () => state.organizacionDomain.facetSelections || {},
        setFacetSelections: (next) => {
          state.organizacionDomain.facetSelections = next;
        },
        cycleSort: (col) => {
          if (
            col === 'nombre' ||
            col === 'rif' ||
            col === 'direccion_fiscal' ||
            col === 'certificados_count' ||
            col === 'certificados_activos' ||
            col === 'sector'
          ) {
            if (state.organizacionDomain.sortColumn === col) {
              state.organizacionDomain.sortDirection = cycleSortDirection(
                state.organizacionDomain.sortDirection
              );
            } else {
              state.organizacionDomain.sortColumn = col;
              state.organizacionDomain.sortDirection = 'asc';
            }
          }
        },
        clearLegacyFilters: () => {
          state.organizacionDomain.hasActiveCertificates = 'ALL';
          state.organizacionDomain.selectedSectorIaf = 'ALL';
        },
      };
    case 'certificados':
      return {
        getQuery: () => state.certificadoDomain.query,
        setQuery: (q) => {
          state.certificadoDomain.query = q;
        },
        getViewMode: () => state.certificadoDomain.viewMode,
        setViewMode: (m) => {
          state.certificadoDomain.viewMode = m;
        },
        getIsSidebarOpen: () => state.certificadoDomain.isSidebarOpen ?? true,
        setIsSidebarOpen: (open) => {
          state.certificadoDomain.isSidebarOpen = open;
        },
        getFacetSelections: () => state.certificadoDomain.facetSelections || {},
        setFacetSelections: (next) => {
          state.certificadoDomain.facetSelections = next;
        },
        cycleSort: (col) => {
          if (
            col === 'numero_certificado' ||
            col === 'organizacion' ||
            col === 'norma' ||
            col === 'estatus' ||
            col === 'vigencia' ||
            col === 'sedes'
          ) {
            if (state.certificadoDomain.sortColumn === col) {
              state.certificadoDomain.sortDirection = cycleSortDirection(
                state.certificadoDomain.sortDirection
              );
            } else {
              state.certificadoDomain.sortColumn = col;
              state.certificadoDomain.sortDirection = 'asc';
            }
          }
        },
        clearLegacyFilters: () => {
          state.certificadoDomain.selectedStandard = 'ALL';
          state.certificadoDomain.selectedStatus = 'ALL';
          state.certificadoDomain.selectedSectorIaf = 'ALL';
        },
      };
    case 'auditores':
      return {
        getQuery: () => state.auditorDomain.query,
        setQuery: (q) => {
          state.auditorDomain.query = q;
        },
        getViewMode: () => state.auditorDomain.viewMode,
        setViewMode: (m) => {
          state.auditorDomain.viewMode = m;
        },
        getIsSidebarOpen: () => state.auditorDomain.isSidebarOpen ?? true,
        setIsSidebarOpen: (open) => {
          state.auditorDomain.isSidebarOpen = open;
        },
        getFacetSelections: () => state.auditorDomain.facetSelections || {},
        setFacetSelections: (next) => {
          state.auditorDomain.facetSelections = next;
        },
        cycleSort: (col) => {
          if (
            col === 'nombre' ||
            col === 'codigo_credencial' ||
            col === 'calificacion' ||
            col === 'normas' ||
            col === 'normas_acreditadas' ||
            col === 'sectores' ||
            col === 'sectores_iaf' ||
            col === 'auditorias_count'
          ) {
            const typedCol = col as AuditorSortColumn;
            if (state.auditorDomain.sortColumn === typedCol) {
              state.auditorDomain.sortDirection = cycleSortDirection(
                state.auditorDomain.sortDirection
              );
            } else {
              state.auditorDomain.sortColumn = typedCol;
              state.auditorDomain.sortDirection = 'asc';
            }
          }
        },
        clearLegacyFilters: () => {
          state.auditorDomain.selectedCalificacion = 'ALL';
          state.auditorDomain.selectedStandard = 'ALL';
          state.auditorDomain.selectedSectorIaf = 'ALL';
        },
      };
    case 'programacion':
      return {
        getQuery: () => state.programacionDomain.query,
        setQuery: (q) => {
          state.programacionDomain.query = q;
        },
        getViewMode: () => state.programacionDomain.viewMode,
        setViewMode: (m) => {
          state.programacionDomain.viewMode = m;
        },
        getIsSidebarOpen: () => state.programacionDomain.isSidebarOpen ?? true,
        setIsSidebarOpen: (open) => {
          state.programacionDomain.isSidebarOpen = open;
        },
        getFacetSelections: () => state.programacionDomain.facetSelections || {},
        setFacetSelections: (next) => {
          state.programacionDomain.facetSelections = next;
        },
        cycleSort: (col) => {
          if (
            col === 'codigo' ||
            col === 'organizacion' ||
            col === 'tipo' ||
            col === 'fecha' ||
            col === 'dias' ||
            col === 'estatus'
          ) {
            if (state.programacionDomain.sortColumn === col) {
              state.programacionDomain.sortDirection = cycleSortDirection(
                state.programacionDomain.sortDirection
              );
            } else {
              state.programacionDomain.sortColumn = col;
              state.programacionDomain.sortDirection = 'asc';
            }
          }
        },
        clearLegacyFilters: () => {
          state.programacionDomain.selectedTipo = 'ALL';
          state.programacionDomain.selectedMetodologia = 'ALL';
          state.programacionDomain.selectedEstatus = 'ALL';
          state.programacionDomain.selectedAuditorLider = 'ALL';
        },
      };
    case 'normas':
      return {
        getQuery: () => state.extraDomain.normaSearchQuery,
        setQuery: (q) => {
          state.extraDomain.normaSearchQuery = q;
        },
        getViewMode: () => state.extraDomain.normaViewMode,
        setViewMode: (m) => {
          state.extraDomain.normaViewMode = m;
        },
        getIsSidebarOpen: () => state.extraDomain.normaIsSidebarOpen,
        setIsSidebarOpen: (open) => {
          state.extraDomain.normaIsSidebarOpen = open;
        },
        getFacetSelections: () => state.extraDomain.normaFacetSelections,
        setFacetSelections: (next) => {
          state.extraDomain.normaFacetSelections = next;
        },
        cycleSort: (col) => {
          if (state.extraDomain.normaSortColumn === col) {
            state.extraDomain.normaSortDirection = cycleSortDirection(
              state.extraDomain.normaSortDirection
            );
          } else {
            state.extraDomain.normaSortColumn = col;
            state.extraDomain.normaSortDirection = 'asc';
          }
        },
        clearLegacyFilters: () => {
          state.extraDomain.normaFilterStatus = 'ALL';
          state.extraDomain.normaFilterScheme = 'ALL';
        },
      };
    case 'iaf':
      return {
        getQuery: () => state.extraDomain.iafSearchQuery,
        setQuery: (q) => {
          state.extraDomain.iafSearchQuery = q;
        },
        getViewMode: () => state.extraDomain.iafViewMode,
        setViewMode: (m) => {
          state.extraDomain.iafViewMode = m;
        },
        getIsSidebarOpen: () => state.extraDomain.iafIsSidebarOpen,
        setIsSidebarOpen: (open) => {
          state.extraDomain.iafIsSidebarOpen = open;
        },
        getFacetSelections: () => state.extraDomain.iafFacetSelections,
        setFacetSelections: (next) => {
          state.extraDomain.iafFacetSelections = next;
        },
        cycleSort: (col) => {
          if (state.extraDomain.iafSortColumn === col) {
            state.extraDomain.iafSortDirection = cycleSortDirection(
              state.extraDomain.iafSortDirection
            );
          } else {
            state.extraDomain.iafSortColumn = col;
            state.extraDomain.iafSortDirection = 'asc';
          }
        },
        clearLegacyFilters: () => {
          state.extraDomain.iafFilterRisk = 'ALL';
        },
      };
    case 'estatus':
      return {
        getQuery: () => state.extraDomain.estatusSearchQuery,
        setQuery: (q) => {
          state.extraDomain.estatusSearchQuery = q;
        },
        getViewMode: () => state.extraDomain.estatusViewMode,
        setViewMode: (m) => {
          state.extraDomain.estatusViewMode = m;
        },
        getIsSidebarOpen: () => state.extraDomain.estatusIsSidebarOpen,
        setIsSidebarOpen: (open) => {
          state.extraDomain.estatusIsSidebarOpen = open;
        },
        getFacetSelections: () => state.extraDomain.estatusFacetSelections,
        setFacetSelections: (next) => {
          state.extraDomain.estatusFacetSelections = next;
        },
        cycleSort: (col) => {
          if (state.extraDomain.estatusSortColumn === col) {
            state.extraDomain.estatusSortDirection = cycleSortDirection(
              state.extraDomain.estatusSortDirection
            );
          } else {
            state.extraDomain.estatusSortColumn = col;
            state.extraDomain.estatusSortDirection = 'asc';
          }
        },
      };
    case 'tipos':
      return {
        getQuery: () => state.extraDomain.tipoSearchQuery,
        setQuery: (q) => {
          state.extraDomain.tipoSearchQuery = q;
        },
        getViewMode: () => state.extraDomain.tipoViewMode,
        setViewMode: (m) => {
          state.extraDomain.tipoViewMode = m;
        },
        getIsSidebarOpen: () => state.extraDomain.tipoIsSidebarOpen,
        setIsSidebarOpen: (open) => {
          state.extraDomain.tipoIsSidebarOpen = open;
        },
        getFacetSelections: () => state.extraDomain.tipoFacetSelections,
        setFacetSelections: (next) => {
          state.extraDomain.tipoFacetSelections = next;
        },
        cycleSort: (col) => {
          if (state.extraDomain.tipoSortColumn === col) {
            state.extraDomain.tipoSortDirection = cycleSortDirection(
              state.extraDomain.tipoSortDirection
            );
          } else {
            state.extraDomain.tipoSortColumn = col;
            state.extraDomain.tipoSortDirection = 'asc';
          }
        },
      };
    case 'metodologias':
      return {
        getQuery: () => state.extraDomain.metodologiaSearchQuery,
        setQuery: (q) => {
          state.extraDomain.metodologiaSearchQuery = q;
        },
        getViewMode: () => state.extraDomain.metodologiaViewMode,
        setViewMode: (m) => {
          state.extraDomain.metodologiaViewMode = m;
        },
        getIsSidebarOpen: () => state.extraDomain.metodologiaIsSidebarOpen,
        setIsSidebarOpen: (open) => {
          state.extraDomain.metodologiaIsSidebarOpen = open;
        },
        getFacetSelections: () => state.extraDomain.metodologiaFacetSelections,
        setFacetSelections: (next) => {
          state.extraDomain.metodologiaFacetSelections = next;
        },
        cycleSort: (col) => {
          if (state.extraDomain.metodologiaSortColumn === col) {
            state.extraDomain.metodologiaSortDirection = cycleSortDirection(
              state.extraDomain.metodologiaSortDirection
            );
          } else {
            state.extraDomain.metodologiaSortColumn = col;
            state.extraDomain.metodologiaSortDirection = 'asc';
          }
        },
      };
    case 'acreditaciones':
      return {
        getQuery: () => state.extraDomain.accredSearchQuery,
        setQuery: (q) => {
          state.extraDomain.accredSearchQuery = q;
        },
        getViewMode: () => state.extraDomain.accredViewMode,
        setViewMode: (m) => {
          state.extraDomain.accredViewMode = m;
        },
        getIsSidebarOpen: () => state.extraDomain.accredIsSidebarOpen,
        setIsSidebarOpen: (open) => {
          state.extraDomain.accredIsSidebarOpen = open;
        },
        getFacetSelections: () => state.extraDomain.accredFacetSelections,
        setFacetSelections: (next) => {
          state.extraDomain.accredFacetSelections = next;
        },
        cycleSort: (col) => {
          if (state.extraDomain.accredSortColumn === col) {
            state.extraDomain.accredSortDirection = cycleSortDirection(
              state.extraDomain.accredSortDirection
            );
          } else {
            state.extraDomain.accredSortColumn = col;
            state.extraDomain.accredSortDirection = 'asc';
          }
        },
      };
    case 'organismos':
      return {
        getQuery: () => state.extraDomain.organismoSearchQuery,
        setQuery: (q) => {
          state.extraDomain.organismoSearchQuery = q;
        },
        getViewMode: () => state.extraDomain.organismoViewMode,
        setViewMode: (m) => {
          state.extraDomain.organismoViewMode = m;
        },
        getIsSidebarOpen: () => state.extraDomain.organismoIsSidebarOpen,
        setIsSidebarOpen: (open) => {
          state.extraDomain.organismoIsSidebarOpen = open;
        },
        getFacetSelections: () => state.extraDomain.organismoFacetSelections,
        setFacetSelections: (next) => {
          state.extraDomain.organismoFacetSelections = next;
        },
        cycleSort: (col) => {
          if (state.extraDomain.organismoSortColumn === col) {
            state.extraDomain.organismoSortDirection = cycleSortDirection(
              state.extraDomain.organismoSortDirection
            );
          } else {
            state.extraDomain.organismoSortColumn = col;
            state.extraDomain.organismoSortDirection = 'asc';
          }
        },
      };
    default:
      return null;
  }
}

function bindMultiViewDirectoryControls(): void {
  document.querySelectorAll<HTMLElement>('[data-mv-domain]').forEach((container) => {
    const domainKey = container.dataset.mvDomain || '';
    const adapter = getMultiViewDomainAdapter(domainKey);
    if (!adapter) return;

    container.querySelectorAll<HTMLElement>('[data-toggle-sidebar="true"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        adapter.setIsSidebarOpen(!adapter.getIsSidebarOpen());
        render();
      });
    });

    container.querySelectorAll<HTMLInputElement>('input[data-facet-checkbox="true"]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const groupId = cb.dataset.facetGroup;
        const value = cb.dataset.facetValue;
        if (!groupId || !value) return;
        adapter.setFacetSelections(
          toggleFacetSelection(adapter.getFacetSelections(), groupId, value)
        );
        render();
      });
    });

    container.querySelectorAll<HTMLElement>('[data-clear-filters="true"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        adapter.setFacetSelections(clearFacetSelections());
        adapter.setQuery('');
        adapter.clearLegacyFilters?.();
        render();
      });
    });

    container
      .querySelectorAll<HTMLInputElement>('input[data-universal-search="true"]')
      .forEach((input) => {
        input.addEventListener('input', () => {
          adapter.setQuery(input.value);
          render();
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && input.value.length > 0) {
            e.preventDefault();
            e.stopPropagation();
            adapter.setQuery('');
            render();
          }
        });
      });

    container.querySelectorAll<HTMLElement>('[data-clear-search="true"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        adapter.setQuery('');
        render();
      });
    });

    container.querySelectorAll<HTMLElement>('[data-view-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.viewMode;
        if (mode === 'grid' || mode === 'list') {
          adapter.setViewMode(mode);
          render();
        }
      });
    });

    container.querySelectorAll<HTMLElement>('[data-sort-col]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const col = btn.dataset.sortCol;
        if (!col) return;
        adapter.cycleSort(col);
        render();
      });
    });

    container
      .querySelectorAll<HTMLInputElement>('[data-action="toggle-show-archived"]')
      .forEach((checkbox) => {
        checkbox.addEventListener('change', () => {
          if (!canInspectArchivedRecords(state.profile)) {
            checkbox.checked = false;
            state.archiveGovernance.showArchived = false;
            return;
          }
          state.archiveGovernance.showArchived = checkbox.checked;
          if (checkbox.checked) {
            void loadArchivedRecordsForAdmin();
          }
          render();
        });
      });

    container
      .querySelectorAll<HTMLElement>('[data-action="restore-archived-record"]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          if (!canInspectArchivedRecords(state.profile)) return;
          const tableName = btn.dataset.restoreTable as ArchivableTable | undefined;
          const recordId = btn.dataset.restoreId;
          if (!tableName || !recordId) return;
          void handleRestoreArchivedRecord(tableName, recordId);
        });
      });
  });
}

function bindResizableTables(): void {
  document.querySelectorAll<HTMLTableElement>('table[data-resizable-table]').forEach((table) => {
    if (table.dataset.resizeBound === 'true') return;
    table.dataset.resizeBound = 'true';
    const tableId = table.dataset.resizableTable || '';
    const cols = Array.from(table.querySelectorAll<HTMLTableColElement>('colgroup col[data-col-id]'));
    if (cols.length < 2) return;

    const columnOrder = cols.map((col) => col.dataset.colId || '').filter(Boolean);
    const minWidthsPx: Record<string, number> = {};
    const domWidths: Record<string, number> = {};
    for (const col of cols) {
      const id = col.dataset.colId || '';
      if (!id) continue;
      const minPx = Number(col.dataset.minWidth || DEFAULT_MIN_COLUMN_WIDTH_PX);
      minWidthsPx[id] = Number.isFinite(minPx) && minPx > 0 ? minPx : DEFAULT_MIN_COLUMN_WIDTH_PX;
      const pct = parseFloat(col.style.width);
      if (Number.isFinite(pct) && pct > 0) {
        domWidths[id] = pct;
      }
    }

    const stored = tableId ? state.tableColumnWidths[tableId] : undefined;
    if (stored && Object.keys(stored).length > 0) {
      const restored = resolveColumnWidthPercentages(
        columnOrder.map((id) => ({ id, defaultWidthPct: domWidths[id] })),
        stored
      );
      cols.forEach((col) => {
        const id = col.dataset.colId || '';
        const pct = restored[id];
        if (id && typeof pct === 'number') {
          col.style.width = `${pct.toFixed(2)}%`;
        }
      });
    }

    table.querySelectorAll<HTMLElement>('[data-resize-col]').forEach((handle) => {
      handle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });

      handle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        const leftColumnId = handle.dataset.resizeCol || '';
        if (!leftColumnId) return;

        e.preventDefault();
        e.stopPropagation();

        const tableWidthPx = table.getBoundingClientRect().width;
        if (tableWidthPx <= 0) return;

        const rawStartWidths: Record<string, number> = {};
        cols.forEach((col) => {
          const id = col.dataset.colId || '';
          if (!id) return;
          const stylePct = parseFloat(col.style.width);
          const rectPct = (col.getBoundingClientRect().width / tableWidthPx) * 100;
          rawStartWidths[id] =
            Number.isFinite(stylePct) && stylePct > 0
              ? stylePct
              : Math.max(4, rectPct || 100 / cols.length);
        });

        const startWidths = resolveColumnWidthPercentages(
          columnOrder.map((id) => ({ id, defaultWidthPct: rawStartWidths[id] }))
        );
        const startX = e.clientX;
        let latestWidths: Record<string, number> = { ...startWidths };
        let didDrag = false;

        const onPointerMove = (moveEvent: PointerEvent) => {
          const deltaPx = moveEvent.clientX - startX;
          if (Math.abs(deltaPx) > 2) {
            didDrag = true;
          }
          latestWidths = resizeAdjacentColumns({
            currentWidths: startWidths,
            columnOrder,
            leftColumnId,
            deltaPx,
            tableWidthPx,
            minWidthsPx,
          });
          cols.forEach((col) => {
            const id = col.dataset.colId || '';
            const pct = latestWidths[id];
            if (id && typeof pct === 'number') {
              col.style.width = `${pct.toFixed(2)}%`;
            }
          });
        };

        const finishResize = () => {
          window.removeEventListener('pointermove', onPointerMove);
          window.removeEventListener('pointerup', finishResize);
          window.removeEventListener('pointercancel', finishResize);
          if (didDrag) {
            if (tableId) {
              state.tableColumnWidths[tableId] = latestWidths;
            }
            const suppressClick = (clickEvt: MouseEvent) => {
              clickEvt.preventDefault();
              clickEvt.stopPropagation();
            };
            table.addEventListener('click', suppressClick, { capture: true, once: true });
            window.setTimeout(() => {
              table.removeEventListener('click', suppressClick, { capture: true });
            }, 60);
          }
        };

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', finishResize);
        window.addEventListener('pointercancel', finishResize);
      });
    });
  });

  document
    .querySelectorAll<HTMLElement>('tr[tabindex="0"][data-action], [role="button"][tabindex="0"][data-action]')
    .forEach((row) => {
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          const target = e.target as HTMLElement | null;
          if (target && target !== row && target.closest('button, a, input, select, textarea')) {
            return;
          }
          e.preventDefault();
          row.click();
        }
      });
    });
}

function bindAuthenticatedEvents(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-menu-toggle]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetMenu = btn.dataset.menuToggle as HeaderDropdownId | undefined;
      if (!targetMenu) return;
      state.openMenu = state.openMenu === targetMenu ? null : targetMenu;
      render();
    });
  });

  document.getElementById('signOutBtn')?.addEventListener('click', () => {
    void handleSignOut();
  });

  // Persistent Breadcrumb Trail Navigation Backtracking
  document.querySelectorAll<HTMLElement>('[data-breadcrumb-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const segId = btn.dataset.breadcrumbId;
      if (!segId) return;
      const targetSeg = state.breadcrumbs.find((s) => s.id === segId);
      const allowAuditorContextual =
        state.profile?.role === 'AUDITOR' &&
        state.profile?.status === 'APPROVED' &&
        targetSeg?.route === 'certificacion' &&
        Boolean(targetSeg.entityId);
      if (targetSeg && !canAccessRoute(state.profile, targetSeg.route) && !allowAuditorContextual) {
        return;
      }

      state.breadcrumbs = popToBreadcrumb(state.breadcrumbs, segId);

      if (targetSeg) {
        applyBreadcrumbSegmentState(targetSeg);
      }
      render();
    });
  });

  document.querySelectorAll<HTMLElement>('[data-nav]').forEach((el) => {
    el.addEventListener('click', () => {
      if (el.dataset.navBack === 'true') {
        backtrackToParentBreadcrumb();
        render();
        return;
      }
      if (el.dataset.parentNav === 'true') {
        return;
      }

      const target = el.dataset.nav as ActiveRoute | undefined;
      if (!target || !canAccessRoute(state.profile, target)) return;
      const rawSubview = el.dataset.subview || null;
      const subview =
        target === 'auditorias' || target === 'certificacion' || target === 'extra'
          ? normalizeDomainSubview(target, rawSubview)
          : null;
      const isHeaderReset = el.dataset.navReset === 'true';

      state.activeRoute = target;
      state.activeSubSection = subview;
      state.openMenu = null;

      clearAllEntitySelections();

      if (isHeaderReset) {
        // Top Header Reset Rule: ONLY reset breadcrumb trail on top-header triggers
        state.breadcrumbs = resetBreadcrumbToDomain(target, subview);
        if (target === 'dashboard') {
          state.auditLogModal.isOpen = false;
          state.auditLogModal.errorMessage = null;
          state.archiveGovernance.modal.isOpen = false;
          state.auditPlanning.isModalOpen = false;
        }
      } else if (target === 'auditorias' || target === 'certificacion' || target === 'extra') {
        const subLabel = subview ? getSubviewLabel(target, subview) : getDomainLabel(target);
        state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
          id: subview ? `subview-${target}-${subview}` : `domain-${target}`,
          label: subLabel,
          route: target,
          subview,
          tooltip: `${getDomainLabel(target)}${subview ? ` > ${subLabel}` : ''}`,
        });
      }

      if (target === 'auditorias') {
        state.resultadoDomain.recommendationError = null;
        state.resultadoDomain.recommendationSuccess = null;
      }

      if (target === 'profile') {
        state.profileForm = {
          ...state.profileForm,
          nombreInput: state.profile?.nombre || '',
          profileFeedback: null,
          profileError: null,
          passwordFeedback: null,
          passwordError: null,
        };
      }

      syncUrlHash(target, state.activeSubSection);
      render();

      if (target === 'approvals' && isApprovedStaff()) {
        void loadApprovalProfiles();
      } else if (target === 'database' && isApprovedAdmin() && state.dbCheck.lastCheckedAt === null) {
        void runHealthChecks();
      }
    });
  });

  // Standardized Detail Template Parent Zone Contextual Navigation (pushBreadcrumb, preserving domain lineage)
  document.querySelectorAll<HTMLElement>('[data-parent-nav="true"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetNav = btn.dataset.nav as ActiveRoute | undefined;
      const rawSubview = btn.dataset.subview || null;
      const parentType = btn.dataset.parentType as BreadcrumbEntityType | undefined;
      const entityId = btn.dataset.entityId || '';
      const sectorNumber = btn.dataset.sectorNumber || '';

      if (!targetNav) return;
      const allowAuditorContextual =
        state.profile?.role === 'AUDITOR' &&
        state.profile?.status === 'APPROVED' &&
        targetNav === 'certificacion' &&
        Boolean(entityId);
      if (!canAccessRoute(state.profile, targetNav) && !allowAuditorContextual) {
        return;
      }

      const subview =
        targetNav === 'auditorias' || targetNav === 'certificacion' || targetNav === 'extra'
          ? normalizeDomainSubview(targetNav, rawSubview)
          : null;

      if (parentType === 'org' && entityId) {
        const org =
          state.domainData.allOrganizaciones.find((o) => o.id === entityId) ||
          INITIAL_ORGANIZACIONES.find((o) => o.id === entityId);
        const requestedTab = btn.dataset.targetTab as OrganizacionChildTab | undefined;
        const resolvedOrgTab: OrganizacionChildTab =
          requestedTab === 'auditorias'
            ? 'auditorias'
            : requestedTab === 'accesos' && isApprovedStaff()
            ? 'accesos'
            : 'certificados';
        clearAllEntitySelections();
        state.activeRoute = 'certificacion';
        state.activeSubSection = 'organizations';
        state.organizacionDomain.selectedOrganizacionId = entityId;
        state.organizacionDomain.activeChildTab = resolvedOrgTab;
        state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
          id: `org-${entityId}`,
          label: org?.nombre || 'Organización',
          route: 'certificacion',
          subview: 'organizations',
          entityType: 'org',
          entityId,
          tab: resolvedOrgTab,
          tooltip: `Organización > ${org?.nombre || entityId}`,
        });
        syncUrlHash('certificacion', 'organizations');
        render();
        return;
      }

      if (parentType === 'sitio' && entityId) {
        const resolvedSitio = resolveSitioDetailById({
          sitioId: entityId,
          certificates: state.domainData.allCertificadosDetailed,
          programacionAudits: state.domainData.programacionAudits,
          shiftCatalog: state.domainData.shiftCatalog,
          archivedSiteIds: state.domainData.archivedSiteIds,
        });
        if (resolvedSitio) {
          clearAllEntitySelections();
          state.activeRoute = 'certificacion';
          state.activeSubSection = 'certificates';
          state.sitioDomain.selectedSitioId = entityId;
          state.sitioDomain.activeChildTab = 'turnos';
          state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
            id: `sitio-${entityId}`,
            label: `Sitio ${resolvedSitio.numero_sitio}`,
            route: 'certificacion',
            subview: 'certificates',
            entityType: 'sitio',
            entityId,
            tab: 'turnos',
            tooltip: `Certificado ${resolvedSitio.numero_certificado} > Sitio ${resolvedSitio.numero_sitio} — ${resolvedSitio.nombre_sitio}`,
          });
          syncUrlHash('certificacion', 'certificates');
          render();
        }
        return;
      }

      if (parentType === 'cert' && entityId) {
        const cert =
          state.domainData.allCertificadosDetailed.find((c) => c.id === entityId) ||
          INITIAL_CERTIFICADOS_DETAILED.find((c) => c.id === entityId);
        const requestedTab = btn.dataset.targetTab as CertificadoChildTab | undefined;
        const resolvedCertTab: CertificadoChildTab =
          requestedTab === 'sitios' ||
          requestedTab === 'procesos' ||
          requestedTab === 'turnos' ||
          requestedTab === 'no_aplicables' ||
          requestedTab === 'auditorias' ||
          requestedTab === 'fechas' ||
          requestedTab === 'contactos'
            ? requestedTab
            : 'sitios';
        clearAllEntitySelections();
        state.activeRoute = 'certificacion';
        state.activeSubSection = 'certificates';
        state.certificadoDomain.selectedCertId = entityId;
        state.certificadoDomain.activeChildTab = resolvedCertTab;
        state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
          id: `cert-${entityId}`,
          label: cert?.numero_certificado || 'Certificado',
          route: 'certificacion',
          subview: 'certificates',
          entityType: 'cert',
          entityId,
          tab: resolvedCertTab,
          tooltip: `Certificado > ${cert?.numero_certificado || entityId}`,
        });
        syncUrlHash('certificacion', 'certificates');
        render();
        return;
      }

      if (parentType === 'contacto_certificado' && entityId) {
        const resolvedContacto = resolveContactoDetailById({
          contactoId: entityId,
          certificates: state.domainData.allCertificadosDetailed,
          archivedContactoIds: state.domainData.archivedContactoIds,
          archivedTelefonoIds: state.domainData.archivedTelefonoIds,
          archivedEmailIds: state.domainData.archivedEmailIds,
        });
        if (resolvedContacto) {
          const requestedTab = btn.dataset.targetTab;
          const resolvedTab: ContactoChildTab =
            requestedTab === 'emails' ? 'emails' : 'telefonos';
          clearAllEntitySelections();
          state.activeRoute = 'certificacion';
          state.activeSubSection = 'certificates';
          state.contactoDomain.selectedContactoId = entityId;
          state.contactoDomain.activeChildTab = resolvedTab;
          state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
            id: `contacto-${entityId}`,
            label: resolvedContacto.nombre,
            route: 'certificacion',
            subview: 'certificates',
            entityType: 'contacto_certificado',
            entityId,
            tab: resolvedTab,
            tooltip: `Certificado ${resolvedContacto.numero_certificado} > Contacto: ${resolvedContacto.nombre}`,
          });
          syncUrlHash('certificacion', 'certificates');
          render();
        }
        return;
      }

      if (parentType === 'norma') {
        const entityValue = (btn.dataset.entityValue || '').trim().toLowerCase();
        const matchedNorma =
          state.domainData.standards.find(
            (s) =>
              (entityId && s.id === entityId) ||
              (entityValue &&
                ((s.codigo || '').toLowerCase() === entityValue ||
                  s.norma.toLowerCase() === entityValue))
          ) ||
          INITIAL_NORMAS.find(
            (n) =>
              (entityId && n.id === entityId) ||
              (entityValue &&
                (n.codigo.toLowerCase() === entityValue || n.norma.toLowerCase() === entityValue))
          );
        const resolvedId = matchedNorma?.id || entityId || null;
        const requestedNormaTab = btn.dataset.targetTab;
        const resolvedNormaTab: 'requisitos' | 'acreditacion' | 'certificados' =
          requestedNormaTab === 'acreditacion' || requestedNormaTab === 'certificados'
            ? requestedNormaTab
            : 'requisitos';
        clearAllEntitySelections();
        state.activeRoute = 'extra';
        state.activeSubSection = 'standards';
        state.extraDomain.selectedNormaId = resolvedId;
        state.extraDomain.activeNormaTab = resolvedNormaTab;
        state.extraDomain.normaRequisitoQuery = '';
        if (resolvedId) {
          const normaLabel = matchedNorma?.codigo || matchedNorma?.norma || 'Norma ISO';
          state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
            id: `norma-${resolvedId}`,
            label: normaLabel,
            route: 'extra',
            subview: 'standards',
            entityType: 'norma',
            entityId: resolvedId,
            tab: resolvedNormaTab,
            tooltip: `Norma ISO > ${normaLabel}`,
          });
        }
        syncUrlHash('extra', 'standards');
        render();
        return;
      }

      if (parentType === 'requisito' && entityId) {
        const targetTab = btn.dataset.targetTab;
        const matchedReq = getResolvedRequisitosCatalog().find((r) => r.id === entityId);
        const resolvedClauseId = matchedReq?.id || entityId;
        clearAllEntitySelections();
        state.activeRoute = 'extra';
        state.activeSubSection = 'standards';
        state.extraDomain.selectedRequisitoId = resolvedClauseId;
        state.extraDomain.activeRequisitoTab =
          targetTab === 'procesos' ? 'procesos' : 'subrequisitos';
        state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
          id: `requisito-${resolvedClauseId}`,
          label: matchedReq ? `Cláusula ${matchedReq.codigo}` : 'Requisito LTREE',
          route: 'extra',
          subview: 'standards',
          entityType: 'requisito',
          entityId: resolvedClauseId,
          parentEntityId: matchedReq?.id_requisito_padre || matchedReq?.id_norma || null,
          tab: state.extraDomain.activeRequisitoTab,
          tooltip: matchedReq
            ? `${matchedReq.norma_codigo} · Cláusula ${matchedReq.codigo}`
            : 'Requisito Normativo (LTREE)',
        });
        syncUrlHash('extra', 'standards');
        render();
        return;
      }

      if (parentType === 'sector_iaf') {
        const lookup = entityId || sectorNumber;
        const targetTab = btn.dataset.targetTab;
        const matchedSector =
          state.domainData.iafSectors.find(
            (s) => s.id === lookup || String(s.sector) === lookup || String(s.sector) === sectorNumber
          ) ||
          INITIAL_SECTORES_IAF.find(
            (s) => s.id === lookup || String(s.sector) === lookup || String(s.sector) === sectorNumber
          );
        const resolvedId = matchedSector?.id || entityId || null;
        clearAllEntitySelections();
        state.activeRoute = 'extra';
        state.activeSubSection = 'iaf';
        state.extraDomain.selectedSectorId = resolvedId;
        if (
          targetTab === 'subsectores' ||
          targetTab === 'acreditaciones' ||
          targetTab === 'certificados' ||
          targetTab === 'auditores'
        ) {
          state.extraDomain.activeSectorTab = targetTab;
        }
        if (resolvedId) {
          const secLabel = matchedSector ? `Sector ${matchedSector.sector}` : 'Sector IAF';
          state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
            id: `sector-${resolvedId}`,
            label: secLabel,
            route: 'extra',
            subview: 'iaf',
            entityType: 'sector_iaf',
            entityId: resolvedId,
            tab: state.extraDomain.activeSectorTab,
            tooltip: `Sector IAF > ${matchedSector?.descripcion || secLabel}`,
          });
        }
        syncUrlHash('extra', 'iaf');
        render();
        return;
      }

      if (parentType === 'subsector_iaf' && entityId) {
        const matchedSubsector =
          getResolvedSubsectoresCatalog().find((s) => s.id === entityId) ||
          INITIAL_SUBSECTORES_IAF.find((s) => s.id === entityId);
        clearAllEntitySelections();
        state.activeRoute = 'extra';
        state.activeSubSection = 'iaf';
        state.extraDomain.selectedSubsectorId = matchedSubsector?.id || entityId;
        state.extraDomain.activeSubsectorTab =
          btn.dataset.targetTab === 'auditores' ? 'auditores' : 'certificados';
        state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
          id: `subsector-${matchedSubsector?.id || entityId}`,
          label: matchedSubsector ? `Sub-Sector ${matchedSubsector.codigo}` : 'Sub-Sector IAF',
          route: 'extra',
          subview: 'iaf',
          entityType: 'subsector_iaf',
          entityId: matchedSubsector?.id || entityId,
          parentEntityId: matchedSubsector?.id_sector_iaf || null,
          tab: state.extraDomain.activeSubsectorTab,
          tooltip: matchedSubsector
            ? `Sub-Sector IAF > ${matchedSubsector.codigo} — ${matchedSubsector.descripcion}`
            : 'Sub-Sector IAF',
        });
        syncUrlHash('extra', 'iaf');
        render();
        return;
      }

      if (parentType === 'tipo' && entityId) {
        const matchedTipo = INITIAL_TIPOS_AUDITORIA_CATALOG.find(
          (t) => t.id === entityId || t.tipo.toLowerCase() === entityId.toLowerCase()
        );
        const resolvedId = matchedTipo?.id || entityId;
        state.activeRoute = 'extra';
        state.activeSubSection = 'tipos';
        state.extraDomain.selectedTipoId = resolvedId;
        state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
          id: `tipo-${resolvedId}`,
          label: matchedTipo?.tipo || entityId,
          route: 'extra',
          subview: 'tipos',
          entityType: 'tipo',
          entityId: resolvedId,
          tooltip: `Tipo Auditoría > ${matchedTipo?.tipo || entityId}`,
        });
        syncUrlHash('extra', 'tipos');
        render();
        return;
      }

      if (parentType === 'metodologia' && entityId) {
        const matchedMet = INITIAL_METODOLOGIAS_CATALOG.find(
          (m) => m.id === entityId || m.metodologia.toLowerCase() === entityId.toLowerCase()
        );
        const resolvedId = matchedMet?.id || entityId;
        state.activeRoute = 'extra';
        state.activeSubSection = 'metodologias';
        state.extraDomain.selectedMetodologiaId = resolvedId;
        state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
          id: `metodologia-${resolvedId}`,
          label: matchedMet?.metodologia || entityId,
          route: 'extra',
          subview: 'metodologias',
          entityType: 'metodologia',
          entityId: resolvedId,
          tooltip: `Metodología > ${matchedMet?.metodologia || entityId}`,
        });
        syncUrlHash('extra', 'metodologias');
        render();
        return;
      }

      if (parentType === 'estatus' && entityId) {
        const estatusCatalog =
          state.domainData.estatusCatalog.length > 0
            ? state.domainData.estatusCatalog
            : INITIAL_ESTATUS_CATALOG;
        const entityValue = btn.dataset.entityValue || '';
        const matchedEst = estatusCatalog.find(
          (e) =>
            e.id === entityId ||
            e.estatus.toLowerCase() === entityId.toLowerCase() ||
            (entityValue && e.estatus.toLowerCase() === entityValue.toLowerCase())
        );
        const resolvedId = matchedEst?.id || entityId;
        const resolvedLabel = matchedEst?.estatus || entityValue || entityId;
        clearAllEntitySelections();
        state.activeRoute = 'extra';
        state.activeSubSection = 'estatus';
        state.extraDomain.selectedEstatusId = resolvedId;
        state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
          id: `estatus-${resolvedId}`,
          label: resolvedLabel,
          route: 'extra',
          subview: 'estatus',
          entityType: 'estatus',
          entityId: resolvedId,
          tab: state.extraDomain.activeEstatusTab,
          tooltip: `Estatus > ${resolvedLabel}`,
        });
        syncUrlHash('extra', 'estatus');
        render();
        return;
      }

      if (parentType === 'organismo_acreditacion' && entityId) {
        const org = state.domainData.allOrganismos.find((o) => o.id === entityId);
        clearAllEntitySelections();
        state.activeRoute = 'extra';
        state.activeSubSection = 'organismos';
        state.extraDomain.selectedOrganismoId = entityId;
        state.extraDomain.activeOrganismoTab = 'acreditaciones';
        state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
          id: `organismo_acreditacion-${entityId}`,
          label: org?.codigo || 'Organismo',
          route: 'extra',
          subview: 'organismos',
          entityType: 'organismo_acreditacion',
          entityId,
          tab: 'acreditaciones',
          tooltip: org ? `Organismo > ${org.codigo} · ${org.nombre}` : 'Organismo',
        });
        syncUrlHash('extra', 'organismos');
        render();
        return;
      }

      if (parentType === 'accreditation' && entityId) {
        const acr = state.domainData.allAcreditaciones.find((a) => a.id === entityId);
        clearAllEntitySelections();
        state.activeRoute = 'extra';
        state.activeSubSection = 'accreditations';
        state.extraDomain.selectedAccreditationId = entityId;
        state.extraDomain.activeAccreditationTab = 'certificados';
        state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
          id: `accreditation-${entityId}`,
          label: acr ? `${acr.organismo_codigo} ${acr.numero_acreditacion}` : 'Acreditación',
          route: 'extra',
          subview: 'accreditations',
          entityType: 'accreditation',
          entityId,
          tab: 'certificados',
          tooltip: acr
            ? `Acreditación > ${acr.organismo_codigo} · ${acr.numero_acreditacion}`
            : 'Acreditación',
        });
        syncUrlHash('extra', 'accreditations');
        render();
        return;
      }

      if (parentType === 'auditor' && entityId) {
        const aud =
          state.domainData.allAuditorsDetailed.find((a) => a.id === entityId) ||
          INITIAL_AUDITORES_DETAILED.find((a) => a.id === entityId);
        const requestedTab = btn.dataset.targetTab === 'historial' ? 'historial' : 'competencias';
        clearAllEntitySelections();
        state.activeRoute = 'certificacion';
        state.activeSubSection = 'auditors';
        state.auditorDomain.selectedAuditorId = entityId;
        state.auditorDomain.activeChildTab = requestedTab;
        state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
          id: `aud-${entityId}`,
          label: aud?.nombre || 'Auditor',
          route: 'certificacion',
          subview: 'auditors',
          entityType: 'auditor',
          entityId,
          tab: requestedTab,
          tooltip: `Auditor > ${aud?.nombre || entityId}`,
        });
        syncUrlHash('certificacion', 'auditors');
        render();
        return;
      }

      state.activeRoute = targetNav;
      state.activeSubSection = subview;
      syncUrlHash(targetNav, subview);
      render();
    });
  });

  // Universal Multi View Directory Controls (Phase 4.1.2 — 9 Directories) & Resizable Tables
  bindMultiViewDirectoryControls();
  bindResizableTables();

  // Self-service Profile handlers (Phase 2.2)
  const profileNombreInput = document.getElementById('profileNombreInput') as HTMLInputElement | null;
  profileNombreInput?.addEventListener('input', () => {
    state.profileForm.nombreInput = profileNombreInput.value;
  });

  document.getElementById('profileNameForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('profileNombreInput') as HTMLInputElement | null;
    void handleUpdateOwnProfile(input?.value ?? state.profileForm.nombreInput);
  });

  document.getElementById('togglePasswordSectionBtn')?.addEventListener('click', () => {
    state.profileForm = {
      ...state.profileForm,
      passwordSectionOpen: !state.profileForm.passwordSectionOpen,
      passwordError: null,
      passwordFeedback: null,
      newPasswordInput: '',
      confirmPasswordInput: '',
    };
    render();
  });

  const profileNewPasswordInput = document.getElementById('profileNewPasswordInput') as HTMLInputElement | null;
  profileNewPasswordInput?.addEventListener('input', () => {
    state.profileForm.newPasswordInput = profileNewPasswordInput.value;
  });

  const profileConfirmPasswordInput = document.getElementById('profileConfirmPasswordInput') as HTMLInputElement | null;
  profileConfirmPasswordInput?.addEventListener('input', () => {
    state.profileForm.confirmPasswordInput = profileConfirmPasswordInput.value;
  });

  document.getElementById('profilePasswordForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const newPassEl = document.getElementById('profileNewPasswordInput') as HTMLInputElement | null;
    const confirmPassEl = document.getElementById('profileConfirmPasswordInput') as HTMLInputElement | null;
    void handleUpdateOwnPassword(
      newPassEl?.value ?? state.profileForm.newPasswordInput,
      confirmPassEl?.value ?? state.profileForm.confirmPasswordInput
    );
  });

  document.querySelectorAll<HTMLButtonElement>('[data-approval-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.approvalFilter as ProfileFilter | undefined;
      if (!filter) return;
      state.approvals.filter = filter;
      state.approvals.successMessage = null;
      render();
    });
  });

  document.getElementById('refreshApprovalsBtn')?.addEventListener('click', () => {
    state.approvals.successMessage = null;
    void loadApprovalProfiles();
  });

  document.querySelectorAll<HTMLSelectElement>('[data-role-select]').forEach((select) => {
    select.addEventListener('change', () => {
      const id = select.dataset.roleSelect;
      const nextRole = select.value;
      if (id) void updateProfileRole(id, nextRole);
    });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-approve-user]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.approveUser;
      if (id) void updateProfileStatus(id, 'APPROVED');
    });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-reject-user]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.rejectUser;
      if (id) void updateProfileStatus(id, 'REJECTED');
    });
  });

  document.getElementById('runCheckBtn')?.addEventListener('click', () => {
    void runHealthChecks();
  });

  // Top-Right Changelog Trigger [🕒 Historial de Cambios]
  document.querySelectorAll<HTMLElement>('[data-action="open-changelog"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tableName = btn.dataset.tableName || 'certificado';
      const recordId = btn.dataset.recordId || '';
      const entityName = btn.dataset.entityName || 'Registro';
      void openAuditLogModal(tableName, recordId, entityName);
    });
  });

  // Changelog Modal Close Handlers
  document.getElementById('closeAuditLogModalBtn')?.addEventListener('click', closeAuditLogModal);
  document.getElementById('closeAuditLogModalFooterBtn')?.addEventListener('click', closeAuditLogModal);
  document.getElementById('auditLogModalBackdrop')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeAuditLogModal();
  });

  // Unified Safe Archive Modal Triggers & Controls (Phase 5.1)
  document.querySelectorAll<HTMLElement>('[data-action="open-archive-modal"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!canArchiveRecord(state.profile)) return;
      const tableName = btn.dataset.archiveTable as ArchivableTable | undefined;
      const recordId = btn.dataset.archiveId;
      if (!tableName || !recordId) return;
      void openArchiveModal({
        tableName,
        recordId,
        entityTypeLabel: btn.dataset.archiveEntityLabel || getArchiveTableDisplayLabel(tableName),
        recordTitle: btn.dataset.archiveTitle || 'Registro',
        recordSubtitle: btn.dataset.archiveSubtitle || null,
      });
    });
  });

  const archiveReasonInput = document.getElementById('archiveReasonInput') as HTMLTextAreaElement | null;
  if (archiveReasonInput) {
    archiveReasonInput.addEventListener('input', () => {
      state.archiveGovernance.modal.reason = archiveReasonInput.value.slice(0, ARCHIVE_REASON_MAX_LENGTH);
      const countEl = document.getElementById('archiveReasonCharCount');
      if (countEl) {
        countEl.textContent = String(state.archiveGovernance.modal.reason.length);
      }
    });
  }

  document.getElementById('closeArchiveModalBtn')?.addEventListener('click', closeArchiveModal);
  document.getElementById('cancelArchiveModalBtn')?.addEventListener('click', closeArchiveModal);
  document.getElementById('archiveGovernanceModalBackdrop')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeArchiveModal();
  });
  document.getElementById('confirmArchiveModalBtn')?.addEventListener('click', () => {
    void confirmArchiveRecord();
  });
  document.getElementById('dismissArchiveToastBtn')?.addEventListener('click', () => {
    dismissFloatingToast();
  });

  // Live Scope Textarea Character Counter
  const scopeInput = document.getElementById('detailScopeInput') as HTMLTextAreaElement | null;
  if (scopeInput) {
    scopeInput.addEventListener('input', () => {
      const counterEl = document.getElementById('scopeCharCount');
      if (counterEl) {
        counterEl.textContent = String(scopeInput.value.length);
      }
    });
  }

  // Audit Planning handlers (Phase 5 Programación)
  document.querySelectorAll<HTMLElement>('[data-action="open-plan-audit"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!isApprovedStaff()) return;
      state.auditPlanning.isModalOpen = true;
      state.programacionDomain.isPlanningModalOpen = true;
      render();
    });
  });

  document.querySelectorAll<HTMLElement>('[data-action="close-plan-audit"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.auditPlanning.isModalOpen = false;
      state.programacionDomain.isPlanningModalOpen = false;
      render();
    });
  });

  document.getElementById('planAuditForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!isApprovedStaff()) return;
    const certSelect = document.getElementById('planCertSelect') as HTMLSelectElement | null;
    const typeSelect = document.getElementById('planTypeSelect') as HTMLSelectElement | null;
    const methodSelect = document.getElementById('planMethodologySelect') as HTMLSelectElement | null;
    const dateInput = document.getElementById('planDateInput') as HTMLInputElement | null;
    const endDateInput = document.getElementById('planEndDateInput') as HTMLInputElement | null;
    const daysInput = document.getElementById('planDaysInput') as HTMLInputElement | null;
    const auditorSelect = document.getElementById('planAuditorSelect') as HTMLSelectElement | null;

    if (endDateInput && daysInput) {
      void handleCreatePhase5Audit({
        id_certificado: certSelect?.value || '',
        tipo_auditoria: typeSelect?.value || 'Etapa 1',
        metodologia: (methodSelect?.value || 'Presencial') as AuditMethodology,
        fecha_inicio: dateInput?.value || '2024-11-28',
        fecha_fin: endDateInput?.value || dateInput?.value || '2024-11-29',
        dias_auditor: Math.max(0.5, Number(daysInput.value) || 2),
        auditor_lider_id: auditorSelect?.value || '',
      });
    }
  });

  // ==========================================
  // DOMAIN EXTRA (Phase 3) INTERACTIVE EVENTS
  // ==========================================

  // --- 1. Normas & Standards + Requisitos LTREE Events (Step 2.4 CRUD + Clean List) ---
  const getResolvedRequisitosCatalog = (): RequisitoLtree[] => {
    const archivedIds = state.archiveGovernance.archivedCatalogIds;
    const base =
      state.domainData.requirementsCatalog.length > 0
        ? state.domainData.requirementsCatalog
        : getAllSeededNormaRequirements();
    return base.filter((r) => !r.deleted_at && !archivedIds.has(r.id));
  };

  const recalculateNormaClausulaCounts = (): void => {
    const activeReqs = getResolvedRequisitosCatalog();
    const counts = computeNormaClausulaCounts(
      buildNormaEntitiesForDependencyCheck(),
      activeReqs
    );
    state.domainData.standards = state.domainData.standards.map((st) => ({
      ...st,
      clausulas_count: counts.get(st.id) ?? 0,
    }));
  };

  document.querySelectorAll<HTMLElement>('[data-action="select-norma"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      if (btn.tagName === 'TR' && target?.closest('button, a, input, select')) return;
      const normaId = btn.dataset.normaId;
      if (!normaId) return;
      const norma = getResolvedNormasCatalog().find((n) => n.id === normaId);
      clearAllEntitySelections();
      state.activeRoute = 'extra';
      state.activeSubSection = 'standards';
      state.extraDomain.selectedNormaId = normaId;
      state.extraDomain.activeNormaTab = 'requisitos';
      state.extraDomain.normaRequisitoQuery = '';
      state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
        id: `norma-${normaId}`,
        label: norma?.codigo || 'Norma',
        route: 'extra',
        subview: 'standards',
        entityType: 'norma',
        entityId: normaId,
        tab: 'requisitos',
        tooltip: `Norma ISO > ${norma?.codigo || normaId}`,
      });
      syncUrlHash('extra', 'standards');
      render();
    });
  });

  document.querySelectorAll<HTMLElement>('[data-action="back-to-normas-list"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.navBack === 'true') return;
      state.extraDomain.normaRequisitoQuery = '';
      backtrackToParentBreadcrumb();
      render();
    });
  });

  document.querySelectorAll<HTMLElement>('[data-norma-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.normaTab;
      if (tab === 'acreditacion' || tab === 'requisitos' || tab === 'certificados') {
        state.extraDomain.activeNormaTab = tab;
        syncCurrentBreadcrumbTab(tab);
        render();
      }
    });
  });

  const refreshNormaRequisitosLiveSection = (nextQuery: string): void => {
    state.extraDomain.normaRequisitoQuery = nextQuery;
    const clearBtn = document.getElementById('clearNormaRequisitoSearchBtn');
    if (clearBtn) {
      clearBtn.classList.toggle('hidden', !nextQuery.trim());
    }
    const selectedNorma = getResolvedNormasCatalog().find(
      (n) => n.id === state.extraDomain.selectedNormaId && !n.deleted_at
    );
    if (!selectedNorma) return;

    const normaReqs = getResolvedRequisitosCatalog().filter(
      (r) =>
        !r.deleted_at &&
        (r.id_norma === selectedNorma.id ||
          r.norma_codigo.toLowerCase() === selectedNorma.codigo.toLowerCase())
    );
    const { summaryHtml, tableHtml } = renderNormaRequisitosTableSection({
      requisitos: normaReqs,
      requisitoQuery: nextQuery,
      tableColumnWidths: state.tableColumnWidths['norma-tab-requisitos'],
    });

    const summaryEl = document.getElementById('normaRequisitosScopeSummary');
    if (summaryEl) {
      summaryEl.innerHTML = summaryHtml;
    }
    const containerEl = document.getElementById('normaRequisitosTableContainer');
    if (containerEl) {
      containerEl.innerHTML = tableHtml;
      containerEl
        .querySelectorAll<HTMLElement>('[data-action="select-requisito"]')
        .forEach((rowBtn) => {
          rowBtn.addEventListener('click', (e) => {
            const target = e.target as HTMLElement | null;
            if (rowBtn.tagName === 'TR' && target?.closest('button, a, input, select')) {
              return;
            }
            const reqId = rowBtn.dataset.requisitoId;
            if (reqId) navigateToRequisitoDetail(reqId);
          });
        });
      bindResizableTables();
    }
  };

  const normaReqSearchInput = document.getElementById(
    'normaRequisitoSearchInput'
  ) as HTMLInputElement | null;
  if (normaReqSearchInput) {
    normaReqSearchInput.addEventListener('input', () => {
      refreshNormaRequisitosLiveSection(normaReqSearchInput.value);
    });
    normaReqSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && normaReqSearchInput.value) {
        e.preventDefault();
        normaReqSearchInput.value = '';
        refreshNormaRequisitosLiveSection('');
      }
    });
  }

  document
    .getElementById('clearNormaRequisitoSearchBtn')
    ?.addEventListener('click', () => {
      const inputEl = document.getElementById(
        'normaRequisitoSearchInput'
      ) as HTMLInputElement | null;
      if (inputEl) {
        inputEl.value = '';
        inputEl.focus();
      }
      refreshNormaRequisitosLiveSection('');
    });

  document.querySelectorAll<HTMLElement>('[data-action="open-create-norma"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!isApprovedStaff()) return;
      clearAllEntitySelections();
      state.activeRoute = 'extra';
      state.activeSubSection = 'standards';
      state.extraDomain.isCreatingNorma = true;
      state.extraDomain.isEditingNorma = false;
      state.extraDomain.normaRequisitoQuery = '';
      state.extraDomain.normaFormDraft = createEmptyNormaFormDraft();
      state.extraDomain.normaEditError = null;
      state.breadcrumbs = pushBreadcrumb(
        resetBreadcrumbToDomain('extra', 'standards'),
        createNewEntityBreadcrumbSegment({
          entityType: 'norma',
          label: 'Nueva Norma',
          route: 'extra',
          subview: 'standards',
          tooltip: 'Extra > Norma > Nueva Norma',
        })
      );
      syncUrlHash('extra', 'standards');
      render();
    });
  });

  document.getElementById('startEditNormaBtn')?.addEventListener('click', () => {
    if (!isApprovedStaff()) return;
    const norma = getResolvedNormasCatalog().find(
      (n) => n.id === state.extraDomain.selectedNormaId && !n.deleted_at
    );
    if (!norma) return;
    state.extraDomain.isEditingNorma = true;
    state.extraDomain.normaEditError = null;
    state.extraDomain.normaFormDraft = createNormaDraftFromEntity(norma);
    render();
  });

  document.getElementById('cancelEditNormaBtn')?.addEventListener('click', () => {
    if (state.extraDomain.isCreatingNorma) {
      backtrackToParentBreadcrumb();
      render();
      return;
    }
    state.extraDomain.isEditingNorma = false;
    state.extraDomain.normaFormDraft = undefined;
    state.extraDomain.normaEditError = null;
    render();
  });

  const syncNormaDraftFromDom = (): NormaFormDraft => {
    const rawStatus =
      (document.getElementById('normaEstatusSelect') as HTMLSelectElement | null)?.value ||
      'Vigente';
    const estatus: NormaEntity['estatus'] =
      rawStatus === 'En Revisión' || rawStatus === 'Obsoleta' ? rawStatus : 'Vigente';
    const draft: NormaFormDraft = {
      codigo:
        (document.getElementById('normaCodigoInput') as HTMLInputElement | null)?.value ?? '',
      esquema:
        (document.getElementById('normaEsquemaInput') as HTMLInputElement | null)?.value ?? '',
      norma:
        (document.getElementById('normaNombreInput') as HTMLInputElement | null)?.value ?? '',
      titulo:
        (document.getElementById('normaTituloInput') as HTMLInputElement | null)?.value ?? '',
      estatus,
      fecha_publicacion:
        (document.getElementById('normaFechaPubInput') as HTMLInputElement | null)?.value ?? '',
    };
    state.extraDomain.normaFormDraft = draft;
    return draft;
  };

  [
    'normaCodigoInput',
    'normaEsquemaInput',
    'normaNombreInput',
    'normaEstatusSelect',
    'normaFechaPubInput',
    'normaTituloInput',
  ].forEach((controlId) => {
    const el = document.getElementById(controlId);
    el?.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
      syncNormaDraftFromDom();
    });
  });

  document.getElementById('normaDetailForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!isApprovedStaff()) return;

    const draft = syncNormaDraftFromDom();
    const currentId = state.extraDomain.selectedNormaId;
    const isCreate = !currentId && state.extraDomain.isCreatingNorma;
    const existingNormas = getResolvedNormasCatalog();
    const validation = validateNormaDraft(draft, existingNormas, currentId || undefined);

    if (!validation.valid || !validation.normalized) {
      state.extraDomain.normaEditError =
        validation.error || 'No se pudieron validar los datos de la Norma.';
      render();
      return;
    }

    const normData = validation.normalized;

    void (async () => {
      if (isCreate) {
        let createdId: string = crypto.randomUUID();
        try {
          const { data, error } = await supabase
            .from('norma')
            .insert({
              esquema: normData.esquema,
              codigo: normData.codigo,
              norma: normData.norma,
              titulo: normData.titulo,
              estatus: normData.estatus,
              fecha_publicacion: normData.fecha_publicacion,
            })
            .select('id')
            .single();
          if (error) {
            if (!isMissingTableOrSchemaError(error)) {
              state.extraDomain.normaEditError = translateDatabaseError(error);
              render();
              return;
            }
          } else if (data?.id) {
            createdId = String(data.id);
          }
        } catch {
          // Reactive fallback
        }

        const newStd: StandardRecord = {
          id: createdId,
          esquema: normData.esquema,
          codigo: normData.codigo,
          norma: normData.norma,
          titulo: normData.titulo,
          estatus: normData.estatus,
          fecha_publicacion: normData.fecha_publicacion || undefined,
          clausulas_count: 0,
          acreditaciones_count: 0,
        };
        state.domainData.standards = [newStd, ...state.domainData.standards];

        state.extraDomain.isCreatingNorma = false;
        state.extraDomain.isEditingNorma = false;
        state.extraDomain.selectedNormaId = createdId;
        state.extraDomain.activeNormaTab = 'requisitos';
        state.extraDomain.normaFormDraft = undefined;
        state.extraDomain.normaEditError = null;

        const baseTrail = state.breadcrumbs.filter((seg) => seg.id !== 'norma-new');
        const resolvedBase =
          baseTrail.length > 0 ? baseTrail : resetBreadcrumbToDomain('extra', 'standards');
        state.breadcrumbs = pushBreadcrumb(resolvedBase, {
          id: `norma-${createdId}`,
          label: normData.codigo,
          route: 'extra',
          subview: 'standards',
          entityType: 'norma',
          entityId: createdId,
          tab: 'requisitos',
          tooltip: `Norma ISO > ${normData.codigo}`,
        });

        recordPhase5SessionLog('norma', createdId, 'INSERT', null, normData);
        showFloatingToast(`Norma ${normData.codigo} creada correctamente.`, 'success');
        render();
        return;
      }

      if (!currentId) return;
      const current = existingNormas.find((n) => n.id === currentId && !n.deleted_at);
      if (!current) return;

      if (isValidUuid(currentId)) {
        try {
          const { error } = await supabase
            .from('norma')
            .update({
              esquema: normData.esquema,
              codigo: normData.codigo,
              norma: normData.norma,
              titulo: normData.titulo,
              estatus: normData.estatus,
              fecha_publicacion: normData.fecha_publicacion,
              updated_at: new Date().toISOString(),
            })
            .eq('id', currentId)
            .is('deleted_at', null);
          if (error && !isMissingTableOrSchemaError(error)) {
            state.extraDomain.normaEditError = translateDatabaseError(error);
            render();
            return;
          }
        } catch {
          // Reactive fallback
        }
      }

      const oldSnapshot = {
        esquema: current.esquema,
        codigo: current.codigo,
        norma: current.norma,
        titulo: current.titulo,
        estatus: current.estatus,
        fecha_publicacion: current.fecha_publicacion || null,
      };

      const existsInStandards = state.domainData.standards.some((s) => s.id === currentId);
      if (existsInStandards) {
        state.domainData.standards = state.domainData.standards.map((s) =>
          s.id === currentId
            ? {
                ...s,
                esquema: normData.esquema,
                codigo: normData.codigo,
                norma: normData.norma,
                titulo: normData.titulo,
                estatus: normData.estatus,
                fecha_publicacion: normData.fecha_publicacion || undefined,
              }
            : s
        );
      } else {
        state.domainData.standards = [
          {
            id: currentId,
            esquema: normData.esquema,
            codigo: normData.codigo,
            norma: normData.norma,
            titulo: normData.titulo,
            estatus: normData.estatus,
            fecha_publicacion: normData.fecha_publicacion || undefined,
            clausulas_count: current.clausulas_count,
            acreditaciones_count: current.acreditaciones_count,
          },
          ...state.domainData.standards,
        ];
      }

      // Propagate Norma updates across Requisitos, Acreditaciones, Certificados & Breadcrumbs
      state.domainData.requirementsCatalog = state.domainData.requirementsCatalog.map((r) =>
        r.id_norma === currentId ? { ...r, norma_codigo: normData.codigo } : r
      );
      state.domainData.requirements = state.domainData.requirements.map((r) =>
        r.id_norma === currentId ? { ...r, norma: normData.codigo } : r
      );
      state.domainData.allAcreditaciones = state.domainData.allAcreditaciones.map((a) =>
        a.id_norma === currentId
          ? {
              ...a,
              norma_codigo: normData.codigo,
              norma_titulo: normData.titulo,
              norma_esquema: normData.esquema,
            }
          : a
      );
      state.domainData.allCertificadosDetailed = state.domainData.allCertificadosDetailed.map(
        (c) =>
          c.id_norma === currentId
            ? {
                ...c,
                norma_codigo: normData.codigo,
                norma_titulo: normData.titulo,
                esquema: normData.esquema,
              }
            : c
      );
      state.exploration.records = state.exploration.records.map((rec) =>
        rec.norma_id === currentId
          ? { ...rec, norma: normData.codigo, esquema: normData.esquema }
          : rec
      );
      state.breadcrumbs = state.breadcrumbs.map((seg) =>
        seg.entityType === 'norma' && seg.entityId === currentId
          ? { ...seg, label: normData.codigo, tooltip: `Norma ISO > ${normData.codigo}` }
          : seg
      );

      recordPhase5SessionLog('norma', currentId, 'UPDATE', oldSnapshot, normData);
      state.extraDomain.isEditingNorma = false;
      state.extraDomain.normaFormDraft = undefined;
      state.extraDomain.normaEditError = null;
      showFloatingToast(`Norma ${normData.codigo} actualizada correctamente.`, 'success');
      render();
    })();
  });

  // --- 1b. Requisitos Normativos (LTREE) Events ('read' | 'add' | 'edit' Detail View & Full-Norma Unified Reader) ---
  const navigateToRequisitoDetail = (reqId: string): void => {
    if (!reqId) return;
    const req = getResolvedRequisitosCatalog().find((r) => r.id === reqId);
    if (!req) return;
    clearAllEntitySelections();
    state.activeRoute = 'extra';
    state.activeSubSection = 'standards';
    state.extraDomain.selectedRequisitoId = req.id;
    state.extraDomain.prefillRequisitoNormaId = req.id_norma;
    state.extraDomain.requisitoReaderScope = 'clause';
    state.extraDomain.requisitoFullNormaQuery = '';
    state.extraDomain.activeRequisitoTab = 'subrequisitos';
    state.extraDomain.requisitoContentCollapsed = false;
    state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
      id: `requisito-${req.id}`,
      label: `Cláusula ${req.codigo}`,
      route: 'extra',
      subview: 'standards',
      entityType: 'requisito',
      entityId: req.id,
      parentEntityId: req.id_requisito_padre || req.id_norma || null,
      tab: 'subrequisitos',
      tooltip: `${req.norma_codigo} · Cláusula ${req.codigo}`,
    });
    syncUrlHash('extra', 'standards');
    render();
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
    if (typeof document !== 'undefined') {
      const contentBody = document.getElementById('requisitoHtmlContentBody');
      if (contentBody) {
        contentBody.scrollTop = 0;
      }
    }
  };

  const openFullNormaInRequisito = (
    normaId: string,
    preserveSelectedReqId: string | null = null
  ): void => {
    if (!normaId) return;
    const norma = getResolvedNormasCatalog().find(
      (n) => n.id === normaId && !n.deleted_at
    );
    if (!norma) return;
    const baseBreadcrumbs =
      state.breadcrumbs.length > 0
        ? state.breadcrumbs
        : resetBreadcrumbToDomain('extra', 'standards');
    clearAllEntitySelections();
    state.activeRoute = 'extra';
    state.activeSubSection = 'standards';
    state.extraDomain.prefillRequisitoNormaId = norma.id;
    state.extraDomain.selectedRequisitoId = preserveSelectedReqId;
    state.extraDomain.requisitoReaderScope = 'full_norma';
    state.extraDomain.requisitoFullNormaQuery = '';
    state.extraDomain.requisitoContentCollapsed = false;
    state.breadcrumbs = pushBreadcrumb(baseBreadcrumbs, {
      id: `requisito-full-${norma.id}`,
      label: 'Norma Completa',
      route: 'extra',
      subview: 'standards',
      entityType: 'requisito',
      entityId: null,
      parentEntityId: norma.id,
      tab: 'full_norma',
      tooltip: `${norma.codigo} · Norma Completa`,
    });
    syncUrlHash('extra', 'standards');
    render();
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  };

  const bindRequisitoSelectTriggers = (scopeEl: ParentNode = document): void => {
    scopeEl.querySelectorAll<HTMLElement>('[data-action="select-requisito"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.target as HTMLElement | null;
        if (btn.tagName === 'TR' && target?.closest('button, a, input, select')) return;
        const reqId = btn.dataset.requisitoId;
        if (reqId) navigateToRequisitoDetail(reqId);
      });
    });
  };

  bindRequisitoSelectTriggers(document);

  document
    .querySelectorAll<HTMLElement>('[data-action="open-norma-in-requisito"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        const normaId =
          btn.dataset.normaId || state.extraDomain.selectedNormaId || '';
        if (normaId) openFullNormaInRequisito(normaId, null);
      });
    });

  document
    .querySelectorAll<HTMLElement>('[data-action="set-requisito-reader-scope"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextScope = btn.dataset.readerScope;
        if (nextScope === 'full_norma') {
          const activeReq = state.extraDomain.selectedRequisitoId
            ? getResolvedRequisitosCatalog().find(
                (r) => r.id === state.extraDomain.selectedRequisitoId
              )
            : undefined;
          const normaId =
            btn.dataset.normaId ||
            state.extraDomain.prefillRequisitoNormaId ||
            activeReq?.id_norma ||
            '';
          if (normaId) {
            openFullNormaInRequisito(
              normaId,
              state.extraDomain.selectedRequisitoId
            );
          }
        } else if (nextScope === 'clause') {
          const reqId =
            btn.dataset.requisitoId || state.extraDomain.selectedRequisitoId || '';
          if (reqId) {
            navigateToRequisitoDetail(reqId);
          }
        }
      });
    });

  const refreshRequisitoFullNormaLiveBody = (nextQuery: string): void => {
    state.extraDomain.requisitoFullNormaQuery = nextQuery;
    const clearBtn = document.getElementById('clearRequisitoFullNormaSearchBtn');
    if (clearBtn) {
      const hasQ = nextQuery.trim().length > 0;
      clearBtn.classList.toggle('hidden', !hasQ);
      clearBtn.classList.toggle('inline-flex', hasQ);
    }

    const activeReq = state.extraDomain.selectedRequisitoId
      ? getResolvedRequisitosCatalog().find(
          (r) => r.id === state.extraDomain.selectedRequisitoId
        )
      : undefined;
    const targetNormaId =
      state.extraDomain.prefillRequisitoNormaId || activeReq?.id_norma || '';
    const parentNorma = getResolvedNormasCatalog().find(
      (n) => n.id === targetNormaId && !n.deleted_at
    );
    if (!parentNorma) return;

    const fullLang =
      state.extraDomain.requisitoLangMode === 'both'
        ? 'bilingual'
        : state.extraDomain.requisitoLangMode;
    const fullResult = renderNormaFullReaderBody({
      norma: parentNorma,
      requisitos: getActiveRequisitosForNorma(parentNorma),
      lang: fullLang,
      query: nextQuery,
      interactiveLinks: true,
    });

    const summaryEl = document.getElementById('requisitoFullNormaSummary');
    if (summaryEl) {
      summaryEl.textContent = renderFullNormaSearchSummaryText(fullResult);
    }
    const obligationsEl = document.getElementById('requisitoFullNormaObligations');
    if (obligationsEl) {
      obligationsEl.innerHTML = renderNormativeObligationBadges(
        fullResult.obligationCounts
      );
    }
    const bodyEl = document.getElementById('requisitoHtmlContentBody');
    if (bodyEl) {
      bodyEl.innerHTML = fullResult.bodyHtml;
      bindRequisitoSelectTriggers(bodyEl);
    }
  };

  const fullNormaSearchInput = document.getElementById(
    'requisitoFullNormaSearchInput'
  ) as HTMLInputElement | null;
  if (fullNormaSearchInput) {
    fullNormaSearchInput.addEventListener('input', () => {
      refreshRequisitoFullNormaLiveBody(fullNormaSearchInput.value);
    });
    fullNormaSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && fullNormaSearchInput.value) {
        e.preventDefault();
        fullNormaSearchInput.value = '';
        refreshRequisitoFullNormaLiveBody('');
      }
    });
  }

  document
    .querySelectorAll<HTMLElement>('[data-action="clear-full-norma-search"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        const inputEl = document.getElementById(
          'requisitoFullNormaSearchInput'
        ) as HTMLInputElement | null;
        if (inputEl) {
          inputEl.value = '';
          inputEl.focus();
        }
        refreshRequisitoFullNormaLiveBody('');
      });
    });

  document
    .querySelectorAll<HTMLElement>('[data-action="open-create-requisito"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!isApprovedStaff()) return;
        const prefillNormaId =
          btn.dataset.normaId || state.extraDomain.selectedNormaId || '';
        const prefillPadreId = btn.dataset.parentReqId || '';
        const baseBreadcrumbs =
          state.breadcrumbs.length > 0
            ? state.breadcrumbs
            : resetBreadcrumbToDomain('extra', 'standards');
        clearAllEntitySelections();
        state.activeRoute = 'extra';
        state.activeSubSection = 'standards';
        state.extraDomain.prefillRequisitoNormaId = prefillNormaId || null;
        state.extraDomain.prefillRequisitoPadreId = prefillPadreId || null;
        state.extraDomain.requisitoEditorLang =
          state.extraDomain.requisitoLangMode === 'en' ? 'en' : 'es';
        state.extraDomain.requisitoEditorMode = 'visual';
        state.extraDomain.requisitoEditorLinkPopoverOpen = false;
        state.extraDomain.requisitoEditorLinkUrl = '';
        state.extraDomain.requisitoEditorLinkLabel = '';
        state.extraDomain.requisitoEditorLinkError = null;
        state.extraDomain.requisitoEditorPickerOpen = false;
        state.extraDomain.requisitoEditorPickerQuery = '';
        state.extraDomain.isCreatingRequisito = true;
        state.extraDomain.isEditingRequisito = false;
        state.extraDomain.requisitoFormDraft = createEmptyRequisitoFormDraft(
          prefillNormaId,
          prefillPadreId
        );
        state.extraDomain.requisitoEditError = null;
        state.breadcrumbs = pushBreadcrumb(
          baseBreadcrumbs,
          createNewEntityBreadcrumbSegment({
            entityType: 'requisito',
            label: prefillPadreId ? 'Nuevo Sub-requisito' : 'Nuevo Requisito',
            route: 'extra',
            subview: 'standards',
            parentEntityId: prefillPadreId || prefillNormaId || undefined,
            tooltip: 'Extra > Norma > Nuevo Requisito LTREE',
          })
        );
        syncUrlHash('extra', 'standards');
        render();
      });
    });

  document
    .querySelectorAll<HTMLElement>('[data-action="back-to-requisito-parent"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.navBack === 'true') return;
        backtrackToParentBreadcrumb();
        render();
      });
    });

  document.querySelectorAll<HTMLElement>('[data-requisito-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.requisitoTab;
      if (tab === 'subrequisitos' || tab === 'procesos') {
        state.extraDomain.activeRequisitoTab = tab;
        syncCurrentBreadcrumbTab(tab);
        render();
      }
    });
  });

  document
    .querySelectorAll<HTMLElement>('[data-action="set-requisito-lang-mode"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.langMode;
        if (mode === 'es' || mode === 'en' || mode === 'both') {
          state.extraDomain.requisitoLangMode = mode;
          render();
        }
      });
    });

  document
    .querySelectorAll<HTMLElement>('[data-action="toggle-requisito-content"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        state.extraDomain.requisitoContentCollapsed =
          !state.extraDomain.requisitoContentCollapsed;
        render();
      });
    });

  document
    .querySelectorAll<HTMLElement>('[data-action="select-norma-from-requisito"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        const normaId = btn.dataset.normaId;
        if (!normaId) return;
        const targetTabRaw = btn.dataset.targetTab;
        const targetTab: 'requisitos' | 'acreditacion' | 'certificados' =
          targetTabRaw === 'acreditacion' || targetTabRaw === 'certificados'
            ? targetTabRaw
            : 'requisitos';
        const norma = getResolvedNormasCatalog().find((n) => n.id === normaId);
        clearAllEntitySelections();
        state.activeRoute = 'extra';
        state.activeSubSection = 'standards';
        state.extraDomain.selectedNormaId = normaId;
        state.extraDomain.activeNormaTab = targetTab;
        state.extraDomain.normaRequisitoQuery = '';
        state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
          id: `norma-${normaId}`,
          label: norma?.codigo || 'Norma',
          route: 'extra',
          subview: 'standards',
          entityType: 'norma',
          entityId: normaId,
          tab: targetTab,
          tooltip: `Norma ISO > ${norma?.codigo || normaId}`,
        });
        syncUrlHash('extra', 'standards');
        render();
      });
    });

  document
    .querySelectorAll<HTMLSelectElement>(
      '[data-action="jump-requisito-sibling"], [data-action="jump-requisito-child"]'
    )
    .forEach((sel) => {
      sel.addEventListener('change', () => {
        if (sel.value) {
          navigateToRequisitoDetail(sel.value);
        }
      });
    });

  const enterRequisitoEditMode = (): void => {
    if (!isApprovedStaff()) return;
    const req = getResolvedRequisitosCatalog().find(
      (r) => r.id === state.extraDomain.selectedRequisitoId && !r.deleted_at
    );
    if (!req) return;
    state.extraDomain.isEditingRequisito = true;
    state.extraDomain.requisitoEditorLang =
      state.extraDomain.requisitoLangMode === 'en' ? 'en' : 'es';
    state.extraDomain.requisitoEditorMode = 'visual';
    state.extraDomain.requisitoEditorLinkPopoverOpen = false;
    state.extraDomain.requisitoEditorLinkUrl = '';
    state.extraDomain.requisitoEditorLinkLabel = '';
    state.extraDomain.requisitoEditorLinkError = null;
    state.extraDomain.requisitoEditorPickerOpen = false;
    state.extraDomain.requisitoEditorPickerQuery = '';
    state.extraDomain.requisitoEditError = null;
    state.extraDomain.requisitoFormDraft = createRequisitoDraftFromEntity(req);
    render();
  };

  document.getElementById('startEditRequisitoBtn')?.addEventListener('click', enterRequisitoEditMode);
  document
    .querySelectorAll<HTMLElement>('[data-action="start-edit-requisito"]')
    .forEach((btn) => btn.addEventListener('click', enterRequisitoEditMode));

  document.getElementById('cancelEditRequisitoBtn')?.addEventListener('click', () => {
    state.extraDomain.requisitoEditorLinkPopoverOpen = false;
    state.extraDomain.requisitoEditorLinkUrl = '';
    state.extraDomain.requisitoEditorLinkLabel = '';
    state.extraDomain.requisitoEditorLinkError = null;
    state.extraDomain.requisitoEditorPickerOpen = false;
    state.extraDomain.requisitoEditorPickerQuery = '';
    if (state.extraDomain.isCreatingRequisito) {
      backtrackToParentBreadcrumb();
      render();
      return;
    }
    state.extraDomain.isEditingRequisito = false;
    state.extraDomain.requisitoFormDraft = undefined;
    state.extraDomain.requisitoEditError = null;
    render();
  });

  const syncRequisitoDraftFromDom = (resetParentOnNormaChange = false): RequisitoFormDraft => {
    const prevDraft = state.extraDomain.requisitoFormDraft;
    const id_norma =
      (document.getElementById('reqParentNormaSelect') as HTMLSelectElement | null)?.value ||
      prevDraft?.id_norma ||
      '';
    const id_requisito_padre = resetParentOnNormaChange
      ? ''
      : (document.getElementById('reqParentRequisitoSelect') as HTMLSelectElement | null)
          ?.value ??
        prevDraft?.id_requisito_padre ??
        '';
    const codigo =
      (document.getElementById('reqCodigoInput') as HTMLInputElement | null)?.value ??
      prevDraft?.codigo ??
      '';
    const explicitCodeEl = document.getElementById(
      'reqExplicitCodeInput'
    ) as HTMLInputElement | null;
    const explicit_code = explicitCodeEl
      ? explicitCodeEl.checked
      : prevDraft?.explicit_code ?? false;

    const editorLang: RichTextEditorLang =
      state.extraDomain.requisitoEditorLang === 'en' ? 'en' : 'es';
    const titleInput = document.getElementById('reqEditorTitleInput') as HTMLInputElement | null;
    const visualCanvas = document.getElementById('reqEditorVisualCanvas') as HTMLElement | null;
    const htmlTextarea = document.getElementById(
      'reqEditorHtmlTextarea'
    ) as HTMLTextAreaElement | null;

    let title_es = prevDraft?.title_es ?? '';
    let content_html_es = prevDraft?.content_html_es ?? '';
    let title_en = prevDraft?.title_en ?? '';
    let content_html_en = prevDraft?.content_html_en ?? '';

    const activeTitleVal = titleInput ? titleInput.value : undefined;
    let activeHtmlVal: string | undefined;
    if (visualCanvas && state.extraDomain.requisitoEditorMode === 'visual') {
      activeHtmlVal = normalizeEditorHtmlOutput(visualCanvas.innerHTML);
    } else if (htmlTextarea && state.extraDomain.requisitoEditorMode === 'html') {
      activeHtmlVal = htmlTextarea.value;
    }

    if (editorLang === 'es') {
      if (activeTitleVal !== undefined) title_es = activeTitleVal;
      if (activeHtmlVal !== undefined) content_html_es = activeHtmlVal;
    } else {
      if (activeTitleVal !== undefined) title_en = activeTitleVal;
      if (activeHtmlVal !== undefined) content_html_en = activeHtmlVal;
    }

    const allReqs = getResolvedRequisitosCatalog();
    const parentReq = id_requisito_padre
      ? allReqs.find((r) => r.id === id_requisito_padre)
      : undefined;
    const ruta_materializada = computeRequisitoLtreePath(codigo, parentReq);
    const draft: RequisitoFormDraft = {
      id_norma,
      id_requisito_padre,
      codigo,
      explicit_code,
      es_obligatorio: prevDraft?.es_obligatorio,
      obligatorio_origen: prevDraft?.obligatorio_origen,
      ruta_materializada,
      title_es,
      content_html_es,
      title_en,
      content_html_en,
    };
    state.extraDomain.requisitoFormDraft = draft;
    return draft;
  };

  // --- Bilingual Rich Text Editor Session & In-Place Caret/Autocomplete Controls (Step 4.2) ---
  let savedVisualRange: Range | null = null;
  let savedHtmlSelection: { start: number; end: number } | null = null;
  let inlineAutocompleteState: {
    isOpen: boolean;
    targetType: 'visual' | 'html' | null;
    query: string;
    triggerStart: number;
    cursorOffset: number;
    activeIndex: number;
    textNode: Text | null;
  } = {
    isOpen: false,
    targetType: null,
    query: '',
    triggerStart: 0,
    cursorOffset: 0,
    activeIndex: 0,
    textNode: null,
  };

  const getEditorTargetClauseContext = (draft: RequisitoFormDraft): {
    targetReqId: string | undefined;
    normaReqs: RequisitoLtree[];
    activeLang: RichTextEditorLang;
    activeHtml: string;
  } => {
    const activeLang: RichTextEditorLang =
      state.extraDomain.requisitoEditorLang === 'en' ? 'en' : 'es';
    const isCreate =
      !state.extraDomain.selectedRequisitoId && state.extraDomain.isCreatingRequisito;
    const targetReqId = isCreate
      ? undefined
      : state.extraDomain.selectedRequisitoId || undefined;
    const targetNormaId =
      draft.id_norma ||
      state.extraDomain.prefillRequisitoNormaId ||
      '';
    const allReqs = getResolvedRequisitosCatalog().filter((r) => !r.deleted_at);
    const normaReqs = targetNormaId
      ? allReqs.filter((r) => r.id_norma === targetNormaId)
      : allReqs;
    const activeHtml =
      activeLang === 'es' ? draft.content_html_es || '' : draft.content_html_en || '';
    return { targetReqId, normaReqs, activeLang, activeHtml };
  };

  const refreshEditorPickerOptionsInPlace = (draft: RequisitoFormDraft): void => {
    const listEl = document.getElementById('reqEditorClausePickerList');
    if (!listEl) return;
    const ctx = getEditorTargetClauseContext(draft);
    const options = buildChildPlaceholderSuggestions(
      ctx.targetReqId,
      ctx.normaReqs,
      ctx.activeLang,
      ctx.activeHtml,
      state.extraDomain.requisitoEditorPickerQuery || '',
      draft.id_requisito_padre || undefined
    );
    listEl.innerHTML = renderClausePlaceholderPickerOptions({
      options,
      filterQuery: state.extraDomain.requisitoEditorPickerQuery || '',
      isCreateMode: !ctx.targetReqId,
    });
    listEl
      .querySelectorAll<HTMLElement>('[data-action="insert-clause-placeholder"]')
      .forEach((optBtn) => {
        optBtn.addEventListener('mousedown', (ev) => ev.preventDefault());
        optBtn.addEventListener('click', () => {
          const token = optBtn.dataset.clauseToken;
          if (token) {
            insertClauseTokenAtSavedCursor(token);
          }
        });
      });
  };

  const refreshEditorStatusBadgesInPlace = (draft: RequisitoFormDraft): void => {
    const status = computeBilingualDraftStatus(draft);
    (['es', 'en'] as const).forEach((langKey) => {
      const badgeEl = document.querySelector<HTMLElement>(
        `[data-editor-status-lang="${langKey}"]`
      );
      if (!badgeEl) return;
      const entry = status[langKey];
      badgeEl.textContent = entry.label;
      badgeEl.className = `inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${
        entry.hasContent
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
          : 'bg-slate-100 text-slate-500 border-slate-200'
      }`;
    });

    const footerEl = document.getElementById('reqEditorFooterLangStatus');
    if (footerEl) {
      footerEl.textContent = `ES: ${status.es.label} · EN: ${status.en.label}`;
    }

    const activeLang: RichTextEditorLang =
      state.extraDomain.requisitoEditorLang === 'en' ? 'en' : 'es';
    const activeHtml = activeLang === 'es' ? draft.content_html_es : draft.content_html_en;
    const emptyHintEl = document.getElementById('reqEditorVisualEmptyHint');
    if (emptyHintEl) {
      emptyHintEl.classList.toggle('hidden', hasEditorHtmlContent(activeHtml));
    }

    const ctx = getEditorTargetClauseContext(draft);
    const unreferencedCount = countUnreferencedChildClauses(
      ctx.targetReqId,
      ctx.normaReqs,
      ctx.activeHtml
    );

    const slotBtn = document.querySelector<HTMLElement>(
      '[data-testid="editor-subclause-slot"]'
    );
    if (slotBtn) {
      const pill = slotBtn.querySelector<HTMLElement>('[data-editor-unreferenced-count]');
      if (unreferencedCount > 0) {
        if (pill) {
          pill.textContent = String(unreferencedCount);
          pill.classList.remove('hidden');
        } else {
          const span = document.createElement('span');
          span.setAttribute('data-editor-unreferenced-count', 'true');
          span.className =
            'inline-flex items-center px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200';
          span.textContent = String(unreferencedCount);
          slotBtn.appendChild(span);
        }
      } else if (pill) {
        pill.remove();
      }
    }

    const badgeSlot = document.getElementById('reqEditorUnreferencedBadgeSlot');
    if (badgeSlot) {
      const toolbarDisabled = state.extraDomain.requisitoEditorMode === 'preview';
      if (unreferencedCount > 0 && !toolbarDisabled) {
        const label = `${unreferencedCount} ${
          unreferencedCount === 1
            ? 'sub-cláusula sin referenciar'
            : 'sub-cláusulas sin referenciar'
        }`;
        badgeSlot.innerHTML = `
          <button
            type="button"
            id="reqEditorUnreferencedBadgeBtn"
            data-action="insert-missing-child-clauses"
            data-testid="unreferenced-children-badge"
            title="Insertar ${escapeHtml(label)}"
            class="inline-flex items-center gap-1 min-h-[30px] px-2 py-1 rounded-md border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap"
          >
            <span>${escapeHtml(label)}</span>
          </button>
        `;
        badgeSlot
          .querySelector<HTMLElement>('[data-action="insert-missing-child-clauses"]')
          ?.addEventListener('mousedown', (ev) => ev.preventDefault());
        badgeSlot
          .querySelector<HTMLElement>('[data-action="insert-missing-child-clauses"]')
          ?.addEventListener('click', insertAllMissingChildClauses);
      } else {
        badgeSlot.innerHTML = '';
      }
    }

    if (state.extraDomain.requisitoEditorPickerOpen) {
      refreshEditorPickerOptionsInPlace(draft);
    }
  };

  const captureVisualSelection = (): void => {
    const canvas = document.getElementById('reqEditorVisualCanvas');
    const sel = window.getSelection();
    if (!canvas || !sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (canvas.contains(range.commonAncestorContainer)) {
      savedVisualRange = range.cloneRange();
    }
  };

  const captureHtmlSelection = (): void => {
    const textarea = document.getElementById(
      'reqEditorHtmlTextarea'
    ) as HTMLTextAreaElement | null;
    if (!textarea) return;
    savedHtmlSelection = {
      start: textarea.selectionStart ?? textarea.value.length,
      end: textarea.selectionEnd ?? textarea.value.length,
    };
  };

  const getFilteredAutocompleteOptions = (
    draft: RequisitoFormDraft,
    query: string
  ): ChildPlaceholderOption[] => {
    const ctx = getEditorTargetClauseContext(draft);
    return buildChildPlaceholderSuggestions(
      ctx.targetReqId,
      ctx.normaReqs,
      ctx.activeLang,
      ctx.activeHtml,
      query,
      draft.id_requisito_padre || undefined
    );
  };

  const closeAutocompleteInPlace = (): void => {
    inlineAutocompleteState = {
      isOpen: false,
      targetType: null,
      query: '',
      triggerStart: 0,
      cursorOffset: 0,
      activeIndex: 0,
      textNode: null,
    };
    const anchor = document.getElementById('reqEditorAutocompleteAnchor');
    if (anchor) {
      anchor.innerHTML = renderClauseAutocompleteMenu({
        isOpen: false,
        query: '',
        options: [],
        activeIndex: 0,
      });
    }
  };

  const confirmAutocompleteSelection = (token: string): void => {
    if (!token) return;
    if (inlineAutocompleteState.targetType === 'html') {
      const textarea = document.getElementById(
        'reqEditorHtmlTextarea'
      ) as HTMLTextAreaElement | null;
      if (!textarea) {
        closeAutocompleteInPlace();
        return;
      }
      const res = replaceInlineBraceTrigger(
        textarea.value,
        inlineAutocompleteState.triggerStart,
        inlineAutocompleteState.cursorOffset,
        token
      );
      textarea.value = res.value;
      textarea.focus();
      textarea.setSelectionRange(res.nextCursor, res.nextCursor);
      savedHtmlSelection = { start: res.nextCursor, end: res.nextCursor };
    } else if (inlineAutocompleteState.targetType === 'visual') {
      const canvas = document.getElementById('reqEditorVisualCanvas');
      const textNode = inlineAutocompleteState.textNode;
      if (!canvas || !textNode || !canvas.contains(textNode)) {
        closeAutocompleteInPlace();
        return;
      }
      const res = replaceInlineBraceTrigger(
        textNode.textContent || '',
        inlineAutocompleteState.triggerStart,
        inlineAutocompleteState.cursorOffset,
        token
      );
      textNode.textContent = res.value;
      const sel = window.getSelection();
      if (sel) {
        const nextRange = document.createRange();
        const safePos = Math.min(res.nextCursor, (textNode.textContent || '').length);
        nextRange.setStart(textNode, safePos);
        nextRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(nextRange);
        savedVisualRange = nextRange.cloneRange();
      }
      canvas.focus();
    }

    closeAutocompleteInPlace();
    const draft = syncRequisitoDraftFromDom(false);
    refreshEditorStatusBadgesInPlace(draft);
  };

  const renderAutocompleteAnchorInPlace = (draft: RequisitoFormDraft): void => {
    const anchor = document.getElementById('reqEditorAutocompleteAnchor');
    if (!anchor) return;
    if (!inlineAutocompleteState.isOpen) {
      closeAutocompleteInPlace();
      return;
    }
    const options = getFilteredAutocompleteOptions(draft, inlineAutocompleteState.query);
    if (options.length === 0) {
      inlineAutocompleteState.activeIndex = -1;
    } else if (
      inlineAutocompleteState.activeIndex < 0 ||
      inlineAutocompleteState.activeIndex >= options.length
    ) {
      inlineAutocompleteState.activeIndex = 0;
    }

    anchor.innerHTML = renderClauseAutocompleteMenu({
      isOpen: true,
      query: inlineAutocompleteState.query,
      options,
      activeIndex: inlineAutocompleteState.activeIndex,
    });

    const parentBox = anchor.parentElement?.getBoundingClientRect();
    if (parentBox && inlineAutocompleteState.targetType === 'visual') {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        if (rect.height > 0 || rect.top > 0) {
          const relTop = Math.max(36, Math.min(rect.bottom - parentBox.top + 6, Math.max(40, parentBox.height - 40)));
          const relLeft = Math.max(12, Math.min(rect.left - parentBox.left, Math.max(12, parentBox.width - 340)));
          anchor.style.top = `${Math.round(relTop)}px`;
          anchor.style.left = `${Math.round(relLeft)}px`;
        }
      }
    } else {
      anchor.style.top = '';
      anchor.style.left = '';
    }

    anchor
      .querySelectorAll<HTMLElement>('[data-action="confirm-autocomplete-clause"]')
      .forEach((optBtn) => {
        optBtn.addEventListener('mousedown', (ev) => ev.preventDefault());
        optBtn.addEventListener('click', () => {
          const token = optBtn.dataset.clauseToken;
          if (token) {
            confirmAutocompleteSelection(token);
          }
        });
      });
  };

  const detectAndRenderAutocompleteForVisual = (draft: RequisitoFormDraft): void => {
    const canvas = document.getElementById('reqEditorVisualCanvas');
    const sel = window.getSelection();
    if (!canvas || !sel || sel.rangeCount === 0) {
      closeAutocompleteInPlace();
      return;
    }
    const range = sel.getRangeAt(0);
    if (!range.collapsed || !canvas.contains(range.startContainer)) {
      closeAutocompleteInPlace();
      return;
    }

    let textNode: Text | null = null;
    let caretOffset = 0;
    if (range.startContainer.nodeType === Node.TEXT_NODE) {
      textNode = range.startContainer as Text;
      caretOffset = range.startOffset;
    } else if (
      range.startContainer.nodeType === Node.ELEMENT_NODE &&
      range.startOffset > 0
    ) {
      const prevChild = range.startContainer.childNodes[range.startOffset - 1];
      if (prevChild && prevChild.nodeType === Node.TEXT_NODE) {
        textNode = prevChild as Text;
        caretOffset = (textNode.textContent || '').length;
      }
    }

    if (!textNode) {
      closeAutocompleteInPlace();
      return;
    }

    const match = detectInlineBraceTrigger(textNode.textContent || '', caretOffset);
    if (!match) {
      closeAutocompleteInPlace();
      return;
    }

    inlineAutocompleteState = {
      isOpen: true,
      targetType: 'visual',
      query: match.query,
      triggerStart: match.triggerStart,
      cursorOffset: match.cursorOffset,
      activeIndex: 0,
      textNode,
    };
    renderAutocompleteAnchorInPlace(draft);
  };

  const detectAndRenderAutocompleteForHtml = (draft: RequisitoFormDraft): void => {
    const textarea = document.getElementById(
      'reqEditorHtmlTextarea'
    ) as HTMLTextAreaElement | null;
    if (!textarea) {
      closeAutocompleteInPlace();
      return;
    }
    const cursor = textarea.selectionStart ?? textarea.value.length;
    const match = detectInlineBraceTrigger(textarea.value, cursor);
    if (!match) {
      closeAutocompleteInPlace();
      return;
    }
    inlineAutocompleteState = {
      isOpen: true,
      targetType: 'html',
      query: match.query,
      triggerStart: match.triggerStart,
      cursorOffset: match.cursorOffset,
      activeIndex: 0,
      textNode: null,
    };
    renderAutocompleteAnchorInPlace(draft);
  };

  const insertHtmlSnippetInVisual = (htmlSnippet: string): boolean => {
    const canvas = document.getElementById('reqEditorVisualCanvas');
    if (!canvas) return false;
    canvas.focus();
    const sel = window.getSelection();
    if (!sel) return false;

    let range: Range;
    if (savedVisualRange && canvas.contains(savedVisualRange.commonAncestorContainer)) {
      range = savedVisualRange.cloneRange();
      sel.removeAllRanges();
      sel.addRange(range);
    } else if (sel.rangeCount > 0 && canvas.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      range = sel.getRangeAt(0);
    } else {
      range = document.createRange();
      range.selectNodeContents(canvas);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }

    const tpl = document.createElement('template');
    tpl.innerHTML = htmlSnippet;
    const frag = tpl.content;
    const lastInsertedNode = frag.lastChild;
    if (!lastInsertedNode) return false;

    range.deleteContents();
    range.insertNode(frag);

    const nextRange = document.createRange();
    nextRange.setStartAfter(lastInsertedNode);
    nextRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(nextRange);
    savedVisualRange = nextRange.cloneRange();
    return true;
  };

  const shouldWrapTokenInBlockForVisual = (canvas: HTMLElement, range: Range): boolean => {
    if (normalizeEditorHtmlOutput(canvas.innerHTML) === '') {
      return true;
    }
    const node = range.startContainer;
    if (node === canvas) return true;
    const blockEl =
      node.nodeType === Node.ELEMENT_NODE
        ? (node as HTMLElement)
        : node.parentElement;
    if (!blockEl || blockEl === canvas) {
      return (node.textContent || '').trim().length === 0;
    }
    const blockTag = blockEl.tagName.toUpperCase();
    if (blockTag === 'DIV' || blockTag === 'P') {
      const strippedText = (blockEl.textContent || '').replace(/\u00a0/g, '').trim();
      if (!strippedText) return true;
    }
    return false;
  };

  const shouldWrapTokenInBlockForHtml = (source: string, cursorStart: number): boolean => {
    const before = source.slice(0, cursorStart);
    const trimmedRight = before.replace(/[ \t]+$/, '');
    return (
      trimmedRight.length === 0 ||
      trimmedRight.endsWith('\n') ||
      trimmedRight.endsWith('>')
    );
  };

  const togglePickerPopoverInPlace = (open: boolean): void => {
    state.extraDomain.requisitoEditorPickerOpen = open;
    const popover = document.getElementById('reqEditorClausePickerPopover');
    const toggleBtn = document.querySelector<HTMLElement>(
      '[data-action="toggle-clause-placeholder-picker"]'
    );
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    if (popover) {
      popover.classList.toggle('hidden', !open);
      popover.classList.toggle('flex', open);
    }
    if (open) {
      const draft = syncRequisitoDraftFromDom(false);
      refreshEditorPickerOptionsInPlace(draft);
      const searchEl = document.getElementById(
        'reqEditorClausePickerSearch'
      ) as HTMLInputElement | null;
      if (searchEl) {
        searchEl.value = state.extraDomain.requisitoEditorPickerQuery || '';
        searchEl.focus();
      }
    }
  };

  const toggleLinkPopoverInPlace = (open: boolean): void => {
    state.extraDomain.requisitoEditorLinkPopoverOpen = open;
    const popover = document.getElementById('reqEditorLinkPopover');
    const toggleBtn = document.querySelector<HTMLElement>(
      '[data-action="toggle-editor-link-popover"]'
    );
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    if (popover) {
      popover.classList.toggle('hidden', !open);
      popover.classList.toggle('flex', open);
    }
    if (open) {
      const urlInput = document.getElementById(
        'reqEditorLinkUrlInput'
      ) as HTMLInputElement | null;
      urlInput?.focus();
    }
  };

  const insertClauseTokenAtSavedCursor = (token: string): void => {
    if (!token) return;
    if (state.extraDomain.requisitoEditorMode === 'html') {
      const textarea = document.getElementById(
        'reqEditorHtmlTextarea'
      ) as HTMLTextAreaElement | null;
      if (textarea) {
        const start = savedHtmlSelection?.start ?? textarea.selectionStart ?? textarea.value.length;
        const end = savedHtmlSelection?.end ?? textarea.selectionEnd ?? textarea.value.length;
        const insertion = shouldWrapTokenInBlockForHtml(textarea.value, start)
          ? `<div>${token}</div>`
          : token;
        const res = insertTextAtCursor(textarea.value, start, end, insertion);
        textarea.value = res.value;
        textarea.focus();
        textarea.setSelectionRange(res.nextCursor, res.nextCursor);
        savedHtmlSelection = { start: res.nextCursor, end: res.nextCursor };
      }
    } else if (state.extraDomain.requisitoEditorMode === 'visual') {
      const canvas = document.getElementById('reqEditorVisualCanvas');
      if (canvas) {
        canvas.focus();
        const sel = window.getSelection();
        const activeRange =
          savedVisualRange && canvas.contains(savedVisualRange.commonAncestorContainer)
            ? savedVisualRange
            : sel && sel.rangeCount > 0 && canvas.contains(sel.getRangeAt(0).commonAncestorContainer)
            ? sel.getRangeAt(0)
            : null;
        const wrapBlock = activeRange
          ? shouldWrapTokenInBlockForVisual(canvas, activeRange)
          : true;
        const snippet = wrapBlock
          ? `<div>${escapeHtml(token)}</div>`
          : escapeHtml(token);
        insertHtmlSnippetInVisual(snippet);
      }
    }

    closeAutocompleteInPlace();
    togglePickerPopoverInPlace(false);
    state.extraDomain.requisitoEditorPickerQuery = '';
    const draft = syncRequisitoDraftFromDom(false);
    refreshEditorStatusBadgesInPlace(draft);
  };

  function insertAllMissingChildClauses(): void {
    const draft = syncRequisitoDraftFromDom(false);
    const ctx = getEditorTargetClauseContext(draft);
    const missing = buildChildPlaceholderSuggestions(
      ctx.targetReqId,
      ctx.normaReqs,
      ctx.activeLang,
      ctx.activeHtml,
      '',
      draft.id_requisito_padre || undefined
    ).filter((opt) => opt.isDirectChild && !opt.alreadyInserted);

    if (missing.length === 0) return;
    const blockHtml = missing.map((opt) => `<div>${escapeHtml(opt.token)}</div>`).join('');

    if (state.extraDomain.requisitoEditorMode === 'html') {
      const textarea = document.getElementById(
        'reqEditorHtmlTextarea'
      ) as HTMLTextAreaElement | null;
      if (textarea) {
        const start = savedHtmlSelection?.start ?? textarea.value.length;
        const end = savedHtmlSelection?.end ?? textarea.value.length;
        const rawBlock = missing.map((opt) => `<div>${opt.token}</div>`).join('\n');
        const res = insertTextAtCursor(textarea.value, start, end, rawBlock);
        textarea.value = res.value;
        textarea.focus();
        textarea.setSelectionRange(res.nextCursor, res.nextCursor);
        savedHtmlSelection = { start: res.nextCursor, end: res.nextCursor };
      }
    } else if (state.extraDomain.requisitoEditorMode === 'visual') {
      insertHtmlSnippetInVisual(blockHtml);
    }

    closeAutocompleteInPlace();
    togglePickerPopoverInPlace(false);
    const nextDraft = syncRequisitoDraftFromDom(false);
    refreshEditorStatusBadgesInPlace(nextDraft);
  }

  // Title input live sync without re-rendering
  document.getElementById('reqEditorTitleInput')?.addEventListener('input', () => {
    const draft = syncRequisitoDraftFromDom(false);
    refreshEditorStatusBadgesInPlace(draft);
  });

  // Visual canvas listeners (preserve focus/cursor, inline `{` trigger, live status sync)
  const visualCanvasEl = document.getElementById('reqEditorVisualCanvas');
  if (visualCanvasEl) {
    visualCanvasEl.addEventListener('focus', captureVisualSelection);
    visualCanvasEl.addEventListener('mouseup', () => {
      captureVisualSelection();
      const draft = syncRequisitoDraftFromDom(false);
      detectAndRenderAutocompleteForVisual(draft);
    });
    visualCanvasEl.addEventListener('keyup', (ev) => {
      captureVisualSelection();
      if (
        ev.key === 'ArrowDown' ||
        ev.key === 'ArrowUp' ||
        ev.key === 'Enter' ||
        ev.key === 'Escape' ||
        ev.key === 'Tab'
      ) {
        return;
      }
      const draft = syncRequisitoDraftFromDom(false);
      detectAndRenderAutocompleteForVisual(draft);
    });
    visualCanvasEl.addEventListener('blur', captureVisualSelection);
    visualCanvasEl.addEventListener('input', () => {
      captureVisualSelection();
      const draft = syncRequisitoDraftFromDom(false);
      refreshEditorStatusBadgesInPlace(draft);
      detectAndRenderAutocompleteForVisual(draft);
    });
    visualCanvasEl.addEventListener('keydown', (ev) => {
      if (!inlineAutocompleteState.isOpen) return;
      const draft = syncRequisitoDraftFromDom(false);
      const options = getFilteredAutocompleteOptions(draft, inlineAutocompleteState.query);
      if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        if (options.length > 0) {
          inlineAutocompleteState.activeIndex =
            (inlineAutocompleteState.activeIndex + 1) % options.length;
          renderAutocompleteAnchorInPlace(draft);
        }
      } else if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        if (options.length > 0) {
          inlineAutocompleteState.activeIndex =
            (inlineAutocompleteState.activeIndex - 1 + options.length) % options.length;
          renderAutocompleteAnchorInPlace(draft);
        }
      } else if (ev.key === 'Enter' || ev.key === 'Tab') {
        if (options.length > 0) {
          ev.preventDefault();
          const chosen =
            options[Math.max(0, Math.min(options.length - 1, inlineAutocompleteState.activeIndex))];
          if (chosen) {
            confirmAutocompleteSelection(chosen.token);
          }
        }
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        closeAutocompleteInPlace();
      }
    });
  }

  // HTML textarea listeners (preserve focus/cursor, inline `{` trigger, live status sync)
  const htmlTextareaEl = document.getElementById(
    'reqEditorHtmlTextarea'
  ) as HTMLTextAreaElement | null;
  if (htmlTextareaEl) {
    htmlTextareaEl.addEventListener('focus', captureHtmlSelection);
    htmlTextareaEl.addEventListener('select', captureHtmlSelection);
    htmlTextareaEl.addEventListener('mouseup', () => {
      captureHtmlSelection();
      const draft = syncRequisitoDraftFromDom(false);
      detectAndRenderAutocompleteForHtml(draft);
    });
    htmlTextareaEl.addEventListener('keyup', (ev) => {
      captureHtmlSelection();
      if (
        ev.key === 'ArrowDown' ||
        ev.key === 'ArrowUp' ||
        ev.key === 'Enter' ||
        ev.key === 'Escape' ||
        ev.key === 'Tab'
      ) {
        return;
      }
      const draft = syncRequisitoDraftFromDom(false);
      detectAndRenderAutocompleteForHtml(draft);
    });
    htmlTextareaEl.addEventListener('blur', captureHtmlSelection);
    htmlTextareaEl.addEventListener('input', () => {
      captureHtmlSelection();
      const draft = syncRequisitoDraftFromDom(false);
      refreshEditorStatusBadgesInPlace(draft);
      detectAndRenderAutocompleteForHtml(draft);
    });
    htmlTextareaEl.addEventListener('keydown', (ev) => {
      if (!inlineAutocompleteState.isOpen) return;
      const draft = syncRequisitoDraftFromDom(false);
      const options = getFilteredAutocompleteOptions(draft, inlineAutocompleteState.query);
      if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        if (options.length > 0) {
          inlineAutocompleteState.activeIndex =
            (inlineAutocompleteState.activeIndex + 1) % options.length;
          renderAutocompleteAnchorInPlace(draft);
        }
      } else if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        if (options.length > 0) {
          inlineAutocompleteState.activeIndex =
            (inlineAutocompleteState.activeIndex - 1 + options.length) % options.length;
          renderAutocompleteAnchorInPlace(draft);
        }
      } else if (ev.key === 'Enter' || ev.key === 'Tab') {
        if (options.length > 0) {
          ev.preventDefault();
          const chosen =
            options[Math.max(0, Math.min(options.length - 1, inlineAutocompleteState.activeIndex))];
          if (chosen) {
            confirmAutocompleteSelection(chosen.token);
          }
        }
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        closeAutocompleteInPlace();
      }
    });
  }

  // Language switcher (`ES` <-> `EN`) inside editor
  document
    .querySelectorAll<HTMLElement>('[data-action="set-editor-lang"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextLang = btn.dataset.editorLang;
        if (nextLang !== 'es' && nextLang !== 'en') return;
        syncRequisitoDraftFromDom(false);
        state.extraDomain.requisitoEditorLang = nextLang;
        state.extraDomain.requisitoEditorLinkPopoverOpen = false;
        state.extraDomain.requisitoEditorLinkError = null;
        state.extraDomain.requisitoEditorPickerOpen = false;
        render();
      });
    });

  // Mode switcher (`Visual` | `HTML` | `Vista Previa`)
  document
    .querySelectorAll<HTMLElement>('[data-action="set-editor-mode"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextMode = btn.dataset.editorMode;
        if (nextMode !== 'visual' && nextMode !== 'html' && nextMode !== 'preview') return;
        syncRequisitoDraftFromDom(false);
        state.extraDomain.requisitoEditorMode = nextMode;
        state.extraDomain.requisitoEditorLinkPopoverOpen = false;
        state.extraDomain.requisitoEditorLinkError = null;
        state.extraDomain.requisitoEditorPickerOpen = false;
        render();
      });
    });

  // Formatting toolbar commands (`bold`, `italic`, `paragraph`, `unordered-list`, `ordered-list`, `insert-note`, `insert-table`, `clear-format`, `undo`)
  document.querySelectorAll<HTMLElement>('[data-action="editor-cmd"]').forEach((btn) => {
    btn.addEventListener('mousedown', (ev) => ev.preventDefault());
    btn.addEventListener('click', () => {
      const cmd = btn.dataset.editorCmd;
      if (!cmd || state.extraDomain.requisitoEditorMode === 'preview') return;
      const activeLang: RichTextEditorLang =
        state.extraDomain.requisitoEditorLang === 'en' ? 'en' : 'es';

      if (state.extraDomain.requisitoEditorMode === 'html') {
        const textarea = document.getElementById(
          'reqEditorHtmlTextarea'
        ) as HTMLTextAreaElement | null;
        if (!textarea) return;
        const start = savedHtmlSelection?.start ?? textarea.selectionStart ?? textarea.value.length;
        const end = savedHtmlSelection?.end ?? textarea.selectionEnd ?? textarea.value.length;
        const selStart = Math.min(start, end);
        const selEnd = Math.max(start, end);
        const selected = textarea.value.slice(selStart, selEnd);

        if (cmd === 'bold' || cmd === 'italic') {
          const tag = cmd === 'bold' ? 'strong' : 'em';
          textarea.value = wrapSelectionWithTag(textarea.value, selStart, selEnd, tag);
          const nextPos = selEnd + tag.length * 2 + 5;
          textarea.focus();
          textarea.setSelectionRange(nextPos, nextPos);
          savedHtmlSelection = { start: nextPos, end: nextPos };
        } else if (cmd === 'clear-format') {
          const stripped = selected.replace(/<[^>]+>/g, '');
          const res = insertTextAtCursor(textarea.value, selStart, selEnd, stripped);
          textarea.value = res.value;
          textarea.focus();
          textarea.setSelectionRange(res.nextCursor, res.nextCursor);
          savedHtmlSelection = { start: res.nextCursor, end: res.nextCursor };
        } else {
          let snippet = '';
          if (cmd === 'paragraph') {
            snippet = `<p>${selected || 'Texto del párrafo.'}</p>`;
          } else if (cmd === 'unordered-list') {
            snippet = `<ul><li>${selected || 'Elemento de lista'}</li></ul>`;
          } else if (cmd === 'ordered-list') {
            snippet = `<ol><li>${selected || 'Elemento numerado'}</li></ol>`;
          } else if (cmd === 'insert-note') {
            snippet = buildIsoNoteHtmlSnippet(activeLang === 'en' ? 'NOTE' : 'NOTA');
          } else if (cmd === 'insert-table') {
            snippet = buildSimpleTableHtmlSnippet(2, 2);
          }
          if (snippet) {
            const res = insertTextAtCursor(textarea.value, selStart, selEnd, snippet);
            textarea.value = res.value;
            textarea.focus();
            textarea.setSelectionRange(res.nextCursor, res.nextCursor);
            savedHtmlSelection = { start: res.nextCursor, end: res.nextCursor };
          }
        }
      } else {
        const canvas = document.getElementById('reqEditorVisualCanvas');
        if (!canvas) return;
        canvas.focus();
        const sel = window.getSelection();
        if (sel && savedVisualRange && canvas.contains(savedVisualRange.commonAncestorContainer)) {
          sel.removeAllRanges();
          sel.addRange(savedVisualRange);
        }

        if (cmd === 'bold') {
          document.execCommand('bold');
        } else if (cmd === 'italic') {
          document.execCommand('italic');
        } else if (cmd === 'paragraph') {
          document.execCommand('formatBlock', false, 'p');
        } else if (cmd === 'unordered-list') {
          document.execCommand('insertUnorderedList');
        } else if (cmd === 'ordered-list') {
          document.execCommand('insertOrderedList');
        } else if (cmd === 'insert-note') {
          insertHtmlSnippetInVisual(
            buildIsoNoteHtmlSnippet(activeLang === 'en' ? 'NOTE' : 'NOTA')
          );
        } else if (cmd === 'insert-table') {
          insertHtmlSnippetInVisual(buildSimpleTableHtmlSnippet(2, 2));
        } else if (cmd === 'clear-format') {
          document.execCommand('removeFormat');
        } else if (cmd === 'undo') {
          document.execCommand('undo');
        }
        captureVisualSelection();
      }

      const draft = syncRequisitoDraftFromDom(false);
      refreshEditorStatusBadgesInPlace(draft);
    });
  });

  // Inline HTTPS link popover controls
  document
    .querySelectorAll<HTMLElement>('[data-action="toggle-editor-link-popover"]')
    .forEach((btn) => {
      btn.addEventListener('mousedown', (ev) => ev.preventDefault());
      btn.addEventListener('click', () => {
        if (state.extraDomain.requisitoEditorMode === 'preview') return;
        const willOpen = !state.extraDomain.requisitoEditorLinkPopoverOpen;
        if (willOpen) {
          togglePickerPopoverInPlace(false);
          closeAutocompleteInPlace();
          state.extraDomain.requisitoEditorLinkError = null;
        }
        toggleLinkPopoverInPlace(willOpen);
      });
    });

  document
    .querySelectorAll<HTMLElement>('[data-action="close-editor-link-popover"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        state.extraDomain.requisitoEditorLinkError = null;
        toggleLinkPopoverInPlace(false);
      });
    });

  document.getElementById('reqEditorLinkUrlInput')?.addEventListener('input', (ev) => {
    state.extraDomain.requisitoEditorLinkUrl = (ev.target as HTMLInputElement).value;
  });

  document.getElementById('reqEditorLinkLabelInput')?.addEventListener('input', (ev) => {
    state.extraDomain.requisitoEditorLinkLabel = (ev.target as HTMLInputElement).value;
  });

  document
    .querySelectorAll<HTMLElement>('[data-action="confirm-editor-link"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        const urlInput = document.getElementById(
          'reqEditorLinkUrlInput'
        ) as HTMLInputElement | null;
        const labelInput = document.getElementById(
          'reqEditorLinkLabelInput'
        ) as HTMLInputElement | null;
        const rawUrl = urlInput ? urlInput.value : state.extraDomain.requisitoEditorLinkUrl;
        const rawLabel = labelInput
          ? labelInput.value
          : state.extraDomain.requisitoEditorLinkLabel;

        const validation = validateSafeHttpUrl(rawUrl);
        const popover = document.getElementById('reqEditorLinkPopover');
        if (!validation.valid) {
          state.extraDomain.requisitoEditorLinkError = validation.error;
          if (popover) {
            let errEl = popover.querySelector<HTMLElement>('[role="alert"]');
            if (!errEl) {
              errEl = document.createElement('p');
              errEl.setAttribute('role', 'alert');
              errEl.className =
                'text-[11px] font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-2 py-1';
              const actionsRow = popover.querySelector('.justify-end');
              popover.insertBefore(errEl, actionsRow);
            }
            errEl.textContent = validation.error;
          }
          return;
        }

        const anchorHtml = buildSafeAnchorHtmlSnippet(validation.href, rawLabel);
        if (state.extraDomain.requisitoEditorMode === 'html') {
          const textarea = document.getElementById(
            'reqEditorHtmlTextarea'
          ) as HTMLTextAreaElement | null;
          if (textarea) {
            const start = savedHtmlSelection?.start ?? textarea.value.length;
            const end = savedHtmlSelection?.end ?? textarea.value.length;
            const res = insertTextAtCursor(textarea.value, start, end, anchorHtml);
            textarea.value = res.value;
            textarea.focus();
            textarea.setSelectionRange(res.nextCursor, res.nextCursor);
            savedHtmlSelection = { start: res.nextCursor, end: res.nextCursor };
          }
        } else {
          insertHtmlSnippetInVisual(anchorHtml);
        }

        state.extraDomain.requisitoEditorLinkUrl = '';
        state.extraDomain.requisitoEditorLinkLabel = '';
        state.extraDomain.requisitoEditorLinkError = null;
        if (urlInput) urlInput.value = '';
        if (labelInput) labelInput.value = '';
        popover?.querySelector('[role="alert"]')?.remove();
        toggleLinkPopoverInPlace(false);
        const draft = syncRequisitoDraftFromDom(false);
        refreshEditorStatusBadgesInPlace(draft);
      });
    });

  // Child Clause Placeholder Picker (`+ { } Sub-cláusula`) & Unreferenced Coverage Badge
  document
    .querySelectorAll<HTMLElement>('[data-action="toggle-clause-placeholder-picker"]')
    .forEach((btn) => {
      btn.addEventListener('mousedown', (ev) => ev.preventDefault());
      btn.addEventListener('click', () => {
        if (state.extraDomain.requisitoEditorMode === 'preview') return;
        const willOpen = !state.extraDomain.requisitoEditorPickerOpen;
        if (willOpen) {
          toggleLinkPopoverInPlace(false);
          closeAutocompleteInPlace();
        }
        togglePickerPopoverInPlace(willOpen);
      });
    });

  document
    .querySelectorAll<HTMLElement>('[data-action="close-clause-placeholder-picker"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        togglePickerPopoverInPlace(false);
      });
    });

  document.getElementById('reqEditorClausePickerSearch')?.addEventListener('input', (ev) => {
    state.extraDomain.requisitoEditorPickerQuery = (ev.target as HTMLInputElement).value;
    const draft = syncRequisitoDraftFromDom(false);
    refreshEditorPickerOptionsInPlace(draft);
  });

  document
    .querySelectorAll<HTMLElement>('[data-action="insert-clause-placeholder"]')
    .forEach((btn) => {
      btn.addEventListener('mousedown', (ev) => ev.preventDefault());
      btn.addEventListener('click', () => {
        const token = btn.dataset.clauseToken;
        if (token) {
          insertClauseTokenAtSavedCursor(token);
        }
      });
    });

  document
    .querySelectorAll<HTMLElement>('[data-action="insert-missing-child-clauses"]')
    .forEach((btn) => {
      btn.addEventListener('mousedown', (ev) => ev.preventDefault());
      btn.addEventListener('click', insertAllMissingChildClauses);
    });

  document.getElementById('reqParentNormaSelect')?.addEventListener('change', () => {
    syncRequisitoDraftFromDom(true);
    render();
  });

  document.getElementById('reqParentRequisitoSelect')?.addEventListener('change', () => {
    const draft = syncRequisitoDraftFromDom(false);
    const previewEl = document.getElementById('reqRutaPreview');
    if (previewEl) {
      previewEl.textContent = draft.ruta_materializada || '—';
    }
    if (state.extraDomain.requisitoEditorPickerOpen) {
      refreshEditorPickerOptionsInPlace(draft);
    }
  });

  document.getElementById('reqCodigoInput')?.addEventListener('input', () => {
    const draft = syncRequisitoDraftFromDom(false);
    const previewEl = document.getElementById('reqRutaPreview');
    if (previewEl) {
      previewEl.textContent = draft.ruta_materializada || '—';
    }
  });

  const persistRequisitoTranslations = async (
    reqId: string,
    normData: {
      title_es: string;
      content_html_es: string;
      title_en: string;
      content_html_en: string;
    },
    existingTranslations?: {
      es?: RequisitoTranslationEntry;
      en?: RequisitoTranslationEntry;
    }
  ): Promise<{ es?: RequisitoTranslationEntry; en?: RequisitoTranslationEntry }> => {
    const nowIso = new Date().toISOString();
    const nextTranslations: {
      es?: RequisitoTranslationEntry;
      en?: RequisitoTranslationEntry;
    } = {
      ...(existingTranslations || {}),
    };

    const entries: Array<{ lang: 'es' | 'en'; title: string; content_html: string }> = [
      { lang: 'es', title: normData.title_es, content_html: normData.content_html_es },
      { lang: 'en', title: normData.title_en, content_html: normData.content_html_en },
    ];

    for (const entry of entries) {
      const normalizedHtml = normalizeEditorHtmlOutput(entry.content_html);
      const cleanTitle = entry.title.trim();
      const hasContent = Boolean(cleanTitle || normalizedHtml);
      const prevEntry = nextTranslations[entry.lang];

      if (!hasContent && !prevEntry) {
        continue;
      }

      if (!hasContent && prevEntry) {
        let archivedRowId = prevEntry.id || reqId;
        if (isValidUuid(reqId)) {
          try {
            const { data: existingRow } = await supabase
              .from('requisito_traduccion')
              .select('id')
              .eq('id_requisito', reqId)
              .eq('lang', entry.lang)
              .is('deleted_at', null)
              .maybeSingle();

            if (existingRow?.id) {
              archivedRowId = String(existingRow.id);
              const { error: archiveErr } = await supabase.rpc('archive_record', {
                p_table: 'requisito_traduccion',
                p_record_id: archivedRowId,
                p_reason: 'Traducción vaciada desde editor de cláusula',
              });
              if (archiveErr) {
                await supabase
                  .from('requisito_traduccion')
                  .update({
                    title: '',
                    content_html: '',
                    updated_at: nowIso,
                  })
                  .eq('id', archivedRowId)
                  .is('deleted_at', null);
              }
            }
          } catch {
            // Graceful offline degradation without physical deletion
          }
        }
        delete nextTranslations[entry.lang];
        recordPhase5SessionLog(
          'requisito_traduccion',
          archivedRowId,
          'DELETE',
          {
            id_requisito: reqId,
            lang: entry.lang,
            title: prevEntry.title,
            content_html: prevEntry.content_html,
          },
          null
        );
        continue;
      }

      let persistedId = prevEntry?.id;
      let opType: 'INSERT' | 'UPDATE' = prevEntry ? 'UPDATE' : 'INSERT';
      if (isValidUuid(reqId) && hasContent) {
        try {
          const { data: existingRow, error: lookupErr } = await supabase
            .from('requisito_traduccion')
            .select('id')
            .eq('id_requisito', reqId)
            .eq('lang', entry.lang)
            .is('deleted_at', null)
            .maybeSingle();

          if (!lookupErr) {
            if (existingRow?.id) {
              persistedId = String(existingRow.id);
              opType = 'UPDATE';
              await supabase
                .from('requisito_traduccion')
                .update({
                  title: cleanTitle,
                  content_html: normalizedHtml,
                  updated_at: nowIso,
                })
                .eq('id', persistedId)
                .is('deleted_at', null);
            } else {
              opType = 'INSERT';
              const { data: insertedRow } = await supabase
                .from('requisito_traduccion')
                .insert({
                  id_requisito: reqId,
                  lang: entry.lang,
                  title: cleanTitle,
                  content_html: normalizedHtml,
                })
                .select('id')
                .maybeSingle();
              if (insertedRow?.id) {
                persistedId = String(insertedRow.id);
              }
            }
          }
        } catch {
          // Graceful degradation if requisito_traduccion is not yet migrated or offline
        }
      }

      nextTranslations[entry.lang] = {
        id: persistedId,
        id_requisito: reqId,
        lang: entry.lang,
        title: cleanTitle,
        content_html: normalizedHtml,
        updated_at: nowIso,
      };

      const changed =
        !prevEntry ||
        prevEntry.title !== cleanTitle ||
        prevEntry.content_html !== normalizedHtml;
      if (changed) {
        recordPhase5SessionLog(
          'requisito_traduccion',
          persistedId || `${reqId}-${entry.lang}`,
          opType,
          prevEntry
            ? {
                id_requisito: reqId,
                lang: entry.lang,
                title: prevEntry.title,
                content_html: prevEntry.content_html,
              }
            : null,
          {
            id_requisito: reqId,
            lang: entry.lang,
            title: cleanTitle,
            content_html: normalizedHtml,
          }
        );
      }
    }

    return nextTranslations;
  };

  document.getElementById('requisitoDetailForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!isApprovedStaff()) return;

    const draft = syncRequisitoDraftFromDom(false);
    draft.content_html_es = normalizeEditorHtmlOutput(draft.content_html_es);
    draft.content_html_en = normalizeEditorHtmlOutput(draft.content_html_en);

    const currentId = state.extraDomain.selectedRequisitoId;
    const isCreate = !currentId && state.extraDomain.isCreatingRequisito;
    const existingReqs = getResolvedRequisitosCatalog();
    const validation = validateRequisitoDraft(draft, existingReqs, currentId || undefined);

    if (!validation.valid || !validation.normalized) {
      state.extraDomain.requisitoEditError =
        validation.error || 'No se pudieron validar los datos del requisito LTREE.';
      render();
      return;
    }

    const normData = {
      ...validation.normalized,
      content_html_es: normalizeEditorHtmlOutput(validation.normalized.content_html_es),
      content_html_en: normalizeEditorHtmlOutput(validation.normalized.content_html_en),
    };

    const refValidation = validateClausePlaceholderReferences({
      clauseId: currentId || undefined,
      clauseCode: normData.codigo,
      idNorma: normData.id_norma,
      contentHtmlEs: normData.content_html_es,
      contentHtmlEn: normData.content_html_en,
      allReqsOfNorma: existingReqs,
    });
    if (!refValidation.valid) {
      state.extraDomain.requisitoEditError =
        refValidation.error ||
        'Existen referencias circulares inválidas en los placeholders {clause_...}.';
      render();
      return;
    }

    const parentNorma = getResolvedNormasCatalog().find((n) => n.id === normData.id_norma);
    if (!parentNorma) {
      state.extraDomain.requisitoEditError =
        'No se pudo resolver la Norma ISO seleccionada.';
      render();
      return;
    }

    void (async () => {
      if (isCreate) {
        let createdId: string = crypto.randomUUID();
        try {
          let insertRes = await supabase
            .from('requisito')
            .insert({
              id_norma: normData.id_norma,
              id_requisito_padre: normData.id_requisito_padre,
              codigo: normData.codigo,
              explicit_code: normData.explicit_code,
              es_obligatorio: normData.es_obligatorio,
              obligatorio_origen: normData.obligatorio_origen,
              ruta_materializada: normData.ruta_materializada,
            })
            .select('id')
            .single();

          if (insertRes.error && isMissingTableOrSchemaError(insertRes.error)) {
            insertRes = await supabase
              .from('requisito')
              .insert({
                id_norma: normData.id_norma,
                id_requisito_padre: normData.id_requisito_padre,
                codigo: normData.codigo,
                ruta_materializada: normData.ruta_materializada,
              })
              .select('id')
              .single();
          }

          if (insertRes.error) {
            if (!isMissingTableOrSchemaError(insertRes.error)) {
              state.extraDomain.requisitoEditError = translateDatabaseError(insertRes.error);
              render();
              return;
            }
          } else if (insertRes.data?.id) {
            createdId = String(insertRes.data.id);
          }
        } catch {
          // Reactive fallback
        }

        const savedTranslations = await persistRequisitoTranslations(createdId, normData);
        const resolvedTitle =
          savedTranslations.es?.title ||
          savedTranslations.en?.title ||
          '';
        const resolvedDesc = extractPlainClauseDescription(
          savedTranslations,
          'Requisito normativo auditable del sistema de gestión.'
        );

        const indent = calculateLtreeIndentation(normData.ruta_materializada, normData.codigo);
        const newReq: RequisitoLtree = {
          id: createdId,
          id_norma: parentNorma.id,
          norma_codigo: parentNorma.codigo,
          id_requisito_padre: normData.id_requisito_padre,
          codigo: normData.codigo,
          explicit_code: normData.explicit_code,
          es_obligatorio: normData.es_obligatorio,
          obligatorio_origen: normData.obligatorio_origen,
          titulo: resolvedTitle,
          descripcion: resolvedDesc,
          translations:
            savedTranslations.es || savedTranslations.en ? savedTranslations : undefined,
          ruta_materializada: normData.ruta_materializada,
          nivel: indent.level,
          es_padre: false,
          deleted_at: null,
        };
        state.domainData.requirementsCatalog = [
          newReq,
          ...state.domainData.requirementsCatalog.map((req) =>
            normData.id_requisito_padre && req.id === normData.id_requisito_padre
              ? { ...req, es_padre: true }
              : req
          ),
        ];
        state.domainData.requirements = [
          {
            id: createdId,
            id_norma: parentNorma.id,
            id_requisito_padre: normData.id_requisito_padre,
            codigo: newReq.codigo,
            ruta_materializada: newReq.ruta_materializada,
            norma: parentNorma.codigo,
            titulo: newReq.titulo,
            descripcion: newReq.descripcion,
          },
          ...state.domainData.requirements,
        ];
        recalculateNormaClausulaCounts();

        state.extraDomain.isCreatingRequisito = false;
        state.extraDomain.isEditingRequisito = false;
        state.extraDomain.prefillRequisitoNormaId = null;
        state.extraDomain.prefillRequisitoPadreId = null;
        state.extraDomain.selectedRequisitoId = createdId;
        state.extraDomain.activeRequisitoTab = 'subrequisitos';
        if (state.extraDomain.requisitoLangMode !== 'both') {
          state.extraDomain.requisitoLangMode = state.extraDomain.requisitoEditorLang;
        }
        state.extraDomain.requisitoEditorLinkPopoverOpen = false;
        state.extraDomain.requisitoEditorLinkUrl = '';
        state.extraDomain.requisitoEditorLinkLabel = '';
        state.extraDomain.requisitoEditorLinkError = null;
        state.extraDomain.requisitoEditorPickerOpen = false;
        state.extraDomain.requisitoEditorPickerQuery = '';
        state.extraDomain.requisitoFormDraft = undefined;
        state.extraDomain.requisitoEditError = null;

        const baseTrail = state.breadcrumbs.filter((seg) => seg.id !== 'requisito-new');
        const resolvedBase =
          baseTrail.length > 0 ? baseTrail : resetBreadcrumbToDomain('extra', 'standards');
        state.breadcrumbs = pushBreadcrumb(resolvedBase, {
          id: `requisito-${createdId}`,
          label: `Cláusula ${newReq.codigo}`,
          route: 'extra',
          subview: 'standards',
          entityType: 'requisito',
          entityId: createdId,
          parentEntityId: newReq.id_requisito_padre || newReq.id_norma,
          tab: 'subrequisitos',
          tooltip: `${newReq.norma_codigo} · Cláusula ${newReq.codigo}`,
        });

        recordPhase5SessionLog('requisito', createdId, 'INSERT', null, normData);
        showFloatingToast('Cláusula guardada correctamente.', 'success');
        render();
        return;
      }

      if (!currentId) return;
      const current = existingReqs.find((r) => r.id === currentId && !r.deleted_at);
      if (!current) return;

      const validParentsCheck = filterValidParentRequisitos(
        existingReqs,
        normData.id_norma,
        currentId
      );
      if (
        normData.id_requisito_padre &&
        !validParentsCheck.some((p) => p.id === normData.id_requisito_padre)
      ) {
        state.extraDomain.requisitoEditError =
          'La cláusula padre seleccionada generaría un ciclo jerárquico inválido.';
        render();
        return;
      }

      if (isValidUuid(currentId)) {
        try {
          let updateRes = await supabase
            .from('requisito')
            .update({
              id_norma: normData.id_norma,
              id_requisito_padre: normData.id_requisito_padre,
              codigo: normData.codigo,
              explicit_code: normData.explicit_code,
              es_obligatorio: normData.es_obligatorio,
              obligatorio_origen: normData.obligatorio_origen,
              ruta_materializada: normData.ruta_materializada,
              updated_at: new Date().toISOString(),
            })
            .eq('id', currentId)
            .is('deleted_at', null);

          if (updateRes.error && isMissingTableOrSchemaError(updateRes.error)) {
            updateRes = await supabase
              .from('requisito')
              .update({
                id_norma: normData.id_norma,
                id_requisito_padre: normData.id_requisito_padre,
                codigo: normData.codigo,
                ruta_materializada: normData.ruta_materializada,
                updated_at: new Date().toISOString(),
              })
              .eq('id', currentId)
              .is('deleted_at', null);
          }

          if (updateRes.error && !isMissingTableOrSchemaError(updateRes.error)) {
            state.extraDomain.requisitoEditError = translateDatabaseError(updateRes.error);
            render();
            return;
          }
        } catch {
          // Reactive fallback
        }
      }

      const oldPath = current.ruta_materializada;
      const descendantUpdates: Array<{ id: string; ruta_materializada: string }> = [];
      if (oldPath && normData.ruta_materializada !== oldPath) {
        for (const req of state.domainData.requirementsCatalog) {
          if (
            !req.deleted_at &&
            req.id !== currentId &&
            req.id_norma === current.id_norma &&
            req.ruta_materializada.startsWith(`${oldPath}.`)
          ) {
            descendantUpdates.push({
              id: req.id,
              ruta_materializada: `${normData.ruta_materializada}${req.ruta_materializada.slice(
                oldPath.length
              )}`,
            });
          }
        }
        if (descendantUpdates.length > 0 && isValidUuid(currentId)) {
          const nowIso = new Date().toISOString();
          await Promise.all(
            descendantUpdates
              .filter((d) => isValidUuid(d.id))
              .map(async (d) => {
                try {
                  await supabase
                    .from('requisito')
                    .update({
                      id_norma: normData.id_norma,
                      ruta_materializada: d.ruta_materializada,
                      updated_at: nowIso,
                    })
                    .eq('id', d.id)
                    .is('deleted_at', null);
                } catch {
                  // Offline fallback
                }
              })
          );
        }
      }

      const savedTranslations = await persistRequisitoTranslations(
        currentId,
        normData,
        current.translations
      );
      const resolvedTitle =
        savedTranslations.es?.title ||
        savedTranslations.en?.title ||
        '';
      const resolvedDesc = extractPlainClauseDescription(
        savedTranslations,
        current.descripcion
      );

      const oldSnapshot = {
        id_norma: current.id_norma,
        id_requisito_padre: current.id_requisito_padre,
        codigo: current.codigo,
        explicit_code: Boolean(current.explicit_code),
        es_obligatorio: current.es_obligatorio ?? true,
        obligatorio_origen: current.obligatorio_origen ?? 'AUTO_TEXT',
        ruta_materializada: current.ruta_materializada,
      };
      const indent = calculateLtreeIndentation(normData.ruta_materializada, normData.codigo);
      const descendantPathById = new Map(
        descendantUpdates.map((d) => [d.id, d.ruta_materializada])
      );

      state.domainData.requirementsCatalog = state.domainData.requirementsCatalog.map((req) => {
        if (req.id === currentId) {
          return {
            ...req,
            id_norma: parentNorma.id,
            norma_codigo: parentNorma.codigo,
            id_requisito_padre: normData.id_requisito_padre,
            codigo: normData.codigo,
            explicit_code: normData.explicit_code,
            es_obligatorio: normData.es_obligatorio,
            obligatorio_origen: normData.obligatorio_origen,
            titulo: resolvedTitle,
            descripcion: resolvedDesc,
            translations:
              savedTranslations.es || savedTranslations.en ? savedTranslations : {},
            ruta_materializada: normData.ruta_materializada,
            nivel: indent.level,
            es_padre: current.es_padre,
          };
        }
        const updatedDescPath = descendantPathById.get(req.id);
        if (updatedDescPath) {
          const descIndent = calculateLtreeIndentation(updatedDescPath, req.codigo);
          return {
            ...req,
            id_norma: parentNorma.id,
            norma_codigo: parentNorma.codigo,
            ruta_materializada: updatedDescPath,
            nivel: descIndent.level,
          };
        }
        return req;
      });
      state.domainData.requirements = state.domainData.requirementsCatalog.map((req) => ({
        id: req.id,
        id_norma: req.id_norma,
        id_requisito_padre: req.id_requisito_padre,
        codigo: req.codigo,
        ruta_materializada: req.ruta_materializada,
        norma: req.norma_codigo,
        titulo: req.titulo,
        descripcion: req.descripcion,
      }));
      recalculateNormaClausulaCounts();

      state.breadcrumbs = state.breadcrumbs.map((seg) =>
        seg.entityType === 'requisito' && seg.entityId === currentId
          ? {
              ...seg,
              label: `Cláusula ${normData.codigo}`,
              parentEntityId: normData.id_requisito_padre || parentNorma.id,
              tooltip: `${parentNorma.codigo} · Cláusula ${normData.codigo}`,
            }
          : seg
      );

      recordPhase5SessionLog('requisito', currentId, 'UPDATE', oldSnapshot, normData);
      state.extraDomain.isEditingRequisito = false;
      if (state.extraDomain.requisitoLangMode !== 'both') {
        state.extraDomain.requisitoLangMode = state.extraDomain.requisitoEditorLang;
      }
      state.extraDomain.requisitoEditorLinkPopoverOpen = false;
      state.extraDomain.requisitoEditorLinkUrl = '';
      state.extraDomain.requisitoEditorLinkLabel = '';
      state.extraDomain.requisitoEditorLinkError = null;
      state.extraDomain.requisitoEditorPickerOpen = false;
      state.extraDomain.requisitoEditorPickerQuery = '';
      state.extraDomain.requisitoFormDraft = undefined;
      state.extraDomain.requisitoEditError = null;
      showFloatingToast('Cláusula guardada correctamente.', 'success');
      render();
    })();
  });

  // --- 2. Sectores IAF & Sub-Sectores Events (Step 2.3 CRUD + Clean List) ---
  const navigateToSectorDetail = (secId: string): void => {
    if (!secId) return;
    const sectoresPool = getResolvedSectoresCatalog();
    const sec =
      sectoresPool.find((s) => s.id === secId || String(s.sector) === secId) ||
      INITIAL_SECTORES_IAF.find((s) => s.id === secId || String(s.sector) === secId);
    const resolvedId = sec?.id || secId;
    clearAllEntitySelections();
    state.activeRoute = 'extra';
    state.activeSubSection = 'iaf';
    state.extraDomain.selectedSectorId = resolvedId;
    state.extraDomain.activeSectorTab = 'subsectores';
    state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
      id: `sector-${resolvedId}`,
      label: sec ? `Sector ${sec.sector}` : 'Sector IAF',
      route: 'extra',
      subview: 'iaf',
      entityType: 'sector_iaf',
      entityId: resolvedId,
      tab: 'subsectores',
      tooltip: sec ? `Sector IAF > ${sec.descripcion}` : `Sector IAF`,
    });
    syncUrlHash('extra', 'iaf');
    render();
  };

  document
    .querySelectorAll<HTMLElement>(
      '[data-action="select-sector-iaf"], [data-action="select-iaf"], [data-action="select-iaf-sector"]'
    )
    .forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.target as HTMLElement | null;
        if (btn.tagName === 'TR' && target?.closest('button, a, input, select')) return;
        const secId = btn.dataset.sectorId;
        if (secId) navigateToSectorDetail(secId);
      });
    });

  document.querySelectorAll<HTMLElement>('[data-action="back-to-iaf-list"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.navBack === 'true') return;
      backtrackToParentBreadcrumb();
      render();
    });
  });

  document.querySelectorAll<HTMLElement>('[data-iaf-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.iafTab;
      if (
        tab === 'subsectores' ||
        tab === 'acreditaciones' ||
        tab === 'certificados' ||
        tab === 'auditores'
      ) {
        state.extraDomain.activeSectorTab = tab;
        syncCurrentBreadcrumbTab(tab);
        render();
      }
    });
  });

  document
    .querySelectorAll<HTMLElement>('[data-action="open-create-sector-iaf"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!isApprovedStaff()) return;
        clearAllEntitySelections();
        state.activeRoute = 'extra';
        state.activeSubSection = 'iaf';
        state.extraDomain.isCreatingSector = true;
        state.extraDomain.isEditingSector = false;
        state.extraDomain.sectorFormDraft = createEmptySectorIafFormDraft();
        state.extraDomain.sectorEditError = null;
        state.breadcrumbs = pushBreadcrumb(
          resetBreadcrumbToDomain('extra', 'iaf'),
          createNewEntityBreadcrumbSegment({
            entityType: 'sector_iaf',
            label: 'Nuevo Sector IAF',
            route: 'extra',
            subview: 'iaf',
            tooltip: 'Extra > Sector IAF > Nuevo Sector IAF',
          })
        );
        syncUrlHash('extra', 'iaf');
        render();
      });
    });

  document.getElementById('startEditSectorIafBtn')?.addEventListener('click', () => {
    if (!isApprovedStaff()) return;
    const sec = getResolvedSectoresCatalog().find(
      (s) => s.id === state.extraDomain.selectedSectorId
    );
    if (!sec) return;
    state.extraDomain.isEditingSector = true;
    state.extraDomain.sectorEditError = null;
    state.extraDomain.sectorFormDraft = createSectorIafDraftFromEntity(sec);
    render();
  });

  document.getElementById('cancelEditSectorIafBtn')?.addEventListener('click', () => {
    if (state.extraDomain.isCreatingSector) {
      backtrackToParentBreadcrumb();
      render();
      return;
    }
    state.extraDomain.isEditingSector = false;
    state.extraDomain.sectorFormDraft = undefined;
    state.extraDomain.sectorEditError = null;
    render();
  });

  const syncSectorDraftFromDom = (): SectorIafFormDraft => {
    const draft: SectorIafFormDraft = {
      sector:
        (document.getElementById('sectorNumeroInput') as HTMLInputElement | null)?.value ?? '',
      descripcion:
        (document.getElementById('sectorDescripcionInput') as HTMLInputElement | null)?.value ?? '',
    };
    state.extraDomain.sectorFormDraft = draft;
    return draft;
  };

  ['sectorNumeroInput', 'sectorDescripcionInput'].forEach((controlId) => {
    document.getElementById(controlId)?.addEventListener('input', () => {
      syncSectorDraftFromDom();
    });
  });

  const recalculateSectorSubsectorCounts = (): void => {
    const activeSubs = getResolvedSubsectoresCatalog().filter((s) => !s.deleted_at);
    state.domainData.iafSectors = state.domainData.iafSectors.map((sec) => ({
      ...sec,
      subsectores_count: activeSubs.filter(
        (sub) => sub.id_sector_iaf === sec.id || sub.sector_numero === sec.sector
      ).length,
    }));
  };

  document.getElementById('sectorIafDetailForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!isApprovedStaff()) return;

    const draft = syncSectorDraftFromDom();

    const currentId = state.extraDomain.selectedSectorId;
    const isCreate = !currentId && state.extraDomain.isCreatingSector;
    const existingCatalog = getResolvedSectoresCatalog();
    const validation = validateSectorIafDraft(draft, existingCatalog, currentId || undefined);

    if (!validation.valid || !validation.normalized) {
      state.extraDomain.sectorEditError =
        validation.error || 'No se pudo validar el Sector IAF.';
      render();
      return;
    }

    const { sector: nextSectorNum, descripcion: nextSectorDesc } = validation.normalized;

    void (async () => {
      if (isCreate) {
        let createdId: string = crypto.randomUUID();
        try {
          const { data, error } = await supabase
            .from('sector_iaf')
            .insert({ sector: nextSectorNum, descripcion: nextSectorDesc })
            .select('id')
            .single();
          if (error) {
            if (isMissingTableOrSchemaError(error)) {
              const fallbackRes = await supabase
                .from('sector_iaf')
                .insert({ sector: nextSectorNum })
                .select('id')
                .single();
              if (!fallbackRes.error && fallbackRes.data?.id) {
                createdId = String(fallbackRes.data.id);
              }
            } else {
              state.extraDomain.sectorEditError = translateDatabaseError(error);
              render();
              return;
            }
          } else if (data?.id) {
            createdId = String(data.id);
          }
        } catch {
          // Reactive fallback
        }

        const newSector: IafRecord = {
          id: createdId,
          sector: nextSectorNum,
          descripcion: nextSectorDesc,
          subsectores_count: 0,
          auditores_count: 0,
        };
        state.domainData.iafSectors = [newSector, ...state.domainData.iafSectors];
        state.extraDomain.isCreatingSector = false;
        state.extraDomain.isEditingSector = false;
        state.extraDomain.selectedSectorId = createdId;
        state.extraDomain.activeSectorTab = 'subsectores';
        state.extraDomain.sectorFormDraft = undefined;
        state.extraDomain.sectorEditError = null;

        const baseTrail = state.breadcrumbs.filter((seg) => seg.id !== 'sector_iaf-new');
        const resolvedBase =
          baseTrail.length > 0 ? baseTrail : resetBreadcrumbToDomain('extra', 'iaf');
        state.breadcrumbs = pushBreadcrumb(resolvedBase, {
          id: `sector-${createdId}`,
          label: `Sector ${nextSectorNum}`,
          route: 'extra',
          subview: 'iaf',
          entityType: 'sector_iaf',
          entityId: createdId,
          tab: 'subsectores',
          tooltip: `Sector IAF > ${nextSectorDesc}`,
        });

        recordPhase5SessionLog('sector_iaf', createdId, 'INSERT', null, {
          sector: nextSectorNum,
          descripcion: nextSectorDesc,
        });
        showFloatingToast(`Sector IAF ${nextSectorNum} creado correctamente.`, 'success');
        render();
        return;
      }

      if (!currentId) return;
      const current = existingCatalog.find((s) => s.id === currentId);
      if (!current) return;

      if (isValidUuid(currentId)) {
        try {
          const { error } = await supabase
            .from('sector_iaf')
            .update({
              sector: nextSectorNum,
              descripcion: nextSectorDesc,
              updated_at: new Date().toISOString(),
            })
            .eq('id', currentId)
            .is('deleted_at', null);
          if (error) {
            if (isMissingTableOrSchemaError(error)) {
              const fallbackUpdate = await supabase
                .from('sector_iaf')
                .update({
                  sector: nextSectorNum,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', currentId)
                .is('deleted_at', null);
              if (fallbackUpdate.error && !isMissingTableOrSchemaError(fallbackUpdate.error)) {
                state.extraDomain.sectorEditError = translateDatabaseError(fallbackUpdate.error);
                render();
                return;
              }
            } else {
              state.extraDomain.sectorEditError = translateDatabaseError(error);
              render();
              return;
            }
          }
        } catch {
          // Reactive fallback
        }
      }

      const oldSnapshot = { sector: current.sector, descripcion: current.descripcion };
      if (state.domainData.iafSectors.some((s) => s.id === currentId)) {
        state.domainData.iafSectors = state.domainData.iafSectors.map((s) =>
          s.id === currentId
            ? { ...s, sector: nextSectorNum, descripcion: nextSectorDesc }
            : s
        );
      } else {
        state.domainData.iafSectors = [
          {
            id: currentId,
            sector: nextSectorNum,
            descripcion: nextSectorDesc,
            subsectores_count: current.subsectores_count,
            auditores_count: current.auditores_count,
          },
          ...state.domainData.iafSectors,
        ];
      }

      // Cascade sector_numero & descripcion to child subsectores, certs, accreditations
      state.domainData.iafSubsectors = state.domainData.iafSubsectors.map((sub) =>
        sub.id_sector_iaf === currentId ? { ...sub, sector_numero: nextSectorNum } : sub
      );
      state.domainData.allCertificadosDetailed = state.domainData.allCertificadosDetailed.map(
        (cert) =>
          cert.id_sector_iaf === currentId
            ? {
                ...cert,
                sector_iaf: nextSectorNum,
                sector_iaf_descripcion: nextSectorDesc,
              }
            : cert
      );
      state.domainData.allAcreditaciones = state.domainData.allAcreditaciones.map((acr) => ({
        ...acr,
        sectores: acr.sectores.map((link) =>
          link.id_sector_iaf === currentId
            ? { ...link, sector: nextSectorNum, descripcion: nextSectorDesc }
            : link
        ),
      }));

      state.breadcrumbs = state.breadcrumbs.map((seg) =>
        seg.entityType === 'sector_iaf' && seg.entityId === currentId
          ? {
              ...seg,
              label: `Sector ${nextSectorNum}`,
              tooltip: `Sector IAF > ${nextSectorDesc}`,
            }
          : seg
      );

      recordPhase5SessionLog('sector_iaf', currentId, 'UPDATE', oldSnapshot, {
        sector: nextSectorNum,
        descripcion: nextSectorDesc,
      });
      state.extraDomain.isEditingSector = false;
      state.extraDomain.sectorFormDraft = undefined;
      state.extraDomain.sectorEditError = null;
      showFloatingToast('Sector IAF actualizado correctamente.', 'success');
      render();
    })();
  });

  // --- 2b. Sub-Sector IAF Events ('read' | 'add' | 'edit' Detail View) ---
  document
    .querySelectorAll<HTMLElement>('[data-action="open-create-subsector-iaf"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!isApprovedStaff()) return;
        const prefillSectorId =
          btn.dataset.sectorId || state.extraDomain.selectedSectorId || '';
        const comingFromSector = Boolean(
          prefillSectorId && state.extraDomain.selectedSectorId === prefillSectorId
        );
        const baseBreadcrumbs = comingFromSector
          ? state.breadcrumbs
          : resetBreadcrumbToDomain('extra', 'iaf');
        clearAllEntitySelections();
        state.activeRoute = 'extra';
        state.activeSubSection = 'iaf';
        state.extraDomain.prefillSubsectorSectorId = prefillSectorId || null;
        state.extraDomain.isCreatingSubsector = true;
        state.extraDomain.isEditingSubsector = false;
        state.extraDomain.subsectorFormDraft = createEmptySubsectorIafFormDraft(prefillSectorId);
        state.extraDomain.subsectorEditError = null;
        state.breadcrumbs = pushBreadcrumb(
          baseBreadcrumbs,
          createNewEntityBreadcrumbSegment({
            entityType: 'subsector_iaf',
            label: 'Nuevo Sub-Sector',
            route: 'extra',
            subview: 'iaf',
            parentEntityId: prefillSectorId || undefined,
            tooltip: 'Extra > Sector IAF > Nuevo Sub-Sector',
          })
        );
        syncUrlHash('extra', 'iaf');
        render();
      });
    });

  document
    .querySelectorAll<HTMLElement>('[data-action="select-subsector-iaf"]')
    .forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.target as HTMLElement | null;
        if (btn.tagName === 'TR' && target?.closest('button, a, input, select')) return;
        const subId = btn.dataset.subsectorId;
        if (!subId) return;
        const sub = getResolvedSubsectoresCatalog().find((s) => s.id === subId);
        const baseBreadcrumbs = state.breadcrumbs;
        clearAllEntitySelections();
        state.activeRoute = 'extra';
        state.activeSubSection = 'iaf';
        state.extraDomain.selectedSubsectorId = subId;
        state.extraDomain.activeSubsectorTab = 'certificados';
        state.breadcrumbs = pushBreadcrumb(baseBreadcrumbs, {
          id: `subsector-${subId}`,
          label: sub ? `Sub-Sector ${sub.codigo}` : 'Sub-Sector IAF',
          route: 'extra',
          subview: 'iaf',
          entityType: 'subsector_iaf',
          entityId: subId,
          parentEntityId: sub?.id_sector_iaf || null,
          tab: 'certificados',
          tooltip: sub
            ? `Sub-Sector IAF > ${sub.codigo} — ${sub.descripcion}`
            : 'Sub-Sector IAF',
        });
        syncUrlHash('extra', 'iaf');
        render();
      });
    });

  document
    .querySelectorAll<HTMLElement>('[data-action="back-to-subsector-parent"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.navBack === 'true') return;
        backtrackToParentBreadcrumb();
        render();
      });
    });

  document.querySelectorAll<HTMLElement>('[data-subsector-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.subsectorTab;
      if (tab === 'certificados' || tab === 'auditores') {
        state.extraDomain.activeSubsectorTab = tab;
        syncCurrentBreadcrumbTab(tab);
        render();
      }
    });
  });

  document.getElementById('startEditSubsectorBtn')?.addEventListener('click', () => {
    if (!isApprovedStaff()) return;
    const sub = getResolvedSubsectoresCatalog().find(
      (s) => s.id === state.extraDomain.selectedSubsectorId && !s.deleted_at
    );
    if (!sub) return;
    state.extraDomain.isEditingSubsector = true;
    state.extraDomain.subsectorEditError = null;
    state.extraDomain.subsectorFormDraft = createSubsectorIafDraftFromEntity(sub);
    render();
  });

  document.getElementById('cancelEditSubsectorBtn')?.addEventListener('click', () => {
    if (state.extraDomain.isCreatingSubsector) {
      backtrackToParentBreadcrumb();
      render();
      return;
    }
    state.extraDomain.isEditingSubsector = false;
    state.extraDomain.subsectorFormDraft = undefined;
    state.extraDomain.subsectorEditError = null;
    render();
  });

  const syncSubsectorDraftFromDom = (): SubsectorIafFormDraft => {
    const rawRisk =
      (document.getElementById('subsectorRiesgoSelect') as HTMLSelectElement | null)?.value ||
      'MEDIO';
    const categoria_riesgo: SubsectorRiskCategory =
      rawRisk === 'ALTO' || rawRisk === 'BAJO' ? rawRisk : 'MEDIO';
    const draft: SubsectorIafFormDraft = {
      id_sector_iaf:
        (document.getElementById('subsectorSelectSector') as HTMLSelectElement | null)?.value ||
        '',
      codigo:
        (document.getElementById('subsectorCodigoInput') as HTMLInputElement | null)?.value ?? '',
      descripcion:
        (document.getElementById('subsectorDescripcionInput') as HTMLTextAreaElement | null)
          ?.value ?? '',
      categoria_riesgo,
    };
    state.extraDomain.subsectorFormDraft = draft;
    return draft;
  };

  [
    'subsectorSelectSector',
    'subsectorCodigoInput',
    'subsectorRiesgoSelect',
    'subsectorDescripcionInput',
  ].forEach((controlId) => {
    const el = document.getElementById(controlId);
    el?.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
      syncSubsectorDraftFromDom();
    });
  });

  document.getElementById('subsectorDetailForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!isApprovedStaff()) return;

    const draft = syncSubsectorDraftFromDom();
    const currentId = state.extraDomain.selectedSubsectorId;
    const isCreate = !currentId && state.extraDomain.isCreatingSubsector;
    const existingSubsectores = getResolvedSubsectoresCatalog();
    const validation = validateSubsectorIafDraft(
      draft,
      existingSubsectores,
      currentId || undefined
    );

    if (!validation.valid || !validation.normalized) {
      state.extraDomain.subsectorEditError =
        validation.error || 'No se pudieron validar los datos del Sub-Sector IAF.';
      render();
      return;
    }

    const normData = validation.normalized;
    const sectoresCatalog = getResolvedSectoresCatalog();
    const parentSector = sectoresCatalog.find((s) => s.id === normData.id_sector_iaf);
    if (!parentSector) {
      state.extraDomain.subsectorEditError =
        'No se pudo resolver el Sector IAF padre seleccionado.';
      render();
      return;
    }

    void (async () => {
      if (isCreate) {
        let createdId: string = crypto.randomUUID();
        try {
          const { data, error } = await supabase
            .from('subsector_iaf')
            .insert({
              id_sector_iaf: normData.id_sector_iaf,
              codigo: normData.codigo,
              descripcion: normData.descripcion,
              categoria_riesgo: normData.categoria_riesgo,
            })
            .select('id')
            .single();
          if (error) {
            if (!isMissingTableOrSchemaError(error)) {
              state.extraDomain.subsectorEditError = translateDatabaseError(error);
              render();
              return;
            }
          } else if (data?.id) {
            createdId = String(data.id);
          }
        } catch {
          // Reactive fallback
        }

        const newSubsector: SubsectorIafEntity = {
          id: createdId,
          id_sector_iaf: parentSector.id,
          sector_numero: parentSector.sector,
          codigo: normData.codigo,
          descripcion: normData.descripcion,
          categoria_riesgo: normData.categoria_riesgo,
          auditores_nombres: [],
          deleted_at: null,
        };
        state.domainData.iafSubsectors = [newSubsector, ...state.domainData.iafSubsectors];
        recalculateSectorSubsectorCounts();

        state.extraDomain.isCreatingSubsector = false;
        state.extraDomain.isEditingSubsector = false;
        state.extraDomain.prefillSubsectorSectorId = null;
        state.extraDomain.selectedSubsectorId = createdId;
        state.extraDomain.activeSubsectorTab = 'certificados';
        state.extraDomain.subsectorFormDraft = undefined;
        state.extraDomain.subsectorEditError = null;

        const baseTrail = state.breadcrumbs.filter((seg) => seg.id !== 'subsector_iaf-new');
        const resolvedBase =
          baseTrail.length > 0 ? baseTrail : resetBreadcrumbToDomain('extra', 'iaf');
        state.breadcrumbs = pushBreadcrumb(resolvedBase, {
          id: `subsector-${createdId}`,
          label: `Sub-Sector ${newSubsector.codigo}`,
          route: 'extra',
          subview: 'iaf',
          entityType: 'subsector_iaf',
          entityId: createdId,
          parentEntityId: newSubsector.id_sector_iaf,
          tab: 'certificados',
          tooltip: `Sub-Sector IAF > ${newSubsector.codigo} — ${newSubsector.descripcion}`,
        });

        recordPhase5SessionLog('subsector_iaf', createdId, 'INSERT', null, {
          id_sector_iaf: newSubsector.id_sector_iaf,
          codigo: newSubsector.codigo,
          categoria_riesgo: newSubsector.categoria_riesgo,
        });
        showFloatingToast(`Sub-Sector ${newSubsector.codigo} creado correctamente.`, 'success');
        render();
        return;
      }

      if (!currentId) return;
      const current = existingSubsectores.find((s) => s.id === currentId && !s.deleted_at);
      if (!current) return;

      if (isValidUuid(currentId)) {
        try {
          const { error } = await supabase
            .from('subsector_iaf')
            .update({
              id_sector_iaf: normData.id_sector_iaf,
              codigo: normData.codigo,
              descripcion: normData.descripcion,
              categoria_riesgo: normData.categoria_riesgo,
              updated_at: new Date().toISOString(),
            })
            .eq('id', currentId)
            .is('deleted_at', null);
          if (error && !isMissingTableOrSchemaError(error)) {
            state.extraDomain.subsectorEditError = translateDatabaseError(error);
            render();
            return;
          }
        } catch {
          // Reactive fallback
        }
      }

      const oldSnapshot = {
        id_sector_iaf: current.id_sector_iaf,
        codigo: current.codigo,
        descripcion: current.descripcion,
        categoria_riesgo: current.categoria_riesgo,
      };
      const nextSubsector: SubsectorIafEntity = {
        ...current,
        id_sector_iaf: parentSector.id,
        sector_numero: parentSector.sector,
        codigo: normData.codigo,
        descripcion: normData.descripcion,
        categoria_riesgo: normData.categoria_riesgo,
      };

      state.domainData.iafSubsectors = state.domainData.iafSubsectors.map((sub) =>
        sub.id === currentId ? nextSubsector : sub
      );
      recalculateSectorSubsectorCounts();

      // Propagate real-time updates to linked certificates & auditor competencies
      state.domainData.allCertificadosDetailed = state.domainData.allCertificadosDetailed.map(
        (cert) =>
          cert.id_subsector_iaf === currentId
            ? {
                ...cert,
                id_sector_iaf: parentSector.id,
                sector_iaf: parentSector.sector,
                sector_iaf_descripcion: parentSector.descripcion,
                subsector_iaf_codigo: nextSubsector.codigo,
                subsector_iaf_descripcion: nextSubsector.descripcion,
              }
            : cert
      );
      state.domainData.allAuditorsDetailed = state.domainData.allAuditorsDetailed.map((aud) => {
        if (!aud.competencias.some((c) => c.id_subsector_iaf === currentId)) {
          return aud;
        }
        const nextComps = aud.competencias.map((comp) =>
          comp.id_subsector_iaf === currentId
            ? {
                ...comp,
                id_sector_iaf: parentSector.id,
                sector_iaf_numero: parentSector.sector,
                subsector_iaf_codigo: nextSubsector.codigo,
                subsector_iaf_descripcion: nextSubsector.descripcion,
              }
            : comp
        );
        return {
          ...aud,
          competencias: nextComps,
          sectores_iaf: Array.from(
            new Set(nextComps.map((c) => c.sector_iaf_numero))
          ).sort((a, b) => a - b),
        };
      });

      state.breadcrumbs = state.breadcrumbs.map((seg) =>
        seg.entityType === 'subsector_iaf' && seg.entityId === currentId
          ? {
              ...seg,
              label: `Sub-Sector ${nextSubsector.codigo}`,
              parentEntityId: nextSubsector.id_sector_iaf,
              tooltip: `Sub-Sector IAF > ${nextSubsector.codigo} — ${nextSubsector.descripcion}`,
            }
          : seg
      );

      recordPhase5SessionLog('subsector_iaf', currentId, 'UPDATE', oldSnapshot, {
        id_sector_iaf: nextSubsector.id_sector_iaf,
        codigo: nextSubsector.codigo,
        descripcion: nextSubsector.descripcion,
        categoria_riesgo: nextSubsector.categoria_riesgo,
      });

      state.extraDomain.isEditingSubsector = false;
      state.extraDomain.subsectorFormDraft = undefined;
      state.extraDomain.subsectorEditError = null;
      showFloatingToast('Sub-Sector IAF actualizado correctamente.', 'success');
      render();
    })();
  });

  // --- 3. Estatus Catalog Events (Step 2.1 CRUD + Clean List) ---
  document.querySelectorAll<HTMLElement>('[data-action="open-create-estatus"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!isApprovedStaff()) return;
      clearAllEntitySelections();
      state.activeRoute = 'extra';
      state.activeSubSection = 'estatus';
      state.extraDomain.isCreatingEstatus = true;
      state.extraDomain.isEditingEstatus = false;
      state.extraDomain.estatusFormDraft = createEmptyEstatusFormDraft();
      state.extraDomain.estatusEditError = null;
      state.breadcrumbs = pushBreadcrumb(
        resetBreadcrumbToDomain('extra', 'estatus'),
        createNewEntityBreadcrumbSegment({
          entityType: 'estatus',
          label: 'Nuevo Estatus',
          route: 'extra',
          subview: 'estatus',
          tooltip: 'Extra > Estatus > Nuevo Estatus',
        })
      );
      syncUrlHash('extra', 'estatus');
      render();
    });
  });

  document.querySelectorAll<HTMLElement>('[data-action="select-estatus"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const estId = btn.dataset.estatusId;
      if (!estId) return;
      const catalog = getResolvedEstatusCatalog();
      const est = catalog.find((e) => e.id === estId || e.estatus === estId);
      clearAllEntitySelections();
      state.activeRoute = 'extra';
      state.activeSubSection = 'estatus';
      state.extraDomain.selectedEstatusId = est?.id || estId;
      state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
        id: `estatus-${est?.id || estId}`,
        label: est?.estatus || 'Estatus',
        route: 'extra',
        subview: 'estatus',
        entityType: 'estatus',
        entityId: est?.id || estId,
        tab: state.extraDomain.activeEstatusTab,
        tooltip: `Estatus > ${est?.estatus || estId}`,
      });
      syncUrlHash('extra', 'estatus');
      render();
    });
  });

  document.querySelectorAll<HTMLElement>('[data-action="back-to-estatus-list"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.navBack === 'true') return;
      backtrackToParentBreadcrumb();
      render();
    });
  });

  document.querySelectorAll<HTMLElement>('[data-estatus-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.estatusTab;
      if (tab === 'certificados' || tab === 'auditorias' || tab === 'reglas') {
        state.extraDomain.activeEstatusTab = tab;
        syncCurrentBreadcrumbTab(tab);
        render();
      }
    });
  });

  document.getElementById('startEditEstatusBtn')?.addEventListener('click', () => {
    if (!isApprovedStaff()) return;
    const est = getResolvedEstatusCatalog().find(
      (e) => e.id === state.extraDomain.selectedEstatusId
    );
    if (!est) return;
    state.extraDomain.isEditingEstatus = true;
    state.extraDomain.estatusEditError = null;
    state.extraDomain.estatusFormDraft = createEstatusFormDraftFromEntity(est);
    render();
  });

  document.getElementById('cancelEditEstatusBtn')?.addEventListener('click', () => {
    if (state.extraDomain.isCreatingEstatus) {
      backtrackToParentBreadcrumb();
      render();
      return;
    }
    state.extraDomain.isEditingEstatus = false;
    state.extraDomain.estatusFormDraft = undefined;
    state.extraDomain.estatusEditError = null;
    render();
  });

  const estatusNombreInput = document.getElementById('estatusNombreInput') as HTMLInputElement | null;
  estatusNombreInput?.addEventListener('input', () => {
    const val = estatusNombreInput.value;
    state.extraDomain.estatusFormDraft = { estatus: val };
    const counter = document.getElementById('estatusCharCount');
    if (counter) {
      counter.textContent = `${val.length} / 50`;
    }
  });

  document.getElementById('estatusDetailForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!isApprovedStaff()) return;

    const inputVal =
      (document.getElementById('estatusNombreInput') as HTMLInputElement | null)?.value ?? '';
    const draft: EstatusFormDraft = { estatus: inputVal };
    state.extraDomain.estatusFormDraft = draft;

    const currentId = state.extraDomain.selectedEstatusId;
    const isCreate = !currentId && state.extraDomain.isCreatingEstatus;
    const existingList = getResolvedEstatusCatalog();
    const validation = validateEstatusDraft(draft, existingList, currentId || undefined);

    if (!validation.valid || !validation.normalized) {
      state.extraDomain.estatusEditError =
        validation.error || 'No se pudo validar el estatus.';
      render();
      return;
    }

    const normalizedEstatus = validation.normalized.estatus;

    void (async () => {
      if (isCreate) {
        let createdId: string = crypto.randomUUID();
        let createdLabel = normalizedEstatus;
        try {
          const { data, error } = await supabase
            .from('estatus')
            .insert({ estatus: normalizedEstatus })
            .select('id, estatus')
            .single();
          if (error) {
            if (!isMissingTableOrSchemaError(error)) {
              state.extraDomain.estatusEditError = translateDatabaseError(error);
              render();
              return;
            }
          } else if (data) {
            createdId = String(data.id);
            createdLabel = String(data.estatus || normalizedEstatus);
          }
        } catch {
          // Local reactive fallback when Supabase is unreachable
        }

        const newItem = buildEstatusCatalogItem({
          id: createdId,
          estatus: createdLabel,
          usage_count: 0,
        });
        state.domainData.estatusCatalog = [newItem, ...state.domainData.estatusCatalog];
        state.extraDomain.isCreatingEstatus = false;
        state.extraDomain.isEditingEstatus = false;
        state.extraDomain.selectedEstatusId = createdId;
        state.extraDomain.activeEstatusTab = 'certificados';
        state.extraDomain.estatusFormDraft = undefined;
        state.extraDomain.estatusEditError = null;
        state.breadcrumbs = pushBreadcrumb(
          resetBreadcrumbToDomain('extra', 'estatus'),
          {
            id: `estatus-${createdId}`,
            label: newItem.estatus,
            route: 'extra',
            subview: 'estatus',
            entityType: 'estatus',
            entityId: createdId,
            tab: 'certificados',
            tooltip: `Estatus > ${newItem.estatus}`,
          }
        );
        recordPhase5SessionLog('estatus', createdId, 'INSERT', null, {
          estatus: newItem.estatus,
        });
        showFloatingToast('Estatus creado correctamente.', 'success');
        render();
        return;
      }

      if (!currentId) return;
      const currentItem = existingList.find((item) => item.id === currentId);
      if (!currentItem) return;

      if (isValidUuid(currentId)) {
        try {
          const { error } = await supabase
            .from('estatus')
            .update({ estatus: normalizedEstatus })
            .eq('id', currentId)
            .is('deleted_at', null);
          if (error && !isMissingTableOrSchemaError(error)) {
            state.extraDomain.estatusEditError = translateDatabaseError(error);
            render();
            return;
          }
        } catch {
          // Reactive fallback
        }
      }

      const oldSnapshot = { estatus: currentItem.estatus };
      state.domainData.estatusCatalog = state.domainData.estatusCatalog.map((item) =>
        item.id === currentId
          ? buildEstatusCatalogItem({
              id: item.id,
              estatus: normalizedEstatus,
              usage_count: item.usage_count,
              deleted_at: item.deleted_at,
            })
          : item
      );
      state.domainData.allAcreditaciones = state.domainData.allAcreditaciones.map((acr) =>
        acr.id_estatus === currentId ? { ...acr, estatus: normalizedEstatus } : acr
      );
      state.breadcrumbs = state.breadcrumbs.map((seg) =>
        seg.entityType === 'estatus' && seg.entityId === currentId
          ? {
              ...seg,
              label: normalizedEstatus,
              tooltip: `Estatus > ${normalizedEstatus}`,
            }
          : seg
      );
      state.extraDomain.isEditingEstatus = false;
      state.extraDomain.estatusFormDraft = undefined;
      state.extraDomain.estatusEditError = null;
      recordPhase5SessionLog('estatus', currentId, 'UPDATE', oldSnapshot, {
        estatus: normalizedEstatus,
      });
      showFloatingToast('Cambios guardados exitosamente.', 'success');
      render();
    })();
  });

  // --- 4. Tipos de Auditoría Events (Step 2.1 CRUD + Clean List) ---
  document.querySelectorAll<HTMLElement>('[data-action="open-create-tipo"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!isApprovedStaff()) return;
      clearAllEntitySelections();
      state.activeRoute = 'extra';
      state.activeSubSection = 'tipos';
      state.extraDomain.isCreatingTipo = true;
      state.extraDomain.isEditingTipo = false;
      state.extraDomain.tipoFormDraft = createEmptyTipoFormDraft();
      state.extraDomain.tipoEditError = null;
      state.breadcrumbs = pushBreadcrumb(
        resetBreadcrumbToDomain('extra', 'tipos'),
        createNewEntityBreadcrumbSegment({
          entityType: 'tipo',
          label: 'Nuevo Tipo de Auditoría',
          route: 'extra',
          subview: 'tipos',
          tooltip: 'Extra > Tipos > Nuevo Tipo de Auditoría',
        })
      );
      syncUrlHash('extra', 'tipos');
      render();
    });
  });

  document.querySelectorAll<HTMLElement>('[data-action="select-tipo"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tipoId = btn.dataset.tipoId;
      if (!tipoId) return;
      const catalog = getResolvedTiposCatalog();
      const t = catalog.find((x) => x.id === tipoId || x.tipo === tipoId);
      clearAllEntitySelections();
      state.activeRoute = 'extra';
      state.activeSubSection = 'tipos';
      state.extraDomain.selectedTipoId = t?.id || tipoId;
      state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
        id: `tipo-${t?.id || tipoId}`,
        label: t?.tipo || 'Tipo Auditoría',
        route: 'extra',
        subview: 'tipos',
        entityType: 'tipo',
        entityId: t?.id || tipoId,
        tooltip: `Tipo Auditoría > ${t?.tipo || tipoId}`,
      });
      syncUrlHash('extra', 'tipos');
      render();
    });
  });

  document.querySelectorAll<HTMLElement>('[data-action="back-to-tipo-list"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.navBack === 'true') return;
      backtrackToParentBreadcrumb();
      render();
    });
  });

  document.getElementById('startEditTipoBtn')?.addEventListener('click', () => {
    if (!isApprovedStaff()) return;
    const t = getResolvedTiposCatalog().find(
      (item) => item.id === state.extraDomain.selectedTipoId
    );
    if (!t) return;
    state.extraDomain.isEditingTipo = true;
    state.extraDomain.tipoEditError = null;
    state.extraDomain.tipoFormDraft = createTipoFormDraftFromEntity(t);
    render();
  });

  document.getElementById('cancelEditTipoBtn')?.addEventListener('click', () => {
    if (state.extraDomain.isCreatingTipo) {
      backtrackToParentBreadcrumb();
      render();
      return;
    }
    state.extraDomain.isEditingTipo = false;
    state.extraDomain.tipoFormDraft = undefined;
    state.extraDomain.tipoEditError = null;
    render();
  });

  const tipoNombreInput = document.getElementById('tipoNombreInput') as HTMLInputElement | null;
  tipoNombreInput?.addEventListener('input', () => {
    const val = tipoNombreInput.value;
    state.extraDomain.tipoFormDraft = { tipo: val };
    const counter = document.getElementById('tipoCharCount');
    if (counter) {
      counter.textContent = `${val.length} / 50`;
    }
  });

  document.getElementById('tipoDetailForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!isApprovedStaff()) return;

    const inputVal =
      (document.getElementById('tipoNombreInput') as HTMLInputElement | null)?.value ?? '';
    const draft: TipoAuditoriaFormDraft = { tipo: inputVal };
    state.extraDomain.tipoFormDraft = draft;

    const currentId = state.extraDomain.selectedTipoId;
    const isCreate = !currentId && state.extraDomain.isCreatingTipo;
    const existingList = getResolvedTiposCatalog();
    const validation = validateTipoAuditoriaDraft(draft, existingList, currentId || undefined);

    if (!validation.valid || !validation.normalized) {
      state.extraDomain.tipoEditError =
        validation.error || 'No se pudo validar el tipo de auditoría.';
      render();
      return;
    }

    const normalizedTipo = validation.normalized.tipo;

    void (async () => {
      if (isCreate) {
        let createdId: string = crypto.randomUUID();
        let createdLabel = normalizedTipo;
        try {
          const { data, error } = await supabase
            .from('tipo_auditoria')
            .insert({ tipo: normalizedTipo })
            .select('id, tipo')
            .single();
          if (error) {
            if (!isMissingTableOrSchemaError(error)) {
              state.extraDomain.tipoEditError = translateDatabaseError(error);
              render();
              return;
            }
          } else if (data) {
            createdId = String(data.id);
            createdLabel = String(data.tipo || normalizedTipo);
          }
        } catch {
          // Reactive fallback
        }

        const newItem = buildTipoAuditoriaCatalogItem({
          id: createdId,
          tipo: createdLabel,
          usage_count: 0,
        });
        state.domainData.tiposCatalog = [newItem, ...state.domainData.tiposCatalog];
        state.extraDomain.isCreatingTipo = false;
        state.extraDomain.isEditingTipo = false;
        state.extraDomain.selectedTipoId = createdId;
        state.extraDomain.tipoFormDraft = undefined;
        state.extraDomain.tipoEditError = null;
        state.breadcrumbs = pushBreadcrumb(
          resetBreadcrumbToDomain('extra', 'tipos'),
          {
            id: `tipo-${createdId}`,
            label: newItem.tipo,
            route: 'extra',
            subview: 'tipos',
            entityType: 'tipo',
            entityId: createdId,
            tooltip: `Tipo Auditoría > ${newItem.tipo}`,
          }
        );
        recordPhase5SessionLog('tipo_auditoria', createdId, 'INSERT', null, {
          tipo: newItem.tipo,
        });
        showFloatingToast('Tipo de auditoría creado correctamente.', 'success');
        render();
        return;
      }

      if (!currentId) return;
      const currentItem = existingList.find((item) => item.id === currentId);
      if (!currentItem) return;

      if (isValidUuid(currentId)) {
        try {
          const { error } = await supabase
            .from('tipo_auditoria')
            .update({ tipo: normalizedTipo })
            .eq('id', currentId)
            .is('deleted_at', null);
          if (error && !isMissingTableOrSchemaError(error)) {
            state.extraDomain.tipoEditError = translateDatabaseError(error);
            render();
            return;
          }
        } catch {
          // Reactive fallback
        }
      }

      const oldSnapshot = { tipo: currentItem.tipo };
      state.domainData.tiposCatalog = state.domainData.tiposCatalog.map((item) =>
        item.id === currentId
          ? buildTipoAuditoriaCatalogItem({
              id: item.id,
              tipo: normalizedTipo,
              usage_count: item.usage_count,
              deleted_at: item.deleted_at,
            })
          : item
      );
      state.breadcrumbs = state.breadcrumbs.map((seg) =>
        seg.entityType === 'tipo' && seg.entityId === currentId
          ? {
              ...seg,
              label: normalizedTipo,
              tooltip: `Tipo Auditoría > ${normalizedTipo}`,
            }
          : seg
      );
      state.extraDomain.isEditingTipo = false;
      state.extraDomain.tipoFormDraft = undefined;
      state.extraDomain.tipoEditError = null;
      recordPhase5SessionLog('tipo_auditoria', currentId, 'UPDATE', oldSnapshot, {
        tipo: normalizedTipo,
      });
      showFloatingToast('Cambios guardados exitosamente.', 'success');
      render();
    })();
  });

  // --- 5. Metodologías de Auditoría Events (Step 2.1 CRUD + Clean List) ---
  document
    .querySelectorAll<HTMLElement>('[data-action="open-create-metodologia"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!isApprovedStaff()) return;
        clearAllEntitySelections();
        state.activeRoute = 'extra';
        state.activeSubSection = 'metodologias';
        state.extraDomain.isCreatingMetodologia = true;
        state.extraDomain.isEditingMetodologia = false;
        state.extraDomain.metodologiaFormDraft = createEmptyMetodologiaFormDraft();
        state.extraDomain.metodologiaEditError = null;
        state.breadcrumbs = pushBreadcrumb(
          resetBreadcrumbToDomain('extra', 'metodologias'),
          createNewEntityBreadcrumbSegment({
            entityType: 'metodologia',
            label: 'Nueva Metodología',
            route: 'extra',
            subview: 'metodologias',
            tooltip: 'Extra > Metodologías > Nueva Metodología',
          })
        );
        syncUrlHash('extra', 'metodologias');
        render();
      });
    });

  document.querySelectorAll<HTMLElement>('[data-action="select-metodologia"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const metId = btn.dataset.metodologiaId;
      if (!metId) return;
      const catalog = getResolvedMetodologiasCatalog();
      const m = catalog.find((x) => x.id === metId || x.metodologia === metId);
      clearAllEntitySelections();
      state.activeRoute = 'extra';
      state.activeSubSection = 'metodologias';
      state.extraDomain.selectedMetodologiaId = m?.id || metId;
      state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
        id: `metodologia-${m?.id || metId}`,
        label: m?.metodologia || 'Metodología',
        route: 'extra',
        subview: 'metodologias',
        entityType: 'metodologia',
        entityId: m?.id || metId,
        tooltip: `Metodología > ${m?.metodologia || metId}`,
      });
      syncUrlHash('extra', 'metodologias');
      render();
    });
  });

  document
    .querySelectorAll<HTMLElement>('[data-action="back-to-metodologia-list"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.navBack === 'true') return;
        backtrackToParentBreadcrumb();
        render();
      });
    });

  document.getElementById('startEditMetodologiaBtn')?.addEventListener('click', () => {
    if (!isApprovedStaff()) return;
    const m = getResolvedMetodologiasCatalog().find(
      (item) => item.id === state.extraDomain.selectedMetodologiaId
    );
    if (!m) return;
    state.extraDomain.isEditingMetodologia = true;
    state.extraDomain.metodologiaEditError = null;
    state.extraDomain.metodologiaFormDraft = createMetodologiaFormDraftFromEntity(m);
    render();
  });

  document.getElementById('cancelEditMetodologiaBtn')?.addEventListener('click', () => {
    if (state.extraDomain.isCreatingMetodologia) {
      backtrackToParentBreadcrumb();
      render();
      return;
    }
    state.extraDomain.isEditingMetodologia = false;
    state.extraDomain.metodologiaFormDraft = undefined;
    state.extraDomain.metodologiaEditError = null;
    render();
  });

  const metodologiaNombreInput = document.getElementById(
    'metodologiaNombreInput'
  ) as HTMLInputElement | null;
  metodologiaNombreInput?.addEventListener('input', () => {
    const val = metodologiaNombreInput.value;
    state.extraDomain.metodologiaFormDraft = { metodologia: val };
    const counter = document.getElementById('metodologiaCharCount');
    if (counter) {
      counter.textContent = `${val.length} / 50`;
    }
  });

  document.getElementById('metodologiaDetailForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!isApprovedStaff()) return;

    const inputVal =
      (document.getElementById('metodologiaNombreInput') as HTMLInputElement | null)?.value ?? '';
    const draft: MetodologiaAuditoriaFormDraft = { metodologia: inputVal };
    state.extraDomain.metodologiaFormDraft = draft;

    const currentId = state.extraDomain.selectedMetodologiaId;
    const isCreate = !currentId && state.extraDomain.isCreatingMetodologia;
    const existingList = getResolvedMetodologiasCatalog();
    const validation = validateMetodologiaAuditoriaDraft(
      draft,
      existingList,
      currentId || undefined
    );

    if (!validation.valid || !validation.normalized) {
      state.extraDomain.metodologiaEditError =
        validation.error || 'No se pudo validar la metodología.';
      render();
      return;
    }

    const normalizedMetodologia = validation.normalized.metodologia;

    void (async () => {
      if (isCreate) {
        let createdId: string = crypto.randomUUID();
        let createdLabel = normalizedMetodologia;
        try {
          const { data, error } = await supabase
            .from('metodologia_auditoria')
            .insert({ metodologia: normalizedMetodologia })
            .select('id, metodologia')
            .single();
          if (error) {
            if (!isMissingTableOrSchemaError(error)) {
              state.extraDomain.metodologiaEditError = translateDatabaseError(error);
              render();
              return;
            }
          } else if (data) {
            createdId = String(data.id);
            createdLabel = String(data.metodologia || normalizedMetodologia);
          }
        } catch {
          // Reactive fallback
        }

        const newItem = buildMetodologiaAuditoriaCatalogItem({
          id: createdId,
          metodologia: createdLabel,
          usage_count: 0,
        });
        state.domainData.metodologiasCatalog = [
          newItem,
          ...state.domainData.metodologiasCatalog,
        ];
        state.extraDomain.isCreatingMetodologia = false;
        state.extraDomain.isEditingMetodologia = false;
        state.extraDomain.selectedMetodologiaId = createdId;
        state.extraDomain.metodologiaFormDraft = undefined;
        state.extraDomain.metodologiaEditError = null;
        state.breadcrumbs = pushBreadcrumb(
          resetBreadcrumbToDomain('extra', 'metodologias'),
          {
            id: `metodologia-${createdId}`,
            label: newItem.metodologia,
            route: 'extra',
            subview: 'metodologias',
            entityType: 'metodologia',
            entityId: createdId,
            tooltip: `Metodología > ${newItem.metodologia}`,
          }
        );
        recordPhase5SessionLog('metodologia_auditoria', createdId, 'INSERT', null, {
          metodologia: newItem.metodologia,
        });
        showFloatingToast('Metodología de auditoría creada correctamente.', 'success');
        render();
        return;
      }

      if (!currentId) return;
      const currentItem = existingList.find((item) => item.id === currentId);
      if (!currentItem) return;

      if (isValidUuid(currentId)) {
        try {
          const { error } = await supabase
            .from('metodologia_auditoria')
            .update({ metodologia: normalizedMetodologia })
            .eq('id', currentId)
            .is('deleted_at', null);
          if (error && !isMissingTableOrSchemaError(error)) {
            state.extraDomain.metodologiaEditError = translateDatabaseError(error);
            render();
            return;
          }
        } catch {
          // Reactive fallback
        }
      }

      const oldSnapshot = { metodologia: currentItem.metodologia };
      state.domainData.metodologiasCatalog = state.domainData.metodologiasCatalog.map((item) =>
        item.id === currentId
          ? buildMetodologiaAuditoriaCatalogItem({
              id: item.id,
              metodologia: normalizedMetodologia,
              usage_count: item.usage_count,
              deleted_at: item.deleted_at,
            })
          : item
      );
      state.breadcrumbs = state.breadcrumbs.map((seg) =>
        seg.entityType === 'metodologia' && seg.entityId === currentId
          ? {
              ...seg,
              label: normalizedMetodologia,
              tooltip: `Metodología > ${normalizedMetodologia}`,
            }
          : seg
      );
      state.extraDomain.isEditingMetodologia = false;
      state.extraDomain.metodologiaFormDraft = undefined;
      state.extraDomain.metodologiaEditError = null;
      recordPhase5SessionLog('metodologia_auditoria', currentId, 'UPDATE', oldSnapshot, {
        metodologia: normalizedMetodologia,
      });
      showFloatingToast('Cambios guardados exitosamente.', 'success');
      render();
    })();
  });

  // --- 6. Organismos de Acreditación & Acreditaciones (Step 2.2) Events ---
  document.querySelectorAll<HTMLElement>('[data-action="open-organismos-directory"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      clearAllEntitySelections();
      state.activeRoute = 'extra';
      state.activeSubSection = 'organismos';
      state.breadcrumbs = resetBreadcrumbToDomain('extra', 'organismos');
      syncUrlHash('extra', 'organismos');
      render();
    });
  });

  document.querySelectorAll<HTMLElement>('[data-action="open-accreditations-directory"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      clearAllEntitySelections();
      state.activeRoute = 'extra';
      state.activeSubSection = 'accreditations';
      state.breadcrumbs = resetBreadcrumbToDomain('extra', 'accreditations');
      syncUrlHash('extra', 'accreditations');
      render();
    });
  });

  const navigateToOrganismoDetail = (organismoId: string): void => {
    if (!organismoId) return;
    const org = state.domainData.allOrganismos.find((o) => o.id === organismoId);
    clearAllEntitySelections();
    state.activeRoute = 'extra';
    state.activeSubSection = 'organismos';
    state.extraDomain.selectedOrganismoId = organismoId;
    state.extraDomain.activeOrganismoTab = 'acreditaciones';
    state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
      id: `organismo_acreditacion-${organismoId}`,
      label: org?.codigo || 'Organismo',
      route: 'extra',
      subview: 'organismos',
      entityType: 'organismo_acreditacion',
      entityId: organismoId,
      tab: 'acreditaciones',
      tooltip: org ? `Organismo > ${org.codigo} · ${org.nombre}` : 'Organismo',
    });
    syncUrlHash('extra', 'organismos');
    render();
  };

  document.querySelectorAll<HTMLElement>('[data-action="select-organismo"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const orgId = btn.dataset.organismoId;
      if (orgId) navigateToOrganismoDetail(orgId);
    });
  });

  document.querySelectorAll<HTMLElement>('[data-organismo-card="true"]').forEach((card) => {
    card.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('button, a, input, select')) return;
      const orgId = card.dataset.organismoId;
      if (orgId) navigateToOrganismoDetail(orgId);
    });
  });

  document
    .querySelectorAll<HTMLElement>('[data-action="back-to-organismos-list"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.navBack === 'true') return;
        backtrackToParentBreadcrumb();
        render();
      });
    });

  document.querySelectorAll<HTMLElement>('[data-action="open-create-organismo"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!isApprovedStaff()) return;
      clearAllEntitySelections();
      state.activeRoute = 'extra';
      state.activeSubSection = 'organismos';
      state.extraDomain.isCreatingOrganismo = true;
      state.extraDomain.isEditingOrganismo = false;
      state.extraDomain.organismoFormDraft = createEmptyOrganismoFormDraft();
      state.extraDomain.organismoEditError = null;
      state.breadcrumbs = pushBreadcrumb(
        resetBreadcrumbToDomain('extra', 'organismos'),
        createNewEntityBreadcrumbSegment({
          entityType: 'organismo_acreditacion',
          label: 'Nuevo Organismo',
          route: 'extra',
          subview: 'organismos',
          tooltip: 'Extra > Organismos > Nuevo Organismo',
        })
      );
      syncUrlHash('extra', 'organismos');
      render();
    });
  });

  document.getElementById('startEditOrganismoBtn')?.addEventListener('click', () => {
    if (!isApprovedStaff()) return;
    const org = state.domainData.allOrganismos.find(
      (o) => o.id === state.extraDomain.selectedOrganismoId
    );
    if (!org) return;
    state.extraDomain.isEditingOrganismo = true;
    state.extraDomain.organismoEditError = null;
    state.extraDomain.organismoFormDraft = createOrganismoDraftFromEntity(org);
    render();
  });

  document.getElementById('cancelEditOrganismoBtn')?.addEventListener('click', () => {
    if (state.extraDomain.isCreatingOrganismo) {
      backtrackToParentBreadcrumb();
      render();
      return;
    }
    state.extraDomain.isEditingOrganismo = false;
    state.extraDomain.organismoFormDraft = undefined;
    state.extraDomain.organismoEditError = null;
    render();
  });

  const syncOrganismoDraftFromDom = (): OrganismoFormDraft => {
    const draft: OrganismoFormDraft = {
      codigo:
        (document.getElementById('organismoCodigoInput') as HTMLInputElement | null)?.value ?? '',
      nombre:
        (document.getElementById('organismoNombreInput') as HTMLInputElement | null)?.value ?? '',
      pais:
        (document.getElementById('organismoPaisInput') as HTMLInputElement | null)?.value ?? '',
      sitio_web:
        (document.getElementById('organismoSitioWebInput') as HTMLInputElement | null)?.value ?? '',
    };
    state.extraDomain.organismoFormDraft = draft;
    return draft;
  };

  [
    'organismoCodigoInput',
    'organismoNombreInput',
    'organismoPaisInput',
    'organismoSitioWebInput',
  ].forEach((inputId) => {
    document.getElementById(inputId)?.addEventListener('input', () => {
      syncOrganismoDraftFromDom();
    });
  });

  document.getElementById('organismoDetailForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!isApprovedStaff()) return;

    const draft = syncOrganismoDraftFromDom();
    const currentId = state.extraDomain.selectedOrganismoId;
    const isCreate = !currentId && state.extraDomain.isCreatingOrganismo;
    const validation = validateOrganismoDraft(
      draft,
      state.domainData.allOrganismos,
      currentId || undefined
    );

    if (!validation.valid || !validation.normalized) {
      state.extraDomain.organismoEditError =
        validation.error || 'No se pudieron validar los datos del organismo.';
      render();
      return;
    }

    const normOrg = validation.normalized;

    void (async () => {
      if (isCreate) {
        let createdId: string = crypto.randomUUID();
        try {
          const { data, error } = await supabase
            .from('organismo_acreditacion')
            .insert({
              codigo: normOrg.codigo,
              nombre: normOrg.nombre,
              pais: normOrg.pais,
              sitio_web: normOrg.sitio_web,
            })
            .select('id')
            .single();
          if (error) {
            if (!isMissingTableOrSchemaError(error)) {
              state.extraDomain.organismoEditError = translateDatabaseError(error);
              render();
              return;
            }
          } else if (data?.id) {
            createdId = String(data.id);
          }
        } catch {
          // Reactive fallback when Supabase is unreachable
        }

        const newOrg: OrganismoAcreditacion = {
          id: createdId,
          codigo: normOrg.codigo,
          nombre: normOrg.nombre,
          pais: normOrg.pais,
          sitio_web: normOrg.sitio_web ?? undefined,
        };
        state.domainData.allOrganismos = [newOrg, ...state.domainData.allOrganismos];
        state.extraDomain.isCreatingOrganismo = false;
        state.extraDomain.isEditingOrganismo = false;
        state.extraDomain.selectedOrganismoId = createdId;
        state.extraDomain.activeOrganismoTab = 'acreditaciones';
        state.extraDomain.organismoFormDraft = undefined;
        state.extraDomain.organismoEditError = null;
        state.breadcrumbs = pushBreadcrumb(
          resetBreadcrumbToDomain('extra', 'organismos'),
          {
            id: `organismo_acreditacion-${createdId}`,
            label: newOrg.codigo,
            route: 'extra',
            subview: 'organismos',
            entityType: 'organismo_acreditacion',
            entityId: createdId,
            tab: 'acreditaciones',
            tooltip: `Organismo > ${newOrg.codigo} · ${newOrg.nombre}`,
          }
        );
        recordPhase5SessionLog('organismo_acreditacion', createdId, 'INSERT', null, {
          codigo: newOrg.codigo,
          nombre: newOrg.nombre,
          pais: newOrg.pais,
          sitio_web: newOrg.sitio_web ?? null,
        });
        showFloatingToast('Organismo de acreditación creado correctamente.', 'success');
        render();
        return;
      }

      if (!currentId) return;
      const currentOrg = state.domainData.allOrganismos.find((o) => o.id === currentId);
      if (!currentOrg) return;

      if (isValidUuid(currentId)) {
        try {
          const { error } = await supabase
            .from('organismo_acreditacion')
            .update({
              codigo: normOrg.codigo,
              nombre: normOrg.nombre,
              pais: normOrg.pais,
              sitio_web: normOrg.sitio_web,
              updated_at: new Date().toISOString(),
            })
            .eq('id', currentId)
            .is('deleted_at', null);
          if (error && !isMissingTableOrSchemaError(error)) {
            state.extraDomain.organismoEditError = translateDatabaseError(error);
            render();
            return;
          }
        } catch {
          // Reactive fallback
        }
      }

      const oldSnapshot = {
        codigo: currentOrg.codigo,
        nombre: currentOrg.nombre,
        pais: currentOrg.pais,
        sitio_web: currentOrg.sitio_web ?? null,
      };
      state.domainData.allOrganismos = state.domainData.allOrganismos.map((o) =>
        o.id === currentId
          ? {
              ...o,
              codigo: normOrg.codigo,
              nombre: normOrg.nombre,
              pais: normOrg.pais,
              sitio_web: normOrg.sitio_web ?? undefined,
            }
          : o
      );
      state.domainData.allAcreditaciones = state.domainData.allAcreditaciones.map((a) =>
        a.id_organismo === currentId
          ? {
              ...a,
              organismo_codigo: normOrg.codigo,
              organismo_nombre: normOrg.nombre,
              organismo_pais: normOrg.pais,
              organismo_sitio_web: normOrg.sitio_web,
            }
          : a
      );
      state.breadcrumbs = state.breadcrumbs.map((seg) =>
        seg.entityType === 'organismo_acreditacion' && seg.entityId === currentId
          ? {
              ...seg,
              label: normOrg.codigo,
              tooltip: `Organismo > ${normOrg.codigo} · ${normOrg.nombre}`,
            }
          : seg
      );
      state.extraDomain.isEditingOrganismo = false;
      state.extraDomain.organismoFormDraft = undefined;
      state.extraDomain.organismoEditError = null;
      recordPhase5SessionLog('organismo_acreditacion', currentId, 'UPDATE', oldSnapshot, {
        codigo: normOrg.codigo,
        nombre: normOrg.nombre,
        pais: normOrg.pais,
        sitio_web: normOrg.sitio_web ?? null,
      });
      showFloatingToast('Cambios guardados exitosamente.', 'success');
      render();
    })();
  });

  const navigateToAccreditationDetail = (accredId: string): void => {
    if (!accredId) return;
    const acr = state.domainData.allAcreditaciones.find((a) => a.id === accredId && !a.deleted_at);
    clearAllEntitySelections();
    state.activeRoute = 'extra';
    state.activeSubSection = 'accreditations';
    state.extraDomain.selectedAccreditationId = accredId;
    state.extraDomain.activeAccreditationTab = 'certificados';
    state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
      id: `accreditation-${accredId}`,
      label: acr ? `${acr.organismo_codigo} ${acr.numero_acreditacion}` : 'Acreditación',
      route: 'extra',
      subview: 'accreditations',
      entityType: 'accreditation',
      entityId: accredId,
      tab: 'certificados',
      tooltip: acr
        ? `Acreditación > ${acr.organismo_codigo} · ${acr.numero_acreditacion}`
        : 'Acreditación',
    });
    syncUrlHash('extra', 'accreditations');
    render();
  };

  document.querySelectorAll<HTMLElement>('[data-action="select-accreditation"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const accredId = btn.dataset.accreditationId;
      if (accredId) navigateToAccreditationDetail(accredId);
    });
  });

  document.querySelectorAll<HTMLElement>('[data-accreditation-card="true"]').forEach((card) => {
    card.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('button, a, input, select')) return;
      const accredId = card.dataset.accreditationId;
      if (accredId) navigateToAccreditationDetail(accredId);
    });
  });

  document
    .querySelectorAll<HTMLElement>('[data-action="back-to-accreditations-list"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.navBack === 'true') return;
        backtrackToParentBreadcrumb();
        render();
      });
    });

  document.querySelectorAll<HTMLElement>('[data-accred-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.accredTab;
      if (tab === 'sectores' || tab === 'certificados' || tab === 'subsectores') {
        state.extraDomain.activeAccreditationTab = tab;
        syncCurrentBreadcrumbTab(tab);
        render();
      }
    });
  });

  document
    .querySelectorAll<HTMLElement>('[data-action="open-create-acreditacion"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!isApprovedStaff()) return;
        const prefillOrgId = btn.dataset.organismoId || '';
        const prefillNormaId = btn.dataset.normaId || '';
        const comingFromOrganismo = Boolean(
          prefillOrgId && state.extraDomain.selectedOrganismoId === prefillOrgId
        );
        const comingFromNorma = Boolean(
          prefillNormaId && state.extraDomain.selectedNormaId === prefillNormaId
        );
        const baseBreadcrumbs =
          comingFromOrganismo || comingFromNorma
            ? state.breadcrumbs
            : resetBreadcrumbToDomain('extra', 'accreditations');
        clearAllEntitySelections();
        state.activeRoute = 'extra';
        state.activeSubSection = 'accreditations';
        state.extraDomain.isCreatingAccreditation = true;
        state.extraDomain.isEditingAccreditation = false;
        state.extraDomain.accredFormDraft = createEmptyAcreditacionFormDraft({
          ...(prefillOrgId ? { id_organismo: prefillOrgId } : {}),
          ...(prefillNormaId ? { id_norma: prefillNormaId } : {}),
        });
        state.extraDomain.accredEditErrorMessage = null;
        state.breadcrumbs = pushBreadcrumb(
          baseBreadcrumbs,
          createNewEntityBreadcrumbSegment({
            entityType: 'accreditation',
            label: 'Nueva Acreditación',
            route: 'extra',
            subview: 'accreditations',
            parentEntityId: prefillOrgId || prefillNormaId || undefined,
            tooltip: 'Extra > Acreditaciones > Nueva Acreditación',
          })
        );
        syncUrlHash('extra', 'accreditations');
        render();
      });
    });

  document.getElementById('startEditAcreditacionBtn')?.addEventListener('click', () => {
    if (!isApprovedStaff()) return;
    const acr = state.domainData.allAcreditaciones.find(
      (a) => a.id === state.extraDomain.selectedAccreditationId && !a.deleted_at
    );
    if (!acr) return;
    state.extraDomain.isEditingAccreditation = true;
    state.extraDomain.accredEditErrorMessage = null;
    state.extraDomain.accredFormDraft = createAcreditacionDraftFromEntity(acr);
    render();
  });

  document.getElementById('cancelEditAcreditacionBtn')?.addEventListener('click', () => {
    if (state.extraDomain.isCreatingAccreditation) {
      backtrackToParentBreadcrumb();
      render();
      return;
    }
    state.extraDomain.isEditingAccreditation = false;
    state.extraDomain.accredFormDraft = undefined;
    state.extraDomain.accredEditErrorMessage = null;
    render();
  });

  const syncAcreditacionDraftFromDom = (): AcreditacionFormDraft => {
    const selectedSectorIds = Array.from(
      document.querySelectorAll<HTMLInputElement>(
        '#acreditacionDetailForm input[name="sector_ids"]:checked'
      )
    )
      .map((cb) => cb.value)
      .filter((val) => val.trim().length > 0);

    const draft: AcreditacionFormDraft = {
      id_organismo:
        (document.getElementById('accredParentOrganismoSelect') as HTMLSelectElement | null)?.value ||
        '',
      id_norma:
        (document.getElementById('accredParentNormaSelect') as HTMLSelectElement | null)?.value || '',
      id_estatus:
        (document.getElementById('accredParentEstatusSelect') as HTMLSelectElement | null)?.value || '',
      numero_acreditacion:
        (document.getElementById('accredNumeroInput') as HTMLInputElement | null)?.value ?? '',
      fecha_concesion:
        (document.getElementById('accredFechaConcesionInput') as HTMLInputElement | null)?.value ??
        '',
      fecha_vencimiento:
        (document.getElementById('accredFechaVencimientoInput') as HTMLInputElement | null)?.value ??
        '',
      sector_ids: selectedSectorIds,
    };
    state.extraDomain.accredFormDraft = draft;
    return draft;
  };

  [
    'accredParentOrganismoSelect',
    'accredParentNormaSelect',
    'accredParentEstatusSelect',
    'accredNumeroInput',
    'accredFechaConcesionInput',
    'accredFechaVencimientoInput',
  ].forEach((controlId) => {
    const el = document.getElementById(controlId);
    el?.addEventListener(el.tagName === 'SELECT' || (el as HTMLInputElement).type === 'date' ? 'change' : 'input', () => {
      syncAcreditacionDraftFromDom();
    });
  });

  document
    .querySelectorAll<HTMLInputElement>('#acreditacionDetailForm input[name="sector_ids"]')
    .forEach((cb) => {
      cb.addEventListener('change', () => {
        syncAcreditacionDraftFromDom();
        render();
      });
    });

  document.getElementById('acreditacionDetailForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!isApprovedStaff()) return;

    const draft = syncAcreditacionDraftFromDom();
    const currentId = state.extraDomain.selectedAccreditationId;
    const isCreate = !currentId && state.extraDomain.isCreatingAccreditation;
    const normasList = getResolvedNormasCatalog();
    const sectoresList = getResolvedSectoresCatalog();
    const estatusList = getResolvedEstatusCatalog();

    const validation = validateAcreditacionDraft(
      draft,
      state.domainData.allAcreditaciones,
      currentId || undefined
    );

    if (!validation.valid || !validation.normalized) {
      state.extraDomain.accredEditErrorMessage =
        validation.error || 'No se pudieron validar los datos de la acreditación.';
      render();
      return;
    }

    const normData = validation.normalized;
    const resolvedOrg = state.domainData.allOrganismos.find((o) => o.id === normData.id_organismo);
    const resolvedNorma = normasList.find((n) => n.id === normData.id_norma);
    const resolvedEstatus = estatusList.find((est) => est.id === normData.id_estatus);

    if (!resolvedOrg || !resolvedNorma || !resolvedEstatus) {
      state.extraDomain.accredEditErrorMessage =
        'No se pudo resolver el organismo, norma o estatus seleccionado.';
      render();
      return;
    }

    const buildResolvedSectorLinks = (
      sectorIds: ReadonlyArray<string>,
      linkIdBySectorId: Map<string, string>
    ): AcreditacionSectorLink[] => {
      const links: AcreditacionSectorLink[] = [];
      for (const secId of sectorIds) {
        const sec = sectoresList.find((s) => s.id === secId);
        if (!sec) continue;
        links.push({
          id: linkIdBySectorId.get(secId),
          id_sector_iaf: sec.id,
          sector: sec.sector,
          descripcion: sec.descripcion,
        });
      }
      links.sort((a, b) => a.sector - b.sector);
      return links;
    };

    const coverageInputs: CertificateCoverageInput[] = state.domainData.allCertificadosDetailed.map(
      (c) => ({
        id: c.id,
        estatus: c.estatus,
        id_norma: c.id_norma,
        norma_codigo: c.norma_codigo,
        id_sector_iaf: c.id_sector_iaf,
        sector_iaf: c.sector_iaf,
      })
    );

    void (async () => {
      if (isCreate) {
        let createdId: string = crypto.randomUUID();
        const linkIdBySectorId = new Map<string, string>();
        try {
          const { data, error } = await supabase
            .from('acreditacion_norma')
            .insert({
              id_organismo: normData.id_organismo,
              id_norma: normData.id_norma,
              id_estatus: normData.id_estatus,
              numero_acreditacion: normData.numero_acreditacion,
              fecha_concesion: normData.fecha_concesion,
              fecha_vencimiento: normData.fecha_vencimiento,
            })
            .select('id')
            .single();
          if (error) {
            if (!isMissingTableOrSchemaError(error)) {
              state.extraDomain.accredEditErrorMessage = translateDatabaseError(error);
              render();
              return;
            }
          } else if (data?.id) {
            createdId = String(data.id);
          }

          if (isValidUuid(createdId) && normData.sector_ids.length > 0) {
            const linkRowsToInsert = normData.sector_ids
              .filter((sid) => isValidUuid(sid))
              .map((sid) => ({
                id_acreditacion_norma: createdId,
                id_sector_iaf: sid,
              }));
            if (linkRowsToInsert.length > 0) {
              const { data: insertedLinks, error: linkErr } = await supabase
                .from('acreditacion_norma_sector_iaf')
                .insert(linkRowsToInsert)
                .select('id, id_sector_iaf');
              if (linkErr && !isMissingTableOrSchemaError(linkErr)) {
                state.extraDomain.accredEditErrorMessage = translateDatabaseError(linkErr);
                render();
                return;
              }
              if (Array.isArray(insertedLinks)) {
                for (const lr of insertedLinks as Array<Record<string, unknown>>) {
                  if (lr.id && lr.id_sector_iaf) {
                    linkIdBySectorId.set(String(lr.id_sector_iaf), String(lr.id));
                  }
                }
              }
            }
          }
        } catch {
          // Reactive fallback
        }

        const resolvedSectores = buildResolvedSectorLinks(normData.sector_ids, linkIdBySectorId);
        const newAcreditacion: AcreditacionDetailEntity = {
          id: createdId,
          id_organismo: resolvedOrg.id,
          organismo_codigo: resolvedOrg.codigo,
          organismo_nombre: resolvedOrg.nombre,
          organismo_pais: resolvedOrg.pais,
          organismo_sitio_web: resolvedOrg.sitio_web ?? null,
          id_norma: resolvedNorma.id,
          norma_codigo: resolvedNorma.codigo || resolvedNorma.norma,
          norma_titulo: resolvedNorma.titulo,
          id_estatus: resolvedEstatus.id,
          estatus: resolvedEstatus.estatus,
          sectores: resolvedSectores,
          sector_ids: resolvedSectores.map((s) => s.id_sector_iaf),
          numero_acreditacion: normData.numero_acreditacion,
          fecha_concesion: normData.fecha_concesion,
          fecha_vencimiento: normData.fecha_vencimiento,
          activeCertificatesCount: 0,
          deleted_at: null,
        };
        newAcreditacion.activeCertificatesCount = computeActiveCertificatesCountForAccreditation(
          newAcreditacion,
          coverageInputs
        );

        state.domainData.allAcreditaciones = [
          newAcreditacion,
          ...state.domainData.allAcreditaciones,
        ];
        state.extraDomain.isCreatingAccreditation = false;
        state.extraDomain.isEditingAccreditation = false;
        state.extraDomain.selectedAccreditationId = createdId;
        state.extraDomain.activeAccreditationTab = 'sectores';
        state.extraDomain.accredFormDraft = undefined;
        state.extraDomain.accredEditErrorMessage = null;

        const baseTrail = state.breadcrumbs.filter((seg) => seg.id !== 'accreditation-new');
        const resolvedBase =
          baseTrail.length > 0 ? baseTrail : resetBreadcrumbToDomain('extra', 'accreditations');
        state.breadcrumbs = pushBreadcrumb(resolvedBase, {
          id: `accreditation-${createdId}`,
          label: `${newAcreditacion.organismo_codigo} ${newAcreditacion.numero_acreditacion}`,
          route: 'extra',
          subview: 'accreditations',
          entityType: 'accreditation',
          entityId: createdId,
          tab: 'sectores',
          tooltip: `Acreditación > ${newAcreditacion.organismo_codigo} · ${newAcreditacion.numero_acreditacion}`,
        });

        recordPhase5SessionLog('acreditacion_norma', createdId, 'INSERT', null, {
          organismo: newAcreditacion.organismo_codigo,
          norma: newAcreditacion.norma_codigo,
          numero_acreditacion: newAcreditacion.numero_acreditacion,
          estatus: newAcreditacion.estatus,
          sectores: newAcreditacion.sectores.map((s) => s.sector),
        });
        showFloatingToast('Acreditación creada correctamente.', 'success');
        render();
        return;
      }

      if (!currentId) return;
      const current = state.domainData.allAcreditaciones.find(
        (a) => a.id === currentId && !a.deleted_at
      );
      if (!current) return;

      const linkIdBySectorId = new Map<string, string>();
      for (const existingLink of current.sectores) {
        if (existingLink.id) {
          linkIdBySectorId.set(existingLink.id_sector_iaf, existingLink.id);
        }
      }

      if (isValidUuid(currentId)) {
        try {
          const nowIso = new Date().toISOString();
          const { error } = await supabase
            .from('acreditacion_norma')
            .update({
              id_organismo: normData.id_organismo,
              id_norma: normData.id_norma,
              id_estatus: normData.id_estatus,
              numero_acreditacion: normData.numero_acreditacion,
              fecha_concesion: normData.fecha_concesion,
              fecha_vencimiento: normData.fecha_vencimiento,
              updated_at: nowIso,
            })
            .eq('id', currentId)
            .is('deleted_at', null);
          if (error && !isMissingTableOrSchemaError(error)) {
            state.extraDomain.accredEditErrorMessage = translateDatabaseError(error);
            render();
            return;
          }

          // Reconcile child rows in acreditacion_norma_sector_iaf
          const { data: existingDbLinks, error: fetchLinksErr } = await supabase
            .from('acreditacion_norma_sector_iaf')
            .select('id, id_sector_iaf, deleted_at')
            .eq('id_acreditacion_norma', currentId);

          if (!fetchLinksErr && Array.isArray(existingDbLinks)) {
            const desiredSet = new Set(normData.sector_ids);
            const activeBySector = new Map<string, string>();
            const archivedBySector = new Map<string, string>();

            for (const dbRow of existingDbLinks as Array<Record<string, unknown>>) {
              const rowId = String(dbRow.id || '');
              const secId = String(dbRow.id_sector_iaf || '');
              if (!rowId || !secId) continue;
              if (dbRow.deleted_at) {
                archivedBySector.set(secId, rowId);
              } else {
                activeBySector.set(secId, rowId);
                linkIdBySectorId.set(secId, rowId);
              }
            }

            // Soft-delete unselected active sector links
            for (const [secId, rowId] of activeBySector.entries()) {
              if (!desiredSet.has(secId)) {
                await supabase
                  .from('acreditacion_norma_sector_iaf')
                  .update({
                    deleted_at: nowIso,
                    deleted_by: state.user?.id || null,
                    updated_at: nowIso,
                  })
                  .eq('id', rowId);
                linkIdBySectorId.delete(secId);
              }
            }

            // Reactivate archived or insert newly selected sector links
            const toInsert: Array<{ id_acreditacion_norma: string; id_sector_iaf: string }> = [];
            for (const secId of normData.sector_ids) {
              if (!isValidUuid(secId)) continue;
              if (activeBySector.has(secId)) continue;
              const archivedRowId = archivedBySector.get(secId);
              if (archivedRowId) {
                await supabase
                  .from('acreditacion_norma_sector_iaf')
                  .update({
                    deleted_at: null,
                    deleted_by: null,
                    updated_at: nowIso,
                  })
                  .eq('id', archivedRowId);
                linkIdBySectorId.set(secId, archivedRowId);
              } else {
                toInsert.push({ id_acreditacion_norma: currentId, id_sector_iaf: secId });
              }
            }

            if (toInsert.length > 0) {
              const { data: insertedLinks } = await supabase
                .from('acreditacion_norma_sector_iaf')
                .insert(toInsert)
                .select('id, id_sector_iaf');
              if (Array.isArray(insertedLinks)) {
                for (const lr of insertedLinks as Array<Record<string, unknown>>) {
                  if (lr.id && lr.id_sector_iaf) {
                    linkIdBySectorId.set(String(lr.id_sector_iaf), String(lr.id));
                  }
                }
              }
            }
          }
        } catch {
          // Reactive fallback
        }
      }

      const oldSnapshot = {
        id_organismo: current.id_organismo,
        id_norma: current.id_norma,
        id_estatus: current.id_estatus,
        numero_acreditacion: current.numero_acreditacion,
        fecha_concesion: current.fecha_concesion,
        fecha_vencimiento: current.fecha_vencimiento,
        sector_ids: [...current.sector_ids],
      };

      const resolvedSectores = buildResolvedSectorLinks(normData.sector_ids, linkIdBySectorId);

      const nextEntity: AcreditacionDetailEntity = {
        ...current,
        id_organismo: resolvedOrg.id,
        organismo_codigo: resolvedOrg.codigo,
        organismo_nombre: resolvedOrg.nombre,
        organismo_pais: resolvedOrg.pais,
        organismo_sitio_web: resolvedOrg.sitio_web ?? null,
        id_norma: resolvedNorma.id,
        norma_codigo: resolvedNorma.codigo || resolvedNorma.norma,
        norma_titulo: resolvedNorma.titulo,
        id_estatus: resolvedEstatus.id,
        estatus: resolvedEstatus.estatus,
        sectores: resolvedSectores,
        sector_ids: resolvedSectores.map((s) => s.id_sector_iaf),
        numero_acreditacion: normData.numero_acreditacion,
        fecha_concesion: normData.fecha_concesion,
        fecha_vencimiento: normData.fecha_vencimiento,
      };
      nextEntity.activeCertificatesCount = computeActiveCertificatesCountForAccreditation(
        nextEntity,
        coverageInputs
      );

      state.domainData.allAcreditaciones = state.domainData.allAcreditaciones.map((a) =>
        a.id === currentId ? nextEntity : a
      );

      state.breadcrumbs = state.breadcrumbs.map((seg) =>
        seg.entityType === 'accreditation' && seg.entityId === currentId
          ? {
              ...seg,
              label: `${nextEntity.organismo_codigo} ${nextEntity.numero_acreditacion}`,
              tooltip: `Acreditación > ${nextEntity.organismo_codigo} · ${nextEntity.numero_acreditacion}`,
            }
          : seg
      );

      recordPhase5SessionLog('acreditacion_norma', currentId, 'UPDATE', oldSnapshot, {
        id_organismo: nextEntity.id_organismo,
        id_norma: nextEntity.id_norma,
        id_estatus: nextEntity.id_estatus,
        numero_acreditacion: nextEntity.numero_acreditacion,
        fecha_concesion: nextEntity.fecha_concesion,
        fecha_vencimiento: nextEntity.fecha_vencimiento,
        sector_ids: [...nextEntity.sector_ids],
      });

      state.extraDomain.isEditingAccreditation = false;
      state.extraDomain.accredFormDraft = undefined;
      state.extraDomain.accredEditErrorMessage = null;
      showFloatingToast('Cambios guardados exitosamente.', 'success');
      render();
    })();
  });

  // Child tab: Link Sector IAF to Accreditation (acreditacion_norma_sector_iaf)
  document.getElementById('linkAccredSectorForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!isApprovedStaff()) return;
    const form = e.currentTarget as HTMLFormElement;
    const accredId =
      form.dataset.accreditationId || state.extraDomain.selectedAccreditationId || '';
    const selectEl = document.getElementById('accredAddSectorSelect') as HTMLSelectElement | null;
    const sectorId = (selectEl?.value || '').trim();
    if (!accredId || !sectorId) return;

    const currentAcr = state.domainData.allAcreditaciones.find(
      (a) => a.id === accredId && !a.deleted_at
    );
    const sec = getResolvedSectoresCatalog().find((s) => s.id === sectorId && !s.deleted_at);
    if (!currentAcr || !sec) return;
    if (currentAcr.sectores.some((s) => s.id_sector_iaf === sectorId)) return;

    void (async () => {
      let linkRowId: string | undefined;
      if (isValidUuid(accredId) && isValidUuid(sectorId)) {
        try {
          const nowIso = new Date().toISOString();
          const { data: existingArchived } = await supabase
            .from('acreditacion_norma_sector_iaf')
            .select('id, deleted_at')
            .eq('id_acreditacion_norma', accredId)
            .eq('id_sector_iaf', sectorId)
            .maybeSingle();

          if (existingArchived?.id) {
            const { error: reactivateErr } = await supabase
              .from('acreditacion_norma_sector_iaf')
              .update({ deleted_at: null, deleted_by: null, updated_at: nowIso })
              .eq('id', existingArchived.id);
            if (reactivateErr && !isMissingTableOrSchemaError(reactivateErr)) {
              showFloatingToast(translateDatabaseError(reactivateErr), 'warning');
              return;
            }
            linkRowId = String(existingArchived.id);
          } else {
            const { data: inserted, error: insertErr } = await supabase
              .from('acreditacion_norma_sector_iaf')
              .insert({ id_acreditacion_norma: accredId, id_sector_iaf: sectorId })
              .select('id')
              .single();
            if (insertErr && !isMissingTableOrSchemaError(insertErr)) {
              showFloatingToast(translateDatabaseError(insertErr), 'warning');
              return;
            }
            if (inserted?.id) {
              linkRowId = String(inserted.id);
            }
          }
        } catch {
          // Reactive fallback
        }
      }

      const nextSectores: AcreditacionSectorLink[] = [
        ...currentAcr.sectores,
        {
          id: linkRowId,
          id_sector_iaf: sec.id,
          sector: sec.sector,
          descripcion: sec.descripcion,
        },
      ].sort((a, b) => a.sector - b.sector);

      const coverageInputs: CertificateCoverageInput[] = state.domainData.allCertificadosDetailed.map(
        (c) => ({
          id: c.id,
          estatus: c.estatus,
          id_norma: c.id_norma,
          norma_codigo: c.norma_codigo,
          id_sector_iaf: c.id_sector_iaf,
          sector_iaf: c.sector_iaf,
        })
      );

      state.domainData.allAcreditaciones = state.domainData.allAcreditaciones.map((a) => {
        if (a.id !== accredId) return a;
        const updated: AcreditacionDetailEntity = {
          ...a,
          sectores: nextSectores,
          sector_ids: nextSectores.map((s) => s.id_sector_iaf),
        };
        updated.activeCertificatesCount = computeActiveCertificatesCountForAccreditation(
          updated,
          coverageInputs
        );
        return updated;
      });

      recordPhase5SessionLog('acreditacion_norma_sector_iaf', linkRowId || accredId, 'INSERT', null, {
        id_acreditacion_norma: accredId,
        id_sector_iaf: sec.id,
        sector: sec.sector,
      });
      showFloatingToast(`Sector IAF ${sec.sector} vinculado al alcance.`, 'success');
      render();
    })();
  });

  // Child tab: Unlink Sector IAF from Accreditation (soft-delete acreditacion_norma_sector_iaf)
  document
    .querySelectorAll<HTMLElement>('[data-action="unlink-accred-sector"]')
    .forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!isApprovedStaff()) return;
        const accredId = btn.dataset.accreditationId || '';
        const sectorId = btn.dataset.sectorId || '';
        if (!accredId || !sectorId) return;

        const currentAcr = state.domainData.allAcreditaciones.find(
          (a) => a.id === accredId && !a.deleted_at
        );
        if (!currentAcr) return;
        const targetLink = currentAcr.sectores.find((s) => s.id_sector_iaf === sectorId);
        if (!targetLink) return;

        void (async () => {
          const nowIso = new Date().toISOString();
          if (isValidUuid(accredId) && isValidUuid(sectorId)) {
            try {
              const { error } = await supabase
                .from('acreditacion_norma_sector_iaf')
                .update({
                  deleted_at: nowIso,
                  deleted_by: state.user?.id || null,
                  updated_at: nowIso,
                })
                .eq('id_acreditacion_norma', accredId)
                .eq('id_sector_iaf', sectorId)
                .is('deleted_at', null);
              if (error && !isMissingTableOrSchemaError(error)) {
                showFloatingToast(translateDatabaseError(error), 'warning');
                return;
              }
            } catch {
              // Reactive fallback
            }
          }

          const nextSectores = currentAcr.sectores.filter((s) => s.id_sector_iaf !== sectorId);
          const coverageInputs: CertificateCoverageInput[] =
            state.domainData.allCertificadosDetailed.map((c) => ({
              id: c.id,
              estatus: c.estatus,
              id_norma: c.id_norma,
              norma_codigo: c.norma_codigo,
              id_sector_iaf: c.id_sector_iaf,
              sector_iaf: c.sector_iaf,
            }));

          state.domainData.allAcreditaciones = state.domainData.allAcreditaciones.map((a) => {
            if (a.id !== accredId) return a;
            const updated: AcreditacionDetailEntity = {
              ...a,
              sectores: nextSectores,
              sector_ids: nextSectores.map((s) => s.id_sector_iaf),
            };
            updated.activeCertificatesCount = computeActiveCertificatesCountForAccreditation(
              updated,
              coverageInputs
            );
            return updated;
          });

          recordPhase5SessionLog(
            'acreditacion_norma_sector_iaf',
            targetLink.id || accredId,
            'UPDATE',
            { id_acreditacion_norma: accredId, id_sector_iaf: sectorId, deleted_at: null },
            { deleted_at: nowIso }
          );
          showFloatingToast(`Sector IAF ${targetLink.sector} desvinculado del alcance.`, 'success');
          render();
        })();
      });
    });
  // ===============================================
  // DOMAIN CERTIFICACIÓN (Step 3.1: Organización & Client Access)
  // ===============================================

  // 1. Select organization -> Detail view & push breadcrumb
  document.querySelectorAll<HTMLElement>('[data-action="select-org"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const orgId = btn.dataset.orgId;
      if (!orgId) return;
      clearAllEntitySelections();
      state.activeRoute = 'certificacion';
      state.activeSubSection = 'organizations';
      state.organizacionDomain.selectedOrganizacionId = orgId;
      state.organizacionDomain.activeChildTab = 'certificados';

      const org =
        state.domainData.allOrganizaciones.find((o) => o.id === orgId) ||
        INITIAL_ORGANIZACIONES.find((o) => o.id === orgId);

      state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
        id: `org-${orgId}`,
        label: org?.nombre || 'Organización',
        route: 'certificacion',
        subview: 'organizations',
        entityType: 'org',
        entityId: orgId,
        tab: 'certificados',
        tooltip: `Organización > ${org?.nombre || orgId}`,
      });
      syncUrlHash('certificacion', 'organizations');
      render();
    });
  });

  // 2. Back to parent breadcrumb (organizations list or originating parent)
  document.querySelectorAll<HTMLElement>('[data-action="back-to-org-list"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.navBack === 'true') return;
      backtrackToParentBreadcrumb();
      render();
    });
  });

  document
    .querySelectorAll<HTMLElement>('[data-action="back-to-client-access-parent"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.navBack === 'true') return;
        backtrackToParentBreadcrumb();
        render();
      });
    });

  // 2b. Organización child tab switching (Certificados | Auditorías | Accesos Clientes)
  document.querySelectorAll<HTMLElement>('[data-org-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.orgTab;
      if (
        tab === 'certificados' ||
        tab === 'auditorias' ||
        (tab === 'accesos' && isApprovedStaff())
      ) {
        state.organizacionDomain.activeChildTab = tab;
        syncCurrentBreadcrumbTab(tab);
        render();
      }
    });
  });

  // 3. Direct Navigation to Add Mode: Nueva Organización
  document.querySelectorAll<HTMLElement>('[data-action="open-create-org"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!isApprovedStaff()) return;
      clearAllEntitySelections();
      state.activeRoute = 'certificacion';
      state.activeSubSection = 'organizations';
      state.organizacionDomain.isCreating = true;
      state.organizacionDomain.formDraft = createEmptyOrganizacionFormDraft();
      state.organizacionDomain.editErrorMessage = null;
      state.breadcrumbs = pushBreadcrumb(
        resetBreadcrumbToDomain('certificacion', 'organizations'),
        createNewEntityBreadcrumbSegment({
          entityType: 'org',
          label: 'Nueva Organización',
          route: 'certificacion',
          subview: 'organizations',
          tooltip: 'Certificación > Nueva Organización',
        })
      );
      syncUrlHash('certificacion', 'organizations');
      render();
    });
  });

  // 4. Direct Navigation to Add Mode: Nuevo Certificado desde Organización
  document
    .querySelectorAll<HTMLElement>('[data-action="open-create-cert-from-org"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!isApprovedStaff()) return;
        const orgId = btn.dataset.orgId || state.organizacionDomain.selectedOrganizacionId || '';
        clearAllEntitySelections();
        state.activeRoute = 'certificacion';
        state.activeSubSection = 'certificates';
        state.certificadoDomain.selectedCertId = null;
        state.certificadoDomain.isCreating = true;
        state.certificadoDomain.isEditingAttributes = false;
        state.certificadoDomain.originatingOrganizacionId = orgId || null;
        state.certificadoDomain.formDraft = {
          ...createEmptyCertificadoFormDraft(),
          id_organizacion: orgId,
        };
        state.certificadoDomain.createErrorMessage = null;
        state.certificadoDomain.editErrorMessage = null;
        state.breadcrumbs = pushBreadcrumb(
          state.breadcrumbs,
          createNewEntityBreadcrumbSegment({
            entityType: 'cert',
            label: 'Nuevo Certificado',
            route: 'certificacion',
            subview: 'certificates',
            parentEntityId: orgId || undefined,
            tooltip: 'Organización > Nuevo Certificado',
          })
        );
        syncUrlHash('certificacion', 'certificates');
        render();
      });
    });

  // 5. Edit mode toggling for Organización Detail View
  document.getElementById('startEditOrgBtn')?.addEventListener('click', () => {
    if (!isApprovedStaff()) return;
    const orgId = state.organizacionDomain.selectedOrganizacionId;
    const org = orgId
      ? state.domainData.allOrganizaciones.find((o) => o.id === orgId)
      : undefined;
    if (!org) return;
    state.organizacionDomain.isEditingAttributes = true;
    state.organizacionDomain.formDraft = createOrganizacionDraftFromEntity(org);
    state.organizacionDomain.editErrorMessage = null;
    render();
  });

  document.getElementById('cancelEditOrgBtn')?.addEventListener('click', () => {
    if (state.organizacionDomain.isCreating && !state.organizacionDomain.selectedOrganizacionId) {
      backtrackToParentBreadcrumb();
      render();
      return;
    }
    state.organizacionDomain.isEditingAttributes = false;
    state.organizacionDomain.formDraft = undefined;
    state.organizacionDomain.editErrorMessage = null;
    render();
  });

  const syncOrganizacionDraftFromDom = (): OrganizacionFormDraft => {
    const nombre =
      (document.getElementById('orgNombreInput') as HTMLInputElement | null)?.value ?? '';
    const rif = (document.getElementById('orgRifInput') as HTMLInputElement | null)?.value ?? '';
    const direccion_fiscal =
      (document.getElementById('orgDireccionInput') as HTMLTextAreaElement | null)?.value ?? '';
    const next: OrganizacionFormDraft = { nombre, rif, direccion_fiscal };
    state.organizacionDomain.formDraft = next;
    return next;
  };

  ['orgNombreInput', 'orgRifInput', 'orgDireccionInput'].forEach((inputId) => {
    document.getElementById(inputId)?.addEventListener('input', () => {
      syncOrganizacionDraftFromDom();
    });
  });

  // 6. Save Organización Detail Form ('add' or 'edit')
  document.getElementById('organizacionDetailForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!isApprovedStaff()) return;

    const draft = syncOrganizacionDraftFromDom();
    const isCreateMode =
      Boolean(state.organizacionDomain.isCreating) &&
      !state.organizacionDomain.selectedOrganizacionId;
    const orgId = state.organizacionDomain.selectedOrganizacionId;

    const validation = validateOrganizacionDraft(
      draft,
      state.domainData.allOrganizaciones,
      isCreateMode ? undefined : orgId || undefined
    );
    if (!validation.valid) {
      state.organizacionDomain.editErrorMessage =
        validation.message || 'Verifique los datos de la organización.';
      render();
      return;
    }

    const norm = validation.normalized;

    if (isCreateMode) {
      const newId = crypto.randomUUID();
      const newOrg: OrganizacionEntity = {
        id: newId,
        nombre: norm.nombre,
        rif: norm.rif || 'RIF No Registrado',
        direccion_fiscal: norm.direccion_fiscal,
        certificados_count: 0,
      };

      state.domainData.allOrganizaciones = [newOrg, ...state.domainData.allOrganizaciones];
      state.domainData.organizations = [
        {
          id: newId,
          nombre: newOrg.nombre,
          rif: newOrg.rif,
          direccion_fiscal: newOrg.direccion_fiscal,
          certificados_count: 0,
        },
        ...state.domainData.organizations,
      ];

      state.organizacionDomain.selectedOrganizacionId = newId;
      state.organizacionDomain.isCreating = false;
      state.organizacionDomain.isEditingAttributes = false;
      state.organizacionDomain.formDraft = undefined;
      state.organizacionDomain.editErrorMessage = null;
      state.organizacionDomain.activeChildTab = 'certificados';

      const newOrgSeg: BreadcrumbSegment = {
        id: `org-${newId}`,
        label: newOrg.nombre,
        route: 'certificacion',
        subview: 'organizations',
        entityType: 'org',
        entityId: newId,
        tab: 'certificados',
        tooltip: `Organización > ${newOrg.nombre}`,
      };
      if (state.breadcrumbs[state.breadcrumbs.length - 1]?.id === 'org-new') {
        state.breadcrumbs = [...state.breadcrumbs.slice(0, -1), newOrgSeg];
      } else {
        state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, newOrgSeg);
      }

      recordPhase5SessionLog('organizacion', newId, 'INSERT', null, {
        nombre: norm.nombre,
        rif: norm.rif || null,
        direccion_fiscal: norm.direccion_fiscal || null,
      });

      void (async () => {
        try {
          await supabase.from('organizacion').insert({
            id: newId,
            nombre: norm.nombre,
            rif: norm.rif || null,
            direccion_fiscal: norm.direccion_fiscal || null,
          });
        } catch (err) {
          console.warn('Fallback to reactive state for organizacion insert:', err);
        }
      })();

      showFloatingToast(`Organización "${norm.nombre}" creada correctamente.`, 'success');
      render();
      return;
    }

    if (!orgId) return;
    const prevOrg = state.domainData.allOrganizaciones.find((o) => o.id === orgId);

    state.domainData.allOrganizaciones = state.domainData.allOrganizaciones.map((o) =>
      o.id === orgId
        ? {
            ...o,
            nombre: norm.nombre,
            rif: norm.rif || 'RIF No Registrado',
            direccion_fiscal: norm.direccion_fiscal,
          }
        : o
    );
    state.domainData.organizations = state.domainData.organizations.map((o) =>
      o.id === orgId
        ? {
            ...o,
            nombre: norm.nombre,
            rif: norm.rif || 'RIF No Registrado',
            direccion_fiscal: norm.direccion_fiscal,
          }
        : o
    );

    if (prevOrg && prevOrg.nombre !== norm.nombre) {
      state.breadcrumbs = state.breadcrumbs.map((seg) =>
        seg.entityType === 'org' && seg.entityId === orgId
          ? { ...seg, label: norm.nombre, tooltip: `Organización > ${norm.nombre}` }
          : seg
      );
    }

    state.organizacionDomain.isEditingAttributes = false;
    state.organizacionDomain.formDraft = undefined;
    state.organizacionDomain.editErrorMessage = null;

    recordPhase5SessionLog(
      'organizacion',
      orgId,
      'UPDATE',
      prevOrg
        ? {
            nombre: prevOrg.nombre,
            rif: prevOrg.rif,
            direccion_fiscal: prevOrg.direccion_fiscal || null,
          }
        : null,
      {
        nombre: norm.nombre,
        rif: norm.rif || null,
        direccion_fiscal: norm.direccion_fiscal || null,
      }
    );

    void (async () => {
      try {
        await supabase
          .from('organizacion')
          .update({
            nombre: norm.nombre,
            rif: norm.rif || null,
            direccion_fiscal: norm.direccion_fiscal || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', orgId);
      } catch (err) {
        console.warn('Fallback to reactive state for organization update:', err);
      }
    })();

    showFloatingToast('Atributos de la organización guardados exitosamente.', 'success');
    render();
  });

  // 7. Click child certificate in Organización Detail -> drill down to certificate
  document.querySelectorAll<HTMLElement>('[data-action="drilldown-to-cert"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const certId = btn.dataset.certId;
      const certCode = btn.dataset.certCode;
      if (certId && certCode) {
        const originOrgId = state.organizacionDomain.selectedOrganizacionId;
        clearAllEntitySelections();
        state.activeRoute = 'certificacion';
        state.activeSubSection = 'certificates';
        state.certificadoDomain.selectedCertId = certId;
        state.certificadoDomain.activeChildTab = 'sitios';
        state.certificadoDomain.originatingOrganizacionId = originOrgId;
        state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
          id: `cert-${certId}`,
          label: certCode,
          route: 'certificacion',
          subview: 'certificates',
          entityType: 'cert',
          entityId: certId,
          tab: 'sitios',
          tooltip: `Certificado > ${certCode}`,
        });
        syncUrlHash('certificacion', 'certificates');
        render();
      }
    });
  });

  // ===============================================
  // DOMAIN CERTIFICACIÓN (Step 3.1: Client Organization Access)
  // ===============================================

  document
    .querySelectorAll<HTMLElement>('[data-action="open-create-client-access"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!isApprovedStaff()) return;
        const orgId = btn.dataset.orgId || state.organizacionDomain.selectedOrganizacionId || '';
        clearAllEntitySelections();
        state.activeRoute = 'certificacion';
        state.activeSubSection = 'organizations';
        state.clientAccessDomain.isCreating = true;
        state.clientAccessDomain.prefillOrganizacionId = orgId || null;
        state.clientAccessDomain.formDraft = createEmptyClientAccessFormDraft(orgId);
        state.clientAccessDomain.editErrorMessage = null;
        state.breadcrumbs = pushBreadcrumb(
          state.breadcrumbs,
          createNewEntityBreadcrumbSegment({
            entityType: 'acceso_cliente',
            label: 'Otorgar Acceso Cliente',
            route: 'certificacion',
            subview: 'organizations',
            parentEntityId: orgId || undefined,
            tooltip: 'Organización > Otorgar Acceso Cliente',
          })
        );
        syncUrlHash('certificacion', 'organizations');
        render();
      });
    });

  document.querySelectorAll<HTMLElement>('[data-action="select-client-access"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!isApprovedStaff()) return;
      const accessId = btn.dataset.accessId;
      if (!accessId) return;
      const row = state.domainData.allClientAccesses.find((a) => a.id === accessId);
      const matchedUser = row
        ? state.approvals.profiles.find((p) => p.id === row.id_usuario)
        : undefined;
      const userName = matchedUser?.nombre || row?.usuario_nombre || 'Acceso de Cliente';

      clearAllEntitySelections();
      state.activeRoute = 'certificacion';
      state.activeSubSection = 'organizations';
      state.clientAccessDomain.selectedAccessId = accessId;
      state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
        id: `acceso_cliente-${accessId}`,
        label: userName,
        route: 'certificacion',
        subview: 'organizations',
        entityType: 'acceso_cliente',
        entityId: accessId,
        tooltip: `Organización > Acceso de Cliente: ${userName}`,
      });
      syncUrlHash('certificacion', 'organizations');
      render();
    });
  });

  document.getElementById('startEditClientAccessBtn')?.addEventListener('click', () => {
    if (!isApprovedStaff()) return;
    const accessId = state.clientAccessDomain.selectedAccessId;
    const row = accessId
      ? state.domainData.allClientAccesses.find((a) => a.id === accessId)
      : undefined;
    if (!row) return;
    state.clientAccessDomain.isEditingAttributes = true;
    state.clientAccessDomain.formDraft = createClientAccessDraftFromEntity(row);
    state.clientAccessDomain.editErrorMessage = null;
    render();
  });

  document.getElementById('cancelClientAccessBtn')?.addEventListener('click', () => {
    if (state.clientAccessDomain.isCreating && !state.clientAccessDomain.selectedAccessId) {
      backtrackToParentBreadcrumb();
      render();
      return;
    }
    state.clientAccessDomain.isEditingAttributes = false;
    state.clientAccessDomain.formDraft = undefined;
    state.clientAccessDomain.editErrorMessage = null;
    render();
  });

  const syncClientAccessDraftFromDom = (): ClientAccessFormDraft => {
    const id_organizacion =
      (document.getElementById('clientAccessOrgSelect') as HTMLSelectElement | null)?.value ?? '';
    const id_usuario =
      (document.getElementById('clientAccessUserSelect') as HTMLSelectElement | null)?.value ?? '';
    const rawEstado =
      (document.getElementById('clientAccessEstadoSelect') as HTMLSelectElement | null)?.value ??
      'APPROVED';
    const estado: ClientAccessEstado =
      rawEstado === 'PENDING' || rawEstado === 'REJECTED' ? rawEstado : 'APPROVED';
    const motivo_rechazo =
      (document.getElementById('clientAccessMotivoInput') as HTMLTextAreaElement | null)?.value ??
      '';
    const next: ClientAccessFormDraft = {
      id_organizacion,
      id_usuario,
      estado,
      motivo_rechazo,
    };
    state.clientAccessDomain.formDraft = next;
    return next;
  };

  document.getElementById('clientAccessOrgSelect')?.addEventListener('change', () => {
    syncClientAccessDraftFromDom();
  });

  document.getElementById('clientAccessUserSelect')?.addEventListener('change', () => {
    syncClientAccessDraftFromDom();
  });

  document.getElementById('clientAccessEstadoSelect')?.addEventListener('change', () => {
    syncClientAccessDraftFromDom();
    render();
  });

  document.getElementById('clientAccessMotivoInput')?.addEventListener('input', () => {
    const draft = syncClientAccessDraftFromDom();
    const countEl = document.getElementById('clientAccessMotivoCount');
    if (countEl) {
      countEl.textContent = String(draft.motivo_rechazo.length);
    }
  });

  document.getElementById('clientAccessDetailForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!isApprovedStaff() || !state.profile) return;

    const draft = syncClientAccessDraftFromDom();
    const isCreateMode =
      Boolean(state.clientAccessDomain.isCreating) && !state.clientAccessDomain.selectedAccessId;
    const accessId = state.clientAccessDomain.selectedAccessId;

    const validation = validateClientAccessDraft(
      draft,
      state.domainData.allClientAccesses,
      isCreateMode ? undefined : accessId || undefined
    );

    if (!validation.valid) {
      state.clientAccessDomain.editErrorMessage =
        validation.message || 'Verifique los datos de la concesión de acceso.';
      render();
      return;
    }

    const norm = validation.normalized;
    const matchedOrg = state.domainData.allOrganizaciones.find(
      (o) => o.id === norm.id_organizacion
    );
    const matchedUser = state.approvals.profiles.find((p) => p.id === norm.id_usuario);
    const nowIso = new Date().toISOString();
    const isReviewed = norm.estado === 'APPROVED' || norm.estado === 'REJECTED';
    const approverId = isReviewed ? state.profile.id : null;
    const approverName = isReviewed ? state.profile.nombre : null;
    const responseDate = isReviewed ? nowIso : null;

    if (isCreateMode) {
      const newId = crypto.randomUUID();
      const newRow: ClientOrganizationAccessEntity = {
        id: newId,
        id_usuario: norm.id_usuario,
        usuario_nombre: matchedUser?.nombre || 'Usuario Cliente',
        usuario_role: matchedUser?.role || 'CLIENT',
        id_organizacion: norm.id_organizacion,
        organizacion_nombre: matchedOrg?.nombre || 'Organización Cliente',
        organizacion_rif: matchedOrg?.rif,
        estado: norm.estado,
        aprobado_por: approverId,
        aprobado_por_nombre: approverName,
        fecha_solicitud: nowIso,
        fecha_respuesta: responseDate,
        motivo_rechazo: norm.motivo_rechazo,
        deleted_at: null,
      };

      state.domainData.allClientAccesses = [newRow, ...state.domainData.allClientAccesses];
      state.clientAccessDomain.selectedAccessId = newId;
      state.clientAccessDomain.isCreating = false;
      state.clientAccessDomain.isEditingAttributes = false;
      state.clientAccessDomain.formDraft = undefined;
      state.clientAccessDomain.editErrorMessage = null;

      const accessSeg: BreadcrumbSegment = {
        id: `acceso_cliente-${newId}`,
        label: newRow.usuario_nombre || 'Acceso de Cliente',
        route: 'certificacion',
        subview: 'organizations',
        entityType: 'acceso_cliente',
        entityId: newId,
        tooltip: `Organización > Acceso de Cliente: ${newRow.usuario_nombre || 'Usuario Cliente'}`,
      };
      if (state.breadcrumbs[state.breadcrumbs.length - 1]?.id === 'acceso_cliente-new') {
        state.breadcrumbs = [...state.breadcrumbs.slice(0, -1), accessSeg];
      } else {
        state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, accessSeg);
      }

      recordPhase5SessionLog('client_organization_access', newId, 'INSERT', null, {
        id_organizacion: newRow.id_organizacion,
        id_usuario: newRow.id_usuario,
        estado: newRow.estado,
        motivo_rechazo: newRow.motivo_rechazo,
      });

      if (
        STRICT_UUID_PATTERN.test(newRow.id_organizacion) &&
        STRICT_UUID_PATTERN.test(newRow.id_usuario)
      ) {
        void (async () => {
          try {
            await supabase.from('client_organization_access').insert({
              id: newId,
              id_usuario: newRow.id_usuario,
              id_organizacion: newRow.id_organizacion,
              estado: newRow.estado,
              aprobado_por: approverId,
              fecha_solicitud: nowIso,
              fecha_respuesta: responseDate,
              motivo_rechazo: newRow.motivo_rechazo,
            });
          } catch (err) {
            console.warn('Fallback to reactive state for client_organization_access insert:', err);
          }
        })();
      }

      showFloatingToast(
        `Acceso cliente para "${newRow.usuario_nombre}" registrado correctamente.`,
        'success'
      );
      render();
      return;
    }

    if (!accessId) return;
    const prevRow = state.domainData.allClientAccesses.find((a) => a.id === accessId);
    const updatedUserName = matchedUser?.nombre || prevRow?.usuario_nombre || 'Usuario Cliente';

    state.domainData.allClientAccesses = state.domainData.allClientAccesses.map((a) =>
      a.id === accessId
        ? {
            ...a,
            id_organizacion: norm.id_organizacion,
            organizacion_nombre: matchedOrg?.nombre || a.organizacion_nombre,
            organizacion_rif: matchedOrg?.rif || a.organizacion_rif,
            id_usuario: norm.id_usuario,
            usuario_nombre: updatedUserName,
            usuario_role: matchedUser?.role || a.usuario_role,
            estado: norm.estado,
            aprobado_por: approverId,
            aprobado_por_nombre: approverName,
            fecha_respuesta: responseDate,
            motivo_rechazo: norm.motivo_rechazo,
          }
        : a
    );

    state.breadcrumbs = state.breadcrumbs.map((seg) =>
      seg.entityType === 'acceso_cliente' && seg.entityId === accessId
        ? {
            ...seg,
            label: updatedUserName,
            tooltip: `Organización > Acceso de Cliente: ${updatedUserName}`,
          }
        : seg
    );

    state.clientAccessDomain.isEditingAttributes = false;
    state.clientAccessDomain.formDraft = undefined;
    state.clientAccessDomain.editErrorMessage = null;

    recordPhase5SessionLog(
      'client_organization_access',
      accessId,
      'UPDATE',
      prevRow
        ? {
            id_organizacion: prevRow.id_organizacion,
            id_usuario: prevRow.id_usuario,
            estado: prevRow.estado,
            motivo_rechazo: prevRow.motivo_rechazo ?? null,
          }
        : null,
      {
        id_organizacion: norm.id_organizacion,
        id_usuario: norm.id_usuario,
        estado: norm.estado,
        motivo_rechazo: norm.motivo_rechazo,
      }
    );

    if (
      STRICT_UUID_PATTERN.test(norm.id_organizacion) &&
      STRICT_UUID_PATTERN.test(norm.id_usuario)
    ) {
      void (async () => {
        try {
          await supabase
            .from('client_organization_access')
            .update({
              id_usuario: norm.id_usuario,
              id_organizacion: norm.id_organizacion,
              estado: norm.estado,
              aprobado_por: approverId,
              fecha_respuesta: responseDate,
              motivo_rechazo: norm.motivo_rechazo,
            })
            .eq('id', accessId);
        } catch (err) {
          console.warn('Fallback to reactive state for client_organization_access update:', err);
        }
      })();
    }

    showFloatingToast('Acceso de cliente actualizado correctamente.', 'success');
    render();
  });

  // ===============================================
  // DOMAIN CERTIFICACIÓN (Phase 4.2: Certificado)
  // ===============================================

  // 1. Select certificate -> 4-Zone Detail View & push breadcrumb
  document.querySelectorAll<HTMLElement>('[data-action="select-cert"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const certId = btn.dataset.certId;
      if (!certId) return;
      clearAllEntitySelections();
      state.activeRoute = 'certificacion';
      state.activeSubSection = 'certificates';
      state.certificadoDomain.selectedCertId = certId;
      state.certificadoDomain.activeChildTab = 'sitios';
      state.certificadoDomain.isEditingAttributes = false;
      state.certificadoDomain.editErrorMessage = null;

      const cert =
        state.domainData.allCertificadosDetailed.find((c) => c.id === certId) ||
        INITIAL_CERTIFICADOS_DETAILED.find((c) => c.id === certId);

      state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
        id: `cert-${certId}`,
        label: cert?.numero_certificado || 'Certificado',
        route: 'certificacion',
        subview: 'certificates',
        entityType: 'cert',
        entityId: certId,
        tab: 'sitios',
        tooltip: `Certificado > ${cert?.numero_certificado || certId}`,
      });
      syncUrlHash('certificacion', 'certificates');
      render();
    });
  });

  // 2. Back to parent breadcrumb (certificates list or originating parent)
  document.querySelectorAll<HTMLElement>('[data-action="back-to-cert-list"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.navBack === 'true') return;
      backtrackToParentBreadcrumb();
      render();
    });
  });

  // 3. Direct Navigation to Add Mode: Nuevo Certificado
  document.querySelectorAll<HTMLElement>('[data-action="open-create-cert"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!isApprovedStaff()) return;
      clearAllEntitySelections();
      state.activeRoute = 'certificacion';
      state.activeSubSection = 'certificates';
      state.certificadoDomain.selectedCertId = null;
      state.certificadoDomain.isCreating = true;
      state.certificadoDomain.isEditingAttributes = false;
      state.certificadoDomain.formDraft = createEmptyCertificadoFormDraft();
      state.certificadoDomain.createErrorMessage = null;
      state.certificadoDomain.editErrorMessage = null;
      state.breadcrumbs = pushBreadcrumb(
        resetBreadcrumbToDomain('certificacion', 'certificates'),
        createNewCertificadoBreadcrumbSegment()
      );
      syncUrlHash('certificacion', 'certificates');
      render();
    });
  });

  // 9. Child tab switching (7 specialized child modules) & child table sorting
  document.querySelectorAll<HTMLElement>('[data-cert-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.certTab as CertificadoChildTab | undefined;
      if (
        tab === 'sitios' ||
        tab === 'procesos' ||
        tab === 'turnos' ||
        tab === 'no_aplicables' ||
        tab === 'auditorias' ||
        tab === 'fechas' ||
        tab === 'contactos'
      ) {
        state.certificadoDomain.activeChildTab = tab;
        syncCurrentBreadcrumbTab(tab);
        render();
      }
    });
  });

  // 9b. Contextual Fecha & Contacto Detail Navigation
  const navigateToFechaDetail = (fechaId: string): void => {
    const resolvedFecha = resolveFechaDetailById({
      fechaId,
      certificates: state.domainData.allCertificadosDetailed,
      archivedFechaIds: state.domainData.archivedFechaIds,
    });
    if (!resolvedFecha) return;

    clearAllEntitySelections();
    state.activeRoute = 'certificacion';
    state.activeSubSection = 'certificates';
    state.fechaDomain.selectedFechaId = fechaId;
    state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
      id: `fecha-${fechaId}`,
      label: `Fecha: ${resolvedFecha.tipo_fecha} · ${resolvedFecha.fecha}`,
      route: 'certificacion',
      subview: 'certificates',
      entityType: 'fecha_certificado',
      entityId: fechaId,
      tooltip: `Certificado ${resolvedFecha.numero_certificado} > Fecha: ${resolvedFecha.tipo_fecha} · ${resolvedFecha.fecha}`,
    });
    syncUrlHash('certificacion', 'certificates');
    render();
  };

  document.querySelectorAll<HTMLElement>('[data-action="select-fecha-detail"]').forEach((row) => {
    row.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('button, a, input, select')) return;
      const fechaId = row.dataset.fechaId;
      if (fechaId) navigateToFechaDetail(fechaId);
    });
  });

  const navigateToContactoDetail = (
    contactoId: string,
    targetTab: ContactoChildTab = 'telefonos'
  ): void => {
    const resolvedContacto = resolveContactoDetailById({
      contactoId,
      certificates: state.domainData.allCertificadosDetailed,
      archivedContactoIds: state.domainData.archivedContactoIds,
      archivedTelefonoIds: state.domainData.archivedTelefonoIds,
      archivedEmailIds: state.domainData.archivedEmailIds,
    });
    if (!resolvedContacto) return;

    clearAllEntitySelections();
    state.activeRoute = 'certificacion';
    state.activeSubSection = 'certificates';
    state.contactoDomain.selectedContactoId = contactoId;
    state.contactoDomain.activeChildTab = targetTab;
    state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
      id: `contacto-${contactoId}`,
      label: resolvedContacto.nombre,
      route: 'certificacion',
      subview: 'certificates',
      entityType: 'contacto_certificado',
      entityId: contactoId,
      tab: targetTab,
      tooltip: `Certificado ${resolvedContacto.numero_certificado} > Contacto: ${resolvedContacto.nombre}`,
    });
    syncUrlHash('certificacion', 'certificates');
    render();
  };

  document.querySelectorAll<HTMLElement>('[data-action="select-contacto-detail"]').forEach((row) => {
    row.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('button, a, input, select')) return;
      const contactoId = row.dataset.contactoId;
      if (contactoId) navigateToContactoDetail(contactoId, 'telefonos');
    });
  });

  document
    .querySelectorAll<HTMLElement>('[data-resizable-table^="cert-tab-"] [data-action="sort-column"]')
    .forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tableEl = btn.closest<HTMLElement>('[data-resizable-table]');
        const tableId = tableEl?.dataset.resizableTable || '';
        const col = btn.dataset.sortCol;
        if (!col || !tableId.startsWith('cert-tab-')) return;
        const tab = tableId.replace('cert-tab-', '') as CertificadoChildTab;
        const current = state.certificadoDomain.childSortState?.[tab] || {
          column: null,
          direction: 'none' as const,
        };
        const next: SortState =
          current.column === col
            ? { column: col, direction: cycleSortDirection(current.direction) }
            : { column: col, direction: 'asc' };
        state.certificadoDomain.childSortState = {
          ...(state.certificadoDomain.childSortState || {}),
          [tab]: next,
        };
        render();
      });
    });

  // 10. Unified Detail Form Mode Switching, Live Cascade & Persistence
  const readCertificadoFormDraftFromDom = (): CertificadoFormDraft => {
    const orgSelect = document.getElementById(
      'certParentOrganizacionSelect'
    ) as HTMLSelectElement | null;
    const normaSelect = document.getElementById(
      'certParentNormaSelect'
    ) as HTMLSelectElement | null;
    const estatusSelect = document.getElementById(
      'certParentEstatusSelect'
    ) as HTMLSelectElement | null;
    const sectorSelect = document.getElementById(
      'certParentSectorIafSelect'
    ) as HTMLSelectElement | null;
    const subsectorSelect = document.getElementById(
      'certParentSubsectorIafSelect'
    ) as HTMLSelectElement | null;
    const numeroInput = document.getElementById('certNumeroInput') as HTMLInputElement | null;
    const multisitioCheckbox = document.getElementById(
      'certMultisitioCheckbox'
    ) as HTMLInputElement | null;
    const alcanceInput = document.getElementById(
      'certAlcanceInput'
    ) as HTMLTextAreaElement | null;

    return {
      id_organizacion: orgSelect?.value || '',
      id_norma: normaSelect?.value || '',
      id_estatus: estatusSelect?.value || '',
      id_sector_iaf: sectorSelect?.value || '',
      id_subsector_iaf: subsectorSelect?.value || '',
      numero_certificado: numeroInput?.value || '',
      multisitio: Boolean(multisitioCheckbox?.checked),
      alcance: alcanceInput?.value || '',
    };
  };

  document.getElementById('startEditCertBtn')?.addEventListener('click', () => {
    if (!isApprovedStaff()) return;
    const cert = state.domainData.allCertificadosDetailed.find(
      (c) => c.id === state.certificadoDomain.selectedCertId
    );
    if (!cert) return;
    state.certificadoDomain.isEditingAttributes = true;
    state.certificadoDomain.editErrorMessage = null;
    state.certificadoDomain.formDraft = createCertificadoFormDraftFromEntity(cert);
    state.certificadoDomain.editFormData = {
      numero_certificado: cert.numero_certificado,
      multisitio: cert.multisitio,
      alcance: cert.alcance,
    };
    render();
  });

  const cancelCertForm = () => {
    const isAddMode =
      Boolean(state.certificadoDomain.isCreating) && !state.certificadoDomain.selectedCertId;
    if (isAddMode) {
      state.certificadoDomain.isCreating = false;
      state.certificadoDomain.formDraft = undefined;
      state.certificadoDomain.createErrorMessage = null;
      backtrackToParentBreadcrumb();
      render();
      return;
    }
    state.certificadoDomain.isEditingAttributes = false;
    state.certificadoDomain.formDraft = undefined;
    state.certificadoDomain.editFormData = undefined;
    state.certificadoDomain.editErrorMessage = null;
    render();
  };
  document.getElementById('cancelEditCertBtn')?.addEventListener('click', cancelCertForm);

  // 10b. Live Cascading Engine: Sector IAF -> Sub-Sector IAF
  const certParentSectorIafSelect = document.getElementById(
    'certParentSectorIafSelect'
  ) as HTMLSelectElement | null;
  const certParentSubsectorIafSelect = document.getElementById(
    'certParentSubsectorIafSelect'
  ) as HTMLSelectElement | null;

  certParentSectorIafSelect?.addEventListener('change', () => {
    const currentDraft = readCertificadoFormDraftFromDom();
    const sectoresCatalog = getResolvedSectoresCatalog();
    const subsectoresCatalog = getResolvedSubsectoresCatalog();
    const existingCert = state.certificadoDomain.selectedCertId
      ? state.domainData.allCertificadosDetailed.find(
          (c) => c.id === state.certificadoDomain.selectedCertId
        )
      : undefined;

    const cascadeSectores = [...sectoresCatalog];
    if (
      existingCert?.id_sector_iaf &&
      !cascadeSectores.some((s) => s.id === existingCert.id_sector_iaf)
    ) {
      cascadeSectores.push({
        id: existingCert.id_sector_iaf,
        sector: existingCert.sector_iaf,
        descripcion:
          existingCert.sector_iaf_descripcion || `Sector ${existingCert.sector_iaf}`,
        subsectores_count: 0,
        auditores_count: 0,
      });
    }

    const cascadeSubsectores = [...subsectoresCatalog];
    if (
      existingCert?.id_subsector_iaf &&
      !cascadeSubsectores.some((sub) => sub.id === existingCert.id_subsector_iaf)
    ) {
      cascadeSubsectores.push({
        id: existingCert.id_subsector_iaf,
        id_sector_iaf: existingCert.id_sector_iaf,
        sector_numero: existingCert.sector_iaf,
        codigo: existingCert.subsector_iaf_codigo || `${existingCert.sector_iaf}.1`,
        descripcion: existingCert.subsector_iaf_descripcion || 'Sub-Sector IAF asignado',
        categoria_riesgo: existingCert.subsector_categoria_riesgo || 'MEDIO',
        auditores_nombres: [],
      });
    }

    const nextSubsectorId = reconcileSubsectorSelectionOnSectorChange({
      nextSectorId: currentDraft.id_sector_iaf,
      currentSubsectorId: currentDraft.id_subsector_iaf,
      sectores: cascadeSectores,
      subsectores: cascadeSubsectores,
    });

    state.certificadoDomain.formDraft = {
      ...currentDraft,
      id_subsector_iaf: nextSubsectorId,
    };

    if (certParentSubsectorIafSelect) {
      const validSubsectores = filterSubsectoresBySectorIaf({
        sectorId: currentDraft.id_sector_iaf,
        sectores: cascadeSectores,
        subsectores: cascadeSubsectores,
      });
      certParentSubsectorIafSelect.innerHTML = [
        `<option value="" ${nextSubsectorId === '' ? 'selected' : ''}>Seleccione...</option>`,
        ...validSubsectores.map(
          (sub) =>
            `<option value="${escapeHtml(sub.id)}" ${
              sub.id === nextSubsectorId ? 'selected' : ''
            }>${escapeHtml(sub.codigo)} · ${escapeHtml(sub.descripcion)}</option>`
        ),
      ].join('');
      certParentSubsectorIafSelect.value = nextSubsectorId;
    }
  });

  // 11. Live Scope Textarea Character Counter & Multisitio Label Sync
  const certMultisitioCheckbox = document.getElementById(
    'certMultisitioCheckbox'
  ) as HTMLInputElement | null;
  certMultisitioCheckbox?.addEventListener('change', () => {
    const checked = Boolean(certMultisitioCheckbox.checked);
    if (state.certificadoDomain.formDraft) {
      state.certificadoDomain.formDraft = {
        ...state.certificadoDomain.formDraft,
        multisitio: checked,
      };
    }
    const labelTextEl = document.getElementById('certMultisitioLabelText');
    const iconEl = document.getElementById('certMultisitioIcon');
    if (labelTextEl) {
      labelTextEl.textContent = checked ? 'Sí · Esquema Multisitio' : 'No · Sede Única';
    }
    if (iconEl) {
      iconEl.textContent = checked ? '🏢' : '📍';
    }
  });

  const certAlcanceInput = document.getElementById(
    'certAlcanceInput'
  ) as HTMLTextAreaElement | null;
  certAlcanceInput?.addEventListener('input', () => {
    const val = certAlcanceInput.value;
    if (state.certificadoDomain.formDraft) {
      state.certificadoDomain.formDraft = {
        ...state.certificadoDomain.formDraft,
        alcance: val,
      };
    }
    const counter = document.getElementById('certAlcanceLiveCounter');
    if (counter) {
      counter.textContent = `(${val.length} / 1000 caracteres)`;
      if (val.length < 10 || val.length > 1000) {
        counter.classList.add('text-rose-600');
        counter.classList.remove('text-slate-600');
      } else {
        counter.classList.remove('text-rose-600');
        counter.classList.add('text-slate-600');
      }
    }
  });

  // 12. Unified Create / Edit Persistence (#certificadoDetailForm)
  document.getElementById('certificadoDetailForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!isApprovedStaff()) return;

    const draft = readCertificadoFormDraftFromDom();
    const selectedCertId = state.certificadoDomain.selectedCertId;
    const mode: CertificadoDetailMode = selectedCertId ? 'edit' : 'add';

    state.certificadoDomain.formDraft = draft;

    const sectoresCatalog = getResolvedSectoresCatalog();
    const subsectoresCatalog = getResolvedSubsectoresCatalog();
    const existingCert = selectedCertId
      ? state.domainData.allCertificadosDetailed.find((c) => c.id === selectedCertId)
      : undefined;

    const validationSectores = [...sectoresCatalog];
    if (
      existingCert?.id_sector_iaf &&
      !validationSectores.some((s) => s.id === existingCert.id_sector_iaf)
    ) {
      validationSectores.push({
        id: existingCert.id_sector_iaf,
        sector: existingCert.sector_iaf,
        descripcion:
          existingCert.sector_iaf_descripcion || `Sector ${existingCert.sector_iaf}`,
        subsectores_count: 0,
        auditores_count: 0,
      });
    }

    const validationSubsectores = [...subsectoresCatalog];
    if (
      existingCert?.id_subsector_iaf &&
      !validationSubsectores.some((sub) => sub.id === existingCert.id_subsector_iaf)
    ) {
      validationSubsectores.push({
        id: existingCert.id_subsector_iaf,
        id_sector_iaf: existingCert.id_sector_iaf,
        sector_numero: existingCert.sector_iaf,
        codigo: existingCert.subsector_iaf_codigo || `${existingCert.sector_iaf}.1`,
        descripcion: existingCert.subsector_iaf_descripcion || 'Sub-Sector IAF asignado',
        categoria_riesgo: existingCert.subsector_categoria_riesgo || 'MEDIO',
        auditores_nombres: [],
      });
    }

    const validation = validateCertificadoFormDraft({
      mode,
      draft,
      currentCertId: selectedCertId,
      existingCertificates: state.domainData.allCertificadosDetailed,
      sectores: validationSectores,
      subsectores: validationSubsectores,
    });

    if (!validation.valid || !validation.normalized) {
      const errMsg = validation.error || 'Datos del certificado inválidos.';
      if (mode === 'add') {
        state.certificadoDomain.createErrorMessage = errMsg;
      } else {
        state.certificadoDomain.editErrorMessage = errMsg;
        state.certificadoDomain.editFormData = {
          numero_certificado: draft.numero_certificado,
          multisitio: draft.multisitio,
          alcance: draft.alcance,
        };
      }
      render();
      return;
    }

    const normDraft = validation.normalized;
    const orgPool =
      state.domainData.allOrganizaciones.length > 0
        ? state.domainData.allOrganizaciones
        : INITIAL_ORGANIZACIONES;
    const matchedOrg = orgPool.find((o) => o.id === normDraft.id_organizacion);
    const normasCatalog = getResolvedNormasCatalog();
    const matchedNorma = normasCatalog.find((n) => n.id === normDraft.id_norma);
    const estatusCatalog = getResolvedEstatusCatalog();
    const matchedEstatus = estatusCatalog.find((est) => est.id === normDraft.id_estatus);
    const matchedSector = validationSectores.find((s) => s.id === normDraft.id_sector_iaf);
    const matchedSubsector = validationSubsectores.find(
      (sub) => sub.id === normDraft.id_subsector_iaf
    );

    if (mode === 'add') {
      const newId = crypto.randomUUID();
      const resolvedSectorNum =
        matchedSector?.sector ?? matchedSubsector?.sector_numero ?? 17;
      const resolvedOrgNombre = matchedOrg?.nombre || 'Organización Cliente';
      const resolvedOrgRif = matchedOrg?.rif || 'J-00000000-0';
      const resolvedNormaCodigo =
        matchedNorma?.codigo || matchedNorma?.norma || 'ISO 9001:2015';
      const resolvedNormaTitulo = matchedNorma?.titulo || resolvedNormaCodigo;
      const resolvedEsquema = matchedNorma?.esquema || 'SGC - Calidad';
      const resolvedEstatusNombre = matchedEstatus?.estatus || 'Activo';
      const resolvedSectorDesc =
        matchedSector?.descripcion || `Sector ${resolvedSectorNum}`;
      const resolvedSubsectorCodigo =
        matchedSubsector?.codigo || `${resolvedSectorNum}.1`;
      const resolvedSubsectorDesc =
        matchedSubsector?.descripcion || 'Sub-Sector IAF asignado';
      const resolvedSubsectorRisk = matchedSubsector?.categoria_riesgo || 'MEDIO';

      const newCert: CertificadoDetailEntity = {
        id: newId,
        numero_certificado: normDraft.numero_certificado,
        id_organizacion: normDraft.id_organizacion,
        organizacion_nombre: resolvedOrgNombre,
        organizacion_rif: resolvedOrgRif,
        direccion_fiscal: matchedOrg?.direccion_fiscal,
        id_norma: normDraft.id_norma,
        norma_codigo: resolvedNormaCodigo,
        norma_titulo: resolvedNormaTitulo,
        esquema: resolvedEsquema,
        id_estatus: normDraft.id_estatus,
        estatus: resolvedEstatusNombre,
        id_sector_iaf: normDraft.id_sector_iaf,
        sector_iaf: resolvedSectorNum,
        sector_iaf_descripcion: resolvedSectorDesc,
        id_subsector_iaf: normDraft.id_subsector_iaf,
        subsector_iaf_codigo: resolvedSubsectorCodigo,
        subsector_iaf_descripcion: resolvedSubsectorDesc,
        subsector_categoria_riesgo: resolvedSubsectorRisk,
        fecha_emision: 'N/D',
        fecha_vencimiento: 'N/D',
        alcance: normDraft.alcance,
        multisitio: normDraft.multisitio,
        sitios: [],
        procesos: [],
        turnos: [],
        noAplicables: [],
        auditorias: [],
        fechas: [],
        contactos: [],
      };

      state.domainData.allCertificadosDetailed = [
        newCert,
        ...state.domainData.allCertificadosDetailed,
      ];
      state.exploration.records = [
        {
          id: newId,
          numero_certificado: newCert.numero_certificado,
          organizacion_id: newCert.id_organizacion,
          organizacion_nombre: newCert.organizacion_nombre,
          organizacion_rif: newCert.organizacion_rif,
          norma: newCert.norma_codigo,
          esquema: newCert.esquema,
          estatus: newCert.estatus,
          sector_iaf: newCert.sector_iaf,
          alcance: newCert.alcance,
          fecha_emision: newCert.fecha_emision,
          fecha_vencimiento: newCert.fecha_vencimiento,
          multisitio: newCert.multisitio,
          sitios_count: 0,
          cobertura_porcentaje: 100,
        },
        ...state.exploration.records,
      ];

      state.certificadoDomain.selectedCertId = newId;
      state.certificadoDomain.activeChildTab = 'sitios';
      state.certificadoDomain.isCreating = false;
      state.certificadoDomain.isEditingAttributes = false;
      state.certificadoDomain.formDraft = undefined;
      state.certificadoDomain.createErrorMessage = null;
      state.certificadoDomain.editErrorMessage = null;
      showFloatingToast('Certificado creado exitosamente.', 'success');

      state.breadcrumbs = pushBreadcrumb(
        resetBreadcrumbToDomain('certificacion', 'certificates'),
        {
          id: `cert-${newId}`,
          label: newCert.numero_certificado,
          route: 'certificacion',
          subview: 'certificates',
          entityType: 'cert',
          entityId: newId,
          tab: 'sitios',
          tooltip: `Certificado > ${newCert.numero_certificado}`,
        }
      );

      recordPhase5SessionLog('certificado', newId, 'INSERT', null, {
        id_organizacion: newCert.id_organizacion,
        id_norma: newCert.id_norma,
        id_estatus: newCert.id_estatus,
        id_sector_iaf: newCert.id_sector_iaf,
        id_subsector_iaf: newCert.id_subsector_iaf,
        numero_certificado: newCert.numero_certificado,
        multisitio: newCert.multisitio,
        alcance: newCert.alcance,
      });

      if (
        STRICT_UUID_PATTERN.test(newCert.id_organizacion) &&
        STRICT_UUID_PATTERN.test(newCert.id_norma) &&
        STRICT_UUID_PATTERN.test(newCert.id_estatus) &&
        STRICT_UUID_PATTERN.test(newCert.id_sector_iaf) &&
        STRICT_UUID_PATTERN.test(newCert.id_subsector_iaf)
      ) {
        void (async () => {
          try {
            await supabase.from('certificado').insert({
              id: newId,
              id_organizacion: newCert.id_organizacion,
              id_norma: newCert.id_norma,
              id_estatus: newCert.id_estatus,
              id_sector_iaf: newCert.id_sector_iaf,
              id_subsector_iaf: newCert.id_subsector_iaf,
              numero_certificado: newCert.numero_certificado,
              alcance: newCert.alcance,
              multisitio: newCert.multisitio,
            });
          } catch (err) {
            console.warn('Fallback to reactive state for certificado insert:', err);
          }
        })();
      }

      render();
      return;
    }

    if (!selectedCertId || !existingCert) return;

    const updatedSectorNum = matchedSector?.sector ?? existingCert.sector_iaf;
    const updatedOrgNombre = matchedOrg?.nombre || existingCert.organizacion_nombre;
    const updatedOrgRif = matchedOrg?.rif || existingCert.organizacion_rif;
    const updatedDireccionFiscal =
      matchedOrg?.direccion_fiscal ?? existingCert.direccion_fiscal;
    const updatedNormaCodigo =
      matchedNorma?.codigo || matchedNorma?.norma || existingCert.norma_codigo;
    const updatedNormaTitulo = matchedNorma?.titulo || existingCert.norma_titulo;
    const updatedEsquema = matchedNorma?.esquema || existingCert.esquema;
    const updatedEstatus = matchedEstatus?.estatus || existingCert.estatus;
    const updatedSectorDesc =
      matchedSector?.descripcion || existingCert.sector_iaf_descripcion;
    const updatedSubsectorCodigo =
      matchedSubsector?.codigo || existingCert.subsector_iaf_codigo;
    const updatedSubsectorDesc =
      matchedSubsector?.descripcion || existingCert.subsector_iaf_descripcion;
    const updatedSubsectorRisk =
      matchedSubsector?.categoria_riesgo || existingCert.subsector_categoria_riesgo;

    const oldSnapshot: Record<string, unknown> = {
      id_organizacion: existingCert.id_organizacion,
      id_norma: existingCert.id_norma,
      id_estatus: existingCert.id_estatus,
      id_sector_iaf: existingCert.id_sector_iaf,
      id_subsector_iaf: existingCert.id_subsector_iaf,
      numero_certificado: existingCert.numero_certificado,
      multisitio: existingCert.multisitio,
      alcance: existingCert.alcance,
    };

    state.domainData.allCertificadosDetailed = state.domainData.allCertificadosDetailed.map((c) => {
      if (c.id !== selectedCertId) return c;
      return {
        ...c,
        id_organizacion: normDraft.id_organizacion,
        organizacion_nombre: updatedOrgNombre,
        organizacion_rif: updatedOrgRif,
        direccion_fiscal: updatedDireccionFiscal,
        id_norma: normDraft.id_norma,
        norma_codigo: updatedNormaCodigo,
        norma_titulo: updatedNormaTitulo,
        esquema: updatedEsquema,
        id_estatus: normDraft.id_estatus,
        estatus: updatedEstatus,
        id_sector_iaf: normDraft.id_sector_iaf,
        sector_iaf: updatedSectorNum,
        sector_iaf_descripcion: updatedSectorDesc,
        id_subsector_iaf: normDraft.id_subsector_iaf,
        subsector_iaf_codigo: updatedSubsectorCodigo,
        subsector_iaf_descripcion: updatedSubsectorDesc,
        subsector_categoria_riesgo: updatedSubsectorRisk,
        numero_certificado: normDraft.numero_certificado,
        multisitio: normDraft.multisitio,
        alcance: normDraft.alcance,
      };
    });

    state.exploration.records = state.exploration.records.map((c) => {
      if (c.id !== selectedCertId) return c;
      return {
        ...c,
        organizacion_id: normDraft.id_organizacion,
        organizacion_nombre: updatedOrgNombre,
        organizacion_rif: updatedOrgRif,
        norma: updatedNormaCodigo,
        esquema: updatedEsquema,
        estatus: updatedEstatus,
        sector_iaf: updatedSectorNum,
        numero_certificado: normDraft.numero_certificado,
        multisitio: normDraft.multisitio,
        alcance: normDraft.alcance,
      };
    });

    state.breadcrumbs = state.breadcrumbs.map((seg) =>
      seg.entityType === 'cert' && seg.entityId === selectedCertId
        ? {
            ...seg,
            label: normDraft.numero_certificado,
            tooltip: `Certificado > ${normDraft.numero_certificado}`,
          }
        : seg
    );

    state.certificadoDomain.isEditingAttributes = false;
    state.certificadoDomain.formDraft = undefined;
    state.certificadoDomain.editFormData = undefined;
    state.certificadoDomain.editErrorMessage = null;
    showFloatingToast('Atributos del certificado guardados exitosamente.', 'success');

    recordPhase5SessionLog('certificado', selectedCertId, 'UPDATE', oldSnapshot, {
      id_organizacion: normDraft.id_organizacion,
      id_norma: normDraft.id_norma,
      id_estatus: normDraft.id_estatus,
      id_sector_iaf: normDraft.id_sector_iaf,
      id_subsector_iaf: normDraft.id_subsector_iaf,
      numero_certificado: normDraft.numero_certificado,
      multisitio: normDraft.multisitio,
      alcance: normDraft.alcance,
    });

    if (
      STRICT_UUID_PATTERN.test(selectedCertId) &&
      STRICT_UUID_PATTERN.test(normDraft.id_organizacion) &&
      STRICT_UUID_PATTERN.test(normDraft.id_norma) &&
      STRICT_UUID_PATTERN.test(normDraft.id_estatus) &&
      STRICT_UUID_PATTERN.test(normDraft.id_sector_iaf) &&
      STRICT_UUID_PATTERN.test(normDraft.id_subsector_iaf)
    ) {
      void (async () => {
        try {
          await supabase
            .from('certificado')
            .update({
              id_organizacion: normDraft.id_organizacion,
              id_norma: normDraft.id_norma,
              id_estatus: normDraft.id_estatus,
              id_sector_iaf: normDraft.id_sector_iaf,
              id_subsector_iaf: normDraft.id_subsector_iaf,
              numero_certificado: normDraft.numero_certificado,
              multisitio: normDraft.multisitio,
              alcance: normDraft.alcance,
              updated_at: new Date().toISOString(),
            })
            .eq('id', selectedCertId);
        } catch (err) {
          console.warn('Fallback to reactive state for certificado update:', err);
        }
      })();
    }

    render();
  });

  // ===============================================
  // DOMAIN CERTIFICACIÓN (Step 4.2: Sitio Detail View)
  // ===============================================
  const navigateToSitioDetail = (sitioId: string): void => {
    if (!sitioId) return;
    if (
      !canAccessRoute(state.profile, 'certificacion') &&
      !(state.profile?.role === 'AUDITOR' && state.profile?.status === 'APPROVED')
    ) {
      return;
    }

    const resolvedSitio = resolveSitioDetailById({
      sitioId,
      certificates: state.domainData.allCertificadosDetailed,
      programacionAudits: state.domainData.programacionAudits,
      shiftCatalog: state.domainData.shiftCatalog,
      archivedSiteIds: state.domainData.archivedSiteIds,
    });
    if (!resolvedSitio) return;

    clearAllEntitySelections();
    state.activeRoute = 'certificacion';
    state.activeSubSection = 'certificates';
    state.sitioDomain.selectedSitioId = sitioId;
    state.sitioDomain.activeChildTab = 'turnos';
    state.sitioDomain.isCreating = false;
    state.sitioDomain.prefillCertId = null;
    state.sitioDomain.isEditingAttributes = false;
    state.sitioDomain.formDraft = undefined;
    state.sitioDomain.editFormData = undefined;
    state.sitioDomain.editErrorMessage = null;
    state.sitioDomain.archiveConfirmOpen = false;
    state.sitioDomain.archiveErrorMessage = null;
    state.sitioDomain.isAssigningShift = false;

    state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
      id: `sitio-${sitioId}`,
      label: `Sitio ${resolvedSitio.numero_sitio}`,
      route: 'certificacion',
      subview: 'certificates',
      entityType: 'sitio',
      entityId: sitioId,
      tab: 'turnos',
      tooltip: `Certificado ${resolvedSitio.numero_certificado} > Sitio ${resolvedSitio.numero_sitio} — ${resolvedSitio.nombre_sitio}`,
    });
    syncUrlHash('certificacion', 'certificates');
    render();
  };

  document
    .querySelectorAll<HTMLElement>('[data-action="open-create-sitio"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!isApprovedStaff()) return;
        const certId = btn.dataset.certId || state.certificadoDomain.selectedCertId || null;
        if (state.certificadoDomain.selectedCertId) {
          syncCurrentBreadcrumbTab('sitios');
        }
        const cert = certId
          ? state.domainData.allCertificadosDetailed.find((c) => c.id === certId)
          : undefined;
        const activeCertSites = cert
          ? cert.sitios.filter((s) => !state.domainData.archivedSiteIds.has(s.id))
          : [];

        clearAllEntitySelections();
        state.activeRoute = 'certificacion';
        state.activeSubSection = 'certificates';
        state.sitioDomain = {
          selectedSitioId: null,
          activeChildTab: 'turnos',
          isCreating: true,
          prefillCertId: certId,
          isEditingAttributes: false,
          formDraft: createEmptySitioFormDraft(certId, activeCertSites),
          editFormData: undefined,
          editErrorMessage: null,
          archiveConfirmOpen: false,
          archiveErrorMessage: null,
          isAssigningShift: false,
          childSortState: state.sitioDomain.childSortState,
        };

        state.breadcrumbs = pushBreadcrumb(
          state.breadcrumbs,
          createNewEntityBreadcrumbSegment({
            entityType: 'sitio',
            label: 'Nueva Sede',
            route: 'certificacion',
            subview: 'certificates',
            parentEntityId: certId || undefined,
            tooltip: cert
              ? `Certificado ${cert.numero_certificado} > Nueva Sede`
              : 'Nueva Sede Operativa',
          })
        );
        syncUrlHash('certificacion', 'certificates');
        render();
      });
    });

  document.querySelectorAll<HTMLElement>('[data-action="select-sitio"]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (el.tagName === 'TR') {
        const target = e.target as HTMLElement | null;
        if (target?.closest('button, a, input, select')) return;
      } else {
        e.stopPropagation();
      }
      const sitioId = el.dataset.sitioId;
      if (sitioId) navigateToSitioDetail(sitioId);
    });
  });

  document.querySelectorAll<HTMLElement>('[data-action="select-sitio-preview"]').forEach((row) => {
    row.addEventListener('click', () => {
      const sitioId = row.dataset.sitioId;
      if (sitioId) navigateToSitioDetail(sitioId);
    });
  });

  document
    .querySelectorAll<HTMLElement>('[data-action="back-to-cert-from-sitio"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.navBack === 'true') return;
        backtrackToParentBreadcrumb();
        render();
      });
    });

  document.querySelectorAll<HTMLElement>('[data-sitio-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.sitioTab as SitioChildTab | undefined;
      if (tab === 'turnos' || tab === 'auditorias') {
        state.sitioDomain.activeChildTab = tab;
        syncCurrentBreadcrumbTab(tab);
        render();
      }
    });
  });

  document
    .querySelectorAll<HTMLElement>('[data-resizable-table^="sitio-tab-"] [data-action="sort-column"]')
    .forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tableEl = btn.closest<HTMLElement>('[data-resizable-table]');
        const tableId = tableEl?.dataset.resizableTable || '';
        const col = btn.dataset.sortCol;
        if (!col || !tableId.startsWith('sitio-tab-')) return;
        const tab = tableId.replace('sitio-tab-', '') as SitioChildTab;
        const current = state.sitioDomain.childSortState?.[tab] || {
          column: null,
          direction: 'none' as const,
        };
        const next: SortState =
          current.column === col
            ? { column: col, direction: cycleSortDirection(current.direction) }
            : { column: col, direction: 'asc' };
        state.sitioDomain.childSortState = {
          ...(state.sitioDomain.childSortState || {}),
          [tab]: next,
        };
        render();
      });
    });

  const syncSitioFormDraftFromDom = (): SitioFormDraft => {
    const certSelect = document.getElementById('sitioSelectCertificado') as HTMLSelectElement | null;
    const numeroInput = document.getElementById('sitioNumeroInput') as HTMLInputElement | null;
    const nombreInput = document.getElementById('sitioNombreInput') as HTMLInputElement | null;
    const direccionInput = document.getElementById('sitioDireccionInput') as HTMLInputElement | null;
    const nextDraft: SitioFormDraft = {
      id_certificado:
        certSelect?.value ??
        state.sitioDomain.formDraft?.id_certificado ??
        state.sitioDomain.prefillCertId ??
        '',
      numero_sitio:
        numeroInput?.value ?? state.sitioDomain.formDraft?.numero_sitio ?? '0',
      nombre_sitio:
        nombreInput?.value.trim() ?? state.sitioDomain.formDraft?.nombre_sitio ?? '',
      direccion_sitio:
        direccionInput?.value.trim() ?? state.sitioDomain.formDraft?.direccion_sitio ?? '',
    };
    state.sitioDomain.formDraft = nextDraft;
    return nextDraft;
  };

  document.getElementById('sitioSelectCertificado')?.addEventListener('change', () => {
    const draft = syncSitioFormDraftFromDom();
    if (state.sitioDomain.isCreating) {
      const targetCert = state.domainData.allCertificadosDetailed.find(
        (c) => c.id === draft.id_certificado
      );
      const activeCertSites = targetCert
        ? targetCert.sitios.filter((s) => !state.domainData.archivedSiteIds.has(s.id))
        : [];
      state.sitioDomain.formDraft = {
        ...draft,
        numero_sitio: String(suggestNextNumeroSitio(activeCertSites)),
      };
    }
    state.sitioDomain.editErrorMessage = null;
    render();
  });

  document.getElementById('startEditSitioBtn')?.addEventListener('click', () => {
    if (!isApprovedStaff()) return;
    const sitioId = state.sitioDomain.selectedSitioId;
    if (!sitioId) return;
    const currentSitio = resolveSitioDetailById({
      sitioId,
      certificates: state.domainData.allCertificadosDetailed,
      programacionAudits: state.domainData.programacionAudits,
      shiftCatalog: state.domainData.shiftCatalog,
      archivedSiteIds: state.domainData.archivedSiteIds,
    });
    if (!currentSitio) return;

    state.sitioDomain.isCreating = false;
    state.sitioDomain.isEditingAttributes = true;
    state.sitioDomain.archiveConfirmOpen = false;
    state.sitioDomain.editErrorMessage = null;
    state.sitioDomain.archiveErrorMessage = null;
    state.sitioDomain.formDraft = createSitioFormDraftFromEntity(currentSitio);
    state.sitioDomain.editFormData = {
      id_certificado: currentSitio.id_certificado,
      numero_sitio: currentSitio.numero_sitio,
      nombre_sitio: currentSitio.nombre_sitio,
      direccion_sitio: currentSitio.direccion_sitio,
    };
    render();
  });

  document.getElementById('cancelEditSitioBtn')?.addEventListener('click', () => {
    if (state.sitioDomain.isCreating) {
      backtrackToParentBreadcrumb();
      render();
      return;
    }
    state.sitioDomain.isEditingAttributes = false;
    state.sitioDomain.formDraft = undefined;
    state.sitioDomain.editFormData = undefined;
    state.sitioDomain.editErrorMessage = null;
    render();
  });

  document.getElementById('sitioDetailForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isApprovedStaff()) return;

    const isCreating = Boolean(state.sitioDomain.isCreating);
    const sitioId = state.sitioDomain.selectedSitioId;
    if (!isCreating && !sitioId) return;

    const draft = syncSitioFormDraftFromDom();
    const existingSites = state.domainData.allCertificadosDetailed.flatMap((c) =>
      c.sitios
        .filter((s) => !state.domainData.archivedSiteIds.has(s.id))
        .map((s) => ({
          id: s.id,
          id_certificado: c.id,
          numero_sitio: s.numero_sitio,
          deleted_at: null,
        }))
    );

    if (isCreating) {
      const validation = validateSitioFormDraft({
        draft,
        existingSites,
      });

      if (!validation.valid || !validation.normalized) {
        state.sitioDomain.editErrorMessage =
          validation.error || 'No se pudieron validar los datos del sitio.';
        render();
        return;
      }

      const normSitio = validation.normalized;
      const targetCert = state.domainData.allCertificadosDetailed.find(
        (c) => c.id === normSitio.id_certificado
      );
      if (!targetCert) {
        state.sitioDomain.editErrorMessage =
          'El certificado seleccionado no se encuentra disponible.';
        render();
        return;
      }

      const newId = crypto.randomUUID();
      if (STRICT_UUID_PATTERN.test(normSitio.id_certificado)) {
        try {
          const { error } = await supabase.from('sitio').insert({
            id: newId,
            id_certificado: normSitio.id_certificado,
            numero_sitio: normSitio.numero_sitio,
            nombre_sitio: normSitio.nombre_sitio,
            direccion_sitio: normSitio.direccion_sitio,
          });
          if (error && !isMissingTableOrSchemaError(error)) {
            state.sitioDomain.editErrorMessage = translateDatabaseError(error);
            render();
            return;
          }
        } catch {
          // Offline / local mode fallback preserved
        }
      }

      const newSiteEntity: SiteEntity = {
        id: newId,
        id_certificado: targetCert.id,
        numero_sitio: normSitio.numero_sitio,
        nombre_sitio: normSitio.nombre_sitio,
        direccion_sitio: normSitio.direccion_sitio,
        tipo_sitio:
          normSitio.numero_sitio === 0
            ? ('Principal (HQ)' as const)
            : ('Sucursal' as const),
        turnos_vinculados: [],
      };

      state.domainData.allCertificadosDetailed = state.domainData.allCertificadosDetailed.map(
        (c) =>
          c.id === targetCert.id
            ? {
                ...c,
                sitios: [...c.sitios, newSiteEntity].sort(
                  (a, b) => a.numero_sitio - b.numero_sitio
                ),
              }
            : c
      );

      state.domainData.sites = [
        {
          id: newId,
          numero_sitio: normSitio.numero_sitio,
          nombre_sitio: normSitio.nombre_sitio,
          direccion_sitio: normSitio.direccion_sitio,
          numero_certificado: targetCert.numero_certificado,
          turnos_count: 0,
        },
        ...state.domainData.sites,
      ];

      state.exploration.records = state.exploration.records.map((r) =>
        r.id === targetCert.id
          ? {
              ...r,
              sitios_count: r.sitios_count + 1,
            }
          : r
      );

      const nextSegment = {
        id: `sitio-${newId}`,
        label: `Sitio ${normSitio.numero_sitio}`,
        route: 'certificacion' as const,
        subview: 'certificates' as const,
        entityType: 'sitio' as const,
        entityId: newId,
        tab: 'turnos',
        tooltip: `Certificado ${targetCert.numero_certificado} > Sitio ${normSitio.numero_sitio} — ${normSitio.nombre_sitio}`,
      };
      state.breadcrumbs = state.breadcrumbs.some((seg) => seg.id === 'sitio-new')
        ? state.breadcrumbs.map((seg) => (seg.id === 'sitio-new' ? nextSegment : seg))
        : pushBreadcrumb(state.breadcrumbs, nextSegment);

      recordPhase5SessionLog('sitio', newId, 'INSERT', null, {
        id_certificado: normSitio.id_certificado,
        numero_sitio: normSitio.numero_sitio,
        nombre_sitio: normSitio.nombre_sitio,
        direccion_sitio: normSitio.direccion_sitio,
      });

      state.sitioDomain.selectedSitioId = newId;
      state.sitioDomain.activeChildTab = 'turnos';
      state.sitioDomain.isCreating = false;
      state.sitioDomain.isEditingAttributes = false;
      state.sitioDomain.prefillCertId = null;
      state.sitioDomain.formDraft = undefined;
      state.sitioDomain.editFormData = undefined;
      state.sitioDomain.editErrorMessage = null;
      showFloatingToast(
        `Sede "${normSitio.nombre_sitio}" (Sitio ${normSitio.numero_sitio}) creada correctamente.`,
        'success'
      );
      syncUrlHash('certificacion', 'certificates');
      render();
      return;
    }

    const currentSitio = resolveSitioDetailById({
      sitioId: sitioId!,
      certificates: state.domainData.allCertificadosDetailed,
      programacionAudits: state.domainData.programacionAudits,
      shiftCatalog: state.domainData.shiftCatalog,
      archivedSiteIds: state.domainData.archivedSiteIds,
    });
    if (!currentSitio) return;

    const validation = validateSitioFormDraft({
      draft,
      currentSitioId: sitioId!,
      originalSitio: {
        id_certificado: currentSitio.id_certificado,
        numero_sitio: currentSitio.numero_sitio,
        associatedAuditsCount: currentSitio.auditorias.length,
      },
      existingSites,
    });

    if (!validation.valid || !validation.normalized) {
      state.sitioDomain.editErrorMessage =
        validation.error || 'No se pudieron validar los datos del sitio.';
      render();
      return;
    }

    const normSitio = validation.normalized;
    const targetCert = state.domainData.allCertificadosDetailed.find(
      (c) => c.id === normSitio.id_certificado
    );
    if (!targetCert) {
      state.sitioDomain.editErrorMessage =
        'El certificado seleccionado no se encuentra disponible.';
      render();
      return;
    }

    if (STRICT_UUID_PATTERN.test(sitioId!) && STRICT_UUID_PATTERN.test(normSitio.id_certificado)) {
      try {
        const { error } = await supabase
          .from('sitio')
          .update({
            id_certificado: normSitio.id_certificado,
            numero_sitio: normSitio.numero_sitio,
            nombre_sitio: normSitio.nombre_sitio,
            direccion_sitio: normSitio.direccion_sitio,
            updated_at: new Date().toISOString(),
          })
          .eq('id', sitioId!);
        if (error && !isMissingTableOrSchemaError(error)) {
          state.sitioDomain.editErrorMessage = translateDatabaseError(error);
          render();
          return;
        }
      } catch {
        // Optimistic reactive fallback preserved
      }
    }

    const oldSnapshot = {
      id_certificado: currentSitio.id_certificado,
      numero_sitio: currentSitio.numero_sitio,
      nombre_sitio: currentSitio.nombre_sitio,
      direccion_sitio: currentSitio.direccion_sitio,
    };

    const certChanged = normSitio.id_certificado !== currentSitio.id_certificado;
    const sourceCertObj = state.domainData.allCertificadosDetailed.find(
      (c) => c.id === currentSitio.id_certificado
    );
    const existingRawSite = sourceCertObj?.sitios.find((s) => s.id === sitioId);
    const updatedSiteEntity: SiteEntity = {
      ...(existingRawSite || {
        id: sitioId!,
        id_certificado: normSitio.id_certificado,
        turnos_vinculados: [],
      }),
      id_certificado: normSitio.id_certificado,
      numero_sitio: normSitio.numero_sitio,
      nombre_sitio: normSitio.nombre_sitio,
      direccion_sitio: normSitio.direccion_sitio,
      tipo_sitio:
        normSitio.numero_sitio === 0
          ? ('Principal (HQ)' as const)
          : existingRawSite?.tipo_sitio && existingRawSite.tipo_sitio !== 'Principal (HQ)'
          ? existingRawSite.tipo_sitio
          : ('Sucursal' as const),
    };

    state.domainData.allCertificadosDetailed = state.domainData.allCertificadosDetailed.map((c) => {
      if (certChanged) {
        if (c.id === currentSitio.id_certificado) {
          return {
            ...c,
            sitios: c.sitios.filter((s) => s.id !== sitioId),
            turnos: c.turnos.map((t) => ({
              ...t,
              sitios_vinculados: t.sitios_vinculados.filter(
                (label) => label !== currentSitio.nombre_sitio
              ),
            })),
          };
        }
        if (c.id === normSitio.id_certificado) {
          return {
            ...c,
            sitios: [...c.sitios, updatedSiteEntity].sort(
              (a, b) => a.numero_sitio - b.numero_sitio
            ),
          };
        }
        return c;
      }
      if (c.id !== currentSitio.id_certificado) return c;
      return {
        ...c,
        sitios: c.sitios
          .map((s) => (s.id === sitioId ? updatedSiteEntity : s))
          .sort((a, b) => a.numero_sitio - b.numero_sitio),
        turnos: c.turnos.map((t) => ({
          ...t,
          sitios_vinculados: t.sitios_vinculados.map((label) =>
            label === currentSitio.nombre_sitio ? normSitio.nombre_sitio : label
          ),
        })),
      };
    });

    state.domainData.sites = state.domainData.sites.map((s) =>
      s.id === sitioId
        ? {
            ...s,
            numero_sitio: normSitio.numero_sitio,
            nombre_sitio: normSitio.nombre_sitio,
            direccion_sitio: normSitio.direccion_sitio,
            numero_certificado: targetCert.numero_certificado,
          }
        : s
    );

    if (certChanged) {
      state.exploration.records = state.exploration.records.map((r) => {
        if (r.id === currentSitio.id_certificado) {
          return { ...r, sitios_count: Math.max(0, r.sitios_count - 1) };
        }
        if (r.id === normSitio.id_certificado) {
          return { ...r, sitios_count: r.sitios_count + 1 };
        }
        return r;
      });
    }

    state.domainData.programacionAudits = state.domainData.programacionAudits.map((aud) =>
      aud.id_certificado !== currentSitio.id_certificado
        ? aud
        : {
            ...aud,
            sitiosMuestreo: aud.sitiosMuestreo.map((sm) =>
              sm.id_sitio === sitioId
                ? {
                    ...sm,
                    numero_sitio: normSitio.numero_sitio,
                    nombre_sitio: normSitio.nombre_sitio,
                    direccion_sitio: normSitio.direccion_sitio,
                  }
                : sm
            ),
          }
    );

    state.breadcrumbs = state.breadcrumbs.map((seg) =>
      seg.entityType === 'sitio' && seg.entityId === sitioId
        ? {
            ...seg,
            label: `Sitio ${normSitio.numero_sitio}`,
            tooltip: `Certificado ${targetCert.numero_certificado} > Sitio ${normSitio.numero_sitio} — ${normSitio.nombre_sitio}`,
          }
        : seg
    );

    recordPhase5SessionLog('sitio', sitioId!, 'UPDATE', oldSnapshot, {
      id_certificado: normSitio.id_certificado,
      numero_sitio: normSitio.numero_sitio,
      nombre_sitio: normSitio.nombre_sitio,
      direccion_sitio: normSitio.direccion_sitio,
    });

    state.sitioDomain.isEditingAttributes = false;
    state.sitioDomain.formDraft = undefined;
    state.sitioDomain.editFormData = undefined;
    state.sitioDomain.editErrorMessage = null;
    showFloatingToast(
      'Atributos del sitio guardados y registrados en Historial de Cambios.',
      'success'
    );
    render();
  });

  document.querySelectorAll<HTMLElement>('[data-action="open-archive-sitio"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!canArchiveRecord(state.profile)) return;
      const sitioId = state.sitioDomain.selectedSitioId;
      if (!sitioId) return;
      const currentSitio = resolveSitioDetailById({
        sitioId,
        certificates: state.domainData.allCertificadosDetailed,
        programacionAudits: state.domainData.programacionAudits,
        shiftCatalog: state.domainData.shiftCatalog,
        archivedSiteIds: state.domainData.archivedSiteIds,
      });
      if (!currentSitio) return;
      void openArchiveModal({
        tableName: 'sitio',
        recordId: currentSitio.id,
        entityTypeLabel: 'Sitio Operativo',
        recordTitle: `Sitio ${currentSitio.numero_sitio} · ${currentSitio.nombre_sitio}`,
        recordSubtitle: currentSitio.numero_certificado,
      });
    });
  });

  document.getElementById('cancelArchiveSitioBtn')?.addEventListener('click', () => {
    state.sitioDomain.archiveConfirmOpen = false;
    state.sitioDomain.archiveErrorMessage = null;
    render();
  });

  document.getElementById('confirmArchiveSitioBtn')?.addEventListener('click', () => {
    if (!isApprovedStaff()) return;
    const sitioId = state.sitioDomain.selectedSitioId;
    if (!sitioId) return;

    const currentSitio = resolveSitioDetailById({
      sitioId,
      certificates: state.domainData.allCertificadosDetailed,
      programacionAudits: state.domainData.programacionAudits,
      shiftCatalog: state.domainData.shiftCatalog,
      archivedSiteIds: state.domainData.archivedSiteIds,
    });
    if (!currentSitio) return;

    const siblingSites = state.domainData.allCertificadosDetailed.flatMap((c) =>
      c.sitios
        .filter((s) => !state.domainData.archivedSiteIds.has(s.id))
        .map((s) => ({
          id: s.id,
          id_certificado: c.id,
          numero_sitio: s.numero_sitio,
          deleted_at: null,
        }))
    );

    const guard = canArchiveSitio({
      site: currentSitio,
      siblingSites,
      associatedAuditsCount: currentSitio.auditorias.length,
    });

    if (!guard.allowed) {
      state.sitioDomain.archiveConfirmOpen = false;
      state.sitioDomain.archiveErrorMessage =
        guard.reason || 'Este sitio tiene dependencias activas que impiden archivarlo.';
      render();
      return;
    }

    const reasonInput =
      (document.getElementById('archiveSitioReasonInput') as HTMLInputElement | null)?.value.trim() ||
      'Archivo lógico solicitado desde ficha de sitio';
    const deletedAtIso = new Date().toISOString();

    state.domainData.archivedSiteIds.add(sitioId);
    state.domainData.allCertificadosDetailed = state.domainData.allCertificadosDetailed.map((c) =>
      c.id === currentSitio.id_certificado
        ? {
            ...c,
            sitios: c.sitios.filter((s) => s.id !== sitioId),
          }
        : c
    );
    state.domainData.sites = state.domainData.sites.filter((s) => s.id !== sitioId);
    state.exploration.records = state.exploration.records.map((r) => {
      if (r.id !== currentSitio.id_certificado) return r;
      const updatedCert = state.domainData.allCertificadosDetailed.find((c) => c.id === r.id);
      return {
        ...r,
        sitios_count: updatedCert ? updatedCert.sitios.length : Math.max(0, r.sitios_count - 1),
      };
    });

    recordPhase5SessionLog(
      'sitio',
      sitioId,
      'UPDATE',
      {
        numero_sitio: currentSitio.numero_sitio,
        nombre_sitio: currentSitio.nombre_sitio,
        deleted_at: null,
      },
      {
        deleted_at: deletedAtIso,
        delete_reason: reasonInput,
      }
    );

    void (async () => {
      try {
        const { error } = await supabase.rpc('archive_record', {
          p_table: 'sitio',
          p_record_id: sitioId,
          p_reason: reasonInput,
        });
        if (error) {
          await supabase
            .from('sitio')
            .update({
              deleted_at: deletedAtIso,
              delete_reason: reasonInput,
            })
            .eq('id', sitioId);
        }
      } catch {
        // Optimistic reactive fallback preserved
      }
    })();

    state.sitioDomain.archiveConfirmOpen = false;
    backtrackToParentBreadcrumb();
    showFloatingToast(
      `Sitio ${currentSitio.numero_sitio} (${currentSitio.nombre_sitio}) archivado lógicamente.`,
      'success'
    );
    render();
  });

  document
    .querySelectorAll<HTMLElement>('[data-action="toggle-assign-sitio-turno"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!isApprovedStaff()) return;
        state.sitioDomain.isAssigningShift = !state.sitioDomain.isAssigningShift;
        render();
      });
    });

  document.getElementById('assignSitioTurnoForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!isApprovedStaff()) return;
    const sitioId = state.sitioDomain.selectedSitioId;
    if (!sitioId) return;

    const turnoId =
      (document.getElementById('assignSitioTurnoSelect') as HTMLSelectElement | null)?.value || '';
    const shift = state.domainData.shiftCatalog.find((t) => t.id === turnoId);
    if (!shift) return;

    const currentSitio = resolveSitioDetailById({
      sitioId,
      certificates: state.domainData.allCertificadosDetailed,
      programacionAudits: state.domainData.programacionAudits,
      shiftCatalog: state.domainData.shiftCatalog,
      archivedSiteIds: state.domainData.archivedSiteIds,
    });
    if (!currentSitio) return;

    state.domainData.allCertificadosDetailed = state.domainData.allCertificadosDetailed.map((c) => {
      if (c.id !== currentSitio.id_certificado) return c;

      const updatedSites = c.sitios.map((s) => {
        if (s.id !== sitioId) return s;
        const existingLabels = s.turnos_vinculados || [];
        const nextLabels = existingLabels.includes(shift.descripcion)
          ? existingLabels
          : [...existingLabels, shift.descripcion];
        return {
          ...s,
          turnos_vinculados: nextLabels,
        };
      });

      const hasShiftOnCert = c.turnos.some((t) => t.id === shift.id);
      const updatedCertShifts = hasShiftOnCert
        ? c.turnos.map((t) => {
            if (t.id !== shift.id) return t;
            const linked = t.sitios_vinculados.includes(currentSitio.nombre_sitio)
              ? t.sitios_vinculados
              : [...t.sitios_vinculados, currentSitio.nombre_sitio];
            return { ...t, sitios_vinculados: linked };
          })
        : [
            ...c.turnos,
            {
              id: shift.id,
              hora_entrada: shift.hora_entrada,
              hora_salida: shift.hora_salida,
              descripcion: shift.descripcion,
              sitios_vinculados: [currentSitio.nombre_sitio],
            },
          ];

      return {
        ...c,
        sitios: updatedSites,
        turnos: updatedCertShifts,
      };
    });

    recordPhase5SessionLog('sitio', sitioId, 'UPDATE', null, {
      accion: 'ASIGNAR_TURNO',
      turno: shift.descripcion,
      horario: `${shift.hora_entrada} - ${shift.hora_salida}`,
    });

    state.sitioDomain.isAssigningShift = false;
    showFloatingToast(
      `Turno "${shift.descripcion}" asignado al Sitio ${currentSitio.numero_sitio}.`,
      'success'
    );

    if (STRICT_UUID_PATTERN.test(sitioId) && STRICT_UUID_PATTERN.test(shift.id)) {
      void (async () => {
        try {
          await supabase.from('turnos_por_sitio').insert({
            id_sitio: sitioId,
            id_turno: shift.id,
          });
        } catch {
          // Optimistic reactive fallback preserved
        }
      })();
    }

    render();
  });

  document.getElementById('unassignSitioTurnoForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!isApprovedStaff()) return;
    const sitioId = state.sitioDomain.selectedSitioId;
    const turnoId =
      (document.getElementById('unassignSitioTurnoSelect') as HTMLSelectElement | null)?.value || '';
    if (!sitioId || !turnoId) return;

    const currentSitio = resolveSitioDetailById({
      sitioId,
      certificates: state.domainData.allCertificadosDetailed,
      programacionAudits: state.domainData.programacionAudits,
      shiftCatalog: state.domainData.shiftCatalog,
      archivedSiteIds: state.domainData.archivedSiteIds,
    });
    const shift = state.domainData.shiftCatalog.find((t) => t.id === turnoId);
    if (!currentSitio || !shift) return;

    state.domainData.allCertificadosDetailed = state.domainData.allCertificadosDetailed.map((c) => {
      if (c.id !== currentSitio.id_certificado) return c;
      return {
        ...c,
        sitios: c.sitios.map((s) =>
          s.id === sitioId
            ? {
                ...s,
                turnos_vinculados: (s.turnos_vinculados || []).filter(
                  (lbl) =>
                    lbl.trim().toLowerCase() !== shift.descripcion.trim().toLowerCase() &&
                    lbl !== shift.id
                ),
              }
            : s
        ),
        turnos: c.turnos.map((t) =>
          t.id === turnoId
            ? {
                ...t,
                sitios_vinculados: t.sitios_vinculados.filter(
                  (name) =>
                    name.trim().toLowerCase() !== currentSitio.nombre_sitio.trim().toLowerCase()
                ),
              }
            : t
        ),
      };
    });

    recordPhase5SessionLog(
      'sitio',
      sitioId,
      'UPDATE',
      { turno_asignado: shift.descripcion },
      { accion: 'DESVINCULAR_TURNO', turno: shift.descripcion }
    );

    showFloatingToast(
      `Turno "${shift.descripcion}" desvinculado del Sitio ${currentSitio.numero_sitio}.`,
      'success'
    );

    if (STRICT_UUID_PATTERN.test(sitioId) && STRICT_UUID_PATTERN.test(turnoId)) {
      void (async () => {
        try {
          await supabase
            .from('turnos_por_sitio')
            .update({
              deleted_at: new Date().toISOString(),
            })
            .eq('id_sitio', sitioId)
            .eq('id_turno', turnoId)
            .is('deleted_at', null);
        } catch {
          // Optimistic reactive fallback preserved
        }
      })();
    }

    render();
  });

  // ===============================================
  // DOMAIN CERTIFICACIÓN (Step 4.2: Proceso Detail View)
  // ===============================================
  const navigateToProcesoDetail = (procesoId: string): void => {
    if (!procesoId) return;
    if (
      !canAccessRoute(state.profile, 'certificacion') &&
      !(state.profile?.role === 'AUDITOR' && state.profile?.status === 'APPROVED')
    ) {
      return;
    }

    const resolvedProceso = resolveProcesoDetailById({
      procesoId,
      certificates: state.domainData.allCertificadosDetailed,
      programacionAudits: state.domainData.programacionAudits,
      phase5Findings: state.domainData.phase5Findings,
      requirementsCatalog: state.domainData.requirementsCatalog,
      archivedProcesoIds: state.domainData.archivedProcesoIds,
    });
    if (!resolvedProceso) return;

    clearAllEntitySelections();
    state.activeRoute = 'certificacion';
    state.activeSubSection = 'certificates';
    state.procesoDomain.selectedProcesoId = procesoId;
    state.procesoDomain.activeChildTab = 'requisitos';
    state.procesoDomain.isCreating = false;
    state.procesoDomain.prefillCertId = null;
    state.procesoDomain.isEditingAttributes = false;
    state.procesoDomain.formDraft = undefined;
    state.procesoDomain.editFormData = undefined;
    state.procesoDomain.editErrorMessage = null;
    state.procesoDomain.archiveConfirmOpen = false;
    state.procesoDomain.archiveErrorMessage = null;
    state.procesoDomain.isAssigningRequisito = false;

    state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
      id: `proceso-${procesoId}`,
      label: resolvedProceso.nombre_proceso,
      route: 'certificacion',
      subview: 'certificates',
      entityType: 'proceso',
      entityId: procesoId,
      tab: 'requisitos',
      tooltip: `Certificado ${resolvedProceso.numero_certificado} > Proceso ${resolvedProceso.nombre_proceso}`,
    });
    syncUrlHash('certificacion', 'certificates');
    render();
  };

  document
    .querySelectorAll<HTMLElement>('[data-action="open-create-proceso"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!isApprovedStaff()) return;
        const certId = btn.dataset.certId || state.certificadoDomain.selectedCertId || null;
        if (state.certificadoDomain.selectedCertId) {
          syncCurrentBreadcrumbTab('procesos');
        }
        const cert = certId
          ? state.domainData.allCertificadosDetailed.find((c) => c.id === certId)
          : undefined;

        clearAllEntitySelections();
        state.activeRoute = 'certificacion';
        state.activeSubSection = 'certificates';
        state.procesoDomain = {
          selectedProcesoId: null,
          activeChildTab: 'requisitos',
          isCreating: true,
          prefillCertId: certId,
          isEditingAttributes: false,
          formDraft: createEmptyProcesoFormDraft(certId),
          editFormData: undefined,
          editErrorMessage: null,
          archiveConfirmOpen: false,
          archiveErrorMessage: null,
          isAssigningRequisito: false,
          childSortState: state.procesoDomain.childSortState,
        };

        state.breadcrumbs = pushBreadcrumb(
          state.breadcrumbs,
          createNewEntityBreadcrumbSegment({
            entityType: 'proceso',
            label: 'Nuevo Proceso',
            route: 'certificacion',
            subview: 'certificates',
            parentEntityId: certId || undefined,
            tooltip: cert
              ? `Certificado ${cert.numero_certificado} > Nuevo Proceso`
              : 'Nuevo Proceso del Sistema',
          })
        );
        syncUrlHash('certificacion', 'certificates');
        render();
      });
    });

  document.querySelectorAll<HTMLElement>('[data-action="select-proceso"]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (el.tagName === 'TR') {
        const target = e.target as HTMLElement | null;
        if (target?.closest('button, a, input, select')) return;
      } else {
        e.stopPropagation();
      }
      const procesoId = el.dataset.procesoId;
      if (procesoId) navigateToProcesoDetail(procesoId);
    });
  });

  document.querySelectorAll<HTMLElement>('[data-action="select-proceso-preview"]').forEach((row) => {
    row.addEventListener('click', () => {
      const procesoId = row.dataset.procesoId;
      if (procesoId) navigateToProcesoDetail(procesoId);
    });
  });

  document
    .querySelectorAll<HTMLElement>('[data-action="select-proceso-by-name"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        const certId = btn.dataset.certId || '';
        const procName = (btn.dataset.procesoNombre || '').trim().toLowerCase();
        if (!procName) return;

        const targetCert =
          state.domainData.allCertificadosDetailed.find((c) => c.id === certId) ||
          state.domainData.allCertificadosDetailed.find((c) =>
            c.procesos.some((p) => p.nombre_proceso.trim().toLowerCase() === procName)
          );
        const matchedProc = targetCert?.procesos.find(
          (p) =>
            p.nombre_proceso.trim().toLowerCase() === procName &&
            !state.domainData.archivedProcesoIds.has(p.id)
        );
        if (matchedProc) {
          navigateToProcesoDetail(matchedProc.id);
        }
      });
    });

  document
    .querySelectorAll<HTMLElement>('[data-action="back-to-cert-from-proceso"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.navBack === 'true') return;
        backtrackToParentBreadcrumb();
        render();
      });
    });

  document.querySelectorAll<HTMLElement>('[data-proceso-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.procesoTab as ProcesoChildTab | undefined;
      if (tab === 'requisitos' || tab === 'hallazgos' || tab === 'auditorias') {
        state.procesoDomain.activeChildTab = tab;
        syncCurrentBreadcrumbTab(tab);
        render();
      }
    });
  });

  document
    .querySelectorAll<HTMLElement>(
      '[data-resizable-table^="proceso-tab-"] [data-action="sort-column"]'
    )
    .forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tableEl = btn.closest<HTMLElement>('[data-resizable-table]');
        const tableId = tableEl?.dataset.resizableTable || '';
        const col = btn.dataset.sortCol;
        if (!col || !tableId.startsWith('proceso-tab-')) return;
        const tab = tableId.replace('proceso-tab-', '') as ProcesoChildTab;
        const current = state.procesoDomain.childSortState?.[tab] || {
          column: null,
          direction: 'none' as const,
        };
        const next: SortState =
          current.column === col
            ? { column: col, direction: cycleSortDirection(current.direction) }
            : { column: col, direction: 'asc' };
        state.procesoDomain.childSortState = {
          ...(state.procesoDomain.childSortState || {}),
          [tab]: next,
        };
        render();
      });
    });

  const syncProcesoFormDraftFromDom = (): ProcesoFormDraft => {
    const certSelect = document.getElementById(
      'procesoSelectCertificado'
    ) as HTMLSelectElement | null;
    const nombreInput = document.getElementById('procesoNombreInput') as HTMLInputElement | null;
    const tipoSelect = document.getElementById('procesoTipoSelect') as HTMLSelectElement | null;
    const responsableInput = document.getElementById(
      'procesoResponsableInput'
    ) as HTMLInputElement | null;
    const nextDraft: ProcesoFormDraft = {
      id_certificado:
        certSelect?.value ??
        state.procesoDomain.formDraft?.id_certificado ??
        state.procesoDomain.prefillCertId ??
        '',
      nombre_proceso:
        nombreInput?.value.trim() ?? state.procesoDomain.formDraft?.nombre_proceso ?? '',
      tipo: ((tipoSelect?.value as ProcesoTipo | undefined) ??
        state.procesoDomain.formDraft?.tipo ??
        'Medular') as ProcesoTipo,
      responsable:
        responsableInput?.value.trim() ?? state.procesoDomain.formDraft?.responsable ?? '',
    };
    state.procesoDomain.formDraft = nextDraft;
    return nextDraft;
  };

  document.getElementById('procesoSelectCertificado')?.addEventListener('change', () => {
    syncProcesoFormDraftFromDom();
    state.procesoDomain.editErrorMessage = null;
    render();
  });

  document.getElementById('startEditProcesoBtn')?.addEventListener('click', () => {
    if (!isApprovedStaff()) return;
    const procesoId = state.procesoDomain.selectedProcesoId;
    if (!procesoId) return;
    const currentProceso = resolveProcesoDetailById({
      procesoId,
      certificates: state.domainData.allCertificadosDetailed,
      programacionAudits: state.domainData.programacionAudits,
      phase5Findings: state.domainData.phase5Findings,
      requirementsCatalog: state.domainData.requirementsCatalog,
      archivedProcesoIds: state.domainData.archivedProcesoIds,
    });
    if (!currentProceso) return;

    state.procesoDomain.isCreating = false;
    state.procesoDomain.isEditingAttributes = true;
    state.procesoDomain.archiveConfirmOpen = false;
    state.procesoDomain.editErrorMessage = null;
    state.procesoDomain.archiveErrorMessage = null;
    state.procesoDomain.formDraft = createProcesoFormDraftFromEntity(currentProceso);
    state.procesoDomain.editFormData = {
      id_certificado: currentProceso.id_certificado,
      nombre_proceso: currentProceso.nombre_proceso,
      tipo: currentProceso.tipo,
      responsable: currentProceso.responsable || '',
    };
    render();
  });

  document.getElementById('cancelEditProcesoBtn')?.addEventListener('click', () => {
    if (state.procesoDomain.isCreating) {
      backtrackToParentBreadcrumb();
      render();
      return;
    }
    state.procesoDomain.isEditingAttributes = false;
    state.procesoDomain.formDraft = undefined;
    state.procesoDomain.editFormData = undefined;
    state.procesoDomain.editErrorMessage = null;
    render();
  });

  document.getElementById('procesoDetailForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isApprovedStaff()) return;

    const isCreating = Boolean(state.procesoDomain.isCreating);
    const procesoId = state.procesoDomain.selectedProcesoId;
    if (!isCreating && !procesoId) return;

    const draft = syncProcesoFormDraftFromDom();
    const existingProcesses = state.domainData.allCertificadosDetailed.flatMap((c) =>
      c.procesos
        .filter((p) => !state.domainData.archivedProcesoIds.has(p.id))
        .map((p) => ({
          id: p.id,
          id_certificado: c.id,
          nombre_proceso: p.nombre_proceso,
          deleted_at: null,
        }))
    );

    if (isCreating) {
      const validation = validateProcesoFormDraft({
        draft,
        existingProcesses,
      });

      if (!validation.valid || !validation.normalized) {
        state.procesoDomain.editErrorMessage =
          validation.error || 'No se pudieron validar los datos del proceso.';
        render();
        return;
      }

      const normProc = validation.normalized;
      const targetCert = state.domainData.allCertificadosDetailed.find(
        (c) => c.id === normProc.id_certificado
      );
      if (!targetCert) {
        state.procesoDomain.editErrorMessage =
          'El certificado seleccionado no se encuentra disponible.';
        render();
        return;
      }

      const newId = crypto.randomUUID();
      if (STRICT_UUID_PATTERN.test(normProc.id_certificado)) {
        try {
          const { error } = await supabase.from('proceso').insert({
            id: newId,
            id_certificado: normProc.id_certificado,
            nombre_proceso: normProc.nombre_proceso,
            tipo: normProc.tipo,
          });
          if (error && !isMissingTableOrSchemaError(error)) {
            state.procesoDomain.editErrorMessage = translateDatabaseError(error);
            render();
            return;
          }
        } catch {
          // Offline / local mode fallback preserved
        }
      }

      const newProcessEntity: ProcessEntity = {
        id: newId,
        id_certificado: targetCert.id,
        nombre_proceso: normProc.nombre_proceso,
        tipo: normProc.tipo,
        responsable: normProc.responsable,
        clausulas_cubiertas: [],
        requisitos_detalle: [],
      };

      state.domainData.allCertificadosDetailed = state.domainData.allCertificadosDetailed.map(
        (c) =>
          c.id === targetCert.id
            ? {
                ...c,
                procesos: [...c.procesos, newProcessEntity],
              }
            : c
      );

      state.domainData.processes = [
        {
          id: newId,
          nombre_proceso: normProc.nombre_proceso,
          numero_certificado: targetCert.numero_certificado,
          clausulas_cubiertas: [],
        },
        ...state.domainData.processes,
      ];

      const nextSegment = {
        id: `proceso-${newId}`,
        label: normProc.nombre_proceso,
        route: 'certificacion' as const,
        subview: 'certificates' as const,
        entityType: 'proceso' as const,
        entityId: newId,
        tab: 'requisitos',
        tooltip: `Certificado ${targetCert.numero_certificado} > Proceso ${normProc.nombre_proceso}`,
      };
      state.breadcrumbs = state.breadcrumbs.some((seg) => seg.id === 'proceso-new')
        ? state.breadcrumbs.map((seg) => (seg.id === 'proceso-new' ? nextSegment : seg))
        : pushBreadcrumb(state.breadcrumbs, nextSegment);

      recordPhase5SessionLog('proceso', newId, 'INSERT', null, {
        id_certificado: normProc.id_certificado,
        nombre_proceso: normProc.nombre_proceso,
        tipo: normProc.tipo,
        responsable: normProc.responsable || null,
      });

      state.procesoDomain.selectedProcesoId = newId;
      state.procesoDomain.activeChildTab = 'requisitos';
      state.procesoDomain.isCreating = false;
      state.procesoDomain.isEditingAttributes = false;
      state.procesoDomain.prefillCertId = null;
      state.procesoDomain.formDraft = undefined;
      state.procesoDomain.editFormData = undefined;
      state.procesoDomain.editErrorMessage = null;
      showFloatingToast(
        `Proceso "${normProc.nombre_proceso}" creado correctamente.`,
        'success'
      );
      syncUrlHash('certificacion', 'certificates');
      render();
      return;
    }

    const currentProceso = resolveProcesoDetailById({
      procesoId: procesoId!,
      certificates: state.domainData.allCertificadosDetailed,
      programacionAudits: state.domainData.programacionAudits,
      phase5Findings: state.domainData.phase5Findings,
      requirementsCatalog: state.domainData.requirementsCatalog,
      archivedProcesoIds: state.domainData.archivedProcesoIds,
    });
    if (!currentProceso) return;

    const validation = validateProcesoFormDraft({
      draft,
      currentProcesoId: procesoId!,
      existingProcesses,
    });

    if (!validation.valid || !validation.normalized) {
      state.procesoDomain.editErrorMessage =
        validation.error || 'No se pudieron validar los datos del proceso.';
      render();
      return;
    }

    const normProc = validation.normalized;
    const targetCert = state.domainData.allCertificadosDetailed.find(
      (c) => c.id === normProc.id_certificado
    );
    if (!targetCert) {
      state.procesoDomain.editErrorMessage =
        'El certificado seleccionado no se encuentra disponible.';
      render();
      return;
    }

    if (STRICT_UUID_PATTERN.test(procesoId!) && STRICT_UUID_PATTERN.test(normProc.id_certificado)) {
      try {
        const { error } = await supabase
          .from('proceso')
          .update({
            id_certificado: normProc.id_certificado,
            nombre_proceso: normProc.nombre_proceso,
            tipo: normProc.tipo,
            updated_at: new Date().toISOString(),
          })
          .eq('id', procesoId!);
        if (error && !isMissingTableOrSchemaError(error)) {
          state.procesoDomain.editErrorMessage = translateDatabaseError(error);
          render();
          return;
        }
      } catch {
        // Optimistic reactive fallback preserved
      }
    }

    const oldSnapshot = {
      id_certificado: currentProceso.id_certificado,
      nombre_proceso: currentProceso.nombre_proceso,
      tipo: currentProceso.tipo,
      responsable: currentProceso.responsable || null,
    };

    const certChanged = normProc.id_certificado !== currentProceso.id_certificado;
    const sourceCertObj = state.domainData.allCertificadosDetailed.find(
      (c) => c.id === currentProceso.id_certificado
    );
    const existingRawProc = sourceCertObj?.procesos.find((p) => p.id === procesoId);
    const updatedProcEntity: ProcessEntity = {
      ...(existingRawProc || {
        id: procesoId!,
        id_certificado: normProc.id_certificado,
        clausulas_cubiertas: [],
        requisitos_detalle: [],
      }),
      id_certificado: normProc.id_certificado,
      nombre_proceso: normProc.nombre_proceso,
      tipo: normProc.tipo,
      responsable: normProc.responsable,
    };

    state.domainData.allCertificadosDetailed = state.domainData.allCertificadosDetailed.map((c) => {
      if (certChanged) {
        if (c.id === currentProceso.id_certificado) {
          return {
            ...c,
            procesos: c.procesos.filter((p) => p.id !== procesoId),
          };
        }
        if (c.id === normProc.id_certificado) {
          return {
            ...c,
            procesos: [...c.procesos, updatedProcEntity],
          };
        }
        return c;
      }
      if (c.id !== currentProceso.id_certificado) return c;
      return {
        ...c,
        procesos: c.procesos.map((p) => (p.id === procesoId ? updatedProcEntity : p)),
      };
    });

    state.domainData.processes = state.domainData.processes.map((p) =>
      p.id === procesoId
        ? {
            ...p,
            nombre_proceso: normProc.nombre_proceso,
            numero_certificado: targetCert.numero_certificado,
          }
        : p
    );

    state.domainData.programacionAudits = state.domainData.programacionAudits.map((aud) =>
      aud.id_certificado !== currentProceso.id_certificado
        ? aud
        : {
            ...aud,
            matrizNormativa: aud.matrizNormativa.map((item) =>
              item.proceso_nombre.trim().toLowerCase() ===
              currentProceso.nombre_proceso.trim().toLowerCase()
                ? { ...item, proceso_nombre: normProc.nombre_proceso }
                : item
            ),
          }
    );

    state.domainData.phase5Findings = state.domainData.phase5Findings.map((f) =>
      f.id_proceso === procesoId ||
      (f.numero_certificado === currentProceso.numero_certificado &&
        f.proceso_nombre.trim().toLowerCase() ===
          currentProceso.nombre_proceso.trim().toLowerCase())
        ? { ...f, proceso_nombre: normProc.nombre_proceso }
        : f
    );

    state.breadcrumbs = state.breadcrumbs.map((seg) =>
      seg.entityType === 'proceso' && seg.entityId === procesoId
        ? {
            ...seg,
            label: normProc.nombre_proceso,
            tooltip: `Certificado ${targetCert.numero_certificado} > Proceso ${normProc.nombre_proceso}`,
          }
        : seg
    );

    recordPhase5SessionLog('proceso', procesoId!, 'UPDATE', oldSnapshot, {
      id_certificado: normProc.id_certificado,
      nombre_proceso: normProc.nombre_proceso,
      tipo: normProc.tipo,
      responsable: normProc.responsable || null,
    });

    state.procesoDomain.isEditingAttributes = false;
    state.procesoDomain.formDraft = undefined;
    state.procesoDomain.editFormData = undefined;
    state.procesoDomain.editErrorMessage = null;
    showFloatingToast(
      'Atributos del proceso actualizados y registrados en Historial de Cambios.',
      'success'
    );
    render();
  });

  document.querySelectorAll<HTMLElement>('[data-action="open-archive-proceso"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!canArchiveRecord(state.profile)) return;
      const procesoId = state.procesoDomain.selectedProcesoId;
      if (!procesoId) return;
      const currentProceso = resolveProcesoDetailById({
        procesoId,
        certificates: state.domainData.allCertificadosDetailed,
        programacionAudits: state.domainData.programacionAudits,
        phase5Findings: state.domainData.phase5Findings,
        requirementsCatalog: state.domainData.requirementsCatalog,
        archivedProcesoIds: state.domainData.archivedProcesoIds,
      });
      if (!currentProceso) return;
      void openArchiveModal({
        tableName: 'proceso',
        recordId: currentProceso.id,
        entityTypeLabel: 'Proceso Certificado',
        recordTitle: currentProceso.nombre_proceso,
        recordSubtitle: `${currentProceso.tipo} · ${currentProceso.numero_certificado}`,
      });
    });
  });

  document.getElementById('cancelArchiveProcesoBtn')?.addEventListener('click', () => {
    state.procesoDomain.archiveConfirmOpen = false;
    state.procesoDomain.archiveErrorMessage = null;
    render();
  });

  document.getElementById('confirmArchiveProcesoBtn')?.addEventListener('click', () => {
    if (!isApprovedStaff()) return;
    const procesoId = state.procesoDomain.selectedProcesoId;
    if (!procesoId) return;

    const currentProceso = resolveProcesoDetailById({
      procesoId,
      certificates: state.domainData.allCertificadosDetailed,
      programacionAudits: state.domainData.programacionAudits,
      phase5Findings: state.domainData.phase5Findings,
      requirementsCatalog: state.domainData.requirementsCatalog,
      archivedProcesoIds: state.domainData.archivedProcesoIds,
    });
    if (!currentProceso) return;

    const guard = canArchiveProceso({
      associatedHallazgosCount: currentProceso.hallazgos.length,
      associatedAuditoriasCount: currentProceso.auditorias.length,
    });

    if (!guard.allowed) {
      state.procesoDomain.archiveConfirmOpen = false;
      state.procesoDomain.archiveErrorMessage =
        guard.reason || 'Este proceso tiene dependencias activas que impiden archivarlo.';
      render();
      return;
    }

    const reasonInput =
      (document.getElementById('archiveProcesoReasonInput') as HTMLInputElement | null)?.value.trim() ||
      'Archivo lógico solicitado desde ficha de proceso';
    const deletedAtIso = new Date().toISOString();

    state.domainData.archivedProcesoIds.add(procesoId);
    state.domainData.allCertificadosDetailed = state.domainData.allCertificadosDetailed.map((c) =>
      c.id === currentProceso.id_certificado
        ? { ...c, procesos: c.procesos.filter((p) => p.id !== procesoId) }
        : c
    );
    state.domainData.processes = state.domainData.processes.filter((p) => p.id !== procesoId);

    recordPhase5SessionLog(
      'proceso',
      procesoId,
      'UPDATE',
      {
        nombre_proceso: currentProceso.nombre_proceso,
        tipo: currentProceso.tipo,
        deleted_at: null,
      },
      {
        deleted_at: deletedAtIso,
        delete_reason: reasonInput,
      }
    );

    void (async () => {
      try {
        const { error } = await supabase.rpc('archive_record', {
          p_table: 'proceso',
          p_record_id: procesoId,
          p_reason: reasonInput,
        });
        if (error) {
          await supabase
            .from('proceso')
            .update({
              deleted_at: deletedAtIso,
              delete_reason: reasonInput,
            })
            .eq('id', procesoId);
        }
      } catch {
        // Optimistic reactive fallback preserved
      }
    })();

    state.procesoDomain.archiveConfirmOpen = false;
    backtrackToParentBreadcrumb();
    showFloatingToast(`Proceso "${currentProceso.nombre_proceso}" archivado lógicamente.`, 'success');
    render();
  });

  document
    .querySelectorAll<HTMLElement>('[data-action="toggle-assign-proceso-req"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!isApprovedStaff()) return;
        state.procesoDomain.isAssigningRequisito = !state.procesoDomain.isAssigningRequisito;
        render();
      });
    });

  document.getElementById('assignProcesoRequisitoForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!isApprovedStaff()) return;
    const procesoId = state.procesoDomain.selectedProcesoId;
    if (!procesoId) return;

    const currentProceso = resolveProcesoDetailById({
      procesoId,
      certificates: state.domainData.allCertificadosDetailed,
      programacionAudits: state.domainData.programacionAudits,
      phase5Findings: state.domainData.phase5Findings,
      requirementsCatalog: state.domainData.requirementsCatalog,
      archivedProcesoIds: state.domainData.archivedProcesoIds,
    });
    if (!currentProceso) return;

    const reqId =
      (document.getElementById('assignProcesoReqSelect') as HTMLSelectElement | null)?.value || '';
    const scopedReqs = getScopedNormaRequirements({
      id_norma: currentProceso.id_norma,
      norma_codigo: currentProceso.norma_codigo,
      requirementsCatalog:
        state.domainData.requirementsCatalog.length > 0
          ? state.domainData.requirementsCatalog
          : getAllSeededNormaRequirements(),
    });
    const req = scopedReqs.find((r) => r.id === reqId);
    if (!req) return;

    const linkGuard = canLinkRequisitoToProceso({
      proceso: currentProceso,
      requisito: req,
    });
    if (!linkGuard.allowed) {
      showFloatingToast(
        linkGuard.reason || 'No es posible vincular esta cláusula al proceso.',
        'warning'
      );
      render();
      return;
    }

    state.domainData.allCertificadosDetailed = state.domainData.allCertificadosDetailed.map((c) => {
      if (c.id !== currentProceso.id_certificado) return c;
      return {
        ...c,
        procesos: c.procesos.map((p) => {
          if (p.id !== procesoId) return p;
          const nextCodes = p.clausulas_cubiertas.includes(req.codigo)
            ? p.clausulas_cubiertas
            : [...p.clausulas_cubiertas, req.codigo];
          const existingDetails = p.requisitos_detalle || [];
          const hasDetail = existingDetails.some(
            (d) => d.codigo.trim().toLowerCase() === req.codigo.trim().toLowerCase()
          );
          const nextDetails = hasDetail
            ? existingDetails
            : [...existingDetails, { codigo: req.codigo, titulo: req.titulo }];
          return {
            ...p,
            clausulas_cubiertas: nextCodes,
            requisitos_detalle: nextDetails,
          };
        }),
      };
    });

    state.domainData.processes = state.domainData.processes.map((p) =>
      p.id === procesoId
        ? {
            ...p,
            clausulas_cubiertas: p.clausulas_cubiertas.includes(req.codigo)
              ? p.clausulas_cubiertas
              : [...p.clausulas_cubiertas, req.codigo],
          }
        : p
    );

    recordPhase5SessionLog('proceso', procesoId, 'UPDATE', null, {
      accion: 'VINCULAR_REQUISITO',
      clausula: req.codigo,
      titulo: req.titulo,
      ruta_ltree: req.ruta_materializada,
    });

    state.procesoDomain.isAssigningRequisito = false;
    showFloatingToast(
      `Cláusula ${req.codigo} (${req.titulo}) vinculada a "${currentProceso.nombre_proceso}".`,
      'success'
    );

    if (STRICT_UUID_PATTERN.test(procesoId) && STRICT_UUID_PATTERN.test(req.id)) {
      const catalogSnapshot =
        state.domainData.requirementsCatalog.length > 0
          ? state.domainData.requirementsCatalog
          : getAllSeededNormaRequirements();

      const ensureRequisitoInDb = async (
        targetReq: RequisitoLtree,
        visited = new Set<string>()
      ): Promise<string> => {
        if (visited.has(targetReq.id)) return targetReq.id;
        visited.add(targetReq.id);

        const knownLoaded = state.domainData.requirements.find(
          (r) =>
            r.id === targetReq.id ||
            (r.norma.trim().toLowerCase() === targetReq.norma_codigo.trim().toLowerCase() &&
              r.codigo.trim().toLowerCase() === targetReq.codigo.trim().toLowerCase())
        );
        if (knownLoaded && STRICT_UUID_PATTERN.test(knownLoaded.id)) {
          return knownLoaded.id;
        }

        const { data: existingRow } = await supabase
          .from('requisito')
          .select('id')
          .eq('id_norma', targetReq.id_norma)
          .eq('codigo', targetReq.codigo)
          .is('deleted_at', null)
          .maybeSingle();

        if (existingRow?.id) {
          return String(existingRow.id);
        }

        let resolvedParentId: string | null = null;
        if (
          targetReq.id_requisito_padre &&
          STRICT_UUID_PATTERN.test(targetReq.id_requisito_padre)
        ) {
          const parentCatalog = catalogSnapshot.find(
            (r) => r.id === targetReq.id_requisito_padre
          );
          if (parentCatalog) {
            resolvedParentId = await ensureRequisitoInDb(parentCatalog, visited);
          }
        }

        const { data: insertedRow, error: insertReqErr } = await supabase
          .from('requisito')
          .upsert(
            {
              id: targetReq.id,
              id_norma: targetReq.id_norma,
              id_requisito_padre: resolvedParentId,
              codigo: targetReq.codigo,
              ruta_materializada: targetReq.ruta_materializada,
            },
            { onConflict: 'id', ignoreDuplicates: true }
          )
          .select('id')
          .maybeSingle();

        if (!insertReqErr && insertedRow?.id) {
          state.domainData.requirements = [
            ...state.domainData.requirements,
            {
              id: String(insertedRow.id),
              codigo: targetReq.codigo,
              ruta_materializada: targetReq.ruta_materializada,
              norma: targetReq.norma_codigo,
            },
          ];
          return String(insertedRow.id);
        }

        const { data: retryRow } = await supabase
          .from('requisito')
          .select('id')
          .eq('id_norma', targetReq.id_norma)
          .eq('codigo', targetReq.codigo)
          .is('deleted_at', null)
          .maybeSingle();

        return retryRow?.id ? String(retryRow.id) : targetReq.id;
      };

      void (async () => {
        try {
          const dbReqId = await ensureRequisitoInDb(req);
          await supabase.from('requisitos_por_proceso').upsert(
            {
              id_proceso: procesoId,
              id_requisito: dbReqId,
            },
            { onConflict: 'id_proceso,id_requisito', ignoreDuplicates: true }
          );
        } catch {
          // Optimistic reactive fallback preserved
        }
      })();
    }

    render();
  });

  document.getElementById('unassignProcesoRequisitoForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!isApprovedStaff()) return;
    const procesoId = state.procesoDomain.selectedProcesoId;
    const selectEl = document.getElementById('unassignProcesoReqSelect') as HTMLSelectElement | null;
    const reqCodigo = (selectEl?.value || '').trim();
    const selectedOpt = selectEl?.selectedOptions?.[0];
    const reqId = (selectedOpt?.dataset.reqId || '').trim();
    if (!procesoId || !reqCodigo) return;

    const currentProceso = resolveProcesoDetailById({
      procesoId,
      certificates: state.domainData.allCertificadosDetailed,
      programacionAudits: state.domainData.programacionAudits,
      phase5Findings: state.domainData.phase5Findings,
      requirementsCatalog: state.domainData.requirementsCatalog,
      archivedProcesoIds: state.domainData.archivedProcesoIds,
    });
    if (!currentProceso) return;

    const cleanTargetCode = reqCodigo.toLowerCase();
    state.domainData.allCertificadosDetailed = state.domainData.allCertificadosDetailed.map((c) => {
      if (c.id !== currentProceso.id_certificado) return c;
      return {
        ...c,
        procesos: c.procesos.map((p) => {
          if (p.id !== procesoId) return p;
          return {
            ...p,
            clausulas_cubiertas: p.clausulas_cubiertas.filter(
              (code) => code.trim().toLowerCase() !== cleanTargetCode
            ),
            requisitos_detalle: (p.requisitos_detalle || []).filter(
              (d) => d.codigo.trim().toLowerCase() !== cleanTargetCode
            ),
          };
        }),
      };
    });

    state.domainData.processes = state.domainData.processes.map((p) =>
      p.id === procesoId
        ? {
            ...p,
            clausulas_cubiertas: p.clausulas_cubiertas.filter(
              (code) => code.trim().toLowerCase() !== cleanTargetCode
            ),
          }
        : p
    );

    recordPhase5SessionLog(
      'proceso',
      procesoId,
      'UPDATE',
      { clausula_vinculada: reqCodigo },
      { accion: 'DESVINCULAR_REQUISITO', clausula: reqCodigo }
    );

    showFloatingToast(
      `Cláusula ${reqCodigo} desvinculada de "${currentProceso.nombre_proceso}".`,
      'success'
    );

    if (STRICT_UUID_PATTERN.test(procesoId)) {
      void (async () => {
        try {
          let targetReqId = reqId;
          if (!STRICT_UUID_PATTERN.test(targetReqId) || !state.domainData.requirements.some((r) => r.id === targetReqId)) {
            const { data: matchedDbReq } = await supabase
              .from('requisito')
              .select('id')
              .eq('id_norma', currentProceso.id_norma)
              .eq('codigo', reqCodigo)
              .is('deleted_at', null)
              .maybeSingle();
            if (matchedDbReq?.id) {
              targetReqId = String(matchedDbReq.id);
            }
          }
          if (STRICT_UUID_PATTERN.test(targetReqId)) {
            await supabase
              .from('requisitos_por_proceso')
              .delete()
              .match({ id_proceso: procesoId, id_requisito: targetReqId });
          }
        } catch {
          // Optimistic reactive fallback preserved
        }
      })();
    }

    render();
  });

  document
    .querySelectorAll<HTMLElement>('[data-action="select-proceso-requisito"]')
    .forEach((row) => {
      row.addEventListener('click', (e) => {
        const target = e.target as HTMLElement | null;
        if (target?.closest('button, a, input, select')) return;

        const reqId = (row.dataset.requisitoId || '').trim();
        const normaId = (row.dataset.normaId || '').trim();
        const codigo = (row.dataset.codigo || '').trim();

        const allCatalogReqs = [
          ...state.domainData.requirementsCatalog,
          ...getAllSeededNormaRequirements(),
        ];
        const matchedReq =
          allCatalogReqs.find((r) => r.id === reqId) ||
          allCatalogReqs.find(
            (r) =>
              (normaId ? r.id_norma === normaId : true) &&
              codigo !== '' &&
              r.codigo.trim().toLowerCase() === codigo.toLowerCase()
          );

        const resolvedReqId = matchedReq?.id || reqId;
        if (!resolvedReqId) return;
        clearAllEntitySelections();
        state.activeRoute = 'extra';
        state.activeSubSection = 'standards';
        state.extraDomain.selectedRequisitoId = resolvedReqId;
        state.extraDomain.activeRequisitoTab = 'subrequisitos';

        state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
          id: `requisito-${resolvedReqId}`,
          label: matchedReq ? `Cláusula ${matchedReq.codigo}` : `Cláusula ${codigo || 'ISO'}`,
          route: 'extra',
          subview: 'standards',
          entityType: 'requisito',
          entityId: resolvedReqId,
          parentEntityId: matchedReq?.id_requisito_padre || matchedReq?.id_norma || normaId || null,
          tab: 'subrequisitos',
          tooltip: matchedReq
            ? `${matchedReq.norma_codigo} · Cláusula ${matchedReq.codigo}`
            : `Requisito Normativo > ${codigo || resolvedReqId}`,
        });
        syncUrlHash('extra', 'standards');
        render();
      });
    });

  // --- Turno Detail View Navigation & Actions (Step 4.1 Canonical CRUD) ---
  const navigateToTurnoDetail = (turnoId: string, originatingSitioId: string | null): void => {
    if (!turnoId) return;
    if (
      !canAccessRoute(state.profile, 'certificacion') &&
      !(state.profile?.role === 'AUDITOR' && state.profile?.status === 'APPROVED')
    ) {
      return;
    }

    const resolvedTurno = resolveTurnoDetailById({
      turnoId,
      originatingSitioId,
      certificates: state.domainData.allCertificadosDetailed,
      programacionAudits: state.domainData.programacionAudits,
      shiftCatalog: state.domainData.shiftCatalog,
      archivedSiteIds: state.domainData.archivedSiteIds,
      archivedTurnoIds: state.domainData.archivedTurnoIds,
    });
    if (!resolvedTurno) return;

    clearAllEntitySelections();
    state.activeRoute = 'certificacion';
    state.activeSubSection = 'certificates';
    state.turnoDomain.selectedTurnoId = turnoId;
    state.turnoDomain.originatingSitioId = originatingSitioId;
    state.turnoDomain.activeChildTab = 'sitios';
    state.turnoDomain.isCreating = false;
    state.turnoDomain.isEditingAttributes = false;
    state.turnoDomain.formDraft = undefined;
    state.turnoDomain.editErrorMessage = null;

    const labelRange = `${formatTurnoTime(resolvedTurno.hora_entrada)} – ${formatTurnoTime(resolvedTurno.hora_salida)}`;
    state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
      id: `turno-${turnoId}`,
      label: `Turno ${labelRange}`,
      route: 'certificacion',
      subview: 'certificates',
      entityType: 'turno',
      entityId: turnoId,
      originatingSitioId,
      tab: 'sitios',
      tooltip: resolvedTurno.parentSitio
        ? `Sitio ${resolvedTurno.parentSitio.numero_sitio} > Turno ${labelRange} (${resolvedTurno.descripcion})`
        : `Turno ${labelRange} (${resolvedTurno.descripcion})`,
    });
    syncUrlHash('certificacion', 'certificates');
    render();
  };

  document
    .querySelectorAll<HTMLElement>('[data-action="open-create-turno"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!isApprovedStaff()) return;
        const certId = btn.dataset.certId || state.certificadoDomain.selectedCertId || null;
        if (state.certificadoDomain.selectedCertId) {
          syncCurrentBreadcrumbTab('turnos');
        }
        const cert = certId
          ? state.domainData.allCertificadosDetailed.find((c) => c.id === certId)
          : undefined;
        const activeCertSites = cert
          ? cert.sitios.filter((s) => !state.domainData.archivedSiteIds.has(s.id))
          : [];
        const defaultSitioId = activeCertSites.length === 1 ? activeCertSites[0].id : '';

        clearAllEntitySelections();
        state.activeRoute = 'certificacion';
        state.activeSubSection = 'certificates';
        state.turnoDomain = {
          selectedTurnoId: null,
          originatingSitioId: null,
          activeChildTab: 'sitios',
          isCreating: true,
          prefillCertId: certId,
          prefillSitioId: defaultSitioId || null,
          isEditingAttributes: false,
          formDraft: createEmptyTurnoFormDraft(defaultSitioId),
          editErrorMessage: null,
          archiveConfirmOpen: false,
          archiveErrorMessage: null,
          childSortState: state.turnoDomain.childSortState,
        };

        state.breadcrumbs = pushBreadcrumb(
          state.breadcrumbs,
          createNewEntityBreadcrumbSegment({
            entityType: 'turno',
            label: 'Nuevo Turno',
            route: 'certificacion',
            subview: 'certificates',
            parentEntityId: certId || undefined,
            tooltip: cert
              ? `Certificado ${cert.numero_certificado} > Nuevo Turno`
              : 'Nuevo Turno Operativo',
          })
        );
        syncUrlHash('certificacion', 'certificates');
        render();
      });
    });

  document.querySelectorAll<HTMLElement>('[data-action="select-turno"]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (el.tagName === 'TR') {
        const target = e.target as HTMLElement | null;
        if (target?.closest('button, a, input, select')) return;
      } else {
        e.stopPropagation();
      }
      const turnoId = el.dataset.turnoId;
      const originatingSitioId = el.dataset.sitioId || null;
      if (turnoId) navigateToTurnoDetail(turnoId, originatingSitioId);
    });
  });

  document.querySelectorAll<HTMLElement>('[data-action="select-turno-preview"]').forEach((row) => {
    row.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('button, a, input, select')) return;
      const turnoId = row.dataset.turnoId;
      const originatingSitioId = row.dataset.sitioId || null;
      if (turnoId) navigateToTurnoDetail(turnoId, originatingSitioId);
    });
  });

  document.querySelectorAll<HTMLElement>('[data-action="back-from-turno"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.navBack === 'true') return;
      backtrackToParentBreadcrumb();
      render();
    });
  });

  document.querySelectorAll<HTMLElement>('[data-turno-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.turnoTab as TurnoChildTab | undefined;
      if (tab === 'sitios' || tab === 'auditorias') {
        state.turnoDomain.activeChildTab = tab;
        syncCurrentBreadcrumbTab(tab);
        render();
      }
    });
  });

  document
    .querySelectorAll<HTMLElement>('[data-resizable-table^="turno-tab-"] [data-action="sort-column"]')
    .forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tableEl = btn.closest<HTMLElement>('[data-resizable-table]');
        const tableId = tableEl?.dataset.resizableTable || '';
        const col = btn.dataset.sortCol;
        if (!col || !tableId.startsWith('turno-tab-')) return;
        const tab = tableId.replace('turno-tab-', '') as TurnoChildTab;
        const current = state.turnoDomain.childSortState?.[tab] || {
          column: null,
          direction: 'none' as const,
        };
        const next: SortState =
          current.column === col
            ? { column: col, direction: cycleSortDirection(current.direction) }
            : { column: col, direction: 'asc' };
        state.turnoDomain.childSortState = {
          ...(state.turnoDomain.childSortState || {}),
          [tab]: next,
        };
        render();
      });
    });

  const syncTurnoFormDraftFromDom = (): TurnoFormDraft => {
    const entradaInput = document.getElementById('editTurnoEntradaInput') as HTMLInputElement | null;
    const salidaInput = document.getElementById('editTurnoSalidaInput') as HTMLInputElement | null;
    const descInput = document.getElementById('editTurnoDescripcionInput') as HTMLInputElement | null;
    const sitioSelect = document.getElementById('turnoParentSitioSelect') as HTMLSelectElement | null;
    const nextDraft: TurnoFormDraft = {
      hora_entrada: entradaInput?.value.trim() || state.turnoDomain.formDraft?.hora_entrada || '08:00',
      hora_salida: salidaInput?.value.trim() || state.turnoDomain.formDraft?.hora_salida || '16:00',
      descripcion: descInput?.value ?? state.turnoDomain.formDraft?.descripcion ?? '',
      id_sitio:
        sitioSelect?.value ??
        state.turnoDomain.formDraft?.id_sitio ??
        state.turnoDomain.prefillSitioId ??
        '',
    };
    state.turnoDomain.formDraft = nextDraft;
    return nextDraft;
  };

  document.getElementById('turnoParentSitioSelect')?.addEventListener('change', () => {
    syncTurnoFormDraftFromDom();
  });
  document.getElementById('editTurnoEntradaInput')?.addEventListener('change', () => {
    syncTurnoFormDraftFromDom();
    render();
  });
  document.getElementById('editTurnoSalidaInput')?.addEventListener('change', () => {
    syncTurnoFormDraftFromDom();
    render();
  });
  document.getElementById('editTurnoDescripcionInput')?.addEventListener('input', () => {
    syncTurnoFormDraftFromDom();
  });

  document.getElementById('startEditTurnoBtn')?.addEventListener('click', () => {
    if (!isApprovedStaff()) return;
    const turnoId = state.turnoDomain.selectedTurnoId;
    if (!turnoId) return;
    const currentTurno = resolveTurnoDetailById({
      turnoId,
      originatingSitioId: state.turnoDomain.originatingSitioId,
      certificates: state.domainData.allCertificadosDetailed,
      programacionAudits: state.domainData.programacionAudits,
      shiftCatalog: state.domainData.shiftCatalog,
      archivedSiteIds: state.domainData.archivedSiteIds,
      archivedTurnoIds: state.domainData.archivedTurnoIds,
    });
    if (!currentTurno) return;

    state.turnoDomain.isCreating = false;
    state.turnoDomain.isEditingAttributes = true;
    state.turnoDomain.archiveConfirmOpen = false;
    state.turnoDomain.editErrorMessage = null;
    state.turnoDomain.archiveErrorMessage = null;
    state.turnoDomain.formDraft = createTurnoFormDraftFromEntity(currentTurno);
    state.turnoDomain.editFormData = {
      hora_entrada: formatTurnoTime(currentTurno.hora_entrada),
      hora_salida: formatTurnoTime(currentTurno.hora_salida),
      descripcion: currentTurno.descripcion,
    };
    render();
  });

  const cancelTurnoEdit = (): void => {
    if (state.turnoDomain.isCreating) {
      backtrackToParentBreadcrumb();
      render();
      return;
    }
    state.turnoDomain.isEditingAttributes = false;
    state.turnoDomain.formDraft = undefined;
    state.turnoDomain.editFormData = undefined;
    state.turnoDomain.editErrorMessage = null;
    render();
  };
  document.getElementById('cancelEditTurnoBtn')?.addEventListener('click', cancelTurnoEdit);

  document.getElementById('editTurnoForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isApprovedStaff()) return;

    const isCreating = Boolean(state.turnoDomain.isCreating);
    const turnoId = state.turnoDomain.selectedTurnoId;
    if (!isCreating && !turnoId) return;

    const draft = syncTurnoFormDraftFromDom();
    const validation = validateTurnoFormDraft(draft);
    if (!validation.valid || !validation.normalized) {
      state.turnoDomain.editErrorMessage =
        validation.error || 'No se pudieron validar los horarios del turno.';
      render();
      return;
    }

    const normTurno = validation.normalized;
    const duplicateTurno = state.domainData.shiftCatalog.find(
      (t) =>
        !state.domainData.archivedTurnoIds.has(t.id) &&
        t.id !== turnoId &&
        formatTurnoTime(t.hora_entrada) === formatTurnoTime(normTurno.hora_entrada) &&
        formatTurnoTime(t.hora_salida) === formatTurnoTime(normTurno.hora_salida)
    );
    if (duplicateTurno) {
      state.turnoDomain.editErrorMessage = `Ya existe un turno activo con horario ${formatTurnoTime(normTurno.hora_entrada)} – ${formatTurnoTime(normTurno.hora_salida)}.`;
      render();
      return;
    }

    if (isCreating) {
      const newId = crypto.randomUUID();
      try {
        const { error } = await supabase.from('turno').insert({
          id: newId,
          hora_entrada: normTurno.hora_entrada,
          hora_salida: normTurno.hora_salida,
        });
        if (error && !isMissingTableOrSchemaError(error)) {
          state.turnoDomain.editErrorMessage = translateDatabaseError(error);
          render();
          return;
        }
      } catch {
        // Offline / local mode fallback preserved
      }

      const selectedSitioId = (draft.id_sitio || '').trim();
      if (selectedSitioId && STRICT_UUID_PATTERN.test(selectedSitioId)) {
        try {
          await supabase.from('turnos_por_sitio').insert({
            id_sitio: selectedSitioId,
            id_turno: newId,
          });
        } catch {
          // Reactive link preserved below
        }
      }

      let linkedSitioName: string | null = null;
      if (selectedSitioId) {
        state.domainData.allCertificadosDetailed = state.domainData.allCertificadosDetailed.map(
          (cert) => {
            const targetSite = cert.sitios.find((s) => s.id === selectedSitioId);
            if (!targetSite) return cert;
            linkedSitioName = targetSite.nombre_sitio;
            const nextSitios = cert.sitios.map((s) =>
              s.id === selectedSitioId
                ? {
                    ...s,
                    turnos_vinculados: Array.from(
                      new Set([...(s.turnos_vinculados || []), normTurno.descripcion])
                    ),
                  }
                : s
            );
            const nextTurnos = [
              ...cert.turnos,
              {
                id: newId,
                hora_entrada: normTurno.hora_entrada,
                hora_salida: normTurno.hora_salida,
                descripcion: normTurno.descripcion,
                sitios_vinculados: [targetSite.nombre_sitio],
              },
            ];
            return {
              ...cert,
              sitios: nextSitios,
              turnos: nextTurnos,
            };
          }
        );
      }

      const newShiftCatalogItem = {
        id: newId,
        hora_entrada: normTurno.hora_entrada,
        hora_salida: normTurno.hora_salida,
        descripcion: normTurno.descripcion,
      };
      state.domainData.shiftCatalog = [newShiftCatalogItem, ...state.domainData.shiftCatalog];
      state.domainData.shifts = [
        {
          id: newId,
          hora_entrada: normTurno.hora_entrada,
          hora_salida: normTurno.hora_salida,
          descripcion: normTurno.descripcion,
          sitios_vinculados: linkedSitioName ? [linkedSitioName] : [],
        },
        ...state.domainData.shifts,
      ];

      const labelRange = `${formatTurnoTime(normTurno.hora_entrada)} – ${formatTurnoTime(normTurno.hora_salida)}`;
      const nextSegment = {
        id: `turno-${newId}`,
        label: `Turno ${labelRange}`,
        route: 'certificacion' as const,
        subview: 'certificates' as const,
        entityType: 'turno' as const,
        entityId: newId,
        originatingSitioId: selectedSitioId || null,
        tab: 'sitios',
        tooltip: linkedSitioName
          ? `${linkedSitioName} > Turno ${labelRange} (${normTurno.descripcion})`
          : `Turno ${labelRange} (${normTurno.descripcion})`,
      };
      state.breadcrumbs = state.breadcrumbs.some((seg) => seg.id === 'turno-new')
        ? state.breadcrumbs.map((seg) => (seg.id === 'turno-new' ? nextSegment : seg))
        : pushBreadcrumb(state.breadcrumbs, nextSegment);

      recordPhase5SessionLog('turno', newId, 'INSERT', null, {
        hora_entrada: normTurno.hora_entrada,
        hora_salida: normTurno.hora_salida,
        descripcion: normTurno.descripcion,
        ...(selectedSitioId ? { id_sitio: selectedSitioId } : {}),
      });

      state.turnoDomain.selectedTurnoId = newId;
      state.turnoDomain.originatingSitioId = selectedSitioId || null;
      state.turnoDomain.activeChildTab = 'sitios';
      state.turnoDomain.isCreating = false;
      state.turnoDomain.isEditingAttributes = false;
      state.turnoDomain.prefillCertId = null;
      state.turnoDomain.prefillSitioId = null;
      state.turnoDomain.formDraft = undefined;
      state.turnoDomain.editFormData = undefined;
      state.turnoDomain.editErrorMessage = null;
      showFloatingToast('Turno operativo creado correctamente.', 'success');
      syncUrlHash('certificacion', 'certificates');
      render();
      return;
    }

    const currentTurno = resolveTurnoDetailById({
      turnoId: turnoId!,
      originatingSitioId: state.turnoDomain.originatingSitioId,
      certificates: state.domainData.allCertificadosDetailed,
      programacionAudits: state.domainData.programacionAudits,
      shiftCatalog: state.domainData.shiftCatalog,
      archivedSiteIds: state.domainData.archivedSiteIds,
      archivedTurnoIds: state.domainData.archivedTurnoIds,
    });
    if (!currentTurno) return;

    if (STRICT_UUID_PATTERN.test(turnoId!)) {
      try {
        const { error } = await supabase
          .from('turno')
          .update({
            hora_entrada: normTurno.hora_entrada,
            hora_salida: normTurno.hora_salida,
            updated_at: new Date().toISOString(),
          })
          .eq('id', turnoId!);
        if (error && !isMissingTableOrSchemaError(error)) {
          state.turnoDomain.editErrorMessage = translateDatabaseError(error);
          render();
          return;
        }
      } catch {
        // Optimistic reactive fallback preserved when offline
      }
    }

    const oldSnapshot = {
      hora_entrada: currentTurno.hora_entrada,
      hora_salida: currentTurno.hora_salida,
      descripcion: currentTurno.descripcion,
    };

    state.domainData.shiftCatalog = state.domainData.shiftCatalog.map((t) =>
      t.id === turnoId
        ? {
            ...t,
            hora_entrada: normTurno.hora_entrada,
            hora_salida: normTurno.hora_salida,
            descripcion: normTurno.descripcion,
          }
        : t
    );

    state.domainData.shifts = state.domainData.shifts.map((s) =>
      s.id === turnoId
        ? {
            ...s,
            hora_entrada: normTurno.hora_entrada,
            hora_salida: normTurno.hora_salida,
            descripcion: normTurno.descripcion,
          }
        : s
    );

    state.domainData.allCertificadosDetailed = state.domainData.allCertificadosDetailed.map((c) => ({
      ...c,
      turnos: c.turnos.map((t) =>
        t.id === turnoId
          ? {
              ...t,
              hora_entrada: normTurno.hora_entrada,
              hora_salida: normTurno.hora_salida,
              descripcion: normTurno.descripcion,
            }
          : t
      ),
      sitios: c.sitios.map((s) => ({
        ...s,
        turnos_vinculados: (s.turnos_vinculados || []).map((lbl) =>
          lbl.trim().toLowerCase() === currentTurno.descripcion.trim().toLowerCase()
            ? normTurno.descripcion
            : lbl
        ),
      })),
    }));

    const labelRange = `${formatTurnoTime(normTurno.hora_entrada)} – ${formatTurnoTime(normTurno.hora_salida)}`;
    state.breadcrumbs = state.breadcrumbs.map((seg) =>
      seg.entityType === 'turno' && seg.entityId === turnoId
        ? {
            ...seg,
            label: `Turno ${labelRange}`,
            tooltip: currentTurno.parentSitio
              ? `Sitio ${currentTurno.parentSitio.numero_sitio} > Turno ${labelRange} (${normTurno.descripcion})`
              : `Turno ${labelRange} (${normTurno.descripcion})`,
          }
        : seg
    );

    recordPhase5SessionLog('turno', turnoId!, 'UPDATE', oldSnapshot, {
      hora_entrada: normTurno.hora_entrada,
      hora_salida: normTurno.hora_salida,
      descripcion: normTurno.descripcion,
    });

    state.turnoDomain.isEditingAttributes = false;
    state.turnoDomain.formDraft = undefined;
    state.turnoDomain.editFormData = undefined;
    state.turnoDomain.editErrorMessage = null;
    showFloatingToast('Horario del turno guardado y registrado en Historial de Cambios.', 'success');
    render();
  });

  document.querySelectorAll<HTMLElement>('[data-action="open-archive-turno"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!canArchiveRecord(state.profile)) return;
      const turnoId = state.turnoDomain.selectedTurnoId;
      if (!turnoId) return;
      const currentTurno = resolveTurnoDetailById({
        turnoId,
        originatingSitioId: state.turnoDomain.originatingSitioId,
        certificates: state.domainData.allCertificadosDetailed,
        programacionAudits: state.domainData.programacionAudits,
        shiftCatalog: state.domainData.shiftCatalog,
        archivedSiteIds: state.domainData.archivedSiteIds,
        archivedTurnoIds: state.domainData.archivedTurnoIds,
      });
      if (!currentTurno) return;
      void openArchiveModal({
        tableName: 'turno',
        recordId: currentTurno.id,
        entityTypeLabel: 'Turno Operativo',
        recordTitle: `${formatTurnoTime(currentTurno.hora_entrada)} – ${formatTurnoTime(currentTurno.hora_salida)}`,
        recordSubtitle: currentTurno.descripcion || null,
      });
    });
  });

  document.getElementById('cancelArchiveTurnoBtn')?.addEventListener('click', () => {
    state.turnoDomain.archiveConfirmOpen = false;
    state.turnoDomain.archiveErrorMessage = null;
    render();
  });

  document.getElementById('confirmArchiveTurnoBtn')?.addEventListener('click', () => {
    if (!isApprovedStaff()) return;
    const turnoId = state.turnoDomain.selectedTurnoId;
    if (!turnoId) return;

    const currentTurno = resolveTurnoDetailById({
      turnoId,
      originatingSitioId: state.turnoDomain.originatingSitioId,
      certificates: state.domainData.allCertificadosDetailed,
      programacionAudits: state.domainData.programacionAudits,
      shiftCatalog: state.domainData.shiftCatalog,
      archivedSiteIds: state.domainData.archivedSiteIds,
      archivedTurnoIds: state.domainData.archivedTurnoIds,
    });
    if (!currentTurno) return;

    const guard = canArchiveTurno({
      assignedSitiosCount: currentTurno.sitios.length,
    });

    if (!guard.allowed) {
      state.turnoDomain.archiveConfirmOpen = false;
      state.turnoDomain.archiveErrorMessage =
        guard.reason || 'Este turno está asignado a sedes activas y no puede archivarse.';
      render();
      return;
    }

    const reasonInput =
      (document.getElementById('archiveTurnoReasonInput') as HTMLInputElement | null)?.value.trim() ||
      'Archivo lógico solicitado desde ficha de turno';
    const deletedAtIso = new Date().toISOString();

    state.domainData.archivedTurnoIds.add(turnoId);
    state.domainData.shiftCatalog = state.domainData.shiftCatalog.filter((t) => t.id !== turnoId);
    state.domainData.shifts = state.domainData.shifts.filter((s) => s.id !== turnoId);

    recordPhase5SessionLog(
      'turno',
      turnoId,
      'UPDATE',
      {
        hora_entrada: currentTurno.hora_entrada,
        hora_salida: currentTurno.hora_salida,
        deleted_at: null,
      },
      {
        deleted_at: deletedAtIso,
        delete_reason: reasonInput,
      }
    );

    void (async () => {
      try {
        const { error } = await supabase.rpc('archive_record', {
          p_table: 'turno',
          p_record_id: turnoId,
          p_reason: reasonInput,
        });
        if (error) {
          await supabase
            .from('turno')
            .update({
              deleted_at: deletedAtIso,
              delete_reason: reasonInput,
            })
            .eq('id', turnoId);
        }
      } catch {
        // Optimistic reactive fallback preserved
      }
    })();

    state.turnoDomain.archiveConfirmOpen = false;
    backtrackToParentBreadcrumb();
    render();
  });

  // 12d. Fecha Detail View Event Handlers (Step 4.3 unified 3-mode)
  document.querySelectorAll<HTMLElement>('[data-action="open-create-fecha"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!isApprovedStaff()) return;
      const certId = btn.dataset.certId || state.certificadoDomain.selectedCertId || null;
      if (state.certificadoDomain.selectedCertId) {
        syncCurrentBreadcrumbTab('fechas');
      }
      const cert = certId
        ? state.domainData.allCertificadosDetailed.find((c) => c.id === certId)
        : undefined;

      clearAllEntitySelections();
      state.activeRoute = 'certificacion';
      state.activeSubSection = 'certificates';
      state.fechaDomain = {
        selectedFechaId: null,
        originatingCertId: certId,
        isCreating: true,
        isEditingAttributes: false,
        formDraft: createEmptyFechaFormDraft(certId),
        editFormData: undefined,
        editErrorMessage: null,
      };
      state.breadcrumbs = pushBreadcrumb(
        state.breadcrumbs,
        createNewEntityBreadcrumbSegment({
          entityType: 'fecha_certificado',
          label: 'Nueva Fecha',
          route: 'certificacion',
          subview: 'certificates',
          parentEntityId: certId || undefined,
          tooltip: cert
            ? `Certificado ${cert.numero_certificado} > Nueva Fecha`
            : 'Nueva Fecha de Certificado',
        })
      );
      syncUrlHash('certificacion', 'certificates');
      render();
    });
  });

  const readFechaFormDraftFromDom = (): FechaFormDraft => {
    const certSelect = document.getElementById('fechaSelectCertificado') as HTMLSelectElement | null;
    const tipoSelect = document.getElementById('editFechaTipoSelect') as HTMLSelectElement | null;
    const dateInput = document.getElementById('editFechaDateInput') as HTMLInputElement | null;
    return {
      id_certificado: certSelect?.value ?? state.fechaDomain.formDraft?.id_certificado ?? '',
      tipo_fecha: tipoSelect?.value ?? state.fechaDomain.formDraft?.tipo_fecha ?? 'Otorgamiento',
      fecha: dateInput?.value ?? state.fechaDomain.formDraft?.fecha ?? '',
    };
  };

  document.getElementById('fechaSelectCertificado')?.addEventListener('change', () => {
    state.fechaDomain.formDraft = readFechaFormDraftFromDom();
    state.fechaDomain.editErrorMessage = null;
    render();
  });

  document.getElementById('startEditFechaBtn')?.addEventListener('click', () => {
    if (!isApprovedStaff()) return;
    const fechaId = state.fechaDomain.selectedFechaId;
    if (!fechaId) return;
    const currentFecha = resolveFechaDetailById({
      fechaId,
      certificates: state.domainData.allCertificadosDetailed,
      archivedFechaIds: state.domainData.archivedFechaIds,
    });
    if (!currentFecha) return;
    state.fechaDomain.isCreating = false;
    state.fechaDomain.isEditingAttributes = true;
    state.fechaDomain.editErrorMessage = null;
    state.fechaDomain.formDraft = createFechaFormDraftFromEntity(currentFecha);
    render();
  });

  document.getElementById('cancelEditFechaBtn')?.addEventListener('click', () => {
    if (state.fechaDomain.isCreating) {
      backtrackToParentBreadcrumb();
      render();
      return;
    }
    state.fechaDomain.isEditingAttributes = false;
    state.fechaDomain.formDraft = undefined;
    state.fechaDomain.editFormData = undefined;
    state.fechaDomain.editErrorMessage = null;
    render();
  });

  document.getElementById('fechaDetailForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isApprovedStaff()) return;
    const isCreating = Boolean(state.fechaDomain.isCreating);
    const fechaId = state.fechaDomain.selectedFechaId;
    if (!isCreating && !fechaId) return;

    const draft = readFechaFormDraftFromDom();
    state.fechaDomain.formDraft = draft;

    const targetCert = state.domainData.allCertificadosDetailed.find(
      (c) => c.id === draft.id_certificado
    );
    if (!targetCert) {
      state.fechaDomain.editErrorMessage =
        'Seleccione un certificado de conformidad válido para la fecha.';
      render();
      return;
    }

    const validation = validateFechaInput({
      tipo_fecha: draft.tipo_fecha,
      fecha: draft.fecha,
      existingFechas: (targetCert.fechas || []).filter(
        (f) => !state.domainData.archivedFechaIds.has(f.id)
      ),
      currentFechaId: isCreating ? null : fechaId,
    });

    if (!validation.ok) {
      state.fechaDomain.editErrorMessage = validation.error;
      render();
      return;
    }

    const { tipo_fecha, fecha } = validation.value;

    if (isCreating) {
      const newFechaId = crypto.randomUUID();
      if (STRICT_UUID_PATTERN.test(targetCert.id)) {
        try {
          const { error } = await supabase.from('fecha_certificado').insert({
            id: newFechaId,
            id_certificado: targetCert.id,
            tipo_fecha,
            fecha,
          });
          if (error && !isMissingTableOrSchemaError(error)) {
            state.fechaDomain.editErrorMessage = translateCertSubEntityDbError(
              error,
              'fecha_certificado'
            );
            render();
            return;
          }
        } catch {
          // Reactive state fallback preserved when offline
        }
      }

      const newFecha: FechaCertificadoEntity = {
        id: newFechaId,
        id_certificado: targetCert.id,
        tipo_fecha,
        fecha,
      };

      const nextFechas = [...(targetCert.fechas || []), newFecha];
      const derivedDates = deriveCertificateVigenciaDates(
        nextFechas,
        targetCert.fecha_emision,
        targetCert.fecha_vencimiento
      );

      state.domainData.allCertificadosDetailed = state.domainData.allCertificadosDetailed.map((c) =>
        c.id === targetCert.id
          ? {
              ...c,
              fechas: nextFechas,
              fecha_emision: derivedDates.fecha_emision,
              fecha_vencimiento: derivedDates.fecha_vencimiento,
            }
          : c
      );
      state.exploration.records = state.exploration.records.map((r) =>
        r.id === targetCert.id
          ? {
              ...r,
              fecha_emision: derivedDates.fecha_emision,
              fecha_vencimiento: derivedDates.fecha_vencimiento,
            }
          : r
      );

      const nextSegment: BreadcrumbSegment = {
        id: `fecha-${newFechaId}`,
        label: `Fecha: ${tipo_fecha} · ${fecha}`,
        route: 'certificacion',
        subview: 'certificates',
        entityType: 'fecha_certificado',
        entityId: newFechaId,
        parentEntityId: targetCert.id,
        tooltip: `Certificado ${targetCert.numero_certificado} > Fecha: ${tipo_fecha} · ${fecha}`,
      };
      state.breadcrumbs = state.breadcrumbs.some((seg) => seg.id === 'fecha_certificado-new')
        ? state.breadcrumbs.map((seg) => (seg.id === 'fecha_certificado-new' ? nextSegment : seg))
        : pushBreadcrumb(state.breadcrumbs, nextSegment);

      recordPhase5SessionLog('fecha_certificado', newFechaId, 'INSERT', null, {
        id_certificado: targetCert.id,
        tipo_fecha,
        fecha,
      });

      state.fechaDomain.selectedFechaId = newFechaId;
      state.fechaDomain.originatingCertId = targetCert.id;
      state.fechaDomain.isCreating = false;
      state.fechaDomain.isEditingAttributes = false;
      state.fechaDomain.formDraft = undefined;
      state.fechaDomain.editFormData = undefined;
      state.fechaDomain.editErrorMessage = null;
      showFloatingToast('Fecha de certificado creada correctamente.', 'success');
      syncUrlHash('certificacion', 'certificates');
      render();
      return;
    }

    const currentFecha = resolveFechaDetailById({
      fechaId: fechaId!,
      certificates: state.domainData.allCertificadosDetailed,
      archivedFechaIds: state.domainData.archivedFechaIds,
    });
    if (!currentFecha) return;

    if (STRICT_UUID_PATTERN.test(fechaId!) && STRICT_UUID_PATTERN.test(targetCert.id)) {
      try {
        const { error } = await supabase
          .from('fecha_certificado')
          .update({
            id_certificado: targetCert.id,
            tipo_fecha,
            fecha,
            updated_at: new Date().toISOString(),
          })
          .eq('id', fechaId!);
        if (error && !isMissingTableOrSchemaError(error)) {
          state.fechaDomain.editErrorMessage = translateCertSubEntityDbError(
            error,
            'fecha_certificado'
          );
          render();
          return;
        }
      } catch {
        // Reactive state fallback preserved when offline
      }
    }

    const oldSnapshot = {
      id_certificado: currentFecha.id_certificado,
      tipo_fecha: currentFecha.tipo_fecha,
      fecha: currentFecha.fecha,
    };

    const updatedFechaItem: FechaCertificadoEntity = {
      id: fechaId!,
      id_certificado: targetCert.id,
      tipo_fecha,
      fecha,
    };

    const derivedByCertId = new Map<
      string,
      { fecha_emision: string; fecha_vencimiento: string }
    >();

    state.domainData.allCertificadosDetailed = state.domainData.allCertificadosDetailed.map((c) => {
      const hadCurrent = (c.fechas || []).some((f) => f.id === fechaId);
      if (c.id !== targetCert.id && !hadCurrent) return c;
      const withoutCurrent = (c.fechas || []).filter((f) => f.id !== fechaId);
      const nextFechas =
        c.id === targetCert.id ? [...withoutCurrent, updatedFechaItem] : withoutCurrent;
      const derivedDates = deriveCertificateVigenciaDates(
        nextFechas,
        c.fecha_emision,
        c.fecha_vencimiento
      );
      derivedByCertId.set(c.id, derivedDates);
      return {
        ...c,
        fechas: nextFechas,
        fecha_emision: derivedDates.fecha_emision,
        fecha_vencimiento: derivedDates.fecha_vencimiento,
      };
    });

    state.exploration.records = state.exploration.records.map((r) => {
      const derived = derivedByCertId.get(r.id);
      return derived
        ? {
            ...r,
            fecha_emision: derived.fecha_emision,
            fecha_vencimiento: derived.fecha_vencimiento,
          }
        : r;
    });

    state.breadcrumbs = state.breadcrumbs.map((seg) =>
      seg.entityType === 'fecha_certificado' && seg.entityId === fechaId
        ? {
            ...seg,
            label: `Fecha: ${tipo_fecha} · ${fecha}`,
            parentEntityId: targetCert.id,
            tooltip: `Certificado ${targetCert.numero_certificado} > Fecha: ${tipo_fecha} · ${fecha}`,
          }
        : seg
    );

    recordPhase5SessionLog('fecha_certificado', fechaId!, 'UPDATE', oldSnapshot, {
      id_certificado: targetCert.id,
      tipo_fecha,
      fecha,
    });

    state.fechaDomain.originatingCertId = targetCert.id;
    state.fechaDomain.isEditingAttributes = false;
    state.fechaDomain.formDraft = undefined;
    state.fechaDomain.editFormData = undefined;
    state.fechaDomain.editErrorMessage = null;
    showFloatingToast('Fecha de certificado actualizada y registrada en Historial de Cambios.', 'success');
    render();
  });

  // 12e. Contacto Detail View Event Handlers (Step 4.3 unified 3-mode)
  document.querySelectorAll<HTMLElement>('[data-action="open-create-contacto"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!isApprovedStaff()) return;
      const certId = btn.dataset.certId || state.certificadoDomain.selectedCertId || null;
      if (state.certificadoDomain.selectedCertId) {
        syncCurrentBreadcrumbTab('contactos');
      }
      const cert = certId
        ? state.domainData.allCertificadosDetailed.find((c) => c.id === certId)
        : undefined;

      clearAllEntitySelections();
      state.activeRoute = 'certificacion';
      state.activeSubSection = 'certificates';
      state.contactoDomain = {
        selectedContactoId: null,
        originatingCertId: certId,
        activeChildTab: 'telefonos',
        isCreating: true,
        isEditingAttributes: false,
        formDraft: createEmptyContactoFormDraft(certId),
        editFormData: undefined,
        editErrorMessage: null,
        childSortState: state.contactoDomain.childSortState || {},
      };
      state.breadcrumbs = pushBreadcrumb(
        state.breadcrumbs,
        createNewEntityBreadcrumbSegment({
          entityType: 'contacto_certificado',
          label: 'Nuevo Contacto',
          route: 'certificacion',
          subview: 'certificates',
          parentEntityId: certId || undefined,
          tooltip: cert
            ? `Certificado ${cert.numero_certificado} > Nuevo Contacto`
            : 'Nuevo Contacto de Certificado',
        })
      );
      syncUrlHash('certificacion', 'certificates');
      render();
    });
  });

  document.querySelectorAll<HTMLElement>('[data-contacto-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.contactoTab as ContactoChildTab | undefined;
      if (tab === 'telefonos' || tab === 'emails') {
        state.contactoDomain.activeChildTab = tab;
        syncCurrentBreadcrumbTab(tab);
        render();
      }
    });
  });

  document
    .querySelectorAll<HTMLElement>('[data-resizable-table^="contacto-tab-"] [data-action="sort-column"]')
    .forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tableEl = btn.closest<HTMLElement>('[data-resizable-table]');
        const tableId = tableEl?.dataset.resizableTable || '';
        const col = btn.dataset.sortCol;
        if (!col || !tableId.startsWith('contacto-tab-')) return;
        const tab = tableId.replace('contacto-tab-', '') as ContactoChildTab;
        const current = state.contactoDomain.childSortState?.[tab] || {
          column: null,
          direction: 'none' as const,
        };
        const next: SortState =
          current.column === col
            ? { column: col, direction: cycleSortDirection(current.direction) }
            : { column: col, direction: 'asc' };
        state.contactoDomain.childSortState = {
          ...(state.contactoDomain.childSortState || {}),
          [tab]: next,
        };
        render();
      });
    });

  const readContactoFormDraftFromDom = (): ContactoFormDraft => {
    const certSelect = document.getElementById('contactoSelectCertificado') as HTMLSelectElement | null;
    const nombreInput = document.getElementById('editContactoNombreInput') as HTMLInputElement | null;
    const cargoInput = document.getElementById('editContactoCargoInput') as HTMLInputElement | null;
    return {
      id_certificado: certSelect?.value ?? state.contactoDomain.formDraft?.id_certificado ?? '',
      nombre: nombreInput?.value ?? state.contactoDomain.formDraft?.nombre ?? '',
      cargo: cargoInput?.value ?? state.contactoDomain.formDraft?.cargo ?? '',
    };
  };

  document.getElementById('contactoSelectCertificado')?.addEventListener('change', () => {
    state.contactoDomain.formDraft = readContactoFormDraftFromDom();
    state.contactoDomain.editErrorMessage = null;
    render();
  });

  document.getElementById('startEditContactoBtn')?.addEventListener('click', () => {
    if (!isApprovedStaff()) return;
    const contactoId = state.contactoDomain.selectedContactoId;
    if (!contactoId) return;
    const currentContacto = resolveContactoDetailById({
      contactoId,
      certificates: state.domainData.allCertificadosDetailed,
      archivedContactoIds: state.domainData.archivedContactoIds,
      archivedTelefonoIds: state.domainData.archivedTelefonoIds,
      archivedEmailIds: state.domainData.archivedEmailIds,
    });
    if (!currentContacto) return;
    state.contactoDomain.isCreating = false;
    state.contactoDomain.isEditingAttributes = true;
    state.contactoDomain.editErrorMessage = null;
    state.contactoDomain.formDraft = createContactoFormDraftFromEntity(currentContacto);
    render();
  });

  document.getElementById('cancelEditContactoBtn')?.addEventListener('click', () => {
    if (state.contactoDomain.isCreating) {
      backtrackToParentBreadcrumb();
      render();
      return;
    }
    state.contactoDomain.isEditingAttributes = false;
    state.contactoDomain.formDraft = undefined;
    state.contactoDomain.editFormData = undefined;
    state.contactoDomain.editErrorMessage = null;
    render();
  });

  document.getElementById('contactoDetailForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isApprovedStaff()) return;
    const isCreating = Boolean(state.contactoDomain.isCreating);
    const contactoId = state.contactoDomain.selectedContactoId;
    if (!isCreating && !contactoId) return;

    const draft = readContactoFormDraftFromDom();
    state.contactoDomain.formDraft = draft;

    const targetCert = state.domainData.allCertificadosDetailed.find(
      (c) => c.id === draft.id_certificado
    );
    if (!targetCert) {
      state.contactoDomain.editErrorMessage =
        'Seleccione un certificado de conformidad válido para el contacto.';
      render();
      return;
    }

    const validation = validateContactoInput({
      nombre: draft.nombre,
      cargo: draft.cargo,
      existingContactos: (targetCert.contactos || []).filter(
        (c) => !state.domainData.archivedContactoIds.has(c.id)
      ),
      currentContactoId: isCreating ? null : contactoId,
    });

    if (!validation.ok) {
      state.contactoDomain.editErrorMessage = validation.error;
      render();
      return;
    }

    const { nombre, cargo } = validation.value;

    if (isCreating) {
      const newContactoId = crypto.randomUUID();
      if (STRICT_UUID_PATTERN.test(targetCert.id)) {
        try {
          const { error } = await supabase.from('contacto_certificado').insert({
            id: newContactoId,
            id_certificado: targetCert.id,
            nombre,
            cargo,
          });
          if (error && !isMissingTableOrSchemaError(error)) {
            state.contactoDomain.editErrorMessage = translateCertSubEntityDbError(
              error,
              'contacto_certificado'
            );
            render();
            return;
          }
        } catch {
          // Reactive state fallback preserved
        }
      }

      const newContacto: ContactoCertificadoEntity = {
        id: newContactoId,
        id_certificado: targetCert.id,
        nombre,
        cargo,
        telefonos: [],
        emails: [],
      };

      state.domainData.allCertificadosDetailed = state.domainData.allCertificadosDetailed.map((c) =>
        c.id === targetCert.id
          ? { ...c, contactos: [...(c.contactos || []), newContacto] }
          : c
      );

      const nextSegment: BreadcrumbSegment = {
        id: `contacto-${newContactoId}`,
        label: nombre,
        route: 'certificacion',
        subview: 'certificates',
        entityType: 'contacto_certificado',
        entityId: newContactoId,
        parentEntityId: targetCert.id,
        tab: 'telefonos',
        tooltip: `Certificado ${targetCert.numero_certificado} > Contacto: ${nombre}`,
      };
      state.breadcrumbs = state.breadcrumbs.some((seg) => seg.id === 'contacto_certificado-new')
        ? state.breadcrumbs.map((seg) =>
            seg.id === 'contacto_certificado-new' ? nextSegment : seg
          )
        : pushBreadcrumb(state.breadcrumbs, nextSegment);

      recordPhase5SessionLog('contacto_certificado', newContactoId, 'INSERT', null, {
        id_certificado: targetCert.id,
        nombre,
        cargo,
      });

      state.contactoDomain.selectedContactoId = newContactoId;
      state.contactoDomain.originatingCertId = targetCert.id;
      state.contactoDomain.activeChildTab = 'telefonos';
      state.contactoDomain.isCreating = false;
      state.contactoDomain.isEditingAttributes = false;
      state.contactoDomain.formDraft = undefined;
      state.contactoDomain.editFormData = undefined;
      state.contactoDomain.editErrorMessage = null;
      showFloatingToast('Contacto creado correctamente.', 'success');
      syncUrlHash('certificacion', 'certificates');
      render();
      return;
    }

    const currentContacto = resolveContactoDetailById({
      contactoId: contactoId!,
      certificates: state.domainData.allCertificadosDetailed,
      archivedContactoIds: state.domainData.archivedContactoIds,
      archivedTelefonoIds: state.domainData.archivedTelefonoIds,
      archivedEmailIds: state.domainData.archivedEmailIds,
    });
    if (!currentContacto) return;

    if (STRICT_UUID_PATTERN.test(contactoId!) && STRICT_UUID_PATTERN.test(targetCert.id)) {
      try {
        const { error } = await supabase
          .from('contacto_certificado')
          .update({
            id_certificado: targetCert.id,
            nombre,
            cargo,
            updated_at: new Date().toISOString(),
          })
          .eq('id', contactoId!);
        if (error && !isMissingTableOrSchemaError(error)) {
          state.contactoDomain.editErrorMessage = translateCertSubEntityDbError(
            error,
            'contacto_certificado'
          );
          render();
          return;
        }
      } catch {
        // Reactive state fallback preserved
      }
    }

    const oldSnapshot = {
      id_certificado: currentContacto.id_certificado,
      nombre: currentContacto.nombre,
      cargo: currentContacto.cargo,
    };

    let movedContacto: ContactoCertificadoEntity | null = null;
    for (const c of state.domainData.allCertificadosDetailed) {
      const found = (c.contactos || []).find((ct) => ct.id === contactoId);
      if (found) {
        movedContacto = { ...found, id_certificado: targetCert.id, nombre, cargo };
        break;
      }
    }

    if (movedContacto) {
      state.domainData.allCertificadosDetailed = state.domainData.allCertificadosDetailed.map((c) => {
        const withoutCurrent = (c.contactos || []).filter((ct) => ct.id !== contactoId);
        if (c.id === targetCert.id) {
          const hadAlready = (c.contactos || []).some((ct) => ct.id === contactoId);
          return {
            ...c,
            contactos: hadAlready
              ? (c.contactos || []).map((ct) => (ct.id === contactoId ? movedContacto! : ct))
              : [...withoutCurrent, movedContacto!],
          };
        }
        return withoutCurrent.length !== (c.contactos || []).length
          ? { ...c, contactos: withoutCurrent }
          : c;
      });
    }

    state.breadcrumbs = state.breadcrumbs.map((seg) =>
      seg.entityType === 'contacto_certificado' && seg.entityId === contactoId
        ? {
            ...seg,
            label: nombre,
            parentEntityId: targetCert.id,
            tooltip: `Certificado ${targetCert.numero_certificado} > Contacto: ${nombre}`,
          }
        : seg
    );

    recordPhase5SessionLog('contacto_certificado', contactoId!, 'UPDATE', oldSnapshot, {
      id_certificado: targetCert.id,
      nombre,
      cargo,
    });

    state.contactoDomain.originatingCertId = targetCert.id;
    state.contactoDomain.isEditingAttributes = false;
    state.contactoDomain.formDraft = undefined;
    state.contactoDomain.editFormData = undefined;
    state.contactoDomain.editErrorMessage = null;
    showFloatingToast('Contacto actualizado y registrado en Historial de Cambios.', 'success');
    render();
  });

  document.querySelectorAll<HTMLElement>('[data-action="open-create-telefono"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!isApprovedStaff()) return;
      const contactoId = btn.dataset.contactoId || state.contactoDomain.selectedContactoId || null;
      if (state.contactoDomain.selectedContactoId) {
        syncCurrentBreadcrumbTab('telefonos');
      }
      const parentContacto = contactoId
        ? resolveContactoDetailById({
            contactoId,
            certificates: state.domainData.allCertificadosDetailed,
            archivedContactoIds: state.domainData.archivedContactoIds,
            archivedTelefonoIds: state.domainData.archivedTelefonoIds,
            archivedEmailIds: state.domainData.archivedEmailIds,
          })
        : null;

      clearAllEntitySelections();
      state.activeRoute = 'certificacion';
      state.activeSubSection = 'certificates';
      state.telefonoDomain = {
        selectedTelefonoId: null,
        originatingContactoId: contactoId,
        isCreating: true,
        isEditingAttributes: false,
        formDraft: createEmptyTelefonoFormDraft(contactoId),
        editFormData: undefined,
        editErrorMessage: null,
      };
      state.breadcrumbs = pushBreadcrumb(
        state.breadcrumbs,
        createNewEntityBreadcrumbSegment({
          entityType: 'telefono_contacto',
          label: 'Nuevo Teléfono',
          route: 'certificacion',
          subview: 'certificates',
          parentEntityId: contactoId || undefined,
          tooltip: parentContacto
            ? `Contacto ${parentContacto.nombre} > Nuevo Teléfono`
            : 'Nuevo Teléfono de Contacto',
        })
      );
      syncUrlHash('certificacion', 'certificates');
      render();
    });
  });

  document.querySelectorAll<HTMLElement>('[data-action="open-create-email"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!isApprovedStaff()) return;
      const contactoId = btn.dataset.contactoId || state.contactoDomain.selectedContactoId || null;
      if (state.contactoDomain.selectedContactoId) {
        syncCurrentBreadcrumbTab('emails');
      }
      const parentContacto = contactoId
        ? resolveContactoDetailById({
            contactoId,
            certificates: state.domainData.allCertificadosDetailed,
            archivedContactoIds: state.domainData.archivedContactoIds,
            archivedTelefonoIds: state.domainData.archivedTelefonoIds,
            archivedEmailIds: state.domainData.archivedEmailIds,
          })
        : null;

      clearAllEntitySelections();
      state.activeRoute = 'certificacion';
      state.activeSubSection = 'certificates';
      state.emailDomain = {
        selectedEmailId: null,
        originatingContactoId: contactoId,
        isCreating: true,
        isEditingAttributes: false,
        formDraft: createEmptyEmailFormDraft(contactoId),
        editFormData: undefined,
        editErrorMessage: null,
      };
      state.breadcrumbs = pushBreadcrumb(
        state.breadcrumbs,
        createNewEntityBreadcrumbSegment({
          entityType: 'email_contacto',
          label: 'Nuevo Correo',
          route: 'certificacion',
          subview: 'certificates',
          parentEntityId: contactoId || undefined,
          tooltip: parentContacto
            ? `Contacto ${parentContacto.nombre} > Nuevo Correo`
            : 'Nuevo Correo Electrónico',
        })
      );
      syncUrlHash('certificacion', 'certificates');
      render();
    });
  });

  document
    .querySelectorAll<HTMLElement>('[data-action="select-telefono-detail"]')
    .forEach((row) => {
      row.addEventListener('click', (e) => {
        const target = e.target as HTMLElement | null;
        if (target?.closest('button, a, input, select')) return;
        const telefonoId = row.dataset.telefonoId;
        if (!telefonoId) return;
        const resolvedTelefono = resolveTelefonoDetailById({
          telefonoId,
          certificates: state.domainData.allCertificadosDetailed,
          archivedContactoIds: state.domainData.archivedContactoIds,
          archivedTelefonoIds: state.domainData.archivedTelefonoIds,
        });
        if (!resolvedTelefono) return;

        clearAllEntitySelections();
        state.activeRoute = 'certificacion';
        state.activeSubSection = 'certificates';
        state.telefonoDomain.selectedTelefonoId = telefonoId;
        state.telefonoDomain.originatingContactoId = resolvedTelefono.id_contacto;
        state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
          id: `telefono-${telefonoId}`,
          label: resolvedTelefono.telefono,
          route: 'certificacion',
          subview: 'certificates',
          entityType: 'telefono_contacto',
          entityId: telefonoId,
          parentEntityId: resolvedTelefono.id_contacto,
          tooltip: `Contacto ${resolvedTelefono.contacto_nombre} > Teléfono: ${resolvedTelefono.telefono}`,
        });
        syncUrlHash('certificacion', 'certificates');
        render();
      });
    });

  document
    .querySelectorAll<HTMLElement>('[data-action="select-email-detail"]')
    .forEach((row) => {
      row.addEventListener('click', (e) => {
        const target = e.target as HTMLElement | null;
        if (target?.closest('button, a, input, select')) return;
        const emailId = row.dataset.emailId;
        if (!emailId) return;
        const resolvedEmail = resolveEmailDetailById({
          emailId,
          certificates: state.domainData.allCertificadosDetailed,
          archivedContactoIds: state.domainData.archivedContactoIds,
          archivedEmailIds: state.domainData.archivedEmailIds,
        });
        if (!resolvedEmail) return;

        clearAllEntitySelections();
        state.activeRoute = 'certificacion';
        state.activeSubSection = 'certificates';
        state.emailDomain.selectedEmailId = emailId;
        state.emailDomain.originatingContactoId = resolvedEmail.id_contacto;
        state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
          id: `email-${emailId}`,
          label: resolvedEmail.email,
          route: 'certificacion',
          subview: 'certificates',
          entityType: 'email_contacto',
          entityId: emailId,
          parentEntityId: resolvedEmail.id_contacto,
          tooltip: `Contacto ${resolvedEmail.contacto_nombre} > Email: ${resolvedEmail.email}`,
        });
        syncUrlHash('certificacion', 'certificates');
        render();
      });
    });

  // 12f. Telefono Detail View Event Handlers (Step 4.3 unified 3-mode)
  const readTelefonoFormDraftFromDom = (): TelefonoFormDraft => {
    const contactoSelect = document.getElementById('telefonoSelectContacto') as HTMLSelectElement | null;
    const tipoSelect = document.getElementById('editTelefonoTipoSelect') as HTMLSelectElement | null;
    const telInput = document.getElementById('editTelefonoInput') as HTMLInputElement | null;
    return {
      id_contacto: contactoSelect?.value ?? state.telefonoDomain.formDraft?.id_contacto ?? '',
      tipo_telefono: tipoSelect?.value ?? state.telefonoDomain.formDraft?.tipo_telefono ?? 'Oficina',
      telefono: telInput?.value ?? state.telefonoDomain.formDraft?.telefono ?? '',
    };
  };

  document.getElementById('telefonoSelectContacto')?.addEventListener('change', () => {
    state.telefonoDomain.formDraft = readTelefonoFormDraftFromDom();
    state.telefonoDomain.editErrorMessage = null;
    render();
  });

  document.getElementById('startEditTelefonoBtn')?.addEventListener('click', () => {
    if (!isApprovedStaff()) return;
    const telefonoId = state.telefonoDomain.selectedTelefonoId;
    if (!telefonoId) return;
    const currentTelefono = resolveTelefonoDetailById({
      telefonoId,
      certificates: state.domainData.allCertificadosDetailed,
      archivedContactoIds: state.domainData.archivedContactoIds,
      archivedTelefonoIds: state.domainData.archivedTelefonoIds,
    });
    if (!currentTelefono) return;
    state.telefonoDomain.isCreating = false;
    state.telefonoDomain.isEditingAttributes = true;
    state.telefonoDomain.editErrorMessage = null;
    state.telefonoDomain.formDraft = createTelefonoFormDraftFromEntity(currentTelefono);
    render();
  });

  document.getElementById('cancelEditTelefonoBtn')?.addEventListener('click', () => {
    if (state.telefonoDomain.isCreating) {
      backtrackToParentBreadcrumb();
      render();
      return;
    }
    state.telefonoDomain.isEditingAttributes = false;
    state.telefonoDomain.formDraft = undefined;
    state.telefonoDomain.editFormData = undefined;
    state.telefonoDomain.editErrorMessage = null;
    render();
  });

  document.getElementById('telefonoDetailForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isApprovedStaff()) return;
    const isCreating = Boolean(state.telefonoDomain.isCreating);
    const telefonoId = state.telefonoDomain.selectedTelefonoId;
    if (!isCreating && !telefonoId) return;

    const draft = readTelefonoFormDraftFromDom();
    state.telefonoDomain.formDraft = draft;

    const parentContacto = resolveContactoDetailById({
      contactoId: draft.id_contacto,
      certificates: state.domainData.allCertificadosDetailed,
      archivedContactoIds: state.domainData.archivedContactoIds,
      archivedTelefonoIds: state.domainData.archivedTelefonoIds,
      archivedEmailIds: state.domainData.archivedEmailIds,
    });
    if (!parentContacto) {
      state.telefonoDomain.editErrorMessage =
        'Seleccione un contacto activo válido para asociar el teléfono.';
      render();
      return;
    }

    const validation = validateTelefonoInput({
      telefono: draft.telefono,
      tipo_telefono: draft.tipo_telefono,
      existingTelefonos: parentContacto.telefonos,
      currentTelefonoId: isCreating ? null : telefonoId,
    });

    if (!validation.ok) {
      state.telefonoDomain.editErrorMessage = validation.error;
      render();
      return;
    }

    const { telefono, tipo_telefono } = validation.value;

    if (isCreating) {
      const newTelefonoId = crypto.randomUUID();
      if (STRICT_UUID_PATTERN.test(parentContacto.id)) {
        try {
          const { error } = await supabase.from('telefono_contacto_certificado').insert({
            id: newTelefonoId,
            id_contacto: parentContacto.id,
            telefono,
            tipo_telefono,
          });
          if (error && !isMissingTableOrSchemaError(error)) {
            state.telefonoDomain.editErrorMessage = translateCertSubEntityDbError(
              error,
              'telefono_contacto_certificado'
            );
            render();
            return;
          }
        } catch {
          // Reactive state fallback preserved
        }
      }

      const newTelefono: TelefonoContactoEntity = {
        id: newTelefonoId,
        id_contacto: parentContacto.id,
        telefono,
        tipo_telefono,
      };

      state.domainData.allCertificadosDetailed = state.domainData.allCertificadosDetailed.map((c) =>
        c.id === parentContacto.id_certificado
          ? {
              ...c,
              contactos: (c.contactos || []).map((ct) =>
                ct.id === parentContacto.id
                  ? { ...ct, telefonos: [...(ct.telefonos || []), newTelefono] }
                  : ct
              ),
            }
          : c
      );

      const nextSegment: BreadcrumbSegment = {
        id: `telefono-${newTelefonoId}`,
        label: telefono,
        route: 'certificacion',
        subview: 'certificates',
        entityType: 'telefono_contacto',
        entityId: newTelefonoId,
        parentEntityId: parentContacto.id,
        tooltip: `Contacto ${parentContacto.nombre} > Teléfono: ${telefono}`,
      };
      state.breadcrumbs = state.breadcrumbs.some((seg) => seg.id === 'telefono_contacto-new')
        ? state.breadcrumbs.map((seg) =>
            seg.id === 'telefono_contacto-new' ? nextSegment : seg
          )
        : pushBreadcrumb(state.breadcrumbs, nextSegment);

      recordPhase5SessionLog('telefono_contacto_certificado', newTelefonoId, 'INSERT', null, {
        id_contacto: parentContacto.id,
        telefono,
        tipo_telefono,
      });

      state.telefonoDomain.selectedTelefonoId = newTelefonoId;
      state.telefonoDomain.originatingContactoId = parentContacto.id;
      state.telefonoDomain.isCreating = false;
      state.telefonoDomain.isEditingAttributes = false;
      state.telefonoDomain.formDraft = undefined;
      state.telefonoDomain.editFormData = undefined;
      state.telefonoDomain.editErrorMessage = null;
      showFloatingToast(`Teléfono ${telefono} agregado al contacto correctamente.`, 'success');
      syncUrlHash('certificacion', 'certificates');
      render();
      return;
    }

    const currentTelefono = resolveTelefonoDetailById({
      telefonoId: telefonoId!,
      certificates: state.domainData.allCertificadosDetailed,
      archivedContactoIds: state.domainData.archivedContactoIds,
      archivedTelefonoIds: state.domainData.archivedTelefonoIds,
    });
    if (!currentTelefono) return;

    if (STRICT_UUID_PATTERN.test(telefonoId!) && STRICT_UUID_PATTERN.test(parentContacto.id)) {
      try {
        const { error } = await supabase
          .from('telefono_contacto_certificado')
          .update({
            id_contacto: parentContacto.id,
            telefono,
            tipo_telefono,
            updated_at: new Date().toISOString(),
          })
          .eq('id', telefonoId!);
        if (error && !isMissingTableOrSchemaError(error)) {
          state.telefonoDomain.editErrorMessage = translateCertSubEntityDbError(
            error,
            'telefono_contacto_certificado'
          );
          render();
          return;
        }
      } catch {
        // Reactive state fallback preserved
      }
    }

    const oldSnapshot = {
      id_contacto: currentTelefono.id_contacto,
      telefono: currentTelefono.telefono,
      tipo_telefono: currentTelefono.tipo_telefono,
    };

    const updatedTelefonoItem: TelefonoContactoEntity = {
      id: telefonoId!,
      id_contacto: parentContacto.id,
      telefono,
      tipo_telefono,
    };

    state.domainData.allCertificadosDetailed = state.domainData.allCertificadosDetailed.map((c) => ({
      ...c,
      contactos: (c.contactos || []).map((ct) => {
        const withoutCurrent = (ct.telefonos || []).filter((t) => t.id !== telefonoId);
        if (ct.id === parentContacto.id) {
          const hadAlready = (ct.telefonos || []).some((t) => t.id === telefonoId);
          return {
            ...ct,
            telefonos: hadAlready
              ? (ct.telefonos || []).map((t) => (t.id === telefonoId ? updatedTelefonoItem : t))
              : [...withoutCurrent, updatedTelefonoItem],
          };
        }
        return withoutCurrent.length !== (ct.telefonos || []).length
          ? { ...ct, telefonos: withoutCurrent }
          : ct;
      }),
    }));

    state.breadcrumbs = state.breadcrumbs.map((seg) =>
      seg.entityType === 'telefono_contacto' && seg.entityId === telefonoId
        ? {
            ...seg,
            label: telefono,
            parentEntityId: parentContacto.id,
            tooltip: `Contacto ${parentContacto.nombre} > Teléfono: ${telefono}`,
          }
        : seg
    );

    recordPhase5SessionLog('telefono_contacto_certificado', telefonoId!, 'UPDATE', oldSnapshot, {
      id_contacto: parentContacto.id,
      telefono,
      tipo_telefono,
    });

    state.telefonoDomain.originatingContactoId = parentContacto.id;
    state.telefonoDomain.isEditingAttributes = false;
    state.telefonoDomain.formDraft = undefined;
    state.telefonoDomain.editFormData = undefined;
    state.telefonoDomain.editErrorMessage = null;
    showFloatingToast('Teléfono actualizado y registrado en Historial de Cambios.', 'success');
    render();
  });

  // 12g. Email Detail View Event Handlers (Step 4.3 unified 3-mode)
  const readEmailFormDraftFromDom = (): EmailFormDraft => {
    const contactoSelect = document.getElementById('emailSelectContacto') as HTMLSelectElement | null;
    const tipoSelect = document.getElementById('editEmailTipoSelect') as HTMLSelectElement | null;
    const emailInput = document.getElementById('editEmailInput') as HTMLInputElement | null;
    return {
      id_contacto: contactoSelect?.value ?? state.emailDomain.formDraft?.id_contacto ?? '',
      tipo_email: tipoSelect?.value ?? state.emailDomain.formDraft?.tipo_email ?? 'Trabajo',
      email: emailInput?.value ?? state.emailDomain.formDraft?.email ?? '',
    };
  };

  document.getElementById('emailSelectContacto')?.addEventListener('change', () => {
    state.emailDomain.formDraft = readEmailFormDraftFromDom();
    state.emailDomain.editErrorMessage = null;
    render();
  });

  document.getElementById('startEditEmailBtn')?.addEventListener('click', () => {
    if (!isApprovedStaff()) return;
    const emailId = state.emailDomain.selectedEmailId;
    if (!emailId) return;
    const currentEmail = resolveEmailDetailById({
      emailId,
      certificates: state.domainData.allCertificadosDetailed,
      archivedContactoIds: state.domainData.archivedContactoIds,
      archivedEmailIds: state.domainData.archivedEmailIds,
    });
    if (!currentEmail) return;
    state.emailDomain.isCreating = false;
    state.emailDomain.isEditingAttributes = true;
    state.emailDomain.editErrorMessage = null;
    state.emailDomain.formDraft = createEmailFormDraftFromEntity(currentEmail);
    render();
  });

  document.getElementById('cancelEditEmailBtn')?.addEventListener('click', () => {
    if (state.emailDomain.isCreating) {
      backtrackToParentBreadcrumb();
      render();
      return;
    }
    state.emailDomain.isEditingAttributes = false;
    state.emailDomain.formDraft = undefined;
    state.emailDomain.editFormData = undefined;
    state.emailDomain.editErrorMessage = null;
    render();
  });

  document.getElementById('emailDetailForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isApprovedStaff()) return;
    const isCreating = Boolean(state.emailDomain.isCreating);
    const emailId = state.emailDomain.selectedEmailId;
    if (!isCreating && !emailId) return;

    const draft = readEmailFormDraftFromDom();
    state.emailDomain.formDraft = draft;

    const parentContacto = resolveContactoDetailById({
      contactoId: draft.id_contacto,
      certificates: state.domainData.allCertificadosDetailed,
      archivedContactoIds: state.domainData.archivedContactoIds,
      archivedTelefonoIds: state.domainData.archivedTelefonoIds,
      archivedEmailIds: state.domainData.archivedEmailIds,
    });
    if (!parentContacto) {
      state.emailDomain.editErrorMessage =
        'Seleccione un contacto activo válido para asociar el correo electrónico.';
      render();
      return;
    }

    const validation = validateEmailInput({
      email: draft.email,
      tipo_email: draft.tipo_email,
      existingEmails: parentContacto.emails,
      currentEmailId: isCreating ? null : emailId,
    });

    if (!validation.ok) {
      state.emailDomain.editErrorMessage = validation.error;
      render();
      return;
    }

    const { email, tipo_email } = validation.value;

    if (isCreating) {
      const newEmailId = crypto.randomUUID();
      if (STRICT_UUID_PATTERN.test(parentContacto.id)) {
        try {
          const { error } = await supabase.from('email_contacto_certificado').insert({
            id: newEmailId,
            id_contacto: parentContacto.id,
            email,
            tipo_email,
          });
          if (error && !isMissingTableOrSchemaError(error)) {
            state.emailDomain.editErrorMessage = translateCertSubEntityDbError(
              error,
              'email_contacto_certificado'
            );
            render();
            return;
          }
        } catch {
          // Reactive state fallback preserved
        }
      }

      const newEmail: EmailContactoEntity = {
        id: newEmailId,
        id_contacto: parentContacto.id,
        email,
        tipo_email,
      };

      state.domainData.allCertificadosDetailed = state.domainData.allCertificadosDetailed.map((c) =>
        c.id === parentContacto.id_certificado
          ? {
              ...c,
              contactos: (c.contactos || []).map((ct) =>
                ct.id === parentContacto.id
                  ? { ...ct, emails: [...(ct.emails || []), newEmail] }
                  : ct
              ),
            }
          : c
      );

      const nextSegment: BreadcrumbSegment = {
        id: `email-${newEmailId}`,
        label: email,
        route: 'certificacion',
        subview: 'certificates',
        entityType: 'email_contacto',
        entityId: newEmailId,
        parentEntityId: parentContacto.id,
        tooltip: `Contacto ${parentContacto.nombre} > Email: ${email}`,
      };
      state.breadcrumbs = state.breadcrumbs.some((seg) => seg.id === 'email_contacto-new')
        ? state.breadcrumbs.map((seg) => (seg.id === 'email_contacto-new' ? nextSegment : seg))
        : pushBreadcrumb(state.breadcrumbs, nextSegment);

      recordPhase5SessionLog('email_contacto_certificado', newEmailId, 'INSERT', null, {
        id_contacto: parentContacto.id,
        email,
        tipo_email,
      });

      state.emailDomain.selectedEmailId = newEmailId;
      state.emailDomain.originatingContactoId = parentContacto.id;
      state.emailDomain.isCreating = false;
      state.emailDomain.isEditingAttributes = false;
      state.emailDomain.formDraft = undefined;
      state.emailDomain.editFormData = undefined;
      state.emailDomain.editErrorMessage = null;
      showFloatingToast(`Correo ${email} agregado al contacto correctamente.`, 'success');
      syncUrlHash('certificacion', 'certificates');
      render();
      return;
    }

    const currentEmail = resolveEmailDetailById({
      emailId: emailId!,
      certificates: state.domainData.allCertificadosDetailed,
      archivedContactoIds: state.domainData.archivedContactoIds,
      archivedEmailIds: state.domainData.archivedEmailIds,
    });
    if (!currentEmail) return;

    if (STRICT_UUID_PATTERN.test(emailId!) && STRICT_UUID_PATTERN.test(parentContacto.id)) {
      try {
        const { error } = await supabase
          .from('email_contacto_certificado')
          .update({
            id_contacto: parentContacto.id,
            email,
            tipo_email,
            updated_at: new Date().toISOString(),
          })
          .eq('id', emailId!);
        if (error && !isMissingTableOrSchemaError(error)) {
          state.emailDomain.editErrorMessage = translateCertSubEntityDbError(
            error,
            'email_contacto_certificado'
          );
          render();
          return;
        }
      } catch {
        // Reactive state fallback preserved
      }
    }

    const oldSnapshot = {
      id_contacto: currentEmail.id_contacto,
      email: currentEmail.email,
      tipo_email: currentEmail.tipo_email,
    };

    const updatedEmailItem: EmailContactoEntity = {
      id: emailId!,
      id_contacto: parentContacto.id,
      email,
      tipo_email,
    };

    state.domainData.allCertificadosDetailed = state.domainData.allCertificadosDetailed.map((c) => ({
      ...c,
      contactos: (c.contactos || []).map((ct) => {
        const withoutCurrent = (ct.emails || []).filter((em) => em.id !== emailId);
        if (ct.id === parentContacto.id) {
          const hadAlready = (ct.emails || []).some((em) => em.id === emailId);
          return {
            ...ct,
            emails: hadAlready
              ? (ct.emails || []).map((em) => (em.id === emailId ? updatedEmailItem : em))
              : [...withoutCurrent, updatedEmailItem],
          };
        }
        return withoutCurrent.length !== (ct.emails || []).length
          ? { ...ct, emails: withoutCurrent }
          : ct;
      }),
    }));

    state.breadcrumbs = state.breadcrumbs.map((seg) =>
      seg.entityType === 'email_contacto' && seg.entityId === emailId
        ? {
            ...seg,
            label: email,
            parentEntityId: parentContacto.id,
            tooltip: `Contacto ${parentContacto.nombre} > Email: ${email}`,
          }
        : seg
    );

    recordPhase5SessionLog('email_contacto_certificado', emailId!, 'UPDATE', oldSnapshot, {
      id_contacto: parentContacto.id,
      email,
      tipo_email,
    });

    state.emailDomain.originatingContactoId = parentContacto.id;
    state.emailDomain.isEditingAttributes = false;
    state.emailDomain.formDraft = undefined;
    state.emailDomain.editFormData = undefined;
    state.emailDomain.editErrorMessage = null;
    showFloatingToast('Correo electrónico actualizado y registrado en Historial de Cambios.', 'success');
    render();
  });

  // 13. Nav link: view standard (norma) from certificate Zone 1 (cross-entity lineage push)
  document.querySelectorAll<HTMLElement>('[data-action="view-norma-from-cert"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const normaId = btn.dataset.normaId || null;
      state.activeRoute = 'extra';
      state.activeSubSection = 'standards';
      state.extraDomain.selectedNormaId = normaId;
      if (normaId) {
        const matchedNorma =
          INITIAL_NORMAS.find((n) => n.id === normaId) ||
          state.domainData.standards.find((s) => s.id === normaId);
        const normaLabel = matchedNorma?.norma || 'Norma ISO';
        state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
          id: `norma-${normaId}`,
          label: normaLabel,
          route: 'extra',
          subview: 'standards',
          entityType: 'norma',
          entityId: normaId,
          tab: state.extraDomain.activeNormaTab,
          tooltip: `Norma ISO > ${normaLabel}`,
        });
      } else {
        state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
          id: 'subview-extra-standards',
          label: 'Norma',
          route: 'extra',
          subview: 'standards',
          tooltip: 'Extra > Norma',
        });
      }
      syncUrlHash('extra', 'standards');
      render();
    });
  });

  // 15. Nav link: view IAF sector from certificate Zone 1 (cross-entity lineage push)
  document.querySelectorAll<HTMLElement>('[data-action="view-iaf-from-cert"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sectorId = btn.dataset.sectorId || null;
      const matchedSector = sectorId
        ? INITIAL_SECTORES_IAF.find((s) => s.id === sectorId || String(s.sector) === sectorId) ||
          state.domainData.iafSectors.find((s) => s.id === sectorId || String(s.sector) === sectorId)
        : undefined;
      const resolvedSectorId = matchedSector?.id || sectorId;
      state.activeRoute = 'extra';
      state.activeSubSection = 'iaf';
      state.extraDomain.selectedSectorId = resolvedSectorId;
      if (resolvedSectorId) {
        const secLabel = matchedSector ? `Sector ${matchedSector.sector}` : 'Sector IAF';
        state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
          id: `sector-${resolvedSectorId}`,
          label: secLabel,
          route: 'extra',
          subview: 'iaf',
          entityType: 'sector_iaf',
          entityId: resolvedSectorId,
          tab: state.extraDomain.activeSectorTab,
          tooltip: `Sector IAF > ${matchedSector?.descripcion || secLabel}`,
        });
      } else {
        state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
          id: 'subview-extra-iaf',
          label: 'Sector IAF',
          route: 'extra',
          subview: 'iaf',
          tooltip: 'Extra > Sector IAF',
        });
      }
      syncUrlHash('extra', 'iaf');
      render();
    });
  });

  // ===============================================
  // DOMAIN CERTIFICACIÓN (Step 3.2: Auditor & Competencias M:N)
  // ===============================================

  // 1. Select auditor -> Canonical 3-Zone Detail View & push breadcrumb
  document.querySelectorAll<HTMLElement>('[data-action="select-auditor"]').forEach((btn) => {
    const openAuditorDetail = () => {
      const auditorId = btn.dataset.auditorId;
      if (!auditorId) return;
      clearAllEntitySelections();
      state.activeRoute = 'certificacion';
      state.activeSubSection = 'auditors';
      state.auditorDomain.selectedAuditorId = auditorId;
      state.auditorDomain.activeChildTab = 'competencias';

      const aud =
        state.domainData.allAuditorsDetailed.find((a) => a.id === auditorId) ||
        INITIAL_AUDITORES_DETAILED.find((a) => a.id === auditorId);

      state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
        id: `aud-${auditorId}`,
        label: aud?.nombre || 'Auditor',
        route: 'certificacion',
        subview: 'auditors',
        entityType: 'auditor',
        entityId: auditorId,
        tab: 'competencias',
        tooltip: `Auditor > ${aud?.nombre || auditorId}`,
      });
      syncUrlHash('certificacion', 'auditors');
      render();
    };

    btn.addEventListener('click', (e) => {
      if (btn.tagName === 'TR') {
        const target = e.target as HTMLElement | null;
        if (target?.closest('button, a, input, select')) return;
      }
      openAuditorDetail();
    });

    if (btn.tagName !== 'BUTTON' && btn.tagName !== 'A') {
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openAuditorDetail();
        }
      });
    }
  });

  // 2. Back to parent breadcrumb (auditor list or originating parent)
  document.querySelectorAll<HTMLElement>('[data-action="back-to-auditor-list"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.navBack === 'true') return;
      backtrackToParentBreadcrumb();
      render();
    });
  });

  // 3. Direct Navigation to Add Mode: Nuevo Auditor
  document.querySelectorAll<HTMLElement>('[data-action="open-create-auditor"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!isApprovedStaff()) return;
      clearAllEntitySelections();
      state.activeRoute = 'certificacion';
      state.activeSubSection = 'auditors';
      state.auditorDomain.isCreating = true;
      state.auditorDomain.formDraft = createEmptyAuditorFormDraft();
      state.auditorDomain.editErrorMessage = null;
      state.breadcrumbs = pushBreadcrumb(
        resetBreadcrumbToDomain('certificacion', 'auditors'),
        createNewEntityBreadcrumbSegment({
          entityType: 'auditor',
          label: 'Nuevo Auditor',
          route: 'certificacion',
          subview: 'auditors',
          tooltip: 'Certificación > Nuevo Auditor',
        })
      );
      syncUrlHash('certificacion', 'auditors');
      render();
    });
  });

  // 4. Child tab switching (Competencias | Historial de Auditorías)
  document.querySelectorAll<HTMLElement>('[data-auditor-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.auditorTab as AuditorChildTab | undefined;
      if (tab === 'competencias' || tab === 'historial') {
        state.auditorDomain.activeChildTab = tab;
        syncCurrentBreadcrumbTab(tab);
        render();
      }
    });
  });

  // 5. Edit mode toggling & cancellation for Auditor Detail View
  document.getElementById('startEditAuditorBtn')?.addEventListener('click', () => {
    if (!isApprovedStaff()) return;
    const audId = state.auditorDomain.selectedAuditorId;
    const aud = audId
      ? state.domainData.allAuditorsDetailed.find((a) => a.id === audId)
      : undefined;
    if (!aud) return;
    state.auditorDomain.isEditingAttributes = true;
    state.auditorDomain.formDraft = createAuditorDraftFromEntity(aud);
    state.auditorDomain.editErrorMessage = null;
    render();
  });

  document.getElementById('cancelEditAuditorBtn')?.addEventListener('click', () => {
    if (state.auditorDomain.isCreating && !state.auditorDomain.selectedAuditorId) {
      backtrackToParentBreadcrumb();
      render();
      return;
    }
    state.auditorDomain.isEditingAttributes = false;
    state.auditorDomain.formDraft = undefined;
    state.auditorDomain.editErrorMessage = null;
    render();
  });

  const syncAuditorDraftFromDom = (): AuditorFormDraft => {
    const nombre =
      (document.getElementById('auditorNombreInput') as HTMLInputElement | null)?.value ?? '';
    const next: AuditorFormDraft = { nombre };
    state.auditorDomain.formDraft = next;
    return next;
  };

  document.getElementById('auditorNombreInput')?.addEventListener('input', () => {
    syncAuditorDraftFromDom();
  });

  // 6. Save Auditor Detail Form ('add' or 'edit') -> public.auditor
  document.getElementById('auditorDetailForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!isApprovedStaff()) return;

    const draft = syncAuditorDraftFromDom();
    const isCreateMode =
      Boolean(state.auditorDomain.isCreating) && !state.auditorDomain.selectedAuditorId;
    const audId = state.auditorDomain.selectedAuditorId;

    const validation = validateAuditorDraft(
      draft,
      state.domainData.allAuditorsDetailed,
      isCreateMode ? undefined : audId || undefined
    );
    if (!validation.valid) {
      state.auditorDomain.editErrorMessage =
        validation.message || 'Verifique los datos del auditor.';
      render();
      return;
    }

    const norm = validation.normalized;

    if (isCreateMode) {
      const newId = crypto.randomUUID();
      const newAuditor: AuditorDetailEntity = {
        id: newId,
        nombre: norm.nombre,
        titulo_profesional: 'Auditor Técnico Evaluador',
        codigo_credencial: '',
        email: '',
        telefono: '',
        biografia: '',
        instituto_registro: 'FONDONORMA',
        categoria_profesional: 'Auditor Técnico Calificado',
        calificacion: 'Calificado',
        normas_acreditadas: [],
        sectores_iaf: [],
        competencias: [],
        normaLinks: [],
        sectorLinks: [],
        subsectorLinks: [],
        historialAuditorias: [],
      };

      state.domainData.allAuditorsDetailed = [
        newAuditor,
        ...state.domainData.allAuditorsDetailed,
      ];
      state.domainData.auditors = [
        {
          id: newId,
          nombre: norm.nombre,
          rol: newAuditor.categoria_profesional,
          normas: [],
          sectores_iaf: [],
        },
        ...state.domainData.auditors,
      ];

      state.auditorDomain.selectedAuditorId = newId;
      state.auditorDomain.isCreating = false;
      state.auditorDomain.isEditingAttributes = false;
      state.auditorDomain.formDraft = undefined;
      state.auditorDomain.editErrorMessage = null;
      state.auditorDomain.activeChildTab = 'competencias';

      const newAudSeg: BreadcrumbSegment = {
        id: `aud-${newId}`,
        label: norm.nombre,
        route: 'certificacion',
        subview: 'auditors',
        entityType: 'auditor',
        entityId: newId,
        tab: 'competencias',
        tooltip: `Auditor > ${norm.nombre}`,
      };
      if (state.breadcrumbs[state.breadcrumbs.length - 1]?.id === 'auditor-new') {
        state.breadcrumbs = [...state.breadcrumbs.slice(0, -1), newAudSeg];
      } else {
        state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, newAudSeg);
      }

      recordPhase5SessionLog('auditor', newId, 'INSERT', null, {
        nombre: norm.nombre,
      });

      void (async () => {
        try {
          const { error } = await supabase.from('auditor').insert({
            id: newId,
            nombre: norm.nombre,
          });
          if (error) {
            showFloatingToast(translateDatabaseError(error), 'warning');
            render();
          }
        } catch (err) {
          console.warn('Fallback to reactive state for auditor insert:', err);
        }
      })();

      showFloatingToast(`Auditor "${norm.nombre}" creado correctamente.`, 'success');
      render();
      return;
    }

    if (!audId) return;
    const prevAud = state.domainData.allAuditorsDetailed.find((a) => a.id === audId);

    state.domainData.allAuditorsDetailed = state.domainData.allAuditorsDetailed.map((a) =>
      a.id === audId ? { ...a, nombre: norm.nombre } : a
    );
    state.domainData.auditors = state.domainData.auditors.map((a) =>
      a.id === audId ? { ...a, nombre: norm.nombre } : a
    );
    state.breadcrumbs = state.breadcrumbs.map((seg) =>
      seg.entityType === 'auditor' && seg.entityId === audId
        ? { ...seg, label: norm.nombre, tooltip: `Auditor > ${norm.nombre}` }
        : seg
    );

    state.auditorDomain.isEditingAttributes = false;
    state.auditorDomain.formDraft = undefined;
    state.auditorDomain.editErrorMessage = null;

    recordPhase5SessionLog(
      'auditor',
      audId,
      'UPDATE',
      prevAud ? { nombre: prevAud.nombre } : null,
      { nombre: norm.nombre }
    );

    if (STRICT_UUID_PATTERN.test(audId)) {
      void (async () => {
        try {
          const { error } = await supabase
            .from('auditor')
            .update({
              nombre: norm.nombre,
              updated_at: new Date().toISOString(),
            })
            .eq('id', audId);
          if (error) {
            showFloatingToast(translateDatabaseError(error), 'warning');
            render();
          }
        } catch (err) {
          console.warn('Fallback to reactive state for auditor update:', err);
        }
      })();
    }

    showFloatingToast('Atributos del auditor guardados exitosamente.', 'success');
    render();
  });

  // 7. Competencia de Auditor: Add Mode & Read Mode + Live Sector -> Subsector Cascade
  document.querySelectorAll<HTMLElement>('[data-action="open-add-competency"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!isApprovedStaff()) return;
      const audId = btn.dataset.auditorId || state.auditorDomain.selectedAuditorId || '';
      clearAllEntitySelections();
      state.activeRoute = 'certificacion';
      state.activeSubSection = 'auditors';
      state.competenciaAuditorDomain = {
        isOpen: true,
        mode: 'add',
        selectedComp: null,
        prefillAuditorId: audId || null,
        formDraft: createEmptyCompetenciaFormDraft(audId, 'norma'),
        errorMessage: null,
        confirmUnlink: false,
      };
      state.breadcrumbs = pushBreadcrumb(
        state.breadcrumbs,
        createNewEntityBreadcrumbSegment({
          entityType: 'competencia_auditor',
          label: 'Asignar Competencia',
          route: 'certificacion',
          subview: 'auditors',
          parentEntityId: audId || undefined,
          tooltip: 'Auditor > Asignar Competencia',
        })
      );
      syncUrlHash('certificacion', 'auditors');
      render();
    });
  });

  document
    .querySelectorAll<HTMLElement>('[data-action="select-competencia-auditor"]')
    .forEach((row) => {
      row.addEventListener('click', (e) => {
        if (row.tagName === 'TR') {
          const target = e.target as HTMLElement | null;
          if (target?.closest('button, a, input, select')) return;
        }
        const compAudId = row.dataset.auditorId || '';
        const compTipoRaw = row.dataset.compTipo || 'norma';
        const compTargetId = row.dataset.targetId || '';
        if (!compAudId || !compTargetId) return;

        const compTipo: CompetenciaTipo =
          compTipoRaw === 'sector_iaf' || compTipoRaw === 'subsector_iaf'
            ? compTipoRaw
            : 'norma';

        const auditor = state.domainData.allAuditorsDetailed.find((a) => a.id === compAudId);
        let segLabel = 'Competencia';
        if (compTipo === 'norma') {
          const matchedNorma = getResolvedNormasCatalog().find((n) => n.id === compTargetId);
          segLabel = matchedNorma?.codigo || matchedNorma?.norma || 'Norma ISO';
        } else if (compTipo === 'sector_iaf') {
          const matchedSec = getResolvedSectoresCatalog().find((s) => s.id === compTargetId);
          segLabel = matchedSec ? `Sector IAF ${matchedSec.sector}` : 'Sector IAF';
        } else {
          const matchedSub = getResolvedSubsectoresCatalog().find((s) => s.id === compTargetId);
          segLabel = matchedSub ? `Sub-Sector ${matchedSub.codigo}` : 'Sub-Sector IAF';
        }

        clearAllEntitySelections();
        state.activeRoute = 'certificacion';
        state.activeSubSection = 'auditors';
        state.competenciaAuditorDomain = {
          isOpen: true,
          mode: 'read',
          selectedComp: {
            id_auditor: compAudId,
            tipo: compTipo,
            targetId: compTargetId,
          },
          prefillAuditorId: compAudId,
          formDraft: undefined,
          errorMessage: null,
          confirmUnlink: false,
        };
        state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
          id: `competencia_auditor-${compAudId}-${compTipo}-${compTargetId}`,
          label: segLabel,
          route: 'certificacion',
          subview: 'auditors',
          entityType: 'competencia_auditor',
          entityId: `${compAudId}:${compTipo}:${compTargetId}`,
          parentEntityId: compAudId,
          tooltip: `${auditor?.nombre || 'Auditor'} > ${segLabel}`,
        });
        syncUrlHash('certificacion', 'auditors');
        render();
      });
    });

  document
    .querySelectorAll<HTMLElement>('[data-action="back-to-competencia-parent"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.navBack === 'true') return;
        backtrackToParentBreadcrumb();
        render();
      });
    });

  document.getElementById('cancelCompetenciaBtn')?.addEventListener('click', () => {
    backtrackToParentBreadcrumb();
    render();
  });

  const syncCompetenciaDraftFromDom = (): CompetenciaAuditorFormDraft => {
    const current =
      state.competenciaAuditorDomain.formDraft ?? createEmptyCompetenciaFormDraft('', 'norma');
    const id_auditor =
      (document.getElementById('compParentAuditorSelect') as HTMLSelectElement | null)?.value ??
      current.id_auditor;
    const rawTipo =
      (document.getElementById('compSelectTipo') as HTMLSelectElement | null)?.value ??
      current.tipo;
    const tipo: CompetenciaTipo =
      rawTipo === 'sector_iaf' || rawTipo === 'subsector_iaf' ? rawTipo : 'norma';
    const id_norma =
      (document.getElementById('compSelectNorma') as HTMLSelectElement | null)?.value ??
      current.id_norma;
    const id_sector_iaf =
      (document.getElementById('compSelectSector') as HTMLSelectElement | null)?.value ??
      current.id_sector_iaf;
    const id_subsector_iaf =
      (document.getElementById('compSelectSubsector') as HTMLSelectElement | null)?.value ??
      current.id_subsector_iaf;

    const next: CompetenciaAuditorFormDraft = {
      id_auditor,
      tipo,
      id_norma,
      id_sector_iaf,
      id_subsector_iaf,
    };
    state.competenciaAuditorDomain.formDraft = next;
    return next;
  };

  document.getElementById('compParentAuditorSelect')?.addEventListener('change', () => {
    syncCompetenciaDraftFromDom();
    state.competenciaAuditorDomain.errorMessage = null;
  });

  document.getElementById('compSelectTipo')?.addEventListener('change', (e) => {
    const prev = syncCompetenciaDraftFromDom();
    const rawTipo = (e.target as HTMLSelectElement).value;
    const nextTipo: CompetenciaTipo =
      rawTipo === 'sector_iaf' || rawTipo === 'subsector_iaf' ? rawTipo : 'norma';
    state.competenciaAuditorDomain.formDraft = {
      id_auditor: prev.id_auditor,
      tipo: nextTipo,
      id_norma: '',
      id_sector_iaf: '',
      id_subsector_iaf: '',
    };
    state.competenciaAuditorDomain.errorMessage = null;
    render();
  });

  document.getElementById('compSelectNorma')?.addEventListener('change', () => {
    syncCompetenciaDraftFromDom();
    state.competenciaAuditorDomain.errorMessage = null;
  });

  document.getElementById('compSelectSector')?.addEventListener('change', (e) => {
    const prev = syncCompetenciaDraftFromDom();
    const nextSectorId = (e.target as HTMLSelectElement).value;
    if (prev.tipo === 'subsector_iaf') {
      const cascaded = applyCompetenciaSectorCascade({
        draft: prev,
        nextSectorId,
        sectores: getResolvedSectoresCatalog(),
        subsectores: getResolvedSubsectoresCatalog(),
      });
      state.competenciaAuditorDomain.formDraft = cascaded.draft;
      state.competenciaAuditorDomain.errorMessage = null;
      render();
      return;
    }
    state.competenciaAuditorDomain.formDraft = {
      ...prev,
      id_sector_iaf: nextSectorId,
    };
    state.competenciaAuditorDomain.errorMessage = null;
  });

  document.getElementById('compSelectSubsector')?.addEventListener('change', () => {
    syncCompetenciaDraftFromDom();
    state.competenciaAuditorDomain.errorMessage = null;
  });

  document.getElementById('competenciaAuditorDetailForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!isApprovedStaff()) return;

    const draft = syncCompetenciaDraftFromDom();
    const normas = getResolvedNormasCatalog();
    const sectores = getResolvedSectoresCatalog();
    const subsectores = getResolvedSubsectoresCatalog();

    const validation = validateCompetenciaDraft({
      draft,
      auditors: state.domainData.allAuditorsDetailed,
      normas,
      sectores,
      subsectores,
    });
    if (!validation.valid || !validation.normalized) {
      state.competenciaAuditorDomain.errorMessage =
        validation.message || 'Verifique los datos de la competencia técnica.';
      render();
      return;
    }

    const norm = validation.normalized;
    const prevAuditor = state.domainData.allAuditorsDetailed.find((a) => a.id === norm.id_auditor);
    if (!prevAuditor) return;

    const updatedAuditor = addCompetenciaLinkToAuditor({
      auditor: prevAuditor,
      draft: norm,
      normas,
      sectores,
      subsectores,
    });

    state.domainData.allAuditorsDetailed = state.domainData.allAuditorsDetailed.map((a) =>
      a.id === norm.id_auditor ? updatedAuditor : a
    );
    state.domainData.auditors = state.domainData.auditors.map((a) =>
      a.id === norm.id_auditor
        ? {
            ...a,
            normas: updatedAuditor.normas_acreditadas,
            sectores_iaf: updatedAuditor.sectores_iaf,
          }
        : a
    );

    const persistCompetency = async (): Promise<void> => {
      const tableName =
        norm.tipo === 'norma'
          ? 'norma_auditor'
          : norm.tipo === 'sector_iaf'
          ? 'sector_iaf_auditor'
          : 'subsector_iaf_auditor';
      const targetId =
        norm.tipo === 'norma'
          ? norm.id_norma
          : norm.tipo === 'sector_iaf'
          ? norm.id_sector_iaf
          : norm.id_subsector_iaf;
      const payload =
        norm.tipo === 'norma'
          ? { id_auditor: norm.id_auditor, id_norma: norm.id_norma }
          : norm.tipo === 'sector_iaf'
          ? { id_auditor: norm.id_auditor, id_sector_iaf: norm.id_sector_iaf }
          : { id_auditor: norm.id_auditor, id_subsector_iaf: norm.id_subsector_iaf };

      recordPhase5SessionLog(tableName, `${norm.id_auditor}:${targetId}`, 'INSERT', null, payload);

      if (STRICT_UUID_PATTERN.test(norm.id_auditor) && STRICT_UUID_PATTERN.test(targetId)) {
        try {
          const res =
            norm.tipo === 'norma'
              ? await supabase
                  .from('norma_auditor')
                  .insert({ id_auditor: norm.id_auditor, id_norma: norm.id_norma })
              : norm.tipo === 'sector_iaf'
              ? await supabase
                  .from('sector_iaf_auditor')
                  .insert({ id_auditor: norm.id_auditor, id_sector_iaf: norm.id_sector_iaf })
              : await supabase
                  .from('subsector_iaf_auditor')
                  .insert({ id_auditor: norm.id_auditor, id_subsector_iaf: norm.id_subsector_iaf });
          if (res.error) {
            showFloatingToast(translateDatabaseError(res.error), 'warning');
            render();
          }
        } catch (err) {
          console.warn(`Fallback to reactive state for ${tableName} insert:`, err);
        }
      }
    };

    void persistCompetency();
    showFloatingToast('Competencia técnica vinculada correctamente.', 'success');
    backtrackToParentBreadcrumb();
    render();
  });

  document.querySelectorAll<HTMLElement>('[data-action="unlink-competencia"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!isApprovedStaff()) return;
      state.competenciaAuditorDomain.confirmUnlink = true;
      state.competenciaAuditorDomain.errorMessage = null;
      render();
    });
  });

  document
    .querySelectorAll<HTMLElement>('[data-action="cancel-unlink-competencia"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        state.competenciaAuditorDomain.confirmUnlink = false;
        render();
      });
    });

  document
    .querySelectorAll<HTMLElement>('[data-action="confirm-unlink-competencia"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!isApprovedStaff()) return;
        const selectedComp = state.competenciaAuditorDomain.selectedComp;
        const compAudId = btn.dataset.auditorId || selectedComp?.id_auditor || '';
        const rawTipo = btn.dataset.compTipo || selectedComp?.tipo || 'norma';
        const compTipo: CompetenciaTipo =
          rawTipo === 'sector_iaf' || rawTipo === 'subsector_iaf' ? rawTipo : 'norma';
        const compTargetId = btn.dataset.targetId || selectedComp?.targetId || '';
        if (!compAudId || !compTargetId) return;

        const normas = getResolvedNormasCatalog();
        const sectores = getResolvedSectoresCatalog();
        const subsectores = getResolvedSubsectoresCatalog();
        const prevAuditor = state.domainData.allAuditorsDetailed.find((a) => a.id === compAudId);
        if (!prevAuditor) return;

        const updatedAuditor = removeCompetenciaLinkFromAuditor({
          auditor: prevAuditor,
          tipo: compTipo,
          targetId: compTargetId,
          normas,
          sectores,
          subsectores,
        });

        state.domainData.allAuditorsDetailed = state.domainData.allAuditorsDetailed.map((a) =>
          a.id === compAudId ? updatedAuditor : a
        );
        state.domainData.auditors = state.domainData.auditors.map((a) =>
          a.id === compAudId
            ? {
                ...a,
                normas: updatedAuditor.normas_acreditadas,
                sectores_iaf: updatedAuditor.sectores_iaf,
              }
            : a
        );

        const tableName =
          compTipo === 'norma'
            ? 'norma_auditor'
            : compTipo === 'sector_iaf'
            ? 'sector_iaf_auditor'
            : 'subsector_iaf_auditor';
        const fkColumn =
          compTipo === 'norma'
            ? 'id_norma'
            : compTipo === 'sector_iaf'
            ? 'id_sector_iaf'
            : 'id_subsector_iaf';

        recordPhase5SessionLog(
          tableName,
          `${compAudId}:${compTargetId}`,
          'DELETE',
          { id_auditor: compAudId, [fkColumn]: compTargetId },
          null
        );

        if (STRICT_UUID_PATTERN.test(compAudId) && STRICT_UUID_PATTERN.test(compTargetId)) {
          void (async () => {
            try {
              const { error } = await supabase
                .from(tableName)
                .delete()
                .match({ id_auditor: compAudId, [fkColumn]: compTargetId });
              if (error) {
                showFloatingToast(translateDatabaseError(error), 'warning');
                render();
              }
            } catch (err) {
              console.warn(`Fallback to reactive state for ${tableName} delete:`, err);
            }
          })();
        }

        showFloatingToast('Competencia desvinculada correctamente.', 'success');
        backtrackToParentBreadcrumb();
        render();
      });
    });

  // 13. Cross-entity navigation from Auditor / Norma / Certificado tables
  document
    .querySelectorAll<HTMLElement>('[data-action="view-norma-from-auditor"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        const normaCode = btn.dataset.normaCode || '';
        const matchedNorma =
          INITIAL_NORMAS.find(
            (n) =>
              n.codigo.toLowerCase() === normaCode.toLowerCase() ||
              n.norma.toLowerCase() === normaCode.toLowerCase()
          ) ||
          state.domainData.standards.find(
            (s) =>
              s.norma.toLowerCase() === normaCode.toLowerCase() ||
              (s.codigo || '').toLowerCase() === normaCode.toLowerCase()
          );
        const resolvedId = matchedNorma?.id || null;
        state.activeRoute = 'extra';
        state.activeSubSection = 'standards';
        state.extraDomain.selectedNormaId = resolvedId;
        if (resolvedId) {
          state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
            id: `norma-${resolvedId}`,
            label: matchedNorma?.norma || normaCode || 'Norma ISO',
            route: 'extra',
            subview: 'standards',
            entityType: 'norma',
            entityId: resolvedId,
            tab: state.extraDomain.activeNormaTab,
            tooltip: `Norma ISO > ${matchedNorma?.norma || normaCode}`,
          });
        }
        syncUrlHash('extra', 'standards');
        render();
      });
    });

  document
    .querySelectorAll<HTMLElement>('[data-action="view-iaf-from-auditor"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        const secNum = btn.dataset.sectorNumber || '';
        const matchedSector =
          INITIAL_SECTORES_IAF.find((s) => String(s.sector) === secNum) ||
          state.domainData.iafSectors.find((s) => String(s.sector) === secNum);
        const resolvedId = matchedSector?.id || null;
        state.activeRoute = 'extra';
        state.activeSubSection = 'iaf';
        state.extraDomain.selectedSectorId = resolvedId;
        if (resolvedId) {
          state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
            id: `sector-${resolvedId}`,
            label: `Sector ${matchedSector?.sector ?? secNum}`,
            route: 'extra',
            subview: 'iaf',
            entityType: 'sector_iaf',
            entityId: resolvedId,
            tab: state.extraDomain.activeSectorTab,
            tooltip: `Sector IAF > ${matchedSector?.descripcion || secNum}`,
          });
        }
        syncUrlHash('extra', 'iaf');
        render();
      });
    });

  // --- Requisitos No Aplicables Detail View Navigation & CRUD (Step 4.1) ---
  const navigateToNoAplicableDetail = (noAplicableId: string): void => {
    if (!noAplicableId) return;
    if (
      !canAccessRoute(state.profile, 'certificacion') &&
      !(state.profile?.role === 'AUDITOR' && state.profile?.status === 'APPROVED')
    ) {
      return;
    }

    const resolved = resolveNoAplicableDetailById({
      noAplicableId,
      certificates: state.domainData.allCertificadosDetailed,
      requirementsCatalog:
        state.domainData.requirementsCatalog.length > 0
          ? state.domainData.requirementsCatalog
          : getAllSeededNormaRequirements(),
      archivedNoAplicableIds: state.domainData.archivedNoAplicableIds,
    });
    if (!resolved) return;

    if (state.certificadoDomain.selectedCertId) {
      syncCurrentBreadcrumbTab('no_aplicables');
    }

    clearAllEntitySelections();
    state.activeRoute = 'certificacion';
    state.activeSubSection = 'certificates';
    state.noAplicableDomain = {
      selectedNoAplicableId: resolved.id,
      originatingCertId: resolved.id_certificado,
      isCreating: false,
      isEditingAttributes: false,
      formDraft: undefined,
      editErrorMessage: null,
      archiveConfirmOpen: false,
      archiveErrorMessage: null,
    };

    state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
      id: `no-aplicable-${resolved.id}`,
      label: `Cláusula ${resolved.requisito_codigo}`,
      route: 'certificacion',
      subview: 'certificates',
      entityType: 'no_aplicable',
      entityId: resolved.id,
      tooltip: `${resolved.numero_certificado} > Exclusión Cláusula ${resolved.requisito_codigo} — ${resolved.requisito_titulo}`,
    });
    syncUrlHash('certificacion', 'certificates');
    render();
  };

  document
    .querySelectorAll<HTMLElement>('[data-action="select-no-aplicable"]')
    .forEach((row) => {
      row.addEventListener('click', (e) => {
        if (row.tagName === 'TR') {
          const target = e.target as HTMLElement | null;
          if (target?.closest('button, a, input, select')) return;
        }
        const directId = (row.dataset.noAplicableId || '').trim();
        if (directId) {
          navigateToNoAplicableDetail(directId);
          return;
        }
        const certIdAttr = row.dataset.certId || state.certificadoDomain.selectedCertId || '';
        const requisitoIdAttr = row.dataset.requisitoId || '';
        const codigoAttr = (row.dataset.codigo || '').trim().toLowerCase();
        const cert = state.domainData.allCertificadosDetailed.find((c) => c.id === certIdAttr);
        const fallbackItem = cert?.noAplicables.find(
          (na) =>
            !state.domainData.archivedNoAplicableIds.has(na.id) &&
            ((requisitoIdAttr && na.id_requisito === requisitoIdAttr) ||
              (codigoAttr && na.requisito_codigo.trim().toLowerCase() === codigoAttr))
        );
        if (fallbackItem) {
          navigateToNoAplicableDetail(fallbackItem.id);
        }
      });
    });

  document
    .querySelectorAll<HTMLElement>('[data-action="open-create-no-aplicable"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!isApprovedStaff()) return;
        const certId = btn.dataset.certId || state.certificadoDomain.selectedCertId || null;
        if (state.certificadoDomain.selectedCertId) {
          syncCurrentBreadcrumbTab('no_aplicables');
        }
        const cert = certId
          ? state.domainData.allCertificadosDetailed.find((c) => c.id === certId)
          : undefined;

        clearAllEntitySelections();
        state.activeRoute = 'certificacion';
        state.activeSubSection = 'certificates';
        state.noAplicableDomain = {
          selectedNoAplicableId: null,
          originatingCertId: certId,
          isCreating: true,
          isEditingAttributes: false,
          formDraft: createEmptyNoAplicableFormDraft(certId),
          editErrorMessage: null,
          archiveConfirmOpen: false,
          archiveErrorMessage: null,
        };

        state.breadcrumbs = pushBreadcrumb(
          state.breadcrumbs,
          createNewEntityBreadcrumbSegment({
            entityType: 'no_aplicable',
            label: 'Declarar Exclusión',
            route: 'certificacion',
            subview: 'certificates',
            parentEntityId: certId || undefined,
            tooltip: cert
              ? `Certificado ${cert.numero_certificado} > Declarar Exclusión (ISO 4.3)`
              : 'Declarar Exclusión (ISO 4.3)',
          })
        );
        syncUrlHash('certificacion', 'certificates');
        render();
      });
    });

  document
    .querySelectorAll<HTMLElement>('[data-action="back-from-no-aplicable"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.navBack === 'true') return;
        backtrackToParentBreadcrumb();
        render();
      });
    });

  const readNoAplicableFormDraftFromDom = (): NoAplicableFormDraft => {
    const certSelect = document.getElementById('naSelectCertificado') as HTMLSelectElement | null;
    const reqSelect = document.getElementById('naSelectRequisito') as HTMLSelectElement | null;
    const justInput = document.getElementById('naJustificacionInput') as HTMLTextAreaElement | null;
    return {
      id_certificado: certSelect?.value || state.noAplicableDomain.formDraft?.id_certificado || '',
      id_requisito: reqSelect?.value || state.noAplicableDomain.formDraft?.id_requisito || '',
      justificacion: justInput?.value ?? state.noAplicableDomain.formDraft?.justificacion ?? '',
    };
  };

  document.getElementById('naSelectCertificado')?.addEventListener('change', (e) => {
    const nextCertId = (e.target as HTMLSelectElement).value;
    const currentDraft = readNoAplicableFormDraftFromDom();
    state.noAplicableDomain.formDraft = reconcileNoAplicableDraftOnCertChange({
      draft: currentDraft,
      nextCertId,
      certificates: state.domainData.allCertificadosDetailed,
      requirementsCatalog:
        state.domainData.requirementsCatalog.length > 0
          ? state.domainData.requirementsCatalog
          : getAllSeededNormaRequirements(),
      currentNoAplicableId: state.noAplicableDomain.isEditingAttributes
        ? state.noAplicableDomain.selectedNoAplicableId
        : null,
      archivedNoAplicableIds: state.domainData.archivedNoAplicableIds,
    });
    state.noAplicableDomain.editErrorMessage = null;
    render();
  });

  document.getElementById('naSelectRequisito')?.addEventListener('change', () => {
    state.noAplicableDomain.formDraft = readNoAplicableFormDraftFromDom();
    state.noAplicableDomain.editErrorMessage = null;
    render();
  });

  document.getElementById('naJustificacionInput')?.addEventListener('input', (e) => {
    const val = (e.target as HTMLTextAreaElement).value;
    if (state.noAplicableDomain.formDraft) {
      state.noAplicableDomain.formDraft = {
        ...state.noAplicableDomain.formDraft,
        justificacion: val,
      };
    }
    const counter = document.getElementById('naJustificacionCharCount');
    if (counter) {
      counter.textContent = String(val.length);
    }
  });

  document.getElementById('startEditNoAplicableBtn')?.addEventListener('click', () => {
    if (!isApprovedStaff()) return;
    const naId = state.noAplicableDomain.selectedNoAplicableId;
    if (!naId) return;
    const current = resolveNoAplicableDetailById({
      noAplicableId: naId,
      certificates: state.domainData.allCertificadosDetailed,
      requirementsCatalog:
        state.domainData.requirementsCatalog.length > 0
          ? state.domainData.requirementsCatalog
          : getAllSeededNormaRequirements(),
      archivedNoAplicableIds: state.domainData.archivedNoAplicableIds,
    });
    if (!current) return;

    state.noAplicableDomain.isCreating = false;
    state.noAplicableDomain.isEditingAttributes = true;
    state.noAplicableDomain.editErrorMessage = null;
    state.noAplicableDomain.archiveErrorMessage = null;
    state.noAplicableDomain.formDraft = createNoAplicableFormDraftFromEntity(current);
    render();
  });

  document.getElementById('cancelNoAplicableBtn')?.addEventListener('click', () => {
    if (state.noAplicableDomain.isCreating) {
      backtrackToParentBreadcrumb();
      render();
      return;
    }
    state.noAplicableDomain.isEditingAttributes = false;
    state.noAplicableDomain.formDraft = undefined;
    state.noAplicableDomain.editErrorMessage = null;
    render();
  });

  document.getElementById('noAplicableDetailForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isApprovedStaff()) return;

    const isCreating = Boolean(state.noAplicableDomain.isCreating);
    const currentId = state.noAplicableDomain.selectedNoAplicableId;
    if (!isCreating && !currentId) return;

    const reqCatalog =
      state.domainData.requirementsCatalog.length > 0
        ? state.domainData.requirementsCatalog
        : getAllSeededNormaRequirements();

    const draft = readNoAplicableFormDraftFromDom();
    state.noAplicableDomain.formDraft = draft;

    const validation = validateNoAplicableDraft({
      draft,
      certificates: state.domainData.allCertificadosDetailed,
      requirementsCatalog: reqCatalog,
      currentNoAplicableId: isCreating ? null : currentId,
      archivedNoAplicableIds: state.domainData.archivedNoAplicableIds,
    });

    if (!validation.valid || !validation.normalized) {
      state.noAplicableDomain.editErrorMessage =
        validation.error || 'No se pudo validar la exclusión del requisito.';
      render();
      return;
    }

    const norm = validation.normalized;
    const targetCert = state.domainData.allCertificadosDetailed.find(
      (c) => c.id === norm.id_certificado
    );
    if (!targetCert) return;

    if (isCreating) {
      const newId = crypto.randomUUID();
      if (STRICT_UUID_PATTERN.test(norm.id_certificado) && STRICT_UUID_PATTERN.test(norm.id_requisito)) {
        try {
          const { error } = await supabase.from('requisitos_no_aplicables_certificado').insert({
            id: newId,
            id_certificado: norm.id_certificado,
            id_requisito: norm.id_requisito,
            justificacion: norm.justificacion,
          });
          if (error && !isMissingTableOrSchemaError(error)) {
            state.noAplicableDomain.editErrorMessage = translateCertSubEntityDbError(
              error,
              'requisitos_no_aplicables_certificado'
            );
            render();
            return;
          }
        } catch {
          // Offline / reactive fallback preserved
        }
      }

      const newExclusion = {
        id: newId,
        id_certificado: targetCert.id,
        id_requisito: norm.id_requisito,
        requisito_codigo: norm.requisito_codigo,
        requisito_titulo: norm.requisito_titulo,
        ruta_materializada: norm.ruta_materializada,
        justificacion: norm.justificacion,
      };

      state.domainData.allCertificadosDetailed = state.domainData.allCertificadosDetailed.map(
        (c) =>
          c.id === targetCert.id
            ? { ...c, noAplicables: [newExclusion, ...(c.noAplicables || [])] }
            : c
      );

      const nextSegment = {
        id: `no-aplicable-${newId}`,
        label: `Cláusula ${norm.requisito_codigo}`,
        route: 'certificacion' as const,
        subview: 'certificates' as const,
        entityType: 'no_aplicable' as const,
        entityId: newId,
        tooltip: `${targetCert.numero_certificado} > Exclusión Cláusula ${norm.requisito_codigo} — ${norm.requisito_titulo}`,
      };
      state.breadcrumbs = state.breadcrumbs.some((seg) => seg.id === 'no_aplicable-new')
        ? state.breadcrumbs.map((seg) => (seg.id === 'no_aplicable-new' ? nextSegment : seg))
        : pushBreadcrumb(state.breadcrumbs, nextSegment);

      recordPhase5SessionLog('requisitos_no_aplicables_certificado', newId, 'INSERT', null, {
        id_certificado: norm.id_certificado,
        id_requisito: norm.id_requisito,
        requisito_codigo: norm.requisito_codigo,
        justificacion: norm.justificacion,
      });

      state.noAplicableDomain.selectedNoAplicableId = newId;
      state.noAplicableDomain.originatingCertId = norm.id_certificado;
      state.noAplicableDomain.isCreating = false;
      state.noAplicableDomain.isEditingAttributes = false;
      state.noAplicableDomain.formDraft = undefined;
      state.noAplicableDomain.editErrorMessage = null;
      showFloatingToast('Exclusión declarada correctamente bajo Cláusula ISO 4.3.', 'success');
      syncUrlHash('certificacion', 'certificates');
      render();
      return;
    }

    const current = resolveNoAplicableDetailById({
      noAplicableId: currentId!,
      certificates: state.domainData.allCertificadosDetailed,
      requirementsCatalog: reqCatalog,
      archivedNoAplicableIds: state.domainData.archivedNoAplicableIds,
    });
    if (!current) return;

    if (
      STRICT_UUID_PATTERN.test(currentId!) &&
      STRICT_UUID_PATTERN.test(norm.id_certificado) &&
      STRICT_UUID_PATTERN.test(norm.id_requisito)
    ) {
      try {
        const { error } = await supabase
          .from('requisitos_no_aplicables_certificado')
          .update({
            id_certificado: norm.id_certificado,
            id_requisito: norm.id_requisito,
            justificacion: norm.justificacion,
            updated_at: new Date().toISOString(),
          })
          .eq('id', currentId!);
        if (error && !isMissingTableOrSchemaError(error)) {
          state.noAplicableDomain.editErrorMessage = translateCertSubEntityDbError(
            error,
            'requisitos_no_aplicables_certificado'
          );
          render();
          return;
        }
      } catch {
        // Offline / reactive fallback preserved
      }
    }

    const oldSnapshot = {
      id_certificado: current.id_certificado,
      id_requisito: current.id_requisito,
      justificacion: current.justificacion,
    };

    const updatedItem = {
      id: currentId!,
      id_certificado: targetCert.id,
      id_requisito: norm.id_requisito,
      requisito_codigo: norm.requisito_codigo,
      requisito_titulo: norm.requisito_titulo,
      ruta_materializada: norm.ruta_materializada,
      justificacion: norm.justificacion,
    };

    state.domainData.allCertificadosDetailed = state.domainData.allCertificadosDetailed.map((c) => {
      const withoutCurrent = (c.noAplicables || []).filter((na) => na.id !== currentId);
      if (c.id === targetCert.id) {
        return {
          ...c,
          noAplicables: [updatedItem, ...withoutCurrent],
        };
      }
      if (withoutCurrent.length !== (c.noAplicables || []).length) {
        return {
          ...c,
          noAplicables: withoutCurrent,
        };
      }
      return c;
    });

    state.breadcrumbs = state.breadcrumbs.map((seg) =>
      seg.entityType === 'no_aplicable' && seg.entityId === currentId
        ? {
            ...seg,
            label: `Cláusula ${norm.requisito_codigo}`,
            tooltip: `${targetCert.numero_certificado} > Exclusión Cláusula ${norm.requisito_codigo} — ${norm.requisito_titulo}`,
          }
        : seg
    );

    recordPhase5SessionLog('requisitos_no_aplicables_certificado', currentId!, 'UPDATE', oldSnapshot, {
      id_certificado: norm.id_certificado,
      id_requisito: norm.id_requisito,
      requisito_codigo: norm.requisito_codigo,
      justificacion: norm.justificacion,
    });

    state.noAplicableDomain.originatingCertId = norm.id_certificado;
    state.noAplicableDomain.isEditingAttributes = false;
    state.noAplicableDomain.formDraft = undefined;
    state.noAplicableDomain.editErrorMessage = null;
    showFloatingToast('Exclusión ISO 4.3 actualizada correctamente.', 'success');
    render();
  });

  document
    .querySelectorAll<HTMLElement>('[data-action="open-archive-no-aplicable"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!canArchiveRecord(state.profile)) return;
        const naId = btn.dataset.noAplicableId || state.noAplicableDomain.selectedNoAplicableId;
        if (!naId) return;
        const current = resolveNoAplicableDetailById({
          noAplicableId: naId,
          certificates: state.domainData.allCertificadosDetailed,
          requirementsCatalog:
            state.domainData.requirementsCatalog.length > 0
              ? state.domainData.requirementsCatalog
              : getAllSeededNormaRequirements(),
          archivedNoAplicableIds: state.domainData.archivedNoAplicableIds,
        });
        if (!current) return;
        void openArchiveModal({
          tableName: 'requisitos_no_aplicables_certificado',
          recordId: current.id,
          entityTypeLabel: 'Exclusión de Requisito (ISO 4.3)',
          recordTitle: `Cláusula ${current.requisito_codigo}`,
          recordSubtitle: `${current.numero_certificado} · ${current.norma_codigo}`,
        });
      });
    });

  document
    .querySelectorAll<HTMLElement>('[data-action="select-prog-audit-by-code"]')
    .forEach((row) => {
      row.addEventListener('click', (e) => {
        if (row.tagName === 'TR') {
          const target = e.target as HTMLElement | null;
          if (target?.closest('button, a, input, select')) return;
        }
        const auditIdAttr = row.dataset.auditId || '';
        const auditCode = row.dataset.auditCode || '';
        const matchedAudit =
          state.domainData.programacionAudits.find(
            (a) =>
              (auditIdAttr && a.id === auditIdAttr) ||
              (auditCode && a.codigo_auditoria.toLowerCase() === auditCode.toLowerCase())
          ) || state.domainData.programacionAudits[0];
        if (!matchedAudit) return;
        if (state.certificadoDomain.selectedCertId) {
          syncCurrentBreadcrumbTab('auditorias');
        }
        state.activeRoute = 'auditorias';
        state.activeSubSection = 'scheduling';
        state.programacionDomain.selectedAuditId = matchedAudit.id;
        state.programacionDomain.activeChildTab = 'equipo';
        state.programacionDomain.isEditingAttributes = false;
        state.programacionDomain.isAddingTeamMember = false;
        state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
          id: `prog-audit-${matchedAudit.id}`,
          label: matchedAudit.codigo_auditoria,
          route: 'auditorias',
          subview: 'scheduling',
          entityType: 'audit',
          entityId: matchedAudit.id,
          tab: 'equipo',
          tooltip: `${matchedAudit.codigo_auditoria} — ${matchedAudit.organizacion_nombre}`,
        });
        syncUrlHash('auditorias', 'scheduling');
        render();
      });
    });

  // ===============================================
  // DOMAIN AUDITORÍAS (Phase 5: Programación, Calendario & Resultado)
  // ===============================================
  bindPhase5AuditoriasEvents();
}

function recordPhase5SessionLog(
  tableName: string,
  recordId: string,
  operation: 'INSERT' | 'UPDATE' | 'DELETE',
  oldData: Record<string, unknown> | null,
  newData: Record<string, unknown> | null
): void {
  const actorEmail = state.user?.email || state.profile?.nombre || 'admin@fondonorma.test';
  const baseEntry = createSessionAuditLogEntry({
    tableName,
    recordId,
    operation,
    actorEmail,
    oldData,
    newData,
  });
  const entry: AuditLogEntry = {
    ...baseEntry,
    actor_user_id: state.user?.id || null,
    performed_by: state.user?.id || null,
    actor_name: state.profile?.nombre || null,
    actor_email: state.user?.email || null,
    performed_at: baseEntry.changed_at,
  };
  state.domainData.sessionAuditLogs = [entry, ...state.domainData.sessionAuditLogs];
}

function bindPhase5AuditoriasEvents(): void {
  const canPlan = canEditAuditScheduleOrTeam(state.profile);
  const canEditSchedule = canEditAuditScheduleOrTeam(state.profile);

  // --- A. Programación de Auditorías --- (Directory controls handled by bindMultiViewDirectoryControls)

  document.querySelectorAll<HTMLElement>('[data-action="select-prog-audit"]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (el.tagName === 'TR') {
        const target = e.target as HTMLElement | null;
        if (target?.closest('button, a, input, select')) return;
      }
      const auditId = el.dataset.auditId;
      if (!auditId) return;
      const audit = state.domainData.programacionAudits.find((a) => a.id === auditId);
      state.activeRoute = 'auditorias';
      state.activeSubSection = 'scheduling';
      state.programacionDomain.selectedAuditId = auditId;
      state.programacionDomain.activeChildTab = 'equipo';
      state.programacionDomain.isEditingAttributes = false;
      state.programacionDomain.isAddingTeamMember = false;
      state.programacionDomain.editErrorMessage = null;
      state.programacionDomain.saveSuccessMessage = null;
      state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
        id: `prog-audit-${auditId}`,
        label: audit?.codigo_auditoria || 'Auditoría',
        route: 'auditorias',
        subview: 'scheduling',
        entityType: 'audit',
        entityId: auditId,
        tab: 'equipo',
        tooltip: audit ? `${audit.codigo_auditoria} — ${audit.organizacion_nombre}` : 'Programación de Auditoría',
      });
      syncUrlHash('auditorias', 'scheduling');
      render();
    });
  });

  const backProgBtn = document.getElementById('backToProgramacionListBtn');
  backProgBtn?.addEventListener('click', () => {
    if (backProgBtn.dataset.navBack === 'true') return;
    backtrackToParentBreadcrumb();
    render();
  });

  document.querySelectorAll<HTMLElement>('[data-action="go-audit-results"]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (el.tagName === 'TR') {
        const target = e.target as HTMLElement | null;
        if (target?.closest('button, a, input, select')) return;
      }
      const auditId = el.dataset.auditId;
      if (!auditId) return;
      const audit = state.domainData.programacionAudits.find((a) => a.id === auditId);
      state.activeRoute = 'auditorias';
      state.activeSubSection = 'findings';
      state.resultadoDomain.activeAuditIdForDecision = auditId;
      state.resultadoDomain.selectedAuditId = auditId;
      state.resultadoDomain.recommendationError = null;
      state.resultadoDomain.recommendationSuccess = null;
      state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
        id: `resultados-${auditId}`,
        label: audit ? `Resultados · ${audit.codigo_auditoria}` : 'Resultado',
        route: 'auditorias',
        subview: 'findings',
        entityType: 'audit',
        entityId: auditId,
        tooltip: audit ? `Resultados > ${audit.codigo_auditoria}` : 'Auditoría > Resultado',
      });
      syncUrlHash('auditorias', 'findings');
      render();
    });
  });

  document.querySelectorAll<HTMLElement>('[data-action="open-org-from-audit"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const orgId = btn.dataset.orgId;
      if (!orgId) return;
      const canCrossOrg =
        canAccessRoute(state.profile, 'certificacion') ||
        (state.profile?.role === 'AUDITOR' && state.profile?.status === 'APPROVED');
      if (!canCrossOrg) return;

      const org =
        state.domainData.allOrganizaciones.find((o) => o.id === orgId) ||
        INITIAL_ORGANIZACIONES.find((o) => o.id === orgId);

      clearAllEntitySelections();
      state.activeRoute = 'certificacion';
      state.activeSubSection = 'organizations';
      state.organizacionDomain.selectedOrganizacionId = orgId;
      state.organizacionDomain.isEditingAttributes = false;
      state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
        id: `org-${orgId}`,
        label: org?.nombre || 'Organización',
        route: 'certificacion',
        subview: 'organizations',
        entityType: 'org',
        entityId: orgId,
        tab: state.organizacionDomain.activeChildTab,
        tooltip: `Organización > ${org?.nombre || orgId}`,
      });
      syncUrlHash('certificacion', 'organizations');
      render();
    });
  });

  document.querySelectorAll<HTMLElement>('[data-action="open-cert-from-audit"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const certId = btn.dataset.certId;
      if (!certId) return;
      const canCrossCert =
        canAccessRoute(state.profile, 'certificacion') ||
        (state.profile?.role === 'AUDITOR' && state.profile?.status === 'APPROVED');
      if (!canCrossCert) return;

      const cert =
        state.domainData.allCertificadosDetailed.find((c) => c.id === certId) ||
        INITIAL_CERTIFICADOS_DETAILED.find((c) => c.id === certId);

      clearAllEntitySelections();
      state.activeRoute = 'certificacion';
      state.activeSubSection = 'certificates';
      state.certificadoDomain.selectedCertId = certId;
      state.certificadoDomain.activeChildTab = 'sitios';
      state.certificadoDomain.isEditingAttributes = false;
      state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
        id: `cert-${certId}`,
        label: cert?.numero_certificado || 'Certificado',
        route: 'certificacion',
        subview: 'certificates',
        entityType: 'cert',
        entityId: certId,
        tab: 'sitios',
        tooltip: `Certificado > ${cert?.numero_certificado || certId}`,
      });
      syncUrlHash('certificacion', 'certificates');
      render();
    });
  });

  document.getElementById('startEditProgAuditBtn')?.addEventListener('click', () => {
    if (!canEditSchedule) return;
    state.programacionDomain.isEditingAttributes = true;
    state.programacionDomain.editErrorMessage = null;
    state.programacionDomain.saveSuccessMessage = null;
    render();
  });

  const cancelProgEdit = () => {
    state.programacionDomain.isEditingAttributes = false;
    state.programacionDomain.editErrorMessage = null;
    render();
  };
  document.getElementById('cancelEditProgAuditBtn')?.addEventListener('click', cancelProgEdit);
  document.getElementById('cancelEditProgAuditBtnSecondary')?.addEventListener('click', cancelProgEdit);

  document.getElementById('editProgAuditForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!canEditSchedule) return;
    const auditId = state.programacionDomain.selectedAuditId;
    if (!auditId) return;

    const tipo = (document.getElementById('editProgTipo') as HTMLSelectElement | null)?.value || '';
    const metodologia = (
      (document.getElementById('editProgMetodologia') as HTMLSelectElement | null)?.value ||
      'Presencial'
    ) as AuditMethodology;
    const estatus =
      (document.getElementById('editProgEstatus') as HTMLSelectElement | null)?.value ||
      'Planificado';
    const fechaInicio =
      (document.getElementById('editProgFechaInicio') as HTMLInputElement | null)?.value || '';
    const fechaFin =
      (document.getElementById('editProgFechaFin') as HTMLInputElement | null)?.value || '';
    const dias = Number(
      (document.getElementById('editProgDias') as HTMLInputElement | null)?.value || 1
    );
    const auditorLiderId =
      (document.getElementById('editProgAuditorLider') as HTMLSelectElement | null)?.value || '';

    if (!fechaInicio || !fechaFin || fechaFin < fechaInicio) {
      state.programacionDomain.editErrorMessage =
        'La fecha de finalización debe ser igual o posterior a la fecha de inicio.';
      render();
      return;
    }

    const selectedLead = state.domainData.allAuditorsDetailed.find((a) => a.id === auditorLiderId);
    const currentAudit = state.domainData.programacionAudits.find((a) => a.id === auditId);
    if (!currentAudit) return;

    const oldSnapshot = {
      tipo_auditoria: currentAudit.tipo_auditoria,
      metodologia: currentAudit.metodologia,
      estatus: currentAudit.estatus,
      fecha_inicio: currentAudit.fecha_inicio,
      fecha_fin: currentAudit.fecha_fin,
      dias_auditor: currentAudit.dias_auditor,
      auditor_lider: currentAudit.auditor_lider,
    };

    const nextLeadName = selectedLead?.nombre || currentAudit.auditor_lider;

    state.domainData.programacionAudits = state.domainData.programacionAudits.map((a) => {
      if (a.id !== auditId) return a;
      const updatedTeam = a.equipo.some((m) => m.id_auditor === auditorLiderId)
        ? a.equipo.map((m) => ({
            ...m,
            rol: m.id_auditor === auditorLiderId ? ('Auditor Líder' as const) : m.rol,
          }))
        : selectedLead
        ? [
            {
              id: `eq-${Date.now()}`,
              id_auditor: selectedLead.id,
              nombre: selectedLead.nombre,
              rol: 'Auditor Líder' as const,
              competencia_norma: selectedLead.normas_acreditadas[0] || a.norma_codigo,
              competencia_sector_iaf: selectedLead.sectores_iaf[0] || a.sector_iaf,
              credencial_codigo: selectedLead.codigo_credencial,
              estado_credencial: 'Vigente' as const,
              email: selectedLead.email,
              telefono: selectedLead.telefono,
            },
            ...a.equipo.map((m) =>
              m.rol === 'Auditor Líder' ? { ...m, rol: 'Auditor de Equipo' as const } : m
            ),
          ]
        : a.equipo;

      return {
        ...a,
        tipo_auditoria: tipo || a.tipo_auditoria,
        metodologia,
        estatus,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        dias_auditor: Math.max(0.5, dias),
        auditor_lider_id: auditorLiderId || a.auditor_lider_id,
        auditor_lider: nextLeadName,
        equipo: updatedTeam,
      };
    });

    recordPhase5SessionLog('auditoria', auditId, 'UPDATE', oldSnapshot, {
      tipo_auditoria: tipo,
      metodologia,
      estatus,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      dias_auditor: Math.max(0.5, dias),
      auditor_lider: nextLeadName,
    });

    state.programacionDomain.isEditingAttributes = false;
    state.programacionDomain.editErrorMessage = null;
    state.programacionDomain.saveSuccessMessage =
      'Planificación de auditoría actualizada y registrada en Historial de Cambios.';

    if (isValidUuid(auditId)) {
      void (async () => {
        try {
          await supabase
            .from('auditoria')
            .update({ fecha_programacion: fechaInicio })
            .eq('id', auditId);
        } catch {
          // Reactive state already updated
        }
      })();
    }

    render();
  });

  document.querySelectorAll<HTMLElement>('[data-prog-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.progTab as ProgramacionChildTab | undefined;
      if (tab) {
        state.programacionDomain.activeChildTab = tab;
        state.programacionDomain.isAddingTeamMember = false;
        syncCurrentBreadcrumbTab(tab);
        render();
      }
    });
  });

  // Tab 1: Equipo Evaluador
  document.getElementById('openAddTeamMemberBtn')?.addEventListener('click', () => {
    if (!canPlan) return;
    state.programacionDomain.isAddingTeamMember = true;
    render();
  });
  document.getElementById('cancelAddTeamMemberBtn')?.addEventListener('click', () => {
    state.programacionDomain.isAddingTeamMember = false;
    render();
  });

  document.getElementById('addTeamMemberForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!canPlan) return;
    const auditId = state.programacionDomain.selectedAuditId;
    if (!auditId) return;

    const auditorId =
      (document.getElementById('teamAuditorSelect') as HTMLSelectElement | null)?.value || '';
    const role = (
      (document.getElementById('teamRoleSelect') as HTMLSelectElement | null)?.value ||
      'Auditor de Equipo'
    ) as AuditTeamRole;
    const auditor = state.domainData.allAuditorsDetailed.find((a) => a.id === auditorId);
    if (!auditor) return;

    const firstCompetencyExpiry = auditor.competencias[0]?.fecha_vencimiento || '';
    const credState = getCredentialValidityState(firstCompetencyExpiry);

    const newMember = {
      id: `eq-${Date.now()}`,
      id_auditor: auditor.id,
      nombre: auditor.nombre,
      rol: role,
      competencia_norma: auditor.normas_acreditadas[0] || 'ISO 9001:2015',
      competencia_sector_iaf: auditor.sectores_iaf[0] || 17,
      credencial_codigo: auditor.codigo_credencial,
      estado_credencial: credState,
      email: auditor.email,
      telefono: auditor.telefono,
    };

    state.domainData.programacionAudits = state.domainData.programacionAudits.map((a) =>
      a.id === auditId
        ? {
            ...a,
            equipo: [...a.equipo, newMember],
          }
        : a
    );

    recordPhase5SessionLog('auditoria', auditId, 'UPDATE', null, {
      accion: 'ASIGNACION_EQUIPO_AUDITOR',
      integrante: auditor.nombre,
      rol: role,
      credencial: auditor.codigo_credencial,
    });

    state.programacionDomain.isAddingTeamMember = false;
    state.programacionDomain.saveSuccessMessage = `${auditor.nombre} asignado como ${role}.`;

    if (isValidUuid(auditId) && isValidUuid(auditor.id)) {
      void (async () => {
        try {
          const [{ data: dbAudit }, { data: dbAuditor }, { data: existingMember }] =
            await Promise.all([
              supabase.from('auditoria').select('id').eq('id', auditId).is('deleted_at', null).maybeSingle(),
              supabase.from('auditor').select('id').eq('id', auditor.id).is('deleted_at', null).maybeSingle(),
              supabase
                .from('equipo_auditor')
                .select('id_auditor')
                .eq('id_auditoria', auditId)
                .eq('id_auditor', auditor.id)
                .maybeSingle(),
            ]);

          if (dbAudit && dbAuditor && !existingMember) {
            await supabase.from('equipo_auditor').insert({
              id_auditoria: auditId,
              id_auditor: auditor.id,
              rol_auditor:
                role === 'Auditor Líder'
                  ? 'AUDITOR_LIDER'
                  : role === 'Experto Técnico'
                  ? 'EXPERTO_TECNICO'
                  : 'AUDITOR',
            });
          }
        } catch {
          // Reactive state fallback
        }
      })();
    }

    render();
  });

  document.querySelectorAll<HTMLElement>('[data-action="remove-team-member"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!canPlan) return;
      const auditId = btn.dataset.auditId;
      const memberId = btn.dataset.memberId;
      if (!auditId || !memberId) return;

      const audit = state.domainData.programacionAudits.find((a) => a.id === auditId);
      const removed = audit?.equipo.find((m) => m.id === memberId);

      state.domainData.programacionAudits = state.domainData.programacionAudits.map((a) =>
        a.id === auditId
          ? {
              ...a,
              equipo: a.equipo.filter((m) => m.id !== memberId),
            }
          : a
      );

      if (removed) {
        recordPhase5SessionLog(
          'auditoria',
          auditId,
          'UPDATE',
          { integrante: removed.nombre, rol: removed.rol },
          { accion: 'RETIRO_EQUIPO_AUDITOR', integrante: removed.nombre }
        );
        state.programacionDomain.saveSuccessMessage = `${removed.nombre} retirado del equipo evaluador.`;
      }
      render();
    });
  });

  // Tab 2: Sedes y Muestreo
  document
    .querySelectorAll<HTMLSelectElement>('[data-action="change-site-sampling-mode"]')
    .forEach((select) => {
      select.addEventListener('change', () => {
        if (!canEditSchedule) return;
        const auditId = select.dataset.auditId;
        const siteId = select.dataset.siteId;
        const nextMode = select.value as SiteEvaluationMode;
        if (!auditId || !siteId) return;

        let siteName = '';
        let prevMode = '';
        state.domainData.programacionAudits = state.domainData.programacionAudits.map((a) =>
          a.id === auditId
            ? {
                ...a,
                sitiosMuestreo: a.sitiosMuestreo.map((s) => {
                  if (s.id === siteId) {
                    siteName = s.nombre_sitio;
                    prevMode = s.modalidad_evaluacion;
                    return { ...s, modalidad_evaluacion: nextMode };
                  }
                  return s;
                }),
              }
            : a
        );

        if (siteName) {
          recordPhase5SessionLog(
            'auditoria',
            auditId,
            'UPDATE',
            { sede: siteName, modalidad: prevMode },
            { sede: siteName, modalidad: nextMode }
          );
          state.programacionDomain.saveSuccessMessage = `Modalidad de ${siteName} actualizada a ${nextMode}.`;
        }
        render();
      });
    });

  document
    .querySelectorAll<HTMLInputElement>('[data-action="change-site-sampling-date"]')
    .forEach((input) => {
      input.addEventListener('change', () => {
        if (!canEditSchedule) return;
        const auditId = input.dataset.auditId;
        const siteId = input.dataset.siteId;
        const nextDate = input.value;
        if (!auditId || !siteId || !nextDate) return;

        let siteName = '';
        let prevDate = '';
        state.domainData.programacionAudits = state.domainData.programacionAudits.map((a) =>
          a.id === auditId
            ? {
                ...a,
                sitiosMuestreo: a.sitiosMuestreo.map((s) => {
                  if (s.id === siteId) {
                    siteName = s.nombre_sitio;
                    prevDate = s.fecha_asignada;
                    return { ...s, fecha_asignada: nextDate };
                  }
                  return s;
                }),
              }
            : a
        );

        if (siteName) {
          recordPhase5SessionLog(
            'auditoria',
            auditId,
            'UPDATE',
            { sede: siteName, fecha_asignada: prevDate },
            { sede: siteName, fecha_asignada: nextDate }
          );
          state.programacionDomain.saveSuccessMessage = `Fecha asignada para ${siteName} actualizada a ${nextDate}.`;
        }
        render();
      });
    });

  document.querySelectorAll<HTMLElement>('[data-action="toggle-site-sampled"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!canEditSchedule) return;
      const auditId = btn.dataset.auditId;
      const siteId = btn.dataset.siteId;
      if (!auditId || !siteId) return;

      let siteName = '';
      let nextSampled = true;
      state.domainData.programacionAudits = state.domainData.programacionAudits.map((a) =>
        a.id === auditId
          ? {
              ...a,
              sitiosMuestreo: a.sitiosMuestreo.map((s) => {
                if (s.id === siteId) {
                  siteName = s.nombre_sitio;
                  nextSampled = !s.muestreado;
                  return { ...s, muestreado: nextSampled };
                }
                return s;
              }),
            }
          : a
      );

      if (siteName) {
        recordPhase5SessionLog(
          'auditoria',
          auditId,
          'UPDATE',
          { sede: siteName, muestreado: !nextSampled },
          { sede: siteName, muestreado: nextSampled }
        );
      }
      render();
    });
  });

  // Tab 3: Matriz de Verificación Normativa
  document
    .querySelectorAll<HTMLSelectElement>('[data-action="change-matrix-status"]')
    .forEach((select) => {
      select.addEventListener('change', () => {
        const auditId = select.dataset.auditId;
        const itemId = select.dataset.itemId;
        const nextStatus = select.value as NormativeVerificationStatus;
        if (!auditId || !itemId || !canMutateAuditById(auditId)) return;

        let clausula = '';
        let prevStatus = '';
        state.domainData.programacionAudits = state.domainData.programacionAudits.map((a) =>
          a.id === auditId
            ? {
                ...a,
                matrizNormativa: a.matrizNormativa.map((item) => {
                  if (item.id === itemId) {
                    clausula = item.codigo_clausula;
                    prevStatus = item.estado_verificacion;
                    return { ...item, estado_verificacion: nextStatus };
                  }
                  return item;
                }),
              }
            : a
        );

        if (clausula) {
          recordPhase5SessionLog(
            'auditoria',
            auditId,
            'UPDATE',
            { clausula, estado_verificacion: prevStatus },
            { clausula, estado_verificacion: nextStatus }
          );
          state.programacionDomain.saveSuccessMessage = `Cláusula ${clausula} actualizada a estado "${nextStatus}".`;
        }
        render();
      });
    });

  // --- B. Calendario Operativo ---
  document.querySelectorAll<HTMLElement>('[data-cal-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.calMode as CalendarDisplayMode | undefined;
      if (mode) {
        state.calendarioDomain.displayMode = mode;
        render();
      }
    });
  });

  const stepCalendarPeriod = (direction: -1 | 1) => {
    const step = state.calendarioDomain.displayMode === 'quarter' ? 3 : 1;
    let m = state.calendarioDomain.referenceMonth + direction * step;
    let y = state.calendarioDomain.referenceYear;
    while (m < 1) {
      m += 12;
      y -= 1;
    }
    while (m > 12) {
      m -= 12;
      y += 1;
    }
    state.calendarioDomain.referenceMonth = m;
    state.calendarioDomain.referenceYear = y;
    render();
  };

  document.getElementById('calPrevPeriodBtn')?.addEventListener('click', () => stepCalendarPeriod(-1));
  document.getElementById('calNextPeriodBtn')?.addEventListener('click', () => stepCalendarPeriod(1));

  document.getElementById('calFilterAuditor')?.addEventListener('change', (e) => {
    state.calendarioDomain.filterAuditorId = (e.target as HTMLSelectElement).value || 'ALL';
    render();
  });
  document.getElementById('calFilterStandard')?.addEventListener('change', (e) => {
    state.calendarioDomain.filterStandard = (e.target as HTMLSelectElement).value || 'ALL';
    render();
  });
  document.getElementById('calFilterMethodology')?.addEventListener('change', (e) => {
    state.calendarioDomain.filterMethodology = (e.target as HTMLSelectElement).value || 'ALL';
    render();
  });

  document.querySelectorAll<HTMLElement>('[data-action="open-cal-drawer"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.calendarioDomain.drawerAuditId = btn.dataset.auditId || null;
      render();
    });
  });

  const closeCalDrawer = () => {
    state.calendarioDomain.drawerAuditId = null;
    render();
  };
  document.getElementById('closeCalDrawerBtn')?.addEventListener('click', closeCalDrawer);
  document.getElementById('calDrawerBackdrop')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeCalDrawer();
  });

  document.querySelectorAll<HTMLElement>('[data-action="drawer-go-programacion"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const auditId = btn.dataset.auditId;
      if (!auditId) return;
      const audit = state.domainData.programacionAudits.find((a) => a.id === auditId);
      state.calendarioDomain.drawerAuditId = null;
      state.activeRoute = 'auditorias';
      state.activeSubSection = 'scheduling';
      state.programacionDomain.selectedAuditId = auditId;
      state.programacionDomain.activeChildTab = 'equipo';
      state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
        id: `prog-audit-${auditId}`,
        label: audit?.codigo_auditoria || 'Auditoría',
        route: 'auditorias',
        subview: 'scheduling',
        entityType: 'audit',
        entityId: auditId,
        tab: 'equipo',
        tooltip: audit ? `${audit.codigo_auditoria} — ${audit.organizacion_nombre}` : 'Programación de Auditoría',
      });
      syncUrlHash('auditorias', 'scheduling');
      render();
    });
  });

  document.querySelectorAll<HTMLElement>('[data-action="drawer-go-resultado"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const auditId = btn.dataset.auditId;
      if (!auditId) return;
      const audit = state.domainData.programacionAudits.find((a) => a.id === auditId);
      state.calendarioDomain.drawerAuditId = null;
      state.activeRoute = 'auditorias';
      state.activeSubSection = 'findings';
      state.resultadoDomain.activeAuditIdForDecision = auditId;
      state.resultadoDomain.selectedAuditId = auditId;
      state.resultadoDomain.recommendationError = null;
      state.resultadoDomain.recommendationSuccess = null;
      state.breadcrumbs = pushBreadcrumb(state.breadcrumbs, {
        id: `resultados-${auditId}`,
        label: audit ? `Resultados · ${audit.codigo_auditoria}` : 'Resultado',
        route: 'auditorias',
        subview: 'findings',
        entityType: 'audit',
        entityId: auditId,
        tooltip: audit ? `Resultados > ${audit.codigo_auditoria}` : 'Auditoría > Resultado',
      });
      syncUrlHash('auditorias', 'findings');
      render();
    });
  });

  // --- C. Resultado, Hallazgos & Motor ISO/IEC 17021-1 ---
  document.getElementById('decisionAuditSelector')?.addEventListener('change', (e) => {
    const val = (e.target as HTMLSelectElement).value;
    if (val) {
      state.resultadoDomain.activeAuditIdForDecision = val;
      state.resultadoDomain.recommendationError = null;
      state.resultadoDomain.recommendationSuccess = null;
      render();
    }
  });

  document.getElementById('signRecommendationForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const auditId = form.dataset.auditId || state.resultadoDomain.activeAuditIdForDecision;
    const audit = state.domainData.programacionAudits.find((a) => a.id === auditId);
    if (!audit || !canMutateAuditExecution(audit, state.profile)) return;

    const firma =
      (document.getElementById('recSignatureInput') as HTMLInputElement | null)?.value.trim() || '';
    const comentarios =
      (document.getElementById('recCommentsInput') as HTMLInputElement | null)?.value.trim() || '';

    const evaluation = evaluateIso17021Recommendation(state.domainData.phase5Findings, auditId);
    const sigValidation = validateRecommendationSignature({
      firma_electronica: firma,
      comentarios,
      evaluation,
    });

    if (!sigValidation.valid) {
      state.resultadoDomain.recommendationError = sigValidation.error || 'Firma inválida.';
      state.resultadoDomain.recommendationSuccess = null;
      render();
      return;
    }

    const nowIso = new Date().toISOString();
    const signedBy = state.profile?.nombre || audit.auditor_lider;

    const recommendationRecord = {
      estado: evaluation.status,
      auditor_lider_nombre: signedBy,
      firma_electronica: firma,
      timestamp: nowIso,
      comentarios,
      resumen_hallazgos: {
        total: evaluation.totalFindings,
        ncMayorAbiertas: evaluation.openMajorCount,
        ncMenorAbiertas: evaluation.openMinorCount,
        observaciones: evaluation.observationsCount,
        oportunidadesMejora: evaluation.opportunitiesCount,
      },
    };

    state.domainData.programacionAudits = state.domainData.programacionAudits.map((a) =>
      a.id === auditId
        ? {
            ...a,
            estatus: 'Completado',
            recomendacion: recommendationRecord,
          }
        : a
    );

    recordPhase5SessionLog(
      'auditoria',
      auditId,
      'UPDATE',
      { estatus: audit.estatus, recomendacion: audit.recomendacion?.estado || null },
      {
        estatus: 'Completado',
        recomendacion: evaluation.status,
        firma_electronica: firma,
        auditor_lider_nombre: signedBy,
        comentarios,
      }
    );

    state.resultadoDomain.recommendationError = null;
    state.resultadoDomain.recommendationSuccess = `Recomendación ISO/IEC 17021-1 (${evaluation.status}) firmada y registrada en public.auditoria.`;
    render();
  });

  document.querySelectorAll<HTMLElement>('[data-res-display-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.resDisplayMode as FindingsDisplayMode | undefined;
      if (mode) {
        state.resultadoDomain.displayMode = mode;
        render();
      }
    });
  });

  document.getElementById('openNewFindingFormBtn')?.addEventListener('click', () => {
    const hasMutableAudit = scopeProgramacionAuditsForProfile(
      state.domainData.programacionAudits,
      state.profile,
      state.authorizedClientOrgIds
    ).some((a) => canMutateAuditExecution(a, state.profile));
    if (!hasMutableAudit) return;
    state.resultadoDomain.isLoggingFinding = true;
    state.resultadoDomain.findingFormError = null;
    render();
  });

  const closeNewFindingForm = () => {
    state.resultadoDomain.isLoggingFinding = false;
    state.resultadoDomain.findingFormError = null;
    render();
  };
  document.getElementById('closeNewFindingFormBtn')?.addEventListener('click', closeNewFindingForm);
  document.getElementById('cancelNewFindingFormBtn')?.addEventListener('click', closeNewFindingForm);

  document.getElementById('phase5NewFindingForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const auditId =
      (document.getElementById('p5FindingAuditSelect') as HTMLSelectElement | null)?.value || '';
    if (!canMutateAuditById(auditId)) return;
    const tipo = (
      (document.getElementById('p5FindingTypeSelect') as HTMLSelectElement | null)?.value ||
      'NC_MENOR'
    ) as FindingType;
    const reqId =
      (document.getElementById('p5FindingReqSelect') as HTMLSelectElement | null)?.value || '';
    const procId =
      (document.getElementById('p5FindingProcessSelect') as HTMLSelectElement | null)?.value || '';
    const sitioNombre =
      (document.getElementById('p5FindingSiteInput') as HTMLInputElement | null)?.value.trim() ||
      'Sede Principal';
    const evidencia =
      (document.getElementById('p5FindingEvidenceInput') as HTMLInputElement | null)?.value.trim() ||
      '';
    const fechaLimite =
      (document.getElementById('p5FindingDueDateInput') as HTMLInputElement | null)?.value ||
      '2024-12-30';
    const descripcion =
      (document.getElementById('p5FindingDescInput') as HTMLTextAreaElement | null)?.value.trim() ||
      '';

    const validation = validatePhase5FindingInput({
      id_auditoria: auditId,
      tipo,
      id_requisito: reqId,
      id_proceso: procId,
      descripcion,
      evidencia,
    });

    if (!validation.valid) {
      state.resultadoDomain.findingFormError = validation.error || 'Datos incompletos.';
      render();
      return;
    }

    const audit = state.domainData.programacionAudits.find((a) => a.id === auditId);
    const req = state.domainData.requirements.find((r) => r.id === reqId);
    const proc = state.domainData.processes.find((p) => p.id === procId);
    const nextCodeNum = state.domainData.phase5Findings.length + 1;
    const newId = `finding-p5-${Date.now()}`;
    const codigoHallazgo = `HAL-2024-${String(nextCodeNum).padStart(3, '0')}`;

    const newFinding: Phase5FindingEntity = {
      id: newId,
      codigo_hallazgo: codigoHallazgo,
      id_auditoria: auditId,
      auditoria_tipo: audit?.tipo_auditoria || 'Renovación',
      numero_certificado: audit?.numero_certificado || 'FN-QMS-2024-001',
      organizacion_nombre: audit?.organizacion_nombre || 'Iberometal Componentes S.A.',
      id_requisito: reqId,
      requisito_codigo: req?.codigo || '8.5',
      id_proceso: procId,
      proceso_nombre: proc?.nombre_proceso || 'Troquelado y Fundición',
      sitio_nombre: sitioNombre,
      tipo,
      descripcion,
      evidencia,
      estado_ciclo: 'Abierto',
      analisis_causa_raiz: '',
      plan_accion_correctiva: '',
      comentarios_verificacion: '',
      fecha_limite: fechaLimite,
      fecha_cierre: null,
      cerrado: false,
      created_at: new Date().toISOString(),
    };

    state.domainData.phase5Findings = [newFinding, ...state.domainData.phase5Findings];
    state.domainData.findings = [newFinding, ...state.domainData.findings];
    state.resultadoDomain.isLoggingFinding = false;
    state.resultadoDomain.findingFormError = null;
    state.resultadoDomain.activeAuditIdForDecision = auditId;

    // Reset prior signed recommendation if an open NC_MAYOR or blocking NC_MENOR is introduced
    if (tipo === 'NC_MAYOR' || tipo === 'NC_MENOR') {
      state.domainData.programacionAudits = state.domainData.programacionAudits.map((a) =>
        a.id === auditId ? { ...a, recomendacion: null } : a
      );
      state.resultadoDomain.recommendationSuccess = null;
    }

    recordPhase5SessionLog('hallazgo', newId, 'INSERT', null, {
      auditoria: audit?.codigo_auditoria || newFinding.numero_certificado,
      codigo_hallazgo: codigoHallazgo,
      tipo,
      clausula: newFinding.requisito_codigo,
      proceso: newFinding.proceso_nombre,
      estado_ciclo: 'Abierto',
      descripcion,
    });

    if (isValidUuid(auditId) && isValidUuid(reqId) && isValidUuid(procId)) {
      void (async () => {
        try {
          const [{ data: dbAudit }, { data: dbReq }, { data: dbProc }] = await Promise.all([
            supabase.from('auditoria').select('id').eq('id', auditId).is('deleted_at', null).maybeSingle(),
            supabase.from('requisito').select('id').eq('id', reqId).is('deleted_at', null).maybeSingle(),
            supabase.from('proceso').select('id').eq('id', procId).is('deleted_at', null).maybeSingle(),
          ]);
          if (dbAudit && dbReq && dbProc) {
            await supabase.from('hallazgo').insert({
              id_auditoria: auditId,
              id_requisito: reqId,
              id_proceso: procId,
              tipo,
              descripcion,
              evidencia: evidencia || null,
              cerrado: false,
            });
          }
        } catch {
          // Reactive state fallback
        }
      })();
    }

    render();
  });

  const resSearchInput = document.getElementById('resultadoSearchInput') as HTMLInputElement | null;
  resSearchInput?.addEventListener('input', (e) => {
    state.resultadoDomain.searchQuery = (e.target as HTMLInputElement).value;
    render();
  });
  resSearchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      state.resultadoDomain.searchQuery = '';
      render();
    }
  });
  document.getElementById('clearResultadoSearchBtn')?.addEventListener('click', () => {
    state.resultadoDomain.searchQuery = '';
    render();
  });

  document.getElementById('resultadoBoardAuditFilter')?.addEventListener('change', (e) => {
    state.resultadoDomain.selectedAuditId = (e.target as HTMLSelectElement).value || 'ALL';
    render();
  });

  document.getElementById('resultadoLifecycleFilter')?.addEventListener('change', (e) => {
    state.resultadoDomain.filterLifecycle = (e.target as HTMLSelectElement).value || 'ALL';
    render();
  });

  document.querySelectorAll<HTMLElement>('[data-res-filter-type]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.resultadoDomain.filterType = btn.dataset.resFilterType || 'ALL';
      render();
    });
  });

  document.querySelectorAll<HTMLElement>('[data-action="inspect-finding"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.resultadoDomain.inspectingFindingId = btn.dataset.findingId || null;
      render();
    });
  });

  const closeFindingModal = () => {
    state.resultadoDomain.inspectingFindingId = null;
    render();
  };
  document.getElementById('closeFindingDetailModalBtn')?.addEventListener('click', closeFindingModal);
  document.getElementById('cancelFindingDetailModalBtn')?.addEventListener('click', closeFindingModal);
  document.getElementById('findingDetailModalBackdrop')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeFindingModal();
  });

  document.getElementById('findingLifecycleForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const findingId = form.dataset.findingId || state.resultadoDomain.inspectingFindingId;
    if (!findingId) return;

    const existing = state.domainData.phase5Findings.find((f) => f.id === findingId);
    if (!existing) return;

    const targetAudit = state.domainData.programacionAudits.find(
      (a) => a.id === existing.id_auditoria
    );
    if (!canMutateAuditExecution(targetAudit, state.profile)) {
      const errBox = document.getElementById('findingLifecycleErrorBox');
      if (errBox) {
        errBox.textContent =
          'Acceso de solo lectura: no cuenta con permisos de escritura para modificar este hallazgo.';
        errBox.classList.remove('hidden');
      }
      return;
    }

    const rootCause =
      (document.getElementById('modalFindingRootCause') as HTMLTextAreaElement | null)?.value.trim() ||
      '';
    const capa =
      (document.getElementById('modalFindingCapa') as HTMLTextAreaElement | null)?.value.trim() || '';
    const verification =
      (document.getElementById('modalFindingVerification') as HTMLTextAreaElement | null)?.value.trim() ||
      '';
    const nextStatus = (
      (document.getElementById('modalFindingLifecycleSelect') as HTMLSelectElement | null)?.value ||
      existing.estado_ciclo
    ) as FindingLifecycleStatus;

    // Enforce RBAC for non-staff / non-assigned-auditor
    if (
      !canMutateAuditExecution(targetAudit, state.profile) &&
      (nextStatus === 'Verificado' || nextStatus === 'Cerrado')
    ) {
      const errBox = document.getElementById('findingLifecycleErrorBox');
      if (errBox) {
        errBox.textContent =
          'Solo el Auditor Líder o Personal Técnico pueden verificar y cerrar formalmente un hallazgo.';
        errBox.classList.remove('hidden');
      }
      return;
    }

    const validation = validateFindingLifecycleUpdate(existing, nextStatus, {
      analisis_causa_raiz: rootCause,
      plan_accion_correctiva: capa,
      comentarios_verificacion: verification,
    });

    if (!validation.valid) {
      const errBox = document.getElementById('findingLifecycleErrorBox');
      if (errBox) {
        errBox.textContent = `⚠️ ${validation.error}`;
        errBox.classList.remove('hidden');
      }
      return;
    }

    const nextClosed = nextStatus === 'Cerrado';
    const todayIso = new Date().toISOString().slice(0, 10);

    const oldSnapshot = {
      estado_ciclo: existing.estado_ciclo,
      cerrado: existing.cerrado,
      analisis_causa_raiz: existing.analisis_causa_raiz,
      plan_accion_correctiva: existing.plan_accion_correctiva,
    };

    state.domainData.phase5Findings = state.domainData.phase5Findings.map((f) =>
      f.id === findingId
        ? {
            ...f,
            analisis_causa_raiz: rootCause,
            plan_accion_correctiva: capa,
            comentarios_verificacion: verification,
            estado_ciclo: nextStatus,
            cerrado: nextClosed,
            fecha_cierre: nextClosed ? f.fecha_cierre || todayIso : null,
          }
        : f
    );

    state.domainData.findings = state.domainData.findings.map((f) =>
      f.id === findingId ? { ...f, cerrado: nextClosed } : f
    );

    const relatedAudit = state.domainData.programacionAudits.find(
      (a) => a.id === existing.id_auditoria
    );

    recordPhase5SessionLog('hallazgo', findingId, 'UPDATE', oldSnapshot, {
      auditoria: relatedAudit?.codigo_auditoria || existing.numero_certificado,
      codigo_hallazgo: existing.codigo_hallazgo,
      estado_ciclo: nextStatus,
      cerrado: nextClosed,
      plan_accion_correctiva: capa,
      comentarios_verificacion: verification,
    });

    state.resultadoDomain.inspectingFindingId = null;

    if (isValidUuid(findingId)) {
      void (async () => {
        try {
          await supabase
            .from('hallazgo')
            .update({ cerrado: nextClosed })
            .eq('id', findingId);
        } catch {
          // Reactive state fallback
        }
      })();
    }

    render();
  });
}

async function handleCreatePhase5Audit(data: {
  id_certificado: string;
  tipo_auditoria: string;
  metodologia: AuditMethodology;
  fecha_inicio: string;
  fecha_fin: string;
  dias_auditor: number;
  auditor_lider_id: string;
}): Promise<void> {
  if (!state.profile || !['ADMIN', 'WORKER'].includes(state.profile.role)) return;

  const cert = state.exploration.records.find((c) => c.id === data.id_certificado);
  const detailedCert = state.domainData.allCertificadosDetailed.find(
    (c) => c.id === data.id_certificado
  );
  const auditor = state.domainData.allAuditorsDetailed.find((a) => a.id === data.auditor_lider_id);

  const nextNum = state.domainData.programacionAudits.length + 1;
  const newCode = `AUD-2024-${String(nextNum).padStart(3, '0')}`;
  const newId = `audit-p5-${Date.now()}`;
  const orgName =
    cert?.organizacion_nombre ||
    detailedCert?.organizacion_nombre ||
    'Iberometal Componentes S.A.';
  const certNumber =
    cert?.numero_certificado || detailedCert?.numero_certificado || 'FN-QMS-2024-001';
  const normaCode = cert?.norma || detailedCert?.norma_codigo || 'ISO 9001:2015';
  const sectorIaf = cert?.sector_iaf || detailedCert?.sector_iaf || 17;

  const sitesSampling =
    detailedCert && detailedCert.sitios.length > 0
      ? detailedCert.sitios.map((s) => ({
          id: `sm-${Date.now()}-${s.numero_sitio}`,
          id_sitio: s.id,
          numero_sitio: s.numero_sitio,
          nombre_sitio: s.nombre_sitio,
          direccion_sitio: s.direccion_sitio,
          modalidad_evaluacion: (data.metodologia === 'Remota' ? 'Remota' : 'Presencial') as SiteEvaluationMode,
          fecha_asignada: data.fecha_inicio,
          dias_asignados: Math.max(0.5, Math.round((data.dias_auditor / detailedCert.sitios.length) * 10) / 10),
          muestreado: true,
        }))
      : [
          {
            id: `sm-${Date.now()}-0`,
            id_sitio: '50000000-0000-0000-0000-000000000000',
            numero_sitio: 0,
            nombre_sitio: 'Sede Principal HQ',
            direccion_sitio: cert?.direccion_fiscal || 'Sede Principal Registrada',
            modalidad_evaluacion: (data.metodologia === 'Remota' ? 'Remota' : 'Presencial') as SiteEvaluationMode,
            fecha_asignada: data.fecha_inicio,
            dias_asignados: data.dias_auditor,
            muestreado: true,
          },
        ];

  const newAudit: ProgramacionAuditEntity = {
    id: newId,
    codigo_auditoria: newCode,
    id_certificado: data.id_certificado || '40000000-0000-0000-0000-000000000001',
    numero_certificado: certNumber,
    id_organizacion: cert?.organizacion_id || detailedCert?.id_organizacion || '30000000-0000-0000-0000-000000000001',
    organizacion_nombre: orgName,
    norma_codigo: normaCode,
    sector_iaf: sectorIaf,
    tipo_auditoria: data.tipo_auditoria,
    metodologia: data.metodologia,
    fecha_inicio: data.fecha_inicio,
    fecha_fin: data.fecha_fin >= data.fecha_inicio ? data.fecha_fin : data.fecha_inicio,
    fecha_reprogramacion: null,
    dias_auditor: data.dias_auditor,
    estatus: 'Planificado',
    auditor_lider_id: auditor?.id || '10000000-0000-0000-0000-000000000001',
    auditor_lider: auditor?.nombre || 'Ing. Carlos Mendoza',
    sede_principal_direccion: cert?.direccion_fiscal || 'Zona Industrial Principal',
    equipo: auditor
      ? [
          {
            id: `eq-${Date.now()}`,
            id_auditor: auditor.id,
            nombre: auditor.nombre,
            rol: 'Auditor Líder',
            competencia_norma: auditor.normas_acreditadas[0] || normaCode,
            competencia_sector_iaf: auditor.sectores_iaf[0] || sectorIaf,
            credencial_codigo: auditor.codigo_credencial,
            estado_credencial: 'Vigente',
            email: auditor.email,
            telefono: auditor.telefono,
          },
        ]
      : [],
    sitiosMuestreo: sitesSampling,
    matrizNormativa: [
      {
        id: `mn-${Date.now()}-1`,
        id_requisito: 'f0000000-0000-0000-0000-000000000041',
        codigo_clausula: '4.1',
        titulo_clausula: 'Comprensión de la organización y de su contexto',
        proceso_nombre: 'Dirección Estratégica y Calidad',
        estado_verificacion: 'Planificada',
      },
      {
        id: `mn-${Date.now()}-2`,
        id_requisito: 'f0000000-0000-0000-0000-000000000085',
        codigo_clausula: '8.5',
        titulo_clausula: 'Producción y provisión del servicio',
        proceso_nombre: 'Operaciones Principales',
        estado_verificacion: 'Planificada',
      },
    ],
    recomendacion: null,
  };

  state.domainData.programacionAudits = [newAudit, ...state.domainData.programacionAudits];
  state.domainData.audits = [
    {
      id: newId,
      id_certificado: newAudit.id_certificado,
      numero_certificado: newAudit.numero_certificado,
      organizacion_nombre: newAudit.organizacion_nombre,
      tipo_auditoria: newAudit.tipo_auditoria,
      metodologia: newAudit.metodologia,
      fecha_programacion: newAudit.fecha_inicio,
      auditor_lider: newAudit.auditor_lider,
      estatus: 'PLANIFICADA',
    },
    ...state.domainData.audits,
  ];

  recordPhase5SessionLog('auditoria', newId, 'INSERT', null, {
    codigo_auditoria: newCode,
    organizacion: orgName,
    certificado: certNumber,
    tipo_auditoria: data.tipo_auditoria,
    metodologia: data.metodologia,
    fecha_inicio: newAudit.fecha_inicio,
    fecha_fin: newAudit.fecha_fin,
    auditor_lider: newAudit.auditor_lider,
  });

  state.auditPlanning.isModalOpen = false;
  state.programacionDomain.isPlanningModalOpen = false;
  state.programacionDomain.saveSuccessMessage = `Auditoría ${newCode} planificada exitosamente.`;
  render();
}

function closeAuditLogModal(): void {
  state.auditLogModal.isOpen = false;
  state.auditLogModal.errorMessage = null;
  render();
}

function generateFallbackAuditEntries(
  tableName: string,
  recordId: string,
  entityName: string
): AuditLogEntry[] {
  return [
    {
      id: `audit-log-2`,
      table_name: tableName,
      record_id: recordId,
      action: 'UPDATE',
      actor_name: 'Administrador Principal',
      actor_email: 'admin@fondonorma.test',
      old_data: {
        estatus: 'PLANIFICADA',
        alcance: 'Alcance preliminar de certificación bajo evaluación técnica inicial.',
      },
      new_data: {
        estatus: 'ACTIVO',
        alcance: `Auditoría y certificación de conformidad bajo estándares internacionales ISO para ${entityName}`,
      },
      created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
    },
    {
      id: `audit-log-1`,
      table_name: tableName,
      record_id: recordId,
      action: 'INSERT',
      actor_name: 'Administrador Principal',
      actor_email: 'admin@fondonorma.test',
      old_data: null,
      new_data: {
        codigo: entityName,
        estatus: 'PLANIFICADA',
        created_at: '2024-01-15T09:00:00Z',
      },
      created_at: '2024-01-15T09:00:00Z',
    },
  ];
}

function buildActorDirectory(): Record<string, ActorDirectoryEntry> {
  const directory: Record<string, ActorDirectoryEntry> = { ...SEEDED_ACTOR_DIRECTORY };
  for (const prof of state.approvals.profiles) {
    const seededEmail = directory[prof.id]?.email || null;
    directory[prof.id] = {
      nombre: prof.nombre,
      email: seededEmail,
    };
  }
  if (state.profile && state.user) {
    directory[state.profile.id] = {
      nombre: state.profile.nombre,
      email: state.user.email || directory[state.profile.id]?.email || null,
    };
  }
  return directory;
}

function resolveUuidDisplayLabel(idVal: string): string {
  const matchedAudit =
    state.domainData.programacionAudits.find((a) => a.id === idVal) ||
    state.domainData.audits.find((a) => a.id === idVal);
  if (matchedAudit) {
    return 'codigo_auditoria' in matchedAudit
      ? matchedAudit.codigo_auditoria
      : matchedAudit.numero_certificado;
  }

  const matchedAuditor =
    state.domainData.allAuditorsDetailed.find((a) => a.id === idVal) ||
    state.domainData.auditors.find((a) => a.id === idVal);
  if (matchedAuditor) return matchedAuditor.nombre;

  const matchedOrg =
    state.domainData.allOrganizaciones.find((o) => o.id === idVal) ||
    state.domainData.organizations.find((o) => o.id === idVal) ||
    INITIAL_ORGANIZACIONES.find((o) => o.id === idVal);
  if (matchedOrg) return matchedOrg.nombre;

  const matchedCert =
    state.exploration.records.find((c) => c.id === idVal) ||
    state.domainData.allCertificadosDetailed.find((c) => c.id === idVal) ||
    INITIAL_CERTIFICADOS_DETAILED.find((c) => c.id === idVal);
  if (matchedCert) return matchedCert.numero_certificado;

  const matchedNorma =
    state.domainData.standards.find((s) => s.id === idVal) ||
    INITIAL_NORMAS.find((n) => n.id === idVal);
  if (matchedNorma) return matchedNorma.norma;

  const matchedSector =
    state.domainData.iafSectors.find((s) => s.id === idVal) ||
    INITIAL_SECTORES_IAF.find((s) => s.id === idVal);
  if (matchedSector) return `Sector IAF ${matchedSector.sector}`;

  const matchedSubsector =
    state.domainData.iafSubsectors.find((s) => s.id === idVal) ||
    INITIAL_SUBSECTORES_IAF.find((s) => s.id === idVal);
  if (matchedSubsector) return `${matchedSubsector.codigo} — ${matchedSubsector.descripcion}`;

  const matchedEstatus = INITIAL_ESTATUS_CATALOG.find((e) => e.id === idVal);
  if (matchedEstatus) return matchedEstatus.estatus;

  const matchedTipo = INITIAL_TIPOS_AUDITORIA_CATALOG.find((t) => t.id === idVal);
  if (matchedTipo) return matchedTipo.tipo;

  const matchedMet = INITIAL_METODOLOGIAS_CATALOG.find((m) => m.id === idVal);
  if (matchedMet) return matchedMet.metodologia;

  const matchedOrgAcred = INITIAL_ORGANISMOS.find((o) => o.id === idVal);
  if (matchedOrgAcred) return `${matchedOrgAcred.codigo} (${matchedOrgAcred.nombre})`;

  const matchedSite = state.domainData.sites.find((s) => s.id === idVal);
  if (matchedSite) return matchedSite.nombre_sitio;

  for (const certDetail of state.domainData.allCertificadosDetailed) {
    const nestedSite = certDetail.sitios?.find((s) => s.id === idVal);
    if (nestedSite) return nestedSite.nombre_sitio;
    const nestedProc = certDetail.procesos?.find((p) => p.id === idVal);
    if (nestedProc) return nestedProc.nombre_proceso;
    const nestedFecha = certDetail.fechas?.find((f) => f.id === idVal);
    if (nestedFecha) return `${nestedFecha.tipo_fecha} · ${nestedFecha.fecha}`;
    const nestedContacto = certDetail.contactos?.find((ct) => ct.id === idVal);
    if (nestedContacto) return nestedContacto.nombre;
    for (const ct of certDetail.contactos || []) {
      const nestedTel = ct.telefonos?.find((t) => t.id === idVal);
      if (nestedTel) return nestedTel.telefono;
      const nestedEmail = ct.emails?.find((em) => em.id === idVal);
      if (nestedEmail) return nestedEmail.email;
    }
  }

  const matchedReq =
    state.domainData.requirements.find((r) => r.id === idVal) ||
    INITIAL_REQUISITOS_LTREE.find((r) => r.id === idVal);
  if (matchedReq) return `Cláusula ${matchedReq.codigo}`;

  const matchedProc = state.domainData.processes.find((p) => p.id === idVal);
  if (matchedProc) return matchedProc.nombre_proceso;

  const matchedProfile = state.approvals.profiles.find((p) => p.id === idVal);
  if (matchedProfile) return matchedProfile.nombre;

  const seededActor = SEEDED_ACTOR_DIRECTORY[idVal];
  if (seededActor) return seededActor.nombre;

  return 'Referencia registrada';
}

function sanitizeAuditLogValue(value: unknown): unknown {
  const exactUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const inlineUuidPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (exactUuidPattern.test(trimmed)) {
      return resolveUuidDisplayLabel(trimmed);
    }
    return value.replace(inlineUuidPattern, (match) => resolveUuidDisplayLabel(match));
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditLogValue(item));
  }
  if (value && typeof value === 'object') {
    return sanitizeAuditLogDataMap(value as Record<string, unknown>);
  }
  return value;
}

function sanitizeAuditLogDataMap(
  raw: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!raw) return null;
  const exactUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (key === 'id' || key === 'created_by' || key === 'updated_by') {
      continue;
    }
    if (typeof value === 'string' && exactUuidPattern.test(value.trim())) {
      const labelKey = key.replace(/^id_/, '');
      out[labelKey] = resolveUuidDisplayLabel(value.trim());
      continue;
    }
    out[key] = sanitizeAuditLogValue(value);
  }

  return out;
}

async function openAuditLogModal(
  tableName: string,
  recordId: string,
  entityName: string
): Promise<void> {
  const actorDirectory = buildActorDirectory();
  const scopedAudits = scopeProgramacionAuditsForProfile(
    state.domainData.programacionAudits,
    state.profile,
    state.authorizedClientOrgIds
  );
  const scopedFindings = scopePhase5FindingsForProfile(
    state.domainData.phase5Findings,
    scopedAudits,
    state.profile
  );

  if (
    !canViewAuditLogForEntity(
      state.profile,
      tableName,
      recordId,
      scopedAudits,
      scopedFindings
    )
  ) {
    state.auditLogModal = {
      isOpen: true,
      entityName,
      tableName,
      recordId,
      entries: [],
      actorDirectory,
      loading: false,
      errorMessage:
        'Acceso forense restringido por política RLS (audit_log_select_authorized): disponible exclusivamente para ADMIN, WORKER y Auditores asignados sobre sus auditorías y hallazgos.',
    };
    render();
    return;
  }

  const targetAuditCode = state.domainData.programacionAudits.find(
    (a) => a.id === recordId
  )?.codigo_auditoria;

  const sessionMatches = state.domainData.sessionAuditLogs.filter((entry) => {
    if (tableName && entry.table_name !== tableName) return false;
    if (!recordId) return true;
    if (entry.record_id === recordId) return true;
    if (
      tableName === 'hallazgo' &&
      targetAuditCode &&
      entry.new_data &&
      entry.new_data.auditoria === targetAuditCode
    ) {
      return true;
    }
    return false;
  });

  state.auditLogModal = {
    isOpen: true,
    entityName,
    tableName,
    recordId,
    entries: [],
    actorDirectory,
    loading: true,
    errorMessage: null,
  };
  render();

  try {
    if (recordId && !isValidUuid(recordId)) {
      state.auditLogModal.loading = false;
      const fallback = generateFallbackAuditEntries(tableName, recordId, entityName);
      state.auditLogModal.entries =
        sessionMatches.length > 0 ? [...sessionMatches, ...fallback] : fallback;
      render();
      return;
    }

    let query = supabase
      .from('audit_log')
      .select('*')
      .order('performed_at', { ascending: false });

    if (tableName) {
      query = query.eq('table_name', tableName);
    }

    if (recordId) {
      if (tableName === 'hallazgo' && targetAuditCode) {
        const { data: findingsForAudit } = await supabase
          .from('hallazgo')
          .select('id')
          .eq('id_auditoria', recordId);
        const findingIds = Array.isArray(findingsForAudit)
          ? findingsForAudit.map((row: { id: string }) => row.id).filter(Boolean)
          : [];
        if (findingIds.length > 0) {
          query = query.in('record_id', findingIds);
        } else {
          query = query.eq('record_id', recordId);
        }
      } else {
        query = query.eq('record_id', recordId);
      }
    }

    const { data, error } = await query.limit(20);

    if (error) {
      state.auditLogModal.loading = false;
      state.auditLogModal.errorMessage = translateDatabaseError(error);
      state.auditLogModal.entries = sessionMatches;
      render();
      return;
    }

    if (!data || data.length === 0) {
      state.auditLogModal.loading = false;
      if (sessionMatches.length > 0) {
        state.auditLogModal.entries = sessionMatches;
      } else {
        state.auditLogModal.entries = [];
      }
      render();
      return;
    }

    const sanitizedRows = (data as Array<AuditLogEntry & { performed_at?: string; performed_by?: string | null }>).map((row) => ({
      ...row,
      performed_by: row.performed_by || row.changed_by || row.actor_user_id || null,
      changed_at: row.performed_at || row.changed_at,
      old_data: sanitizeAuditLogDataMap(row.old_data),
      new_data: sanitizeAuditLogDataMap(row.new_data),
    }));

    state.auditLogModal.loading = false;
    state.auditLogModal.entries = [...sessionMatches, ...sanitizedRows];
    render();
  } catch {
    state.auditLogModal.loading = false;
    const fallback = generateFallbackAuditEntries(tableName, recordId, entityName);
    state.auditLogModal.entries =
      sessionMatches.length > 0 ? [...sessionMatches, ...fallback] : fallback;
    render();
  }
}

const STRICT_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildNormaEntitiesForDependencyCheck(): NormaEntity[] {
  return state.domainData.standards.map((s) => ({
    id: s.id,
    codigo: s.codigo || s.norma,
    titulo: s.titulo || s.esquema || s.norma,
    estatus: (s.estatus as 'Vigente' | 'En Revisión' | 'Obsoleta') || 'Vigente',
    esquema: s.esquema,
    fecha_publicacion: s.fecha_publicacion || '2015-09-15',
    norma: s.norma,
    clausulas_count: s.clausulas_count ?? 0,
    acreditaciones_count: s.acreditaciones_count ?? 0,
  }));
}

function closeArchiveModal(): void {
  if (state.archiveGovernance.modal.submitting) return;
  state.archiveGovernance.modal = createInitialArchiveModalState();
  render();
}

async function openArchiveModal(opts: {
  tableName: ArchivableTable;
  recordId: string;
  entityTypeLabel: string;
  recordTitle: string;
  recordSubtitle?: string | null;
}): Promise<void> {
  if (!canArchiveRecord(state.profile)) return;

  state.archiveGovernance.modal = {
    isOpen: true,
    tableName: opts.tableName,
    recordId: opts.recordId,
    entityTypeLabel: opts.entityTypeLabel,
    recordTitle: opts.recordTitle,
    recordSubtitle: opts.recordSubtitle ?? null,
    loadingSummary: true,
    summary: null,
    reason: '',
    submitting: false,
    errorMessage: null,
  };
  render();

  const localSummary = computeLocalArchiveDependencySummary(
    opts.tableName,
    opts.recordId,
    {
      organizaciones: state.domainData.allOrganizaciones,
      certificates: state.domainData.allCertificadosDetailed,
      auditors: state.domainData.allAuditorsDetailed,
      audits: state.domainData.programacionAudits,
      findings: state.domainData.phase5Findings,
      normas: buildNormaEntitiesForDependencyCheck(),
      requisitos: state.domainData.requirementsCatalog,
      subsectores:
        state.domainData.iafSubsectors.length > 0
          ? state.domainData.iafSubsectors
          : INITIAL_SUBSECTORES_IAF,
      acreditaciones: state.domainData.allAcreditaciones,
      estatusList: getResolvedEstatusCatalog(),
      tiposList: getResolvedTiposCatalog(),
      metodologiasList: getResolvedMetodologiasCatalog(),
      archivedSiteIds: state.domainData.archivedSiteIds,
      archivedProcesoIds: state.domainData.archivedProcesoIds,
      archivedTurnoIds: state.domainData.archivedTurnoIds,
      archivedNoAplicableIds: state.domainData.archivedNoAplicableIds,
      archivedFechaIds: state.domainData.archivedFechaIds,
      archivedContactoIds: state.domainData.archivedContactoIds,
      archivedTelefonoIds: state.domainData.archivedTelefonoIds,
      archivedEmailIds: state.domainData.archivedEmailIds,
    }
  );

  let finalSummary = localSummary;
  if (STRICT_UUID_PATTERN.test(opts.recordId)) {
    try {
      const { data, error } = await supabase.rpc('get_archive_dependency_summary', {
        p_table: opts.tableName,
        p_record_id: opts.recordId,
      });
      if (!error && data !== null && data !== undefined) {
        finalSummary = mergeArchiveDependencySummaries(
          parseArchiveDependencySummary(data),
          localSummary
        );
      }
    } catch {
      finalSummary = localSummary;
    }
  }

  if (
    !state.archiveGovernance.modal.isOpen ||
    state.archiveGovernance.modal.tableName !== opts.tableName ||
    state.archiveGovernance.modal.recordId !== opts.recordId
  ) {
    return;
  }

  state.archiveGovernance.modal = {
    ...state.archiveGovernance.modal,
    loadingSummary: false,
    summary: finalSummary,
  };
  render();
}

interface ArchivedRecordSnapshot {
  org?: OrganizacionEntity;
  orgLegacy?: OrganizationRecord;
  clientAccess?: ClientOrganizationAccessEntity;
  certDetail?: CertificadoDetailEntity;
  certRecord?: CertificateRecord;
  auditorDetail?: AuditorDetailEntity;
  auditorLegacy?: AuditorRecord;
  auditProg?: ProgramacionAuditEntity;
  auditLegacy?: AuditRecord;
  siteLinks?: Array<{ certId: string; site: CertificadoDetailEntity['sitios'][number] }>;
  siteLegacy?: SiteRecord;
  procesoLinks?: Array<{ certId: string; proc: CertificadoDetailEntity['procesos'][number] }>;
  procLegacy?: ProcessRecord;
  shiftItem?: TurnoCatalogItem;
  shiftLegacy?: ShiftRecord;
  noAplicableLink?: { certId: string; item: NonApplicableRequirementEntity };
  fechaLink?: { certId: string; fecha: FechaCertificadoEntity };
  contactoLink?: { certId: string; contacto: ContactoCertificadoEntity };
  telefonoLink?: { certId: string; contactoId: string; telefono: TelefonoContactoEntity };
  emailLink?: { certId: string; contactoId: string; email: EmailContactoEntity };
  organismo?: OrganismoAcreditacion;
  accred?: AcreditacionDetailEntity;
  standard?: StandardRecord;
  requisitoItem?: RequisitoLtree;
  sector?: IafRecord;
  subsectorItem?: SubsectorIafEntity;
  estatusItem?: EstatusCatalogItem;
  tipoItem?: TipoAuditoriaCatalogItem;
  metodologiaItem?: MetodologiaAuditoriaCatalogItem;
}

async function confirmArchiveRecord(): Promise<void> {
  if (!canArchiveRecord(state.profile)) return;
  const modal = state.archiveGovernance.modal;
  if (
    !modal.isOpen ||
    modal.submitting ||
    modal.loadingSummary ||
    !modal.summary?.can_archive
  ) {
    return;
  }

  const { tableName, recordId, entityTypeLabel, recordTitle, recordSubtitle, reason } = modal;
  const payload = buildSoftDeletePayload(reason);

  state.archiveGovernance.modal = {
    ...modal,
    submitting: true,
    errorMessage: null,
  };
  render();

  if (STRICT_UUID_PATTERN.test(recordId)) {
    const { error } = await supabase.rpc('archive_record', {
      p_table: tableName,
      p_record_id: recordId,
      p_reason: payload.delete_reason,
    });

    if (error && !isMissingTableOrSchemaError(error)) {
      state.archiveGovernance.modal = {
        ...state.archiveGovernance.modal,
        submitting: false,
        errorMessage: translateDatabaseError(error),
      };
      render();
      return;
    }
  }

  const snapKey = `${tableName}:${recordId}`;
  const snapshot: ArchivedRecordSnapshot = {};

  switch (tableName) {
    case 'organizacion': {
      snapshot.org = state.domainData.allOrganizaciones.find((o) => o.id === recordId);
      snapshot.orgLegacy = state.domainData.organizations.find((o) => o.id === recordId);
      state.domainData.allOrganizaciones = state.domainData.allOrganizaciones.filter(
        (o) => o.id !== recordId
      );
      state.domainData.organizations = state.domainData.organizations.filter(
        (o) => o.id !== recordId
      );
      break;
    }
    case 'client_organization_access': {
      snapshot.clientAccess = state.domainData.allClientAccesses.find((a) => a.id === recordId);
      state.domainData.allClientAccesses = state.domainData.allClientAccesses.filter(
        (a) => a.id !== recordId
      );
      break;
    }
    case 'certificado': {
      snapshot.certDetail = state.domainData.allCertificadosDetailed.find(
        (c) => c.id === recordId
      );
      snapshot.certRecord = state.exploration.records.find((c) => c.id === recordId);
      state.domainData.allCertificadosDetailed =
        state.domainData.allCertificadosDetailed.filter((c) => c.id !== recordId);
      state.exploration.records = state.exploration.records.filter(
        (c) => c.id !== recordId
      );
      break;
    }
    case 'auditor': {
      snapshot.auditorDetail = state.domainData.allAuditorsDetailed.find(
        (a) => a.id === recordId
      );
      snapshot.auditorLegacy = state.domainData.auditors.find((a) => a.id === recordId);
      state.domainData.allAuditorsDetailed = state.domainData.allAuditorsDetailed.filter(
        (a) => a.id !== recordId
      );
      state.domainData.auditors = state.domainData.auditors.filter(
        (a) => a.id !== recordId
      );
      break;
    }
    case 'auditoria': {
      snapshot.auditProg = state.domainData.programacionAudits.find(
        (a) => a.id === recordId
      );
      snapshot.auditLegacy = state.domainData.audits.find((a) => a.id === recordId);
      state.domainData.programacionAudits = state.domainData.programacionAudits.filter(
        (a) => a.id !== recordId
      );
      state.domainData.audits = state.domainData.audits.filter((a) => a.id !== recordId);
      break;
    }
    case 'sitio': {
      const siteLinks: Array<{
        certId: string;
        site: CertificadoDetailEntity['sitios'][number];
      }> = [];
      state.domainData.allCertificadosDetailed =
        state.domainData.allCertificadosDetailed.map((cert) => {
          const targetSite = cert.sitios.find((s) => s.id === recordId);
          if (!targetSite) return cert;
          siteLinks.push({ certId: cert.id, site: targetSite });
          const nextSitios = cert.sitios.filter((s) => s.id !== recordId);
          return { ...cert, sitios: nextSitios };
        });
      snapshot.siteLinks = siteLinks;
      snapshot.siteLegacy = state.domainData.sites.find((s) => s.id === recordId);
      state.domainData.sites = state.domainData.sites.filter((s) => s.id !== recordId);
      state.domainData.archivedSiteIds.add(recordId);
      if (siteLinks.length > 0) {
        const affectedCertIds = new Set(siteLinks.map((l) => l.certId));
        state.exploration.records = state.exploration.records.map((rec) => {
          if (!affectedCertIds.has(rec.id)) return rec;
          const updatedCert = state.domainData.allCertificadosDetailed.find(
            (c) => c.id === rec.id
          );
          return updatedCert
            ? { ...rec, sitios_count: updatedCert.sitios.length }
            : rec;
        });
      }
      break;
    }
    case 'proceso': {
      const procesoLinks: Array<{
        certId: string;
        proc: CertificadoDetailEntity['procesos'][number];
      }> = [];
      state.domainData.allCertificadosDetailed =
        state.domainData.allCertificadosDetailed.map((cert) => {
          const targetProc = cert.procesos.find((p) => p.id === recordId);
          if (!targetProc) return cert;
          procesoLinks.push({ certId: cert.id, proc: targetProc });
          return {
            ...cert,
            procesos: cert.procesos.filter((p) => p.id !== recordId),
          };
        });
      snapshot.procesoLinks = procesoLinks;
      snapshot.procLegacy = state.domainData.processes.find((p) => p.id === recordId);
      state.domainData.processes = state.domainData.processes.filter(
        (p) => p.id !== recordId
      );
      state.domainData.archivedProcesoIds.add(recordId);
      break;
    }
    case 'turno': {
      snapshot.shiftItem = state.domainData.shiftCatalog.find((t) => t.id === recordId);
      snapshot.shiftLegacy = state.domainData.shifts.find((s) => s.id === recordId);
      state.domainData.shiftCatalog = state.domainData.shiftCatalog.filter(
        (t) => t.id !== recordId
      );
      state.domainData.shifts = state.domainData.shifts.filter((s) => s.id !== recordId);
      state.domainData.archivedTurnoIds.add(recordId);
      break;
    }
    case 'requisitos_no_aplicables_certificado': {
      state.domainData.archivedNoAplicableIds.add(recordId);
      state.domainData.allCertificadosDetailed =
        state.domainData.allCertificadosDetailed.map((cert) => {
          const targetNa = (cert.noAplicables || []).find((na) => na.id === recordId);
          if (!targetNa) return cert;
          snapshot.noAplicableLink = { certId: cert.id, item: targetNa };
          return {
            ...cert,
            noAplicables: cert.noAplicables.filter((na) => na.id !== recordId),
          };
        });
      break;
    }
    case 'fecha_certificado': {
      state.domainData.archivedFechaIds.add(recordId);
      state.domainData.allCertificadosDetailed =
        state.domainData.allCertificadosDetailed.map((cert) => {
          const targetFecha = (cert.fechas || []).find((f) => f.id === recordId);
          if (!targetFecha) return cert;
          snapshot.fechaLink = { certId: cert.id, fecha: targetFecha };
          const nextFechas = cert.fechas.filter((f) => f.id !== recordId);
          const derivedDates = deriveCertificateVigenciaDates(
            nextFechas,
            cert.fecha_emision,
            cert.fecha_vencimiento
          );
          return {
            ...cert,
            fechas: nextFechas,
            fecha_emision: derivedDates.fecha_emision,
            fecha_vencimiento: derivedDates.fecha_vencimiento,
          };
        });
      if (snapshot.fechaLink) {
        const affectedCert = state.domainData.allCertificadosDetailed.find(
          (c) => c.id === snapshot.fechaLink?.certId
        );
        if (affectedCert) {
          state.exploration.records = state.exploration.records.map((rec) =>
            rec.id === affectedCert.id
              ? {
                  ...rec,
                  fecha_emision: affectedCert.fecha_emision,
                  fecha_vencimiento: affectedCert.fecha_vencimiento,
                }
              : rec
          );
        }
      }
      break;
    }
    case 'contacto_certificado': {
      state.domainData.archivedContactoIds.add(recordId);
      state.domainData.allCertificadosDetailed =
        state.domainData.allCertificadosDetailed.map((cert) => {
          const targetContacto = (cert.contactos || []).find((ct) => ct.id === recordId);
          if (!targetContacto) return cert;
          snapshot.contactoLink = { certId: cert.id, contacto: targetContacto };
          return {
            ...cert,
            contactos: cert.contactos.filter((ct) => ct.id !== recordId),
          };
        });
      break;
    }
    case 'telefono_contacto_certificado': {
      state.domainData.archivedTelefonoIds.add(recordId);
      state.domainData.allCertificadosDetailed =
        state.domainData.allCertificadosDetailed.map((cert) => {
          let changed = false;
          const nextContactos = (cert.contactos || []).map((ct) => {
            const targetTel = (ct.telefonos || []).find((t) => t.id === recordId);
            if (!targetTel) return ct;
            changed = true;
            snapshot.telefonoLink = {
              certId: cert.id,
              contactoId: ct.id,
              telefono: targetTel,
            };
            return {
              ...ct,
              telefonos: ct.telefonos.filter((t) => t.id !== recordId),
            };
          });
          return changed ? { ...cert, contactos: nextContactos } : cert;
        });
      break;
    }
    case 'email_contacto_certificado': {
      state.domainData.archivedEmailIds.add(recordId);
      state.domainData.allCertificadosDetailed =
        state.domainData.allCertificadosDetailed.map((cert) => {
          let changed = false;
          const nextContactos = (cert.contactos || []).map((ct) => {
            const targetEmail = (ct.emails || []).find((em) => em.id === recordId);
            if (!targetEmail) return ct;
            changed = true;
            snapshot.emailLink = {
              certId: cert.id,
              contactoId: ct.id,
              email: targetEmail,
            };
            return {
              ...ct,
              emails: ct.emails.filter((em) => em.id !== recordId),
            };
          });
          return changed ? { ...cert, contactos: nextContactos } : cert;
        });
      break;
    }
    case 'organismo_acreditacion': {
      snapshot.organismo = state.domainData.allOrganismos.find((o) => o.id === recordId);
      state.domainData.allOrganismos = state.domainData.allOrganismos.filter(
        (o) => o.id !== recordId
      );
      state.archiveGovernance.archivedCatalogIds.add(recordId);
      break;
    }
    case 'acreditacion_norma': {
      snapshot.accred = state.domainData.allAcreditaciones.find((a) => a.id === recordId);
      state.domainData.allAcreditaciones = state.domainData.allAcreditaciones.map((a) =>
        a.id === recordId
          ? { ...a, deleted_at: payload.deleted_at, delete_reason: payload.delete_reason }
          : a
      );
      state.archiveGovernance.archivedCatalogIds.add(recordId);
      break;
    }
    case 'norma': {
      snapshot.standard = state.domainData.standards.find((s) => s.id === recordId);
      state.domainData.standards = state.domainData.standards.filter(
        (s) => s.id !== recordId
      );
      state.archiveGovernance.archivedCatalogIds.add(recordId);
      break;
    }
    case 'requisito': {
      if (STRICT_UUID_PATTERN.test(recordId)) {
        try {
          await supabase
            .from('requisito_traduccion')
            .update({
              deleted_at: payload.deleted_at,
              deleted_by: state.user?.id || null,
            })
            .eq('id_requisito', recordId)
            .is('deleted_at', null);
        } catch {
          // Tolerate missing requisito_traduccion table on un-migrated DB
        }
      }
      snapshot.requisitoItem = state.domainData.requirementsCatalog.find(
        (r) => r.id === recordId
      );
      state.domainData.requirementsCatalog = state.domainData.requirementsCatalog.filter(
        (r) => r.id !== recordId
      );
      state.domainData.requirements = state.domainData.requirements.filter(
        (r) => r.id !== recordId
      );
      state.archiveGovernance.archivedCatalogIds.add(recordId);
      const countsAfterArchive = computeNormaClausulaCounts(
        buildNormaEntitiesForDependencyCheck(),
        state.domainData.requirementsCatalog
      );
      state.domainData.standards = state.domainData.standards.map((st) => ({
        ...st,
        clausulas_count: countsAfterArchive.get(st.id) ?? 0,
      }));
      break;
    }
    case 'sector_iaf': {
      snapshot.sector = state.domainData.iafSectors.find((s) => s.id === recordId);
      state.domainData.iafSectors = state.domainData.iafSectors.filter(
        (s) => s.id !== recordId
      );
      state.archiveGovernance.archivedCatalogIds.add(recordId);
      break;
    }
    case 'subsector_iaf': {
      snapshot.subsectorItem = state.domainData.iafSubsectors.find((s) => s.id === recordId);
      state.domainData.iafSubsectors = state.domainData.iafSubsectors.filter(
        (s) => s.id !== recordId
      );
      state.archiveGovernance.archivedCatalogIds.add(recordId);
      const activeSubs = state.domainData.iafSubsectors.filter((s) => !s.deleted_at);
      state.domainData.iafSectors = state.domainData.iafSectors.map((sec) => ({
        ...sec,
        subsectores_count: activeSubs.filter(
          (sub) => sub.id_sector_iaf === sec.id || sub.sector_numero === sec.sector
        ).length,
      }));
      break;
    }
    case 'estatus': {
      snapshot.estatusItem = state.domainData.estatusCatalog.find((e) => e.id === recordId);
      state.domainData.estatusCatalog = state.domainData.estatusCatalog.filter(
        (e) => e.id !== recordId
      );
      state.archiveGovernance.archivedCatalogIds.add(recordId);
      break;
    }
    case 'tipo_auditoria': {
      snapshot.tipoItem = state.domainData.tiposCatalog.find((t) => t.id === recordId);
      state.domainData.tiposCatalog = state.domainData.tiposCatalog.filter(
        (t) => t.id !== recordId
      );
      state.archiveGovernance.archivedCatalogIds.add(recordId);
      break;
    }
    case 'metodologia_auditoria': {
      snapshot.metodologiaItem = state.domainData.metodologiasCatalog.find(
        (m) => m.id === recordId
      );
      state.domainData.metodologiasCatalog = state.domainData.metodologiasCatalog.filter(
        (m) => m.id !== recordId
      );
      state.archiveGovernance.archivedCatalogIds.add(recordId);
      break;
    }
  }

  state.archiveGovernance.archivedSnapshotsByKey[snapKey] = snapshot;

  const archivedEntry: ArchivedItemEntry = {
    tableName,
    id: recordId,
    title: recordTitle,
    subtitle: recordSubtitle,
    deletedAt: payload.deleted_at,
    deletedBy: state.user?.id || null,
    deletedByName: state.profile?.nombre || null,
    deleteReason: payload.delete_reason,
  };
  const existingForTable = state.archiveGovernance.archivedRecordsByTable[tableName] || [];
  state.archiveGovernance.archivedRecordsByTable[tableName] = [
    archivedEntry,
    ...existingForTable.filter((item) => item.id !== recordId),
  ];

  recordPhase5SessionLog(
    tableName,
    recordId,
    'UPDATE',
    { deleted_at: null },
    { deleted_at: payload.deleted_at, delete_reason: payload.delete_reason }
  );

  state.archiveGovernance.modal = createInitialArchiveModalState();
  backtrackToParentBreadcrumb();
  showFloatingToast(`${entityTypeLabel} "${recordTitle}" archivado correctamente.`, 'success');
  render();
}

async function loadArchivedRecordsForAdmin(): Promise<void> {
  if (!canInspectArchivedRecords(state.profile)) {
    state.archiveGovernance.showArchived = false;
    state.archiveGovernance.archivedRecordsByTable = {};
    return;
  }

  try {
    const [
      orgsRes,
      clientAccessesArchRes,
      certsRes,
      auditorsRes,
      auditsRes,
      normasRes,
      requisitosArchRes,
      sectoresRes,
      subsectoresArchRes,
      organismosArchRes,
      accredRes,
      sitiosRes,
      procesosRes,
      turnosRes,
      noAplicablesArchRes,
      fechasRes,
      contactosRes,
      telefonosRes,
      emailsRes,
      estatusRes,
      tiposRes,
      metodologiasRes,
    ] = await Promise.all([
      supabase
        .from('organizacion')
        .select('id, nombre, rif, deleted_at, deleted_by, delete_reason')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false }),
      supabase
        .from('client_organization_access')
        .select('id, id_organizacion, id_usuario, estado, deleted_at, deleted_by, organizacion:id_organizacion(nombre)')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false }),
      supabase
        .from('certificado')
        .select('id, numero_certificado, alcance, deleted_at, deleted_by, delete_reason')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false }),
      supabase
        .from('auditor')
        .select('id, nombre, deleted_at, deleted_by, delete_reason')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false }),
      supabase
        .from('auditoria')
        .select('id, fecha_programacion, certificado:id_certificado(numero_certificado), deleted_at, deleted_by, delete_reason')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false }),
      supabase
        .from('norma')
        .select('id, codigo, titulo, norma, deleted_at, deleted_by, delete_reason')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false }),
      supabase
        .from('requisito')
        .select('id, codigo, ruta_materializada, deleted_at, deleted_by, delete_reason, norma:id_norma(codigo)')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false }),
      supabase
        .from('sector_iaf')
        .select('id, sector, deleted_at, deleted_by, delete_reason')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false }),
      supabase
        .from('subsector_iaf')
        .select('id, id_sector_iaf, codigo, descripcion, categoria_riesgo, deleted_at, deleted_by, delete_reason')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false }),
      supabase
        .from('organismo_acreditacion')
        .select('id, codigo, nombre, pais, deleted_at, deleted_by, delete_reason')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false }),
      supabase
        .from('acreditacion_norma')
        .select('id, numero_acreditacion, estatus_ref:id_estatus(estatus), deleted_at, deleted_by, delete_reason')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false }),
      supabase
        .from('sitio')
        .select('id, numero_sitio, nombre_sitio, deleted_at, deleted_by, delete_reason')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false }),
      supabase
        .from('proceso')
        .select('id, nombre_proceso, tipo, deleted_at, deleted_by, delete_reason')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false }),
      supabase
        .from('turno')
        .select('id, hora_entrada, hora_salida, deleted_at, deleted_by, delete_reason')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false }),
      supabase
        .from('requisitos_no_aplicables_certificado')
        .select('id, id_certificado, id_requisito, justificacion, deleted_at, deleted_by, requisito:id_requisito(codigo), certificado:id_certificado(numero_certificado)')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false }),
      supabase
        .from('fecha_certificado')
        .select('id, tipo_fecha, fecha, deleted_at, deleted_by, delete_reason')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false }),
      supabase
        .from('contacto_certificado')
        .select('id, nombre, cargo, deleted_at, deleted_by, delete_reason')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false }),
      supabase
        .from('telefono_contacto_certificado')
        .select('id, telefono, tipo_telefono, deleted_at, deleted_by')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false }),
      supabase
        .from('email_contacto_certificado')
        .select('id, email, tipo_email, deleted_at, deleted_by')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false }),
      supabase
        .from('estatus')
        .select('id, estatus, deleted_at, deleted_by, delete_reason')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false }),
      supabase
        .from('tipo_auditoria')
        .select('id, tipo, deleted_at, deleted_by, delete_reason')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false }),
      supabase
        .from('metodologia_auditoria')
        .select('id, metodologia, deleted_at, deleted_by, delete_reason')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false }),
    ]);

    const buildEntries = (
      tableName: ArchivableTable,
      res: { data: unknown; error: unknown },
      mapper: (row: Record<string, unknown>) => { title: string; subtitle?: string | null; code?: string | null }
    ): ArchivedItemEntry[] => {
      const dbRows = Array.isArray(res.data) ? (res.data as Array<Record<string, unknown>>) : [];
      const mappedDb: ArchivedItemEntry[] = dbRows.map((r) => {
        const meta = mapper(r);
        return {
          tableName,
          id: String(r.id),
          title: meta.title,
          subtitle: meta.subtitle ?? null,
          code: meta.code ?? null,
          deletedAt: String(r.deleted_at || ''),
          deletedBy: r.deleted_by ? String(r.deleted_by) : null,
          deletedByName: null,
          deleteReason: r.delete_reason ? String(r.delete_reason) : null,
        };
      });
      const dbIds = new Set(mappedDb.map((i) => i.id));
      const keepSessionLocal = Boolean(res.error && isMissingTableOrSchemaError(res.error));
      const existingLocal = (state.archiveGovernance.archivedRecordsByTable[tableName] || []).filter(
        (item) => (keepSessionLocal || !STRICT_UUID_PATTERN.test(item.id)) && !dbIds.has(item.id)
      );
      return [...mappedDb, ...existingLocal];
    };

    const nextByTable: Record<string, ArchivedItemEntry[]> = {
      organizacion: buildEntries('organizacion', orgsRes, (r) => ({
        title: String(r.nombre || 'Organización Archivada'),
        subtitle: r.rif ? String(r.rif) : null,
      })),
      client_organization_access: buildEntries(
        'client_organization_access',
        clientAccessesArchRes,
        (r) => {
          const orgObj = (r.organizacion as Record<string, unknown> | null) || null;
          const userId = String(r.id_usuario || '');
          const matchedUser = state.approvals.profiles.find((p) => p.id === userId);
          const orgName = orgObj?.nombre ? String(orgObj.nombre) : 'Organización';
          return {
            title: `${matchedUser?.nombre || 'Usuario Cliente'} · ${orgName}`,
            subtitle: r.estado ? `Estado: ${String(r.estado)}` : null,
          };
        }
      ),
      certificado: buildEntries('certificado', certsRes, (r) => ({
        title: String(r.numero_certificado || 'Certificado Archivado'),
        subtitle: r.alcance ? String(r.alcance).slice(0, 80) : null,
        code: String(r.numero_certificado || ''),
      })),
      auditor: buildEntries('auditor', auditorsRes, (r) => ({
        title: String(r.nombre || 'Auditor Archivado'),
      })),
      auditoria: buildEntries('auditoria', auditsRes, (r) => {
        const certObj = (r.certificado as Record<string, unknown> | null) || null;
        return {
          title: certObj?.numero_certificado
            ? `Auditoría · ${String(certObj.numero_certificado)}`
            : 'Auditoría Archivada',
          subtitle: r.fecha_programacion ? `Programada: ${String(r.fecha_programacion)}` : null,
        };
      }),
      norma: buildEntries('norma', normasRes, (r) => ({
        title: String(r.codigo || r.norma || 'Norma Archivada'),
        subtitle: r.titulo ? String(r.titulo) : null,
        code: String(r.codigo || r.norma || ''),
      })),
      requisito: buildEntries('requisito', requisitosArchRes, (r) => {
        const normaObj = (r.norma as Record<string, unknown> | null) || null;
        const normaCod = normaObj?.codigo ? String(normaObj.codigo) : '';
        return {
          title: r.codigo ? `Cláusula ${String(r.codigo)}` : 'Requisito Archivado',
          subtitle: normaCod
            ? `${normaCod}${r.ruta_materializada ? ` · LTREE ${String(r.ruta_materializada)}` : ''}`
            : r.ruta_materializada
            ? `LTREE ${String(r.ruta_materializada)}`
            : null,
          code: r.codigo ? String(r.codigo) : null,
        };
      }),
      sector_iaf: buildEntries('sector_iaf', sectoresRes, (r) => ({
        title: `Sector IAF ${String(r.sector ?? '')}`.trim(),
      })),
      subsector_iaf: buildEntries('subsector_iaf', subsectoresArchRes, (r) => ({
        title: r.codigo ? `Sub-Sector ${String(r.codigo)}` : 'Sub-Sector Archivado',
        subtitle: r.descripcion ? String(r.descripcion) : null,
        code: r.codigo ? String(r.codigo) : null,
      })),
      organismo_acreditacion: buildEntries('organismo_acreditacion', organismosArchRes, (r) => ({
        title: String(r.codigo || 'Organismo Archivado'),
        subtitle: r.nombre
          ? `${String(r.nombre)}${r.pais ? ` (${String(r.pais)})` : ''}`
          : null,
        code: String(r.codigo || ''),
      })),
      acreditacion_norma: buildEntries('acreditacion_norma', accredRes, (r) => {
        const estatusObj = (r.estatus_ref as Record<string, unknown> | null) || null;
        const estatusLabel = estatusObj?.estatus
          ? String(estatusObj.estatus)
          : r.estatus
          ? String(r.estatus)
          : '';
        return {
          title: String(r.numero_acreditacion || 'Acreditación Archivada'),
          subtitle: estatusLabel ? `Estatus: ${estatusLabel}` : null,
          code: String(r.numero_acreditacion || ''),
        };
      }),
      sitio: buildEntries('sitio', sitiosRes, (r) => ({
        title: `Sitio ${String(r.numero_sitio ?? '')} — ${String(r.nombre_sitio || 'Sitio')}`,
      })),
      proceso: buildEntries('proceso', procesosRes, (r) => ({
        title: String(r.nombre_proceso || 'Proceso Archivado'),
        subtitle: r.tipo ? String(r.tipo) : null,
      })),
      turno: buildEntries('turno', turnosRes, (r) => ({
        title: `${formatTurnoTime(String(r.hora_entrada || '00:00'))} – ${formatTurnoTime(String(r.hora_salida || '00:00'))}`,
      })),
      requisitos_no_aplicables_certificado: buildEntries(
        'requisitos_no_aplicables_certificado',
        noAplicablesArchRes,
        (r) => {
          const reqObj = (r.requisito as Record<string, unknown> | null) || null;
          const certObj = (r.certificado as Record<string, unknown> | null) || null;
          const reqCode = reqObj?.codigo ? String(reqObj.codigo) : '4.3';
          const certCode = certObj?.numero_certificado ? String(certObj.numero_certificado) : '';
          return {
            title: `Cláusula ${reqCode}`,
            subtitle: certCode
              ? `${certCode}${r.justificacion ? ` — ${String(r.justificacion).slice(0, 70)}` : ''}`
              : r.justificacion
              ? String(r.justificacion).slice(0, 80)
              : null,
            code: reqCode,
          };
        }
      ),
      fecha_certificado: buildEntries('fecha_certificado', fechasRes, (r) => ({
        title: `${String(r.tipo_fecha || 'Fecha')} · ${String(r.fecha || '').slice(0, 10)}`,
      })),
      contacto_certificado: buildEntries('contacto_certificado', contactosRes, (r) => ({
        title: String(r.nombre || 'Contacto Archivado'),
        subtitle: r.cargo ? String(r.cargo) : null,
      })),
      telefono_contacto_certificado: buildEntries(
        'telefono_contacto_certificado',
        telefonosRes,
        (r) => ({
          title: String(r.telefono || 'Teléfono Archivado'),
          subtitle: r.tipo_telefono ? String(r.tipo_telefono) : null,
        })
      ),
      email_contacto_certificado: buildEntries('email_contacto_certificado', emailsRes, (r) => ({
        title: String(r.email || 'Correo Archivado'),
        subtitle: r.tipo_email ? String(r.tipo_email) : null,
      })),
      estatus: buildEntries('estatus', estatusRes, (r) => ({
        title: String(r.estatus || 'Estatus Archivado'),
      })),
      tipo_auditoria: buildEntries('tipo_auditoria', tiposRes, (r) => ({
        title: String(r.tipo || 'Tipo Archivado'),
      })),
      metodologia_auditoria: buildEntries('metodologia_auditoria', metodologiasRes, (r) => ({
        title: String(r.metodologia || 'Metodología Archivada'),
      })),
    };

    state.archiveGovernance.archivedRecordsByTable = nextByTable;
    render();
  } catch {
    render();
  }
}

async function handleRestoreArchivedRecord(
  tableName: ArchivableTable,
  recordId: string
): Promise<void> {
  if (!canInspectArchivedRecords(state.profile)) return;

  const existingEntry = (
    state.archiveGovernance.archivedRecordsByTable[tableName] || []
  ).find((i) => i.id === recordId);
  const title = existingEntry?.title || 'Registro';

  state.archiveGovernance.restoringId = recordId;
  render();

  const restorePayload = buildRestorePayload();
  const isChildWithoutReason =
    tableName === 'telefono_contacto_certificado' ||
    tableName === 'email_contacto_certificado' ||
    tableName === 'client_organization_access' ||
    tableName === 'requisitos_no_aplicables_certificado';
  if (STRICT_UUID_PATTERN.test(recordId)) {
    const { error } = await supabase
      .from(tableName)
      .update(isChildWithoutReason ? { deleted_at: null } : restorePayload)
      .eq('id', recordId);

    if (error && !isMissingTableOrSchemaError(error)) {
      state.archiveGovernance.restoringId = null;
      showFloatingToast(translateDatabaseError(error), 'warning');
      render();
      return;
    }

    if (tableName === 'requisito') {
      try {
        const { error: transRestoreError } = await supabase
          .from('requisito_traduccion')
          .update({ deleted_at: null, deleted_by: null })
          .eq('id_requisito', recordId);
        if (transRestoreError && !isMissingTableOrSchemaError(transRestoreError)) {
          showFloatingToast(translateDatabaseError(transRestoreError), 'warning');
        }
      } catch {
        // Tolerate missing requisito_traduccion table on un-migrated DB
      }
    }
  }

  state.archiveGovernance.archivedRecordsByTable[tableName] = (
    state.archiveGovernance.archivedRecordsByTable[tableName] || []
  ).filter((item) => item.id !== recordId);
  state.archiveGovernance.archivedCatalogIds.delete(recordId);

  const snapKey = `${tableName}:${recordId}`;
  const snapshot = state.archiveGovernance.archivedSnapshotsByKey[snapKey] as
    | ArchivedRecordSnapshot
    | undefined;

  if (tableName === 'requisito') {
    let restoredReq: RequisitoLtree | undefined = snapshot?.requisitoItem
      ? { ...snapshot.requisitoItem, deleted_at: null, delete_reason: null }
      : undefined;

    if (STRICT_UUID_PATTERN.test(recordId)) {
      try {
        let reqQueryRes = await supabase
          .from('requisito')
          .select(
            'id, id_norma, id_requisito_padre, codigo, explicit_code, es_obligatorio, obligatorio_origen, ruta_materializada, norma:id_norma ( id, codigo, norma )'
          )
          .eq('id', recordId)
          .is('deleted_at', null)
          .maybeSingle();

        if (reqQueryRes.error && isMissingTableOrSchemaError(reqQueryRes.error)) {
          reqQueryRes = await supabase
            .from('requisito')
            .select(
              'id, id_norma, id_requisito_padre, codigo, ruta_materializada, norma:id_norma ( id, codigo, norma )'
            )
            .eq('id', recordId)
            .is('deleted_at', null)
            .maybeSingle();
        }

        const transQueryRes = await supabase
          .from('requisito_traduccion')
          .select('id, id_requisito, lang, title, content_html, updated_at')
          .eq('id_requisito', recordId)
          .is('deleted_at', null);

        const translationsTableMissing = Boolean(
          transQueryRes.error && isMissingTableOrSchemaError(transQueryRes.error)
        );
        const transMap =
          !transQueryRes.error && Array.isArray(transQueryRes.data)
            ? indexTranslationsByRequisitoId(
                transQueryRes.data as RawRequisitoTraduccionRow[]
              )
            : undefined;
        const dbTranslations = transMap?.get(recordId);
        const bundleCatalog = getBundledNormaCatalog();
        const fallbackTranslations = translationsTableMissing
          ? bundleCatalog.translationsByRequisitoId.get(recordId)
          : undefined;
        const resolvedTranslations =
          dbTranslations || restoredReq?.translations || fallbackTranslations;

        if (!reqQueryRes.error && reqQueryRes.data) {
          const rawRow = reqQueryRes.data as unknown as RawRequisitoRow;
          const normaJoin = rawRow.norma ?? null;
          const idNorma = String(
            rawRow.id_norma || normaJoin?.id || restoredReq?.id_norma || ''
          );
          const matchedNorma =
            state.domainData.standards.find((s) => s.id === idNorma) ||
            bundleCatalog.standards.find((s) => s.id === idNorma);
          const codigo = String(rawRow.codigo || restoredReq?.codigo || '').trim();
          const rutaMaterializada = String(
            rawRow.ruta_materializada || restoredReq?.ruta_materializada || codigo
          );
          const indent = calculateLtreeIndentation(rutaMaterializada, codigo);
          const hasActiveChildren = state.domainData.requirementsCatalog.some(
            (r) => !r.deleted_at && r.id_requisito_padre === recordId
          );
          restoredReq = {
            id: recordId,
            id_norma: idNorma,
            norma_codigo: String(
              normaJoin?.codigo ||
                normaJoin?.norma ||
                matchedNorma?.codigo ||
                matchedNorma?.norma ||
                restoredReq?.norma_codigo ||
                'Norma ISO'
            ),
            id_requisito_padre: rawRow.id_requisito_padre
              ? String(rawRow.id_requisito_padre)
              : null,
            codigo,
            explicit_code:
              typeof rawRow.explicit_code === 'boolean'
                ? rawRow.explicit_code
                : restoredReq?.explicit_code ?? false,
            es_obligatorio:
              typeof rawRow.es_obligatorio === 'boolean'
                ? rawRow.es_obligatorio
                : restoredReq?.es_obligatorio ?? true,
            obligatorio_origen:
              normalizeObligatorioOrigen(rawRow.obligatorio_origen) ??
              restoredReq?.obligatorio_origen ??
              'AUTO_TEXT',
            titulo:
              resolvedTranslations?.es?.title ||
              resolvedTranslations?.en?.title ||
              restoredReq?.titulo ||
              `Cláusula ${codigo}`,
            descripcion: extractPlainClauseDescription(
              resolvedTranslations,
              restoredReq?.descripcion
            ),
            translations: resolvedTranslations,
            ruta_materializada: rutaMaterializada,
            nivel: indent.level,
            es_padre: hasActiveChildren || Boolean(restoredReq?.es_padre),
            deleted_at: null,
          };
        } else if (restoredReq && resolvedTranslations) {
          restoredReq = {
            ...restoredReq,
            translations: resolvedTranslations,
            titulo:
              resolvedTranslations.es?.title ||
              resolvedTranslations.en?.title ||
              restoredReq.titulo,
            descripcion: extractPlainClauseDescription(
              resolvedTranslations,
              restoredReq.descripcion
            ),
          };
        }
      } catch {
        // Reactive fallback using existing snapshot or bundle
      }
    }

    if (!restoredReq) {
      const bundledMatch = getBundledNormaCatalog().clauseById.get(recordId);
      if (bundledMatch) {
        restoredReq = { ...bundledMatch, deleted_at: null };
      }
    }

    if (restoredReq) {
      const existingIdx = state.domainData.requirementsCatalog.findIndex(
        (r) => r.id === recordId
      );
      if (existingIdx >= 0) {
        state.domainData.requirementsCatalog = state.domainData.requirementsCatalog.map((r) =>
          r.id === recordId ? restoredReq! : r
        );
      } else {
        state.domainData.requirementsCatalog = [
          restoredReq,
          ...state.domainData.requirementsCatalog,
        ];
      }

      state.domainData.requirements = [
        {
          id: restoredReq.id,
          id_norma: restoredReq.id_norma,
          id_requisito_padre: restoredReq.id_requisito_padre,
          codigo: restoredReq.codigo,
          ruta_materializada: restoredReq.ruta_materializada,
          norma: restoredReq.norma_codigo,
          titulo: restoredReq.titulo,
          descripcion: restoredReq.descripcion,
        },
        ...state.domainData.requirements.filter((r) => r.id !== recordId),
      ];

      const countsAfterRestore = computeNormaClausulaCounts(
        buildNormaEntitiesForDependencyCheck(),
        state.domainData.requirementsCatalog
      );
      state.domainData.standards = state.domainData.standards.map((st) => ({
        ...st,
        clausulas_count: countsAfterRestore.get(st.id) ?? 0,
      }));
    }
  }

  if (snapshot) {
    switch (tableName) {
      case 'organizacion': {
        if (snapshot.org && !state.domainData.allOrganizaciones.some((o) => o.id === recordId)) {
          state.domainData.allOrganizaciones = [snapshot.org, ...state.domainData.allOrganizaciones];
        }
        if (snapshot.orgLegacy && !state.domainData.organizations.some((o) => o.id === recordId)) {
          state.domainData.organizations = [snapshot.orgLegacy, ...state.domainData.organizations];
        }
        break;
      }
      case 'client_organization_access': {
        if (
          snapshot.clientAccess &&
          !state.domainData.allClientAccesses.some((a) => a.id === recordId)
        ) {
          state.domainData.allClientAccesses = [
            { ...snapshot.clientAccess, deleted_at: null },
            ...state.domainData.allClientAccesses,
          ];
        }
        break;
      }
      case 'certificado': {
        if (
          snapshot.certDetail &&
          !state.domainData.allCertificadosDetailed.some((c) => c.id === recordId)
        ) {
          state.domainData.allCertificadosDetailed = [
            snapshot.certDetail,
            ...state.domainData.allCertificadosDetailed,
          ];
        }
        if (
          snapshot.certRecord &&
          !state.exploration.records.some((c) => c.id === recordId)
        ) {
          state.exploration.records = [snapshot.certRecord, ...state.exploration.records];
        }
        break;
      }
      case 'auditor': {
        if (
          snapshot.auditorDetail &&
          !state.domainData.allAuditorsDetailed.some((a) => a.id === recordId)
        ) {
          state.domainData.allAuditorsDetailed = [
            snapshot.auditorDetail,
            ...state.domainData.allAuditorsDetailed,
          ];
        }
        if (
          snapshot.auditorLegacy &&
          !state.domainData.auditors.some((a) => a.id === recordId)
        ) {
          state.domainData.auditors = [snapshot.auditorLegacy, ...state.domainData.auditors];
        }
        break;
      }
      case 'auditoria': {
        if (
          snapshot.auditProg &&
          !state.domainData.programacionAudits.some((a) => a.id === recordId)
        ) {
          state.domainData.programacionAudits = [
            snapshot.auditProg,
            ...state.domainData.programacionAudits,
          ];
        }
        if (
          snapshot.auditLegacy &&
          !state.domainData.audits.some((a) => a.id === recordId)
        ) {
          state.domainData.audits = [snapshot.auditLegacy, ...state.domainData.audits];
        }
        break;
      }
      case 'sitio': {
        state.domainData.archivedSiteIds.delete(recordId);
        if (snapshot.siteLinks && snapshot.siteLinks.length > 0) {
          state.domainData.allCertificadosDetailed =
            state.domainData.allCertificadosDetailed.map((cert) => {
              const link = snapshot.siteLinks?.find((l) => l.certId === cert.id);
              if (!link || cert.sitios.some((s) => s.id === recordId)) return cert;
              return { ...cert, sitios: [...cert.sitios, link.site] };
            });
          const affectedCertIds = new Set(snapshot.siteLinks.map((l) => l.certId));
          state.exploration.records = state.exploration.records.map((rec) => {
            if (!affectedCertIds.has(rec.id)) return rec;
            const updatedCert = state.domainData.allCertificadosDetailed.find(
              (c) => c.id === rec.id
            );
            return updatedCert
              ? { ...rec, sitios_count: updatedCert.sitios.length }
              : rec;
          });
        }
        if (snapshot.siteLegacy && !state.domainData.sites.some((s) => s.id === recordId)) {
          state.domainData.sites = [snapshot.siteLegacy, ...state.domainData.sites];
        }
        break;
      }
      case 'proceso': {
        state.domainData.archivedProcesoIds.delete(recordId);
        if (snapshot.procesoLinks && snapshot.procesoLinks.length > 0) {
          state.domainData.allCertificadosDetailed =
            state.domainData.allCertificadosDetailed.map((cert) => {
              const link = snapshot.procesoLinks?.find((l) => l.certId === cert.id);
              if (!link || cert.procesos.some((p) => p.id === recordId)) return cert;
              return { ...cert, procesos: [...cert.procesos, link.proc] };
            });
        }
        if (snapshot.procLegacy && !state.domainData.processes.some((p) => p.id === recordId)) {
          state.domainData.processes = [snapshot.procLegacy, ...state.domainData.processes];
        }
        break;
      }
      case 'turno': {
        state.domainData.archivedTurnoIds.delete(recordId);
        if (snapshot.shiftItem && !state.domainData.shiftCatalog.some((t) => t.id === recordId)) {
          state.domainData.shiftCatalog = [snapshot.shiftItem, ...state.domainData.shiftCatalog];
        }
        if (snapshot.shiftLegacy && !state.domainData.shifts.some((s) => s.id === recordId)) {
          state.domainData.shifts = [snapshot.shiftLegacy, ...state.domainData.shifts];
        }
        break;
      }
      case 'requisitos_no_aplicables_certificado': {
        state.domainData.archivedNoAplicableIds.delete(recordId);
        if (snapshot.noAplicableLink) {
          const { certId, item } = snapshot.noAplicableLink;
          state.domainData.allCertificadosDetailed =
            state.domainData.allCertificadosDetailed.map((cert) =>
              cert.id === certId && !cert.noAplicables.some((na) => na.id === recordId)
                ? { ...cert, noAplicables: [...cert.noAplicables, item] }
                : cert
            );
        }
        break;
      }
      case 'fecha_certificado': {
        state.domainData.archivedFechaIds.delete(recordId);
        if (snapshot.fechaLink) {
          const { certId, fecha } = snapshot.fechaLink;
          state.domainData.allCertificadosDetailed =
            state.domainData.allCertificadosDetailed.map((cert) => {
              if (cert.id !== certId || cert.fechas.some((f) => f.id === recordId)) return cert;
              const nextFechas = [...cert.fechas, fecha];
              const derivedDates = deriveCertificateVigenciaDates(
                nextFechas,
                cert.fecha_emision,
                cert.fecha_vencimiento
              );
              return {
                ...cert,
                fechas: nextFechas,
                fecha_emision: derivedDates.fecha_emision,
                fecha_vencimiento: derivedDates.fecha_vencimiento,
              };
            });
          const updatedCert = state.domainData.allCertificadosDetailed.find((c) => c.id === certId);
          if (updatedCert) {
            state.exploration.records = state.exploration.records.map((rec) =>
              rec.id === certId
                ? {
                    ...rec,
                    fecha_emision: updatedCert.fecha_emision,
                    fecha_vencimiento: updatedCert.fecha_vencimiento,
                  }
                : rec
            );
          }
        }
        break;
      }
      case 'contacto_certificado': {
        state.domainData.archivedContactoIds.delete(recordId);
        if (snapshot.contactoLink) {
          const { certId, contacto } = snapshot.contactoLink;
          state.domainData.allCertificadosDetailed =
            state.domainData.allCertificadosDetailed.map((cert) =>
              cert.id === certId && !cert.contactos.some((ct) => ct.id === recordId)
                ? { ...cert, contactos: [...cert.contactos, contacto] }
                : cert
            );
        }
        break;
      }
      case 'telefono_contacto_certificado': {
        state.domainData.archivedTelefonoIds.delete(recordId);
        if (snapshot.telefonoLink) {
          const { certId, contactoId, telefono } = snapshot.telefonoLink;
          state.domainData.allCertificadosDetailed =
            state.domainData.allCertificadosDetailed.map((cert) =>
              cert.id === certId
                ? {
                    ...cert,
                    contactos: cert.contactos.map((ct) =>
                      ct.id === contactoId && !ct.telefonos.some((t) => t.id === recordId)
                        ? { ...ct, telefonos: [...ct.telefonos, telefono] }
                        : ct
                    ),
                  }
                : cert
            );
        }
        break;
      }
      case 'email_contacto_certificado': {
        state.domainData.archivedEmailIds.delete(recordId);
        if (snapshot.emailLink) {
          const { certId, contactoId, email } = snapshot.emailLink;
          state.domainData.allCertificadosDetailed =
            state.domainData.allCertificadosDetailed.map((cert) =>
              cert.id === certId
                ? {
                    ...cert,
                    contactos: cert.contactos.map((ct) =>
                      ct.id === contactoId && !ct.emails.some((em) => em.id === recordId)
                        ? { ...ct, emails: [...ct.emails, email] }
                        : ct
                    ),
                  }
                : cert
            );
        }
        break;
      }
      case 'organismo_acreditacion': {
        if (snapshot.organismo && !state.domainData.allOrganismos.some((o) => o.id === recordId)) {
          state.domainData.allOrganismos = [snapshot.organismo, ...state.domainData.allOrganismos];
        }
        break;
      }
      case 'acreditacion_norma': {
        state.domainData.allAcreditaciones = state.domainData.allAcreditaciones.map((a) =>
          a.id === recordId ? { ...a, deleted_at: null, delete_reason: null } : a
        );
        break;
      }
      case 'norma': {
        if (snapshot.standard && !state.domainData.standards.some((s) => s.id === recordId)) {
          state.domainData.standards = [snapshot.standard, ...state.domainData.standards];
        }
        break;
      }
      case 'requisito': {
        // Handled above for both session snapshot and cross-session live DB restore
        break;
      }
      case 'sector_iaf': {
        if (snapshot.sector && !state.domainData.iafSectors.some((s) => s.id === recordId)) {
          state.domainData.iafSectors = [snapshot.sector, ...state.domainData.iafSectors];
        }
        break;
      }
      case 'subsector_iaf': {
        if (
          snapshot.subsectorItem &&
          !state.domainData.iafSubsectors.some((s) => s.id === recordId)
        ) {
          state.domainData.iafSubsectors = [
            snapshot.subsectorItem,
            ...state.domainData.iafSubsectors,
          ];
          const activeSubs = state.domainData.iafSubsectors.filter((s) => !s.deleted_at);
          state.domainData.iafSectors = state.domainData.iafSectors.map((sec) => ({
            ...sec,
            subsectores_count: activeSubs.filter(
              (sub) => sub.id_sector_iaf === sec.id || sub.sector_numero === sec.sector
            ).length,
          }));
        }
        break;
      }
      case 'estatus': {
        if (
          snapshot.estatusItem &&
          !state.domainData.estatusCatalog.some((e) => e.id === recordId)
        ) {
          state.domainData.estatusCatalog = [
            snapshot.estatusItem,
            ...state.domainData.estatusCatalog,
          ];
        }
        break;
      }
      case 'tipo_auditoria': {
        if (
          snapshot.tipoItem &&
          !state.domainData.tiposCatalog.some((t) => t.id === recordId)
        ) {
          state.domainData.tiposCatalog = [
            snapshot.tipoItem,
            ...state.domainData.tiposCatalog,
          ];
        }
        break;
      }
      case 'metodologia_auditoria': {
        if (
          snapshot.metodologiaItem &&
          !state.domainData.metodologiasCatalog.some((m) => m.id === recordId)
        ) {
          state.domainData.metodologiasCatalog = [
            snapshot.metodologiaItem,
            ...state.domainData.metodologiasCatalog,
          ];
        }
        break;
      }
    }
    Reflect.deleteProperty(state.archiveGovernance.archivedSnapshotsByKey, snapKey);
  } else {
    state.domainData.archivedSiteIds.delete(recordId);
    state.domainData.archivedProcesoIds.delete(recordId);
    state.domainData.archivedTurnoIds.delete(recordId);
    state.domainData.archivedNoAplicableIds.delete(recordId);
    state.domainData.archivedFechaIds.delete(recordId);
    state.domainData.archivedContactoIds.delete(recordId);
    state.domainData.archivedTelefonoIds.delete(recordId);
    state.domainData.archivedEmailIds.delete(recordId);
  }

  recordPhase5SessionLog(
    tableName,
    recordId,
    'UPDATE',
    {
      deleted_at: existingEntry?.deletedAt || new Date().toISOString(),
      delete_reason: existingEntry?.deleteReason || null,
    },
    restorePayload
  );

  state.archiveGovernance.restoringId = null;
  showFloatingToast(`Registro "${title}" restaurado al catálogo activo.`, 'success');
  render();

  if (STRICT_UUID_PATTERN.test(recordId)) {
    void loadLiveCertificates();
    void loadDomainData();
    if (state.archiveGovernance.showArchived) {
      void loadArchivedRecordsForAdmin();
    }
  }
}

async function signInWithCredentials(
  email: string,
  password: string,
  quickEmail: string | null
): Promise<void> {
  if (!email || !password) return;

  state.auth = {
    ...state.auth,
    email,
    errorMessage: null,
    successMessage: null,
    submitting: true,
    quickLoginEmail: quickEmail,
  };
  render();

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    state.auth = {
      ...state.auth,
      errorMessage: translateDatabaseError(error || 'Unable to sign in.'),
      submitting: false,
      quickLoginEmail: null,
    };
    render();
    return;
  }

  state.auth.submitting = false;
  state.auth.quickLoginEmail = null;
  await loadUserSession(data.user);
}

async function handleSignUp(
  nombre: string,
  email: string,
  password: string,
  role: UserRole
): Promise<void> {
  if (!nombre || !email || !password) return;

  state.auth = {
    ...state.auth,
    nombre,
    email,
    requestedRole: role,
    errorMessage: null,
    successMessage: null,
    submitting: true,
    quickLoginEmail: null,
  };
  render();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        nombre,
        role,
      },
    },
  });

  if (error) {
    state.auth = {
      ...state.auth,
      errorMessage: translateDatabaseError(error),
      submitting: false,
    };
    render();
    return;
  }

  if (data.session && data.user) {
    state.auth.submitting = false;
    await loadUserSession(data.user);
    return;
  }

  const approvalNote =
    role === 'CLIENT'
      ? 'Check your email inbox to confirm your address before signing in.'
      : 'Check your email inbox to confirm your address. An administrator will also need to approve your account request.';

  state.auth = {
    ...state.auth,
    mode: 'login',
    submitting: false,
    errorMessage: null,
    successMessage: `Account created for ${email}. ${approvalNote}`,
  };
  render();
}

function resetClientSessionState(): void {
  const hadSession =
    state.booting || state.user !== null || state.profile !== null;
  state.booting = false;
  activeSessionLoadKey = null;
  state.user = null;
  state.profile = null;
  state.authorizedClientOrgIds = [];
  state.clientAccessRows = [];
  state.profileForm = {
    nombreInput: '',
    savingProfile: false,
    profileFeedback: null,
    profileError: null,
    passwordSectionOpen: false,
    newPasswordInput: '',
    confirmPasswordInput: '',
    savingPassword: false,
    passwordFeedback: null,
    passwordError: null,
  };
  state.activeRoute = 'dashboard';
  state.activeSubSection = null;
  state.openMenu = null;
  state.breadcrumbs = resetBreadcrumbToDomain('dashboard');
  state.auditLogModal = {
    isOpen: false,
    entityName: '',
    tableName: '',
    recordId: '',
    entries: [],
    actorDirectory: { ...SEEDED_ACTOR_DIRECTORY },
    loading: false,
    errorMessage: null,
  };
  state.archiveGovernance = {
    showArchived: false,
    modal: createInitialArchiveModalState(),
    toast: null,
    restoringId: null,
    archivedRecordsByTable: {},
    archivedSnapshotsByKey: {},
    archivedCatalogIds: new Set<string>(),
  };
  state.tableColumnWidths = {};
  syncUrlHash('dashboard', null, true);
  state.approvals.profiles = [];
  state.dbCheck = {
    checks: createInitialChecks(),
    running: false,
    lastCheckedAt: null,
  };
  state.exploration = {
    records: [...SAMPLE_CERTIFICATE_RECORDS],
    loading: false,
    query: '',
    selectedStatus: 'ALL',
    selectedStandard: 'ALL',
    viewMode: getStoredViewMode('grid'),
  };
  state.domainData = {
    audits: [...INITIAL_AUDITS],
    auditors: [...INITIAL_AUDITORS],
    organizations: [...INITIAL_ORGANIZATIONS],
    sites: [...INITIAL_SITES],
    processes: [...INITIAL_PROCESSES],
    shifts: [...INITIAL_SHIFTS],
    standards: [...INITIAL_STANDARDS],
    requirements: [...INITIAL_REQUIREMENTS],
    iafSectors: [...INITIAL_IAF],
    iafSubsectors: INITIAL_SUBSECTORES_IAF.map((s) => ({ ...s })),
    catalogs: [...INITIAL_CATALOGS],
    findings: [...INITIAL_FINDINGS],
    allOrganizaciones: [...INITIAL_ORGANIZACIONES],
    allClientAccesses: [],
    allCertificadosDetailed: [...INITIAL_CERTIFICADOS_DETAILED],
    allAuditorsDetailed: [...INITIAL_AUDITORES_DETAILED],
    allOrganismos: INITIAL_ORGANISMOS.map((o) => ({ ...o })),
    allAcreditaciones: buildInitialAcreditacionEntities(),
    programacionAudits: INITIAL_PROGRAMACION_AUDITS.map((a) => ({
      ...a,
      equipo: a.equipo.map((m) => ({ ...m })),
      sitiosMuestreo: a.sitiosMuestreo.map((s) => ({ ...s })),
      matrizNormativa: a.matrizNormativa.map((n) => ({ ...n })),
      recomendacion: a.recomendacion ? { ...a.recomendacion } : null,
    })),
    phase5Findings: INITIAL_PHASE5_FINDINGS.map((f) => ({ ...f })),
    shiftCatalog: INITIAL_TURNO_CATALOG.map((t) => ({ ...t })),
    requirementsCatalog: getAllSeededNormaRequirements(),
    estatusCatalog: [...INITIAL_ESTATUS_CATALOG],
    tiposCatalog: [...INITIAL_TIPOS_AUDITORIA_CATALOG],
    metodologiasCatalog: [...INITIAL_METODOLOGIAS_CATALOG],
    archivedSiteIds: new Set<string>(),
    archivedProcesoIds: new Set<string>(),
    archivedTurnoIds: new Set<string>(),
    archivedNoAplicableIds: new Set<string>(),
    archivedFechaIds: new Set<string>(),
    archivedContactoIds: new Set<string>(),
    archivedTelefonoIds: new Set<string>(),
    archivedEmailIds: new Set<string>(),
    sessionAuditLogs: [],
    loading: false,
  };
  state.programacionDomain = {
    selectedAuditId: null,
    activeChildTab: 'equipo',
    query: '',
    selectedTipo: 'ALL',
    selectedMetodologia: 'ALL',
    selectedEstatus: 'ALL',
    selectedAuditorLider: 'ALL',
    viewMode: 'grid',
    sortColumn: null,
    sortDirection: 'none',
    isPlanningModalOpen: false,
    isEditingAttributes: false,
    isAddingTeamMember: false,
    editErrorMessage: null,
    saveSuccessMessage: null,
    isSidebarOpen: true,
    facetSelections: {},
  };
  state.calendarioDomain = {
    displayMode: 'month',
    referenceYear: 2024,
    referenceMonth: 11,
    filterAuditorId: 'ALL',
    filterStandard: 'ALL',
    filterMethodology: 'ALL',
    drawerAuditId: null,
  };
  state.resultadoDomain = {
    selectedAuditId: 'ALL',
    activeAuditIdForDecision: INITIAL_PROGRAMACION_AUDITS[0]?.id || '',
    displayMode: 'list',
    filterType: 'ALL',
    filterLifecycle: 'ALL',
    searchQuery: '',
    isLoggingFinding: false,
    inspectingFindingId: null,
    recommendationError: null,
    recommendationSuccess: null,
    findingFormError: null,
  };
  state.organizacionDomain = {
    selectedOrganizacionId: null,
    query: '',
    hasActiveCertificates: 'ALL',
    selectedSectorIaf: 'ALL',
    viewMode: 'grid',
    sortColumn: null,
    sortDirection: 'none',
    isEditingAttributes: false,
    activeChildTab: 'certificados',
    formDraft: undefined,
    editFormData: undefined,
    editErrorMessage: null,
    isSidebarOpen: true,
    facetSelections: {},
    isCreating: false,
  };
  state.clientAccessDomain = {
    selectedAccessId: null,
    prefillOrganizacionId: null,
    isCreating: false,
    isEditingAttributes: false,
    formDraft: undefined,
    editErrorMessage: null,
  };
  state.certificadoDomain = {
    selectedCertId: null,
    activeChildTab: 'sitios',
    query: '',
    selectedStandard: 'ALL',
    selectedStatus: 'ALL',
    selectedSectorIaf: 'ALL',
    viewMode: 'grid',
    sortColumn: null,
    sortDirection: 'none',
    childSortState: {},
    isEditingAttributes: false,
    editFormData: undefined,
    editErrorMessage: null,
    originatingOrganizacionId: null,
    isSidebarOpen: true,
    facetSelections: {},
    isCreating: false,
    createErrorMessage: null,
  };
  state.sitioDomain = {
    selectedSitioId: null,
    activeChildTab: 'turnos',
    isCreating: false,
    prefillCertId: null,
    isEditingAttributes: false,
    formDraft: undefined,
    editFormData: undefined,
    editErrorMessage: null,
    archiveConfirmOpen: false,
    archiveErrorMessage: null,
    isAssigningShift: false,
    childSortState: {},
  };
  state.procesoDomain = {
    selectedProcesoId: null,
    activeChildTab: 'requisitos',
    isCreating: false,
    prefillCertId: null,
    isEditingAttributes: false,
    formDraft: undefined,
    editFormData: undefined,
    editErrorMessage: null,
    archiveConfirmOpen: false,
    archiveErrorMessage: null,
    isAssigningRequisito: false,
    childSortState: {},
  };
  state.turnoDomain = {
    selectedTurnoId: null,
    originatingSitioId: null,
    activeChildTab: 'sitios',
    isCreating: false,
    prefillCertId: null,
    prefillSitioId: null,
    isEditingAttributes: false,
    formDraft: undefined,
    editFormData: undefined,
    editErrorMessage: null,
    archiveConfirmOpen: false,
    archiveErrorMessage: null,
    childSortState: {},
  };
  state.noAplicableDomain = {
    selectedNoAplicableId: null,
    originatingCertId: null,
    isCreating: false,
    isEditingAttributes: false,
    formDraft: undefined,
    editErrorMessage: null,
    archiveConfirmOpen: false,
    archiveErrorMessage: null,
  };
  state.fechaDomain = {
    selectedFechaId: null,
    originatingCertId: null,
    isCreating: false,
    isEditingAttributes: false,
    formDraft: undefined,
    editFormData: undefined,
    editErrorMessage: null,
  };
  state.contactoDomain = {
    selectedContactoId: null,
    originatingCertId: null,
    activeChildTab: 'telefonos',
    isCreating: false,
    isEditingAttributes: false,
    formDraft: undefined,
    editFormData: undefined,
    editErrorMessage: null,
    childSortState: {},
  };
  state.telefonoDomain = {
    selectedTelefonoId: null,
    originatingContactoId: null,
    isCreating: false,
    isEditingAttributes: false,
    formDraft: undefined,
    editFormData: undefined,
    editErrorMessage: null,
  };
  state.emailDomain = {
    selectedEmailId: null,
    originatingContactoId: null,
    isCreating: false,
    isEditingAttributes: false,
    formDraft: undefined,
    editFormData: undefined,
    editErrorMessage: null,
  };
  state.auditorDomain = {
    selectedAuditorId: null,
    activeChildTab: 'competencias',
    query: '',
    selectedCalificacion: 'ALL',
    selectedStandard: 'ALL',
    selectedSectorIaf: 'ALL',
    viewMode: 'grid',
    sortColumn: null,
    sortDirection: 'none',
    isEditingAttributes: false,
    formDraft: undefined,
    editFormData: undefined,
    editErrorMessage: null,
    isSidebarOpen: true,
    facetSelections: {},
    isCreating: false,
    createErrorMessage: null,
  };
  state.competenciaAuditorDomain = {
    isOpen: false,
    mode: 'read',
    selectedComp: null,
    prefillAuditorId: null,
    formDraft: undefined,
    errorMessage: null,
    confirmUnlink: false,
  };
  state.extraDomain = {
    selectedNormaId: null,
    activeNormaTab: 'requisitos',
    normaSearchQuery: '',
    normaRequisitoQuery: '',
    normaFilterStatus: 'ALL',
    normaFilterScheme: 'ALL',
    normaViewMode: 'grid',
    normaSortColumn: null,
    normaSortDirection: 'none',
    normaIsSidebarOpen: true,
    normaFacetSelections: {},
    isCreatingNorma: false,
    isEditingNorma: false,
    normaFormDraft: undefined,
    normaEditError: null,

    selectedRequisitoId: null,
    prefillRequisitoNormaId: null,
    prefillRequisitoPadreId: null,
    requisitoReaderScope: 'clause',
    requisitoFullNormaQuery: '',
    activeRequisitoTab: 'subrequisitos',
    requisitoLangMode: 'es',
    requisitoContentCollapsed: false,
    requisitoEditorLang: 'es',
    requisitoEditorMode: 'visual',
    requisitoEditorLinkPopoverOpen: false,
    requisitoEditorLinkUrl: '',
    requisitoEditorLinkLabel: '',
    requisitoEditorLinkError: null,
    requisitoEditorPickerOpen: false,
    requisitoEditorPickerQuery: '',
    isCreatingRequisito: false,
    isEditingRequisito: false,
    requisitoFormDraft: undefined,
    requisitoEditError: null,

    selectedSectorId: null,
    activeSectorTab: 'subsectores',
    iafSearchQuery: '',
    iafFilterRisk: 'ALL',
    iafViewMode: 'grid',
    iafSortColumn: null,
    iafSortDirection: 'none',
    iafIsSidebarOpen: true,
    iafFacetSelections: {},
    isCreatingSector: false,
    isEditingSector: false,
    sectorFormDraft: undefined,
    sectorEditError: null,

    selectedSubsectorId: null,
    prefillSubsectorSectorId: null,
    activeSubsectorTab: 'certificados',
    isCreatingSubsector: false,
    isEditingSubsector: false,
    subsectorFormDraft: undefined,
    subsectorEditError: null,

    selectedEstatusId: null,
    activeEstatusTab: 'certificados',
    estatusSearchQuery: '',
    estatusViewMode: 'grid',
    estatusSortColumn: null,
    estatusSortDirection: 'none',
    estatusIsSidebarOpen: true,
    estatusFacetSelections: {},
    isCreatingEstatus: false,
    isEditingEstatus: false,
    estatusFormDraft: undefined,
    estatusEditError: null,

    selectedTipoId: null,
    tipoSearchQuery: '',
    tipoViewMode: 'grid',
    tipoSortColumn: null,
    tipoSortDirection: 'none',
    tipoIsSidebarOpen: true,
    tipoFacetSelections: {},
    isCreatingTipo: false,
    isEditingTipo: false,
    tipoFormDraft: undefined,
    tipoEditError: null,

    selectedMetodologiaId: null,
    metodologiaSearchQuery: '',
    metodologiaViewMode: 'grid',
    metodologiaSortColumn: null,
    metodologiaSortDirection: 'none',
    metodologiaIsSidebarOpen: true,
    metodologiaFacetSelections: {},
    isCreatingMetodologia: false,
    isEditingMetodologia: false,
    metodologiaFormDraft: undefined,
    metodologiaEditError: null,

    selectedOrganismoId: null,
    activeOrganismoTab: 'acreditaciones',
    organismoSearchQuery: '',
    organismoViewMode: 'grid',
    organismoSortColumn: null,
    organismoSortDirection: 'none',
    organismoIsSidebarOpen: true,
    organismoFacetSelections: {},
    isCreatingOrganismo: false,
    isEditingOrganismo: false,
    organismoFormDraft: undefined,
    organismoEditError: null,

    selectedAccreditationId: null,
    activeAccreditationTab: 'certificados',
    accredSearchQuery: '',
    accredViewMode: 'grid',
    accredSortColumn: null,
    accredSortDirection: 'none',
    accredIsSidebarOpen: true,
    accredFacetSelections: {},
    isCreatingAccreditation: false,
    isEditingAccreditation: false,
    accredFormDraft: undefined,
    accredEditErrorMessage: null,
  };
  state.auth = {
    ...state.auth,
    mode: 'login',
    errorMessage: null,
    successMessage: null,
    submitting: false,
    quickLoginEmail: null,
    resetModalOpen: false,
    resettingDb: false,
    resetErrorMessage: null,
  };
  if (hadSession) {
    render();
  }
}

async function handleSignOut(): Promise<void> {
  if (isSigningOut) return;
  isSigningOut = true;
  try {
    resetClientSessionState();
    await supabase.auth.signOut({ scope: 'local' });
  } catch (err) {
    console.warn('Error during signOut cleanup:', err);
  } finally {
    isSigningOut = false;
  }
}

async function handleResetDatabase(): Promise<void> {
  if (state.auth.resettingDb) return;

  state.auth = {
    ...state.auth,
    resettingDb: true,
    resetErrorMessage: null,
    errorMessage: null,
    successMessage: null,
  };
  render();

  try {
    const response = await fetch('/api/reset-db', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const payload = (await response.json()) as {
      ok?: boolean;
      error?: string;
      executedFiles?: Array<{ file: string; durationMs: number }>;
      totalDurationMs?: number;
    };

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || `Reset failed with status ${response.status}.`);
    }

    const fileNames = (payload.executedFiles || []).map((item) => item.file);
    state.auth = {
      ...state.auth,
      resetModalOpen: false,
      resettingDb: false,
      resetErrorMessage: null,
      errorMessage: null,
      successMessage: formatResetSummary(fileNames, payload.totalDurationMs),
    };
    void loadLiveCertificates();
  } catch (err) {
    state.auth = {
      ...state.auth,
      resettingDb: false,
      resetErrorMessage: err instanceof Error ? err.message : 'Unable to reset database.',
    };
  }

  render();
}

async function loadUserSession(user: User | null): Promise<void> {
  state.booting = false;
  if (!user) {
    activeSessionLoadKey = null;
    state.user = null;
    state.profile = null;
    render();
    return;
  }

  if (activeSessionLoadKey === user.id || state.user?.id === user.id) {
    return;
  }
  activeSessionLoadKey = user.id;

  try {
    const { data: profileData, error } = await supabase
      .from('profiles')
      .select('id, nombre, role, status, created_at')
      .eq('id', user.id)
      .maybeSingle();

    if (isSigningOut) return;

    if (error || !profileData) {
      state.user = user;
      state.profile = {
        id: user.id,
        nombre: (user.user_metadata?.nombre as string | undefined) || user.email || 'User',
        role: ((user.user_metadata?.role as UserRole | undefined) || 'CLIENT'),
        status: 'PENDING',
      };
    } else {
      state.user = user;
      state.profile = profileData as UserProfile;
    }

    state.profileForm = {
      nombreInput: state.profile.nombre,
      savingProfile: false,
      profileFeedback: null,
      profileError: null,
      passwordSectionOpen: false,
      newPasswordInput: '',
      confirmPasswordInput: '',
      savingPassword: false,
      passwordFeedback: null,
      passwordError: null,
    };

    if (state.profile.role === 'CLIENT') {
      const { data: orgAccessRows } = await supabase
        .from('client_organization_access')
        .select('id_organizacion, estado, fecha_solicitud, organizacion:id_organizacion ( nombre, rif )')
        .eq('id_usuario', user.id)
        .is('deleted_at', null);
      const rows = Array.isArray(orgAccessRows) ? orgAccessRows : [];
      state.clientAccessRows = rows.map((row: Record<string, unknown>) => {
        const org = (row.organizacion as Record<string, unknown> | null) || null;
        return {
          id_organizacion: String(row.id_organizacion || ''),
          organizacion_nombre: org?.nombre ? String(org.nombre) : 'Organización vinculada',
          rif: org?.rif ? String(org.rif) : undefined,
          estado: String(row.estado || 'PENDING') as UserStatus,
          fecha_solicitud: row.fecha_solicitud ? String(row.fecha_solicitud) : undefined,
        };
      });
      state.authorizedClientOrgIds =
        state.profile.status === 'APPROVED'
          ? state.clientAccessRows
              .filter((r) => r.estado === 'APPROVED' && Boolean(r.id_organizacion))
              .map((r) => r.id_organizacion)
          : [];
    } else {
      state.clientAccessRows = [];
      state.authorizedClientOrgIds = [];
    }

    const initialNav = parseHashRoute();
    if (canAccessRoute(state.profile, initialNav.route)) {
      state.activeRoute = initialNav.route;
      state.activeSubSection = initialNav.subview;
    } else {
      state.activeRoute = 'dashboard';
      state.activeSubSection = null;
    }
    syncUrlHash(state.activeRoute, state.activeSubSection, true);
    state.breadcrumbs = resetBreadcrumbToDomain(state.activeRoute, state.activeSubSection);
    state.openMenu = null;
    render();

    if (isApprovedStaff()) {
      void loadApprovalProfiles();
    }

    if (state.profile?.status === 'APPROVED') {
      void loadLiveCertificates();
      void loadDomainData();
    }
  } finally {
    if (activeSessionLoadKey === user.id) {
      activeSessionLoadKey = null;
    }
  }
}

async function loadLiveCertificates(): Promise<void> {
  if (state.exploration.loading) return;
  state.exploration.loading = true;
  render();

  try {
    const [
      certsRes,
      fechasRes,
      contactosRes,
      telefonosRes,
      emailsRes,
      noAplicablesRes,
      turnosPorSitioRes,
      sitiosRes,
      procesosRes,
      reqsPorProcesoRes,
    ] = await Promise.all([
      supabase
        .from('certificado')
        .select(`
          id,
          numero_certificado,
          alcance,
          multisitio,
          created_at,
          id_organizacion,
          id_norma,
          id_estatus,
          id_sector_iaf,
          id_subsector_iaf,
          organizacion:id_organizacion ( id, nombre, rif, direccion_fiscal ),
          norma:id_norma ( id, esquema, codigo, titulo, norma ),
          estatus:id_estatus ( id, estatus ),
          sector_iaf:id_sector_iaf ( id, sector ),
          subsector_iaf:id_subsector_iaf ( id, codigo, descripcion, categoria_riesgo )
        `)
        .is('deleted_at', null),
      supabase
        .from('fecha_certificado')
        .select('id, id_certificado, fecha, tipo_fecha')
        .is('deleted_at', null),
      supabase
        .from('contacto_certificado')
        .select('id, id_certificado, nombre, cargo')
        .is('deleted_at', null),
      supabase
        .from('telefono_contacto_certificado')
        .select('id, id_contacto, telefono, tipo_telefono')
        .is('deleted_at', null),
      supabase
        .from('email_contacto_certificado')
        .select('id, id_contacto, email, tipo_email')
        .is('deleted_at', null),
      supabase
        .from('requisitos_no_aplicables_certificado')
        .select(`
          id,
          id_certificado,
          id_requisito,
          justificacion,
          requisito:id_requisito ( id, codigo, ruta_materializada )
        `)
        .is('deleted_at', null),
      supabase
        .from('turnos_por_sitio')
        .select(`
          id,
          id_sitio,
          id_turno,
          sitio:id_sitio ( id, id_certificado, nombre_sitio ),
          turno:id_turno ( id, hora_entrada, hora_salida )
        `)
        .is('deleted_at', null),
      supabase
        .from('sitio')
        .select('id, id_certificado, numero_sitio, nombre_sitio, direccion_sitio')
        .is('deleted_at', null),
      supabase
        .from('proceso')
        .select('id, id_certificado, nombre_proceso, tipo')
        .is('deleted_at', null),
      supabase
        .from('requisitos_por_proceso')
        .select('id_proceso, id_requisito, requisito:id_requisito ( id, codigo, ruta_materializada )'),
    ]);

    const { data, error } = certsRes;

    const telefonosByContacto = new Map<string, TelefonoContactoEntity[]>();
    if (!telefonosRes.error && Array.isArray(telefonosRes.data)) {
      for (const row of telefonosRes.data as Array<Record<string, unknown>>) {
        const contactId = String(row.id_contacto || '');
        if (!contactId) continue;
        const list = telefonosByContacto.get(contactId) || [];
        list.push({
          id: String(row.id),
          id_contacto: contactId,
          telefono: String(row.telefono || ''),
          tipo_telefono: String(row.tipo_telefono || 'Oficina'),
        });
        telefonosByContacto.set(contactId, list);
      }
    }

    const emailsByContacto = new Map<string, EmailContactoEntity[]>();
    if (!emailsRes.error && Array.isArray(emailsRes.data)) {
      for (const row of emailsRes.data as Array<Record<string, unknown>>) {
        const contactId = String(row.id_contacto || '');
        if (!contactId) continue;
        const list = emailsByContacto.get(contactId) || [];
        list.push({
          id: String(row.id),
          id_contacto: contactId,
          email: String(row.email || ''),
          tipo_email: String(row.tipo_email || 'Trabajo'),
        });
        emailsByContacto.set(contactId, list);
      }
    }

    const contactosByCert = new Map<string, ContactoCertificadoEntity[]>();
    if (!contactosRes.error && Array.isArray(contactosRes.data)) {
      for (const row of contactosRes.data as Array<Record<string, unknown>>) {
        const certId = String(row.id_certificado || '');
        const contactId = String(row.id || '');
        if (!certId || !contactId) continue;
        const list = contactosByCert.get(certId) || [];
        list.push({
          id: contactId,
          id_certificado: certId,
          nombre: String(row.nombre || ''),
          cargo: row.cargo !== null && row.cargo !== undefined ? String(row.cargo) : null,
          telefonos: telefonosByContacto.get(contactId) || [],
          emails: emailsByContacto.get(contactId) || [],
        });
        contactosByCert.set(certId, list);
      }
    }

    const fechasByCert = new Map<string, FechaCertificadoEntity[]>();
    if (!fechasRes.error && Array.isArray(fechasRes.data)) {
      for (const row of fechasRes.data as Array<Record<string, unknown>>) {
        const certId = String(row.id_certificado || '');
        if (!certId) continue;
        const list = fechasByCert.get(certId) || [];
        list.push({
          id: String(row.id),
          id_certificado: certId,
          fecha: String(row.fecha || '').slice(0, 10),
          tipo_fecha: String(row.tipo_fecha || ''),
        });
        fechasByCert.set(certId, list);
      }
    }

    const reqLookupCatalog = [
      ...state.domainData.requirementsCatalog,
      ...getAllSeededNormaRequirements(),
    ];
    const noAplicablesByCert = new Map<string, NonApplicableRequirementEntity[]>();
    if (!noAplicablesRes.error && Array.isArray(noAplicablesRes.data)) {
      for (const row of noAplicablesRes.data as Array<Record<string, unknown>>) {
        const certId = String(row.id_certificado || '');
        const reqId = String(row.id_requisito || '');
        if (!certId || !reqId) continue;
        const reqObj = (row.requisito as Record<string, unknown> | null) || null;
        const matchedCatalogReq =
          reqLookupCatalog.find((r) => r.id === reqId) ||
          (reqObj?.codigo
            ? reqLookupCatalog.find(
                (r) => r.codigo.trim().toLowerCase() === String(reqObj.codigo).trim().toLowerCase()
              )
            : undefined);
        const reqCodigo = reqObj?.codigo
          ? String(reqObj.codigo)
          : matchedCatalogReq?.codigo || '4.3';
        const list = noAplicablesByCert.get(certId) || [];
        list.push({
          id: String(row.id),
          id_certificado: certId,
          id_requisito: reqId,
          requisito_codigo: reqCodigo,
          requisito_titulo: matchedCatalogReq?.titulo || `Cláusula ${reqCodigo}`,
          ruta_materializada: reqObj?.ruta_materializada
            ? String(reqObj.ruta_materializada)
            : matchedCatalogReq?.ruta_materializada || reqCodigo,
          justificacion: String(row.justificacion || ''),
        });
        noAplicablesByCert.set(certId, list);
      }
    }

    const dbShiftLinksByCert = new Map<
      string,
      Array<{
        sitioId: string;
        sitioNombre: string;
        turnoId: string;
        hora_entrada: string;
        hora_salida: string;
        descripcion: string;
      }>
    >();
    if (!turnosPorSitioRes.error && Array.isArray(turnosPorSitioRes.data)) {
      for (const row of turnosPorSitioRes.data as Array<Record<string, unknown>>) {
        const sitioObj = (row.sitio as Record<string, unknown> | null) || null;
        const turnoObj = (row.turno as Record<string, unknown> | null) || null;
        const certId = String(sitioObj?.id_certificado || '');
        const sitioId = String(row.id_sitio || sitioObj?.id || '');
        const turnoId = String(row.id_turno || turnoObj?.id || '');
        if (!certId || !sitioId || !turnoId || !turnoObj) continue;
        const catMatch = state.domainData.shiftCatalog.find((t) => t.id === turnoId);
        const horaEntrada = String(turnoObj.hora_entrada || catMatch?.hora_entrada || '07:00:00');
        const horaSalida = String(turnoObj.hora_salida || catMatch?.hora_salida || '15:00:00');
        const descripcion =
          catMatch?.descripcion ||
          `Turno ${formatTurnoTime(horaEntrada)} – ${formatTurnoTime(horaSalida)}`;
        const list = dbShiftLinksByCert.get(certId) || [];
        list.push({
          sitioId,
          sitioNombre: String(sitioObj?.nombre_sitio || 'Sede Operativa'),
          turnoId,
          hora_entrada: horaEntrada,
          hora_salida: horaSalida,
          descripcion,
        });
        dbShiftLinksByCert.set(certId, list);
      }
    }

    const sitiosByCert = new Map<string, SiteEntity[]>();
    if (!sitiosRes.error && Array.isArray(sitiosRes.data)) {
      for (const row of sitiosRes.data as Array<Record<string, unknown>>) {
        const sitioId = String(row.id || '');
        const certId = String(row.id_certificado || '');
        if (!sitioId || !certId) continue;
        const rawNumero = Number(row.numero_sitio);
        const numeroSitio = Number.isFinite(rawNumero) ? rawNumero : 0;
        const list = sitiosByCert.get(certId) || [];
        list.push({
          id: sitioId,
          id_certificado: certId,
          numero_sitio: numeroSitio,
          nombre_sitio: String(row.nombre_sitio || 'Sede Operativa'),
          direccion_sitio: String(row.direccion_sitio || ''),
          tipo_sitio: numeroSitio === 0 ? 'Principal (HQ)' : 'Sucursal',
          turnos_vinculados: [],
        });
        sitiosByCert.set(certId, list);
      }
      for (const [certId, list] of sitiosByCert.entries()) {
        list.sort((a, b) => a.numero_sitio - b.numero_sitio);
        sitiosByCert.set(certId, list);
      }
    }

    const reqsByProceso = new Map<
      string,
      Array<{ codigo: string; titulo: string }>
    >();
    if (!reqsPorProcesoRes.error && Array.isArray(reqsPorProcesoRes.data)) {
      for (const row of reqsPorProcesoRes.data as Array<Record<string, unknown>>) {
        const procId = String(row.id_proceso || '');
        const reqId = String(row.id_requisito || '');
        if (!procId || !reqId) continue;
        const reqObj = (row.requisito as Record<string, unknown> | null) || null;
        const matchedCatalogReq =
          reqLookupCatalog.find((r) => r.id === reqId) ||
          (reqObj?.codigo
            ? reqLookupCatalog.find(
                (r) =>
                  r.codigo.trim().toLowerCase() === String(reqObj.codigo).trim().toLowerCase()
              )
            : undefined);
        const codigo = reqObj?.codigo
          ? String(reqObj.codigo)
          : matchedCatalogReq?.codigo || '';
        if (!codigo) continue;
        const titulo = matchedCatalogReq?.titulo || `Cláusula ${codigo}`;
        const list = reqsByProceso.get(procId) || [];
        if (!list.some((d) => d.codigo.trim().toLowerCase() === codigo.trim().toLowerCase())) {
          list.push({ codigo, titulo });
        }
        reqsByProceso.set(procId, list);
      }
    }

    const procesosByCert = new Map<string, ProcessEntity[]>();
    if (!procesosRes.error && Array.isArray(procesosRes.data)) {
      for (const row of procesosRes.data as Array<Record<string, unknown>>) {
        const procId = String(row.id || '');
        const certId = String(row.id_certificado || '');
        if (!procId || !certId) continue;
        const rawTipo = String(row.tipo || 'Medular');
        const tipo: ProcesoTipo =
          rawTipo === 'Estratégico' ||
          rawTipo === 'Medular' ||
          rawTipo === 'De Apoyo' ||
          rawTipo === 'Otro'
            ? rawTipo
            : 'Medular';
        const reqDetails = reqsByProceso.get(procId) || [];
        const list = procesosByCert.get(certId) || [];
        list.push({
          id: procId,
          id_certificado: certId,
          nombre_proceso: String(row.nombre_proceso || 'Proceso Operativo'),
          tipo,
          clausulas_cubiertas: reqDetails.map((d) => d.codigo),
          requisitos_detalle: reqDetails,
        });
        procesosByCert.set(certId, list);
      }
    }

    if (!error && Array.isArray(data) && data.length > 0) {
      const existingById = new Map(
        state.domainData.allCertificadosDetailed.map((c) => [c.id, c])
      );
      const loadedDetailed: CertificadoDetailEntity[] = [];

      const loaded: CertificateRecord[] = await Promise.all(
        data.map(async (row: Record<string, unknown>) => {
          const certId = String(row.id);
          const org = (row.organizacion as Record<string, unknown> | null) || null;
          const norma = (row.norma as Record<string, unknown> | null) || null;
          const estatus = (row.estatus as Record<string, unknown> | null) || null;
          const sectorIaf = (row.sector_iaf as Record<string, unknown> | null) || null;
          const subsectorIaf = (row.subsector_iaf as Record<string, unknown> | null) || null;
          const seedMatch = existingById.get(certId);

          let coveragePct = 86;
          let coverageSummary: CoverageBreakdown = { covered: 4, nonApplicable: 2, pending: 1, total: 7 };

          try {
            const { data: covData } = await supabase.rpc('cobertura_normativa_certificado', {
              p_id_certificado: certId,
            });
            if (Array.isArray(covData) && covData.length > 0) {
              const covered = covData.filter((c: { estado_cobertura?: string }) => c.estado_cobertura === 'CUBIERTO').length;
              const nonApp = covData.filter((c: { estado_cobertura?: string }) => c.estado_cobertura === 'NO_APLICABLE').length;
              const pending = covData.filter((c: { estado_cobertura?: string }) => c.estado_cobertura === 'PENDIENTE').length;
              const total = covData.length;
              coverageSummary = { covered, nonApplicable: nonApp, pending, total };
              coveragePct = Math.round(((covered + nonApp) / total) * 100);
            }
          } catch {
            // Keep default
          }

          const liveFechas: FechaCertificadoEntity[] = !fechasRes.error
            ? fechasByCert.get(certId) || []
            : seedMatch?.fechas || [];
          const liveContactos: ContactoCertificadoEntity[] = !contactosRes.error
            ? contactosByCert.get(certId) || []
            : seedMatch?.contactos || [];

          const derivedVigencia = deriveCertificateVigenciaDates(
            liveFechas,
            seedMatch?.fecha_emision || '2024-03-15',
            seedMatch?.fecha_vencimiento || '2027-03-14'
          );

          const sectorNum = sectorIaf?.sector
            ? Number(sectorIaf.sector)
            : seedMatch?.sector_iaf || 17;
          const matchedSectorMeta =
            state.domainData.iafSectors.find((s) => s.sector === sectorNum) ||
            INITIAL_SECTORES_IAF.find((s) => s.sector === sectorNum);

          const resolvedSubsectorId = row.id_subsector_iaf
            ? String(row.id_subsector_iaf)
            : subsectorIaf?.id
            ? String(subsectorIaf.id)
            : seedMatch?.id_subsector_iaf || state.domainData.iafSubsectors[0]?.id || '';
          const matchedSubsectorFallback =
            state.domainData.iafSubsectors.find((sub) => sub.id === resolvedSubsectorId) ||
            INITIAL_SUBSECTORES_IAF.find((sub) => sub.id === resolvedSubsectorId);

          const riskRaw = subsectorIaf?.categoria_riesgo
            ? String(subsectorIaf.categoria_riesgo)
            : matchedSubsectorFallback?.categoria_riesgo || seedMatch?.subsector_categoria_riesgo;
          const resolvedRisk: 'ALTO' | 'MEDIO' | 'BAJO' | undefined =
            riskRaw === 'ALTO' || riskRaw === 'MEDIO' || riskRaw === 'BAJO'
              ? riskRaw
              : undefined;

          const liveNoAplicables: NonApplicableRequirementEntity[] = !noAplicablesRes.error
            ? noAplicablesByCert.get(certId) || []
            : seedMatch?.noAplicables || [];

          const seedSitesById = new Map((seedMatch?.sitios || []).map((s) => [s.id, s]));
          const baseSitios: SiteEntity[] = !sitiosRes.error
            ? (sitiosByCert.get(certId) || []).map((dbSite) => {
                const seedSite = seedSitesById.get(dbSite.id);
                return {
                  ...dbSite,
                  tipo_sitio: seedSite?.tipo_sitio || dbSite.tipo_sitio,
                  personal_count: seedSite?.personal_count,
                  actividades: seedSite?.actividades,
                  turnos_vinculados: [...(seedSite?.turnos_vinculados || [])],
                };
              })
            : (seedMatch?.sitios || []).map((s) => ({
                ...s,
                turnos_vinculados: [...(s.turnos_vinculados || [])],
              }));

          let sitesCount = !sitiosRes.error ? baseSitios.length : 1;
          if (sitiosRes.error) {
            try {
              const { count } = await supabase
                .from('sitio')
                .select('id', { count: 'exact', head: true })
                .eq('id_certificado', certId)
                .is('deleted_at', null);
              if (typeof count === 'number') {
                sitesCount = count;
              }
            } catch {
              // Keep default
            }
          }

          const seedProcsById = new Map((seedMatch?.procesos || []).map((p) => [p.id, p]));
          const baseProcesos: ProcessEntity[] = !procesosRes.error
            ? (procesosByCert.get(certId) || []).map((dbProc) => {
                const seedProc = seedProcsById.get(dbProc.id);
                const useSeedReqs =
                  reqsPorProcesoRes.error && seedProc && seedProc.clausulas_cubiertas.length > 0;
                return {
                  ...dbProc,
                  responsable: seedProc?.responsable,
                  clausulas_cubiertas: useSeedReqs
                    ? [...seedProc.clausulas_cubiertas]
                    : dbProc.clausulas_cubiertas,
                  requisitos_detalle: useSeedReqs
                    ? [...(seedProc.requisitos_detalle || [])]
                    : dbProc.requisitos_detalle,
                };
              })
            : (seedMatch?.procesos || []).map((p) => ({
                ...p,
                clausulas_cubiertas: [...p.clausulas_cubiertas],
                requisitos_detalle: p.requisitos_detalle ? [...p.requisitos_detalle] : undefined,
              }));

          const baseTurnos = (seedMatch?.turnos || []).map((t) => ({
            ...t,
            sitios_vinculados: [...(t.sitios_vinculados || [])],
          }));
          const extraShiftLinks = dbShiftLinksByCert.get(certId) || [];
          for (const link of extraShiftLinks) {
            const targetSite = baseSitios.find((s) => s.id === link.sitioId);
            if (targetSite) {
              const currentLinks = targetSite.turnos_vinculados || [];
              if (!currentLinks.includes(link.descripcion)) {
                targetSite.turnos_vinculados = [...currentLinks, link.descripcion];
              }
            }
            const existingTurno = baseTurnos.find((t) => t.id === link.turnoId);
            if (existingTurno) {
              if (!existingTurno.sitios_vinculados.includes(link.sitioNombre)) {
                existingTurno.sitios_vinculados.push(link.sitioNombre);
              }
            } else {
              baseTurnos.push({
                id: link.turnoId,
                hora_entrada: link.hora_entrada,
                hora_salida: link.hora_salida,
                descripcion: link.descripcion,
                empleados_activos: 0,
                sitios_vinculados: [link.sitioNombre],
              });
            }
          }

          loadedDetailed.push({
            id: certId,
            numero_certificado: String(row.numero_certificado || 'FN-CERT-000'),
            id_organizacion: org?.id
              ? String(org.id)
              : row.id_organizacion
              ? String(row.id_organizacion)
              : seedMatch?.id_organizacion || '',
            organizacion_nombre: org?.nombre
              ? String(org.nombre)
              : seedMatch?.organizacion_nombre || 'Organización Registrada',
            organizacion_rif: org?.rif
              ? String(org.rif)
              : seedMatch?.organizacion_rif || 'RIF No Registrado',
            direccion_fiscal: org?.direccion_fiscal
              ? String(org.direccion_fiscal)
              : seedMatch?.direccion_fiscal,
            id_norma: norma?.id
              ? String(norma.id)
              : row.id_norma
              ? String(row.id_norma)
              : seedMatch?.id_norma || '',
            norma_codigo: norma?.codigo
              ? String(norma.codigo)
              : norma?.norma
              ? String(norma.norma)
              : seedMatch?.norma_codigo || 'ISO 9001:2015',
            norma_titulo: norma?.titulo
              ? String(norma.titulo)
              : seedMatch?.norma_titulo || 'Sistema de Gestión',
            esquema: norma?.esquema
              ? String(norma.esquema)
              : seedMatch?.esquema || 'SGC - Calidad',
            id_estatus: estatus?.id
              ? String(estatus.id)
              : row.id_estatus
              ? String(row.id_estatus)
              : seedMatch?.id_estatus || '',
            estatus: estatus?.estatus
              ? String(estatus.estatus)
              : seedMatch?.estatus || 'Activo',
            id_sector_iaf: sectorIaf?.id
              ? String(sectorIaf.id)
              : row.id_sector_iaf
              ? String(row.id_sector_iaf)
              : seedMatch?.id_sector_iaf || '',
            sector_iaf: sectorNum,
            sector_iaf_descripcion:
              matchedSectorMeta?.descripcion ||
              seedMatch?.sector_iaf_descripcion ||
              `Sector ${sectorNum}`,
            id_subsector_iaf: resolvedSubsectorId,
            subsector_iaf_codigo: subsectorIaf?.codigo
              ? String(subsectorIaf.codigo)
              : matchedSubsectorFallback?.codigo || seedMatch?.subsector_iaf_codigo,
            subsector_iaf_descripcion: subsectorIaf?.descripcion
              ? String(subsectorIaf.descripcion)
              : matchedSubsectorFallback?.descripcion || seedMatch?.subsector_iaf_descripcion,
            subsector_categoria_riesgo: resolvedRisk,
            organismo_acreditador_codigo: seedMatch?.organismo_acreditador_codigo,
            organismo_acreditador_nombre: seedMatch?.organismo_acreditador_nombre,
            numero_acreditacion: seedMatch?.numero_acreditacion,
            fecha_emision: derivedVigencia.fecha_emision,
            fecha_vencimiento: derivedVigencia.fecha_vencimiento,
            alcance:
              row.alcance !== null && row.alcance !== undefined && String(row.alcance).trim() !== ''
                ? String(row.alcance)
                : seedMatch?.alcance || '',
            multisitio: Boolean(row.multisitio),
            sitios: baseSitios,
            procesos: baseProcesos,
            turnos: baseTurnos,
            noAplicables: liveNoAplicables,
            auditorias: seedMatch?.auditorias || [],
            fechas: liveFechas,
            contactos: liveContactos,
          });

          return {
            id: certId,
            numero_certificado: String(row.numero_certificado || 'FN-CERT-000'),
            organizacion_id: org ? String(org.id) : undefined,
            organizacion_nombre: org ? String(org.nombre) : 'Organización Registrada',
            organizacion_rif: org ? String(org.rif || 'RIF No Registrado') : 'RIF No Registrado',
            direccion_fiscal: org?.direccion_fiscal ? String(org.direccion_fiscal) : undefined,
            norma_id: norma ? String(norma.id) : undefined,
            norma: norma ? String(norma.norma || norma.codigo || 'ISO 9001:2015') : 'ISO 9001:2015',
            esquema: norma ? String(norma.esquema || 'SGC - Calidad') : 'SGC - Calidad',
            estatus: estatus ? String(estatus.estatus || 'ACTIVO') : 'ACTIVO',
            sector_iaf: sectorIaf?.sector ? Number(sectorIaf.sector) : undefined,
            multisitio: Boolean(row.multisitio),
            sitios_count: sitesCount,
            cobertura_porcentaje: coveragePct,
            cobertura_resumen: coverageSummary,
            fecha_emision: derivedVigencia.fecha_emision,
            fecha_vencimiento: derivedVigencia.fecha_vencimiento,
          };
        })
      );

      // Merge with sample records only for ADMIN/WORKER staff so CLIENT & AUDITOR stay strictly scoped to authorized live DB records
      if (isApprovedStaff()) {
        const existingCodes = new Set(loaded.map((item) => item.numero_certificado));
        const existingDetailIds = new Set(loadedDetailed.map((item) => item.id));
        const supplemental = SAMPLE_CERTIFICATE_RECORDS.filter(
          (s) => !existingCodes.has(s.numero_certificado)
        );
        const supplementalDetailed = INITIAL_CERTIFICADOS_DETAILED.filter(
          (s) => !existingDetailIds.has(s.id) && !existingCodes.has(s.numero_certificado)
        );
        state.exploration.records = [...loaded, ...supplemental];
        state.domainData.allCertificadosDetailed = [...loadedDetailed, ...supplementalDetailed];
      } else {
        state.exploration.records = loaded;
        state.domainData.allCertificadosDetailed = loadedDetailed;
      }
    } else {
      state.exploration.records = isApprovedStaff() ? [...SAMPLE_CERTIFICATE_RECORDS] : [];
      state.domainData.allCertificadosDetailed = isApprovedStaff()
        ? [...INITIAL_CERTIFICADOS_DETAILED]
        : [];
    }
  } catch {
    state.exploration.records = isApprovedStaff() ? [...SAMPLE_CERTIFICATE_RECORDS] : [];
    state.domainData.allCertificadosDetailed = isApprovedStaff()
      ? [...INITIAL_CERTIFICADOS_DETAILED]
      : [];
  } finally {
    state.exploration.loading = false;
    render();
  }
}

async function loadDomainData(): Promise<void> {
  if (state.domainData.loading) return;
  state.domainData.loading = true;

  try {
    const [
      auditsRes,
      auditorsRes,
      orgsRes,
      clientAccessesRes,
      sitesRes,
      processesRes,
      shiftsRes,
      standardsRes,
      requirementsPagedResInitial,
      translationsPagedRes,
      iafRes,
      iafSubsectorsRes,
      estatusRes,
      tipoAuditoriaRes,
      metodologiaRes,
      findingsRes,
      organismosRes,
      acreditacionesRes,
    ] = await Promise.all([
      supabase
        .from('auditoria')
        .select(`
          id,
          id_certificado,
          fecha_programacion,
          fecha_reprogramacion,
          tipo_auditoria:id_tipo_auditoria ( tipo ),
          metodologia:id_metodologia ( metodologia ),
          certificado:id_certificado (
            id,
            numero_certificado,
            organizacion:id_organizacion ( nombre )
          ),
          equipo:equipo_auditor (
            rol_auditor,
            auditor:id_auditor ( nombre )
          )
        `)
        .is('deleted_at', null),
      supabase
        .from('auditor')
        .select(`
          id,
          nombre,
          normas:norma_auditor (
            id_norma,
            norma:id_norma ( id, codigo, titulo, norma, esquema )
          ),
          sectores:sector_iaf_auditor (
            id_sector_iaf,
            sector:id_sector_iaf ( id, sector )
          ),
          subsectores:subsector_iaf_auditor (
            id_subsector_iaf,
            created_at,
            subsector:id_subsector_iaf ( id, id_sector_iaf, codigo, descripcion, categoria_riesgo )
          )
        `)
        .is('deleted_at', null),
      supabase
        .from('organizacion')
        .select('id, nombre, rif, direccion_fiscal')
        .is('deleted_at', null),
      isApprovedStaff()
        ? supabase
            .from('client_organization_access')
            .select(
              'id, id_usuario, id_organizacion, estado, aprobado_por, fecha_solicitud, fecha_respuesta, motivo_rechazo, organizacion:id_organizacion ( nombre, rif )'
            )
            .is('deleted_at', null)
            .order('fecha_solicitud', { ascending: false })
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from('sitio')
        .select(`
          id,
          numero_sitio,
          nombre_sitio,
          direccion_sitio,
          certificado:id_certificado ( numero_certificado )
        `)
        .is('deleted_at', null),
      supabase
        .from('proceso')
        .select(`
          id,
          nombre_proceso,
          certificado:id_certificado ( numero_certificado )
        `)
        .is('deleted_at', null),
      supabase
        .from('turno')
        .select('id, hora_entrada, hora_salida')
        .is('deleted_at', null),
      supabase
        .from('norma')
        .select('id, esquema, codigo, titulo, estatus, fecha_publicacion, norma')
        .is('deleted_at', null)
        .order('codigo', { ascending: true }),
      fetchAllPagedRows<RawRequisitoRow>(async (from, to) => {
        const res = await supabase
          .from('requisito')
          .select(`
            id,
            id_norma,
            id_requisito_padre,
            codigo,
            explicit_code,
            es_obligatorio,
            obligatorio_origen,
            ruta_materializada,
            norma:id_norma ( id, codigo, norma )
          `)
          .is('deleted_at', null)
          .order('id', { ascending: true })
          .range(from, to);
        return {
          data: (res.data as RawRequisitoRow[] | null) ?? null,
          error: res.error,
        };
      }, 1000),
      fetchAllPagedRows<RawRequisitoTraduccionRow>(async (from, to) => {
        const res = await supabase
          .from('requisito_traduccion')
          .select('id, id_requisito, lang, title, content_html, updated_at')
          .is('deleted_at', null)
          .order('id', { ascending: true })
          .range(from, to);
        return {
          data: (res.data as RawRequisitoTraduccionRow[] | null) ?? null,
          error: res.error,
        };
      }, 1000),
      supabase
        .from('sector_iaf')
        .select('id, sector, descripcion')
        .is('deleted_at', null),
      supabase
        .from('subsector_iaf')
        .select('id, id_sector_iaf, codigo, descripcion, categoria_riesgo')
        .is('deleted_at', null),
      supabase
        .from('estatus')
        .select('id, estatus')
        .is('deleted_at', null),
      supabase
        .from('tipo_auditoria')
        .select('id, tipo')
        .is('deleted_at', null),
      supabase
        .from('metodologia_auditoria')
        .select('id, metodologia')
        .is('deleted_at', null),
      supabase
        .from('hallazgo')
        .select(`
          id,
          id_auditoria,
          id_requisito,
          id_proceso,
          tipo,
          descripcion,
          evidencia,
          cerrado,
          created_at,
          auditoria:id_auditoria (
            tipo_auditoria:id_tipo_auditoria ( tipo ),
            certificado:id_certificado (
              numero_certificado,
              organizacion:id_organizacion ( nombre )
            )
          ),
          requisito:id_requisito ( codigo ),
          proceso:id_proceso ( nombre_proceso )
        `)
        .is('deleted_at', null),
      supabase
        .from('organismo_acreditacion')
        .select('id, codigo, nombre, pais, sitio_web')
        .is('deleted_at', null),
      supabase
        .from('acreditacion_norma')
        .select(`
          id,
          id_organismo,
          id_norma,
          id_estatus,
          numero_acreditacion,
          fecha_concesion,
          fecha_vencimiento,
          deleted_at,
          organismo:id_organismo ( id, codigo, nombre, pais, sitio_web, deleted_at ),
          norma:id_norma ( id, codigo, titulo, norma, esquema, deleted_at ),
          estatus_ref:id_estatus ( id, estatus, deleted_at ),
          sectores:acreditacion_norma_sector_iaf (
            id,
            id_acreditacion_norma,
            id_sector_iaf,
            deleted_at,
            sector_iaf:id_sector_iaf ( id, sector, descripcion, deleted_at )
          )
        `)
        .is('deleted_at', null),
    ]);

    // Process Audits
    if (!auditsRes.error && Array.isArray(auditsRes.data) && auditsRes.data.length > 0) {
      state.domainData.audits = auditsRes.data.map((row: Record<string, unknown>) => {
        const cert = (row.certificado as Record<string, unknown> | null) || {};
        const org = (cert.organizacion as Record<string, unknown> | null) || {};
        const tipoObj = (row.tipo_auditoria as Record<string, unknown> | null) || {};
        const metObj = (row.metodologia as Record<string, unknown> | null) || {};
        const equipoList = Array.isArray(row.equipo)
          ? (row.equipo as Array<Record<string, unknown>>)
          : [];
        const lead =
          equipoList.find((e) => e.rol_auditor === 'AUDITOR_LIDER') || equipoList[0];
        const auditorObj = lead
          ? (lead.auditor as Record<string, unknown> | null)
          : null;
        const auditorLiderName = auditorObj
          ? String(auditorObj.nombre || 'Auditor Calificado')
          : 'Por asignar';

        return {
          id: String(row.id),
          id_certificado: row.id_certificado
            ? String(row.id_certificado)
            : cert.id
            ? String(cert.id)
            : undefined,
          numero_certificado: String(cert.numero_certificado || 'FN-QMS-2024-001'),
          organizacion_nombre: String(org.nombre || 'Iberometal Componentes S.A.'),
          tipo_auditoria: String(tipoObj.tipo || 'RECERTIFICACION'),
          metodologia: String(metObj.metodologia || 'PRESENCIAL'),
          fecha_programacion: String(row.fecha_programacion || '2024-11-20'),
          fecha_reprogramacion: row.fecha_reprogramacion
            ? String(row.fecha_reprogramacion)
            : null,
          auditor_lider: auditorLiderName,
          estatus: 'PLANIFICADA',
        };
      });
    }

    // Process Auditors (hydrating M:N norma_auditor, sector_iaf_auditor, subsector_iaf_auditor)
    if (!auditorsRes.error && Array.isArray(auditorsRes.data) && auditorsRes.data.length > 0) {
      const hydratedAuditorsDetailed: AuditorDetailEntity[] = auditorsRes.data.map(
        (row: Record<string, unknown>) => {
          const audId = String(row.id);
          const audNombre = String(row.nombre || 'Auditor Evaluador');
          const seedMatch = INITIAL_AUDITORES_DETAILED.find((a) => a.id === audId);

          const normasRaw = Array.isArray(row.normas)
            ? (row.normas as Array<Record<string, unknown>>)
            : [];
          const normaLinks: AuditorNormaLink[] = [];
          const seenNormaIds = new Set<string>();
          for (const n of normasRaw) {
            const inner = (n.norma as Record<string, unknown> | null) || null;
            const idNorma = String(inner?.id || n.id_norma || '').trim();
            if (!idNorma || seenNormaIds.has(idNorma)) continue;
            seenNormaIds.add(idNorma);
            const normaCodigo = String(inner?.codigo || inner?.norma || 'Norma ISO');
            normaLinks.push({
              id_auditor: audId,
              id_norma: idNorma,
              norma_codigo: normaCodigo,
              norma_titulo: inner?.titulo ? String(inner.titulo) : undefined,
              esquema: inner?.esquema ? String(inner.esquema) : undefined,
            });
          }
          normaLinks.sort((a, b) => a.norma_codigo.localeCompare(b.norma_codigo, 'es'));

          const sectoresRaw = Array.isArray(row.sectores)
            ? (row.sectores as Array<Record<string, unknown>>)
            : [];
          const sectorLinks: AuditorSectorLink[] = [];
          const seenSectorIds = new Set<string>();
          for (const s of sectoresRaw) {
            const inner = (s.sector as Record<string, unknown> | null) || null;
            const idSector = String(inner?.id || s.id_sector_iaf || '').trim();
            const secNum = Number(inner?.sector);
            if (!idSector || !Number.isFinite(secNum) || seenSectorIds.has(idSector)) continue;
            seenSectorIds.add(idSector);
            sectorLinks.push({
              id_auditor: audId,
              id_sector_iaf: idSector,
              sector_numero: secNum,
              sector_descripcion: resolveSectorIafDescription(secNum),
            });
          }
          sectorLinks.sort((a, b) => a.sector_numero - b.sector_numero);

          const subsectoresRaw = Array.isArray(row.subsectores)
            ? (row.subsectores as Array<Record<string, unknown>>)
            : [];
          const subsectorLinks: AuditorSubsectorLink[] = [];
          const seenSubIds = new Set<string>();
          for (const subRow of subsectoresRaw) {
            const inner = (subRow.subsector as Record<string, unknown> | null) || null;
            const idSub = String(inner?.id || subRow.id_subsector_iaf || '').trim();
            if (!idSub || seenSubIds.has(idSub)) continue;
            seenSubIds.add(idSub);
            const subCodigo = String(inner?.codigo || '—');
            const idSec = String(inner?.id_sector_iaf || '').trim();
            const matchedSector = sectorLinks.find((sl) => sl.id_sector_iaf === idSec);
            const parsedSecNum =
              matchedSector?.sector_numero ?? (Number(subCodigo.split('.')[0]) || 17);
            subsectorLinks.push({
              id_auditor: audId,
              id_subsector_iaf: idSub,
              id_sector_iaf: idSec,
              sector_numero: parsedSecNum,
              subsector_codigo: subCodigo,
              subsector_descripcion: String(inner?.descripcion || 'Sub-Sector IAF'),
              categoria_riesgo: inner?.categoria_riesgo
                ? String(inner.categoria_riesgo)
                : undefined,
              created_at: subRow.created_at ? String(subRow.created_at) : undefined,
            });
          }
          subsectorLinks.sort((a, b) =>
            a.subsector_codigo.localeCompare(b.subsector_codigo, 'es', { numeric: true })
          );

          const normasList = normaLinks.map((l) => l.norma_codigo);
          const iafList = sectorLinks.map((l) => l.sector_numero);

          return {
            id: audId,
            nombre: audNombre,
            titulo_profesional:
              seedMatch?.titulo_profesional || 'Auditor Técnico Evaluador',
            codigo_credencial: seedMatch?.codigo_credencial || '',
            email: seedMatch?.email || '',
            telefono: seedMatch?.telefono || '',
            biografia: seedMatch?.biografia || '',
            instituto_registro: seedMatch?.instituto_registro || 'FONDONORMA',
            categoria_profesional:
              seedMatch?.categoria_profesional || 'Auditor Técnico Calificado',
            calificacion: seedMatch?.calificacion || 'Calificado',
            normas_acreditadas: normasList,
            sectores_iaf: iafList,
            competencias: seedMatch?.competencias || [],
            normaLinks,
            sectorLinks,
            subsectorLinks,
            historialAuditorias: seedMatch?.historialAuditorias || [],
          };
        }
      );

      const dbAuditorIds = new Set(hydratedAuditorsDetailed.map((a) => a.id));
      const mergedAuditors = isApprovedStaff()
        ? [
            ...hydratedAuditorsDetailed,
            ...INITIAL_AUDITORES_DETAILED.filter((s) => !dbAuditorIds.has(s.id)),
          ]
        : hydratedAuditorsDetailed;

      state.domainData.allAuditorsDetailed = mergedAuditors;
      state.domainData.auditors = mergedAuditors.map((aud) => ({
        id: aud.id,
        nombre: aud.nombre,
        normas: aud.normas_acreditadas,
        sectores_iaf: aud.sectores_iaf,
        rol: aud.categoria_profesional || 'Auditor Técnico Calificado',
      }));
    }

    // Process Organizations & sync live DB rows into allOrganizaciones
    if (!orgsRes.error && Array.isArray(orgsRes.data) && orgsRes.data.length > 0) {
      state.domainData.organizations = orgsRes.data.map((row: Record<string, unknown>) => ({
        id: String(row.id),
        nombre: String(row.nombre),
        rif: String(row.rif || 'RIF No Registrado'),
        direccion_fiscal: String(row.direccion_fiscal || ''),
        certificados_count: 1,
      }));

      const orgsFromDb: OrganizacionEntity[] = orgsRes.data.map((row: Record<string, unknown>) => {
        const orgId = String(row.id);
        const seedMatch = INITIAL_ORGANIZACIONES.find((o) => o.id === orgId);
        return {
          ...seedMatch,
          id: orgId,
          nombre: String(row.nombre || seedMatch?.nombre || 'Organización Cliente'),
          rif: row.rif ? String(row.rif) : seedMatch?.rif || 'RIF No Registrado',
          direccion_fiscal:
            row.direccion_fiscal !== null && row.direccion_fiscal !== undefined
              ? String(row.direccion_fiscal)
              : seedMatch?.direccion_fiscal || '',
        };
      });
      const dbOrgIds = new Set(orgsFromDb.map((o) => o.id));
      state.domainData.allOrganizaciones = isApprovedStaff()
        ? [...orgsFromDb, ...INITIAL_ORGANIZACIONES.filter((s) => !dbOrgIds.has(s.id))]
        : orgsFromDb;
    } else if (!isApprovedStaff()) {
      state.domainData.allOrganizaciones = [];
    }

    // Process Client Organization Accesses (strictly for approved ADMIN/WORKER staff)
    if (
      isApprovedStaff() &&
      !clientAccessesRes.error &&
      Array.isArray(clientAccessesRes.data)
    ) {
      state.domainData.allClientAccesses = clientAccessesRes.data.map(
        (row: Record<string, unknown>) => {
          const orgObj = (row.organizacion as Record<string, unknown> | null) || null;
          const userId = String(row.id_usuario || '');
          const approverId = row.aprobado_por ? String(row.aprobado_por) : null;
          const matchedUser = state.approvals.profiles.find((p) => p.id === userId);
          const matchedApprover = approverId
            ? state.approvals.profiles.find((p) => p.id === approverId)
            : undefined;
          const rawEstado = String(row.estado || 'PENDING');
          const estado: ClientAccessEstado =
            rawEstado === 'APPROVED' || rawEstado === 'REJECTED' ? rawEstado : 'PENDING';
          return {
            id: String(row.id),
            id_usuario: userId,
            usuario_nombre: matchedUser?.nombre,
            usuario_role: matchedUser?.role || 'CLIENT',
            id_organizacion: String(row.id_organizacion || ''),
            organizacion_nombre: orgObj?.nombre ? String(orgObj.nombre) : undefined,
            organizacion_rif: orgObj?.rif ? String(orgObj.rif) : undefined,
            estado,
            aprobado_por: approverId,
            aprobado_por_nombre: matchedApprover?.nombre || null,
            fecha_solicitud: row.fecha_solicitud ? String(row.fecha_solicitud) : '',
            fecha_respuesta: row.fecha_respuesta ? String(row.fecha_respuesta) : null,
            motivo_rechazo: row.motivo_rechazo ? String(row.motivo_rechazo) : null,
            deleted_at: null,
          };
        }
      );
    } else if (!isApprovedStaff()) {
      state.domainData.allClientAccesses = [];
    }

    // Process Sites
    if (!sitesRes.error && Array.isArray(sitesRes.data) && sitesRes.data.length > 0) {
      state.domainData.sites = sitesRes.data.map((row: Record<string, unknown>) => {
        const certObj = (row.certificado as Record<string, unknown> | null) || {};
        return {
          id: String(row.id),
          numero_sitio: Number(row.numero_sitio) || 1,
          nombre_sitio: String(row.nombre_sitio),
          direccion_sitio: String(row.direccion_sitio),
          numero_certificado: String(certObj.numero_certificado || 'FN-QMS-2024-001'),
          turnos_count: 2,
        };
      });
    }

    // Process Processes
    if (!processesRes.error && Array.isArray(processesRes.data) && processesRes.data.length > 0) {
      state.domainData.processes = processesRes.data.map((row: Record<string, unknown>) => {
        const certObj = (row.certificado as Record<string, unknown> | null) || {};
        return {
          id: String(row.id),
          nombre_proceso: String(row.nombre_proceso),
          numero_certificado: String(certObj.numero_certificado || 'FN-QMS-2024-001'),
          clausulas_cubiertas: ['4.1', '8.5'],
        };
      });
    }

    // Process Shifts
    if (!shiftsRes.error && Array.isArray(shiftsRes.data) && shiftsRes.data.length > 0) {
      state.domainData.shifts = shiftsRes.data.map((row: Record<string, unknown>, idx: number) => ({
        id: String(row.id),
        hora_entrada: String(row.hora_entrada),
        hora_salida: String(row.hora_salida),
        descripcion: idx === 0 ? 'Turno Matutino Operativo' : 'Turno Vespertino / Nocturno',
        sitios_vinculados: ['Planta Valencia'],
      }));
      const liveShiftCatalog: TurnoCatalogItem[] = shiftsRes.data.map(
        (row: Record<string, unknown>, idx: number) => {
          const seedMatch = INITIAL_TURNO_CATALOG.find((t) => t.id === String(row.id));
          return {
            id: String(row.id),
            hora_entrada: String(row.hora_entrada),
            hora_salida: String(row.hora_salida),
            descripcion:
              seedMatch?.descripcion ||
              (idx === 0 ? 'Turno Matutino Operativo' : `Turno Operativo ${idx + 1}`),
          };
        }
      );
      const liveIds = new Set(liveShiftCatalog.map((t) => t.id));
      state.domainData.shiftCatalog = [
        ...liveShiftCatalog,
        ...INITIAL_TURNO_CATALOG.filter((t) => !liveIds.has(t.id)),
      ];
    }

    // Process Standards, Requirements & Bilingual Translations (paginated >1,000 rows + graceful offline/unmigrated fallback)
    let requirementsPagedRes = requirementsPagedResInitial;
    if (requirementsPagedRes.error && isMissingTableOrSchemaError(requirementsPagedRes.error)) {
      requirementsPagedRes = await fetchAllPagedRows<RawRequisitoRow>(async (from, to) => {
        const res = await supabase
          .from('requisito')
          .select(`
            id,
            id_norma,
            id_requisito_padre,
            codigo,
            ruta_materializada,
            norma:id_norma ( id, codigo, norma )
          `)
          .is('deleted_at', null)
          .order('id', { ascending: true })
          .range(from, to);
        return {
          data: (res.data as RawRequisitoRow[] | null) ?? null,
          error: res.error,
        };
      }, 1000);
    }

    const translationsTableMissing = Boolean(
      translationsPagedRes.error && isMissingTableOrSchemaError(translationsPagedRes.error)
    );
    const rawNormas =
      !standardsRes.error && Array.isArray(standardsRes.data)
        ? (standardsRes.data as RawNormaRow[])
        : null;
    const rawRequisitos =
      !requirementsPagedRes.error && requirementsPagedRes.data.length > 0
        ? requirementsPagedRes.data
        : null;
    const rawTranslations =
      !translationsPagedRes.error && !translationsTableMissing
        ? translationsPagedRes.data
        : null;

    const hydratedNormaBundle = assembleHydratedNormasAndRequisitos({
      rawNormas,
      rawRequisitos,
      rawTranslations,
      translationsTableMissing,
      existingStandardsFallback: buildNormaEntitiesForDependencyCheck(),
    });

    state.domainData.standards = hydratedNormaBundle.standards.map((std) => ({
      id: std.id,
      esquema: std.esquema,
      codigo: std.codigo,
      titulo: std.titulo,
      estatus: std.estatus,
      fecha_publicacion: std.fecha_publicacion,
      norma: std.norma,
      clausulas_count: std.clausulas_count,
      acreditaciones_count: std.acreditaciones_count,
    }));
    state.domainData.requirementsCatalog = hydratedNormaBundle.requirementsCatalog;
    state.domainData.requirements = hydratedNormaBundle.requirements;

    // Process IAF Sectors (with legacy fallback if descripcion column is pending migration)
    let iafRows =
      !iafRes.error && Array.isArray(iafRes.data) ? (iafRes.data as Array<Record<string, unknown>>) : null;
    if (iafRes.error && isMissingTableOrSchemaError(iafRes.error)) {
      const legacyIafRes = await supabase
        .from('sector_iaf')
        .select('id, sector')
        .is('deleted_at', null);
      if (!legacyIafRes.error && Array.isArray(legacyIafRes.data)) {
        iafRows = legacyIafRes.data as Array<Record<string, unknown>>;
      }
    }
    if (iafRows && iafRows.length > 0) {
      state.domainData.iafSectors = iafRows.map((row: Record<string, unknown>) => {
        const secNum = Number(row.sector);
        const customDesc = row.descripcion ? String(row.descripcion) : null;
        return {
          id: String(row.id),
          sector: secNum,
          descripcion: resolveSectorIafDescription(secNum, customDesc),
        };
      });
    }

    // Process IAF Subsectors
    if (
      !iafSubsectorsRes.error &&
      Array.isArray(iafSubsectorsRes.data) &&
      iafSubsectorsRes.data.length > 0
    ) {
      const sectorPool =
        state.domainData.iafSectors.length > 0
          ? state.domainData.iafSectors
          : INITIAL_SECTORES_IAF;
      const hydratedSubsectors: SubsectorIafEntity[] = iafSubsectorsRes.data.map(
        (row: Record<string, unknown>) => {
          const subId = String(row.id || '');
          const sectorId = String(row.id_sector_iaf || '');
          const codigo = String(row.codigo || '');
          const seedMatch =
            INITIAL_SUBSECTORES_IAF.find((s) => s.id === subId) ||
            INITIAL_SUBSECTORES_IAF.find((s) => s.codigo === codigo);
          const matchedSector =
            sectorPool.find((sec) => sec.id === sectorId) ||
            INITIAL_SECTORES_IAF.find((sec) => sec.id === sectorId);
          const parsedSectorNum =
            matchedSector?.sector ??
            seedMatch?.sector_numero ??
            (Number(codigo.split('.')[0]) || 17);
          const rawRisk = String(row.categoria_riesgo || seedMatch?.categoria_riesgo || 'MEDIO');
          const categoriaRiesgo: 'ALTO' | 'MEDIO' | 'BAJO' =
            rawRisk === 'ALTO' || rawRisk === 'BAJO' ? rawRisk : 'MEDIO';
          return {
            id: subId,
            id_sector_iaf: sectorId || seedMatch?.id_sector_iaf || '',
            sector_numero: parsedSectorNum,
            codigo: codigo || seedMatch?.codigo || `${parsedSectorNum}.1`,
            descripcion: String(row.descripcion || seedMatch?.descripcion || 'Sub-Sector IAF'),
            categoria_riesgo: categoriaRiesgo,
            auditores_nombres: seedMatch?.auditores_nombres || [],
          };
        }
      );
      const seenSubIds = new Set(hydratedSubsectors.map((s) => s.id));
      const seenSubCodes = new Set(hydratedSubsectors.map((s) => s.codigo));
      state.domainData.iafSubsectors = [
        ...hydratedSubsectors,
        ...INITIAL_SUBSECTORES_IAF.filter(
          (s) => !seenSubIds.has(s.id) && !seenSubCodes.has(s.codigo)
        ),
      ];
      state.domainData.iafSectors = state.domainData.iafSectors.map((sec) => ({
        ...sec,
        subsectores_count: state.domainData.iafSubsectors.filter(
          (sub) => sub.id_sector_iaf === sec.id || sub.sector_numero === sec.sector
        ).length,
      }));
    }

    // Process Catalogs
    const mergedCatalogs: CatalogItem[] = [];
    if (!estatusRes.error && Array.isArray(estatusRes.data)) {
      const hydratedEstatus: EstatusCatalogItem[] = [];
      estatusRes.data.forEach((r: Record<string, unknown>) => {
        if (r.estatus) {
          const val = String(r.estatus);
          mergedCatalogs.push({ categoria: 'estatus', valor: val });
          const seedMatch = INITIAL_ESTATUS_CATALOG.find(
            (e) => e.estatus.toLowerCase() === val.toLowerCase()
          );
          if (r.id) {
            hydratedEstatus.push({
              id: String(r.id),
              estatus: seedMatch?.estatus || val,
              descripcion: seedMatch?.descripcion || `Estado operativo ${val}.`,
              categoria_aplicable: seedMatch?.categoria_aplicable || 'Certificados, Auditorías',
              color_token: seedMatch?.color_token || 'slate',
              usage_count: seedMatch?.usage_count ?? 0,
            });
          }
        }
      });
      if (hydratedEstatus.length > 0) {
        const seenNames = new Set(hydratedEstatus.map((e) => e.estatus.toLowerCase()));
        state.domainData.estatusCatalog = [
          ...hydratedEstatus,
          ...INITIAL_ESTATUS_CATALOG.filter((e) => !seenNames.has(e.estatus.toLowerCase())),
        ];
      }
    }
    if (!tipoAuditoriaRes.error && Array.isArray(tipoAuditoriaRes.data)) {
      const hydratedTipos: TipoAuditoriaCatalogItem[] = [];
      tipoAuditoriaRes.data.forEach((r: Record<string, unknown>) => {
        if (r.tipo) {
          const val = String(r.tipo);
          mergedCatalogs.push({ categoria: 'tipo_auditoria', valor: val });
          if (r.id) {
            hydratedTipos.push(
              buildTipoAuditoriaCatalogItem({
                id: String(r.id),
                tipo: val,
              })
            );
          }
        }
      });
      if (hydratedTipos.length > 0) {
        const seenTipos = new Set(hydratedTipos.map((t) => t.tipo.toLowerCase()));
        state.domainData.tiposCatalog = [
          ...hydratedTipos,
          ...INITIAL_TIPOS_AUDITORIA_CATALOG.filter((t) => !seenTipos.has(t.tipo.toLowerCase())),
        ];
      }
    }
    if (!metodologiaRes.error && Array.isArray(metodologiaRes.data)) {
      const hydratedMetodologias: MetodologiaAuditoriaCatalogItem[] = [];
      metodologiaRes.data.forEach((r: Record<string, unknown>) => {
        if (r.metodologia) {
          const val = String(r.metodologia);
          mergedCatalogs.push({ categoria: 'metodologia', valor: val });
          if (r.id) {
            hydratedMetodologias.push(
              buildMetodologiaAuditoriaCatalogItem({
                id: String(r.id),
                metodologia: val,
              })
            );
          }
        }
      });
      if (hydratedMetodologias.length > 0) {
        const seenMets = new Set(
          hydratedMetodologias.map((m) => m.metodologia.toLowerCase())
        );
        state.domainData.metodologiasCatalog = [
          ...hydratedMetodologias,
          ...INITIAL_METODOLOGIAS_CATALOG.filter(
            (m) => !seenMets.has(m.metodologia.toLowerCase())
          ),
        ];
      }
    }
    if (mergedCatalogs.length > 0) {
      state.domainData.catalogs = mergedCatalogs;
    }

    // Process Findings
    if (!findingsRes.error && Array.isArray(findingsRes.data) && findingsRes.data.length > 0) {
      const loadedFindings: FindingRecord[] = findingsRes.data.map((row: Record<string, unknown>) => {
        const aud = (row.auditoria as Record<string, unknown> | null) || {};
        const cert = (aud.certificado as Record<string, unknown> | null) || {};
        const org = (cert.organizacion as Record<string, unknown> | null) || {};
        const tipoAud = (aud.tipo_auditoria as Record<string, unknown> | null) || {};
        const req = (row.requisito as Record<string, unknown> | null) || {};
        const proc = (row.proceso as Record<string, unknown> | null) || {};

        return {
          id: String(row.id),
          id_auditoria: String(row.id_auditoria),
          auditoria_tipo: String(tipoAud.tipo || 'RECERTIFICACION'),
          numero_certificado: String(cert.numero_certificado || 'FN-QMS-2024-001'),
          organizacion_nombre: String(org.nombre || 'Iberometal Componentes S.A.'),
          id_requisito: String(row.id_requisito),
          requisito_codigo: String(req.codigo || '8.5'),
          id_proceso: String(row.id_proceso),
          proceso_nombre: String(proc.nombre_proceso || 'Troquelado y Fundición'),
          tipo: (row.tipo as FindingType) || 'NC_MENOR',
          descripcion: String(row.descripcion),
          evidencia: row.evidencia ? String(row.evidencia) : null,
          cerrado: Boolean(row.cerrado),
          created_at: row.created_at ? String(row.created_at) : undefined,
        };
      });

      if (isApprovedStaff()) {
        const existingIds = new Set(loadedFindings.map((f) => f.id));
        const supplemental = INITIAL_FINDINGS.filter((f) => !existingIds.has(f.id));
        state.domainData.findings = [...loadedFindings, ...supplemental];
      } else {
        state.domainData.findings = loadedFindings;
      }
    } else {
      state.domainData.findings = isApprovedStaff() ? [...INITIAL_FINDINGS] : [];
    }
    // Process Organisms & Accreditations (Phase 4.1.3)
    if (!organismosRes.error && Array.isArray(organismosRes.data) && organismosRes.data.length > 0) {
      state.domainData.allOrganismos = organismosRes.data.map((row: Record<string, unknown>) => ({
        id: String(row.id),
        codigo: String(row.codigo || ''),
        nombre: String(row.nombre || ''),
        pais: String(row.pais || ''),
        sitio_web: row.sitio_web ? String(row.sitio_web) : undefined,
      }));
    }

    if (
      !acreditacionesRes.error &&
      Array.isArray(acreditacionesRes.data) &&
      acreditacionesRes.data.length > 0
    ) {
      const lookupNormas: NormaEntity[] = state.domainData.standards.map((s, idx) => {
        const fallback = INITIAL_NORMAS[idx % INITIAL_NORMAS.length];
        return {
          id: s.id || fallback.id,
          codigo: s.codigo || s.norma || fallback.codigo,
          titulo: s.titulo || fallback.titulo,
          estatus: (s.estatus as NormaEntity['estatus']) || fallback.estatus || 'Vigente',
          esquema: s.esquema || fallback.esquema,
          fecha_publicacion: s.fecha_publicacion || fallback.fecha_publicacion,
          norma: s.norma || fallback.norma,
          clausulas_count: s.clausulas_count || fallback.clausulas_count || 7,
          acreditaciones_count: s.acreditaciones_count || fallback.acreditaciones_count || 1,
        };
      });

      const lookupSectores: SectorIafEntity[] = state.domainData.iafSectors.map((sec, idx) => {
        const fallback = INITIAL_SECTORES_IAF[idx % INITIAL_SECTORES_IAF.length];
        return {
          id: sec.id || fallback.id,
          sector: sec.sector || fallback.sector,
          descripcion: sec.descripcion || fallback.descripcion,
          subsectores_count: sec.subsectores_count ?? fallback.subsectores_count,
          auditores_count: sec.auditores_count ?? fallback.auditores_count,
        };
      });

      const mappedAccreditations = mapSupabaseAcreditacionRows(
        acreditacionesRes.data as SupabaseAcreditacionJoinRow[],
        {
          organismos: state.domainData.allOrganismos,
          normas: lookupNormas.length > 0 ? lookupNormas : INITIAL_NORMAS,
          sectores: lookupSectores.length > 0 ? lookupSectores : INITIAL_SECTORES_IAF,
          estatusList: getResolvedEstatusCatalog(),
        }
      );

      if (mappedAccreditations.length > 0) {
        state.domainData.allAcreditaciones = mappedAccreditations;
      }
    }
  } catch (err) {
    console.warn('Fallback to seeded domain records:', err);
  } finally {
    state.domainData.loading = false;
    render();
  }
}

async function loadApprovalProfiles(): Promise<void> {
  if (!isApprovedStaff()) return;

  state.approvals.loading = true;
  state.approvals.errorMessage = null;
  render();

  const { data, error } = await supabase
    .from('profiles')
    .select('id, nombre, role, status, created_at')
    .order('created_at', { ascending: false });

  state.approvals.loading = false;
  if (error) {
    state.approvals.errorMessage = translateDatabaseError(error);
  } else {
    state.approvals.profiles = (data as UserProfile[]) || [];
  }
  render();
}

async function updateProfileStatus(targetId: string, status: UserStatus): Promise<void> {
  if (!isApprovedAdmin()) return;

  state.approvals.updatingId = targetId;
  state.approvals.errorMessage = null;
  state.approvals.successMessage = null;
  render();

  const { error } = await supabase
    .from('profiles')
    .update({ status })
    .eq('id', targetId);

  state.approvals.updatingId = null;

  if (error) {
    state.approvals.errorMessage = translateDatabaseError(error);
    render();
    return;
  }

  const target = state.approvals.profiles.find((p) => p.id === targetId);
  state.approvals.successMessage = target
    ? `Updated status for ${target.nombre} to ${status}.`
    : `Updated user status to ${status}.`;
  await loadApprovalProfiles();
}

async function updateProfileRole(targetId: string, nextRole: string): Promise<void> {
  if (!isApprovedAdmin() || !state.user) return;

  const target = state.approvals.profiles.find((p) => p.id === targetId);
  if (!target) return;

  if (!canModifyProfileRole(target.id, state.user.id, target.status)) {
    return;
  }

  if (!shouldUpdateProfileRole(target.role, nextRole)) {
    return;
  }

  state.approvals.updatingId = targetId;
  state.approvals.errorMessage = null;
  state.approvals.successMessage = null;
  render();

  const { error } = await supabase
    .from('profiles')
    .update({ role: nextRole })
    .eq('id', targetId);

  state.approvals.updatingId = null;

  if (error) {
    state.approvals.errorMessage = translateDatabaseError(error);
    render();
    return;
  }

  state.approvals.successMessage = `Changed role for ${target.nombre} to ${nextRole}.`;
  await loadApprovalProfiles();
}

async function handleUpdateOwnProfile(rawNombre: string): Promise<void> {
  if (!state.user || !state.profile || state.profileForm.savingProfile) return;

  const validation = buildSelfProfileUpdatePayload(rawNombre);
  if (!validation.ok) {
    state.profileForm = {
      ...state.profileForm,
      nombreInput: rawNombre,
      profileError: validation.error,
      profileFeedback: null,
    };
    render();
    return;
  }

  state.profileForm = {
    ...state.profileForm,
    nombreInput: validation.payload.nombre,
    savingProfile: true,
    profileError: null,
    profileFeedback: null,
  };
  render();

  const { data, error } = await supabase
    .from('profiles')
    .update(validation.payload)
    .eq('id', state.user.id)
    .select('id, nombre, role, status, created_at')
    .single();

  if (error || !data) {
    state.profileForm = {
      ...state.profileForm,
      savingProfile: false,
      profileError: translateDatabaseError(error || 'No se pudo actualizar el perfil.'),
      profileFeedback: null,
    };
    render();
    return;
  }

  const updatedProfile = data as UserProfile;
  state.profile = updatedProfile;
  state.profileForm = {
    ...state.profileForm,
    nombreInput: updatedProfile.nombre,
    savingProfile: false,
    profileError: null,
    profileFeedback: 'Nombre actualizado correctamente.',
  };
  render();
}

async function handleUpdateOwnPassword(
  newPassword: string,
  confirmPassword: string
): Promise<void> {
  if (!state.user || !state.profile || state.profileForm.savingPassword) return;

  const validation = validatePasswordChangeInput(newPassword, confirmPassword);
  if (!validation.ok) {
    state.profileForm = {
      ...state.profileForm,
      newPasswordInput: newPassword,
      confirmPasswordInput: confirmPassword,
      passwordError: validation.error,
      passwordFeedback: null,
    };
    render();
    return;
  }

  state.profileForm = {
    ...state.profileForm,
    savingPassword: true,
    passwordError: null,
    passwordFeedback: null,
  };
  render();

  const { data, error } = await supabase.auth.updateUser({
    password: validation.password,
  });

  if (error) {
    state.profileForm = {
      ...state.profileForm,
      savingPassword: false,
      passwordError: translateDatabaseError(error),
      passwordFeedback: null,
    };
    render();
    return;
  }

  if (data.user) {
    state.user = data.user;
  }

  state.profileForm = {
    ...state.profileForm,
    savingPassword: false,
    newPasswordInput: '',
    confirmPasswordInput: '',
    passwordError: null,
    passwordFeedback: 'Contraseña actualizada correctamente.',
  };
  render();
}

function updateHealthCheck(id: string, patch: Partial<HealthCheckItem>): void {
  state.dbCheck.checks = state.dbCheck.checks.map((item) =>
    item.id === id ? { ...item, ...patch } : item
  );
  render();
}

async function runHealthChecks(): Promise<void> {
  if (!isApprovedAdmin() || !state.profile || state.dbCheck.running) return;

  const adminProfile = state.profile;
  state.dbCheck = {
    checks: createInitialChecks(),
    running: true,
    lastCheckedAt: state.dbCheck.lastCheckedAt,
  };
  render();

  // 1. Connection & Login Service
  const t1 = performance.now();
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    const ms1 = Math.round(performance.now() - t1);
    if (response.ok) {
      updateHealthCheck('connection', {
        state: 'pass',
        detail: 'Server online and accepting connections',
        durationMs: ms1,
      });
    } else {
      updateHealthCheck('connection', {
        state: 'fail',
        detail: `Server responded with status ${response.status}`,
        durationMs: ms1,
      });
    }
  } catch (err) {
    updateHealthCheck('connection', {
      state: 'fail',
      detail: translateDatabaseError(err),
      durationMs: Math.round(performance.now() - t1),
    });
  }

  // 2. Administrator Permissions
  const t2 = performance.now();
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, nombre, role, status')
      .eq('id', adminProfile.id)
      .single();
    const ms2 = Math.round(performance.now() - t2);
    const access = evaluateAdminAccess(data as UserProfile | null);
    if (error || !access.allowed) {
      updateHealthCheck('admin', {
        state: 'fail',
        detail: error ? translateDatabaseError(error) : access.reason,
        durationMs: ms2,
      });
    } else {
      updateHealthCheck('admin', {
        state: 'pass',
        detail: `Verified ${data.nombre} (${data.role} · ${data.status})`,
        durationMs: ms2,
      });
    }
  } catch (err) {
    updateHealthCheck('admin', {
      state: 'fail',
      detail: translateDatabaseError(err),
      durationMs: Math.round(performance.now() - t2),
    });
  }

  // 3. Core Business Records
  let sampleCert: { id: string; numero_certificado: string } | null = null;
  const t3 = performance.now();
  try {
    const [orgsRes, certsRes, auditsRes, findingsRes, sampleCertRes] = await Promise.all([
      supabase.from('organizacion').select('id', { count: 'exact', head: true }).is('deleted_at', null),
      supabase.from('certificado').select('id', { count: 'exact', head: true }).is('deleted_at', null),
      supabase.from('auditoria').select('id', { count: 'exact', head: true }).is('deleted_at', null),
      supabase.from('hallazgo').select('id', { count: 'exact', head: true }).is('deleted_at', null),
      supabase.from('certificado').select('id, numero_certificado').is('deleted_at', null).limit(1).maybeSingle(),
    ]);
    const ms3 = Math.round(performance.now() - t3);

    const firstErr =
      orgsRes.error || certsRes.error || auditsRes.error || findingsRes.error || sampleCertRes.error;

    if (firstErr) {
      updateHealthCheck('records', {
        state: 'fail',
        detail: translateDatabaseError(firstErr),
        durationMs: ms3,
      });
    } else {
      sampleCert = sampleCertRes.data as { id: string; numero_certificado: string } | null;
      updateHealthCheck('records', {
        state: 'pass',
        detail: `${orgsRes.count ?? 0} organizations · ${certsRes.count ?? 0} certificates · ${auditsRes.count ?? 0} audits · ${findingsRes.count ?? 0} findings`,
        durationMs: ms3,
      });
    }
  } catch (err) {
    updateHealthCheck('records', {
      state: 'fail',
      detail: translateDatabaseError(err),
      durationMs: Math.round(performance.now() - t3),
    });
  }

  // 4. Standards & Coverage Engine
  const t4 = performance.now();
  try {
    const certId = sampleCert?.id || '00000000-0000-0000-0000-000000000000';
    const { data, error } = await supabase.rpc('cobertura_normativa_certificado', {
      p_id_certificado: certId,
    });
    const ms4 = Math.round(performance.now() - t4);

    if (error) {
      updateHealthCheck('coverage', {
        state: 'fail',
        detail: translateDatabaseError(error),
        durationMs: ms4,
      });
    } else {
      const count = Array.isArray(data) ? data.length : 0;
      updateHealthCheck('coverage', {
        state: 'pass',
        detail: sampleCert
          ? `Evaluated ${count} standard requirements for ${sampleCert.numero_certificado}`
          : 'Coverage calculation engine responded cleanly',
        durationMs: ms4,
      });
    }
  } catch (err) {
    updateHealthCheck('coverage', {
      state: 'fail',
      detail: translateDatabaseError(err),
      durationMs: Math.round(performance.now() - t4),
    });
  }

  // 5. Change History & Client Access
  const t5 = performance.now();
  try {
    const [logsRes, accessRes] = await Promise.all([
      supabase.from('audit_log').select('id', { count: 'exact', head: true }),
      supabase.from('client_organization_access').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    ]);
    const ms5 = Math.round(performance.now() - t5);

    const err = logsRes.error || accessRes.error;
    if (err) {
      updateHealthCheck('governance', {
        state: 'fail',
        detail: translateDatabaseError(err),
        durationMs: ms5,
      });
    } else {
      updateHealthCheck('governance', {
        state: 'pass',
        detail: `${logsRes.count ?? 0} logged changes · ${accessRes.count ?? 0} client access records`,
        durationMs: ms5,
      });
    }
  } catch (err) {
    updateHealthCheck('governance', {
      state: 'fail',
      detail: translateDatabaseError(err),
      durationMs: Math.round(performance.now() - t5),
    });
  }

  state.dbCheck.running = false;
  state.dbCheck.lastCheckedAt = new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  render();
}

// Close click-toggled dropdown when clicking outside header dropdown containers
document.addEventListener('click', (e) => {
  if (!state.openMenu) return;
  const target = e.target as HTMLElement | null;
  if (!target?.closest('[data-header-dropdown]')) {
    state.openMenu = null;
    render();
  }
});

// Global keyboard shortcuts: / to focus search, Escape to close modals/drawers/clear search
document.addEventListener('keydown', (e) => {
  // '/' shortcut to focus search input
  if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName || '')) {
    const searchInput = (document.querySelector('[data-universal-search="true"]') ||
      document.getElementById('programacionSearchInput') ||
      document.getElementById('resultadoSearchInput') ||
      document.getElementById('auditorDirectorySearchInput') ||
      document.getElementById('certDirectorySearchInput') ||
      document.getElementById('certificateSearchInput')) as HTMLInputElement | null;
    if (searchInput) {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
      return;
    }
  }

  if (e.key !== 'Escape') return;

  if (state.archiveGovernance.modal.isOpen) {
    closeArchiveModal();
    return;
  }

  if (state.auditLogModal.isOpen) {
    closeAuditLogModal();
    return;
  }

  if (state.resultadoDomain.inspectingFindingId) {
    state.resultadoDomain.inspectingFindingId = null;
    render();
    return;
  }

  if (state.calendarioDomain.drawerAuditId) {
    state.calendarioDomain.drawerAuditId = null;
    render();
    return;
  }

  if (
    document.activeElement?.id === 'certificateSearchInput' ||
    (document.activeElement instanceof HTMLElement &&
      document.activeElement.dataset.universalSearch === 'true')
  ) {
    (document.activeElement as HTMLElement).blur();
    return;
  }

  if (state.openMenu) {
    state.openMenu = null;
    if (document.activeElement instanceof HTMLElement && document.activeElement.closest('header')) {
      document.activeElement.blur();
    }
    render();
    return;
  }

  if (document.activeElement instanceof HTMLElement && document.activeElement.closest('[data-header-dropdown]')) {
    document.activeElement.blur();
    return;
  }

  if (state.auth.resetModalOpen && !state.auth.resettingDb) {
    state.auth = {
      ...state.auth,
      resetModalOpen: false,
      resetErrorMessage: null,
    };
    render();
  }
});

// History and Hash Navigation: Instant client-side route switching without page reloads
window.addEventListener('hashchange', () => {
  const { route, subview } = parseHashRoute();
  if (canAccessRoute(state.profile, route)) {
    if (state.activeRoute !== route || state.activeSubSection !== subview) {
      state.activeRoute = route;
      state.activeSubSection = subview;
      state.openMenu = null;
      state.breadcrumbs = resetBreadcrumbToDomain(route, subview);
      if (route === 'profile') {
        state.profileForm = {
          ...state.profileForm,
          nombreInput: state.profile?.nombre || '',
          profileFeedback: null,
          profileError: null,
          passwordFeedback: null,
          passwordError: null,
        };
      }
      render();
      if (route === 'approvals' && isApprovedStaff()) {
        void loadApprovalProfiles();
      } else if (route === 'database' && isApprovedAdmin() && state.dbCheck.lastCheckedAt === null) {
        void runHealthChecks();
      }
    }
  }
});

window.addEventListener('popstate', () => {
  const { route, subview } = parseHashRoute();
  if (canAccessRoute(state.profile, route)) {
    if (state.activeRoute !== route || state.activeSubSection !== subview) {
      state.activeRoute = route;
      state.activeSubSection = subview;
      state.openMenu = null;
      state.breadcrumbs = resetBreadcrumbToDomain(route, subview);
      if (route === 'profile') {
        state.profileForm = {
          ...state.profileForm,
          nombreInput: state.profile?.nombre || '',
          profileFeedback: null,
          profileError: null,
          passwordFeedback: null,
          passwordError: null,
        };
      }
      render();
    }
  }
});

// Supabase Auth State Change Listener
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    resetClientSessionState();
  } else if (
    (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') &&
    !isSigningOut
  ) {
    if (session?.user && state.user?.id !== session.user.id) {
      void loadUserSession(session.user);
    }
  }
});

async function init(): Promise<void> {
  const initialNav = parseHashRoute();
  state.activeRoute = initialNav.route;
  state.activeSubSection = initialNav.subview;
  render();
  try {
    const { data } = await supabase.auth.getSession();
    if (!state.user && !isSigningOut) {
      await loadUserSession(data.session?.user ?? null);
    }
  } catch (err) {
    console.warn('Failed restoring initial session:', err);
    state.booting = false;
    state.user = null;
    state.profile = null;
    render();
  }
}

void init();
