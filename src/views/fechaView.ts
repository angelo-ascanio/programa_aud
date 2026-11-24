import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/accessControl';
import { canArchiveRecord } from '../lib/archiveGovernance';
import {
  CANONICAL_TIPO_FECHA_VALUES,
  getFechaTemporalStatus,
  getFechaTipoVisual,
  type CertificadoDetailEntity,
} from '../lib/multisiteSampling';
import {
  createEmptyFechaFormDraft,
  createFechaFormDraftFromEntity,
  getFechaRelativeVigenciaNote,
  resolveFechaDetailMode,
  type FechaDetailEntity,
  type FechaFormDraft,
} from '../lib/certificadoSubEntities';
import {
  renderDetailFormTopActions,
  renderDetailPageTemplate,
  renderDetailParentSelectCard,
  type DetailParentChip,
} from './detailTemplate';

export interface FechaViewState {
  selectedFechaId: string | null;
  originatingCertId?: string | null;
  isCreating?: boolean;
  isEditingAttributes: boolean;
  formDraft?: FechaFormDraft;
  editFormData?: {
    id_certificado?: string;
    tipo_fecha?: string;
    fecha?: string;
  };
  editErrorMessage?: string | null;
}

export interface FechaViewProps {
  profile: UserProfile;
  state: FechaViewState;
  fecha: FechaDetailEntity | null;
  activeCertVersionId?: string | null;
  isHistoricalCertVersion?: boolean;
  certificates?: ReadonlyArray<CertificadoDetailEntity>;
}

export function renderFechaView(props: FechaViewProps): string {
  const {
    profile,
    state,
    fecha,
    isHistoricalCertVersion = false,
    certificates = [],
  } = props;

  const isHistoricalLock = Boolean(isHistoricalCertVersion);
  const isStaff = isApprovedStaffProfile(profile) && !isHistoricalLock;
  const mode = resolveFechaDetailMode(state, isStaff, fecha);
  const isCreateMode = mode === 'add';

  const draft: FechaFormDraft =
    mode === 'add'
      ? state.formDraft ?? createEmptyFechaFormDraft(state.originatingCertId)
      : mode === 'edit'
      ? state.formDraft ??
        (state.editFormData && fecha
          ? {
              id_certificado: state.editFormData.id_certificado ?? fecha.id_certificado,
              tipo_fecha: state.editFormData.tipo_fecha ?? fecha.tipo_fecha,
              fecha: state.editFormData.fecha ?? fecha.fecha,
            }
          : fecha
          ? createFechaFormDraftFromEntity(fecha)
          : createEmptyFechaFormDraft(state.originatingCertId))
      : fecha
      ? createFechaFormDraftFromEntity(fecha)
      : createEmptyFechaFormDraft(state.originatingCertId);

  const selectedCert =
    certificates.find((c) => c.id === draft.id_certificado) ||
    (fecha ? certificates.find((c) => c.id === fecha.id_certificado) : undefined) ||
    null;

  const activeTipo = isCreateMode ? draft.tipo_fecha : fecha?.tipo_fecha || draft.tipo_fecha;
  const activeFecha = isCreateMode ? draft.fecha : fecha?.fecha || draft.fecha;
  const tipoVisual = getFechaTipoVisual(activeTipo);
  const temporal = activeFecha
    ? getFechaTemporalStatus(activeFecha, activeTipo)
    : { label: 'Nuevo Registro', badgeClass: 'bg-sky-50 text-sky-800 border-sky-200' };
  const relativeNote = fecha ? getFechaRelativeVigenciaNote(fecha.fecha, fecha.tipo_fecha) : '';

  const parents: DetailParentChip[] =
    mode === 'read' && fecha
      ? [
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
        ]
      : [];

  const certOptions =
    certificates.length > 0
      ? certificates.map((c) => ({
          value: c.id,
          label: `${c.numero_certificado} — ${c.organizacion_nombre} (${c.norma_codigo})`,
        }))
      : fecha
      ? [
          {
            value: fecha.id_certificado,
            label: `${fecha.numero_certificado} — ${fecha.organizacion_nombre} (${fecha.norma_codigo})`,
          },
        ]
      : [];

  const customParentZoneHtml =
    mode === 'add' || mode === 'edit'
      ? `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
          ${renderDetailParentSelectCard({
            mode,
            formId: 'fechaDetailForm',
            selectId: 'fechaSelectCertificado',
            name: 'id_certificado',
            label: 'Certificado de Conformidad',
            symbol: '📜',
            selectedValue: draft.id_certificado,
            options: certOptions,
            placeholder: 'Seleccione un certificado...',
          })}
          <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-1 min-w-0">
            <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <span aria-hidden="true">🏢</span>
              <span>Organización</span>
            </div>
            <div class="text-xs font-bold ${selectedCert || fecha ? 'text-slate-800' : 'text-slate-400 italic'} truncate">
              ${
                selectedCert
                  ? `${escapeHtml(selectedCert.organizacion_nombre)} (${escapeHtml(selectedCert.organizacion_rif)})`
                  : fecha
                  ? `${escapeHtml(fecha.organizacion_nombre)} (${escapeHtml(fecha.organizacion_rif)})`
                  : 'Se resuelve al seleccionar un certificado'
              }
            </div>
          </div>
        </div>
      `
      : undefined;

  const customTopActionsHtml = isStaff
    ? renderDetailFormTopActions({
        mode,
        isStaff: true,
        formId: 'fechaDetailForm',
        saveBtnId: 'saveFechaFormBtn',
        cancelBtnId: 'cancelEditFechaBtn',
        editBtnId: 'startEditFechaBtn',
        saveTitle: isCreateMode ? 'Crear fecha de certificado' : 'Guardar cambios',
        cancelTitle: isCreateMode ? 'Cancelar creación' : 'Cancelar edición',
        editTitle: 'Editar fecha',
        showHistoryBtn: !isCreateMode,
        showArchiveBtn: !isCreateMode && Boolean(fecha) && canArchiveRecord(profile),
        extraAuditAttrs: fecha
          ? `data-table-name="fecha_certificado" data-record-id="${escapeHtml(fecha.id)}" data-entity-name="${escapeHtml(`${fecha.tipo_fecha} · ${fecha.fecha}`)}"`
          : '',
        extraArchiveAttrs: fecha
          ? `data-archive-table="fecha_certificado" data-archive-id="${escapeHtml(fecha.id)}" data-archive-entity-label="Fecha de Certificado" data-archive-title="${escapeHtml(`${fecha.tipo_fecha} · ${fecha.fecha}`)}" data-archive-subtitle="${escapeHtml(`${fecha.numero_certificado} · ${fecha.organizacion_nombre}`)}"`
          : '',
      })
    : '';

  const historicalBannerHtml =
    isHistoricalLock && !isCreateMode && fecha
      ? `
        <div role="status" class="p-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium rounded-lg flex items-center gap-2">
          <span aria-hidden="true">🔒</span>
          <span><strong>Fecha histórica en solo lectura:</strong> corresponde a una versión anterior del certificado y se conserva como registro cronológico inmutable.</span>
        </div>
      `
      : '';

  const feedbackHtml = `
    ${historicalBannerHtml}
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

  const customRecordBodyHtml =
    mode === 'add' || mode === 'edit'
      ? renderFechaDetailForm(draft, fecha)
      : fecha
      ? `
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
      `
      : '';

  const title = isCreateMode
    ? 'Nueva Fecha de Certificado'
    : fecha
    ? `${fecha.tipo_fecha} · ${fecha.fecha}`
    : 'Fecha de Certificado';

  return renderDetailPageTemplate({
    entityType: 'Fecha de Certificado',
    entitySymbol: '📅',
    title,
    subtitle: isCreateMode
      ? selectedCert
        ? `${selectedCert.numero_certificado} · ${selectedCert.organizacion_nombre}`
        : 'Registro cronológico del ciclo de certificación'
      : undefined,
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
    isCreateMode,
    customTopActionsHtml,
    parents,
    customParentZoneHtml,
    tableName: 'fecha_certificado',
    recordId: fecha?.id || 'new',
    feedbackHtml,
    attributes: [],
    customRecordBodyHtml,
    childTabs: [],
  });
}

function renderFechaDetailForm(
  draft: FechaFormDraft,
  fecha: FechaDetailEntity | null
): string {
  return `
    <form
      id="fechaDetailForm"
      ${fecha ? `data-fecha-id="${escapeHtml(fecha.id)}"` : ''}
      class="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4"
    >
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="space-y-1">
          <label for="editFechaTipoSelect" class="block text-xs font-bold text-slate-700">
            Tipo de Evento <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <select
            id="editFechaTipoSelect"
            name="tipo_fecha"
            required
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          >
            ${CANONICAL_TIPO_FECHA_VALUES.map(
              (tipo) => `
                <option value="${escapeHtml(tipo)}" ${draft.tipo_fecha === tipo ? 'selected' : ''}>
                  ${escapeHtml(tipo)}
                </option>
              `
            ).join('')}
          </select>
        </div>

        <div class="space-y-1">
          <label for="editFechaDateInput" class="block text-xs font-bold text-slate-700">
            Fecha (YYYY-MM-DD) <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <input
            id="editFechaDateInput"
            name="fecha"
            type="date"
            required
            value="${escapeHtml(draft.fecha)}"
            class="w-full text-xs font-mono p-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>
      </div>
    </form>
  `;
}
