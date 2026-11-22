import assert from 'node:assert/strict';
import test from 'node:test';

import type { RequisitoLtree } from './extraDomain';
import {
  INITIAL_CERTIFICADOS_DETAILED,
  type CertificadoDetailEntity,
  type ProcessEntity,
} from './multisiteSampling';
import {
  buildFinalTargetRequisitoIds,
  resolveProcesoClausesForTargetCert,
} from './procesoClauseResolver';
import { getAllSeededNormaRequirements } from './procesoDomain';
import { assertZeroUuidExposure } from './zeroUuid';

const NORMA_9001_ID = 'e0000000-0000-0000-0000-000000009001';
const NORMA_14001_ID = 'e0000000-0000-0000-0000-000000014001';
const NORMA_45001_ID = 'e0000000-0000-0000-0000-000000045001';
const NORMA_27001_ID = 'e0000000-0000-0000-0000-000000027001';
const NORMA_CSV_CUSTOM_ID = 'e0000000-0000-0000-0000-000000099999';

function buildExtendedTestCatalog(): RequisitoLtree[] {
  const base = getAllSeededNormaRequirements();
  const extra: RequisitoLtree[] = [
    // ISO 9001 additions for full hierarchy test
    {
      id: '91000000-0000-0000-0000-000000000044',
      id_norma: NORMA_9001_ID,
      norma_codigo: 'ISO 9001:2015',
      id_requisito_padre: 'f0000000-0000-0000-0000-000000000004',
      codigo: '4.4',
      es_obligatorio: true,
      titulo: 'Sistema de gestión de la calidad y sus procesos',
      ruta_materializada: '4.4_4',
      nivel: 2,
      es_padre: true,
    },
    {
      id: '91000000-0000-0000-0000-000000000441',
      id_norma: NORMA_9001_ID,
      norma_codigo: 'ISO 9001:2015',
      id_requisito_padre: '91000000-0000-0000-0000-000000000044',
      codigo: '4.4.1',
      es_obligatorio: true,
      titulo: 'Determinación de los procesos necesarios para el SGC',
      ruta_materializada: '4.4_4.4_4_1',
      nivel: 3,
      es_padre: false,
    },
    {
      id: '91000000-0000-0000-0000-000000000442',
      id_norma: NORMA_9001_ID,
      norma_codigo: 'ISO 9001:2015',
      id_requisito_padre: '91000000-0000-0000-0000-000000000044',
      codigo: '4.4.2',
      es_obligatorio: true,
      titulo: 'Conservación de información documentada sobre procesos',
      ruta_materializada: '4.4_4.4_4_2',
      nivel: 3,
      es_padre: false,
    },
    {
      id: '91000000-0000-0000-0000-000000000061',
      id_norma: NORMA_9001_ID,
      norma_codigo: 'ISO 9001:2015',
      id_requisito_padre: null,
      codigo: '6.1',
      es_obligatorio: true,
      titulo: 'Acciones para abordar riesgos y oportunidades',
      ruta_materializada: '6.6_1',
      nivel: 2,
      es_padre: false,
    },
    {
      id: '91000000-0000-0000-0000-000000000715',
      id_norma: NORMA_9001_ID,
      norma_codigo: 'ISO 9001:2015',
      id_requisito_padre: null,
      codigo: '7.1.5',
      es_obligatorio: true,
      titulo: 'Recursos de seguimiento y medición',
      ruta_materializada: '7.7_1.7_1_5',
      nivel: 3,
      es_padre: false,
    },
    {
      id: '91000000-0000-0000-0000-000000000082',
      id_norma: NORMA_9001_ID,
      norma_codigo: 'ISO 9001:2015',
      id_requisito_padre: 'f0000000-0000-0000-0000-000000000008',
      codigo: '8.2',
      es_obligatorio: true,
      titulo: 'Requisitos para los productos y servicios',
      ruta_materializada: '8.8_2',
      nivel: 2,
      es_padre: false,
    },
    {
      id: '91000000-0000-0000-0000-000000000832',
      id_norma: NORMA_9001_ID,
      norma_codigo: 'ISO 9001:2015',
      id_requisito_padre: 'f0000000-0000-0000-0000-000000000083',
      codigo: '8.3.2',
      es_obligatorio: true,
      titulo: 'Planificación del diseño y desarrollo',
      ruta_materializada: '8.8_3.8_3_2',
      nivel: 3,
      es_padre: false,
    },
    {
      id: '91000000-0000-0000-0000-000000000091',
      id_norma: NORMA_9001_ID,
      norma_codigo: 'ISO 9001:2015',
      id_requisito_padre: null,
      codigo: '9.1',
      es_obligatorio: true,
      titulo: 'Seguimiento, medición, análisis y evaluación',
      ruta_materializada: '9.9_1',
      nivel: 2,
      es_padre: false,
    },
    // ISO 14001 additions
    {
      id: '14000000-0000-0000-0000-000000000044',
      id_norma: NORMA_14001_ID,
      norma_codigo: 'ISO 14001:2015',
      id_requisito_padre: null,
      codigo: '4.4',
      es_obligatorio: true,
      titulo: 'Sistema de gestión ambiental',
      ruta_materializada: '14001.4.4_4',
      nivel: 2,
      es_padre: false,
    },
    {
      id: '14000000-0000-0000-0000-000000000082',
      id_norma: NORMA_14001_ID,
      norma_codigo: 'ISO 14001:2015',
      id_requisito_padre: null,
      codigo: '8.2',
      es_obligatorio: true,
      titulo: 'Preparación y respuesta ante emergencias',
      ruta_materializada: '14001.8.8_2',
      nivel: 2,
      es_padre: false,
    },
    // ISO 27001 addition
    {
      id: '27000000-0000-0000-0000-000000000041',
      id_norma: NORMA_27001_ID,
      norma_codigo: 'ISO/IEC 27001:2022',
      id_requisito_padre: null,
      codigo: '4.1',
      es_obligatorio: true,
      titulo: 'Comprensión de la organización y de su contexto',
      ruta_materializada: '27001.4.4_1',
      nivel: 2,
      es_padre: false,
    },
    // Custom CSV-imported standard (unexpected semantic mismatch on 7.1.5 and 4.1)
    {
      id: '99000000-0000-0000-0000-000000000715',
      id_norma: NORMA_CSV_CUSTOM_ID,
      norma_codigo: 'BRCGS Food v9 (CSV)',
      id_requisito_padre: null,
      codigo: '7.1.5',
      es_obligatorio: true,
      titulo: 'Control microbiológico y desinfección de líneas estériles',
      ruta_materializada: '99999.7.7_1.7_1_5',
      nivel: 3,
      es_padre: false,
    },
    {
      id: '99000000-0000-0000-0000-000000000041',
      id_norma: NORMA_CSV_CUSTOM_ID,
      norma_codigo: 'BRCGS Food v9 (CSV)',
      id_requisito_padre: null,
      codigo: '4.1',
      es_obligatorio: true,
      titulo: 'Seguridad física perimetral y control de visitantes',
      ruta_materializada: '99999.4.4_1',
      nivel: 2,
      es_padre: false,
    },
  ];
  return [...base, ...extra];
}

function makeCert(params: {
  id: string;
  id_norma: string;
  norma_codigo: string;
  numero_certificado: string;
  noAplicables?: CertificadoDetailEntity['noAplicables'];
}): CertificadoDetailEntity {
  return {
    ...INITIAL_CERTIFICADOS_DETAILED[0],
    id: params.id,
    id_norma: params.id_norma,
    norma_codigo: params.norma_codigo,
    numero_certificado: params.numero_certificado,
    procesos: [],
    noAplicables: params.noAplicables ?? [],
  };
}

test('Step 2.2: Same-standard sharing (ISO 9001 -> ISO 9001) maps 1:1 and blocks ISO 4.3 excluded clauses + subtrees', () => {
  const catalog = buildExtendedTestCatalog();
  const cert9001A = makeCert({
    id: 'aaaa0001-0000-0000-0000-000000000001',
    id_norma: NORMA_9001_ID,
    norma_codigo: 'ISO 9001:2015',
    numero_certificado: 'FN-QMS-9001-A',
  });
  const cert9001B = makeCert({
    id: 'aaaa0002-0000-0000-0000-000000000002',
    id_norma: NORMA_9001_ID,
    norma_codigo: 'ISO 9001:2015',
    numero_certificado: 'FN-QMS-9001-B',
    noAplicables: [
      {
        id: 'bbbb0001-0000-0000-0000-000000000083',
        id_certificado: 'aaaa0002-0000-0000-0000-000000000002',
        id_requisito: 'f0000000-0000-0000-0000-000000000083',
        requisito_codigo: '8.3',
        requisito_titulo: 'Diseño y desarrollo de los productos y servicios',
        ruta_materializada: '8.8_3',
        justificacion: 'Planta de manufactura sin actividad de diseño propio.',
      },
    ],
  });

  const proc: ProcessEntity = {
    id: 'cccc0001-0000-0000-0000-000000000001',
    id_certificado: cert9001A.id,
    nombre_proceso: 'Ingeniería y Producción',
    tipo: 'Medular',
    clausulas_cubiertas: ['4.1', '8.3.2', '8.5'],
  };

  const plan = resolveProcesoClausesForTargetCert({
    proceso: proc,
    sourceCert: cert9001A,
    targetCert: cert9001B,
    requirementsCatalog: catalog,
  });

  assert.equal(plan.isCrossStandard, false);
  const entry41 = plan.entries.find((e) => e.sourceClauses.includes('4.1'));
  const entry832 = plan.entries.find((e) => e.sourceClauses.includes('8.3.2'));
  const entry85 = plan.entries.find((e) => e.sourceClauses.includes('8.5'));

  assert.equal(entry41?.status, 'EXACT_SAME_NORM');
  assert.equal(entry41?.preselected, true);
  assert.equal(entry41?.disabled, false);

  assert.equal(entry832?.status, 'EXCLUDED_ISO43');
  assert.equal(entry832?.preselected, false);
  assert.equal(entry832?.disabled, true);
  assert.equal(entry832?.blockingExclusionCodigo, '8.3');
  assert.ok(entry832?.blockingJustificacion?.includes('manufactura'));

  assert.equal(entry85?.status, 'EXACT_SAME_NORM');
  assert.equal(plan.summaryCounts.autoMappedCount, 2);
  assert.equal(plan.summaryCounts.excludedIso43Count, 1);

  for (const e of plan.entries) {
    assert.equal(
      assertZeroUuidExposure(`${e.warningMessage || ''} ${e.informativeNote || ''}`).compliant,
      true
    );
  }

  const finalIds = buildFinalTargetRequisitoIds({
    resolutionPlan: plan,
    targetCert: cert9001B,
    requirementsCatalog: catalog,
  });
  assert.deepEqual(finalIds, [
    'f0000000-0000-0000-0000-000000000041',
    'f0000000-0000-0000-0000-000000000085',
  ]);
  assert.equal(finalIds.includes('91000000-0000-0000-0000-000000000832'), false);
});

test('Step 2.2: ISO 9001 [4.4.1, 4.4.2, 4.1, 8.2, 8.3] -> ISO 14001 deduplicates HIERARCHICAL_ROLLUP, flags SEMANTIC_COLLISION & NO_EQUIVALENT', () => {
  const catalog = buildExtendedTestCatalog();
  const cert9001 = makeCert({
    id: 'aaaa0003-0000-0000-0000-000000000003',
    id_norma: NORMA_9001_ID,
    norma_codigo: 'ISO 9001:2015',
    numero_certificado: 'FN-QMS-01',
  });
  const cert14001 = makeCert({
    id: 'aaaa0004-0000-0000-0000-000000000004',
    id_norma: NORMA_14001_ID,
    norma_codigo: 'ISO 14001:2015',
    numero_certificado: 'FN-EMS-02',
  });

  const proc: ProcessEntity = {
    id: 'cccc0002-0000-0000-0000-000000000002',
    id_certificado: cert9001.id,
    nombre_proceso: 'Operación Central',
    tipo: 'Medular',
    clausulas_cubiertas: ['4.1', '4.4.1', '4.4.2', '8.2', '8.3'],
  };

  const plan = resolveProcesoClausesForTargetCert({
    proceso: proc,
    sourceCert: cert9001,
    targetCert: cert14001,
    requirementsCatalog: catalog,
  });

  assert.equal(plan.isCrossStandard, true);

  // 4.1 -> HLS_EQUIVALENT (preselected = true)
  const entry41 = plan.entries.find((e) => e.sourceClauses.includes('4.1'));
  assert.equal(entry41?.status, 'HLS_EQUIVALENT');
  assert.equal(entry41?.preselected, true);
  assert.equal(entry41?.targetCandidate?.codigo, '4.1');

  // [4.4.1, 4.4.2] -> Single deduplicated HIERARCHICAL_ROLLUP to ISO 14001 4.4
  const rollupEntries = plan.entries.filter((e) => e.status === 'HIERARCHICAL_ROLLUP');
  assert.equal(rollupEntries.length, 1);
  assert.deepEqual(rollupEntries[0].sourceClauses, ['4.4.1', '4.4.2']);
  assert.equal(rollupEntries[0].targetCandidate?.codigo, '4.4');
  assert.equal(rollupEntries[0].targetCandidate?.id_norma, NORMA_14001_ID);
  assert.equal(rollupEntries[0].preselected, true);

  // 8.2 -> SEMANTIC_COLLISION (preselected = false, exposes source vs target titles)
  const entry82 = plan.entries.find((e) => e.sourceClauses.includes('8.2'));
  assert.equal(entry82?.status, 'SEMANTIC_COLLISION');
  assert.equal(entry82?.preselected, false);
  assert.ok(entry82?.warningMessage?.toLowerCase().includes('productos y servicios'));
  assert.ok(entry82?.warningMessage?.toLowerCase().includes('emergencias'));

  // 8.3 -> NO_EQUIVALENT in ISO 14001 (preselected = false)
  const entry83 = plan.entries.find((e) => e.sourceClauses.includes('8.3'));
  assert.equal(entry83?.status, 'NO_EQUIVALENT');
  assert.equal(entry83?.preselected, false);
  assert.equal(entry83?.targetCandidate, null);

  assert.deepEqual(plan.summaryCounts, {
    autoMappedCount: 1,
    hierarchicalCount: 1,
    semanticCollisionCount: 1,
    noEquivalentCount: 1,
    excludedIso43Count: 0,
  });

  // Default final build includes ONLY preselected safe target clauses (4.1 and 4.4 in ISO 14001)
  const defaultFinalIds = buildFinalTargetRequisitoIds({
    resolutionPlan: plan,
    targetCert: cert14001,
    requirementsCatalog: catalog,
  });
  assert.deepEqual(defaultFinalIds, [
    'f1400100-0000-0000-0000-000000000041',
    '14000000-0000-0000-0000-000000000044',
  ]);

  // Manual substitution for NO_EQUIVALENT (8.3 -> 6.1 in ISO 14001) + rejection of foreign ISO 9001 req ID
  assert.ok(entry83);
  const overriddenIds = buildFinalTargetRequisitoIds({
    resolutionPlan: plan,
    selectedTargetReqIdsByEntryKey: {
      [entry83.entryKey]: 'f1400100-0000-0000-0000-000000000061',
    },
    extraManualTargetReqIds: [
      'f0000000-0000-0000-0000-000000000083', // FOREIGN ISO 9001 req ID -> MUST BE REJECTED
    ],
    targetCert: cert14001,
    requirementsCatalog: catalog,
  });
  assert.equal(overriddenIds.includes('f1400100-0000-0000-0000-000000000061'), true);
  assert.equal(overriddenIds.includes('f0000000-0000-0000-0000-000000000083'), false);
});

test('Step 2.2: Reverse granularity (ISO 14001 [4.4] -> ISO 9001) suggests HIERARCHICAL_ROLLDOWN with descendant coverage note', () => {
  const catalog = buildExtendedTestCatalog();
  const cert14001 = makeCert({
    id: 'aaaa0005-0000-0000-0000-000000000005',
    id_norma: NORMA_14001_ID,
    norma_codigo: 'ISO 14001:2015',
    numero_certificado: 'FN-EMS-05',
  });
  const cert9001 = makeCert({
    id: 'aaaa0006-0000-0000-0000-000000000006',
    id_norma: NORMA_9001_ID,
    norma_codigo: 'ISO 9001:2015',
    numero_certificado: 'FN-QMS-06',
  });

  const proc: ProcessEntity = {
    id: 'cccc0003-0000-0000-0000-000000000003',
    id_certificado: cert14001.id,
    nombre_proceso: 'Gestión del SGA',
    tipo: 'Estratégico',
    clausulas_cubiertas: ['4.4'],
  };

  const plan = resolveProcesoClausesForTargetCert({
    proceso: proc,
    sourceCert: cert14001,
    targetCert: cert9001,
    requirementsCatalog: catalog,
  });

  assert.equal(plan.entries.length, 1);
  const entry44 = plan.entries[0];
  assert.equal(entry44.status, 'HIERARCHICAL_ROLLDOWN');
  assert.equal(entry44.preselected, true);
  assert.equal(entry44.targetCandidate?.codigo, '4.4');
  assert.equal(entry44.targetCandidate?.id_norma, NORMA_9001_ID);
  assert.deepEqual(
    entry44.descendantTargetCandidates.map((d) => d.codigo),
    ['4.4.1', '4.4.2']
  );
  assert.ok(entry44.informativeNote?.includes('4.4.1'));
  assert.ok(entry44.informativeNote?.includes('4.4.2'));

  // Parent-before-child ordering verified when caller also expands child explicitly
  const orderedIds = buildFinalTargetRequisitoIds({
    resolutionPlan: plan,
    extraManualTargetReqIds: ['91000000-0000-0000-0000-000000000441'],
    targetCert: cert9001,
    requirementsCatalog: catalog,
  });
  assert.deepEqual(orderedIds, [
    '91000000-0000-0000-0000-000000000044',
    '91000000-0000-0000-0000-000000000441',
  ]);
});

test('Step 2.2: ISO 9001 -> ISO/IEC 27001 [8.2] & ISO 45001 [8.3], ISO 27001 [A.11.2.6] -> ISO 9001, and CSV low-similarity safety net', () => {
  const catalog = buildExtendedTestCatalog();
  const cert9001 = makeCert({
    id: 'aaaa0007-0000-0000-0000-000000000007',
    id_norma: NORMA_9001_ID,
    norma_codigo: 'ISO 9001:2015',
    numero_certificado: 'FN-QMS-07',
  });
  const cert27001 = makeCert({
    id: 'aaaa0008-0000-0000-0000-000000000008',
    id_norma: NORMA_27001_ID,
    norma_codigo: 'ISO/IEC 27001:2022',
    numero_certificado: 'FN-ISMS-08',
  });
  const cert45001 = makeCert({
    id: 'aaaa0009-0000-0000-0000-000000000009',
    id_norma: NORMA_45001_ID,
    norma_codigo: 'ISO 45001:2018',
    numero_certificado: 'FN-OHS-09',
  });
  const certCsv = makeCert({
    id: 'aaaa0010-0000-0000-0000-000000000010',
    id_norma: NORMA_CSV_CUSTOM_ID,
    norma_codigo: 'BRCGS Food v9 (CSV)',
    numero_certificado: 'FN-CUSTOM-10',
  });

  // 1. ISO 9001 [8.2, 9.1] -> ISO 27001
  const proc9001To27001: ProcessEntity = {
    id: 'cccc0004-0000-0000-0000-000000000004',
    id_certificado: cert9001.id,
    nombre_proceso: 'TI y Calidad',
    tipo: 'Medular',
    clausulas_cubiertas: ['8.2', '9.1'],
  };
  const plan9001To27001 = resolveProcesoClausesForTargetCert({
    proceso: proc9001To27001,
    sourceCert: cert9001,
    targetCert: cert27001,
    requirementsCatalog: catalog,
  });
  const collision27001 = plan9001To27001.entries.find((e) => e.sourceClauses.includes('8.2'));
  const hls91 = plan9001To27001.entries.find((e) => e.sourceClauses.includes('9.1'));
  assert.equal(collision27001?.status, 'SEMANTIC_COLLISION');
  assert.equal(collision27001?.preselected, false);
  assert.ok(collision27001?.warningMessage?.toLowerCase().includes('seguridad'));
  assert.equal(hls91?.status, 'HLS_EQUIVALENT');
  assert.equal(hls91?.preselected, true);

  // 2. ISO 9001 [8.3] -> ISO 45001 [8.3] triggers explicit discipline collision
  const proc9001To45001: ProcessEntity = {
    id: 'cccc0005-0000-0000-0000-000000000005',
    id_certificado: cert9001.id,
    nombre_proceso: 'Diseño Ingeniería',
    tipo: 'Medular',
    clausulas_cubiertas: ['8.3'],
  };
  const plan9001To45001 = resolveProcesoClausesForTargetCert({
    proceso: proc9001To45001,
    sourceCert: cert9001,
    targetCert: cert45001,
    requirementsCatalog: catalog,
  });
  assert.equal(plan9001To45001.entries[0]?.status, 'SEMANTIC_COLLISION');
  assert.equal(plan9001To45001.entries[0]?.preselected, false);

  // 3. ISO 27001 [A.11.2.6] -> ISO 9001 triggers NO_EQUIVALENT without error
  const proc27001: ProcessEntity = {
    id: 'cccc0006-0000-0000-0000-000000000006',
    id_certificado: cert27001.id,
    nombre_proceso: 'Infraestructura Segura',
    tipo: 'De Apoyo',
    clausulas_cubiertas: ['A.11.2.6'],
  };
  const plan27001To9001 = resolveProcesoClausesForTargetCert({
    proceso: proc27001,
    sourceCert: cert27001,
    targetCert: cert9001,
    requirementsCatalog: catalog,
  });
  assert.equal(plan27001To9001.entries[0]?.status, 'NO_EQUIVALENT');
  assert.equal(plan27001To9001.entries[0]?.preselected, false);
  assert.deepEqual(
    buildFinalTargetRequisitoIds({ resolutionPlan: plan27001To9001 }),
    []
  );

  // 4. Dynamic semantic similarity net for CSV-imported norm on 7.1.5 and 4.1
  const procCsv: ProcessEntity = {
    id: 'cccc0007-0000-0000-0000-000000000007',
    id_certificado: cert9001.id,
    nombre_proceso: 'Metrología',
    tipo: 'De Apoyo',
    clausulas_cubiertas: ['4.1', '7.1.5'],
  };
  const planCsv = resolveProcesoClausesForTargetCert({
    proceso: procCsv,
    sourceCert: cert9001,
    targetCert: certCsv,
    requirementsCatalog: catalog,
  });
  const csv41 = planCsv.entries.find((e) => e.sourceClauses.includes('4.1'));
  const csv715 = planCsv.entries.find((e) => e.sourceClauses.includes('7.1.5'));
  assert.equal(csv41?.status, 'SEMANTIC_COLLISION');
  assert.equal(csv41?.preselected, false);
  assert.equal(csv715?.status, 'SEMANTIC_COLLISION');
  assert.equal(csv715?.preselected, false);

  // 5. buildFinalTargetRequisitoIds even WITHOUT requirementsCatalog rejects foreign norm UUIDs
  assert.deepEqual(
    buildFinalTargetRequisitoIds({
      resolutionPlan: plan9001To27001,
      extraManualTargetReqIds: ['f0000000-0000-0000-0000-000000000041'], // ISO 9001 req ID!
    }),
    ['f2700100-0000-0000-0000-000000000091']
  );

  // 6. Malformed ID validation enforces Zero-UUID without leaking UUIDs
  assert.throws(
    () =>
      resolveProcesoClausesForTargetCert({
        proceso: { ...proc27001, id: 'not-a-uuid' },
        sourceCert: cert27001,
        targetCert: cert9001,
        requirementsCatalog: catalog,
      }),
    (err: Error) => assertZeroUuidExposure(err.message).compliant
  );
});
