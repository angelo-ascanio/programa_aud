/**
 * Phase 4.3: Auditor Directory & Competency Matrix Engine
 * Aligned with ISO/IEC 17021-1:2015 (clause 7.2 on competence of personnel and audit teams),
 * ISO 19011:2018 (competency evaluation), and IAF MD 1:2018.
 */
import type { MultiViewSelectionMap } from './universalTemplate';
import {
  filterSubsectoresBySectorIaf,
  reconcileSubsectorSelectionOnSectorChange,
  type SectorIafCascadeItem,
  type SubsectorIafCascadeItem,
} from './multisiteSampling';
import { assertValidUuid } from './zeroUuid';

export type AuditorDetailMode = 'read' | 'add' | 'edit';
export type CompetenciaAuditorMode = 'read' | 'add';
export type CompetenciaTipo = 'norma' | 'sector_iaf' | 'subsector_iaf';

export const AUDITOR_NOMBRE_MAX_LENGTH = 150;
export const AUDITOR_SIGLAS_MIN_LENGTH = 2;
export const AUDITOR_SIGLAS_MAX_LENGTH = 12;
export const AUDITOR_CEDULA_MIN_LENGTH = 5;
export const AUDITOR_CEDULA_MAX_LENGTH = 30;
export const AUDITOR_PROFESION_MAX_LENGTH = 200;
export const AUDITOR_YEAR_MIN = 1990;
export const AUDITOR_YEAR_MAX = 2100;
export const AUDITOR_TELEFONO_MAX_LENGTH = 50;
export const AUDITOR_EMAIL_MAX_LENGTH = 200;

export const AUDITOR_TIPO_TELEFONO_OPTIONS = [
  'Móvil',
  'Oficina',
  'Internacional',
  'Directo',
  'Otro',
] as const;

export const AUDITOR_TIPO_EMAIL_OPTIONS = [
  'Principal',
  'Secundario',
  'Trabajo',
  'Personal',
  'Otro',
] as const;

export interface TelefonoAuditorEntity {
  id: string;
  id_auditor: string;
  telefono: string;
  tipo_telefono: string;
  es_principal: boolean;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface EmailAuditorEntity {
  id: string;
  id_auditor: string;
  email: string;
  tipo_email: string;
  es_principal: boolean;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface EvaluacionInSituAuditorEntity {
  id: string;
  id_auditor: string;
  etiqueta_periodo?: string | null;
  norma_referencia?: string | null;
  sector_area_evaluado?: string | null;
  ultima_evaluacion_fecha?: string | null;
  proxima_evaluacion_fecha?: string | null;
  ultima_evaluacion_texto?: string | null;
  proxima_evaluacion_texto?: string | null;
  observaciones?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export type AuditorInSituStatus =
  | 'Vigente'
  | 'Por Vencer'
  | 'Vencido'
  | 'S/R'
  | 'Pendiente Evaluación'
  | 'Condicionado';

export interface AuditorSectorObservacionClassification {
  requiereExpertoTecnico: boolean;
  sectoresCondicionados: number[];
  textoAlerta: string;
}

export interface AuditorFormDraft {
  nombre: string;
  siglas: string;
  cedula_identidad: string;
  profesion: string;
  esquemas_complementarios: string;
  anio_actualizacion_normas: number | null;
  sistema_gestion_secundario: string;
  ultima_evaluacion_in_situ_texto: string;
  proxima_evaluacion_in_situ_texto: string;
  ultima_evaluacion_in_situ_fecha: string | null;
  proxima_evaluacion_in_situ_fecha: string | null;
  sin_registro_evaluacion: boolean;
  sector_area_evaluado_texto: string;
  observaciones_evaluacion: string;
  anio_actualizacion_sectores: number | null;
  observacion_sectores: string;
}

export interface AuditorTelefonoFormDraft {
  telefono: string;
  tipo_telefono: string;
  es_principal: boolean;
}

export interface AuditorEmailFormDraft {
  email: string;
  tipo_email: string;
  es_principal: boolean;
}

export interface EvaluacionInSituFormDraft {
  etiqueta_periodo: string;
  norma_referencia: string;
  sector_area_evaluado: string;
  ultima_evaluacion_fecha: string | null;
  proxima_evaluacion_fecha: string | null;
  ultima_evaluacion_texto: string;
  proxima_evaluacion_texto: string;
  observaciones: string;
}

export interface CompetenciaAuditorFormDraft {
  id_auditor: string;
  tipo: CompetenciaTipo;
  id_norma: string;
  id_sector_iaf: string;
  id_subsector_iaf: string;
}

export interface AuditorNormaLink {
  id_auditor: string;
  id_norma: string;
  norma_codigo: string;
  norma_titulo?: string;
  esquema?: string;
}

export interface AuditorSectorLink {
  id_auditor: string;
  id_sector_iaf: string;
  sector_numero: number;
  sector_descripcion: string;
}

export interface AuditorSubsectorLink {
  id_auditor: string;
  id_subsector_iaf: string;
  id_sector_iaf: string;
  sector_numero: number;
  subsector_codigo: string;
  subsector_descripcion: string;
  categoria_riesgo?: string;
  created_at?: string;
}

export type AuditorCalificacion = 'Calificado' | 'En Entrenamiento' | 'Observador';

export type AuditorRolCalificado =
  | 'Auditor Líder'
  | 'Auditor Equipo'
  | 'Especialista'
  | 'Experto Técnico';

export type CredencialEstado = 'Vigente' | 'Por Vencer' | 'Vencido';

export interface CompetenciaAuditorEntity {
  id: string;
  id_auditor: string;
  id_norma: string;
  norma_codigo: string;
  norma_titulo?: string;
  id_sector_iaf: string;
  sector_iaf_numero: number;
  sector_iaf_descripcion: string;
  id_subsector_iaf?: string;
  subsector_iaf_codigo?: string;
  subsector_iaf_descripcion?: string;
  rol_calificado: AuditorRolCalificado;
  fecha_calificacion: string;
  fecha_vencimiento: string;
  numero_registro?: string;
}

export interface AuditoriaRealizadaEntity {
  id: string;
  id_auditor: string;
  codigo_auditoria: string;
  organizacion_nombre: string;
  numero_certificado: string;
  norma_codigo: string;
  tipo_auditoria: string;
  metodologia: 'Presencial' | 'Remota' | 'Mixta';
  rol_en_auditoria: string;
  fecha_ejecucion: string;
  estatus: 'Planificada' | 'En Ejecución' | 'Completada' | 'Cerrada';
}

export interface AuditorDetailEntity {
  id: string;
  nombre: string;
  siglas: string;
  cedula_identidad: string;
  profesion: string;
  esquemas_complementarios: string;
  anio_actualizacion_normas: number | null;
  sistema_gestion_secundario: string;
  ultima_evaluacion_in_situ_texto: string;
  proxima_evaluacion_in_situ_texto: string;
  ultima_evaluacion_in_situ_fecha: string | null;
  proxima_evaluacion_in_situ_fecha: string | null;
  sin_registro_evaluacion: boolean;
  sector_area_evaluado_texto: string;
  observaciones_evaluacion: string;
  anio_actualizacion_sectores: number | null;
  observacion_sectores: string;
  telefonos: TelefonoAuditorEntity[];
  emails: EmailAuditorEntity[];
  evaluaciones_in_situ: EvaluacionInSituAuditorEntity[];
  titulo_profesional: string;
  codigo_credencial: string;
  email: string;
  telefono: string;
  biografia: string;
  instituto_registro: string;
  categoria_profesional: string;
  calificacion: AuditorCalificacion;
  normas_acreditadas: string[];
  sectores_iaf: number[];
  competencias: CompetenciaAuditorEntity[];
  normaLinks?: AuditorNormaLink[];
  sectorLinks?: AuditorSectorLink[];
  subsectorLinks?: AuditorSubsectorLink[];
  historialAuditorias: AuditoriaRealizadaEntity[];
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export type AuditorChildTab = 'competencias' | 'contacto' | 'evaluaciones' | 'historial';

export type AuditorSortColumn =
  | 'nombre'
  | 'codigo_credencial'
  | 'calificacion'
  | 'normas'
  | 'normas_acreditadas'
  | 'sectores'
  | 'sectores_iaf'
  | 'auditorias_count';

export interface AuditorViewState {
  selectedAuditorId: string | null;
  activeChildTab: AuditorChildTab;
  query: string;
  selectedCalificacion: string;
  selectedStandard: string;
  selectedSectorIaf: string;
  viewMode: 'grid' | 'list';
  sortColumn: AuditorSortColumn | null;
  sortDirection: 'asc' | 'desc' | 'none';
  isEditingAttributes: boolean;
  formDraft?: AuditorFormDraft;
  editFormData?: Partial<AuditorDetailEntity>;
  editErrorMessage?: string | null;
  isSidebarOpen?: boolean;
  facetSelections?: MultiViewSelectionMap;
  isCreating?: boolean;
  createErrorMessage?: string | null;
  isAddingTelefono?: boolean;
  telefonoDraft?: AuditorTelefonoFormDraft;
  telefonoErrorMessage?: string | null;
  isAddingEmail?: boolean;
  emailDraft?: AuditorEmailFormDraft;
  emailErrorMessage?: string | null;
  isAddingEvaluacion?: boolean;
  evaluacionDraft?: EvaluacionInSituFormDraft;
  evaluacionErrorMessage?: string | null;
}

export interface AuditorFilterCriteria {
  query?: string;
  selectedCalificacion?: string;
  selectedStandard?: string;
  selectedSectorIaf?: string;
  selectedInSituBucket?: string;
  selectedCondicionSectorial?: string;
  selectedProfesion?: string;
  sortColumn?: AuditorSortColumn | null;
  sortDirection?: 'asc' | 'desc' | 'none';
}

export type AuditorInSituFacetBucket =
  | 'Vigente'
  | 'Por Vencer'
  | 'Vencido'
  | 'S/R'
  | 'Pendiente / Condicionado';

export interface AuditorContactSummary {
  primaryEmail: string;
  extraEmailsCount: number;
  allEmails: string[];
  primaryPhone: string;
  extraPhonesCount: number;
  allPhones: string[];
}

export interface AuditorSectorCoverageSummary {
  sectorNumbers: number[];
  subsectorCodes: string[];
  previewText: string;
  tooltipText: string;
  isEmpty: boolean;
}

/**
 * Normalizes text for comparison (diacritics removed, lowercased, trimmed).
 */
export function normalizeText(val: string | null | undefined): string {
  if (!val) return '';
  return val
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Parses YYYY-MM-DD or ISO string into a UTC midnight timestamp.
 */
function parseDateUtc(dateStr: string | Date | undefined): number {
  if (!dateStr) return NaN;
  if (dateStr instanceof Date) {
    return dateStr.getTime();
  }
  const parts = dateStr.slice(0, 10).split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts.map(Number);
    return Date.UTC(y, m - 1, d);
  }
  return new Date(dateStr).getTime();
}

/**
 * Checks whether an auditor competency or credential has passed its expiration date.
 */
export function isCredentialExpired(
  fechaVencimiento: string,
  referenceDate?: string | Date
): boolean {
  if (!fechaVencimiento) return false;
  const expiryTime = parseDateUtc(fechaVencimiento);
  if (isNaN(expiryTime)) return false;

  const nowTime = referenceDate ? parseDateUtc(referenceDate) : Date.now();
  return expiryTime < nowTime;
}

/**
 * Evaluates the validity state of a credential:
 * - 'Vencido': Expiration date is in the past
 * - 'Por Vencer': Expiration date is within 90 days
 * - 'Vigente': Valid for more than 90 days
 */
export function getCredentialValidityState(
  fechaVencimiento: string,
  referenceDate?: string | Date
): CredencialEstado {
  if (!fechaVencimiento) return 'Vigente';
  const expiryTime = parseDateUtc(fechaVencimiento);
  if (isNaN(expiryTime)) return 'Vigente';

  const nowTime = referenceDate ? parseDateUtc(referenceDate) : Date.now();
  if (expiryTime < nowTime) {
    return 'Vencido';
  }

  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
  if (expiryTime - nowTime <= ninetyDaysMs) {
    return 'Por Vencer';
  }

  return 'Vigente';
}

/**
 * Evaluates whether an auditor is technically qualified for a given audit scope.
 * Complies with ISO/IEC 17021-1:2015 clause 7.2:
 * 1. Checks matching normative standard (e.g., ISO 9001:2015).
 * 2. Checks matching primary IAF sector (e.g., Sector 17).
 * 3. If targetSubsectorIaf is provided, validates that a subsector qualification matches (e.g. 17.1).
 * 4. Checks credential expiration.
 */
export function isAuditorQualifiedForScope(
  competencies: CompetenciaAuditorEntity[],
  targetNorma: string,
  targetSectorIaf: number | string,
  targetSubsectorIaf?: string,
  referenceDate?: string | Date
): {
  qualified: boolean;
  matchedRole?: AuditorRolCalificado;
  isExpired?: boolean;
  reason?: string;
} {
  if (!Array.isArray(competencies) || competencies.length === 0) {
    return {
      qualified: false,
      reason: 'El auditor no posee competencias técnicas registradas.',
    };
  }

  const normClean = normalizeText(targetNorma);
  const targetSectorNum = Number(targetSectorIaf);
  const targetSubClean = targetSubsectorIaf ? normalizeText(targetSubsectorIaf) : undefined;

  let expiredMatch: CompetenciaAuditorEntity | null = null;

  for (const comp of competencies) {
    const compNorma = normalizeText(comp.norma_codigo);
    const normaMatch = compNorma === normClean || compNorma.includes(normClean) || normClean.includes(compNorma);

    const sectorMatch = comp.sector_iaf_numero === targetSectorNum;

    let subsectorMatch = true;
    if (targetSubClean) {
      const compSub = normalizeText(comp.subsector_iaf_codigo);
      subsectorMatch = compSub === targetSubClean || compSub.includes(targetSubClean);
    }

    if (normaMatch && sectorMatch && subsectorMatch) {
      const expired = isCredentialExpired(comp.fecha_vencimiento, referenceDate);
      if (expired) {
        expiredMatch = comp;
      } else {
        return {
          qualified: true,
          matchedRole: comp.rol_calificado,
          isExpired: false,
        };
      }
    }
  }

  if (expiredMatch) {
    return {
      qualified: false,
      matchedRole: expiredMatch.rol_calificado,
      isExpired: true,
      reason: `Calificación vencida el ${expiredMatch.fecha_vencimiento} para ${expiredMatch.norma_codigo} en Sector ${expiredMatch.sector_iaf_numero}.`,
    };
  }

  return {
    qualified: false,
    reason: `Sin calificación vigente para ${targetNorma} y Sector IAF ${targetSectorIaf}${
      targetSubsectorIaf ? ` (${targetSubsectorIaf})` : ''
    }.`,
  };
}

/**
 * Returns the count of distinct normative standards accredited for an auditor.
 */
export function countDistinctAccreditedStandards(
  competencies: CompetenciaAuditorEntity[]
): number {
  if (!Array.isArray(competencies)) return 0;
  const set = new Set(competencies.map((c) => c.norma_codigo.trim()));
  return set.size;
}

/**
 * Returns the count of distinct IAF economic sectors covered by an auditor's competencies.
 */
export function countDistinctQualifiedSectors(
  competencies: CompetenciaAuditorEntity[]
): number {
  if (!Array.isArray(competencies)) return 0;
  const set = new Set(competencies.map((c) => c.sector_iaf_numero));
  return set.size;
}

/**
 * Returns the count of distinct technical subsectors covered by an auditor's competencies.
 */
export function countDistinctQualifiedSubsectors(
  competencies: CompetenciaAuditorEntity[]
): number {
  if (!Array.isArray(competencies)) return 0;
  const set = new Set(
    competencies
      .filter((c) => Boolean(c.subsector_iaf_codigo))
      .map((c) => c.subsector_iaf_codigo!.trim())
  );
  return set.size;
}

/**
 * Validates auditor credential registration code format.
 * Examples: AUD-REG-2022-88, AUD-2024-01, IRCA-102938
 */
export function validateCredentialCode(
  code: string | null | undefined
): { valid: boolean; error?: string } {
  if (!code || !code.trim()) {
    return {
      valid: false,
      error: 'El código de credencial del auditor es obligatorio.',
    };
  }
  const clean = code.trim().toUpperCase();
  if (clean.length < 5 || clean.length > 25) {
    return {
      valid: false,
      error: 'El código de credencial debe tener entre 5 y 25 caracteres (ejemplo: AUD-REG-2024-01).',
    };
  }
  return { valid: true };
}

/**
 * Visual metadata for qualification status badge.
 */
export function getQualificationStatusVisual(calificacion: string): {
  label: string;
  badgeClass: string;
  dotClass: string;
  symbol: string;
} {
  const norm = (calificacion || '').toUpperCase();
  if (norm.includes('CALIFICADO')) {
    return {
      label: 'CALIFICADO',
      badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      dotClass: 'bg-emerald-500',
      symbol: '✓',
    };
  }
  if (norm.includes('ENTRENAMIENTO')) {
    return {
      label: 'EN ENTRENAMIENTO',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
      dotClass: 'bg-amber-500',
      symbol: '⏳',
    };
  }
  return {
    label: 'OBSERVADOR',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    dotClass: 'bg-slate-400',
    symbol: '👁️',
  };
}

/**
 * Visual styling for qualified audit roles.
 */
export function getAuditRoleVisual(rol: AuditorRolCalificado | string): {
  label: string;
  badgeClass: string;
  icon: string;
} {
  switch (rol) {
    case 'Auditor Líder':
      return {
        label: 'Auditor Líder',
        badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200 font-bold',
        icon: '★',
      };
    case 'Auditor Equipo':
      return {
        label: 'Auditor de Equipo',
        badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
        icon: '👤',
      };
    case 'Especialista':
      return {
        label: 'Especialista',
        badgeClass: 'bg-purple-50 text-purple-800 border-purple-200',
        icon: '🔬',
      };
    case 'Experto Técnico':
      return {
        label: 'Experto Técnico',
        badgeClass: 'bg-teal-50 text-teal-800 border-teal-200',
        icon: '⚙️',
      };
    default:
      return {
        label: rol || 'Evaluador',
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
        icon: '•',
      };
  }
}

/**
 * Filters and sorts auditors by text query and multi-dimensional facets.
 */
export function filterAuditors(
  auditors: AuditorDetailEntity[],
  criteria: AuditorFilterCriteria = {}
): AuditorDetailEntity[] {
  const {
    query = '',
    selectedCalificacion = 'ALL',
    selectedStandard = 'ALL',
    selectedSectorIaf = 'ALL',
    selectedInSituBucket = 'ALL',
    selectedCondicionSectorial = 'ALL',
    selectedProfesion = 'ALL',
    sortColumn = null,
    sortDirection = 'none',
  } = criteria;

  const cleanQuery = normalizeText(query);

  const filtered = auditors.filter((auditor) => {
    // 1. Unified full-text search across identity, contacts, norms, schemes, sectors/subsectors, and observations
    if (cleanQuery) {
      const searchable = normalizeText(buildAuditorSearchableText(auditor));
      if (!searchable.includes(cleanQuery)) {
        return false;
      }
    }

    // 2. Facet: Legacy Qualification Status
    if (selectedCalificacion && selectedCalificacion !== 'ALL') {
      if (normalizeText(auditor.calificacion) !== normalizeText(selectedCalificacion)) {
        return false;
      }
    }

    // 3. Facet: Accredited Standard or Complementary Scheme
    if (selectedStandard && selectedStandard !== 'ALL') {
      const normQuery = normalizeText(selectedStandard);
      const normsAndSchemes = [
        ...getAuditorNormaLinks(auditor).map((l) => l.norma_codigo),
        ...auditor.normas_acreditadas,
        ...extractAuditorComplementarySchemes(auditor),
      ];
      const hasStandard = normsAndSchemes.some((std) => normalizeText(std).includes(normQuery));
      if (!hasStandard) {
        return false;
      }
    }

    // 4. Facet: IAF Sector
    if (selectedSectorIaf && selectedSectorIaf !== 'ALL') {
      const targetSector = Number(selectedSectorIaf);
      const sectorSet = new Set<number>([
        ...auditor.sectores_iaf,
        ...getAuditorSectorLinks(auditor).map((s) => s.sector_numero),
        ...getAuditorSubsectorLinks(auditor).map((sub) => sub.sector_numero),
      ]);
      if (!sectorSet.has(targetSector)) {
        return false;
      }
    }

    // 5. Facet: Eval. In Situ bucket
    if (selectedInSituBucket && selectedInSituBucket !== 'ALL') {
      if (resolveAuditorInSituFacetBucket(auditor) !== selectedInSituBucket) {
        return false;
      }
    }

    // 6. Facet: Sector Condition (Experto Técnico)
    if (selectedCondicionSectorial && selectedCondicionSectorial !== 'ALL') {
      const condLabel = classifyAuditorObservacionSector(auditor).requiereExpertoTecnico
        ? 'Requiere Experto Técnico'
        : 'Sin condicionamiento';
      if (condLabel !== selectedCondicionSectorial) {
        return false;
      }
    }

    // 7. Facet: Normalized Profession
    if (selectedProfesion && selectedProfesion !== 'ALL') {
      const profLabel = normalizeAuditorProfessionLabel(
        auditor.profesion || auditor.titulo_profesional
      );
      if (normalizeText(profLabel) !== normalizeText(selectedProfesion)) {
        return false;
      }
    }

    return true;
  });

  // Sorting
  if (!sortColumn || sortDirection === 'none') {
    return filtered;
  }

  const factor = sortDirection === 'asc' ? 1 : -1;
  return [...filtered].sort((a, b) => {
    switch (sortColumn) {
      case 'nombre':
        return factor * a.nombre.localeCompare(b.nombre, 'es');
      case 'codigo_credencial':
        return factor * (a.siglas || a.codigo_credencial).localeCompare(b.siglas || b.codigo_credencial, 'es');
      case 'calificacion':
        return factor * a.calificacion.localeCompare(b.calificacion, 'es');
      case 'normas':
      case 'normas_acreditadas': {
        const aCount = new Set([
          ...getAuditorNormaLinks(a).map((l) => l.norma_codigo),
          ...a.normas_acreditadas,
          ...extractAuditorComplementarySchemes(a),
        ]).size;
        const bCount = new Set([
          ...getAuditorNormaLinks(b).map((l) => l.norma_codigo),
          ...b.normas_acreditadas,
          ...extractAuditorComplementarySchemes(b),
        ]).size;
        return factor * (aCount - bCount);
      }
      case 'sectores':
      case 'sectores_iaf': {
        const aCount = summarizeAuditorSectorCoverage(a).sectorNumbers.length;
        const bCount = summarizeAuditorSectorCoverage(b).sectorNumbers.length;
        return factor * (aCount - bCount);
      }
      case 'auditorias_count':
        return factor * (a.historialAuditorias.length - b.historialAuditorias.length);
      default:
        return 0;
    }
  });
}

/**
 * Canonical fallback dataset aligned with real CSV records in 06_datos_prueba.sql (Paso 1.2)
 */
export const INITIAL_AUDITORES_DETAILED: AuditorDetailEntity[] = [
  {
    id: '10000000-0000-0000-0000-000000000001',
    nombre: 'Keyla Cristina Soteldo de Páez',
    siglas: 'KS',
    cedula_identidad: '4165827',
    profesion: 'INGENIERO METALÚRGICO',
    esquemas_complementarios: '',
    anio_actualizacion_normas: 2021,
    sistema_gestion_secundario: '',
    ultima_evaluacion_in_situ_texto: '01/09/2024',
    proxima_evaluacion_in_situ_texto: '01/09/2027',
    ultima_evaluacion_in_situ_fecha: '2024-09-01',
    proxima_evaluacion_in_situ_fecha: '2027-09-01',
    sin_registro_evaluacion: false,
    sector_area_evaluado_texto: '33 / 33.18',
    observaciones_evaluacion: '',
    anio_actualizacion_sectores: null,
    observacion_sectores: '',
    telefonos: [
      {
        id: '1a100000-0000-0000-0000-000000000001',
        id_auditor: '10000000-0000-0000-0000-000000000001',
        telefono: '04166225576',
        tipo_telefono: 'Móvil',
        es_principal: true,
        deleted_at: null,
      },
    ],
    emails: [
      {
        id: '1a200000-0000-0000-0000-000000000001',
        id_auditor: '10000000-0000-0000-0000-000000000001',
        email: 'keylasoteldo@gmail.com',
        tipo_email: 'Principal',
        es_principal: true,
        deleted_at: null,
      },
    ],
    evaluaciones_in_situ: [
      {
        id: '1a300000-0000-0000-0000-000000000001',
        id_auditor: '10000000-0000-0000-0000-000000000001',
        etiqueta_periodo: 'Evaluación Principal',
        norma_referencia: null,
        sector_area_evaluado: '33 / 33.18',
        ultima_evaluacion_fecha: '2024-09-01',
        proxima_evaluacion_fecha: '2027-09-01',
        ultima_evaluacion_texto: '01/09/2024',
        proxima_evaluacion_texto: '01/09/2027',
        observaciones: null,
        deleted_at: null,
      },
    ],
    titulo_profesional: 'INGENIERO METALÚRGICO',
    codigo_credencial: 'KS',
    email: 'keylasoteldo@gmail.com',
    telefono: '04166225576',
    biografia: 'Auditora calificada FONDONORMA bajo ISO 9001:2015, ISO 14001:2015 e ISO 45001:2018.',
    instituto_registro: 'FONDONORMA',
    categoria_profesional: 'Auditor Calificado',
    calificacion: 'Calificado',
    normas_acreditadas: ['ISO 9001:2015', 'ISO 14001:2015', 'ISO 45001:2018'],
    sectores_iaf: [17, 18, 31, 33, 34, 35],
    normaLinks: [
      {
        id_auditor: '10000000-0000-0000-0000-000000000001',
        id_norma: 'e0000000-0000-0000-0000-000000009001',
        norma_codigo: 'ISO 9001:2015',
        norma_titulo: 'Sistemas de Gestión de la Calidad',
      },
      {
        id_auditor: '10000000-0000-0000-0000-000000000001',
        id_norma: 'e0000000-0000-0000-0000-000000014001',
        norma_codigo: 'ISO 14001:2015',
        norma_titulo: 'Sistemas de Gestión Ambiental',
      },
      {
        id_auditor: '10000000-0000-0000-0000-000000000001',
        id_norma: 'e0000000-0000-0000-0000-000000045001',
        norma_codigo: 'ISO 45001:2018',
        norma_titulo: 'Sistemas de Seguridad y Salud Laboral',
      },
    ],
    sectorLinks: [
      {
        id_auditor: '10000000-0000-0000-0000-000000000001',
        id_sector_iaf: 'd0000000-0000-0000-0000-000000000017',
        sector_numero: 17,
        sector_descripcion: 'Metales básicos y productos metálicos elaborados',
      },
      {
        id_auditor: '10000000-0000-0000-0000-000000000001',
        id_sector_iaf: 'd0000000-0000-0000-0000-000000000018',
        sector_numero: 18,
        sector_descripcion: 'Maquinaria y equipo',
      },
      {
        id_auditor: '10000000-0000-0000-0000-000000000001',
        id_sector_iaf: 'd0000000-0000-0000-0000-000000000031',
        sector_numero: 31,
        sector_descripcion: 'Transporte, almacenamiento y comunicaciones',
      },
      {
        id_auditor: '10000000-0000-0000-0000-000000000001',
        id_sector_iaf: 'd0000000-0000-0000-0000-000000000033',
        sector_numero: 33,
        sector_descripcion: 'Tecnología de la información',
      },
      {
        id_auditor: '10000000-0000-0000-0000-000000000001',
        id_sector_iaf: 'd0000000-0000-0000-0000-000000000034',
        sector_numero: 34,
        sector_descripcion: 'Servicios de ingeniería',
      },
      {
        id_auditor: '10000000-0000-0000-0000-000000000001',
        id_sector_iaf: 'd0000000-0000-0000-0000-000000000035',
        sector_numero: 35,
        sector_descripcion: 'Otros servicios',
      },
    ],
    subsectorLinks: [
      {
        id_auditor: '10000000-0000-0000-0000-000000000001',
        id_subsector_iaf: 'da000000-0000-0000-0000-000000000171',
        id_sector_iaf: 'd0000000-0000-0000-0000-000000000017',
        sector_numero: 17,
        subsector_codigo: '17.1',
        subsector_descripcion: 'Fabricación de metales básicos, fundición y siderurgia',
      },
      {
        id_auditor: '10000000-0000-0000-0000-000000000001',
        id_subsector_iaf: 'da000000-0000-0000-0000-000000000331',
        id_sector_iaf: 'd0000000-0000-0000-0000-000000000033',
        sector_numero: 33,
        subsector_codigo: '33.1',
        subsector_descripcion: 'Servicios de tecnologías de información',
      },
    ],
    competencias: [
      {
        id: 'ca-1001',
        id_auditor: '10000000-0000-0000-0000-000000000001',
        id_norma: 'e0000000-0000-0000-0000-000000009001',
        norma_codigo: 'ISO 9001:2015',
        norma_titulo: 'Sistemas de Gestión de la Calidad',
        id_sector_iaf: 'd0000000-0000-0000-0000-000000000017',
        sector_iaf_numero: 17,
        sector_iaf_descripcion: 'Metales básicos y productos metálicos elaborados',
        id_subsector_iaf: 'da000000-0000-0000-0000-000000000171',
        subsector_iaf_codigo: '17.1',
        subsector_iaf_descripcion: 'Fabricación de metales básicos, fundición y siderurgia',
        rol_calificado: 'Auditor Líder',
        fecha_calificacion: '2024-09-01',
        fecha_vencimiento: '2027-09-01',
        numero_registro: 'KS',
      },
    ],
    historialAuditorias: [],
  },
  {
    id: '10000000-0000-0000-0000-000000000002',
    nombre: 'Félix Horacio Rojas Machado',
    siglas: 'FR',
    cedula_identidad: '2995963',
    profesion: 'INGENIERO QUÍMICO',
    esquemas_complementarios: '',
    anio_actualizacion_normas: 2020,
    sistema_gestion_secundario: '',
    ultima_evaluacion_in_situ_texto: 'may-15 / nov-24',
    proxima_evaluacion_in_situ_texto: 'may-18 / nov-27',
    ultima_evaluacion_in_situ_fecha: '2024-11-01',
    proxima_evaluacion_in_situ_fecha: '2027-11-01',
    sin_registro_evaluacion: false,
    sector_area_evaluado_texto: '4',
    observaciones_evaluacion: '',
    anio_actualizacion_sectores: null,
    observacion_sectores: '',
    telefonos: [
      {
        id: '1a100000-0000-0000-0000-000000000002',
        id_auditor: '10000000-0000-0000-0000-000000000002',
        telefono: '52 81 3056 1157',
        tipo_telefono: 'Internacional',
        es_principal: true,
        deleted_at: null,
      },
    ],
    emails: [
      {
        id: '1a200000-0000-0000-0000-000000000002',
        id_auditor: '10000000-0000-0000-0000-000000000002',
        email: 'frojas301@gmail.com',
        tipo_email: 'Principal',
        es_principal: true,
        deleted_at: null,
      },
    ],
    evaluaciones_in_situ: [
      {
        id: '1a300000-0000-0000-0000-000000000002',
        id_auditor: '10000000-0000-0000-0000-000000000002',
        etiqueta_periodo: 'Evaluación 1 (may-15)',
        norma_referencia: null,
        sector_area_evaluado: '4',
        ultima_evaluacion_fecha: '2015-05-01',
        proxima_evaluacion_fecha: '2018-05-01',
        ultima_evaluacion_texto: 'may-15',
        proxima_evaluacion_texto: 'may-18',
        observaciones: null,
        deleted_at: null,
      },
      {
        id: '1a300000-0000-0000-0000-000000000003',
        id_auditor: '10000000-0000-0000-0000-000000000002',
        etiqueta_periodo: 'Evaluación 2 (nov-24)',
        norma_referencia: null,
        sector_area_evaluado: '4',
        ultima_evaluacion_fecha: '2024-11-01',
        proxima_evaluacion_fecha: '2027-11-01',
        ultima_evaluacion_texto: 'nov-24',
        proxima_evaluacion_texto: 'nov-27',
        observaciones: null,
        deleted_at: null,
      },
    ],
    titulo_profesional: 'INGENIERO QUÍMICO',
    codigo_credencial: 'FR',
    email: 'frojas301@gmail.com',
    telefono: '52 81 3056 1157',
    biografia: 'Auditor calificado FONDONORMA en gestión de la calidad e industria química.',
    instituto_registro: 'FONDONORMA',
    categoria_profesional: 'Auditor Calificado',
    calificacion: 'Calificado',
    normas_acreditadas: ['ISO 9001:2015'],
    sectores_iaf: [2, 4, 10, 12, 14, 16, 26, 34],
    normaLinks: [
      {
        id_auditor: '10000000-0000-0000-0000-000000000002',
        id_norma: 'e0000000-0000-0000-0000-000000009001',
        norma_codigo: 'ISO 9001:2015',
        norma_titulo: 'Sistemas de Gestión de la Calidad',
      },
    ],
    sectorLinks: [
      {
        id_auditor: '10000000-0000-0000-0000-000000000002',
        id_sector_iaf: 'd0000000-0000-0000-0000-000000000014',
        sector_numero: 14,
        sector_descripcion: 'Productos químicos, fibras sintéticas y farmacéuticos',
      },
    ],
    subsectorLinks: [],
    competencias: [],
    historialAuditorias: [],
  },
  {
    id: '10000000-0000-0000-0000-000000000003',
    nombre: 'José Ramón Polo Faría',
    siglas: 'JRP',
    cedula_identidad: '5684384',
    profesion: 'INGENIERO INDUSTRIAL',
    esquemas_complementarios: '',
    anio_actualizacion_normas: 2020,
    sistema_gestion_secundario: '',
    ultima_evaluacion_in_situ_texto: '01/11/2023',
    proxima_evaluacion_in_situ_texto: '01/11/2026',
    ultima_evaluacion_in_situ_fecha: '2023-11-01',
    proxima_evaluacion_in_situ_fecha: '2026-11-01',
    sin_registro_evaluacion: false,
    sector_area_evaluado_texto: '34 / 34.1',
    observaciones_evaluacion: 'SECTOR 9 Y 38 CON EXPERTO TÉCNICO',
    anio_actualizacion_sectores: null,
    observacion_sectores: 'Sector 9 y 38 con Experto tecnico.',
    telefonos: [
      {
        id: '1a100000-0000-0000-0000-000000000003',
        id_auditor: '10000000-0000-0000-0000-000000000003',
        telefono: '02129074632',
        tipo_telefono: 'Oficina',
        es_principal: true,
        deleted_at: null,
      },
    ],
    emails: [
      {
        id: '1a200000-0000-0000-0000-000000000003',
        id_auditor: '10000000-0000-0000-0000-000000000003',
        email: 'joserpolofaria@gmail.com',
        tipo_email: 'Principal',
        es_principal: true,
        deleted_at: null,
      },
    ],
    evaluaciones_in_situ: [
      {
        id: '1a300000-0000-0000-0000-000000000004',
        id_auditor: '10000000-0000-0000-0000-000000000003',
        etiqueta_periodo: 'Evaluación Principal',
        norma_referencia: null,
        sector_area_evaluado: '34 / 34.1',
        ultima_evaluacion_fecha: '2023-11-01',
        proxima_evaluacion_fecha: '2026-11-01',
        ultima_evaluacion_texto: '01/11/2023',
        proxima_evaluacion_texto: '01/11/2026',
        observaciones: 'SECTOR 9 Y 38 CON EXPERTO TÉCNICO',
        deleted_at: null,
      },
    ],
    titulo_profesional: 'INGENIERO INDUSTRIAL',
    codigo_credencial: 'JRP',
    email: 'joserpolofaria@gmail.com',
    telefono: '02129074632',
    biografia: 'Auditor calificado FONDONORMA con cobertura en sectores industriales y de servicios.',
    instituto_registro: 'FONDONORMA',
    categoria_profesional: 'Auditor Calificado',
    calificacion: 'Calificado',
    normas_acreditadas: ['ISO 9001:2015'],
    sectores_iaf: [9, 29, 30, 31, 32, 34, 35, 38],
    normaLinks: [
      {
        id_auditor: '10000000-0000-0000-0000-000000000003',
        id_norma: 'e0000000-0000-0000-0000-000000009001',
        norma_codigo: 'ISO 9001:2015',
        norma_titulo: 'Sistemas de Gestión de la Calidad',
      },
    ],
    sectorLinks: [
      {
        id_auditor: '10000000-0000-0000-0000-000000000003',
        id_sector_iaf: 'd0000000-0000-0000-0000-000000000034',
        sector_numero: 34,
        sector_descripcion: 'Servicios de ingeniería',
      },
    ],
    subsectorLinks: [],
    competencias: [],
    historialAuditorias: [],
  },
  {
    id: '10000000-0000-0000-0000-000000000004',
    nombre: 'Leonardo Antonio Rojas Gómez',
    siglas: 'LR',
    cedula_identidad: '5365320',
    profesion: 'INGENIERO QUÍMICO',
    esquemas_complementarios: '',
    anio_actualizacion_normas: 2021,
    sistema_gestion_secundario: '',
    ultima_evaluacion_in_situ_texto: '01/08/2021',
    proxima_evaluacion_in_situ_texto: '01/08/2024',
    ultima_evaluacion_in_situ_fecha: '2021-08-01',
    proxima_evaluacion_in_situ_fecha: '2024-08-01',
    sin_registro_evaluacion: false,
    sector_area_evaluado_texto: '3 / 3.1',
    observaciones_evaluacion: '',
    anio_actualizacion_sectores: null,
    observacion_sectores: '',
    telefonos: [
      {
        id: '1a100000-0000-0000-0000-000000000004',
        id_auditor: '10000000-0000-0000-0000-000000000004',
        telefono: '04144222939',
        tipo_telefono: 'Móvil',
        es_principal: true,
        deleted_at: null,
      },
    ],
    emails: [
      {
        id: '1a200000-0000-0000-0000-000000000004',
        id_auditor: '10000000-0000-0000-0000-000000000004',
        email: 'leorojas48@gmail.com',
        tipo_email: 'Principal',
        es_principal: true,
        deleted_at: null,
      },
    ],
    evaluaciones_in_situ: [
      {
        id: '1a300000-0000-0000-0000-000000000005',
        id_auditor: '10000000-0000-0000-0000-000000000004',
        etiqueta_periodo: 'Evaluación Principal',
        norma_referencia: null,
        sector_area_evaluado: '3 / 3.1',
        ultima_evaluacion_fecha: '2021-08-01',
        proxima_evaluacion_fecha: '2024-08-01',
        ultima_evaluacion_texto: '01/08/2021',
        proxima_evaluacion_texto: '01/08/2024',
        observaciones: null,
        deleted_at: null,
      },
    ],
    titulo_profesional: 'INGENIERO QUÍMICO',
    codigo_credencial: 'LR',
    email: 'leorojas48@gmail.com',
    telefono: '04144222939',
    biografia: 'Auditor integrado bajo ISO 9001, ISO 14001 e ISO 45001.',
    instituto_registro: 'FONDONORMA',
    categoria_profesional: 'Auditor Calificado',
    calificacion: 'Calificado',
    normas_acreditadas: ['ISO 9001:2015', 'ISO 14001:2015', 'ISO 45001:2018'],
    sectores_iaf: [3, 10, 12, 14, 16, 26, 31, 34],
    normaLinks: [
      {
        id_auditor: '10000000-0000-0000-0000-000000000004',
        id_norma: 'e0000000-0000-0000-0000-000000009001',
        norma_codigo: 'ISO 9001:2015',
        norma_titulo: 'Sistemas de Gestión de la Calidad',
      },
      {
        id_auditor: '10000000-0000-0000-0000-000000000004',
        id_norma: 'e0000000-0000-0000-0000-000000014001',
        norma_codigo: 'ISO 14001:2015',
        norma_titulo: 'Sistemas de Gestión Ambiental',
      },
      {
        id_auditor: '10000000-0000-0000-0000-000000000004',
        id_norma: 'e0000000-0000-0000-0000-000000045001',
        norma_codigo: 'ISO 45001:2018',
        norma_titulo: 'Sistemas de Seguridad y Salud Laboral',
      },
    ],
    sectorLinks: [
      {
        id_auditor: '10000000-0000-0000-0000-000000000004',
        id_sector_iaf: 'd0000000-0000-0000-0000-000000000014',
        sector_numero: 14,
        sector_descripcion: 'Productos químicos, fibras sintéticas y farmacéuticos',
      },
    ],
    subsectorLinks: [],
    competencias: [],
    historialAuditorias: [],
  },
  {
    id: '10000000-0000-0000-0000-000000000005',
    nombre: 'Nordy Armando Fuentes',
    siglas: 'NF',
    cedula_identidad: '5884819',
    profesion: 'INGENIERO INDUSTRIAL',
    esquemas_complementarios: '',
    anio_actualizacion_normas: 2023,
    sistema_gestion_secundario: '',
    ultima_evaluacion_in_situ_texto: '01/08/2022',
    proxima_evaluacion_in_situ_texto: '01/08/2025',
    ultima_evaluacion_in_situ_fecha: '2022-08-01',
    proxima_evaluacion_in_situ_fecha: '2025-08-01',
    sin_registro_evaluacion: false,
    sector_area_evaluado_texto: '7 / 7.1',
    observaciones_evaluacion: 'SECTOR 4, 5 Y 38  CON EXP TÉCNICO',
    anio_actualizacion_sectores: null,
    observacion_sectores: 'SECTOR 4, 5 y 38  CON EXP TECNICO',
    telefonos: [
      {
        id: '1a100000-0000-0000-0000-000000000005',
        id_auditor: '10000000-0000-0000-0000-000000000005',
        telefono: '04126018407',
        tipo_telefono: 'Móvil',
        es_principal: true,
        deleted_at: null,
      },
      {
        id: '1a100000-0000-0000-0000-000000000006',
        id_auditor: '10000000-0000-0000-0000-000000000005',
        telefono: '02123698762',
        tipo_telefono: 'Oficina',
        es_principal: false,
        deleted_at: null,
      },
    ],
    emails: [
      {
        id: '1a200000-0000-0000-0000-000000000005',
        id_auditor: '10000000-0000-0000-0000-000000000005',
        email: 'nordyfuentes@gmail.com',
        tipo_email: 'Principal',
        es_principal: true,
        deleted_at: null,
      },
    ],
    evaluaciones_in_situ: [
      {
        id: '1a300000-0000-0000-0000-000000000006',
        id_auditor: '10000000-0000-0000-0000-000000000005',
        etiqueta_periodo: 'Evaluación Principal',
        norma_referencia: null,
        sector_area_evaluado: '7 / 7.1',
        ultima_evaluacion_fecha: '2022-08-01',
        proxima_evaluacion_fecha: '2025-08-01',
        ultima_evaluacion_texto: '01/08/2022',
        proxima_evaluacion_texto: '01/08/2025',
        observaciones: 'SECTOR 4, 5 Y 38  CON EXP TÉCNICO',
        deleted_at: null,
      },
    ],
    titulo_profesional: 'INGENIERO INDUSTRIAL',
    codigo_credencial: 'NF',
    email: 'nordyfuentes@gmail.com',
    telefono: '04126018407',
    biografia: 'Auditor calificado FONDONORMA para sectores manufactureros y de servicios.',
    instituto_registro: 'FONDONORMA',
    categoria_profesional: 'Auditor Calificado',
    calificacion: 'Calificado',
    normas_acreditadas: ['ISO 9001:2015'],
    sectores_iaf: [4, 5, 6, 7, 29, 31, 34, 38],
    normaLinks: [
      {
        id_auditor: '10000000-0000-0000-0000-000000000005',
        id_norma: 'e0000000-0000-0000-0000-000000009001',
        norma_codigo: 'ISO 9001:2015',
        norma_titulo: 'Sistemas de Gestión de la Calidad',
      },
    ],
    sectorLinks: [
      {
        id_auditor: '10000000-0000-0000-0000-000000000005',
        id_sector_iaf: 'd0000000-0000-0000-0000-000000000007',
        sector_numero: 7,
        sector_descripcion: 'Papel y productos de papel',
      },
    ],
    subsectorLinks: [],
    competencias: [],
    historialAuditorias: [],
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    nombre: 'Auditor Técnico Evaluador',
    siglas: 'TEST',
    cedula_identidad: '',
    profesion: 'Auditor Técnico de Plataforma',
    esquemas_complementarios: '',
    anio_actualizacion_normas: 2024,
    sistema_gestion_secundario: '',
    ultima_evaluacion_in_situ_texto: '',
    proxima_evaluacion_in_situ_texto: '',
    ultima_evaluacion_in_situ_fecha: null,
    proxima_evaluacion_in_situ_fecha: null,
    sin_registro_evaluacion: true,
    sector_area_evaluado_texto: '',
    observaciones_evaluacion: 'Cuenta de pruebas RBAC',
    anio_actualizacion_sectores: null,
    observacion_sectores: '',
    telefonos: [],
    emails: [
      {
        id: '33333333-3333-3333-3333-333333333331',
        id_auditor: '33333333-3333-3333-3333-333333333333',
        email: 'auditor@fondonorma.test',
        tipo_email: 'Principal',
        es_principal: true,
        deleted_at: null,
      },
    ],
    evaluaciones_in_situ: [],
    titulo_profesional: 'Auditor Técnico de Plataforma',
    codigo_credencial: 'AUD-REG-2023-33',
    email: 'auditor@fondonorma.test',
    telefono: '',
    biografia: 'Auditor de tercera parte habilitado para evaluaciones ISO en plataforma.',
    instituto_registro: 'FONDONORMA',
    categoria_profesional: 'Auditor de Equipo',
    calificacion: 'Calificado',
    normas_acreditadas: ['ISO 9001:2015', 'ISO 14001:2015', 'ISO 45001:2018', 'ISO/IEC 27001:2022', 'ISO 22000:2018'],
    sectores_iaf: [3, 17, 33],
    normaLinks: [
      {
        id_auditor: '33333333-3333-3333-3333-333333333333',
        id_norma: 'e0000000-0000-0000-0000-000000009001',
        norma_codigo: 'ISO 9001:2015',
        norma_titulo: 'Sistemas de Gestión de la Calidad',
      },
      {
        id_auditor: '33333333-3333-3333-3333-333333333333',
        id_norma: 'e0000000-0000-0000-0000-000000027001',
        norma_codigo: 'ISO/IEC 27001:2022',
        norma_titulo: 'Seguridad de la Información',
      },
    ],
    sectorLinks: [
      {
        id_auditor: '33333333-3333-3333-3333-333333333333',
        id_sector_iaf: 'd0000000-0000-0000-0000-000000000017',
        sector_numero: 17,
        sector_descripcion: 'Metales básicos y productos metálicos elaborados',
      },
      {
        id_auditor: '33333333-3333-3333-3333-333333333333',
        id_sector_iaf: 'd0000000-0000-0000-0000-000000000033',
        sector_numero: 33,
        sector_descripcion: 'Tecnología de la información',
      },
    ],
    subsectorLinks: [
      {
        id_auditor: '33333333-3333-3333-3333-333333333333',
        id_subsector_iaf: 'da000000-0000-0000-0000-000000000172',
        id_sector_iaf: 'd0000000-0000-0000-0000-000000000017',
        sector_numero: 17,
        subsector_codigo: '17.2',
        subsector_descripcion: 'Fabricación de productos metálicos elaborados y estampado',
      },
    ],
    competencias: [],
    historialAuditorias: [],
  },
];

export function getPrimaryAuditorTelefono(
  telefonos: ReadonlyArray<TelefonoAuditorEntity> | undefined
): string {
  if (!Array.isArray(telefonos)) return '';
  const active = telefonos.filter((t) => !t.deleted_at && Boolean(t.telefono?.trim()));
  if (active.length === 0) return '';
  const primary = active.find((t) => t.es_principal);
  return (primary || active[0]).telefono.trim();
}

export function getPrimaryAuditorEmail(
  emails: ReadonlyArray<EmailAuditorEntity> | undefined
): string {
  if (!Array.isArray(emails)) return '';
  const active = emails.filter((e) => !e.deleted_at && Boolean(e.email?.trim()));
  if (active.length === 0) return '';
  const primary = active.find((e) => e.es_principal);
  return (primary || active[0]).email.trim();
}

export function summarizeEvaluacionesInSitu(
  evaluaciones: ReadonlyArray<EvaluacionInSituAuditorEntity> | undefined
): {
  ultima_evaluacion_in_situ_fecha: string | null;
  proxima_evaluacion_in_situ_fecha: string | null;
  sin_registro_evaluacion: boolean;
} {
  const active = Array.isArray(evaluaciones)
    ? evaluaciones.filter((ev) => !ev.deleted_at)
    : [];
  let maxUltima: string | null = null;
  let maxProxima: string | null = null;

  for (const ev of active) {
    const ult = (ev.ultima_evaluacion_fecha || '').trim().slice(0, 10);
    if (ult && /^\d{4}-\d{2}-\d{2}$/.test(ult)) {
      if (!maxUltima || ult > maxUltima) {
        maxUltima = ult;
      }
    }
    const prox = (ev.proxima_evaluacion_fecha || '').trim().slice(0, 10);
    if (prox && /^\d{4}-\d{2}-\d{2}$/.test(prox)) {
      if (!maxProxima || prox > maxProxima) {
        maxProxima = prox;
      }
    }
  }

  return {
    ultima_evaluacion_in_situ_fecha: maxUltima,
    proxima_evaluacion_in_situ_fecha: maxProxima,
    sin_registro_evaluacion: maxUltima === null,
  };
}

export function sortEvaluacionesInSituChronological(
  evaluaciones: ReadonlyArray<EvaluacionInSituAuditorEntity> | undefined | null
): EvaluacionInSituAuditorEntity[] {
  if (!Array.isArray(evaluaciones)) return [];
  return evaluaciones
    .filter((ev) => !ev.deleted_at)
    .slice()
    .sort((a, b) => {
      const dateA = (a.ultima_evaluacion_fecha || a.proxima_evaluacion_fecha || '').trim();
      const dateB = (b.ultima_evaluacion_fecha || b.proxima_evaluacion_fecha || '').trim();
      if (dateA && dateB && dateA !== dateB) {
        return dateB.localeCompare(dateA);
      }
      if (dateA && !dateB) return -1;
      if (!dateA && dateB) return 1;
      return (b.etiqueta_periodo || '').localeCompare(a.etiqueta_periodo || '', 'es');
    });
}

export interface FormatAuditorDisplayLabelOptions {
  includeSiglas?: boolean;
  includeCedula?: boolean;
}

export function formatAuditorDisplayLabel(
  auditor: Pick<AuditorDetailEntity, 'nombre'> &
    Partial<Pick<AuditorDetailEntity, 'siglas' | 'codigo_credencial' | 'cedula_identidad'>>,
  options: FormatAuditorDisplayLabelOptions = {}
): string {
  const nombre = (auditor.nombre || '').trim() || 'Auditor';
  const includeSiglas = options.includeSiglas !== false;
  const includeCedula = options.includeCedula !== false;
  const siglas = includeSiglas
    ? (auditor.siglas || auditor.codigo_credencial || '').trim()
    : '';
  const cedula = includeCedula ? (auditor.cedula_identidad || '').trim() : '';
  const metaParts: string[] = [];
  if (siglas) metaParts.push(siglas);
  if (cedula) metaParts.push(`C.I. ${cedula}`);
  return metaParts.length > 0 ? `${nombre} (${metaParts.join(' · ')})` : nombre;
}

export function formatAuditorSelectorLabel(
  auditor: Pick<AuditorDetailEntity, 'nombre'> &
    Partial<Pick<AuditorDetailEntity, 'siglas' | 'codigo_credencial' | 'cedula_identidad'>>
): string {
  return formatAuditorDisplayLabel(auditor);
}

export function detectDuplicateAuditorNames(
  auditors: ReadonlyArray<Pick<AuditorDetailEntity, 'nombre'>>
): Set<string> {
  const counts = new Map<string, number>();
  for (const aud of auditors) {
    const norm = normalizeText(aud?.nombre);
    if (!norm) continue;
    counts.set(norm, (counts.get(norm) ?? 0) + 1);
  }
  const duplicates = new Set<string>();
  for (const [name, count] of counts.entries()) {
    if (count > 1) duplicates.add(name);
  }
  return duplicates;
}

export function evaluateAuditorInSituStatus(
  auditor: Pick<
    AuditorDetailEntity,
    | 'sin_registro_evaluacion'
    | 'proxima_evaluacion_in_situ_fecha'
    | 'observaciones_evaluacion'
    | 'observacion_sectores'
  >,
  referenceDate?: string | Date
): AuditorInSituStatus {
  const combinedObs = normalizeText(
    `${auditor.observaciones_evaluacion || ''} ${auditor.observacion_sectores || ''}`
  ).toUpperCase();

  if (
    combinedObs.includes('PENDIENTE') ||
    combinedObs.includes('FALTA EVALUACION')
  ) {
    return 'Pendiente Evaluación';
  }

  if (combinedObs.includes('CONDICIONA')) {
    return 'Condicionado';
  }

  if (auditor.sin_registro_evaluacion || !auditor.proxima_evaluacion_in_situ_fecha) {
    return 'S/R';
  }

  const nextEvalMs = parseDateUtc(auditor.proxima_evaluacion_in_situ_fecha);
  if (Number.isNaN(nextEvalMs)) {
    return 'S/R';
  }

  const refIso =
    referenceDate instanceof Date
      ? referenceDate.toISOString().slice(0, 10)
      : typeof referenceDate === 'string' && referenceDate.trim()
      ? referenceDate.trim().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
  const refMs = parseDateUtc(refIso);

  if (nextEvalMs < refMs) {
    return 'Vencido';
  }

  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
  if (nextEvalMs - refMs <= ninetyDaysMs) {
    return 'Por Vencer';
  }

  return 'Vigente';
}

export function getAuditorInSituStatusVisual(status: AuditorInSituStatus): {
  label: AuditorInSituStatus;
  badgeClass: string;
  dotClass: string;
} {
  switch (status) {
    case 'Vigente':
      return {
        label: 'Vigente',
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        dotClass: 'bg-emerald-500',
      };
    case 'Por Vencer':
      return {
        label: 'Por Vencer',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
        dotClass: 'bg-amber-500',
      };
    case 'Vencido':
      return {
        label: 'Vencido',
        badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
        dotClass: 'bg-rose-500',
      };
    case 'Pendiente Evaluación':
      return {
        label: 'Pendiente Evaluación',
        badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
        dotClass: 'bg-sky-500',
      };
    case 'Condicionado':
      return {
        label: 'Condicionado',
        badgeClass: 'bg-orange-50 text-orange-800 border-orange-200',
        dotClass: 'bg-orange-500',
      };
    case 'S/R':
    default:
      return {
        label: 'S/R',
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
        dotClass: 'bg-slate-400',
      };
  }
}

export function classifyAuditorObservacionSector(
  auditor: Pick<AuditorDetailEntity, 'observacion_sectores' | 'observaciones_evaluacion'>
): AuditorSectorObservacionClassification {
  const sectorObsRaw = (auditor.observacion_sectores || '').trim();
  const evalObsRaw = (auditor.observaciones_evaluacion || '').trim();
  const textoAlerta = sectorObsRaw || evalObsRaw;

  const normalizedSectorObs = normalizeText(sectorObsRaw).toUpperCase();
  const normalizedEvalObs = normalizeText(evalObsRaw).toUpperCase();
  const combinedNorm = `${normalizedSectorObs} ${normalizedEvalObs}`.trim();

  const requiereExpertoTecnico =
    combinedNorm.includes('EXPERTO') ||
    combinedNorm.includes('EXP TEC') ||
    combinedNorm.includes('EXP. TEC');

  if (!requiereExpertoTecnico) {
    return {
      requiereExpertoTecnico: false,
      sectoresCondicionados: [],
      textoAlerta,
    };
  }

  const scanSource = normalizedSectorObs.includes('EXP') ? sectorObsRaw : evalObsRaw || sectorObsRaw;
  const sectorNumbers = new Set<number>();
  const matches = scanSource.match(/\b\d{1,4}\b/g) || [];
  for (const token of matches) {
    const num = Number(token);
    if (!Number.isInteger(num)) continue;
    if (num >= 1 && num <= 39) {
      sectorNumbers.add(num);
    }
  }

  return {
    requiereExpertoTecnico: true,
    sectoresCondicionados: Array.from(sectorNumbers).sort((a, b) => a - b),
    textoAlerta,
  };
}

const SPANISH_PROFESSION_LOWER_WORDS = new Set([
  'de',
  'del',
  'en',
  'y',
  'e',
  'o',
  'a',
  'la',
  'las',
  'el',
  'los',
  'para',
]);

const SPANISH_PROFESSION_ACRONYMS = new Set(['TSU', 'IAF', 'ISO', 'SGC', 'SGA', 'SST', 'TIC']);

export function normalizeAuditorProfessionLabel(raw: string | null | undefined): string {
  const clean = (raw || '').trim().replace(/\s+/g, ' ');
  if (!clean) return '';

  const tokens = clean.split(' ');
  return tokens
    .map((token, idx) => {
      if (token === '/' || token === '-' || token === '·') {
        return token;
      }
      const upper = token.toUpperCase();
      if (SPANISH_PROFESSION_ACRONYMS.has(upper)) {
        return upper;
      }
      const lower = token.toLocaleLowerCase('es');
      if (idx > 0 && tokens[idx - 1] !== '/' && SPANISH_PROFESSION_LOWER_WORDS.has(lower)) {
        return lower;
      }
      return lower.charAt(0).toLocaleUpperCase('es') + lower.slice(1);
    })
    .join(' ');
}

export function formatShortIsoStandardLabel(normaCodigo: string): string {
  const clean = (normaCodigo || '').trim().replace(/\s+/g, ' ');
  if (!clean) return '';
  return clean
    .replace(/^ISO\/IEC\s+/i, 'ISO ')
    .replace(/:\d{4}$/, '')
    .trim();
}

export function extractAuditorComplementarySchemes(
  auditor: Pick<AuditorDetailEntity, 'esquemas_complementarios' | 'sistema_gestion_secundario'>
): string[] {
  const rawSources = [auditor.esquemas_complementarios, auditor.sistema_gestion_secundario]
    .map((val) => (val || '').trim())
    .filter(Boolean);

  if (rawSources.length === 0) return [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const source of rawSources) {
    const parts = source
      .split(/[,;/|+\n]+/)
      .map((part) => part.trim())
      .filter(Boolean);

    for (const part of parts) {
      const upper = normalizeText(part).toUpperCase();
      if (!upper || upper === 'N/A' || upper === 'NA' || upper === 'NINGUNO' || upper === '-') {
        continue;
      }
      let canonical = part;
      if (upper.includes('MARCA')) {
        canonical = 'MARCA';
      } else if (upper.includes('HACCP')) {
        canonical = 'HACCP';
      } else if (upper.includes('FSSC')) {
        canonical = 'FSSC 22000';
      }
      const key = canonical.toUpperCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(canonical);
      }
    }
  }

  return result;
}

export function formatAuditorContactSummary(
  auditor: Pick<AuditorDetailEntity, 'telefonos' | 'emails' | 'telefono' | 'email'>
): AuditorContactSummary {
  const activeEmails: string[] = [];
  const seenEmails = new Set<string>();

  const activeEmailObjs = Array.isArray(auditor.emails)
    ? auditor.emails.filter((e) => !e.deleted_at && Boolean(e.email?.trim()))
    : [];
  const orderedEmails = [
    ...activeEmailObjs.filter((e) => e.es_principal),
    ...activeEmailObjs.filter((e) => !e.es_principal),
  ];

  for (const item of orderedEmails) {
    const trimmed = item.email.trim();
    const key = trimmed.toLowerCase();
    if (!seenEmails.has(key)) {
      seenEmails.add(key);
      activeEmails.push(trimmed);
    }
  }

  const legacyEmail = (auditor.email || '').trim();
  if (legacyEmail && !seenEmails.has(legacyEmail.toLowerCase())) {
    seenEmails.add(legacyEmail.toLowerCase());
    activeEmails.push(legacyEmail);
  }

  const activePhones: string[] = [];
  const seenPhones = new Set<string>();

  const activePhoneObjs = Array.isArray(auditor.telefonos)
    ? auditor.telefonos.filter((t) => !t.deleted_at && Boolean(t.telefono?.trim()))
    : [];
  const orderedPhones = [
    ...activePhoneObjs.filter((t) => t.es_principal),
    ...activePhoneObjs.filter((t) => !t.es_principal),
  ];

  for (const item of orderedPhones) {
    const trimmed = item.telefono.trim();
    const key = trimmed.replace(/\s+/g, '');
    if (!seenPhones.has(key)) {
      seenPhones.add(key);
      activePhones.push(trimmed);
    }
  }

  const legacyPhone = (auditor.telefono || '').trim();
  if (legacyPhone && !seenPhones.has(legacyPhone.replace(/\s+/g, ''))) {
    seenPhones.add(legacyPhone.replace(/\s+/g, ''));
    activePhones.push(legacyPhone);
  }

  return {
    primaryEmail: activeEmails[0] || '',
    extraEmailsCount: Math.max(0, activeEmails.length - 1),
    allEmails: activeEmails,
    primaryPhone: activePhones[0] || '',
    extraPhonesCount: Math.max(0, activePhones.length - 1),
    allPhones: activePhones,
  };
}

export function summarizeAuditorSectorCoverage(
  auditor: AuditorDetailEntity,
  sectoresCatalog: ReadonlyArray<{ id: string; sector: number; descripcion: string }> = [],
  subsectoresCatalog: ReadonlyArray<SubsectorIafCascadeItem> = []
): AuditorSectorCoverageSummary {
  const sectorSet = new Set<number>();
  for (const link of getAuditorSectorLinks(auditor, sectoresCatalog)) {
    if (Number.isInteger(link.sector_numero) && link.sector_numero > 0) {
      sectorSet.add(link.sector_numero);
    }
  }
  for (const num of auditor.sectores_iaf || []) {
    if (Number.isInteger(num) && num > 0) {
      sectorSet.add(num);
    }
  }

  const subsectorCodesSet = new Set<string>();
  for (const sub of getAuditorSubsectorLinks(auditor, subsectoresCatalog)) {
    if (Number.isInteger(sub.sector_numero) && sub.sector_numero > 0) {
      sectorSet.add(sub.sector_numero);
    }
    const cleanCode = (sub.subsector_codigo || '').trim();
    if (cleanCode && cleanCode !== '—') {
      subsectorCodesSet.add(cleanCode);
    }
  }

  const sectorNumbers = Array.from(sectorSet).sort((a, b) => a - b);
  const subsectorCodes = Array.from(subsectorCodesSet).sort((a, b) =>
    a.localeCompare(b, 'es', { numeric: true })
  );

  if (sectorNumbers.length === 0 && subsectorCodes.length === 0) {
    return {
      sectorNumbers: [],
      subsectorCodes: [],
      previewText: 'Sin sectores asignados',
      tooltipText: 'Sin sectores IAF asignados',
      isEmpty: true,
    };
  }

  const previewSource =
    subsectorCodes.length > 0 ? subsectorCodes : sectorNumbers.map((s) => `S${s}`);
  const maxPreview = 3;
  const shown = previewSource.slice(0, maxPreview);
  const remaining = previewSource.length - shown.length;
  const previewText = remaining > 0 ? `${shown.join(', ')} +${remaining} más` : shown.join(', ');

  const sectorTooltip =
    sectorNumbers.length > 0
      ? `Sectores IAF: ${sectorNumbers.map((s) => `S${s}`).join(', ')}`
      : '';
  const subsectorTooltip =
    subsectorCodes.length > 0 ? `Sub-sectores: ${subsectorCodes.join(', ')}` : '';
  const tooltipText = [sectorTooltip, subsectorTooltip].filter(Boolean).join(' · ');

  return {
    sectorNumbers,
    subsectorCodes,
    previewText,
    tooltipText,
    isEmpty: false,
  };
}

export function resolveAuditorInSituFacetBucket(
  auditor: Pick<
    AuditorDetailEntity,
    | 'sin_registro_evaluacion'
    | 'proxima_evaluacion_in_situ_fecha'
    | 'observaciones_evaluacion'
    | 'observacion_sectores'
  >,
  referenceDate?: string | Date
): AuditorInSituFacetBucket {
  const status = evaluateAuditorInSituStatus(auditor, referenceDate);
  if (status === 'Pendiente Evaluación' || status === 'Condicionado') {
    return 'Pendiente / Condicionado';
  }
  return status;
}

export function buildAuditorSearchableText(
  auditor: AuditorDetailEntity,
  normasCatalog: ReadonlyArray<NormaCatalogRef> = [],
  sectoresCatalog: ReadonlyArray<{ id: string; sector: number; descripcion: string }> = [],
  subsectoresCatalog: ReadonlyArray<SubsectorIafCascadeItem> = []
): string {
  const normaLinks = getAuditorNormaLinks(auditor, normasCatalog);
  const sectorLinks = getAuditorSectorLinks(auditor, sectoresCatalog);
  const subsectorLinks = getAuditorSubsectorLinks(auditor, subsectoresCatalog);
  const schemes = extractAuditorComplementarySchemes(auditor);
  const contacts = formatAuditorContactSummary(auditor);
  const inSituStatus = evaluateAuditorInSituStatus(auditor);
  const inSituBucket = resolveAuditorInSituFacetBucket(auditor);

  const sectorNums = new Set<number>([
    ...auditor.sectores_iaf,
    ...sectorLinks.map((s) => s.sector_numero),
    ...subsectorLinks.map((sub) => sub.sector_numero),
  ]);

  const parts: string[] = [
    auditor.nombre,
    auditor.siglas,
    auditor.cedula_identidad,
    auditor.profesion,
    auditor.titulo_profesional,
    auditor.codigo_credencial,
    auditor.categoria_profesional,
    auditor.calificacion,
    auditor.esquemas_complementarios,
    auditor.sistema_gestion_secundario,
    auditor.sector_area_evaluado_texto,
    auditor.observaciones_evaluacion,
    auditor.observacion_sectores,
    auditor.biografia,
    inSituStatus,
    inSituBucket,
    ...contacts.allEmails,
    ...contacts.allPhones,
    ...normaLinks.map((l) => `${l.norma_codigo} ${l.norma_titulo || ''}`),
    ...auditor.normas_acreditadas,
    ...auditor.normas_acreditadas.map((n) => formatShortIsoStandardLabel(n)),
    ...schemes,
    ...Array.from(sectorNums).map((n) => `Sector ${n} S${n}`),
    ...sectorLinks.map((s) => `${s.sector_numero} ${s.sector_descripcion}`),
    ...subsectorLinks.map((sub) => `${sub.subsector_codigo} ${sub.subsector_descripcion}`),
  ];

  return parts.filter(Boolean).join(' ');
}

export function createEmptyAuditorFormDraft(): AuditorFormDraft {
  return {
    nombre: '',
    siglas: '',
    cedula_identidad: '',
    profesion: '',
    esquemas_complementarios: '',
    anio_actualizacion_normas: null,
    sistema_gestion_secundario: '',
    ultima_evaluacion_in_situ_texto: '',
    proxima_evaluacion_in_situ_texto: '',
    ultima_evaluacion_in_situ_fecha: null,
    proxima_evaluacion_in_situ_fecha: null,
    sin_registro_evaluacion: false,
    sector_area_evaluado_texto: '',
    observaciones_evaluacion: '',
    anio_actualizacion_sectores: null,
    observacion_sectores: '',
  };
}

export function createAuditorDraftFromEntity(
  auditor: Pick<AuditorDetailEntity, 'nombre'> & Partial<AuditorDetailEntity>
): AuditorFormDraft {
  return {
    nombre: auditor.nombre || '',
    siglas: auditor.siglas || auditor.codigo_credencial || '',
    cedula_identidad: auditor.cedula_identidad || '',
    profesion: auditor.profesion || auditor.titulo_profesional || '',
    esquemas_complementarios: auditor.esquemas_complementarios || '',
    anio_actualizacion_normas: auditor.anio_actualizacion_normas ?? null,
    sistema_gestion_secundario: auditor.sistema_gestion_secundario || '',
    ultima_evaluacion_in_situ_texto: auditor.ultima_evaluacion_in_situ_texto || '',
    proxima_evaluacion_in_situ_texto: auditor.proxima_evaluacion_in_situ_texto || '',
    ultima_evaluacion_in_situ_fecha: auditor.ultima_evaluacion_in_situ_fecha ?? null,
    proxima_evaluacion_in_situ_fecha: auditor.proxima_evaluacion_in_situ_fecha ?? null,
    sin_registro_evaluacion: Boolean(auditor.sin_registro_evaluacion),
    sector_area_evaluado_texto: auditor.sector_area_evaluado_texto || '',
    observaciones_evaluacion: auditor.observaciones_evaluacion || '',
    anio_actualizacion_sectores: auditor.anio_actualizacion_sectores ?? null,
    observacion_sectores: auditor.observacion_sectores || '',
  };
}

export function createEmptyAuditorTelefonoDraft(): AuditorTelefonoFormDraft {
  return {
    telefono: '',
    tipo_telefono: 'Móvil',
    es_principal: false,
  };
}

export function createEmptyAuditorEmailDraft(): AuditorEmailFormDraft {
  return {
    email: '',
    tipo_email: 'Principal',
    es_principal: false,
  };
}

export function createEmptyEvaluacionInSituDraft(): EvaluacionInSituFormDraft {
  return {
    etiqueta_periodo: '',
    norma_referencia: '',
    sector_area_evaluado: '',
    ultima_evaluacion_fecha: null,
    proxima_evaluacion_fecha: null,
    ultima_evaluacion_texto: '',
    proxima_evaluacion_texto: '',
    observaciones: '',
  };
}

function normalizeOptionalYear(
  raw: number | string | null | undefined,
  label: string
): { ok: true; value: number | null } | { ok: false; message: string } {
  if (raw === null || raw === undefined || raw === '') {
    return { ok: true, value: null };
  }
  const parsed = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isInteger(parsed) || parsed < AUDITOR_YEAR_MIN || parsed > AUDITOR_YEAR_MAX) {
    return {
      ok: false,
      message: `${label} debe ser un año válido entre ${AUDITOR_YEAR_MIN} y ${AUDITOR_YEAR_MAX}.`,
    };
  }
  return { ok: true, value: parsed };
}

function normalizeOptionalIsoDate(
  raw: string | null | undefined
): { ok: true; value: string | null } | { ok: false; message: string } {
  const clean = (raw || '').trim();
  if (!clean) return { ok: true, value: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return {
      ok: false,
      message: 'Las fechas de evaluación in situ deben tener formato válido AAAA-MM-DD.',
    };
  }
  const time = parseDateUtc(clean);
  if (Number.isNaN(time)) {
    return { ok: false, message: 'La fecha de evaluación in situ ingresada no es válida.' };
  }
  return { ok: true, value: clean };
}

export function validateAuditorDraft(
  draft: Partial<AuditorFormDraft> & { nombre: string },
  existingAuditors: ReadonlyArray<{
    id: string;
    nombre: string;
    cedula_identidad?: string | null;
    deleted_at?: string | null;
  }>,
  excludeId?: string
): { valid: boolean; message?: string; normalized: AuditorFormDraft } {
  const nombre = (draft.nombre || '').trim().replace(/\s+/g, ' ');
  const siglas = (draft.siglas || '').trim().toUpperCase();
  const cedula = (draft.cedula_identidad || '').trim().replace(/\s+/g, '').toUpperCase();
  const profesion = (draft.profesion || '').trim().replace(/\s+/g, ' ');
  const esquemas_complementarios = (draft.esquemas_complementarios || '').trim();
  const sistema_gestion_secundario = (draft.sistema_gestion_secundario || '').trim();
  const ultima_evaluacion_in_situ_texto = (draft.ultima_evaluacion_in_situ_texto || '').trim();
  const proxima_evaluacion_in_situ_texto = (draft.proxima_evaluacion_in_situ_texto || '').trim();
  const sector_area_evaluado_texto = (draft.sector_area_evaluado_texto || '').trim();
  const observaciones_evaluacion = (draft.observaciones_evaluacion || '').trim();
  const observacion_sectores = (draft.observacion_sectores || '').trim();

  const anioNormasCheck = normalizeOptionalYear(
    draft.anio_actualizacion_normas,
    'El año de actualización de normas'
  );
  const anioSectoresCheck = normalizeOptionalYear(
    draft.anio_actualizacion_sectores,
    'El año de actualización de sectores'
  );
  const ultFechaCheck = normalizeOptionalIsoDate(draft.ultima_evaluacion_in_situ_fecha);
  const proxFechaCheck = normalizeOptionalIsoDate(draft.proxima_evaluacion_in_situ_fecha);

  const normalized: AuditorFormDraft = {
    nombre,
    siglas,
    cedula_identidad: cedula,
    profesion,
    esquemas_complementarios,
    anio_actualizacion_normas: anioNormasCheck.ok ? anioNormasCheck.value : null,
    sistema_gestion_secundario,
    ultima_evaluacion_in_situ_texto,
    proxima_evaluacion_in_situ_texto,
    ultima_evaluacion_in_situ_fecha: ultFechaCheck.ok ? ultFechaCheck.value : null,
    proxima_evaluacion_in_situ_fecha: proxFechaCheck.ok ? proxFechaCheck.value : null,
    sin_registro_evaluacion: Boolean(draft.sin_registro_evaluacion),
    sector_area_evaluado_texto,
    observaciones_evaluacion,
    anio_actualizacion_sectores: anioSectoresCheck.ok ? anioSectoresCheck.value : null,
    observacion_sectores,
  };

  if (nombre.length < 3) {
    return {
      valid: false,
      message: 'El nombre completo del auditor debe tener al menos 3 caracteres.',
      normalized,
    };
  }

  if (nombre.length > AUDITOR_NOMBRE_MAX_LENGTH) {
    return {
      valid: false,
      message: `El nombre del auditor no puede superar los ${AUDITOR_NOMBRE_MAX_LENGTH} caracteres.`,
      normalized,
    };
  }

  if (!/^[A-Z0-9]{2,12}$/.test(siglas)) {
    return {
      valid: false,
      message: `Las siglas del auditor deben tener entre ${AUDITOR_SIGLAS_MIN_LENGTH} y ${AUDITOR_SIGLAS_MAX_LENGTH} caracteres alfanuméricos.`,
      normalized,
    };
  }

  if (!excludeId && !cedula) {
    return {
      valid: false,
      message: 'La cédula de identidad es obligatoria para registrar un nuevo auditor.',
      normalized,
    };
  }

  if (cedula) {
    if (
      cedula.length < AUDITOR_CEDULA_MIN_LENGTH ||
      cedula.length > AUDITOR_CEDULA_MAX_LENGTH ||
      !/^[A-Z0-9.-]+$/.test(cedula)
    ) {
      return {
        valid: false,
        message: `La cédula de identidad debe tener entre ${AUDITOR_CEDULA_MIN_LENGTH} y ${AUDITOR_CEDULA_MAX_LENGTH} caracteres alfanuméricos válidos.`,
        normalized,
      };
    }

    const duplicateCedula = existingAuditors.some(
      (a) =>
        !a.deleted_at &&
        a.id !== excludeId &&
        Boolean(a.cedula_identidad?.trim()) &&
        a.cedula_identidad!.trim().replace(/\s+/g, '').toUpperCase() === cedula
    );
    if (duplicateCedula) {
      return {
        valid: false,
        message: 'Ya existe un auditor activo con esa cédula de identidad.',
        normalized,
      };
    }
  }

  if (profesion.length > AUDITOR_PROFESION_MAX_LENGTH) {
    return {
      valid: false,
      message: `La profesión no puede superar los ${AUDITOR_PROFESION_MAX_LENGTH} caracteres.`,
      normalized,
    };
  }

  if (!anioNormasCheck.ok) {
    return { valid: false, message: anioNormasCheck.message, normalized };
  }

  if (!anioSectoresCheck.ok) {
    return { valid: false, message: anioSectoresCheck.message, normalized };
  }

  if (!ultFechaCheck.ok) {
    return { valid: false, message: ultFechaCheck.message, normalized };
  }

  if (!proxFechaCheck.ok) {
    return { valid: false, message: proxFechaCheck.message, normalized };
  }

  return { valid: true, normalized };
}

const AUDITOR_PHONE_FORMAT_REGEX = /^[+\d()\s.-]{6,50}$/;
const AUDITOR_EMAIL_FORMAT_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

export function validateAuditorTelefonoDraft(
  draft: AuditorTelefonoFormDraft,
  existingTelefonos: ReadonlyArray<Pick<TelefonoAuditorEntity, 'telefono' | 'deleted_at'>> = []
): { valid: boolean; message?: string; normalized: AuditorTelefonoFormDraft } {
  const telefono = (draft.telefono || '').trim().replace(/\s+/g, ' ');
  const tipo_telefono = (draft.tipo_telefono || 'Móvil').trim() || 'Móvil';
  const normalized: AuditorTelefonoFormDraft = {
    telefono,
    tipo_telefono,
    es_principal: Boolean(draft.es_principal),
  };

  if (!telefono) {
    return { valid: false, message: 'El número telefónico es obligatorio.', normalized };
  }

  if (telefono.length > AUDITOR_TELEFONO_MAX_LENGTH || !AUDITOR_PHONE_FORMAT_REGEX.test(telefono)) {
    return {
      valid: false,
      message: 'Ingrese un número telefónico válido (mínimo 6 dígitos o caracteres telefónicos).',
      normalized,
    };
  }

  const dup = existingTelefonos.some(
    (t) => !t.deleted_at && t.telefono.trim() === telefono
  );
  if (dup) {
    return {
      valid: false,
      message: 'Ese número de teléfono ya está registrado para este auditor.',
      normalized,
    };
  }

  return { valid: true, normalized };
}

export function validateAuditorEmailDraft(
  draft: AuditorEmailFormDraft,
  existingEmails: ReadonlyArray<Pick<EmailAuditorEntity, 'email' | 'deleted_at'>> = []
): { valid: boolean; message?: string; normalized: AuditorEmailFormDraft } {
  const email = (draft.email || '').trim().toLowerCase();
  const tipo_email = (draft.tipo_email || 'Principal').trim() || 'Principal';
  const normalized: AuditorEmailFormDraft = {
    email,
    tipo_email,
    es_principal: Boolean(draft.es_principal),
  };

  if (!email) {
    return { valid: false, message: 'El correo electrónico es obligatorio.', normalized };
  }

  if (email.length > AUDITOR_EMAIL_MAX_LENGTH || !AUDITOR_EMAIL_FORMAT_REGEX.test(email)) {
    return {
      valid: false,
      message: 'Ingrese un correo electrónico válido (ej. auditor@dominio.com).',
      normalized,
    };
  }

  const dup = existingEmails.some(
    (e) => !e.deleted_at && e.email.trim().toLowerCase() === email
  );
  if (dup) {
    return {
      valid: false,
      message: 'Ese correo electrónico ya está registrado para este auditor.',
      normalized,
    };
  }

  return { valid: true, normalized };
}

export function validateEvaluacionInSituDraft(
  draft: EvaluacionInSituFormDraft
): { valid: boolean; message?: string; normalized: EvaluacionInSituFormDraft } {
  const ultCheck = normalizeOptionalIsoDate(draft.ultima_evaluacion_fecha);
  const proxCheck = normalizeOptionalIsoDate(draft.proxima_evaluacion_fecha);

  const normalized: EvaluacionInSituFormDraft = {
    etiqueta_periodo: (draft.etiqueta_periodo || '').trim(),
    norma_referencia: (draft.norma_referencia || '').trim(),
    sector_area_evaluado: (draft.sector_area_evaluado || '').trim(),
    ultima_evaluacion_fecha: ultCheck.ok ? ultCheck.value : null,
    proxima_evaluacion_fecha: proxCheck.ok ? proxCheck.value : null,
    ultima_evaluacion_texto: (draft.ultima_evaluacion_texto || '').trim(),
    proxima_evaluacion_texto: (draft.proxima_evaluacion_texto || '').trim(),
    observaciones: (draft.observaciones || '').trim(),
  };

  if (!ultCheck.ok) {
    return { valid: false, message: ultCheck.message, normalized };
  }
  if (!proxCheck.ok) {
    return { valid: false, message: proxCheck.message, normalized };
  }

  const hasAnyContent = Boolean(
    normalized.etiqueta_periodo ||
      normalized.norma_referencia ||
      normalized.sector_area_evaluado ||
      normalized.ultima_evaluacion_fecha ||
      normalized.proxima_evaluacion_fecha ||
      normalized.ultima_evaluacion_texto ||
      normalized.proxima_evaluacion_texto ||
      normalized.observaciones
  );
  if (!hasAnyContent) {
    return {
      valid: false,
      message: 'Debe ingresar al menos un período, fecha, sector o nota de evaluación in situ.',
      normalized,
    };
  }

  return { valid: true, normalized };
}

export function createEmptyCompetenciaFormDraft(
  prefillAuditorId = '',
  tipo: CompetenciaTipo = 'norma'
): CompetenciaAuditorFormDraft {
  return {
    id_auditor: (prefillAuditorId || '').trim(),
    tipo,
    id_norma: '',
    id_sector_iaf: '',
    id_subsector_iaf: '',
  };
}

/**
 * Pure cascade engine for Competency M:N assignment (`sector_iaf` -> `subsector_iaf`).
 * Mirrors `applySectorIafCascadeToDraft` for `subsector_iaf` mode.
 */
export function applyCompetenciaSectorCascade<
  T extends SubsectorIafCascadeItem = SubsectorIafCascadeItem
>(params: {
  draft: CompetenciaAuditorFormDraft;
  nextSectorId: string;
  sectores: ReadonlyArray<SectorIafCascadeItem>;
  subsectores: ReadonlyArray<T>;
}): {
  draft: CompetenciaAuditorFormDraft;
  filteredSubsectores: T[];
} {
  const cleanSectorId = (params.nextSectorId || '').trim();
  const filteredSubsectores = filterSubsectoresBySectorIaf({
    sectorId: cleanSectorId,
    sectores: params.sectores,
    subsectores: params.subsectores,
  });

  const nextSubsectorId =
    params.draft.tipo === 'subsector_iaf'
      ? reconcileSubsectorSelectionOnSectorChange({
          nextSectorId: cleanSectorId,
          currentSubsectorId: params.draft.id_subsector_iaf,
          sectores: params.sectores,
          subsectores: params.subsectores,
        })
      : '';

  return {
    draft: {
      ...params.draft,
      id_sector_iaf: cleanSectorId,
      id_subsector_iaf: nextSubsectorId,
    },
    filteredSubsectores,
  };
}

export interface NormaCatalogRef {
  id: string;
  codigo?: string;
  norma?: string;
  titulo?: string;
  esquema?: string;
}

export function getAuditorNormaLinks(
  auditor: AuditorDetailEntity,
  normasCatalog: ReadonlyArray<NormaCatalogRef> = []
): AuditorNormaLink[] {
  if (auditor.normaLinks !== undefined) {
    return auditor.normaLinks;
  }
  const map = new Map<string, AuditorNormaLink>();
  for (const comp of auditor.competencias || []) {
    if (!comp.id_norma) continue;
    if (!map.has(comp.id_norma)) {
      const cat = normasCatalog.find((n) => n.id === comp.id_norma);
      map.set(comp.id_norma, {
        id_auditor: auditor.id,
        id_norma: comp.id_norma,
        norma_codigo: cat?.codigo || cat?.norma || comp.norma_codigo,
        norma_titulo: cat?.titulo || comp.norma_titulo,
        esquema: cat?.esquema,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.norma_codigo.localeCompare(b.norma_codigo, 'es')
  );
}

export function getAuditorSectorLinks(
  auditor: AuditorDetailEntity,
  sectoresCatalog: ReadonlyArray<{ id: string; sector: number; descripcion: string }> = []
): AuditorSectorLink[] {
  if (auditor.sectorLinks !== undefined) {
    return auditor.sectorLinks;
  }
  const map = new Map<string, AuditorSectorLink>();
  for (const comp of auditor.competencias || []) {
    if (!comp.id_sector_iaf) continue;
    if (!map.has(comp.id_sector_iaf)) {
      const cat = sectoresCatalog.find((s) => s.id === comp.id_sector_iaf);
      map.set(comp.id_sector_iaf, {
        id_auditor: auditor.id,
        id_sector_iaf: comp.id_sector_iaf,
        sector_numero: cat?.sector ?? comp.sector_iaf_numero,
        sector_descripcion: cat?.descripcion || comp.sector_iaf_descripcion,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.sector_numero - b.sector_numero);
}

export function getAuditorSubsectorLinks(
  auditor: AuditorDetailEntity,
  subsectoresCatalog: ReadonlyArray<SubsectorIafCascadeItem> = []
): AuditorSubsectorLink[] {
  if (auditor.subsectorLinks !== undefined) {
    return auditor.subsectorLinks;
  }
  const map = new Map<string, AuditorSubsectorLink>();
  for (const comp of auditor.competencias || []) {
    if (!comp.id_subsector_iaf) continue;
    if (!map.has(comp.id_subsector_iaf)) {
      const cat = subsectoresCatalog.find((s) => s.id === comp.id_subsector_iaf);
      map.set(comp.id_subsector_iaf, {
        id_auditor: auditor.id,
        id_subsector_iaf: comp.id_subsector_iaf,
        id_sector_iaf: cat?.id_sector_iaf || comp.id_sector_iaf,
        sector_numero: cat?.sector_numero ?? comp.sector_iaf_numero,
        subsector_codigo: cat?.codigo || comp.subsector_iaf_codigo || '—',
        subsector_descripcion: cat?.descripcion || comp.subsector_iaf_descripcion || '',
        categoria_riesgo: cat?.categoria_riesgo,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.subsector_codigo.localeCompare(b.subsector_codigo, 'es', { numeric: true })
  );
}

export interface ValidateCompetenciaDraftParams {
  draft: CompetenciaAuditorFormDraft;
  auditors: ReadonlyArray<AuditorDetailEntity>;
  normas?: ReadonlyArray<NormaCatalogRef>;
  sectores?: ReadonlyArray<SectorIafCascadeItem>;
  subsectores?: ReadonlyArray<SubsectorIafCascadeItem>;
}

export interface CompetenciaDraftValidationResult {
  valid: boolean;
  message?: string;
  normalized?: CompetenciaAuditorFormDraft;
}

/**
 * Pure Zero-UUID + duplicate prevention validator for M:N auditor competencies
 * (`norma_auditor`, `sector_iaf_auditor`, `subsector_iaf_auditor`).
 */
export function validateCompetenciaDraft(
  params: ValidateCompetenciaDraftParams
): CompetenciaDraftValidationResult {
  const { draft, auditors, normas = [], sectores = [], subsectores = [] } = params;

  let id_auditor: string;
  try {
    id_auditor = assertValidUuid(draft.id_auditor, 'identificador del auditor');
  } catch {
    return {
      valid: false,
      message: 'Debe seleccionar un auditor válido.',
    };
  }

  const auditor = auditors.find((a) => a.id === id_auditor);
  if (!auditor) {
    return {
      valid: false,
      message: 'El auditor seleccionado no se encuentra activo en el directorio.',
    };
  }

  const tipo: CompetenciaTipo =
    draft.tipo === 'sector_iaf' || draft.tipo === 'subsector_iaf' ? draft.tipo : 'norma';

  if (tipo === 'norma') {
    let id_norma: string;
    try {
      id_norma = assertValidUuid(draft.id_norma, 'identificador de la norma');
    } catch {
      return {
        valid: false,
        message: 'Debe seleccionar una Norma ISO válida.',
      };
    }

    if (normas.length > 0 && !normas.some((n) => n.id === id_norma)) {
      return {
        valid: false,
        message: 'La Norma ISO seleccionada no existe o está archivada.',
      };
    }

    const existingNormaLinks = getAuditorNormaLinks(auditor, normas);
    if (existingNormaLinks.some((link) => link.id_norma === id_norma)) {
      return {
        valid: false,
        message: 'El auditor ya posee esta Norma ISO asignada en su matriz de competencias.',
      };
    }

    return {
      valid: true,
      normalized: {
        id_auditor,
        tipo: 'norma',
        id_norma,
        id_sector_iaf: '',
        id_subsector_iaf: '',
      },
    };
  }

  if (tipo === 'sector_iaf') {
    let id_sector_iaf: string;
    try {
      id_sector_iaf = assertValidUuid(draft.id_sector_iaf, 'identificador del sector IAF');
    } catch {
      return {
        valid: false,
        message: 'Debe seleccionar un Sector IAF válido.',
      };
    }

    if (sectores.length > 0 && !sectores.some((s) => s.id === id_sector_iaf)) {
      return {
        valid: false,
        message: 'El Sector IAF seleccionado no existe o está archivado.',
      };
    }

    const existingSectorLinks = getAuditorSectorLinks(auditor);
    if (existingSectorLinks.some((link) => link.id_sector_iaf === id_sector_iaf)) {
      return {
        valid: false,
        message: 'El auditor ya posee este Sector IAF asignado en su matriz de competencias.',
      };
    }

    return {
      valid: true,
      normalized: {
        id_auditor,
        tipo: 'sector_iaf',
        id_norma: '',
        id_sector_iaf,
        id_subsector_iaf: '',
      },
    };
  }

  // tipo === 'subsector_iaf'
  let id_sector_iaf: string;
  try {
    id_sector_iaf = assertValidUuid(draft.id_sector_iaf, 'identificador del sector IAF');
  } catch {
    return {
      valid: false,
      message: 'Debe seleccionar primero un Sector IAF padre válido.',
    };
  }

  let id_subsector_iaf: string;
  try {
    id_subsector_iaf = assertValidUuid(draft.id_subsector_iaf, 'identificador del sub-sector IAF');
  } catch {
    return {
      valid: false,
      message: 'Debe seleccionar un Sub-Sector IAF válido.',
    };
  }

  if (sectores.length > 0 && subsectores.length > 0) {
    const validChildren = filterSubsectoresBySectorIaf({
      sectorId: id_sector_iaf,
      sectores,
      subsectores,
    });
    if (!validChildren.some((sub) => sub.id === id_subsector_iaf)) {
      return {
        valid: false,
        message: 'El Sub-Sector IAF seleccionado no pertenece al Sector IAF elegido.',
      };
    }
  }

  const existingSubsectorLinks = getAuditorSubsectorLinks(auditor, subsectores);
  if (existingSubsectorLinks.some((link) => link.id_subsector_iaf === id_subsector_iaf)) {
    return {
      valid: false,
      message: 'El auditor ya posee este Sub-Sector IAF asignado en su matriz de competencias.',
    };
  }

  return {
    valid: true,
    normalized: {
      id_auditor,
      tipo: 'subsector_iaf',
      id_norma: '',
      id_sector_iaf,
      id_subsector_iaf,
    },
  };
}

export function addCompetenciaLinkToAuditor(params: {
  auditor: AuditorDetailEntity;
  draft: CompetenciaAuditorFormDraft;
  normas: ReadonlyArray<NormaCatalogRef>;
  sectores: ReadonlyArray<{ id: string; sector: number; descripcion: string }>;
  subsectores: ReadonlyArray<SubsectorIafCascadeItem>;
}): AuditorDetailEntity {
  const { auditor, draft, normas, sectores, subsectores } = params;
  const currentNormaLinks = [...getAuditorNormaLinks(auditor, normas)];
  const currentSectorLinks = [...getAuditorSectorLinks(auditor, sectores)];
  const currentSubsectorLinks = [...getAuditorSubsectorLinks(auditor, subsectores)];

  if (draft.tipo === 'norma') {
    const matchedNorma = normas.find((n) => n.id === draft.id_norma);
    const normaCodigo = matchedNorma?.codigo || matchedNorma?.norma || 'Norma ISO';
    if (!currentNormaLinks.some((l) => l.id_norma === draft.id_norma)) {
      currentNormaLinks.push({
        id_auditor: auditor.id,
        id_norma: draft.id_norma,
        norma_codigo: normaCodigo,
        norma_titulo: matchedNorma?.titulo,
        esquema: matchedNorma?.esquema,
      });
      currentNormaLinks.sort((a, b) => a.norma_codigo.localeCompare(b.norma_codigo, 'es'));
    }
  } else if (draft.tipo === 'sector_iaf') {
    const matchedSector = sectores.find((s) => s.id === draft.id_sector_iaf);
    if (matchedSector && !currentSectorLinks.some((l) => l.id_sector_iaf === draft.id_sector_iaf)) {
      currentSectorLinks.push({
        id_auditor: auditor.id,
        id_sector_iaf: matchedSector.id,
        sector_numero: matchedSector.sector,
        sector_descripcion: matchedSector.descripcion,
      });
      currentSectorLinks.sort((a, b) => a.sector_numero - b.sector_numero);
    }
  } else if (draft.tipo === 'subsector_iaf') {
    const matchedSub = subsectores.find((sub) => sub.id === draft.id_subsector_iaf);
    if (matchedSub && !currentSubsectorLinks.some((l) => l.id_subsector_iaf === draft.id_subsector_iaf)) {
      currentSubsectorLinks.push({
        id_auditor: auditor.id,
        id_subsector_iaf: matchedSub.id,
        id_sector_iaf: matchedSub.id_sector_iaf,
        sector_numero: matchedSub.sector_numero,
        subsector_codigo: matchedSub.codigo,
        subsector_descripcion: matchedSub.descripcion,
        categoria_riesgo: matchedSub.categoria_riesgo,
        created_at: new Date().toISOString(),
      });
      currentSubsectorLinks.sort((a, b) =>
        a.subsector_codigo.localeCompare(b.subsector_codigo, 'es', { numeric: true })
      );
    }
  }

  return {
    ...auditor,
    normaLinks: currentNormaLinks,
    sectorLinks: currentSectorLinks,
    subsectorLinks: currentSubsectorLinks,
    normas_acreditadas: currentNormaLinks.map((l) => l.norma_codigo),
    sectores_iaf: currentSectorLinks.map((l) => l.sector_numero),
  };
}

export function removeCompetenciaLinkFromAuditor(params: {
  auditor: AuditorDetailEntity;
  tipo: CompetenciaTipo;
  targetId: string;
  normas: ReadonlyArray<NormaCatalogRef>;
  sectores: ReadonlyArray<{ id: string; sector: number; descripcion: string }>;
  subsectores: ReadonlyArray<SubsectorIafCascadeItem>;
}): AuditorDetailEntity {
  const { auditor, tipo, targetId, normas, sectores, subsectores } = params;
  let nextNormaLinks = [...getAuditorNormaLinks(auditor, normas)];
  let nextSectorLinks = [...getAuditorSectorLinks(auditor, sectores)];
  let nextSubsectorLinks = [...getAuditorSubsectorLinks(auditor, subsectores)];
  let nextCompetencias = [...(auditor.competencias || [])];

  if (tipo === 'norma') {
    nextNormaLinks = nextNormaLinks.filter((l) => l.id_norma !== targetId);
    nextCompetencias = nextCompetencias.filter((c) => c.id_norma !== targetId);
  } else if (tipo === 'sector_iaf') {
    nextSectorLinks = nextSectorLinks.filter((l) => l.id_sector_iaf !== targetId);
    nextCompetencias = nextCompetencias.filter((c) => c.id_sector_iaf !== targetId);
  } else {
    nextSubsectorLinks = nextSubsectorLinks.filter((l) => l.id_subsector_iaf !== targetId);
    nextCompetencias = nextCompetencias.filter((c) => c.id_subsector_iaf !== targetId);
  }

  return {
    ...auditor,
    normaLinks: nextNormaLinks,
    sectorLinks: nextSectorLinks,
    subsectorLinks: nextSubsectorLinks,
    competencias: nextCompetencias,
    normas_acreditadas: nextNormaLinks.map((l) => l.norma_codigo),
    sectores_iaf: nextSectorLinks.map((l) => l.sector_numero),
  };
}

export interface AuditorAuditHistorialSource {
  id: string;
  codigo_auditoria: string;
  organizacion_nombre: string;
  numero_certificado: string;
  norma_codigo: string;
  tipo_auditoria: string;
  metodologia?: string | null;
  fecha_inicio?: string | null;
  latestDate?: { fecha_inicio?: string | null } | null;
  estatus?: string | null;
  auditor_lider_id?: string | null;
  equipo?: ReadonlyArray<{
    id_auditor?: string | null;
    rol?: string | null;
  }>;
  sitiosPlan?: ReadonlyArray<{
    deleted_at?: string | null;
    equipoSitio?: ReadonlyArray<{
      id_auditor?: string | null;
      rol_auditor?: string | null;
      deleted_at?: string | null;
    }>;
  }>;
  deleted_at?: string | null;
}

function normalizeHistorialMetodologia(
  raw: string | null | undefined
): AuditoriaRealizadaEntity['metodologia'] {
  const norm = normalizeText(raw);
  if (norm.includes('remot')) return 'Remota';
  if (norm.includes('mixt')) return 'Mixta';
  return 'Presencial';
}

function normalizeHistorialEstatus(
  raw: string | null | undefined
): AuditoriaRealizadaEntity['estatus'] {
  const norm = normalizeText(raw);
  if (norm.includes('cerrad')) return 'Cerrada';
  if (norm.includes('complet')) return 'Completada';
  if (norm.includes('ejecu')) return 'En Ejecución';
  return 'Planificada';
}

function mapSiteRoleToHistorialLabel(rolAuditor: string | null | undefined): string {
  if (rolAuditor === 'AUDITOR_LIDER') return 'Auditor Líder';
  if (rolAuditor === 'EXPERTO_TECNICO') return 'Experto Técnico';
  return 'Auditor de Equipo';
}

export function deriveAuditorHistorialFromAudits(
  audits: ReadonlyArray<AuditorAuditHistorialSource>
): Map<string, AuditoriaRealizadaEntity[]> {
  const byAuditor = new Map<string, Map<string, AuditoriaRealizadaEntity>>();

  for (const audit of audits) {
    if (!audit || audit.deleted_at || !audit.id) continue;
    const rolesByAuditor = new Map<string, string>();

    if (Array.isArray(audit.equipo)) {
      for (const member of audit.equipo) {
        const memberId = (member?.id_auditor || '').trim();
        if (!memberId) continue;
        const roleLabel = (member?.rol || '').trim() || 'Auditor de Equipo';
        if (rolesByAuditor.get(memberId) !== 'Auditor Líder') {
          rolesByAuditor.set(memberId, roleLabel);
        }
      }
    }

    if (Array.isArray(audit.sitiosPlan)) {
      for (const site of audit.sitiosPlan) {
        if (!site || site.deleted_at || !Array.isArray(site.equipoSitio)) continue;
        for (const member of site.equipoSitio) {
          if (!member || member.deleted_at) continue;
          const memberId = (member.id_auditor || '').trim();
          if (!memberId) continue;
          const roleLabel = mapSiteRoleToHistorialLabel(member.rol_auditor);
          if (rolesByAuditor.get(memberId) !== 'Auditor Líder') {
            rolesByAuditor.set(memberId, roleLabel);
          }
        }
      }
    }

    const leadId = (audit.auditor_lider_id || '').trim();
    if (leadId) {
      rolesByAuditor.set(leadId, 'Auditor Líder');
    }

    if (rolesByAuditor.size === 0) continue;

    const fechaEjecucion = (
      audit.latestDate?.fecha_inicio ||
      audit.fecha_inicio ||
      ''
    ).trim();
    const metodologia = normalizeHistorialMetodologia(audit.metodologia);
    const estatus = normalizeHistorialEstatus(audit.estatus);

    for (const [auditorId, rolEnAuditoria] of rolesByAuditor.entries()) {
      let auditMap = byAuditor.get(auditorId);
      if (!auditMap) {
        auditMap = new Map<string, AuditoriaRealizadaEntity>();
        byAuditor.set(auditorId, auditMap);
      }
      if (!auditMap.has(audit.id)) {
        auditMap.set(audit.id, {
          id: audit.id,
          id_auditor: auditorId,
          codigo_auditoria: audit.codigo_auditoria,
          organizacion_nombre: audit.organizacion_nombre,
          numero_certificado: audit.numero_certificado,
          norma_codigo: audit.norma_codigo,
          tipo_auditoria: audit.tipo_auditoria,
          metodologia,
          rol_en_auditoria: rolEnAuditoria,
          fecha_ejecucion: fechaEjecucion,
          estatus,
        });
      }
    }
  }

  const result = new Map<string, AuditoriaRealizadaEntity[]>();
  for (const [auditorId, auditMap] of byAuditor.entries()) {
    const sorted = Array.from(auditMap.values()).sort((a, b) => {
      const dateCmp = (b.fecha_ejecucion || '').localeCompare(a.fecha_ejecucion || '');
      if (dateCmp !== 0) return dateCmp;
      return b.codigo_auditoria.localeCompare(a.codigo_auditoria, 'es');
    });
    result.set(auditorId, sorted);
  }
  return result;
}

export function enrichAuditorsWithHistorial(
  auditors: ReadonlyArray<AuditorDetailEntity>,
  audits: ReadonlyArray<AuditorAuditHistorialSource>
): AuditorDetailEntity[] {
  const derivedByAuditor = deriveAuditorHistorialFromAudits(audits);
  const liveAuditIds = new Set<string>();
  const liveAuditCodes = new Set<string>();
  for (const audit of audits) {
    if (!audit) continue;
    if (audit.id) liveAuditIds.add(audit.id);
    if (audit.codigo_auditoria) liveAuditCodes.add(audit.codigo_auditoria.trim().toLowerCase());
  }

  return auditors.map((auditor) => {
    const derived = derivedByAuditor.get(auditor.id) || [];
    const existing = Array.isArray(auditor.historialAuditorias)
      ? auditor.historialAuditorias
      : [];
    const preservedStatic = existing.filter((item) => {
      if (item.id && liveAuditIds.has(item.id)) return false;
      if (item.codigo_auditoria && liveAuditCodes.has(item.codigo_auditoria.trim().toLowerCase())) {
        return false;
      }
      return true;
    });

    if (derived.length === 0 && preservedStatic.length === existing.length) {
      return auditor;
    }

    const mergedById = new Map<string, AuditoriaRealizadaEntity>();
    const seenCodes = new Set<string>();
    for (const item of derived) {
      mergedById.set(item.id, item);
      if (item.codigo_auditoria) {
        seenCodes.add(item.codigo_auditoria.toLowerCase());
      }
    }
    for (const item of preservedStatic) {
      if (mergedById.has(item.id)) continue;
      if (item.codigo_auditoria && seenCodes.has(item.codigo_auditoria.toLowerCase())) {
        continue;
      }
      mergedById.set(item.id, item);
    }

    const historialAuditorias = Array.from(mergedById.values()).sort((a, b) => {
      const dateCmp = (b.fecha_ejecucion || '').localeCompare(a.fecha_ejecucion || '');
      if (dateCmp !== 0) return dateCmp;
      return b.codigo_auditoria.localeCompare(a.codigo_auditoria, 'es');
    });

    return {
      ...auditor,
      historialAuditorias,
    };
  });
}


