import test from 'node:test';
import assert from 'node:assert/strict';
import type { UserProfile } from '../lib/healthCheck';
import { CERTIFICACION_NAV_ITEMS } from '../lib/healthCheck';
import type { OrganizacionEntity } from '../lib/activeCertificates';
import type { ConglomeradoEntity } from '../lib/conglomeradoDomain';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import {
  DEFAULT_VINCULO_VIEW_STATE,
  openAssignCertModalState,
  toggleAssignModalBoxExpanded,
  type VinculoEntity,
} from '../lib/vinculoDomain';
import { assertZeroUuidExposure } from '../lib/zeroUuid';
import { renderCertificacionView } from './certificacionView';
import { renderVinculoView } from './vinculoView';

const ADMIN_PROFILE: UserProfile = {
  id: '11111111-1111-1111-1111-111111111111',
  nombre: 'Admin Demo',
  role: 'ADMIN',
  status: 'APPROVED',
};

const WORKER_PROFILE: UserProfile = {
  id: '22222222-2222-2222-2222-222222222222',
  nombre: 'Worker Demo',
  role: 'WORKER',
  status: 'APPROVED',
};

const AUDITOR_PROFILE: UserProfile = {
  id: '33333333-3333-3333-3333-333333333333',
  nombre: 'Auditor Demo',
  role: 'AUDITOR',
  status: 'APPROVED',
};

const CLIENT_PROFILE: UserProfile = {
  id: '44444444-4444-4444-4444-444444444444',
  nombre: 'Cliente Demo',
  role: 'CLIENT',
  status: 'APPROVED',
};

const CONG_ID = '20000000-0000-0000-0000-000000000001';
const ORG_A = '30000000-0000-0000-0000-000000000001';
const ORG_B = '30000000-0000-0000-0000-000000000002';
const CERT_1 = '40000000-0000-0000-0000-000000000001';
const CERT_2 = '40000000-0000-0000-0000-000000000002';
const CERT_FREE = '40000000-0000-0000-0000-000000000003';
const BOX_1 = '7c000000-0000-0000-0000-000000000001';

const CONGLOMERADOS: ConglomeradoEntity[] = [
  {
    id: CONG_ID,
    codigo_grupo: 'CONG-01',
    nombre: 'Grupo Corporativo Alimentos Polar C.A.',
    abreviacion: 'Polar',
    es_individual_auto: false,
    notas: 'Conglomerado de prueba',
  },
];

const ORGANIZACIONES: OrganizacionEntity[] = [
  {
    id: ORG_A,
    id_grupo_empresarial: CONG_ID,
    nombre: 'Alimentos Turmero C.A.',
    abreviacion: 'Turmero',
    rif: 'J-30000001-1',
    direccion_fiscal: 'Turmero',
    certificados_count: 2,
  },
  {
    id: ORG_B,
    id_grupo_empresarial: CONG_ID,
    nombre: 'Distribuidora Valencia S.A.',
    abreviacion: 'Valencia',
    rif: 'J-30000002-2',
    direccion_fiscal: 'Valencia',
    certificados_count: 1,
  },
];

function makeCert(
  id: string,
  orgId: string,
  orgName: string,
  orgAbrev: string,
  numero: string,
  norma: string
): CertificadoDetailEntity {
  return {
    id,
    id_organizacion: orgId,
    organizacion_nombre: orgName,
    organizacion_abreviacion: orgAbrev,
    numero_certificado: numero,
    norma_codigo: norma,
    norma_titulo: norma,
    estatus: 'ACTIVO',
    es_multisite: false,
    sitios: [],
    procesos: [],
    turnos: [],
    no_aplicables: [],
    fechas: [],
    contactos: [],
    alcance: 'Alcance de manufactura',
    version_actual_numero: 1,
    versiones: [],
  };
}

const CERTIFICADOS: CertificadoDetailEntity[] = [
  makeCert(CERT_1, ORG_A, 'Alimentos Turmero C.A.', 'Turmero', 'FN-QMS-2026-001', 'ISO 9001:2015'),
  makeCert(CERT_2, ORG_A, 'Alimentos Turmero C.A.', 'Turmero', 'FN-EMS-2026-002', 'ISO 14001:2015'),
  makeCert(CERT_FREE, ORG_B, 'Distribuidora Valencia S.A.', 'Valencia', 'FN-OHS-2026-003', 'ISO 45001:2018'),
];

const VINCULOS: VinculoEntity[] = [
  {
    id: BOX_1,
    id_grupo_empresarial: CONG_ID,
    grupo_nombre: 'Grupo Corporativo Alimentos Polar C.A.',
    codigo_vinculo: 'VINC-TUR-01',
    etiqueta: 'Planta Turmero',
    nivel_vinculacion: 'NIVEL_1_INTRA_ORG',
    tipo_vinculacion: 'Combinada',
    es_vinculada: true,
    tiene_sitio_temporal: false,
    notas: 'Nota interna que no debe saturar la vista lectura',
    certificados: [
      {
        id: '7d000000-0000-0000-0000-000000000001',
        id_vinculo: BOX_1,
        id_certificado: CERT_1,
        numero_certificado: 'FN-QMS-2026-001',
        norma_codigo: 'ISO 9001:2015',
        id_organizacion: ORG_A,
        organizacion_nombre: 'Alimentos Turmero C.A.',
        organizacion_abreviacion: 'Turmero',
        tipo_vinculacion_override: null,
        estatus: 'ACTIVO',
        deleted_at: null,
      },
      {
        id: '7d000000-0000-0000-0000-000000000002',
        id_vinculo: BOX_1,
        id_certificado: CERT_2,
        numero_certificado: 'FN-EMS-2026-002',
        norma_codigo: 'ISO 14001:2015',
        id_organizacion: ORG_A,
        organizacion_nombre: 'Alimentos Turmero C.A.',
        organizacion_abreviacion: 'Turmero',
        tipo_vinculacion_override: 'Integrada',
        estatus: 'ACTIVO',
        deleted_at: null,
      },
    ],
    deleted_at: null,
  },
];

test('Step 2.2: CERTIFICACION_NAV_ITEMS places vinculo immediately below certificates and before auditors', () => {
  const ids = CERTIFICACION_NAV_ITEMS.map((item) => item.id);
  assert.deepEqual(ids, [
    'conglomerados',
    'organizations',
    'certificates',
    'vinculo',
    'auditors',
    'experts',
  ]);
});

test('Step 2.2: Multi View colgroup sums 100%, contains zero <button> in <tbody>, and uses short conglomerate names', () => {
  const html = renderCertificacionView(ADMIN_PROFILE, {
    activeSubSection: 'vinculo',
    filters: { query: '', selectedStatus: 'ALL', selectedStandard: 'ALL', viewMode: 'list' },
    filteredCertificates: [],
    allCertificates: [],
    availableStatuses: [],
    availableStandards: [],
    organizations: [],
    sites: [],
    processes: [],
    shifts: [],
    loading: false,
    allConglomerados: CONGLOMERADOS,
    allOrganizaciones: ORGANIZACIONES,
    allCertificadosDetailed: CERTIFICADOS,
    allVinculosDetailed: VINCULOS,
    vinculoState: DEFAULT_VINCULO_VIEW_STATE,
  });

  const colgroupMatch = html.match(/<colgroup>([\s\S]*?)<\/colgroup>/);
  assert.ok(colgroupMatch, 'Expected <colgroup> in Multi View table');
  const widths = Array.from(colgroupMatch[1].matchAll(/width:\s*([0-9.]+)%/g)).map((m) =>
    Number(m[1])
  );
  const sum = Math.round(widths.reduce((acc, n) => acc + n, 0) * 100) / 100;
  assert.equal(sum, 100);

  const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  assert.ok(tbodyMatch, 'Expected <tbody> in Multi View table');
  assert.equal(tbodyMatch[1].includes('<button'), false);

  assert.ok(html.includes('Polar'));
  assert.ok(html.includes('data-action="select-vinculo-conglomerado"'));
  assert.equal(html.includes('open-add-audit-wizard'), false);
  assert.equal(assertZeroUuidExposure(html).compliant, true);
});

test('Step 2.2: Detail View renders 2 minimalist zones without Block 1 clutter, clean read cards, and edit controls on edit', () => {
  const readHtml = renderVinculoView({
    profile: WORKER_PROFILE,
    state: {
      ...DEFAULT_VINCULO_VIEW_STATE,
      selectedConglomeradoId: CONG_ID,
    },
    vinculos: VINCULOS,
    conglomerados: CONGLOMERADOS,
    organizaciones: ORGANIZACIONES,
    certificados: CERTIFICADOS,
  });

  // Header & 2 Zones
  assert.ok(readHtml.includes('Polar'));
  assert.ok(readHtml.includes('Certificados LIBRE (1)'));
  assert.ok(readHtml.includes('Cajas Agrupadoras (1)'));
  assert.ok(readHtml.includes('data-action="open-vinculo-assign-modal"'));
  assert.ok(readHtml.includes('FN-OHS-2026-003'));
  assert.ok(readHtml.includes('Valencia'));

  // Zero Block 1 or verbose clutter
  assert.equal(readHtml.includes('Generar Auditoría'), false);
  assert.equal(readHtml.includes('+ Auditoría'), false);
  assert.equal(readHtml.includes('Abrir Resumen'), false);
  assert.equal(readHtml.includes('select-target-box-for-cert'), false);
  assert.equal(readHtml.includes('VINC-TUR-01'), false);
  assert.equal(readHtml.includes('Nota interna que no debe saturar'), false);

  // Read mode card: clean label + discrete edit trigger, no inline edit form, override badge only for overridden member
  assert.ok(readHtml.includes('Planta Turmero'));
  assert.ok(readHtml.includes('data-action="start-edit-vinculo-box"'));
  assert.equal(readHtml.includes('data-vinculo-edit-box-form'), false);
  assert.equal(readHtml.includes('data-action="detach-cert-to-libre"'), false);
  assert.ok(readHtml.includes('data-vinculo-override-badge="true"'));
  assert.ok(readHtml.includes('Integrada'));
  assert.equal(assertZeroUuidExposure(readHtml).compliant, true);

  // Edit mode: exposes Etiqueta, Naturaleza, per-cert override <select>, Desvincular, Archivar caja
  const editHtml = renderVinculoView({
    profile: ADMIN_PROFILE,
    state: {
      ...DEFAULT_VINCULO_VIEW_STATE,
      selectedConglomeradoId: CONG_ID,
      editingBoxId: BOX_1,
    },
    vinculos: VINCULOS,
    conglomerados: CONGLOMERADOS,
    organizaciones: ORGANIZACIONES,
    certificados: CERTIFICADOS,
  });

  assert.ok(editHtml.includes('data-vinculo-edit-box-form'));
  assert.ok(editHtml.includes('name="etiqueta"'));
  assert.ok(editHtml.includes('name="tipo_vinculacion"'));
  assert.ok(editHtml.includes('data-action="change-cert-nature-override"'));
  assert.ok(editHtml.includes('Heredar (Combinada)'));
  assert.ok(editHtml.includes('data-action="detach-cert-to-libre"'));
  assert.ok(editHtml.includes('data-action="archive-vinculo-box"'));
  assert.equal(editHtml.includes('move-boxed-cert'), false);
  assert.equal(assertZeroUuidExposure(editHtml).compliant, true);
});

test('Step 2.2: Assign Pop-up Modal renders boxes collapsed by default and reveals member certs only when expanded', () => {
  const collapsedState = openAssignCertModalState(
    {
      ...DEFAULT_VINCULO_VIEW_STATE,
      selectedConglomeradoId: CONG_ID,
    },
    CERT_FREE
  );

  const collapsedHtml = renderVinculoView({
    profile: ADMIN_PROFILE,
    state: collapsedState,
    vinculos: VINCULOS,
    conglomerados: CONGLOMERADOS,
    organizaciones: ORGANIZACIONES,
    certificados: CERTIFICADOS,
  });

  assert.ok(collapsedHtml.includes('id="vinculoAssignModal"'));
  assert.ok(collapsedHtml.includes('Asignar certificado a caja'));
  assert.ok(collapsedHtml.includes('data-action="toggle-assign-modal-box"'));
  assert.ok(collapsedHtml.includes('aria-expanded="false"'));
  assert.ok(collapsedHtml.includes('data-action="confirm-assign-cert-to-box"'));
  assert.ok(collapsedHtml.includes('id="assignModalQuickCreateBoxForm"'));
  assert.equal(collapsedHtml.includes(`data-assign-modal-box-members="${BOX_1}"`), false);
  assert.equal(assertZeroUuidExposure(collapsedHtml).compliant, true);

  const expandedState = toggleAssignModalBoxExpanded(collapsedState, BOX_1);
  const expandedHtml = renderVinculoView({
    profile: ADMIN_PROFILE,
    state: expandedState,
    vinculos: VINCULOS,
    conglomerados: CONGLOMERADOS,
    organizaciones: ORGANIZACIONES,
    certificados: CERTIFICADOS,
  });

  assert.ok(expandedHtml.includes('aria-expanded="true"'));
  assert.ok(expandedHtml.includes(`data-assign-modal-box-members="${BOX_1}"`));
  assert.ok(expandedHtml.includes('FN-QMS-2026-001'));
  assert.ok(expandedHtml.includes('FN-EMS-2026-002'));
  assert.equal(assertZeroUuidExposure(expandedHtml).compliant, true);
});

test('Step 2.2: AUDITOR is denied Vínculo in Block 2 and CLIENT is strictly read-only without sibling org leakage', () => {
  const auditorHtml = renderCertificacionView(AUDITOR_PROFILE, {
    activeSubSection: 'vinculo',
    filters: { query: '', selectedStatus: 'ALL', selectedStandard: 'ALL', viewMode: 'list' },
    filteredCertificates: [],
    allCertificates: [],
    availableStatuses: [],
    availableStandards: [],
    organizations: [],
    sites: [],
    processes: [],
    shifts: [],
    loading: false,
    allConglomerados: CONGLOMERADOS,
    allOrganizaciones: ORGANIZACIONES,
    allCertificadosDetailed: CERTIFICADOS,
    allVinculosDetailed: VINCULOS,
    vinculoState: DEFAULT_VINCULO_VIEW_STATE,
  });

  assert.ok(auditorHtml.includes('Acceso restringido'));
  assert.equal(auditorHtml.includes('Planta Turmero'), false);
  assert.equal(assertZeroUuidExposure(auditorHtml).compliant, true);

  const clientHtml = renderVinculoView({
    profile: CLIENT_PROFILE,
    state: {
      ...DEFAULT_VINCULO_VIEW_STATE,
      selectedConglomeradoId: CONG_ID,
      assignModalCertId: CERT_FREE,
    },
    vinculos: VINCULOS,
    conglomerados: CONGLOMERADOS,
    organizaciones: ORGANIZACIONES,
    certificados: CERTIFICADOS,
    authorizedClientOrgIds: [ORG_A],
  });

  assert.ok(clientHtml.includes('FN-QMS-2026-001'));
  assert.equal(clientHtml.includes('FN-OHS-2026-003'), false);
  assert.equal(clientHtml.includes('Valencia'), false);
  assert.equal(clientHtml.includes('open-create-vinculo-box'), false);
  assert.equal(clientHtml.includes('start-edit-vinculo-box'), false);
  assert.equal(clientHtml.includes('open-vinculo-assign-modal'), false);
  assert.equal(clientHtml.includes('vinculoAssignModal'), false);
  assert.equal(assertZeroUuidExposure(clientHtml).compliant, true);
});
