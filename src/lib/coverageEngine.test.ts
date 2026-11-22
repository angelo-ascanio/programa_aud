import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyNonApplicableSmartMutationToState,
  evaluateCertificateCoverage,
  isClauseBlockedByCertificateExclusions,
  isLtreeSelfOrDescendant,
  previewNonApplicableSmartMutation,
  resolveRequisitoIsMandatory,
} from './coverageEngine';
import { type RequisitoLtree } from './extraDomain';
import { expandNormasCatalogBundle } from './generated/normasCatalogBundle';
import {
  INITIAL_CERTIFICADOS_DETAILED,
  type CertificadoDetailEntity,
} from './multisiteSampling';
import { buildRequisitoLtreeFromNormalized } from './requisitoCsvImporter';

const NORMA_ID = 'e0000000-0000-0000-0000-000000009001';
const NORMA_CODE = 'ISO 9001:2015';

function makeClause(
  id: string,
  codigo: string,
  ruta: string,
  opts: Partial<RequisitoLtree> = {}
): RequisitoLtree {
  return {
    id,
    id_norma: NORMA_ID,
    norma_codigo: NORMA_CODE,
    id_requisito_padre: opts.id_requisito_padre ?? null,
    codigo,
    explicit_code: opts.explicit_code ?? true,
    es_obligatorio: opts.es_obligatorio,
    obligatorio_origen: opts.obligatorio_origen,
    titulo: opts.titulo ?? `Cláusula ${codigo}`,
    descripcion: opts.descripcion,
    translations: opts.translations,
    ruta_materializada: ruta,
    nivel: ruta.split('.').length,
    es_padre: opts.es_padre ?? false,
    deleted_at: opts.deleted_at ?? null,
  };
}

function buildSyntheticIsoTree(): RequisitoLtree[] {
  return [
    makeClause('req-1', '1', '1', { es_padre: true, es_obligatorio: false, obligatorio_origen: 'AUTO_CHAPTER' }),
    makeClause('req-1a', '1.a', '1.1_a', { id_requisito_padre: 'req-1', es_obligatorio: false, obligatorio_origen: 'AUTO_CHAPTER' }),
    makeClause('req-2', '2', '2', { es_obligatorio: false, obligatorio_origen: 'AUTO_CHAPTER' }),
    makeClause('req-3', '3', '3', { es_obligatorio: false, obligatorio_origen: 'AUTO_CHAPTER' }),
    makeClause('req-4', '4', '4', { es_padre: true, es_obligatorio: false, obligatorio_origen: 'AUTO_TEXT' }),
    makeClause('req-4-note', '4.0', '4.4_0', { id_requisito_padre: 'req-4', es_obligatorio: false, obligatorio_origen: 'AUTO_TEXT' }),
    makeClause('req-44', '4.4', '4.4_4', { id_requisito_padre: 'req-4', es_padre: true, es_obligatorio: false, obligatorio_origen: 'AUTO_TEXT' }),
    makeClause('req-441', '4.4.1', '4.4_4.4_4_1', { id_requisito_padre: 'req-44', es_padre: true, es_obligatorio: true, obligatorio_origen: 'AUTO_TEXT' }),
    makeClause('req-441a', '4.4.1.a', '4.4_4.4_4_1.4_4_1_a', { id_requisito_padre: 'req-441', explicit_code: false, es_obligatorio: true, obligatorio_origen: 'AUTO_INHERITED' }),
    makeClause('req-441b', '4.4.1.b', '4.4_4.4_4_1.4_4_1_b', { id_requisito_padre: 'req-441', explicit_code: false, es_obligatorio: true, obligatorio_origen: 'AUTO_INHERITED' }),
    makeClause('req-442', '4.4.2', '4.4_4.4_4_2', { id_requisito_padre: 'req-44', es_padre: true, es_obligatorio: true, obligatorio_origen: 'AUTO_TEXT' }),
    makeClause('req-442a', '4.4.2.a', '4.4_4.4_4_2.4_4_2_a', { id_requisito_padre: 'req-442', explicit_code: false, es_obligatorio: true, obligatorio_origen: 'AUTO_INHERITED' }),
    makeClause('req-442b', '4.4.2.b', '4.4_4.4_4_2.4_4_2_b', { id_requisito_padre: 'req-442', explicit_code: false, es_obligatorio: true, obligatorio_origen: 'AUTO_INHERITED' }),
    makeClause('req-85', '8.5', '8.8_5', { es_obligatorio: true, obligatorio_origen: 'AUTO_TEXT' }),
  ];
}

function makeTestCertificate(
  procesos: CertificadoDetailEntity['procesos'],
  noAplicables: CertificadoDetailEntity['noAplicables'] = []
): CertificadoDetailEntity {
  return {
    ...INITIAL_CERTIFICADOS_DETAILED[0],
    id: '40000000-0000-0000-0000-000000009999',
    id_norma: NORMA_ID,
    norma_codigo: NORMA_CODE,
    procesos,
    noAplicables,
  };
}

test('Step 2.1: isLtreeSelfOrDescendant enforces exact dot boundaries without prefix collisions', () => {
  assert.equal(isLtreeSelfOrDescendant('4.4_1', '4.4_1'), true);
  assert.equal(isLtreeSelfOrDescendant('4.4_1.4_4_1_a', '4.4_1'), true);
  assert.equal(isLtreeSelfOrDescendant('4.4_10', '4.4_1'), false);
  assert.equal(isLtreeSelfOrDescendant('10', '1'), false);
  assert.equal(isLtreeSelfOrDescendant('', '4'), false);
  assert.equal(isLtreeSelfOrDescendant('4', ''), false);
});

test('Step 2.1: resolveRequisitoIsMandatory honors manual overrides and hybrid Step 1.1 fallback rules', () => {
  const manualFalse = makeClause('m1', '8.1', '8.8_1', {
    es_obligatorio: false,
    obligatorio_origen: 'MANUAL',
    translations: {
      es: { id_requisito: 'm1', lang: 'es', title: '8.1', content_html: '<p>La organización debe controlar.</p>' },
    },
  });
  assert.equal(resolveRequisitoIsMandatory(manualFalse, true, false), false);

  const chapterOne = makeClause('c1', '1.a', '1.1_a');
  assert.equal(resolveRequisitoIsMandatory(chapterOne, true, true), false);

  const debeClause = makeClause('t1', '4.4.1', '4.4_4.4_4_1', {
    translations: {
      es: { id_requisito: 't1', lang: 'es', title: '4.4.1', content_html: '<p>La organización debe establecer procesos.</p>' },
    },
  });
  assert.equal(resolveRequisitoIsMandatory(debeClause, true, false), true);

  const inheritedSubBullet = makeClause('t1a', '4.4.1.a', '4.4_4.4_4_1.4_4_1_a', {
    translations: {
      es: { id_requisito: 't1a', lang: 'es', title: '', content_html: '<p>determinar entradas requeridas</p>' },
    },
  });
  assert.equal(resolveRequisitoIsMandatory(inheritedSubBullet, true, true), true);

  const shouldOnlyNote = makeClause('t2', '5.0', '5.5_0', {
    translations: {
      es: { id_requisito: 't2', lang: 'es', title: 'Nota', content_html: '<p>NOTA La dirección debería considerar...</p>' },
    },
  });
  assert.equal(resolveRequisitoIsMandatory(shouldOnlyNote, true, false), false);

  const skeletonParent = makeClause('s1', '4', '4', { es_padre: true });
  const skeletonLeaf = makeClause('s2', '4.1', '4.4_1', { es_padre: false });
  assert.equal(resolveRequisitoIsMandatory(skeletonParent, false, false), false);
  assert.equal(resolveRequisitoIsMandatory(skeletonLeaf, false, false), true);
});

test('Step 2.1: downward LTREE inheritance covers all descendants without double-counting containers', () => {
  const catalog = buildSyntheticIsoTree();
  const cert = makeTestCertificate([
    {
      id: 'proc-a',
      id_certificado: '40000000-0000-0000-0000-000000009999',
      nombre_proceso: 'Gestión Operativa',
      tipo: 'Medular',
      clausulas_cubiertas: ['4.4'],
    },
  ]);

  const report = evaluateCertificateCoverage({
    cert,
    requirementsCatalog: catalog,
  });

  // Mandatory clauses in synthetic tree: 4.4.1, 4.4.1.a, 4.4.1.b, 4.4.2, 4.4.2.a, 4.4.2.b, 8.5 => 7
  assert.equal(report.summary.totalObligatorios, 7);
  assert.equal(report.summary.cubiertosPorProceso, 6);
  assert.equal(report.summary.excluidosNoAplicables, 0);
  assert.equal(report.summary.pendientes, 1);
  assert.equal(report.summary.coberturaCompleta, false);
  assert.equal(report.summary.hasAnyDirectAssignments, true);

  const node44 = report.nodeByRequisitoId.get('req-44');
  const node441 = report.nodeByRequisitoId.get('req-441');
  const node441a = report.nodeByRequisitoId.get('req-441a');
  const node442b = report.nodeByRequisitoId.get('req-442b');
  const node85 = report.nodeByRequisitoId.get('req-85');
  const node4 = report.nodeByRequisitoId.get('req-4');

  assert.equal(node44?.estado, 'CUBIERTO');
  assert.deepEqual(node44?.directProcessIds, ['proc-a']);
  assert.equal(node44?.inheritedFromProcessCodigo, null);

  assert.equal(node441?.estado, 'CUBIERTO');
  assert.deepEqual(node441?.directProcessIds, []);
  assert.equal(node441?.inheritedFromProcessCodigo, '4.4');

  assert.equal(node441a?.estado, 'CUBIERTO');
  assert.equal(node441a?.inheritedFromProcessCodigo, '4.4');

  assert.equal(node442b?.estado, 'CUBIERTO');
  assert.equal(node442b?.inheritedFromProcessCodigo, '4.4');

  assert.equal(node85?.estado, 'PENDIENTE');
  assert.equal(node4?.estado, 'CUBIERTO'); // 4 only has mandatory descendants inside 4.4, all 6 covered
});

test('Step 2.1: container rollup distinguishes PARCIAL, CUBIERTO, MIXTO, INFORMATIVA, NO_APLICABLE, and PENDIENTE', () => {
  const catalog = buildSyntheticIsoTree();

  // Case A: only 4.4.1 assigned -> 4.4 is PARCIAL, 4.4.2 stays PENDIENTE
  const certPartial = makeTestCertificate([
    {
      id: 'proc-a',
      id_certificado: '40000000-0000-0000-0000-000000009999',
      nombre_proceso: 'Proceso A',
      tipo: 'Medular',
      clausulas_cubiertas: ['4.4.1'],
    },
  ]);
  const partialReport = evaluateCertificateCoverage({ cert: certPartial, requirementsCatalog: catalog });
  assert.equal(partialReport.nodeByRequisitoId.get('req-44')?.estado, 'PARCIAL');
  assert.equal(partialReport.nodeByRequisitoId.get('req-44')?.coveredDescendantCount, 3);
  assert.equal(partialReport.nodeByRequisitoId.get('req-44')?.pendingDescendantCount, 3);
  assert.equal(partialReport.nodeByRequisitoId.get('req-442')?.estado, 'PENDIENTE');
  assert.equal(partialReport.nodeByRequisitoId.get('req-1')?.estado, 'INFORMATIVA');
  assert.equal(partialReport.nodeByRequisitoId.get('req-1a')?.estado, 'INFORMATIVA');
  assert.equal(partialReport.nodeByRequisitoId.get('req-2')?.estado, 'INFORMATIVA');
  assert.equal(partialReport.nodeByRequisitoId.get('req-3')?.estado, 'INFORMATIVA');
  assert.equal(partialReport.nodeByRequisitoId.get('req-4-note')?.estado, 'INFORMATIVA');

  // Case B: 4.4.1 and 4.4.2 assigned separately -> 4.4 rolls up to CUBIERTO cleanly
  const certFullContainer = makeTestCertificate([
    {
      id: 'proc-a',
      id_certificado: '40000000-0000-0000-0000-000000009999',
      nombre_proceso: 'Proceso A',
      tipo: 'Medular',
      clausulas_cubiertas: ['4.4.1', '4.4.2'],
    },
  ]);
  const fullContainerReport = evaluateCertificateCoverage({
    cert: certFullContainer,
    requirementsCatalog: catalog,
  });
  assert.equal(fullContainerReport.nodeByRequisitoId.get('req-44')?.estado, 'CUBIERTO');
  assert.equal(fullContainerReport.summary.totalObligatorios, 7);
  assert.equal(fullContainerReport.summary.cubiertosPorProceso, 6);

  // Case C: 4.4.1 covered + 4.4.2 excluded -> 4.4 rolls up to MIXTO
  const certMixed = makeTestCertificate(
    [
      {
        id: 'proc-a',
        id_certificado: '40000000-0000-0000-0000-000000009999',
        nombre_proceso: 'Proceso A',
        tipo: 'Medular',
        clausulas_cubiertas: ['4.4.1'],
      },
    ],
    [
      {
        id: 'na-442',
        id_certificado: '40000000-0000-0000-0000-000000009999',
        id_requisito: 'req-442',
        requisito_codigo: '4.4.2',
        requisito_titulo: '4.4.2',
        justificacion: 'Exclusión justificada para el alcance del certificado.',
      },
    ]
  );
  const mixedReport = evaluateCertificateCoverage({ cert: certMixed, requirementsCatalog: catalog });
  assert.equal(mixedReport.nodeByRequisitoId.get('req-44')?.estado, 'MIXTO');
  assert.equal(mixedReport.summary.cubiertosPorProceso, 3);
  assert.equal(mixedReport.summary.excluidosNoAplicables, 3);
  assert.equal(mixedReport.summary.pendientes, 1);

  // Case D: all descendants under 4.4 excluded (4.4.1 & 4.4.2) -> 4.4 rolls up to NO_APLICABLE
  const certAllExcluded = makeTestCertificate([], [
    {
      id: 'na-441',
      id_certificado: '40000000-0000-0000-0000-000000009999',
      id_requisito: 'req-441',
      requisito_codigo: '4.4.1',
      requisito_titulo: '4.4.1',
      justificacion: 'Exclusión 4.4.1 para validar rollup.',
    },
    {
      id: 'na-442',
      id_certificado: '40000000-0000-0000-0000-000000009999',
      id_requisito: 'req-442',
      requisito_codigo: '4.4.2',
      requisito_titulo: '4.4.2',
      justificacion: 'Exclusión 4.4.2 para validar rollup.',
    },
  ]);
  const allExclReport = evaluateCertificateCoverage({
    cert: certAllExcluded,
    requirementsCatalog: catalog,
  });
  assert.equal(allExclReport.nodeByRequisitoId.get('req-44')?.estado, 'NO_APLICABLE');
  assert.equal(allExclReport.nodeByRequisitoId.get('req-4')?.estado, 'NO_APLICABLE');
  assert.equal(allExclReport.nodeByRequisitoId.get('req-85')?.estado, 'PENDIENTE');
});

test('Step 2.1: Smart-Mutation preview & immutable reducer prune overlapping LTREE descendants across multiple processes and preserve unrelated clauses', () => {
  const catalog = buildSyntheticIsoTree();
  const req44 = catalog.find((r) => r.codigo === '4.4')!;
  const cert = makeTestCertificate([
    {
      id: 'proc-a',
      id_certificado: '40000000-0000-0000-0000-000000009999',
      nombre_proceso: 'Proceso A',
      tipo: 'Medular',
      clausulas_cubiertas: ['4.4.1', '8.5'],
      requisitos_detalle: [
        { codigo: '4.4.1', titulo: '4.4.1' },
        { codigo: '8.5', titulo: '8.5' },
      ],
    },
    {
      id: 'proc-b',
      id_certificado: '40000000-0000-0000-0000-000000009999',
      nombre_proceso: 'Proceso B',
      tipo: 'De Apoyo',
      clausulas_cubiertas: ['4.4.1.a', '4.4.2'],
      requisitos_detalle: [
        { codigo: '4.4.1.a', titulo: '4.4.1.a' },
        { codigo: '4.4.2', titulo: '4.4.2' },
      ],
    },
  ]);

  const preview = previewNonApplicableSmartMutation({
    cert,
    targetRequisito: req44,
    requirementsCatalog: catalog,
  });

  assert.equal(preview.willMutate, true);
  assert.equal(preview.affectedProcessCount, 2);
  assert.deepEqual(
    preview.prunedLinks.map((l) => `${l.id_proceso}:${l.codigo}`),
    ['proc-a:4.4.1', 'proc-b:4.4.1.a', 'proc-b:4.4.2']
  );

  const newExclusion = {
    id: 'na-44',
    id_certificado: cert.id,
    id_requisito: req44.id,
    requisito_codigo: '4.4',
    requisito_titulo: req44.titulo,
    justificacion: 'Exclusión justificada de toda la subcláusula 4.4 para validación.',
  };

  const topLevelProcesses = cert.procesos.map((p) => ({
    id: p.id,
    clausulas_cubiertas: [...p.clausulas_cubiertas],
  }));

  const reduced = applyNonApplicableSmartMutationToState({
    certificates: [cert],
    processes: topLevelProcesses,
    targetCertId: cert.id,
    exclusion: newExclusion,
    targetRequisito: req44,
    requirementsCatalog: catalog,
    mode: 'upsert',
  });

  // Input immutability verified
  assert.deepEqual(cert.procesos[0].clausulas_cubiertas, ['4.4.1', '8.5']);
  assert.equal(cert.noAplicables.length, 0);

  const updatedCert = reduced.nextCertificates[0];
  assert.equal(updatedCert.noAplicables.length, 1);
  assert.deepEqual(updatedCert.procesos[0].clausulas_cubiertas, ['8.5']);
  assert.deepEqual(
    updatedCert.procesos[0].requisitos_detalle?.map((d) => d.codigo),
    ['8.5']
  );
  assert.deepEqual(updatedCert.procesos[1].clausulas_cubiertas, []);
  assert.deepEqual(reduced.nextProcesses[0].clausulas_cubiertas, ['8.5']);
  assert.deepEqual(reduced.nextProcesses[1].clausulas_cubiertas, []);

  // Block check verifies 4.4, 4.4.1, and 4.4.1.a are blocked while 8.5 remains allowed
  const req441a = catalog.find((r) => r.codigo === '4.4.1.a')!;
  const req85 = catalog.find((r) => r.codigo === '8.5')!;
  const block441a = isClauseBlockedByCertificateExclusions({
    cert: updatedCert,
    targetRequisito: req441a,
    requirementsCatalog: catalog,
  });
  assert.equal(block441a.blocked, true);
  assert.equal(block441a.blockingExclusionCodigo, '4.4');

  const block85 = isClauseBlockedByCertificateExclusions({
    cert: updatedCert,
    targetRequisito: req85,
    requirementsCatalog: catalog,
  });
  assert.equal(block85.blocked, false);

  // Archived exclusion no longer blocks assignment
  const blockWhenArchived = isClauseBlockedByCertificateExclusions({
    cert: updatedCert,
    targetRequisito: req441a,
    requirementsCatalog: catalog,
    archivedNoAplicableIds: new Set(['na-44']),
  });
  assert.equal(blockWhenArchived.blocked, false);
});

test('Step 2.1: exclusion precedence over ancestor process coverage keeps sibling clauses covered and marks excluded subtree NO_APLICABLE', () => {
  const catalog = buildSyntheticIsoTree();
  const cert = makeTestCertificate(
    [
      {
        id: 'proc-a',
        id_certificado: '40000000-0000-0000-0000-000000009999',
        nombre_proceso: 'Proceso Integral 4.4',
        tipo: 'Medular',
        clausulas_cubiertas: ['4.4'],
      },
    ],
    [
      {
        id: 'na-442',
        id_certificado: '40000000-0000-0000-0000-000000009999',
        id_requisito: 'req-442',
        requisito_codigo: '4.4.2',
        requisito_titulo: '4.4.2',
        justificacion: 'Exclusión específica sobre 4.4.2 manteniendo 4.4.1 cubierta.',
      },
    ]
  );

  const report = evaluateCertificateCoverage({ cert, requirementsCatalog: catalog });
  assert.equal(report.nodeByRequisitoId.get('req-441')?.estado, 'CUBIERTO');
  assert.equal(report.nodeByRequisitoId.get('req-441a')?.estado, 'CUBIERTO');
  assert.equal(report.nodeByRequisitoId.get('req-442')?.estado, 'NO_APLICABLE');
  assert.equal(report.nodeByRequisitoId.get('req-442a')?.estado, 'NO_APLICABLE');
  assert.equal(report.nodeByRequisitoId.get('req-442a')?.inheritedExclusionCodigo, '4.4.2');
  assert.equal(report.nodeByRequisitoId.get('req-442')?.exclusionId, 'na-442');
  assert.equal(report.summary.cubiertosPorProceso, 3);
  assert.equal(report.summary.excluidosNoAplicables, 3);
  assert.equal(report.summary.pendientes, 1);
});

test('Step 2.1: 100% completion invariant holds iff pendientes === 0 and matches bundled ISO 9001:2015 mandatory denominator', () => {
  const catalog = buildSyntheticIsoTree();
  const completeCert = makeTestCertificate(
    [
      {
        id: 'proc-a',
        id_certificado: '40000000-0000-0000-0000-000000009999',
        nombre_proceso: 'Proceso Completo',
        tipo: 'Medular',
        clausulas_cubiertas: ['4.4.1', '8.5'],
      },
    ],
    [
      {
        id: 'na-442',
        id_certificado: '40000000-0000-0000-0000-000000009999',
        id_requisito: 'req-442',
        requisito_codigo: '4.4.2',
        requisito_titulo: '4.4.2',
        justificacion: 'Exclusión justificada completando 100% del estándar.',
      },
    ]
  );

  const completeReport = evaluateCertificateCoverage({
    cert: completeCert,
    requirementsCatalog: catalog,
  });
  assert.equal(completeReport.summary.pendientes, 0);
  assert.equal(completeReport.summary.porcentajeCobertura, 100);
  assert.equal(completeReport.summary.coberturaCompleta, true);
  assert.equal(completeReport.pendingMandatoryNodes.length, 0);

  const emptyStdReport = evaluateCertificateCoverage({
    cert: makeTestCertificate([]),
    requirementsCatalog: [makeClause('info-1', '1', '1', { es_obligatorio: false })],
  });
  assert.equal(emptyStdReport.summary.totalObligatorios, 0);
  assert.equal(emptyStdReport.summary.porcentajeCobertura, 100);
  assert.equal(emptyStdReport.summary.coberturaCompleta, true);

  // Verify real bundled ISO 9001:2015 catalog matches PostgreSQL Step 1.1/1.2 metrics (319 mandatory out of 350 clauses)
  const bundle = expandNormasCatalogBundle();
  const bundledIso9001Catalog = bundle.clauses
    .filter((c) => c.id_norma === NORMA_ID)
    .map((c) => buildRequisitoLtreeFromNormalized(c, c.codigo));

  const bundleReport = evaluateCertificateCoverage({
    cert: makeTestCertificate(
      [
        {
          id: 'p1',
          id_certificado: '40000000-0000-0000-0000-000000009999',
          nombre_proceso: 'Troquelado',
          tipo: 'Medular',
          clausulas_cubiertas: ['4.1', '8.5'],
        },
      ],
      [
        {
          id: 'e1',
          id_certificado: '40000000-0000-0000-0000-000000009999',
          id_requisito: 'f0000000-0000-0000-0000-000000000051',
          requisito_codigo: '5.1',
          requisito_titulo: 'Liderazgo y compromiso',
          justificacion: 'Validación 1:1 contra resumen_cobertura_certificado de PostgreSQL.',
        },
      ]
    ),
    requirementsCatalog: bundledIso9001Catalog,
  });

  assert.equal(bundleReport.summary.totalObligatorios, 319);
  assert.equal(bundleReport.summary.cubiertosPorProceso, 22);
  assert.equal(bundleReport.summary.excluidosNoAplicables, 15);
  assert.equal(bundleReport.summary.pendientes, 282);
  assert.equal(bundleReport.summary.porcentajeCobertura, 11.6);
  assert.equal(bundleReport.summary.coberturaCompleta, false);
});

test('Step Final Edge Cases #8, #9, #10, #13: restore exclusion, archive process, switch certificate standard, and multi-process DISTINCT coverage', () => {
  const catalog = buildSyntheticIsoTree();
  const req442 = catalog.find((r) => r.codigo === '4.4.2')!;

  // Edge Case #8: Restoring an archived exclusion while a process meanwhile covered 4.4.2 prunes conflicting process links
  const certRestore = makeTestCertificate([
    {
      id: 'proc-a',
      id_certificado: '40000000-0000-0000-0000-000000009999',
      nombre_proceso: 'Proceso A',
      tipo: 'Medular',
      clausulas_cubiertas: ['4.4.1', '4.4.2', '8.5'],
      requisitos_detalle: [
        { codigo: '4.4.1', titulo: '4.4.1' },
        { codigo: '4.4.2', titulo: '4.4.2' },
        { codigo: '8.5', titulo: '8.5' },
      ],
    },
  ]);
  const restoredExclusion = {
    id: 'na-442-restored',
    id_certificado: certRestore.id,
    id_requisito: req442.id,
    requisito_codigo: '4.4.2',
    requisito_titulo: req442.titulo,
    justificacion: 'Exclusión restaurada tras cobertura temporal.',
  };
  const restoreResult = applyNonApplicableSmartMutationToState({
    certificates: [certRestore],
    processes: certRestore.procesos.map((p) => ({
      id: p.id,
      clausulas_cubiertas: [...p.clausulas_cubiertas],
    })),
    targetCertId: certRestore.id,
    exclusion: restoredExclusion,
    targetRequisito: req442,
    requirementsCatalog: catalog,
    mode: 'restore',
  });
  assert.deepEqual(
    restoreResult.prunedLinks.map((l) => l.codigo),
    ['4.4.2']
  );
  assert.deepEqual(restoreResult.nextCertificates[0].procesos[0].clausulas_cubiertas, [
    '4.4.1',
    '8.5',
  ]);
  assert.deepEqual(restoreResult.nextProcesses[0].clausulas_cubiertas, ['4.4.1', '8.5']);
  const restoredReport = evaluateCertificateCoverage({
    cert: restoreResult.nextCertificates[0],
    requirementsCatalog: catalog,
  });
  assert.equal(restoredReport.summary.pendientes, 0);
  assert.equal(restoredReport.summary.coberturaCompleta, true);

  // Edge Case #9: Soft-deleting the sole owning process flips its clauses back to PENDIENTE
  const archivedReport = evaluateCertificateCoverage({
    cert: restoreResult.nextCertificates[0],
    requirementsCatalog: catalog,
    archivedProcesoIds: new Set(['proc-a']),
  });
  assert.equal(archivedReport.summary.cubiertosPorProceso, 0);
  assert.equal(archivedReport.summary.excluidosNoAplicables, 3);
  assert.equal(archivedReport.summary.pendientes, 4);
  assert.equal(archivedReport.nodeByRequisitoId.get('req-441')?.estado, 'PENDIENTE');
  assert.equal(archivedReport.nodeByRequisitoId.get('req-85')?.estado, 'PENDIENTE');

  // Edge Case #10: Editing certificate id_norma evaluates coverage strictly against the new standard
  const otherNormaId = 'e0000000-0000-0000-0000-000000014001';
  const extendedCatalog: RequisitoLtree[] = [
    ...catalog,
    {
      id: 'req-14001-612',
      id_norma: otherNormaId,
      norma_codigo: 'ISO 14001:2015',
      id_requisito_padre: null,
      codigo: '6.1.2',
      explicit_code: true,
      es_obligatorio: true,
      obligatorio_origen: 'AUTO_TEXT',
      titulo: 'Aspectos ambientales',
      ruta_materializada: '6.6_1.6_1_2',
      nivel: 3,
      es_padre: false,
      deleted_at: null,
    },
  ];
  const switchedCert: CertificadoDetailEntity = {
    ...certRestore,
    id_norma: otherNormaId,
    norma_codigo: 'ISO 14001:2015',
  };
  const switchedReport = evaluateCertificateCoverage({
    cert: switchedCert,
    requirementsCatalog: extendedCatalog,
  });
  assert.equal(switchedReport.summary.totalObligatorios, 1);
  assert.equal(switchedReport.summary.cubiertosPorProceso, 0);
  assert.equal(switchedReport.summary.pendientes, 1);
  assert.equal(switchedReport.pendingMandatoryNodes[0]?.codigo, '6.1.2');

  // Edge Case #13: Multi-process shared coverage counts DISTINCT once and lists both process names
  const sharedCert = makeTestCertificate([
    {
      id: 'proc-1',
      id_certificado: '40000000-0000-0000-0000-000000009999',
      nombre_proceso: 'Gestión Documental',
      tipo: 'De Apoyo',
      clausulas_cubiertas: ['8.5'],
    },
    {
      id: 'proc-2',
      id_certificado: '40000000-0000-0000-0000-000000009999',
      nombre_proceso: 'Producción',
      tipo: 'Medular',
      clausulas_cubiertas: ['8.5'],
    },
  ]);
  const sharedReport = evaluateCertificateCoverage({
    cert: sharedCert,
    requirementsCatalog: catalog,
  });
  assert.equal(sharedReport.summary.cubiertosPorProceso, 1);
  assert.ok(sharedReport.summary.cubiertosPorProceso <= sharedReport.summary.totalObligatorios);
  assert.deepEqual(sharedReport.nodeByRequisitoId.get('req-85')?.directProcessNames, [
    'Gestión Documental',
    'Producción',
  ]);
});

test('Step 2.2: Shared Process P evaluates independent cross-standard coverage on X vs Y and isolates Smart Mutation pruning to Z', () => {
  const norma9001 = 'e0000000-0000-0000-0000-000000009001';
  const norma14001 = 'e0000000-0000-0000-0000-000000014001';

  const catalog: RequisitoLtree[] = [
    {
      id: 'req-9001-41',
      id_norma: norma9001,
      norma_codigo: 'ISO 9001:2015',
      codigo: '4.1',
      es_obligatorio: true,
      titulo: 'Contexto de la organización',
      ruta_materializada: '9001.4.4_1',
      nivel: 2,
      es_padre: false,
      deleted_at: null,
    },
    {
      id: 'req-9001-83',
      id_norma: norma9001,
      norma_codigo: 'ISO 9001:2015',
      codigo: '8.3',
      es_obligatorio: true,
      titulo: 'Diseño y desarrollo',
      ruta_materializada: '9001.8.8_3',
      nivel: 2,
      es_padre: true,
      deleted_at: null,
    },
    {
      id: 'req-9001-832',
      id_norma: norma9001,
      norma_codigo: 'ISO 9001:2015',
      codigo: '8.3.2',
      es_obligatorio: true,
      titulo: 'Planificación del diseño',
      ruta_materializada: '9001.8.8_3.8_3_2',
      nivel: 3,
      es_padre: false,
      deleted_at: null,
    },
    {
      id: 'req-14001-41',
      id_norma: norma14001,
      norma_codigo: 'ISO 14001:2015',
      codigo: '4.1',
      es_obligatorio: true,
      titulo: 'Contexto ambiental',
      ruta_materializada: '14001.4.4_1',
      nivel: 2,
      es_padre: false,
      deleted_at: null,
    },
    {
      id: 'req-14001-61',
      id_norma: norma14001,
      norma_codigo: 'ISO 14001:2015',
      codigo: '6.1',
      es_obligatorio: true,
      titulo: 'Aspectos ambientales',
      ruta_materializada: '14001.6.6_1',
      nivel: 2,
      es_padre: false,
      deleted_at: null,
    },
  ];

  const certXId = 'aaaa0000-0000-0000-0000-000000000001';
  const certYId = 'aaaa0000-0000-0000-0000-000000000002';
  const certZId = 'aaaa0000-0000-0000-0000-000000000003';

  const sharedProcess = {
    id: 'proc-shared-1',
    id_certificado: certXId,
    ownerCertId: certXId,
    nombre_proceso: 'Gestión Operativa Corporativa',
    tipo: 'Medular' as const,
    clausulas_cubiertas: ['4.1', '8.3', '8.3.2'],
    requisitos_by_certificado: {
      [certXId]: { clausulas_cubiertas: ['4.1', '8.3', '8.3.2'] },
      [certYId]: { clausulas_cubiertas: ['4.1'] },
      [certZId]: { clausulas_cubiertas: ['4.1', '8.3', '8.3.2'] },
    },
  };

  const certX: CertificadoDetailEntity = {
    ...INITIAL_CERTIFICADOS_DETAILED[0],
    id: certXId,
    numero_certificado: 'FN-X-9001',
    id_norma: norma9001,
    norma_codigo: 'ISO 9001:2015',
    procesos: [sharedProcess],
    noAplicables: [],
  };

  const certY: CertificadoDetailEntity = {
    ...INITIAL_CERTIFICADOS_DETAILED[0],
    id: certYId,
    numero_certificado: 'FN-Y-14001',
    id_norma: norma14001,
    norma_codigo: 'ISO 14001:2015',
    procesos: [sharedProcess],
    noAplicables: [],
  };

  const certZ: CertificadoDetailEntity = {
    ...INITIAL_CERTIFICADOS_DETAILED[0],
    id: certZId,
    numero_certificado: 'FN-Z-9001',
    id_norma: norma9001,
    norma_codigo: 'ISO 9001:2015',
    procesos: [sharedProcess],
    noAplicables: [],
  };

  // Evaluate X (9001: 4.1, 8.3, 8.3.2 -> 3/3 covered) & Y (14001: only 4.1 covered, 6.1 pending -> 1/2)
  const reportX = evaluateCertificateCoverage({ cert: certX, requirementsCatalog: catalog });
  const reportY = evaluateCertificateCoverage({ cert: certY, requirementsCatalog: catalog });
  assert.equal(reportX.summary.cubiertosPorProceso, 3);
  assert.equal(reportX.summary.pendientes, 0);
  assert.equal(reportY.summary.cubiertosPorProceso, 1);
  assert.equal(reportY.summary.pendientes, 1);
  assert.equal(reportY.pendingMandatoryNodes[0]?.codigo, '6.1');

  // Declare 8.3 Non-Applicable via Smart Mutation on Cert Z ONLY
  const mutationZ = applyNonApplicableSmartMutationToState({
    certificates: [certX, certY, certZ],
    processes: [sharedProcess],
    targetCertId: certZId,
    exclusion: {
      id: 'na-z-83',
      id_certificado: certZId,
      id_requisito: 'req-9001-83',
      requisito_codigo: '8.3',
      requisito_titulo: 'Diseño y desarrollo',
      ruta_materializada: '9001.8.8_3',
      justificacion: 'Sede Z no realiza diseño.',
    },
    targetRequisito: {
      id: 'req-9001-83',
      id_norma: norma9001,
      codigo: '8.3',
      ruta_materializada: '9001.8.8_3',
    },
    requirementsCatalog: catalog,
  });

  const nextX = mutationZ.nextCertificates.find((c) => c.id === certXId)!;
  const nextZ = mutationZ.nextCertificates.find((c) => c.id === certZId)!;
  const nextProc = mutationZ.nextProcesses[0];

  // (P, Z) pruned 8.3 & 8.3.2 cleanly; (P, X) and (P, Y) untouched!
  assert.deepEqual(nextZ.procesos[0].requisitos_by_certificado?.[certZId].clausulas_cubiertas, [
    '4.1',
  ]);
  assert.deepEqual(nextZ.procesos[0].requisitos_by_certificado?.[certXId].clausulas_cubiertas, [
    '4.1',
    '8.3',
    '8.3.2',
  ]);
  assert.deepEqual(nextX.procesos[0].requisitos_by_certificado?.[certXId].clausulas_cubiertas, [
    '4.1',
    '8.3',
    '8.3.2',
  ]);
  assert.deepEqual(nextProc.requisitos_by_certificado?.[certZId].clausulas_cubiertas, ['4.1']);
  assert.deepEqual(nextProc.requisitos_by_certificado?.[certXId].clausulas_cubiertas, [
    '4.1',
    '8.3',
    '8.3.2',
  ]);
  assert.deepEqual(nextProc.clausulas_cubiertas, ['4.1', '8.3', '8.3.2']);

  // Post-mutation coverage verifies Cert X stays unaffected (3 covered) while Cert Z marks 8.3/8.3.2 NA
  const postReportX = evaluateCertificateCoverage({ cert: nextX, requirementsCatalog: catalog });
  const postReportZ = evaluateCertificateCoverage({ cert: nextZ, requirementsCatalog: catalog });
  assert.equal(postReportX.summary.cubiertosPorProceso, 3);
  assert.equal(postReportX.summary.excluidosNoAplicables, 0);
  assert.equal(postReportZ.summary.cubiertosPorProceso, 1);
  assert.equal(postReportZ.summary.excluidosNoAplicables, 2);
});


