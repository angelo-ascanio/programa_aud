import { parseCsvRecords } from './requisitoCsvImporter';
import { isValidUuid } from './zeroUuid';

export type DbTableGroup = 'Catálogos Base' | 'Certificación' | 'Auditoría' | 'Sistema';

export interface DbTableFkRef {
  column: string;
  targetTable: string;
  /** Friendly CSV column aliases that can carry lookup values instead of placing them directly in `column` */
  aliasColumns?: readonly string[];
  /** Natural lookup column sets on `targetTable` (tried in order when resolving a non-UUID value) */
  targetLookupKeys: ReadonlyArray<readonly string[]>;
  optional?: boolean;
  /** True when the FK references the same table (e.g. `requisito.id_requisito_padre`) */
  selfReferential?: boolean;
}

export interface DbTableDefinition {
  name: string;
  labelEs: string;
  groupEs: DbTableGroup;
  pkColumns: readonly string[];
  autoUuidPk: boolean;
  hasSoftDelete: boolean;
  csvImportSupported: boolean;
  requiredColumns: readonly string[];
  /** Candidate natural/business key column tuples used to detect existing DB records */
  naturalKeys: ReadonlyArray<readonly string[]>;
  fkRefs: readonly DbTableFkRef[];
  booleanColumns?: readonly string[];
  numberColumns?: readonly string[];
  jsonColumns?: readonly string[];
  ltreeColumns?: readonly string[];
  sampleColumns: readonly string[];
  sampleRow: Record<string, string>;
}

/**
 * Exact FK-safe topological order (parents before children) covering all 64 `public` tables.
 */
export const DB_TABLES_TOPO_ORDER: readonly string[] = [
  'audit_log',
  'auditor',
  'configuracion_alerta_auditoria',
  'estatus',
  'experto_tecnico',
  'grupo_empresarial',
  'metodologia_auditoria',
  'norma',
  'organismo_acreditacion',
  'profiles',
  'sector_iaf',
  'turno',
  'acreditacion_norma',
  'email_experto_tecnico',
  'norma_auditor',
  'organizacion',
  'requisito',
  'sector_iaf_auditor',
  'sector_iaf_experto',
  'subsector_iaf',
  'telefono_experto_tecnico',
  'tipo_auditoria',
  'vinculo',
  'acreditacion_norma_sector_iaf',
  'certificado',
  'client_organization_access',
  'organizacion_version',
  'programa_auditoria',
  'requisito_traduccion',
  'subsector_iaf_auditor',
  'subsector_iaf_experto',
  'alcance',
  'certificado_version',
  'vinculo_certificado',
  'alcance_certificado_compartido',
  'contacto_certificado',
  'fecha_certificado',
  'proceso',
  'requisitos_no_aplicables_certificado',
  'sitio',
  'turno_certificado_compartido',
  'contacto_certificado_compartido',
  'email_contacto_certificado',
  'proceso_certificado_compartido',
  'procesos_por_sitio',
  'requisitos_por_proceso',
  'sitio_certificado_compartido',
  'telefono_contacto_certificado',
  'turnos_por_sitio',
  'auditoria',
  'auditoria_fecha',
  'auditoria_sitio_temporal',
  'comentarios_por_auditoria',
  'equipo_auditor',
  'experto_tecnico_auditoria',
  'hallazgo',
  'sitios_por_auditoria',
  'auditoria_sitio_temporal_certificado',
  'equipo_auditor_sitio',
  'equipo_auditor_sitio_temporal',
  'procesos_sitio_auditoria',
  'turnos_sitio_auditoria',
  'equipo_auditor_proceso_sitio',
  'turnos_proceso_sitio_auditoria',
];

const ALL_DEFINITIONS: readonly DbTableDefinition[] = [
  {
    name: 'audit_log',
    labelEs: 'Historial forense de auditoría',
    groupEs: 'Sistema',
    pkColumns: ['id'],
    autoUuidPk: false,
    hasSoftDelete: false,
    csvImportSupported: false,
    requiredColumns: ['table_name', 'operation', 'record_id'],
    naturalKeys: [],
    fkRefs: [],
    jsonColumns: ['old_data', 'new_data'],
    sampleColumns: ['table_name', 'operation', 'record_id'],
    sampleRow: { table_name: 'organizacion', operation: 'INSERT', record_id: '1' },
  },
  {
    name: 'profiles',
    labelEs: 'Perfiles y roles de usuario',
    groupEs: 'Sistema',
    pkColumns: ['id'],
    autoUuidPk: false,
    hasSoftDelete: false,
    csvImportSupported: false,
    requiredColumns: ['id', 'nombre', 'role', 'status'],
    naturalKeys: [['nombre']],
    fkRefs: [],
    sampleColumns: ['id', 'nombre', 'role', 'status'],
    sampleRow: { id: '1', nombre: 'Usuario Ejemplo', role: 'CLIENT', status: 'PENDING' },
  },
  {
    name: 'configuracion_alerta_auditoria',
    labelEs: 'Configuración de alertas',
    groupEs: 'Sistema',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['clave'],
    naturalKeys: [['clave']],
    fkRefs: [],
    booleanColumns: ['alertar_atrasadas', 'alertar_conflicto_auditor', 'alertar_desfase_dias_o_span', 'alertas_activas'],
    numberColumns: [
      'dias_aviso_proxima',
      'dias_aviso_preprogramada_sin_confirmar',
      'ciclos_rotacion_auditor_lider',
      'dias_limite_plan_accion',
      'dias_limite_plan_nc',
      'dias_limite_cierre_nc',
    ],
    sampleColumns: ['id', 'clave', 'dias_aviso_proxima', 'dias_limite_plan_nc', 'dias_limite_cierre_nc'],
    sampleRow: {
      id: '1',
      clave: 'CUSTOM_RULE',
      dias_aviso_proxima: '30',
      dias_limite_plan_nc: '15',
      dias_limite_cierre_nc: '60',
    },
  },
  {
    name: 'estatus',
    labelEs: 'Estatus canónicos',
    groupEs: 'Catálogos Base',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['estatus'],
    naturalKeys: [['estatus']],
    fkRefs: [],
    sampleColumns: ['id', 'estatus'],
    sampleRow: { id: '1', estatus: 'Activo' },
  },
  {
    name: 'norma',
    labelEs: 'Normas ISO / esquemas',
    groupEs: 'Catálogos Base',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['esquema', 'codigo', 'titulo', 'norma'],
    naturalKeys: [['codigo'], ['norma']],
    fkRefs: [],
    sampleColumns: ['id', 'esquema', 'codigo', 'norma', 'titulo', 'estatus', 'fecha_publicacion'],
    sampleRow: {
      id: '1',
      esquema: 'SGC - Calidad',
      codigo: 'ISO 9001:2015',
      norma: 'ISO 9001:2015',
      titulo: 'Sistemas de Gestión de la Calidad — Requisitos',
      estatus: 'Vigente',
      fecha_publicacion: '2015-09-15',
    },
  },
  {
    name: 'requisito',
    labelEs: 'Requisitos / cláusulas de norma',
    groupEs: 'Catálogos Base',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_norma', 'codigo'],
    naturalKeys: [['id_norma', 'codigo'], ['external_key']],
    fkRefs: [
      {
        column: 'id_norma',
        targetTable: 'norma',
        aliasColumns: ['norma_codigo', 'norma'],
        targetLookupKeys: [['codigo'], ['norma']],
      },
      {
        column: 'id_requisito_padre',
        targetTable: 'requisito',
        aliasColumns: ['requisito_padre_codigo', 'parent_ref'],
        targetLookupKeys: [['external_key'], ['codigo']],
        optional: true,
        selfReferential: true,
      },
    ],
    booleanColumns: ['explicit_code', 'es_obligatorio'],
    ltreeColumns: ['ruta_materializada'],
    sampleColumns: ['id', 'id_norma', 'id_requisito_padre', 'codigo', 'es_obligatorio'],
    sampleRow: {
      id: '1',
      id_norma: 'ISO 9001:2015',
      id_requisito_padre: '',
      codigo: '4.1',
      es_obligatorio: 'true',
    },
  },
  {
    name: 'requisito_traduccion',
    labelEs: 'Traducciones de requisitos',
    groupEs: 'Catálogos Base',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_requisito', 'lang'],
    naturalKeys: [['id_requisito', 'lang']],
    fkRefs: [
      {
        column: 'id_requisito',
        targetTable: 'requisito',
        aliasColumns: ['requisito_codigo', 'requisito_ref'],
        targetLookupKeys: [['external_key'], ['codigo']],
      },
    ],
    sampleColumns: ['id', 'id_requisito', 'lang', 'title', 'content_html'],
    sampleRow: {
      id: '1',
      id_requisito: '4.1',
      lang: 'es',
      title: 'Comprensión de la organización y de su contexto',
      content_html: '<p>La organización debe determinar las cuestiones externas e internas...</p>',
    },
  },
  {
    name: 'sector_iaf',
    labelEs: 'Sectores IAF',
    groupEs: 'Catálogos Base',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['sector', 'descripcion'],
    naturalKeys: [['sector']],
    fkRefs: [],
    numberColumns: ['sector'],
    sampleColumns: ['id', 'sector', 'descripcion'],
    sampleRow: { id: '1', sector: '17', descripcion: 'Metales básicos y productos metálicos fabricados' },
  },
  {
    name: 'subsector_iaf',
    labelEs: 'Subsectores IAF',
    groupEs: 'Catálogos Base',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_sector_iaf', 'codigo', 'descripcion'],
    naturalKeys: [['id_sector_iaf', 'codigo'], ['codigo']],
    fkRefs: [
      {
        column: 'id_sector_iaf',
        targetTable: 'sector_iaf',
        aliasColumns: ['sector_iaf', 'sector'],
        targetLookupKeys: [['sector'], ['descripcion']],
      },
    ],
    sampleColumns: ['id', 'id_sector_iaf', 'codigo', 'descripcion', 'categoria_riesgo'],
    sampleRow: {
      id: '1',
      id_sector_iaf: '17',
      codigo: '17.1',
      descripcion: 'Forja y estampado metálico',
      categoria_riesgo: 'ALTO',
    },
  },
  {
    name: 'organismo_acreditacion',
    labelEs: 'Organismos de acreditación',
    groupEs: 'Catálogos Base',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['codigo', 'nombre', 'pais'],
    naturalKeys: [['codigo'], ['nombre']],
    fkRefs: [],
    sampleColumns: ['id', 'codigo', 'nombre', 'pais', 'sitio_web'],
    sampleRow: {
      id: '1',
      codigo: 'SENCAMER',
      nombre: 'Servicio Desconcentrado de Normalización, Calidad, Metrología y Reglamentos Técnicos',
      pais: 'Venezuela',
      sitio_web: 'https://www.sencamer.gob.ve',
    },
  },
  {
    name: 'acreditacion_norma',
    labelEs: 'Acreditaciones por norma',
    groupEs: 'Catálogos Base',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_organismo', 'id_norma', 'id_estatus', 'numero_acreditacion', 'fecha_concesion'],
    naturalKeys: [['numero_acreditacion'], ['id_organismo', 'id_norma']],
    fkRefs: [
      {
        column: 'id_organismo',
        targetTable: 'organismo_acreditacion',
        aliasColumns: ['organismo_codigo', 'organismo_nombre'],
        targetLookupKeys: [['codigo'], ['nombre']],
      },
      {
        column: 'id_norma',
        targetTable: 'norma',
        aliasColumns: ['norma_codigo'],
        targetLookupKeys: [['codigo'], ['norma']],
      },
      {
        column: 'id_estatus',
        targetTable: 'estatus',
        aliasColumns: ['estatus'],
        targetLookupKeys: [['estatus']],
      },
    ],
    sampleColumns: ['id', 'id_organismo', 'id_norma', 'id_estatus', 'numero_acreditacion', 'fecha_concesion', 'fecha_vencimiento'],
    sampleRow: {
      id: '1',
      id_organismo: 'SENCAMER',
      id_norma: 'ISO 9001:2015',
      id_estatus: 'Activo',
      numero_acreditacion: 'ACR-2026-001',
      fecha_concesion: '2026-01-15',
      fecha_vencimiento: '2029-01-15',
    },
  },
  {
    name: 'acreditacion_norma_sector_iaf',
    labelEs: 'Sectores IAF por acreditación',
    groupEs: 'Catálogos Base',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_acreditacion_norma', 'id_sector_iaf'],
    naturalKeys: [['id_acreditacion_norma', 'id_sector_iaf']],
    fkRefs: [
      {
        column: 'id_acreditacion_norma',
        targetTable: 'acreditacion_norma',
        aliasColumns: ['numero_acreditacion'],
        targetLookupKeys: [['numero_acreditacion']],
      },
      {
        column: 'id_sector_iaf',
        targetTable: 'sector_iaf',
        aliasColumns: ['sector_iaf', 'sector'],
        targetLookupKeys: [['sector']],
      },
    ],
    sampleColumns: ['id', 'id_acreditacion_norma', 'id_sector_iaf'],
    sampleRow: { id: '1', id_acreditacion_norma: 'ACR-2026-001', id_sector_iaf: '17' },
  },
  {
    name: 'tipo_auditoria',
    labelEs: 'Tipos de auditoría',
    groupEs: 'Catálogos Base',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['tipo'],
    naturalKeys: [['tipo'], ['abreviacion']],
    fkRefs: [],
    sampleColumns: ['id', 'tipo', 'abreviacion'],
    sampleRow: { id: '1', tipo: 'Seguimiento 1', abreviacion: 'S1' },
  },
  {
    name: 'metodologia_auditoria',
    labelEs: 'Metodologías de auditoría',
    groupEs: 'Catálogos Base',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['metodologia'],
    naturalKeys: [['metodologia']],
    fkRefs: [],
    sampleColumns: ['id', 'metodologia'],
    sampleRow: { id: '1', metodologia: 'Presencial' },
  },
  {
    name: 'auditor',
    labelEs: 'Auditores',
    groupEs: 'Certificación',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['nombre'],
    naturalKeys: [['nombre']],
    fkRefs: [],
    sampleColumns: ['id', 'nombre'],
    sampleRow: { id: '1', nombre: 'Ing. María Pérez' },
  },
  {
    name: 'norma_auditor',
    labelEs: 'Competencia auditor × norma',
    groupEs: 'Certificación',
    pkColumns: ['id_auditor', 'id_norma'],
    autoUuidPk: false,
    hasSoftDelete: false,
    csvImportSupported: true,
    requiredColumns: ['id_auditor', 'id_norma'],
    naturalKeys: [['id_auditor', 'id_norma']],
    fkRefs: [
      { column: 'id_auditor', targetTable: 'auditor', aliasColumns: ['auditor_nombre'], targetLookupKeys: [['nombre']] },
      { column: 'id_norma', targetTable: 'norma', aliasColumns: ['norma_codigo'], targetLookupKeys: [['codigo'], ['norma']] },
    ],
    sampleColumns: ['id_auditor', 'id_norma'],
    sampleRow: { id_auditor: 'Ing. María Pérez', id_norma: 'ISO 9001:2015' },
  },
  {
    name: 'sector_iaf_auditor',
    labelEs: 'Competencia auditor × sector IAF',
    groupEs: 'Certificación',
    pkColumns: ['id_auditor', 'id_sector_iaf'],
    autoUuidPk: false,
    hasSoftDelete: false,
    csvImportSupported: true,
    requiredColumns: ['id_auditor', 'id_sector_iaf'],
    naturalKeys: [['id_auditor', 'id_sector_iaf']],
    fkRefs: [
      { column: 'id_auditor', targetTable: 'auditor', aliasColumns: ['auditor_nombre'], targetLookupKeys: [['nombre']] },
      { column: 'id_sector_iaf', targetTable: 'sector_iaf', aliasColumns: ['sector_iaf'], targetLookupKeys: [['sector']] },
    ],
    sampleColumns: ['id_auditor', 'id_sector_iaf'],
    sampleRow: { id_auditor: 'Ing. María Pérez', id_sector_iaf: '17' },
  },
  {
    name: 'subsector_iaf_auditor',
    labelEs: 'Competencia auditor × subsector IAF',
    groupEs: 'Certificación',
    pkColumns: ['id_auditor', 'id_subsector_iaf'],
    autoUuidPk: false,
    hasSoftDelete: false,
    csvImportSupported: true,
    requiredColumns: ['id_auditor', 'id_subsector_iaf'],
    naturalKeys: [['id_auditor', 'id_subsector_iaf']],
    fkRefs: [
      { column: 'id_auditor', targetTable: 'auditor', aliasColumns: ['auditor_nombre'], targetLookupKeys: [['nombre']] },
      { column: 'id_subsector_iaf', targetTable: 'subsector_iaf', aliasColumns: ['subsector_codigo'], targetLookupKeys: [['codigo']] },
    ],
    sampleColumns: ['id_auditor', 'id_subsector_iaf'],
    sampleRow: { id_auditor: 'Ing. María Pérez', id_subsector_iaf: '17.1' },
  },
  {
    name: 'experto_tecnico',
    labelEs: 'Expertos técnicos',
    groupEs: 'Certificación',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['nombre'],
    naturalKeys: [['nombre']],
    fkRefs: [],
    sampleColumns: ['id', 'nombre', 'estatus', 'notas'],
    sampleRow: { id: '1', nombre: 'Dr. Luis Navarro', estatus: 'Disponible', notas: 'Especialista metalúrgico' },
  },
  {
    name: 'telefono_experto_tecnico',
    labelEs: 'Teléfonos de expertos técnicos',
    groupEs: 'Certificación',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_experto_tecnico', 'telefono'],
    naturalKeys: [['id_experto_tecnico', 'telefono']],
    fkRefs: [
      {
        column: 'id_experto_tecnico',
        targetTable: 'experto_tecnico',
        aliasColumns: ['experto_nombre'],
        targetLookupKeys: [['nombre']],
      },
    ],
    sampleColumns: ['id', 'id_experto_tecnico', 'telefono', 'tipo_telefono'],
    sampleRow: { id: '1', id_experto_tecnico: 'Dr. Luis Navarro', telefono: '+58 412-5550199', tipo_telefono: 'Móvil' },
  },
  {
    name: 'email_experto_tecnico',
    labelEs: 'Correos de expertos técnicos',
    groupEs: 'Certificación',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_experto_tecnico', 'email'],
    naturalKeys: [['id_experto_tecnico', 'email']],
    fkRefs: [
      {
        column: 'id_experto_tecnico',
        targetTable: 'experto_tecnico',
        aliasColumns: ['experto_nombre'],
        targetLookupKeys: [['nombre']],
      },
    ],
    sampleColumns: ['id', 'id_experto_tecnico', 'email', 'tipo_email'],
    sampleRow: { id: '1', id_experto_tecnico: 'Dr. Luis Navarro', email: 'luis.navarro@ejemplo.com', tipo_email: 'Trabajo' },
  },
  {
    name: 'sector_iaf_experto',
    labelEs: 'Experto × sector IAF',
    groupEs: 'Certificación',
    pkColumns: ['id_experto_tecnico', 'id_sector_iaf'],
    autoUuidPk: false,
    hasSoftDelete: false,
    csvImportSupported: true,
    requiredColumns: ['id_experto_tecnico', 'id_sector_iaf'],
    naturalKeys: [['id_experto_tecnico', 'id_sector_iaf']],
    fkRefs: [
      { column: 'id_experto_tecnico', targetTable: 'experto_tecnico', aliasColumns: ['experto_nombre'], targetLookupKeys: [['nombre']] },
      { column: 'id_sector_iaf', targetTable: 'sector_iaf', aliasColumns: ['sector_iaf'], targetLookupKeys: [['sector']] },
    ],
    sampleColumns: ['id_experto_tecnico', 'id_sector_iaf'],
    sampleRow: { id_experto_tecnico: 'Dr. Luis Navarro', id_sector_iaf: '17' },
  },
  {
    name: 'subsector_iaf_experto',
    labelEs: 'Experto × subsector IAF',
    groupEs: 'Certificación',
    pkColumns: ['id_experto_tecnico', 'id_subsector_iaf'],
    autoUuidPk: false,
    hasSoftDelete: false,
    csvImportSupported: true,
    requiredColumns: ['id_experto_tecnico', 'id_subsector_iaf'],
    naturalKeys: [['id_experto_tecnico', 'id_subsector_iaf']],
    fkRefs: [
      { column: 'id_experto_tecnico', targetTable: 'experto_tecnico', aliasColumns: ['experto_nombre'], targetLookupKeys: [['nombre']] },
      { column: 'id_subsector_iaf', targetTable: 'subsector_iaf', aliasColumns: ['subsector_codigo'], targetLookupKeys: [['codigo']] },
    ],
    sampleColumns: ['id_experto_tecnico', 'id_subsector_iaf'],
    sampleRow: { id_experto_tecnico: 'Dr. Luis Navarro', id_subsector_iaf: '17.1' },
  },
  {
    name: 'grupo_empresarial',
    labelEs: 'Conglomerados / grupos empresariales',
    groupEs: 'Certificación',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['nombre'],
    naturalKeys: [['codigo_grupo'], ['abreviacion'], ['nombre']],
    fkRefs: [],
    booleanColumns: ['es_individual_auto'],
    sampleColumns: ['id', 'codigo_grupo', 'nombre', 'abreviacion', 'es_individual_auto', 'notas'],
    sampleRow: {
      id: '1',
      codigo_grupo: 'GRP-DEMO-01',
      nombre: 'Grupo Industrial Ejemplo C.A.',
      abreviacion: 'GIE',
      es_individual_auto: 'false',
      notas: 'Conglomerado importado por CSV',
    },
  },
  {
    name: 'organizacion',
    labelEs: 'Organizaciones clientes',
    groupEs: 'Certificación',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['nombre'],
    naturalKeys: [['rif'], ['abreviacion'], ['nombre']],
    fkRefs: [
      {
        column: 'id_grupo_empresarial',
        targetTable: 'grupo_empresarial',
        aliasColumns: ['grupo_empresarial_nombre', 'conglomerado_nombre', 'conglomerado'],
        targetLookupKeys: [['codigo_grupo'], ['abreviacion'], ['nombre']],
        optional: true,
      },
    ],
    sampleColumns: ['id', 'id_grupo_empresarial', 'nombre', 'abreviacion', 'rif', 'direccion_fiscal'],
    sampleRow: {
      id: '1',
      id_grupo_empresarial: '',
      nombre: 'Manufactura Andina S.A.',
      abreviacion: 'MANSA',
      rif: 'J-40112233-9',
      direccion_fiscal: 'Zona Industrial Norte, Parcela 14',
    },
  },
  {
    name: 'organizacion_version',
    labelEs: 'Versiones de organización',
    groupEs: 'Certificación',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_organizacion', 'version_numero', 'nombre', 'abreviacion'],
    naturalKeys: [['id_organizacion', 'version_numero']],
    fkRefs: [
      {
        column: 'id_organizacion',
        targetTable: 'organizacion',
        aliasColumns: ['organizacion_nombre', 'organizacion_abreviacion', 'organizacion_rif'],
        targetLookupKeys: [['rif'], ['abreviacion'], ['nombre']],
      },
    ],
    booleanColumns: ['es_version_actual'],
    numberColumns: ['version_numero'],
    sampleColumns: ['id', 'id_organizacion', 'version_numero', 'es_version_actual', 'nombre', 'abreviacion', 'rif'],
    sampleRow: {
      id: '1',
      id_organizacion: 'MANSA',
      version_numero: '2',
      es_version_actual: 'true',
      nombre: 'Manufactura Andina S.A.',
      abreviacion: 'MANSA',
      rif: 'J-40112233-9',
    },
  },
  {
    name: 'client_organization_access',
    labelEs: 'Accesos de clientes a organizaciones',
    groupEs: 'Sistema',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_usuario', 'id_organizacion'],
    naturalKeys: [['id_usuario', 'id_organizacion']],
    fkRefs: [
      { column: 'id_usuario', targetTable: 'profiles', aliasColumns: ['usuario_nombre'], targetLookupKeys: [['nombre']] },
      { column: 'id_organizacion', targetTable: 'organizacion', aliasColumns: ['organizacion_nombre'], targetLookupKeys: [['rif'], ['abreviacion'], ['nombre']] },
      { column: 'aprobado_por', targetTable: 'profiles', targetLookupKeys: [['nombre']], optional: true },
    ],
    sampleColumns: ['id', 'id_usuario', 'id_organizacion', 'estado'],
    sampleRow: { id: '1', id_usuario: 'Cliente Empresa Iberometal', id_organizacion: 'MANSA', estado: 'APPROVED' },
  },
  {
    name: 'certificado',
    labelEs: 'Certificados',
    groupEs: 'Certificación',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_norma', 'id_estatus', 'id_sector_iaf', 'id_subsector_iaf', 'id_organizacion', 'numero_certificado'],
    naturalKeys: [['numero_certificado']],
    fkRefs: [
      { column: 'id_norma', targetTable: 'norma', aliasColumns: ['norma_codigo'], targetLookupKeys: [['codigo'], ['norma']] },
      { column: 'id_estatus', targetTable: 'estatus', aliasColumns: ['estatus'], targetLookupKeys: [['estatus']] },
      { column: 'id_sector_iaf', targetTable: 'sector_iaf', aliasColumns: ['sector_iaf'], targetLookupKeys: [['sector']] },
      { column: 'id_subsector_iaf', targetTable: 'subsector_iaf', aliasColumns: ['subsector_codigo'], targetLookupKeys: [['codigo']] },
      { column: 'id_organizacion', targetTable: 'organizacion', aliasColumns: ['organizacion_nombre', 'organizacion_abreviacion'], targetLookupKeys: [['rif'], ['abreviacion'], ['nombre']] },
    ],
    booleanColumns: ['multisitio'],
    sampleColumns: ['id', 'numero_certificado', 'id_organizacion', 'id_norma', 'id_estatus', 'id_sector_iaf', 'id_subsector_iaf', 'multisitio'],
    sampleRow: {
      id: '1',
      numero_certificado: 'FN-QMS-2026-900',
      id_organizacion: 'MANSA',
      id_norma: 'ISO 9001:2015',
      id_estatus: 'Activo',
      id_sector_iaf: '17',
      id_subsector_iaf: '17.1',
      multisitio: 'false',
    },
  },
  {
    name: 'certificado_version',
    labelEs: 'Versiones de certificado',
    groupEs: 'Certificación',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_certificado', 'version_numero', 'id_estatus', 'id_sector_iaf', 'id_subsector_iaf'],
    naturalKeys: [['id_certificado', 'version_numero']],
    fkRefs: [
      { column: 'id_certificado', targetTable: 'certificado', aliasColumns: ['numero_certificado'], targetLookupKeys: [['numero_certificado']] },
      { column: 'id_organizacion_version', targetTable: 'organizacion_version', targetLookupKeys: [['nombre'], ['abreviacion']], optional: true },
      { column: 'id_estatus', targetTable: 'estatus', aliasColumns: ['estatus'], targetLookupKeys: [['estatus']] },
      { column: 'id_sector_iaf', targetTable: 'sector_iaf', aliasColumns: ['sector_iaf'], targetLookupKeys: [['sector']] },
      { column: 'id_subsector_iaf', targetTable: 'subsector_iaf', aliasColumns: ['subsector_codigo'], targetLookupKeys: [['codigo']] },
    ],
    booleanColumns: ['es_version_actual', 'multisitio'],
    numberColumns: ['version_numero'],
    sampleColumns: ['id', 'id_certificado', 'version_numero', 'es_version_actual', 'id_estatus', 'id_sector_iaf', 'id_subsector_iaf', 'multisitio'],
    sampleRow: {
      id: '1',
      id_certificado: 'FN-QMS-2026-900',
      version_numero: '2',
      es_version_actual: 'true',
      id_estatus: 'Activo',
      id_sector_iaf: '17',
      id_subsector_iaf: '17.1',
      multisitio: 'true',
    },
  },
  {
    name: 'alcance',
    labelEs: 'Alcances de certificado',
    groupEs: 'Certificación',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_certificado', 'alcance_es'],
    naturalKeys: [['id_certificado', 'alcance_es']],
    fkRefs: [
      { column: 'id_certificado', targetTable: 'certificado', aliasColumns: ['numero_certificado'], targetLookupKeys: [['numero_certificado']] },
    ],
    sampleColumns: ['id', 'id_certificado', 'alcance_es', 'alcance_en'],
    sampleRow: {
      id: '1',
      id_certificado: 'FN-QMS-2026-900',
      alcance_es: 'Fabricación y comercialización de piezas metálicas.',
      alcance_en: 'Manufacturing and commercialization of metal parts.',
    },
  },
  {
    name: 'alcance_certificado_compartido',
    labelEs: 'Alcances compartidos entre certificados',
    groupEs: 'Certificación',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_alcance', 'id_certificado'],
    naturalKeys: [['id_alcance', 'id_certificado']],
    fkRefs: [
      { column: 'id_alcance', targetTable: 'alcance', targetLookupKeys: [['alcance_es']] },
      { column: 'id_certificado', targetTable: 'certificado', aliasColumns: ['numero_certificado'], targetLookupKeys: [['numero_certificado']] },
    ],
    sampleColumns: ['id', 'id_alcance', 'id_certificado'],
    sampleRow: { id: '1', id_alcance: 'Fabricación y comercialización de piezas metálicas.', id_certificado: 'FN-QMS-2026-900' },
  },
  {
    name: 'fecha_certificado',
    labelEs: 'Fechas de certificado',
    groupEs: 'Certificación',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_certificado', 'fecha', 'tipo_fecha'],
    naturalKeys: [['id_certificado_version', 'tipo_fecha', 'fecha']],
    fkRefs: [
      { column: 'id_certificado', targetTable: 'certificado', aliasColumns: ['numero_certificado'], targetLookupKeys: [['numero_certificado']] },
      { column: 'id_certificado_version', targetTable: 'certificado_version', targetLookupKeys: [], optional: true },
    ],
    sampleColumns: ['id', 'id_certificado', 'fecha', 'tipo_fecha'],
    sampleRow: { id: '1', id_certificado: 'FN-QMS-2026-900', fecha: '2026-03-01', tipo_fecha: 'Otorgamiento' },
  },
  {
    name: 'contacto_certificado',
    labelEs: 'Contactos de certificado',
    groupEs: 'Certificación',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_certificado', 'nombre'],
    naturalKeys: [['id_certificado_version', 'nombre']],
    fkRefs: [
      { column: 'id_certificado', targetTable: 'certificado', aliasColumns: ['numero_certificado'], targetLookupKeys: [['numero_certificado']] },
      { column: 'id_certificado_version', targetTable: 'certificado_version', targetLookupKeys: [], optional: true },
    ],
    sampleColumns: ['id', 'id_certificado', 'nombre', 'cargo'],
    sampleRow: { id: '1', id_certificado: 'FN-QMS-2026-900', nombre: 'Ana Morales', cargo: 'Gerente de Calidad' },
  },
  {
    name: 'telefono_contacto_certificado',
    labelEs: 'Teléfonos de contactos',
    groupEs: 'Certificación',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_contacto', 'telefono'],
    naturalKeys: [['id_contacto', 'telefono']],
    fkRefs: [
      { column: 'id_contacto', targetTable: 'contacto_certificado', aliasColumns: ['contacto_nombre'], targetLookupKeys: [['nombre']] },
    ],
    sampleColumns: ['id', 'id_contacto', 'telefono', 'tipo_telefono'],
    sampleRow: { id: '1', id_contacto: 'Ana Morales', telefono: '+58 241-5550100', tipo_telefono: 'Oficina' },
  },
  {
    name: 'email_contacto_certificado',
    labelEs: 'Correos de contactos',
    groupEs: 'Certificación',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_contacto', 'email'],
    naturalKeys: [['id_contacto', 'email']],
    fkRefs: [
      { column: 'id_contacto', targetTable: 'contacto_certificado', aliasColumns: ['contacto_nombre'], targetLookupKeys: [['nombre']] },
    ],
    sampleColumns: ['id', 'id_contacto', 'email', 'tipo_email'],
    sampleRow: { id: '1', id_contacto: 'Ana Morales', email: 'ana.morales@ejemplo.com', tipo_email: 'Trabajo' },
  },
  {
    name: 'contacto_certificado_compartido',
    labelEs: 'Contactos compartidos',
    groupEs: 'Certificación',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_contacto', 'id_certificado'],
    naturalKeys: [['id_contacto', 'id_certificado_version']],
    fkRefs: [
      { column: 'id_contacto', targetTable: 'contacto_certificado', aliasColumns: ['contacto_nombre'], targetLookupKeys: [['nombre']] },
      { column: 'id_certificado', targetTable: 'certificado', aliasColumns: ['numero_certificado'], targetLookupKeys: [['numero_certificado']] },
      { column: 'id_certificado_version', targetTable: 'certificado_version', targetLookupKeys: [], optional: true },
    ],
    sampleColumns: ['id', 'id_contacto', 'id_certificado'],
    sampleRow: { id: '1', id_contacto: 'Ana Morales', id_certificado: 'FN-QMS-2026-900' },
  },
  {
    name: 'sitio',
    labelEs: 'Sitios de certificado',
    groupEs: 'Certificación',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_certificado', 'numero_sitio', 'nombre_sitio', 'direccion_sitio'],
    naturalKeys: [['id_certificado_version', 'numero_sitio'], ['id_certificado_version', 'nombre_sitio']],
    fkRefs: [
      { column: 'id_certificado', targetTable: 'certificado', aliasColumns: ['numero_certificado'], targetLookupKeys: [['numero_certificado']] },
      { column: 'id_certificado_version', targetTable: 'certificado_version', targetLookupKeys: [], optional: true },
    ],
    numberColumns: ['numero_sitio', 'personal_count'],
    sampleColumns: ['id', 'id_certificado', 'numero_sitio', 'nombre_sitio', 'direccion_sitio', 'personal_count'],
    sampleRow: {
      id: '1',
      id_certificado: 'FN-QMS-2026-900',
      numero_sitio: '0',
      nombre_sitio: 'Sede Principal',
      direccion_sitio: 'Zona Industrial Norte, Parcela 14',
      personal_count: '45',
    },
  },
  {
    name: 'sitio_certificado_compartido',
    labelEs: 'Sitios compartidos',
    groupEs: 'Certificación',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_sitio', 'id_certificado', 'numero_sitio'],
    naturalKeys: [['id_sitio', 'id_certificado_version'], ['id_certificado_version', 'numero_sitio']],
    fkRefs: [
      { column: 'id_sitio', targetTable: 'sitio', aliasColumns: ['nombre_sitio'], targetLookupKeys: [['nombre_sitio']] },
      { column: 'id_certificado', targetTable: 'certificado', aliasColumns: ['numero_certificado'], targetLookupKeys: [['numero_certificado']] },
      { column: 'id_certificado_version', targetTable: 'certificado_version', targetLookupKeys: [], optional: true },
    ],
    numberColumns: ['numero_sitio'],
    sampleColumns: ['id', 'id_sitio', 'id_certificado', 'numero_sitio'],
    sampleRow: { id: '1', id_sitio: 'Sede Principal', id_certificado: 'FN-QMS-2026-900', numero_sitio: '1' },
  },
  {
    name: 'proceso',
    labelEs: 'Procesos de certificado',
    groupEs: 'Certificación',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_certificado', 'nombre_proceso'],
    naturalKeys: [['id_certificado_version', 'nombre_proceso']],
    fkRefs: [
      { column: 'id_certificado', targetTable: 'certificado', aliasColumns: ['numero_certificado'], targetLookupKeys: [['numero_certificado']] },
      { column: 'id_certificado_version', targetTable: 'certificado_version', targetLookupKeys: [], optional: true },
    ],
    sampleColumns: ['id', 'id_certificado', 'nombre_proceso', 'tipo'],
    sampleRow: { id: '1', id_certificado: 'FN-QMS-2026-900', nombre_proceso: 'Producción Metálica', tipo: 'Medular' },
  },
  {
    name: 'requisitos_por_proceso',
    labelEs: 'Requisitos por proceso',
    groupEs: 'Certificación',
    pkColumns: ['id_proceso', 'id_certificado_version', 'id_requisito'],
    autoUuidPk: false,
    hasSoftDelete: false,
    csvImportSupported: true,
    requiredColumns: ['id_proceso', 'id_certificado', 'id_requisito'],
    naturalKeys: [['id_proceso', 'id_certificado_version', 'id_requisito']],
    fkRefs: [
      { column: 'id_proceso', targetTable: 'proceso', aliasColumns: ['nombre_proceso'], targetLookupKeys: [['nombre_proceso']] },
      { column: 'id_certificado', targetTable: 'certificado', aliasColumns: ['numero_certificado'], targetLookupKeys: [['numero_certificado']] },
      { column: 'id_certificado_version', targetTable: 'certificado_version', targetLookupKeys: [], optional: true },
      { column: 'id_requisito', targetTable: 'requisito', aliasColumns: ['requisito_codigo'], targetLookupKeys: [['external_key'], ['codigo']] },
    ],
    sampleColumns: ['id_proceso', 'id_certificado', 'id_requisito'],
    sampleRow: { id_proceso: 'Producción Metálica', id_certificado: 'FN-QMS-2026-900', id_requisito: '8.5' },
  },
  {
    name: 'proceso_certificado_compartido',
    labelEs: 'Procesos compartidos',
    groupEs: 'Certificación',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_proceso', 'id_certificado'],
    naturalKeys: [['id_proceso', 'id_certificado_version']],
    fkRefs: [
      { column: 'id_proceso', targetTable: 'proceso', aliasColumns: ['nombre_proceso'], targetLookupKeys: [['nombre_proceso']] },
      { column: 'id_certificado', targetTable: 'certificado', aliasColumns: ['numero_certificado'], targetLookupKeys: [['numero_certificado']] },
      { column: 'id_certificado_version', targetTable: 'certificado_version', targetLookupKeys: [], optional: true },
    ],
    booleanColumns: ['sincronizar_requisitos'],
    sampleColumns: ['id', 'id_proceso', 'id_certificado', 'sincronizar_requisitos'],
    sampleRow: { id: '1', id_proceso: 'Producción Metálica', id_certificado: 'FN-QMS-2026-900', sincronizar_requisitos: 'false' },
  },
  {
    name: 'requisitos_no_aplicables_certificado',
    labelEs: 'Requisitos no aplicables por certificado',
    groupEs: 'Certificación',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_certificado', 'id_requisito'],
    naturalKeys: [['id_certificado_version', 'id_requisito']],
    fkRefs: [
      { column: 'id_certificado', targetTable: 'certificado', aliasColumns: ['numero_certificado'], targetLookupKeys: [['numero_certificado']] },
      { column: 'id_certificado_version', targetTable: 'certificado_version', targetLookupKeys: [], optional: true },
      { column: 'id_requisito', targetTable: 'requisito', aliasColumns: ['requisito_codigo'], targetLookupKeys: [['external_key'], ['codigo']] },
    ],
    sampleColumns: ['id', 'id_certificado', 'id_requisito', 'justificacion'],
    sampleRow: {
      id: '1',
      id_certificado: 'FN-QMS-2026-900',
      id_requisito: '8.3',
      justificacion: 'La organización fabrica bajo planos del cliente.',
    },
  },
  {
    name: 'turno',
    labelEs: 'Turnos laborales',
    groupEs: 'Catálogos Base',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['hora_entrada', 'hora_salida'],
    naturalKeys: [['hora_entrada', 'hora_salida']],
    fkRefs: [],
    sampleColumns: ['id', 'hora_entrada', 'hora_salida'],
    sampleRow: { id: '1', hora_entrada: '07:00:00', hora_salida: '15:00:00' },
  },
  {
    name: 'turnos_por_sitio',
    labelEs: 'Turnos por sitio',
    groupEs: 'Certificación',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_sitio', 'id_turno'],
    naturalKeys: [['id_sitio', 'id_turno']],
    fkRefs: [
      { column: 'id_sitio', targetTable: 'sitio', aliasColumns: ['nombre_sitio'], targetLookupKeys: [['nombre_sitio']] },
      { column: 'id_turno', targetTable: 'turno', targetLookupKeys: [['hora_entrada', 'hora_salida']] },
    ],
    sampleColumns: ['id', 'id_sitio', 'id_turno'],
    sampleRow: { id: '1', id_sitio: 'Sede Principal', id_turno: '1' },
  },
  {
    name: 'turno_certificado_compartido',
    labelEs: 'Turnos compartidos',
    groupEs: 'Certificación',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_turno', 'id_certificado'],
    naturalKeys: [['id_turno', 'id_certificado_version']],
    fkRefs: [
      { column: 'id_turno', targetTable: 'turno', targetLookupKeys: [['hora_entrada', 'hora_salida']] },
      { column: 'id_certificado', targetTable: 'certificado', aliasColumns: ['numero_certificado'], targetLookupKeys: [['numero_certificado']] },
      { column: 'id_certificado_version', targetTable: 'certificado_version', targetLookupKeys: [], optional: true },
      { column: 'id_certificado_origen', targetTable: 'certificado', targetLookupKeys: [['numero_certificado']], optional: true },
    ],
    sampleColumns: ['id', 'id_turno', 'id_certificado'],
    sampleRow: { id: '1', id_turno: '1', id_certificado: 'FN-QMS-2026-900' },
  },
  {
    name: 'procesos_por_sitio',
    labelEs: 'Procesos por sitio',
    groupEs: 'Certificación',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_certificado', 'id_sitio', 'id_proceso'],
    naturalKeys: [['id_certificado_version', 'id_sitio', 'id_proceso']],
    fkRefs: [
      { column: 'id_certificado', targetTable: 'certificado', aliasColumns: ['numero_certificado'], targetLookupKeys: [['numero_certificado']] },
      { column: 'id_certificado_version', targetTable: 'certificado_version', targetLookupKeys: [], optional: true },
      { column: 'id_sitio', targetTable: 'sitio', aliasColumns: ['nombre_sitio'], targetLookupKeys: [['nombre_sitio']] },
      { column: 'id_proceso', targetTable: 'proceso', aliasColumns: ['nombre_proceso'], targetLookupKeys: [['nombre_proceso']] },
    ],
    sampleColumns: ['id', 'id_certificado', 'id_sitio', 'id_proceso'],
    sampleRow: { id: '1', id_certificado: 'FN-QMS-2026-900', id_sitio: 'Sede Principal', id_proceso: 'Producción Metálica' },
  },
  {
    name: 'vinculo',
    labelEs: 'Cajas de vínculo',
    groupEs: 'Certificación',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_grupo_empresarial', 'etiqueta'],
    naturalKeys: [['codigo_vinculo'], ['id_grupo_empresarial', 'etiqueta']],
    fkRefs: [
      {
        column: 'id_grupo_empresarial',
        targetTable: 'grupo_empresarial',
        aliasColumns: ['grupo_empresarial_nombre'],
        targetLookupKeys: [['codigo_grupo'], ['abreviacion'], ['nombre']],
      },
    ],
    booleanColumns: ['es_vinculada', 'tiene_sitio_temporal'],
    sampleColumns: ['id', 'id_grupo_empresarial', 'codigo_vinculo', 'etiqueta', 'nivel_vinculacion', 'tipo_vinculacion', 'es_vinculada'],
    sampleRow: {
      id: '1',
      id_grupo_empresarial: 'GIE',
      codigo_vinculo: 'VIN-2026-01',
      etiqueta: 'Vínculo Integrado Demo',
      nivel_vinculacion: 'INDIVIDUAL',
      tipo_vinculacion: 'Individual',
      es_vinculada: 'false',
    },
  },
  {
    name: 'vinculo_certificado',
    labelEs: 'Certificados en vínculo',
    groupEs: 'Certificación',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_vinculo', 'id_certificado'],
    naturalKeys: [['id_certificado'], ['id_vinculo', 'id_certificado']],
    fkRefs: [
      { column: 'id_vinculo', targetTable: 'vinculo', aliasColumns: ['codigo_vinculo'], targetLookupKeys: [['codigo_vinculo'], ['etiqueta']] },
      { column: 'id_certificado', targetTable: 'certificado', aliasColumns: ['numero_certificado'], targetLookupKeys: [['numero_certificado']] },
    ],
    sampleColumns: ['id', 'id_vinculo', 'id_certificado', 'tipo_vinculacion_override'],
    sampleRow: { id: '1', id_vinculo: 'VIN-2026-01', id_certificado: 'FN-QMS-2026-900', tipo_vinculacion_override: '' },
  },
  {
    name: 'programa_auditoria',
    labelEs: 'Programas de auditoría',
    groupEs: 'Auditoría',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['etiqueta'],
    naturalKeys: [['codigo_programa'], ['etiqueta']],
    fkRefs: [
      { column: 'id_vinculo', targetTable: 'vinculo', aliasColumns: ['codigo_vinculo'], targetLookupKeys: [['codigo_vinculo'], ['etiqueta']], optional: true },
      { column: 'id_grupo_empresarial', targetTable: 'grupo_empresarial', targetLookupKeys: [['codigo_grupo'], ['abreviacion'], ['nombre']], optional: true },
      { column: 'id_ciclo_origen', targetTable: 'programa_auditoria', targetLookupKeys: [['codigo_programa'], ['etiqueta']], optional: true, selfReferential: true },
    ],
    booleanColumns: ['es_vinculada', 'tiene_sitio_temporal'],
    sampleColumns: ['id', 'codigo_programa', 'etiqueta', 'nivel_vinculacion', 'tipo_vinculacion', 'es_vinculada'],
    sampleRow: {
      id: '1',
      codigo_programa: 'PRG-2026-099',
      etiqueta: 'Programa Demo QMS 2026',
      nivel_vinculacion: 'INDIVIDUAL',
      tipo_vinculacion: 'Individual',
      es_vinculada: 'false',
    },
  },
  {
    name: 'auditoria',
    labelEs: 'Auditorías',
    groupEs: 'Auditoría',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_programa_auditoria', 'id_certificado'],
    naturalKeys: [['codigo_auditoria'], ['id_programa_auditoria', 'id_certificado']],
    fkRefs: [
      { column: 'id_programa_auditoria', targetTable: 'programa_auditoria', aliasColumns: ['codigo_programa'], targetLookupKeys: [['codigo_programa'], ['etiqueta']] },
      { column: 'id_certificado', targetTable: 'certificado', aliasColumns: ['numero_certificado'], targetLookupKeys: [['numero_certificado']] },
      { column: 'id_certificado_version', targetTable: 'certificado_version', targetLookupKeys: [], optional: true },
      { column: 'id_tipo_auditoria', targetTable: 'tipo_auditoria', aliasColumns: ['tipo_auditoria'], targetLookupKeys: [['tipo'], ['abreviacion']], optional: true },
      { column: 'id_metodologia', targetTable: 'metodologia_auditoria', aliasColumns: ['metodologia'], targetLookupKeys: [['metodologia']], optional: true },
    ],
    booleanColumns: ['revisado', 'documentacion_completa', 'tiene_sitio_temporal'],
    numberColumns: ['tiempo_auditoria'],
    sampleColumns: ['id', 'id_programa_auditoria', 'codigo_auditoria', 'id_certificado', 'id_tipo_auditoria', 'id_metodologia', 'estado_ciclo'],
    sampleRow: {
      id: '1',
      id_programa_auditoria: 'PRG-2026-099',
      codigo_auditoria: 'AUD-0099-0001-2026',
      id_certificado: 'FN-QMS-2026-900',
      id_tipo_auditoria: 'Seguimiento 1',
      id_metodologia: 'Presencial',
      estado_ciclo: 'Borrador',
    },
  },
  {
    name: 'auditoria_fecha',
    labelEs: 'Fechas de auditoría',
    groupEs: 'Auditoría',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_auditoria', 'numero_secuencia', 'tipo_fecha'],
    naturalKeys: [['id_auditoria', 'numero_secuencia']],
    fkRefs: [
      { column: 'id_auditoria', targetTable: 'auditoria', aliasColumns: ['codigo_auditoria'], targetLookupKeys: [['codigo_auditoria']] },
    ],
    numberColumns: ['numero_secuencia', 'anio', 'mes'],
    sampleColumns: ['id', 'id_auditoria', 'numero_secuencia', 'tag', 'tipo_fecha', 'anio', 'mes'],
    sampleRow: {
      id: '1',
      id_auditoria: 'AUD-0099-0001-2026',
      numero_secuencia: '1',
      tag: 'Programación',
      tipo_fecha: 'PREPROGRAMADA_MES',
      anio: '2026',
      mes: '11',
    },
  },
  {
    name: 'comentarios_por_auditoria',
    labelEs: 'Comentarios de auditoría',
    groupEs: 'Auditoría',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_auditoria', 'comentario'],
    naturalKeys: [['id_auditoria', 'comentario']],
    fkRefs: [
      { column: 'id_auditoria', targetTable: 'auditoria', aliasColumns: ['codigo_auditoria'], targetLookupKeys: [['codigo_auditoria']] },
    ],
    sampleColumns: ['id', 'id_auditoria', 'comentario'],
    sampleRow: { id: '1', id_auditoria: 'AUD-0099-0001-2026', comentario: 'Observación inicial de programación.' },
  },
  {
    name: 'equipo_auditor',
    labelEs: 'Equipo auditor por auditoría',
    groupEs: 'Auditoría',
    pkColumns: ['id_auditoria', 'id_auditor'],
    autoUuidPk: false,
    hasSoftDelete: false,
    csvImportSupported: true,
    requiredColumns: ['id_auditoria', 'id_auditor'],
    naturalKeys: [['id_auditoria', 'id_auditor']],
    fkRefs: [
      { column: 'id_auditoria', targetTable: 'auditoria', aliasColumns: ['codigo_auditoria'], targetLookupKeys: [['codigo_auditoria']] },
      { column: 'id_auditor', targetTable: 'auditor', aliasColumns: ['auditor_nombre'], targetLookupKeys: [['nombre']] },
    ],
    sampleColumns: ['id_auditoria', 'id_auditor', 'rol_auditor'],
    sampleRow: { id_auditor: 'Ing. María Pérez', id_auditoria: 'AUD-0099-0001-2026', rol_auditor: 'AUDITOR_LIDER' },
  },
  {
    name: 'sitios_por_auditoria',
    labelEs: 'Sitios asignados a auditoría',
    groupEs: 'Auditoría',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_auditoria', 'id_sitio'],
    naturalKeys: [['id_auditoria', 'id_sitio']],
    fkRefs: [
      { column: 'id_auditoria', targetTable: 'auditoria', aliasColumns: ['codigo_auditoria'], targetLookupKeys: [['codigo_auditoria']] },
      { column: 'id_sitio', targetTable: 'sitio', aliasColumns: ['nombre_sitio'], targetLookupKeys: [['nombre_sitio']] },
    ],
    numberColumns: ['tiempo_auditoria'],
    sampleColumns: ['id', 'id_auditoria', 'id_sitio', 'tiempo_auditoria', 'modalidad_evaluacion'],
    sampleRow: { id: '1', id_auditoria: 'AUD-0099-0001-2026', id_sitio: 'Sede Principal', tiempo_auditoria: '1.5', modalidad_evaluacion: 'Presencial' },
  },
  {
    name: 'auditoria_sitio_temporal',
    labelEs: 'Sitios temporales de auditoría',
    groupEs: 'Auditoría',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_auditoria', 'etiqueta'],
    naturalKeys: [['id_auditoria', 'etiqueta']],
    fkRefs: [
      { column: 'id_auditoria', targetTable: 'auditoria', aliasColumns: ['codigo_auditoria'], targetLookupKeys: [['codigo_auditoria']] },
    ],
    numberColumns: ['tiempo_auditoria'],
    sampleColumns: ['id', 'id_auditoria', 'etiqueta', 'tiempo_auditoria'],
    sampleRow: { id: '1', id_auditoria: 'AUD-0099-0001-2026', etiqueta: 'Obra Norte', tiempo_auditoria: '0.5' },
  },
  {
    name: 'auditoria_sitio_temporal_certificado',
    labelEs: 'Certificados en sitio temporal',
    groupEs: 'Auditoría',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_sitio_temporal', 'id_auditoria_certificado'],
    naturalKeys: [['id_sitio_temporal', 'id_auditoria_certificado']],
    fkRefs: [
      { column: 'id_sitio_temporal', targetTable: 'auditoria_sitio_temporal', targetLookupKeys: [['etiqueta']] },
      { column: 'id_auditoria_certificado', targetTable: 'auditoria', targetLookupKeys: [['codigo_auditoria']] },
    ],
    sampleColumns: ['id', 'id_sitio_temporal', 'id_auditoria_certificado'],
    sampleRow: { id: '1', id_sitio_temporal: 'Obra Norte', id_auditoria_certificado: 'AUD-0099-0001-2026' },
  },
  {
    name: 'turnos_sitio_auditoria',
    labelEs: 'Turnos por sitio de auditoría',
    groupEs: 'Auditoría',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_sitios_por_auditoria', 'id_turnos_por_sitio'],
    naturalKeys: [['id_sitios_por_auditoria', 'id_turnos_por_sitio']],
    fkRefs: [
      { column: 'id_sitios_por_auditoria', targetTable: 'sitios_por_auditoria', targetLookupKeys: [] },
      { column: 'id_turnos_por_sitio', targetTable: 'turnos_por_sitio', targetLookupKeys: [] },
    ],
    sampleColumns: ['id', 'id_sitios_por_auditoria', 'id_turnos_por_sitio'],
    sampleRow: { id: '1', id_sitios_por_auditoria: '1', id_turnos_por_sitio: '1' },
  },
  {
    name: 'procesos_sitio_auditoria',
    labelEs: 'Procesos por sitio de auditoría',
    groupEs: 'Auditoría',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_sitios_por_auditoria', 'id_procesos_por_sitio', 'id_proceso'],
    naturalKeys: [['id_sitios_por_auditoria', 'id_procesos_por_sitio']],
    fkRefs: [
      { column: 'id_sitios_por_auditoria', targetTable: 'sitios_por_auditoria', targetLookupKeys: [] },
      { column: 'id_procesos_por_sitio', targetTable: 'procesos_por_sitio', targetLookupKeys: [] },
      { column: 'id_proceso', targetTable: 'proceso', aliasColumns: ['nombre_proceso'], targetLookupKeys: [['nombre_proceso']] },
    ],
    sampleColumns: ['id', 'id_sitios_por_auditoria', 'id_procesos_por_sitio', 'id_proceso', 'notas'],
    sampleRow: { id: '1', id_sitios_por_auditoria: '1', id_procesos_por_sitio: '1', id_proceso: 'Producción Metálica', notas: '' },
  },
  {
    name: 'turnos_proceso_sitio_auditoria',
    labelEs: 'Turnos por proceso en auditoría',
    groupEs: 'Auditoría',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_procesos_sitio_auditoria', 'id_turnos_sitio_auditoria'],
    naturalKeys: [['id_procesos_sitio_auditoria', 'id_turnos_sitio_auditoria']],
    fkRefs: [
      { column: 'id_procesos_sitio_auditoria', targetTable: 'procesos_sitio_auditoria', targetLookupKeys: [] },
      { column: 'id_turnos_sitio_auditoria', targetTable: 'turnos_sitio_auditoria', targetLookupKeys: [] },
    ],
    sampleColumns: ['id', 'id_procesos_sitio_auditoria', 'id_turnos_sitio_auditoria'],
    sampleRow: { id: '1', id_procesos_sitio_auditoria: '1', id_turnos_sitio_auditoria: '1' },
  },
  {
    name: 'equipo_auditor_sitio',
    labelEs: 'Auditores asignados a sitio',
    groupEs: 'Auditoría',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_sitios_por_auditoria', 'id_auditor'],
    naturalKeys: [['id_sitios_por_auditoria', 'id_auditor']],
    fkRefs: [
      { column: 'id_sitios_por_auditoria', targetTable: 'sitios_por_auditoria', targetLookupKeys: [] },
      { column: 'id_auditor', targetTable: 'auditor', aliasColumns: ['auditor_nombre'], targetLookupKeys: [['nombre']] },
    ],
    booleanColumns: ['asignacion_completa_sitio'],
    numberColumns: ['tiempo_auditoria'],
    sampleColumns: ['id', 'id_sitios_por_auditoria', 'id_auditor', 'rol_auditor', 'tiempo_auditoria'],
    sampleRow: { id: '1', id_sitios_por_auditoria: '1', id_auditor: 'Ing. María Pérez', rol_auditor: 'AUDITOR', tiempo_auditoria: '1.0' },
  },
  {
    name: 'equipo_auditor_sitio_temporal',
    labelEs: 'Auditores asignados a sitio temporal',
    groupEs: 'Auditoría',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_sitio_temporal', 'id_auditor'],
    naturalKeys: [['id_sitio_temporal', 'id_auditor']],
    fkRefs: [
      { column: 'id_sitio_temporal', targetTable: 'auditoria_sitio_temporal', targetLookupKeys: [['etiqueta']] },
      { column: 'id_auditor', targetTable: 'auditor', aliasColumns: ['auditor_nombre'], targetLookupKeys: [['nombre']] },
    ],
    numberColumns: ['tiempo_auditoria'],
    sampleColumns: ['id', 'id_sitio_temporal', 'id_auditor', 'rol_auditor', 'tiempo_auditoria'],
    sampleRow: { id: '1', id_sitio_temporal: 'Obra Norte', id_auditor: 'Ing. María Pérez', rol_auditor: 'AUDITOR', tiempo_auditoria: '0.5' },
  },
  {
    name: 'equipo_auditor_proceso_sitio',
    labelEs: 'Auditores asignados a proceso',
    groupEs: 'Auditoría',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_procesos_sitio_auditoria', 'id_auditor'],
    naturalKeys: [['id_procesos_sitio_auditoria', 'id_auditor']],
    fkRefs: [
      { column: 'id_procesos_sitio_auditoria', targetTable: 'procesos_sitio_auditoria', targetLookupKeys: [] },
      { column: 'id_auditor', targetTable: 'auditor', aliasColumns: ['auditor_nombre'], targetLookupKeys: [['nombre']] },
    ],
    sampleColumns: ['id', 'id_procesos_sitio_auditoria', 'id_auditor', 'rol_en_proceso'],
    sampleRow: { id: '1', id_procesos_sitio_auditoria: '1', id_auditor: 'Ing. María Pérez', rol_en_proceso: 'EVALUADOR' },
  },
  {
    name: 'experto_tecnico_auditoria',
    labelEs: 'Expertos técnicos por auditoría',
    groupEs: 'Auditoría',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_auditoria', 'id_experto_tecnico', 'dias_asignados'],
    naturalKeys: [['id_auditoria', 'id_experto_tecnico']],
    fkRefs: [
      { column: 'id_auditoria', targetTable: 'auditoria', aliasColumns: ['codigo_auditoria'], targetLookupKeys: [['codigo_auditoria']] },
      { column: 'id_experto_tecnico', targetTable: 'experto_tecnico', aliasColumns: ['experto_nombre'], targetLookupKeys: [['nombre']] },
    ],
    numberColumns: ['dias_asignados'],
    sampleColumns: ['id', 'id_auditoria', 'id_experto_tecnico', 'dias_asignados', 'observacion'],
    sampleRow: {
      id: '1',
      id_auditoria: 'AUD-0099-0001-2026',
      id_experto_tecnico: 'Dr. Luis Navarro',
      dias_asignados: '1.0',
      observacion: 'Acompañamiento técnico de proceso.',
    },
  },
  {
    name: 'hallazgo',
    labelEs: 'Hallazgos de auditoría',
    groupEs: 'Auditoría',
    pkColumns: ['id'],
    autoUuidPk: true,
    hasSoftDelete: true,
    csvImportSupported: true,
    requiredColumns: ['id_auditoria', 'id_requisito', 'tipo', 'descripcion'],
    naturalKeys: [['id_auditoria', 'id_requisito', 'tipo', 'descripcion']],
    fkRefs: [
      { column: 'id_auditoria', targetTable: 'auditoria', aliasColumns: ['codigo_auditoria'], targetLookupKeys: [['codigo_auditoria']] },
      { column: 'id_requisito', targetTable: 'requisito', aliasColumns: ['requisito_codigo'], targetLookupKeys: [['external_key'], ['codigo']] },
      { column: 'id_proceso', targetTable: 'proceso', aliasColumns: ['nombre_proceso'], targetLookupKeys: [['nombre_proceso']], optional: true },
      { column: 'id_sitio', targetTable: 'sitio', aliasColumns: ['nombre_sitio'], targetLookupKeys: [['nombre_sitio']], optional: true },
    ],
    booleanColumns: ['cerrado'],
    sampleColumns: ['id', 'id_auditoria', 'id_requisito', 'tipo', 'descripcion', 'evidencia', 'cerrado'],
    sampleRow: {
      id: '1',
      id_auditoria: 'AUD-0099-0001-2026',
      id_requisito: '8.5',
      tipo: 'OM',
      descripcion: 'Fortalecer el registro de calibración en línea de empaque.',
      evidencia: 'Registro REG-04 revisado.',
      cerrado: 'false',
    },
  },
];

const DEFINITION_BY_NAME = new Map<string, DbTableDefinition>(
  ALL_DEFINITIONS.map((def) => [def.name, def])
);

export const DB_TABLE_DEFINITIONS: readonly DbTableDefinition[] = DB_TABLES_TOPO_ORDER.map((name) => {
  const def = DEFINITION_BY_NAME.get(name);
  if (!def) {
    throw new Error(`Falta definición de metadatos para la tabla ${name}`);
  }
  return def;
});

export function getDbTableDefinition(tableName: string): DbTableDefinition | null {
  return DEFINITION_BY_NAME.get(tableName) ?? null;
}

export function isKnownPublicTable(tableName: string): boolean {
  return DEFINITION_BY_NAME.has(tableName);
}

/**
 * RFC-4180 CSV cell escaping. Converts Date/object values cleanly.
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text: string;
  if (value instanceof Date) {
    text = value.toISOString();
  } else if (typeof value === 'object') {
    text = JSON.stringify(value);
  } else {
    text = String(value);
  }

  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * Serializes rows to RFC-4180 CSV with UTF-8 BOM (`\uFEFF`) for clean Excel UTF-8 accent rendering.
 */
export function serializeRowsToCsv(
  columns: readonly string[],
  rows: ReadonlyArray<Record<string, unknown>>
): string {
  const effectiveCols =
    columns.length > 0
      ? columns
      : rows.length > 0
        ? Object.keys(rows[0])
        : [];
  const headerLine = effectiveCols.map((col) => escapeCsvCell(col)).join(',');
  const dataLines = rows.map((row) =>
    effectiveCols.map((col) => escapeCsvCell(row[col])).join(',')
  );
  return `\uFEFF${[headerLine, ...dataLines].join('\r\n')}\r\n`;
}

export interface ParsedCsvRowObject {
  lineNumber: number;
  values: Record<string, string>;
}

export interface ParsedCsvTable {
  headers: string[];
  rows: ParsedCsvRowObject[];
}

/**
 * Parses CSV text (including UTF-8 BOM & multiline quoted fields) into keyed row objects.
 */
export function parseCsvToObjects(csvText: string): ParsedCsvTable {
  const records = parseCsvRecords(csvText || '');
  if (records.length === 0) {
    return { headers: [], rows: [] };
  }
  const headers = records[0].map((col) => col.trim()).filter((col) => col.length > 0);
  const rawHeaders = records[0].map((col) => col.trim());
  const rows: ParsedCsvRowObject[] = [];

  for (let i = 1; i < records.length; i += 1) {
    const record = records[i];
    const hasAnyValue = record.some((cell) => cell.trim().length > 0);
    if (!hasAnyValue) continue;
    const values: Record<string, string> = {};
    for (let c = 0; c < rawHeaders.length; c += 1) {
      const colName = rawHeaders[c];
      if (!colName) continue;
      values[colName] = (record[c] ?? '').trim();
    }
    rows.push({
      lineNumber: i + 1,
      values,
    });
  }

  return { headers, rows };
}

export function buildSampleCsvForTable(tableName: string): string {
  const def = getDbTableDefinition(tableName);
  if (!def) {
    throw new Error(`Tabla no reconocida para plantilla CSV: ${tableName}`);
  }
  return serializeRowsToCsv(def.sampleColumns, [def.sampleRow]);
}

export interface DbBackupSchemaColumn {
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: string;
  column_default: string | null;
  ordinal_position: number;
}

export interface DbBackupSchemaConstraint {
  table_name: string;
  constraint_name: string;
  constraint_type: string;
  columns: string[];
  foreign_table_name?: string | null;
  foreign_columns?: string[] | null;
}

export interface DbBackupBundle {
  app: 'programa_aud';
  schema_version: string;
  exported_at: string;
  metadata: {
    table_count: number;
    total_rows: number;
    active_rows: number;
    archived_rows: number;
    sql_manifest: string[];
  };
  schema: {
    tables_order: string[];
    columns: DbBackupSchemaColumn[];
    constraints: DbBackupSchemaConstraint[];
  };
  data: Record<string, Array<Record<string, unknown>>>;
}

export interface BackupTableSummary {
  tableName: string;
  labelEs: string;
  totalRows: number;
  activeRows: number;
  archivedRows: number;
}

export interface BackupBundleSummary {
  exportedAt: string;
  schemaVersion: string;
  tableCount: number;
  nonEmptyTables: number;
  totalRows: number;
  activeRows: number;
  archivedRows: number;
  topTables: BackupTableSummary[];
}

export type BackupBundleValidationResult =
  | { ok: true; summary: BackupBundleSummary; bundle: DbBackupBundle }
  | { ok: false; error: string };

const UUID_CLEANUP_REGEX = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

export function sanitizeZeroUuidMessage(message: string): string {
  return message.replace(UUID_CLEANUP_REGEX, '[ref]').replace(/\s+/g, ' ').trim();
}

export function summarizeBackupBundle(raw: unknown): BackupBundleValidationResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      ok: false,
      error: 'El archivo de respaldo no contiene un objeto JSON válido.',
    };
  }

  const candidate = raw as Partial<DbBackupBundle>;
  if (candidate.app !== 'programa_aud') {
    return {
      ok: false,
      error: 'El archivo seleccionado no pertenece a un respaldo válido de este sistema.',
    };
  }

  if (!candidate.data || typeof candidate.data !== 'object' || Array.isArray(candidate.data)) {
    return {
      ok: false,
      error: 'El respaldo no incluye la sección de datos de tablas.',
    };
  }

  const tableSummaries: BackupTableSummary[] = [];
  let totalRows = 0;
  let activeRows = 0;
  let archivedRows = 0;
  let nonEmptyTables = 0;

  for (const tableName of DB_TABLES_TOPO_ORDER) {
    const def = getDbTableDefinition(tableName);
    const rows = (candidate.data as Record<string, unknown>)[tableName];
    if (rows !== undefined && !Array.isArray(rows)) {
      return {
        ok: false,
        error: `Formato inválido en los datos de la tabla "${def?.labelEs ?? tableName}".`,
      };
    }
    const rowList = (Array.isArray(rows) ? rows : []) as Array<Record<string, unknown>>;
    let tableArchived = 0;
    for (const r of rowList) {
      if (r && typeof r === 'object' && r.deleted_at !== null && r.deleted_at !== undefined && r.deleted_at !== '') {
        tableArchived += 1;
      }
    }
    const tableActive = rowList.length - tableArchived;
    totalRows += rowList.length;
    activeRows += tableActive;
    archivedRows += tableArchived;
    if (rowList.length > 0) {
      nonEmptyTables += 1;
      tableSummaries.push({
        tableName,
        labelEs: def?.labelEs ?? tableName,
        totalRows: rowList.length,
        activeRows: tableActive,
        archivedRows: tableArchived,
      });
    }
  }

  const unknownTables = Object.keys(candidate.data).filter((t) => !isKnownPublicTable(t));
  if (unknownTables.length > 0) {
    return {
      ok: false,
      error: `El respaldo contiene tablas no reconocidas (${unknownTables.slice(0, 3).join(', ')}).`,
    };
  }

  const normalizedBundle: DbBackupBundle = {
    app: 'programa_aud',
    schema_version: typeof candidate.schema_version === 'string' && candidate.schema_version ? candidate.schema_version : '1.0',
    exported_at: typeof candidate.exported_at === 'string' && candidate.exported_at ? candidate.exported_at : new Date().toISOString(),
    metadata: {
      table_count: DB_TABLES_TOPO_ORDER.length,
      total_rows: totalRows,
      active_rows: activeRows,
      archived_rows: archivedRows,
      sql_manifest: Array.isArray(candidate.metadata?.sql_manifest) ? candidate.metadata.sql_manifest : [],
    },
    schema: {
      tables_order: [...DB_TABLES_TOPO_ORDER],
      columns: Array.isArray(candidate.schema?.columns) ? candidate.schema.columns : [],
      constraints: Array.isArray(candidate.schema?.constraints) ? candidate.schema.constraints : [],
    },
    data: Object.fromEntries(
      DB_TABLES_TOPO_ORDER.map((tbl) => [
        tbl,
        Array.isArray((candidate.data as Record<string, unknown>)[tbl])
          ? ((candidate.data as Record<string, unknown>)[tbl] as Array<Record<string, unknown>>)
          : [],
      ])
    ),
  };

  tableSummaries.sort((a, b) => b.totalRows - a.totalRows);

  return {
    ok: true,
    summary: {
      exportedAt: normalizedBundle.exported_at,
      schemaVersion: normalizedBundle.schema_version,
      tableCount: DB_TABLES_TOPO_ORDER.length,
      nonEmptyTables,
      totalRows,
      activeRows,
      archivedRows,
      topTables: tableSummaries.slice(0, 8),
    },
    bundle: normalizedBundle,
  };
}

export type CsvImportRowAction = 'INSERT' | 'SKIP_EXISTING' | 'ERROR';

export interface CsvImportPreviewRow {
  lineNumber: number;
  action: CsvImportRowAction;
  displayLabel: string;
  detail: string;
}

export interface CsvImportPlannedInsert {
  lineNumber: number;
  record: Record<string, unknown>;
}

export interface CsvImportPlanResult {
  summary: {
    tableName: string;
    labelEs: string;
    totalRows: number;
    toInsert: number;
    toSkip: number;
    errors: number;
  };
  previewRows: CsvImportPreviewRow[];
  insertPayloads: CsvImportPlannedInsert[];
}

function normalizeLookupScalar(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim().toLowerCase();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim().toLowerCase();
  return JSON.stringify(value).trim().toLowerCase();
}

function makeNaturalKeySignature(columns: readonly string[], record: Record<string, unknown>): string | null {
  const parts: string[] = [];
  for (const col of columns) {
    const normalized = normalizeLookupScalar(record[col]);
    if (!normalized) return null;
    parts.push(`${col}=${normalized}`);
  }
  return parts.join('|');
}

function parseBooleanValue(raw: string): boolean | null {
  const norm = raw.trim().toLowerCase();
  if (!norm) return null;
  if (norm === 'true' || norm === '1' || norm === 'sí' || norm === 'si' || norm === 'yes') return true;
  if (norm === 'false' || norm === '0' || norm === 'no') return false;
  return null;
}

function generateRandomUuid(): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const hex = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  hex[6] = (hex[6] & 0x0f) | 0x40;
  hex[8] = (hex[8] & 0x3f) | 0x80;
  const chars = hex.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${chars.slice(0, 8)}-${chars.slice(8, 12)}-${chars.slice(12, 16)}-${chars.slice(16, 20)}-${chars.slice(20, 32)}`;
}

function buildCsvDisplayLabel(
  def: DbTableDefinition,
  rawValues: Record<string, string>,
  lineNumber: number
): string {
  const candidates = [
    rawValues.numero_certificado,
    rawValues.codigo_auditoria,
    rawValues.codigo_programa,
    rawValues.codigo_vinculo,
    rawValues.nombre,
    rawValues.nombre_sitio,
    rawValues.nombre_proceso,
    rawValues.codigo,
    rawValues.etiqueta,
    rawValues.tipo,
    rawValues.metodologia,
    rawValues.estatus,
    rawValues.clave,
    rawValues.sector,
    rawValues.email,
    rawValues.telefono,
    rawValues.local_id,
    rawValues.ref_id,
    rawValues.id,
  ];
  for (const item of candidates) {
    if (item && item.trim()) {
      const cleaned = sanitizeZeroUuidMessage(item.trim());
      if (cleaned && cleaned !== '[ref]') return cleaned.slice(0, 80);
    }
  }
  return `${def.labelEs} · Fila ${lineNumber}`;
}

function buildLookupIndex(
  rows: ReadonlyArray<Record<string, unknown>>,
  lookupKeySets: ReadonlyArray<readonly string[]>
): {
  byId: Map<string, Record<string, unknown>>;
  byKey: Map<string, Record<string, unknown>>;
} {
  const byId = new Map<string, Record<string, unknown>>();
  const byKey = new Map<string, Record<string, unknown>>();

  for (const row of rows) {
    if (row.deleted_at !== null && row.deleted_at !== undefined && row.deleted_at !== '') {
      continue;
    }
    if (typeof row.id === 'string' && row.id) {
      byId.set(row.id.toLowerCase(), row);
    }
    for (const keyCols of lookupKeySets) {
      const sig = makeNaturalKeySignature(keyCols, row);
      if (sig && !byKey.has(sig)) {
        byKey.set(sig, row);
      }
    }
  }

  return { byId, byKey };
}

function resolveCurrentVersionForCert(
  certId: string,
  certVersionRows: ReadonlyArray<Record<string, unknown>>
): string | null {
  const lower = certId.toLowerCase();
  const candidates = certVersionRows.filter(
    (cv) =>
      typeof cv.id_certificado === 'string' &&
      cv.id_certificado.toLowerCase() === lower &&
      (cv.deleted_at === null || cv.deleted_at === undefined || cv.deleted_at === '')
  );
  if (candidates.length === 0) return null;
  const active =
    candidates.find((cv) => cv.es_version_actual === true) ??
    candidates.slice().sort((a, b) => Number(b.version_numero ?? 0) - Number(a.version_numero ?? 0))[0];
  return typeof active?.id === 'string' ? active.id : null;
}

function resolveCurrentOrgVersionForCert(
  certId: string,
  certRows: ReadonlyArray<Record<string, unknown>>,
  orgVersionRows: ReadonlyArray<Record<string, unknown>>
): string | null {
  const lowerCert = certId.toLowerCase();
  const cert = certRows.find(
    (c) => typeof c.id === 'string' && c.id.toLowerCase() === lowerCert
  );
  const orgId = typeof cert?.id_organizacion === 'string' ? cert.id_organizacion.toLowerCase() : '';
  if (!orgId) return null;
  const candidates = orgVersionRows.filter(
    (ov) =>
      typeof ov.id_organizacion === 'string' &&
      ov.id_organizacion.toLowerCase() === orgId &&
      (ov.deleted_at === null || ov.deleted_at === undefined || ov.deleted_at === '')
  );
  if (candidates.length === 0) return null;
  const active =
    candidates.find((ov) => ov.es_version_actual === true) ??
    candidates.slice().sort((a, b) => Number(b.version_numero ?? 0) - Number(a.version_numero ?? 0))[0];
  return typeof active?.id === 'string' ? active.id : null;
}

export interface PlanCsvImportInput {
  tableName: string;
  csvText: string;
  existingDataByTable: Record<string, ReadonlyArray<Record<string, unknown>>>;
  validColumns?: readonly string[];
  generateUuid?: () => string;
}

/**
 * Pure CSV import planner:
 * 1) Maps simple/staging IDs (`1`, `ORG-1`, etc.) to real DB UUIDs cleanly.
 * 2) Resolves parent FKs against both existing DB rows (by UUID or natural/business keys)
 *    and earlier rows in the same CSV batch.
 * 3) Detects existing DB records via UUID or natural business keys and marks them `SKIP_EXISTING`
 *    so only missing records are inserted.
 * 4) Emits strictly Zero-UUID Spanish preview rows and error messages.
 */
export function planCsvImport(input: PlanCsvImportInput): CsvImportPlanResult {
  const def = getDbTableDefinition(input.tableName);
  if (!def) {
    throw new Error(`La tabla seleccionada no es válida.`);
  }
  if (!def.csvImportSupported) {
    throw new Error(`La tabla "${def.labelEs}" es administrada por el sistema y no admite importación CSV directa.`);
  }

  const parsed = parseCsvToObjects(input.csvText);
  const generateUuid = input.generateUuid ?? generateRandomUuid;

  const targetExistingRows = [...(input.existingDataByTable[def.name] ?? [])];
  const targetIndex = buildLookupIndex(targetExistingRows, def.naturalKeys);
  const targetNaturalSignatures = new Set<string>();
  const targetIdsLower = new Set<string>();

  for (const row of targetExistingRows) {
    if (typeof row.id === 'string' && row.id) {
      targetIdsLower.add(row.id.toLowerCase());
    }
    if (row.deleted_at !== null && row.deleted_at !== undefined && row.deleted_at !== '') {
      continue;
    }
    for (const nk of def.naturalKeys) {
      const sig = makeNaturalKeySignature(nk, row);
      if (sig) targetNaturalSignatures.add(sig);
    }
  }

  // Build parent table indexes
  const parentIndexes = new Map<
    string,
    { byId: Map<string, Record<string, unknown>>; byKey: Map<string, Record<string, unknown>> }
  >();
  for (const fk of def.fkRefs) {
    if (fk.selfReferential || parentIndexes.has(fk.targetTable)) continue;
    const rows = input.existingDataByTable[fk.targetTable] ?? [];
    const lookupKeys = new Set<readonly string[]>(fk.targetLookupKeys);
    const parentDef = getDbTableDefinition(fk.targetTable);
    if (parentDef) {
      for (const nk of parentDef.naturalKeys) {
        lookupKeys.add(nk);
      }
    }
    parentIndexes.set(fk.targetTable, buildLookupIndex(rows, [...lookupKeys]));
  }

  // Map simple/staging ID -> resolved UUID within the CSV batch (for self-referential & id reuse)
  const batchSimpleIdToUuid = new Map<string, string>();
  const validColSet = input.validColumns ? new Set(input.validColumns) : null;

  const previewRows: CsvImportPreviewRow[] = [];
  const insertPayloads: CsvImportPlannedInsert[] = [];
  let toInsert = 0;
  let toSkip = 0;
  let errors = 0;

  const boolCols = new Set(def.booleanColumns ?? []);
  const numCols = new Set(def.numberColumns ?? []);
  const jsonCols = new Set(def.jsonColumns ?? []);
  const ltreeCols = new Set(def.ltreeColumns ?? []);

  for (const csvRow of parsed.rows) {
    const raw = csvRow.values;
    const displayLabel = buildCsvDisplayLabel(def, raw, csvRow.lineNumber);
    const simpleId = (raw.id || raw.local_id || raw.ref_id || '').trim();
    const record: Record<string, unknown> = {};
    const rowErrors: string[] = [];

    // Copy known scalar columns from CSV (excluding alias-only fields)
    const aliasOnlyFields = new Set<string>(['local_id', 'ref_id']);
    for (const fk of def.fkRefs) {
      for (const alias of fk.aliasColumns ?? []) {
        if (alias !== fk.column) aliasOnlyFields.add(alias);
      }
    }

    for (const [col, val] of Object.entries(raw)) {
      if (col === 'id' || aliasOnlyFields.has(col)) continue;
      if (validColSet && !validColSet.has(col)) continue;
      if (val === '') continue;

      if (boolCols.has(col)) {
        const parsedBool = parseBooleanValue(val);
        if (parsedBool === null) {
          rowErrors.push(`Valor booleano inválido en "${col}".`);
        } else {
          record[col] = parsedBool;
        }
      } else if (numCols.has(col)) {
        const num = Number(val);
        if (!Number.isFinite(num)) {
          rowErrors.push(`Valor numérico inválido en "${col}".`);
        } else {
          record[col] = num;
        }
      } else if (jsonCols.has(col)) {
        try {
          record[col] = JSON.parse(val);
        } catch {
          rowErrors.push(`JSON inválido en "${col}".`);
        }
      } else {
        record[col] = val;
      }
    }

    // Resolve FKs
    for (const fk of def.fkRefs) {
      let rawInput = (raw[fk.column] ?? '').trim();
      if (!rawInput && fk.aliasColumns) {
        for (const alias of fk.aliasColumns) {
          const aliasVal = (raw[alias] ?? '').trim();
          if (aliasVal) {
            rawInput = aliasVal;
            break;
          }
        }
      }

      if (!rawInput) {
        // Smart auto-resolution for version columns when parent certificate is resolved
        if (fk.column === 'id_certificado_version' && typeof record.id_certificado === 'string') {
          const resolvedVer = resolveCurrentVersionForCert(
            record.id_certificado,
            input.existingDataByTable.certificado_version ?? []
          );
          if (resolvedVer) {
            record.id_certificado_version = resolvedVer;
            continue;
          }
        }
        if (fk.column === 'id_organizacion_version' && typeof record.id_certificado === 'string') {
          const resolvedOrgVer = resolveCurrentOrgVersionForCert(
            record.id_certificado,
            input.existingDataByTable.certificado ?? [],
            input.existingDataByTable.organizacion_version ?? []
          );
          if (resolvedOrgVer) {
            record.id_organizacion_version = resolvedOrgVer;
            continue;
          }
        }
        if (fk.optional) {
          delete record[fk.column];
          continue;
        }
        rowErrors.push(`Falta referencia requerida en "${fk.column}".`);
        continue;
      }

      let resolvedUuid: string | null = null;
      const normalizedInput = rawInput.toLowerCase();

      if (fk.selfReferential) {
        if (batchSimpleIdToUuid.has(normalizedInput)) {
          resolvedUuid = batchSimpleIdToUuid.get(normalizedInput)!;
        } else if (isValidUuid(rawInput) && targetIdsLower.has(normalizedInput)) {
          resolvedUuid = rawInput.trim();
        } else {
          for (const keyCols of fk.targetLookupKeys) {
            if (keyCols.length === 1) {
              const sig = `${keyCols[0]}=${normalizedInput}`;
              const found = targetIndex.byKey.get(sig);
              if (found && typeof found.id === 'string') {
                resolvedUuid = found.id;
                break;
              }
            }
          }
        }
      } else {
        const parentIdx = parentIndexes.get(fk.targetTable);
        if (isValidUuid(rawInput) && parentIdx?.byId.has(normalizedInput)) {
          resolvedUuid = rawInput.trim();
        } else if (batchSimpleIdToUuid.has(`${fk.targetTable}:${normalizedInput}`)) {
          resolvedUuid = batchSimpleIdToUuid.get(`${fk.targetTable}:${normalizedInput}`)!;
        } else if (parentIdx) {
          for (const keyCols of fk.targetLookupKeys) {
            if (keyCols.length === 1) {
              const sig = `${keyCols[0]}=${normalizedInput}`;
              const found = parentIdx.byKey.get(sig);
              if (found && typeof found.id === 'string') {
                resolvedUuid = found.id;
                break;
              }
            }
          }
        }
      }

      if (!resolvedUuid) {
        const parentLabel = getDbTableDefinition(fk.targetTable)?.labelEs ?? fk.targetTable;
        rowErrors.push(
          sanitizeZeroUuidMessage(
            `No se encontró referencia en ${parentLabel} para "${rawInput}".`
          )
        );
      } else {
        record[fk.column] = resolvedUuid;
      }
    }

    // Requisito LTREE fallback if missing
    if (
      def.name === 'requisito' &&
      ltreeCols.has('ruta_materializada') &&
      !record.ruta_materializada &&
      typeof record.codigo === 'string'
    ) {
      const seg = record.codigo.trim().replace(/[^A-Za-z0-9_]/g, '_') || 'req';
      const parentId = typeof record.id_requisito_padre === 'string' ? record.id_requisito_padre : '';
      const parentRow = parentId ? targetIndex.byId.get(parentId.toLowerCase()) : null;
      const parentPath =
        parentRow && typeof parentRow.ruta_materializada === 'string'
          ? parentRow.ruta_materializada
          : '';
      record.ruta_materializada = parentPath ? `${parentPath}.${seg}` : seg;
    }

    // Validate required columns
    for (const reqCol of def.requiredColumns) {
      const val = record[reqCol];
      if (val === undefined || val === null || val === '') {
        rowErrors.push(`Falta columna obligatoria "${reqCol}".`);
      }
    }

    if (rowErrors.length > 0) {
      errors += 1;
      previewRows.push({
        lineNumber: csvRow.lineNumber,
        action: 'ERROR',
        displayLabel,
        detail: rowErrors[0],
      });
      continue;
    }

    // Check existing by explicit UUID or natural keys
    let matchedExistingId: string | null = null;
    if (simpleId && isValidUuid(simpleId) && targetIdsLower.has(simpleId.toLowerCase())) {
      matchedExistingId = simpleId.trim();
    } else {
      for (const nk of def.naturalKeys) {
        const sig = makeNaturalKeySignature(nk, record);
        if (sig && targetNaturalSignatures.has(sig)) {
          const existingRow = targetIndex.byKey.get(sig);
          matchedExistingId = typeof existingRow?.id === 'string' ? existingRow.id : 'existing';
          break;
        }
      }
    }

    if (matchedExistingId) {
      if (simpleId && matchedExistingId !== 'existing') {
        batchSimpleIdToUuid.set(simpleId.toLowerCase(), matchedExistingId);
      }
      toSkip += 1;
      previewRows.push({
        lineNumber: csvRow.lineNumber,
        action: 'SKIP_EXISTING',
        displayLabel,
        detail: 'Registro existente en la base de datos (omitido sin duplicar).',
      });
      continue;
    }

    // Assign DB UUID for autoUuidPk tables
    if (def.autoUuidPk) {
      const finalId =
        simpleId && isValidUuid(simpleId) ? simpleId.trim() : generateUuid();
      record.id = finalId;
      targetIdsLower.add(finalId.toLowerCase());
      targetIndex.byId.set(finalId.toLowerCase(), record);
      if (simpleId) {
        batchSimpleIdToUuid.set(simpleId.toLowerCase(), finalId);
      }
    }

    // Register natural keys in target sets so duplicates within the same CSV are also skipped cleanly
    for (const nk of def.naturalKeys) {
      const sig = makeNaturalKeySignature(nk, record);
      if (sig) {
        targetNaturalSignatures.add(sig);
        targetIndex.byKey.set(sig, record);
      }
    }

    toInsert += 1;
    insertPayloads.push({
      lineNumber: csvRow.lineNumber,
      record,
    });
    previewRows.push({
      lineNumber: csvRow.lineNumber,
      action: 'INSERT',
      displayLabel,
      detail: simpleId && !isValidUuid(simpleId)
        ? `Nuevo registro listo (ID simple "${sanitizeZeroUuidMessage(simpleId)}" convertido a ID interno).`
        : 'Nuevo registro listo para insertar.',
    });
  }

  return {
    summary: {
      tableName: def.name,
      labelEs: def.labelEs,
      totalRows: parsed.rows.length,
      toInsert,
      toSkip,
      errors,
    },
    previewRows,
    insertPayloads,
  };
}
