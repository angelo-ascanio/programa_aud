import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import type { CertificateRecord } from '../lib/searchControls';
import {
  sortSitesWithPrincipalFirst,
  type CertificadoDetailEntity,
} from '../lib/multisiteSampling';
import type { AuditorDetailEntity } from '../lib/competencyMatrix';
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
  type Phase5FindingEntity,
  type ProgramacionAuditEntity,
  type ProgramacionChildTab,
  type ProgramacionSubView,
  type ProgramacionViewState,
} from '../lib/auditExecution';
import {
  buildCertificateAuditHistoryDigest,
  computeAuditCalendarSpanDays,
  computeProgramPlanningStatus,
  detectAuditorScheduleConflicts,
  findUnprogrammedCertificatesByStatus,
  formatAuditDateLabel,
  resolveLatestAuditDate,
  type AuditAlertItem,
  type AuditDateEntry,
  type AuditLinkLevel,
  type AuditLinkNature,
  type ProgramaAuditoriaEntity,
  type ProgramPlanningStatusResult,
  type UnprogrammedCertificateCandidate,
} from '../lib/auditPlanningEngine';
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

export type { ProgramacionViewState, ProgramacionChildTab, ProgramacionSubView };

export interface ProgramacionViewProps {
  profile: UserProfile;
  state: ProgramacionViewState;
  audits: ProgramacionAuditEntity[];
  auditors: AuditorDetailEntity[];
  certificates: CertificateRecord[];
  findings?: Phase5FindingEntity[];
  programs?: ProgramaAuditoriaEntity[];
  allCertificadosDetailed?: CertificadoDetailEntity[];
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
  props: ProgramacionViewProps
): ProgramaAuditoriaEntity[] {
  const sourcePrograms =
    props.programs && props.programs.length > 0
      ? props.programs
      : buildFallbackProgramsFromAudits(props.audits);

  return sourcePrograms
    .filter((p) => !p.deleted_at)
    .map((p) => ({
      ...p,
      auditorias: (p.auditorias || [])
        .filter((a) => !a.deleted_at)
        .map((a) => ({
          ...a,
          latestDate: a.latestDate ?? resolveEffectiveLatestDateForAudit(a),
        })),
    }));
}

export function renderProgramacionView(props: ProgramacionViewProps): string {
  const {
    profile,
    state,
    audits,
    auditors,
    certificates,
    findings = [],
    allCertificadosDetailed,
    loading = false,
    archiveConfig,
  } = props;
  const canPlan = canEditAuditScheduleOrTeam(profile);
  const resolvedPrograms = resolveActivePrograms(props);

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

  if (state.isCreating && canPlan) {
    return renderProgramCreationHandoffView(state, certificates, allCertificadosDetailed);
  }

  if (state.selectedProgramId) {
    const selectedProgram = resolvedPrograms.find((p) => p.id === state.selectedProgramId);
    if (selectedProgram) {
      if (selectedProgram.auditorias.length > 0) {
        return renderProgramacionDetailView(
          profile,
          state,
          selectedProgram.auditorias[0],
          auditors,
          findings
        );
      }
      return renderEmptyProgramSummaryShell(selectedProgram);
    }
  }

  return renderProgramacionDirectoryView(
    props,
    resolvedPrograms,
    loading,
    archiveConfig
  );
}

function renderProgramCreationHandoffView(
  state: ProgramacionViewState,
  certificates: CertificateRecord[],
  allCertificadosDetailed?: CertificadoDetailEntity[]
): string {
  const prefillDetailed = state.prefillCertId
    ? allCertificadosDetailed?.find((c) => c.id === state.prefillCertId)
    : undefined;
  const prefillBasic = state.prefillCertId
    ? certificates.find((c) => c.id === state.prefillCertId)
    : undefined;
  const prefillNumber =
    prefillDetailed?.numero_certificado || prefillBasic?.numero_certificado || '';
  const prefillOrg =
    prefillDetailed?.organizacion_nombre || prefillBasic?.organizacion_nombre || '';
  const prefillNorma = prefillDetailed?.norma_codigo || prefillBasic?.norma || '';
  const prefillStatus = prefillDetailed?.estatus || prefillBasic?.estatus || '';

  return `
    <div class="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
      <header class="px-5 py-4 sm:px-6 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <button
              type="button"
              data-action="cancel-create-program"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer transition-colors"
            >
              <span aria-hidden="true">←</span>
              <span>Volver a Programación</span>
            </button>
            <span class="px-2 py-0.5 rounded bg-sky-50 border border-sky-200 text-sky-800 text-[11px] font-bold">
              Modo Creación · Paso 1
            </span>
          </div>
          <h1 class="text-xl font-bold tracking-tight text-slate-900">
            Nuevo Programa de Auditoría
          </h1>
          <p class="text-xs text-slate-500">
            Configure la campaña de auditoría (Individual, Nivel 1 Intra-Organización o Nivel 2 Inter-Organización) y seleccione los certificados a programar.
          </p>
        </div>
      </header>

      <div class="p-6 space-y-5">
        ${
          prefillNumber
            ? `
              <div class="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 space-y-1.5">
                <div class="text-[11px] font-bold uppercase tracking-wider text-indigo-700">
                  Certificado Preseleccionado desde Sin Programación
                </div>
                <div class="flex flex-wrap items-center gap-2 text-xs">
                  <span class="font-mono font-bold text-slate-900 bg-white px-2.5 py-1 rounded border border-indigo-200">
                    ${escapeHtml(prefillNumber)}
                  </span>
                  <span class="font-bold text-slate-900">${escapeHtml(prefillOrg)}</span>
                  ${
                    prefillNorma
                      ? `<span class="px-2 py-0.5 rounded bg-white border border-slate-200 font-semibold text-slate-700">${escapeHtml(prefillNorma)}</span>`
                      : ''
                  }
                  ${
                    prefillStatus
                      ? `<span class="px-2 py-0.5 rounded-full bg-slate-900 text-white text-[11px] font-semibold">${escapeHtml(prefillStatus)}</span>`
                      : ''
                  }
                </div>
              </div>
            `
            : `
              <div class="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-xs text-slate-600">
                Selección abierta de certificados disponibles para iniciar una nueva campaña Individual o Vinculada.
              </div>
            `
        }

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div class="p-4 rounded-xl border border-slate-200 bg-white space-y-1">
            <div class="text-[11px] font-bold uppercase tracking-wider text-slate-400">Nivel de Vinculación</div>
            <div class="font-bold text-slate-900">Individual · Nivel 1 · Nivel 2</div>
            <p class="text-slate-500">Validación de pertenencia organizacional e integridad multi-certificado.</p>
          </div>
          <div class="p-4 rounded-xl border border-slate-200 bg-white space-y-1">
            <div class="text-[11px] font-bold uppercase tracking-wider text-slate-400">Naturaleza</div>
            <div class="font-bold text-slate-900">Combinada · Integrada · Conjunta · Multientidad</div>
            <p class="text-slate-500">Soporte completo para evolución de ciclo desde campañas previas.</p>
          </div>
          <div class="p-4 rounded-xl border border-slate-200 bg-white space-y-1">
            <div class="text-[11px] font-bold uppercase tracking-wider text-slate-400">Multi-Fecha & Balance</div>
            <div class="font-bold text-slate-900">Pre-programada Mes/Año o Fecha Real</div>
            <p class="text-slate-500">Planificación progresiva sin bloqueo por campos opcionales en borrador.</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderEmptyProgramSummaryShell(program: ProgramaAuditoriaEntity): string {
  const linkBadge = getProgramLinkingBadgeMeta(program.nivel_vinculacion, program.tipo_vinculacion);
  return `
    <div class="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
      <header class="px-5 py-4 sm:px-6 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div class="space-y-1">
          <button
            type="button"
            id="backToProgramacionListBtn"
            data-action="back-to-programacion-list"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer transition-colors"
          >
            <span aria-hidden="true">←</span>
            <span>Volver a Programación</span>
          </button>
          <div class="flex flex-wrap items-center gap-2 pt-1">
            <span class="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
              ${escapeHtml(program.codigo_programa || 'PROGRAMA')}
            </span>
            <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${linkBadge.className}">
              ${escapeHtml(linkBadge.label)}
            </span>
          </div>
          <h1 class="text-xl font-bold tracking-tight text-slate-900">
            ${escapeHtml(program.etiqueta)}
          </h1>
        </div>
      </header>
      <div class="p-6 text-xs text-slate-600">
        Este programa aún no tiene certificados u auditorías vinculadas en la campaña.
      </div>
    </div>
  `;
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
