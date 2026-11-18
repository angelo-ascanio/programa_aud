/**
 * Domain "Extra" (Block 3) Core Data Models and Logic
 * Aligned with ISO/IEC 17021-1:2015, ISO 19011:2018, and IAF Mandatory Documents.
 */
import { isValidUuid } from './zeroUuid';
import { sanitizeClauseHtml, stripHtmlToSearchText } from './clauseRenderer';

export interface NormaEntity {
  id: string;
  codigo: string;
  titulo: string;
  estatus: 'Vigente' | 'En Revisión' | 'Obsoleta';
  esquema: string;
  fecha_publicacion: string;
  norma: string;
  clausulas_count: number;
  acreditaciones_count: number;
  deleted_at?: string | null;
  delete_reason?: string | null;
}

export interface OrganismoAcreditacion {
  id: string;
  codigo: string;
  nombre: string;
  pais: string;
  sitio_web?: string;
}

export interface AcreditacionSectorSummary {
  id_sector_iaf: string;
  sector: number;
  descripcion: string;
}

export interface AcreditacionNormaIaf {
  id: string;
  id_organismo: string;
  organismo_codigo: string;
  organismo_nombre: string;
  organismo_pais: string;
  id_norma: string;
  norma_codigo: string;
  id_estatus: string;
  estatus: string;
  sectores: AcreditacionSectorSummary[];
  sector_ids: string[];
  numero_acreditacion: string;
  fecha_concesion: string;
  fecha_vencimiento?: string;
}

export interface RequisitoTranslationEntry {
  id?: string;
  id_requisito: string;
  lang: 'es' | 'en';
  title: string;
  content_html: string;
  updated_at?: string | null;
}

export const VALID_OBLIGATORIO_ORIGEN_VALUES = [
  'AUTO_TEXT',
  'AUTO_INHERITED',
  'AUTO_CHAPTER',
  'AUTO_STRUCTURAL',
  'MANUAL',
] as const;
export type ObligatorioOrigen = (typeof VALID_OBLIGATORIO_ORIGEN_VALUES)[number];

export interface RequisitoLtree {
  id: string;
  id_norma: string;
  norma_codigo: string;
  id_requisito_padre?: string | null;
  codigo: string;
  explicit_code?: boolean;
  es_obligatorio?: boolean;
  obligatorio_origen?: ObligatorioOrigen;
  titulo: string;
  descripcion?: string;
  translations?: {
    es?: RequisitoTranslationEntry;
    en?: RequisitoTranslationEntry;
  };
  ruta_materializada: string;
  nivel: number;
  es_padre: boolean;
  deleted_at?: string | null;
  delete_reason?: string | null;
}

export interface SectorIafEntity {
  id: string;
  sector: number;
  descripcion: string;
  subsectores_count: number;
  auditores_count: number;
  deleted_at?: string | null;
  delete_reason?: string | null;
}

export interface SubsectorIafEntity {
  id: string;
  id_sector_iaf: string;
  sector_numero: number;
  codigo: string;
  descripcion: string;
  categoria_riesgo: 'ALTO' | 'MEDIO' | 'BAJO';
  auditores_nombres: string[];
  deleted_at?: string | null;
  delete_reason?: string | null;
}

export interface EstatusCatalogItem {
  id: string;
  estatus: string;
  descripcion: string;
  categoria_aplicable: string;
  color_token: string;
  usage_count: number;
  deleted_at?: string | null;
}

export interface TipoAuditoriaCatalogItem {
  id: string;
  tipo: string;
  etapa_ciclo: string;
  descripcion: string;
  duracion_formula: string;
  reporte_requerido: string;
  usage_count: number;
  deleted_at?: string | null;
}

export interface MetodologiaAuditoriaCatalogItem {
  id: string;
  metodologia: string;
  descripcion: string;
  protocolo_tic: string;
  regla_muestreo: string;
  seguridad_confidencialidad: string;
  usage_count: number;
  deleted_at?: string | null;
}

export type CatalogSimpleDetailMode = 'read' | 'add' | 'edit';

export interface EstatusFormDraft {
  estatus: string;
}

export interface TipoAuditoriaFormDraft {
  tipo: string;
}

export interface MetodologiaAuditoriaFormDraft {
  metodologia: string;
}

export interface CatalogSimpleValidationResult<T> {
  valid: boolean;
  normalized?: T;
  error?: string;
}

export type SectorIafDetailMode = 'read' | 'add' | 'edit';
export type SubsectorIafDetailMode = 'read' | 'add' | 'edit';

export const VALID_SUBSECTOR_RISK_CATEGORIES = ['ALTO', 'MEDIO', 'BAJO'] as const;
export type SubsectorRiskCategory = (typeof VALID_SUBSECTOR_RISK_CATEGORIES)[number];

export interface SectorIafFormDraft {
  sector: string; // entero positivo 1..99
  descripcion: string; // requerido, max 500 chars
}

export interface SubsectorIafFormDraft {
  id_sector_iaf: string;
  codigo: string; // max 10 chars, ej: "17.1"
  descripcion: string; // requerido
  categoria_riesgo: SubsectorRiskCategory;
}

// ---------------------------------------------------------------------------
// Seed Data (Synchronized with 06_datos_prueba.sql and ISO normative models)
// ---------------------------------------------------------------------------

export const INITIAL_ORGANISMOS: OrganismoAcreditacion[] = [
  {
    id: 'db000000-0000-0000-0000-000000000001',
    codigo: 'ENAC',
    nombre: 'Entidad Nacional de Acreditación',
    pais: 'España',
    sitio_web: 'https://www.enac.es',
  },
  {
    id: 'db000000-0000-0000-0000-000000000002',
    codigo: 'UKAS',
    nombre: 'United Kingdom Accreditation Service',
    pais: 'Reino Unido',
    sitio_web: 'https://www.ukas.com',
  },
  {
    id: 'db000000-0000-0000-0000-000000000003',
    codigo: 'ANAB',
    nombre: 'ANSI National Accreditation Board',
    pais: 'Estados Unidos',
    sitio_web: 'https://anab.ansi.org',
  },
];

export const INITIAL_NORMAS: NormaEntity[] = [
  {
    id: 'e0000000-0000-0000-0000-000000009001',
    esquema: 'SGC - Calidad',
    codigo: 'ISO 9001:2015',
    titulo: 'Sistemas de Gestión de la Calidad — Requisitos',
    estatus: 'Vigente',
    fecha_publicacion: '2015-09-15',
    norma: 'ISO 9001:2015',
    clausulas_count: 7,
    acreditaciones_count: 2,
  },
  {
    id: 'e0000000-0000-0000-0000-000000014001',
    esquema: 'SGA - Gestión Ambiental',
    codigo: 'ISO 14001:2015',
    titulo: 'Sistemas de Gestión Ambiental — Requisitos con orientación para su uso',
    estatus: 'Vigente',
    fecha_publicacion: '2015-09-15',
    norma: 'ISO 14001:2015',
    clausulas_count: 5,
    acreditaciones_count: 1,
  },
  {
    id: 'e0000000-0000-0000-0000-000000045001',
    esquema: 'SST - Seguridad y Salud Laboral',
    codigo: 'ISO 45001:2018',
    titulo: 'Sistemas de Gestión de la Seguridad y Salud en el Trabajo — Requisitos',
    estatus: 'Vigente',
    fecha_publicacion: '2018-03-12',
    norma: 'ISO 45001:2018',
    clausulas_count: 6,
    acreditaciones_count: 1,
  },
  {
    id: 'e0000000-0000-0000-0000-000000027001',
    esquema: 'SGSI - Seguridad de la Información',
    codigo: 'ISO/IEC 27001:2022',
    titulo: 'Seguridad de la información, ciberseguridad y protección de la privacidad — Sistemas de gestión',
    estatus: 'Vigente',
    fecha_publicacion: '2022-10-25',
    norma: 'ISO/IEC 27001:2022',
    clausulas_count: 8,
    acreditaciones_count: 1,
  },
];

export const INITIAL_ACREDITACIONES: AcreditacionNormaIaf[] = [
  {
    id: 'dc000000-0000-0000-0000-000000000001',
    id_organismo: 'db000000-0000-0000-0000-000000000001',
    organismo_codigo: 'ENAC',
    organismo_nombre: 'Entidad Nacional de Acreditación',
    organismo_pais: 'España',
    id_norma: 'e0000000-0000-0000-0000-000000009001',
    norma_codigo: 'ISO 9001:2015',
    id_estatus: 'a0000000-0000-0000-0000-000000000001',
    estatus: 'Activo',
    sectores: [
      {
        id_sector_iaf: 'd0000000-0000-0000-0000-000000000017',
        sector: 17,
        descripcion: 'Metales básicos y productos metálicos elaborados',
      },
    ],
    sector_ids: ['d0000000-0000-0000-0000-000000000017'],
    numero_acreditacion: '01/C-SC001',
    fecha_concesion: '2020-01-15',
    fecha_vencimiento: '2028-01-14',
  },
  {
    id: 'dc000000-0000-0000-0000-000000000002',
    id_organismo: 'db000000-0000-0000-0000-000000000002',
    organismo_codigo: 'UKAS',
    organismo_nombre: 'United Kingdom Accreditation Service',
    organismo_pais: 'Reino Unido',
    id_norma: 'e0000000-0000-0000-0000-000000014001',
    norma_codigo: 'ISO 14001:2015',
    id_estatus: 'a0000000-0000-0000-0000-000000000001',
    estatus: 'Activo',
    sectores: [
      {
        id_sector_iaf: 'd0000000-0000-0000-0000-000000000017',
        sector: 17,
        descripcion: 'Metales básicos y productos metálicos elaborados',
      },
    ],
    sector_ids: ['d0000000-0000-0000-0000-000000000017'],
    numero_acreditacion: '0044-EMS',
    fecha_concesion: '2021-06-01',
    fecha_vencimiento: '2027-05-31',
  },
  {
    id: 'dc000000-0000-0000-0000-000000000003',
    id_organismo: 'db000000-0000-0000-0000-000000000003',
    organismo_codigo: 'ANAB',
    organismo_nombre: 'ANSI National Accreditation Board',
    organismo_pais: 'Estados Unidos',
    id_norma: 'e0000000-0000-0000-0000-000000027001',
    norma_codigo: 'ISO/IEC 27001:2022',
    id_estatus: 'a0000000-0000-0000-0000-000000000001',
    estatus: 'Activo',
    sectores: [
      {
        id_sector_iaf: 'd0000000-0000-0000-0000-000000000033',
        sector: 33,
        descripcion: 'Tecnología de la información y comunicaciones',
      },
    ],
    sector_ids: ['d0000000-0000-0000-0000-000000000033'],
    numero_acreditacion: 'ANAB-ISMS-089',
    fecha_concesion: '2023-02-10',
    fecha_vencimiento: '2029-02-09',
  },
];

export const INITIAL_REQUISITOS_LTREE: RequisitoLtree[] = [
  {
    id: 'f0000000-0000-0000-0000-000000000004',
    id_norma: 'e0000000-0000-0000-0000-000000009001',
    norma_codigo: 'ISO 9001:2015',
    id_requisito_padre: null,
    codigo: '4',
    es_obligatorio: false,
    obligatorio_origen: 'AUTO_TEXT',
    titulo: 'Contexto de la Organización',
    descripcion: 'Comprensión de la organización, factores externos e internos y alcance del sistema.',
    ruta_materializada: '4',
    nivel: 1,
    es_padre: true,
  },
  {
    id: 'f0000000-0000-0000-0000-000000000041',
    id_norma: 'e0000000-0000-0000-0000-000000009001',
    norma_codigo: 'ISO 9001:2015',
    id_requisito_padre: 'f0000000-0000-0000-0000-000000000004',
    codigo: '4.1',
    es_obligatorio: true,
    obligatorio_origen: 'AUTO_TEXT',
    titulo: 'Comprensión de la Organización y de su Contexto',
    descripcion: 'Determinación de cuestiones externas e internas pertinentes para su propósito y dirección estratégica.',
    ruta_materializada: '4.4_1',
    nivel: 2,
    es_padre: false,
  },
  {
    id: 'f0000000-0000-0000-0000-000000000042',
    id_norma: 'e0000000-0000-0000-0000-000000009001',
    norma_codigo: 'ISO 9001:2015',
    id_requisito_padre: 'f0000000-0000-0000-0000-000000000004',
    codigo: '4.2',
    es_obligatorio: true,
    obligatorio_origen: 'AUTO_TEXT',
    titulo: 'Comprensión de las Necesidades y Expectativas de las Partes Interesadas',
    descripcion: 'Determinación de partes interesadas pertinentes y sus requisitos aplicables.',
    ruta_materializada: '4.4_2',
    nivel: 2,
    es_padre: false,
  },
  {
    id: 'f0000000-0000-0000-0000-000000000005',
    id_norma: 'e0000000-0000-0000-0000-000000009001',
    norma_codigo: 'ISO 9001:2015',
    id_requisito_padre: null,
    codigo: '5',
    es_obligatorio: false,
    obligatorio_origen: 'AUTO_TEXT',
    titulo: 'Liderazgo',
    descripcion: 'Compromiso de la alta dirección, enfoque al cliente y política de la calidad.',
    ruta_materializada: '5',
    nivel: 1,
    es_padre: true,
  },
  {
    id: 'f0000000-0000-0000-0000-000000000051',
    id_norma: 'e0000000-0000-0000-0000-000000009001',
    norma_codigo: 'ISO 9001:2015',
    id_requisito_padre: 'f0000000-0000-0000-0000-000000000005',
    codigo: '5.1',
    es_obligatorio: true,
    obligatorio_origen: 'AUTO_TEXT',
    titulo: 'Liderazgo y Compromiso General',
    descripcion: 'Rendición de cuentas respecto a la eficacia del sistema de gestión y provisión de recursos.',
    ruta_materializada: '5.5_1',
    nivel: 2,
    es_padre: false,
  },
  {
    id: 'f0000000-0000-0000-0000-000000000008',
    id_norma: 'e0000000-0000-0000-0000-000000009001',
    norma_codigo: 'ISO 9001:2015',
    id_requisito_padre: null,
    codigo: '8',
    es_obligatorio: false,
    obligatorio_origen: 'AUTO_TEXT',
    titulo: 'Operación',
    descripcion: 'Planificación, control operacional y requisitos para los productos y servicios.',
    ruta_materializada: '8',
    nivel: 1,
    es_padre: true,
  },
  {
    id: 'f0000000-0000-0000-0000-000000000085',
    id_norma: 'e0000000-0000-0000-0000-000000009001',
    norma_codigo: 'ISO 9001:2015',
    id_requisito_padre: 'f0000000-0000-0000-0000-000000000008',
    codigo: '8.5',
    es_obligatorio: true,
    obligatorio_origen: 'AUTO_TEXT',
    titulo: 'Producción y Provisión del Servicio',
    descripcion: 'Control de la producción, identificación y trazabilidad, y actividades posteriores a la entrega.',
    ruta_materializada: '8.8_5',
    nivel: 2,
    es_padre: false,
  },
];

export const INITIAL_SECTORES_IAF: SectorIafEntity[] = [
  {
    id: 'd0000000-0000-0000-0000-000000000014',
    sector: 14,
    descripcion: 'Productos químicos, fibras sintéticas y farmacéuticos',
    subsectores_count: 1,
    auditores_count: 1,
  },
  {
    id: 'd0000000-0000-0000-0000-000000000017',
    sector: 17,
    descripcion: 'Metales básicos y productos metálicos elaborados',
    subsectores_count: 2,
    auditores_count: 2,
  },
  {
    id: 'd0000000-0000-0000-0000-000000000028',
    sector: 28,
    descripcion: 'Construcción e ingeniería civil',
    subsectores_count: 1,
    auditores_count: 1,
  },
  {
    id: 'd0000000-0000-0000-0000-000000000033',
    sector: 33,
    descripcion: 'Tecnología de la información y comunicaciones',
    subsectores_count: 1,
    auditores_count: 2,
  },
  {
    id: 'd0000000-0000-0000-0000-000000000035',
    sector: 35,
    descripcion: 'Otros servicios profesionales y de ensayo',
    subsectores_count: 0,
    auditores_count: 1,
  },
];

export const INITIAL_SUBSECTORES_IAF: SubsectorIafEntity[] = [
  {
    id: 'da000000-0000-0000-0000-000000000171',
    id_sector_iaf: 'd0000000-0000-0000-0000-000000000017',
    sector_numero: 17,
    codigo: '17.1',
    descripcion: 'Fabricación de metales básicos, fundición y siderurgia',
    categoria_riesgo: 'ALTO',
    auditores_nombres: ['Ing. Carlos Mendoza (Auditor Líder)'],
  },
  {
    id: 'da000000-0000-0000-0000-000000000172',
    id_sector_iaf: 'd0000000-0000-0000-0000-000000000017',
    sector_numero: 17,
    codigo: '17.2',
    descripcion: 'Fabricación de productos metálicos elaborados, troquelado y conformado',
    categoria_riesgo: 'MEDIO',
    auditores_nombres: [
      'Ing. Carlos Mendoza (Auditor Líder)',
      'Auditor Técnico Evaluador',
    ],
  },
  {
    id: 'da000000-0000-0000-0000-000000000281',
    id_sector_iaf: 'd0000000-0000-0000-0000-000000000028',
    sector_numero: 28,
    codigo: '28.1',
    descripcion: 'Construcción de edificios y obras de ingeniería civil',
    categoria_riesgo: 'MEDIO',
    auditores_nombres: ['Ing. Carlos Mendoza (Auditor Líder)'],
  },
  {
    id: 'da000000-0000-0000-0000-000000000331',
    id_sector_iaf: 'd0000000-0000-0000-0000-000000000033',
    sector_numero: 33,
    codigo: '33.1',
    descripcion: 'Servicios de tecnologías de información y desarrollo de software',
    categoria_riesgo: 'BAJO',
    auditores_nombres: ['Auditor Técnico Evaluador'],
  },
];

export const INITIAL_ESTATUS_CATALOG: EstatusCatalogItem[] = [
  {
    id: 'a0000000-0000-0000-0000-000000000001',
    estatus: 'Activo',
    descripcion: 'Entidad, certificado o usuario formalmente válido y en operación regular.',
    categoria_aplicable: 'Certificados, Organizaciones, Usuarios',
    color_token: 'emerald',
    usage_count: 14,
  },
  {
    id: 'a0000000-0000-0000-0000-000000000002',
    estatus: 'Estudio',
    descripcion: 'Solicitud inicial, alcance técnico o documentación en fase de revisión documental previa.',
    categoria_aplicable: 'Solicitudes, Expedientes Técnicos',
    color_token: 'sky',
    usage_count: 3,
  },
  {
    id: 'a0000000-0000-0000-0000-000000000003',
    estatus: 'Suspendido',
    descripcion: 'Suspensión temporal de la certificación por no conformidades mayores no subsanadas.',
    categoria_aplicable: 'Certificados, Acreditaciones',
    color_token: 'amber',
    usage_count: 2,
  },
  {
    id: 'a0000000-0000-0000-0000-000000000004',
    estatus: 'Cancelado',
    descripcion: 'Certificación formally revocada o cancelada definitivamente a solicitud o sanción.',
    categoria_aplicable: 'Certificados, Auditorías Anuladas',
    color_token: 'rose',
    usage_count: 1,
  },
  {
    id: 'a0000000-0000-0000-0000-000000000005',
    estatus: 'Planificado',
    descripcion: 'Evento de auditoría programado en el calendario con fechas y equipo acordado.',
    categoria_aplicable: 'Auditorías, Visitas de Campo',
    color_token: 'indigo',
    usage_count: 5,
  },
  {
    id: 'a0000000-0000-0000-0000-000000000006',
    estatus: 'En Ejecución',
    descripcion: 'Auditoría en desarrollo activo durante las fechas de trabajo de campo in situ o remota.',
    categoria_aplicable: 'Auditorías en Curso',
    color_token: 'teal',
    usage_count: 2,
  },
  {
    id: 'a0000000-0000-0000-0000-000000000007',
    estatus: 'En Espera',
    descripcion: 'Trámite detenido temporalmente en espera de entrega de evidencias o respuesta de la parte.',
    categoria_aplicable: 'Hallazgos, Solicitudes Administrativas',
    color_token: 'orange',
    usage_count: 4,
  },
  {
    id: 'a0000000-0000-0000-0000-000000000008',
    estatus: 'Inactivo',
    descripcion: 'Registro archivado o concluido históricamente en el sistema sin vigencia operativa.',
    categoria_aplicable: 'Histórico, Cuentas Desactivadas',
    color_token: 'slate',
    usage_count: 6,
  },
];

export const INITIAL_TIPOS_AUDITORIA_CATALOG: TipoAuditoriaCatalogItem[] = [
  {
    id: 'b0000000-0000-0000-0000-000000000001',
    tipo: 'Etapa 1',
    etapa_ciclo: 'Ciclo Inicial (Año 0)',
    descripcion: 'Revisión documental preliminar, idoneidad de la política y preparación para Etapa 2 (ISO 17021-1 cl. 9.3).',
    duracion_formula: '1.0 - 2.0 días auditor según complejidad y tamaño del cliente',
    reporte_requerido: 'Informe de Etapa 1 con determinación de aptitud para Etapa 2',
    usage_count: 4,
  },
  {
    id: 'b0000000-0000-0000-0000-000000000002',
    tipo: 'Etapa 2',
    etapa_ciclo: 'Ciclo Inicial (Año 0)',
    descripcion: 'Evaluación integral de la implementación efectiva y conformidad de todos los procesos in situ (ISO 17021-1 cl. 9.4).',
    duracion_formula: 'Cálculo de días auditor conforme a tablas IAF MD 5 según personal efectivo',
    reporte_requerido: 'Informe integral con registro de hallazgos y recomendación del comité',
    usage_count: 6,
  },
  {
    id: 'b0000000-0000-0000-0000-000000000003',
    tipo: 'Seguimiento 1',
    etapa_ciclo: 'Vigilancia (Año 1)',
    descripcion: 'Primera auditoría periódica dentro de los 12 meses siguientes a la concesión de certificación (ISO 17021-1 cl. 9.6.2).',
    duracion_formula: 'Aprox. 1/3 del tiempo total de la auditoría inicial de certificación',
    reporte_requerido: 'Informe de seguimiento con evaluación de acciones correctivas previas',
    usage_count: 8,
  },
  {
    id: 'b0000000-0000-0000-0000-000000000004',
    tipo: 'Seguimiento 2',
    etapa_ciclo: 'Vigilancia (Año 2)',
    descripcion: 'Segunda auditoría periódica para verificar el mantenimiento continuo de la eficacia (Año 2 del ciclo trienal).',
    duracion_formula: 'Aprox. 1/3 del tiempo total de la auditoría inicial de certificación',
    reporte_requerido: 'Informe de seguimiento y confirmación de vigencia del certificado',
    usage_count: 7,
  },
  {
    id: 'b0000000-0000-0000-0000-000000000005',
    tipo: 'Renovación',
    etapa_ciclo: 'Recertificación (Año 3)',
    descripcion: 'Auditoría integral previa al vencimiento del certificado para renovar el ciclo trienal (ISO 17021-1 cl. 9.6.3).',
    duracion_formula: 'Aprox. 2/3 del tiempo requerido para la auditoría inicial de certificación',
    reporte_requerido: 'Informe de recertificación y dictamen favorable de emisión por 3 años',
    usage_count: 9,
  },
  {
    id: 'b0000000-0000-0000-0000-000000000006',
    tipo: 'Diagnóstico',
    etapa_ciclo: 'Pre-evaluación',
    descripcion: 'Evaluación voluntaria de brechas (GAP Analysis) sin emisión formal de certificado.',
    duracion_formula: 'Acordado puntualmente entre el cliente y el organismo certificador',
    reporte_requerido: 'Informe diagnóstico de oportunidades y madurez del sistema',
    usage_count: 2,
  },
  {
    id: 'b0000000-0000-0000-0000-000000000007',
    tipo: 'Extraordinaria',
    etapa_ciclo: 'Inspección Especial',
    descripcion: 'Auditoría a corto plazo motivada por quejas graves, accidentes o cambios estructurales sustantivos.',
    duracion_formula: 'Enfocada puntualmente en las cláusulas y procesos objeto de investigación',
    reporte_requerido: 'Informe pericial extraordinario con medidas cautelares o suspensión',
    usage_count: 1,
  },
  {
    id: 'b0000000-0000-0000-0000-000000000008',
    tipo: 'Especial',
    etapa_ciclo: 'Ampliación / Transferencia',
    descripcion: 'Auditoría para ampliación del alcance de certificación o transferencia desde otro organismo acreditado.',
    duracion_formula: 'Proporcional a los nuevos procesos o sedes incorporados al certificado',
    reporte_requerido: 'Informe de ampliación de alcance y endoso de nuevo certificado',
    usage_count: 3,
  },
  {
    id: 'b0000000-0000-0000-0000-000000000009',
    tipo: 'Otro',
    etapa_ciclo: 'Modalidad Específica',
    descripcion: 'Evaluaciones técnicas combinadas, auditorías conjuntas o esquemas privados específicos.',
    duracion_formula: 'Definida contractualmente según especificación técnica',
    reporte_requerido: 'Reporte técnico conforme a los términos de referencia del encargo',
    usage_count: 1,
  },
];

export const INITIAL_METODOLOGIAS_CATALOG: MetodologiaAuditoriaCatalogItem[] = [
  {
    id: 'c0000000-0000-0000-0000-000000000001',
    metodologia: 'Presencial',
    descripcion: 'El equipo evaluador se desplaza físicamente a las instalaciones, plantas, oficinas y sedes multisitio del cliente.',
    protocolo_tic: 'Uso de dispositivos móviles para toma de evidencias fotográficas in situ y entrevistas directas.',
    regla_muestreo: 'Inspección física obligatoria de líneas productivas, almacenes, registros en papel y condiciones ambientales.',
    seguridad_confidencialidad: 'Cumplimiento estricto de normas de seguridad industrial (EPP) y acuerdos de confidencialidad física.',
    usage_count: 15,
  },
  {
    id: 'c0000000-0000-0000-0000-000000000002',
    metodologia: 'Remota',
    descripcion: 'Auditoría conducida 100% mediante Tecnologías de Información y Comunicación (TIC) de conformidad con IAF MD 4.',
    protocolo_tic: 'Videoconferencia bidireccional en alta definición, uso compartido seguro de pantalla y entrevistas guiadas.',
    regla_muestreo: 'Validación previa de viabilidad técnica y conectividad en cada sede remota antes de la auditoría.',
    seguridad_confidencialidad: 'Canales cifrados TLS 1.3, prohibición de grabaciones no consentidas y destrucción de archivos temporales.',
    usage_count: 5,
  },
  {
    id: 'c0000000-0000-0000-0000-000000000003',
    metodologia: 'Mixta',
    descripcion: 'Formato híbrido que combina verificación in situ para procesos medulares con muestreo documental remoto.',
    protocolo_tic: 'Combinación de visitas de campo presenciales con sesiones remotas de revisión de liderazgo y políticas.',
    regla_muestreo: 'Los procesos operacionales de alto riesgo deben evaluarse presencialmente (mínimo 50% de días auditor).',
    seguridad_confidencialidad: 'Protocolo dual que integra seguridad física en planta con ciberseguridad en intercambio de archivos.',
    usage_count: 8,
  },
];

// ---------------------------------------------------------------------------
// Pure Domain Helper Functions
// ---------------------------------------------------------------------------

export function normalizeSearchString(val: string | null | undefined): string {
  if (!val) return '';
  return val
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Filters standards by search query and sidebar facets.
 */
export function filterNormas(
  normas: NormaEntity[],
  query: string,
  selectedStatus: string = 'ALL',
  selectedScheme: string = 'ALL'
): NormaEntity[] {
  const cleanQ = normalizeSearchString(query);

  return normas.filter((norma) => {
    // 1. Text search on code, title, scheme
    if (cleanQ) {
      const codeMatch = normalizeSearchString(norma.codigo).includes(cleanQ);
      const titleMatch = normalizeSearchString(norma.titulo).includes(cleanQ);
      const schemeMatch = normalizeSearchString(norma.esquema).includes(cleanQ);
      if (!codeMatch && !titleMatch && !schemeMatch) {
        return false;
      }
    }

    // 2. Status facet
    if (
      selectedStatus &&
      selectedStatus !== 'ALL' &&
      norma.estatus.toLowerCase() !== selectedStatus.toLowerCase()
    ) {
      return false;
    }

    // 3. Scheme facet
    if (
      selectedScheme &&
      selectedScheme !== 'ALL' &&
      norma.esquema.toLowerCase() !== selectedScheme.toLowerCase()
    ) {
      return false;
    }

    return true;
  });
}

/**
 * Filters IAF sectors by text search and risk category.
 */
export function filterSectoresIaf(
  sectors: SectorIafEntity[],
  subsectors: SubsectorIafEntity[],
  query: string,
  selectedRisk: string = 'ALL'
): SectorIafEntity[] {
  const cleanQ = normalizeSearchString(query);

  return sectors.filter((sec) => {
    // 1. Text search on sector number and description
    if (cleanQ) {
      const numMatch = String(sec.sector).includes(cleanQ);
      const descMatch = normalizeSearchString(sec.descripcion).includes(cleanQ);
      if (!numMatch && !descMatch) {
        return false;
      }
    }

    // 2. Risk facet based on child sub-sectors
    if (selectedRisk && selectedRisk !== 'ALL') {
      const relatedSub = subsectors.filter((s) => s.sector_numero === sec.sector);
      const hasRisk = relatedSub.some(
        (s) => s.categoria_riesgo.toUpperCase() === selectedRisk.toUpperCase()
      );
      if (!hasRisk) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Filters sub-sectors by sector number and optional search query.
 */
export function filterSubsectoresBySector(
  subsectors: SubsectorIafEntity[],
  sectorNumber: number,
  query?: string
): SubsectorIafEntity[] {
  const cleanQ = normalizeSearchString(query);

  return subsectors.filter((sub) => {
    if (sub.sector_numero !== sectorNumber) return false;
    if (cleanQ) {
      const codeMatch = normalizeSearchString(sub.codigo).includes(cleanQ);
      const descMatch = normalizeSearchString(sub.descripcion).includes(cleanQ);
      const riskMatch = normalizeSearchString(sub.categoria_riesgo).includes(cleanQ);
      return codeMatch || descMatch || riskMatch;
    }
    return true;
  });
}

/**
 * Calculates ltree requirement indentation based on materialized path or dots.
 */
export function calculateLtreeIndentation(
  rutaMaterializada: string | null | undefined,
  codigo: string
): { level: number; indentPx: number; isParent: boolean } {
  if (rutaMaterializada && rutaMaterializada.includes('.')) {
    const segments = rutaMaterializada.split('.');
    const level = segments.length;
    return {
      level,
      indentPx: (level - 1) * 20,
      isParent: level === 1,
    };
  }

  const dotCount = (codigo.match(/\./g) || []).length;
  const level = dotCount + 1;
  return {
    level,
    indentPx: dotCount * 20,
    isParent: dotCount === 0,
  };
}

export interface RequisitoContentStatus {
  hasEs: boolean;
  hasEn: boolean;
  hasEsTitle: boolean;
  hasEnTitle: boolean;
  hasAnyContent: boolean;
  label: string;
  badgeClass: string;
}

export interface NormaBilingualCoverage {
  totalClauses: number;
  authoredCount: number;
  bilingualCount: number;
  esCount: number;
  enCount: number;
  isBilingual: boolean;
  hasAnyContent: boolean;
  shortLabel: string;
  label: string;
  badgeClass: string;
  detailTitle: string;
}

export interface RequisitoBilingualTitles {
  primaryTitle: string;
  secondaryEnTitle: string | null;
  isUnauthoredTitle: boolean;
}

/**
 * Numeric-aware LTREE path/code comparator (ensures 1 < 2 < 10 and 5.1 < 5.1.2 < 5.10).
 */
export function compareRequisitosNumerically(
  a: RequisitoLtree,
  b: RequisitoLtree
): number {
  const pathA = (a.ruta_materializada || a.codigo || '').trim();
  const pathB = (b.ruta_materializada || b.codigo || '').trim();
  const cmp = pathA.localeCompare(pathB, 'es', { numeric: true });
  if (cmp !== 0) return cmp;
  return (a.codigo || '').localeCompare(b.codigo || '', 'es', { numeric: true });
}

function hasRawHtmlContent(html: string | null | undefined): boolean {
  if (!html) return false;
  return (
    html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim().length > 0
  );
}

/**
 * Evaluates ES/EN translation & content readiness for a single clause.
 */
export function getRequisitoContentStatus(
  req: RequisitoLtree
): RequisitoContentStatus {
  const esTitle = (req.translations?.es?.title || '').trim();
  const enTitle = (req.translations?.en?.title || '').trim();
  const esHasHtml = hasRawHtmlContent(req.translations?.es?.content_html);
  const enHasHtml = hasRawHtmlContent(req.translations?.en?.content_html);

  const hasLegacyFallbackContent =
    !req.translations && Boolean((req.descripcion || '').trim());

  const hasEs = esHasHtml || hasLegacyFallbackContent;
  const hasEn = enHasHtml;
  const hasAnyContent = hasEs || hasEn;

  if (hasEs && hasEn) {
    return {
      hasEs,
      hasEn,
      hasEsTitle: esTitle.length > 0,
      hasEnTitle: enTitle.length > 0,
      hasAnyContent: true,
      label: 'ES ✓ · EN ✓',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    };
  }
  if (hasEs) {
    return {
      hasEs,
      hasEn: false,
      hasEsTitle: esTitle.length > 0,
      hasEnTitle: enTitle.length > 0,
      hasAnyContent: true,
      label: 'Solo ES',
      badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
    };
  }
  if (hasEn) {
    return {
      hasEs: false,
      hasEn,
      hasEsTitle: esTitle.length > 0,
      hasEnTitle: enTitle.length > 0,
      hasAnyContent: true,
      label: 'Solo EN',
      badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    };
  }
  return {
    hasEs: false,
    hasEn: false,
    hasEsTitle: esTitle.length > 0,
    hasEnTitle: enTitle.length > 0,
    hasAnyContent: false,
    label: 'Pendiente de redactar',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
  };
}

export function isGenericRequisitoPlaceholderTitle(
  rawTitle: string | null | undefined,
  codigo: string
): boolean {
  const clean = (rawTitle || '').trim().toLowerCase();
  if (!clean) return false;
  const codeLower = (codigo || '').trim().toLowerCase();
  const genericClause = `cláusula ${codeLower}`;
  const genericChapter = `capítulo ${codeLower}`;
  const genericClauseEn = `clause ${codeLower}`;
  return (
    clean === genericClause ||
    clean === genericChapter ||
    clean === genericClauseEn ||
    clean === `${genericClause} · sin redactar` ||
    clean === `${genericChapter} · sin redactar`
  );
}

/**
 * Resolves primary ES display title + optional secondary EN subtitle for clause rows.
 * Returns an empty `primaryTitle` when no authored title exists (never synthesizes fake `Cláusula X.Y` titles).
 */
export function getRequisitoBilingualTitles(
  req: RequisitoLtree
): RequisitoBilingualTitles {
  const esTitle = (req.translations?.es?.title || '').trim();
  const enTitle = (req.translations?.en?.title || '').trim();
  const rawTitulo = (req.titulo || '').trim();
  const hasMeaningfulLegacyTitle =
    rawTitulo.length > 0 && !isGenericRequisitoPlaceholderTitle(rawTitulo, req.codigo);

  if (esTitle || enTitle) {
    const primaryTitle = esTitle || enTitle;
    const secondaryEnTitle =
      esTitle && enTitle && enTitle.toLowerCase() !== esTitle.toLowerCase()
        ? enTitle
        : null;
    return {
      primaryTitle,
      secondaryEnTitle,
      isUnauthoredTitle: false,
    };
  }

  if (hasMeaningfulLegacyTitle) {
    return {
      primaryTitle: rawTitulo,
      secondaryEnTitle: null,
      isUnauthoredTitle: false,
    };
  }

  const contentStatus = getRequisitoContentStatus(req);
  return {
    primaryTitle: '',
    secondaryEnTitle: null,
    isUnauthoredTitle: !contentStatus.hasAnyContent,
  };
}

/**
 * Computes bilingual authorship coverage across all active clauses of a standard (`NormaEntity`).
 */
export function computeNormaBilingualCoverage(
  norma: NormaEntity,
  requisitos: ReadonlyArray<RequisitoLtree>
): NormaBilingualCoverage {
  const normaCodeLower = (norma.codigo || norma.norma || '').trim().toLowerCase();
  const normaReqs = requisitos.filter(
    (r) =>
      !r.deleted_at &&
      (r.id_norma === norma.id ||
        (normaCodeLower && r.norma_codigo.trim().toLowerCase() === normaCodeLower))
  );

  const totalClauses =
    normaReqs.length > 0 ? normaReqs.length : Math.max(0, norma.clausulas_count || 0);
  let authoredCount = 0;
  let bilingualCount = 0;
  let esCount = 0;
  let enCount = 0;

  for (let i = 0; i < normaReqs.length; i += 1) {
    const st = getRequisitoContentStatus(normaReqs[i]);
    if (st.hasEs) esCount += 1;
    if (st.hasEn) enCount += 1;
    if (st.hasAnyContent) authoredCount += 1;
    if (st.hasEs && st.hasEn) bilingualCount += 1;
  }

  if (bilingualCount > 0 || (esCount > 0 && enCount > 0)) {
    return {
      totalClauses,
      authoredCount,
      bilingualCount,
      esCount,
      enCount,
      isBilingual: true,
      hasAnyContent: true,
      shortLabel: 'Bilingüe ES/EN',
      label: 'Bilingüe ES/EN',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      detailTitle: `${totalClauses} cláusulas (${bilingualCount} con contenido bilingüe ES/EN)`,
    };
  }

  if (authoredCount > 0) {
    return {
      totalClauses,
      authoredCount,
      bilingualCount,
      esCount,
      enCount,
      isBilingual: false,
      hasAnyContent: true,
      shortLabel: enCount > 0 && esCount === 0 ? 'Contenido EN' : 'Contenido ES',
      label: enCount > 0 && esCount === 0 ? 'Contenido EN' : 'Contenido ES',
      badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
      detailTitle: `${totalClauses} cláusulas (${authoredCount} redactadas)`,
    };
  }

  return {
    totalClauses,
    authoredCount: 0,
    bilingualCount: 0,
    esCount: 0,
    enCount: 0,
    isBilingual: false,
    hasAnyContent: false,
    shortLabel: 'Sin redactar',
    label: 'Estructura · Sin redactar',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    detailTitle: `${totalClauses} cláusulas estructurales pendientes de redacción`,
  };
}

/**
 * Returns only Level-1 root chapters (`!id_requisito_padre`), sorted numerically.
 */
export function filterNormaRootRequisitos(
  requisitos: ReadonlyArray<RequisitoLtree>
): RequisitoLtree[] {
  return requisitos
    .filter((r) => !r.deleted_at && !r.id_requisito_padre)
    .slice()
    .sort(compareRequisitosNumerically);
}

/**
 * Computes descendant clause counts for every clause in O(n) with anti-cycle protection.
 */
export function countRequisitoDescendants(
  requisitos: ReadonlyArray<RequisitoLtree>
): Map<string, number> {
  const childrenByParent = new Map<string, string[]>();
  const activeIds = new Set<string>();

  for (let i = 0; i < requisitos.length; i += 1) {
    const req = requisitos[i];
    if (req.deleted_at) continue;
    activeIds.add(req.id);
    if (req.id_requisito_padre) {
      let bucket = childrenByParent.get(req.id_requisito_padre);
      if (!bucket) {
        bucket = [];
        childrenByParent.set(req.id_requisito_padre, bucket);
      }
      bucket.push(req.id);
    }
  }

  const memo = new Map<string, number>();

  const countFor = (nodeId: string, visiting: Set<string>): number => {
    const cached = memo.get(nodeId);
    if (cached !== undefined) return cached;
    if (visiting.has(nodeId)) return 0;

    visiting.add(nodeId);
    const children = childrenByParent.get(nodeId) || [];
    let total = 0;
    for (let i = 0; i < children.length; i += 1) {
      const childId = children[i];
      if (!activeIds.has(childId) || visiting.has(childId)) continue;
      total += 1 + countFor(childId, visiting);
    }
    visiting.delete(nodeId);
    memo.set(nodeId, total);
    return total;
  };

  activeIds.forEach((id) => {
    if (!memo.has(id)) {
      countFor(id, new Set<string>());
    }
  });

  return memo;
}

/**
 * Formats a human-readable hierarchical breadcrumb path (Zero-UUID) e.g. `Capítulo 5 › 5.1 › 5.1.2`.
 */
export function formatRequisitoHierarchyPath(
  req: RequisitoLtree,
  byIdMap: ReadonlyMap<string, RequisitoLtree>
): string {
  const chain: string[] = [];
  const visited = new Set<string>();
  let current: RequisitoLtree | undefined = req;
  let guard = 0;

  while (current && guard < 12) {
    if (visited.has(current.id)) break;
    visited.add(current.id);
    chain.unshift(current.codigo);
    current = current.id_requisito_padre
      ? byIdMap.get(current.id_requisito_padre)
      : undefined;
    guard += 1;
  }

  if (chain.length === 0) {
    return `Capítulo ${req.codigo}`;
  }
  chain[0] = `Capítulo ${chain[0]}`;
  return chain.join(' › ');
}

/**
 * Instant cross-level ES + EN requirement search across all 7 LTREE depths.
 * Matches clause code, LTREE path, ES/EN titles, and stripped HTML body text.
 */
export function filterNormaRequisitosCrossLevel(
  requisitos: ReadonlyArray<RequisitoLtree>,
  query: string
): RequisitoLtree[] {
  const active = requisitos.filter((r) => !r.deleted_at);
  const cleanQ = normalizeSearchString(query);
  if (!cleanQ) {
    return active.slice().sort(compareRequisitosNumerically);
  }

  const tokens = cleanQ.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return active.slice().sort(compareRequisitosNumerically);
  }

  return active
    .filter((req) => {
      const esTitle = req.translations?.es?.title || '';
      const esBody = stripHtmlToSearchText(req.translations?.es?.content_html || '');
      const enTitle = req.translations?.en?.title || '';
      const enBody = stripHtmlToSearchText(req.translations?.en?.content_html || '');
      const haystack = normalizeSearchString(
        `${req.codigo} ${req.ruta_materializada} ${esTitle} ${esBody} ${enTitle} ${enBody} ${req.titulo || ''} ${req.descripcion || ''}`
      );
      return tokens.every((tok) => haystack.includes(tok));
    })
    .sort(compareRequisitosNumerically);
}

export interface RequisitoNavigationContext {
  parentReq: RequisitoLtree | null;
  siblings: RequisitoLtree[];
  prevSibling: RequisitoLtree | null;
  nextSibling: RequisitoLtree | null;
  directChildren: RequisitoLtree[];
}

export interface RequisitoSiblingWindow {
  visibleSiblings: RequisitoLtree[];
  hiddenBefore: number;
  hiddenAfter: number;
  activeIndex: number;
}

/**
 * Pure helper computing parent, numerically ordered same-level siblings,
 * immediate previous/next neighbors, and direct child clauses within the same standard.
 */
export function buildRequisitoNavigationContext(
  targetReq: RequisitoLtree,
  allRequisitosOfNorma: ReadonlyArray<RequisitoLtree>
): RequisitoNavigationContext {
  const normaReqs = allRequisitosOfNorma.filter(
    (r) => !r.deleted_at && r.id_norma === targetReq.id_norma
  );

  const parentId = targetReq.id_requisito_padre || null;
  const parentReq = parentId
    ? normaReqs.find((r) => r.id === parentId) ?? null
    : null;

  const siblingCandidates = normaReqs.filter(
    (r) => (r.id_requisito_padre || null) === parentId
  );
  if (!siblingCandidates.some((r) => r.id === targetReq.id) && !targetReq.deleted_at) {
    siblingCandidates.push(targetReq);
  }
  const siblings = siblingCandidates.slice().sort(compareRequisitosNumerically);

  const activeIdx = siblings.findIndex((r) => r.id === targetReq.id);
  const prevSibling = activeIdx > 0 ? siblings[activeIdx - 1] : null;
  const nextSibling =
    activeIdx >= 0 && activeIdx < siblings.length - 1
      ? siblings[activeIdx + 1]
      : null;

  const directChildren = normaReqs
    .filter((r) => r.id_requisito_padre === targetReq.id)
    .slice()
    .sort(compareRequisitosNumerically);

  return {
    parentReq,
    siblings,
    prevSibling,
    nextSibling,
    directChildren,
  };
}

/**
 * Computes a compact centered window of sibling pills when a level has many clauses
 * (e.g. ISO 22000 Chapter 3 with 45 definitions) to keep Zone 1 readable without wrapping bloat.
 */
export function sliceRequisitoSiblingsWindow(
  siblings: ReadonlyArray<RequisitoLtree>,
  activeId: string,
  maxVisible = 9
): RequisitoSiblingWindow {
  const safeMax = Math.max(1, Math.floor(maxVisible));
  const activeIndex = siblings.findIndex((s) => s.id === activeId);

  if (siblings.length <= safeMax) {
    return {
      visibleSiblings: [...siblings],
      hiddenBefore: 0,
      hiddenAfter: 0,
      activeIndex,
    };
  }

  const anchor = activeIndex >= 0 ? activeIndex : 0;
  const half = Math.floor(safeMax / 2);
  let start = Math.max(0, anchor - half);
  let end = start + safeMax;
  if (end > siblings.length) {
    end = siblings.length;
    start = Math.max(0, end - safeMax);
  }

  return {
    visibleSiblings: siblings.slice(start, end),
    hiddenBefore: start,
    hiddenAfter: siblings.length - end,
    activeIndex,
  };
}

/**
 * Visual badge formatting for Risk Categories.
 */
export function formatRiskCategoryBadge(riesgo: 'ALTO' | 'MEDIO' | 'BAJO' | string): {
  label: string;
  badgeClass: string;
  symbol: string;
} {
  switch (riesgo.toUpperCase()) {
    case 'ALTO':
      return {
        label: 'ALTO RIESGO',
        badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
        symbol: '🔴',
      };
    case 'MEDIO':
      return {
        label: 'RIESGO MEDIO',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
        symbol: '🟡',
      };
    case 'BAJO':
    default:
      return {
        label: 'BAJO RIESGO',
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        symbol: '🟢',
      };
  }
}

/**
 * Visual badge formatting for standard validity status.
 */
export function formatNormaStatusBadge(estatus: string): {
  label: string;
  badgeClass: string;
  symbol: string;
} {
  switch (estatus.toLowerCase()) {
    case 'vigente':
      return {
        label: 'VIGENTE',
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        symbol: '✓',
      };
    case 'en revisión':
    case 'en revision':
      return {
        label: 'EN REVISIÓN',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
        symbol: '⏳',
      };
    case 'obsoleta':
    default:
      return {
        label: 'OBSOLETA',
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
        symbol: '✕',
      };
  }
}

/**
 * Visual badge formatting for accreditation status.
 */
export function formatAcreditacionStatusBadge(estatus: string): {
  label: string;
  badgeClass: string;
  symbol: string;
} {
  const normalized = (estatus || '').trim().toLowerCase();
  switch (normalized) {
    case 'activo':
    case 'activa':
      return {
        label: estatus.trim() || 'Activo',
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        symbol: '✓',
      };
    case 'estudio':
    case 'en revisión':
    case 'en revision':
      return {
        label: estatus.trim() || 'Estudio',
        badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
        symbol: '◐',
      };
    case 'en ejecución':
    case 'en ejecucion':
    case 'en renovación':
    case 'en renovacion':
      return {
        label: estatus.trim() || 'En Renovación',
        badgeClass: 'bg-teal-50 text-teal-800 border-teal-200',
        symbol: '⏳',
      };
    case 'planificado':
      return {
        label: estatus.trim() || 'Planificado',
        badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
        symbol: '◷',
      };
    case 'suspendido':
    case 'suspendida':
    case 'en espera':
      return {
        label: estatus.trim() || 'Suspendido',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
        symbol: '⏸',
      };
    case 'inactivo':
    case 'retirada':
    case 'retirado':
      return {
        label: estatus.trim() || 'Inactivo',
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
        symbol: '⊘',
      };
    case 'cancelado':
    case 'vencida':
    case 'vencido':
    default:
      return {
        label: estatus.trim() || 'Cancelado',
        badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
        symbol: '✕',
      };
  }
}

// ---------------------------------------------------------------------------
// Step 2.1: Simple Catalog Draft Factories, Pure Validators & Client Enrichment
// ---------------------------------------------------------------------------

export const CATALOG_SIMPLE_MAX_LENGTH = 50;

export function createEmptyEstatusFormDraft(): EstatusFormDraft {
  return { estatus: '' };
}

export function createEstatusFormDraftFromEntity(
  item: EstatusCatalogItem
): EstatusFormDraft {
  return { estatus: item.estatus };
}

export function createEmptyTipoFormDraft(): TipoAuditoriaFormDraft {
  return { tipo: '' };
}

export function createTipoFormDraftFromEntity(
  item: TipoAuditoriaCatalogItem
): TipoAuditoriaFormDraft {
  return { tipo: item.tipo };
}

export function createEmptyMetodologiaFormDraft(): MetodologiaAuditoriaFormDraft {
  return { metodologia: '' };
}

export function createMetodologiaFormDraftFromEntity(
  item: MetodologiaAuditoriaCatalogItem
): MetodologiaAuditoriaFormDraft {
  return { metodologia: item.metodologia };
}

export function validateEstatusDraft(
  draft: EstatusFormDraft,
  existingItems: EstatusCatalogItem[],
  excludeId?: string
): CatalogSimpleValidationResult<EstatusFormDraft> {
  const normalized = (draft.estatus || '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return {
      valid: false,
      error: 'El nombre del estatus es obligatorio.',
    };
  }
  if (normalized.length > CATALOG_SIMPLE_MAX_LENGTH) {
    return {
      valid: false,
      error: `El estatus no puede exceder los ${CATALOG_SIMPLE_MAX_LENGTH} caracteres.`,
    };
  }
  const normalizedLower = normalized.toLowerCase();
  const duplicate = existingItems.some(
    (item) =>
      !item.deleted_at &&
      (!excludeId || item.id !== excludeId) &&
      item.estatus.trim().toLowerCase() === normalizedLower
  );
  if (duplicate) {
    return {
      valid: false,
      error: `Ya existe un estatus activo denominado "${normalized}".`,
    };
  }
  return {
    valid: true,
    normalized: { estatus: normalized },
  };
}

export function validateTipoAuditoriaDraft(
  draft: TipoAuditoriaFormDraft,
  existingItems: TipoAuditoriaCatalogItem[],
  excludeId?: string
): CatalogSimpleValidationResult<TipoAuditoriaFormDraft> {
  const normalized = (draft.tipo || '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return {
      valid: false,
      error: 'El nombre del tipo de auditoría es obligatorio.',
    };
  }
  if (normalized.length > CATALOG_SIMPLE_MAX_LENGTH) {
    return {
      valid: false,
      error: `El tipo de auditoría no puede exceder los ${CATALOG_SIMPLE_MAX_LENGTH} caracteres.`,
    };
  }
  const normalizedLower = normalized.toLowerCase();
  const duplicate = existingItems.some(
    (item) =>
      !item.deleted_at &&
      (!excludeId || item.id !== excludeId) &&
      item.tipo.trim().toLowerCase() === normalizedLower
  );
  if (duplicate) {
    return {
      valid: false,
      error: `Ya existe un tipo de auditoría activo denominado "${normalized}".`,
    };
  }
  return {
    valid: true,
    normalized: { tipo: normalized },
  };
}

export function validateMetodologiaAuditoriaDraft(
  draft: MetodologiaAuditoriaFormDraft,
  existingItems: MetodologiaAuditoriaCatalogItem[],
  excludeId?: string
): CatalogSimpleValidationResult<MetodologiaAuditoriaFormDraft> {
  const normalized = (draft.metodologia || '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return {
      valid: false,
      error: 'El nombre de la metodología es obligatorio.',
    };
  }
  if (normalized.length > CATALOG_SIMPLE_MAX_LENGTH) {
    return {
      valid: false,
      error: `La metodología no puede exceder los ${CATALOG_SIMPLE_MAX_LENGTH} caracteres.`,
    };
  }
  const normalizedLower = normalized.toLowerCase();
  const duplicate = existingItems.some(
    (item) =>
      !item.deleted_at &&
      (!excludeId || item.id !== excludeId) &&
      item.metodologia.trim().toLowerCase() === normalizedLower
  );
  if (duplicate) {
    return {
      valid: false,
      error: `Ya existe una metodología activa denominada "${normalized}".`,
    };
  }
  return {
    valid: true,
    normalized: { metodologia: normalized },
  };
}

export function buildEstatusCatalogItem(row: {
  id: string;
  estatus: string;
  usage_count?: number;
  deleted_at?: string | null;
}): EstatusCatalogItem {
  const cleanName = row.estatus.trim();
  const seedMatch = INITIAL_ESTATUS_CATALOG.find(
    (e) => e.id === row.id || e.estatus.toLowerCase() === cleanName.toLowerCase()
  );
  return {
    id: row.id,
    estatus: cleanName || seedMatch?.estatus || 'Estatus',
    descripcion:
      seedMatch?.descripcion ||
      `Estado operativo "${cleanName}" registrado en el catálogo del sistema.`,
    categoria_aplicable: seedMatch?.categoria_aplicable || 'Certificados, Auditorías',
    color_token: seedMatch?.color_token || 'slate',
    usage_count: row.usage_count ?? seedMatch?.usage_count ?? 0,
    deleted_at: row.deleted_at ?? null,
  };
}

export function buildTipoAuditoriaCatalogItem(row: {
  id: string;
  tipo: string;
  usage_count?: number;
  deleted_at?: string | null;
}): TipoAuditoriaCatalogItem {
  const cleanName = row.tipo.trim();
  const seedMatch = INITIAL_TIPOS_AUDITORIA_CATALOG.find(
    (t) => t.id === row.id || t.tipo.toLowerCase() === cleanName.toLowerCase()
  );
  return {
    id: row.id,
    tipo: cleanName || seedMatch?.tipo || 'Modalidad',
    etapa_ciclo: seedMatch?.etapa_ciclo || 'Modalidad Específica',
    descripcion:
      seedMatch?.descripcion ||
      `Modalidad de auditoría "${cleanName}" alineada con el programa ISO/IEC 17021-1:2015.`,
    duracion_formula:
      seedMatch?.duracion_formula ||
      'Calculada según alcance técnico y lineamientos IAF MD 5',
    reporte_requerido:
      seedMatch?.reporte_requerido ||
      'Informe técnico de auditoría con registro de hallazgos y conclusiones',
    usage_count: row.usage_count ?? seedMatch?.usage_count ?? 0,
    deleted_at: row.deleted_at ?? null,
  };
}

export function buildMetodologiaAuditoriaCatalogItem(row: {
  id: string;
  metodologia: string;
  usage_count?: number;
  deleted_at?: string | null;
}): MetodologiaAuditoriaCatalogItem {
  const cleanName = row.metodologia.trim();
  const seedMatch = INITIAL_METODOLOGIAS_CATALOG.find(
    (m) => m.id === row.id || m.metodologia.toLowerCase() === cleanName.toLowerCase()
  );
  return {
    id: row.id,
    metodologia: cleanName || seedMatch?.metodologia || 'Metodología',
    descripcion:
      seedMatch?.descripcion ||
      `Metodología de ejecución "${cleanName}" conforme a ISO 19011:2018.`,
    protocolo_tic:
      seedMatch?.protocolo_tic ||
      'Evaluación documental y entrevistas conforme a protocolo TIC / IAF MD 4',
    regla_muestreo:
      seedMatch?.regla_muestreo ||
      'Muestreo de evidencias definido en el plan aprobado de auditoría',
    seguridad_confidencialidad:
      seedMatch?.seguridad_confidencialidad ||
      'Resguardo confidencial de evidencias conforme a ISO/IEC 17021-1 cl. 8.4',
    usage_count: row.usage_count ?? seedMatch?.usage_count ?? 0,
    deleted_at: row.deleted_at ?? null,
  };
}

// ---------------------------------------------------------------------------
// Step 2.3: Sector IAF & Sub-Sector IAF Contracts, Descriptions & Validators
// ---------------------------------------------------------------------------

export const SUBSECTOR_CODIGO_MAX_LENGTH = 10;
export const SUBSECTOR_DESCRIPCION_MAX_LENGTH = 500;

export const IAF_SECTOR_DESCRIPTIONS: Record<number, string> = {
  1: 'Agricultura, silvicultura y pesca',
  2: 'Minería y explotación de canteras',
  3: 'Productos alimenticios, bebidas y tabaco',
  4: 'Textiles y productos textiles',
  5: 'Cuero y productos de cuero',
  6: 'Madera y productos de madera',
  7: 'Pulpa, papel y productos de papel',
  8: 'Empresas editoriales',
  9: 'Empresas de impresión',
  10: 'Fabricación de coque y productos de refinación de petróleo',
  11: 'Combustible nuclear',
  12: 'Productos químicos, sustancias químicas y fibras',
  13: 'Productos farmacéuticos',
  14: 'Productos químicos, fibras sintéticas y farmacéuticos',
  15: 'Productos minerales no metálicos',
  16: 'Hormigón, cemento, cal, yeso, etc.',
  17: 'Metales básicos y productos metálicos elaborados',
  18: 'Maquinaria y equipo',
  19: 'Equipo eléctrico y óptico',
  20: 'Construcción naval',
  21: 'Aeroespacial',
  22: 'Otros equipos de transporte',
  23: 'Manufactura no clasificada en otra parte',
  24: 'Reciclaje',
  25: 'Suministro de electricidad',
  26: 'Suministro de gas',
  27: 'Suministro de agua',
  28: 'Construcción e ingeniería civil',
  29: 'Comercio al por mayor y al por menor; reparación de vehículos',
  30: 'Hoteles y restaurantes',
  31: 'Transporte, almacenamiento y comunicaciones',
  32: 'Intermediación financiera, bienes raíces y alquiler',
  33: 'Tecnología de la información y comunicaciones',
  34: 'Servicios de ingeniería',
  35: 'Otros servicios profesionales y de ensayo',
  36: 'Administración pública',
  37: 'Educación',
  38: 'Servicios sociales y de salud',
  39: 'Otros servicios sociales',
};

export function resolveSectorIafDescription(
  sectorNumber: number,
  customDesc?: string | null
): string {
  const cleanCustom = (customDesc || '').trim();
  if (cleanCustom) return cleanCustom;
  if (!Number.isInteger(sectorNumber) || sectorNumber <= 0) {
    return 'Sector técnico IAF pendiente de definición';
  }
  const seedMatch = INITIAL_SECTORES_IAF.find((s) => s.sector === sectorNumber);
  if (seedMatch?.descripcion) {
    return seedMatch.descripcion;
  }
  return (
    IAF_SECTOR_DESCRIPTIONS[sectorNumber] ||
    `Sector industrial y comercial ${sectorNumber}`
  );
}

export const SECTOR_DESCRIPCION_MAX_LENGTH = 500;

export function createEmptySectorIafFormDraft(): SectorIafFormDraft {
  return { sector: '', descripcion: '' };
}

export function createSectorIafDraftFromEntity(
  sector: Pick<SectorIafEntity, 'sector' | 'descripcion'>
): SectorIafFormDraft {
  return {
    sector: String(sector.sector),
    descripcion: sector.descripcion || '',
  };
}

export function createEmptySubsectorIafFormDraft(
  prefillSectorId = ''
): SubsectorIafFormDraft {
  return {
    id_sector_iaf: prefillSectorId,
    codigo: '',
    descripcion: '',
    categoria_riesgo: 'MEDIO',
  };
}

export function createSubsectorIafDraftFromEntity(
  subsector: SubsectorIafEntity
): SubsectorIafFormDraft {
  return {
    id_sector_iaf: subsector.id_sector_iaf,
    codigo: subsector.codigo,
    descripcion: subsector.descripcion,
    categoria_riesgo: subsector.categoria_riesgo,
  };
}

export function validateSectorIafDraft(
  draft: SectorIafFormDraft,
  existingSectors: ReadonlyArray<SectorIafEntity>,
  excludeId?: string
): CatalogSimpleValidationResult<{ sector: number; descripcion: string }> {
  const raw = (draft.sector || '').trim();
  if (!raw) {
    return {
      valid: false,
      error: 'El número de Sector IAF es obligatorio.',
    };
  }
  if (!/^\d+$/.test(raw)) {
    return {
      valid: false,
      error: 'El código de Sector IAF debe ser un número entero positivo entre 1 y 99.',
    };
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 99) {
    return {
      valid: false,
      error: 'El número de Sector IAF debe estar comprendido entre 1 y 99.',
    };
  }
  const duplicate = existingSectors.some(
    (s) =>
      !s.deleted_at &&
      (!excludeId || s.id !== excludeId) &&
      s.sector === parsed
  );
  if (duplicate) {
    return {
      valid: false,
      error: `Ya existe un Sector IAF activo registrado con el número ${parsed}.`,
    };
  }

  const descripcion = (draft.descripcion || '').replace(/\s+/g, ' ').trim();
  if (!descripcion) {
    return {
      valid: false,
      error: 'La descripción del Sector IAF es obligatoria.',
    };
  }
  if (descripcion.length > SECTOR_DESCRIPCION_MAX_LENGTH) {
    return {
      valid: false,
      error: `La descripción del Sector IAF no puede exceder los ${SECTOR_DESCRIPCION_MAX_LENGTH} caracteres.`,
    };
  }

  return {
    valid: true,
    normalized: {
      sector: parsed,
      descripcion,
    },
  };
}

export function validateSubsectorIafDraft(
  draft: SubsectorIafFormDraft,
  existingSubsectors: ReadonlyArray<SubsectorIafEntity>,
  excludeId?: string
): CatalogSimpleValidationResult<{
  id_sector_iaf: string;
  codigo: string;
  descripcion: string;
  categoria_riesgo: SubsectorRiskCategory;
}> {
  const parentId = (draft.id_sector_iaf || '').trim();
  if (!parentId) {
    return {
      valid: false,
      error: 'Debe seleccionar un Sector IAF padre.',
    };
  }
  if (!isValidUuid(parentId)) {
    return {
      valid: false,
      error: 'El Sector IAF padre seleccionado no tiene un identificador válido.',
    };
  }

  const codigo = (draft.codigo || '').replace(/\s+/g, ' ').trim();
  if (!codigo) {
    return {
      valid: false,
      error: 'El código del sub-sector es obligatorio.',
    };
  }
  if (codigo.length > SUBSECTOR_CODIGO_MAX_LENGTH) {
    return {
      valid: false,
      error: `El código del sub-sector no puede exceder los ${SUBSECTOR_CODIGO_MAX_LENGTH} caracteres.`,
    };
  }

  const codigoLower = codigo.toLowerCase();
  const duplicate = existingSubsectors.some(
    (sub) =>
      !sub.deleted_at &&
      (!excludeId || sub.id !== excludeId) &&
      sub.id_sector_iaf === parentId &&
      sub.codigo.trim().toLowerCase() === codigoLower
  );
  if (duplicate) {
    return {
      valid: false,
      error: `Ya existe un sub-sector activo con el código "${codigo}" dentro del Sector IAF seleccionado.`,
    };
  }

  const descripcion = (draft.descripcion || '').replace(/\s+/g, ' ').trim();
  if (!descripcion) {
    return {
      valid: false,
      error: 'La descripción técnica del sub-sector es obligatoria.',
    };
  }
  if (descripcion.length > SUBSECTOR_DESCRIPCION_MAX_LENGTH) {
    return {
      valid: false,
      error: `La descripción no puede exceder los ${SUBSECTOR_DESCRIPCION_MAX_LENGTH} caracteres.`,
    };
  }

  const riesgo = (draft.categoria_riesgo || '').toUpperCase() as SubsectorRiskCategory;
  if (!VALID_SUBSECTOR_RISK_CATEGORIES.includes(riesgo)) {
    return {
      valid: false,
      error: 'Seleccione una categoría de riesgo ISO válida (ALTO, MEDIO o BAJO).',
    };
  }

  return {
    valid: true,
    normalized: {
      id_sector_iaf: parentId,
      codigo,
      descripcion,
      categoria_riesgo: riesgo,
    },
  };
}

// ---------------------------------------------------------------------------
// Step 2.4: Norma & Requisito (LTREE) Contracts, Pure Path Engine & Validators
// ---------------------------------------------------------------------------

export const NORMA_ESQUEMA_MAX_LENGTH = 50;
export const NORMA_CODIGO_MAX_LENGTH = 50;
export const NORMA_TITULO_MAX_LENGTH = 255;
export const NORMA_NOMBRE_MAX_LENGTH = 100;
export const REQUISITO_CODIGO_MAX_LENGTH = 30;
export const REQUISITO_TITLE_MAX_LENGTH = 500;

export const VALID_NORMA_STATUSES = ['Vigente', 'En Revisión', 'Obsoleta'] as const;
export type NormaStatus = (typeof VALID_NORMA_STATUSES)[number];

export type NormaDetailMode = 'read' | 'add' | 'edit';
export type RequisitoDetailMode = 'read' | 'add' | 'edit';

export interface NormaFormDraft {
  esquema: string;
  codigo: string;
  norma: string;
  titulo: string;
  estatus: NormaStatus;
  fecha_publicacion: string;
}

export interface RequisitoFormDraft {
  id_norma: string;
  id_requisito_padre: string;
  codigo: string;
  explicit_code: boolean;
  es_obligatorio?: boolean;
  obligatorio_origen?: ObligatorioOrigen;
  ruta_materializada: string;
  title_es: string;
  content_html_es: string;
  title_en: string;
  content_html_en: string;
}

export function createEmptyNormaFormDraft(): NormaFormDraft {
  return {
    esquema: '',
    codigo: '',
    norma: '',
    titulo: '',
    estatus: 'Vigente',
    fecha_publicacion: '',
  };
}

export function createNormaDraftFromEntity(
  norma: Pick<NormaEntity, 'esquema' | 'codigo' | 'norma' | 'titulo' | 'estatus' | 'fecha_publicacion'>
): NormaFormDraft {
  const normalizedStatus: NormaStatus =
    norma.estatus === 'En Revisión' || norma.estatus === 'Obsoleta'
      ? norma.estatus
      : 'Vigente';
  return {
    esquema: norma.esquema || '',
    codigo: norma.codigo || norma.norma || '',
    norma: norma.norma || norma.codigo || '',
    titulo: norma.titulo || '',
    estatus: normalizedStatus,
    fecha_publicacion: (norma.fecha_publicacion || '').slice(0, 10),
  };
}

export function createEmptyRequisitoFormDraft(
  prefillNormaId = '',
  prefillPadreId = ''
): RequisitoFormDraft {
  return {
    id_norma: prefillNormaId,
    id_requisito_padre: prefillPadreId,
    codigo: '',
    explicit_code: false,
    es_obligatorio: true,
    obligatorio_origen: 'AUTO_TEXT',
    ruta_materializada: '',
    title_es: '',
    content_html_es: '',
    title_en: '',
    content_html_en: '',
  };
}

export function createRequisitoDraftFromEntity(
  req: Pick<
    RequisitoLtree,
    | 'id_norma'
    | 'id_requisito_padre'
    | 'codigo'
    | 'ruta_materializada'
    | 'explicit_code'
    | 'es_obligatorio'
    | 'obligatorio_origen'
    | 'titulo'
    | 'translations'
  >
): RequisitoFormDraft {
  const legacyTitle =
    req.titulo && !isGenericRequisitoPlaceholderTitle(req.titulo, req.codigo)
      ? req.titulo
      : '';
  return {
    id_norma: req.id_norma || '',
    id_requisito_padre: req.id_requisito_padre || '',
    codigo: req.codigo || '',
    explicit_code: Boolean(req.explicit_code),
    es_obligatorio: req.es_obligatorio ?? true,
    obligatorio_origen: req.obligatorio_origen ?? 'AUTO_TEXT',
    ruta_materializada: req.ruta_materializada || '',
    title_es: req.translations?.es?.title ?? legacyTitle,
    content_html_es: req.translations?.es?.content_html ?? '',
    title_en: req.translations?.en?.title ?? '',
    content_html_en: req.translations?.en?.content_html ?? '',
  };
}

/**
 * Converts a clause code such as "8.5.1" or "A.5-1" into a valid PostgreSQL LTREE label ([A-Za-z0-9_]+).
 */
export function sanitizeLtreeLabel(codigo: string): string {
  const normalized = (codigo || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/[.\-\s/]+/g, '_')
    .replace(/[^A-Za-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || 'req';
}

/**
 * Derives the full LTREE materialized path from the clause code and optional parent requirement.
 */
export function computeRequisitoLtreePath(
  codigo: string,
  parentReq?: Pick<RequisitoLtree, 'ruta_materializada' | 'codigo'> | null
): string {
  const cleanCode = (codigo || '').trim();
  if (!cleanCode) return '';
  const selfLabel = sanitizeLtreeLabel(cleanCode);
  if (!parentReq) {
    return selfLabel;
  }
  const parentPath =
    (parentReq.ruta_materializada || '').trim() ||
    sanitizeLtreeLabel(parentReq.codigo);
  return parentPath ? `${parentPath}.${selfLabel}` : selfLabel;
}

/**
 * Collects the ID of `rootId` and all its descendants (via parent links and LTREE prefix)
 * to prevent self-referencing or descendant cycles when editing `id_requisito_padre`.
 */
export function collectRequisitoDescendantIds(
  allReqs: ReadonlyArray<RequisitoLtree>,
  rootId: string
): Set<string> {
  const excluded = new Set<string>();
  if (!rootId) return excluded;

  const rootReq = allReqs.find((r) => r.id === rootId);
  const queue: string[] = [rootId];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (excluded.has(currentId)) continue;
    excluded.add(currentId);
    for (const candidate of allReqs) {
      if (candidate.deleted_at) continue;
      if (candidate.id_requisito_padre === currentId && !excluded.has(candidate.id)) {
        queue.push(candidate.id);
      }
    }
  }

  if (rootReq?.ruta_materializada) {
    const rootPrefix = `${rootReq.ruta_materializada}.`;
    for (const candidate of allReqs) {
      if (
        !candidate.deleted_at &&
        candidate.id_norma === rootReq.id_norma &&
        (candidate.ruta_materializada === rootReq.ruta_materializada ||
          candidate.ruta_materializada.startsWith(rootPrefix))
      ) {
        excluded.add(candidate.id);
      }
    }
  }

  return excluded;
}

/**
 * Filters active requirements belonging to `idNorma` eligible as parent of `excludeRequisitoId`,
 * excluding the requirement itself and all its descendants to guarantee an acyclic LTREE tree.
 */
export function filterValidParentRequisitos(
  allReqs: ReadonlyArray<RequisitoLtree>,
  idNorma: string,
  excludeRequisitoId?: string
): RequisitoLtree[] {
  if (!idNorma) return [];
  const excludedIds = excludeRequisitoId
    ? collectRequisitoDescendantIds(allReqs, excludeRequisitoId)
    : new Set<string>();

  return allReqs
    .filter(
      (req) =>
        !req.deleted_at &&
        req.id_norma === idNorma &&
        !excludedIds.has(req.id)
    )
    .slice()
    .sort((a, b) =>
      a.ruta_materializada.localeCompare(b.ruta_materializada, 'es', { numeric: true })
    );
}

export function validateNormaDraft(
  draft: NormaFormDraft,
  existingNormas: ReadonlyArray<NormaEntity>,
  excludeId?: string
): CatalogSimpleValidationResult<{
  esquema: string;
  codigo: string;
  norma: string;
  titulo: string;
  estatus: NormaStatus;
  fecha_publicacion: string | null;
}> {
  const codigo = (draft.codigo || '').replace(/\s+/g, ' ').trim();
  if (!codigo) {
    return {
      valid: false,
      error: 'El código de la norma es obligatorio (ej. ISO 9001:2015).',
    };
  }
  if (codigo.length > NORMA_CODIGO_MAX_LENGTH) {
    return {
      valid: false,
      error: `El código no puede exceder los ${NORMA_CODIGO_MAX_LENGTH} caracteres.`,
    };
  }

  const codigoLower = codigo.toLowerCase();
  const duplicate = existingNormas.some(
    (n) =>
      !n.deleted_at &&
      (!excludeId || n.id !== excludeId) &&
      (n.codigo || n.norma).trim().toLowerCase() === codigoLower
  );
  if (duplicate) {
    return {
      valid: false,
      error: `Ya existe una norma activa registrada con el código "${codigo}".`,
    };
  }

  const esquema = (draft.esquema || '').replace(/\s+/g, ' ').trim();
  if (!esquema) {
    return {
      valid: false,
      error: 'El esquema de certificación es obligatorio.',
    };
  }
  if (esquema.length > NORMA_ESQUEMA_MAX_LENGTH) {
    return {
      valid: false,
      error: `El esquema no puede exceder los ${NORMA_ESQUEMA_MAX_LENGTH} caracteres.`,
    };
  }

  const norma = ((draft.norma || '').replace(/\s+/g, ' ').trim()) || codigo;
  if (norma.length > NORMA_NOMBRE_MAX_LENGTH) {
    return {
      valid: false,
      error: `El nombre corto de norma no puede exceder los ${NORMA_NOMBRE_MAX_LENGTH} caracteres.`,
    };
  }

  const titulo = (draft.titulo || '').replace(/\s+/g, ' ').trim();
  if (!titulo) {
    return {
      valid: false,
      error: 'El título oficial de la norma es obligatorio.',
    };
  }
  if (titulo.length > NORMA_TITULO_MAX_LENGTH) {
    return {
      valid: false,
      error: `El título oficial no puede exceder los ${NORMA_TITULO_MAX_LENGTH} caracteres.`,
    };
  }

  const estatus = draft.estatus;
  if (!VALID_NORMA_STATUSES.includes(estatus)) {
    return {
      valid: false,
      error: 'Seleccione un estatus de vigencia válido (Vigente, En Revisión u Obsoleta).',
    };
  }

  const rawDate = (draft.fecha_publicacion || '').trim();
  if (rawDate && !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    return {
      valid: false,
      error: 'La fecha de publicación debe tener el formato YYYY-MM-DD.',
    };
  }

  return {
    valid: true,
    normalized: {
      esquema,
      codigo,
      norma,
      titulo,
      estatus,
      fecha_publicacion: rawDate || null,
    },
  };
}

export function validateRequisitoDraft(
  draft: RequisitoFormDraft,
  existingRequisitos: ReadonlyArray<RequisitoLtree>,
  excludeId?: string
): CatalogSimpleValidationResult<{
  id_norma: string;
  id_requisito_padre: string | null;
  codigo: string;
  explicit_code: boolean;
  es_obligatorio: boolean;
  obligatorio_origen: ObligatorioOrigen;
  ruta_materializada: string;
  title_es: string;
  content_html_es: string;
  title_en: string;
  content_html_en: string;
}> {
  const idNorma = (draft.id_norma || '').trim();
  if (!idNorma) {
    return {
      valid: false,
      error: 'Debe seleccionar la Norma ISO a la que pertenece el requisito.',
    };
  }
  if (!isValidUuid(idNorma)) {
    return {
      valid: false,
      error: 'La Norma ISO seleccionada no tiene un identificador válido.',
    };
  }

  const codigo = (draft.codigo || '').replace(/\s+/g, ' ').trim();
  if (!codigo) {
    return {
      valid: false,
      error: 'El código de la cláusula / requisito es obligatorio (ej. 4.1, 8.5.1).',
    };
  }
  if (codigo.length > REQUISITO_CODIGO_MAX_LENGTH) {
    return {
      valid: false,
      error: `El código de requisito no puede exceder los ${REQUISITO_CODIGO_MAX_LENGTH} caracteres.`,
    };
  }
  if (!/^[A-Za-z0-9]+(?:[.\-][A-Za-z0-9]+)*$/.test(codigo)) {
    return {
      valid: false,
      error: 'El código debe usar numeración normativa válida (ej. 4, 4.1, 8.5.1 o A.5.1).',
    };
  }

  const codigoLower = codigo.toLowerCase();
  const duplicate = existingRequisitos.some(
    (req) =>
      !req.deleted_at &&
      (!excludeId || req.id !== excludeId) &&
      req.id_norma === idNorma &&
      req.codigo.trim().toLowerCase() === codigoLower
  );
  if (duplicate) {
    return {
      valid: false,
      error: `Ya existe una cláusula activa con el código "${codigo}" dentro de la norma seleccionada.`,
    };
  }

  const rawParentId = (draft.id_requisito_padre || '').trim();
  let parentReq: RequisitoLtree | null = null;
  if (rawParentId) {
    if (!isValidUuid(rawParentId)) {
      return {
        valid: false,
        error: 'La cláusula padre seleccionada no tiene un identificador válido.',
      };
    }
    const validParents = filterValidParentRequisitos(
      existingRequisitos,
      idNorma,
      excludeId
    );
    const matchedParent = validParents.find((p) => p.id === rawParentId);
    if (!matchedParent) {
      return {
        valid: false,
        error: 'La cláusula padre seleccionada no es válida o generaría un ciclo jerárquico en el árbol LTREE.',
      };
    }
    parentReq = matchedParent;
  }

  const rutaMaterializada = computeRequisitoLtreePath(codigo, parentReq);
  if (!rutaMaterializada) {
    return {
      valid: false,
      error: 'No se pudo calcular una ruta LTREE válida para el código indicado.',
    };
  }

  const titleEs = (draft.title_es || '').replace(/\s+/g, ' ').trim();
  if (titleEs.length > REQUISITO_TITLE_MAX_LENGTH) {
    return {
      valid: false,
      error: `El título en español no puede exceder los ${REQUISITO_TITLE_MAX_LENGTH} caracteres.`,
    };
  }

  const titleEn = (draft.title_en || '').replace(/\s+/g, ' ').trim();
  if (titleEn.length > REQUISITO_TITLE_MAX_LENGTH) {
    return {
      valid: false,
      error: `El título en inglés no puede exceder los ${REQUISITO_TITLE_MAX_LENGTH} caracteres.`,
    };
  }

  const contentHtmlEs = sanitizeClauseHtml(draft.content_html_es || '').trim();
  const contentHtmlEn = sanitizeClauseHtml(draft.content_html_en || '').trim();

  const existingEntity = excludeId
    ? existingRequisitos.find((req) => req.id === excludeId && !req.deleted_at)
    : undefined;
  const resolvedEsObligatorio =
    typeof draft.es_obligatorio === 'boolean'
      ? draft.es_obligatorio
      : existingEntity?.es_obligatorio ?? true;
  let resolvedObligatorioOrigen: ObligatorioOrigen;
  if (existingEntity) {
    const previousObligatorio = existingEntity.es_obligatorio ?? true;
    if (
      typeof draft.es_obligatorio === 'boolean' &&
      draft.es_obligatorio !== previousObligatorio
    ) {
      resolvedObligatorioOrigen = 'MANUAL';
    } else if (
      draft.obligatorio_origen &&
      VALID_OBLIGATORIO_ORIGEN_VALUES.includes(draft.obligatorio_origen)
    ) {
      resolvedObligatorioOrigen = draft.obligatorio_origen;
    } else {
      resolvedObligatorioOrigen = existingEntity.obligatorio_origen ?? 'AUTO_TEXT';
    }
  } else if (
    draft.obligatorio_origen &&
    VALID_OBLIGATORIO_ORIGEN_VALUES.includes(draft.obligatorio_origen)
  ) {
    resolvedObligatorioOrigen = draft.obligatorio_origen;
  } else {
    resolvedObligatorioOrigen = typeof draft.es_obligatorio === 'boolean' ? 'MANUAL' : 'AUTO_TEXT';
  }

  return {
    valid: true,
    normalized: {
      id_norma: idNorma,
      id_requisito_padre: parentReq ? parentReq.id : null,
      codigo,
      explicit_code: Boolean(draft.explicit_code),
      es_obligatorio: resolvedEsObligatorio,
      obligatorio_origen: resolvedObligatorioOrigen,
      ruta_materializada: rutaMaterializada,
      title_es: titleEs,
      content_html_es: contentHtmlEs,
      title_en: titleEn,
      content_html_en: contentHtmlEn,
    },
  };
}



