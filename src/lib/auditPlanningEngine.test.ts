import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAuditDayBalance,
  computeAuditPlanningStatus,
  computeProgramPlanningStatus,
  computeSiteDayBalance,
  evaluateSitePlanningCompleteness,
  formatAuditDateLabel,
  getNextAuditDateSequence,
  resolveEffectiveAuditorsForProcess,
  resolveLatestAuditDate,
  roundAuditDaysQuarter,
  validateAuditDateEntryInput,
  validateProgramLinkingRules,
  type AuditDateEntry,
  type AuditoriaSitioPlanItem,
  type ProgramaAuditoriaEntity,
  type ProgramLinkingCertificateRef,
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
