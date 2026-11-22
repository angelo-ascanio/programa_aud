import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const QUERIES_DIR = path.resolve(process.cwd(), 'public/supabase/queries');

function readSql(fileName: string): string {
  return fs.readFileSync(path.join(QUERIES_DIR, fileName), 'utf8');
}

function extractFunctionBlock(sql: string, fnName: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${fnName}`);
  assert.ok(start >= 0, `Missing function public.${fnName}`);
  const endMarker = sql.indexOf('$$;', start);
  assert.ok(endMarker > start, `Missing $$; terminator for public.${fnName}`);
  return sql.slice(start, endMarker + 3);
}

test('Step 10.1: 01_creacion.sql defines Cerrada state, NC deadline offsets, hallazgo tracking columns, and balanced SQL delimiters', () => {
  const sql01 = readSql('01_creacion.sql');

  // 1. auditoria state check & fecha_cierre_auditoria
  assert.match(
    sql01,
    /CONSTRAINT auditoria_estado_ciclo_check CHECK\s*\(\s*estado_ciclo IN\s*\([\s\S]*?'Auditada'[\s\S]*?'Cerrada'[\s\S]*?\)\s*\)/i
  );
  assert.match(sql01, /DROP CONSTRAINT IF EXISTS auditoria_estado_ciclo_check/i);
  assert.match(sql01, /ADD COLUMN IF NOT EXISTS fecha_cierre_auditoria DATE NULL/i);

  // 2. configuracion_alerta_auditoria configurable NC offsets
  assert.match(
    sql01,
    /dias_limite_plan_accion INTEGER NOT NULL DEFAULT 15\s+CHECK\s*\(\s*dias_limite_plan_accion BETWEEN 1 AND 180\s*\)/i
  );
  assert.match(
    sql01,
    /dias_limite_plan_nc INTEGER NOT NULL DEFAULT 15\s+CHECK\s*\(\s*dias_limite_plan_nc BETWEEN 1 AND 180\s*\)/i
  );
  assert.match(
    sql01,
    /dias_limite_cierre_nc INTEGER NOT NULL DEFAULT 45\s+CHECK\s*\(\s*dias_limite_cierre_nc BETWEEN 1 AND 365\s*\)/i
  );

  // 3. hallazgo extensions
  assert.match(sql01, /id_sitio UUID NULL REFERENCES public\.sitio\(id\) ON DELETE RESTRICT/i);
  assert.match(sql01, /fecha_limite_plan DATE NULL/i);
  assert.match(sql01, /fecha_entrega_plan DATE NULL/i);
  assert.match(sql01, /fecha_limite_cierre DATE NULL/i);
  assert.match(sql01, /fecha_cierre_real DATE NULL/i);

  // 4. Dollar-quote parity check across all modified SQL files
  for (const file of ['01_creacion.sql', '03_indices_optimizacion.sql', '04_rls.sql', '06_datos_prueba.sql']) {
    const content = readSql(file);
    const dollarCount = (content.match(/\$\$/g) ?? []).length;
    assert.equal(dollarCount % 2, 0, `${file} has unbalanced $$ dollar-quote delimiters`);
  }
});

test('Step 10.1: 01_creacion.sql enforces fn_auto_calcular_fechas_hallazgo and fn_validar_cierre_auditoria triggers', () => {
  const sql01 = readSql('01_creacion.sql');

  const calcFn = extractFunctionBlock(sql01, 'fn_auto_calcular_fechas_hallazgo');
  assert.match(calcFn, /\bSECURITY DEFINER\b/i);
  assert.match(calcFn, /SET search_path = public, pg_temp/i);
  assert.match(calcFn, /af\.tipo_fecha = 'REAL'/i);
  assert.match(calcFn, /COALESCE\(c\.dias_limite_plan_nc,\s*c\.dias_limite_plan_accion,\s*15\),\s*COALESCE\(c\.dias_limite_cierre_nc,\s*45\)/i);
  assert.match(calcFn, /NEW\.tipo IN \('NC_MAYOR', 'NC_MENOR'\)/i);
  assert.match(calcFn, /NEW\.fecha_limite_plan := v_last_real \+ COALESCE\(v_dias_plan,\s*15\)/i);
  assert.match(calcFn, /NEW\.fecha_limite_cierre := v_last_real \+ COALESCE\(v_dias_cierre,\s*45\)/i);
  assert.match(calcFn, /NEW\.cerrado = TRUE AND NEW\.fecha_cierre_real IS NULL/i);
  assert.match(
    sql01,
    /CREATE TRIGGER trg_auto_calcular_fechas_hallazgo\s+BEFORE INSERT OR UPDATE OF cerrado ON public\.hallazgo/i
  );

  const closeFn = extractFunctionBlock(sql01, 'fn_validar_cierre_auditoria');
  assert.match(closeFn, /\bSECURITY DEFINER\b/i);
  assert.match(closeFn, /IF NEW\.estado_ciclo = 'Cerrada' THEN/i);
  assert.match(closeFn, /IF NEW\.fecha_cierre_auditoria IS NULL THEN/i);
  assert.match(closeFn, /af\.tipo_fecha = 'REAL'/i);
  assert.match(closeFn, /ERRCODE = 'P0001'/i);
  assert.match(
    sql01,
    /CREATE TRIGGER trg_validar_cierre_auditoria\s+BEFORE INSERT OR UPDATE OF estado_ciclo, fecha_cierre_auditoria ON public\.auditoria/i
  );
});

test('Step 10.1: 03_indices_optimizacion.sql and 04_rls.sql add NC deadline / closure indexes and RBAC closure guards', () => {
  const sql03 = readSql('03_indices_optimizacion.sql');
  const sql04 = readSql('04_rls.sql');

  assert.match(
    sql03,
    /CREATE INDEX IF NOT EXISTS idx_hallazgo_auditoria_nc_vencimientos\s+ON public\.hallazgo\s*\(id_auditoria,\s*tipo,\s*cerrado,\s*fecha_limite_cierre\)\s*WHERE deleted_at IS NULL/i
  );
  assert.match(
    sql03,
    /CREATE INDEX IF NOT EXISTS idx_auditoria_cierre_estado\s+ON public\.auditoria\s*\(estado_ciclo,\s*fecha_cierre_auditoria\)\s*WHERE deleted_at IS NULL/i
  );

  assert.match(
    sql04,
    /CREATE POLICY "auditoria_update_worker" ON public\.auditoria[\s\S]*?estado_ciclo <> 'Cerrada'[\s\S]*?fecha_cierre_auditoria IS NOT NULL AND public\.is_approved_worker\(\)/i
  );
  assert.match(sql04, /CREATE POLICY "hallazgo_insert_auditor_or_worker" ON public\.hallazgo/i);
  assert.match(sql04, /CREATE POLICY "hallazgo_update_auditor_or_worker" ON public\.hallazgo/i);
  assert.match(sql04, /CREATE POLICY "hallazgo_select" ON public\.hallazgo/i);
});

test('Step 10.1: 06_datos_prueba.sql seeds configurable offsets and closed historical audit after REAL date and hallazgos', () => {
  const sql06 = readSql('06_datos_prueba.sql');

  assert.match(sql06, /dias_limite_plan_accion,\s*dias_limite_plan_nc,\s*dias_limite_cierre_nc/i);
  assert.ok(sql06.includes("'AUD-2023-001'"), 'Expected closed historical audit AUD-2023-001');
  assert.ok(sql06.includes("'80000000-0000-0000-0000-000000000013'"));
  assert.ok(sql06.includes("'NC_MAYOR'"));
  assert.ok(sql06.includes("'NC_MENOR'"));

  const realDatePos = sql06.indexOf("'81000000-0000-0000-0000-000000000019'");
  const hallazgoPos = sql06.indexOf("'a1000000-0000-0000-0000-000000000002'");
  const closeUpdatePos = sql06.indexOf("SET estado_ciclo = 'Cerrada'");
  assert.ok(realDatePos > 0 && hallazgoPos > realDatePos && closeUpdatePos > hallazgoPos,
    'AUD-2023-001 must insert REAL auditoria_fecha and hallazgo rows before updating estado_ciclo to Cerrada'
  );
});

test('Step 1.1 (Roadmap): 01_creacion.sql & 04_rls.sql define idempotent code allocator RPCs and allow multi-year preventive campaigns', () => {
  const sql01 = readSql('01_creacion.sql');
  const sql03 = readSql('03_indices_optimizacion.sql');
  const sql04 = readSql('04_rls.sql');

  // 1. Verify staff guard + allocator RPCs exist cleanly
  const staffFn = extractFunctionBlock(sql01, 'is_approved_staff');
  assert.match(staffFn, /\bSECURITY DEFINER\b/i);
  assert.match(staffFn, /SET search_path = public, pg_temp/i);
  assert.match(staffFn, /role IN \('ADMIN', 'WORKER'\)/i);

  const nextProgFn = extractFunctionBlock(sql01, 'fn_next_programa_auditoria_codigo');
  assert.match(nextProgFn, /\bSECURITY DEFINER\b/i);
  assert.match(nextProgFn, /SET search_path = public, pg_temp/i);
  assert.match(nextProgFn, /public\.is_approved_staff\(\)/i);
  assert.match(nextProgFn, /FROM public\.programa_auditoria pa/i);
  assert.match(nextProgFn, /deleted_at IS NULL/i);
  assert.match(nextProgFn, /LEFT\(/i);

  const nextAuditFn = extractFunctionBlock(sql01, 'fn_next_auditoria_codigo');
  assert.match(nextAuditFn, /\bSECURITY DEFINER\b/i);
  assert.match(nextAuditFn, /SET search_path = public, pg_temp/i);
  assert.match(nextAuditFn, /public\.is_approved_staff\(\)/i);
  assert.match(nextAuditFn, /FROM public\.auditoria a/i);
  assert.match(nextAuditFn, /deleted_at IS NULL/i);
  assert.match(nextAuditFn, /40/);

  // 2. Verify least-privilege DCL in both 01_creacion.sql and 04_rls.sql
  for (const sqlDoc of [sql01, sql04]) {
    assert.match(sqlDoc, /REVOKE EXECUTE ON FUNCTION public\.fn_next_programa_auditoria_codigo\(INTEGER\) FROM anon;/i);
    assert.match(sqlDoc, /GRANT EXECUTE ON FUNCTION public\.fn_next_programa_auditoria_codigo\(INTEGER\) TO authenticated;/i);
    assert.match(sqlDoc, /REVOKE EXECUTE ON FUNCTION public\.fn_next_auditoria_codigo\(INTEGER, TEXT\) FROM anon;/i);
    assert.match(sqlDoc, /GRANT EXECUTE ON FUNCTION public\.fn_next_auditoria_codigo\(INTEGER, TEXT\) TO authenticated;/i);
  }

  // 3. Verify partial unique indexes and non-blocking multi-year trigger semantics
  assert.ok(
    sql03.includes(
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_auditoria_programa_cert_active ON public.auditoria (id_programa_auditoria, id_certificado) WHERE deleted_at IS NULL;'
    )
  );
  const validateAudFn = extractFunctionBlock(sql01, 'fn_validar_auditoria_en_programa');
  // Duplicate check is strictly scoped per id_programa_auditoria (allows preventive multi-year campaigns for same cert/vinculo)
  assert.match(validateAudFn, /WHERE a\.id_programa_auditoria = NEW\.id_programa_auditoria[\s\S]*?AND a\.id_certificado = NEW\.id_certificado/i);
  assert.doesNotMatch(validateAudFn, /estado_ciclo NOT IN \('Cerrada', 'Cancelada', 'Auditada'\)/i);

  // 4. Dollar-quote parity check after edits
  for (const file of ['01_creacion.sql', '04_rls.sql']) {
    const content = readSql(file);
    const dollarCount = (content.match(/\$\$/g) ?? []).length;
    assert.equal(dollarCount % 2, 0, `${file} has unbalanced $$ dollar-quote delimiters`);
  }
});

test('Step 3.2 (Roadmap): 06_datos_prueba.sql seeds multi-year CONG-IND-01 programs, multi-state audits, future PREPROGRAMADA_MES dates, and QA closures', () => {
  const sql06 = readSql('06_datos_prueba.sql');

  // 1. All 13 new programs (7a00...0010..0022) and 19 new audits (8000...0015..0033)
  for (let i = 10; i <= 22; i++) {
    const suffix = String(i).padStart(4, '0');
    assert.ok(sql06.includes(`'7a000000-0000-0000-0000-00000000${suffix}'`), `Missing program 7a00...${suffix}`);
  }
  for (let i = 15; i <= 33; i++) {
    const suffix = String(i).padStart(4, '0');
    assert.ok(sql06.includes(`'80000000-0000-0000-0000-00000000${suffix}'`), `Missing audit 8000...${suffix}`);
  }

  // 2. Preserved core audit codes & states
  for (const code of [
    "'PROG-2022-002'", "'PROG-2023-002'", "'PROG-2022-003'", "'PROG-2025-002'",
    "'PROG-2026-004'", "'PROG-2026-005'", "'PROG-2026-006'",
    "'PROG-2027-002'", "'PROG-2028-002'", "'PROG-2027-003'", "'PROG-2028-003'",
    "'PROG-2027-004'", "'PROG-2028-004'",
    "'AUD-2022-002'", "'AUD-2023-002'", "'AUD-2022-003'", "'AUD-2025-003'", "'AUD-2025-004'",
    "'AUD-2026-006'", "'AUD-2026-007'", "'AUD-2026-008'", "'AUD-2026-009'",
    "'AUD-2027-003'", "'AUD-2027-004'", "'AUD-2027-005'", "'AUD-2027-006'", "'AUD-2027-007'",
    "'AUD-2028-003'", "'AUD-2028-004'", "'AUD-2028-005'", "'AUD-2028-006'", "'AUD-2028-007'",
    "'AUD-2023-001'", "'AUD-2022-001'", "'AUD-ALM-2026-010'", "'AUD-ALM-2026-011'",
  ]) {
    assert.ok(sql06.includes(code), `Missing expected code ${code}`);
  }

  // 3. FN-QMS-2026-008 (4000...0008, Estudio / LIBRE) must have 0 rows in public.auditoria
  assert.doesNotMatch(
    sql06,
    /'80000000-0000-0000-0000-00000000\d{4}',\s*'7a000000-0000-0000-0000-00000000\d{4}',\s*'AUD-[^']+',\s*'40000000-0000-0000-0000-000000000008'/
  );

  // 4. Future dates 8100...0036..0045 must be PREPROGRAMADA_MES (never REAL)
  for (let i = 36; i <= 45; i++) {
    const suffix = String(i).padStart(4, '0');
    const lineMatch = sql06.match(new RegExp(`'81000000-0000-0000-0000-00000000${suffix}'[^\\n]*`));
    assert.ok(lineMatch, `Missing future date 8100...${suffix}`);
    assert.ok(lineMatch[0].includes("'PREPROGRAMADA_MES'"), `Future date 8100...${suffix} must be PREPROGRAMADA_MES`);
    assert.ok(!lineMatch[0].includes("'REAL'"), `Future date 8100...${suffix} must not be REAL`);
  }

  // 5. -- 22b. QA closures must occur after REAL date inserts
  const lastNewRealPos = sql06.indexOf("'81000000-0000-0000-0000-000000000031'");
  for (const audId of [
    "'80000000-0000-0000-0000-000000000015'",
    "'80000000-0000-0000-0000-000000000016'",
    "'80000000-0000-0000-0000-000000000017'",
    "'80000000-0000-0000-0000-000000000018'",
  ]) {
    const closeIdx = sql06.lastIndexOf(`WHERE id = ${audId}`);
    assert.ok(closeIdx > lastNewRealPos, `Closure update for ${audId} must follow REAL auditoria_fecha inserts`);
  }
});

test('Step 4.1 (Roadmap): 06_datos_prueba.sql enforces 0.25d proportional sites, zero future teams/findings, all 4 finding types, and comments', () => {
  const sql06 = readSql('06_datos_prueba.sql');

  // 1. Dollar-quote parity
  const dollarCount = (sql06.match(/\$\$/g) ?? []).length;
  assert.equal(dollarCount % 2, 0, '06_datos_prueba.sql has unbalanced $$ dollar-quote delimiters');

  // 2. sitios_por_auditoria section preserves 9000...0062, 9000...0075..0087 and uses 0.25d multiples
  const sec20Start = sql06.indexOf('-- 20. Sitios en Alcance');
  const sec20aStart = sql06.indexOf('-- 20a. Sitios Temporales');
  assert.ok(sec20Start > 0 && sec20aStart > sec20Start);
  const sec20 = sql06.slice(sec20Start, sec20aStart);

  assert.ok(sec20.includes("'90000000-0000-0000-0000-000000000062'"), 'Missing preserved 9000...0062 for AUD-2028-007');
  for (let i = 75; i <= 87; i++) {
    const suffix = String(i).padStart(4, '0');
    assert.ok(sec20.includes(`'90000000-0000-0000-0000-00000000${suffix}'`), `Missing multisite row 9000...${suffix}`);
  }

  // AUD-2024-001 proportionality: Sitio 0 = 2.50 >= Sitio 1 = 1.50
  assert.match(sec20, /'90000000-0000-0000-0000-000000000000'[\s\S]*?'50000000-0000-0000-0000-000000000000',\s*2\.50/);
  assert.match(sec20, /'90000000-0000-0000-0000-000000000001'[\s\S]*?'50000000-0000-0000-0000-000000000001',\s*1\.50/);

  // Every decimal time value in sitios_por_auditoria must be a multiple of 0.25
  const timeMatches = [...sec20.matchAll(/'50000000-0000-0000-0000-00000000\d{4}',\s*(\d+\.\d{2})/g)];
  assert.ok(timeMatches.length >= 50, 'Expected full set of sitios_por_auditoria entries');
  for (const m of timeMatches) {
    const val = Number(m[1]);
    assert.equal(Math.round(val * 4), val * 4, `Non-0.25d time value found in sitios_por_auditoria: ${val}`);
  }

  // 3. Temporal sites 9a00...0001..0003 & team 9c00...0001..0003
  for (const id of ['9a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000002', '9a000000-0000-0000-0000-000000000003']) {
    assert.ok(sql06.includes(`'${id}'`), `Missing temporal site ${id}`);
  }
  for (const id of ['9c000000-0000-0000-0000-000000000001', '9c000000-0000-0000-0000-000000000002', '9c000000-0000-0000-0000-000000000003']) {
    assert.ok(sql06.includes(`'${id}'`), `Missing temporal site auditor assignment ${id}`);
  }

  // 4. Zero teams in future audits (9000...0039..0062, 0076..0087) and Borrador (9000...0028..0033); 9600...0007 stays unassigned
  const sec21Start = sql06.indexOf('-- 21. Equipos de Auditores');
  const sec22Start = sql06.indexOf('-- 22. Hallazgos de Campo');
  const sec22aStart = sql06.indexOf('-- 22a. Comentarios de Seguimiento');
  const sec22bStart = sql06.indexOf('-- 22b. Cierre de auditorías');
  assert.ok(sec21Start > 0 && sec22Start > sec21Start && sec22aStart > sec22Start && sec22bStart > sec22aStart);

  const sec21 = sql06.slice(sec21Start, sec22Start);
  const sec22 = sql06.slice(sec22Start, sec22aStart);
  const sec22a = sql06.slice(sec22aStart, sec22bStart);

  for (const audId of [
    '33333333-3333-3333-3333-333333333333',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000005',
  ]) {
    assert.ok(sec21.includes(`'${audId}'`), `Auditor ${audId} should be assigned in -- 21.`);
  }

  assert.ok(!sec21.includes("'96000000-0000-0000-0000-000000000007'"), '9600...0007 must stay unassigned for Escenario D Parcial');

  for (let i = 39; i <= 62; i++) {
    const suffix = String(i).padStart(4, '0');
    assert.ok(!sec21.includes(`'90000000-0000-0000-0000-00000000${suffix}'`), `Future site link 9000...${suffix} must have 0 auditors`);
  }
  for (let i = 76; i <= 87; i++) {
    const suffix = String(i).padStart(4, '0');
    assert.ok(!sec21.includes(`'90000000-0000-0000-0000-00000000${suffix}'`), `Future site link 9000...${suffix} must have 0 auditors`);
  }
  for (let i = 28; i <= 33; i++) {
    const suffix = String(i).padStart(4, '0');
    assert.ok(!sec21.includes(`'90000000-0000-0000-0000-00000000${suffix}'`), `Borrador site link 9000...${suffix} must have 0 auditors`);
  }
  for (let i = 20; i <= 32; i++) {
    const suffix = String(i).padStart(4, '0');
    assert.ok(!sec21.includes(`'96000000-0000-0000-0000-00000000${suffix}'`), `Future process link 9600...${suffix} must have 0 auditors`);
  }
  for (let i = 65; i <= 88; i++) {
    const suffix = String(i).padStart(4, '0');
    assert.ok(!sec21.includes(`'96000000-0000-0000-0000-00000000${suffix}'`), `Future process link 9600...${suffix} must have 0 auditors`);
  }

  // 5. Zero findings in future/Borrador/En Programación/Programada audits, and all 4 finding types exist
  for (const disallowedAudit of [
    '80000000-0000-0000-0000-000000000004',
    '80000000-0000-0000-0000-000000000005',
    '80000000-0000-0000-0000-000000000006',
    '80000000-0000-0000-0000-000000000007',
    '80000000-0000-0000-0000-000000000008',
    '80000000-0000-0000-0000-000000000009',
    '80000000-0000-0000-0000-000000000010',
    '80000000-0000-0000-0000-000000000011',
    '80000000-0000-0000-0000-000000000012',
    '80000000-0000-0000-0000-000000000020',
    '80000000-0000-0000-0000-000000000021',
    '80000000-0000-0000-0000-000000000022',
    '80000000-0000-0000-0000-000000000024',
    '80000000-0000-0000-0000-000000000025',
    '80000000-0000-0000-0000-000000000026',
    '80000000-0000-0000-0000-000000000027',
    '80000000-0000-0000-0000-000000000028',
    '80000000-0000-0000-0000-000000000029',
    '80000000-0000-0000-0000-000000000030',
    '80000000-0000-0000-0000-000000000031',
    '80000000-0000-0000-0000-000000000032',
    '80000000-0000-0000-0000-000000000033',
  ]) {
    assert.ok(!sec22.includes(`'${disallowedAudit}'`), `Disallowed audit ${disallowedAudit} must have 0 hallazgos`);
  }

  for (const tipo of ["'NC_MAYOR'", "'NC_MENOR'", "'OBSERVACION'", "'OPORTUNIDAD_MEJORA'"]) {
    assert.ok(sec22.includes(tipo), `Missing finding type ${tipo} in -- 22.`);
  }

  // 6. Comments in -- 22a. and QA closures in -- 22b.
  assert.ok(sec22a.includes('INSERT INTO public.comentarios_por_auditoria'));
  assert.ok(sec22a.includes("'a2000000-0000-0000-0000-000000000008'"));
  assert.ok(sql06.slice(sec22bStart).includes('revisado = TRUE'));
  assert.ok(sql06.slice(sec22bStart).includes('revisado = FALSE'));
});
