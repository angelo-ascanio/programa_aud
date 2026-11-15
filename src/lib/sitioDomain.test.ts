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
  createEmptySitioFormDraft,
  formatShiftTime,
  resolveSitioDetailById,
  resolveSitioDetailMode,
  suggestNextNumeroSitio,
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
