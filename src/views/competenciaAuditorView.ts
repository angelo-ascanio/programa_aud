import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import {
  createEmptyCompetenciaFormDraft,
  formatAuditorSelectorLabel,
  getAuditorNormaLinks,
  getAuditorSectorLinks,
  getAuditorSubsectorLinks,
  type AuditorDetailEntity,
  type CompetenciaAuditorFormDraft,
  type CompetenciaAuditorMode,
  type CompetenciaTipo,
} from '../lib/competencyMatrix';
import type { NormaEntity, SectorIafEntity, SubsectorIafEntity } from '../lib/extraDomain';
import { filterSubsectoresBySectorIaf } from '../lib/multisiteSampling';
import {
  renderDetailFormTopActions,
  renderDetailPageTemplate,
  renderDetailParentSelectCard,
  type DetailParentChip,
} from './detailTemplate';

export interface SelectedCompetenciaAuditor {
  id_auditor: string;
  tipo: CompetenciaTipo;
  targetId: string;
}

export interface CompetenciaAuditorViewState {
  isOpen?: boolean;
  mode: CompetenciaAuditorMode;
  selectedComp?: SelectedCompetenciaAuditor | null;
  prefillAuditorId?: string | null;
  formDraft?: CompetenciaAuditorFormDraft;
  errorMessage?: string | null;
  confirmUnlink?: boolean;
}

export interface CompetenciaAuditorViewProps {
  profile: UserProfile;
  state: CompetenciaAuditorViewState;
  auditors: ReadonlyArray<AuditorDetailEntity>;
  normas: ReadonlyArray<NormaEntity>;
  sectores: ReadonlyArray<SectorIafEntity>;
  subsectores: ReadonlyArray<SubsectorIafEntity>;
}

function getCompetenciaTipoDisplay(tipo: CompetenciaTipo): {
  label: string;
  tableName: string;
  symbol: string;
} {
  switch (tipo) {
    case 'sector_iaf':
      return {
        label: 'Sector Técnico IAF',
        tableName: 'sector_iaf_auditor',
        symbol: '🏭',
      };
    case 'subsector_iaf':
      return {
        label: 'Sub-Sector Técnico IAF',
        tableName: 'subsector_iaf_auditor',
        symbol: '🧩',
      };
    default:
      return {
        label: 'Norma ISO Acreditada',
        tableName: 'norma_auditor',
        symbol: '📘',
      };
  }
}

export function renderCompetenciaAuditorView(props: CompetenciaAuditorViewProps): string {
  const { profile, state, auditors, normas, sectores, subsectores } = props;
  const isStaff = isApprovedStaffProfile(profile);
  const mode: CompetenciaAuditorMode = state.mode === 'add' ? 'add' : 'read';

  if (mode === 'add' && !isStaff) {
    return `
      <div class="bg-white border border-rose-200 rounded-2xl p-6 text-center space-y-3 shadow-xs">
        <div class="text-2xl" aria-hidden="true">🔒</div>
        <h2 class="text-sm font-bold text-slate-900">Acceso Restringido a Personal Autorizado</h2>
        <p class="text-xs text-slate-600 max-w-md mx-auto">
          Solo el personal técnico aprobado (ADMIN / WORKER) puede asignar competencias técnicas a los auditores.
        </p>
        <div>
          <button
            type="button"
            data-action="back-to-competencia-parent"
            class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
          >
            ← Volver
          </button>
        </div>
      </div>
    `;
  }

  const sortedAuditors = auditors
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const sortedNormas = normas
    .slice()
    .sort((a, b) => (a.codigo || a.norma).localeCompare(b.codigo || b.norma, 'es'));
  const sortedSectores = sectores.slice().sort((a, b) => a.sector - b.sector);

  if (mode === 'add') {
    const draft: CompetenciaAuditorFormDraft =
      state.formDraft ?? createEmptyCompetenciaFormDraft(state.prefillAuditorId || '', 'norma');
    const tipoMeta = getCompetenciaTipoDisplay(draft.tipo);

    const filteredSubsectores = filterSubsectoresBySectorIaf({
      sectorId: draft.id_sector_iaf,
      sectores: sortedSectores,
      subsectores,
    });

    const customTopActionsHtml = renderDetailFormTopActions({
      mode: 'add',
      isStaff: true,
      formId: 'competenciaAuditorDetailForm',
      saveBtnId: 'saveCompetenciaBtn',
      cancelBtnId: 'cancelCompetenciaBtn',
      editBtnId: 'editCompetenciaBtn',
      saveTitle: 'Asignar competencia',
      cancelTitle: 'Cancelar asignación',
      showHistoryBtn: false,
      showArchiveBtn: false,
    });

    const customParentZoneHtml = `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        ${renderDetailParentSelectCard({
          mode: 'add',
          formId: 'competenciaAuditorDetailForm',
          selectId: 'compParentAuditorSelect',
          name: 'id_auditor',
          label: 'Auditor',
          symbol: '🪪',
          selectedValue: draft.id_auditor,
          placeholder: 'Seleccione auditor...',
          required: true,
          options: sortedAuditors.map((aud) => ({
            value: aud.id,
            label: formatAuditorSelectorLabel(aud),
          })),
        })}
      </div>
    `;

    const feedbackHtml = state.errorMessage
      ? `
        <div role="alert" class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800 flex items-center gap-2">
          <span aria-hidden="true">⚠️</span>
          <span>${escapeHtml(state.errorMessage)}</span>
        </div>
      `
      : '';

    const selectorBodyHtml =
      draft.tipo === 'norma'
        ? `
          <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
            <label for="compSelectNorma" class="block text-xs font-bold text-slate-700">
              Norma ISO Acreditable <span class="text-rose-600" aria-hidden="true">*</span>
            </label>
            <select
              id="compSelectNorma"
              name="id_norma"
              required
              class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-900 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
            >
              <option value="" ${draft.id_norma === '' ? 'selected' : ''}>Seleccione una Norma ISO...</option>
              ${sortedNormas
                .map((n) => {
                  const label = n.titulo
                    ? `${n.codigo || n.norma} — ${n.titulo}`
                    : n.codigo || n.norma;
                  return `<option value="${escapeHtml(n.id)}" ${
                    n.id === draft.id_norma ? 'selected' : ''
                  }>${escapeHtml(label)}</option>`;
                })
                .join('')}
            </select>
          </div>
        `
        : draft.tipo === 'sector_iaf'
        ? `
          <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
            <label for="compSelectSector" class="block text-xs font-bold text-slate-700">
              Sector Técnico IAF <span class="text-rose-600" aria-hidden="true">*</span>
            </label>
            <select
              id="compSelectSector"
              name="id_sector_iaf"
              required
              class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-900 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
            >
              <option value="" ${draft.id_sector_iaf === '' ? 'selected' : ''}>Seleccione un Sector IAF...</option>
              ${sortedSectores
                .map(
                  (s) =>
                    `<option value="${escapeHtml(s.id)}" ${
                      s.id === draft.id_sector_iaf ? 'selected' : ''
                    }>Sector ${s.sector} — ${escapeHtml(s.descripcion)}</option>`
                )
                .join('')}
            </select>
          </div>
        `
        : `
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
              <label for="compSelectSector" class="block text-xs font-bold text-slate-700">
                Sector Técnico IAF (Filtro Padre) <span class="text-rose-600" aria-hidden="true">*</span>
              </label>
              <select
                id="compSelectSector"
                name="id_sector_iaf"
                required
                class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-900 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
              >
                <option value="" ${draft.id_sector_iaf === '' ? 'selected' : ''}>Seleccione primero un Sector IAF...</option>
                ${sortedSectores
                  .map(
                    (s) =>
                      `<option value="${escapeHtml(s.id)}" ${
                        s.id === draft.id_sector_iaf ? 'selected' : ''
                      }>Sector ${s.sector} — ${escapeHtml(s.descripcion)}</option>`
                  )
                  .join('')}
              </select>
            </div>

            <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
              <label for="compSelectSubsector" class="block text-xs font-bold text-slate-700">
                Sub-Sector Técnico IAF <span class="text-rose-600" aria-hidden="true">*</span>
              </label>
              <select
                id="compSelectSubsector"
                name="id_subsector_iaf"
                required
                ${!draft.id_sector_iaf ? 'disabled' : ''}
                class="w-full rounded-lg border border-slate-300 ${
                  !draft.id_sector_iaf ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-white text-slate-900'
                } px-2.5 py-2 text-xs font-semibold focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
              >
                <option value="" ${draft.id_subsector_iaf === '' ? 'selected' : ''}>
                  ${
                    draft.id_sector_iaf
                      ? 'Seleccione un Sub-Sector IAF...'
                      : 'Seleccione primero un Sector IAF'
                  }
                </option>
                ${filteredSubsectores
                  .map(
                    (sub) =>
                      `<option value="${escapeHtml(sub.id)}" ${
                        sub.id === draft.id_subsector_iaf ? 'selected' : ''
                      }>${escapeHtml(sub.codigo)} · ${escapeHtml(sub.descripcion)}</option>`
                  )
                  .join('')}
              </select>
            </div>
          </div>
        `;

    const customRecordBodyHtml = `
      <form id="competenciaAuditorDetailForm" class="space-y-3" novalidate>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
            <label for="compSelectTipo" class="block text-xs font-bold text-slate-700">
              Tipo de Competencia Técnica <span class="text-rose-600" aria-hidden="true">*</span>
            </label>
            <select
              id="compSelectTipo"
              name="tipo"
              required
              class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-900 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
            >
              <option value="norma" ${draft.tipo === 'norma' ? 'selected' : ''}>📘 Norma ISO (norma_auditor)</option>
              <option value="sector_iaf" ${draft.tipo === 'sector_iaf' ? 'selected' : ''}>🏭 Sector IAF (sector_iaf_auditor)</option>
              <option value="subsector_iaf" ${draft.tipo === 'subsector_iaf' ? 'selected' : ''}>🧩 Sub-Sector IAF (subsector_iaf_auditor)</option>
            </select>
          </div>

          <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1">
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Tabla de Persistencia</span>
            <p class="text-xs text-slate-700 font-medium">
              Se registrará el vínculo en <span class="font-mono font-bold text-slate-900">${escapeHtml(tipoMeta.tableName)}</span> bajo políticas RLS aprobadas.
            </p>
          </div>
        </div>

        ${selectorBodyHtml}
      </form>
    `;

    return renderDetailPageTemplate({
      entityType: 'Competencia de Auditor',
      entitySymbol: '🛡️',
      title: 'Asignar Competencia Técnica',
      subtitle:
        'Vinculación persistente M:N en norma_auditor, sector_iaf_auditor o subsector_iaf_auditor.',
      backButton: {
        label: 'Volver',
        nav: 'certificacion',
        subview: 'auditors',
        action: 'back-to-competencia-parent',
      },
      isCreateMode: true,
      customTopActionsHtml,
      customParentZoneHtml,
      tableName: tipoMeta.tableName,
      recordId: 'competencia-new',
      feedbackHtml,
      attributes: [],
      customRecordBodyHtml,
      childTabs: [],
    });
  }

  // READ MODE
  const selectedComp = state.selectedComp;
  const auditor = selectedComp
    ? auditors.find((a) => a.id === selectedComp.id_auditor)
    : undefined;

  if (!selectedComp || !auditor) {
    return `
      <div class="bg-white border border-slate-200 rounded-2xl p-6 text-center space-y-3 shadow-xs">
        <div class="text-2xl" aria-hidden="true">🛡️</div>
        <h2 class="text-sm font-bold text-slate-900">Competencia no encontrada</h2>
        <p class="text-xs text-slate-600 max-w-md mx-auto">
          El vínculo de competencia técnica seleccionado no se encuentra activo en el catálogo.
        </p>
        <div>
          <button
            type="button"
            data-action="back-to-competencia-parent"
            class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
          >
            ← Volver
          </button>
        </div>
      </div>
    `;
  }

  const tipoMeta = getCompetenciaTipoDisplay(selectedComp.tipo);
  const parents: DetailParentChip[] = [
    {
      label: 'Auditor',
      value: formatAuditorSelectorLabel(auditor),
      symbol: '🪪',
      navAction: {
        nav: 'certificacion',
        subview: 'auditors',
        entityType: 'auditor',
        entityId: auditor.id,
        targetTab: 'competencias',
      },
    },
  ];

  let targetTitle = '';
  let targetCode = '';
  let targetDesc = '';
  let targetExtra = '';

  if (selectedComp.tipo === 'norma') {
    const links = getAuditorNormaLinks(auditor, normas);
    const matchedLink = links.find((l) => l.id_norma === selectedComp.targetId);
    const matchedNorma = normas.find((n) => n.id === selectedComp.targetId);
    targetCode = matchedNorma?.codigo || matchedNorma?.norma || matchedLink?.norma_codigo || 'Norma ISO';
    targetDesc = matchedNorma?.titulo || matchedLink?.norma_titulo || 'Estándar de Gestión Certificado';
    targetExtra = matchedNorma?.esquema || matchedLink?.esquema || 'ISO';
    targetTitle = targetCode;

    parents.push({
      label: 'Norma ISO',
      value: targetCode,
      symbol: '📘',
      navAction: {
        nav: 'extra',
        subview: 'standards',
        entityType: 'norma',
        entityId: selectedComp.targetId,
      },
    });
  } else if (selectedComp.tipo === 'sector_iaf') {
    const links = getAuditorSectorLinks(auditor, sectores);
    const matchedLink = links.find((l) => l.id_sector_iaf === selectedComp.targetId);
    const matchedSector = sectores.find((s) => s.id === selectedComp.targetId);
    const secNum = matchedSector?.sector ?? matchedLink?.sector_numero ?? 0;
    targetCode = secNum > 0 ? `Sector IAF ${secNum}` : 'Sector IAF';
    targetDesc = matchedSector?.descripcion || matchedLink?.sector_descripcion || 'Sector técnico IAF';
    targetTitle = targetCode;

    parents.push({
      label: 'Sector IAF',
      value: targetCode,
      symbol: '🏭',
      navAction: {
        nav: 'extra',
        subview: 'iaf',
        entityType: 'sector_iaf',
        entityId: selectedComp.targetId,
      },
    });
  } else {
    const links = getAuditorSubsectorLinks(auditor, subsectores);
    const matchedLink = links.find((l) => l.id_subsector_iaf === selectedComp.targetId);
    const matchedSub = subsectores.find((s) => s.id === selectedComp.targetId);
    const secId = matchedSub?.id_sector_iaf || matchedLink?.id_sector_iaf || '';
    const matchedSec = sectores.find((s) => s.id === secId);
    const secNum = matchedSec?.sector ?? matchedSub?.sector_numero ?? matchedLink?.sector_numero ?? 0;

    targetCode = matchedSub?.codigo || matchedLink?.subsector_codigo || 'Sub-Sector IAF';
    targetDesc = matchedSub?.descripcion || matchedLink?.subsector_descripcion || 'Sub-Sector técnico';
    targetExtra = matchedSub?.categoria_riesgo || matchedLink?.categoria_riesgo || 'MEDIO';
    targetTitle = `${targetCode} · ${targetDesc}`;

    if (secId) {
      parents.push({
        label: 'Sector IAF',
        value: secNum > 0 ? `Sector IAF ${secNum}` : 'Sector IAF',
        symbol: '🏭',
        navAction: {
          nav: 'extra',
          subview: 'iaf',
          entityType: 'sector_iaf',
          entityId: secId,
        },
      });
    }
    parents.push({
      label: 'Sub-Sector IAF',
      value: targetCode,
      symbol: '🧩',
      navAction: {
        nav: 'extra',
        subview: 'iaf',
        entityType: 'subsector_iaf',
        entityId: selectedComp.targetId,
      },
    });
  }

  const customTopActionsHtml = isStaff
    ? `
      <button
        type="button"
        id="unlinkCompetenciaBtn"
        data-action="unlink-competencia"
        data-auditor-id="${escapeHtml(auditor.id)}"
        data-comp-tipo="${escapeHtml(selectedComp.tipo)}"
        data-target-id="${escapeHtml(selectedComp.targetId)}"
        title="Desvincular competencia"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition-colors cursor-pointer shrink-0"
      >
        <span aria-hidden="true">🗑️</span>
        <span>Desvincular competencia</span>
      </button>
    `
    : '';

  const confirmBannerHtml =
    isStaff && state.confirmUnlink
      ? `
        <div role="alert" class="rounded-xl border border-rose-300 bg-rose-50 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="space-y-0.5">
            <p class="text-xs font-bold text-rose-900">
              ¿Confirmar desvinculación de competencia técnica?
            </p>
            <p class="text-[11px] text-rose-800">
              Se eliminará el vínculo de <span class="font-semibold">${escapeHtml(auditor.nombre)}</span> en <span class="font-mono font-semibold">${escapeHtml(tipoMeta.tableName)}</span>.
            </p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button
              type="button"
              id="cancelUnlinkCompetenciaBtn"
              data-action="cancel-unlink-competencia"
              class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              id="confirmUnlinkCompetenciaBtn"
              data-action="confirm-unlink-competencia"
              data-auditor-id="${escapeHtml(auditor.id)}"
              data-comp-tipo="${escapeHtml(selectedComp.tipo)}"
              data-target-id="${escapeHtml(selectedComp.targetId)}"
              class="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer shadow-2xs"
            >
              Confirmar desvinculación
            </button>
          </div>
        </div>
      `
      : '';

  const errorBannerHtml = state.errorMessage
    ? `
      <div role="alert" class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800 flex items-center gap-2">
        <span aria-hidden="true">⚠️</span>
        <span>${escapeHtml(state.errorMessage)}</span>
      </div>
    `
    : '';

  const customRecordBodyHtml = `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Categoría de Competencia</span>
        <p class="text-xs font-bold text-slate-900">${tipoMeta.symbol} ${escapeHtml(tipoMeta.label)}</p>
      </div>
      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Referencia Técnica</span>
        <p class="text-xs font-mono font-bold text-slate-900">${escapeHtml(targetCode)}</p>
      </div>
      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Tabla Relacional M:N</span>
        <p class="text-xs font-mono font-semibold text-slate-700">${escapeHtml(tipoMeta.tableName)}</p>
      </div>
      <div class="sm:col-span-2 lg:col-span-3 bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Descripción del Alcance Calificado</span>
        <p class="text-xs font-medium text-slate-800">
          ${escapeHtml(targetDesc)}${targetExtra ? ` (${escapeHtml(targetExtra)})` : ''}
        </p>
      </div>
    </div>
  `;

  return renderDetailPageTemplate({
    entityType: 'Competencia de Auditor',
    entitySymbol: tipoMeta.symbol,
    title: targetTitle,
    subtitle: `Cualificación técnica de ${auditor.nombre} registrada en ${tipoMeta.tableName}`,
    backButton: {
      label: 'Volver',
      nav: 'certificacion',
      subview: 'auditors',
      action: 'back-to-competencia-parent',
    },
    customTopActionsHtml,
    parents,
    tableName: tipoMeta.tableName,
    recordId: `${auditor.id}:${selectedComp.tipo}:${selectedComp.targetId}`,
    feedbackHtml: `${errorBannerHtml}${confirmBannerHtml}`,
    attributes: [],
    customRecordBodyHtml,
    childTabs: [],
  });
}
