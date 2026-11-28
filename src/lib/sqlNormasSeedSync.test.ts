import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  NORMAS_07_BUILD_SEED_NOTE_ES,
  NORMAS_07_TARGET_FILE,
  applyNormas07Sync,
  build06BaseNormaFkStubSql,
  buildNormas07SqlDocument,
  computeNormas07SyncDiff,
  parseNormas07SqlRecords,
  previewNormas07Sync,
  resolveExtraNormaSyncTarget,
  sortRequisitosTopologicallyFor07,
  validateNormas07Sql,
  verifyHistoricalIso9001Uuids,
} from './sqlNormasSeedSync';
import {
  HISTORICAL_CLAUSE_UUID_BY_EXTERNAL_KEY,
  LTREE_PATH_PATTERN,
} from './requisitoCsvImporter';
import { containsRawUuid } from './zeroUuid';

const SQL_07_PATH = path.resolve(
  process.cwd(),
  'public',
  'supabase',
  'queries',
  '07_normas_requisitos_csv.sql'
);
const SQL_06_PATH = path.resolve(
  process.cwd(),
  'public',
  'supabase',
  'queries',
  '06_datos_prueba.sql'
);

function readReal07Sql(): string {
  return fs.readFileSync(SQL_07_PATH, 'utf8');
}

function readReal06Sql(): string {
  return fs.readFileSync(SQL_06_PATH, 'utf8');
}

test('Step 2.1 Enrutamiento: Extra → Norma apunta exclusivamente a 07_normas_requisitos_csv.sql y nunca a 06_datos_prueba.sql', () => {
  const onlyNorma = resolveExtraNormaSyncTarget(['extra.norma']);
  assert.equal(onlyNorma.includesExtraNorma, true);
  assert.equal(onlyNorma.targetFileForNormas, '07_normas_requisitos_csv.sql');
  assert.deepEqual(onlyNorma.routedTables, ['norma', 'requisito', 'requisito_traduccion']);
  assert.equal(onlyNorma.alsoTouches06DatosPrueba, false);
  assert.deepEqual(onlyNorma.tablesFor06, []);
  assert.deepEqual(onlyNorma.tablesFor07, ['norma', 'requisito', 'requisito_traduccion']);

  const mixedWithCert = resolveExtraNormaSyncTarget(['extra.norma', 'extra.acreditacion']);
  assert.equal(mixedWithCert.includesExtraNorma, true);
  assert.equal(mixedWithCert.alsoTouches06DatosPrueba, true);
  assert.deepEqual(mixedWithCert.tablesFor07, ['norma', 'requisito', 'requisito_traduccion']);
  assert.equal(mixedWithCert.tablesFor06.includes('norma'), false);
  assert.equal(mixedWithCert.tablesFor06.includes('requisito'), false);
  assert.equal(mixedWithCert.tablesFor06.includes('requisito_traduccion'), false);
  assert.equal(mixedWithCert.tablesFor06.includes('acreditacion_norma'), true);
});

test('Step 2.1 Parseo y Baseline Real 07_normas_requisitos_csv.sql: 8 normas, 2188 cláusulas, 2684 traducciones, 7 UUIDs históricos y 0 cambios contra sí mismo', () => {
  const real07 = readReal07Sql();
  const parsed = parseNormas07SqlRecords(real07);

  assert.equal(parsed.norma.length, 8);
  assert.equal(parsed.requisito.length, 2188);
  assert.equal(parsed.requisito_traduccion.length, 2684);

  // No debe inyectar propiedad sintética `vigente`
  assert.equal('vigente' in parsed.norma[0], false);

  // Los 7 UUIDs históricos ISO 9001:2015 deben estar presentes e intactos
  const histCheck = verifyHistoricalIso9001Uuids(parsed.requisito, real07);
  assert.equal(histCheck.valid, true, histCheck.errors.join(' | '));
  assert.equal(histCheck.preservedKeys.length, 7);
  assert.equal(histCheck.missingKeys.length, 0);

  // Validación integral del archivo real 07
  const validation = validateNormas07Sql(real07);
  assert.equal(validation.valid, true, validation.errors.join(' | '));
  assert.equal(validation.validLtreePaths, true);
  assert.equal(validation.validTopologicalOrder, true);
  assert.equal(validation.historicalUuidsPreserved, true);
  assert.equal(validation.zeroProtectedDeletes, true);
  assert.equal(validation.balancedDollarDelimiters, true);
  assert.equal(validation.ltreeCastCount, 2188);

  // Preview contra el mismo estado vivo -> sin cambios (0 falsos positivos)
  const preview = previewNormas07Sync(real07, {
    norma: parsed.norma,
    requisito: parsed.requisito,
    requisito_traduccion: parsed.requisito_traduccion,
  });

  assert.equal(preview.targetFile, NORMAS_07_TARGET_FILE);
  assert.equal(preview.changed, false);
  assert.equal(preview.nextSqlContent, real07);
  assert.equal(preview.counts.tablesWithChanges, 0);
  assert.equal(preview.summaryByTable.norma.unchanged, 8);
  assert.equal(preview.summaryByTable.requisito.unchanged, 2188);
  assert.equal(preview.summaryByTable.requisito_traduccion.unchanged, 2684);
  assert.equal(preview.buildNormasSeedNoteEs, NORMAS_07_BUILD_SEED_NOTE_ES);
});

test('Step 2.1 Detección y Reconciliación Completa: nueva norma #9, overrides MANUAL, HTML ES/EN con $$ y comillas, orden topológico e idempotencia', () => {
  const real07 = readReal07Sql();
  const real06 = readReal06Sql();
  const parsed = parseNormas07SqlRecords(real07);

  const norma9Id = 'e0000000-0000-0000-0000-000000037001';
  const req9RootId = 'a9000000-0000-0000-0000-000000000001';
  const req9ChildId = 'a9000000-0000-0000-0000-000000000002';
  const req9GrandChildId = 'a9000000-0000-0000-0000-000000000003';
  const tr9EsId = 'b9000000-0000-0000-0000-000000000001';
  const tr9EnId = 'b9000000-0000-0000-0000-000000000002';

  // Mutar una norma existente
  const liveNormas = parsed.norma.map((n) =>
    n.codigo === 'ISO 50001:2018'
      ? { ...n, titulo: 'Sistemas de Gestión de la Energía — Requisitos Actualizados' }
      : { ...n }
  );
  // Agregar Norma #9
  liveNormas.push({
    id: norma9Id,
    esquema: 'SGAS - Antisoborno',
    codigo: 'ISO 37001:2016',
    titulo: 'Sistemas de Gestión Antisoborno — Requisitos con orientación para su uso',
    estatus: 'Vigente',
    fecha_publicacion: '2016-10-15',
    norma: 'ISO 37001:2016',
    deleted_at: null,
    deleted_by: null,
    delete_reason: null,
  });

  // Mutar requisito ISO 9001:2015 `4.4` a `es_obligatorio = TRUE, obligatorio_origen = 'MANUAL'`
  const liveRequisitos = parsed.requisito.map((r) => {
    if (r.external_key === 'clause_iso_9001_2015_0015') {
      return {
        ...r,
        es_obligatorio: true,
        obligatorio_origen: 'MANUAL',
      };
    }
    return { ...r };
  });

  // Insertar árbol de 3 niveles de Norma #9 DESORDENADO (nieto antes que hijo, hijo antes que padre)
  liveRequisitos.unshift(
    {
      id: req9GrandChildId,
      id_norma: norma9Id,
      id_requisito_padre: req9ChildId,
      codigo: '4.1.1',
      ruta_materializada: '4.4_1.4_1_1',
      explicit_code: true,
      external_key: null,
      es_obligatorio: true,
      obligatorio_origen: 'MANUAL',
      deleted_at: null,
      deleted_by: null,
      delete_reason: null,
    },
    {
      id: req9ChildId,
      id_norma: norma9Id,
      id_requisito_padre: req9RootId,
      codigo: '4.1',
      ruta_materializada: '4.4_1',
      explicit_code: false,
      external_key: null,
      es_obligatorio: true,
      obligatorio_origen: 'AUTO_TEXT',
      deleted_at: null,
      deleted_by: null,
      delete_reason: null,
    },
    {
      id: req9RootId,
      id_norma: norma9Id,
      id_requisito_padre: null,
      codigo: '4',
      ruta_materializada: '4',
      explicit_code: false,
      external_key: null,
      es_obligatorio: false,
      obligatorio_origen: 'AUTO_TEXT',
      deleted_at: null,
      deleted_by: null,
      delete_reason: null,
    }
  );

  // Editar una traducción ES existente e insertar ES/EN de Norma #9 con `$$`, comillas y saltos de línea
  const liveTraducciones = parsed.requisito_traduccion.map((tr) => {
    if (tr.id_requisito === HISTORICAL_CLAUSE_UUID_BY_EXTERNAL_KEY.clause_iso_9001_2015_0007 && tr.lang === 'es') {
      return {
        ...tr,
        title: "Comprensión de la organización y de su contexto 'revisado'",
        content_html: '<div>\n<p>La organización debe determinar cuestiones externas e internas (presupuesto $$100).</p>\n</div>',
      };
    }
    return { ...tr };
  });

  liveTraducciones.push(
    {
      id: tr9EsId,
      id_requisito: req9ChildId,
      lang: 'es',
      title: 'Comprensión de la organización (ISO 37001)',
      content_html: '<p>Debe evaluar riesgos de soborno con costo $$0 y criterio \'objetivo\'.</p>',
      deleted_at: null,
      deleted_by: null,
    },
    {
      id: tr9EnId,
      id_requisito: req9ChildId,
      lang: 'en',
      title: 'Understanding the organization (ISO 37001)',
      content_html: '<p>The organization shall evaluate bribery risks ("zero tolerance").</p>',
      deleted_at: null,
      deleted_by: null,
    }
  );

  const applyRes = applyNormas07Sync(
    real07,
    {
      norma: liveNormas,
      requisito: liveRequisitos,
      requisito_traduccion: liveTraducciones,
    },
    {
      requisitoBatchSize: 200,
      traduccionBatchSize: 150,
      existing06SqlContent: real06,
      live06RowsByTable: {
        certificado: [
          {
            id: '49000000-0000-0000-0000-000000000099',
            id_norma: norma9Id,
            numero_certificado: '37001-001-01-01-2026',
            deleted_at: null,
          },
        ],
      },
    }
  );

  assert.equal(applyRes.changed, true);
  assert.equal(applyRes.validation.valid, true, applyRes.validation.errors.join(' | '));
  assert.equal(applyRes.validation.balancedDollarDelimiters, true);
  assert.equal(applyRes.validation.dollarDelimiterCount, 0);
  assert.equal(applyRes.validation.zeroProtectedDeletes, true);
  assert.equal(applyRes.validation.validLtreePaths, true);
  assert.equal(applyRes.validation.validTopologicalOrder, true);
  assert.equal(applyRes.validation.historicalUuidsPreserved, true);
  assert.equal(applyRes.validation.hasRequiredConflictTargets, true);

  // Resumen exacto de diferencias
  assert.equal(applyRes.summaryByTable.norma.toInsert, 1);
  assert.equal(applyRes.summaryByTable.norma.toUpdate, 1);
  assert.equal(applyRes.summaryByTable.requisito.toInsert, 3);
  assert.equal(applyRes.summaryByTable.requisito.toUpdate, 1);
  assert.equal(applyRes.summaryByTable.requisito_traduccion.toInsert, 2);
  assert.equal(applyRes.summaryByTable.requisito_traduccion.toUpdate, 1);

  // Zero-UUID estricto en sampleLabels, diffSnippets y warnings
  for (const s of applyRes.orderedSummaries) {
    for (const lbl of s.sampleLabels) {
      assert.equal(containsRawUuid(lbl), false, `sampleLabel contiene UUID crudo: ${lbl}`);
    }
  }
  for (const snip of applyRes.diffSnippets) {
    assert.equal(containsRawUuid(snip), false, `diffSnippet contiene UUID crudo: ${snip}`);
  }
  for (const warn of applyRes.warnings) {
    assert.equal(containsRawUuid(warn), false, `warning contiene UUID crudo: ${warn}`);
  }

  // Coherencia transversal 06 ↔ 07 detecta referencia desde `certificado` a Norma #9
  assert.equal(applyRes.crossFileCoherence.hasCrossFileReferences, true);
  assert.equal(applyRes.crossFileCoherence.referencedNewNormas.length, 1);
  assert.equal(applyRes.crossFileCoherence.referencedNewNormas[0].codigo, 'ISO 37001:2016');
  assert.ok(applyRes.crossFileCoherence.optional06NormaStubSql?.includes('ISO 37001:2016'));
  assert.ok(applyRes.warnings.some((w) => w.includes('06_datos_prueba.sql se ejecuta ANTES')));
  assert.ok(applyRes.warnings.some((w) => w.includes('scripts/buildNormasSeed.ts')));

  // Verificar compatibilidad con contratos de requisitoCsvImporter.test.ts
  assert.ok(applyRes.nextSqlContent.includes('INSERT INTO public.norma'));
  assert.ok(applyRes.nextSqlContent.includes('ON CONFLICT (codigo) WHERE deleted_at IS NULL DO UPDATE'));
  assert.ok(applyRes.nextSqlContent.includes('INSERT INTO public.requisito'));
  assert.ok(applyRes.nextSqlContent.includes('ON CONFLICT (id_norma, codigo) WHERE deleted_at IS NULL DO UPDATE'));
  assert.ok(applyRes.nextSqlContent.includes('INSERT INTO public.requisito_traduccion'));
  assert.ok(applyRes.nextSqlContent.includes('ON CONFLICT (id_requisito, lang) WHERE deleted_at IS NULL DO UPDATE'));
  assert.doesNotMatch(applyRes.nextSqlContent, /\bDELETE\s+FROM\b/i);
  assert.ok(applyRes.nextSqlContent.includes("WHEN public.requisito.obligatorio_origen = 'MANUAL'"));

  // Verificar que los 7 UUIDs históricos y el override MANUAL estén presentes en el SQL generado
  for (const expectedUuid of Object.values(HISTORICAL_CLAUSE_UUID_BY_EXTERNAL_KEY)) {
    assert.ok(applyRes.nextSqlContent.includes(expectedUuid), `Falta UUID histórico ${expectedUuid}`);
  }

  // Verificar orden padre -> hijo -> nieto en el SQL generado y cast ::ltree
  const reparsed = parseNormas07SqlRecords(applyRes.nextSqlContent);
  const idxById = new Map(reparsed.requisito.map((r, i) => [String(r.id), i]));
  assert.ok(idxById.get(req9RootId)! < idxById.get(req9ChildId)!);
  assert.ok(idxById.get(req9ChildId)! < idxById.get(req9GrandChildId)!);

  const clause44 = reparsed.requisito.find((r) => r.external_key === 'clause_iso_9001_2015_0015');
  assert.equal(clause44?.es_obligatorio, true);
  assert.equal(clause44?.obligatorio_origen, 'MANUAL');

  const trIso9001 = reparsed.requisito_traduccion.find(
    (t) => t.id_requisito === HISTORICAL_CLAUSE_UUID_BY_EXTERNAL_KEY.clause_iso_9001_2015_0007 && t.lang === 'es'
  );
  assert.equal(trIso9001?.title, "Comprensión de la organización y de su contexto 'revisado'");
  assert.ok(String(trIso9001?.content_html).includes('$$100'));

  // Idempotencia estricta: una segunda pasada sobre el SQL generado debe reportar changed: false
  const secondPass = previewNormas07Sync(applyRes.nextSqlContent, {
    norma: liveNormas,
    requisito: liveRequisitos,
    requisito_traduccion: liveTraducciones,
  });
  assert.equal(secondPass.changed, false, `Segunda pasada detectó diff residual: ${secondPass.diffSnippets.join(' | ')}`);
  assert.equal(secondPass.counts.tablesWithChanges, 0);
});

test('Step 2.1 Archivados Lógicos: emite ON CONFLICT (id) DO UPDATE con deleted_at y cero DELETE FROM', () => {
  const normaId = 'e0000000-0000-0000-0000-000000099001';
  const reqActiveId = 'a0000000-0000-0000-0000-000000099001';
  const reqArchivedId = 'a0000000-0000-0000-0000-000000099002';
  const trArchivedId = 'b0000000-0000-0000-0000-000000099002';
  const adminUserId = '11111111-1111-1111-1111-111111111111';

  const initialDoc = buildNormas07SqlDocument({
    norma: [
      {
        id: normaId,
        esquema: 'TEST',
        codigo: 'ISO-TEST-1',
        titulo: 'Norma Prueba',
        estatus: 'Vigente',
        fecha_publicacion: '2025-01-01',
        norma: 'ISO-TEST-1',
      },
    ],
    requisito: [
      {
        id: reqActiveId,
        id_norma: normaId,
        id_requisito_padre: null,
        codigo: '4',
        ruta_materializada: '4',
        explicit_code: false,
        external_key: 'test_4',
        es_obligatorio: false,
        obligatorio_origen: 'AUTO_TEXT',
      },
      {
        id: reqArchivedId,
        id_norma: normaId,
        id_requisito_padre: reqActiveId,
        codigo: '4.1',
        ruta_materializada: '4.4_1',
        explicit_code: false,
        external_key: 'test_4_1',
        es_obligatorio: true,
        obligatorio_origen: 'AUTO_TEXT',
      },
    ],
    requisito_traduccion: [
      {
        id: trArchivedId,
        id_requisito: reqArchivedId,
        lang: 'es',
        title: 'Cláusula 4.1',
        content_html: '<p>Contenido inicial</p>',
      },
    ],
  });

  const archivedAt = '2026-04-01T10:30:00.000Z';
  const archivedRes = applyNormas07Sync(initialDoc, {
    norma: [
      {
        id: normaId,
        esquema: 'TEST',
        codigo: 'ISO-TEST-1',
        titulo: 'Norma Prueba',
        estatus: 'Obsoleta',
        fecha_publicacion: '2025-01-01',
        norma: 'ISO-TEST-1',
        deleted_at: archivedAt,
        deleted_by: adminUserId,
        delete_reason: 'Norma sustituida',
      },
    ],
    requisito: [
      {
        id: reqActiveId,
        id_norma: normaId,
        id_requisito_padre: null,
        codigo: '4',
        ruta_materializada: '4',
        explicit_code: false,
        external_key: 'test_4',
        es_obligatorio: false,
        obligatorio_origen: 'AUTO_TEXT',
      },
      {
        id: reqArchivedId,
        id_norma: normaId,
        id_requisito_padre: reqActiveId,
        codigo: '4.1',
        ruta_materializada: '4.4_1',
        explicit_code: false,
        external_key: 'test_4_1',
        es_obligatorio: true,
        obligatorio_origen: 'MANUAL',
        deleted_at: archivedAt,
        deleted_by: adminUserId,
        delete_reason: 'Cláusula archivada',
      },
    ],
    requisito_traduccion: [
      {
        id: trArchivedId,
        id_requisito: reqArchivedId,
        lang: 'es',
        title: 'Cláusula 4.1',
        content_html: '<p>Contenido inicial</p>',
        deleted_at: archivedAt,
        deleted_by: adminUserId,
      },
    ],
  });

  assert.equal(archivedRes.changed, true);
  assert.equal(archivedRes.validation.valid, true, archivedRes.validation.errors.join(' | '));
  assert.equal(archivedRes.validation.zeroProtectedDeletes, true);
  assert.doesNotMatch(archivedRes.nextSqlContent, /\bDELETE\s+FROM\b/i);
  assert.ok(archivedRes.nextSqlContent.includes('ON CONFLICT (id) DO UPDATE SET'));
  assert.ok(archivedRes.nextSqlContent.includes('deleted_at = EXCLUDED.deleted_at'));
  assert.ok(archivedRes.nextSqlContent.includes('deleted_by = EXCLUDED.deleted_by'));
  assert.equal(archivedRes.counts.normasArchived, 1);
  assert.equal(archivedRes.counts.requisitosArchived, 1);
  assert.equal(archivedRes.counts.traduccionesArchived, 1);
  assert.equal(archivedRes.summaryByTable.norma.toArchiveOrDelete, 1);
  assert.equal(archivedRes.summaryByTable.requisito.toArchiveOrDelete, 1);
  assert.equal(archivedRes.summaryByTable.requisito_traduccion.toArchiveOrDelete, 1);
});

test('Step 2.1 Guardas de Integridad: rechaza alteración de los 7 UUIDs históricos, LTREE inválido y desorden topológico', () => {
  const real07 = readReal07Sql();
  const parsed = parseNormas07SqlRecords(real07);

  // 1. Alteración de UUID histórico ISO 9001:2015 (4.1)
  const alteredRequisitos = parsed.requisito.map((r) =>
    r.external_key === 'clause_iso_9001_2015_0007'
      ? { ...r, id: 'f0000000-0000-0000-0000-999999999999' }
      : r
  );
  const histRes = verifyHistoricalIso9001Uuids(alteredRequisitos);
  assert.equal(histRes.valid, false);
  assert.equal(histRes.mismatches.length, 1);
  assert.equal(histRes.mismatches[0].externalKey, 'clause_iso_9001_2015_0007');
  assert.equal(containsRawUuid(histRes.errors[0]), false);

  // 2. Ruta LTREE inválida
  const invalidLtreeDoc = buildNormas07SqlDocument({
    norma: parsed.norma,
    requisito: [
      {
        ...parsed.requisito[0],
        ruta_materializada: '4.4-invalid!',
      },
    ],
    requisito_traduccion: [],
  });
  assert.equal(LTREE_PATH_PATTERN.test('4.4-invalid!'), false);
  const ltreeValidation = validateNormas07Sql(invalidLtreeDoc);
  assert.equal(ltreeValidation.valid, false);
  assert.equal(ltreeValidation.validLtreePaths, false);

  // 3. Desorden topológico forzado manualmente en un script SQL (hijo antes que padre)
  const unsortedSql = `
INSERT INTO public.norma (id, esquema, codigo, titulo, estatus, fecha_publicacion, norma) VALUES
    ('e0000000-0000-0000-0000-000000099002', 'TEST', 'ISO-TOPO', 'Norma Topo', 'Vigente', '2025-01-01'::date, 'ISO-TOPO')
ON CONFLICT (codigo) WHERE deleted_at IS NULL DO UPDATE SET titulo = EXCLUDED.titulo;

INSERT INTO public.requisito (id, id_norma, id_requisito_padre, codigo, ruta_materializada, explicit_code, external_key, es_obligatorio, obligatorio_origen) VALUES
    ('a1000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000099002', 'a1000000-0000-0000-0000-000000000001', '4.1', '4.4_1'::ltree, FALSE, NULL, TRUE, 'AUTO_TEXT'),
    ('a1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000099002', NULL, '4', '4'::ltree, FALSE, NULL, FALSE, 'AUTO_TEXT')
ON CONFLICT (id_norma, codigo) WHERE deleted_at IS NULL DO UPDATE SET id_requisito_padre = EXCLUDED.id_requisito_padre;
`;
  const topoValidation = validateNormas07Sql(unsortedSql);
  assert.equal(topoValidation.valid, false);
  assert.equal(topoValidation.validTopologicalOrder, false);

  // Pero `sortRequisitosTopologicallyFor07` reordena padre antes que hijo incluso con niveles profundos
  const sorted = sortRequisitosTopologicallyFor07([
    {
      id: 'a1000000-0000-0000-0000-000000000003',
      id_norma: 'e0000000-0000-0000-0000-000000099002',
      id_requisito_padre: 'a1000000-0000-0000-0000-000000000002',
      codigo: '4.1.a',
      ruta_materializada: '4.4_1.4_1_a',
    },
    {
      id: 'a1000000-0000-0000-0000-000000000002',
      id_norma: 'e0000000-0000-0000-0000-000000099002',
      id_requisito_padre: 'a1000000-0000-0000-0000-000000000001',
      codigo: '4.1',
      ruta_materializada: '4.4_1',
    },
    {
      id: 'a1000000-0000-0000-0000-000000000001',
      id_norma: 'e0000000-0000-0000-0000-000000099002',
      id_requisito_padre: null,
      codigo: '4',
      ruta_materializada: '4',
    },
  ]);
  assert.deepEqual(
    sorted.map((r) => r.codigo),
    ['4', '4.1', '4.1.a']
  );

  // Stub 06 opcional debe producir SQL limpio sin UUIDs en comentarios/errores
  const stubSql = build06BaseNormaFkStubSql([
    {
      id: 'e0000000-0000-0000-0000-000000037001',
      esquema: 'SGAS',
      codigo: 'ISO 37001:2016',
      titulo: 'Antisoborno',
      estatus: 'Vigente',
      fecha_publicacion: '2016-10-15',
      norma: 'ISO 37001:2016',
    },
  ]);
  assert.ok(stubSql.includes('ON CONFLICT (codigo) WHERE deleted_at IS NULL DO UPDATE'));
  const diffPreview = computeNormas07SyncDiff(real07, {
    norma: parsed.norma,
    requisito: parsed.requisito,
    requisito_traduccion: parsed.requisito_traduccion,
  });
  assert.equal(diffPreview.hasChanges, false);
});
