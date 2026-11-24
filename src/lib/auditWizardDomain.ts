/**
 * Step 2.1 — Wizard `+ Auditoría` (3 Fases) Pure Domain Logic
 *
 * Implements strictly typed bidirectional Conglomerado <-> Organización
 * selection, Vínculo resolution (auto-select when 1, multi-choice when >1,
 * guided blockage when 0), and batch audit creation payload construction.
 * Zero-UUID compliant on all labels and validation errors.
 */

import type { OrganizacionEntity } from './activeCertificates';
import type { ConglomeradoEntity } from './conglomeradoDomain';
import {
  validateStep3NewCycleDraft,
  type Step3NewCycleCertTypeDraft,
  type Step3NewCycleDraft,
} from './designacionTipoDomain';
import type { TipoAuditoriaCatalogItem } from './extraDomain';
import type { VinculoEntity } from './vinculoDomain';
import {
  validateVinculoCertificatesHaveAlcance,
  type AlcanceCertificadoEntity,
} from './alcanceDomain';

export interface WizardCertRef {
  id: string;
  id_organizacion: string;
  numero_certificado?: string;
  organizacion_abreviacion?: string | null;
  version_actual_numero?: number | null;
  deleted_at?: string | null;
  alcanceDetalle?: AlcanceCertificadoEntity | null;
  hasAlcance?: boolean;
}

function buildCertTypesDraftForVinculo(
  vinculo: VinculoEntity,
  defaultTipoId: string,
  prevSelections: Map<string, string>,
  certificados: ReadonlyArray<WizardCertRef> = [],
  organizaciones: ReadonlyArray<OrganizacionEntity> = []
): Step3NewCycleCertTypeDraft[] {
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
        typeof certMeta?.version_actual_numero === 'number' && certMeta.version_actual_numero >= 1
          ? Math.floor(certMeta.version_actual_numero)
          : null;
      return {
        id_certificado: c.id_certificado,
        numero_certificado: c.numero_certificado,
        organizacion_nombre: c.organizacion_nombre,
        organizacion_abreviacion: abrev,
        version_numero: versionNum,
        norma_codigo: c.norma_codigo,
        id_tipo_auditoria: prevSelections.get(c.id_certificado) || defaultTipoId,
      };
    });
}

export type AuditWizardStep = 1 | 2 | 3;

export interface AuditWizardState {
  isOpen: boolean;
  step: AuditWizardStep;
  selectedConglomeradoId: string;
  selectedOrganizacionId: string;
  selectedVinculoId: string;
  codigo_programa: string;
  etiqueta: string;
  dateMode: 'PREPROGRAMADA_MES' | 'PROGRAMADA_EXACTA';
  anio: number;
  mes: number;
  fecha_programada: string;
  observacion: string;
  certTypes: Step3NewCycleCertTypeDraft[];
  isSubmitting: boolean;
  errorMessage: string | null;
}

export function createInitialAuditWizardState(opts?: {
  referenceDate?: Date;
  prefillConglomeradoId?: string;
  prefillOrganizacionId?: string;
  prefillVinculoId?: string;
  prefillStep?: AuditWizardStep;
  organizaciones?: ReadonlyArray<OrganizacionEntity>;
  vinculos?: ReadonlyArray<VinculoEntity>;
  certificados?: ReadonlyArray<WizardCertRef>;
  tiposCatalog?: ReadonlyArray<TipoAuditoriaCatalogItem>;
}): AuditWizardState {
  const ref = opts?.referenceDate ?? new Date();
  const todayIso = ref.toISOString().slice(0, 10);
  const anio = ref.getUTCFullYear();
  const mes = ref.getUTCMonth() + 1;

  let selectedConglomeradoId = (opts?.prefillConglomeradoId || '').trim();
  const selectedOrganizacionId = (opts?.prefillOrganizacionId || '').trim();
  const prefillVinculoId = (opts?.prefillVinculoId || '').trim();
  if (!selectedConglomeradoId && selectedOrganizacionId && opts?.organizaciones) {
    const matchedOrg = opts.organizaciones.find(
      (o) => !o.deleted_at && o.id === selectedOrganizacionId
    );
    selectedConglomeradoId = matchedOrg?.id_grupo_empresarial || '';
  }

  const baseState: AuditWizardState = {
    isOpen: true,
    step: 1,
    selectedConglomeradoId,
    selectedOrganizacionId,
    selectedVinculoId: '',
    codigo_programa: '',
    etiqueta: '',
    dateMode: 'PREPROGRAMADA_MES',
    anio,
    mes,
    fecha_programada: todayIso,
    observacion: '',
    certTypes: [],
    isSubmitting: false,
    errorMessage: null,
  };

  if (prefillVinculoId && opts?.vinculos) {
    const matchedVinculo = opts.vinculos.find(
      (v) => !v.deleted_at && v.id === prefillVinculoId
    );
    if (matchedVinculo) {
      const resolvedCongId =
        selectedConglomeradoId || matchedVinculo.id_grupo_empresarial || '';
      const enriched = selectWizardVinculo(
        { ...baseState, selectedConglomeradoId: resolvedCongId },
        matchedVinculo.id,
        opts.vinculos,
        opts.tiposCatalog ?? [],
        opts.certificados ?? [],
        opts.organizaciones ?? []
      );
      const gate = evaluateWizardAlcanceGate(
        matchedVinculo,
        opts.certificados ?? [],
        opts.organizaciones ?? []
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
  selectedConglomeradoId: string,
  organizaciones: ReadonlyArray<OrganizacionEntity>
): OrganizacionEntity[] {
  const activeOrgs = organizaciones
    .filter((o) => !o.deleted_at)
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  if (!selectedConglomeradoId) {
    return activeOrgs;
  }
  return activeOrgs.filter((o) => o.id_grupo_empresarial === selectedConglomeradoId);
}

/**
 * Phase 1 (Conglomerado -> Organización): Selecting a Conglomerado updates `selectedConglomeradoId`,
 * clears incompatible organization/vinculo state, and auto-selects when the conglomerate has
 * exactly 1 active organization.
 */
export function selectWizardConglomerado(
  state: AuditWizardState,
  conglomeradoId: string,
  organizaciones: ReadonlyArray<OrganizacionEntity>
): AuditWizardState {
  const cleanId = (conglomeradoId || '').trim();
  if (!cleanId) {
    return {
      ...state,
      selectedConglomeradoId: '',
      selectedVinculoId: '',
      certTypes: [],
      errorMessage: null,
    };
  }

  const memberOrgs = getEligibleOrganizationsForWizard(cleanId, organizaciones);
  const currentStillValid = memberOrgs.some((o) => o.id === state.selectedOrganizacionId);
  const nextOrgId = currentStillValid
    ? state.selectedOrganizacionId
    : memberOrgs.length === 1
    ? memberOrgs[0].id
    : '';

  return {
    ...state,
    selectedConglomeradoId: cleanId,
    selectedOrganizacionId: nextOrgId,
    selectedVinculoId: state.selectedConglomeradoId === cleanId ? state.selectedVinculoId : '',
    certTypes: state.selectedConglomeradoId === cleanId ? state.certTypes : [],
    errorMessage: null,
  };
}

/**
 * Phase 1 (Organización -> Conglomerado): Selecting an Organización automatically resolves
 * and preselects its containing `Conglomerado` (`id_grupo_empresarial`).
 */
export function selectWizardOrganizacion(
  state: AuditWizardState,
  organizacionId: string,
  organizaciones: ReadonlyArray<OrganizacionEntity>
): AuditWizardState {
  const cleanOrgId = (organizacionId || '').trim();
  if (!cleanOrgId) {
    return {
      ...state,
      selectedOrganizacionId: '',
      errorMessage: null,
    };
  }

  const org = organizaciones.find((o) => !o.deleted_at && o.id === cleanOrgId);
  const resolvedCongId = org?.id_grupo_empresarial || state.selectedConglomeradoId;
  const changedCong = resolvedCongId !== state.selectedConglomeradoId;

  return {
    ...state,
    selectedOrganizacionId: cleanOrgId,
    selectedConglomeradoId: resolvedCongId,
    selectedVinculoId: changedCong ? '' : state.selectedVinculoId,
    certTypes: changedCong ? [] : state.certTypes,
    errorMessage: null,
  };
}

/**
 * Phase 2: Resolves all active `Vínculo` records associated with the selected `Conglomerado`,
 * checking both direct `id_grupo_empresarial` ownership and certificates held by member organizations.
 */
export function resolveEligibleVinculosForConglomerado(
  selectedConglomeradoId: string,
  vinculos: ReadonlyArray<VinculoEntity>,
  certificados: ReadonlyArray<WizardCertRef>,
  organizaciones: ReadonlyArray<OrganizacionEntity>
): VinculoEntity[] {
  if (!selectedConglomeradoId) return [];

  const orgIdsInCong = new Set(
    organizaciones
      .filter((o) => !o.deleted_at && o.id_grupo_empresarial === selectedConglomeradoId)
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
      if (v.id_grupo_empresarial === selectedConglomeradoId) return true;
      return activeCerts.some((c) => certIdsInCong.has(c.id_certificado));
    })
    .slice()
    .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es'));
}

export const WIZARD_NO_VINCULO_GUIDANCE_MESSAGE =
  'Este conglomerado aún no tiene un Vínculo configurado (o no posee certificados). Dirígete a Certificación → Certificado o a Auditoría → Vínculo para agrupar sus certificados antes de programar la auditoría.';

export function evaluateWizardAlcanceGate(
  vinculo: VinculoEntity | null | undefined,
  certificados: ReadonlyArray<WizardCertRef>,
  organizaciones: ReadonlyArray<OrganizacionEntity> = []
) {
  if (!vinculo) {
    return { allowed: true, reason: null, missingCerts: [] };
  }
  const orgAbrevById = new Map<string, string>();
  for (const org of organizaciones) {
    if (!org.deleted_at && org.abreviacion) {
      orgAbrevById.set(org.id, org.abreviacion);
    }
  }
  const enrichedCerts = certificados.map((c) => ({
    ...c,
    organizacion_abreviacion:
      c.organizacion_abreviacion ?? orgAbrevById.get(c.id_organizacion) ?? null,
  }));
  const enrichedMembers = vinculo.certificados.map((m) => ({
    ...m,
    organizacion_abreviacion:
      m.organizacion_abreviacion ?? orgAbrevById.get(m.id_organizacion) ?? null,
  }));
  return validateVinculoCertificatesHaveAlcance(enrichedMembers, enrichedCerts);
}

export function selectWizardVinculo(
  state: AuditWizardState,
  vinculoId: string,
  vinculos: ReadonlyArray<VinculoEntity>,
  tiposCatalog: ReadonlyArray<TipoAuditoriaCatalogItem>,
  certificados: ReadonlyArray<WizardCertRef> = [],
  organizaciones: ReadonlyArray<OrganizacionEntity> = []
): AuditWizardState {
  const vinculo = vinculos.find((v) => !v.deleted_at && v.id === vinculoId);
  if (!vinculo) {
    return {
      ...state,
      selectedVinculoId: '',
      certTypes: [],
      errorMessage: null,
    };
  }

  const activeTipos = tiposCatalog.filter((t) => !t.deleted_at);
  const defaultTipoId = activeTipos[0]?.id || '';
  const prevSelections = new Map<string, string>(
    state.certTypes.map((c) => [c.id_certificado, c.id_tipo_auditoria])
  );
  const certTypes = buildCertTypesDraftForVinculo(
    vinculo,
    defaultTipoId,
    prevSelections,
    certificados,
    organizaciones
  );
  const nextEtiqueta =
    state.etiqueta.trim() || `${vinculo.etiqueta} — Auditoría ${state.anio}`;

  return {
    ...state,
    selectedVinculoId: vinculo.id,
    etiqueta: nextEtiqueta,
    certTypes,
    errorMessage: null,
  };
}

export function setWizardCertTipo(
  state: AuditWizardState,
  certificadoId: string,
  tipoAuditoriaId: string
): AuditWizardState {
  return {
    ...state,
    certTypes: state.certTypes.map((item) =>
      item.id_certificado === certificadoId
        ? { ...item, id_tipo_auditoria: tipoAuditoriaId }
        : item
    ),
    errorMessage: null,
  };
}

export function applySameTipoToAllWizardCerts(
  state: AuditWizardState,
  tipoAuditoriaId: string
): AuditWizardState {
  if (!tipoAuditoriaId) return state;
  return {
    ...state,
    certTypes: state.certTypes.map((item) => ({
      ...item,
      id_tipo_auditoria: tipoAuditoriaId,
    })),
    errorMessage: null,
  };
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
    const hasCong =
      Boolean(state.selectedConglomeradoId) &&
      deps.conglomerados.some(
        (g) => !g.deleted_at && g.id === state.selectedConglomeradoId
      );
    if (!hasCong) {
      return {
        allowed: false,
        reason: 'Seleccione un Conglomerado o una Organización para continuar.',
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
        reason: 'Seleccione un Vínculo activo para configurar los tipos de auditoría.',
      };
    }
    const alcanceCheck = evaluateWizardAlcanceGate(
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
    const alcanceCheck = evaluateWizardAlcanceGate(
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
    const eligible = resolveEligibleVinculosForConglomerado(
      state.selectedConglomeradoId,
      deps.vinculos,
      deps.certificados,
      deps.organizaciones
    );

    if (eligible.length === 1) {
      const updated = selectWizardVinculo(
        { ...state, step: 2, errorMessage: null },
        eligible[0].id,
        deps.vinculos,
        deps.tiposCatalog,
        deps.certificados,
        deps.organizaciones
      );
      return updated;
    }

    const currentStillEligible = eligible.some((v) => v.id === state.selectedVinculoId);
    return {
      ...state,
      step: 2,
      selectedVinculoId: currentStillEligible ? state.selectedVinculoId : '',
      certTypes: currentStillEligible ? state.certTypes : [],
      errorMessage: null,
    };
  }

  if (state.step === 2) {
    const withVinculo = selectWizardVinculo(
      state,
      state.selectedVinculoId,
      deps.vinculos,
      deps.tiposCatalog,
      deps.certificados,
      deps.organizaciones
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

export function buildStep3NewCycleDraftFromWizard(
  state: AuditWizardState,
  vinculos: ReadonlyArray<VinculoEntity>,
  certificados?: ReadonlyArray<WizardCertRef>
): { ok: true; draft: Step3NewCycleDraft } | { ok: false; error: string } {
  const goalDate = state.fecha_programada.trim();
  const draft: Step3NewCycleDraft = {
    id_vinculo: state.selectedVinculoId,
    codigo_programa: state.codigo_programa.trim(),
    etiqueta: state.etiqueta.trim(),
    dateMode: state.dateMode,
    anio: state.anio,
    mes: state.mes,
    fecha_inicio: goalDate,
    fecha_fin: goalDate,
    fecha_programada: goalDate,
    observacion: state.observacion.trim() || 'Auditoría programada desde asistente + Auditoría.',
    certTypes: state.certTypes,
  };

  const err = validateStep3NewCycleDraft(draft, vinculos, certificados);
  if (err) {
    return { ok: false, error: err };
  }
  return { ok: true, draft };
}
