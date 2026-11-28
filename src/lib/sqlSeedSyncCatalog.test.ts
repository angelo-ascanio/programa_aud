import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  SQL_SEED_SYNC_BLOCKS,
  SQL_SYNC_TABLES_TOPO_ORDER,
  SQL_SYNC_TABLE_METADATA,
  getAllSyncSectionSpecs,
  getSyncBlockSpec,
  getSyncSectionSpec,
  getSyncTableMetadata,
  resolveSyncSelectionPlan,
  sortTablesTopologically,
} from './sqlSeedSyncCatalog';
import { containsRawUuid } from './zeroUuid';

const QUERIES_DIR = path.resolve(process.cwd(), 'public/supabase/queries');

test('Paso 1.1: Modela los 3 bloques operativos en orden y todas sus secciones con etiquetas en español Zero-UUID', () => {
  assert.deepEqual(
    SQL_SEED_SYNC_BLOCKS.map((b) => b.id),
    ['auditorias', 'certificacion', 'extra']
  );

  const auditoriasBlock = getSyncBlockSpec('auditorias');
  assert.ok(auditoriasBlock);
  assert.deepEqual(
    auditoriasBlock.sections.map((s) => s.id),
    [
      'auditorias.calendario',
      'auditorias.designacion.relacion',
      'auditorias.designacion.tipo',
      'auditorias.designacion.fecha',
      'auditorias.designacion.sitio',
      'auditorias.designacion.temporal',
      'auditorias.tiempo',
      'auditorias.auditor',
      'auditorias.proceso',
      'auditorias.turno',
      'auditorias.resultado',
      'auditorias.revision',
      'auditorias.resumen',
    ]
  );

  const certificacionBlock = getSyncBlockSpec('certificacion');
  assert.ok(certificacionBlock);
  assert.deepEqual(
    certificacionBlock.sections.map((s) => s.id),
    [
      'certificacion.conglomerado',
      'certificacion.organizacion',
      'certificacion.certificado',
      'certificacion.vinculo',
      'certificacion.auditor',
      'certificacion.experto',
    ]
  );

  const extraBlock = getSyncBlockSpec('extra');
  assert.ok(extraBlock);
  assert.deepEqual(
    extraBlock.sections.map((s) => s.id),
    [
      'extra.norma',
      'extra.sector_iaf',
      'extra.acreditacion',
      'extra.estatus',
      'extra.tipo',
      'extra.metodologia',
    ]
  );

  for (const block of SQL_SEED_SYNC_BLOCKS) {
    assert.equal(containsRawUuid(block.labelEs), false);
    assert.equal(containsRawUuid(block.descriptionEs), false);
    for (const section of block.sections) {
      assert.equal(containsRawUuid(section.labelEs), false);
      assert.equal(containsRawUuid(section.descriptionEs), false);
      assert.equal(containsRawUuid(section.cascadeSummaryEs), false);
      assert.ok(section.tables.length > 0, `La sección ${section.id} debe incluir tablas`);
      for (const tbl of section.tables) {
        assert.ok(getSyncTableMetadata(tbl), `Falta metadato SQL para tabla "${tbl}" en ${section.id}`);
      }
    }
  }
});

test('Paso 1.1: certificacion.certificado incluye la cascada completa de 19 tablas Padre → Hijos', () => {
  const certSection = getSyncSectionSpec('certificacion.certificado');
  assert.ok(certSection);
  assert.equal(certSection.targetFile, '06_datos_prueba.sql');

  const expectedCascade = [
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
  ];

  assert.equal(certSection.tables.length, expectedCascade.length);
  for (const table of expectedCascade) {
    assert.ok(
      certSection.tables.includes(table),
      `Falta "${table}" en la cascada de certificacion.certificado`
    );
  }

  const plan = resolveSyncSelectionPlan(['certificacion.certificado']);
  assert.deepEqual(plan.targetFiles, ['06_datos_prueba.sql']);
  assert.deepEqual(plan.tablesFor07, []);
  for (const table of expectedCascade) {
    assert.ok(plan.primaryTables.includes(table));
    assert.ok(plan.tablesFor06.includes(table));
  }

  // Soporte FK automático incluye ancestros de organización e IAF/estatus sin invadir primaryTables
  for (const fkParent of ['grupo_empresarial', 'organizacion', 'organizacion_version', 'estatus', 'sector_iaf', 'subsector_iaf']) {
    assert.ok(plan.fkSupportTables.includes(fkParent), `Falta soporte FK "${fkParent}"`);
    assert.equal(plan.primaryTables.includes(fkParent), false);
    assert.ok(plan.tablesFor06.includes(fkParent));
  }
});

test('Paso 1.1: certificacion.auditor incluye auditor + las 3 sub-entidades normalizadas + 3 matrices M:N', () => {
  const auditorSection = getSyncSectionSpec('certificacion.auditor');
  assert.ok(auditorSection);
  assert.deepEqual(auditorSection.tables, [
    'auditor',
    'telefono_auditor',
    'email_auditor',
    'evaluacion_in_situ_auditor',
    'norma_auditor',
    'sector_iaf_auditor',
    'subsector_iaf_auditor',
  ]);

  for (const childTable of ['telefono_auditor', 'email_auditor', 'evaluacion_in_situ_auditor']) {
    const meta = getSyncTableMetadata(childTable);
    assert.ok(meta);
    assert.equal(meta.kind, 'soft_delete_child');
    assert.ok(SQL_SYNC_TABLES_TOPO_ORDER.includes(childTable));
  }
});

test('Paso 1.1: extra.norma apunta exclusivamente al caso especial 07_normas_requisitos_csv.sql', () => {
  const normaSection = getSyncSectionSpec('extra.norma');
  assert.ok(normaSection);
  assert.equal(normaSection.targetFile, '07_normas_requisitos_csv.sql');
  assert.equal(normaSection.specialCase, 'NORMAS_CSV_SEED');
  assert.deepEqual(normaSection.tables, ['norma', 'requisito', 'requisito_traduccion']);

  const plan = resolveSyncSelectionPlan(['extra.norma']);
  assert.equal(plan.hasSpecialNormasCase, true);
  assert.deepEqual(plan.targetFiles, ['07_normas_requisitos_csv.sql']);
  assert.deepEqual(plan.tablesFor06, []);
  assert.deepEqual(plan.tablesFor07, ['norma', 'requisito', 'requisito_traduccion']);

  const reqMeta = getSyncTableMetadata('requisito');
  assert.ok(reqMeta);
  assert.equal(reqMeta.selfReferentialColumn, 'id_requisito_padre');
  assert.deepEqual(reqMeta.ltreeColumns, ['ruta_materializada']);
  assert.equal(reqMeta.conflictClauseActive, '(id_norma, codigo) WHERE deleted_at IS NULL');
});

test('Paso 1.1: SQL_SYNC_TABLES_TOPO_ORDER respeta FKs padres-antes-que-hijos y orden de triggers de 01_creacion.sql', () => {
  const uniqueTables = new Set(SQL_SYNC_TABLES_TOPO_ORDER);
  assert.equal(uniqueTables.size, SQL_SYNC_TABLES_TOPO_ORDER.length);
  assert.equal(SQL_SYNC_TABLES_TOPO_ORDER.length, Object.keys(SQL_SYNC_TABLE_METADATA).length);
  assert.equal(SQL_SYNC_TABLES_TOPO_ORDER.length, 65);

  const indexOf = (tableName: string): number => SQL_SYNC_TABLES_TOPO_ORDER.indexOf(tableName);

  for (const tableName of SQL_SYNC_TABLES_TOPO_ORDER) {
    const meta = getSyncTableMetadata(tableName);
    assert.ok(meta, `Metadato faltante para ${tableName}`);
    for (const fk of meta.fkDependencies) {
      if (fk.selfReferential || fk.externalManagedIn05Usuarios) continue;
      const parentMeta = getSyncTableMetadata(fk.targetTable);
      assert.ok(parentMeta, `FK apunta a tabla desconocida ${fk.targetTable}`);
      assert.ok(
        indexOf(fk.targetTable) < indexOf(tableName),
        `Orden topológico inválido: padre "${fk.targetTable}" (${indexOf(fk.targetTable)}) debe preceder a hijo "${tableName}" (${indexOf(tableName)})`
      );
    }
  }

  // Reglas críticas de triggers en 01_creacion.sql
  assert.ok(indexOf('alcance') < indexOf('auditoria'));
  assert.ok(indexOf('alcance_certificado_compartido') < indexOf('auditoria'));
  assert.ok(indexOf('requisitos_no_aplicables_certificado') < indexOf('requisitos_por_proceso'));
  assert.ok(indexOf('sitios_por_auditoria') < indexOf('auditoria_fecha'));
  assert.ok(indexOf('auditoria_fecha') < indexOf('hallazgo'));
});

test('Paso 1.1: Clasificación soft-delete e índices parciales alineados con 01_creacion.sql y 03_indices_optimizacion.sql', () => {
  const sql01 = fs.readFileSync(path.join(QUERIES_DIR, '01_creacion.sql'), 'utf8');
  const sql03 = fs.readFileSync(path.join(QUERIES_DIR, '03_indices_optimizacion.sql'), 'utf8');

  const coreCount = Object.values(SQL_SYNC_TABLE_METADATA).filter((m) => m.kind === 'soft_delete_core').length;
  const childCount = Object.values(SQL_SYNC_TABLE_METADATA).filter((m) => m.kind === 'soft_delete_child').length;
  const mnCount = Object.values(SQL_SYNC_TABLE_METADATA).filter((m) => m.kind === 'pure_mn_link').length;
  const derivedCount = Object.values(SQL_SYNC_TABLE_METADATA).filter((m) => m.kind === 'trigger_derived').length;

  assert.equal(coreCount, 27);
  assert.equal(childCount, 31); // 30 v_child_tables + client_organization_access
  assert.equal(mnCount, 6);
  assert.equal(derivedCount, 1); // equipo_auditor

  // Verificar que los nombres de índices únicos adicionales mencionados existan en 03_indices_optimizacion.sql
  for (const meta of Object.values(SQL_SYNC_TABLE_METADATA)) {
    assert.ok(meta.conflictClauseActive.length > 0);
    assert.equal(containsRawUuid(meta.labelEs), false);
    for (const idxName of meta.additionalUniqueIndexes ?? []) {
      assert.ok(
        sql03.includes(idxName),
        `Índice adicional "${idxName}" en ${meta.tableName} no existe en 03_indices_optimizacion.sql`
      );
    }
    assert.ok(
      sql01.includes(`TABLE IF NOT EXISTS ${meta.tableName}`) ||
        sql01.includes(`TABLE IF NOT EXISTS public.${meta.tableName}`),
      `Tabla ${meta.tableName} no encontrada en 01_creacion.sql`
    );
  }
});

test('Paso 1.1: resolveSyncSelectionPlan gestiona selección vacía, bloques completos, resumen, FK opcional y errores', () => {
  const emptyPlan = resolveSyncSelectionPlan([]);
  assert.deepEqual(emptyPlan.selectedSectionIds, []);
  assert.deepEqual(emptyPlan.targetFiles, []);
  assert.deepEqual(emptyPlan.tablesFor06, []);
  assert.deepEqual(emptyPlan.tablesFor07, []);
  assert.deepEqual(emptyPlan.selectedBlocksComplete, []);

  assert.throws(
    () => resolveSyncSelectionPlan(['bloque.inexistente']),
    /desconocida/
  );

  // Desactivar soporte FK limita las tablas exactamente a primaryTables
  const noFkPlan = resolveSyncSelectionPlan(['auditorias.designacion.sitio'], {
    includeParentFkDependencies: false,
  });
  assert.deepEqual(noFkPlan.primaryTables, ['sitios_por_auditoria']);
  assert.deepEqual(noFkPlan.fkSupportTables, []);
  assert.deepEqual(noFkPlan.tablesFor06, ['sitios_por_auditoria']);

  // auditorias.auditor expone equipo_auditor como tabla derivada por triggers
  const auditorAssignPlan = resolveSyncSelectionPlan(['auditorias.auditor']);
  assert.deepEqual(auditorAssignPlan.derivedTables, ['equipo_auditor']);
  assert.equal(auditorAssignPlan.primaryTables.includes('equipo_auditor'), false);

  // Seleccionar auditorias.resumen marca completo todo el bloque 1
  const resumenPlan = resolveSyncSelectionPlan(['auditorias.resumen']);
  assert.deepEqual(resumenPlan.selectedBlocksComplete, ['auditorias']);
  assert.ok(resumenPlan.primaryTables.includes('hallazgo'));
  assert.ok(resumenPlan.primaryTables.includes('turnos_proceso_sitio_auditoria'));

  // Selección completa de los 3 bloques enruta hacia ambos archivos destino
  const allSectionIds = getAllSyncSectionSpecs().map((s) => s.id);
  const fullPlan = resolveSyncSelectionPlan(allSectionIds);
  assert.deepEqual(fullPlan.selectedBlocksComplete, ['auditorias', 'certificacion', 'extra']);
  assert.deepEqual(fullPlan.targetFiles, ['06_datos_prueba.sql', '07_normas_requisitos_csv.sql']);
  assert.equal(fullPlan.tablesFor06.length + fullPlan.tablesFor07.length, 64); // 65 menos equipo_auditor (trigger_derived)

  // sortTablesTopologically ignora desconocidas y ordena correctamente
  assert.deepEqual(
    sortTablesTopologically(['hallazgo', 'norma', 'certificado', 'auditoria', 'no_existe']),
    ['norma', 'certificado', 'auditoria', 'hallazgo']
  );
});
