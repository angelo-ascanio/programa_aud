import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertZeroUuidExposure,
  containsRawUuid,
} from './zeroUuid';
import type { OrganizacionEntity } from './activeCertificates';
import type { ConglomeradoEntity } from './conglomeradoDomain';
import type { UserProfile } from './healthCheck';
import type { CertificadoDetailEntity } from './multisiteSampling';
import {
  canUnlinkContactoFromCert,
  canUnlinkTurnoFromCert,
  getEligibleShareTargetCertificates,
  planShareContactos,
  planShareTurnos,
} from './certificadoShareDomain';
import {
  canArchiveContacto,
  resolveContactoDetailById,
  resolveEmailDetailById,
  resolveTelefonoDetailById,
} from './certificadoSubEntities';
import { canArchiveTurno, resolveTurnoDetailById } from './turnoDomain';
import {
  PROTECTED_SOFT_DELETE_TABLES,
  computeLocalArchiveDependencySummary,
  getArchiveTableDisplayLabel,
  getDomainArchivedTables,
} from './archiveGovernance';

const GROUP_1_ID = '20000000-0000-0000-0000-000000000101';
const GROUP_2_ID = '20000000-0000-0000-0000-000000000102';

const ORG_A_ID = '30000000-0000-0000-0000-000000000101';
const ORG_B_ID = '30000000-0000-0000-0000-000000000102';
const ORG_OTHER_GROUP_ID = '30000000-0000-0000-0000-000000000103';
const ORG_NO_GROUP_ID = '30000000-0000-0000-0000-000000000104';

const CERT_X_ID = '40000000-0000-0000-0000-000000000101';
const CERT_Y_ID = '40000000-0000-0000-0000-000000000102';
const CERT_Z_ORG_A_ID = '40000000-0000-0000-0000-000000000103';
const CERT_OTHER_GROUP_ID = '40000000-0000-0000-0000-000000000104';
const CERT_NO_GROUP_ID = '40000000-0000-0000-0000-000000000105';

const SITE_X0_ID = '50000000-0000-0000-0000-000000000101';
const SITE_Y0_ID = '50000000-0000-0000-0000-000000000102';
const SITE_Y1_ID = '50000000-0000-0000-0000-000000000103';
const SITE_Z0_ID = '50000000-0000-0000-0000-000000000104';

const TURNO_1_ID = '70000000-0000-0000-0000-000000000101';
const TURNO_2_ID = '70000000-0000-0000-0000-000000000102';

const CONTACT_A_ID = '81000000-0000-0000-0000-000000000101';
const CONTACT_B_ID = '81000000-0000-0000-0000-000000000102';
const CONTACT_C_ID = '81000000-0000-0000-0000-000000000103';
const CONTACT_Y_EXISTING_ID = '81000000-0000-0000-0000-000000000104';

const TEL_A_ID = '82000000-0000-0000-0000-000000000101';
const EMAIL_A_ID = '83000000-0000-0000-0000-000000000101';

const ADMIN_PROFILE: UserProfile = {
  id: '11111111-1111-1111-1111-111111111111',
  nombre: 'Administrador Sistema',
  role: 'ADMIN',
  status: 'APPROVED',
};

const WORKER_PROFILE: UserProfile = {
  id: '11111111-1111-1111-1111-111111111112',
  nombre: 'Coordinador Técnico',
  role: 'WORKER',
  status: 'APPROVED',
};

const CLIENT_PROFILE: UserProfile = {
  id: '11111111-1111-1111-1111-111111111113',
  nombre: 'Cliente Org A',
  role: 'CLIENT',
  status: 'APPROVED',
};

const AUDITOR_PROFILE: UserProfile = {
  id: '11111111-1111-1111-1111-111111111114',
  nombre: 'Auditor Externo',
  role: 'AUDITOR',
  status: 'APPROVED',
};

const PENDING_PROFILE: UserProfile = {
  ...WORKER_PROFILE,
  status: 'PENDING',
};

const CONGLOMERADOS: ConglomeradoEntity[] = [
  {
    id: GROUP_1_ID,
    codigo_grupo: 'CONG-01',
    nombre: 'Holding Industrial Norte',
    es_individual_auto: false,
    notas: null,
  },
  {
    id: GROUP_2_ID,
    codigo_grupo: 'CONG-02',
    nombre: 'Grupo Alimentario Sur',
    es_individual_auto: true,
    notas: null,
  },
];

const ORGANIZACIONES: OrganizacionEntity[] = [
  {
    id: ORG_A_ID,
    id_grupo_empresarial: GROUP_1_ID,
    nombre: 'Manufacturas Alpha S.A.',
    rif: 'J-30111222-0',
  },
  {
    id: ORG_B_ID,
    id_grupo_empresarial: GROUP_1_ID,
    nombre: 'Logística Beta C.A.',
    rif: 'J-30333444-1',
  },
  {
    id: ORG_OTHER_GROUP_ID,
    id_grupo_empresarial: GROUP_2_ID,
    nombre: 'Alimentos Gamma S.A.',
    rif: 'J-30555666-2',
  },
  {
    id: ORG_NO_GROUP_ID,
    id_grupo_empresarial: undefined,
    nombre: 'Empresa Independiente Sin Grupo',
    rif: 'J-30777888-3',
  },
];

function makeBaseCert(overrides: Partial<CertificadoDetailEntity>): CertificadoDetailEntity {
  return {
    id: CERT_X_ID,
    numero_certificado: 'CERT-X-9001',
    id_organizacion: ORG_A_ID,
    organizacion_nombre: 'Manufacturas Alpha S.A.',
    organizacion_rif: 'J-30111222-0',
    id_norma: 'a0000000-0000-0000-0000-000000000001',
    norma_codigo: 'ISO 9001:2015',
    norma_titulo: 'Gestión de la Calidad',
    esquema: 'ISO 9001',
    id_estatus: 'b0000000-0000-0000-0000-000000000001',
    estatus: 'Activo',
    id_sector_iaf: 'd0000000-0000-0000-0000-000000000017',
    sector_iaf: 17,
    sector_iaf_descripcion: 'Metales',
    id_subsector_iaf: 'e0000000-0000-0000-0000-000000000001',
    fecha_emision: '2026-01-01',
    fecha_vencimiento: '2029-01-01',
    alcance: 'Fabricación y despacho',
    multisitio: false,
    sitios: [],
    procesos: [],
    turnos: [],
    noAplicables: [],
    auditorias: [],
    fechas: [],
    contactos: [],
    ...overrides,
  };
}

function buildScenarioCertificates(): CertificadoDetailEntity[] {
  const certX = makeBaseCert({
    id: CERT_X_ID,
    numero_certificado: 'CERT-X-9001',
    id_organizacion: ORG_A_ID,
    organizacion_nombre: 'Manufacturas Alpha S.A.',
    sitios: [
      {
        id: SITE_X0_ID,
        id_certificado: CERT_X_ID,
        numero_sitio: 0,
        nombre_sitio: 'Sede Central',
        direccion_sitio: 'Av. Principal 100',
        turnos_vinculados: ['Turno Diurno'],
      },
    ],
    turnos: [
      {
        id: TURNO_1_ID,
        hora_entrada: '07:00:00',
        hora_salida: '15:00:00',
        descripcion: 'Turno Diurno',
        sitios_vinculados: ['Sede Central'],
        ownerCertId: CERT_X_ID,
      },
      {
        id: TURNO_2_ID,
        hora_entrada: '22:00:00',
        hora_salida: '06:00:00',
        descripcion: 'Turno Nocturno',
        sitios_vinculados: ['Sede Central'],
        ownerCertId: CERT_X_ID,
      },
    ],
    contactos: [
      {
        id: CONTACT_A_ID,
        id_certificado: CERT_X_ID,
        nombre: 'A',
        cargo: 'Gerente de Calidad',
        ownerCertId: CERT_X_ID,
        telefonos: [
          {
            id: TEL_A_ID,
            id_contacto: CONTACT_A_ID,
            telefono: '+58 241 5550101',
            tipo_telefono: 'Oficina',
          },
        ],
        emails: [
          {
            id: EMAIL_A_ID,
            id_contacto: CONTACT_A_ID,
            email: 'contacto.a@alpha.test',
            tipo_email: 'Trabajo',
          },
        ],
      },
      {
        id: CONTACT_B_ID,
        id_certificado: CERT_X_ID,
        nombre: 'B',
        cargo: 'Coordinador Ambiental',
        ownerCertId: CERT_X_ID,
        telefonos: [],
        emails: [],
      },
      {
        id: CONTACT_C_ID,
        id_certificado: CERT_X_ID,
        nombre: 'C',
        cargo: 'Representante Exclusivo X',
        ownerCertId: CERT_X_ID,
        telefonos: [],
        emails: [],
      },
    ],
  });

  const certY = makeBaseCert({
    id: CERT_Y_ID,
    numero_certificado: 'CERT-Y-14001',
    id_organizacion: ORG_B_ID,
    organizacion_nombre: 'Logística Beta C.A.',
    norma_codigo: 'ISO 14001:2015',
    norma_titulo: 'Gestión Ambiental',
    multisitio: true,
    sitios: [
      {
        id: SITE_Y0_ID,
        id_certificado: CERT_Y_ID,
        numero_sitio: 0,
        nombre_sitio: 'Sede Central',
        direccion_sitio: 'Zona Franca Nave 1',
        turnos_vinculados: [],
      },
      {
        id: SITE_Y1_ID,
        id_certificado: CERT_Y_ID,
        numero_sitio: 1,
        nombre_sitio: 'Almacén Puerto',
        direccion_sitio: 'Muelle 4',
        turnos_vinculados: [],
      },
    ],
    contactos: [
      {
        id: CONTACT_Y_EXISTING_ID,
        id_certificado: CERT_Y_ID,
        nombre: 'Contacto Previo Y',
        cargo: 'Enlace',
        ownerCertId: CERT_Y_ID,
        telefonos: [],
        emails: [],
      },
    ],
  });

  const certZOrgA = makeBaseCert({
    id: CERT_Z_ORG_A_ID,
    numero_certificado: 'CERT-Z-45001',
    id_organizacion: ORG_A_ID,
    organizacion_nombre: 'Manufacturas Alpha S.A.',
    norma_codigo: 'ISO 45001:2018',
    norma_titulo: 'Seguridad y Salud',
    sitios: [
      {
        id: SITE_Z0_ID,
        id_certificado: CERT_Z_ORG_A_ID,
        numero_sitio: 0,
        nombre_sitio: 'Planta Matriz Alpha',
        direccion_sitio: 'Av. Principal 100',
      },
    ],
  });

  const certOtherGroup = makeBaseCert({
    id: CERT_OTHER_GROUP_ID,
    numero_certificado: 'CERT-GAMMA-22000',
    id_organizacion: ORG_OTHER_GROUP_ID,
    organizacion_nombre: 'Alimentos Gamma S.A.',
    norma_codigo: 'ISO 22000:2018',
  });

  const certNoGroup = makeBaseCert({
    id: CERT_NO_GROUP_ID,
    numero_certificado: 'CERT-INDEP-9001',
    id_organizacion: ORG_NO_GROUP_ID,
    organizacion_nombre: 'Empresa Independiente Sin Grupo',
  });

  return [certX, certY, certZOrgA, certOtherGroup, certNoGroup];
}

test('Step 2.1 (1): strict conglomerate eligibility includes same grupo_empresarial and rejects other conglomerates/self', () => {
  const allCertificates = buildScenarioCertificates();
  const sourceCert = allCertificates[0];

  const result = getEligibleShareTargetCertificates({
    sourceCert,
    allCertificates,
    organizaciones: ORGANIZACIONES,
    conglomerados: CONGLOMERADOS,
    profile: ADMIN_PROFILE,
  });

  assert.equal(result.missingConglomeradoReason, null);
  assert.equal(result.sourceGroupId, GROUP_1_ID);
  assert.equal(result.sourceGroupNombre, 'Holding Industrial Norte');
  assert.deepEqual(
    result.targets.map((t) => t.id).sort(),
    [CERT_Y_ID, CERT_Z_ORG_A_ID].sort()
  );
  assert.equal(
    result.targets.some((t) => t.id === CERT_X_ID || t.id === CERT_OTHER_GROUP_ID || t.id === CERT_NO_GROUP_ID),
    false
  );
});

test('Step 2.1 (2): organization without active conglomerado returns empty targets and Zero-UUID reason', () => {
  const allCertificates = buildScenarioCertificates();
  const noGroupCert = allCertificates[4];

  const result = getEligibleShareTargetCertificates({
    sourceCert: noGroupCert,
    allCertificates,
    organizaciones: ORGANIZACIONES,
    conglomerados: CONGLOMERADOS,
    profile: WORKER_PROFILE,
  });

  assert.deepEqual(result.targets, []);
  assert.equal(result.sourceGroupId, null);
  assert.ok(result.missingConglomeradoReason);
  assert.equal(containsRawUuid(result.missingConglomeradoReason), false);
});

test('Step 2.1 (3): CLIENT Level-2 RBAC isolation hides unauthorized sibling Org B certificates while exposing authorized Org A certificates', () => {
  const allCertificates = buildScenarioCertificates();
  const certX = allCertificates[0];

  const clientResult = getEligibleShareTargetCertificates({
    sourceCert: certX,
    allCertificates,
    organizaciones: ORGANIZACIONES,
    conglomerados: CONGLOMERADOS,
    profile: CLIENT_PROFILE,
    authorizedClientOrgIds: [ORG_A_ID],
  });

  assert.deepEqual(
    clientResult.targets.map((t) => t.id),
    [CERT_Z_ORG_A_ID]
  );
  assert.equal(clientResult.targets.some((t) => t.id_organizacion === ORG_B_ID), false);

  const auditorResult = getEligibleShareTargetCertificates({
    sourceCert: certX,
    allCertificates,
    organizaciones: ORGANIZACIONES,
    conglomerados: CONGLOMERADOS,
    profile: AUDITOR_PROFILE,
  });
  assert.deepEqual(auditorResult.targets, []);

  const pendingResult = getEligibleShareTargetCertificates({
    sourceCert: certX,
    allCertificates,
    organizaciones: ORGANIZACIONES,
    conglomerados: CONGLOMERADOS,
    profile: PENDING_PROFILE,
  });
  assert.deepEqual(pendingResult.targets, []);
  assert.ok(pendingResult.missingConglomeradoReason);
  assert.equal(containsRawUuid(pendingResult.missingConglomeradoReason), false);
});

test('Step 2.1 (4): literal future_changes.txt scenario — contacts A, B, C in X -> share A and B with Y keeping C exclusive in X', () => {
  const allCertificates = buildScenarioCertificates();
  const certX = allCertificates[0];

  const plan = planShareContactos({
    sourceCert: certX,
    selectedContactoIds: [CONTACT_A_ID, CONTACT_B_ID],
    targetCertIds: [CERT_Y_ID],
    allCertificates,
    organizaciones: ORGANIZACIONES,
    conglomerados: CONGLOMERADOS,
    profile: WORKER_PROFILE,
  });

  assert.equal(plan.isExecutable, true);
  assert.deepEqual(plan.validationErrors, []);
  assert.deepEqual(plan.conflicts, []);
  assert.deepEqual(plan.alreadyShared, []);
  assert.equal(plan.toCreateLinks.length, 2);
  assert.deepEqual(
    plan.toCreateLinks.map((l) => ({
      id_contacto: l.id_contacto,
      nombre: l.contacto_nombre,
      id_certificado: l.id_certificado,
      owner_cert_id: l.owner_cert_id,
    })),
    [
      {
        id_contacto: CONTACT_A_ID,
        nombre: 'A',
        id_certificado: CERT_Y_ID,
        owner_cert_id: CERT_X_ID,
      },
      {
        id_contacto: CONTACT_B_ID,
        nombre: 'B',
        id_certificado: CERT_Y_ID,
        owner_cert_id: CERT_X_ID,
      },
    ]
  );
  assert.equal(
    plan.toCreateLinks.some((l) => l.id_contacto === CONTACT_C_ID),
    false
  );
});

test('Step 2.1 (5): planShareContactos blocks empty selections, invalid UUIDs, and cross-conglomerate targets with Zero-UUID errors', () => {
  const allCertificates = buildScenarioCertificates();
  const certX = allCertificates[0];

  const emptyPlan = planShareContactos({
    sourceCert: certX,
    selectedContactoIds: [],
    targetCertIds: [],
    allCertificates,
    organizaciones: ORGANIZACIONES,
    conglomerados: CONGLOMERADOS,
  });
  assert.equal(emptyPlan.isExecutable, false);
  assert.equal(emptyPlan.validationErrors.length, 2);
  for (const err of emptyPlan.validationErrors) {
    assert.equal(containsRawUuid(err), false);
  }

  const crossGroupPlan = planShareContactos({
    sourceCert: certX,
    selectedContactoIds: [CONTACT_A_ID],
    targetCertIds: [CERT_OTHER_GROUP_ID],
    allCertificates,
    organizaciones: ORGANIZACIONES,
    conglomerados: CONGLOMERADOS,
  });
  assert.equal(crossGroupPlan.isExecutable, false);
  assert.equal(crossGroupPlan.toCreateLinks.length, 0);
  assert.ok(crossGroupPlan.validationErrors.length >= 1);
  assert.equal(
    crossGroupPlan.validationErrors.every((msg) => !containsRawUuid(msg)),
    true
  );

  const badUuidPlan = planShareContactos({
    sourceCert: certX,
    selectedContactoIds: ['not-a-uuid'],
    targetCertIds: [CERT_Y_ID],
    allCertificates,
    organizaciones: ORGANIZACIONES,
    conglomerados: CONGLOMERADOS,
  });
  assert.equal(badUuidPlan.isExecutable, false);
  assert.equal(
    badUuidPlan.validationErrors.every((msg) => !containsRawUuid(msg)),
    true
  );
});

test('Step 2.1 (6): self-share prevention blocks sourceCert target and excludes ownerCertId when sharing from a receiving certificate', () => {
  const allCertificates = buildScenarioCertificates();
  const certX = allCertificates[0];

  const selfPlan = planShareContactos({
    sourceCert: certX,
    selectedContactoIds: [CONTACT_A_ID],
    targetCertIds: [CERT_X_ID],
    allCertificates,
    organizaciones: ORGANIZACIONES,
    conglomerados: CONGLOMERADOS,
  });
  assert.equal(selfPlan.isExecutable, false);
  assert.equal(selfPlan.toCreateLinks.length, 0);
  assert.equal(selfPlan.conflicts.length, 1);
  assert.equal(selfPlan.conflicts[0].kind, 'OWNER_SELF_SHARE');
  assert.equal(containsRawUuid(selfPlan.conflicts[0].message), false);

  // Sharing from Y back toward [X, Z]: X is ownerCertId of CONTACT_A_ID -> excluded cleanly; Z is planned
  const certYWithSharedA = makeBaseCert({
    ...allCertificates[1],
    contactos: [
      ...allCertificates[1].contactos,
      {
        ...certX.contactos[0],
        id_certificado: CERT_Y_ID,
        ownerCertId: CERT_X_ID,
        sharedFromCertId: CERT_X_ID,
      },
    ],
  });
  const updatedAll = [certX, certYWithSharedA, ...allCertificates.slice(2)];
  const relayPlan = planShareContactos({
    sourceCert: certYWithSharedA,
    selectedContactoIds: [CONTACT_A_ID],
    targetCertIds: [CERT_X_ID, CERT_Z_ORG_A_ID],
    allCertificates: updatedAll,
    organizaciones: ORGANIZACIONES,
    conglomerados: CONGLOMERADOS,
  });

  assert.equal(relayPlan.isExecutable, true);
  assert.equal(relayPlan.skippedOwnerTargets.length, 1);
  assert.equal(relayPlan.skippedOwnerTargets[0].id_certificado, CERT_X_ID);
  assert.equal(containsRawUuid(relayPlan.skippedOwnerTargets[0].message), false);
  assert.deepEqual(
    relayPlan.toCreateLinks.map((l) => l.id_certificado),
    [CERT_Z_ORG_A_ID]
  );
});

test('Step 2.1 (7): idempotent duplicate detection marks ALREADY_SHARED without errors and omits existing links', () => {
  const allCertificates = buildScenarioCertificates();
  const certX = allCertificates[0];

  const plan = planShareContactos({
    sourceCert: certX,
    selectedContactoIds: [CONTACT_A_ID, CONTACT_B_ID],
    targetCertIds: [CERT_Y_ID],
    allCertificates,
    organizaciones: ORGANIZACIONES,
    conglomerados: CONGLOMERADOS,
    existingShareLinks: [
      {
        id: '90000000-0000-0000-0000-000000000001',
        id_contacto: CONTACT_A_ID,
        id_certificado: CERT_Y_ID,
        deleted_at: null,
      },
    ],
  });

  assert.equal(plan.isExecutable, true);
  assert.equal(plan.alreadyShared.length, 1);
  assert.equal(plan.alreadyShared[0].id_contacto, CONTACT_A_ID);
  assert.equal(plan.alreadyShared[0].code, 'ALREADY_SHARED');
  assert.equal(containsRawUuid(plan.alreadyShared[0].message), false);
  assert.deepEqual(
    plan.toCreateLinks.map((l) => l.id_contacto),
    [CONTACT_B_ID]
  );

  // If all selected pairs are already shared, no new links -> isExecutable false, 0 validation errors
  const allDupPlan = planShareContactos({
    sourceCert: certX,
    selectedContactoIds: [CONTACT_A_ID],
    targetCertIds: [CERT_Y_ID],
    allCertificates,
    organizaciones: ORGANIZACIONES,
    conglomerados: CONGLOMERADOS,
    existingShareLinks: [
      {
        id: '90000000-0000-0000-0000-000000000001',
        id_contacto: CONTACT_A_ID,
        id_certificado: CERT_Y_ID,
        deleted_at: null,
      },
    ],
  });
  assert.equal(allDupPlan.isExecutable, false);
  assert.deepEqual(allDupPlan.validationErrors, []);
  assert.deepEqual(allDupPlan.conflicts, []);
  assert.equal(allDupPlan.alreadyShared.length, 1);
});

test('Step 2.1 (8): DUPLICATE_CONTACT_NAME detects case/trim collisions in target certificate without exposing raw UUIDs', () => {
  const allCertificates = buildScenarioCertificates();
  const certXWithDuplicateName = makeBaseCert({
    ...allCertificates[0],
    contactos: [
      {
        id: CONTACT_A_ID,
        id_certificado: CERT_X_ID,
        nombre: '  contacto previo y  ',
        cargo: 'Calidad',
        ownerCertId: CERT_X_ID,
        telefonos: [],
        emails: [],
      },
    ],
  });

  const plan = planShareContactos({
    sourceCert: certXWithDuplicateName,
    selectedContactoIds: [CONTACT_A_ID],
    targetCertIds: [CERT_Y_ID],
    allCertificates: [certXWithDuplicateName, ...allCertificates.slice(1)],
    organizaciones: ORGANIZACIONES,
    conglomerados: CONGLOMERADOS,
  });

  assert.equal(plan.isExecutable, false);
  assert.equal(plan.toCreateLinks.length, 0);
  assert.equal(plan.conflicts.length, 1);
  assert.equal(plan.conflicts[0].kind, 'DUPLICATE_CONTACT_NAME');
  assert.match(plan.conflicts[0].message, /CERT-Y-14001/);
  assert.equal(containsRawUuid(plan.conflicts[0].message), false);
});

test('Step 2.1 (9): canUnlinkContactoFromCert and canUnlinkTurnoFromCert block owner cert and allow receiving cert', () => {
  const allCertificates = buildScenarioCertificates();
  const contactA = allCertificates[0].contactos[0];

  const ownerCheck = canUnlinkContactoFromCert({
    contacto: contactA,
    certId: CERT_X_ID,
  });
  assert.equal(ownerCheck.allowed, false);
  assert.ok(ownerCheck.reason);
  assert.equal(containsRawUuid(ownerCheck.reason), false);

  const receiverCheck = canUnlinkContactoFromCert({
    contacto: contactA,
    certId: CERT_Y_ID,
  });
  assert.equal(receiverCheck.allowed, true);

  const sharedTurno = {
    ...allCertificates[0].turnos[0],
    ownerCertId: CERT_X_ID,
    sharedFromCertId: CERT_X_ID,
  };
  assert.equal(
    canUnlinkTurnoFromCert({ turno: sharedTurno, certId: CERT_Y_ID }).allowed,
    true
  );
  assert.equal(
    canUnlinkTurnoFromCert({
      turno: allCertificates[0].turnos[0],
      certId: CERT_X_ID,
    }).allowed,
    false
  );
});

test('Step 2.1 (10): planShareTurnos auto-links Sitio 0 (HQ) on target certificate even with homonymous Sede Central name', () => {
  const allCertificates = buildScenarioCertificates();
  const certX = allCertificates[0];

  const plan = planShareTurnos({
    sourceCert: certX,
    selectedTurnoIds: [TURNO_1_ID, TURNO_2_ID],
    targetCertIds: [CERT_Y_ID],
    allCertificates,
    organizaciones: ORGANIZACIONES,
    conglomerados: CONGLOMERADOS,
    profile: ADMIN_PROFILE,
  });

  assert.equal(plan.isExecutable, true);
  assert.deepEqual(plan.validationErrors, []);
  assert.deepEqual(plan.alreadyShared, []);
  assert.equal(plan.certLinksToCreate.length, 2);
  assert.equal(plan.certLinksToCreate[0].id_certificado_origen, CERT_X_ID);

  // Should link strictly Sitio 0 (SITE_Y0_ID) per default Sitio 0 priority, not SITE_Y1_ID
  assert.equal(plan.turnosPorSitioToCreate.length, 2);
  assert.deepEqual(
    plan.turnosPorSitioToCreate.map((s) => ({
      id_sitio: s.id_sitio,
      numero_sitio: s.numero_sitio,
      id_turno: s.id_turno,
    })),
    [
      { id_sitio: SITE_Y0_ID, numero_sitio: 0, id_turno: TURNO_1_ID },
      { id_sitio: SITE_Y0_ID, numero_sitio: 0, id_turno: TURNO_2_ID },
    ]
  );
});

test('Step 2.1 (11): planShareTurnos supports autoLinkTargetSites=false, explicit targetSiteIdsByCertId, and idempotent skipping', () => {
  const allCertificates = buildScenarioCertificates();
  const certX = allCertificates[0];

  const noSitesPlan = planShareTurnos({
    sourceCert: certX,
    selectedTurnoIds: [TURNO_1_ID],
    targetCertIds: [CERT_Y_ID],
    autoLinkTargetSites: false,
    allCertificates,
    organizaciones: ORGANIZACIONES,
    conglomerados: CONGLOMERADOS,
  });
  assert.equal(noSitesPlan.isExecutable, true);
  assert.equal(noSitesPlan.certLinksToCreate.length, 1);
  assert.equal(noSitesPlan.turnosPorSitioToCreate.length, 0);

  // Explicit selection targeting SITE_Y1_ID while TURNO_1_ID is already linked at cert & SITE_Y1_ID level
  const explicitPlan = planShareTurnos({
    sourceCert: certX,
    selectedTurnoIds: [TURNO_1_ID, TURNO_2_ID],
    targetCertIds: [CERT_Y_ID],
    autoLinkTargetSites: true,
    targetSiteIdsByCertId: {
      [CERT_Y_ID]: [SITE_Y0_ID, SITE_Y1_ID],
    },
    existingTurnoCertLinks: [
      {
        id: '91000000-0000-0000-0000-000000000001',
        id_turno: TURNO_1_ID,
        id_certificado: CERT_Y_ID,
        id_certificado_origen: CERT_X_ID,
      },
    ],
    existingTurnosPorSitio: [
      {
        id: '92000000-0000-0000-0000-000000000001',
        id_sitio: SITE_Y1_ID,
        id_turno: TURNO_1_ID,
      },
    ],
    allCertificates,
    organizaciones: ORGANIZACIONES,
    conglomerados: CONGLOMERADOS,
  });

  assert.equal(explicitPlan.isExecutable, true);
  assert.equal(explicitPlan.alreadyShared.length, 1);
  assert.equal(explicitPlan.alreadyShared[0].id_turno, TURNO_1_ID);
  assert.deepEqual(
    explicitPlan.certLinksToCreate.map((c) => c.id_turno),
    [TURNO_2_ID]
  );
  // TURNO_1 -> SITE_Y0 (1) + TURNO_2 -> SITE_Y0 & SITE_Y1 (2) = 3 total
  assert.equal(explicitPlan.turnosPorSitioToCreate.length, 3);
  assert.equal(
    explicitPlan.turnosPorSitioToCreate.some(
      (tps) => tps.id_sitio === SITE_Y1_ID && tps.id_turno === TURNO_1_ID
    ),
    false
  );
});

test('Step 2.1 (12): resolveContactoDetailById, resolveTelefonoDetailById, resolveEmailDetailById, and resolveTurnoDetailById honor activeCertContextId cleanly', () => {
  const baseCerts = buildScenarioCertificates();
  const certX = baseCerts[0];
  const sharedContactA = {
    ...certX.contactos[0],
    id_certificado: CERT_Y_ID,
    ownerCertId: CERT_X_ID,
    sharedFromCertId: CERT_X_ID,
    sharedFromCertLabel: 'CERT-X-9001',
  };
  const ownerContactAWithTargets = {
    ...certX.contactos[0],
    sharedTargets: [
      {
        linkId: '93000000-0000-0000-0000-000000000001',
        targetCertId: CERT_Y_ID,
        targetNumeroCertificado: 'CERT-Y-14001',
      },
    ],
  };

  const certXUpdated = makeBaseCert({
    ...certX,
    contactos: [ownerContactAWithTargets, ...certX.contactos.slice(1)],
  });
  const certYUpdated = makeBaseCert({
    ...baseCerts[1],
    contactos: [...baseCerts[1].contactos, sharedContactA],
    sitios: [
      {
        ...baseCerts[1].sitios[0],
        turnos_por_sitio: [
          {
            id: '94000000-0000-0000-0000-000000000001',
            id_sitio: SITE_Y0_ID,
            id_turno: TURNO_1_ID,
            hora_entrada: '07:00:00',
            hora_salida: '15:00:00',
            descripcion: 'Turno Diurno',
          },
        ],
      },
      baseCerts[1].sitios[1],
    ],
  });
  const certificates = [certYUpdated, certXUpdated];

  // Without activeCertContextId -> resolves owner cert X even though Y comes first in array
  const defaultResolved = resolveContactoDetailById({
    contactoId: CONTACT_A_ID,
    certificates,
  })!;
  assert.ok(defaultResolved);
  assert.equal(defaultResolved.id_certificado, CERT_X_ID);
  assert.equal(defaultResolved.is_shared_context, false);
  assert.equal(defaultResolved.shared_targets_count, 1);

  // With activeCertContextId = CERT_Y_ID -> resolves context Y while keeping owner_cert_id = CERT_X_ID
  const sharedResolved = resolveContactoDetailById({
    contactoId: CONTACT_A_ID,
    certificates,
    activeCertContextId: CERT_Y_ID,
  })!;
  assert.ok(sharedResolved);
  assert.equal(sharedResolved.id_certificado, CERT_Y_ID);
  assert.equal(sharedResolved.numero_certificado, 'CERT-Y-14001');
  assert.equal(sharedResolved.owner_cert_id, CERT_X_ID);
  assert.equal(sharedResolved.owner_numero_certificado, 'CERT-X-9001');
  assert.equal(sharedResolved.is_shared_context, true);

  const telShared = resolveTelefonoDetailById({
    telefonoId: TEL_A_ID,
    certificates,
    activeCertContextId: CERT_Y_ID,
  })!;
  assert.equal(telShared.id_certificado, CERT_Y_ID);
  assert.equal(telShared.owner_cert_id, CERT_X_ID);
  assert.equal(telShared.is_shared_context, true);

  const emailShared = resolveEmailDetailById({
    emailId: EMAIL_A_ID,
    certificates,
    activeCertContextId: CERT_Y_ID,
  })!;
  assert.equal(emailShared.id_certificado, CERT_Y_ID);
  assert.equal(emailShared.owner_cert_id, CERT_X_ID);
  assert.equal(emailShared.is_shared_context, true);

  // resolveTurnoDetailById picks up normalized turnos_por_sitio on shared cert Y as well as own cert X
  const turnoDetail = resolveTurnoDetailById({
    turnoId: TURNO_1_ID,
    certificates,
    programacionAudits: [],
    shiftCatalog: certX.turnos.map((t) => ({
      id: t.id,
      hora_entrada: t.hora_entrada,
      hora_salida: t.hora_salida,
      descripcion: t.descripcion,
    })),
  })!;
  assert.ok(turnoDetail);
  assert.deepEqual(
    turnoDetail.sitios.map((s) => s.id_sitio).sort(),
    [SITE_X0_ID, SITE_Y0_ID].sort()
  );
});

test('Step 2.1 (13): canArchiveContacto and canArchiveTurno block archival when active conglomerate shares exist (Zero-UUID)', () => {
  const blockedContact = canArchiveContacto({
    telefonos: [],
    emails: [],
    sharedTargetsCount: 1,
  });
  assert.equal(blockedContact.allowed, false);
  assert.ok(blockedContact.reason);
  assert.match(blockedContact.reason, /compartici/i);
  assert.equal(containsRawUuid(blockedContact.reason), false);

  assert.equal(
    canArchiveContacto({ telefonos: [], emails: [], sharedTargetsCount: 0 }).allowed,
    true
  );

  const blockedTurnoSharedOnly = canArchiveTurno({
    assignedSitiosCount: 0,
    sharedCertificatesCount: 2,
  });
  assert.equal(blockedTurnoSharedOnly.allowed, false);
  assert.ok(blockedTurnoSharedOnly.reason);
  assert.match(blockedTurnoSharedOnly.reason, /compartido/i);
  assert.equal(containsRawUuid(blockedTurnoSharedOnly.reason), false);

  const blockedTurnoBoth = canArchiveTurno({
    assignedSitiosCount: 1,
    sharedCertificatesCount: 1,
  });
  assert.equal(blockedTurnoBoth.allowed, false);
  assert.ok(blockedTurnoBoth.reason);
  assert.equal(containsRawUuid(blockedTurnoBoth.reason), false);
});

test('Step 2.1 (14): archiveGovernance registers all 4 *_compartido tables and blocks contacto_certificado & turno while shares are active', () => {
  const shareTables = [
    'contacto_certificado_compartido',
    'turno_certificado_compartido',
    'proceso_certificado_compartido',
    'sitio_certificado_compartido',
  ] as const;

  const certDomainTables = getDomainArchivedTables('certificados');
  for (const tbl of shareTables) {
    assert.ok(PROTECTED_SOFT_DELETE_TABLES.includes(tbl));
    assert.ok(certDomainTables.includes(tbl));
    const label = getArchiveTableDisplayLabel(tbl);
    assert.ok(label.length > 0);
    assert.equal(assertZeroUuidExposure(label).compliant, true);

    const leafSummary = computeLocalArchiveDependencySummary(
      tbl,
      '95000000-0000-0000-0000-000000000001',
      {}
    );
    assert.equal(leafSummary.can_archive, true);
  }

  const baseCerts = buildScenarioCertificates();
  const certX = baseCerts[0];
  const contactShareLinkId = '96000000-0000-0000-0000-000000000001';
  const turnoShareLinkId = '97000000-0000-0000-0000-000000000001';

  const blockedContactSummary = computeLocalArchiveDependencySummary(
    'contacto_certificado',
    CONTACT_B_ID,
    {
      certificates: [certX],
      sharedContactoLinks: [
        {
          id: contactShareLinkId,
          id_contacto: CONTACT_B_ID,
          id_certificado: CERT_Y_ID,
          deleted_at: null,
        },
      ],
    }
  );
  assert.equal(blockedContactSummary.can_archive, false);
  assert.ok(
    blockedContactSummary.dependencies.some(
      (d) => d.table === 'contacto_certificado_compartido' && d.count === 1
    )
  );

  const unblockedContactSummary = computeLocalArchiveDependencySummary(
    'contacto_certificado',
    CONTACT_B_ID,
    {
      certificates: [certX],
      sharedContactoLinks: [
        {
          id: contactShareLinkId,
          id_contacto: CONTACT_B_ID,
          id_certificado: CERT_Y_ID,
          deleted_at: null,
        },
      ],
      archivedContactoShareIds: new Set([contactShareLinkId]),
    }
  );
  assert.equal(unblockedContactSummary.can_archive, true);

  const blockedTurnoSummary = computeLocalArchiveDependencySummary(
    'turno',
    TURNO_2_ID,
    {
      certificates: [certX],
      archivedSiteIds: new Set([SITE_X0_ID]),
      sharedTurnoLinks: [
        {
          id: turnoShareLinkId,
          id_turno: TURNO_2_ID,
          id_certificado: CERT_Y_ID,
          id_certificado_origen: CERT_X_ID,
          deleted_at: null,
        },
      ],
    }
  );
  assert.equal(blockedTurnoSummary.can_archive, false);
  assert.ok(
    blockedTurnoSummary.dependencies.some(
      (d) => d.table === 'turno_certificado_compartido' && d.count === 1
    )
  );

  const unblockedTurnoSummary = computeLocalArchiveDependencySummary(
    'turno',
    TURNO_2_ID,
    {
      certificates: [certX],
      archivedSiteIds: new Set([SITE_X0_ID]),
      sharedTurnoLinks: [
        {
          id: turnoShareLinkId,
          id_turno: TURNO_2_ID,
          id_certificado: CERT_Y_ID,
          id_certificado_origen: CERT_X_ID,
          deleted_at: null,
        },
      ],
      archivedTurnoShareIds: new Set([turnoShareLinkId]),
    }
  );
  assert.equal(unblockedTurnoSummary.can_archive, true);
});
