import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCampaignStep4Rows,
  buildCertificateSitioRows,
  buildSiteCoverageModalModel,
  buildSiteCycleMatrixForAudit,
  buildSitioLinkedAuditModels,
  canRemoveSiteFromAudit,
  canToggleTemporalSiteOff,
  isPrincipalHqSite,
  matchesStep4Preset,
  sliceCycleWindowColumns,
  sortSiteCoverageRows,
  validateAuditSiteToggle,
  type CandidateSiteEntity,
  type TemporalSiteRowLike,
} from './designacionSitioDomain';
import type { AuditoriaSitioPlanItem, ProgramaAuditoriaEntity } from './auditPlanningEngine';
import type { ProgramacionAuditEntity } from './auditExecution';

const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const UUID_CERT = '40000000-0000-0000-0000-000000000001';
const UUID_OTHER_CERT = '40000000-0000-0000-0000-000000000002';
const UUID_ORG = '30000000-0000-0000-0000-000000000001';
const UUID_GRUPO = '20000000-0000-0000-0000-000000000001';

const UUID_SITIO_HQ = '50000000-0000-0000-0000-000000000000';
const UUID_SITIO_1 = '50000000-0000-0000-0000-000000000001';
const UUID_SITIO_2 = '50000000-0000-0000-0000-000000000002';
const UUID_SITIO_3 = '50000000-0000-0000-0000-000000000003';
const UUID_SITIO_OTHER = '50000000-0000-0000-0000-000000000090';

function makeSite(overrides: Partial<CandidateSiteEntity>): CandidateSiteEntity {
  return {
    id: UUID_SITIO_HQ,
    id_certificado: UUID_CERT,
    numero_sitio: 0,
    nombre_sitio: 'Sede Principal HQ',
    direccion_sitio: 'Av. Industrial 100',
    deleted_at: null,
    ...overrides,
  };
}

function makePlanItem(
  idAuditoria: string,
  site: CandidateSiteEntity,
  overrides: Partial<AuditoriaSitioPlanItem> = {}
): AuditoriaSitioPlanItem {
  return {
    id: `90000000-0000-0000-0000-${idAuditoria.slice(-6)}${String(site.numero_sitio).padStart(6, '0')}`,
    id_auditoria: idAuditoria,
    id_sitio: site.id,
    numero_sitio: site.numero_sitio,
    nombre_sitio: site.nombre_sitio,
    direccion_sitio: site.direccion_sitio,
    tiempo_auditoria: 1,
    modalidad_evaluacion: 'Presencial',
    procesos: [],
    equipoSitio: [],
    deleted_at: null,
    ...overrides,
  };
}

function makeAudit(overrides: Partial<ProgramacionAuditEntity>): ProgramacionAuditEntity {
  return {
    id: '80000000-0000-0000-0000-000000000010',
    id_programa_auditoria: '7a000000-0000-0000-0000-000000000010',
    codigo_auditoria: 'AUD-2026-001',
    id_certificado: UUID_CERT,
    numero_certificado: 'FN-QMS-2025-001',
    id_organizacion: UUID_ORG,
    organizacion_nombre: 'Iberometal C.A.',
    norma_codigo: 'ISO 9001:2015',
    sector_iaf: 17,
    tipo_auditoria: 'Seguimiento 2',
    metodologia: 'Presencial',
    fecha_inicio: '2026-06-15',
    fecha_fin: '2026-06-17',
    dias_auditor: 2,
    tiempo_auditoria: 2,
    estatus: 'Planificado',
    estado_ciclo: 'Programada',
    auditor_lider_id: '10000000-0000-0000-0000-000000000001',
    auditor_lider: 'Carlos Mendoza',
    sede_principal_direccion: 'Av. Industrial 100',
    equipo: [],
    sitiosMuestreo: [],
    sitiosPlan: [],
    matrizNormativa: [],
    fechas: [],
    deleted_at: null,
    ...overrides,
  };
}

function makeProgram(
  id: string,
  etiqueta: string,
  auditorias: ProgramacionAuditEntity[],
  esVinculada = auditorias.length > 1
): ProgramaAuditoriaEntity {
  return {
    id,
    id_vinculo: '7c000000-0000-0000-0000-000000000001',
    id_grupo_empresarial: UUID_GRUPO,
    codigo_programa: `PROG-${id.slice(-4)}`,
    etiqueta,
    nivel_vinculacion: esVinculada ? 'NIVEL_1_INTRA_ORG' : 'INDIVIDUAL',
    tipo_vinculacion: esVinculada ? 'Integrada' : 'Individual',
    es_vinculada: esVinculada,
    tiene_sitio_temporal: false,
    auditorias,
    deleted_at: null,
  };
}

test('Step 4.2: buildSiteCycleMatrixForAudit places Sitio 0 (HQ) first, computes lastAuditedLabel, auditedCountInWindow, and timeline statuses', () => {
  const hq = makeSite({ id: UUID_SITIO_HQ, numero_sitio: 0, nombre_sitio: 'Sede Principal HQ' });
  const branch1 = makeSite({ id: UUID_SITIO_1, numero_sitio: 1, nombre_sitio: 'Planta Valencia' });
  const branch2 = makeSite({ id: UUID_SITIO_2, numero_sitio: 2, nombre_sitio: 'Centro Logístico' });
  const archivedSite = makeSite({
    id: '50000000-0000-0000-0000-000000000099',
    numero_sitio: 3,
    nombre_sitio: 'Bodega Cerrada',
    deleted_at: '2025-01-01T00:00:00Z',
  });

  // Pass sites intentionally out of order
  const sites = [branch2, archivedSite, branch1, hq];

  const audit2024 = makeAudit({
    id: '80000000-0000-0000-0000-000000000001',
    tipo_auditoria: 'Etapa 2',
    estado_ciclo: 'Auditada',
    fechas: [
      {
        id: '81000000-0000-0000-0000-000000000001',
        id_auditoria: '80000000-0000-0000-0000-000000000001',
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'REAL',
        anio: null,
        mes: null,
        fecha_inicio: '2024-11-10',
        fecha_fin: '2024-11-12',
        deleted_at: null,
      },
    ],
    sitiosPlan: [makePlanItem('80000000-0000-0000-0000-000000000001', hq)],
  });

  const audit2025 = makeAudit({
    id: '80000000-0000-0000-0000-000000000002',
    tipo_auditoria: 'Seg. 1',
    estado_ciclo: 'Auditada',
    fechas: [
      {
        id: '81000000-0000-0000-0000-000000000002',
        id_auditoria: '80000000-0000-0000-0000-000000000002',
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'REAL',
        anio: null,
        mes: null,
        fecha_inicio: '2025-11-18',
        fecha_fin: '2025-11-19',
        deleted_at: null,
      },
    ],
    sitiosPlan: [
      makePlanItem('80000000-0000-0000-0000-000000000002', hq),
      makePlanItem('80000000-0000-0000-0000-000000000002', branch1),
    ],
  });

  const currentAudit2026 = makeAudit({
    id: '80000000-0000-0000-0000-000000000003',
    tipo_auditoria: 'Seg. 2',
    estado_ciclo: 'Programada',
    fechas: [
      {
        id: '81000000-0000-0000-0000-000000000003',
        id_auditoria: '80000000-0000-0000-0000-000000000003',
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'PROGRAMADA_EXACTA',
        anio: null,
        mes: null,
        fecha_inicio: '2026-11-15',
        fecha_fin: '2026-11-17',
        deleted_at: null,
      },
    ],
    sitiosPlan: [
      makePlanItem('80000000-0000-0000-0000-000000000003', hq),
      makePlanItem('80000000-0000-0000-0000-000000000003', branch2),
    ],
  });

  const future2027 = makeAudit({
    id: '80000000-0000-0000-0000-000000000004',
    tipo_auditoria: 'Renovación',
    estado_ciclo: 'Borrador',
    fechas: [
      {
        id: '81000000-0000-0000-0000-000000000004',
        id_auditoria: '80000000-0000-0000-0000-000000000004',
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'PREPROGRAMADA_MES',
        anio: 2027,
        mes: 11,
        fecha_inicio: null,
        fecha_fin: null,
        deleted_at: null,
      },
    ],
    sitiosPlan: [makePlanItem('80000000-0000-0000-0000-000000000004', hq)],
  });

  const cancelled2025 = makeAudit({
    id: '80000000-0000-0000-0000-000000000005',
    estado_ciclo: 'Cancelada',
    fecha_inicio: '2025-05-01',
    sitiosPlan: [makePlanItem('80000000-0000-0000-0000-000000000005', branch2)],
  });

  const otherCertAudit = makeAudit({
    id: '80000000-0000-0000-0000-000000000006',
    id_certificado: UUID_OTHER_CERT,
    fecha_inicio: '2025-02-01',
  });

  const matrix = buildSiteCycleMatrixForAudit(currentAudit2026, sites, [
    future2027,
    audit2024,
    cancelled2025,
    otherCertAudit,
    currentAudit2026,
    audit2025,
  ]);

  // Excludes deleted site & orders HQ (0) -> 1 -> 2
  assert.equal(matrix.length, 3);
  assert.deepEqual(
    matrix.map((r) => r.site.numero_sitio),
    [0, 1, 2]
  );

  const hqRow = matrix[0];
  assert.equal(hqRow.isPrincipalHq, true);
  assert.equal(hqRow.isSelectedInCurrentAudit, true);
  assert.equal(hqRow.canDeselect, false);
  assert.equal(hqRow.totalVisitsInWindow, 4);
  assert.equal(hqRow.currentAuditIndex, 2);
  assert.equal(hqRow.auditedCountInWindow, 2);
  assert.equal(hqRow.lastAuditedLabel, '18/11/2025 · Seg. 1');
  assert.deepEqual(
    hqRow.timelineCells.map((c) => c.status),
    ['AUDITADO', 'AUDITADO', 'SELECCIONADO', 'PREPROGRAMADO']
  );

  const b1Row = matrix[1];
  assert.equal(b1Row.isPrincipalHq, false);
  assert.equal(b1Row.isSelectedInCurrentAudit, false);
  assert.equal(b1Row.auditedCountInWindow, 1);
  assert.equal(b1Row.lastAuditedLabel, '18/11/2025 · Seg. 1');
  assert.deepEqual(
    b1Row.timelineCells.map((c) => c.status),
    ['NO_INCLUIDO', 'AUDITADO', 'PENDIENTE', 'SIN_DEFINIR']
  );

  const b2Row = matrix[2];
  assert.equal(b2Row.isSelectedInCurrentAudit, true);
  assert.equal(b2Row.auditedCountInWindow, 0);
  assert.equal(b2Row.lastAuditedLabel, 'Nunca auditado');
  assert.deepEqual(
    b2Row.timelineCells.map((c) => c.status),
    ['NO_INCLUIDO', 'NO_INCLUIDO', 'SELECCIONADO', 'SIN_DEFINIR']
  );
});

test('Sitio 0 (HQ) mandatory lock prevents removing HQ even when >= 2 sites are selected, while secondary sites remain removable', () => {
  const hq = makeSite({ id: UUID_SITIO_HQ, numero_sitio: 0, nombre_sitio: 'Sede Principal HQ' });
  const branch1 = makeSite({ id: UUID_SITIO_1, numero_sitio: 1, nombre_sitio: 'Planta Valencia' });
  const branch2 = makeSite({ id: UUID_SITIO_2, numero_sitio: 2, nombre_sitio: 'Centro Logístico' });

  const singleSiteAudit = makeAudit({
    sitiosPlan: [makePlanItem('80000000-0000-0000-0000-000000000010', hq)],
  });
  const singleMatrix = buildSiteCycleMatrixForAudit(
    singleSiteAudit,
    [hq, branch1],
    [singleSiteAudit]
  );

  assert.equal(singleMatrix[0].isSelectedInCurrentAudit, true);
  assert.equal(singleMatrix[0].canDeselect, false);
  assert.equal(singleMatrix[1].isSelectedInCurrentAudit, false);
  assert.equal(singleMatrix[1].canDeselect, true);

  const multiSiteAudit = makeAudit({
    sitiosPlan: [
      makePlanItem('80000000-0000-0000-0000-000000000010', hq),
      makePlanItem('80000000-0000-0000-0000-000000000010', branch1),
    ],
  });
  const multiMatrix = buildSiteCycleMatrixForAudit(
    multiSiteAudit,
    [hq, branch1, branch2],
    [multiSiteAudit]
  );

  assert.equal(isPrincipalHqSite(hq), true);
  assert.equal(isPrincipalHqSite(branch1), false);
  assert.equal(multiMatrix[0].canDeselect, false, 'Sitio 0 HQ must stay locked even with 2+ sites');
  assert.equal(multiMatrix[1].canDeselect, true, 'Secondary site #1 must be deselectable');
  assert.equal(canRemoveSiteFromAudit(hq, multiSiteAudit.sitiosPlan), false);
  assert.equal(canRemoveSiteFromAudit(branch1, multiSiteAudit.sitiosPlan), true);
  assert.equal(canRemoveSiteFromAudit(branch2, multiSiteAudit.sitiosPlan), false);
});

test('validateAuditSiteToggle enforces staff RBAC, HQ mandatory lock, certificate membership, and Zero-UUID errors', () => {
  const hq = makeSite({ id: UUID_SITIO_HQ, numero_sitio: 0, nombre_sitio: 'Sede Principal HQ' });
  const branch1 = makeSite({ id: UUID_SITIO_1, numero_sitio: 1, nombre_sitio: 'Planta Valencia' });
  const branch2 = makeSite({ id: UUID_SITIO_2, numero_sitio: 2, nombre_sitio: 'Centro Logístico' });
  const foreignSite = makeSite({
    id: UUID_SITIO_OTHER,
    id_certificado: UUID_OTHER_CERT,
    numero_sitio: 1,
    nombre_sitio: 'Sede Externa',
  });

  const audit = makeAudit({
    sitiosPlan: [
      makePlanItem('80000000-0000-0000-0000-000000000010', hq),
      makePlanItem('80000000-0000-0000-0000-000000000010', branch1),
    ],
  });

  const nonStaffRes = validateAuditSiteToggle({
    audit,
    siteId: branch1.id,
    certificateSites: [hq, branch1, branch2],
    isStaff: false,
  });
  assert.equal(nonStaffRes.valid, false);
  assert.equal(UUID_REGEX.test(nonStaffRes.error || ''), false);

  const removeHqRes = validateAuditSiteToggle({
    audit,
    siteId: hq.id,
    certificateSites: [hq, branch1, branch2],
    isStaff: true,
  });
  assert.equal(removeHqRes.valid, false);
  assert.equal(removeHqRes.isPrincipalHq, true);
  assert.match(removeHqRes.error || '', /Sitio 0.*obligatorio/i);
  assert.equal(UUID_REGEX.test(removeHqRes.error || ''), false);

  const removeBranch1Res = validateAuditSiteToggle({
    audit,
    siteId: branch1.id,
    certificateSites: [hq, branch1, branch2],
    isStaff: true,
  });
  assert.equal(removeBranch1Res.valid, true);
  assert.equal(removeBranch1Res.action, 'REMOVE');
  assert.ok(removeBranch1Res.sitioAuditoriaId);

  const addBranch2Res = validateAuditSiteToggle({
    audit,
    siteId: branch2.id,
    certificateSites: [hq, branch1, branch2],
    isStaff: true,
  });
  assert.equal(addBranch2Res.valid, true);
  assert.equal(addBranch2Res.action, 'ADD');

  const foreignRes = validateAuditSiteToggle({
    audit,
    siteId: foreignSite.id,
    certificateSites: [hq, branch1, branch2],
    isStaff: true,
  });
  assert.equal(foreignRes.valid, false);
  assert.equal(UUID_REGEX.test(foreignRes.error || ''), false);
});

test('buildSitioLinkedAuditModels keeps site selections independent per linked audit and locks Sitio 0 HQ', () => {
  const hq1 = makeSite({ id: UUID_SITIO_HQ, numero_sitio: 0, nombre_sitio: 'HQ QMS' });
  const b1 = makeSite({ id: UUID_SITIO_1, numero_sitio: 1, nombre_sitio: 'Planta A' });
  const b2 = makeSite({ id: UUID_SITIO_2, numero_sitio: 2, nombre_sitio: 'Planta B' });

  const hqEms = makeSite({
    id: '50000000-0000-0000-0000-000000000010',
    id_certificado: UUID_OTHER_CERT,
    numero_sitio: 0,
    nombre_sitio: 'HQ EMS',
  });
  const ems1 = makeSite({
    id: '50000000-0000-0000-0000-000000000011',
    id_certificado: UUID_OTHER_CERT,
    numero_sitio: 1,
    nombre_sitio: 'Planta EMS',
  });

  const auditA = makeAudit({
    id: '80000000-0000-0000-0000-000000000101',
    codigo_auditoria: 'AUD-A',
    id_certificado: UUID_CERT,
    sitiosPlan: [
      makePlanItem('80000000-0000-0000-0000-000000000101', hq1),
      makePlanItem('80000000-0000-0000-0000-000000000101', b1),
    ],
  });
  const auditB = makeAudit({
    id: '80000000-0000-0000-0000-000000000102',
    codigo_auditoria: 'AUD-B',
    id_certificado: UUID_OTHER_CERT,
    numero_certificado: 'FN-EMS-2026-002',
    norma_codigo: 'ISO 14001:2015',
    sitiosPlan: [
      makePlanItem('80000000-0000-0000-0000-000000000102', hqEms),
    ],
  });

  const prog = makeProgram('7a000000-0000-0000-0000-000000000050', 'Campaña Integrada', [
    auditA,
    auditB,
  ]);

  const models = buildSitioLinkedAuditModels({
    activeAudit: auditA,
    allAudits: [auditA, auditB],
    programs: [prog],
    getCandidateSites: (aud) =>
      aud.id_certificado === UUID_CERT ? [hq1, b1, b2] : [hqEms, ems1],
    isStaff: true,
  });

  assert.equal(models.length, 2);
  const modelA = models.find((m) => m.audit.id === auditA.id)!;
  const modelB = models.find((m) => m.audit.id === auditB.id)!;
  assert.ok(modelA && modelB);
  assert.equal(modelA.isActive, true);
  assert.equal(modelA.selectedCount, 2);
  assert.equal(modelA.unvisitedSitesCount, 1);
  assert.equal(modelA.siteItems[0].isPrincipalHq, true);
  assert.equal(modelA.siteItems[0].isSelected, true);
  assert.equal(modelA.siteItems[0].canToggle, false);
  assert.equal(modelA.siteItems[0].lockedReason, 'HQ_MANDATORY');
  assert.equal(modelA.siteItems[1].isSelected, true);
  assert.equal(modelA.siteItems[1].canToggle, true);
  assert.equal(modelA.siteItems[2].isSelected, false);
  assert.equal(modelA.siteItems[2].canToggle, true);

  assert.equal(modelB.isActive, false);
  assert.equal(modelB.selectedCount, 1);
  assert.equal(modelB.siteItems[0].lockedReason, 'HQ_MANDATORY');
  assert.equal(modelB.siteItems[1].isSelected, false);
  assert.equal(modelB.siteItems[1].canToggle, true);
});

test('buildSiteCoverageModalModel & sortSiteCoverageRows evaluate Past/Current/Future/Unvisited and support all 5 sort modes', () => {
  const hq = makeSite({ id: UUID_SITIO_HQ, numero_sitio: 0, nombre_sitio: 'Zeta HQ' });
  const branch1 = makeSite({ id: UUID_SITIO_1, numero_sitio: 1, nombre_sitio: 'Alfa Planta' });
  const branch2 = makeSite({ id: UUID_SITIO_2, numero_sitio: 2, nombre_sitio: 'Gamma Bodega' });
  const branch3 = makeSite({ id: UUID_SITIO_3, numero_sitio: 3, nombre_sitio: 'Beta Sucursal' });

  const pastAudit1 = makeAudit({
    id: '80000000-0000-0000-0000-000000000201',
    codigo_auditoria: 'AUD-2024',
    tipo_auditoria: 'Otorgamiento',
    estado_ciclo: 'Cerrada',
    fecha_inicio: '2024-05-10',
    sitiosPlan: [
      makePlanItem('80000000-0000-0000-0000-000000000201', hq),
      makePlanItem('80000000-0000-0000-0000-000000000201', branch1),
    ],
  });
  const pastAudit2 = makeAudit({
    id: '80000000-0000-0000-0000-000000000202',
    codigo_auditoria: 'AUD-2025',
    tipo_auditoria: 'Seguimiento 1',
    estado_ciclo: 'Cerrada',
    fecha_inicio: '2025-05-10',
    sitiosPlan: [
      makePlanItem('80000000-0000-0000-0000-000000000202', hq),
      makePlanItem('80000000-0000-0000-0000-000000000202', branch1),
    ],
  });
  const currentAudit = makeAudit({
    id: '80000000-0000-0000-0000-000000000203',
    codigo_auditoria: 'AUD-2026',
    tipo_auditoria: 'Seguimiento 2',
    estado_ciclo: 'Programada',
    fecha_inicio: '2026-05-10',
    sitiosPlan: [
      makePlanItem('80000000-0000-0000-0000-000000000203', hq),
    ],
  });
  const futureAudit = makeAudit({
    id: '80000000-0000-0000-0000-000000000204',
    codigo_auditoria: 'AUD-2027',
    tipo_auditoria: 'Renovación',
    estado_ciclo: 'En Programación',
    fecha_inicio: '2027-05-10',
    sitiosPlan: [
      makePlanItem('80000000-0000-0000-0000-000000000204', hq),
      makePlanItem('80000000-0000-0000-0000-000000000204', branch2),
    ],
  });

  const modal = buildSiteCoverageModalModel({
    currentAudit,
    certificateSites: [branch3, branch1, hq, branch2],
    allAudits: [futureAudit, pastAudit2, currentAudit, pastAudit1],
    sortMode: 'UNVISITED_FIRST',
    isStaff: true,
  });

  assert.equal(modal.totalSitesCount, 4);
  assert.equal(modal.pastCoveredSitesCount, 2); // hq & branch1
  assert.equal(modal.currentAssignedCount, 1); // hq
  assert.equal(modal.futureScheduledSitesCount, 2); // hq & branch2
  assert.equal(modal.unvisitedSitesCount, 1); // branch3
  assert.equal(modal.pastAuditsCount, 2);
  assert.equal(modal.futureAuditsCount, 1);

  // UNVISITED_FIRST: SIN_COBERTURA (branch3) -> PROGRAMADO_FUTURO (branch2) -> CUBIERTO_PASADO (branch1) -> CUBIERTO_ACTUAL (hq)
  assert.deepEqual(
    modal.rows.map((r) => r.site.numero_sitio),
    [3, 2, 1, 0]
  );
  assert.equal(modal.rows[0].coverageStatus, 'SIN_COBERTURA');
  assert.equal(modal.rows[1].coverageStatus, 'PROGRAMADO_FUTURO');
  assert.equal(modal.rows[2].coverageStatus, 'CUBIERTO_PASADO');
  assert.equal(modal.rows[3].coverageStatus, 'CUBIERTO_ACTUAL');
  assert.equal(modal.rows[3].canToggleCurrent, false);

  assert.deepEqual(
    sortSiteCoverageRows(modal.rows, 'SITE_NUMBER').map((r) => r.site.numero_sitio),
    [0, 1, 2, 3]
  );
  assert.deepEqual(
    sortSiteCoverageRows(modal.rows, 'CURRENT_FIRST').map((r) => r.site.numero_sitio),
    [0, 1, 2, 3]
  );
  assert.deepEqual(
    sortSiteCoverageRows(modal.rows, 'LEAST_AUDITED').map((r) => r.site.numero_sitio),
    [2, 3, 0, 1]
  );
  assert.deepEqual(
    sortSiteCoverageRows(modal.rows, 'NAME_ASC').map((r) => r.site.nombre_sitio),
    ['Alfa Planta', 'Beta Sucursal', 'Gamma Bodega', 'Zeta HQ']
  );
});

test('Step 4.2: sliceCycleWindowColumns enforces maxVisibleCols and exact prev/next paging flags', () => {
  const cols = ['2022', '2023', '2024', '2025', '2026', '2027', '2028'];

  // Desktop 5 cols centered on index 3 ('2025') -> [2023, 2024, 2025, 2026, 2027]
  const desktopCenter = sliceCycleWindowColumns(cols, 3, 0, 5);
  assert.deepEqual(desktopCenter.visible, ['2023', '2024', '2025', '2026', '2027']);
  assert.equal(desktopCenter.startIndex, 1);
  assert.equal(desktopCenter.canPagePrev, true);
  assert.equal(desktopCenter.canPageNext, true);

  // Page left -> clamps cleanly to index 0
  const pagedLeft = sliceCycleWindowColumns(cols, 3, -2, 5);
  assert.deepEqual(pagedLeft.visible, ['2022', '2023', '2024', '2025', '2026']);
  assert.equal(pagedLeft.startIndex, 0);
  assert.equal(pagedLeft.canPagePrev, false);
  assert.equal(pagedLeft.canPageNext, true);

  // Page right -> clamps cleanly to end
  const pagedRight = sliceCycleWindowColumns(cols, 3, 5, 5);
  assert.deepEqual(pagedRight.visible, ['2024', '2025', '2026', '2027', '2028']);
  assert.equal(pagedRight.startIndex, 2);
  assert.equal(pagedRight.canPagePrev, true);
  assert.equal(pagedRight.canPageNext, false);

  // Mobile 3 cols
  const mobileSlice = sliceCycleWindowColumns(cols, 3, 0, 3);
  assert.equal(mobileSlice.visible.length, 3);
  assert.deepEqual(mobileSlice.visible, ['2024', '2025', '2026']);
  assert.equal(mobileSlice.canPagePrev, true);
  assert.equal(mobileSlice.canPageNext, true);

  // Short list <= maxVisibleCols -> returns all without paging buttons
  const shortSlice = sliceCycleWindowColumns(['2025', '2026', '2027'], 1, 0, 5);
  assert.deepEqual(shortSlice.visible, ['2025', '2026', '2027']);
  assert.equal(shortSlice.canPagePrev, false);
  assert.equal(shortSlice.canPageNext, false);
  assert.equal(shortSlice.startIndex, 0);
});

test('Step 4.2: canToggleTemporalSiteOff blocks active temporal sites without exposing UUIDs and allows archived-only', () => {
  const targetAuditId = '80000000-0000-0000-0000-000000000010';
  const otherAuditId = '80000000-0000-0000-0000-000000000011';

  const temporalSites: TemporalSiteRowLike[] = [
    {
      id: '9a000000-0000-0000-0000-000000000001',
      id_auditoria: targetAuditId,
      deleted_at: null,
    },
    {
      id: '9a000000-0000-0000-0000-000000000002',
      id_auditoria: targetAuditId,
      deleted_at: '2026-01-15T12:00:00Z',
    },
    {
      id: '9a000000-0000-0000-0000-000000000003',
      id_auditoria: otherAuditId,
      deleted_at: null,
    },
  ];

  const blocked = canToggleTemporalSiteOff(targetAuditId, temporalSites);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.reason);
  assert.match(blocked.reason, /1 sitio\(s\) temporal\(es\)/i);
  assert.equal(UUID_REGEX.test(blocked.reason), false);

  const archivedOnly = canToggleTemporalSiteOff(targetAuditId, [temporalSites[1]]);
  assert.equal(archivedOnly.allowed, true);
  assert.equal(archivedOnly.reason, null);
});

test('Step 4.2 & Multi View: buildCampaignStep4Rows, matchesStep4Preset, and buildCertificateSitioRows', () => {
  const hq = makeSite({ id: UUID_SITIO_HQ, numero_sitio: 0, nombre_sitio: 'Sede Principal HQ' });
  const b1 = makeSite({ id: UUID_SITIO_1, numero_sitio: 1, nombre_sitio: 'Planta Valencia' });

  const future2029Program = makeProgram('7a000000-0000-0000-0000-000000000099', 'Ciclo 2029', [
    makeAudit({
      id: '80000000-0000-0000-0000-000000000099',
      tiene_sitio_temporal: false,
      fechas: [
        {
          id: '81000000-0000-0000-0000-000000000099',
          id_auditoria: '80000000-0000-0000-0000-000000000099',
          numero_secuencia: 1,
          tag: 'Programación',
          tipo_fecha: 'PREPROGRAMADA_MES',
          anio: 2029,
          mes: 5,
          fecha_inicio: null,
          fecha_fin: null,
          deleted_at: null,
        },
      ],
      sitiosPlan: [],
    }),
  ]);

  const imminentAudit = makeAudit({
    id: '80000000-0000-0000-0000-000000000010',
    tiene_sitio_temporal: true,
    fechas: [
      {
        id: '81000000-0000-0000-0000-000000000010',
        id_auditoria: '80000000-0000-0000-0000-000000000010',
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'PROGRAMADA_EXACTA',
        anio: null,
        mes: null,
        fecha_inicio: '2026-06-20',
        fecha_fin: '2026-06-22',
        deleted_at: null,
      },
    ],
    sitiosPlan: [makePlanItem('80000000-0000-0000-0000-000000000010', hq)],
  });
  const imminent2026Program = makeProgram('7a000000-0000-0000-0000-000000000010', 'Ciclo 2026', [
    imminentAudit,
  ]);

  const rows = buildCampaignStep4Rows([future2029Program, imminent2026Program], '2026-06-01');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].program.id, imminent2026Program.id);
  assert.equal(rows[0].urgency.bucket, 'PROXIMA_30D');
  assert.equal(rows[0].step4Complete, true);
  assert.equal(rows[0].hasAnyTemporalSiteEnabled, true);
  assert.equal(rows[0].totalSelectedSites, 1);

  assert.equal(rows[1].program.id, future2029Program.id);
  assert.equal(rows[1].urgency.bucket, 'FUTURO_LEJANO');
  assert.equal(rows[1].step4Complete, false);
  assert.equal(rows[1].totalSelectedSites, 0);

  assert.equal(matchesStep4Preset(rows[0], 'PROXIMAS'), true);
  assert.equal(matchesStep4Preset(rows[1], 'PROXIMAS'), false);
  assert.equal(matchesStep4Preset(rows[1], 'FUTURO'), true);
  assert.equal(matchesStep4Preset(rows[1], 'PREPROGRAMADAS'), true);
  assert.equal(matchesStep4Preset(rows[0], 'PREPROGRAMADAS'), false);
  assert.equal(matchesStep4Preset(rows[0], 'TODAS'), true);
  assert.equal(matchesStep4Preset(rows[1], 'TODAS'), true);

  const certRows = buildCertificateSitioRows({
    detailedCerts: [
      {
        id: UUID_CERT,
        id_organizacion: UUID_ORG,
        organizacion_nombre: 'Iberometal C.A.',
        organizacion_rif: 'J-30123456-7',
        numero_certificado: 'FN-QMS-2025-001',
        id_norma: '10000000-0000-0000-0000-000000000001',
        norma_codigo: 'ISO 9001:2015',
        norma_titulo: 'ISO 9001:2015',
        id_estatus: '10000000-0000-0000-0000-000000000011',
        estatus: 'Activo',
        sector_iaf: 17,
        sector_iaf_descripcion: 'Metales',
        subsector_iaf_descripcion: 'Metales',
        alcance: 'Manufactura',
        fecha_emision: '2025-01-01',
        fecha_vencimiento: '2028-01-01',
        sitios: [
          { ...hq, tipo_sitio: 'Principal (HQ)', personal_count: 100 },
          { ...b1, tipo_sitio: 'Operativa', personal_count: 30 },
        ],
        procesos: [],
        turnos: [],
        audit_history: [],
        no_aplicables: [],
        audit_days_allocation: [],
        fechas_certificado: [],
        contactos_certificado: [],
      },
    ],
    audits: [imminentAudit],
    programs: [imminent2026Program],
    referenceIsoDate: '2026-06-01',
  });

  assert.equal(certRows.length, 1);
  assert.equal(certRows[0].selectedSitesCount, 1);
  assert.equal(certRows[0].totalAvailableSites, 2);
  assert.equal(certRows[0].siteCoverageLabel, '1 de 2 sedes');
  assert.equal(certRows[0].assignedSitesPreview, 'Sitio 0 (HQ)');
  assert.equal(certRows[0].estatus, 'Activo');
});
