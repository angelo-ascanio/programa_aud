import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/accessControl';
import { canArchiveRecord, renderArchivarButtonHtml } from '../lib/archiveGovernance';
import {
  CANONICAL_TIPO_FECHA_VALUES,
  getFechaTemporalStatus,
  getFechaTipoVisual,
} from '../lib/multisiteSampling';
import {
  getFechaRelativeVigenciaNote,
  type FechaDetailEntity,
} from '../lib/certificadoSubEntities';
import { renderDetailPageTemplate, type DetailParentChip } from './detailTemplate';

export interface FechaViewState {
  selectedFechaId: string | null;
  isEditingAttributes: boolean;
  editFormData?: {
    tipo_fecha?: string;
    fecha?: string;
  };
  editErrorMessage?: string | null;
  saveSuccessMessage?: string | null;
}

export interface FechaViewProps {
  profile: UserProfile;
  state: FechaViewState;
  fecha: FechaDetailEntity;
}

export function renderFechaView(props: FechaViewProps): string {
  const { profile, state, fecha } = props;

  const isStaff = isApprovedStaffProfile(profile);
  const isEditing = Boolean(state.isEditingAttributes) && isStaff;

  const tipoVisual = getFechaTipoVisual(fecha.tipo_fecha);
  const temporal = getFechaTemporalStatus(fecha.fecha, fecha.tipo_fecha);
  const relativeNote = getFechaRelativeVigenciaNote(fecha.fecha, fecha.tipo_fecha);

  const parents: DetailParentChip[] = [
    {
      label: 'Organización',
      value: `${fecha.organizacion_nombre} (${fecha.organizacion_rif})`,
      symbol: '🏢',
      navAction: {
        nav: 'certificacion',
        subview: 'organizations',
        entityType: 'org',
        entityId: fecha.id_organizacion,
      },
    },
    {
      label: 'Certificado',
      value: `${fecha.numero_certificado} · ${fecha.norma_codigo}`,
      symbol: '📜',
      navAction: {
        nav: 'certificacion',
        subview: 'certificates',
        entityType: 'cert',
        entityId: fecha.id_certificado,
        targetTab: 'fechas',
      },
    },
  ];

  const trailingActionButtonsHtml =
    isStaff && !isEditing && canArchiveRecord(profile)
      ? renderArchivarButtonHtml({
          tableName: 'fecha_certificado',
          recordId: fecha.id,
          entityLabel: 'Fecha de Certificado',
          recordTitle: `${fecha.tipo_fecha} · ${fecha.fecha}`,
          recordSubtitle: `${fecha.numero_certificado} · ${fecha.organizacion_nombre}`,
          iconOnly: true,
        })
      : '';

  const feedbackHtml = `
    ${
      state.saveSuccessMessage
        ? `
          <div class="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium rounded-lg flex items-center gap-2">
            <span aria-hidden="true">✓</span>
            <span>${escapeHtml(state.saveSuccessMessage)}</span>
          </div>
        `
        : ''
    }
    ${
      state.editErrorMessage
        ? `
          <div role="alert" class="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium rounded-lg flex items-center gap-2">
            <span aria-hidden="true">✕</span>
            <span>${escapeHtml(state.editErrorMessage)}</span>
          </div>
        `
        : ''
    }
  `;

  const customRecordBodyHtml = isEditing
    ? renderEditFechaForm(fecha, state.editFormData)
    : `
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div class="p-3 bg-slate-50/70 border border-slate-200/90 rounded-xl space-y-1">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tipo de Fecha</div>
          <div>
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${tipoVisual.badgeClass}">
              ${escapeHtml(tipoVisual.label)}
            </span>
          </div>
        </div>

        <div class="p-3 bg-slate-50/70 border border-slate-200/90 rounded-xl space-y-1">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Fecha Registrada</div>
          <div class="text-sm font-mono font-bold text-slate-900 tabular-nums">${escapeHtml(fecha.fecha)}</div>
        </div>

        <div class="p-3 bg-slate-50/70 border border-slate-200/90 rounded-xl space-y-1">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Vigencia Relativa</div>
          <div class="flex flex-wrap items-center gap-2">
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${temporal.badgeClass}">
              ${escapeHtml(temporal.label)}
            </span>
          </div>
          <p class="text-[11px] text-slate-600">${escapeHtml(relativeNote)}</p>
        </div>
      </div>
    `;

  return renderDetailPageTemplate({
    entityType: 'Fecha de Certificado',
    entitySymbol: '📅',
    title: `${fecha.tipo_fecha} · ${fecha.fecha}`,
    statusBadge: {
      label: temporal.label,
      badgeClass: temporal.badgeClass,
    },
    backButton: {
      label: 'Volver',
      nav: 'certificacion',
      subview: 'certificates',
      action: 'back-from-fecha',
    },
    editActionButton: {
      id: 'startEditFechaBtn',
      visible: isStaff,
      isEditing,
      cancelId: 'cancelEditFechaBtn',
    },
    trailingActionButtonsHtml,
    parents,
    tableName: 'fecha_certificado',
    recordId: fecha.id,
    feedbackHtml,
    attributes: [],
    customRecordBodyHtml,
    childTabs: [],
  });
}

function renderEditFechaForm(
  fecha: FechaDetailEntity,
  formData?: FechaViewState['editFormData']
): string {
  const selectedTipo = formData?.tipo_fecha ?? fecha.tipo_fecha;
  const dateVal = formData?.fecha ?? fecha.fecha;

  return `
    <form id="editFechaForm" data-fecha-id="${escapeHtml(fecha.id)}" class="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="space-y-1">
          <label for="editFechaTipoSelect" class="block text-xs font-bold text-slate-700">Tipo de Evento *</label>
          <select
            id="editFechaTipoSelect"
            name="tipo_fecha"
            required
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            ${CANONICAL_TIPO_FECHA_VALUES.map(
              (tipo) => `
                <option value="${escapeHtml(tipo)}" ${selectedTipo === tipo ? 'selected' : ''}>
                  ${escapeHtml(tipo)}
                </option>
              `
            ).join('')}
          </select>
        </div>

        <div class="space-y-1">
          <label for="editFechaDateInput" class="block text-xs font-bold text-slate-700">Fecha (YYYY-MM-DD) *</label>
          <input
            id="editFechaDateInput"
            name="fecha"
            type="date"
            required
            value="${escapeHtml(dateVal)}"
            class="w-full text-xs font-mono p-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
      </div>

      <div class="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
        <button
          type="button"
          id="cancelEditFechaBtnSecondary"
          class="px-4 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
        >
          Cancelar
        </button>
        <button
          type="submit"
          class="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-2xs transition-colors cursor-pointer"
        >
          💾 Guardar Fecha
        </button>
      </div>
    </form>
  `;
}
