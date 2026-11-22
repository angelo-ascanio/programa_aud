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
import type { UserProfile } from '../lib/healthCheck';
import { escapeHtml } from '../lib/html';
import type {
  CertificadoDetailEntity,
  ContactoCertificadoEntity,
  ShiftEntity,
} from '../lib/multisiteSampling';
import { formatTurnoTime } from '../lib/turnoDomain';

export type ShareModalKind = 'contacto' | 'turno';

export interface ShareModalState {
  isOpen: boolean;
  kind: ShareModalKind;
  sourceCertId: string;
  selectedItemIds: string[];
  selectedTargetCertIds: string[];
  autoLinkTargetSites: boolean;
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
    submitting: false,
    errorMessage: null,
  };
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

function renderTargetCertificatesStep(params: {
  targets: ReadonlyArray<EligibleShareTargetCertificate>;
  selectedTargetIds: ReadonlySet<string>;
  alreadyLinkedByTargetId: ReadonlyMap<string, { anyLinked: boolean; allLinked: boolean }>;
  duplicateConflictByTargetId: ReadonlyMap<string, string[]>;
  missingConglomeradoReason: string | null;
  sourceGroupNombre: string | null;
  submitting: boolean;
}): string {
  const {
    targets,
    selectedTargetIds,
    alreadyLinkedByTargetId,
    duplicateConflictByTargetId,
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
    <div class="space-y-1.5 max-h-56 overflow-y-auto pr-1">
      ${targets
        .map((target) => {
          const checked = selectedTargetIds.has(target.id);
          const linkedInfo = alreadyLinkedByTargetId.get(target.id);
          const targetConflicts = duplicateConflictByTargetId.get(target.id) || [];
          const hasConflict = targetConflicts.length > 0;
          const statusClass = getStatusChipClass(target.estatus);
          return `
            <label class="flex items-start justify-between gap-3 p-2.5 rounded-xl border transition-colors cursor-pointer ${
              hasConflict
                ? 'border-rose-300 bg-rose-50/60'
                : checked
                ? 'border-indigo-300 bg-indigo-50/50'
                : 'border-slate-200 bg-white hover:bg-slate-50'
            }">
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
            </label>
          `;
        })
        .join('')}
    </div>
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
  } = props;

  if (!modalState.isOpen || !isApprovedStaffProfile(profile)) {
    return '';
  }

  const sourceCert = certificates.find((c) => c.id === modalState.sourceCertId);
  if (!sourceCert) {
    return '';
  }

  const isContacto = modalState.kind === 'contacto';
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

  const validSourceItemIds = new Set(
    isContacto ? activeContacts.map((c) => c.id) : activeTurnos.map((t) => t.id)
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
      if (isContacto) {
        for (const c of activeContacts) {
          if (!selectedItemSet.has(c.id)) continue;
          if (isContactLinkedToTargetCert(c, targetCert)) {
            linkedCount += 1;
          }
        }
      } else {
        for (const t of activeTurnos) {
          if (!selectedItemSet.has(t.id)) continue;
          if (isShiftLinkedToTargetCert(t, targetCert)) {
            linkedCount += 1;
          }
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
  const duplicateConflictByTargetId = new Map<string, string[]>();

  if (selectedItemIds.length > 0 && selectedTargetIds.length > 0) {
    if (isContacto) {
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
    } else {
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
    }
  }

  const isExecutable = isContacto
    ? Boolean(contactoPlan?.isExecutable)
    : Boolean(turnoPlan?.isExecutable);

  const duplicateConflicts =
    contactoPlan?.conflicts.filter((c) => c.kind === 'DUPLICATE_CONTACT_NAME') || [];

  const allAlreadySharedOnly =
    selectedItemIds.length > 0 &&
    selectedTargetIds.length > 0 &&
    duplicateConflicts.length === 0 &&
    ((isContacto &&
      contactoPlan !== null &&
      contactoPlan.toCreateLinks.length === 0 &&
      contactoPlan.alreadyShared.length > 0) ||
      (!isContacto &&
        turnoPlan !== null &&
        turnoPlan.certLinksToCreate.length === 0 &&
        turnoPlan.turnosPorSitioToCreate.length === 0 &&
        turnoPlan.alreadyShared.length > 0));

  const headerTitle = isContacto
    ? `Compartir Contactos de ${sourceCert.numero_certificado}`
    : `Compartir Turnos de ${sourceCert.numero_certificado}`;

  const conglomerateSubtitle = eligibility.sourceGroupNombre
    ? `Conglomerado: ${eligibility.sourceGroupNombre} · ${sourceCert.organizacion_nombre}`
    : `${sourceCert.organizacion_nombre} · ${sourceCert.norma_codigo}`;

  const totalItemsCount = isContacto ? activeContacts.length : activeTurnos.length;

  const canConfirm =
    !modalState.submitting &&
    eligibility.missingConglomeradoReason === null &&
    eligibility.targets.length > 0 &&
    isExecutable;

  const newLinksCount = isContacto
    ? contactoPlan?.toCreateLinks.length ?? 0
    : (turnoPlan?.certLinksToCreate.length ?? 0) +
      (turnoPlan?.turnosPorSitioToCreate.length ?? 0);

  return `
    <div
      id="shareModalBackdrop"
      class="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shareModalTitle"
    >
      <div class="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden my-auto">
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
                  1. ${isContacto ? 'Contactos a compartir' : 'Turnos operativos a compartir'}
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
              isContacto
                ? renderContactoItemsStep({
                    items: activeContacts,
                    selectedIds: selectedItemSet,
                    submitting: modalState.submitting,
                  })
                : renderTurnoItemsStep({
                    items: activeTurnos,
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
              missingConglomeradoReason: eligibility.missingConglomeradoReason,
              sourceGroupNombre: eligibility.sourceGroupNombre,
              submitting: modalState.submitting,
            })}
          </section>

          ${
            !isContacto && eligibility.targets.length > 0 && !eligibility.missingConglomeradoReason
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
