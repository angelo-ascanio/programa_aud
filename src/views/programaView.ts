import type { UserProfile } from '../lib/healthCheck';
import type { VinculoEntity } from '../lib/vinculoDomain';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import type { ProgramaAuditoriaEntity } from '../lib/auditPlanningEngine';
import type { ProgramacionAuditEntity } from '../lib/auditExecution';
import type {
  MultiViewSelectionMap,
  SortDirection,
  UniversalViewMode,
} from '../lib/universalTemplate';
import type { ArchiveMultiViewConfig } from '../lib/archiveGovernance';
import {
  DEFAULT_PROGRAMA_PROCESOS_STATE,
  renderProgramaProcesosView,
  type ProgramaProcesosViewState,
} from './programaProcesosView';
import {
  DEFAULT_PROGRAMA_TURNOS_STATE,
  renderProgramaTurnosView,
  type ProgramaTurnosViewState,
} from './programaTurnosView';

/**
 * @deprecated Step 7.1 divided monolithic `Programa` into `4. Proceso` (`programaProcesosView.ts`)
 * and `5. Turno` (`programaTurnosView.ts`). Retained only as a compatibility wrapper.
 */
export type ProgramaSortColumn = 'certificado' | 'procesos' | 'turnos' | 'estado';

/**
 * @deprecated Use `ProgramaProcesosViewState` and `ProgramaTurnosViewState`.
 */
export interface ProgramaViewState {
  query: string;
  viewMode: UniversalViewMode;
  isSidebarOpen: boolean;
  sortColumn: ProgramaSortColumn | null;
  sortDirection: SortDirection;
  facetSelections: MultiViewSelectionMap;
  selectedAuditId: string | null;
  activeMiniStep: 'procesos' | 'turnos';
  cycleWindowOffsetByAuditId: Record<string, number>;
  openHistoryDrawerProcessIds: string[];
  editErrorMessage: string | null;
}

/**
 * @deprecated Use `DEFAULT_PROGRAMA_PROCESOS_STATE` / `DEFAULT_PROGRAMA_TURNOS_STATE`.
 */
export const DEFAULT_PROGRAMA_STATE: ProgramaViewState = {
  query: '',
  viewMode: 'list',
  isSidebarOpen: true,
  sortColumn: null,
  sortDirection: 'none',
  facetSelections: {},
  selectedAuditId: null,
  activeMiniStep: 'procesos',
  cycleWindowOffsetByAuditId: {},
  openHistoryDrawerProcessIds: [],
  editErrorMessage: null,
};

/**
 * @deprecated Use `ProgramaProcesosPageProps` / `ProgramaTurnosPageProps`.
 */
export interface ProgramaViewProps {
  profile: UserProfile;
  state: ProgramaViewState;
  audits: ReadonlyArray<ProgramacionAuditEntity>;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  vinculos?: ReadonlyArray<VinculoEntity>;
  certificados?: ReadonlyArray<CertificadoDetailEntity>;
  authorizedClientOrgIds?: ReadonlyArray<string>;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  tableColumnWidths?: Record<string, Record<string, number>>;
  inCardBreadcrumbHtml?: string;
  headerAddAuditHtml?: string;
}

/**
 * @deprecated Use `renderProgramaProcesosView` (`4. Proceso`) or `renderProgramaTurnosView` (`5. Turno`).
 */
export function renderProgramaView(props: ProgramaViewProps): string {
  const { state, audits } = props;
  const resolvedCertId = state.selectedAuditId
    ? audits.find((a) => !a.deleted_at && a.id === state.selectedAuditId)?.id_certificado ?? null
    : null;

  if (state.activeMiniStep === 'turnos') {
    const turnosState: ProgramaTurnosViewState = {
      ...DEFAULT_PROGRAMA_TURNOS_STATE,
      query: state.query,
      viewMode: state.viewMode,
      isSidebarOpen: state.isSidebarOpen,
      facetSelections: state.facetSelections,
      selectedCertId: resolvedCertId,
      selectedAuditId: state.selectedAuditId,
      editErrorMessage: state.editErrorMessage,
    };
    return renderProgramaTurnosView({
      ...props,
      state: turnosState,
    });
  }

  const procesosState: ProgramaProcesosViewState = {
    ...DEFAULT_PROGRAMA_PROCESOS_STATE,
    query: state.query,
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen,
    facetSelections: state.facetSelections,
    selectedCertId: resolvedCertId,
    selectedAuditId: state.selectedAuditId,
    cycleWindowOffsetByAuditId: state.cycleWindowOffsetByAuditId,
    openHistoryDrawerProcessIds: state.openHistoryDrawerProcessIds,
    editErrorMessage: state.editErrorMessage,
  };
  return renderProgramaProcesosView({
    ...props,
    state: procesosState,
  });
}
