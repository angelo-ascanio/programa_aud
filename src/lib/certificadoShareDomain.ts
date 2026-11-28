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
import { isClauseBlockedByCertificateExclusions } from './coverageEngine';
import type { RequisitoLtree } from './extraDomain';
import type { UserProfile } from './healthCheck';
import type {
  CertificadoDetailEntity,
  ContactoCertificadoEntity,
  ProcessEntity,
  ShiftEntity,
  SiteEntity,
} from './multisiteSampling';
import { orderNormaRequisitosHierarchically } from './normaFullReader';
import {
  getAllSeededNormaRequirements,
  getScopedNormaRequirements,
} from './procesoDomain';
import {
  hasCertificateActiveAlcance,
  type AlcanceAlreadySharedItem,
  type AlcanceConflictStatus,
  type AlcanceShareConflictItem,
  type AlcanceShareTargetDecision,
  type AlcanceTargetLinkItem,
} from './alcanceDomain';

export type {
  AlcanceAlreadySharedItem,
  AlcanceConflictStatus,
  AlcanceShareConflictItem,
  AlcanceShareTargetDecision,
  AlcanceTargetLinkItem,
};

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
  id_certificado_version?: string | null;
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
          const rawTargetVer =
            targetCertEntity?.versiones?.find((v) => v.es_version_actual && !v.deleted_at)?.id ||
            targetCertEntity?.id_certificado_version ||
            null;
          const targetVerId =
            rawTargetVer && isValidUuid(rawTargetVer) ? rawTargetVer.trim() : null;
          certLinksToCreate.push({
            id_turno: shift.id.trim(),
            turno_label: shiftLabel,
            id_certificado: rawTargetId,
            ...(targetVerId ? { id_certificado_version: targetVerId } : {}),
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

// =============================================================================
// Proceso & Requisitos Deterministic Binary Sharing (`id_norma` Equality)
// =============================================================================

export type ProcessShareMode = 'PROCESS_AND_REQS_SYNC' | 'PROCESS_ONLY_INDEPENDENT';

export interface ExistingProcesoShareLinkRef {
  id?: string;
  id_proceso: string;
  id_certificado: string;
  id_certificado_origen?: string | null;
  sincronizar_requisitos?: boolean;
  deleted_at?: string | null;
}

export interface PlanProcesoTargetOutcome {
  id_proceso: string;
  nombre_proceso: string;
  tipo: ProcessEntity['tipo'];
  id_certificado_origen: string;
  id_certificado_destino: string;
  target_numero_certificado: string;
  target_organizacion_nombre: string;
  target_norma_id: string;
  target_norma_codigo: string;
  sameNorm: boolean;
  mode: ProcessShareMode;
  sincronizar_requisitos: boolean;
  requisitoIds: string[];
  excludedByIso43Codes: string[];
  summaryMessage: string;
}

export interface ProcesoAlreadySharedItem {
  id_proceso: string;
  nombre_proceso: string;
  id_certificado: string;
  target_numero_certificado: string;
  code: 'ALREADY_SHARED';
  message: string;
}

export interface ProcesoShareConflictItem {
  kind: 'OWNER_SELF_SHARE' | 'DUPLICATE_PROCESO_NAME';
  id_proceso: string;
  proceso_nombre: string;
  id_certificado: string;
  target_numero_certificado: string;
  message: string;
}

export interface PlanShareProcesosParams {
  sourceCert: CertificadoDetailEntity;
  selectedProcesoIds: ReadonlyArray<string>;
  targetCertIds: ReadonlyArray<string>;
  allCertificates: ReadonlyArray<CertificadoDetailEntity>;
  organizaciones: ReadonlyArray<OrganizacionEntity>;
  conglomerados: ReadonlyArray<ConglomeradoEntity>;
  profile?: UserProfile | null;
  authorizedClientOrgIds?: ReadonlyArray<string>;
  shareWithRequisitos?: boolean;
  syncRequisitosWithSameNorm?: boolean;
  existingProcesoCertLinks?: ReadonlyArray<ExistingProcesoShareLinkRef>;
  requirementsCatalog?: ReadonlyArray<RequisitoLtree>;
  archivedProcesoIds?: ReadonlySet<string>;
  archivedNoAplicableIds?: ReadonlySet<string>;
}

export interface PlanShareProcesosResult {
  outcomes: PlanProcesoTargetOutcome[];
  alreadyShared: ProcesoAlreadySharedItem[];
  conflicts: ProcesoShareConflictItem[];
  validationErrors: string[];
  isExecutable: boolean;
}

function isProcessDeleted(proc: ProcessEntity): boolean {
  const maybeDeleted = (proc as ProcessEntity & { deleted_at?: string | null }).deleted_at;
  return Boolean(maybeDeleted);
}

function collectScopedProcessRequisitoMatches(params: {
  proceso: ProcessEntity;
  cert: CertificadoDetailEntity;
  requirementsCatalog: ReadonlyArray<RequisitoLtree>;
}): RequisitoLtree[] {
  const { proceso, cert, requirementsCatalog } = params;
  const scopedNormReqs = orderNormaRequisitosHierarchically(
    getScopedNormaRequirements({
      id_norma: cert.id_norma,
      norma_codigo: cert.norma_codigo,
      requirementsCatalog,
    })
  );
  const byLowerCode = new Map<string, RequisitoLtree>();
  for (const req of scopedNormReqs) {
    byLowerCode.set(req.codigo.trim().toLowerCase(), req);
  }

  const certEntry = proceso.requisitos_by_certificado?.[cert.id.trim()];
  const rawCodes = [
    ...(certEntry?.clausulas_cubiertas || []),
    ...(certEntry?.requisitos_detalle || []).map((d) => d.codigo),
    ...(!certEntry ? proceso.clausulas_cubiertas || [] : []),
    ...(!certEntry ? (proceso.requisitos_detalle || []).map((d) => d.codigo) : []),
  ];

  const matched: RequisitoLtree[] = [];
  const seenReqIds = new Set<string>();
  for (const rawCode of rawCodes) {
    const cleanCode = (rawCode || '').trim().toLowerCase();
    if (!cleanCode) continue;
    const req = byLowerCode.get(cleanCode);
    if (!req || seenReqIds.has(req.id)) continue;
    seenReqIds.add(req.id);
    matched.push(req);
  }

  return orderNormaRequisitosHierarchically(matched);
}

/**
 * Deterministic binary planner for sharing Processes (`proceso_certificado_compartido`)
 * across conglomerate certificates:
 * - Same standard (`sourceCert.id_norma === targetCert.id_norma`):
 *   - With `shareWithRequisitos = true` (default): copies applicable clauses filtering ISO 4.3
 *     exclusions on `targetCert`, setting `sincronizar_requisitos = true` (unless explicitly disabled).
 *   - With `shareWithRequisitos = false`: shares process structure only (`requisitoIds = []`,
 *     `sincronizar_requisitos = false`), allowing clauses to be synced later.
 * - Different standard (`sourceCert.id_norma !== targetCert.id_norma`):
 *   - Always forces `requisitoIds = []`, `sincronizar_requisitos = false`,
 *     `mode = 'PROCESS_ONLY_INDEPENDENT'` with 0 cross-standard clause resolution.
 */
export function planShareProcesos(
  params: PlanShareProcesosParams
): PlanShareProcesosResult {
  const {
    sourceCert,
    selectedProcesoIds,
    targetCertIds,
    allCertificates,
    organizaciones,
    conglomerados,
    profile = null,
    authorizedClientOrgIds,
    shareWithRequisitos = true,
    syncRequisitosWithSameNorm = true,
    existingProcesoCertLinks = [],
    requirementsCatalog = getAllSeededNormaRequirements(),
    archivedProcesoIds,
    archivedNoAplicableIds,
  } = params;

  const outcomes: PlanProcesoTargetOutcome[] = [];
  const alreadyShared: ProcesoAlreadySharedItem[] = [];
  const conflicts: ProcesoShareConflictItem[] = [];
  const validationErrors: string[] = [];

  if (!isValidUuid(sourceCert.id) || !isValidUuid(sourceCert.id_organizacion)) {
    validationErrors.push(
      'El certificado u organización origen no posee un identificador válido.'
    );
    return {
      outcomes,
      alreadyShared,
      conflicts,
      validationErrors,
      isExecutable: false,
    };
  }

  const cleanProcIds = dedupeTrimmedIds(selectedProcesoIds);
  const cleanTargetCertIds = dedupeTrimmedIds(targetCertIds);

  if (cleanProcIds.length === 0) {
    validationErrors.push('Debe seleccionar al menos un proceso del sistema para compartir.');
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

  const sourceProcById = new Map<string, ProcessEntity>();
  for (const proc of sourceCert.procesos || []) {
    if (archivedProcesoIds?.has(proc.id) || isProcessDeleted(proc)) continue;
    sourceProcById.set(proc.id.trim(), proc);
  }

  const resolvedProcs: ProcessEntity[] = [];
  for (const procId of cleanProcIds) {
    if (!isValidUuid(procId)) {
      validationErrors.push('Uno de los procesos seleccionados no es válido.');
      continue;
    }
    const proc = sourceProcById.get(procId);
    if (!proc) {
      validationErrors.push(
        `El proceso seleccionado no existe o está archivado en el certificado ${sourceCert.numero_certificado}.`
      );
      continue;
    }
    resolvedProcs.push(proc);
  }

  const activeBridgeSet = new Set<string>();
  for (const link of existingProcesoCertLinks) {
    if (link.deleted_at) continue;
    if (!isValidUuid(link.id_proceso) || !isValidUuid(link.id_certificado)) continue;
    activeBridgeSet.add(`${link.id_proceso.trim()}::${link.id_certificado.trim()}`);
  }

  const sourceNormaId = (sourceCert.id_norma || '').trim();
  const seenOutcomeKeys = new Set<string>();

  for (const rawTargetId of cleanTargetCertIds) {
    if (!isValidUuid(rawTargetId)) {
      validationErrors.push('Uno de los certificados destino seleccionados no es válido.');
      continue;
    }

    const eligibleTarget = eligibleById.get(rawTargetId);
    const targetCert = certById.get(rawTargetId);

    if (!eligibleTarget || !targetCert) {
      if (rawTargetId === sourceCert.id.trim()) {
        for (const proc of resolvedProcs) {
          conflicts.push({
            kind: 'OWNER_SELF_SHARE',
            id_proceso: proc.id,
            proceso_nombre: proc.nombre_proceso,
            id_certificado: rawTargetId,
            target_numero_certificado: sourceCert.numero_certificado,
            message: `No puede compartir el proceso "${proc.nombre_proceso}" hacia el mismo certificado origen (${sourceCert.numero_certificado}).`,
          });
        }
      } else {
        const targetLabel = targetCert?.numero_certificado || 'destino seleccionado';
        validationErrors.push(
          `El certificado ${targetLabel} no es elegible para compartición en este conglomerado o está fuera de su alcance autorizado.`
        );
      }
      continue;
    }

    const targetNormaId = (targetCert.id_norma || '').trim();
    const activeTargetProcs = (targetCert.procesos || []).filter(
      (tp) => !archivedProcesoIds?.has(tp.id) && !isProcessDeleted(tp)
    );

    for (const proc of resolvedProcs) {
      const cleanProcId = proc.id.trim();
      const ownerCertId = (proc.ownerCertId || proc.id_certificado || sourceCert.id).trim();

      if (rawTargetId === ownerCertId) {
        conflicts.push({
          kind: 'OWNER_SELF_SHARE',
          id_proceso: cleanProcId,
          proceso_nombre: proc.nombre_proceso,
          id_certificado: rawTargetId,
          target_numero_certificado: targetCert.numero_certificado,
          message: `El certificado ${targetCert.numero_certificado} es el propietario original del proceso "${proc.nombre_proceso}".`,
        });
        continue;
      }

      const alreadyInTarget = activeTargetProcs.some((tp) => tp.id.trim() === cleanProcId);
      const alreadyInMetadata = (proc.sharedTargets || []).some(
        (st) => st.targetCertId.trim() === rawTargetId
      );
      const alreadyInBridge = activeBridgeSet.has(`${cleanProcId}::${rawTargetId}`);

      if (alreadyInTarget || alreadyInMetadata || alreadyInBridge) {
        alreadyShared.push({
          id_proceso: cleanProcId,
          nombre_proceso: proc.nombre_proceso,
          id_certificado: rawTargetId,
          target_numero_certificado: targetCert.numero_certificado,
          code: 'ALREADY_SHARED',
          message: `El proceso "${proc.nombre_proceso}" ya se encuentra compartido activamente con el certificado ${targetCert.numero_certificado}.`,
        });
        continue;
      }

      const cleanProcName = normalizeLabel(proc.nombre_proceso);
      const dupName = activeTargetProcs.find(
        (tp) => tp.id.trim() !== cleanProcId && normalizeLabel(tp.nombre_proceso) === cleanProcName
      );
      if (dupName) {
        conflicts.push({
          kind: 'DUPLICATE_PROCESO_NAME',
          id_proceso: cleanProcId,
          proceso_nombre: proc.nombre_proceso,
          id_certificado: rawTargetId,
          target_numero_certificado: targetCert.numero_certificado,
          message: `Conflicto de nombre: ya existe un proceso activo llamado "${proc.nombre_proceso.trim()}" en el certificado destino ${targetCert.numero_certificado}.`,
        });
        continue;
      }

      const outcomeKey = `${cleanProcId}::${rawTargetId}`;
      if (seenOutcomeKeys.has(outcomeKey)) continue;
      seenOutcomeKeys.add(outcomeKey);

      const sameNorm = Boolean(sourceNormaId && targetNormaId && sourceNormaId === targetNormaId);

      if (sameNorm) {
        if (shareWithRequisitos) {
          const sourceReqs = collectScopedProcessRequisitoMatches({
            proceso: proc,
            cert: sourceCert,
            requirementsCatalog,
          });

          const requisitoIds: string[] = [];
          const excludedByIso43Codes: string[] = [];

          for (const req of sourceReqs) {
            const block = isClauseBlockedByCertificateExclusions({
              cert: targetCert,
              targetRequisito: req,
              requirementsCatalog,
              archivedNoAplicableIds,
            });
            if (block.blocked) {
              excludedByIso43Codes.push(req.codigo);
            } else {
              requisitoIds.push(req.id);
            }
          }

          const syncEnabled = Boolean(syncRequisitosWithSameNorm);
          const excludedNote =
            excludedByIso43Codes.length > 0
              ? ` (${excludedByIso43Codes.length} omitida(s) por exclusión ISO 4.3 en destino)`
              : '';

          outcomes.push({
            id_proceso: cleanProcId,
            nombre_proceso: proc.nombre_proceso,
            tipo: proc.tipo,
            id_certificado_origen: sourceCert.id.trim(),
            id_certificado_destino: rawTargetId,
            target_numero_certificado: targetCert.numero_certificado,
            target_organizacion_nombre: targetCert.organizacion_nombre,
            target_norma_id: targetNormaId,
            target_norma_codigo: targetCert.norma_codigo,
            sameNorm: true,
            mode: syncEnabled ? 'PROCESS_AND_REQS_SYNC' : 'PROCESS_ONLY_INDEPENDENT',
            sincronizar_requisitos: syncEnabled,
            requisitoIds,
            excludedByIso43Codes,
            summaryMessage: `Misma norma (${sourceCert.norma_codigo}): se compartirá el proceso con ${requisitoIds.length} cláusula(s) aplicable(s)${excludedNote}.`,
          });
        } else {
          outcomes.push({
            id_proceso: cleanProcId,
            nombre_proceso: proc.nombre_proceso,
            tipo: proc.tipo,
            id_certificado_origen: sourceCert.id.trim(),
            id_certificado_destino: rawTargetId,
            target_numero_certificado: targetCert.numero_certificado,
            target_organizacion_nombre: targetCert.organizacion_nombre,
            target_norma_id: targetNormaId,
            target_norma_codigo: targetCert.norma_codigo,
            sameNorm: true,
            mode: 'PROCESS_ONLY_INDEPENDENT',
            sincronizar_requisitos: false,
            requisitoIds: [],
            excludedByIso43Codes: [],
            summaryMessage: `Misma norma (${sourceCert.norma_codigo}): se compartirá solo la estructura del proceso (sin requisitos por ahora); podrá sincronizar cláusulas luego.`,
          });
        }
      } else {
        // Different norm: deterministically share ONLY the empty independent process (0 reqs, sync = false)
        outcomes.push({
          id_proceso: cleanProcId,
          nombre_proceso: proc.nombre_proceso,
          tipo: proc.tipo,
          id_certificado_origen: sourceCert.id.trim(),
          id_certificado_destino: rawTargetId,
          target_numero_certificado: targetCert.numero_certificado,
          target_organizacion_nombre: targetCert.organizacion_nombre,
          target_norma_id: targetNormaId,
          target_norma_codigo: targetCert.norma_codigo,
          sameNorm: false,
          mode: 'PROCESS_ONLY_INDEPENDENT',
          sincronizar_requisitos: false,
          requisitoIds: [],
          excludedByIso43Codes: [],
          summaryMessage: `Norma distinta (${sourceCert.norma_codigo} → ${targetCert.norma_codigo}): se compartirá únicamente el proceso vacío (0 requisitos). Las cláusulas se asignan por separado en cada norma.`,
        });
      }
    }
  }

  const isExecutable =
    validationErrors.length === 0 && conflicts.length === 0 && outcomes.length > 0;

  return {
    outcomes,
    alreadyShared,
    conflicts,
    validationErrors,
    isExecutable,
  };
}

export type SyncProcesoRequisitosReplaceMode = 'ADDITIVE' | 'MIRROR';

export interface SyncProcesoTargetDelta {
  id_certificado_destino: string;
  target_numero_certificado: string;
  target_organizacion_nombre: string;
  target_norma_codigo: string;
  enableSync: boolean;
  requisitoIdsToInsert: string[];
  requisitoIdsToRemove: string[];
  excludedByIso43Codes: string[];
  alreadyPresentCodes: string[];
  summaryMessage: string;
}

export interface PlanSyncProcesoRequisitosParams {
  proceso: ProcessEntity;
  sourceCert: CertificadoDetailEntity;
  allCertificates: ReadonlyArray<CertificadoDetailEntity>;
  targetCertIds?: ReadonlyArray<string>;
  replaceMode?: SyncProcesoRequisitosReplaceMode;
  enableSync?: boolean;
  requirementsCatalog?: ReadonlyArray<RequisitoLtree>;
  archivedProcesoIds?: ReadonlySet<string>;
  archivedNoAplicableIds?: ReadonlySet<string>;
}

export interface PlanSyncProcesoRequisitosResult {
  procesoId: string;
  sourceCertId: string;
  sourceNormaCodigo: string;
  replaceMode: SyncProcesoRequisitosReplaceMode;
  enableSync: boolean;
  targetDeltas: SyncProcesoTargetDelta[];
  skippedDifferentNormCertCount: number;
  skippedDifferentNormCertNumbers: string[];
  differentNormWarning: string | null;
  validationErrors: string[];
  isExecutable: boolean;
}

/**
 * Plans subsequent sharing / synchronization of normative clauses (`requisitos_por_proceso`)
 * for a shared process across linked peer certificates of the **same `id_norma`**.
 * Certificates with a different standard remain untouched and independent.
 */
export function planSyncProcesoRequisitos(
  params: PlanSyncProcesoRequisitosParams
): PlanSyncProcesoRequisitosResult {
  const {
    proceso,
    sourceCert,
    allCertificates,
    targetCertIds,
    replaceMode = 'ADDITIVE',
    enableSync = true,
    requirementsCatalog = getAllSeededNormaRequirements(),
    archivedProcesoIds,
    archivedNoAplicableIds,
  } = params;

  const targetDeltas: SyncProcesoTargetDelta[] = [];
  const skippedDifferentNormCertNumbers: string[] = [];
  const validationErrors: string[] = [];

  const procesoId = isValidUuid(proceso.id) ? proceso.id.trim() : '';
  const sourceCertId = isValidUuid(sourceCert.id) ? sourceCert.id.trim() : '';

  if (!procesoId) {
    validationErrors.push('El proceso seleccionado no posee un identificador válido.');
  }
  if (!sourceCertId) {
    validationErrors.push('El certificado origen no posee un identificador válido.');
  }

  const sourceNormaId = (sourceCert.id_norma || '').trim();
  if (!sourceNormaId) {
    validationErrors.push('El certificado origen no tiene una norma asignada.');
  }

  if (validationErrors.length > 0) {
    return {
      procesoId,
      sourceCertId,
      sourceNormaCodigo: sourceCert.norma_codigo,
      replaceMode,
      enableSync,
      targetDeltas,
      skippedDifferentNormCertCount: 0,
      skippedDifferentNormCertNumbers,
      differentNormWarning: null,
      validationErrors,
      isExecutable: false,
    };
  }

  let explicitTargetSet: Set<string> | null = null;
  if (targetCertIds !== undefined) {
    explicitTargetSet = new Set<string>();
    for (const rawId of dedupeTrimmedIds(targetCertIds)) {
      if (!isValidUuid(rawId)) {
        validationErrors.push('Uno de los certificados destino indicados no es válido.');
        continue;
      }
      if (rawId === sourceCertId) {
        validationErrors.push(
          `No se puede sincronizar un proceso consigo mismo (${sourceCert.numero_certificado}).`
        );
        continue;
      }
      explicitTargetSet.add(rawId);
    }
  }

  const linkedPeerCerts: CertificadoDetailEntity[] = [];
  const seenPeerIds = new Set<string>();
  const sharedTargetIds = new Set(
    (proceso.sharedTargets || []).map((st) => st.targetCertId.trim())
  );

  for (const cert of allCertificates) {
    if (cert.deleted_at) continue;
    const certId = (cert.id || '').trim();
    if (!certId || certId === sourceCertId || seenPeerIds.has(certId)) continue;
    if (explicitTargetSet && !explicitTargetSet.has(certId)) continue;

    const procInCert = (cert.procesos || []).find(
      (p) => p.id.trim() === procesoId && !archivedProcesoIds?.has(p.id) && !isProcessDeleted(p)
    );
    const isLinked = Boolean(procInCert) || sharedTargetIds.has(certId);
    if (!isLinked) continue;

    seenPeerIds.add(certId);
    linkedPeerCerts.push(cert);
  }

  if (explicitTargetSet) {
    for (const requestedId of explicitTargetSet) {
      if (!seenPeerIds.has(requestedId)) {
        const missingCert = allCertificates.find((c) => c.id.trim() === requestedId);
        const label = missingCert?.numero_certificado || 'destino seleccionado';
        validationErrors.push(
          `El proceso "${proceso.nombre_proceso}" no se encuentra compartido en el certificado ${label}.`
        );
      }
    }
  }

  const sourceReqs = collectScopedProcessRequisitoMatches({
    proceso,
    cert: sourceCert,
    requirementsCatalog,
  });
  const sourceReqIdSet = new Set(sourceReqs.map((r) => r.id));

  for (const targetCert of linkedPeerCerts) {
    const targetNormaId = (targetCert.id_norma || '').trim();
    if (!targetNormaId || targetNormaId !== sourceNormaId) {
      skippedDifferentNormCertNumbers.push(targetCert.numero_certificado);
      continue;
    }

    const targetProc = (targetCert.procesos || []).find(
      (p) => p.id.trim() === procesoId && !archivedProcesoIds?.has(p.id) && !isProcessDeleted(p)
    );
    const targetReqs = targetProc
      ? collectScopedProcessRequisitoMatches({
          proceso: targetProc,
          cert: targetCert,
          requirementsCatalog,
        })
      : [];
    const targetReqById = new Map<string, RequisitoLtree>(targetReqs.map((r) => [r.id, r]));

    const requisitoIdsToInsert: string[] = [];
    const requisitoIdsToRemove: string[] = [];
    const excludedByIso43Codes: string[] = [];
    const alreadyPresentCodes: string[] = [];

    for (const srcReq of sourceReqs) {
      const block = isClauseBlockedByCertificateExclusions({
        cert: targetCert,
        targetRequisito: srcReq,
        requirementsCatalog,
        archivedNoAplicableIds,
      });

      if (block.blocked) {
        excludedByIso43Codes.push(srcReq.codigo);
        if (replaceMode === 'MIRROR' && targetReqById.has(srcReq.id)) {
          requisitoIdsToRemove.push(srcReq.id);
        }
        continue;
      }

      if (targetReqById.has(srcReq.id)) {
        alreadyPresentCodes.push(srcReq.codigo);
      } else {
        requisitoIdsToInsert.push(srcReq.id);
      }
    }

    if (replaceMode === 'MIRROR') {
      for (const existingTargetReq of targetReqs) {
        if (!sourceReqIdSet.has(existingTargetReq.id)) {
          requisitoIdsToRemove.push(existingTargetReq.id);
        }
      }
    }

    const parts: string[] = [];
    parts.push(`${requisitoIdsToInsert.length} por agregar`);
    if (replaceMode === 'MIRROR' && requisitoIdsToRemove.length > 0) {
      parts.push(`${requisitoIdsToRemove.length} por retirar (espejo)`);
    }
    if (excludedByIso43Codes.length > 0) {
      parts.push(`${excludedByIso43Codes.length} omitida(s) por ISO 4.3`);
    }

    targetDeltas.push({
      id_certificado_destino: targetCert.id.trim(),
      target_numero_certificado: targetCert.numero_certificado,
      target_organizacion_nombre: targetCert.organizacion_nombre,
      target_norma_codigo: targetCert.norma_codigo,
      enableSync,
      requisitoIdsToInsert,
      requisitoIdsToRemove,
      excludedByIso43Codes,
      alreadyPresentCodes,
      summaryMessage: `${targetCert.numero_certificado} (${targetCert.norma_codigo}): ${parts.join(', ')}.`,
    });
  }

  const skippedDifferentNormCertCount = skippedDifferentNormCertNumbers.length;
  const differentNormWarning =
    skippedDifferentNormCertCount > 0
      ? `${skippedDifferentNormCertCount} certificado(s) vinculado(s) con norma distinta (${skippedDifferentNormCertNumbers.join(', ')}) permanecerá(n) independiente(s) y sin cambios de requisitos.`
      : null;

  const isExecutable = validationErrors.length === 0 && targetDeltas.length > 0;

  return {
    procesoId,
    sourceCertId,
    sourceNormaCodigo: sourceCert.norma_codigo,
    replaceMode,
    enableSync,
    targetDeltas,
    skippedDifferentNormCertCount,
    skippedDifferentNormCertNumbers,
    differentNormWarning,
    validationErrors,
    isExecutable,
  };
}

/**
 * Only allows unlinking a shared process from a receiving certificate (`certId !== ownerCertId`).
 */
export function canUnlinkProcesoFromCert(params: {
  proceso: Pick<
    ProcessEntity,
    'id' | 'id_certificado' | 'nombre_proceso' | 'ownerCertId' | 'sharedFromCertId'
  >;
  certId: string;
}): UnlinkShareGuardResult {
  const { proceso, certId } = params;
  if (!isValidUuid(certId)) {
    return {
      allowed: false,
      reason: 'El certificado indicado para desvincular no posee un identificador válido.',
    };
  }
  const cleanCertId = certId.trim();
  const ownerCertId = (proceso.ownerCertId || proceso.id_certificado || '').trim();
  if (!isValidUuid(ownerCertId)) {
    return {
      allowed: false,
      reason: `No se pudo verificar el certificado propietario del proceso "${proceso.nombre_proceso}".`,
    };
  }
  if (cleanCertId === ownerCertId && !proceso.sharedFromCertId) {
    return {
      allowed: false,
      reason: `No se puede desvincular el proceso "${proceso.nombre_proceso}" desde su certificado propietario.`,
    };
  }
  if (!proceso.sharedFromCertId && ownerCertId === cleanCertId) {
    return {
      allowed: false,
      reason: `El proceso "${proceso.nombre_proceso}" no figura como compartido en el certificado seleccionado.`,
    };
  }
  return { allowed: true };
}

// =============================================================================
// 5. Bilingual Alcance Sharing Planner & Conflict Comparison (`Step 2.3`)
// =============================================================================

export interface PlanShareAlcanceParams {
  sourceCert: CertificadoDetailEntity;
  selectedTargetCertIds: ReadonlyArray<string>;
  allCertificates: ReadonlyArray<CertificadoDetailEntity>;
  organizaciones: ReadonlyArray<OrganizacionEntity>;
  conglomerados: ReadonlyArray<ConglomeradoEntity>;
  profile?: UserProfile | null;
  authorizedClientOrgIds?: ReadonlyArray<string>;
  confirmOverwrite?: boolean;
}

export interface PlanShareAlcanceResult {
  id_alcance: string;
  sourceCertId: string;
  sourceCertNumero: string;
  decisions: AlcanceShareTargetDecision[];
  targetsToLink: AlcanceTargetLinkItem[];
  alreadySameAlcance: AlcanceAlreadySharedItem[];
  conflicts: AlcanceShareConflictItem[];
  requiresConflictConfirmation: boolean;
  confirmOverwrite: boolean;
  targetCertIdsToPersist: string[];
  validationErrors: string[];
  isExecutable: boolean;
}

/**
 * Plans sharing of a certificate's bilingual `Alcance` (`public.alcance`) within
 * the same active `Conglomerado`, respecting `CLIENT` Level-2 isolation and
 * constructing full ES/EN conflict comparison payloads when any target certificate
 * already has an active own or shared `Alcance`.
 */
export function planShareAlcance(
  params: PlanShareAlcanceParams
): PlanShareAlcanceResult {
  const {
    sourceCert,
    selectedTargetCertIds,
    allCertificates,
    organizaciones,
    conglomerados,
    profile,
    authorizedClientOrgIds,
    confirmOverwrite = false,
  } = params;

  const decisions: AlcanceShareTargetDecision[] = [];
  const targetsToLink: AlcanceTargetLinkItem[] = [];
  const alreadySameAlcance: AlcanceAlreadySharedItem[] = [];
  const conflicts: AlcanceShareConflictItem[] = [];
  const validationErrors: string[] = [];

  const sourceCertId = isValidUuid(sourceCert.id) ? sourceCert.id.trim() : '';
  const sourceAlcance = sourceCert.alcanceDetalle ?? null;
  const sourceAlcanceId =
    sourceAlcance && isValidUuid(sourceAlcance.id) ? sourceAlcance.id.trim() : '';

  if (!sourceCertId) {
    validationErrors.push('El certificado origen no posee un identificador válido.');
  }
  if (!hasCertificateActiveAlcance(sourceCert) || !sourceAlcance || !sourceAlcanceId) {
    validationErrors.push(
      `El certificado origen ${sourceCert.numero_certificado} no posee un Alcance activo en español para compartir.`
    );
  }

  const cleanTargetIds = dedupeTrimmedIds(selectedTargetCertIds);
  if (cleanTargetIds.length === 0) {
    validationErrors.push(
      'Seleccione al menos un certificado destino dentro del conglomerado para compartir el Alcance.'
    );
  }

  const eligibility = sourceCertId
    ? getEligibleShareTargetCertificates({
        sourceCert,
        allCertificates,
        organizaciones,
        conglomerados,
        profile,
        authorizedClientOrgIds,
      })
    : {
        targets: [],
        sourceGroupId: null,
        sourceGroupNombre: null,
        missingConglomeradoReason: null,
      };

  if (eligibility.missingConglomeradoReason) {
    validationErrors.push(eligibility.missingConglomeradoReason);
  }

  const eligibleIdSet = new Set(eligibility.targets.map((t) => t.id));
  const certById = new Map<string, CertificadoDetailEntity>();
  for (const cert of allCertificates) {
    if (!cert.deleted_at && isValidUuid(cert.id)) {
      certById.set(cert.id.trim(), cert);
    }
  }

  const incomingEs = (sourceAlcance?.alcance_es || '').trim();
  const rawIncomingEn = (sourceAlcance?.alcance_en || '').trim();
  const incomingEn = rawIncomingEn.length > 0 ? rawIncomingEn : null;
  const ownerCertId = (sourceAlcance?.id_certificado || sourceCertId).trim();

  for (const rawTargetId of cleanTargetIds) {
    if (!isValidUuid(rawTargetId)) {
      validationErrors.push('Uno de los certificados destino seleccionados no es válido.');
      continue;
    }

    if (rawTargetId === sourceCertId) {
      validationErrors.push(
        `No puede compartir el Alcance con el mismo certificado origen (${sourceCert.numero_certificado}).`
      );
      continue;
    }

    if (ownerCertId && rawTargetId === ownerCertId) {
      const ownerCert = certById.get(rawTargetId);
      const ownerNum =
        ownerCert?.numero_certificado || sourceAlcance?.origenCertificadoNumero || 'propietario';
      validationErrors.push(
        `El certificado ${ownerNum} es el propietario original de este Alcance.`
      );
      continue;
    }

    const targetCert = certById.get(rawTargetId);
    if (!eligibleIdSet.has(rawTargetId) || !targetCert) {
      const label = targetCert?.numero_certificado || 'destino seleccionado';
      validationErrors.push(
        `El certificado ${label} no pertenece al mismo Conglomerado activo o no está autorizado para recibir este Alcance.`
      );
      continue;
    }

    const targetAlcance = targetCert.alcanceDetalle ?? null;
    const targetHasActiveAlcance = hasCertificateActiveAlcance(targetCert);

    if (!targetHasActiveAlcance || !targetAlcance) {
      const linkItem: AlcanceTargetLinkItem = {
        targetCertId: rawTargetId,
        numero_certificado: targetCert.numero_certificado,
        organizacion_nombre: targetCert.organizacion_nombre,
        conflictStatus: 'SIN_ALCANCE',
      };
      targetsToLink.push(linkItem);
      decisions.push({
        targetCertId: rawTargetId,
        targetNumeroCertificado: targetCert.numero_certificado,
        targetOrganizacionNombre: targetCert.organizacion_nombre,
        conflictStatus: 'SIN_ALCANCE',
        conflict: null,
      });
      continue;
    }

    if (sourceAlcanceId && targetAlcance.id.trim() === sourceAlcanceId) {
      const alreadyMsg = `El certificado ${targetCert.numero_certificado} ya utiliza exactamente este mismo Alcance compartido.`;
      alreadySameAlcance.push({
        targetCertId: rawTargetId,
        numero_certificado: targetCert.numero_certificado,
        organizacion_nombre: targetCert.organizacion_nombre,
        message: alreadyMsg,
      });
      decisions.push({
        targetCertId: rawTargetId,
        targetNumeroCertificado: targetCert.numero_certificado,
        targetOrganizacionNombre: targetCert.organizacion_nombre,
        conflictStatus: 'YA_MISMO_ALCANCE',
        conflict: null,
      });
      continue;
    }

    const existingEs = (targetAlcance.alcance_es || '').trim();
    const rawExistingEn = (targetAlcance.alcance_en || '').trim();
    const existingEn = rawExistingEn.length > 0 ? rawExistingEn : null;
    const targetIsShared = Boolean(targetAlcance.esCompartido);
    const targetOriginNum = targetAlcance.origenCertificadoNumero ?? null;
    const originLabel = targetIsShared
      ? `Alcance compartido desde ${targetOriginNum || 'otro certificado del conglomerado'}`
      : `Alcance propio de ${targetCert.numero_certificado}`;

    const conflictItem: AlcanceShareConflictItem = {
      targetCertId: rawTargetId,
      targetNumeroCertificado: targetCert.numero_certificado,
      targetOrganizacionNombre: targetCert.organizacion_nombre,
      targetIsShared,
      targetOriginCertNumero: targetOriginNum,
      incomingScope: {
        alcance_es: incomingEs,
        alcance_en: incomingEn,
        sourceCertNumero: sourceCert.numero_certificado,
      },
      existingScope: {
        alcance_es: existingEs,
        alcance_en: existingEn,
        originLabel,
      },
    };

    conflicts.push(conflictItem);
    decisions.push({
      targetCertId: rawTargetId,
      targetNumeroCertificado: targetCert.numero_certificado,
      targetOrganizacionNombre: targetCert.organizacion_nombre,
      conflictStatus: 'CONFLICTO_EXISTENTE',
      conflict: conflictItem,
    });
  }

  const requiresConflictConfirmation = conflicts.length > 0;
  const blockedByUnconfirmedConflicts =
    requiresConflictConfirmation && confirmOverwrite !== true;

  const targetCertIdsToPersist =
    validationErrors.length === 0 && !blockedByUnconfirmedConflicts
      ? [
          ...targetsToLink.map((t) => t.targetCertId),
          ...(confirmOverwrite ? conflicts.map((c) => c.targetCertId) : []),
        ]
      : [];

  const isExecutable =
    validationErrors.length === 0 &&
    !blockedByUnconfirmedConflicts &&
    targetCertIdsToPersist.length > 0;

  return {
    id_alcance: sourceAlcanceId,
    sourceCertId,
    sourceCertNumero: sourceCert.numero_certificado,
    decisions,
    targetsToLink,
    alreadySameAlcance,
    conflicts,
    requiresConflictConfirmation,
    confirmOverwrite: Boolean(confirmOverwrite),
    targetCertIdsToPersist,
    validationErrors,
    isExecutable,
  };
}
