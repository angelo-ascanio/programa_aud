import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import {
  SUBSECTOR_CODIGO_MAX_LENGTH,
  SUBSECTOR_DESCRIPCION_MAX_LENGTH,
  VALID_SUBSECTOR_RISK_CATEGORIES,
  createEmptySubsectorIafFormDraft,
  createSubsectorIafDraftFromEntity,
  formatRiskCategoryBadge,
  resolveSectorIafDescription,
  type SectorIafEntity,
  type SubsectorIafDetailMode,
  type SubsectorIafEntity,
  type SubsectorIafFormDraft,
} from '../lib/extraDomain';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import {
  getQualificationStatusVisual,
  type AuditorDetailEntity,
} from '../lib/competencyMatrix';
import type { ColumnDefinition } from '../lib/universalTemplate';
import { renderListViewTable } from './universalTemplate';
import {
  renderDetailFormTopActions,
  renderDetailPageTemplate,
  renderDetailParentSelectCard,
  type DetailParentChip,
} from './detailTemplate';
import { canArchiveRecord } from '../lib/archiveGovernance';

export type SubsectorIafChildTab = 'certificados' | 'auditores';

export interface SubsectorIafViewState {
  selectedSubsectorId: string | null;
  prefillSectorId?: string | null;
  activeChildTab?: SubsectorIafChildTab;
  isCreating?: boolean;
  isEditingAttributes?: boolean;
  formDraft?: SubsectorIafFormDraft;
  editErrorMessage?: string | null;
}

export interface SubsectorIafViewProps {
  profile: UserProfile;
  state: SubsectorIafViewState;
  subsectores: ReadonlyArray<SubsectorIafEntity>;
  sectores: ReadonlyArray<SectorIafEntity>;
  certificados?: ReadonlyArray<CertificadoDetailEntity>;
  auditores?: ReadonlyArray<AuditorDetailEntity>;
  tableColumnWidths?: Record<string, Record<string, number>>;
}

interface SubsectorAuditorRow {
  id: string;
  nombre: string;
  titulo_profesional: string;
  codigo_credencial: string;
  normas_acreditadas: string[];
  calificacion: string;
}

export function resolveSubsectorIafDetailMode(
  state: SubsectorIafViewState,
  isStaff: boolean,
  selectedItem?: SubsectorIafEntity
): SubsectorIafDetailMode {
  if (!isStaff) {
    return 'read';
  }
  if (state.isCreating && !state.selectedSubsectorId) {
    return 'add';
  }
  if (selectedItem && state.isEditingAttributes) {
    return 'edit';
  }
  return 'read';
}

export function renderSubsectorIafView(props: SubsectorIafViewProps): string {
  const {
    profile,
    state,
    subsectores,
    sectores,
    certificados = [],
    auditores = [],
    tableColumnWidths,
  } = props;

  const isStaff = isApprovedStaffProfile(profile);
  const activeSectores = sectores
    .filter((s) => !s.deleted_at)
    .slice()
    .sort((a, b) => a.sector - b.sector);
  const activeSubsectores = subsectores.filter((s) => !s.deleted_at);

  const selectedSubsector = state.selectedSubsectorId
    ? activeSubsectores.find((s) => s.id === state.selectedSubsectorId)
    : undefined;

  const mode = resolveSubsectorIafDetailMode(state, isStaff, selectedSubsector);
  const isCreateMode = mode === 'add';
  const isReadOnly = mode === 'read';

  const draft: SubsectorIafFormDraft =
    mode === 'add'
      ? state.formDraft ?? createEmptySubsectorIafFormDraft(state.prefillSectorId || '')
      : mode === 'edit'
      ? state.formDraft ??
        (selectedSubsector
          ? createSubsectorIafDraftFromEntity(selectedSubsector)
          : createEmptySubsectorIafFormDraft(state.prefillSectorId || ''))
      : selectedSubsector
      ? createSubsectorIafDraftFromEntity(selectedSubsector)
      : createEmptySubsectorIafFormDraft(state.prefillSectorId || '');

  const parentSector = selectedSubsector
    ? activeSectores.find(
        (s) =>
          s.id === selectedSubsector.id_sector_iaf ||
          s.sector === selectedSubsector.sector_numero
      )
    : activeSectores.find((s) => s.id === (draft.id_sector_iaf || state.prefillSectorId || ''));

  const resolvedSectorNum =
    parentSector?.sector ?? selectedSubsector?.sector_numero ?? 0;
  const resolvedSectorDesc =
    parentSector?.descripcion ||
    (resolvedSectorNum > 0
      ? resolveSectorIafDescription(resolvedSectorNum)
      : 'Sector Técnico IAF');

  const relatedCerts = selectedSubsector
    ? certificados.filter((c) => c.id_subsector_iaf === selectedSubsector.id)
    : [];

  const matchedAuditors: SubsectorAuditorRow[] = selectedSubsector
    ? resolveSubsectorAuditorRows(selectedSubsector, auditores)
    : [];

  const riskBadge = selectedSubsector
    ? formatRiskCategoryBadge(selectedSubsector.categoria_riesgo)
    : undefined;

  const customTopActionsHtml = isStaff
    ? renderDetailFormTopActions({
        mode,
        isStaff: true,
        formId: 'subsectorDetailForm',
        saveBtnId: 'saveSubsectorFormBtn',
        cancelBtnId: 'cancelEditSubsectorBtn',
        editBtnId: 'startEditSubsectorBtn',
        saveTitle: isCreateMode ? 'Crear sub-sector IAF' : 'Guardar cambios',
        cancelTitle: isCreateMode ? 'Cancelar creación' : 'Cancelar edición',
        editTitle: 'Editar sub-sector IAF',
        showHistoryBtn: !isCreateMode,
        showArchiveBtn: !isCreateMode && canArchiveRecord(profile),
        extraAuditAttrs: selectedSubsector
          ? `data-table-name="subsector_iaf" data-record-id="${escapeHtml(selectedSubsector.id)}" data-entity-name="${escapeHtml(`Sub-Sector ${selectedSubsector.codigo}`)}"`
          : '',
        extraArchiveAttrs: selectedSubsector
          ? `data-archive-table="subsector_iaf" data-archive-id="${escapeHtml(selectedSubsector.id)}" data-archive-entity-label="Sub-Sector Técnico IAF" data-archive-title="${escapeHtml(`Sub-Sector ${selectedSubsector.codigo}`)}" data-archive-subtitle="${escapeHtml(selectedSubsector.descripcion)}"`
          : '',
      })
    : undefined;

  const readParents: DetailParentChip[] = selectedSubsector
    ? [
        {
          label: 'Sector IAF Padre',
          value:
            resolvedSectorNum > 0
              ? `Sector ${resolvedSectorNum} · ${resolvedSectorDesc}`
              : resolvedSectorDesc,
          symbol: '🏭',
          navAction: {
            nav: 'extra',
            subview: 'iaf',
            entityType: 'sector_iaf',
            entityId: parentSector?.id || selectedSubsector.id_sector_iaf,
            sectorNumber: resolvedSectorNum > 0 ? resolvedSectorNum : undefined,
            targetTab: 'subsectores',
          },
        },
      ]
    : [];

  const customParentZoneHtml = !isReadOnly
    ? `
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        ${renderDetailParentSelectCard({
          mode,
          formId: 'subsectorDetailForm',
          selectId: 'subsectorSelectSector',
          name: 'id_sector_iaf',
          label: 'Sector IAF Padre',
          symbol: '🏭',
          selectedValue: draft.id_sector_iaf,
          placeholder: 'Seleccione Sector IAF padre...',
          required: true,
          options: activeSectores.map((sec) => ({
            value: sec.id,
            label: `Sector ${sec.sector} — ${sec.descripcion}`,
          })),
        })}
      </div>
    `
    : undefined;

  const feedbackHtml =
    !isReadOnly && state.editErrorMessage
      ? `
        <div role="alert" class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800 flex items-center gap-2">
          <span aria-hidden="true">⚠️</span>
          <span>${escapeHtml(state.editErrorMessage)}</span>
        </div>
      `
      : '';

  const customRecordBodyHtml =
    isReadOnly && selectedSubsector
      ? renderSubsectorReadOnlyBody(
          selectedSubsector,
          relatedCerts.length,
          matchedAuditors.length
        )
      : renderSubsectorFormBody(draft);

  const activeTab: SubsectorIafChildTab =
    state.activeChildTab === 'auditores' ? 'auditores' : 'certificados';

  return renderDetailPageTemplate({
    entityType: 'Sub-Sector Técnico IAF',
    entitySymbol: '🧩',
    title: isCreateMode
      ? 'Nuevo Sub-Sector IAF'
      : selectedSubsector
      ? `Sub-Sector ${selectedSubsector.codigo}`
      : 'Sub-Sector IAF',
    eyebrowCode:
      !isCreateMode && selectedSubsector && resolvedSectorNum > 0
        ? `IAF ${resolvedSectorNum} · ${selectedSubsector.codigo}`
        : undefined,
    subtitle: isCreateMode
      ? parentSector
        ? `Registro de sub-sector técnico dependiente del Sector IAF ${parentSector.sector} (${parentSector.descripcion}).`
        : 'Registro granular de actividad económica y nivel de riesgo ISO/IEC 17021-1.'
      : selectedSubsector?.descripcion,
    statusBadge:
      !isCreateMode && riskBadge
        ? {
            label: riskBadge.label,
            badgeClass: riskBadge.badgeClass,
            symbol: riskBadge.symbol,
          }
        : undefined,
    backButton: {
      label: 'Volver al Sector IAF',
      nav: 'extra',
      subview: 'iaf',
      action: 'back-to-subsector-parent',
    },
    customTopActionsHtml,
    isCreateMode,
    parents: isReadOnly ? readParents : [],
    customParentZoneHtml,
    tableName: 'subsector_iaf',
    recordId: selectedSubsector?.id || '',
    feedbackHtml,
    attributes: [],
    customRecordBodyHtml,
    childTabs:
      !isCreateMode && selectedSubsector
        ? [
            {
              id: 'certificados',
              label: 'Certificados Vinculados',
              symbol: '📜',
              count: relatedCerts.length,
            },
            {
              id: 'auditores',
              label: 'Auditores Especialistas',
              symbol: '👥',
              count: matchedAuditors.length,
            },
          ]
        : [],
    activeChildTabId: activeTab,
    childTabAttrName: 'data-subsector-tab',
    renderChildTabContent:
      !isCreateMode && selectedSubsector
        ? (tabId) =>
            tabId === 'auditores'
              ? renderSubsectorAuditoresTab(
                  selectedSubsector,
                  matchedAuditors,
                  tableColumnWidths
                )
              : renderSubsectorCertificadosTab(
                  selectedSubsector,
                  relatedCerts,
                  tableColumnWidths
                )
        : undefined,
  });
}

function resolveSubsectorAuditorRows(
  subsector: SubsectorIafEntity,
  auditores: ReadonlyArray<AuditorDetailEntity>
): SubsectorAuditorRow[] {
  const cleanCode = subsector.codigo.trim().toLowerCase();
  const matched = auditores.filter((aud) =>
    aud.competencias.some(
      (comp) =>
        comp.id_subsector_iaf === subsector.id ||
        (cleanCode &&
          (comp.subsector_iaf_codigo || '').trim().toLowerCase() === cleanCode)
    )
  );

  if (matched.length > 0) {
    return matched.map((aud) => ({
      id: aud.id,
      nombre: aud.nombre,
      titulo_profesional: aud.titulo_profesional,
      codigo_credencial: aud.codigo_credencial,
      normas_acreditadas: aud.normas_acreditadas,
      calificacion: aud.calificacion,
    }));
  }

  return (subsector.auditores_nombres || []).map((name) => ({
    id: '',
    nombre: name,
    titulo_profesional: '',
    codigo_credencial: '—',
    normas_acreditadas: ['Según matriz de competencia'],
    calificacion: 'Calificado',
  }));
}

function renderSubsectorReadOnlyBody(
  subsector: SubsectorIafEntity,
  certCount: number,
  auditorCount: number
): string {
  const riskMeta = formatRiskCategoryBadge(subsector.categoria_riesgo);

  return `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Código de Sub-Sector
        </div>
        <div class="text-xs font-mono font-bold text-indigo-700">
          ${escapeHtml(subsector.codigo)}
        </div>
      </div>

      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Categoría de Riesgo ISO
        </div>
        <div>
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${riskMeta.badgeClass}">
            <span aria-hidden="true">${riskMeta.symbol}</span>
            <span>${escapeHtml(riskMeta.label)}</span>
          </span>
        </div>
      </div>

      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Certificados Vinculados
        </div>
        <div class="text-xs font-mono font-bold text-slate-900 tabular-nums">
          ${certCount} ${certCount === 1 ? 'certificado activo' : 'certificados activos'}
        </div>
      </div>

      <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Auditores Especialistas
        </div>
        <div class="text-xs font-mono font-bold text-slate-900 tabular-nums">
          ${auditorCount} ${auditorCount === 1 ? 'evaluador calificado' : 'evaluadores calificados'}
        </div>
      </div>

      <div class="col-span-full bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Descripción Técnica Detallada
        </div>
        <div class="text-xs font-semibold text-slate-900 leading-relaxed">
          ${escapeHtml(subsector.descripcion)}
        </div>
      </div>
    </div>
  `;
}

function renderSubsectorFormBody(draft: SubsectorIafFormDraft): string {
  return `
    <form id="subsectorDetailForm" novalidate class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 sm:p-3.5 space-y-3">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div class="space-y-1">
          <label for="subsectorCodigoInput" class="block text-xs font-bold text-slate-700">
            Código del Sub-Sector <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <input
            id="subsectorCodigoInput"
            name="codigo"
            type="text"
            required
            maxlength="${SUBSECTOR_CODIGO_MAX_LENGTH}"
            value="${escapeHtml(draft.codigo)}"
            placeholder="Ej. 17.3"
            class="w-full text-xs font-mono font-bold px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
          <p class="text-[11px] text-slate-500">
            Máximo ${SUBSECTOR_CODIGO_MAX_LENGTH} caracteres (ej. 17.1, 28.2).
          </p>
        </div>

        <div class="space-y-1">
          <label for="subsectorRiesgoSelect" class="block text-xs font-bold text-slate-700">
            Categoría de Riesgo ISO <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <select
            id="subsectorRiesgoSelect"
            name="categoria_riesgo"
            required
            class="w-full text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            ${VALID_SUBSECTOR_RISK_CATEGORIES.map((risk) => {
              const label =
                risk === 'ALTO'
                  ? 'ALTO — Complejidad y riesgo crítico'
                  : risk === 'BAJO'
                  ? 'BAJO — Riesgo técnico estándar'
                  : 'MEDIO — Riesgo operacional moderado';
              return `<option value="${risk}" ${draft.categoria_riesgo === risk ? 'selected' : ''}>${label}</option>`;
            }).join('')}
          </select>
        </div>
      </div>

      <div class="space-y-1">
        <label for="subsectorDescripcionInput" class="block text-xs font-bold text-slate-700">
          Descripción Técnica Detallada <span class="text-rose-600" aria-hidden="true">*</span>
        </label>
        <textarea
          id="subsectorDescripcionInput"
          name="descripcion"
          required
          maxlength="${SUBSECTOR_DESCRIPCION_MAX_LENGTH}"
          rows="3"
          placeholder="Describa las actividades industriales, procesos productivos o servicios cubiertos por el sub-sector..."
          class="w-full text-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
        >${escapeHtml(draft.descripcion)}</textarea>
      </div>
    </form>
  `;
}

function renderSubsectorCertificadosTab(
  subsector: SubsectorIafEntity,
  certificados: ReadonlyArray<CertificadoDetailEntity>,
  tableColumnWidths?: Record<string, Record<string, number>>
): string {
  const columns: ColumnDefinition<CertificadoDetailEntity>[] = [
    {
      id: 'numero_certificado',
      header: 'N° Certificado',
      defaultWidthPct: 20,
      minWidthPx: 140,
      renderCell: (c) => `
        <span class="font-mono font-bold text-indigo-700 whitespace-nowrap">
          📜 ${escapeHtml(c.numero_certificado)}
        </span>
      `,
    },
    {
      id: 'organizacion',
      header: 'Organización',
      defaultWidthPct: 34,
      minWidthPx: 180,
      renderCell: (c) => `
        <span class="block font-semibold text-slate-800 truncate" title="${escapeHtml(c.organizacion_nombre)}">
          🏢 ${escapeHtml(c.organizacion_nombre)}
        </span>
      `,
    },
    {
      id: 'norma',
      header: 'Norma',
      defaultWidthPct: 18,
      minWidthPx: 120,
      renderCell: (c) => `
        <span class="font-medium text-slate-700 whitespace-nowrap">
          ${escapeHtml(c.norma_codigo)}
        </span>
      `,
    },
    {
      id: 'vigencia',
      header: 'Vigencia',
      defaultWidthPct: 16,
      minWidthPx: 150,
      renderCell: (c) => `
        <span class="font-mono text-[11px] text-slate-600 whitespace-nowrap tabular-nums">
          ${escapeHtml(c.fecha_emision)} → ${escapeHtml(c.fecha_vencimiento)}
        </span>
      `,
    },
    {
      id: 'estatus',
      header: 'Estatus',
      align: 'center',
      defaultWidthPct: 12,
      minWidthPx: 100,
      renderCell: (c) => `
        <span class="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-800 border border-slate-200 whitespace-nowrap">
          ${escapeHtml(c.estatus)}
        </span>
      `,
    },
  ];

  return `
    <div class="space-y-3">
      <div>
        <h3 class="text-sm font-bold text-slate-900">Certificados Emitidos en Sub-Sector ${escapeHtml(subsector.codigo)}</h3>
        <p class="text-xs text-slate-500">
          Resumen de impacto: certificados activos clasificados directamente bajo este sub-sector técnico IAF.
        </p>
      </div>

      ${renderListViewTable({
        tableId: 'subsector-tab-certificados',
        items: [...certificados],
        columns,
        columnWidths: tableColumnWidths?.['subsector-tab-certificados'],
        getRowAttrs: (c) =>
          `data-action="select-cert" data-cert-id="${escapeHtml(c.id)}" title="Abrir certificado ${escapeHtml(c.numero_certificado)}"`,
        emptyStateTitle: 'Sin certificados vinculados',
        emptyStateMessage: `No hay certificados activos asociados directamente al Sub-Sector ${escapeHtml(subsector.codigo)}.`,
      })}
    </div>
  `;
}

function renderSubsectorAuditoresTab(
  subsector: SubsectorIafEntity,
  rows: ReadonlyArray<SubsectorAuditorRow>,
  tableColumnWidths?: Record<string, Record<string, number>>
): string {
  const columns: ColumnDefinition<SubsectorAuditorRow>[] = [
    {
      id: 'auditor',
      header: 'Auditor Especialista',
      defaultWidthPct: 30,
      minWidthPx: 180,
      renderCell: (aud) => `
        <div class="min-w-0">
          <div class="font-bold text-indigo-700 truncate">🪪 ${escapeHtml(aud.nombre)}</div>
          ${
            aud.titulo_profesional
              ? `<div class="text-[11px] text-slate-500 truncate">${escapeHtml(aud.titulo_profesional)}</div>`
              : ''
          }
        </div>
      `,
    },
    {
      id: 'credencial',
      header: 'Credencial',
      defaultWidthPct: 18,
      minWidthPx: 120,
      renderCell: (aud) => `
        <span class="font-mono font-semibold text-slate-700 whitespace-nowrap">
          ${escapeHtml(aud.codigo_credencial)}
        </span>
      `,
    },
    {
      id: 'normas',
      header: 'Normas Calificadas',
      defaultWidthPct: 34,
      minWidthPx: 160,
      renderCell: (aud) => `
        <div class="flex flex-wrap gap-1">
          ${aud.normas_acreditadas
            .map(
              (n) =>
                `<span class="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-semibold">${escapeHtml(n)}</span>`
            )
            .join('')}
        </div>
      `,
    },
    {
      id: 'calificacion',
      header: 'Calificación',
      align: 'center',
      defaultWidthPct: 18,
      minWidthPx: 120,
      renderCell: (aud) => {
        const qualVisual = getQualificationStatusVisual(aud.calificacion);
        return `
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap ${qualVisual.badgeClass}">
            <span class="w-1.5 h-1.5 rounded-full ${qualVisual.dotClass}"></span>
            <span>${escapeHtml(qualVisual.label)}</span>
          </span>
        `;
      },
    },
  ];

  return `
    <div class="space-y-3">
      <div>
        <h3 class="text-sm font-bold text-slate-900">Auditores Especialistas en Sub-Sector ${escapeHtml(subsector.codigo)}</h3>
        <p class="text-xs text-slate-500">
          Evaluadores con competencia técnica aprobada para este sub-sector conforme a la matriz ISO/IEC 17021-1.
        </p>
      </div>

      ${renderListViewTable({
        tableId: 'subsector-tab-auditores',
        items: [...rows],
        columns,
        columnWidths: tableColumnWidths?.['subsector-tab-auditores'],
        getRowAttrs: (aud) =>
          aud.id
            ? `data-action="select-auditor" data-auditor-id="${escapeHtml(aud.id)}" title="Abrir auditor ${escapeHtml(aud.nombre)}"`
            : '',
        emptyStateTitle: 'Sin auditores asignados',
        emptyStateMessage: `No hay auditores con competencia registrada en el Sub-Sector ${escapeHtml(subsector.codigo)}.`,
      })}
    </div>
  `;
}
