import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const DATOS_PRUEBA_PATH = path.resolve(process.cwd(), 'public/supabase/queries/06_datos_prueba.sql');

function readSeedSql(): string {
  return fs.readFileSync(DATOS_PRUEBA_PATH, 'utf8');
}

test('Step 1.2: 06_datos_prueba.sql seeds IAF Sector 13, Sub-Sector 13.2 (ALTO), and ISO 45001:2018 accreditation link', () => {
  const sql = readSeedSql();

  assert.match(
    sql,
    /'d0000000-0000-0000-0000-000000000013',\s*13,\s*'Productos farmacéuticos'/
  );
  assert.match(
    sql,
    /'da000000-0000-0000-0000-000000000132',\s*'d0000000-0000-0000-0000-000000000013',\s*'13\.2',\s*'Fabricación de preparados farmacéuticos y especialidades medicinales',\s*'ALTO'/
  );
  assert.match(
    sql,
    /'dd000000-0000-0000-0000-000000000007',\s*'dc000000-0000-0000-0000-000000000004',\s*'d0000000-0000-0000-0000-000000000013'/
  );
});

test('Step 1.2: Section -- 10. preserves all 6 auditors and existing coverage while excluding Sector 13 / 13.2 from auditors', () => {
  const sql = readSeedSql();
  const sec10Start = sql.indexOf('-- 10. Auditores');
  const sec10bStart = sql.indexOf('-- 10b. Conglomerados');
  assert.ok(sec10Start > 0 && sec10bStart > sec10Start, 'Missing Section -- 10. or -- 10b.');
  const sec10 = sql.slice(sec10Start, sec10bStart);

  for (const [id, name] of [
    ['33333333-3333-3333-3333-333333333333', 'Auditor Técnico Evaluador'],
    ['10000000-0000-0000-0000-000000000001', 'Ing. Carlos Mendoza (Auditor Líder)'],
    ['10000000-0000-0000-0000-000000000002', 'Ing. Patricia Valera (Líder SGA/SST)'],
    ['10000000-0000-0000-0000-000000000003', 'Ing. Roberto Salgado (Auditor SGC/Metalmecánica)'],
    ['10000000-0000-0000-0000-000000000004', 'Dra. Elena Marcano (Auditora HSEQ Integral)'],
    ['10000000-0000-0000-0000-000000000005', 'Ing. Andrés Briceño (Especialista SGSI/SGC)'],
  ]) {
    assert.ok(sec10.includes(`'${id}', '${name}'`), `Preserved auditor ${name} missing in -- 10.`);
  }

  // Ing. Patricia Valera and Dra. Elena Marcano keep ISO 45001:2018 qualification
  assert.match(
    sec10,
    /'10000000-0000-0000-0000-000000000002',\s*'e0000000-0000-0000-0000-000000045001'/
  );
  assert.match(
    sec10,
    /'10000000-0000-0000-0000-000000000004',\s*'e0000000-0000-0000-0000-000000045001'/
  );

  // Existing subsectors 03.1, 17.1, 17.2, 33.1 remain covered; Sector 13 / 13.2 intentionally absent from auditor competencies
  for (const subId of [
    'da000000-0000-0000-0000-000000000031',
    'da000000-0000-0000-0000-000000000171',
    'da000000-0000-0000-0000-000000000172',
    'da000000-0000-0000-0000-000000000331',
  ]) {
    assert.ok(sec10.includes(`'${subId}'`), `Required existing subsector ${subId} missing in -- 10.`);
  }
  assert.ok(!sec10.includes("'d0000000-0000-0000-0000-000000000013'"), 'Auditors must not cover Sector 13');
  assert.ok(!sec10.includes("'da000000-0000-0000-0000-000000000132'"), 'Auditors must not cover Subsector 13.2');
});

test('Step 1.2: Section -- 28. seeds 5 experto_tecnico rows, 6 phones, 5 emails, IAF-only competencies, and zero ISO norms', () => {
  const sql = readSeedSql();
  const sec28Start = sql.indexOf('-- 28. Expertos Técnicos');
  assert.ok(sec28Start > 0, 'Missing Section -- 28.');
  const sec28 = sql.slice(sec28Start);

  // 5 technical experts (4 Disponible + 1 No disponible)
  const expectedExperts: Array<[string, string, string, string]> = [
    [
      '1e000000-0000-0000-0000-000000000001',
      'Dra. Sofía Quintero',
      'Disponible',
      'Química farmacéutica senior con 14 años en buenas prácticas de manufactura estéril.',
    ],
    [
      '1e000000-0000-0000-0000-000000000002',
      'Ing. Héctor Zambrano',
      'Disponible',
      'Especialista en procesos industriales farmacéuticos, biotecnología y control ambiental de áreas limpias.',
    ],
    [
      '1e000000-0000-0000-0000-000000000003',
      'Ing. Mariela Cárdenas',
      'Disponible',
      'Experta metalúrgica y procesos de fundición / tratamientos térmicos.',
    ],
    [
      '1e000000-0000-0000-0000-000000000004',
      'Lic. Gabriel Navarro',
      'Disponible',
      'Especialista en cadenas agroalimentarias y continuidad operativa de centros de datos.',
    ],
    [
      '1e000000-0000-0000-0000-000000000005',
      'Ing. Rodrigo Páez',
      'No disponible',
      'Temporalmente no disponible por licencia técnica hasta próximo trimestre.',
    ],
  ];

  for (const [id, nombre, estatus, notas] of expectedExperts) {
    assert.ok(
      sec28.includes(`('${id}', '${nombre}', '${estatus}', '${notas}')`),
      `Missing or mismatched experto_tecnico seed for ${nombre}`
    );
  }

  // 6 phones (2 for Héctor Zambrano 1e00...0002) and 5 emails
  for (let i = 1; i <= 6; i++) {
    assert.ok(sec28.includes(`'1e100000-0000-0000-0000-00000000000${i}'`), `Missing phone 1e10...000${i}`);
  }
  const zambranoPhones = sec28.match(/'1e100000-0000-0000-0000-00000000000\d',\s*'1e000000-0000-0000-0000-000000000002'/g) ?? [];
  assert.equal(zambranoPhones.length, 2, 'Ing. Héctor Zambrano must have 2 phone numbers');

  for (let i = 1; i <= 5; i++) {
    assert.ok(sec28.includes(`'1e200000-0000-0000-0000-00000000000${i}'`), `Missing email 1e20...000${i}`);
  }

  // Sector & Subsector competencies
  assert.ok(sec28.includes("('1e000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000013')"));
  assert.ok(sec28.includes("('1e000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000017')"));
  assert.ok(sec28.includes("('1e000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000028')"));

  assert.ok(sec28.includes("('1e000000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000132')"));
  assert.ok(sec28.includes("('1e000000-0000-0000-0000-000000000003', 'da000000-0000-0000-0000-000000000171')"));
  assert.ok(sec28.includes("('1e000000-0000-0000-0000-000000000004', 'da000000-0000-0000-0000-000000000031')"));
  assert.ok(sec28.includes("('1e000000-0000-0000-0000-000000000004', 'da000000-0000-0000-0000-000000000331')"));
  assert.ok(sec28.includes("('1e000000-0000-0000-0000-000000000005', 'da000000-0000-0000-0000-000000000281')"));

  assert.doesNotMatch(sec28, /norma_experto_tecnico/i);
});

test('Step 1.2: 13.2 + ISO 45001:2018 demo scenario & experto_tecnico_auditoria obey trigger order and idempotency', () => {
  const sql = readSeedSql();
  const sec28Start = sql.indexOf('-- 28. Expertos Técnicos');
  assert.ok(sec28Start > 0);
  const sec28 = sql.slice(sec28Start);

  // Cert, Alcance, Sitio 0 must precede auditoria insert
  const certPos = sec28.indexOf("'FN-SST-2026-201'");
  const alcancePos = sec28.indexOf("'a1c00000-0000-0000-0000-000000000201'");
  const sitioPos = sec28.indexOf("'50000000-0000-0000-0000-000000000201'");
  const audPos = sec28.indexOf("'AUD-FAR-2026-001'");
  assert.ok(certPos > 0 && alcancePos > certPos && sitioPos > alcancePos && audPos > sitioPos,
    'certificado, alcance, and sitio must be inserted before auditoria AUD-FAR-2026-001'
  );

  // Ing. Patricia Valera assigned on Site 0 without date overlap (+45d..+46d vs +35d..+36d)
  assert.match(
    sec28,
    /'98000000-0000-0000-0000-000000000201',\s*'90000000-0000-0000-0000-000000000201',\s*'10000000-0000-0000-0000-000000000002',\s*'AUDITOR_LIDER',\s*2\.00,\s*TRUE/
  );

  // Dra. Sofía Quintero assigned in experto_tecnico_auditoria (1.00d) with exact observation
  assert.ok(
    sec28.includes(
      "('1e300000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000201', '1e000000-0000-0000-0000-000000000001', 1.00, 'Acompañamiento técnico en áreas de formulación estéril y manejo de principios activos (Subsector 13.2).')"
    ),
    'Missing canonical experto_tecnico_auditoria assignment for Dra. Sofía Quintero'
  );

  // Idempotency: every INSERT in Section 28 has ON CONFLICT handling and $$ delimiters are balanced
  const insertCount = (sec28.match(/INSERT INTO\s+public\./gi) ?? []).length;
  const conflictCount = (sec28.match(/ON CONFLICT\s*\(/gi) ?? []).length;
  // 2 inserts inside DO $$ blocks do not need ON CONFLICT because DO $$ branches on EXISTS / version_numero
  assert.equal(insertCount - conflictCount, 2, 'All top-level INSERT statements in Section 28 must use ON CONFLICT');

  const dollarCount = (sql.match(/\$\$/g) ?? []).length;
  assert.equal(dollarCount % 2, 0, '06_datos_prueba.sql has unbalanced $$ dollar-quote delimiters');
});

test('Step 1.2: Preserves CONG-IND-01 (8 certs), CONG-CYB-01, CONG-ALM-01, linked multi-auditor audits, and Level 2 CLIENT isolation', () => {
  const sql = readSeedSql();

  for (const code of ['CONG-IND-01', 'CONG-CYB-01', 'CONG-ALM-01', 'AUD-2023-001', 'AUD-2026-001', 'AUD-2026-003']) {
    assert.ok(sql.includes(`'${code}'`), `Protected seed code ${code} missing`);
  }

  // Only Iberometal (3000...0001) has client_organization_access
  const sec12Start = sql.indexOf('-- 12. Solicitud de Acceso');
  const sec13Start = sql.indexOf('-- 13. Certificados');
  assert.ok(sec12Start > 0 && sec13Start > sec12Start);
  const sec12 = sql.slice(sec12Start, sec13Start);
  assert.ok(sec12.includes("'30000000-0000-0000-0000-000000000001'"));
  assert.ok(!sec12.includes("'30000000-0000-0000-0000-000000000006'"), 'CLIENT must not gain access to CONG-FAR-01');
});
