import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import { APP_SHELL_CONTAINER_CLASS } from '../lib/layout';
import {
  INITIAL_NORMAS,
  INITIAL_ACREDITACIONES,
  INITIAL_ORGANISMOS,
  INITIAL_REQUISITOS_LTREE,
  INITIAL_SECTORES_IAF,
  INITIAL_SUBSECTORES_IAF,
  INITIAL_ESTATUS_CATALOG,
  INITIAL_TIPOS_AUDITORIA_CATALOG,
  INITIAL_METODOLOGIAS_CATALOG,
  calculateLtreeIndentation,
  type NormaEntity,
  type OrganismoAcreditacion,
  type RequisitoLtree,
  type SectorIafEntity,
  type SubsectorIafEntity,
  type EstatusCatalogItem,
  type TipoAuditoriaCatalogItem,
  type MetodologiaAuditoriaCatalogItem,
} from '../lib/extraDomain';
import type { ArchiveMultiViewConfig } from '../lib/archiveGovernance';
import {
  buildInitialAcreditacionEntities,
  toLegacyAcreditacionNormaIaf,
  type AcreditacionDetailEntity,
  type OrganismoViewState,
} from '../lib/acreditacionDomain';
import { getAllSeededNormaRequirements } from '../lib/procesoDomain';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import type { AuditorDetailEntity } from '../lib/competencyMatrix';
import type { ProgramacionAuditEntity } from '../lib/auditExecution';
import {
  renderNormaView,
  type NormaViewState,
} from './normaView';
import {
  renderRequisitoView,
  type RequisitoViewState,
} from './requisitoView';
import {
  renderSectorIafView,
  type SectorIafViewState,
} from './sectorIafView';
import {
  renderSubsectorIafView,
  type SubsectorIafViewState,
} from './subsectorIafView';
import {
  renderOrganismoAcreditacionView,
} from './organismoAcreditacionView';
import {
  renderAcreditacionView,
  type AcreditacionViewState,
} from './acreditacionView';
import {
  renderEstatusView,
  type EstatusViewState,
} from './estatusView';
import {
  renderTipoAuditoriaView,
  type TipoAuditoriaViewState,
} from './tipoAuditoriaView';
import {
  renderMetodologiaAuditoriaView,
  type MetodologiaAuditoriaViewState,
} from './metodologiaAuditoriaView';

// Backward-compatible type aliases for existing codebase imports
export interface StandardRecord {
  id: string;
  esquema: string;
  norma: string;
  codigo?: string;
  titulo?: string;
  estatus?: 'Vigente' | 'En Revisión' | 'Obsoleta' | string;
  fecha_publicacion?: string;
  clausulas_count?: number;
  acreditaciones_count?: number;
}

export interface RequirementRecord {
  id: string;
  codigo: string;
  ruta_materializada: string;
  norma: string;
  titulo?: string;
  descripcion?: string;
  id_norma?: string;
  id_requisito_padre?: string | null;
}

export interface IafRecord {
  id: string;
  sector: number;
  descripcion: string;
  subsectores_count?: number;
  auditores_count?: number;
}

export interface CatalogItem {
  categoria: string;
  valor: string;
  descripcion?: string;
}

export interface ExtraViewState {
  activeSubSection: string;
  standards: StandardRecord[];
  requirements: RequirementRecord[];
  requirementsCatalog?: RequisitoLtree[];
  iafSectors: IafRecord[];
  catalogs: CatalogItem[];
  loading: boolean;
  organismos?: OrganismoAcreditacion[];
  subsectores?: SubsectorIafEntity[];
  accreditations?: AcreditacionDetailEntity[];
  certificates?: CertificadoDetailEntity[];
  auditors?: AuditorDetailEntity[];
  audits?: ProgramacionAuditEntity[];
  estatusCatalog?: EstatusCatalogItem[];
  tiposCatalog?: TipoAuditoriaCatalogItem[];
  metodologiasCatalog?: MetodologiaAuditoriaCatalogItem[];
  archivedRecordIds?: ReadonlySet<string>;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
  // Deep navigation sub-states
  normaState?: Partial<NormaViewState>;
  requisitoState?: Partial<RequisitoViewState>;
  iafState?: Partial<SectorIafViewState>;
  subsectorState?: Partial<SubsectorIafViewState>;
  organismoState?: Partial<OrganismoViewState>;
  acreditacionState?: Partial<AcreditacionViewState>;
  estatusState?: Partial<EstatusViewState>;
  tipoState?: Partial<TipoAuditoriaViewState>;
  metodologiaState?: Partial<MetodologiaAuditoriaViewState>;
}

export function renderExtraView(
  profile: UserProfile,
  state: ExtraViewState
): string {
  const activeSub = (state.activeSubSection || 'standards').toLowerCase();
  const isStaff = isApprovedStaffProfile(profile);

  // Map standards to NormaEntity
  const mappedNormas: NormaEntity[] = (state.standards && state.standards.length > 0)
    ? state.standards.map((s, idx) => {
        const fallback = INITIAL_NORMAS[idx % INITIAL_NORMAS.length];
        return {
          id: s.id || fallback.id,
          codigo: s.codigo || s.norma || fallback.codigo,
          titulo: s.titulo || (fallback.codigo === s.norma ? fallback.titulo : `Sistema de Gestión — ${s.esquema}`),
          estatus: (s.estatus as 'Vigente' | 'En Revisión' | 'Obsoleta') || fallback.estatus || 'Vigente',
          esquema: s.esquema || fallback.esquema,
          fecha_publicacion: s.fecha_publicacion || fallback.fecha_publicacion || '2015-09-15',
          norma: s.norma || fallback.norma,
          clausulas_count: s.clausulas_count || fallback.clausulas_count || 7,
          acreditaciones_count: s.acreditaciones_count || fallback.acreditaciones_count || 1,
        };
      })
    : [...INITIAL_NORMAS];

  // Map IAF sectors
  const mappedSectores: SectorIafEntity[] = (state.iafSectors && state.iafSectors.length > 0)
    ? state.iafSectors.map((sec, idx) => {
        const fallback = INITIAL_SECTORES_IAF[idx % INITIAL_SECTORES_IAF.length];
        return {
          id: sec.id || fallback.id,
          sector: sec.sector || fallback.sector,
          descripcion: sec.descripcion || fallback.descripcion,
          subsectores_count: sec.subsectores_count ?? (fallback.sector === sec.sector ? fallback.subsectores_count : 1),
          auditores_count: sec.auditores_count ?? (fallback.sector === sec.sector ? fallback.auditores_count : 1),
        };
      })
    : [...INITIAL_SECTORES_IAF];

  // Requisitos mapped
  const seededCatalog = getAllSeededNormaRequirements();
  const mappedRequisitos: RequisitoLtree[] =
    state.requirementsCatalog && state.requirementsCatalog.length > 0
      ? state.requirementsCatalog
      : state.requirements && state.requirements.length > 0
      ? state.requirements.map((r) => {
          const rNormaLower = (r.norma || '').trim().toLowerCase();
          const rCodigoLower = (r.codigo || '').trim().toLowerCase();
          const matchedSeed =
            seededCatalog.find((s) => s.id === r.id) ||
            seededCatalog.find(
              (s) =>
                s.codigo.trim().toLowerCase() === rCodigoLower &&
                (!rNormaLower || s.norma_codigo.trim().toLowerCase() === rNormaLower)
            );
          const matchedNorma = mappedNormas.find(
            (n) =>
              (r.id_norma && n.id === r.id_norma) ||
              n.codigo.trim().toLowerCase() === rNormaLower ||
              n.norma.trim().toLowerCase() === rNormaLower
          );
          const routePath = r.ruta_materializada || matchedSeed?.ruta_materializada || r.codigo;
          const indent = calculateLtreeIndentation(routePath, r.codigo);
          return {
            id: r.id || matchedSeed?.id || `${rNormaLower}-${rCodigoLower}`,
            id_norma: r.id_norma || matchedNorma?.id || matchedSeed?.id_norma || mappedNormas[0]?.id || '',
            norma_codigo: r.norma || matchedNorma?.codigo || matchedSeed?.norma_codigo || 'ISO 9001:2015',
            id_requisito_padre:
              r.id_requisito_padre !== undefined
                ? r.id_requisito_padre
                : matchedSeed?.id_requisito_padre ?? null,
            codigo: r.codigo || matchedSeed?.codigo || '',
            titulo: r.titulo || matchedSeed?.titulo || '',
            descripcion:
              r.descripcion ||
              matchedSeed?.descripcion ||
              'Requisito normativo auditable del sistema de gestión.',
            ruta_materializada: routePath,
            nivel: indent.level,
            es_padre: indent.isParent,
          };
        })
      : [...INITIAL_REQUISITOS_LTREE];

  const mappedOrganismos: OrganismoAcreditacion[] =
    state.organismos && state.organismos.length > 0
      ? state.organismos
      : [...INITIAL_ORGANISMOS];

  const mappedAcreditaciones: AcreditacionDetailEntity[] =
    state.accreditations && state.accreditations.length > 0
      ? state.accreditations
      : buildInitialAcreditacionEntities();

  const legacyAcreditaciones =
    state.accreditations && state.accreditations.length > 0
      ? mappedAcreditaciones.map(toLegacyAcreditacionNormaIaf)
      : [...INITIAL_ACREDITACIONES];

  const archivedIds = state.archivedRecordIds;

  const activeOrganismos = archivedIds
    ? mappedOrganismos.filter((o) => !archivedIds.has(o.id))
    : mappedOrganismos;
  const activeNormas = archivedIds
    ? mappedNormas.filter((n) => !archivedIds.has(n.id))
    : mappedNormas;
  const activeSectores = archivedIds
    ? mappedSectores.filter((s) => !archivedIds.has(s.id))
    : mappedSectores;
  const activeAcreditaciones = archivedIds
    ? mappedAcreditaciones.filter((a) => !archivedIds.has(a.id))
    : mappedAcreditaciones;
  const activeLegacyAcreditaciones = archivedIds
    ? legacyAcreditaciones.filter((a) => !archivedIds.has(a.id))
    : legacyAcreditaciones;

  const rawEstatus =
    state.estatusCatalog && state.estatusCatalog.length > 0
      ? state.estatusCatalog
      : INITIAL_ESTATUS_CATALOG;
  const activeEstatusList = archivedIds
    ? rawEstatus.filter((e) => !archivedIds.has(e.id))
    : rawEstatus;

  const rawTipos =
    state.tiposCatalog && state.tiposCatalog.length > 0
      ? state.tiposCatalog
      : INITIAL_TIPOS_AUDITORIA_CATALOG;
  const activeTiposList = archivedIds
    ? rawTipos.filter((t) => !archivedIds.has(t.id))
    : rawTipos;

  const rawMetodologias =
    state.metodologiasCatalog && state.metodologiasCatalog.length > 0
      ? state.metodologiasCatalog
      : INITIAL_METODOLOGIAS_CATALOG;
  const activeMetodologiasList = archivedIds
    ? rawMetodologias.filter((m) => !archivedIds.has(m.id))
    : rawMetodologias;

  const rawSubsectores: SubsectorIafEntity[] =
    state.subsectores && state.subsectores.length > 0
      ? state.subsectores
      : INITIAL_SUBSECTORES_IAF;
  const activeSubsectores = archivedIds
    ? rawSubsectores.filter((sub) => !sub.deleted_at && !archivedIds.has(sub.id))
    : rawSubsectores.filter((sub) => !sub.deleted_at);

  let activeContentHtml = '';

  if (
    activeSub === 'iaf' ||
    activeSub === 'sector_iaf' ||
    activeSub === 'subsector_iaf'
  ) {
    const subsectorState: SubsectorIafViewState = {
      selectedSubsectorId: state.subsectorState?.selectedSubsectorId || null,
      prefillSectorId: state.subsectorState?.prefillSectorId || null,
      activeChildTab: state.subsectorState?.activeChildTab || 'certificados',
      isCreating: isStaff && Boolean(state.subsectorState?.isCreating),
      isEditingAttributes: isStaff && Boolean(state.subsectorState?.isEditingAttributes),
      formDraft: state.subsectorState?.formDraft,
      editErrorMessage: state.subsectorState?.editErrorMessage ?? null,
    };

    const hasValidSelectedSubsector = Boolean(
      subsectorState.selectedSubsectorId &&
        activeSubsectores.some((s) => s.id === subsectorState.selectedSubsectorId)
    );

    if (
      (isStaff && subsectorState.isCreating && !subsectorState.selectedSubsectorId) ||
      hasValidSelectedSubsector
    ) {
      activeContentHtml = renderSubsectorIafView({
        profile,
        state: subsectorState,
        subsectores: activeSubsectores,
        sectores: activeSectores,
        certificados: state.certificates || [],
        auditores: state.auditors || [],
        tableColumnWidths: state.tableColumnWidths,
      });
    } else {
      const iafState: SectorIafViewState = {
        selectedSectorId: state.iafState?.selectedSectorId || null,
        activeChildTab: state.iafState?.activeChildTab || 'subsectores',
        query: state.iafState?.query || '',
        selectedRisk: state.iafState?.selectedRisk || 'ALL',
        viewMode: state.iafState?.viewMode || 'grid',
        sortColumn: state.iafState?.sortColumn || null,
        sortDirection: state.iafState?.sortDirection || 'none',
        isSidebarOpen: state.iafState?.isSidebarOpen ?? true,
        facetSelections: state.iafState?.facetSelections,
        isCreating: isStaff && Boolean(state.iafState?.isCreating),
        isEditingAttributes: isStaff && Boolean(state.iafState?.isEditingAttributes),
        formDraft: state.iafState?.formDraft,
        editErrorMessage: state.iafState?.editErrorMessage ?? null,
      };

      activeContentHtml = renderSectorIafView({
        profile,
        state: iafState,
        sectores: activeSectores,
        subsectores: activeSubsectores,
        acreditaciones: activeLegacyAcreditaciones,
        certificados: state.certificates || [],
        auditores: state.auditors || [],
        loading: state.loading,
        archiveConfig: state.archiveConfig,
        tableColumnWidths: state.tableColumnWidths,
      });
    }
  } else if (
    activeSub === 'organismos' ||
    activeSub === 'organismo' ||
    activeSub === 'organismo_acreditacion'
  ) {
    const orgState: OrganismoViewState = {
      selectedOrganismoId: state.organismoState?.selectedOrganismoId || null,
      activeChildTab: 'acreditaciones',
      query: state.organismoState?.query || '',
      viewMode: state.organismoState?.viewMode || 'grid',
      sortColumn: state.organismoState?.sortColumn || null,
      sortDirection: state.organismoState?.sortDirection || 'none',
      isSidebarOpen: state.organismoState?.isSidebarOpen ?? true,
      facetSelections: state.organismoState?.facetSelections,
      isCreating: isStaff && Boolean(state.organismoState?.isCreating),
      isEditingAttributes: isStaff && Boolean(state.organismoState?.isEditingAttributes),
      formDraft: state.organismoState?.formDraft,
      editErrorMessage: state.organismoState?.editErrorMessage ?? null,
    };

    activeContentHtml = renderOrganismoAcreditacionView({
      profile,
      state: orgState,
      organismos: activeOrganismos,
      acreditaciones: activeAcreditaciones,
      loading: state.loading,
      archiveConfig: state.archiveConfig,
      tableColumnWidths: state.tableColumnWidths,
    });
  } else if (
    activeSub === 'accreditations' ||
    activeSub === 'acreditacion' ||
    activeSub === 'acreditaciones'
  ) {
    const acredState: AcreditacionViewState = {
      selectedAccreditationId: state.acreditacionState?.selectedAccreditationId || null,
      activeChildTab: state.acreditacionState?.activeChildTab || 'certificados',
      query: state.acreditacionState?.query || '',
      viewMode: state.acreditacionState?.viewMode || 'grid',
      sortColumn: state.acreditacionState?.sortColumn || null,
      sortDirection: state.acreditacionState?.sortDirection || 'none',
      isSidebarOpen: state.acreditacionState?.isSidebarOpen ?? true,
      facetSelections: state.acreditacionState?.facetSelections,
      isCreating: isStaff && Boolean(state.acreditacionState?.isCreating),
      isEditingAttributes: isStaff && Boolean(state.acreditacionState?.isEditingAttributes),
      formDraft: state.acreditacionState?.formDraft,
      editErrorMessage: state.acreditacionState?.editErrorMessage ?? null,
    };

    activeContentHtml = renderAcreditacionView({
      profile,
      state: acredState,
      acreditaciones: activeAcreditaciones,
      organismos: activeOrganismos,
      normas: activeNormas,
      sectores: activeSectores,
      estatusList: activeEstatusList,
      certificates: state.certificates || [],
      subsectores:
        state.subsectores && state.subsectores.length > 0
          ? state.subsectores
          : INITIAL_SUBSECTORES_IAF,
      loading: state.loading,
      archiveConfig: state.archiveConfig,
      tableColumnWidths: state.tableColumnWidths,
    });
  } else if (activeSub === 'estatus') {
    const estatusState: EstatusViewState = {
      selectedEstatusId: state.estatusState?.selectedEstatusId || null,
      activeChildTab: state.estatusState?.activeChildTab || 'certificados',
      query: state.estatusState?.query || '',
      selectedCategory: state.estatusState?.selectedCategory || 'ALL',
      viewMode: state.estatusState?.viewMode || 'grid',
      sortColumn: state.estatusState?.sortColumn || null,
      sortDirection: state.estatusState?.sortDirection || 'none',
      isSidebarOpen: state.estatusState?.isSidebarOpen ?? true,
      facetSelections: state.estatusState?.facetSelections,
      isCreating: isStaff && Boolean(state.estatusState?.isCreating),
      isEditingAttributes: isStaff && Boolean(state.estatusState?.isEditingAttributes),
      formDraft: state.estatusState?.formDraft,
      editErrorMessage: state.estatusState?.editErrorMessage ?? null,
    };

    activeContentHtml = renderEstatusView({
      profile,
      state: estatusState,
      estatusList: activeEstatusList,
      certificados: state.certificates || [],
      audits: state.audits || [],
      loading: state.loading,
      archiveConfig: state.archiveConfig,
      tableColumnWidths: state.tableColumnWidths,
    });
  } else if (activeSub === 'tipos' || activeSub === 'tipo') {
    const tipoState: TipoAuditoriaViewState = {
      selectedTipoId: state.tipoState?.selectedTipoId || null,
      query: state.tipoState?.query || '',
      selectedCycle: state.tipoState?.selectedCycle || 'ALL',
      viewMode: state.tipoState?.viewMode || 'grid',
      sortColumn: state.tipoState?.sortColumn || null,
      sortDirection: state.tipoState?.sortDirection || 'none',
      isSidebarOpen: state.tipoState?.isSidebarOpen ?? true,
      facetSelections: state.tipoState?.facetSelections,
      isCreating: isStaff && Boolean(state.tipoState?.isCreating),
      isEditingAttributes: isStaff && Boolean(state.tipoState?.isEditingAttributes),
      formDraft: state.tipoState?.formDraft,
      editErrorMessage: state.tipoState?.editErrorMessage ?? null,
    };

    activeContentHtml = renderTipoAuditoriaView({
      profile,
      state: tipoState,
      tiposList: activeTiposList,
      audits: state.audits || [],
      loading: state.loading,
      archiveConfig: state.archiveConfig,
      tableColumnWidths: state.tableColumnWidths,
    });
  } else if (activeSub === 'metodologias' || activeSub === 'metodologia') {
    const metState: MetodologiaAuditoriaViewState = {
      selectedMetodologiaId: state.metodologiaState?.selectedMetodologiaId || null,
      query: state.metodologiaState?.query || '',
      viewMode: state.metodologiaState?.viewMode || 'grid',
      sortColumn: state.metodologiaState?.sortColumn || null,
      sortDirection: state.metodologiaState?.sortDirection || 'none',
      isSidebarOpen: state.metodologiaState?.isSidebarOpen ?? true,
      facetSelections: state.metodologiaState?.facetSelections,
      isCreating: isStaff && Boolean(state.metodologiaState?.isCreating),
      isEditingAttributes: isStaff && Boolean(state.metodologiaState?.isEditingAttributes),
      formDraft: state.metodologiaState?.formDraft,
      editErrorMessage: state.metodologiaState?.editErrorMessage ?? null,
    };

    activeContentHtml = renderMetodologiaAuditoriaView({
      profile,
      state: metState,
      metodologiasList: activeMetodologiasList,
      audits: state.audits || [],
      loading: state.loading,
      archiveConfig: state.archiveConfig,
      tableColumnWidths: state.tableColumnWidths,
    });
  } else {
    // 'standards' (Normas & Requisitos LTREE)
    const activeRequisitos = archivedIds
      ? mappedRequisitos.filter((r) => !r.deleted_at && !archivedIds.has(r.id))
      : mappedRequisitos.filter((r) => !r.deleted_at);

    const requisitoState: RequisitoViewState = {
      selectedRequisitoId: state.requisitoState?.selectedRequisitoId || null,
      prefillNormaId: state.requisitoState?.prefillNormaId || null,
      prefillPadreId: state.requisitoState?.prefillPadreId || null,
      readerScope: state.requisitoState?.readerScope || 'clause',
      fullNormaQuery: state.requisitoState?.fullNormaQuery || '',
      activeChildTab: state.requisitoState?.activeChildTab || 'subrequisitos',
      langMode: state.requisitoState?.langMode || 'es',
      isContentCollapsed: Boolean(state.requisitoState?.isContentCollapsed),
      editorLang: state.requisitoState?.editorLang || 'es',
      editorMode: state.requisitoState?.editorMode || 'visual',
      linkPopoverOpen: Boolean(state.requisitoState?.linkPopoverOpen),
      linkDraftUrl: state.requisitoState?.linkDraftUrl || '',
      linkDraftLabel: state.requisitoState?.linkDraftLabel || '',
      linkErrorMessage: state.requisitoState?.linkErrorMessage ?? null,
      clausePickerOpen: Boolean(state.requisitoState?.clausePickerOpen),
      clausePickerQuery: state.requisitoState?.clausePickerQuery || '',
      isCreating: isStaff && Boolean(state.requisitoState?.isCreating),
      isEditingAttributes: isStaff && Boolean(state.requisitoState?.isEditingAttributes),
      formDraft: state.requisitoState?.formDraft,
      editErrorMessage: state.requisitoState?.editErrorMessage ?? null,
    };

    const hasValidSelectedRequisito = Boolean(
      requisitoState.selectedRequisitoId &&
        activeRequisitos.some((r) => r.id === requisitoState.selectedRequisitoId)
    );
    const hasValidFullNormaTarget = Boolean(
      requisitoState.readerScope === 'full_norma' &&
        requisitoState.prefillNormaId &&
        activeNormas.some((n) => n.id === requisitoState.prefillNormaId)
    );

    if (
      (isStaff && requisitoState.isCreating && !requisitoState.selectedRequisitoId) ||
      hasValidSelectedRequisito ||
      hasValidFullNormaTarget
    ) {
      activeContentHtml = renderRequisitoView({
        profile,
        state: requisitoState,
        requisitos: activeRequisitos,
        normas: activeNormas,
        certificados: state.certificates || [],
        tableColumnWidths: state.tableColumnWidths,
      });
    } else {
      const normaState: NormaViewState = {
        selectedNormaId: state.normaState?.selectedNormaId || null,
        activeChildTab: state.normaState?.activeChildTab || 'requisitos',
        query: state.normaState?.query || '',
        requisitoQuery: state.normaState?.requisitoQuery || '',
        selectedStatus: state.normaState?.selectedStatus || 'ALL',
        selectedScheme: state.normaState?.selectedScheme || 'ALL',
        viewMode: state.normaState?.viewMode || 'grid',
        sortColumn: state.normaState?.sortColumn || null,
        sortDirection: state.normaState?.sortDirection || 'none',
        isSidebarOpen: state.normaState?.isSidebarOpen ?? true,
        facetSelections: state.normaState?.facetSelections,
        isCreating: isStaff && Boolean(state.normaState?.isCreating),
        isEditingAttributes: isStaff && Boolean(state.normaState?.isEditingAttributes),
        formDraft: state.normaState?.formDraft,
        editErrorMessage: state.normaState?.editErrorMessage ?? null,
      };

      activeContentHtml = renderNormaView({
        profile,
        state: normaState,
        normas: activeNormas,
        acreditaciones: activeLegacyAcreditaciones,
        organismos: activeOrganismos,
        requisitos: activeRequisitos,
        sectores: activeSectores,
        certificados: state.certificates || [],
        loading: state.loading,
        archiveConfig: state.archiveConfig,
        tableColumnWidths: state.tableColumnWidths,
      });
    }
  }

  return `
    <main class="flex-1 ${APP_SHELL_CONTAINER_CLASS} pt-1.5 pb-8 space-y-4">
      <div id="extraActiveViewContainer">
        ${activeContentHtml}
      </div>
    </main>
  `;
}
