import { isApprovedStaffProfile } from '../lib/accessControl';
import type { OrganizacionEntity } from '../lib/activeCertificates';
import {
  getEligibleShareTargetCertificates,
  planShareContactos,
  planShareTurnos,
  type EligibleShareTargetCertificate,
  type PlanShareContactosResult,
  type PlanShareTurnosResult,
} from '../lib/certificadoShareDomain';
import type { ConglomeradoEntity } from '../lib/conglomeradoDomain';
import type { RequisitoLtree } from '../lib/extraDomain';
import type { UserProfile } from '../lib/healthCheck';
import { escapeHtml } from '../lib/html';
import {
  getProcessTypeVisual,
  sortSitesWithPrincipalFirst,
  type CertificadoDetailEntity,
  type ContactoCertificadoEntity,
  type ProcessEntity,
  type ShiftEntity,
  type SiteEntity,
} from '../lib/multisiteSampling';
import {
  buildFinalTargetRequisitoIds,
  resolveProcesoClausesForTargetCert,
  type ClauseResolutionEntry,
  type ProcesoTargetClauseResolutionPlan,
} from '../lib/procesoClauseResolver';
import { getAllSeededNormaRequirements } from '../lib/procesoDomain';
import {
  planShareSitiosWithCascade,
  resolveTargetNumeroSitioForSharedSite,
  type ResolveTargetNumeroSitioResult,
  type SitioShareExecutionPlan,
} from '../lib/sitioShareDomain';
import { formatTurnoTime } from '../lib/turnoDomain';

export type ShareModalKind = 'contacto' | 'turno' | 'proceso' | 'sitio';

export interface ShareModalState {
  isOpen: boolean;
  kind: ShareModalKind;
  sourceCertId: string;
  selectedItemIds: string[];
  selectedTargetCertIds: string[];
  autoLinkTargetSites: boolean;
  clauseSelectionsByPairKey?: Record<string, Record<string, string[]>>;
  siteCascadeTurnoIdsBySite?: Record<string, string[]>;
  siteCascadeProcesoIdsBySite?: Record<string, string[]>;
  cascadeSectionExpanded?: boolean;
  submitting: boolean;
  errorMessage: string | null;
}

export interface ShareModalViewProps {
  profile: UserProfile | null;
  modalState: ShareModalState;
  certificates: ReadonlyArray<CertificadoDetailEntity>;
  organizaciones: ReadonlyArray<OrganizacionEntity>;
  conglomerados: ReadonlyArray<ConglomeradoEntity>;
  authorizedClientOrgIds?: ReadonlyArray<string>;
  archivedContactoIds?: ReadonlySet<string>;
  archivedTurnoIds?: ReadonlySet<string>;
  archivedSiteIds?: ReadonlySet<string>;
  archivedProcesoIds?: ReadonlySet<string>;
  archivedNoAplicableIds?: ReadonlySet<string>;
  requirementsCatalog?: ReadonlyArray<RequisitoLtree>;
}

export interface PlannedProcesoShareItem {
  proceso: ProcessEntity;
  sourceCert: CertificadoDetailEntity;
  targetCert: CertificadoDetailEntity;
  resolutionPlan: ProcesoTargetClauseResolutionPlan;
  finalRequisitoIds: string[];
}

export function createInitialShareModalState(
  kind: ShareModalKind,
  sourceCertId: string,
  preselectedItemIds: ReadonlyArray<string> = []
): ShareModalState {
  return {
    isOpen: Boolean(sourceCertId.trim()),
    kind,
    sourceCertId: sourceCertId.trim(),
    selectedItemIds: preselectedItemIds.filter((id) => Boolean(id.trim())),
    selectedTargetCertIds: [],
    autoLinkTargetSites: true,
    clauseSelectionsByPairKey: {},
    siteCascadeTurnoIdsBySite: {},
    siteCascadeProcesoIdsBySite: {},
    cascadeSectionExpanded: true,
    submitting: false,
    errorMessage: null,
  };
}

export function makeShareClausePairKey(procesoId: string, targetCertId: string): string {
  return `${procesoId.trim()}::${targetCertId.trim()}`;
}

export function resolveSelectedTargetReqIdsForEntry(
  entry: ClauseResolutionEntry,
  pairSelections?: Readonly<Record<string, string[]>>
): string[] {
  if (entry.disabled) return [];
  if (pairSelections && Object.prototype.hasOwnProperty.call(pairSelections, entry.entryKey)) {
    return (pairSelections[entry.entryKey] || []).filter((id) => Boolean(id.trim()));
  }
  if (entry.preselected && entry.targetCandidate) {
    return [entry.targetCandidate.id];
  }
  return [];
}

export function buildSelectedMapForResolutionPlan(
  plan: ProcesoTargetClauseResolutionPlan,
  clauseSelectionsByPairKey?: Readonly<Record<string, Record<string, string[]>>>
): Record<string, string[]> {
  const pairKey = makeShareClausePairKey(plan.procesoId, plan.targetCertId);
  const pairSelections = clauseSelectionsByPairKey?.[pairKey];
  const out: Record<string, string[]> = {};
  for (const entry of plan.entries) {
    out[entry.entryKey] = resolveSelectedTargetReqIdsForEntry(entry, pairSelections);
  }
  return out;
}

export function getActiveLinkedTurnosForSite(
  site: SiteEntity,
  sourceCert: CertificadoDetailEntity,
  archivedTurnoIds?: ReadonlySet<string>
): ShiftEntity[] {
  const activeCertTurnos = (sourceCert.turnos || []).filter(
    (t) => !archivedTurnoIds?.has(t.id)
  );
  const byId = new Map<string, ShiftEntity>(activeCertTurnos.map((t) => [t.id, t]));
  const matched: ShiftEntity[] = [];
  const seen = new Set<string>();

  for (const link of site.turnos_por_sitio || []) {
    if (link.deleted_at || archivedTurnoIds?.has(link.id_turno)) continue;
    if (seen.has(link.id_turno)) continue;
    const found = byId.get(link.id_turno);
    if (found) {
      seen.add(found.id);
      matched.push(found);
    }
  }

  const normalizedSiteName = site.nombre_sitio.trim().toLowerCase();
  for (const shift of activeCertTurnos) {
    if (seen.has(shift.id)) continue;
    const matchesByName = (shift.sitios_vinculados || []).some(
      (label) => label.trim().toLowerCase() === normalizedSiteName
    );
    if (matchesByName) {
      seen.add(shift.id);
      matched.push(shift);
    }
  }

  return matched;
}

export function getActiveLinkedProcesosForSite(
  site: SiteEntity,
  sourceCert: CertificadoDetailEntity,
  archivedProcesoIds?: ReadonlySet<string>
): ProcessEntity[] {
  const activeCertProcesos = (sourceCert.procesos || []).filter(
    (p) => !archivedProcesoIds?.has(p.id)
  );
  const byId = new Map<string, ProcessEntity>(activeCertProcesos.map((p) => [p.id, p]));
  const matched: ProcessEntity[] = [];
  const seen = new Set<string>();

  for (const link of site.procesos_por_sitio || []) {
    if (link.deleted_at || archivedProcesoIds?.has(link.id_proceso)) continue;
    if (link.id_certificado && link.id_certificado !== sourceCert.id) continue;
    if (seen.has(link.id_proceso)) continue;
    const found = byId.get(link.id_proceso);
    if (found) {
      seen.add(found.id);
      matched.push(found);
    }
  }

  const labelSet = new Set(
    (site.procesos_vinculados || []).map((label) => label.trim().toLowerCase()).filter(Boolean)
  );
  if (labelSet.size > 0) {
    for (const proc of activeCertProcesos) {
      if (seen.has(proc.id)) continue;
      if (labelSet.has(proc.id.toLowerCase()) || labelSet.has(proc.nombre_proceso.trim().toLowerCase())) {
        seen.add(proc.id);
        matched.push(proc);
      }
    }
  }

  return matched;
}

export function getEffectiveSiteCascadeTurnoIdsForSite(
  site: SiteEntity,
  sourceCert: CertificadoDetailEntity,
  modalState: ShareModalState,
  archivedTurnoIds?: ReadonlySet<string>
): string[] {
  const linked = getActiveLinkedTurnosForSite(site, sourceCert, archivedTurnoIds);
  const validSet = new Set(linked.map((t) => t.id));
  const map = modalState.siteCascadeTurnoIdsBySite;
  if (map && Object.prototype.hasOwnProperty.call(map, site.id)) {
    return (map[site.id] || []).filter((id) => validSet.has(id));
  }
  return linked.map((t) => t.id);
}

export function getEffectiveSiteCascadeProcesoIdsForSite(
  site: SiteEntity,
  sourceCert: CertificadoDetailEntity,
  modalState: ShareModalState,
  archivedProcesoIds?: ReadonlySet<string>
): string[] {
  const linked = getActiveLinkedProcesosForSite(site, sourceCert, archivedProcesoIds);
  const validSet = new Set(linked.map((p) => p.id));
  const map = modalState.siteCascadeProcesoIdsBySite;
  if (map && Object.prototype.hasOwnProperty.call(map, site.id)) {
    return (map[site.id] || []).filter((id) => validSet.has(id));
  }
  return [];
}

function getStatusChipClass(status: string): string {
  const norm = (status || '').trim().toUpperCase();
  if (norm === 'ACTIVO' || norm === 'VIGENTE') {
    return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  }
  if (norm === 'ESTUDIO' || norm === 'EN_PROCESO') {
    return 'bg-sky-50 text-sky-800 border-sky-200';
  }
  if (norm === 'SUSPENDIDO') {
    return 'bg-amber-50 text-amber-800 border-amber-200';
  }
  if (norm === 'CANCELADO' || norm === 'INACTIVO') {
    return 'bg-rose-50 text-rose-800 border-rose-200';
  }
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function formatContactoChannelSummary(c: ContactoCertificadoEntity): string {
  const parts: string[] = [];
  if (c.telefonos.length > 0) {
    parts.push(`${c.telefonos.length} tel.`);
  }
  if (c.emails.length > 0) {
    parts.push(`${c.emails.length} correo${c.emails.length === 1 ? '' : 's'}`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'Sin canales registrados';
}

function isContactLinkedToTargetCert(
  contact: ContactoCertificadoEntity,
  targetCert: CertificadoDetailEntity | undefined
): boolean {
  if (!targetCert) return false;
  if ((targetCert.contactos || []).some((tc) => tc.id === contact.id)) {
    return true;
  }
  return (contact.sharedTargets || []).some((st) => st.targetCertId === targetCert.id);
}

function isShiftLinkedToTargetCert(
  shift: ShiftEntity,
  targetCert: CertificadoDetailEntity | undefined
): boolean {
  if (!targetCert) return false;
  if ((targetCert.turnos || []).some((tt) => tt.id === shift.id)) {
    return true;
  }
  return (shift.sharedTargets || []).some((st) => st.targetCertId === targetCert.id);
}

function isProcesoLinkedToTargetCert(
  proc: ProcessEntity,
  targetCert: CertificadoDetailEntity | undefined
): boolean {
  if (!targetCert) return false;
  if ((targetCert.procesos || []).some((tp) => tp.id === proc.id)) {
    return true;
  }
  return (proc.sharedTargets || []).some((st) => st.targetCertId === targetCert.id);
}

function isSiteLinkedToTargetCert(
  site: SiteEntity,
  targetCert: CertificadoDetailEntity | undefined
): boolean {
  if (!targetCert) return false;
  if ((targetCert.sitios || []).some((ts) => ts.id === site.id)) {
    return true;
  }
  return (site.sharedTargets || []).some((st) => st.targetCertId === targetCert.id);
}

function renderContactoItemsStep(params: {
  items: ReadonlyArray<ContactoCertificadoEntity>;
  selectedIds: ReadonlySet<string>;
  submitting: boolean;
}): string {
  const { items, selectedIds, submitting } = params;
  if (items.length === 0) {
    return `
      <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-600">
        Este certificado no tiene contactos activos disponibles para compartir.
      </div>
    `;
  }

  return `
    <div class="space-y-1.5 max-h-52 overflow-y-auto pr-1">
      ${items
        .map((c) => {
          const checked = selectedIds.has(c.id);
          const cargoLabel = c.cargo?.trim() || 'Sin cargo especificado';
          const channelSummary = formatContactoChannelSummary(c);
          const alreadySharedCount = c.sharedTargets?.length ?? 0;
          return `
            <label class="flex items-start justify-between gap-3 p-2.5 rounded-xl border transition-colors cursor-pointer ${
              checked
                ? 'border-indigo-300 bg-indigo-50/50'
                : 'border-slate-200 bg-white hover:bg-slate-50'
            }">
              <div class="flex items-start gap-2.5 min-w-0">
                <input
                  type="checkbox"
                  data-action="toggle-share-item"
                  data-item-id="${escapeHtml(c.id)}"
                  ${checked ? 'checked' : ''}
                  ${submitting ? 'disabled' : ''}
                  class="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                />
                <div class="min-w-0 space-y-0.5">
                  <div class="text-xs font-bold text-slate-900 truncate" title="${escapeHtml(c.nombre)}">
                    ${escapeHtml(c.nombre)}
                  </div>
                  <div class="text-[11px] text-slate-600 truncate">
                    ${escapeHtml(cargoLabel)} · ${escapeHtml(channelSummary)}
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                ${
                  c.sharedFromCertId
                    ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">Vinculado</span>`
                    : alreadySharedCount > 0
                    ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 tabular-nums">Compartido (${alreadySharedCount})</span>`
                    : ''
                }
              </div>
            </label>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderTurnoItemsStep(params: {
  items: ReadonlyArray<ShiftEntity>;
  selectedIds: ReadonlySet<string>;
  submitting: boolean;
}): string {
  const { items, selectedIds, submitting } = params;
  if (items.length === 0) {
    return `
      <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-600">
        Este certificado no tiene turnos operativos activos disponibles para compartir.
      </div>
    `;
  }

  return `
    <div class="space-y-1.5 max-h-52 overflow-y-auto pr-1">
      ${items
        .map((t) => {
          const checked = selectedIds.has(t.id);
          const timeRange = `${formatTurnoTime(t.hora_entrada)} – ${formatTurnoTime(t.hora_salida)}`;
          const sitesCount = t.sitios_vinculados.length;
          const alreadySharedCount = t.sharedTargets?.length ?? 0;
          return `
            <label class="flex items-start justify-between gap-3 p-2.5 rounded-xl border transition-colors cursor-pointer ${
              checked
                ? 'border-indigo-300 bg-indigo-50/50'
                : 'border-slate-200 bg-white hover:bg-slate-50'
            }">
              <div class="flex items-start gap-2.5 min-w-0">
                <input
                  type="checkbox"
                  data-action="toggle-share-item"
                  data-item-id="${escapeHtml(t.id)}"
                  ${checked ? 'checked' : ''}
                  ${submitting ? 'disabled' : ''}
                  class="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                />
                <div class="min-w-0 space-y-0.5">
                  <div class="text-xs font-bold text-slate-900 truncate" title="${escapeHtml(t.descripcion)}">
                    ${escapeHtml(t.descripcion)}
                  </div>
                  <div class="text-[11px] font-mono text-indigo-700 tabular-nums">
                    ${escapeHtml(timeRange)}
                    <span class="font-sans text-slate-500"> · ${sitesCount} sede${sitesCount === 1 ? '' : 's'}</span>
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                ${
                  t.sharedFromCertId
                    ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">Vinculado</span>`
                    : alreadySharedCount > 0
                    ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 tabular-nums">Compartido (${alreadySharedCount})</span>`
                    : ''
                }
              </div>
            </label>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderProcesoItemsStep(params: {
  items: ReadonlyArray<ProcessEntity>;
  selectedIds: ReadonlySet<string>;
  submitting: boolean;
}): string {
  const { items, selectedIds, submitting } = params;
  if (items.length === 0) {
    return `
      <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-600">
        Este certificado no tiene procesos activos disponibles para compartir.
      </div>
    `;
  }

  return `
    <div class="space-y-1.5 max-h-52 overflow-y-auto pr-1">
      ${items
        .map((p) => {
          const checked = selectedIds.has(p.id);
          const visual = getProcessTypeVisual(p.tipo);
          const clausesCount =
            p.requisitos_detalle && p.requisitos_detalle.length > 0
              ? p.requisitos_detalle.length
              : p.clausulas_cubiertas.length;
          const clausePreview =
            p.requisitos_detalle && p.requisitos_detalle.length > 0
              ? p.requisitos_detalle.map((r) => r.codigo).join(', ')
              : p.clausulas_cubiertas.join(', ');
          const alreadySharedCount = p.sharedTargets?.length ?? 0;

          return `
            <label class="flex items-start justify-between gap-3 p-2.5 rounded-xl border transition-colors cursor-pointer ${
              checked
                ? 'border-indigo-300 bg-indigo-50/50'
                : 'border-slate-200 bg-white hover:bg-slate-50'
            }">
              <div class="flex items-start gap-2.5 min-w-0">
                <input
                  type="checkbox"
                  data-action="toggle-share-item"
                  data-item-id="${escapeHtml(p.id)}"
                  ${checked ? 'checked' : ''}
                  ${submitting ? 'disabled' : ''}
                  class="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                />
                <div class="min-w-0 space-y-0.5">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span class="text-xs font-bold text-slate-900 truncate" title="${escapeHtml(p.nombre_proceso)}">
                      ${escapeHtml(p.nombre_proceso)}
                    </span>
                    <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${visual.badgeClass}">
                      ${escapeHtml(visual.label)}
                    </span>
                  </div>
                  <div class="text-[11px] text-slate-600 truncate" title="${escapeHtml(clausePreview)}">
                    ${clausesCount} cláusula${clausesCount === 1 ? '' : 's'}${clausePreview ? ` (${escapeHtml(clausePreview)})` : ''}
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                ${
                  p.sharedFromCertId
                    ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">Vinculado</span>`
                    : alreadySharedCount > 0
                    ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 tabular-nums">Compartido (${alreadySharedCount})</span>`
                    : ''
                }
              </div>
            </label>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderSitioItemsStep(params: {
  items: ReadonlyArray<SiteEntity>;
  selectedIds: ReadonlySet<string>;
  submitting: boolean;
}): string {
  const { items, selectedIds, submitting } = params;
  if (items.length === 0) {
    return `
      <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-600">
        Este certificado no tiene sitios activos disponibles para compartir.
      </div>
    `;
  }

  const ordered = sortSitesWithPrincipalFirst([...items]);
  return `
    <div class="space-y-1.5 max-h-52 overflow-y-auto pr-1">
      ${ordered
        .map((s) => {
          const checked = selectedIds.has(s.id);
          const isHq = s.numero_sitio === 0;
          const alreadySharedCount = s.sharedTargets?.length ?? 0;
          return `
            <label class="flex items-start justify-between gap-3 p-2.5 rounded-xl border transition-colors cursor-pointer ${
              checked
                ? 'border-indigo-300 bg-indigo-50/50'
                : 'border-slate-200 bg-white hover:bg-slate-50'
            }">
              <div class="flex items-start gap-2.5 min-w-0">
                <input
                  type="checkbox"
                  data-action="toggle-share-item"
                  data-item-id="${escapeHtml(s.id)}"
                  ${checked ? 'checked' : ''}
                  ${submitting ? 'disabled' : ''}
                  class="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                />
                <div class="min-w-0 space-y-0.5">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span class="inline-flex items-center px-1.5 py-0.5 rounded font-mono text-[10px] font-bold ${
                      isHq
                        ? 'bg-amber-50 text-amber-900 border border-amber-300'
                        : 'bg-slate-100 text-slate-800 border border-slate-200'
                    }">
                      ${isHq ? 'Sitio 0 (HQ)' : `Sede #${s.numero_sitio}`}
                    </span>
                    <span class="text-xs font-bold text-slate-900 truncate" title="${escapeHtml(s.nombre_sitio)}">
                      ${escapeHtml(s.nombre_sitio)}
                    </span>
                  </div>
                  <div class="text-[11px] text-slate-600 truncate" title="${escapeHtml(s.direccion_sitio)}">
                    ${escapeHtml(s.direccion_sitio)}${
                      s.personal_count !== undefined
                        ? ` · ${s.personal_count} persona${s.personal_count === 1 ? '' : 's'}`
                        : ''
                    }
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                ${
                  s.sharedFromCertId
                    ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">Vinculado</span>`
                    : alreadySharedCount > 0
                    ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 tabular-nums">Compartido (${alreadySharedCount})</span>`
                    : ''
                }
              </div>
            </label>
          `;
        })
        .join('')}
    </div>
  `;
}

function formatSiteTargetPreviewLabel(
  site: SiteEntity,
  targetCertNumero: string,
  res: ResolveTargetNumeroSitioResult
): string {
  if (!res.allowed || res.assignedNumeroSitio === null) {
    return `${site.nombre_sitio}: ${res.reason || 'Ya vinculado o no elegible en destino'}`;
  }
  if (res.assignedNumeroSitio === 0) {
    return `${site.nombre_sitio}: Se asignará como Sitio 0 (HQ) (destino sin sede principal)`;
  }
  if (res.targetHasSitio0 && res.autoRenumbered) {
    return `${site.nombre_sitio}: Se asignará como Sede #${res.assignedNumeroSitio} porque ${targetCertNumero} ya tiene Sitio 0`;
  }
  return `${site.nombre_sitio}: Se asignará como Sede #${res.assignedNumeroSitio}`;
}

function renderTargetCertificatesStep(params: {
  targets: ReadonlyArray<EligibleShareTargetCertificate>;
  selectedTargetIds: ReadonlySet<string>;
  alreadyLinkedByTargetId: ReadonlyMap<string, { anyLinked: boolean; allLinked: boolean }>;
  duplicateConflictByTargetId: ReadonlyMap<string, string[]>;
  siteNumeroPreviewsByTargetId?: ReadonlyMap<string, string[]>;
  missingConglomeradoReason: string | null;
  sourceGroupNombre: string | null;
  submitting: boolean;
}): string {
  const {
    targets,
    selectedTargetIds,
    alreadyLinkedByTargetId,
    duplicateConflictByTargetId,
    siteNumeroPreviewsByTargetId,
    missingConglomeradoReason,
    sourceGroupNombre,
    submitting,
  } = params;

  if (missingConglomeradoReason) {
    return `
      <div class="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900 space-y-1">
        <div class="font-bold">Compartición no disponible</div>
        <p class="leading-relaxed">${escapeHtml(missingConglomeradoReason)}</p>
      </div>
    `;
  }

  if (targets.length === 0) {
    return `
      <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 space-y-1">
        <div class="font-bold text-slate-900">Sin certificados destino disponibles en el conglomerado</div>
        <p class="leading-relaxed">
          ${
            sourceGroupNombre
              ? `El conglomerado <strong>${escapeHtml(sourceGroupNombre)}</strong> solo tiene actualmente este certificado activo. Agregue otro certificado al mismo conglomerado para compartir registros.`
              : 'No existen otros certificados activos elegibles dentro del mismo conglomerado.'
          }
        </p>
      </div>
    `;
  }

  return `
    <div class="space-y-1.5 max-h-60 overflow-y-auto pr-1">
      ${targets
        .map((target) => {
          const checked = selectedTargetIds.has(target.id);
          const linkedInfo = alreadyLinkedByTargetId.get(target.id);
          const targetConflicts = duplicateConflictByTargetId.get(target.id) || [];
          const hasConflict = targetConflicts.length > 0;
          const statusClass = getStatusChipClass(target.estatus);
          const numeroPreviews = siteNumeroPreviewsByTargetId?.get(target.id) || [];
          return `
            <label class="block p-2.5 rounded-xl border transition-colors cursor-pointer ${
              hasConflict
                ? 'border-rose-300 bg-rose-50/60'
                : checked
                ? 'border-indigo-300 bg-indigo-50/50'
                : 'border-slate-200 bg-white hover:bg-slate-50'
            }">
              <div class="flex items-start justify-between gap-3">
                <div class="flex items-start gap-2.5 min-w-0">
                  <input
                    type="checkbox"
                    data-action="toggle-share-target"
                    data-cert-id="${escapeHtml(target.id)}"
                    ${checked ? 'checked' : ''}
                    ${submitting ? 'disabled' : ''}
                    class="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                  />
                  <div class="min-w-0 space-y-0.5">
                    <div class="flex flex-wrap items-center gap-1.5">
                      <span class="font-mono text-xs font-bold text-slate-900">
                        ${escapeHtml(target.numero_certificado)}
                      </span>
                      <span class="text-[11px] font-semibold text-indigo-700">
                        ${escapeHtml(target.norma_codigo)}
                      </span>
                    </div>
                    <div class="text-[11px] text-slate-600 truncate" title="${escapeHtml(target.organizacion_nombre)}">
                      ${escapeHtml(target.organizacion_nombre)}
                      <span class="text-slate-400"> · ${target.sitiosCount} sede${target.sitiosCount === 1 ? '' : 's'}</span>
                    </div>
                  </div>
                </div>

                <div class="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
                  ${
                    linkedInfo?.anyLinked
                      ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap">${
                          linkedInfo.allLinked ? 'Ya vinculado' : 'Parcialmente vinculado'
                        }</span>`
                      : ''
                  }
                  ${
                    hasConflict
                      ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-800 border border-rose-200 whitespace-nowrap">Conflicto de nombre</span>`
                      : ''
                  }
                  <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border whitespace-nowrap ${statusClass}">
                    ${escapeHtml(target.estatus)}
                  </span>
                </div>
              </div>
              ${
                numeroPreviews.length > 0
                  ? `
                    <div class="mt-2 ml-6 pl-2.5 border-l-2 border-indigo-200 space-y-0.5">
                      <div class="text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                        N° Sede asignado en destino
                      </div>
                      ${numeroPreviews
                        .map(
                          (line) =>
                            `<div class="text-[11px] text-slate-700">${escapeHtml(line)}</div>`
                        )
                        .join('')}
                    </div>
                  `
                  : ''
              }
            </label>
          `;
        })
        .join('')}
    </div>
  `;
}

function getClauseStatusBadgeMeta(status: ClauseResolutionEntry['status']): {
  label: string;
  badgeClass: string;
} {
  switch (status) {
    case 'EXACT_SAME_NORM':
      return {
        label: 'Mapeo Directo',
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      };
    case 'HLS_EQUIVALENT':
      return {
        label: 'Mapeo Equivalente HLS',
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      };
    case 'HIERARCHICAL_ROLLUP':
      return {
        label: 'Mapeo Jerárquico',
        badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
      };
    case 'HIERARCHICAL_ROLLDOWN':
      return {
        label: 'Desglose Jerárquico',
        badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
      };
    case 'SEMANTIC_COLLISION':
      return {
        label: 'Conflicto Semántico',
        badgeClass: 'bg-amber-50 text-amber-900 border-amber-300',
      };
    case 'NO_EQUIVALENT':
      return {
        label: 'Sin Equivalencia',
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
      };
    case 'EXCLUDED_ISO43':
      return {
        label: 'Excluida ISO 4.3',
        badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
      };
  }
}

export interface ClauseResolutionBlockInput {
  proceso: ProcessEntity;
  sourceCert: CertificadoDetailEntity;
  targetCert: CertificadoDetailEntity;
  plan: ProcesoTargetClauseResolutionPlan;
  contextSubtitle?: string;
}

function renderSingleClauseResolutionEntryRow(params: {
  entry: ClauseResolutionEntry;
  plan: ProcesoTargetClauseResolutionPlan;
  pairKey: string;
  selectedReqIds: string[];
  submitting: boolean;
}): string {
  const { entry, plan, pairKey, selectedReqIds, submitting } = params;
  const statusMeta = getClauseStatusBadgeMeta(entry.status);
  const selectedId = selectedReqIds[0] || '';
  const isChecked = !entry.disabled && selectedReqIds.length > 0;
  const sourceClauseLabel = entry.sourceClauses.join(', ');
  const sourceTitleLabel = entry.sourceTitles[0] || '';
  const sourceNormLabel = plan.sourceNormaCodigo || 'Norma origen';
  const targetNormLabel = plan.targetNormaCodigo || 'Norma destino';

  const manualOptionsHtml = plan.availableManualTargetOptions
    .map(
      (opt) => `
        <option value="${escapeHtml(opt.id)}" ${selectedId === opt.id ? 'selected' : ''}>
          ${escapeHtml(opt.codigo)} — ${escapeHtml(opt.titulo)}
        </option>
      `
    )
    .join('');

  if (entry.status === 'EXCLUDED_ISO43') {
    const blockCode = entry.blockingExclusionCodigo || sourceClauseLabel;
    return `
      <div class="p-2.5 rounded-xl border border-rose-200 bg-rose-50/75 opacity-90 space-y-1">
        <div class="flex items-start justify-between gap-2">
          <label class="flex items-start gap-2.5 min-w-0 cursor-not-allowed">
            <input
              type="checkbox"
              disabled
              class="mt-0.5 h-4 w-4 rounded border-rose-300 text-rose-500 cursor-not-allowed shrink-0"
            />
            <div class="min-w-0 space-y-0.5">
              <div class="text-xs font-semibold text-rose-900">
                <span class="font-mono font-bold">${escapeHtml(sourceClauseLabel)}</span>
                ${sourceTitleLabel ? ` · ${escapeHtml(sourceTitleLabel)}` : ''}
              </div>
              <div class="text-[11px] text-rose-800 leading-snug">
                Bloqueada en destino por exclusión ISO 4.3 (Cláusula ${escapeHtml(blockCode)})${
                  entry.blockingJustificacion ? `: ${escapeHtml(entry.blockingJustificacion)}` : ''
                }
              </div>
            </div>
          </label>
          <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border shrink-0 ${statusMeta.badgeClass}">
            ${escapeHtml(statusMeta.label)}
          </span>
        </div>
      </div>
    `;
  }

  if (entry.status === 'SEMANTIC_COLLISION') {
    const targetConflictLabel = entry.targetCandidate
      ? `${entry.targetCandidate.codigo} ${entry.targetCandidate.titulo}`
      : 'Sin equivalente directo';
    return `
      <div class="p-2.5 rounded-xl border border-amber-300 bg-amber-50/70 space-y-2">
        <div class="flex items-start justify-between gap-2">
          <label class="flex items-start gap-2.5 min-w-0 cursor-pointer">
            <input
              type="checkbox"
              data-action="toggle-share-clause-entry"
              data-pair-key="${escapeHtml(pairKey)}"
              data-entry-key="${escapeHtml(entry.entryKey)}"
              data-default-target-id="${escapeHtml(entry.targetCandidate?.id || '')}"
              ${isChecked ? 'checked' : ''}
              ${submitting ? 'disabled' : ''}
              class="mt-0.5 h-4 w-4 rounded border-amber-400 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
            />
            <div class="min-w-0 space-y-1">
              <div class="text-xs font-bold text-amber-950">
                Colisión semántica detectada — revisión manual requerida
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] bg-white/80 border border-amber-200 rounded-lg p-2">
                <div class="text-slate-800">
                  <span class="font-bold text-slate-600">Origen (${escapeHtml(sourceNormLabel)}):</span>
                  <span class="font-mono font-bold">${escapeHtml(sourceClauseLabel)}</span>
                  ${escapeHtml(sourceTitleLabel)}
                </div>
                <div class="text-amber-950">
                  <span class="font-bold text-amber-800">≠ Destino (${escapeHtml(targetNormLabel)}):</span>
                  ${escapeHtml(targetConflictLabel)}
                </div>
              </div>
              ${
                entry.warningMessage
                  ? `<p class="text-[11px] text-amber-900 leading-snug">${escapeHtml(entry.warningMessage)}</p>`
                  : ''
              }
            </div>
          </label>
          <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border shrink-0 ${statusMeta.badgeClass}">
            ${escapeHtml(statusMeta.label)}
          </span>
        </div>
        <div class="pl-6">
          <label class="block text-[10px] font-bold uppercase tracking-wider text-amber-900 mb-1">
            Sustituir por otra cláusula de ${escapeHtml(targetNormLabel)} (opcional)
          </label>
          <select
            data-action="change-share-clause-manual"
            data-pair-key="${escapeHtml(pairKey)}"
            data-entry-key="${escapeHtml(entry.entryKey)}"
            ${submitting ? 'disabled' : ''}
            class="w-full text-xs rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-slate-800"
          >
            <option value="">Dejar desmarcada (omitir en destino)</option>
            ${manualOptionsHtml}
          </select>
        </div>
      </div>
    `;
  }

  if (entry.status === 'NO_EQUIVALENT') {
    const manualAssigned = selectedId
      ? plan.availableManualTargetOptions.find((o) => o.id === selectedId)
      : undefined;
    return `
      <div class="p-2.5 rounded-xl border border-slate-200 bg-slate-50/80 space-y-2">
        <div class="flex items-start justify-between gap-2">
          <label class="flex items-start gap-2.5 min-w-0 cursor-pointer">
            <input
              type="checkbox"
              data-action="toggle-share-clause-entry"
              data-pair-key="${escapeHtml(pairKey)}"
              data-entry-key="${escapeHtml(entry.entryKey)}"
              data-default-target-id=""
              ${isChecked ? 'checked' : ''}
              ${submitting || !selectedId ? 'disabled' : ''}
              class="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
            />
            <div class="min-w-0 space-y-0.5">
              <div class="text-xs font-semibold text-slate-800">
                <span class="font-mono font-bold">${escapeHtml(sourceClauseLabel)}</span>
                ${sourceTitleLabel ? ` ${escapeHtml(sourceTitleLabel)}` : ''}
                — No existe en ${escapeHtml(targetNormLabel)} (Omitida automáticamente)
              </div>
              ${
                manualAssigned
                  ? `<div class="text-[11px] text-indigo-700 font-medium">Asignación manual: ${escapeHtml(manualAssigned.codigo)} — ${escapeHtml(manualAssigned.titulo)}</div>`
                  : ''
              }
            </div>
          </label>
          <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border shrink-0 ${statusMeta.badgeClass}">
            ${escapeHtml(statusMeta.label)}
          </span>
        </div>
        <div class="pl-6">
          <label class="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
            Asignar cláusula equivalente manual (opcional)
          </label>
          <select
            data-action="change-share-clause-manual"
            data-pair-key="${escapeHtml(pairKey)}"
            data-entry-key="${escapeHtml(entry.entryKey)}"
            ${submitting ? 'disabled' : ''}
            class="w-full text-xs rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-slate-800"
          >
            <option value="">Omitir (sin equivalencia)</option>
            ${manualOptionsHtml}
          </select>
        </div>
      </div>
    `;
  }

  // Mapped automatically (`EXACT_SAME_NORM`, `HLS_EQUIVALENT`, `HIERARCHICAL_ROLLUP`, `HIERARCHICAL_ROLLDOWN`)
  const targetLabel = entry.targetCandidate
    ? `${entry.targetCandidate.codigo} ${entry.targetCandidate.titulo}`
    : '';
  return `
    <label class="flex items-start justify-between gap-2 p-2.5 rounded-xl border transition-colors cursor-pointer ${
      isChecked
        ? 'border-emerald-200 bg-emerald-50/40'
        : 'border-slate-200 bg-white hover:bg-slate-50'
    }">
      <div class="flex items-start gap-2.5 min-w-0">
        <input
          type="checkbox"
          data-action="toggle-share-clause-entry"
          data-pair-key="${escapeHtml(pairKey)}"
          data-entry-key="${escapeHtml(entry.entryKey)}"
          data-default-target-id="${escapeHtml(entry.targetCandidate?.id || '')}"
          ${isChecked ? 'checked' : ''}
          ${submitting ? 'disabled' : ''}
          class="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
        />
        <div class="min-w-0 space-y-0.5">
          <div class="text-xs text-slate-900">
            <span class="font-mono font-bold">${escapeHtml(sourceClauseLabel)}</span>
            <span class="text-slate-500"> (${escapeHtml(sourceNormLabel)})</span>
            <span class="mx-1 text-indigo-600 font-bold" aria-hidden="true">→</span>
            <span class="font-mono font-bold text-indigo-800">${escapeHtml(targetLabel)}</span>
            <span class="text-slate-500"> (${escapeHtml(targetNormLabel)})</span>
          </div>
          ${
            entry.informativeNote
              ? `<div class="text-[11px] text-slate-600">${escapeHtml(entry.informativeNote)}</div>`
              : ''
          }
        </div>
      </div>
      <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border shrink-0 ${statusMeta.badgeClass}">
        ${escapeHtml(statusMeta.label)}
      </span>
    </label>
  `;
}

function renderCrossStandardClauseResolutionPanel(params: {
  blocks: ReadonlyArray<ClauseResolutionBlockInput>;
  clauseSelectionsByPairKey?: Readonly<Record<string, Record<string, string[]>>>;
  submitting: boolean;
  headingTitle?: string;
}): string {
  const {
    blocks,
    clauseSelectionsByPairKey,
    submitting,
    headingTitle = 'Resolución de Requisitos por Norma Destino',
  } = params;
  if (blocks.length === 0) return '';

  const needsGuidedResolution = blocks.some(
    (b) => b.plan.isCrossStandard || b.plan.summaryCounts.excludedIso43Count > 0
  );

  if (!needsGuidedResolution) {
    return `
      <div class="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 text-xs text-emerald-900 flex items-start gap-2">
        <span aria-hidden="true" class="font-bold">✓</span>
        <span>
          <strong>Compatibilidad directa (misma norma):</strong> se vincularán sus cláusulas aplicables automáticamente.
        </span>
      </div>
    `;
  }

  return `
    <section class="space-y-3 pt-1" aria-label="${escapeHtml(headingTitle)}">
      <div class="space-y-0.5">
        <h4 class="text-xs font-bold uppercase tracking-wider text-slate-700">
          ${escapeHtml(headingTitle)}
        </h4>
        <p class="text-[11px] text-slate-500">
          Revise las equivalencias propuestas por norma destino antes de confirmar la vinculación.
        </p>
      </div>
      ${blocks
        .map(({ proceso, sourceCert, targetCert, plan, contextSubtitle }) => {
          const pairKey = makeShareClausePairKey(proceso.id, targetCert.id);
          const pairSelections = clauseSelectionsByPairKey?.[pairKey];
          if (!plan.isCrossStandard && plan.summaryCounts.excludedIso43Count === 0) {
            return `
              <div class="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-900">
                <strong>${escapeHtml(proceso.nombre_proceso)}</strong> → ${escapeHtml(targetCert.numero_certificado)} (${escapeHtml(targetCert.norma_codigo)}):
                Compatibilidad directa (misma norma): se vincularán sus cláusulas aplicables automáticamente.
              </div>
            `;
          }

          return `
            <div class="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div class="px-3 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div class="text-xs font-bold text-slate-900">
                  ${escapeHtml(proceso.nombre_proceso)}
                  <span class="font-normal text-slate-500"> · ${escapeHtml(sourceCert.norma_codigo)} → ${escapeHtml(targetCert.numero_certificado)} (${escapeHtml(targetCert.norma_codigo)})</span>
                </div>
                ${
                  contextSubtitle
                    ? `<span class="text-[11px] font-medium text-indigo-700">${escapeHtml(contextSubtitle)}</span>`
                    : ''
                }
              </div>
              <div class="p-3 space-y-2">
                ${
                  plan.entries.length === 0
                    ? `<div class="text-xs text-slate-500">Este proceso no tiene cláusulas origen vinculadas todavía; se compartirá la estructura del proceso sin requisitos preasignados.</div>`
                    : plan.entries
                        .map((entry) =>
                          renderSingleClauseResolutionEntryRow({
                            entry,
                            plan,
                            pairKey,
                            selectedReqIds: resolveSelectedTargetReqIdsForEntry(
                              entry,
                              pairSelections
                            ),
                            submitting,
                          })
                        )
                        .join('')
                }
              </div>
            </div>
          `;
        })
        .join('')}
    </section>
  `;
}

function renderSitioCascadeStep(params: {
  sourceCert: CertificadoDetailEntity;
  selectedSites: ReadonlyArray<SiteEntity>;
  selectedTargets: ReadonlyArray<EligibleShareTargetCertificate>;
  modalState: ShareModalState;
  cascadePlan: SitioShareExecutionPlan | null;
  archivedTurnoIds?: ReadonlySet<string>;
  archivedProcesoIds?: ReadonlySet<string>;
}): string {
  const {
    sourceCert,
    selectedSites,
    selectedTargets,
    modalState,
    cascadePlan,
    archivedTurnoIds,
    archivedProcesoIds,
  } = params;

  if (selectedSites.length === 0 || selectedTargets.length === 0) {
    return '';
  }

  const expanded = modalState.cascadeSectionExpanded !== false;
  const subBlocks: ClauseResolutionBlockInput[] = [];
  if (cascadePlan) {
    for (const ps of cascadePlan.procesoSharesWithClausePlans) {
      const proc = (sourceCert.procesos || []).find((p) => p.id === ps.id_proceso);
      if (!proc) continue;
      const targetMeta = selectedTargets.find((t) => t.id === ps.targetCertId);
      const fakeTargetCert: CertificadoDetailEntity = {
        ...sourceCert,
        id: ps.targetCertId,
        numero_certificado: ps.targetNumeroCertificado,
        id_norma: ps.resolutionPlan.targetNormaId,
        norma_codigo: targetMeta?.norma_codigo || ps.resolutionPlan.targetNormaCodigo,
      };
      subBlocks.push({
        proceso: proc,
        sourceCert,
        targetCert: fakeTargetCert,
        plan: ps.resolutionPlan,
        contextSubtitle:
          ps.siteIdsTriggeringShare.length > 0
            ? `Desde cascada de ${ps.siteIdsTriggeringShare.length} sede${ps.siteIdsTriggeringShare.length === 1 ? '' : 's'}`
            : undefined,
      });
    }
  }

  return `
    <section class="space-y-2.5 border border-slate-200 rounded-xl bg-slate-50/70 p-3.5" aria-label="Paso 3: Cascada opcional de Turnos y Procesos">
      <div class="flex items-center justify-between gap-2">
        <div class="space-y-0.5">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-700">
            3. Cascada opcional (Turnos y Procesos del Sitio)
          </h3>
          <p class="text-[11px] text-slate-500">
            Turnos pre-marcados por defecto; procesos desmarcados salvo que decida propagarlos.
          </p>
        </div>
        <button
          type="button"
          data-action="toggle-share-cascade-section"
          class="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
        >
          ${expanded ? 'Contraer' : 'Expandir'}
        </button>
      </div>

      ${
        expanded
          ? `
            <div class="space-y-3 pt-1">
              ${selectedSites
                .map((site) => {
                  const linkedTurnos = getActiveLinkedTurnosForSite(
                    site,
                    sourceCert,
                    archivedTurnoIds
                  );
                  const selectedTurnoSet = new Set(
                    getEffectiveSiteCascadeTurnoIdsForSite(
                      site,
                      sourceCert,
                      modalState,
                      archivedTurnoIds
                    )
                  );
                  const linkedProcesos = getActiveLinkedProcesosForSite(
                    site,
                    sourceCert,
                    archivedProcesoIds
                  );
                  const selectedProcesoSet = new Set(
                    getEffectiveSiteCascadeProcesoIdsForSite(
                      site,
                      sourceCert,
                      modalState,
                      archivedProcesoIds
                    )
                  );

                  return `
                    <div class="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
                      <div class="text-xs font-bold text-slate-900">
                        ${site.numero_sitio === 0 ? 'Sitio 0 (HQ)' : `Sede #${site.numero_sitio}`} — ${escapeHtml(site.nombre_sitio)}
                      </div>

                      <div class="space-y-1.5">
                        <div class="text-[11px] font-bold text-slate-700">
                          Propagar Turnos del Sitio
                        </div>
                        ${
                          linkedTurnos.length === 0
                            ? `<div class="text-[11px] text-slate-500">Esta sede no tiene turnos vinculados para propagar.</div>`
                            : `
                              <div class="flex flex-wrap gap-2">
                                ${linkedTurnos
                                  .map((turno) => {
                                    const checked = selectedTurnoSet.has(turno.id);
                                    const timeLabel = `${formatTurnoTime(turno.hora_entrada)}–${formatTurnoTime(turno.hora_salida)}`;
                                    return `
                                      <label class="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer ${
                                        checked
                                          ? 'border-indigo-300 bg-indigo-50/70 text-slate-900'
                                          : 'border-slate-200 bg-slate-50 text-slate-600'
                                      }">
                                        <input
                                          type="checkbox"
                                          data-action="toggle-share-site-turno"
                                          data-site-id="${escapeHtml(site.id)}"
                                          data-turno-id="${escapeHtml(turno.id)}"
                                          ${checked ? 'checked' : ''}
                                          ${modalState.submitting ? 'disabled' : ''}
                                          class="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                        />
                                        <span class="font-medium">${escapeHtml(turno.descripcion)}</span>
                                        <span class="font-mono text-[10px] text-indigo-700">${escapeHtml(timeLabel)}</span>
                                      </label>
                                    `;
                                  })
                                  .join('')}
                              </div>
                            `
                        }
                      </div>

                      <div class="space-y-1.5">
                        <div class="text-[11px] font-bold text-slate-700">
                          Propagar Procesos del Sitio
                        </div>
                        ${
                          linkedProcesos.length === 0
                            ? `<div class="text-[11px] text-slate-500">Esta sede no tiene procesos vinculados para propagar.</div>`
                            : `
                              <div class="flex flex-wrap gap-2">
                                ${linkedProcesos
                                  .map((proc) => {
                                    const checked = selectedProcesoSet.has(proc.id);
                                    return `
                                      <label class="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer ${
                                        checked
                                          ? 'border-indigo-300 bg-indigo-50/70 text-slate-900'
                                          : 'border-slate-200 bg-slate-50 text-slate-600'
                                      }">
                                        <input
                                          type="checkbox"
                                          data-action="toggle-share-site-proceso"
                                          data-site-id="${escapeHtml(site.id)}"
                                          data-proceso-id="${escapeHtml(proc.id)}"
                                          ${checked ? 'checked' : ''}
                                          ${modalState.submitting ? 'disabled' : ''}
                                          class="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                        />
                                        <span class="font-medium">${escapeHtml(proc.nombre_proceso)}</span>
                                      </label>
                                    `;
                                  })
                                  .join('')}
                              </div>
                            `
                        }
                      </div>
                    </div>
                  `;
                })
                .join('')}

              ${
                cascadePlan && cascadePlan.reusedExistingProcesses.length > 0
                  ? `
                    <div class="rounded-xl border border-sky-200 bg-sky-50/80 p-3 text-xs text-sky-900 space-y-1">
                      <div class="font-bold">Reutilización de procesos existentes en destino</div>
                      <ul class="list-disc pl-5 space-y-0.5 text-[11px]">
                        ${cascadePlan.reusedExistingProcesses
                          .map(
                            (r) =>
                              `<li><strong>${escapeHtml(r.nombre_proceso)}</strong> ya existe activo en ${escapeHtml(r.target_numero_certificado)}; se vinculará directamente al sitio compartido.</li>`
                          )
                          .join('')}
                      </ul>
                    </div>
                  `
                  : ''
              }

              ${renderCrossStandardClauseResolutionPanel({
                blocks: subBlocks,
                clauseSelectionsByPairKey: modalState.clauseSelectionsByPairKey,
                submitting: modalState.submitting,
                headingTitle: 'Resolución de Requisitos por Norma Destino (Cascada de Procesos)',
              })}
            </div>
          `
          : ''
      }
    </section>
  `;
}

export function renderShareModal(props: ShareModalViewProps): string {
  const {
    profile,
    modalState,
    certificates,
    organizaciones,
    conglomerados,
    authorizedClientOrgIds,
    archivedContactoIds,
    archivedTurnoIds,
    archivedSiteIds,
    archivedProcesoIds,
    archivedNoAplicableIds,
    requirementsCatalog = getAllSeededNormaRequirements(),
  } = props;

  if (!modalState.isOpen || !isApprovedStaffProfile(profile)) {
    return '';
  }

  const sourceCert = certificates.find((c) => c.id === modalState.sourceCertId);
  if (!sourceCert) {
    return '';
  }

  const kind = modalState.kind;
  const eligibility = getEligibleShareTargetCertificates({
    sourceCert,
    allCertificates: certificates,
    organizaciones,
    conglomerados,
    profile,
    authorizedClientOrgIds,
  });

  const activeContacts = (sourceCert.contactos || []).filter(
    (c) => !archivedContactoIds?.has(c.id)
  );
  const activeTurnos = (sourceCert.turnos || []).filter(
    (t) => !archivedTurnoIds?.has(t.id)
  );
  const activeProcesos = (sourceCert.procesos || []).filter(
    (p) => !archivedProcesoIds?.has(p.id)
  );
  const activeSitios = (sourceCert.sitios || []).filter(
    (s) => !archivedSiteIds?.has(s.id)
  );

  const validSourceItemIds = new Set(
    kind === 'contacto'
      ? activeContacts.map((c) => c.id)
      : kind === 'turno'
      ? activeTurnos.map((t) => t.id)
      : kind === 'proceso'
      ? activeProcesos.map((p) => p.id)
      : activeSitios.map((s) => s.id)
  );
  const selectedItemIds = modalState.selectedItemIds.filter((id) =>
    validSourceItemIds.has(id)
  );
  const selectedItemSet = new Set(selectedItemIds);

  const eligibleTargetIds = new Set(eligibility.targets.map((t) => t.id));
  const selectedTargetIds = modalState.selectedTargetCertIds.filter((id) =>
    eligibleTargetIds.has(id)
  );
  const selectedTargetSet = new Set(selectedTargetIds);

  const certById = new Map<string, CertificadoDetailEntity>(
    certificates.map((c) => [c.id, c])
  );

  const alreadyLinkedByTargetId = new Map<
    string,
    { anyLinked: boolean; allLinked: boolean }
  >();

  if (selectedItemIds.length > 0) {
    for (const target of eligibility.targets) {
      const targetCert = certById.get(target.id);
      let linkedCount = 0;
      if (kind === 'contacto') {
        for (const c of activeContacts) {
          if (!selectedItemSet.has(c.id)) continue;
          if (isContactLinkedToTargetCert(c, targetCert)) linkedCount += 1;
        }
      } else if (kind === 'turno') {
        for (const t of activeTurnos) {
          if (!selectedItemSet.has(t.id)) continue;
          if (isShiftLinkedToTargetCert(t, targetCert)) linkedCount += 1;
        }
      } else if (kind === 'proceso') {
        for (const p of activeProcesos) {
          if (!selectedItemSet.has(p.id)) continue;
          if (isProcesoLinkedToTargetCert(p, targetCert)) linkedCount += 1;
        }
      } else {
        for (const s of activeSitios) {
          if (!selectedItemSet.has(s.id)) continue;
          if (isSiteLinkedToTargetCert(s, targetCert)) linkedCount += 1;
        }
      }
      if (linkedCount > 0) {
        alreadyLinkedByTargetId.set(target.id, {
          anyLinked: true,
          allLinked: linkedCount === selectedItemIds.length,
        });
      }
    }
  }

  let contactoPlan: PlanShareContactosResult | null = null;
  let turnoPlan: PlanShareTurnosResult | null = null;
  const plannedProcesoItems: PlannedProcesoShareItem[] = [];
  let alreadySharedProcesoCount = 0;
  let sitioCascadePlan: SitioShareExecutionPlan | null = null;
  const duplicateConflictByTargetId = new Map<string, string[]>();

  const selectedSites =
    kind === 'sitio' ? activeSitios.filter((s) => selectedItemSet.has(s.id)) : [];
  const siteNumeroPreviewsByTargetId = new Map<string, string[]>();

  if (kind === 'sitio' && selectedSites.length > 0) {
    for (const target of eligibility.targets) {
      const targetCert = certById.get(target.id);
      if (!targetCert) continue;
      const reservedNumbers = new Set<number>();
      const lines: string[] = [];
      for (const site of selectedSites) {
        if (isSiteLinkedToTargetCert(site, targetCert)) {
          lines.push(`${site.nombre_sitio}: Ya vinculado en ${target.numero_certificado}`);
          continue;
        }
        const numRes = resolveTargetNumeroSitioForSharedSite({
          sourceSite: site,
          targetCert,
          preferredNumeroSitio: site.numero_sitio,
          archivedSiteIds,
          reservedNumbers,
        });
        if (numRes.allowed && numRes.assignedNumeroSitio !== null) {
          reservedNumbers.add(numRes.assignedNumeroSitio);
        }
        lines.push(formatSiteTargetPreviewLabel(site, target.numero_certificado, numRes));
      }
      if (lines.length > 0) {
        siteNumeroPreviewsByTargetId.set(target.id, lines);
      }
    }
  }

  if (selectedItemIds.length > 0 && selectedTargetIds.length > 0) {
    if (kind === 'contacto') {
      contactoPlan = planShareContactos({
        sourceCert,
        selectedContactoIds: selectedItemIds,
        targetCertIds: selectedTargetIds,
        allCertificates: certificates,
        organizaciones,
        conglomerados,
        profile,
        authorizedClientOrgIds,
        archivedContactoIds,
      });
      for (const conflict of contactoPlan.conflicts) {
        const list = duplicateConflictByTargetId.get(conflict.id_certificado) || [];
        list.push(conflict.message);
        duplicateConflictByTargetId.set(conflict.id_certificado, list);
      }
    } else if (kind === 'turno') {
      turnoPlan = planShareTurnos({
        sourceCert,
        selectedTurnoIds: selectedItemIds,
        targetCertIds: selectedTargetIds,
        autoLinkTargetSites: modalState.autoLinkTargetSites,
        allCertificates: certificates,
        organizaciones,
        conglomerados,
        profile,
        authorizedClientOrgIds,
        archivedTurnoIds,
        archivedSiteIds,
      });
    } else if (kind === 'proceso') {
      for (const proc of activeProcesos) {
        if (!selectedItemSet.has(proc.id)) continue;
        for (const targetCertId of selectedTargetIds) {
          const targetCert = certById.get(targetCertId);
          if (!targetCert) continue;
          if (isProcesoLinkedToTargetCert(proc, targetCert)) {
            alreadySharedProcesoCount += 1;
            continue;
          }
          const resolutionPlan = resolveProcesoClausesForTargetCert({
            proceso: proc,
            sourceCert,
            targetCert,
            requirementsCatalog,
            archivedNoAplicableIds,
          });
          const finalRequisitoIds = buildFinalTargetRequisitoIds({
            resolutionPlan,
            selectedTargetReqIdsByEntryKey: buildSelectedMapForResolutionPlan(
              resolutionPlan,
              modalState.clauseSelectionsByPairKey
            ),
            targetCert,
            requirementsCatalog,
            archivedNoAplicableIds,
          });
          plannedProcesoItems.push({
            proceso: proc,
            sourceCert,
            targetCert,
            resolutionPlan,
            finalRequisitoIds,
          });
        }
      }
    } else {
      const selectedTurnoIdsBySite: Record<string, string[]> = {};
      const selectedProcesoIdsBySite: Record<string, string[]> = {};
      for (const site of selectedSites) {
        selectedTurnoIdsBySite[site.id] = getEffectiveSiteCascadeTurnoIdsForSite(
          site,
          sourceCert,
          modalState,
          archivedTurnoIds
        );
        selectedProcesoIdsBySite[site.id] = getEffectiveSiteCascadeProcesoIdsForSite(
          site,
          sourceCert,
          modalState,
          archivedProcesoIds
        );
      }
      sitioCascadePlan = planShareSitiosWithCascade({
        sourceCert,
        selectedSiteIds: selectedItemIds,
        targetCertIds: selectedTargetIds,
        allCertificates: certificates,
        organizaciones,
        conglomerados,
        profile,
        authorizedClientOrgIds,
        selectedTurnoIdsBySite,
        selectedProcesoIdsBySite,
        requirementsCatalog,
        archivedSiteIds,
        archivedTurnoIds,
        archivedProcesoIds,
        archivedNoAplicableIds,
      });
    }
  }

  const isExecutable =
    kind === 'contacto'
      ? Boolean(contactoPlan?.isExecutable)
      : kind === 'turno'
      ? Boolean(turnoPlan?.isExecutable)
      : kind === 'proceso'
      ? plannedProcesoItems.length > 0
      : Boolean(sitioCascadePlan?.isExecutable);

  const duplicateConflicts =
    contactoPlan?.conflicts.filter((c) => c.kind === 'DUPLICATE_CONTACT_NAME') || [];

  const allAlreadySharedOnly =
    selectedItemIds.length > 0 &&
    selectedTargetIds.length > 0 &&
    duplicateConflicts.length === 0 &&
    ((kind === 'contacto' &&
      contactoPlan !== null &&
      contactoPlan.toCreateLinks.length === 0 &&
      contactoPlan.alreadyShared.length > 0) ||
      (kind === 'turno' &&
        turnoPlan !== null &&
        turnoPlan.certLinksToCreate.length === 0 &&
        turnoPlan.turnosPorSitioToCreate.length === 0 &&
        turnoPlan.alreadyShared.length > 0) ||
      (kind === 'proceso' &&
        plannedProcesoItems.length === 0 &&
        alreadySharedProcesoCount > 0) ||
      (kind === 'sitio' &&
        sitioCascadePlan !== null &&
        sitioCascadePlan.sitioLinksToCreate.length === 0 &&
        sitioCascadePlan.alreadySharedSites.length > 0));

  const headerTitle =
    kind === 'contacto'
      ? `Compartir Contactos de ${sourceCert.numero_certificado}`
      : kind === 'turno'
      ? `Compartir Turnos de ${sourceCert.numero_certificado}`
      : kind === 'proceso'
      ? `Compartir Procesos de ${sourceCert.numero_certificado}`
      : `Compartir Sitios de ${sourceCert.numero_certificado}`;

  const step1Heading =
    kind === 'contacto'
      ? '1. Contactos a compartir'
      : kind === 'turno'
      ? '1. Turnos operativos a compartir'
      : kind === 'proceso'
      ? '1. Procesos del sistema a compartir'
      : '1. Sedes operativas a compartir';

  const conglomerateSubtitle = eligibility.sourceGroupNombre
    ? `Conglomerado: ${eligibility.sourceGroupNombre} · ${sourceCert.organizacion_nombre}`
    : `${sourceCert.organizacion_nombre} · ${sourceCert.norma_codigo}`;

  const totalItemsCount =
    kind === 'contacto'
      ? activeContacts.length
      : kind === 'turno'
      ? activeTurnos.length
      : kind === 'proceso'
      ? activeProcesos.length
      : activeSitios.length;

  const canConfirm =
    !modalState.submitting &&
    eligibility.missingConglomeradoReason === null &&
    eligibility.targets.length > 0 &&
    isExecutable;

  const newLinksCount =
    kind === 'contacto'
      ? contactoPlan?.toCreateLinks.length ?? 0
      : kind === 'turno'
      ? (turnoPlan?.certLinksToCreate.length ?? 0) +
        (turnoPlan?.turnosPorSitioToCreate.length ?? 0)
      : kind === 'proceso'
      ? plannedProcesoItems.length
      : (sitioCascadePlan?.sitioLinksToCreate.length ?? 0) +
        (sitioCascadePlan?.turnoCertLinksToCreate.length ?? 0) +
        (sitioCascadePlan?.procesoSharesWithClausePlans.length ?? 0) +
        (sitioCascadePlan?.procesosPorSitioToCreate.length ?? 0);

  const selectedEligibleTargets = eligibility.targets.filter((t) =>
    selectedTargetSet.has(t.id)
  );

  return `
    <div
      id="shareModalBackdrop"
      class="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shareModalTitle"
    >
      <div class="w-full max-w-3xl bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden my-auto">
        <header class="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3 bg-slate-50/60">
          <div class="min-w-0 space-y-0.5">
            <h2 id="shareModalTitle" class="text-sm font-bold text-slate-900 truncate">
              ${escapeHtml(headerTitle)}
            </h2>
            <p class="text-xs text-slate-600 truncate">
              ${escapeHtml(conglomerateSubtitle)}
            </p>
          </div>
          <button
            type="button"
            id="closeShareModalBtn"
            data-action="close-share-modal"
            aria-label="Cerrar"
            ${modalState.submitting ? 'disabled' : ''}
            class="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
          >
            ✕
          </button>
        </header>

        <div class="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
          <section class="space-y-2.5" aria-label="Paso 1: Registros a compartir">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="space-y-0.5">
                <h3 class="text-xs font-bold uppercase tracking-wider text-slate-700">
                  ${escapeHtml(step1Heading)}
                </h3>
                <p class="text-[11px] text-slate-500 tabular-nums">
                  ${selectedItemIds.length} de ${totalItemsCount} seleccionado${selectedItemIds.length === 1 ? '' : 's'}
                </p>
              </div>
              ${
                totalItemsCount > 0
                  ? `
                    <div class="flex items-center gap-2">
                      <button
                        type="button"
                        data-action="share-select-all-items"
                        ${modalState.submitting ? 'disabled' : ''}
                        class="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
                      >
                        Seleccionar todos
                      </button>
                      <button
                        type="button"
                        data-action="share-clear-all-items"
                        ${modalState.submitting || selectedItemIds.length === 0 ? 'disabled' : ''}
                        class="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
                      >
                        Limpiar
                      </button>
                    </div>
                  `
                  : ''
              }
            </div>

            ${
              kind === 'contacto'
                ? renderContactoItemsStep({
                    items: activeContacts,
                    selectedIds: selectedItemSet,
                    submitting: modalState.submitting,
                  })
                : kind === 'turno'
                ? renderTurnoItemsStep({
                    items: activeTurnos,
                    selectedIds: selectedItemSet,
                    submitting: modalState.submitting,
                  })
                : kind === 'proceso'
                ? renderProcesoItemsStep({
                    items: activeProcesos,
                    selectedIds: selectedItemSet,
                    submitting: modalState.submitting,
                  })
                : renderSitioItemsStep({
                    items: activeSitios,
                    selectedIds: selectedItemSet,
                    submitting: modalState.submitting,
                  })
            }
          </section>

          <section class="space-y-2.5" aria-label="Paso 2: Certificados destino del conglomerado">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="space-y-0.5">
                <h3 class="text-xs font-bold uppercase tracking-wider text-slate-700">
                  2. Certificados destino del mismo Conglomerado
                </h3>
                <p class="text-[11px] text-slate-500 tabular-nums">
                  ${selectedTargetIds.length} de ${eligibility.targets.length} certificado${eligibility.targets.length === 1 ? '' : 's'} seleccionado${selectedTargetIds.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>

            ${renderTargetCertificatesStep({
              targets: eligibility.targets,
              selectedTargetIds: selectedTargetSet,
              alreadyLinkedByTargetId,
              duplicateConflictByTargetId,
              siteNumeroPreviewsByTargetId:
                kind === 'sitio' ? siteNumeroPreviewsByTargetId : undefined,
              missingConglomeradoReason: eligibility.missingConglomeradoReason,
              sourceGroupNombre: eligibility.sourceGroupNombre,
              submitting: modalState.submitting,
            })}
          </section>

          ${
            kind === 'turno' && eligibility.targets.length > 0 && !eligibility.missingConglomeradoReason
              ? `
                <label class="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 bg-slate-50/80 cursor-pointer">
                  <input
                    id="shareAutoLinkSitesCheckbox"
                    type="checkbox"
                    data-action="toggle-share-auto-link-sites"
                    ${modalState.autoLinkTargetSites ? 'checked' : ''}
                    ${modalState.submitting ? 'disabled' : ''}
                    class="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                  />
                  <span class="text-xs font-medium text-slate-800 leading-relaxed">
                    Asignar automáticamente a las sedes activas (Sitio 0 / sucursales) de los certificados destino
                  </span>
                </label>
              `
              : ''
          }

          ${
            kind === 'proceso' && plannedProcesoItems.length > 0
              ? renderCrossStandardClauseResolutionPanel({
                  blocks: plannedProcesoItems.map((item) => ({
                    proceso: item.proceso,
                    sourceCert: item.sourceCert,
                    targetCert: item.targetCert,
                    plan: item.resolutionPlan,
                  })),
                  clauseSelectionsByPairKey: modalState.clauseSelectionsByPairKey,
                  submitting: modalState.submitting,
                })
              : ''
          }

          ${
            kind === 'sitio' && selectedSites.length > 0 && selectedEligibleTargets.length > 0
              ? renderSitioCascadeStep({
                  sourceCert,
                  selectedSites,
                  selectedTargets: selectedEligibleTargets,
                  modalState,
                  cascadePlan: sitioCascadePlan,
                  archivedTurnoIds,
                  archivedProcesoIds,
                })
              : ''
          }

          ${
            duplicateConflicts.length > 0
              ? `
                <div role="alert" class="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-1.5">
                  <div class="font-bold">Conflicto detectado: no es posible compartir por nombre duplicado</div>
                  <ul class="list-disc pl-5 space-y-0.5">
                    ${duplicateConflicts
                      .map((c) => `<li>${escapeHtml(c.message)}</li>`)
                      .join('')}
                  </ul>
                  <p class="text-[11px] text-rose-800">
                    Desmarque el contacto o el certificado destino en conflicto para continuar.
                  </p>
                </div>
              `
              : ''
          }

          ${
            kind === 'sitio' &&
            sitioCascadePlan &&
            sitioCascadePlan.validationErrors.length > 0 &&
            selectedItemIds.length > 0 &&
            selectedTargetIds.length > 0 &&
            !allAlreadySharedOnly
              ? `
                <div role="alert" class="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                  ${escapeHtml(sitioCascadePlan.validationErrors[0])}
                </div>
              `
              : ''
          }

          ${
            allAlreadySharedOnly
              ? `
                <div class="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                  Los registros seleccionados ya se encuentran vinculados activamente con los certificados destino marcados.
                </div>
              `
              : ''
          }

          ${
            modalState.errorMessage
              ? `
                <div role="alert" class="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-800">
                  ${escapeHtml(modalState.errorMessage)}
                </div>
              `
              : ''
          }
        </div>

        <footer class="px-5 py-3.5 border-t border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
          <div class="text-[11px] text-slate-500 tabular-nums">
            ${
              newLinksCount > 0
                ? `Se ${newLinksCount === 1 ? 'creará' : 'crearán'} <strong class="text-slate-800">${newLinksCount}</strong> vínculo${newLinksCount === 1 ? '' : 's'} nuevo${newLinksCount === 1 ? '' : 's'}.`
                : 'Seleccione registros y certificados destino para habilitar la compartición.'
            }
          </div>
          <div class="flex items-center gap-2 ml-auto">
            <button
              type="button"
              id="cancelShareModalBtn"
              data-action="close-share-modal"
              ${modalState.submitting ? 'disabled' : ''}
              class="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              id="confirmShareChildBtn"
              data-action="confirm-share-modal"
              ${canConfirm ? '' : 'disabled'}
              class="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer whitespace-nowrap disabled:opacity-45 disabled:cursor-not-allowed"
            >
              ${modalState.submitting ? 'Compartiendo...' : 'Confirmar y Compartir'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  `;
}
