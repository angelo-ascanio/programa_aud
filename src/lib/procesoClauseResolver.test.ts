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

test('Step 1.2: Same-standard sharing (ISO 9001 -> ISO 9001) copies 1:1 clauses and blocks ISO 4.3 excluded clauses + subtrees', () => {
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
  assert.equal(plan.summaryCounts.semanticCollisionCount, 0);

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

test('Step 1.2: Different-standard sharing (ISO 9001 -> ISO 14001/27001/45001/CSV) ALWAYS returns 0 clauses with zero semantic heuristics', () => {
  const catalog = buildExtendedTestCatalog();
  const cert9001 = makeCert({
    id: 'aaaa0003-0000-0000-0000-000000000003',
    id_norma: NORMA_9001_ID,
    norma_codigo: 'ISO 9001:2015',
    numero_certificado: 'FN-QMS-01',
  });
  const differentNormCerts = [
    makeCert({
      id: 'aaaa0004-0000-0000-0000-000000000004',
      id_norma: NORMA_14001_ID,
      norma_codigo: 'ISO 14001:2015',
      numero_certificado: 'FN-EMS-02',
    }),
    makeCert({
      id: 'aaaa0008-0000-0000-0000-000000000008',
      id_norma: NORMA_27001_ID,
      norma_codigo: 'ISO/IEC 27001:2022',
      numero_certificado: 'FN-ISMS-08',
    }),
    makeCert({
      id: 'aaaa0009-0000-0000-0000-000000000009',
      id_norma: NORMA_45001_ID,
      norma_codigo: 'ISO 45001:2018',
      numero_certificado: 'FN-OHS-09',
    }),
    makeCert({
      id: 'aaaa0010-0000-0000-0000-000000000010',
      id_norma: NORMA_CSV_CUSTOM_ID,
      norma_codigo: 'BRCGS Food v9 (CSV)',
      numero_certificado: 'FN-CUSTOM-10',
    }),
  ];

  const proc: ProcessEntity = {
    id: 'cccc0002-0000-0000-0000-000000000002',
    id_certificado: cert9001.id,
    nombre_proceso: 'Operación Central',
    tipo: 'Medular',
    clausulas_cubiertas: ['4.1', '8.2', '8.3', '9.1'],
  };

  for (const targetCert of differentNormCerts) {
    const plan = resolveProcesoClausesForTargetCert({
      proceso: proc,
      sourceCert: cert9001,
      targetCert,
      requirementsCatalog: catalog,
    });

    assert.equal(plan.isCrossStandard, true);
    assert.deepEqual(plan.entries, []);
    assert.deepEqual(plan.availableManualTargetOptions, []);
    assert.deepEqual(plan.summaryCounts, {
      autoMappedCount: 0,
      hierarchicalCount: 0,
      semanticCollisionCount: 0,
      noEquivalentCount: 0,
      excludedIso43Count: 0,
    });

    // Even if extra IDs are passed, cross-standard plans never map clauses automatically
    assert.deepEqual(
      buildFinalTargetRequisitoIds({
        resolutionPlan: plan,
        extraManualTargetReqIds: ['f1400100-0000-0000-0000-000000000041'],
        targetCert,
        requirementsCatalog: catalog,
      }),
      []
    );
  }
});

test('Step 1.2: Zero-UUID guard rejects invalid UUID identifiers cleanly', () => {
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

  assert.throws(
    () =>
      resolveProcesoClausesForTargetCert({
        proceso: {
          id: 'not-a-uuid',
          id_certificado: cert9001.id,
          nombre_proceso: 'Proceso Inválido',
          tipo: 'Medular',
          clausulas_cubiertas: ['4.1'],
        },
        sourceCert: cert9001,
        targetCert: cert14001,
        requirementsCatalog: catalog,
      }),
    (err: Error) => assertZeroUuidExposure(err.message).compliant
  );
});
