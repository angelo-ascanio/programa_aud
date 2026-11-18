import test from 'node:test';
import assert from 'node:assert/strict';
import type { UserProfile } from './healthCheck';
import { assertZeroUuidExposure } from './zeroUuid';
import { INITIAL_CERTIFICADOS_DETAILED } from './multisiteSampling';
import { INITIAL_PROGRAMACION_AUDITS, INITIAL_PHASE5_FINDINGS } from './auditExecution';
import {
  canArchiveProceso,
  canLinkRequisitoToProceso,
  createEmptyProcesoFormDraft,
  getAllSeededNormaRequirements,
  getAvailableRequisitosForProceso,
  getScopedNormaRequirements,
  resolveProcesoDetailById,
  resolveProcesoDetailMode,
  validateProcesoFormDraft,
  validateProcesoInput,
} from './procesoDomain';
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
  assert.ok(adminHtml.includes('id="assignProcesoRequisitoForm"'));
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
    assert.equal(readOnlyHtml.includes('id="assignProcesoRequisitoForm"'), false);
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
