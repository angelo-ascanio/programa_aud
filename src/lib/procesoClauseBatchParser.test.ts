import test from 'node:test';
import assert from 'node:assert/strict';
import type { RequisitoLtree } from './extraDomain';
import {
  INITIAL_ALL_SEEDED_CERTIFICADOS_DETAILED,
  type CertificadoDetailEntity,
  type ProcessEntity,
} from './multisiteSampling';
import { parseAndConsolidateProcesoBatchClauseInput } from './procesoClauseBatchParser';
import { assertZeroUuidExposure } from './zeroUuid';

const NORMA_9001_ID = 'e0000000-0000-0000-0000-000000009001';
const CERT_ID = '91000000-0000-0000-0000-000000000901';
const PROC_ID = '92000000-0000-0000-0000-000000000901';

function req(
  idSuffix: string,
  codigo: string,
  ruta: string,
  nivel: number,
  parentId: string | null,
  esObligatorio = true,
  titulo = `Requisito ${codigo}`
): RequisitoLtree {
  return {
    id: `70000000-0000-0000-0000-${idSuffix.padStart(12, '0')}`,
    id_norma: NORMA_9001_ID,
    norma_codigo: 'ISO 9001:2015',
    id_requisito_padre: parentId,
    codigo,
    titulo,
    ruta_materializada: ruta,
    nivel,
    es_padre: false,
    es_obligatorio: esObligatorio,
  };
}

function buildIso9001FixtureCatalog(): RequisitoLtree[] {
  const r1 = req('1', '1', '1', 1, null, false, 'Objeto y campo de aplicación');
  const r1a = req('101', '1.a', '1.1_a', 2, r1.id, false, 'Demostrar capacidad');
  const r1b = req('102', '1.b', '1.1_b', 2, r1.id, false, 'Aumentar satisfacción del cliente');

  const r4 = req('4', '4', '4', 1, null, false, 'Contexto de la organización');
  const r41 = req('41', '4.1', '4.4_1', 2, r4.id, true, 'Comprensión de la organización');
  const r42 = req('42', '4.2', '4.4_2', 2, r4.id, true, 'Partes interesadas');
  const r43 = req('43', '4.3', '4.4_3', 2, r4.id, true, 'Alcance del SGC');
  const r43a = req('4301', '4.3.a', '4.4_3.4_3_a', 3, r43.id, true);
  const r43b = req('4302', '4.3.b', '4.4_3.4_3_b', 3, r43.id, true);
  const r43c = req('4303', '4.3.c', '4.4_3.4_3_c', 3, r43.id, true);
  const r44 = req('44', '4.4', '4.4_4', 2, r4.id, false);
  const r441 = req('441', '4.4.1', '4.4_4.4_4_1', 3, r44.id, true);

  const r5 = req('5', '5', '5', 1, null, false, 'Liderazgo');
  const r52 = req('52', '5.2', '5.5_2', 2, r5.id, false);
  const r521 = req('521', '5.2.1', '5.5_2.5_2_1', 3, r52.id, true);
  const r522 = req('522', '5.2.2', '5.5_2.5_2_2', 3, r52.id, true);
  const r53 = req('53', '5.3', '5.5_3', 2, r5.id, true);

  const r6 = req('6', '6', '6', 1, null, false, 'Planificación');
  const r61 = req('61', '6.1', '6.6_1', 2, r6.id, false);
  const r611 = req('611', '6.1.1', '6.6_1.6_1_1', 3, r61.id, true);
  const r62 = req('62', '6.2', '6.6_2', 2, r6.id, false);
  const r621 = req('621', '6.2.1', '6.6_2.6_2_1', 3, r62.id, true);
  const r621a = req('6211', '6.2.1.a', '6.6_2.6_2_1.6_2_1_a', 4, r621.id, true);
  const r621b = req('6212', '6.2.1.b', '6.6_2.6_2_1.6_2_1_b', 4, r621.id, true);
  const r622 = req('622', '6.2.2', '6.6_2.6_2_2', 3, r62.id, true);

  const r7 = req('7', '7', '7', 1, null, false, 'Apoyo');
  const r71 = req('71', '7.1', '7.7_1', 2, r7.id, false);
  const r711 = req('711', '7.1.1', '7.7_1.7_1_1', 3, r71.id, true);
  const r73 = req('73', '7.3', '7.7_3', 2, r7.id, true);
  const r74 = req('74', '7.4', '7.7_4', 2, r7.id, true);
  const r75 = req('75', '7.5', '7.7_5', 2, r7.id, false);
  const r751 = req('751', '7.5.1', '7.7_5.7_5_1', 3, r75.id, true);

  const r8 = req('8', '8', '8', 1, null, false, 'Operación');
  const r81 = req('81', '8.1', '8.8_1', 2, r8.id, true);
  const r82 = req('82', '8.2', '8.8_2', 2, r8.id, false);
  const r821 = req('821', '8.2.1', '8.8_2.8_2_1', 3, r82.id, true);
  const r83 = req('83', '8.3', '8.8_3', 2, r8.id, false, 'Diseño y desarrollo');
  const r831 = req('831', '8.3.1', '8.8_3.8_3_1', 3, r83.id, true);
  const r832 = req('832', '8.3.2', '8.8_3.8_3_2', 3, r83.id, true);
  const r832a = req('8321', '8.3.2.a', '8.8_3.8_3_2.8_3_2_a', 4, r832.id, true);

  const r9 = req('9', '9', '9', 1, null, false, 'Evaluación del desempeño');
  const r91 = req('91', '9.1', '9.9_1', 2, r9.id, false);
  const r911 = req('911', '9.1.1', '9.9_1.9_1_1', 3, r91.id, true);
  const r912 = req('912', '9.1.2', '9.9_1.9_1_2', 3, r91.id, true);
  const r92 = req('92', '9.2', '9.9_2', 2, r9.id, false);
  const r921 = req('921', '9.2.1', '9.9_2.9_2_1', 3, r92.id, true);
  const r93 = req('93', '9.3', '9.9_3', 2, r9.id, false);
  const r931 = req('931', '9.3.1', '9.9_3.9_3_1', 3, r93.id, true);

  const r10 = req('10', '10', '10', 1, null, false, 'Mejora');
  const r101 = req('1010', '10.1', '10.10_1', 2, r10.id, true);
  const r102 = req('1020', '10.2', '10.10_2', 2, r10.id, false);
  const r1021 = req('1021', '10.2.1', '10.10_2.10_2_1', 3, r102.id, true);
  const r103 = req('1030', '10.3', '10.10_3', 2, r10.id, true);

  return [
    r1, r1a, r1b,
    r4, r41, r42, r43, r43a, r43b, r43c, r44, r441,
    r5, r52, r521, r522, r53,
    r6, r61, r611, r62, r621, r621a, r621b, r622,
    r7, r71, r711, r73, r74, r75, r751,
    r8, r81, r82, r821, r83, r831, r832, r832a,
    r9, r91, r911, r912, r92, r921, r93, r931,
    r10, r101, r102, r1021, r103,
  ];
}

function buildCertAndProceso(opts?: {
  linkedCodes?: string[];
  excludedCodes?: string[];
}): {
  cert: CertificadoDetailEntity;
  proceso: {
    id: string;
    id_norma: string;
    norma_codigo: string;
    requisitos: Array<{
      id_requisito: string;
      codigo: string;
      titulo: string;
      ruta_materializada: string;
      nivel: number;
      id_norma: string;
      norma_codigo: string;
    }>;
  };
} {
  const baseCert = INITIAL_ALL_SEEDED_CERTIFICADOS_DETAILED[0];
  const proc: ProcessEntity = {
    id: PROC_ID,
    id_certificado: CERT_ID,
    nombre_proceso: 'Gestión de Operaciones',
    tipo: 'Medular',
    clausulas_cubiertas: opts?.linkedCodes || [],
    requisitos_detalle: (opts?.linkedCodes || []).map((c) => ({
      codigo: c,
      titulo: `Cláusula ${c}`,
    })),
  };

  const cert: CertificadoDetailEntity = {
    ...baseCert,
    id: CERT_ID,
    id_norma: NORMA_9001_ID,
    norma_codigo: 'ISO 9001:2015',
    procesos: [proc],
    noAplicables: (opts?.excludedCodes || []).map((c, idx) => ({
      id: `88000000-0000-0000-0000-00000000000${idx + 1}`,
      id_certificado: CERT_ID,
      requisito_codigo: c,
      requisito_titulo: `Cláusula ${c}`,
      justificacion: 'Exclusión justificada ISO 4.3',
    })),
  };

  return {
    cert,
    proceso: {
      id: PROC_ID,
      id_norma: NORMA_9001_ID,
      norma_codigo: 'ISO 9001:2015',
      requisitos: (opts?.linkedCodes || []).map((c, idx) => ({
        id_requisito: `99000000-0000-0000-0000-00000000000${idx + 1}`,
        codigo: c,
        titulo: `Cláusula ${c}`,
        ruta_materializada: c.replace(/\./g, '_'),
        nivel: c.split('.').length,
        id_norma: NORMA_9001_ID,
        norma_codigo: 'ISO 9001:2015',
      })),
    },
  };
}

test('Exact clause matching + invalid-token rejection on user example list', () => {
  const catalog = buildIso9001FixtureCatalog();
  const { cert, proceso } = buildCertAndProceso();

  const res = parseAndConsolidateProcesoBatchClauseInput({
    rawText:
      '4.1, 4.2, 4.3.a, 4.3.b, 4.4, 5.2.a, 5.2.b, 5.3, 6.1, 6.2, 7.1, 7.3, 7.4, 7.5, 8.1, 8.2, 9.1.1, 9.2, 9.3, 10.1, 10.2, 10.3',
    cert,
    currentProceso: proceso,
    requirementsCatalog: catalog,
  });

  // 9.1.1 selects ONLY 9.1.1 (not 9.1.2, not 9.1)
  assert.ok(res.finalSelectedCodes.includes('9.1.1'));
  assert.equal(res.finalSelectedCodes.includes('9.1.2'), false);
  assert.equal(res.finalSelectedCodes.includes('9.1'), false);

  // 4.3.a + 4.3.b do NOT roll up to 4.3 because 4.3.c is missing
  assert.ok(res.finalSelectedCodes.includes('4.3.a'));
  assert.ok(res.finalSelectedCodes.includes('4.3.b'));
  assert.equal(res.finalSelectedCodes.includes('4.3'), false);

  // 10.1, 10.2, 10.3 cover all children of Chapter 10 (level 1) -> must NOT roll up to Chapter 10!
  assert.ok(res.finalSelectedCodes.includes('10.1'));
  assert.ok(res.finalSelectedCodes.includes('10.2'));
  assert.ok(res.finalSelectedCodes.includes('10.3'));
  assert.equal(res.finalSelectedCodes.includes('10'), false);

  // 5.2.a and 5.2.b are invalid in ISO 9001:2015 and reported without breaking valid matches
  assert.deepEqual(res.invalidTokens, ['5.2.a', '5.2.b']);
  assert.equal(assertZeroUuidExposure(res.summaryText).compliant, true);
});

test('Intelligent messy text parsing: separators, typos, connectors, standard header, ranges, and duplicates', () => {
  const catalog = buildIso9001FixtureCatalog();
  const { cert, proceso } = buildCertAndProceso();

  const messyText = `
    ISO 9001:2015: Cláusulas (4.1), [4.2.] y 4.3A;
    • 4_3_b | cl.4.4 | req:5.3 | §6.1
    4.1 - Contexto de la organización
    9.1.1., 9.1.1, 99.9, foo_bar
    10.1 - 10.2
  `;

  const res = parseAndConsolidateProcesoBatchClauseInput({
    rawText: messyText,
    cert,
    currentProceso: proceso,
    requirementsCatalog: catalog,
  });

  assert.deepEqual(res.finalSelectedCodes, [
    '4.1',
    '4.2',
    '4.3.a',
    '4.3.b',
    '4.4',
    '5.3',
    '6.1',
    '9.1.1',
    '10.1',
    '10.2',
  ]);
  assert.ok(res.normalizedMappings.some((m) => m.matchedCode === '4.3.a'));
  assert.ok(res.normalizedMappings.some((m) => m.matchedCode === '4.3.b'));
  assert.ok(res.invalidTokens.includes('99.9'));
  assert.ok(res.invalidTokens.includes('foo_bar'));
  // Ensure 4.3.a and 9.1.1 trigger ancestor expansion for visibility
  const id43 = catalog.find((r) => r.codigo === '4.3')!.id;
  const id91 = catalog.find((r) => r.codigo === '9.1')!.id;
  assert.ok(res.requiredExpandedAncestorIds.includes(id43));
  assert.ok(res.requiredExpandedAncestorIds.includes(id91));
});

test('Bottom-up parent consolidation (roll-up) and pruning redundant descendants', () => {
  const catalog = buildIso9001FixtureCatalog();
  const { cert, proceso } = buildCertAndProceso();

  // Direct children 6.2.1 + 6.2.2 -> consolidates to 6.2
  const directRollup = parseAndConsolidateProcesoBatchClauseInput({
    rawText: '6.2.1, 6.2.2',
    cert,
    currentProceso: proceso,
    requirementsCatalog: catalog,
  });
  assert.deepEqual(directRollup.finalSelectedCodes, ['6.2']);
  assert.deepEqual(directRollup.rolledUpTransitions, [
    { fromCodes: ['6.2.1', '6.2.2'], toCode: '6.2' },
  ]);

  // Multi-level grandchildren 6.2.1.a + 6.2.1.b + 6.2.2 -> rolls up to 6.2.1 then to 6.2
  const multiLevelRollup = parseAndConsolidateProcesoBatchClauseInput({
    rawText: '6.2.1.a, 6.2.1.b, 6.2.2',
    cert,
    currentProceso: proceso,
    requirementsCatalog: catalog,
  });
  assert.deepEqual(multiLevelRollup.finalSelectedCodes, ['6.2']);
  assert.equal(multiLevelRollup.rolledUpTransitions.length, 2);

  // Explicit parent + child -> prunes redundant child 6.2.1
  const pruneChild = parseAndConsolidateProcesoBatchClauseInput({
    rawText: '6.2, 6.2.1',
    cert,
    currentProceso: proceso,
    requirementsCatalog: catalog,
  });
  assert.deepEqual(pruneChild.finalSelectedCodes, ['6.2']);
  assert.deepEqual(pruneChild.prunedChildCodes, ['6.2.1']);

  // Merging existing selected 6.2.1 with new 6.2.2 -> consolidates to 6.2
  const id621 = catalog.find((r) => r.codigo === '6.2.1')!.id;
  const mergedRollup = parseAndConsolidateProcesoBatchClauseInput({
    rawText: '6.2.2',
    cert,
    currentProceso: proceso,
    requirementsCatalog: catalog,
    existingSelectedIds: [id621],
  });
  assert.deepEqual(mergedRollup.finalSelectedCodes, ['6.2']);

  // Second-level siblings (6.1 + 6.2) must NOT consolidate into first-level chapter (6)
  const chapterGuard = parseAndConsolidateProcesoBatchClauseInput({
    rawText: '6.1, 6.2',
    cert,
    currentProceso: proceso,
    requirementsCatalog: catalog,
  });
  assert.deepEqual(chapterGuard.finalSelectedCodes, ['6.1', '6.2']);
  assert.equal(chapterGuard.finalSelectedCodes.includes('6'), false);
  assert.deepEqual(chapterGuard.rolledUpTransitions, []);

  // Multi-level roll-up (6.1 + 6.2.1 + 6.2.2) consolidates 6.2.1+6.2.2 -> 6.2, then stops at level 2
  const stopAtLevel2 = parseAndConsolidateProcesoBatchClauseInput({
    rawText: '6.1, 6.2.1, 6.2.2',
    cert,
    currentProceso: proceso,
    requirementsCatalog: catalog,
  });
  assert.deepEqual(stopAtLevel2.finalSelectedCodes, ['6.1', '6.2']);
  assert.deepEqual(stopAtLevel2.rolledUpTransitions, [
    { fromCodes: ['6.2.1', '6.2.2'], toCode: '6.2' },
  ]);

  // All children of chapter 4 (4.1, 4.2, 4.3.a-c, 4.4) roll up 4.3.a..c -> 4.3, never to chapter 4
  const chapter4Guard = parseAndConsolidateProcesoBatchClauseInput({
    rawText: '4.1, 4.2, 4.3.a, 4.3.b, 4.3.c, 4.4',
    cert,
    currentProceso: proceso,
    requirementsCatalog: catalog,
  });
  assert.deepEqual(chapter4Guard.finalSelectedCodes, ['4.1', '4.2', '4.3', '4.4']);
  assert.equal(chapter4Guard.finalSelectedCodes.includes('4'), false);
});

test('ISO 4.3 NO_APLICABLE rules: rejects excluded clause and descendants, allows parent of excluded clause', () => {
  const catalog = buildIso9001FixtureCatalog();
  const { cert, proceso } = buildCertAndProceso({
    excludedCodes: ['8.3'],
    linkedCodes: ['4.1'],
  });

  // 1. Direct attempt on excluded 8.3 and its children 8.3.1, 8.3.2.a -> rejected; 4.1 -> skippedAlreadyLinked; 8 -> ALLOWED!
  const res = parseAndConsolidateProcesoBatchClauseInput({
    rawText: '4.1, 8, 8.3, 8.3.1, 8.3.2.a',
    cert,
    currentProceso: proceso,
    requirementsCatalog: catalog,
  });
  assert.deepEqual(res.finalSelectedCodes, ['8']);
  assert.deepEqual(res.skippedExcludedCodes, ['8.3', '8.3.1', '8.3.2.a']);
  assert.deepEqual(res.skippedAlreadyLinkedCodes, ['4.1']);

  // 2. Selecting all active non-excluded siblings of Chapter 8 (8.1, 8.2) while 8.3 is NO_APLICABLE -> keeps 8.1, 8.2 (does NOT roll up to Chapter 8)
  const noChapterRollup = parseAndConsolidateProcesoBatchClauseInput({
    rawText: '8.1, 8.2',
    cert,
    currentProceso: proceso,
    requirementsCatalog: catalog,
  });
  assert.deepEqual(noChapterRollup.finalSelectedCodes, ['8.1', '8.2']);

  // 3. Selecting only 8.1 while 8.2 is active -> stays 8.1
  const partialSibling = parseAndConsolidateProcesoBatchClauseInput({
    rawText: '8.1',
    cert,
    currentProceso: proceso,
    requirementsCatalog: catalog,
  });
  assert.deepEqual(partialSibling.finalSelectedCodes, ['8.1']);
});

test('Selecting informative-only clause recommends switching batchMode to all', () => {
  const catalog = buildIso9001FixtureCatalog();
  const { cert, proceso } = buildCertAndProceso();

  const res = parseAndConsolidateProcesoBatchClauseInput({
    rawText: '1.a',
    cert,
    currentProceso: proceso,
    requirementsCatalog: catalog,
    currentBatchMode: 'mandatory',
  });

  assert.deepEqual(res.finalSelectedCodes, ['1.a']);
  assert.equal(res.recommendedBatchMode, 'all');
});
