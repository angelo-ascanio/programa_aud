import test from 'node:test';
import assert from 'node:assert/strict';
import type { UserProfile } from '../lib/healthCheck';
import type { OrganizacionEntity } from '../lib/activeCertificates';
import type { ConglomeradoEntity } from '../lib/conglomeradoDomain';
import type {
  CertificadoDetailEntity,
  ContactoCertificadoEntity,
  ProcessEntity,
  ShiftEntity,
  SiteEntity,
} from '../lib/multisiteSampling';
import type { RequisitoLtree } from '../lib/extraDomain';
import type { ProgramacionAuditEntity } from '../lib/auditExecution';
import {
  resolveContactoDetailById,
  type ContactoDetailEntity,
} from '../lib/certificadoSubEntities';
import {
  getAllSeededNormaRequirements,
  resolveProcesoDetailById,
} from '../lib/procesoDomain';
import { resolveSitioDetailById } from '../lib/sitioDomain';
import { resolveTurnoDetailById } from '../lib/turnoDomain';
import { assertZeroUuidExposure } from '../lib/zeroUuid';
import type { CertificadoViewState } from '../lib/multisiteSampling';
import {
  renderCertificadoDetailPage,
} from './certificadoView';
import { renderContactoView } from './contactoView';
import { renderProcesoView } from './procesoView';
import { renderSitioView } from './sitioView';
import { renderTurnoView } from './turnoView';
import {
  createInitialShareModalState,
  renderShareModal,
} from './shareModalView';

function buildCertDetailState(
  selectedCertId: string,
  activeChildTab: 'contactos' | 'turnos' | 'procesos' | 'sitios'
): CertificadoViewState {
  return {
    selectedCertId,
    activeChildTab,
    query: '',
    selectedStandard: 'ALL',
    selectedStatus: 'ALL',
    selectedSectorIaf: 'ALL',
    viewMode: 'grid',
    sortColumn: null,
    sortDirection: 'none',
    isEditingAttributes: false,
    isCreating: false,
    isSidebarOpen: false,
    facetSelections: {},
  };
}

function isConfirmButtonDisabled(html: string): boolean {
  const match = html.match(/<button\b[^>]*id="confirmShareChildBtn"[^>]*>/i);
  assert.ok(match, 'Expected confirmShareChildBtn button element');
  const openTagWithoutClass = match[0].replace(/\bclass="[^"]*"/i, '');
  return /\bdisabled\b/i.test(openTagWithoutClass);
}

const ADMIN_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000001',
  nombre: 'Admin Demo',
  role: 'ADMIN',
  status: 'APPROVED',
  created_at: '2026-01-01T00:00:00Z',
};

const WORKER_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000002',
  nombre: 'Worker Demo',
  role: 'WORKER',
  status: 'APPROVED',
  created_at: '2026-01-01T00:00:00Z',
};

const CLIENT_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000003',
  nombre: 'Cliente Beta',
  role: 'CLIENT',
  status: 'APPROVED',
  created_at: '2026-01-01T00:00:00Z',
};

const AUDITOR_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000004',
  nombre: 'Auditor Demo',
  role: 'AUDITOR',
  status: 'APPROVED',
  created_at: '2026-01-01T00:00:00Z',
};

const GROUP_ALFA_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const GROUP_SOLO_ID = 'aaaaaaaa-0000-0000-0000-000000000002';

const ORG_A_ID = 'bbbbbbbb-0000-0000-0000-000000000001';
const ORG_B_ID = 'bbbbbbbb-0000-0000-0000-000000000002';
const ORG_SOLO_ID = 'bbbbbbbb-0000-0000-0000-000000000003';
const ORG_NO_GROUP_ID = 'bbbbbbbb-0000-0000-0000-000000000004';

const CERT_X_ID = 'cccccccc-0000-0000-0000-000000000001';
const CERT_Y_ID = 'cccccccc-0000-0000-0000-000000000002';
const CERT_Z_ID = 'cccccccc-0000-0000-0000-000000000003';
const CERT_SOLO_ID = 'cccccccc-0000-0000-0000-000000000004';
const CERT_NO_GROUP_ID = 'cccccccc-0000-0000-0000-000000000005';

const CONTACT_A_ID = 'dddddddd-0000-0000-0000-000000000001';
const CONTACT_B_ID = 'dddddddd-0000-0000-0000-000000000002';
const CONTACT_C_ID = 'dddddddd-0000-0000-0000-000000000003';
const CONTACT_DUP_Y_ID = 'dddddddd-0000-0000-0000-000000000004';

const LINK_CONTACT_A_Y_ID = 'eeeeeeee-0000-0000-0000-000000000001';
const TURNO_A_ID = 'ffffffff-0000-0000-0000-000000000001';
const TURNO_B_ID = 'ffffffff-0000-0000-0000-000000000002';
const LINK_TURNO_A_Y_ID = 'eeeeeeee-0000-0000-0000-000000000002';

const SITIO_X0_ID = '11111111-0000-0000-0000-000000000001';
const SITIO_Y0_ID = '11111111-0000-0000-0000-000000000002';
const SITIO_Z0_ID = '11111111-0000-0000-0000-000000000003';

const FIXTURE_CONGLOMERADOS: ConglomeradoEntity[] = [
  {
    id: GROUP_ALFA_ID,
    nombre: 'Conglomerado Alfa Industrial',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: GROUP_SOLO_ID,
    nombre: 'Conglomerado Unitario',
    created_at: '2026-01-01T00:00:00Z',
  },
];

const FIXTURE_ORGS: OrganizacionEntity[] = [
  {
    id: ORG_A_ID,
    id_grupo_empresarial: GROUP_ALFA_ID,
    nombre: 'Org Alfa Matriz',
    rif: 'J-11111111-1',
    direccion_fiscal: 'Av. Industrial 1',
  },
  {
    id: ORG_B_ID,
    id_grupo_empresarial: GROUP_ALFA_ID,
    nombre: 'Org Beta Filial',
    rif: 'J-22222222-2',
    direccion_fiscal: 'Av. Comercial 2',
  },
  {
    id: ORG_SOLO_ID,
    id_grupo_empresarial: GROUP_SOLO_ID,
    nombre: 'Org Solitaria S.A.',
    rif: 'J-33333333-3',
    direccion_fiscal: 'Calle Única 3',
  },
  {
    id: ORG_NO_GROUP_ID,
    id_grupo_empresarial: null,
    nombre: 'Org Sin Conglomerado',
    rif: 'J-44444444-4',
    direccion_fiscal: 'Av. Independiente 4',
  },
];

function buildFixtureCertificates(): CertificadoDetailEntity[] {
  const contactA: ContactoCertificadoEntity = {
    id: CONTACT_A_ID,
    id_certificado: CERT_X_ID,
    ownerCertId: CERT_X_ID,
    nombre: 'Ana María Gómez',
    cargo: 'Directora de Calidad',
    telefonos: [
      {
        id: '12121212-0000-0000-0000-000000000001',
        id_contacto: CONTACT_A_ID,
        telefono: '+58 412 5550101',
        tipo_telefono: 'OFICINA',
      },
    ],
    emails: [
      {
        id: '13131313-0000-0000-0000-000000000001',
        id_contacto: CONTACT_A_ID,
        email: 'ana.gomez@alfa.test',
        tipo_email: 'TRABAJO',
      },
    ],
    sharedTargets: [
      {
        linkId: LINK_CONTACT_A_Y_ID,
        targetCertId: CERT_Y_ID,
        targetCertNumero: 'FN-QMS-Y02',
        targetOrganizacionNombre: 'Org Beta Filial',
      },
    ],
  };

  const contactB: ContactoCertificadoEntity = {
    id: CONTACT_B_ID,
    id_certificado: CERT_X_ID,
    ownerCertId: CERT_X_ID,
    nombre: 'Bruno Mendoza',
    cargo: 'Coordinador Ambiental',
    telefonos: [],
    emails: [],
  };

  const contactC: ContactoCertificadoEntity = {
    id: CONTACT_C_ID,
    id_certificado: CERT_X_ID,
    ownerCertId: CERT_X_ID,
    nombre: 'Carla Rivas',
    cargo: 'Auditor Interno',
    telefonos: [],
    emails: [],
  };

  const sharedContactAInY: ContactoCertificadoEntity = {
    ...contactA,
    id_certificado: CERT_Y_ID,
    ownerCertId: CERT_X_ID,
    sharedFromCertId: CERT_X_ID,
    sharedFromCertLabel: 'FN-QMS-X01 · Org Alfa Matriz',
    sharedTargets: [
      {
        linkId: LINK_CONTACT_A_Y_ID,
        targetCertId: CERT_Y_ID,
        targetCertNumero: 'FN-QMS-Y02',
        targetOrganizacionNombre: 'Org Beta Filial',
      },
    ],
  };

  const dupNameContactInY: ContactoCertificadoEntity = {
    id: CONTACT_DUP_Y_ID,
    id_certificado: CERT_Y_ID,
    ownerCertId: CERT_Y_ID,
    nombre: 'Bruno Mendoza',
    cargo: 'Homónimo en Destino',
    telefonos: [],
    emails: [],
  };

  const turnoA: ShiftEntity = {
    id: TURNO_A_ID,
    hora_entrada: '07:00:00',
    hora_salida: '15:00:00',
    descripcion: 'Turno Matutino Planta',
    sitios_vinculados: ['Sede Principal Alfa'],
    ownerCertId: CERT_X_ID,
    sharedTargets: [
      {
        linkId: LINK_TURNO_A_Y_ID,
        targetCertId: CERT_Y_ID,
        targetCertNumero: 'FN-QMS-Y02',
        targetOrganizacionNombre: 'Org Beta Filial',
      },
    ],
  };

  const turnoB: ShiftEntity = {
    id: TURNO_B_ID,
    hora_entrada: '15:00:00',
    hora_salida: '23:00:00',
    descripcion: 'Turno Vespertino Planta',
    sitios_vinculados: ['Sede Principal Alfa'],
    ownerCertId: CERT_X_ID,
  };

  const sharedTurnoAInY: ShiftEntity = {
    ...turnoA,
    sitios_vinculados: ['Sucursal Beta Centro'],
    ownerCertId: CERT_X_ID,
    sharedFromCertId: CERT_X_ID,
    sharedFromCertLabel: 'FN-QMS-X01 · Org Alfa Matriz',
    sharedTargets: [
      {
        linkId: LINK_TURNO_A_Y_ID,
        targetCertId: CERT_Y_ID,
        targetCertNumero: 'FN-QMS-Y02',
        targetOrganizacionNombre: 'Org Beta Filial',
      },
    ],
  };

  return [
    {
      id: CERT_X_ID,
      numero_certificado: 'FN-QMS-X01',
      id_organizacion: ORG_A_ID,
      organizacion_nombre: 'Org Alfa Matriz',
      organizacion_rif: 'J-11111111-1',
      id_norma: 'e0000000-0000-0000-0000-000000009001',
      norma_codigo: 'ISO 9001:2015',
      norma_titulo: 'Calidad',
      esquema: 'SGC - Calidad',
      id_estatus: 'c0000000-0000-0000-0000-000000000001',
      estatus: 'ACTIVO',
      id_sector_iaf: 'd0000000-0000-0000-0000-000000000017',
      sector_iaf: 17,
      alcance: 'Producción industrial',
      multisitio: false,
      sitios: [
        {
          id: SITIO_X0_ID,
          numero_sitio: 0,
          nombre_sitio: 'Sede Principal Alfa',
          direccion_sitio: 'Av. Industrial 1',
          procesos_vinculados: [],
          turnos_vinculados: ['Turno Matutino Planta', 'Turno Vespertino Planta'],
          turnos_por_sitio: [
            {
              id: '21212121-0000-0000-0000-000000000001',
              id_sitio: SITIO_X0_ID,
              id_turno: TURNO_A_ID,
              descripcion: 'Turno Matutino Planta',
            },
            {
              id: '21212121-0000-0000-0000-000000000002',
              id_sitio: SITIO_X0_ID,
              id_turno: TURNO_B_ID,
              descripcion: 'Turno Vespertino Planta',
            },
          ],
        },
      ],
      procesos: [],
      turnos: [turnoA, turnoB],
      noAplicables: [],
      auditorias: [],
      fechas: [],
      contactos: [contactA, contactB, contactC],
    },
    {
      id: CERT_Y_ID,
      numero_certificado: 'FN-QMS-Y02',
      id_organizacion: ORG_B_ID,
      organizacion_nombre: 'Org Beta Filial',
      organizacion_rif: 'J-22222222-2',
      id_norma: 'e0000000-0000-0000-0000-000000014001',
      norma_codigo: 'ISO 14001:2015',
      norma_titulo: 'Ambiental',
      esquema: 'SGA - Ambiental',
      id_estatus: 'c0000000-0000-0000-0000-000000000001',
      estatus: 'ACTIVO',
      id_sector_iaf: 'd0000000-0000-0000-0000-000000000017',
      sector_iaf: 17,
      alcance: 'Operaciones comerciales',
      multisitio: false,
      sitios: [
        {
          id: SITIO_Y0_ID,
          numero_sitio: 0,
          nombre_sitio: 'Sucursal Beta Centro',
          direccion_sitio: 'Av. Comercial 2',
          procesos_vinculados: [],
          turnos_vinculados: ['Turno Matutino Planta'],
          turnos_por_sitio: [
            {
              id: '21212121-0000-0000-0000-000000000003',
              id_sitio: SITIO_Y0_ID,
              id_turno: TURNO_A_ID,
              descripcion: 'Turno Matutino Planta',
            },
          ],
        },
      ],
      procesos: [],
      turnos: [sharedTurnoAInY],
      noAplicables: [],
      auditorias: [],
      fechas: [],
      contactos: [sharedContactAInY, dupNameContactInY],
    },
    {
      id: CERT_Z_ID,
      numero_certificado: 'FN-QMS-Z03',
      id_organizacion: ORG_B_ID,
      organizacion_nombre: 'Org Beta Filial',
      organizacion_rif: 'J-22222222-2',
      id_norma: 'e0000000-0000-0000-0000-000000045001',
      norma_codigo: 'ISO 45001:2018',
      norma_titulo: 'SST',
      esquema: 'SST',
      id_estatus: 'c0000000-0000-0000-0000-000000000001',
      estatus: 'ACTIVO',
      id_sector_iaf: 'd0000000-0000-0000-0000-000000000017',
      sector_iaf: 17,
      alcance: 'Logística',
      multisitio: false,
      sitios: [
        {
          id: SITIO_Z0_ID,
          numero_sitio: 0,
          nombre_sitio: 'Centro Logístico Beta',
          direccion_sitio: 'Zona Sur 3',
          procesos_vinculados: [],
          turnos_vinculados: [],
        },
      ],
      procesos: [],
      turnos: [],
      noAplicables: [],
      auditorias: [],
      fechas: [],
      contactos: [],
    },
    {
      id: CERT_SOLO_ID,
      numero_certificado: 'FN-SOLO-001',
      id_organizacion: ORG_SOLO_ID,
      organizacion_nombre: 'Org Solitaria S.A.',
      organizacion_rif: 'J-33333333-3',
      id_norma: 'e0000000-0000-0000-0000-000000009001',
      norma_codigo: 'ISO 9001:2015',
      norma_titulo: 'Calidad',
      esquema: 'SGC - Calidad',
      id_estatus: 'c0000000-0000-0000-0000-000000000001',
      estatus: 'ACTIVO',
      id_sector_iaf: 'd0000000-0000-0000-0000-000000000017',
      sector_iaf: 17,
      alcance: 'Servicios únicos',
      multisitio: false,
      sitios: [],
      procesos: [],
      turnos: [turnoB],
      noAplicables: [],
      auditorias: [],
      fechas: [],
      contactos: [contactC],
    },
    {
      id: CERT_NO_GROUP_ID,
      numero_certificado: 'FN-NOGROUP-001',
      id_organizacion: ORG_NO_GROUP_ID,
      organizacion_nombre: 'Org Sin Conglomerado',
      organizacion_rif: 'J-44444444-4',
      id_norma: 'e0000000-0000-0000-0000-000000009001',
      norma_codigo: 'ISO 9001:2015',
      norma_titulo: 'Calidad',
      esquema: 'SGC - Calidad',
      id_estatus: 'c0000000-0000-0000-0000-000000000001',
      estatus: 'ACTIVO',
      id_sector_iaf: 'd0000000-0000-0000-0000-000000000017',
      sector_iaf: 17,
      alcance: 'Consultoría',
      multisitio: false,
      sitios: [],
      procesos: [],
      turnos: [turnoB],
      noAplicables: [],
      auditorias: [],
      fechas: [],
      contactos: [contactC],
    },
  ];
}

function assertTableStructuralInvariants(html: string, tableId: string): void {
  const tableRegex = new RegExp(
    `<table[^>]*data-resizable-table="${tableId}"[^>]*>[\\s\\S]*?<\\/table>`,
    'i'
  );
  const tableMatch = html.match(tableRegex);
  assert.ok(tableMatch, `Expected table ${tableId} to render`);
  const tableHtml = tableMatch[0];
  assert.ok(tableHtml.includes('table-fixed'), `Table ${tableId} must use table-fixed`);

  const tbodyMatch = tableHtml.match(/<tbody[\s\S]*?<\/tbody>/i);
  assert.ok(tbodyMatch, `Table ${tableId} must include tbody`);
  assert.equal(
    tbodyMatch[0].includes('<button'),
    false,
    `Table ${tableId} tbody must contain 0 <button> elements`
  );

  const colgroupMatch = tableHtml.match(/<colgroup>([\s\S]*?)<\/colgroup>/i);
  assert.ok(colgroupMatch, `Table ${tableId} must include colgroup`);
  const pctMatches = Array.from(colgroupMatch[1].matchAll(/width:\s*([0-9.]+)%/g)).map(
    (m) => Number(m[1])
  );
  assert.ok(pctMatches.length > 0, `Table ${tableId} colgroup must declare % widths`);
  const totalPct = pctMatches.reduce((acc, n) => acc + n, 0);
  assert.ok(
    Math.abs(totalPct - 100) <= 0.15,
    `Table ${tableId} colgroup widths must sum to 100%, got ${totalPct}`
  );
}

test('Step 3.1 RBAC & table invariants: Compartir button appears only for ADMIN/WORKER in Contactos & Turnos with 0 buttons in tbody and colgroup=100%', () => {
  const certs = buildFixtureCertificates();

  for (const profile of [ADMIN_PROFILE, WORKER_PROFILE]) {
    for (const tab of ['contactos', 'turnos'] as const) {
      const html = renderCertificadoDetailPage({
        cert: certs[0],
        profile,
        state: buildCertDetailState(certs[0].id, tab),
        allCertificates: certs,
        organizaciones: FIXTURE_ORGS,
        conglomerados: FIXTURE_CONGLOMERADOS,
      });

      assert.ok(
        html.includes('data-action="open-share-child-modal"'),
        `${profile.role} must render Compartir button on ${tab}`
      );
      assert.ok(
        html.includes(`data-share-kind="${tab === 'contactos' ? 'contacto' : 'turno'}"`),
        `Compartir button must specify share-kind for ${tab}`
      );
      assert.ok(
        html.includes('Compartido'),
        `Owner cert ${tab} should display subtle non-interactive Compartido indicator`
      );

      assertTableStructuralInvariants(html, `cert-tab-${tab}`);
      assert.equal(assertZeroUuidExposure(html).compliant, true);
    }
  }

  for (const profile of [CLIENT_PROFILE, AUDITOR_PROFILE]) {
    for (const tab of ['contactos', 'turnos'] as const) {
      const html = renderCertificadoDetailPage({
        cert: certs[1],
        profile,
        state: buildCertDetailState(certs[1].id, tab),
        allCertificates: certs.filter((c) => c.id_organizacion === ORG_B_ID),
        organizaciones: FIXTURE_ORGS,
        conglomerados: FIXTURE_CONGLOMERADOS,
      });

      assert.equal(
        html.includes('data-action="open-share-child-modal"'),
        false,
        `${profile.role} must NOT render Compartir button on ${tab}`
      );
      assert.equal(
        html.includes('data-action="unlink-shared-child"'),
        false,
        `${profile.role} must NOT render Desvincular button on ${tab}`
      );
      assertTableStructuralInvariants(html, `cert-tab-${tab}`);
      assert.equal(assertZeroUuidExposure(html).compliant, true);
    }
  }
});

test('Step 3.1 Level-2 CLIENT isolation in contactoView.ts: hides Org A & Cert X strings while ADMIN/WORKER see origin and Desvincular', () => {
  const certs = buildFixtureCertificates();
  const orgBOnlyCerts = certs.filter((c) => c.id_organizacion === ORG_B_ID);

  const clientContacto = resolveContactoDetailById({
    contactoId: CONTACT_A_ID,
    certificates: orgBOnlyCerts,
    activeCertContextId: CERT_Y_ID,
  });
  assert.ok(clientContacto);

  const clientHtml = renderContactoView({
    profile: CLIENT_PROFILE,
    state: {
      selectedContactoId: CONTACT_A_ID,
      originatingCertId: CERT_Y_ID,
      activeChildTab: 'telefonos',
      isEditingAttributes: false,
    },
    contacto: clientContacto,
    certificates: orgBOnlyCerts,
    authorizedClientOrgIds: [ORG_B_ID],
  });

  assert.ok(clientHtml.includes('Contacto compartido dentro del conglomerado'));
  assert.ok(clientHtml.includes('Org Beta Filial'));
  assert.ok(clientHtml.includes('FN-QMS-Y02'));
  assert.equal(clientHtml.includes('Org Alfa Matriz'), false);
  assert.equal(clientHtml.includes('J-11111111-1'), false);
  assert.equal(clientHtml.includes('FN-QMS-X01'), false);
  assert.equal(clientHtml.includes('data-action="unlink-shared-child"'), false);
  assert.equal(assertZeroUuidExposure(clientHtml).compliant, true);

  // Even if someone passes full cert list to contactoView, Level-2 check still hides Org A & Cert X from CLIENT!
  const clientEvenWithFullCertsHtml = renderContactoView({
    profile: CLIENT_PROFILE,
    state: {
      selectedContactoId: CONTACT_A_ID,
      originatingCertId: CERT_Y_ID,
      activeChildTab: 'telefonos',
      isEditingAttributes: false,
    },
    contacto: clientContacto,
    certificates: certs,
    authorizedClientOrgIds: [ORG_B_ID],
  });
  assert.ok(
    clientEvenWithFullCertsHtml.includes('Contacto compartido dentro del conglomerado')
  );
  assert.equal(clientEvenWithFullCertsHtml.includes('Org Alfa Matriz'), false);
  assert.equal(clientEvenWithFullCertsHtml.includes('FN-QMS-X01'), false);
  assert.equal(clientEvenWithFullCertsHtml.includes('data-action="unlink-shared-child"'), false);

  const auditorHtml = renderContactoView({
    profile: AUDITOR_PROFILE,
    state: {
      selectedContactoId: CONTACT_A_ID,
      originatingCertId: CERT_Y_ID,
      activeChildTab: 'telefonos',
      isEditingAttributes: false,
    },
    contacto: resolveContactoDetailById({
      contactoId: CONTACT_A_ID,
      certificates: certs,
      activeCertContextId: CERT_Y_ID,
    }),
    certificates: certs,
  });
  assert.ok(auditorHtml.includes('Compartido desde FN-QMS-X01'));
  assert.equal(auditorHtml.includes('data-action="unlink-shared-child"'), false);
  assert.equal(assertZeroUuidExposure(auditorHtml).compliant, true);

  for (const staffProfile of [ADMIN_PROFILE, WORKER_PROFILE]) {
    const resolvedStaffContacto: ContactoDetailEntity | null = resolveContactoDetailById({
      contactoId: CONTACT_A_ID,
      certificates: certs,
      activeCertContextId: CERT_Y_ID,
    });
    assert.ok(resolvedStaffContacto);

    const staffHtml = renderContactoView({
      profile: staffProfile,
      state: {
        selectedContactoId: CONTACT_A_ID,
        originatingCertId: CERT_Y_ID,
        activeChildTab: 'telefonos',
        isEditingAttributes: false,
      },
      contacto: resolvedStaffContacto,
      certificates: certs,
    });

    assert.ok(staffHtml.includes('Compartido desde FN-QMS-X01'));
    assert.ok(staffHtml.includes('Desvincular de este certificado'));
    assert.ok(staffHtml.includes('data-action="unlink-shared-child"'));
    assert.ok(staffHtml.includes('data-share-table="contacto_certificado_compartido"'));
    assert.equal(assertZeroUuidExposure(staffHtml).compliant, true);
  }
});

test('Step 3.1 turnoView.ts: shows Compartido desde / Desvincular for staff, hides Unlink for AUDITOR, and isolates cross-org CLIENT', () => {
  const certs = buildFixtureCertificates();
  const orgBOnlyCerts = certs.filter((c) => c.id_organizacion === ORG_B_ID);

  const staffTurno = resolveTurnoDetailById({
    turnoId: TURNO_A_ID,
    originatingSitioId: null,
    certificates: certs,
    programacionAudits: [],
  });
  assert.ok(staffTurno);

  for (const staffProfile of [ADMIN_PROFILE, WORKER_PROFILE]) {
    const staffHtml = renderTurnoView({
      profile: staffProfile,
      state: {
        selectedTurnoId: TURNO_A_ID,
        originatingSitioId: null,
        prefillCertId: CERT_Y_ID,
        activeChildTab: 'sitios',
        isEditingAttributes: false,
      },
      turno: staffTurno,
      activeCertId: CERT_Y_ID,
      certificates: certs,
    });

    assert.ok(staffHtml.includes('Compartido desde FN-QMS-X01'));
    assert.ok(staffHtml.includes('Desvincular de este certificado'));
    assert.ok(staffHtml.includes('data-action="unlink-shared-child"'));
    assert.ok(staffHtml.includes('data-share-table="turno_certificado_compartido"'));
    assert.equal(assertZeroUuidExposure(staffHtml).compliant, true);
  }

  const auditorHtml = renderTurnoView({
    profile: AUDITOR_PROFILE,
    state: {
      selectedTurnoId: TURNO_A_ID,
      originatingSitioId: null,
      prefillCertId: CERT_Y_ID,
      activeChildTab: 'sitios',
      isEditingAttributes: false,
    },
    turno: staffTurno,
    activeCertId: CERT_Y_ID,
    certificates: certs,
  });
  assert.ok(auditorHtml.includes('Compartido desde FN-QMS-X01'));
  assert.equal(auditorHtml.includes('data-action="unlink-shared-child"'), false);

  const clientTurno = resolveTurnoDetailById({
    turnoId: TURNO_A_ID,
    originatingSitioId: null,
    certificates: orgBOnlyCerts,
    programacionAudits: [],
  });
  assert.ok(clientTurno);

  const clientHtml = renderTurnoView({
    profile: CLIENT_PROFILE,
    state: {
      selectedTurnoId: TURNO_A_ID,
      originatingSitioId: null,
      prefillCertId: CERT_Y_ID,
      activeChildTab: 'sitios',
      isEditingAttributes: false,
    },
    turno: clientTurno,
    activeCertId: CERT_Y_ID,
    certificates: certs,
    authorizedClientOrgIds: [ORG_B_ID],
  });
  assert.ok(clientHtml.includes('Turno compartido dentro del conglomerado'));
  assert.equal(clientHtml.includes('Org Alfa Matriz'), false);
  assert.equal(clientHtml.includes('Sede Principal Alfa'), false);
  assert.equal(clientHtml.includes('FN-QMS-X01'), false);
  assert.equal(clientHtml.includes('data-action="unlink-shared-child"'), false);
  assert.equal(assertZeroUuidExposure(clientHtml).compliant, true);
});

test('Step 3.1 renderShareModal: selective picking A+B without C, duplicate conflict alert, Turno auto-link checkbox, empty states & RBAC', () => {
  const certs = buildFixtureCertificates();

  // 1. Selective Contacto picking (A and C selected, B unselected) targeting Cert Z
  const modalContactoState = {
    ...createInitialShareModalState('contacto', CERT_X_ID, [CONTACT_A_ID, CONTACT_C_ID]),
    selectedTargetCertIds: [CERT_Z_ID],
  };
  const modalContactoHtml = renderShareModal({
    profile: ADMIN_PROFILE,
    modalState: modalContactoState,
    certificates: certs,
    organizaciones: FIXTURE_ORGS,
    conglomerados: FIXTURE_CONGLOMERADOS,
  });

  assert.ok(modalContactoHtml.includes('Compartir Contactos de FN-QMS-X01'));
  assert.ok(modalContactoHtml.includes('Conglomerado Alfa Industrial'));
  assert.ok(modalContactoHtml.includes('2 de 3 seleccionados'));
  assert.ok(modalContactoHtml.includes('FN-QMS-Y02'));
  assert.ok(modalContactoHtml.includes('FN-QMS-Z03'));
  assert.equal(modalContactoHtml.includes(`data-cert-id="${CERT_X_ID}"`), false);
  assert.ok(modalContactoHtml.includes('Parcialmente vinculado'));
  assert.ok(modalContactoHtml.includes('id="confirmShareChildBtn"'));
  assert.equal(
    isConfirmButtonDisabled(modalContactoHtml),
    false,
    'Confirm button must be enabled when valid selective contacts and eligible target are checked'
  );
  assert.equal(assertZeroUuidExposure(modalContactoHtml).compliant, true);

  // 2. Duplicate Contact Name conflict triggers blocking alert & disables confirm button
  const conflictHtml = renderShareModal({
    profile: WORKER_PROFILE,
    modalState: {
      ...createInitialShareModalState('contacto', CERT_X_ID, [CONTACT_B_ID]),
      selectedTargetCertIds: [CERT_Y_ID],
    },
    certificates: certs,
    organizaciones: FIXTURE_ORGS,
    conglomerados: FIXTURE_CONGLOMERADOS,
  });
  assert.ok(conflictHtml.includes('role="alert"'));
  assert.ok(conflictHtml.includes('Conflicto de nombre'));
  assert.equal(
    isConfirmButtonDisabled(conflictHtml),
    true,
    'Confirm button must remain disabled when DUPLICATE_CONTACT_NAME conflict exists'
  );
  assert.equal(assertZeroUuidExposure(conflictHtml).compliant, true);

  // 3. Turno modal renders pre-checked Sitio auto-link checkbox
  const turnoModalHtml = renderShareModal({
    profile: ADMIN_PROFILE,
    modalState: {
      ...createInitialShareModalState('turno', CERT_X_ID, [TURNO_B_ID]),
      selectedTargetCertIds: [CERT_Z_ID],
    },
    certificates: certs,
    organizaciones: FIXTURE_ORGS,
    conglomerados: FIXTURE_CONGLOMERADOS,
  });
  assert.ok(turnoModalHtml.includes('Compartir Turnos de FN-QMS-X01'));
  assert.ok(turnoModalHtml.includes('id="shareAutoLinkSitesCheckbox"'));
  assert.ok(
    /id="shareAutoLinkSitesCheckbox"[\s\S]*?\bchecked\b/.test(turnoModalHtml),
    'Auto-link Sitio 0 checkbox should be pre-checked by default'
  );
  assert.ok(
    turnoModalHtml.includes(
      'Asignar automáticamente a las sedes activas (Sitio 0 / sucursales) de los certificados destino'
    )
  );
  assert.equal(isConfirmButtonDisabled(turnoModalHtml), false);
  assert.equal(assertZeroUuidExposure(turnoModalHtml).compliant, true);

  // 4. Single-certificate Conglomerado renders friendly empty state
  const singleCertGroupHtml = renderShareModal({
    profile: ADMIN_PROFILE,
    modalState: createInitialShareModalState('contacto', CERT_SOLO_ID),
    certificates: certs,
    organizaciones: FIXTURE_ORGS,
    conglomerados: FIXTURE_CONGLOMERADOS,
  });
  assert.ok(
    singleCertGroupHtml.includes('Sin certificados destino disponibles en el conglomerado')
  );
  assert.ok(
    singleCertGroupHtml.includes('Conglomerado Unitario')
  );
  assert.equal(isConfirmButtonDisabled(singleCertGroupHtml), true);
  assert.equal(assertZeroUuidExposure(singleCertGroupHtml).compliant, true);

  // 5. Organization without Conglomerado renders friendly unavailable notice
  const noGroupHtml = renderShareModal({
    profile: ADMIN_PROFILE,
    modalState: createInitialShareModalState('turno', CERT_NO_GROUP_ID),
    certificates: certs,
    organizaciones: FIXTURE_ORGS,
    conglomerados: FIXTURE_CONGLOMERADOS,
  });
  assert.ok(noGroupHtml.includes('Compartición no disponible'));
  assert.equal(isConfirmButtonDisabled(noGroupHtml), true);
  assert.equal(assertZeroUuidExposure(noGroupHtml).compliant, true);

  // 6. RBAC: CLIENT & AUDITOR never mount the Share modal
  for (const deniedProfile of [CLIENT_PROFILE, AUDITOR_PROFILE]) {
    assert.equal(
      renderShareModal({
        profile: deniedProfile,
        modalState: modalContactoState,
        certificates: certs,
        organizaciones: FIXTURE_ORGS,
        conglomerados: FIXTURE_CONGLOMERADOS,
      }),
      ''
    );
  }
});

// ---------------------------------------------------------------------------
// Step 3.2 — Procesos & Sitios Share Modal, Cross-Standard Clause Resolution,
// Site Cascade, Scoped Detail Views, RBAC & Level-2 CLIENT Isolation
// ---------------------------------------------------------------------------

const NORMA_9001_ID = 'e0000000-0000-0000-0000-000000009001';
const NORMA_14001_ID = 'e0000000-0000-0000-0000-000000014001';
const CERT_X2_SAME_NORM_ID = 'cccccccc-0000-0000-0000-000000000006';

const PROC_OPS_9001_ID = '44444444-0000-0000-0000-000000000001';
const PROC_SHARED_14001_ID = '44444444-0000-0000-0000-000000000002';
const LINK_PROC_Y_ID = 'eeeeeeee-0000-0000-0000-000000000003';
const SITIO_X1_SHARED_ID = '11111111-0000-0000-0000-000000000004';
const LINK_SITIO_X1_Y_ID = 'eeeeeeee-0000-0000-0000-000000000004';

function buildStep32ExtendedCatalog(): RequisitoLtree[] {
  const base = getAllSeededNormaRequirements();
  const extra: RequisitoLtree[] = [
    {
      id: '91000000-0000-0000-0000-000000000044',
      id_norma: NORMA_9001_ID,
      norma_codigo: 'ISO 9001:2015',
      id_requisito_padre: 'f0000000-0000-0000-0000-000000000004',
      codigo: '4.4',
      es_obligatorio: true,
      titulo: 'Sistema de gestión de la calidad y sus procesos',
      ruta_materializada: '4.4_4',
      nivel: 2,
      es_padre: true,
    },
    {
      id: '91000000-0000-0000-0000-000000000441',
      id_norma: NORMA_9001_ID,
      norma_codigo: 'ISO 9001:2015',
      id_requisito_padre: '91000000-0000-0000-0000-000000000044',
      codigo: '4.4.1',
      es_obligatorio: true,
      titulo: 'Determinación de los procesos necesarios para el SGC',
      ruta_materializada: '4.4_4.4_4_1',
      nivel: 3,
      es_padre: false,
    },
    {
      id: '91000000-0000-0000-0000-000000000442',
      id_norma: NORMA_9001_ID,
      norma_codigo: 'ISO 9001:2015',
      id_requisito_padre: '91000000-0000-0000-0000-000000000044',
      codigo: '4.4.2',
      es_obligatorio: true,
      titulo: 'Conservación de información documentada sobre procesos',
      ruta_materializada: '4.4_4.4_4_2',
      nivel: 3,
      es_padre: false,
    },
    {
      id: '91000000-0000-0000-0000-000000000082',
      id_norma: NORMA_9001_ID,
      norma_codigo: 'ISO 9001:2015',
      id_requisito_padre: 'f0000000-0000-0000-0000-000000000008',
      codigo: '8.2',
      es_obligatorio: true,
      titulo: 'Requisitos para los productos y servicios',
      ruta_materializada: '8.8_2',
      nivel: 2,
      es_padre: false,
    },
    {
      id: '91000000-0000-0000-0000-000000000832',
      id_norma: NORMA_9001_ID,
      norma_codigo: 'ISO 9001:2015',
      id_requisito_padre: 'f0000000-0000-0000-0000-000000000083',
      codigo: '8.3.2',
      es_obligatorio: true,
      titulo: 'Planificación del diseño y desarrollo',
      ruta_materializada: '8.8_3.8_3_2',
      nivel: 3,
      es_padre: false,
    },
    {
      id: '14000000-0000-0000-0000-000000000044',
      id_norma: NORMA_14001_ID,
      norma_codigo: 'ISO 14001:2015',
      id_requisito_padre: null,
      codigo: '4.4',
      es_obligatorio: true,
      titulo: 'Sistema de gestión ambiental',
      ruta_materializada: '14001.4.4_4',
      nivel: 2,
      es_padre: false,
    },
    {
      id: '14000000-0000-0000-0000-000000000082',
      id_norma: NORMA_14001_ID,
      norma_codigo: 'ISO 14001:2015',
      id_requisito_padre: null,
      codigo: '8.2',
      es_obligatorio: true,
      titulo: 'Preparación y respuesta ante emergencias',
      ruta_materializada: '14001.8.8_2',
      nivel: 2,
      es_padre: false,
    },
  ];
  return [...base, ...extra];
}

function buildStep32FixtureCertificates(): CertificadoDetailEntity[] {
  const baseCerts = buildFixtureCertificates();
  const certX = baseCerts[0];
  const certY = baseCerts[1];

  const procOps9001: ProcessEntity = {
    id: PROC_OPS_9001_ID,
    id_certificado: CERT_X_ID,
    ownerCertId: CERT_X_ID,
    nombre_proceso: 'Manufactura y Control Operacional',
    tipo: 'Medular',
    responsable: 'Ing. Marcos León',
    clausulas_cubiertas: ['4.1', '4.4.1', '4.4.2', '8.2', '8.3.2'],
  };

  const procSharedOwner: ProcessEntity = {
    id: PROC_SHARED_14001_ID,
    id_certificado: CERT_X_ID,
    ownerCertId: CERT_X_ID,
    nombre_proceso: 'Gestión Estratégica Corporativa',
    tipo: 'Estratégico',
    responsable: 'Dra. Elena Paz',
    clausulas_cubiertas: ['4.1', '8.2'],
    requisitos_by_certificado: {
      [CERT_X_ID]: {
        clausulas_cubiertas: ['4.1', '8.2'],
      },
      [CERT_Y_ID]: {
        clausulas_cubiertas: ['4.4', '6.1'],
      },
    },
    sharedTargets: [
      {
        linkId: LINK_PROC_Y_ID,
        targetCertId: CERT_Y_ID,
        targetCertNumero: 'FN-QMS-Y02',
        targetOrganizacionNombre: 'Org Beta Filial',
      },
    ],
  };

  const procSharedInY: ProcessEntity = {
    ...procSharedOwner,
    id_certificado: CERT_Y_ID,
    ownerCertId: CERT_X_ID,
    sharedFromCertId: CERT_X_ID,
    sharedFromCertLabel: 'FN-QMS-X01 · Org Alfa Matriz',
    clausulas_cubiertas: ['4.4', '6.1'],
    requisitos_detalle: [
      {
        codigo: '4.4',
        titulo: 'Sistema de gestión ambiental',
        es_obligatorio: true,
      },
      {
        codigo: '6.1',
        titulo: 'Acciones para abordar riesgos y oportunidades',
        es_obligatorio: true,
      },
    ],
  };

  const siteX0: SiteEntity = {
    ...certX.sitios[0],
    ownerCertId: CERT_X_ID,
    procesos_vinculados: [procOps9001.nombre_proceso],
    procesos_por_sitio: [
      {
        id: '31313131-0000-0000-0000-000000000001',
        id_sitio: SITIO_X0_ID,
        id_proceso: PROC_OPS_9001_ID,
        id_certificado: CERT_X_ID,
        nombre_proceso: procOps9001.nombre_proceso,
        tipo: procOps9001.tipo,
      },
    ],
  };

  const siteX1SharedOwner: SiteEntity = {
    id: SITIO_X1_SHARED_ID,
    id_certificado: CERT_X_ID,
    ownerCertId: CERT_X_ID,
    numero_sitio: 1,
    nombre_sitio: 'Planta Compartida Alfa',
    direccion_sitio: 'Zona Industrial Sur Km 4',
    personal_count: 42,
    procesos_vinculados: [procOps9001.nombre_proceso],
    turnos_vinculados: ['Turno Matutino Planta'],
    procesos_por_sitio: [
      {
        id: '31313131-0000-0000-0000-000000000002',
        id_sitio: SITIO_X1_SHARED_ID,
        id_proceso: PROC_OPS_9001_ID,
        id_certificado: CERT_X_ID,
        nombre_proceso: procOps9001.nombre_proceso,
        tipo: procOps9001.tipo,
      },
      {
        id: '31313131-0000-0000-0000-000000000003',
        id_sitio: SITIO_X1_SHARED_ID,
        id_proceso: PROC_SHARED_14001_ID,
        id_certificado: CERT_Y_ID,
        nombre_proceso: procSharedInY.nombre_proceso,
        tipo: procSharedInY.tipo,
      },
    ],
    sharedTargets: [
      {
        linkId: LINK_SITIO_X1_Y_ID,
        targetCertId: CERT_Y_ID,
        targetCertNumero: 'FN-QMS-Y02',
        targetOrganizacionNombre: 'Org Beta Filial',
      },
    ],
  };

  const siteX1InY: SiteEntity = {
    ...siteX1SharedOwner,
    id_certificado: CERT_Y_ID,
    ownerCertId: CERT_X_ID,
    sharedFromCertId: CERT_X_ID,
    sharedFromCertLabel: 'FN-QMS-X01 · Org Alfa Matriz',
    numero_sitio: 2,
    procesos_vinculados: [procSharedInY.nombre_proceso],
  };

  const certX2SameNorm: CertificadoDetailEntity = {
    ...certX,
    id: CERT_X2_SAME_NORM_ID,
    numero_certificado: 'FN-QMS-X02',
    id_organizacion: ORG_B_ID,
    organizacion_nombre: 'Org Beta Filial',
    organizacion_rif: 'J-22222222-2',
    sitios: [],
    procesos: [],
    turnos: [],
    contactos: [],
    noAplicables: [],
  };

  return [
    {
      ...certX,
      sitios: [siteX0, siteX1SharedOwner],
      procesos: [procOps9001, procSharedOwner],
    },
    {
      ...certY,
      sitios: [...certY.sitios, siteX1InY],
      procesos: [procSharedInY],
    },
    ...baseCerts.slice(2),
    certX2SameNorm,
  ];
}

test('Step 3.2 RBAC & table invariants: Compartir button in Procesos & Sitios tabs only for ADMIN/WORKER with 0 buttons in tbody and colgroup=100%', () => {
  const certs = buildStep32FixtureCertificates();

  for (const profile of [ADMIN_PROFILE, WORKER_PROFILE]) {
    for (const tab of ['procesos', 'sitios'] as const) {
      const html = renderCertificadoDetailPage({
        cert: certs[0],
        profile,
        state: buildCertDetailState(certs[0].id, tab),
        allCertificates: certs,
        organizaciones: FIXTURE_ORGS,
        conglomerados: FIXTURE_CONGLOMERADOS,
      });

      assert.ok(
        html.includes('data-action="open-share-child-modal"'),
        `${profile.role} must render Compartir button on ${tab}`
      );
      assert.ok(
        html.includes(`data-share-kind="${tab === 'procesos' ? 'proceso' : 'sitio'}"`),
        `Compartir button must specify share-kind for ${tab}`
      );
      assert.ok(
        html.includes('Compartido'),
        `Owner cert ${tab} should display subtle non-interactive Compartido span chip`
      );
      assertTableStructuralInvariants(html, `cert-tab-${tab}`);
      assert.equal(assertZeroUuidExposure(html).compliant, true);
    }
  }

  for (const profile of [CLIENT_PROFILE, AUDITOR_PROFILE]) {
    for (const tab of ['procesos', 'sitios'] as const) {
      const html = renderCertificadoDetailPage({
        cert: certs[1],
        profile,
        state: buildCertDetailState(certs[1].id, tab),
        allCertificates: certs.filter((c) => c.id_organizacion === ORG_B_ID),
        organizaciones: FIXTURE_ORGS,
        conglomerados: FIXTURE_CONGLOMERADOS,
      });

      assert.equal(
        html.includes('data-action="open-share-child-modal"'),
        false,
        `${profile.role} must NOT render Compartir button on ${tab}`
      );
      assert.equal(
        html.includes('data-action="unlink-shared-child"'),
        false,
        `${profile.role} must NOT render Desvincular button on ${tab}`
      );
      assertTableStructuralInvariants(html, `cert-tab-${tab}`);
      assert.equal(assertZeroUuidExposure(html).compliant, true);
    }
  }
});

test('Step 1.3 renderShareModal (proceso mode): binary same-norm vs different-norm preview, toggle-share-proceso-reqs checkbox, ISO 4.3 note, and zero manual collision selectors', () => {
  const catalog = buildStep32ExtendedCatalog();
  const certs = buildStep32FixtureCertificates();

  // 1. Different-standard ISO 9001 -> ISO 14001: clear empty process notice, NO manual collision dropdowns
  const diffNormHtml = renderShareModal({
    profile: ADMIN_PROFILE,
    modalState: {
      ...createInitialShareModalState('proceso', CERT_X_ID, [PROC_OPS_9001_ID]),
      selectedTargetCertIds: [CERT_Y_ID],
    },
    certificates: certs,
    organizaciones: FIXTURE_ORGS,
    conglomerados: FIXTURE_CONGLOMERADOS,
    requirementsCatalog: catalog,
  });

  assert.ok(diffNormHtml.includes('Compartir Procesos de FN-QMS-X01'));
  assert.ok(diffNormHtml.includes('Norma distinta (ISO 9001:2015 → ISO 14001:2015)'));
  assert.ok(
    diffNormHtml.includes(
      'Los certificados pertenecen a normas distintas. Se compartirá únicamente el proceso vacío (0 requisitos); cada norma mantiene sus cláusulas de forma independiente.'
    )
  );
  assert.equal(diffNormHtml.includes('change-share-clause-manual'), false);
  assert.equal(diffNormHtml.includes('toggle-share-clause-entry'), false);
  assert.equal(diffNormHtml.includes('Colisión semántica detectada'), false);
  assert.equal(diffNormHtml.includes('toggle-share-proceso-reqs'), false);
  assert.equal(isConfirmButtonDisabled(diffNormHtml), false);
  assert.equal(assertZeroUuidExposure(diffNormHtml).compliant, true);

  // 2. Same-standard checked (default): joint process + applicable clauses + active sync
  const sameNormCheckedHtml = renderShareModal({
    profile: WORKER_PROFILE,
    modalState: {
      ...createInitialShareModalState('proceso', CERT_X_ID, [PROC_OPS_9001_ID]),
      selectedTargetCertIds: [CERT_X2_SAME_NORM_ID],
      shareProcesoWithRequisitos: true,
      syncRequisitosSameNorm: true,
    },
    certificates: certs,
    organizaciones: FIXTURE_ORGS,
    conglomerados: FIXTURE_CONGLOMERADOS,
    requirementsCatalog: catalog,
  });
  assert.ok(sameNormCheckedHtml.includes('Misma norma (ISO 9001:2015)'));
  assert.ok(
    sameNormCheckedHtml.includes(
      'Compartir también las cláusulas normativas y mantenerlas sincronizadas (misma norma)'
    )
  );
  assert.ok(
    /<input[^>]*data-action="toggle-share-proceso-reqs"[^>]*checked/i.test(
      sameNormCheckedHtml
    ),
    'toggle-share-proceso-reqs must be checked by default'
  );
  assert.ok(
    sameNormCheckedHtml.includes('junto con') &&
      sameNormCheckedHtml.includes('sincronización activa')
  );
  assert.equal(sameNormCheckedHtml.includes('change-share-clause-manual'), false);
  assert.equal(assertZeroUuidExposure(sameNormCheckedHtml).compliant, true);

  // 3. Same-standard unchecked: process-only independent sharing
  const sameNormUncheckedHtml = renderShareModal({
    profile: WORKER_PROFILE,
    modalState: {
      ...createInitialShareModalState('proceso', CERT_X_ID, [PROC_OPS_9001_ID]),
      selectedTargetCertIds: [CERT_X2_SAME_NORM_ID],
      shareProcesoWithRequisitos: false,
      syncRequisitosSameNorm: false,
    },
    certificates: certs,
    organizaciones: FIXTURE_ORGS,
    conglomerados: FIXTURE_CONGLOMERADOS,
    requirementsCatalog: catalog,
  });
  assert.ok(
    sameNormUncheckedHtml.includes(
      'Se compartirá solo el proceso vacío; requisitos independientes (podrá sincronizar cláusulas luego).'
    )
  );
  assert.equal(assertZeroUuidExposure(sameNormUncheckedHtml).compliant, true);

  // 4. Same-standard WITH ISO 4.3 exclusion (8.3) omits 8.3.2 from shared clauses and reports ISO 4.3 note
  const certsWithIso43 = certs.map((c) =>
    c.id === CERT_X2_SAME_NORM_ID
      ? {
          ...c,
          noAplicables: [
            {
              id: 'na-83-0001',
              id_certificado: CERT_X2_SAME_NORM_ID,
              id_requisito: 'f0000000-0000-0000-0000-000000000083',
              requisito_codigo: '8.3',
              requisito_titulo: 'Diseño y desarrollo de los productos y servicios',
              ruta_materializada: '8.8_3',
              justificacion: 'Sin actividad de diseño en filial.',
            },
          ],
        }
      : c
  );
  const iso43BlockedHtml = renderShareModal({
    profile: ADMIN_PROFILE,
    modalState: {
      ...createInitialShareModalState('proceso', CERT_X_ID, [PROC_OPS_9001_ID]),
      selectedTargetCertIds: [CERT_X2_SAME_NORM_ID],
    },
    certificates: certsWithIso43,
    organizaciones: FIXTURE_ORGS,
    conglomerados: FIXTURE_CONGLOMERADOS,
    requirementsCatalog: catalog,
  });
  assert.ok(iso43BlockedHtml.includes('omitida(s) por exclusión ISO 4.3'));
  assert.ok(iso43BlockedHtml.includes('8.3.2'));
  assert.equal(assertZeroUuidExposure(iso43BlockedHtml).compliant, true);
});

test('Step 1.3 renderShareModal (sitio mode): resolves non-colliding numero_sitio, pre-checks Turnos, keeps Procesos opt-in, and renders binary norm rule preview on process cascade', () => {
  const catalog = buildStep32ExtendedCatalog();
  const certs = buildStep32FixtureCertificates();

  // Default state: Sitio 0 -> Cert Y (already has Sitio 0 + Sitio 2 -> assigns Sede #1)
  const sitioModalDefaultHtml = renderShareModal({
    profile: ADMIN_PROFILE,
    modalState: {
      ...createInitialShareModalState('sitio', CERT_X_ID, [SITIO_X0_ID]),
      selectedTargetCertIds: [CERT_Y_ID],
    },
    certificates: certs,
    organizaciones: FIXTURE_ORGS,
    conglomerados: FIXTURE_CONGLOMERADOS,
    requirementsCatalog: catalog,
  });

  assert.ok(sitioModalDefaultHtml.includes('Compartir Sitios de FN-QMS-X01'));
  assert.ok(sitioModalDefaultHtml.includes('Sitio 0 (HQ)'));
  assert.ok(sitioModalDefaultHtml.includes('N° Sede asignado en destino'));
  assert.ok(sitioModalDefaultHtml.includes('Sede #1'));
  assert.ok(sitioModalDefaultHtml.includes('Propagar Turnos del Sitio'));
  assert.ok(sitioModalDefaultHtml.includes('Propagar Procesos del Sitio'));
  assert.ok(
    /<input[^>]*data-action="toggle-share-site-turno"[^>]*checked/i.test(sitioModalDefaultHtml),
    'Linked site Turno must be pre-checked in Step 3 cascade'
  );
  const procCheckboxMatch = sitioModalDefaultHtml.match(
    /<input[^>]*data-action="toggle-share-site-proceso"[^>]*>/i
  );
  assert.ok(procCheckboxMatch, 'Expected site cascade proceso checkbox');
  assert.equal(
    /\bchecked\b/i.test(procCheckboxMatch[0]),
    false,
    'Site cascade Proceso must be UNCHECKED by default'
  );
  assert.equal(
    sitioModalDefaultHtml.includes('Regla de Requisitos por Norma (Cascada de Procesos)'),
    false,
    'Process norm rule preview should only appear once a site process is opted in'
  );
  assert.equal(isConfirmButtonDisabled(sitioModalDefaultHtml), false);
  assert.equal(assertZeroUuidExposure(sitioModalDefaultHtml).compliant, true);

  // Opt-in process cascade targeting Cert Y (ISO 14001) shows different-norm independent notice without collision matrix
  const sitioModalWithProcHtml = renderShareModal({
    profile: ADMIN_PROFILE,
    modalState: {
      ...createInitialShareModalState('sitio', CERT_X_ID, [SITIO_X0_ID]),
      selectedTargetCertIds: [CERT_Y_ID],
      siteCascadeProcesoIdsBySite: {
        [SITIO_X0_ID]: [PROC_OPS_9001_ID],
      },
    },
    certificates: certs,
    organizaciones: FIXTURE_ORGS,
    conglomerados: FIXTURE_CONGLOMERADOS,
    requirementsCatalog: catalog,
  });

  assert.ok(
    sitioModalWithProcHtml.includes('Regla de Requisitos por Norma (Cascada de Procesos)')
  );
  assert.ok(sitioModalWithProcHtml.includes('Norma distinta (ISO 9001:2015 → ISO 14001:2015)'));
  assert.ok(
    sitioModalWithProcHtml.includes(
      'Se compartirá únicamente el proceso vacío (0 requisitos)'
    )
  );
  assert.equal(sitioModalWithProcHtml.includes('Colisión semántica detectada'), false);
  assert.equal(sitioModalWithProcHtml.includes('change-share-clause-manual'), false);
  assert.equal(assertZeroUuidExposure(sitioModalWithProcHtml).compliant, true);
});

test('Step 3.2 procesoView.ts & sitioView.ts: scope to activeCertId, enforce Level-2 CLIENT isolation, and guard Sitio unlink when audits exist', () => {
  const catalog = buildStep32ExtendedCatalog();
  const certs = buildStep32FixtureCertificates();
  const orgBOnlyCerts = certs.filter((c) => c.id_organizacion === ORG_B_ID);

  // 1. procesoView scoped to Cert Y (ISO 14001) shows 4.4 / 6.1 and hides Cert X's 4.1 / 8.2
  const scopedProcY = resolveProcesoDetailById({
    procesoId: PROC_SHARED_14001_ID,
    activeCertId: CERT_Y_ID,
    certificates: certs,
    programacionAudits: [],
    phase5Findings: [],
    requirementsCatalog: catalog,
  });
  assert.ok(scopedProcY);

  const staffProcHtml = renderProcesoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedProcesoId: PROC_SHARED_14001_ID,
      activeChildTab: 'requisitos',
      prefillCertId: CERT_Y_ID,
      isEditingAttributes: false,
    },
    proceso: scopedProcY,
    activeCertId: CERT_Y_ID,
    certificates: certs,
    requirementsCatalog: catalog,
  });

  assert.ok(staffProcHtml.includes('FN-QMS-Y02'));
  assert.ok(staffProcHtml.includes('ISO 14001:2015'));
  assert.ok(staffProcHtml.includes('Sistema de gestión ambiental'));
  assert.equal(staffProcHtml.includes('Requisitos para los productos y servicios'), false);
  assert.ok(staffProcHtml.includes('Compartido desde FN-QMS-X01'));
  assert.ok(staffProcHtml.includes('Desvincular de este certificado'));
  assert.ok(staffProcHtml.includes('data-share-table="proceso_certificado_compartido"'));
  assert.equal(assertZeroUuidExposure(staffProcHtml).compliant, true);

  // Level-2 CLIENT isolation on procesoView hides Org Alfa Matriz & FN-QMS-X01
  const clientProcHtml = renderProcesoView({
    profile: CLIENT_PROFILE,
    state: {
      selectedProcesoId: PROC_SHARED_14001_ID,
      activeChildTab: 'requisitos',
      prefillCertId: CERT_Y_ID,
      isEditingAttributes: false,
    },
    proceso: resolveProcesoDetailById({
      procesoId: PROC_SHARED_14001_ID,
      activeCertId: CERT_Y_ID,
      certificates: orgBOnlyCerts,
      programacionAudits: [],
      phase5Findings: [],
      requirementsCatalog: catalog,
    }),
    activeCertId: CERT_Y_ID,
    certificates: certs,
    authorizedClientOrgIds: [ORG_B_ID],
    requirementsCatalog: catalog,
  });

  assert.ok(clientProcHtml.includes('Proceso compartido dentro del conglomerado'));
  assert.equal(clientProcHtml.includes('FN-QMS-X01'), false);
  assert.equal(clientProcHtml.includes('Org Alfa Matriz'), false);
  assert.equal(clientProcHtml.includes('data-action="unlink-shared-child"'), false);
  assert.equal(assertZeroUuidExposure(clientProcHtml).compliant, true);

  // Owner cert shows shared count badge without Desvincular button
  const ownerProcHtml = renderProcesoView({
    profile: WORKER_PROFILE,
    state: {
      selectedProcesoId: PROC_SHARED_14001_ID,
      activeChildTab: 'requisitos',
      prefillCertId: CERT_X_ID,
      isEditingAttributes: false,
    },
    proceso: resolveProcesoDetailById({
      procesoId: PROC_SHARED_14001_ID,
      activeCertId: CERT_X_ID,
      certificates: certs,
      programacionAudits: [],
      phase5Findings: [],
      requirementsCatalog: catalog,
    }),
    activeCertId: CERT_X_ID,
    certificates: certs,
    requirementsCatalog: catalog,
  });
  assert.ok(ownerProcHtml.includes('Compartido con 1 certificado del conglomerado'));
  assert.equal(ownerProcHtml.includes('data-action="unlink-shared-child"'), false);

  // 2. sitioView scoped to Cert Y shows numero_sitio=2, filters Cert X processes out, and enforces audit-blocking on Desvincular
  const scopedSitioYNoAudit = resolveSitioDetailById({
    sitioId: SITIO_X1_SHARED_ID,
    activeCertId: CERT_Y_ID,
    certificates: certs,
    programacionAudits: [],
  });
  assert.ok(scopedSitioYNoAudit);

  const staffSitioEnabledHtml = renderSitioView({
    profile: ADMIN_PROFILE,
    state: {
      selectedSitioId: SITIO_X1_SHARED_ID,
      activeChildTab: 'procesos',
      prefillCertId: CERT_Y_ID,
      isEditingAttributes: false,
    },
    sitio: scopedSitioYNoAudit,
    activeCertId: CERT_Y_ID,
    certificates: certs,
    programacionAudits: [],
  });

  assert.ok(staffSitioEnabledHtml.includes('Sitio 2 — Planta Compartida Alfa'));
  assert.ok(staffSitioEnabledHtml.includes('Gestión Estratégica Corporativa'));
  assert.equal(
    staffSitioEnabledHtml.includes('Manufactura y Control Operacional'),
    false,
    'sitioView must only display processes linked within activeCertId (Cert Y)'
  );
  assert.ok(staffSitioEnabledHtml.includes('Compartido desde FN-QMS-X01'));
  const enabledUnlinkBtn = staffSitioEnabledHtml.match(
    /<button[^>]*data-action="unlink-shared-child"[^>]*>/i
  );
  assert.ok(enabledUnlinkBtn);
  assert.equal(/\bdisabled\b/i.test(enabledUnlinkBtn[0]), false);
  assert.equal(assertZeroUuidExposure(staffSitioEnabledHtml).compliant, true);

  // With an active audit on Sitio in Cert Y -> Desvincular button must render disabled
  const activeAuditInY: ProgramacionAuditEntity = {
    id: '99999999-0000-0000-0000-000000000001',
    codigo_auditoria: 'AUD-Y-2026-01',
    id_certificado: CERT_Y_ID,
    numero_certificado: 'FN-QMS-Y02',
    organizacion_nombre: 'Org Beta Filial',
    organizacion_rif: 'J-22222222-2',
    norma_codigo: 'ISO 14001:2015',
    tipo_auditoria: 'Vigilancia 1',
    metodologia: 'Presencial',
    estado_ciclo: 'Programada',
    estatus: 'Programada',
    fecha_inicio: '2026-08-10',
    fecha_fin: '2026-08-11',
    fecha_programacion: '2026-08-10',
    sitiosMuestreo: [
      {
        id: '88888888-0000-0000-0000-000000000001',
        id_sitio: SITIO_X1_SHARED_ID,
        numero_sitio: 2,
        nombre_sitio: 'Planta Compartida Alfa',
        fecha_asignada: '2026-08-10',
      },
    ],
    matrizNormativa: [],
    sitios_alcance: ['Planta Compartida Alfa'],
  };

  const scopedSitioYWithAudit = resolveSitioDetailById({
    sitioId: SITIO_X1_SHARED_ID,
    activeCertId: CERT_Y_ID,
    certificates: certs,
    programacionAudits: [activeAuditInY],
  });
  const staffSitioBlockedHtml = renderSitioView({
    profile: ADMIN_PROFILE,
    state: {
      selectedSitioId: SITIO_X1_SHARED_ID,
      activeChildTab: 'procesos',
      prefillCertId: CERT_Y_ID,
      isEditingAttributes: false,
    },
    sitio: scopedSitioYWithAudit,
    activeCertId: CERT_Y_ID,
    certificates: certs,
    programacionAudits: [activeAuditInY],
  });
  const disabledUnlinkBtn = staffSitioBlockedHtml.match(
    /<button[^>]*data-action="unlink-shared-child"[^>]*>/i
  );
  assert.ok(disabledUnlinkBtn);
  assert.ok(
    /\bdisabled\b/i.test(disabledUnlinkBtn[0]),
    'Desvincular must be disabled when active sitios_por_auditoria exist on activeCertId'
  );

  // Level-2 CLIENT isolation on sitioView
  const clientSitioHtml = renderSitioView({
    profile: CLIENT_PROFILE,
    state: {
      selectedSitioId: SITIO_X1_SHARED_ID,
      activeChildTab: 'procesos',
      prefillCertId: CERT_Y_ID,
      isEditingAttributes: false,
    },
    sitio: resolveSitioDetailById({
      sitioId: SITIO_X1_SHARED_ID,
      activeCertId: CERT_Y_ID,
      certificates: orgBOnlyCerts,
      programacionAudits: [],
    }),
    activeCertId: CERT_Y_ID,
    certificates: certs,
    authorizedClientOrgIds: [ORG_B_ID],
  });
  assert.ok(clientSitioHtml.includes('Sitio compartido dentro del conglomerado'));
  assert.equal(clientSitioHtml.includes('FN-QMS-X01'), false);
  assert.equal(clientSitioHtml.includes('Org Alfa Matriz'), false);
  assert.equal(clientSitioHtml.includes('data-action="unlink-shared-child"'), false);
  assert.equal(assertZeroUuidExposure(clientSitioHtml).compliant, true);
});

