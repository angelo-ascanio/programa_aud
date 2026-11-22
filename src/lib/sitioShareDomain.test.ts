import assert from 'node:assert/strict';
import test from 'node:test';

import type { OrganizacionEntity } from './activeCertificates';
import type { ProgramacionAuditEntity } from './auditExecution';
import { computeLocalArchiveDependencySummary } from './archiveGovernance';
import type { ConglomeradoEntity } from './conglomeradoDomain';
import type { RequisitoLtree } from './extraDomain';
import type { UserProfile } from './healthCheck';
import {
  INITIAL_CERTIFICADOS_DETAILED,
  type CertificadoDetailEntity,
  type ProcesoPorSitioLink,
  type ProcessEntity,
  type ShiftEntity,
  type SiteEntity,
} from './multisiteSampling';
import { getAllSeededNormaRequirements } from './procesoDomain';
import {
  buildAuditProcesoDetail,
  buildProcessHistoryForSite,
} from './programaCertificadoDomain';
import {
  canArchiveSitio,
  canUnlinkSitioFromCert,
  getAvailableProcesosForSitio,
  resolveSitioDetailById,
  validateProcesoPorSitioAssignment,
} from './sitioDomain';
import {
  getEligibleSitioShareTargets,
  planShareSitiosWithCascade,
  resolveTargetNumeroSitioForSharedSite,
} from './sitioShareDomain';
import { assertZeroUuidExposure } from './zeroUuid';

const NORMA_9001_ID = 'e0000000-0000-0000-0000-000000009001';
const NORMA_14001_ID = 'e0000000-0000-0000-0000-000000014001';

const GROUP_ALPHA_ID = '90000000-0000-0000-0000-000000000001';
const GROUP_BETA_ID = '90000000-0000-0000-0000-000000000002';

const ORG_A1_ID = 'a1000000-0000-0000-0000-000000000001';
const ORG_A2_ID = 'a1000000-0000-0000-0000-000000000002';
const ORG_B1_ID = 'a1000000-0000-0000-0000-000000000003';

const CERT_X_ID = 'c1000000-0000-0000-0000-000000000001';
const CERT_Y_ID = 'c1000000-0000-0000-0000-000000000002';
const CERT_Z_ID = 'c1000000-0000-0000-0000-000000000003';
const CERT_OTHER_GROUP_ID = 'c1000000-0000-0000-0000-000000000004';

const SITE_0_X_ID = '51000000-0000-0000-0000-000000000001';
const SITE_1_X_ID = '51000000-0000-0000-0000-000000000002';
const SITE_0_Y_ID = '51000000-0000-0000-0000-000000000003';
const SITE_2_Y_ID = '51000000-0000-0000-0000-000000000004';

const SHIFT_DAY_ID = '71000000-0000-0000-0000-000000000001';
const SHIFT_NIGHT_ID = '71000000-0000-0000-0000-000000000002';

const PROC_CALIDAD_ID = '61000000-0000-0000-0000-000000000001';
const PROC_AMBIENTAL_ID = '61000000-0000-0000-0000-000000000002';
const PROC_EXTRA_ID = '61000000-0000-0000-0000-000000000003';

const PPS_X_1_ID = '81000000-0000-0000-0000-000000000001';
const PPS_X_2_ID = '81000000-0000-0000-0000-000000000002';
const PPS_Y_AMB_ID = '81000000-0000-0000-0000-000000000003';

const AUDIT_Y_ID = 'aa000000-0000-0000-0000-000000000001';
const AUDIT_X_ID = 'aa000000-0000-0000-0000-000000000002';

function buildExtendedCrossNormCatalog(): RequisitoLtree[] {
  const base = getAllSeededNormaRequirements();
  const extra: RequisitoLtree[] = [
    {
      id: '91000000-0000-0000-0000-000000000044',
      id_norma: NORMA_9001_ID,
      norma_codigo: 'ISO 9001:2015',
      id_requisito_padre: null,
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
      id_requisito_padre: null,
      codigo: '8.2',
      es_obligatorio: true,
      titulo: 'Requisitos para los productos y servicios',
      ruta_materializada: '8.8_2',
      nivel: 2,
      es_padre: false,
    },
    {
      id: '94000000-0000-0000-0000-000000000041',
      id_norma: NORMA_14001_ID,
      norma_codigo: 'ISO 14001:2015',
      id_requisito_padre: null,
      codigo: '4.1',
      es_obligatorio: true,
      titulo: 'Comprensión de la organización y de su contexto',
      ruta_materializada: '4.4_1',
      nivel: 2,
      es_padre: false,
    },
    {
      id: '94000000-0000-0000-0000-000000000044',
      id_norma: NORMA_14001_ID,
      norma_codigo: 'ISO 14001:2015',
      id_requisito_padre: null,
      codigo: '4.4',
      es_obligatorio: true,
      titulo: 'Sistema de gestión ambiental',
      ruta_materializada: '4.4_4',
      nivel: 2,
      es_padre: false,
    },
    {
      id: '94000000-0000-0000-0000-000000000082',
      id_norma: NORMA_14001_ID,
      norma_codigo: 'ISO 14001:2015',
      id_requisito_padre: null,
      codigo: '8.2',
      es_obligatorio: true,
      titulo: 'Preparación y respuesta ante emergencias',
      ruta_materializada: '8.8_2',
      nivel: 2,
      es_padre: false,
    },
    {
      id: '94000000-0000-0000-0000-000000000083',
      id_norma: NORMA_14001_ID,
      norma_codigo: 'ISO 14001:2015',
      id_requisito_padre: null,
      codigo: '8.3',
      es_obligatorio: false,
      titulo: 'Preparación de diseño ambiental (excluible en prueba)',
      ruta_materializada: '8.8_3',
      nivel: 2,
      es_padre: false,
    },
  ];
  return [...base, ...extra];
}

function buildTestEnvironment() {
  const catalog = buildExtendedCrossNormCatalog();
  const baseTemplate = INITIAL_CERTIFICADOS_DETAILED[0];

  const req9001_41 = catalog.find(
    (r) => r.norma_codigo === 'ISO 9001:2015' && r.codigo === '4.1'
  )!;
  const req9001_441 = catalog.find((r) => r.id === '91000000-0000-0000-0000-000000000441')!;
  const req9001_442 = catalog.find((r) => r.id === '91000000-0000-0000-0000-000000000442')!;
  const req9001_82 = catalog.find((r) => r.id === '91000000-0000-0000-0000-000000000082')!;
  const req9001_83 = catalog.find(
    (r) => r.norma_codigo === 'ISO 9001:2015' && r.codigo === '8.3'
  )!;

  const shiftDay: ShiftEntity = {
    id: SHIFT_DAY_ID,
    hora_entrada: '07:00',
    hora_salida: '15:00',
    descripcion: 'Turno Diurno Planta',
    sitios_vinculados: ['Sede Central HQ', 'Planta Occidente'],
  };
  const shiftNight: ShiftEntity = {
    id: SHIFT_NIGHT_ID,
    hora_entrada: '15:00',
    hora_salida: '23:00',
    descripcion: 'Turno Vespertino Planta',
    sitios_vinculados: ['Sede Central HQ'],
  };

  const procCalidad: ProcessEntity = {
    id: PROC_CALIDAD_ID,
    id_certificado: CERT_X_ID,
    nombre_proceso: 'Manufactura y Control de Calidad',
    tipo: 'Medular',
    clausulas_cubiertas: ['4.1', '4.4.1', '4.4.2', '8.2', '8.3'],
    requisitos_detalle: [
      { codigo: '4.1', titulo: req9001_41.titulo },
      { codigo: '4.4.1', titulo: req9001_441.titulo },
      { codigo: '4.4.2', titulo: req9001_442.titulo },
      { codigo: '8.2', titulo: req9001_82.titulo },
      { codigo: '8.3', titulo: req9001_83.titulo },
    ],
  };

  const procExtra: ProcessEntity = {
    id: PROC_EXTRA_ID,
    id_certificado: CERT_X_ID,
    nombre_proceso: 'Gestión de Metrología',
    tipo: 'De Apoyo',
    clausulas_cubiertas: ['4.1'],
    requisitos_detalle: [{ codigo: '4.1', titulo: req9001_41.titulo }],
  };

  const procAmbiental: ProcessEntity = {
    id: PROC_AMBIENTAL_ID,
    id_certificado: CERT_Y_ID,
    nombre_proceso: 'Gestión Ambiental y Efluentes',
    tipo: 'Medular',
    clausulas_cubiertas: ['4.1', '4.4'],
    requisitos_detalle: [
      { codigo: '4.1', titulo: 'Comprensión de la organización y de su contexto' },
      { codigo: '4.4', titulo: 'Sistema de gestión ambiental' },
    ],
  };

  const site0X: SiteEntity = {
    id: SITE_0_X_ID,
    id_certificado: CERT_X_ID,
    numero_sitio: 0,
    nombre_sitio: 'Sede Central HQ',
    direccion_sitio: 'Av. Industrial Norte 100',
    personal_count: 140,
    turnos_vinculados: ['Turno Diurno Planta', 'Turno Vespertino Planta'],
    turnos_por_sitio: [
      {
        id: '82000000-0000-0000-0000-000000000001',
        id_sitio: SITE_0_X_ID,
        id_turno: SHIFT_DAY_ID,
        hora_entrada: '07:00',
        hora_salida: '15:00',
        descripcion: 'Turno Diurno Planta',
        deleted_at: null,
      },
      {
        id: '82000000-0000-0000-0000-000000000002',
        id_sitio: SITE_0_X_ID,
        id_turno: SHIFT_NIGHT_ID,
        hora_entrada: '15:00',
        hora_salida: '23:00',
        descripcion: 'Turno Vespertino Planta',
        deleted_at: null,
      },
    ],
    procesos_vinculados: ['Manufactura y Control de Calidad', 'Gestión de Metrología'],
    procesos_por_sitio: [
      {
        id: PPS_X_1_ID,
        id_certificado: CERT_X_ID,
        id_sitio: SITE_0_X_ID,
        id_proceso: PROC_CALIDAD_ID,
        nombre_proceso: procCalidad.nombre_proceso,
        tipo_proceso: procCalidad.tipo,
        clausulas_cubiertas: procCalidad.clausulas_cubiertas,
        deleted_at: null,
      },
      {
        id: PPS_X_2_ID,
        id_certificado: CERT_X_ID,
        id_sitio: SITE_0_X_ID,
        id_proceso: PROC_EXTRA_ID,
        nombre_proceso: procExtra.nombre_proceso,
        tipo_proceso: procExtra.tipo,
        clausulas_cubiertas: procExtra.clausulas_cubiertas,
        deleted_at: null,
      },
    ],
  };

  const site1X: SiteEntity = {
    id: SITE_1_X_ID,
    id_certificado: CERT_X_ID,
    numero_sitio: 1,
    nombre_sitio: 'Planta Occidente',
    direccion_sitio: 'Parque Industrial Zona B',
    personal_count: 65,
    turnos_vinculados: ['Turno Diurno Planta'],
    turnos_por_sitio: [
      {
        id: '82000000-0000-0000-0000-000000000003',
        id_sitio: SITE_1_X_ID,
        id_turno: SHIFT_DAY_ID,
        hora_entrada: '07:00',
        hora_salida: '15:00',
        descripcion: 'Turno Diurno Planta',
        deleted_at: null,
      },
    ],
    procesos_vinculados: ['Manufactura y Control de Calidad'],
    procesos_por_sitio: [
      {
        id: '81000000-0000-0000-0000-000000000010',
        id_certificado: CERT_X_ID,
        id_sitio: SITE_1_X_ID,
        id_proceso: PROC_CALIDAD_ID,
        nombre_proceso: procCalidad.nombre_proceso,
        tipo_proceso: procCalidad.tipo,
        clausulas_cubiertas: procCalidad.clausulas_cubiertas,
        deleted_at: null,
      },
    ],
  };

  const site0Y: SiteEntity = {
    id: SITE_0_Y_ID,
    id_certificado: CERT_Y_ID,
    numero_sitio: 0,
    nombre_sitio: 'Sede Ambiental Principal',
    direccion_sitio: 'Complejo Eco Sur 50',
    personal_count: 90,
    turnos_vinculados: [],
    procesos_vinculados: ['Gestión Ambiental y Efluentes'],
    procesos_por_sitio: [
      {
        id: PPS_Y_AMB_ID,
        id_certificado: CERT_Y_ID,
        id_sitio: SITE_0_Y_ID,
        id_proceso: PROC_AMBIENTAL_ID,
        nombre_proceso: procAmbiental.nombre_proceso,
        tipo_proceso: procAmbiental.tipo,
        clausulas_cubiertas: procAmbiental.clausulas_cubiertas,
        deleted_at: null,
      },
    ],
  };

  const site2Y: SiteEntity = {
    id: SITE_2_Y_ID,
    id_certificado: CERT_Y_ID,
    numero_sitio: 2,
    nombre_sitio: 'Estación Tratamiento Norte',
    direccion_sitio: 'Carretera Norte Km 12',
    personal_count: 25,
    turnos_vinculados: [],
    procesos_vinculados: [],
    procesos_por_sitio: [],
  };

  const certX: CertificadoDetailEntity = {
    ...baseTemplate,
    id: CERT_X_ID,
    numero_certificado: 'CERT-QMS-001',
    id_organizacion: ORG_A1_ID,
    organizacion_nombre: 'Industrias Alpha S.A.',
    organizacion_rif: 'J-30111111-1',
    id_norma: NORMA_9001_ID,
    norma_codigo: 'ISO 9001:2015',
    multisitio: true,
    estatus: 'Activo',
    sitios: [site0X, site1X],
    turnos: [shiftDay, shiftNight],
    procesos: [procCalidad, procExtra],
    noAplicables: [],
    auditorias: [],
    contactos: [],
  };

  const certY: CertificadoDetailEntity = {
    ...baseTemplate,
    id: CERT_Y_ID,
    numero_certificado: 'CERT-EMS-002',
    id_organizacion: ORG_A2_ID,
    organizacion_nombre: 'Alpha Logística Ambiental C.A.',
    organizacion_rif: 'J-30222222-2',
    id_norma: NORMA_14001_ID,
    norma_codigo: 'ISO 14001:2015',
    multisitio: true,
    estatus: 'Activo',
    sitios: [site0Y, site2Y],
    turnos: [],
    procesos: [procAmbiental],
    noAplicables: [
      {
        id: 'na-14001-83-test',
        id_certificado: CERT_Y_ID,
        id_requisito: '94000000-0000-0000-0000-000000000083',
        requisito_codigo: '8.3',
        requisito_titulo: 'Diseño ambiental no aplicable en esta certificación',
        justificacion: 'Exclusión validada ISO 4.3 en sitio certificado.',
      },
    ],
    auditorias: [],
    contactos: [],
  };

  const certZ: CertificadoDetailEntity = {
    ...baseTemplate,
    id: CERT_Z_ID,
    numero_certificado: 'CERT-QMS-VACIO',
    id_organizacion: ORG_A2_ID,
    organizacion_nombre: 'Alpha Logística Ambiental C.A.',
    organizacion_rif: 'J-30222222-2',
    id_norma: NORMA_9001_ID,
    norma_codigo: 'ISO 9001:2015',
    multisitio: true,
    estatus: 'Activo',
    sitios: [],
    turnos: [],
    procesos: [],
    noAplicables: [],
    auditorias: [],
    contactos: [],
  };

  const certOtherGroup: CertificadoDetailEntity = {
    ...baseTemplate,
    id: CERT_OTHER_GROUP_ID,
    numero_certificado: 'CERT-BETA-999',
    id_organizacion: ORG_B1_ID,
    organizacion_nombre: 'Grupo Externo Beta',
    organizacion_rif: 'J-30999999-9',
    id_norma: NORMA_9001_ID,
    norma_codigo: 'ISO 9001:2015',
    multisitio: false,
    estatus: 'Activo',
    sitios: [],
    turnos: [],
    procesos: [],
    noAplicables: [],
    auditorias: [],
    contactos: [],
  };

  const organizaciones: OrganizacionEntity[] = [
    {
      id: ORG_A1_ID,
      nombre: 'Industrias Alpha S.A.',
      rif: 'J-30111111-1',
      direccion_fiscal: 'Av. Industrial Norte 100',
      id_sector_iaf: '17',
      estatus: 'Activo',
      id_grupo_empresarial: GROUP_ALPHA_ID,
      grupo_empresarial_nombre: 'Conglomerado Alpha',
      deleted_at: null,
    },
    {
      id: ORG_A2_ID,
      nombre: 'Alpha Logística Ambiental C.A.',
      rif: 'J-30222222-2',
      direccion_fiscal: 'Complejo Eco Sur 50',
      id_sector_iaf: '31',
      estatus: 'Activo',
      id_grupo_empresarial: GROUP_ALPHA_ID,
      grupo_empresarial_nombre: 'Conglomerado Alpha',
      deleted_at: null,
    },
    {
      id: ORG_B1_ID,
      nombre: 'Grupo Externo Beta',
      rif: 'J-30999999-9',
      direccion_fiscal: 'Zona Franca Beta',
      id_sector_iaf: '35',
      estatus: 'Activo',
      id_grupo_empresarial: GROUP_BETA_ID,
      grupo_empresarial_nombre: 'Conglomerado Beta',
      deleted_at: null,
    },
  ];

  const conglomerados: ConglomeradoEntity[] = [
    {
      id: GROUP_ALPHA_ID,
      codigo_grupo: 'GRP-ALPHA',
      nombre: 'Conglomerado Alpha',
      es_individual_auto: false,
      notas: 'Holding industrial y ambiental',
      deleted_at: null,
    },
    {
      id: GROUP_BETA_ID,
      codigo_grupo: 'GRP-BETA',
      nombre: 'Conglomerado Beta',
      es_individual_auto: false,
      notas: 'Holding independiente',
      deleted_at: null,
    },
  ];

  return {
    catalog,
    certX,
    certY,
    certZ,
    certOtherGroup,
    allCertificates: [certX, certY, certZ, certOtherGroup],
    organizaciones,
    conglomerados,
    site0X,
    site1X,
    site0Y,
    site2Y,
    shiftDay,
    shiftNight,
    procCalidad,
    procExtra,
    procAmbiental,
  };
}

test('Step 2.3 (1): resolveTargetNumeroSitioForSharedSite auto-renumbers Sitio 0 collision to max + 1', () => {
  const { site0X, certY } = buildTestEnvironment();
  // certY already has Sitio 0 and Sitio 2 -> max + 1 = 3
  const res = resolveTargetNumeroSitioForSharedSite({
    sourceSite: site0X,
    targetCert: certY,
  });

  assert.equal(res.allowed, true);
  assert.equal(res.targetHasSitio0, true);
  assert.equal(res.collisionDetected, true);
  assert.equal(res.autoRenumbered, true);
  assert.equal(res.suggestedNumeroSitio, 3);
  assert.equal(res.assignedNumeroSitio, 3);
  assert.deepEqual(res.occupiedNumbers, [0, 2]);
  assertZeroUuidExposure(res.reason ?? '');
});

test('Step 2.3 (2): resolveTargetNumeroSitioForSharedSite assigns Sitio 0 when target cert lacks Sitio 0', () => {
  const { site0X, certZ } = buildTestEnvironment();
  const res = resolveTargetNumeroSitioForSharedSite({
    sourceSite: site0X,
    targetCert: certZ,
  });

  assert.equal(res.allowed, true);
  assert.equal(res.targetHasSitio0, false);
  assert.equal(res.collisionDetected, false);
  assert.equal(res.autoRenumbered, false);
  assert.equal(res.assignedNumeroSitio, 0);
  assert.equal(res.suggestedNumeroSitio, 0);
});

test('Step 2.3 (3): resolveTargetNumeroSitioForSharedSite enforces manual overrides, duplicate shares, and owner cert guards', () => {
  const { site0X, certX, certY } = buildTestEnvironment();

  const sameCertRes = resolveTargetNumeroSitioForSharedSite({
    sourceSite: site0X,
    targetCert: certX,
  });
  assert.equal(sameCertRes.allowed, false);
  assertZeroUuidExposure(sameCertRes.reason ?? '');

  const collidingManual = resolveTargetNumeroSitioForSharedSite({
    sourceSite: site0X,
    targetCert: certY,
    manualOverrideNumeroSitio: 2,
  });
  assert.equal(collidingManual.allowed, false);
  assert.equal(collidingManual.collisionDetected, true);
  assertZeroUuidExposure(collidingManual.reason ?? '');

  const validManual = resolveTargetNumeroSitioForSharedSite({
    sourceSite: site0X,
    targetCert: certY,
    manualOverrideNumeroSitio: 5,
  });
  assert.equal(validManual.allowed, true);
  assert.equal(validManual.assignedNumeroSitio, 5);
  assert.equal(validManual.autoRenumbered, false);
});

test('Step 2.3 (4): getEligibleSitioShareTargets enforces Conglomerado boundary, Level 2 RBAC, and collision metadata', () => {
  const { certX, site0X, allCertificates, organizaciones, conglomerados } =
    buildTestEnvironment();

  const adminProfile: UserProfile = {
    id: '00000000-0000-0000-0000-00000000a001',
    nombre: 'Admin OC',
    role: 'ADMIN',
    status: 'APPROVED',
  };

  const adminEligibility = getEligibleSitioShareTargets({
    sourceCert: certX,
    sourceSite: site0X,
    allCertificates,
    organizaciones,
    conglomerados,
    profile: adminProfile,
  });

  assert.equal(adminEligibility.sourceGroupId, GROUP_ALPHA_ID);
  assert.equal(adminEligibility.missingConglomeradoReason, null);
  const adminTargetIds = adminEligibility.targets.map((t) => t.id);
  assert.ok(adminTargetIds.includes(CERT_Y_ID));
  assert.ok(adminTargetIds.includes(CERT_Z_ID));
  assert.ok(!adminTargetIds.includes(CERT_OTHER_GROUP_ID));

  const targetYMeta = adminEligibility.targets.find((t) => t.id === CERT_Y_ID)!;
  assert.equal(targetYMeta.alreadyShared, false);
  assert.equal(targetYMeta.numeroResolution.assignedNumeroSitio, 3);
  assert.equal(targetYMeta.numeroResolution.autoRenumbered, true);

  const clientProfile: UserProfile = {
    id: '00000000-0000-0000-0000-00000000c001',
    nombre: 'Cliente Alpha 1',
    role: 'CLIENT',
    status: 'APPROVED',
  };

  // CLIENT only authorized on ORG_A1 cannot share into ORG_A2 certs
  const restrictedClientEligibility = getEligibleSitioShareTargets({
    sourceCert: certX,
    sourceSite: site0X,
    allCertificates,
    organizaciones,
    conglomerados,
    profile: clientProfile,
    authorizedClientOrgIds: [ORG_A1_ID],
  });
  assert.equal(restrictedClientEligibility.targets.length, 0);
});

test('Step 2.3 (5): planShareSitiosWithCascade cascades Turnos and routes Procesos through cross-norm procesoClauseResolver', () => {
  const { catalog, certX, allCertificates, organizaciones, conglomerados } =
    buildTestEnvironment();

  const plan = planShareSitiosWithCascade({
    sourceCert: certX,
    selectedSiteIds: [SITE_0_X_ID],
    targetCertIds: [CERT_Y_ID],
    allCertificates,
    organizaciones,
    conglomerados,
    requirementsCatalog: catalog,
  });

  assert.equal(plan.isExecutable, true);
  assert.equal(plan.validationErrors.length, 0);
  assert.equal(plan.sitioLinksToCreate.length, 1);
  assert.equal(plan.sitioLinksToCreate[0].numero_sitio, 3);
  assert.equal(plan.sitioLinksToCreate[0].autoRenumbered, true);

  // 2 active shifts cascaded for SITE_0_X_ID
  assert.equal(plan.turnoCertLinksToCreate.length, 2);
  assert.deepEqual(
    plan.turnoCertLinksToCreate.map((t) => t.id_turno).sort(),
    [SHIFT_DAY_ID, SHIFT_NIGHT_ID].sort()
  );

  // 2 active processes planned via cross-standard resolver (ISO 9001 -> ISO 14001)
  assert.equal(plan.procesoSharesWithClausePlans.length, 2);
  assert.equal(plan.procesosPorSitioToCreate.length, 2);
  assert.ok(plan.procesosPorSitioToCreate.every((p) => p.id_certificado === CERT_Y_ID));

  const calidadPlan = plan.procesoSharesWithClausePlans.find(
    (p) => p.id_proceso === PROC_CALIDAD_ID
  )!;
  assert.equal(calidadPlan.resolutionPlan.isCrossStandard, true);
  assert.equal(calidadPlan.requiresUserConfirmation, true);

  const statuses = calidadPlan.resolutionPlan.entries.map((e) => e.status);
  assert.ok(statuses.includes('HLS_EQUIVALENT'));
  assert.ok(statuses.includes('HIERARCHICAL_ROLLUP'));
  assert.ok(statuses.includes('SEMANTIC_COLLISION'));

  // ISO 9001 8.2 vs ISO 14001 8.2 semantic collision must NOT be preselected or silently auto-mapped
  const entry82 = calidadPlan.resolutionPlan.entries.find((e) =>
    e.sourceClauses.includes('8.2')
  )!;
  assert.equal(entry82.status, 'SEMANTIC_COLLISION');
  assert.equal(entry82.preselected, false);
  assertZeroUuidExposure(entry82.warningMessage ?? '');

  // Excluded ISO 14001 8.3 (via certY.noAplicables) must not enter final default target IDs,
  // and no ISO 9001 requisito UUID may leak into defaultFinalRequisitoIds
  assert.ok(calidadPlan.defaultFinalRequisitoIds.includes('94000000-0000-0000-0000-000000000044'));
  assert.ok(!calidadPlan.defaultFinalRequisitoIds.includes('91000000-0000-0000-0000-000000000441'));
  assert.ok(!calidadPlan.defaultFinalRequisitoIds.includes('94000000-0000-0000-0000-000000000083'));
});

test('Step 2.3 (6): planShareSitiosWithCascade reuses an already-shared process in target cert without overwriting clauses', () => {
  const {
    catalog,
    certX,
    certY,
    procCalidad,
    allCertificates,
    organizaciones,
    conglomerados,
  } = buildTestEnvironment();

  const reusedSharedProc: ProcessEntity = {
    ...procCalidad,
    ownerCertId: CERT_X_ID,
    sharedFromCertId: CERT_X_ID,
    clausulas_cubiertas: ['4.1', '4.4'],
    requisitos_by_certificado: {
      [CERT_Y_ID]: {
        clausulas_cubiertas: ['4.1', '4.4'],
        requisitos_detalle: [
          { codigo: '4.1', titulo: 'Contexto ISO 14001' },
          { codigo: '4.4', titulo: 'SGA ISO 14001' },
        ],
      },
    },
  };

  const certYWithSharedCalidad: CertificadoDetailEntity = {
    ...certY,
    procesos: [...certY.procesos, reusedSharedProc],
  };

  const plan = planShareSitiosWithCascade({
    sourceCert: certX,
    selectedSiteIds: [SITE_1_X_ID],
    targetCertIds: [CERT_Y_ID],
    allCertificates: allCertificates.map((c) =>
      c.id === CERT_Y_ID ? certYWithSharedCalidad : c
    ),
    organizaciones,
    conglomerados,
    requirementsCatalog: catalog,
  });

  assert.equal(plan.isExecutable, true);
  assert.equal(plan.procesoSharesWithClausePlans.length, 0);
  assert.equal(plan.reusedExistingProcesses.length, 1);
  assert.equal(plan.reusedExistingProcesses[0].id_proceso, PROC_CALIDAD_ID);
  assert.equal(plan.procesosPorSitioToCreate.length, 1);
  assert.equal(plan.procesosPorSitioToCreate[0].usesExistingTargetProcess, true);
});

test('Step 2.3 (7): planShareSitiosWithCascade assigns sequential non-colliding numbers across batch sites and respects empty process selection', () => {
  const { catalog, certX, allCertificates, organizaciones, conglomerados } =
    buildTestEnvironment();

  const plan = planShareSitiosWithCascade({
    sourceCert: certX,
    selectedSiteIds: [SITE_0_X_ID, SITE_1_X_ID],
    targetCertIds: [CERT_Y_ID, CERT_Z_ID],
    selectedProcesoIdsBySite: {
      [SITE_0_X_ID]: [],
      [SITE_1_X_ID]: [PROC_CALIDAD_ID],
    },
    selectedTurnoIdsBySite: {
      [SITE_0_X_ID]: [SHIFT_DAY_ID],
      [SITE_1_X_ID]: [],
    },
    allCertificates,
    organizaciones,
    conglomerados,
    requirementsCatalog: catalog,
  });

  assert.equal(plan.isExecutable, true);
  const certYSites = plan.sitioLinksToCreate.filter((l) => l.id_certificado === CERT_Y_ID);
  const certZSites = plan.sitioLinksToCreate.filter((l) => l.id_certificado === CERT_Z_ID);
  // In certY (has Sitio 0 and Sitio 2), Sitio 0 collides -> 3, while Sitio 1 is free -> 1
  assert.deepEqual(
    certYSites.map((s) => s.numero_sitio),
    [3, 1]
  );
  assert.deepEqual(
    certZSites.map((s) => s.numero_sitio),
    [0, 1]
  );

  // When both batch sites prefer a colliding number (0), reservedNumbers prevents any batch collision -> [3, 4]
  const forcedCollisionBatch = planShareSitiosWithCascade({
    sourceCert: certX,
    selectedSiteIds: [SITE_0_X_ID, SITE_1_X_ID],
    targetCertIds: [CERT_Y_ID],
    preferredNumeroSitioByTargetCertAndSite: {
      [`${CERT_Y_ID}::${SITE_0_X_ID}`]: 0,
      [`${CERT_Y_ID}::${SITE_1_X_ID}`]: 0,
    },
    allCertificates,
    organizaciones,
    conglomerados,
    requirementsCatalog: catalog,
  });
  assert.deepEqual(
    forcedCollisionBatch.sitioLinksToCreate.map((s) => s.numero_sitio),
    [3, 4]
  );

  // Only PROC_CALIDAD_ID via SITE_1_X_ID is cascaded (SITE_0_X_ID selected [])
  assert.equal(plan.procesoSharesWithClausePlans.length, 2);
  assert.equal(plan.procesosPorSitioToCreate.length, 2);
  assert.ok(plan.procesosPorSitioToCreate.every((p) => p.id_sitio === SITE_1_X_ID));

  // Same-standard share CERT_X -> CERT_Z has 0 semantic collisions
  const certZProcPlan = plan.procesoSharesWithClausePlans.find(
    (p) => p.targetCertId === CERT_Z_ID
  )!;
  assert.equal(certZProcPlan.resolutionPlan.isCrossStandard, false);
  assert.equal(certZProcPlan.resolutionPlan.summaryCounts.semanticCollisionCount, 0);
});

test('Step 2.3 (8): sitioDomain isolates procesos_por_sitio and shift assignments per certificate on a shared site', () => {
  const { certX, certY, site0X, procCalidad, procAmbiental, shiftDay } =
    buildTestEnvironment();

  const sharedSiteOnY: SiteEntity = {
    ...site0X,
    numero_sitio: 3,
    ownerCertId: CERT_X_ID,
    sharedFromCertId: CERT_X_ID,
    sharedFromCertLabel: certX.numero_certificado,
    procesos_vinculados: undefined,
    procesos_por_sitio: [
      ...(site0X.procesos_por_sitio || []),
      {
        id: '81000000-0000-0000-0000-000000000099',
        id_certificado: CERT_Y_ID,
        id_sitio: SITE_0_X_ID,
        id_proceso: PROC_AMBIENTAL_ID,
        nombre_proceso: procAmbiental.nombre_proceso,
        tipo_proceso: procAmbiental.tipo,
        clausulas_cubiertas: procAmbiental.clausulas_cubiertas,
        deleted_at: null,
      },
    ],
  };

  const certXWithTargets: CertificadoDetailEntity = {
    ...certX,
    sitios: [
      {
        ...site0X,
        sharedTargets: [
          {
            linkId: '77000000-0000-0000-0000-000000000001',
            targetCertId: CERT_Y_ID,
            targetNumeroCertificado: certY.numero_certificado,
          },
        ],
      },
    ],
  };

  const certYWithSharedSite: CertificadoDetailEntity = {
    ...certY,
    sitios: [...certY.sitios, sharedSiteOnY],
    turnos: [shiftDay],
    procesos: [procAmbiental],
  };

  const detailOnX = resolveSitioDetailById({
    sitioId: SITE_0_X_ID,
    activeCertId: CERT_X_ID,
    certificates: [certXWithTargets, certYWithSharedSite],
    programacionAudits: [],
    shiftCatalog: [shiftDay],
  });
  const detailOnY = resolveSitioDetailById({
    sitioId: SITE_0_X_ID,
    activeCertId: CERT_Y_ID,
    certificates: [certXWithTargets, certYWithSharedSite],
    programacionAudits: [],
    shiftCatalog: [shiftDay],
  });

  assert.ok(detailOnX);
  assert.ok(detailOnY);
  assert.equal(detailOnX.id_certificado, CERT_X_ID);
  assert.deepEqual(
    detailOnX.procesos.map((p) => p.id_proceso).sort(),
    [PROC_CALIDAD_ID, PROC_EXTRA_ID].sort()
  );

  assert.equal(detailOnY.id_certificado, CERT_Y_ID);
  assert.deepEqual(
    detailOnY.procesos.map((p) => p.id_proceso),
    [PROC_AMBIENTAL_ID]
  );
  assert.equal(detailOnY.turnos.length, 1);
  assert.equal(detailOnY.turnos[0].id_turno, SHIFT_DAY_ID);

  // Adding PROC_AMBIENTAL_ID again in certY must be blocked as duplicate, and certY sees 0 available once linked
  const availableOnY = getAvailableProcesosForSitio(SITE_0_X_ID, certYWithSharedSite);
  assert.equal(availableOnY.length, 0);

  const dupValidation = validateProcesoPorSitioAssignment(
    SITE_0_X_ID,
    PROC_AMBIENTAL_ID,
    certYWithSharedSite
  );
  assert.equal(dupValidation.valid, false);

  const crossCertBlocked = validateProcesoPorSitioAssignment(
    SITE_0_X_ID,
    procCalidad.id,
    certYWithSharedSite
  );
  assert.equal(crossCertBlocked.valid, false);
});

test('Step 2.3 (9): programaCertificadoDomain strictly filters procesos_por_sitio by audit id_certificado on shared sites', () => {
  const { site0X, procCalidad, procAmbiental } = buildTestEnvironment();

  const sharedLinksAcrossCerts: ProcesoPorSitioLink[] = [
    {
      id: PPS_X_1_ID,
      id_certificado: CERT_X_ID,
      id_sitio: SITE_0_X_ID,
      id_proceso: PROC_CALIDAD_ID,
      nombre_proceso: procCalidad.nombre_proceso,
      tipo_proceso: procCalidad.tipo,
      clausulas_cubiertas: procCalidad.clausulas_cubiertas,
      deleted_at: null,
    },
    {
      id: '81000000-0000-0000-0000-000000000099',
      id_certificado: CERT_Y_ID,
      id_sitio: SITE_0_X_ID,
      id_proceso: PROC_AMBIENTAL_ID,
      nombre_proceso: procAmbiental.nombre_proceso,
      tipo_proceso: procAmbiental.tipo,
      clausulas_cubiertas: procAmbiental.clausulas_cubiertas,
      deleted_at: null,
    },
  ];

  const auditY: ProgramacionAuditEntity = {
    id: AUDIT_Y_ID,
    id_programa_auditoria: '99000000-0000-0000-0000-000000000001',
    id_certificado: CERT_Y_ID,
    numero_certificado: 'CERT-EMS-002',
    id_organizacion: ORG_A2_ID,
    organizacion_nombre: 'Alpha Logística Ambiental C.A.',
    norma_codigo: 'ISO 14001:2015',
    sector_iaf: 31,
    codigo_auditoria: 'AUD-EMS-2026-01',
    fecha_inicio: '2026-10-10',
    fecha_fin: '2026-10-11',
    tipo_auditoria: 'Seguimiento 1',
    metodologia: 'Presencial',
    estatus: 'Planificada',
    estado_ciclo: 'En Programación',
    dias_auditor: 2,
    auditor_lider_id: '00000000-0000-0000-0000-000000000101',
    auditor_lider: 'Auditor Líder',
    sede_principal_direccion: 'Av. Industrial Norte 100',
    equipo: [],
    deleted_at: null,
    sitiosMuestreo: [],
    matrizNormativa: [],
    sitiosPlan: [
      {
        id: '99000000-0000-0000-0000-000000000021',
        id_auditoria: AUDIT_Y_ID,
        id_sitio: SITE_0_X_ID,
        numero_sitio: 3,
        nombre_sitio: site0X.nombre_sitio,
        direccion_sitio: site0X.direccion_sitio,
        tiempo_auditoria: 1,
        modalidad_evaluacion: 'Presencial',
        notas_sitio: null,
        equipoSitio: [],
        deleted_at: null,
        procesos: [],
      },
    ],
  };

  const allCandidates = [
    {
      id: PROC_CALIDAD_ID,
      id_certificado: CERT_X_ID,
      nombre_proceso: procCalidad.nombre_proceso,
      tipo: procCalidad.tipo,
      clausulas_cubiertas: procCalidad.clausulas_cubiertas,
      deleted_at: null,
    },
    {
      id: PROC_AMBIENTAL_ID,
      id_certificado: CERT_Y_ID,
      nombre_proceso: procAmbiental.nombre_proceso,
      tipo: procAmbiental.tipo,
      clausulas_cubiertas: procAmbiental.clausulas_cubiertas,
      deleted_at: null,
    },
  ];

  const history = buildProcessHistoryForSite(
    auditY,
    auditY.sitiosPlan![0],
    sharedLinksAcrossCerts.filter((l) => l.id_sitio === SITE_0_X_ID),
    allCandidates,
    [auditY]
  );
  assert.deepEqual(
    history.map((r) => r.proceso.id),
    [PROC_AMBIENTAL_ID]
  );

  const detail = buildAuditProcesoDetail({
    audit: auditY,
    allAudits: [auditY],
    allProcessesPorSitio: sharedLinksAcrossCerts,
    allProcesses: allCandidates,
  });
  assert.equal(detail.sites.length, 1);
  assert.deepEqual(
    detail.sites[0].rows.map((r) => r.proceso.id),
    [PROC_AMBIENTAL_ID]
  );
});

test('Step 2.3 (10): canArchiveSitio and canUnlinkSitioFromCert guard active shares, owner cert, and target cert audits', () => {
  const { site0X } = buildTestEnvironment();

  const blockedByShare = canArchiveSitio({
    site: {
      ...site0X,
      sharedTargets: [
        {
          linkId: '77000000-0000-0000-0000-000000000001',
          targetCertId: CERT_Y_ID,
          targetNumeroCertificado: 'CERT-EMS-002',
        },
      ],
    },
    siblingSites: [site0X],
    associatedAuditsCount: 0,
  });
  assert.equal(blockedByShare.allowed, false);
  assertZeroUuidExposure(blockedByShare.reason ?? '');

  const blockedOwnerUnlink = canUnlinkSitioFromCert({
    site: {
      id: SITE_0_X_ID,
      id_certificado: CERT_X_ID,
      nombre_sitio: site0X.nombre_sitio,
      ownerCertId: CERT_X_ID,
    },
    targetCertId: CERT_X_ID,
  });
  assert.equal(blockedOwnerUnlink.allowed, false);
  assertZeroUuidExposure(blockedOwnerUnlink.reason ?? '');

  const targetAuditBlocking: ProgramacionAuditEntity = {
    id: AUDIT_Y_ID,
    id_programa_auditoria: '99000000-0000-0000-0000-000000000001',
    id_certificado: CERT_Y_ID,
    numero_certificado: 'CERT-EMS-002',
    id_organizacion: ORG_A2_ID,
    organizacion_nombre: 'Alpha Logística Ambiental C.A.',
    norma_codigo: 'ISO 14001:2015',
    sector_iaf: 31,
    codigo_auditoria: 'AUD-EMS-2026-02',
    fecha_inicio: '2026-10-12',
    fecha_fin: '2026-10-13',
    tipo_auditoria: 'Seguimiento 1',
    metodologia: 'Presencial',
    estatus: 'Planificada',
    estado_ciclo: 'En Programación',
    dias_auditor: 2,
    auditor_lider_id: '00000000-0000-0000-0000-000000000101',
    auditor_lider: 'Auditor Líder',
    sede_principal_direccion: 'Av. Industrial Norte 100',
    equipo: [],
    matrizNormativa: [],
    deleted_at: null,
    sitiosMuestreo: [
      {
        id: '99000000-0000-0000-0000-000000000029',
        id_sitio: SITE_0_X_ID,
        numero_sitio: 3,
        nombre_sitio: site0X.nombre_sitio,
        direccion_sitio: site0X.direccion_sitio,
        modalidad_evaluacion: 'Presencial',
        fecha_asignada: '2026-10-12',
        dias_asignados: 1,
        muestreado: true,
      },
    ],
  };

  const blockedByTargetAudit = canUnlinkSitioFromCert({
    site: {
      id: SITE_0_X_ID,
      id_certificado: CERT_X_ID,
      nombre_sitio: site0X.nombre_sitio,
      ownerCertId: CERT_X_ID,
      sharedFromCertId: CERT_X_ID,
    },
    targetCertId: CERT_Y_ID,
    programacionAudits: [targetAuditBlocking],
  });
  assert.equal(blockedByTargetAudit.allowed, false);
  assertZeroUuidExposure(blockedByTargetAudit.reason ?? '');

  const allowedUnlink = canUnlinkSitioFromCert({
    site: {
      id: SITE_0_X_ID,
      id_certificado: CERT_X_ID,
      nombre_sitio: site0X.nombre_sitio,
      ownerCertId: CERT_X_ID,
      sharedFromCertId: CERT_X_ID,
    },
    targetCertId: CERT_Y_ID,
    programacionAudits: [{ ...targetAuditBlocking, id_certificado: CERT_Z_ID }],
  });
  assert.equal(allowedUnlink.allowed, true);
});

test('Step 2.3 (11): archiveGovernance tracks active sitio/proceso shares and isolates procesos_por_sitio audit dependencies per certificate', () => {
  const { certX, certY, procCalidad } = buildTestEnvironment();

  const sitioSummary = computeLocalArchiveDependencySummary('sitio', SITE_0_X_ID, {
    certificates: [certX, certY],
    sharedSitioLinks: [
      {
        id: '77000000-0000-0000-0000-000000000001',
        id_sitio: SITE_0_X_ID,
        id_certificado: CERT_Y_ID,
        id_certificado_origen: CERT_X_ID,
        deleted_at: null,
      },
    ],
  });
  assert.equal(sitioSummary.can_archive, false);
  assert.ok(
    sitioSummary.dependencies.some(
      (d) => d.table === 'sitio_certificado_compartido' && d.count === 1
    )
  );

  const procSummary = computeLocalArchiveDependencySummary('proceso', PROC_CALIDAD_ID, {
    certificates: [certX, certY],
    sharedProcesoLinks: [
      {
        id: '78000000-0000-0000-0000-000000000001',
        id_proceso: PROC_CALIDAD_ID,
        id_certificado: CERT_Y_ID,
        id_certificado_origen: CERT_X_ID,
        deleted_at: null,
      },
    ],
  });
  assert.equal(procSummary.can_archive, false);
  assert.ok(
    procSummary.dependencies.some(
      (d) => d.table === 'proceso_certificado_compartido' && d.count === 1
    )
  );

  // Audit in CERT_X referencing (SITE_0_X_ID, PROC_CALIDAD_ID) without id_procesos_por_sitio must block PPS_X_1_ID,
  // while an equivalent audit ONLY in CERT_Y must NOT falsely block CERT_X's PPS_X_1_ID.
  const auditInX: ProgramacionAuditEntity = {
    id: AUDIT_X_ID,
    id_programa_auditoria: '99000000-0000-0000-0000-000000000001',
    id_certificado: CERT_X_ID,
    numero_certificado: certX.numero_certificado,
    id_organizacion: ORG_A1_ID,
    organizacion_nombre: certX.organizacion_nombre,
    norma_codigo: 'ISO 9001:2015',
    sector_iaf: 17,
    codigo_auditoria: 'AUD-QMS-2026-01',
    fecha_inicio: '2026-10-15',
    fecha_fin: '2026-10-16',
    tipo_auditoria: 'Seguimiento 1',
    metodologia: 'Presencial',
    estatus: 'Planificada',
    estado_ciclo: 'En Programación',
    dias_auditor: 2,
    auditor_lider_id: '00000000-0000-0000-0000-000000000101',
    auditor_lider: 'Auditor Líder',
    sede_principal_direccion: 'Av. Industrial Norte 100',
    equipo: [],
    matrizNormativa: [],
    deleted_at: null,
    sitiosMuestreo: [],
    sitiosPlan: [
      {
        id: '99000000-0000-0000-0000-000000000025',
        id_auditoria: AUDIT_X_ID,
        id_sitio: SITE_0_X_ID,
        numero_sitio: 0,
        nombre_sitio: 'Sede Central HQ',
        direccion_sitio: 'Av. Industrial Norte 100',
        tiempo_auditoria: 1,
        modalidad_evaluacion: 'Presencial',
        notas_sitio: null,
        equipoSitio: [],
        deleted_at: null,
        procesos: [
          {
            id: '99000000-0000-0000-0000-000000000045',
            id_sitios_por_auditoria: '99000000-0000-0000-0000-000000000025',
            id_procesos_por_sitio: PPS_X_1_ID,
            id_proceso: PROC_CALIDAD_ID,
            proceso_nombre: procCalidad.nombre_proceso,
            turnos: [],
            equipoProceso: [],
            deleted_at: null,
          },
        ],
      },
    ],
  };

  const ppsBlockedByCertX = computeLocalArchiveDependencySummary(
    'procesos_por_sitio',
    PPS_X_1_ID,
    { certificates: [certX, certY], audits: [auditInX] }
  );
  assert.equal(ppsBlockedByCertX.can_archive, false);

  const ppsIsolatedFromCertY = computeLocalArchiveDependencySummary(
    'procesos_por_sitio',
    PPS_X_1_ID,
    {
      certificates: [certX, certY],
      audits: [
        {
          ...auditInX,
          id: AUDIT_Y_ID,
          id_certificado: CERT_Y_ID,
          sitiosPlan: auditInX.sitiosPlan!.map((sp) => ({
            ...sp,
            procesos: sp.procesos.map((pp) => ({
              ...pp,
              id_procesos_por_sitio: '81000000-0000-0000-0000-000000000099',
            })),
          })),
        },
      ],
    }
  );
  assert.equal(ppsIsolatedFromCertY.can_archive, true);
});

test('Step 2.3 (12): Zero-UUID guard and strict UUID validation on invalid identifiers', () => {
  const { certX, allCertificates, organizaciones, conglomerados } =
    buildTestEnvironment();

  assert.throws(() =>
    resolveTargetNumeroSitioForSharedSite({
      sourceSite: {
        id: 'not-a-valid-uuid',
        id_certificado: CERT_X_ID,
        numero_sitio: 0,
        nombre_sitio: 'Sede Inválida',
      },
      targetCert: certX,
    })
  );

  const invalidPlan = planShareSitiosWithCascade({
    sourceCert: certX,
    selectedSiteIds: ['bad-site-uuid'],
    targetCertIds: ['bad-cert-uuid'],
    allCertificates,
    organizaciones,
    conglomerados,
  });
  assert.equal(invalidPlan.isExecutable, false);
  assert.ok(invalidPlan.validationErrors.length >= 2);
  for (const err of invalidPlan.validationErrors) {
    assertZeroUuidExposure(err);
  }
});
