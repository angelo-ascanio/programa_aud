/**
 * Paso 1.1: Catálogo Tipado de Bloques, Secciones, Cascada Padre→Hijos y Metadatos SQL
 * para la consola administrativa `Sincronización SQL` (`#database-sync`).
 *
 * Modela los 3 bloques operativos (`auditorias`, `certificacion`, `extra`), todas sus
 * secciones reales, la expansión automática de dependencias Padre → Hijos (ej. Certificado
 * → Versiones → Alcance → Sitios → Fechas → Contactos → Procesos → Cláusulas → Turnos),
 * el cierre topológico de llaves foráneas y los metadatos de conflicto alineados con
 * `01_creacion.sql` y `03_indices_optimizacion.sql`.
 */

export type SqlSeedBlockId = 'auditorias' | 'certificacion' | 'extra';

export type SqlSeedTargetFile = '06_datos_prueba.sql' | '07_normas_requisitos_csv.sql';

export type SqlSeedSpecialCase = 'NORMAS_CSV_SEED';

export type SqlSeedTableKind =
  | 'soft_delete_core'
  | 'soft_delete_child'
  | 'pure_mn_link'
  | 'trigger_derived';

export interface SqlSyncFkDependency {
  column: string;
  targetTable: string;
  optional?: boolean;
  selfReferential?: boolean;
  externalManagedIn05Usuarios?: boolean;
}

export interface SqlSyncTableMetadata {
  tableName: string;
  labelEs: string;
  targetFile: SqlSeedTargetFile;
  pkColumns: readonly string[];
  kind: SqlSeedTableKind;
  /** Cláusula exacta `ON CONFLICT ...` para filas activas, alineada a `03_indices_optimizacion.sql` y `01_creacion.sql`. */
  conflictClauseActive: string;
  /** Verdadero cuando `conflictClauseActive` depende de un índice único parcial condicional o requiere apoyo por `id`. */
  conflictRequiresNonNullPredicate?: boolean;
  additionalUniqueIndexes?: readonly string[];
  naturalKeys: ReadonlyArray<readonly string[]>;
  fkDependencies: readonly SqlSyncFkDependency[];
  selfReferentialColumn?: string;
  ltreeColumns?: readonly string[];
  jsonColumns?: readonly string[];
  booleanColumns?: readonly string[];
  numberColumns?: readonly string[];
  dateColumns?: readonly string[];
  excludedInsertColumns?: readonly string[];
  /** Columnas legibles (Zero-UUID) recomendadas para muestras y resúmenes en UI. */
  displayLabelColumns: readonly string[];
}

export interface SqlSeedSectionSpec {
  id: string;
  blockId: SqlSeedBlockId;
  groupLabelEs?: string;
  labelEs: string;
  descriptionEs: string;
  targetFile: SqlSeedTargetFile;
  specialCase?: SqlSeedSpecialCase;
  /** Tablas propias y cascada directa Padre → Hijos incluidas al seleccionar esta sección. */
  tables: readonly string[];
  /** Tablas derivadas automáticamente por triggers en BD (no requieren INSERT manual redundante). */
  derivedTables?: readonly string[];
  /** Texto compacto en español (Zero-UUID) que resume la cascada incluida para la UI. */
  cascadeSummaryEs: string;
}

export interface SqlSeedBlockSpec {
  id: SqlSeedBlockId;
  order: number;
  labelEs: string;
  symbol: string;
  descriptionEs: string;
  sections: readonly SqlSeedSectionSpec[];
}

export interface ResolveSyncSelectionOptions {
  /** Cuando es true (por defecto), agrega tablas padre necesarias por FK para evitar errores `23503`. */
  includeParentFkDependencies?: boolean;
}

export interface ResolvedSyncSelectionPlan {
  selectedSectionIds: string[];
  expandedSectionIds: string[];
  selectedBlocksComplete: SqlSeedBlockId[];
  targetFiles: SqlSeedTargetFile[];
  primaryTables: string[];
  fkSupportTables: string[];
  derivedTables: string[];
  tablesFor06: string[];
  tablesFor07: string[];
  hasSpecialNormasCase: boolean;
  cascadeSummaries: Array<{
    sectionId: string;
    labelEs: string;
    summaryEs: string;
    targetFile: SqlSeedTargetFile;
  }>;
}

/**
 * Orden topológico estricto (padres antes que hijos) sobre las 65 tablas operativas de `public`
 * (cubre las 64 de `DB_TABLES_TOPO_ORDER` + `telefono_auditor`, `email_auditor` y `evaluacion_in_situ_auditor`,
 * excluyendo únicamente `profiles` [05_usuarios.sql] y `audit_log` [bitácora forense generada por triggers]).
 *
 * Orden crítico de triggers en `01_creacion.sql`:
 * - `alcance` y `alcance_certificado_compartido` preceden a `auditoria` (`trg_validar_auditoria_requiere_alcance`).
 * - `requisitos_no_aplicables_certificado` precede a `requisitos_por_proceso` (`trg_guard_req_proceso_against_exclusion`).
 * - `sitios_por_auditoria` precede a `auditoria_fecha` (compuerta `REAL` en sección 20 de `06_datos_prueba.sql`).
 * - `auditoria_fecha` precede a `hallazgo` (`trg_auto_calcular_fechas_hallazgo` +15d/+45d desde fecha `REAL`).
 */
export const SQL_SYNC_TABLES_TOPO_ORDER: readonly string[] = [
  // Nivel 0: catálogos independientes y configuraciones base
  'configuracion_alerta_auditoria',
  'estatus',
  'norma',
  'sector_iaf',
  'organismo_acreditacion',
  'tipo_auditoria',
  'metodologia_auditoria',
  'auditor',
  'experto_tecnico',
  'grupo_empresarial',
  'turno',

  // Nivel 1: jerarquías e hijos directos de Nivel 0
  'requisito',
  'subsector_iaf',
  'acreditacion_norma',
  'telefono_auditor',
  'email_auditor',
  'evaluacion_in_situ_auditor',
  'norma_auditor',
  'sector_iaf_auditor',
  'telefono_experto_tecnico',
  'email_experto_tecnico',
  'sector_iaf_experto',
  'organizacion',
  'vinculo',

  // Nivel 2: traducciones, sub-sectores M:N, acreditaciones por sector, versiones org, certificados y programas
  'requisito_traduccion',
  'subsector_iaf_auditor',
  'subsector_iaf_experto',
  'acreditacion_norma_sector_iaf',
  'organizacion_version',
  'client_organization_access',
  'certificado',
  'programa_auditoria',

  // Nivel 3: versiones de certificado, alcance y membresía de vínculo
  'certificado_version',
  'alcance',
  'vinculo_certificado',

  // Nivel 4: sub-entidades del certificado y alcances compartidos (antes de `auditoria`)
  'alcance_certificado_compartido',
  'fecha_certificado',
  'contacto_certificado',
  'sitio',
  'proceso',
  'requisitos_no_aplicables_certificado',

  // Nivel 5: detalles de contactos/sitios/procesos/turnos + exclusiones y cláusulas por proceso
  'telefono_contacto_certificado',
  'email_contacto_certificado',
  'contacto_certificado_compartido',
  'sitio_certificado_compartido',
  'turnos_por_sitio',
  'turno_certificado_compartido',
  'procesos_por_sitio',
  'proceso_certificado_compartido',
  'requisitos_por_proceso',

  // Nivel 6: auditorías y asignaciones de primer nivel
  'auditoria',
  'sitios_por_auditoria',
  'auditoria_fecha',
  'auditoria_sitio_temporal',
  'comentarios_por_auditoria',
  'experto_tecnico_auditoria',
  'hallazgo',

  // Nivel 7: planificación por sitio, temporal y equipos
  'auditoria_sitio_temporal_certificado',
  'turnos_sitio_auditoria',
  'procesos_sitio_auditoria',
  'equipo_auditor_sitio',
  'equipo_auditor_sitio_temporal',

  // Nivel 8: asignación por proceso en sitio
  'turnos_proceso_sitio_auditoria',
  'equipo_auditor_proceso_sitio',

  // Nivel 9: tabla consolidada por triggers
  'equipo_auditor',
];

const TABLE_METADATA_LIST: readonly SqlSyncTableMetadata[] = [
  {
    tableName: 'configuracion_alerta_auditoria',
    labelEs: 'Configuración de alertas de auditoría',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_child',
    conflictClauseActive: '(clave) WHERE deleted_at IS NULL',
    naturalKeys: [['clave']],
    fkDependencies: [],
    booleanColumns: [
      'alertar_atrasadas',
      'alertar_conflicto_auditor',
      'alertar_desfase_dias_o_span',
      'alertas_activas',
    ],
    numberColumns: [
      'dias_aviso_proxima',
      'dias_aviso_preprogramada_sin_confirmar',
      'ciclos_rotacion_auditor_lider',
      'dias_limite_plan_accion',
      'dias_limite_plan_nc',
      'dias_limite_cierre_nc',
    ],
    displayLabelColumns: ['clave'],
  },
  {
    tableName: 'estatus',
    labelEs: 'Estatus canónicos',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_core',
    conflictClauseActive: '(estatus) WHERE deleted_at IS NULL',
    naturalKeys: [['estatus']],
    fkDependencies: [],
    displayLabelColumns: ['estatus'],
  },
  {
    tableName: 'norma',
    labelEs: 'Normas certificables ISO',
    targetFile: '07_normas_requisitos_csv.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_core',
    conflictClauseActive: '(codigo) WHERE deleted_at IS NULL',
    naturalKeys: [['codigo'], ['norma']],
    fkDependencies: [],
    dateColumns: ['fecha_publicacion'],
    displayLabelColumns: ['codigo', 'titulo'],
  },
  {
    tableName: 'sector_iaf',
    labelEs: 'Sectores IAF',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_core',
    conflictClauseActive: '(sector) WHERE deleted_at IS NULL',
    naturalKeys: [['sector']],
    fkDependencies: [],
    numberColumns: ['sector'],
    displayLabelColumns: ['sector', 'descripcion'],
  },
  {
    tableName: 'organismo_acreditacion',
    labelEs: 'Organismos de acreditación',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_core',
    conflictClauseActive: '(codigo) WHERE deleted_at IS NULL',
    naturalKeys: [['codigo']],
    fkDependencies: [],
    displayLabelColumns: ['codigo', 'nombre'],
  },
  {
    tableName: 'tipo_auditoria',
    labelEs: 'Tipos de auditoría',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_core',
    conflictClauseActive: '(tipo) WHERE deleted_at IS NULL',
    naturalKeys: [['tipo']],
    fkDependencies: [],
    displayLabelColumns: ['tipo', 'abreviacion'],
  },
  {
    tableName: 'metodologia_auditoria',
    labelEs: 'Metodologías de auditoría',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_core',
    conflictClauseActive: '(metodologia) WHERE deleted_at IS NULL',
    naturalKeys: [['metodologia']],
    fkDependencies: [],
    displayLabelColumns: ['metodologia'],
  },
  {
    tableName: 'auditor',
    labelEs: 'Auditores',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_core',
    conflictClauseActive: '(id)',
    conflictRequiresNonNullPredicate: true,
    additionalUniqueIndexes: ['uq_auditor_cedula_active'],
    naturalKeys: [['cedula_identidad'], ['nombre']],
    fkDependencies: [],
    booleanColumns: ['sin_registro_evaluacion'],
    numberColumns: ['anio_actualizacion_normas', 'anio_actualizacion_sectores'],
    dateColumns: ['ultima_evaluacion_in_situ_fecha', 'proxima_evaluacion_in_situ_fecha'],
    displayLabelColumns: ['siglas', 'nombre'],
  },
  {
    tableName: 'experto_tecnico',
    labelEs: 'Expertos técnicos',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_core',
    conflictClauseActive: '(id)',
    naturalKeys: [['nombre']],
    fkDependencies: [],
    displayLabelColumns: ['nombre', 'estatus'],
  },
  {
    tableName: 'grupo_empresarial',
    labelEs: 'Conglomerados / Grupos empresariales',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_core',
    conflictClauseActive: '(LOWER(TRIM(nombre))) WHERE deleted_at IS NULL',
    additionalUniqueIndexes: [
      'uq_grupo_empresarial_codigo_active',
      'uq_grupo_empresarial_abrev_active',
    ],
    naturalKeys: [['codigo_grupo'], ['abreviacion'], ['nombre']],
    fkDependencies: [],
    booleanColumns: ['es_individual_auto'],
    displayLabelColumns: ['abreviacion', 'nombre'],
  },
  {
    tableName: 'turno',
    labelEs: 'Turnos laborales',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_core',
    conflictClauseActive: '(hora_entrada, hora_salida) WHERE deleted_at IS NULL',
    naturalKeys: [['hora_entrada', 'hora_salida']],
    fkDependencies: [],
    displayLabelColumns: ['hora_entrada', 'hora_salida'],
  },
  {
    tableName: 'requisito',
    labelEs: 'Cláusulas / Requisitos normativos',
    targetFile: '07_normas_requisitos_csv.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_core',
    conflictClauseActive: '(id_norma, codigo) WHERE deleted_at IS NULL',
    additionalUniqueIndexes: ['uq_requisito_external_key_active'],
    naturalKeys: [['id_norma', 'codigo'], ['external_key']],
    fkDependencies: [
      { column: 'id_norma', targetTable: 'norma' },
      { column: 'id_requisito_padre', targetTable: 'requisito', optional: true, selfReferential: true },
    ],
    selfReferentialColumn: 'id_requisito_padre',
    ltreeColumns: ['ruta_materializada'],
    booleanColumns: ['explicit_code', 'es_padre', 'es_obligatorio'],
    numberColumns: ['nivel'],
    displayLabelColumns: ['codigo', 'external_key'],
  },
  {
    tableName: 'subsector_iaf',
    labelEs: 'Sub-sectores IAF',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_core',
    conflictClauseActive: '(codigo) WHERE deleted_at IS NULL',
    naturalKeys: [['codigo']],
    fkDependencies: [{ column: 'id_sector_iaf', targetTable: 'sector_iaf' }],
    displayLabelColumns: ['codigo', 'descripcion'],
  },
  {
    tableName: 'acreditacion_norma',
    labelEs: 'Acreditaciones por norma',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_core',
    conflictClauseActive: '(id)',
    naturalKeys: [['numero_acreditacion']],
    fkDependencies: [
      { column: 'id_organismo', targetTable: 'organismo_acreditacion' },
      { column: 'id_norma', targetTable: 'norma' },
      { column: 'id_estatus', targetTable: 'estatus' },
    ],
    dateColumns: ['fecha_concesion', 'fecha_vencimiento'],
    displayLabelColumns: ['numero_acreditacion'],
  },
  {
    tableName: 'telefono_auditor',
    labelEs: 'Teléfonos de auditores',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_child',
    conflictClauseActive: '(id_auditor, TRIM(telefono)) WHERE deleted_at IS NULL',
    naturalKeys: [['id_auditor', 'telefono']],
    fkDependencies: [{ column: 'id_auditor', targetTable: 'auditor' }],
    booleanColumns: ['es_principal'],
    displayLabelColumns: ['telefono', 'tipo_telefono'],
  },
  {
    tableName: 'email_auditor',
    labelEs: 'Correos de auditores',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_child',
    conflictClauseActive: '(id_auditor, LOWER(TRIM(email))) WHERE deleted_at IS NULL',
    naturalKeys: [['id_auditor', 'email']],
    fkDependencies: [{ column: 'id_auditor', targetTable: 'auditor' }],
    booleanColumns: ['es_principal'],
    displayLabelColumns: ['email', 'tipo_email'],
  },
  {
    tableName: 'evaluacion_in_situ_auditor',
    labelEs: 'Evaluaciones in situ de auditores',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_child',
    conflictClauseActive: '(id)',
    naturalKeys: [['id']],
    fkDependencies: [{ column: 'id_auditor', targetTable: 'auditor' }],
    dateColumns: ['ultima_evaluacion_fecha', 'proxima_evaluacion_fecha'],
    displayLabelColumns: ['etiqueta_periodo', 'norma_referencia'],
  },
  {
    tableName: 'norma_auditor',
    labelEs: 'Competencias de auditores × norma',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id_auditor', 'id_norma'],
    kind: 'pure_mn_link',
    conflictClauseActive: '(id_auditor, id_norma)',
    naturalKeys: [['id_auditor', 'id_norma']],
    fkDependencies: [
      { column: 'id_auditor', targetTable: 'auditor' },
      { column: 'id_norma', targetTable: 'norma' },
    ],
    displayLabelColumns: ['id_auditor', 'id_norma'],
  },
  {
    tableName: 'sector_iaf_auditor',
    labelEs: 'Competencias de auditores × sector IAF',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id_auditor', 'id_sector_iaf'],
    kind: 'pure_mn_link',
    conflictClauseActive: '(id_auditor, id_sector_iaf)',
    naturalKeys: [['id_auditor', 'id_sector_iaf']],
    fkDependencies: [
      { column: 'id_auditor', targetTable: 'auditor' },
      { column: 'id_sector_iaf', targetTable: 'sector_iaf' },
    ],
    displayLabelColumns: ['id_auditor', 'id_sector_iaf'],
  },
  {
    tableName: 'telefono_experto_tecnico',
    labelEs: 'Teléfonos de expertos técnicos',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_child',
    conflictClauseActive: '(id)',
    naturalKeys: [['id_experto_tecnico', 'telefono']],
    fkDependencies: [{ column: 'id_experto_tecnico', targetTable: 'experto_tecnico' }],
    displayLabelColumns: ['telefono', 'tipo_telefono'],
  },
  {
    tableName: 'email_experto_tecnico',
    labelEs: 'Correos de expertos técnicos',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_child',
    conflictClauseActive: '(id)',
    naturalKeys: [['id_experto_tecnico', 'email']],
    fkDependencies: [{ column: 'id_experto_tecnico', targetTable: 'experto_tecnico' }],
    displayLabelColumns: ['email', 'tipo_email'],
  },
  {
    tableName: 'sector_iaf_experto',
    labelEs: 'Competencias de expertos × sector IAF',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id_experto_tecnico', 'id_sector_iaf'],
    kind: 'pure_mn_link',
    conflictClauseActive: '(id_experto_tecnico, id_sector_iaf)',
    naturalKeys: [['id_experto_tecnico', 'id_sector_iaf']],
    fkDependencies: [
      { column: 'id_experto_tecnico', targetTable: 'experto_tecnico' },
      { column: 'id_sector_iaf', targetTable: 'sector_iaf' },
    ],
    displayLabelColumns: ['id_experto_tecnico', 'id_sector_iaf'],
  },
  {
    tableName: 'organizacion',
    labelEs: 'Organizaciones clientes',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_core',
    conflictClauseActive: '(id)',
    naturalKeys: [['rif'], ['abreviacion'], ['nombre']],
    fkDependencies: [{ column: 'id_grupo_empresarial', targetTable: 'grupo_empresarial' }],
    displayLabelColumns: ['abreviacion', 'nombre'],
  },
  {
    tableName: 'vinculo',
    labelEs: 'Cajas de vínculo',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_core',
    conflictClauseActive: '(id)',
    conflictRequiresNonNullPredicate: true,
    additionalUniqueIndexes: ['uq_vinculo_codigo_active'],
    naturalKeys: [['codigo_vinculo'], ['id_grupo_empresarial', 'etiqueta']],
    fkDependencies: [{ column: 'id_grupo_empresarial', targetTable: 'grupo_empresarial' }],
    booleanColumns: ['es_vinculada', 'tiene_sitio_temporal'],
    displayLabelColumns: ['codigo_vinculo', 'etiqueta'],
  },
  {
    tableName: 'requisito_traduccion',
    labelEs: 'Traducciones bilingües de cláusulas',
    targetFile: '07_normas_requisitos_csv.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_child',
    conflictClauseActive: '(id_requisito, lang) WHERE deleted_at IS NULL',
    naturalKeys: [['id_requisito', 'lang']],
    fkDependencies: [{ column: 'id_requisito', targetTable: 'requisito' }],
    displayLabelColumns: ['lang', 'title'],
  },
  {
    tableName: 'subsector_iaf_auditor',
    labelEs: 'Competencias de auditores × sub-sector IAF',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id_auditor', 'id_subsector_iaf'],
    kind: 'pure_mn_link',
    conflictClauseActive: '(id_auditor, id_subsector_iaf)',
    naturalKeys: [['id_auditor', 'id_subsector_iaf']],
    fkDependencies: [
      { column: 'id_auditor', targetTable: 'auditor' },
      { column: 'id_subsector_iaf', targetTable: 'subsector_iaf' },
    ],
    displayLabelColumns: ['id_auditor', 'id_subsector_iaf'],
  },
  {
    tableName: 'subsector_iaf_experto',
    labelEs: 'Competencias de expertos × sub-sector IAF',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id_experto_tecnico', 'id_subsector_iaf'],
    kind: 'pure_mn_link',
    conflictClauseActive: '(id_experto_tecnico, id_subsector_iaf)',
    naturalKeys: [['id_experto_tecnico', 'id_subsector_iaf']],
    fkDependencies: [
      { column: 'id_experto_tecnico', targetTable: 'experto_tecnico' },
      { column: 'id_subsector_iaf', targetTable: 'subsector_iaf' },
    ],
    displayLabelColumns: ['id_experto_tecnico', 'id_subsector_iaf'],
  },
  {
    tableName: 'acreditacion_norma_sector_iaf',
    labelEs: 'Sectores IAF por acreditación',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_child',
    conflictClauseActive: '(id_acreditacion_norma, id_sector_iaf) WHERE deleted_at IS NULL',
    naturalKeys: [['id_acreditacion_norma', 'id_sector_iaf']],
    fkDependencies: [
      { column: 'id_acreditacion_norma', targetTable: 'acreditacion_norma' },
      { column: 'id_sector_iaf', targetTable: 'sector_iaf' },
    ],
    displayLabelColumns: ['id_acreditacion_norma', 'id_sector_iaf'],
  },
  {
    tableName: 'organizacion_version',
    labelEs: 'Versiones de organización',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_core',
    conflictClauseActive: '(id_organizacion, version_numero) WHERE deleted_at IS NULL',
    additionalUniqueIndexes: [
      'uq_organizacion_version_actual_active',
      'uq_organizacion_version_nombre_actual_active',
      'uq_organizacion_version_abrev_actual_active',
      'uq_organizacion_version_rif_actual_active',
    ],
    naturalKeys: [['id_organizacion', 'version_numero']],
    fkDependencies: [{ column: 'id_organizacion', targetTable: 'organizacion' }],
    booleanColumns: ['es_version_actual'],
    numberColumns: ['version_numero'],
    displayLabelColumns: ['abreviacion', 'nombre'],
  },
  {
    tableName: 'client_organization_access',
    labelEs: 'Accesos de clientes por organización',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_child',
    conflictClauseActive: '(id_usuario, id_organizacion)',
    naturalKeys: [['id_usuario', 'id_organizacion']],
    fkDependencies: [
      {
        column: 'id_usuario',
        targetTable: 'profiles',
        externalManagedIn05Usuarios: true,
      },
      { column: 'id_organizacion', targetTable: 'organizacion' },
      {
        column: 'aprobado_por',
        targetTable: 'profiles',
        optional: true,
        externalManagedIn05Usuarios: true,
      },
    ],
    displayLabelColumns: ['estado'],
  },
  {
    tableName: 'certificado',
    labelEs: 'Certificados',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_core',
    conflictClauseActive: '(numero_certificado) WHERE deleted_at IS NULL',
    naturalKeys: [['numero_certificado']],
    fkDependencies: [
      { column: 'id_norma', targetTable: 'norma' },
      { column: 'id_estatus', targetTable: 'estatus' },
      { column: 'id_sector_iaf', targetTable: 'sector_iaf' },
      { column: 'id_subsector_iaf', targetTable: 'subsector_iaf' },
      { column: 'id_organizacion', targetTable: 'organizacion' },
    ],
    booleanColumns: ['multisitio'],
    displayLabelColumns: ['numero_certificado'],
  },
  {
    tableName: 'programa_auditoria',
    labelEs: 'Programas / Campañas de auditoría',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_core',
    conflictClauseActive: '(id)',
    conflictRequiresNonNullPredicate: true,
    additionalUniqueIndexes: ['uq_programa_auditoria_codigo_active'],
    naturalKeys: [['codigo_programa'], ['etiqueta']],
    fkDependencies: [
      { column: 'id_vinculo', targetTable: 'vinculo', optional: true },
      { column: 'id_grupo_empresarial', targetTable: 'grupo_empresarial', optional: true },
      {
        column: 'id_ciclo_origen',
        targetTable: 'programa_auditoria',
        optional: true,
        selfReferential: true,
      },
    ],
    selfReferentialColumn: 'id_ciclo_origen',
    booleanColumns: ['es_vinculada', 'tiene_sitio_temporal'],
    displayLabelColumns: ['codigo_programa', 'etiqueta'],
  },
  {
    tableName: 'certificado_version',
    labelEs: 'Versiones de certificado',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_core',
    conflictClauseActive: '(id_certificado, version_numero) WHERE deleted_at IS NULL',
    additionalUniqueIndexes: ['uq_certificado_version_actual_active'],
    naturalKeys: [['id_certificado', 'version_numero']],
    fkDependencies: [
      { column: 'id_certificado', targetTable: 'certificado' },
      { column: 'id_organizacion_version', targetTable: 'organizacion_version', optional: true },
      { column: 'id_estatus', targetTable: 'estatus' },
      { column: 'id_sector_iaf', targetTable: 'sector_iaf' },
      { column: 'id_subsector_iaf', targetTable: 'subsector_iaf' },
    ],
    booleanColumns: ['es_version_actual', 'multisitio'],
    numberColumns: ['version_numero'],
    displayLabelColumns: ['version_numero', 'notas_version'],
  },
  {
    tableName: 'alcance',
    labelEs: 'Alcances propios de certificado',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_core',
    conflictClauseActive: '(id_certificado) WHERE deleted_at IS NULL',
    naturalKeys: [['id_certificado']],
    fkDependencies: [{ column: 'id_certificado', targetTable: 'certificado' }],
    displayLabelColumns: ['alcance_es'],
  },
  {
    tableName: 'vinculo_certificado',
    labelEs: 'Membresías de certificados en vínculo',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_child',
    conflictClauseActive: '(id_certificado) WHERE deleted_at IS NULL',
    naturalKeys: [['id_certificado']],
    fkDependencies: [
      { column: 'id_vinculo', targetTable: 'vinculo' },
      { column: 'id_certificado', targetTable: 'certificado' },
    ],
    displayLabelColumns: ['tipo_vinculacion_override'],
  },
  {
    tableName: 'alcance_certificado_compartido',
    labelEs: 'Alcances compartidos entre certificados',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_child',
    conflictClauseActive: '(id_certificado) WHERE deleted_at IS NULL',
    additionalUniqueIndexes: ['uq_alcance_compartido_pair_active'],
    naturalKeys: [['id_certificado'], ['id_alcance', 'id_certificado']],
    fkDependencies: [
      { column: 'id_alcance', targetTable: 'alcance' },
      { column: 'id_certificado', targetTable: 'certificado' },
    ],
    displayLabelColumns: ['id_alcance', 'id_certificado'],
  },
  {
    tableName: 'fecha_certificado',
    labelEs: 'Fechas de certificado',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_core',
    conflictClauseActive: '(id_certificado_version, tipo_fecha, fecha) WHERE deleted_at IS NULL',
    naturalKeys: [['id_certificado_version', 'tipo_fecha', 'fecha']],
    fkDependencies: [
      { column: 'id_certificado', targetTable: 'certificado' },
      { column: 'id_certificado_version', targetTable: 'certificado_version' },
    ],
    dateColumns: ['fecha'],
    displayLabelColumns: ['tipo_fecha', 'fecha'],
  },
  {
    tableName: 'contacto_certificado',
    labelEs: 'Contactos de certificado',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_core',
    conflictClauseActive: '(id_certificado_version, LOWER(TRIM(nombre))) WHERE deleted_at IS NULL',
    naturalKeys: [['id_certificado_version', 'nombre']],
    fkDependencies: [
      { column: 'id_certificado', targetTable: 'certificado' },
      { column: 'id_certificado_version', targetTable: 'certificado_version' },
    ],
    displayLabelColumns: ['nombre', 'cargo'],
  },
  {
    tableName: 'sitio',
    labelEs: 'Sitios de certificado',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_core',
    conflictClauseActive: '(id_certificado_version, numero_sitio) WHERE deleted_at IS NULL',
    naturalKeys: [['id_certificado_version', 'numero_sitio']],
    fkDependencies: [
      { column: 'id_certificado', targetTable: 'certificado' },
      { column: 'id_certificado_version', targetTable: 'certificado_version' },
    ],
    numberColumns: ['numero_sitio', 'personal_count'],
    displayLabelColumns: ['numero_sitio', 'nombre_sitio'],
  },
  {
    tableName: 'proceso',
    labelEs: 'Procesos de certificado',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_core',
    conflictClauseActive: '(id_certificado_version, LOWER(TRIM(nombre_proceso))) WHERE deleted_at IS NULL',
    naturalKeys: [['id_certificado_version', 'nombre_proceso']],
    fkDependencies: [
      { column: 'id_certificado', targetTable: 'certificado' },
      { column: 'id_certificado_version', targetTable: 'certificado_version' },
    ],
    displayLabelColumns: ['nombre_proceso', 'tipo'],
  },
  {
    tableName: 'requisitos_no_aplicables_certificado',
    labelEs: 'Exclusiones ISO 4.3 por certificado',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_child',
    conflictClauseActive: '(id_certificado_version, id_requisito) WHERE deleted_at IS NULL',
    naturalKeys: [['id_certificado_version', 'id_requisito']],
    fkDependencies: [
      { column: 'id_certificado', targetTable: 'certificado' },
      { column: 'id_certificado_version', targetTable: 'certificado_version' },
      { column: 'id_requisito', targetTable: 'requisito' },
    ],
    displayLabelColumns: ['justificacion'],
  },
  {
    tableName: 'telefono_contacto_certificado',
    labelEs: 'Teléfonos de contactos de certificado',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_child',
    conflictClauseActive: '(id_contacto, TRIM(telefono)) WHERE deleted_at IS NULL',
    naturalKeys: [['id_contacto', 'telefono']],
    fkDependencies: [{ column: 'id_contacto', targetTable: 'contacto_certificado' }],
    displayLabelColumns: ['telefono', 'tipo_telefono'],
  },
  {
    tableName: 'email_contacto_certificado',
    labelEs: 'Correos de contactos de certificado',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_child',
    conflictClauseActive: '(id_contacto, LOWER(TRIM(email))) WHERE deleted_at IS NULL',
    naturalKeys: [['id_contacto', 'email']],
    fkDependencies: [{ column: 'id_contacto', targetTable: 'contacto_certificado' }],
    displayLabelColumns: ['email', 'tipo_email'],
  },
  {
    tableName: 'contacto_certificado_compartido',
    labelEs: 'Contactos compartidos entre certificados',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_child',
    conflictClauseActive: '(id_contacto, id_certificado_version) WHERE deleted_at IS NULL',
    naturalKeys: [['id_contacto', 'id_certificado_version']],
    fkDependencies: [
      { column: 'id_contacto', targetTable: 'contacto_certificado' },
      { column: 'id_certificado', targetTable: 'certificado' },
      { column: 'id_certificado_version', targetTable: 'certificado_version' },
    ],
    displayLabelColumns: ['id_contacto', 'id_certificado'],
  },
  {
    tableName: 'sitio_certificado_compartido',
    labelEs: 'Sitios compartidos entre certificados',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_child',
    conflictClauseActive: '(id_sitio, id_certificado_version) WHERE deleted_at IS NULL',
    additionalUniqueIndexes: ['uq_sitio_cert_compartido_num_active'],
    naturalKeys: [['id_sitio', 'id_certificado_version']],
    fkDependencies: [
      { column: 'id_sitio', targetTable: 'sitio' },
      { column: 'id_certificado', targetTable: 'certificado' },
      { column: 'id_certificado_version', targetTable: 'certificado_version' },
    ],
    numberColumns: ['numero_sitio'],
    displayLabelColumns: ['numero_sitio'],
  },
  {
    tableName: 'turnos_por_sitio',
    labelEs: 'Turnos asignados por sitio',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_child',
    conflictClauseActive: '(id_sitio, id_turno) WHERE deleted_at IS NULL',
    naturalKeys: [['id_sitio', 'id_turno']],
    fkDependencies: [
      { column: 'id_sitio', targetTable: 'sitio' },
      { column: 'id_turno', targetTable: 'turno' },
    ],
    displayLabelColumns: ['id_sitio', 'id_turno'],
  },
  {
    tableName: 'turno_certificado_compartido',
    labelEs: 'Turnos compartidos entre certificados',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_child',
    conflictClauseActive: '(id_turno, id_certificado_version) WHERE deleted_at IS NULL',
    naturalKeys: [['id_turno', 'id_certificado_version']],
    fkDependencies: [
      { column: 'id_turno', targetTable: 'turno' },
      { column: 'id_certificado', targetTable: 'certificado' },
      { column: 'id_certificado_version', targetTable: 'certificado_version' },
      { column: 'id_certificado_origen', targetTable: 'certificado', optional: true },
    ],
    displayLabelColumns: ['id_turno', 'id_certificado'],
  },
  {
    tableName: 'procesos_por_sitio',
    labelEs: 'Procesos habilitados por sitio',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_child',
    conflictClauseActive: '(id_certificado_version, id_sitio, id_proceso) WHERE deleted_at IS NULL',
    naturalKeys: [['id_certificado_version', 'id_sitio', 'id_proceso']],
    fkDependencies: [
      { column: 'id_certificado', targetTable: 'certificado' },
      { column: 'id_certificado_version', targetTable: 'certificado_version' },
      { column: 'id_sitio', targetTable: 'sitio' },
      { column: 'id_proceso', targetTable: 'proceso' },
    ],
    displayLabelColumns: ['id_sitio', 'id_proceso'],
  },
  {
    tableName: 'proceso_certificado_compartido',
    labelEs: 'Procesos compartidos entre certificados',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_child',
    conflictClauseActive: '(id_proceso, id_certificado_version) WHERE deleted_at IS NULL',
    naturalKeys: [['id_proceso', 'id_certificado_version']],
    fkDependencies: [
      { column: 'id_proceso', targetTable: 'proceso' },
      { column: 'id_certificado', targetTable: 'certificado' },
      { column: 'id_certificado_version', targetTable: 'certificado_version' },
    ],
    booleanColumns: ['sincronizar_requisitos'],
    displayLabelColumns: ['sincronizar_requisitos'],
  },
  {
    tableName: 'requisitos_por_proceso',
    labelEs: 'Cláusulas / Requisitos por proceso',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id_proceso', 'id_certificado_version', 'id_requisito'],
    kind: 'pure_mn_link',
    conflictClauseActive: '(id_proceso, id_certificado_version, id_requisito)',
    naturalKeys: [['id_proceso', 'id_certificado_version', 'id_requisito']],
    fkDependencies: [
      { column: 'id_proceso', targetTable: 'proceso' },
      { column: 'id_certificado', targetTable: 'certificado' },
      { column: 'id_certificado_version', targetTable: 'certificado_version' },
      { column: 'id_requisito', targetTable: 'requisito' },
    ],
    displayLabelColumns: ['id_proceso', 'id_requisito'],
  },
  {
    tableName: 'auditoria',
    labelEs: 'Auditorías',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_core',
    conflictClauseActive: '(id_programa_auditoria, id_certificado) WHERE deleted_at IS NULL',
    additionalUniqueIndexes: ['uq_auditoria_codigo_active'],
    naturalKeys: [['codigo_auditoria'], ['id_programa_auditoria', 'id_certificado']],
    fkDependencies: [
      { column: 'id_programa_auditoria', targetTable: 'programa_auditoria' },
      { column: 'id_certificado', targetTable: 'certificado' },
      { column: 'id_certificado_version', targetTable: 'certificado_version' },
      { column: 'id_tipo_auditoria', targetTable: 'tipo_auditoria', optional: true },
      { column: 'id_metodologia', targetTable: 'metodologia_auditoria', optional: true },
    ],
    booleanColumns: ['tiene_sitio_temporal', 'revisado', 'documentacion_completa'],
    numberColumns: ['tiempo_auditoria'],
    dateColumns: ['fecha_cierre_auditoria', 'fecha_revision'],
    displayLabelColumns: ['codigo_auditoria', 'estado_ciclo'],
  },
  {
    tableName: 'sitios_por_auditoria',
    labelEs: 'Sitios en alcance de auditoría',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_child',
    conflictClauseActive: '(id_auditoria, id_sitio) WHERE deleted_at IS NULL',
    naturalKeys: [['id_auditoria', 'id_sitio']],
    fkDependencies: [
      { column: 'id_auditoria', targetTable: 'auditoria' },
      { column: 'id_sitio', targetTable: 'sitio' },
    ],
    numberColumns: ['tiempo_auditoria'],
    dateColumns: ['fecha_inicio', 'fecha_fin'],
    displayLabelColumns: ['modalidad_evaluacion', 'tiempo_auditoria'],
  },
  {
    tableName: 'auditoria_fecha',
    labelEs: 'Fechas 1:N de auditoría',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_child',
    conflictClauseActive: '(id_auditoria, numero_secuencia) WHERE deleted_at IS NULL',
    naturalKeys: [['id_auditoria', 'numero_secuencia']],
    fkDependencies: [{ column: 'id_auditoria', targetTable: 'auditoria' }],
    numberColumns: ['numero_secuencia', 'anio', 'mes'],
    dateColumns: ['fecha_inicio', 'fecha_fin'],
    displayLabelColumns: ['tipo_fecha', 'tag', 'anio', 'mes'],
  },
  {
    tableName: 'auditoria_sitio_temporal',
    labelEs: 'Sitios temporales de auditoría',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_core',
    conflictClauseActive: '(id_auditoria, LOWER(TRIM(etiqueta))) WHERE deleted_at IS NULL',
    naturalKeys: [['id_auditoria', 'etiqueta']],
    fkDependencies: [{ column: 'id_auditoria', targetTable: 'auditoria' }],
    numberColumns: ['tiempo_auditoria'],
    displayLabelColumns: ['etiqueta', 'tiempo_auditoria'],
  },
  {
    tableName: 'comentarios_por_auditoria',
    labelEs: 'Comentarios de auditoría',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_child',
    conflictClauseActive: '(id)',
    naturalKeys: [['id']],
    fkDependencies: [{ column: 'id_auditoria', targetTable: 'auditoria' }],
    displayLabelColumns: ['comentario'],
  },
  {
    tableName: 'experto_tecnico_auditoria',
    labelEs: 'Expertos técnicos asignados a auditoría',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_child',
    conflictClauseActive: '(id_auditoria, id_experto_tecnico) WHERE deleted_at IS NULL',
    naturalKeys: [['id_auditoria', 'id_experto_tecnico']],
    fkDependencies: [
      { column: 'id_auditoria', targetTable: 'auditoria' },
      { column: 'id_experto_tecnico', targetTable: 'experto_tecnico' },
    ],
    numberColumns: ['dias_asignados'],
    displayLabelColumns: ['dias_asignados', 'observacion'],
  },
  {
    tableName: 'hallazgo',
    labelEs: 'Hallazgos de campo',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_core',
    conflictClauseActive: '(id)',
    naturalKeys: [['id']],
    fkDependencies: [
      { column: 'id_auditoria', targetTable: 'auditoria' },
      { column: 'id_requisito', targetTable: 'requisito' },
      { column: 'id_proceso', targetTable: 'proceso', optional: true },
      { column: 'id_sitio', targetTable: 'sitio', optional: true },
    ],
    booleanColumns: ['cerrado'],
    dateColumns: [
      'fecha_limite_plan',
      'fecha_entrega_plan',
      'fecha_limite_cierre',
      'fecha_cierre_real',
    ],
    displayLabelColumns: ['tipo', 'descripcion'],
  },
  {
    tableName: 'auditoria_sitio_temporal_certificado',
    labelEs: 'Certificados atribuidos a sitio temporal',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_child',
    conflictClauseActive: '(id_sitio_temporal, id_auditoria_certificado) WHERE deleted_at IS NULL',
    naturalKeys: [['id_sitio_temporal', 'id_auditoria_certificado']],
    fkDependencies: [
      { column: 'id_sitio_temporal', targetTable: 'auditoria_sitio_temporal' },
      { column: 'id_auditoria_certificado', targetTable: 'auditoria' },
    ],
    displayLabelColumns: ['id_sitio_temporal', 'id_auditoria_certificado'],
  },
  {
    tableName: 'turnos_sitio_auditoria',
    labelEs: 'Turnos habilitados por sitio en auditoría',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_child',
    conflictClauseActive: '(id_sitios_por_auditoria, id_turnos_por_sitio) WHERE deleted_at IS NULL',
    naturalKeys: [['id_sitios_por_auditoria', 'id_turnos_por_sitio']],
    fkDependencies: [
      { column: 'id_sitios_por_auditoria', targetTable: 'sitios_por_auditoria' },
      { column: 'id_turnos_por_sitio', targetTable: 'turnos_por_sitio' },
    ],
    displayLabelColumns: ['id_sitios_por_auditoria', 'id_turnos_por_sitio'],
  },
  {
    tableName: 'procesos_sitio_auditoria',
    labelEs: 'Procesos evaluados por sitio en auditoría',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_child',
    conflictClauseActive: '(id_sitios_por_auditoria, id_procesos_por_sitio) WHERE deleted_at IS NULL',
    naturalKeys: [['id_sitios_por_auditoria', 'id_procesos_por_sitio']],
    fkDependencies: [
      { column: 'id_sitios_por_auditoria', targetTable: 'sitios_por_auditoria' },
      { column: 'id_procesos_por_sitio', targetTable: 'procesos_por_sitio' },
      { column: 'id_proceso', targetTable: 'proceso' },
    ],
    displayLabelColumns: ['notas'],
  },
  {
    tableName: 'equipo_auditor_sitio',
    labelEs: 'Equipo auditor por sitio',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_child',
    conflictClauseActive: '(id_sitios_por_auditoria, id_auditor) WHERE deleted_at IS NULL',
    naturalKeys: [['id_sitios_por_auditoria', 'id_auditor']],
    fkDependencies: [
      { column: 'id_sitios_por_auditoria', targetTable: 'sitios_por_auditoria' },
      { column: 'id_auditor', targetTable: 'auditor' },
    ],
    booleanColumns: ['asignacion_completa_sitio'],
    numberColumns: ['tiempo_auditoria'],
    displayLabelColumns: ['rol_auditor', 'tiempo_auditoria'],
  },
  {
    tableName: 'equipo_auditor_sitio_temporal',
    labelEs: 'Equipo auditor por sitio temporal',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_child',
    conflictClauseActive: '(id_sitio_temporal, id_auditor) WHERE deleted_at IS NULL',
    naturalKeys: [['id_sitio_temporal', 'id_auditor']],
    fkDependencies: [
      { column: 'id_sitio_temporal', targetTable: 'auditoria_sitio_temporal' },
      { column: 'id_auditor', targetTable: 'auditor' },
    ],
    numberColumns: ['tiempo_auditoria'],
    displayLabelColumns: ['rol_auditor', 'tiempo_auditoria'],
  },
  {
    tableName: 'turnos_proceso_sitio_auditoria',
    labelEs: 'Turnos por proceso en sitio de auditoría',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_child',
    conflictClauseActive: '(id_procesos_sitio_auditoria, id_turnos_sitio_auditoria) WHERE deleted_at IS NULL',
    naturalKeys: [['id_procesos_sitio_auditoria', 'id_turnos_sitio_auditoria']],
    fkDependencies: [
      { column: 'id_procesos_sitio_auditoria', targetTable: 'procesos_sitio_auditoria' },
      { column: 'id_turnos_sitio_auditoria', targetTable: 'turnos_sitio_auditoria' },
    ],
    displayLabelColumns: ['id_procesos_sitio_auditoria', 'id_turnos_sitio_auditoria'],
  },
  {
    tableName: 'equipo_auditor_proceso_sitio',
    labelEs: 'Equipo auditor por proceso en sitio',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id'],
    kind: 'soft_delete_child',
    conflictClauseActive: '(id_procesos_sitio_auditoria, id_auditor) WHERE deleted_at IS NULL',
    naturalKeys: [['id_procesos_sitio_auditoria', 'id_auditor']],
    fkDependencies: [
      { column: 'id_procesos_sitio_auditoria', targetTable: 'procesos_sitio_auditoria' },
      { column: 'id_auditor', targetTable: 'auditor' },
    ],
    displayLabelColumns: ['rol_en_proceso'],
  },
  {
    tableName: 'equipo_auditor',
    labelEs: 'Equipo auditor consolidado (derivado por trigger)',
    targetFile: '06_datos_prueba.sql',
    pkColumns: ['id_auditoria', 'id_auditor'],
    kind: 'trigger_derived',
    conflictClauseActive: '(id_auditoria, id_auditor)',
    naturalKeys: [['id_auditoria', 'id_auditor']],
    fkDependencies: [
      { column: 'id_auditoria', targetTable: 'auditoria' },
      { column: 'id_auditor', targetTable: 'auditor' },
    ],
    displayLabelColumns: ['rol_auditor'],
  },
];

export const SQL_SYNC_TABLE_METADATA: Readonly<Record<string, SqlSyncTableMetadata>> =
  Object.fromEntries(TABLE_METADATA_LIST.map((item) => [item.tableName, item]));

const TOPO_INDEX_BY_TABLE = new Map<string, number>(
  SQL_SYNC_TABLES_TOPO_ORDER.map((tableName, index) => [tableName, index])
);

const ALL_AUDITORIAS_PRIMARY_TABLES: readonly string[] = [
  'configuracion_alerta_auditoria',
  'programa_auditoria',
  'auditoria',
  'sitios_por_auditoria',
  'auditoria_fecha',
  'auditoria_sitio_temporal',
  'auditoria_sitio_temporal_certificado',
  'turnos_sitio_auditoria',
  'procesos_sitio_auditoria',
  'turnos_proceso_sitio_auditoria',
  'equipo_auditor_sitio',
  'equipo_auditor_sitio_temporal',
  'equipo_auditor_proceso_sitio',
  'experto_tecnico_auditoria',
  'hallazgo',
  'comentarios_por_auditoria',
];

export const SQL_SEED_SYNC_BLOCKS: readonly SqlSeedBlockSpec[] = [
  {
    id: 'auditorias',
    order: 1,
    labelEs: 'Bloque 1 · Auditoría',
    symbol: '📅',
    descriptionEs:
      'Calendario, designación operativa, tiempos, equipos evaluadores, procesos, turnos, resultados, revisión QA y resumen.',
    sections: [
      {
        id: 'auditorias.calendario',
        blockId: 'auditorias',
        labelEs: 'Calendario',
        descriptionEs: 'Parámetros globales y alertas del calendario operativo.',
        targetFile: '06_datos_prueba.sql',
        tables: ['configuracion_alerta_auditoria'],
        cascadeSummaryEs: 'Calendario incluye configuración de alertas (DEFAULT)',
      },
      {
        id: 'auditorias.designacion.relacion',
        blockId: 'auditorias',
        groupLabelEs: '1. Designación',
        labelEs: '1.1 Relación',
        descriptionEs: 'Campañas / programas de auditoría y naturaleza de relación por auditoría.',
        targetFile: '06_datos_prueba.sql',
        tables: ['programa_auditoria', 'auditoria'],
        cascadeSummaryEs: '1.1 Relación incluye Programas de Auditoría y naturaleza por Auditoría',
      },
      {
        id: 'auditorias.designacion.tipo',
        blockId: 'auditorias',
        groupLabelEs: '1. Designación',
        labelEs: '1.2 Tipo',
        descriptionEs: 'Tipo de auditoría, metodología, objetivo y estado del ciclo por auditoría.',
        targetFile: '06_datos_prueba.sql',
        tables: ['auditoria'],
        cascadeSummaryEs: '1.2 Tipo actualiza campos de tipo, metodología, objetivo y ciclo en Auditorías',
      },
      {
        id: 'auditorias.designacion.fecha',
        blockId: 'auditorias',
        groupLabelEs: '1. Designación',
        labelEs: '1.3 Fecha',
        descriptionEs: 'Cronología 1:N preprogramada por mes y programada exacta.',
        targetFile: '06_datos_prueba.sql',
        tables: ['auditoria_fecha'],
        cascadeSummaryEs: '1.3 Fecha incluye fechas preprogramadas y exactas 1:N de Auditoría',
      },
      {
        id: 'auditorias.designacion.sitio',
        blockId: 'auditorias',
        groupLabelEs: '1. Designación',
        labelEs: '1.4 Sitio',
        descriptionEs: 'Sedes en alcance asignadas a cada auditoría.',
        targetFile: '06_datos_prueba.sql',
        tables: ['sitios_por_auditoria'],
        cascadeSummaryEs: '1.4 Sitio incluye Sitios en alcance de Auditoría',
      },
      {
        id: 'auditorias.designacion.temporal',
        blockId: 'auditorias',
        groupLabelEs: '1. Designación',
        labelEs: '1.5 Temporal',
        descriptionEs: 'Sitios temporales / proyectos de obra y atribución multicertificado.',
        targetFile: '06_datos_prueba.sql',
        tables: ['auditoria_sitio_temporal', 'auditoria_sitio_temporal_certificado'],
        cascadeSummaryEs: '1.5 Temporal incluye Sitios Temporales y Certificados atribuidos',
      },
      {
        id: 'auditorias.tiempo',
        blockId: 'auditorias',
        labelEs: '2. Tiempo',
        descriptionEs: 'Cálculo y distribución de jornadas 0.25d por auditoría, sitio y temporal.',
        targetFile: '06_datos_prueba.sql',
        tables: ['auditoria', 'sitios_por_auditoria', 'auditoria_sitio_temporal'],
        cascadeSummaryEs: '2. Tiempo incluye jornadas 0.25d en Auditoría, Sitios y Temporales',
      },
      {
        id: 'auditorias.auditor',
        blockId: 'auditorias',
        labelEs: '3. Auditor',
        descriptionEs: 'Asignación de equipo evaluador por sitio/temporal/proceso y expertos técnicos.',
        targetFile: '06_datos_prueba.sql',
        tables: [
          'equipo_auditor_sitio',
          'equipo_auditor_sitio_temporal',
          'equipo_auditor_proceso_sitio',
          'experto_tecnico_auditoria',
        ],
        derivedTables: ['equipo_auditor'],
        cascadeSummaryEs:
          '3. Auditor incluye asignaciones por Sitio, Temporal, Proceso y Experto Técnico (equipo_auditor derivado por trigger)',
      },
      {
        id: 'auditorias.proceso',
        blockId: 'auditorias',
        labelEs: '4. Proceso',
        descriptionEs: 'Selección granular de procesos auditados por sitio en auditoría.',
        targetFile: '06_datos_prueba.sql',
        tables: ['procesos_sitio_auditoria'],
        cascadeSummaryEs: '4. Proceso incluye Procesos evaluados por Sitio en Auditoría',
      },
      {
        id: 'auditorias.turno',
        blockId: 'auditorias',
        labelEs: '5. Turno',
        descriptionEs: 'Turnos habilitados por sitio y asignados por proceso en auditoría.',
        targetFile: '06_datos_prueba.sql',
        tables: ['turnos_sitio_auditoria', 'turnos_proceso_sitio_auditoria'],
        cascadeSummaryEs: '5. Turno incluye Turnos por Sitio y Turnos por Proceso en Auditoría',
      },
      {
        id: 'auditorias.resultado',
        blockId: 'auditorias',
        labelEs: '6. Resultado',
        descriptionEs: 'Fechas reales discretas, hallazgos ISO, comentarios técnicos y cierre de ciclo.',
        targetFile: '06_datos_prueba.sql',
        tables: ['auditoria_fecha', 'auditoria', 'hallazgo', 'comentarios_por_auditoria'],
        cascadeSummaryEs:
          '6. Resultado incluye Fechas Reales, Hallazgos, Comentarios y Cierre de Auditoría',
      },
      {
        id: 'auditorias.revision',
        blockId: 'auditorias',
        labelEs: '7. Revisión',
        descriptionEs: 'Revisión técnica independiente QA y aprobación de documentación.',
        targetFile: '06_datos_prueba.sql',
        tables: ['auditoria'],
        cascadeSummaryEs: '7. Revisión actualiza metadatos de revisión QA en Auditorías',
      },
      {
        id: 'auditorias.resumen',
        blockId: 'auditorias',
        labelEs: 'Resumen',
        descriptionEs: 'Consolidado integral completo de todas las entidades de Bloque 1 Auditoría.',
        targetFile: '06_datos_prueba.sql',
        tables: ALL_AUDITORIAS_PRIMARY_TABLES,
        derivedTables: ['equipo_auditor'],
        cascadeSummaryEs:
          'Resumen incluye toda la cascada operativa de Auditoría (Programas, Fechas, Sitios, Temporales, Equipos, Procesos, Turnos, Hallazgos y Revisión)',
      },
    ],
  },
  {
    id: 'certificacion',
    order: 2,
    labelEs: 'Bloque 2 · Certificación',
    symbol: '🏛️',
    descriptionEs:
      'Conglomerados, organizaciones, certificados con su cascada operativa completa, cajas de vínculo, auditores y expertos técnicos.',
    sections: [
      {
        id: 'certificacion.conglomerado',
        blockId: 'certificacion',
        labelEs: 'Conglomerado',
        descriptionEs: 'Grupos empresariales corporativos y buckets individuales.',
        targetFile: '06_datos_prueba.sql',
        tables: ['grupo_empresarial'],
        cascadeSummaryEs: 'Conglomerado sincroniza Grupos Empresariales y abreviaciones',
      },
      {
        id: 'certificacion.organizacion',
        blockId: 'certificacion',
        labelEs: 'Organización',
        descriptionEs: 'Organizaciones titulares, historial versionado y accesos autorizados de clientes.',
        targetFile: '06_datos_prueba.sql',
        tables: ['organizacion', 'organizacion_version', 'client_organization_access'],
        cascadeSummaryEs:
          'Organización incluye Organizaciones, Versiones de Organización y Accesos Cliente',
      },
      {
        id: 'certificacion.certificado',
        blockId: 'certificacion',
        labelEs: 'Certificado',
        descriptionEs:
          'Certificados y toda su estructura hija: versiones, alcances, sitios, fechas, contactos, procesos, cláusulas y turnos.',
        targetFile: '06_datos_prueba.sql',
        tables: [
          'certificado',
          'certificado_version',
          'alcance',
          'alcance_certificado_compartido',
          'sitio',
          'sitio_certificado_compartido',
          'fecha_certificado',
          'contacto_certificado',
          'telefono_contacto_certificado',
          'email_contacto_certificado',
          'contacto_certificado_compartido',
          'proceso',
          'proceso_certificado_compartido',
          'procesos_por_sitio',
          'requisitos_por_proceso',
          'requisitos_no_aplicables_certificado',
          'turno',
          'turnos_por_sitio',
          'turno_certificado_compartido',
        ],
        cascadeSummaryEs:
          'Certificado incluye Versiones, Alcance, Sitios, Fechas, Contactos, Procesos, Cláusulas (requisitos_por_proceso), Exclusiones ISO 4.3, Turnos y Comparticiones',
      },
      {
        id: 'certificacion.vinculo',
        blockId: 'certificacion',
        labelEs: 'Vínculo',
        descriptionEs: 'Cajas agrupadoras operativas y membresías activas de certificados.',
        targetFile: '06_datos_prueba.sql',
        tables: ['vinculo', 'vinculo_certificado'],
        cascadeSummaryEs: 'Vínculo incluye Cajas Agrupadoras y Membresías de Certificados',
      },
      {
        id: 'certificacion.auditor',
        blockId: 'certificacion',
        labelEs: 'Auditor',
        descriptionEs:
          'Cuerpo de auditores técnicos, teléfonos, correos, evaluaciones in situ y matrices de competencia.',
        targetFile: '06_datos_prueba.sql',
        tables: [
          'auditor',
          'telefono_auditor',
          'email_auditor',
          'evaluacion_in_situ_auditor',
          'norma_auditor',
          'sector_iaf_auditor',
          'subsector_iaf_auditor',
        ],
        cascadeSummaryEs:
          'Auditor incluye Auditores, Teléfonos, Correos, Evaluaciones In Situ y Matrices (Norma, Sector y Sub-Sector IAF)',
      },
      {
        id: 'certificacion.experto',
        blockId: 'certificacion',
        labelEs: 'Experto',
        descriptionEs:
          'Catálogo de expertos técnicos, canales de contacto y competencias exclusivas IAF.',
        targetFile: '06_datos_prueba.sql',
        tables: [
          'experto_tecnico',
          'telefono_experto_tecnico',
          'email_experto_tecnico',
          'sector_iaf_experto',
          'subsector_iaf_experto',
        ],
        cascadeSummaryEs:
          'Experto incluye Expertos Técnicos, Teléfonos, Correos y Competencias Sector/Sub-Sector IAF',
      },
    ],
  },
  {
    id: 'extra',
    order: 3,
    labelEs: 'Bloque 3 · Extra',
    symbol: '📚',
    descriptionEs:
      'Catálogos normativos y paramétricos del sistema (incluyendo el caso especial de Normas en 07_normas_requisitos_csv.sql).',
    sections: [
      {
        id: 'extra.norma',
        blockId: 'extra',
        labelEs: 'Norma',
        descriptionEs:
          'Normas certificables, cláusulas jerárquicas LTREE y traducciones HTML ES/EN.',
        targetFile: '07_normas_requisitos_csv.sql',
        specialCase: 'NORMAS_CSV_SEED',
        tables: ['norma', 'requisito', 'requisito_traduccion'],
        cascadeSummaryEs:
          'Norma (Caso Especial → 07_normas_requisitos_csv.sql) incluye Normas, Cláusulas LTREE y Traducciones ES/EN',
      },
      {
        id: 'extra.sector_iaf',
        blockId: 'extra',
        labelEs: 'Sector IAF',
        descriptionEs: 'Sectores productivos y sub-sectores de acreditación IAF.',
        targetFile: '06_datos_prueba.sql',
        tables: ['sector_iaf', 'subsector_iaf'],
        cascadeSummaryEs: 'Sector IAF incluye Sectores y Sub-Sectores IAF',
      },
      {
        id: 'extra.acreditacion',
        blockId: 'extra',
        labelEs: 'Acreditación',
        descriptionEs: 'Organismos acreditadores, acreditaciones vigentes y alcance sectorial IAF.',
        targetFile: '06_datos_prueba.sql',
        tables: ['organismo_acreditacion', 'acreditacion_norma', 'acreditacion_norma_sector_iaf'],
        cascadeSummaryEs:
          'Acreditación incluye Organismos de Acreditación, Acreditaciones por Norma y Sectores IAF',
      },
      {
        id: 'extra.estatus',
        blockId: 'extra',
        labelEs: 'Estatus',
        descriptionEs: 'Catálogo maestro de estatus operativos.',
        targetFile: '06_datos_prueba.sql',
        tables: ['estatus'],
        cascadeSummaryEs: 'Estatus sincroniza estados operativos canónicos',
      },
      {
        id: 'extra.tipo',
        blockId: 'extra',
        labelEs: 'Tipo',
        descriptionEs: 'Tipos de auditoría y abreviaciones compactas.',
        targetFile: '06_datos_prueba.sql',
        tables: ['tipo_auditoria'],
        cascadeSummaryEs: 'Tipo sincroniza tipos de auditoría y abreviaciones',
      },
      {
        id: 'extra.metodologia',
        blockId: 'extra',
        labelEs: 'Metodología',
        descriptionEs: 'Modalidades de ejecución de auditoría (Presencial, Remota, Mixta).',
        targetFile: '06_datos_prueba.sql',
        tables: ['metodologia_auditoria'],
        cascadeSummaryEs: 'Metodología sincroniza modalidades de auditoría',
      },
    ],
  },
];

const BLOCK_BY_ID = new Map<SqlSeedBlockId, SqlSeedBlockSpec>(
  SQL_SEED_SYNC_BLOCKS.map((block) => [block.id, block])
);

const ALL_SECTIONS: readonly SqlSeedSectionSpec[] = SQL_SEED_SYNC_BLOCKS.flatMap(
  (block) => block.sections
);

const SECTION_BY_ID = new Map<string, SqlSeedSectionSpec>(
  ALL_SECTIONS.map((section) => [section.id, section])
);

export function getAllSyncSectionSpecs(): readonly SqlSeedSectionSpec[] {
  return ALL_SECTIONS;
}

export function getSyncBlockSpec(blockId: SqlSeedBlockId): SqlSeedBlockSpec | null {
  return BLOCK_BY_ID.get(blockId) ?? null;
}

export function getSyncSectionSpec(sectionId: string): SqlSeedSectionSpec | null {
  return SECTION_BY_ID.get(sectionId) ?? null;
}

export function getSyncTableMetadata(tableName: string): SqlSyncTableMetadata | null {
  return SQL_SYNC_TABLE_METADATA[tableName] ?? null;
}

export function sortTablesTopologically(tableNames: Iterable<string>): string[] {
  const unique = Array.from(new Set(tableNames)).filter((name) => TOPO_INDEX_BY_TABLE.has(name));
  return unique.sort((a, b) => {
    const idxA = TOPO_INDEX_BY_TABLE.get(a) ?? Number.MAX_SAFE_INTEGER;
    const idxB = TOPO_INDEX_BY_TABLE.get(b) ?? Number.MAX_SAFE_INTEGER;
    return idxA - idxB;
  });
}

function collectTransitiveFkParents(
  seedTables: Iterable<string>,
  targetFileFilter: SqlSeedTargetFile
): Set<string> {
  const visited = new Set<string>();
  const queue: string[] = [];

  for (const table of seedTables) {
    if (SQL_SYNC_TABLE_METADATA[table]) {
      visited.add(table);
      queue.push(table);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const meta = SQL_SYNC_TABLE_METADATA[current];
    if (!meta) continue;

    for (const fk of meta.fkDependencies) {
      if (fk.selfReferential || fk.externalManagedIn05Usuarios) continue;
      const parentMeta = SQL_SYNC_TABLE_METADATA[fk.targetTable];
      if (!parentMeta) continue;
      if (parentMeta.targetFile !== targetFileFilter) continue;
      if (!visited.has(fk.targetTable)) {
        visited.add(fk.targetTable);
        queue.push(fk.targetTable);
      }
    }
  }

  return visited;
}

/**
 * Resuelve la selección de secciones (individuales o por bloque completo) hacia un plan
 * ordenado topológicamente, distinguiendo tablas objetivo primarias, dependencias de soporte FK,
 * tablas derivadas por triggers y el caso especial `07_normas_requisitos_csv.sql`.
 */
export function resolveSyncSelectionPlan(
  selectedSectionIds: readonly string[],
  options?: ResolveSyncSelectionOptions
): ResolvedSyncSelectionPlan {
  const includeParentFkDependencies = options?.includeParentFkDependencies !== false;

  const validSelectedIds: string[] = [];
  const seenSelected = new Set<string>();

  for (const rawId of selectedSectionIds) {
    const trimmed = typeof rawId === 'string' ? rawId.trim() : '';
    if (!trimmed || seenSelected.has(trimmed)) continue;
    if (!SECTION_BY_ID.has(trimmed)) {
      throw new Error(`Sección de sincronización SQL desconocida: "${trimmed}".`);
    }
    seenSelected.add(trimmed);
    validSelectedIds.push(trimmed);
  }

  // Si se selecciona `auditorias.resumen`, equivale a cubrir todo el bloque 1 en detalle.
  const expandedSet = new Set<string>(validSelectedIds);
  if (expandedSet.has('auditorias.resumen')) {
    const auditoriasBlock = BLOCK_BY_ID.get('auditorias');
    if (auditoriasBlock) {
      for (const sec of auditoriasBlock.sections) {
        expandedSet.add(sec.id);
      }
    }
  }

  const expandedSectionIds = ALL_SECTIONS.filter((sec) => expandedSet.has(sec.id)).map(
    (sec) => sec.id
  );

  const primarySet = new Set<string>();
  const derivedSet = new Set<string>();
  const primary06Set = new Set<string>();
  const primary07Set = new Set<string>();
  const cascadeSummaries: ResolvedSyncSelectionPlan['cascadeSummaries'] = [];

  for (const sectionId of expandedSectionIds) {
    const section = SECTION_BY_ID.get(sectionId);
    if (!section) continue;
    for (const table of section.tables) {
      primarySet.add(table);
      const meta = SQL_SYNC_TABLE_METADATA[table];
      if (meta?.targetFile === '07_normas_requisitos_csv.sql') {
        primary07Set.add(table);
      } else {
        primary06Set.add(table);
      }
    }
    if (section.derivedTables) {
      for (const derived of section.derivedTables) {
        derivedSet.add(derived);
      }
    }
    if (seenSelected.has(section.id)) {
      cascadeSummaries.push({
        sectionId: section.id,
        labelEs: section.labelEs,
        summaryEs: section.cascadeSummaryEs,
        targetFile: section.targetFile,
      });
    }
  }

  const fkSupportSet = new Set<string>();
  if (includeParentFkDependencies) {
    const closure06 = collectTransitiveFkParents(primary06Set, '06_datos_prueba.sql');
    for (const table of closure06) {
      if (!primarySet.has(table)) {
        fkSupportSet.add(table);
      }
    }

    const closure07 = collectTransitiveFkParents(primary07Set, '07_normas_requisitos_csv.sql');
    for (const table of closure07) {
      if (!primarySet.has(table)) {
        fkSupportSet.add(table);
      }
    }
  }

  const tablesFor06 = sortTablesTopologically([...primary06Set, ...fkSupportSet].filter((t) => {
    const meta = SQL_SYNC_TABLE_METADATA[t];
    return meta?.targetFile === '06_datos_prueba.sql';
  }));

  const tablesFor07 = sortTablesTopologically(
    [...primary07Set, ...fkSupportSet].filter((t) => {
      const meta = SQL_SYNC_TABLE_METADATA[t];
      return meta?.targetFile === '07_normas_requisitos_csv.sql';
    })
  );

  const targetFiles: SqlSeedTargetFile[] = [];
  if (tablesFor06.length > 0) targetFiles.push('06_datos_prueba.sql');
  if (tablesFor07.length > 0) targetFiles.push('07_normas_requisitos_csv.sql');

  const selectedBlocksComplete: SqlSeedBlockId[] = SQL_SEED_SYNC_BLOCKS.filter((block) =>
    block.sections.every((sec) => expandedSet.has(sec.id))
  ).map((block) => block.id);

  return {
    selectedSectionIds: validSelectedIds,
    expandedSectionIds,
    selectedBlocksComplete,
    targetFiles,
    primaryTables: sortTablesTopologically(primarySet),
    fkSupportTables: sortTablesTopologically(fkSupportSet),
    derivedTables: sortTablesTopologically(derivedSet),
    tablesFor06,
    tablesFor07,
    hasSpecialNormasCase: seenSelected.has('extra.norma'),
    cascadeSummaries,
  };
}
