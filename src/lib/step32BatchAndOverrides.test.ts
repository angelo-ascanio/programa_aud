import test from 'node:test';
import assert from 'node:assert/strict';
import type { UserProfile } from './healthCheck';
import {
  INITIAL_CERTIFICADOS_DETAILED,
  type CertificadoDetailEntity,
} from './multisiteSampling';
import {
  INITIAL_NORMAS,
  INITIAL_REQUISITOS_LTREE,
  validateRequisitoDraft,
  type RequisitoLtree,
} from './extraDomain';
import {
  buildProcesoBatchPickerRows,
  computeLinkedClauseSubtreeCounts,
  computeProcesoBatchSelectionSummary,
  resolveProcesoDetailById,
} from './procesoDomain';
import {
  buildNoAplicableClauseOptions,
  groupPrunedLinksByProcess,
} from './noAplicableDomain';
import { renderProcesoView } from '../views/procesoView';
import {
  renderNoAplicableChecklistRowsHtml,
  renderNoAplicableView,
} from '../views/noAplicableView';
import {
  buildNoAplicablePickerRows,
} from './noAplicableDomain';
import { renderRequisitoView } from '../views/requisitoView';
import { assertZeroUuidExposure } from './zeroUuid';

const ADMIN_PROFILE: UserProfile = {
  id: '20000000-0000-0000-0000-000000000001',
  email: 'admin@programa.local',
  full_name: 'Admin Principal',
  role: 'ADMIN',
  status: 'APPROVED',
  created_at: '2026-01-01T00:00:00Z',
};

const NORMA_9001_ID = 'e0000000-0000-0000-0000-000000009001';
const REQ_4_ID = 'f0000000-0000-0000-0000-000000000004';
const REQ_4_1_ID = 'f0000000-0000-0000-0000-000000000041';
const REQ_4_2_ID = 'f0000000-0000-0000-0000-000000000042';
const REQ_5_ID = 'f0000000-0000-0000-0000-000000000005';
const REQ_5_1_ID = 'f0000000-0000-0000-0000-000000000051';
const REQ_8_ID = 'f0000000-0000-0000-0000-000000000008';
const REQ_8_5_ID = 'f0000000-0000-0000-0000-000000000085';

function makeIso9001TestCert(): CertificadoDetailEntity {
  const baseCert = INITIAL_CERTIFICADOS_DETAILED.find((c) => c.norma_codigo === 'ISO 9001:2015');
  assert.ok(baseCert, 'Seeded ISO 9001 certificate must exist');
  return {
    ...baseCert,
    procesos: [
      {
        id: '11111111-1111-4111-8111-111111111101',
        nombre_proceso: 'Gestión de Calidad Central',
        tipo: 'Estratégico',
        responsable: 'Dra. Elena Ríos',
        clausulas_cubiertas: ['4.1'],
        requisitos_detalle: [
          {
            codigo: '4.1',
            titulo: 'Comprensión de la Organización y de su Contexto',
          },
        ],
      },
      {
        id: '11111111-1111-4111-8111-111111111102',
        nombre_proceso: 'Operación Productiva',
        tipo: 'Medular',
        responsable: 'Ing. Marcos Vega',
        clausulas_cubiertas: ['5.1'],
        requisitos_detalle: [
          {
            codigo: '5.1',
            titulo: 'Liderazgo y Compromiso General',
          },
        ],
      },
    ],
    noAplicables: [
      {
        id: '22222222-2222-4222-8222-222222222201',
        id_requisito: REQ_8_5_ID,
        requisito_codigo: '8.5',
        requisito_titulo: 'Producción y Provisión del Servicio',
        ruta_materializada: '8.8_5',
        justificacion: 'Sin producción ni provisión física bajo diseño del cliente.',
      },
    ],
  };
}

test('Step 3.2: buildProcesoBatchPickerRows supports mandatory/pending/all modes, search, subtree hints & disabled guards', () => {
  const cert = makeIso9001TestCert();
  const proc = resolveProcesoDetailById({
    procesoId: cert.procesos[0].id,
    certificates: [cert],
    programacionAudits: [],
    phase5Findings: [],
    requirementsCatalog: INITIAL_REQUISITOS_LTREE,
  });
  assert.ok(proc);

  const infoOnlyReq: RequisitoLtree = {
    id: 'f0000000-0000-0000-0000-000000000099',
    id_norma: NORMA_9001_ID,
    norma_codigo: 'ISO 9001:2015',
    id_requisito_padre: null,
    codigo: '0.1',
    es_obligatorio: false,
    obligatorio_origen: 'AUTO_TEXT',
    titulo: 'Introducción General',
    descripcion: 'Cláusula meramente informativa.',
    ruta_materializada: '0.0_1',
    nivel: 2,
    es_padre: false,
  };
  const catalog = [...INITIAL_REQUISITOS_LTREE, infoOnlyReq];

  // Mode 'mandatory' excludes purely informative leaves (0.1), keeps parent containers with mandatory children (4, 5, 8)
  const mandatoryResult = buildProcesoBatchPickerRows({
    cert,
    currentProceso: proc,
    idNorma: NORMA_9001_ID,
    normaCodigo: 'ISO 9001:2015',
    requirementsCatalog: catalog,
    mode: 'mandatory',
  });
  assert.equal(
    mandatoryResult.rows.some((r) => r.req.id === infoOnlyReq.id),
    false,
    'Informative leaf should be filtered out in Solo Obligatorias mode'
  );

  const row4 = mandatoryResult.rows.find((r) => r.req.id === REQ_4_ID);
  assert.ok(row4);
  assert.equal(row4.mandatorySubtreeCount, 2, 'Parent 4 has 2 mandatory descendants (4.1, 4.2)');
  assert.equal(row4.disabled, false);

  const row41 = mandatoryResult.rows.find((r) => r.req.id === REQ_4_1_ID);
  assert.ok(row41);
  assert.equal(row41.alreadyLinkedToCurrentProceso, true);
  assert.equal(row41.disabled, true);

  const row51 = mandatoryResult.rows.find((r) => r.req.id === REQ_5_1_ID);
  assert.ok(row51);
  assert.deepEqual(row51.coveredByOtherProcesoNames, ['Operación Productiva']);
  assert.equal(row51.disabled, false, 'Shared mandatory clause across processes remains linkable');

  const row85 = mandatoryResult.rows.find((r) => r.req.id === REQ_8_5_ID);
  assert.ok(row85);
  assert.equal(row85.isExcludedByIso43, true);
  assert.equal(row85.disabled, true);

  // Mode 'pending' focuses strictly on uncovered mandatory clauses (4.2 and its parent container 4)
  const pendingResult = buildProcesoBatchPickerRows({
    cert,
    currentProceso: proc,
    idNorma: NORMA_9001_ID,
    normaCodigo: 'ISO 9001:2015',
    requirementsCatalog: catalog,
    mode: 'pending',
  });
  assert.equal(pendingResult.rows.some((r) => r.req.id === REQ_4_2_ID), true);
  assert.equal(pendingResult.rows.some((r) => r.req.id === REQ_5_1_ID), false);

  // Mode 'all' includes informative leaf 0.1
  const allResult = buildProcesoBatchPickerRows({
    cert,
    currentProceso: proc,
    idNorma: NORMA_9001_ID,
    normaCodigo: 'ISO 9001:2015',
    requirementsCatalog: catalog,
    mode: 'all',
  });
  assert.equal(allResult.rows.some((r) => r.req.id === infoOnlyReq.id), true);

  // Accent-insensitive search
  const searchResult = buildProcesoBatchPickerRows({
    cert,
    currentProceso: proc,
    idNorma: NORMA_9001_ID,
    normaCodigo: 'ISO 9001:2015',
    requirementsCatalog: catalog,
    mode: 'all',
    filterQuery: 'comprension partes interesadas',
  });
  assert.equal(searchResult.rows.length, 1);
  assert.equal(searchResult.rows[0].req.id, REQ_4_2_ID);
});

test('Step 3.2: computeProcesoBatchSelectionSummary & computeLinkedClauseSubtreeCounts compute downward LTREE coverage accurately', () => {
  const cert = makeIso9001TestCert();
  const scoped = INITIAL_REQUISITOS_LTREE.filter((r) => r.id_norma === NORMA_9001_ID);

  // Selecting parent '4' covers mandatory 4.1 + 4.2 without double counting if 4.2 is also checked
  const summaryParentOnly = computeProcesoBatchSelectionSummary({
    selectedReqIds: [REQ_4_ID],
    scopedReqs: scoped,
  });
  assert.equal(summaryParentOnly.selectedCount, 1);
  assert.equal(summaryParentOnly.totalMandatoryCovered, 2);

  const summaryWithOverlap = computeProcesoBatchSelectionSummary({
    selectedReqIds: [REQ_4_ID, REQ_4_2_ID, REQ_5_1_ID],
    scopedReqs: scoped,
  });
  assert.equal(summaryWithOverlap.selectedCount, 3);
  assert.equal(summaryWithOverlap.totalMandatoryCovered, 3);

  // Parent subtree count on linked table: linking clause '4' covers 4.1 & 4.2 -> 2 subclauses
  const subtreeMap = computeLinkedClauseSubtreeCounts({
    linkedRequisitos: [
      {
        id_requisito: REQ_4_ID,
        codigo: '4',
        titulo: 'Contexto de la Organización',
        descripcion: '',
        ruta_materializada: '4',
        norma_codigo: 'ISO 9001:2015',
      },
    ],
    scopedReqs: scoped,
  });
  assert.equal(subtreeMap.get(REQ_4_ID), 2);
  assert.ok(cert.id);
});

test('Step 3.2: renderProcesoView batch checklist UI obeys Clean List, Zero-UUID, Zero-style, and subtree badges', () => {
  const cert = makeIso9001TestCert();
  const proc = resolveProcesoDetailById({
    procesoId: cert.procesos[0].id,
    certificates: [cert],
    programacionAudits: [],
    phase5Findings: [],
    requirementsCatalog: INITIAL_REQUISITOS_LTREE,
  });
  assert.ok(proc);

  const htmlPending = renderProcesoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedProcesoId: proc.id,
      activeChildTab: 'requisitos',
      isEditingAttributes: false,
      isAssigningRequisito: true,
      batchMode: 'mandatory',
      batchFilterQuery: '',
      selectedBatchRequisitoIds: [REQ_4_2_ID],
    },
    proceso: proc,
    certificates: [cert],
    requirementsCatalog: INITIAL_REQUISITOS_LTREE,
  });

  assert.ok(htmlPending.includes('id="assignProcesoRequisitosBatchForm"'));
  assert.ok(htmlPending.includes('id="procesoBatchFilterInput"'));
  assert.ok(htmlPending.includes('data-action="select-pending-mandatory-clauses"'));
  assert.ok(htmlPending.includes('data-action="clear-proceso-batch-selection"'));
  assert.ok(htmlPending.includes('id="procesoBatchStickySummaryBar"'));
  assert.ok(htmlPending.includes('1 cláusula seleccionada (cubre 1 obligatoria en total)'));
  assert.ok(htmlPending.includes('⛔ Excluida ISO 4.3'));
  assert.ok(htmlPending.includes('✓ Ya vinculada a este proceso'));
  assert.ok(htmlPending.includes('🔗 Cubierta en: Operación Productiva'));
  assert.ok(htmlPending.includes('⚠️ Pendiente obligatoria'));
  assert.ok(htmlPending.includes('(+2 subcláusulas obligatorias)'));

  const batchFormMatch = htmlPending.match(/<form id="assignProcesoRequisitosBatchForm"[\s\S]*?<\/form>/);
  assert.ok(batchFormMatch);
  assert.equal(batchFormMatch[0].includes('style="'), false, 'Zero inline style= allowed on batch picker');
  const zeroUuid = assertZeroUuidExposure(htmlPending);
  assert.equal(zeroUuid.compliant, true, zeroUuid.exposedUuids.join(', '));

  // Now link parent clause '4' and verify linked table displays parent subtree coverage badge
  cert.procesos[0].clausulas_cubiertas.push('4');
  cert.procesos[0].requisitos_detalle?.push({
    codigo: '4',
    titulo: 'Contexto de la Organización',
  });
  const procWithParent = resolveProcesoDetailById({
    procesoId: cert.procesos[0].id,
    certificates: [cert],
    programacionAudits: [],
    phase5Findings: [],
    requirementsCatalog: INITIAL_REQUISITOS_LTREE,
  });
  assert.ok(procWithParent);

  const htmlWithParent = renderProcesoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedProcesoId: procWithParent.id,
      activeChildTab: 'requisitos',
      isEditingAttributes: false,
      isAssigningRequisito: false,
    },
    proceso: procWithParent,
    certificates: [cert],
    requirementsCatalog: INITIAL_REQUISITOS_LTREE,
  });
  assert.ok(htmlWithParent.includes('4 (cubre 2 subcláusulas)'));
});

test('Step 3.2: noAplicableView displays hierarchical selector, non-blocking Smart-Mutation amber banner & ancestor notes', () => {
  const cert = makeIso9001TestCert();

  // Pure helper checks
  const options = buildNoAplicableClauseOptions({
    cert,
    requirementsCatalog: INITIAL_REQUISITOS_LTREE,
  });
  const opt51 = options.find((o) => o.req.id === REQ_5_1_ID);
  assert.ok(opt51);
  assert.equal(opt51.activeProcessCount, 1);
  assert.deepEqual(opt51.processNames, ['Operación Productiva']);
  assert.equal(opt51.isDuplicateExclusion, false);

  const opt85 = options.find((o) => o.req.id === REQ_8_5_ID);
  assert.ok(opt85);
  assert.equal(opt85.isDuplicateExclusion, true);

  const grouped = groupPrunedLinksByProcess([
    {
      id_proceso: 'p1',
      nombre_proceso: 'Operación Productiva',
      id_requisito: REQ_5_1_ID,
      codigo: '5.1',
    },
    {
      id_proceso: 'p1',
      nombre_proceso: 'Operación Productiva',
      id_requisito: REQ_5_ID,
      codigo: '5',
    },
  ]);
  assert.equal(grouped.length, 1);
  assert.deepEqual(grouped[0].codigos, ['5', '5.1']);

  // Render creating exclusion for clause '5.1' (covered by 'Operación Productiva')
  const smartMutationHtml = renderNoAplicableView({
    profile: ADMIN_PROFILE,
    state: {
      selectedNoAplicableId: null,
      originatingCertId: cert.id,
      isCreating: true,
      isEditingAttributes: false,
      formDraft: {
        id_certificado: cert.id,
        id_requisito: REQ_5_1_ID,
        justificacion: 'Justificación ISO 4.3 suficientemente amplia para prueba de mutación.',
      },
    },
    noAplicable: null,
    certificates: [cert],
    requirementsCatalog: INITIAL_REQUISITOS_LTREE,
  });

  assert.ok(smartMutationHtml.includes('id="noAplicableSmartMutationPreview"'));
  assert.ok(smartMutationHtml.includes('role="status"'));
  assert.ok(smartMutationHtml.includes('Mutación Inteligente (No Bloqueante)'));
  assert.ok(smartMutationHtml.includes('Operación Productiva'));
  assert.ok(smartMutationHtml.includes('Cláusula 5.1'));
  assert.ok(smartMutationHtml.includes('🔗 En uso por 1 proceso(s)'));
  assert.ok(smartMutationHtml.includes('⛔ Ya excluida directamente'));

  const detailForm = smartMutationHtml.match(/<form id="noAplicableDetailForm"[\s\S]*?<\/form>/);
  assert.ok(detailForm);
  assert.equal(detailForm[0].includes('<button'), false, 'noAplicableDetailForm must contain zero buttons');
  assert.equal(smartMutationHtml.includes('style="'), false);
  assert.equal(assertZeroUuidExposure(smartMutationHtml).compliant, true);

  // Ancestor hint check: add child clause 8.5.1 beneath already excluded 8.5
  const child851: RequisitoLtree = {
    id: 'f0000000-0000-0000-0000-000000000851',
    id_norma: NORMA_9001_ID,
    norma_codigo: 'ISO 9001:2015',
    id_requisito_padre: REQ_8_5_ID,
    codigo: '8.5.1',
    es_obligatorio: true,
    obligatorio_origen: 'AUTO_TEXT',
    titulo: 'Control de la producción y de la provisión del servicio',
    descripcion: 'Control bajo condiciones controladas.',
    ruta_materializada: '8.8_5.8_5_1',
    nivel: 3,
    es_padre: false,
  };
  const ancestorHtml = renderNoAplicableView({
    profile: ADMIN_PROFILE,
    state: {
      selectedNoAplicableId: null,
      originatingCertId: cert.id,
      isCreating: true,
      isEditingAttributes: false,
      formDraft: {
        id_certificado: cert.id,
        id_requisito: child851.id,
        justificacion: '',
      },
    },
    noAplicable: null,
    certificates: [cert],
    requirementsCatalog: [...INITIAL_REQUISITOS_LTREE, child851],
  });
  assert.ok(ancestorHtml.includes('id="noAplicableAncestorHint"'));
  assert.ok(ancestorHtml.includes('role="note"'));
  assert.ok(ancestorHtml.includes('ya hereda exclusión de 8.5'));
  assert.equal(assertZeroUuidExposure(ancestorHtml).compliant, true);
});

test('Step 3.2: requisitoView exposes normative obligation badge in read mode & MANUAL override checkbox in edit mode', () => {
  const mandatoryReq = INITIAL_REQUISITOS_LTREE.find((r) => r.id === REQ_4_1_ID);
  const infoReq = INITIAL_REQUISITOS_LTREE.find((r) => r.id === REQ_8_ID);
  assert.ok(mandatoryReq && infoReq);

  const readMandatoryHtml = renderRequisitoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedRequisitoId: mandatoryReq.id,
      activeChildTab: 'subrequisitos',
      langMode: 'es',
      isEditingAttributes: false,
    },
    requisitos: INITIAL_REQUISITOS_LTREE,
    normas: INITIAL_NORMAS,
    certificados: INITIAL_CERTIFICADOS_DETAILED,
  });
  assert.ok(readMandatoryHtml.includes('data-testid="requisito-obligation-badge"'));
  assert.ok(readMandatoryHtml.includes('✓ Requisito Obligatorio (Texto)'));

  const readInfoHtml = renderRequisitoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedRequisitoId: infoReq.id,
      activeChildTab: 'subrequisitos',
      langMode: 'es',
      isEditingAttributes: false,
    },
    requisitos: INITIAL_REQUISITOS_LTREE,
    normas: INITIAL_NORMAS,
    certificados: INITIAL_CERTIFICADOS_DETAILED,
  });
  assert.ok(readInfoHtml.includes('ℹ️ Informativa / Contenedor'));

  const manualOverrideReq: RequisitoLtree = {
    ...infoReq,
    es_obligatorio: true,
    obligatorio_origen: 'MANUAL',
  };
  const readManualHtml = renderRequisitoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedRequisitoId: manualOverrideReq.id,
      activeChildTab: 'subrequisitos',
      langMode: 'es',
      isEditingAttributes: false,
    },
    requisitos: INITIAL_REQUISITOS_LTREE.map((r) =>
      r.id === manualOverrideReq.id ? manualOverrideReq : r
    ),
    normas: INITIAL_NORMAS,
    certificados: INITIAL_CERTIFICADOS_DETAILED,
  });
  assert.ok(readManualHtml.includes('✓ Requisito Obligatorio (Manual)'));

  const editHtml = renderRequisitoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedRequisitoId: infoReq.id,
      activeChildTab: 'subrequisitos',
      langMode: 'es',
      isEditingAttributes: true,
    },
    requisitos: INITIAL_REQUISITOS_LTREE,
    normas: INITIAL_NORMAS,
    certificados: INITIAL_CERTIFICADOS_DETAILED,
  });
  assert.ok(editHtml.includes('id="reqEsObligatorioCheckbox"'));
  assert.ok(editHtml.includes('name="es_obligatorio"'));
  assert.equal(editHtml.includes('style="'), false);
  assert.equal(assertZeroUuidExposure(editHtml).compliant, true);

  // Validation automatically tags MANUAL when staff flips es_obligatorio
  const validated = validateRequisitoDraft(
    {
      id_norma: infoReq.id_norma,
      id_requisito_padre: infoReq.id_requisito_padre || '',
      codigo: infoReq.codigo,
      explicit_code: false,
      es_obligatorio: true,
      obligatorio_origen: infoReq.obligatorio_origen,
      ruta_materializada: infoReq.ruta_materializada,
      title_es: infoReq.titulo,
      content_html_es: '<p>Operación obligatoria</p>',
      title_en: '',
      content_html_en: '',
    },
    INITIAL_REQUISITOS_LTREE,
    infoReq.id
  );
  assert.equal(validated.valid, true);
  assert.ok(validated.normalized);
  assert.equal(validated.normalized.es_obligatorio, true);
  assert.equal(validated.normalized.obligatorio_origen, 'MANUAL');
});

test('Process & Non-Applicable hierarchical pickers: default chapter expansion, parent-retaining search for 4.4, and single-line truncation', () => {
  const baseCert = INITIAL_CERTIFICADOS_DETAILED[0];
  assert.ok(baseCert);

  const req4: RequisitoLtree = {
    id: 'f1000000-0000-0000-0000-000000000004',
    id_norma: baseCert.id_norma,
    norma_codigo: baseCert.norma_codigo,
    id_requisito_padre: null,
    codigo: '4',
    es_obligatorio: false,
    obligatorio_origen: 'AUTO_TEXT',
    titulo: 'Contexto de la organización',
    descripcion: '',
    ruta_materializada: '4',
    nivel: 1,
    es_padre: true,
  };
  const req44: RequisitoLtree = {
    id: 'f1000000-0000-0000-0000-000000000044',
    id_norma: baseCert.id_norma,
    norma_codigo: baseCert.norma_codigo,
    id_requisito_padre: req4.id,
    codigo: '4.4',
    es_obligatorio: true,
    obligatorio_origen: 'AUTO_TEXT',
    titulo: 'Sistema de gestión de la calidad y sus procesos',
    descripcion: '<p>La organización debe establecer, implementar, mantener y mejorar continuamente un sistema de gestión.</p>',
    ruta_materializada: '4.4_4',
    nivel: 2,
    es_padre: true,
  };
  const req441: RequisitoLtree = {
    id: 'f1000000-0000-0000-0000-000000000441',
    id_norma: baseCert.id_norma,
    norma_codigo: baseCert.norma_codigo,
    id_requisito_padre: req44.id,
    codigo: '4.4.1',
    es_obligatorio: true,
    obligatorio_origen: 'AUTO_TEXT',
    titulo: '',
    descripcion: '<p>La organización debe determinar los procesos necesarios para el SGC.</p>',
    ruta_materializada: '4.4_4.4_4_1',
    nivel: 3,
    es_padre: false,
  };

  const treeCatalog: RequisitoLtree[] = [req4, req44, req441];
  const isolatedCert: CertificadoDetailEntity = {
    ...baseCert,
    procesos: [
      {
        id: 'p1000000-0000-0000-0000-000000000001',
        id_certificado: baseCert.id,
        nombre_proceso: 'Dirección',
        tipo: 'Estratégico',
        clausulas_cubiertas: [],
        requisitos_detalle: [],
      },
    ],
    noAplicables: [],
  };

  const resolvedProc = resolveProcesoDetailById({
    procesoId: isolatedCert.procesos[0].id,
    activeCertId: isolatedCert.id,
    certificates: [isolatedCert],
    programacionAudits: [],
    phase5Findings: [],
    requirementsCatalog: treeCatalog,
  });
  assert.ok(resolvedProc);

  // 1. Default view in Process picker expands Chapter (4) so 4 & 4.4 show, while 4.4.1 starts collapsed
  const procDefaultHtml = renderProcesoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedProcesoId: resolvedProc.id,
      activeChildTab: 'requisitos',
      isAssigningRequisito: true,
      batchMode: 'all',
      batchFilterQuery: '',
      selectedBatchRequisitoIds: [],
    },
    proceso: resolvedProc,
    certificates: [isolatedCert],
    requirementsCatalog: treeCatalog,
  });

  assert.ok(procDefaultHtml.includes('data-codigo="4"'));
  assert.ok(procDefaultHtml.includes('data-codigo="4.4"'));
  assert.equal(procDefaultHtml.includes('data-codigo="4.4.1"'), false);
  assert.ok(procDefaultHtml.includes('data-action="toggle-proceso-batch-node"'));
  assert.ok(procDefaultHtml.includes('truncate text-xs'));
  assert.ok(procDefaultHtml.includes('4.4</span> Sistema de gestión de la calidad y sus procesos:'));

  // 2. Search "4.4" in Process picker retains parent "4.4" (collapsible) and keeps child "4.4.1" collapsed initially, then visible when expanded
  const procSearchCollapsedHtml = renderProcesoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedProcesoId: resolvedProc.id,
      activeChildTab: 'requisitos',
      isAssigningRequisito: true,
      batchMode: 'all',
      batchFilterQuery: '4.4',
      selectedBatchRequisitoIds: [],
    },
    proceso: resolvedProc,
    certificates: [isolatedCert],
    requirementsCatalog: treeCatalog,
  });
  assert.ok(procSearchCollapsedHtml.includes('data-codigo="4.4"'));
  assert.equal(procSearchCollapsedHtml.includes('data-codigo="4" '), false);
  assert.equal(procSearchCollapsedHtml.includes('data-codigo="4.4.1"'), false);

  const procSearchExpandedHtml = renderProcesoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedProcesoId: resolvedProc.id,
      activeChildTab: 'requisitos',
      isAssigningRequisito: true,
      batchMode: 'all',
      batchFilterQuery: '4.4',
      searchExpandedBatchClauseIds: [req44.id],
      selectedBatchRequisitoIds: [],
    },
    proceso: resolvedProc,
    certificates: [isolatedCert],
    requirementsCatalog: treeCatalog,
  });
  assert.ok(procSearchExpandedHtml.includes('data-codigo="4.4"'));
  assert.ok(procSearchExpandedHtml.includes('data-codigo="4.4.1"'));
  // Title-less 4.4.1 renders without colon
  assert.equal(procSearchExpandedHtml.includes('4.4.1</span>:'), false);

  // 3. Non-Applicable picker mirrors same hierarchy, default collapse of 4.4.1, search retention, and expansion
  const naDefaultHtml = renderNoAplicableView({
    profile: ADMIN_PROFILE,
    state: {
      selectedNoAplicableId: null,
      originatingCertId: isolatedCert.id,
      isCreating: true,
      isEditingAttributes: false,
      formDraft: { id_certificado: isolatedCert.id, id_requisito: '', justificacion: '' },
      clauseMode: 'all',
      clauseFilterQuery: '',
    },
    noAplicable: null,
    certificates: [isolatedCert],
    requirementsCatalog: treeCatalog,
  });
  assert.ok(naDefaultHtml.includes('data-codigo="4"'));
  assert.ok(naDefaultHtml.includes('data-codigo="4.4"'));
  assert.equal(naDefaultHtml.includes('data-codigo="4.4.1"'), false);
  assert.ok(naDefaultHtml.includes('data-action="toggle-no-aplicable-clause-node"'));
  assert.ok(naDefaultHtml.includes('data-action="set-no-aplicable-clause-mode"'));

  const naSearchRows = buildNoAplicablePickerRows({
    cert: isolatedCert,
    requirementsCatalog: treeCatalog,
    mode: 'all',
    filterQuery: '4.4',
  });
  const naSearchCollapsed = renderNoAplicableChecklistRowsHtml({
    rows: naSearchRows,
    selectedReqId: '',
  });
  assert.ok(naSearchCollapsed.includes('data-codigo="4.4"'));
  assert.equal(naSearchCollapsed.includes('data-codigo="4.4.1"'), false);

  const naSearchExpanded = renderNoAplicableChecklistRowsHtml({
    rows: naSearchRows,
    selectedReqId: '',
    expandedClauseIds: [req44.id],
  });
  assert.ok(naSearchExpanded.includes('data-codigo="4.4"'));
  assert.ok(naSearchExpanded.includes('data-codigo="4.4.1"'));
  assert.equal(assertZeroUuidExposure(procDefaultHtml).compliant, true);
  assert.equal(assertZeroUuidExposure(naDefaultHtml).compliant, true);
});

