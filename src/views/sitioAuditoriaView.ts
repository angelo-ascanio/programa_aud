import { escapeHtml } from '../lib/html';
import { canAccessRoute, type UserProfile } from '../lib/healthCheck';
import {
  getLifecycleStatusMeta,
  getPhase5FindingTypeMeta,
  type Phase5FindingEntity,
  type ProgramacionAuditEntity,
} from '../lib/auditExecution';
import {
  computeSiteDayBalance,
  resolveEffectiveAuditorsForProcess,
  type AuditoriaSitioPlanItem,
  type AuditorProcessRole,
  type AuditorSiteRole,
  type ProgramaAuditoriaEntity,
} from '../lib/auditPlanningEngine';
import type { AuditorDetailEntity } from '../lib/competencyMatrix';
import { formatAuditCodename, resolveShortOrganizacionName } from '../lib/codenameDomain';
import {
  renderDetailPageTemplate,
  type DetailAttributeItem,
  type DetailParentChip,
} from './detailTemplate';

export interface SitioAuditoriaViewProps {
  profile: UserProfile;
  program: ProgramaAuditoriaEntity;
  audit: ProgramacionAuditEntity;
  sitePlan: AuditoriaSitioPlanItem;
  auditors?: ReadonlyArray<AuditorDetailEntity>;
  findings?: ReadonlyArray<Phase5FindingEntity>;
  activeTab?: 'procesos' | 'equipo' | 'hallazgos';
}

function formatShortIsoDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return iso;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatSiteRoleLabel(role: AuditorSiteRole): string {
  switch (role) {
    case 'AUDITOR_LIDER':
      return 'Auditor Líder';
    case 'EXPERTO_TECNICO':
      return 'Experto Técnico';
    case 'AUDITOR_EN_ENTRENAMIENTO':
      return 'Auditor en Entrenamiento';
    default:
      return 'Auditor de Equipo';
  }
}

function formatProcessRoleLabel(role: AuditorProcessRole): string {
  switch (role) {
    case 'LIDER_PROCESO':
      return 'Líder de Proceso';
    case 'APOYO_TECNICO':
      return 'Apoyo Técnico';
    case 'OBSERVADOR':
      return 'Observador';
    default:
      return 'Evaluador';
  }
}

export function isAuditorQualifiedForAudit(
  auditor: AuditorDetailEntity | undefined,
  audit: ProgramacionAuditEntity
): { qualified: boolean; label: string; badgeClass: string } {
  if (!auditor) {
    return {
      qualified: false,
      label: 'Sin ficha técnica',
      badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
    };
  }
  const targetNormBase = (audit.norma_codigo || '').toLowerCase().split(':')[0].trim();
  const hasNorma =
    Boolean(targetNormBase) &&
    auditor.normas_acreditadas.some((n) => n.toLowerCase().includes(targetNormBase));
  const hasIaf = auditor.sectores_iaf.includes(audit.sector_iaf);

  if (hasNorma && hasIaf) {
    return {
      qualified: true,
      label: `✓ Calificado (${audit.norma_codigo} · IAF ${audit.sector_iaf})`,
      badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    };
  }
  if (hasNorma) {
    return {
      qualified: false,
      label: '⚠ Solo Norma (Requiere Experto IAF)',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    };
  }
  return {
    qualified: false,
    label: 'ℹ️ Apoyo / Sin Norma Base',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
  };
}

export function renderSitioAuditoriaView(props: SitioAuditoriaViewProps): string {
  const {
    profile,
    program,
    audit,
    sitePlan,
    auditors = [],
    findings = [],
    activeTab = 'procesos',
  } = props;

  const balance = computeSiteDayBalance(sitePlan);
  const canCrossCert = canAccessRoute(profile, 'certificacion');
  const activeProcesses = (sitePlan.procesos || []).filter((p) => !p.deleted_at);
  const activeEquipo = (sitePlan.equipoSitio || []).filter((m) => !m.deleted_at);
  const siteFindings = findings.filter(
    (f) =>
      f.id_auditoria === audit.id &&
      (!f.id_sitio || f.id_sitio === sitePlan.id_sitio)
  );

  const siteTag =
    sitePlan.numero_sitio === 0 ? 'Sitio 0 (HQ)' : `Sitio #${sitePlan.numero_sitio}`;
  const title = `${siteTag} · ${sitePlan.nombre_sitio}`;

  const statusBadge =
    balance.demandedDays <= 0 && balance.assignedDays <= 0
      ? {
          label: 'Sin Días Asignados',
          badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
          dotClass: 'bg-amber-500',
        }
      : balance.isBalanced
      ? {
          label: 'Días Cuadrados ✓',
          badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
          dotClass: 'bg-emerald-500',
        }
      : {
          label: `Desfase ${balance.delta > 0 ? `+${balance.delta.toFixed(2)}` : balance.delta.toFixed(2)} d`,
          badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
          dotClass: 'bg-rose-500',
        };

  const parents: DetailParentChip[] = [
    {
      label: 'Programa de Auditoría',
      value: `${program.codigo_programa || 'PROGRAMA'} · ${program.etiqueta}`,
      symbol: '📋',
      navAction: {
        nav: 'auditorias',
        subview: 'scheduling',
        entityType: 'programa_auditoria',
        entityId: program.id,
        targetTab: 'planificacion',
      },
    },
    {
      label: 'Certificado / Auditoría',
      value: `${audit.numero_certificado} · ${audit.norma_codigo}`,
      symbol: '📜',
    },
    {
      label: 'Sede Maestra',
      value: sitePlan.nombre_sitio,
      symbol: '🏭',
      navAction: canCrossCert
        ? {
            nav: 'certificacion',
            subview: 'certificates',
            entityType: 'sitio',
            entityId: sitePlan.id_sitio,
          }
        : undefined,
    },
  ];

  const dateWindow =
    sitePlan.fecha_inicio && sitePlan.fecha_fin
      ? `${formatShortIsoDate(sitePlan.fecha_inicio)} → ${formatShortIsoDate(sitePlan.fecha_fin)}`
      : sitePlan.fecha_inicio
      ? formatShortIsoDate(sitePlan.fecha_inicio)
      : 'Heredada de la auditoría';

  const attributes: DetailAttributeItem[] = [
    {
      label: 'Organización',
      value: audit.organizacion_nombre,
    },
    {
      label: 'Modalidad de Evaluación',
      value: sitePlan.modalidad_evaluacion || 'Presencial',
      badgeClass:
        sitePlan.modalidad_evaluacion === 'Remota'
          ? 'bg-cyan-50 text-cyan-800 border-cyan-200'
          : sitePlan.modalidad_evaluacion === 'Mixta'
          ? 'bg-violet-50 text-violet-800 border-violet-200'
          : 'bg-emerald-50 text-emerald-800 border-emerald-200',
    },
    {
      label: 'Ventana Temporal del Sitio',
      value: dateWindow,
      isMono: true,
    },
    {
      label: 'Cubo 1 (Demanda Sitio)',
      value: `${balance.demandedDays.toFixed(2)} días-auditor`,
      isMono: true,
    },
    {
      label: 'Cubo 2 (Asignado Equipo)',
      value: `${balance.assignedDays.toFixed(2)} días-auditor`,
      isMono: true,
    },
    {
      label: 'Estado de Cuadre',
      value: balance.isBalanced
        ? 'Cuadrado (0.00 d)'
        : `Delta ${balance.delta > 0 ? `+${balance.delta.toFixed(2)}` : balance.delta.toFixed(2)} d`,
      badgeClass: balance.isBalanced
        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
        : 'bg-rose-50 text-rose-800 border-rose-200',
    },
    {
      label: 'Dirección Operativa',
      value: sitePlan.direccion_sitio || audit.sede_principal_direccion || 'Sin dirección registrada',
      colSpanFull: true,
    },
  ];

  if (sitePlan.notas_sitio) {
    attributes.push({
      label: 'Notas del Sitio',
      value: sitePlan.notas_sitio,
      colSpanFull: true,
    });
  }

  const auditorById = new Map(auditors.map((a) => [a.id, a]));

  const renderProcesosTab = (): string => {
    if (activeProcesses.length === 0) {
      return `
        <div class="p-6 text-center rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-600">
          Este sitio aún no tiene procesos vinculados en el plan de auditoría. El editor interactivo completo del árbol (Sitio → Proceso → Turnos → Auditores) se conectará en el Paso 4.1.
        </div>
      `;
    }
    return `
      <div class="border border-slate-200 rounded-xl overflow-hidden bg-white">
        <div class="overflow-x-auto">
          <table class="w-full table-fixed text-left text-xs">
            <colgroup>
              <col style="width: 28%" />
              <col style="width: 26%" />
              <col style="width: 30%" />
              <col style="width: 16%" />
            </colgroup>
            <thead class="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
              <tr>
                <th class="px-3.5 py-2.5">Proceso Auditado</th>
                <th class="px-3 py-2.5">Turnos Planificados</th>
                <th class="px-3 py-2.5">Auditores Efectivos</th>
                <th class="px-3.5 py-2.5">Notas</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              ${activeProcesses
                .map((proc) => {
                  const activeTurnos = (proc.turnos || []).filter((t) => !t.deleted_at);
                  const effectiveAuditors = resolveEffectiveAuditorsForProcess(sitePlan, proc);
                  return `
                    <tr class="hover:bg-slate-50/70">
                      <td class="px-3.5 py-2.5 font-semibold text-slate-900 truncate" title="${escapeHtml(proc.proceso_nombre)}">
                        ${escapeHtml(proc.proceso_nombre)}
                      </td>
                      <td class="px-3 py-2.5">
                        ${
                          activeTurnos.length > 0
                            ? `<div class="flex flex-wrap gap-1">${activeTurnos
                                .map(
                                  (t) =>
                                    `<span class="inline-flex px-1.5 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200 text-[10px] font-semibold">${escapeHtml(
                                      t.descripcion_turno || 'Turno Operativo'
                                    )}</span>`
                                )
                                .join('')}</div>`
                            : '<span class="text-[11px] text-amber-700 font-semibold">Sin turnos</span>'
                        }
                      </td>
                      <td class="px-3 py-2.5">
                        ${
                          effectiveAuditors.length > 0
                            ? `<div class="flex flex-wrap gap-1">${effectiveAuditors
                                .map((ea) => {
                                  const roleTxt = ea.rol_en_proceso
                                    ? formatProcessRoleLabel(ea.rol_en_proceso)
                                    : ea.source === 'SITIO_COMPLETO'
                                    ? 'Sitio Completo'
                                    : 'Evaluador';
                                  return `<span class="inline-flex px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 text-[10px] font-semibold">${escapeHtml(
                                    ea.auditor_nombre
                                  )} · ${escapeHtml(roleTxt)}</span>`;
                                })
                                .join('')}</div>`
                            : '<span class="text-[11px] text-amber-700 font-semibold">Sin auditor</span>'
                        }
                      </td>
                      <td class="px-3.5 py-2.5 text-slate-600 truncate" title="${escapeHtml(proc.notas || '—')}">
                        ${escapeHtml(proc.notas || '—')}
                      </td>
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  };

  const renderEquipoSitioTab = (): string => {
    if (activeEquipo.length === 0) {
      return `
        <div class="p-6 text-center rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-600">
          No hay auditores asignados directamente a este sitio todavía.
        </div>
      `;
    }
    return `
      <div class="border border-slate-200 rounded-xl overflow-hidden bg-white">
        <div class="overflow-x-auto">
          <table class="w-full table-fixed text-left text-xs">
            <colgroup>
              <col style="width: 30%" />
              <col style="width: 20%" />
              <col style="width: 16%" />
              <col style="width: 16%" />
              <col style="width: 18%" />
            </colgroup>
            <thead class="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
              <tr>
                <th class="px-3.5 py-2.5">Auditor</th>
                <th class="px-3 py-2.5">Rol en Sitio</th>
                <th class="px-3 py-2.5">Días Asignados</th>
                <th class="px-3 py-2.5">Cobertura</th>
                <th class="px-3.5 py-2.5">Calificación</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              ${activeEquipo
                .map((member) => {
                  const audDetail = auditorById.get(member.id_auditor);
                  const qual = isAuditorQualifiedForAudit(audDetail, audit);
                  const rowAttrs = canCrossCert
                    ? `data-action="select-auditor" data-auditor-id="${escapeHtml(member.id_auditor)}" tabindex="0" class="hover:bg-indigo-50/50 cursor-pointer transition-colors"`
                    : 'class="hover:bg-slate-50/70"';
                  return `
                    <tr ${rowAttrs}>
                      <td class="px-3.5 py-2.5 font-bold text-indigo-700 truncate" title="${escapeHtml(member.auditor_nombre)}">
                        ${escapeHtml(member.auditor_nombre)}
                      </td>
                      <td class="px-3 py-2.5">
                        <span class="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold border bg-slate-50 text-slate-800 border-slate-200">
                          ${escapeHtml(formatSiteRoleLabel(member.rol_auditor))}
                        </span>
                      </td>
                      <td class="px-3 py-2.5 font-mono font-bold text-slate-900">
                        ${member.tiempo_auditoria.toFixed(2)} d
                      </td>
                      <td class="px-3 py-2.5 text-slate-700">
                        ${member.asignacion_completa_sitio ? 'Todo el sitio' : 'Por proceso (M:N)'}
                      </td>
                      <td class="px-3.5 py-2.5">
                        <span class="inline-flex px-2 py-0.5 rounded text-[10px] font-bold border truncate max-w-full ${qual.badgeClass}" title="${escapeHtml(qual.label)}">
                          ${escapeHtml(qual.label)}
                        </span>
                      </td>
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  };

  const renderHallazgosSitioTab = (): string => {
    if (siteFindings.length === 0) {
      return `
        <div class="p-6 text-center rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-600">
          Sin hallazgos registrados para este sitio en la auditoría actual.
        </div>
      `;
    }
    return `
      <div class="border border-slate-200 rounded-xl overflow-hidden bg-white">
        <div class="overflow-x-auto">
          <table class="w-full table-fixed text-left text-xs">
            <colgroup>
              <col style="width: 16%" />
              <col style="width: 18%" />
              <col style="width: 24%" />
              <col style="width: 26%" />
              <col style="width: 16%" />
            </colgroup>
            <thead class="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
              <tr>
                <th class="px-3.5 py-2.5">Código</th>
                <th class="px-3 py-2.5">Tipo</th>
                <th class="px-3 py-2.5">Cláusula y Proceso</th>
                <th class="px-3 py-2.5">Descripción</th>
                <th class="px-3.5 py-2.5">Estado</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              ${siteFindings
                .map((f) => {
                  const tMeta = getPhase5FindingTypeMeta(f.tipo);
                  const lMeta = getLifecycleStatusMeta(f.estado_ciclo);
                  return `
                    <tr data-action="go-audit-results" data-audit-id="${escapeHtml(audit.id)}" tabindex="0" class="hover:bg-indigo-50/50 cursor-pointer transition-colors">
                      <td class="px-3.5 py-2.5 font-mono font-bold text-slate-900 truncate">
                        ${escapeHtml(f.codigo_hallazgo)}
                      </td>
                      <td class="px-3 py-2.5">
                        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border ${tMeta.badgeClass}">
                          <span>${tMeta.symbol}</span>
                          <span>${escapeHtml(tMeta.shortLabel)}</span>
                        </span>
                      </td>
                      <td class="px-3 py-2.5 truncate">
                        <div class="font-mono font-semibold text-indigo-700 truncate">Cláusula ${escapeHtml(f.requisito_codigo)}</div>
                        <div class="text-[11px] text-slate-500 truncate">${escapeHtml(f.proceso_nombre)}</div>
                      </td>
                      <td class="px-3 py-2.5 text-slate-700 truncate" title="${escapeHtml(f.descripcion)}">
                        ${escapeHtml(f.descripcion)}
                      </td>
                      <td class="px-3.5 py-2.5">
                        <span class="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold border ${lMeta.badgeClass}">
                          ${escapeHtml(lMeta.label)}
                        </span>
                      </td>
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  };

  return renderDetailPageTemplate({
    entityType: 'Sitio en Auditoría',
    entitySymbol: '🏭',
    title,
    subtitle: `${resolveShortOrganizacionName({ nombre: audit.organizacion_nombre, abreviacion: audit.organizacion_abreviacion })} · ${audit.numero_certificado} · ${audit.norma_codigo}`,
    eyebrowCode: formatAuditCodename(audit),
    statusBadge,
    backButton: {
      label: 'Volver al Programa',
      nav: 'auditorias',
      subview: 'scheduling',
      action: 'back-from-sitio-auditoria',
    },
    tableName: 'sitios_por_auditoria',
    recordId: sitePlan.id,
    parents,
    attributes,
    childTabs: [
      { id: 'procesos', label: 'Procesos y Turnos', symbol: '⚙️', count: activeProcesses.length },
      { id: 'equipo', label: 'Equipo del Sitio', symbol: '👥', count: activeEquipo.length },
      { id: 'hallazgos', label: 'Hallazgos', symbol: '🔍', count: siteFindings.length },
    ],
    activeChildTabId: activeTab,
    childTabAttrName: 'data-sitio-audit-tab',
    renderChildTabContent: (tabId) => {
      if (tabId === 'equipo') return renderEquipoSitioTab();
      if (tabId === 'hallazgos') return renderHallazgosSitioTab();
      return renderProcesosTab();
    },
  });
}
