import { escapeHtml } from '../lib/html';
import {
  formatCompactAuditSelectorOptionLabel,
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
import { resolveCertVersionSnapshotForAudit } from '../lib/certificadoVersionDomain';
import {
  formatAuditCodename,
  getAuditCodenameTooltip,
  resolveShortOrganizacionName,
} from '../lib/codenameDomain';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import { containsRawUuid } from '../lib/zeroUuid';
import { renderDetailPageTemplate } from './detailTemplate';

export interface AuditSectionCertContext {
  id: string;
  id_organizacion?: string | null;
  numero_certificado: string;
  organizacion_nombre: string;
  organizacion_abreviacion?: string | null;
  norma_codigo?: string;
  estatus?: string;
  version_numero?: number | null;
  alcance_es?: string | null;
  alcance_en?: string | null;
  hasAlcance?: boolean;
}

export interface AuditSectionShellProps {
  sectionTitle: string;
  sectionSymbol: string;
  backSubview: string;
  /** @deprecated Unified 3-zone Less Is More shell is now standard for all Bloque 1 sections. */
  compactMode?: boolean;
  lastAddedPlannedLabel?: string;
  certInfo: AuditSectionCertContext | null;
  certificados?: ReadonlyArray<CertificadoDetailEntity>;
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
 * Implements the unified "Less Is More" 3-zone structure:
 * - Header: Back + brief section heading (`🏷️ Tipo`), right-aligned `+ Auditoría` & `Historial de Cambios`
 * - Zone 1: Compact data bar (Org `abreviacion` nav button, Cert+Version `📜 FN-... vN` nav button,
 *   non-redundant badges with `Field: Value` tooltips, single planned date, 1-line truncated Scope)
 * - Zone 2: Single responsive row with Audit Selector (`"2026-01 Renov."`, `1/N`) + conditional
 *   Linked Certificates `<select data-action="select-linked-sibling-select">` (`> 1` certs only)
 * - Zone 3: Domain core (`bodyHtml` or empty audit fallback)
 */
export function renderAuditSectionShell(props: AuditSectionShellProps): string {
  const {
    sectionTitle,
    sectionSymbol,
    backSubview,
    compactMode,
    lastAddedPlannedLabel,
    certInfo,
    certificados = [],
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

  void compactMode;

  const activeAudit = navigation.activeAudit;
  const programById = new Map(programs.filter((p) => !p.deleted_at).map((p) => [p.id, p]));
  const activeProgram =
    activeAudit?.id_programa_auditoria
      ? programById.get(activeAudit.id_programa_auditoria) ?? null
      : null;

  const certId = certInfo?.id || activeAudit?.id_certificado || navigation.certId || '';
  const matchedDetailedCert = certId
    ? certificados.find((c) => !c.deleted_at && c.id === certId) ?? null
    : null;
  const snapshot =
    certificados.length > 0 && (activeAudit || certId)
      ? resolveCertVersionSnapshotForAudit(
          activeAudit ?? {
            id_certificado: certId,
            organizacion_nombre: certInfo?.organizacion_nombre,
            organizacion_abreviacion: certInfo?.organizacion_abreviacion,
            version_numero: certInfo?.version_numero,
          },
          certificados
        )
      : null;

  const certNumero =
    certInfo?.numero_certificado || activeAudit?.numero_certificado || 'Certificado';
  const orgId =
    certInfo?.id_organizacion ||
    activeAudit?.id_organizacion ||
    matchedDetailedCert?.id_organizacion ||
    '';
  const orgNombre =
    snapshot?.organizacionNombre ||
    certInfo?.organizacion_nombre ||
    activeAudit?.organizacion_nombre ||
    'Organización';
  const orgAbrev =
    snapshot?.organizacionAbreviacion ??
    certInfo?.organizacion_abreviacion ??
    activeAudit?.organizacion_abreviacion ??
    null;
  const orgButtonLabel =
    (orgAbrev && orgAbrev.trim()) ||
    resolveShortOrganizacionName({
      nombre: orgNombre,
      abreviacion: orgAbrev,
    });
  const normaCodigo = certInfo?.norma_codigo || activeAudit?.norma_codigo || '';
  const versionNumero =
    (typeof activeAudit?.version_numero === 'number' && activeAudit.version_numero >= 1
      ? Math.floor(activeAudit.version_numero)
      : null) ??
    snapshot?.versionNumero ??
    (typeof certInfo?.version_numero === 'number' && certInfo.version_numero >= 1
      ? Math.floor(certInfo.version_numero)
      : null);
  const certVersionLabel = `${certNumero}${versionNumero !== null ? ` v${versionNumero}` : ''}`;

  const alcanceEs =
    (certInfo?.alcance_es || snapshot?.alcance_es || '').trim() || null;
  const alcanceEn =
    (certInfo?.alcance_en || snapshot?.alcance_en || '').trim() || null;
  const hasExplicitNoAlcance =
    certInfo?.hasAlcance === false || (snapshot !== null && !snapshot.hasAlcance);
  const certStatusMeta = certInfo?.estatus
    ? getCertificateStatusBadgeMeta(certInfo.estatus)
    : null;

  const cleanAuditCode =
    activeAudit?.codigo_auditoria && !containsRawUuid(activeAudit.codigo_auditoria)
      ? activeAudit.codigo_auditoria.trim()
      : '';
  const isLinkedProgram = Boolean(
    activeProgram?.es_vinculada ||
      (activeProgram && activeProgram.auditorias.filter((a) => !a.deleted_at).length > 1) ||
      linkedSiblings.length > 1
  );
  const cleanProgramCode =
    isLinkedProgram &&
    activeProgram?.codigo_programa &&
    !containsRawUuid(activeProgram.codigo_programa)
      ? activeProgram.codigo_programa.trim()
      : '';

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

  const cycleStatusLabel = activeAudit
    ? activeAudit.estado_ciclo || activeAudit.estatus || 'En Programación'
    : null;

  const orgButtonHtml = orgId
    ? `
      <button
        type="button"
        data-parent-nav="true"
        data-nav="certificacion"
        data-subview="organizations"
        data-parent-type="org"
        data-entity-id="${escapeHtml(orgId)}"
        data-testid="zone1-org-nav-btn"
        title="Organización: ${escapeHtml(orgNombre)}"
        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/70 text-xs font-bold text-slate-800 hover:text-indigo-900 transition-colors cursor-pointer whitespace-nowrap shrink-0"
      >
        <span aria-hidden="true">🏢</span>
        <span>${escapeHtml(orgButtonLabel)}</span>
      </button>
    `
    : `
      <span
        data-testid="zone1-org-label"
        title="Organización: ${escapeHtml(orgNombre)}"
        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-800 whitespace-nowrap shrink-0"
      >
        <span aria-hidden="true">🏢</span>
        <span>${escapeHtml(orgButtonLabel)}</span>
      </span>
    `;

  const certButtonTitle = `Certificado: ${certNumero}${
    normaCodigo ? ` · Norma: ${normaCodigo}` : ''
  }${
    versionNumero !== null
      ? ` · Versión: v${versionNumero}${snapshot && !snapshot.esVersionActual ? ' (Histórica)' : ''}`
      : ''
  }`;

  const certButtonHtml = certId
    ? `
      <button
        type="button"
        data-parent-nav="true"
        data-nav="certificacion"
        data-subview="certificates"
        data-parent-type="cert"
        data-entity-id="${escapeHtml(certId)}"
        data-testid="zone1-cert-nav-btn"
        title="${escapeHtml(certButtonTitle)}"
        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/70 font-mono text-xs font-bold text-indigo-700 hover:text-indigo-900 transition-colors cursor-pointer whitespace-nowrap shrink-0"
      >
        <span aria-hidden="true">📜</span>
        <span>${escapeHtml(certVersionLabel)}</span>
      </button>
    `
    : `
      <span
        data-testid="zone1-cert-label"
        title="${escapeHtml(certButtonTitle)}"
        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-slate-200 font-mono text-xs font-bold text-slate-900 whitespace-nowrap shrink-0"
      >
        <span aria-hidden="true">📜</span>
        <span>${escapeHtml(certVersionLabel)}</span>
      </span>
    `;

  const normaBadgeHtml = normaCodigo
    ? `<span title="Norma: ${escapeHtml(normaCodigo)}" class="inline-flex items-center px-1.5 py-0.5 rounded-md border border-slate-200 bg-white text-[10px] font-semibold text-slate-700 whitespace-nowrap shrink-0">${escapeHtml(
        normaCodigo
      )}</span>`
    : '';

  const certStatusBadgeHtml = certStatusMeta
    ? `<span title="Estatus del Certificado: ${escapeHtml(
        certStatusMeta.label
      )}" class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
        certStatusMeta.badgeClass
      } whitespace-nowrap shrink-0">${escapeHtml(certStatusMeta.label)}</span>`
    : '';

  const cycleStatusBadgeHtml = cycleStatusLabel
    ? `<span data-testid="zone1-cycle-status" title="Estado del Ciclo: ${escapeHtml(
        cycleStatusLabel
      )}" class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-indigo-50 text-indigo-800 border-indigo-200 whitespace-nowrap shrink-0">${escapeHtml(
        cycleStatusLabel
      )}</span>`
    : '';

  const auditCodeChipHtml = cleanAuditCode
    ? `<span data-testid="shell-audit-code" title="Código de Auditoría: ${escapeHtml(
        cleanAuditCode
      )}" class="inline-flex items-center px-1.5 py-0.5 rounded-md border border-indigo-200 bg-indigo-50 text-[10px] font-mono font-bold text-indigo-800 whitespace-nowrap shrink-0">${escapeHtml(
        cleanAuditCode
      )}</span>`
    : '';

  const programCodeChipHtml = cleanProgramCode
    ? `<span data-testid="shell-program-code" title="Programa Vinculado: ${escapeHtml(
        cleanProgramCode
      )}" class="inline-flex items-center px-1.5 py-0.5 rounded-md border border-violet-200 bg-violet-50 text-[10px] font-mono font-bold text-violet-800 whitespace-nowrap shrink-0">${escapeHtml(
        cleanProgramCode
      )}</span>`
    : '';

  const plannedDateHtml = activeAudit
    ? `<span data-testid="zone1-planned-date" title="Fecha Programada: ${escapeHtml(
        resolvedPlannedDateLabel
      )}" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-slate-200 bg-white text-[11px] font-semibold text-slate-700 whitespace-nowrap shrink-0"><span aria-hidden="true">📅</span><span>${escapeHtml(
        resolvedPlannedDateLabel
      )}</span></span>`
    : '';

  const alcanceTooltip = alcanceEs
    ? `${alcanceEs}${alcanceEn ? `\n\nEN: ${alcanceEn}` : ''}`
    : 'Sin Alcance activo registrado en Certificación → Certificado → Alcance.';
  const contextualAlcanceHtml = alcanceEs
    ? `<div data-testid="zone1-alcance" class="text-[11px] text-slate-600 flex items-center gap-1.5 min-w-0" title="Alcance: ${escapeHtml(
        alcanceTooltip
      )}">
         <span class="font-bold text-slate-700 shrink-0">Alcance:</span>
         <span class="truncate">${escapeHtml(alcanceEs)}</span>
       </div>`
    : hasExplicitNoAlcance
    ? `<div class="flex items-center">
         <span data-testid="audit-missing-alcance-chip" title="Alcance: ${escapeHtml(
           alcanceTooltip
         )}" class="inline-flex items-center px-2 py-0.5 rounded-md border border-rose-200 bg-rose-50 text-[10px] font-bold text-rose-800 whitespace-nowrap">Sin alcance</span>
       </div>`
    : '';

  const zone1DataHtml = `
    <div
      data-testid="audit-zone-1-data"
      class="bg-slate-50/80 border border-slate-200 rounded-xl py-2 px-3 space-y-1.5"
    >
      <div class="flex flex-wrap items-center gap-1.5 min-w-0">
        ${orgButtonHtml}
        ${certButtonHtml}
        ${normaBadgeHtml}
        ${certStatusBadgeHtml}
        ${cycleStatusBadgeHtml}
        ${auditCodeChipHtml}
        ${programCodeChipHtml}
        ${plannedDateHtml}
      </div>
      ${contextualAlcanceHtml}
    </div>
  `;

  // Zone 2 — Fila Única de Selectores (Auditoría del certificado + Certificados vinculados condicional)
  const auditsCount = navigation.auditsForCert.length;
  const positionLabel =
    auditsCount > 0 && navigation.activeIndex >= 0
      ? `${navigation.activeIndex + 1}/${auditsCount}`
      : '0/0';

  const auditSelectorHtml =
    auditsCount > 0 && activeAudit
      ? `
        <div class="inline-flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            data-action="step-section-audit"
            data-cert-id="${escapeHtml(certId)}"
            data-audit-id="${escapeHtml(navigation.prevAuditId || '')}"
            ${!navigation.prevAuditId ? 'disabled' : ''}
            title="Auditoría más reciente (anterior en lista)"
            aria-label="Auditoría anterior en lista"
            class="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors shrink-0"
          >
            ◀
          </button>
          <select
            data-action="select-section-audit"
            data-cert-id="${escapeHtml(certId)}"
            aria-label="Seleccionar auditoría del certificado"
            title="${escapeHtml(getAuditCodenameTooltip(activeAudit))}"
            class="h-8 max-w-[200px] sm:max-w-[240px] px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-900 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none truncate"
          >
            ${navigation.auditsForCert
              .map((aud) => {
                const label = formatCompactAuditSelectorOptionLabel(aud);
                const selected = aud.id === activeAudit.id ? 'selected' : '';
                return `<option value="${escapeHtml(aud.id)}" title="${escapeHtml(
                  getAuditCodenameTooltip(aud)
                )}" ${selected}>${escapeHtml(label)}</option>`;
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
            class="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors shrink-0"
          >
            ▶
          </button>
          <span
            data-testid="audit-selector-counter"
            title="Auditoría ${navigation.activeIndex + 1} de ${auditsCount} del certificado"
            class="px-1.5 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[10px] font-bold text-slate-600 tabular-nums whitespace-nowrap shrink-0"
          >
            ${escapeHtml(positionLabel)}
          </span>
        </div>
      `
      : `
        <span class="px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-800 whitespace-nowrap">
          Sin auditorías registradas
        </span>
      `;

  const linkedSiblingSelectHtml =
    showLinkedSiblings && linkedSiblings.length > 1 && activeAudit
      ? (() => {
          const linkMeta = formatCompactLinkNature(
            activeProgram,
            linkedSiblings.length,
            true
          );
          const isInterOrg = activeProgram?.nivel_vinculacion === 'NIVEL_2_INTER_ORG';
          const activeSib = linkedSiblings.find((s) => s.isActive) ?? linkedSiblings[0];
          const activeOrgHint = activeSib
            ? resolveShortOrganizacionName({
                nombre: activeSib.audit.organizacion_nombre || '',
                abreviacion: activeSib.audit.organizacion_abreviacion,
              })
            : '';
          const selectTooltip = `Certificados vinculados (${linkMeta.full})${
            isInterOrg && activeOrgHint ? ` · Activo: ${activeOrgHint}` : ''
          }`;

          return `
            <div
              data-testid="linked-sibling-selector-group"
              class="inline-flex items-center gap-1.5 min-w-0 sm:pl-2 sm:border-l sm:border-slate-200"
            >
              <span
                title="Tipo de Vinculación: ${escapeHtml(linkMeta.full)}"
                class="inline-flex items-center px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-[10px] font-bold text-indigo-800 whitespace-nowrap shrink-0"
              >
                ${escapeHtml(linkMeta.short)}
              </span>
              <select
                data-action="select-linked-sibling-select"
                aria-label="Seleccionar certificado vinculado"
                title="${escapeHtml(selectTooltip)}"
                class="h-8 max-w-[200px] sm:max-w-[240px] px-2.5 rounded-lg border border-indigo-300 bg-white text-xs font-mono font-bold text-indigo-900 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none truncate"
              >
                ${linkedSiblings
                  .map((sib) => {
                    const sibOrgHint =
                      isInterOrg && sib.audit.organizacion_nombre
                        ? resolveShortOrganizacionName({
                            nombre: sib.audit.organizacion_nombre,
                            abreviacion: sib.audit.organizacion_abreviacion,
                          })
                        : '';
                    const optTooltip = `${sib.audit.numero_certificado}${
                      sibOrgHint ? ` · ${sibOrgHint}` : ''
                    } · ${sib.audit.norma_codigo} · ${formatAuditCodename(sib.audit)}`;
                    const optLabel = sib.audit.numero_certificado || sib.selectorLabel;
                    return `<option value="${escapeHtml(sib.audit.id)}" data-cert-id="${escapeHtml(
                      sib.audit.id_certificado
                    )}" title="${escapeHtml(optTooltip)}" ${
                      sib.isActive ? 'selected' : ''
                    }>${escapeHtml(optLabel)}</option>`;
                  })
                  .join('')}
              </select>
            </div>
          `;
        })()
      : '';

  const zone2SelectorsHtml = `
    <div
      data-testid="audit-zone-2-selectors"
      class="flex flex-wrap items-center gap-2"
    >
      ${auditSelectorHtml}
      ${linkedSiblingSelectHtml}
    </div>
  `;

  const customParentZoneHtml = `
    <div class="space-y-2">
      ${zone1DataHtml}
      ${zone2SelectorsHtml}
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
    title: sectionTitle,
    changelogEntityName: `${sectionTitle} · ${certNumero}`,
    secondaryHeaderBadge: !isStaff
      ? {
          label: '🔒 Solo lectura',
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
    compactLayout: true,
    tableName,
    recordId: activeAudit?.id || '',
    isCreateMode: !activeAudit,
    feedbackHtml: `${futureBannerHtml}${feedbackHtml}`,
    attributes: [],
    customRecordBodyHtml: resolvedBodyHtml,
    modalsHtml,
  })}</div>`;
}
