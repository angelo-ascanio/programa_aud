import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  CSV_STANDARD_DEFINITIONS,
  HISTORICAL_CLAUSE_UUID_BY_EXTERNAL_KEY,
  LTREE_PATH_PATTERN,
  classifyNormalizedClausesObligation,
  cleanOdooTranslationHtml,
  mapCsvLanguageCode,
  normalizeCsvClauseRows,
  normalizeNormasCsvDatasets,
  parseCsvRecords,
  type NormalizedClauseRecord,
  type NormalizedTranslationRecord,
  type RawCsvClauseRow,
} from './requisitoCsvImporter.js';
import { expandNormasCatalogBundle } from './generated/normasCatalogBundle.js';

const REQUISITOS_DIR = path.resolve(process.cwd(), 'public', 'requisitos');
const QUERIES_DIR = path.resolve(process.cwd(), 'public', 'supabase', 'queries');

test('Step 1.2 CSV Parser: handles multiline quoted HTML fields, escaped quotes "", and UTF-8 BOM', () => {
  const sampleCsv =
    '\uFEFFid,clause_id/id,lang_id/id,title,content\r\n' +
    'trans_1,clause_1,base.lang_es,"Título ""Principal""","<div data-oe-version=""1.2"">\r\n<p>Texto con {clause_4.1} y ""comillas""</p>\r\n</div>"\r\n' +
    'trans_2,clause_1,base.lang_en,English Title,"<div>Simple</div>"\n';

  const parsed = parseCsvRecords(sampleCsv);
  assert.equal(parsed.length, 3);
  assert.deepEqual(parsed[0], ['id', 'clause_id/id', 'lang_id/id', 'title', 'content']);
  assert.equal(parsed[1][3], 'Título "Principal"');
  assert.equal(
    parsed[1][4],
    '<div data-oe-version="1.2">\r\n<p>Texto con {clause_4.1} y "comillas"</p>\r\n</div>'
  );
  assert.equal(parsed[2][3], 'English Title');
});

test('Step 1.2 Translation Normalization: strips Odoo data-oe-version without altering {clause_...} placeholders', () => {
  assert.equal(mapCsvLanguageCode('base.lang_es'), 'es');
  assert.equal(mapCsvLanguageCode('base.lang_en'), 'en');
  assert.throws(() => mapCsvLanguageCode('base.lang_fr'));

  const cleaned = cleanOdooTranslationHtml(
    '<div data-oe-version="1.2"><p data-oe-version=\'1.2\'>Ver {clause_4.1} y {clause_3.10}</p></div>'
  );
  assert.equal(cleaned, '<div><p>Ver {clause_4.1} y {clause_3.10}</p></div>');
  assert.equal(cleaned.includes('data-oe-version'), false);
  assert.ok(cleaned.includes('{clause_4.1}'));
  assert.ok(cleaned.includes('{clause_3.10}'));
});

test('Step 1.2 Truncation Repair & Topological Sort: fixes all 11 truncated trailing-zero collisions and orders parents before children', () => {
  // Out-of-order children before parent + spreadsheet-truncated 3.1/3.2/3.3/3.4/7.1 after .9/.19/.29/.39
  const syntheticRows: RawCsvClauseRow[] = [
    // Child placed before parent to test topological sorting
    {
      external_key: 'clause_iso_45001_2018_0016_child',
      code: '3.10.1',
      standard_slug: 'iso45001_2018',
      parent_external_key: 'clause_iso_45001_2018_0016',
      explicit_code: false,
    },
    {
      external_key: 'clause_iso_45001_2018_0006',
      code: '3',
      standard_slug: 'iso45001_2018',
      parent_external_key: null,
      explicit_code: false,
    },
    {
      external_key: 'clause_iso_45001_2018_0007',
      code: '3.1',
      standard_slug: 'iso45001_2018',
      parent_external_key: 'clause_iso_45001_2018_0006',
      explicit_code: false,
    },
    {
      external_key: 'clause_iso_45001_2018_0008',
      code: '3.2',
      standard_slug: 'iso45001_2018',
      parent_external_key: 'clause_iso_45001_2018_0006',
      explicit_code: false,
    },
    {
      external_key: 'clause_iso_45001_2018_0009',
      code: '3.3',
      standard_slug: 'iso45001_2018',
      parent_external_key: 'clause_iso_45001_2018_0006',
      explicit_code: false,
    },
    {
      external_key: 'clause_iso_45001_2018_0015',
      code: '3.9',
      standard_slug: 'iso45001_2018',
      parent_external_key: 'clause_iso_45001_2018_0006',
      explicit_code: false,
    },
    {
      external_key: 'clause_iso_45001_2018_0016',
      code: '3.1', // truncated 3.10
      standard_slug: 'iso45001_2018',
      parent_external_key: 'clause_iso_45001_2018_0006',
      explicit_code: false,
    },
    {
      external_key: 'clause_iso_45001_2018_0025',
      code: '3.19',
      standard_slug: 'iso45001_2018',
      parent_external_key: 'clause_iso_45001_2018_0006',
      explicit_code: false,
    },
    {
      external_key: 'clause_iso_45001_2018_0026',
      code: '3.2', // truncated 3.20
      standard_slug: 'iso45001_2018',
      parent_external_key: 'clause_iso_45001_2018_0006',
      explicit_code: false,
    },
    {
      external_key: 'clause_iso_45001_2018_0038',
      code: '3.29',
      standard_slug: 'iso45001_2018',
      parent_external_key: 'clause_iso_45001_2018_0006',
      explicit_code: false,
    },
    {
      external_key: 'clause_iso_45001_2018_0039',
      code: '3.3', // truncated 3.30
      standard_slug: 'iso45001_2018',
      parent_external_key: 'clause_iso_45001_2018_0006',
      explicit_code: false,
    },
    {
      external_key: 'clause_iso_22000_2018_0010',
      code: '3',
      standard_slug: 'iso22000_2018',
      parent_external_key: null,
      explicit_code: false,
    },
    {
      external_key: 'clause_iso_22000_2018_0011',
      code: '3.4',
      standard_slug: 'iso22000_2018',
      parent_external_key: 'clause_iso_22000_2018_0010',
      explicit_code: false,
    },
    {
      external_key: 'clause_iso_22000_2018_0049',
      code: '3.39',
      standard_slug: 'iso22000_2018',
      parent_external_key: 'clause_iso_22000_2018_0010',
      explicit_code: false,
    },
    {
      external_key: 'clause_iso_22000_2018_0050',
      code: '3.4', // truncated 3.40
      standard_slug: 'iso22000_2018',
      parent_external_key: 'clause_iso_22000_2018_0010',
      explicit_code: false,
    },
    {
      external_key: 'clause_iso_17065_2012_0149',
      code: '7',
      standard_slug: 'iso17065_2012',
      parent_external_key: null,
      explicit_code: false,
    },
    {
      external_key: 'clause_iso_17065_2012_0150',
      code: '7.1',
      standard_slug: 'iso17065_2012',
      parent_external_key: 'clause_iso_17065_2012_0149',
      explicit_code: false,
    },
    {
      external_key: 'clause_iso_17065_2012_0206',
      code: '7.9',
      standard_slug: 'iso17065_2012',
      parent_external_key: 'clause_iso_17065_2012_0149',
      explicit_code: false,
    },
    {
      external_key: 'clause_iso_17065_2012_0207',
      code: '7.1', // truncated 7.10
      standard_slug: 'iso17065_2012',
      parent_external_key: 'clause_iso_17065_2012_0149',
      explicit_code: false,
    },
  ];

  const { clauses, repairedCodes } = normalizeCsvClauseRows(syntheticRows);
  assert.equal(repairedCodes.length, 5);
  assert.deepEqual(
    repairedCodes.map((r) => [r.external_key, r.repaired_code]),
    [
      ['clause_iso_45001_2018_0016', '3.10'],
      ['clause_iso_45001_2018_0026', '3.20'],
      ['clause_iso_45001_2018_0039', '3.30'],
      ['clause_iso_22000_2018_0050', '3.40'],
      ['clause_iso_17065_2012_0207', '7.10'],
    ]
  );

  // Verify parent precedes child after topological sort
  const indexByKey = new Map(clauses.map((c, idx) => [c.external_key, idx]));
  for (const clause of clauses) {
    if (clause.parent_external_key) {
      assert.ok(
        indexByKey.get(clause.parent_external_key)! < indexByKey.get(clause.external_key)!,
        `Parent ${clause.parent_external_key} must appear before ${clause.external_key}`
      );
    }
    assert.match(clause.ruta_materializada, LTREE_PATH_PATTERN);
  }

  const repairedChild = clauses.find((c) => c.external_key === 'clause_iso_45001_2018_0016_child')!;
  assert.equal(repairedChild.ruta_materializada, '3.3_10.3_10_1');
});

test('Step 1.2 Full Dataset Normalization: 8 standards, 2,188 clauses, 2,684 translations, 0 collisions, valid LTREE up to level 7, historical UUIDs preserved', () => {
  const clauseCsv = fs.readFileSync(path.join(REQUISITOS_DIR, 'standard.clause.csv'), 'utf8');
  const translationCsv = fs.readFileSync(
    path.join(REQUISITOS_DIR, 'standard.clause.translation.csv'),
    'utf8'
  );

  const dataset = normalizeNormasCsvDatasets(clauseCsv, translationCsv);

  assert.equal(dataset.standards.length, 8);
  assert.equal(dataset.clauses.length, 2188);
  assert.equal(dataset.translations.length, 2684);

  // Verify exact counts per standard
  const countBySlug = new Map<string, number>();
  for (const clause of dataset.clauses) {
    countBySlug.set(clause.standard_slug, (countBySlug.get(clause.standard_slug) ?? 0) + 1);
  }
  assert.deepEqual(Object.fromEntries(countBySlug), {
    iso9001_2015: 350,
    iso14001_2015: 205,
    iso45001_2018: 307,
    iso22000_2018: 480,
    iso27001_2022: 167,
    ntf4073_2022: 138,
    iso17065_2012: 307,
    iso50001_2018: 234,
  });

  // 100% unique (id_norma, codigo), 100% valid LTREE up to level 7, parent before child
  const seenNormaCodigo = new Set<string>();
  const seenClauseIds = new Set<string>();
  const indexById = new Map<string, number>();
  let maxNivel = 0;

  dataset.clauses.forEach((clause, idx) => {
    const key = `${clause.id_norma}::${clause.codigo}`;
    assert.equal(seenNormaCodigo.has(key), false, `Duplicate (id_norma, codigo): ${key}`);
    seenNormaCodigo.add(key);

    assert.equal(seenClauseIds.has(clause.id), false, `Duplicate UUID: ${clause.id}`);
    seenClauseIds.add(clause.id);
    indexById.set(clause.id, idx);

    assert.match(clause.ruta_materializada, LTREE_PATH_PATTERN);
    if (clause.nivel > maxNivel) maxNivel = clause.nivel;
    if (clause.id_requisito_padre) {
      assert.ok(
        indexById.has(clause.id_requisito_padre),
        `Parent UUID ${clause.id_requisito_padre} must precede ${clause.id}`
      );
    }
  });
  assert.equal(maxNivel, 7);

  // Preserve the 7 historical ISO 9001:2015 UUIDs referenced in 06_datos_prueba.sql
  const byExternalKey = new Map(dataset.clauses.map((c) => [c.external_key, c]));
  for (const [extKey, expectedUuid] of Object.entries(HISTORICAL_CLAUSE_UUID_BY_EXTERNAL_KEY)) {
    const clause = byExternalKey.get(extKey);
    assert.ok(clause, `Missing historical clause ${extKey}`);
    assert.equal(clause.id, expectedUuid);
  }

  // Verify the 11 .10/.20/.30/.40 clauses resolve cleanly
  const expectedTenSeries: Array<[string, string]> = [
    ['clause_iso_45001_2018_0016', '3.10'],
    ['clause_iso_45001_2018_0026', '3.20'],
    ['clause_iso_45001_2018_0039', '3.30'],
    ['clause_iso_22000_2018_0020', '3.10'],
    ['clause_iso_22000_2018_0030', '3.20'],
    ['clause_iso_22000_2018_0040', '3.30'],
    ['clause_iso_22000_2018_0050', '3.40'],
    ['clause_ntf_4073_2022_0024', '3.10'],
    ['clause_ntf_4073_2022_0034', '3.20'],
    ['clause_iso_17065_2012_0013', '3.10'],
    ['clause_iso_17065_2012_0207', '7.10'],
  ];
  for (const [extKey, expectedCode] of expectedTenSeries) {
    assert.equal(byExternalKey.get(extKey)?.codigo, expectedCode);
  }

  // Verify translations clean Odoo attributes and preserve placeholders
  const seenTranslations = new Set<string>();
  let esCount = 0;
  let enCount = 0;
  for (const tr of dataset.translations) {
    if (tr.lang === 'es') esCount += 1;
    if (tr.lang === 'en') enCount += 1;
    assert.equal(tr.content_html.includes('data-oe-version'), false);
    const pairKey = `${tr.id_requisito}::${tr.lang}`;
    assert.equal(seenTranslations.has(pairKey), false, `Duplicate translation ${pairKey}`);
    seenTranslations.add(pairKey);
    assert.ok(seenClauseIds.has(tr.id_requisito));
  }
  assert.equal(esCount, 1342);
  assert.equal(enCount, 1342);
});

test('Step 1.2 Generated Bundle & SQL Seed: parity with CSV counts, partial ON CONFLICT targets, and zero physical DELETE', () => {
  const bundle = expandNormasCatalogBundle();
  assert.equal(bundle.standards.length, CSV_STANDARD_DEFINITIONS.length);
  assert.equal(bundle.clauses.length, 2188);
  assert.equal(bundle.translations.length, 2684);

  const bundleByKey = new Map(bundle.clauses.map((c) => [c.external_key, c]));
  for (const [extKey, expectedUuid] of Object.entries(HISTORICAL_CLAUSE_UUID_BY_EXTERNAL_KEY)) {
    assert.equal(bundleByKey.get(extKey)?.id, expectedUuid);
  }

  const sql06 = fs.readFileSync(path.join(QUERIES_DIR, '06_datos_prueba.sql'), 'utf8');
  assert.ok(sql06.includes("'clause_iso_9001_2015_0006'"));
  assert.ok(sql06.includes("'clause_iso_9001_2015_0244'"));
  assert.ok(sql06.includes('ON CONFLICT (id_norma, codigo) WHERE deleted_at IS NULL DO UPDATE'));

  const sql07 = fs.readFileSync(path.join(QUERIES_DIR, '07_normas_requisitos_csv.sql'), 'utf8');
  assert.ok(sql07.includes('INSERT INTO public.norma'));
  assert.ok(sql07.includes('ON CONFLICT (codigo) WHERE deleted_at IS NULL DO UPDATE'));
  assert.ok(sql07.includes('INSERT INTO public.requisito'));
  assert.ok(sql07.includes('ON CONFLICT (id_norma, codigo) WHERE deleted_at IS NULL DO UPDATE'));
  assert.ok(sql07.includes('INSERT INTO public.requisito_traduccion'));
  assert.ok(sql07.includes('ON CONFLICT (id_requisito, lang) WHERE deleted_at IS NULL DO UPDATE'));
  assert.doesNotMatch(sql07, /\bDELETE\s+FROM\b/i);
  assert.ok(sql07.includes('f0000000-0000-0000-0000-000000000004'));
  assert.ok(sql07.includes('f0000000-0000-0000-0000-000000000085'));
  assert.ok(sql07.includes('es_obligatorio, obligatorio_origen'));
  assert.ok(sql07.includes("WHEN public.requisito.obligatorio_origen = 'MANUAL'"));

  const sql01 = fs.readFileSync(path.join(QUERIES_DIR, '01_creacion.sql'), 'utf8');
  assert.ok(sql01.includes('es_obligatorio BOOLEAN NOT NULL DEFAULT TRUE'));
  assert.ok(sql01.includes('chk_requisito_obligatorio_origen'));

  const sql03 = fs.readFileSync(path.join(QUERIES_DIR, '03_indices_optimizacion.sql'), 'utf8');
  assert.ok(sql03.includes('idx_requisito_norma_obligatorio_active'));
});

test('Step 1.1 Obligation Classifier: synthetic rules across chapters, debe/shall, placeholders, NOTA, inherited sub-bullets, and skeleton standards', () => {
  const stdTextId = 'e0000000-0000-0000-0000-000000009001';
  const stdSkelId = 'e0000000-0000-0000-0000-000000027001';

  const mkClause = (
    id: string,
    id_norma: string,
    codigo: string,
    id_requisito_padre: string | null,
    es_padre: boolean
  ): NormalizedClauseRecord => ({
    id,
    external_key: `ext_${id}`,
    id_norma,
    norma_codigo: id_norma === stdTextId ? 'ISO 9001:2015' : 'ISO/IEC 27001:2022',
    standard_slug: id_norma === stdTextId ? 'iso9001_2015' : 'iso27001_2022',
    id_requisito_padre,
    parent_external_key: id_requisito_padre ? `ext_${id_requisito_padre}` : null,
    codigo,
    explicit_code: false,
    es_obligatorio: true,
    obligatorio_origen: 'AUTO_TEXT',
    ruta_materializada: codigo.replace(/\./g, '_'),
    nivel: codigo.split('.').length,
    es_padre,
  });

  const mkTrans = (id_requisito: string, lang: 'es' | 'en', content_html: string): NormalizedTranslationRecord => ({
    id: `tr_${id_requisito}_${lang}`,
    external_key: `ext_tr_${id_requisito}_${lang}`,
    id_requisito,
    clause_external_key: `ext_${id_requisito}`,
    lang,
    title: `Title ${id_requisito}`,
    content_html,
  });

  const clauses: NormalizedClauseRecord[] = [
    // Text-hydrated standard
    mkClause('c1', stdTextId, '1', null, false),
    mkClause('c3_1', stdTextId, '3.1', null, false),
    mkClause('c4_4', stdTextId, '4.4', null, true),
    mkClause('c4_4_1', stdTextId, '4.4.1', 'c4_4', true),
    mkClause('c4_4_1_a', stdTextId, '4.4.1.a', 'c4_4_1', false),
    mkClause('c4_4_2', stdTextId, '4.4.2', 'c4_4', false),
    mkClause('c_nota', stdTextId, '6.1.3', null, false),
    mkClause('c_should', stdTextId, '6.1.4', null, false),
    mkClause('c_en_shall', stdTextId, '7.1.1', null, false),
    // Skeleton standard (no translations)
    mkClause('s1', stdSkelId, '1', null, false),
    mkClause('s4', stdSkelId, '4', null, true),
    mkClause('s4_1', stdSkelId, '4.1', 's4', false),
  ];

  const translations: NormalizedTranslationRecord[] = [
    mkTrans('c1', 'es', '<p>Capítulo introductorio que no debe contarse como auditable.</p>'),
    mkTrans('c3_1', 'en', '<p>Definition term shall not count in chapter 3.</p>'),
    mkTrans('c4_4', 'es', '<div>{clause_4.4.1} {clause_4.4.2}</div>'),
    mkTrans('c4_4_1', 'es', '<p>La organización debe establecer, implementar, mantener y mejorar continuamente:</p>'),
    mkTrans('c4_4_1_a', 'es', '<p>a) determinar las entradas requeridas y las salidas esperadas;</p>'),
    mkTrans('c4_4_2', 'es', '<p>NOTA 1: Esto es puramente informativo.</p><p>La organización debería conservar notas.</p>'),
    mkTrans('c_nota', 'es', '<p>NOTA: No contiene verbo de obligación.</p>'),
    mkTrans('c_should', 'en', '<p>The organization should consider preventive options.</p>'),
    mkTrans('c_en_shall', 'en', '<p>The organization shall determine and provide resources.</p>'),
  ];

  const classified = classifyNormalizedClausesObligation(clauses, translations);
  const byId = new Map(classified.map((c) => [c.id, c]));

  assert.equal(byId.get('c1')?.es_obligatorio, false);
  assert.equal(byId.get('c1')?.obligatorio_origen, 'AUTO_CHAPTER');
  assert.equal(byId.get('c3_1')?.es_obligatorio, false);
  assert.equal(byId.get('c3_1')?.obligatorio_origen, 'AUTO_CHAPTER');

  // Container with only {clause_...} placeholders must NOT inherit child 'debe'
  assert.equal(byId.get('c4_4')?.es_obligatorio, false);
  assert.equal(byId.get('c4_4')?.obligatorio_origen, 'AUTO_TEXT');

  // Own 'debe' / 'shall' -> AUTO_TEXT mandatory
  assert.equal(byId.get('c4_4_1')?.es_obligatorio, true);
  assert.equal(byId.get('c4_4_1')?.obligatorio_origen, 'AUTO_TEXT');
  assert.equal(byId.get('c_en_shall')?.es_obligatorio, true);
  assert.equal(byId.get('c_en_shall')?.obligatorio_origen, 'AUTO_TEXT');

  // Sub-bullet under mandatory parent -> AUTO_INHERITED
  assert.equal(byId.get('c4_4_1_a')?.es_obligatorio, true);
  assert.equal(byId.get('c4_4_1_a')?.obligatorio_origen, 'AUTO_INHERITED');

  // NOTA / debería / should -> non-mandatory AUTO_TEXT
  assert.equal(byId.get('c4_4_2')?.es_obligatorio, false);
  assert.equal(byId.get('c4_4_2')?.obligatorio_origen, 'AUTO_TEXT');
  assert.equal(byId.get('c_nota')?.es_obligatorio, false);
  assert.equal(byId.get('c_should')?.es_obligatorio, false);

  // Skeleton standard -> AUTO_CHAPTER for 0..3, AUTO_STRUCTURAL for 4+
  assert.equal(byId.get('s1')?.es_obligatorio, false);
  assert.equal(byId.get('s1')?.obligatorio_origen, 'AUTO_CHAPTER');
  assert.equal(byId.get('s4')?.es_obligatorio, false);
  assert.equal(byId.get('s4')?.obligatorio_origen, 'AUTO_STRUCTURAL');
  assert.equal(byId.get('s4_1')?.es_obligatorio, true);
  assert.equal(byId.get('s4_1')?.obligatorio_origen, 'AUTO_STRUCTURAL');
});

test('Step 1.1 Full Bundle Parity: ISO 9001:2015 chapters 1..3 = 0 mandatory, 4.4 container = false, 4.4.1 & 4.4.1.a = true, skeleton leaves = true', () => {
  const bundle = expandNormasCatalogBundle();
  const iso9001 = bundle.standards.find((s) => s.codigo === 'ISO 9001:2015')!;
  const iso27001 = bundle.standards.find((s) => s.codigo === 'ISO/IEC 27001:2022')!;
  assert.ok(iso9001);
  assert.ok(iso27001);

  const iso9001Clauses = bundle.clauses.filter((c) => c.id_norma === iso9001.id);
  const iso9001ByCode = new Map(iso9001Clauses.map((c) => [c.codigo, c]));

  const ch1to3Mandatory = iso9001Clauses.filter(
    (c) => ['0', '1', '2', '3'].includes(c.codigo.split('.')[0] ?? '') && c.es_obligatorio
  );
  assert.equal(ch1to3Mandatory.length, 0);

  assert.equal(iso9001ByCode.get('4')?.es_obligatorio, false);
  assert.equal(iso9001ByCode.get('4.4')?.es_obligatorio, false);
  assert.equal(iso9001ByCode.get('4.1')?.es_obligatorio, true);
  assert.equal(iso9001ByCode.get('4.1')?.obligatorio_origen, 'AUTO_TEXT');
  assert.equal(iso9001ByCode.get('4.4.1')?.es_obligatorio, true);
  assert.equal(iso9001ByCode.get('4.4.1')?.obligatorio_origen, 'AUTO_TEXT');
  assert.equal(iso9001ByCode.get('4.4.1.a')?.es_obligatorio, true);
  assert.equal(iso9001ByCode.get('4.4.1.a')?.obligatorio_origen, 'AUTO_INHERITED');

  const iso27001Clauses = bundle.clauses.filter((c) => c.id_norma === iso27001.id);
  const iso27001Leaves = iso27001Clauses.filter(
    (c) => !c.es_padre && !['0', '1', '2', '3'].includes(c.codigo.split('.')[0] ?? '')
  );
  assert.ok(iso27001Leaves.length > 0);
  assert.ok(
    iso27001Leaves.every((c) => c.es_obligatorio === true && c.obligatorio_origen === 'AUTO_STRUCTURAL')
  );
});

