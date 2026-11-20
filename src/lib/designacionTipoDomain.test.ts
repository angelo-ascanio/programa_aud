import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveLatestPlannedDate,
  resolveLatestRealExecutionDate,
  validateAuditDateEntryInput,
  type AuditDateEntry,
  type ProgramaAuditoriaEntity,
} from './auditPlanningEngine';
import {
  buildCampaignStep3Rows,
  buildNextReprogramDateSequence,
  computeAuditUrgencyClassification,
  matchesTipoQueuePreset,
  requiresFutureYearWarning,
  validateStep3NewCycleDraft,
  type Step3NewCycleDraft,
} from './designacionTipoDomain';
import type { ProgramacionAuditEntity } from './auditExecution';
import type { VinculoEntity } from './vinculoDomain';

const UUID_VINCULO = '7c000000-0000-0000-0000-000000000003';
const UUID_GRUPO = '20000000-0000-0000-0000-000000000001';
const UUID_ORG = '30000000-0000-0000-0000-000000000001';
const UUID_CERT_1 = '40000000-0000-0000-0000-000000000004';
const UUID_CERT_2 = '40000000-0000-0000-0000-000000000005';
const UUID_TIPO_SEG1 = 'b0000000-0000-0000-0000-000000000003';
const UUID_TIPO_REN = 'b0000000-0000-0000-0000-000000000005';

function makeVinculo(): VinculoEntity {
  return {
    id: UUID_VINCULO,
    id_grupo_empresarial: UUID_GRUPO,
    grupo_nombre: 'Grupo Industrial Iberometal',
    codigo_vinculo: 'VINC-N1-01',
    etiqueta: 'Planta Santa Cruz Integrado',
    nivel_vinculacion: 'NIVEL_1_INTRA_ORG',
    tipo_vinculacion: 'Integrada',
    es_vinculada: true,
    tiene_sitio_temporal: false,
    notas: null,
    deleted_at: null,
    certificados: [
      {
        id: '26000000-0000-0000-0000-000000000001',
        id_vinculo: UUID_VINCULO,
        id_certificado: UUID_CERT_1,
        numero_certificado: 'FN-QMS-2025-004',
        norma_codigo: 'ISO 9001:2015',
        id_organizacion: UUID_ORG,
        organizacion_nombre: 'Example, C.A.',
        estatus: 'ACTIVO',
        deleted_at: null,
      },
      {
        id: '26000000-0000-0000-0000-000000000002',
        id_vinculo: UUID_VINCULO,
        id_certificado: UUID_CERT_2,
        numero_certificado: 'FN-EMS-2025-005',
        norma_codigo: 'ISO 14001:2015',
        id_organizacion: UUID_ORG,
        organizacion_nombre: 'Example, C.A.',
        estatus: 'ACTIVO',
        deleted_at: null,
      },
    ],
  };
}

function makeAudit(overrides: Partial<ProgramacionAuditEntity>): ProgramacionAuditEntity {
  return {
    id: '80000000-0000-0000-0000-000000000001',
    id_programa_auditoria: '7a000000-0000-0000-0000-000000000001',
    codigo_auditoria: 'AUD-TEST-001',
    id_certificado: UUID_CERT_1,
    numero_certificado: 'FN-QMS-2025-004',
    id_organizacion: UUID_ORG,
    organizacion_nombre: 'Example, C.A.',
    norma_codigo: 'ISO 9001:2015',
    id_tipo_auditoria: UUID_TIPO_SEG1,
    tipo_auditoria: 'Seguimiento 1',
    metodologia: 'Presencial',
    fecha_inicio: '2026-06-10',
    fecha_fin: '2026-06-12',
    dias_auditor: 3,
    tiempo_auditoria: 3,
    estado_ciclo: 'Programada',
    estatus_ejecucion: 'Programada',
    objetivo: 'Seguimiento anual.',
    equipo: [],
    sitios: [],
    sitiosPlan: [],
    fechas: [],
    verificaciones: [],
    hallazgos: [],
    recomendacion: null,
    comentarios: [],
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
    id_vinculo: UUID_VINCULO,
    id_grupo_empresarial: UUID_GRUPO,
    codigo_programa: `PROG-${id.slice(-4)}`,
    etiqueta,
    nivel_vinculacion: 'NIVEL_1_INTRA_ORG',
    tipo_vinculacion: 'Integrada',
    es_vinculada: true,
    tiene_sitio_temporal: false,
    auditorias,
    deleted_at: null,
  };
}

test('Step 3.2: resolveLatestPlannedDate vs resolveLatestRealExecutionDate and Step 3 allowReal gate', () => {
  const fechas: AuditDateEntry[] = [
    {
      id: '81000000-0000-0000-0000-000000000001',
      id_auditoria: '80000000-0000-0000-0000-000000000001',
      numero_secuencia: 1,
      tag: 'Programación',
      tipo_fecha: 'PREPROGRAMADA_MES',
      anio: 2026,
      mes: 6,
      fecha_inicio: null,
      fecha_fin: null,
      deleted_at: null,
    },
    {
      id: '81000000-0000-0000-0000-000000000002',
      id_auditoria: '80000000-0000-0000-0000-000000000001',
      numero_secuencia: 2,
      tag: 'Reprogramación',
      tipo_fecha: 'PROGRAMADA_EXACTA',
      anio: null,
      mes: null,
      fecha_inicio: '2026-06-15',
      fecha_fin: '2026-06-17',
      deleted_at: null,
    },
    {
      id: '81000000-0000-0000-0000-000000000003',
      id_auditoria: '80000000-0000-0000-0000-000000000001',
      numero_secuencia: 3,
      tag: 'Programación',
      tipo_fecha: 'REAL',
      anio: null,
      mes: null,
      fecha_inicio: '2026-06-16',
      fecha_fin: '2026-06-18',
      deleted_at: null,
    },
  ];

  const latestPlanned = resolveLatestPlannedDate(fechas);
  const latestReal = resolveLatestRealExecutionDate(fechas);

  assert.equal(latestPlanned?.id, '81000000-0000-0000-0000-000000000002');
  assert.equal(latestPlanned?.tipo_fecha, 'PROGRAMADA_EXACTA');
  assert.equal(latestReal?.id, '81000000-0000-0000-0000-000000000003');
  assert.equal(latestReal?.tipo_fecha, 'REAL');

  const okExact = validateAuditDateEntryInput(
    {
      tipo_fecha: 'PROGRAMADA_EXACTA',
      fecha_inicio: '2026-10-05',
      fecha_fin: '2026-10-07',
    },
    { allowReal: false }
  );
  assert.equal(okExact.valid, true);

  const blockedRealStep3 = validateAuditDateEntryInput(
    {
      tipo_fecha: 'REAL',
      fecha_inicio: '2026-10-05',
      fecha_fin: '2026-10-07',
    },
    { allowReal: false }
  );
  assert.equal(blockedRealStep3.valid, false);
  assert.match(blockedRealStep3.error || '', /Paso 3/i);
});

test('Step 3.2: computeAuditUrgencyClassification revivifies ANIO_MAS_1 -> PROXIMA_30D -> VENCIDA as referenceIsoDate advances', () => {
  const preprogrammedMay2027: AuditDateEntry = {
    id: '81000000-0000-0000-0000-000000000014',
    id_auditoria: '80000000-0000-0000-0000-000000000009',
    numero_secuencia: 1,
    tag: 'Programación',
    tipo_fecha: 'PREPROGRAMADA_MES',
    anio: 2027,
    mes: 5,
    fecha_inicio: null,
    fecha_fin: null,
    deleted_at: null,
  };

  // In 2026-06-01 -> ANIO_MAS_1 (rank 4, isFutureTrapRisk = true)
  const in2026 = computeAuditUrgencyClassification(preprogrammedMay2027, 'Programada', '2026-06-01');
  assert.equal(in2026.bucket, 'ANIO_MAS_1');
  assert.equal(in2026.rank, 4);
  assert.equal(in2026.isFutureTrapRisk, true);
  assert.equal(in2026.effectiveStartIso, '2027-05-01');
  assert.equal(in2026.effectiveEndIso, '2027-05-31');
  const warning = requiresFutureYearWarning(in2026);
  assert.ok(warning && warning.includes('2027'));

  // Advance system date to 2027-04-10 (21 days before 2027-05-01) -> revivified to PROXIMA_30D
  const revivified = computeAuditUrgencyClassification(
    preprogrammedMay2027,
    'Programada',
    '2027-04-10'
  );
  assert.equal(revivified.bucket, 'PROXIMA_30D');
  assert.equal(revivified.rank, 1);
  assert.equal(revivified.isFutureTrapRisk, false);
  assert.equal(requiresFutureYearWarning(revivified), null);

  // Advance past end of May 2027 -> VENCIDA
  const overdue = computeAuditUrgencyClassification(
    preprogrammedMay2027,
    'Programada',
    '2027-06-05'
  );
  assert.equal(overdue.bucket, 'VENCIDA');
  assert.equal(overdue.rank, 0);
  assert.equal(overdue.isFutureTrapRisk, false);
});

test('Step 3.2: buildCampaignStep3Rows sorts PROXIMA_30D (2026) above FUTURO_LEJANO (2029)', () => {
  const vinculo = makeVinculo();
  const future2029Program = makeProgram('7a000000-0000-0000-0000-000000000099', 'Ciclo 2029', [
    makeAudit({
      id: '80000000-0000-0000-0000-000000000099',
      fechas: [
        {
          id: '81000000-0000-0000-0000-000000000099',
          id_auditoria: '80000000-0000-0000-0000-000000000099',
          numero_secuencia: 1,
          tag: 'Programación',
          tipo_fecha: 'PREPROGRAMADA_MES',
          anio: 2029,
          mes: 8,
          fecha_inicio: null,
          fecha_fin: null,
          deleted_at: null,
        },
      ],
    }),
  ]);

  const imminent2026Program = makeProgram('7a000000-0000-0000-0000-000000000026', 'Ciclo 2026 Próximo', [
    makeAudit({
      id: '80000000-0000-0000-0000-000000000026',
      fechas: [
        {
          id: '81000000-0000-0000-0000-000000000026',
          id_auditoria: '80000000-0000-0000-0000-000000000026',
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
    }),
  ]);

  // Input intentionally places 2029 before 2026
  const rows = buildCampaignStep3Rows([future2029Program, imminent2026Program], [vinculo], '2026-06-01');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].program.id, imminent2026Program.id);
  assert.equal(rows[0].urgency.bucket, 'PROXIMA_30D');
  assert.equal(rows[1].program.id, future2029Program.id);
  assert.equal(rows[1].urgency.bucket, 'FUTURO_LEJANO');
  assert.equal(rows[0].step3Complete, true);
});

test('Step 3.2: matchesTipoQueuePreset hides +1/+2 future cycles in PROXIMAS and shows them in FUTURO and TODAS', () => {
  const vinculo = makeVinculo();
  const imminentProgram = makeProgram('7a000000-0000-0000-0000-000000000010', 'Vigente 2026', [
    makeAudit({
      id: '80000000-0000-0000-0000-000000000010',
      fechas: [
        {
          id: '81000000-0000-0000-0000-000000000010',
          id_auditoria: '80000000-0000-0000-0000-000000000010',
          numero_secuencia: 1,
          tag: 'Programación',
          tipo_fecha: 'PROGRAMADA_EXACTA',
          anio: null,
          mes: null,
          fecha_inicio: '2026-06-18',
          fecha_fin: '2026-06-20',
          deleted_at: null,
        },
      ],
    }),
  ]);
  const plus1Program = makeProgram('7a000000-0000-0000-0000-000000000011', 'Ciclo Año +1', [
    makeAudit({
      id: '80000000-0000-0000-0000-000000000011',
      fechas: [
        {
          id: '81000000-0000-0000-0000-000000000011',
          id_auditoria: '80000000-0000-0000-0000-000000000011',
          numero_secuencia: 1,
          tag: 'Programación',
          tipo_fecha: 'PREPROGRAMADA_MES',
          anio: 2027,
          mes: 6,
          fecha_inicio: null,
          fecha_fin: null,
          deleted_at: null,
        },
      ],
    }),
  ]);
  const plus2Program = makeProgram('7a000000-0000-0000-0000-000000000012', 'Ciclo Año +2', [
    makeAudit({
      id: '80000000-0000-0000-0000-000000000012',
      fechas: [
        {
          id: '81000000-0000-0000-0000-000000000012',
          id_auditoria: '80000000-0000-0000-0000-000000000012',
          numero_secuencia: 1,
          tag: 'Programación',
          tipo_fecha: 'PREPROGRAMADA_MES',
          anio: 2028,
          mes: 6,
          fecha_inicio: null,
          fecha_fin: null,
          deleted_at: null,
        },
      ],
    }),
  ]);

  const rows = buildCampaignStep3Rows(
    [imminentProgram, plus1Program, plus2Program],
    [vinculo],
    '2026-06-01'
  );

  const proximas = rows.filter((r) => matchesTipoQueuePreset(r, 'PROXIMAS'));
  const futuro = rows.filter((r) => matchesTipoQueuePreset(r, 'FUTURO'));
  const preprogramadas = rows.filter((r) => matchesTipoQueuePreset(r, 'PREPROGRAMADAS'));
  const todas = rows.filter((r) => matchesTipoQueuePreset(r, 'TODAS'));

  assert.deepEqual(
    proximas.map((r) => r.program.id),
    [imminentProgram.id]
  );
  assert.deepEqual(
    futuro.map((r) => r.program.id),
    [plus1Program.id, plus2Program.id]
  );
  assert.deepEqual(
    preprogramadas.map((r) => r.program.id),
    [plus1Program.id, plus2Program.id]
  );
  assert.equal(todas.length, 3);
});

test('Step 3.2: validateStep3NewCycleDraft requires valid id_tipo_auditoria per cert and rejects inverted dates', () => {
  const vinculo = makeVinculo();
  const baseDraft: Step3NewCycleDraft = {
    id_vinculo: UUID_VINCULO,
    codigo_programa: 'PROG-2027-01',
    etiqueta: 'Ciclo 2027 Planta Santa Cruz',
    dateMode: 'PROGRAMADA_EXACTA',
    anio: 2027,
    mes: 5,
    fecha_inicio: '2027-05-10',
    fecha_fin: '2027-05-12',
    observacion: 'Programación anual.',
    certTypes: [
      {
        id_certificado: UUID_CERT_1,
        numero_certificado: 'FN-QMS-2025-004',
        organizacion_nombre: 'Example, C.A.',
        norma_codigo: 'ISO 9001:2015',
        id_tipo_auditoria: UUID_TIPO_SEG1,
      },
      {
        id_certificado: UUID_CERT_2,
        numero_certificado: 'FN-EMS-2025-005',
        organizacion_nombre: 'Example, C.A.',
        norma_codigo: 'ISO 14001:2015',
        id_tipo_auditoria: UUID_TIPO_REN,
      },
    ],
  };

  assert.equal(validateStep3NewCycleDraft(baseDraft, [vinculo]), null);

  // Inverted exact dates must fail
  const invertedErr = validateStep3NewCycleDraft(
    { ...baseDraft, fecha_inicio: '2027-05-15', fecha_fin: '2027-05-12' },
    [vinculo]
  );
  assert.ok(invertedErr && /anterior/i.test(invertedErr));

  // Missing id_tipo_auditoria on second certificate must fail without exposing UUIDs
  const missingTypeErr = validateStep3NewCycleDraft(
    {
      ...baseDraft,
      certTypes: [
        baseDraft.certTypes[0],
        { ...baseDraft.certTypes[1], id_tipo_auditoria: '' },
      ],
    },
    [vinculo]
  );
  assert.ok(missingTypeErr && missingTypeErr.includes('FN-EMS-2025-005'));
  assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}-/i.test(missingTypeErr || ''), false);

  // Missing certificate from link must fail
  const missingCertErr = validateStep3NewCycleDraft(
    { ...baseDraft, certTypes: [baseDraft.certTypes[0]] },
    [vinculo]
  );
  assert.ok(missingCertErr && missingCertErr.includes('FN-EMS-2025-005'));
});

test('Step 3.2: buildNextReprogramDateSequence increments 1 -> 2 -> 3 while ignoring archived rows', () => {
  assert.equal(buildNextReprogramDateSequence([]), 1);

  const seq1: AuditDateEntry = {
    id: '81000000-0000-0000-0000-000000000001',
    id_auditoria: '80000000-0000-0000-0000-000000000001',
    numero_secuencia: 1,
    tag: 'Programación',
    tipo_fecha: 'PREPROGRAMADA_MES',
    anio: 2026,
    mes: 7,
    fecha_inicio: null,
    fecha_fin: null,
    deleted_at: null,
  };
  assert.equal(buildNextReprogramDateSequence([seq1]), 2);

  const seq2: AuditDateEntry = {
    ...seq1,
    id: '81000000-0000-0000-0000-000000000002',
    numero_secuencia: 2,
    tag: 'Reprogramación',
    tipo_fecha: 'PROGRAMADA_EXACTA',
    anio: null,
    mes: null,
    fecha_inicio: '2026-07-10',
    fecha_fin: '2026-07-12',
  };
  const archivedSeq9: AuditDateEntry = {
    ...seq2,
    id: '81000000-0000-0000-0000-000000000009',
    numero_secuencia: 9,
    deleted_at: '2026-06-01T12:00:00Z',
  };
  assert.equal(buildNextReprogramDateSequence([seq1, seq2, archivedSeq9]), 3);
});
