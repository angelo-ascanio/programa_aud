import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const DATOS_PRUEBA_PATH = path.resolve(process.cwd(), 'public/supabase/queries/06_datos_prueba.sql');

function readSeedSql(): string {
  return fs.readFileSync(DATOS_PRUEBA_PATH, 'utf8');
}

test('Step 1.2: 06_datos_prueba.sql seeds IAF Sector 13, Sub-Sector 13.1 (ALTO), and ISO 45001:2018 accreditation link', () => {
  const sql = readSeedSql();

  assert.match(
    sql,
    /'d0000000-0000-0000-0000-000000000013',\s*13,\s*'Productos farmacéuticos'/
  );
  assert.match(
    sql,
    /'da000000-0000-0000-0000-000000000131',\s*'d0000000-0000-0000-0000-000000000013',\s*'13\.1',\s*'Productos y preparaciones farmacéuticos\.',\s*'ALTO'/
  );
  assert.match(
    sql,
    /'dd000000-0000-0000-0000-000000000007',\s*'dc000000-0000-0000-0000-000000000004',\s*'d0000000-0000-0000-0000-000000000013'/
  );
});

test('Step 1.2: 05_usuarios.sql preserves 4 RBAC test accounts and provisions 47 real CSV auditor auth + profile accounts idempotently', () => {
  const sql05 = fs.readFileSync(
    path.resolve(process.cwd(), 'public/supabase/queries/05_usuarios.sql'),
    'utf8'
  );

  // 4 quick RBAC test accounts preserved intact
  for (const [id, email] of [
    ['11111111-1111-1111-1111-111111111111', 'admin@fondonorma.test'],
    ['22222222-2222-2222-2222-222222222222', 'worker@fondonorma.test'],
    ['33333333-3333-3333-3333-333333333333', 'auditor@fondonorma.test'],
    ['44444444-4444-4444-4444-444444444444', 'client@fondonorma.test'],
  ]) {
    assert.ok(sql05.includes(`'${id}'`), `Missing preserved RBAC user ${id}`);
    assert.ok(sql05.includes(`'${email}'`), `Missing preserved RBAC email ${email}`);
  }

  // Cleanup block protects 1111..4444 while removing conflicting emails outside deterministic IDs
  assert.match(sql05, /DELETE FROM auth\.users au[\s\S]+au\.id IS DISTINCT FROM expected\.expected_id/);
  for (const protectedId of [
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333',
    '44444444-4444-4444-4444-444444444444',
  ]) {
    assert.ok(sql05.includes(`'${protectedId}'::UUID`), `Cleanup must protect ${protectedId}`);
  }

  // All 47 CSV auth accounts (1000...0001..0047) present in auth.users and public.profiles
  const profileMatches = [...sql05.matchAll(/\('(10000000-0000-0000-0000-0000000000\d{2})',\s*'([^']+)',\s*'AUDITOR',\s*'APPROVED'/g)];
  assert.equal(profileMatches.length, 47, '05_usuarios.sql must upsert exactly 47 APPROVED AUDITOR profiles for CSV auditors');

  // Verify GoTrue empty strings and deterministic crypt('<SIGLAS><CEDULA>') passwords including both homonymous Yurima Carrillo
  assert.ok(sql05.includes("crypt('KS4165827', gen_salt('bf'))"));
  assert.ok(sql05.includes("crypt('AKS10337391', gen_salt('bf'))"));
  assert.ok(sql05.includes("crypt('YC7137643', gen_salt('bf'))"));
  assert.ok(sql05.includes("crypt('YC12310919', gen_salt('bf'))"));
  assert.ok(sql05.includes("'yanellys_castellanos@yahoo.com'"));
  assert.ok(sql05.includes("'yurima12.fondonorma@gmail.com'"));
  assert.ok(sql05.includes("confirmation_token = ''"));
  assert.ok(sql05.includes("email_change = ''"));
  assert.ok(sql05.includes("email_change_token_new = ''"));
  assert.ok(sql05.includes("recovery_token = ''"));

  const dollarCount05 = (sql05.match(/\$\$/g) ?? []).length;
  assert.equal(dollarCount05 % 2, 0, '05_usuarios.sql has unbalanced $$ delimiters');
});

test('Step 1.2: 06_datos_prueba.sql seeds Sub-Sector 10.2, 48 active auditors, normalized child tables, and preserves LABCENTRO Sector 13 gap', () => {
  const sql = readSeedSql();

  // Subsector 10.2 added cleanly in Section 5
  assert.match(
    sql,
    /'da000000-0000-0000-0000-000000000102',\s*'d0000000-0000-0000-0000-000000000010',\s*'10\.2',\s*'Productos refinados de petróleo\.',\s*'ALTO'/
  );

  const sec10Start = sql.indexOf('-- 10. Auditores');
  const sec10bStart = sql.indexOf('-- 10b. Conglomerados');
  assert.ok(sec10Start > 0 && sec10bStart > sec10Start, 'Missing Section -- 10. or -- 10b.');
  const sec10 = sql.slice(sec10Start, sec10bStart);

  // Obsolete synthetic names must not remain
  assert.doesNotMatch(sec10, /Carlos Mendoza|Patricia Valera|Elena Marcano/i);

  // Exact 48 rows in public.auditor: tester 3333... + 47 CSV auditors 1000...0001..0047
  const auditorBlockStart = sec10.indexOf('INSERT INTO public.auditor');
  const auditorBlockEnd = sec10.indexOf('ON CONFLICT (id) DO UPDATE', auditorBlockStart);
  assert.ok(auditorBlockStart > -1 && auditorBlockEnd > auditorBlockStart);
  const auditorBlock = sec10.slice(auditorBlockStart, auditorBlockEnd);

  const auditorRows = [...auditorBlock.matchAll(/^\s*\('([0-9a-f-]+)',\s*'([^']+)',\s*'([^']+)',\s*(NULL|'([^']+)'),/gm)];
  assert.equal(auditorRows.length, 48, 'Section -- 10. must upsert 48 active auditor rows (3333... + 47 CSV)');

  const csvCedulas = new Set<string>();
  const auditorIds = new Set<string>();
  for (const match of auditorRows) {
    const id = match[1];
    const cedula = match[5];
    assert.ok(!auditorIds.has(id), `Duplicate auditor id ${id}`);
    auditorIds.add(id);
    if (id !== '33333333-3333-3333-3333-333333333333') {
      assert.ok(cedula && cedula.length > 0, `CSV auditor ${id} must have cedula_identidad`);
      assert.ok(!csvCedulas.has(cedula), `Duplicate cedula_identidad ${cedula}`);
      csvCedulas.add(cedula);
    }
  }
  assert.equal(csvCedulas.size, 47, 'All 47 CSV auditors must have distinct cedula_identidad');

  // Homonymous Yurima Carrillo records
  assert.ok(auditorBlock.includes("'10000000-0000-0000-0000-000000000045', 'Yurima Carrillo', 'YC', '7137643'"));
  assert.ok(auditorBlock.includes("'10000000-0000-0000-0000-000000000047', 'Yurima Carrillo', 'YC', '12310919'"));

  // Complementary schemes MARCA & HACCP + normalized 'dic-24' -> '2024-12-31'
  assert.ok(auditorBlock.includes("'10000000-0000-0000-0000-000000000035', 'Óscar Ríos', 'OR', '7130716', 'INGENIERO QUÍMICO', 'MARCA'"));
  assert.ok(auditorBlock.includes("'10000000-0000-0000-0000-000000000046', 'Yarleska Jimenez', 'YJ', '11049843', 'INGENIERO AGRÓNOMO', 'HACCP'"));
  assert.ok(auditorBlock.includes("'10000000-0000-0000-0000-000000000034', 'Ximena Pacheco', 'XP', '14261576', 'INGENIERO QUÍMICO', NULL, 2021, NULL, '01/12/2021', 'dic-24', '2021-12-01'::DATE, '2024-12-31'::DATE"));

  // Normalized child tables: 68 phones, 50 emails, 43 evaluaciones in situ
  const phoneRows = [...sec10.matchAll(/\('(1a100000-0000-0000-0000-0000000000\d{2})',\s*'([0-9a-f-]+)'/g)];
  const emailRows = [...sec10.matchAll(/\('(1a200000-0000-0000-0000-0000000000\d{2})',\s*'([0-9a-f-]+)'/g)];
  const evalRows = [...sec10.matchAll(/\('(1a300000-0000-0000-0000-0000000000\d{2})',\s*'([0-9a-f-]+)'/g)];
  assert.equal(phoneRows.length, 68, 'Expected 68 telefono_auditor rows');
  assert.equal(emailRows.length, 50, 'Expected 50 email_auditor rows');
  assert.equal(evalRows.length, 43, 'Expected 43 evaluacion_in_situ_auditor rows');
  assert.ok(sec10.includes("'04126018407'") && sec10.includes("'02123698762'"), 'Nordy Fuentes split phones missing');
  assert.ok(sec10.includes("'servicios@betzygil.com'") && sec10.includes("'bbgg0710@gmail.com'"), 'Betzy Gil dual emails missing');
  assert.ok(sec10.includes("'daneypf@gmail.com'") && sec10.includes("'daneypf@hotmail.com'"), 'Daney Penaloza dual emails missing');
  assert.ok(sec10.includes("'ing.pedrovargas@gmail.com'") && sec10.includes("'pvargas@orinoco-iron.com'"), 'Pedro Vargas dual emails missing');

  // Parse M:N matrices from Section 10
  const normaStart = sec10.indexOf('INSERT INTO public.norma_auditor');
  const sectorStart = sec10.indexOf('INSERT INTO public.sector_iaf_auditor');
  const subStart = sec10.indexOf('INSERT INTO public.subsector_iaf_auditor');
  assert.ok(normaStart > 0 && sectorStart > normaStart && subStart > sectorStart);

  const normaBlock = sec10.slice(normaStart, sectorStart);
  const sectorBlock = sec10.slice(sectorStart, subStart);
  const subBlock = sec10.slice(subStart);

  const normasByAud = new Map<string, Set<string>>();
  for (const m of normaBlock.matchAll(/\('([0-9a-f-]+)',\s*'([0-9a-f-]+)'\)/g)) {
    const set = normasByAud.get(m[1]) ?? new Set<string>();
    set.add(m[2]);
    normasByAud.set(m[1], set);
  }
  const sectoresByAud = new Map<string, Set<string>>();
  for (const m of sectorBlock.matchAll(/\('([0-9a-f-]+)',\s*'([0-9a-f-]+)'\)/g)) {
    const set = sectoresByAud.get(m[1]) ?? new Set<string>();
    set.add(m[2]);
    sectoresByAud.set(m[1], set);
  }
  const subsectoresByAud = new Map<string, Set<string>>();
  for (const m of subBlock.matchAll(/\('([0-9a-f-]+)',\s*'([0-9a-f-]+)'\)/g)) {
    const set = subsectoresByAud.get(m[1]) ?? new Set<string>();
    set.add(m[2]);
    subsectoresByAud.set(m[1], set);
  }

  // Normalized ISO norms per CSV
  assert.equal(normasByAud.get('10000000-0000-0000-0000-000000000035')?.size ?? 0, 0, 'Óscar Ríos (MARCA) must have 0 ISO norms');
  assert.ok(normasByAud.get('10000000-0000-0000-0000-000000000045')?.has('e0000000-0000-0000-0000-000000009001'), 'YC 7137643 normalized ISO 9001');
  assert.ok(normasByAud.get('10000000-0000-0000-0000-000000000045')?.has('e0000000-0000-0000-0000-000000014001'), 'YC 7137643 ISO 14001');
  assert.ok(normasByAud.get('10000000-0000-0000-0000-000000000047')?.has('e0000000-0000-0000-0000-000000014001'), 'YC 12310919 normalized ISO 14001');
  assert.ok(normasByAud.get('10000000-0000-0000-0000-000000000046')?.has('e0000000-0000-0000-0000-000000022000'), 'YJ normalized ISO 22000');
  assert.ok(normasByAud.get('10000000-0000-0000-0000-000000000004')?.has('e0000000-0000-0000-0000-000000045001'), 'Leonardo Rojas holds ISO 45001:2018');
  assert.ok(normasByAud.get('10000000-0000-0000-0000-000000000001')?.has('e0000000-0000-0000-0000-000000045001'), 'Keyla Soteldo holds ISO 45001:2018');

  // Existing subsectors remain covered across seed matrix
  for (const subId of [
    'da000000-0000-0000-0000-000000000031',
    'da000000-0000-0000-0000-000000000102',
    'da000000-0000-0000-0000-000000000171',
    'da000000-0000-0000-0000-000000000172',
    'da000000-0000-0000-0000-000000000331',
  ]) {
    assert.ok(subBlock.includes(`'${subId}'`), `Required subsector ${subId} missing in -- 10.`);
  }

  // Critical LABCENTRO invariant: NO auditor holding ISO 45001:2018 covers Sector 13 or Subsector 13.1
  for (const [audId, norms] of normasByAud.entries()) {
    if (norms.has('e0000000-0000-0000-0000-000000045001')) {
      assert.ok(
        !sectoresByAud.get(audId)?.has('d0000000-0000-0000-0000-000000000013'),
        `ISO 45001 auditor ${audId} must NOT cover Sector 13 (LABCENTRO demo invariant)`
      );
      assert.ok(
        !subsectoresByAud.get(audId)?.has('da000000-0000-0000-0000-000000000131'),
        `ISO 45001 auditor ${audId} must NOT cover Subsector 13.1 (LABCENTRO demo invariant)`
      );
    }
  }
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

  assert.ok(sec28.includes("('1e000000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000131')"));
  assert.ok(sec28.includes("('1e000000-0000-0000-0000-000000000003', 'da000000-0000-0000-0000-000000000171')"));
  assert.ok(sec28.includes("('1e000000-0000-0000-0000-000000000004', 'da000000-0000-0000-0000-000000000031')"));
  assert.ok(sec28.includes("('1e000000-0000-0000-0000-000000000004', 'da000000-0000-0000-0000-000000000331')"));
  assert.ok(sec28.includes("('1e000000-0000-0000-0000-000000000005', 'da000000-0000-0000-0000-000000000281')"));

  assert.doesNotMatch(sec28, /norma_experto_tecnico/i);
});

test('Step 1.2: 13.1 + ISO 45001:2018 demo scenario & experto_tecnico_auditoria obey trigger order and idempotency', () => {
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

  // Leonardo Antonio Rojas Gómez (1000...0004) holds ISO 45001:2018 without Sector 13 and has no date overlap
  assert.match(
    sec28,
    /'98000000-0000-0000-0000-000000000201',\s*'90000000-0000-0000-0000-000000000201',\s*'10000000-0000-0000-0000-000000000004',\s*'AUDITOR_LIDER',\s*2\.00,\s*TRUE/
  );

  // Dra. Sofía Quintero assigned in experto_tecnico_auditoria (1.00d) with exact observation
  assert.ok(
    sec28.includes(
      "('1e300000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000201', '1e000000-0000-0000-0000-000000000001', 1.00, 'Acompañamiento técnico en áreas de formulación estéril y manejo de principios activos (Subsector 13.1).')"
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
