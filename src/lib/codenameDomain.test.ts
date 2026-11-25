import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIT_TYPE_SHORT_ABBREVIATIONS,
  countExistingIndividualAudits,
  countExistingLinkedAudits,
  formatAuditCodename,
  formatAuditCounter4,
  formatAuditDisplayWithCode,
  formatAuditPeriodShort,
  formatAuditTypeShortLabel,
  formatIndividualAuditCodenameCode,
  formatLinkedAuditCodenameCode,
  generateNextIndividualAuditCodenamesBatch,
  generateNextLinkedAuditCodename,
  getAuditCodenameTooltip,
  isStructuredAuditCodename,
  resolveAuditTargetYearForCodename,
  resolveShortConglomeradoName,
  resolveShortOrganizacionName,
} from './codenameDomain';
import type { AuditDateEntry } from './auditPlanningEngine';
import { containsRawUuid } from './zeroUuid';

test('Step 1.2: formatAuditTypeShortLabel maps all 9 standard types (case & accent insensitive) and prioritizes explicitAbrev', () => {
  assert.equal(Object.keys(AUDIT_TYPE_SHORT_ABBREVIATIONS).length, 9);

  const cases: Array<[string, string]> = [
    ['Etapa 1', 'Et.1'],
    ['etapa 1', 'Et.1'],
    ['ETAPA 2', 'Et.2'],
    ['Seguimiento 1', 'Seg.1'],
    ['seguimiento 2', 'Seg.2'],
    ['Renovación', 'Renov.'],
    ['renovacion', 'Renov.'],
    ['Diagnóstico', 'Diag.'],
    ['DIAGNOSTICO', 'Diag.'],
    ['Extraordinaria', 'Extra.'],
    ['Especial', 'Esp.'],
    ['Otro', 'Otro'],
  ];

  for (const [input, expected] of cases) {
    assert.equal(formatAuditTypeShortLabel(input), expected);
  }

  // explicitAbrev from BD overrides the canonical fallback map
  assert.equal(formatAuditTypeShortLabel('Etapa 1', 'Est.1'), 'Est.1');
  assert.equal(formatAuditTypeShortLabel('Seguimiento 1', '  Seg.1  '), 'Seg.1');

  // Empty explicitAbrev falls back to canonical map
  assert.equal(formatAuditTypeShortLabel('Renovación', '   '), 'Renov.');

  // Unknown custom type generates clean truncated fallback without UUIDs
  const custom = formatAuditTypeShortLabel('Pre-Evaluación Extendida');
  assert.ok(custom.length <= 8);
  assert.equal(containsRawUuid(custom), false);

  // UUIDs injected into explicitAbrev or tipoNombre are ignored/stripped
  const uuid = '40000000-0000-0000-0000-000000000001';
  assert.equal(formatAuditTypeShortLabel('Etapa 2', uuid), 'Et.2');
  assert.equal(containsRawUuid(formatAuditTypeShortLabel(`Aud ${uuid}`)), false);
});

test('Step 1.2: formatAuditCodename handles REAL, PROGRAMADA_EXACTA, PREPROGRAMADA_MES, and Sin fecha', () => {
  const realDate: AuditDateEntry = {
    id: 'f-real',
    id_auditoria: 'a-1',
    numero_secuencia: 1,
    tag: 'Programación',
    tipo_fecha: 'REAL',
    anio: null,
    mes: null,
    fecha_inicio: '2026-11-18',
    fecha_fin: '2026-11-20',
  };
  assert.equal(
    formatAuditCodename({
      tipo_auditoria: 'Seguimiento 1',
      fechas: [realDate],
      codigo_auditoria: 'AUD-2026-001',
    }),
    '2026-11 Seg.1'
  );

  const exactDate: AuditDateEntry = {
    id: 'f-exact',
    id_auditoria: 'a-2',
    numero_secuencia: 1,
    tag: 'Programación',
    tipo_fecha: 'PROGRAMADA_EXACTA',
    anio: null,
    mes: null,
    fecha_inicio: '2026-04-07',
    fecha_fin: '2026-04-09',
  };
  assert.equal(
    formatAuditCodename({
      tipo_auditoria: 'Etapa 2',
      fechas: [exactDate],
    }),
    '2026-04 Et.2'
  );

  const preprogDate: AuditDateEntry = {
    id: 'f-pre',
    id_auditoria: 'a-3',
    numero_secuencia: 1,
    tag: 'Programación',
    tipo_fecha: 'PREPROGRAMADA_MES',
    anio: 2026,
    mes: 7,
    fecha_inicio: null,
    fecha_fin: null,
  };
  assert.equal(
    formatAuditCodename({
      tipo_auditoria: 'Renovación',
      fechas: [preprogDate],
    }),
    '2026-07 Renov.'
  );

  assert.equal(
    formatAuditCodename({
      tipo_auditoria: 'Diagnóstico',
      fechas: [],
      fecha_inicio: '',
      fecha_reprogramacion: null,
    }),
    'Sin fecha Diag.'
  );

  // Fallback to flat dates when fechas[] is omitted
  assert.equal(
    formatAuditPeriodShort({
      fecha_inicio: '2025-09-10',
      fecha_reprogramacion: '2025-10-02',
    }),
    '2025-10'
  );
});

test('Step 1.2: formatAuditCodename prioritizes highest active numero_secuencia over earlier dates', () => {
  const seq1: AuditDateEntry = {
    id: 'f-1',
    id_auditoria: 'a-10',
    numero_secuencia: 1,
    tag: 'Programación',
    tipo_fecha: 'PREPROGRAMADA_MES',
    anio: 2026,
    mes: 3,
    fecha_inicio: null,
    fecha_fin: null,
    deleted_at: null,
  };
  const seq2: AuditDateEntry = {
    id: 'f-2',
    id_auditoria: 'a-10',
    numero_secuencia: 2,
    tag: 'Reprogramación',
    tipo_fecha: 'PROGRAMADA_EXACTA',
    anio: null,
    mes: null,
    fecha_inicio: '2026-08-14',
    fecha_fin: '2026-08-15',
    deleted_at: null,
  };
  const seq3Deleted: AuditDateEntry = {
    id: 'f-3',
    id_auditoria: 'a-10',
    numero_secuencia: 3,
    tag: 'Reprogramación',
    tipo_fecha: 'REAL',
    anio: null,
    mes: null,
    fecha_inicio: '2027-01-05',
    fecha_fin: '2027-01-06',
    deleted_at: '2026-09-01T00:00:00Z',
  };

  assert.equal(
    formatAuditCodename({
      tipo_auditoria: 'Seguimiento 2',
      fechas: [seq1, seq3Deleted, seq2],
      codigo_auditoria: 'AUD-2026-010',
    }),
    '2026-08 Seg.2'
  );

  const tooltip = getAuditCodenameTooltip({
    tipo_auditoria: 'Seguimiento 2',
    fechas: [seq1, seq2],
    codigo_auditoria: 'AUD-2026-010',
  });
  assert.ok(tooltip.includes('AUD-2026-010'));
  assert.ok(tooltip.includes('Seguimiento 2'));
  assert.equal(containsRawUuid(tooltip), false);

  const withCode = formatAuditDisplayWithCode({
    tipo_auditoria: 'Seguimiento 2',
    fechas: [seq2],
    codigo_auditoria: 'AUD-2026-010',
  });
  assert.equal(withCode, '2026-08 Seg.2 (AUD-2026-010)');
});

test('Step 1.2: resolveShortConglomeradoName and resolveShortOrganizacionName respect abreviacion, compact prefixes/suffixes, and avoid UUIDs', () => {
  assert.equal(
    resolveShortConglomeradoName({
      nombre: 'Grupo Industrial Iberometal',
      abreviacion: 'Iberometal',
      codigo_grupo: 'CONG-IND-01',
    }),
    'Iberometal'
  );

  const congNoAbrev = resolveShortConglomeradoName({
    nombre: 'Grupo Industrial Iberometal',
    abreviacion: null,
  });
  assert.equal(congNoAbrev, 'Iberometal');
  assert.ok(congNoAbrev.length <= 22);

  const congAlimentos = resolveShortConglomeradoName({
    nombre: 'Corporación Alimentaria del Sur',
  });
  assert.equal(congAlimentos, 'Alimentaria del Sur');
  assert.ok(congAlimentos.length <= 22);

  assert.equal(
    resolveShortOrganizacionName({
      nombre: 'Iberometal Componentes S.A.',
      abreviacion: 'Iberometal Comp.',
    }),
    'Iberometal Comp.'
  );

  const orgNoAbrev = resolveShortOrganizacionName({
    nombre: 'CyberCloud Solutions S.L.',
    abreviacion: '',
  });
  assert.equal(orgNoAbrev, 'CyberCloud Solutions');
  assert.ok(orgNoAbrev.length <= 22);

  const orgLong = resolveShortOrganizacionName({
    nombre: 'Procesadora Agroindustrial Metropolitana de Alimentos C.A.',
  });
  assert.ok(orgLong.length <= 22);
  assert.equal(containsRawUuid(orgLong), false);

  // Zero-UUID protection when UUIDs appear in name or abreviacion
  const rawUuid = '20000000-0000-0000-0000-000000000001';
  const safeCong = resolveShortConglomeradoName({
    nombre: rawUuid,
    abreviacion: rawUuid,
    codigo_grupo: 'CONG-SAFE-01',
  });
  assert.equal(safeCong, 'CONG-SAFE-01');
  assert.equal(containsRawUuid(safeCong), false);

  const safeOrg = resolveShortOrganizacionName({
    nombre: rawUuid,
    abreviacion: rawUuid,
  });
  assert.equal(safeOrg, 'Organización');
  assert.equal(containsRawUuid(safeOrg), false);
});

test('AUD-AAAA-BBBB-YYYY & L-AUD-AAAA-BBBB-YYYY: counts all statuses (including Cancelada), year scoping, batch sequential increments, and 4+ digit padding', () => {
  assert.equal(formatAuditCounter4(1), '0001');
  assert.equal(formatAuditCounter4(42), '0042');
  assert.equal(formatAuditCounter4(10005), '10005');
  assert.equal(formatIndividualAuditCodenameCode(3, 2, 2028), 'AUD-0003-0002-2028');
  assert.equal(formatLinkedAuditCodenameCode(1, 1, 2028), 'L-AUD-0001-0001-2028');
  assert.equal(isStructuredAuditCodename('AUD-0001-0001-2028'), true);
  assert.equal(isStructuredAuditCodename('L-AUD-0001-0001-2028'), true);
  assert.equal(isStructuredAuditCodename('PROG-2026-001'), false);

  const existingAudits = [
    // Year 2027 - Closed
    {
      id: 'a-1',
      codigo_auditoria: 'AUD-0001-0001-2027',
      estado_ciclo: 'Cerrada',
      fecha_inicio: '2027-04-10',
      deleted_at: null,
    },
    // Year 2028 - Cancelled (MUST still be counted!)
    {
      id: 'a-2',
      codigo_auditoria: 'AUD-0002-0001-2028',
      estado_ciclo: 'Cancelada',
      fechas: [
        {
          id: 'f-2',
          id_auditoria: 'a-2',
          numero_secuencia: 1,
          tag: 'Programación' as const,
          tipo_fecha: 'PREPROGRAMADA_MES' as const,
          anio: 2028,
          mes: 5,
          fecha_inicio: null,
          fecha_fin: null,
          deleted_at: null,
        },
      ],
      deleted_at: null,
    },
    // Year 2028 - Pending (never executed)
    {
      id: 'a-3',
      codigo_auditoria: 'AUD-0003-0002-2028',
      estado_ciclo: 'En Programación',
      fecha_inicio: '2028-09-12',
      deleted_at: null,
    },
    // Duplicate id should not double count
    {
      id: 'a-3',
      codigo_auditoria: 'AUD-0003-0002-2028',
      estado_ciclo: 'En Programación',
      fecha_inicio: '2028-09-12',
      deleted_at: null,
    },
    // Soft-deleted row excluded from counter
    {
      id: 'a-del',
      codigo_auditoria: 'AUD-9999-9999-2028',
      estado_ciclo: 'Cancelada',
      fecha_inicio: '2028-01-01',
      deleted_at: '2026-01-01T00:00:00Z',
    },
  ];

  assert.equal(resolveAuditTargetYearForCodename(existingAudits[1]), 2028);
  const indiv2028 = countExistingIndividualAudits(existingAudits, 2028);
  assert.deepEqual(indiv2028, { totalAllTime: 3, totalInYear: 2 });

  const batch2028 = generateNextIndividualAuditCodenamesBatch({
    existingAudits,
    targetYear: 2028,
    count: 3,
  });
  assert.deepEqual(batch2028, [
    'AUD-0004-0003-2028',
    'AUD-0005-0004-2028',
    'AUD-0006-0005-2028',
  ]);
  for (const code of batch2028) {
    assert.ok(code.length <= 40);
  }

  // Existing linked programs: 1 in 2027 spanning 1 cert, 1 in 2028 spanning 2 certs (1 cancelled) -> total 2, in 2028: 1
  const existingPrograms = [
    {
      id: 'p-1',
      codigo_programa: 'L-AUD-0001-0001-2027',
      auditorias: [existingAudits[0]],
      deleted_at: null,
    },
    {
      id: 'p-2',
      codigo_programa: 'L-AUD-0002-0001-2028',
      auditorias: [existingAudits[1], existingAudits[2]],
      deleted_at: null,
    },
  ];
  assert.deepEqual(countExistingLinkedAudits(existingPrograms, 2028), {
    totalAllTime: 2,
    totalInYear: 1,
  });

  const nextLinked2028 = generateNextLinkedAuditCodename({
    existingPrograms,
    targetYear: 2028,
  });
  assert.equal(nextLinked2028, 'L-AUD-0003-0002-2028');
  assert.ok(nextLinked2028.length <= 40);

  // Target year with zero previous audits in that year (2030) resets BBBB to 0001 while AAAA continues
  assert.equal(
    generateNextLinkedAuditCodename({ existingPrograms, targetYear: 2030 }),
    'L-AUD-0003-0001-2030'
  );
  assert.deepEqual(
    generateNextIndividualAuditCodenamesBatch({
      existingAudits,
      targetYear: 2030,
      count: 2,
    }),
    ['AUD-0004-0001-2030', 'AUD-0005-0002-2030']
  );

  // Collision avoidance skips reserved/existing codes cleanly
  assert.deepEqual(
    generateNextIndividualAuditCodenamesBatch({
      existingAudits,
      targetYear: 2028,
      count: 2,
      reservedCodes: ['AUD-0004-0003-2028'],
    }),
    ['AUD-0005-0004-2028', 'AUD-0006-0005-2028']
  );
});

