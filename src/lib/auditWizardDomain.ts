/**
 * Step 4.1 — Wizard `+ Auditoría` (3 Fases) Pure Domain Logic
 *
 * Implements strictly typed:
 * - Fase 1: Bidirectional Conglomerado <-> Organización selection (`string | null`)
 * - Fase 2: Vínculo box selection with per-certificate toggles (ON by default)
 *   supporting full box, partial subset, or single certificate, enforcing active
 *   `Alcance` strictly on enabled (`enabled === true`) certificates.
 * - Fase 3: Planned date + 2-column matrix (`Relación / Naturaleza` pre-filled
 *   from Vínculo / override via `resolveCertEffectiveNatureInBox` & `Tipo de Auditoría`),
 *   clean short `etiqueta` suggestion (`resolveShortConglomeradoName` / `formatAuditCodename`),
 *   and `Step3NewCycleDraft` builder with derived `nivel_vinculacion` and `tipo_vinculacion`
 *   (homogeneous or `'Mixta'`).
 *
 * Zero-UUID compliant with strict TypeScript typing.
 */

import type { OrganizacionEntity } from './activeCertificates';
import type { ProgramacionAuditEntity } from './auditExecution';
import type { ConglomeradoEntity } from './conglomeradoDomain';
import {
  type AuditLinkLevel,
  type AuditLinkNature,
} from './auditPlanningEngine';
import {
  deriveProgramLinkLevelFromCertSubset,
  deriveProgramLinkNatureFromCertSubset,
  isValidAuditLinkNature,
  resolveCampaignTargetYear,
  validateStep3NewCycleDraft,
  type Step3NewCycleCertTypeDraft,
  type Step3NewCycleDraft,
} from './auditPlanningPersistence';
import { resolveCertVersionSnapshotForAudit } from './certificadoVersionDomain';
import {
  formatAuditCodename,
  generateNextIndividualAuditCodenamesBatch,
  generateNextLinkedAuditCodename,
  resolveShortConglomeradoName,
  type AuditYearSourceInput,
  type LinkedProgramYearSourceInput,
} from './codenameDomain';
import type { TipoAuditoriaCatalogItem } from './extraDomain';
import type { CertificadoDetailEntity } from './multisiteSampling';
import {
  resolveCertEffectiveNatureInBox,
  type VinculoCertificadoItem,
  type VinculoEntity,
} from './vinculoDomain';
import {
  hasCertificateActiveAlcance,
  validateVinculoCertificatesHaveAlcance,
  type AlcanceCertificadoEntity,
  type AuditAlcanceGateResult,
} from './alcanceDomain';
import { isValidUuid } from './zeroUuid';

export interface WizardCertRef {
  id: string;
  id_organizacion: string;
  id_grupo_empresarial?: string | null;
  numero_certificado?: string;
  organizacion_abreviacion?: string | null;
  version_actual_numero?: number | null;
  deleted_at?: string | null;
  alcanceDetalle?: AlcanceCertificadoEntity | null;
  hasAlcance?: boolean;
}

export interface WizardVinculoCertOption {
  id_certificado: string;
  numero_certificado: string;
  norma_codigo: string;
  id_organizacion: string;
  organizacion_nombre: string;
  organizacion_abreviacion: string | null;
  version_numero: number | null;
  enabled: boolean;
  baseNaturaleza: AuditLinkNature;
  hasActiveAlcance: boolean;
}

export interface WizardCertPhase3Entry {
  id_tipo_auditoria: string;
  tipo_vinculacion: AuditLinkNature;
}

export type AuditWizardStep = 1 | 2 | 3;

export interface AuditWizardState {
  isOpen: boolean;
  step: AuditWizardStep;
  selectedConglomeradoId: string | null;
  selectedOrganizacionId: string | null;
  selectedVinculoId: string | null;
  vinculoMembers: WizardVinculoCertOption[];
  codigo_programa: string;
  etiqueta: string;
  dateMode: 'PREPROGRAMADA_MES' | 'PROGRAMADA_EXACTA';
  anio: number;
  mes: number;
  fecha_programada: string;
  observacion: string;
  certEntries: Record<string, WizardCertPhase3Entry>;
  certTypes: Step3NewCycleCertTypeDraft[];
  defaultTipoAuditoriaId: string;
  isSubmitting: boolean;
  errorMessage: string | null;
}

function normalizeOptionalId(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveMemberHasActiveAlcance(
  member: Pick<
    VinculoCertificadoItem,
    'id_certificado' | 'numero_certificado' | 'hasAlcance' | 'alcanceDetalle'
  >,
  certMeta: WizardCertRef | undefined
): boolean {
  if (certMeta) {
    if (typeof certMeta.hasAlcance === 'boolean') {
      return certMeta.hasAlcance;
    }
    if ('alcanceDetalle' in certMeta) {
      return hasCertificateActiveAlcance(certMeta);
    }
    if ('numero_certificado' in certMeta) {
      return hasCertificateActiveAlcance(certMeta);
    }
    return true;
  }
  if (typeof member.hasAlcance === 'boolean') {
    return member.hasAlcance;
  }
  if ('alcanceDetalle' in member) {
    return hasCertificateActiveAlcance(member);
  }
  return true;
}

function syncCertTypesFromMembersAndEntries(
  vinculoMembers: ReadonlyArray<WizardVinculoCertOption>,
  certEntries: Record<string, WizardCertPhase3Entry>,
  defaultTipoId: string
): Step3NewCycleCertTypeDraft[] {
  return vinculoMembers
    .filter((m) => m.enabled)
    .map((m) => {
      const entry = certEntries[m.id_certificado];
      return {
        id_certificado: m.id_certificado,
        numero_certificado: m.numero_certificado,
        organizacion_nombre: m.organizacion_nombre,
        organizacion_abreviacion: m.organizacion_abreviacion,
        version_numero: m.version_numero,
        norma_codigo: m.norma_codigo,
        id_tipo_auditoria: entry?.id_tipo_auditoria ?? defaultTipoId,
        tipo_vinculacion: entry?.tipo_vinculacion ?? m.baseNaturaleza,
      };
    });
}

function buildWizardMembersForVinculo(
  vinculo: VinculoEntity,
  certificados: ReadonlyArray<WizardCertRef> = [],
  organizaciones: ReadonlyArray<OrganizacionEntity> = []
): WizardVinculoCertOption[] {
  const certById = new Map(certificados.map((c) => [c.id, c]));
  const orgAbrevById = new Map(
    organizaciones
      .filter((o) => !o.deleted_at && o.abreviacion)
      .map((o) => [o.id, o.abreviacion as string])
  );

  return vinculo.certificados
    .filter((c) => !c.deleted_at)
    .map((c) => {
      const certMeta = certById.get(c.id_certificado);
      const abrev =
        c.organizacion_abreviacion ??
        certMeta?.organizacion_abreviacion ??
        orgAbrevById.get(c.id_organizacion) ??
        null;
      const versionNum =
        typeof certMeta?.version_actual_numero === 'number' &&
        certMeta.version_actual_numero >= 1
          ? Math.floor(certMeta.version_actual_numero)
          : null;
      return {
        id_certificado: c.id_certificado,
        numero_certificado: c.numero_certificado || certMeta?.numero_certificado || 'Certificado',
        norma_codigo: c.norma_codigo,
        id_organizacion: c.id_organizacion || certMeta?.id_organizacion || '',
        organizacion_nombre: c.organizacion_nombre,
        organizacion_abreviacion: abrev,
        version_numero: versionNum,
        enabled: true,
        baseNaturaleza: resolveCertEffectiveNatureInBox(vinculo, c),
        hasActiveAlcance: resolveMemberHasActiveAlcance(c, certMeta),
      };
    });
}

function buildInitialCertEntries(
  vinculoMembers: ReadonlyArray<WizardVinculoCertOption>,
  defaultTipoId: string,
  prevEntries?: Record<string, WizardCertPhase3Entry>
): Record<string, WizardCertPhase3Entry> {
  const nextEntries: Record<string, WizardCertPhase3Entry> = {};
  for (const member of vinculoMembers) {
    if (!member.enabled) continue;
    const prev = prevEntries?.[member.id_certificado];
    nextEntries[member.id_certificado] = {
      id_tipo_auditoria: prev?.id_tipo_auditoria || defaultTipoId,
      tipo_vinculacion: prev?.tipo_vinculacion || member.baseNaturaleza,
    };
  }
  return nextEntries;
}

export function suggestWizardEtiqueta(params: {
  vinculo?: VinculoEntity | null;
  conglomerado?: ConglomeradoEntity | null;
  dateMode: 'PREPROGRAMADA_MES' | 'PROGRAMADA_EXACTA';
  anio: number;
  mes: number;
  fecha_programada: string;
  primaryTipo?: Pick<TipoAuditoriaCatalogItem, 'tipo' | 'abreviacion'> | null;
}): string {
  const {
    vinculo,
    conglomerado,
    dateMode,
    anio,
    mes,
    fecha_programada,
    primaryTipo,
  } = params;

  const shortCong = resolveShortConglomeradoName({
    nombre: conglomerado?.nombre ?? vinculo?.grupo_nombre ?? vinculo?.etiqueta,
    abreviacion: conglomerado?.abreviacion,
    codigo_grupo: conglomerado?.codigo_grupo,
  });

  const cleanDate = fecha_programada.trim();
  const codename = formatAuditCodename({
    fechas: [
      dateMode === 'PROGRAMADA_EXACTA' && /^\d{4}-\d{2}-\d{2}$/.test(cleanDate)
        ? {
            id: 'wizard-preview',
            id_auditoria: 'wizard-preview',
            numero_secuencia: 1,
            tag: 'Programación',
            tipo_fecha: 'PROGRAMADA_EXACTA',
            anio: null,
            mes: null,
            fecha_inicio: cleanDate,
            fecha_fin: cleanDate,
          }
        : {
            id: 'wizard-preview',
            id_auditoria: 'wizard-preview',
            numero_secuencia: 1,
            tag: 'Programación',
            tipo_fecha: 'PREPROGRAMADA_MES',
            anio,
            mes,
            fecha_inicio: null,
            fecha_fin: null,
          },
    ],
    tipo_auditoria: primaryTipo?.tipo ?? 'Auditoría',
    tipo_abreviacion: primaryTipo?.abreviacion,
  });

  return `${shortCong} · ${codename}`.slice(0, 180);
}

export function createInitialAuditWizardState(opts?: {
  referenceDate?: Date;
  prefillConglomeradoId?: string | null;
  prefillOrganizacionId?: string | null;
  prefillVinculoId?: string | null;
  prefillStep?: AuditWizardStep;
  conglomerados?: ReadonlyArray<ConglomeradoEntity>;
  organizaciones?: ReadonlyArray<OrganizacionEntity>;
  vinculos?: ReadonlyArray<VinculoEntity>;
  certificados?: ReadonlyArray<WizardCertRef>;
  tiposCatalog?: ReadonlyArray<TipoAuditoriaCatalogItem>;
}): AuditWizardState {
  const ref = opts?.referenceDate ?? new Date();
  const todayIso = ref.toISOString().slice(0, 10);
  const anio = ref.getUTCFullYear();
  const mes = ref.getUTCMonth() + 1;

  let selectedConglomeradoId = normalizeOptionalId(opts?.prefillConglomeradoId);
  const selectedOrganizacionId = normalizeOptionalId(opts?.prefillOrganizacionId);
  const prefillVinculoId = normalizeOptionalId(opts?.prefillVinculoId);

  if (!selectedConglomeradoId && selectedOrganizacionId && opts?.organizaciones) {
    const matchedOrg = opts.organizaciones.find(
      (o) => !o.deleted_at && o.id === selectedOrganizacionId
    );
    selectedConglomeradoId = normalizeOptionalId(matchedOrg?.id_grupo_empresarial);
  }

  const activeTipos = (opts?.tiposCatalog ?? []).filter((t) => !t.deleted_at);
  const defaultTipoAuditoriaId = activeTipos[0]?.id || '';

  const baseState: AuditWizardState = {
    isOpen: true,
    step: 1,
    selectedConglomeradoId,
    selectedOrganizacionId,
    selectedVinculoId: null,
    vinculoMembers: [],
    codigo_programa: '',
    etiqueta: '',
    dateMode: 'PREPROGRAMADA_MES',
    anio,
    mes,
    fecha_programada: todayIso,
    observacion: '',
    certEntries: {},
    certTypes: [],
    defaultTipoAuditoriaId,
    isSubmitting: false,
    errorMessage: null,
  };

  if (prefillVinculoId && opts?.vinculos) {
    const matchedVinculo = opts.vinculos.find(
      (v) => !v.deleted_at && v.id === prefillVinculoId
    );
    if (matchedVinculo) {
      const resolvedCongId =
        selectedConglomeradoId ||
        normalizeOptionalId(matchedVinculo.id_grupo_empresarial);
      const enriched = selectWizardVinculo(
        { ...baseState, selectedConglomeradoId: resolvedCongId },
        matchedVinculo.id,
        opts.vinculos,
        opts.tiposCatalog ?? [],
        opts.certificados ?? [],
        opts.organizaciones ?? [],
        opts.conglomerados ?? []
      );
      const enabledIds = new Set(
        enriched.vinculoMembers.filter((m) => m.enabled).map((m) => m.id_certificado)
      );
      const gate = evaluateWizardAlcanceGate(
        matchedVinculo,
        opts.certificados ?? [],
        opts.organizaciones ?? [],
        enabledIds
      );
      const targetStep: AuditWizardStep =
        opts.prefillStep ?? (gate.allowed ? 3 : 2);
      return {
        ...enriched,
        step: targetStep,
        errorMessage: gate.allowed ? null : gate.reason,
      };
    }
  }

  return baseState;
}

export function getEligibleOrganizationsForWizard(
  selectedConglomeradoId: string | null | undefined,
  organizaciones: ReadonlyArray<OrganizacionEntity>
): OrganizacionEntity[] {
  const cleanCongId = normalizeOptionalId(selectedConglomeradoId);
  const activeOrgs = organizaciones
    .filter((o) => !o.deleted_at)
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  if (!cleanCongId) {
    return activeOrgs;
  }
  return activeOrgs.filter((o) => o.id_grupo_empresarial === cleanCongId);
}

/**
 * Phase 1 (Conglomerado -> Organización): Selecting a Conglomerado updates
 * `selectedConglomeradoId`, clears incompatible organization/vínculo state,
 * and auto-selects when the conglomerate has exactly 1 active organization.
 */
export function selectWizardConglomerado(
  state: AuditWizardState,
  conglomeradoId: string | null | undefined,
  organizaciones: ReadonlyArray<OrganizacionEntity>
): AuditWizardState {
  const cleanId = normalizeOptionalId(conglomeradoId);
  if (!cleanId) {
    return {
      ...state,
      selectedConglomeradoId: null,
      selectedVinculoId: null,
      vinculoMembers: [],
      certEntries: {},
      certTypes: [],
      errorMessage: null,
    };
  }

  const memberOrgs = getEligibleOrganizationsForWizard(cleanId, organizaciones);
  const currentStillValid =
    state.selectedOrganizacionId !== null &&
    memberOrgs.some((o) => o.id === state.selectedOrganizacionId);
  const nextOrgId = currentStillValid
    ? state.selectedOrganizacionId
    : memberOrgs.length === 1
    ? memberOrgs[0].id
    : null;

  const changedCong = state.selectedConglomeradoId !== cleanId;

  return {
    ...state,
    selectedConglomeradoId: cleanId,
    selectedOrganizacionId: nextOrgId,
    selectedVinculoId: changedCong ? null : state.selectedVinculoId,
    vinculoMembers: changedCong ? [] : state.vinculoMembers,
    certEntries: changedCong ? {} : state.certEntries,
    certTypes: changedCong ? [] : state.certTypes,
    errorMessage: null,
  };
}

/**
 * Phase 1 (Organización -> Conglomerado): Selecting an Organización automatically
 * resolves and preselects its containing `Conglomerado` (`id_grupo_empresarial`).
 */
export function selectWizardOrganizacion(
  state: AuditWizardState,
  organizacionId: string | null | undefined,
  organizaciones: ReadonlyArray<OrganizacionEntity>
): AuditWizardState {
  const cleanOrgId = normalizeOptionalId(organizacionId);
  if (!cleanOrgId) {
    return {
      ...state,
      selectedOrganizacionId: null,
      errorMessage: null,
    };
  }

  const org = organizaciones.find((o) => !o.deleted_at && o.id === cleanOrgId);
  const resolvedCongId =
    normalizeOptionalId(org?.id_grupo_empresarial) ?? state.selectedConglomeradoId;
  const changedCong = resolvedCongId !== state.selectedConglomeradoId;

  return {
    ...state,
    selectedOrganizacionId: cleanOrgId,
    selectedConglomeradoId: resolvedCongId,
    selectedVinculoId: changedCong ? null : state.selectedVinculoId,
    vinculoMembers: changedCong ? [] : state.vinculoMembers,
    certEntries: changedCong ? {} : state.certEntries,
    certTypes: changedCong ? [] : state.certTypes,
    errorMessage: null,
  };
}

/**
 * Phase 2: Resolves all active `Vínculo` boxes associated with the selected
 * `Conglomerado` (checking both direct ownership and member organization certs).
 */
export function resolveEligibleVinculosForConglomerado(
  selectedConglomeradoId: string | null | undefined,
  vinculos: ReadonlyArray<VinculoEntity>,
  certificados: ReadonlyArray<WizardCertRef>,
  organizaciones: ReadonlyArray<OrganizacionEntity>
): VinculoEntity[] {
  const cleanCongId = normalizeOptionalId(selectedConglomeradoId);
  if (!cleanCongId) return [];

  const orgIdsInCong = new Set(
    organizaciones
      .filter((o) => !o.deleted_at && o.id_grupo_empresarial === cleanCongId)
      .map((o) => o.id)
  );
  const certIdsInCong = new Set(
    certificados
      .filter((c) => !c.deleted_at && orgIdsInCong.has(c.id_organizacion))
      .map((c) => c.id)
  );

  return vinculos
    .filter((v) => {
      if (v.deleted_at) return false;
      const activeCerts = v.certificados.filter((c) => !c.deleted_at);
      if (activeCerts.length === 0) return false;
      if (v.id_grupo_empresarial === cleanCongId) return true;
      return activeCerts.some((c) => certIdsInCong.has(c.id_certificado));
    })
    .slice()
    .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es'));
}

export const WIZARD_NO_VINCULO_GUIDANCE_MESSAGE =
  'Este conglomerado aún no tiene un Vínculo configurado (o no posee certificados). Dirígete a Certificación → Vínculo para agrupar sus certificados antes de programar la auditoría.';

export function evaluateWizardAlcanceGate(
  vinculo: VinculoEntity | null | undefined,
  certificados: ReadonlyArray<WizardCertRef>,
  organizaciones: ReadonlyArray<OrganizacionEntity> = [],
  enabledCertIds?: ReadonlySet<string> | ReadonlyArray<string>
): AuditAlcanceGateResult {
  if (!vinculo) {
    return { allowed: true, reason: null, missingCerts: [] };
  }
  const orgAbrevById = new Map<string, string>();
  for (const org of organizaciones) {
    if (!org.deleted_at && org.abreviacion) {
      orgAbrevById.set(org.id, org.abreviacion);
    }
  }
  const enabledSet = enabledCertIds
    ? enabledCertIds instanceof Set
      ? enabledCertIds
      : new Set(enabledCertIds)
    : null;
  const membersToValidate = vinculo.certificados.filter(
    (m) => !m.deleted_at && (!enabledSet || enabledSet.has(m.id_certificado))
  );
  if (membersToValidate.length === 0) {
    return { allowed: true, reason: null, missingCerts: [] };
  }

  const enrichedCerts = certificados.map((c) => ({
    ...c,
    organizacion_abreviacion:
      c.organizacion_abreviacion ?? orgAbrevById.get(c.id_organizacion) ?? null,
  }));
  const enrichedMembers = membersToValidate.map((m) => ({
    ...m,
    organizacion_abreviacion:
      m.organizacion_abreviacion ?? orgAbrevById.get(m.id_organizacion) ?? null,
  }));
  return validateVinculoCertificatesHaveAlcance(enrichedMembers, enrichedCerts);
}

/**
 * Phase 2: Selects a `Vínculo` box, loading ALL active member certificates with
 * `enabled: true` (ON by default) and pre-populating `certEntries` with
 * `baseNaturaleza` (from `resolveCertEffectiveNatureInBox`) and suggested `id_tipo_auditoria`.
 */
export function selectWizardVinculo(
  state: AuditWizardState,
  vinculoId: string | null | undefined,
  vinculos: ReadonlyArray<VinculoEntity>,
  tiposCatalog: ReadonlyArray<TipoAuditoriaCatalogItem>,
  certificados: ReadonlyArray<WizardCertRef> = [],
  organizaciones: ReadonlyArray<OrganizacionEntity> = [],
  conglomerados: ReadonlyArray<ConglomeradoEntity> = []
): AuditWizardState {
  const cleanVinculoId = normalizeOptionalId(vinculoId);
  const vinculo = cleanVinculoId
    ? vinculos.find((v) => !v.deleted_at && v.id === cleanVinculoId)
    : undefined;

  if (!vinculo) {
    return {
      ...state,
      selectedVinculoId: null,
      vinculoMembers: [],
      certEntries: {},
      certTypes: [],
      errorMessage: null,
    };
  }

  const activeTipos = tiposCatalog.filter((t) => !t.deleted_at);
  const defaultTipoId = activeTipos[0]?.id || state.defaultTipoAuditoriaId || '';
  const isSameVinculo = state.selectedVinculoId === vinculo.id;

  const builtMembers = buildWizardMembersForVinculo(
    vinculo,
    certificados,
    organizaciones
  );
  const prevEnabledByCertId = new Map(
    state.vinculoMembers.map((m) => [m.id_certificado, m.enabled])
  );
  const vinculoMembers = isSameVinculo && state.vinculoMembers.length > 0
    ? builtMembers.map((m) => ({
        ...m,
        enabled: prevEnabledByCertId.has(m.id_certificado)
          ? Boolean(prevEnabledByCertId.get(m.id_certificado))
          : true,
      }))
    : builtMembers;

  const prevEntries: Record<string, WizardCertPhase3Entry> = isSameVinculo
    ? state.certEntries
    : {};
  const certEntries = buildInitialCertEntries(
    vinculoMembers,
    defaultTipoId,
    prevEntries
  );
  const certTypes = syncCertTypesFromMembersAndEntries(
    vinculoMembers,
    certEntries,
    defaultTipoId
  );

  const matchedCong =
    conglomerados.find(
      (g) => !g.deleted_at && g.id === (state.selectedConglomeradoId || vinculo.id_grupo_empresarial)
    ) ?? null;
  const firstEntryTipoId = certTypes[0]?.id_tipo_auditoria || defaultTipoId;
  const primaryTipo =
    activeTipos.find((t) => t.id === firstEntryTipoId) ?? activeTipos[0] ?? null;

  const nextEtiqueta =
    state.etiqueta.trim() ||
    suggestWizardEtiqueta({
      vinculo,
      conglomerado: matchedCong,
      dateMode: state.dateMode,
      anio: state.anio,
      mes: state.mes,
      fecha_programada: state.fecha_programada,
      primaryTipo,
    });

  return {
    ...state,
    selectedVinculoId: vinculo.id,
    vinculoMembers,
    etiqueta: nextEtiqueta,
    certEntries,
    certTypes,
    defaultTipoAuditoriaId: defaultTipoId,
    errorMessage: null,
  };
}

/**
 * Phase 2: Toggles a single member certificate's `enabled` state without
 * removing it from `vinculoMembers`, keeping `certEntries` and `certTypes`
 * synchronized with ONLY `enabled === true` certificates.
 */
export function toggleWizardVinculoCert(
  state: AuditWizardState,
  certificadoId: string
): AuditWizardState {
  const cleanCertId = (certificadoId || '').trim();
  const target = state.vinculoMembers.find((m) => m.id_certificado === cleanCertId);
  if (!target) return state;

  const nextEnabled = !target.enabled;
  const vinculoMembers = state.vinculoMembers.map((m) =>
    m.id_certificado === cleanCertId ? { ...m, enabled: nextEnabled } : m
  );

  const nextEntries: Record<string, WizardCertPhase3Entry> = { ...state.certEntries };
  if (nextEnabled) {
    const existingEntry = nextEntries[cleanCertId];
    const fallbackTipo =
      state.defaultTipoAuditoriaId ||
      Object.values(state.certEntries).find((e) => Boolean(e.id_tipo_auditoria))
        ?.id_tipo_auditoria ||
      '';
    nextEntries[cleanCertId] = {
      id_tipo_auditoria: existingEntry?.id_tipo_auditoria || fallbackTipo,
      tipo_vinculacion: existingEntry?.tipo_vinculacion || target.baseNaturaleza,
    };
  } else {
    delete nextEntries[cleanCertId];
  }

  const certTypes = syncCertTypesFromMembersAndEntries(
    vinculoMembers,
    nextEntries,
    state.defaultTipoAuditoriaId
  );

  return {
    ...state,
    vinculoMembers,
    certEntries: nextEntries,
    certTypes,
    errorMessage: null,
  };
}

/**
 * Phase 2: Bulk toggle helper to turn all member certificates ON or OFF
 * without removing rows from `vinculoMembers`.
 */
export function setAllWizardVinculoCerts(
  state: AuditWizardState,
  enabled: boolean
): AuditWizardState {
  if (state.vinculoMembers.length === 0) return state;

  const vinculoMembers = state.vinculoMembers.map((m) => ({
    ...m,
    enabled,
  }));

  const fallbackTipo =
    state.defaultTipoAuditoriaId ||
    Object.values(state.certEntries).find((e) => Boolean(e.id_tipo_auditoria))
      ?.id_tipo_auditoria ||
    '';

  const nextEntries: Record<string, WizardCertPhase3Entry> = enabled
    ? buildInitialCertEntries(vinculoMembers, fallbackTipo, state.certEntries)
    : {};

  const certTypes = syncCertTypesFromMembersAndEntries(
    vinculoMembers,
    nextEntries,
    fallbackTipo
  );

  return {
    ...state,
    vinculoMembers,
    certEntries: nextEntries,
    certTypes,
    errorMessage: null,
  };
}

/**
 * Phase 3 (Col 1: `Relación / Naturaleza`): Updates `tipo_vinculacion` for an
 * individual active certificate in `certEntries` and `certTypes`.
 */
export function setWizardCertRelacion(
  state: AuditWizardState,
  certificadoId: string,
  tipoVinculacion: AuditLinkNature
): AuditWizardState {
  if (!isValidAuditLinkNature(tipoVinculacion)) {
    return {
      ...state,
      errorMessage: 'Seleccione una naturaleza de relación válida.',
    };
  }

  const cleanCertId = (certificadoId || '').trim();
  const member = state.vinculoMembers.find((m) => m.id_certificado === cleanCertId);
  const existingEntry = state.certEntries[cleanCertId];
  if (!existingEntry && !(member && member.enabled)) {
    return state;
  }

  const nextEntries: Record<string, WizardCertPhase3Entry> = {
    ...state.certEntries,
    [cleanCertId]: {
      id_tipo_auditoria:
        existingEntry?.id_tipo_auditoria || state.defaultTipoAuditoriaId || '',
      tipo_vinculacion: tipoVinculacion,
    },
  };

  const certTypes =
    state.vinculoMembers.length > 0
      ? syncCertTypesFromMembersAndEntries(
          state.vinculoMembers,
          nextEntries,
          state.defaultTipoAuditoriaId
        )
      : state.certTypes.map((item) =>
          item.id_certificado === cleanCertId
            ? { ...item, tipo_vinculacion: tipoVinculacion }
            : item
        );

  return {
    ...state,
    certEntries: nextEntries,
    certTypes,
    errorMessage: null,
  };
}

/**
 * Phase 3 (Col 2: `Tipo de Auditoría`): Updates `id_tipo_auditoria` for an
 * individual active certificate in `certEntries` and `certTypes`.
 */
export function setWizardCertTipo(
  state: AuditWizardState,
  certificadoId: string,
  tipoAuditoriaId: string
): AuditWizardState {
  const cleanCertId = (certificadoId || '').trim();
  const member = state.vinculoMembers.find((m) => m.id_certificado === cleanCertId);
  const existingEntry = state.certEntries[cleanCertId];

  const nextEntries: Record<string, WizardCertPhase3Entry> =
    existingEntry || (member && member.enabled)
      ? {
          ...state.certEntries,
          [cleanCertId]: {
            id_tipo_auditoria: tipoAuditoriaId,
            tipo_vinculacion:
              existingEntry?.tipo_vinculacion ||
              member?.baseNaturaleza ||
              'Individual',
          },
        }
      : { ...state.certEntries };

  const certTypes =
    state.vinculoMembers.length > 0
      ? syncCertTypesFromMembersAndEntries(
          state.vinculoMembers,
          nextEntries,
          state.defaultTipoAuditoriaId
        )
      : state.certTypes.map((item) =>
          item.id_certificado === cleanCertId
            ? { ...item, id_tipo_auditoria: tipoAuditoriaId }
            : item
        );

  return {
    ...state,
    certEntries: nextEntries,
    certTypes,
    errorMessage: null,
  };
}

/**
 * Phase 3 quick bulk action: Applies the same `Relación / Naturaleza` to all
 * currently enabled certificates.
 */
export function applySameRelacionToAllWizardCerts(
  state: AuditWizardState,
  tipoVinculacion: AuditLinkNature
): AuditWizardState {
  if (!isValidAuditLinkNature(tipoVinculacion)) {
    return {
      ...state,
      errorMessage: 'Seleccione una naturaleza de relación válida.',
    };
  }

  const nextEntries: Record<string, WizardCertPhase3Entry> = {};
  if (state.vinculoMembers.length > 0) {
    for (const member of state.vinculoMembers) {
      if (!member.enabled) continue;
      const prev = state.certEntries[member.id_certificado];
      nextEntries[member.id_certificado] = {
        id_tipo_auditoria: prev?.id_tipo_auditoria || state.defaultTipoAuditoriaId || '',
        tipo_vinculacion: tipoVinculacion,
      };
    }
  } else {
    for (const [certId, entry] of Object.entries(state.certEntries)) {
      nextEntries[certId] = { ...entry, tipo_vinculacion: tipoVinculacion };
    }
  }

  const certTypes =
    state.vinculoMembers.length > 0
      ? syncCertTypesFromMembersAndEntries(
          state.vinculoMembers,
          nextEntries,
          state.defaultTipoAuditoriaId
        )
      : state.certTypes.map((item) => ({ ...item, tipo_vinculacion: tipoVinculacion }));

  return {
    ...state,
    certEntries: nextEntries,
    certTypes,
    errorMessage: null,
  };
}

/**
 * Phase 3 quick bulk action: Applies the same `Tipo de Auditoría` to all
 * currently enabled certificates.
 */
export function applySameTipoToAllWizardCerts(
  state: AuditWizardState,
  tipoAuditoriaId: string
): AuditWizardState {
  if (!tipoAuditoriaId) return state;

  const nextEntries: Record<string, WizardCertPhase3Entry> = {};
  if (state.vinculoMembers.length > 0) {
    for (const member of state.vinculoMembers) {
      if (!member.enabled) continue;
      const prev = state.certEntries[member.id_certificado];
      nextEntries[member.id_certificado] = {
        id_tipo_auditoria: tipoAuditoriaId,
        tipo_vinculacion: prev?.tipo_vinculacion || member.baseNaturaleza,
      };
    }
  } else {
    for (const [certId, entry] of Object.entries(state.certEntries)) {
      nextEntries[certId] = { ...entry, id_tipo_auditoria: tipoAuditoriaId };
    }
  }

  const certTypes =
    state.vinculoMembers.length > 0
      ? syncCertTypesFromMembersAndEntries(
          state.vinculoMembers,
          nextEntries,
          tipoAuditoriaId
        )
      : state.certTypes.map((item) => ({ ...item, id_tipo_auditoria: tipoAuditoriaId }));

  return {
    ...state,
    defaultTipoAuditoriaId: tipoAuditoriaId,
    certEntries: nextEntries,
    certTypes,
    errorMessage: null,
  };
}

function resolveEnabledMemberOptions(
  state: AuditWizardState,
  selectedVinculo: VinculoEntity | undefined,
  certificados: ReadonlyArray<WizardCertRef>,
  organizaciones: ReadonlyArray<OrganizacionEntity>
): WizardVinculoCertOption[] {
  if (state.vinculoMembers.length > 0) {
    return state.vinculoMembers.filter((m) => m.enabled);
  }
  if (!selectedVinculo) return [];
  const allMembers = buildWizardMembersForVinculo(
    selectedVinculo,
    certificados,
    organizaciones
  );
  if (state.certTypes.length > 0) {
    const enabledSet = new Set(state.certTypes.map((c) => c.id_certificado));
    return allMembers.filter((m) => enabledSet.has(m.id_certificado));
  }
  return allMembers;
}

function checkEnabledMembersAlcance(
  enabledMembers: ReadonlyArray<WizardVinculoCertOption>,
  selectedVinculo: VinculoEntity | undefined,
  certificados: ReadonlyArray<WizardCertRef>,
  organizaciones: ReadonlyArray<OrganizacionEntity>
): AuditAlcanceGateResult {
  if (enabledMembers.length === 0) {
    return { allowed: true, reason: null, missingCerts: [] };
  }

  if (selectedVinculo && certificados.length > 0) {
    const enabledSet = new Set(enabledMembers.map((m) => m.id_certificado));
    return evaluateWizardAlcanceGate(
      selectedVinculo,
      certificados,
      organizaciones,
      enabledSet
    );
  }

  const missingFromState = enabledMembers.filter((m) => !m.hasActiveAlcance);
  if (missingFromState.length > 0) {
    const labels = missingFromState.map((m) =>
      m.organizacion_abreviacion
        ? `${m.numero_certificado} (${m.organizacion_abreviacion})`
        : m.numero_certificado
    );
    const reason =
      labels.length === 1
        ? `El certificado ${labels[0]} no posee un Alcance activo registrado. Registre o comparta un Alcance en español en Certificación → Certificado antes de generar auditorías.`
        : `Los certificados ${labels.join(', ')} no poseen un Alcance activo registrado. Registre o comparta un Alcance en español en Certificación → Certificado antes de generar auditorías.`;
    return {
      allowed: false,
      reason,
      missingCerts: missingFromState.map((m) => ({
        id_certificado: m.id_certificado,
        numero_certificado: m.numero_certificado,
        abreviacion: m.organizacion_abreviacion,
      })),
    };
  }

  return { allowed: true, reason: null, missingCerts: [] };
}

export function canAdvanceWizardStep(
  state: AuditWizardState,
  deps: {
    conglomerados: ReadonlyArray<ConglomeradoEntity>;
    organizaciones: ReadonlyArray<OrganizacionEntity>;
    vinculos: ReadonlyArray<VinculoEntity>;
    certificados: ReadonlyArray<WizardCertRef>;
  }
): { allowed: boolean; reason: string | null } {
  if (state.step === 1) {
    const matchedOrg = state.selectedOrganizacionId
      ? deps.organizaciones.find(
          (o) => !o.deleted_at && o.id === state.selectedOrganizacionId
        )
      : undefined;
    const effectiveCongId =
      state.selectedConglomeradoId ||
      normalizeOptionalId(matchedOrg?.id_grupo_empresarial);
    const hasCong =
      Boolean(effectiveCongId) &&
      deps.conglomerados.some(
        (g) => !g.deleted_at && g.id === effectiveCongId
      );
    if (!hasCong && !matchedOrg) {
      return {
        allowed: false,
        reason: 'Seleccione un Conglomerado o una Organización válida para continuar.',
      };
    }
    return { allowed: true, reason: null };
  }

  if (state.step === 2) {
    const eligible = resolveEligibleVinculosForConglomerado(
      state.selectedConglomeradoId,
      deps.vinculos,
      deps.certificados,
      deps.organizaciones
    );
    if (eligible.length === 0) {
      return {
        allowed: false,
        reason: WIZARD_NO_VINCULO_GUIDANCE_MESSAGE,
      };
    }
    const selectedVinculo = eligible.find((v) => v.id === state.selectedVinculoId);
    if (!state.selectedVinculoId || !selectedVinculo) {
      return {
        allowed: false,
        reason: 'Seleccione un Vínculo activo para elegir los certificados a auditar.',
      };
    }

    const enabledMembers = resolveEnabledMemberOptions(
      state,
      selectedVinculo,
      deps.certificados,
      deps.organizaciones
    );
    if (enabledMembers.length === 0) {
      return {
        allowed: false,
        reason: 'Active al menos un certificado del vínculo para continuar a la Fase 3.',
      };
    }

    const alcanceCheck = checkEnabledMembersAlcance(
      enabledMembers,
      selectedVinculo,
      deps.certificados,
      deps.organizaciones
    );
    if (!alcanceCheck.allowed) {
      return {
        allowed: false,
        reason: alcanceCheck.reason,
      };
    }
    return { allowed: true, reason: null };
  }

  if (state.step === 3) {
    const selectedVinculo = deps.vinculos.find(
      (v) => !v.deleted_at && v.id === state.selectedVinculoId
    );
    if (!state.selectedVinculoId || !selectedVinculo) {
      return {
        allowed: false,
        reason: 'Seleccione un Vínculo activo para programar la auditoría.',
      };
    }

    const enabledMembers = resolveEnabledMemberOptions(
      state,
      selectedVinculo,
      deps.certificados,
      deps.organizaciones
    );
    if (enabledMembers.length === 0) {
      return {
        allowed: false,
        reason: 'Active al menos un certificado del vínculo para crear la auditoría.',
      };
    }

    const alcanceCheck = checkEnabledMembersAlcance(
      enabledMembers,
      selectedVinculo,
      deps.certificados,
      deps.organizaciones
    );
    if (!alcanceCheck.allowed) {
      return {
        allowed: false,
        reason: alcanceCheck.reason,
      };
    }

    if (state.dateMode === 'PREPROGRAMADA_MES') {
      if (state.anio < 2020 || state.anio > 2100 || state.mes < 1 || state.mes > 12) {
        return {
          allowed: false,
          reason: 'Indique un mes (1–12) y año válido para la preprogramación.',
        };
      }
    } else if (state.dateMode === 'PROGRAMADA_EXACTA') {
      const cleanDate = state.fecha_programada.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
        return {
          allowed: false,
          reason: 'Indique una fecha objetivo programada exacta válida (YYYY-MM-DD).',
        };
      }
    } else {
      return {
        allowed: false,
        reason: 'Seleccione un modo de fecha programada válido.',
      };
    }

    for (const member of enabledMembers) {
      const entry = state.certEntries[member.id_certificado];
      const fallbackCertType = state.certTypes.find(
        (c) => c.id_certificado === member.id_certificado
      );
      const tipoId = entry?.id_tipo_auditoria ?? fallbackCertType?.id_tipo_auditoria ?? '';
      const naturaleza =
        entry?.tipo_vinculacion ?? fallbackCertType?.tipo_vinculacion ?? member.baseNaturaleza;

      if (!isValidUuid(tipoId)) {
        return {
          allowed: false,
          reason: `Seleccione el tipo de auditoría para el certificado ${member.numero_certificado}.`,
        };
      }
      if (!isValidAuditLinkNature(naturaleza)) {
        return {
          allowed: false,
          reason: `Seleccione una relación / naturaleza válida para el certificado ${member.numero_certificado}.`,
        };
      }
    }

    return { allowed: true, reason: null };
  }

  return { allowed: true, reason: null };
}

export function advanceWizardStep(
  state: AuditWizardState,
  deps: {
    conglomerados: ReadonlyArray<ConglomeradoEntity>;
    organizaciones: ReadonlyArray<OrganizacionEntity>;
    vinculos: ReadonlyArray<VinculoEntity>;
    certificados: ReadonlyArray<WizardCertRef>;
    tiposCatalog: ReadonlyArray<TipoAuditoriaCatalogItem>;
  }
): AuditWizardState {
  const check = canAdvanceWizardStep(state, deps);
  if (!check.allowed) {
    return {
      ...state,
      errorMessage: check.reason,
    };
  }

  if (state.step === 1) {
    const matchedOrg = state.selectedOrganizacionId
      ? deps.organizaciones.find(
          (o) => !o.deleted_at && o.id === state.selectedOrganizacionId
        )
      : undefined;
    const effectiveCongId =
      state.selectedConglomeradoId ||
      normalizeOptionalId(matchedOrg?.id_grupo_empresarial);
    const syncedState =
      effectiveCongId !== state.selectedConglomeradoId
        ? { ...state, selectedConglomeradoId: effectiveCongId }
        : state;

    const eligible = resolveEligibleVinculosForConglomerado(
      syncedState.selectedConglomeradoId,
      deps.vinculos,
      deps.certificados,
      deps.organizaciones
    );

    if (eligible.length === 1) {
      const updated = selectWizardVinculo(
        { ...syncedState, step: 2, errorMessage: null },
        eligible[0].id,
        deps.vinculos,
        deps.tiposCatalog,
        deps.certificados,
        deps.organizaciones,
        deps.conglomerados
      );
      return updated;
    }

    const currentStillEligible =
      syncedState.selectedVinculoId !== null &&
      eligible.some((v) => v.id === syncedState.selectedVinculoId);
    return {
      ...syncedState,
      step: 2,
      selectedVinculoId: currentStillEligible ? syncedState.selectedVinculoId : null,
      vinculoMembers: currentStillEligible ? syncedState.vinculoMembers : [],
      certEntries: currentStillEligible ? syncedState.certEntries : {},
      certTypes: currentStillEligible ? syncedState.certTypes : [],
      errorMessage: null,
    };
  }

  if (state.step === 2) {
    const activeTipos = deps.tiposCatalog.filter((t) => !t.deleted_at);
    const defaultTipoId =
      activeTipos[0]?.id || state.defaultTipoAuditoriaId || '';

    if (state.vinculoMembers.length > 0 && state.selectedVinculoId) {
      const selectedVinculo = deps.vinculos.find(
        (v) => !v.deleted_at && v.id === state.selectedVinculoId
      );
      const certMetaById = new Map(deps.certificados.map((c) => [c.id, c]));
      const vinculoMemberById = new Map(
        (selectedVinculo?.certificados ?? [])
          .filter((c) => !c.deleted_at)
          .map((c) => [c.id_certificado, c])
      );
      const refreshedMembers = state.vinculoMembers.map((member) => {
        const vc = vinculoMemberById.get(member.id_certificado);
        const certMeta = certMetaById.get(member.id_certificado);
        return {
          ...member,
          hasActiveAlcance: vc
            ? resolveMemberHasActiveAlcance(vc, certMeta)
            : member.hasActiveAlcance,
        };
      });

      const nextEntries: Record<string, WizardCertPhase3Entry> = {};
      for (const member of refreshedMembers) {
        if (!member.enabled) continue;
        const prev = state.certEntries[member.id_certificado];
        nextEntries[member.id_certificado] = {
          id_tipo_auditoria: prev?.id_tipo_auditoria || defaultTipoId,
          tipo_vinculacion: prev?.tipo_vinculacion || member.baseNaturaleza,
        };
      }
      const certTypes = syncCertTypesFromMembersAndEntries(
        refreshedMembers,
        nextEntries,
        defaultTipoId
      );
      const matchedCong =
        deps.conglomerados.find(
          (g) =>
            !g.deleted_at &&
            g.id ===
              (state.selectedConglomeradoId || selectedVinculo?.id_grupo_empresarial)
        ) ?? null;
      const primaryTipo =
        activeTipos.find((t) => t.id === (certTypes[0]?.id_tipo_auditoria || defaultTipoId)) ??
        activeTipos[0] ??
        null;
      const nextEtiqueta =
        state.etiqueta.trim() ||
        suggestWizardEtiqueta({
          vinculo: selectedVinculo,
          conglomerado: matchedCong,
          dateMode: state.dateMode,
          anio: state.anio,
          mes: state.mes,
          fecha_programada: state.fecha_programada,
          primaryTipo,
        });

      return {
        ...state,
        step: 3,
        vinculoMembers: refreshedMembers,
        etiqueta: nextEtiqueta,
        certEntries: nextEntries,
        certTypes,
        defaultTipoAuditoriaId: defaultTipoId,
        errorMessage: null,
      };
    }

    const withVinculo = selectWizardVinculo(
      state,
      state.selectedVinculoId,
      deps.vinculos,
      deps.tiposCatalog,
      deps.certificados,
      deps.organizaciones,
      deps.conglomerados
    );
    return {
      ...withVinculo,
      step: 3,
      errorMessage: null,
    };
  }

  return state;
}

export function goBackWizardStep(state: AuditWizardState): AuditWizardState {
  if (state.step === 3) {
    return { ...state, step: 2, errorMessage: null };
  }
  if (state.step === 2) {
    return { ...state, step: 1, errorMessage: null };
  }
  return state;
}

function mergeAuditYearSources(
  existingAudits?: ReadonlyArray<AuditYearSourceInput>,
  existingPrograms?: ReadonlyArray<LinkedProgramYearSourceInput>
): AuditYearSourceInput[] {
  const merged: AuditYearSourceInput[] = [];
  const seenIds = new Set<string>();

  const pushAudit = (audit: AuditYearSourceInput): void => {
    if (audit.deleted_at) return;
    const idKey = typeof audit.id === 'string' ? audit.id.trim() : '';
    if (idKey) {
      if (seenIds.has(idKey)) return;
      seenIds.add(idKey);
    }
    merged.push(audit);
  };

  for (const audit of existingAudits ?? []) {
    pushAudit(audit);
  }
  for (const prog of existingPrograms ?? []) {
    if (prog.deleted_at) continue;
    for (const audit of prog.auditorias ?? []) {
      pushAudit(audit);
    }
  }

  return merged;
}

export interface WizardCertCodenamePreview {
  id_certificado: string;
  numero_certificado: string;
  codigo_auditoria: string;
}

export interface WizardCodenamePreviewsResult {
  targetYear: number;
  compactCodename: string;
  linkedCodename: string;
  perCertCodenames: WizardCertCodenamePreview[];
  auditCodeByCertId: Record<string, string>;
}

/**
 * Computes deterministic `L-AUD-AAAA-BBBB-YYYY` (linked whole audit) and per-certificate
 * `AUD-AAAA-BBBB-YYYY` previews along with compact display codename (`YYYY-MM ShortTipo`)
 * for Phase 3 of `+ Auditoría`.
 */
export function computeWizardCodenamePreviews(
  state: AuditWizardState,
  options?: {
    tiposCatalog?: ReadonlyArray<TipoAuditoriaCatalogItem>;
    existingPrograms?: ReadonlyArray<LinkedProgramYearSourceInput>;
    existingAudits?: ReadonlyArray<AuditYearSourceInput>;
  }
): WizardCodenamePreviewsResult {
  const activeTipos = (options?.tiposCatalog ?? []).filter((t) => !t.deleted_at);
  const activeMembers =
    state.vinculoMembers.length > 0
      ? state.vinculoMembers
          .filter((m) => m.enabled)
          .map((m) => ({
            id_certificado: m.id_certificado,
            numero_certificado: m.numero_certificado,
            id_tipo_auditoria:
              state.certEntries[m.id_certificado]?.id_tipo_auditoria ??
              state.defaultTipoAuditoriaId,
          }))
      : state.certTypes.map((c) => ({
          id_certificado: c.id_certificado,
          numero_certificado: c.numero_certificado,
          id_tipo_auditoria:
            state.certEntries[c.id_certificado]?.id_tipo_auditoria ?? c.id_tipo_auditoria,
        }));

  const firstTipoId =
    activeMembers[0]?.id_tipo_auditoria || state.defaultTipoAuditoriaId || '';
  const primaryTipo =
    activeTipos.find((t) => t.id === firstTipoId) ?? activeTipos[0] ?? null;

  const cleanDate = state.fecha_programada.trim();
  const hasExactDate =
    state.dateMode === 'PROGRAMADA_EXACTA' && /^\d{4}-\d{2}-\d{2}$/.test(cleanDate);

  const targetYear = resolveCampaignTargetYear({
    dateMode: state.dateMode,
    anio: state.anio,
    fechaInicio: hasExactDate ? cleanDate : null,
  });

  const compactCodename = formatAuditCodename({
    fechas: [
      hasExactDate
        ? {
            id: 'wizard-preview-date',
            id_auditoria: 'wizard-preview',
            numero_secuencia: 1,
            tag: 'Programación',
            tipo_fecha: 'PROGRAMADA_EXACTA',
            anio: null,
            mes: null,
            fecha_inicio: cleanDate,
            fecha_fin: cleanDate,
          }
        : {
            id: 'wizard-preview-date',
            id_auditoria: 'wizard-preview',
            numero_secuencia: 1,
            tag: 'Programación',
            tipo_fecha: 'PREPROGRAMADA_MES',
            anio: state.anio,
            mes: state.mes,
            fecha_inicio: null,
            fecha_fin: null,
          },
    ],
    tipo_auditoria: primaryTipo?.tipo ?? 'Auditoría',
    tipo_abreviacion: primaryTipo?.abreviacion ?? null,
  });

  const existingPrograms = options?.existingPrograms ?? [];
  const mergedExistingAudits = mergeAuditYearSources(
    options?.existingAudits,
    existingPrograms
  );

  const linkedCodename =
    state.codigo_programa.trim() ||
    generateNextLinkedAuditCodename({
      existingPrograms,
      targetYear,
    });

  const batchCodes = generateNextIndividualAuditCodenamesBatch({
    existingAudits: mergedExistingAudits,
    targetYear,
    count: activeMembers.length,
  });

  const perCertCodenames: WizardCertCodenamePreview[] = [];
  const auditCodeByCertId: Record<string, string> = {};
  activeMembers.forEach((member, idx) => {
    const code = batchCodes[idx] || '';
    perCertCodenames.push({
      id_certificado: member.id_certificado,
      numero_certificado: member.numero_certificado,
      codigo_auditoria: code,
    });
    if (member.id_certificado && code) {
      auditCodeByCertId[member.id_certificado] = code;
    }
  });

  return {
    targetYear,
    compactCodename,
    linkedCodename,
    perCertCodenames,
    auditCodeByCertId,
  };
}

export function buildStep3NewCycleDraftFromWizard(
  state: AuditWizardState,
  vinculos: ReadonlyArray<VinculoEntity>,
  certificados?: ReadonlyArray<WizardCertRef>,
  options?: {
    conglomerados?: ReadonlyArray<ConglomeradoEntity>;
    tiposCatalog?: ReadonlyArray<TipoAuditoriaCatalogItem>;
    existingPrograms?: ReadonlyArray<LinkedProgramYearSourceInput>;
    existingAudits?: ReadonlyArray<AuditYearSourceInput>;
  }
): { ok: true; draft: Step3NewCycleDraft } | { ok: false; error: string } {
  const vinculoId = state.selectedVinculoId || '';
  const selectedVinculo = vinculos.find((v) => !v.deleted_at && v.id === vinculoId);

  const certOrgById = new Map<string, string>();
  for (const c of certificados ?? []) {
    if (c.id && c.id_organizacion) certOrgById.set(c.id, c.id_organizacion);
  }
  for (const vc of selectedVinculo?.certificados ?? []) {
    if (!vc.deleted_at && vc.id_certificado && vc.id_organizacion) {
      certOrgById.set(vc.id_certificado, vc.id_organizacion);
    }
  }
  for (const m of state.vinculoMembers) {
    if (m.id_certificado && m.id_organizacion) {
      certOrgById.set(m.id_certificado, m.id_organizacion);
    }
  }

  let activeCertTypes: Step3NewCycleCertTypeDraft[];
  if (state.vinculoMembers.length > 0) {
    activeCertTypes = syncCertTypesFromMembersAndEntries(
      state.vinculoMembers,
      state.certEntries,
      state.defaultTipoAuditoriaId
    );
  } else {
    activeCertTypes = state.certTypes.map((c) => {
      const entry = state.certEntries[c.id_certificado];
      return {
        ...c,
        id_tipo_auditoria: entry?.id_tipo_auditoria ?? c.id_tipo_auditoria,
        tipo_vinculacion:
          entry?.tipo_vinculacion ??
          c.tipo_vinculacion ??
          selectedVinculo?.tipo_vinculacion ??
          'Individual',
      };
    });
  }

  if (activeCertTypes.length === 0) {
    return {
      ok: false,
      error: 'Active al menos un certificado del vínculo para programar la auditoría.',
    };
  }

  const derivedLevel: AuditLinkLevel = deriveProgramLinkLevelFromCertSubset(
    activeCertTypes.map((c) => ({
      id_organizacion: certOrgById.get(c.id_certificado) ?? null,
    }))
  );
  const derivedNature: AuditLinkNature = deriveProgramLinkNatureFromCertSubset(
    activeCertTypes.map((c) => c.tipo_vinculacion)
  );

  const matchedCong =
    options?.conglomerados?.find(
      (g) =>
        !g.deleted_at &&
        g.id ===
          (state.selectedConglomeradoId || selectedVinculo?.id_grupo_empresarial)
    ) ?? null;
  const firstTipoId = activeCertTypes[0]?.id_tipo_auditoria;
  const primaryTipo =
    options?.tiposCatalog?.find((t) => !t.deleted_at && t.id === firstTipoId) ?? null;

  const resolvedEtiqueta =
    state.etiqueta.trim() ||
    suggestWizardEtiqueta({
      vinculo: selectedVinculo,
      conglomerado: matchedCong,
      dateMode: state.dateMode,
      anio: state.anio,
      mes: state.mes,
      fecha_programada: state.fecha_programada,
      primaryTipo,
    });

  const goalDate = state.fecha_programada.trim();
  const targetYear = resolveCampaignTargetYear({
    dateMode: state.dateMode,
    anio: state.anio,
    fechaInicio: state.dateMode === 'PROGRAMADA_EXACTA' ? goalDate : null,
  });
  const existingPrograms = options?.existingPrograms ?? [];
  const mergedExistingAudits = mergeAuditYearSources(
    options?.existingAudits,
    existingPrograms
  );
  const resolvedCodigoPrograma =
    state.codigo_programa.trim() ||
    generateNextLinkedAuditCodename({
      existingPrograms,
      targetYear,
    });
  const individualBatchCodes = generateNextIndividualAuditCodenamesBatch({
    existingAudits: mergedExistingAudits,
    targetYear,
    count: activeCertTypes.length,
  });
  const enrichedCertTypes: Step3NewCycleCertTypeDraft[] = activeCertTypes.map((c, idx) => ({
    ...c,
    codigo_auditoria: c.codigo_auditoria?.trim() || individualBatchCodes[idx],
  }));

  const draft: Step3NewCycleDraft = {
    id_vinculo: vinculoId,
    codigo_programa: resolvedCodigoPrograma,
    etiqueta: resolvedEtiqueta,
    dateMode: state.dateMode,
    anio: state.anio,
    mes: state.mes,
    fecha_inicio: goalDate,
    fecha_fin: goalDate,
    fecha_programada: goalDate,
    observacion:
      state.observacion.trim() || 'Auditoría programada desde asistente + Auditoría.',
    certTypes: enrichedCertTypes,
    enabledCertCount: enrichedCertTypes.length,
    nivel_vinculacion: derivedLevel,
    tipo_vinculacion: derivedNature,
  };

  const err = validateStep3NewCycleDraft(draft, vinculos, certificados);
  if (err) {
    return { ok: false, error: err };
  }
  return { ok: true, draft };
}

// =============================================================================
// Dynamic Post-Creation Redirection Decision Tree (`+ Auditoría`)
// =============================================================================

export type PostWizardRedirectTargetSubview =
  | 'designacion/sitio'
  | 'designacion/temporal'
  | 'tiempo';

export type PostWizardRedirectReason =
  | 'MULTI_SITE_CERTIFICATES'
  | 'SINGLE_SITE_WITH_TEMPORAL'
  | 'SINGLE_SITE_NO_TEMPORAL';

export interface PostWizardRedirectDecision {
  targetSubview: PostWizardRedirectTargetSubview;
  selectedCertId: string | null;
  selectedAuditId: string | null;
  selectedProgramId: string | null;
  multiSiteCertIds: string[];
  hasTemporalSite: boolean;
  reason: PostWizardRedirectReason;
}

/**
 * Evaluates whether a created audit's certificate (or pinned version snapshot)
 * has multiple active sites beyond the main site (`Sitio 0`).
 */
export function doesAuditCertRequireSiteSelection(
  audit: Pick<
    ProgramacionAuditEntity,
    | 'id_certificado'
    | 'id_certificado_version'
    | 'version_numero'
    | 'organizacion_nombre'
    | 'organizacion_abreviacion'
  >,
  certificados: ReadonlyArray<CertificadoDetailEntity>
): boolean {
  const activeCerts = certificados.filter(
    (c) => !(c as { deleted_at?: string | null }).deleted_at
  );
  const snapshot = resolveCertVersionSnapshotForAudit(audit, activeCerts);
  const activeSnapshotSites = snapshot.sitios.filter(
    (s) => !(s as { deleted_at?: string | null }).deleted_at
  );
  if (activeSnapshotSites.length > 0) {
    return (
      activeSnapshotSites.length > 1 ||
      activeSnapshotSites.some((s) => Number(s.numero_sitio) !== 0)
    );
  }

  const matchedCert = activeCerts.find((c) => c.id === audit.id_certificado) ?? null;
  if (!matchedCert) return false;
  const activeCertSites = (matchedCert.sitios ?? []).filter(
    (s) => !(s as { deleted_at?: string | null }).deleted_at
  );
  if (activeCertSites.length > 0) {
    return (
      activeCertSites.length > 1 ||
      activeCertSites.some((s) => Number(s.numero_sitio) !== 0)
    );
  }
  return Boolean(matchedCert.multisitio);
}

/**
 * Pure post-creation redirect decision function for `+ Auditoría`:
 * Skips `1. Relación` and `2. Designación > Tipo` by default, following strict priority:
 * 1. If 1+ created certificates have multiple sites beyond main site (`Sitio 0`), redirect to
 *    `'designacion/sitio'` positioned directly on the first multi-site certificate & audit.
 * 2. Else if `tiene_sitio_temporal === true`, redirect to `'designacion/temporal'` in the
 *    linked audit's detail view.
 * 3. Else redirect to `'tiempo'` in the detail view of the first certificate.
 */
export function resolvePostWizardCreateRedirect(params: {
  createdAudits: ReadonlyArray<ProgramacionAuditEntity>;
  certificados: ReadonlyArray<CertificadoDetailEntity>;
  vinculo?: Pick<VinculoEntity, 'tiene_sitio_temporal'> | null;
  programId?: string | null;
  tieneSitioTemporal?: boolean | null;
}): PostWizardRedirectDecision {
  const { createdAudits, certificados, vinculo, programId = null, tieneSitioTemporal } = params;
  const firstAudit = createdAudits[0] ?? null;
  const resolvedProgramId =
    programId || firstAudit?.id_programa_auditoria || null;

  const hasTemporalSite = Boolean(
    tieneSitioTemporal ??
      vinculo?.tiene_sitio_temporal ??
      createdAudits.some((a) => Boolean(a.tiene_sitio_temporal))
  );

  const multiSiteAudits = createdAudits.filter((aud) =>
    doesAuditCertRequireSiteSelection(aud, certificados)
  );

  if (multiSiteAudits.length > 0) {
    const targetAudit = multiSiteAudits[0];
    return {
      targetSubview: 'designacion/sitio',
      selectedCertId: targetAudit.id_certificado || null,
      selectedAuditId: targetAudit.id || null,
      selectedProgramId: resolvedProgramId,
      multiSiteCertIds: multiSiteAudits.map((a) => a.id_certificado),
      hasTemporalSite,
      reason: 'MULTI_SITE_CERTIFICATES',
    };
  }

  if (hasTemporalSite) {
    return {
      targetSubview: 'designacion/temporal',
      selectedCertId: firstAudit?.id_certificado ?? null,
      selectedAuditId: firstAudit?.id ?? null,
      selectedProgramId: resolvedProgramId,
      multiSiteCertIds: [],
      hasTemporalSite: true,
      reason: 'SINGLE_SITE_WITH_TEMPORAL',
    };
  }

  return {
    targetSubview: 'tiempo',
    selectedCertId: firstAudit?.id_certificado ?? null,
    selectedAuditId: firstAudit?.id ?? null,
    selectedProgramId: resolvedProgramId,
    multiSiteCertIds: [],
    hasTemporalSite: false,
    reason: 'SINGLE_SITE_NO_TEMPORAL',
  };
}

