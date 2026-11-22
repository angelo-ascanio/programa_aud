/**
 * Step 2.1 — Conglomerate Certificate Sharing Domain Engine (`Contacto` & `Turno`)
 *
 * Strictly typed (`strict: true`, 0 `any` / `as any`) and Zero-UUID compliant
 * in all user-facing messages and validation errors.
 */

import { assertValidUuid, isValidUuid } from './zeroUuid';
import type { OrganizacionEntity } from './activeCertificates';
import {
  hasOrganizationValidConglomerado,
  type ConglomeradoEntity,
} from './conglomeradoDomain';
import type { UserProfile } from './healthCheck';
import type {
  CertificadoDetailEntity,
  ContactoCertificadoEntity,
  ShiftEntity,
  SiteEntity,
} from './multisiteSampling';

export interface EligibleShareTargetCertificate {
  id: string;
  numero_certificado: string;
  id_organizacion: string;
  organizacion_nombre: string;
  norma_codigo: string;
  norma_titulo: string;
  estatus: string;
  id_grupo_empresarial: string;
  grupo_empresarial_nombre: string;
  sitiosCount: number;
}

export interface EligibleShareTargetsResult {
  targets: EligibleShareTargetCertificate[];
  sourceGroupId: string | null;
  sourceGroupNombre: string | null;
  missingConglomeradoReason: string | null;
}

export interface GetEligibleShareTargetsParams {
  sourceCert: CertificadoDetailEntity;
  allCertificates: ReadonlyArray<CertificadoDetailEntity>;
  organizaciones: ReadonlyArray<OrganizacionEntity>;
  conglomerados: ReadonlyArray<ConglomeradoEntity>;
  profile?: UserProfile | null;
  authorizedClientOrgIds?: ReadonlyArray<string>;
}

function normalizeLabel(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase();
}

function isSiteDeleted(site: SiteEntity): boolean {
  const maybeDeleted = (site as SiteEntity & { deleted_at?: string | null }).deleted_at;
  return Boolean(maybeDeleted);
}

function isShiftDeleted(shift: ShiftEntity): boolean {
  const maybeDeleted = (shift as ShiftEntity & { deleted_at?: string | null }).deleted_at;
  return Boolean(maybeDeleted);
}

function isContactDeleted(contact: ContactoCertificadoEntity): boolean {
  const maybeDeleted = (
    contact as ContactoCertificadoEntity & { deleted_at?: string | null }
  ).deleted_at;
  return Boolean(maybeDeleted);
}

function resolveShiftTimeLabel(shift: Pick<ShiftEntity, 'hora_entrada' | 'hora_salida' | 'descripcion'>): string {
  const desc = (shift.descripcion || '').trim();
  const start = (shift.hora_entrada || '').trim().slice(0, 5);
  const end = (shift.hora_salida || '').trim().slice(0, 5);
  if (desc && start && end) {
    return `${desc} (${start} – ${end})`;
  }
  if (desc) return desc;
  if (start && end) return `Turno ${start} – ${end}`;
  return 'Turno operativo';
}

/**
 * Computes eligible target certificates inside the same active Conglomerado (`grupo_empresarial`)
 * while respecting Level 2 RBAC client isolation.
 */
export function getEligibleShareTargetCertificates(
  params: GetEligibleShareTargetsParams
): EligibleShareTargetsResult {
  const {
    sourceCert,
    allCertificates,
    organizaciones,
    conglomerados,
    profile = null,
    authorizedClientOrgIds,
  } = params;

  const sourceCertId = assertValidUuid(sourceCert.id, 'certificado origen');
  const sourceOrgId = assertValidUuid(sourceCert.id_organizacion, 'organización origen');

  const activeOrgsById = new Map<string, OrganizacionEntity>();
  for (const org of organizaciones) {
    if (!org.deleted_at && isValidUuid(org.id)) {
      activeOrgsById.set(org.id.trim(), org);
    }
  }

  const activeGroupsById = new Map<string, ConglomeradoEntity>();
  for (const group of conglomerados) {
    if (!group.deleted_at && isValidUuid(group.id)) {
      activeGroupsById.set(group.id.trim(), group);
    }
  }

  const sourceOrg = activeOrgsById.get(sourceOrgId);
  if (!hasOrganizationValidConglomerado(sourceOrg, conglomerados) || !sourceOrg?.id_grupo_empresarial) {
    return {
      targets: [],
      sourceGroupId: null,
      sourceGroupNombre: null,
      missingConglomeradoReason:
        'La organización del certificado origen no pertenece a un Conglomerado activo. Asigne primero un conglomerado válido para habilitar la compartición.',
    };
  }

  const sourceGroupId = assertValidUuid(
    sourceOrg.id_grupo_empresarial,
    'conglomerado origen'
  );
  const sourceGroup = activeGroupsById.get(sourceGroupId);
  if (!sourceGroup) {
    return {
      targets: [],
      sourceGroupId: null,
      sourceGroupNombre: null,
      missingConglomeradoReason:
        'El Conglomerado de la organización origen se encuentra archivado o no disponible.',
    };
  }

  if (profile) {
    if (profile.status !== 'APPROVED') {
      return {
        targets: [],
        sourceGroupId,
        sourceGroupNombre: sourceGroup.nombre,
        missingConglomeradoReason:
          'El usuario debe tener estatus APPROVED para consultar certificados compartibles del conglomerado.',
      };
    }
    if (profile.role === 'AUDITOR') {
      return {
        targets: [],
        sourceGroupId,
        sourceGroupNombre: sourceGroup.nombre,
        missingConglomeradoReason: null,
      };
    }
  }

  const shouldScopeByClientOrgIds =
    profile?.role === 'CLIENT' ||
    (profile === null && authorizedClientOrgIds !== undefined);

  const allowedClientOrgSet = new Set<string>();
  if (shouldScopeByClientOrgIds) {
    for (const orgId of authorizedClientOrgIds || []) {
      if (isValidUuid(orgId)) {
        allowedClientOrgSet.add(orgId.trim());
      }
    }
  }

  const seenTargetCertIds = new Set<string>();
  const targets: EligibleShareTargetCertificate[] = [];

  for (const candidate of allCertificates) {
    if (candidate.deleted_at) continue;
    if (!isValidUuid(candidate.id) || !isValidUuid(candidate.id_organizacion)) continue;
    const candidateId = candidate.id.trim();
    const candidateOrgId = candidate.id_organizacion.trim();

    if (candidateId === sourceCertId) continue;
    if (seenTargetCertIds.has(candidateId)) continue;

    const targetOrg = activeOrgsById.get(candidateOrgId);
    if (!targetOrg) continue;
    if ((targetOrg.id_grupo_empresarial || '').trim() !== sourceGroupId) continue;

    if (shouldScopeByClientOrgIds && !allowedClientOrgSet.has(candidateOrgId)) {
      continue;
    }

    seenTargetCertIds.add(candidateId);
    targets.push({
      id: candidateId,
      numero_certificado: candidate.numero_certificado,
      id_organizacion: candidateOrgId,
      organizacion_nombre: candidate.organizacion_nombre || targetOrg.nombre,
      norma_codigo: candidate.norma_codigo,
      norma_titulo: candidate.norma_titulo,
      estatus: candidate.estatus,
      id_grupo_empresarial: sourceGroupId,
      grupo_empresarial_nombre: sourceGroup.nombre,
      sitiosCount: (candidate.sitios || []).filter((s) => !isSiteDeleted(s)).length,
    });
  }

  targets.sort((a, b) => {
    const orgCmp = a.organizacion_nombre.localeCompare(b.organizacion_nombre, 'es');
    if (orgCmp !== 0) return orgCmp;
    return a.numero_certificado.localeCompare(b.numero_certificado, 'es');
  });

  return {
    targets,
    sourceGroupId,
    sourceGroupNombre: sourceGroup.nombre,
    missingConglomeradoReason: null,
  };
}

// =============================================================================
// Contacto Selective Sharing & Unlink Governance
// =============================================================================

export interface ExistingContactoShareLinkRef {
  id?: string;
  id_contacto: string;
  id_certificado: string;
  deleted_at?: string | null;
}

export interface ContactoShareLinkDraft {
  id_contacto: string;
  contacto_nombre: string;
  owner_cert_id: string;
  id_certificado: string;
  target_numero_certificado: string;
  target_organizacion_nombre: string;
}

export interface ContactoAlreadySharedItem {
  id_contacto: string;
  contacto_nombre: string;
  id_certificado: string;
  target_numero_certificado: string;
  code: 'ALREADY_SHARED';
  message: string;
}

export type ShareContactoConflictKind =
  | 'DUPLICATE_CONTACT_NAME'
  | 'OWNER_SELF_SHARE'
  | 'INELIGIBLE_TARGET';

export interface ContactoShareConflictItem {
  kind: ShareContactoConflictKind;
  id_contacto: string;
  contacto_nombre: string;
  id_certificado: string;
  target_numero_certificado: string;
  message: string;
}

export interface ContactoSkippedOwnerItem {
  id_contacto: string;
  contacto_nombre: string;
  id_certificado: string;
  target_numero_certificado: string;
  code: 'OWNER_SELF_SHARE';
  message: string;
}

export interface PlanShareContactosParams {
  sourceCert: CertificadoDetailEntity;
  selectedContactoIds: ReadonlyArray<string>;
  targetCertIds: ReadonlyArray<string>;
  allCertificates: ReadonlyArray<CertificadoDetailEntity>;
  organizaciones: ReadonlyArray<OrganizacionEntity>;
  conglomerados: ReadonlyArray<ConglomeradoEntity>;
  profile?: UserProfile | null;
  authorizedClientOrgIds?: ReadonlyArray<string>;
  existingShareLinks?: ReadonlyArray<ExistingContactoShareLinkRef>;
  archivedContactoIds?: ReadonlySet<string>;
}

export interface PlanShareContactosResult {
  toCreateLinks: ContactoShareLinkDraft[];
  alreadyShared: ContactoAlreadySharedItem[];
  skippedOwnerTargets: ContactoSkippedOwnerItem[];
  conflicts: ContactoShareConflictItem[];
  validationErrors: string[];
  isExecutable: boolean;
}

function dedupeTrimmedIds(ids: ReadonlyArray<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const clean = (raw || '').trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

export function planShareContactos(
  params: PlanShareContactosParams
): PlanShareContactosResult {
  const {
    sourceCert,
    selectedContactoIds,
    targetCertIds,
    allCertificates,
    organizaciones,
    conglomerados,
    profile = null,
    authorizedClientOrgIds,
    existingShareLinks = [],
    archivedContactoIds,
  } = params;

  const toCreateLinks: ContactoShareLinkDraft[] = [];
  const alreadyShared: ContactoAlreadySharedItem[] = [];
  const skippedOwnerTargets: ContactoSkippedOwnerItem[] = [];
  const conflicts: ContactoShareConflictItem[] = [];
  const validationErrors: string[] = [];

  if (!isValidUuid(sourceCert.id) || !isValidUuid(sourceCert.id_organizacion)) {
    validationErrors.push(
      'El certificado u organización origen no posee un identificador válido.'
    );
    return {
      toCreateLinks,
      alreadyShared,
      skippedOwnerTargets,
      conflicts,
      validationErrors,
      isExecutable: false,
    };
  }

  const cleanContactoIds = dedupeTrimmedIds(selectedContactoIds);
  const cleanTargetCertIds = dedupeTrimmedIds(targetCertIds);

  if (cleanContactoIds.length === 0) {
    validationErrors.push('Debe seleccionar al menos un contacto para compartir.');
  }
  if (cleanTargetCertIds.length === 0) {
    validationErrors.push(
      'Debe seleccionar al menos un certificado destino dentro del conglomerado.'
    );
  }

  const eligibility = getEligibleShareTargetCertificates({
    sourceCert,
    allCertificates,
    organizaciones,
    conglomerados,
    profile,
    authorizedClientOrgIds,
  });

  if (eligibility.missingConglomeradoReason) {
    validationErrors.push(eligibility.missingConglomeradoReason);
  }

  const eligibleById = new Map<string, EligibleShareTargetCertificate>(
    eligibility.targets.map((t) => [t.id, t])
  );
  const certById = new Map<string, CertificadoDetailEntity>(
    allCertificates.filter((c) => !c.deleted_at).map((c) => [c.id.trim(), c])
  );
  certById.set(sourceCert.id.trim(), sourceCert);

  const sourceContactsById = new Map<string, ContactoCertificadoEntity>();
  for (const contact of sourceCert.contactos || []) {
    if (archivedContactoIds?.has(contact.id) || isContactDeleted(contact)) continue;
    sourceContactsById.set(contact.id.trim(), contact);
  }

  const resolvedContacts: Array<{
    contact: ContactoCertificadoEntity;
    ownerCertId: string;
  }> = [];

  for (const contactoId of cleanContactoIds) {
    if (!isValidUuid(contactoId)) {
      validationErrors.push('Uno de los contactos seleccionados no es válido.');
      continue;
    }
    const contact = sourceContactsById.get(contactoId);
    if (!contact) {
      validationErrors.push(
        `El contacto seleccionado no existe o está archivado en el certificado ${sourceCert.numero_certificado}.`
      );
      continue;
    }
    const rawOwner = (contact.ownerCertId || contact.id_certificado || sourceCert.id).trim();
    if (!isValidUuid(rawOwner)) {
      validationErrors.push(
        `El contacto "${contact.nombre}" no tiene un certificado propietario válido.`
      );
      continue;
    }
    resolvedContacts.push({ contact, ownerCertId: rawOwner });
  }

  // Index active external link rows by contactId -> Set<certId>
  const activeShareCertsByContacto = new Map<string, Set<string>>();
  for (const link of existingShareLinks) {
    if (link.deleted_at) continue;
    if (!isValidUuid(link.id_contacto) || !isValidUuid(link.id_certificado)) continue;
    const cId = link.id_contacto.trim();
    const tId = link.id_certificado.trim();
    const set = activeShareCertsByContacto.get(cId) || new Set<string>();
    set.add(tId);
    activeShareCertsByContacto.set(cId, set);
  }

  for (const rawTargetId of cleanTargetCertIds) {
    if (!isValidUuid(rawTargetId)) {
      validationErrors.push('Uno de los certificados destino seleccionados no es válido.');
      continue;
    }

    const eligibleTarget = eligibleById.get(rawTargetId);
    const targetCertEntity = certById.get(rawTargetId);

    if (!eligibleTarget) {
      if (rawTargetId === sourceCert.id.trim()) {
        for (const { contact } of resolvedContacts) {
          conflicts.push({
            kind: 'OWNER_SELF_SHARE',
            id_contacto: contact.id,
            contacto_nombre: contact.nombre,
            id_certificado: rawTargetId,
            target_numero_certificado: sourceCert.numero_certificado,
            message: `No puede compartir el contacto "${contact.nombre}" hacia el mismo certificado origen (${sourceCert.numero_certificado}).`,
          });
        }
      } else {
        const targetLabel = targetCertEntity?.numero_certificado || 'destino seleccionado';
        validationErrors.push(
          `El certificado ${targetLabel} no es elegible para compartición en este conglomerado o está fuera de su alcance autorizado.`
        );
      }
      continue;
    }

    const targetContacts = (targetCertEntity?.contactos || []).filter(
      (c) => !archivedContactoIds?.has(c.id) && !isContactDeleted(c)
    );

    for (const { contact, ownerCertId } of resolvedContacts) {
      if (rawTargetId === ownerCertId) {
        skippedOwnerTargets.push({
          id_contacto: contact.id,
          contacto_nombre: contact.nombre,
          id_certificado: rawTargetId,
          target_numero_certificado: eligibleTarget.numero_certificado,
          code: 'OWNER_SELF_SHARE',
          message: `Se omitió el certificado ${eligibleTarget.numero_certificado} porque es el propietario original del contacto "${contact.nombre}".`,
        });
        continue;
      }

      const isAlreadyLinkedInTarget = targetContacts.some((tc) => tc.id === contact.id);
      const isAlreadyInMetadata = (contact.sharedTargets || []).some(
        (st) => st.targetCertId === rawTargetId
      );
      const isAlreadyInBridge = activeShareCertsByContacto.get(contact.id)?.has(rawTargetId) ?? false;

      if (isAlreadyLinkedInTarget || isAlreadyInMetadata || isAlreadyInBridge) {
        alreadyShared.push({
          id_contacto: contact.id,
          contacto_nombre: contact.nombre,
          id_certificado: rawTargetId,
          target_numero_certificado: eligibleTarget.numero_certificado,
          code: 'ALREADY_SHARED',
          message: `El contacto "${contact.nombre}" ya se encuentra compartido activamente con el certificado ${eligibleTarget.numero_certificado}.`,
        });
        continue;
      }

      const normalizedSourceName = normalizeLabel(contact.nombre);
      const duplicateTargetContact = targetContacts.find(
        (tc) => tc.id !== contact.id && normalizeLabel(tc.nombre) === normalizedSourceName
      );

      if (duplicateTargetContact) {
        conflicts.push({
          kind: 'DUPLICATE_CONTACT_NAME',
          id_contacto: contact.id,
          contacto_nombre: contact.nombre,
          id_certificado: rawTargetId,
          target_numero_certificado: eligibleTarget.numero_certificado,
          message: `Conflicto de nombre: ya existe un contacto activo llamado "${contact.nombre.trim()}" en el certificado destino ${eligibleTarget.numero_certificado}.`,
        });
        continue;
      }

      toCreateLinks.push({
        id_contacto: contact.id,
        contacto_nombre: contact.nombre,
        owner_cert_id: ownerCertId,
        id_certificado: rawTargetId,
        target_numero_certificado: eligibleTarget.numero_certificado,
        target_organizacion_nombre: eligibleTarget.organizacion_nombre,
      });
    }
  }

  const isExecutable =
    validationErrors.length === 0 &&
    conflicts.length === 0 &&
    toCreateLinks.length > 0;

  return {
    toCreateLinks,
    alreadyShared,
    skippedOwnerTargets,
    conflicts,
    validationErrors,
    isExecutable,
  };
}

export interface UnlinkShareGuardResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Only allows unlinking a shared contact from a receiving certificate (`certId !== ownerCertId`).
 * On the owner certificate, contacts must be managed or archived via governance rules.
 */
export function canUnlinkContactoFromCert(params: {
  contacto: Pick<ContactoCertificadoEntity, 'id' | 'id_certificado' | 'ownerCertId' | 'nombre'>;
  certId: string;
}): UnlinkShareGuardResult {
  const { contacto, certId } = params;
  if (!isValidUuid(certId)) {
    return {
      allowed: false,
      reason: 'El certificado indicado para desvincular no posee un identificador válido.',
    };
  }
  const ownerCertId = (contacto.ownerCertId || contacto.id_certificado || '').trim();
  if (!isValidUuid(ownerCertId)) {
    return {
      allowed: false,
      reason: `No se pudo verificar el certificado propietario del contacto "${contacto.nombre}".`,
    };
  }
  if (certId.trim() === ownerCertId) {
    return {
      allowed: false,
      reason: `No se puede desvincular a "${contacto.nombre}" desde su certificado propietario. Utilice Archivar si ya no tiene vínculos ni canales activos.`,
    };
  }
  return { allowed: true };
}

// =============================================================================
// Turno Sharing & Auto-Link Sitio 0 / Selected Sites
// =============================================================================

export interface ExistingTurnoShareLinkRef {
  id?: string;
  id_turno: string;
  id_certificado: string;
  id_certificado_origen?: string | null;
  deleted_at?: string | null;
}

export interface ExistingTurnoPorSitioRef {
  id?: string;
  id_sitio: string;
  id_turno: string;
  deleted_at?: string | null;
}

export interface TurnoCertLinkDraft {
  id_turno: string;
  turno_label: string;
  id_certificado: string;
  id_certificado_origen: string;
  target_numero_certificado: string;
  target_organizacion_nombre: string;
}

export interface TurnoPorSitioDraft {
  id_sitio: string;
  numero_sitio: number;
  nombre_sitio: string;
  id_turno: string;
  turno_label: string;
  id_certificado: string;
  target_numero_certificado: string;
}

export interface TurnoAlreadySharedItem {
  id_turno: string;
  turno_label: string;
  id_certificado: string;
  target_numero_certificado: string;
  code: 'ALREADY_SHARED';
  message: string;
}

export interface PlanShareTurnosParams {
  sourceCert: CertificadoDetailEntity;
  selectedTurnoIds: ReadonlyArray<string>;
  targetCertIds: ReadonlyArray<string>;
  autoLinkTargetSites?: boolean;
  targetSiteIdsByCertId?: Readonly<Record<string, ReadonlyArray<string>>>;
  allCertificates: ReadonlyArray<CertificadoDetailEntity>;
  organizaciones: ReadonlyArray<OrganizacionEntity>;
  conglomerados: ReadonlyArray<ConglomeradoEntity>;
  profile?: UserProfile | null;
  authorizedClientOrgIds?: ReadonlyArray<string>;
  existingTurnoCertLinks?: ReadonlyArray<ExistingTurnoShareLinkRef>;
  existingTurnosPorSitio?: ReadonlyArray<ExistingTurnoPorSitioRef>;
  archivedTurnoIds?: ReadonlySet<string>;
  archivedSiteIds?: ReadonlySet<string>;
}

export interface PlanShareTurnosResult {
  certLinksToCreate: TurnoCertLinkDraft[];
  turnosPorSitioToCreate: TurnoPorSitioDraft[];
  alreadyShared: TurnoAlreadySharedItem[];
  validationErrors: string[];
  isExecutable: boolean;
}

function isShiftAlreadyAssignedToTargetSite(params: {
  site: SiteEntity;
  shift: ShiftEntity;
  targetCertHasShift: ShiftEntity | undefined;
  existingTurnosPorSitioSet: ReadonlySet<string>;
}): boolean {
  const { site, shift, targetCertHasShift, existingTurnosPorSitioSet } = params;
  if (existingTurnosPorSitioSet.has(`${site.id.trim()}::${shift.id.trim()}`)) {
    return true;
  }
  if (
    (site.turnos_por_sitio || []).some(
      (tps) => !tps.deleted_at && tps.id_turno === shift.id
    )
  ) {
    return true;
  }
  const cleanShiftDesc = normalizeLabel(shift.descripcion);
  if (
    (site.turnos_vinculados || []).some(
      (lbl) => lbl === shift.id || (cleanShiftDesc.length > 0 && normalizeLabel(lbl) === cleanShiftDesc)
    )
  ) {
    return true;
  }
  if (
    targetCertHasShift &&
    (targetCertHasShift.sitios_vinculados || []).some(
      (siteName) => normalizeLabel(siteName) === normalizeLabel(site.nombre_sitio)
    )
  ) {
    return true;
  }
  return false;
}

function resolveCandidateTargetSitesForCert(params: {
  targetCert: CertificadoDetailEntity | undefined;
  targetCertNumber: string;
  explicitSiteIds?: ReadonlyArray<string>;
  archivedSiteIds?: ReadonlySet<string>;
  validationErrors: string[];
}): SiteEntity[] {
  const {
    targetCert,
    targetCertNumber,
    explicitSiteIds,
    archivedSiteIds,
    validationErrors,
  } = params;
  if (!targetCert) return [];

  const activeSites = (targetCert.sitios || []).filter(
    (s) => !isSiteDeleted(s) && !archivedSiteIds?.has(s.id) && isValidUuid(s.id)
  );

  if (explicitSiteIds && explicitSiteIds.length > 0) {
    const cleanExplicit = dedupeTrimmedIds(explicitSiteIds);
    const activeById = new Map<string, SiteEntity>(
      activeSites.map((s) => [s.id.trim(), s])
    );
    const selected: SiteEntity[] = [];
    for (const siteId of cleanExplicit) {
      if (!isValidUuid(siteId)) {
        validationErrors.push(
          `Uno de los sitios seleccionados en el certificado ${targetCertNumber} no es válido.`
        );
        continue;
      }
      const match = activeById.get(siteId);
      if (!match) {
        validationErrors.push(
          `El sitio seleccionado no está activo en el certificado destino ${targetCertNumber}.`
        );
        continue;
      }
      selected.push(match);
    }
    return selected;
  }

  const sitio0 = activeSites.find((s) => s.numero_sitio === 0);
  if (sitio0) {
    return [sitio0];
  }

  return activeSites;
}

export function planShareTurnos(
  params: PlanShareTurnosParams
): PlanShareTurnosResult {
  const {
    sourceCert,
    selectedTurnoIds,
    targetCertIds,
    autoLinkTargetSites = true,
    targetSiteIdsByCertId,
    allCertificates,
    organizaciones,
    conglomerados,
    profile = null,
    authorizedClientOrgIds,
    existingTurnoCertLinks = [],
    existingTurnosPorSitio = [],
    archivedTurnoIds,
    archivedSiteIds,
  } = params;

  const certLinksToCreate: TurnoCertLinkDraft[] = [];
  const turnosPorSitioToCreate: TurnoPorSitioDraft[] = [];
  const alreadyShared: TurnoAlreadySharedItem[] = [];
  const validationErrors: string[] = [];

  if (!isValidUuid(sourceCert.id) || !isValidUuid(sourceCert.id_organizacion)) {
    validationErrors.push(
      'El certificado u organización origen no posee un identificador válido.'
    );
    return {
      certLinksToCreate,
      turnosPorSitioToCreate,
      alreadyShared,
      validationErrors,
      isExecutable: false,
    };
  }

  const cleanTurnoIds = dedupeTrimmedIds(selectedTurnoIds);
  const cleanTargetCertIds = dedupeTrimmedIds(targetCertIds);

  if (cleanTurnoIds.length === 0) {
    validationErrors.push('Debe seleccionar al menos un turno operativo para compartir.');
  }
  if (cleanTargetCertIds.length === 0) {
    validationErrors.push(
      'Debe seleccionar al menos un certificado destino dentro del conglomerado.'
    );
  }

  const eligibility = getEligibleShareTargetCertificates({
    sourceCert,
    allCertificates,
    organizaciones,
    conglomerados,
    profile,
    authorizedClientOrgIds,
  });

  if (eligibility.missingConglomeradoReason) {
    validationErrors.push(eligibility.missingConglomeradoReason);
  }

  const eligibleById = new Map<string, EligibleShareTargetCertificate>(
    eligibility.targets.map((t) => [t.id, t])
  );
  const certById = new Map<string, CertificadoDetailEntity>(
    allCertificates.filter((c) => !c.deleted_at).map((c) => [c.id.trim(), c])
  );

  const sourceShiftsById = new Map<string, ShiftEntity>();
  for (const shift of sourceCert.turnos || []) {
    if (archivedTurnoIds?.has(shift.id) || isShiftDeleted(shift)) continue;
    sourceShiftsById.set(shift.id.trim(), shift);
  }

  const resolvedShifts: ShiftEntity[] = [];
  for (const turnoId of cleanTurnoIds) {
    if (!isValidUuid(turnoId)) {
      validationErrors.push('Uno de los turnos seleccionados no es válido.');
      continue;
    }
    const shift = sourceShiftsById.get(turnoId);
    if (!shift) {
      validationErrors.push(
        `El turno seleccionado no existe o está archivado en el certificado ${sourceCert.numero_certificado}.`
      );
      continue;
    }
    resolvedShifts.push(shift);
  }

  const activeCertLinksByShift = new Map<string, Set<string>>();
  for (const link of existingTurnoCertLinks) {
    if (link.deleted_at) continue;
    if (!isValidUuid(link.id_turno) || !isValidUuid(link.id_certificado)) continue;
    const sId = link.id_turno.trim();
    const cId = link.id_certificado.trim();
    const set = activeCertLinksByShift.get(sId) || new Set<string>();
    set.add(cId);
    activeCertLinksByShift.set(sId, set);
  }

  const existingTurnosPorSitioSet = new Set<string>();
  for (const tps of existingTurnosPorSitio) {
    if (tps.deleted_at) continue;
    if (!isValidUuid(tps.id_sitio) || !isValidUuid(tps.id_turno)) continue;
    existingTurnosPorSitioSet.add(`${tps.id_sitio.trim()}::${tps.id_turno.trim()}`);
  }

  const seenPlannedCertLinks = new Set<string>();
  const seenPlannedSiteLinks = new Set<string>();

  for (const rawTargetId of cleanTargetCertIds) {
    if (!isValidUuid(rawTargetId)) {
      validationErrors.push('Uno de los certificados destino seleccionados no es válido.');
      continue;
    }

    const eligibleTarget = eligibleById.get(rawTargetId);
    const targetCertEntity = certById.get(rawTargetId);

    if (!eligibleTarget) {
      if (rawTargetId === sourceCert.id.trim()) {
        validationErrors.push(
          `No puede compartir turnos hacia el mismo certificado origen (${sourceCert.numero_certificado}).`
        );
      } else {
        const targetLabel = targetCertEntity?.numero_certificado || 'destino seleccionado';
        validationErrors.push(
          `El certificado ${targetLabel} no es elegible para compartición en este conglomerado o está fuera de su alcance autorizado.`
        );
      }
      continue;
    }

    const candidateTargetSites = autoLinkTargetSites
      ? resolveCandidateTargetSitesForCert({
          targetCert: targetCertEntity,
          targetCertNumber: eligibleTarget.numero_certificado,
          explicitSiteIds: targetSiteIdsByCertId?.[rawTargetId],
          archivedSiteIds,
          validationErrors,
        })
      : [];

    for (const shift of resolvedShifts) {
      const shiftLabel = resolveShiftTimeLabel(shift);
      const targetShiftEntry = (targetCertEntity?.turnos || []).find(
        (t) => t.id.trim() === shift.id.trim() && !archivedTurnoIds?.has(t.id) && !isShiftDeleted(t)
      );

      const alreadyInMetadata = (shift.sharedTargets || []).some(
        (st) => st.targetCertId === rawTargetId
      );
      const alreadyInBridge = activeCertLinksByShift.get(shift.id.trim())?.has(rawTargetId) ?? false;
      const isAlreadyCertLinked = Boolean(targetShiftEntry) || alreadyInMetadata || alreadyInBridge;

      if (isAlreadyCertLinked) {
        alreadyShared.push({
          id_turno: shift.id.trim(),
          turno_label: shiftLabel,
          id_certificado: rawTargetId,
          target_numero_certificado: eligibleTarget.numero_certificado,
          code: 'ALREADY_SHARED',
          message: `El turno "${shiftLabel}" ya se encuentra compartido activamente con el certificado ${eligibleTarget.numero_certificado}.`,
        });
      } else {
        const linkKey = `${shift.id.trim()}::${rawTargetId}`;
        if (!seenPlannedCertLinks.has(linkKey)) {
          seenPlannedCertLinks.add(linkKey);
          certLinksToCreate.push({
            id_turno: shift.id.trim(),
            turno_label: shiftLabel,
            id_certificado: rawTargetId,
            id_certificado_origen: sourceCert.id.trim(),
            target_numero_certificado: eligibleTarget.numero_certificado,
            target_organizacion_nombre: eligibleTarget.organizacion_nombre,
          });
        }
      }

      if (autoLinkTargetSites) {
        for (const site of candidateTargetSites) {
          if (
            isShiftAlreadyAssignedToTargetSite({
              site,
              shift,
              targetCertHasShift: targetShiftEntry,
              existingTurnosPorSitioSet,
            })
          ) {
            continue;
          }
          const siteShiftKey = `${site.id.trim()}::${shift.id.trim()}`;
          if (seenPlannedSiteLinks.has(siteShiftKey)) continue;
          seenPlannedSiteLinks.add(siteShiftKey);

          turnosPorSitioToCreate.push({
            id_sitio: site.id.trim(),
            numero_sitio: site.numero_sitio,
            nombre_sitio: site.nombre_sitio,
            id_turno: shift.id.trim(),
            turno_label: shiftLabel,
            id_certificado: rawTargetId,
            target_numero_certificado: eligibleTarget.numero_certificado,
          });
        }
      }
    }
  }

  const isExecutable =
    validationErrors.length === 0 &&
    (certLinksToCreate.length > 0 || turnosPorSitioToCreate.length > 0);

  return {
    certLinksToCreate,
    turnosPorSitioToCreate,
    alreadyShared,
    validationErrors,
    isExecutable,
  };
}

/**
 * Only allows unlinking a shared shift from a receiving certificate (`certId !== ownerCertId`).
 */
export function canUnlinkTurnoFromCert(params: {
  turno: Pick<ShiftEntity, 'id' | 'descripcion' | 'ownerCertId' | 'sharedFromCertId'>;
  certId: string;
}): UnlinkShareGuardResult {
  const { turno, certId } = params;
  if (!isValidUuid(certId)) {
    return {
      allowed: false,
      reason: 'El certificado indicado para desvincular no posee un identificador válido.',
    };
  }
  const cleanCertId = certId.trim();
  const ownerCertId = (turno.ownerCertId || turno.sharedFromCertId || '').trim();
  if (ownerCertId && isValidUuid(ownerCertId) && ownerCertId === cleanCertId && !turno.sharedFromCertId) {
    return {
      allowed: false,
      reason: `No se puede desvincular el turno "${turno.descripcion}" desde su certificado propietario.`,
    };
  }
  if (!turno.sharedFromCertId && (!turno.ownerCertId || turno.ownerCertId === cleanCertId)) {
    return {
      allowed: false,
      reason: `El turno "${turno.descripcion}" no figura como compartido en el certificado seleccionado.`,
    };
  }
  return { allowed: true };
}
