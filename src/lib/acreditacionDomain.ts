/**
 * Phase 4.1.3 & Multi-Sector Refactoring: Accreditation Domain Module (`acreditacion_norma` + `acreditacion_norma_sector_iaf` + `organismo_acreditacion`)
 * Compliant with ISO/IEC 17011, ISO/IEC 17021-1, and IAF Mandatory Documents.
 * Strictly typed (0 any) and Zero-UUID presentation compliant.
 */

import { isActiveCertificateStatus, normalizeText } from './activeCertificates';
import { isValidUuid } from './zeroUuid';
import type { MultiViewSelectionMap, SortDirection } from './universalTemplate';
import {
  INITIAL_ACREDITACIONES,
  INITIAL_ESTATUS_CATALOG,
  INITIAL_NORMAS,
  INITIAL_ORGANISMOS,
  INITIAL_SECTORES_IAF,
  resolveSectorIafDescription,
  type AcreditacionNormaIaf,
  type EstatusCatalogItem,
  type NormaEntity,
  type OrganismoAcreditacion,
  type SectorIafEntity,
  type SubsectorIafEntity,
} from './extraDomain';

export type AcreditacionEstatus = string;

export type OrganismoDetailMode = 'read' | 'add' | 'edit';

export interface OrganismoFormDraft {
  codigo: string;
  nombre: string;
  pais: string;
  sitio_web: string;
}

export interface OrganismoViewState {
  selectedOrganismoId: string | null;
  activeChildTab: 'acreditaciones';
  query: string;
  viewMode: 'grid' | 'list';
  sortColumn: string | null;
  sortDirection: SortDirection;
  isSidebarOpen?: boolean;
  facetSelections?: MultiViewSelectionMap;
  isCreating?: boolean;
  isEditingAttributes?: boolean;
  formDraft?: OrganismoFormDraft;
  editErrorMessage?: string | null;
}

export type AcreditacionDetailMode = 'read' | 'add' | 'edit';

export interface AcreditacionSectorLink {
  id?: string; // acreditacion_norma_sector_iaf.id when persisted
  id_sector_iaf: string;
  sector: number;
  descripcion: string;
}

export interface AcreditacionFormDraft {
  id_organismo: string;
  id_norma: string;
  id_estatus: string;
  numero_acreditacion: string;
  fecha_concesion: string;
  fecha_vencimiento: string;
  sector_ids: string[];
}

export type AcreditacionExpiryState =
  | 'Vigente'
  | 'Por Vencer'
  | 'Vencida'
  | 'Sin Vencimiento';

export interface AcreditacionExpiryEvaluation {
  state: AcreditacionExpiryState;
  daysRemaining: number | null;
}

export interface AcreditacionDetailEntity {
  id: string;
  id_organismo: string;
  organismo_codigo: string;
  organismo_nombre: string;
  organismo_pais: string;
  organismo_sitio_web: string | null;
  id_norma: string;
  norma_codigo: string;
  norma_titulo: string;
  id_estatus: string;
  estatus: string;
  sectores: AcreditacionSectorLink[];
  sector_ids: string[];
  numero_acreditacion: string;
  fecha_concesion: string;
  fecha_vencimiento: string | null;
  activeCertificatesCount: number;
  deleted_at: string | null;
}

export interface CertificateCoverageInput {
  id?: string;
  estatus?: string | null;
  id_norma?: string | null;
  norma_id?: string | null;
  norma_codigo?: string | null;
  norma?: string | null;
  id_sector_iaf?: string | null;
  sector_iaf?: number | null;
}

export interface OrganismoValidationResult {
  valid: boolean;
  error?: string;
  normalized?: {
    codigo: string;
    nombre: string;
    pais: string;
    sitio_web: string | null;
  };
}

export interface AcreditacionDraftValidationResult {
  valid: boolean;
  error?: string;
  normalized?: {
    id_organismo: string;
    id_norma: string;
    id_estatus: string;
    numero_acreditacion: string;
    fecha_concesion: string;
    fecha_vencimiento: string | null;
    sector_ids: string[];
  };
}

export interface SupabaseOrganismoJoinRow {
  id?: unknown;
  codigo?: unknown;
  nombre?: unknown;
  pais?: unknown;
  sitio_web?: unknown;
  deleted_at?: unknown;
}

export interface SupabaseNormaJoinRow {
  id?: unknown;
  codigo?: unknown;
  titulo?: unknown;
  norma?: unknown;
  esquema?: unknown;
  deleted_at?: unknown;
}

export interface SupabaseEstatusJoinRow {
  id?: unknown;
  estatus?: unknown;
  deleted_at?: unknown;
}

export interface SupabaseSectorIafJoinRow {
  id?: unknown;
  sector?: unknown;
  descripcion?: unknown;
  deleted_at?: unknown;
}

export interface SupabaseAcreditacionSectorJoinRow {
  id?: unknown;
  id_acreditacion_norma?: unknown;
  id_sector_iaf?: unknown;
  deleted_at?: unknown;
  sector_iaf?: SupabaseSectorIafJoinRow | null;
}

export interface SupabaseAcreditacionJoinRow {
  id?: unknown;
  id_organismo?: unknown;
  id_norma?: unknown;
  id_estatus?: unknown;
  numero_acreditacion?: unknown;
  fecha_concesion?: unknown;
  fecha_vencimiento?: unknown;
  deleted_at?: unknown;
  organismo?: SupabaseOrganismoJoinRow | null;
  norma?: SupabaseNormaJoinRow | null;
  estatus_ref?: SupabaseEstatusJoinRow | null;
  estatus?: SupabaseEstatusJoinRow | string | null;
  sectores?: ReadonlyArray<SupabaseAcreditacionSectorJoinRow> | null;
}

export const NO_SECTORS_LABEL = 'Sin sectores vinculados';
export const DEFAULT_ACREDITACION_ESTATUS_ID = 'a0000000-0000-0000-0000-000000000001';
export const EXPIRY_WARNING_DAYS = 90;

export const VALID_ACREDITACION_STATUSES: readonly string[] = [
  'Activo',
  'Estudio',
  'Suspendido',
  'Cancelado',
  'Planificado',
  'En Ejecución',
  'En Espera',
  'Inactivo',
];

/**
 * Returns the URL only if it starts with `http://` or `https://` after trimming.
 */
export function normalizeSafeHttpUrl(raw: string | null | undefined): string | null {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;
  return /^https?:\/\/.+/i.test(trimmed) ? trimmed : null;
}

export function createEmptyOrganismoFormDraft(
  prefill?: Partial<OrganismoFormDraft>
): OrganismoFormDraft {
  return {
    codigo: prefill?.codigo ?? '',
    nombre: prefill?.nombre ?? '',
    pais: prefill?.pais ?? '',
    sitio_web: prefill?.sitio_web ?? '',
  };
}

export function createOrganismoDraftFromEntity(
  entity: OrganismoAcreditacion
): OrganismoFormDraft {
  return {
    codigo: entity.codigo || '',
    nombre: entity.nombre || '',
    pais: entity.pais || '',
    sitio_web: entity.sitio_web || '',
  };
}

export function createEmptyAcreditacionFormDraft(
  prefill?: Partial<AcreditacionFormDraft>
): AcreditacionFormDraft {
  return {
    id_organismo: prefill?.id_organismo ?? '',
    id_norma: prefill?.id_norma ?? '',
    id_estatus: prefill?.id_estatus ?? DEFAULT_ACREDITACION_ESTATUS_ID,
    numero_acreditacion: prefill?.numero_acreditacion ?? '',
    fecha_concesion: prefill?.fecha_concesion ?? new Date().toISOString().slice(0, 10),
    fecha_vencimiento: prefill?.fecha_vencimiento ?? '',
    sector_ids: prefill?.sector_ids ? [...prefill.sector_ids] : [],
  };
}

export function createAcreditacionDraftFromEntity(
  entity: AcreditacionDetailEntity
): AcreditacionFormDraft {
  const sectorIds =
    entity.sector_ids && entity.sector_ids.length > 0
      ? [...entity.sector_ids]
      : entity.sectores.map((s) => s.id_sector_iaf);
  return {
    id_organismo: entity.id_organismo || '',
    id_norma: entity.id_norma || '',
    id_estatus: entity.id_estatus || DEFAULT_ACREDITACION_ESTATUS_ID,
    numero_acreditacion: entity.numero_acreditacion || '',
    fecha_concesion: entity.fecha_concesion || '',
    fecha_vencimiento: entity.fecha_vencimiento || '',
    sector_ids: Array.from(new Set(sectorIds)),
  };
}

function parseIsoDateUtcMs(raw: string | Date | null | undefined): number | null {
  if (!raw) return null;
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null;
    return Date.UTC(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate());
  }

  const trimmed = raw.trim();
  if (!trimmed) return null;

  const isoDateMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (!isoDateMatch) return null;

  const year = Number(isoDateMatch[1]);
  const month = Number(isoDateMatch[2]);
  const day = Number(isoDateMatch[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const utcMs = Date.UTC(year, month - 1, day);
  const check = new Date(utcMs);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return utcMs;
}

/**
 * Evaluates accreditation expiry state against a reference date (UTC day precision).
 * - > 90 days remaining -> 'Vigente'
 * - 0..90 days remaining -> 'Por Vencer'
 * - < 0 days remaining -> 'Vencida'
 * - missing/null expiry -> 'Sin Vencimiento'
 */
export function evaluateAccreditationExpiry(
  fechaVencimiento: string | null | undefined,
  referenceDate: Date | string = new Date()
): AcreditacionExpiryEvaluation {
  const expiryMs = parseIsoDateUtcMs(fechaVencimiento);
  if (expiryMs === null) {
    return {
      state: 'Sin Vencimiento',
      daysRemaining: null,
    };
  }

  const refMs = parseIsoDateUtcMs(referenceDate) ?? parseIsoDateUtcMs(new Date())!;
  const daysRemaining = Math.round((expiryMs - refMs) / 86_400_000);

  if (daysRemaining < 0) {
    return { state: 'Vencida', daysRemaining };
  }
  if (daysRemaining <= EXPIRY_WARNING_DAYS) {
    return { state: 'Por Vencer', daysRemaining };
  }
  return { state: 'Vigente', daysRemaining };
}

/**
 * Normalizes legacy or catalog accreditation status strings for display.
 */
export function normalizeAcreditacionStatus(raw: string | null | undefined): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return 'Activo';
  const cleaned = normalizeText(trimmed);
  if (cleaned === 'activa') return 'Activo';
  if (cleaned === 'suspendida') return 'Suspendido';
  if (cleaned === 'vencida' || cleaned === 'vencido') return 'Cancelado';
  if (cleaned === 'retirada' || cleaned === 'retirado') return 'Inactivo';
  if (cleaned === 'en renovacion') return 'En Renovación';
  return trimmed;
}

/**
 * Returns true if the accreditation status represents an active operational accreditation.
 */
export function isActiveAccreditationStatus(estatus: string | null | undefined): boolean {
  const cleaned = normalizeText(estatus);
  return cleaned === 'activo' || cleaned === 'activa';
}

/**
 * Strict Certificate Coverage Matching:
 * A certificate falls under an accreditation IF AND ONLY IF:
 * 1) The certificate status is active (`isActiveCertificateStatus`),
 * 2) Its norm matches the accreditation's `id_norma` (or canonical `norma_codigo`), AND
 * 3) Its IAF sector matches at least one sector explicitly linked in `accreditation.sectores`
 *    (zero linked sectors -> zero covered certificates; legacy null-sector wildcard removed).
 */
export function filterCoveredCertificatesForAccreditation<T extends CertificateCoverageInput>(
  accreditation: Pick<AcreditacionDetailEntity, 'id_norma' | 'norma_codigo' | 'sectores'>,
  certificates: ReadonlyArray<T>
): T[] {
  if (!certificates || certificates.length === 0) return [];
  const linkedSectors = accreditation.sectores || [];
  if (linkedSectors.length === 0) return [];

  const linkedSectorIds = new Set(
    linkedSectors.map((s) => s.id_sector_iaf).filter((id) => Boolean(id))
  );
  const linkedSectorNums = new Set(
    linkedSectors
      .map((s) => Number(s.sector))
      .filter((num) => Number.isInteger(num) && num > 0)
  );

  const targetNormCode = normalizeText(accreditation.norma_codigo);

  const matched: T[] = [];
  for (const cert of certificates) {
    if (!isActiveCertificateStatus(cert.estatus)) {
      continue;
    }

    const certNormId = cert.id_norma || cert.norma_id || null;
    const certNormCode = normalizeText(cert.norma_codigo || cert.norma || '');
    const normMatches =
      (Boolean(certNormId) && certNormId === accreditation.id_norma) ||
      (Boolean(targetNormCode) && certNormCode === targetNormCode);

    if (!normMatches) {
      continue;
    }

    const sectorMatchesById =
      Boolean(cert.id_sector_iaf) && linkedSectorIds.has(cert.id_sector_iaf!);
    const sectorMatchesByNum =
      cert.sector_iaf !== null &&
      cert.sector_iaf !== undefined &&
      linkedSectorNums.has(Number(cert.sector_iaf));

    if (sectorMatchesById || sectorMatchesByNum) {
      matched.push(cert);
    }
  }

  return matched;
}

/**
 * Computes active operational certificates covered by a specific accreditation scope.
 */
export function computeActiveCertificatesCountForAccreditation(
  accreditation: Pick<AcreditacionDetailEntity, 'id_norma' | 'norma_codigo' | 'sectores'>,
  certificates: ReadonlyArray<CertificateCoverageInput>
): number {
  return filterCoveredCertificatesForAccreditation(accreditation, certificates).length;
}

/**
 * Resolves IAF technical sub-sectors strictly covered by an accreditation's linked sectors.
 * Zero linked sectors => zero sub-sectors.
 */
export function getSubsectoresForAccreditation(
  accreditation: Pick<AcreditacionDetailEntity, 'sectores'>,
  subsectores: ReadonlyArray<SubsectorIafEntity>
): SubsectorIafEntity[] {
  if (!subsectores || subsectores.length === 0) return [];
  const linkedSectors = accreditation.sectores || [];
  if (linkedSectors.length === 0) return [];

  const linkedSectorIds = new Set(
    linkedSectors.map((s) => s.id_sector_iaf).filter((id) => Boolean(id))
  );
  const linkedSectorNums = new Set(
    linkedSectors
      .map((s) => Number(s.sector))
      .filter((num) => Number.isInteger(num) && num > 0)
  );

  return subsectores
    .filter(
      (sub) =>
        !sub.deleted_at &&
        (linkedSectorIds.has(sub.id_sector_iaf) || linkedSectorNums.has(sub.sector_numero))
    )
    .sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));
}

/**
 * Returns a copy of accreditations with freshly computed `activeCertificatesCount`.
 */
export function enrichAcreditacionesWithImpact(
  accreditations: ReadonlyArray<AcreditacionDetailEntity>,
  certificates: ReadonlyArray<CertificateCoverageInput>
): AcreditacionDetailEntity[] {
  return accreditations.map((acc) => ({
    ...acc,
    activeCertificatesCount: computeActiveCertificatesCountForAccreditation(acc, certificates),
  }));
}

/**
 * Validates `organismo_acreditacion` form drafts (`codigo` <= 20 unique CI, `nombre` <= 255,
 * `pais` <= 100, optional `sitio_web` <= 255 starting with http(s)://).
 */
export function validateOrganismoDraft(
  draft: OrganismoFormDraft,
  existing: ReadonlyArray<Pick<OrganismoAcreditacion, 'id' | 'codigo'> & { deleted_at?: string | null }> = [],
  excludeId?: string
): OrganismoValidationResult {
  const codigo = (draft.codigo || '').trim().toUpperCase();
  const nombre = (draft.nombre || '').trim();
  const pais = (draft.pais || '').trim();
  const sitioWeb = (draft.sitio_web || '').trim();

  if (codigo.length < 2 || codigo.length > 20) {
    return {
      valid: false,
      error: 'El código del organismo es obligatorio (entre 2 y 20 caracteres, ej. ENAC).',
    };
  }
  if (nombre.length < 3 || nombre.length > 255) {
    return {
      valid: false,
      error: 'El nombre del organismo es obligatorio (entre 3 y 255 caracteres).',
    };
  }
  if (pais.length < 2 || pais.length > 100) {
    return {
      valid: false,
      error: 'El país del organismo es obligatorio (entre 2 y 100 caracteres).',
    };
  }
  if (sitioWeb) {
    if (sitioWeb.length > 255) {
      return {
        valid: false,
        error: 'El sitio web del organismo no puede exceder 255 caracteres.',
      };
    }
    if (!/^https?:\/\/.+/i.test(sitioWeb)) {
      return {
        valid: false,
        error: 'El sitio web del organismo debe comenzar con http:// o https://.',
      };
    }
  }

  const duplicate = existing.some(
    (item) =>
      !item.deleted_at &&
      item.id !== excludeId &&
      normalizeText(item.codigo) === normalizeText(codigo)
  );
  if (duplicate) {
    return {
      valid: false,
      error: `Ya existe un organismo activo con el código "${codigo}".`,
    };
  }

  return {
    valid: true,
    normalized: {
      codigo,
      nombre,
      pais,
      sitio_web: sitioWeb || null,
    },
  };
}

/**
 * Unified validation for `acreditacion_norma` across `'add'` and `'edit'` modes.
 * Enforces Zero-UUID on `id_organismo`, `id_norma`, `id_estatus`, and any `sector_ids`,
 * chronological expiry coherence, and uniqueness of `numero_acreditacion` per organism.
 */
export function validateAcreditacionDraft(
  draft: AcreditacionFormDraft,
  existingAccreditations: ReadonlyArray<
    Pick<AcreditacionDetailEntity, 'id' | 'id_organismo' | 'numero_acreditacion' | 'deleted_at'>
  > = [],
  excludeId?: string
): AcreditacionDraftValidationResult {
  const idOrganismo = (draft.id_organismo || '').trim();
  if (!isValidUuid(idOrganismo)) {
    return {
      valid: false,
      error: 'Debe seleccionar un organismo de acreditación válido.',
    };
  }

  const idNorma = (draft.id_norma || '').trim();
  if (!isValidUuid(idNorma)) {
    return {
      valid: false,
      error: 'Debe seleccionar una norma ISO certificable válida.',
    };
  }

  const idEstatus = (draft.id_estatus || '').trim();
  if (!isValidUuid(idEstatus)) {
    return {
      valid: false,
      error: 'Debe seleccionar un estatus operativo válido del catálogo.',
    };
  }

  const uniqueSectorIds: string[] = [];
  const seenSectors = new Set<string>();
  for (const rawId of draft.sector_ids || []) {
    const cleanId = (rawId || '').trim();
    if (!cleanId) continue;
    if (!isValidUuid(cleanId)) {
      return {
        valid: false,
        error: 'Uno de los sectores IAF seleccionados no tiene un identificador válido.',
      };
    }
    if (!seenSectors.has(cleanId)) {
      seenSectors.add(cleanId);
      uniqueSectorIds.push(cleanId);
    }
  }

  const numeroAcreditacion = (draft.numero_acreditacion || '').trim();
  if (numeroAcreditacion.length < 2 || numeroAcreditacion.length > 100) {
    return {
      valid: false,
      error: 'El número de acreditación es obligatorio (entre 2 y 100 caracteres).',
    };
  }

  const fechaConcesion = (draft.fecha_concesion || '').trim();
  const grantMs = parseIsoDateUtcMs(fechaConcesion);
  if (grantMs === null) {
    return {
      valid: false,
      error: 'La fecha de concesión es obligatoria y debe tener formato YYYY-MM-DD válido.',
    };
  }

  const rawExpiry = (draft.fecha_vencimiento || '').trim();
  let fechaVencimiento: string | null = null;
  if (rawExpiry) {
    const expiryMs = parseIsoDateUtcMs(rawExpiry);
    if (expiryMs === null) {
      return {
        valid: false,
        error: 'La fecha de vencimiento debe tener formato YYYY-MM-DD válido.',
      };
    }
    if (expiryMs < grantMs) {
      return {
        valid: false,
        error: 'La fecha de vencimiento debe ser igual o posterior a la fecha de concesión.',
      };
    }
    fechaVencimiento = rawExpiry;
  }

  const duplicate = existingAccreditations.some(
    (existing) =>
      existing.id !== excludeId &&
      !existing.deleted_at &&
      existing.id_organismo === idOrganismo &&
      normalizeText(existing.numero_acreditacion) === normalizeText(numeroAcreditacion)
  );
  if (duplicate) {
    return {
      valid: false,
      error: `Ya existe una acreditación activa con el número "${numeroAcreditacion}" para ese organismo.`,
    };
  }

  return {
    valid: true,
    normalized: {
      id_organismo: idOrganismo,
      id_norma: idNorma,
      id_estatus: idEstatus,
      numero_acreditacion: numeroAcreditacion,
      fecha_concesion: fechaConcesion,
      fecha_vencimiento: fechaVencimiento,
      sector_ids: uniqueSectorIds,
    },
  };
}

/**
 * Formats the multi-sector IAF scope summary cleanly for cards, tables, and detail rows.
 */
export function formatAcreditacionSectorsSummary(
  sectores: ReadonlyArray<Pick<AcreditacionSectorLink, 'sector' | 'descripcion'>>
): { shortLabel: string; detailLabel: string; count: number } {
  if (!sectores || sectores.length === 0) {
    return {
      shortLabel: NO_SECTORS_LABEL,
      detailLabel: 'Ningún sector IAF vinculado al alcance',
      count: 0,
    };
  }
  const sorted = [...sectores].sort((a, b) => a.sector - b.sector);
  if (sorted.length === 1) {
    const only = sorted[0];
    return {
      shortLabel: `Sector ${only.sector}`,
      detailLabel: only.descripcion || `Sector técnico IAF ${only.sector}`,
      count: 1,
    };
  }
  const nums = sorted.map((s) => s.sector).join(', ');
  return {
    shortLabel: `Sectores ${nums}`,
    detailLabel: `${sorted.length} sectores IAF amparados (${nums})`,
    count: sorted.length,
  };
}

/**
 * Returns the canonical facet option keys for Sector IAF on an accreditation record.
 */
export function getAcreditacionSectorFacetValues(
  accreditation: Pick<AcreditacionDetailEntity, 'sectores'>
): string[] {
  const nums = new Set<string>();
  for (const sec of accreditation.sectores || []) {
    if (Number.isInteger(sec.sector) && sec.sector > 0) {
      nums.add(String(sec.sector));
    }
  }
  return Array.from(nums).sort((a, b) => Number(a) - Number(b));
}

/**
 * Visual styling helper for accreditation operational status badges (supports canonical `estatus` catalog + legacy labels).
 */
export function formatAcreditacionDirectoryStatusBadge(estatus: string): {
  label: string;
  badgeClass: string;
  symbol: string;
} {
  const rawLabel = (estatus || '').trim();
  switch (normalizeText(rawLabel)) {
    case 'activo':
    case 'activa':
      return {
        label: rawLabel || 'Activo',
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        symbol: '✓',
      };
    case 'estudio':
      return {
        label: rawLabel || 'Estudio',
        badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
        symbol: '◐',
      };
    case 'planificado':
      return {
        label: rawLabel || 'Planificado',
        badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
        symbol: '◷',
      };
    case 'en ejecucion':
    case 'en renovacion':
      return {
        label: rawLabel || 'En Renovación',
        badgeClass: 'bg-teal-50 text-teal-800 border-teal-200',
        symbol: '⏳',
      };
    case 'suspendido':
    case 'suspendida':
    case 'en espera':
      return {
        label: rawLabel || 'Suspendido',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
        symbol: '⏸',
      };
    case 'inactivo':
    case 'retirada':
    case 'retirado':
      return {
        label: rawLabel || 'Inactivo',
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
        symbol: '⊘',
      };
    case 'cancelado':
    case 'vencida':
    case 'vencido':
    default:
      return {
        label: rawLabel || 'Cancelado',
        badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
        symbol: '✕',
      };
  }
}

/**
 * Visual styling helper for accreditation expiry indicator badges.
 */
export function formatAcreditacionExpiryBadge(
  evaluation: AcreditacionExpiryEvaluation
): {
  label: string;
  badgeClass: string;
} {
  switch (evaluation.state) {
    case 'Vigente':
      return {
        label:
          evaluation.daysRemaining !== null
            ? `Vigente (${evaluation.daysRemaining} d)`
            : 'Vigente',
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      };
    case 'Por Vencer':
      return {
        label:
          evaluation.daysRemaining !== null
            ? `Por Vencer (${evaluation.daysRemaining} d)`
            : 'Por Vencer',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
      };
    case 'Vencida':
      return {
        label:
          evaluation.daysRemaining !== null
            ? `Vencida (${Math.abs(evaluation.daysRemaining)} d)`
            : 'Vencida',
        badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
      };
    case 'Sin Vencimiento':
    default:
      return {
        label: 'Sin Vencimiento',
        badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
      };
  }
}

/**
 * Maps Supabase relational rows from `acreditacion_norma` (joined with
 * `organismo_acreditacion`, `norma`, `estatus`, and `acreditacion_norma_sector_iaf`)
 * into typed `AcreditacionDetailEntity[]`.
 * Filters out soft-deleted parent and child link rows (`deleted_at != null`)
 * and never exposes raw UUIDs in user-facing labels.
 */
export function mapSupabaseAcreditacionRows(
  rows: ReadonlyArray<SupabaseAcreditacionJoinRow>,
  lookups: {
    organismos?: ReadonlyArray<OrganismoAcreditacion>;
    normas?: ReadonlyArray<NormaEntity>;
    sectores?: ReadonlyArray<SectorIafEntity>;
    estatusList?: ReadonlyArray<EstatusCatalogItem>;
    certificates?: ReadonlyArray<CertificateCoverageInput>;
  } = {}
): AcreditacionDetailEntity[] {
  const organismos = lookups.organismos ?? INITIAL_ORGANISMOS;
  const normas = lookups.normas ?? INITIAL_NORMAS;
  const sectoresCatalog = lookups.sectores ?? INITIAL_SECTORES_IAF;
  const estatusCatalog = lookups.estatusList ?? INITIAL_ESTATUS_CATALOG;
  const certificates = lookups.certificates ?? [];

  const result: AcreditacionDetailEntity[] = [];

  for (const row of rows) {
    if (row.deleted_at) continue;

    const id = typeof row.id === 'string' ? row.id : String(row.id || '');
    if (!id) continue;

    const orgJoin = row.organismo || null;
    const normaJoin = row.norma || null;
    const estatusJoin =
      row.estatus_ref ||
      (row.estatus && typeof row.estatus === 'object'
        ? (row.estatus as SupabaseEstatusJoinRow)
        : null);

    const idOrganismo = String(row.id_organismo || orgJoin?.id || '');
    const matchedOrg = organismos.find((o) => o.id === idOrganismo);

    const idNorma = String(row.id_norma || normaJoin?.id || '');
    const matchedNorma = normas.find((n) => n.id === idNorma);

    const idEstatusRaw = String(row.id_estatus || estatusJoin?.id || '').trim();
    const estatusNameRaw =
      typeof estatusJoin?.estatus === 'string'
        ? estatusJoin.estatus
        : typeof row.estatus === 'string'
        ? row.estatus
        : '';
    const matchedEstatus =
      (idEstatusRaw ? estatusCatalog.find((e) => e.id === idEstatusRaw) : undefined) ||
      (estatusNameRaw
        ? estatusCatalog.find(
            (e) => normalizeText(e.estatus) === normalizeText(normalizeAcreditacionStatus(estatusNameRaw))
          )
        : undefined) ||
      estatusCatalog.find((e) => e.id === DEFAULT_ACREDITACION_ESTATUS_ID);

    const resolvedIdEstatus = idEstatusRaw || matchedEstatus?.id || DEFAULT_ACREDITACION_ESTATUS_ID;
    const resolvedEstatusLabel =
      (estatusNameRaw ? normalizeAcreditacionStatus(estatusNameRaw) : '') ||
      matchedEstatus?.estatus ||
      'Activo';

    const linkedSectors: AcreditacionSectorLink[] = [];
    const seenSectorIds = new Set<string>();
    for (const linkRow of row.sectores || []) {
      if (!linkRow || linkRow.deleted_at) continue;
      const secJoin = linkRow.sector_iaf || null;
      if (secJoin?.deleted_at) continue;
      const sectorId = String(linkRow.id_sector_iaf || secJoin?.id || '').trim();
      if (!sectorId || seenSectorIds.has(sectorId)) continue;
      const catalogMatch = sectoresCatalog.find((s) => s.id === sectorId);
      const secNumRaw = secJoin?.sector ?? catalogMatch?.sector ?? null;
      const secNum =
        secNumRaw !== null && secNumRaw !== undefined && !Number.isNaN(Number(secNumRaw))
          ? Number(secNumRaw)
          : 0;
      if (secNum <= 0) continue;
      seenSectorIds.add(sectorId);
      const secDescRaw =
        typeof secJoin?.descripcion === 'string' && secJoin.descripcion.trim()
          ? secJoin.descripcion.trim()
          : catalogMatch?.descripcion || resolveSectorIafDescription(secNum);
      linkedSectors.push({
        id: linkRow.id ? String(linkRow.id) : undefined,
        id_sector_iaf: sectorId,
        sector: secNum,
        descripcion: secDescRaw,
      });
    }
    linkedSectors.sort((a, b) => a.sector - b.sector);

    const entity: AcreditacionDetailEntity = {
      id,
      id_organismo: idOrganismo,
      organismo_codigo: String(orgJoin?.codigo || matchedOrg?.codigo || 'ORG'),
      organismo_nombre: String(
        orgJoin?.nombre || matchedOrg?.nombre || 'Organismo de Acreditación'
      ),
      organismo_pais: String(orgJoin?.pais || matchedOrg?.pais || 'Internacional'),
      organismo_sitio_web:
        orgJoin?.sitio_web !== undefined && orgJoin.sitio_web !== null
          ? String(orgJoin.sitio_web)
          : matchedOrg?.sitio_web ?? null,
      id_norma: idNorma,
      norma_codigo: String(
        normaJoin?.codigo || normaJoin?.norma || matchedNorma?.codigo || 'ISO'
      ),
      norma_titulo: String(
        normaJoin?.titulo || matchedNorma?.titulo || normaJoin?.esquema || 'Sistema de Gestión'
      ),
      id_estatus: resolvedIdEstatus,
      estatus: resolvedEstatusLabel,
      sectores: linkedSectors,
      sector_ids: linkedSectors.map((s) => s.id_sector_iaf),
      numero_acreditacion: String(row.numero_acreditacion || 'SIN-CODIGO'),
      fecha_concesion: String(row.fecha_concesion || ''),
      fecha_vencimiento:
        row.fecha_vencimiento !== undefined &&
        row.fecha_vencimiento !== null &&
        String(row.fecha_vencimiento).trim() !== ''
          ? String(row.fecha_vencimiento)
          : null,
      activeCertificatesCount: 0,
      deleted_at: null,
    };

    entity.activeCertificatesCount = computeActiveCertificatesCountForAccreditation(
      entity,
      certificates
    );
    result.push(entity);
  }

  return result;
}

/**
 * Builds the default fallback list of `AcreditacionDetailEntity[]` from the seeded catalogs.
 */
export function buildInitialAcreditacionEntities(
  certificates: ReadonlyArray<CertificateCoverageInput> = []
): AcreditacionDetailEntity[] {
  return INITIAL_ACREDITACIONES.map((acr) => {
    const org = INITIAL_ORGANISMOS.find((o) => o.id === acr.id_organismo);
    const norma = INITIAL_NORMAS.find((n) => n.id === acr.id_norma);
    const sectores: AcreditacionSectorLink[] = (acr.sectores || []).map((s) => ({
      id_sector_iaf: s.id_sector_iaf,
      sector: s.sector,
      descripcion: s.descripcion,
    }));

    const entity: AcreditacionDetailEntity = {
      id: acr.id,
      id_organismo: acr.id_organismo,
      organismo_codigo: acr.organismo_codigo,
      organismo_nombre: acr.organismo_nombre,
      organismo_pais: acr.organismo_pais,
      organismo_sitio_web: org?.sitio_web ?? null,
      id_norma: acr.id_norma,
      norma_codigo: acr.norma_codigo,
      norma_titulo: norma?.titulo ?? 'Sistema de Gestión',
      id_estatus: acr.id_estatus || DEFAULT_ACREDITACION_ESTATUS_ID,
      estatus: acr.estatus || 'Activo',
      sectores,
      sector_ids: sectores.map((s) => s.id_sector_iaf),
      numero_acreditacion: acr.numero_acreditacion,
      fecha_concesion: acr.fecha_concesion,
      fecha_vencimiento: acr.fecha_vencimiento ?? null,
      activeCertificatesCount: 0,
      deleted_at: null,
    };

    entity.activeCertificatesCount = computeActiveCertificatesCountForAccreditation(
      entity,
      certificates
    );
    return entity;
  });
}

/**
 * Converts an `AcreditacionDetailEntity` back to `AcreditacionNormaIaf`
 * so `Norma`, `Sector IAF`, and Dashboard views remain synchronized.
 */
export function toLegacyAcreditacionNormaIaf(
  entity: AcreditacionDetailEntity
): AcreditacionNormaIaf {
  return {
    id: entity.id,
    id_organismo: entity.id_organismo,
    organismo_codigo: entity.organismo_codigo,
    organismo_nombre: entity.organismo_nombre,
    organismo_pais: entity.organismo_pais,
    id_norma: entity.id_norma,
    norma_codigo: entity.norma_codigo,
    id_estatus: entity.id_estatus,
    estatus: entity.estatus,
    sectores: entity.sectores.map((s) => ({
      id_sector_iaf: s.id_sector_iaf,
      sector: s.sector,
      descripcion: s.descripcion,
    })),
    sector_ids: [...entity.sector_ids],
    numero_acreditacion: entity.numero_acreditacion,
    fecha_concesion: entity.fecha_concesion,
    fecha_vencimiento: entity.fecha_vencimiento ?? undefined,
  };
}
