import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractUniqueStandards,
  extractUniqueStatuses,
  filterCertificateRecords,
  formatMatchCountText,
  getCoverageVisual,
  getOperationalStatusVisual,
  getStoredViewMode,
  matchesSearchCriteria,
  normalizeSearchToken,
  setStoredViewMode,
  SAMPLE_CERTIFICATE_RECORDS,
  type CertificateRecord,
} from './searchControls';

test('normalizeSearchToken handles accents, whitespace, and case', () => {
  assert.equal(normalizeSearchToken('  Iberometal  '), 'iberometal');
  assert.equal(normalizeSearchToken('Petroquímica'), 'petroquimica');
  assert.equal(normalizeSearchToken('FN-QMS-2024-001'), 'fn-qms-2024-001');
  assert.equal(normalizeSearchToken(''), '');
  assert.equal(normalizeSearchToken(null), '');
});

test('matchesSearchCriteria filters by Certificate Code / Number', () => {
  const sample = SAMPLE_CERTIFICATE_RECORDS[0]; // FN-QMS-2024-001
  assert.equal(matchesSearchCriteria(sample, 'FN-QMS'), true);
  assert.equal(matchesSearchCriteria(sample, '2024-001'), true);
  assert.equal(matchesSearchCriteria(sample, 'fn-qms-2024-001'), true);
  assert.equal(matchesSearchCriteria(sample, 'FN-EMS-999'), false);
});

test('matchesSearchCriteria filters by Company / Organization Name', () => {
  const sample = SAMPLE_CERTIFICATE_RECORDS[0]; // Iberometal Componentes S.A.
  assert.equal(matchesSearchCriteria(sample, 'Iberometal'), true);
  assert.equal(matchesSearchCriteria(sample, 'iberometal componentes'), true);
  assert.equal(matchesSearchCriteria(sample, 'Componentes'), true);
  assert.equal(matchesSearchCriteria(sample, 'CyberCloud'), false);
});

test('matchesSearchCriteria filters by Tax ID / RIF with and without dashes', () => {
  const sample = SAMPLE_CERTIFICATE_RECORDS[0]; // J-30492817-0
  assert.equal(matchesSearchCriteria(sample, 'J-30492817-0'), true);
  assert.equal(matchesSearchCriteria(sample, '30492817'), true);
  assert.equal(matchesSearchCriteria(sample, 'J304928170'), true);
  assert.equal(matchesSearchCriteria(sample, 'J-40819234'), false);
});

test('filterCertificateRecords handles simultaneous search and status/standard facets', () => {
  const records = SAMPLE_CERTIFICATE_RECORDS;

  // Search only
  const byCode = filterCertificateRecords(records, {
    query: 'FN-EMS',
    selectedStatus: 'ALL',
    selectedStandard: 'ALL',
  });
  assert.equal(byCode.length, 1);
  assert.equal(byCode[0].numero_certificado, 'FN-EMS-2024-002');

  // Status facet only
  const activeOnly = filterCertificateRecords(records, {
    query: '',
    selectedStatus: 'ACTIVO',
    selectedStandard: 'ALL',
  });
  assert.equal(activeOnly.length, 2); // Iberometal & CyberCloud ISMS

  // Standard facet only
  const iso9001Only = filterCertificateRecords(records, {
    query: '',
    selectedStatus: 'ALL',
    selectedStandard: 'ISO 9001:2015',
  });
  assert.equal(iso9001Only.length, 1);
  assert.equal(iso9001Only[0].numero_certificado, 'FN-QMS-2024-001');

  // Combined: CyberCloud + ACTIVO -> should match FN-ISMS-2024-007, not FN-EMS-2024-002 (EN_PROCESO)
  const combined = filterCertificateRecords(records, {
    query: 'CyberCloud',
    selectedStatus: 'ACTIVO',
    selectedStandard: 'ALL',
  });
  assert.equal(combined.length, 1);
  assert.equal(combined[0].numero_certificado, 'FN-ISMS-2024-007');

  // Impossible filter combination returns empty array
  const empty = filterCertificateRecords(records, {
    query: 'Iberometal',
    selectedStatus: 'SUSPENDIDO',
    selectedStandard: 'ALL',
  });
  assert.equal(empty.length, 0);
});

test('extractUniqueStatuses and extractUniqueStandards return distinct sorted values', () => {
  const statuses = extractUniqueStatuses(SAMPLE_CERTIFICATE_RECORDS);
  assert.deepEqual(statuses, ['ACTIVO', 'EN_PROCESO', 'SUSPENDIDO']);

  const standards = extractUniqueStandards(SAMPLE_CERTIFICATE_RECORDS);
  assert.deepEqual(standards, [
    'ISO 14001:2015',
    'ISO 45001:2018',
    'ISO 9001:2015',
    'ISO/IEC 27001:2022',
  ]);
});

test('formatMatchCountText provides descriptive pluralized labels', () => {
  assert.equal(formatMatchCountText(0, 0), '0 certificados registrados');
  assert.equal(formatMatchCountText(1, 1), '1 certificado registrado');
  assert.equal(formatMatchCountText(4, 4), '4 certificados registrados');
  assert.equal(formatMatchCountText(1, 4), '1 de 4 coincidentes');
  assert.equal(formatMatchCountText(2, 4), '2 de 4 coincidentes');
});

test('getStoredViewMode and setStoredViewMode fallback cleanly in Node environment', () => {
  assert.equal(getStoredViewMode('grid'), 'grid');
  assert.equal(getStoredViewMode('list'), 'list');
  // Does not throw in non-browser environment
  assert.doesNotThrow(() => setStoredViewMode('list'));
});

test('getOperationalStatusVisual and getCoverageVisual provide required visual styles', () => {
  const activo = getOperationalStatusVisual('ACTIVO');
  assert.equal(activo.label, 'ACTIVO');
  assert.match(activo.badgeClass, /emerald/);

  const suspendido = getOperationalStatusVisual('SUSPENDIDO');
  assert.equal(suspendido.label, 'SUSPENDIDO');
  assert.match(suspendido.badgeClass, /amber/);

  const cov100 = getCoverageVisual(100);
  assert.match(cov100.barClass, /emerald/);
  assert.match(cov100.ratingLabel, /100%/);

  const cov40 = getCoverageVisual(40);
  assert.match(cov40.barClass, /rose/);
  assert.match(cov40.ratingLabel, /Críticos/);
});

test('Step 3.1: matchesSearchCriteria and filterCertificateRecords match organizacion_abreviacion, alcance_es, and alcance_en', () => {
  // 1. Sample records carry organizacion_abreviacion and bilingual scope
  const sampleIberoMatches = filterCertificateRecords(SAMPLE_CERTIFICATE_RECORDS, {
    query: 'IBEROMETAL',
    selectedStatus: 'ALL',
    selectedStandard: 'ALL',
  });
  assert.equal(sampleIberoMatches.length, 1);

  const sampleCyberMatches = filterCertificateRecords(SAMPLE_CERTIFICATE_RECORDS, {
    query: 'CYBERCLOUD',
    selectedStatus: 'ALL',
    selectedStandard: 'ALL',
  });
  assert.equal(sampleCyberMatches.length, 2);

  // English scope keyword search
  const englishMatches = filterCertificateRecords(SAMPLE_CERTIFICATE_RECORDS, {
    query: 'stamped',
    selectedStatus: 'ALL',
    selectedStandard: 'ALL',
  });
  assert.equal(englishMatches.length, 1);
  assert.equal(englishMatches[0].numero_certificado, 'FN-QMS-2024-001');

  const cyberEnMatches = filterCertificateRecords(SAMPLE_CERTIFICATE_RECORDS, {
    query: 'cybersecurity',
    selectedStatus: 'ALL',
    selectedStandard: 'ALL',
  });
  assert.equal(cyberEnMatches.length, 1);
  assert.equal(cyberEnMatches[0].numero_certificado, 'FN-ISMS-2024-007');

  // 2. Explicit custom abreviacion 'MET-VAL' + missing scope (tiene_alcance: false)
  const customRecords: CertificateRecord[] = [
    {
      id: 'c1',
      numero_certificado: 'FN-QMS-2026-101',
      organizacion_nombre: 'Metalúrgica Valencia S.A.',
      organizacion_abreviacion: 'MET-VAL',
      organizacion_rif: 'J-50000001-1',
      norma: 'ISO 9001:2015',
      esquema: 'SGC - Calidad',
      estatus: 'ACTIVO',
      version_numero: 2,
      multisitio: false,
      sitios_count: 1,
      cobertura_porcentaje: 100,
      fecha_emision: '2026-01-10',
      fecha_vencimiento: '2029-01-09',
      alcance_es: 'Mecanizado CNC de precisión en aluminio y acero inoxidable.',
      alcance_en: 'Precision CNC machining in aluminum and stainless steel.',
      tiene_alcance: true,
    },
    {
      id: 'c2',
      numero_certificado: 'FN-ISMS-2026-007',
      organizacion_nombre: 'CyberCloud Solutions S.L.',
      organizacion_abreviacion: 'CYBERCLOUD',
      organizacion_rif: 'J-40819234-5',
      norma: 'ISO/IEC 27001:2022',
      esquema: 'SGSI - Seguridad',
      estatus: 'ESTUDIO',
      version_numero: 1,
      multisitio: false,
      sitios_count: 1,
      cobertura_porcentaje: 0,
      fecha_emision: 'Pendiente',
      fecha_vencimiento: 'En Estudio',
      alcance: '',
      alcance_es: '',
      alcance_en: null,
      tiene_alcance: false,
    },
  ];

  const byAbrev = filterCertificateRecords(customRecords, {
    query: 'MET-VAL',
    selectedStatus: 'ALL',
    selectedStandard: 'ALL',
  });
  assert.equal(byAbrev.length, 1);
  assert.equal(byAbrev[0].id, 'c1');

  const byScopeEs = filterCertificateRecords(customRecords, {
    query: 'aluminio',
    selectedStatus: 'ALL',
    selectedStandard: 'ALL',
  });
  assert.equal(byScopeEs.length, 1);
  assert.equal(byScopeEs[0].id, 'c1');

  const byScopeEn = filterCertificateRecords(customRecords, {
    query: 'stainless steel',
    selectedStatus: 'ALL',
    selectedStandard: 'ALL',
  });
  assert.equal(byScopeEn.length, 1);
  assert.equal(byScopeEn[0].id, 'c1');

  assert.equal(matchesSearchCriteria(customRecords[1], 'CYBERCLOUD'), true);
  assert.equal(matchesSearchCriteria(customRecords[1], 'CNC'), false);
});

