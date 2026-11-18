import type { UserProfile } from '../lib/healthCheck';
import type { CertificateRecord } from '../lib/searchControls';
import type { AuditorDetailEntity } from '../lib/competencyMatrix';
import type { OrganizacionEntity } from '../lib/activeCertificates';
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
import { renderProgramacionView } from './programacionView';
import { renderCalendarioView } from './calendarioView';
import { renderResultadoView } from './resultadoView';
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
  programacionState: ProgramacionViewState;
  calendarioState: CalendarioViewState;
  resultadoState: ResultadoViewState;
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

export function renderAuditoriasView(
  profile: UserProfile,
  state: AuditoriasViewState
): string {
  // Map legacy 'team'/'scope'/'sitio_auditoria' subsections gracefully to 'scheduling'
  const rawSub = state.activeSubSection || 'scheduling';
  const activeSub =
    rawSub === 'calendar' || rawSub === 'findings' ? rawSub : 'scheduling';

  let contentHtml = '';
  if (activeSub === 'calendar') {
    contentHtml = renderCalendarioView({
      profile,
      state: state.calendarioState,
      audits: state.programacionAudits,
      auditors: state.allAuditorsDetailed,
      standards: state.standards,
      programs: state.auditPrograms,
      auditAlerts: state.auditAlerts,
      alertConfig: state.alertConfig,
      tableColumnWidths: state.tableColumnWidths,
      loading: state.loading,
      archiveConfig: state.archiveConfig,
    });
  } else if (activeSub === 'findings') {
    contentHtml = renderResultadoView({
      profile,
      state: state.resultadoState,
      audits: state.programacionAudits,
      findings: state.phase5Findings,
      processes: state.processes,
      requirements: state.requirements,
      tableColumnWidths: state.tableColumnWidths,
      loading: state.loading,
      archiveConfig: state.archiveConfig,
    });
  } else {
    // Leaf-to-root precedence inside Programación:
    // 1. SitioAuditoria (when selectedSitioAuditoriaId is active — completed in Step 3.2.2)
    // 2. Program Detail ('add' | 'edit' | 'read' via selectedProgramId / isCreating)
    // 3. Legacy single-audit detail fallback (selectedAuditId)
    // 4. Programación Multi View Directory
    contentHtml = renderProgramacionView({
      profile,
      state: state.programacionState,
      audits: state.programacionAudits,
      auditors: state.allAuditorsDetailed,
      certificates: state.certificates,
      findings: state.phase5Findings,
      programs: state.auditPrograms,
      allCertificadosDetailed: state.allCertificadosDetailed,
      organizaciones: state.organizaciones,
      tiposCatalog: state.tiposCatalog,
      metodologiasCatalog: state.metodologiasCatalog,
      authorizedClientOrgIds: state.authorizedClientOrgIds,
      auditAlerts: state.auditAlerts,
      tableColumnWidths: state.tableColumnWidths,
      loading: state.loading,
      archiveConfig: state.archiveConfig,
    });
  }

  return `
    <main class="flex-1 ${APP_SHELL_CONTAINER_CLASS} pt-1.5 pb-8 space-y-4">
      ${contentHtml}
    </main>
  `;
}
