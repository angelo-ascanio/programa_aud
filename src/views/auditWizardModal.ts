import { escapeHtml } from '../lib/html';
import type { OrganizacionEntity } from '../lib/activeCertificates';
import type { ConglomeradoEntity } from '../lib/conglomeradoDomain';
import type { TipoAuditoriaCatalogItem } from '../lib/extraDomain';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import {
  resolveCertEffectiveNatureInBox,
  type VinculoEntity,
} from '../lib/vinculoDomain';
import {
  canAdvanceWizardStep,
  evaluateWizardAlcanceGate,
  getEligibleOrganizationsForWizard,
  resolveEligibleVinculosForConglomerado,
  suggestWizardEtiqueta,
  WIZARD_NO_VINCULO_GUIDANCE_MESSAGE,
  type AuditWizardState,
  type WizardVinculoCertOption,
} from '../lib/auditWizardDomain';
import {
  AUDIT_LINK_NATURES,
  type AuditLinkNature,
} from '../lib/auditPlanningEngine';
import { hasCertificateActiveAlcance } from '../lib/alcanceDomain';
import {
  formatAuditCodename,
  resolveShortConglomeradoName,
  resolveShortOrganizacionName,
} from '../lib/codenameDomain';

export interface AuditWizardModalProps {
  state: AuditWizardState | null;
  conglomerados: ReadonlyArray<ConglomeradoEntity>;
  organizaciones: ReadonlyArray<OrganizacionEntity>;
  vinculos: ReadonlyArray<VinculoEntity>;
  certificados: ReadonlyArray<CertificadoDetailEntity>;
  tiposCatalog: ReadonlyArray<TipoAuditoriaCatalogItem>;
}

const MONTHS_ES: ReadonlyArray<{ value: number; label: string }> = [
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

const SELECTABLE_ROW_NATURES: ReadonlyArray<AuditLinkNature> = AUDIT_LINK_NATURES.filter(
  (n) => n !== 'Mixta'
);

function resolveBoxMembersForRender(
  state: AuditWizardState,
  selectedVinculo: VinculoEntity | null,
  certById: ReadonlyMap<string, CertificadoDetailEntity>,
  orgById: ReadonlyMap<string, OrganizacionEntity>
): WizardVinculoCertOption[] {
  if (state.vinculoMembers.length > 0 && state.selectedVinculoId === selectedVinculo?.id) {
    return state.vinculoMembers;
  }
  if (!selectedVinculo) return [];

  const activeCertIds =
    state.certTypes.length > 0
      ? new Set(state.certTypes.map((c) => c.id_certificado))
      : null;

  return selectedVinculo.certificados
    .filter((c) => !c.deleted_at)
    .map((m) => {
      const certDetail = certById.get(m.id_certificado);
      const org = orgById.get(m.id_organizacion || certDetail?.id_organizacion || '');
      const hasAlcance = certDetail
        ? typeof certDetail.hasAlcance === 'boolean'
          ? certDetail.hasAlcance
          : hasCertificateActiveAlcance(certDetail)
        : typeof m.hasAlcance === 'boolean'
        ? m.hasAlcance
        : true;
      const versionNum =
        certDetail?.version_actual_numero && certDetail.version_actual_numero >= 1
          ? Math.floor(certDetail.version_actual_numero)
          : null;

      return {
        id_certificado: m.id_certificado,
        numero_certificado: m.numero_certificado || certDetail?.numero_certificado || 'Certificado',
        norma_codigo: m.norma_codigo || certDetail?.norma_codigo || '',
        id_organizacion: m.id_organizacion || certDetail?.id_organizacion || '',
        organizacion_nombre: m.organizacion_nombre || certDetail?.organizacion_nombre || org?.nombre || '',
        organizacion_abreviacion:
          m.organizacion_abreviacion ??
          certDetail?.organizacion_abreviacion ??
          org?.abreviacion ??
          null,
        version_numero: versionNum,
        enabled: activeCertIds ? activeCertIds.has(m.id_certificado) : true,
        baseNaturaleza: resolveCertEffectiveNatureInBox(selectedVinculo, m),
        hasActiveAlcance: hasAlcance,
      };
    });
}

function renderAlcanceBlockerAlert(
  selectedVinculo: VinculoEntity | null,
  enabledCertIds: ReadonlySet<string>,
  certificados: ReadonlyArray<CertificadoDetailEntity>,
  organizaciones: ReadonlyArray<OrganizacionEntity>
): string {
  if (!selectedVinculo || enabledCertIds.size === 0) return '';
  const gate = evaluateWizardAlcanceGate(
    selectedVinculo,
    certificados,
    organizaciones,
    enabledCertIds
  );
  if (gate.allowed) return '';

  return `
    <div
      role="alert"
      data-testid="wizard-alcance-blocker"
      class="rounded-xl border border-rose-300 bg-rose-50 p-3.5 space-y-2"
    >
      <div class="flex items-start gap-2 text-xs font-semibold text-rose-900">
        <span class="text-sm shrink-0" aria-hidden="true">🚫</span>
        <div class="space-y-1.5 min-w-0">
          <p>${escapeHtml(
            gate.reason ||
              'Uno o más certificados activos no poseen un Alcance en español registrado.'
          )}</p>
          ${
            gate.missingCerts && gate.missingCerts.length > 0
              ? `<div class="flex flex-wrap gap-1.5">
                  ${gate.missingCerts
                    .map(
                      (mc) =>
                        `<span class="inline-flex items-center px-2 py-0.5 rounded border border-rose-200 bg-white text-[11px] font-mono font-bold text-rose-800">${escapeHtml(
                          mc.abreviacion
                            ? `${mc.numero_certificado} (${mc.abreviacion})`
                            : mc.numero_certificado
                        )} · Sin alcance</span>`
                    )
                    .join('')}
                </div>`
              : ''
          }
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-action="wizard-quick-nav"
          data-nav="certificacion"
          data-subview="certificates"
          class="px-3 py-1.5 rounded-lg border border-rose-300 bg-white hover:bg-rose-100 text-rose-900 text-xs font-bold cursor-pointer"
        >
          📜 Ir a Certificado
        </button>
      </div>
    </div>
  `;
}

function renderWizardStep1(params: {
  state: AuditWizardState;
  activeCongs: ReadonlyArray<ConglomeradoEntity>;
  eligibleOrgs: ReadonlyArray<OrganizacionEntity>;
  congById: ReadonlyMap<string, ConglomeradoEntity>;
  selectedCong: ConglomeradoEntity | null;
  selectedOrg: OrganizacionEntity | null;
}): string {
  const { state, activeCongs, eligibleOrgs, congById, selectedCong, selectedOrg } = params;

  return `
    <div class="space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="space-y-1.5">
          <label for="wizardConglomeradoSelect" class="block text-xs font-bold text-slate-700">
            Conglomerado <span class="text-rose-600">*</span>
          </label>
          <select
            id="wizardConglomeradoSelect"
            name="wizard_conglomerado"
            data-focus-key="wizardConglomeradoSelect"
            class="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
          >
            <option value="">Seleccionar conglomerado...</option>
            ${activeCongs
              .map((g) => {
                const shortName = resolveShortConglomeradoName({
                  nombre: g.nombre,
                  abreviacion: g.abreviacion,
                  codigo_grupo: g.codigo_grupo,
                });
                return `<option value="${escapeHtml(g.id)}" ${
                  g.id === state.selectedConglomeradoId ? 'selected' : ''
                }>${escapeHtml(shortName)}</option>`;
              })
              .join('')}
          </select>
        </div>

        <div class="space-y-1.5">
          <label for="wizardOrganizacionSelect" class="block text-xs font-bold text-slate-700">
            Organización <span class="text-slate-400 font-normal">(opcional)</span>
          </label>
          <select
            id="wizardOrganizacionSelect"
            name="wizard_organizacion"
            data-focus-key="wizardOrganizacionSelect"
            class="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
          >
            <option value="">${
              state.selectedConglomeradoId
                ? `Todas del conglomerado (${eligibleOrgs.length})`
                : 'Seleccionar organización...'
            }</option>
            ${eligibleOrgs
              .map((o) => {
                const shortOrg = resolveShortOrganizacionName({
                  nombre: o.nombre,
                  abreviacion: o.abreviacion,
                });
                const orgCong = o.id_grupo_empresarial ? congById.get(o.id_grupo_empresarial) : null;
                const shortCong = orgCong
                  ? resolveShortConglomeradoName({
                      nombre: orgCong.nombre,
                      abreviacion: orgCong.abreviacion,
                      codigo_grupo: orgCong.codigo_grupo,
                    })
                  : '';
                const label =
                  shortCong && !state.selectedConglomeradoId
                    ? `${shortOrg} (${shortCong})`
                    : shortOrg;
                return `<option value="${escapeHtml(o.id)}" ${
                  o.id === state.selectedOrganizacionId ? 'selected' : ''
                }>${escapeHtml(label)}</option>`;
              })
              .join('')}
          </select>
        </div>
      </div>

      ${
        selectedCong
          ? `
            <div class="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs flex flex-wrap items-center justify-between gap-2">
              <div class="font-bold text-slate-800">
                🏛️ ${escapeHtml(
                  resolveShortConglomeradoName({
                    nombre: selectedCong.nombre,
                    abreviacion: selectedCong.abreviacion,
                    codigo_grupo: selectedCong.codigo_grupo,
                  })
                )}
              </div>
              <div class="text-slate-600">
                ${
                  selectedOrg
                    ? `🏢 <strong>${escapeHtml(
                        resolveShortOrganizacionName({
                          nombre: selectedOrg.nombre,
                          abreviacion: selectedOrg.abreviacion,
                        })
                      )}</strong> · `
                    : ''
                }${eligibleOrgs.length} org.
              </div>
            </div>
          `
          : ''
      }
    </div>
  `;
}

function renderWizardStep2(params: {
  state: AuditWizardState;
  eligibleVinculos: ReadonlyArray<VinculoEntity>;
  selectedVinculo: VinculoEntity | null;
  boxMembers: ReadonlyArray<WizardVinculoCertOption>;
  certificados: ReadonlyArray<CertificadoDetailEntity>;
  organizaciones: ReadonlyArray<OrganizacionEntity>;
  wizardAlcanceBlockerHtml: string;
}): string {
  const {
    state,
    eligibleVinculos,
    selectedVinculo,
    boxMembers,
    certificados,
    organizaciones,
    wizardAlcanceBlockerHtml,
  } = params;

  const manageVinculoLinkHtml = `
    <div class="flex items-center justify-end pt-1">
      <a
        href="#/certificacion/vinculo"
        data-action="wizard-quick-nav"
        data-nav="certificacion"
        data-subview="vinculo"
        class="text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 hover:underline"
      >
        Gestionar cajas en Vínculo →
      </a>
    </div>
  `;

  if (eligibleVinculos.length === 0) {
    return `
      <div
        role="alert"
        data-testid="wizard-no-vinculo-blocker"
        class="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3"
      >
        <div class="flex items-start gap-2.5 text-xs text-amber-950 font-semibold">
          <span class="text-base shrink-0" aria-hidden="true">⚠️</span>
          <p>${escapeHtml(WIZARD_NO_VINCULO_GUIDANCE_MESSAGE)}</p>
        </div>
        <div class="flex flex-wrap items-center gap-2 pt-1">
          <a
            href="#/certificacion/vinculo"
            data-action="wizard-quick-nav"
            data-nav="certificacion"
            data-subview="vinculo"
            class="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer inline-flex items-center"
          >
            🔗 Gestionar cajas en Vínculo
          </a>
          <button
            type="button"
            data-action="wizard-quick-nav"
            data-nav="certificacion"
            data-subview="certificates"
            class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold cursor-pointer"
          >
            📜 Ir a Certificado
          </button>
        </div>
      </div>
    `;
  }

  const activeCount = boxMembers.filter((m) => m.enabled).length;

  return `
    <div class="space-y-3">
      <div class="space-y-2 max-h-48 overflow-y-auto pr-1">
        ${eligibleVinculos
          .map((v) => {
            const isSelected = v.id === state.selectedVinculoId;
            const activeMembers = v.certificados.filter((c) => !c.deleted_at);
            const boxGate = evaluateWizardAlcanceGate(v, certificados, organizaciones);
            return `
              <button
                type="button"
                data-action="select-wizard-vinculo"
                data-vinculo-id="${escapeHtml(v.id)}"
                data-focus-key="wizard-box-${escapeHtml(v.id)}"
                aria-pressed="${isSelected ? 'true' : 'false'}"
                class="w-full text-left p-3 rounded-xl border transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                  isSelected
                    ? 'border-slate-900 bg-slate-900/5 ring-1 ring-slate-900/20'
                    : !boxGate.allowed
                    ? 'border-rose-200 bg-rose-50/30 hover:border-rose-300'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }"
              >
                <span class="text-xs font-bold text-slate-900 truncate">
                  🔗 ${escapeHtml(v.etiqueta)}
                </span>
                <div class="flex items-center gap-1.5 shrink-0">
                  ${
                    !boxGate.allowed
                      ? '<span class="px-2 py-0.5 rounded border border-rose-200 bg-rose-50 text-[10px] font-bold text-rose-800">Sin alcance</span>'
                      : ''
                  }
                  <span class="px-2 py-0.5 rounded border text-[10px] font-bold ${
                    v.es_vinculada
                      ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                      : 'bg-slate-100 text-slate-700 border-slate-200'
                  }">
                    ${escapeHtml(v.tipo_vinculacion || (v.es_vinculada ? 'Integrada' : 'Individual'))} · ${activeMembers.length} cert.
                  </span>
                </div>
              </button>
            `;
          })
          .join('')}
      </div>

      ${
        selectedVinculo && boxMembers.length > 0
          ? `
            <div class="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="text-xs font-bold text-slate-800">
                  Certificados a auditar (${activeCount}/${boxMembers.length} activos)
                </span>
                ${
                  boxMembers.length > 1
                    ? `
                      <div class="flex items-center gap-1.5">
                        <button
                          type="button"
                          data-action="wizard-select-all-certs"
                          data-mode="all"
                          data-focus-key="wizard-select-all"
                          class="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-[11px] font-bold cursor-pointer"
                        >
                          Activar todos
                        </button>
                        <button
                          type="button"
                          data-action="wizard-select-all-certs"
                          data-mode="first"
                          data-focus-key="wizard-select-first"
                          class="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-[11px] font-semibold cursor-pointer"
                        >
                          Solo 1º
                        </button>
                      </div>
                    `
                    : ''
                }
              </div>

              <div class="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                ${boxMembers
                  .map((m) => {
                    const shortOrg = resolveShortOrganizacionName({
                      nombre: m.organizacion_nombre,
                      abreviacion: m.organizacion_abreviacion,
                    });
                    return `
                      <label
                        class="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                          m.enabled
                            ? m.hasActiveAlcance
                              ? 'bg-white border-slate-200 hover:border-slate-300'
                              : 'bg-rose-50/60 border-rose-200'
                            : 'bg-slate-100/70 border-slate-200 opacity-75'
                        }"
                      >
                        <span class="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            data-action="toggle-wizard-cert"
                            data-cert-id="${escapeHtml(m.id_certificado)}"
                            data-focus-key="wizard-toggle-${escapeHtml(m.id_certificado)}"
                            ${m.enabled ? 'checked' : ''}
                            class="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 shrink-0"
                          />
                          <span class="min-w-0">
                            <span class="flex items-center gap-1.5 flex-wrap">
                              <span class="font-mono text-xs font-bold text-slate-900">${escapeHtml(m.numero_certificado)}</span>
                              ${
                                m.version_numero !== null
                                  ? `<span class="px-1.5 py-0.2 rounded border border-indigo-200 bg-indigo-50 text-[10px] font-mono font-bold text-indigo-700">v${m.version_numero}</span>`
                                  : ''
                              }
                              ${
                                !m.hasActiveAlcance
                                  ? `<span class="px-1.5 py-0.2 rounded border border-rose-200 bg-rose-50 text-[10px] font-bold text-rose-800">${
                                      m.enabled ? 'Sin alcance (bloquea en ON)' : 'Sin alcance (omitido)'
                                    }</span>`
                                  : ''
                              }
                            </span>
                            <span class="block text-[11px] text-slate-500 truncate">
                              ${escapeHtml(shortOrg)}${m.norma_codigo ? ` · ${escapeHtml(m.norma_codigo)}` : ''}
                            </span>
                          </span>
                        </span>
                        <span class="px-2 py-0.5 rounded border border-slate-200 bg-slate-50 text-[10px] font-bold text-slate-700 shrink-0">
                          ${escapeHtml(m.baseNaturaleza)}
                        </span>
                      </label>
                    `;
                  })
                  .join('')}
              </div>
            </div>
          `
          : ''
      }

      ${wizardAlcanceBlockerHtml}
      ${manageVinculoLinkHtml}
    </div>
  `;
}

function renderWizardStep3(params: {
  state: AuditWizardState;
  selectedVinculo: VinculoEntity | null;
  selectedCong: ConglomeradoEntity | null;
  boxMembers: ReadonlyArray<WizardVinculoCertOption>;
  activeTipos: ReadonlyArray<TipoAuditoriaCatalogItem>;
  wizardAlcanceBlockerHtml: string;
}): string {
  const {
    state,
    selectedVinculo,
    selectedCong,
    boxMembers,
    activeTipos,
    wizardAlcanceBlockerHtml,
  } = params;

  const enabledMembers = boxMembers.filter((m) => m.enabled);
  const rows =
    enabledMembers.length > 0
      ? enabledMembers.map((m) => {
          const entry = state.certEntries[m.id_certificado];
          const fallbackType = state.certTypes.find((c) => c.id_certificado === m.id_certificado);
          return {
            id_certificado: m.id_certificado,
            numero_certificado: m.numero_certificado,
            norma_codigo: m.norma_codigo,
            organizacion_nombre: m.organizacion_nombre,
            organizacion_abreviacion: m.organizacion_abreviacion,
            version_numero: m.version_numero,
            hasActiveAlcance: m.hasActiveAlcance,
            tipo_vinculacion:
              entry?.tipo_vinculacion ?? fallbackType?.tipo_vinculacion ?? m.baseNaturaleza,
            id_tipo_auditoria:
              entry?.id_tipo_auditoria ??
              fallbackType?.id_tipo_auditoria ??
              state.defaultTipoAuditoriaId ??
              '',
          };
        })
      : state.certTypes.map((c) => ({
          id_certificado: c.id_certificado,
          numero_certificado: c.numero_certificado,
          norma_codigo: c.norma_codigo,
          organizacion_nombre: c.organizacion_nombre,
          organizacion_abreviacion: c.organizacion_abreviacion ?? null,
          version_numero: c.version_numero ?? null,
          hasActiveAlcance: true,
          tipo_vinculacion: c.tipo_vinculacion,
          id_tipo_auditoria: c.id_tipo_auditoria,
        }));

  const firstTipoId = rows[0]?.id_tipo_auditoria || state.defaultTipoAuditoriaId || '';
  const primaryTipo = activeTipos.find((t) => t.id === firstTipoId) ?? activeTipos[0] ?? null;
  const cleanGoalDate = state.fecha_programada.trim();
  const codenamePreview = formatAuditCodename({
    fechas: [
      state.dateMode === 'PROGRAMADA_EXACTA' && /^\d{4}-\d{2}-\d{2}$/.test(cleanGoalDate)
        ? {
            id: 'wizard-preview',
            id_auditoria: 'wizard-preview',
            numero_secuencia: 1,
            tag: 'Programación',
            tipo_fecha: 'PROGRAMADA_EXACTA',
            anio: null,
            mes: null,
            fecha_inicio: cleanGoalDate,
            fecha_fin: cleanGoalDate,
          }
        : {
            id: 'wizard-preview',
            id_auditoria: 'wizard-preview',
            numero_secuencia: 1,
            tag: 'Programación',
            tipo_fecha: 'PREPROGRAMADA_MES',
            anio: state.anio,
            mes: state.mes,
            fecha_inicio: null,
            fecha_fin: null,
          },
    ],
    tipo_auditoria: primaryTipo?.tipo ?? 'Auditoría',
    tipo_abreviacion: primaryTipo?.abreviacion ?? null,
  });

  const suggestedEtiqueta = suggestWizardEtiqueta({
    vinculo: selectedVinculo,
    conglomerado: selectedCong,
    dateMode: state.dateMode,
    anio: state.anio,
    mes: state.mes,
    fecha_programada: state.fecha_programada,
    primaryTipo,
  });

  const bulkDefaultNature = rows[0]?.tipo_vinculacion ?? 'Combinada';

  return `
    <div class="space-y-4">
      ${wizardAlcanceBlockerHtml}

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="sm:col-span-2 space-y-1">
          <label for="wizardEtiquetaInput" class="block text-xs font-bold text-slate-700">
            Etiqueta de Campaña <span class="text-slate-400 font-normal">(opcional)</span>
          </label>
          <input
            type="text"
            id="wizardEtiquetaInput"
            value="${escapeHtml(state.etiqueta)}"
            maxlength="180"
            placeholder="${escapeHtml(suggestedEtiqueta)}"
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
          />
        </div>
        <div class="space-y-1">
          <label for="wizardDateModeSelect" class="block text-xs font-bold text-slate-700">
            Modalidad de Fecha <span class="text-rose-600">*</span>
          </label>
          <select
            id="wizardDateModeSelect"
            data-focus-key="wizardDateModeSelect"
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
          >
            <option value="PREPROGRAMADA_MES" ${
              state.dateMode === 'PREPROGRAMADA_MES' ? 'selected' : ''
            }>Preprogramada (Año / Mes)</option>
            <option value="PROGRAMADA_EXACTA" ${
              state.dateMode === 'PROGRAMADA_EXACTA' ? 'selected' : ''
            }>Programada Exacta</option>
          </select>
        </div>
      </div>

      <div class="flex flex-wrap items-end justify-between gap-3">
        <div class="flex-1 min-w-[220px] space-y-1">
          ${
            state.dateMode === 'PREPROGRAMADA_MES'
              ? `
                <div class="grid grid-cols-2 gap-3">
                  <div class="space-y-1">
                    <label for="wizardAnioInput" class="block text-xs font-bold text-slate-700">Año</label>
                    <input
                      type="number"
                      id="wizardAnioInput"
                      min="2020"
                      max="2100"
                      value="${state.anio}"
                      class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                  <div class="space-y-1">
                    <label for="wizardMesSelect" class="block text-xs font-bold text-slate-700">Mes</label>
                    <select
                      id="wizardMesSelect"
                      class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
                    >
                      ${MONTHS_ES.map(
                        (m) =>
                          `<option value="${m.value}" ${
                            m.value === state.mes ? 'selected' : ''
                          }>${escapeHtml(m.label)}</option>`
                      ).join('')}
                    </select>
                  </div>
                </div>
              `
              : `
                <div class="space-y-1">
                  <label for="wizardFechaProgramadaInput" class="block text-xs font-bold text-slate-700">
                    Fecha Objetivo Programada (YYYY-MM-DD) <span class="text-rose-600">*</span>
                  </label>
                  <input
                    type="date"
                    id="wizardFechaProgramadaInput"
                    value="${escapeHtml(state.fecha_programada)}"
                    class="w-full sm:max-w-xs text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
                  />
                </div>
              `
          }
        </div>
        <div
          data-testid="wizard-codename-preview"
          class="px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 shrink-0"
        >
          Codename: <span class="font-mono font-bold text-slate-900">${escapeHtml(codenamePreview)}</span>
        </div>
      </div>

      <div class="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="text-xs font-bold text-slate-800">
            Relación y Tipo por Certificado (${rows.length})
          </span>
          ${
            rows.length > 1
              ? `
                <div class="flex flex-wrap items-center gap-2">
                  <div class="flex items-center gap-1">
                    <select
                      id="wizardApplyAllRelacionSelect"
                      aria-label="Relación a aplicar a todos los certificados"
                      class="h-7 px-2 rounded border border-slate-300 bg-white text-[11px] font-semibold text-slate-700"
                    >
                      ${SELECTABLE_ROW_NATURES.map(
                        (nat) =>
                          `<option value="${escapeHtml(nat)}" ${
                            nat === bulkDefaultNature ? 'selected' : ''
                          }>${escapeHtml(nat)}</option>`
                      ).join('')}
                    </select>
                    <button
                      type="button"
                      data-action="wizard-apply-all-relacion"
                      data-focus-key="wizard-apply-all-relacion"
                      class="h-7 px-2 rounded border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-[11px] font-bold cursor-pointer whitespace-nowrap"
                    >
                      Aplicar relación a todos
                    </button>
                  </div>
                  ${
                    activeTipos.length > 0
                      ? `
                        <div class="flex items-center gap-1">
                          <select
                            id="wizardApplyAllTipoSelect"
                            aria-label="Tipo a aplicar a todos los certificados"
                            class="h-7 px-2 rounded border border-slate-300 bg-white text-[11px] font-semibold text-slate-700"
                          >
                            ${activeTipos
                              .map(
                                (t) =>
                                  `<option value="${escapeHtml(t.id)}" ${
                                    t.id === firstTipoId ? 'selected' : ''
                                  }>${escapeHtml(t.tipo)}</option>`
                              )
                              .join('')}
                          </select>
                          <button
                            type="button"
                            data-action="wizard-apply-all-tipo"
                            data-focus-key="wizard-apply-all-tipo"
                            class="h-7 px-2 rounded border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-[11px] font-bold cursor-pointer whitespace-nowrap"
                          >
                            Aplicar tipo a todos
                          </button>
                        </div>
                      `
                      : ''
                  }
                </div>
              `
              : ''
          }
        </div>

        <div class="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table class="w-full table-fixed border-collapse text-xs">
            <colgroup>
              <col style="width: 34%;" />
              <col style="width: 33%;" />
              <col style="width: 33%;" />
            </colgroup>
            <thead class="bg-slate-100/80 border-b border-slate-200 text-[11px] font-bold text-slate-700">
              <tr>
                <th scope="col" class="text-left px-2.5 py-2">Certificado</th>
                <th scope="col" class="text-left px-2.5 py-2">Relación / Naturaleza</th>
                <th scope="col" class="text-left px-2.5 py-2">Tipo de Auditoría</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${rows
                .map((row) => {
                  const shortOrg = resolveShortOrganizacionName({
                    nombre: row.organizacion_nombre,
                    abreviacion: row.organizacion_abreviacion,
                  });
                  return `
                    <tr class="${row.hasActiveAlcance ? '' : 'bg-rose-50/40'}">
                      <td class="px-2.5 py-2 align-middle">
                        <div class="flex items-center gap-1 flex-wrap">
                          <span class="font-mono text-xs font-bold text-slate-900 truncate">${escapeHtml(row.numero_certificado)}</span>
                          ${
                            row.version_numero !== null
                              ? `<span class="px-1 rounded border border-indigo-200 bg-indigo-50 text-[10px] font-mono font-bold text-indigo-700">v${row.version_numero}</span>`
                              : ''
                          }
                        </div>
                        <div class="text-[11px] text-slate-500 truncate">${escapeHtml(shortOrg)}${
                          row.norma_codigo ? ` · ${escapeHtml(row.norma_codigo)}` : ''
                        }</div>
                      </td>
                      <td class="px-2.5 py-2 align-middle">
                        <select
                          data-action="wizard-cert-relacion"
                          data-cert-id="${escapeHtml(row.id_certificado)}"
                          data-focus-key="wizard-rel-${escapeHtml(row.id_certificado)}"
                          aria-label="Relación / Naturaleza para ${escapeHtml(row.numero_certificado)}"
                          class="w-full text-xs p-1.5 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
                        >
                          ${SELECTABLE_ROW_NATURES.map(
                            (nat) =>
                              `<option value="${escapeHtml(nat)}" ${
                                nat === row.tipo_vinculacion ? 'selected' : ''
                              }>${escapeHtml(nat)}</option>`
                          ).join('')}
                        </select>
                      </td>
                      <td class="px-2.5 py-2 align-middle">
                        <select
                          data-action="wizard-cert-tipo"
                          data-cert-id="${escapeHtml(row.id_certificado)}"
                          data-focus-key="wizard-tipo-${escapeHtml(row.id_certificado)}"
                          aria-label="Tipo de auditoría para ${escapeHtml(row.numero_certificado)}"
                          ${!row.hasActiveAlcance ? 'disabled' : ''}
                          class="w-full text-xs p-1.5 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none disabled:opacity-50"
                        >
                          <option value="">Seleccionar tipo...</option>
                          ${activeTipos
                            .map(
                              (t) =>
                                `<option value="${escapeHtml(t.id)}" ${
                                  t.id === row.id_tipo_auditoria ? 'selected' : ''
                                }>${escapeHtml(t.tipo)} (${escapeHtml(t.etapa_ciclo)})</option>`
                            )
                            .join('')}
                        </select>
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

export function renderAuditWizardModal(props: AuditWizardModalProps): string {
  const { state, conglomerados, organizaciones, vinculos, certificados, tiposCatalog } = props;
  if (!state || !state.isOpen) return '';

  const activeCongs = conglomerados
    .filter((g) => !g.deleted_at)
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const eligibleOrgs = getEligibleOrganizationsForWizard(
    state.selectedConglomeradoId,
    organizaciones
  );
  const eligibleVinculos = resolveEligibleVinculosForConglomerado(
    state.selectedConglomeradoId,
    vinculos,
    certificados,
    organizaciones
  );
  const selectedVinculo =
    eligibleVinculos.find((v) => v.id === state.selectedVinculoId) ||
    vinculos.find((v) => !v.deleted_at && v.id === state.selectedVinculoId) ||
    null;
  const activeTipos = tiposCatalog.filter((t) => !t.deleted_at);

  const stepCheck = canAdvanceWizardStep(state, {
    conglomerados: activeCongs,
    organizaciones,
    vinculos,
    certificados,
  });

  const congById = new Map(activeCongs.map((g) => [g.id, g]));
  const orgById = new Map(organizaciones.filter((o) => !o.deleted_at).map((o) => [o.id, o]));
  const certById = new Map(certificados.map((c) => [c.id, c]));

  const boxMembers = resolveBoxMembersForRender(state, selectedVinculo, certById, orgById);
  const enabledCertIds = new Set(boxMembers.filter((m) => m.enabled).map((m) => m.id_certificado));

  const wizardAlcanceBlockerHtml = renderAlcanceBlockerAlert(
    selectedVinculo,
    enabledCertIds,
    certificados,
    organizaciones
  );

  const selectedCong = state.selectedConglomeradoId
    ? congById.get(state.selectedConglomeradoId) || null
    : null;
  const selectedOrg = state.selectedOrganizacionId
    ? orgById.get(state.selectedOrganizacionId) || null
    : null;

  const stepsMeta: Array<{ num: 1 | 2 | 3; label: string }> = [
    { num: 1, label: 'Empresa / Conglomerado' },
    { num: 2, label: 'Vínculo y Certificados' },
    { num: 3, label: 'Fecha, Relación y Tipo' },
  ];

  const stepIndicatorHtml = `
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2" role="tablist" aria-label="Fases de creación de auditoría">
      ${stepsMeta
        .map((s) => {
          const isCurrent = state.step === s.num;
          const isDone = state.step > s.num;
          return `
            <div class="px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 ${
              isCurrent
                ? 'bg-slate-900 text-white border-slate-900'
                : isDone
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-slate-50 text-slate-500 border-slate-200'
            }">
              <span aria-hidden="true">${isDone ? '✓' : `${s.num}.`}</span>
              <span class="truncate">${escapeHtml(s.label)}</span>
            </div>
          `;
        })
        .join('')}
    </div>
  `;

  const bodyHtml =
    state.step === 1
      ? renderWizardStep1({
          state,
          activeCongs,
          eligibleOrgs,
          congById,
          selectedCong,
          selectedOrg,
        })
      : state.step === 2
      ? renderWizardStep2({
          state,
          eligibleVinculos,
          selectedVinculo,
          boxMembers,
          certificados,
          organizaciones,
          wizardAlcanceBlockerHtml,
        })
      : renderWizardStep3({
          state,
          selectedVinculo,
          selectedCong,
          boxMembers,
          activeTipos,
          wizardAlcanceBlockerHtml,
        });

  return `
    <div
      id="addAuditWizardModal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="addAuditWizardTitle"
      class="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] flex items-center justify-center p-4"
    >
      <div class="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <header class="px-5 py-3.5 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between gap-3 shrink-0">
          <h2 id="addAuditWizardTitle" class="text-base font-bold text-slate-900 truncate">
            + Auditoría
          </h2>
          <button
            type="button"
            data-action="close-add-audit-wizard"
            aria-label="Cerrar asistente"
            class="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 cursor-pointer shrink-0"
          >
            ✕
          </button>
        </header>

        <div class="p-5 space-y-4 overflow-y-auto flex-1">
          ${stepIndicatorHtml}
          ${
            state.errorMessage
              ? `
                <div role="alert" class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800">
                  ⚠️ ${escapeHtml(state.errorMessage)}
                </div>
              `
              : ''
          }
          ${bodyHtml}
        </div>

        <footer class="px-4 sm:px-5 py-3.5 border-t border-slate-200 bg-slate-50/60 flex items-center justify-between gap-2 shrink-0">
          <div>
            ${
              state.step > 1
                ? `
                  <button
                    type="button"
                    data-action="wizard-prev-step"
                    class="px-2.5 sm:px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer whitespace-nowrap"
                  >
                    ← Anterior
                  </button>
                `
                : ''
            }
          </div>
          <div class="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              data-action="close-add-audit-wizard"
              class="px-2.5 sm:px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
            >
              Cancelar
            </button>
            ${
              state.step < 3
                ? `
                  <button
                    type="button"
                    data-action="wizard-next-step"
                    ${!stepCheck.allowed && state.step === 2 ? 'disabled' : ''}
                    class="px-3 sm:px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold cursor-pointer whitespace-nowrap"
                  >
                    Siguiente →
                  </button>
                `
                : `
                  <button
                    type="button"
                    data-action="submit-audit-wizard"
                    ${state.isSubmitting || !stepCheck.allowed ? 'disabled' : ''}
                    class="px-3 sm:px-4 py-2 rounded-lg bg-sky-700 hover:bg-sky-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold cursor-pointer whitespace-nowrap"
                  >
                    ${state.isSubmitting ? 'Creando...' : 'Crear Auditoría →'}
                  </button>
                `
            }
          </div>
        </footer>
      </div>
    </div>
  `;
}
