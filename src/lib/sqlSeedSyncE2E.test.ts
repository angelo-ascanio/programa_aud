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
} from './sqlSeedFileUpdater';
import {
  applyNormas07Sync,
  parseNormas07SqlRecords,
  previewNormas07Sync,
  resolveExtraNormaSyncTarget,
} from './sqlNormasSeedSync';
import {
  SQL_SEED_SYNC_BLOCKS,
  getAllSyncSectionSpecs,
  resolveSyncSelectionPlan,
} from './sqlSeedSyncCatalog';
import {
  extractSeededUserIdsFrom05Sql,
  filterClientOrganizationAccessWith05Users,
  validateSeedSyncRequestPayload,
} from './sqlSeedSyncClient';
import { canAccessSubview, normalizeDomainSubview } from './accessControl';
import { canAccessRoute, type UserProfile } from './healthCheck';
import { HISTORICAL_CLAUSE_UUID_BY_EXTERNAL_KEY } from './requisitoCsvImporter';
import { containsRawUuid } from './zeroUuid';

const QUERIES_DIR = path.resolve(process.cwd(), 'public/supabase/queries');
const PATH_05 = path.join(QUERIES_DIR, '05_usuarios.sql');
const PATH_06 = path.join(QUERIES_DIR, '06_datos_prueba.sql');
const PATH_07 = path.join(QUERIES_DIR, '07_normas_requisitos_csv.sql');

function readSqlFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

function makeProfile(role: UserProfile['role'], status: UserProfile['status'] = 'APPROVED'): UserProfile {
  return {
    id: 'a0000000-0000-0000-0000-000000000001',
    email: `${role.toLowerCase()}@fondonorma.test`,
    nombre: `Usuario ${role}`,
    role,
    status,
    requested_at: '2026-01-01T00:00:00Z',
  };
}

test('E2E Escenario 1: Bloque 2 Certificación -> Certificado (cascada Padre->Hijos, edición numero_certificado, DO $fnver$ v2 e idempotencia estricta)', () => {
  const sql06 = readSqlFile(PATH_06);
  const parsed = parseExistingSqlSeedRecords(sql06);

  // 1. Verificar resolución topológica de la sección certificacion.certificado
  const plan = resolveSyncSelectionPlan(['certificacion.certificado']);
  assert.deepEqual(plan.targetFiles, ['06_datos_prueba.sql']);
  assert.equal(plan.hasSpecialNormasCase, false);

  const expectedCascade = [
    'certificado',
    'certificado_version',
    'alcance',
    'sitio',
    'proceso',
    'procesos_por_sitio',
    'requisitos_por_proceso',
    'turno',
    'turnos_por_sitio',
  ];
  for (const tbl of expectedCascade) {
    assert.ok(plan.primaryTables.includes(tbl), `Debe incluir ${tbl} en la cascada de Certificado`);
  }

  // Verificar orden topológico padre -> hijo en tablesFor06
  const pos = (t: string) => plan.tablesFor06.indexOf(t);
  assert.ok(pos('certificado') < pos('certificado_version'));
  assert.ok(pos('certificado_version') < pos('alcance'));
  assert.ok(pos('certificado_version') < pos('sitio'));
  assert.ok(pos('certificado_version') < pos('proceso'));
  assert.ok(pos('proceso') < pos('procesos_por_sitio'));
  assert.ok(pos('sitio') < pos('procesos_por_sitio'));
  assert.ok(pos('proceso') < pos('requisitos_por_proceso'));
  assert.ok(pos('turno') < pos('turnos_por_sitio'));

  // 2. Simular mutación real de Escenario 1 en memoria sobre FN-ISMS-2026-007 (CYBERCLOUD)
  const targetCertId = '40000000-0000-0000-0000-000000000007';
  const existingCert = parsed.byIdByTable['certificado']?.[targetCertId]?.row;
  assert.ok(existingCert, 'Debe existir certificado FN-ISMS-2026-007 en 06_datos_prueba.sql');

  const baseCertVersion = (parsed.rowsByTable['certificado_version'] ?? []).find(
    (cv) => cv.id_certificado === targetCertId && cv.version_numero === 1
  );
  assert.ok(baseCertVersion, 'Debe existir v1 del certificado de prueba');

  const newV2Id = '41000000-0000-0000-0000-000000000907';
  const newAlcanceId = '42000000-0000-0000-0000-000000000907';
  const newSitioId = '50000000-0000-0000-0000-000000000907';
  const newProcesoId = '60000000-0000-0000-0000-000000000907';
  const newPpsId = '61000000-0000-0000-0000-000000000907';
  const newTurnoId = '51000000-0000-0000-0000-000000000907';
  const newTpsId = '52000000-0000-0000-0000-000000000907';
  const firstIso27001Req = parsed.rowsByTable['requisitos_por_proceso']?.find(
    (r) => typeof r.id_requisito === 'string'
  )?.id_requisito as string;
  assert.ok(firstIso27001Req, 'Debe existir al menos un UUID de requisito referenciable');

  const mutatedCerts = (parsed.rowsByTable['certificado'] ?? []).map((c) =>
    c.id === targetCertId ? { ...c, numero_certificado: 'FN-ISMS-2026-007-E2E' } : c
  );
  const mutatedVersions = [
    ...(parsed.rowsByTable['certificado_version'] ?? []).map((cv) =>
      cv.id === baseCertVersion.id ? { ...cv, es_version_actual: false } : cv
    ),
    {
      ...baseCertVersion,
      id: newV2Id,
      version_numero: 2,
      es_version_actual: true,
      notas_version: 'Versión E2E verificada',
    },
  ];
  const mutatedAlcances = [
    ...(parsed.rowsByTable['alcance'] ?? []),
    {
      id: newAlcanceId,
      id_certificado: targetCertId,
      alcance_es: 'Servicios de nube segura E2E.',
      alcance_en: 'Secure cloud services E2E.',
      deleted_at: null,
    },
  ];
  const mutatedSitios = [
    ...(parsed.rowsByTable['sitio'] ?? []),
    {
      id: newSitioId,
      id_certificado: targetCertId,
      id_certificado_version: newV2Id,
      numero_sitio: 0,
      nombre_sitio: 'Data Center Chacao E2E',
      direccion: 'Av. Francisco de Miranda',
      personal_count: 35,
      deleted_at: null,
    },
  ];
  const mutatedProcesos = [
    ...(parsed.rowsByTable['proceso'] ?? []),
    {
      id: newProcesoId,
      id_certificado: targetCertId,
      id_certificado_version: newV2Id,
      nombre_proceso: 'Seguridad Cloud E2E',
      tipo: 'Misional',
      deleted_at: null,
    },
  ];
  const mutatedPps = [
    ...(parsed.rowsByTable['procesos_por_sitio'] ?? []),
    {
      id: newPpsId,
      id_certificado: targetCertId,
      id_certificado_version: newV2Id,
      id_sitio: newSitioId,
      id_proceso: newProcesoId,
      deleted_at: null,
    },
  ];
  const mutatedReqs = [
    ...(parsed.rowsByTable['requisitos_por_proceso'] ?? []),
    {
      id_proceso: newProcesoId,
      id_certificado: targetCertId,
      id_certificado_version: newV2Id,
      id_requisito: firstIso27001Req,
    },
  ];
  const mutatedTurnos = [
    ...(parsed.rowsByTable['turno'] ?? []),
    {
      id: newTurnoId,
      hora_entrada: '07:30:00',
      hora_salida: '15:30:00',
      observacion: 'Turno SOC E2E',
      deleted_at: null,
    },
  ];
  const mutatedTps = [
    ...(parsed.rowsByTable['turnos_por_sitio'] ?? []),
    {
      id: newTpsId,
      id_sitio: newSitioId,
      id_turno: newTurnoId,
      deleted_at: null,
    },
  ];

  const liveSubset: Record<string, Array<Record<string, unknown>>> = {
    certificado: mutatedCerts,
    certificado_version: mutatedVersions,
    alcance: mutatedAlcances,
    sitio: mutatedSitios,
    proceso: mutatedProcesos,
    procesos_por_sitio: mutatedPps,
    requisitos_por_proceso: mutatedReqs,
    turno: mutatedTurnos,
    turnos_por_sitio: mutatedTps,
  };

  // Preview debe mostrar cero UUIDs crudos en resúmenes/fragmentos
  const preview = previewDatabaseSyncTo06Sql(sql06, liveSubset, {
    tablesToSync: expectedCascade,
  });
  assert.equal(preview.changed, true);
  assert.equal(preview.validation.valid, true, preview.validation.errors.join(' | '));
  for (const snippet of preview.diffSnippets) {
    assert.equal(containsRawUuid(snippet), false, `Fragmento expuso UUID: ${snippet}`);
  }
  for (const tbl of expectedCascade) {
    assert.equal(preview.summaryByTable[tbl]?.hasChanges, true, `Tabla ${tbl} debe reportar cambios`);
    for (const label of preview.summaryByTable[tbl]?.sampleLabels ?? []) {
      assert.equal(containsRawUuid(label), false, `Etiqueta expuso UUID en ${tbl}: ${label}`);
    }
  }

  // Apply debe usar DO $fnver$ para certificado_version (evita P0001 en 2da corrida SQL)
  const applied = applyDatabaseSyncTo06Sql(sql06, liveSubset, {
    tablesToSync: expectedCascade,
  });
  assert.equal(applied.changed, true);
  assert.equal(applied.validation.valid, true, applied.validation.errors.join(' | '));
  assert.equal(applied.validation.balancedDollarDelimiters, true);
  assert.equal(applied.validation.zeroProtectedDeletes, true);
  assert.match(applied.nextSqlContent, /DO \$fnver\$/);
  assert.match(applied.nextSqlContent, /FN-ISMS-2026-007-E2E/);
  assert.deepEqual(
    findManagedSyncBlocks(applied.nextSqlContent).map((b) => b.key),
    ['certificacion']
  );

  // Segunda corrida con el mismo estado vivo -> 0 cambios (idempotencia estricta)
  const pass2 = applyDatabaseSyncTo06Sql(applied.nextSqlContent, liveSubset, {
    tablesToSync: expectedCascade,
  });
  assert.equal(pass2.changed, false);
  assert.equal(pass2.nextSqlContent, applied.nextSqlContent);
  assert.equal(pass2.counts.tablesWithChanges, 0);
});

test('E2E Escenario 2: Bloque 1 Auditoría (sub-sección individual vs bloque completo, triggers y orden topológico)', () => {
  const sql06 = readSqlFile(PATH_06);
  const parsed = parseExistingSqlSeedRecords(sql06);

  // 1. Sub-sección individual (1.3 Fecha)
  const singlePlan = resolveSyncSelectionPlan(['auditorias.designacion.fecha']);
  assert.deepEqual(singlePlan.primaryTables, ['auditoria_fecha']);
  assert.ok(singlePlan.fkSupportTables.includes('auditoria'));
  assert.ok(singlePlan.fkSupportTables.includes('alcance'));

  // 2. Sub-sección 3. Auditor marca equipo_auditor como tabla derivada por triggers
  const auditorPlan = resolveSyncSelectionPlan(['auditorias.auditor']);
  assert.ok(auditorPlan.derivedTables.includes('equipo_auditor'));
  assert.equal(auditorPlan.primaryTables.includes('equipo_auditor'), false);
  assert.ok(auditorPlan.primaryTables.includes('equipo_auditor_sitio'));

  // 3. Bloque completo Auditoría (vía all sections o resumen)
  const auditoriasBlock = SQL_SEED_SYNC_BLOCKS.find((b) => b.id === 'auditorias');
  assert.ok(auditoriasBlock);
  const fullBlockPlan = resolveSyncSelectionPlan(auditoriasBlock.sections.map((s) => s.id));
  assert.deepEqual(fullBlockPlan.selectedBlocksComplete, ['auditorias']);
  assert.ok(
    fullBlockPlan.tablesFor06.indexOf('alcance') < fullBlockPlan.tablesFor06.indexOf('auditoria'),
    'alcance debe preceder a auditoria (trg_validar_auditoria_requiere_alcance)'
  );
  assert.ok(
    fullBlockPlan.tablesFor06.indexOf('alcance_certificado_compartido') <
      fullBlockPlan.tablesFor06.indexOf('auditoria')
  );
  assert.ok(
    fullBlockPlan.tablesFor06.indexOf('auditoria_fecha') <
      fullBlockPlan.tablesFor06.indexOf('hallazgo')
  );

  // 4. Mutar auditoria_fecha y equipo_auditor_sitio; aplicar primero solo auditoria_fecha
  const targetAuditId = '80000000-0000-0000-0000-000000000201';
  const targetSpaId = parsed.rowsByTable['sitios_por_auditoria']?.find(
    (s) => s.id_auditoria === targetAuditId
  )?.id as string;
  assert.ok(targetSpaId, 'Debe existir sitios_por_auditoria para AUD-FAR-2026-001');

  const newFechaRow = {
    id: '81000000-0000-0000-0000-000000000951',
    id_auditoria: targetAuditId,
    numero_secuencia: 2,
    tag: 'Reprogramación',
    tipo_fecha: 'PREPROGRAMADA_MES',
    anio: 2027,
    mes: 2,
    fecha_inicio: null,
    fecha_fin: null,
    observacion: 'Reprogramación E2E Escenario 2',
    deleted_at: null,
  };
  const mutatedFechas = [...(parsed.rowsByTable['auditoria_fecha'] ?? []), newFechaRow];

  const existingEas = parsed.rowsByTable['equipo_auditor_sitio']?.find(
    (e) => e.id_sitios_por_auditoria === targetSpaId
  );
  assert.ok(existingEas, 'Debe existir equipo_auditor_sitio inicial en AUD-FAR-2026-001');

  const newAuditorId = parsed.rowsByTable['auditor']?.find(
    (a) => a.id !== existingEas.id_auditor
  )?.id as string;
  assert.ok(newAuditorId);

  const mutatedEas = [
    ...(parsed.rowsByTable['equipo_auditor_sitio'] ?? []).map((e) =>
      e.id === existingEas.id ? { ...e, tiempo_auditoria: 1.75 } : e
    ),
    {
      id: '84000000-0000-0000-0000-000000000951',
      id_sitios_por_auditoria: targetSpaId,
      id_auditor: newAuditorId,
      rol_auditor: 'AUDITOR',
      tiempo_auditoria: 0.25,
      asignacion_completa_sitio: true,
      deleted_at: null,
    },
  ];

  // Paso A: sincronizar únicamente `auditorias.designacion.fecha`
  const singleApplied = applyDatabaseSyncTo06Sql(
    sql06,
    { auditoria_fecha: mutatedFechas, equipo_auditor_sitio: mutatedEas },
    { tablesToSync: ['auditoria_fecha'] }
  );
  assert.equal(singleApplied.changed, true);
  assert.equal(singleApplied.validation.valid, true, singleApplied.validation.errors.join(' | '));
  assert.ok(singleApplied.nextSqlContent.includes('81000000-0000-0000-0000-000000000951'));
  assert.equal(
    singleApplied.nextSqlContent.includes('84000000-0000-0000-0000-000000000951'),
    false,
    'Sincronización parcial de 1.3 Fecha no debe incluir equipo_auditor_sitio'
  );

  // Paso B: sincronizar bloque completo (auditoria_fecha + equipo_auditor_sitio)
  const fullBlockTables = fullBlockPlan.tablesFor06;
  const fullLive: Record<string, Array<Record<string, unknown>>> = {};
  for (const t of fullBlockTables) {
    fullLive[t] = (parsed.rowsByTable[t] ?? []).map((r) => ({ ...r }));
  }
  fullLive.auditoria_fecha = mutatedFechas;
  fullLive.equipo_auditor_sitio = mutatedEas;

  const blockApplied = applyDatabaseSyncTo06Sql(singleApplied.nextSqlContent, fullLive, {
    tablesToSync: fullBlockTables,
  });
  assert.equal(blockApplied.changed, true);
  assert.equal(blockApplied.validation.valid, true, blockApplied.validation.errors.join(' | '));
  assert.ok(blockApplied.nextSqlContent.includes('81000000-0000-0000-0000-000000000951'));
  assert.ok(blockApplied.nextSqlContent.includes('84000000-0000-0000-0000-000000000951'));
  assert.deepEqual(
    findManagedSyncBlocks(blockApplied.nextSqlContent).map((b) => b.key),
    ['auditorias']
  );

  // Paso C: re-ejecución idéntica -> 0 diferencias
  const blockPass2 = applyDatabaseSyncTo06Sql(blockApplied.nextSqlContent, fullLive, {
    tablesToSync: fullBlockTables,
  });
  assert.equal(blockPass2.changed, false);
  assert.equal(blockPass2.nextSqlContent, blockApplied.nextSqlContent);
  assert.deepEqual(getCanonicalAdminSyncBlockOrder(), ['extra', 'certificacion', 'auditorias']);
});

test('E2E Escenario 3: Caso Especial Extra -> Norma sobre 07_normas_requisitos_csv.sql (8 normas, 2188 cláusulas, 2684 traducciones y 7 UUIDs históricos)', () => {
  // 1. Verificar enrutamiento exclusivo hacia 07_normas_requisitos_csv.sql
  const routing = resolveExtraNormaSyncTarget(['extra.norma']);
  assert.equal(routing.includesExtraNorma, true);
  assert.equal(routing.targetFileForNormas, '07_normas_requisitos_csv.sql');
  assert.equal(routing.alsoTouches06DatosPrueba, false);
  assert.deepEqual(routing.tablesFor06, []);
  assert.deepEqual(routing.tablesFor07, ['norma', 'requisito', 'requisito_traduccion']);

  const sql07 = readSqlFile(PATH_07);
  const parsed07 = parseNormas07SqlRecords(sql07);
  assert.equal(parsed07.norma.length, 8);
  assert.equal(parsed07.requisito.length, 2188);
  assert.equal(parsed07.requisito_traduccion.length, 2684);

  // Verificar preservación inicial de los 7 UUIDs históricos ISO 9001:2015
  const historicalUuids = Object.values(HISTORICAL_CLAUSE_UUID_BY_EXTERNAL_KEY);
  assert.equal(historicalUuids.length, 7);
  for (const uuid of historicalUuids) {
    assert.ok(
      parsed07.requisito.some((r) => r.id === uuid),
      `Falta UUID histórico ${uuid} en 07_normas_requisitos_csv.sql`
    );
  }

  // 2. Mutar cláusula 4.1 de ISO 9001:2015: obligatorio_origen = 'MANUAL' + traducción ES
  const iso9001Id = 'e0000000-0000-0000-0000-000000009001';
  const req41 = parsed07.requisito.find(
    (r) => r.id_norma === iso9001Id && r.codigo === '4.1'
  );
  assert.ok(req41, 'Debe existir cláusula 4.1 en ISO 9001:2015');

  const mutatedReqs = parsed07.requisito.map((r) =>
    r.id === req41.id
      ? { ...r, es_obligatorio: false, obligatorio_origen: 'MANUAL' }
      : r
  );
  const mutatedTraducciones = parsed07.requisito_traduccion.map((t) =>
    t.id_requisito === req41.id && t.lang === 'es'
      ? { ...t, title: 'Conocimiento de la organización y de su contexto (E2E)' }
      : t
  );

  const liveNormasDataset = {
    norma: parsed07.norma,
    requisito: mutatedReqs,
    requisito_traduccion: mutatedTraducciones,
  };

  // Preview Zero-UUID
  const preview = previewNormas07Sync(sql07, liveNormasDataset);
  assert.equal(preview.changed, true);
  assert.equal(preview.validation.valid, true, preview.validation.errors.join(' | '));
  assert.equal(preview.historicalUuidCheck.valid, true);
  assert.equal(preview.counts.normasActive, 8);
  assert.equal(preview.counts.requisitosActive, 2188);
  assert.equal(preview.counts.traduccionesActive, 2684);
  for (const snippet of preview.diffSnippets) {
    assert.equal(containsRawUuid(snippet), false, `Snippet de Norma expuso UUID: ${snippet}`);
  }

  // Apply 07_normas_requisitos_csv.sql
  const applied = applyNormas07Sync(sql07, liveNormasDataset);
  assert.equal(applied.changed, true);
  assert.equal(applied.validation.valid, true, applied.validation.errors.join(' | '));
  assert.equal(applied.validation.validLtreePaths, true);
  assert.equal(applied.validation.validTopologicalOrder, true);
  assert.equal(applied.validation.historicalUuidsPreserved, true);
  assert.equal(applied.validation.hasRequiredConflictTargets, true);
  assert.equal(applied.validation.zeroProtectedDeletes, true);
  assert.equal(applied.validation.balancedDollarDelimiters, true);
  assert.match(applied.nextSqlContent, /Conocimiento de la organización y de su contexto \(E2E\)/);
  assert.match(applied.nextSqlContent, /'MANUAL'/);

  // Re-parsear el 07 generado e idempotencia estricta en segunda corrida
  const pass2 = applyNormas07Sync(applied.nextSqlContent, liveNormasDataset);
  assert.equal(pass2.changed, false);
  assert.equal(pass2.nextSqlContent, applied.nextSqlContent);
  assert.equal(pass2.counts.tablesWithChanges, 0);
});

test('E2E Escenario 4: Gobernanza RBAC (#database-sync solo ADMIN), validación Zero-UUID de payload y filtro 05_usuarios.sql', () => {
  // 1. Acceso exclusivo de ADMIN aprobado a ruta #/database-sync
  const admin = makeProfile('ADMIN', 'APPROVED');
  const worker = makeProfile('WORKER', 'APPROVED');
  const auditor = makeProfile('AUDITOR', 'APPROVED');
  const client = makeProfile('CLIENT', 'APPROVED');
  const pendingAdmin = makeProfile('ADMIN', 'PENDING');
  const rejectedAdmin = makeProfile('ADMIN', 'REJECTED');

  assert.equal(canAccessRoute(admin, 'database-sync'), true);
  assert.equal(canAccessSubview(admin, 'database-sync'), true);

  for (const denied of [worker, auditor, client, pendingAdmin, rejectedAdmin]) {
    assert.equal(canAccessRoute(denied, 'database-sync'), false);
    assert.equal(canAccessSubview(denied, 'database-sync'), false);
  }

  // Normalización válida de subviews del catálogo
  assert.equal(normalizeDomainSubview('certificacion', 'vinculo'), 'vinculo');
  assert.equal(getAllSyncSectionSpecs().length, 25);

  // 2. Validación de carga útil /api/admin/db/seed-sync/*
  const validPayload = validateSeedSyncRequestPayload({
    selectedSectionIds: ['certificacion.certificado', 'certificacion.certificado', 'extra.norma'],
    includeFkSupport: true,
  });
  assert.equal(validPayload.ok, true);
  if (validPayload.ok) {
    assert.deepEqual(validPayload.selectedSectionIds, [
      'certificacion.certificado',
      'extra.norma',
    ]);
    assert.equal(validPayload.includeFkSupport, true);
  }

  const invalidEmpty = validateSeedSyncRequestPayload({ selectedSectionIds: [] });
  assert.equal(invalidEmpty.ok, false);

  const invalidUuidSection = validateSeedSyncRequestPayload({
    selectedSectionIds: ['40000000-0000-0000-0000-000000000001'],
  });
  assert.equal(invalidUuidSection.ok, false);
  if (!invalidUuidSection.ok) {
    assert.equal(containsRawUuid(invalidUuidSection.error), false);
  }

  // 3. Aislamiento FK entre 05_usuarios.sql y client_organization_access
  const sql05 = readSqlFile(PATH_05);
  const seededIds05 = extractSeededUserIdsFrom05Sql(sql05);
  assert.ok(seededIds05.size >= 4, '05_usuarios.sql debe contener usuarios sembrados');

  const firstSeededUserId = Array.from(seededIds05)[0];
  const dynamicUserUuid = '99999999-9999-4999-8999-999999999999';
  const dynamicApproverUuid = '88888888-8888-4888-8888-888888888888';

  const filtered = filterClientOrganizationAccessWith05Users(
    [
      {
        id: 'ca000000-0000-0000-0000-000000000001',
        id_usuario: firstSeededUserId,
        id_organizacion: '30000000-0000-0000-0000-000000000001',
        estado: 'APPROVED',
        aprobado_por: dynamicApproverUuid,
      },
      {
        id: 'ca000000-0000-0000-0000-000000000002',
        id_usuario: dynamicUserUuid,
        id_organizacion: '30000000-0000-0000-0000-000000000001',
        estado: 'APPROVED',
        aprobado_por: firstSeededUserId,
      },
    ],
    seededIds05
  );

  assert.equal(filtered.rows.length, 1);
  assert.equal(filtered.excludedCount, 1);
  assert.equal(filtered.clearedApproverCount, 1);
  assert.equal(filtered.rows[0]?.aprobado_por, null);
  for (const w of filtered.warnings) {
    assert.equal(containsRawUuid(w), false);
  }
});
