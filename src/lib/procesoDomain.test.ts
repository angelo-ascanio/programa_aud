import test from 'node:test';
import assert from 'node:assert/strict';
import type { UserProfile } from './healthCheck';
import { assertZeroUuidExposure } from './zeroUuid';
import { INITIAL_CERTIFICADOS_DETAILED, type CertificadoDetailEntity } from './multisiteSampling';
import { INITIAL_PROGRAMACION_AUDITS, INITIAL_PHASE5_FINDINGS } from './auditExecution';
import {
  canArchiveProceso,
  canLinkRequisitoToProceso,
  computeProcesoBatchLinkDelta,
  createEmptyProcesoFormDraft,
  expandPendingMandatoryClauseIds,
  getAllSeededNormaRequirements,
  getAvailableRequisitoOptionsForProceso,
  getAvailableRequisitosForProceso,
  getScopedNormaRequirements,
  getSyncedSameNormPeerCertIds,
  resolveProcesoDetailById,
  resolveProcesoDetailMode,
  translateProcesoDbError,
  validateProcesoFormDraft,
  validateProcesoInput,
} from './procesoDomain';
import type { RequisitoLtree } from './extraDomain';
import { renderProcesoView } from '../views/procesoView';
import { renderCertificadoView } from '../views/certificadoView';
import {
  INITIAL_ESTATUS_CATALOG,
  INITIAL_NORMAS,
  INITIAL_SECTORES_IAF,
  INITIAL_SUBSECTORES_IAF,
} from './extraDomain';
import { INITIAL_ORGANIZACIONES } from './activeCertificates';

const ADMIN_PROFILE: UserProfile = {
  id: '11111111-1111-1111-1111-111111111111',
  nombre: 'Administrador Principal',
  role: 'ADMIN',
  status: 'APPROVED',
};

const WORKER_PROFILE: UserProfile = {
  id: '22222222-2222-2222-2222-222222222222',
  nombre: 'Personal Técnico',
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

test('Phase 4.2.3 & Step 4.2: validateProcesoInput enforces cert selection, 2..150 char name, allowed tipo enum, per-certificate uniqueness, and Zero-UUID', () => {
  const existingProcesses = [
    {
      id: 'proc-1',
      id_certificado: 'cert-1',
      nombre_proceso: 'Troquelado y Fundición',
      deleted_at: null,
    },
    {
      id: 'proc-deleted',
      id_certificado: 'cert-1',
      nombre_proceso: 'Embalaje Histórico',
      deleted_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'proc-other-cert',
      id_certificado: 'cert-2',
      nombre_proceso: 'Logística',
      deleted_at: null,
    },
  ];

  assert.equal(
    validateProcesoFormDraft({
      draft: createEmptyProcesoFormDraft(''),
      existingProcesses,
    }).valid,
    false
  );

  assert.equal(
    validateProcesoInput({
      nombre_proceso: 'A',
      tipo: 'Medular',
      id_certificado: 'cert-1',
      existingProcesses,
    }).valid,
    false
  );

  assert.equal(
    validateProcesoInput({
      nombre_proceso: 'X'.repeat(151),
      tipo: 'Medular',
      id_certificado: 'cert-1',
      existingProcesses,
    }).valid,
    false
  );

  assert.equal(
    validateProcesoInput({
      nombre_proceso: 'Control de Calidad',
      tipo: 'OperativoInvalido',
      id_certificado: 'cert-1',
      existingProcesses,
    }).valid,
    false
  );

  assert.equal(
    validateProcesoInput({
      nombre_proceso: 'Proceso 11111111-1111-1111-1111-111111111111',
      tipo: 'Medular',
      id_certificado: 'cert-1',
      existingProcesses,
    }).valid,
    false
  );

  const duplicate = validateProcesoInput({
    nombre_proceso: '  troquelado y fundición ',
    tipo: 'Medular',
    id_certificado: 'cert-1',
    currentProcesoId: 'proc-2',
    existingProcesses,
  });
  assert.equal(duplicate.valid, false);
  assert.ok(duplicate.error?.includes('Ya existe un proceso activo'));

  const sameRecord = validateProcesoInput({
    nombre_proceso: 'Troquelado y Fundición',
    tipo: 'Medular',
    responsable: 'Ing. Roberto Silva',
    id_certificado: 'cert-1',
    currentProcesoId: 'proc-1',
    existingProcesses,
  });
  assert.equal(sameRecord.valid, true);
  assert.equal(sameRecord.normalized?.tipo, 'Medular');
  assert.equal(sameRecord.normalized?.responsable, 'Ing. Roberto Silva');

  const reuseSoftDeleted = validateProcesoInput({
    nombre_proceso: 'Embalaje Histórico',
    tipo: 'De Apoyo',
    id_certificado: 'cert-1',
    existingProcesses,
  });
  assert.equal(reuseSoftDeleted.valid, true);
});

test('Step 4.2: getScopedNormaRequirements and canLinkRequisitoToProceso enforce strict id_norma isolation and prevent duplicates', () => {
  const catalog = getAllSeededNormaRequirements();

  const iso9001 = getScopedNormaRequirements({
    id_norma: 'e0000000-0000-0000-0000-000000009001',
    norma_codigo: 'ISO 9001:2015',
    requirementsCatalog: catalog,
  });
  assert.ok(iso9001.length >= 5);
  assert.equal(
    iso9001.every((r) => r.id_norma === 'e0000000-0000-0000-0000-000000009001'),
    true
  );

  const iso14001 = getScopedNormaRequirements({
    id_norma: 'e0000000-0000-0000-0000-000000014001',
    norma_codigo: 'ISO 14001:2015',
    requirementsCatalog: catalog,
  });
  assert.ok(iso14001.length >= 3);
  assert.equal(
    iso14001.every((r) => r.id_norma === 'e0000000-0000-0000-0000-000000014001'),
    true
  );

  const iso27001 = getScopedNormaRequirements({
    id_norma: 'e0000000-0000-0000-0000-000000027001',
    norma_codigo: 'ISO/IEC 27001:2022',
    requirementsCatalog: catalog,
  });
  assert.ok(iso27001.length >= 3);
  assert.equal(
    iso27001.every((r) => r.id_norma === 'e0000000-0000-0000-0000-000000027001'),
    true
  );

  const crossNormaCheck = canLinkRequisitoToProceso({
    proceso: {
      id_norma: 'e0000000-0000-0000-0000-000000009001',
      norma_codigo: 'ISO 9001:2015',
      requisitos: [],
    },
    requisito: iso14001[0],
  });
  assert.equal(crossNormaCheck.allowed, false);

  const duplicateCheck = canLinkRequisitoToProceso({
    proceso: {
      id_norma: 'e0000000-0000-0000-0000-000000009001',
      norma_codigo: 'ISO 9001:2015',
      requisitos: [
        {
          id_requisito: iso9001[0].id,
          codigo: iso9001[0].codigo,
          titulo: iso9001[0].titulo,
          ruta_materializada: iso9001[0].ruta_materializada,
          nivel: iso9001[0].nivel,
          id_norma: iso9001[0].id_norma,
          norma_codigo: iso9001[0].norma_codigo,
        },
      ],
    },
    requisito: iso9001[0],
  });
  assert.equal(duplicateCheck.allowed, false);

  const available = getAvailableRequisitosForProceso({
    id_norma: 'e0000000-0000-0000-0000-000000009001',
    norma_codigo: 'ISO 9001:2015',
    linkedRequisitos: [{ id_requisito: iso9001[0].id, codigo: iso9001[0].codigo }],
    requirementsCatalog: catalog,
  });
  assert.equal(available.some((r) => r.id === iso9001[0].id), false);
  assert.equal(
    available.every((r) => r.id_norma === 'e0000000-0000-0000-0000-000000009001'),
    true
  );
});

test('Phase 4.2.3: canArchiveProceso blocks archiving when hallazgos or auditorias exist', () => {
  const blockedFinding = canArchiveProceso({
    associatedHallazgosCount: 1,
    associatedAuditoriasCount: 0,
  });
  assert.equal(blockedFinding.allowed, false);
  assert.ok(blockedFinding.reason?.includes('hallazgo'));

  const blockedAudit = canArchiveProceso({
    associatedHallazgosCount: 0,
    associatedAuditoriasCount: 2,
  });
  assert.equal(blockedAudit.allowed, false);
  assert.ok(blockedAudit.reason?.includes('auditoría'));

  const allowed = canArchiveProceso({
    associatedHallazgosCount: 0,
    associatedAuditoriasCount: 0,
  });
  assert.equal(allowed.allowed, true);
});

test('Step 4.2: resolveProcesoDetailById and renderProcesoView enforce canonical CRUD (read/add/edit), Save-first header, 0 footer buttons, renderListViewTable, RBAC, and Zero-UUID', () => {
  const cert = INITIAL_CERTIFICADOS_DETAILED[0];
  const proc = cert.procesos[0];

  const resolved = resolveProcesoDetailById({
    procesoId: proc.id,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    programacionAudits: INITIAL_PROGRAMACION_AUDITS,
    phase5Findings: INITIAL_PHASE5_FINDINGS,
  });
  assert.ok(resolved);
  assert.equal(resolved.numero_certificado, cert.numero_certificado);
  assert.equal(resolved.organizacion_nombre, cert.organizacion_nombre);
  assert.ok(resolved.requisitos.length > 0);
  assert.ok(resolved.hallazgos.length > 0);
  assert.ok(resolved.auditorias.length > 0);

  // Respects archivedProcesoIds
  assert.equal(
    resolveProcesoDetailById({
      procesoId: proc.id,
      certificates: INITIAL_CERTIFICADOS_DETAILED,
      programacionAudits: INITIAL_PROGRAMACION_AUDITS,
      phase5Findings: INITIAL_PHASE5_FINDINGS,
      archivedProcesoIds: new Set([proc.id]),
    }),
    null
  );

  assert.equal(resolveProcesoDetailMode({ isCreating: true, isEditingAttributes: false }, true, null), 'add');
  assert.equal(resolveProcesoDetailMode({ isCreating: true, isEditingAttributes: false }, false, null), 'read');

  const adminHtml = renderProcesoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedProcesoId: resolved.id,
      activeChildTab: 'requisitos',
      isEditingAttributes: false,
      isAssigningRequisito: true,
    },
    proceso: resolved,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
  });

  // Strict 3-Zone order + Parent Zone chips (Org, Cert, Norma)
  assert.ok(adminHtml.includes('aria-label="Contexto y relaciones superiores"'));
  assert.ok(adminHtml.includes('data-parent-nav="true"'));
  assert.ok(adminHtml.includes('data-parent-type="org"'));
  assert.ok(adminHtml.includes('data-parent-type="cert"'));
  assert.ok(adminHtml.includes('data-parent-type="norma"'));
  assert.ok(adminHtml.includes('data-action="open-changelog"'));
  assert.ok(adminHtml.includes('id="startEditProcesoBtn"'));
  assert.ok(adminHtml.includes('title="Editar"'));
  assert.ok(adminHtml.indexOf('id="startEditProcesoBtn"') < adminHtml.indexOf('data-action="open-changelog"'));
  assert.ok(adminHtml.includes('data-action="open-archive-proceso"'));
  assert.ok(adminHtml.includes('data-action="toggle-assign-proceso-req"'));
  assert.ok(adminHtml.includes('id="procesoRequisitosManagementPanel"'));
  assert.ok(adminHtml.includes('id="assignProcesoRequisitosBatchForm"'));
  assert.ok(adminHtml.includes('id="unassignProcesoRequisitoForm"'));
  assert.ok(adminHtml.includes('data-resizable-table="proceso-tab-requisitos"'));
  assert.ok(adminHtml.includes('data-action="select-proceso-requisito"'));
  assert.equal(adminHtml.includes('data-action="unassign-proceso-req"'), false);
  const reqTbody = adminHtml.match(/<tbody[\s\S]*?<\/tbody>/);
  assert.ok(reqTbody);
  assert.equal(reqTbody[0].includes('<button'), false, 'Requisitos <tbody> must not contain buttons');
  assert.ok(
    adminHtml.indexOf('aria-label="Contexto y relaciones superiores"') <
      adminHtml.indexOf('<hr class="border-t border-slate-200 my-2.5 sm:my-3" />') &&
      adminHtml.indexOf('<hr class="border-t border-slate-200 my-2.5 sm:my-3" />') <
        adminHtml.indexOf('aria-label="Detalle del registro"') &&
      adminHtml.indexOf('aria-label="Detalle del registro"') < adminHtml.indexOf('role="tablist"')
  );
  const zeroAdmin = assertZeroUuidExposure(adminHtml);
  assert.equal(zeroAdmin.compliant, true, zeroAdmin.exposedUuids.join(', '));

  // ADD mode: Save-first / Cancel-second header, editable Zone 1 cert selector, hidden Zone 3, 0 footer buttons
  const addHtml = renderProcesoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedProcesoId: null,
      activeChildTab: 'requisitos',
      isCreating: true,
      prefillCertId: cert.id,
      isEditingAttributes: false,
      formDraft: createEmptyProcesoFormDraft(cert.id),
    },
    proceso: null,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
  });
  assert.ok(addHtml.includes('id="saveProcesoFormBtn"'));
  assert.ok(addHtml.includes('id="cancelEditProcesoBtn"'));
  assert.ok(addHtml.indexOf('id="saveProcesoFormBtn"') < addHtml.indexOf('id="cancelEditProcesoBtn"'));
  assert.ok(addHtml.includes('id="procesoSelectCertificado"'));
  assert.ok(addHtml.includes('id="procesoDetailForm"'));
  assert.equal(addHtml.includes('role="tablist"'), false, 'Zone 3 must be hidden in add mode');
  const addFormSection = addHtml.match(/<form id="procesoDetailForm"[\s\S]*?<\/form>/);
  assert.ok(addFormSection);
  assert.equal(addFormSection[0].includes('<button'), false);
  assert.equal(assertZeroUuidExposure(addHtml).compliant, true);

  // EDIT mode: Save-first header, editable Zone 1 cert selector, Zone 3 visible, 0 footer buttons
  const editHtml = renderProcesoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedProcesoId: resolved.id,
      activeChildTab: 'requisitos',
      isEditingAttributes: true,
    },
    proceso: resolved,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
  });
  assert.ok(editHtml.includes('id="saveProcesoFormBtn"'));
  assert.ok(editHtml.includes('id="cancelEditProcesoBtn"'));
  assert.ok(editHtml.indexOf('id="saveProcesoFormBtn"') < editHtml.indexOf('id="cancelEditProcesoBtn"'));
  assert.ok(editHtml.includes('id="procesoSelectCertificado"'));
  assert.ok(editHtml.includes('role="tablist"'));
  assert.equal(editHtml.includes('id="cancelEditProcesoBtnSecondary"'), false);
  const editFormSection = editHtml.match(/<form id="procesoDetailForm"[\s\S]*?<\/form>/);
  assert.ok(editFormSection);
  assert.equal(editFormSection[0].includes('<button'), false);
  assert.equal(assertZeroUuidExposure(editHtml).compliant, true);

  // Worker has write access + full-row clickable Hallazgos & Auditorías tabs via renderListViewTable without inner <button>
  const workerHtml = renderProcesoView({
    profile: WORKER_PROFILE,
    state: {
      selectedProcesoId: resolved.id,
      activeChildTab: 'hallazgos',
      isEditingAttributes: false,
    },
    proceso: resolved,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
  });
  assert.ok(workerHtml.includes('id="startEditProcesoBtn"'));
  assert.ok(workerHtml.includes('data-resizable-table="proceso-tab-hallazgos"'));
  assert.ok(workerHtml.includes('data-action="go-audit-results"'));
  const hallazgosTbody = workerHtml.match(/<tbody[\s\S]*?<\/tbody>/);
  assert.ok(hallazgosTbody);
  assert.equal(hallazgosTbody[0].includes('<button'), false);
  assert.equal(assertZeroUuidExposure(workerHtml).compliant, true);

  const workerAuditsHtml = renderProcesoView({
    profile: WORKER_PROFILE,
    state: {
      selectedProcesoId: resolved.id,
      activeChildTab: 'auditorias',
      isEditingAttributes: false,
    },
    proceso: resolved,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
  });
  assert.ok(workerAuditsHtml.includes('data-resizable-table="proceso-tab-auditorias"'));
  assert.ok(workerAuditsHtml.includes('data-action="select-prog-audit"'));
  const procAuditsTbody = workerAuditsHtml.match(/<tbody[\s\S]*?<\/tbody>/);
  assert.ok(procAuditsTbody);
  assert.equal(procAuditsTbody[0].includes('<button'), false);
  assert.equal(assertZeroUuidExposure(workerAuditsHtml).compliant, true);

  // Auditor & Client are strictly read-only
  for (const readOnlyProfile of [AUDITOR_PROFILE, CLIENT_PROFILE]) {
    const readOnlyHtml = renderProcesoView({
      profile: readOnlyProfile,
      state: {
        selectedProcesoId: resolved.id,
        activeChildTab: 'requisitos',
        isEditingAttributes: true,
        isAssigningRequisito: true,
      },
      proceso: resolved,
      certificates: INITIAL_CERTIFICADOS_DETAILED,
    });
    assert.equal(readOnlyHtml.includes('id="startEditProcesoBtn"'), false);
    assert.equal(readOnlyHtml.includes('id="procesoDetailForm"'), false);
    assert.equal(readOnlyHtml.includes('data-action="open-archive-proceso"'), false);
    assert.equal(readOnlyHtml.includes('data-action="toggle-assign-proceso-req"'), false);
    assert.equal(readOnlyHtml.includes('id="assignProcesoRequisitosBatchForm"'), false);
    assert.equal(readOnlyHtml.includes('id="unassignProcesoRequisitoForm"'), false);
    assert.equal(assertZeroUuidExposure(readOnlyHtml).compliant, true);
  }

  // Certificado Procesos Tab CTA RBAC (`+ Nuevo Proceso`)
  const certStaffHtml = renderCertificadoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedCertId: cert.id,
      activeChildTab: 'procesos',
      query: '',
      selectedStandard: 'ALL',
      selectedStatus: 'ALL',
      selectedSectorIaf: 'ALL',
      viewMode: 'grid',
      sortColumn: null,
      sortDirection: 'none',
      isEditingAttributes: false,
    },
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    organizaciones: INITIAL_ORGANIZACIONES,
    normas: INITIAL_NORMAS,
    estatusList: INITIAL_ESTATUS_CATALOG,
    sectores: INITIAL_SECTORES_IAF,
    subsectores: INITIAL_SUBSECTORES_IAF,
  });
  assert.ok(certStaffHtml.includes('data-action="open-create-proceso"'));

  const certClientHtml = renderCertificadoView({
    profile: CLIENT_PROFILE,
    state: {
      selectedCertId: cert.id,
      activeChildTab: 'procesos',
      query: '',
      selectedStandard: 'ALL',
      selectedStatus: 'ALL',
      selectedSectorIaf: 'ALL',
      viewMode: 'grid',
      sortColumn: null,
      sortDirection: 'none',
      isEditingAttributes: false,
    },
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    organizaciones: INITIAL_ORGANIZACIONES,
    normas: INITIAL_NORMAS,
    estatusList: INITIAL_ESTATUS_CATALOG,
    sectores: INITIAL_SECTORES_IAF,
    subsectores: INITIAL_SUBSECTORES_IAF,
  });
  assert.equal(certClientHtml.includes('data-action="open-create-proceso"'), false);
});

test('Step 2.2: canLinkRequisitoToProceso & getAvailableRequisitoOptionsForProceso reject ISO 4.3 excluded clauses and their LTREE subtrees', () => {
  const normaId = 'e0000000-0000-0000-0000-000000009001';
  const req83: RequisitoLtree = {
    id: 'req-00000000-0000-0000-0000-000000000830',
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
    id: 'req-00000000-0000-0000-0000-000000000832',
    id_norma: normaId,
    norma_codigo: 'ISO 9001:2015',
    id_requisito_padre: req83.id,
    codigo: '8.3.2',
    titulo: 'Planificación del diseño y desarrollo',
    ruta_materializada: '9001.8.8_3.8_3_2',
    nivel: 3,
    es_padre: false,
    es_obligatorio: true,
  };
  const req715: RequisitoLtree = {
    id: 'req-00000000-0000-0000-0000-000000000715',
    id_norma: normaId,
    norma_codigo: 'ISO 9001:2015',
    id_requisito_padre: null,
    codigo: '7.1.5',
    titulo: 'Recursos de seguimiento y medición',
    ruta_materializada: '9001.7.7_1.7_1_5',
    nivel: 3,
    es_padre: false,
    es_obligatorio: true,
  };
  const req41: RequisitoLtree = {
    id: 'req-00000000-0000-0000-0000-000000000410',
    id_norma: normaId,
    norma_codigo: 'ISO 9001:2015',
    id_requisito_padre: null,
    codigo: '4.1',
    titulo: 'Comprensión de la organización y de su contexto',
    ruta_materializada: '9001.4.4_1',
    nivel: 2,
    es_padre: false,
    es_obligatorio: true,
  };

  const catalog = [req41, req715, req83, req832];
  const cert: CertificadoDetailEntity = {
    ...INITIAL_CERTIFICADOS_DETAILED[0],
    id: 'cert-step22-iso43',
    id_norma: normaId,
    norma_codigo: 'ISO 9001:2015',
    procesos: [
      {
        id: 'proc-main',
        id_certificado: 'cert-step22-iso43',
        nombre_proceso: 'Producción',
        tipo: 'Medular',
        clausulas_cubiertas: [],
      },
      {
        id: 'proc-calidad',
        id_certificado: 'cert-step22-iso43',
        nombre_proceso: 'Aseguramiento de Calidad',
        tipo: 'De Apoyo',
        clausulas_cubiertas: ['7.1.5'],
      },
    ],
    noAplicables: [
      {
        id: 'na-83',
        id_certificado: 'cert-step22-iso43',
        id_requisito: req83.id,
        requisito_codigo: '8.3',
        requisito_titulo: req83.titulo,
        ruta_materializada: req83.ruta_materializada,
        justificacion: 'La organización fabrica estrictamente bajo planos del cliente.',
      },
    ],
  };

  const directBlock = canLinkRequisitoToProceso({
    proceso: { id_norma: normaId, norma_codigo: 'ISO 9001:2015', requisitos: [] },
    requisito: req83,
    cert,
    requirementsCatalog: catalog,
  });
  assert.equal(directBlock.allowed, false);
  assert.ok(directBlock.reason?.includes('8.3'));
  assert.equal(assertZeroUuidExposure(directBlock.reason || '').compliant, true);

  const subtreeBlock = canLinkRequisitoToProceso({
    proceso: { id_norma: normaId, norma_codigo: 'ISO 9001:2015', requisitos: [] },
    requisito: req832,
    cert,
    requirementsCatalog: catalog,
  });
  assert.equal(subtreeBlock.allowed, false);
  assert.ok(subtreeBlock.reason?.includes('8.3.2'));
  assert.ok(subtreeBlock.reason?.includes('8.3'));
  assert.equal(assertZeroUuidExposure(subtreeBlock.reason || '').compliant, true);

  const unblockedAfterArchive = canLinkRequisitoToProceso({
    proceso: { id_norma: normaId, norma_codigo: 'ISO 9001:2015', requisitos: [] },
    requisito: req832,
    cert,
    requirementsCatalog: catalog,
    archivedNoAplicableIds: new Set(['na-83']),
  });
  assert.equal(unblockedAfterArchive.allowed, true);

  const options = getAvailableRequisitoOptionsForProceso({
    id_norma: normaId,
    norma_codigo: 'ISO 9001:2015',
    currentProcesoId: 'proc-main',
    linkedRequisitos: [],
    requirementsCatalog: catalog,
    cert,
  });
  const opt832 = options.find((o) => o.req.id === req832.id);
  const opt715 = options.find((o) => o.req.id === req715.id);
  const opt41 = options.find((o) => o.req.id === req41.id);
  assert.ok(opt832 && opt715 && opt41);
  assert.equal(opt832.isExcludedByIso43, true);
  assert.equal(opt832.blockingExclusionCodigo, '8.3');
  assert.deepEqual(opt715.coveredByOtherProcesoNames, ['Aseguramiento de Calidad']);
  assert.equal(opt41.isExcludedByIso43, false);
});

test('Step 2.2: expandPendingMandatoryClauseIds & computeProcesoBatchLinkDelta handle 20+ pending clauses cleanly without duplicate or excluded leaks', () => {
  const normaId = 'e0000000-0000-0000-0000-000000009001';
  const parent51: RequisitoLtree = {
    id: 'req-51',
    id_norma: normaId,
    norma_codigo: 'ISO 9001:2015',
    id_requisito_padre: null,
    codigo: '5.1',
    titulo: 'Liderazgo y compromiso',
    ruta_materializada: '9001.5.5_1',
    nivel: 2,
    es_padre: true,
    es_obligatorio: true,
  };
  const child511: RequisitoLtree = {
    id: 'req-511',
    id_norma: normaId,
    norma_codigo: 'ISO 9001:2015',
    id_requisito_padre: 'req-51',
    codigo: '5.1.1',
    titulo: 'Generalidades',
    ruta_materializada: '9001.5.5_1.5_1_1',
    nivel: 3,
    es_padre: false,
    es_obligatorio: true,
  };
  const excluded83: RequisitoLtree = {
    id: 'req-83',
    id_norma: normaId,
    norma_codigo: 'ISO 9001:2015',
    id_requisito_padre: null,
    codigo: '8.3',
    titulo: 'Diseño y desarrollo',
    ruta_materializada: '9001.8.8_3',
    nivel: 2,
    es_padre: false,
    es_obligatorio: true,
  };

  const leafClauses: RequisitoLtree[] = Array.from({ length: 20 }, (_, i) => ({
    id: `req-leaf-${i + 1}`,
    id_norma: normaId,
    norma_codigo: 'ISO 9001:2015',
    id_requisito_padre: null,
    codigo: `7.5.${i + 1}`,
    titulo: `Requisito operativo ${i + 1}`,
    ruta_materializada: `9001.7.7_5.7_5_${i + 1}`,
    nivel: 3,
    es_padre: false,
    es_obligatorio: true,
  }));

  const catalog = [parent51, child511, excluded83, ...leafClauses];
  const cert: CertificadoDetailEntity = {
    ...INITIAL_CERTIFICADOS_DETAILED[0],
    id: 'cert-batch-20',
    id_norma: normaId,
    norma_codigo: 'ISO 9001:2015',
    procesos: [
      {
        id: 'proc-target',
        id_certificado: 'cert-batch-20',
        nombre_proceso: 'Operaciones',
        tipo: 'Medular',
        clausulas_cubiertas: ['7.5.1'],
      },
    ],
    noAplicables: [
      {
        id: 'na-83-batch',
        id_certificado: 'cert-batch-20',
        id_requisito: excluded83.id,
        requisito_codigo: '8.3',
        requisito_titulo: excluded83.titulo,
        ruta_materializada: excluded83.ruta_materializada,
        justificacion: 'Exclusión justificada de diseño bajo ISO 4.3.',
      },
    ],
  };

  const pendingIds = expandPendingMandatoryClauseIds({
    cert,
    proceso: {
      id_norma: normaId,
      norma_codigo: 'ISO 9001:2015',
      requisitos: [
        {
          id_requisito: leafClauses[0].id,
          codigo: leafClauses[0].codigo,
          titulo: leafClauses[0].titulo,
          ruta_materializada: leafClauses[0].ruta_materializada,
          nivel: leafClauses[0].nivel,
          id_norma: normaId,
          norma_codigo: 'ISO 9001:2015',
        },
      ],
    },
    requirementsCatalog: catalog,
  });

  // Should contain parent 5.1, omit redundant child 5.1.1, omit excluded 8.3, omit already-linked 7.5.1, and include 7.5.2..7.5.20 (19 leaves) => 20 total
  assert.equal(pendingIds.includes('req-51'), true);
  assert.equal(pendingIds.includes('req-511'), false);
  assert.equal(pendingIds.includes('req-83'), false);
  assert.equal(pendingIds.includes('req-leaf-1'), false);
  assert.equal(pendingIds.length, 20);

  const delta = computeProcesoBatchLinkDelta({
    currentProceso: {
      id_norma: normaId,
      norma_codigo: 'ISO 9001:2015',
      requisitos: [
        {
          id_requisito: leafClauses[0].id,
          codigo: leafClauses[0].codigo,
          titulo: leafClauses[0].titulo,
          ruta_materializada: leafClauses[0].ruta_materializada,
          nivel: leafClauses[0].nivel,
          id_norma: normaId,
          norma_codigo: 'ISO 9001:2015',
        },
      ],
    },
    selectedReqIds: [...pendingIds, 'req-leaf-1', 'req-83', 'req-51'],
    scopedReqs: catalog,
    cert,
    requirementsCatalog: catalog,
  });

  assert.equal(delta.toInsert.length, 20);
  assert.equal(delta.skippedDuplicate.length, 1);
  assert.equal(delta.skippedExcluded.length, 1);
  assert.equal(delta.skippedExcluded[0].codigo, '8.3');
  assert.equal(delta.toInsert[0].codigo, '5.1', 'Parent nivel 2 must precede nivel 3 leaves');

  const translatedErr = translateProcesoDbError({
    code: 'P0001',
    message:
      'REQ_EXCLUDED_BY_ISO43: La cláusula está excluida como No Aplicable bajo la cláusula 8.3 en este certificado 11111111-1111-1111-1111-111111111111.',
  });
  assert.ok(translatedErr.includes('8.3'));
  assert.equal(assertZeroUuidExposure(translatedErr).compliant, true);
});

test('Step 2.2: canArchiveProceso blocks active shares and resolveProcesoDetailById scopes clauses/hallazgos/auditorias by activeCertId', () => {
  const blockedShare = canArchiveProceso({
    associatedHallazgosCount: 0,
    associatedAuditoriasCount: 0,
    sharedCertsCount: 2,
  });
  assert.equal(blockedShare.allowed, false);
  assert.ok(blockedShare.reason?.includes('compartido activamente'));
  assert.ok(blockedShare.reason?.includes('2 certificado(s)'));
  assert.equal(assertZeroUuidExposure(blockedShare.reason || '').compliant, true);

  const norma9001 = 'e0000000-0000-0000-0000-000000009001';
  const norma14001 = 'e0000000-0000-0000-0000-000000014001';
  const certXId = 'eeee0001-0000-0000-0000-000000000001';
  const certYId = 'eeee0002-0000-0000-0000-000000000002';
  const sharedProcId = 'dddd0001-0000-0000-0000-000000000001';

  const sharedProc = {
    id: sharedProcId,
    id_certificado: certXId,
    ownerCertId: certXId,
    nombre_proceso: 'Mantenimiento de Planta',
    tipo: 'De Apoyo' as const,
    clausulas_cubiertas: ['8.5'],
    requisitos_by_certificado: {
      [certXId]: { clausulas_cubiertas: ['8.5'] },
      [certYId]: { clausulas_cubiertas: ['8.1'] },
    },
  };

  const certX: CertificadoDetailEntity = {
    ...INITIAL_CERTIFICADOS_DETAILED[0],
    id: certXId,
    numero_certificado: 'FN-QMS-SHARED-X',
    id_norma: norma9001,
    norma_codigo: 'ISO 9001:2015',
    procesos: [sharedProc],
    auditorias: [
      {
        id: 'aud-x-1',
        id_certificado: certXId,
        codigo_auditoria: 'AUD-X-001',
        tipo_auditoria: 'Seguimiento 1',
        metodologia: 'Presencial',
        fecha_programacion: '2026-04-10',
        auditor_lider: 'Auditor X',
        estatus: 'Planificada',
      },
    ],
  };

  const certY: CertificadoDetailEntity = {
    ...INITIAL_CERTIFICADOS_DETAILED[0],
    id: certYId,
    numero_certificado: 'FN-EMS-SHARED-Y',
    id_norma: norma14001,
    norma_codigo: 'ISO 14001:2015',
    procesos: [sharedProc],
    auditorias: [
      {
        id: 'aud-y-1',
        id_certificado: certYId,
        codigo_auditoria: 'AUD-Y-001',
        tipo_auditoria: 'Renovación',
        metodologia: 'Presencial',
        fecha_programacion: '2026-05-20',
        auditor_lider: 'Auditor Y',
        estatus: 'Planificada',
      },
    ],
  };

  const findings: Phase5FindingEntity[] = [
    {
      id: 'hal-x-1',
      codigo_hallazgo: 'HAL-X-01',
      id_auditoria: 'aud-x-1',
      id_proceso: sharedProcId,
      numero_certificado: 'FN-QMS-SHARED-X',
      organizacion_nombre: certX.organizacion_nombre,
      proceso_nombre: 'Mantenimiento de Planta',
      requisito_codigo: '8.5',
      tipo: 'No Conformidad Menor',
      estado_ciclo: 'En Análisis',
      descripcion: 'Hallazgo exclusivo de Calidad X',
      fecha_deteccion: '2026-04-10',
      cerrado: false,
    },
    {
      id: 'hal-y-1',
      codigo_hallazgo: 'HAL-Y-01',
      id_auditoria: 'aud-y-1',
      id_proceso: sharedProcId,
      numero_certificado: 'FN-EMS-SHARED-Y',
      organizacion_nombre: certY.organizacion_nombre,
      proceso_nombre: 'Mantenimiento de Planta',
      requisito_codigo: '8.1',
      tipo: 'Observación',
      estado_ciclo: 'Planificado',
      descripcion: 'Hallazgo exclusivo Ambiental Y',
      fecha_deteccion: '2026-05-20',
      cerrado: false,
    },
  ];

  const detailY = resolveProcesoDetailById({
    procesoId: sharedProcId,
    activeCertId: certYId,
    certificates: [certX, certY],
    programacionAudits: [],
    phase5Findings: findings,
  });
  assert.ok(detailY);
  assert.equal(detailY.id_certificado, certYId);
  assert.equal(detailY.id_norma, norma14001);
  assert.deepEqual(
    detailY.requisitos.map((r) => r.codigo),
    ['8.1']
  );
  assert.deepEqual(
    detailY.hallazgos.map((h) => h.codigo_hallazgo),
    ['HAL-Y-01']
  );
  assert.deepEqual(
    detailY.auditorias.map((a) => a.codigo_auditoria),
    ['AUD-Y-001']
  );

  const detailX = resolveProcesoDetailById({
    procesoId: sharedProcId,
    activeCertId: certXId,
    certificates: [certX, certY],
    programacionAudits: [],
    phase5Findings: findings,
  });
  assert.ok(detailX);
  assert.equal(detailX.id_certificado, certXId);
  assert.deepEqual(
    detailX.requisitos.map((r) => r.codigo),
    ['8.5']
  );
  assert.deepEqual(
    detailX.hallazgos.map((h) => h.codigo_hallazgo),
    ['HAL-X-01']
  );
});

test('Step 1.2: getSyncedSameNormPeerCertIds returns only same-norm synced peer certs and returns [] for independent receivers', () => {
  const norma9001 = 'e0000000-0000-0000-0000-000000009001';
  const norma14001 = 'e0000000-0000-0000-0000-000000014001';
  const certOwnerId = 'eeee0001-0000-0000-0000-000000000001';
  const certPeerSyncedId = 'eeee0002-0000-0000-0000-000000000002';
  const certPeerIndepSameNormId = 'eeee0003-0000-0000-0000-000000000003';
  const certPeerDiffNormId = 'eeee0004-0000-0000-0000-000000000004';
  const procId = 'dddd0001-0000-0000-0000-000000000099';

  const makeSharedCert = (params: {
    id: string;
    id_norma: string;
    sync?: boolean;
    isOwner?: boolean;
  }): CertificadoDetailEntity => ({
    ...INITIAL_CERTIFICADOS_DETAILED[0],
    id: params.id,
    id_norma: params.id_norma,
    norma_codigo: params.id_norma === norma9001 ? 'ISO 9001:2015' : 'ISO 14001:2015',
    procesos: [
      {
        id: procId,
        id_certificado: certOwnerId,
        ownerCertId: certOwnerId,
        sharedFromCertId: params.isOwner ? null : certOwnerId,
        sharedLinkSincronizarRequisitos: params.isOwner ? undefined : params.sync,
        nombre_proceso: 'Producción Compartida',
        tipo: 'Medular',
        clausulas_cubiertas: ['4.1'],
        sharedTargets: params.isOwner
          ? [
              {
                linkId: 'l-1',
                targetCertId: certPeerSyncedId,
                targetNumeroCertificado: 'CERT-2',
                sincronizar_requisitos: true,
              },
              {
                linkId: 'l-2',
                targetCertId: certPeerIndepSameNormId,
                targetNumeroCertificado: 'CERT-3',
                sincronizar_requisitos: false,
              },
              {
                linkId: 'l-3',
                targetCertId: certPeerDiffNormId,
                targetNumeroCertificado: 'CERT-4',
                sincronizar_requisitos: true,
              },
            ]
          : undefined,
      },
    ],
  });

  const certificates = [
    makeSharedCert({ id: certOwnerId, id_norma: norma9001, isOwner: true }),
    makeSharedCert({ id: certPeerSyncedId, id_norma: norma9001, sync: true }),
    makeSharedCert({ id: certPeerIndepSameNormId, id_norma: norma9001, sync: false }),
    makeSharedCert({ id: certPeerDiffNormId, id_norma: norma14001, sync: false }),
  ];

  // From owner cert -> returns ONLY certPeerSyncedId (same norm + sync=true)
  assert.deepEqual(
    getSyncedSameNormPeerCertIds({
      procesoId: procId,
      activeCertId: certOwnerId,
      certificates,
    }),
    [certPeerSyncedId]
  );

  // From synced receiving cert -> returns owner cert (excluding independent & diff-norm)
  assert.deepEqual(
    getSyncedSameNormPeerCertIds({
      procesoId: procId,
      activeCertId: certPeerSyncedId,
      certificates,
    }),
    [certOwnerId]
  );

  // From independent same-norm receiving cert (sync=false) -> returns []
  assert.deepEqual(
    getSyncedSameNormPeerCertIds({
      procesoId: procId,
      activeCertId: certPeerIndepSameNormId,
      certificates,
    }),
    []
  );

  // From different-norm receiving cert -> returns []
  assert.deepEqual(
    getSyncedSameNormPeerCertIds({
      procesoId: procId,
      activeCertId: certPeerDiffNormId,
      certificates,
    }),
    []
  );
});



