import { escapeHtml } from '../lib/html';
import {
  formatCertificateAuditOptionLabel,
  type CertificateAuditNavigation,
  type LinkedSiblingAuditItem,
} from '../lib/certificateAuditSelector';
import type { ProgramaAuditoriaEntity } from '../lib/auditPlanningEngine';
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
 * - Optional Linked Siblings batch switcher (`showLinkedSiblings`: true in Tipo & Sitio; false in Fecha & Temporal)
 */
export function renderAuditSectionShell(props: AuditSectionShellProps): string {
  const {
    sectionTitle,
    sectionSymbol,
    backSubview,
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

  const auditsCount = navigation.auditsForCert.length;
  const positionLabel =
    auditsCount > 0 && navigation.activeIndex >= 0
      ? `${navigation.activeIndex + 1} de ${auditsCount}`
      : '0 auditorías';

  const auditSelectorBarHtml =
    auditsCount > 0 && activeAudit
      ? `
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
        <div class="ml-auto">
          <span class="px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-800">
            Sin auditorías registradas
          </span>
        </div>
      `;

  const linkedSiblingsBarHtml =
    showLinkedSiblings && linkedSiblings.length > 1 && activeAudit
      ? `
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

  const customParentZoneHtml = `
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
        ${auditSelectorBarHtml}
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

  return `<div data-testid="audit-section-shell">${renderDetailPageTemplate({
    entityType: sectionTitle,
    entitySymbol: sectionSymbol,
    title: `${sectionTitle} · ${certNumero}`,
    subtitle: `${orgNombre}${activeAudit ? ` · ${activeAudit.codigo_auditoria} · ${activeAudit.tipo_auditoria}` : ''}`,
    eyebrowCode: activeAudit?.codigo_auditoria || undefined,
    statusBadge: activeAudit
      ? {
          label: activeAudit.estado_ciclo || activeAudit.estatus || 'Planificada',
          badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
        }
      : certInfo?.estatus
      ? {
          label: certInfo.estatus,
          badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
        }
      : undefined,
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
    tableName,
    recordId: activeAudit?.id || '',
    isCreateMode: !activeAudit,
    feedbackHtml: `${readOnlyNoticeHtml ? `<div class="mb-2">${readOnlyNoticeHtml}</div>` : ''}${futureBannerHtml}${feedbackHtml}`,
    attributes: [],
    customRecordBodyHtml: resolvedBodyHtml,
    modalsHtml,
  })}</div>`;
}
