import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  addCalendarDaysIso,
  computeDefaultAuditClosingDate,
  computeFindingDeadlinesFromRealDate,
  evaluateRealExecutionCapacity,
  resolveAuditRealWindow,
  validateCloseAuditAction,
  validateFindingFollowUpDates,
  validateRealExecutionDateInput,
} from './resultadoDomain';
import { DEFAULT_AUDIT_ALERT_CONFIG, type AlertConfigEntity } from './auditAlertsEngine';
import { validateAndNormalizeAlertConfigInput } from './auditPlanningPersistence';
import {
  INITIAL_PHASE5_FINDINGS,
  INITIAL_PROGRAMACION_AUDITS,
  type Phase5FindingEntity,
  type ProgramacionAuditEntity,
  type ResultadoViewState,
} from './auditExecution';
import type { AuditoriaSitioTemporalEntity } from './designacionTemporalDomain';
import type { UserProfile } from './healthCheck';
import { assertZeroUuidExposure } from './zeroUuid';
import { renderResultadoView } from '../views/resultadoView';

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
  { id: 'f0000000-0000-4000-8000-000000000085', codigo: '8.5.1', norma: 'ISO 9001:2015' },
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
  const tbodyStart = html.indexOf('<tbody>', tableStart);
  const tbodyEnd = html.indexOf('</tbody>', tbodyStart);
  return html.slice(tbodyStart, tbodyEnd);
}

describe('Step 10.2 — Resultado UI Rendering, Table Integrity & RBAC Matrix', () => {
  it('renders main list view with 5-col table-fixed (100%), 0 <button> in <tbody>, REAL panel, live preview & closing gate', () => {
    const audit = buildSampleAudit({
      estado_ciclo: 'Cerrada',
      estatus: 'Cerrado',
      fecha_cierre_auditoria: '2026-11-21',
    });
    const finding = buildSampleFinding();

    const html = renderResultadoView({
      profile: ADMIN_PROFILE,
      state: {
        ...BASE_RESULTADO_STATE,
        isLoggingFinding: true,
        isEditingAlertOffsets: true,
        inspectingFindingId: finding.id,
      },
      audits: [audit],
      findings: [finding],
      processes: SAMPLE_PROCESSES,
      requirements: SAMPLE_REQUIREMENTS,
      alertConfig: DEFAULT_AUDIT_ALERT_CONFIG,
    });

    const pcts = extractTableColgroupPcts(html, 'resultado-main');
    assert.deepEqual(pcts, [15, 21, 33, 18, 13]);
    assert.equal(pcts.reduce((a, b) => a + b, 0), 100);

    const tbody = extractTbodyHtml(html, 'resultado-main');
    assert.equal(/<button\b/i.test(tbody), false, 'Zero <button> allowed inside <tbody>');

    // Panels & controls
    assert.match(html, /Días-Auditor: 6\.00d \| Ventana Real: 3 días calendario \(2 auditores\)/);
    assert.match(html, /id="resultadoRealDatesForm"/);
    assert.match(html, /id="resultadoAlertOffsetsForm"/);
    assert.match(html, /id="p5FindingDeadlinePreview"/);
    assert.match(html, /2026-10-22/);
    assert.match(html, /2026-11-21/);
    assert.match(html, /id="closeAuditResultForm"/);
    assert.match(html, /Ir a Paso 11: Revisión →/);
    assert.match(html, /id="modalFindingPlanDeliveryDate"/);
    assert.match(html, /id="modalFindingRealCloseDate"/);
    assert.match(html, /data-action="archive-finding"/);

    const uuidCheck = assertZeroUuidExposure(html);
    assert.equal(uuidCheck.compliant, true, `Exposed UUIDs: ${uuidCheck.exposedUuids.join(', ')}`);
  });

  it('renders Focused Audit Detail View with 6-col table (14+22+28+12+12+12=100%), 0 <button> in <tbody>, and Cerrar Auditoría button', () => {
    const audit = buildSampleAudit();
    const finding = buildSampleFinding();
    const customConfig: AlertConfigEntity = {
      ...DEFAULT_AUDIT_ALERT_CONFIG,
      dias_limite_plan_accion: 12,
      dias_limite_cierre_nc: 45,
    };

    const html = renderResultadoView({
      profile: WORKER_PROFILE,
      state: {
        ...BASE_RESULTADO_STATE,
        selectedResultAuditId: audit.id,
      },
      audits: [audit],
      findings: [finding],
      processes: SAMPLE_PROCESSES,
      requirements: SAMPLE_REQUIREMENTS,
      alertConfig: customConfig,
    });

    const pcts = extractTableColgroupPcts(html, 'resultado-audit-findings');
    assert.deepEqual(pcts, [14, 22, 28, 12, 12, 12]);
    assert.equal(pcts.reduce((a, b) => a + b, 0), 100);

    const tbody = extractTbodyHtml(html, 'resultado-audit-findings');
    assert.equal(/<button\b/i.test(tbody), false, 'Zero <button> allowed inside <tbody>');

    assert.match(html, /Días-Auditor: 6\.00d \| Ventana Real: 3 días calendario \(2 auditores\)/);
    assert.match(html, /\+12d plan \/ \+45d cierre/);
    assert.match(html, /Cerrar Auditoría \(Habilitar Revisión\)/);
    assert.match(html, /Ir a Paso 11: Revisión →/);

    const uuidCheck = assertZeroUuidExposure(html);
    assert.equal(uuidCheck.compliant, true, `Exposed UUIDs: ${uuidCheck.exposedUuids.join(', ')}`);
  });

  it('enforces RBAC across AUDITOR (assigned vs unassigned) and CLIENT roles', () => {
    const assignedAudit = buildSampleAudit({ id: AUDIT_ID_1 });
    const otherAudit = buildSampleAudit({
      id: AUDIT_ID_2,
      codigo_auditoria: 'AUD-2026-102',
      auditor_lider_id: UNASSIGNED_AUDITOR_ID,
      equipo: [],
      sitiosPlan: [],
    });
    const finding = buildSampleFinding({ id_auditoria: AUDIT_ID_1 });

    // Assigned AUDITOR: can log/edit findings on assigned audit, CANNOT edit REAL dates, offsets, archive, or close audit
    const assignedAuditorHtml = renderResultadoView({
      profile: ASSIGNED_AUDITOR_PROFILE,
      state: {
        ...BASE_RESULTADO_STATE,
        activeAuditIdForDecision: assignedAudit.id,
        inspectingFindingId: finding.id,
      },
      audits: [assignedAudit],
      findings: [finding],
      processes: SAMPLE_PROCESSES,
      requirements: SAMPLE_REQUIREMENTS,
    });
    assert.match(assignedAuditorHtml, /id="openNewFindingFormBtn"/);
    assert.doesNotMatch(assignedAuditorHtml, /id="saveRealDatesBtn"/);
    assert.doesNotMatch(assignedAuditorHtml, /data-action="toggle-alert-offsets-edit"/);
    assert.doesNotMatch(assignedAuditorHtml, /id="closeAuditResultBtn"/);
    assert.doesNotMatch(assignedAuditorHtml, /data-action="archive-finding"/);
    assert.match(assignedAuditorHtml, /Solo ADMIN \/ WORKER pueden cerrar formalmente la auditoría\./);

    // Unassigned AUDITOR: cannot log findings on unassigned audit
    const unassignedAuditorHtml = renderResultadoView({
      profile: UNASSIGNED_AUDITOR_PROFILE,
      state: {
        ...BASE_RESULTADO_STATE,
        activeAuditIdForDecision: assignedAudit.id,
      },
      audits: [assignedAudit],
      findings: [finding],
      processes: SAMPLE_PROCESSES,
      requirements: SAMPLE_REQUIREMENTS,
    });
    assert.doesNotMatch(unassignedAuditorHtml, /id="openNewFindingFormBtn"/);
    assert.doesNotMatch(unassignedAuditorHtml, /id="signRecommendationForm"/);

    // CLIENT: strictly read-only across findings, REAL dates, offsets, archive, and audit closing
    const clientHtml = renderResultadoView({
      profile: CLIENT_PROFILE,
      state: {
        ...BASE_RESULTADO_STATE,
        activeAuditIdForDecision: otherAudit.id,
        inspectingFindingId: finding.id,
      },
      audits: [assignedAudit, otherAudit],
      findings: [finding],
      processes: SAMPLE_PROCESSES,
      requirements: SAMPLE_REQUIREMENTS,
    });
    assert.doesNotMatch(clientHtml, /id="openNewFindingFormBtn"/);
    assert.doesNotMatch(clientHtml, /id="saveRealDatesBtn"/);
    assert.doesNotMatch(clientHtml, /data-action="toggle-alert-offsets-edit"/);
    assert.doesNotMatch(clientHtml, /id="closeAuditResultBtn"/);
    assert.doesNotMatch(clientHtml, /data-action="archive-finding"/);
    assert.doesNotMatch(clientHtml, /id="signRecommendationForm"/);

    const uuidCheck = assertZeroUuidExposure(clientHtml);
    assert.equal(uuidCheck.compliant, true, `Exposed UUIDs: ${uuidCheck.exposedUuids.join(', ')}`);
  });
});
