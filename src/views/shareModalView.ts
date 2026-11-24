import { isApprovedStaffProfile } from '../lib/accessControl';
import type { OrganizacionEntity } from '../lib/activeCertificates';
import {
  getEligibleShareTargetCertificates,
  planShareAlcance,
  planShareContactos,
  planShareProcesos,
  planShareTurnos,
  type AlcanceShareConflictItem,
  type EligibleShareTargetCertificate,
  type PlanShareAlcanceResult,
  type PlanShareContactosResult,
  type PlanShareProcesosResult,
  type PlanShareTurnosResult,
} from '../lib/certificadoShareDomain';
import { hasCertificateActiveAlcance } from '../lib/alcanceDomain';
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
import { getAllSeededNormaRequirements } from '../lib/procesoDomain';
import {
  planShareSitiosWithCascade,
  resolveTargetNumeroSitioForSharedSite,
  type ResolveTargetNumeroSitioResult,
  type SitioShareExecutionPlan,
} from '../lib/sitioShareDomain';
import { formatTurnoTime } from '../lib/turnoDomain';

export type ShareModalKind = 'contacto' | 'turno' | 'proceso' | 'sitio' | 'alcance';

export interface ShareModalState {
  isOpen: boolean;
  kind: ShareModalKind;
  sourceCertId: string;
  selectedVersionId?: string | null;
  selectedItemIds: string[];
  selectedTargetCertIds: string[];
  autoLinkTargetSites: boolean;
  shareProcesoWithRequisitos?: boolean;
  syncRequisitosSameNorm?: boolean;
  siteCascadeTurnoIdsBySite?: Record<string, string[]>;
  siteCascadeProcesoIdsBySite?: Record<string, string[]>;
  cascadeSectionExpanded?: boolean;
  alcanceConflictStep?: boolean;
  alcanceConflicts?: AlcanceShareConflictItem[];
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

export function createInitialShareModalState(
  kind: ShareModalKind,
  sourceCertId: string,
  preselectedItemIds: ReadonlyArray<string> = []
): ShareModalState {
  return {
    isOpen: Boolean(sourceCertId.trim()),
    kind,
    sourceCertId: sourceCertId.trim(),
    selectedVersionId: null,
    selectedItemIds: preselectedItemIds.filter((id) => Boolean(id.trim())),
    selectedTargetCertIds: [],
    autoLinkTargetSites: true,
    shareProcesoWithRequisitos: true,
    syncRequisitosSameNorm: true,
    siteCascadeTurnoIdsBySite: {},
    siteCascadeProcesoIdsBySite: {},
    cascadeSectionExpanded: true,
    alcanceConflictStep: false,
    alcanceConflicts: [],
    submitting: false,
    errorMessage: null,
  };
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
  alcanceStatusByTargetId?: ReadonlyMap<string, 'SIN_ALCANCE' | 'CONFLICTO_EXISTENTE'>;
  emptyTargetsOverrideMessage?: string;
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
    alcanceStatusByTargetId,
    emptyTargetsOverrideMessage,
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
            emptyTargetsOverrideMessage
              ? escapeHtml(emptyTargetsOverrideMessage)
              : sourceGroupNombre
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
          const alcanceStatus = alcanceStatusByTargetId?.get(target.id);
          const statusClass = getStatusChipClass(target.estatus);
          const numeroPreviews = siteNumeroPreviewsByTargetId?.get(target.id) || [];
          return `
            <label class="block p-2.5 rounded-xl border transition-colors cursor-pointer ${
              hasConflict
                ? 'border-rose-300 bg-rose-50/60'
                : checked && alcanceStatus === 'CONFLICTO_EXISTENTE'
                ? 'border-amber-300 bg-amber-50/50'
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
                    alcanceStatus === 'SIN_ALCANCE'
                      ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap">Sin alcance</span>`
                      : alcanceStatus === 'CONFLICTO_EXISTENTE'
                      ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">Alcance actual (requiere confirmación de reemplazo)</span>`
                      : ''
                  }
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

function renderAlcanceShareModal(params: {
  sourceCert: CertificadoDetailEntity;
  modalState: ShareModalState;
  eligibility: {
    targets: EligibleShareTargetCertificate[];
    sourceGroupId: string | null;
    sourceGroupNombre: string | null;
    missingConglomeradoReason: string | null;
  };
  certificates: ReadonlyArray<CertificadoDetailEntity>;
  organizaciones: ReadonlyArray<OrganizacionEntity>;
  conglomerados: ReadonlyArray<ConglomeradoEntity>;
  profile: UserProfile | null;
  authorizedClientOrgIds?: ReadonlyArray<string>;
}): string {
  const {
    sourceCert,
    modalState,
    eligibility,
    certificates,
    organizaciones,
    conglomerados,
    profile,
    authorizedClientOrgIds,
  } = params;

  const sourceAlcance = sourceCert.alcanceDetalle ?? null;
  const hasSourceAlcance = hasCertificateActiveAlcance(sourceCert) && sourceAlcance !== null;
  const ownerCertId = (sourceAlcance?.id_certificado || sourceCert.id).trim();
  const sourceAlcanceId = (sourceAlcance?.id || '').trim();

  const certById = new Map<string, CertificadoDetailEntity>(
    certificates.map((c) => [c.id, c])
  );

  // Exclude owner cert & targets already sharing the exact same Alcance
  const filteredTargets = eligibility.targets.filter((target) => {
    if (ownerCertId && target.id === ownerCertId) return false;
    const targetCert = certById.get(target.id);
    const targetAlcance = targetCert?.alcanceDetalle ?? null;
    if (
      sourceAlcanceId &&
      targetAlcance &&
      hasCertificateActiveAlcance(targetCert as CertificadoDetailEntity) &&
      targetAlcance.id.trim() === sourceAlcanceId
    ) {
      return false;
    }
    return true;
  });

  const filteredTargetIdSet = new Set(filteredTargets.map((t) => t.id));
  const selectedTargetIds = modalState.selectedTargetCertIds.filter((id) =>
    filteredTargetIdSet.has(id)
  );
  const selectedTargetSet = new Set(selectedTargetIds);

  const alcanceStatusByTargetId = new Map<
    string,
    'SIN_ALCANCE' | 'CONFLICTO_EXISTENTE'
  >();
  for (const target of filteredTargets) {
    const targetCert = certById.get(target.id);
    const hasActive = targetCert ? hasCertificateActiveAlcance(targetCert) : false;
    alcanceStatusByTargetId.set(
      target.id,
      hasActive ? 'CONFLICTO_EXISTENTE' : 'SIN_ALCANCE'
    );
  }

  let planResult: PlanShareAlcanceResult | null = null;
  if (hasSourceAlcance && selectedTargetIds.length > 0) {
    planResult = planShareAlcance({
      sourceCert,
      selectedTargetCertIds: selectedTargetIds,
      allCertificates: certificates,
      organizaciones,
      conglomerados,
      profile,
      authorizedClientOrgIds,
      confirmOverwrite: Boolean(modalState.alcanceConflictStep),
    });
  }

  const resolvedConflicts: AlcanceShareConflictItem[] =
    modalState.alcanceConflicts && modalState.alcanceConflicts.length > 0
      ? modalState.alcanceConflicts
      : planResult?.conflicts || [];

  const conglomerateSubtitle = eligibility.sourceGroupNombre
    ? `Conglomerado: ${eligibility.sourceGroupNombre} · ${sourceCert.organizacion_nombre}`
    : `${sourceCert.organizacion_nombre} · ${sourceCert.norma_codigo}`;

  if (modalState.alcanceConflictStep && resolvedConflicts.length > 0) {
    return `
      <div
        id="shareModalBackdrop"
        class="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shareModalTitle"
      >
        <div class="w-full max-w-4xl bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden my-auto">
          <header class="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3 bg-amber-50/70">
            <div class="min-w-0 space-y-0.5">
              <h2 id="shareModalTitle" class="text-sm font-bold text-slate-900">
                Conflicto de Alcance detectado (${resolvedConflicts.length} certificado${resolvedConflicts.length === 1 ? '' : 's'} destino)
              </h2>
              <p class="text-xs text-slate-600 truncate">
                ${escapeHtml(conglomerateSubtitle)}
              </p>
            </div>
            <button
              type="button"
              id="closeShareModalBtn"
              data-action="cancel-alcance-conflict"
              aria-label="Cerrar"
              ${modalState.submitting ? 'disabled' : ''}
              class="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
            >
              ✕
            </button>
          </header>

          <div class="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
            <div role="alert" class="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 leading-relaxed">
              Uno o más certificados seleccionados ya poseen un <strong>Alcance</strong> activo. Compare el texto vigente de cada certificado destino con el nuevo Alcance a compartir antes de confirmar el reemplazo.
            </div>

            ${resolvedConflicts
              .map(
                (conflict) => `
                  <section
                    data-conflict-cert-id="${escapeHtml(conflict.targetCertId)}"
                    class="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3"
                  >
                    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="font-mono text-xs font-bold text-slate-900">
                          ${escapeHtml(conflict.targetNumeroCertificado)}
                        </span>
                        <span class="text-xs font-semibold text-slate-700">
                          ${escapeHtml(conflict.targetOrganizacionNombre)}
                        </span>
                      </div>
                      <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                        ${escapeHtml(conflict.targetCurrentOriginLabel)}
                      </span>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div class="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 space-y-2.5 min-w-0">
                        <div class="text-xs font-bold text-emerald-900">
                          Nuevo Alcance a Compartir (Origen: ${escapeHtml(sourceCert.numero_certificado)})
                        </div>
                        <div class="space-y-1">
                          <div class="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Español</div>
                          <div class="rounded-lg border border-emerald-200/80 bg-white p-2.5 text-xs text-slate-900 whitespace-pre-wrap break-words max-h-44 overflow-y-auto leading-relaxed">
                            ${escapeHtml(conflict.incomingAlcanceEs)}
                          </div>
                        </div>
                        <div class="space-y-1">
                          <div class="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Inglés</div>
                          <div class="rounded-lg border border-emerald-200/80 bg-white p-2.5 text-xs ${
                            conflict.incomingAlcanceEn ? 'text-slate-900' : 'text-slate-400 italic'
                          } whitespace-pre-wrap break-words max-h-44 overflow-y-auto leading-relaxed">
                            ${escapeHtml(
                              conflict.incomingAlcanceEn ||
                                'Traducción al inglés no registrada (opcional)'
                            )}
                          </div>
                        </div>
                      </div>

                      <div class="rounded-xl border border-rose-200 bg-rose-50/40 p-3 space-y-2.5 min-w-0">
                        <div class="text-xs font-bold text-rose-900">
                          Alcance Actual de ${escapeHtml(conflict.targetNumeroCertificado)} (será borrado/reemplazado)
                        </div>
                        <div class="space-y-1">
                          <div class="text-[10px] font-bold uppercase tracking-wider text-rose-800">Español</div>
                          <div class="rounded-lg border border-rose-200/80 bg-white p-2.5 text-xs text-slate-900 whitespace-pre-wrap break-words max-h-44 overflow-y-auto leading-relaxed">
                            ${escapeHtml(conflict.existingAlcanceEs)}
                          </div>
                        </div>
                        <div class="space-y-1">
                          <div class="text-[10px] font-bold uppercase tracking-wider text-rose-800">Inglés</div>
                          <div class="rounded-lg border border-rose-200/80 bg-white p-2.5 text-xs ${
                            conflict.existingAlcanceEn ? 'text-slate-900' : 'text-slate-400 italic'
                          } whitespace-pre-wrap break-words max-h-44 overflow-y-auto leading-relaxed">
                            ${escapeHtml(
                              conflict.existingAlcanceEn ||
                                'Traducción al inglés no registrada (opcional)'
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                `
              )
              .join('')}

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

          <footer class="px-5 py-3.5 border-t border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              id="cancelAlcanceConflictBtn"
              data-action="cancel-alcance-conflict"
              ${modalState.submitting ? 'disabled' : ''}
              class="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              id="confirmReplaceAlcanceShareBtn"
              data-action="confirm-replace-alcance-share"
              ${modalState.submitting ? 'disabled' : ''}
              class="px-4 py-2 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer whitespace-nowrap disabled:opacity-45 disabled:cursor-not-allowed"
            >
              ${modalState.submitting ? 'Reemplazando...' : 'Continuar y Reemplazar Alcance'}
            </button>
          </footer>
        </div>
      </div>
    `;
  }

  const canConfirm =
    !modalState.submitting &&
    hasSourceAlcance &&
    eligibility.missingConglomeradoReason === null &&
    filteredTargets.length > 0 &&
    selectedTargetIds.length > 0 &&
    Boolean(planResult && planResult.validationErrors.length === 0);

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
              Compartir Alcance de ${escapeHtml(sourceCert.numero_certificado)}
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
          <section class="space-y-2.5" aria-label="Paso 1: Alcance origen">
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-700">
              1. Alcance del certificado a compartir
            </h3>
            ${
              hasSourceAlcance && sourceAlcance
                ? `
                  <div class="rounded-xl border border-indigo-200 bg-indigo-50/30 p-3.5 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div class="space-y-1 min-w-0">
                      <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Español</div>
                      <div class="rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-900 whitespace-pre-wrap break-words max-h-36 overflow-y-auto leading-relaxed">
                        ${escapeHtml(sourceAlcance.alcance_es)}
                      </div>
                    </div>
                    <div class="space-y-1 min-w-0">
                      <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Inglés</div>
                      <div class="rounded-lg border border-slate-200 bg-white p-2.5 text-xs ${
                        sourceAlcance.alcance_en?.trim()
                          ? 'text-slate-900'
                          : 'text-slate-400 italic'
                      } whitespace-pre-wrap break-words max-h-36 overflow-y-auto leading-relaxed">
                        ${escapeHtml(
                          sourceAlcance.alcance_en?.trim() ||
                            'Traducción al inglés no registrada (opcional)'
                        )}
                      </div>
                    </div>
                  </div>
                `
                : `
                  <div class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                    Este certificado no posee un Alcance activo en español para compartir.
                  </div>
                `
            }
          </section>

          <section class="space-y-2.5" aria-label="Paso 2: Certificados destino del conglomerado">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="space-y-0.5">
                <h3 class="text-xs font-bold uppercase tracking-wider text-slate-700">
                  2. Certificados destino del mismo Conglomerado
                </h3>
                <p class="text-[11px] text-slate-500 tabular-nums">
                  ${selectedTargetIds.length} de ${filteredTargets.length} certificado${filteredTargets.length === 1 ? '' : 's'} elegible${filteredTargets.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>

            ${renderTargetCertificatesStep({
              targets: filteredTargets,
              selectedTargetIds: selectedTargetSet,
              alreadyLinkedByTargetId: new Map(),
              duplicateConflictByTargetId: new Map(),
              alcanceStatusByTargetId,
              emptyTargetsOverrideMessage:
                eligibility.targets.length > 0 && filteredTargets.length === 0
                  ? 'Todos los demás certificados elegibles del conglomerado ya comparten exactamente este Alcance o son su propietario original.'
                  : undefined,
              missingConglomeradoReason: eligibility.missingConglomeradoReason,
              sourceGroupNombre: eligibility.sourceGroupNombre,
              submitting: modalState.submitting,
            })}
          </section>

          ${
            planResult && planResult.conflicts.length > 0
              ? `
                <div role="status" class="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                  ⚠️ ${planResult.conflicts.length} certificado${planResult.conflicts.length === 1 ? '' : 's'} seleccionado${planResult.conflicts.length === 1 ? '' : 's'} ya tiene${planResult.conflicts.length === 1 ? '' : 'n'} un Alcance registrado. Al continuar se abrirá la pantalla de comparación y confirmación de reemplazo.
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
              selectedTargetIds.length > 0
                ? `Se compartirá el Alcance con <strong class="text-slate-800">${selectedTargetIds.length}</strong> certificado${selectedTargetIds.length === 1 ? '' : 's'}.`
                : 'Seleccione certificados destino del conglomerado para compartir el Alcance.'
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
              ${modalState.submitting ? 'Procesando...' : 'Compartir'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  `;
}

interface ProcesoNormRulePreviewItem {
  id_proceso: string;
  nombre_proceso: string;
  targetCertId: string;
  targetNumeroCertificado: string;
  targetNormaCodigo: string;
  sameNorm: boolean;
  sincronizar_requisitos: boolean;
  requisitoIds: ReadonlyArray<string>;
  excludedByIso43Codes: ReadonlyArray<string>;
  contextSubtitle?: string;
}

function renderProcesoNormRulePreviewPanel(params: {
  sourceCert: CertificadoDetailEntity;
  items: ReadonlyArray<ProcesoNormRulePreviewItem>;
  shareProcesoWithRequisitos: boolean;
  submitting: boolean;
  headingTitle?: string;
}): string {
  const {
    sourceCert,
    items,
    shareProcesoWithRequisitos,
    submitting,
    headingTitle = '3. Regla de Requisitos por Norma',
  } = params;
  if (items.length === 0) return '';

  const hasSameNorm = items.some((item) => item.sameNorm);

  return `
    <section class="space-y-3 pt-1" aria-label="${escapeHtml(headingTitle)}">
      <div class="space-y-0.5">
        <h4 class="text-xs font-bold uppercase tracking-wider text-slate-700">
          ${escapeHtml(headingTitle)}
        </h4>
        <p class="text-[11px] text-slate-500">
          Misma norma permite compartir y sincronizar cláusulas; normas distintas comparten solo la estructura del proceso.
        </p>
      </div>

      ${
        hasSameNorm
          ? `
            <label class="flex items-start gap-2.5 p-3 rounded-xl border border-emerald-200 bg-emerald-50/70 cursor-pointer">
              <input
                id="shareProcesoWithReqsCheckbox"
                type="checkbox"
                data-action="toggle-share-proceso-reqs"
                ${shareProcesoWithRequisitos ? 'checked' : ''}
                ${submitting ? 'disabled' : ''}
                class="mt-0.5 h-4 w-4 rounded border-emerald-400 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
              />
              <div class="min-w-0 space-y-0.5">
                <div class="text-xs font-bold text-slate-900">
                  Compartir también las cláusulas normativas y mantenerlas sincronizadas (misma norma)
                </div>
                <p class="text-[11px] text-slate-600 leading-snug">
                  ${
                    shareProcesoWithRequisitos
                      ? 'Copia y sincroniza los requisitos aplicables en certificados de la misma norma (respetando exclusiones ISO 4.3).'
                      : 'Desmarcado: comparte solo el proceso vacío para gestionar o sincronizar sus cláusulas por separado luego.'
                  }
                </p>
              </div>
            </label>
          `
          : ''
      }

      <div class="space-y-2">
        ${items
          .map((item) => {
            const excludedSummary =
              item.excludedByIso43Codes.length > 0
                ? ` (${item.excludedByIso43Codes.length} omitida(s) por exclusión ISO 4.3: ${item.excludedByIso43Codes.join(', ')})`
                : '';

            const badgeHtml = item.sameNorm
              ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border bg-emerald-50 text-emerald-800 border-emerald-200 shrink-0 whitespace-nowrap">Misma norma (${escapeHtml(item.targetNormaCodigo)})</span>`
              : `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border bg-slate-100 text-slate-700 border-slate-300 shrink-0 whitespace-nowrap">Norma distinta (${escapeHtml(sourceCert.norma_codigo)} → ${escapeHtml(item.targetNormaCodigo)})</span>`;

            const descriptionText = item.sameNorm
              ? shareProcesoWithRequisitos
                ? `Se compartirá el proceso junto con ${item.requisitoIds.length} cláusula(s) aplicable(s) y sincronización activa.${excludedSummary}`
                : 'Se compartirá solo el proceso vacío; requisitos independientes (podrá sincronizar cláusulas luego).'
              : 'Los certificados pertenecen a normas distintas. Se compartirá únicamente el proceso vacío (0 requisitos); cada norma mantiene sus cláusulas de forma independiente.';

            return `
              <div class="rounded-xl border ${
                item.sameNorm
                  ? 'border-emerald-200 bg-white'
                  : 'border-slate-200 bg-slate-50/80'
              } p-3 space-y-1">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="text-xs font-bold text-slate-900 min-w-0">
                    ${escapeHtml(item.nombre_proceso)}
                    <span class="font-normal text-slate-500"> → ${escapeHtml(item.targetNumeroCertificado)}</span>
                    ${
                      item.contextSubtitle
                        ? `<span class="font-medium text-indigo-700"> · ${escapeHtml(item.contextSubtitle)}</span>`
                        : ''
                    }
                  </div>
                  ${badgeHtml}
                </div>
                <p class="text-[11px] ${
                  item.sameNorm ? 'text-slate-700' : 'text-slate-600'
                } leading-snug">
                  ${escapeHtml(descriptionText)}
                </p>
              </div>
            `;
          })
          .join('')}
      </div>
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
  const shareWithReqs = modalState.shareProcesoWithRequisitos !== false;
  const previewItems: ProcesoNormRulePreviewItem[] = [];
  if (cascadePlan) {
    for (const ps of cascadePlan.procesoSharesWithClausePlans) {
      previewItems.push({
        id_proceso: ps.id_proceso,
        nombre_proceso: ps.nombre_proceso,
        targetCertId: ps.targetCertId,
        targetNumeroCertificado: ps.targetNumeroCertificado,
        targetNormaCodigo: ps.targetNormaCodigo,
        sameNorm: ps.sameNorm,
        sincronizar_requisitos: ps.sincronizar_requisitos,
        requisitoIds: ps.requisitoIds,
        excludedByIso43Codes: ps.excludedByIso43Codes,
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

              ${renderProcesoNormRulePreviewPanel({
                sourceCert,
                items: previewItems,
                shareProcesoWithRequisitos: shareWithReqs,
                submitting: modalState.submitting,
                headingTitle: 'Regla de Requisitos por Norma (Cascada de Procesos)',
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

  if (kind === 'alcance') {
    return renderAlcanceShareModal({
      sourceCert,
      modalState,
      eligibility,
      certificates,
      organizaciones,
      conglomerados,
      profile,
      authorizedClientOrgIds,
    });
  }

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
  let procesoPlan: PlanShareProcesosResult | null = null;
  let sitioCascadePlan: SitioShareExecutionPlan | null = null;
  const duplicateConflictByTargetId = new Map<string, string[]>();
  const shareProcesoWithReqs = modalState.shareProcesoWithRequisitos !== false;
  const syncReqsSameNorm =
    shareProcesoWithReqs && modalState.syncRequisitosSameNorm !== false;

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
      procesoPlan = planShareProcesos({
        sourceCert,
        selectedProcesoIds: selectedItemIds,
        targetCertIds: selectedTargetIds,
        allCertificates: certificates,
        organizaciones,
        conglomerados,
        profile,
        authorizedClientOrgIds,
        shareWithRequisitos: shareProcesoWithReqs,
        syncRequisitosWithSameNorm: syncReqsSameNorm,
        requirementsCatalog,
        archivedProcesoIds,
        archivedNoAplicableIds,
      });
      for (const conflict of procesoPlan.conflicts) {
        if (conflict.kind === 'DUPLICATE_PROCESO_NAME') {
          const list = duplicateConflictByTargetId.get(conflict.id_certificado) || [];
          list.push(conflict.message);
          duplicateConflictByTargetId.set(conflict.id_certificado, list);
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
        shareProcesosWithRequisitos: shareProcesoWithReqs,
      });
    }
  }

  const isExecutable =
    kind === 'contacto'
      ? Boolean(contactoPlan?.isExecutable)
      : kind === 'turno'
      ? Boolean(turnoPlan?.isExecutable)
      : kind === 'proceso'
      ? Boolean(procesoPlan?.isExecutable)
      : Boolean(sitioCascadePlan?.isExecutable);

  const duplicateConflicts = [
    ...(contactoPlan?.conflicts.filter((c) => c.kind === 'DUPLICATE_CONTACT_NAME') || []),
    ...(procesoPlan?.conflicts.filter((c) => c.kind === 'DUPLICATE_PROCESO_NAME') || []),
  ];

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
        procesoPlan !== null &&
        procesoPlan.outcomes.length === 0 &&
        procesoPlan.alreadyShared.length > 0) ||
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
      ? procesoPlan?.outcomes.length ?? 0
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
            kind === 'proceso' && procesoPlan && procesoPlan.outcomes.length > 0
              ? renderProcesoNormRulePreviewPanel({
                  sourceCert,
                  items: procesoPlan.outcomes.map((outcome) => ({
                    id_proceso: outcome.id_proceso,
                    nombre_proceso: outcome.nombre_proceso,
                    targetCertId: outcome.id_certificado_destino,
                    targetNumeroCertificado: outcome.target_numero_certificado,
                    targetNormaCodigo: outcome.target_norma_codigo,
                    sameNorm: outcome.sameNorm,
                    sincronizar_requisitos: outcome.sincronizar_requisitos,
                    requisitoIds: outcome.requisitoIds,
                    excludedByIso43Codes: outcome.excludedByIso43Codes,
                  })),
                  shareProcesoWithRequisitos: shareProcesoWithReqs,
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
                    Desmarque el registro o el certificado destino en conflicto para continuar.
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
