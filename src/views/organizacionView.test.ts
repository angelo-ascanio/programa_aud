import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_ORGANIZACIONES,
  type CertificadoSummary,
  type ClientOrganizationAccessEntity,
  type OrganizacionEntity,
} from '../lib/activeCertificates';
import { INITIAL_CONGLOMERADOS } from '../lib/conglomeradoDomain';
import { canAccessRoute, type UserProfile } from '../lib/healthCheck';
import {
  INITIAL_ALL_SEEDED_CERTIFICADOS_DETAILED,
  INITIAL_CERTIFICADOS_DETAILED,
  type CertificadoDetailEntity,
} from '../lib/multisiteSampling';
import {
  CERT_VERSION_ORG_ACTION_LABELS,
  EXACT_NO_CHANGES_ORG_VERSION_MESSAGE,
  buildDefaultCertVersionOrgResolutions,
  validateNewOrganizacionVersionDraft,
  type CertVersionOrgCandidate,
} from '../lib/organizacionVersionDomain';
import { assertZeroUuidExposure } from '../lib/zeroUuid';
import { renderClientAccessView } from './clientAccessView';
import {
  renderOrganizacionCertResolutionModal,
  renderOrganizacionView,
  type OrganizacionViewState,
} from './organizacionView';

const ADMIN_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000001',
  nombre: 'Admin Demo',
  role: 'ADMIN',
  status: 'APPROVED',
  created_at: '2026-01-01T00:00:00Z',
};

const AUDITOR_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000002',
  nombre: 'Auditor Técnico',
  role: 'AUDITOR',
  status: 'APPROVED',
  created_at: '2026-01-01T00:00:00Z',
};

const CLIENT_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000003',
  nombre: 'Cliente Iberometal',
  role: 'CLIENT',
  status: 'APPROVED',
  created_at: '2026-01-01T00:00:00Z',
};

const IBEROMETAL_ID = '30000000-0000-0000-0000-000000000001';
const IBEROMETAL_V1_ID = '31000000-0000-0000-0000-000000000001';
const IBEROMETAL_V2_ID = '31000000-0000-0000-0000-000000000101';
const IBEROMETAL_V3_ID = '31000000-0000-0000-0000-000000000201';

function buildOrgViewState(
  overrides: Partial<OrganizacionViewState> = {}
): OrganizacionViewState {
  return {
    selectedOrganizacionId: null,
    selectedOrgVersionId: null,
    query: '',
    hasActiveCertificates: 'ALL',
    selectedSectorIaf: 'ALL',
    viewMode: 'list',
    sortColumn: null,
    sortDirection: 'none',
    isEditingAttributes: false,
    isCreatingVersion: false,
    activeChildTab: 'certificados',
    isSidebarOpen: false,
    facetSelections: {},
    isCreating: false,
    certResolutionModal: null,
    ...overrides,
  };
}

function buildCertSummaries(
  detailed: ReadonlyArray<CertificadoDetailEntity>
): CertificadoSummary[] {
  return detailed.map((c) => ({
    id: c.id,
    id_organizacion: c.id_organizacion,
    numero_certificado: c.numero_certificado,
    norma: c.norma_codigo,
    esquema: c.esquema,
    estatus: c.estatus,
    multisitio: c.multisitio,
    sitios_count: c.sitios.filter((s) => !s.deleted_at).length,
    fecha_emision: c.fecha_emision,
    fecha_vencimiento: c.fecha_vencimiento,
  }));
}

function assertTableInvariants(html: string, tableId: string): void {
  const tableRegex = new RegExp(
    `<table[^>]*(?:id|data-resizable-table)="${tableId}"[\\s\\S]*?<\\/table>`,
    'i'
  );
  const tableMatch = html.match(tableRegex);
  assert.ok(tableMatch, `Expected table ${tableId}`);
  const tableHtml = tableMatch[0];
  assert.ok(
    tableHtml.includes('table-fixed'),
    `Table ${tableId} must use table-fixed`
  );

  const colgroupMatch = tableHtml.match(/<colgroup>([\s\S]*?)<\/colgroup>/i);
  assert.ok(colgroupMatch, `Table ${tableId} must declare <colgroup>`);
  const widths = Array.from(colgroupMatch[1].matchAll(/width:\s*([0-9.]+)%/gi)).map(
    (m) => Number(m[1])
  );
  assert.ok(widths.length > 0, `Table ${tableId} <colgroup> must have width columns`);
  const sum = widths.reduce((acc, n) => acc + n, 0);
  assert.ok(
    Math.abs(sum - 100) < 0.01,
    `Table ${tableId} <colgroup> widths must sum to 100%, got ${sum}%`
  );

  const tbodyMatch = tableHtml.match(/<tbody[\s\S]*?<\/tbody>/i);
  assert.ok(tbodyMatch, `Table ${tableId} must render <tbody>`);
  assert.equal(
    /<button\b/i.test(tbodyMatch[0]),
    false,
    `Table ${tableId} must have 0 <button> elements inside <tbody>`
  );
}

test('Step 3.2 Multi View: shows abreviacion & vN badges, supports filtering & sorting by abreviacion, enforces table invariants & Zero-UUID', () => {
  const certSummaries = buildCertSummaries(INITIAL_CERTIFICADOS_DETAILED);

  const listHtml = renderOrganizacionView({
    profile: ADMIN_PROFILE,
    state: buildOrgViewState({
      viewMode: 'list',
      sortColumn: 'abreviacion',
      sortDirection: 'asc',
    }),
    organizaciones: INITIAL_ORGANIZACIONES,
    certificados: certSummaries,
    allCertificadosDetailed: INITIAL_CERTIFICADOS_DETAILED,
    conglomerados: INITIAL_CONGLOMERADOS,
  });

  assert.ok(listHtml.includes('Abreviación'));
  assert.ok(listHtml.includes('IBEROMETAL'));
  assert.ok(listHtml.includes('CYBERCLOUD'));
  assert.ok(listHtml.includes('v2'));
  assert.ok(listHtml.includes('v1'));

  // Verify ascending sort puts BIOALIMENTOS before CYBERCLOUD before IBEROMETAL before PETROQUIMICA
  const idxBio = listHtml.indexOf('BIOALIMENTOS');
  const idxCyber = listHtml.indexOf('CYBERCLOUD');
  const idxIbero = listHtml.indexOf('IBEROMETAL');
  const idxPetro = listHtml.indexOf('PETROQUIMICA');
  assert.ok(idxBio >= 0 && idxCyber > idxBio && idxIbero > idxCyber && idxPetro > idxIbero);

  assertTableInvariants(listHtml, 'cert-organizaciones-main');
  assert.equal(assertZeroUuidExposure(listHtml).compliant, true);

  // Filter by abreviacion in Grid View
  const filteredGridHtml = renderOrganizacionView({
    profile: ADMIN_PROFILE,
    state: buildOrgViewState({
      viewMode: 'grid',
      query: 'CYBERCLOUD',
    }),
    organizaciones: INITIAL_ORGANIZACIONES,
    certificados: certSummaries,
    allCertificadosDetailed: INITIAL_CERTIFICADOS_DETAILED,
    conglomerados: INITIAL_CONGLOMERADOS,
  });

  assert.ok(filteredGridHtml.includes('CyberCloud Solutions S.L.'));
  assert.ok(filteredGridHtml.includes('CYBERCLOUD'));
  assert.equal(filteredGridHtml.includes('Iberometal Componentes S.A.'), false);
  assert.equal(assertZeroUuidExposure(filteredGridHtml).compliant, true);
});

test('Step 3.2 Detail View: version selector distinguishes active v2 from historical v1 (read-only banner, disabled controls, historical certs)', () => {
  const certSummaries = buildCertSummaries(INITIAL_ALL_SEEDED_CERTIFICADOS_DETAILED);

  // Build Iberometal detailed certs including historical cert version linked to v1
  const detailedWithHist: CertificadoDetailEntity[] =
    INITIAL_ALL_SEEDED_CERTIFICADOS_DETAILED.map((c) => {
      if (c.id === '40000000-0000-0000-0000-000000000002') {
        return {
          ...c,
          id_organizacion_version: IBEROMETAL_V2_ID,
          version_actual_numero: 2,
          versiones: [
            {
              id: '41000000-0000-0000-0000-000000000202',
              id_certificado: c.id,
              id_organizacion_version: IBEROMETAL_V2_ID,
              id_estatus: c.id_estatus,
              estatus: c.estatus,
              version_numero: 2,
              es_version_actual: true,
              notas_version: 'Versión actual v2',
              deleted_at: null,
            },
            {
              id: '41000000-0000-0000-0000-000000000002',
              id_certificado: c.id,
              id_organizacion_version: IBEROMETAL_V1_ID,
              id_estatus: c.id_estatus,
              estatus: c.estatus,
              version_numero: 1,
              es_version_actual: false,
              notas_version: 'Versión histórica v1',
              deleted_at: null,
            },
          ],
        };
      }
      return c;
    });

  // Active v2 detail view
  const activeHtml = renderOrganizacionView({
    profile: ADMIN_PROFILE,
    state: buildOrgViewState({
      selectedOrganizacionId: IBEROMETAL_ID,
      selectedOrgVersionId: IBEROMETAL_V2_ID,
    }),
    organizaciones: INITIAL_ORGANIZACIONES,
    certificados: certSummaries,
    allCertificadosDetailed: detailedWithHist,
    conglomerados: INITIAL_CONGLOMERADOS,
  });

  assert.ok(activeHtml.includes('data-action="select-org-version"'));
  assert.ok(activeHtml.includes('Versión Actual · v2'));
  assert.ok(activeHtml.includes('Iberometal Componentes S.A.'));
  assert.ok(activeHtml.includes('IBEROMETAL'));
  assert.ok(activeHtml.includes('id="startEditOrgBtn"'));
  assert.ok(activeHtml.includes('data-action="open-create-org-version"'));
  assert.equal(
    activeHtml.includes('Visualizando versión histórica'),
    false
  );
  assertTableInvariants(activeHtml, 'org-tab-certificados');
  assert.equal(assertZeroUuidExposure(activeHtml).compliant, true);

  // Historical v1 detail view
  const histHtml = renderOrganizacionView({
    profile: ADMIN_PROFILE,
    state: buildOrgViewState({
      selectedOrganizacionId: IBEROMETAL_ID,
      selectedOrgVersionId: IBEROMETAL_V1_ID,
      activeChildTab: 'certificados',
    }),
    organizaciones: INITIAL_ORGANIZACIONES,
    certificados: certSummaries,
    allCertificadosDetailed: detailedWithHist,
    conglomerados: INITIAL_CONGLOMERADOS,
  });

  assert.ok(histHtml.includes('Versión Histórica · v1 · Solo lectura'));
  assert.ok(
    histHtml.includes(
      'Visualizando versión histórica v1 (solo lectura). Los cambios solo pueden realizarse o derivar versiones desde la versión activa.'
    )
  );
  assert.ok(histHtml.includes('Iberometal Componentes C.A.'));
  assert.ok(histHtml.includes('Galpón Inicial'));
  assert.match(histHtml, /id="startEditOrgBtn"[\s\S]*?disabled/i);
  assert.match(histHtml, /id="openCreateOrgVersionBtn"[\s\S]*?disabled/i);
  assert.ok(histHtml.includes('Org v1 (Histórica)'));
  assertTableInvariants(histHtml, 'org-tab-certificados');
  assert.equal(assertZeroUuidExposure(histHtml).compliant, true);
});

test('Step 3.2 Edit Form, Create New Version Form & Anti-No-Op Guard', () => {
  const certSummaries = buildCertSummaries(INITIAL_CERTIFICADOS_DETAILED);
  const iberometal: OrganizacionEntity = INITIAL_ORGANIZACIONES[0];
  const activeVer = iberometal.versiones!.find((v) => v.es_version_actual)!;

  // Edit active version form includes required Abreviación
  const editHtml = renderOrganizacionView({
    profile: ADMIN_PROFILE,
    state: buildOrgViewState({
      selectedOrganizacionId: IBEROMETAL_ID,
      isEditingAttributes: true,
    }),
    organizaciones: INITIAL_ORGANIZACIONES,
    certificados: certSummaries,
    allCertificadosDetailed: INITIAL_CERTIFICADOS_DETAILED,
    conglomerados: INITIAL_CONGLOMERADOS,
  });

  assert.ok(editHtml.includes('id="organizacionDetailForm"'));
  assert.ok(editHtml.includes('id="orgAbreviacionInput"'));
  assert.ok(editHtml.includes('maxlength="30"'));
  assert.ok(editHtml.includes('placeholder="Ej. MET-VAL"'));
  assert.ok(editHtml.includes('Edición libre sobre la versión activa'));
  assert.equal(assertZeroUuidExposure(editHtml).compliant, true);

  // Create New Version form pre-populated with active version + notas_version
  const createVersionHtml = renderOrganizacionView({
    profile: ADMIN_PROFILE,
    state: buildOrgViewState({
      selectedOrganizacionId: IBEROMETAL_ID,
      isCreatingVersion: true,
    }),
    organizaciones: INITIAL_ORGANIZACIONES,
    certificados: certSummaries,
    allCertificadosDetailed: INITIAL_CERTIFICADOS_DETAILED,
    conglomerados: INITIAL_CONGLOMERADOS,
  });

  assert.ok(createVersionHtml.includes('id="organizacionVersionForm"'));
  assert.ok(createVersionHtml.includes('Crear Nueva Versión (v3)'));
  assert.ok(createVersionHtml.includes('id="orgVersionAbreviacionInput"'));
  assert.ok(createVersionHtml.includes('id="orgVersionNotasInput"'));
  assert.ok(createVersionHtml.includes('data-action="submit-create-org-version"'));
  assert.ok(createVersionHtml.includes('Confirmar Nueva Versión'));
  assert.equal(assertZeroUuidExposure(createVersionHtml).compliant, true);

  // Anti-No-Op validation blocks exact unchanged draft before opening modal
  const unchangedCheck = validateNewOrganizacionVersionDraft(
    activeVer,
    {
      id_grupo_empresarial: iberometal.id_grupo_empresarial || '',
      nombre: activeVer.nombre,
      abreviacion: activeVer.abreviacion,
      rif: activeVer.rif || '',
      direccion_fiscal: activeVer.direccion_fiscal || '',
      notas_version: 'Sin cambios reales',
    },
    INITIAL_ORGANIZACIONES
  );
  assert.equal(unchangedCheck.valid, false);
  assert.equal(unchangedCheck.errorMessage, EXACT_NO_CHANGES_ORG_VERSION_MESSAGE);
});

test('Step 3.2 Certificate Resolution Modal: Spanish title, table invariants, strict defaults, and Zero-UUID', () => {
  const candidates: CertVersionOrgCandidate[] = [
    {
      id_certificado: '40000000-0000-0000-0000-000000000002',
      id_certificado_version: '41000000-0000-0000-0000-000000000002',
      id_organizacion: IBEROMETAL_ID,
      numero_certificado: 'FN-EMS-2025-002',
      norma_codigo: 'ISO 14001:2015',
      version_numero: 1,
      es_version_actual: false,
      id_organizacion_version: IBEROMETAL_V1_ID,
      deleted_at: null,
    },
    {
      id_certificado: '40000000-0000-0000-0000-000000000001',
      id_certificado_version: '41000000-0000-0000-0000-000000000001',
      id_organizacion: IBEROMETAL_ID,
      numero_certificado: 'FN-QMS-2026-001',
      norma_codigo: 'ISO 9001:2015',
      version_numero: 1,
      es_version_actual: true,
      id_organizacion_version: IBEROMETAL_V2_ID,
      deleted_at: null,
    },
  ];

  const items = buildDefaultCertVersionOrgResolutions(candidates, IBEROMETAL_V2_ID);
  assert.equal(items[0].action, 'MANTENER_ANTERIOR');
  assert.equal(items[1].action, 'VINCULAR_NUEVA');

  const modalHtml = renderOrganizacionCertResolutionModal(
    {
      isOpen: true,
      orgId: IBEROMETAL_ID,
      newOrgVersionId: IBEROMETAL_V3_ID,
      newOrgVersionNumero: 3,
      items,
      submitting: false,
      errorMessage: null,
    },
    'Iberometal Componentes S.A.'
  );

  assert.ok(
    modalHtml.includes(
      'Vincular versiones de certificado a la nueva versión de organización (v3)'
    )
  );
  assert.ok(
    modalHtml.includes(CERT_VERSION_ORG_ACTION_LABELS.MANTENER_ANTERIOR)
  );
  assert.ok(modalHtml.includes(CERT_VERSION_ORG_ACTION_LABELS.VINCULAR_NUEVA));
  assert.ok(modalHtml.includes('data-action="confirm-org-cert-resolution"'));
  assert.ok(modalHtml.includes('Confirmar Vinculación'));
  assert.match(
    modalHtml,
    /id="orgCertResSelect-41000000-0000-0000-0000-000000000002"[\s\S]*?<option value="MANTENER_ANTERIOR" selected>/i
  );
  assert.match(
    modalHtml,
    /id="orgCertResSelect-41000000-0000-0000-0000-000000000001"[\s\S]*?<option value="VINCULAR_NUEVA" selected>/i
  );

  assertTableInvariants(modalHtml, 'orgCertResolutionTable');
  assert.equal(assertZeroUuidExposure(modalHtml).compliant, true);
});

test('Step 3.2 ClientAccessView & RBAC: shows abreviacion in org labels/dropdown, enforces CLIENT read-only and denies AUDITOR Block 2', () => {
  const sampleAccess: ClientOrganizationAccessEntity = {
    id: '99000000-0000-0000-0000-000000000001',
    id_organizacion: IBEROMETAL_ID,
    id_usuario: CLIENT_PROFILE.id,
    estado: 'APPROVED',
    motivo_rechazo: null,
    fecha_solicitud: '2026-01-10T00:00:00Z',
    fecha_respuesta: '2026-01-11T00:00:00Z',
    aprobado_por: ADMIN_PROFILE.id,
    aprobado_por_nombre: ADMIN_PROFILE.nombre,
    deleted_at: null,
  };

  const clientAccessCreateHtml = renderClientAccessView({
    profile: ADMIN_PROFILE,
    state: {
      selectedAccessId: null,
      isCreating: true,
      prefillOrganizacionId: IBEROMETAL_ID,
    },
    accesses: [sampleAccess],
    organizaciones: INITIAL_ORGANIZACIONES,
    profiles: [ADMIN_PROFILE, CLIENT_PROFILE],
  });

  assert.ok(clientAccessCreateHtml.includes('[IBEROMETAL] Iberometal Componentes S.A.'));
  assert.ok(clientAccessCreateHtml.includes('[CYBERCLOUD] CyberCloud Solutions S.L.'));
  assert.equal(assertZeroUuidExposure(clientAccessCreateHtml).compliant, true);

  const clientAccessReadHtml = renderClientAccessView({
    profile: ADMIN_PROFILE,
    state: {
      selectedAccessId: sampleAccess.id,
    },
    accesses: [sampleAccess],
    organizaciones: INITIAL_ORGANIZACIONES,
    profiles: [ADMIN_PROFILE, CLIENT_PROFILE],
  });
  assert.ok(clientAccessReadHtml.includes('[IBEROMETAL] Iberometal Componentes S.A.'));
  assert.equal(assertZeroUuidExposure(clientAccessReadHtml).compliant, true);

  // CLIENT read-only org detail shows abreviacion, vN, version selector, and hides staff edit/create/accesos
  const certSummaries = buildCertSummaries(INITIAL_CERTIFICADOS_DETAILED);
  const clientOrgHtml = renderOrganizacionView({
    profile: CLIENT_PROFILE,
    state: buildOrgViewState({
      selectedOrganizacionId: IBEROMETAL_ID,
      selectedOrgVersionId: IBEROMETAL_V2_ID,
    }),
    organizaciones: [INITIAL_ORGANIZACIONES[0]],
    certificados: certSummaries,
    allCertificadosDetailed: INITIAL_CERTIFICADOS_DETAILED,
    conglomerados: INITIAL_CONGLOMERADOS,
  });

  assert.ok(clientOrgHtml.includes('IBEROMETAL'));
  assert.ok(clientOrgHtml.includes('Versión Actual · v2'));
  assert.ok(clientOrgHtml.includes('data-action="select-org-version"'));
  assert.equal(clientOrgHtml.includes('id="startEditOrgBtn"'), false);
  assert.equal(clientOrgHtml.includes('data-action="open-create-org-version"'), false);
  assert.equal(clientOrgHtml.includes('data-org-tab="accesos"'), false);
  assert.equal(assertZeroUuidExposure(clientOrgHtml).compliant, true);

  // AUDITOR cannot access Block 2 ('certificacion')
  assert.equal(canAccessRoute(AUDITOR_PROFILE, 'certificacion'), false);
});
