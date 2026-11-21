import type { UserProfile } from '../lib/healthCheck';
import { normalizeDomainSubview } from '../lib/accessControl';
import { isApprovedStaffProfile } from '../lib/rbac';
import {
  buildAuditCardBreadcrumbModel,
  resolveSharedAuditSelection,
  sortAuditsByRecencyDesc,
} from '../lib/breadcrumb';
import { resolveDefaultAuditForCertificate } from '../lib/certificateAuditSelector';
import type { CertificateRecord } from '../lib/searchControls';
import type { AuditorDetailEntity } from '../lib/competencyMatrix';
import type { OrganizacionEntity } from '../lib/activeCertificates';
import type { ConglomeradoEntity } from '../lib/conglomeradoDomain';
import type { VinculoEntity } from '../lib/vinculoDomain';
import type {
  MetodologiaAuditoriaCatalogItem,
  TipoAuditoriaCatalogItem,
} from '../lib/extraDomain';
import type {
  CalendarioViewState,
  Phase5FindingEntity,
  ProgramacionAuditEntity,
  ProgramacionViewState,
  ResultadoViewState,
} from '../lib/auditExecution';
import { renderCalendarioView } from './calendarioView';
import { renderResultadoView } from './resultadoView';
import {
  DEFAULT_REVISION_STATE,
  renderRevisionView,
  type RevisionViewState,
} from './revisionView';
import {
  DEFAULT_VINCULO_STATE,
  renderVinculoView,
  type VinculoViewState,
} from './vinculoView';
import {
  DEFAULT_DESIGNACION_TIPO_STATE,
  renderDesignacionTipoView,
  type DesignacionTipoViewState,
} from './designacionTipoView';
import {
  DEFAULT_DESIGNACION_FECHA_STATE,
  renderDesignacionFechaView,
  type DesignacionFechaViewState,
} from './designacionFechaView';
import {
  DEFAULT_DESIGNACION_SITIO_STATE,
  renderDesignacionSitioView,
  type DesignacionSitioViewState,
} from './designacionSitioView';
import {
  DEFAULT_DESIGNACION_TEMPORAL_STATE,
  renderDesignacionTemporalView,
  type DesignacionTemporalViewState,
} from './designacionTemporalView';
import {
  DEFAULT_TIEMPO_STATE,
  renderTiempoView,
  type TiempoViewState,
} from './tiempoView';
import {
  DEFAULT_ASIGNACION_STATE,
  renderAsignacionView,
  type AsignacionViewState,
} from './asignacionView';
import {
  DEFAULT_PROGRAMA_STATE,
  renderProgramaView,
  type ProgramaViewState,
} from './programaView';
import {
  renderAddAuditButton,
  renderAuditCardBreadcrumb,
} from './auditCardBreadcrumb';
import { renderAuditResumenView } from './auditPipelineSummaryViews';
import type { AuditoriaSitioTemporalEntity } from '../lib/designacionTemporalDomain';
import type { ArchiveMultiViewConfig } from '../lib/archiveGovernance';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import type {
  AuditAlertItem,
  ProgramaAuditoriaEntity,
} from '../lib/auditPlanningEngine';
import type { AlertConfigEntity } from '../lib/auditAlertsEngine';
import { APP_SHELL_CONTAINER_CLASS } from '../lib/layout';

export interface AuditRecord {
  id: string;
  id_certificado?: string;
  numero_certificado: string;
  organizacion_nombre: string;
  tipo_auditoria: string;
  metodologia: string;
  fecha_programacion: string;
  fecha_reprogramacion?: string | null;
  auditor_lider?: string;
  estatus: string;
  comentarios_count?: number;
}

export interface AuditorRecord {
  id: string;
  nombre: string;
  normas: string[];
  sectores_iaf: number[];
  rol?: string;
}

export interface AuditoriasViewState {
  activeSubSection: string;
  selectedCertId?: string | null;
  selectedAuditId?: string | null;
  designacionFechaAuditId?: string | null;
  resumenAuditId?: string | null;
  designacionFechaUi?: {
    query: string;
    viewMode: 'grid' | 'list';
    isSidebarOpen: boolean;
  };
  resumenUi?: {
    query: string;
    viewMode: 'grid' | 'list';
    isSidebarOpen: boolean;
  };
  vinculoState?: VinculoViewState;
  designacionTipoState?: DesignacionTipoViewState;
  designacionFechaState?: DesignacionFechaViewState;
  designacionSitioState?: DesignacionSitioViewState;
  designacionTemporalState?: DesignacionTemporalViewState;
  tiempoState?: TiempoViewState;
  asignacionState?: AsignacionViewState;
  programaState?: ProgramaViewState;
  allVinculos?: ReadonlyArray<VinculoEntity>;
  allConglomerados?: ReadonlyArray<ConglomeradoEntity>;
  allTemporalSites?: ReadonlyArray<AuditoriaSitioTemporalEntity>;
  programacionState: ProgramacionViewState;
  calendarioState: CalendarioViewState;
  resultadoState: ResultadoViewState;
  revisionState?: RevisionViewState;
  actorNameById?: ReadonlyMap<string, string>;
  programacionAudits: ProgramacionAuditEntity[];
  phase5Findings: Phase5FindingEntity[];
  allAuditorsDetailed: AuditorDetailEntity[];
  certificates: CertificateRecord[];
  processes: Array<{ id: string; nombre_proceso: string }>;
  requirements: Array<{ id: string; codigo: string; norma: string }>;
  standards: Array<{ norma: string }>;
  loading: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  auditPrograms?: ProgramaAuditoriaEntity[];
  allCertificadosDetailed?: CertificadoDetailEntity[];
  organizaciones?: ReadonlyArray<OrganizacionEntity>;
  tiposCatalog?: ReadonlyArray<TipoAuditoriaCatalogItem>;
  metodologiasCatalog?: ReadonlyArray<MetodologiaAuditoriaCatalogItem>;
  authorizedClientOrgIds?: ReadonlyArray<string>;
  auditAlerts?: AuditAlertItem[];
  alertConfig?: AlertConfigEntity;
  tableColumnWidths?: Record<string, Record<string, number>>;
}

function resolveDetailContextForSubview(
  activeSub: string,
  state: AuditoriasViewState
): {
  hasOpenDetailRecord: boolean;
  preferredAuditId: string | null;
  preferredProgramId: string | null;
} {
  const activeAudits = state.programacionAudits.filter((a) => !a.deleted_at);
  const activePrograms = (state.auditPrograms ?? []).filter((p) => !p.deleted_at);
  const hasAudit = (id?: string | null): string | null =>
    id && activeAudits.some((a) => a.id === id) ? id : null;
  const hasProgram = (id?: string | null): string | null =>
    id && activePrograms.some((p) => p.id === id) ? id : null;

  switch (activeSub) {
    case 'designacion/tipo': {
      const s = state.designacionTipoState;
      const resolvedCertId =
        s?.selectedCertId ??
        (s?.selectedAuditId ? hasAudit(s.selectedAuditId) && activeAudits.find((a) => a.id === s.selectedAuditId)?.id_certificado : null) ??
        (s?.selectedProgramId ? activePrograms.find((p) => p.id === s.selectedProgramId)?.auditorias.find((a) => !a.deleted_at)?.id_certificado : null) ??
        null;
      const defaultAudit = resolvedCertId
        ? resolveDefaultAuditForCertificate(resolvedCertId, s?.selectedAuditId ?? state.selectedAuditId ?? null, activeAudits)
        : null;
      return {
        hasOpenDetailRecord: Boolean(resolvedCertId),
        preferredAuditId: defaultAudit?.id ?? null,
        preferredProgramId: defaultAudit?.id_programa_auditoria ?? hasProgram(s?.selectedProgramId),
      };
    }
    case 'designacion/fecha': {
      const s = state.designacionFechaState;
      const resolvedCertId =
        s?.selectedCertId ??
        (s?.selectedAuditId || state.designacionFechaAuditId
          ? activeAudits.find((a) => a.id === (s?.selectedAuditId || state.designacionFechaAuditId))?.id_certificado
          : null) ??
        null;
      const defaultAudit = resolvedCertId
        ? resolveDefaultAuditForCertificate(
            resolvedCertId,
            s?.selectedAuditId ?? state.designacionFechaAuditId ?? state.selectedAuditId ?? null,
            activeAudits
          )
        : null;
      return {
        hasOpenDetailRecord: Boolean(resolvedCertId),
        preferredAuditId: defaultAudit?.id ?? null,
        preferredProgramId: defaultAudit?.id_programa_auditoria ?? null,
      };
    }
    case 'designacion/sitio': {
      const s = state.designacionSitioState;
      const resolvedCertId =
        s?.selectedCertId ??
        (s?.selectedAuditId ? activeAudits.find((a) => a.id === s.selectedAuditId)?.id_certificado : null) ??
        (s?.selectedProgramId ? activePrograms.find((p) => p.id === s.selectedProgramId)?.auditorias.find((a) => !a.deleted_at)?.id_certificado : null) ??
        null;
      const defaultAudit = resolvedCertId
        ? resolveDefaultAuditForCertificate(resolvedCertId, s?.selectedAuditId ?? state.selectedAuditId ?? null, activeAudits)
        : null;
      return {
        hasOpenDetailRecord: Boolean(resolvedCertId),
        preferredAuditId: defaultAudit?.id ?? null,
        preferredProgramId: defaultAudit?.id_programa_auditoria ?? hasProgram(s?.selectedProgramId),
      };
    }
    case 'designacion/temporal': {
      const s = state.designacionTemporalState;
      const resolvedCertId =
        s?.selectedCertId ??
        (s?.selectedAuditId ? activeAudits.find((a) => a.id === s.selectedAuditId)?.id_certificado : null) ??
        (s?.selectedProgramId ? activePrograms.find((p) => p.id === s.selectedProgramId)?.auditorias.find((a) => !a.deleted_at)?.id_certificado : null) ??
        null;
      const defaultAudit = resolvedCertId
        ? resolveDefaultAuditForCertificate(resolvedCertId, s?.selectedAuditId ?? state.selectedAuditId ?? null, activeAudits)
        : null;
      return {
        hasOpenDetailRecord: Boolean(resolvedCertId),
        preferredAuditId: defaultAudit?.id ?? null,
        preferredProgramId: defaultAudit?.id_programa_auditoria ?? hasProgram(s?.selectedProgramId),
      };
    }
    case 'tiempo': {
      const s = state.tiempoState;
      const resolvedCertId =
        s?.selectedCertId ??
        (s?.selectedAuditId
          ? hasAudit(s.selectedAuditId) &&
            activeAudits.find((a) => a.id === s.selectedAuditId)?.id_certificado
          : null) ??
        (s?.selectedProgramId
          ? activePrograms
              .find((p) => p.id === s.selectedProgramId)
              ?.auditorias.find((a) => !a.deleted_at)?.id_certificado
          : null) ??
        null;
      const defaultAudit = resolvedCertId
        ? resolveDefaultAuditForCertificate(
            resolvedCertId,
            s?.selectedAuditId ?? state.selectedAuditId ?? null,
            activeAudits
          )
        : null;
      return {
        hasOpenDetailRecord: Boolean(resolvedCertId),
        preferredAuditId: defaultAudit?.id ?? null,
        preferredProgramId:
          defaultAudit?.id_programa_auditoria ?? hasProgram(s?.selectedProgramId),
      };
    }
    case 'auditor': {
      const s = state.asignacionState;
      const resolvedCertId =
        s?.selectedCertId ??
        (s?.selectedAuditId
          ? hasAudit(s.selectedAuditId) &&
            activeAudits.find((a) => a.id === s.selectedAuditId)?.id_certificado
          : null) ??
        (s?.selectedProgramId
          ? activePrograms
              .find((p) => p.id === s.selectedProgramId)
              ?.auditorias.find((a) => !a.deleted_at)?.id_certificado
          : null) ??
        null;
      const defaultAudit = resolvedCertId
        ? resolveDefaultAuditForCertificate(
            resolvedCertId,
            s?.selectedAuditId ?? state.selectedAuditId ?? null,
            activeAudits
          )
        : null;
      return {
        hasOpenDetailRecord: Boolean(resolvedCertId),
        preferredAuditId: defaultAudit?.id ?? null,
        preferredProgramId:
          defaultAudit?.id_programa_auditoria ?? hasProgram(s?.selectedProgramId),
      };
    }
    case 'proceso':
    case 'turno': {
      const audId = hasAudit(state.programaState?.selectedAuditId);
      return {
        hasOpenDetailRecord: Boolean(audId),
        preferredAuditId: audId,
        preferredProgramId: null,
      };
    }
    case 'resultado': {
      const audId = hasAudit(state.resultadoState?.selectedResultAuditId);
      return {
        hasOpenDetailRecord: Boolean(audId),
        preferredAuditId: audId,
        preferredProgramId: null,
      };
    }
    case 'revision': {
      const audId = hasAudit(state.revisionState?.selectedAuditId);
      return {
        hasOpenDetailRecord: Boolean(audId),
        preferredAuditId: audId,
        preferredProgramId: null,
      };
    }
    case 'resumen': {
      const audId = hasAudit(state.resumenAuditId);
      return {
        hasOpenDetailRecord: Boolean(audId),
        preferredAuditId: audId,
        preferredProgramId: null,
      };
    }
    default:
      return {
        hasOpenDetailRecord: false,
        preferredAuditId: null,
        preferredProgramId: null,
      };
  }
}

export function renderAuditoriasView(
  profile: UserProfile,
  state: AuditoriasViewState
): string {
  const activeSub = normalizeDomainSubview('auditorias', state.activeSubSection || 'vinculo');
  const isStaff = isApprovedStaffProfile(profile);
  const headerAddAuditHtml = renderAddAuditButton(isStaff);

  const activePrograms = (state.auditPrograms ?? []).filter((p) => !p.deleted_at);
  const activeAudits = state.programacionAudits.filter((a) => !a.deleted_at);
  const detailCtx = resolveDetailContextForSubview(activeSub, state);

  let effectivePreferredAuditId = detailCtx.preferredAuditId;
  if (!effectivePreferredAuditId && detailCtx.preferredProgramId) {
    const program = activePrograms.find((p) => p.id === detailCtx.preferredProgramId);
    const programAudits = (program?.auditorias || []).filter((a) => !a.deleted_at);
    const preserved = state.selectedAuditId
      ? programAudits.find((a) => a.id === state.selectedAuditId) || null
      : null;
    effectivePreferredAuditId =
      preserved?.id ?? sortAuditsByRecencyDesc(programAudits)[0]?.id ?? null;
  }

  const sharedResolved = resolveSharedAuditSelection({
    selectedCertId: state.selectedCertId ?? null,
    selectedAuditId: state.selectedAuditId ?? null,
    audits: activeAudits,
    preferredAuditId: effectivePreferredAuditId,
  });

  const breadcrumbModel = buildAuditCardBreadcrumbModel(
    activeSub,
    detailCtx.hasOpenDetailRecord,
    {
      selectedCertId: sharedResolved.selectedCertId,
      selectedAuditId: sharedResolved.selectedAuditId,
    }
  );

  const auditsForCert = sharedResolved.selectedCertId
    ? sortAuditsByRecencyDesc(
        activeAudits.filter((a) => a.id_certificado === sharedResolved.selectedCertId)
      )
    : [];
  const activeCertLabel = sharedResolved.audit
    ? `📜 ${sharedResolved.audit.numero_certificado} — ${sharedResolved.audit.organizacion_nombre}`
    : null;

  const isCertBasedSection =
    activeSub.startsWith('designacion/') ||
    activeSub === 'tiempo' ||
    activeSub === 'auditor';
  const inCardBreadcrumbHtml = breadcrumbModel.visible
    ? renderAuditCardBreadcrumb({
        model: breadcrumbModel,
        auditsForCert,
        activeCertLabel,
        isStaff,
        showContextBar: !isCertBasedSection,
      })
    : '';

  let contentHtml = '';
  if (activeSub === 'vinculo') {
    const assignedCertIds = activeAudits.map((a) => a.id_certificado);
    contentHtml = renderVinculoView({
      profile,
      state: state.vinculoState ?? DEFAULT_VINCULO_STATE,
      vinculos: state.allVinculos ?? [],
      conglomerados: state.allConglomerados ?? [],
      organizaciones: state.organizaciones ?? [],
      certificados: state.allCertificadosDetailed ?? [],
      auditPrograms: state.auditPrograms ?? [],
      programacionAudits: state.programacionAudits,
      authorizedClientOrgIds: state.authorizedClientOrgIds ?? [],
      assignedAuditCertIds: assignedCertIds,
      headerAddAuditHtml,
      loading: state.loading,
      archiveConfig: state.archiveConfig,
      tableColumnWidths: state.tableColumnWidths,
    });
  } else if (activeSub === 'calendar') {
    contentHtml = renderCalendarioView({
      profile,
      state: state.calendarioState,
      audits: state.programacionAudits,
      auditors: state.allAuditorsDetailed,
      standards: state.standards,
      programs: state.auditPrograms,
      temporalSites: state.allTemporalSites ?? [],
      auditAlerts: state.auditAlerts,
      alertConfig: state.alertConfig,
      tableColumnWidths: state.tableColumnWidths,
      loading: state.loading,
      archiveConfig: state.archiveConfig,
    });
  } else if (activeSub === 'designacion/tipo') {
    contentHtml = renderDesignacionTipoView({
      profile,
      state: state.designacionTipoState ?? DEFAULT_DESIGNACION_TIPO_STATE,
      programs: state.auditPrograms ?? [],
      audits: state.programacionAudits,
      vinculos: state.allVinculos ?? [],
      conglomerados: state.allConglomerados ?? [],
      certificados: state.allCertificadosDetailed ?? [],
      certificates: state.certificates,
      organizaciones: state.organizaciones ?? [],
      tiposCatalog: state.tiposCatalog ?? [],
      loading: state.loading,
      archiveConfig: state.archiveConfig,
      tableColumnWidths: state.tableColumnWidths,
      inCardBreadcrumbHtml,
      headerAddAuditHtml,
    });
  } else if (activeSub === 'designacion/fecha') {
    contentHtml = renderDesignacionFechaView({
      profile,
      state: state.designacionFechaState ?? DEFAULT_DESIGNACION_FECHA_STATE,
      certificates: state.certificates,
      detailedCerts: state.allCertificadosDetailed ?? [],
      audits: state.programacionAudits,
      programs: state.auditPrograms ?? [],
      loading: state.loading,
      archiveConfig: state.archiveConfig,
      tableColumnWidths: state.tableColumnWidths,
      inCardBreadcrumbHtml,
      headerAddAuditHtml,
    });
  } else if (activeSub === 'designacion/sitio') {
    contentHtml = renderDesignacionSitioView({
      profile,
      state: state.designacionSitioState ?? DEFAULT_DESIGNACION_SITIO_STATE,
      programs: state.auditPrograms ?? [],
      allAudits: state.programacionAudits,
      vinculos: state.allVinculos ?? [],
      conglomerados: state.allConglomerados ?? [],
      certificados: state.allCertificadosDetailed ?? [],
      certificates: state.certificates,
      loading: state.loading,
      archiveConfig: state.archiveConfig,
      tableColumnWidths: state.tableColumnWidths,
      inCardBreadcrumbHtml,
      headerAddAuditHtml,
    });
  } else if (activeSub === 'designacion/temporal') {
    contentHtml = renderDesignacionTemporalView({
      profile,
      state: state.designacionTemporalState ?? DEFAULT_DESIGNACION_TEMPORAL_STATE,
      programs: state.auditPrograms ?? [],
      audits: state.programacionAudits,
      temporalSites: state.allTemporalSites ?? [],
      vinculos: state.allVinculos ?? [],
      conglomerados: state.allConglomerados ?? [],
      certificados: state.allCertificadosDetailed ?? [],
      certificates: state.certificates,
      loading: state.loading,
      archiveConfig: state.archiveConfig,
      tableColumnWidths: state.tableColumnWidths,
      inCardBreadcrumbHtml,
      headerAddAuditHtml,
    });
  } else if (activeSub === 'tiempo') {
    contentHtml = renderTiempoView({
      profile,
      state: state.tiempoState ?? DEFAULT_TIEMPO_STATE,
      programs: state.auditPrograms ?? [],
      audits: state.programacionAudits,
      temporalSites: state.allTemporalSites ?? [],
      vinculos: state.allVinculos ?? [],
      conglomerados: state.allConglomerados ?? [],
      certificados: state.allCertificadosDetailed ?? [],
      certificates: state.certificates,
      loading: state.loading,
      archiveConfig: state.archiveConfig,
      tableColumnWidths: state.tableColumnWidths,
      inCardBreadcrumbHtml,
      headerAddAuditHtml,
    });
  } else if (activeSub === 'auditor') {
    contentHtml = renderAsignacionView({
      profile,
      state: state.asignacionState ?? DEFAULT_ASIGNACION_STATE,
      programs: state.auditPrograms ?? [],
      audits: state.programacionAudits,
      temporalSites: state.allTemporalSites ?? [],
      auditors: state.allAuditorsDetailed ?? [],
      certificados: state.allCertificadosDetailed ?? [],
      certificates: state.certificates,
      vinculos: state.allVinculos ?? [],
      conglomerados: state.allConglomerados ?? [],
      alertConfig: state.alertConfig,
      loading: state.loading,
      archiveConfig: state.archiveConfig,
      tableColumnWidths: state.tableColumnWidths,
      inCardBreadcrumbHtml,
      headerAddAuditHtml,
    });
  } else if (activeSub === 'proceso' || activeSub === 'turno') {
    const basePrograma = state.programaState ?? DEFAULT_PROGRAMA_STATE;
    const syncedProgramaState: ProgramaViewState = {
      ...basePrograma,
      activeMiniStep: activeSub === 'turno' ? 'turnos' : basePrograma.activeMiniStep,
    };
    contentHtml = renderProgramaView({
      profile,
      state: syncedProgramaState,
      audits: state.programacionAudits,
      programs: state.auditPrograms ?? [],
      vinculos: state.allVinculos ?? [],
      certificados: state.allCertificadosDetailed ?? [],
      authorizedClientOrgIds: state.authorizedClientOrgIds,
      loading: state.loading,
      archiveConfig: state.archiveConfig,
      tableColumnWidths: state.tableColumnWidths,
      inCardBreadcrumbHtml,
      headerAddAuditHtml,
    });
  } else if (activeSub === 'resultado') {
    contentHtml = renderResultadoView({
      profile,
      state: state.resultadoState,
      audits: state.programacionAudits,
      findings: state.phase5Findings,
      processes: state.processes,
      requirements: state.requirements,
      temporalSites: state.allTemporalSites ?? [],
      alertConfig: state.alertConfig,
      tableColumnWidths: state.tableColumnWidths,
      loading: state.loading,
      archiveConfig: state.archiveConfig,
      inCardBreadcrumbHtml,
      headerAddAuditHtml,
    });
  } else if (activeSub === 'resumen') {
    contentHtml = renderAuditResumenView({
      profile,
      audits: state.programacionAudits,
      programs: state.auditPrograms ?? [],
      temporalSites: state.allTemporalSites ?? [],
      findings: state.phase5Findings,
      selectedAuditId: state.resumenAuditId ?? null,
      query: state.resumenUi?.query ?? '',
      viewMode: state.resumenUi?.viewMode ?? 'list',
      isSidebarOpen: state.resumenUi?.isSidebarOpen ?? true,
      loading: state.loading,
      tableColumnWidths: state.tableColumnWidths,
      inCardBreadcrumbHtml,
      headerAddAuditHtml,
    });
  } else {
    contentHtml = renderRevisionView({
      profile,
      state: state.revisionState ?? DEFAULT_REVISION_STATE,
      audits: state.programacionAudits,
      findings: state.phase5Findings,
      actorNameById: state.actorNameById ?? new Map(),
      loading: state.loading,
      tableColumnWidths: state.tableColumnWidths,
      inCardBreadcrumbHtml,
      headerAddAuditHtml,
    });
  }

  return `
    <main class="flex-1 ${APP_SHELL_CONTAINER_CLASS} pt-1.5 pb-8 space-y-4">
      ${contentHtml}
    </main>
  `;
}
