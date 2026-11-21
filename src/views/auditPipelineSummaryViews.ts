import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import type { ProgramacionAuditEntity, Phase5FindingEntity } from '../lib/auditExecution';
import {
  formatAuditDateLabel,
  resolveLatestAuditDate,
  resolveLatestPlannedDate,
  type AuditDateEntry,
  type ProgramaAuditoriaEntity,
} from '../lib/auditPlanningEngine';
import type { AuditoriaSitioTemporalEntity } from '../lib/designacionTemporalDomain';
import type {
  ColumnDefinition,
  MultiViewFacetCategory,
  UniversalViewMode,
} from '../lib/universalTemplate';
import { renderUniversalTemplate } from './universalTemplate';
import { renderDetailPageTemplate } from './detailTemplate';
import { isApprovedStaffProfile } from '../lib/rbac';

export interface AuditPipelineSummaryViewProps {
  profile: UserProfile;
  audits: ReadonlyArray<ProgramacionAuditEntity>;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  temporalSites: ReadonlyArray<AuditoriaSitioTemporalEntity>;
  findings?: ReadonlyArray<Phase5FindingEntity>;
  selectedAuditId: string | null;
  query?: string;
  viewMode?: UniversalViewMode;
  isSidebarOpen?: boolean;
  loading?: boolean;
  tableColumnWidths?: Record<string, Record<string, number>>;
  inCardBreadcrumbHtml?: string;
  headerAddAuditHtml?: string;
}

const DATE_KIND_LABELS: Record<string, string> = {
  PREPROGRAMADA_MES: 'Preprogramada (Mes/Año)',
  PROGRAMADA_EXACTA: 'Programada Exacta',
  REAL: 'Ejecución Real (REAL)',
};

function getEffectiveAuditDates(audit: ProgramacionAuditEntity): AuditDateEntry[] {
  return (audit.fechas || [])
    .filter((f) => !f.deleted_at)
    .slice()
    .sort((a, b) => a.numero_secuencia - b.numero_secuencia);
}

function getLatestPlannedLabel(audit: ProgramacionAuditEntity): string {
  const planned =
    resolveLatestPlannedDate(audit.fechas) ??
    (audit.latestDate && !audit.latestDate.deleted_at ? audit.latestDate : null);
  if (planned) return formatAuditDateLabel(planned);
  if (audit.fecha_inicio) {
    return audit.fecha_fin && audit.fecha_fin !== audit.fecha_inicio
      ? `${audit.fecha_inicio} al ${audit.fecha_fin}`
      : audit.fecha_inicio;
  }
  return 'Sin fecha planificada';
}

export function renderDesignacionFechaView(props: AuditPipelineSummaryViewProps): string {
  const {
    profile,
    audits,
    programs,
    selectedAuditId,
    query = '',
    viewMode = 'list',
    isSidebarOpen = true,
    loading = false,
    tableColumnWidths,
    inCardBreadcrumbHtml = '',
    headerAddAuditHtml = '',
  } = props;

  const isStaff = isApprovedStaffProfile(profile);
  const activeAudits = audits.filter((a) => !a.deleted_at);
  const programById = new Map(programs.filter((p) => !p.deleted_at).map((p) => [p.id, p]));

  const selectedAudit = selectedAuditId
    ? activeAudits.find((a) => a.id === selectedAuditId) || null
    : null;

  if (selectedAudit) {
    const program = selectedAudit.id_programa_auditoria
      ? programById.get(selectedAudit.id_programa_auditoria) || null
      : null;
    const fechas = getEffectiveAuditDates(selectedAudit);
    const latest = resolveLatestAuditDate(fechas);
    const latestPlanned = resolveLatestPlannedDate(fechas);
    const realDates = fechas.filter((f) => f.tipo_fecha === 'REAL');

    const timelineHtml =
      fechas.length === 0
        ? `
          <div class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 font-semibold">
            Esta auditoría aún no tiene hitos de fecha registrados en su historial 1:N.
          </div>
        `
        : `
          <div class="space-y-2">
            ${fechas
              .map((f, idx) => {
                const isLatest = latest?.id === f.id;
                const badgeCls =
                  f.tipo_fecha === 'REAL'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : f.tipo_fecha === 'PROGRAMADA_EXACTA'
                    ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                    : 'bg-slate-100 text-slate-700 border-slate-200';
                return `
                  <div class="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border ${
                    isLatest
                      ? 'border-slate-900/30 bg-slate-50'
                      : 'border-slate-200 bg-white'
                  }">
                    <div class="flex items-center gap-2.5 min-w-0">
                      <span class="px-2 py-0.5 rounded bg-slate-900 text-white text-[10px] font-mono font-bold">
                        #${f.numero_secuencia || idx + 1}
                      </span>
                      <span class="px-2 py-0.5 rounded-full border text-[10px] font-bold ${badgeCls}">
                        ${escapeHtml(DATE_KIND_LABELS[f.tipo_fecha] || f.tipo_fecha)}
                      </span>
                      <span class="text-xs font-bold text-slate-900">
                        ${escapeHtml(formatAuditDateLabel(f))}
                      </span>
                    </div>
                    <div class="text-[11px] text-slate-500">
                      ${escapeHtml(f.observacion || (isLatest ? 'Hito vigente' : 'Registro histórico'))}
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
        `;

    const customRecordBodyHtml = `
      <div class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div class="bg-slate-50/80 border border-slate-200 rounded-xl p-3 space-y-0.5">
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Fecha Planificada Vigente</span>
            <p class="text-xs font-bold text-slate-900">${escapeHtml(
              latestPlanned ? formatAuditDateLabel(latestPlanned) : getLatestPlannedLabel(selectedAudit)
            )}</p>
          </div>
          <div class="bg-slate-50/80 border border-slate-200 rounded-xl p-3 space-y-0.5">
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Hitos de Reprogramación</span>
            <p class="text-xs font-bold text-slate-900">${fechas.length} registro${fechas.length === 1 ? '' : 's'} 1:N</p>
          </div>
          <div class="bg-slate-50/80 border border-slate-200 rounded-xl p-3 space-y-0.5">
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Fechas Reales (REAL)</span>
            <p class="text-xs font-bold text-slate-900">${
              realDates.length > 0
                ? escapeHtml(formatAuditDateLabel(realDates[realDates.length - 1]))
                : 'Pendiente de ejecución'
            }</p>
          </div>
        </div>

        <section class="space-y-2">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="text-xs font-bold uppercase tracking-wider text-slate-700">
              Historial de Fechas y Reprogramaciones 1:N
            </h2>
            ${
              isStaff
                ? `
                  <button
                    type="button"
                    data-action="audit-breadcrumb-nav"
                    data-target-subview="designacion/tipo"
                    class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-800 cursor-pointer"
                  >
                    🏷️ Gestionar Reprogramación en Tipo →
                  </button>
                `
                : ''
            }
          </div>
          ${timelineHtml}
        </section>
      </div>
    `;

    return renderDetailPageTemplate({
      entityType: 'Designación → Fecha',
      entitySymbol: '📅',
      title: `${selectedAudit.numero_certificado} · ${selectedAudit.organizacion_nombre}`,
      eyebrowCode: selectedAudit.codigo_auditoria,
      subtitle: `${selectedAudit.tipo_auditoria} · ${program?.etiqueta || 'Campaña'}`,
      statusBadge: {
        label: selectedAudit.estado_ciclo || selectedAudit.estatus,
        badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
      },
      backButton: {
        label: 'Volver',
        nav: 'auditorias',
        subview: 'designacion/fecha',
        action: 'back-to-shared-multi-view',
      },
      topInCardHtml: inCardBreadcrumbHtml,
      extraActionButtonsHtml: headerAddAuditHtml,
      parents: [
        {
          label: 'Certificado',
          value: selectedAudit.numero_certificado,
          symbol: '📜',
          navAction: {
            nav: 'certificacion',
            subview: 'certificates',
            entityType: 'cert',
            entityId: selectedAudit.id_certificado,
          },
        },
        ...(program
          ? [
              {
                label: 'Campaña',
                value: program.etiqueta,
                symbol: '🧭',
              },
            ]
          : []),
      ],
      tableName: 'auditoria_fecha',
      recordId: selectedAudit.id,
      attributes: [],
      customRecordBodyHtml,
    });
  }

  const normalizedQ = query.trim().toLowerCase();
  const filtered = normalizedQ
    ? activeAudits.filter((a) =>
        [
          a.codigo_auditoria,
          a.numero_certificado,
          a.organizacion_nombre,
          a.norma_codigo,
          a.tipo_auditoria,
          getLatestPlannedLabel(a),
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQ)
      )
    : activeAudits;

  const columns: ColumnDefinition<ProgramacionAuditEntity>[] = [
    {
      id: 'codigo',
      header: 'Auditoría',
      defaultWidthPct: 22,
      minWidthPx: 140,
      renderCell: (a) => `
        <div class="min-w-0">
          <div class="font-mono text-xs font-bold text-slate-900 truncate">${escapeHtml(a.codigo_auditoria)}</div>
          <div class="text-[11px] text-slate-500 truncate">${escapeHtml(a.tipo_auditoria)}</div>
        </div>
      `,
    },
    {
      id: 'certificado',
      header: 'Certificado & Organización',
      defaultWidthPct: 36,
      minWidthPx: 200,
      renderCell: (a) => `
        <div class="min-w-0">
          <div class="font-mono text-xs font-bold text-slate-900 truncate">${escapeHtml(a.numero_certificado)}</div>
          <div class="text-[11px] text-slate-600 truncate">${escapeHtml(a.organizacion_nombre)}</div>
        </div>
      `,
    },
    {
      id: 'fecha_vigente',
      header: 'Fecha Vigente',
      defaultWidthPct: 26,
      minWidthPx: 160,
      renderCell: (a) => `
        <span class="text-xs font-semibold text-slate-800">${escapeHtml(getLatestPlannedLabel(a))}</span>
      `,
    },
    {
      id: 'reprogramaciones',
      header: 'Hitos 1:N',
      defaultWidthPct: 16,
      minWidthPx: 100,
      renderCell: (a) => {
        const count = getEffectiveAuditDates(a).length;
        return `<span class="px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-700">${count} hito${count === 1 ? '' : 's'}</span>`;
      },
    },
  ];

  const facetGroups: MultiViewFacetCategory<ProgramacionAuditEntity>[] = [];
  void facetGroups;

  return renderUniversalTemplate<ProgramacionAuditEntity>({
    domainKey: 'designacion-fecha',
    tableId: 'designacion-fecha-main',
    title: 'Designación → Fecha de Auditoría',
    subtitle:
      'Calendario maestro de preprogramaciones mensuales, fechas exactas y reprogramaciones 1:N por auditoría.',
    entityLabel: 'auditorías con programación temporal',
    searchQuery: query,
    searchPlaceholder: 'Buscar por código, certificado, organización o fecha...',
    searchInputId: 'designacion-fechaSearchInput',
    clearSearchBtnId: 'clearDesignacionFechaSearchBtn',
    totalCount: activeAudits.length,
    filteredCount: filtered.length,
    viewMode,
    isSidebarOpen,
    sortState: { column: null, direction: 'none' },
    columnWidths: tableColumnWidths?.['designacion-fecha-main'],
    facetGroups: [],
    items: filtered,
    columns,
    getRowAttrs: (a) =>
      `data-action="select-shared-audit" data-audit-id="${escapeHtml(a.id)}" data-cert-id="${escapeHtml(a.id_certificado)}" title="Abrir fechas de ${escapeHtml(a.codigo_auditoria)}"`,
    renderCard: (a) => `
      <article
        data-action="select-shared-audit"
        data-audit-id="${escapeHtml(a.id)}"
        data-cert-id="${escapeHtml(a.id_certificado)}"
        class="bg-white border border-slate-200 hover:border-indigo-300 rounded-xl p-4 shadow-2xs space-y-2 cursor-pointer"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="font-mono text-xs font-bold text-slate-900">${escapeHtml(a.codigo_auditoria)}</span>
          <span class="text-[11px] font-semibold text-indigo-700">${escapeHtml(a.tipo_auditoria)}</span>
        </div>
        <div class="text-xs font-bold text-slate-800 truncate">${escapeHtml(a.numero_certificado)}</div>
        <div class="text-[11px] text-slate-500 truncate">${escapeHtml(a.organizacion_nombre)}</div>
        <div class="pt-2 border-t border-slate-100 text-xs font-semibold text-slate-700">
          📅 ${escapeHtml(getLatestPlannedLabel(a))}
        </div>
      </article>
    `,
    actionsHtml: headerAddAuditHtml,
    loading,
    emptyStateTitle: 'Sin auditorías registradas en Designación → Fecha',
    emptyStateMessage:
      'Use "+ Auditoría" para programar una nueva campaña desde Conglomerado y Vínculo.',
  });
}

export function renderAuditResumenView(props: AuditPipelineSummaryViewProps): string {
  const {
    audits,
    programs,
    temporalSites,
    findings = [],
    selectedAuditId,
    query = '',
    viewMode = 'list',
    isSidebarOpen = true,
    loading = false,
    tableColumnWidths,
    inCardBreadcrumbHtml = '',
    headerAddAuditHtml = '',
  } = props;

  const activeAudits = audits.filter((a) => !a.deleted_at);
  const activePrograms = programs.filter((p) => !p.deleted_at);
  const programById = new Map(activePrograms.map((p) => [p.id, p]));

  const selectedAudit = selectedAuditId
    ? activeAudits.find((a) => a.id === selectedAuditId) || null
    : null;

  if (selectedAudit) {
    const program = selectedAudit.id_programa_auditoria
      ? programById.get(selectedAudit.id_programa_auditoria) || null
      : null;
    const regularSites = (selectedAudit.sitiosPlan || []).filter((s) => !s.deleted_at);
    const campaignAuditIds = new Set(
      (program ? program.auditorias.filter((a) => !a.deleted_at).map((a) => a.id) : [selectedAudit.id])
    );
    const activeTemp = temporalSites.filter(
      (t) =>
        !t.deleted_at &&
        campaignAuditIds.has(t.id_auditoria) &&
        (t.certificados.length === 0 ||
          t.certificados.some((c) => !c.deleted_at && c.numero_certificado === selectedAudit.numero_certificado))
    );
    const regularDays = regularSites.reduce((acc, s) => acc + (s.tiempo_auditoria || 0), 0);
    const tempDays = activeTemp.reduce((acc, t) => acc + (t.tiempo_auditoria || 0), 0);
    const siteTeamCount = regularSites.reduce(
      (acc, s) => acc + (s.equipoSitio || []).filter((e) => !e.deleted_at).length,
      0
    );
    const teamMembersCount = siteTeamCount > 0 ? siteTeamCount : selectedAudit.equipo.length;
    const procesosCount = regularSites.reduce(
      (acc, s) => acc + (s.procesos || []).filter((p) => !p.deleted_at).length,
      0
    );
    const turnosCount = regularSites.reduce(
      (acc, s) =>
        acc +
        (s.procesos || [])
          .filter((p) => !p.deleted_at)
          .reduce(
            (tAcc, p) => tAcc + (p.turnos || []).filter((t) => !t.deleted_at).length,
            0
          ),
      0
    );
    const auditFindings = findings.filter((f) => !f.deleted_at && f.id_auditoria === selectedAudit.id);
    const openFindings = auditFindings.filter((f) => f.estado_ciclo !== 'Cerrado').length;

    const summaryCards: Array<{
      step: string;
      title: string;
      targetSubview: string;
      status: string;
      ready: boolean;
      detail: string;
    }> = [
      {
        step: '1',
        title: 'Designación (Tipo, Fecha, Sitio, Temporal)',
        targetSubview: 'designacion/tipo',
        status: `${selectedAudit.tipo_auditoria} · ${regularSites.length} sitio(s)`,
        ready: regularSites.length > 0 || activeTemp.length > 0,
        detail: `${getLatestPlannedLabel(selectedAudit)} · ${activeTemp.length} sitio(s) temporal(es)`,
      },
      {
        step: '2',
        title: 'Tiempo',
        targetSubview: 'tiempo',
        status: `${(regularDays + tempDays).toFixed(2)} días totales`,
        ready: regularDays + tempDays > 0,
        detail: `${regularDays.toFixed(2)} d regulares + ${tempDays.toFixed(2)} d temporales`,
      },
      {
        step: '3',
        title: 'Auditor',
        targetSubview: 'auditor',
        status: `${teamMembersCount} asignación(es)`,
        ready: teamMembersCount > 0,
        detail: selectedAudit.auditor_lider
          ? `Líder: ${selectedAudit.auditor_lider}`
          : 'Auditor Líder pendiente por confirmar',
      },
      {
        step: '4',
        title: 'Proceso',
        targetSubview: 'proceso',
        status: `${procesosCount} proceso(s)`,
        ready: procesosCount > 0,
        detail: 'Cobertura de procesos por sitio en auditoría',
      },
      {
        step: '5',
        title: 'Turno',
        targetSubview: 'turno',
        status: `${turnosCount} turno(s)`,
        ready: turnosCount > 0,
        detail: 'Distribución operativa por jornada y proceso',
      },
      {
        step: '6',
        title: 'Resultado',
        targetSubview: 'resultado',
        status: `${auditFindings.length} hallazgo(s)`,
        ready:
          selectedAudit.estado_ciclo === 'Auditada' ||
          selectedAudit.estatus.trim().toLowerCase() === 'cerrado' ||
          Boolean(selectedAudit.fecha_cierre_auditoria),
        detail: `${openFindings} hallazgo(s) abierto(s) · Ciclo: ${selectedAudit.estado_ciclo || selectedAudit.estatus}`,
      },
      {
        step: '7',
        title: 'Revisión QA',
        targetSubview: 'revision',
        status: selectedAudit.revisado ? 'Aprobada ✓' : 'Pendiente',
        ready: Boolean(selectedAudit.revisado),
        detail: selectedAudit.revisado
          ? `Documentación verificada el ${selectedAudit.fecha_revision || '—'}`
          : 'Compuerta QA post-cierre',
      },
    ];

    const customRecordBodyHtml = `
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        ${summaryCards
          .map(
            (card) => `
              <button
                type="button"
                data-action="audit-breadcrumb-nav"
                data-target-subview="${escapeHtml(card.targetSubview)}"
                class="text-left p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-indigo-50/50 hover:border-indigo-300 transition-colors cursor-pointer space-y-1.5"
              >
                <div class="flex items-center justify-between gap-2">
                  <span class="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    ${escapeHtml(card.step)}. ${escapeHtml(card.title)}
                  </span>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    card.ready
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-amber-50 text-amber-800 border-amber-200'
                  }">
                    ${escapeHtml(card.status)}
                  </span>
                </div>
                <p class="text-xs text-slate-700 font-medium">${escapeHtml(card.detail)}</p>
              </button>
            `
          )
          .join('')}
      </div>
    `;

    return renderDetailPageTemplate({
      entityType: 'Resumen de Auditoría',
      entitySymbol: '📑',
      title: `Resumen · ${selectedAudit.numero_certificado}`,
      eyebrowCode: selectedAudit.codigo_auditoria,
      subtitle: `${selectedAudit.organizacion_nombre} · ${selectedAudit.norma_codigo} · ${selectedAudit.tipo_auditoria}`,
      statusBadge: {
        label: selectedAudit.estado_ciclo || selectedAudit.estatus,
        badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
      },
      backButton: {
        label: 'Volver',
        nav: 'auditorias',
        subview: 'resumen',
        action: 'back-to-shared-multi-view',
      },
      topInCardHtml: inCardBreadcrumbHtml,
      extraActionButtonsHtml: headerAddAuditHtml,
      parents: [
        {
          label: 'Certificado',
          value: selectedAudit.numero_certificado,
          symbol: '📜',
          navAction: {
            nav: 'certificacion',
            subview: 'certificates',
            entityType: 'cert',
            entityId: selectedAudit.id_certificado,
          },
        },
        ...(program
          ? [
              {
                label: 'Campaña',
                value: program.etiqueta,
                symbol: '🧭',
              },
            ]
          : []),
      ],
      tableName: 'auditoria',
      recordId: selectedAudit.id,
      attributes: [],
      customRecordBodyHtml,
    });
  }

  const normalizedQ = query.trim().toLowerCase();
  const filtered = normalizedQ
    ? activeAudits.filter((a) =>
        [
          a.codigo_auditoria,
          a.numero_certificado,
          a.organizacion_nombre,
          a.norma_codigo,
          a.tipo_auditoria,
          a.estado_ciclo || a.estatus,
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQ)
      )
    : activeAudits;

  const columns: ColumnDefinition<ProgramacionAuditEntity>[] = [
    {
      id: 'certificado',
      header: 'Certificado & Org',
      defaultWidthPct: 34,
      minWidthPx: 190,
      renderCell: (a) => `
        <div class="min-w-0">
          <div class="font-mono text-xs font-bold text-slate-900 truncate">${escapeHtml(a.numero_certificado)}</div>
          <div class="text-[11px] text-slate-600 truncate">${escapeHtml(a.organizacion_nombre)}</div>
        </div>
      `,
    },
    {
      id: 'auditoria',
      header: 'Auditoría & Tipo',
      defaultWidthPct: 24,
      minWidthPx: 150,
      renderCell: (a) => `
        <div class="min-w-0">
          <div class="font-mono text-xs font-bold text-slate-900 truncate">${escapeHtml(a.codigo_auditoria)}</div>
          <div class="text-[11px] text-slate-500 truncate">${escapeHtml(a.tipo_auditoria)}</div>
        </div>
      `,
    },
    {
      id: 'fecha',
      header: 'Fecha Planificada',
      defaultWidthPct: 22,
      minWidthPx: 140,
      renderCell: (a) => `<span class="text-xs font-semibold text-slate-700">${escapeHtml(getLatestPlannedLabel(a))}</span>`,
    },
    {
      id: 'estatus',
      header: 'Estado Global',
      defaultWidthPct: 20,
      minWidthPx: 120,
      renderCell: (a) => `
        <span class="px-2 py-0.5 rounded-full text-[11px] font-bold border border-slate-200 bg-slate-50 text-slate-800">
          ${escapeHtml(a.estado_ciclo || a.estatus)}
        </span>
      `,
    },
  ];

  return renderUniversalTemplate<ProgramacionAuditEntity>({
    domainKey: 'resumen',
    tableId: 'resumen-main',
    title: 'Resumen Ejecutivo de Auditorías',
    subtitle:
      'Vista consolidada de avance across las 7 etapas del programa de auditoría por certificado.',
    entityLabel: 'auditorías registradas',
    searchQuery: query,
    searchPlaceholder: 'Buscar por certificado, organización, código o estatus...',
    searchInputId: 'resumenSearchInput',
    clearSearchBtnId: 'clearResumenSearchBtn',
    totalCount: activeAudits.length,
    filteredCount: filtered.length,
    viewMode,
    isSidebarOpen,
    sortState: { column: null, direction: 'none' },
    columnWidths: tableColumnWidths?.['resumen-main'],
    facetGroups: [],
    items: filtered,
    columns,
    getRowAttrs: (a) =>
      `data-action="select-shared-audit" data-audit-id="${escapeHtml(a.id)}" data-cert-id="${escapeHtml(a.id_certificado)}" title="Abrir resumen integral de ${escapeHtml(a.codigo_auditoria)}"`,
    renderCard: (a) => `
      <article
        data-action="select-shared-audit"
        data-audit-id="${escapeHtml(a.id)}"
        data-cert-id="${escapeHtml(a.id_certificado)}"
        class="bg-white border border-slate-200 hover:border-indigo-300 rounded-xl p-4 shadow-2xs space-y-2 cursor-pointer"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="font-mono text-xs font-bold text-slate-900">${escapeHtml(a.codigo_auditoria)}</span>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">${escapeHtml(a.estado_ciclo || a.estatus)}</span>
        </div>
        <div class="text-xs font-bold text-slate-800 truncate">${escapeHtml(a.numero_certificado)}</div>
        <div class="text-[11px] text-slate-500 truncate">${escapeHtml(a.organizacion_nombre)}</div>
        <div class="pt-2 border-t border-slate-100 text-xs text-slate-700 font-semibold">
          📅 ${escapeHtml(getLatestPlannedLabel(a))}
        </div>
      </article>
    `,
    actionsHtml: headerAddAuditHtml,
    loading,
    emptyStateTitle: 'Sin auditorías disponibles en Resumen',
    emptyStateMessage:
      'Programe una auditoría con "+ Auditoría" para consolidar su trazabilidad completa.',
  });
}
