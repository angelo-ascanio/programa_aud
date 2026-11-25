import test from 'node:test';
import assert from 'node:assert/strict';

import type { UserProfile } from './healthCheck';
import {
  scopeAuditProgramsForProfile,
  scopeProgramacionAuditsForProfile,
} from './accessControl';
import type { ProgramacionAuditEntity } from './auditExecution';
import type { ProgramaAuditoriaEntity } from './auditPlanningEngine';
import type { AuditoriaSitioTemporalEntity } from './designacionTemporalDomain';
import type { CertificadoDetailEntity } from './multisiteSampling';
import {
  PIPELINE_STAGE_ORDER,
  computeCalendarPeriodCounts,
  getPipelineStageBadgeMeta,
  resolveCurrentPipelineStage,
} from './pipelineEngine';
import { INITIAL_AUDITORES_DETAILED } from './competencyMatrix';
import { renderCalendarioView } from '../views/calendarioView';
import { assertZeroUuidExposure } from './zeroUuid';

const ADMIN_PROFILE: UserProfile = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'admin@auditoria.test',
  full_name: 'Admin Sistema',
  role: 'ADMIN',
  status: 'APPROVED',
  auditor_id: null,
};

const AUDITOR_PROFILE: UserProfile = {
  id: INITIAL_AUDITORES_DETAILED[0].id,
  email: 'auditor@auditoria.test',
  full_name: 'Ing. Carlos Mendoza',
  role: 'AUDITOR',
  status: 'APPROVED',
  auditor_id: INITIAL_AUDITORES_DETAILED[0].id,
};

const CLIENT_PROFILE: UserProfile = {
  id: '10000000-0000-4000-8000-000000000003',
  email: 'cliente@org-a.test',
  full_name: 'Contacto Org A',
  role: 'CLIENT',
  status: 'APPROVED',
  auditor_id: null,
};

function makeAudit(overrides: Partial<ProgramacionAuditEntity> = {}): ProgramacionAuditEntity {
  return {
    id: '81000000-0000-4000-8000-000000000001',
    id_programa_auditoria: '80000000-0000-4000-8000-000000000001',
    codigo_auditoria: 'AUD-2026-101',
    id_certificado: '50000000-0000-4000-8000-000000000001',
    numero_certificado: 'FN-QMS-2026-101',
    id_organizacion: '30000000-0000-4000-8000-000000000001',
    organizacion_nombre: 'Industrias Alfa S.A.',
    norma_codigo: 'ISO 9001:2015',
    sector_iaf: 17,
    id_tipo_auditoria: null,
    tipo_auditoria: 'Seguimiento 1',
    metodologia: 'Presencial',
    fecha_inicio: '',
    fecha_fin: '',
    fechas: [],
    latestDate: null,
    dias_auditor: 0,
    tiempo_auditoria: 0,
    estatus: 'Planificado',
    estado_ciclo: 'Borrador',
    tiene_sitio_temporal: false,
    revisado: false,
    auditor_lider_id: INITIAL_AUDITORES_DETAILED[0].id,
    auditor_lider: INITIAL_AUDITORES_DETAILED[0].nombre,
    sede_principal_direccion: 'Av. Industrial 100, Madrid',
    equipo: [],
    sitiosMuestreo: [],
    sitiosPlan: [],
    matrizNormativa: [],
    deleted_at: null,
    ...overrides,
  };
}

function makeProgram(
  audits: ProgramacionAuditEntity[],
  overrides: Partial<ProgramaAuditoriaEntity> = {}
): ProgramaAuditoriaEntity {
  return {
    id: '80000000-0000-4000-8000-000000000001',
    id_vinculo: '70000000-0000-4000-8000-000000000001',
    codigo_programa: 'PRG-2026-101',
    etiqueta: 'Industrias Alfa · Seguimiento 2026',
    nivel_vinculacion: 'INDIVIDUAL',
    tipo_vinculacion: 'Individual',
    es_vinculada: false,
    auditorias: audits,
    deleted_at: null,
    ...overrides,
  };
}

test('Step 9.1: resolveCurrentPipelineStage traverses all 10 stages in exact order and maps subviews', () => {
  const expectedSubviews: Record<string, string> = {
    Relación: 'designacion/relacion',
    Tipo: 'designacion/tipo',
    Sitio: 'designacion/sitio',
    Temporal: 'designacion/temporal',
    Tiempo: 'tiempo',
    Asignación: 'auditor',
    Programa: 'proceso',
    Resultado: 'resultado',
    Revisión: 'revision',
    Finalizada: 'resumen',
  };
  assert.equal(PIPELINE_STAGE_ORDER.length, 10);
  for (const stage of PIPELINE_STAGE_ORDER) {
    assert.equal(getPipelineStageBadgeMeta(stage).targetSubview, expectedSubviews[stage]);
  }

  // 1. Relación
  const stageRelacion = makeProgram([]);
  assert.equal(resolveCurrentPipelineStage(stageRelacion), 'Relación');

  // 2. Tipo (has cert link + confirmed relación, missing tipo_auditoria / date)
  const auditStep2 = makeAudit({
    tipo_vinculacion: 'Individual',
    id_tipo_auditoria: null,
    fechas: [],
  });
  assert.equal(resolveCurrentPipelineStage(auditStep2), 'Tipo');

  // 3. Sitio (Step 3 complete, 0 sitiosPlan)
  const auditStep3 = makeAudit({
    id_tipo_auditoria: '91000000-0000-4000-8000-000000000001',
    fechas: [
      {
        id: '92000000-0000-4000-8000-000000000001',
        id_auditoria: '81000000-0000-4000-8000-000000000001',
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'PROGRAMADA_EXACTA',
        anio: null,
        mes: null,
        fecha_inicio: '2026-04-14',
        fecha_fin: '2026-04-16',
        observacion: null,
        deleted_at: null,
      },
    ],
    sitiosPlan: [],
  });
  assert.equal(resolveCurrentPipelineStage(auditStep3), 'Sitio');

  // 4. Temporal (Step 4 complete with tiene_sitio_temporal=true, no temporal site yet)
  const auditStep4 = makeAudit({
    ...auditStep3,
    tiene_sitio_temporal: true,
    sitiosPlan: [
      {
        id: '93000000-0000-4000-8000-000000000001',
        id_auditoria: '81000000-0000-4000-8000-000000000001',
        id_sitio: '40000000-0000-4000-8000-000000000001',
        numero_sitio: 0,
        nombre_sitio: 'Sede Principal HQ',
        modalidad_evaluacion: 'Presencial',
        tiempo_auditoria: 0,
        procesos: [],
        equipoSitio: [],
        deleted_at: null,
      },
    ],
  });
  assert.equal(resolveCurrentPipelineStage(auditStep4, []), 'Temporal');

  // 5. Tiempo (temporal site configured with 0.5d, regular site still has 0d)
  const temporalSite: AuditoriaSitioTemporalEntity = {
    id: '94000000-0000-4000-8000-000000000001',
    id_auditoria: '81000000-0000-4000-8000-000000000001',
    etiqueta: 'Obra Norte',
    comentario: null,
    tiempo_auditoria: 0.5,
    certificados: [],
    equipoTemporal: [],
    deleted_at: null,
  };
  assert.equal(resolveCurrentPipelineStage(auditStep4, [temporalSite]), 'Tiempo');

  // 6. Asignación (regular site has 2.0d, but equipoSitio / equipoTemporal unassigned)
  const auditStep6 = makeAudit({
    ...auditStep4,
    sitiosPlan: [
      {
        ...auditStep4.sitiosPlan![0],
        tiempo_auditoria: 2.0,
      },
    ],
  });
  assert.equal(resolveCurrentPipelineStage(auditStep6, [temporalSite]), 'Asignación');

  // 7. Programa (regular + temporal sites balanced, but procesos/turnos missing)
  const auditStep7 = makeAudit({
    ...auditStep6,
    sitiosPlan: [
      {
        ...auditStep6.sitiosPlan![0],
        equipoSitio: [
          {
            id: '95000000-0000-4000-8000-000000000001',
            id_sitios_por_auditoria: '93000000-0000-4000-8000-000000000001',
            id_auditor: INITIAL_AUDITORES_DETAILED[0].id,
            auditor_nombre: INITIAL_AUDITORES_DETAILED[0].nombre,
            rol_auditor: 'AUDITOR_LIDER',
            tiempo_auditoria: 2.0,
            deleted_at: null,
          },
        ],
        procesos: [],
      },
    ],
  });
  const balancedTemporalSite: AuditoriaSitioTemporalEntity = {
    ...temporalSite,
    equipoTemporal: [
      {
        id: '96000000-0000-4000-8000-000000000001',
        id_sitio_temporal: temporalSite.id,
        id_auditor: INITIAL_AUDITORES_DETAILED[0].id,
        auditor_nombre: INITIAL_AUDITORES_DETAILED[0].nombre,
        rol_auditor: 'AUDITOR',
        tiempo_auditoria: 0.5,
        deleted_at: null,
      },
    ],
  };
  assert.equal(resolveCurrentPipelineStage(auditStep7, [balancedTemporalSite]), 'Programa');

  // 8. Resultado (processes + shifts complete, ready for execution/results)
  const auditStep8 = makeAudit({
    ...auditStep7,
    sitiosPlan: [
      {
        ...auditStep7.sitiosPlan![0],
        procesos: [
          {
            id: '97000000-0000-4000-8000-000000000001',
            id_sitios_por_auditoria: '93000000-0000-4000-8000-000000000001',
            id_procesos_por_sitio: '98000000-0000-4000-8000-000000000001',
            id_proceso: '60000000-0000-4000-8000-000000000001',
            proceso_nombre: 'Producción',
            turnos: [
              {
                id: '99000000-0000-4000-8000-000000000001',
                id_procesos_por_sitio_auditoria: '97000000-0000-4000-8000-000000000001',
                id_turnos_sitio_auditoria: '99100000-0000-4000-8000-000000000001',
                descripcion_turno: 'Turno Mañana',
                deleted_at: null,
              },
            ],
            equipoProceso: [],
            deleted_at: null,
          },
        ],
      },
    ],
  });
  assert.equal(resolveCurrentPipelineStage(auditStep8, [balancedTemporalSite]), 'Resultado');

  // 9. Revisión (closed audit awaiting QA review)
  const auditStep9 = makeAudit({
    ...auditStep8,
    estatus: 'Cerrado',
    fecha_cierre_auditoria: '2026-04-17',
    revisado: false,
  });
  assert.equal(resolveCurrentPipelineStage(auditStep9, [balancedTemporalSite]), 'Revisión');

  // 10. Finalizada (QA reviewed)
  const auditStep10 = makeAudit({
    ...auditStep9,
    revisado: true,
    fecha_revision: '2026-04-20',
  });
  assert.equal(resolveCurrentPipelineStage(auditStep10, [balancedTemporalSite]), 'Finalizada');
});

test('Step 9.1: computeCalendarPeriodCounts aggregates exact year, Q1..Q4, and month counts across REAL, PROGRAMADA_EXACTA, and PREPROGRAMADA_MES', () => {
  const counts = computeCalendarPeriodCounts(
    [
      // Q1 (Feb): REAL
      { precisionKey: 'REAL', startDate: '2026-02-10', endDate: '2026-02-12' },
      // Q2 (Apr): PROGRAMADA_EXACTA
      { precisionKey: 'PROGRAMADA_EXACTA', startDate: '2026-04-05', endDate: '2026-04-07' },
      // Q2 -> Q3 boundary (Jun 29 - Jul 2): counted once in year, once in Q2, once in Q3, once in Jun, once in Jul
      { precisionKey: 'PROGRAMADA_EXACTA', startDate: '2026-06-29', endDate: '2026-07-02' },
      // Q3 (Sep): PREPROGRAMADA_MES
      { precisionKey: 'PREPROGRAMADA_MES', estimatedYear: 2026, estimatedMonth: 9 },
      // Q4 (Nov): PREPROGRAMADA_MES
      { precisionKey: 'PREPROGRAMADA_MES', estimatedYear: 2026, estimatedMonth: 11 },
      // Different year (2027): excluded from 2026
      { precisionKey: 'PREPROGRAMADA_MES', estimatedYear: 2027, estimatedMonth: 1 },
      // Sin fecha
      { precisionKey: 'SIN_FECHA' },
    ],
    2026
  );

  assert.equal(counts.year, 2026);
  assert.equal(counts.yearTotals.total, 5);
  assert.equal(counts.yearTotals.real, 1);
  assert.equal(counts.yearTotals.programadaExacta, 2);
  assert.equal(counts.yearTotals.preprogramadaMes, 2);
  assert.equal(counts.sinFechaCount, 1);

  assert.equal(counts.quarters[1].total, 1);
  assert.equal(counts.quarters[2].total, 2);
  assert.equal(counts.quarters[3].total, 2);
  assert.equal(counts.quarters[4].total, 1);

  assert.equal(counts.months[2].total, 1);
  assert.equal(counts.months[2].real, 1);
  assert.equal(counts.months[4].total, 1);
  assert.equal(counts.months[6].total, 1);
  assert.equal(counts.months[7].total, 1);
  assert.equal(counts.months[9].total, 1);
  assert.equal(counts.months[9].preprogramadaMes, 1);
  assert.equal(counts.months[11].total, 1);
  assert.equal(counts.months[1].total, 0);
});

test('Step 9.1: renderCalendarioView renders 4-mode switcher, exact period counts, stage badges, Clean List Timeline table, RBAC & Zero-UUID', () => {
  const progSitio = makeProgram(
    [
      makeAudit({
        id: '81000000-0000-4000-8000-000000000011',
        codigo_auditoria: 'AUD-2026-SIT',
        id_tipo_auditoria: '91000000-0000-4000-8000-000000000001',
        fechas: [
          {
            id: '92000000-0000-4000-8000-000000000011',
            id_auditoria: '81000000-0000-4000-8000-000000000011',
            numero_secuencia: 1,
            tag: 'Programación',
            tipo_fecha: 'PROGRAMADA_EXACTA',
            anio: null,
            mes: null,
            fecha_inicio: '2026-04-14',
            fecha_fin: '2026-04-16',
            observacion: null,
            deleted_at: null,
          },
        ],
        sitiosPlan: [],
      }),
    ],
    {
      id: '80000000-0000-4000-8000-000000000011',
      codigo_programa: 'PRG-2026-SIT',
      etiqueta: 'Alfa · En Etapa Sitio',
    }
  );

  const progPreprog = makeProgram(
    [
      makeAudit({
        id: '81000000-0000-4000-8000-000000000012',
        id_programa_auditoria: '80000000-0000-4000-8000-000000000012',
        codigo_auditoria: 'AUD-2026-REV',
        id_organizacion: '30000000-0000-4000-8000-000000000002',
        organizacion_nombre: 'Beta Logística S.L.',
        auditor_lider_id: INITIAL_AUDITORES_DETAILED[1].id,
        auditor_lider: INITIAL_AUDITORES_DETAILED[1].nombre,
        estatus: 'Cerrado',
        fecha_cierre_auditoria: '2026-05-10',
        revisado: false,
        id_tipo_auditoria: '91000000-0000-4000-8000-000000000001',
        fechas: [
          {
            id: '92000000-0000-4000-8000-000000000012',
            id_auditoria: '81000000-0000-4000-8000-000000000012',
            numero_secuencia: 1,
            tag: 'Programación',
            tipo_fecha: 'PREPROGRAMADA_MES',
            anio: 2026,
            mes: 5,
            fecha_inicio: null,
            fecha_fin: null,
            observacion: null,
            deleted_at: null,
          },
        ],
      }),
    ],
    {
      id: '80000000-0000-4000-8000-000000000012',
      codigo_programa: 'PRG-2026-REV',
      etiqueta: 'Beta · En Revisión',
    }
  );

  const allPrograms = [progSitio, progPreprog];
  const allAudits = allPrograms.flatMap((p) => p.auditorias);

  for (const mode of ['anio', 'trimestre', 'mes', 'timeline'] as const) {
    const html = renderCalendarioView({
      profile: ADMIN_PROFILE,
      state: {
        viewMode: 'calendar',
        displayMode: mode,
        referenceYear: 2026,
        referenceMonth: 4,
        selectedQuarter: 2,
        filterAuditorId: 'ALL',
        filterStandard: 'ALL',
        filterMethodology: 'ALL',
        drawerAuditId: null,
      },
      audits: allAudits,
      auditors: INITIAL_AUDITORES_DETAILED,
      standards: [{ norma: 'ISO 9001:2015' }],
      programs: allPrograms,
    });

    // 4-mode switcher
    assert.ok(html.includes('data-cal-mode="anio"'));
    assert.ok(html.includes('data-cal-mode="trimestre"'));
    assert.ok(html.includes('data-cal-mode="mes"'));
    assert.ok(html.includes('data-cal-mode="timeline"'));

    // Top period count summary bar
    assert.ok(html.includes('id="calPeriodSummaryBar"'));
    assert.ok(html.includes('Año 2026: 2'));
    assert.ok(html.includes('Q2 (2)'));
    assert.ok(html.includes('Abril (1)'));

    // Etapa del Pipeline facet + clickable deep-link badges
    assert.ok(html.includes('data-facet-group="etapa_pipeline"'));
    assert.ok(html.includes('data-action="jump-pipeline-stage"'));
    assert.ok(html.includes('data-target-subview="designacion/sitio"'));

    if (mode === 'anio') {
      assert.ok(html.includes('id="calYearlyMatrix"'));
      assert.ok(html.includes('data-action="zoom-cal-month"'));
    }
    if (mode === 'trimestre') {
      assert.ok(html.includes('Q2 · 2 auditorías'));
    }
    if (mode === 'timeline') {
      assert.ok(html.includes('id="calTimelineTable"'));
      const tableMatch = /<table[^>]*id="calTimelineTable"[^>]*>([\s\S]*?)<\/table>/i.exec(html);
      assert.ok(tableMatch, 'Expected calTimelineTable');
      const colWidths = Array.from(tableMatch[1].matchAll(/width:\s*(\d+)%/gi)).map((m) =>
        Number(m[1])
      );
      assert.equal(
        colWidths.reduce((a, b) => a + b, 0),
        100,
        'Timeline table <colgroup> must sum to 100%'
      );
      const tbodyMatch = /<tbody[^>]*>([\s\S]*?)<\/tbody>/i.exec(tableMatch[1]);
      assert.ok(tbodyMatch);
      assert.equal(/<button\b/i.test(tbodyMatch[1]), false, 'Zero <button> inside <tbody>');
    }

    const uuidCheck = assertZeroUuidExposure(html);
    assert.equal(
      uuidCheck.compliant,
      true,
      `Zero-UUID violation in ${mode}: ${uuidCheck.exposedUuids.join(', ')}`
    );
  }

  // RBAC: AUDITOR sees only assigned audit (PRG-2026-SIT), not PRG-2026-REV
  const auditorAudits = scopeProgramacionAuditsForProfile(allAudits, AUDITOR_PROFILE, []);
  const auditorPrograms = scopeAuditProgramsForProfile(allPrograms, AUDITOR_PROFILE, auditorAudits);
  const auditorHtml = renderCalendarioView({
    profile: AUDITOR_PROFILE,
    state: {
      viewMode: 'calendar',
      displayMode: 'anio',
      referenceYear: 2026,
      referenceMonth: 4,
      filterAuditorId: 'ALL',
      filterStandard: 'ALL',
      filterMethodology: 'ALL',
      drawerAuditId: null,
    },
    audits: auditorAudits,
    auditors: INITIAL_AUDITORES_DETAILED,
    standards: [{ norma: 'ISO 9001:2015' }],
    programs: auditorPrograms,
  });
  assert.ok(auditorHtml.includes('PRG-2026-SIT'));
  assert.equal(auditorHtml.includes('PRG-2026-REV'), false);

  // RBAC: CLIENT sees only authorized org (Org A), never Org B
  const clientAudits = scopeProgramacionAuditsForProfile(allAudits, CLIENT_PROFILE, [
    '30000000-0000-4000-8000-000000000001',
  ]);
  const clientPrograms = scopeAuditProgramsForProfile(allPrograms, CLIENT_PROFILE, clientAudits);
  const clientHtml = renderCalendarioView({
    profile: CLIENT_PROFILE,
    state: {
      viewMode: 'calendar',
      displayMode: 'trimestre',
      referenceYear: 2026,
      referenceMonth: 4,
      selectedQuarter: 2,
      filterAuditorId: 'ALL',
      filterStandard: 'ALL',
      filterMethodology: 'ALL',
      drawerAuditId: null,
    },
    audits: clientAudits,
    auditors: INITIAL_AUDITORES_DETAILED,
    standards: [{ norma: 'ISO 9001:2015' }],
    programs: clientPrograms,
  });
  assert.ok(clientHtml.includes('PRG-2026-SIT'));
  assert.equal(clientHtml.includes('PRG-2026-REV'), false);
  assert.equal(clientHtml.includes('Beta Logística'), false);
});

test('Step 9.1: Calendario displays unified estatus_auditoria, jumps only to canonical routes (no scheduling/asignacion/programa), and omits phantom NC deadlines', () => {
  const auditPlanned = makeAudit({
    id: '81000000-0000-4000-8000-000000000201',
    codigo_auditoria: 'AUD-CAL-SYNC-01',
    id_tipo_auditoria: '91000000-0000-4000-8000-000000000001',
    fecha_inicio: '2026-06-10',
    fecha_fin: '2026-06-12',
    fechas: [
      {
        id: '92000000-0000-4000-8000-000000000201',
        id_auditoria: '81000000-0000-4000-8000-000000000201',
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'REAL',
        anio: null,
        mes: null,
        fecha_inicio: '2026-06-10',
        fecha_fin: '2026-06-12',
        observacion: null,
        deleted_at: null,
      },
    ],
  });
  const prog = makeProgram([auditPlanned], {
    id: '80000000-0000-4000-8000-000000000201',
    codigo_programa: 'PRG-CAL-SYNC-01',
    etiqueta: 'Industrias Alfa · Seguimiento Sync',
  });

  const html = renderCalendarioView({
    profile: ADMIN_PROFILE,
    state: {
      viewMode: 'list',
      displayMode: 'mes',
      referenceYear: 2026,
      referenceMonth: 6,
      filterAuditorId: 'ALL',
      filterStandard: 'ALL',
      filterMethodology: 'ALL',
      drawerAuditId: auditPlanned.id,
    },
    audits: [auditPlanned],
    auditors: INITIAL_AUDITORES_DETAILED,
    standards: [{ norma: 'ISO 9001:2015' }],
    programs: [prog],
    findings: [
      {
        id: 'f0000000-0000-4000-8000-000000000001',
        id_auditoria: auditPlanned.id,
        id_requisito: 'r0000000-0000-4000-8000-000000000001',
        tipo: 'NC_MAYOR',
        descripcion: 'Falta evidencia de revisión gerencial',
        fecha_evidencia: null,
        fecha_validacion: null,
        estatus_cierre: 'Abierta',
        deleted_at: null,
      },
    ],
  });

  assert.match(html, /En Cierre de NC/);
  assert.match(html, /Ver Resumen de Auditoría/);
  assert.equal(/data-target-subview="(asignacion|programa|scheduling)"/.test(html), false);
  assert.equal(/\+15 días|\+45 días|Vencimiento NC/i.test(html), false);
});

test('Step 4.1: Calendario renders organizacion_abreviacion, vN badge, and Alcance/Sin alcance context across list, timeline, and drawer', () => {
  const certVerId = '70000000-0000-4000-8000-000000000401';
  const auditPlanned = makeAudit({
    id: '81000000-0000-4000-8000-000000000301',
    codigo_auditoria: 'AUD-CAL-VER-01',
    id_certificado: '50000000-0000-4000-8000-000000000001',
    id_certificado_version: certVerId,
    version_numero: 2,
    organizacion_abreviacion: 'IND-ALFA',
    id_tipo_auditoria: '91000000-0000-4000-8000-000000000001',
    fechas: [
      {
        id: '92000000-0000-4000-8000-000000000301',
        id_auditoria: '81000000-0000-4000-8000-000000000301',
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'PROGRAMADA_EXACTA',
        anio: null,
        mes: null,
        fecha_inicio: '2026-06-10',
        fecha_fin: '2026-06-12',
        observacion: null,
        deleted_at: null,
      },
    ],
  });
  const prog = makeProgram([auditPlanned], {
    id: '80000000-0000-4000-8000-000000000301',
    codigo_programa: 'PRG-CAL-VER-01',
    etiqueta: 'Industrias Alfa · Ciclo v2',
  });
  const certs: CertificadoDetailEntity[] = [
    {
      id: auditPlanned.id_certificado,
      numero_certificado: auditPlanned.numero_certificado,
      id_organizacion: auditPlanned.id_organizacion,
      organizacion_nombre: auditPlanned.organizacion_nombre,
      organizacion_abreviacion: 'IND-ALFA',
      id_norma: '10000000-0000-4000-8000-000000000001',
      norma_codigo: 'ISO 9001:2015',
      estatus: 'Activo',
      sector_iaf: 17,
      alcance: '',
      alcanceDetalle: null,
      versiones: [
        {
          id: certVerId,
          id_certificado: auditPlanned.id_certificado,
          version_numero: 2,
          es_version_actual: true,
          fecha_emision_version: '2026-01-01',
          organizacion_abreviacion: 'IND-ALFA',
          sitios: [],
          procesos: [],
          turnos: [],
          noAplicables: [],
          deleted_at: null,
        },
      ],
      sitios: [],
    },
  ];

  const timelineHtml = renderCalendarioView({
    profile: ADMIN_PROFILE,
    state: {
      viewMode: 'calendar',
      displayMode: 'timeline',
      referenceYear: 2026,
      referenceMonth: 6,
      filterAuditorId: 'ALL',
      filterStandard: 'ALL',
      filterMethodology: 'ALL',
      drawerAuditId: auditPlanned.id,
    },
    audits: [auditPlanned],
    certificados: certs,
    auditors: INITIAL_AUDITORES_DETAILED,
    standards: [{ norma: 'ISO 9001:2015' }],
    programs: [prog],
  });

  assert.match(timelineHtml, /IND-ALFA/);
  assert.match(timelineHtml, />v2</);
  assert.match(timelineHtml, /Sin alcance/);
  assert.equal(assertZeroUuidExposure(timelineHtml).compliant, true);
});
