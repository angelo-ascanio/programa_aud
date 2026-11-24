import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIT_TYPE_SHORT_ABBREVIATIONS,
  formatAuditCodename,
  formatAuditDisplayWithCode,
  formatAuditPeriodShort,
  formatAuditTypeShortLabel,
  getAuditCodenameTooltip,
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
