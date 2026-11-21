import { escapeHtml } from '../lib/html';
import type { OrganizacionEntity } from '../lib/activeCertificates';
import type { ConglomeradoEntity } from '../lib/conglomeradoDomain';
import type { TipoAuditoriaCatalogItem } from '../lib/extraDomain';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import type { VinculoEntity } from '../lib/vinculoDomain';
import {
  canAdvanceWizardStep,
  getEligibleOrganizationsForWizard,
  resolveEligibleVinculosForConglomerado,
  WIZARD_NO_VINCULO_GUIDANCE_MESSAGE,
  type AuditWizardState,
} from '../lib/auditWizardDomain';

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
  const certById = new Map(certificados.map((c) => [c.id, c]));
  const selectedCong = state.selectedConglomeradoId
    ? congById.get(state.selectedConglomeradoId) || null
    : null;
  const selectedOrg = state.selectedOrganizacionId
    ? organizaciones.find((o) => !o.deleted_at && o.id === state.selectedOrganizacionId) || null
    : null;

  const stepsMeta: Array<{ num: 1 | 2 | 3; label: string }> = [
    { num: 1, label: '1. Conglomerado / Org' },
    { num: 2, label: '2. Vínculo' },
    { num: 3, label: '3. Tipo por Certificado' },
  ];

  const stepIndicatorHtml = `
    <div class="grid grid-cols-3 gap-2" role="tablist" aria-label="Fases de creación de auditoría">
      ${stepsMeta
        .map((s) => {
          const isCurrent = state.step === s.num;
          const isDone = state.step > s.num;
          return `
            <div class="px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 ${
              isCurrent
                ? 'bg-slate-900 text-white border-slate-900'
                : isDone
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-slate-50 text-slate-500 border-slate-200'
            }">
              <span aria-hidden="true">${isDone ? '✓' : s.num}</span>
              <span class="truncate">${escapeHtml(s.label)}</span>
            </div>
          `;
        })
        .join('')}
    </div>
  `;

  let bodyHtml = '';

  if (state.step === 1) {
    bodyHtml = `
      <div class="space-y-4">
        <p class="text-xs text-slate-600">
          Seleccione un <strong>Conglomerado</strong> o una <strong>Organización</strong> cliente. La selección es bidireccional: al elegir una organización, el conglomerado titular se preselecciona automáticamente.
        </p>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label for="wizardConglomeradoSelect" class="block text-xs font-bold text-slate-700">
              Conglomerado <span class="text-rose-600">*</span>
            </label>
            <select
              id="wizardConglomeradoSelect"
              name="wizard_conglomerado"
              class="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
            >
              <option value="">Seleccionar conglomerado...</option>
              ${activeCongs
                .map(
                  (g) =>
                    `<option value="${escapeHtml(g.id)}" ${
                      g.id === state.selectedConglomeradoId ? 'selected' : ''
                    }>${escapeHtml(g.nombre)}</option>`
                )
                .join('')}
            </select>
          </div>

          <div class="space-y-1.5">
            <label for="wizardOrganizacionSelect" class="block text-xs font-bold text-slate-700">
              Organización <span class="text-slate-400 font-normal">(opcional / bidireccional)</span>
            </label>
            <select
              id="wizardOrganizacionSelect"
              name="wizard_organizacion"
              class="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
            >
              <option value="">${
                state.selectedConglomeradoId
                  ? `Todas las del conglomerado (${eligibleOrgs.length})`
                  : 'Seleccionar organización...'
              }</option>
              ${eligibleOrgs
                .map((o) => {
                  const orgCong = o.id_grupo_empresarial
                    ? congById.get(o.id_grupo_empresarial)?.nombre
                    : '';
                  const label = orgCong && !state.selectedConglomeradoId ? `${o.nombre} (${orgCong})` : o.nombre;
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
              <div class="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1">
                <div class="font-bold text-slate-800">
                  🏛️ Conglomerado activo: ${escapeHtml(selectedCong.nombre)}
                </div>
                <div class="text-slate-600">
                  ${
                    selectedOrg
                      ? `🏢 Organización enfocada: <strong>${escapeHtml(selectedOrg.nombre)}</strong> · `
                      : ''
                  }Organizaciones en grupo: <strong>${eligibleOrgs.length}</strong>
                </div>
              </div>
            `
            : ''
        }
      </div>
    `;
  } else if (state.step === 2) {
    if (eligibleVinculos.length === 0) {
      bodyHtml = `
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
            <button
              type="button"
              data-action="wizard-quick-nav"
              data-nav="auditorias"
              data-subview="vinculo"
              class="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
            >
              🔗 Ir a Vínculo
            </button>
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
    } else {
      bodyHtml = `
        <div class="space-y-3">
          <p class="text-xs text-slate-600">
            ${
              eligibleVinculos.length === 1
                ? 'Este conglomerado tiene un único <strong>Vínculo</strong> activo, preseleccionado automáticamente.'
                : `Seleccione cuál de los <strong>${eligibleVinculos.length} vínculos</strong> del conglomerado se programará en esta campaña:`
            }
          </p>

          <div class="space-y-2 max-h-72 overflow-y-auto pr-1">
            ${eligibleVinculos
              .map((v) => {
                const isSelected = v.id === state.selectedVinculoId;
                const activeMembers = v.certificados.filter((c) => !c.deleted_at);
                return `
                  <button
                    type="button"
                    data-action="select-wizard-vinculo"
                    data-vinculo-id="${escapeHtml(v.id)}"
                    aria-pressed="${isSelected ? 'true' : 'false'}"
                    class="w-full text-left p-3 rounded-xl border transition-colors cursor-pointer space-y-1.5 ${
                      isSelected
                        ? 'border-slate-900 bg-slate-900/5 ring-1 ring-slate-900/20'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }"
                  >
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-xs font-bold text-slate-900">
                        🔗 ${escapeHtml(v.etiqueta)}
                      </span>
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        v.es_vinculada
                          ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                          : 'bg-slate-100 text-slate-700 border-slate-200'
                      }">
                        ${escapeHtml(v.tipo_vinculacion)} · ${activeMembers.length} cert.
                      </span>
                    </div>
                    <div class="flex flex-wrap gap-1.5">
                      ${activeMembers
                        .map((m) => {
                          const certDetail = certById.get(m.id_certificado);
                          const label =
                            m.numero_certificado || certDetail?.numero_certificado || 'Certificado';
                          const norma = m.norma_codigo ? ` (${m.norma_codigo})` : '';
                          return `<span class="px-2 py-0.5 rounded bg-white border border-slate-200 text-[11px] font-mono font-semibold text-slate-700">${escapeHtml(
                            `${label}${norma}`
                          )}</span>`;
                        })
                        .join('')}
                    </div>
                  </button>
                `;
              })
              .join('')}
          </div>
        </div>
      `;
    }
  } else {
    const activeCerts = selectedVinculo
      ? selectedVinculo.certificados.filter((c) => !c.deleted_at)
      : [];
    const draftByCertId = new Map(state.certTypes.map((c) => [c.id_certificado, c.id_tipo_auditoria]));

    bodyHtml = `
      <div class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div class="sm:col-span-2 space-y-1">
            <label for="wizardEtiquetaInput" class="block text-xs font-bold text-slate-700">
              Nombre de Campaña / Auditoría <span class="text-rose-600">*</span>
            </label>
            <input
              type="text"
              id="wizardEtiquetaInput"
              value="${escapeHtml(state.etiqueta)}"
              maxlength="200"
              placeholder="Ej: Seguimiento 2026 — Grupo Norte"
              class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
            />
          </div>
          <div class="space-y-1">
            <label for="wizardDateModeSelect" class="block text-xs font-bold text-slate-700">
              Modalidad de Fecha <span class="text-rose-600">*</span>
            </label>
            <select
              id="wizardDateModeSelect"
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
                    max="2040"
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
              <div class="grid grid-cols-2 gap-3">
                <div class="space-y-1">
                  <label for="wizardFechaInicioInput" class="block text-xs font-bold text-slate-700">Fecha Inicio</label>
                  <input
                    type="date"
                    id="wizardFechaInicioInput"
                    value="${escapeHtml(state.fecha_inicio)}"
                    class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
                  />
                </div>
                <div class="space-y-1">
                  <label for="wizardFechaFinInput" class="block text-xs font-bold text-slate-700">Fecha Fin</label>
                  <input
                    type="date"
                    id="wizardFechaFinInput"
                    value="${escapeHtml(state.fecha_fin)}"
                    class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
                  />
                </div>
              </div>
            `
        }

        <div class="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-xs font-bold text-slate-800">
              Tipo de Auditoría por Certificado (${activeCerts.length})
            </span>
            ${
              activeCerts.length > 1 && activeTipos.length > 0
                ? `
                  <div class="flex items-center gap-1.5">
                    <select
                      id="wizardApplyAllTipoSelect"
                      aria-label="Tipo a copiar a todos los certificados"
                      class="h-7 px-2 rounded border border-slate-300 bg-white text-[11px] font-semibold text-slate-700"
                    >
                      ${activeTipos
                        .map(
                          (t) =>
                            `<option value="${escapeHtml(t.id)}">${escapeHtml(t.tipo)}</option>`
                        )
                        .join('')}
                    </select>
                    <button
                      type="button"
                      data-action="wizard-apply-all-tipo"
                      class="h-7 px-2.5 rounded border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-[11px] font-bold cursor-pointer whitespace-nowrap"
                    >
                      Copiar a todos
                    </button>
                  </div>
                `
                : ''
            }
          </div>

          <div class="space-y-2 max-h-60 overflow-y-auto pr-1">
            ${activeCerts
              .map((m) => {
                const certDetail = certById.get(m.id_certificado);
                const selectedTipoId = draftByCertId.get(m.id_certificado) || '';
                const numeroCert = m.numero_certificado || certDetail?.numero_certificado || 'Certificado';
                const orgNombre = m.organizacion_nombre || certDetail?.organizacion_nombre || '';
                const normaCodigo = m.norma_codigo || certDetail?.norma_codigo || '';
                return `
                  <div class="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-white border border-slate-200 rounded-lg p-2.5">
                    <div class="sm:col-span-7 min-w-0">
                      <div class="font-mono text-xs font-bold text-slate-900 truncate">${escapeHtml(numeroCert)}</div>
                      <div class="text-[11px] text-slate-500 truncate">${escapeHtml(orgNombre)}${
                        normaCodigo ? ` · ${escapeHtml(normaCodigo)}` : ''
                      }</div>
                    </div>
                    <div class="sm:col-span-5">
                      <select
                        data-action="wizard-cert-tipo"
                        data-cert-id="${escapeHtml(m.id_certificado)}"
                        aria-label="Tipo de auditoría para ${escapeHtml(numeroCert)}"
                        class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
                      >
                        <option value="">Seleccionar tipo...</option>
                        ${activeTipos
                          .map(
                            (t) =>
                              `<option value="${escapeHtml(t.id)}" ${
                                t.id === selectedTipoId ? 'selected' : ''
                              }>${escapeHtml(t.tipo)} (${escapeHtml(t.etapa_ciclo)})</option>`
                          )
                          .join('')}
                      </select>
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div
      id="addAuditWizardModal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="addAuditWizardTitle"
      class="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] flex items-center justify-center p-4"
    >
      <div class="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden">
        <header class="px-5 py-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between gap-3">
          <div class="min-w-0">
            <h2 id="addAuditWizardTitle" class="text-base font-bold text-slate-900 truncate">
              + Nueva Auditoría Programada
            </h2>
            <p class="text-[11px] text-slate-500">
              Asistente guiado en 3 fases: Conglomerado → Vínculo → Tipos por Certificado
            </p>
          </div>
          <button
            type="button"
            data-action="close-add-audit-wizard"
            aria-label="Cerrar asistente"
            class="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 cursor-pointer shrink-0"
          >
            ✕
          </button>
        </header>

        <div class="p-5 space-y-4">
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

        <footer class="px-5 py-3.5 border-t border-slate-200 bg-slate-50/60 flex items-center justify-between gap-2">
          <div>
            ${
              state.step > 1
                ? `
                  <button
                    type="button"
                    data-action="wizard-prev-step"
                    class="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer"
                  >
                    ← Anterior
                  </button>
                `
                : ''
            }
          </div>
          <div class="flex items-center gap-2">
            <button
              type="button"
              data-action="close-add-audit-wizard"
              class="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
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
                    class="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold cursor-pointer"
                  >
                    Siguiente →
                  </button>
                `
                : `
                  <button
                    type="button"
                    data-action="submit-audit-wizard"
                    ${state.isSubmitting ? 'disabled' : ''}
                    class="px-4 py-2 rounded-lg bg-sky-700 hover:bg-sky-800 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
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
