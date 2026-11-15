import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isApprovedAdminProfile, isApprovedStaffProfile } from './rbac.js';
import {
  createNewEntityBreadcrumbSegment,
  getSubviewLabel,
  pushBreadcrumb,
  resetBreadcrumbToDomain,
  type BreadcrumbEntityType,
} from './breadcrumb.js';
import {
  renderDetailBooleanField,
  renderDetailFormTopActions,
  renderDetailParentSelectCard,
  renderMultiViewAddButton,
} from '../views/detailTemplate.js';
import { renderNormaView } from '../views/normaView.js';
import { renderSectorIafView } from '../views/sectorIafView.js';
import { renderExtraView } from '../views/extraView.js';
import { INITIAL_NORMAS, INITIAL_ORGANISMOS, INITIAL_REQUISITOS_LTREE, INITIAL_SECTORES_IAF, INITIAL_SUBSECTORES_IAF } from './extraDomain.js';
import { isValidUuid } from './zeroUuid.js';
import type { UserProfile } from './healthCheck.js';

const APPROVED_ADMIN: UserProfile = {
  id: '11111111-1111-1111-1111-111111111111',
  nombre: 'Admin Aprobado',
  role: 'ADMIN',
  status: 'APPROVED',
};

const APPROVED_WORKER: UserProfile = {
  id: '22222222-2222-2222-2222-222222222222',
  nombre: 'Worker Aprobado',
  role: 'WORKER',
  status: 'APPROVED',
};

const PENDING_WORKER: UserProfile = {
  id: '33333333-3333-3333-3333-333333333333',
  nombre: 'Worker Pendiente',
  role: 'WORKER',
  status: 'PENDING',
};

const REJECTED_ADMIN: UserProfile = {
  id: '44444444-4444-4444-4444-444444444444',
  nombre: 'Admin Rechazado',
  role: 'ADMIN',
  status: 'REJECTED',
};

const APPROVED_AUDITOR: UserProfile = {
  id: '55555555-5555-5555-5555-555555555555',
  nombre: 'Auditor Aprobado',
  role: 'AUDITOR',
  status: 'APPROVED',
};

const APPROVED_CLIENT: UserProfile = {
  id: '66666666-6666-6666-6666-666666666666',
  nombre: 'Cliente Aprobado',
  role: 'CLIENT',
  status: 'APPROVED',
};

test('Step 1 RBAC: isApprovedStaffProfile & isApprovedAdminProfile enforce role and APPROVED status', () => {
  assert.equal(isApprovedStaffProfile(APPROVED_ADMIN), true);
  assert.equal(isApprovedStaffProfile(APPROVED_WORKER), true);
  assert.equal(isApprovedStaffProfile({ ...APPROVED_WORKER, status: undefined } as unknown as UserProfile), true);
  assert.equal(isApprovedStaffProfile(PENDING_WORKER), false);
  assert.equal(isApprovedStaffProfile(REJECTED_ADMIN), false);
  assert.equal(isApprovedStaffProfile(APPROVED_AUDITOR), false);
  assert.equal(isApprovedStaffProfile(APPROVED_CLIENT), false);
  assert.equal(isApprovedStaffProfile(null), false);
  assert.equal(isApprovedStaffProfile(undefined), false);

  assert.equal(isApprovedAdminProfile(APPROVED_ADMIN), true);
  assert.equal(isApprovedAdminProfile({ ...APPROVED_ADMIN, status: undefined } as unknown as UserProfile), true);
  assert.equal(isApprovedAdminProfile(APPROVED_WORKER), false);
  assert.equal(isApprovedAdminProfile(REJECTED_ADMIN), false);
  assert.equal(isApprovedAdminProfile(null), false);
});

test('Step 1 RBAC Migration: normaView, sectorIafView, and extraView block PENDING/REJECTED staff mutations', () => {
  const pendingNormaHtml = renderNormaView({
    profile: PENDING_WORKER,
    state: {
      selectedNormaId: INITIAL_NORMAS[0].id,
      activeChildTab: 'acreditacion',
      query: '',
      selectedStatus: 'ALL',
      selectedScheme: 'ALL',
      viewMode: 'grid',
      sortColumn: null,
      sortDirection: 'none',
      isAddAccreditationModalOpen: false,
      inspectingClauseId: null,
    },
    normas: INITIAL_NORMAS,
    acreditaciones: [],
    organismos: INITIAL_ORGANISMOS,
    requisitos: INITIAL_REQUISITOS_LTREE,
  });
  assert.equal(pendingNormaHtml.includes('id="openNewAccreditationModalBtn"'), false);

  const approvedNormaHtml = renderNormaView({
    profile: APPROVED_WORKER,
    state: {
      selectedNormaId: INITIAL_NORMAS[0].id,
      activeChildTab: 'acreditacion',
      query: '',
      selectedStatus: 'ALL',
      selectedScheme: 'ALL',
      viewMode: 'grid',
      sortColumn: null,
      sortDirection: 'none',
      isAddAccreditationModalOpen: false,
      inspectingClauseId: null,
    },
    normas: INITIAL_NORMAS,
    acreditaciones: [],
    organismos: INITIAL_ORGANISMOS,
    requisitos: INITIAL_REQUISITOS_LTREE,
  });
  assert.ok(approvedNormaHtml.includes('id="openNewAccreditationModalBtn"'));

  const pendingIafHtml = renderSectorIafView({
    profile: PENDING_WORKER,
    state: {
      selectedSectorId: INITIAL_SECTORES_IAF[0].id,
      activeChildTab: 'subsectores',
      query: '',
      selectedRisk: 'ALL',
      viewMode: 'grid',
      sortColumn: null,
      sortDirection: 'none',
      isAddSubsectorModalOpen: false,
    },
    sectores: INITIAL_SECTORES_IAF,
    subsectores: INITIAL_SUBSECTORES_IAF,
  });
  assert.equal(pendingIafHtml.includes('id="openNewSubsectorModalBtn"'), false);

  const extraPendingModalHtml = renderExtraView(PENDING_WORKER, {
    activeSubSection: 'iaf',
    standards: [],
    requirements: [],
    iafSectors: [],
    catalogs: [],
    loading: false,
    iafState: {
      selectedSectorId: INITIAL_SECTORES_IAF[0].id,
      isAddSubsectorModalOpen: true,
    },
  });
  assert.equal(extraPendingModalHtml.includes('id="newSubsectorForm"'), false);
});

test('Step 1 Detail Primitives: renderDetailFormTopActions places Save before Cancel in add/edit and renders read actions for staff', () => {
  for (const mode of ['add', 'edit'] as const) {
    const html = renderDetailFormTopActions({
      mode,
      isStaff: true,
      formId: 'orgForm',
      saveBtnId: 'saveOrgBtn',
      cancelBtnId: 'cancelOrgBtn',
      editBtnId: 'editOrgBtn',
      saveTitle: mode === 'add' ? 'Crear organización' : 'Guardar cambios',
    });

    const saveIdx = html.indexOf('id="saveOrgBtn"');
    const cancelIdx = html.indexOf('id="cancelOrgBtn"');
    assert.ok(saveIdx >= 0, `Missing save button in ${mode}`);
    assert.ok(cancelIdx >= 0, `Missing cancel button in ${mode}`);
    assert.ok(saveIdx < cancelIdx, `Save button MUST appear strictly before Cancel in ${mode}`);
    assert.ok(html.includes('type="submit"'));
    assert.ok(html.includes('form="orgForm"'));
    assert.ok(html.includes('bg-emerald-600'));
    assert.ok(html.includes('bg-rose-50'));
  }

  const readStaffHtml = renderDetailFormTopActions({
    mode: 'read',
    isStaff: true,
    formId: 'orgForm',
    saveBtnId: 'saveOrgBtn',
    cancelBtnId: 'cancelOrgBtn',
    editBtnId: 'editOrgBtn',
  });
  assert.ok(readStaffHtml.includes('id="editOrgBtn"'));
  assert.ok(readStaffHtml.includes('data-action="open-changelog"'));
  assert.ok(readStaffHtml.includes('data-action="open-archive-modal"'));
  assert.ok(readStaffHtml.indexOf('id="editOrgBtn"') < readStaffHtml.indexOf('data-action="open-changelog"'));
  assert.ok(readStaffHtml.indexOf('data-action="open-changelog"') < readStaffHtml.indexOf('data-action="open-archive-modal"'));

  const readNonStaffHtml = renderDetailFormTopActions({
    mode: 'read',
    isStaff: false,
    formId: 'orgForm',
    saveBtnId: 'saveOrgBtn',
    cancelBtnId: 'cancelOrgBtn',
    editBtnId: 'editOrgBtn',
  });
  assert.equal(readNonStaffHtml, '');
});

test('Step 1 Detail Primitives: renderDetailBooleanField, renderDetailParentSelectCard, and renderMultiViewAddButton', () => {
  const boolReadTrue = renderDetailBooleanField({
    mode: 'read',
    inputId: 'esPrincipalInput',
    name: 'es_principal',
    label: 'Sede Principal',
    checked: true,
  });
  assert.ok(boolReadTrue.includes('bg-emerald-50 text-emerald-800 border-emerald-200'));
  assert.ok(boolReadTrue.includes('✓'));
  assert.ok(boolReadTrue.includes('Sí'));

  const boolReadFalse = renderDetailBooleanField({
    mode: 'read',
    inputId: 'esPrincipalInput',
    name: 'es_principal',
    label: 'Sede Principal',
    checked: false,
  });
  assert.ok(boolReadFalse.includes('bg-slate-100 text-slate-600 border-slate-300'));
  assert.ok(boolReadFalse.includes('✕'));
  assert.ok(boolReadFalse.includes('No'));

  const boolEdit = renderDetailBooleanField({
    mode: 'edit',
    inputId: 'esPrincipalInput',
    name: 'es_principal',
    label: 'Sede Principal',
    checked: true,
    formId: 'sitioForm',
  });
  assert.ok(boolEdit.includes('type="checkbox"'));
  assert.ok(boolEdit.includes('form="sitioForm"'));
  assert.equal(boolEdit.includes('disabled'), false);
  assert.equal(boolEdit.includes('*'), false);

  const parentSelectEdit = renderDetailParentSelectCard({
    mode: 'edit',
    formId: 'sitioForm',
    selectId: 'sitioCertSelect',
    name: 'id_certificado',
    label: 'Certificado',
    symbol: '📜',
    selectedValue: 'cert-1',
    options: [
      { value: 'cert-1', label: 'FN-QMS-2024-001' },
      { value: 'cert-2', label: 'FN-EMS-2024-002' },
    ],
  });
  assert.ok(parentSelectEdit.includes('form="sitioForm"'));
  assert.ok(parentSelectEdit.includes('id="sitioCertSelect"'));
  assert.ok(parentSelectEdit.includes('name="id_certificado"'));
  assert.ok(parentSelectEdit.includes('border-indigo-200'));
  assert.equal(parentSelectEdit.includes('disabled class='), false);

  const parentSelectRead = renderDetailParentSelectCard({
    mode: 'read',
    formId: 'sitioForm',
    selectId: 'sitioCertSelect',
    name: 'id_certificado',
    label: 'Certificado',
    selectedValue: 'cert-1',
    options: [{ value: 'cert-1', label: 'FN-QMS-2024-001' }],
    navAction: {
      nav: 'certificacion',
      subview: 'certificates',
      entityType: 'cert',
      entityId: 'cert-1',
    },
  });
  assert.ok(parentSelectRead.includes('disabled'));
  assert.ok(parentSelectRead.includes('data-parent-nav="true"'));

  const addBtnHtml = renderMultiViewAddButton('open-create-org', 'Nueva Organización');
  assert.ok(addBtnHtml.includes('data-action="open-create-org"'));
  assert.ok(addBtnHtml.includes('w-9 h-9 rounded-lg bg-sky-700 hover:bg-sky-800 text-white'));
  assert.ok(addBtnHtml.includes('stroke-width="2.5"'));
});

test('Step 1 Breadcrumbs & Zero-UUID: supports new entity types, organismos subview label, generic create segment, and isValidUuid', () => {
  assert.equal(getSubviewLabel('extra', 'organismos'), 'Organismos de Acreditación');

  const newTypes: BreadcrumbEntityType[] = [
    'organismo_acreditacion',
    'subsector_iaf',
    'requisito',
    'no_aplicable',
    'acceso_cliente',
    'competencia_auditor',
  ];

  for (const entityType of newTypes) {
    const seg = createNewEntityBreadcrumbSegment({
      entityType,
      label: `Nuevo ${entityType}`,
      route: entityType === 'no_aplicable' || entityType === 'acceso_cliente' || entityType === 'competencia_auditor' ? 'certificacion' : 'extra',
      subview: entityType === 'organismo_acreditacion' ? 'organismos' : 'standards',
      parentEntityId: '30000000-0000-0000-0000-000000000001',
    });
    assert.equal(seg.id, `${entityType}-new`);
    assert.equal(seg.entityId, undefined);
    assert.equal(seg.parentEntityId, '30000000-0000-0000-0000-000000000001');

    const root = resetBreadcrumbToDomain(seg.route, seg.subview);
    const once = pushBreadcrumb(root, seg);
    const twice = pushBreadcrumb(once, seg);
    assert.equal(once.length, 3);
    assert.equal(twice.length, 3);
  }

  assert.equal(isValidUuid('30000000-0000-0000-0000-000000000001'), true);
  assert.equal(isValidUuid('cert-new'), false);
  assert.equal(isValidUuid('sitio-temp-1'), false);
  assert.equal(isValidUuid(''), false);
  assert.equal(isValidUuid(null), false);
});

test('Step 1 SQL Governance: 04_rls.sql archive_record includes client_organization_access in v_child_tables', () => {
  const sql04Path = path.resolve(process.cwd(), 'public', 'supabase', 'queries', '04_rls.sql');
  const sql04 = fs.readFileSync(sql04Path, 'utf8');
  const match = sql04.match(/CREATE OR REPLACE FUNCTION public\.archive_record[\s\S]*?\n\$\$;/i);
  assert.ok(match, 'archive_record function must exist in 04_rls.sql');
  assert.ok(match[0].includes("'client_organization_access'"), 'v_child_tables must include client_organization_access');
});
