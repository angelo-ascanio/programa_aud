import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  applyDatabaseSyncTo06Sql,
  findManagedSyncBlocks,
  getCanonicalAdminSyncBlockOrder,
  parseExistingSqlSeedRecords,
  previewDatabaseSyncTo06Sql,
  validateUpdatedSeedSql,
} from './sqlSeedFileUpdater';
import { containsRawUuid } from './zeroUuid';

const DATOS_PRUEBA_PATH = path.resolve(process.cwd(), 'public/supabase/queries/06_datos_prueba.sql');

function readReal06Sql(): string {
  return fs.readFileSync(DATOS_PRUEBA_PATH, 'utf8');
}

test('Step 1.3: parseExistingSqlSeedRecords indexa correctamente 06_datos_prueba.sql (Sección 29 Nestlé, Sección 28 Expertos, Sección 22b y Sección 27)', () => {
  const realSql06 = readReal06Sql();
  const parsed = parseExistingSqlSeedRecords(realSql06);

  // Validación base del archivo real sin modificaciones
  const baseValidation = validateUpdatedSeedSql(realSql06, realSql06);
  assert.equal(baseValidation.valid, true, `Base validation failed: ${baseValidation.errors.join(' | ')}`);
  assert.equal(baseValidation.balancedDollarDelimiters, true);
  assert.equal(baseValidation.zeroProtectedDeletes, true);
  assert.equal(parsed.managedBlocks.length, 0);

  // Sectores IAF (incluye ceros iniciales 01..09 convertidos a 1..9)
  assert.equal(parsed.rowsByTable['sector_iaf']?.length, 39);
  assert.equal(parsed.byIdByTable['sector_iaf']?.['d0000000-0000-0000-0000-000000000003']?.row.sector, 3);

  // Auditores (48 activos)
  assert.equal(parsed.rowsByTable['auditor']?.length, 48);

  // Sección 28: 5 expertos técnicos + asignación + escenario LABCENTRO
  assert.equal(parsed.rowsByTable['experto_tecnico']?.length, 5);
  assert.equal(parsed.rowsByTable['telefono_experto_tecnico']?.length, 6);
  assert.equal(parsed.rowsByTable['email_experto_tecnico']?.length, 5);
  assert.ok(
    parsed.byIdByTable['experto_tecnico_auditoria']?.['1e300000-0000-0000-0000-000000000001'],
    'Debe indexar experto_tecnico_auditoria de Dra. Sofía Quintero'
  );

  // Sección 29: Conglomerado Nestlé Venezuela + Cadipro + 3 certificados + versiones DO $$
  assert.equal(
    parsed.byIdByTable['grupo_empresarial']?.['75013027-4394-49f1-8405-c5fba8f82ed0']?.row.abreviacion,
    'NESTLÉ'
  );
  assert.equal(
    parsed.byIdByTable['organizacion']?.['78af57af-ce42-48e0-a488-ab11d61d0c19']?.row.abreviacion,
    'NESTLÉ CADIPRO'
  );
  // Versiones dentro de bloques DO $$ (DECLARE y FOR ... VALUES)
  assert.equal(
    parsed.byIdByTable['organizacion_version']?.['9494773f-b4c6-44bd-8bea-af51a29a0b22']?.row.abreviacion,
    'NESTLÉ'
  );
  assert.equal(
    parsed.byIdByTable['organizacion_version']?.['189dd484-daa1-4a45-a283-fee1b0a82abf']?.row.abreviacion,
    'NESTLÉ CADIPRO'
  );
  assert.equal(
    parsed.byIdByTable['certificado_version']?.['2a36039f-fa67-47aa-b5d3-fd482e165097']?.row.version_numero,
    1
  );
  assert.equal(
    parsed.byIdByTable['certificado']?.['14c1c36d-636e-437e-97ba-08ad845908f1']?.row.numero_certificado,
    '9001-885-03-10-2020'
  );
  assert.equal(
    parsed.byIdByTable['certificado']?.['fe3d32fa-1b85-429f-8c40-f49dc41b1b5b']?.row.numero_certificado,
    '45001-041-03-10-2020'
  );
  assert.equal(
    parsed.byIdByTable['sitio']?.['6efe5ad5-81a8-4a06-8107-1b7b65712ca7']?.row.nombre_sitio,
    'Planta CADIPRO'
  );
  assert.equal(
    parsed.byIdByTable['proceso']?.['277b91c1-13b4-40b2-8c87-aacda28a1cf9']?.row.nombre_proceso,
    'Calidad y SHE'
  );

  // Sección 22b: Overlay de UPDATE sobre auditorías cerradas
  const closedAud14 = parsed.byIdByTable['auditoria']?.['80000000-0000-0000-0000-000000000014'];
  assert.ok(closedAud14);
  assert.equal(closedAud14.row.estado_ciclo, 'Cerrada');
  assert.equal(closedAud14.row.revisado, true);
  assert.equal(closedAud14.row.documentacion_completa, true);
  assert.ok(closedAud14.overlayDynamicColumns.includes('fecha_cierre_auditoria'));

  // Sección 27: requisitos_por_proceso sin id_certificado_version explícito resuelve la versión actual por certificado
  const reqProcSec27 = (parsed.rowsByTable['requisitos_por_proceso'] ?? []).filter(
    (r) => r.id_proceso === '60000000-0000-0000-0000-000000000012' && r.id_certificado === '40000000-0000-0000-0000-000000000004'
  );
  assert.equal(reqProcSec27.length, 7);
  assert.ok(reqProcSec27.every((r) => r.id_certificado_version === '41000000-0000-0000-0000-000000000004'));

  // Simular filas vivas equivalentes (con timestamps volátiles y fechas dinámicas resueltas desde NOW()/CURRENT_DATE)
  const simulatedLive: Record<string, Array<Record<string, unknown>>> = {};
  for (const [tableName, rows] of Object.entries(parsed.rowsByTable)) {
    simulatedLive[tableName] = rows.map((row) => {
      const copy: Record<string, unknown> = {
        ...row,
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-10T00:00:00Z',
        deleted_at: null,
        deleted_by: null,
        delete_reason: null,
      };
      for (const [k, v] of Object.entries(copy)) {
        if (v === '__DYNAMIC_SQL__') {
          copy[k] = k.includes('timestamp') ? '2026-01-15T12:00:00Z' : '2026-06-15';
        }
      }
      return copy;
    });
  }

  const noOpResult = applyDatabaseSyncTo06Sql(realSql06, simulatedLive);
  assert.equal(noOpResult.changed, false, `Expected 0 diffs when live DB matches seed, warnings=${noOpResult.warnings.join('; ')}`);
  assert.equal(noOpResult.nextSqlContent, realSql06);
  assert.equal(noOpResult.counts.tablesWithChanges, 0);
});

test('Step 1.3: Idempotencia estricta, reemplazo limpio de bloques y orden canónico extra -> certificacion -> auditorias', () => {
  const realSql06 = readReal06Sql();
  const parsed = parseExistingSqlSeedRecords(realSql06);

  // 1. Primero sincronizar solo bloque `auditorias` agregando una nueva fecha en AUD-FAR-2026-001
  const audFechas1 = [
    ...(parsed.rowsByTable['auditoria_fecha'] ?? []),
    {
      id: '81000000-0000-0000-0000-000000000991',
      id_auditoria: '80000000-0000-0000-0000-000000000201',
      numero_secuencia: 2,
      tag: 'Cierre',
      tipo_fecha: 'REAL',
      anio: null,
      mes: null,
      fecha_inicio: '2026-12-01',
      fecha_fin: '2026-12-02',
      observacion: 'Jornada real ejecutada sin incidencias.',
      deleted_at: null,
    },
  ];

  const run1 = applyDatabaseSyncTo06Sql(realSql06, { auditoria_fecha: audFechas1 }, { tablesToSync: ['auditoria_fecha'] });
  assert.equal(run1.changed, true);
  assert.equal(run1.validation.valid, true, run1.validation.errors.join(' | '));
  assert.deepEqual(
    findManagedSyncBlocks(run1.nextSqlContent).map((b) => b.key),
    ['auditorias']
  );

  // 2. Segunda corrida idéntica -> changed === false y salida byte-a-byte idéntica
  const run2 = applyDatabaseSyncTo06Sql(run1.nextSqlContent, { auditoria_fecha: audFechas1 }, { tablesToSync: ['auditoria_fecha'] });
  assert.equal(run2.changed, false);
  assert.equal(run2.nextSqlContent, run1.nextSqlContent);

  // 3. Luego sincronizar `certificacion` (nuevo proceso): debe insertarse ANTES que `auditorias`
  const procesos1 = [
    ...(parsed.rowsByTable['proceso'] ?? []),
    {
      id: '60000000-0000-0000-0000-000000000991',
      id_certificado: 'fe3d32fa-1b85-429f-8c40-f49dc41b1b5b',
      id_certificado_version: '2a36039f-fa67-47aa-b5d3-fd482e165097',
      nombre_proceso: 'Mantenimiento Preventivo Industrial',
      tipo: 'De Apoyo',
      deleted_at: null,
    },
  ];

  const run3 = applyDatabaseSyncTo06Sql(run2.nextSqlContent, { proceso: procesos1 }, { tablesToSync: ['proceso'] });
  assert.equal(run3.changed, true);
  assert.equal(run3.validation.valid, true, run3.validation.errors.join(' | '));
  assert.deepEqual(
    findManagedSyncBlocks(run3.nextSqlContent).map((b) => b.key),
    ['certificacion', 'auditorias']
  );

  // 4. Agregar un 2do proceso + sincronizar `sitio` en `certificacion`: reemplaza el bloque sin duplicar el 1er proceso
  const procesos2 = [
    ...procesos1,
    {
      id: '60000000-0000-0000-0000-000000000992',
      id_certificado: 'fe3d32fa-1b85-429f-8c40-f49dc41b1b5b',
      id_certificado_version: '2a36039f-fa67-47aa-b5d3-fd482e165097',
      nombre_proceso: 'Gestión de Contratistas$$ Críticos',
      tipo: 'De Apoyo',
      deleted_at: null,
    },
  ];
  const run4 = applyDatabaseSyncTo06Sql(run3.nextSqlContent, { proceso: procesos2 }, { tablesToSync: ['proceso'] });
  assert.equal(run4.changed, true);
  assert.equal(run4.validation.valid, true, run4.validation.errors.join(' | '));
  assert.equal(
    run4.nextSqlContent.split('60000000-0000-0000-0000-000000000991').length - 1,
    1,
    'No debe duplicar el primer proceso al regenerar el bloque administrado'
  );
  // Neutralización segura de $$ en literales dentro del bloque administrado
  assert.equal(run4.validation.balancedDollarDelimiters, true);

  // 5. Sincronizar solo `sitio` (sin incluir `proceso` en tablesToSync) debe preservar los procesos previos en `certificacion`
  const sitiosMod = (parsed.rowsByTable['sitio'] ?? []).map((s) =>
    s.id === '6efe5ad5-81a8-4a06-8107-1b7b65712ca7' ? { ...s, personal_count: 118 } : s
  );
  const run5 = applyDatabaseSyncTo06Sql(run4.nextSqlContent, { sitio: sitiosMod }, { tablesToSync: ['sitio'] });
  assert.equal(run5.changed, true);
  assert.ok(run5.nextSqlContent.includes('60000000-0000-0000-0000-000000000991'));
  assert.ok(run5.nextSqlContent.includes('60000000-0000-0000-0000-000000000992'));
  assert.ok(run5.nextSqlContent.includes("'Planta CADIPRO'"));
  assert.ok(run5.nextSqlContent.includes(', 118)'));

  assert.deepEqual(getCanonicalAdminSyncBlockOrder(), ['extra', 'certificacion', 'auditorias']);
});

test('Step 1.3: Estrategia Dual (Fase A + Fase B + DO $$ override + archivado lógico + M:N) mantiene todas las invariantes de tests existentes', () => {
  const realSql06 = readReal06Sql();
  const parsed = parseExistingSqlSeedRecords(realSql06);

  // Mutación Fase A: cambiar numero_certificado (índice único parcial) y personal_count de sitio
  const certs = (parsed.rowsByTable['certificado'] ?? []).map((c) =>
    c.id === '40000000-0000-0000-0000-000000000001'
      ? { ...c, numero_certificado: 'FN-QMS-2024-001-REV' }
      : c
  );
  const sitios = (parsed.rowsByTable['sitio'] ?? []).map((s) =>
    s.id === '50000000-0000-0000-0000-000000000000'
      ? { ...s, personal_count: 210 }
      : s
  );

  // Mutación sobre bloque DO $$ (`organizacion_version` en Sección 11b) -> debe ir por Fase B UPDATE
  const orgVersions = (parsed.rowsByTable['organizacion_version'] ?? []).map((ov) =>
    ov.id === '31000000-0000-0000-0000-000000000101'
      ? { ...ov, notas_version: 'Versión 2 actualizada desde PostgreSQL.' }
      : ov
  );

  // Nuevo proceso + archivo lógico de proceso existente + nuevo hijo `requisitos_por_proceso` + baja M:N
  const newProcId = '60000000-0000-0000-0000-000000000995';
  const archivedProcId = '60000000-0000-0000-0000-000000000011';
  const procesos = [
    ...(parsed.rowsByTable['proceso'] ?? []).map((p) =>
      p.id === archivedProcId
        ? {
            ...p,
            deleted_at: '2026-04-10T14:30:00Z',
            deleted_by: '11111111-1111-1111-1111-111111111111',
            delete_reason: 'Proceso fusionado durante reestructuración.',
          }
        : p
    ),
    {
      id: newProcId,
      id_certificado: '40000000-0000-0000-0000-000000000001',
      id_certificado_version: '41000000-0000-0000-0000-000000000001',
      nombre_proceso: 'Aseguramiento Metrológico Avanzado',
      tipo: 'De Apoyo',
      deleted_at: null,
    },
  ];

  // Quitar 1 enlace M:N de `requisitos_por_proceso` (Sección 27, cert 4000...0004) y agregar 1 enlace al nuevo proceso
  const reqPorProceso = [
    ...(parsed.rowsByTable['requisitos_por_proceso'] ?? []).filter(
      (rp) =>
        !(
          rp.id_proceso === '60000000-0000-0000-0000-000000000012' &&
          rp.id_certificado === '40000000-0000-0000-0000-000000000004' &&
          rp.id_requisito === '443b196c-0af0-49aa-930e-26b0462fa531'
        )
    ),
    {
      id_proceso: newProcId,
      id_certificado: '40000000-0000-0000-0000-000000000001',
      id_certificado_version: '41000000-0000-0000-0000-000000000001',
      id_requisito: '42efcb2b-b1a4-4195-849a-2035d7abdfee',
    },
  ];

  const liveBundle = {
    certificado: certs,
    sitio: sitios,
    organizacion_version: orgVersions,
    proceso: procesos,
    requisitos_por_proceso: reqPorProceso,
  };

  const tablesToSync = ['organizacion_version', 'certificado', 'sitio', 'proceso', 'requisitos_por_proceso'];

  // Preview debe coincidir exactamente con Apply sin mutar el archivo en disco
  const preview = previewDatabaseSyncTo06Sql(realSql06, liveBundle, { tablesToSync });
  const applied = applyDatabaseSyncTo06Sql(realSql06, liveBundle, { tablesToSync });

  assert.equal(applied.nextSqlContent, preview.nextSqlContent);
  assert.equal(applied.changed, true);
  assert.equal(applied.validation.valid, true, applied.validation.errors.join(' | '));
  assert.equal(applied.validation.preservedBaseSections, true);
  assert.equal(applied.validation.preservedHistoricalDoBlocks, true);
  assert.equal(applied.validation.zeroProtectedDeletes, true);
  assert.equal(applied.counts.phaseACellUpdates, 2); // numero_certificado + personal_count
  assert.equal(applied.counts.phaseBDeletedMnLinks, 1);
  assert.ok(applied.diffSnippets.length > 0);

  // Fase A actualizó la tupla base in-place (sin dejar el número viejo duplicado en INSERT INTO certificado)
  assert.ok(applied.nextSqlContent.includes("'FN-QMS-2024-001-REV'"));
  assert.ok(!applied.nextSqlContent.includes("'FN-QMS-2024-001',"));

  // Fase B respetó orden topológico: `proceso` precede a `requisitos_por_proceso` en ADMIN_SYNC
  const syncBlock = findManagedSyncBlocks(applied.nextSqlContent)[0];
  assert.ok(syncBlock);
  assert.ok(
    syncBlock.innerSql.indexOf('INSERT INTO public.proceso') <
      syncBlock.innerSql.indexOf('INSERT INTO public.requisitos_por_proceso')
  );
  // Jamás DELETE en tablas protegidas; solo en M:N pura
  assert.doesNotMatch(syncBlock.innerSql, /DELETE FROM\s+public\.(proceso|sitio|certificado|organizacion_version)\b/i);
  assert.match(syncBlock.innerSql, /DELETE FROM\s+public\.requisitos_por_proceso\b/i);
  assert.match(syncBlock.innerSql, /UPDATE\s+public\.proceso\s+SET[\s\S]*deleted_at\s*=/i);

  // Zero-UUID estricto en sampleLabels de todos los resúmenes
  for (const summary of applied.orderedSummaries) {
    for (const label of summary.sampleLabels) {
      assert.equal(containsRawUuid(label), false, `sampleLabel expone UUID crudo: ${label}`);
    }
  }

  // Idempotencia completa en la segunda corrida (incluyendo update DO $$, archivado y baja M:N)
  const secondPass = applyDatabaseSyncTo06Sql(applied.nextSqlContent, liveBundle, { tablesToSync });
  assert.equal(secondPass.changed, false, 'La segunda corrida tras Fase A + Fase B debe retornar changed === false');
  assert.equal(secondPass.nextSqlContent, applied.nextSqlContent);

  // Invariantes críticas de tests existentes (`expertoSeedInvariants.test.ts` + `step101SqlSchema.test.ts`)
  const sec28Start = applied.nextSqlContent.indexOf('-- 28. Expertos Técnicos');
  assert.ok(sec28Start > 0);
  const sec28 = applied.nextSqlContent.slice(sec28Start);
  const insertCount = (sec28.match(/INSERT INTO\s+public\./gi) ?? []).length;
  const conflictCount = (sec28.match(/ON CONFLICT\s*\(/gi) ?? []).length;
  assert.equal(insertCount - conflictCount, 2, 'Toda nueva sentencia INSERT añadida tras Sección 28 debe incluir ON CONFLICT');
});

test('Step 1.3: validateUpdatedSeedSql rechaza $$ desbalanceados, DELETE en tablas protegidas, marcadores rotos y alteración de DO $$', () => {
  const realSql06 = readReal06Sql();

  const unbalancedDollars = validateUpdatedSeedSql(`${realSql06}\nDO $$ BEGIN NULL; END;`);
  assert.equal(unbalancedDollars.valid, false);
  assert.equal(unbalancedDollars.balancedDollarDelimiters, false);

  const forbiddenDeleteCert = validateUpdatedSeedSql(
    `${realSql06}\nDELETE FROM public.certificado WHERE id = '40000000-0000-0000-0000-000000000001';`,
    realSql06
  );
  assert.equal(forbiddenDeleteCert.valid, false);
  assert.equal(forbiddenDeleteCert.zeroProtectedDeletes, false);

  const forbiddenDeleteEquipo = validateUpdatedSeedSql(
    `${realSql06}\nDELETE FROM public.equipo_auditor WHERE id = '1';`,
    realSql06
  );
  assert.equal(forbiddenDeleteEquipo.valid, false);
  assert.equal(forbiddenDeleteEquipo.zeroProtectedDeletes, false);

  const brokenMarkers = validateUpdatedSeedSql(
    `${realSql06}\n-- [ADMIN_SYNC_BEGIN:certificacion]\nSELECT 1;`,
    realSql06
  );
  assert.equal(brokenMarkers.valid, false);
  assert.equal(brokenMarkers.validManagedMarkers, false);

  const removedSection = validateUpdatedSeedSql(
    realSql06.replace('-- 29. Conglomerado Nestlé Venezuela', '-- Comentario modificado'),
    realSql06
  );
  assert.equal(removedSection.valid, false);
  assert.equal(removedSection.preservedBaseSections, false);

  const tamperedDoBlock = validateUpdatedSeedSql(
    realSql06.replace("v_ov.target_id, v_ov.id_organizacion", "v_ov.target_id, NULL"),
    realSql06
  );
  assert.equal(tamperedDoBlock.valid, false);
  assert.equal(tamperedDoBlock.preservedHistoricalDoBlocks, false);
});
