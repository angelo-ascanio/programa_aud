import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CSV_STANDARD_DEFINITIONS,
  HISTORICAL_CLAUSE_UUID_BY_EXTERNAL_KEY,
  LTREE_PATH_PATTERN,
  normalizeNormasCsvDatasets,
  type CsvStandardDefinition,
  type NormalizedClauseRecord,
  type NormalizedTranslationRecord,
} from '../src/lib/requisitoCsvImporter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const CLAUSE_CSV_PATH = path.join(ROOT_DIR, 'public', 'requisitos', 'standard.clause.csv');
const TRANSLATION_CSV_PATH = path.join(
  ROOT_DIR,
  'public',
  'requisitos',
  'standard.clause.translation.csv'
);
const OUTPUT_SQL_PATH = path.join(
  ROOT_DIR,
  'public',
  'supabase',
  'queries',
  '07_normas_requisitos_csv.sql'
);
const OUTPUT_BUNDLE_PATH = path.join(
  ROOT_DIR,
  'src',
  'lib',
  'generated',
  'normasCatalogBundle.ts'
);

function sqlString(value: string): string {
  const sanitized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/'/g, "''");
  return `'${sanitized}'`;
}

function sqlNullableUuid(value: string | null): string {
  return value ? `'${value}'` : 'NULL';
}

function chunkArray<T>(items: ReadonlyArray<T>, size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function buildNormasInsertSql(standards: ReadonlyArray<CsvStandardDefinition>): string {
  const values = standards
    .map(
      (std) =>
        `    (${sqlString(std.id)}, ${sqlString(std.esquema)}, ${sqlString(std.codigo)}, ${sqlString(std.titulo)}, ${sqlString(std.estatus)}, ${sqlString(std.fecha_publicacion)}::date, ${sqlString(std.norma)})`
    )
    .join(',\n');

  return [
    '-- 1. Normas Certificables Canónicas (8 Normas)',
    'INSERT INTO public.norma (id, esquema, codigo, titulo, estatus, fecha_publicacion, norma) VALUES',
    values,
    'ON CONFLICT (codigo) WHERE deleted_at IS NULL DO UPDATE SET',
    '    esquema = EXCLUDED.esquema,',
    '    titulo = EXCLUDED.titulo,',
    '    estatus = EXCLUDED.estatus,',
    '    fecha_publicacion = EXCLUDED.fecha_publicacion,',
    '    norma = EXCLUDED.norma,',
    '    updated_at = NOW()',
    'WHERE public.norma.esquema IS DISTINCT FROM EXCLUDED.esquema',
    '   OR public.norma.titulo IS DISTINCT FROM EXCLUDED.titulo',
    '   OR public.norma.estatus IS DISTINCT FROM EXCLUDED.estatus',
    '   OR public.norma.fecha_publicacion IS DISTINCT FROM EXCLUDED.fecha_publicacion',
    '   OR public.norma.norma IS DISTINCT FROM EXCLUDED.norma;',
  ].join('\n');
}

function buildRequisitosInsertSql(clauses: ReadonlyArray<NormalizedClauseRecord>): string {
  const batches = chunkArray(clauses, 250);
  return batches
    .map((batch, batchIndex) => {
      const values = batch
        .map(
          (clause) =>
            `    (${sqlString(clause.id)}, ${sqlString(clause.id_norma)}, ${sqlNullableUuid(clause.id_requisito_padre)}, ${sqlString(clause.codigo)}, ${sqlString(clause.ruta_materializada)}::ltree, ${clause.explicit_code ? 'TRUE' : 'FALSE'}, ${sqlString(clause.external_key)})`
        )
        .join(',\n');

      return [
        `-- 2.${batchIndex + 1} Cláusulas Jerárquicas (lote ${batchIndex + 1}/${batches.length}, ${batch.length} filas)`,
        'INSERT INTO public.requisito (id, id_norma, id_requisito_padre, codigo, ruta_materializada, explicit_code, external_key) VALUES',
        values,
        'ON CONFLICT (id_norma, codigo) WHERE deleted_at IS NULL DO UPDATE SET',
        '    id_requisito_padre = EXCLUDED.id_requisito_padre,',
        '    ruta_materializada = EXCLUDED.ruta_materializada,',
        '    explicit_code = EXCLUDED.explicit_code,',
        '    external_key = EXCLUDED.external_key,',
        '    updated_at = NOW()',
        'WHERE public.requisito.id_requisito_padre IS DISTINCT FROM EXCLUDED.id_requisito_padre',
        '   OR public.requisito.ruta_materializada IS DISTINCT FROM EXCLUDED.ruta_materializada',
        '   OR public.requisito.explicit_code IS DISTINCT FROM EXCLUDED.explicit_code',
        '   OR public.requisito.external_key IS DISTINCT FROM EXCLUDED.external_key;',
      ].join('\n');
    })
    .join('\n\n');
}

function buildTranslationsInsertSql(
  translations: ReadonlyArray<NormalizedTranslationRecord>
): string {
  const batches = chunkArray(translations, 150);
  return batches
    .map((batch, batchIndex) => {
      const values = batch
        .map(
          (tr) =>
            `    (${sqlString(tr.id)}, ${sqlString(tr.id_requisito)}, ${sqlString(tr.lang)}, ${sqlString(tr.title)}, ${sqlString(tr.content_html)})`
        )
        .join(',\n');

      return [
        `-- 3.${batchIndex + 1} Traducciones de Cláusulas ES/EN (lote ${batchIndex + 1}/${batches.length}, ${batch.length} filas)`,
        'INSERT INTO public.requisito_traduccion (id, id_requisito, lang, title, content_html) VALUES',
        values,
        'ON CONFLICT (id_requisito, lang) WHERE deleted_at IS NULL DO UPDATE SET',
        '    title = EXCLUDED.title,',
        '    content_html = EXCLUDED.content_html,',
        '    updated_at = NOW()',
        'WHERE public.requisito_traduccion.title IS DISTINCT FROM EXCLUDED.title',
        '   OR public.requisito_traduccion.content_html IS DISTINCT FROM EXCLUDED.content_html;',
      ].join('\n');
    })
    .join('\n\n');
}

function buildSqlScript(
  standards: ReadonlyArray<CsvStandardDefinition>,
  clauses: ReadonlyArray<NormalizedClauseRecord>,
  translations: ReadonlyArray<NormalizedTranslationRecord>
): string {
  return [
    '-- ============================================================================',
    '-- FILE 7: 07_NORMAS_REQUISITOS_CSV.SQL (Generado automáticamente por scripts/buildNormasSeed.ts)',
    `-- Normas: ${standards.length} | Cláusulas LTREE: ${clauses.length} | Traducciones ES/EN: ${translations.length}`,
    '-- Ejecución idempotente en orden topológico (padres antes que hijos).',
    '-- ============================================================================',
    '',
    buildNormasInsertSql(standards),
    '',
    buildRequisitosInsertSql(clauses),
    '',
    buildTranslationsInsertSql(translations),
    '',
  ].join('\n');
}

function buildStaticBundleTs(
  standards: ReadonlyArray<CsvStandardDefinition>,
  clauses: ReadonlyArray<NormalizedClauseRecord>,
  translations: ReadonlyArray<NormalizedTranslationRecord>
): string {
  const standardById = new Map(standards.map((s) => [s.id, s]));
  const clauseTuples = clauses.map((c) => [
    c.id,
    c.id_norma,
    c.id_requisito_padre,
    c.codigo,
    c.ruta_materializada,
    c.explicit_code ? 1 : 0,
    c.external_key,
    c.nivel,
    c.es_padre ? 1 : 0,
  ] as const);

  const translationTuples = translations.map((t) => [
    t.id,
    t.id_requisito,
    t.lang,
    t.title,
    t.content_html,
  ] as const);

  const standardRecords = standards.map((s) => ({
    slug: s.slug,
    id: s.id,
    codigo: s.codigo,
    norma: s.norma,
    esquema: s.esquema,
    titulo: s.titulo,
    estatus: s.estatus,
    fecha_publicacion: s.fecha_publicacion,
  }));

  void standardById;

  return [
    '/* eslint-disable */',
    '// AUTO-GENERATED BY scripts/buildNormasSeed.ts — DO NOT EDIT MANUALLY',
    "import type { CsvStandardDefinition, NormalizedClauseRecord, NormalizedTranslationRecord, RequisitoTranslationLang } from '../requisitoCsvImporter';",
    '',
    'export type CompactClauseTuple = readonly [',
    '  id: string,',
    '  id_norma: string,',
    '  id_requisito_padre: string | null,',
    '  codigo: string,',
    '  ruta_materializada: string,',
    '  explicit_code: 0 | 1,',
    '  external_key: string,',
    '  nivel: number,',
    '  es_padre: 0 | 1,',
    '];',
    '',
    'export type CompactTranslationTuple = readonly [',
    '  id: string,',
    '  id_requisito: string,',
    '  lang: RequisitoTranslationLang,',
    '  title: string,',
    '  content_html: string,',
    '];',
    '',
    `export const BUNDLE_STANDARDS: ReadonlyArray<CsvStandardDefinition> = ${JSON.stringify(standardRecords, null, 2)};`,
    '',
    `export const BUNDLE_CLAUSE_TUPLES: ReadonlyArray<CompactClauseTuple> = ${JSON.stringify(clauseTuples)};`,
    '',
    `export const BUNDLE_TRANSLATION_TUPLES: ReadonlyArray<CompactTranslationTuple> = ${JSON.stringify(translationTuples)};`,
    '',
    'export function expandNormasCatalogBundle(): {',
    '  standards: ReadonlyArray<CsvStandardDefinition>;',
    '  clauses: NormalizedClauseRecord[];',
    '  translations: NormalizedTranslationRecord[];',
    '} {',
    '  const standardById = new Map<string, CsvStandardDefinition>(',
    '    BUNDLE_STANDARDS.map((std) => [std.id, std])',
    '  );',
    '  const clauseById = new Map<string, CompactClauseTuple>(',
    '    BUNDLE_CLAUSE_TUPLES.map((tuple) => [tuple[0], tuple])',
    '  );',
    '',
    '  const clauses: NormalizedClauseRecord[] = BUNDLE_CLAUSE_TUPLES.map((tuple) => {',
    '    const std = standardById.get(tuple[1])!;',
    '    const parentTuple = tuple[2] ? clauseById.get(tuple[2]) : undefined;',
    '    return {',
    '      id: tuple[0],',
    '      id_norma: tuple[1],',
    '      norma_codigo: std.codigo,',
    '      standard_slug: std.slug,',
    '      id_requisito_padre: tuple[2],',
    '      parent_external_key: parentTuple ? parentTuple[6] : null,',
    '      codigo: tuple[3],',
    '      ruta_materializada: tuple[4],',
    '      explicit_code: tuple[5] === 1,',
    '      external_key: tuple[6],',
    '      nivel: tuple[7],',
    '      es_padre: tuple[8] === 1,',
    '    };',
    '  });',
    '',
    '  const translations: NormalizedTranslationRecord[] = BUNDLE_TRANSLATION_TUPLES.map((tuple) => {',
    '    const clauseTuple = clauseById.get(tuple[1]);',
    '    return {',
    '      id: tuple[0],',
    '      id_requisito: tuple[1],',
    "      clause_external_key: clauseTuple ? clauseTuple[6] : '',",
    '      lang: tuple[2],',
    '      title: tuple[3],',
    '      content_html: tuple[4],',
    '    };',
    '  });',
    '',
    '  return {',
    '    standards: BUNDLE_STANDARDS,',
    '    clauses,',
    '    translations,',
    '  };',
    '}',
    '',
  ].join('\n');
}

function validateGeneratedDataset(
  standards: ReadonlyArray<CsvStandardDefinition>,
  clauses: ReadonlyArray<NormalizedClauseRecord>,
  translations: ReadonlyArray<NormalizedTranslationRecord>
): void {
  if (standards.length !== 8) {
    throw new Error(`Expected 8 standards, got ${standards.length}`);
  }
  if (clauses.length !== 2188) {
    throw new Error(`Expected 2188 clauses, got ${clauses.length}`);
  }
  if (translations.length !== 2684) {
    throw new Error(`Expected 2684 translations, got ${translations.length}`);
  }

  const clauseByExternalKey = new Map(clauses.map((c) => [c.external_key, c]));
  for (const [extKey, expectedUuid] of Object.entries(HISTORICAL_CLAUSE_UUID_BY_EXTERNAL_KEY)) {
    const found = clauseByExternalKey.get(extKey);
    if (!found || found.id !== expectedUuid) {
      throw new Error(
        `Historical UUID mismatch for ${extKey}: expected ${expectedUuid}, got ${found?.id ?? 'missing'}`
      );
    }
  }

  for (const clause of clauses) {
    if (!LTREE_PATH_PATTERN.test(clause.ruta_materializada)) {
      throw new Error(`Invalid LTREE syntax on ${clause.external_key}: ${clause.ruta_materializada}`);
    }
  }
}

function main(): void {
  const clauseCsvText = fs.readFileSync(CLAUSE_CSV_PATH, 'utf8');
  const translationCsvText = fs.readFileSync(TRANSLATION_CSV_PATH, 'utf8');

  const dataset = normalizeNormasCsvDatasets(clauseCsvText, translationCsvText);
  validateGeneratedDataset(dataset.standards, dataset.clauses, dataset.translations);

  const sqlOutput = buildSqlScript(dataset.standards, dataset.clauses, dataset.translations);
  fs.mkdirSync(path.dirname(OUTPUT_SQL_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_SQL_PATH, sqlOutput, 'utf8');

  const bundleOutput = buildStaticBundleTs(dataset.standards, dataset.clauses, dataset.translations);
  fs.mkdirSync(path.dirname(OUTPUT_BUNDLE_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_BUNDLE_PATH, bundleOutput, 'utf8');

  console.log(
    `[buildNormasSeed] Generated ${CSV_STANDARD_DEFINITIONS.length} standards, ${dataset.clauses.length} clauses, ${dataset.translations.length} translations (repairs: ${dataset.repairedCodes.length}).`
  );
}

main();
