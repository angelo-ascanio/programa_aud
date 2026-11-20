import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAuditProgramaSummaryRows,
  buildProcessHistoryForSite,
  computeQuickProcessSelectionIds,
  resolveSiteShiftOptionsForProcess,
  type CandidateProcessEntity,
} from './programaCertificadoDomain';
import {
  INITIAL_PROGRAMACION_AUDITS,
  type ProgramacionAuditEntity,
} from './auditExecution';
import type {
  AuditoriaSitioPlanItem,
  ProgramaAuditoriaEntity,
} from './auditPlanningEngine';
import type { TurnoPorSitioLink } from './multisiteSampling';
import type { ProcesoPorSitioLink } from './sitioDomain';

const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const CERT_ID = '40000000-0000-0000-0000-000000000001';
const OTHER_CERT_ID = '40000000-0000-0000-0000-000000000099';
const ORG_ID = '30000000-0000-0000-0000-000000000001';
const SITE_1_ID = '50000000-0000-0000-0000-000000000001';
const SITE_2_ID = '50000000-0000-0000-0000-000000000002';

const PROC_EST_ID = '60000000-0000-0000-0000-000000000001';
const PROC_MED_1_ID = '60000000-0000-0000-0000-000000000002';
const PROC_MED_2_ID = '60000000-0000-0000-0000-000000000003';
const PROC_APOYO_ID = '60000000-0000-0000-0000-000000000004';
const PROC_OTHER_SITE_ID = '60000000-0000-0000-0000-000000000005';
const PROC_DELETED_ID = '60000000-0000-0000-0000-000000000006';

const PPS_EST_ID = '61000000-0000-0000-0000-000000000001';
const PPS_MED_1_ID = '61000000-0000-0000-0000-000000000002';
const PPS_MED_2_ID = '61000000-0000-0000-0000-000000000003';
const PPS_APOYO_ID = '61000000-0000-0000-0000-000000000004';
const PPS_OTHER_SITE_ID = '61000000-0000-0000-0000-000000000005';
const PPS_DELETED_LINK_ID = '61000000-0000-0000-0000-000000000006';

const TURNO_SITIO_1_A = '62000000-0000-0000-0000-000000000001';
const TURNO_SITIO_1_B = '62000000-0000-0000-0000-000000000002';
const TURNO_SITIO_2_A = '62000000-0000-0000-0000-000000000003';

function makeBaseAudit(overrides: Partial<ProgramacionAuditEntity>): ProgramacionAuditEntity {
  const base = INITIAL_PROGRAMACION_AUDITS[0];
  return {
    ...base,
    id_programa_auditoria: '7a000000-0000-0000-0000-000000000001',
    id_certificado: CERT_ID,
    numero_certificado: 'FN-QMS-2026-001',
    id_organizacion: ORG_ID,
    organizacion_nombre: 'Industrias del Sur S.A.',
    id_tipo_auditoria: '7b000000-0000-0000-0000-000000000001',
    latestDate: null,
    fechas: [],
    sitiosPlan: [],
    equipo: [],
    sitiosMuestreo: [],
    matrizNormativa: [],
    deleted_at: null,
    ...overrides,
  };
}

function makeSitePlan(
  auditId: string,
  siteId: string,
  numeroSitio: number,
  nombreSitio: string,
  procesos: AuditoriaSitioPlanItem['procesos'] = []
): AuditoriaSitioPlanItem {
  return {
    id: `90000000-0000-0000-0000-${auditId.slice(-6)}${String(numeroSitio).padStart(6, '0')}`,
    id_auditoria: auditId,
    id_sitio: siteId,
    numero_sitio: numeroSitio,
    nombre_sitio: nombreSitio,
    tiempo_auditoria: 1,
    modalidad_evaluacion: 'Presencial',
    procesos,
    equipoSitio: [],
    deleted_at: null,
  };
}

function buildTestCatalog(): {
  allProcesses: CandidateProcessEntity[];
  siteProcesses: ProcesoPorSitioLink[];
  turnosPorSitio: TurnoPorSitioLink[];
} {
  const allProcesses: CandidateProcessEntity[] = [
    {
      id: PROC_EST_ID,
      id_certificado: CERT_ID,
      nombre_proceso: 'Dirección Estratégica',
      tipo: 'Estratégico',
      clausulas_cubiertas: ['4.1', '5.1'],
    },
    {
      id: PROC_MED_1_ID,
      id_certificado: CERT_ID,
      nombre_proceso: 'Producción Línea A',
      tipo: 'Medular',
      clausulas_cubiertas: ['8.1', '8.5'],
    },
    {
      id: PROC_MED_2_ID,
      id_certificado: CERT_ID,
      nombre_proceso: 'Control de Calidad',
      tipo: 'Medular',
      clausulas_cubiertas: ['8.6', '9.1'],
    },
    {
      id: PROC_APOYO_ID,
      id_certificado: CERT_ID,
      nombre_proceso: 'Mantenimiento Industrial',
      tipo: 'De Apoyo',
      clausulas_cubiertas: ['7.1.3'],
    },
    {
      id: PROC_OTHER_SITE_ID,
      id_certificado: CERT_ID,
      nombre_proceso: 'Despacho Marítimo',
      tipo: 'Medular',
      clausulas_cubiertas: ['8.5.4'],
    },
    {
      id: PROC_DELETED_ID,
      id_certificado: CERT_ID,
      nombre_proceso: 'Proceso Obsoleto',
      tipo: 'De Apoyo',
      clausulas_cubiertas: ['7.5'],
      deleted_at: '2025-05-01T00:00:00Z',
    },
  ];

  const siteProcesses: ProcesoPorSitioLink[] = [
    {
      id: PPS_EST_ID,
      id_sitio: SITE_1_ID,
      id_proceso: PROC_EST_ID,
      nombre_proceso: 'Dirección Estratégica',
      tipo_proceso: 'Estratégico',
      deleted_at: null,
    },
    {
      id: PPS_MED_1_ID,
      id_sitio: SITE_1_ID,
      id_proceso: PROC_MED_1_ID,
      nombre_proceso: 'Producción Línea A',
      tipo_proceso: 'Medular',
      deleted_at: null,
    },
    {
      id: PPS_MED_2_ID,
      id_sitio: SITE_1_ID,
      id_proceso: PROC_MED_2_ID,
      nombre_proceso: 'Control de Calidad',
      tipo_proceso: 'Medular',
      deleted_at: null,
    },
    {
      id: PPS_APOYO_ID,
      id_sitio: SITE_1_ID,
      id_proceso: PROC_APOYO_ID,
      nombre_proceso: 'Mantenimiento Industrial',
      tipo_proceso: 'De Apoyo',
      deleted_at: null,
    },
    {
      id: PPS_OTHER_SITE_ID,
      id_sitio: SITE_2_ID,
      id_proceso: PROC_OTHER_SITE_ID,
      nombre_proceso: 'Despacho Marítimo',
      tipo_proceso: 'Medular',
      deleted_at: null,
    },
    {
      id: PPS_DELETED_LINK_ID,
      id_sitio: SITE_1_ID,
      id_proceso: PROC_OTHER_SITE_ID,
      nombre_proceso: 'Despacho Marítimo',
      tipo_proceso: 'Medular',
      deleted_at: '2025-06-01T00:00:00Z',
    },
    {
      id: '61000000-0000-0000-0000-000000000099',
      id_sitio: SITE_1_ID,
      id_proceso: PROC_DELETED_ID,
      nombre_proceso: 'Proceso Obsoleto',
      tipo_proceso: 'De Apoyo',
      deleted_at: null,
    },
  ];

  const turnosPorSitio: TurnoPorSitioLink[] = [
    {
      id: TURNO_SITIO_1_A,
      id_sitio: SITE_1_ID,
      id_turno: '63000000-0000-0000-0000-000000000001',
      hora_entrada: '08:00',
      hora_salida: '16:00',
      descripcion: 'Turno Diurno',
      deleted_at: null,
    },
    {
      id: TURNO_SITIO_1_B,
      id_sitio: SITE_1_ID,
      id_turno: '63000000-0000-0000-0000-000000000002',
      hora_entrada: '16:00',
      hora_salida: '00:00',
      descripcion: 'Turno Vespertino',
      deleted_at: null,
    },
    {
      id: '62000000-0000-0000-0000-000000000098',
      id_sitio: SITE_1_ID,
      id_turno: '63000000-0000-0000-0000-000000000003',
      hora_entrada: '00:00',
      hora_salida: '08:00',
      descripcion: 'Turno Archivado',
      deleted_at: '2025-01-10T00:00:00Z',
    },
    {
      id: TURNO_SITIO_2_A,
      id_sitio: SITE_2_ID,
      id_turno: '63000000-0000-0000-0000-000000000001',
      hora_entrada: '07:00',
      hora_salida: '15:00',
      descripcion: 'Turno Puerto',
      deleted_at: null,
    },
  ];

  return { allProcesses, siteProcesses, turnosPorSitio };
}

test('Step 8.1: buildProcessHistoryForSite restricts processes to active procesos_por_sitio and computes multi-year cycle history with Zero-UUID', () => {
  const { allProcesses, siteProcesses } = buildTestCatalog();

  const audit2024 = makeBaseAudit({
    id: '80000000-0000-0000-0000-000000000001',
    codigo_auditoria: 'AUD-2024-001',
    tipo_auditoria: 'Etapa 2',
    estado_ciclo: 'Auditada',
    estatus: 'Completado',
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
    sitiosPlan: [
      makeSitePlan('80000000-0000-0000-0000-000000000001', SITE_1_ID, 0, 'Planta Principal', [
        {
          id: '91000000-0000-0000-0000-000000000001',
          id_sitios_por_auditoria: '90000000-0000-0000-0000-000001000000',
          id_procesos_por_sitio: PPS_EST_ID,
          id_proceso: PROC_EST_ID,
          proceso_nombre: 'Dirección Estratégica',
          turnos: [
            {
              id: '92000000-0000-0000-0000-000000000001',
              id_procesos_sitio_auditoria: '91000000-0000-0000-0000-000000000001',
              id_turnos_sitio_auditoria: TURNO_SITIO_1_A,
              descripcion_turno: 'Diurno',
              hora_entrada: '08:00:00',
              hora_salida: '16:00:00',
              deleted_at: null,
            },
          ],
          equipoProceso: [
            {
              id: '93000000-0000-0000-0000-000000000001',
              id_procesos_sitio_auditoria: '91000000-0000-0000-0000-000000000001',
              id_auditor: '10000000-0000-0000-0000-000000000001',
              auditor_nombre: 'Ana Rojas',
              rol_en_proceso: 'LIDER_PROCESO',
              deleted_at: null,
            },
          ],
          deleted_at: null,
        },
        {
          id: '91000000-0000-0000-0000-000000000002',
          id_sitios_por_auditoria: '90000000-0000-0000-0000-000001000000',
          id_procesos_por_sitio: PPS_MED_2_ID,
          id_proceso: PROC_MED_2_ID,
          proceso_nombre: 'Control de Calidad',
          turnos: [],
          equipoProceso: [],
          deleted_at: null,
        },
      ]),
    ],
  });

  const audit2025 = makeBaseAudit({
    id: '80000000-0000-0000-0000-000000000002',
    codigo_auditoria: 'AUD-2025-001',
    tipo_auditoria: 'Seg. 1',
    estado_ciclo: 'Auditada',
    estatus: 'Cerrado',
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
      makeSitePlan('80000000-0000-0000-0000-000000000002', SITE_1_ID, 0, 'Planta Principal', [
        {
          id: '91000000-0000-0000-0000-000000000003',
          id_sitios_por_auditoria: '90000000-0000-0000-0000-000002000000',
          id_procesos_por_sitio: PPS_MED_1_ID,
          id_proceso: PROC_MED_1_ID,
          proceso_nombre: 'Producción Línea A',
          turnos: [
            {
              id: '92000000-0000-0000-0000-000000000002',
              id_procesos_sitio_auditoria: '91000000-0000-0000-0000-000000000003',
              id_turnos_sitio_auditoria: TURNO_SITIO_1_B,
              descripcion_turno: 'Vespertino',
              hora_entrada: '16:00',
              hora_salida: '00:00',
              deleted_at: null,
            },
          ],
          equipoProceso: [],
          deleted_at: null,
        },
        {
          id: '91000000-0000-0000-0000-000000000004',
          id_sitios_por_auditoria: '90000000-0000-0000-0000-000002000000',
          id_procesos_por_sitio: PPS_EST_ID,
          id_proceso: PROC_EST_ID,
          proceso_nombre: 'Dirección Estratégica',
          turnos: [],
          equipoProceso: [],
          deleted_at: null,
        },
      ]),
    ],
  });

  const currentSitePlan = makeSitePlan(
    '80000000-0000-0000-0000-000000000003',
    SITE_1_ID,
    0,
    'Planta Principal',
    [
      {
        id: '91000000-0000-0000-0000-000000000005',
        id_sitios_por_auditoria: '90000000-0000-0000-0000-000003000000',
        id_procesos_por_sitio: PPS_EST_ID,
        id_proceso: PROC_EST_ID,
        proceso_nombre: 'Dirección Estratégica',
        turnos: [
          {
            id: '92000000-0000-0000-0000-000000000003',
            id_procesos_sitio_auditoria: '91000000-0000-0000-0000-000000000005',
            id_turnos_sitio_auditoria: TURNO_SITIO_1_A,
            descripcion_turno: 'Diurno',
            deleted_at: null,
          },
        ],
        equipoProceso: [],
        deleted_at: null,
      },
    ]
  );

  const audit2026 = makeBaseAudit({
    id: '80000000-0000-0000-0000-000000000003',
    codigo_auditoria: 'AUD-2026-001',
    tipo_auditoria: 'Seg. 2',
    estado_ciclo: 'En Programación',
    estatus: 'Planificado',
    fechas: [
      {
        id: '81000000-0000-0000-0000-000000000003',
        id_auditoria: '80000000-0000-0000-0000-000000000003',
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'PREPROGRAMADA_MES',
        anio: 2026,
        mes: 11,
        fecha_inicio: null,
        fecha_fin: null,
        deleted_at: null,
      },
    ],
    sitiosPlan: [currentSitePlan],
  });

  const audit2027Future = makeBaseAudit({
    id: '80000000-0000-0000-0000-000000000004',
    codigo_auditoria: 'AUD-2027-001',
    tipo_auditoria: 'Renovación',
    estado_ciclo: 'Borrador',
    estatus: 'Planificado',
    fechas: [
      {
        id: '81000000-0000-0000-0000-000000000004',
        id_auditoria: '80000000-0000-0000-0000-000000000004',
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'PREPROGRAMADA_MES',
        anio: 2027,
        mes: 10,
        fecha_inicio: null,
        fecha_fin: null,
        deleted_at: null,
      },
    ],
    sitiosPlan: [],
  });

  const cancelledAudit = makeBaseAudit({
    id: '80000000-0000-0000-0000-000000000005',
    codigo_auditoria: 'AUD-2025-CANC',
    tipo_auditoria: 'Extraordinaria',
    estado_ciclo: 'Cancelada',
    estatus: 'Cancelada',
    fechas: [
      {
        id: '81000000-0000-0000-0000-000000000005',
        id_auditoria: '80000000-0000-0000-0000-000000000005',
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'PROGRAMADA_EXACTA',
        anio: null,
        mes: null,
        fecha_inicio: '2025-04-01',
        fecha_fin: '2025-04-02',
        deleted_at: null,
      },
    ],
  });

  const otherCertAudit = makeBaseAudit({
    id: '80000000-0000-0000-0000-000000000006',
    id_certificado: OTHER_CERT_ID,
    codigo_auditoria: 'AUD-2025-OTRO',
    estado_ciclo: 'Auditada',
  });

  const rows = buildProcessHistoryForSite(
    audit2026,
    currentSitePlan,
    siteProcesses,
    allProcesses,
    [audit2027Future, cancelledAudit, audit2025, otherCertAudit, audit2024, audit2026]
  );

  // Only the 4 active processes linked to SITE_1_ID are eligible (excludes site 2, deleted link, deleted process)
  assert.equal(rows.length, 4);
  assert.deepEqual(
    rows.map((r) => r.ppsLink.id),
    [PPS_EST_ID, PPS_MED_1_ID, PPS_MED_2_ID, PPS_APOYO_ID]
  );

  const rowEst = rows[0];
  assert.equal(rowEst.isSelectedNow, true);
  assert.equal(rowEst.assignedShiftIds.length, 1);
  assert.equal(rowEst.assignedShiftIds[0], TURNO_SITIO_1_A);
  assert.equal(rowEst.neverAudited, false);
  assert.equal(rowEst.notAuditedInLastVisit, false);
  assert.equal(rowEst.lastAuditedText, 'Hace 1 año (Seg. 1 · 2025)');
  assert.equal(rowEst.timesAuditedInCycle, 2);
  assert.equal(rowEst.totalVisitsInCycle, 4);
  assert.equal(rowEst.currentAuditIndex, 2);
  assert.equal(rowEst.cycleCells[0].yearLabel, '2024');
  assert.deepEqual(rowEst.cycleCells[0].shiftLabels, ['Diurno (08:00–16:00)']);
  assert.deepEqual(rowEst.cycleCells[0].auditorNames, ['Ana Rojas']);
  assert.equal(rowEst.cycleCells[2].isCurrent, true);
  assert.equal(rowEst.cycleCells[3].isFuture, true);

  const rowMed1 = rows[1];
  assert.equal(rowMed1.isSelectedNow, false);
  assert.equal(rowMed1.neverAudited, false);
  assert.equal(rowMed1.notAuditedInLastVisit, false);
  assert.equal(rowMed1.lastAuditedText, 'Hace 1 año (Seg. 1 · 2025)');
  assert.equal(rowMed1.timesAuditedInCycle, 1);
  assert.deepEqual(rowMed1.cycleCells[1].shiftLabels, ['Vespertino (16:00–00:00)']);

  const rowMed2 = rows[2];
  assert.equal(rowMed2.isSelectedNow, false);
  assert.equal(rowMed2.neverAudited, false);
  assert.equal(rowMed2.notAuditedInLastVisit, true);
  assert.equal(rowMed2.lastAuditedText, 'Hace 2 años (Etapa 2 · 2024)');
  assert.equal(rowMed2.timesAuditedInCycle, 1);

  const rowApoyo = rows[3];
  assert.equal(rowApoyo.isSelectedNow, false);
  assert.equal(rowApoyo.neverAudited, true);
  assert.equal(rowApoyo.notAuditedInLastVisit, true);
  assert.equal(rowApoyo.lastAuditedText, 'Nunca auditado');
  assert.equal(rowApoyo.timesAuditedInCycle, 0);

  // Zero-UUID check across all user-facing labels
  for (const row of rows) {
    assert.equal(UUID_REGEX.test(row.lastAuditedText), false);
    for (const cell of row.cycleCells) {
      for (const sl of cell.shiftLabels) assert.equal(UUID_REGEX.test(sl), false);
      for (const an of cell.auditorNames) assert.equal(UUID_REGEX.test(an), false);
    }
  }
});

test('Step 8.1: computeQuickProcessSelectionIds handles MEDULARES, NO_AUDITADOS_ULTIMO, and COPIAR_ANTERIOR presets', () => {
  const { allProcesses, siteProcesses } = buildTestCatalog();

  const audit2025 = makeBaseAudit({
    id: '80000000-0000-0000-0000-000000000011',
    codigo_auditoria: 'AUD-2025-Q',
    tipo_auditoria: 'Seg. 1',
    estado_ciclo: 'Auditada',
    estatus: 'Cerrado',
    fechas: [
      {
        id: '81000000-0000-0000-0000-000000000011',
        id_auditoria: '80000000-0000-0000-0000-000000000011',
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'REAL',
        anio: null,
        mes: null,
        fecha_inicio: '2025-08-10',
        fecha_fin: '2025-08-11',
        deleted_at: null,
      },
    ],
    sitiosPlan: [
      makeSitePlan('80000000-0000-0000-0000-000000000011', SITE_1_ID, 0, 'Planta Principal', [
        {
          id: '91000000-0000-0000-0000-000000000011',
          id_sitios_por_auditoria: '90000000-0000-0000-0000-000011000000',
          id_procesos_por_sitio: PPS_EST_ID,
          id_proceso: PROC_EST_ID,
          proceso_nombre: 'Dirección Estratégica',
          turnos: [],
          equipoProceso: [],
          deleted_at: null,
        },
        {
          id: '91000000-0000-0000-0000-000000000012',
          id_sitios_por_auditoria: '90000000-0000-0000-0000-000011000000',
          id_procesos_por_sitio: PPS_MED_1_ID,
          id_proceso: PROC_MED_1_ID,
          proceso_nombre: 'Producción Línea A',
          turnos: [],
          equipoProceso: [],
          deleted_at: null,
        },
      ]),
    ],
  });

  // Current audit already has PPS_EST_ID selected
  const currentSitePlan = makeSitePlan(
    '80000000-0000-0000-0000-000000000012',
    SITE_1_ID,
    0,
    'Planta Principal',
    [
      {
        id: '91000000-0000-0000-0000-000000000013',
        id_sitios_por_auditoria: '90000000-0000-0000-0000-000012000000',
        id_procesos_por_sitio: PPS_EST_ID,
        id_proceso: PROC_EST_ID,
        proceso_nombre: 'Dirección Estratégica',
        turnos: [],
        equipoProceso: [],
        deleted_at: null,
      },
    ]
  );

  const currentAudit = makeBaseAudit({
    id: '80000000-0000-0000-0000-000000000012',
    codigo_auditoria: 'AUD-2026-Q',
    tipo_auditoria: 'Seg. 2',
    estado_ciclo: 'En Programación',
    fechas: [
      {
        id: '81000000-0000-0000-0000-000000000012',
        id_auditoria: '80000000-0000-0000-0000-000000000012',
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'PREPROGRAMADA_MES',
        anio: 2026,
        mes: 8,
        fecha_inicio: null,
        fecha_fin: null,
        deleted_at: null,
      },
    ],
    sitiosPlan: [currentSitePlan],
  });

  // Note: currentAudit intentionally omitted from allAudits to verify resilient self-inclusion
  const rows = buildProcessHistoryForSite(
    currentAudit,
    currentSitePlan,
    siteProcesses,
    allProcesses,
    [audit2025]
  );

  assert.deepEqual(
    computeQuickProcessSelectionIds(rows, 'MEDULARES'),
    [PPS_MED_1_ID, PPS_MED_2_ID]
  );
  assert.deepEqual(
    computeQuickProcessSelectionIds(rows, 'NO_AUDITADOS_ULTIMO'),
    [PPS_MED_2_ID, PPS_APOYO_ID]
  );
  assert.deepEqual(
    computeQuickProcessSelectionIds(rows, 'COPIAR_ANTERIOR'),
    [PPS_MED_1_ID]
  );
});

test('Step 8.1: buildAuditProgramaSummaryRows enforces Step 3 & Step 4 gates and classifies PENDIENTE_PROCESOS, PENDIENTE_TURNOS, and COMPLETO', () => {
  const { allProcesses, siteProcesses } = buildTestCatalog();

  const program: ProgramaAuditoriaEntity = {
    id: '7a000000-0000-0000-0000-000000000001',
    codigo_programa: 'PROG-2026-01',
    etiqueta: 'Ciclo 2026 — Industrias del Sur',
    nivel_vinculacion: 'INDIVIDUAL',
    tipo_vinculacion: 'Individual',
    es_vinculada: false,
    auditorias: [],
    deleted_at: null,
  };

  const plannedDate = (auditId: string) => [
    {
      id: `81000000-0000-0000-0000-${auditId.slice(-12)}`,
      id_auditoria: auditId,
      numero_secuencia: 1,
      tag: 'Programación' as const,
      tipo_fecha: 'PREPROGRAMADA_MES' as const,
      anio: 2026,
      mes: 9,
      fecha_inicio: null,
      fecha_fin: null,
      deleted_at: null,
    },
  ];

  // Gate fail 1: missing Step 3 (no id_tipo_auditoria)
  const missingTypeAudit = makeBaseAudit({
    id: '80000000-0000-0000-0000-000000000101',
    id_tipo_auditoria: null,
    fechas: plannedDate('80000000-0000-0000-0000-000000000101'),
    sitiosPlan: [
      makeSitePlan('80000000-0000-0000-0000-000000000101', SITE_1_ID, 0, 'Planta Principal'),
    ],
  });

  // Gate fail 2: missing Step 4 (no active sites)
  const missingSiteAudit = makeBaseAudit({
    id: '80000000-0000-0000-0000-000000000102',
    fechas: plannedDate('80000000-0000-0000-0000-000000000102'),
    sitiosPlan: [
      {
        ...makeSitePlan('80000000-0000-0000-0000-000000000102', SITE_1_ID, 0, 'Planta Archivada'),
        deleted_at: '2026-01-01T00:00:00Z',
      },
    ],
  });

  // Eligible 1: PENDIENTE_PROCESOS (1 site has 0 processes)
  const pendingProcessesAudit = makeBaseAudit({
    id: '80000000-0000-0000-0000-000000000103',
    codigo_auditoria: 'AUD-PEND-PROC',
    fechas: plannedDate('80000000-0000-0000-0000-000000000103'),
    sitiosPlan: [
      makeSitePlan('80000000-0000-0000-0000-000000000103', SITE_1_ID, 0, 'Planta Principal', []),
    ],
  });

  // Eligible 2: PENDIENTE_TURNOS (processes present, one lacks shifts)
  const pendingShiftsAudit = makeBaseAudit({
    id: '80000000-0000-0000-0000-000000000104',
    codigo_auditoria: 'AUD-PEND-SHIFT',
    fechas: plannedDate('80000000-0000-0000-0000-000000000104'),
    sitiosPlan: [
      makeSitePlan('80000000-0000-0000-0000-000000000104', SITE_1_ID, 0, 'Planta Principal', [
        {
          id: '91000000-0000-0000-0000-000000000101',
          id_sitios_por_auditoria: '90000000-0000-0000-0000-000104000000',
          id_procesos_por_sitio: PPS_EST_ID,
          id_proceso: PROC_EST_ID,
          proceso_nombre: 'Dirección Estratégica',
          turnos: [
            {
              id: '92000000-0000-0000-0000-000000000101',
              id_procesos_sitio_auditoria: '91000000-0000-0000-0000-000000000101',
              id_turnos_sitio_auditoria: TURNO_SITIO_1_A,
              descripcion_turno: 'Turno Diurno',
              deleted_at: null,
            },
          ],
          equipoProceso: [],
          deleted_at: null,
        },
        {
          id: '91000000-0000-0000-0000-000000000102',
          id_sitios_por_auditoria: '90000000-0000-0000-0000-000104000000',
          id_procesos_por_sitio: PPS_MED_1_ID,
          id_proceso: PROC_MED_1_ID,
          proceso_nombre: 'Producción Línea A',
          turnos: [],
          equipoProceso: [],
          deleted_at: null,
        },
      ]),
    ],
  });

  // Eligible 3: COMPLETO (all selected sites have >= 1 process and all active processes have >= 1 active shift)
  const completeAudit = makeBaseAudit({
    id: '80000000-0000-0000-0000-000000000105',
    codigo_auditoria: 'AUD-COMPLETO',
    fechas: plannedDate('80000000-0000-0000-0000-000000000105'),
    sitiosPlan: [
      makeSitePlan('80000000-0000-0000-0000-000000000105', SITE_1_ID, 0, 'Planta Principal', [
        {
          id: '91000000-0000-0000-0000-000000000103',
          id_sitios_por_auditoria: '90000000-0000-0000-0000-000105000000',
          id_procesos_por_sitio: PPS_EST_ID,
          id_proceso: PROC_EST_ID,
          proceso_nombre: 'Dirección Estratégica',
          turnos: [
            {
              id: '92000000-0000-0000-0000-000000000102',
              id_procesos_sitio_auditoria: '91000000-0000-0000-0000-000000000103',
              id_turnos_sitio_auditoria: TURNO_SITIO_1_A,
              descripcion_turno: 'Turno Diurno',
              deleted_at: null,
            },
            {
              id: '92000000-0000-0000-0000-000000000103',
              id_procesos_sitio_auditoria: '91000000-0000-0000-0000-000000000103',
              id_turnos_sitio_auditoria: TURNO_SITIO_1_B,
              descripcion_turno: 'Turno Vespertino',
              deleted_at: null,
            },
          ],
          equipoProceso: [],
          deleted_at: null,
        },
      ]),
    ],
  });

  const summary = buildAuditProgramaSummaryRows(
    [missingTypeAudit, missingSiteAudit, pendingProcessesAudit, pendingShiftsAudit, completeAudit],
    [program],
    siteProcesses,
    allProcesses
  );

  assert.equal(summary.length, 3);
  assert.equal(summary[0].audit.codigo_auditoria, 'AUD-PEND-PROC');
  assert.equal(summary[0].completionState, 'PENDIENTE_PROCESOS');
  assert.equal(summary[0].sitesMissingProcesses, 1);
  assert.equal(summary[0].totalConfiguredProcesses, 0);
  assert.equal(summary[0].neverAuditedEligibleCount, 4);
  assert.equal(summary[0].program?.id, program.id);

  assert.equal(summary[1].audit.codigo_auditoria, 'AUD-PEND-SHIFT');
  assert.equal(summary[1].completionState, 'PENDIENTE_TURNOS');
  assert.equal(summary[1].sitesMissingProcesses, 0);
  assert.equal(summary[1].totalConfiguredProcesses, 2);
  assert.equal(summary[1].processesMissingShifts, 1);
  assert.equal(summary[1].totalAssignedShifts, 1);

  assert.equal(summary[2].audit.codigo_auditoria, 'AUD-COMPLETO');
  assert.equal(summary[2].completionState, 'COMPLETO');
  assert.equal(summary[2].sitesMissingProcesses, 0);
  assert.equal(summary[2].processesMissingShifts, 0);
  assert.equal(summary[2].totalAssignedShifts, 2);
});

test('Step 8.1: resolveSiteShiftOptionsForProcess returns only active turnos_por_sitio for target siteId', () => {
  const { turnosPorSitio } = buildTestCatalog();

  const site1Shifts = resolveSiteShiftOptionsForProcess(SITE_1_ID, turnosPorSitio);
  assert.deepEqual(
    site1Shifts.map((t) => t.id),
    [TURNO_SITIO_1_A, TURNO_SITIO_1_B]
  );

  const site2Shifts = resolveSiteShiftOptionsForProcess(SITE_2_ID, turnosPorSitio);
  assert.deepEqual(
    site2Shifts.map((t) => t.id),
    [TURNO_SITIO_2_A]
  );
});
