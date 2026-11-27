import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AUDITOR_SITE_ROLE_SELECT_OPTIONS,
  buildAuditAuditorDetail,
  buildCampaignAsignacionRows,
  buildCertificateAuditorRows,
  collectAuditScopeIafRequirements,
  evaluateAuditorCompetencyMatch,
  isAuditableUnitExactlyBalanced,
  rankEligibleExpertosForAudit,
  validateAuditorTimeAssignment,
  validateExpertoAuditoriaAssignmentDraft,
} from './asignacionDomain';
import type {
  AuditoriaSitioPlanItem,
  ProgramaAuditoriaEntity,
} from './auditPlanningEngine';
import type { ProgramacionAuditEntity } from './auditExecution';
import type { AuditorDetailEntity } from './competencyMatrix';
import type { AuditoriaSitioTemporalEntity } from './designacionTemporalDomain';
import type { CertificadoDetailEntity } from './multisiteSampling';
import { INITIAL_EXPERTOS_TECNICOS, type ExpertoTecnicoDetailEntity } from './expertoTecnicoDomain';
import { containsRawUuid } from './zeroUuid';

const UUID_AUDITOR_1 = '10000000-0000-0000-0000-000000000001';
const UUID_AUDITOR_2 = '10000000-0000-0000-0000-000000000002';
const UUID_PROG_1 = '70000000-0000-0000-0000-000000000001';
const UUID_PROG_2 = '70000000-0000-0000-0000-000000000002';
const UUID_PROG_3 = '70000000-0000-0000-0000-000000000003';
const UUID_PROG_NO_STEP6 = '70000000-0000-0000-0000-000000000004';
const UUID_PROG_NO_STEP5 = '70000000-0000-0000-0000-000000000005';
const UUID_AUDIT_1 = '80000000-0000-0000-0000-000000000001';
const UUID_AUDIT_2 = '80000000-0000-0000-0000-000000000002';
const UUID_AUDIT_3 = '80000000-0000-0000-0000-000000000003';
const UUID_AUDIT_4 = '80000000-0000-0000-0000-000000000004';
const UUID_AUDIT_5 = '80000000-0000-0000-0000-000000000005';
const UUID_TEMP_1 = '9a000000-0000-0000-0000-000000000001';

function makeSitePlan(
  id: string,
  auditId: string,
  numeroSitio: number,
  nombreSitio: string,
  requiredDays: number,
  assignedMembers: Array<{ idAuditor: string; nombre: string; rol: 'AUDITOR_LIDER' | 'AUDITOR' | 'AUDITOR_EN_ENTRENAMIENTO' | 'EXPERTO_TECNICO'; days: number }> = []
): AuditoriaSitioPlanItem {
  return {
    id,
    id_auditoria: auditId,
    id_sitio: `50000000-0000-0000-0000-${id.slice(-12)}`,
    numero_sitio: numeroSitio,
    nombre_sitio: nombreSitio,
    tiempo_auditoria: requiredDays,
    modalidad_evaluacion: 'Presencial',
    procesos: [],
    equipoSitio: assignedMembers.map((m, idx) => ({
      id: `83000000-0000-0000-0000-${String(idx + 1).padStart(12, '0')}`,
      id_sitios_por_auditoria: id,
      id_auditor: m.idAuditor,
      auditor_nombre: m.nombre,
      rol_auditor: m.rol,
      tiempo_auditoria: m.days,
      asignacion_completa_sitio: m.days >= requiredDays && requiredDays > 0,
      deleted_at: null,
    })),
    deleted_at: null,
  };
}

function makeAudit(overrides: Partial<ProgramacionAuditEntity>): ProgramacionAuditEntity {
  const id = overrides.id ?? UUID_AUDIT_1;
  return {
    id,
    id_programa_auditoria: overrides.id_programa_auditoria ?? UUID_PROG_1,
    codigo_auditoria: overrides.codigo_auditoria ?? 'AUD-2026-001',
    id_certificado: overrides.id_certificado ?? '40000000-0000-0000-0000-000000000001',
    numero_certificado: overrides.numero_certificado ?? 'FN-QMS-2026-001',
    id_organizacion: '30000000-0000-0000-0000-000000000001',
    organizacion_nombre: 'Industrias Andinas S.A.',
    norma_codigo: overrides.norma_codigo ?? 'ISO 9001:2015',
    sector_iaf: overrides.sector_iaf ?? 17,
    id_tipo_auditoria: '60000000-0000-0000-0000-000000000001',
    tipo_auditoria: 'Seguimiento 1',
    metodologia: 'Presencial',
    fecha_inicio: '2026-06-15',
    fecha_fin: '2026-06-17',
    fecha_reprogramacion: null,
    fechas: [
      {
        id: '81000000-0000-0000-0000-000000000001',
        id_auditoria: id,
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'PROGRAMADA_EXACTA',
        anio: null,
        mes: null,
        fecha_inicio: '2026-06-15',
        fecha_fin: '2026-06-17',
        observacion: null,
        deleted_at: null,
      },
    ],
    latestDate: null,
    dias_auditor: 0,
    tiempo_auditoria: 0,
    estatus: 'En Programación',
    estado_ciclo: 'En Programación',
    tiene_sitio_temporal: overrides.tiene_sitio_temporal ?? false,
    auditor_lider_id: UUID_AUDITOR_1,
    auditor_lider: 'Ing. Carlos Mendoza',
    sede_principal_direccion: 'Av. Industrial 100',
    equipo: [],
    sitiosMuestreo: [],
    sitiosPlan: overrides.sitiosPlan ?? [],
    matrizNormativa: [],
    deleted_at: overrides.deleted_at ?? null,
  };
}

function makeProgram(
  id: string,
  etiqueta: string,
  auditorias: ProgramacionAuditEntity[]
): ProgramaAuditoriaEntity {
  return {
    id,
    id_vinculo: '25000000-0000-0000-0000-000000000001',
    id_grupo_empresarial: '20000000-0000-0000-0000-000000000001',
    codigo_programa: `PROG-${id.slice(-3)}`,
    etiqueta,
    nivel_vinculacion: auditorias.length > 1 ? 'NIVEL_1_INTRA_ORG' : 'INDIVIDUAL',
    tipo_vinculacion: auditorias.length > 1 ? 'Integrada' : 'Individual',
    es_vinculada: auditorias.length > 1,
    tiene_sitio_temporal: auditorias.some((a) => a.tiene_sitio_temporal),
    id_ciclo_origen: null,
    notas: null,
    deleted_at: null,
    auditorias,
  };
}

function makeAuditor(overrides: Partial<AuditorDetailEntity> = {}): AuditorDetailEntity {
  return {
    id: UUID_AUDITOR_1,
    nombre: 'Ing. Carlos Mendoza',
    titulo_profesional: 'Ingeniero Industrial',
    codigo_credencial: 'AUD-FN-001',
    email: 'cmendoza@fondonorma.test',
    telefono: '+58 412 0000001',
    biografia: 'Auditor líder senior',
    instituto_registro: 'IRCA',
    categoria_profesional: 'Auditor Líder',
    calificacion: 'Calificado',
    normas_acreditadas: ['ISO 9001:2015', 'ISO 14001:2015'],
    sectores_iaf: [17, 28],
    competencias: [],
    subsectorLinks: [
      {
        id_auditor: UUID_AUDITOR_1,
        id_subsector_iaf: '15000000-0000-0000-0000-000000000001',
        id_sector_iaf: '14000000-0000-0000-0000-000000000001',
        sector_numero: 17,
        subsector_codigo: '17.1',
        subsector_descripcion: 'Metales básicos y aleaciones',
      },
    ],
    historialAuditorias: [],
    ...overrides,
  };
}

test('validateAuditorTimeAssignment rejects budget overflow, non-0.25d steps, invalid UUID/role, and keeps Zero-UUID errors', () => {
  // Valid 2.00 + 1.00 == 3.00
  assert.equal(
    validateAuditorTimeAssignment(UUID_AUDITOR_2, 1.0, 'AUDITOR', 3.0, 2.0),
    null
  );

  // Over-budget: 2.00 + 1.50 > 3.00
  const overflowErr = validateAuditorTimeAssignment(UUID_AUDITOR_2, 1.5, 'AUDITOR', 3.0, 2.0);
  assert.ok(overflowErr && overflowErr.includes('3.50 d') && overflowErr.includes('3.00 d'));
  assert.equal(containsRawUuid(overflowErr), false);

  // Non-0.25d increment
  const stepErr = validateAuditorTimeAssignment(UUID_AUDITOR_1, 0.3, 'AUDITOR_LIDER', 3.0, 0);
  assert.ok(stepErr && stepErr.includes('0.25'));

  // Zero or negative days
  const zeroErr = validateAuditorTimeAssignment(UUID_AUDITOR_1, 0, 'AUDITOR_LIDER', 3.0, 0);
  assert.ok(zeroErr && zeroErr.includes('mayores a 0'));

  // Invalid auditor ID
  const invalidUuidErr = validateAuditorTimeAssignment('not-a-uuid', 1.0, 'AUDITOR', 3.0, 0);
  assert.equal(invalidUuidErr, 'Seleccione un auditor válido.');
});

test('buildCampaignAsignacionRows enforces Step 5/6 entry gates and classifies SIN_ASIGNAR, DESCUADRADO, COMPLETO accurately', () => {
  const progCompleto = makeProgram(UUID_PROG_1, 'Campaña Cuadrada con Temporal', [
    makeAudit({
      id: UUID_AUDIT_1,
      id_programa_auditoria: UUID_PROG_1,
      tiene_sitio_temporal: true,
      sitiosPlan: [
        makeSitePlan('82000000-0000-0000-0000-000000000001', UUID_AUDIT_1, 0, 'Sede HQ', 3.0, [
          { idAuditor: UUID_AUDITOR_1, nombre: 'Carlos Mendoza', rol: 'AUDITOR_LIDER', days: 2.0 },
          { idAuditor: UUID_AUDITOR_2, nombre: 'Ana Rojas', rol: 'AUDITOR', days: 1.0 },
        ]),
        makeSitePlan('82000000-0000-0000-0000-000000000002', UUID_AUDIT_1, 1, 'Planta Norte', 1.0, [
          { idAuditor: UUID_AUDITOR_2, nombre: 'Ana Rojas', rol: 'AUDITOR', days: 1.0 },
        ]),
      ],
    }),
  ]);

  const progDescuadrado = makeProgram(UUID_PROG_2, 'Campaña Descuadrada', [
    makeAudit({
      id: UUID_AUDIT_2,
      id_programa_auditoria: UUID_PROG_2,
      sitiosPlan: [
        makeSitePlan('82000000-0000-0000-0000-000000000003', UUID_AUDIT_2, 0, 'Sede HQ', 2.0, [
          { idAuditor: UUID_AUDITOR_1, nombre: 'Carlos Mendoza', rol: 'AUDITOR_LIDER', days: 1.5 },
        ]),
      ],
    }),
  ]);

  const progSinAsignar = makeProgram(UUID_PROG_3, 'Campaña Sin Equipo', [
    makeAudit({
      id: UUID_AUDIT_3,
      id_programa_auditoria: UUID_PROG_3,
      sitiosPlan: [
        makeSitePlan('82000000-0000-0000-0000-000000000004', UUID_AUDIT_3, 0, 'Sede HQ', 2.0, []),
      ],
    }),
  ]);

  // Excluded: Paso 6 incomplete (one site still at 0d)
  const progNoStep6 = makeProgram(UUID_PROG_NO_STEP6, 'Campaña Paso 6 Incompleto', [
    makeAudit({
      id: UUID_AUDIT_4,
      id_programa_auditoria: UUID_PROG_NO_STEP6,
      sitiosPlan: [
        makeSitePlan('82000000-0000-0000-0000-000000000005', UUID_AUDIT_4, 0, 'Sede HQ', 0, []),
      ],
    }),
  ]);

  // Excluded: tiene_sitio_temporal = true without temporal site time assigned
  const progNoStep5 = makeProgram(UUID_PROG_NO_STEP5, 'Campaña Sin Tiempo Temporal', [
    makeAudit({
      id: UUID_AUDIT_5,
      id_programa_auditoria: UUID_PROG_NO_STEP5,
      tiene_sitio_temporal: true,
      sitiosPlan: [
        makeSitePlan('82000000-0000-0000-0000-000000000006', UUID_AUDIT_5, 0, 'Sede HQ', 1.0, []),
      ],
    }),
  ]);

  const temporalSites: AuditoriaSitioTemporalEntity[] = [
    {
      id: UUID_TEMP_1,
      id_auditoria: UUID_AUDIT_1,
      etiqueta: 'Obra Ampliación Norte',
      comentario: null,
      tiempo_auditoria: 1.0,
      certificados: [],
      equipoTemporal: [
        {
          id: '9c000000-0000-0000-0000-000000000001',
          id_sitio_temporal: UUID_TEMP_1,
          id_auditor: UUID_AUDITOR_1,
          auditor_nombre: 'Carlos Mendoza',
          rol_auditor: 'AUDITOR_LIDER',
          tiempo_auditoria: 1.0,
          deleted_at: null,
        },
      ],
      deleted_at: null,
    },
  ];

  const rows = buildCampaignAsignacionRows(
    [progCompleto, progDescuadrado, progSinAsignar, progNoStep6, progNoStep5],
    temporalSites,
    '2026-06-01'
  );

  assert.equal(rows.length, 3);

  const r1 = rows.find((r) => r.program.id === UUID_PROG_1);
  assert.ok(r1);
  assert.equal(r1.statusKey, 'COMPLETO');
  assert.equal(r1.totalRequiredDays, 5.0);
  assert.equal(r1.totalAssignedDays, 5.0);
  assert.equal(r1.siteReconciliations.length, 3);
  assert.equal(r1.siteReconciliations[2].kind, 'TEMPORAL');
  assert.equal(r1.siteReconciliations[2].isBalanced, true);

  const r2 = rows.find((r) => r.program.id === UUID_PROG_2);
  assert.ok(r2);
  assert.equal(r2.statusKey, 'DESCUADRADO');
  assert.equal(r2.siteReconciliations[0].deltaDays, -0.5);
  assert.equal(r2.siteReconciliations[0].coveragePct, 75);

  const r3 = rows.find((r) => r.program.id === UUID_PROG_3);
  assert.ok(r3);
  assert.equal(r3.statusKey, 'SIN_ASIGNAR');
  assert.equal(r3.siteReconciliations[0].hasNoTeam, true);
});

test('buildCampaignAsignacionRows detects under-assigned temporal site as DESCUADRADO (negative delta)', () => {
  const progUnderTemporal = makeProgram(UUID_PROG_1, 'Campaña Temporal Incompleto', [
    makeAudit({
      id: UUID_AUDIT_1,
      id_programa_auditoria: UUID_PROG_1,
      tiene_sitio_temporal: true,
      sitiosPlan: [
        makeSitePlan('82000000-0000-0000-0000-000000000001', UUID_AUDIT_1, 0, 'Sede HQ', 1.0, [
          { idAuditor: UUID_AUDITOR_1, nombre: 'Carlos Mendoza', rol: 'AUDITOR_LIDER', days: 1.0 },
        ]),
      ],
    }),
  ]);

  const temporalUnderAssigned: AuditoriaSitioTemporalEntity[] = [
    {
      id: UUID_TEMP_1,
      id_auditoria: UUID_AUDIT_1,
      etiqueta: 'Proyecto Puente Sur',
      comentario: null,
      tiempo_auditoria: 1.5,
      certificados: [],
      equipoTemporal: [
        {
          id: '9c000000-0000-0000-0000-000000000001',
          id_sitio_temporal: UUID_TEMP_1,
          id_auditor: UUID_AUDITOR_1,
          auditor_nombre: 'Carlos Mendoza',
          rol_auditor: 'AUDITOR_LIDER',
          tiempo_auditoria: 0.75,
          deleted_at: null,
        },
      ],
      deleted_at: null,
    },
  ];

  const rows = buildCampaignAsignacionRows([progUnderTemporal], temporalUnderAssigned, '2026-06-01');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].statusKey, 'DESCUADRADO');
  const tempRec = rows[0].siteReconciliations.find((r) => r.kind === 'TEMPORAL');
  assert.ok(tempRec);
  assert.equal(tempRec.deltaDays, -0.75);
  assert.equal(tempRec.isBalanced, false);
  assert.equal(tempRec.coveragePct, 50);
});

test('evaluateAuditorCompetencyMatch distinguishes FULL (norma+IAF+subsector) from missing subsector, missing IAF, and missing norma', () => {
  const auditor = makeAuditor();

  const fullMatch = evaluateAuditorCompetencyMatch(auditor, 'ISO 9001:2015', 17, '17.1');
  assert.equal(fullMatch.level, 'FULL');
  assert.ok(fullMatch.label.includes('Calificado'));

  const missingSubsector = evaluateAuditorCompetencyMatch(auditor, 'ISO 9001:2015', 17, '17.9');
  assert.equal(missingSubsector.level, 'NORMA_ONLY');
  assert.ok(missingSubsector.label.includes('Sin subsector IAF (17.9)'));

  const missingIaf = evaluateAuditorCompetencyMatch(auditor, 'ISO 9001:2015', 34, '34.1');
  assert.equal(missingIaf.level, 'NORMA_ONLY');
  assert.ok(missingIaf.label.includes('Falta IAF 34'));

  const missingNorma = evaluateAuditorCompetencyMatch(auditor, 'ISO 45001:2018', 17, '17.1');
  assert.equal(missingNorma.level, 'PARTIAL');
  assert.ok(missingNorma.label.includes('Sin Norma Base'));
});

test('Step 6.1 isAuditableUnitExactlyBalanced, buildAuditAuditorDetail & buildCertificateAuditorRows unify regular + TEMPORAL units and enforce strict SUM == required', () => {
  assert.equal(isAuditableUnitExactlyBalanced(2, 6.0, 6.0), true);
  assert.equal(isAuditableUnitExactlyBalanced(0, 0, 0), false);
  assert.equal(isAuditableUnitExactlyBalanced(1, 0, 0), false);
  assert.equal(isAuditableUnitExactlyBalanced(0, 6.0, 6.0), false);
  assert.equal(isAuditableUnitExactlyBalanced(2, 5.75, 6.0), false);

  const certA = '40000000-0000-0000-0000-000000000011';
  const certB = '40000000-0000-0000-0000-000000000012';
  const auditBalanced = makeAudit({
    id: UUID_AUDIT_1,
    id_certificado: certA,
    numero_certificado: 'FN-QMS-2026-011',
    tiene_sitio_temporal: true,
    sitiosPlan: [
      makeSitePlan('82000000-0000-0000-0000-000000000001', UUID_AUDIT_1, 0, 'Sede HQ', 6.0, [
        { idAuditor: UUID_AUDITOR_1, nombre: 'Carlos Mendoza', rol: 'AUDITOR_LIDER', days: 3.0 },
        { idAuditor: UUID_AUDITOR_2, nombre: 'Ana Rojas', rol: 'AUDITOR', days: 3.0 },
      ]),
    ],
  });
  const auditUnbalanced = makeAudit({
    id: UUID_AUDIT_2,
    id_certificado: certB,
    numero_certificado: 'FN-QMS-2026-012',
    sitiosPlan: [
      makeSitePlan('82000000-0000-0000-0000-000000000002', UUID_AUDIT_2, 0, 'Planta B', 2.0, [
        { idAuditor: UUID_AUDITOR_1, nombre: 'Carlos Mendoza', rol: 'AUDITOR_LIDER', days: 1.25 },
      ]),
    ],
  });
  const prog = makeProgram(UUID_PROG_1, 'Campaña Auditor', [auditBalanced, auditUnbalanced]);

  const temporalActive: AuditoriaSitioTemporalEntity = {
    id: UUID_TEMP_1,
    id_auditoria: UUID_AUDIT_1,
    etiqueta: 'Obra Túnel Oriente',
    comentario: 'Turno especial',
    tiempo_auditoria: 1.5,
    certificados: [
      {
        id: '9b000000-0000-0000-0000-000000000011',
        id_sitio_temporal: UUID_TEMP_1,
        id_auditoria_certificado: UUID_AUDIT_1,
        numero_certificado: 'FN-QMS-2026-011',
        organizacion_nombre: 'Industrias Andinas S.A.',
        norma_codigo: 'ISO 9001:2015',
      },
    ],
    equipoTemporal: [
      {
        id: '9c000000-0000-0000-0000-000000000011',
        id_sitio_temporal: UUID_TEMP_1,
        id_auditor: UUID_AUDITOR_2,
        auditor_nombre: 'Ana Rojas',
        rol_auditor: 'AUDITOR',
        tiempo_auditoria: 1.5,
        deleted_at: null,
      },
    ],
    deleted_at: null,
  };

  const detail = buildAuditAuditorDetail({
    activeAudit: auditBalanced,
    audits: [auditBalanced, auditUnbalanced],
    programs: [prog],
    temporalSites: [temporalActive],
    auditors: [makeAuditor()],
    certificados: [],
  });

  assert.equal(detail.units.length, 2);
  assert.equal(detail.units[0].kind, 'REGULAR');
  assert.equal(detail.units[1].kind, 'TEMPORAL');
  assert.equal(detail.requiredDaysTotal, 7.5);
  assert.equal(detail.assignedDaysTotal, 7.5);
  assert.equal(detail.statusKey, 'COMPLETO');
  assert.equal(detail.units[0].isBalanced, true);
  assert.equal(detail.units[1].isBalanced, true);

  const certRows = buildCertificateAuditorRows({
    audits: [auditBalanced, auditUnbalanced],
    programs: [prog],
    temporalSites: [temporalActive],
    auditors: [makeAuditor()],
  });
  assert.equal(certRows.length, 2);
  const rowA = certRows.find((r) => r.certId === certA);
  const rowB = certRows.find((r) => r.certId === certB);
  assert.ok(rowA && rowB);
  assert.equal(rowA.statusKey, 'COMPLETO');
  assert.equal(rowA.hasTemporalActive, true);
  assert.equal(rowA.requiredDays, 7.5);
  assert.equal(rowA.assignedDays, 7.5);
  assert.equal(rowB.statusKey, 'DESBALANCEADO');
});

test('Step 1.4: AUDITOR_SITE_ROLE_SELECT_OPTIONS hides EXPERTO_TECNICO while preserving legacy validation compatibility', () => {
  assert.equal(
    AUDITOR_SITE_ROLE_SELECT_OPTIONS.some((opt) => opt.value === 'EXPERTO_TECNICO'),
    false
  );
  assert.equal(
    validateAuditorTimeAssignment(UUID_AUDITOR_1, 1.0, 'EXPERTO_TECNICO', 1.0, 0),
    null
  );
});

test('Step 1.4: collectAuditScopeIafRequirements, rankEligibleExpertosForAudit, computeAuditIafGapStatus & validation cover 13.2 + ISO 45001 and linked batches', () => {
  const certFarId = '40000000-0000-0000-0000-000000000201';
  const certBatchId = '40000000-0000-0000-0000-000000000202';
  const auditFarId = '80000000-0000-0000-0000-000000000201';
  const auditBatchId = '80000000-0000-0000-0000-000000000202';
  const progBatchId = '70000000-0000-0000-0000-000000000201';

  const certs: CertificadoDetailEntity[] = [
    {
      id: certFarId,
      numero_certificado: 'FN-SST-2026-201',
      id_organizacion: '30000000-0000-0000-0000-000000000001',
      organizacion_nombre: 'Laboratorios FarmaNorte S.A.',
      id_norma: 'n-45001',
      norma_codigo: 'ISO 45001:2018',
      id_sector_iaf: 's-13',
      sector_iaf: 13,
      id_subsector_iaf: 'sub-13-2',
      subsector_iaf_codigo: '13.2',
      subsector_iaf_descripcion: 'Productos farmacéuticos',
      estatus: 'Vigente',
      sitios: [],
      procesos: [],
      requisitos: [],
      noAplicables: [],
    },
    {
      id: certBatchId,
      numero_certificado: 'FN-QMS-2026-202',
      id_organizacion: '30000000-0000-0000-0000-000000000001',
      organizacion_nombre: 'Laboratorios FarmaNorte S.A.',
      id_norma: 'n-9001',
      norma_codigo: 'ISO 9001:2015',
      id_sector_iaf: 's-17',
      sector_iaf: 17,
      id_subsector_iaf: 'sub-17-1',
      subsector_iaf_codigo: '17.1',
      estatus: 'Vigente',
      sitios: [],
      procesos: [],
      requisitos: [],
      noAplicables: [],
    },
  ];

  const auditorNormaOnly: AuditorDetailEntity = makeAuditor({
    id: UUID_AUDITOR_2,
    nombre: 'Ing. Patricia Valera',
    normas_acreditadas: ['ISO 45001:2018'],
    sectores_iaf: [28],
    subsectorLinks: [],
  });

  const auditFar = makeAudit({
    id: auditFarId,
    id_programa_auditoria: progBatchId,
    id_certificado: certFarId,
    numero_certificado: 'FN-SST-2026-201',
    norma_codigo: 'ISO 45001:2018',
    sector_iaf: 13,
    sitiosPlan: [
      makeSitePlan('82000000-0000-0000-0000-000000000201', auditFarId, 0, 'Planta Estéril', 2.0, [
        {
          idAuditor: UUID_AUDITOR_2,
          nombre: 'Ing. Patricia Valera',
          rol: 'AUDITOR_LIDER',
          days: 2.0,
        },
      ]),
    ],
  });

  const auditSibling = makeAudit({
    id: auditBatchId,
    id_programa_auditoria: progBatchId,
    id_certificado: certBatchId,
    numero_certificado: 'FN-QMS-2026-202',
    norma_codigo: 'ISO 9001:2015',
    sector_iaf: 17,
    sitiosPlan: [],
  });

  const prog = makeProgram(progBatchId, 'Lote Farma', [auditFar, auditSibling]);
  const scopeReqs = collectAuditScopeIafRequirements(
    auditFar,
    [auditFar, auditSibling],
    [prog],
    certs
  );
  assert.equal(scopeReqs.length, 2);
  assert.ok(scopeReqs.some((r) => r.sectorIaf === 13 && r.subsectorCodigo === '13.2'));
  assert.ok(scopeReqs.some((r) => r.sectorIaf === 17 && r.subsectorCodigo === '17.1'));

  const unavailableExpert: ExpertoTecnicoDetailEntity = {
    ...INITIAL_EXPERTOS_TECNICOS[0],
    id: '1e000000-0000-0000-0000-000000000099',
    nombre: 'Dr. Inactivo Temporalmente',
    estatus: 'No disponible',
  };

  const ranked = rankEligibleExpertosForAudit({
    expertos: [unavailableExpert, ...INITIAL_EXPERTOS_TECNICOS],
    scopeRequirements: scopeReqs,
  });
  // Available matching experts (e.g. Sofia Quintero covering 13.2) rank before unavailable
  assert.ok(ranked.length >= 2);
  assert.equal(ranked[0].isUnavailable, false);
  assert.ok(ranked[0].coveredIafLabels.some((l) => l.includes('13.2') || l.includes('13')));
  const unavailOpt = ranked.find((o) => o.expertoId === unavailableExpert.id);
  assert.ok(unavailOpt);
  assert.equal(unavailOpt.isUnavailable, true);
  assert.match(unavailOpt.optionLabel, /\[No disponible\]/);

  // Without any technical expert assigned -> non-blocking IAF gap + audit still COMPLETO
  const detailWithoutExpert = buildAuditAuditorDetail({
    activeAudit: auditFar,
    audits: [auditFar, auditSibling],
    programs: [prog],
    temporalSites: [],
    auditors: [auditorNormaOnly],
    certificados: certs,
    expertos: INITIAL_EXPERTOS_TECNICOS,
    auditExpertAssignments: [],
  });
  assert.equal(detailWithoutExpert.statusKey, 'COMPLETO');
  assert.equal(detailWithoutExpert.iafGapStatus.hasIafSectorGap, true);
  assert.equal(detailWithoutExpert.iafGapStatus.allAuditorsMissingIaf, true);
  assert.equal(detailWithoutExpert.iafGapStatus.coveredByAssignedExperts, false);
  assert.match(detailWithoutExpert.iafGapStatus.title, /Todo el equipo auditor carece de competencia IAF completa/);
  assert.match(detailWithoutExpert.iafGapStatus.message, /Sub-Sector 13\.2/);
  assert.equal(containsRawUuid(detailWithoutExpert.iafGapStatus.message), false);

  // With Sofía Quintero assigned globally -> gap backed by expert & covered IAF labels shown
  const detailWithExpert = buildAuditAuditorDetail({
    activeAudit: auditFar,
    audits: [auditFar, auditSibling],
    programs: [prog],
    temporalSites: [],
    auditors: [auditorNormaOnly],
    certificados: certs,
    expertos: INITIAL_EXPERTOS_TECNICOS,
    auditExpertAssignments: [
      {
        id: '1e300000-0000-0000-0000-000000000001',
        id_auditoria: auditFarId,
        id_experto_tecnico: INITIAL_EXPERTOS_TECNICOS[0].id,
        experto_nombre: INITIAL_EXPERTOS_TECNICOS[0].nombre,
        experto_estatus: 'Disponible',
        dias_asignados: 0.75,
        observacion: 'Validación estéril',
        deleted_at: null,
      },
    ],
  });
  assert.equal(detailWithExpert.iafGapStatus.hasIafSectorGap, true);
  assert.equal(detailWithExpert.iafGapStatus.coveredByAssignedExperts, true);
  assert.equal(detailWithExpert.assignedExpertos.length, 1);
  assert.ok(detailWithExpert.assignedExpertos[0].coveredIafLabels.some((l) => l.includes('13.2')));

  // Validation: 0.25d steps, <=500 chars obs, Zero-UUID, no duplicate active expert
  assert.equal(
    validateExpertoAuditoriaAssignmentDraft({
      auditId: auditFarId,
      expertoId: INITIAL_EXPERTOS_TECNICOS[0].id,
      diasAsignados: 0.75,
      observacion: 'Acompañamiento técnico en áreas estériles.',
      existingAssignments: [],
    }).valid,
    true
  );
  assert.equal(
    validateExpertoAuditoriaAssignmentDraft({
      auditId: auditFarId,
      expertoId: INITIAL_EXPERTOS_TECNICOS[0].id,
      diasAsignados: 0.3,
      observacion: null,
      existingAssignments: [],
    }).valid,
    false
  );
  assert.equal(
    validateExpertoAuditoriaAssignmentDraft({
      auditId: auditFarId,
      expertoId: INITIAL_EXPERTOS_TECNICOS[0].id,
      diasAsignados: 1.0,
      observacion: 'x'.repeat(501),
      existingAssignments: [],
    }).valid,
    false
  );
  assert.equal(
    validateExpertoAuditoriaAssignmentDraft({
      auditId: auditFarId,
      expertoId: INITIAL_EXPERTOS_TECNICOS[0].id,
      diasAsignados: 1.0,
      observacion: `Ref ${auditFarId}`,
      existingAssignments: [],
    }).valid,
    false
  );
  assert.equal(
    validateExpertoAuditoriaAssignmentDraft({
      auditId: auditFarId,
      expertoId: INITIAL_EXPERTOS_TECNICOS[0].id,
      diasAsignados: 1.0,
      observacion: null,
      existingAssignments: [
        {
          id: '1e300000-0000-0000-0000-000000000001',
          id_experto_tecnico: INITIAL_EXPERTOS_TECNICOS[0].id,
          deleted_at: null,
        },
      ],
    }).valid,
    false
  );
});

test('Step 1.4 edge cases: partial team gap, sibling-only expert does not falsely cover active 13.2 gap, and empty auditor catalog does not trigger false gap', () => {
  const certFarId = '40000000-0000-0000-0000-000000000211';
  const certSiblingId = '40000000-0000-0000-0000-000000000212';
  const auditFarId = '80000000-0000-0000-0000-000000000211';
  const auditSiblingId = '80000000-0000-0000-0000-000000000212';
  const progId = '70000000-0000-0000-0000-000000000211';

  const certs: CertificadoDetailEntity[] = [
    {
      id: certFarId,
      numero_certificado: 'FN-SST-2026-211',
      id_organizacion: '30000000-0000-0000-0000-000000000001',
      organizacion_nombre: 'Laboratorios FarmaNorte S.A.',
      id_norma: 'n-45001',
      norma_codigo: 'ISO 45001:2018',
      id_sector_iaf: 's-13',
      sector_iaf: 13,
      id_subsector_iaf: 'sub-13-2',
      subsector_iaf_codigo: '13.2',
      estatus: 'Vigente',
      sitios: [],
      procesos: [],
      requisitos: [],
      noAplicables: [],
    },
    {
      id: certSiblingId,
      numero_certificado: 'FN-QMS-2026-212',
      id_organizacion: '30000000-0000-0000-0000-000000000001',
      organizacion_nombre: 'Laboratorios FarmaNorte S.A.',
      id_norma: 'n-9001',
      norma_codigo: 'ISO 9001:2015',
      id_sector_iaf: 's-17',
      sector_iaf: 17,
      id_subsector_iaf: 'sub-17-1',
      subsector_iaf_codigo: '17.1',
      estatus: 'Vigente',
      sitios: [],
      procesos: [],
      requisitos: [],
      noAplicables: [],
    },
  ];

  const auditorFull = makeAuditor({
    id: UUID_AUDITOR_1,
    nombre: 'Ing. Completo Farma',
    normas_acreditadas: ['ISO 45001:2018'],
    sectores_iaf: [13],
    subsectorLinks: [
      {
        id_auditor: UUID_AUDITOR_1,
        id_subsector_iaf: 'sub-13-2',
        id_sector_iaf: 's-13',
        sector_numero: 13,
        subsector_codigo: '13.2',
        subsector_descripcion: 'Productos farmacéuticos',
      },
    ],
  });
  const auditorNoIaf = makeAuditor({
    id: UUID_AUDITOR_2,
    nombre: 'Ing. Solo Norma',
    normas_acreditadas: ['ISO 45001:2018'],
    sectores_iaf: [28],
    subsectorLinks: [],
  });

  const auditFar = makeAudit({
    id: auditFarId,
    id_programa_auditoria: progId,
    id_certificado: certFarId,
    numero_certificado: 'FN-SST-2026-211',
    norma_codigo: 'ISO 45001:2018',
    sector_iaf: 13,
    sitiosPlan: [
      makeSitePlan('82000000-0000-0000-0000-000000000211', auditFarId, 0, 'Planta Estéril', 2.0, [
        { idAuditor: UUID_AUDITOR_1, nombre: 'Ing. Completo Farma', rol: 'AUDITOR_LIDER', days: 1.0 },
        { idAuditor: UUID_AUDITOR_2, nombre: 'Ing. Solo Norma', rol: 'AUDITOR', days: 1.0 },
      ]),
    ],
  });
  const auditSibling = makeAudit({
    id: auditSiblingId,
    id_programa_auditoria: progId,
    id_certificado: certSiblingId,
    numero_certificado: 'FN-QMS-2026-212',
    norma_codigo: 'ISO 9001:2015',
    sector_iaf: 17,
    sitiosPlan: [],
  });
  const prog = makeProgram(progId, 'Lote Mixto', [auditFar, auditSibling]);

  const siblingOnlyExpert: ExpertoTecnicoDetailEntity = {
    ...INITIAL_EXPERTOS_TECNICOS[0],
    id: '1e000000-0000-0000-0000-000000000299',
    nombre: 'Ing. Solo Metalurgia',
    estatus: 'Disponible',
    sectorLinks: [],
    subsectorLinks: [
      {
        id: 'sub-link-171',
        id_experto_tecnico: '1e000000-0000-0000-0000-000000000299',
        id_subsector_iaf: 'sub-17-1',
        id_sector_iaf: 's-17',
        sector_numero: 17,
        subsector_codigo: '17.1',
        subsector_descripcion: 'Metales básicos',
      },
    ],
  };

  const detail = buildAuditAuditorDetail({
    activeAudit: auditFar,
    audits: [auditFar, auditSibling],
    programs: [prog],
    temporalSites: [],
    auditors: [auditorFull, auditorNoIaf],
    certificados: certs,
    expertos: [siblingOnlyExpert, ...INITIAL_EXPERTOS_TECNICOS],
    auditExpertAssignments: [
      {
        id: '1e300000-0000-0000-0000-000000000299',
        id_auditoria: auditFarId,
        id_experto_tecnico: siblingOnlyExpert.id,
        experto_nombre: siblingOnlyExpert.nombre,
        experto_estatus: 'Disponible',
        dias_asignados: 0.5,
        observacion: 'Solo soporte 17.1',
        deleted_at: null,
      },
    ],
  });

  assert.equal(detail.iafGapStatus.hasIafSectorGap, true);
  assert.equal(detail.iafGapStatus.allAuditorsMissingIaf, false);
  assert.equal(detail.iafGapStatus.missingCount, 1);
  assert.equal(detail.iafGapStatus.totalAssignedAuditors, 2);
  assert.match(detail.iafGapStatus.title, /Parte del equipo auditor carece de competencia IAF completa/);
  assert.equal(detail.iafGapStatus.coveredByAssignedExperts, false);
  assert.ok(detail.assignedExpertos[0].coveredIafLabels.some((l) => l.includes('17.1')));

  // Unloaded auditor catalog should not produce false IAF gaps
  const unloadedDetail = buildAuditAuditorDetail({
    activeAudit: auditFar,
    audits: [auditFar, auditSibling],
    programs: [prog],
    temporalSites: [],
    auditors: [],
    certificados: certs,
    expertos: [],
  });
  assert.equal(unloadedDetail.iafGapStatus.hasIafSectorGap, false);
});

test('Step 4.1: buildAuditAuditorDetail disambiguates Yurima Carrillo homonyms, flags non-blocking in-situ warnings, and computes observacion_sectores Technical Expert alerts', () => {
  const certSec13Id = '40000000-0000-0000-0000-000000000401';
  const auditSec13Id = '80000000-0000-0000-0000-000000000401';
  const progId = '70000000-0000-0000-0000-000000000401';
  const yurima1Id = '10000000-0000-0000-0000-000000000045';
  const yurima2Id = '10000000-0000-0000-0000-000000000047';
  const nelsonId = '10000000-0000-0000-0000-000000000007';

  const certs: CertificadoDetailEntity[] = [
    {
      id: certSec13Id,
      numero_certificado: 'FN-QMS-2026-401',
      id_organizacion: '30000000-0000-0000-0000-000000000001',
      organizacion_nombre: 'Química Sector 13 C.A.',
      id_norma: 'n-9001',
      norma_codigo: 'ISO 9001:2015',
      id_sector_iaf: 's-13',
      sector_iaf: 13,
      id_subsector_iaf: 'sub-13-2',
      subsector_iaf_codigo: '13.2',
      estatus: 'Vigente',
      sitios: [],
      procesos: [],
      requisitos: [],
      noAplicables: [],
    },
  ];

  const yurima1 = makeAuditor({
    id: yurima1Id,
    nombre: 'Yurima Carrillo',
    siglas: 'YC',
    cedula_identidad: '7137643',
    codigo_credencial: 'YC',
    sin_registro_evaluacion: true,
    proxima_evaluacion_in_situ_fecha: null,
    observaciones_evaluacion: 'PENDIENTE POR EVALUACIÓN IN SITU',
    observacion_sectores: '',
    normas_acreditadas: ['ISO 9001:2015'],
    sectores_iaf: [13],
    subsectorLinks: [],
  });

  const yurima2 = makeAuditor({
    id: yurima2Id,
    nombre: 'Yurima Carrillo',
    siglas: 'YC',
    cedula_identidad: '12310919',
    codigo_credencial: 'YC',
    sin_registro_evaluacion: false,
    proxima_evaluacion_in_situ_fecha: '2020-01-01',
    observaciones_evaluacion: '',
    observacion_sectores: '',
    normas_acreditadas: ['ISO 9001:2015'],
    sectores_iaf: [13],
    subsectorLinks: [],
  });

  const nelson = makeAuditor({
    id: nelsonId,
    nombre: 'Nelson Rafael Arteaga Quevedo',
    siglas: 'NA',
    cedula_identidad: '10847521',
    codigo_credencial: 'NA',
    sin_registro_evaluacion: false,
    proxima_evaluacion_in_situ_fecha: '2028-12-31',
    observaciones_evaluacion: '',
    observacion_sectores: 'SECTOR 13 CON EXPERTO TECNICO.',
    normas_acreditadas: ['ISO 9001:2015'],
    sectores_iaf: [13],
    subsectorLinks: [
      {
        id_auditor: nelsonId,
        id_subsector_iaf: 'sub-13-2',
        id_sector_iaf: 's-13',
        sector_numero: 13,
        subsector_codigo: '13.2',
        subsector_descripcion: 'Productos farmacéuticos',
      },
    ],
  });

  const auditSec13 = makeAudit({
    id: auditSec13Id,
    id_programa_auditoria: progId,
    id_certificado: certSec13Id,
    numero_certificado: 'FN-QMS-2026-401',
    norma_codigo: 'ISO 9001:2015',
    sector_iaf: 13,
    sitiosPlan: [
      makeSitePlan('82000000-0000-0000-0000-000000000401', auditSec13Id, 0, 'Planta Química', 3.0, [
        { idAuditor: nelsonId, nombre: 'Nelson Rafael Arteaga Quevedo', rol: 'AUDITOR_LIDER', days: 1.0 },
        { idAuditor: yurima1Id, nombre: 'Yurima Carrillo', rol: 'AUDITOR', days: 1.0 },
        { idAuditor: yurima2Id, nombre: 'Yurima Carrillo', rol: 'AUDITOR', days: 1.0 },
      ]),
    ],
  });

  const prog = makeProgram(progId, 'Lote Sector 13', [auditSec13]);

  const detailUncovered = buildAuditAuditorDetail({
    activeAudit: auditSec13,
    audits: [auditSec13],
    programs: [prog],
    temporalSites: [],
    auditors: [yurima1, yurima2, nelson],
    certificados: certs,
    expertos: INITIAL_EXPERTOS_TECNICOS,
    auditExpertAssignments: [],
  });

  // Still COMPLETO despite non-blocking in-situ & observacion_sectores alerts
  assert.equal(detailUncovered.statusKey, 'COMPLETO');
  const members = detailUncovered.units[0].members;
  assert.equal(members[0].auditorNombre, 'Nelson Rafael Arteaga Quevedo (NA · C.I. 10847521)');
  assert.equal(members[0].inSituWarning, null);
  assert.equal(members[0].observacionSectorWarning?.coveredByExperto, false);
  assert.deepEqual(members[0].observacionSectorWarning?.intersectedSectors, [13]);
  assert.equal(members[1].auditorNombre, 'Yurima Carrillo (YC · C.I. 7137643)');
  assert.equal(members[1].inSituStatus, 'Pendiente Evaluación');
  assert.equal(members[1].inSituWarning, 'Ev. In Situ pendiente');
  assert.equal(members[2].auditorNombre, 'Yurima Carrillo (YC · C.I. 12310919)');
  assert.equal(members[2].inSituStatus, 'Vencido');
  assert.equal(members[2].inSituWarning, 'Ev. In Situ vencida');

  assert.equal(detailUncovered.observacionSectoresAlerts.length, 1);
  assert.equal(detailUncovered.observacionSectoresAlerts[0].coveredByExperto, false);

  // Assign Dra. Sofía Quintero (covers 13.2 / Sector 13) -> flips coveredByExperto to true
  const detailCovered = buildAuditAuditorDetail({
    activeAudit: auditSec13,
    audits: [auditSec13],
    programs: [prog],
    temporalSites: [],
    auditors: [yurima1, yurima2, nelson],
    certificados: certs,
    expertos: INITIAL_EXPERTOS_TECNICOS,
    auditExpertAssignments: [
      {
        id: '1e300000-0000-0000-0000-000000000401',
        id_auditoria: auditSec13Id,
        id_experto_tecnico: INITIAL_EXPERTOS_TECNICOS[0].id,
        experto_nombre: INITIAL_EXPERTOS_TECNICOS[0].nombre,
        experto_estatus: 'Disponible',
        dias_asignados: 0.5,
        observacion: 'Acompañamiento Sector 13',
        deleted_at: null,
      },
    ],
  });

  assert.equal(detailCovered.observacionSectoresAlerts.length, 1);
  assert.equal(detailCovered.observacionSectoresAlerts[0].coveredByExperto, true);
  assert.equal(
    detailCovered.observacionSectoresAlerts[0].coveringExpertNames.includes(
      INITIAL_EXPERTOS_TECNICOS[0].nombre
    ),
    true
  );

  // Non-intersecting sector (Sector 17) must NOT trigger Sector 13 alert
  const auditSec17 = makeAudit({
    id: '80000000-0000-0000-0000-000000000402',
    id_programa_auditoria: progId,
    id_certificado: '40000000-0000-0000-0000-000000000402',
    sector_iaf: 17,
    sitiosPlan: [
      makeSitePlan('82000000-0000-0000-0000-000000000402', '80000000-0000-0000-0000-000000000402', 0, 'Planta 17', 1.0, [
        { idAuditor: nelsonId, nombre: 'Nelson Rafael Arteaga Quevedo', rol: 'AUDITOR_LIDER', days: 1.0 },
      ]),
    ],
  });
  const detailSec17 = buildAuditAuditorDetail({
    activeAudit: auditSec17,
    audits: [auditSec17],
    programs: [makeProgram(progId, 'Lote 17', [auditSec17])],
    temporalSites: [],
    auditors: [nelson],
    certificados: [],
    expertos: [],
  });
  assert.equal(detailSec17.observacionSectoresAlerts.length, 0);
});


