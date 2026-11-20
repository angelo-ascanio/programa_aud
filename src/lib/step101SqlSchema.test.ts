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
    /dias_limite_cierre_nc INTEGER NOT NULL DEFAULT 60\s+CHECK\s*\(\s*dias_limite_cierre_nc BETWEEN 1 AND 365\s*\)/i
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
  assert.match(calcFn, /c\.dias_limite_plan_accion,\s*c\.dias_limite_cierre_nc/i);
  assert.match(calcFn, /NEW\.tipo IN \('NC_MAYOR', 'NC_MENOR'\)/i);
  assert.match(calcFn, /NEW\.fecha_limite_plan := v_last_real \+ COALESCE\(v_dias_plan,\s*15\)/i);
  assert.match(calcFn, /NEW\.fecha_limite_cierre := v_last_real \+ COALESCE\(v_dias_cierre,\s*60\)/i);
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

  assert.match(sql06, /dias_limite_plan_accion,\s*dias_limite_cierre_nc/i);
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
