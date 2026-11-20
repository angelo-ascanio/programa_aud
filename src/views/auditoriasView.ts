import { escapeHtml } from '../lib/html';
import {
  AUDITORIAS_NAV_ITEMS,
  type UserProfile,
} from '../lib/healthCheck';
import { normalizeDomainSubview } from '../lib/accessControl';
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
  renderVinculoView,
  type VinculoViewState,
} from './vinculoView';
import {
  renderDesignacionTipoView,
  type DesignacionTipoViewState,
} from './designacionTipoView';
import {
  renderDesignacionSitioView,
  type DesignacionSitioViewState,
} from './designacionSitioView';
import {
  renderDesignacionTemporalView,
  type DesignacionTemporalViewState,
} from './designacionTemporalView';
import {
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
  vinculoState?: VinculoViewState;
  designacionTipoState?: DesignacionTipoViewState;
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

const DEFAULT_VINCULO_STATE: VinculoViewState = {
  activeSubMode: 'vinculos',
  query: '',
  viewMode: 'list',
  isSidebarOpen: true,
  sortColumn: null,
  sortDirection: 'none',
  facetSelections: {},
  selectedVinculoId: null,
  activeChildTab: 'certificados',
  isCreating: false,
  isEditingAttributes: false,
  editErrorMessage: null,
  selectedFreeCertIdsForBatch: [],
};

const DEFAULT_DESIGNACION_TIPO_STATE: DesignacionTipoViewState = {
  queuePreset: 'PROXIMAS',
  query: '',
  viewMode: 'list',
  isSidebarOpen: true,
  sortColumn: null,
  sortDirection: 'none',
  facetSelections: {},
  selectedProgramId: null,
  activeChildTab: 'fechas',
  isCreating: false,
  isEditingAttributes: false,
  isReprogramming: false,
  editErrorMessage: null,
};

const DEFAULT_DESIGNACION_SITIO_STATE: DesignacionSitioViewState = {
  queuePreset: 'PROXIMAS',
  query: '',
  viewMode: 'list',
  isSidebarOpen: true,
  sortColumn: null,
  sortDirection: 'none',
  facetSelections: {},
  selectedProgramId: null,
  selectedAuditId: null,
  cycleWindowOffsetByAuditId: {},
  editErrorMessage: null,
  savingSiteToggleKey: null,
};

const DEFAULT_DESIGNACION_TEMPORAL_STATE: DesignacionTemporalViewState = {
  query: '',
  viewMode: 'list',
  isSidebarOpen: true,
  sortColumn: null,
  sortDirection: 'none',
  facetSelections: {},
  selectedProgramId: null,
  isCreatingTemporalSite: false,
  editingTemporalSiteId: null,
  confirmArchiveTemporalId: null,
  formDraft: undefined,
  editErrorMessage: null,
  saving: false,
};

const DEFAULT_TIEMPO_STATE: TiempoViewState = {
  query: '',
  viewMode: 'list',
  isSidebarOpen: true,
  sortColumn: null,
  sortDirection: 'none',
  facetSelections: {},
  selectedProgramId: null,
  draftTimeBySitePlanId: {},
  savingSitePlanId: null,
  editErrorMessage: null,
};

function renderAuditPipelineStepper(activeSub: string): string {
  const isDesignacionActive = activeSub.startsWith('designacion/');
  const stepsHtml = AUDITORIAS_NAV_ITEMS.map((item, idx) => {
    if (item.children && item.children.length > 0) {
      const childButtons = item.children
        .map((child) => {
          const activeChild = activeSub === child.id;
          return `
            <button
              type="button"
              data-nav="auditorias"
              data-subview="${escapeHtml(child.id)}"
              class="px-2 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                activeChild
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }"
            >
              ${escapeHtml(child.label)}
            </button>
          `;
        })
        .join('');

      return `
        <div class="inline-flex items-center gap-1 px-2 py-1 rounded-lg border ${
          isDesignacionActive
            ? 'border-slate-900/30 bg-slate-100/90'
            : 'border-slate-200 bg-white'
        }">
          <span class="text-[11px] font-bold text-slate-700 whitespace-nowrap px-1">
            ${idx + 1}. ${escapeHtml(item.label)}:
          </span>
          <div class="inline-flex items-center gap-0.5">
            ${childButtons}
          </div>
        </div>
      `;
    }

    const isActive = activeSub === item.id;
    return `
      <button
        type="button"
        data-nav="auditorias"
        data-subview="${escapeHtml(item.id)}"
        class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
          isActive
            ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
            : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
        }"
      >
        <span class="opacity-70">${idx + 1}.</span>
        <span>${escapeHtml(item.label)}</span>
      </button>
    `;
  }).join('');

  return `
    <nav
      aria-label="Flujo de Auditoría"
      class="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin"
    >
      ${stepsHtml}
    </nav>
  `;
}

function renderPipelineStageShell(opts: {
  stepNumber: string;
  title: string;
  description: string;
  symbol: string;
  nextSubview?: string;
  nextLabel?: string;
}): string {
  return `
    <section class="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-2xs space-y-4">
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div class="space-y-1">
          <span class="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Flujo Auditoría · ${escapeHtml(opts.stepNumber)}
          </span>
          <h1 class="text-lg font-bold text-slate-900 flex items-center gap-2">
            <span aria-hidden="true">${opts.symbol}</span>
            <span>${escapeHtml(opts.title)}</span>
          </h1>
          <p class="text-xs text-slate-600 max-w-2xl">
            ${escapeHtml(opts.description)}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            data-nav="auditorias"
            data-subview="vinculo"
            class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
          >
            ← Volver a Vínculo
          </button>
          ${
            opts.nextSubview && opts.nextLabel
              ? `
                <button
                  type="button"
                  data-nav="auditorias"
                  data-subview="${escapeHtml(opts.nextSubview)}"
                  class="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
                >
                  ${escapeHtml(opts.nextLabel)} →
                </button>
              `
              : ''
          }
        </div>
      </div>
    </section>
  `;
}

export function renderAuditoriasView(
  profile: UserProfile,
  state: AuditoriasViewState
): string {
  const activeSub = normalizeDomainSubview('auditorias', state.activeSubSection || 'vinculo');
  const stepperHtml = renderAuditPipelineStepper(activeSub);

  let contentHtml = '';
  if (activeSub === 'vinculo') {
    contentHtml = renderVinculoView({
      profile,
      state: state.vinculoState ?? DEFAULT_VINCULO_STATE,
      vinculos: state.allVinculos ?? [],
      conglomerados: state.allConglomerados ?? [],
      organizaciones: state.organizaciones ?? [],
      certificados: state.allCertificadosDetailed ?? [],
      auditPrograms: state.auditPrograms ?? [],
      programacionAudits: state.programacionAudits,
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
    });
  } else if (activeSub === 'programa') {
    contentHtml = renderProgramaView({
      profile,
      state: state.programaState ?? DEFAULT_PROGRAMA_STATE,
      audits: state.programacionAudits,
      programs: state.auditPrograms ?? [],
      vinculos: state.allVinculos ?? [],
      certificados: state.allCertificadosDetailed ?? [],
      authorizedClientOrgIds: state.authorizedClientOrgIds,
      loading: state.loading,
      archiveConfig: state.archiveConfig,
      tableColumnWidths: state.tableColumnWidths,
    });
  } else if (activeSub === 'designacion/tipo') {
    contentHtml = renderDesignacionTipoView({
      profile,
      state: state.designacionTipoState ?? DEFAULT_DESIGNACION_TIPO_STATE,
      programs: state.auditPrograms ?? [],
      vinculos: state.allVinculos ?? [],
      conglomerados: state.allConglomerados ?? [],
      certificados: state.allCertificadosDetailed ?? [],
      organizaciones: state.organizaciones ?? [],
      tiposCatalog: state.tiposCatalog ?? [],
      loading: state.loading,
      archiveConfig: state.archiveConfig,
      tableColumnWidths: state.tableColumnWidths,
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
      loading: state.loading,
      archiveConfig: state.archiveConfig,
      tableColumnWidths: state.tableColumnWidths,
    });
  } else if (activeSub === 'designacion/temporal') {
    contentHtml = renderDesignacionTemporalView({
      profile,
      state: state.designacionTemporalState ?? DEFAULT_DESIGNACION_TEMPORAL_STATE,
      programs: state.auditPrograms ?? [],
      temporalSites: state.allTemporalSites ?? [],
      vinculos: state.allVinculos ?? [],
      conglomerados: state.allConglomerados ?? [],
      loading: state.loading,
      archiveConfig: state.archiveConfig,
      tableColumnWidths: state.tableColumnWidths,
    });
  } else if (activeSub === 'tiempo') {
    contentHtml = renderTiempoView({
      profile,
      state: state.tiempoState ?? DEFAULT_TIEMPO_STATE,
      programs: state.auditPrograms ?? [],
      temporalSites: state.allTemporalSites ?? [],
      vinculos: state.allVinculos ?? [],
      conglomerados: state.allConglomerados ?? [],
      loading: state.loading,
      archiveConfig: state.archiveConfig,
      tableColumnWidths: state.tableColumnWidths,
    });
  } else if (activeSub === 'asignacion') {
    contentHtml = renderAsignacionView({
      profile,
      state: state.asignacionState ?? DEFAULT_ASIGNACION_STATE,
      programs: state.auditPrograms ?? [],
      temporalSites: state.allTemporalSites ?? [],
      auditors: state.allAuditorsDetailed ?? [],
      certificados: state.allCertificadosDetailed ?? [],
      vinculos: state.allVinculos ?? [],
      conglomerados: state.allConglomerados ?? [],
      alertConfig: state.alertConfig,
      loading: state.loading,
      archiveConfig: state.archiveConfig,
      tableColumnWidths: state.tableColumnWidths,
    });
  } else {
    contentHtml = renderPipelineStageShell({
      stepNumber: 'Paso 10 · Revisión',
      title: 'Revisión Técnica y Cierre',
      symbol: '✅',
      description:
        'Revisión técnica independiente, verificación documental y cierre formal de auditorías. Próximo paso del roadmap (Step 11).',
      nextSubview: 'resultado',
      nextLabel: 'Ver Resultado',
    });
  }

  return `
    <main class="flex-1 ${APP_SHELL_CONTAINER_CLASS} pt-1.5 pb-8 space-y-4">
      ${stepperHtml}
      ${contentHtml}
    </main>
  `;
}
