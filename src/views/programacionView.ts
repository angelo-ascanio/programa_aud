import { escapeHtml } from '../lib/html';
import { canAccessRoute, type UserProfile } from '../lib/healthCheck';
import type { CertificateRecord } from '../lib/searchControls';
import {
  sortSitesWithPrincipalFirst,
  INITIAL_CERTIFICADOS_DETAILED,
  type CertificadoDetailEntity,
} from '../lib/multisiteSampling';
import type { AuditorDetailEntity } from '../lib/competencyMatrix';
import type { OrganizacionEntity } from '../lib/activeCertificates';
import {
  INITIAL_METODOLOGIAS_CATALOG,
  INITIAL_TIPOS_AUDITORIA_CATALOG,
  type MetodologiaAuditoriaCatalogItem,
  type TipoAuditoriaCatalogItem,
} from '../lib/extraDomain';
import {
  canEditAuditScheduleOrTeam,
  canMutateAuditExecution,
} from '../lib/accessControl';
import {
  getAuditStatusVisualStyle,
  getLifecycleStatusMeta,
  getMethodologyVisualStyle,
  getModalityVisualStyle,
  getPhase5FindingTypeMeta,
  normalizeAuditText,
  type AuditMethodology,
  type Phase5FindingEntity,
  type ProgramacionAuditEntity,
  type ProgramacionChildTab,
  type ProgramacionSubView,
  type ProgramacionViewState,
  type ProgramDetailStep,
  type ProgramInitialDateMode,
  type ProgramStep1CertDraft,
  type ProgramStep1FormDraft,
} from '../lib/auditExecution';
import {
  AUDIT_LINK_LEVELS,
  AUDIT_LINK_NATURES,
  buildCertificateAuditHistoryDigest,
  computeAuditCalendarSpanDays,
  computeProgramPlanningStatus,
  detectAuditorScheduleConflicts,
  findUnprogrammedCertificatesByStatus,
  formatAuditDateLabel,
  resolveLatestAuditDate,
  type AuditAlertItem,
  type AuditCycleStatus,
  type AuditDateEntry,
  type AuditLinkLevel,
  type AuditLinkNature,
  type ProgramaAuditoriaEntity,
  type ProgramPlanningStatusResult,
  type UnprogrammedCertificateCandidate,
} from '../lib/auditPlanningEngine';
import { VALID_AUDIT_CYCLE_STATUSES } from '../lib/auditPlanningPersistence';
import {
  computeReactiveFacetCounts,
  filterRecordsWithFacets,
  sortItems,
  type ColumnDefinition,
  type MultiViewFacetCategory,
  type MultiViewSelectionMap,
} from '../lib/universalTemplate';
import { renderUniversalTemplate } from './universalTemplate';
import {
  renderDetailPageTemplate,
  type DetailParentChip,
} from './detailTemplate';
import {
  canArchiveRecord,
  extractUniversalArchiveProps,
  renderArchivarButtonHtml,
  type ArchiveMultiViewConfig,
} from '../lib/archiveGovernance';

export type {
  ProgramacionViewState,
  ProgramacionChildTab,
  ProgramacionSubView,
  ProgramDetailStep,
  ProgramInitialDateMode,
  ProgramStep1CertDraft,
  ProgramStep1FormDraft,
};

export type ProgramDetailMode = 'read' | 'add' | 'edit';

export interface ProgramacionViewProps {
  profile: UserProfile;
  state: ProgramacionViewState;
  audits: ProgramacionAuditEntity[];
  auditors: AuditorDetailEntity[];
  certificates: CertificateRecord[];
  findings?: Phase5FindingEntity[];
  programs?: ProgramaAuditoriaEntity[];
  allCertificadosDetailed?: CertificadoDetailEntity[];
  organizaciones?: ReadonlyArray<OrganizacionEntity>;
  tiposCatalog?: ReadonlyArray<TipoAuditoriaCatalogItem>;
  metodologiasCatalog?: ReadonlyArray<MetodologiaAuditoriaCatalogItem>;
  authorizedClientOrgIds?: ReadonlyArray<string>;
  auditAlerts?: AuditAlertItem[];
  tableColumnWidths?: Record<string, Record<string, number>>;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
}

interface CampaignDirectoryRow {
  program: ProgramaAuditoriaEntity;
  planningStatus: ProgramPlanningStatusResult;
  latestDate: AuditDateEntry | null;
  precisionKey: 'REAL' | 'PREPROGRAMADA_MES' | 'SIN_FECHA';
  cuadreKey: 'CUADRADO' | 'DESFASE' | 'PENDIENTE';
  assignedDays: number;
  requiredDays: number;
  hasConflict: boolean;
  hasAlert: boolean;
  orgNames: string[];
  certNumbers: string[];
  normaCodes: string[];
  auditorNames: string[];
}

interface UnprogrammedCertRow extends UnprogrammedCertificateCandidate {
  sector_iaf?: number;
  subsector_label: string;
  lastAuditLabel: string;
  lastAuditSortKey: string;
}

function resolveEffectiveLatestDateForAudit(
  audit: ProgramacionAuditEntity
): AuditDateEntry | null {
  const canonical = resolveLatestAuditDate(audit.fechas) ?? audit.latestDate ?? null;
  if (canonical) return canonical;
  if (audit.fecha_inicio && /^\d{4}-\d{2}-\d{2}$/.test(audit.fecha_inicio.trim())) {
    const start = audit.fecha_reprogramacion?.trim() || audit.fecha_inicio.trim();
    const end =
      audit.fecha_fin && /^\d{4}-\d{2}-\d{2}$/.test(audit.fecha_fin.trim()) && audit.fecha_fin.trim() >= start
        ? audit.fecha_fin.trim()
        : start;
    return {
      id: `effective-date-${audit.id}`,
      id_auditoria: audit.id,
      numero_secuencia: audit.fecha_reprogramacion ? 2 : 1,
      tag: audit.fecha_reprogramacion ? 'Reprogramación' : 'Programación',
      tipo_fecha: 'REAL',
      anio: null,
      mes: null,
      fecha_inicio: start,
      fecha_fin: end,
      observacion: null,
      deleted_at: null,
    };
  }
  return null;
}

function buildFallbackProgramsFromAudits(
  audits: ReadonlyArray<ProgramacionAuditEntity>
): ProgramaAuditoriaEntity[] {
  const byProgram = new Map<string, ProgramacionAuditEntity[]>();
  for (const audit of audits) {
    if (audit.deleted_at) continue;
    const progId = audit.id_programa_auditoria || `prog-${audit.id}`;
    const list = byProgram.get(progId) || [];
    const effectiveDate = resolveEffectiveLatestDateForAudit(audit);
    list.push({
      ...audit,
      latestDate: audit.latestDate ?? effectiveDate,
    });
    byProgram.set(progId, list);
  }

  const result: ProgramaAuditoriaEntity[] = [];
  for (const [progId, groupAudits] of byProgram.entries()) {
    const first = groupAudits[0];
    const isLinked = groupAudits.length > 1;
    const distinctOrgs = new Set(groupAudits.map((a) => a.id_organizacion || a.organizacion_nombre));
    const nivel: AuditLinkLevel = !isLinked
      ? 'INDIVIDUAL'
      : distinctOrgs.size > 1
      ? 'NIVEL_2_INTER_ORG'
      : 'NIVEL_1_INTRA_ORG';
    const tipo: AuditLinkNature = !isLinked
      ? 'Individual'
      : nivel === 'NIVEL_2_INTER_ORG'
      ? 'Multientidad'
      : 'Combinada';
    result.push({
      id: progId,
      codigo_programa: first?.codigo_auditoria || 'PROG-AUD',
      etiqueta: first
        ? `${first.organizacion_nombre} · ${first.numero_certificado}`
        : 'Programa de Auditoría',
      nivel_vinculacion: nivel,
      tipo_vinculacion: tipo,
      es_vinculada: isLinked,
      id_ciclo_origen: null,
      notas: null,
      auditorias: groupAudits,
      deleted_at: null,
    });
  }
  return result;
}

function resolveActivePrograms(
  props: Pick<ProgramacionViewProps, 'programs' | 'audits'>
): ProgramaAuditoriaEntity[] {
  const source =
    props.programs && props.programs.length > 0
      ? props.programs
      : buildFallbackProgramsFromAudits(props.audits);
  return source
    .filter((p) => !p.deleted_at)
    .map((p) => ({
      ...p,
      auditorias: p.auditorias.filter((a) => !a.deleted_at),
    }));
}

/**
 * Canonical Step 3.2.1 mode state machine with strict RBAC lock:
 * `CLIENT`, `AUDITOR`, and unapproved profiles always resolve to `'read'`.
 */
export function resolveProgramDetailMode(
  state: Pick<ProgramacionViewState, 'isCreating' | 'selectedProgramId' | 'isEditingAttributes'>,
  isStaff: boolean,
  selectedProgram?: ProgramaAuditoriaEntity
): ProgramDetailMode {
  if (!isStaff) return 'read';
  if (state.isCreating && !state.selectedProgramId) return 'add';
  if (selectedProgram && state.isEditingAttributes) return 'edit';
  return 'read';
}

export interface Step1CertCatalogOption {
  id: string;
  numero_certificado: string;
  id_organizacion: string;
  organizacion_nombre: string;
  norma_codigo: string;
  estatus: string;
}

function resolveStep1CertCatalogOptions(
  props: Pick<ProgramacionViewProps, 'allCertificadosDetailed' | 'certificates' | 'programs' | 'audits'>
): Step1CertCatalogOption[] {
  const byId = new Map<string, Step1CertCatalogOption>();

  const detailed =
    props.allCertificadosDetailed && props.allCertificadosDetailed.length > 0
      ? props.allCertificadosDetailed
      : props.certificates.length === 0
      ? INITIAL_CERTIFICADOS_DETAILED
      : [];

  for (const cert of detailed) {
    byId.set(cert.id, {
      id: cert.id,
      numero_certificado: cert.numero_certificado,
      id_organizacion: cert.id_organizacion,
      organizacion_nombre: cert.organizacion_nombre,
      norma_codigo: cert.norma_codigo,
      estatus: cert.estatus,
    });
  }

  for (const cert of props.certificates) {
    if (!byId.has(cert.id)) {
      byId.set(cert.id, {
        id: cert.id,
        numero_certificado: cert.numero_certificado,
        id_organizacion: cert.organizacion_id || '',
        organizacion_nombre: cert.organizacion_nombre,
        norma_codigo: cert.norma,
        estatus: cert.estatus,
      });
    }
  }

  for (const audit of [
    ...props.audits,
    ...(props.programs || []).flatMap((p) => p.auditorias),
  ]) {
    if (!byId.has(audit.id_certificado)) {
      byId.set(audit.id_certificado, {
        id: audit.id_certificado,
        numero_certificado: audit.numero_certificado,
        id_organizacion: audit.id_organizacion,
        organizacion_nombre: audit.organizacion_nombre,
        norma_codigo: audit.norma_codigo,
        estatus: 'Activo',
      });
    }
  }

  return Array.from(byId.values());
}

function resolveStep1OrgOptions(
  organizaciones: ReadonlyArray<OrganizacionEntity> | undefined,
  certs: ReadonlyArray<Step1CertCatalogOption>
): Array<{ id: string; nombre: string }> {
  const byId = new Map<string, string>();
  for (const org of organizaciones || []) {
    if (org.id && !org.deleted_at) {
      byId.set(org.id, org.nombre);
    }
  }
  for (const cert of certs) {
    if (cert.id_organizacion && !byId.has(cert.id_organizacion)) {
      byId.set(cert.id_organizacion, cert.organizacion_nombre || 'Organización');
    }
  }
  return Array.from(byId.entries())
    .map(([id, nombre]) => ({ id, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

export function suggestNextProgramCode(
  programs: ReadonlyArray<ProgramaAuditoriaEntity>
): string {
  const year = new Date().getFullYear();
  let maxSeq = 0;
  const regex = new RegExp(`^PROG-${year}-(\\d+)$`, 'i');
  for (const prog of programs) {
    const match = regex.exec((prog.codigo_programa || '').trim());
    if (match) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed) && parsed > maxSeq) maxSeq = parsed;
    }
  }
  const nextSeq = Math.max(maxSeq + 1, programs.length + 1);
  return `PROG-${year}-${String(nextSeq).padStart(3, '0')}`;
}

function matchCatalogIdByName(
  catalog: ReadonlyArray<{ id: string; label: string }>,
  labelText: string | null | undefined,
  fallbackFirst = false
): string {
  const target = normalizeAuditText(labelText);
  if (target) {
    const exact = catalog.find((item) => normalizeAuditText(item.label) === target);
    if (exact) return exact.id;
    const partial = catalog.find(
      (item) =>
        normalizeAuditText(item.label).includes(target) ||
        target.includes(normalizeAuditText(item.label))
    );
    if (partial) return partial.id;
  }
  return fallbackFirst ? catalog[0]?.id || '' : '';
}

export function createProgramStep1Draft(params: {
  mode: ProgramDetailMode;
  program?: ProgramaAuditoriaEntity;
  prefillCertId?: string | null;
  certificates: ReadonlyArray<Step1CertCatalogOption>;
  programs?: ReadonlyArray<ProgramaAuditoriaEntity>;
  tiposCatalog?: ReadonlyArray<TipoAuditoriaCatalogItem>;
  metodologiasCatalog?: ReadonlyArray<MetodologiaAuditoriaCatalogItem>;
}): ProgramStep1FormDraft {
  const {
    mode,
    program,
    prefillCertId,
    certificates,
    programs = [],
    tiposCatalog = INITIAL_TIPOS_AUDITORIA_CATALOG,
    metodologiasCatalog = INITIAL_METODOLOGIAS_CATALOG,
  } = params;

  const tiposOpts = tiposCatalog.map((t) => ({ id: t.id, label: t.tipo }));
  const metOpts = metodologiasCatalog.map((m) => ({ id: m.id, label: m.metodologia }));
  const now = new Date();
  const defaultAnio = String(now.getFullYear());
  const defaultMes = String(now.getMonth() + 1);

  if (mode !== 'add' && program) {
    const firstOrgId =
      program.auditorias[0]?.id_organizacion ||
      certificates.find((c) => c.id === program.auditorias[0]?.id_certificado)?.id_organizacion ||
      '';
    return {
      nivel_vinculacion: program.nivel_vinculacion,
      tipo_vinculacion: program.tipo_vinculacion,
      id_ciclo_origen: program.id_ciclo_origen || '',
      etiqueta: program.etiqueta,
      codigo_programa: program.codigo_programa || '',
      notas: program.notas || '',
      selectedOrgId: program.nivel_vinculacion === 'NIVEL_1_INTRA_ORG' ? firstOrgId : '',
      pendingAddCertId: '',
      certificates: program.auditorias.map((audit) => ({
        id_certificado: audit.id_certificado,
        codigo_auditoria: audit.codigo_auditoria || '',
        id_tipo_auditoria: matchCatalogIdByName(tiposOpts, audit.tipo_auditoria, false),
        id_metodologia: matchCatalogIdByName(metOpts, audit.metodologia, false),
        estado_ciclo: audit.estado_ciclo || 'Borrador',
        objetivo: audit.objetivo || '',
      })),
      initialDateMode: 'NONE',
      initialDateAnio: defaultAnio,
      initialDateMes: defaultMes,
      initialDateInicio: '',
      initialDateFin: '',
      initialDateObservacion: '',
    };
  }

  const prefillCert = prefillCertId
    ? certificates.find((c) => c.id === prefillCertId)
    : undefined;
  const defaultTipoId =
    matchCatalogIdByName(tiposOpts, 'Renovación', false) ||
    matchCatalogIdByName(tiposOpts, 'Etapa 1', true);
  const defaultMetId =
    matchCatalogIdByName(metOpts, 'Presencial', false) || metOpts[0]?.id || '';
  const year = now.getFullYear();

  const initialCertRows: ProgramStep1CertDraft[] = prefillCert
    ? [
        {
          id_certificado: prefillCert.id,
          codigo_auditoria: `AUD-${year}-${prefillCert.numero_certificado.replace(/[^a-zA-Z0-9-]/g, '').slice(-6)}-01`,
          id_tipo_auditoria: defaultTipoId,
          id_metodologia: defaultMetId,
          estado_ciclo: 'En Programación',
          objetivo: '',
        },
      ]
    : [
        {
          id_certificado: '',
          codigo_auditoria: '',
          id_tipo_auditoria: defaultTipoId,
          id_metodologia: defaultMetId,
          estado_ciclo: 'En Programación',
          objetivo: '',
        },
      ];

  return {
    nivel_vinculacion: 'INDIVIDUAL',
    tipo_vinculacion: 'Individual',
    id_ciclo_origen: '',
    etiqueta: prefillCert
      ? `${prefillCert.organizacion_nombre} · ${prefillCert.numero_certificado}`
      : '',
    codigo_programa: suggestNextProgramCode(programs),
    notas: '',
    selectedOrgId: prefillCert?.id_organizacion || '',
    pendingAddCertId: '',
    certificates: initialCertRows,
    initialDateMode: 'NONE',
    initialDateAnio: defaultAnio,
    initialDateMes: defaultMes,
    initialDateInicio: '',
    initialDateFin: '',
    initialDateObservacion: '',
  };
}

function applyProgramProfileIsolation(
  program: ProgramaAuditoriaEntity,
  profile: UserProfile,
  authorizedClientOrgIds?: ReadonlyArray<string>
): ProgramaAuditoriaEntity {
  if (profile.role !== 'CLIENT' || profile.status !== 'APPROVED') {
    return program;
  }
  if (authorizedClientOrgIds === undefined) {
    return program;
  }
  const allowedOrgs = new Set(authorizedClientOrgIds);
  return {
    ...program,
    auditorias: program.auditorias.filter((a) => !a.deleted_at && allowedOrgs.has(a.id_organizacion)),
  };
}

export function renderProgramacionView(props: ProgramacionViewProps): string {
  const {
    profile,
    state,
    audits,
    auditors,
    findings = [],
    authorizedClientOrgIds,
    loading = false,
    archiveConfig,
  } = props;
  const canPlan = canEditAuditScheduleOrTeam(profile);
  const resolvedPrograms = resolveActivePrograms(props);

  // Precedence 1 (Creation): 'add' mode on ProgramaAuditoria 3-Zone Detail View
  if (state.isCreating && !state.selectedProgramId && canPlan) {
    return renderProgramDetailPage({
      props,
      mode: 'add',
      resolvedPrograms,
    });
  }

  // Precedence 2 (Program Detail): 'read' | 'edit' mode on ProgramaAuditoria 3-Zone Detail View
  if (state.selectedProgramId) {
    const rawProgram = resolvedPrograms.find((p) => p.id === state.selectedProgramId);
    if (rawProgram) {
      const scopedProgram = applyProgramProfileIsolation(
        rawProgram,
        profile,
        authorizedClientOrgIds
      );
      const mode = resolveProgramDetailMode(state, canPlan, scopedProgram);
      return renderProgramDetailPage({
        props,
        mode,
        selectedProgram: scopedProgram,
        resolvedPrograms,
      });
    }
  }

  // Precedence 3 (Direct audit event drilldown backward-compatibility)
  if (state.selectedAuditId) {
    const allAuditsPool = [
      ...audits,
      ...resolvedPrograms.flatMap((p) => p.auditorias),
    ];
    const selected = allAuditsPool.find((a) => a.id === state.selectedAuditId);
    if (selected) {
      return renderProgramacionDetailView(profile, state, selected, auditors, findings);
    }
  }

  return renderProgramacionDirectoryView(
    props,
    resolvedPrograms,
    loading,
    archiveConfig
  );
}

const MONTH_SELECT_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1, label: 'Enero' },
  { value: 2, label: 'Febrero' },
  { value: 3, label: 'Marzo' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Mayo' },
  { value: 6, label: 'Junio' },
  { value: 7, label: 'Julio' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Septiembre' },
  { value: 10, label: 'Octubre' },
  { value: 11, label: 'Noviembre' },
  { value: 12, label: 'Diciembre' },
];

function getNivelVinculacionLabel(nivel: AuditLinkLevel): string {
  if (nivel === 'NIVEL_1_INTRA_ORG') return 'Nivel 1 — Intra-Organización';
  if (nivel === 'NIVEL_2_INTER_ORG') return 'Nivel 2 — Inter-Organización';
  return 'Individual';
}

function renderProgramStepperBar(params: {
  mode: ProgramDetailMode;
  activeStep: ProgramDetailStep;
}): string {
  const { mode, activeStep } = params;
  const isAdd = mode === 'add';
  const step1Active = activeStep === 1;
  const step2Active = activeStep === 2;

  return `
    <nav aria-label="Pasos de planificación del programa" class="flex flex-wrap items-center gap-2 pb-2.5 border-b border-slate-200/80">
      <button
        type="button"
        data-action="set-program-step"
        data-step="1"
        aria-current="${step1Active ? 'step' : 'false'}"
        class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
          step1Active
            ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
        }"
      >
        <span class="inline-flex items-center justify-center w-5 h-5 rounded-md text-[11px] font-bold ${
          step1Active ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-700'
        }">1</span>
        <span>Paso 1: Vinculación y Alcance</span>
      </button>

      <span class="text-slate-300 text-xs select-none" aria-hidden="true">→</span>

      <button
        type="button"
        ${isAdd ? 'disabled' : 'data-action="set-program-step" data-step="2"'}
        aria-current="${step2Active ? 'step' : 'false'}"
        title="${
          isAdd
            ? 'Guarde el Paso 1 para habilitar la programación operativa del Paso 2'
            : 'Ir a Paso 2: Fechas, Sitios y Auditores'
        }"
        class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
          isAdd
            ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
            : step2Active
            ? 'bg-indigo-700 text-white border-indigo-700 shadow-2xs cursor-pointer'
            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 cursor-pointer'
        }"
      >
        <span class="inline-flex items-center justify-center w-5 h-5 rounded-md text-[11px] font-bold ${
          isAdd
            ? 'bg-slate-200 text-slate-500'
            : step2Active
            ? 'bg-white/15 text-white'
            : 'bg-slate-100 text-slate-700'
        }">2</span>
        <span>Paso 2: Fechas, Sitios y Auditores</span>
      </button>
    </nav>
  `;
}

function renderProgramDetailPage(params: {
  props: ProgramacionViewProps;
  mode: ProgramDetailMode;
  selectedProgram?: ProgramaAuditoriaEntity;
  resolvedPrograms: ProgramaAuditoriaEntity[];
}): string {
  const { props, mode, selectedProgram, resolvedPrograms } = params;
  const { profile, state, auditors, findings = [] } = props;
  const isStaff = canEditAuditScheduleOrTeam(profile);
  const canArchive = canArchiveRecord(profile);
  const isReadOnly = mode === 'read';
  const activeStep: ProgramDetailStep =
    mode === 'add' || mode === 'edit' ? 1 : state.activeStep === 2 ? 2 : 1;

  const certOptions = resolveStep1CertCatalogOptions(props);
  const orgOptions = resolveStep1OrgOptions(props.organizaciones, certOptions);
  const tiposCatalog =
    props.tiposCatalog && props.tiposCatalog.length > 0
      ? props.tiposCatalog
      : INITIAL_TIPOS_AUDITORIA_CATALOG;
  const metodologiasCatalog =
    props.metodologiasCatalog && props.metodologiasCatalog.length > 0
      ? props.metodologiasCatalog
      : INITIAL_METODOLOGIAS_CATALOG;

  const draft: ProgramStep1FormDraft =
    state.step1Draft && (mode === 'add' || mode === 'edit')
      ? state.step1Draft
      : createProgramStep1Draft({
          mode,
          program: selectedProgram,
          prefillCertId: state.prefillCertId,
          certificates: certOptions,
          programs: resolvedPrograms,
          tiposCatalog,
          metodologiasCatalog,
        });

  const nivel = draft.nivel_vinculacion;
  const tipo = nivel === 'INDIVIDUAL' ? 'Individual' : draft.tipo_vinculacion;
  const linkBadge = getProgramLinkingBadgeMeta(nivel, tipo);

  const planningStatus = selectedProgram
    ? computeProgramPlanningStatus(selectedProgram)
    : null;

  const title =
    mode === 'add'
      ? 'Nuevo Programa de Auditoría'
      : selectedProgram?.etiqueta || 'Programa de Auditoría';

  const eyebrowCode =
    mode === 'add'
      ? draft.codigo_programa.trim() || 'BORRADOR'
      : selectedProgram?.codigo_programa || 'PROGRAMA';

  const originPrograms = resolvedPrograms.filter(
    (p) => !p.deleted_at && p.id !== selectedProgram?.id
  );
  const matchedOrigin = draft.id_ciclo_origen
    ? originPrograms.find((p) => p.id === draft.id_ciclo_origen)
    : undefined;

  const stepperHtml = renderProgramStepperBar({ mode, activeStep });

  const selectClass = isReadOnly
    ? 'w-full rounded-lg border border-slate-200 bg-slate-100/80 text-slate-800 cursor-not-allowed px-2.5 py-1.5 text-xs font-semibold truncate'
    : 'w-full rounded-lg border border-slate-300 bg-white text-slate-900 px-2.5 py-1.5 text-xs font-semibold focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none truncate';

  const inputClass = isReadOnly
    ? 'w-full px-3 py-1.5 bg-slate-100/80 border border-slate-200 rounded-lg text-xs text-slate-800 font-semibold cursor-not-allowed'
    : 'w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 font-semibold focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none';

  const linkedNatures = AUDIT_LINK_NATURES.filter((n) => n !== 'Individual');

  // ZONE 1: Naturaleza y Ciclo
  const zone1Step1Html = `
    ${stepperHtml}
    <div class="grid grid-cols-1 md:grid-cols-3 gap-2.5">
      <div class="${isReadOnly ? 'bg-slate-50/70 border-slate-200/90' : 'bg-slate-50/90 border-indigo-200'} border rounded-xl p-2.5 sm:p-3 space-y-1.5 min-w-0">
        <label for="progNivelVinculacionSelect" class="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1 truncate">
          <span aria-hidden="true">🔗</span>
          <span class="truncate">Nivel de Vinculación</span>
          <span class="text-rose-600 shrink-0" aria-hidden="true">*</span>
        </label>
        <select
          id="progNivelVinculacionSelect"
          name="nivel_vinculacion"
          form="programaAuditDetailForm"
          required
          ${isReadOnly ? 'disabled' : ''}
          class="${selectClass}"
        >
          ${AUDIT_LINK_LEVELS.map(
            (lvl) =>
              `<option value="${escapeHtml(lvl)}" ${nivel === lvl ? 'selected' : ''}>${escapeHtml(
                getNivelVinculacionLabel(lvl)
              )}</option>`
          ).join('')}
        </select>
      </div>

      <div class="${isReadOnly ? 'bg-slate-50/70 border-slate-200/90' : 'bg-slate-50/90 border-indigo-200'} border rounded-xl p-2.5 sm:p-3 space-y-1.5 min-w-0">
        <label for="progTipoVinculacionSelect" class="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1 truncate">
          <span aria-hidden="true">🧩</span>
          <span class="truncate">Naturaleza del Programa</span>
          <span class="text-rose-600 shrink-0" aria-hidden="true">*</span>
        </label>
        <select
          id="progTipoVinculacionSelect"
          name="tipo_vinculacion"
          form="programaAuditDetailForm"
          required
          ${isReadOnly || nivel === 'INDIVIDUAL' ? 'disabled' : ''}
          class="${
            isReadOnly || nivel === 'INDIVIDUAL'
              ? 'w-full rounded-lg border border-slate-200 bg-slate-100/80 text-slate-800 cursor-not-allowed px-2.5 py-1.5 text-xs font-semibold truncate'
              : selectClass
          }"
        >
          ${
            nivel === 'INDIVIDUAL'
              ? `<option value="Individual" selected>Individual (Fijo)</option>`
              : linkedNatures
                  .map(
                    (nat) =>
                      `<option value="${escapeHtml(nat)}" ${tipo === nat ? 'selected' : ''}>${escapeHtml(
                        nat
                      )}</option>`
                  )
                  .join('')
          }
        </select>
      </div>

      <div class="${isReadOnly ? 'bg-slate-50/70 border-slate-200/90' : 'bg-slate-50/90 border-indigo-200'} border rounded-xl p-2.5 sm:p-3 space-y-1.5 min-w-0">
        <div class="flex items-center justify-between gap-2">
          <label for="progCicloOrigenSelect" class="text-[10px] font-bold uppercase tracking-wider text-slate-500 inline-flex items-center gap-1 min-w-0 truncate">
            <span aria-hidden="true">♻️</span>
            <span class="truncate">Evolución de Ciclo Anterior</span>
          </label>
          ${
            isReadOnly && matchedOrigin
              ? `
                <button
                  type="button"
                  data-action="open-origin-program"
                  data-program-id="${escapeHtml(matchedOrigin.id)}"
                  title="Abrir programa origen: ${escapeHtml(matchedOrigin.etiqueta)}"
                  aria-label="Abrir programa origen"
                  class="inline-flex items-center justify-center w-5 h-5 rounded border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-600 hover:text-indigo-800 text-[11px] font-bold transition-colors cursor-pointer shrink-0"
                >
                  →
                </button>
              `
              : ''
          }
        </div>
        <select
          id="progCicloOrigenSelect"
          name="id_ciclo_origen"
          form="programaAuditDetailForm"
          ${isReadOnly ? 'disabled' : ''}
          class="${selectClass}"
        >
          <option value="" ${draft.id_ciclo_origen === '' ? 'selected' : ''}>Ninguno (Nuevo ciclo)</option>
          ${originPrograms
            .map(
              (orig) =>
                `<option value="${escapeHtml(orig.id)}" ${
                  draft.id_ciclo_origen === orig.id ? 'selected' : ''
                }>${escapeHtml(
                  `${orig.codigo_programa || 'PROGRAMA'} — ${orig.etiqueta}`
                )}</option>`
            )
            .join('')}
        </select>
      </div>
    </div>
  `;

  const zone1Step2SummaryHtml = `
    ${stepperHtml}
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Nivel y Naturaleza</div>
        <div class="font-bold text-slate-900">${escapeHtml(getNivelVinculacionLabel(nivel))} · ${escapeHtml(tipo)}</div>
      </div>
      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Certificados en Campaña</div>
        <div class="font-bold text-slate-900">${selectedProgram?.auditorias.length || 0} certificado(s)</div>
      </div>
      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Evolución de Ciclo</div>
        <div class="font-bold text-slate-900 truncate">
          ${
            matchedOrigin
              ? `<button type="button" data-action="open-origin-program" data-program-id="${escapeHtml(matchedOrigin.id)}" class="text-indigo-700 hover:underline cursor-pointer">${escapeHtml(matchedOrigin.codigo_programa || matchedOrigin.etiqueta)} →</button>`
              : 'Nuevo ciclo independiente'
          }
        </div>
      </div>
    </div>
  `;

  // ZONE 2: Paso 1 Master Form + Certificate Builder
  const prefillCert =
    mode === 'add' && state.prefillCertId
      ? certOptions.find((c) => c.id === state.prefillCertId)
      : undefined;

  const prefillCalloutHtml = prefillCert
    ? `
      <div class="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 space-y-1">
        <div class="text-[10px] font-bold uppercase tracking-wider text-indigo-700">
          Certificado Preseleccionado desde Sin Programación
        </div>
        <div class="flex flex-wrap items-center gap-2 text-xs">
          <span class="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-indigo-200">
            ${escapeHtml(prefillCert.numero_certificado)}
          </span>
          <span class="font-bold text-slate-900">${escapeHtml(prefillCert.organizacion_nombre)}</span>
          ${
            prefillCert.norma_codigo
              ? `<span class="px-2 py-0.5 rounded bg-white border border-slate-200 font-semibold text-slate-700">${escapeHtml(
                  prefillCert.norma_codigo
                )}</span>`
              : ''
          }
          ${
            prefillCert.estatus
              ? `<span class="px-2 py-0.5 rounded-full bg-slate-900 text-white text-[11px] font-semibold">${escapeHtml(
                  prefillCert.estatus
                )}</span>`
              : ''
          }
        </div>
      </div>
    `
    : '';

  const errorBannerHtml = state.editErrorMessage
    ? `
      <div role="alert" class="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
        ⚠️ ${escapeHtml(state.editErrorMessage)}
      </div>
    `
    : '';

  const canCrossCert =
    canAccessRoute(profile, 'certificacion') ||
    (profile.role === 'AUDITOR' && profile.status === 'APPROVED');

  const certById = new Map(certOptions.map((c) => [c.id, c]));

  const renderCertConfigCard = (
    row: ProgramStep1CertDraft,
    index: number,
    allowRemove: boolean
  ): string => {
    const certMeta = certById.get(row.id_certificado);
    const matchedAudit = selectedProgram?.auditorias.find(
      (a) => a.id_certificado === row.id_certificado
    );
    const certNumber =
      certMeta?.numero_certificado || matchedAudit?.numero_certificado || 'Certificado por asignar';
    const orgName =
      certMeta?.organizacion_nombre || matchedAudit?.organizacion_nombre || 'Organización';
    const normaCode = certMeta?.norma_codigo || matchedAudit?.norma_codigo || '';

    const cycleStatuses = Array.from(VALID_AUDIT_CYCLE_STATUSES);

    return `
      <div
        data-step1-cert-row="${index}"
        class="bg-white border border-slate-200 rounded-xl p-3 space-y-2.5 shadow-2xs"
      >
        <div class="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
          <div class="flex flex-wrap items-center gap-2 min-w-0">
            <span class="font-mono text-xs font-bold text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
              📜 ${escapeHtml(certNumber)}
            </span>
            <span class="text-xs font-bold text-slate-900 truncate">${escapeHtml(orgName)}</span>
            ${
              normaCode
                ? `<span class="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[11px] font-semibold text-slate-700">${escapeHtml(
                    normaCode
                  )}</span>`
                : ''
            }
          </div>
          <div class="flex items-center gap-2 shrink-0">
            ${
              isReadOnly && row.id_certificado && canCrossCert
                ? `
                  <button
                    type="button"
                    data-action="open-cert-from-audit"
                    data-cert-id="${escapeHtml(row.id_certificado)}"
                    class="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 hover:underline cursor-pointer"
                  >
                    Certificado →
                  </button>
                `
                : ''
            }
            ${
              !isReadOnly && allowRemove
                ? `
                  <button
                    type="button"
                    data-action="remove-step1-cert"
                    data-cert-index="${index}"
                    title="Retirar certificado del programa"
                    aria-label="Retirar certificado"
                    class="inline-flex items-center justify-center w-6 h-6 rounded-md border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold cursor-pointer"
                  >
                    ✕
                  </button>
                `
                : ''
            }
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div class="space-y-1">
            <label for="progCertCodeInput-${index}" class="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Código de Auditoría
            </label>
            <input
              type="text"
              id="progCertCodeInput-${index}"
              data-step1-cert-field="codigo_auditoria"
              data-cert-index="${index}"
              value="${escapeHtml(row.codigo_auditoria)}"
              maxlength="40"
              placeholder="Ej. AUD-2026-001"
              ${isReadOnly ? 'disabled' : ''}
              class="${inputClass} font-mono"
            />
          </div>

          <div class="space-y-1">
            <label for="progCertTipoSelect-${index}" class="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Tipo de Auditoría
            </label>
            <select
              id="progCertTipoSelect-${index}"
              data-step1-cert-field="id_tipo_auditoria"
              data-cert-index="${index}"
              ${isReadOnly ? 'disabled' : ''}
              class="${selectClass}"
            >
              <option value="" ${row.id_tipo_auditoria === '' ? 'selected' : ''}>Por definir</option>
              ${tiposCatalog
                .map(
                  (t) =>
                    `<option value="${escapeHtml(t.id)}" ${
                      row.id_tipo_auditoria === t.id ? 'selected' : ''
                    }>${escapeHtml(t.tipo)}</option>`
                )
                .join('')}
            </select>
          </div>

          <div class="space-y-1">
            <label for="progCertMetSelect-${index}" class="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Metodología
            </label>
            <select
              id="progCertMetSelect-${index}"
              data-step1-cert-field="id_metodologia"
              data-cert-index="${index}"
              ${isReadOnly ? 'disabled' : ''}
              class="${selectClass}"
            >
              <option value="" ${row.id_metodologia === '' ? 'selected' : ''}>Por definir</option>
              ${metodologiasCatalog
                .map(
                  (m) =>
                    `<option value="${escapeHtml(m.id)}" ${
                      row.id_metodologia === m.id ? 'selected' : ''
                    }>${escapeHtml(m.metodologia)}</option>`
                )
                .join('')}
            </select>
          </div>

          <div class="space-y-1">
            <label for="progCertEstadoSelect-${index}" class="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Estado de Ciclo
            </label>
            <select
              id="progCertEstadoSelect-${index}"
              data-step1-cert-field="estado_ciclo"
              data-cert-index="${index}"
              ${isReadOnly ? 'disabled' : ''}
              class="${selectClass}"
            >
              ${cycleStatuses
                .map(
                  (st) =>
                    `<option value="${escapeHtml(st)}" ${
                      row.estado_ciclo === st ? 'selected' : ''
                    }>${escapeHtml(st)}</option>`
                )
                .join('')}
            </select>
          </div>
        </div>
      </div>
    `;
  };

  let certBuilderHtml = '';
  if (isReadOnly) {
    certBuilderHtml =
      draft.certificates.length > 0
        ? `
          <div class="space-y-2.5">
            ${draft.certificates.map((row, idx) => renderCertConfigCard(row, idx, false)).join('')}
          </div>
        `
        : `
          <div class="p-4 rounded-xl bg-white border border-slate-200 text-xs text-slate-500">
            No hay certificados visibles vinculados a este programa bajo su alcance organizacional.
          </div>
        `;
  } else if (nivel === 'INDIVIDUAL') {
    const selectedCertId = draft.certificates[0]?.id_certificado || '';
    const singleRow: ProgramStep1CertDraft = draft.certificates[0] || {
      id_certificado: '',
      codigo_auditoria: '',
      id_tipo_auditoria: tiposCatalog[0]?.id || '',
      id_metodologia: metodologiasCatalog[0]?.id || '',
      estado_ciclo: 'En Programación',
      objetivo: '',
    };

    certBuilderHtml = `
      <div class="space-y-3">
        <div class="space-y-1">
          <label for="progIndividualCertSelect" class="block text-xs font-bold text-slate-700">
            Certificado a Programar <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <select id="progIndividualCertSelect" name="individual_cert_id" required class="${selectClass}">
            <option value="" ${selectedCertId === '' ? 'selected' : ''}>Seleccione un certificado...</option>
            ${certOptions
              .map(
                (c) =>
                  `<option value="${escapeHtml(c.id)}" ${
                    selectedCertId === c.id ? 'selected' : ''
                  }>${escapeHtml(`${c.numero_certificado} · ${c.organizacion_nombre} (${c.norma_codigo})`)}</option>`
              )
              .join('')}
          </select>
        </div>
        ${selectedCertId ? renderCertConfigCard(singleRow, 0, false) : ''}
      </div>
    `;
  } else if (nivel === 'NIVEL_1_INTRA_ORG') {
    const resolvedOrgId =
      draft.selectedOrgId ||
      certById.get(draft.certificates[0]?.id_certificado || '')?.id_organizacion ||
      orgOptions[0]?.id ||
      '';
    const orgCerts = certOptions.filter((c) => c.id_organizacion === resolvedOrgId);
    const selectedCertIds = new Set(draft.certificates.map((c) => c.id_certificado));

    certBuilderHtml = `
      <div class="space-y-3">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
          <div class="space-y-1">
            <label for="progNivel1OrgSelect" class="block text-xs font-bold text-slate-700">
              Organización Titular (Misma Organización) <span class="text-rose-600" aria-hidden="true">*</span>
            </label>
            <select id="progNivel1OrgSelect" name="nivel1_org_id" class="${selectClass}">
              <option value="" ${resolvedOrgId === '' ? 'selected' : ''}>Seleccione organización...</option>
              ${orgOptions
                .map(
                  (org) =>
                    `<option value="${escapeHtml(org.id)}" ${
                      resolvedOrgId === org.id ? 'selected' : ''
                    }>${escapeHtml(org.nombre)}</option>`
                )
                .join('')}
            </select>
          </div>
          <div class="text-xs text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-2 flex items-center justify-between">
            <span>Certificados seleccionados:</span>
            <span class="font-bold ${draft.certificates.length >= 2 ? 'text-emerald-700' : 'text-amber-700'}">
              ${draft.certificates.length} seleccionado(s)
            </span>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          ${
            orgCerts.length > 0
              ? orgCerts
                  .map((cert) => {
                    const isChecked = selectedCertIds.has(cert.id);
                    return `
                      <label class="flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                        isChecked
                          ? 'bg-indigo-50/70 border-indigo-300 text-slate-900'
                          : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                      }">
                        <input
                          type="checkbox"
                          data-action="toggle-nivel1-cert"
                          data-cert-id="${escapeHtml(cert.id)}"
                          ${isChecked ? 'checked' : ''}
                          class="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                        />
                        <div class="min-w-0">
                          <div class="font-mono text-xs font-bold text-slate-900 truncate">${escapeHtml(
                            cert.numero_certificado
                          )}</div>
                          <div class="text-[11px] text-slate-500 truncate">${escapeHtml(
                            cert.norma_codigo
                          )} · ${escapeHtml(cert.estatus)}</div>
                        </div>
                      </label>
                    `;
                  })
                  .join('')
              : `<div class="col-span-full p-3 rounded-lg bg-white border border-slate-200 text-xs text-slate-500">Esta organización no tiene certificados registrados disponibles.</div>`
          }
        </div>

        ${
          draft.certificates.length > 0
            ? `<div class="space-y-2.5">${draft.certificates
                .map((row, idx) => renderCertConfigCard(row, idx, true))
                .join('')}</div>`
            : ''
        }
      </div>
    `;
  } else {
    // NIVEL_2_INTER_ORG: Multi-organization aggregator
    const selectedCertIds = new Set(draft.certificates.map((c) => c.id_certificado));
    const resolvedAdderOrgId = draft.selectedOrgId || orgOptions[0]?.id || '';
    const availableCertsForOrg = certOptions.filter(
      (c) => (!resolvedAdderOrgId || c.id_organizacion === resolvedAdderOrgId) && !selectedCertIds.has(c.id)
    );
    const distinctSelectedOrgs = new Set(
      draft.certificates
        .map((r) => certById.get(r.id_certificado)?.id_organizacion || '')
        .filter(Boolean)
    );

    certBuilderHtml = `
      <div class="space-y-3">
        <div class="bg-white border border-indigo-200 rounded-xl p-3 space-y-2.5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-xs font-bold text-slate-800">
              Agregador Multi-Organización (Nivel 2 Inter-Org)
            </span>
            <span class="text-[11px] font-bold ${
              distinctSelectedOrgs.size >= 2 ? 'text-emerald-700' : 'text-amber-700'
            }">
              ${distinctSelectedOrgs.size} organización(es) · ${draft.certificates.length} certificado(s)
            </span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
            <div class="md:col-span-5 space-y-1">
              <label for="progNivel2OrgSelect" class="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                1. Organización
              </label>
              <select id="progNivel2OrgSelect" class="${selectClass}">
                <option value="" ${resolvedAdderOrgId === '' ? 'selected' : ''}>Todas las organizaciones</option>
                ${orgOptions
                  .map(
                    (org) =>
                      `<option value="${escapeHtml(org.id)}" ${
                        resolvedAdderOrgId === org.id ? 'selected' : ''
                      }>${escapeHtml(org.nombre)}</option>`
                  )
                  .join('')}
              </select>
            </div>
            <div class="md:col-span-5 space-y-1">
              <label for="progNivel2CertSelect" class="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                2. Certificado Disponible
              </label>
              <select id="progNivel2CertSelect" class="${selectClass}">
                <option value="">Seleccione certificado...</option>
                ${availableCertsForOrg
                  .map(
                    (c) =>
                      `<option value="${escapeHtml(c.id)}" ${
                        draft.pendingAddCertId === c.id ? 'selected' : ''
                      }>${escapeHtml(`${c.numero_certificado} · ${c.norma_codigo}`)}</option>`
                  )
                  .join('')}
              </select>
            </div>
            <div class="md:col-span-2">
              <button
                type="button"
                id="addNivel2CertBtn"
                class="w-full px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                + Agregar
              </button>
            </div>
          </div>
        </div>

        ${
          draft.certificates.length > 0
            ? `<div class="space-y-2.5">${draft.certificates
                .map((row, idx) => renderCertConfigCard(row, idx, true))
                .join('')}</div>`
            : `<div class="p-4 rounded-xl bg-white border border-slate-200 text-xs text-slate-500">Agregue certificados de al menos 2 organizaciones distintas para conformar el programa Nivel 2.</div>`
        }
      </div>
    `;
  }

  const initialDateSectionHtml =
    mode === 'add'
      ? `
        <div class="bg-slate-50/70 p-3 sm:p-3.5 border border-slate-200/90 rounded-xl space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span class="block text-xs font-bold text-slate-800">
                Fecha Inicial (#1) — Opcional
              </span>
              <span class="text-[11px] text-slate-500">
                Capture un estimado Mes/Año o un rango exacto inicial al crear el programa.
              </span>
            </div>
            <div class="w-full sm:w-64">
              <select id="progInitialDateModeSelect" name="initial_date_mode" class="${selectClass}">
                <option value="NONE" ${draft.initialDateMode === 'NONE' ? 'selected' : ''}>Sin fecha inicial (definir en Paso 2)</option>
                <option value="PREPROGRAMADA_MES" ${draft.initialDateMode === 'PREPROGRAMADA_MES' ? 'selected' : ''}>Pre-programada (Mes / Año)</option>
                <option value="REAL" ${draft.initialDateMode === 'REAL' ? 'selected' : ''}>Fechas Exactas (Real)</option>
              </select>
            </div>
          </div>

          ${
            draft.initialDateMode === 'PREPROGRAMADA_MES'
              ? `
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  <div class="space-y-1">
                    <label for="progInitialDateAnioInput" class="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Año *</label>
                    <input type="number" id="progInitialDateAnioInput" min="2020" max="2040" value="${escapeHtml(draft.initialDateAnio)}" class="${inputClass} font-mono" />
                  </div>
                  <div class="space-y-1">
                    <label for="progInitialDateMesSelect" class="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Mes *</label>
                    <select id="progInitialDateMesSelect" class="${selectClass}">
                      ${MONTH_SELECT_OPTIONS.map(
                        (m) =>
                          `<option value="${m.value}" ${
                            Number(draft.initialDateMes) === m.value ? 'selected' : ''
                          }>${escapeHtml(m.label)}</option>`
                      ).join('')}
                    </select>
                  </div>
                  <div class="space-y-1">
                    <label for="progInitialDateObsInput" class="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Observación</label>
                    <input type="text" id="progInitialDateObsInput" value="${escapeHtml(draft.initialDateObservacion)}" placeholder="Ventana estimada..." class="${inputClass}" />
                  </div>
                </div>
              `
              : draft.initialDateMode === 'REAL'
              ? `
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  <div class="space-y-1">
                    <label for="progInitialDateInicioInput" class="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Fecha Inicio *</label>
                    <input type="date" id="progInitialDateInicioInput" value="${escapeHtml(draft.initialDateInicio)}" class="${inputClass} font-mono" />
                  </div>
                  <div class="space-y-1">
                    <label for="progInitialDateFinInput" class="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Fecha Fin *</label>
                    <input type="date" id="progInitialDateFinInput" value="${escapeHtml(draft.initialDateFin)}" class="${inputClass} font-mono" />
                  </div>
                  <div class="space-y-1">
                    <label for="progInitialDateObsInput" class="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Observación</label>
                    <input type="text" id="progInitialDateObsInput" value="${escapeHtml(draft.initialDateObservacion)}" placeholder="Programación inicial..." class="${inputClass}" />
                  </div>
                </div>
              `
              : ''
          }
        </div>
      `
      : '';

  const zone2Step1Html = `
    <form id="programaAuditDetailForm" class="space-y-3">
      ${errorBannerHtml}
      ${prefillCalloutHtml}

      <div class="bg-slate-50/70 p-3 sm:p-3.5 border border-slate-200/90 rounded-xl space-y-3">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="space-y-1">
            <label for="progEtiquetaInput" class="block text-xs font-bold text-slate-700">
              Etiqueta del Programa <span class="text-rose-600" aria-hidden="true">*</span>
            </label>
            <input
              type="text"
              id="progEtiquetaInput"
              name="etiqueta"
              value="${escapeHtml(draft.etiqueta)}"
              placeholder="Ej. Planta Santa Cruz"
              required
              minlength="2"
              maxlength="180"
              ${isReadOnly ? 'disabled' : ''}
              class="${inputClass}"
            />
          </div>
          <div class="space-y-1">
            <label for="progCodigoInput" class="block text-xs font-bold text-slate-700">
              Código de Programa
            </label>
            <input
              type="text"
              id="progCodigoInput"
              name="codigo_programa"
              value="${escapeHtml(draft.codigo_programa)}"
              placeholder="Ej. PROG-2026-001"
              maxlength="40"
              ${isReadOnly ? 'disabled' : ''}
              class="${inputClass} font-mono"
            />
          </div>
        </div>

        <div class="space-y-1">
          <label for="progNotasTextarea" class="block text-xs font-bold text-slate-700">
            Notas de la Campaña
          </label>
          <textarea
            id="progNotasTextarea"
            name="notas"
            rows="2"
            placeholder="Observaciones generales del programa de auditoría..."
            ${isReadOnly ? 'disabled' : ''}
            class="${
              isReadOnly
                ? 'w-full p-2.5 bg-slate-100/80 border border-slate-200 rounded-lg text-xs text-slate-800 cursor-not-allowed resize-none'
                : 'w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none'
            }"
          >${escapeHtml(draft.notas)}</textarea>
        </div>
      </div>

      <div class="bg-slate-50/70 p-3 sm:p-3.5 border border-slate-200/90 rounded-xl space-y-2.5">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-bold text-slate-800">
            Certificados Participantes (${draft.certificates.length})
          </span>
        </div>
        ${certBuilderHtml}
      </div>

      ${initialDateSectionHtml}
    </form>
  `;

  // ZONE 2 when Step 2 is active in 'read' mode
  const activeCampaignAudits = selectedProgram?.auditorias || [];
  const activeCampaignAudit =
    activeCampaignAudits.find((a) => a.id === state.selectedAuditId) ||
    activeCampaignAudits[0];

  const zone2Step2Html = `
    <div class="bg-slate-50/70 p-3 sm:p-3.5 border border-slate-200/90 rounded-xl space-y-2.5">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="space-y-0.5">
          <div class="text-xs font-bold text-slate-900">
            Paso 2 · Programación Operativa de la Campaña
          </div>
          <p class="text-[11px] text-slate-500">
            ${
              activeCampaignAudits.length >= 2
                ? 'Seleccione un certificado participante para revisar su equipo evaluador, sedes y hallazgos.'
                : 'Revise la asignación de equipo, sedes de muestreo y matriz normativa del certificado.'
            }
          </p>
        </div>
        <button
          type="button"
          data-action="set-program-step"
          data-step="1"
          class="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
        >
          ← Ver Vinculación (Paso 1)
        </button>
      </div>
      ${
        activeCampaignAudits.length >= 2
          ? `
            <div class="flex flex-wrap gap-2 pt-1">
              ${activeCampaignAudits
                .map((aud) => {
                  const isCurrent = aud.id === activeCampaignAudit?.id;
                  return `
                    <button
                      type="button"
                      data-action="select-prog-campaign-audit"
                      data-audit-id="${escapeHtml(aud.id)}"
                      class="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                        isCurrent
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }"
                    >
                      ${escapeHtml(aud.numero_certificado)} · ${escapeHtml(aud.norma_codigo)}
                    </button>
                  `;
                })
                .join('')}
            </div>
          `
          : ''
      }
    </div>
  `;

  // Top-right actions:
  // 'add' | 'edit': ONLY Save (FIRST, emerald) and Cancel (SECOND, rose) — hides edit/history/archive!
  // 'read': editActionButton [✏️] + [🕒] + [🗄️]
  const topEditCancelActionsHtml =
    mode === 'add' || mode === 'edit'
      ? `
        <button
          type="submit"
          form="programaAuditDetailForm"
          id="saveProgramFormBtn"
          title="${mode === 'add' ? 'Crear programa' : 'Guardar cambios'}"
          aria-label="${mode === 'add' ? 'Crear programa' : 'Guardar cambios'}"
          class="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer shadow-2xs shrink-0"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </button>
        <button
          type="button"
          id="cancelEditProgramBtn"
          ${mode === 'add' ? 'data-action="cancel-create-program"' : ''}
          title="${mode === 'add' ? 'Cancelar creación' : 'Cancelar edición'}"
          aria-label="${mode === 'add' ? 'Cancelar creación' : 'Cancelar edición'}"
          class="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors cursor-pointer shadow-2xs shrink-0"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      `
      : undefined;

  const archiveBtnHtml =
    isReadOnly && canArchive && selectedProgram
      ? renderArchivarButtonHtml({
          tableName: 'programa_auditoria',
          recordId: selectedProgram.id,
          entityLabel: 'Programa de Auditoría',
          recordTitle: selectedProgram.etiqueta,
          recordSubtitle: `${selectedProgram.codigo_programa || 'PROGRAMA'} · ${linkBadge.label}`,
          iconOnly: true,
        })
      : '';

  const showZone3Tabs =
    mode === 'read' && activeStep === 2 && Boolean(activeCampaignAudit);
  const activeTab: ProgramacionChildTab = state.activeChildTab || 'equipo';
  const sortedSites = activeCampaignAudit
    ? sortSitesWithPrincipalFirst(activeCampaignAudit.sitiosMuestreo)
    : [];
  const activeAuditFindings = activeCampaignAudit
    ? findings.filter((f) => f.id_auditoria === activeCampaignAudit.id)
    : [];

  return renderDetailPageTemplate({
    entityType: 'Programa de Auditoría',
    entitySymbol: '📋',
    title,
    eyebrowCode,
    secondaryHeaderBadge: {
      label: linkBadge.label,
      badgeClass: linkBadge.className,
    },
    statusBadge: planningStatus
      ? {
          label: planningStatus.primaryTag,
          badgeClass: getDynamicTagBadgeClass(planningStatus.primaryTag),
        }
      : {
          label: 'En Programación',
          badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
          dotClass: 'bg-sky-600',
        },
    backButton: {
      label: 'Volver a Programación',
      nav: 'auditorias',
      subview: 'scheduling',
      action: 'back-to-programacion-list',
    },
    isCreateMode: mode === 'add',
    customTopActionsHtml: topEditCancelActionsHtml,
    editActionButton:
      mode === 'read'
        ? {
            id: 'startEditProgramBtn',
            visible: isStaff,
            isEditing: false,
          }
        : undefined,
    trailingActionButtonsHtml: archiveBtnHtml,
    tableName: 'programa_auditoria',
    recordId: selectedProgram?.id || '',
    customParentZoneHtml: activeStep === 1 ? zone1Step1Html : zone1Step2SummaryHtml,
    attributes: [],
    customRecordBodyHtml: activeStep === 1 ? zone2Step1Html : zone2Step2Html,
    childTabs:
      showZone3Tabs && activeCampaignAudit
        ? [
            {
              id: 'equipo',
              label: 'Equipo Auditor',
              symbol: '👥',
              count: activeCampaignAudit.equipo.length,
            },
            {
              id: 'muestreo',
              label: 'Sedes y Muestreo',
              symbol: '🏭',
              count: sortedSites.length,
            },
            {
              id: 'matriz',
              label: 'Matriz Normativa',
              symbol: '✅',
              count: activeCampaignAudit.matrizNormativa.length,
            },
            {
              id: 'hallazgos',
              label: 'Hallazgos',
              symbol: '📋',
              count: activeAuditFindings.length,
            },
          ]
        : [],
    activeChildTabId: activeTab,
    childTabAttrName: 'data-prog-tab',
    renderChildTabContent:
      showZone3Tabs && activeCampaignAudit
        ? (tabId) => {
            const canAssignTeam = canEditAuditScheduleOrTeam(profile);
            const canEditMatrix = canMutateAuditExecution(activeCampaignAudit, profile);
            if (tabId === 'muestreo') {
              return renderSamplingChildTab(activeCampaignAudit, sortedSites, canAssignTeam);
            }
            if (tabId === 'matriz') {
              return renderVerificationMatrixTab(activeCampaignAudit, canEditMatrix);
            }
            if (tabId === 'hallazgos') {
              return renderFindingsChildTab(activeCampaignAudit, activeAuditFindings);
            }
            return renderTeamChildTab(
              activeCampaignAudit,
              auditors,
              canAssignTeam,
              state.isAddingTeamMember
            );
          }
        : undefined,
  });
}

function getProgramLinkingBadgeMeta(
  nivel: AuditLinkLevel,
  tipo: AuditLinkNature
): { label: string; className: string } {
  if (nivel === 'NIVEL_2_INTER_ORG') {
    return {
      label: `Nivel 2 · ${tipo}`,
      className: 'bg-violet-50 text-violet-800 border-violet-200',
    };
  }
  if (nivel === 'NIVEL_1_INTRA_ORG') {
    return {
      label: `Nivel 1 · ${tipo}`,
      className: 'bg-sky-50 text-sky-800 border-sky-200',
    };
  }
  return {
    label: 'Individual',
    className: 'bg-slate-100 text-slate-700 border-slate-200',
  };
}

function getDynamicTagBadgeClass(tag: ProgramPlanningStatusResult['primaryTag']): string {
  switch (tag) {
    case 'Lista para Ejecutar':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    case 'Auditada':
      return 'bg-teal-50 text-teal-800 border-teal-200';
    case 'En Ejecución':
      return 'bg-indigo-50 text-indigo-800 border-indigo-200';
    case 'Atrasada':
    case 'Desfase de Días':
      return 'bg-rose-50 text-rose-800 border-rose-200';
    case 'Preprogramada':
      return 'bg-sky-50 text-sky-800 border-sky-200';
    case 'Programación Incompleta':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'Cancelada':
      return 'bg-slate-200 text-slate-700 border-slate-300';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

function formatShortDmy(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return isoDate;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatCompactRangeLabel(entry: AuditDateEntry | null): {
  primary: string;
  secondary: string;
} {
  if (!entry) {
    return { primary: 'Sin definir', secondary: 'Sin fecha 1:N' };
  }
  const seq = Number.isInteger(entry.numero_secuencia) && entry.numero_secuencia > 0
    ? entry.numero_secuencia
    : 1;
  const tagText = entry.tag === 'Reprogramación' ? `Reprog. #${seq}` : 'Programación';

  if (entry.tipo_fecha === 'PREPROGRAMADA_MES') {
    const label = formatAuditDateLabel(entry);
    const shortPart = label.split('·')[0]?.trim() || 'Mes/Año';
    return {
      primary: `${shortPart} · Preprog.`,
      secondary: tagText,
    };
  }

  const start = entry.fecha_inicio ? formatShortDmy(entry.fecha_inicio) : '—';
  const end = entry.fecha_fin ? formatShortDmy(entry.fecha_fin) : start;
  const span = computeAuditCalendarSpanDays(entry);
  const startShort = start.length === 10 ? start.slice(0, 5) : start;
  const rangeStr = start === end ? start : `${startShort} → ${end}`;
  const spanSuffix = span !== null ? ` · ${span}d cal.` : '';
  return {
    primary: `${rangeStr}${spanSuffix}`,
    secondary: tagText,
  };
}

function resolveProgramLatestDate(
  program: ProgramaAuditoriaEntity
): AuditDateEntry | null {
  const activeAudits = (program.auditorias || []).filter((a) => !a.deleted_at);
  for (const audit of activeAudits) {
    const entry = resolveEffectiveLatestDateForAudit(audit);
    if (entry) return entry;
  }
  return null;
}

function buildCampaignDirectoryRows(
  programs: ReadonlyArray<ProgramaAuditoriaEntity>,
  auditAlerts: ReadonlyArray<AuditAlertItem> = []
): CampaignDirectoryRow[] {
  const conflicts = detectAuditorScheduleConflicts(programs);
  const conflictProgramIds = new Set<string>();
  for (const c of conflicts) {
    conflictProgramIds.add(c.program_a_id);
    conflictProgramIds.add(c.program_b_id);
  }
  const alertProgramIds = new Set<string>();
  for (const al of auditAlerts) {
    if (al.programId) alertProgramIds.add(al.programId);
  }

  return programs.map((program) => {
    const planningStatus = computeProgramPlanningStatus(program);
    const latestDate = resolveProgramLatestDate(program);
    const precisionKey: 'REAL' | 'PREPROGRAMADA_MES' | 'SIN_FECHA' = !latestDate
      ? 'SIN_FECHA'
      : latestDate.tipo_fecha === 'REAL'
      ? 'REAL'
      : 'PREPROGRAMADA_MES';

    const hasSitesPlan = program.auditorias.some((a) => (a.sitiosPlan || []).length > 0);
    const requiredDays = hasSitesPlan
      ? planningStatus.totalPlannedDays
      : program.auditorias.reduce((sum, a) => sum + (a.tiempo_auditoria ?? a.dias_auditor ?? 0), 0);
    const assignedDays = hasSitesPlan
      ? planningStatus.totalAuditorAssignedDays
      : requiredDays;

    const cuadreKey: 'CUADRADO' | 'DESFASE' | 'PENDIENTE' =
      requiredDays <= 0 && assignedDays <= 0
        ? 'PENDIENTE'
        : hasSitesPlan
        ? planningStatus.isBalanced
          ? 'CUADRADO'
          : 'DESFASE'
        : assignedDays > 0 && assignedDays === requiredDays
        ? 'CUADRADO'
        : 'PENDIENTE';

    const orgNames = Array.from(
      new Set(program.auditorias.map((a) => a.organizacion_nombre).filter(Boolean))
    );
    const certNumbers = Array.from(
      new Set(program.auditorias.map((a) => a.numero_certificado).filter(Boolean))
    );
    const normaCodes = Array.from(
      new Set(program.auditorias.map((a) => a.norma_codigo).filter(Boolean))
    );
    const auditorNames = Array.from(
      new Set(
        program.auditorias
          .flatMap((a) => [a.auditor_lider, ...a.equipo.map((m) => m.nombre)])
          .filter(Boolean)
      )
    );

    return {
      program,
      planningStatus,
      latestDate,
      precisionKey,
      cuadreKey,
      assignedDays,
      requiredDays,
      hasConflict: conflictProgramIds.has(program.id),
      hasAlert: alertProgramIds.has(program.id),
      orgNames,
      certNumbers,
      normaCodes,
      auditorNames,
    };
  });
}

function buildUnprogrammedCertCandidates(
  certificates: ReadonlyArray<CertificateRecord>,
  allCertificadosDetailed?: ReadonlyArray<CertificadoDetailEntity>
): Array<
  UnprogrammedCertificateCandidate & {
    sector_iaf?: number;
    subsector_label: string;
  }
> {
  if (allCertificadosDetailed && allCertificadosDetailed.length > 0) {
    return allCertificadosDetailed.map((c) => ({
      id: c.id,
      numero_certificado: c.numero_certificado,
      id_organizacion: c.id_organizacion,
      organizacion_nombre: c.organizacion_nombre,
      id_norma: c.id_norma || c.norma_codigo,
      norma_codigo: c.norma_codigo,
      id_estatus: c.id_estatus || c.estatus,
      estatus: c.estatus,
      fecha_vencimiento: c.fecha_vencimiento,
      sector_iaf: c.sector_iaf,
      subsector_label: c.subsector_iaf_codigo
        ? `IAF ${c.sector_iaf}.${c.subsector_iaf_codigo}${c.subsector_iaf_descripcion ? ` · ${c.subsector_iaf_descripcion}` : ''}`
        : `Sector IAF ${c.sector_iaf}`,
      deleted_at: null,
    }));
  }

  return certificates.map((c) => ({
    id: c.id,
    numero_certificado: c.numero_certificado,
    id_organizacion: c.organizacion_id || '',
    organizacion_nombre: c.organizacion_nombre,
    id_norma: c.norma,
    norma_codigo: c.norma,
    id_estatus: c.estatus,
    estatus: c.estatus,
    fecha_vencimiento: c.fecha_vencimiento,
    sector_iaf: c.sector_iaf,
    subsector_label: `Sector IAF ${c.sector_iaf}`,
    deleted_at: null,
  }));
}

function getCertEstatusBadgeClass(estatus: string): string {
  const norm = estatus.toLowerCase();
  if (norm.includes('activ')) return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  if (norm.includes('estudi')) return 'bg-sky-50 text-sky-800 border-sky-200';
  if (norm.includes('espera')) return 'bg-amber-50 text-amber-800 border-amber-200';
  if (norm.includes('planific')) return 'bg-indigo-50 text-indigo-800 border-indigo-200';
  if (norm.includes('suspend')) return 'bg-rose-50 text-rose-800 border-rose-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function renderProgramacionDirectoryView(
  props: ProgramacionViewProps,
  allPrograms: ProgramaAuditoriaEntity[],
  loading: boolean,
  archiveConfig?: ArchiveMultiViewConfig
): string {
  const {
    profile,
    state,
    certificates,
    allCertificadosDetailed,
    auditAlerts = [],
    tableColumnWidths,
  } = props;
  const canPlan = canEditAuditScheduleOrTeam(profile);
  const activeSubView: ProgramacionSubView =
    state.subView === 'pendientes' && canPlan ? 'pendientes' : 'campaigns';

  const certCandidates = buildUnprogrammedCertCandidates(certificates, allCertificadosDetailed);
  const unprogrammedBase = findUnprogrammedCertificatesByStatus(certCandidates, allPrograms);

  const actionsHtml = canPlan
    ? `
      <button
        type="button"
        data-action="open-create-program"
        aria-label="Nuevo Programa de Auditoría"
        title="Nuevo Programa de Auditoría"
        class="w-9 h-9 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-base font-bold transition-colors cursor-pointer inline-flex items-center justify-center shadow-2xs"
      >
        <span aria-hidden="true">+</span>
      </button>
    `
    : '';

  const subSelectorHtml = canPlan
    ? `
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div
          class="inline-flex rounded-xl border border-slate-200 bg-slate-100/80 p-1 gap-1"
          role="group"
          aria-label="Sub-vista operativa de programación"
        >
          <button
            type="button"
            data-prog-subview="campaigns"
            aria-pressed="${activeSubView === 'campaigns' ? 'true' : 'false'}"
            class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer inline-flex items-center gap-2 ${
              activeSubView === 'campaigns'
                ? 'bg-white text-slate-900 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }"
          >
            <span>Campañas y Auditorías</span>
            <span class="px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums ${
              activeSubView === 'campaigns'
                ? 'bg-indigo-100 text-indigo-800'
                : 'bg-slate-200/80 text-slate-600'
            }">${allPrograms.length}</span>
          </button>

          <button
            type="button"
            data-prog-subview="pendientes"
            aria-pressed="${activeSubView === 'pendientes' ? 'true' : 'false'}"
            class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer inline-flex items-center gap-2 ${
              activeSubView === 'pendientes'
                ? 'bg-white text-slate-900 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }"
          >
            <span>Certificados Sin Programación</span>
            <span class="px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums ${
              activeSubView === 'pendientes'
                ? 'bg-amber-100 text-amber-800'
                : 'bg-slate-200/80 text-slate-600'
            }">${unprogrammedBase.totalUnprogrammed}</span>
          </button>
        </div>

        ${
          state.saveSuccessMessage
            ? `<div class="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">✓ ${escapeHtml(state.saveSuccessMessage)}</div>`
            : ''
        }
      </div>
    `
    : state.saveSuccessMessage
    ? `<div class="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">✓ ${escapeHtml(state.saveSuccessMessage)}</div>`
    : '';

  if (activeSubView === 'pendientes') {
    return renderUnprogrammedCertificatesSubView({
      state,
      allPrograms,
      certCandidates,
      unprogrammedBase,
      canPlan,
      actionsHtml,
      subSelectorHtml,
      tableColumnWidths,
      loading,
      archiveConfig,
    });
  }

  return renderCampaignsSubView({
    state,
    allPrograms,
    auditAlerts,
    actionsHtml,
    subSelectorHtml,
    tableColumnWidths,
    loading,
    archiveConfig,
  });
}

function renderCampaignsSubView(params: {
  state: ProgramacionViewState;
  allPrograms: ProgramaAuditoriaEntity[];
  auditAlerts: ReadonlyArray<AuditAlertItem>;
  actionsHtml: string;
  subSelectorHtml: string;
  tableColumnWidths?: Record<string, Record<string, number>>;
  loading: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
}): string {
  const {
    state,
    allPrograms,
    auditAlerts,
    actionsHtml,
    subSelectorHtml,
    tableColumnWidths,
    loading,
    archiveConfig,
  } = params;

  const rows = buildCampaignDirectoryRows(allPrograms, auditAlerts);

  const facetCategories: MultiViewFacetCategory<CampaignDirectoryRow>[] = [
    {
      id: 'nivel_vinculacion',
      label: 'Nivel de Vinculación',
      options: [
        { value: 'INDIVIDUAL', label: 'Individual' },
        { value: 'NIVEL_1_INTRA_ORG', label: 'Nivel 1 (Intra-Org)' },
        { value: 'NIVEL_2_INTER_ORG', label: 'Nivel 2 (Inter-Org)' },
      ],
      extractValues: (r) => r.program.nivel_vinculacion,
    },
    {
      id: 'tipo_vinculacion',
      label: 'Naturaleza',
      extractValues: (r) => r.program.tipo_vinculacion,
    },
    {
      id: 'precision_fecha',
      label: 'Precisión de Fecha',
      options: [
        { value: 'REAL', label: 'Fecha Real' },
        { value: 'PREPROGRAMADA_MES', label: 'Pre-programada Mes/Año' },
        { value: 'SIN_FECHA', label: 'Sin Fecha' },
      ],
      extractValues: (r) => r.precisionKey,
    },
    {
      id: 'tag_planificacion',
      label: 'Estado de Planificación',
      extractValues: (r) => r.planningStatus.primaryTag,
    },
    {
      id: 'cuadre_dias',
      label: 'Cuadre de Días',
      options: [
        { value: 'CUADRADO', label: 'Cuadrado ✓' },
        { value: 'DESFASE', label: 'Con Desfase' },
        { value: 'PENDIENTE', label: 'Sin Asignar' },
      ],
      extractValues: (r) => r.cuadreKey,
    },
  ];

  const effectiveSelections: MultiViewSelectionMap = state.facetSelections || {};
  const searchOptions = {
    getSearchableText: (r: CampaignDirectoryRow) =>
      [
        r.program.codigo_programa || '',
        r.program.etiqueta,
        r.program.nivel_vinculacion,
        r.program.tipo_vinculacion,
        r.planningStatus.primaryTag,
        ...r.orgNames,
        ...r.certNumbers,
        ...r.normaCodes,
        ...r.auditorNames,
        ...r.program.auditorias.map((a) => a.codigo_auditoria),
      ].join(' '),
  };

  let filtered = filterRecordsWithFacets(
    rows,
    state.query,
    facetCategories,
    effectiveSelections,
    searchOptions
  );

  if (!state.facetSelections) {
    if (state.selectedTipo !== 'ALL') {
      filtered = filtered.filter((r) =>
        r.program.auditorias.some((a) => a.tipo_auditoria === state.selectedTipo)
      );
    }
    if (state.selectedMetodologia !== 'ALL') {
      filtered = filtered.filter((r) =>
        r.program.auditorias.some((a) => a.metodologia === state.selectedMetodologia)
      );
    }
    if (state.selectedEstatus !== 'ALL') {
      filtered = filtered.filter((r) =>
        r.program.auditorias.some((a) => a.estatus === state.selectedEstatus)
      );
    }
    if (state.selectedAuditorLider !== 'ALL') {
      filtered = filtered.filter((r) =>
        r.auditorNames.includes(state.selectedAuditorLider)
      );
    }
  }

  const sorted = sortItems(filtered, state.sortColumn, state.sortDirection, (r, col) => {
    switch (col) {
      case 'programa':
      case 'codigo':
        return `${r.program.codigo_programa || ''} ${r.program.etiqueta}`;
      case 'vinculacion':
      case 'tipo':
        return `${r.program.nivel_vinculacion} ${r.program.tipo_vinculacion}`;
      case 'certificados_org':
      case 'organizacion':
        return `${r.orgNames.join(' ')} ${r.certNumbers.join(' ')}`;
      case 'fecha_vigente':
      case 'fecha':
        return r.latestDate?.fecha_inicio || `${r.latestDate?.anio || ''}-${String(r.latestDate?.mes || '').padStart(2, '0')}`;
      case 'dias_cuadre':
      case 'dias':
        return r.requiredDays;
      case 'estado_tag':
      case 'estatus':
        return r.planningStatus.primaryTag;
      default:
        return '';
    }
  });

  const facetGroups = computeReactiveFacetCounts(
    rows,
    state.query,
    facetCategories,
    effectiveSelections,
    searchOptions
  );

  // Strict 6-column table-fixed colgroup (17 + 15 + 22 + 19 + 12 + 15 = 100%) and 0 <button> in <tbody>
  const columns: ColumnDefinition<CampaignDirectoryRow>[] = [
    {
      id: 'programa',
      header: 'Programa / Código',
      sortable: true,
      defaultWidthPct: 17,
      minWidthPx: 135,
      renderCell: (r) => {
        const code = r.program.codigo_programa || r.program.auditorias[0]?.codigo_auditoria || 'PROG-AUD';
        return `
          <div class="min-w-0">
            <div class="font-mono font-bold text-indigo-700 truncate" title="${escapeHtml(code)}">${escapeHtml(code)}</div>
            <div class="text-[11px] font-semibold text-slate-900 truncate" title="${escapeHtml(r.program.etiqueta)}">${escapeHtml(r.program.etiqueta)}</div>
          </div>
        `;
      },
    },
    {
      id: 'vinculacion',
      header: 'Vinculación',
      sortable: true,
      defaultWidthPct: 15,
      minWidthPx: 125,
      renderCell: (r) => {
        const linkBadge = getProgramLinkingBadgeMeta(
          r.program.nivel_vinculacion,
          r.program.tipo_vinculacion
        );
        return `
          <div class="min-w-0 space-y-0.5">
            <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border truncate max-w-full ${linkBadge.className}">
              ${escapeHtml(linkBadge.label)}
            </span>
            ${
              r.program.id_ciclo_origen
                ? `<div class="text-[10px] font-medium text-slate-500 truncate">↻ Evolución de ciclo</div>`
                : ''
            }
          </div>
        `;
      },
    },
    {
      id: 'certificados_org',
      header: 'Certificados y Org.',
      sortable: true,
      defaultWidthPct: 22,
      minWidthPx: 160,
      renderCell: (r) => {
        const orgText = r.orgNames.join(' · ') || 'Sin organización';
        const certText = r.certNumbers.join(', ') || 'Sin certificados';
        const normasText = r.normaCodes.join(', ');
        return `
          <div class="min-w-0">
            <div class="font-bold text-slate-900 truncate" title="${escapeHtml(orgText)}">${escapeHtml(orgText)}</div>
            <div class="text-[11px] font-mono text-slate-500 truncate" title="${escapeHtml(certText)}">
              ${escapeHtml(certText)}${normasText ? ` · <span class="font-sans font-semibold text-slate-600">${escapeHtml(normasText)}</span>` : ''}
            </div>
          </div>
        `;
      },
    },
    {
      id: 'fecha_vigente',
      header: 'Fecha Vigente',
      sortable: true,
      defaultWidthPct: 19,
      minWidthPx: 140,
      renderCell: (r) => {
        const formatted = formatCompactRangeLabel(r.latestDate);
        return `
          <div class="min-w-0">
            <div class="font-mono font-semibold text-slate-900 text-[11px] truncate" title="${escapeHtml(formatted.primary)}">${escapeHtml(formatted.primary)}</div>
            <div class="text-[10px] text-slate-500 truncate">${escapeHtml(formatted.secondary)}</div>
          </div>
        `;
      },
    },
    {
      id: 'dias_cuadre',
      header: 'Días y Cuadre',
      sortable: true,
      defaultWidthPct: 12,
      minWidthPx: 100,
      renderCell: (r) => {
        const ratioText = `${r.assignedDays}d / ${r.requiredDays}d`;
        const statusHtml =
          r.cuadreKey === 'CUADRADO'
            ? `<span class="text-[10px] font-bold text-emerald-700">Cuadrado ✓</span>`
            : r.cuadreKey === 'DESFASE'
            ? `<span class="text-[10px] font-bold text-rose-700">Desfase ${r.planningStatus.bucketDelta > 0 ? `+${r.planningStatus.bucketDelta}` : r.planningStatus.bucketDelta}d</span>`
            : `<span class="text-[10px] font-semibold text-amber-700">Pendiente</span>`;
        return `
          <div class="min-w-0">
            <div class="font-mono font-bold text-slate-900 text-[11px] truncate">${escapeHtml(ratioText)}</div>
            <div class="truncate">${statusHtml}</div>
          </div>
        `;
      },
    },
    {
      id: 'estado_tag',
      header: 'Estado / Alertas',
      sortable: true,
      defaultWidthPct: 15,
      minWidthPx: 125,
      renderCell: (r) => {
        const tagClass = getDynamicTagBadgeClass(r.planningStatus.primaryTag);
        const alertTag = r.hasConflict
          ? '<div class="text-[10px] font-bold text-rose-700 truncate">⚠ Conflicto</div>'
          : r.planningStatus.isOverdue
          ? '<div class="text-[10px] font-bold text-rose-700 truncate">⚠ Atrasada</div>'
          : r.hasAlert
          ? '<div class="text-[10px] font-semibold text-amber-700 truncate">• Alerta activa</div>'
          : '';
        return `
          <div class="min-w-0 space-y-0.5">
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border truncate max-w-full ${tagClass}">
              ${escapeHtml(r.planningStatus.primaryTag)}
            </span>
            ${alertTag}
          </div>
        `;
      },
    },
  ];

  const renderCard = (r: CampaignDirectoryRow): string => {
    const code = r.program.codigo_programa || r.program.auditorias[0]?.codigo_auditoria || 'PROG-AUD';
    const linkBadge = getProgramLinkingBadgeMeta(
      r.program.nivel_vinculacion,
      r.program.tipo_vinculacion
    );
    const tagClass = getDynamicTagBadgeClass(r.planningStatus.primaryTag);
    const formattedDate = formatCompactRangeLabel(r.latestDate);

    return `
      <article
        data-action="select-prog-program"
        data-program-id="${escapeHtml(r.program.id)}"
        tabindex="0"
        class="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs hover:shadow-sm hover:border-indigo-300 transition-all flex flex-col justify-between gap-4 cursor-pointer"
      >
        <div class="space-y-3">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <span class="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                ${escapeHtml(code)}
              </span>
              <h3 class="text-sm font-bold text-slate-900 mt-1.5 truncate">
                ${escapeHtml(r.program.etiqueta)}
              </h3>
              <div class="text-xs text-slate-600 truncate">
                ${escapeHtml(r.orgNames.join(' · ') || 'Sin organización')}
              </div>
              <div class="text-[11px] text-slate-500 font-mono truncate">
                ${escapeHtml(r.certNumbers.join(', ') || 'Sin certificado')}
              </div>
            </div>
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border shrink-0 ${tagClass}">
              ${escapeHtml(r.planningStatus.primaryTag)}
            </span>
          </div>

          <div class="flex flex-wrap items-center gap-1.5">
            <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${linkBadge.className}">
              ${escapeHtml(linkBadge.label)}
            </span>
            ${
              r.program.id_ciclo_origen
                ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">↻ Evolución de ciclo</span>`
                : ''
            }
            ${
              r.hasConflict
                ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">⚠ Conflicto</span>`
                : ''
            }
          </div>

          <div class="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
            <div>
              <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Fecha Vigente</span>
              <span class="font-mono font-semibold text-slate-800 block truncate">${escapeHtml(formattedDate.primary)}</span>
              <span class="text-[11px] text-slate-500 block">${escapeHtml(formattedDate.secondary)}</span>
            </div>
            <div>
              <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Días y Cuadre</span>
              <span class="font-mono font-semibold text-slate-800 block">${r.assignedDays}d / ${r.requiredDays}d</span>
              <span class="text-[11px] font-semibold ${
                r.cuadreKey === 'CUADRADO'
                  ? 'text-emerald-700'
                  : r.cuadreKey === 'DESFASE'
                  ? 'text-rose-700'
                  : 'text-amber-700'
              }">${r.cuadreKey === 'CUADRADO' ? 'Cuadrado ✓' : r.cuadreKey === 'DESFASE' ? 'Con desfase' : 'Pendiente'}</span>
            </div>
          </div>
        </div>
      </article>
    `;
  };

  return renderUniversalTemplate<CampaignDirectoryRow>({
    domainKey: 'programacion',
    tableId: 'programacion-main',
    title: 'Programación de Auditorías',
    subtitle:
      'Campañas y programas de evaluación (Individual, Nivel 1 Integrada y Nivel 2 Multientidad) conforme a ISO/IEC 17021-1:2015',
    entityLabel: 'campañas de auditoría',
    searchQuery: state.query,
    searchPlaceholder:
      'Buscar por código, etiqueta, certificado, organización, norma o auditor... (Presione "/" para enfocar)',
    searchInputId: 'programacionSearchInput',
    clearSearchBtnId: 'clearProgramacionSearchBtn',
    totalCount: rows.length,
    filteredCount: sorted.length,
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen ?? true,
    sortState: {
      column: state.sortColumn,
      direction: state.sortDirection,
    },
    columnWidths: tableColumnWidths?.['programacion-main'],
    getRowAttrs: (r) =>
      `data-action="select-prog-program" data-program-id="${escapeHtml(r.program.id)}"`,
    facetGroups,
    items: sorted,
    columns,
    renderCard,
    emptyStateTitle: 'No se encontraron campañas de auditoría',
    emptyStateMessage:
      'Ajuste los criterios de búsqueda o restablezca las facetas laterales para visualizar todas las campañas.',
    actionsHtml,
    inlineFormHtml: subSelectorHtml,
    loading,
    loadingMessage: 'Cargando programación de auditorías...',
    ...extractUniversalArchiveProps(archiveConfig, 'programacion'),
  });
}

function renderUnprogrammedCertificatesSubView(params: {
  state: ProgramacionViewState;
  allPrograms: ProgramaAuditoriaEntity[];
  certCandidates: Array<
    UnprogrammedCertificateCandidate & {
      sector_iaf?: number;
      subsector_label: string;
    }
  >;
  unprogrammedBase: ReturnType<typeof findUnprogrammedCertificatesByStatus>;
  canPlan: boolean;
  actionsHtml: string;
  subSelectorHtml: string;
  tableColumnWidths?: Record<string, Record<string, number>>;
  loading: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
}): string {
  const {
    state,
    allPrograms,
    certCandidates,
    unprogrammedBase,
    canPlan,
    actionsHtml,
    subSelectorHtml,
    tableColumnWidths,
    loading,
    archiveConfig,
  } = params;

  const statusFilter = state.unprogrammedStatusFilter || 'ALL';
  const normaFilter = state.unprogrammedNormaId || 'ALL';
  const orgFilter = state.unprogrammedOrgId || 'ALL';

  const filteredCandidatesResult = findUnprogrammedCertificatesByStatus(
    certCandidates,
    allPrograms,
    {
      estatusNames: statusFilter !== 'ALL' ? [statusFilter] : undefined,
      normaId: normaFilter,
      organizacionId: orgFilter,
    }
  );

  const enrichedRows: UnprogrammedCertRow[] = filteredCandidatesResult.items.map((cert) => {
    const digest = buildCertificateAuditHistoryDigest(cert.id, null, allPrograms);
    const prev = digest.latestPreviousCycle;
    return {
      ...cert,
      lastAuditLabel: prev
        ? `${prev.codigo_auditoria} · ${prev.dateLabel}`
        : 'Sin historial previo',
      lastAuditSortKey: prev?.effectiveDateIso || '0000-00-00',
    };
  });

  const facetCategories: MultiViewFacetCategory<UnprogrammedCertRow>[] = [
    {
      id: 'estatus',
      label: 'Estatus del Certificado',
      extractValues: (r) => r.estatus || 'Sin Estatus',
    },
    {
      id: 'norma',
      label: 'Norma Certificable',
      extractValues: (r) => r.norma_codigo || 'ISO',
    },
    {
      id: 'organizacion',
      label: 'Organización',
      extractValues: (r) => r.organizacion_nombre,
    },
  ];

  const effectiveSelections: MultiViewSelectionMap = state.facetSelections || {};
  const searchOptions = {
    getSearchableText: (r: UnprogrammedCertRow) =>
      [
        r.numero_certificado,
        r.organizacion_nombre,
        r.norma_codigo,
        r.subsector_label,
        r.estatus,
        r.lastAuditLabel,
      ].join(' '),
  };

  const filtered = filterRecordsWithFacets(
    enrichedRows,
    state.query,
    facetCategories,
    effectiveSelections,
    searchOptions
  );

  const sorted = sortItems(filtered, state.sortColumn, state.sortDirection, (r, col) => {
    switch (col) {
      case 'numero_certificado':
        return r.numero_certificado;
      case 'organizacion':
        return r.organizacion_nombre;
      case 'norma_subsector':
        return `${r.norma_codigo} ${r.subsector_label}`;
      case 'estatus':
        return r.estatus;
      case 'ultima_auditoria':
        return r.lastAuditSortKey;
      default:
        return '';
    }
  });

  const facetGroups = computeReactiveFacetCounts(
    enrichedRows,
    state.query,
    facetCategories,
    effectiveSelections,
    searchOptions
  );

  // Distinct Norma & Org options from all unprogrammed certificates
  const distinctNormas = new Map<string, string>();
  const distinctOrgs = new Map<string, string>();
  for (const item of unprogrammedBase.items) {
    if (item.id_norma && item.norma_codigo) {
      distinctNormas.set(item.id_norma, item.norma_codigo);
    }
    if (item.id_organizacion && item.organizacion_nombre) {
      distinctOrgs.set(item.id_organizacion, item.organizacion_nombre);
    }
  }

  const orderedStatuses = Array.from(
    new Set([
      'Activo',
      'Estudio',
      'En Espera',
      'Planificado',
      'Suspendido',
      ...Object.keys(unprogrammedBase.countsByEstatus),
    ])
  ).filter((st) => (unprogrammedBase.countsByEstatus[st] || 0) > 0 || statusFilter === st);

  const filterBarHtml = `
    <div class="space-y-3">
      ${subSelectorHtml}
      <div class="pt-2.5 border-t border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar certificados sin programación por estatus">
          <button
            type="button"
            data-unprogrammed-status="ALL"
            aria-pressed="${statusFilter === 'ALL' ? 'true' : 'false'}"
            class="px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
              statusFilter === 'ALL'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }"
          >
            <span>Todos</span>
            <span class="text-[10px] font-bold tabular-nums opacity-80">${unprogrammedBase.totalUnprogrammed}</span>
          </button>
          ${orderedStatuses
            .map((st) => {
              const count = unprogrammedBase.countsByEstatus[st] || 0;
              const active = statusFilter === st;
              return `
                <button
                  type="button"
                  data-unprogrammed-status="${escapeHtml(st)}"
                  aria-pressed="${active ? 'true' : 'false'}"
                  class="px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                    active
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }"
                >
                  <span>${escapeHtml(st)}</span>
                  <span class="text-[10px] font-bold tabular-nums opacity-80">${count}</span>
                </button>
              `;
            })
            .join('')}
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <select
            id="unprogrammedNormaFilter"
            aria-label="Filtrar por norma"
            class="text-xs rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 min-w-[150px]"
          >
            <option value="ALL" ${normaFilter === 'ALL' ? 'selected' : ''}>Todas las Normas</option>
            ${Array.from(distinctNormas.entries())
              .map(
                ([id, label]) =>
                  `<option value="${escapeHtml(id)}" ${normaFilter === id ? 'selected' : ''}>${escapeHtml(label)}</option>`
              )
              .join('')}
          </select>

          <select
            id="unprogrammedOrgFilter"
            aria-label="Filtrar por organización"
            class="text-xs rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 min-w-[170px]"
          >
            <option value="ALL" ${orgFilter === 'ALL' ? 'selected' : ''}>Todas las Organizaciones</option>
            ${Array.from(distinctOrgs.entries())
              .map(
                ([id, label]) =>
                  `<option value="${escapeHtml(id)}" ${orgFilter === id ? 'selected' : ''}>${escapeHtml(label)}</option>`
              )
              .join('')}
          </select>
        </div>
      </div>
    </div>
  `;

  // 5-column table-fixed (18 + 26 + 24 + 14 + 18 = 100%) with zero <button> in <tbody>
  const columns: ColumnDefinition<UnprogrammedCertRow>[] = [
    {
      id: 'numero_certificado',
      header: 'N° Certificado',
      sortable: true,
      defaultWidthPct: 18,
      minWidthPx: 130,
      renderCell: (r) => `
        <span class="font-mono font-bold text-indigo-700">${escapeHtml(r.numero_certificado)}</span>
      `,
    },
    {
      id: 'organizacion',
      header: 'Organización',
      sortable: true,
      defaultWidthPct: 26,
      minWidthPx: 160,
      renderCell: (r) => `
        <div class="font-bold text-slate-900 truncate" title="${escapeHtml(r.organizacion_nombre)}">
          ${escapeHtml(r.organizacion_nombre)}
        </div>
      `,
    },
    {
      id: 'norma_subsector',
      header: 'Norma / Sub-Sector',
      sortable: true,
      defaultWidthPct: 24,
      minWidthPx: 145,
      renderCell: (r) => `
        <div class="min-w-0">
          <div class="font-semibold text-slate-900 truncate">${escapeHtml(r.norma_codigo)}</div>
          <div class="text-[11px] text-slate-500 truncate" title="${escapeHtml(r.subsector_label)}">${escapeHtml(r.subsector_label)}</div>
        </div>
      `,
    },
    {
      id: 'estatus',
      header: 'Estatus',
      sortable: true,
      defaultWidthPct: 14,
      minWidthPx: 105,
      renderCell: (r) => `
        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${getCertEstatusBadgeClass(r.estatus)}">
          ${escapeHtml(r.estatus)}
        </span>
      `,
    },
    {
      id: 'ultima_auditoria',
      header: 'Última Auditoría Histórica',
      sortable: true,
      defaultWidthPct: 18,
      minWidthPx: 130,
      renderCell: (r) => `
        <span class="text-xs text-slate-600 truncate block" title="${escapeHtml(r.lastAuditLabel)}">
          ${escapeHtml(r.lastAuditLabel)}
        </span>
      `,
    },
  ];

  const renderCard = (r: UnprogrammedCertRow): string => `
    <article
      ${canPlan ? `data-action="start-program-from-cert" data-cert-id="${escapeHtml(r.id)}" tabindex="0"` : ''}
      class="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs ${
        canPlan ? 'hover:shadow-sm hover:border-indigo-300 cursor-pointer' : ''
      } transition-all flex flex-col justify-between gap-3"
    >
      <div class="space-y-2">
        <div class="flex items-start justify-between gap-2">
          <span class="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
            ${escapeHtml(r.numero_certificado)}
          </span>
          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${getCertEstatusBadgeClass(r.estatus)}">
            ${escapeHtml(r.estatus)}
          </span>
        </div>
        <h3 class="text-sm font-bold text-slate-900 truncate">${escapeHtml(r.organizacion_nombre)}</h3>
        <div class="text-xs text-slate-600 truncate">${escapeHtml(r.norma_codigo)} · ${escapeHtml(r.subsector_label)}</div>
      </div>
      <div class="pt-2 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between gap-2">
        <span class="truncate">${escapeHtml(r.lastAuditLabel)}</span>
        ${canPlan ? '<span class="font-bold text-indigo-700 shrink-0">+ Programar →</span>' : ''}
      </div>
    </article>
  `;

  return renderUniversalTemplate<UnprogrammedCertRow>({
    domainKey: 'programacion',
    tableId: 'programacion-unprogrammed',
    title: 'Programación de Auditorías',
    subtitle:
      'Certificados activos o en estudio sin auditoría en curso; haga clic en una fila para iniciar la programación preseleccionada',
    entityLabel: 'certificados sin programación',
    searchQuery: state.query,
    searchPlaceholder:
      'Buscar certificado sin programar, organización, norma o estatus... (Presione "/" para enfocar)',
    searchInputId: 'programacionSearchInput',
    clearSearchBtnId: 'clearProgramacionSearchBtn',
    totalCount: unprogrammedBase.totalUnprogrammed,
    filteredCount: sorted.length,
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen ?? true,
    sortState: {
      column: state.sortColumn,
      direction: state.sortDirection,
    },
    columnWidths: tableColumnWidths?.['programacion-unprogrammed'],
    getRowAttrs: canPlan
      ? (r) => `data-action="start-program-from-cert" data-cert-id="${escapeHtml(r.id)}"`
      : undefined,
    facetGroups,
    items: sorted,
    columns,
    renderCard,
    emptyStateTitle: 'Todos los certificados filtrados ya cuentan con programación',
    emptyStateMessage:
      'Modifique el estatus del certificado o restablezca los filtros laterales para revisar otros certificados.',
    actionsHtml,
    inlineFormHtml: filterBarHtml,
    loading,
    loadingMessage: 'Analizando certificados sin programación...',
    ...extractUniversalArchiveProps(archiveConfig, 'programacion'),
  });
}

/**
 * Standardized 3-Zone Detail View for a Scheduled Audit Event
 */
function renderProgramacionDetailView(
  profile: UserProfile,
  state: ProgramacionViewState,
  audit: ProgramacionAuditEntity,
  allAuditors: AuditorDetailEntity[],
  allFindings: Phase5FindingEntity[]
): string {
  const canEditSchedule = canEditAuditScheduleOrTeam(profile);
  const canAssignTeam = canEditSchedule;
  const canEditMatrix = canMutateAuditExecution(audit, profile);
  const mod = getModalityVisualStyle(audit.tipo_auditoria);
  const met = getMethodologyVisualStyle(audit.metodologia);
  const st = getAuditStatusVisualStyle(audit.estatus);

  const sortedSites = sortSitesWithPrincipalFirst(audit.sitiosMuestreo);
  const auditFindings = allFindings.filter((f) => f.id_auditoria === audit.id);
  const activeTab: ProgramacionChildTab = state.activeChildTab || 'equipo';

  const parents: DetailParentChip[] = [
    {
      label: 'Organización',
      value: audit.organizacion_nombre,
      symbol: '🏢',
      navAction: {
        nav: 'certificacion',
        subview: 'organizations',
        entityType: 'org',
        entityId: audit.id_organizacion,
      },
    },
    {
      label: 'Certificado',
      value: audit.numero_certificado,
      symbol: '📜',
      navAction: {
        nav: 'certificacion',
        subview: 'certificates',
        entityType: 'cert',
        entityId: audit.id_certificado,
      },
    },
    {
      label: 'Tipo',
      value: audit.tipo_auditoria,
      symbol: mod.symbol,
      navAction: {
        nav: 'extra',
        subview: 'tipos',
        entityType: 'tipo',
        entityId: audit.tipo_auditoria,
      },
    },
    {
      label: 'Metodología',
      value: audit.metodologia,
      symbol: met.symbol,
      navAction: {
        nav: 'extra',
        subview: 'metodologias',
        entityType: 'metodologia',
        entityId: audit.metodologia,
      },
    },
  ];

  const parentMetaHtml = audit.recomendacion
    ? `
      <span class="px-2.5 py-1 rounded font-bold text-[11px] border ${
        audit.recomendacion.estado === 'APROBADA'
          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
          : 'bg-rose-50 text-rose-800 border-rose-200'
      }">
        Recomendación ISO 17021-1: ${escapeHtml(audit.recomendacion.estado)}
      </span>
    `
    : '';

  const extraActionButtonsHtml = `
    <button
      type="button"
      data-action="go-audit-results"
      data-audit-id="${escapeHtml(audit.id)}"
      class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-semibold transition-colors cursor-pointer"
    >
      <span aria-hidden="true">📋</span>
      <span>Ver Resultados y Hallazgos</span>
    </button>
  `;

  const canArchive = canArchiveRecord(profile);
  const archiveBtnHtml = canArchive
    ? renderArchivarButtonHtml({
        tableName: 'auditoria',
        recordId: audit.id,
        entityLabel: 'Auditoría Programada',
        recordTitle: audit.codigo_auditoria,
        recordSubtitle: `${audit.organizacion_nombre} · ${audit.tipo_auditoria}`,
        iconOnly: true,
      })
    : '';

  const trailingActionButtonsHtml = !state.isEditingAttributes ? archiveBtnHtml : '';

  const feedbackHtml = `
    ${
      state.saveSuccessMessage
        ? `<div class="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">✓ ${escapeHtml(state.saveSuccessMessage)}</div>`
        : ''
    }
    ${
      state.editErrorMessage
        ? `<div class="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">⚠️ ${escapeHtml(state.editErrorMessage)}</div>`
        : ''
    }
  `;

  const customRecordBodyHtml =
    state.isEditingAttributes && canEditSchedule
      ? renderEditAuditAttributesForm(audit, allAuditors)
      : `
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          ${renderAttrCard('Código de Auditoría', audit.codigo_auditoria, true)}
          ${renderAttrCard('Tipo / Modalidad', audit.tipo_auditoria)}
          ${renderAttrCard('Metodología de Ejecución', audit.metodologia)}
          ${renderAttrCard('Fecha Inicio / Fin', `${audit.fecha_inicio} → ${audit.fecha_fin}`, true)}
          ${renderAttrCard('Días-Auditor Planificados', `${audit.dias_auditor} día(s)-auditor`)}
          ${renderAttrCard('Auditor Líder', audit.auditor_lider)}
          ${renderAttrCard('Norma Evaluada', audit.norma_codigo)}
          ${renderAttrCard('Sector IAF', `Sector IAF ${audit.sector_iaf}`)}
          ${renderAttrCard('Estatus Operativo', audit.estatus)}
        </div>
      `;

  return renderDetailPageTemplate({
    entityType: 'Evento de Auditoría Planificado',
    entitySymbol: '🗓️',
    title: audit.codigo_auditoria,
    eyebrowCode: `${audit.tipo_auditoria} · ${audit.metodologia}`,
    subtitle: `${audit.norma_codigo} · Sector IAF ${audit.sector_iaf} · ${audit.sede_principal_direccion}`,
    statusBadge: {
      label: st.label,
      badgeClass: st.badgeClass,
      dotClass: st.dotClass,
    },
    backButton: {
      label: 'Volver a Programación',
      nav: 'auditorias',
      subview: 'scheduling',
      action: 'back-to-programacion-list',
    },
    editActionButton: {
      id: 'startEditProgAuditBtn',
      visible: canEditSchedule,
      isEditing: state.isEditingAttributes,
      cancelId: 'cancelEditProgAuditBtn',
    },
    extraActionButtonsHtml,
    trailingActionButtonsHtml,
    parents,
    parentMetaHtml,
    tableName: 'auditoria',
    recordId: audit.id,
    feedbackHtml,
    attributes: [],
    customRecordBodyHtml,
    childTabs: [
      { id: 'equipo', label: 'Equipo Auditor', symbol: '👥', count: audit.equipo.length },
      { id: 'muestreo', label: 'Sedes y Muestreo', symbol: '🏭', count: sortedSites.length },
      { id: 'matriz', label: 'Matriz Normativa', symbol: '✅', count: audit.matrizNormativa.length },
      { id: 'hallazgos', label: 'Hallazgos', symbol: '📋', count: auditFindings.length },
    ],
    activeChildTabId: activeTab,
    childTabAttrName: 'data-prog-tab',
    renderChildTabContent: (tabId) => {
      if (tabId === 'muestreo') {
        return renderSamplingChildTab(audit, sortedSites, canEditSchedule);
      }
      if (tabId === 'matriz') {
        return renderVerificationMatrixTab(audit, canEditMatrix);
      }
      if (tabId === 'hallazgos') {
        return renderFindingsChildTab(audit, auditFindings);
      }
      return renderTeamChildTab(audit, allAuditors, canAssignTeam, state.isAddingTeamMember);
    },
  });
}

function renderAttrCard(label: string, value: string, isMono = false): string {
  return `
    <div class="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-2xs space-y-1">
      <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">${escapeHtml(label)}</div>
      <div class="text-xs font-semibold text-slate-900 ${isMono ? 'font-mono' : ''}">${escapeHtml(value || '—')}</div>
    </div>
  `;
}

function renderEditAuditAttributesForm(
  audit: ProgramacionAuditEntity,
  auditors: AuditorDetailEntity[]
): string {
  const modalities = [
    'Etapa 1',
    'Etapa 2',
    'Seguimiento 1',
    'Seguimiento 2',
    'Renovación',
    'Diagnóstico',
    'Extraordinaria',
    'Especial',
  ];
  const statuses = ['Planificado', 'En Ejecución', 'En Espera', 'Completado', 'Cerrado', 'Cancelado'];

  return `
    <form id="editProgAuditForm" class="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label for="editProgTipo" class="block text-xs font-semibold text-slate-700 mb-1">Tipo / Modalidad</label>
          <select id="editProgTipo" class="w-full text-xs rounded-lg border border-slate-300 bg-white px-2.5 py-2">
            ${modalities
              .map(
                (m) =>
                  `<option value="${escapeHtml(m)}" ${audit.tipo_auditoria === m ? 'selected' : ''}>${escapeHtml(m)}</option>`
              )
              .join('')}
          </select>
        </div>

        <div>
          <label for="editProgMetodologia" class="block text-xs font-semibold text-slate-700 mb-1">Metodología</label>
          <select id="editProgMetodologia" class="w-full text-xs rounded-lg border border-slate-300 bg-white px-2.5 py-2">
            ${(['Presencial', 'Remota', 'Mixta'] as const)
              .map(
                (met) =>
                  `<option value="${met}" ${audit.metodologia === met ? 'selected' : ''}>${met}</option>`
              )
              .join('')}
          </select>
        </div>

        <div>
          <label for="editProgEstatus" class="block text-xs font-semibold text-slate-700 mb-1">Estatus Operativo</label>
          <select id="editProgEstatus" class="w-full text-xs rounded-lg border border-slate-300 bg-white px-2.5 py-2">
            ${statuses
              .map(
                (s) =>
                  `<option value="${escapeHtml(s)}" ${audit.estatus === s ? 'selected' : ''}>${escapeHtml(s)}</option>`
              )
              .join('')}
          </select>
        </div>

        <div>
          <label for="editProgFechaInicio" class="block text-xs font-semibold text-slate-700 mb-1">Fecha Inicio</label>
          <input type="date" id="editProgFechaInicio" value="${escapeHtml(audit.fecha_inicio)}" required class="w-full text-xs rounded-lg border border-slate-300 bg-white px-2.5 py-2" />
        </div>

        <div>
          <label for="editProgFechaFin" class="block text-xs font-semibold text-slate-700 mb-1">Fecha Fin</label>
          <input type="date" id="editProgFechaFin" value="${escapeHtml(audit.fecha_fin)}" required class="w-full text-xs rounded-lg border border-slate-300 bg-white px-2.5 py-2" />
        </div>

        <div>
          <label for="editProgDias" class="block text-xs font-semibold text-slate-700 mb-1">Días-Auditor</label>
          <input type="number" id="editProgDias" min="0.5" max="30" step="0.5" value="${audit.dias_auditor}" required class="w-full text-xs rounded-lg border border-slate-300 bg-white px-2.5 py-2" />
        </div>
      </div>

      <div>
        <label for="editProgAuditorLider" class="block text-xs font-semibold text-slate-700 mb-1">Auditor Líder Designado</label>
        <select id="editProgAuditorLider" class="w-full sm:w-1/2 text-xs rounded-lg border border-slate-300 bg-white px-2.5 py-2">
          ${auditors
            .map(
              (aud) =>
                `<option value="${escapeHtml(aud.id)}" ${aud.id === audit.auditor_lider_id ? 'selected' : ''}>${escapeHtml(aud.nombre)} (${escapeHtml(aud.normas_acreditadas.join(', '))})</option>`
            )
            .join('')}
        </select>
      </div>

      <div class="flex items-center justify-end gap-2">
        <button type="button" id="cancelEditProgAuditBtnSecondary" class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold cursor-pointer">
          Cancelar
        </button>
        <button type="submit" class="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer">
          Guardar Cambios
        </button>
      </div>
    </form>
  `;
}

function renderTeamChildTab(
  audit: ProgramacionAuditEntity,
  allAuditors: AuditorDetailEntity[],
  canAssignTeam: boolean,
  isAddingTeamMember: boolean
): string {
  const existingIds = new Set(audit.equipo.map((m) => m.id_auditor));
  const availableAuditors = allAuditors.filter((a) => !existingIds.has(a.id));

  return `
    <div class="space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h4 class="text-sm font-bold text-slate-900">Equipo Evaluador Designado (equipo_auditor)</h4>
          <p class="text-xs text-slate-500">
            Miembros calificados bajo ISO/IEC 17021-1:2015 cláusula 7.2 para ${escapeHtml(audit.norma_codigo)} · Sector IAF ${audit.sector_iaf}
          </p>
        </div>
        ${
          canAssignTeam && availableAuditors.length > 0 && !isAddingTeamMember
            ? `
              <button
                type="button"
                id="openAddTeamMemberBtn"
                class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer self-start sm:self-auto"
              >
                ➕ Asignar Evaluador
              </button>
            `
            : ''
        }
      </div>

      ${
        isAddingTeamMember && canAssignTeam && availableAuditors.length > 0
          ? `
            <form id="addTeamMemberForm" class="bg-indigo-50/70 border border-indigo-200 rounded-xl p-4 space-y-3">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label for="teamAuditorSelect" class="block text-xs font-semibold text-slate-700 mb-1">Auditor / Experto Disponible</label>
                  <select id="teamAuditorSelect" required class="w-full text-xs rounded-lg border border-slate-300 bg-white px-2.5 py-2">
                    ${availableAuditors
                      .map((aud) => {
                        const normaMatch = aud.normas_acreditadas.some((n) =>
                          n.toLowerCase().includes(audit.norma_codigo.toLowerCase().split(':')[0])
                        );
                        const iafMatch = aud.sectores_iaf.includes(audit.sector_iaf);
                        const badgeText =
                          normaMatch && iafMatch
                            ? '✓ Competente en Norma + IAF'
                            : normaMatch
                            ? '⚠️ Solo Norma (Requiere Experto IAF)'
                            : 'ℹ️ Apoyo / Formación';
                        return `<option value="${escapeHtml(aud.id)}">${escapeHtml(aud.nombre)} — ${badgeText}</option>`;
                      })
                      .join('')}
                  </select>
                </div>
                <div>
                  <label for="teamRoleSelect" class="block text-xs font-semibold text-slate-700 mb-1">Rol en el Equipo Auditor</label>
                  <select id="teamRoleSelect" required class="w-full text-xs rounded-lg border border-slate-300 bg-white px-2.5 py-2">
                    <option value="Auditor de Equipo">Auditor de Equipo</option>
                    <option value="Experto Técnico">Experto Técnico</option>
                    <option value="Auditor Líder">Auditor Líder</option>
                  </select>
                </div>
              </div>
              <div class="flex items-center justify-end gap-2">
                <button type="button" id="cancelAddTeamMemberBtn" class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold cursor-pointer">Cancelar</button>
                <button type="submit" class="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer">Confirmar Asignación</button>
              </div>
            </form>
          `
          : ''
      }

      <div class="border border-slate-200 rounded-lg overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
              <tr>
                <th class="px-4 py-2.5">Integrante</th>
                <th class="px-3 py-2.5">Rol en Auditoría</th>
                <th class="px-3 py-2.5">Alcance de Competencia</th>
                <th class="px-3 py-2.5">Credencial</th>
                <th class="px-3 py-2.5">Contacto</th>
                ${canAssignTeam ? '<th class="px-4 py-2.5 text-right">Acciones</th>' : ''}
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              ${audit.equipo
                .map((m) => {
                  const roleBadge =
                    m.rol === 'Auditor Líder'
                      ? 'bg-indigo-50 text-indigo-900 border-indigo-200'
                      : m.rol === 'Experto Técnico'
                      ? 'bg-purple-50 text-purple-900 border-purple-200'
                      : 'bg-sky-50 text-sky-900 border-sky-200';
                  const credBadge =
                    m.estado_credencial === 'Vigente'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : m.estado_credencial === 'Por Vencer'
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : 'bg-rose-50 text-rose-800 border-rose-200';
                  return `
                    <tr class="hover:bg-slate-50/70">
                      <td class="px-4 py-3 font-bold text-slate-900">
                        <button
                          type="button"
                          data-action="select-auditor"
                          data-auditor-id="${escapeHtml(m.id_auditor)}"
                          class="text-indigo-700 hover:text-indigo-900 hover:underline font-bold cursor-pointer text-left"
                        >
                          ${escapeHtml(m.nombre)}
                        </button>
                      </td>
                      <td class="px-3 py-3">
                        <span class="inline-flex px-2 py-0.5 rounded text-[11px] font-bold border ${roleBadge}">
                          ${escapeHtml(m.rol)}
                        </span>
                      </td>
                      <td class="px-3 py-3">
                        <div class="font-semibold text-slate-800">${escapeHtml(m.competencia_norma)}</div>
                        <div class="text-[11px] text-slate-500">Sector IAF ${m.competencia_sector_iaf}</div>
                      </td>
                      <td class="px-3 py-3">
                        <div class="font-mono text-[11px] font-semibold text-slate-700">${escapeHtml(m.credencial_codigo)}</div>
                        <span class="inline-flex mt-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold border ${credBadge}">${escapeHtml(m.estado_credencial)}</span>
                      </td>
                      <td class="px-3 py-3 text-[11px] text-slate-600">
                        <div>${escapeHtml(m.email || '—')}</div>
                        <div class="font-mono">${escapeHtml(m.telefono || '')}</div>
                      </td>
                      ${
                        canAssignTeam
                          ? `
                            <td class="px-4 py-3 text-right">
                              ${
                                m.rol !== 'Auditor Líder'
                                  ? `
                                    <button
                                      type="button"
                                      data-action="remove-team-member"
                                      data-audit-id="${escapeHtml(audit.id)}"
                                      data-member-id="${escapeHtml(m.id)}"
                                      class="text-xs font-semibold text-rose-700 hover:text-rose-900 cursor-pointer"
                                    >
                                      Retirar
                                    </button>
                                  `
                                  : '<span class="text-[11px] text-slate-400">Titular</span>'
                              }
                            </td>
                          `
                          : ''
                      }
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function renderSamplingChildTab(
  audit: ProgramacionAuditEntity,
  sortedSites: ProgramacionAuditEntity['sitiosMuestreo'],
  canEdit: boolean
): string {
  return `
    <div class="space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h4 class="text-sm font-bold text-slate-900">Plan de Muestreo Multisitio (alcance_auditoria_sitio)</h4>
          <p class="text-xs text-slate-500">
            Distribución de sedes bajo IAF MD 1:2018 (Sitio 0 corresponde a Sede Principal HQ), modalidad presencial/remota y días asignados.
          </p>
        </div>
      </div>

      <div class="border border-slate-200 rounded-lg overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
              <tr>
                <th class="px-4 py-2.5">Sitio</th>
                <th class="px-3 py-2.5">Ubicación</th>
                <th class="px-3 py-2.5">Modalidad de Evaluación</th>
                <th class="px-3 py-2.5">Fecha Asignada</th>
                <th class="px-3 py-2.5">Días</th>
                <th class="px-3 py-2.5">En Muestra</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              ${sortedSites
                .map((site) => {
                  const isHq = site.numero_sitio === 0;
                  return `
                    <tr class="hover:bg-slate-50/70">
                      <td class="px-4 py-3">
                        <div class="flex items-center gap-1.5">
                          <span class="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            isHq
                              ? 'bg-indigo-100 text-indigo-900 border border-indigo-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }">
                            ${isHq ? 'Sitio 0 (HQ)' : `Sitio #${site.numero_sitio}`}
                          </span>
                          <button
                            type="button"
                            data-action="select-sitio"
                            data-sitio-id="${escapeHtml(site.id_sitio)}"
                            data-cert-id="${escapeHtml(audit.id_certificado)}"
                            class="font-bold text-indigo-700 hover:text-indigo-900 hover:underline text-left cursor-pointer"
                          >
                            ${escapeHtml(site.nombre_sitio)}
                          </button>
                        </div>
                        ${
                          site.notas
                            ? `<div class="text-[11px] text-slate-500 mt-0.5">${escapeHtml(site.notas)}</div>`
                            : ''
                        }
                      </td>
                      <td class="px-3 py-3 text-slate-600 max-w-xs xl:max-w-md">${escapeHtml(site.direccion_sitio)}</td>
                      <td class="px-3 py-3">
                        ${
                          canEdit
                            ? `
                              <select
                                aria-label="Modalidad para ${escapeHtml(site.nombre_sitio)}"
                                data-action="change-site-sampling-mode"
                                data-audit-id="${escapeHtml(audit.id)}"
                                data-site-id="${escapeHtml(site.id)}"
                                class="text-xs font-semibold rounded-lg border border-slate-300 bg-white px-2 py-1"
                              >
                                <option value="Presencial" ${site.modalidad_evaluacion === 'Presencial' ? 'selected' : ''}>🏭 Presencial</option>
                                <option value="Remota" ${site.modalidad_evaluacion === 'Remota' ? 'selected' : ''}>💻 Remota</option>
                              </select>
                            `
                            : `
                              <span class="px-2 py-0.5 rounded text-[11px] font-semibold border ${
                                site.modalidad_evaluacion === 'Presencial'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-cyan-50 text-cyan-800 border-cyan-200'
                              }">${escapeHtml(site.modalidad_evaluacion)}</span>
                            `
                        }
                      </td>
                      <td class="px-3 py-3 font-mono text-slate-800">
                        ${
                          canEdit
                            ? `
                              <input
                                type="date"
                                aria-label="Fecha asignada para ${escapeHtml(site.nombre_sitio)}"
                                data-action="change-site-sampling-date"
                                data-audit-id="${escapeHtml(audit.id)}"
                                data-site-id="${escapeHtml(site.id)}"
                                value="${escapeHtml(site.fecha_asignada)}"
                                class="text-xs font-mono rounded-lg border border-slate-300 bg-white px-2 py-1"
                              />
                            `
                            : escapeHtml(site.fecha_asignada)
                        }
                      </td>
                      <td class="px-3 py-3 font-mono font-semibold text-slate-700">${site.dias_asignados} d</td>
                      <td class="px-3 py-3">
                        ${
                          canEdit
                            ? `
                              <button
                                type="button"
                                data-action="toggle-site-sampled"
                                data-audit-id="${escapeHtml(audit.id)}"
                                data-site-id="${escapeHtml(site.id)}"
                                class="px-2.5 py-1 rounded-full text-[11px] font-bold border cursor-pointer transition-colors ${
                                  site.muestreado
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                                    : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                                }"
                              >
                                ${site.muestreado ? '✓ Incluida' : 'No muestreada'}
                              </button>
                            `
                            : `<span class="text-xs font-semibold">${site.muestreado ? '✓ Incluida' : 'No'}</span>`
                        }
                      </td>
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function renderVerificationMatrixTab(
  audit: ProgramacionAuditEntity,
  canEdit: boolean
): string {
  const statuses: Array<ProgramacionAuditEntity['matrizNormativa'][number]['estado_verificacion']> = [
    'Planificada',
    'Conforme',
    'Hallazgo',
    'No Aplicable',
  ];

  return `
    <div class="space-y-4">
      <div>
        <h4 class="text-sm font-bold text-slate-900">Matriz de Verificación Normativa</h4>
        <p class="text-xs text-slate-500">
          Lista de verificación de cláusulas normativas (requisito) programadas por proceso auditado durante la ejecución.
        </p>
      </div>

      <div class="border border-slate-200 rounded-lg overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
              <tr>
                <th class="px-4 py-2.5">Cláusula</th>
                <th class="px-3 py-2.5">Requisito Normativo</th>
                <th class="px-3 py-2.5">Proceso Auditado</th>
                <th class="px-3 py-2.5">Estado de Verificación</th>
                <th class="px-4 py-2.5">Notas de Campo</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              ${audit.matrizNormativa
                .map((item) => {
                  const statusClass =
                    item.estado_verificacion === 'Conforme'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : item.estado_verificacion === 'Hallazgo'
                      ? 'bg-rose-50 text-rose-800 border-rose-200'
                      : item.estado_verificacion === 'No Aplicable'
                      ? 'bg-slate-100 text-slate-600 border-slate-200'
                      : 'bg-sky-50 text-sky-800 border-sky-200';

                  return `
                    <tr class="hover:bg-slate-50/70">
                      <td class="px-4 py-3 font-mono font-bold text-indigo-700 whitespace-nowrap">
                        Cláusula ${escapeHtml(item.codigo_clausula)}
                      </td>
                      <td class="px-3 py-3 font-semibold text-slate-900">
                        ${escapeHtml(item.titulo_clausula)}
                      </td>
                      <td class="px-3 py-3 text-slate-700">
                        <button
                          type="button"
                          data-action="select-proceso-by-name"
                          data-cert-id="${escapeHtml(audit.id_certificado)}"
                          data-proceso-nombre="${escapeHtml(item.proceso_nombre)}"
                          class="font-bold text-indigo-700 hover:text-indigo-900 hover:underline cursor-pointer text-left"
                        >
                          ${escapeHtml(item.proceso_nombre)}
                        </button>
                      </td>
                      <td class="px-3 py-3">
                        ${
                          canEdit
                            ? `
                              <select
                                aria-label="Estado de verificación cláusula ${escapeHtml(item.codigo_clausula)}"
                                data-action="change-matrix-status"
                                data-audit-id="${escapeHtml(audit.id)}"
                                data-item-id="${escapeHtml(item.id)}"
                                class="text-xs font-semibold rounded-lg border px-2 py-1 ${statusClass}"
                              >
                                ${statuses
                                  .map(
                                    (st) =>
                                      `<option value="${st}" ${item.estado_verificacion === st ? 'selected' : ''}>${st}</option>`
                                  )
                                  .join('')}
                              </select>
                            `
                            : `
                              <span class="inline-flex px-2 py-0.5 rounded text-[11px] font-bold border ${statusClass}">
                                ${escapeHtml(item.estado_verificacion)}
                              </span>
                            `
                        }
                      </td>
                      <td class="px-4 py-3 text-slate-600">
                        ${escapeHtml(item.notas || '—')}
                      </td>
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function renderFindingsChildTab(
  audit: ProgramacionAuditEntity,
  findings: Phase5FindingEntity[]
): string {
  if (findings.length === 0) {
    return `
      <div class="space-y-3">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 class="text-sm font-bold text-slate-900">Hallazgos Registrados en el Evento</h4>
            <p class="text-xs text-slate-500">
              No conformidades, observaciones y oportunidades de mejora vinculadas a ${escapeHtml(audit.codigo_auditoria)}.
            </p>
          </div>
          <button
            type="button"
            data-action="go-audit-results"
            data-audit-id="${escapeHtml(audit.id)}"
            class="px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-semibold cursor-pointer self-start sm:self-auto"
          >
            Abrir Tablero de Hallazgos →
          </button>
        </div>
        <div class="p-8 text-center text-slate-500 text-xs bg-slate-50 rounded-xl border border-slate-200">
          Esta auditoría aún no tiene hallazgos ni comentarios de campo registrados.
        </div>
      </div>
    `;
  }

  return `
    <div class="space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h4 class="text-sm font-bold text-slate-900">Hallazgos y Desviaciones Detectadas</h4>
          <p class="text-xs text-slate-500">
            Registro resumido de hallazgos vinculados a ${escapeHtml(audit.codigo_auditoria)}.
          </p>
        </div>
        <button
          type="button"
          data-action="go-audit-results"
          data-audit-id="${escapeHtml(audit.id)}"
          class="px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-semibold cursor-pointer self-start sm:self-auto"
        >
          Gestionar en Resultado →
        </button>
      </div>

      <div class="border border-slate-200 rounded-lg overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
              <tr>
                <th class="px-4 py-2.5">Código</th>
                <th class="px-3 py-2.5">Clasificación</th>
                <th class="px-3 py-2.5">Cláusula & Proceso</th>
                <th class="px-3 py-2.5">Descripción</th>
                <th class="px-3 py-2.5">Ciclo de Vida</th>
                <th class="px-4 py-2.5 text-right">Acción</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              ${findings
                .map((f) => {
                  const tMeta = getPhase5FindingTypeMeta(f.tipo);
                  const lMeta = getLifecycleStatusMeta(f.estado_ciclo);
                  return `
                    <tr class="hover:bg-slate-50/70 transition-colors">
                      <td class="px-4 py-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                        ${escapeHtml(f.codigo_hallazgo)}
                      </td>
                      <td class="px-3 py-3 whitespace-nowrap">
                        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border ${tMeta.badgeClass}">
                          <span>${tMeta.symbol}</span>
                          <span>${escapeHtml(tMeta.shortLabel)}</span>
                        </span>
                      </td>
                      <td class="px-3 py-3">
                        <div class="font-mono font-semibold text-indigo-700">Cláusula ${escapeHtml(f.requisito_codigo)}</div>
                        <div class="text-[11px] text-slate-500">${escapeHtml(f.proceso_nombre)}</div>
                      </td>
                      <td class="px-3 py-3 text-slate-700 max-w-xs xl:max-w-md">
                        <p class="line-clamp-2">${escapeHtml(f.descripcion)}</p>
                      </td>
                      <td class="px-3 py-3 whitespace-nowrap">
                        <span class="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold border ${lMeta.badgeClass}">
                          ${escapeHtml(lMeta.label)}
                        </span>
                      </td>
                      <td class="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          data-action="go-audit-results"
                          data-audit-id="${escapeHtml(audit.id)}"
                          class="text-xs font-semibold text-indigo-700 hover:text-indigo-900 hover:underline cursor-pointer"
                        >
                          Revisar →
                        </button>
                      </td>
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}
