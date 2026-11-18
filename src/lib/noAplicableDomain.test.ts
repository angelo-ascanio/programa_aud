import test from 'node:test';
import assert from 'node:assert/strict';
import type { UserProfile } from './healthCheck';
import { assertZeroUuidExposure } from './zeroUuid';
import { INITIAL_ORGANIZACIONES } from './activeCertificates';
import { INITIAL_CERTIFICADOS_DETAILED, type CertificadoDetailEntity } from './multisiteSampling';
import { getAllSeededNormaRequirements } from './procesoDomain';
import type { RequisitoLtree } from './extraDomain';
import {
  applyNonApplicableSmartMutationToState,
  evaluateCertificateCoverage,
} from './coverageEngine';
import { computeLocalArchiveDependencySummary, getArchiveTableDisplayLabel, getDomainArchivedTables } from './archiveGovernance';
import {
  computeNoAplicableAncestorAdvisory,
  computeNoAplicableMutationPreview,
  createEmptyNoAplicableFormDraft,
  createNoAplicableFormDraftFromEntity,
  filterRequisitosForCertificado,
  reconcileNoAplicableDraftOnCertChange,
  resolveNoAplicableDetailById,
  resolveNoAplicableDetailMode,
  validateNoAplicableDraft,
} from './noAplicableDomain';
import { renderNoAplicableView } from '../views/noAplicableView';
import { renderCertificadoView } from '../views/certificadoView';

const ADMIN_PROFILE: UserProfile = {
  id: '11111111-1111-1111-1111-111111111111',
  nombre: 'Administrador Principal',
  role: 'ADMIN',
  status: 'APPROVED',
};

const WORKER_PROFILE: UserProfile = {
  id: '22222222-2222-2222-2222-222222222222',
  nombre: 'Coordinador Técnico',
  role: 'WORKER',
  status: 'APPROVED',
};

const AUDITOR_PROFILE: UserProfile = {
  id: '33333333-3333-3333-3333-333333333333',
  nombre: 'Auditor Líder',
  role: 'AUDITOR',
  status: 'APPROVED',
};

const CLIENT_PROFILE: UserProfile = {
  id: '44444444-4444-4444-4444-444444444444',
  nombre: 'Usuario Cliente',
  role: 'CLIENT',
  status: 'APPROVED',
};

test('Step 4.1: filterRequisitosForCertificado scopes clauses to the certificate Norma and excludes active duplicates', () => {
  const cert = INITIAL_CERTIFICADOS_DETAILED[0];
  const reqCatalog = getAllSeededNormaRequirements();
  assert.ok(cert.noAplicables.length > 0);
  const existingExclusion = cert.noAplicables[0];

  const availableForCreate = filterRequisitosForCertificado({
    certId: cert.id,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    requirementsCatalog: reqCatalog,
  });
  assert.ok(availableForCreate.length > 0);
  assert.ok(availableForCreate.every((r) => r.id_norma === cert.id_norma || r.norma_codigo === cert.norma_codigo));
  assert.equal(
    availableForCreate.some((r) => r.id === existingExclusion.id_requisito),
    false,
    'Existing exclusion clause must be filtered out during create'
  );

  const availableForEdit = filterRequisitosForCertificado({
    certId: cert.id,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    requirementsCatalog: reqCatalog,
    currentNoAplicableId: existingExclusion.id,
  });
  assert.equal(
    availableForEdit.some((r) => r.id === existingExclusion.id_requisito),
    true,
    'Current exclusion clause must remain selectable while editing that exclusion'
  );
});

test('Step 4.1: reconcileNoAplicableDraftOnCertChange clears invalid requisito when switching to another Norma certificate', () => {
  const certIso9001 = INITIAL_CERTIFICADOS_DETAILED[0];
  const certIso14001 = INITIAL_CERTIFICADOS_DETAILED.find((c) => c.norma_codigo !== certIso9001.norma_codigo);
  assert.ok(certIso14001);
  const reqCatalog = getAllSeededNormaRequirements();
  const iso9001Req = filterRequisitosForCertificado({
    certId: certIso9001.id,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    requirementsCatalog: reqCatalog,
  })[0];
  assert.ok(iso9001Req);

  const reconciled = reconcileNoAplicableDraftOnCertChange({
    draft: {
      id_certificado: certIso9001.id,
      id_requisito: iso9001Req.id,
      justificacion: 'Justificación técnica válida conforme a ISO 4.3.',
    },
    nextCertId: certIso14001.id,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    requirementsCatalog: reqCatalog,
  });

  assert.equal(reconciled.id_certificado, certIso14001.id);
  assert.equal(reconciled.id_requisito, '');
  assert.equal(reconciled.justificacion, 'Justificación técnica válida conforme a ISO 4.3.');
});

test('Step 4.1: validateNoAplicableDraft enforces ISO 4.3 justification length, cross-norm guard, duplicate guard, and Zero-UUID guard', () => {
  const cert = INITIAL_CERTIFICADOS_DETAILED[0];
  const certOtherNorma = INITIAL_CERTIFICADOS_DETAILED.find((c) => c.norma_codigo !== cert.norma_codigo);
  assert.ok(certOtherNorma);
  const reqCatalog = getAllSeededNormaRequirements();

  const available = filterRequisitosForCertificado({
    certId: cert.id,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    requirementsCatalog: reqCatalog,
  });
  assert.ok(available.length > 0);
  const candidateReq = available[0];

  const shortRes = validateNoAplicableDraft({
    draft: {
      id_certificado: cert.id,
      id_requisito: candidateReq.id,
      justificacion: 'Muy corta',
    },
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    requirementsCatalog: reqCatalog,
  });
  assert.equal(shortRes.valid, false);
  assert.ok(shortRes.error?.includes('15'));

  const uuidLeakRes = validateNoAplicableDraft({
    draft: {
      id_certificado: cert.id,
      id_requisito: candidateReq.id,
      justificacion: 'Referencia prohibida 550e8400-e29b-41d4-a716-446655440000 en justificación.',
    },
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    requirementsCatalog: reqCatalog,
  });
  assert.equal(uuidLeakRes.valid, false);

  const duplicateRes = validateNoAplicableDraft({
    draft: {
      id_certificado: cert.id,
      id_requisito: cert.noAplicables[0].id_requisito,
      justificacion: 'Justificación técnica suficientemente extensa para probar duplicidad.',
    },
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    requirementsCatalog: reqCatalog,
  });
  assert.equal(duplicateRes.valid, false);

  const otherNormReq = reqCatalog.find((r) => r.norma_codigo === certOtherNorma.norma_codigo);
  if (otherNormReq) {
    const crossNormRes = validateNoAplicableDraft({
      draft: {
        id_certificado: cert.id,
        id_requisito: otherNormReq.id,
        justificacion: 'Justificación técnica suficientemente extensa para validar norma cruzada.',
      },
      certificates: INITIAL_CERTIFICADOS_DETAILED,
      requirementsCatalog: reqCatalog,
    });
    assert.equal(crossNormRes.valid, false);
  }

  const validRes = validateNoAplicableDraft({
    draft: {
      id_certificado: cert.id,
      id_requisito: candidateReq.id,
      justificacion: 'La organización no realiza actividades de calibración interna; todo se subcontrata a laboratorios ISO 17025.',
    },
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    requirementsCatalog: reqCatalog,
  });
  assert.equal(validRes.valid, true);
  assert.equal(validRes.normalized?.requisito_codigo, candidateReq.codigo);
});

test('Step 4.1: renderNoAplicableView renders canonical 3-zone Read, Add, and Edit views with Zero-UUID exposure and RBAC enforcement', () => {
  const cert = INITIAL_CERTIFICADOS_DETAILED[0];
  const naItem = cert.noAplicables[0];
  const reqCatalog = getAllSeededNormaRequirements();

  const resolved = resolveNoAplicableDetailById({
    noAplicableId: naItem.id,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    requirementsCatalog: reqCatalog,
  });
  assert.ok(resolved);
  assert.equal(resolved.id_certificado, cert.id);
  assert.equal(resolved.id_organizacion, cert.id_organizacion);
  assert.equal(resolved.requisito_codigo, naItem.requisito_codigo);

  // Read mode: 4 parent chips (Organización, Certificado, Norma, Cláusula / Requisito), header actions, zero child tabs
  const readHtml = renderNoAplicableView({
    profile: ADMIN_PROFILE,
    state: {
      selectedNoAplicableId: resolved.id,
      originatingCertId: cert.id,
      isCreating: false,
      isEditingAttributes: false,
    },
    noAplicable: resolved,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    requirementsCatalog: reqCatalog,
  });
  assert.ok(readHtml.includes('aria-label="Contexto y relaciones superiores"'));
  assert.ok(readHtml.includes('data-parent-type="org"'));
  assert.ok(readHtml.includes('data-parent-type="cert"'));
  assert.ok(readHtml.includes('data-parent-type="norma"'));
  assert.ok(readHtml.includes('data-parent-type="requisito"'));
  assert.ok(readHtml.includes('id="startEditNoAplicableBtn"'));
  assert.ok(readHtml.includes('data-action="open-changelog"'));
  assert.ok(readHtml.includes('data-action="open-archive-no-aplicable"'));
  assert.equal(readHtml.includes('role="tablist"'), false);
  assert.equal(assertZeroUuidExposure(readHtml).compliant, true);

  // Add mode
  const addHtml = renderNoAplicableView({
    profile: WORKER_PROFILE,
    state: {
      selectedNoAplicableId: null,
      originatingCertId: cert.id,
      isCreating: true,
      isEditingAttributes: false,
      formDraft: createEmptyNoAplicableFormDraft(cert.id),
    },
    noAplicable: null,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    requirementsCatalog: reqCatalog,
  });
  assert.ok(addHtml.includes('Declarar Exclusión'));
  assert.ok(addHtml.includes('id="naSelectCertificado"'));
  assert.ok(addHtml.includes('id="naSelectRequisito"'));
  assert.ok(addHtml.includes('id="naJustificacionInput"'));
  assert.ok(addHtml.includes('id="naJustificacionCharCount"'));
  assert.ok(addHtml.includes('id="saveNoAplicableBtn"'));
  assert.ok(addHtml.includes('id="cancelNoAplicableBtn"'));
  assert.ok(addHtml.indexOf('id="saveNoAplicableBtn"') < addHtml.indexOf('id="cancelNoAplicableBtn"'));
  const addFormMatch = addHtml.match(/<form id="noAplicableDetailForm"[\s\S]*?<\/form>/);
  assert.ok(addFormMatch);
  assert.equal(addFormMatch[0].includes('<button'), false);
  assert.equal(assertZeroUuidExposure(addHtml).compliant, true);

  // Edit mode
  assert.equal(resolveNoAplicableDetailMode({ isEditingAttributes: true }, true, resolved), 'edit');
  const editHtml = renderNoAplicableView({
    profile: ADMIN_PROFILE,
    state: {
      selectedNoAplicableId: resolved.id,
      originatingCertId: cert.id,
      isCreating: false,
      isEditingAttributes: true,
      formDraft: createNoAplicableFormDraftFromEntity(resolved),
    },
    noAplicable: resolved,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    requirementsCatalog: reqCatalog,
  });
  assert.ok(editHtml.includes('id="saveNoAplicableBtn"'));
  assert.ok(editHtml.includes('id="cancelNoAplicableBtn"'));
  assert.ok(editHtml.includes('id="naSelectCertificado"'));
  assert.ok(editHtml.includes('id="naSelectRequisito"'));
  assert.ok(editHtml.includes(resolved.justificacion));
  assert.equal(assertZeroUuidExposure(editHtml).compliant, true);

  // RBAC: Auditor & Client strictly read-only
  for (const roProfile of [AUDITOR_PROFILE, CLIENT_PROFILE]) {
    assert.equal(resolveNoAplicableDetailMode({ isCreating: true }, false, resolved), 'read');
    const roHtml = renderNoAplicableView({
      profile: roProfile,
      state: {
        selectedNoAplicableId: resolved.id,
        originatingCertId: cert.id,
        isCreating: true,
        isEditingAttributes: true,
      },
      noAplicable: resolved,
      certificates: INITIAL_CERTIFICADOS_DETAILED,
      requirementsCatalog: reqCatalog,
    });
    assert.equal(roHtml.includes('id="startEditNoAplicableBtn"'), false);
    assert.equal(roHtml.includes('id="noAplicableDetailForm"'), false);
    assert.equal(roHtml.includes('data-action="open-archive-no-aplicable"'), false);
    assert.equal(assertZeroUuidExposure(roHtml).compliant, true);
  }
});

test('Step 4.1: Certificado child tabs expose + Declarar Exclusión and + Nuevo Turno exclusively to approved staff', () => {
  const cert = INITIAL_CERTIFICADOS_DETAILED[0];

  const staffNoAplicablesHtml = renderCertificadoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedCertId: cert.id,
      activeChildTab: 'no_aplicables',
      query: '',
      selectedStandard: 'ALL',
      selectedStatus: 'ALL',
      selectedSectorIaf: 'ALL',
      viewMode: 'grid',
      sortColumn: null,
      sortDirection: 'none',
    },
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    organizaciones: INITIAL_ORGANIZACIONES,
  });
  assert.ok(staffNoAplicablesHtml.includes('data-action="open-create-no-aplicable"'));
  assert.ok(staffNoAplicablesHtml.includes('<span>Declarar Exclusión</span>'));
  assert.ok(staffNoAplicablesHtml.includes(`data-no-aplicable-id="${cert.noAplicables[0].id}"`));

  const staffTurnosHtml = renderCertificadoView({
    profile: WORKER_PROFILE,
    state: {
      selectedCertId: cert.id,
      activeChildTab: 'turnos',
      query: '',
      selectedStandard: 'ALL',
      selectedStatus: 'ALL',
      selectedSectorIaf: 'ALL',
      viewMode: 'grid',
      sortColumn: null,
      sortDirection: 'none',
    },
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    organizaciones: INITIAL_ORGANIZACIONES,
  });
  assert.ok(staffTurnosHtml.includes('data-action="open-create-turno"'));
  assert.ok(staffTurnosHtml.includes('<span>Nuevo Turno</span>'));

  for (const roProfile of [AUDITOR_PROFILE, CLIENT_PROFILE]) {
    const roNoAplicablesHtml = renderCertificadoView({
      profile: roProfile,
      state: {
        selectedCertId: cert.id,
        activeChildTab: 'no_aplicables',
        query: '',
        selectedStandard: 'ALL',
        selectedStatus: 'ALL',
        selectedSectorIaf: 'ALL',
        viewMode: 'grid',
        sortColumn: null,
        sortDirection: 'none',
      },
      certificates: INITIAL_CERTIFICADOS_DETAILED,
      organizaciones: INITIAL_ORGANIZACIONES,
    });
    assert.equal(roNoAplicablesHtml.includes('data-action="open-create-no-aplicable"'), false);

    const roTurnosHtml = renderCertificadoView({
      profile: roProfile,
      state: {
        selectedCertId: cert.id,
        activeChildTab: 'turnos',
        query: '',
        selectedStandard: 'ALL',
        selectedStatus: 'ALL',
        selectedSectorIaf: 'ALL',
        viewMode: 'grid',
        sortColumn: null,
        sortDirection: 'none',
      },
      certificates: INITIAL_CERTIFICADOS_DETAILED,
      organizaciones: INITIAL_ORGANIZACIONES,
    });
    assert.equal(roTurnosHtml.includes('data-action="open-create-turno"'), false);
  }
});

test('Step 4.1: archiveGovernance cleanly supports requisitos_no_aplicables_certificado soft-archive', () => {
  const cert = INITIAL_CERTIFICADOS_DETAILED[0];
  const naItem = cert.noAplicables[0];
  assert.ok(getDomainArchivedTables('certificados').includes('requisitos_no_aplicables_certificado'));
  assert.equal(
    getArchiveTableDisplayLabel('requisitos_no_aplicables_certificado'),
    'Exclusión de Requisito (ISO 4.3)'
  );
  const summary = computeLocalArchiveDependencySummary(
    'requisitos_no_aplicables_certificado',
    naItem.id,
    { certificates: INITIAL_CERTIFICADOS_DETAILED }
  );
  assert.equal(summary.can_archive, true);
  assert.equal(summary.total_active_dependencies, 0);
});

test('Step 2.2: Smart-Mutation allows excluding clauses linked across multiple processes, prunes overlapping subtrees, and reconciles evaluateCertificateCoverage', () => {
  const normaId = 'e0000000-0000-0000-0000-000000009001';
  const req41: RequisitoLtree = {
    id: 'na-test-41',
    id_norma: normaId,
    norma_codigo: 'ISO 9001:2015',
    id_requisito_padre: null,
    codigo: '4.1',
    titulo: 'Contexto de la organización',
    ruta_materializada: '9001.4.4_1',
    nivel: 2,
    es_padre: false,
    es_obligatorio: true,
  };
  const req83: RequisitoLtree = {
    id: 'na-test-83',
    id_norma: normaId,
    norma_codigo: 'ISO 9001:2015',
    id_requisito_padre: null,
    codigo: '8.3',
    titulo: 'Diseño y desarrollo',
    ruta_materializada: '9001.8.8_3',
    nivel: 2,
    es_padre: true,
    es_obligatorio: true,
  };
  const req832: RequisitoLtree = {
    id: 'na-test-832',
    id_norma: normaId,
    norma_codigo: 'ISO 9001:2015',
    id_requisito_padre: req83.id,
    codigo: '8.3.2',
    titulo: 'Planificación del diseño',
    ruta_materializada: '9001.8.8_3.8_3_2',
    nivel: 3,
    es_padre: false,
    es_obligatorio: true,
  };
  const catalog = [req41, req83, req832];

  const cert: CertificadoDetailEntity = {
    ...INITIAL_CERTIFICADOS_DETAILED[0],
    id: 'cert-smart-mut',
    id_norma: normaId,
    norma_codigo: 'ISO 9001:2015',
    noAplicables: [],
    procesos: [
      {
        id: 'proc-a',
        id_certificado: 'cert-smart-mut',
        nombre_proceso: 'Ingeniería',
        tipo: 'Medular',
        clausulas_cubiertas: ['4.1', '8.3'],
        requisitos_detalle: [
          { codigo: '4.1', titulo: req41.titulo },
          { codigo: '8.3', titulo: req83.titulo },
        ],
      },
      {
        id: 'proc-b',
        id_certificado: 'cert-smart-mut',
        nombre_proceso: 'Calidad',
        tipo: 'De Apoyo',
        clausulas_cubiertas: ['8.3.2'],
        requisitos_detalle: [{ codigo: '8.3.2', titulo: req832.titulo }],
      },
    ],
  };

  // Must NEVER block validating exclusion on a clause actively linked to processes
  const validation = validateNoAplicableDraft({
    draft: {
      id_certificado: cert.id,
      id_requisito: req83.id,
      justificacion: 'La empresa opera exclusivamente bajo especificaciones suministradas por clientes.',
    },
    certificates: [cert],
    requirementsCatalog: catalog,
  });
  assert.equal(validation.valid, true);

  const preview = computeNoAplicableMutationPreview({
    cert,
    targetRequisitoId: req83.id,
    requirementsCatalog: catalog,
  });
  assert.equal(preview.willMutate, true);
  assert.equal(preview.affectedProcessCount, 2);
  assert.equal(preview.prunedLinks.length, 2);

  const reconciled = applyNonApplicableSmartMutationToState({
    certificates: [cert],
    processes: [
      { id: 'proc-a', clausulas_cubiertas: ['4.1', '8.3'] },
      { id: 'proc-b', clausulas_cubiertas: ['8.3.2'] },
    ],
    targetCertId: cert.id,
    exclusion: {
      id: 'na-83-new',
      id_certificado: cert.id,
      id_requisito: req83.id,
      requisito_codigo: '8.3',
      requisito_titulo: req83.titulo,
      ruta_materializada: req83.ruta_materializada,
      justificacion: validation.normalized!.justificacion,
    },
    targetRequisito: req83,
    requirementsCatalog: catalog,
  });

  const updatedCert = reconciled.nextCertificates[0];
  assert.deepEqual(updatedCert.procesos[0].clausulas_cubiertas, ['4.1']);
  assert.deepEqual(updatedCert.procesos[1].clausulas_cubiertas, []);
  assert.deepEqual(reconciled.nextProcesses[0].clausulas_cubiertas, ['4.1']);
  assert.deepEqual(reconciled.nextProcesses[1].clausulas_cubiertas, []);

  const coverage = evaluateCertificateCoverage({
    cert: updatedCert,
    requirementsCatalog: catalog,
  });
  assert.equal(coverage.nodeByRequisitoId.get(req41.id)?.estado, 'CUBIERTO');
  assert.equal(coverage.nodeByRequisitoId.get(req83.id)?.estado, 'NO_APLICABLE');
  assert.equal(coverage.nodeByRequisitoId.get(req832.id)?.estado, 'NO_APLICABLE');
  assert.equal(coverage.summary.coberturaCompleta, true);
});

test('Step 2.2: computeNoAplicableAncestorAdvisory detects parent redundancy and child absorption cleanly with Zero-UUID', () => {
  const normaId = 'e0000000-0000-0000-0000-000000009001';
  const req41: RequisitoLtree = {
    id: 'adv-41',
    id_norma: normaId,
    norma_codigo: 'ISO 9001:2015',
    id_requisito_padre: null,
    codigo: '4.1',
    titulo: 'Contexto',
    ruta_materializada: '9001.4.4_1',
    nivel: 2,
    es_padre: false,
    es_obligatorio: true,
  };
  const req83: RequisitoLtree = {
    id: 'adv-83',
    id_norma: normaId,
    norma_codigo: 'ISO 9001:2015',
    id_requisito_padre: null,
    codigo: '8.3',
    titulo: 'Diseño y desarrollo',
    ruta_materializada: '9001.8.8_3',
    nivel: 2,
    es_padre: true,
    es_obligatorio: true,
  };
  const req832: RequisitoLtree = {
    id: 'adv-832',
    id_norma: normaId,
    norma_codigo: 'ISO 9001:2015',
    id_requisito_padre: req83.id,
    codigo: '8.3.2',
    titulo: 'Planificación del diseño',
    ruta_materializada: '9001.8.8_3.8_3_2',
    nivel: 3,
    es_padre: false,
    es_obligatorio: true,
  };
  const catalog = [req41, req83, req832];

  const certWithParentExcl: CertificadoDetailEntity = {
    ...INITIAL_CERTIFICADOS_DETAILED[0],
    id: 'cert-adv-1',
    id_norma: normaId,
    norma_codigo: 'ISO 9001:2015',
    noAplicables: [
      {
        id: 'na-parent-83',
        id_certificado: 'cert-adv-1',
        id_requisito: req83.id,
        requisito_codigo: '8.3',
        requisito_titulo: req83.titulo,
        ruta_materializada: req83.ruta_materializada,
        justificacion: 'Exclusión padre justificada según ISO 4.3.',
      },
    ],
  };

  const childAdvisory = computeNoAplicableAncestorAdvisory({
    cert: certWithParentExcl,
    targetRequisitoId: req832.id,
    requirementsCatalog: catalog,
  });
  assert.equal(childAdvisory.type, 'COVERED_BY_EXCLUDED_ANCESTOR');
  assert.deepEqual(childAdvisory.overlappingCodigos, ['8.3']);
  assert.equal(assertZeroUuidExposure(childAdvisory.message || '').compliant, true);

  const certWithChildExcl: CertificadoDetailEntity = {
    ...INITIAL_CERTIFICADOS_DETAILED[0],
    id: 'cert-adv-2',
    id_norma: normaId,
    norma_codigo: 'ISO 9001:2015',
    noAplicables: [
      {
        id: 'na-child-832',
        id_certificado: 'cert-adv-2',
        id_requisito: req832.id,
        requisito_codigo: '8.3.2',
        requisito_titulo: req832.titulo,
        ruta_materializada: req832.ruta_materializada,
        justificacion: 'Exclusión hija justificada según ISO 4.3.',
      },
    ],
  };

  const parentAdvisory = computeNoAplicableAncestorAdvisory({
    cert: certWithChildExcl,
    targetRequisitoId: req83.id,
    requirementsCatalog: catalog,
  });
  assert.equal(parentAdvisory.type, 'COVERS_EXCLUDED_DESCENDANTS');
  assert.deepEqual(parentAdvisory.overlappingCodigos, ['8.3.2']);
  assert.equal(assertZeroUuidExposure(parentAdvisory.message || '').compliant, true);

  const unrelatedAdvisory = computeNoAplicableAncestorAdvisory({
    cert: certWithParentExcl,
    targetRequisitoId: req41.id,
    requirementsCatalog: catalog,
  });
  assert.equal(unrelatedAdvisory.type, 'NONE');
  assert.equal(unrelatedAdvisory.message, null);
});

