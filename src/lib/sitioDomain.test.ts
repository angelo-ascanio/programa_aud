import test from 'node:test';
import assert from 'node:assert/strict';
import type { UserProfile } from './healthCheck';
import { assertZeroUuidExposure } from './zeroUuid';
import { INITIAL_CERTIFICADOS_DETAILED } from './multisiteSampling';
import { INITIAL_PROGRAMACION_AUDITS } from './auditExecution';
import {
  INITIAL_TURNO_CATALOG,
  canArchiveSitio,
  computeShiftDurationLabel,
  computeSitioSummaryMetrics,
  createEmptySitioFormDraft,
  formatShiftTime,
  getAvailableProcesosForSitio,
  resolveSitioDetailById,
  resolveSitioDetailMode,
  suggestNextNumeroSitio,
  validateProcesoPorSitioAssignment,
  validateSitioFormDraft,
  validateSitioInput,
} from './sitioDomain';
import { renderSitioView } from '../views/sitioView';
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

test('Phase 4.2.2: formatShiftTime and computeShiftDurationLabel handle standard, fractional, and overnight shifts', () => {
  assert.equal(formatShiftTime('07:00:00'), '07:00');
  assert.equal(formatShiftTime('8:30:00'), '08:30');
  assert.equal(formatShiftTime(null), '—');

  assert.equal(computeShiftDurationLabel('07:00:00', '15:00:00'), '8 h');
  assert.equal(computeShiftDurationLabel('08:00:00', '16:30:00'), '8 h 30 min');
  assert.equal(computeShiftDurationLabel('22:00:00', '06:00:00'), '8 h');
  assert.equal(computeShiftDurationLabel('invalid', '15:00:00'), '—');
});

test('Step 4.2: suggestNextNumeroSitio and resolveSitioDetailMode handle HQ vs branch numbering and RBAC modes', () => {
  assert.equal(suggestNextNumeroSitio([]), 0);
  assert.equal(suggestNextNumeroSitio([{ numero_sitio: 1 }, { numero_sitio: 2 }]), 0);
  assert.equal(
    suggestNextNumeroSitio([{ numero_sitio: 0, deleted_at: '2026-01-01T00:00:00Z' }]),
    0
  );
  assert.equal(
    suggestNextNumeroSitio([
      { numero_sitio: 0, deleted_at: null },
      { numero_sitio: 2, deleted_at: null },
      { numero_sitio: 5, deleted_at: '2026-01-01T00:00:00Z' },
    ]),
    3
  );

  const draftHq = createEmptySitioFormDraft('cert-1', []);
  assert.equal(draftHq.numero_sitio, '0');
  const draftBranch = createEmptySitioFormDraft('cert-1', [{ numero_sitio: 0 }]);
  assert.equal(draftBranch.numero_sitio, '1');

  assert.equal(resolveSitioDetailMode({ isCreating: true, isEditingAttributes: false }, true, null), 'add');
  assert.equal(resolveSitioDetailMode({ isCreating: true, isEditingAttributes: false }, false, null), 'read');
  assert.equal(resolveSitioDetailMode({ isCreating: false, isEditingAttributes: true }, false, null), 'read');
});

test('Phase 4.2.2 & Step 4.2: validateSitioInput enforces numero_sitio >= 0 integer, uniqueness per certificate, Sede 0 protection, and Zero-UUID', () => {
  const existingSites = [
    { id: 'sitio-0', id_certificado: 'cert-1', numero_sitio: 0, deleted_at: null },
    { id: 'sitio-1', id_certificado: 'cert-1', numero_sitio: 1, deleted_at: null },
    { id: 'sitio-other', id_certificado: 'cert-2', numero_sitio: 1, deleted_at: null },
    { id: 'sitio-deleted', id_certificado: 'cert-1', numero_sitio: 2, deleted_at: '2026-01-01T00:00:00Z' },
  ];

  const negative = validateSitioInput({
    numero_sitio: -1,
    nombre_sitio: 'Planta Sur',
    direccion_sitio: 'Av. Principal #100',
    id_certificado: 'cert-1',
    existingSites,
  });
  assert.equal(negative.valid, false);

  const decimal = validateSitioInput({
    numero_sitio: '1.5',
    nombre_sitio: 'Planta Sur',
    direccion_sitio: 'Av. Principal #100',
    id_certificado: 'cert-1',
    existingSites,
  });
  assert.equal(decimal.valid, false);

  const duplicateInCert = validateSitioInput({
    numero_sitio: 1,
    nombre_sitio: 'Duplicado',
    direccion_sitio: 'Av. Principal #100',
    id_certificado: 'cert-1',
    currentSitioId: 'sitio-0',
    existingSites,
  });
  assert.equal(duplicateInCert.valid, false);
  assert.ok(duplicateInCert.error?.includes('Ya existe un sitio activo'));

  const degradeHq = validateSitioFormDraft({
    draft: {
      id_certificado: 'cert-1',
      numero_sitio: '3',
      nombre_sitio: 'Sede Principal HQ',
      direccion_sitio: 'Polígono Industrial Las Rozas, Madrid',
    },
    currentSitioId: 'sitio-0',
    originalSitio: { id_certificado: 'cert-1', numero_sitio: 0, associatedAuditsCount: 0 },
    existingSites,
  });
  assert.equal(degradeHq.valid, false);
  assert.ok(degradeHq.error?.includes('Sede Principal (Sitio 0)'));

  const reassignHq = validateSitioFormDraft({
    draft: {
      id_certificado: 'cert-2',
      numero_sitio: '0',
      nombre_sitio: 'Sede Principal HQ',
      direccion_sitio: 'Polígono Industrial Las Rozas, Madrid',
    },
    currentSitioId: 'sitio-0',
    originalSitio: { id_certificado: 'cert-1', numero_sitio: 0, associatedAuditsCount: 1 },
    existingSites,
  });
  assert.equal(reassignHq.valid, false);
  assert.ok(reassignHq.error?.includes('reasignar la Sede Principal'));

  const selfEdit = validateSitioInput({
    numero_sitio: 0,
    nombre_sitio: 'Sede Principal HQ Actualizada',
    direccion_sitio: 'Polígono Industrial Las Rozas, Madrid',
    id_certificado: 'cert-1',
    currentSitioId: 'sitio-0',
    originalSitio: { id_certificado: 'cert-1', numero_sitio: 0, associatedAuditsCount: 1 },
    existingSites,
  });
  assert.equal(selfEdit.valid, true);
  assert.equal(selfEdit.normalized?.numero_sitio, 0);

  const reuseSoftDeletedNumber = validateSitioInput({
    numero_sitio: 2,
    nombre_sitio: 'Planta Norte',
    direccion_sitio: 'Zona Industrial Norte #45',
    id_certificado: 'cert-1',
    currentSitioId: 'sitio-0',
    existingSites,
  });
  assert.equal(reuseSoftDeletedNumber.valid, true);

  const shortAddress = validateSitioInput({
    numero_sitio: 3,
    nombre_sitio: 'Sede Este',
    direccion_sitio: 'C/1',
    id_certificado: 'cert-1',
  });
  assert.equal(shortAddress.valid, false);

  const rawUuidName = validateSitioInput({
    numero_sitio: 3,
    nombre_sitio: 'Sede 11111111-1111-1111-1111-111111111111',
    direccion_sitio: 'Zona Industrial Norte #45',
    id_certificado: 'cert-1',
  });
  assert.equal(rawUuidName.valid, false);
});

test('Phase 4.2.2: canArchiveSitio blocks Sitio 0 with active secondary sites and blocks any site with audits', () => {
  const site0 = { id: 's0', id_certificado: 'cert-1', numero_sitio: 0 };
  const site1 = { id: 's1', id_certificado: 'cert-1', numero_sitio: 1 };

  const blockedBySecondary = canArchiveSitio({
    site: site0,
    siblingSites: [
      { ...site0, deleted_at: null },
      { ...site1, deleted_at: null },
    ],
    associatedAuditsCount: 0,
  });
  assert.equal(blockedBySecondary.allowed, false);
  assert.ok(blockedBySecondary.reason?.includes('Sede Principal (Sitio 0)'));
  assert.ok(blockedBySecondary.reason?.includes('1 sede(s) secundaria(s)'));

  const blockedByAudit = canArchiveSitio({
    site: site1,
    siblingSites: [
      { ...site0, deleted_at: null },
      { ...site1, deleted_at: null },
    ],
    associatedAuditsCount: 2,
  });
  assert.equal(blockedByAudit.allowed, false);
  assert.ok(blockedByAudit.reason?.includes('2 auditoría(s)'));

  const allowedSecondary = canArchiveSitio({
    site: site1,
    siblingSites: [
      { ...site0, deleted_at: null },
      { ...site1, deleted_at: null },
    ],
    associatedAuditsCount: 0,
  });
  assert.equal(allowedSecondary.allowed, true);

  const allowedIsolatedSite0 = canArchiveSitio({
    site: site0,
    siblingSites: [
      { ...site0, deleted_at: null },
      { ...site1, deleted_at: '2026-02-01T00:00:00Z' },
    ],
    associatedAuditsCount: 0,
  });
  assert.equal(allowedIsolatedSite0.allowed, true);
});

test('Phase 4.2.2: resolveSitioDetailById joins Organizacion, Certificado, Turnos, and Auditorias and honors archivedSiteIds', () => {
  const cert0 = INITIAL_CERTIFICADOS_DETAILED[0];
  const site0 = cert0.sitios[0];

  const resolved = resolveSitioDetailById({
    sitioId: site0.id,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    programacionAudits: INITIAL_PROGRAMACION_AUDITS,
    shiftCatalog: INITIAL_TURNO_CATALOG,
  });
  assert.ok(resolved);
  assert.equal(resolved.numero_sitio, 0);
  assert.equal(resolved.numero_certificado, cert0.numero_certificado);
  assert.equal(resolved.organizacion_nombre, cert0.organizacion_nombre);
  assert.ok(resolved.turnos.length >= 1);
  assert.ok(resolved.auditorias.length >= 1);

  const archived = resolveSitioDetailById({
    sitioId: site0.id,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    programacionAudits: INITIAL_PROGRAMACION_AUDITS,
    archivedSiteIds: new Set([site0.id]),
  });
  assert.equal(archived, null);
});

test('Step 4.2: renderSitioView enforces canonical CRUD (read/add/edit), Save-first header, 0 footer buttons, renderListViewTable, and Zero-UUID', () => {
  const cert0 = INITIAL_CERTIFICADOS_DETAILED[0];
  const site0 = cert0.sitios[0];
  const sitioDetail = resolveSitioDetailById({
    sitioId: site0.id,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    programacionAudits: INITIAL_PROGRAMACION_AUDITS,
    shiftCatalog: INITIAL_TURNO_CATALOG,
  })!;

  const siblingSites = cert0.sitios.map((s) => ({
    id: s.id,
    id_certificado: cert0.id,
    numero_sitio: s.numero_sitio,
    deleted_at: null,
  }));

  // 1. Admin READ view on Turnos tab with management panel open
  const adminHtml = renderSitioView({
    profile: ADMIN_PROFILE,
    state: {
      selectedSitioId: sitioDetail.id,
      activeChildTab: 'turnos',
      isEditingAttributes: false,
      isAssigningShift: true,
    },
    sitio: sitioDetail,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    siblingSites,
    shiftCatalog: INITIAL_TURNO_CATALOG,
  });

  assert.ok(adminHtml.includes('Sede Principal (Sitio 0)'));
  assert.ok(adminHtml.includes('data-parent-nav="true"'));
  assert.ok(adminHtml.includes(cert0.organizacion_nombre));
  assert.ok(adminHtml.includes(cert0.numero_certificado));
  assert.ok(adminHtml.includes('data-action="open-changelog"'));
  assert.ok(adminHtml.includes('id="startEditSitioBtn"'));
  assert.ok(adminHtml.includes('title="Editar"'));
  assert.ok(adminHtml.indexOf('id="startEditSitioBtn"') < adminHtml.indexOf('data-action="open-changelog"'));
  assert.ok(adminHtml.includes('data-action="open-archive-sitio"'));
  assert.ok(adminHtml.includes('id="sitioTurnosManagementPanel"'));
  assert.ok(adminHtml.includes('id="assignSitioTurnoForm"'));
  assert.ok(adminHtml.includes('id="unassignSitioTurnoForm"'));
  assert.ok(adminHtml.includes('data-resizable-table="sitio-tab-turnos"'));
  assert.ok(adminHtml.includes('data-action="select-turno-preview"'));
  assert.equal(adminHtml.includes('data-action="select-turno"'), false);
  assert.equal(adminHtml.includes('data-action="unassign-sitio-turno"'), false);
  const turnosTbody = adminHtml.match(/<tbody[\s\S]*?<\/tbody>/);
  assert.ok(turnosTbody);
  assert.equal(turnosTbody[0].includes('<button'), false, 'Turnos <tbody> must not contain buttons');
  assert.equal(/ZONA\s+[1-4]:/.test(adminHtml), false);
  assert.ok(
    adminHtml.indexOf('aria-label="Contexto y relaciones superiores"') <
      adminHtml.indexOf('<hr class="border-t border-slate-200 my-2.5 sm:my-3" />') &&
      adminHtml.indexOf('<hr class="border-t border-slate-200 my-2.5 sm:my-3" />') <
        adminHtml.indexOf('aria-label="Detalle del registro"') &&
      adminHtml.indexOf('aria-label="Detalle del registro"') < adminHtml.indexOf('role="tablist"')
  );
  assert.equal(assertZeroUuidExposure(adminHtml).compliant, true);

  // 2. Admin ADD mode: Save-first / Cancel-second header, editable Zone 1 parent selector, hidden Zone 3, 0 footer buttons
  const addHtml = renderSitioView({
    profile: ADMIN_PROFILE,
    state: {
      selectedSitioId: null,
      activeChildTab: 'turnos',
      isCreating: true,
      prefillCertId: cert0.id,
      isEditingAttributes: false,
      formDraft: createEmptySitioFormDraft(cert0.id, cert0.sitios),
    },
    sitio: null,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    siblingSites,
    shiftCatalog: INITIAL_TURNO_CATALOG,
  });
  assert.ok(addHtml.includes('id="saveSitioFormBtn"'));
  assert.ok(addHtml.includes('id="cancelEditSitioBtn"'));
  assert.ok(
    addHtml.indexOf('id="saveSitioFormBtn"') < addHtml.indexOf('id="cancelEditSitioBtn"'),
    'Header must render Save before Cancel'
  );
  assert.ok(addHtml.includes('id="sitioSelectCertificado"'));
  assert.ok(addHtml.includes('id="sitioDetailForm"'));
  assert.equal(addHtml.includes('role="tablist"'), false, 'Zone 3 must be hidden in add mode');
  const addFormSection = addHtml.match(/<form id="sitioDetailForm"[\s\S]*?<\/form>/);
  assert.ok(addFormSection);
  assert.equal(addFormSection[0].includes('<button'), false, 'Form body must not contain footer buttons');
  assert.equal(assertZeroUuidExposure(addHtml).compliant, true);

  // 3. Admin EDIT mode: Save-first header, editable Zone 1 parent selector, Zone 3 remains visible
  const editHtml = renderSitioView({
    profile: ADMIN_PROFILE,
    state: {
      selectedSitioId: sitioDetail.id,
      activeChildTab: 'turnos',
      isEditingAttributes: true,
    },
    sitio: sitioDetail,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    siblingSites,
    shiftCatalog: INITIAL_TURNO_CATALOG,
  });
  assert.ok(editHtml.includes('id="saveSitioFormBtn"'));
  assert.ok(editHtml.includes('id="cancelEditSitioBtn"'));
  assert.ok(editHtml.indexOf('id="saveSitioFormBtn"') < editHtml.indexOf('id="cancelEditSitioBtn"'));
  assert.ok(editHtml.includes('id="sitioSelectCertificado"'));
  assert.ok(editHtml.includes('role="tablist"'));
  assert.equal(editHtml.includes('id="cancelEditSitioBtnSecondary"'), false);
  const editFormSection = editHtml.match(/<form id="sitioDetailForm"[\s\S]*?<\/form>/);
  assert.ok(editFormSection);
  assert.equal(editFormSection[0].includes('<button'), false);
  assert.equal(assertZeroUuidExposure(editHtml).compliant, true);

  // 4. Worker view on Auditorias tab + archive blocked alert + resizable table
  const workerAuditsHtml = renderSitioView({
    profile: WORKER_PROFILE,
    state: {
      selectedSitioId: sitioDetail.id,
      activeChildTab: 'auditorias',
      isEditingAttributes: false,
      archiveConfirmOpen: true,
    },
    sitio: sitioDetail,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    siblingSites,
    shiftCatalog: INITIAL_TURNO_CATALOG,
  });
  assert.ok(workerAuditsHtml.includes('Archivo bloqueado:'));
  assert.ok(workerAuditsHtml.includes('data-resizable-table="sitio-tab-auditorias"'));
  assert.ok(workerAuditsHtml.includes('data-action="select-prog-audit"'));
  const auditsTbody = workerAuditsHtml.match(/<tbody[\s\S]*?<\/tbody>/);
  assert.ok(auditsTbody);
  assert.equal(auditsTbody[0].includes('<button'), false);
  assert.equal(assertZeroUuidExposure(workerAuditsHtml).compliant, true);

  // 5. RBAC: CLIENT & AUDITOR cannot edit, create, archive, assign, or unassign shifts
  for (const readOnlyProfile of [CLIENT_PROFILE, AUDITOR_PROFILE]) {
    const readOnlyHtml = renderSitioView({
      profile: readOnlyProfile,
      state: {
        selectedSitioId: sitioDetail.id,
        activeChildTab: 'turnos',
        isEditingAttributes: true,
        isAssigningShift: true,
        archiveConfirmOpen: true,
      },
      sitio: sitioDetail,
      certificates: INITIAL_CERTIFICADOS_DETAILED,
      siblingSites,
      shiftCatalog: INITIAL_TURNO_CATALOG,
    });
    assert.equal(readOnlyHtml.includes('id="startEditSitioBtn"'), false);
    assert.equal(readOnlyHtml.includes('id="sitioDetailForm"'), false);
    assert.equal(readOnlyHtml.includes('data-action="open-archive-sitio"'), false);
    assert.equal(readOnlyHtml.includes('id="assignSitioTurnoForm"'), false);
    assert.equal(readOnlyHtml.includes('id="unassignSitioTurnoForm"'), false);
    assert.equal(assertZeroUuidExposure(readOnlyHtml).compliant, true);
  }

  // 6. Certificado Sites Tab CTA RBAC (`+ Nueva Sede`)
  const certStaffHtml = renderCertificadoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedCertId: cert0.id,
      activeChildTab: 'sitios',
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
  assert.ok(certStaffHtml.includes('data-action="open-create-sitio"'));

  const certClientHtml = renderCertificadoView({
    profile: CLIENT_PROFILE,
    state: {
      selectedCertId: cert0.id,
      activeChildTab: 'sitios',
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
  assert.equal(certClientHtml.includes('data-action="open-create-sitio"'), false);
});

test('Step 2.1.1: getAvailableProcesosForSitio and validateProcesoPorSitioAssignment enforce same-certificate check and duplicate prevention', () => {
  const baseCert = INITIAL_CERTIFICADOS_DETAILED[0];
  const otherCert = INITIAL_CERTIFICADOS_DETAILED[1];
  const sitio0 = baseCert.sitios[0];

  assert.ok(baseCert.procesos.length >= 3);
  assert.ok(otherCert.procesos.length >= 1);

  const customCert = {
    ...baseCert,
    sitios: [
      {
        ...sitio0,
        procesos_por_sitio: [
          {
            id: 'link-active-1',
            id_sitio: sitio0.id,
            id_proceso: baseCert.procesos[0].id,
            nombre_proceso: baseCert.procesos[0].nombre_proceso,
            tipo_proceso: baseCert.procesos[0].tipo,
            deleted_at: null,
          },
          {
            id: 'link-soft-deleted-2',
            id_sitio: sitio0.id,
            id_proceso: baseCert.procesos[1].id,
            nombre_proceso: baseCert.procesos[1].nombre_proceso,
            tipo_proceso: baseCert.procesos[1].tipo,
            deleted_at: '2026-03-01T00:00:00Z',
          },
        ],
        procesos_vinculados: [baseCert.procesos[0].nombre_proceso],
      },
    ],
  };

  // Available processes exclude actively linked proceso[0], keep soft-deleted proceso[1] and unlinked proceso[2]
  const available = getAvailableProcesosForSitio(sitio0.id, customCert);
  const availableIds = new Set(available.map((p) => p.id));
  assert.equal(availableIds.has(baseCert.procesos[0].id), false);
  assert.equal(availableIds.has(baseCert.procesos[1].id), true);
  assert.equal(availableIds.has(baseCert.procesos[2].id), true);

  // Unknown site returns []
  assert.deepEqual(getAvailableProcesosForSitio('non-existent-sitio', customCert), []);

  // Archived proceso is excluded from available list
  const availableWithArchived = getAvailableProcesosForSitio(
    sitio0.id,
    customCert,
    new Set([baseCert.procesos[2].id])
  );
  assert.equal(
    availableWithArchived.some((p) => p.id === baseCert.procesos[2].id),
    false
  );

  // Cross-certificate rejection: process from otherCert cannot be linked to sitio0 of customCert
  const crossCertResult = validateProcesoPorSitioAssignment(
    sitio0.id,
    otherCert.procesos[0].id,
    customCert
  );
  assert.equal(crossCertResult.valid, false);
  assert.ok(crossCertResult.error?.includes('Validación cruzada rechazada'));
  assert.equal(assertZeroUuidExposure(crossCertResult.error || '').compliant, true);

  // Active duplicate rejection
  const duplicateResult = validateProcesoPorSitioAssignment(
    sitio0.id,
    baseCert.procesos[0].id,
    customCert
  );
  assert.equal(duplicateResult.valid, false);
  assert.ok(duplicateResult.error?.includes('ya se encuentra vinculado activamente'));

  // Valid assignment (including previously soft-deleted link)
  const validResult = validateProcesoPorSitioAssignment(
    sitio0.id,
    baseCert.procesos[1].id,
    customCert
  );
  assert.equal(validResult.valid, true);
  assert.equal(validResult.proceso?.id, baseCert.procesos[1].id);
  assert.equal(validResult.site?.id, sitio0.id);
});

test('Step 2.1.1: renderSitioView renders Procesos del Sitio tab with table-fixed, colgroup 100%, 0 td buttons, RBAC, metrics, empty state, and Zero-UUID', () => {
  const cert0 = INITIAL_CERTIFICADOS_DETAILED[0];
  const site0 = cert0.sitios[0];
  const resolvedSitio = resolveSitioDetailById({
    sitioId: site0.id,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    programacionAudits: INITIAL_PROGRAMACION_AUDITS,
    shiftCatalog: INITIAL_TURNO_CATALOG,
  })!;

  assert.ok(resolvedSitio.procesos.length >= 1);
  assert.ok(resolvedSitio.procesos_vinculados.length >= 1);
  const metrics = computeSitioSummaryMetrics(resolvedSitio);
  assert.equal(metrics.procesosCount, resolvedSitio.procesos.length);
  assert.equal(metrics.turnosCount, resolvedSitio.turnos.length);

  // 1. Staff view on 'procesos' tab
  const adminProcesosHtml = renderSitioView({
    profile: ADMIN_PROFILE,
    state: {
      selectedSitioId: resolvedSitio.id,
      activeChildTab: 'procesos',
      isEditingAttributes: false,
    },
    sitio: resolvedSitio,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
  });

  assert.ok(adminProcesosHtml.includes('data-sitio-tab="procesos"'));
  assert.ok(adminProcesosHtml.includes('Procesos del Sitio'));
  assert.ok(adminProcesosHtml.includes('data-sitio-summary-metrics="true"'));
  assert.ok(adminProcesosHtml.includes('data-resizable-table="sitio-tab-procesos"'));
  assert.ok(adminProcesosHtml.includes('table-fixed'));
  assert.ok(adminProcesosHtml.includes('data-action="select-proceso-preview"'));
  assert.ok(adminProcesosHtml.includes('id="assignSitioProcesoForm"'));
  assert.ok(adminProcesosHtml.includes('id="assignSitioProcesoSelect"'));
  assert.ok(adminProcesosHtml.includes('+ Vincular Proceso'));
  assert.ok(adminProcesosHtml.includes('data-archive-table="procesos_por_sitio"'));
  assert.ok(adminProcesosHtml.includes('data-toast-target="archiveGovernanceToast"'));

  // Validate <colgroup> widths sum to 100%
  const colWidths = Array.from(
    adminProcesosHtml.matchAll(/<col[^>]*style="width:\s*([\d.]+)%;"/g)
  ).map((m) => Number(m[1]));
  const totalWidth = colWidths.reduce((acc, w) => acc + w, 0);
  assert.equal(colWidths.length, 3);
  assert.ok(Math.abs(totalWidth - 100) < 0.05, `Expected colgroup sum 100%, got ${totalWidth}`);

  // Validate zero <button> inside <tbody>
  const tbodyMatch = adminProcesosHtml.match(/<tbody[\s\S]*?<\/tbody>/);
  assert.ok(tbodyMatch);
  assert.equal(tbodyMatch[0].includes('<button'), false);

  // Validate available processes dropdown omits already linked process on Sitio 0
  const selectMatch = adminProcesosHtml.match(
    /<select[^>]*id="assignSitioProcesoSelect"[\s\S]*?<\/select>/
  );
  assert.ok(selectMatch);
  assert.equal(
    selectMatch[0].includes(resolvedSitio.procesos[0].nombre_proceso),
    false,
    'Already linked process must not appear in available dropdown'
  );
  assert.equal(assertZeroUuidExposure(adminProcesosHtml).compliant, true);

  // 2. Read-only RBAC (CLIENT & AUDITOR): no linking or archiving forms
  for (const roProfile of [CLIENT_PROFILE, AUDITOR_PROFILE]) {
    const roHtml = renderSitioView({
      profile: roProfile,
      state: {
        selectedSitioId: resolvedSitio.id,
        activeChildTab: 'procesos',
        isEditingAttributes: false,
      },
      sitio: resolvedSitio,
      certificates: INITIAL_CERTIFICADOS_DETAILED,
    });
    assert.equal(roHtml.includes('id="assignSitioProcesoForm"'), false);
    assert.equal(roHtml.includes('id="archiveSitioProcesoForm"'), false);
    assert.equal(roHtml.includes('+ Vincular Proceso'), false);
    assert.ok(roHtml.includes('data-resizable-table="sitio-tab-procesos"'));
    assert.equal(assertZeroUuidExposure(roHtml).compliant, true);
  }

  // 3. Empty state + XSS escaping check
  const emptySitio = {
    ...resolvedSitio,
    nombre_sitio: 'Planta <script>alert(1)</script>',
    procesos: [],
    procesos_vinculados: [],
  };
  const emptyHtml = renderSitioView({
    profile: WORKER_PROFILE,
    state: {
      selectedSitioId: emptySitio.id,
      activeChildTab: 'procesos',
      isEditingAttributes: false,
    },
    sitio: emptySitio,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
  });
  assert.ok(emptyHtml.includes('Sin procesos vinculados a este sitio'));
  assert.ok(emptyHtml.includes('planificador de auditorías requiere procesos activos del sitio'));
  assert.equal(emptyHtml.includes('<script>alert(1)</script>'), false);
  assert.ok(emptyHtml.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.equal(assertZeroUuidExposure(emptyHtml).compliant, true);
});

test('Step 1.1 (Roadmap): personal_count validation (1..50000), Sitio form field rendering, and 6-shift catalog parity', () => {
  // 1. Catalog parity: 6 standard shifts without duplicates
  assert.equal(INITIAL_TURNO_CATALOG.length, 6);
  assert.equal(new Set(INITIAL_TURNO_CATALOG.map((t) => t.id)).size, 6);

  // 2. Omitted personal_count in legacy drafts defaults cleanly to 10
  const legacyValid = validateSitioInput({
    numero_sitio: 1,
    nombre_sitio: 'Sucursal Norte',
    direccion_sitio: 'Zona Industrial Norte #10',
    id_certificado: 'cert-1',
  });
  assert.equal(legacyValid.valid, true);
  assert.equal(legacyValid.normalized?.personal_count, 10);

  // 3. Invalid personal_count values (empty, 0, negative, >50000, decimal) are rejected
  for (const invalidVal of ['', '0', 0, -5, 50001, '50001', '12.5', 'abc']) {
    const res = validateSitioFormDraft({
      draft: {
        id_certificado: 'cert-1',
        numero_sitio: '1',
        nombre_sitio: 'Sucursal Norte',
        direccion_sitio: 'Zona Industrial Norte #10',
        personal_count: String(invalidVal),
      },
    });
    assert.equal(res.valid, false, `Expected invalid personal_count for "${invalidVal}"`);
  }

  // 4. Valid range boundaries (1 and 50000) normalize to integers
  const minValid = validateSitioInput({
    numero_sitio: 1,
    nombre_sitio: 'Sucursal Mínima',
    direccion_sitio: 'Zona Industrial Norte #10',
    id_certificado: 'cert-1',
    personal_count: '1',
  });
  assert.equal(minValid.valid, true);
  assert.equal(minValid.normalized?.personal_count, 1);

  const maxValid = validateSitioInput({
    numero_sitio: 2,
    nombre_sitio: 'Complejo Industrial Mayor',
    direccion_sitio: 'Zona Industrial Sur #50',
    id_certificado: 'cert-1',
    personal_count: 50000,
  });
  assert.equal(maxValid.valid, true);
  assert.equal(maxValid.normalized?.personal_count, 50000);

  // 5. Add & Edit forms render #sitioPersonalCountInput with value and no buttons inside <form>
  const cert0 = INITIAL_CERTIFICADOS_DETAILED[0];
  const site0 = cert0.sitios[0];
  const sitioDetail = resolveSitioDetailById({
    sitioId: site0.id,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    programacionAudits: INITIAL_PROGRAMACION_AUDITS,
    shiftCatalog: INITIAL_TURNO_CATALOG,
  })!;
  assert.equal(sitioDetail.personal_count, site0.personal_count);

  const editHtml = renderSitioView({
    profile: ADMIN_PROFILE,
    state: {
      selectedSitioId: sitioDetail.id,
      activeChildTab: 'turnos',
      isEditingAttributes: true,
      editFormData: {
        id_certificado: sitioDetail.id_certificado,
        numero_sitio: sitioDetail.numero_sitio,
        nombre_sitio: sitioDetail.nombre_sitio,
        direccion_sitio: sitioDetail.direccion_sitio,
        personal_count: 245,
      },
    },
    sitio: sitioDetail,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    shiftCatalog: INITIAL_TURNO_CATALOG,
  });
  assert.ok(editHtml.includes('id="sitioPersonalCountInput"'));
  assert.ok(editHtml.includes('value="245"'));
  const editForm = editHtml.match(/<form id="sitioDetailForm"[\s\S]*?<\/form>/);
  assert.ok(editForm);
  assert.equal(editForm[0].includes('<button'), false);
  assert.equal(assertZeroUuidExposure(editHtml).compliant, true);
});


