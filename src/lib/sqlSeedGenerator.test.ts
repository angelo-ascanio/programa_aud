import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTableSyncStatements,
  computeTableSyncDiff,
  formatSqlLiteral,
  getAllGeneratorSupportedTables,
  hasBalancedDollarDelimiters,
  sortRowsForTopologicalInsert,
  tableSupportsDeleteReason,
  tableSupportsUpdatedAt,
} from './sqlSeedGenerator';
import { getSyncTableMetadata } from './sqlSeedSyncCatalog';
import { containsRawUuid } from './zeroUuid';

test('Paso 1.2: formatSqlLiteral serializa todos los tipos PostgreSQL sin introducir delimitadores $$', () => {
  assert.equal(formatSqlLiteral(null), 'NULL');
  assert.equal(formatSqlLiteral(undefined), 'NULL');
  assert.equal(formatSqlLiteral(true), 'TRUE');
  assert.equal(formatSqlLiteral(false), 'FALSE');
  assert.equal(formatSqlLiteral('true', { dataType: 'boolean' }), 'TRUE');
  assert.equal(formatSqlLiteral(42), '42');
  assert.equal(formatSqlLiteral(1.25), '1.25');
  assert.equal(formatSqlLiteral(Number.NaN), 'NULL');
  assert.equal(formatSqlLiteral(Number.POSITIVE_INFINITY), 'NULL');

  const d = new Date('2026-11-27T15:30:00.000Z');
  assert.equal(formatSqlLiteral(d, { dataType: 'date' }), "'2026-11-27'");
  assert.equal(formatSqlLiteral(d), "'2026-11-27T15:30:00.000Z'");
  assert.equal(formatSqlLiteral('08:00:00', { columnName: 'hora_entrada' }), "'08:00:00'");

  const reqMeta = getSyncTableMetadata('requisito');
  assert.equal(
    formatSqlLiteral('4.4_1', { columnName: 'ruta_materializada', meta: reqMeta }),
    "'4.4_1'::ltree"
  );
  assert.equal(
    formatSqlLiteral('', { columnName: 'ruta_materializada', meta: reqMeta }),
    'NULL'
  );

  assert.equal(
    formatSqlLiteral({ author: "O'Reilly", ok: true }, { dataType: 'jsonb' }),
    `'{"author":"O''Reilly","ok":true}'::jsonb`
  );

  assert.equal(formatSqlLiteral("Nestlé's"), "'Nestlé''s'");
  assert.equal(formatSqlLiteral('Línea 1\nLínea 2\t\\fin'), "E'Línea 1\\nLínea 2\\t\\\\fin'");

  // Neutralización segura de $$ en cadenas simples, E-strings y secuencias consecutivas
  const withDollarsSimple = formatSqlLiteral('Texto con $$ bloque $$ interno');
  assert.equal(withDollarsSimple, "'Texto con $' || '$ bloque $' || '$ interno'");
  assert.equal(withDollarsSimple.includes('$$'), false);
  assert.equal(hasBalancedDollarDelimiters(withDollarsSimple), true);

  const withDollarsMultiline = formatSqlLiteral('Línea 1\n$$bloque$$\nLínea 2');
  assert.equal(withDollarsMultiline, "E'Línea 1\\n$' || E'$bloque$' || E'$\\nLínea 2'");
  assert.equal(withDollarsMultiline.includes('$$'), false);
  assert.equal(hasBalancedDollarDelimiters(withDollarsMultiline), true);

  const withQuadDollars = formatSqlLiteral('$$$$');
  assert.equal(withQuadDollars, "'$' || '$' || '$' || '$'");
  assert.equal(withQuadDollars.includes('$$'), false);
});

test('Paso 1.2: sortRowsForTopologicalInsert ordena árboles auto-referenciales, versiones, Sitio 0 y fechas', () => {
  const reqParent = '10000000-0000-0000-0000-000000000001';
  const reqChild = '10000000-0000-0000-0000-000000000002';
  const reqGrandchild = '10000000-0000-0000-0000-000000000003';

  const orderedReqs = sortRowsForTopologicalInsert('requisito', [
    { id: reqGrandchild, id_requisito_padre: reqChild, nivel: 3, ruta_materializada: '4.4_1.4_1_1' },
    { id: reqChild, id_requisito_padre: reqParent, nivel: 2, ruta_materializada: '4.4_1' },
    { id: reqParent, id_requisito_padre: null, nivel: 1, ruta_materializada: '4' },
  ]);
  assert.deepEqual(
    orderedReqs.map((r) => r.id),
    [reqParent, reqChild, reqGrandchild]
  );

  const progOrigin = '20000000-0000-0000-0000-000000000001';
  const progNext = '20000000-0000-0000-0000-000000000002';
  const orderedProgs = sortRowsForTopologicalInsert('programa_auditoria', [
    { id: progNext, id_ciclo_origen: progOrigin, codigo_programa: 'PROG-2027-001' },
    { id: progOrigin, id_ciclo_origen: null, codigo_programa: 'PROG-2026-001' },
  ]);
  assert.deepEqual(
    orderedProgs.map((p) => p.id),
    [progOrigin, progNext]
  );

  const orderedVersions = sortRowsForTopologicalInsert('certificado_version', [
    { id: 'v2', id_certificado: 'c1', version_numero: 2, es_version_actual: true },
    { id: 'v1', id_certificado: 'c1', version_numero: 1, es_version_actual: false },
  ]);
  assert.deepEqual(
    orderedVersions.map((v) => v.id),
    ['v1', 'v2']
  );

  const orderedSites = sortRowsForTopologicalInsert('sitio', [
    { id: 's2', id_certificado_version: 'cv1', numero_sitio: 2 },
    { id: 's0', id_certificado_version: 'cv1', numero_sitio: 0 },
    { id: 's1', id_certificado_version: 'cv1', numero_sitio: 1 },
  ]);
  assert.deepEqual(
    orderedSites.map((s) => s.numero_sitio),
    [0, 1, 2]
  );
});

test('Paso 1.2: computeTableSyncDiff clasifica sin_cambios, nuevas, modificadas, archivadas y bajas M:N con resumen Zero-UUID', () => {
  const certId1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  const certId2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
  const certId3 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
  const orgId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
  const normaId = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
  const estId = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
  const secId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
  const subSecId = 'ffffffff-ffff-4fff-8fff-fffffffffff1';

  const existingCerts = [
    {
      id: certId1,
      id_norma: normaId,
      id_estatus: estId,
      id_sector_iaf: secId,
      id_subsector_iaf: subSecId,
      id_organizacion: orgId,
      numero_certificado: 'FN-QMS-2026-001',
      multisitio: false,
      deleted_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: certId2,
      id_norma: normaId,
      id_estatus: estId,
      id_sector_iaf: secId,
      id_subsector_iaf: subSecId,
      id_organizacion: orgId,
      numero_certificado: 'FN-QMS-2026-002',
      multisitio: false,
      deleted_at: null,
    },
  ];

  const liveCerts = [
    {
      ...existingCerts[0],
      // Timestamps volátiles distintos no deben marcar cambio
      created_at: '2026-11-27T10:00:00Z',
      updated_at: '2026-11-27T10:05:00Z',
    },
    {
      ...existingCerts[1],
      // Mutación de llave única natural
      numero_certificado: 'FN-QMS-2026-002-REV',
      multisitio: true,
    },
    {
      id: certId3,
      id_norma: normaId,
      id_estatus: estId,
      id_sector_iaf: secId,
      id_subsector_iaf: subSecId,
      id_organizacion: orgId,
      numero_certificado: 'FN-EMS-2026-003',
      multisitio: false,
      deleted_at: null,
    },
  ];

  const certDiff = computeTableSyncDiff('certificado', liveCerts, existingCerts);
  assert.equal(certDiff.counts.unchanged, 1);
  assert.equal(certDiff.counts.updated, 1);
  assert.equal(certDiff.counts.new, 1);
  assert.equal(certDiff.summary.hasChanges, true);
  assert.deepEqual(certDiff.summary.sampleLabels, ['FN-QMS-2026-002-REV', 'FN-EMS-2026-003']);

  const updatedItem = certDiff.items.find((i) => i.status === 'updated');
  assert.ok(updatedItem);
  assert.equal(updatedItem.mutatedUniqueKey, true);
  assert.ok(updatedItem.changedColumns.includes('numero_certificado'));

  for (const label of certDiff.summary.sampleLabels) {
    assert.equal(containsRawUuid(label), false);
  }

  // Soft-delete archival transition + Zero-UUID fallback cuando displayLabelColumns tienen UUIDs
  const procId1 = '11111111-1111-4111-8111-111111111111';
  const reqId1 = '22222222-2222-4222-8222-222222222222';
  const reqId2 = '33333333-3333-4333-8333-333333333333';
  const cvId = '44444444-4444-4444-8444-444444444444';

  const mnDiff = computeTableSyncDiff(
    'requisitos_por_proceso',
    [
      { id_proceso: procId1, id_certificado: certId1, id_certificado_version: cvId, id_requisito: reqId1 },
    ],
    [
      { id_proceso: procId1, id_certificado: certId1, id_certificado_version: cvId, id_requisito: reqId1 },
      { id_proceso: procId1, id_certificado: certId1, id_certificado_version: cvId, id_requisito: reqId2 },
    ],
    {
      scopedParentFilter: {
        column: 'id_certificado_version',
        allowedValues: new Set([cvId]),
      },
    }
  );

  assert.equal(mnDiff.counts.unchanged, 1);
  assert.equal(mnDiff.counts.removedMn, 1);
  assert.equal(mnDiff.summary.toArchiveOrDelete, 1);
  for (const label of mnDiff.summary.sampleLabels) {
    assert.equal(containsRawUuid(label), false, `No debe exponerse UUID en sampleLabels: ${label}`);
  }
});

test('Paso 1.2: buildTableSyncStatements genera upserts idempotentes, UPDATE por ID en llaves mutadas, 0 DELETE en protegidas y DELETE acotado en M:N', () => {
  const certId1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  const certId2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
  const certIdArch = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9';

  const diff = computeTableSyncDiff(
    'certificado',
    [
      {
        id: certId1,
        numero_certificado: 'FN-QMS-RENOMBRADO',
        multisitio: true,
        deleted_at: null,
      },
      {
        id: certId2,
        numero_certificado: 'FN-QMS-NUEVO',
        multisitio: false,
        deleted_at: null,
      },
      {
        id: certIdArch,
        numero_certificado: 'FN-QMS-ARCHIVADO',
        multisitio: false,
        deleted_at: '2026-11-20T12:00:00Z',
        deleted_by: null,
        delete_reason: 'Certificado reemplazado',
      },
    ],
    [
      {
        id: certId1,
        numero_certificado: 'FN-QMS-ORIGINAL',
        multisitio: false,
        deleted_at: null,
      },
    ]
  );

  const built = buildTableSyncStatements('certificado', diff);
  assert.equal(built.counts.updatesById, 1);
  assert.equal(built.counts.inserts, 1);
  assert.equal(built.counts.archivedUpserts, 1);
  assert.equal(built.counts.deletedMnLinks, 0);

  // Nunca debe emitir DELETE FROM sobre tablas protegidas
  assert.equal(/\bDELETE\s+FROM\b/i.test(built.sqlBlock), false);
  // Debe emitir UPDATE WHERE id = ... para la llave mutada evitando colisión 23505
  assert.match(built.sqlBlock, /UPDATE public\.certificado SET[\s\S]*numero_certificado = 'FN-QMS-RENOMBRADO'[\s\S]*WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';/);
  // Debe emitir ON CONFLICT (numero_certificado) WHERE deleted_at IS NULL sin sobrescribir id
  assert.match(built.sqlBlock, /ON CONFLICT \(numero_certificado\) WHERE deleted_at IS NULL DO UPDATE SET/);
  assert.equal(built.sqlBlock.includes('id = EXCLUDED.id'), false);
  // Archivado lógico usa ON CONFLICT (id) DO UPDATE con deleted_at y delete_reason
  assert.match(built.sqlBlock, /ON CONFLICT \(id\) DO UPDATE SET[\s\S]*deleted_at = EXCLUDED\.deleted_at/);
  assert.match(built.sqlBlock, /delete_reason = EXCLUDED\.delete_reason/);
  assert.equal(hasBalancedDollarDelimiters(built.sqlBlock), true);

  // Tabla hija sin updated_at (`turnos_por_sitio`) no debe emitir updated_at = NOW()
  assert.equal(tableSupportsUpdatedAt('turnos_por_sitio'), false);
  assert.equal(tableSupportsDeleteReason('turnos_por_sitio'), false);
  const turnosBuilt = buildTableSyncStatements('turnos_por_sitio', [
    {
      id: '55555555-5555-4555-8555-555555555551',
      id_sitio: '66666666-6666-4666-8666-666666666661',
      id_turno: '77777777-7777-4777-8777-777777777771',
      deleted_at: null,
    },
  ]);
  assert.equal(turnosBuilt.sqlBlock.includes('updated_at'), false);
  assert.match(turnosBuilt.sqlBlock, /ON CONFLICT \(id_sitio, id_turno\) WHERE deleted_at IS NULL DO UPDATE SET/);

  // Tabla M:N pura (`requisitos_por_proceso`): ON CONFLICT DO NOTHING + DELETE acotado
  const procId = '11111111-1111-4111-8111-111111111111';
  const cvId = '44444444-4444-4444-8444-444444444444';
  const reqNew = '22222222-2222-4222-8222-222222222222';
  const reqOld = '33333333-3333-4333-8333-333333333333';
  const mnDiff = computeTableSyncDiff(
    'requisitos_por_proceso',
    [{ id_proceso: procId, id_certificado: certId1, id_certificado_version: cvId, id_requisito: reqNew }],
    [{ id_proceso: procId, id_certificado: certId1, id_certificado_version: cvId, id_requisito: reqOld }]
  );
  const mnBuilt = buildTableSyncStatements('requisitos_por_proceso', mnDiff);
  assert.equal(mnBuilt.counts.inserts, 1);
  assert.equal(mnBuilt.counts.deletedMnLinks, 1);
  assert.match(
    mnBuilt.sqlBlock,
    /ON CONFLICT \(id_proceso, id_certificado_version, id_requisito\) DO NOTHING;/
  );
  assert.match(
    mnBuilt.sqlBlock,
    /DELETE FROM public\.requisitos_por_proceso WHERE id_proceso = '11111111-1111-4111-8111-111111111111' AND id_certificado_version = '44444444-4444-4444-8444-444444444444' AND id_requisito = '33333333-3333-4333-8333-333333333333';/
  );

  // Tabla derivada por trigger (`equipo_auditor`): sin INSERT/DELETE manual
  const derivedBuilt = buildTableSyncStatements('equipo_auditor', [
    { id_auditoria: 'a1', id_auditor: 'u1', rol_auditor: 'AUDITOR_LIDER' },
  ]);
  assert.equal(derivedBuilt.statements.length, 0);
  assert.equal(derivedBuilt.warnings.length, 1);
  assert.equal(getAllGeneratorSupportedTables().length, 65);
});
