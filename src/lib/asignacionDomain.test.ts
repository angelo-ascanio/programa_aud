import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAuditAuditorDetail,
  buildCampaignAsignacionRows,
  buildCertificateAuditorRows,
  evaluateAuditorCompetencyMatch,
  isAuditableUnitExactlyBalanced,
  validateAuditorTimeAssignment,
} from './asignacionDomain';
import type {
  AuditoriaSitioPlanItem,
  ProgramaAuditoriaEntity,
} from './auditPlanningEngine';
import type { ProgramacionAuditEntity } from './auditExecution';
import type { AuditorDetailEntity } from './competencyMatrix';
import type { AuditoriaSitioTemporalEntity } from './designacionTemporalDomain';
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
    sector_iaf: 17,
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
