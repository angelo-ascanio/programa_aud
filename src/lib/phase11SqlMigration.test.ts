import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const QUERIES_DIR = path.resolve(process.cwd(), 'public', 'supabase', 'queries');

function readSql(fileName: string): string {
  return fs.readFileSync(path.join(QUERIES_DIR, fileName), 'utf8');
}

function extractTableBlock(sql: string, tableName: string): string {
  const escaped = tableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `CREATE TABLE IF NOT EXISTS (?:public\\.)?${escaped}\\s*\\(([\\s\\S]*?)\\n\\);`,
    'i'
  );
  const match = sql.match(pattern);
  assert.ok(match, `Missing CREATE TABLE block for ${tableName}`);
  return match[1];
}

function extractFunctionBlock(sql: string, fnName: string): string {
  const escaped = fnName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${escaped}\\s*\\([\\s\\S]*?\\n\\$\\$;`,
    'i'
  );
  const match = sql.match(pattern);
  assert.ok(match, `Missing CREATE OR REPLACE FUNCTION block for ${fnName}`);
  return match[0];
}

const CORE_TABLES = [
  'norma',
  'requisito',
  'sector_iaf',
  'subsector_iaf',
  'organismo_acreditacion',
  'acreditacion_norma',
  'estatus',
  'tipo_auditoria',
  'metodologia_auditoria',
  'auditor',
  'organizacion',
  'certificado',
  'sitio',
  'proceso',
  'turno',
  'programa_auditoria',
  'auditoria',
  'hallazgo',
] as const;

const OPERATIONAL_CHILD_TABLES = [
  'acreditacion_norma_sector_iaf',
  'requisitos_no_aplicables_certificado',
  'turnos_por_sitio',
  'procesos_por_sitio',
  'auditoria_fecha',
  'configuracion_alerta_auditoria',
  'comentarios_por_auditoria',
  'sitios_por_auditoria',
  'turnos_sitio_auditoria',
  'procesos_sitio_auditoria',
  'turnos_proceso_sitio_auditoria',
  'equipo_auditor_sitio',
  'equipo_auditor_proceso_sitio',
] as const;

test('Phase 1.1: all core tables and operational child tables declare soft-delete columns in 01_creacion.sql', () => {
  const sql01 = readSql('01_creacion.sql');

  for (const table of CORE_TABLES) {
    const block = extractTableBlock(sql01, table);
    assert.match(block, /\bdeleted_at\s+TIMESTAMPTZ\s+DEFAULT\s+NULL/i, `${table} missing deleted_at`);
    assert.match(
      block,
      /\bdeleted_by\s+UUID\s+REFERENCES\s+auth\.users\(id\)\s+ON DELETE SET NULL/i,
      `${table} missing deleted_by`
    );
    assert.match(block, /\bdelete_reason\s+TEXT/i, `${table} missing delete_reason`);
  }

  for (const table of OPERATIONAL_CHILD_TABLES) {
    const block = extractTableBlock(sql01, table);
    assert.match(block, /\bdeleted_at\s+TIMESTAMPTZ\s+DEFAULT\s+NULL/i, `${table} missing deleted_at`);
    assert.match(
      block,
      /\bdeleted_by\s+UUID\s+REFERENCES\s+auth\.users\(id\)\s+ON DELETE SET NULL/i,
      `${table} missing deleted_by`
    );
  }

  const clientAccessBlock = extractTableBlock(sql01, 'client_organization_access');
  assert.match(clientAccessBlock, /\bdeleted_at\s+TIMESTAMPTZ\s+DEFAULT\s+NULL/i);
  assert.match(
    clientAccessBlock,
    /\bdeleted_by\s+UUID\s+REFERENCES\s+auth\.users\(id\)\s+ON DELETE SET NULL/i
  );
});

test('Phase 1.1: mutable business-key tables remove global UNIQUE constraints from 01_creacion.sql and define partial unique indexes in 03_indices_optimizacion.sql', () => {
  const sql01 = readSql('01_creacion.sql');
  const sql03 = readSql('03_indices_optimizacion.sql');

  const tablesWithoutGlobalUnique = [
    'norma',
    'requisito',
    'sector_iaf',
    'subsector_iaf',
    'organismo_acreditacion',
    'estatus',
    'tipo_auditoria',
    'metodologia_auditoria',
    'certificado',
    'sitio',
    'proceso',
    'requisitos_no_aplicables_certificado',
    'turno',
    'turnos_por_sitio',
    'sitios_por_auditoria',
  ];

  for (const table of tablesWithoutGlobalUnique) {
    const block = extractTableBlock(sql01, table);
    assert.doesNotMatch(
      block,
      /\bUNIQUE\b/i,
      `${table} should not retain a global UNIQUE constraint in 01_creacion.sql`
    );
  }

  const expectedPartialUniqueIndexes = [
    'uq_norma_codigo_active ON public.norma (codigo) WHERE deleted_at IS NULL',
    'uq_requisito_norma_codigo_active ON public.requisito (id_norma, codigo) WHERE deleted_at IS NULL',
    'uq_sector_iaf_numero_active ON public.sector_iaf (sector) WHERE deleted_at IS NULL',
    'uq_subsector_codigo_active ON public.subsector_iaf (codigo) WHERE deleted_at IS NULL',
    'uq_organismo_codigo_active ON public.organismo_acreditacion (codigo) WHERE deleted_at IS NULL',
    'uq_estatus_nombre_active ON public.estatus (estatus) WHERE deleted_at IS NULL',
    'uq_tipo_auditoria_nombre_active ON public.tipo_auditoria (tipo) WHERE deleted_at IS NULL',
    'uq_metodologia_nombre_active ON public.metodologia_auditoria (metodologia) WHERE deleted_at IS NULL',
    'uq_certificado_numero_active ON public.certificado (numero_certificado) WHERE deleted_at IS NULL',
    'uq_sitio_cert_numero_active ON public.sitio (id_certificado, numero_sitio) WHERE deleted_at IS NULL',
    'uq_proceso_cert_nombre_active ON public.proceso (id_certificado, nombre_proceso) WHERE deleted_at IS NULL',
    'uq_req_no_aplicable_cert_req_active ON public.requisitos_no_aplicables_certificado (id_certificado, id_requisito) WHERE deleted_at IS NULL',
    'uq_turno_horario_active ON public.turno (hora_entrada, hora_salida) WHERE deleted_at IS NULL',
    'uq_turnos_por_sitio_active ON public.turnos_por_sitio (id_sitio, id_turno) WHERE deleted_at IS NULL',
    'uq_sitios_por_auditoria_active ON public.sitios_por_auditoria (id_auditoria, id_sitio) WHERE deleted_at IS NULL',
  ];

  for (const idxDef of expectedPartialUniqueIndexes) {
    assert.ok(
      sql03.includes(`CREATE UNIQUE INDEX IF NOT EXISTS ${idxDef};`),
      `Missing partial unique index: ${idxDef}`
    );
  }
});

test('Phase 1.1: retention, RBAC guard, dependency summary RPC, and archival triggers are properly implemented in 01_creacion.sql', () => {
  const sql01 = readSql('01_creacion.sql');

  const preventFn = extractFunctionBlock(sql01, 'fn_prevent_hard_delete');
  assert.match(preventFn, /Operación bloqueada: la tabla public\.% utiliza retención lógica/i);

  const syncFn = extractFunctionBlock(sql01, 'fn_sync_soft_delete_metadata');
  assert.match(syncFn, /NEW\.deleted_by\s*:=\s*COALESCE\(NEW\.deleted_by,\s*auth\.uid\(\)\)/i);
  assert.match(syncFn, /NEW\.delete_reason\s*:=\s*NULL/i);
  assert.doesNotMatch(syncFn, /jsonb_populate_record/i);

  const syncChildFn = extractFunctionBlock(sql01, 'fn_sync_soft_delete_child_metadata');
  assert.match(syncChildFn, /NEW\.deleted_by\s*:=\s*COALESCE\(NEW\.deleted_by,\s*auth\.uid\(\)\)/i);
  assert.doesNotMatch(syncChildFn, /delete_reason/i);

  const rbacFn = extractFunctionBlock(sql01, 'fn_protect_profile_rbac_fields');
  assert.match(rbacFn, /session_user IN \('postgres', 'supabase_admin', 'service_role'\)/i);
  assert.doesNotMatch(rbacFn, /\bcurrent_user\b/i);
  assert.match(rbacFn, /NOT public\.is_approved_admin\(\)/i);
  assert.match(rbacFn, /NEW\.role IS DISTINCT FROM OLD\.role OR NEW\.status IS DISTINCT FROM OLD\.status/i);

  const summaryFn = extractFunctionBlock(sql01, 'get_archive_dependency_summary');
  for (const parentCase of [
    'organizacion',
    'certificado',
    'sitio',
    'proceso',
    'turno',
    'auditoria',
    'norma',
    'requisito',
    'sector_iaf',
    'organismo_acreditacion',
    'estatus',
    'tipo_auditoria',
    'metodologia_auditoria',
  ]) {
    assert.ok(summaryFn.includes(`WHEN '${parentCase}' THEN`), `Missing dependency case for ${parentCase}`);
  }
  assert.match(summaryFn, /v_sitio_numero = 0[\s\S]*numero_sitio > 0[\s\S]*deleted_at IS NULL/i);

  // Confirm all 17 core tables + profiles + 6 child tables are wired to audit_trigger_func()
  const auditedTables = [...CORE_TABLES, ...OPERATIONAL_CHILD_TABLES, 'profiles', 'client_organization_access'];
  for (const table of auditedTables) {
    const hasExplicitTrigger = new RegExp(`ON public\\.${table}\\s+FOR EACH ROW EXECUTE FUNCTION public\\.audit_trigger_func`, 'i').test(sql01);
    const hasLoopTrigger = sql01.includes(`'${table}'`) && sql01.includes(`CREATE TRIGGER audit_%I_trigger`);
    assert.ok(hasExplicitTrigger || hasLoopTrigger, `Missing audit_trigger_func() wiring for ${table}`);
  }
});

test('Phase 1.1: 02_cobertura_normativa.sql excludes archived records in all 4 LTREE and competence functions', () => {
  const sql02 = readSql('02_cobertura_normativa.sql');

  const evaluarFn = extractFunctionBlock(sql02, 'evaluar_cobertura_certificado');
  assert.match(evaluarFn, /c\.deleted_at IS NULL/i);
  assert.match(evaluarFn, /n\.deleted_at IS NULL/i);
  assert.match(evaluarFn, /p\.deleted_at IS NULL/i);
  assert.match(evaluarFn, /req\.deleted_at IS NULL/i);
  assert.match(evaluarFn, /rna\.deleted_at IS NULL/i);
  assert.match(evaluarFn, /r_all\.deleted_at IS NULL/i);

  const calificadoFn = extractFunctionBlock(sql02, 'auditor_esta_calificado');
  assert.match(calificadoFn, /a\.deleted_at IS NULL/i);
  assert.match(calificadoFn, /n\.deleted_at IS NULL/i);
  assert.match(calificadoFn, /s\.deleted_at IS NULL/i);
  assert.match(calificadoFn, /ss\.deleted_at IS NULL/i);

  const calificadosCertFn = extractFunctionBlock(sql02, 'auditores_calificados_para_certificado');
  assert.match(calificadosCertFn, /c\.deleted_at IS NULL/i);
  assert.match(calificadosCertFn, /n\.deleted_at IS NULL/i);
  assert.match(calificadosCertFn, /s\.deleted_at IS NULL/i);
  assert.match(calificadosCertFn, /a\.deleted_at IS NULL/i);
});

test('Phase 1.1: 06_datos_prueba.sql matches partial unique indexes with WHERE deleted_at IS NULL', () => {
  const sql06 = readSql('06_datos_prueba.sql');

  const expectedConflictPredicates = [
    'ON CONFLICT (estatus) WHERE deleted_at IS NULL',
    'ON CONFLICT (tipo) WHERE deleted_at IS NULL',
    'ON CONFLICT (metodologia) WHERE deleted_at IS NULL',
    'ON CONFLICT (sector) WHERE deleted_at IS NULL',
    'ON CONFLICT (codigo) WHERE deleted_at IS NULL',
    'ON CONFLICT (numero_certificado) WHERE deleted_at IS NULL',
    'ON CONFLICT (id_certificado, numero_sitio) WHERE deleted_at IS NULL',
    'ON CONFLICT (hora_entrada, hora_salida) WHERE deleted_at IS NULL',
    'ON CONFLICT (id_sitio, id_turno) WHERE deleted_at IS NULL',
    'ON CONFLICT (id_certificado, nombre_proceso) WHERE deleted_at IS NULL',
    'ON CONFLICT (id_certificado, id_requisito) WHERE deleted_at IS NULL',
    'ON CONFLICT (id_auditoria, id_sitio) WHERE deleted_at IS NULL',
  ];

  for (const clause of expectedConflictPredicates) {
    assert.ok(sql06.includes(clause), `Missing partial ON CONFLICT predicate in 06_datos_prueba.sql: ${clause}`);
  }
});

test('Step 2.1: certificado.id_subsector_iaf and the 4 certificado sub-entity tables follow soft-delete, trigger, index, and seed contracts', () => {
  const sql01 = readSql('01_creacion.sql');
  const sql03 = readSql('03_indices_optimizacion.sql');
  const sql06 = readSql('06_datos_prueba.sql');

  const certBlock = extractTableBlock(sql01, 'certificado');
  assert.match(
    certBlock,
    /\bid_subsector_iaf\s+UUID\s+NOT NULL\s+REFERENCES\s+subsector_iaf\(id\)\s+ON DELETE RESTRICT/i
  );

  const fechaBlock = extractTableBlock(sql01, 'fecha_certificado');
  assert.match(fechaBlock, /\bid_certificado\s+UUID\s+NOT NULL\s+REFERENCES\s+certificado\(id\)\s+ON DELETE CASCADE/i);
  assert.match(fechaBlock, /'Otorgamiento'[\s\S]*'Renovación'[\s\S]*'Vencimiento'[\s\S]*'Modificación'[\s\S]*'Suspensión'[\s\S]*'Cancelación'[\s\S]*'Ultima Auditoría'/);
  assert.match(fechaBlock, /\bdelete_reason\s+TEXT/i);

  const contactoBlock = extractTableBlock(sql01, 'contacto_certificado');
  assert.match(contactoBlock, /\bid_certificado\s+UUID\s+NOT NULL\s+REFERENCES\s+certificado\(id\)\s+ON DELETE CASCADE/i);
  assert.match(contactoBlock, /\bnombre\s+VARCHAR\(180\)\s+NOT NULL/i);
  assert.match(contactoBlock, /\bdelete_reason\s+TEXT/i);

  for (const child of ['telefono_contacto_certificado', 'email_contacto_certificado']) {
    const childBlock = extractTableBlock(sql01, child);
    assert.match(childBlock, /\bid_contacto\s+UUID\s+NOT NULL\s+REFERENCES\s+contacto_certificado\(id\)\s+ON DELETE CASCADE/i);
    assert.match(childBlock, /\bdeleted_at\s+TIMESTAMPTZ\s+DEFAULT\s+NULL/i);
    assert.match(childBlock, /\bdeleted_by\s+UUID\s+REFERENCES\s+auth\.users\(id\)\s+ON DELETE SET NULL/i);
  }

  for (const tbl of [
    'fecha_certificado',
    'contacto_certificado',
    'telefono_contacto_certificado',
    'email_contacto_certificado',
  ]) {
    assert.ok(sql01.includes(`update_${tbl}_modtime`), `Missing modtime trigger for ${tbl}`);
    assert.ok(sql01.includes(`'${tbl}'`), `Missing ${tbl} trigger array registration in 01_creacion.sql`);
  }

  // Verify trigger templates & explicit membership in v_core_tables, v_child_tables, v_guarded_parents, and v_extra_audit_tables
  assert.ok(sql01.includes('trg_prevent_hard_delete_%I'));
  assert.ok(sql01.includes('trg_sync_soft_delete_%I'));
  assert.ok(sql01.includes('trg_guard_archival_%I'));
  assert.ok(sql01.includes('audit_%I_trigger'));

  const coreArrMatch = sql01.match(/v_core_tables TEXT\[\] := ARRAY\[([\s\S]*?)\];/);
  assert.ok(coreArrMatch);
  assert.ok(coreArrMatch[1].includes("'fecha_certificado'"));
  assert.ok(coreArrMatch[1].includes("'contacto_certificado'"));

  const childArrMatch = sql01.match(/v_child_tables TEXT\[\] := ARRAY\[([\s\S]*?)\];/);
  assert.ok(childArrMatch);
  assert.ok(childArrMatch[1].includes("'telefono_contacto_certificado'"));
  assert.ok(childArrMatch[1].includes("'email_contacto_certificado'"));

  const guardedArrMatch = sql01.match(/v_guarded_parents TEXT\[\] := ARRAY\[([\s\S]*?)\];/);
  assert.ok(guardedArrMatch);
  assert.ok(guardedArrMatch[1].includes("'contacto_certificado'"));
  assert.ok(guardedArrMatch[1].includes("'subsector_iaf'"));

  const auditArrMatch = sql01.match(/v_extra_audit_tables TEXT\[\] := ARRAY\[([\s\S]*?)\];/);
  assert.ok(auditArrMatch);
  for (const tbl of [
    'fecha_certificado',
    'contacto_certificado',
    'telefono_contacto_certificado',
    'email_contacto_certificado',
  ]) {
    assert.ok(auditArrMatch[1].includes(`'${tbl}'`), `Missing ${tbl} in v_extra_audit_tables`);
  }

  const summaryFn = extractFunctionBlock(sql01, 'get_archive_dependency_summary');
  assert.ok(summaryFn.includes("WHEN 'contacto_certificado' THEN"));
  assert.ok(summaryFn.includes("WHEN 'subsector_iaf' THEN"));
  assert.match(summaryFn, /FROM public\.fecha_certificado WHERE id_certificado = p_record_id AND deleted_at IS NULL/i);
  assert.match(summaryFn, /FROM public\.contacto_certificado WHERE id_certificado = p_record_id AND deleted_at IS NULL/i);
  assert.match(summaryFn, /FROM public\.certificado WHERE id_subsector_iaf = p_record_id AND deleted_at IS NULL/i);

  for (const idxDef of [
    'CREATE INDEX IF NOT EXISTS idx_certificado_subsector_iaf ON public.certificado (id_subsector_iaf) WHERE deleted_at IS NULL;',
    'CREATE UNIQUE INDEX IF NOT EXISTS uq_fecha_certificado_tipo_fecha_active ON public.fecha_certificado (id_certificado, tipo_fecha, fecha) WHERE deleted_at IS NULL;',
    'CREATE UNIQUE INDEX IF NOT EXISTS uq_contacto_certificado_nombre_active ON public.contacto_certificado (id_certificado, LOWER(TRIM(nombre))) WHERE deleted_at IS NULL;',
    'CREATE UNIQUE INDEX IF NOT EXISTS uq_telefono_contacto_active ON public.telefono_contacto_certificado (id_contacto, TRIM(telefono)) WHERE deleted_at IS NULL;',
    'CREATE UNIQUE INDEX IF NOT EXISTS uq_email_contacto_active ON public.email_contacto_certificado (id_contacto, LOWER(TRIM(email))) WHERE deleted_at IS NULL;',
  ]) {
    assert.ok(sql03.includes(idxDef), `Missing Step 2.1 index: ${idxDef}`);
  }

  assert.ok(sql06.includes('id_subsector_iaf'));
  assert.ok(sql06.includes("'da000000-0000-0000-0000-000000000171'"));
  for (const clause of [
    'ON CONFLICT (id_certificado, tipo_fecha, fecha) WHERE deleted_at IS NULL',
    'ON CONFLICT (id_certificado, LOWER(TRIM(nombre))) WHERE deleted_at IS NULL',
    'ON CONFLICT (id_contacto, TRIM(telefono)) WHERE deleted_at IS NULL',
    'ON CONFLICT (id_contacto, LOWER(TRIM(email))) WHERE deleted_at IS NULL',
  ]) {
    assert.ok(sql06.includes(clause), `Missing Step 2.1 seed ON CONFLICT clause: ${clause}`);
  }
});

test('Accreditation Refactoring: sector_iaf.descripcion, acreditacion_norma (id_estatus FK), and acreditacion_norma_sector_iaf follow schema, index, trigger, and seed contracts', () => {
  const sql01 = readSql('01_creacion.sql');
  const sql03 = readSql('03_indices_optimizacion.sql');
  const sql06 = readSql('06_datos_prueba.sql');

  const sectorBlock = extractTableBlock(sql01, 'sector_iaf');
  assert.match(sectorBlock, /\bdescripcion\s+TEXT\s+NOT NULL/i);

  const accredBlock = extractTableBlock(sql01, 'acreditacion_norma');
  assert.match(
    accredBlock,
    /\bid_estatus\s+UUID\s+NOT NULL\s+REFERENCES\s+estatus\(id\)\s+ON DELETE RESTRICT/i
  );
  assert.doesNotMatch(accredBlock, /\bid_sector_iaf\b/i);

  const linkBlock = extractTableBlock(sql01, 'acreditacion_norma_sector_iaf');
  assert.match(
    linkBlock,
    /\bid_acreditacion_norma\s+UUID\s+NOT NULL\s+REFERENCES\s+acreditacion_norma\(id\)\s+ON DELETE CASCADE/i
  );
  assert.match(
    linkBlock,
    /\bid_sector_iaf\s+UUID\s+NOT NULL\s+REFERENCES\s+sector_iaf\(id\)\s+ON DELETE RESTRICT/i
  );

  const summaryFn = extractFunctionBlock(sql01, 'get_archive_dependency_summary');
  assert.ok(summaryFn.includes("WHEN 'acreditacion_norma' THEN"));
  assert.match(summaryFn, /FROM public\.acreditacion_norma WHERE id_estatus = p_record_id AND deleted_at IS NULL/i);
  assert.match(summaryFn, /FROM public\.acreditacion_norma_sector_iaf WHERE id_sector_iaf = p_record_id AND deleted_at IS NULL/i);

  assert.ok(
    sql03.includes(
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_acreditacion_sector_active ON public.acreditacion_norma_sector_iaf (id_acreditacion_norma, id_sector_iaf) WHERE deleted_at IS NULL;'
    )
  );
  assert.ok(sql06.includes('INSERT INTO public.acreditacion_norma'));
  assert.ok(sql06.includes('INSERT INTO public.acreditacion_norma_sector_iaf'));
  assert.ok(
    sql06.includes('ON CONFLICT (id_acreditacion_norma, id_sector_iaf) WHERE deleted_at IS NULL')
  );
});

test('Step 1.1: requisito extensions (explicit_code, external_key), requisito_traduccion table, soft-delete/audit triggers, and indexes follow Step 1.1 spec', () => {
  const sql01 = readSql('01_creacion.sql');
  const sql03 = readSql('03_indices_optimizacion.sql');

  const reqBlock = extractTableBlock(sql01, 'requisito');
  assert.match(reqBlock, /\bexplicit_code\s+BOOLEAN\s+NOT NULL\s+DEFAULT\s+FALSE/i);
  assert.match(reqBlock, /\bexternal_key\s+VARCHAR\(100\)\s+NULL/i);
  assert.doesNotMatch(reqBlock, /\bUNIQUE\b/i);

  assert.match(
    sql01,
    /ALTER TABLE public\.requisito\s+ADD COLUMN IF NOT EXISTS explicit_code BOOLEAN NOT NULL DEFAULT FALSE;/i
  );
  assert.match(
    sql01,
    /ALTER TABLE public\.requisito\s+ADD COLUMN IF NOT EXISTS external_key VARCHAR\(100\) NULL;/i
  );

  const transBlock = extractTableBlock(sql01, 'requisito_traduccion');
  assert.match(transBlock, /\bid\s+UUID\s+PRIMARY KEY\s+DEFAULT\s+uuid_generate_v4\(\)/i);
  assert.match(
    transBlock,
    /\bid_requisito\s+UUID\s+NOT NULL\s+REFERENCES\s+public\.requisito\(id\)\s+ON DELETE CASCADE/i
  );
  assert.match(transBlock, /\blang\s+VARCHAR\(5\)\s+NOT NULL\s+CHECK\s*\(lang IN \('es', 'en'\)\)/i);
  assert.match(transBlock, /\btitle\s+VARCHAR\(500\)\s+NOT NULL\s+DEFAULT\s+''/i);
  assert.match(transBlock, /\bcontent_html\s+TEXT\s+NOT NULL\s+DEFAULT\s+''/i);
  assert.match(transBlock, /\bcreated_at\s+TIMESTAMPTZ\s+NOT NULL\s+DEFAULT\s+NOW\(\)/i);
  assert.match(transBlock, /\bupdated_at\s+TIMESTAMPTZ\s+NOT NULL\s+DEFAULT\s+NOW\(\)/i);
  assert.match(transBlock, /\bdeleted_at\s+TIMESTAMPTZ\s+DEFAULT\s+NULL/i);
  assert.match(
    transBlock,
    /\bdeleted_by\s+UUID\s+REFERENCES\s+auth\.users\(id\)\s+ON DELETE SET NULL/i
  );
  assert.doesNotMatch(transBlock, /\bUNIQUE\b/i);

  assert.ok(sql01.includes('DROP TRIGGER IF EXISTS update_requisito_traduccion_modtime ON public.requisito_traduccion;'));
  assert.ok(
    sql01.includes(
      'CREATE TRIGGER update_requisito_traduccion_modtime BEFORE UPDATE ON public.requisito_traduccion FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();'
    )
  );

  const childArrays = [...sql01.matchAll(/v_child_tables TEXT\[\] := ARRAY\[([\s\S]*?)\];/g)];
  assert.ok(childArrays.length >= 2, 'Expected both idempotent column and trigger v_child_tables blocks');
  for (const match of childArrays) {
    assert.ok(
      match[1].includes("'requisito_traduccion'"),
      'Missing requisito_traduccion in v_child_tables'
    );
  }

  const auditArrMatch = sql01.match(/v_extra_audit_tables TEXT\[\] := ARRAY\[([\s\S]*?)\];/);
  assert.ok(auditArrMatch);
  assert.ok(
    auditArrMatch[1].includes("'requisito_traduccion'"),
    'Missing requisito_traduccion in v_extra_audit_tables'
  );

  for (const idxDef of [
    'CREATE UNIQUE INDEX IF NOT EXISTS uq_requisito_external_key_active ON public.requisito (external_key) WHERE external_key IS NOT NULL AND deleted_at IS NULL;',
    'CREATE UNIQUE INDEX IF NOT EXISTS uq_requisito_traduccion_lang_active ON public.requisito_traduccion (id_requisito, lang) WHERE deleted_at IS NULL;',
    'CREATE INDEX IF NOT EXISTS idx_requisito_traduccion_lookup ON public.requisito_traduccion (id_requisito, lang) WHERE deleted_at IS NULL;',
  ]) {
    assert.ok(sql03.includes(idxDef), `Missing Step 1.1 index: ${idxDef}`);
  }
});

test('Step 1.2: 02_cobertura_normativa.sql and 01_creacion.sql enforce downward LTREE coverage, summary RPC, exclusion guard, and Smart-Mutation trigger', () => {
  const sql01 = readSql('01_creacion.sql');
  const sql02 = readSql('02_cobertura_normativa.sql');

  const evaluarFn = extractFunctionBlock(sql02, 'evaluar_cobertura_certificado');
  assert.match(evaluarFn, /\bSECURITY INVOKER\b/i);
  assert.doesNotMatch(evaluarFn, /\bSECURITY DEFINER\b/i);
  assert.match(evaluarFn, /r_all\.ruta_materializada\s*<@\s*ed\.ruta_materializada/i);
  assert.match(evaluarFn, /r_all\.ruta_materializada\s*<@\s*pd\.ruta_materializada/i);
  assert.match(evaluarFn, /WHEN ss\.in_e_eff THEN 'NO_APLICABLE'/i);
  assert.match(evaluarFn, /WHEN ss\.in_c_eff THEN 'CUBIERTO'/i);
  assert.match(evaluarFn, /WHEN req\.es_obligatorio = FALSE THEN/i);
  for (const status of ['INFORMATIVA', 'MIXTO', 'CUBIERTO', 'NO_APLICABLE', 'PARCIAL', 'PENDIENTE']) {
    assert.ok(evaluarFn.includes(`'${status}'`), `Missing ${status} state in evaluar_cobertura_certificado`);
  }

  const wrapperFn = extractFunctionBlock(sql02, 'cobertura_normativa_certificado');
  assert.match(wrapperFn, /\bSECURITY INVOKER\b/i);
  assert.doesNotMatch(wrapperFn, /\bSECURITY DEFINER\b/i);

  const resumenFn = extractFunctionBlock(sql02, 'resumen_cobertura_certificado');
  assert.match(resumenFn, /\bSECURITY INVOKER\b/i);
  assert.doesNotMatch(resumenFn, /\bSECURITY DEFINER\b/i);
  for (const col of [
    'id_certificado UUID',
    'total_obligatorios INTEGER',
    'cubiertos_por_proceso INTEGER',
    'excluidos_no_aplicables INTEGER',
    'pendientes INTEGER',
    'porcentaje_cobertura NUMERIC(5,2)',
    'cobertura_completa BOOLEAN',
  ]) {
    assert.ok(resumenFn.includes(col), `Missing return column ${col} in resumen_cobertura_certificado`);
  }
  assert.match(resumenFn, /r\.es_obligatorio = TRUE/i);
  assert.match(resumenFn, /\(a\.pendientes = 0\) AS cobertura_completa/i);

  const guardFn = extractFunctionBlock(sql01, 'fn_guard_req_proceso_against_exclusion');
  assert.match(guardFn, /IF v_req_norma IS DISTINCT FROM v_cert_norma THEN/i);
  assert.match(guardFn, /v_req_path\s*<@\s*r_excl\.ruta_materializada/i);
  assert.match(guardFn, /REQ_EXCLUDED_BY_ISO43/i);
  assert.match(guardFn, /USING ERRCODE = 'P0001'/i);
  assert.match(
    sql01,
    /CREATE TRIGGER trg_guard_req_proceso_against_exclusion\s+BEFORE INSERT OR UPDATE ON public\.requisitos_por_proceso\s+FOR EACH ROW EXECUTE FUNCTION public\.fn_guard_req_proceso_against_exclusion\(\);/i
  );

  const pruneFn = extractFunctionBlock(sql01, 'fn_smart_prune_process_clauses_on_exclusion');
  assert.match(pruneFn, /IF NEW\.deleted_at IS NOT NULL THEN\s+RETURN NEW;/i);
  assert.match(pruneFn, /IF v_excl_norma IS DISTINCT FROM v_cert_norma THEN/i);
  assert.match(pruneFn, /DELETE FROM public\.requisitos_por_proceso rpp/i);
  assert.match(pruneFn, /r_link\.ruta_materializada\s*<@\s*v_excl_path/i);
  assert.match(
    sql01,
    /CREATE TRIGGER trg_smart_prune_process_clauses_on_exclusion\s+AFTER INSERT OR UPDATE OF id_certificado, id_requisito, deleted_at ON public\.requisitos_no_aplicables_certificado\s+FOR EACH ROW EXECUTE FUNCTION public\.fn_smart_prune_process_clauses_on_exclusion\(\);/i
  );
});

test('Step 2.2.1: Block 1 audit/site schema removes flat columns, registers triggers/dependency cases, and defines partial unique indexes', () => {
  const sql01 = readSql('01_creacion.sql');
  const sql03 = readSql('03_indices_optimizacion.sql');

  // Verify flat date columns were removed from public.auditoria
  const auditoriaBlock = extractTableBlock(sql01, 'auditoria');
  assert.doesNotMatch(auditoriaBlock, /\bfecha_programacion\b/i, 'auditoria must not retain fecha_programacion');
  assert.doesNotMatch(auditoriaBlock, /\bfecha_reprogramacion\b/i, 'auditoria must not retain fecha_reprogramacion');
  assert.match(auditoriaBlock, /\bid_programa_auditoria\s+UUID\s+NOT NULL/i);

  // Verify obsolete direct shift column was removed from procesos_sitio_auditoria
  const procSitioAudBlock = extractTableBlock(sql01, 'procesos_sitio_auditoria');
  assert.doesNotMatch(
    procSitioAudBlock,
    /\bid_turnos_sitio_auditoria\b/i,
    'procesos_sitio_auditoria must not retain id_turnos_sitio_auditoria'
  );
  assert.match(procSitioAudBlock, /\bid_procesos_por_sitio\s+UUID\s+NOT NULL/i);

  // Verify trigger array memberships
  const coreArrMatch = sql01.match(/v_core_tables TEXT\[\] := ARRAY\[([\s\S]*?)\];/);
  assert.ok(coreArrMatch);
  assert.ok(coreArrMatch[1].includes("'programa_auditoria'"));

  const childArrMatch = sql01.match(/v_child_tables TEXT\[\] := ARRAY\[([\s\S]*?)\];/);
  assert.ok(childArrMatch);
  for (const tbl of [
    'procesos_por_sitio',
    'auditoria_fecha',
    'configuracion_alerta_auditoria',
    'turnos_proceso_sitio_auditoria',
    'equipo_auditor_sitio',
    'equipo_auditor_proceso_sitio',
  ]) {
    assert.ok(childArrMatch[1].includes(`'${tbl}'`), `Missing ${tbl} in v_child_tables`);
  }

  const guardedArrMatch = sql01.match(/v_guarded_parents TEXT\[\] := ARRAY\[([\s\S]*?)\];/);
  assert.ok(guardedArrMatch);
  for (const tbl of [
    'programa_auditoria',
    'procesos_por_sitio',
    'sitios_por_auditoria',
    'turnos_sitio_auditoria',
    'procesos_sitio_auditoria',
    'auditor',
  ]) {
    assert.ok(guardedArrMatch[1].includes(`'${tbl}'`), `Missing ${tbl} in v_guarded_parents`);
  }

  const summaryFn = extractFunctionBlock(sql01, 'get_archive_dependency_summary');
  for (const parentCase of [
    'programa_auditoria',
    'procesos_por_sitio',
    'sitios_por_auditoria',
    'turnos_sitio_auditoria',
    'procesos_sitio_auditoria',
    'auditor',
  ]) {
    assert.ok(summaryFn.includes(`WHEN '${parentCase}' THEN`), `Missing dependency case for ${parentCase}`);
  }

  // Verify new partial unique indexes in 03_indices_optimizacion.sql
  for (const idxDef of [
    'CREATE UNIQUE INDEX IF NOT EXISTS uq_programa_auditoria_codigo_active ON public.programa_auditoria (codigo_programa) WHERE codigo_programa IS NOT NULL AND deleted_at IS NULL;',
    'CREATE UNIQUE INDEX IF NOT EXISTS uq_auditoria_codigo_active ON public.auditoria (codigo_auditoria) WHERE codigo_auditoria IS NOT NULL AND deleted_at IS NULL;',
    'CREATE UNIQUE INDEX IF NOT EXISTS uq_auditoria_programa_cert_active ON public.auditoria (id_programa_auditoria, id_certificado) WHERE deleted_at IS NULL;',
    'CREATE UNIQUE INDEX IF NOT EXISTS uq_auditoria_fecha_secuencia_active ON public.auditoria_fecha (id_auditoria, numero_secuencia) WHERE deleted_at IS NULL;',
    'CREATE UNIQUE INDEX IF NOT EXISTS uq_config_alerta_clave_active ON public.configuracion_alerta_auditoria (clave) WHERE deleted_at IS NULL;',
    'CREATE UNIQUE INDEX IF NOT EXISTS uq_procesos_por_sitio_active ON public.procesos_por_sitio (id_sitio, id_proceso) WHERE deleted_at IS NULL;',
    'CREATE UNIQUE INDEX IF NOT EXISTS uq_turnos_sitio_auditoria_active ON public.turnos_sitio_auditoria (id_sitios_por_auditoria, id_turnos_por_sitio) WHERE deleted_at IS NULL;',
    'CREATE UNIQUE INDEX IF NOT EXISTS uq_procesos_sitio_auditoria_active ON public.procesos_sitio_auditoria (id_sitios_por_auditoria, id_procesos_por_sitio) WHERE deleted_at IS NULL;',
    'CREATE UNIQUE INDEX IF NOT EXISTS uq_turnos_proceso_sitio_aud_active ON public.turnos_proceso_sitio_auditoria (id_procesos_sitio_auditoria, id_turnos_sitio_auditoria) WHERE deleted_at IS NULL;',
    'CREATE UNIQUE INDEX IF NOT EXISTS uq_equipo_auditor_sitio_active ON public.equipo_auditor_sitio (id_sitios_por_auditoria, id_auditor) WHERE deleted_at IS NULL;',
    'CREATE UNIQUE INDEX IF NOT EXISTS uq_equipo_auditor_proceso_sitio_active ON public.equipo_auditor_proceso_sitio (id_procesos_sitio_auditoria, id_auditor) WHERE deleted_at IS NULL;',
  ]) {
    assert.ok(sql03.includes(idxDef), `Missing Block 1 partial unique index: ${idxDef}`);
  }
});

test('Step 1.1 (Future Changes): NC +15/+45 defaults, nullable hallazgo.id_proceso, simplified Revisión, conglomerate detachment RPC, indexes, RLS, and seeds', () => {
  const sql01 = readSql('01_creacion.sql');
  const sql03 = readSql('03_indices_optimizacion.sql');
  const sql04 = readSql('04_rls.sql');
  const sql06 = readSql('06_datos_prueba.sql');

  // 1. Configurable NC offsets (+15 plan / +45 cierre) and bi-directional plan sync trigger
  const alertCfgBlock = extractTableBlock(sql01, 'configuracion_alerta_auditoria');
  assert.match(
    alertCfgBlock,
    /\bdias_limite_plan_nc\s+INTEGER\s+NOT NULL\s+DEFAULT\s+15\s+CHECK\s*\(\s*dias_limite_plan_nc BETWEEN 1 AND 180\s*\)/i
  );
  assert.match(
    alertCfgBlock,
    /\bdias_limite_cierre_nc\s+INTEGER\s+NOT NULL\s+DEFAULT\s+45\s+CHECK\s*\(\s*dias_limite_cierre_nc BETWEEN 1 AND 365\s*\)/i
  );

  const syncPlanFn = extractFunctionBlock(sql01, 'fn_sync_config_alerta_plan_nc');
  assert.match(syncPlanFn, /NEW\.dias_limite_plan_nc/i);
  assert.match(syncPlanFn, /NEW\.dias_limite_plan_accion/i);
  assert.match(
    sql01,
    /CREATE TRIGGER trg_sync_config_alerta_plan_nc\s+BEFORE INSERT OR UPDATE OF dias_limite_plan_nc,\s*dias_limite_plan_accion ON public\.configuracion_alerta_auditoria/i
  );

  // 2. Dynamic NC deadline calculation & resync triggers (no calendar table inserts)
  const calcHallazgoFn = extractFunctionBlock(sql01, 'fn_auto_calcular_fechas_hallazgo');
  assert.match(calcHallazgoFn, /COALESCE\(v_dias_cierre,\s*45\)/i);

  const syncRealNcFn = extractFunctionBlock(sql01, 'fn_sincronizar_plazo_nc_auditoria');
  assert.match(syncRealNcFn, /\bSECURITY DEFINER\b/i);
  assert.match(syncRealNcFn, /SET search_path = public, pg_temp/i);
  assert.match(syncRealNcFn, /af\.tipo_fecha = 'REAL'/i);
  assert.match(syncRealNcFn, /h\.cerrado = FALSE/i);
  assert.doesNotMatch(syncRealNcFn, /\bINSERT INTO\b/i);

  const resyncCfgFn = extractFunctionBlock(sql01, 'fn_resincronizar_nc_al_cambiar_config');
  assert.match(resyncCfgFn, /\bSECURITY DEFINER\b/i);
  assert.match(resyncCfgFn, /SET search_path = public, pg_temp/i);
  assert.doesNotMatch(resyncCfgFn, /\bINSERT INTO\b/i);

  // 3. hallazgo.id_proceso nullable (cláusula-only NC) + idempotent DROP NOT NULL
  const hallazgoBlock = extractTableBlock(sql01, 'hallazgo');
  assert.match(
    hallazgoBlock,
    /\bid_proceso\s+UUID\s+NULL\s+REFERENCES\s+public\.proceso\(id\)\s+ON DELETE RESTRICT/i
  );
  assert.match(hallazgoBlock, /\bid_requisito\s+UUID\s+NOT NULL\s+REFERENCES\s+public\.requisito\(id\)/i);
  assert.match(sql01, /ALTER TABLE public\.hallazgo\s+ALTER COLUMN id_proceso DROP NOT NULL;/i);

  // 4. Simplified Revisión (usuario_revisor_id + non-blocking fn_validar_revision_auditoria)
  const auditoriaBlock = extractTableBlock(sql01, 'auditoria');
  assert.match(
    auditoriaBlock,
    /\busuario_revisor_id\s+UUID\s+NULL\s+REFERENCES\s+public\.profiles\(id\)/i
  );
  assert.match(
    sql01,
    /ADD COLUMN IF NOT EXISTS usuario_revisor_id UUID NULL REFERENCES public\.profiles\(id\)/i
  );

  const revFn = extractFunctionBlock(sql01, 'fn_validar_revision_auditoria');
  assert.match(revFn, /\bSECURITY DEFINER\b/i);
  assert.match(revFn, /IF NEW\.fecha_revision IS NOT NULL THEN\s+NEW\.revisado := TRUE;/i);
  assert.match(revFn, /NEW\.usuario_revisor_id := v_actor_id;/i);
  assert.doesNotMatch(revFn, /documentacion_completa IS DISTINCT FROM TRUE/i);
  assert.doesNotMatch(revFn, /estado_ciclo IS DISTINCT FROM 'Cerrada'/i);

  // 5. Conglomerate detachment RPC + staff guard + Zero-UUID error messages
  const staffFn = extractFunctionBlock(sql01, 'fn_is_approved_staff');
  assert.match(staffFn, /\bSECURITY DEFINER\b/i);
  assert.match(staffFn, /role IN \('ADMIN', 'WORKER'\)/i);

  const detachFn = extractFunctionBlock(sql01, 'fn_desvincular_organizacion_conglomerado');
  assert.match(detachFn, /\bSECURITY DEFINER\b/i);
  assert.match(detachFn, /SET search_path = public, pg_temp/i);
  assert.match(detachFn, /fn_is_approved_staff\(\)/i);
  assert.match(detachFn, /v_active_members_count <= 1/i);
  assert.match(detachFn, /vinculo_certificado/i);
  assert.match(detachFn, /es_individual_auto/i);
  assert.match(detachFn, /INSERT INTO public\.audit_log/i);
  assert.match(detachFn, /ERRCODE = 'P0001'/i);
  // Zero-UUID hygiene inside exception text literals (no raw UUID interpolation %)
  const exceptionStrings = [...detachFn.matchAll(/RAISE EXCEPTION\s+'([^']*)'/gi)].map((m) => m[1]);
  assert.ok(exceptionStrings.length >= 4, 'Expected descriptive RAISE EXCEPTION messages in fn_desvincular_organizacion_conglomerado');
  for (const msg of exceptionStrings) {
    assert.doesNotMatch(
      msg,
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      `Exposed raw UUID inside RAISE EXCEPTION: ${msg}`
    );
  }

  // 6. Indexes in 03_indices_optimizacion.sql
  for (const idxDef of [
    'CREATE INDEX IF NOT EXISTS idx_vinculo_grupo_active ON public.vinculo_certificado (id_grupo_empresarial) WHERE deleted_at IS NULL;',
    'CREATE INDEX IF NOT EXISTS idx_programa_auditoria_grupo_active ON public.programa_auditoria (id_grupo_empresarial) WHERE deleted_at IS NULL;',
    'CREATE INDEX IF NOT EXISTS idx_auditoria_cert_recent ON public.auditoria (id_certificado, created_at DESC) WHERE deleted_at IS NULL;',
    'CREATE INDEX IF NOT EXISTS idx_hallazgo_requisito_auditoria ON public.hallazgo (id_auditoria, id_requisito) WHERE deleted_at IS NULL;',
  ]) {
    assert.ok(sql03.includes(idxDef), `Missing Step 1.1 index: ${idxDef}`);
  }

  // 7. Least-privilege DCL & hallazgo/revision RLS in 04_rls.sql
  assert.match(
    sql04,
    /GRANT EXECUTE ON FUNCTION public\.fn_desvincular_organizacion_conglomerado\(UUID, TEXT\) TO authenticated;/i
  );
  assert.match(
    sql04,
    /REVOKE EXECUTE ON FUNCTION public\.fn_desvincular_organizacion_conglomerado\(UUID, TEXT\) FROM anon;/i
  );
  // Verify hallazgo RLS relies on auditoria -> certificado -> organizacion, never JOIN proceso
  const hallazgoSelectPolicy = sql04.match(/CREATE POLICY "hallazgo_select"[\s\S]*?;/i)?.[0] ?? '';
  assert.ok(hallazgoSelectPolicy.length > 0, 'Missing hallazgo_select policy');
  assert.doesNotMatch(hallazgoSelectPolicy, /JOIN\s+public\.proceso\b/i);

  // 8. Deterministic seeds in 06_datos_prueba.sql (CONG-ALM-01: 10+1 certs, 3x3 + COMBINADA, discrete REAL dates, clause-only NCs)
  assert.ok(sql06.includes("'CONG-ALM-01'"), 'Missing CONG-ALM-01 multi-org conglomerate seed');
  assert.ok(sql06.includes("'Organización Grande Alimentos S.A.'"), 'Missing large org seed');
  assert.ok(sql06.includes("'Organización Pequeña Empaques C.A.'"), 'Missing small org seed');
  assert.ok(sql06.includes("'e0000000-0000-0000-0000-000000022000'"), 'Missing ISO 22000:2018 standard seed');
  assert.ok(sql06.includes("'VINC-ALM-S4-N2'"), 'Missing 4th-site Nivel 2 COMBINADA link seed');
  assert.ok(sql06.includes("'2026-11-18'"), 'Missing discrete REAL date 2026-11-18');
  assert.ok(sql06.includes("'2026-11-19'"), 'Missing discrete REAL date 2026-11-19');
  assert.ok(sql06.includes("'2026-11-20'"), 'Missing discrete REAL date 2026-11-20');
  assert.ok(sql06.includes("'HAL-ALM-01'"), 'Missing clause-only NC HAL-ALM-01');
  assert.ok(sql06.includes("'HAL-ALM-02'"), 'Missing clause-only NC HAL-ALM-02');
  assert.match(sql06, /dias_limite_plan_accion,\s*dias_limite_plan_nc,\s*dias_limite_cierre_nc/i);

  // 9. Balanced $$ dollar-quote delimiters across all modified SQL files
  for (const [name, content] of [
    ['01_creacion.sql', sql01],
    ['03_indices_optimizacion.sql', sql03],
    ['04_rls.sql', sql04],
    ['06_datos_prueba.sql', sql06],
  ]) {
    const dollarCount = (content.match(/\$\$/g) ?? []).length;
    assert.equal(dollarCount % 2, 0, `${name} has unbalanced $$ delimiters`);
  }
});




