/**
 * Phase 4.2: Multisite Sampling, Clean Layout Rules, and Certificado Relational Engine
 * Aligned with ISO/IEC 17021-1:2015 (clause 8.2.2), IAF MD 1:2018 (Multisite Audit), and ISO 19011:2018.
 */
import type { MultiViewSelectionMap, SortState } from './universalTemplate';
import type { AuditVersionResolutionItem } from './certificadoVersionDomain';

export type ShareableChildKind = 'contacto' | 'turno' | 'proceso' | 'sitio';

export interface CertificateShareLinkRef {
  linkId: string;
  targetCertId: string;
  targetNumeroCertificado?: string;
  targetOrganizacionNombre?: string;
  targetNormaCodigo?: string;
  numeroSitioAsignado?: number;
  sincronizar_requisitos?: boolean;
}

export interface AlcanceCertificadoSharedTargetRef {
  linkId: string;
  certId: string;
  numero_certificado: string;
}

export interface AlcanceCertificadoEntity {
  id: string;
  id_certificado: string;
  alcance_es: string;
  alcance_en: string | null;
  esCompartido: boolean;
  id_share_link?: string | null;
  origenCertificadoNumero?: string | null;
  sharedTargetCerts?: AlcanceCertificadoSharedTargetRef[];
  deleted_at?: string | null;
}

export interface CertificadoVersionEntity {
  id: string;
  id_certificado: string;
  id_organizacion_version: string;
  version_numero: number;
  es_version_actual: boolean;
  notas_version?: string | null;
  id_estatus: string;
  estatus: 'Activo' | 'Estudio' | 'Suspendido' | 'Cancelado' | string;
  id_sector_iaf: string;
  sector_iaf: number;
  sector_iaf_descripcion: string;
  id_subsector_iaf: string;
  subsector_iaf_codigo?: string;
  subsector_iaf_descripcion?: string;
  subsector_categoria_riesgo?: 'ALTO' | 'MEDIO' | 'BAJO';
  multisitio: boolean;
  deleted_at?: string | null;
}

export interface CertificadoVersionSnapshot extends CertificadoVersionEntity {
  organizacion_abreviacion?: string | null;
  sitios?: SiteEntity[];
  procesos?: ProcessEntity[];
  turnos?: ShiftEntity[];
  noAplicables?: NonApplicableRequirementEntity[];
  contactos?: ContactoCertificadoEntity[];
  fechas?: FechaCertificadoEntity[];
  cobertura?: CertificateCoberturaCache;
}

export interface ProcesoPorSitioLink {
  id: string;
  id_certificado?: string;
  id_certificado_version?: string;
  id_sitio: string;
  id_proceso: string;
  nombre_proceso: string;
  tipo_proceso: string;
  clausulas_cubiertas?: string[];
  requisitos_detalle?: ProcessRequirementMapping[];
  deleted_at?: string | null;
}

export interface TurnoPorSitioLink {
  id: string;
  id_sitio: string;
  id_turno: string;
  id_certificado_version?: string;
  hora_entrada: string;
  hora_salida: string;
  descripcion: string;
  deleted_at?: string | null;
}

export interface SiteEntity {
  id: string;
  id_certificado: string;
  id_certificado_version?: string;
  numero_sitio: number; // 0 = Headquarters / Sede Central, >= 1 = Sucursales / Plantas
  nombre_sitio: string;
  direccion_sitio: string;
  tipo_sitio?: 'Principal (HQ)' | 'Planta Operativa' | 'Sucursal' | 'Centro Logístico';
  personal_count?: number;
  actividades?: string;
  turnos_vinculados?: string[];
  turnos_por_sitio?: TurnoPorSitioLink[];
  procesos_por_sitio?: ProcesoPorSitioLink[];
  procesos_vinculados?: string[];
  ownerCertId?: string;
  sharedFromCertId?: string | null;
  sharedFromCertLabel?: string | null;
  sharedTargets?: CertificateShareLinkRef[];
}

export type ProcesoTipo = 'Estratégico' | 'Medular' | 'De Apoyo' | 'Otro';

export interface ProcessRequirementMapping {
  codigo: string;
  titulo: string;
}

export interface ProcessCertificateClausesEntry {
  clausulas_cubiertas: string[];
  requisitos_detalle?: ProcessRequirementMapping[];
  sincronizar_requisitos?: boolean;
}

export interface ProcessEntity {
  id: string;
  id_certificado: string;
  id_certificado_version?: string;
  nombre_proceso: string;
  tipo: ProcesoTipo;
  responsable?: string;
  clausulas_cubiertas: string[];
  requisitos_detalle?: ProcessRequirementMapping[];
  requisitos_by_certificado?: Record<string, ProcessCertificateClausesEntry>;
  ownerCertId?: string;
  sharedFromCertId?: string | null;
  sharedFromCertLabel?: string | null;
  sharedLinkSincronizarRequisitos?: boolean;
  sharedTargets?: CertificateShareLinkRef[];
}

export interface ShiftEntity {
  id: string;
  id_certificado_version?: string;
  hora_entrada: string;
  hora_salida: string;
  descripcion: string;
  empleados_activos?: number;
  sitios_vinculados: string[];
  ownerCertId?: string;
  sharedFromCertId?: string | null;
  sharedFromCertLabel?: string | null;
  sharedTargets?: CertificateShareLinkRef[];
}

export interface NonApplicableRequirementEntity {
  id: string;
  id_certificado: string;
  id_certificado_version?: string;
  id_requisito: string;
  requisito_codigo: string;
  requisito_titulo: string;
  ruta_materializada?: string;
  justificacion: string;
}

export interface AuditEntity {
  id: string;
  id_certificado: string;
  id_certificado_version?: string;
  codigo_auditoria: string;
  tipo_auditoria: string; // e.g. 'Renovación', 'Etapa 1', 'Etapa 2', 'Seguimiento 1'
  metodologia: 'Presencial' | 'Remota' | 'Mixta';
  fecha_programacion: string;
  auditor_lider: string;
  estatus: 'Planificada' | 'En Ejecución' | 'Completada' | 'Cerrada';
  sitios_alcance?: string[];
}

export type TipoFechaCertificado =
  | 'Otorgamiento'
  | 'Renovación'
  | 'Vencimiento'
  | 'Modificación'
  | 'Suspensión'
  | 'Cancelación'
  | 'Ultima Auditoría';

export const CANONICAL_TIPO_FECHA_VALUES: readonly TipoFechaCertificado[] = [
  'Otorgamiento',
  'Renovación',
  'Vencimiento',
  'Modificación',
  'Suspensión',
  'Cancelación',
  'Ultima Auditoría',
];

export interface TelefonoContactoEntity {
  id: string;
  id_contacto: string;
  telefono: string;
  tipo_telefono: string;
}

export interface EmailContactoEntity {
  id: string;
  id_contacto: string;
  email: string;
  tipo_email: string;
}

export interface FechaCertificadoEntity {
  id: string;
  id_certificado: string;
  id_certificado_version?: string;
  fecha: string; // YYYY-MM-DD
  tipo_fecha: TipoFechaCertificado | string;
}

export interface ContactoCertificadoEntity {
  id: string;
  id_certificado: string;
  id_certificado_version?: string;
  nombre: string;
  cargo: string | null;
  telefonos: TelefonoContactoEntity[];
  emails: EmailContactoEntity[];
  ownerCertId?: string;
  sharedFromCertId?: string | null;
  sharedFromCertLabel?: string | null;
  sharedTargets?: CertificateShareLinkRef[];
}

export interface CertificateCoberturaCache {
  total_obligatorios: number;
  cubiertos_por_proceso: number;
  excluidos_no_aplicables: number;
  pendientes: number;
  porcentaje_cobertura: number;
  cobertura_completa: boolean;
}

export interface CertificadoDetailEntity {
  id: string;
  numero_certificado: string;
  id_organizacion: string;
  id_organizacion_version?: string;
  organizacion_nombre: string;
  organizacion_abreviacion?: string;
  organizacion_rif: string;
  direccion_fiscal?: string;
  id_norma: string;
  norma_codigo: string;
  norma_titulo: string;
  esquema: string;
  id_certificado_version?: string;
  version_actual_numero?: number;
  selected_version_id?: string;
  versiones?: CertificadoVersionSnapshot[];
  id_estatus: string;
  estatus: 'Activo' | 'Estudio' | 'Suspendido' | 'Cancelado' | string;
  id_sector_iaf: string;
  sector_iaf: number;
  sector_iaf_descripcion: string;
  id_subsector_iaf: string;
  subsector_iaf_codigo?: string;
  subsector_iaf_descripcion?: string;
  subsector_categoria_riesgo?: 'ALTO' | 'MEDIO' | 'BAJO';
  organismo_acreditador_codigo?: string;
  organismo_acreditador_nombre?: string;
  numero_acreditacion?: string;
  fecha_emision: string;
  fecha_vencimiento: string;
  alcance: string;
  alcanceDetalle?: AlcanceCertificadoEntity | null;
  multisitio: boolean;
  sitios: SiteEntity[];
  procesos: ProcessEntity[];
  turnos: ShiftEntity[];
  noAplicables: NonApplicableRequirementEntity[];
  auditorias: AuditEntity[];
  fechas: FechaCertificadoEntity[];
  contactos: ContactoCertificadoEntity[];
  cobertura?: CertificateCoberturaCache;
  deleted_at?: string | null;
  sharedChildCounts?: Partial<Record<ShareableChildKind, number>>;
}

export type CertificadoChildTab =
  | 'alcance'
  | 'sitios'
  | 'procesos'
  | 'turnos'
  | 'no_aplicables'
  | 'auditorias'
  | 'fechas'
  | 'contactos';

export type CertificadoDetailMode = 'read' | 'add' | 'edit';

export interface CertificadoFormDraft {
  id_organizacion: string;
  id_organizacion_version?: string;
  id_norma: string;
  id_estatus: string;
  id_sector_iaf: string;
  id_subsector_iaf: string;
  numero_certificado: string;
  multisitio: boolean;
  notas_version?: string;
  alcance: string;
}

export type CertCoverageMapFilter =
  | 'PENDIENTE'
  | 'ALL_MANDATORY'
  | 'CUBIERTO'
  | 'NO_APLICABLE'
  | 'INFORMATIVA';

export interface CertificadoAuditResolutionModalState {
  isOpen: boolean;
  certId: string;
  sourceVersionId: string;
  targetVersionId: string;
  targetVersionNumero: number;
  sitioMap: Record<string, string>;
  procesoMap: Record<string, string>;
  items: AuditVersionResolutionItem[];
  submitting: boolean;
  errorMessage: string | null;
}

export interface CertificadoViewState {
  selectedCertId: string | null;
  selectedVersionId?: string | null;
  activeChildTab: CertificadoChildTab;
  query: string;
  selectedStandard: string;
  selectedStatus: string;
  selectedSectorIaf: string;
  viewMode: 'grid' | 'list';
  sortColumn: 'numero_certificado' | 'organizacion' | 'norma' | 'estatus' | 'vigencia' | 'sedes' | null;
  sortDirection: 'asc' | 'desc' | 'none';
  childSortState?: Partial<Record<CertificadoChildTab, SortState>>;
  isEditingAttributes: boolean;
  formDraft?: CertificadoFormDraft;
  editFormData?: {
    numero_certificado: string;
    multisitio: boolean;
    alcance: string;
  };
  editErrorMessage?: string | null;
  originatingOrganizacionId?: string | null;
  isSidebarOpen?: boolean;
  facetSelections?: MultiViewSelectionMap;
  isCreating?: boolean;
  createErrorMessage?: string | null;
  isCoverageMapOpen?: boolean;
  coverageMapFilter?: CertCoverageMapFilter | null;
  selectedPendingRequisitoId?: string | null;
  alcanceLangView?: 'es' | 'en' | 'bilingual';
  isEditingAlcance?: boolean;
  isCreatingAlcance?: boolean;
  alcanceDraft?: {
    alcance_es: string;
    alcance_en: string;
  };
  alcanceErrorMessage?: string | null;
  isCreatingVersion?: boolean;
  versionNotesDraft?: string | null;
  auditResolutionModal?: CertificadoAuditResolutionModalState | null;
}

/**
 * Read-only derived scope summary (`alcanceDetalle.alcance_es` preferred, falling back to flat `alcance`)
 * for search, badges, and legacy display consumers until Step 3.3 removes flat `alcance` rendering.
 */
export function getCertificadoAlcanceSummary(
  cert: Pick<CertificadoDetailEntity, 'alcance' | 'alcanceDetalle'>
): string {
  const fromEntity = (cert.alcanceDetalle?.alcance_es || '').trim();
  if (fromEntity) return fromEntity;
  return (cert.alcance || '').trim();
}

/**
 * Pure factory creating an empty CertificadoFormDraft for Add mode (`add`).
 */
export function createEmptyCertificadoFormDraft(): CertificadoFormDraft {
  return {
    id_organizacion: '',
    id_norma: '',
    id_estatus: '',
    id_sector_iaf: '',
    id_subsector_iaf: '',
    numero_certificado: '',
    multisitio: false,
    alcance: '',
  };
}

/**
 * Pure factory creating a CertificadoFormDraft populated from an existing CertificadoDetailEntity.
 */
export function createCertificadoFormDraftFromEntity(
  cert: CertificadoDetailEntity
): CertificadoFormDraft {
  return {
    id_organizacion: cert.id_organizacion || '',
    ...(cert.id_organizacion_version ? { id_organizacion_version: cert.id_organizacion_version } : {}),
    id_norma: cert.id_norma || '',
    id_estatus: cert.id_estatus || '',
    id_sector_iaf: cert.id_sector_iaf || '',
    id_subsector_iaf: cert.id_subsector_iaf || '',
    numero_certificado: cert.numero_certificado || '',
    multisitio: Boolean(cert.multisitio),
    alcance: getCertificadoAlcanceSummary(cert),
  };
}

export interface SectorIafCascadeItem {
  id: string;
  sector: number;
  descripcion: string;
}

export interface SubsectorIafCascadeItem {
  id: string;
  id_sector_iaf: string;
  sector_numero: number;
  codigo: string;
  descripcion: string;
  categoria_riesgo?: string;
}

export interface FilterSubsectoresBySectorIafParams<
  T extends SubsectorIafCascadeItem = SubsectorIafCascadeItem
> {
  sectorId: string;
  sectores: ReadonlyArray<SectorIafCascadeItem>;
  subsectores: ReadonlyArray<T>;
}

export interface ReconcileSubsectorSelectionParams<
  T extends SubsectorIafCascadeItem = SubsectorIafCascadeItem
> {
  nextSectorId: string;
  currentSubsectorId: string;
  sectores: ReadonlyArray<SectorIafCascadeItem>;
  subsectores: ReadonlyArray<T>;
}

function compareSubsectorCodigo(a: string, b: string): number {
  const partsA = (a || '').trim().split('.');
  const partsB = (b || '').trim().split('.');
  const maxLen = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < maxLen; i += 1) {
    const segA = partsA[i] ?? '';
    const segB = partsB[i] ?? '';
    const numA = Number(segA);
    const numB = Number(segB);
    if (segA !== '' && segB !== '' && Number.isFinite(numA) && Number.isFinite(numB)) {
      if (numA !== numB) return numA - numB;
    } else {
      const cmp = segA.localeCompare(segB, 'es', { numeric: true, sensitivity: 'base' });
      if (cmp !== 0) return cmp;
    }
  }

  return (a || '').localeCompare(b || '', 'es', { numeric: true, sensitivity: 'base' });
}

/**
 * Pure cascading filter (`id_sector_iaf` -> `id_subsector_iaf`):
 * - Returns `[]` when `sectorId` is empty so orphan subsectors are never shown.
 * - Matches by `sub.id_sector_iaf === sectorId` or shared `sub.sector_numero === matchedSector.sector`.
 * - Sorts deterministically by numeric/lexicographic code (`17.1`, `17.2`, ..., `17.10`).
 */
export function filterSubsectoresBySectorIaf<
  T extends SubsectorIafCascadeItem = SubsectorIafCascadeItem
>(params: FilterSubsectoresBySectorIafParams<T>): T[] {
  const cleanSectorId = (params.sectorId || '').trim();
  if (!cleanSectorId) {
    return [];
  }

  const matchedSector = params.sectores.find((s) => s.id === cleanSectorId);
  const filtered = params.subsectores.filter((sub) => {
    if (sub.id_sector_iaf === cleanSectorId) return true;
    if (matchedSector !== undefined && sub.sector_numero === matchedSector.sector) return true;
    return false;
  });

  return [...filtered].sort((a, b) => {
    const byCodigo = compareSubsectorCodigo(a.codigo, b.codigo);
    if (byCodigo !== 0) return byCodigo;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Reconciles `id_subsector_iaf` when `id_sector_iaf` changes:
 * preserves `currentSubsectorId` if it remains valid under `nextSectorId`,
 * otherwise resets to `''` to enforce a valid child selection.
 */
export function reconcileSubsectorSelectionOnSectorChange<
  T extends SubsectorIafCascadeItem = SubsectorIafCascadeItem
>(params: ReconcileSubsectorSelectionParams<T>): string {
  const cleanNextSectorId = (params.nextSectorId || '').trim();
  const cleanCurrentSubsectorId = (params.currentSubsectorId || '').trim();
  if (!cleanNextSectorId || !cleanCurrentSubsectorId) {
    return '';
  }

  const candidates = filterSubsectoresBySectorIaf({
    sectorId: cleanNextSectorId,
    sectores: params.sectores,
    subsectores: params.subsectores,
  });

  return candidates.some((sub) => sub.id === cleanCurrentSubsectorId)
    ? cleanCurrentSubsectorId
    : '';
}

export interface CertificadoFilterCriteria {
  query?: string;
  selectedStandard?: string;
  selectedStatus?: string;
  selectedSectorIaf?: string;
}

/**
 * Checks if a site represents the principal headquarters (Site 0).
 */
export function isPrincipalSite(site: { numero_sitio: number }): boolean {
  return site.numero_sitio === 0;
}

/**
 * Multisite branch count calculation:
 * Strictly counts branch locations where `numero_sitio > 0`,
 * explicitly excluding headquarters (`numero_sitio = 0`).
 */
export function countMultisiteBranches(sites: Array<{ numero_sitio: number }>): number {
  if (!Array.isArray(sites)) return 0;
  return sites.filter((s) => s.numero_sitio > 0).length;
}

/**
 * Formats the multisite branch count as human-readable text.
 */
export function formatMultisiteBranchCountText(branchCount: number): string {
  if (branchCount <= 0) {
    return '0 sedes multisitio';
  }
  if (branchCount === 1) {
    return '1 sede multisitio';
  }
  return `${branchCount} sedes multisitio`;
}

/**
 * Site 0 sorting algorithm:
 * Strictly positions headquarters (`numero_sitio = 0`) at index 0 (if present),
 * followed by subsidiary branch sites in ascending numerical order (`1, 2, 3...`).
 */
export function sortSitesWithPrincipalFirst<T extends { numero_sitio: number }>(sites: T[]): T[] {
  if (!Array.isArray(sites)) return [];
  return [...sites].sort((a, b) => {
    if (a.numero_sitio === 0 && b.numero_sitio !== 0) return -1;
    if (b.numero_sitio === 0 && a.numero_sitio !== 0) return 1;
    return a.numero_sitio - b.numero_sitio;
  });
}

/**
 * Validates the certification scope narrative (`alcance`):
 * Must be between 10 and 1000 characters.
 */
export function validateAlcance(alcance: string): {
  valid: boolean;
  length: number;
  min: number;
  max: number;
  error?: string;
} {
  const min = 10;
  const max = 1000;
  const trimmed = (alcance || '').trim();
  const length = trimmed.length;

  if (length < min) {
    return {
      valid: false,
      length,
      min,
      max,
      error: `El alcance de la certificación debe contener al menos ${min} caracteres (actual: ${length}).`,
    };
  }

  if (length > max) {
    return {
      valid: false,
      length,
      min,
      max,
      error: `El alcance no puede exceder los ${max} caracteres (actual: ${length}).`,
    };
  }

  return {
    valid: true,
    length,
    min,
    max,
  };
}

export interface ValidateCertificadoFormDraftParams {
  mode: CertificadoDetailMode;
  draft: CertificadoFormDraft;
  currentCertId?: string | null;
  existingCertificates: ReadonlyArray<{ id: string; numero_certificado: string }>;
  sectores: ReadonlyArray<SectorIafCascadeItem>;
  subsectores: ReadonlyArray<SubsectorIafCascadeItem>;
}

export interface CertificadoFormDraftValidationResult {
  valid: boolean;
  error?: string;
  normalized?: CertificadoFormDraft;
}

/**
 * Unified validator for `CertificadoFormDraft` supporting both Add (`add`) and Edit (`edit`) modes.
 */
export function validateCertificadoFormDraft(
  params: ValidateCertificadoFormDraftParams
): CertificadoFormDraftValidationResult {
  const cleanOrgVer = (params.draft.id_organizacion_version || '').trim();
  const cleanNotas = (params.draft.notas_version || '').trim();
  const normalized: CertificadoFormDraft = {
    id_organizacion: (params.draft.id_organizacion || '').trim(),
    ...(cleanOrgVer ? { id_organizacion_version: cleanOrgVer } : {}),
    id_norma: (params.draft.id_norma || '').trim(),
    id_estatus: (params.draft.id_estatus || '').trim(),
    id_sector_iaf: (params.draft.id_sector_iaf || '').trim(),
    id_subsector_iaf: (params.draft.id_subsector_iaf || '').trim(),
    numero_certificado: (params.draft.numero_certificado || '').trim(),
    multisitio: Boolean(params.draft.multisitio),
    ...(cleanNotas ? { notas_version: cleanNotas } : {}),
    alcance: (params.draft.alcance || '').trim(),
  };

  if (normalized.id_organizacion.length === 0) {
    return { valid: false, error: 'Debe seleccionar una Organización.' };
  }
  if (normalized.id_norma.length === 0) {
    return { valid: false, error: 'Debe seleccionar una Norma.' };
  }
  if (normalized.id_estatus.length === 0) {
    return { valid: false, error: 'Debe seleccionar un Estatus.' };
  }
  if (normalized.id_sector_iaf.length === 0) {
    return { valid: false, error: 'Debe seleccionar un Sector IAF.' };
  }
  if (normalized.id_subsector_iaf.length === 0) {
    return { valid: false, error: 'Debe seleccionar un Sub-Sector IAF.' };
  }

  const validSubsectores = filterSubsectoresBySectorIaf({
    sectorId: normalized.id_sector_iaf,
    sectores: params.sectores,
    subsectores: params.subsectores,
  });
  const subsectorBelongsToSector = validSubsectores.some(
    (sub) => sub.id === normalized.id_subsector_iaf
  );
  if (!subsectorBelongsToSector) {
    return {
      valid: false,
      error: 'El Sub-Sector IAF seleccionado no corresponde al Sector IAF elegido.',
    };
  }

  if (normalized.numero_certificado.length < 3 || normalized.numero_certificado.length > 100) {
    return {
      valid: false,
      error: 'El número de certificado debe tener entre 3 y 100 caracteres.',
    };
  }

  const duplicate = params.existingCertificates.some((c) => {
    if (params.mode === 'edit' && params.currentCertId && c.id === params.currentCertId) {
      return false;
    }
    return (
      (c.numero_certificado || '').trim().toLowerCase() ===
      normalized.numero_certificado.toLowerCase()
    );
  });
  if (duplicate) {
    return {
      valid: false,
      error: `Ya existe otro certificado registrado con el código "${normalized.numero_certificado}".`,
    };
  }

  return {
    valid: true,
    normalized,
  };
}

export interface CertificadoEditInputParams {
  certId: string;
  numero_certificado: string;
  multisitio: boolean;
  alcance: string;
  existingCertificates: ReadonlyArray<{ id: string; numero_certificado: string }>;
}

export interface CertificadoEditValidationResult {
  valid: boolean;
  error?: string;
  normalized?: {
    numero_certificado: string;
    multisitio: boolean;
    alcance: string;
  };
}

/**
 * Validates direct editable attributes of public.certificado (`numero_certificado`, `multisitio`, `alcance`).
 */
export function validateCertificadoEditInput(
  params: CertificadoEditInputParams
): CertificadoEditValidationResult {
  const numeroTrimmed = (params.numero_certificado || '').trim();
  if (numeroTrimmed.length < 3 || numeroTrimmed.length > 100) {
    return {
      valid: false,
      error: 'El número de certificado debe tener entre 3 y 100 caracteres.',
    };
  }

  const duplicate = params.existingCertificates.some(
    (c) =>
      c.id !== params.certId &&
      (c.numero_certificado || '').trim().toLowerCase() === numeroTrimmed.toLowerCase()
  );
  if (duplicate) {
    return {
      valid: false,
      error: `Ya existe otro certificado registrado con el código "${numeroTrimmed}".`,
    };
  }

  const alcanceCheck = validateAlcance(params.alcance);
  if (!alcanceCheck.valid) {
    return {
      valid: false,
      error: alcanceCheck.error || 'Alcance inválido.',
    };
  }

  return {
    valid: true,
    normalized: {
      numero_certificado: numeroTrimmed,
      multisitio: Boolean(params.multisitio),
      alcance: (params.alcance || '').trim(),
    },
  };
}

/**
 * Validates non-applicable requirement narrative justification:
 * Must be a non-empty descriptive justification explaining clause exclusion under ISO 9001 clause 4.3.
 */
export function validateJustificacionNoAplicable(justificacion: string): {
  valid: boolean;
  error?: string;
} {
  const trimmed = (justificacion || '').trim();
  if (trimmed.length < 5) {
    return {
      valid: false,
      error: 'La justificación técnica de no aplicabilidad es obligatoria y debe tener al menos 5 caracteres.',
    };
  }
  return { valid: true };
}

/**
 * Returns visual styles for process type badges.
 */
export function getProcessTypeVisual(tipo: ProcesoTipo | string): {
  label: string;
  badgeClass: string;
  borderClass: string;
  icon: string;
} {
  switch (tipo) {
    case 'Estratégico':
      return {
        label: 'Estratégico',
        badgeClass: 'bg-purple-50 text-purple-800 border-purple-200',
        borderClass: 'border-l-4 border-l-purple-500',
        icon: '🎯',
      };
    case 'Medular':
      return {
        label: 'Medular',
        badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
        borderClass: 'border-l-4 border-l-sky-500',
        icon: '⚙️',
      };
    case 'De Apoyo':
      return {
        label: 'De Apoyo',
        badgeClass: 'bg-teal-50 text-teal-800 border-teal-200',
        borderClass: 'border-l-4 border-l-teal-500',
        icon: '🛠️',
      };
    case 'Otro':
    default:
      return {
        label: 'Otro',
        badgeClass: 'bg-slate-50 text-slate-700 border-slate-200',
        borderClass: 'border-l-4 border-l-slate-400',
        icon: '📌',
      };
  }
}

/**
 * Filters certificate records according to multi-attribute query and facets.
 */
export function filterCertificates(
  certificates: CertificadoDetailEntity[],
  criteria: CertificadoFilterCriteria
): CertificadoDetailEntity[] {
  const { query, selectedStandard, selectedStatus, selectedSectorIaf } = criteria;
  const cleanQuery = (query || '').toLowerCase().trim();

  return certificates.filter((cert) => {
    // 1. Text Search across Certificate code, Company name, RIF, Scope, and Standard
    if (cleanQuery) {
      const matchCode = cert.numero_certificado.toLowerCase().includes(cleanQuery);
      const matchOrg = cert.organizacion_nombre.toLowerCase().includes(cleanQuery);
      const matchRif = cert.organizacion_rif.toLowerCase().replace(/[^a-z0-9]/g, '').includes(cleanQuery.replace(/[^a-z0-9]/g, ''));
      const matchNorma = cert.norma_codigo.toLowerCase().includes(cleanQuery);
      const scopeSummary = getCertificadoAlcanceSummary(cert).toLowerCase();
      const scopeEn = (cert.alcanceDetalle?.alcance_en || '').toLowerCase();
      const matchAlcance = scopeSummary.includes(cleanQuery) || scopeEn.includes(cleanQuery);

      if (!matchCode && !matchOrg && !matchRif && !matchNorma && !matchAlcance) {
        return false;
      }
    }

    // 2. Standard Filter
    if (selectedStandard && selectedStandard !== 'ALL') {
      if (cert.norma_codigo !== selectedStandard && cert.id_norma !== selectedStandard) {
        return false;
      }
    }

    // 3. Status Filter
    if (selectedStatus && selectedStatus !== 'ALL') {
      if (cert.estatus.toUpperCase() !== selectedStatus.toUpperCase()) {
        return false;
      }
    }

    // 4. Sector IAF Filter
    if (selectedSectorIaf && selectedSectorIaf !== 'ALL') {
      if (String(cert.sector_iaf) !== selectedSectorIaf && cert.id_sector_iaf !== selectedSectorIaf) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Returns semantic visual styling for certificate date event types.
 */
export function getFechaTipoVisual(tipoFecha: TipoFechaCertificado | string): {
  label: string;
  badgeClass: string;
} {
  switch (tipoFecha) {
    case 'Otorgamiento':
    case 'Renovación':
      return {
        label: tipoFecha,
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      };
    case 'Suspensión':
    case 'Modificación':
      return {
        label: tipoFecha,
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
      };
    case 'Cancelación':
      return {
        label: tipoFecha,
        badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
      };
    case 'Vencimiento':
      return {
        label: 'Vencimiento',
        badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
      };
    case 'Ultima Auditoría':
      return {
        label: 'Ultima Auditoría',
        badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
      };
    default:
      return {
        label: tipoFecha || 'Evento',
        badgeClass: 'bg-slate-50 text-slate-700 border-slate-200',
      };
  }
}

/**
 * Computes human-readable temporal reference for a certificate date relative to `referenceDate`.
 */
export function getFechaTemporalStatus(
  fechaStr: string,
  tipoFecha: TipoFechaCertificado | string,
  referenceDate: Date = new Date()
): {
  label: 'Vigente' | 'Próxima a vencer' | 'Vencida' | 'Programada' | 'Histórica';
  badgeClass: string;
} {
  const clean = (fechaStr || '').slice(0, 10);
  const parsedMs = Date.parse(`${clean}T00:00:00Z`);
  if (!Number.isFinite(parsedMs)) {
    return {
      label: 'Histórica',
      badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
    };
  }

  const refIso = referenceDate.toISOString().slice(0, 10);
  const todayMs = Date.parse(`${refIso}T00:00:00Z`);
  const diffDays = Math.round((parsedMs - todayMs) / (1000 * 60 * 60 * 24));

  if (tipoFecha === 'Vencimiento') {
    if (diffDays < 0) {
      return {
        label: 'Vencida',
        badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
      };
    }
    if (diffDays <= 90) {
      return {
        label: 'Próxima a vencer',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
      };
    }
    return {
      label: 'Vigente',
      badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    };
  }

  if (diffDays > 0) {
    return {
      label: 'Programada',
      badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
    };
  }

  if (tipoFecha === 'Otorgamiento' || tipoFecha === 'Renovación') {
    return {
      label: 'Vigente',
      badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    };
  }

  return {
    label: 'Histórica',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
  };
}

/**
 * Formats contact phone summary without exposing UUIDs.
 */
export function formatContactPhonesSummary(
  telefonos: ReadonlyArray<TelefonoContactoEntity>
): string {
  if (!Array.isArray(telefonos) || telefonos.length === 0) {
    return 'Sin teléfonos';
  }
  const primary = telefonos[0].telefono.trim();
  if (telefonos.length === 1) {
    return primary;
  }
  return `${primary} (+${telefonos.length - 1})`;
}

/**
 * Formats contact email summary without exposing UUIDs.
 */
export function formatContactEmailsSummary(
  emails: ReadonlyArray<EmailContactoEntity>
): string {
  if (!Array.isArray(emails) || emails.length === 0) {
    return 'Sin correos';
  }
  const primary = emails[0].email.trim();
  if (emails.length === 1) {
    return primary;
  }
  return `${primary} (+${emails.length - 1})`;
}

export interface DerivedCertificateVigencia {
  fecha_emision: string;
  fecha_vencimiento: string;
  fecha_otorgamiento_inicial: string | null;
  fecha_renovacion: string | null;
  fecha_ultima_auditoria: string | null;
  fecha_vigencia_inicio: string;
}

/**
 * Derives certificate emission & expiration dates from fecha_certificado rows when available.
 * When a triennial Renovación exists on or after Otorgamiento, fecha_emision / fecha_vigencia_inicio
 * advance to the current cycle start while preserving fecha_otorgamiento_inicial as historical origin.
 */
export function deriveCertificateVigenciaDates(
  fechas: ReadonlyArray<FechaCertificadoEntity>,
  fallbackEmision: string,
  fallbackVencimiento: string
): DerivedCertificateVigencia {
  if (!Array.isArray(fechas) || fechas.length === 0) {
    return {
      fecha_emision: fallbackEmision,
      fecha_vencimiento: fallbackVencimiento,
      fecha_otorgamiento_inicial: null,
      fecha_renovacion: null,
      fecha_ultima_auditoria: null,
      fecha_vigencia_inicio: fallbackEmision,
    };
  }

  const otorgamiento = fechas
    .filter((f) => f.tipo_fecha === 'Otorgamiento')
    .sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  const renovacion = fechas
    .filter((f) => f.tipo_fecha === 'Renovación')
    .sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  const ultimaAuditoria = fechas
    .filter((f) => f.tipo_fecha === 'Ultima Auditoría')
    .sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  const vencimiento = fechas
    .filter((f) => f.tipo_fecha === 'Vencimiento')
    .sort((a, b) => b.fecha.localeCompare(a.fecha))[0];

  const renovacionAfterOrEqualOtorgamiento =
    Boolean(renovacion) && (!otorgamiento || renovacion.fecha >= otorgamiento.fecha);
  const currentCycleStart = renovacionAfterOrEqualOtorgamiento
    ? renovacion.fecha
    : otorgamiento?.fecha || fallbackEmision;

  return {
    fecha_emision: currentCycleStart,
    fecha_vencimiento: vencimiento?.fecha || fallbackVencimiento,
    fecha_otorgamiento_inicial: otorgamiento?.fecha || null,
    fecha_renovacion: renovacion?.fecha || null,
    fecha_ultima_auditoria: ultimaAuditoria?.fecha || null,
    fecha_vigencia_inicio: currentCycleStart,
  };
}

/**
 * Canonical test dataset aligned with database seed in 06_datos_prueba.sql
 */
export const INITIAL_CERTIFICADOS_DETAILED: CertificadoDetailEntity[] = [
  {
    id: '40000000-0000-0000-0000-000000000001',
    numero_certificado: 'FN-QMS-2024-001',
    id_organizacion: '30000000-0000-0000-0000-000000000001',
    organizacion_nombre: 'Iberometal Componentes S.A.',
    organizacion_rif: 'J-30492817-0',
    direccion_fiscal: 'Av. Industrial 100, Zona Industrial Municipal Norte, Valencia, Edo. Carabobo 2001',
    id_norma: 'e0000000-0000-0000-0000-000000009001',
    norma_codigo: 'ISO 9001:2015',
    norma_titulo: 'Sistemas de Gestión de la Calidad — Requisitos',
    esquema: 'SGC - Calidad',
    id_estatus: 'a0000000-0000-0000-0000-000000000001',
    estatus: 'Activo',
    id_sector_iaf: 'd0000000-0000-0000-0000-000000000017',
    sector_iaf: 17,
    sector_iaf_descripcion: 'Metales básicos y productos metálicos elaborados',
    id_subsector_iaf: 'da000000-0000-0000-0000-000000000171',
    subsector_iaf_codigo: '17.1',
    subsector_iaf_descripcion: 'Fabricación de metales básicos, fundición y siderurgia',
    subsector_categoria_riesgo: 'ALTO',
    organismo_acreditador_codigo: 'ENAC',
    organismo_acreditador_nombre: 'Entidad Nacional de Acreditación',
    numero_acreditacion: '01/C-SC001',
    fecha_emision: '2024-03-15',
    fecha_vencimiento: '2027-03-14',
    alcance: 'Manufactura, estampado en frío/caliente, fundición de precisión, mecanizado de acabado y comercialización nacional de componentes metálicos troquelados para automoción y línea blanca (sin diseño de producto bajo plano del cliente).',
    multisitio: true,
    sitios: [
      {
        id: '50000000-0000-0000-0000-000000000000',
        id_certificado: '40000000-0000-0000-0000-000000000001',
        numero_sitio: 0,
        nombre_sitio: 'Sede Principal HQ',
        direccion_sitio: 'Av. Industrial 100, Valencia, Edo. Carabobo',
        tipo_sitio: 'Principal (HQ)',
        personal_count: 85,
        actividades: 'Dirección general, gestión de calidad, diseño técnico y administración central.',
        turnos_vinculados: ['Turno Matutino Operativo'],
        turnos_por_sitio: [
          {
            id: '71000000-0000-0000-0000-000000000000',
            id_sitio: '50000000-0000-0000-0000-000000000000',
            id_turno: '70000000-0000-0000-0000-000000000001',
            hora_entrada: '07:00:00',
            hora_salida: '15:00:00',
            descripcion: 'Turno Matutino Operativo',
            deleted_at: null,
          },
        ],
        procesos_vinculados: ['Dirección Estratégica y Calidad'],
        procesos_por_sitio: [
          {
            id: '61000000-0000-0000-0000-000000000001',
            id_sitio: '50000000-0000-0000-0000-000000000000',
            id_proceso: '60000000-0000-0000-0000-000000000002',
            nombre_proceso: 'Dirección Estratégica y Calidad',
            tipo_proceso: 'Estratégico',
            deleted_at: null,
          },
        ],
      },
      {
        id: '50000000-0000-0000-0000-000000000001',
        id_certificado: '40000000-0000-0000-0000-000000000001',
        numero_sitio: 1,
        nombre_sitio: 'Planta Valencia',
        direccion_sitio: 'Zona Industrial Carabobo, Galpón 4-B, Valencia',
        tipo_sitio: 'Planta Operativa',
        personal_count: 140,
        actividades: 'Operaciones de fundición continua, prensas hidráulicas, troquelado y control dimensional.',
        turnos_vinculados: ['Turno Matutino Operativo', 'Turno Vespertino / Nocturno'],
        turnos_por_sitio: [
          {
            id: '71000000-0000-0000-0000-000000000001',
            id_sitio: '50000000-0000-0000-0000-000000000001',
            id_turno: '70000000-0000-0000-0000-000000000001',
            hora_entrada: '07:00:00',
            hora_salida: '15:00:00',
            descripcion: 'Turno Matutino Operativo',
            deleted_at: null,
          },
          {
            id: '71000000-0000-0000-0000-000000000002',
            id_sitio: '50000000-0000-0000-0000-000000000001',
            id_turno: '70000000-0000-0000-0000-000000000002',
            hora_entrada: '15:00:00',
            hora_salida: '23:00:00',
            descripcion: 'Turno Vespertino / Nocturno',
            deleted_at: null,
          },
        ],
        procesos_vinculados: ['Troquelado y Fundición', 'Mantenimiento y Logística'],
        procesos_por_sitio: [
          {
            id: '61000000-0000-0000-0000-000000000002',
            id_sitio: '50000000-0000-0000-0000-000000000001',
            id_proceso: '60000000-0000-0000-0000-000000000001',
            nombre_proceso: 'Troquelado y Fundición',
            tipo_proceso: 'Medular',
            deleted_at: null,
          },
          {
            id: '61000000-0000-0000-0000-000000000003',
            id_sitio: '50000000-0000-0000-0000-000000000001',
            id_proceso: '60000000-0000-0000-0000-000000000003',
            nombre_proceso: 'Mantenimiento y Logística',
            tipo_proceso: 'De Apoyo',
            deleted_at: null,
          },
        ],
      },
    ],
    procesos: [
      {
        id: '60000000-0000-0000-0000-000000000001',
        id_certificado: '40000000-0000-0000-0000-000000000001',
        nombre_proceso: 'Troquelado y Fundición',
        tipo: 'Medular',
        responsable: 'Ing. Roberto Silva (Jefe de Planta)',
        clausulas_cubiertas: ['4.1', '8.5'],
        requisitos_detalle: [
          { codigo: '4.1', titulo: 'Comprensión de la organización y de su contexto' },
          { codigo: '8.5', titulo: 'Producción y provisión del servicio' },
        ],
      },
      {
        id: '60000000-0000-0000-0000-000000000002',
        id_certificado: '40000000-0000-0000-0000-000000000001',
        nombre_proceso: 'Dirección Estratégica y Calidad',
        tipo: 'Estratégico',
        responsable: 'Lic. Claudia Navas (Gerente General)',
        clausulas_cubiertas: ['4.2', '5.1'],
        requisitos_detalle: [
          { codigo: '4.2', titulo: 'Comprensión de las necesidades y expectativas de partes interesadas' },
          { codigo: '5.1', titulo: 'Liderazgo y compromiso' },
        ],
      },
      {
        id: '60000000-0000-0000-0000-000000000003',
        id_certificado: '40000000-0000-0000-0000-000000000001',
        nombre_proceso: 'Mantenimiento y Logística',
        tipo: 'De Apoyo',
        responsable: 'Téc. Fernando Ruiz (Coordinador de Soporte)',
        clausulas_cubiertas: ['8.5'],
        requisitos_detalle: [
          { codigo: '8.5', titulo: 'Producción y provisión del servicio' },
        ],
      },
    ],
    turnos: [
      {
        id: '70000000-0000-0000-0000-000000000001',
        hora_entrada: '07:00:00',
        hora_salida: '15:00:00',
        descripcion: 'Turno Matutino Operativo',
        empleados_activos: 110,
        sitios_vinculados: ['Sede Principal HQ', 'Planta Valencia'],
      },
      {
        id: '70000000-0000-0000-0000-000000000002',
        hora_entrada: '15:00:00',
        hora_salida: '23:00:00',
        descripcion: 'Turno Vespertino / Nocturno',
        empleados_activos: 85,
        sitios_vinculados: ['Planta Valencia'],
      },
    ],
    noAplicables: [
      {
        id: 'ea000000-0000-0000-0000-000000000001',
        id_certificado: '40000000-0000-0000-0000-000000000001',
        id_requisito: 'f0000000-0000-0000-0000-000000000083',
        requisito_codigo: '8.3',
        requisito_titulo: 'Diseño y desarrollo de los productos y servicios',
        justificacion: 'La organización no realiza diseño ni desarrollo de nuevos productos; la fabricación y estampado se ejecutan estrictamente bajo planos de ingeniería y especificaciones provistas por los clientes (exclusión justificada según ISO 9001 cláusula 4.3).',
      },
    ],
    auditorias: [
      {
        id: '80000000-0000-0000-0000-000000000001',
        id_certificado: '40000000-0000-0000-0000-000000000001',
        codigo_auditoria: 'AUD-2024-001',
        tipo_auditoria: 'Renovación',
        metodologia: 'Presencial',
        fecha_programacion: '2024-11-20',
        auditor_lider: 'Ing. Carlos Mendoza (Auditor Líder)',
        estatus: 'Planificada',
        sitios_alcance: ['Sede Principal HQ', 'Planta Valencia'],
      },
    ],
    fechas: [
      {
        id: '91000000-0000-0000-0000-000000000001',
        id_certificado: '40000000-0000-0000-0000-000000000001',
        fecha: '2021-03-15',
        tipo_fecha: 'Otorgamiento',
      },
      {
        id: '91000000-0000-0000-0000-000000000011',
        id_certificado: '40000000-0000-0000-0000-000000000001',
        fecha: '2024-03-15',
        tipo_fecha: 'Renovación',
      },
      {
        id: '91000000-0000-0000-0000-000000000002',
        id_certificado: '40000000-0000-0000-0000-000000000001',
        fecha: '2025-11-22',
        tipo_fecha: 'Ultima Auditoría',
      },
      {
        id: '91000000-0000-0000-0000-000000000003',
        id_certificado: '40000000-0000-0000-0000-000000000001',
        fecha: '2027-03-14',
        tipo_fecha: 'Vencimiento',
      },
    ],
    contactos: [
      {
        id: '92000000-0000-0000-0000-000000000001',
        id_certificado: '40000000-0000-0000-0000-000000000001',
        nombre: 'Ing. María Fernanda Rojas',
        cargo: 'Gerente de Aseguramiento de Calidad',
        telefonos: [
          {
            id: '93000000-0000-0000-0000-000000000001',
            id_contacto: '92000000-0000-0000-0000-000000000001',
            telefono: '+58 241 832-4100',
            tipo_telefono: 'Oficina',
          },
          {
            id: '93000000-0000-0000-0000-000000000002',
            id_contacto: '92000000-0000-0000-0000-000000000001',
            telefono: '+58 414 490-1122',
            tipo_telefono: 'Móvil',
          },
        ],
        emails: [
          {
            id: '94000000-0000-0000-0000-000000000001',
            id_contacto: '92000000-0000-0000-0000-000000000001',
            email: 'mrojas@iberometal.com',
            tipo_email: 'Trabajo',
          },
          {
            id: '94000000-0000-0000-0000-000000000002',
            id_contacto: '92000000-0000-0000-0000-000000000001',
            email: 'calidad@iberometal.com',
            tipo_email: 'Alternativo',
          },
        ],
      },
      {
        id: '92000000-0000-0000-0000-000000000002',
        id_certificado: '40000000-0000-0000-0000-000000000001',
        nombre: 'Lic. Alejandro Peña',
        cargo: 'Coordinador SGC',
        telefonos: [
          {
            id: '93000000-0000-0000-0000-000000000003',
            id_contacto: '92000000-0000-0000-0000-000000000002',
            telefono: '+58 241 832-4155',
            tipo_telefono: 'Directo',
          },
        ],
        emails: [
          {
            id: '94000000-0000-0000-0000-000000000003',
            id_contacto: '92000000-0000-0000-0000-000000000002',
            email: 'apena@iberometal.com',
            tipo_email: 'Trabajo',
          },
        ],
      },
    ],
  },
  {
    id: '40000000-0000-0000-0000-000000000002',
    numero_certificado: 'FN-EMS-2024-002',
    id_organizacion: '30000000-0000-0000-0000-000000000002',
    organizacion_nombre: 'CyberCloud Solutions S.L.',
    organizacion_rif: 'J-40819234-5',
    direccion_fiscal: 'Torre David, Piso 14, Chacao, Caracas',
    id_norma: 'e0000000-0000-0000-0000-000000014001',
    norma_codigo: 'ISO 14001:2015',
    norma_titulo: 'Sistemas de Gestión Ambiental — Requisitos con orientación para su uso',
    esquema: 'SGA - Gestión Ambiental',
    id_estatus: 'a0000000-0000-0000-0000-000000000002',
    estatus: 'Estudio',
    id_sector_iaf: 'd0000000-0000-0000-0000-000000000033',
    sector_iaf: 33,
    sector_iaf_descripcion: 'Tecnología de la información y comunicaciones',
    id_subsector_iaf: 'da000000-0000-0000-0000-000000000331',
    subsector_iaf_codigo: '33.1',
    subsector_iaf_descripcion: 'Servicios de tecnologías de información y desarrollo de software',
    subsector_categoria_riesgo: 'BAJO',
    organismo_acreditador_codigo: 'UKAS',
    organismo_acreditador_nombre: 'United Kingdom Accreditation Service',
    numero_acreditacion: '0044-EMS',
    fecha_emision: '2024-06-01',
    fecha_vencimiento: '2027-05-31',
    alcance: 'Prestación de servicios de computación en la nube, alojamiento gestionado de datos, ciberseguridad perimetral y soporte de centros de datos.',
    multisitio: false,
    sitios: [
      {
        id: '50000000-0000-0000-0000-000000000002',
        id_certificado: '40000000-0000-0000-0000-000000000002',
        numero_sitio: 0,
        nombre_sitio: 'Sede Principal (HQ)',
        direccion_sitio: 'Torre David, Piso 14, Chacao, Caracas',
        tipo_sitio: 'Principal (HQ)',
        personal_count: 55,
        actividades: 'Administración, gestión ambiental, desarrollo de software y soporte continuo.',
        turnos_vinculados: ['Turno Continuo 24/7'],
      },
    ],
    procesos: [
      {
        id: '60000000-0000-0000-0000-000000000004',
        id_certificado: '40000000-0000-0000-0000-000000000002',
        nombre_proceso: 'Gestión Energética de Centros de Datos',
        tipo: 'Medular',
        responsable: 'Ing. Elena Martínez',
        clausulas_cubiertas: ['6.1', '8.1'],
        requisitos_detalle: [
          { codigo: '6.1', titulo: 'Acciones para abordar riesgos y oportunidades' },
          { codigo: '8.1', titulo: 'Planificación y control operacional ambiental' },
        ],
      },
    ],
    turnos: [
      {
        id: '70000000-0000-0000-0000-000000000004',
        hora_entrada: '08:00:00',
        hora_salida: '17:00:00',
        descripcion: 'Turno Administrativo y Comercial',
        empleados_activos: 55,
        sitios_vinculados: ['Sede Principal (HQ)'],
      },
    ],
    noAplicables: [],
    auditorias: [
      {
        id: '80000000-0000-0000-0000-000000000002',
        id_certificado: '40000000-0000-0000-0000-000000000002',
        codigo_auditoria: 'AUD-2024-002',
        tipo_auditoria: 'Etapa 1',
        metodologia: 'Remota',
        fecha_programacion: '2024-05-10',
        auditor_lider: 'Ing. Carlos Mendoza (Auditor Líder)',
        estatus: 'Completada',
        sitios_alcance: ['Sede Principal (HQ)'],
      },
    ],
    fechas: [
      {
        id: '91000000-0000-0000-0000-000000000004',
        id_certificado: '40000000-0000-0000-0000-000000000002',
        fecha: '2024-06-01',
        tipo_fecha: 'Otorgamiento',
      },
      {
        id: '91000000-0000-0000-0000-000000000005',
        id_certificado: '40000000-0000-0000-0000-000000000002',
        fecha: '2027-05-31',
        tipo_fecha: 'Vencimiento',
      },
    ],
    contactos: [
      {
        id: '92000000-0000-0000-0000-000000000003',
        id_certificado: '40000000-0000-0000-0000-000000000002',
        nombre: 'Ing. Elena Martínez',
        cargo: 'Líder de Gestión Ambiental Cloud',
        telefonos: [
          {
            id: '93000000-0000-0000-0000-000000000004',
            id_contacto: '92000000-0000-0000-0000-000000000003',
            telefono: '+58 212 951-2200',
            tipo_telefono: 'Oficina',
          },
        ],
        emails: [
          {
            id: '94000000-0000-0000-0000-000000000004',
            id_contacto: '92000000-0000-0000-0000-000000000003',
            email: 'emartinez@cybercloud.io',
            tipo_email: 'Trabajo',
          },
        ],
      },
    ],
  },
  {
    id: '40000000-0000-0000-0000-000000000003',
    numero_certificado: 'FN-OHS-2023-018',
    id_organizacion: '30000000-0000-0000-0000-000000000003',
    organizacion_nombre: 'Petroquímica del Centro C.A.',
    organizacion_rif: 'J-00291834-1',
    direccion_fiscal: 'Complejo Petroquímico Morón, Carretera Nacional Morón-Coro, Edo. Carabobo',
    id_norma: 'e0000000-0000-0000-0000-000000045001',
    norma_codigo: 'ISO 45001:2018',
    norma_titulo: 'Sistemas de Gestión de la Seguridad y Salud en el Trabajo — Requisitos',
    esquema: 'SST - Seguridad y Salud Laboral',
    id_estatus: 'a0000000-0000-0000-0000-000000000003',
    estatus: 'Suspendido',
    id_sector_iaf: 'd0000000-0000-0000-0000-000000000014',
    sector_iaf: 14,
    sector_iaf_descripcion: 'Productos químicos, fibras sintéticas y farmacéuticos',
    id_subsector_iaf: 'da000000-0000-0000-0000-000000000141',
    subsector_iaf_codigo: '14.1',
    subsector_iaf_descripcion: 'Fabricación de sustancias químicas básicas y polímeros',
    subsector_categoria_riesgo: 'ALTO',
    organismo_acreditador_codigo: 'ENAC',
    organismo_acreditador_nombre: 'Entidad Nacional de Acreditación',
    numero_acreditacion: '01/C-SC001',
    fecha_emision: '2023-09-10',
    fecha_vencimiento: '2026-09-09',
    alcance: 'Refinación, síntesis química, almacenamiento y distribución de polímeros termoplásticos, fertilizantes nitrogenados y derivados petroquímicos.',
    multisitio: true,
    sitios: [
      {
        id: '50000000-0000-0000-0000-000000000003',
        id_certificado: '40000000-0000-0000-0000-000000000003',
        numero_sitio: 0,
        nombre_sitio: 'Sede Administrativa Morón (HQ)',
        direccion_sitio: 'Complejo Petroquímico Morón, Edificio Central, Edo. Carabobo',
        tipo_sitio: 'Principal (HQ)',
        personal_count: 120,
        actividades: 'Gestión ejecutiva, planeamiento de SST, compras y relaciones industriales.',
        turnos_vinculados: ['Turno Diurno'],
      },
      {
        id: '50000000-0000-0000-0000-000000000004',
        id_certificado: '40000000-0000-0000-0000-000000000003',
        numero_sitio: 1,
        nombre_sitio: 'Planta Polímeros',
        direccion_sitio: 'Complejo Petroquímico Morón, Módulo A-3',
        tipo_sitio: 'Planta Operativa',
        personal_count: 230,
        actividades: 'Polimerización, reactores catalíticos y empaque automatizado.',
        turnos_vinculados: ['Turno Rotativo 3x8'],
      },
      {
        id: '50000000-0000-0000-0000-000000000005',
        id_certificado: '40000000-0000-0000-0000-000000000003',
        numero_sitio: 2,
        nombre_sitio: 'Terminal Marítimo de Carga',
        direccion_sitio: 'Muelle Petroquímico Golfo Triste, Morón',
        tipo_sitio: 'Centro Logístico',
        personal_count: 65,
        actividades: 'Carga de buques tanques, despacho a granel y control de vertidos.',
        turnos_vinculados: ['Turno Rotativo 3x8'],
      },
    ],
    procesos: [
      {
        id: '60000000-0000-0000-0000-000000000005',
        id_certificado: '40000000-0000-0000-0000-000000000003',
        nombre_proceso: 'Prevención de Riesgos Mayores y Atmósferas Explosivas',
        tipo: 'Medular',
        responsable: 'Dra. Valentina Rivas',
        clausulas_cubiertas: ['6.1', '8.1', '8.2'],
        requisitos_detalle: [
          { codigo: '6.1', titulo: 'Acciones para determinar riesgos y oportunidades SST' },
          { codigo: '8.1', titulo: 'Control operacional y eliminación de peligros' },
          { codigo: '8.2', titulo: 'Preparación y respuesta ante emergencias' },
        ],
      },
    ],
    turnos: [
      {
        id: '70000000-0000-0000-0000-000000000005',
        hora_entrada: '06:00:00',
        hora_salida: '14:00:00',
        descripcion: 'Turno Temprano de Recepción y Despacho',
        empleados_activos: 140,
        sitios_vinculados: ['Planta Polímeros', 'Terminal Marítimo de Carga'],
      },
    ],
    noAplicables: [
      {
        id: 'ea000000-0000-0000-0000-000000000002',
        id_certificado: '40000000-0000-0000-0000-000000000003',
        id_requisito: 'f4500100-0000-0000-0000-000000000083',
        requisito_codigo: '8.3',
        requisito_titulo: 'Diseño y desarrollo de procesos petroquímicos propietarios',
        justificacion: 'Los procesos operan bajo licenciamiento tecnológico internacional cerrado; la corporación no realiza alteraciones de ingeniería ni diseño químico en sitio.',
      },
    ],
    auditorias: [
      {
        id: '80000000-0000-0000-0000-000000000003',
        id_certificado: '40000000-0000-0000-0000-000000000003',
        codigo_auditoria: 'AUD-2023-018',
        tipo_auditoria: 'Seguimiento 1',
        metodologia: 'Presencial',
        fecha_programacion: '2024-04-12',
        auditor_lider: 'Ing. Carlos Mendoza (Auditor Líder)',
        estatus: 'Cerrada',
        sitios_alcance: ['Planta Polímeros'],
      },
    ],
    fechas: [
      {
        id: '91000000-0000-0000-0000-000000000006',
        id_certificado: '40000000-0000-0000-0000-000000000003',
        fecha: '2023-09-10',
        tipo_fecha: 'Otorgamiento',
      },
      {
        id: '91000000-0000-0000-0000-000000000007',
        id_certificado: '40000000-0000-0000-0000-000000000003',
        fecha: '2024-06-18',
        tipo_fecha: 'Suspensión',
      },
      {
        id: '91000000-0000-0000-0000-000000000008',
        id_certificado: '40000000-0000-0000-0000-000000000003',
        fecha: '2026-09-09',
        tipo_fecha: 'Vencimiento',
      },
    ],
    contactos: [
      {
        id: '92000000-0000-0000-0000-000000000004',
        id_certificado: '40000000-0000-0000-0000-000000000003',
        nombre: 'Dra. Valentina Rivas',
        cargo: 'Superintendente SST',
        telefonos: [
          {
            id: '93000000-0000-0000-0000-000000000005',
            id_contacto: '92000000-0000-0000-0000-000000000004',
            telefono: '+58 242 372-8810',
            tipo_telefono: 'Oficina',
          },
        ],
        emails: [
          {
            id: '94000000-0000-0000-0000-000000000005',
            id_contacto: '92000000-0000-0000-0000-000000000004',
            email: 'vrivas@petrocentro.com',
            tipo_email: 'Trabajo',
          },
        ],
      },
    ],
  },
  {
    id: '40000000-0000-0000-0000-000000000004',
    numero_certificado: 'FN-ISMS-2024-007',
    id_organizacion: '30000000-0000-0000-0000-000000000002',
    organizacion_nombre: 'CyberCloud Solutions S.L.',
    organizacion_rif: 'J-40819234-5',
    direccion_fiscal: 'Torre David, Piso 14, Chacao, Caracas',
    id_norma: 'e0000000-0000-0000-0000-000000027001',
    norma_codigo: 'ISO/IEC 27001:2022',
    norma_titulo: 'Seguridad de la información, ciberseguridad y protección de la privacidad — Sistemas de gestión',
    esquema: 'SGSI - Seguridad de la Información',
    id_estatus: 'a0000000-0000-0000-0000-000000000001',
    estatus: 'Activo',
    id_sector_iaf: 'd0000000-0000-0000-0000-000000000033',
    sector_iaf: 33,
    sector_iaf_descripcion: 'Tecnología de la información y comunicaciones',
    id_subsector_iaf: 'da000000-0000-0000-0000-000000000331',
    subsector_iaf_codigo: '33.1',
    subsector_iaf_descripcion: 'Servicios de tecnologías de información y desarrollo de software',
    subsector_categoria_riesgo: 'BAJO',
    organismo_acreditador_codigo: 'ENAC',
    organismo_acreditador_nombre: 'Entidad Nacional de Acreditación',
    numero_acreditacion: '01/C-SC001',
    fecha_emision: '2024-01-20',
    fecha_vencimiento: '2027-01-19',
    alcance: 'Sistema de gestión de seguridad de la información que ampara la infraestructura cloud híbrida, soporte de operaciones SOC 24/7 y custodia de bases de datos.',
    multisitio: false,
    sitios: [
      {
        id: '50000000-0000-0000-0000-000000000006',
        id_certificado: '40000000-0000-0000-0000-000000000004',
        numero_sitio: 0,
        nombre_sitio: 'Sede Principal SOC (HQ)',
        direccion_sitio: 'Torre David, Piso 14, Chacao, Caracas',
        tipo_sitio: 'Principal (HQ)',
        personal_count: 60,
        actividades: 'Centro de Operaciones de Seguridad (SOC), administración de claves criptográficas y gestión de continuidad de negocio.',
        turnos_vinculados: ['Turno SOC 24/7 Rotativo'],
      },
    ],
    procesos: [
      {
        id: '60000000-0000-0000-0000-000000000006',
        id_certificado: '40000000-0000-0000-0000-000000000004',
        nombre_proceso: 'Gestión de Incidentes de Ciberseguridad y Cifrado',
        tipo: 'Medular',
        responsable: 'Ing. Alejandro Vegas (CISO)',
        clausulas_cubiertas: ['6.1.2', '8.2', '9.1'],
        requisitos_detalle: [
          { codigo: '6.1.2', titulo: 'Apreciación de riesgos de seguridad de la información' },
          { codigo: '8.2', titulo: 'Evaluación del riesgo de seguridad de la información' },
          { codigo: '9.1', titulo: 'Seguimiento, medición, análisis y evaluación' },
        ],
      },
    ],
    turnos: [
      {
        id: '70000000-0000-0000-0000-000000000003',
        hora_entrada: '23:00:00',
        hora_salida: '07:00:00',
        descripcion: 'Turno Nocturno Continuo',
        empleados_activos: 15,
        sitios_vinculados: ['Sede Principal SOC (HQ)'],
      },
    ],
    noAplicables: [
      {
        id: 'ea000000-0000-0000-0000-000000000003',
        id_certificado: '40000000-0000-0000-0000-000000000004',
        id_requisito: 'f2700100-0000-0000-0000-000000a11206',
        requisito_codigo: 'A.11.2.6',
        requisito_titulo: 'Seguridad del cableado fuera de las instalaciones',
        justificacion: 'Toda la infraestructura de telecomunicaciones física externa es operada por proveedores de telecomunicaciones bajo SLA de carrier de primer nivel; no existe tendido físico de cableado propio.',
      },
    ],
    auditorias: [
      {
        id: '80000000-0000-0000-0000-000000000004',
        id_certificado: '40000000-0000-0000-0000-000000000004',
        codigo_auditoria: 'AUD-2024-004',
        tipo_auditoria: 'Etapa 2',
        metodologia: 'Mixta',
        fecha_programacion: '2024-01-15',
        auditor_lider: 'Ing. Carlos Mendoza (Auditor Líder)',
        estatus: 'Cerrada',
        sitios_alcance: ['Sede Principal SOC (HQ)'],
      },
    ],
    fechas: [
      {
        id: '91000000-0000-0000-0000-000000000009',
        id_certificado: '40000000-0000-0000-0000-000000000004',
        fecha: '2024-01-20',
        tipo_fecha: 'Otorgamiento',
      },
      {
        id: '91000000-0000-0000-0000-000000000010',
        id_certificado: '40000000-0000-0000-0000-000000000004',
        fecha: '2027-01-19',
        tipo_fecha: 'Vencimiento',
      },
    ],
    contactos: [
      {
        id: '92000000-0000-0000-0000-000000000005',
        id_certificado: '40000000-0000-0000-0000-000000000004',
        nombre: 'Ing. Alejandro Vegas',
        cargo: 'CISO / Oficial de Seguridad',
        telefonos: [
          {
            id: '93000000-0000-0000-0000-000000000006',
            id_contacto: '92000000-0000-0000-0000-000000000005',
            telefono: '+58 412 210-7788',
            tipo_telefono: 'Móvil',
          },
        ],
        emails: [
          {
            id: '94000000-0000-0000-0000-000000000006',
            id_contacto: '92000000-0000-0000-0000-000000000005',
            email: 'avegas@cybercloud.io',
            tipo_email: 'Trabajo',
          },
        ],
      },
    ],
  },
];

/**
 * Step 1.2 Seed Parity: Remaining 7 curated CONG-IND-01 certificates
 * (Iberometal Componentes S.A.: 0002, 0010, 0008; Example, C.A.: 0004, 0005, 0006, 0009)
 * Kept separate from INITIAL_CERTIFICADOS_DETAILED so unit tests asserting the 4-card filter contract stay deterministic.
 */
export const INITIAL_CONG_IND_01_EXTRA_CERTIFICADOS_DETAILED: CertificadoDetailEntity[] = [
  {
    id: '40000000-0000-0000-0000-000000000002',
    numero_certificado: 'FN-EMS-2025-002',
    id_organizacion: '30000000-0000-0000-0000-000000000001',
    organizacion_nombre: 'Iberometal Componentes S.A.',
    organizacion_rif: 'J-30492817-0',
    direccion_fiscal: 'Av. Industrial 100, Zona Industrial Municipal Norte, Valencia, Edo. Carabobo 2001',
    id_norma: 'e0000000-0000-0000-0000-000000014001',
    norma_codigo: 'ISO 14001:2015',
    norma_titulo: 'Sistemas de Gestión Ambiental — Requisitos con orientación para su uso',
    esquema: 'SGA - Gestión Ambiental',
    id_estatus: 'a0000000-0000-0000-0000-000000000001',
    estatus: 'Activo',
    id_sector_iaf: 'd0000000-0000-0000-0000-000000000017',
    sector_iaf: 17,
    sector_iaf_descripcion: 'Metales básicos y productos metálicos elaborados',
    id_subsector_iaf: 'da000000-0000-0000-0000-000000000171',
    subsector_iaf_codigo: '17.1',
    subsector_iaf_descripcion: 'Fabricación de metales básicos, fundición y siderurgia',
    subsector_categoria_riesgo: 'ALTO',
    organismo_acreditador_codigo: 'ENAC',
    organismo_acreditador_nombre: 'Entidad Nacional de Acreditación',
    numero_acreditacion: '01/C-SC001',
    fecha_emision: '2025-05-10',
    fecha_vencimiento: '2028-05-09',
    alcance: 'Gestión ambiental de operaciones de fundición controlada, tratamiento térmico, acabado superficial, manejo de residuos ferrosos, efluentes industriales y almacenamiento de insumos químicos.',
    multisitio: true,
    sitios: [],
    procesos: [],
    turnos: [],
    noAplicables: [],
    auditorias: [],
    fechas: [
      { id: '91000000-0000-0000-0000-000000000012', id_certificado: '40000000-0000-0000-0000-000000000002', fecha: '2022-05-10', tipo_fecha: 'Otorgamiento' },
      { id: '91000000-0000-0000-0000-000000000013', id_certificado: '40000000-0000-0000-0000-000000000002', fecha: '2025-05-10', tipo_fecha: 'Renovación' },
      { id: '91000000-0000-0000-0000-000000000014', id_certificado: '40000000-0000-0000-0000-000000000002', fecha: '2025-04-18', tipo_fecha: 'Ultima Auditoría' },
      { id: '91000000-0000-0000-0000-000000000015', id_certificado: '40000000-0000-0000-0000-000000000002', fecha: '2028-05-09', tipo_fecha: 'Vencimiento' },
    ],
    contactos: [
      {
        id: '92000000-0000-0000-0000-000000000011',
        id_certificado: '40000000-0000-0000-0000-000000000002',
        nombre: 'Ing. Mariana Castellanos',
        cargo: 'Jefa de Gestión Ambiental',
        telefonos: [
          { id: '93000000-0000-0000-0000-000000000011', id_contacto: '92000000-0000-0000-0000-000000000011', telefono: '+58 241 832-4120', tipo_telefono: 'Oficina' },
          { id: '93000000-0000-0000-0000-000000000012', id_contacto: '92000000-0000-0000-0000-000000000011', telefono: '+58 414 491-2204', tipo_telefono: 'Móvil' },
        ],
        emails: [
          { id: '94000000-0000-0000-0000-000000000011', id_contacto: '92000000-0000-0000-0000-000000000011', email: 'mcastellanos@iberometal.com', tipo_email: 'Trabajo' },
          { id: '94000000-0000-0000-0000-000000000012', id_contacto: '92000000-0000-0000-0000-000000000011', email: 'ambiente@iberometal.com', tipo_email: 'Alternativo' },
        ],
      },
      {
        id: '92000000-0000-0000-0000-000000000012',
        id_certificado: '40000000-0000-0000-0000-000000000002',
        nombre: 'Téc. Luis Alberto Gómez',
        cargo: 'Supervisor de Efluentes y Residuos',
        telefonos: [
          { id: '93000000-0000-0000-0000-000000000013', id_contacto: '92000000-0000-0000-0000-000000000012', telefono: '+58 241 832-4128', tipo_telefono: 'Directo' },
        ],
        emails: [
          { id: '94000000-0000-0000-0000-000000000013', id_contacto: '92000000-0000-0000-0000-000000000012', email: 'lgomez@iberometal.com', tipo_email: 'Trabajo' },
        ],
      },
    ],
  },
  {
    id: '40000000-0000-0000-0000-000000000010',
    numero_certificado: 'FN-SST-2025-010',
    id_organizacion: '30000000-0000-0000-0000-000000000001',
    organizacion_nombre: 'Iberometal Componentes S.A.',
    organizacion_rif: 'J-30492817-0',
    direccion_fiscal: 'Av. Industrial 100, Zona Industrial Municipal Norte, Valencia, Edo. Carabobo 2001',
    id_norma: 'e0000000-0000-0000-0000-000000045001',
    norma_codigo: 'ISO 45001:2018',
    norma_titulo: 'Sistemas de Gestión de la Seguridad y Salud en el Trabajo — Requisitos',
    esquema: 'SST - Seguridad y Salud Laboral',
    id_estatus: 'a0000000-0000-0000-0000-000000000001',
    estatus: 'Activo',
    id_sector_iaf: 'd0000000-0000-0000-0000-000000000017',
    sector_iaf: 17,
    sector_iaf_descripcion: 'Metales básicos y productos metálicos elaborados',
    id_subsector_iaf: 'da000000-0000-0000-0000-000000000171',
    subsector_iaf_codigo: '17.1',
    subsector_iaf_descripcion: 'Fabricación de metales básicos, fundición y siderurgia',
    subsector_categoria_riesgo: 'ALTO',
    organismo_acreditador_codigo: 'ENAC',
    organismo_acreditador_nombre: 'Entidad Nacional de Acreditación',
    numero_acreditacion: '01/C-SC001',
    fecha_emision: '2025-05-12',
    fecha_vencimiento: '2028-05-11',
    alcance: 'Gestión de seguridad y salud en el trabajo en líneas de prensado hidráulico, fundición de aleaciones, izaje de cargas, mantenimiento eléctrico/mecánico y despacho industrial.',
    multisitio: true,
    sitios: [],
    procesos: [],
    turnos: [],
    noAplicables: [],
    auditorias: [],
    fechas: [
      { id: '91000000-0000-0000-0000-000000000016', id_certificado: '40000000-0000-0000-0000-000000000010', fecha: '2025-05-12', tipo_fecha: 'Otorgamiento' },
      { id: '91000000-0000-0000-0000-000000000017', id_certificado: '40000000-0000-0000-0000-000000000010', fecha: '2025-04-18', tipo_fecha: 'Ultima Auditoría' },
      { id: '91000000-0000-0000-0000-000000000018', id_certificado: '40000000-0000-0000-0000-000000000010', fecha: '2028-05-11', tipo_fecha: 'Vencimiento' },
    ],
    contactos: [
      {
        id: '92000000-0000-0000-0000-000000000013',
        id_certificado: '40000000-0000-0000-0000-000000000010',
        nombre: 'Ing. Héctor Zambrano',
        cargo: 'Gerente SSL',
        telefonos: [
          { id: '93000000-0000-0000-0000-000000000014', id_contacto: '92000000-0000-0000-0000-000000000013', telefono: '+58 241 832-4140', tipo_telefono: 'Oficina' },
          { id: '93000000-0000-0000-0000-000000000015', id_contacto: '92000000-0000-0000-0000-000000000013', telefono: '+58 412 880-3310', tipo_telefono: 'Móvil' },
        ],
        emails: [
          { id: '94000000-0000-0000-0000-000000000014', id_contacto: '92000000-0000-0000-0000-000000000013', email: 'hzambrano@iberometal.com', tipo_email: 'Trabajo' },
          { id: '94000000-0000-0000-0000-000000000015', id_contacto: '92000000-0000-0000-0000-000000000013', email: 'ssl@iberometal.com', tipo_email: 'Alternativo' },
        ],
      },
      {
        id: '92000000-0000-0000-0000-000000000014',
        id_certificado: '40000000-0000-0000-0000-000000000010',
        nombre: 'Dra. Sofía Navarro',
        cargo: 'Médico Ocupacional',
        telefonos: [
          { id: '93000000-0000-0000-0000-000000000016', id_contacto: '92000000-0000-0000-0000-000000000014', telefono: '+58 241 832-4149', tipo_telefono: 'Directo' },
        ],
        emails: [
          { id: '94000000-0000-0000-0000-000000000016', id_contacto: '92000000-0000-0000-0000-000000000014', email: 'snavarro@iberometal.com', tipo_email: 'Trabajo' },
        ],
      },
    ],
  },
  {
    id: '40000000-0000-0000-0000-000000000008',
    numero_certificado: 'FN-QMS-2026-008',
    id_organizacion: '30000000-0000-0000-0000-000000000001',
    organizacion_nombre: 'Iberometal Componentes S.A.',
    organizacion_rif: 'J-30492817-0',
    direccion_fiscal: 'Av. Industrial 100, Zona Industrial Municipal Norte, Valencia, Edo. Carabobo 2001',
    id_norma: 'e0000000-0000-0000-0000-000000009001',
    norma_codigo: 'ISO 9001:2015',
    norma_titulo: 'Sistemas de Gestión de la Calidad — Requisitos',
    esquema: 'SGC - Calidad',
    id_estatus: 'a0000000-0000-0000-0000-000000000002',
    estatus: 'Estudio',
    id_sector_iaf: 'd0000000-0000-0000-0000-000000000017',
    sector_iaf: 17,
    sector_iaf_descripcion: 'Metales básicos y productos metálicos elaborados',
    id_subsector_iaf: 'da000000-0000-0000-0000-000000000172',
    subsector_iaf_codigo: '17.2',
    subsector_iaf_descripcion: 'Fabricación de productos metálicos estructurales y maquinados',
    subsector_categoria_riesgo: 'MEDIO',
    organismo_acreditador_codigo: 'ENAC',
    organismo_acreditador_nombre: 'Entidad Nacional de Acreditación',
    numero_acreditacion: '01/C-SC001',
    fecha_emision: 'Pendiente',
    fecha_vencimiento: 'En Estudio',
    alcance: 'Mecanizado CNC de alta precisión y tratamientos superficiales especiales para línea experimental de exportación en evaluación inicial previa a certificación.',
    multisitio: false,
    sitios: [],
    procesos: [],
    turnos: [],
    noAplicables: [],
    auditorias: [],
    fechas: [
      { id: '91000000-0000-0000-0000-000000000019', id_certificado: '40000000-0000-0000-0000-000000000008', fecha: '2026-02-01', tipo_fecha: 'Modificación' },
    ],
    contactos: [
      {
        id: '92000000-0000-0000-0000-000000000015',
        id_certificado: '40000000-0000-0000-0000-000000000008',
        nombre: 'Ing. Ricardo Villalobos',
        cargo: 'Líder de Proyecto CNC',
        telefonos: [
          { id: '93000000-0000-0000-0000-000000000017', id_contacto: '92000000-0000-0000-0000-000000000015', telefono: '+58 241 832-4170', tipo_telefono: 'Oficina' },
          { id: '93000000-0000-0000-0000-000000000018', id_contacto: '92000000-0000-0000-0000-000000000015', telefono: '+58 414 495-8820', tipo_telefono: 'Móvil' },
        ],
        emails: [
          { id: '94000000-0000-0000-0000-000000000017', id_contacto: '92000000-0000-0000-0000-000000000015', email: 'rvillalobos@iberometal.com', tipo_email: 'Trabajo' },
          { id: '94000000-0000-0000-0000-000000000018', id_contacto: '92000000-0000-0000-0000-000000000015', email: 'cnc-export@iberometal.com', tipo_email: 'Alternativo' },
        ],
      },
    ],
  },
  {
    id: '40000000-0000-0000-0000-000000000004',
    numero_certificado: 'FN-QMS-2025-004',
    id_organizacion: '30000000-0000-0000-0000-000000000003',
    organizacion_nombre: 'Example, C.A.',
    organizacion_rif: 'J-50112233-4',
    direccion_fiscal: 'Zona Industrial Santa Cruz, Parcela 12, Carretera Nacional Cagua–Santa Cruz, Edo. Aragua 2123',
    id_norma: 'e0000000-0000-0000-0000-000000009001',
    norma_codigo: 'ISO 9001:2015',
    norma_titulo: 'Sistemas de Gestión de la Calidad — Requisitos',
    esquema: 'SGC - Calidad',
    id_estatus: 'a0000000-0000-0000-0000-000000000001',
    estatus: 'Activo',
    id_sector_iaf: 'd0000000-0000-0000-0000-000000000017',
    sector_iaf: 17,
    sector_iaf_descripcion: 'Metales básicos y productos metálicos elaborados',
    id_subsector_iaf: 'da000000-0000-0000-0000-000000000172',
    subsector_iaf_codigo: '17.2',
    subsector_iaf_descripcion: 'Fabricación de productos metálicos estructurales y maquinados',
    subsector_categoria_riesgo: 'MEDIO',
    organismo_acreditador_codigo: 'ENAC',
    organismo_acreditador_nombre: 'Entidad Nacional de Acreditación',
    numero_acreditacion: '01/C-SC001',
    fecha_emision: '2025-06-20',
    fecha_vencimiento: '2028-06-19',
    alcance: 'Diseño de ingeniería de detalle, fabricación de estructuras metálicas pesadas, calderería, soldadura certificada, recubrimiento anticorrosivo y comercialización industrial.',
    multisitio: true,
    sitios: [],
    procesos: [],
    turnos: [],
    noAplicables: [],
    auditorias: [],
    fechas: [
      { id: '91000000-0000-0000-0000-000000000020', id_certificado: '40000000-0000-0000-0000-000000000004', fecha: '2022-06-20', tipo_fecha: 'Otorgamiento' },
      { id: '91000000-0000-0000-0000-000000000021', id_certificado: '40000000-0000-0000-0000-000000000004', fecha: '2025-06-20', tipo_fecha: 'Renovación' },
      { id: '91000000-0000-0000-0000-000000000022', id_certificado: '40000000-0000-0000-0000-000000000004', fecha: '2025-12-07', tipo_fecha: 'Ultima Auditoría' },
      { id: '91000000-0000-0000-0000-000000000023', id_certificado: '40000000-0000-0000-0000-000000000004', fecha: '2028-06-19', tipo_fecha: 'Vencimiento' },
    ],
    contactos: [
      {
        id: '92000000-0000-0000-0000-000000000016',
        id_certificado: '40000000-0000-0000-0000-000000000004',
        nombre: 'Ing. Beatriz Morales',
        cargo: 'Directora de Calidad y Procesos',
        telefonos: [
          { id: '93000000-0000-0000-0000-000000000019', id_contacto: '92000000-0000-0000-0000-000000000016', telefono: '+58 244 415-3100', tipo_telefono: 'Oficina' },
          { id: '93000000-0000-0000-0000-000000000020', id_contacto: '92000000-0000-0000-0000-000000000016', telefono: '+58 414 345-6100', tipo_telefono: 'Móvil' },
        ],
        emails: [
          { id: '94000000-0000-0000-0000-000000000019', id_contacto: '92000000-0000-0000-0000-000000000016', email: 'bmorales@example-industrial.com', tipo_email: 'Trabajo' },
          { id: '94000000-0000-0000-0000-000000000020', id_contacto: '92000000-0000-0000-0000-000000000016', email: 'calidad@example-industrial.com', tipo_email: 'Alternativo' },
        ],
      },
      {
        id: '92000000-0000-0000-0000-000000000017',
        id_certificado: '40000000-0000-0000-0000-000000000004',
        nombre: 'Ing. Gabriel Tovar',
        cargo: 'Coordinador de Control Dimensional',
        telefonos: [
          { id: '93000000-0000-0000-0000-000000000021', id_contacto: '92000000-0000-0000-0000-000000000017', telefono: '+58 244 415-3115', tipo_telefono: 'Directo' },
        ],
        emails: [
          { id: '94000000-0000-0000-0000-000000000021', id_contacto: '92000000-0000-0000-0000-000000000017', email: 'gtovar@example-industrial.com', tipo_email: 'Trabajo' },
        ],
      },
    ],
  },
  {
    id: '40000000-0000-0000-0000-000000000005',
    numero_certificado: 'FN-EMS-2025-005',
    id_organizacion: '30000000-0000-0000-0000-000000000003',
    organizacion_nombre: 'Example, C.A.',
    organizacion_rif: 'J-50112233-4',
    direccion_fiscal: 'Zona Industrial Santa Cruz, Parcela 12, Carretera Nacional Cagua–Santa Cruz, Edo. Aragua 2123',
    id_norma: 'e0000000-0000-0000-0000-000000014001',
    norma_codigo: 'ISO 14001:2015',
    norma_titulo: 'Sistemas de Gestión Ambiental — Requisitos con orientación para su uso',
    esquema: 'SGA - Gestión Ambiental',
    id_estatus: 'a0000000-0000-0000-0000-000000000001',
    estatus: 'Activo',
    id_sector_iaf: 'd0000000-0000-0000-0000-000000000017',
    sector_iaf: 17,
    sector_iaf_descripcion: 'Metales básicos y productos metálicos elaborados',
    id_subsector_iaf: 'da000000-0000-0000-0000-000000000172',
    subsector_iaf_codigo: '17.2',
    subsector_iaf_descripcion: 'Fabricación de productos metálicos estructurales y maquinados',
    subsector_categoria_riesgo: 'MEDIO',
    organismo_acreditador_codigo: 'ENAC',
    organismo_acreditador_nombre: 'Entidad Nacional de Acreditación',
    numero_acreditacion: '01/C-SC001',
    fecha_emision: '2025-06-20',
    fecha_vencimiento: '2028-06-19',
    alcance: 'Gestión ambiental de fabricación estructural, granallado, cabinas de pintura industrial, control de emisiones atmosféricas y gestión integral de residuos peligrosos.',
    multisitio: true,
    sitios: [],
    procesos: [],
    turnos: [],
    noAplicables: [],
    auditorias: [],
    fechas: [
      { id: '91000000-0000-0000-0000-000000000024', id_certificado: '40000000-0000-0000-0000-000000000005', fecha: '2025-06-20', tipo_fecha: 'Otorgamiento' },
      { id: '91000000-0000-0000-0000-000000000025', id_certificado: '40000000-0000-0000-0000-000000000005', fecha: '2025-12-07', tipo_fecha: 'Ultima Auditoría' },
      { id: '91000000-0000-0000-0000-000000000026', id_certificado: '40000000-0000-0000-0000-000000000005', fecha: '2028-06-19', tipo_fecha: 'Vencimiento' },
    ],
    contactos: [
      {
        id: '92000000-0000-0000-0000-000000000018',
        id_certificado: '40000000-0000-0000-0000-000000000005',
        nombre: 'Ing. Beatriz Morales',
        cargo: 'Directora HSEQ',
        telefonos: [
          { id: '93000000-0000-0000-0000-000000000022', id_contacto: '92000000-0000-0000-0000-000000000018', telefono: '+58 244 415-3100', tipo_telefono: 'Oficina' },
        ],
        emails: [
          { id: '94000000-0000-0000-0000-000000000022', id_contacto: '92000000-0000-0000-0000-000000000018', email: 'bmorales@example-industrial.com', tipo_email: 'Trabajo' },
          { id: '94000000-0000-0000-0000-000000000023', id_contacto: '92000000-0000-0000-0000-000000000018', email: 'hseq@example-industrial.com', tipo_email: 'Alternativo' },
        ],
      },
      {
        id: '92000000-0000-0000-0000-000000000019',
        id_certificado: '40000000-0000-0000-0000-000000000005',
        nombre: 'Téc. Paola Jiménez',
        cargo: 'Analista Ambiental',
        telefonos: [
          { id: '93000000-0000-0000-0000-000000000023', id_contacto: '92000000-0000-0000-0000-000000000019', telefono: '+58 244 415-3142', tipo_telefono: 'Directo' },
          { id: '93000000-0000-0000-0000-000000000024', id_contacto: '92000000-0000-0000-0000-000000000019', telefono: '+58 412 764-1190', tipo_telefono: 'Móvil' },
        ],
        emails: [
          { id: '94000000-0000-0000-0000-000000000024', id_contacto: '92000000-0000-0000-0000-000000000019', email: 'pjimenez@example-industrial.com', tipo_email: 'Trabajo' },
        ],
      },
    ],
  },
  {
    id: '40000000-0000-0000-0000-000000000006',
    numero_certificado: 'FN-SST-2026-006',
    id_organizacion: '30000000-0000-0000-0000-000000000003',
    organizacion_nombre: 'Example, C.A.',
    organizacion_rif: 'J-50112233-4',
    direccion_fiscal: 'Zona Industrial Santa Cruz, Parcela 12, Carretera Nacional Cagua–Santa Cruz, Edo. Aragua 2123',
    id_norma: 'e0000000-0000-0000-0000-000000045001',
    norma_codigo: 'ISO 45001:2018',
    norma_titulo: 'Sistemas de Gestión de la Seguridad y Salud en el Trabajo — Requisitos',
    esquema: 'SST - Seguridad y Salud Laboral',
    id_estatus: 'a0000000-0000-0000-0000-000000000001',
    estatus: 'Activo',
    id_sector_iaf: 'd0000000-0000-0000-0000-000000000017',
    sector_iaf: 17,
    sector_iaf_descripcion: 'Metales básicos y productos metálicos elaborados',
    id_subsector_iaf: 'da000000-0000-0000-0000-000000000172',
    subsector_iaf_codigo: '17.2',
    subsector_iaf_descripcion: 'Fabricación de productos metálicos estructurales y maquinados',
    subsector_categoria_riesgo: 'MEDIO',
    organismo_acreditador_codigo: 'ENAC',
    organismo_acreditador_nombre: 'Entidad Nacional de Acreditación',
    numero_acreditacion: '01/C-SC001',
    fecha_emision: '2026-01-15',
    fecha_vencimiento: '2029-01-14',
    alcance: 'Gestión de seguridad y salud laboral en trabajos en altura, soldadura, corte térmico y operación de puentes grúa en Planta Santa Cruz.',
    multisitio: false,
    sitios: [],
    procesos: [],
    turnos: [],
    noAplicables: [],
    auditorias: [],
    fechas: [
      { id: '91000000-0000-0000-0000-000000000027', id_certificado: '40000000-0000-0000-0000-000000000006', fecha: '2026-01-15', tipo_fecha: 'Otorgamiento' },
      { id: '91000000-0000-0000-0000-000000000028', id_certificado: '40000000-0000-0000-0000-000000000006', fecha: '2025-12-10', tipo_fecha: 'Ultima Auditoría' },
      { id: '91000000-0000-0000-0000-000000000029', id_certificado: '40000000-0000-0000-0000-000000000006', fecha: '2029-01-14', tipo_fecha: 'Vencimiento' },
    ],
    contactos: [
      {
        id: '92000000-0000-0000-0000-000000000020',
        id_certificado: '40000000-0000-0000-0000-000000000006',
        nombre: 'Ing. Oscar Paredes',
        cargo: 'Coordinador Corporativo SST',
        telefonos: [
          { id: '93000000-0000-0000-0000-000000000025', id_contacto: '92000000-0000-0000-0000-000000000020', telefono: '+58 244 415-3155', tipo_telefono: 'Oficina' },
          { id: '93000000-0000-0000-0000-000000000026', id_contacto: '92000000-0000-0000-0000-000000000020', telefono: '+58 424 310-7745', tipo_telefono: 'Móvil' },
        ],
        emails: [
          { id: '94000000-0000-0000-0000-000000000025', id_contacto: '92000000-0000-0000-0000-000000000020', email: 'oparedes@example-industrial.com', tipo_email: 'Trabajo' },
          { id: '94000000-0000-0000-0000-000000000026', id_contacto: '92000000-0000-0000-0000-000000000020', email: 'sst@example-industrial.com', tipo_email: 'Alternativo' },
        ],
      },
    ],
  },
  {
    id: '40000000-0000-0000-0000-000000000009',
    numero_certificado: 'FN-QMS-2026-009',
    id_organizacion: '30000000-0000-0000-0000-000000000003',
    organizacion_nombre: 'Example, C.A.',
    organizacion_rif: 'J-50112233-4',
    direccion_fiscal: 'Zona Industrial Santa Cruz, Parcela 12, Carretera Nacional Cagua–Santa Cruz, Edo. Aragua 2123',
    id_norma: 'e0000000-0000-0000-0000-000000009001',
    norma_codigo: 'ISO 9001:2015',
    norma_titulo: 'Sistemas de Gestión de la Calidad — Requisitos',
    esquema: 'SGC - Calidad',
    id_estatus: 'a0000000-0000-0000-0000-000000000001',
    estatus: 'Activo',
    id_sector_iaf: 'd0000000-0000-0000-0000-000000000017',
    sector_iaf: 17,
    sector_iaf_descripcion: 'Metales básicos y productos metálicos elaborados',
    id_subsector_iaf: 'da000000-0000-0000-0000-000000000172',
    subsector_iaf_codigo: '17.2',
    subsector_iaf_descripcion: 'Fabricación de productos metálicos estructurales y maquinados',
    subsector_categoria_riesgo: 'MEDIO',
    organismo_acreditador_codigo: 'ENAC',
    organismo_acreditador_nombre: 'Entidad Nacional de Acreditación',
    numero_acreditacion: '01/C-SC001',
    fecha_emision: '2026-02-10',
    fecha_vencimiento: '2029-02-09',
    alcance: 'Operaciones logísticas integradas, recepción, inspección en tránsito, consolidación de carga y despacho de estructuras y piezas metálicas para proyectos industriales.',
    multisitio: false,
    sitios: [],
    procesos: [],
    turnos: [],
    noAplicables: [],
    auditorias: [],
    fechas: [
      { id: '91000000-0000-0000-0000-000000000030', id_certificado: '40000000-0000-0000-0000-000000000009', fecha: '2026-02-10', tipo_fecha: 'Otorgamiento' },
      { id: '91000000-0000-0000-0000-000000000031', id_certificado: '40000000-0000-0000-0000-000000000009', fecha: '2026-01-22', tipo_fecha: 'Ultima Auditoría' },
      { id: '91000000-0000-0000-0000-000000000032', id_certificado: '40000000-0000-0000-0000-000000000009', fecha: '2029-02-09', tipo_fecha: 'Vencimiento' },
    ],
    contactos: [
      {
        id: '92000000-0000-0000-0000-000000000021',
        id_certificado: '40000000-0000-0000-0000-000000000009',
        nombre: 'Lic. Verónica Salcedo',
        cargo: 'Jefa de Operaciones Logísticas',
        telefonos: [
          { id: '93000000-0000-0000-0000-000000000027', id_contacto: '92000000-0000-0000-0000-000000000021', telefono: '+58 244 415-3180', tipo_telefono: 'Oficina' },
          { id: '93000000-0000-0000-0000-000000000028', id_contacto: '92000000-0000-0000-0000-000000000021', telefono: '+58 412 553-0912', tipo_telefono: 'Móvil' },
        ],
        emails: [
          { id: '94000000-0000-0000-0000-000000000027', id_contacto: '92000000-0000-0000-0000-000000000021', email: 'vsalcedo@example-industrial.com', tipo_email: 'Trabajo' },
          { id: '94000000-0000-0000-0000-000000000028', id_contacto: '92000000-0000-0000-0000-000000000021', email: 'logistica@example-industrial.com', tipo_email: 'Alternativo' },
        ],
      },
    ],
  },
];

export const INITIAL_ALL_SEEDED_CERTIFICADOS_DETAILED: CertificadoDetailEntity[] = [
  ...INITIAL_CERTIFICADOS_DETAILED,
  ...INITIAL_CONG_IND_01_EXTRA_CERTIFICADOS_DETAILED,
];
