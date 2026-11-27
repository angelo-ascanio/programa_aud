import { escapeHtml } from '../lib/html';
import type { UserProfile } from '../lib/healthCheck';
import { isApprovedStaffProfile } from '../lib/rbac';
import {
  AUDITOR_CEDULA_MAX_LENGTH,
  AUDITOR_EMAIL_MAX_LENGTH,
  AUDITOR_NOMBRE_MAX_LENGTH,
  AUDITOR_PROFESION_MAX_LENGTH,
  AUDITOR_SIGLAS_MAX_LENGTH,
  AUDITOR_TELEFONO_MAX_LENGTH,
  AUDITOR_TIPO_EMAIL_OPTIONS,
  AUDITOR_TIPO_TELEFONO_OPTIONS,
  AUDITOR_YEAR_MAX,
  AUDITOR_YEAR_MIN,
  buildAuditorSearchableText,
  classifyAuditorObservacionSector,
  createAuditorDraftFromEntity,
  createEmptyAuditorEmailDraft,
  createEmptyAuditorFormDraft,
  createEmptyAuditorTelefonoDraft,
  createEmptyEvaluacionInSituDraft,
  evaluateAuditorInSituStatus,
  extractAuditorComplementarySchemes,
  formatAuditorContactSummary,
  formatShortIsoStandardLabel,
  getAuditorInSituStatusVisual,
  getAuditorNormaLinks,
  getAuditorSectorLinks,
  getAuditorSubsectorLinks,
  normalizeAuditorProfessionLabel,
  resolveAuditorInSituFacetBucket,
  sortEvaluacionesInSituChronological,
  summarizeAuditorSectorCoverage,
  type AuditorChildTab,
  type AuditorDetailEntity,
  type AuditorDetailMode,
  type AuditorEmailFormDraft,
  type AuditorFormDraft,
  type AuditoriaRealizadaEntity,
  type AuditorNormaLink,
  type AuditorSectorLink,
  type AuditorSubsectorLink,
  type AuditorTelefonoFormDraft,
  type AuditorViewState,
  type EvaluacionInSituAuditorEntity,
  type EvaluacionInSituFormDraft,
} from '../lib/competencyMatrix';
import type { NormaEntity, SectorIafEntity, SubsectorIafEntity } from '../lib/extraDomain';
import {
  computeReactiveFacetCounts,
  filterRecordsWithFacets,
  sortItems,
  type ColumnDefinition,
  type MultiViewFacetCategory,
  type MultiViewSelectionMap,
} from '../lib/universalTemplate';
import { renderListViewTable, renderUniversalTemplate } from './universalTemplate';
import {
  renderDetailFormTopActions,
  renderDetailPageTemplate,
  renderMultiViewAddButton,
} from './detailTemplate';
import {
  canArchiveRecord,
  extractUniversalArchiveProps,
  type ArchiveMultiViewConfig,
} from '../lib/archiveGovernance';
import {
  formatAuditCodename,
  getAuditCodenameTooltip,
  resolveShortOrganizacionName,
} from '../lib/codenameDomain';

export type { AuditorViewState, AuditorChildTab };

export interface AuditorViewProps {
  profile: UserProfile;
  state: AuditorViewState;
  auditors: AuditorDetailEntity[];
  normas?: ReadonlyArray<NormaEntity>;
  sectores?: ReadonlyArray<SectorIafEntity>;
  subsectores?: ReadonlyArray<SubsectorIafEntity>;
  loading?: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  columnWidths?: Record<string, number>;
  tableColumnWidths?: Record<string, Record<string, number>>;
  authUserEmail?: string | null;
}

export function resolveAuditorDetailMode(
  state: AuditorViewState,
  isStaff: boolean,
  selectedAuditor?: AuditorDetailEntity
): AuditorDetailMode {
  if (!isStaff) {
    return 'read';
  }
  if (state.isCreating && !state.selectedAuditorId) {
    return 'add';
  }
  if (selectedAuditor && state.isEditingAttributes) {
    return 'edit';
  }
  return 'read';
}

export function renderAuditorView(props: AuditorViewProps): string {
  const {
    profile,
    state,
    auditors,
    normas = [],
    sectores = [],
    subsectores = [],
    loading = false,
    archiveConfig,
    columnWidths,
    tableColumnWidths,
    authUserEmail,
  } = props;

  const isStaff = isApprovedStaffProfile(profile);

  if (state.selectedAuditorId) {
    const selectedAuditor = auditors.find((a) => a.id === state.selectedAuditorId);
    if (selectedAuditor) {
      return renderAuditorDetailPage({
        profile,
        state,
        auditor: selectedAuditor,
        normas,
        sectores,
        subsectores,
        isStaff,
        tableColumnWidths,
        authUserEmail,
      });
    }
  }

  if (!state.selectedAuditorId && state.isCreating && isStaff) {
    return renderAuditorDetailPage({
      profile,
      state,
      normas,
      sectores,
      subsectores,
      isStaff,
      tableColumnWidths,
    });
  }

  return renderAuditorDirectory({
    profile,
    state,
    allAuditors: auditors,
    normas,
    sectores,
    subsectores,
    isStaff,
    loading,
    archiveConfig,
    columnWidths,
  });
}

/**
 * Renders the Universal Multi View Clean List & Grid Directory for Auditores (Step 3.1)
 */
function renderAuditorDirectory(props: {
  profile: UserProfile;
  state: AuditorViewState;
  allAuditors: AuditorDetailEntity[];
  normas: ReadonlyArray<NormaEntity>;
  sectores: ReadonlyArray<SectorIafEntity>;
  subsectores: ReadonlyArray<SubsectorIafEntity>;
  isStaff: boolean;
  loading: boolean;
  archiveConfig?: ArchiveMultiViewConfig;
  columnWidths?: Record<string, number>;
}): string {
  const {
    state,
    allAuditors,
    normas,
    sectores,
    subsectores,
    isStaff,
    loading,
    archiveConfig,
    columnWidths,
  } = props;

  const getNormaLabels = (aud: AuditorDetailEntity): string[] => {
    const links = getAuditorNormaLinks(aud, normas);
    if (links.length > 0) {
      return links.map((l) => l.norma_codigo);
    }
    return aud.normas_acreditadas;
  };

  const uniqueNormas = Array.from(
    new Set(allAuditors.flatMap((a) => getNormaLabels(a)))
  ).sort((a, b) => a.localeCompare(b, 'es'));

  const uniqueSchemes = Array.from(
    new Set(allAuditors.flatMap((a) => extractAuditorComplementarySchemes(a)))
  ).sort((a, b) => a.localeCompare(b, 'es'));

  const uniqueSectors = Array.from(
    new Set(
      allAuditors.flatMap(
        (a) => summarizeAuditorSectorCoverage(a, sectores, subsectores).sectorNumbers
      )
    )
  ).sort((a, b) => a - b);

  const uniqueProfessions = Array.from(
    new Set(
      allAuditors
        .map((a) => normalizeAuditorProfessionLabel(a.profesion || a.titulo_profesional))
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, 'es'));

  const normaSchemeOptions = [
    ...uniqueNormas.map((n) => ({ value: n, label: n })),
    ...uniqueSchemes
      .filter((s) => !uniqueNormas.includes(s))
      .map((s) => ({ value: s, label: `${s} (Esquema)` })),
  ];

  const facetCategories: MultiViewFacetCategory<AuditorDetailEntity>[] = [
    {
      id: 'norma',
      label: 'Norma / Esquema',
      options: normaSchemeOptions,
      extractValues: (aud) =>
        Array.from(new Set([...getNormaLabels(aud), ...extractAuditorComplementarySchemes(aud)])),
    },
    {
      id: 'sector_iaf',
      label: 'Sector IAF',
      options: uniqueSectors.map((s) => ({ value: String(s), label: `Sector IAF ${s}` })),
      extractValues: (aud) =>
        summarizeAuditorSectorCoverage(aud, sectores, subsectores).sectorNumbers.map(String),
    },
    {
      id: 'evaluacion_in_situ',
      label: 'Evaluación In Situ',
      options: [
        { value: 'Vigente', label: 'Vigente' },
        { value: 'Por Vencer', label: 'Por Vencer' },
        { value: 'Vencido', label: 'Vencido' },
        { value: 'S/R', label: 'S/R' },
        { value: 'Pendiente / Condicionado', label: 'Pendiente / Condicionado' },
      ],
      extractValues: (aud) => [resolveAuditorInSituFacetBucket(aud)],
    },
    {
      id: 'condicion_sectorial',
      label: 'Condición Sectorial',
      options: [
        { value: 'Requiere Experto Técnico', label: 'Requiere Experto Técnico' },
        { value: 'Sin condicionamiento', label: 'Sin condicionamiento' },
      ],
      extractValues: (aud) => [
        classifyAuditorObservacionSector(aud).requiereExpertoTecnico
          ? 'Requiere Experto Técnico'
          : 'Sin condicionamiento',
      ],
    },
    {
      id: 'profesion',
      label: 'Profesión',
      options: uniqueProfessions.map((p) => ({ value: p, label: p })),
      extractValues: (aud) => {
        const prof = normalizeAuditorProfessionLabel(aud.profesion || aud.titulo_profesional);
        return prof ? [prof] : [];
      },
    },
  ];

  const effectiveSelections: MultiViewSelectionMap = state.facetSelections
    ? state.facetSelections
    : {
        norma:
          state.selectedStandard !== 'ALL' ? new Set([state.selectedStandard]) : new Set<string>(),
        sector_iaf:
          state.selectedSectorIaf !== 'ALL'
            ? new Set([state.selectedSectorIaf])
            : new Set<string>(),
        evaluacion_in_situ: new Set<string>(),
        condicion_sectorial: new Set<string>(),
        profesion: new Set<string>(),
      };

  const searchOptions = {
    getSearchableText: (aud: AuditorDetailEntity) =>
      buildAuditorSearchableText(aud, normas, sectores, subsectores),
  };

  let filtered = filterRecordsWithFacets(
    allAuditors,
    state.query,
    facetCategories,
    effectiveSelections,
    searchOptions
  );

  if (!state.facetSelections && state.selectedCalificacion !== 'ALL') {
    filtered = filtered.filter((a) => a.calificacion === state.selectedCalificacion);
  }

  const sorted = sortItems(filtered, state.sortColumn, state.sortDirection, (aud, col) => {
    switch (col) {
      case 'nombre':
        return aud.nombre;
      case 'codigo_credencial':
        return aud.siglas || aud.codigo_credencial;
      case 'calificacion':
        return aud.calificacion;
      case 'normas':
      case 'normas_acreditadas':
        return getNormaLabels(aud).length + extractAuditorComplementarySchemes(aud).length;
      case 'sectores':
      case 'sectores_iaf':
        return summarizeAuditorSectorCoverage(aud, sectores, subsectores).sectorNumbers.length;
      case 'auditorias_count':
        return aud.historialAuditorias.length;
      default:
        return '';
    }
  });

  const facetGroups = computeReactiveFacetCounts(
    allAuditors,
    state.query,
    facetCategories,
    effectiveSelections,
    searchOptions
  );

  // Strict 6 balanced Clean List columns summing to 100% — zero <button>/<a>/<input> inside <td>
  const columns: ColumnDefinition<AuditorDetailEntity>[] = [
    {
      id: 'nombre',
      header: 'Auditor',
      sortable: true,
      defaultWidthPct: 22,
      minWidthPx: 180,
      renderCell: (auditor) => {
        const siglas = (auditor.siglas || auditor.codigo_credencial || '').trim();
        const cedula = (auditor.cedula_identidad || '').trim();
        const identitySub = [siglas, cedula ? `C.I. ${cedula}` : ''].filter(Boolean).join(' · ');
        const professionLabel = normalizeAuditorProfessionLabel(
          auditor.profesion || auditor.titulo_profesional
        );
        const fullTitle = [auditor.nombre, identitySub, professionLabel].filter(Boolean).join(' — ');

        return `
          <div class="min-w-0 space-y-0.5" title="${escapeHtml(fullTitle)}">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="font-bold text-slate-900 truncate">${escapeHtml(auditor.nombre)}</span>
            </div>
            <div class="flex items-center gap-1.5 min-w-0 text-[11px] text-slate-500">
              ${
                identitySub
                  ? `<span class="font-mono font-semibold text-slate-700 shrink-0">${escapeHtml(identitySub)}</span>`
                  : ''
              }
              ${
                identitySub && professionLabel
                  ? `<span class="text-slate-300 shrink-0" aria-hidden="true">|</span>`
                  : ''
              }
              ${
                professionLabel
                  ? `<span class="truncate">${escapeHtml(professionLabel)}</span>`
                  : ''
              }
            </div>
          </div>
        `;
      },
    },
    {
      id: 'normas_acreditadas',
      header: 'Normas y Esquemas',
      sortable: true,
      defaultWidthPct: 17,
      minWidthPx: 140,
      renderCell: (auditor) => {
        const normaLabels = getNormaLabels(auditor);
        const schemes = extractAuditorComplementarySchemes(auditor);
        if (normaLabels.length === 0 && schemes.length === 0) {
          return `<span class="text-slate-400 italic">Sin normas</span>`;
        }
        const combinedChips: Array<{ label: string; isScheme: boolean }> = [
          ...normaLabels.map((n) => ({ label: formatShortIsoStandardLabel(n), isScheme: false })),
          ...schemes.map((s) => ({ label: s, isScheme: true })),
        ];
        const maxVisible = 3;
        const visibleChips = combinedChips.slice(0, maxVisible);
        const extraCount = combinedChips.length - visibleChips.length;
        const tooltipParts = [...normaLabels, ...schemes.map((s) => `Esquema: ${s}`)];
        return `
          <div class="flex flex-wrap items-center gap-1 min-w-0" title="${escapeHtml(tooltipParts.join(' · '))}">
            ${visibleChips
              .map((chip) =>
                chip.isScheme
                  ? `
                    <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-50 text-teal-800 border border-teal-200 whitespace-nowrap">
                      ${escapeHtml(chip.label)}
                    </span>
                  `
                  : `
                    <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-800 border border-slate-200 whitespace-nowrap">
                      ${escapeHtml(chip.label)}
                    </span>
                  `
              )
              .join('')}
            ${
              extraCount > 0
                ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-50 text-slate-600 border border-slate-200 whitespace-nowrap tabular-nums">+${extraCount}</span>`
                : ''
            }
          </div>
        `;
      },
    },
    {
      id: 'sectores_iaf',
      header: 'Sectores IAF',
      sortable: true,
      defaultWidthPct: 19,
      minWidthPx: 140,
      renderCell: (auditor) => {
        const summary = summarizeAuditorSectorCoverage(auditor, sectores, subsectores);
        if (summary.isEmpty) {
          return `<span class="text-slate-400 italic">Sin sectores asignados</span>`;
        }
        const sectorCount = summary.sectorNumbers.length;
        return `
          <div class="min-w-0 space-y-0.5" title="${escapeHtml(summary.tooltipText)}">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold whitespace-nowrap shrink-0 tabular-nums">
                ${sectorCount} ${sectorCount === 1 ? 'sector' : 'sectores'}
              </span>
              <span class="text-[11px] text-slate-600 font-mono truncate">
                ${escapeHtml(summary.previewText)}
              </span>
            </div>
          </div>
        `;
      },
    },
    {
      id: 'contacto',
      header: 'Contacto',
      sortable: false,
      defaultWidthPct: 19,
      minWidthPx: 150,
      renderCell: (auditor) => {
        const contact = formatAuditorContactSummary(auditor);
        if (!contact.primaryEmail && !contact.primaryPhone) {
          return `<span class="text-slate-400 italic">Sin contacto</span>`;
        }
        const emailTooltip = contact.allEmails.join(' · ');
        const phoneTooltip = contact.allPhones.join(' · ');
        return `
          <div class="min-w-0 space-y-0.5">
            ${
              contact.primaryEmail
                ? `
                  <div class="flex items-center gap-1 min-w-0" title="${escapeHtml(emailTooltip)}">
                    <span class="text-[11px] text-slate-800 truncate">${escapeHtml(contact.primaryEmail)}</span>
                    ${
                      contact.extraEmailsCount > 0
                        ? `<span class="px-1 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 shrink-0 tabular-nums">(+${contact.extraEmailsCount})</span>`
                        : ''
                    }
                  </div>
                `
                : ''
            }
            ${
              contact.primaryPhone
                ? `
                  <div class="flex items-center gap-1 min-w-0" title="${escapeHtml(phoneTooltip)}">
                    <span class="text-[11px] text-slate-500 font-mono truncate">${escapeHtml(contact.primaryPhone)}</span>
                    ${
                      contact.extraPhonesCount > 0
                        ? `<span class="px-1 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 shrink-0 tabular-nums">(+${contact.extraPhonesCount})</span>`
                        : ''
                    }
                  </div>
                `
                : ''
            }
          </div>
        `;
      },
    },
    {
      id: 'evaluacion_in_situ',
      header: 'Eval. In Situ',
      sortable: false,
      align: 'center',
      defaultWidthPct: 12,
      minWidthPx: 110,
      renderCell: (auditor) => {
        const status = evaluateAuditorInSituStatus(auditor);
        const visual = getAuditorInSituStatusVisual(status);
        const obsClass = classifyAuditorObservacionSector(auditor);
        const tooltipParts = [`Eval. In Situ: ${status}`];
        if (auditor.proxima_evaluacion_in_situ_fecha) {
          tooltipParts.push(`Próx.: ${auditor.proxima_evaluacion_in_situ_fecha}`);
        }
        if (obsClass.requiereExpertoTecnico) {
          tooltipParts.push(
            `Requiere Experto Técnico${obsClass.textoAlerta ? `: ${obsClass.textoAlerta}` : ''}`
          );
        }

        return `
          <div class="inline-flex items-center justify-center gap-1 max-w-full min-w-0" title="${escapeHtml(tooltipParts.join(' · '))}">
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border min-w-0 max-w-full ${visual.badgeClass}">
              <span class="w-1.5 h-1.5 rounded-full shrink-0 ${visual.dotClass}"></span>
              <span class="truncate">${escapeHtml(visual.label)}</span>
            </span>
            ${
              obsClass.requiereExpertoTecnico
                ? `<span class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold shrink-0" aria-label="Requiere Experto Técnico" title="${escapeHtml(obsClass.textoAlerta || 'Requiere Experto Técnico')}">⚠</span>`
                : ''
            }
          </div>
        `;
      },
    },
    {
      id: 'auditorias_count',
      header: 'Auditorías',
      sortable: true,
      align: 'center',
      defaultWidthPct: 11,
      minWidthPx: 105,
      renderCell: (auditor) => {
        const count = auditor.historialAuditorias.length;
        return `
          <span class="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full text-[11px] font-bold border tabular-nums ${
            count > 0
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-slate-100 text-slate-600 border-slate-200'
          }" title="${count} ${count === 1 ? 'auditoría registrada' : 'auditorías registradas'}">
            ${count}
          </span>
        `;
      },
    },
  ];

  const renderCard = (auditor: AuditorDetailEntity): string => {
    const inSituStatus = evaluateAuditorInSituStatus(auditor);
    const inSituVisual = getAuditorInSituStatusVisual(inSituStatus);
    const obsClass = classifyAuditorObservacionSector(auditor);
    const normaLabels = getNormaLabels(auditor);
    const schemes = extractAuditorComplementarySchemes(auditor);
    const sectorSummary = summarizeAuditorSectorCoverage(auditor, sectores, subsectores);
    const contact = formatAuditorContactSummary(auditor);
    const siglas = (auditor.siglas || auditor.codigo_credencial || '').trim();
    const cedula = (auditor.cedula_identidad || '').trim();
    const professionLabel = normalizeAuditorProfessionLabel(
      auditor.profesion || auditor.titulo_profesional
    );
    const auditCount = auditor.historialAuditorias.length;

    return `
      <div
        role="button"
        tabindex="0"
        data-action="select-auditor"
        data-auditor-id="${escapeHtml(auditor.id)}"
        aria-label="Abrir detalle de ${escapeHtml(auditor.nombre)}"
        class="bg-white border border-slate-200 hover:border-indigo-300 rounded-xl p-5 shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between space-y-3.5 group"
      >
        <div class="space-y-1.5">
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-1.5 flex-wrap min-w-0">
              ${
                siglas
                  ? `<span class="inline-block font-mono text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 shrink-0">${escapeHtml(siglas)}</span>`
                  : ''
              }
              ${
                cedula
                  ? `<span class="font-mono text-[11px] text-slate-500 shrink-0">C.I. ${escapeHtml(cedula)}</span>`
                  : ''
              }
            </div>

            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0 ${inSituVisual.badgeClass}">
              <span class="w-1.5 h-1.5 rounded-full ${inSituVisual.dotClass}"></span>
              <span>${escapeHtml(inSituVisual.label)}</span>
            </span>
          </div>

          <h3 class="text-sm font-bold text-slate-900 group-hover:text-indigo-700 transition-colors truncate" title="${escapeHtml(auditor.nombre)}">
            ${escapeHtml(auditor.nombre)}
          </h3>
          <p class="text-xs text-slate-500 truncate" title="${escapeHtml(professionLabel || 'Evaluador ISO/IEC 17021-1')}">
            ${escapeHtml(professionLabel || 'Evaluador ISO/IEC 17021-1')}
          </p>
        </div>

        <div class="text-xs text-slate-600 bg-slate-50/75 p-3 rounded-lg border border-slate-100 space-y-2">
          <div class="flex flex-wrap gap-1">
            ${
              normaLabels.length === 0 && schemes.length === 0
                ? '<span class="text-[11px] text-slate-400 italic">Sin normas asignadas</span>'
                : `${normaLabels
                    .map(
                      (n) => `
                        <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white text-slate-800 border border-slate-200" title="${escapeHtml(n)}">
                          ${escapeHtml(formatShortIsoStandardLabel(n))}
                        </span>
                      `
                    )
                    .join('')}${schemes
                    .map(
                      (s) => `
                        <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-50 text-teal-800 border border-teal-200">
                          ${escapeHtml(s)}
                        </span>
                      `
                    )
                    .join('')}`
            }
          </div>

          <div class="pt-1.5 border-t border-slate-200/60 flex items-center justify-between gap-2 text-[11px]" title="${escapeHtml(sectorSummary.tooltipText)}">
            <span class="text-slate-500 shrink-0">Sectores IAF:</span>
            ${
              sectorSummary.isEmpty
                ? `<span class="text-slate-400 italic truncate">Sin sectores asignados</span>`
                : `<span class="font-mono font-medium text-slate-800 truncate">${escapeHtml(sectorSummary.previewText)}</span>`
            }
          </div>
        </div>

        <div class="pt-2 border-t border-slate-100 space-y-1.5">
          ${
            obsClass.requiereExpertoTecnico
              ? `
                <div class="flex items-center gap-1.5 px-2 py-1 rounded bg-amber-50 border border-amber-200/80 text-[11px] text-amber-800 min-w-0" title="${escapeHtml(obsClass.textoAlerta || 'Requiere Experto Técnico')}">
                  <span class="shrink-0 font-bold" aria-hidden="true">⚠</span>
                  <span class="truncate">Requiere Experto Técnico${obsClass.sectoresCondicionados.length > 0 ? ` (S${obsClass.sectoresCondicionados.join(', S')})` : ''}</span>
                </div>
              `
              : ''
          }
          <div class="flex items-center justify-between gap-2 text-[11px] text-slate-500">
            <div class="min-w-0 flex items-center gap-2 truncate">
              ${
                contact.primaryPhone
                  ? `<span class="font-mono text-slate-600 shrink-0">${escapeHtml(contact.primaryPhone)}${contact.extraPhonesCount > 0 ? ` (+${contact.extraPhonesCount})` : ''}</span>`
                  : ''
              }
              ${
                contact.primaryEmail
                  ? `<span class="truncate" title="${escapeHtml(contact.allEmails.join(' · '))}">${escapeHtml(contact.primaryEmail)}${contact.extraEmailsCount > 0 ? ` (+${contact.extraEmailsCount})` : ''}</span>`
                  : ''
              }
              ${
                !contact.primaryPhone && !contact.primaryEmail
                  ? `<span class="italic text-slate-400">Sin contacto</span>`
                  : ''
              }
            </div>
            <span class="font-semibold text-slate-700 tabular-nums shrink-0">
              ${auditCount} auditoría${auditCount === 1 ? '' : 's'}
            </span>
          </div>
        </div>
      </div>
    `;
  };

  const actionsHtml = isStaff
    ? renderMultiViewAddButton('open-create-auditor', 'Nuevo Auditor')
    : '';

  return renderUniversalTemplate<AuditorDetailEntity>({
    domainKey: 'auditores',
    tableId: 'cert-auditores-main',
    columnWidths,
    title: 'Equipo de Auditores',
    subtitle:
      'Cuerpo de evaluadores técnicos calificados bajo ISO/IEC 17021-1:2015 cláusula 7.2 e ISO 19011:2018',
    entityLabel: 'auditores registrados',
    searchQuery: state.query,
    searchPlaceholder:
      "Buscar por nombre, siglas, C.I., profesión, contacto, norma o sector... (Presione '/' para enfocar)",
    searchInputId: 'auditorDirectorySearchInput',
    clearSearchBtnId: 'clearAuditorSearchBtn',
    totalCount: allAuditors.length,
    filteredCount: sorted.length,
    viewMode: state.viewMode,
    isSidebarOpen: state.isSidebarOpen ?? true,
    sortState: {
      column: state.sortColumn,
      direction: state.sortDirection,
    },
    facetGroups,
    items: sorted,
    columns,
    getRowAttrs: (aud) =>
      `data-action="select-auditor" data-auditor-id="${escapeHtml(aud.id)}" title="Abrir detalle de ${escapeHtml(aud.nombre)}"`,
    renderCard,
    emptyStateTitle: 'No se encontraron auditores',
    emptyStateMessage:
      'No hay evaluadores que coincidan con el término de búsqueda o las facetas seleccionadas.',
    actionsHtml,
    loading,
    loadingMessage: 'Cargando cuerpo de auditores y competencias...',
    ...extractUniversalArchiveProps(archiveConfig, 'auditores'),
  });
}

/**
 * Standardized 3-Zone Detail Page Architecture ('read' | 'add' | 'edit') & 4 Child Tabs
 */
function renderAuditorDetailPage(props: {
  profile: UserProfile;
  state: AuditorViewState;
  auditor?: AuditorDetailEntity;
  normas: ReadonlyArray<NormaEntity>;
  sectores: ReadonlyArray<SectorIafEntity>;
  subsectores: ReadonlyArray<SubsectorIafEntity>;
  isStaff: boolean;
  tableColumnWidths?: Record<string, Record<string, number>>;
  authUserEmail?: string | null;
}): string {
  const {
    profile,
    state,
    auditor,
    normas,
    sectores,
    subsectores,
    isStaff,
    tableColumnWidths,
    authUserEmail,
  } = props;

  const isArchivedAuditor = Boolean(auditor?.deleted_at);
  const effectiveStaffForEdit = isStaff && !isArchivedAuditor;
  const mode = resolveAuditorDetailMode(state, effectiveStaffForEdit, auditor);
  const isCreateMode = mode === 'add';
  const isReadOnly = mode === 'read';

  const draft: AuditorFormDraft =
    mode === 'add'
      ? state.formDraft ?? createEmptyAuditorFormDraft()
      : mode === 'edit'
      ? state.formDraft ??
        (auditor ? createAuditorDraftFromEntity(auditor) : createEmptyAuditorFormDraft())
      : auditor
      ? createAuditorDraftFromEntity(auditor)
      : createEmptyAuditorFormDraft();

  const normaLinks = auditor ? getAuditorNormaLinks(auditor, normas) : [];
  const sectorLinks = auditor ? getAuditorSectorLinks(auditor, sectores) : [];
  const subsectorLinks = auditor ? getAuditorSubsectorLinks(auditor, subsectores) : [];
  const totalCompetencies = normaLinks.length + sectorLinks.length + subsectorLinks.length;
  const activePhones = (auditor?.telefonos || []).filter((t) => !t.deleted_at);
  const activeEmails = (auditor?.emails || []).filter((e) => !e.deleted_at);
  const activeEvaluaciones = sortEvaluacionesInSituChronological(auditor?.evaluaciones_in_situ);

  const inSituStatus = auditor ? evaluateAuditorInSituStatus(auditor) : 'S/R';
  const statusVisual = getAuditorInSituStatusVisual(inSituStatus);

  const activeTab: AuditorChildTab =
    state.activeChildTab === 'contacto' ||
    state.activeChildTab === 'evaluaciones' ||
    state.activeChildTab === 'historial'
      ? state.activeChildTab
      : 'competencias';

  const siglasVal = auditor ? (auditor.siglas || auditor.codigo_credencial || '').trim() : '';
  const cedulaVal = auditor ? (auditor.cedula_identidad || '').trim() : '';
  const profesionLabel = auditor
    ? normalizeAuditorProfessionLabel(auditor.profesion || auditor.titulo_profesional)
    : '';
  const contactCount = activePhones.length + activeEmails.length;

  const subtitleText = isCreateMode
    ? 'Registro maestro de evaluador técnico en public.auditor conforme a ISO/IEC 17021-1:2015.'
    : auditor
    ? [
        siglasVal,
        cedulaVal ? `C.I. ${cedulaVal}` : '',
        profesionLabel,
        `${normaLinks.length} ${normaLinks.length === 1 ? 'norma' : 'normas'}`,
        `${sectorLinks.length} ${sectorLinks.length === 1 ? 'sector IAF' : 'sectores IAF'}`,
        `${contactCount} ${contactCount === 1 ? 'canal de contacto' : 'canales de contacto'}`,
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined;

  let customTopActionsHtml: string | undefined;
  if (isStaff) {
    if (!isCreateMode && auditor && isArchivedAuditor) {
      const restoreBtnHtml =
        profile.role === 'ADMIN'
          ? `
            <button
              type="button"
              data-action="restore-archived-record"
              data-restore-table="auditor"
              data-restore-id="${escapeHtml(auditor.id)}"
              title="Restaurar auditor archivado"
              aria-label="Restaurar"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer shadow-2xs shrink-0"
            >
              <span aria-hidden="true">↺</span>
              <span>Restaurar</span>
            </button>
          `
          : '';
      const historyBtnHtml = `
        <button
          type="button"
          data-action="open-changelog"
          data-table-name="auditor"
          data-record-id="${escapeHtml(auditor.id)}"
          data-entity-name="${escapeHtml(auditor.nombre)}"
          title="Historial de Cambios"
          aria-label="Historial de Cambios"
          class="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 shadow-2xs transition-colors cursor-pointer shrink-0"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <polyline points="12 7 12 12 15.5 14" />
          </svg>
        </button>
      `;
      customTopActionsHtml = `${restoreBtnHtml}${historyBtnHtml}`;
    } else {
      customTopActionsHtml = renderDetailFormTopActions({
        mode,
        isStaff: true,
        formId: 'auditorDetailForm',
        saveBtnId: 'saveAuditorFormBtn',
        cancelBtnId: 'cancelEditAuditorBtn',
        editBtnId: 'startEditAuditorBtn',
        saveTitle: isCreateMode ? 'Crear auditor' : 'Guardar cambios',
        cancelTitle: isCreateMode ? 'Cancelar creación' : 'Cancelar edición',
        editTitle: 'Editar Perfil',
        showHistoryBtn: !isCreateMode,
        showArchiveBtn: !isCreateMode && canArchiveRecord(profile),
        extraAuditAttrs: auditor
          ? `data-table-name="auditor" data-record-id="${escapeHtml(auditor.id)}" data-entity-name="${escapeHtml(auditor.nombre)}"`
          : '',
        extraArchiveAttrs: auditor
          ? `data-archive-table="auditor" data-archive-id="${escapeHtml(auditor.id)}" data-archive-entity-label="Auditor Evaluador" data-archive-title="${escapeHtml(auditor.nombre)}" data-archive-subtitle="${escapeHtml(
              [siglasVal, cedulaVal ? `C.I. ${cedulaVal}` : ''].filter(Boolean).join(' · ') || 'Evaluador Técnico'
            )}"`
          : '',
      });
    }
  }

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
    isReadOnly && auditor
      ? renderReadOnlyAuditorAttributes(auditor)
      : renderAuditorFormBody(draft, isCreateMode);

  const childTabs = isCreateMode
    ? []
    : [
        {
          id: 'competencias',
          label: 'Competencias',
          symbol: '🛡️',
          count: totalCompetencies,
        },
        {
          id: 'contacto',
          label: 'Contacto',
          symbol: '📞',
          count: contactCount,
        },
        {
          id: 'evaluaciones',
          label: 'Evaluaciones In Situ',
          symbol: '🩺',
          count: activeEvaluaciones.length,
        },
        {
          id: 'historial',
          label: 'Historial de Auditorías',
          symbol: '📋',
          count: auditor?.historialAuditorias.length ?? 0,
        },
      ];

  return renderDetailPageTemplate({
    entityType: 'Auditor Calificado',
    entitySymbol: '🪪',
    title: isCreateMode ? 'Nuevo Auditor' : auditor ? auditor.nombre : 'Auditor Calificado',
    eyebrowCode: !isCreateMode && siglasVal ? siglasVal : undefined,
    subtitle: subtitleText,
    statusBadge:
      !isCreateMode && auditor
        ? {
            label: statusVisual.label,
            badgeClass: statusVisual.badgeClass,
            dotClass: statusVisual.dotClass,
          }
        : undefined,
    secondaryHeaderBadge: isArchivedAuditor
      ? {
          label: 'Archivado',
          badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
        }
      : undefined,
    backButton: {
      label: 'Volver',
      nav: 'certificacion',
      subview: 'auditors',
      action: 'back-to-auditor-list',
    },
    isCreateMode,
    customTopActionsHtml,
    parents: [],
    tableName: 'auditor',
    recordId: auditor?.id || 'auditor-new',
    feedbackHtml,
    attributes: [],
    customRecordBodyHtml,
    childTabs,
    activeChildTabId: activeTab,
    childTabAttrName: 'data-auditor-tab',
    renderChildTabContent: (tabId) => {
      if (!auditor) return '';
      if (tabId === 'contacto') {
        return renderContactoChildTab({
          profile,
          auditor,
          state,
          isStaff: effectiveStaffForEdit,
          authUserEmail,
        });
      }
      if (tabId === 'evaluaciones') {
        return renderEvaluacionesChildTab({
          auditor,
          state,
          isStaff: effectiveStaffForEdit,
        });
      }
      if (tabId === 'historial') {
        return renderHistorialChildTab(auditor.historialAuditorias, tableColumnWidths);
      }
      return renderCompetenciasChildTab({
        auditor,
        normaLinks,
        sectorLinks,
        subsectorLinks,
        isStaff: effectiveStaffForEdit,
        tableColumnWidths,
      });
    },
  });
}

function formatEvaluationSummaryValue(texto?: string | null, fecha?: string | null): string {
  const cleanText = (texto || '').trim();
  const cleanDate = (fecha || '').trim();
  if (cleanText && cleanDate && !cleanText.includes(cleanDate)) {
    return `${cleanText} (${cleanDate})`;
  }
  return cleanText || cleanDate || '';
}

function renderReadOnlyAuditorAttributes(auditor: AuditorDetailEntity): string {
  const siglas = (auditor.siglas || auditor.codigo_credencial || '').trim();
  const cedula = (auditor.cedula_identidad || '').trim();
  const profesion = normalizeAuditorProfessionLabel(auditor.profesion || auditor.titulo_profesional);
  const schemes = extractAuditorComplementarySchemes(auditor);
  const sistemaSecundario = (auditor.sistema_gestion_secundario || '').trim();
  const ultEval = auditor.sin_registro_evaluacion
    ? 'S/R (Sin registro)'
    : formatEvaluationSummaryValue(
        auditor.ultima_evaluacion_in_situ_texto,
        auditor.ultima_evaluacion_in_situ_fecha
      ) || 'Sin registro';
  const proxEval = auditor.sin_registro_evaluacion
    ? 'S/R (Sin registro)'
    : formatEvaluationSummaryValue(
        auditor.proxima_evaluacion_in_situ_texto,
        auditor.proxima_evaluacion_in_situ_fecha
      ) || 'Sin fecha programada';
  const sectorEvaluado = (auditor.sector_area_evaluado_texto || '').trim();
  const obsEvaluacion = (auditor.observaciones_evaluacion || '').trim();
  const obsSectores = (auditor.observacion_sectores || '').trim();
  const obsClass = classifyAuditorObservacionSector(auditor);

  return `
    <div class="space-y-3">
      <!-- Bloque Identidad -->
      <div class="space-y-1.5">
        <h3 class="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-0.5">
          Identidad
        </h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div class="sm:col-span-2 bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Nombre Completo</span>
            <p class="text-xs font-bold text-slate-900">${escapeHtml(auditor.nombre)}</p>
          </div>
          <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Siglas</span>
            <p class="text-xs font-mono font-bold text-slate-900">
              ${siglas ? escapeHtml(siglas) : '<span class="font-sans font-normal text-slate-400 italic">No asignadas</span>'}
            </p>
          </div>
          <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Nº Cédula de Identidad</span>
            <p class="text-xs font-mono font-bold text-slate-900">
              ${cedula ? escapeHtml(cedula) : '<span class="font-sans font-normal text-slate-400 italic">Sin cédula</span>'}
            </p>
          </div>
          <div class="sm:col-span-2 lg:col-span-4 bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Profesión</span>
            <p class="text-xs font-semibold text-slate-800">
              ${profesion ? escapeHtml(profesion) : '<span class="font-normal text-slate-400 italic">No registrada</span>'}
            </p>
          </div>
        </div>
      </div>

      <!-- Bloque Calificación Normativa y Sectorial -->
      <div class="space-y-1.5">
        <h3 class="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-0.5">
          Calificación Normativa y Sectorial
        </h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Año Actualización Normas</span>
            <p class="text-xs font-bold text-slate-900 tabular-nums">
              ${auditor.anio_actualizacion_normas ? escapeHtml(String(auditor.anio_actualizacion_normas)) : '<span class="font-normal text-slate-400 italic">Sin dato</span>'}
            </p>
          </div>
          <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Año Actualización Sectores</span>
            <p class="text-xs font-bold text-slate-900 tabular-nums">
              ${auditor.anio_actualizacion_sectores ? escapeHtml(String(auditor.anio_actualizacion_sectores)) : '<span class="font-normal text-slate-400 italic">Sin dato</span>'}
            </p>
          </div>
          <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-1">
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Esquemas Complementarios</span>
            <div class="flex flex-wrap gap-1">
              ${
                schemes.length > 0
                  ? schemes
                      .map(
                        (s) =>
                          `<span class="inline-flex px-2 py-0.5 rounded text-[11px] font-bold bg-teal-50 text-teal-800 border border-teal-200">${escapeHtml(s)}</span>`
                      )
                      .join('')
                  : '<span class="text-xs text-slate-500">Ninguno</span>'
              }
            </div>
          </div>
          <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Sistema Secundario</span>
            <p class="text-xs font-medium text-slate-800">
              ${sistemaSecundario ? escapeHtml(sistemaSecundario) : '<span class="text-slate-400 italic">No aplica</span>'}
            </p>
          </div>
        </div>
      </div>

      <!-- Bloque Resumen de Evaluación In Situ -->
      <div class="space-y-1.5">
        <h3 class="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-0.5">
          Resumen de Evaluación In Situ
        </h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Última Evaluación In Situ</span>
            <p class="text-xs font-bold text-slate-900 tabular-nums">${escapeHtml(ultEval)}</p>
          </div>
          <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Próxima Evaluación In Situ</span>
            <p class="text-xs font-bold text-slate-900 tabular-nums">${escapeHtml(proxEval)}</p>
          </div>
          <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Sector / Área Evaluada</span>
            <p class="text-xs font-mono font-semibold text-slate-800">
              ${sectorEvaluado ? escapeHtml(sectorEvaluado) : '<span class="font-sans font-normal text-slate-400 italic">Sin especificar</span>'}
            </p>
          </div>
          <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 space-y-0.5">
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Observaciones de Evaluación</span>
            <p class="text-xs text-slate-700">
              ${obsEvaluacion ? escapeHtml(obsEvaluacion) : '<span class="text-slate-400 italic">Sin observaciones</span>'}
            </p>
          </div>
        </div>
      </div>

      ${
        obsSectores || obsClass.requiereExpertoTecnico
          ? `
            <div
              role="note"
              class="rounded-xl border ${
                obsClass.requiereExpertoTecnico
                  ? 'border-amber-300 bg-amber-50/90 text-amber-950'
                  : 'border-sky-200 bg-sky-50/80 text-sky-950'
              } px-3.5 py-2.5 flex items-start gap-2.5"
            >
              <span class="text-base leading-none shrink-0 mt-0.5" aria-hidden="true">${
                obsClass.requiereExpertoTecnico ? '⚠️' : 'ℹ️'
              }</span>
              <div class="space-y-0.5 min-w-0">
                <p class="text-xs font-bold">
                  ${
                    obsClass.requiereExpertoTecnico
                      ? `Acompañamiento Obligatorio con Experto Técnico${
                          obsClass.sectoresCondicionados.length > 0
                            ? ` (Sectores IAF ${obsClass.sectoresCondicionados.join(', ')})`
                            : ''
                        }`
                      : 'Observación de Sectores IAF'
                  }
                </p>
                <p class="text-xs leading-relaxed">
                  ${escapeHtml(obsSectores || obsClass.textoAlerta)}
                </p>
              </div>
            </div>
          `
          : ''
      }
    </div>
  `;
}

function renderAuditorFormBody(draft: AuditorFormDraft, isCreateMode: boolean): string {
  return `
    <form id="auditorDetailForm" class="space-y-4" novalidate>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div class="sm:col-span-2 bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
          <label for="auditorNombreInput" class="block text-xs font-bold text-slate-700">
            Nombre Completo <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <input
            type="text"
            id="auditorNombreInput"
            name="nombre"
            required
            maxlength="${AUDITOR_NOMBRE_MAX_LENGTH}"
            value="${escapeHtml(draft.nombre)}"
            placeholder="Ej. Yurima Carrillo"
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
          />
          <p class="text-[11px] text-slate-500">
            Se permiten homónimos exactos siempre que difiera la cédula de identidad.
          </p>
        </div>

        <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
          <label for="auditorSiglasInput" class="block text-xs font-bold text-slate-700">
            Siglas <span class="text-rose-600" aria-hidden="true">*</span>
          </label>
          <input
            type="text"
            id="auditorSiglasInput"
            name="siglas"
            required
            maxlength="${AUDITOR_SIGLAS_MAX_LENGTH}"
            value="${escapeHtml(draft.siglas)}"
            placeholder="Ej. YC"
            class="w-full text-xs font-mono uppercase p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
          />
          <p class="text-[11px] text-slate-500">Entre 2 y ${AUDITOR_SIGLAS_MAX_LENGTH} caracteres alfanuméricos.</p>
        </div>

        <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
          <label for="auditorCedulaInput" class="block text-xs font-bold text-slate-700">
            Nº Cédula de Identidad ${isCreateMode ? '<span class="text-rose-600" aria-hidden="true">*</span>' : ''}
          </label>
          <input
            type="text"
            id="auditorCedulaInput"
            name="cedula_identidad"
            ${isCreateMode ? 'required' : ''}
            maxlength="${AUDITOR_CEDULA_MAX_LENGTH}"
            value="${escapeHtml(draft.cedula_identidad)}"
            placeholder="Ej. 12310919"
            class="w-full text-xs font-mono p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
          />
          <p class="text-[11px] text-slate-500">Identificador único entre auditores activos.</p>
        </div>

        <div class="sm:col-span-2 bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
          <label for="auditorProfesionInput" class="block text-xs font-bold text-slate-700">
            Profesión
          </label>
          <input
            type="text"
            id="auditorProfesionInput"
            name="profesion"
            maxlength="${AUDITOR_PROFESION_MAX_LENGTH}"
            value="${escapeHtml(draft.profesion)}"
            placeholder="Ej. Ingeniero Industrial"
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
          />
        </div>

        <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
          <label for="auditorAnioActualizacionNormasInput" class="block text-xs font-bold text-slate-700">
            Año Actualización Normas
          </label>
          <input
            type="number"
            id="auditorAnioActualizacionNormasInput"
            name="anio_actualizacion_normas"
            min="${AUDITOR_YEAR_MIN}"
            max="${AUDITOR_YEAR_MAX}"
            value="${draft.anio_actualizacion_normas !== null ? escapeHtml(String(draft.anio_actualizacion_normas)) : ''}"
            placeholder="Ej. 2024"
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
          />
        </div>

        <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
          <label for="auditorAnioActualizacionSectoresInput" class="block text-xs font-bold text-slate-700">
            Año Actualización Sectores
          </label>
          <input
            type="number"
            id="auditorAnioActualizacionSectoresInput"
            name="anio_actualizacion_sectores"
            min="${AUDITOR_YEAR_MIN}"
            max="${AUDITOR_YEAR_MAX}"
            value="${draft.anio_actualizacion_sectores !== null ? escapeHtml(String(draft.anio_actualizacion_sectores)) : ''}"
            placeholder="Ej. 2024"
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
          />
        </div>

        <div class="sm:col-span-2 bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
          <label for="auditorEsquemasComplementariosInput" class="block text-xs font-bold text-slate-700">
            Esquemas Complementarios
          </label>
          <input
            type="text"
            id="auditorEsquemasComplementariosInput"
            name="esquemas_complementarios"
            value="${escapeHtml(draft.esquemas_complementarios)}"
            placeholder="Ej. MARCA, HACCP (dejar vacío si ninguno)"
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
          />
        </div>

        <div class="sm:col-span-2 bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
          <label for="auditorSistemaGestionSecundarioInput" class="block text-xs font-bold text-slate-700">
            Sistema Secundario
          </label>
          <input
            type="text"
            id="auditorSistemaGestionSecundarioInput"
            name="sistema_gestion_secundario"
            value="${escapeHtml(draft.sistema_gestion_secundario)}"
            placeholder="Ej. FSSC 22000 / Gestión Integrada"
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
          />
        </div>

        <div class="sm:col-span-2 bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
          <label for="auditorSectorAreaEvalInput" class="block text-xs font-bold text-slate-700">
            Sector / Área Evaluada In Situ
          </label>
          <input
            type="text"
            id="auditorSectorAreaEvalInput"
            name="sector_area_evaluado_texto"
            value="${escapeHtml(draft.sector_area_evaluado_texto)}"
            placeholder="Ej. 33 / 33.18"
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
          />
        </div>

        <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
          <label for="auditorUltimaEvalFechaInput" class="block text-xs font-bold text-slate-700">
            Última Eval. In Situ (Fecha)
          </label>
          <input
            type="date"
            id="auditorUltimaEvalFechaInput"
            name="ultima_evaluacion_in_situ_fecha"
            value="${escapeHtml(draft.ultima_evaluacion_in_situ_fecha || '')}"
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
          />
        </div>

        <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
          <label for="auditorProximaEvalFechaInput" class="block text-xs font-bold text-slate-700">
            Próxima Eval. In Situ (Fecha)
          </label>
          <input
            type="date"
            id="auditorProximaEvalFechaInput"
            name="proxima_evaluacion_in_situ_fecha"
            value="${escapeHtml(draft.proxima_evaluacion_in_situ_fecha || '')}"
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
          />
        </div>

        <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
          <label for="auditorUltimaEvalTextoInput" class="block text-xs font-bold text-slate-700">
            Última Eval. (Etiqueta)
          </label>
          <input
            type="text"
            id="auditorUltimaEvalTextoInput"
            name="ultima_evaluacion_in_situ_texto"
            value="${escapeHtml(draft.ultima_evaluacion_in_situ_texto)}"
            placeholder="Ej. nov-24"
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
          />
        </div>

        <div class="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
          <label for="auditorProximaEvalTextoInput" class="block text-xs font-bold text-slate-700">
            Próxima Eval. (Etiqueta)
          </label>
          <input
            type="text"
            id="auditorProximaEvalTextoInput"
            name="proxima_evaluacion_in_situ_texto"
            value="${escapeHtml(draft.proxima_evaluacion_in_situ_texto)}"
            placeholder="Ej. nov-27"
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
          />
        </div>

        <div class="sm:col-span-2 bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 flex items-center justify-between gap-2">
          <label for="auditorSinRegistroEvalInput" class="inline-flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              id="auditorSinRegistroEvalInput"
              name="sin_registro_evaluacion"
              ${draft.sin_registro_evaluacion ? 'checked' : ''}
              class="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
            />
            <span>Sin Registro de Evaluación In Situ (S/R)</span>
          </label>
        </div>

        <div class="sm:col-span-2 bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
          <label for="auditorObsEvalInput" class="block text-xs font-bold text-slate-700">
            Observaciones de Evaluación
          </label>
          <textarea
            id="auditorObsEvalInput"
            name="observaciones_evaluacion"
            rows="2"
            placeholder="Notas de evaluación in situ, condición pendiente, etc."
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
          >${escapeHtml(draft.observaciones_evaluacion)}</textarea>
        </div>

        <div class="sm:col-span-2 bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 space-y-1.5">
          <label for="auditorObsSectoresInput" class="block text-xs font-bold text-slate-700">
            Observación de Sectores / Experto Técnico
          </label>
          <textarea
            id="auditorObsSectoresInput"
            name="observacion_sectores"
            rows="2"
            placeholder="Ej. Sector 9 y 38 con Experto Técnico."
            class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15 focus:outline-none"
          >${escapeHtml(draft.observacion_sectores)}</textarea>
        </div>
      </div>

      <p class="text-[11px] text-slate-500">
        ${
          isCreateMode
            ? 'Después de guardar el perfil podrá vincular Competencias ISO/IAF, teléfonos, correos y evaluaciones in situ desde las pestañas de la ficha.'
            : 'Las competencias M:N, canales de contacto y evaluaciones in situ se gestionan en sus pestañas dedicadas.'
        }
      </p>
    </form>
  `;
}

/**
 * TAB 1: Matriz de Competencias M:N (norma_auditor, sector_iaf_auditor, subsector_iaf_auditor) + Esquemas
 */
function renderCompetenciasChildTab(params: {
  auditor: AuditorDetailEntity;
  normaLinks: AuditorNormaLink[];
  sectorLinks: AuditorSectorLink[];
  subsectorLinks: AuditorSubsectorLink[];
  isStaff: boolean;
  tableColumnWidths?: Record<string, Record<string, number>>;
}): string {
  const { auditor, normaLinks, sectorLinks, subsectorLinks, isStaff, tableColumnWidths } = params;
  const schemes = extractAuditorComplementarySchemes(auditor);

  const headerBarHtml = `
    <div class="flex flex-wrap items-center justify-between gap-2 pb-2.5">
      <div class="flex flex-wrap items-center gap-2 min-w-0">
        <p class="text-xs text-slate-500">
          Haga clic en una fila para inspeccionar o desvincular la competencia técnica bajo ISO/IEC 17021-1.
        </p>
        ${
          schemes.length > 0
            ? `
              <div class="inline-flex items-center gap-1 flex-wrap">
                <span class="text-[11px] font-semibold text-slate-500">Esquemas:</span>
                ${schemes
                  .map(
                    (s) =>
                      `<span class="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 text-teal-800 border border-teal-200">${escapeHtml(s)}</span>`
                  )
                  .join('')}
              </div>
            `
            : ''
        }
      </div>
      ${
        isStaff
          ? `
            <button
              type="button"
              data-action="open-add-competency"
              data-auditor-id="${escapeHtml(auditor.id)}"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold transition-colors cursor-pointer shadow-2xs shrink-0"
            >
              <span aria-hidden="true">+</span>
              <span>Asignar Competencia</span>
            </button>
          `
          : ''
      }
    </div>
  `;

  const normaColumns: ColumnDefinition<AuditorNormaLink>[] = [
    {
      id: 'norma_codigo',
      header: 'Norma ISO',
      defaultWidthPct: 30,
      minWidthPx: 130,
      renderCell: (item) => `
        <span class="font-bold text-slate-900 inline-flex items-center gap-1.5">
          <span aria-hidden="true">📘</span>
          <span>${escapeHtml(item.norma_codigo)}</span>
        </span>
      `,
    },
    {
      id: 'norma_titulo',
      header: 'Título del Estándar',
      defaultWidthPct: 50,
      minWidthPx: 180,
      renderCell: (item) =>
        `<span class="text-slate-700 truncate block">${escapeHtml(item.norma_titulo || 'Sistema de Gestión Certificado')}</span>`,
    },
    {
      id: 'esquema',
      header: 'Esquema',
      defaultWidthPct: 20,
      minWidthPx: 110,
      renderCell: (item) =>
        `<span class="font-mono text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">${escapeHtml(item.esquema || 'ISO')}</span>`,
    },
  ];

  const sectorColumns: ColumnDefinition<AuditorSectorLink>[] = [
    {
      id: 'sector_numero',
      header: 'Sector IAF',
      defaultWidthPct: 28,
      minWidthPx: 120,
      renderCell: (item) => `
        <span class="font-bold text-indigo-800 inline-flex items-center gap-1.5">
          <span aria-hidden="true">🏭</span>
          <span>Sector IAF ${item.sector_numero}</span>
        </span>
      `,
    },
    {
      id: 'sector_descripcion',
      header: 'Descripción Técnica Sectorial',
      defaultWidthPct: 72,
      minWidthPx: 200,
      renderCell: (item) =>
        `<span class="text-slate-700 truncate block">${escapeHtml(item.sector_descripcion)}</span>`,
    },
  ];

  const subsectorColumns: ColumnDefinition<AuditorSubsectorLink>[] = [
    {
      id: 'subsector_codigo',
      header: 'Sub-Sector',
      defaultWidthPct: 20,
      minWidthPx: 100,
      renderCell: (item) => `
        <span class="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
          ${escapeHtml(item.subsector_codigo)}
        </span>
      `,
    },
    {
      id: 'subsector_descripcion',
      header: 'Descripción Técnica',
      defaultWidthPct: 45,
      minWidthPx: 160,
      renderCell: (item) =>
        `<span class="text-slate-800 font-medium truncate block">${escapeHtml(item.subsector_descripcion)}</span>`,
    },
    {
      id: 'sector_numero',
      header: 'Sector Padre',
      defaultWidthPct: 18,
      minWidthPx: 100,
      renderCell: (item) =>
        `<span class="text-slate-600 font-semibold">Sector ${item.sector_numero}</span>`,
    },
    {
      id: 'categoria_riesgo',
      header: 'Riesgo IAF',
      align: 'center',
      defaultWidthPct: 17,
      minWidthPx: 100,
      renderCell: (item) => {
        const risk = item.categoria_riesgo || 'MEDIO';
        const badgeClass =
          risk === 'ALTO'
            ? 'bg-rose-50 text-rose-800 border-rose-200'
            : risk === 'BAJO'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : 'bg-amber-50 text-amber-800 border-amber-200';
        return `<span class="inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold border ${badgeClass}">${escapeHtml(risk)}</span>`;
      },
    },
  ];

  return `
    ${headerBarHtml}
    <div class="space-y-4">
      <div class="space-y-1.5">
        <div class="flex items-center justify-between px-1">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-600">
            📘 Normas ISO Acreditadas (${normaLinks.length})
          </h3>
        </div>
        ${renderListViewTable({
          tableId: 'auditor-tab-normas',
          columns: normaColumns,
          items: normaLinks,
          columnWidths: tableColumnWidths?.['auditor-tab-normas'],
          emptyStateTitle: 'Sin normas asignadas',
          emptyStateMessage: 'Este auditor aún no tiene normas vinculadas en norma_auditor.',
          getRowAttrs: (item) =>
            `data-action="select-competencia-auditor" data-comp-tipo="norma" data-auditor-id="${escapeHtml(auditor.id)}" data-target-id="${escapeHtml(item.id_norma)}" title="Inspeccionar competencia ${escapeHtml(item.norma_codigo)}"`,
        })}
      </div>

      <div class="space-y-1.5">
        <div class="flex items-center justify-between px-1">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-600">
            🏭 Sectores Técnicos IAF (${sectorLinks.length})
          </h3>
        </div>
        ${renderListViewTable({
          tableId: 'auditor-tab-sectores',
          columns: sectorColumns,
          items: sectorLinks,
          columnWidths: tableColumnWidths?.['auditor-tab-sectores'],
          emptyStateTitle: 'Sin sectores IAF asignados',
          emptyStateMessage: 'Este auditor aún no tiene sectores IAF vinculados en sector_iaf_auditor.',
          getRowAttrs: (item) =>
            `data-action="select-competencia-auditor" data-comp-tipo="sector_iaf" data-auditor-id="${escapeHtml(auditor.id)}" data-target-id="${escapeHtml(item.id_sector_iaf)}" title="Inspeccionar competencia Sector IAF ${item.sector_numero}"`,
        })}
      </div>

      <div class="space-y-1.5">
        <div class="flex items-center justify-between px-1">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-600">
            🧩 Sub-Sectores Técnicos IAF (${subsectorLinks.length})
          </h3>
        </div>
        ${renderListViewTable({
          tableId: 'auditor-tab-subsectores',
          columns: subsectorColumns,
          items: subsectorLinks,
          columnWidths: tableColumnWidths?.['auditor-tab-subsectores'],
          emptyStateTitle: 'Sin sub-sectores IAF asignados',
          emptyStateMessage:
            'Este auditor aún no tiene sub-sectores específicos vinculados en subsector_iaf_auditor.',
          getRowAttrs: (item) =>
            `data-action="select-competencia-auditor" data-comp-tipo="subsector_iaf" data-auditor-id="${escapeHtml(auditor.id)}" data-target-id="${escapeHtml(item.id_subsector_iaf)}" title="Inspeccionar competencia Sub-Sector ${escapeHtml(item.subsector_codigo)}"`,
        })}
      </div>
    </div>
  `;
}

/**
 * TAB 2: Contacto (telefono_auditor y email_auditor — paridad con expertoTecnicoView.ts)
 */
function renderContactoChildTab(params: {
  profile: UserProfile;
  auditor: AuditorDetailEntity;
  state: AuditorViewState;
  isStaff: boolean;
  authUserEmail?: string | null;
}): string {
  const { profile, auditor, state, isStaff, authUserEmail } = params;
  const activePhones = (auditor.telefonos || []).filter((t) => !t.deleted_at);
  const activeEmails = (auditor.emails || []).filter((e) => !e.deleted_at);

  const telDraft: AuditorTelefonoFormDraft =
    state.telefonoDraft ?? createEmptyAuditorTelefonoDraft();
  const emailDraft: AuditorEmailFormDraft =
    state.emailDraft ?? createEmptyAuditorEmailDraft();

  const authEmailNorm = (authUserEmail || '').trim().toLowerCase();

  return `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <!-- Panel Teléfonos -->
      <section class="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-3">
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-700">
            📞 Teléfonos (${activePhones.length})
          </h3>
          ${
            isStaff && !state.isAddingTelefono
              ? `
                <button
                  type="button"
                  data-action="open-add-auditor-telefono"
                  class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold cursor-pointer transition-colors"
                >
                  <span aria-hidden="true">+</span>
                  <span>Agregar Teléfono</span>
                </button>
              `
              : ''
          }
        </div>

        ${
          isStaff && state.isAddingTelefono
            ? `
              <form id="auditorTelefonoForm" class="bg-white border border-indigo-200 rounded-lg p-3 space-y-2.5" novalidate>
                ${
                  state.telefonoErrorMessage
                    ? `<div role="alert" class="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">⚠️ ${escapeHtml(state.telefonoErrorMessage)}</div>`
                    : ''
                }
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label for="audTelNumeroInput" class="block text-[11px] font-bold text-slate-700 mb-1">
                      Número Telefónico <span class="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      id="audTelNumeroInput"
                      name="telefono"
                      maxlength="${AUDITOR_TELEFONO_MAX_LENGTH}"
                      value="${escapeHtml(telDraft.telefono)}"
                      placeholder="Ej. +58 414 555-0101"
                      class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label for="audTelTipoSelect" class="block text-[11px] font-bold text-slate-700 mb-1">
                      Tipo
                    </label>
                    <select
                      id="audTelTipoSelect"
                      name="tipo_telefono"
                      class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
                    >
                      ${AUDITOR_TIPO_TELEFONO_OPTIONS.map(
                        (opt) => `
                          <option value="${escapeHtml(opt)}" ${telDraft.tipo_telefono === opt ? 'selected' : ''}>
                            ${escapeHtml(opt)}
                          </option>
                        `
                      ).join('')}
                    </select>
                  </div>
                </div>
                <label for="audTelPrincipalInput" class="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    id="audTelPrincipalInput"
                    name="es_principal"
                    ${telDraft.es_principal ? 'checked' : ''}
                    class="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                  />
                  <span>Marcar como teléfono principal</span>
                </label>
                <div class="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    data-action="cancel-add-auditor-telefono"
                    class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    id="saveAuditorTelefonoBtn"
                    class="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
                  >
                    Guardar Teléfono
                  </button>
                </div>
              </form>
            `
            : ''
        }

        ${
          activePhones.length === 0
            ? `<p class="text-xs text-slate-500 italic py-3">Sin teléfonos registrados para este auditor.</p>`
            : `
              <div class="space-y-2">
                ${activePhones
                  .map(
                    (tel) => `
                      <div class="bg-white border border-slate-200 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                        <div class="min-w-0">
                          <div class="flex items-center gap-1.5 flex-wrap">
                            <span class="text-xs font-bold text-slate-900 font-mono truncate">${escapeHtml(tel.telefono)}</span>
                            ${
                              tel.es_principal
                                ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">Principal</span>`
                                : ''
                            }
                          </div>
                          <div class="text-[11px] text-slate-500">${escapeHtml(tel.tipo_telefono)}</div>
                        </div>
                        ${
                          isStaff
                            ? `
                              <div class="flex items-center gap-1.5 shrink-0">
                                ${
                                  !tel.es_principal
                                    ? `
                                      <button
                                        type="button"
                                        data-action="set-primary-auditor-telefono"
                                        data-telefono-id="${escapeHtml(tel.id)}"
                                        aria-label="Marcar principal ${escapeHtml(tel.telefono)}"
                                        class="px-2 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold cursor-pointer transition-colors"
                                      >
                                        Principal
                                      </button>
                                    `
                                    : ''
                                }
                                <button
                                  type="button"
                                  data-action="archive-auditor-telefono"
                                  data-telefono-id="${escapeHtml(tel.id)}"
                                  aria-label="Archivar teléfono ${escapeHtml(tel.telefono)}"
                                  class="px-2.5 py-1 rounded-md border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-semibold cursor-pointer transition-colors"
                                >
                                  Archivar
                                </button>
                              </div>
                            `
                            : ''
                        }
                      </div>
                    `
                  )
                  .join('')}
              </div>
            `
        }
      </section>

      <!-- Panel Correos Electrónicos -->
      <section class="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-3">
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-700">
            ✉️ Correos Electrónicos (${activeEmails.length})
          </h3>
          ${
            isStaff && !state.isAddingEmail
              ? `
                <button
                  type="button"
                  data-action="open-add-auditor-email"
                  class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold cursor-pointer transition-colors"
                >
                  <span aria-hidden="true">+</span>
                  <span>Agregar Email</span>
                </button>
              `
              : ''
          }
        </div>

        ${
          isStaff && state.isAddingEmail
            ? `
              <form id="auditorEmailForm" class="bg-white border border-indigo-200 rounded-lg p-3 space-y-2.5" novalidate>
                ${
                  state.emailErrorMessage
                    ? `<div role="alert" class="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">⚠️ ${escapeHtml(state.emailErrorMessage)}</div>`
                    : ''
                }
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label for="audEmailInput" class="block text-[11px] font-bold text-slate-700 mb-1">
                      Correo Electrónico <span class="text-rose-600">*</span>
                    </label>
                    <input
                      type="email"
                      id="audEmailInput"
                      name="email"
                      maxlength="${AUDITOR_EMAIL_MAX_LENGTH}"
                      value="${escapeHtml(emailDraft.email)}"
                      placeholder="Ej. auditor@fondonorma.org"
                      class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label for="audEmailTipoSelect" class="block text-[11px] font-bold text-slate-700 mb-1">
                      Tipo
                    </label>
                    <select
                      id="audEmailTipoSelect"
                      name="tipo_email"
                      class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
                    >
                      ${AUDITOR_TIPO_EMAIL_OPTIONS.map(
                        (opt) => `
                          <option value="${escapeHtml(opt)}" ${emailDraft.tipo_email === opt ? 'selected' : ''}>
                            ${escapeHtml(opt)}
                          </option>
                        `
                      ).join('')}
                    </select>
                  </div>
                </div>
                <label for="audEmailPrincipalInput" class="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    id="audEmailPrincipalInput"
                    name="es_principal"
                    ${emailDraft.es_principal ? 'checked' : ''}
                    class="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                  />
                  <span>Marcar como correo principal</span>
                </label>
                <div class="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    data-action="cancel-add-auditor-email"
                    class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    id="saveAuditorEmailBtn"
                    class="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
                  >
                    Guardar Email
                  </button>
                </div>
              </form>
            `
            : ''
        }

        ${
          activeEmails.length === 0
            ? `<p class="text-xs text-slate-500 italic py-3">Sin correos electrónicos registrados para este auditor.</p>`
            : `
              <div class="space-y-2">
                ${activeEmails
                  .map((em) => {
                    const isAuthMatched =
                      (Boolean(authEmailNorm) &&
                        em.email.trim().toLowerCase() === authEmailNorm) ||
                      (auditor.id === profile.id && Boolean(em.es_principal));
                    return `
                      <div class="bg-white border border-slate-200 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                        <div class="min-w-0">
                          <div class="flex items-center gap-1.5 flex-wrap">
                            <span class="text-xs font-bold text-slate-900 truncate">${escapeHtml(em.email)}</span>
                            ${
                              em.es_principal
                                ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">Principal</span>`
                                : ''
                            }
                          </div>
                          <div class="text-[11px] text-slate-500">
                            ${escapeHtml(em.tipo_email)}${
                              isAuthMatched
                                ? ' · Correo vinculado al acceso Auth'
                                : em.es_principal
                                ? ' · Correo de notificación y referencia de acceso'
                                : ''
                            }
                          </div>
                        </div>
                        ${
                          isStaff
                            ? `
                              <div class="flex items-center gap-1.5 shrink-0">
                                ${
                                  !em.es_principal
                                    ? `
                                      <button
                                        type="button"
                                        data-action="set-primary-auditor-email"
                                        data-email-id="${escapeHtml(em.id)}"
                                        aria-label="Marcar principal ${escapeHtml(em.email)}"
                                        class="px-2 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold cursor-pointer transition-colors"
                                      >
                                        Principal
                                      </button>
                                    `
                                    : ''
                                }
                                <button
                                  type="button"
                                  data-action="archive-auditor-email"
                                  data-email-id="${escapeHtml(em.id)}"
                                  aria-label="Archivar correo ${escapeHtml(em.email)}"
                                  class="px-2.5 py-1 rounded-md border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-semibold cursor-pointer transition-colors"
                                >
                                  Archivar
                                </button>
                              </div>
                            `
                            : ''
                        }
                      </div>
                    `;
                  })
                  .join('')}
              </div>
            `
        }
      </section>
    </div>
  `;
}

/**
 * TAB 3: Evaluaciones In Situ (evaluacion_in_situ_auditor)
 */
function renderEvaluacionesChildTab(params: {
  auditor: AuditorDetailEntity;
  state: AuditorViewState;
  isStaff: boolean;
}): string {
  const { auditor, state, isStaff } = params;
  const evaluaciones = sortEvaluacionesInSituChronological(auditor.evaluaciones_in_situ);
  const status = evaluateAuditorInSituStatus(auditor);
  const statusVisual = getAuditorInSituStatusVisual(status);
  const evalDraft: EvaluacionInSituFormDraft =
    state.evaluacionDraft ?? createEmptyEvaluacionInSituDraft();

  return `
    <div class="space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2 pb-1">
        <div class="flex flex-wrap items-center gap-2 min-w-0">
          <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${statusVisual.badgeClass}">
            <span class="w-1.5 h-1.5 rounded-full ${statusVisual.dotClass}"></span>
            <span>Estado vigente: ${escapeHtml(statusVisual.label)}</span>
          </span>
          <p class="text-xs text-slate-500">
            Historial cronológico de evaluaciones in situ registradas para este auditor.
          </p>
        </div>
        ${
          isStaff
            ? `
              <div class="flex flex-wrap items-center gap-2 shrink-0">
                ${
                  !auditor.sin_registro_evaluacion
                    ? `
                      <button
                        type="button"
                        data-action="toggle-auditor-sin-registro"
                        data-auditor-id="${escapeHtml(auditor.id)}"
                        class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer transition-colors"
                      >
                        <span>Marcar como S/R</span>
                      </button>
                    `
                    : ''
                }
                ${
                  !state.isAddingEvaluacion
                    ? `
                      <button
                        type="button"
                        data-action="open-add-auditor-evaluacion"
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                      >
                        <span aria-hidden="true">+</span>
                        <span>Registrar Evaluación</span>
                      </button>
                    `
                    : ''
                }
              </div>
            `
            : ''
        }
      </div>

      ${
        isStaff && state.isAddingEvaluacion
          ? `
            <form id="auditorEvaluacionForm" class="bg-slate-50 border border-indigo-200 rounded-xl p-4 space-y-3" novalidate>
              <div class="flex items-center justify-between gap-2">
                <h4 class="text-xs font-bold text-slate-900">Nueva Evaluación In Situ</h4>
                <button
                  type="button"
                  data-action="cancel-add-auditor-evaluacion"
                  class="text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
              ${
                state.evaluacionErrorMessage
                  ? `<div role="alert" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">⚠️ ${escapeHtml(state.evaluacionErrorMessage)}</div>`
                  : ''
              }
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                <div>
                  <label for="audEvalPeriodoInput" class="block text-[11px] font-bold text-slate-700 mb-1">
                    Período / Etiqueta
                  </label>
                  <input
                    type="text"
                    id="audEvalPeriodoInput"
                    name="etiqueta_periodo"
                    value="${escapeHtml(evalDraft.etiqueta_periodo)}"
                    placeholder="Ej. Evaluación 2 (nov-24)"
                    class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label for="audEvalNormaInput" class="block text-[11px] font-bold text-slate-700 mb-1">
                    Norma de Referencia
                  </label>
                  <input
                    type="text"
                    id="audEvalNormaInput"
                    name="norma_referencia"
                    value="${escapeHtml(evalDraft.norma_referencia)}"
                    placeholder="Ej. ISO 9001:2015"
                    class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label for="audEvalSectorInput" class="block text-[11px] font-bold text-slate-700 mb-1">
                    Sector / Área Evaluada
                  </label>
                  <input
                    type="text"
                    id="audEvalSectorInput"
                    name="sector_area_evaluado"
                    value="${escapeHtml(evalDraft.sector_area_evaluado)}"
                    placeholder="Ej. Sector 17 / 17.1"
                    class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label for="audEvalUltFechaInput" class="block text-[11px] font-bold text-slate-700 mb-1">
                    Última Evaluación (Fecha)
                  </label>
                  <input
                    type="date"
                    id="audEvalUltFechaInput"
                    name="ultima_evaluacion_fecha"
                    value="${escapeHtml(evalDraft.ultima_evaluacion_fecha || '')}"
                    class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label for="audEvalProxFechaInput" class="block text-[11px] font-bold text-slate-700 mb-1">
                    Próxima Evaluación (Fecha)
                  </label>
                  <input
                    type="date"
                    id="audEvalProxFechaInput"
                    name="proxima_evaluacion_fecha"
                    value="${escapeHtml(evalDraft.proxima_evaluacion_fecha || '')}"
                    class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label for="audEvalUltTextoInput" class="block text-[11px] font-bold text-slate-700 mb-1">
                    Texto Última / Próxima (Opcional)
                  </label>
                  <div class="grid grid-cols-2 gap-1.5">
                    <input
                      type="text"
                      id="audEvalUltTextoInput"
                      name="ultima_evaluacion_texto"
                      value="${escapeHtml(evalDraft.ultima_evaluacion_texto)}"
                      placeholder="nov-24"
                      class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
                    />
                    <input
                      type="text"
                      id="audEvalProxTextoInput"
                      name="proxima_evaluacion_texto"
                      value="${escapeHtml(evalDraft.proxima_evaluacion_texto)}"
                      placeholder="nov-27"
                      class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                </div>
                <div class="sm:col-span-2 lg:col-span-3">
                  <label for="audEvalObsInput" class="block text-[11px] font-bold text-slate-700 mb-1">
                    Observaciones
                  </label>
                  <textarea
                    id="audEvalObsInput"
                    name="observaciones"
                    rows="2"
                    placeholder="Comentarios de desempeño en campo, testigos o recomendaciones..."
                    class="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:border-slate-900 focus:outline-none"
                  >${escapeHtml(evalDraft.observaciones)}</textarea>
                </div>
              </div>
              <div class="flex items-center justify-end gap-2">
                <button
                  type="button"
                  data-action="cancel-add-auditor-evaluacion"
                  class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  id="saveAuditorEvaluacionBtn"
                  class="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
                >
                  Guardar Evaluación
                </button>
              </div>
            </form>
          `
          : ''
      }

      ${
        evaluaciones.length === 0
          ? `
            <div class="p-8 text-center text-slate-500 text-xs bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <span class="text-2xl block" aria-hidden="true">🩺</span>
              <p class="font-bold text-slate-800">Sin evaluaciones in situ registradas</p>
              <p class="text-slate-500">
                ${
                  isStaff
                    ? 'Utilice "+ Registrar Evaluación" para documentar evaluaciones de testigo en campo y actualizar la vigencia del auditor.'
                    : 'Este auditor no registra evaluaciones in situ activas.'
                }
              </p>
            </div>
          `
          : `
            <div class="space-y-2.5">
              ${evaluaciones
                .map((ev: EvaluacionInSituAuditorEntity) => {
                  const ultDisplay =
                    formatEvaluationSummaryValue(ev.ultima_evaluacion_texto, ev.ultima_evaluacion_fecha) ||
                    'Sin fecha';
                  const proxDisplay =
                    formatEvaluationSummaryValue(ev.proxima_evaluacion_texto, ev.proxima_evaluacion_fecha) ||
                    'Sin programar';
                  return `
                    <article class="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div class="space-y-1.5 min-w-0 flex-1">
                        <div class="flex flex-wrap items-center gap-2">
                          <h4 class="text-xs font-bold text-slate-900">
                            ${escapeHtml(ev.etiqueta_periodo || 'Evaluación In Situ')}
                          </h4>
                          ${
                            ev.norma_referencia
                              ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">${escapeHtml(ev.norma_referencia)}</span>`
                              : ''
                          }
                          ${
                            ev.sector_area_evaluado
                              ? `<span class="px-2 py-0.5 rounded font-mono text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">Sector ${escapeHtml(ev.sector_area_evaluado)}</span>`
                              : ''
                          }
                        </div>
                        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
                          <span><strong>Última:</strong> <span class="font-mono">${escapeHtml(ultDisplay)}</span></span>
                          <span><strong>Próxima:</strong> <span class="font-mono">${escapeHtml(proxDisplay)}</span></span>
                        </div>
                        ${
                          ev.observaciones
                            ? `<p class="text-xs text-slate-600 leading-relaxed">${escapeHtml(ev.observaciones)}</p>`
                            : ''
                        }
                      </div>
                      ${
                        isStaff
                          ? `
                            <button
                              type="button"
                              data-action="archive-auditor-evaluacion"
                              data-evaluacion-id="${escapeHtml(ev.id)}"
                              aria-label="Archivar evaluación ${escapeHtml(ev.etiqueta_periodo || ultDisplay)}"
                              class="px-2.5 py-1 rounded-md border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-semibold cursor-pointer shrink-0 transition-colors self-start"
                            >
                              Archivar
                            </button>
                          `
                          : ''
                      }
                    </article>
                  `;
                })
                .join('')}
            </div>
          `
      }
    </div>
  `;
}

/**
 * TAB 4: Historial de Auditorías Realizadas (public.auditoria)
 */
function renderHistorialChildTab(
  historial: AuditoriaRealizadaEntity[],
  tableColumnWidths?: Record<string, Record<string, number>>
): string {
  if (historial.length === 0) {
    return `
      <div class="p-8 text-center text-slate-500 text-xs bg-slate-50 rounded-xl border border-slate-200 space-y-2">
        <span class="text-2xl block" aria-hidden="true">📋</span>
        <p class="font-bold text-slate-800">Sin historial de auditorías ejecutadas</p>
        <p class="text-slate-500">Este auditor aún no ha participado en jornadas de auditoría registradas en el sistema.</p>
      </div>
    `;
  }

  const columns: ColumnDefinition<AuditoriaRealizadaEntity>[] = [
    {
      id: 'codigo_auditoria',
      header: 'Auditoría',
      defaultWidthPct: 18,
      minWidthPx: 110,
      renderCell: (aud) => {
        const codenameInput = {
          codigo_auditoria: aud.codigo_auditoria,
          tipo_auditoria: aud.tipo_auditoria,
          fecha_inicio: aud.fecha_ejecucion,
        };
        return `
        <span class="font-mono font-bold text-slate-900 inline-flex items-center gap-1.5" title="${escapeHtml(
          getAuditCodenameTooltip(codenameInput)
        )}">
          <span aria-hidden="true">📋</span>
          <span class="truncate">${escapeHtml(formatAuditCodename(codenameInput))}</span>
        </span>
      `;
      },
    },
    {
      id: 'organizacion_nombre',
      header: 'Organización Cliente',
      defaultWidthPct: 24,
      minWidthPx: 140,
      renderCell: (aud) =>
        `<span class="font-bold text-slate-800 truncate block" title="${escapeHtml(
          aud.organizacion_nombre
        )}">${escapeHtml(resolveShortOrganizacionName({ nombre: aud.organizacion_nombre }))}</span>`,
    },
    {
      id: 'numero_certificado',
      header: 'Certificado',
      defaultWidthPct: 16,
      minWidthPx: 110,
      renderCell: (aud) =>
        `<span class="font-mono font-semibold text-slate-700">${escapeHtml(aud.numero_certificado)}</span>`,
    },
    {
      id: 'modalidad',
      header: 'Modalidad',
      defaultWidthPct: 15,
      minWidthPx: 110,
      renderCell: (aud) =>
        `<span class="text-slate-700">${escapeHtml(aud.tipo_auditoria)} · ${escapeHtml(aud.metodologia)}</span>`,
    },
    {
      id: 'rol_en_auditoria',
      header: 'Rol',
      defaultWidthPct: 11,
      minWidthPx: 90,
      renderCell: (aud) =>
        `<span class="font-medium text-indigo-700">${escapeHtml(aud.rol_en_auditoria)}</span>`,
    },
    {
      id: 'fecha_ejecucion',
      header: 'Fecha',
      defaultWidthPct: 8,
      minWidthPx: 85,
      renderCell: (aud) =>
        `<span class="font-mono text-[11px] text-slate-600 tabular-nums">${escapeHtml(aud.fecha_ejecucion || '—')}</span>`,
    },
    {
      id: 'estatus',
      header: 'Estatus',
      align: 'center',
      defaultWidthPct: 8,
      minWidthPx: 85,
      renderCell: (aud) => {
        const isCompleted = aud.estatus === 'Completada' || aud.estatus === 'Cerrada';
        return `
          <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
            isCompleted
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-indigo-50 text-indigo-800 border-indigo-200'
          }">
            <span>${escapeHtml(aud.estatus)}</span>
          </span>
        `;
      },
    },
  ];

  return renderListViewTable({
    tableId: 'auditor-tab-historial',
    columns,
    items: historial,
    columnWidths: tableColumnWidths?.['auditor-tab-historial'],
    getRowAttrs: (aud) =>
      `data-action="select-prog-audit-by-code" data-audit-id="${escapeHtml(aud.id)}" data-audit-code="${escapeHtml(aud.codigo_auditoria)}" title="Abrir auditoría ${escapeHtml(aud.codigo_auditoria)}"`,
  });
}
