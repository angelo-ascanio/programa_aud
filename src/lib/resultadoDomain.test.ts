import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  addCalendarDaysIso,
  buildCertificateResultadoRows,
  computeDefaultAuditClosingDate,
  computeFindingDeadlinesFromRealDate,
  computeNcLimitsFromLatestReal,
  evaluateNcCardStatus,
  evaluateRealExecutionCapacity,
  extractDiscreteRealDates,
  filterRequirementsForAuditNorma,
  resolveAuditRealWindow,
  resolveMaxRealDateIso,
  validateClauseNcDraft,
  validateCloseAuditAction,
  validateDiscreteRealDateAdd,
  validateFindingFollowUpDates,
  validateRealExecutionDateInput,
} from './resultadoDomain';
import {
  computeAuditAlerts,
  DEFAULT_AUDIT_ALERT_CONFIG,
  type AlertConfigEntity,
} from './auditAlertsEngine';
import { validateAndNormalizeAlertConfigInput } from './auditPlanningPersistence';
import { INITIAL_AUDITORES_DETAILED } from './competencyMatrix';
import {
  INITIAL_PHASE5_FINDINGS,
  INITIAL_PROGRAMACION_AUDITS,
  type Phase5FindingEntity,
  type ProgramacionAuditEntity,
  type ResultadoViewState,
} from './auditExecution';
import type { ProgramaAuditoriaEntity } from './auditPlanningEngine';
import type { AuditoriaSitioTemporalEntity } from './designacionTemporalDomain';
import type { CertificadoDetailEntity } from './multisiteSampling';
import type { UserProfile } from './healthCheck';
import { assertZeroUuidExposure } from './zeroUuid';
import { renderResultadoView } from '../views/resultadoView';
import { renderCalendarioView } from '../views/calendarioView';

const ADMIN_PROFILE: UserProfile = {
  id: '10000000-0000-4000-8000-000000000001',
  nombre: 'Administrador Principal',
  role: 'ADMIN',
  status: 'APPROVED',
  created_at: '2025-01-01T00:00:00Z',
};

const WORKER_PROFILE: UserProfile = {
  id: '10000000-0000-4000-8000-000000000002',
  nombre: 'Coordinador Técnico',
  role: 'WORKER',
  status: 'APPROVED',
  created_at: '2025-01-01T00:00:00Z',
};

const ASSIGNED_AUDITOR_ID = '20000000-0000-4000-8000-000000000011';
const SECOND_AUDITOR_ID = '20000000-0000-4000-8000-000000000012';
const UNASSIGNED_AUDITOR_ID = '20000000-0000-4000-8000-000000000099';

const ASSIGNED_AUDITOR_PROFILE: UserProfile = {
  id: ASSIGNED_AUDITOR_ID,
  nombre: 'Ing. Carlos Mendoza',
  role: 'AUDITOR',
  status: 'APPROVED',
  created_at: '2025-01-01T00:00:00Z',
};

const UNASSIGNED_AUDITOR_PROFILE: UserProfile = {
  id: UNASSIGNED_AUDITOR_ID,
  nombre: 'Dra. Auditora Externa',
  role: 'AUDITOR',
  status: 'APPROVED',
  created_at: '2025-01-01T00:00:00Z',
};

const CLIENT_PROFILE: UserProfile = {
  id: '30000000-0000-4000-8000-000000000001',
  nombre: 'Cliente Corporativo',
  role: 'CLIENT',
  status: 'APPROVED',
  created_at: '2025-01-01T00:00:00Z',
};

const AUDIT_ID_1 = '80000000-0000-4000-8000-000000000101';
const AUDIT_ID_2 = '80000000-0000-4000-8000-000000000102';
const SITE_ID_1 = '50000000-0000-4000-8000-000000000201';
const FINDING_ID_1 = 'a1000000-0000-4000-8000-000000000301';

function buildSampleAudit(overrides: Partial<ProgramacionAuditEntity> = {}): ProgramacionAuditEntity {
  const base = INITIAL_PROGRAMACION_AUDITS[0];
  return {
    ...base,
    id: AUDIT_ID_1,
    codigo_auditoria: 'AUD-2026-101',
    organizacion_nombre: 'Aceros Industriales del Sur S.A.',
    numero_certificado: 'FN-QMS-2026-101',
    norma_codigo: 'ISO 9001:2015',
    auditor_lider_id: ASSIGNED_AUDITOR_ID,
    auditor_lider: 'Ing. Carlos Mendoza',
    estado_ciclo: 'En Ejecución',
    estatus: 'En Ejecución',
    dias_auditor: 6,
    tiempo_auditoria: 6,
    fechas: [
      {
        id: '91000000-0000-4000-8000-000000000001',
        id_auditoria: AUDIT_ID_1,
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'REAL',
        anio: null,
        mes: null,
        fecha_inicio: '2026-10-05',
        fecha_fin: '2026-10-07',
        observacion: 'Ejecución paralela verificada',
        deleted_at: null,
      },
    ],
    latestDate: {
      id: '91000000-0000-4000-8000-000000000001',
      id_auditoria: AUDIT_ID_1,
      numero_secuencia: 1,
      tag: 'Programación',
      tipo_fecha: 'REAL',
      anio: null,
      mes: null,
      fecha_inicio: '2026-10-05',
      fecha_fin: '2026-10-07',
      observacion: 'Ejecución paralela verificada',
      deleted_at: null,
    },
    equipo: [
      {
        ...base.equipo[0],
        id_auditor: ASSIGNED_AUDITOR_ID,
        nombre: 'Ing. Carlos Mendoza',
      },
      {
        ...base.equipo[0],
        id: 'eq-second',
        id_auditor: SECOND_AUDITOR_ID,
        nombre: 'Ing. Lucía Paredes',
        rol: 'Auditor de Equipo',
      },
    ],
    sitiosPlan: [
      {
        id: 'sp-1',
        id_auditoria: AUDIT_ID_1,
        id_sitio: SITE_ID_1,
        numero_sitio: 0,
        nombre_sitio: 'Planta Principal',
        direccion_sitio: 'Zona Industrial Sur',
        tiempo_auditoria: 6,
        modalidad_evaluacion: 'Presencial',
        fecha_inicio: '2026-10-05',
        fecha_fin: '2026-10-07',
        notas_sitio: null,
        deleted_at: null,
        procesos: [],
        equipoSitio: [
          {
            id: 'es-1',
            id_sitios_por_auditoria: 'sp-1',
            id_auditor: ASSIGNED_AUDITOR_ID,
            auditor_nombre: 'Ing. Carlos Mendoza',
            rol_auditor: 'AUDITOR_LIDER',
            tiempo_auditoria: 3,
            asignacion_completa_sitio: true,
            deleted_at: null,
          },
          {
            id: 'es-2',
            id_sitios_por_auditoria: 'sp-1',
            id_auditor: SECOND_AUDITOR_ID,
            auditor_nombre: 'Ing. Lucía Paredes',
            rol_auditor: 'AUDITOR',
            tiempo_auditoria: 3,
            asignacion_completa_sitio: true,
            deleted_at: null,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function buildSampleFinding(overrides: Partial<Phase5FindingEntity> = {}): Phase5FindingEntity {
  return {
    ...INITIAL_PHASE5_FINDINGS[0],
    id: FINDING_ID_1,
    codigo_hallazgo: 'HAL-2026-101',
    id_auditoria: AUDIT_ID_1,
    organizacion_nombre: 'Aceros Industriales del Sur S.A.',
    numero_certificado: 'FN-QMS-2026-101',
    id_sitio: SITE_ID_1,
    sitio_nombre: 'Planta Principal',
    tipo: 'NC_MENOR',
    estado_ciclo: 'Abierto',
    cerrado: false,
    fecha_limite: '2026-12-06',
    fecha_limite_plan: '2026-10-22',
    fecha_entrega_plan: null,
    fecha_limite_cierre: '2026-12-06',
    fecha_cierre_real: null,
    fecha_cierre: null,
    deleted_at: null,
    ...overrides,
  };
}

const BASE_RESULTADO_STATE: ResultadoViewState = {
  selectedAuditId: 'ALL',
  activeAuditIdForDecision: AUDIT_ID_1,
  selectedResultAuditId: null,
  displayMode: 'list',
  filterType: 'ALL',
  filterLifecycle: 'ALL',
  searchQuery: '',
  isLoggingFinding: false,
  inspectingFindingId: null,
};

const SAMPLE_PROCESSES = [
  { id: '60000000-0000-4000-8000-000000000001', nombre_proceso: 'Producción y Metrología' },
];
const SAMPLE_REQUIREMENTS = [
  {
    id: 'f0000000-0000-4000-8000-000000000085',
    codigo: '8.5.1',
    norma: 'ISO 9001:2015',
    titulo: 'Control de la producción y de la provisión del servicio',
  },
  {
    id: 'f0000000-0000-4000-8000-000000000140',
    codigo: '6.1.2',
    norma: 'ISO 14001:2015',
    titulo: 'Aspectos ambientales',
  },
];

describe('Step 10.2 — Pure Domain: Multi-Auditor Capacity, NC Deadlines & Audit Closing', () => {
  it('validates 6.00 auditor-days split across 2 concurrent auditors (3.00d each) over 3 REAL calendar days', () => {
    const audit = buildSampleAudit();
    const summary = evaluateRealExecutionCapacity(audit, []);

    assert.equal(summary.hasRealDates, true);
    assert.equal(summary.realStartIso, '2026-10-05');
    assert.equal(summary.realEndIso, '2026-10-07');
    assert.equal(summary.realCalendarSpanDays, 3);
    assert.equal(summary.totalAuditorDays, 6);
    assert.equal(summary.distinctAuditorsCount, 2);
    assert.equal(summary.maxDaysSingleAuditor, 3);
    assert.equal(summary.isConcurrentScheduleValid, true);
    assert.equal(summary.overloadedWarnings.length, 0);
    assert.match(summary.compactSummaryLabel, /Días-Auditor: 6\.00d \| Ventana Real: 3 días calendario \(2 auditores\)/);
  });

  it('triggers overload warning only when a single auditor exceeds realCalendarSpanDays', () => {
    const audit = buildSampleAudit({
      sitiosPlan: [
        {
          id: 'sp-overload',
          id_auditoria: AUDIT_ID_1,
          id_sitio: SITE_ID_1,
          numero_sitio: 0,
          nombre_sitio: 'Planta Principal',
          direccion_sitio: 'Zona Industrial Sur',
          tiempo_auditoria: 4,
          modalidad_evaluacion: 'Presencial',
          fecha_inicio: '2026-10-05',
          fecha_fin: '2026-10-07',
          notas_sitio: null,
          deleted_at: null,
          procesos: [],
          equipoSitio: [
            {
              id: 'es-over',
              id_sitios_por_auditoria: 'sp-overload',
              id_auditor: ASSIGNED_AUDITOR_ID,
              auditor_nombre: 'Ing. Carlos Mendoza',
              rol_auditor: 'AUDITOR_LIDER',
              tiempo_auditoria: 4,
              asignacion_completa_sitio: true,
              deleted_at: null,
            },
          ],
        },
      ],
    });

    const summary = evaluateRealExecutionCapacity(audit, []);
    assert.equal(summary.hasRealDates, true);
    assert.equal(summary.realCalendarSpanDays, 3);
    assert.equal(summary.totalAuditorDays, 4);
    assert.equal(summary.maxDaysSingleAuditor, 4);
    assert.equal(summary.isConcurrentScheduleValid, false);
    assert.equal(summary.overloadedWarnings.length, 1);
    assert.match(summary.overloadedWarnings[0], /Ing\. Carlos Mendoza/);
  });

  it('falls back to audit.equipo and dias_auditor when sitiosPlan has no equipoSitio assignments', () => {
    const legacyAudit = buildSampleAudit({
      dias_auditor: 3,
      tiempo_auditoria: 3,
      sitiosPlan: [],
    });
    const summary = evaluateRealExecutionCapacity(legacyAudit, []);
    assert.equal(summary.totalAuditorDays, 3);
    assert.equal(summary.distinctAuditorsCount, 2);
    assert.equal(summary.isConcurrentScheduleValid, true);
    assert.match(summary.compactSummaryLabel, /Días-Auditor: 3\.00d \| Ventana Real: 3 días calendario \(2 auditores\)/);
  });

  it('includes temporal site auditor days and handles missing REAL dates gracefully', () => {
    const auditNoReal = buildSampleAudit({
      fechas: [],
      latestDate: null,
    });

    const temporalSites: AuditoriaSitioTemporalEntity[] = [
      {
        id: '71000000-0000-4000-8000-000000000001',
        id_auditoria: AUDIT_ID_1,
        etiqueta: 'Frente Obra Temporal',
        comentario: null,
        tiempo_auditoria: 1.5,
        deleted_at: null,
        certificados: [
          {
            id: '72000000-0000-4000-8000-000000000001',
            id_sitio_temporal: '71000000-0000-4000-8000-000000000001',
            id_auditoria_certificado: AUDIT_ID_1,
            numero_certificado: 'FN-QMS-2026-101',
            organizacion_nombre: 'Aceros Industriales del Sur S.A.',
            norma_codigo: 'ISO 9001:2015',
            deleted_at: null,
          },
        ],
        equipoTemporal: [
          {
            id: '73000000-0000-4000-8000-000000000001',
            id_sitio_temporal: '71000000-0000-4000-8000-000000000001',
            id_auditor: SECOND_AUDITOR_ID,
            auditor_nombre: 'Ing. Lucía Paredes',
            rol_auditor: 'AUDITOR',
            tiempo_auditoria: 1.5,
            deleted_at: null,
          },
        ],
      },
    ];

    const pendingSummary = evaluateRealExecutionCapacity(auditNoReal, temporalSites);
    assert.equal(pendingSummary.hasRealDates, false);
    assert.equal(pendingSummary.totalAuditorDays, 7.5);
    assert.match(pendingSummary.compactSummaryLabel, /Ventana Real: Pendiente/);

    const overrideSummary = evaluateRealExecutionCapacity(
      auditNoReal,
      temporalSites,
      '2026-10-05',
      '2026-10-09'
    );
    assert.equal(overrideSummary.hasRealDates, true);
    assert.equal(overrideSummary.realCalendarSpanDays, 5);
    assert.equal(overrideSummary.maxDaysSingleAuditor, 4.5);
    assert.equal(overrideSummary.isConcurrentScheduleValid, true);
  });

  it('calculates finding deadlines (+15d/+45d defaults and custom offsets) accurately across UTC month/year boundaries', () => {
    assert.equal(addCalendarDaysIso('2026-12-20', 15), '2027-01-04');

    const defaultDeadlines = computeFindingDeadlinesFromRealDate('2026-10-07');
    assert.equal(defaultDeadlines.planOffsetDays, 15);
    assert.equal(defaultDeadlines.cierreOffsetDays, 45);
    assert.equal(defaultDeadlines.fechaLimitePlan, '2026-10-22');
    assert.equal(defaultDeadlines.fechaLimiteCierre, '2026-11-21');

    const customDeadlines = computeFindingDeadlinesFromRealDate('2026-10-07', {
      dias_limite_plan_nc: 10,
      dias_limite_cierre_nc: 60,
    });
    assert.equal(customDeadlines.fechaLimitePlan, '2026-10-17');
    assert.equal(customDeadlines.fechaLimiteCierre, '2026-12-06');

    const legacyPlanDeadlines = computeFindingDeadlinesFromRealDate('2026-10-07', {
      dias_limite_plan_accion: 12,
      dias_limite_cierre_nc: 30,
    });
    assert.equal(legacyPlanDeadlines.fechaLimitePlan, '2026-10-19');
    assert.equal(legacyPlanDeadlines.fechaLimiteCierre, '2026-11-06');
  });

  it('computes default audit closing date across 0 NCs, open NCs, closed NCs, archived NCs, and non-NC observations', () => {
    const realEnd = '2026-10-07';

    // 0 NCs (or only OBSERVACION / OPORTUNIDAD_MEJORA / soft-deleted NC) -> realEnd
    const onlyObsAndArchivedNc: Phase5FindingEntity[] = [
      buildSampleFinding({
        id: 'f-obs',
        tipo: 'OBSERVACION',
        fecha_limite_cierre: '2026-12-30',
      }),
      buildSampleFinding({
        id: 'f-deleted-nc',
        tipo: 'NC_MAYOR',
        fecha_limite_cierre: '2027-01-15',
        deleted_at: '2026-10-08T10:00:00Z',
      }),
    ];
    assert.equal(computeDefaultAuditClosingDate(realEnd, onlyObsAndArchivedNc), realEnd);

    // >= 1 open NC -> MAX(fecha_limite_cierre)
    const openNcs: Phase5FindingEntity[] = [
      buildSampleFinding({
        id: 'f-nc1',
        tipo: 'NC_MENOR',
        cerrado: false,
        fecha_limite_cierre: '2026-12-06',
      }),
      buildSampleFinding({
        id: 'f-nc2',
        tipo: 'NC_MAYOR',
        cerrado: true,
        fecha_cierre_real: '2026-11-02',
        fecha_limite_cierre: '2026-12-20',
      }),
    ];
    assert.equal(computeDefaultAuditClosingDate(realEnd, openNcs), '2026-12-20');

    // All active NCs closed with fecha_cierre_real -> MAX(fecha_cierre_real)
    const allClosedNcs: Phase5FindingEntity[] = [
      buildSampleFinding({
        id: 'f-c1',
        tipo: 'NC_MENOR',
        cerrado: true,
        fecha_cierre_real: '2026-10-29',
        fecha_limite_cierre: '2026-12-06',
      }),
      buildSampleFinding({
        id: 'f-c2',
        tipo: 'NC_MAYOR',
        cerrado: true,
        fecha_cierre_real: '2026-11-08',
        fecha_limite_cierre: '2026-12-20',
      }),
    ];
    assert.equal(computeDefaultAuditClosingDate(realEnd, allClosedNcs), '2026-11-08');
  });

  it('enforces validation rules on close audit action, REAL dates, finding follow-up dates, and alert offsets', () => {
    // validateCloseAuditAction
    assert.throws(() => validateCloseAuditAction('invalid-id', '2026-10-07', '2026-10-07'));
    assert.match(
      validateCloseAuditAction(AUDIT_ID_1, null, '2026-10-07') || '',
      /fecha REAL de ejecución/
    );
    assert.match(
      validateCloseAuditAction(AUDIT_ID_1, '2026-10-07', '2026-10-05') || '',
      /no puede ser anterior/
    );
    assert.equal(validateCloseAuditAction(AUDIT_ID_1, '2026-10-07', '2026-10-07'), null);
    assert.equal(validateCloseAuditAction(AUDIT_ID_1, '2026-10-07', '2026-11-15'), null);

    // validateRealExecutionDateInput + Zero-UUID hygiene on observacion
    assert.match(
      validateRealExecutionDateInput({
        fecha_inicio: '2026-10-07',
        fecha_fin: '2026-10-05',
      }) || '',
      /igual o posterior/
    );
    assert.match(
      validateRealExecutionDateInput({
        fecha_inicio: '2026-10-05',
        fecha_fin: '2026-10-07',
        observacion: `Auditoría ${AUDIT_ID_1} finalizada`,
      }) || '',
      /UUID/
    );
    assert.equal(
      validateRealExecutionDateInput({
        fecha_inicio: '2026-10-05',
        fecha_fin: '2026-10-07',
        observacion: 'Ejecución completada in situ',
      }),
      null
    );

    // validateFindingFollowUpDates
    assert.match(
      validateFindingFollowUpDates({ fecha_entrega_plan: '2026-02-30' }) || '',
      /YYYY-MM-DD/
    );
    assert.equal(
      validateFindingFollowUpDates({
        fecha_entrega_plan: '2026-10-18',
        fecha_cierre_real: '2026-11-12',
        cerrado: true,
      }),
      null
    );

    // validateAndNormalizeAlertConfigInput with Step 10.2 offsets
    const badOffset = validateAndNormalizeAlertConfigInput({
      dias_aviso_proxima: 15,
      dias_aviso_preprogramada_sin_confirmar: 30,
      alertar_atrasadas: true,
      alertar_conflicto_auditor: true,
      alertar_desfase_dias_o_span: true,
      ciclos_rotacion_auditor_lider: 3,
      alertas_activas: true,
      dias_limite_plan_accion: 0,
      dias_limite_cierre_nc: 60,
    });
    assert.equal(badOffset.ok, false);

    const goodOffset = validateAndNormalizeAlertConfigInput({
      dias_aviso_proxima: 15,
      dias_aviso_preprogramada_sin_confirmar: 30,
      alertar_atrasadas: true,
      alertar_conflicto_auditor: true,
      alertar_desfase_dias_o_span: true,
      ciclos_rotacion_auditor_lider: 3,
      alertas_activas: true,
      dias_limite_plan_accion: 20,
      dias_limite_cierre_nc: 90,
    });
    assert.equal(goodOffset.ok, true);
    if (goodOffset.ok) {
      assert.equal(goodOffset.value.dias_limite_plan_accion, 20);
      assert.equal(goodOffset.value.dias_limite_cierre_nc, 90);
    }

    // resolveAuditRealWindow ignores soft-deleted entries
    const audit = buildSampleAudit();
    assert.equal(resolveAuditRealWindow(audit).realEndIso, '2026-10-07');
  });
});

describe('Step 8.1 — Discrete Real Dates, Clause-Only NCs, +15d/+45d Limits & Calendar Exclusion', () => {
  it('extracts discrete REAL dates chronologically, resolves MAX(fecha_real), and rejects invalid/duplicate dates', () => {
    const auditMultiDates = buildSampleAudit({
      fechas: [
        {
          id: 'd-2',
          id_auditoria: AUDIT_ID_1,
          numero_secuencia: 2,
          tag: 'Programación',
          tipo_fecha: 'REAL',
          anio: null,
          mes: null,
          fecha_inicio: '2026-10-08',
          fecha_fin: '2026-10-08',
          observacion: null,
          deleted_at: null,
        },
        {
          id: 'd-1',
          id_auditoria: AUDIT_ID_1,
          numero_secuencia: 1,
          tag: 'Programación',
          tipo_fecha: 'REAL',
          anio: null,
          mes: null,
          fecha_inicio: '2026-10-05',
          fecha_fin: '2026-10-05',
          observacion: null,
          deleted_at: null,
        },
        {
          id: 'd-deleted',
          id_auditoria: AUDIT_ID_1,
          numero_secuencia: 3,
          tag: 'Programación',
          tipo_fecha: 'REAL',
          anio: null,
          mes: null,
          fecha_inicio: '2026-10-20',
          fecha_fin: '2026-10-20',
          observacion: null,
          deleted_at: '2026-10-21T00:00:00Z',
        },
      ],
      latestDate: null,
    });

    const discrete = extractDiscreteRealDates(auditMultiDates);
    assert.deepEqual(
      discrete.map((d) => d.isoDate),
      ['2026-10-05', '2026-10-08']
    );
    assert.deepEqual(
      discrete.map((d) => d.dmyLabel),
      ['05/10/2026', '08/10/2026']
    );
    assert.equal(resolveMaxRealDateIso(auditMultiDates), '2026-10-08');

    const dup = validateDiscreteRealDateAdd(auditMultiDates, '2026-10-05');
    assert.equal(dup.ok, false);
    if (!dup.ok) assert.match(dup.error, /ya se encuentra registrada/i);

    const bad = validateDiscreteRealDateAdd(auditMultiDates, '2026-02-30');
    assert.equal(bad.ok, false);

    const good = validateDiscreteRealDateAdd(auditMultiDates, '2026-10-12');
    assert.equal(good.ok, true);
    if (good.ok) assert.equal(good.isoDate, '2026-10-12');
  });

  it('computes +15d/+45d limits (and custom offsets) from MAX(fecha_real) and evaluates NC card status', () => {
    const limitsDefault = computeNcLimitsFromLatestReal('2026-10-08', DEFAULT_AUDIT_ALERT_CONFIG);
    assert.equal(limitsDefault.hasRealDate, true);
    assert.equal(limitsDefault.planLimitIso, '2026-10-23');
    assert.equal(limitsDefault.cierreLimitIso, '2026-11-22');

    const limitsCustom = computeNcLimitsFromLatestReal('2026-10-08', {
      dias_limite_plan_nc: 10,
      dias_limite_cierre_nc: 30,
    });
    assert.equal(limitsCustom.planLimitIso, '2026-10-18');
    assert.equal(limitsCustom.cierreLimitIso, '2026-11-07');

    // Plan pendiente
    const pendingEval = evaluateNcCardStatus(
      buildSampleFinding({ fecha_entrega_plan: null, fecha_cierre_real: null, cerrado: false }),
      '2026-10-08',
      DEFAULT_AUDIT_ALERT_CONFIG,
      '2026-10-15'
    );
    assert.equal(pendingEval.statusKey, 'PLAN_PENDIENTE');
    assert.equal(pendingEval.statusLabel, 'Plan pendiente');

    // En ejecución de cierre
    const inProgressEval = evaluateNcCardStatus(
      buildSampleFinding({ fecha_entrega_plan: '2026-10-18', fecha_cierre_real: null, cerrado: false }),
      '2026-10-08',
      DEFAULT_AUDIT_ALERT_CONFIG,
      '2026-11-01'
    );
    assert.equal(inProgressEval.statusKey, 'EN_EJECUCION_CIERRE');
    assert.equal(inProgressEval.statusLabel, 'En ejecución de cierre');
    assert.equal(inProgressEval.planOnTime, true);

    // Vencida
    const overdueEval = evaluateNcCardStatus(
      buildSampleFinding({ fecha_entrega_plan: null, fecha_cierre_real: null, cerrado: false }),
      '2026-10-08',
      DEFAULT_AUDIT_ALERT_CONFIG,
      '2026-10-30'
    );
    assert.equal(overdueEval.statusKey, 'VENCIDA');
    assert.equal(overdueEval.statusLabel, 'Vencida');

    // Cerrada ✓
    const closedEval = evaluateNcCardStatus(
      buildSampleFinding({
        fecha_entrega_plan: '2026-10-18',
        fecha_cierre_real: '2026-11-10',
        cerrado: true,
      }),
      '2026-10-08',
      DEFAULT_AUDIT_ALERT_CONFIG,
      '2026-12-01'
    );
    assert.equal(closedEval.statusKey, 'CERRADA');
    assert.equal(closedEval.statusLabel, 'Cerrada ✓');
    assert.equal(closedEval.cierreOnTime, true);
  });

  it('filters requirements strictly by audit norma_codigo and enforces clause-only NC (id_proceso = null)', () => {
    const allowed = filterRequirementsForAuditNorma(SAMPLE_REQUIREMENTS, 'ISO 9001:2015');
    assert.equal(allowed.length, 1);
    assert.equal(allowed[0].codigo, '8.5.1');
    assert.equal(
      allowed[0].label,
      '8.5.1 - Control de la producción y de la provisión del servicio'
    );

    const crossNormaReject = validateClauseNcDraft(
      {
        auditId: AUDIT_ID_1,
        tipo: 'NC_MENOR',
        id_requisito: 'f0000000-0000-4000-8000-000000000140',
        descripcion: 'Falta control de aspectos ambientales.',
      },
      allowed
    );
    assert.equal(crossNormaReject.ok, false);

    const rawUuidReject = validateClauseNcDraft(
      {
        auditId: AUDIT_ID_1,
        tipo: 'NC_MAYOR',
        id_requisito: 'f0000000-0000-4000-8000-000000000085',
        descripcion: `Desviación detectada en ${AUDIT_ID_1}`,
      },
      allowed
    );
    assert.equal(rawUuidReject.ok, false);

    const okClauseNc = validateClauseNcDraft(
      {
        auditId: AUDIT_ID_1,
        tipo: 'NC_MENOR',
        id_requisito: 'f0000000-0000-4000-8000-000000000085',
        descripcion: 'Registros de calibración incompletos en línea 2.',
      },
      allowed
    );
    assert.equal(okClauseNc.ok, true);
    if (okClauseNc.ok) {
      assert.equal(okClauseNc.value.id_proceso, null);
      assert.equal(okClauseNc.value.requisito_codigo, '8.5.1');
    }
  });

  it('aggregates 1 row per certificate in buildCertificateResultadoRows', () => {
    const audit = buildSampleAudit();
    const openNc = buildSampleFinding({ cerrado: false, fecha_cierre_real: null });
    const rows = buildCertificateResultadoRows({
      audits: [audit],
      findings: [openNc],
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].numero_certificado, 'FN-QMS-2026-101');
    assert.equal(rows[0].realDatesCount, 1);
    assert.equal(rows[0].openNcsCount, 1);
    assert.equal(rows[0].statusKey, 'CON_NC_ABIERTAS');
  });

  it('excludes NC Plan and Cierre deadlines from Calendario and computeAuditAlerts', () => {
    const audit = buildSampleAudit();
    const program: ProgramaAuditoriaEntity = {
      id: '90000000-0000-4000-8000-000000000001',
      codigo_programa: 'PRG-2026-001',
      etiqueta: 'Programa QMS',
      id_organizacion: audit.id_organizacion,
      organizacion_nombre: audit.organizacion_nombre,
      id_grupo_empresarial: null,
      grupo_empresarial_nombre: null,
      nivel_vinculacion: 'NIVEL_0_INDIVIDUAL',
      naturaleza_vinculacion: 'Individual',
      es_programa_unico: true,
      esquema_certificacion: 'Individual',
      auditorias: [audit],
      deleted_at: null,
    };

    const alerts = computeAuditAlerts([program], DEFAULT_AUDIT_ALERT_CONFIG, '2026-10-20');
    assert.equal(
      alerts.some((a) => /Límite Plan|Límite Cierre|NC|Plan de Acción/i.test(`${a.title} ${a.detail}`)),
      false
    );

    const calHtml = renderCalendarioView({
      profile: ADMIN_PROFILE,
      state: {
        displayMode: 'mes',
        referenceYear: 2026,
        referenceMonth: 10,
        selectedQuarter: 4,
        filterAuditorId: 'ALL',
        filterStandard: 'ALL',
        filterMethodology: 'ALL',
        drawerAuditId: null,
        viewMode: 'calendar',
      },
      audits: [audit],
      auditors: INITIAL_AUDITORES_DETAILED,
      standards: [{ norma: 'ISO 9001:2015' }],
      programs: [program],
      alertConfig: DEFAULT_AUDIT_ALERT_CONFIG,
    });
    assert.doesNotMatch(calHtml, /2026-10-22|2026-11-21|Límite Plan|Límite Cierre/i);
  });
});

function extractTableColgroupPcts(html: string, tableId: string): number[] {
  const tableStart = html.indexOf(`data-resizable-table="${tableId}"`);
  assert.notEqual(tableStart, -1, `Expected table with data-resizable-table="${tableId}"`);
  const tableSlice = html.slice(tableStart, html.indexOf('</table>', tableStart));
  const colMatches = [...tableSlice.matchAll(/<col\b[^>]*style="[^"]*width:\s*([\d.]+)%/gi)];
  return colMatches.map((m) => Number(m[1]));
}

function extractTbodyHtml(html: string, tableId: string): string {
  const tableStart = html.indexOf(`data-resizable-table="${tableId}"`);
  assert.notEqual(tableStart, -1, `Expected table with data-resizable-table="${tableId}"`);
  const tableSlice = html.slice(tableStart, html.indexOf('</table>', tableStart));
  const tbodyMatch = tableSlice.match(/<tbody\b[\s\S]*?<\/tbody>/i);
  assert.ok(tbodyMatch, `Expected <tbody> inside table "${tableId}"`);
  return tbodyMatch[0];
}

describe('Step 8.1 — Resultado UI Rendering, Popup Modal, Detail View & RBAC Matrix', () => {
  it('renders Organization Multi View (30/22/22/13/13 = 100%, 0 <button> in <tbody>), Pop-up Modal and Plazos NC popup modal', () => {
    const audit = buildSampleAudit();
    const finding = buildSampleFinding();

    const html = renderResultadoView({
      profile: ADMIN_PROFILE,
      state: {
        ...BASE_RESULTADO_STATE,
        isNcOffsetsModalOpen: true,
      },
      audits: [audit],
      findings: [finding],
      processes: SAMPLE_PROCESSES,
      requirements: SAMPLE_REQUIREMENTS,
      alertConfig: DEFAULT_AUDIT_ALERT_CONFIG,
    });

    const pcts = extractTableColgroupPcts(html, 'resultado-main');
    assert.deepEqual(pcts, [30, 22, 22, 13, 13]);
    assert.equal(pcts.reduce((a, b) => a + b, 0), 100);

    const tbody = extractTbodyHtml(html, 'resultado-main');
    assert.equal(/<button\b/i.test(tbody), false, 'Zero <button> allowed inside <tbody>');
    assert.match(tbody, /data-action="open-org-cert-picker"/);

    const modalHtml = renderResultadoView({
      profile: ADMIN_PROFILE,
      state: {
        ...BASE_RESULTADO_STATE,
        pickerOrgId: audit.id_organizacion,
      },
      audits: [audit],
      findings: [finding],
      processes: SAMPLE_PROCESSES,
      requirements: SAMPLE_REQUIREMENTS,
      alertConfig: DEFAULT_AUDIT_ALERT_CONFIG,
    });
    assert.match(modalHtml, /id="orgCertPickerModal"/);
    assert.match(modalHtml, /data-action="select-org-picker-cert"/);

    assert.match(html, /id="openNcOffsetsModalBtn"/);
    assert.match(html, /Plazos NC \(\+15d \/ \+45d\)/);
    assert.match(html, /id="ncOffsetsModalBackdrop"/);
    assert.match(html, /id="resultadoAlertOffsetsForm"/);
    assert.match(html, /id="offsetPlanDaysInput"/);
    assert.match(html, /id="offsetCierreDaysInput"/);

    const uuidCheck = assertZeroUuidExposure(html);
    assert.equal(uuidCheck.compliant, true, `Exposed UUIDs: ${uuidCheck.exposedUuids.join(', ')}`);
  });

  it('renders Detail View via renderAuditSectionShell (◀ / ▶ only) with Bloque A and Bloque B', () => {
    const audit = buildSampleAudit();
    const finding = buildSampleFinding({ id_proceso: null });
    const customConfig: AlertConfigEntity = {
      ...DEFAULT_AUDIT_ALERT_CONFIG,
      dias_limite_plan_nc: 12,
      dias_limite_plan_accion: 12,
      dias_limite_cierre_nc: 45,
    };

    const html = renderResultadoView({
      profile: WORKER_PROFILE,
      state: {
        ...BASE_RESULTADO_STATE,
        selectedCertId: audit.id_certificado,
        selectedResultAuditId: audit.id,
      },
      audits: [audit],
      findings: [finding],
      processes: SAMPLE_PROCESSES,
      requirements: SAMPLE_REQUIREMENTS,
      alertConfig: customConfig,
    });

    assert.match(html, /data-testid="resultado-block-real-dates"/);
    assert.match(html, /data-testid="resultado-block-nc"/);
    assert.match(html, /id="resultadoAddRealDateForm"/);
    assert.match(html, /id="resultadoNewRealDate"/);
    assert.match(html, /data-action="archive-resultado-real-date"/);
    assert.match(html, /id="resultadoNewNcForm"/);
    assert.match(html, /id="ncReqSelect"/);
    assert.match(html, /8\.5\.1 - Control de la producción/);
    assert.doesNotMatch(html, /6\.1\.2 - Aspectos ambientales/);
    assert.match(html, /data-testid="resultado-nc-card"/);
    assert.match(html, /data-action="save-nc-dates-form"/);
    assert.match(html, /data-nc-field="plan"/);
    assert.match(html, /data-nc-field="cierre"/);
    assert.match(html, /\+12d/);
    assert.match(html, /\+45d/);
    assert.match(html, /data-testid="audit-section-shell"/);
    assert.match(html, /data-action="step-section-audit"/);
    assert.doesNotMatch(html, /data-linked-siblings-bar/);

    const uuidCheck = assertZeroUuidExposure(html);
    assert.equal(uuidCheck.compliant, true, `Exposed UUIDs: ${uuidCheck.exposedUuids.join(', ')}`);
  });

  it('enforces RBAC across assigned AUDITOR, unassigned AUDITOR, and CLIENT roles', () => {
    const assignedAudit = buildSampleAudit({ id: AUDIT_ID_1 });
    const otherAudit = buildSampleAudit({
      id: AUDIT_ID_2,
      id_certificado: '40000000-0000-4000-8000-000000000222',
      numero_certificado: 'FN-QMS-2026-222',
      codigo_auditoria: 'AUD-2026-102',
      auditor_lider_id: UNASSIGNED_AUDITOR_ID,
      equipo: [],
      sitiosPlan: [],
    });
    const finding = buildSampleFinding({ id_auditoria: AUDIT_ID_1 });

    // Assigned AUDITOR: can add real dates & NCs in detail view, CANNOT open Plazos NC popup or archive NCs
    const assignedAuditorHtml = renderResultadoView({
      profile: ASSIGNED_AUDITOR_PROFILE,
      state: {
        ...BASE_RESULTADO_STATE,
        selectedCertId: assignedAudit.id_certificado,
        selectedResultAuditId: assignedAudit.id,
      },
      audits: [assignedAudit],
      findings: [finding],
      processes: SAMPLE_PROCESSES,
      requirements: SAMPLE_REQUIREMENTS,
    });
    assert.match(assignedAuditorHtml, /id="resultadoAddRealDateForm"/);
    assert.match(assignedAuditorHtml, /id="resultadoNewNcForm"/);
    assert.doesNotMatch(assignedAuditorHtml, /id="openNcOffsetsModalBtn"/);
    assert.doesNotMatch(assignedAuditorHtml, /data-action="archive-finding"/);

    // Unassigned AUDITOR: read-only in detail view
    const unassignedAuditorHtml = renderResultadoView({
      profile: UNASSIGNED_AUDITOR_PROFILE,
      state: {
        ...BASE_RESULTADO_STATE,
        selectedCertId: assignedAudit.id_certificado,
        selectedResultAuditId: assignedAudit.id,
      },
      audits: [assignedAudit],
      findings: [finding],
      processes: SAMPLE_PROCESSES,
      requirements: SAMPLE_REQUIREMENTS,
    });
    assert.doesNotMatch(unassignedAuditorHtml, /id="resultadoAddRealDateForm"/);
    assert.doesNotMatch(unassignedAuditorHtml, /id="resultadoNewNcForm"/);

    // CLIENT: strictly read-only
    const clientHtml = renderResultadoView({
      profile: CLIENT_PROFILE,
      state: {
        ...BASE_RESULTADO_STATE,
        selectedCertId: otherAudit.id_certificado,
        selectedResultAuditId: otherAudit.id,
      },
      audits: [assignedAudit, otherAudit],
      findings: [finding],
      processes: SAMPLE_PROCESSES,
      requirements: SAMPLE_REQUIREMENTS,
    });
    assert.doesNotMatch(clientHtml, /id="resultadoAddRealDateForm"/);
    assert.doesNotMatch(clientHtml, /id="resultadoNewNcForm"/);
    assert.doesNotMatch(clientHtml, /id="openNcOffsetsModalBtn"/);
    assert.doesNotMatch(clientHtml, /data-action="archive-finding"/);

    const uuidCheck = assertZeroUuidExposure(clientHtml);
    assert.equal(uuidCheck.compliant, true, `Exposed UUIDs: ${uuidCheck.exposedUuids.join(', ')}`);
  });
});

describe('Step 4.1 — Resultado Version Snapshot, ISO 4.3 Exclusions & Sin Alcance Metadata', () => {
  it('excludes ISO 4.3 non-applicable clauses from #ncReqSelect and surfaces vN, org abreviacion & Sin alcance cleanly', () => {
    const req83 = {
      id: 'f0000000-0000-4000-8000-000000000083',
      codigo: '8.3',
      norma: 'ISO 9001:2015',
      titulo: 'Diseño y desarrollo de los productos y servicios',
    };
    const reqs = [...SAMPLE_REQUIREMENTS, req83];

    // Pure domain filter check
    const unfiltered = filterRequirementsForAuditNorma(reqs, 'ISO 9001:2015');
    assert.equal(unfiltered.some((r) => r.id === req83.id), true);
    const filtered = filterRequirementsForAuditNorma(
      reqs,
      'ISO 9001:2015',
      new Set([req83.id])
    );
    assert.equal(filtered.some((r) => r.id === req83.id), false);
    assert.equal(filtered.some((r) => r.id === SAMPLE_REQUIREMENTS[0].id), true);

    const certV1Id = '70000000-0000-4000-8000-000000000001';
    const certV2Id = '70000000-0000-4000-8000-000000000002';
    const certNoScopeId = '40000000-0000-4000-8000-000000000999';

    const auditV1 = buildSampleAudit({
      id: AUDIT_ID_1,
      id_certificado: '40000000-0000-4000-8000-000000000001',
      id_certificado_version: certV1Id,
      version_numero: 1,
      organizacion_abreviacion: 'ACERO-S',
      numero_certificado: 'FN-QMS-2026-101',
    });
    const auditNoScope = buildSampleAudit({
      id: AUDIT_ID_2,
      id_certificado: certNoScopeId,
      numero_certificado: 'FN-QMS-2026-999',
      codigo_auditoria: 'AUD-2026-999',
      organizacion_abreviacion: 'SIN-ALC',
    });

    const certs: CertificadoDetailEntity[] = [
      {
        id: auditV1.id_certificado,
        numero_certificado: 'FN-QMS-2026-101',
        id_organizacion: auditV1.id_organizacion,
        organizacion_nombre: auditV1.organizacion_nombre,
        organizacion_abreviacion: 'ACERO-S',
        id_norma: '10000000-0000-4000-8000-000000000001',
        norma_codigo: 'ISO 9001:2015',
        estatus: 'Activo',
        sector_iaf: 17,
        alcance: 'Laminación y trefilado industrial.',
        alcanceDetalle: {
          id: 'a0000000-0000-4000-8000-000000000001',
          id_certificado: auditV1.id_certificado,
          alcance_es: 'Laminación y trefilado industrial.',
          alcance_en: 'Industrial rolling.',
          esCompartido: false,
          deleted_at: null,
        },
        versiones: [
          {
            id: certV1Id,
            id_certificado: auditV1.id_certificado,
            version_numero: 1,
            es_version_actual: false,
            fecha_emision_version: '2025-01-01',
            organizacion_abreviacion: 'ACERO-S',
            sitios: [],
            procesos: [],
            turnos: [],
            noAplicables: [
              {
                id: 'na-v1-83',
                id_certificado: auditV1.id_certificado,
                id_certificado_version: certV1Id,
                id_requisito: req83.id,
                requisito_codigo: '8.3',
                requisito_titulo: 'Diseño y desarrollo de los productos y servicios',
                justificacion: 'No diseña en versión v1.',
              },
            ],
            deleted_at: null,
          },
          {
            id: certV2Id,
            id_certificado: auditV1.id_certificado,
            version_numero: 2,
            es_version_actual: true,
            fecha_emision_version: '2026-01-01',
            organizacion_abreviacion: 'ACERO-S',
            sitios: [],
            procesos: [],
            turnos: [],
            noAplicables: [],
            deleted_at: null,
          },
        ],
        sitios: [],
      },
      {
        id: certNoScopeId,
        numero_certificado: 'FN-QMS-2026-999',
        id_organizacion: auditV1.id_organizacion,
        organizacion_nombre: 'Empresa Sin Alcance S.A.',
        organizacion_abreviacion: 'SIN-ALC',
        id_norma: '10000000-0000-4000-8000-000000000001',
        norma_codigo: 'ISO 9001:2015',
        estatus: 'Activo',
        sector_iaf: 17,
        alcance: '',
        alcanceDetalle: null,
        sitios: [],
      },
    ];

    const multiRows = buildCertificateResultadoRows({
      audits: [auditV1, auditNoScope],
      certificados: certs,
      findings: [],
    });
    assert.equal(multiRows.length, 2);
    const v1Row = multiRows.find((r) => r.certId === auditV1.id_certificado);
    const noScopeRow = multiRows.find((r) => r.certId === certNoScopeId);
    assert.equal(v1Row?.activeVersionNumero, 1);
    assert.equal(v1Row?.organizacion_abreviacion, 'ACERO-S');
    assert.equal(v1Row?.hasAlcance, true);
    assert.equal(noScopeRow?.hasAlcance, false);

    const multiHtml = renderResultadoView({
      profile: ADMIN_PROFILE,
      state: BASE_RESULTADO_STATE,
      audits: [auditV1, auditNoScope],
      certificados: certs,
      findings: [],
      processes: SAMPLE_PROCESSES,
      requirements: reqs,
    });
    assert.match(multiHtml, /ACERO-S/);
    assert.equal(extractTableColgroupPcts(multiHtml, 'resultado-main').reduce((a, b) => a + b, 0), 100);
    assert.equal(/<button\b/i.test(extractTbodyHtml(multiHtml, 'resultado-main')), false);
    assert.equal(assertZeroUuidExposure(multiHtml).compliant, true);

    const multiModalHtml = renderResultadoView({
      profile: ADMIN_PROFILE,
      state: { ...BASE_RESULTADO_STATE, pickerOrgId: auditV1.id_organizacion },
      audits: [auditV1, auditNoScope],
      certificados: certs,
      findings: [],
      processes: SAMPLE_PROCESSES,
      requirements: reqs,
    });
    assert.match(multiModalHtml, /ACERO-S/);
    assert.match(multiModalHtml, /Sin alcance/);
    assert.match(multiModalHtml, />v1</);
    assert.equal(assertZeroUuidExposure(multiModalHtml).compliant, true);

    const detailV1Html = renderResultadoView({
      profile: WORKER_PROFILE,
      state: {
        ...BASE_RESULTADO_STATE,
        selectedCertId: auditV1.id_certificado,
        selectedResultAuditId: auditV1.id,
      },
      audits: [auditV1],
      certificados: certs,
      findings: [],
      processes: SAMPLE_PROCESSES,
      requirements: reqs,
    });
    assert.match(detailV1Html, /data-testid="resultado-iso43-exclusions-note"/);
    assert.match(detailV1Html, /8\.5\.1 - Control de la producción/);
    assert.doesNotMatch(detailV1Html, /<option[^>]*>8\.3 - Diseño y desarrollo/);
    assert.match(detailV1Html, /ACERO-S/);
    assert.match(detailV1Html, /FN-QMS-2026-101 v1/);
    assert.equal(assertZeroUuidExposure(detailV1Html).compliant, true);
  });
});
