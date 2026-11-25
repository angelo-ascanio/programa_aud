import type { UniversalViewMode } from './universalTemplate';
import {
  filterSubsectoresBySectorIaf,
  reconcileSubsectorSelectionOnSectorChange,
  type SectorIafCascadeItem,
  type SubsectorIafCascadeItem,
} from './multisiteSampling';
import { assertValidUuid, containsRawUuid } from './zeroUuid';

export const EXPERTO_NOMBRE_MAX_LENGTH = 150;
export const EXPERTO_NOTAS_MAX_LENGTH = 2000;
export const EXPERTO_TELEFONO_MAX_LENGTH = 50;
export const EXPERTO_EMAIL_MAX_LENGTH = 200;

export const EXPERTO_DISPONIBILIDAD_VALUES = ['Disponible', 'No disponible'] as const;
export type ExpertoDisponibilidad = (typeof EXPERTO_DISPONIBILIDAD_VALUES)[number];

export const EXPERTO_TIPO_TELEFONO_OPTIONS = [
  'Móvil',
  'Oficina',
  'Directo',
  'Emergencia',
  'Otro',
] as const;

export const EXPERTO_TIPO_EMAIL_OPTIONS = [
  'Trabajo',
  'Personal',
  'Notificaciones',
  'Otro',
] as const;

export type ExpertoChildTab = 'competencias' | 'contacto' | 'historial';
export type ExpertoDetailMode = 'read' | 'add' | 'edit';
export type ExpertoCompetenciaMode = 'sector_iaf' | 'subsector_iaf';

export type ExpertoSortColumn =
  | 'nombre'
  | 'estatus'
  | 'competencias'
  | 'auditorias';

export interface ExpertoTelefonoItem {
  id: string;
  id_experto_tecnico: string;
  telefono: string;
  tipo_telefono: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface ExpertoEmailItem {
  id: string;
  id_experto_tecnico: string;
  email: string;
  tipo_email: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface ExpertoSectorLink {
  id_experto_tecnico: string;
  id_sector_iaf: string;
  sector_numero: number;
  sector_descripcion: string;
  created_at?: string;
}

export interface ExpertoSubsectorLink {
  id_experto_tecnico: string;
  id_subsector_iaf: string;
  id_sector_iaf: string;
  sector_numero: number;
  subsector_codigo: string;
  subsector_descripcion: string;
  categoria_riesgo?: string;
  created_at?: string;
}

export interface ExpertoAuditHistorialItem {
  id: string;
  id_auditoria: string;
  id_experto_tecnico: string;
  codigo_auditoria: string;
  organizacion_nombre: string;
  numero_certificado: string;
  dias_asignados: number;
  observacion: string | null;
  estatus?: string;
  tipo_auditoria?: string;
  deleted_at?: string | null;
}

export interface ExpertoTecnicoDetailEntity {
  id: string;
  nombre: string;
  estatus: ExpertoDisponibilidad;
  notas: string | null;
  telefonos: ExpertoTelefonoItem[];
  emails: ExpertoEmailItem[];
  sectorLinks: ExpertoSectorLink[];
  subsectorLinks: ExpertoSubsectorLink[];
  historialAuditorias: ExpertoAuditHistorialItem[];
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface ExpertoTecnicoFormDraft {
  nombre: string;
  estatus: ExpertoDisponibilidad;
  notas: string;
}

export interface ExpertoTelefonoFormDraft {
  telefono: string;
  tipo_telefono: string;
}

export interface ExpertoEmailFormDraft {
  email: string;
  tipo_email: string;
}

export interface ExpertoCompetenciaFormDraft {
  id_experto_tecnico: string;
  tipo: ExpertoCompetenciaMode;
  id_sector_iaf: string;
  id_subsector_iaf: string;
}

export interface ExpertoTecnicoViewState {
  selectedExpertoId: string | null;
  activeChildTab: ExpertoChildTab;
  query: string;
  viewMode: UniversalViewMode;
  isSidebarOpen?: boolean;
  facetSelections?: Record<string, Set<string>>;
  sortColumn: ExpertoSortColumn | null;
  sortDirection: 'asc' | 'desc' | 'none';
  isEditingAttributes: boolean;
  isCreating?: boolean;
  formDraft?: ExpertoTecnicoFormDraft;
  editErrorMessage?: string | null;
  isAddingTelefono?: boolean;
  telefonoDraft?: ExpertoTelefonoFormDraft;
  telefonoErrorMessage?: string | null;
  isAddingEmail?: boolean;
  emailDraft?: ExpertoEmailFormDraft;
  emailErrorMessage?: string | null;
  isAddingCompetencia?: boolean;
  competenciaDraft?: ExpertoCompetenciaFormDraft;
  competenciaErrorMessage?: string | null;
}

export type ExpertoCompetencyMatch = 'SUBSECTOR_EXACT' | 'SECTOR_FULL' | 'NONE';

const EMAIL_FORMAT_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const PHONE_FORMAT_REGEX = /^[+\d()\s.-]{6,50}$/;

export const INITIAL_EXPERTOS_TECNICOS: ExpertoTecnicoDetailEntity[] = [
  {
    id: '1e000000-0000-0000-0000-000000000001',
    nombre: 'Dra. Sofía Quintero',
    estatus: 'Disponible',
    notas: 'Química farmacéutica senior con 14 años en buenas prácticas de manufactura estéril.',
    telefonos: [
      {
        id: '1e100000-0000-0000-0000-000000000001',
        id_experto_tecnico: '1e000000-0000-0000-0000-000000000001',
        telefono: '+58 414 210-3101',
        tipo_telefono: 'Móvil',
      },
    ],
    emails: [
      {
        id: '1e200000-0000-0000-0000-000000000001',
        id_experto_tecnico: '1e000000-0000-0000-0000-000000000001',
        email: 'squintero.experto@fondonorma.test',
        tipo_email: 'Trabajo',
      },
    ],
    sectorLinks: [],
    subsectorLinks: [
      {
        id_experto_tecnico: '1e000000-0000-0000-0000-000000000001',
        id_subsector_iaf: 'da000000-0000-0000-0000-000000000132',
        id_sector_iaf: 'd0000000-0000-0000-0000-000000000013',
        sector_numero: 13,
        subsector_codigo: '13.2',
        subsector_descripcion: 'Fabricación de preparados farmacéuticos y especialidades medicinales',
        categoria_riesgo: 'ALTO',
      },
    ],
    historialAuditorias: [
      {
        id: '1e300000-0000-0000-0000-000000000001',
        id_auditoria: '80000000-0000-0000-0000-000000000201',
        id_experto_tecnico: '1e000000-0000-0000-0000-000000000001',
        codigo_auditoria: 'AUD-FAR-2026-001',
        organizacion_nombre: 'Laboratorios Farmacéuticos del Centro C.A.',
        numero_certificado: 'FN-SST-2026-201',
        dias_asignados: 1.0,
        observacion:
          'Acompañamiento técnico en áreas de formulación estéril y manejo de principios activos (Subsector 13.2).',
        estatus: 'Planificada',
        tipo_auditoria: 'Certificación Inicial (Etapa 2)',
      },
    ],
  },
  {
    id: '1e000000-0000-0000-0000-000000000002',
    nombre: 'Ing. Héctor Zambrano',
    estatus: 'Disponible',
    notas: 'Especialista en procesos industriales farmacéuticos, biotecnología y control ambiental de áreas limpias.',
    telefonos: [
      {
        id: '1e100000-0000-0000-0000-000000000002',
        id_experto_tecnico: '1e000000-0000-0000-0000-000000000002',
        telefono: '+58 412 320-4201',
        tipo_telefono: 'Móvil',
      },
      {
        id: '1e100000-0000-0000-0000-000000000003',
        id_experto_tecnico: '1e000000-0000-0000-0000-000000000002',
        telefono: '+58 212 951-4202',
        tipo_telefono: 'Oficina',
      },
    ],
    emails: [
      {
        id: '1e200000-0000-0000-0000-000000000002',
        id_experto_tecnico: '1e000000-0000-0000-0000-000000000002',
        email: 'hzambrano.experto@fondonorma.test',
        tipo_email: 'Trabajo',
      },
    ],
    sectorLinks: [
      {
        id_experto_tecnico: '1e000000-0000-0000-0000-000000000002',
        id_sector_iaf: 'd0000000-0000-0000-0000-000000000013',
        sector_numero: 13,
        sector_descripcion: 'Productos farmacéuticos',
      },
    ],
    subsectorLinks: [],
    historialAuditorias: [],
  },
  {
    id: '1e000000-0000-0000-0000-000000000003',
    nombre: 'Ing. Mariela Cárdenas',
    estatus: 'Disponible',
    notas: 'Experta metalúrgica y procesos de fundición / tratamientos térmicos.',
    telefonos: [
      {
        id: '1e100000-0000-0000-0000-000000000004',
        id_experto_tecnico: '1e000000-0000-0000-0000-000000000003',
        telefono: '+58 414 430-5301',
        tipo_telefono: 'Móvil',
      },
    ],
    emails: [
      {
        id: '1e200000-0000-0000-0000-000000000003',
        id_experto_tecnico: '1e000000-0000-0000-0000-000000000003',
        email: 'mcardenas.experto@fondonorma.test',
        tipo_email: 'Trabajo',
      },
    ],
    sectorLinks: [
      {
        id_experto_tecnico: '1e000000-0000-0000-0000-000000000003',
        id_sector_iaf: 'd0000000-0000-0000-0000-000000000017',
        sector_numero: 17,
        sector_descripcion: 'Metales básicos y productos metálicos fabricados',
      },
    ],
    subsectorLinks: [
      {
        id_experto_tecnico: '1e000000-0000-0000-0000-000000000003',
        id_subsector_iaf: 'da000000-0000-0000-0000-000000000171',
        id_sector_iaf: 'd0000000-0000-0000-0000-000000000017',
        sector_numero: 17,
        subsector_codigo: '17.1',
        subsector_descripcion: 'Fabricación de acero, fundición de hierro y metales básicos',
        categoria_riesgo: 'ALTO',
      },
    ],
    historialAuditorias: [],
  },
  {
    id: '1e000000-0000-0000-0000-000000000004',
    nombre: 'Lic. Gabriel Navarro',
    estatus: 'Disponible',
    notas: 'Especialista en cadenas agroalimentarias y continuidad operativa de centros de datos.',
    telefonos: [
      {
        id: '1e100000-0000-0000-0000-000000000005',
        id_experto_tecnico: '1e000000-0000-0000-0000-000000000004',
        telefono: '+58 424 540-6401',
        tipo_telefono: 'Móvil',
      },
    ],
    emails: [
      {
        id: '1e200000-0000-0000-0000-000000000004',
        id_experto_tecnico: '1e000000-0000-0000-0000-000000000004',
        email: 'gnavarro.experto@fondonorma.test',
        tipo_email: 'Trabajo',
      },
    ],
    sectorLinks: [],
    subsectorLinks: [
      {
        id_experto_tecnico: '1e000000-0000-0000-0000-000000000004',
        id_subsector_iaf: 'da000000-0000-0000-0000-000000000031',
        id_sector_iaf: 'd0000000-0000-0000-0000-000000000003',
        sector_numero: 3,
        subsector_codigo: '03.1',
        subsector_descripcion: 'Elaboración de productos alimenticios y bebidas',
        categoria_riesgo: 'MEDIO',
      },
      {
        id_experto_tecnico: '1e000000-0000-0000-0000-000000000004',
        id_subsector_iaf: 'da000000-0000-0000-0000-000000000331',
        id_sector_iaf: 'd0000000-0000-0000-0000-000000000033',
        sector_numero: 33,
        subsector_codigo: '33.1',
        subsector_descripcion: 'Tecnologías de la información y centros de procesamiento',
        categoria_riesgo: 'ALTO',
      },
    ],
    historialAuditorias: [],
  },
  {
    id: '1e000000-0000-0000-0000-000000000005',
    nombre: 'Ing. Rodrigo Páez',
    estatus: 'No disponible',
    notas: 'Temporalmente no disponible por licencia técnica hasta próximo trimestre.',
    telefonos: [
      {
        id: '1e100000-0000-0000-0000-000000000006',
        id_experto_tecnico: '1e000000-0000-0000-0000-000000000005',
        telefono: '+58 416 650-7501',
        tipo_telefono: 'Móvil',
      },
    ],
    emails: [
      {
        id: '1e200000-0000-0000-0000-000000000005',
        id_experto_tecnico: '1e000000-0000-0000-0000-000000000005',
        email: 'rpaez.experto@fondonorma.test',
        tipo_email: 'Trabajo',
      },
    ],
    sectorLinks: [
      {
        id_experto_tecnico: '1e000000-0000-0000-0000-000000000005',
        id_sector_iaf: 'd0000000-0000-0000-0000-000000000028',
        sector_numero: 28,
        sector_descripcion: 'Construcción e infraestructura civil',
      },
    ],
    subsectorLinks: [
      {
        id_experto_tecnico: '1e000000-0000-0000-0000-000000000005',
        id_subsector_iaf: 'da000000-0000-0000-0000-000000000281',
        id_sector_iaf: 'd0000000-0000-0000-0000-000000000028',
        sector_numero: 28,
        subsector_codigo: '28.1',
        subsector_descripcion: 'Obras civiles, edificaciones y montaje estructural',
        categoria_riesgo: 'ALTO',
      },
    ],
    historialAuditorias: [],
  },
];

export function createDefaultExpertoTecnicoViewState(): ExpertoTecnicoViewState {
  return {
    selectedExpertoId: null,
    activeChildTab: 'competencias',
    query: '',
    viewMode: 'grid',
    isSidebarOpen: true,
    facetSelections: {},
    sortColumn: null,
    sortDirection: 'none',
    isEditingAttributes: false,
    isCreating: false,
    formDraft: undefined,
    editErrorMessage: null,
    isAddingTelefono: false,
    telefonoDraft: undefined,
    telefonoErrorMessage: null,
    isAddingEmail: false,
    emailDraft: undefined,
    emailErrorMessage: null,
    isAddingCompetencia: false,
    competenciaDraft: undefined,
    competenciaErrorMessage: null,
  };
}

export function createEmptyExpertoFormDraft(): ExpertoTecnicoFormDraft {
  return {
    nombre: '',
    estatus: 'Disponible',
    notas: '',
  };
}

export function createExpertoDraftFromEntity(
  experto: Pick<ExpertoTecnicoDetailEntity, 'nombre' | 'estatus' | 'notas'>
): ExpertoTecnicoFormDraft {
  return {
    nombre: experto.nombre || '',
    estatus: experto.estatus === 'No disponible' ? 'No disponible' : 'Disponible',
    notas: experto.notas || '',
  };
}

export function createEmptyExpertoTelefonoDraft(): ExpertoTelefonoFormDraft {
  return {
    telefono: '',
    tipo_telefono: 'Móvil',
  };
}

export function createEmptyExpertoEmailDraft(): ExpertoEmailFormDraft {
  return {
    email: '',
    tipo_email: 'Trabajo',
  };
}

export function createEmptyExpertoCompetenciaDraft(
  idExperto = '',
  tipo: ExpertoCompetenciaMode = 'sector_iaf'
): ExpertoCompetenciaFormDraft {
  return {
    id_experto_tecnico: idExperto,
    tipo,
    id_sector_iaf: '',
    id_subsector_iaf: '',
  };
}

export function normalizeExpertoDisponibilidad(raw: unknown): ExpertoDisponibilidad {
  return String(raw ?? '').trim() === 'No disponible' ? 'No disponible' : 'Disponible';
}

export function getExpertoDisponibilidadVisual(estatus: ExpertoDisponibilidad): {
  label: ExpertoDisponibilidad;
  badgeClass: string;
  dotClass: string;
} {
  if (estatus === 'No disponible') {
    return {
      label: 'No disponible',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
      dotClass: 'bg-amber-500',
    };
  }
  return {
    label: 'Disponible',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    dotClass: 'bg-emerald-500',
  };
}

export function validateExpertoFormDraft(
  draft: ExpertoTecnicoFormDraft,
  existingExpertos: ReadonlyArray<Pick<ExpertoTecnicoDetailEntity, 'id' | 'nombre' | 'deleted_at'>> = [],
  currentExpertoId?: string
): {
  valid: boolean;
  message?: string;
  normalized: {
    nombre: string;
    estatus: ExpertoDisponibilidad;
    notas: string | null;
  };
} {
  const cleanNombre = (draft.nombre || '').replace(/\s+/g, ' ').trim();
  const rawEstatus = String(draft.estatus || '').trim();
  const cleanNotasRaw = (draft.notas || '').replace(/\s+/g, ' ').trim();

  if (!cleanNombre) {
    return {
      valid: false,
      message: 'El nombre completo del experto técnico es obligatorio.',
      normalized: { nombre: '', estatus: 'Disponible', notas: null },
    };
  }

  if (cleanNombre.length > EXPERTO_NOMBRE_MAX_LENGTH) {
    return {
      valid: false,
      message: `El nombre del experto no puede superar ${EXPERTO_NOMBRE_MAX_LENGTH} caracteres.`,
      normalized: { nombre: cleanNombre, estatus: 'Disponible', notas: null },
    };
  }

  if (containsRawUuid(cleanNombre)) {
    return {
      valid: false,
      message: 'El nombre del experto no puede contener identificadores internos.',
      normalized: { nombre: cleanNombre, estatus: 'Disponible', notas: null },
    };
  }

  if (rawEstatus !== 'Disponible' && rawEstatus !== 'No disponible') {
    return {
      valid: false,
      message: 'La disponibilidad debe ser "Disponible" o "No disponible".',
      normalized: { nombre: cleanNombre, estatus: 'Disponible', notas: null },
    };
  }

  if (cleanNotasRaw && containsRawUuid(cleanNotasRaw)) {
    return {
      valid: false,
      message: 'Las notas del perfil no pueden contener identificadores internos.',
      normalized: { nombre: cleanNombre, estatus: rawEstatus, notas: null },
    };
  }

  if (cleanNotasRaw.length > EXPERTO_NOTAS_MAX_LENGTH) {
    return {
      valid: false,
      message: `Las notas del perfil no pueden exceder ${EXPERTO_NOTAS_MAX_LENGTH} caracteres.`,
      normalized: { nombre: cleanNombre, estatus: rawEstatus, notas: null },
    };
  }

  const duplicate = existingExpertos.find(
    (e) =>
      !e.deleted_at &&
      e.id !== currentExpertoId &&
      e.nombre.replace(/\s+/g, ' ').trim().toLowerCase() === cleanNombre.toLowerCase()
  );
  if (duplicate) {
    return {
      valid: false,
      message: `Ya existe un experto técnico activo registrado como "${duplicate.nombre}".`,
      normalized: { nombre: cleanNombre, estatus: rawEstatus, notas: null },
    };
  }

  return {
    valid: true,
    normalized: {
      nombre: cleanNombre,
      estatus: rawEstatus,
      notas: cleanNotasRaw || null,
    },
  };
}

export function validateExpertoTelefonoDraft(
  draft: ExpertoTelefonoFormDraft,
  existingTelefonos: ReadonlyArray<Pick<ExpertoTelefonoItem, 'telefono' | 'deleted_at'>> = []
): {
  valid: boolean;
  message?: string;
  normalized: ExpertoTelefonoFormDraft;
} {
  const cleanTel = (draft.telefono || '').replace(/\s+/g, ' ').trim();
  const cleanTipo = (draft.tipo_telefono || '').replace(/\s+/g, ' ').trim() || 'Móvil';

  if (!cleanTel) {
    return {
      valid: false,
      message: 'El número telefónico es obligatorio.',
      normalized: { telefono: '', tipo_telefono: cleanTipo },
    };
  }

  if (cleanTel.length > EXPERTO_TELEFONO_MAX_LENGTH) {
    return {
      valid: false,
      message: `El teléfono no puede superar ${EXPERTO_TELEFONO_MAX_LENGTH} caracteres.`,
      normalized: { telefono: cleanTel, tipo_telefono: cleanTipo },
    };
  }

  if (containsRawUuid(cleanTel) || containsRawUuid(cleanTipo)) {
    return {
      valid: false,
      message: 'El teléfono o su etiqueta contiene un identificador no permitido.',
      normalized: { telefono: cleanTel, tipo_telefono: cleanTipo },
    };
  }

  const digitsCount = cleanTel.replace(/\D/g, '').length;
  if (!PHONE_FORMAT_REGEX.test(cleanTel) || digitsCount < 6) {
    return {
      valid: false,
      message: 'Ingrese un número telefónico válido (mínimo 6 dígitos).',
      normalized: { telefono: cleanTel, tipo_telefono: cleanTipo },
    };
  }

  if (cleanTipo.length > 40) {
    return {
      valid: false,
      message: 'El tipo de teléfono no puede superar 40 caracteres.',
      normalized: { telefono: cleanTel, tipo_telefono: cleanTipo },
    };
  }

  const cleanDigits = cleanTel.replace(/\D/g, '');
  const duplicate = existingTelefonos.some(
    (item) => !item.deleted_at && item.telefono.replace(/\D/g, '') === cleanDigits
  );
  if (duplicate) {
    return {
      valid: false,
      message: 'Este número telefónico ya está registrado para el experto.',
      normalized: { telefono: cleanTel, tipo_telefono: cleanTipo },
    };
  }

  return {
    valid: true,
    normalized: {
      telefono: cleanTel,
      tipo_telefono: cleanTipo,
    },
  };
}

export function validateExpertoEmailDraft(
  draft: ExpertoEmailFormDraft,
  existingEmails: ReadonlyArray<Pick<ExpertoEmailItem, 'email' | 'deleted_at'>> = []
): {
  valid: boolean;
  message?: string;
  normalized: ExpertoEmailFormDraft;
} {
  const cleanEmail = (draft.email || '').trim().toLowerCase();
  const cleanTipo = (draft.tipo_email || '').replace(/\s+/g, ' ').trim() || 'Trabajo';

  if (!cleanEmail) {
    return {
      valid: false,
      message: 'El correo electrónico es obligatorio.',
      normalized: { email: '', tipo_email: cleanTipo },
    };
  }

  if (cleanEmail.length > EXPERTO_EMAIL_MAX_LENGTH) {
    return {
      valid: false,
      message: `El correo electrónico no puede superar ${EXPERTO_EMAIL_MAX_LENGTH} caracteres.`,
      normalized: { email: cleanEmail, tipo_email: cleanTipo },
    };
  }

  if (containsRawUuid(cleanEmail) || containsRawUuid(cleanTipo)) {
    return {
      valid: false,
      message: 'El correo electrónico contiene un identificador no permitido.',
      normalized: { email: cleanEmail, tipo_email: cleanTipo },
    };
  }

  if (!EMAIL_FORMAT_REGEX.test(cleanEmail)) {
    return {
      valid: false,
      message: 'Ingrese un correo electrónico con formato válido.',
      normalized: { email: cleanEmail, tipo_email: cleanTipo },
    };
  }

  if (cleanTipo.length > 40) {
    return {
      valid: false,
      message: 'El tipo de correo no puede superar 40 caracteres.',
      normalized: { email: cleanEmail, tipo_email: cleanTipo },
    };
  }

  const duplicate = existingEmails.some(
    (item) => !item.deleted_at && item.email.trim().toLowerCase() === cleanEmail
  );
  if (duplicate) {
    return {
      valid: false,
      message: 'Este correo electrónico ya está registrado para el experto.',
      normalized: { email: cleanEmail, tipo_email: cleanTipo },
    };
  }

  return {
    valid: true,
    normalized: {
      email: cleanEmail,
      tipo_email: cleanTipo,
    },
  };
}

export function applyExpertoCompetenciaSectorCascade<
  T extends SubsectorIafCascadeItem = SubsectorIafCascadeItem
>(params: {
  draft: ExpertoCompetenciaFormDraft;
  nextSectorId: string;
  sectores: ReadonlyArray<SectorIafCascadeItem>;
  subsectores: ReadonlyArray<T>;
}): {
  draft: ExpertoCompetenciaFormDraft;
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

export function validateExpertoCompetenciaDraft(params: {
  draft: ExpertoCompetenciaFormDraft;
  experto: Pick<ExpertoTecnicoDetailEntity, 'id' | 'sectorLinks' | 'subsectorLinks'>;
  sectores?: ReadonlyArray<SectorIafCascadeItem>;
  subsectores?: ReadonlyArray<SubsectorIafCascadeItem>;
}): {
  valid: boolean;
  message?: string;
  normalized?: ExpertoCompetenciaFormDraft;
} {
  const { draft, experto, sectores = [], subsectores = [] } = params;

  let idExperto: string;
  try {
    idExperto = assertValidUuid(draft.id_experto_tecnico || experto.id, 'experto técnico');
  } catch {
    return {
      valid: false,
      message: 'Debe seleccionar un experto técnico válido.',
    };
  }

  const tipo: ExpertoCompetenciaMode =
    draft.tipo === 'subsector_iaf' ? 'subsector_iaf' : 'sector_iaf';

  let idSector: string;
  try {
    idSector = assertValidUuid(draft.id_sector_iaf, 'sector IAF');
  } catch {
    return {
      valid: false,
      message:
        tipo === 'subsector_iaf'
          ? 'Debe seleccionar primero un Sector IAF padre válido.'
          : 'Debe seleccionar un Sector IAF válido.',
    };
  }

  if (sectores.length > 0 && !sectores.some((s) => s.id === idSector)) {
    return {
      valid: false,
      message: 'El Sector IAF seleccionado no existe o está archivado.',
    };
  }

  if (tipo === 'sector_iaf') {
    if (experto.sectorLinks.some((s) => s.id_sector_iaf === idSector)) {
      return {
        valid: false,
        message: 'El experto técnico ya posee este Sector IAF asignado.',
      };
    }

    return {
      valid: true,
      normalized: {
        id_experto_tecnico: idExperto,
        tipo: 'sector_iaf',
        id_sector_iaf: idSector,
        id_subsector_iaf: '',
      },
    };
  }

  let idSubsector: string;
  try {
    idSubsector = assertValidUuid(draft.id_subsector_iaf, 'sub-sector IAF');
  } catch {
    return {
      valid: false,
      message: 'Debe seleccionar un Sub-Sector IAF válido.',
    };
  }

  if (sectores.length > 0 && subsectores.length > 0) {
    const validChildren = filterSubsectoresBySectorIaf({
      sectorId: idSector,
      sectores,
      subsectores,
    });
    if (!validChildren.some((sub) => sub.id === idSubsector)) {
      return {
        valid: false,
        message: 'El Sub-Sector IAF seleccionado no pertenece al Sector IAF elegido.',
      };
    }
  }

  if (experto.subsectorLinks.some((sub) => sub.id_subsector_iaf === idSubsector)) {
    return {
      valid: false,
      message: 'El experto técnico ya posee este Sub-Sector IAF asignado.',
    };
  }

  return {
    valid: true,
    normalized: {
      id_experto_tecnico: idExperto,
      tipo: 'subsector_iaf',
      id_sector_iaf: idSector,
      id_subsector_iaf: idSubsector,
    },
  };
}

/**
 * Evaluates whether an expert covers a target IAF Subsector or full parent IAF Sector.
 * Technical experts NEVER evaluate ISO standard qualifications (`norma`).
 */
export function evaluateExpertoCompetencyMatch(
  experto: Pick<ExpertoTecnicoDetailEntity, 'sectorLinks' | 'subsectorLinks'>,
  sectorNumero: number | null | undefined,
  subsectorCodigo?: string | null
): ExpertoCompetencyMatch {
  const cleanSubCode = (subsectorCodigo || '').trim().toLowerCase();
  if (cleanSubCode) {
    const hasExactSub = experto.subsectorLinks.some(
      (sub) => sub.subsector_codigo.trim().toLowerCase() === cleanSubCode
    );
    if (hasExactSub) {
      return 'SUBSECTOR_EXACT';
    }
  }

  if (typeof sectorNumero === 'number' && Number.isFinite(sectorNumero) && sectorNumero > 0) {
    const hasSectorFull = experto.sectorLinks.some(
      (sec) => sec.sector_numero === sectorNumero
    );
    if (hasSectorFull) {
      return 'SECTOR_FULL';
    }
  }

  return 'NONE';
}

export function resolveExpertoPrimaryContact(
  experto: Pick<ExpertoTecnicoDetailEntity, 'telefonos' | 'emails'>
): {
  primaryPhone: string | null;
  extraPhonesCount: number;
  primaryEmail: string | null;
  extraEmailsCount: number;
} {
  const activePhones = (experto.telefonos || []).filter((t) => !t.deleted_at);
  const activeEmails = (experto.emails || []).filter((e) => !e.deleted_at);
  return {
    primaryPhone: activePhones[0]?.telefono || null,
    extraPhonesCount: Math.max(0, activePhones.length - 1),
    primaryEmail: activeEmails[0]?.email || null,
    extraEmailsCount: Math.max(0, activeEmails.length - 1),
  };
}

export function getExpertoSearchableText(experto: ExpertoTecnicoDetailEntity): string {
  const activePhones = experto.telefonos.filter((t) => !t.deleted_at).map((t) => t.telefono);
  const activeEmails = experto.emails.filter((e) => !e.deleted_at).map((e) => e.email);
  return [
    experto.nombre,
    experto.estatus,
    experto.notas || '',
    ...experto.sectorLinks.map((s) => `Sector ${s.sector_numero} ${s.sector_descripcion}`),
    ...experto.subsectorLinks.map(
      (s) => `${s.subsector_codigo} ${s.subsector_descripcion} Sector ${s.sector_numero}`
    ),
    ...activePhones,
    ...activeEmails,
  ]
    .filter(Boolean)
    .join(' ');
}

export function getExpertoTotalCompetencyCount(
  experto: Pick<ExpertoTecnicoDetailEntity, 'sectorLinks' | 'subsectorLinks'>
): number {
  return experto.sectorLinks.length + experto.subsectorLinks.length;
}
