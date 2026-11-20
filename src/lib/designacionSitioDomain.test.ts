import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCampaignStep4Rows,
  buildSiteCycleMatrixForAudit,
  canToggleTemporalSiteOff,
  matchesStep4Preset,
  sliceCycleWindowColumns,
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
  auditorias: ProgramacionAuditEntity[]
): ProgramaAuditoriaEntity {
  return {
    id,
    id_vinculo: '7c000000-0000-0000-0000-000000000001',
    id_grupo_empresarial: UUID_GRUPO,
    codigo_programa: `PROG-${id.slice(-4)}`,
    etiqueta,
    nivel_vinculacion: 'INDIVIDUAL',
    tipo_vinculacion: 'Individual',
    es_vinculada: false,
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

test('Step 4.2: canDeselect prevents unchecking the sole active site on an audit', () => {
  const hq = makeSite({ id: UUID_SITIO_HQ, numero_sitio: 0, nombre_sitio: 'Sede Principal HQ' });
  const branch1 = makeSite({ id: UUID_SITIO_1, numero_sitio: 1, nombre_sitio: 'Planta Valencia' });

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
    [hq, branch1],
    [multiSiteAudit]
  );

  assert.equal(multiMatrix[0].canDeselect, true);
  assert.equal(multiMatrix[1].canDeselect, true);
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

test('Step 4.2: buildCampaignStep4Rows & matchesStep4Preset sort nearest-first and isolate future cycles', () => {
  const hq = makeSite({ id: UUID_SITIO_HQ, numero_sitio: 0, nombre_sitio: 'Sede Principal HQ' });

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

  const imminent2026Program = makeProgram('7a000000-0000-0000-0000-000000000010', 'Ciclo 2026', [
    makeAudit({
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
    }),
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
});
