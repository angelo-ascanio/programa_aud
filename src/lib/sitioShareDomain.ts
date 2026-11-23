/**
 * Step 2.3 — Pure TypeScript Domain Engine for Cascading `Sitio` Sharing across Conglomerado
 *
 * Handles:
 * - `numero_sitio` resolution & `Sitio 0 (HQ)` collision prevention
 * - Optional cascade planning for site `turnos` (`turno_certificado_compartido`)
 * - Optional cascade planning for site `procesos` using the deterministic binary `id_norma`
 *   rule (`planShareProcesos`: copy applicable non-excluded clauses & sync on same norm,
 *   empty independent process on different norm)
 *
 * Strictly typed (`strict: true`, 0 `any` / `as any`) and Zero-UUID compliant.
 */

import { assertValidUuid, isValidUuid } from './zeroUuid';
import type { OrganizacionEntity } from './activeCertificates';
import type { ConglomeradoEntity } from './conglomeradoDomain';
import type { RequisitoLtree } from './extraDomain';
import type { UserProfile } from './healthCheck';
import {
  getEligibleShareTargetCertificates,
  planShareProcesos,
  type EligibleShareTargetCertificate,
  type ExistingTurnoPorSitioRef,
  type ExistingTurnoShareLinkRef,
  type ProcessShareMode,
  type TurnoCertLinkDraft,
} from './certificadoShareDomain';
import type {
  CertificadoDetailEntity,
  ProcesoPorSitioLink,
  ProcessEntity,
  ShiftEntity,
  SiteEntity,
} from './multisiteSampling';
import type {
  ClauseResolutionEntry,
  ProcesoTargetClauseResolutionPlan,
} from './procesoClauseResolver';
import { getAllSeededNormaRequirements, getScopedNormaRequirements } from './procesoDomain';
import {
  canUnlinkSitioFromCert,
  suggestNextNumeroSitio,
  type SitioUnlinkGuardResult,
} from './sitioDomain';

export { canUnlinkSitioFromCert, type SitioUnlinkGuardResult };

export interface ExistingSitioShareLinkRef {
  id?: string;
  id_sitio: string;
  id_certificado: string;
  id_certificado_origen?: string | null;
  numero_sitio?: number;
  deleted_at?: string | null;
}

export interface ExistingProcesoShareLinkRef {
  id?: string;
  id_proceso: string;
  id_certificado: string;
  id_certificado_origen?: string | null;
  deleted_at?: string | null;
}

export interface ResolveTargetNumeroSitioParams {
  sourceSite?: Pick<SiteEntity, 'id' | 'id_certificado' | 'numero_sitio' | 'nombre_sitio'>;
  targetCert: CertificadoDetailEntity;
  preferredNumeroSitio?: number | null;
  manualOverrideNumeroSitio?: number | null;
  archivedSiteIds?: ReadonlySet<string>;
  reservedNumbers?: ReadonlySet<number>;
}

export interface ResolveTargetNumeroSitioResult {
  allowed: boolean;
  assignedNumeroSitio: number | null;
  suggestedNumeroSitio: number;
  targetHasSitio0: boolean;
  collisionDetected: boolean;
  autoRenumbered: boolean;
  occupiedNumbers: number[];
  reason?: string;
}

export interface EligibleSitioShareTarget extends EligibleShareTargetCertificate {
  alreadyShared: boolean;
  numeroResolution: ResolveTargetNumeroSitioResult;
}

export interface GetEligibleSitioShareTargetsParams {
  sourceCert: CertificadoDetailEntity;
  sourceSite: Pick<SiteEntity, 'id' | 'id_certificado' | 'numero_sitio' | 'nombre_sitio' | 'sharedTargets'>;
  allCertificates: ReadonlyArray<CertificadoDetailEntity>;
  organizaciones: ReadonlyArray<OrganizacionEntity>;
  conglomerados: ReadonlyArray<ConglomeradoEntity>;
  profile?: UserProfile | null;
  authorizedClientOrgIds?: ReadonlyArray<string>;
  existingSitioCertLinks?: ReadonlyArray<ExistingSitioShareLinkRef>;
  archivedSiteIds?: ReadonlySet<string>;
}

export interface EligibleSitioShareTargetsResult {
  targets: EligibleSitioShareTarget[];
  sourceGroupId: string | null;
  sourceGroupNombre: string | null;
  missingConglomeradoReason: string | null;
}

export interface SitioCertLinkDraft {
  id_sitio: string;
  nombre_sitio: string;
  source_numero_sitio: number;
  numero_sitio: number;
  id_certificado: string;
  id_certificado_origen: string;
  target_numero_certificado: string;
  target_organizacion_nombre: string;
  autoRenumbered: boolean;
}

export interface SitioCascadeProcesoSharePlan {
  id_proceso: string;
  nombre_proceso: string;
  tipo: ProcessEntity['tipo'];
  sourceCertId: string;
  targetCertId: string;
  targetNumeroCertificado: string;
  targetNormaCodigo: string;
  sameNorm: boolean;
  mode: ProcessShareMode;
  sincronizar_requisitos: boolean;
  requisitoIds: string[];
  excludedByIso43Codes: string[];
  summaryMessage: string;
  siteIdsTriggeringShare: string[];
  /** @deprecated Legacy modal preview compatibility bridge until step_1.3.md. */
  resolutionPlan: ProcesoTargetClauseResolutionPlan;
  /** @deprecated Use `requisitoIds` directly. */
  defaultFinalRequisitoIds: string[];
}

export interface ProcesoPorSitioCascadeDraft {
  id_certificado: string;
  id_sitio: string;
  id_proceso: string;
  nombre_proceso: string;
  tipo_proceso: ProcessEntity['tipo'];
  site_nombre: string;
  target_numero_certificado: string;
  usesExistingTargetProcess: boolean;
}

export interface ReusedExistingProcessRef {
  id_proceso: string;
  nombre_proceso: string;
  id_certificado: string;
  target_numero_certificado: string;
}

export interface SitioAlreadySharedItem {
  id_sitio: string;
  nombre_sitio: string;
  id_certificado: string;
  target_numero_certificado: string;
  code: 'ALREADY_SHARED';
  message: string;
}

export interface PlanShareSitiosWithCascadeParams {
  sourceCert: CertificadoDetailEntity;
  selectedSiteIds: ReadonlyArray<string>;
  targetCertIds: ReadonlyArray<string>;
  allCertificates: ReadonlyArray<CertificadoDetailEntity>;
  organizaciones: ReadonlyArray<OrganizacionEntity>;
  conglomerados: ReadonlyArray<ConglomeradoEntity>;
  profile?: UserProfile | null;
  authorizedClientOrgIds?: ReadonlyArray<string>;
  preferredNumeroSitioByTargetCertAndSite?: Readonly<Record<string, number>>;
  manualNumeroSitioByTargetCertAndSite?: Readonly<Record<string, number>>;
  selectedTurnoIdsBySite?: Readonly<Record<string, ReadonlyArray<string>>>;
  selectedProcesoIdsBySite?: Readonly<Record<string, ReadonlyArray<string>>>;
  existingSitioCertLinks?: ReadonlyArray<ExistingSitioShareLinkRef>;
  existingTurnoCertLinks?: ReadonlyArray<ExistingTurnoShareLinkRef>;
  existingProcesoCertLinks?: ReadonlyArray<ExistingProcesoShareLinkRef>;
  existingTurnosPorSitio?: ReadonlyArray<ExistingTurnoPorSitioRef>;
  existingProcesosPorSitio?: ReadonlyArray<ProcesoPorSitioLink>;
  requirementsCatalog?: ReadonlyArray<RequisitoLtree>;
  archivedSiteIds?: ReadonlySet<string>;
  archivedTurnoIds?: ReadonlySet<string>;
  archivedProcesoIds?: ReadonlySet<string>;
  archivedNoAplicableIds?: ReadonlySet<string>;
  shareProcesosWithRequisitos?: boolean;
}

export interface SitioShareExecutionPlan {
  sitioLinksToCreate: SitioCertLinkDraft[];
  turnoCertLinksToCreate: TurnoCertLinkDraft[];
  procesoSharesWithClausePlans: SitioCascadeProcesoSharePlan[];
  procesosPorSitioToCreate: ProcesoPorSitioCascadeDraft[];
  reusedExistingProcesses: ReusedExistingProcessRef[];
  alreadySharedSites: SitioAlreadySharedItem[];
  validationErrors: string[];
  isExecutable: boolean;
}

function normalizeLabel(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase();
}

function dedupeTrimmedIds(ids: ReadonlyArray<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const clean = (id || '').trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

function isSiteDeleted(site: SiteEntity): boolean {
  const maybeDeleted = (site as SiteEntity & { deleted_at?: string | null }).deleted_at;
  return Boolean(maybeDeleted);
}

function isShiftDeleted(shift: ShiftEntity): boolean {
  const maybeDeleted = (shift as ShiftEntity & { deleted_at?: string | null }).deleted_at;
  return Boolean(maybeDeleted);
}

function isProcessDeleted(proc: ProcessEntity): boolean {
  const maybeDeleted = (proc as ProcessEntity & { deleted_at?: string | null }).deleted_at;
  return Boolean(maybeDeleted);
}

function resolveShiftTimeLabel(
  shift: Pick<ShiftEntity, 'hora_entrada' | 'hora_salida' | 'descripcion'>
): string {
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
 * Resolves the safe `numero_sitio` when sharing a site into `targetCert`:
 * - Assigns `0` when `targetCert` has no active `Sitio 0 (HQ)` and preferred/source number is `0`.
 * - Automatically computes `suggestNextNumeroSitio(targetCert.sitios)` (`max + 1`) when `Sitio 0`
 *   or the preferred number is already occupied.
 * - Blocks sharing into owner cert or a certificate already sharing that `id_sitio`, and rejects
 *   colliding manual overrides.
 */
export function resolveTargetNumeroSitioForSharedSite(
  params: ResolveTargetNumeroSitioParams
): ResolveTargetNumeroSitioResult {
  const {
    sourceSite,
    targetCert,
    preferredNumeroSitio,
    manualOverrideNumeroSitio,
    archivedSiteIds,
    reservedNumbers,
  } = params;

  assertValidUuid(targetCert.id, 'certificado destino');

  const activeSites = (targetCert.sitios || []).filter(
    (s) => !archivedSiteIds?.has(s.id) && !isSiteDeleted(s)
  );

  const occupiedSet = new Set<number>(activeSites.map((s) => s.numero_sitio));
  if (reservedNumbers) {
    for (const num of reservedNumbers) {
      occupiedSet.add(num);
    }
  }
  const occupiedNumbers = Array.from(occupiedSet).sort((a, b) => a - b);
  const targetHasSitio0 = occupiedSet.has(0);

  const syntheticOccupiedEntries = occupiedNumbers.map((numero_sitio) => ({
    numero_sitio,
    deleted_at: null,
  }));
  const suggestedNumeroSitio = suggestNextNumeroSitio(syntheticOccupiedEntries);

  if (sourceSite) {
    assertValidUuid(sourceSite.id, 'sitio origen');
    const cleanSourceId = sourceSite.id.trim();
    const alreadyOwnedOrShared =
      sourceSite.id_certificado === targetCert.id ||
      activeSites.some((s) => s.id.trim() === cleanSourceId);

    if (alreadyOwnedOrShared) {
      return {
        allowed: false,
        assignedNumeroSitio: null,
        suggestedNumeroSitio,
        targetHasSitio0,
        collisionDetected: true,
        autoRenumbered: false,
        occupiedNumbers,
        reason: `El sitio "${sourceSite.nombre_sitio}" ya pertenece o se encuentra compartido activamente en el certificado ${targetCert.numero_certificado}.`,
      };
    }
  }

  if (manualOverrideNumeroSitio !== undefined && manualOverrideNumeroSitio !== null) {
    if (!Number.isInteger(manualOverrideNumeroSitio) || manualOverrideNumeroSitio < 0) {
      return {
        allowed: false,
        assignedNumeroSitio: null,
        suggestedNumeroSitio,
        targetHasSitio0,
        collisionDetected: false,
        autoRenumbered: false,
        occupiedNumbers,
        reason:
          'El número de sitio manual debe ser un entero mayor o igual a 0 (0 corresponde a Sede Principal HQ).',
      };
    }
    if (occupiedSet.has(manualOverrideNumeroSitio)) {
      return {
        allowed: false,
        assignedNumeroSitio: null,
        suggestedNumeroSitio,
        targetHasSitio0,
        collisionDetected: true,
        autoRenumbered: false,
        occupiedNumbers,
        reason: `Ya existe un sitio activo con el número ${manualOverrideNumeroSitio} en el certificado ${targetCert.numero_certificado}. Puede utilizar el número sugerido ${suggestedNumeroSitio}.`,
      };
    }
    return {
      allowed: true,
      assignedNumeroSitio: manualOverrideNumeroSitio,
      suggestedNumeroSitio,
      targetHasSitio0,
      collisionDetected: false,
      autoRenumbered: false,
      occupiedNumbers,
    };
  }

  const desiredRaw =
    preferredNumeroSitio !== undefined && preferredNumeroSitio !== null
      ? preferredNumeroSitio
      : sourceSite
        ? sourceSite.numero_sitio
        : suggestedNumeroSitio;

  if (!Number.isInteger(desiredRaw) || desiredRaw < 0) {
    return {
      allowed: false,
      assignedNumeroSitio: null,
      suggestedNumeroSitio,
      targetHasSitio0,
      collisionDetected: false,
      autoRenumbered: false,
      occupiedNumbers,
      reason:
        'El número de sitio preferido debe ser un entero mayor o igual a 0 (0 corresponde a Sede Principal HQ).',
    };
  }

  if (!occupiedSet.has(desiredRaw)) {
    return {
      allowed: true,
      assignedNumeroSitio: desiredRaw,
      suggestedNumeroSitio,
      targetHasSitio0,
      collisionDetected: false,
      autoRenumbered: false,
      occupiedNumbers,
    };
  }

  return {
    allowed: true,
    assignedNumeroSitio: suggestedNumeroSitio,
    suggestedNumeroSitio,
    targetHasSitio0,
    collisionDetected: true,
    autoRenumbered: true,
    occupiedNumbers,
    reason: `El certificado ${targetCert.numero_certificado} ya tiene asignado un Sitio ${desiredRaw}; se asignará automáticamente como Sitio ${suggestedNumeroSitio}.`,
  };
}

/**
 * Computes eligible certificates in the same active Conglomerado for sharing a Site,
 * annotating `alreadyShared` state and safe `numero_sitio` resolution.
 */
export function getEligibleSitioShareTargets(
  params: GetEligibleSitioShareTargetsParams
): EligibleSitioShareTargetsResult {
  const {
    sourceCert,
    sourceSite,
    allCertificates,
    organizaciones,
    conglomerados,
    profile = null,
    authorizedClientOrgIds,
    existingSitioCertLinks = [],
    archivedSiteIds,
  } = params;

  assertValidUuid(sourceSite.id, 'sitio origen');

  const baseEligibility = getEligibleShareTargetCertificates({
    sourceCert,
    allCertificates,
    organizaciones,
    conglomerados,
    profile,
    authorizedClientOrgIds,
  });

  const certById = new Map<string, CertificadoDetailEntity>(
    allCertificates.filter((c) => !c.deleted_at).map((c) => [c.id.trim(), c])
  );
  const bridgeSharedCertIds = new Set<string>(
    existingSitioCertLinks
      .filter(
        (l) =>
          !l.deleted_at &&
          l.id_sitio.trim() === sourceSite.id.trim() &&
          isValidUuid(l.id_certificado)
      )
      .map((l) => l.id_certificado.trim())
  );

  const targets: EligibleSitioShareTarget[] = [];
  for (const target of baseEligibility.targets) {
    const targetCertEntity = certById.get(target.id);
    if (!targetCertEntity) continue;

    const alreadyInTarget = (targetCertEntity.sitios || []).some(
      (s) => s.id.trim() === sourceSite.id.trim() && !archivedSiteIds?.has(s.id) && !isSiteDeleted(s)
    );
    const alreadyInMetadata = (sourceSite.sharedTargets || []).some(
      (st) => st.targetCertId.trim() === target.id
    );
    const alreadyShared =
      alreadyInTarget || alreadyInMetadata || bridgeSharedCertIds.has(target.id);

    const numeroResolution = resolveTargetNumeroSitioForSharedSite({
      sourceSite,
      targetCert: targetCertEntity,
      archivedSiteIds,
    });

    targets.push({
      ...target,
      alreadyShared,
      numeroResolution,
    });
  }

  return {
    targets,
    sourceGroupId: baseEligibility.sourceGroupId,
    sourceGroupNombre: baseEligibility.sourceGroupNombre,
    missingConglomeradoReason: baseEligibility.missingConglomeradoReason,
  };
}

function collectActiveShiftsLinkedToSite(params: {
  site: SiteEntity;
  sourceCert: CertificadoDetailEntity;
  existingTurnosPorSitio?: ReadonlyArray<ExistingTurnoPorSitioRef>;
  archivedTurnoIds?: ReadonlySet<string>;
}): ShiftEntity[] {
  const { site, sourceCert, existingTurnosPorSitio = [], archivedTurnoIds } = params;
  const shiftById = new Map<string, ShiftEntity>();
  for (const shift of sourceCert.turnos || []) {
    if (archivedTurnoIds?.has(shift.id) || isShiftDeleted(shift)) continue;
    shiftById.set(shift.id.trim(), shift);
  }

  const matchedIds = new Set<string>();
  const out: ShiftEntity[] = [];

  const pushIfValid = (shift: ShiftEntity | undefined): void => {
    if (!shift) return;
    const cleanId = shift.id.trim();
    if (matchedIds.has(cleanId) || archivedTurnoIds?.has(cleanId) || isShiftDeleted(shift)) {
      return;
    }
    matchedIds.add(cleanId);
    out.push(shift);
  };

  for (const tps of site.turnos_por_sitio || []) {
    if (tps.deleted_at) continue;
    pushIfValid(shiftById.get(tps.id_turno.trim()));
  }

  for (const tps of existingTurnosPorSitio) {
    if (tps.deleted_at || tps.id_sitio.trim() !== site.id.trim()) continue;
    pushIfValid(shiftById.get(tps.id_turno.trim()));
  }

  for (const lbl of site.turnos_vinculados || []) {
    const cleanLbl = normalizeLabel(lbl);
    if (!cleanLbl) continue;
    const byId = shiftById.get(lbl.trim());
    if (byId) {
      pushIfValid(byId);
      continue;
    }
    for (const shift of shiftById.values()) {
      if (normalizeLabel(shift.descripcion) === cleanLbl) {
        pushIfValid(shift);
      }
    }
  }

  const cleanSiteName = normalizeLabel(site.nombre_sitio);
  if (cleanSiteName) {
    for (const shift of shiftById.values()) {
      if (
        (shift.sitios_vinculados || []).some((name) => normalizeLabel(name) === cleanSiteName)
      ) {
        pushIfValid(shift);
      }
    }
  }

  return out;
}

function collectActiveProcessesLinkedToSite(params: {
  site: SiteEntity;
  sourceCert: CertificadoDetailEntity;
  existingProcesosPorSitio?: ReadonlyArray<ProcesoPorSitioLink>;
  archivedProcesoIds?: ReadonlySet<string>;
}): ProcessEntity[] {
  const { site, sourceCert, existingProcesosPorSitio = [], archivedProcesoIds } = params;
  const procById = new Map<string, ProcessEntity>();
  for (const proc of sourceCert.procesos || []) {
    if (archivedProcesoIds?.has(proc.id) || isProcessDeleted(proc)) continue;
    procById.set(proc.id.trim(), proc);
  }

  const matchedIds = new Set<string>();
  const out: ProcessEntity[] = [];

  const pushIfValid = (proc: ProcessEntity | undefined): void => {
    if (!proc) return;
    const cleanId = proc.id.trim();
    if (matchedIds.has(cleanId) || archivedProcesoIds?.has(cleanId) || isProcessDeleted(proc)) {
      return;
    }
    matchedIds.add(cleanId);
    out.push(proc);
  };

  for (const link of site.procesos_por_sitio || []) {
    if (link.deleted_at) continue;
    if (link.id_certificado && link.id_certificado.trim() !== sourceCert.id.trim()) continue;
    pushIfValid(procById.get(link.id_proceso.trim()));
  }

  for (const link of existingProcesosPorSitio) {
    if (link.deleted_at || link.id_sitio.trim() !== site.id.trim()) continue;
    if (link.id_certificado && link.id_certificado.trim() !== sourceCert.id.trim()) continue;
    pushIfValid(procById.get(link.id_proceso.trim()));
  }

  for (const lbl of site.procesos_vinculados || []) {
    const cleanLbl = normalizeLabel(lbl);
    if (!cleanLbl) continue;
    const byId = procById.get(lbl.trim());
    if (byId) {
      pushIfValid(byId);
      continue;
    }
    for (const proc of procById.values()) {
      if (normalizeLabel(proc.nombre_proceso) === cleanLbl) {
        pushIfValid(proc);
      }
    }
  }

  return out;
}

/**
 * Generates a deterministic execution plan for sharing selected `Sitio` records from
 * `sourceCert` to one or more `targetCertIds` inside the same Conglomerado, cascading:
 * 1. Collision-free target `numero_sitio` (`Sitio 0` protection + `max + 1` renumbering)
 * 2. Active site shifts (`turno_certificado_compartido`)
 * 3. Selected site processes (`procesos_por_sitio` + deterministic binary `id_norma`
 *    planning via `planShareProcesos`, reusing existing shared/owned processes safely)
 */
export function planShareSitiosWithCascade(
  params: PlanShareSitiosWithCascadeParams
): SitioShareExecutionPlan {
  const {
    sourceCert,
    selectedSiteIds,
    targetCertIds,
    allCertificates,
    organizaciones,
    conglomerados,
    profile = null,
    authorizedClientOrgIds,
    preferredNumeroSitioByTargetCertAndSite,
    manualNumeroSitioByTargetCertAndSite,
    selectedTurnoIdsBySite,
    selectedProcesoIdsBySite,
    existingSitioCertLinks = [],
    existingTurnoCertLinks = [],
    existingProcesoCertLinks = [],
    existingTurnosPorSitio = [],
    existingProcesosPorSitio = [],
    requirementsCatalog = getAllSeededNormaRequirements(),
    archivedSiteIds,
    archivedTurnoIds,
    archivedProcesoIds,
    archivedNoAplicableIds,
    shareProcesosWithRequisitos = true,
  } = params;

  const sitioLinksToCreate: SitioCertLinkDraft[] = [];
  const turnoCertLinksToCreate: TurnoCertLinkDraft[] = [];
  const procesoSharesWithClausePlans: SitioCascadeProcesoSharePlan[] = [];
  const procesosPorSitioToCreate: ProcesoPorSitioCascadeDraft[] = [];
  const reusedExistingProcesses: ReusedExistingProcessRef[] = [];
  const alreadySharedSites: SitioAlreadySharedItem[] = [];
  const validationErrors: string[] = [];

  if (!isValidUuid(sourceCert.id) || !isValidUuid(sourceCert.id_organizacion)) {
    validationErrors.push(
      'El certificado u organización origen no posee un identificador válido.'
    );
    return {
      sitioLinksToCreate,
      turnoCertLinksToCreate,
      procesoSharesWithClausePlans,
      procesosPorSitioToCreate,
      reusedExistingProcesses,
      alreadySharedSites,
      validationErrors,
      isExecutable: false,
    };
  }

  const cleanSiteIds = dedupeTrimmedIds(selectedSiteIds);
  const cleanTargetCertIds = dedupeTrimmedIds(targetCertIds);

  if (cleanSiteIds.length === 0) {
    validationErrors.push('Debe seleccionar al menos un sitio operativo para compartir.');
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

  const sourceSiteById = new Map<string, SiteEntity>();
  for (const site of sourceCert.sitios || []) {
    if (archivedSiteIds?.has(site.id) || isSiteDeleted(site)) continue;
    sourceSiteById.set(site.id.trim(), site);
  }

  const resolvedSites: SiteEntity[] = [];
  for (const siteId of cleanSiteIds) {
    if (!isValidUuid(siteId)) {
      validationErrors.push('Uno de los sitios seleccionados no es válido.');
      continue;
    }
    const site = sourceSiteById.get(siteId);
    if (!site) {
      validationErrors.push(
        `El sitio seleccionado no existe o está archivado en el certificado ${sourceCert.numero_certificado}.`
      );
      continue;
    }
    resolvedSites.push(site);
  }

  const activeSitioBridgeSet = new Set<string>();
  for (const link of existingSitioCertLinks) {
    if (link.deleted_at) continue;
    if (!isValidUuid(link.id_sitio) || !isValidUuid(link.id_certificado)) continue;
    activeSitioBridgeSet.add(`${link.id_sitio.trim()}::${link.id_certificado.trim()}`);
  }

  const activeTurnoBridgeSet = new Set<string>();
  for (const link of existingTurnoCertLinks) {
    if (link.deleted_at) continue;
    if (!isValidUuid(link.id_turno) || !isValidUuid(link.id_certificado)) continue;
    activeTurnoBridgeSet.add(`${link.id_turno.trim()}::${link.id_certificado.trim()}`);
  }

  const activeProcesoBridgeSet = new Set<string>();
  for (const link of existingProcesoCertLinks) {
    if (link.deleted_at) continue;
    if (!isValidUuid(link.id_proceso) || !isValidUuid(link.id_certificado)) continue;
    activeProcesoBridgeSet.add(`${link.id_proceso.trim()}::${link.id_certificado.trim()}`);
  }

  const existingPpsByCertSiteProc = new Set<string>();
  for (const pps of existingProcesosPorSitio) {
    if (pps.deleted_at || !pps.id_certificado) continue;
    existingPpsByCertSiteProc.add(
      `${pps.id_certificado.trim()}::${pps.id_sitio.trim()}::${pps.id_proceso.trim()}`
    );
  }

  const seenTurnoLinks = new Set<string>();
  const seenReusedProcess = new Set<string>();
  const seenPpsLinks = new Set<string>();
  const procesoSharePlanIndexByKey = new Map<string, number>();

  for (const rawTargetCertId of cleanTargetCertIds) {
    if (!isValidUuid(rawTargetCertId)) {
      validationErrors.push('Uno de los certificados destino seleccionados no es válido.');
      continue;
    }

    const eligibleTarget = eligibleById.get(rawTargetCertId);
    const targetCert = certById.get(rawTargetCertId);

    if (!eligibleTarget || !targetCert) {
      if (rawTargetCertId === sourceCert.id.trim()) {
        validationErrors.push(
          `No puede compartir sitios hacia el mismo certificado origen (${sourceCert.numero_certificado}).`
        );
      } else {
        const targetLabel = targetCert?.numero_certificado || 'destino seleccionado';
        validationErrors.push(
          `El certificado ${targetLabel} no es elegible para compartición en este conglomerado o está fuera de su alcance autorizado.`
        );
      }
      continue;
    }

    // Track numbers reserved inside this batch so sharing multiple sites to the same target cert never collides
    const reservedNumbersForTarget = new Set<number>();

    for (const site of resolvedSites) {
      const cleanSiteId = site.id.trim();
      const alreadyInTarget = (targetCert.sitios || []).some(
        (s) => s.id.trim() === cleanSiteId && !archivedSiteIds?.has(s.id) && !isSiteDeleted(s)
      );
      const alreadyInMetadata = (site.sharedTargets || []).some(
        (st) => st.targetCertId.trim() === rawTargetCertId
      );
      const alreadyInBridge = activeSitioBridgeSet.has(`${cleanSiteId}::${rawTargetCertId}`);

      if (alreadyInTarget || alreadyInMetadata || alreadyInBridge) {
        alreadySharedSites.push({
          id_sitio: cleanSiteId,
          nombre_sitio: site.nombre_sitio,
          id_certificado: rawTargetCertId,
          target_numero_certificado: targetCert.numero_certificado,
          code: 'ALREADY_SHARED',
          message: `El sitio "${site.nombre_sitio}" ya se encuentra compartido activamente con el certificado ${targetCert.numero_certificado}.`,
        });
        continue;
      }

      const keyCompound = `${rawTargetCertId}::${cleanSiteId}`;
      const preferredNum =
        preferredNumeroSitioByTargetCertAndSite?.[keyCompound] ??
        preferredNumeroSitioByTargetCertAndSite?.[rawTargetCertId];
      const manualNum =
        manualNumeroSitioByTargetCertAndSite?.[keyCompound] ??
        manualNumeroSitioByTargetCertAndSite?.[rawTargetCertId];

      const numResolution = resolveTargetNumeroSitioForSharedSite({
        sourceSite: site,
        targetCert,
        preferredNumeroSitio: preferredNum,
        manualOverrideNumeroSitio: manualNum,
        archivedSiteIds,
        reservedNumbers: reservedNumbersForTarget,
      });

      if (!numResolution.allowed || numResolution.assignedNumeroSitio === null) {
        validationErrors.push(
          numResolution.reason ||
            `No fue posible asignar un número de sitio válido para "${site.nombre_sitio}" en ${targetCert.numero_certificado}.`
        );
        continue;
      }

      reservedNumbersForTarget.add(numResolution.assignedNumeroSitio);
      sitioLinksToCreate.push({
        id_sitio: cleanSiteId,
        nombre_sitio: site.nombre_sitio,
        source_numero_sitio: site.numero_sitio,
        numero_sitio: numResolution.assignedNumeroSitio,
        id_certificado: rawTargetCertId,
        id_certificado_origen: sourceCert.id.trim(),
        target_numero_certificado: targetCert.numero_certificado,
        target_organizacion_nombre: targetCert.organizacion_nombre,
        autoRenumbered: numResolution.autoRenumbered,
      });

      // 1. Cascade Turnos (`turno_certificado_compartido`)
      const activeSiteShifts = collectActiveShiftsLinkedToSite({
        site,
        sourceCert,
        existingTurnosPorSitio,
        archivedTurnoIds,
      });
      const explicitTurnoSelection = selectedTurnoIdsBySite?.[cleanSiteId];
      const allowedTurnoIdSet = explicitTurnoSelection
        ? new Set(dedupeTrimmedIds(explicitTurnoSelection))
        : null;

      if (allowedTurnoIdSet) {
        for (const chosenTurnoId of allowedTurnoIdSet) {
          if (!isValidUuid(chosenTurnoId)) {
            validationErrors.push('Uno de los turnos seleccionados para cascada no es válido.');
            continue;
          }
          const shiftInSource = (sourceCert.turnos || []).find(
            (t) =>
              t.id.trim() === chosenTurnoId &&
              !archivedTurnoIds?.has(t.id) &&
              !isShiftDeleted(t)
          );
          if (!shiftInSource) {
            validationErrors.push(
              `Un turno seleccionado para "${site.nombre_sitio}" no está activo en ${sourceCert.numero_certificado}.`
            );
          }
        }
      }

      const candidateShiftsForCascade = allowedTurnoIdSet
        ? (sourceCert.turnos || []).filter(
            (t) =>
              allowedTurnoIdSet.has(t.id.trim()) &&
              !archivedTurnoIds?.has(t.id) &&
              !isShiftDeleted(t)
          )
        : activeSiteShifts;

      for (const shift of candidateShiftsForCascade) {
        const cleanShiftId = shift.id.trim();
        if (!isValidUuid(cleanShiftId)) {
          validationErrors.push('Uno de los turnos del sitio no posee un identificador válido.');
          continue;
        }
        const alreadyInTargetShifts = (targetCert.turnos || []).some(
          (t) => t.id.trim() === cleanShiftId && !archivedTurnoIds?.has(t.id) && !isShiftDeleted(t)
        );
        const shiftAlreadyBridge =
          activeTurnoBridgeSet.has(`${cleanShiftId}::${rawTargetCertId}`) ||
          (shift.sharedTargets || []).some((st) => st.targetCertId.trim() === rawTargetCertId);

        if (alreadyInTargetShifts || shiftAlreadyBridge) {
          continue;
        }

        const shiftLinkKey = `${cleanShiftId}::${rawTargetCertId}`;
        if (seenTurnoLinks.has(shiftLinkKey)) continue;
        seenTurnoLinks.add(shiftLinkKey);

        turnoCertLinksToCreate.push({
          id_turno: cleanShiftId,
          turno_label: resolveShiftTimeLabel(shift),
          id_certificado: rawTargetCertId,
          id_certificado_origen: sourceCert.id.trim(),
          target_numero_certificado: targetCert.numero_certificado,
          target_organizacion_nombre: targetCert.organizacion_nombre,
        });
      }

      // 2. Cascade Procesos (`procesos_por_sitio` + deterministic binary `id_norma` rule)
      const activeSiteProcesses = collectActiveProcessesLinkedToSite({
        site,
        sourceCert,
        existingProcesosPorSitio,
        archivedProcesoIds,
      });
      const hasExplicitProcesoSelection = Boolean(
        selectedProcesoIdsBySite &&
          Object.prototype.hasOwnProperty.call(selectedProcesoIdsBySite, cleanSiteId)
      );
      const explicitProcesoSelection = hasExplicitProcesoSelection
        ? selectedProcesoIdsBySite![cleanSiteId]
        : undefined;
      const allowedProcesoIdSet = explicitProcesoSelection
        ? new Set(dedupeTrimmedIds(explicitProcesoSelection))
        : null;

      if (allowedProcesoIdSet) {
        for (const chosenProcId of allowedProcesoIdSet) {
          if (!isValidUuid(chosenProcId)) {
            validationErrors.push('Uno de los procesos seleccionados para cascada no es válido.');
            continue;
          }
          const procInSource = (sourceCert.procesos || []).find(
            (p) =>
              p.id.trim() === chosenProcId &&
              !archivedProcesoIds?.has(p.id) &&
              !isProcessDeleted(p)
          );
          if (!procInSource) {
            validationErrors.push(
              `Un proceso seleccionado para "${site.nombre_sitio}" no está activo en ${sourceCert.numero_certificado}.`
            );
          }
        }
      }

      const candidateProcessesForCascade = allowedProcesoIdSet
        ? (sourceCert.procesos || []).filter(
            (p) =>
              allowedProcesoIdSet.has(p.id.trim()) &&
              !archivedProcesoIds?.has(p.id) &&
              !isProcessDeleted(p)
          )
        : activeSiteProcesses;

      for (const proc of candidateProcessesForCascade) {
        const cleanProcId = proc.id.trim();
        if (!isValidUuid(cleanProcId)) {
          validationErrors.push('Uno de los procesos del sitio no posee un identificador válido.');
          continue;
        }

        const alreadyInTargetCert =
          (targetCert.procesos || []).some(
            (tp) =>
              tp.id.trim() === cleanProcId &&
              !archivedProcesoIds?.has(tp.id) &&
              !isProcessDeleted(tp)
          ) ||
          activeProcesoBridgeSet.has(`${cleanProcId}::${rawTargetCertId}`) ||
          (proc.sharedTargets || []).some((st) => st.targetCertId.trim() === rawTargetCertId);

        if (alreadyInTargetCert) {
          const reusedKey = `${rawTargetCertId}::${cleanProcId}`;
          if (!seenReusedProcess.has(reusedKey)) {
            seenReusedProcess.add(reusedKey);
            reusedExistingProcesses.push({
              id_proceso: cleanProcId,
              nombre_proceso: proc.nombre_proceso,
              id_certificado: rawTargetCertId,
              target_numero_certificado: targetCert.numero_certificado,
            });
          }
        } else {
          const sharePlanKey = `${rawTargetCertId}::${cleanProcId}`;
          const existingIdx = procesoSharePlanIndexByKey.get(sharePlanKey);
          if (existingIdx !== undefined) {
            const existingPlan = procesoSharesWithClausePlans[existingIdx];
            if (!existingPlan.siteIdsTriggeringShare.includes(cleanSiteId)) {
              existingPlan.siteIdsTriggeringShare.push(cleanSiteId);
            }
          } else {
            const binaryPlan = planShareProcesos({
              sourceCert,
              selectedProcesoIds: [cleanProcId],
              targetCertIds: [rawTargetCertId],
              allCertificates,
              organizaciones,
              conglomerados,
              profile,
              authorizedClientOrgIds,
              shareWithRequisitos: shareProcesosWithRequisitos,
              syncRequisitosWithSameNorm: shareProcesosWithRequisitos,
              existingProcesoCertLinks,
              requirementsCatalog,
              archivedProcesoIds,
              archivedNoAplicableIds,
            });
            const outcome = binaryPlan.outcomes[0];

            const sameNorm = outcome
              ? outcome.sameNorm
              : Boolean(
                  sourceCert.id_norma &&
                    targetCert.id_norma &&
                    sourceCert.id_norma.trim() === targetCert.id_norma.trim()
                );
            const requisitoIds = outcome ? [...outcome.requisitoIds] : [];
            const excludedByIso43Codes = outcome
              ? [...outcome.excludedByIso43Codes]
              : [];
            const sincronizarRequisitos = outcome
              ? outcome.sincronizar_requisitos
              : false;
            const mode: ProcessShareMode = outcome
              ? outcome.mode
              : 'PROCESS_ONLY_INDEPENDENT';
            const summaryMessage = outcome
              ? outcome.summaryMessage
              : sameNorm
                ? `Misma norma (${sourceCert.norma_codigo}): se compartirá el proceso con ${requisitoIds.length} cláusula(s) aplicable(s).`
                : `Norma distinta (${sourceCert.norma_codigo} → ${targetCert.norma_codigo}): se compartirá únicamente el proceso vacío (0 requisitos). Las cláusulas se asignan por separado en cada norma.`;

            const targetScopedReqs = sameNorm
              ? getScopedNormaRequirements({
                  id_norma: targetCert.id_norma,
                  norma_codigo: targetCert.norma_codigo,
                  requirementsCatalog,
                })
              : [];
            const targetReqById = new Map(targetScopedReqs.map((r) => [r.id, r]));
            const targetReqByLowerCode = new Map(
              targetScopedReqs.map((r) => [r.codigo.trim().toLowerCase(), r])
            );

            const legacyEntries: ClauseResolutionEntry[] = sameNorm
              ? [
                  ...requisitoIds
                    .map((reqId) => targetReqById.get(reqId))
                    .filter((req): req is RequisitoLtree => Boolean(req))
                    .map((req) => ({
                      entryKey: `clause:${req.codigo}`,
                      status: 'EXACT_SAME_NORM' as const,
                      sourceClauses: [req.codigo],
                      sourceTitles: [req.titulo],
                      sourceRequisitos: [req],
                      targetCandidate: req,
                      descendantTargetCandidates: [],
                      preselected: true,
                      disabled: false,
                      warningMessage: null,
                      informativeNote: `Misma norma (${targetCert.norma_codigo}): ${req.codigo} — ${req.titulo}.`,
                    })),
                  ...excludedByIso43Codes.map((exclCode) => {
                    const exclReq =
                      targetReqByLowerCode.get(exclCode.trim().toLowerCase()) ?? null;
                    return {
                      entryKey: `clause:${exclCode}`,
                      status: 'EXCLUDED_ISO43' as const,
                      sourceClauses: [exclCode],
                      sourceTitles: [exclReq?.titulo || `Cláusula ${exclCode}`],
                      sourceRequisitos: exclReq ? [exclReq] : [],
                      targetCandidate: exclReq,
                      descendantTargetCandidates: [],
                      preselected: false,
                      disabled: true,
                      warningMessage: `Excluida por ISO 4.3 en certificado destino (cláusula ${exclCode}).`,
                      informativeNote: null,
                      blockingExclusionCodigo: exclCode,
                    };
                  }),
                ]
              : [];

            const resolutionPlan: ProcesoTargetClauseResolutionPlan = {
              procesoId: cleanProcId,
              sourceCertId: sourceCert.id.trim(),
              targetCertId: rawTargetCertId,
              sourceNormaId: (sourceCert.id_norma || '').trim(),
              sourceNormaCodigo: sourceCert.norma_codigo,
              targetNormaId: (targetCert.id_norma || '').trim(),
              targetNormaCodigo: targetCert.norma_codigo,
              isCrossStandard: !sameNorm,
              entries: legacyEntries,
              summaryCounts: {
                autoMappedCount: sameNorm ? requisitoIds.length : 0,
                hierarchicalCount: 0,
                semanticCollisionCount: 0,
                noEquivalentCount: 0,
                excludedIso43Count: sameNorm ? excludedByIso43Codes.length : 0,
              },
              availableManualTargetOptions: sameNorm ? targetScopedReqs : [],
            };

            procesoSharePlanIndexByKey.set(sharePlanKey, procesoSharesWithClausePlans.length);
            procesoSharesWithClausePlans.push({
              id_proceso: cleanProcId,
              nombre_proceso: proc.nombre_proceso,
              tipo: proc.tipo,
              sourceCertId: sourceCert.id.trim(),
              targetCertId: rawTargetCertId,
              targetNumeroCertificado: targetCert.numero_certificado,
              targetNormaCodigo: targetCert.norma_codigo,
              sameNorm,
              mode,
              sincronizar_requisitos: sincronizarRequisitos,
              requisitoIds,
              excludedByIso43Codes,
              summaryMessage,
              siteIdsTriggeringShare: [cleanSiteId],
              resolutionPlan,
              defaultFinalRequisitoIds: [...requisitoIds],
            });
          }
        }

        const ppsKey = `${rawTargetCertId}::${cleanSiteId}::${cleanProcId}`;
        if (!existingPpsByCertSiteProc.has(ppsKey) && !seenPpsLinks.has(ppsKey)) {
          seenPpsLinks.add(ppsKey);
          procesosPorSitioToCreate.push({
            id_certificado: rawTargetCertId,
            id_sitio: cleanSiteId,
            id_proceso: cleanProcId,
            nombre_proceso: proc.nombre_proceso,
            tipo_proceso: proc.tipo,
            site_nombre: site.nombre_sitio,
            target_numero_certificado: targetCert.numero_certificado,
            usesExistingTargetProcess: alreadyInTargetCert,
          });
        }
      }
    }
  }

  const isExecutable = validationErrors.length === 0 && sitioLinksToCreate.length > 0;

  return {
    sitioLinksToCreate,
    turnoCertLinksToCreate,
    procesoSharesWithClausePlans,
    procesosPorSitioToCreate,
    reusedExistingProcesses,
    alreadySharedSites,
    validationErrors,
    isExecutable,
  };
}
