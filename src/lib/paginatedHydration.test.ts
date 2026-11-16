import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assembleHydratedNormasAndRequisitos,
  computeNormaClausulaCounts,
  extractPlainClauseDescription,
  fetchAllPagedRows,
  getBundledNormaCatalog,
  indexTranslationsByRequisitoId,
  type RawNormaRow,
  type RawRequisitoRow,
  type RawRequisitoTraduccionRow,
} from './paginatedHydration';
import {
  INITIAL_NORMAS,
  REQUISITO_TITLE_MAX_LENGTH,
  createEmptyRequisitoFormDraft,
  createRequisitoDraftFromEntity,
  validateRequisitoDraft,
} from './extraDomain';
import { expandNormasCatalogBundle } from './generated/normasCatalogBundle';
import { assertZeroUuidExposure } from './zeroUuid';

describe('Step 2.2 Paginated Hydration & Bilingual Requisito Governance', () => {
  it('fetchAllPagedRows paginates past the 1,000-row PostgREST limit for 2,188 clauses and 2,684 translations', async () => {
    const allClauseIndices = Array.from({ length: 2188 }, (_, idx) => ({ id: `clause-${idx}` }));
    const clauseRangeCalls: Array<[number, number]> = [];
    const clauseResult = await fetchAllPagedRows(async (from, to) => {
      clauseRangeCalls.push([from, to]);
      return {
        data: allClauseIndices.slice(from, to + 1),
        error: null,
      };
    }, 1000);

    assert.equal(clauseResult.error, null);
    assert.equal(clauseResult.data.length, 2188);
    assert.equal(clauseResult.pagesFetched, 3);
    assert.deepEqual(clauseRangeCalls, [
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);

    const allTransIndices = Array.from({ length: 2684 }, (_, idx) => ({ id: `trans-${idx}` }));
    const transResult = await fetchAllPagedRows(async (from, to) => ({
      data: allTransIndices.slice(from, to + 1),
      error: null,
    }), 1000);

    assert.equal(transResult.error, null);
    assert.equal(transResult.data.length, 2684);
    assert.equal(transResult.pagesFetched, 3);

    // Exact multiple of pageSize (2,000 rows) terminates cleanly on empty 3rd page
    const exactMultiple = Array.from({ length: 2000 }, (_, idx) => ({ id: idx }));
    const exactRes = await fetchAllPagedRows(
      async (from, to) => ({ data: exactMultiple.slice(from, to + 1), error: null }),
      1000
    );
    assert.equal(exactRes.data.length, 2000);
    assert.equal(exactRes.pagesFetched, 3);

    // Error stops pagination immediately and surfaces the error cleanly
    const failedRes = await fetchAllPagedRows(async (from) => {
      if (from >= 1000) {
        return { data: null, error: { message: 'network timeout', code: '503' } };
      }
      return { data: exactMultiple.slice(0, 1000), error: null };
    }, 1000);
    assert.equal(failedRes.error?.code, '503');
    assert.equal(failedRes.data.length, 1000);
    assert.equal(failedRes.pagesFetched, 2);
  });

  it('assembles 8 standards, 2,188 clauses, and 2,684 bilingual translations with exact dynamic clausulas_count', () => {
    const bundle = expandNormasCatalogBundle();
    const rawNormas: RawNormaRow[] = bundle.standards.map((s) => ({
      id: s.id,
      esquema: s.esquema,
      codigo: s.codigo,
      titulo: s.titulo,
      estatus: s.estatus,
      fecha_publicacion: s.fecha_publicacion,
      norma: s.norma,
    }));

    const normaById = new Map(bundle.standards.map((s) => [s.id, s]));
    const rawRequisitos: RawRequisitoRow[] = bundle.clauses.map((c) => {
      const std = normaById.get(c.id_norma);
      return {
        id: c.id,
        id_norma: c.id_norma,
        id_requisito_padre: c.id_requisito_padre,
        codigo: c.codigo,
        explicit_code: c.explicit_code,
        ruta_materializada: c.ruta_materializada,
        norma: std ? { id: std.id, codigo: std.codigo, norma: std.norma } : null,
      };
    });

    const rawTranslations: RawRequisitoTraduccionRow[] = bundle.translations.map((t) => ({
      id: t.id,
      id_requisito: t.id_requisito,
      lang: t.lang,
      title: t.title,
      content_html: t.content_html,
      updated_at: '2026-01-15T00:00:00.000Z',
    }));

    const assembled = assembleHydratedNormasAndRequisitos({
      rawNormas,
      rawRequisitos,
      rawTranslations,
      translationsTableMissing: false,
    });

    assert.equal(assembled.usedOfflineBundleFallback, false);
    assert.equal(assembled.usedTranslationFallback, false);
    assert.equal(assembled.standards.length, 8);
    assert.equal(assembled.requirementsCatalog.length, 2188);
    assert.equal(assembled.requirements.length, 2188);

    const totalCountAcrossStandards = assembled.standards.reduce(
      (sum, std) => sum + (std.clausulas_count ?? 0),
      0
    );
    assert.equal(totalCountAcrossStandards, 2188);

    // Check realistic dynamic clause counts (never legacy hardcoded 7 or 5)
    const iso9001 = assembled.standards.find((s) => s.codigo.includes('9001'));
    const iso22000 = assembled.standards.find((s) => s.codigo.includes('22000'));
    assert.ok(iso9001 && (iso9001.clausulas_count ?? 0) > 100);
    assert.ok(iso22000 && (iso22000.clausulas_count ?? 0) > 100);
    assert.notEqual(iso9001.clausulas_count, 7);
    assert.notEqual(iso22000.clausulas_count, 5);

    // Check translation indexing & plain description extraction
    const transMap = indexTranslationsByRequisitoId(rawTranslations);
    assert.equal(transMap.size, 1342);
    const translatedClause = assembled.requirementsCatalog.find(
      (r) => Boolean(r.translations?.es?.content_html)
    );
    assert.ok(translatedClause);
    assert.ok(translatedClause.titulo.length > 0);
    assert.ok(!/<[^>]+>/.test(translatedClause.descripcion || ''));
    assert.equal(assertZeroUuidExposure(translatedClause.titulo).compliant, true);
    assert.equal(assertZeroUuidExposure(translatedClause.descripcion || '').compliant, true);

    // Verify dynamic recompute ignores soft-deleted clauses
    const firstActive = assembled.requirementsCatalog[0];
    const modifiedCatalog = assembled.requirementsCatalog.map((r, idx) =>
      idx === 0 ? { ...r, deleted_at: '2026-02-01T00:00:00.000Z' } : r
    );
    const updatedCounts = computeNormaClausulaCounts(assembled.standards, modifiedCatalog);
    const origStdCount =
      assembled.standards.find((s) => s.id === firstActive.id_norma)?.clausulas_count ?? 0;
    assert.equal(updatedCounts.get(firstActive.id_norma), origStdCount - 1);
  });

  it('degrades gracefully when requisito_traduccion is missing or when offline', () => {
    const bundle = expandNormasCatalogBundle();
    const rawNormas: RawNormaRow[] = bundle.standards.map((s) => ({
      id: s.id,
      esquema: s.esquema,
      codigo: s.codigo,
      titulo: s.titulo,
      estatus: s.estatus,
      fecha_publicacion: s.fecha_publicacion,
      norma: s.norma,
    }));
    const rawRequisitos: RawRequisitoRow[] = bundle.clauses.map((c) => ({
      id: c.id,
      id_norma: c.id_norma,
      id_requisito_padre: c.id_requisito_padre,
      codigo: c.codigo,
      ruta_materializada: c.ruta_materializada,
    }));

    // Case 1: requisito_traduccion table not yet migrated in DB -> falls back to bundled translations cleanly
    const missingTransOutcome = assembleHydratedNormasAndRequisitos({
      rawNormas,
      rawRequisitos,
      rawTranslations: null,
      translationsTableMissing: true,
    });
    assert.equal(missingTransOutcome.usedTranslationFallback, true);
    assert.equal(missingTransOutcome.usedOfflineBundleFallback, false);
    assert.equal(missingTransOutcome.requirementsCatalog.length, 2188);
    assert.ok(
      missingTransOutcome.requirementsCatalog.some(
        (r) => Boolean(r.translations?.es?.title || r.translations?.en?.title)
      )
    );

    // Case 2: complete offline fallback -> serves 8 standards + 2,188 clauses from bundle
    const offlineOutcome = assembleHydratedNormasAndRequisitos({
      rawNormas: null,
      rawRequisitos: null,
      rawTranslations: null,
      existingStandardsFallback: INITIAL_NORMAS,
    });
    assert.equal(offlineOutcome.usedOfflineBundleFallback, true);
    assert.equal(offlineOutcome.standards.length, 8);
    assert.equal(offlineOutcome.requirementsCatalog.length, 2188);
    assert.equal(
      offlineOutcome.standards.reduce((sum, s) => sum + (s.clausulas_count ?? 0), 0),
      2188
    );

    // Cached bundle catalog consistency
    const cached = getBundledNormaCatalog();
    assert.equal(cached.standards.length, 8);
    assert.equal(cached.requirementsCatalog.length, 2188);
    assert.equal(extractPlainClauseDescription(undefined, 'Respaldo'), 'Respaldo');
  });

  it('validates and sanitizes bilingual RequisitoFormDraft inputs cleanly', () => {
    const cached = getBundledNormaCatalog();
    const targetNorma = cached.standards[0];
    const sampleParent = cached.requirementsCatalog.find(
      (r) => r.id_norma === targetNorma.id && r.codigo === '4.1'
    );
    assert.ok(sampleParent);

    const roundTrip = createRequisitoDraftFromEntity(sampleParent);
    assert.equal(roundTrip.codigo, sampleParent.codigo);
    assert.equal(roundTrip.explicit_code, Boolean(sampleParent.explicit_code));

    const emptyDraft = createEmptyRequisitoFormDraft(targetNorma.id, sampleParent.id);
    const maliciousDraft = {
      ...emptyDraft,
      codigo: '4.1.99',
      explicit_code: true,
      title_es: '  Control documental <script>  ',
      content_html_es:
        '<p>Ver {clause_4.1} y aplicar <strong>registro</strong>.</p><script>alert(1)</script><img src="x" onerror="alert(2)">',
      title_en: '  Document control  ',
      content_html_en:
        '<p><a href="javascript:alert(3)">Unsafe</a> and <a href="https://iso.org">ISO</a></p>',
    };

    const validated = validateRequisitoDraft(maliciousDraft, cached.requirementsCatalog);
    assert.equal(validated.valid, true);
    assert.ok(validated.normalized);
    assert.equal(validated.normalized.explicit_code, true);
    assert.equal(validated.normalized.title_es, 'Control documental <script>');
    assert.ok(validated.normalized.content_html_es.includes('{clause_4.1}'));
    assert.ok(validated.normalized.content_html_es.includes('<strong>registro</strong>'));
    assert.ok(!validated.normalized.content_html_es.includes('<script'));
    assert.ok(!validated.normalized.content_html_es.includes('onerror'));
    assert.ok(!validated.normalized.content_html_en.includes('javascript:'));
    assert.ok(validated.normalized.content_html_en.includes('https://iso.org'));

    const oversizedTitle = validateRequisitoDraft(
      {
        ...emptyDraft,
        codigo: '4.1.98',
        title_es: 'A'.repeat(REQUISITO_TITLE_MAX_LENGTH + 1),
      },
      cached.requirementsCatalog
    );
    assert.equal(oversizedTitle.valid, false);
  });
});
