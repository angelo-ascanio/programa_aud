/**
 * Step 2.1 — Pure Domain Engine for Organization Versioning (`organizacion_version`)
 *
 * Covers:
 * - Comparable field normalization & Anti-No-Op Guard (`hasOrganizacionVersionChanges`)
 * - New organization version draft validation (`validateNewOrganizacionVersionDraft`)
 * - Post-creation certificate version resolution planner (`buildDefaultCertVersionOrgResolutions`, `validateCertVersionOrgResolutions`)
 * - Transactional RPC persistence (`persistCreateOrganizacionVersion`, `persistResolveCertVersionsOrg`)
 * - Zero-UUID Spanish PostgreSQL error translator (`translateOrganizacionVersionDbError`)
 *
 * Strictly typed (`strict: true`, 0 `any` / `as any`) and Zero-UUID compliant.
 */

import {
  validateOrganizacionDraft,
  type OrganizacionEntity,
  type OrganizacionFormDraft,
  type OrganizacionVersionEntity,
} from './activeCertificates';
import { containsRawUuid, isValidUuid } from './zeroUuid';

export const EXACT_NO_CHANGES_ORG_VERSION_MESSAGE =
  'No se detectaron cambios respecto a la versión activa. Modifique al menos un campo (Nombre, Abreviación, RIF o Dirección Fiscal) para crear una nueva versión.';

// =============================================================================
// 1. Comparable Normalization & Anti-No-Op Guard
// =============================================================================

export interface OrganizacionComparableInput {
  nombre: string;
  abreviacion?: string | null;
  rif?: string | null;
  direccion_fiscal?: string | null;
}

export interface OrganizacionComparableFields {
  nombre: string;
  abreviacion: string;
  rif: string;
  direccion_fiscal: string;
}

function collapseSpaces(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Normalizes `(nombre, abreviacion, rif, direccion_fiscal)` identically to
 * PostgreSQL `fn_crear_version_organizacion` for deterministic Anti-No-Op checks.
 */
export function normalizeOrganizacionComparableFields(
  draft: OrganizacionComparableInput
): OrganizacionComparableFields {
  return {
    nombre: collapseSpaces(draft.nombre),
    abreviacion: collapseSpaces(draft.abreviacion).toUpperCase(),
    rif: collapseSpaces(draft.rif).toUpperCase(),
    direccion_fiscal: collapseSpaces(draft.direccion_fiscal),
  };
}

/**
 * Anti-No-Op Guard: returns `true` if at least one comparable field changed
 * relative to `activeVersion`, or `false` if all 4 normalized fields match.
 */
export function hasOrganizacionVersionChanges(
  activeVersion: OrganizacionComparableInput,
  draft: OrganizacionComparableInput
): boolean {
  const current = normalizeOrganizacionComparableFields(activeVersion);
  const next = normalizeOrganizacionComparableFields(draft);

  return (
    current.nombre !== next.nombre ||
    current.abreviacion !== next.abreviacion ||
    current.rif !== next.rif ||
    current.direccion_fiscal !== next.direccion_fiscal
  );
}

/**
 * Validates a draft intended to create a new `organizacion_version`.
 * Enforces the Anti-No-Op Guard first, then delegates field/uniqueness checks
 * while excluding `activeVersion.id_organizacion` from self-collision.
 */
export function validateNewOrganizacionVersionDraft(
  activeVersion: OrganizacionVersionEntity,
  draft: OrganizacionFormDraft,
  existingOrgs: ReadonlyArray<OrganizacionEntity>
): { valid: boolean; errorMessage: string | null } {
  if (!hasOrganizacionVersionChanges(activeVersion, draft)) {
    return {
      valid: false,
      errorMessage: EXACT_NO_CHANGES_ORG_VERSION_MESSAGE,
    };
  }

  const baseCheck = validateOrganizacionDraft(
    draft,
    existingOrgs,
    activeVersion.id_organizacion
  );
  if (!baseCheck.valid) {
    return {
      valid: false,
      errorMessage: baseCheck.message,
    };
  }

  return {
    valid: true,
    errorMessage: null,
  };
}

// =============================================================================
// 2. Post-Creation Certificate Version Resolution Planner
// =============================================================================

export type CertVersionOrgAction = 'MANTENER_ANTERIOR' | 'VINCULAR_NUEVA';

export const CERT_VERSION_ORG_ACTION_LABELS: Record<CertVersionOrgAction, string> = {
  MANTENER_ANTERIOR: 'Mantener en versión anterior de organización',
  VINCULAR_NUEVA: 'Vincular a nueva versión de organización',
};

export interface CertVersionOrgCandidate {
  id_certificado: string;
  id_certificado_version: string;
  id_organizacion?: string;
  numero_certificado: string;
  norma_codigo: string;
  version_numero: number;
  es_version_actual: boolean;
  id_organizacion_version: string | null;
  estatus?: string;
  deleted_at?: string | null;
  certificado_deleted_at?: string | null;
}

export interface CertVersionOrgResolutionItem {
  id_certificado: string;
  id_certificado_version: string;
  numero_certificado: string;
  norma_codigo: string;
  version_numero: number;
  es_version_actual: boolean;
  id_organizacion_version: string | null;
  es_en_version_org_activa: boolean;
  action: CertVersionOrgAction | null;
  action_label: string;
}

/**
 * Builds the default resolution plan for every non-deleted `certificado_version`
 * belonging to the organization:
 * - Historical versions (`es_version_actual === false`) -> `MANTENER_ANTERIOR`
 * - Current version (`es_version_actual === true`) -> `VINCULAR_NUEVA`
 */
export function buildDefaultCertVersionOrgResolutions(
  certificados: ReadonlyArray<CertVersionOrgCandidate>,
  activeOrgVersionId?: string | null
): CertVersionOrgResolutionItem[] {
  const activeVersionNormalized =
    typeof activeOrgVersionId === 'string' && activeOrgVersionId.trim().length > 0
      ? activeOrgVersionId.trim()
      : null;

  return certificados
    .filter((item) => !item.deleted_at && !item.certificado_deleted_at)
    .map((item) => {
      const action: CertVersionOrgAction = item.es_version_actual
        ? 'VINCULAR_NUEVA'
        : 'MANTENER_ANTERIOR';

      return {
        id_certificado: item.id_certificado,
        id_certificado_version: item.id_certificado_version,
        numero_certificado: item.numero_certificado,
        norma_codigo: item.norma_codigo,
        version_numero: item.version_numero,
        es_version_actual: Boolean(item.es_version_actual),
        id_organizacion_version: item.id_organizacion_version,
        es_en_version_org_activa: Boolean(
          activeVersionNormalized && item.id_organizacion_version === activeVersionNormalized
        ),
        action,
        action_label: CERT_VERSION_ORG_ACTION_LABELS[action],
      };
    });
}

export function validateCertVersionOrgResolutions(
  resolutions: ReadonlyArray<CertVersionOrgResolutionItem>
): {
  valid: boolean;
  errorMessage: string | null;
  migrateCertVersionIds: string[];
  keepCertVersionIds: string[];
} {
  const seenVersionIds = new Set<string>();
  const migrateCertVersionIds: string[] = [];
  const keepCertVersionIds: string[] = [];

  for (const item of resolutions) {
    if (!isValidUuid(item.id_certificado) || !isValidUuid(item.id_certificado_version)) {
      return {
        valid: false,
        errorMessage:
          'Una o más versiones de certificado listadas no poseen una referencia válida.',
        migrateCertVersionIds: [],
        keepCertVersionIds: [],
      };
    }

    const versionId = item.id_certificado_version.trim();
    if (seenVersionIds.has(versionId)) {
      return {
        valid: false,
        errorMessage:
          'Se detectaron versiones de certificado duplicadas en el plan de resolución.',
        migrateCertVersionIds: [],
        keepCertVersionIds: [],
      };
    }
    seenVersionIds.add(versionId);

    if (item.action !== 'MANTENER_ANTERIOR' && item.action !== 'VINCULAR_NUEVA') {
      const certLabel =
        item.numero_certificado && !containsRawUuid(item.numero_certificado)
          ? ` para ${item.numero_certificado} (v${item.version_numero})`
          : '';
      return {
        valid: false,
        errorMessage: `Debe seleccionar una acción explícita${certLabel} antes de confirmar.`,
        migrateCertVersionIds: [],
        keepCertVersionIds: [],
      };
    }

    if (item.action === 'VINCULAR_NUEVA') {
      migrateCertVersionIds.push(versionId);
    } else {
      keepCertVersionIds.push(versionId);
    }
  }

  return {
    valid: true,
    errorMessage: null,
    migrateCertVersionIds,
    keepCertVersionIds,
  };
}

// =============================================================================
// 3. Strictly Typed Structural Supabase RPC Client & Error Translator (0 `any`)
// =============================================================================

export interface OrgVersionDbErrorLike {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

export interface OrgVersionRpcResponse<TData = unknown> {
  data: TData | null;
  error: OrgVersionDbErrorLike | null;
}

export interface OrgVersionSupabaseClient {
  rpc(
    fn: string,
    params?: Record<string, unknown>
  ): PromiseLike<OrgVersionRpcResponse>;
}

export interface OrgVersionPersistenceResult<TData = undefined> {
  ok: boolean;
  data?: TData;
  error?: string;
}

const UUID_INLINE_REGEX =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

function scrubRawUuids(text: string): string {
  return text
    .replace(UUID_INLINE_REGEX, 'referencia interna')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractDbErrorParts(err: unknown): {
  code: string;
  message: string;
  details: string;
  hint: string;
} {
  if (typeof err === 'string') {
    return { code: '', message: err, details: '', hint: '' };
  }
  if (err instanceof Error) {
    return { code: '', message: err.message, details: '', hint: '' };
  }
  if (typeof err === 'object' && err !== null) {
    const rec = err as Record<string, unknown>;
    return {
      code: typeof rec.code === 'string' ? rec.code.trim() : '',
      message: typeof rec.message === 'string' ? rec.message.trim() : '',
      details: typeof rec.details === 'string' ? rec.details.trim() : '',
      hint: typeof rec.hint === 'string' ? rec.hint.trim() : '',
    };
  }
  return { code: '', message: '', details: '', hint: '' };
}

/**
 * Translates PostgreSQL / Supabase errors raised during organization versioning
 * or post-creation certificate resolution into Spanish messages strictly free of UUIDs.
 */
export function translateOrganizacionVersionDbError(err: unknown): string {
  const { code, message, details, hint } = extractDbErrorParts(err);
  const combined = `${message} ${details} ${hint}`.trim();
  const lower = combined.toLowerCase();

  // 1. RLS / Permission Violations (42501 or explicit RPC denial)
  if (
    code === '42501' ||
    lower.includes('row-level security') ||
    lower.includes('permission denied') ||
    lower.includes('acceso denegado')
  ) {
    return 'Permisos insuficientes (RLS): solo personal ADMIN o WORKER aprobado puede crear o resolver versiones de organización.';
  }

  // 2. Unique Violations (23505) on `organizacion_version` partial indexes
  if (code === '23505' || lower.includes('duplicate key value')) {
    if (
      lower.includes('uq_organizacion_version_nombre_actual_active') ||
      (lower.includes('nombre') && !lower.includes('abreviacion'))
    ) {
      return 'Ya existe una organización cliente activa registrada con esa razón social.';
    }
    if (
      lower.includes('uq_organizacion_version_abrev_actual_active') ||
      lower.includes('abreviacion')
    ) {
      return 'Ya existe una organización cliente activa registrada con esa abreviación.';
    }
    if (
      lower.includes('uq_organizacion_version_rif_actual_active') ||
      lower.includes('rif')
    ) {
      return 'Ya existe una organización cliente activa registrada con ese RIF / NIF.';
    }
    if (lower.includes('uq_organizacion_version_actual_active')) {
      return 'Ya existe una versión activa registrada para esta organización. Recargue los datos e intente nuevamente.';
    }
    if (lower.includes('uq_organizacion_version_numero_active')) {
      return 'Conflicto de numeración secuencial en las versiones de la organización. Recargue los datos e intente nuevamente.';
    }
    return 'Ya existe un registro activo duplicado en el versionado de la organización.';
  }

  // 3. Anti-No-Op and custom P0001 business exceptions
  if (lower.includes('no se detectaron cambios respecto a la versión activa')) {
    return EXACT_NO_CHANGES_ORG_VERSION_MESSAGE;
  }

  if (code === 'P0001' && message) {
    const cleaned = scrubRawUuids(message);
    if (cleaned) return cleaned;
  }

  // 4. Generic error fallback with strict UUID scrubbing
  if (message) {
    const cleaned = scrubRawUuids(message);
    if (cleaned) return cleaned;
  }

  return 'No se pudo completar la operación de versionado de organización en la base de datos.';
}

// =============================================================================
// 4. Transactional RPC Operations
// =============================================================================

export interface CreateOrganizacionVersionParams {
  id_organizacion: string;
  nombre: string;
  abreviacion: string;
  rif?: string | null;
  direccion_fiscal?: string | null;
  notas_version?: string | null;
}

export async function persistCreateOrganizacionVersion(
  supabase: OrgVersionSupabaseClient,
  params: CreateOrganizacionVersionParams
): Promise<OrgVersionPersistenceResult<{ id_organizacion_version: string }>> {
  if (!isValidUuid(params.id_organizacion)) {
    return {
      ok: false,
      error: 'Debe seleccionar una organización válida para crear una nueva versión.',
    };
  }

  const normalized = normalizeOrganizacionComparableFields(params);
  const notas =
    typeof params.notas_version === 'string' && params.notas_version.trim().length > 0
      ? params.notas_version.trim()
      : null;

  if (
    containsRawUuid(normalized.nombre) ||
    containsRawUuid(normalized.abreviacion) ||
    containsRawUuid(normalized.rif) ||
    containsRawUuid(normalized.direccion_fiscal) ||
    (notas !== null && containsRawUuid(notas))
  ) {
    return {
      ok: false,
      error: 'Los campos de la versión no pueden contener identificadores internos.',
    };
  }

  try {
    const { data, error } = await supabase.rpc('fn_crear_version_organizacion', {
      p_id_organizacion: params.id_organizacion.trim(),
      p_nombre: normalized.nombre,
      p_abreviacion: normalized.abreviacion,
      p_rif: normalized.rif || null,
      p_direccion_fiscal: normalized.direccion_fiscal || null,
      p_notas_version: notas,
    });

    if (error) {
      return {
        ok: false,
        error: translateOrganizacionVersionDbError(error),
      };
    }

    if (!isValidUuid(data)) {
      return {
        ok: false,
        error:
          'La base de datos no devolvió una confirmación válida de la nueva versión de organización.',
      };
    }

    return {
      ok: true,
      data: {
        id_organizacion_version: data.trim(),
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: translateOrganizacionVersionDbError(err),
    };
  }
}

export interface ResolveCertVersionsOrgParams {
  id_nueva_org_version: string;
  resolutions: ReadonlyArray<CertVersionOrgResolutionItem>;
}

export async function persistResolveCertVersionsOrg(
  supabase: OrgVersionSupabaseClient,
  params: ResolveCertVersionsOrgParams
): Promise<
  OrgVersionPersistenceResult<{
    updatedCount: number;
    migratedCertVersionIds: string[];
  }>
> {
  if (!isValidUuid(params.id_nueva_org_version)) {
    return {
      ok: false,
      error: 'Debe indicar una versión destino válida de la organización.',
    };
  }

  const validation = validateCertVersionOrgResolutions(params.resolutions);
  if (!validation.valid) {
    return {
      ok: false,
      error:
        validation.errorMessage ||
        'La selección de resolución de certificados es inválida.',
    };
  }

  try {
    const { data, error } = await supabase.rpc(
      'fn_resolver_cert_versiones_organizacion',
      {
        p_id_nueva_org_version: params.id_nueva_org_version.trim(),
        p_cert_version_ids_migrar: validation.migrateCertVersionIds,
      }
    );

    if (error) {
      return {
        ok: false,
        error: translateOrganizacionVersionDbError(error),
      };
    }

    const numericCount = Number(data);
    const updatedCount =
      Number.isFinite(numericCount) && numericCount >= 0
        ? Math.trunc(numericCount)
        : validation.migrateCertVersionIds.length;

    return {
      ok: true,
      data: {
        updatedCount,
        migratedCertVersionIds: validation.migrateCertVersionIds,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: translateOrganizacionVersionDbError(err),
    };
  }
}
