import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { OrganizacionEntity } from './activeCertificates';
import type { ProgramacionAuditEntity } from './auditExecution';
import type { ProgramaAuditoriaEntity } from './auditPlanningEngine';
import type { ConglomeradoEntity } from './conglomeradoDomain';
import type { UserProfile } from './healthCheck';
import {
  buildDefaultOrgMultiViewFacetCategories,
  buildOrgCertPickerModalModel,
  buildOrgMultiViewRows,
  filterOrgMultiViewRows,
} from './orgMultiViewPickerDomain';
import type { VinculoEntity } from './vinculoDomain';
import type { SoftDeletableCertificado } from './vinculoDomain';
import { containsRawUuid } from './zeroUuid';

const UUIDS = {
  admin: '10000000-0000-4000-8000-000000000001',
  worker: '10000000-0000-4000-8000-000000000002',
  auditor: '10000000-0000-4000-8000-000000000003',
  client: '10000000-0000-4000-8000-000000000004',
  cong1: '20000000-0000-4000-8000-000000000001',
  cong2: '20000000-0000-4000-8000-000000000002',
  org1: '30000000-0000-4000-8000-000000000001',
  org2: '30000000-0000-4000-8000-000000000002',
  orgDeleted: '30000000-0000-4000-8000-000000000099',
  cert1: '40000000-0000-4000-8000-000000000001',
  cert2: '40000000-0000-4000-8000-000000000002',
  cert3: '40000000-0000-4000-8000-000000000003',
  cert4: '40000000-0000-4000-8000-000000000004',
  cert5Org2: '40000000-0000-4000-8000-000000000005',
  certDeleted: '40000000-0000-4000-8000-000000000099',
  progLinked: '50000000-0000-4000-8000-000000000001',
  progInd: '50000000-0000-4000-8000-000000000002',
  progNivel2: '50000000-0000-4000-8000-000000000003',
  aud1: '60000000-0000-4000-8000-000000000001',
  aud2: '60000000-0000-4000-8000-000000000002',
  aud3: '60000000-0000-4000-8000-000000000003',
  aud5Org2: '60000000-0000-4000-8000-000000000005',
  audDeleted: '60000000-0000-4000-8000-000000000099',
  vinc1: '70000000-0000-4000-8000-000000000001',
  vinc2: '70000000-0000-4000-8000-000000000002',
  vincItem1: '71000000-0000-4000-8000-000000000001',
  vincItem2: '71000000-0000-4000-8000-000000000002',
  vincItem3: '71000000-0000-4000-8000-000000000003',
};

function makeCert(overrides: Partial<SoftDeletableCertificado>): SoftDeletableCertificado {
  return {
    id: UUIDS.cert1,
    numero_certificado: 'FN-QMS-2025-001',
    id_organizacion: UUIDS.org1,
    organizacion_nombre: 'Iberometal Componentes Industriales S.A.',
    organizacion_abreviacion: 'Iberometal',
    organizacion_rif: 'J-30111222-3',
    id_norma: 'norma-1',
    norma_codigo: 'ISO 9001:2015',
    norma_titulo: 'Calidad',
    esquema: 'ISO 9001:2015',
    id_estatus: 'est-1',
    estatus: 'Activo',
    id_sector_iaf: 'sec-17',
    sector_iaf: 17,
    sector_iaf_descripcion: 'Metalmecánica',
    id_subsector_iaf: 'sub-1',
    version_actual_numero: 2,
    fecha_emision: '2025-01-10',
    fecha_vencimiento: '2028-01-09',
    alcance: 'Fabricación de componentes metálicos.',
    multisitio: false,
    sitios: [],
    procesos: [],
    turnos: [],
    noAplicables: [],
    auditorias: [],
    fechas: [],
    contactos: [],
    deleted_at: null,
    ...overrides,
  };
}

function makeAudit(overrides: Partial<ProgramacionAuditEntity>): ProgramacionAuditEntity {
  return {
    id: UUIDS.aud1,
    id_programa_auditoria: UUIDS.progLinked,
    codigo_auditoria: 'AUD-0001-0001-2026',
    id_certificado: UUIDS.cert1,
    numero_certificado: 'FN-QMS-2025-001',
    version_numero: 2,
    id_organizacion: UUIDS.org1,
    organizacion_nombre: 'Iberometal Componentes Industriales S.A.',
    organizacion_abreviacion: 'Iberometal',
    norma_codigo: 'ISO 9001:2015',
    sector_iaf: 17,
    tipo_auditoria: 'Renovación',
    tipo_vinculacion: 'Combinada',
    metodologia: 'Presencial',
    fecha_inicio: '2026-03-10',
    fecha_fin: '2026-03-12',
    dias_auditor: 3,
    estatus: 'Planificado',
    estado_ciclo: 'Programada',
    auditor_lider_id: UUIDS.auditor,
    auditor_lider: 'Carlos Méndez',
    sede_principal_direccion: 'Valencia',
    equipo: [],
    sitiosMuestreo: [],
    matrizNormativa: [],
    deleted_at: null,
    ...overrides,
  };
}

function createFixture() {
  const adminProfile: UserProfile = {
    id: UUIDS.admin,
    nombre: 'Ana Admin',
    role: 'ADMIN',
    status: 'APPROVED',
  };
  const workerProfile: UserProfile = {
    id: UUIDS.worker,
    nombre: 'Luis Worker',
    role: 'WORKER',
    status: 'APPROVED',
  };
  const auditorProfile: UserProfile = {
    id: UUIDS.auditor,
    nombre: 'Carlos Méndez',
    role: 'AUDITOR',
    status: 'APPROVED',
  };
  const clientProfile: UserProfile = {
    id: UUIDS.client,
    nombre: 'María Cliente',
    role: 'CLIENT',
    status: 'APPROVED',
  };

  const conglomerados: ConglomeradoEntity[] = [
    {
      id: UUIDS.cong1,
      codigo_grupo: 'CONG-IND-01',
      nombre: 'Grupo Industrial Iberometal',
      abreviacion: 'Iberometal',
      es_individual_auto: false,
      notas: null,
      deleted_at: null,
    },
    {
      id: UUIDS.cong2,
      codigo_grupo: 'CONG-BIO-01',
      nombre: 'BioAlimentos del Sur S.A.',
      abreviacion: 'BioAlimentos',
      es_individual_auto: true,
      notas: null,
      deleted_at: null,
    },
  ];

  const organizaciones: OrganizacionEntity[] = [
    {
      id: UUIDS.org1,
      id_grupo_empresarial: UUIDS.cong1,
      nombre: 'Iberometal Componentes Industriales S.A.',
      abreviacion: 'Iberometal',
      rif: 'J-30111222-3',
      estatus: 'Activo',
      deleted_at: null,
    },
    {
      id: UUIDS.org2,
      id_grupo_empresarial: UUIDS.cong1,
      nombre: 'Servicios Logísticos Andinos C.A.',
      abreviacion: 'Logística Andina',
      rif: 'J-40999888-1',
      estatus: 'Activo',
      deleted_at: null,
    },
    {
      id: UUIDS.orgDeleted,
      id_grupo_empresarial: UUIDS.cong2,
      nombre: 'Organización Archivada S.A.',
      abreviacion: 'Archivada',
      rif: 'J-00000000-0',
      estatus: 'Inactivo',
      deleted_at: '2026-01-01T00:00:00Z',
    },
  ];

  const certificados: SoftDeletableCertificado[] = [
    makeCert({
      id: UUIDS.cert1,
      numero_certificado: 'FN-QMS-2025-001',
      norma_codigo: 'ISO 9001:2015',
      version_actual_numero: 2,
    }),
    makeCert({
      id: UUIDS.cert2,
      numero_certificado: 'FN-EMS-2025-002',
      norma_codigo: 'ISO 14001:2015',
      version_actual_numero: 1,
    }),
    makeCert({
      id: UUIDS.cert3,
      numero_certificado: 'FN-SST-2025-003',
      norma_codigo: 'ISO 45001:2018',
      version_actual_numero: 3,
    }),
    makeCert({
      id: UUIDS.cert4,
      numero_certificado: 'FN-SIN-2025-004',
      norma_codigo: 'ISO 22000:2018',
      version_actual_numero: 1,
    }),
    makeCert({
      id: UUIDS.cert5Org2,
      id_organizacion: UUIDS.org2,
      organizacion_nombre: 'Servicios Logísticos Andinos C.A.',
      organizacion_abreviacion: 'Logística Andina',
      organizacion_rif: 'J-40999888-1',
      numero_certificado: 'FN-LOG-2025-010',
      norma_codigo: 'ISO 9001:2015',
      version_actual_numero: 1,
    }),
    makeCert({
      id: UUIDS.certDeleted,
      id_organizacion: UUIDS.org1,
      numero_certificado: 'FN-DEL-2024-099',
      deleted_at: '2026-01-02T00:00:00Z',
    }),
  ];

  const aud1 = makeAudit({
    id: UUIDS.aud1,
    id_certificado: UUIDS.cert1,
    numero_certificado: 'FN-QMS-2025-001',
    norma_codigo: 'ISO 9001:2015',
    id_programa_auditoria: UUIDS.progLinked,
    codigo_auditoria: 'AUD-0001-0001-2026',
    tipo_auditoria: 'Renovación',
    tipo_vinculacion: 'Combinada',
    auditor_lider_id: UUIDS.auditor,
    fecha_inicio: '2026-03-10',
  });

  const aud2 = makeAudit({
    id: UUIDS.aud2,
    id_certificado: UUIDS.cert2,
    numero_certificado: 'FN-EMS-2025-002',
    norma_codigo: 'ISO 14001:2015',
    id_programa_auditoria: UUIDS.progLinked,
    codigo_auditoria: 'AUD-0002-0002-2026',
    tipo_auditoria: 'Renovación',
    tipo_vinculacion: 'Combinada',
    auditor_lider_id: 'other-auditor',
    fecha_inicio: '2026-03-10',
    version_numero: 1,
  });

  const aud3 = makeAudit({
    id: UUIDS.aud3,
    id_certificado: UUIDS.cert3,
    numero_certificado: 'FN-SST-2025-003',
    norma_codigo: 'ISO 45001:2018',
    id_programa_auditoria: UUIDS.progInd,
    codigo_auditoria: 'AUD-0003-0003-2026',
    tipo_auditoria: 'Seguimiento 1',
    tipo_vinculacion: 'Individual',
    auditor_lider_id: 'other-auditor',
    fecha_inicio: '2026-04-15',
    version_numero: 3,
  });

  const aud5Org2 = makeAudit({
    id: UUIDS.aud5Org2,
    id_certificado: UUIDS.cert5Org2,
    id_organizacion: UUIDS.org2,
    organizacion_nombre: 'Servicios Logísticos Andinos C.A.',
    organizacion_abreviacion: 'Logística Andina',
    numero_certificado: 'FN-LOG-2025-010',
    norma_codigo: 'ISO 9001:2015',
    id_programa_auditoria: UUIDS.progNivel2,
    codigo_auditoria: 'AUD-0004-0004-2026',
    tipo_auditoria: 'Diagnóstico',
    tipo_vinculacion: 'Multientidad',
    auditor_lider_id: 'other-auditor',
    fecha_inicio: '2026-05-05',
    version_numero: 1,
  });

  const audDeleted = makeAudit({
    id: UUIDS.audDeleted,
    id_certificado: UUIDS.cert4,
    deleted_at: '2026-02-01T00:00:00Z',
  });

  const audits: ProgramacionAuditEntity[] = [aud1, aud2, aud3, aud5Org2, audDeleted];

  const programs: ProgramaAuditoriaEntity[] = [
    {
      id: UUIDS.progLinked,
      id_grupo_empresarial: UUIDS.cong1,
      codigo_programa: 'L-AUD-0001-0001-2026',
      etiqueta: `Lote Combinado ${UUIDS.progLinked}`,
      nivel_vinculacion: 'NIVEL_1_INTRA_ORG',
      tipo_vinculacion: 'Combinada',
      es_vinculada: true,
      auditorias: [aud1, aud2],
      deleted_at: null,
    },
    {
      id: UUIDS.progInd,
      id_grupo_empresarial: UUIDS.cong1,
      codigo_programa: null,
      etiqueta: 'Programa Individual SST',
      nivel_vinculacion: 'INDIVIDUAL',
      tipo_vinculacion: 'Individual',
      es_vinculada: false,
      auditorias: [aud3],
      deleted_at: null,
    },
    {
      id: UUIDS.progNivel2,
      id_grupo_empresarial: UUIDS.cong1,
      codigo_programa: 'L-AUD-0002-0002-2026',
      etiqueta: 'Campaña Multientidad Andina',
      nivel_vinculacion: 'NIVEL_2_INTER_ORG',
      tipo_vinculacion: 'Multientidad',
      es_vinculada: true,
      auditorias: [aud5Org2],
      deleted_at: null,
    },
  ];

  const vinculos: VinculoEntity[] = [
    {
      id: UUIDS.vinc1,
      id_grupo_empresarial: UUIDS.cong1,
      codigo_vinculo: 'VINC-N1-01',
      etiqueta: 'Caja Integrada Planta Valencia',
      nivel_vinculacion: 'NIVEL_1_INTRA_ORG',
      tipo_vinculacion: 'Integrada',
      es_vinculada: true,
      tiene_sitio_temporal: false,
      notas: null,
      deleted_at: null,
      certificados: [
        {
          id: UUIDS.vincItem1,
          id_vinculo: UUIDS.vinc1,
          id_certificado: UUIDS.cert1,
          numero_certificado: 'FN-QMS-2025-001',
          norma_codigo: 'ISO 9001:2015',
          id_organizacion: UUIDS.org1,
          organizacion_nombre: 'Iberometal Componentes Industriales S.A.',
          estatus: 'Activo',
          deleted_at: null,
        },
        {
          id: UUIDS.vincItem2,
          id_vinculo: UUIDS.vinc1,
          id_certificado: UUIDS.cert2,
          numero_certificado: 'FN-EMS-2025-002',
          norma_codigo: 'ISO 14001:2015',
          id_organizacion: UUIDS.org1,
          organizacion_nombre: 'Iberometal Componentes Industriales S.A.',
          tipo_vinculacion_override: 'Combinada',
          estatus: 'Activo',
          deleted_at: null,
        },
      ],
    },
    {
      id: UUIDS.vinc2,
      id_grupo_empresarial: UUIDS.cong1,
      codigo_vinculo: 'VINC-IND-01',
      etiqueta: 'Caja Individual SST',
      nivel_vinculacion: 'INDIVIDUAL',
      tipo_vinculacion: 'Individual',
      es_vinculada: false,
      tiene_sitio_temporal: false,
      notas: null,
      deleted_at: null,
      certificados: [
        {
          id: UUIDS.vincItem3,
          id_vinculo: UUIDS.vinc2,
          id_certificado: UUIDS.cert3,
          numero_certificado: 'FN-SST-2025-003',
          norma_codigo: 'ISO 45001:2018',
          id_organizacion: UUIDS.org1,
          organizacion_nombre: 'Iberometal Componentes Industriales S.A.',
          estatus: 'Activo',
          deleted_at: null,
        },
      ],
    },
  ];

  return {
    adminProfile,
    workerProfile,
    auditorProfile,
    clientProfile,
    conglomerados,
    organizaciones,
    certificados,
    audits,
    programs,
    vinculos,
  };
}

describe('orgMultiViewPickerDomain', () => {
  it('enforces 4-role RBAC, soft-delete exclusion, and Level-2 CLIENT isolation', () => {
    const fx = createFixture();

    const adminRows = buildOrgMultiViewRows({
      profile: fx.adminProfile,
      organizaciones: fx.organizaciones,
      conglomerados: fx.conglomerados,
      certificados: fx.certificados,
      audits: fx.audits,
      programs: fx.programs,
      vinculos: fx.vinculos,
    });
    assert.equal(adminRows.length, 2);
    const org1Admin = adminRows.find((r) => r.orgId === UUIDS.org1);
    assert.ok(org1Admin);
    // Deleted cert4's sibling certDeleted must not appear; cert4 stays visible (no audits)
    assert.equal(org1Admin.certsCount, 4);
    assert.equal(org1Admin.auditsCount, 3);
    assert.equal(org1Admin.linkedAuditGroupsCount, 1);
    assert.equal(org1Admin.linkedVinculoBoxesCount, 1);

    const workerRows = buildOrgMultiViewRows({
      profile: fx.workerProfile,
      organizaciones: fx.organizaciones,
      conglomerados: fx.conglomerados,
      certificados: fx.certificados,
      audits: fx.audits,
      programs: fx.programs,
      vinculos: fx.vinculos,
    });
    assert.equal(workerRows.length, 2);

    // AUDITOR only sees orgs with assigned audits/certs and only assigned certs
    const auditorRows = buildOrgMultiViewRows({
      profile: fx.auditorProfile,
      organizaciones: fx.organizaciones,
      conglomerados: fx.conglomerados,
      certificados: fx.certificados,
      audits: fx.audits,
      programs: fx.programs,
      vinculos: fx.vinculos,
    });
    assert.equal(auditorRows.length, 1);
    assert.equal(auditorRows[0].orgId, UUIDS.org1);
    assert.equal(auditorRows[0].certsCount, 1);
    assert.equal(auditorRows[0].certificates[0].certId, UUIDS.cert1);

    // CLIENT Level-2 isolation: strictly authorizedClientOrgIds without sibling org leaks
    const clientRows = buildOrgMultiViewRows({
      profile: fx.clientProfile,
      organizaciones: fx.organizaciones,
      conglomerados: fx.conglomerados,
      certificados: fx.certificados,
      audits: fx.audits,
      programs: fx.programs,
      vinculos: fx.vinculos,
      authorizedClientOrgIds: [UUIDS.org2],
    });
    assert.equal(clientRows.length, 1);
    assert.equal(clientRows[0].orgId, UUIDS.org2);
    assert.equal(clientRows[0].certsCount, 1);
    assert.ok(!clientRows.some((r) => r.orgId === UUIDS.org1));

    // Pending / rejected / null profiles return empty
    const pendingRows = buildOrgMultiViewRows({
      profile: { ...fx.adminProfile, status: 'PENDING' },
      organizaciones: fx.organizaciones,
      certificados: fx.certificados,
    });
    assert.equal(pendingRows.length, 0);
  });

  it('builds searchHaystack across org, RIF, cert, norm, audit code, codename and domain cells with Zero-UUID', () => {
    const fx = createFixture();
    const rows = buildOrgMultiViewRows<{ fase: string }>({
      profile: fx.adminProfile,
      organizaciones: fx.organizaciones,
      conglomerados: fx.conglomerados,
      certificados: fx.certificados,
      audits: fx.audits,
      programs: fx.programs,
      vinculos: fx.vinculos,
      resolveCertMeta: (ctx) => ({
        domainExtra: { fase: ctx.latestAudit ? 'Programada' : 'Pendiente' },
        domainCells: { fase: ctx.latestAudit ? 'Fecha confirmada' : 'Sin fecha' },
        searchText: ctx.certificado.norma_codigo === 'ISO 14001:2015' ? 'Planta Valencia' : '',
      }),
    });

    const facets = buildDefaultOrgMultiViewFacetCategories<{ fase: string }>();
    assert.equal(
      filterOrgMultiViewRows(rows, 'FN-EMS-2025-002', facets, {}).length,
      1
    );
    assert.equal(
      filterOrgMultiViewRows(rows, '2026-03 Renov.', facets, {}).length,
      1
    );
    assert.equal(
      filterOrgMultiViewRows(rows, 'AUD-0004-0004-2026', facets, {}).length,
      1
    );
    assert.equal(
      filterOrgMultiViewRows(rows, 'J-40999888-1', facets, {}).length,
      1
    );
    assert.equal(
      filterOrgMultiViewRows(rows, 'Planta Valencia', facets, {}).length,
      1
    );

    for (const row of rows) {
      assert.equal(containsRawUuid(row.nombreCorto), false);
      assert.equal(containsRawUuid(row.conglomeradoShortName), false);
      assert.equal(containsRawUuid(row.searchHaystack), false);
    }
  });

  it('groups linked audits contiguously first, then Individual, then Sin auditorías, recalculating groupRowSpan on search', () => {
    const fx = createFixture();
    const model = buildOrgCertPickerModalModel({
      orgId: UUIDS.org1,
      profile: fx.adminProfile,
      organizaciones: fx.organizaciones,
      conglomerados: fx.conglomerados,
      certificados: fx.certificados,
      audits: fx.audits,
      programs: fx.programs,
      vinculos: fx.vinculos,
    });

    assert.ok(model);
    assert.equal(model.totalCertsCount, 4);
    assert.equal(model.filteredCertsCount, 4);
    assert.equal(model.linkedGroupsCount, 1);
    assert.equal(model.rows.length, 4);

    // Linked group (2 certs) first & contiguous
    assert.equal(model.rows[0].isLinkedGroup, true);
    assert.equal(model.rows[0].isFirstRowInGroup, true);
    assert.equal(model.rows[0].groupRowSpan, 2);
    assert.equal(model.rows[0].numero_certificado, 'FN-EMS-2025-002');
    assert.ok(model.rows[0].groupLabel.includes('Combinada'));
    assert.equal(containsRawUuid(model.rows[0].groupLabel), false);

    assert.equal(model.rows[1].isLinkedGroup, true);
    assert.equal(model.rows[1].isFirstRowInGroup, false);
    assert.equal(model.rows[1].groupRowSpan, 2);
    assert.equal(model.rows[1].groupKey, model.rows[0].groupKey);
    assert.equal(model.rows[1].numero_certificado, 'FN-QMS-2025-001');

    // Individual third
    assert.equal(model.rows[2].isLinkedGroup, false);
    assert.equal(model.rows[2].groupBadgeText, 'Individual');
    assert.equal(model.rows[2].isFirstRowInGroup, true);
    assert.equal(model.rows[2].groupRowSpan, 1);

    // Sin auditorías last
    assert.equal(model.rows[3].isLinkedGroup, false);
    assert.equal(model.rows[3].groupBadgeText, 'Sin auditorías');
    assert.equal(model.rows[3].isFirstRowInGroup, true);
    assert.equal(model.rows[3].groupRowSpan, 1);
    assert.equal(model.rows[3].auditId, null);

    // Filtering to 1 cert inside the linked group recalculates groupRowSpan = 1 and isFirstRowInGroup = true
    const filteredOne = buildOrgCertPickerModalModel({
      orgId: UUIDS.org1,
      modalSearchQuery: 'FN-QMS-2025-001',
      profile: fx.adminProfile,
      organizaciones: fx.organizaciones,
      conglomerados: fx.conglomerados,
      certificados: fx.certificados,
      audits: fx.audits,
      programs: fx.programs,
      vinculos: fx.vinculos,
    });
    assert.ok(filteredOne);
    assert.equal(filteredOne.rows.length, 1);
    assert.equal(filteredOne.rows[0].isFirstRowInGroup, true);
    assert.equal(filteredOne.rows[0].groupRowSpan, 1);
    assert.equal(filteredOne.rows[0].certId, UUIDS.cert1);

    // Filtering by linked group keyword keeps both certs contiguous with groupRowSpan = 2
    const filteredGroup = buildOrgCertPickerModalModel({
      orgId: UUIDS.org1,
      modalSearchQuery: 'Combinada',
      profile: fx.adminProfile,
      organizaciones: fx.organizaciones,
      conglomerados: fx.conglomerados,
      certificados: fx.certificados,
      audits: fx.audits,
      programs: fx.programs,
      vinculos: fx.vinculos,
    });
    assert.ok(filteredGroup);
    assert.equal(filteredGroup.rows.length, 2);
    assert.equal(filteredGroup.rows[0].groupRowSpan, 2);
    assert.equal(filteredGroup.rows[0].isFirstRowInGroup, true);
    assert.equal(filteredGroup.rows[1].isFirstRowInGroup, false);
  });

  it('supports vinculo grouping mode (boxed Vinculado, Individual, and Libre) and prevents CLIENT Level-2 leaks in modal', () => {
    const fx = createFixture();
    const vinculoModel = buildOrgCertPickerModalModel({
      orgId: UUIDS.org1,
      groupingMode: 'vinculo',
      profile: fx.adminProfile,
      organizaciones: fx.organizaciones,
      conglomerados: fx.conglomerados,
      certificados: fx.certificados,
      audits: fx.audits,
      programs: fx.programs,
      vinculos: fx.vinculos,
    });
    assert.ok(vinculoModel);
    assert.equal(vinculoModel.rows.length, 4);
    assert.equal(vinculoModel.rows[0].isLinkedGroup, true);
    assert.equal(vinculoModel.rows[0].groupRowSpan, 2);
    assert.equal(vinculoModel.rows[1].isLinkedGroup, true);
    assert.equal(vinculoModel.rows[1].isFirstRowInGroup, false);
    assert.equal(vinculoModel.rows[2].groupBadgeText, 'Individual');
    assert.equal(vinculoModel.rows[3].groupBadgeText, 'Libre');

    // CLIENT cannot open modal for unauthorized org1
    const unauthorizedModal = buildOrgCertPickerModalModel({
      orgId: UUIDS.org1,
      profile: fx.clientProfile,
      organizaciones: fx.organizaciones,
      conglomerados: fx.conglomerados,
      certificados: fx.certificados,
      audits: fx.audits,
      programs: fx.programs,
      vinculos: fx.vinculos,
      authorizedClientOrgIds: [UUIDS.org2],
    });
    assert.equal(unauthorizedModal, null);
  });
});
