import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCertificateAuditHistoryDigest,
  computeAuditAlerts,
  computeAuditCalendarSpanDays,
  computeAuditDayBalance,
  computeAuditPlanningStatus,
  computeProgramPlanningStatus,
  computeSiteDayBalance,
  DEFAULT_AUDIT_ALERT_CONFIG,
  detectAuditorScheduleConflicts,
  evaluateSitePlanningCompleteness,
  findUnprogrammedCertificatesByStatus,
  formatAuditDateLabel,
  getNextAuditDateSequence,
  resolveEffectiveAuditorsForProcess,
  resolveLatestAuditDate,
  roundAuditDaysQuarter,
  validateAuditDateEntryInput,
  validateAuditorCapacityAgainstSpan,
  validateProgramLinkingRules,
  type AlertConfigEntity,
  type AuditDateEntry,
  type AuditoriaSitioPlanItem,
  type ConsolidatedAuditorDayTotal,
  type ProgramaAuditoriaEntity,
  type ProgramLinkingCertificateRef,
  type UnprogrammedCertificateCandidate,
} from './auditPlanningEngine';
import type { ProgramacionAuditEntity } from './auditExecution';
import { assertZeroUuidExposure } from './zeroUuid';

function createMockAudit(
  overrides: Partial<ProgramacionAuditEntity> = {}
): ProgramacionAuditEntity {
  return {
    id: '80000000-0000-4000-8000-000000000101',
    id_programa_auditoria: '70000000-0000-4000-8000-000000000101',
    codigo_auditoria: 'AUD-2026-001',
    id_certificado: '40000000-0000-4000-8000-000000000101',
    numero_certificado: 'FN-QMS-2026-001',
    id_organizacion: '30000000-0000-4000-8000-000000000101',
    organizacion_nombre: 'Industrias Ejemplo C.A.',
    norma_codigo: 'ISO 9001:2015',
    sector_iaf: 17,
    tipo_auditoria: 'Seguimiento 1',
    metodologia: 'Presencial',
    fecha_inicio: '2026-06-10',
    fecha_fin: '2026-06-12',
    fecha_reprogramacion: null,
    fechas: [
      {
        id: '81000000-0000-4000-8000-000000000101',
        id_auditoria: '80000000-0000-4000-8000-000000000101',
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'REAL',
        anio: null,
        mes: null,
        fecha_inicio: '2026-06-10',
        fecha_fin: '2026-06-12',
        observacion: 'Programación inicial confirmada.',
      },
    ],
    dias_auditor: 3,
    tiempo_auditoria: 3,
    estatus: 'Planificado',
    estado_ciclo: 'Programada',
    objetivo: 'Seguimiento anual de calidad.',
    auditor_lider_id: '10000000-0000-4000-8000-000000000101',
    auditor_lider: 'Ing. Carlos Mendoza',
    sede_principal_direccion: 'Av. Industrial 100',
    equipo: [],
    sitiosMuestreo: [],
    sitiosPlan: [],
    matrizNormativa: [],
    ...overrides,
  };
}

function createBalancedSite(
  overrides: Partial<AuditoriaSitioPlanItem> = {}
): AuditoriaSitioPlanItem {
  return {
    id: '90000000-0000-4000-8000-000000000001',
    id_auditoria: '80000000-0000-4000-8000-000000000101',
    id_sitio: '50000000-0000-4000-8000-000000000001',
    numero_sitio: 0,
    nombre_sitio: 'Planta Santa Cruz (HQ)',
    tiempo_auditoria: 3.0,
    modalidad_evaluacion: 'Presencial',
    procesos: [
      {
        id: '91000000-0000-4000-8000-000000000001',
        id_sitios_por_auditoria: '90000000-0000-4000-8000-000000000001',
        id_procesos_por_sitio: '61000000-0000-4000-8000-000000000001',
        id_proceso: '60000000-0000-4000-8000-000000000001',
        proceso_nombre: 'Dirección Estratégica',
        turnos: [
          {
            id: '92000000-0000-4000-8000-000000000001',
            id_procesos_sitio_auditoria: '91000000-0000-4000-8000-000000000001',
            id_turnos_sitio_auditoria: '93000000-0000-4000-8000-000000000001',
            descripcion_turno: 'Turno Diurno',
          },
        ],
        equipoProceso: [],
      },
    ],
    equipoSitio: [
      {
        id: '94000000-0000-4000-8000-000000000001',
        id_sitios_por_auditoria: '90000000-0000-4000-8000-000000000001',
        id_auditor: '10000000-0000-4000-8000-000000000101',
        auditor_nombre: 'Ing. Carlos Mendoza',
        rol_auditor: 'AUDITOR_LIDER',
        tiempo_auditoria: 1.5,
        asignacion_completa_sitio: true,
      },
      {
        id: '94000000-0000-4000-8000-000000000002',
        id_sitios_por_auditoria: '90000000-0000-4000-8000-000000000001',
        id_auditor: '10000000-0000-4000-8000-000000000102',
        auditor_nombre: 'Ing. Roberto Silva',
        rol_auditor: 'AUDITOR',
        tiempo_auditoria: 1.5,
        asignacion_completa_sitio: false,
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Vinculación en 2 Niveles (`validateProgramLinkingRules`)
// ---------------------------------------------------------------------------

test('validateProgramLinkingRules - enforces INDIVIDUAL, NIVEL_1_INTRA_ORG, and NIVEL_2_INTER_ORG rules', () => {
  const orgACert1: ProgramLinkingCertificateRef = {
    id: '40000000-0000-4000-8000-000000000001',
    id_organizacion: '30000000-0000-4000-8000-000000000001',
    numero_certificado: 'FN-QMS-001',
  };
  const orgACert2: ProgramLinkingCertificateRef = {
    id: '40000000-0000-4000-8000-000000000002',
    id_organizacion: '30000000-0000-4000-8000-000000000001',
    numero_certificado: 'FN-EMS-001',
  };
  const orgBCert1: ProgramLinkingCertificateRef = {
    id: '40000000-0000-4000-8000-000000000003',
    id_organizacion: '30000000-0000-4000-8000-000000000002',
    numero_certificado: 'FN-OHS-002',
  };

  // INDIVIDUAL valid
  const indOk = validateProgramLinkingRules('INDIVIDUAL', 'Individual', [orgACert1]);
  assert.equal(indOk.valid, true);
  assert.equal(indOk.es_vinculada, false);
  assert.equal(indOk.certificateCount, 1);

  // INDIVIDUAL rejects 2 certs
  const indTwoCerts = validateProgramLinkingRules('INDIVIDUAL', 'Individual', [
    orgACert1,
    orgACert2,
  ]);
  assert.equal(indTwoCerts.valid, false);
  assert.match(indTwoCerts.error || '', /exactamente 1 certificado/);

  // INDIVIDUAL rejects non-Individual nature
  const indWrongNature = validateProgramLinkingRules('INDIVIDUAL', 'Combinada', [orgACert1]);
  assert.equal(indWrongNature.valid, false);

  // NIVEL_1_INTRA_ORG rejects Individual nature
  const n1WrongNature = validateProgramLinkingRules('NIVEL_1_INTRA_ORG', 'Individual', [
    orgACert1,
    orgACert2,
  ]);
  assert.equal(n1WrongNature.valid, false);

  // NIVEL_1_INTRA_ORG accepts 2 certs from same org
  const n1SameOrg = validateProgramLinkingRules('NIVEL_1_INTRA_ORG', 'Integrada', [
    orgACert1,
    orgACert2,
  ]);
  assert.equal(n1SameOrg.valid, true);
  assert.equal(n1SameOrg.es_vinculada, true);
  assert.equal(n1SameOrg.distinctOrganizationsCount, 1);

  // NIVEL_1_INTRA_ORG rejects 2 certs from different orgs
  const n1CrossOrg = validateProgramLinkingRules('NIVEL_1_INTRA_ORG', 'Combinada', [
    orgACert1,
    orgBCert1,
  ]);
  assert.equal(n1CrossOrg.valid, false);
  assert.match(n1CrossOrg.error || '', /misma organización/);

  // NIVEL_1_INTRA_ORG progressive draft allows 1 cert with warning, but closing requires >= 2
  const n1DraftOne = validateProgramLinkingRules('NIVEL_1_INTRA_ORG', 'Combinada', [orgACert1]);
  assert.equal(n1DraftOne.valid, true);
  assert.equal(n1DraftOne.warnings.length, 1);
  const n1CloseOne = validateProgramLinkingRules('NIVEL_1_INTRA_ORG', 'Combinada', [orgACert1], {
    isClosing: true,
  });
  assert.equal(n1CloseOne.valid, false);

  // NIVEL_2_INTER_ORG accepts 2+ distinct orgs
  const n2CrossOrg = validateProgramLinkingRules('NIVEL_2_INTER_ORG', 'Multientidad', [
    orgACert1,
    orgBCert1,
  ]);
  assert.equal(n2CrossOrg.valid, true);
  assert.equal(n2CrossOrg.es_vinculada, true);
  assert.equal(n2CrossOrg.distinctOrganizationsCount, 2);

  // Duplicate certificate rejected
  const dupCert = validateProgramLinkingRules('NIVEL_1_INTRA_ORG', 'Combinada', [
    orgACert1,
    orgACert1,
  ]);
  assert.equal(dupCert.valid, false);
  assert.match(dupCert.error || '', /duplicar/);
});

// ---------------------------------------------------------------------------
// 2. Motor Multi-Fecha 1:N (`AuditDateEntry`)
// ---------------------------------------------------------------------------

test('Multi-Date 1:N Engine - resolves MAX(numero_secuencia), next sequence, validation, and Zero-UUID labels', () => {
  const fechas: AuditDateEntry[] = [
    {
      id: '81000000-0000-4000-8000-000000000001',
      id_auditoria: '80000000-0000-4000-8000-000000000001',
      numero_secuencia: 1,
      tag: 'Programación',
      tipo_fecha: 'PREPROGRAMADA_MES',
      anio: 2026,
      mes: 9,
      fecha_inicio: null,
      fecha_fin: null,
    },
    {
      id: '81000000-0000-4000-8000-000000000003',
      id_auditoria: '80000000-0000-4000-8000-000000000001',
      numero_secuencia: 3,
      tag: 'Reprogramación',
      tipo_fecha: 'REAL',
      anio: null,
      mes: null,
      fecha_inicio: '2026-06-15',
      fecha_fin: '2026-06-17',
      deleted_at: '2026-05-01T10:00:00Z', // soft-deleted, must be ignored
    },
    {
      id: '81000000-0000-4000-8000-000000000002',
      id_auditoria: '80000000-0000-4000-8000-000000000001',
      numero_secuencia: 2,
      tag: 'Reprogramación',
      tipo_fecha: 'REAL',
      anio: null,
      mes: null,
      fecha_inicio: '2026-06-10',
      fecha_fin: '2026-06-12',
    },
  ];

  const latest = resolveLatestAuditDate(fechas);
  assert.ok(latest);
  assert.equal(latest.numero_secuencia, 2);
  assert.equal(latest.fecha_inicio, '2026-06-10');
  assert.equal(getNextAuditDateSequence(fechas), 3);
  assert.equal(getNextAuditDateSequence([]), 1);

  const labelReal = formatAuditDateLabel(latest);
  assert.equal(labelReal, '10/06/2026 – 12/06/2026 (Reprog. #2)');
  assert.equal(assertZeroUuidExposure(labelReal).compliant, true);

  const labelPreprog = formatAuditDateLabel(fechas[0]);
  assert.equal(labelPreprog, 'Sep 2026 · Preprogramada (#1)');
  assert.equal(assertZeroUuidExposure(labelPreprog).compliant, true);

  assert.equal(formatAuditDateLabel(null), 'Sin fecha programada');

  // Input validations
  assert.equal(
    validateAuditDateEntryInput({
      tipo_fecha: 'PREPROGRAMADA_MES',
      anio: 2026,
      mes: 12,
    }).valid,
    true
  );
  assert.equal(
    validateAuditDateEntryInput({
      tipo_fecha: 'PREPROGRAMADA_MES',
      anio: 1999,
      mes: 5,
    }).valid,
    false
  );
  assert.equal(
    validateAuditDateEntryInput({
      tipo_fecha: 'PREPROGRAMADA_MES',
      anio: 2026,
      mes: 13,
    }).valid,
    false
  );
  assert.equal(
    validateAuditDateEntryInput({
      tipo_fecha: 'REAL',
      fecha_inicio: '2026-06-12',
      fecha_fin: '2026-06-10',
    }).valid,
    false
  );
  assert.equal(
    validateAuditDateEntryInput({
      tipo_fecha: 'REAL',
      fecha_inicio: '2026-06-10',
      fecha_fin: '2026-06-12',
    }).valid,
    true
  );
});

// ---------------------------------------------------------------------------
// 3. Redondeo 0.25d, Balance Dual-Bucket, Completitud Híbrida y Etiquetas
// ---------------------------------------------------------------------------

test('roundAuditDaysQuarter and Dual-Bucket Balance (Cubo 1 vs Cubo 2)', () => {
  assert.equal(roundAuditDaysQuarter(-2), 0);
  assert.equal(roundAuditDaysQuarter(0), 0);
  assert.equal(roundAuditDaysQuarter(1.13), 1.25);
  assert.equal(roundAuditDaysQuarter(2.37), 2.25);
  assert.equal(roundAuditDaysQuarter(2.38), 2.5);
  assert.equal(roundAuditDaysQuarter(Number.NaN), 0);

  const siteA = createBalancedSite({ tiempo_auditoria: 3.0 });
  const siteBalance = computeSiteDayBalance(siteA);
  assert.equal(siteBalance.demandedDays, 3);
  assert.equal(siteBalance.assignedDays, 3);
  assert.equal(siteBalance.delta, 0);
  assert.equal(siteBalance.isBalanced, true);

  const siteB = createBalancedSite({
    id: '90000000-0000-4000-8000-000000000002',
    id_sitio: '50000000-0000-4000-8000-000000000002',
    numero_sitio: 1,
    nombre_sitio: 'Planta Valencia',
    tiempo_auditoria: 2.5,
    equipoSitio: [
      {
        id: '94000000-0000-4000-8000-000000000003',
        id_sitios_por_auditoria: '90000000-0000-4000-8000-000000000002',
        id_auditor: '10000000-0000-4000-8000-000000000101',
        auditor_nombre: 'Ing. Carlos Mendoza',
        rol_auditor: 'AUDITOR_LIDER',
        tiempo_auditoria: 2.0,
        asignacion_completa_sitio: true,
      },
    ],
  });

  const auditBalance = computeAuditDayBalance([siteA, siteB], 5.5);
  assert.equal(auditBalance.totalSiteDemandedDays, 5.5);
  assert.equal(auditBalance.totalAuditorAssignedDays, 5.0);
  assert.equal(auditBalance.bucketDelta, -0.5);
  assert.equal(auditBalance.plannedVsSiteDelta, 0);
  assert.equal(auditBalance.isBalanced, false);

  const carlosTotal = auditBalance.auditorTotals.find(
    (a) => a.id_auditor === '10000000-0000-4000-8000-000000000101'
  );
  assert.ok(carlosTotal);
  assert.equal(carlosTotal.totalDays, 3.5);
  assert.equal(carlosTotal.sitesCount, 2);
});

test('Hybrid Process Auditors (Site-Wide + Granular M:N) and Site Completeness', () => {
  const site = createBalancedSite({
    procesos: [
      {
        id: '91000000-0000-4000-8000-000000000001',
        id_sitios_por_auditoria: '90000000-0000-4000-8000-000000000001',
        id_procesos_por_sitio: '61000000-0000-4000-8000-000000000001',
        id_proceso: '60000000-0000-4000-8000-000000000001',
        proceso_nombre: 'Producción',
        turnos: [
          {
            id: '92000000-0000-4000-8000-000000000001',
            id_procesos_sitio_auditoria: '91000000-0000-4000-8000-000000000001',
            id_turnos_sitio_auditoria: '93000000-0000-4000-8000-000000000001',
            descripcion_turno: 'Turno 1',
          },
        ],
        equipoProceso: [
          {
            id: '95000000-0000-4000-8000-000000000001',
            id_procesos_sitio_auditoria: '91000000-0000-4000-8000-000000000001',
            id_auditor: '10000000-0000-4000-8000-000000000102',
            auditor_nombre: 'Ing. Roberto Silva',
            rol_en_proceso: 'EVALUADOR',
          },
        ],
      },
      {
        id: '91000000-0000-4000-8000-000000000002',
        id_sitios_por_auditoria: '90000000-0000-4000-8000-000000000001',
        id_procesos_por_sitio: '61000000-0000-4000-8000-000000000002',
        id_proceso: '60000000-0000-4000-8000-000000000002',
        proceso_nombre: 'Mantenimiento',
        turnos: [], // missing turno
        equipoProceso: [],
      },
    ],
  });

  const effectiveProd = resolveEffectiveAuditorsForProcess(site, site.procesos[0]);
  assert.equal(effectiveProd.length, 2);
  assert.ok(effectiveProd.some((a) => a.source === 'SITIO_COMPLETO'));
  assert.ok(effectiveProd.some((a) => a.source === 'PROCESO_GRANULAR'));

  const completeness = evaluateSitePlanningCompleteness(site);
  assert.equal(completeness.isComplete, false);
  assert.equal(completeness.processesMissingTurnos, 1);
  assert.equal(completeness.processesMissingAuditors, 0); // covered by site-wide auditor
  assert.equal(assertZeroUuidExposure(completeness.missingReasons.join(' ')).compliant, true);
});

test('computeAuditPlanningStatus & computeProgramPlanningStatus - dynamic tags, overdue, and draft tolerance', () => {
  // 1. Ready to execute (Lista para Ejecutar)
  const readyAudit = createMockAudit({
    sitiosPlan: [createBalancedSite()],
    tiempo_auditoria: 3,
  });
  const readyStatus = computeAuditPlanningStatus(readyAudit, '2026-06-01');
  assert.equal(readyStatus.primaryTag, 'Lista para Ejecutar');
  assert.equal(readyStatus.completionPercent, 100);
  assert.equal(readyStatus.isOverdue, false);
  assert.equal(readyStatus.pendingReasons.length, 0);

  // 2. Overdue (Atrasada) when todayIso > fecha_fin
  const overdueStatus = computeAuditPlanningStatus(readyAudit, '2026-06-20');
  assert.equal(overdueStatus.primaryTag, 'Atrasada');
  assert.equal(overdueStatus.isOverdue, true);

  // 3. Preprogramada por mes
  const preprogAudit = createMockAudit({
    id: '80000000-0000-4000-8000-000000000102',
    codigo_auditoria: 'AUD-2026-002',
    numero_certificado: 'FN-EMS-2026-002',
    fechas: [
      {
        id: '81000000-0000-4000-8000-000000000102',
        id_auditoria: '80000000-0000-4000-8000-000000000102',
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'PREPROGRAMADA_MES',
        anio: 2026,
        mes: 10,
        fecha_inicio: null,
        fecha_fin: null,
      },
    ],
    sitiosPlan: [createBalancedSite()],
    tiempo_auditoria: 3,
  });
  const preprogStatus = computeAuditPlanningStatus(preprogAudit, '2026-06-01');
  assert.equal(preprogStatus.primaryTag, 'Preprogramada');
  assert.equal(preprogStatus.isOverdue, false);

  // 4. Draft without dates or sites
  const draftAudit = createMockAudit({
    fechas: [],
    latestDate: null,
    sitiosPlan: [],
    estado_ciclo: 'Borrador',
  });
  const draftStatus = computeAuditPlanningStatus(draftAudit, '2026-06-01');
  assert.equal(draftStatus.primaryTag, 'Borrador');

  // 5. Consolidated program status (Zero-UUID check on pending reasons)
  const program: ProgramaAuditoriaEntity = {
    id: '70000000-0000-4000-8000-000000000101',
    codigo_programa: 'PRG-2026-001',
    etiqueta: 'Planta Santa Cruz — SGC + SGA',
    nivel_vinculacion: 'NIVEL_1_INTRA_ORG',
    tipo_vinculacion: 'Integrada',
    es_vinculada: true,
    auditorias: [readyAudit, preprogAudit],
  };

  const programStatus = computeProgramPlanningStatus(program, '2026-06-01');
  assert.equal(programStatus.activeAuditsCount, 2);
  assert.equal(programStatus.totalSiteDemandedDays, 6);
  assert.equal(programStatus.totalAuditorAssignedDays, 6);
  assert.equal(programStatus.isBalanced, true);
  assert.equal(programStatus.primaryTag, 'Preprogramada');
  assert.equal(assertZeroUuidExposure(programStatus.pendingReasons.join(' ')).compliant, true);
});

// ---------------------------------------------------------------------------
// 4. Step 2.1.3 (Parte B): Span Calendario, Conflictos, Sin Programar, Alertas e Historial
// ---------------------------------------------------------------------------

test('Step 2.1.3 - computeAuditCalendarSpanDays & validateAuditorCapacityAgainstSpan (6.00d/2 auditors in 3d valid vs 4.00d/1 auditor warning)', () => {
  const realDate: AuditDateEntry = {
    id: '81000000-0000-4000-8000-000000000201',
    id_auditoria: '80000000-0000-4000-8000-000000000201',
    numero_secuencia: 1,
    tag: 'Programación',
    tipo_fecha: 'REAL',
    anio: null,
    mes: null,
    fecha_inicio: '2026-07-06',
    fecha_fin: '2026-07-08',
  };
  const preprogDate: AuditDateEntry = {
    id: '81000000-0000-4000-8000-000000000202',
    id_auditoria: '80000000-0000-4000-8000-000000000201',
    numero_secuencia: 1,
    tag: 'Programación',
    tipo_fecha: 'PREPROGRAMADA_MES',
    anio: 2026,
    mes: 7,
    fecha_inicio: null,
    fecha_fin: null,
  };

  const span = computeAuditCalendarSpanDays(realDate);
  assert.equal(span, 3);
  assert.equal(computeAuditCalendarSpanDays(preprogDate), null);
  assert.equal(computeAuditCalendarSpanDays(null), null);

  // Valid: 6.00d split across 2 auditors (3.00d each) in 3 calendar days
  const balancedAuditors: ConsolidatedAuditorDayTotal[] = [
    {
      id_auditor: '10000000-0000-4000-8000-000000000101',
      auditor_nombre: 'Ing. Carlos Mendoza',
      rol_auditor: 'AUDITOR_LIDER',
      totalDays: 3.0,
      sitesCount: 2,
    },
    {
      id_auditor: '10000000-0000-4000-8000-000000000102',
      auditor_nombre: 'Ing. Roberto Silva',
      rol_auditor: 'AUDITOR',
      totalDays: 3.0,
      sitesCount: 2,
    },
  ];
  const okCheck = validateAuditorCapacityAgainstSpan(balancedAuditors, span);
  assert.equal(okCheck.hasWarnings, false);
  assert.equal(okCheck.overloadedAuditors.length, 0);

  // Overloaded: 4.00d on 1 auditor in 3 calendar days
  const overloadedAuditors: ConsolidatedAuditorDayTotal[] = [
    {
      id_auditor: '10000000-0000-4000-8000-000000000101',
      auditor_nombre: 'Ing. Carlos Mendoza',
      rol_auditor: 'AUDITOR_LIDER',
      totalDays: 4.0,
      sitesCount: 2,
    },
  ];
  const warnCheck = validateAuditorCapacityAgainstSpan(overloadedAuditors, span);
  assert.equal(warnCheck.hasWarnings, true);
  assert.equal(warnCheck.overloadedAuditors.length, 1);
  assert.equal(warnCheck.overloadedAuditors[0].excessDays, 1);
  assert.equal(assertZeroUuidExposure(warnCheck.warnings.join(' ')).compliant, true);
});

test('Step 2.1.3 - detectAuditorScheduleConflicts detects cross-program overlaps without false positives inside same campaign', () => {
  const sharedLeadId = '10000000-0000-4000-8000-000000000101';

  // Program A has 2 linked audits on the exact same dates with the same lead -> NO conflict within same program
  const programA: ProgramaAuditoriaEntity = {
    id: '70000000-0000-4000-8000-000000000301',
    codigo_programa: 'PRG-2026-A',
    etiqueta: 'Campaña Planta Santa Cruz',
    nivel_vinculacion: 'NIVEL_1_INTRA_ORG',
    tipo_vinculacion: 'Integrada',
    es_vinculada: true,
    auditorias: [
      createMockAudit({
        id: '80000000-0000-4000-8000-000000000301',
        id_programa_auditoria: '70000000-0000-4000-8000-000000000301',
        auditor_lider_id: sharedLeadId,
        auditor_lider: 'Ing. Carlos Mendoza',
      }),
      createMockAudit({
        id: '80000000-0000-4000-8000-000000000302',
        id_programa_auditoria: '70000000-0000-4000-8000-000000000301',
        id_certificado: '40000000-0000-4000-8000-000000000102',
        auditor_lider_id: sharedLeadId,
        auditor_lider: 'Ing. Carlos Mendoza',
      }),
    ],
  };

  assert.equal(detectAuditorScheduleConflicts([programA]).length, 0);

  // Program B overlaps on 2026-06-11..2026-06-13 with the same auditor
  const programB: ProgramaAuditoriaEntity = {
    id: '70000000-0000-4000-8000-000000000302',
    codigo_programa: 'PRG-2026-B',
    etiqueta: 'Campaña Planta Valencia',
    nivel_vinculacion: 'INDIVIDUAL',
    tipo_vinculacion: 'Individual',
    es_vinculada: false,
    auditorias: [
      createMockAudit({
        id: '80000000-0000-4000-8000-000000000303',
        id_programa_auditoria: '70000000-0000-4000-8000-000000000302',
        auditor_lider_id: sharedLeadId,
        auditor_lider: 'Ing. Carlos Mendoza',
        fechas: [
          {
            id: '81000000-0000-4000-8000-000000000303',
            id_auditoria: '80000000-0000-4000-8000-000000000303',
            numero_secuencia: 1,
            tag: 'Programación',
            tipo_fecha: 'REAL',
            anio: null,
            mes: null,
            fecha_inicio: '2026-06-11',
            fecha_fin: '2026-06-13',
          },
        ],
      }),
    ],
  };

  const conflicts = detectAuditorScheduleConflicts([programA, programB]);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].overlap_start, '2026-06-11');
  assert.equal(conflicts[0].overlap_end, '2026-06-12');
  assert.equal(conflicts[0].overlap_days, 2);
  assert.equal(assertZeroUuidExposure(conflicts[0].message).compliant, true);
});

test('Step 2.1.3 - findUnprogrammedCertificatesByStatus filters by estatus and returns instant counts', () => {
  const certs: UnprogrammedCertificateCandidate[] = [
    {
      id: '40000000-0000-4000-8000-000000000401',
      numero_certificado: 'FN-QMS-401',
      id_organizacion: '30000000-0000-4000-8000-000000000401',
      organizacion_nombre: 'Org Activa Programada',
      id_norma: 'e0000000-0000-4000-8000-000000009001',
      norma_codigo: 'ISO 9001:2015',
      id_estatus: 'est-activo',
      estatus: 'Activo',
    },
    {
      id: '40000000-0000-4000-8000-000000000402',
      numero_certificado: 'FN-QMS-402',
      id_organizacion: '30000000-0000-4000-8000-000000000402',
      organizacion_nombre: 'Org Activa Sin Programar',
      id_norma: 'e0000000-0000-4000-8000-000000009001',
      norma_codigo: 'ISO 9001:2015',
      id_estatus: 'est-activo',
      estatus: 'Activo',
    },
    {
      id: '40000000-0000-4000-8000-000000000403',
      numero_certificado: 'FN-EMS-403',
      id_organizacion: '30000000-0000-4000-8000-000000000402',
      organizacion_nombre: 'Org en Estudio',
      id_norma: 'e0000000-0000-4000-8000-000000014001',
      norma_codigo: 'ISO 14001:2015',
      id_estatus: 'est-estudio',
      estatus: 'Estudio',
    },
    {
      id: '40000000-0000-4000-8000-000000000404',
      numero_certificado: 'FN-OHS-404',
      id_organizacion: '30000000-0000-4000-8000-000000000403',
      organizacion_nombre: 'Org Suspendida',
      id_norma: 'e0000000-0000-4000-8000-000000045001',
      norma_codigo: 'ISO 45001:2018',
      id_estatus: 'est-suspendido',
      estatus: 'Suspendido',
    },
  ];

  const programs: ProgramaAuditoriaEntity[] = [
    {
      id: '70000000-0000-4000-8000-000000000401',
      codigo_programa: 'PRG-401',
      etiqueta: 'Programa Activo 401',
      nivel_vinculacion: 'INDIVIDUAL',
      tipo_vinculacion: 'Individual',
      es_vinculada: false,
      auditorias: [
        createMockAudit({
          id_certificado: '40000000-0000-4000-8000-000000000401',
          estado_ciclo: 'Programada',
        }),
      ],
    },
    {
      id: '70000000-0000-4000-8000-000000000402',
      codigo_programa: 'PRG-402-OLD',
      etiqueta: 'Ciclo Anterior Cerrado',
      nivel_vinculacion: 'INDIVIDUAL',
      tipo_vinculacion: 'Individual',
      es_vinculada: false,
      auditorias: [
        createMockAudit({
          id_certificado: '40000000-0000-4000-8000-000000000402',
          estado_ciclo: 'Auditada', // terminal -> cert 402 IS unprogrammed for next cycle
        }),
      ],
    },
  ];

  const allUnprogrammed = findUnprogrammedCertificatesByStatus(certs, programs);
  assert.equal(allUnprogrammed.totalUnprogrammed, 3);
  assert.deepEqual(allUnprogrammed.countsByEstatus, {
    Activo: 1,
    Estudio: 1,
    Suspendido: 1,
  });

  const onlyEstudio = findUnprogrammedCertificatesByStatus(certs, programs, {
    estatusNames: ['Estudio'],
  });
  assert.equal(onlyEstudio.items.length, 1);
  assert.equal(onlyEstudio.items[0].numero_certificado, 'FN-EMS-403');
  // countsByEstatus still reflects the full unprogrammed pool for UI filter badges
  assert.equal(onlyEstudio.countsByEstatus.Suspendido, 1);
});

test('Step 2.1.3 - computeAuditAlerts honors dynamic thresholds, latest MAX(numero_secuencia), and alertas_activas toggle', () => {
  // Audit 1: seq #1 was overdue (2026-05-01), but seq #2 rescheduled to 2026-06-10..12 -> MUST be PROXIMA, NOT ATRASADA!
  const rescheduledAudit = createMockAudit({
    id: '80000000-0000-4000-8000-000000000501',
    codigo_auditoria: 'AUD-RESCHED-1',
    fechas: [
      {
        id: '81000000-0000-4000-8000-000000000501',
        id_auditoria: '80000000-0000-4000-8000-000000000501',
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'REAL',
        anio: null,
        mes: null,
        fecha_inicio: '2026-05-01',
        fecha_fin: '2026-05-02',
      },
      {
        id: '81000000-0000-4000-8000-000000000502',
        id_auditoria: '80000000-0000-4000-8000-000000000501',
        numero_secuencia: 2,
        tag: 'Reprogramación',
        tipo_fecha: 'REAL',
        anio: null,
        mes: null,
        fecha_inicio: '2026-06-10',
        fecha_fin: '2026-06-12',
      },
    ],
    sitiosPlan: [createBalancedSite()],
    tiempo_auditoria: 3,
  });

  // Audit 2: PREPROGRAMADA_MES for July 2026 -> within 35d of 2026-06-01
  const preprogAudit = createMockAudit({
    id: '80000000-0000-4000-8000-000000000502',
    codigo_auditoria: 'AUD-PREPROG-2',
    fechas: [
      {
        id: '81000000-0000-4000-8000-000000000503',
        id_auditoria: '80000000-0000-4000-8000-000000000502',
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'PREPROGRAMADA_MES',
        anio: 2026,
        mes: 7,
        fecha_inicio: null,
        fecha_fin: null,
      },
    ],
    sitiosPlan: [],
  });

  const program: ProgramaAuditoriaEntity = {
    id: '70000000-0000-4000-8000-000000000501',
    codigo_programa: 'PRG-501',
    etiqueta: 'Campaña Junio',
    nivel_vinculacion: 'NIVEL_1_INTRA_ORG',
    tipo_vinculacion: 'Combinada',
    es_vinculada: true,
    auditorias: [rescheduledAudit, preprogAudit],
  };

  // On 2026-06-01 with default config (15d proxima, 30d preprogramada)
  const defaultAlerts = computeAuditAlerts([program], DEFAULT_AUDIT_ALERT_CONFIG, '2026-06-01');
  assert.ok(defaultAlerts.some((a) => a.category === 'PROXIMA' && a.codigoAuditoria === 'AUD-RESCHED-1'));
  assert.ok(!defaultAlerts.some((a) => a.category === 'ATRASADA'));
  assert.ok(defaultAlerts.some((a) => a.category === 'PREPROGRAMADA_SIN_CONFIRMAR'));
  assert.equal(
    assertZeroUuidExposure(defaultAlerts.map((a) => `${a.title} ${a.message}`).join(' ')).compliant,
    true
  );

  // Tighter threshold: dias_aviso_proxima = 5 -> 9 days away is NOT alerted; dias_aviso_preprogramada_sin_confirmar = 15 -> 30 days away NOT alerted
  const tightConfig: AlertConfigEntity = {
    ...DEFAULT_AUDIT_ALERT_CONFIG,
    dias_aviso_proxima: 5,
    dias_aviso_preprogramada_sin_confirmar: 15,
  };
  const tightAlerts = computeAuditAlerts([program], tightConfig, '2026-06-01');
  assert.equal(tightAlerts.length, 0);

  // Disabled master switch -> always []
  const disabledAlerts = computeAuditAlerts(
    [program],
    { ...DEFAULT_AUDIT_ALERT_CONFIG, alertas_activas: false },
    '2026-06-01'
  );
  assert.equal(disabledAlerts.length, 0);
});

test('Step 2.1.3 - buildCertificateAuditHistoryDigest detects Combinada -> Integrada evolution, Lead rotation >= 3, and unaudited processes', () => {
  const certId = '40000000-0000-4000-8000-000000000601';
  const leadId = '10000000-0000-4000-8000-000000000101';

  const makePastProgram = (
    year: number,
    tipo: ProgramaAuditoriaEntity['tipo_vinculacion'],
    auditedProcessId: string,
    auditedProcessName: string
  ): ProgramaAuditoriaEntity => ({
    id: `70000000-0000-4000-8000-00000000${year}`,
    codigo_programa: `PRG-${year}`,
    etiqueta: `Planta Santa Cruz ${year}`,
    nivel_vinculacion: 'NIVEL_1_INTRA_ORG',
    tipo_vinculacion: tipo,
    es_vinculada: true,
    auditorias: [
      createMockAudit({
        id: `80000000-0000-4000-8000-00000000${year}`,
        id_certificado: certId,
        codigo_auditoria: `AUD-${year}-001`,
        estado_ciclo: 'Auditada',
        auditor_lider_id: leadId,
        auditor_lider: 'Ing. Carlos Mendoza',
        fechas: [
          {
            id: `81000000-0000-4000-8000-00000000${year}`,
            id_auditoria: `80000000-0000-4000-8000-00000000${year}`,
            numero_secuencia: 1,
            tag: 'Programación',
            tipo_fecha: 'REAL',
            anio: null,
            mes: null,
            fecha_inicio: `${year}-05-10`,
            fecha_fin: `${year}-05-12`,
          },
        ],
        sitiosPlan: [
          createBalancedSite({
            procesos: [
              {
                id: `91000000-0000-4000-8000-00000000${year}`,
                id_sitios_por_auditoria: '90000000-0000-4000-8000-000000000001',
                id_procesos_por_sitio: '61000000-0000-4000-8000-000000000001',
                id_proceso: auditedProcessId,
                proceso_nombre: auditedProcessName,
                turnos: [],
                equipoProceso: [],
              },
            ],
          }),
        ],
      }),
    ],
  });

  const currentAuditId = '80000000-0000-4000-8000-000000002026';
  const currentProgram: ProgramaAuditoriaEntity = {
    id: '70000000-0000-4000-8000-000000002026',
    codigo_programa: 'PRG-2026',
    etiqueta: 'Planta Santa Cruz 2026',
    nivel_vinculacion: 'NIVEL_1_INTRA_ORG',
    tipo_vinculacion: 'Integrada',
    es_vinculada: true,
    auditorias: [
      createMockAudit({
        id: currentAuditId,
        id_certificado: certId,
        codigo_auditoria: 'AUD-2026-001',
        estado_ciclo: 'En Programación',
      }),
    ],
  };

  const allPrograms = [
    makePastProgram(2023, 'Combinada', 'proc-1', 'Dirección Estratégica'),
    makePastProgram(2024, 'Combinada', 'proc-1', 'Dirección Estratégica'),
    makePastProgram(2025, 'Combinada', 'proc-1', 'Dirección Estratégica'),
    currentProgram,
  ];

  const digest = buildCertificateAuditHistoryDigest(
    certId,
    currentAuditId,
    allPrograms,
    {
      procesos: [
        { id: 'proc-1', nombre_proceso: 'Dirección Estratégica', tipo: 'Estratégico' },
        { id: 'proc-2', nombre_proceso: 'Mantenimiento Industrial', tipo: 'De Apoyo' },
      ],
    },
    3
  );

  assert.equal(digest.previousCycles.length, 3);
  assert.equal(digest.latestPreviousCycle?.codigo_auditoria, 'AUD-2025-001');
  assert.equal(digest.hasLinkingEvolution, true);
  assert.equal(digest.evolutionNote, 'Ciclo previo: Combinada → Ciclo actual: Integrada');
  assert.equal(digest.leadAuditorRotation.consecutiveCycles, 3);
  assert.equal(digest.leadAuditorRotation.requiresRotation, true);
  assert.ok(digest.leadAuditorRotation.warningMessage);
  assert.equal(
    assertZeroUuidExposure(digest.leadAuditorRotation.warningMessage || '').compliant,
    true
  );
  assert.equal(digest.unauditedProcessesFromLastCycle.length, 1);
  assert.equal(digest.unauditedProcessesFromLastCycle[0].nombre_proceso, 'Mantenimiento Industrial');
});
