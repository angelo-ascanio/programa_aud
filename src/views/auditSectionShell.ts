import { escapeHtml } from '../lib/html';
import {
  formatCertificateAuditOptionLabel,
  type CertificateAuditNavigation,
  type LinkedSiblingAuditItem,
} from '../lib/certificateAuditSelector';
import {
  formatAuditDateLabel,
  type ProgramaAuditoriaEntity,
} from '../lib/auditPlanningEngine';
import {
  formatCompactLinkNature,
  getCertificateStatusBadgeMeta,
  resolveLastAddedPlannedDate,
} from '../lib/designacionFechaDomain';
import { renderDetailPageTemplate } from './detailTemplate';

export interface AuditSectionCertContext {
  id: string;
  numero_certificado: string;
  organizacion_nombre: string;
  norma_codigo?: string;
  estatus?: string;
}

export interface AuditSectionShellProps {
  sectionTitle: string;
  sectionSymbol: string;
  backSubview: string;
  compactMode?: boolean;
  lastAddedPlannedLabel?: string;
  certInfo: AuditSectionCertContext | null;
  navigation: CertificateAuditNavigation;
  programs: ReadonlyArray<ProgramaAuditoriaEntity>;
  linkedSiblings?: ReadonlyArray<LinkedSiblingAuditItem>;
  showLinkedSiblings?: boolean;
  isStaff: boolean;
  inCardBreadcrumbHtml?: string;
  headerAddAuditHtml?: string;
  extraHeaderActionsHtml?: string;
  tableName: string;
  feedbackHtml?: string;
  futureWarningMessage?: string | null;
  bodyHtml: string;
  emptyAuditBodyHtml?: string;
  modalsHtml?: string;
}

/**
 * Shared Certificate-Based Detail View Shell for Auditoría Sections 1..7 + Resumen.
 * Integrates:
 * - Card header with `◀ Volver` + `+ Auditoría`
 * - In-Card Pipeline Breadcrumb (`topInCardHtml`)
 * - Certificate context & Audit Selector (`◀` / `<select data-action="select-section-audit">` / `▶`)
 * - Optional Linked Siblings batch switcher (`showLinkedSiblings`)
 * - Optional `compactMode` ("Less Is More" minimal context & tightened vertical spacing)
 */
export function renderAuditSectionShell(props: AuditSectionShellProps): string {
  const {
    sectionTitle,
    sectionSymbol,
    backSubview,
    compactMode = false,
    lastAddedPlannedLabel,
    certInfo,
    navigation,
    programs,
    linkedSiblings = [],
    showLinkedSiblings = false,
    isStaff,
    inCardBreadcrumbHtml = '',
    headerAddAuditHtml = '',
    extraHeaderActionsHtml = '',
    tableName,
    feedbackHtml = '',
    futureWarningMessage = null,
    bodyHtml,
    emptyAuditBodyHtml,
    modalsHtml = '',
  } = props;

  const activeAudit = navigation.activeAudit;
  const programById = new Map(programs.filter((p) => !p.deleted_at).map((p) => [p.id, p]));
  const activeProgram =
    activeAudit?.id_programa_auditoria
      ? programById.get(activeAudit.id_programa_auditoria) ?? null
      : null;

  const certNumero =
    certInfo?.numero_certificado || activeAudit?.numero_certificado || 'Certificado';
  const orgNombre =
    certInfo?.organizacion_nombre || activeAudit?.organizacion_nombre || 'Organización';
  const normaCodigo = certInfo?.norma_codigo || activeAudit?.norma_codigo || '';
  const certId = certInfo?.id || activeAudit?.id_certificado || navigation.certId || '';
  const certStatusMeta = certInfo?.estatus
    ? getCertificateStatusBadgeMeta(certInfo.estatus)
    : null;

  const auditsCount = navigation.auditsForCert.length;
  const positionLabel =
    auditsCount > 0 && navigation.activeIndex >= 0
      ? `${navigation.activeIndex + 1} de ${auditsCount}`
      : '0 auditorías';

  const resolvedLastPlanned = activeAudit
    ? resolveLastAddedPlannedDate(activeAudit.fechas) ??
      (activeAudit.latestDate &&
      !activeAudit.latestDate.deleted_at &&
      activeAudit.latestDate.tipo_fecha !== 'REAL'
        ? activeAudit.latestDate
        : null)
    : null;
  const resolvedPlannedDateLabel =
    lastAddedPlannedLabel ||
    (resolvedLastPlanned
      ? formatAuditDateLabel(resolvedLastPlanned)
      : activeAudit?.fecha_inicio
      ? activeAudit.fecha_inicio.slice(0, 10)
      : 'Sin fecha programada');

  const auditSelectorControlsHtml =
    auditsCount > 0 && activeAudit
      ? compactMode
        ? `
          <div class="flex flex-wrap items-center gap-1.5 ml-auto w-full sm:w-auto sm:shrink-0 min-w-0">
            <div class="inline-flex items-center gap-1 min-w-0 flex-1 sm:flex-initial">
              <button
                type="button"
                data-action="step-section-audit"
                data-cert-id="${escapeHtml(certId)}"
                data-audit-id="${escapeHtml(navigation.prevAuditId || '')}"
                ${!navigation.prevAuditId ? 'disabled' : ''}
                title="Auditoría más reciente (anterior en lista)"
                aria-label="Auditoría anterior en lista"
                class="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors shrink-0"
              >
                ◀
              </button>
              <select
                data-action="select-section-audit"
                data-cert-id="${escapeHtml(certId)}"
                aria-label="Seleccionar auditoría del certificado"
                class="h-7 flex-1 min-w-0 w-full sm:w-auto sm:max-w-[320px] px-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-900 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none truncate"
              >
                ${navigation.auditsForCert
                  .map((aud) => {
                    const prog = aud.id_programa_auditoria
                      ? programById.get(aud.id_programa_auditoria) ?? null
                      : null;
                    const label = formatCertificateAuditOptionLabel(aud, prog);
                    const selected = aud.id === activeAudit.id ? 'selected' : '';
                    return `<option value="${escapeHtml(aud.id)}" ${selected}>${escapeHtml(label)}</option>`;
                  })
                  .join('')}
              </select>
              <button
                type="button"
                data-action="step-section-audit"
                data-cert-id="${escapeHtml(certId)}"
                data-audit-id="${escapeHtml(navigation.nextAuditId || '')}"
                ${!navigation.nextAuditId ? 'disabled' : ''}
                title="Auditoría anterior cronológica (siguiente en lista)"
                aria-label="Siguiente auditoría en lista"
                class="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors shrink-0"
              >
                ▶
              </button>
            </div>
            <span class="px-1.5 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[10px] font-bold text-slate-600 tabular-nums whitespace-nowrap shrink-0">
              ${escapeHtml(positionLabel)}
            </span>
          </div>
        `
        : `
          <div class="flex flex-wrap items-center gap-2 ml-auto">
            <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Auditoría del certificado:
            </span>
            <div class="inline-flex items-center gap-1">
              <button
                type="button"
                data-action="step-section-audit"
                data-cert-id="${escapeHtml(certId)}"
                data-audit-id="${escapeHtml(navigation.prevAuditId || '')}"
                ${!navigation.prevAuditId ? 'disabled' : ''}
                title="Auditoría más reciente (anterior en lista)"
                aria-label="Auditoría anterior en lista"
                class="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                ◀
              </button>
              <select
                data-action="select-section-audit"
                data-cert-id="${escapeHtml(certId)}"
                aria-label="Seleccionar auditoría del certificado"
                class="h-8 max-w-[340px] px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-900 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none truncate"
              >
                ${navigation.auditsForCert
                  .map((aud) => {
                    const prog = aud.id_programa_auditoria
                      ? programById.get(aud.id_programa_auditoria) ?? null
                      : null;
                    const label = formatCertificateAuditOptionLabel(aud, prog);
                    const selected = aud.id === activeAudit.id ? 'selected' : '';
                    return `<option value="${escapeHtml(aud.id)}" ${selected}>${escapeHtml(label)}</option>`;
                  })
                  .join('')}
              </select>
              <button
                type="button"
                data-action="step-section-audit"
                data-cert-id="${escapeHtml(certId)}"
                data-audit-id="${escapeHtml(navigation.nextAuditId || '')}"
                ${!navigation.nextAuditId ? 'disabled' : ''}
                title="Auditoría anterior cronológica (siguiente en lista)"
                aria-label="Siguiente auditoría en lista"
                class="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                ▶
              </button>
            </div>
            <span class="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[10px] font-bold text-slate-600 tabular-nums">
              ${escapeHtml(positionLabel)}
            </span>
          </div>
        `
      : `
        <div class="ml-auto shrink-0">
          <span class="px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-800 whitespace-nowrap">
            Sin auditorías registradas
          </span>
        </div>
      `;

  const linkedSiblingsBarHtml =
    showLinkedSiblings && linkedSiblings.length > 1 && activeAudit
      ? compactMode
        ? (() => {
            const linkMeta = formatCompactLinkNature(
              activeProgram,
              linkedSiblings.length,
              true
            );
            return `
              <div
                data-linked-siblings-bar="true"
                class="bg-indigo-50/50 border border-indigo-200/80 rounded-xl px-2.5 py-1.5 flex flex-wrap items-center gap-1.5"
              >
                <span
                  title="${escapeHtml(linkMeta.full)}"
                  class="inline-flex items-center px-2 py-0.5 rounded-full bg-white border border-indigo-200 text-[10px] font-bold text-indigo-800 whitespace-nowrap shrink-0"
                >
                  ${escapeHtml(linkMeta.short)}
                </span>
                <div class="flex flex-wrap items-center gap-1.5 min-w-0">
                  ${linkedSiblings
                    .map(
                      (sib) => `
                        <button
                          type="button"
                          data-action="select-linked-sibling-audit"
                          data-audit-id="${escapeHtml(sib.audit.id)}"
                          data-cert-id="${escapeHtml(sib.audit.id_certificado)}"
                          aria-current="${sib.isActive ? 'true' : 'false'}"
                          title="${escapeHtml(sib.label)}"
                          class="px-2 py-0.5 rounded-lg border text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                            sib.isActive
                              ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                              : 'bg-white text-slate-700 border-indigo-200 hover:bg-indigo-100/70 hover:text-indigo-900'
                          }"
                        >
                          ${escapeHtml(sib.compactLabel)}
                        </button>
                      `
                    )
                    .join('')}
                </div>
              </div>
            `;
          })()
        : `
          <div
            data-linked-siblings-bar="true"
            class="bg-indigo-50/60 border border-indigo-200/90 rounded-xl p-2.5 flex flex-wrap items-center gap-2"
          >
            <div class="inline-flex items-center gap-1.5 shrink-0">
              <span class="text-[10px] font-bold uppercase tracking-wider text-indigo-800">
                Auditorías vinculadas en este lote (${linkedSiblings.length}):
              </span>
              ${
                activeProgram
                  ? `<span class="px-2 py-0.5 rounded-full bg-white border border-indigo-200 text-[10px] font-semibold text-indigo-700">${escapeHtml(
                      activeProgram.tipo_vinculacion
                    )}</span>`
                  : ''
              }
            </div>
            <div class="flex flex-wrap items-center gap-1.5 min-w-0">
              ${linkedSiblings
                .map(
                  (sib) => `
                    <button
                      type="button"
                      data-action="select-linked-sibling-audit"
                      data-audit-id="${escapeHtml(sib.audit.id)}"
                      data-cert-id="${escapeHtml(sib.audit.id_certificado)}"
                      aria-current="${sib.isActive ? 'true' : 'false'}"
                      class="px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        sib.isActive
                          ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                          : 'bg-white text-slate-700 border-indigo-200 hover:bg-indigo-100/70 hover:text-indigo-900'
                      }"
                    >
                      ${escapeHtml(sib.label)}
                    </button>
                  `
                )
                .join('')}
            </div>
          </div>
        `
      : '';

  const customParentZoneHtml = compactMode
    ? `
      <div class="space-y-1.5">
        <div class="bg-slate-50/80 border border-slate-200 rounded-xl p-2 sm:p-2.5 flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-2 min-w-0">
            ${
              certId
                ? `
                  <button
                    type="button"
                    data-parent-nav="true"
                    data-nav="certificacion"
                    data-subview="certificates"
                    data-parent-type="cert"
                    data-entity-id="${escapeHtml(certId)}"
                    title="Ver certificado: ${escapeHtml(certNumero)}"
                    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/70 font-mono text-xs font-bold text-indigo-700 hover:text-indigo-900 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <span aria-hidden="true">📜</span>
                    <span>${escapeHtml(certNumero)}</span>
                  </button>
                `
                : `
                  <span class="inline-flex items-center gap-1 font-mono text-xs font-bold text-slate-900 whitespace-nowrap shrink-0">
                    <span aria-hidden="true">📜</span>
                    <span>${escapeHtml(certNumero)}</span>
                  </span>
                `
            }
            ${
              certStatusMeta
                ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${certStatusMeta.badgeClass} whitespace-nowrap shrink-0">${escapeHtml(
                    certStatusMeta.label
                  )}</span>`
                : ''
            }
            ${
              activeAudit
                ? `<span class="text-xs font-semibold text-slate-700 truncate" title="${escapeHtml(
                    `${activeAudit.codigo_auditoria || 'Auditoría'} · ${
                      activeAudit.tipo_auditoria || 'Sin tipo'
                    } · ${resolvedPlannedDateLabel}`
                  )}">${escapeHtml(
                    `${activeAudit.codigo_auditoria || 'Auditoría'} · ${
                      activeAudit.tipo_auditoria || 'Sin tipo'
                    } · ${resolvedPlannedDateLabel}`
                  )}</span>`
                : ''
            }
          </div>
          ${auditSelectorControlsHtml}
        </div>
        ${linkedSiblingsBarHtml}
      </div>
    `
    : `
      <div class="space-y-2.5">
        <div class="bg-slate-50/80 border border-slate-200 rounded-xl p-2.5 sm:p-3 flex flex-wrap items-center justify-between gap-2.5">
          <div class="flex flex-wrap items-center gap-2 min-w-0">
            <span class="text-base select-none" aria-hidden="true">📜</span>
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="font-mono text-xs font-bold text-slate-900">${escapeHtml(certNumero)}</span>
                ${
                  normaCodigo
                    ? `<span class="px-2 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-bold text-slate-700">${escapeHtml(
                        normaCodigo
                      )}</span>`
                    : ''
                }
                ${
                  certId
                    ? `
                      <button
                        type="button"
                        data-parent-nav="true"
                        data-nav="certificacion"
                        data-subview="certificates"
                        data-parent-type="cert"
                        data-entity-id="${escapeHtml(certId)}"
                        class="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 hover:underline cursor-pointer whitespace-nowrap"
                      >
                        Ver Certificado →
                      </button>
                    `
                    : ''
                }
              </div>
              <div class="text-[11px] text-slate-600 font-medium truncate">
                ${escapeHtml(orgNombre)}${
                  activeProgram ? ` · Lote: ${escapeHtml(activeProgram.etiqueta)}` : ''
                }
              </div>
            </div>
          </div>
          ${auditSelectorControlsHtml}
        </div>
        ${linkedSiblingsBarHtml}
      </div>
    `;

  const futureBannerHtml = futureWarningMessage
    ? `
      <div
        data-testid="future-cycle-warning-banner"
        role="status"
        class="rounded-xl border border-amber-300 bg-amber-50 p-3 flex items-start gap-2.5 text-xs text-amber-950"
      >
        <span class="text-base shrink-0" aria-hidden="true">⚠️</span>
        <p class="font-semibold">${escapeHtml(futureWarningMessage)}</p>
      </div>
    `
    : '';

  const readOnlyNoticeHtml = !isStaff
    ? `
      <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-600">
        <span aria-hidden="true">🔒</span>
        <span>Solo lectura</span>
      </div>
    `
    : '';

  const fallbackEmptyBodyHtml =
    emptyAuditBodyHtml ??
    `
      <div class="rounded-xl border border-slate-200 bg-slate-50/70 p-8 text-center space-y-3">
        <div class="text-2xl select-none" aria-hidden="true">📅</div>
        <h2 class="text-sm font-bold text-slate-900">Este certificado aún no tiene auditorías programadas</h2>
        <p class="text-xs text-slate-600 max-w-md mx-auto">
          ${
            isStaff
              ? 'Utilice el botón "+ Auditoría" en la cabecera para vincular y programar la primera auditoría de este certificado.'
              : 'No existen auditorías asignadas o registradas para este certificado.'
          }
        </p>
        ${isStaff && headerAddAuditHtml ? `<div class="pt-1 flex justify-center">${headerAddAuditHtml}</div>` : ''}
      </div>
    `;

  const resolvedBodyHtml = activeAudit ? bodyHtml : fallbackEmptyBodyHtml;

  const resolvedTitle = compactMode ? certNumero : `${sectionTitle} · ${certNumero}`;
  const resolvedSubtitle = compactMode
    ? orgNombre
    : `${orgNombre}${activeAudit ? ` · ${activeAudit.codigo_auditoria} · ${activeAudit.tipo_auditoria}` : ''}`;
  const resolvedEyebrowCode = compactMode ? undefined : activeAudit?.codigo_auditoria || undefined;
  const resolvedStatusBadge = activeAudit
    ? {
        label: activeAudit.estado_ciclo || activeAudit.estatus || (compactMode ? 'En Programación' : 'Planificada'),
        badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
      }
    : certStatusMeta
    ? {
        label: certStatusMeta.label,
        badgeClass: compactMode ? certStatusMeta.badgeClass : 'bg-slate-100 text-slate-700 border-slate-200',
      }
    : undefined;

  return `<div data-testid="audit-section-shell">${renderDetailPageTemplate({
    entityType: sectionTitle,
    entitySymbol: sectionSymbol,
    title: resolvedTitle,
    subtitle: resolvedSubtitle,
    eyebrowCode: resolvedEyebrowCode,
    statusBadge: resolvedStatusBadge,
    secondaryHeaderBadge: !isStaff
      ? {
          label: 'Solo lectura',
          badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
        }
      : undefined,
    backButton: {
      label: 'Volver',
      nav: 'auditorias',
      subview: backSubview,
      action: 'back-to-section-multi-view',
    },
    topInCardHtml: inCardBreadcrumbHtml,
    extraActionButtonsHtml: `${headerAddAuditHtml}${extraHeaderActionsHtml}`,
    customParentZoneHtml,
    compactLayout: compactMode,
    tableName,
    recordId: activeAudit?.id || '',
    isCreateMode: !activeAudit,
    feedbackHtml: `${readOnlyNoticeHtml ? `<div class="${compactMode ? 'mb-1.5' : 'mb-2'}">${readOnlyNoticeHtml}</div>` : ''}${futureBannerHtml}${feedbackHtml}`,
    attributes: [],
    customRecordBodyHtml: resolvedBodyHtml,
    modalsHtml,
  })}</div>`;
}
