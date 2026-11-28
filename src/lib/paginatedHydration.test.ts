import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assembleAlcanceByCertificate,
  assembleCertificateVersionsAndChildCollections,
  assembleHydratedNormasAndRequisitos,
  computeNormaClausulaCounts,
  evaluateCertificateVersionCoverage,
  extractPlainClauseDescription,
  fetchAllPagedRows,
  getBundledNormaCatalog,
  hydrateOrganizacionesWithVersions,
  indexTranslationsByRequisitoId,
  normalizeSeededCertificadosWithVersionAndAlcance,
  resolveAuditCertificateVersionMeta,
  type RawAlcanceCompartidoRow,
  type RawAlcanceRow,
  type RawCertificadoVersionRow,
  type RawNormaRow,
  type RawOrganizacionRow,
  type RawOrganizacionVersionRow,
  type RawRequisitoRow,
  type RawRequisitoTraduccionRow,
} from './paginatedHydration';
import {
  INITIAL_CERTIFICADOS_DETAILED,
  INITIAL_CONG_IND_01_EXTRA_CERTIFICADOS_DETAILED,
  type CertificadoDetailEntity,
} from './multisiteSampling';
import { INITIAL_ORGANIZACIONES } from './activeCertificates';
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
        es_obligatorio: c.es_obligatorio,
        obligatorio_origen: c.obligatorio_origen,
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

  it('Step 1.1 maps es_obligatorio & obligatorio_origen with pre-migration fallback and tracks MANUAL overrides on draft edit', () => {
    const bundle = expandNormasCatalogBundle();
    const iso9001 = bundle.standards.find((s) => s.codigo === 'ISO 9001:2015')!;
    const clause44 = bundle.clauses.find((c) => c.id_norma === iso9001.id && c.codigo === '4.4')!;
    const clause441 = bundle.clauses.find((c) => c.id_norma === iso9001.id && c.codigo === '4.4.1')!;
    const clause441a = bundle.clauses.find((c) => c.id_norma === iso9001.id && c.codigo === '4.4.1.a')!;

    // Pre-migration RawRequisitoRow (omits es_obligatorio & obligatorio_origen) + custom chapter 2 & leaf rows
    const rawNormas: RawNormaRow[] = [
      {
        id: iso9001.id,
        esquema: iso9001.esquema,
        codigo: iso9001.codigo,
        titulo: iso9001.titulo,
        estatus: iso9001.estatus,
        fecha_publicacion: iso9001.fecha_publicacion,
        norma: iso9001.norma,
      },
    ];
    const customCh2Id = 'f9999999-0000-0000-0000-000000000002';
    const customManualId = 'f9999999-0000-0000-0000-000000000099';
    const rawRequisitos: RawRequisitoRow[] = [
      {
        id: clause44.id,
        id_norma: iso9001.id,
        id_requisito_padre: clause44.id_requisito_padre,
        codigo: clause44.codigo,
        ruta_materializada: clause44.ruta_materializada,
      },
      {
        id: clause441.id,
        id_norma: iso9001.id,
        id_requisito_padre: clause441.id_requisito_padre,
        codigo: clause441.codigo,
        ruta_materializada: clause441.ruta_materializada,
      },
      {
        id: clause441a.id,
        id_norma: iso9001.id,
        id_requisito_padre: clause441a.id_requisito_padre,
        codigo: clause441a.codigo,
        ruta_materializada: clause441a.ruta_materializada,
      },
      {
        id: customCh2Id,
        id_norma: iso9001.id,
        id_requisito_padre: null,
        codigo: '2.1',
        ruta_materializada: '2.2_1',
      },
      {
        id: customManualId,
        id_norma: iso9001.id,
        id_requisito_padre: null,
        codigo: '10.9',
        es_obligatorio: false,
        obligatorio_origen: 'MANUAL',
        ruta_materializada: '10.10_9',
      },
    ];

    const assembled = assembleHydratedNormasAndRequisitos({
      rawNormas,
      rawRequisitos,
      rawTranslations: [],
      translationsTableMissing: false,
    });
    const byId = new Map(assembled.requirementsCatalog.map((r) => [r.id, r]));

    assert.equal(byId.get(clause44.id)?.es_obligatorio, false);
    assert.equal(byId.get(clause44.id)?.obligatorio_origen, 'AUTO_TEXT');
    assert.equal(byId.get(clause441a.id)?.es_obligatorio, true);
    assert.equal(byId.get(clause441a.id)?.obligatorio_origen, 'AUTO_INHERITED');
    assert.equal(byId.get(customCh2Id)?.es_obligatorio, false);
    assert.equal(byId.get(customCh2Id)?.obligatorio_origen, 'AUTO_CHAPTER');
    assert.equal(byId.get(customManualId)?.es_obligatorio, false);
    assert.equal(byId.get(customManualId)?.obligatorio_origen, 'MANUAL');

    // Editing title/HTML without changing es_obligatorio preserves original obligatorio_origen
    const existing441a = byId.get(clause441a.id)!;
    const unchangedDraft = createRequisitoDraftFromEntity(existing441a);
    const unchangedValidation = validateRequisitoDraft(
      { ...unchangedDraft, title_es: 'Subrequisito actualizado' },
      assembled.requirementsCatalog,
      existing441a.id
    );
    assert.equal(unchangedValidation.valid, true);
    assert.equal(unchangedValidation.normalized?.es_obligatorio, true);
    assert.equal(unchangedValidation.normalized?.obligatorio_origen, 'AUTO_INHERITED');

    // Explicitly toggling es_obligatorio marks obligatorio_origen as MANUAL
    const toggledValidation = validateRequisitoDraft(
      { ...unchangedDraft, es_obligatorio: false },
      assembled.requirementsCatalog,
      existing441a.id
    );
    assert.equal(toggledValidation.valid, true);
    assert.equal(toggledValidation.normalized?.es_obligatorio, false);
    assert.equal(toggledValidation.normalized?.obligatorio_origen, 'MANUAL');
  });
});

describe('Step 3.1 Versioned Org/Cert & Bilingual Alcance Hydration', () => {
  it('hydrateOrganizacionesWithVersions orders version_numero DESC and hydrates abreviacion + versiones into allOrganizaciones & organizations', () => {
    const rawOrgs: RawOrganizacionRow[] = [
      {
        id: '30000000-0000-0000-0000-000000000001',
        id_grupo_empresarial: '20000000-0000-0000-0000-000000000001',
        nombre: 'Iberometal Componentes S.A.',
        abreviacion: 'IBEROMETAL',
        rif: 'J-30492817-0',
      },
    ];
    const rawVersions: RawOrganizacionVersionRow[] = [
      {
        id: '31000000-0000-0000-0000-000000000001',
        id_organizacion: '30000000-0000-0000-0000-000000000001',
        version_numero: 1,
        es_version_actual: false,
        nombre: 'Iberometal Componentes C.A.',
        abreviacion: 'IBERO-V1',
        rif: 'J-30492817-0',
      },
      {
        id: '31000000-0000-0000-0000-000000000101',
        id_organizacion: '30000000-0000-0000-0000-000000000001',
        version_numero: 2,
        es_version_actual: true,
        nombre: 'Iberometal Componentes S.A.',
        abreviacion: 'IBEROMETAL',
        rif: 'J-30492817-0',
      },
    ];

    const hydrated = hydrateOrganizacionesWithVersions({
      rawOrganizaciones: rawOrgs,
      rawOrganizacionVersions: rawVersions,
      includeSeedFallback: false,
      seedOrganizaciones: INITIAL_ORGANIZACIONES,
    });

    assert.equal(hydrated.allOrganizaciones.length, 1);
    const org = hydrated.allOrganizaciones[0];
    assert.equal(org.abreviacion, 'IBEROMETAL');
    assert.equal(org.version_actual_numero, 2);
    assert.equal(org.id_organizacion_version_actual, '31000000-0000-0000-0000-000000000101');
    assert.deepEqual(
      org.versiones?.map((v) => v.version_numero),
      [2, 1]
    );
    assert.equal(hydrated.organizations[0].abreviacion, 'IBEROMETAL');
    assert.equal(hydrated.organizations[0].version_actual_numero, 2);
  });

  it('assembleAlcanceByCertificate resolves own, shared (esCompartido + origenCertificadoNumero), and null alcance', () => {
    const rawAlcances: RawAlcanceRow[] = [
      {
        id: 'a1c00000-0000-0000-0000-000000000001',
        id_certificado: '40000000-0000-0000-0000-000000000001',
        alcance_es: 'Manufactura de piezas metálicas.',
        alcance_en: 'Metal parts manufacturing.',
      },
    ];
    const rawShares: RawAlcanceCompartidoRow[] = [
      {
        id: 'a1c50000-0000-0000-0000-000000000001',
        id_alcance: 'a1c00000-0000-0000-0000-000000000001',
        id_certificado: '40000000-0000-0000-0000-000000000008',
      },
    ];

    const byCert = assembleAlcanceByCertificate({
      certificados: [
        { id: '40000000-0000-0000-0000-000000000001', numero_certificado: 'FN-QMS-2024-001' },
        { id: '40000000-0000-0000-0000-000000000008', numero_certificado: 'FN-QMS-2026-008' },
        { id: '40000000-0000-0000-0000-000000000007', numero_certificado: 'FN-ISMS-2026-007' },
      ],
      rawAlcances,
      rawSharedAlcances: rawShares,
    });

    const own = byCert.get('40000000-0000-0000-0000-000000000001');
    assert.ok(own);
    assert.equal(own.esCompartido, false);
    assert.equal(own.sharedTargetCerts.length, 1);
    assert.equal(own.sharedTargetCerts[0].numero_certificado, 'FN-QMS-2026-008');

    const shared = byCert.get('40000000-0000-0000-0000-000000000008');
    assert.ok(shared);
    assert.equal(shared.esCompartido, true);
    assert.equal(shared.origenCertificadoNumero, 'FN-QMS-2024-001');
    assert.equal(shared.alcance_en, 'Metal parts manufacturing.');

    assert.equal(byCert.get('40000000-0000-0000-0000-000000000007'), null);
  });

  it('assembleCertificateVersionsAndChildCollections groups children & turnos by version and evaluates version coverage on demand', () => {
    const baseSeed = INITIAL_CERTIFICADOS_DETAILED.find(
      (c) => c.id === '40000000-0000-0000-0000-000000000002'
    )!;
    const v1Id = '41000000-0000-0000-0000-000000000002';
    const v2Id = '41000000-0000-0000-0000-000000000202';

    const mixedCert: CertificadoDetailEntity = {
      ...baseSeed,
      sitios: [
        ...baseSeed.sitios.map((s) => ({ ...s, id_certificado_version: v2Id })),
        {
          id: '50000000-0000-0000-0000-000000000901',
          id_certificado: baseSeed.id,
          id_certificado_version: v1Id,
          numero_sitio: 0,
          nombre_sitio: 'Planta Histórica v1',
          direccion_sitio: 'Zona Industrial Antigua',
          tipo_sitio: 'Sede Principal',
          personal_count: 80,
        },
      ],
      procesos: [
        ...baseSeed.procesos.map((p) => ({ ...p, id_certificado_version: v2Id })),
        {
          id: '60000000-0000-0000-0000-000000000901',
          id_certificado: baseSeed.id,
          id_certificado_version: v1Id,
          nombre_proceso: 'Proceso Histórico v1',
          tipo: 'Medular',
          clausulas_cubiertas: ['4.1'],
          requisitos_detalle: [{ codigo: '4.1', titulo: 'Comprensión de la organización' }],
        },
      ],
      turnos: [
        ...baseSeed.turnos,
        {
          id: '70000000-0000-0000-0000-000000000901',
          hora_entrada: '22:00:00',
          hora_salida: '06:00:00',
          descripcion: 'Turno Nocturno v1',
          empleados_activos: 20,
          sitios_vinculados: ['Planta Histórica v1'],
          id_certificado_version: v1Id,
        },
      ],
    };

    const rawVersions: RawCertificadoVersionRow[] = [
      {
        id: v1Id,
        id_certificado: baseSeed.id,
        id_organizacion_version: '31000000-0000-0000-0000-000000000001',
        version_numero: 1,
        es_version_actual: false,
        notas_version: 'Versión histórica v1',
      },
      {
        id: v2Id,
        id_certificado: baseSeed.id,
        id_organizacion_version: '31000000-0000-0000-0000-000000000101',
        version_numero: 2,
        es_version_actual: true,
        notas_version: 'Versión vigente v2',
      },
    ];

    const catalog = getBundledNormaCatalog().requirementsCatalog;
    const assembled = assembleCertificateVersionsAndChildCollections({
      cert: mixedCert,
      rawVersions,
      requirementsCatalog: catalog,
    });

    assert.equal(assembled.id_certificado_version, v2Id);
    assert.equal(assembled.version_actual_numero, 2);
    assert.equal(assembled.versiones?.length, 2);
    assert.equal(assembled.versiones?.[0].version_numero, 2);
    assert.equal(assembled.versiones?.[1].version_numero, 1);
    assert.equal(
      assembled.sitios.some((s) => s.id === '50000000-0000-0000-0000-000000000901'),
      false
    );
    assert.equal(
      assembled.versiones?.[1].sitios.some((s) => s.id === '50000000-0000-0000-0000-000000000901'),
      true
    );
    assert.equal(
      assembled.versiones?.[1].turnos.some((t) => t.id === '70000000-0000-0000-0000-000000000901'),
      true
    );

    const v1Coverage = evaluateCertificateVersionCoverage({
      cert: assembled,
      requirementsCatalog: catalog,
      targetVersionId: v1Id,
    });
    assert.equal(v1Coverage.versionId, v1Id);
    assert.ok(v1Coverage.cobertura.total_obligatorios > 0);
  });

  it('normalizeSeededCertificadosWithVersionAndAlcance and resolveAuditCertificateVersionMeta preserve seed parity', () => {
    const hydratedOrgs = hydrateOrganizacionesWithVersions({
      includeSeedFallback: true,
      seedOrganizaciones: INITIAL_ORGANIZACIONES,
    });
    const catalog = getBundledNormaCatalog().requirementsCatalog;
    const normalizedBase = normalizeSeededCertificadosWithVersionAndAlcance(
      INITIAL_CERTIFICADOS_DETAILED,
      hydratedOrgs.allOrganizaciones,
      catalog
    );

    const cert001 = normalizedBase.certificados.find(
      (c) => c.id === '40000000-0000-0000-0000-000000000001'
    )!;
    assert.equal(cert001.organizacion_abreviacion, 'IBEROMETAL');

    const cert002 = normalizedBase.certificados.find(
      (c) => c.id === '40000000-0000-0000-0000-000000000002'
    )!;
    assert.equal(cert002.version_actual_numero, 2);
    assert.equal(cert002.versiones?.length, 2);
    assert.equal(cert002.organizacion_abreviacion, 'CYBERCLOUD');

    const rawCert001 = INITIAL_CERTIFICADOS_DETAILED.find(
      (c) => c.id === '40000000-0000-0000-0000-000000000001'
    )!;
    const baseCert004 = INITIAL_CERTIFICADOS_DETAILED.find(
      (c) => c.id === '40000000-0000-0000-0000-000000000004'
    )!;
    const seed007: CertificadoDetailEntity = {
      ...baseCert004,
      id: '40000000-0000-0000-0000-000000000007',
      numero_certificado: 'FN-ISMS-2026-007',
      id_organizacion: '30000000-0000-0000-0000-000000000002',
      organizacion_nombre: 'CyberCloud Solutions S.L.',
      alcance: '',
    };
    const normalizedCong = normalizeSeededCertificadosWithVersionAndAlcance(
      [rawCert001, ...INITIAL_CONG_IND_01_EXTRA_CERTIFICADOS_DETAILED, seed007],
      hydratedOrgs.allOrganizaciones,
      catalog
    );

    const cert001Cong = normalizedCong.certificados.find(
      (c) => c.id === '40000000-0000-0000-0000-000000000001'
    )!;
    assert.equal(cert001Cong.alcanceDetalle?.esCompartido, false);
    assert.equal(
      cert001Cong.alcanceDetalle?.sharedTargetCerts[0]?.numero_certificado,
      'FN-QMS-2026-008'
    );

    const cert002Ibero = normalizedCong.certificados.find(
      (c) => c.id === '40000000-0000-0000-0000-000000000002'
    )!;
    assert.equal(cert002Ibero.organizacion_abreviacion, 'IBEROMETAL');

    const cert007 = normalizedCong.certificados.find(
      (c) => c.id === '40000000-0000-0000-0000-000000000007'
    )!;
    assert.equal(cert007.alcanceDetalle, null);

    const cert008 = normalizedCong.certificados.find(
      (c) => c.id === '40000000-0000-0000-0000-000000000008'
    )!;
    assert.equal(cert008.alcanceDetalle?.esCompartido, true);
    assert.equal(cert008.alcanceDetalle?.origenCertificadoNumero, 'FN-QMS-2024-001');

    const auditMetaDefault = resolveAuditCertificateVersionMeta({
      id_certificado: cert002.id,
      certificados: normalizedBase.certificados,
    });
    assert.equal(auditMetaDefault.id_certificado_version, '41000000-0000-0000-0000-000000000202');
    assert.equal(auditMetaDefault.version_numero, 2);

    const auditMetaHistorical = resolveAuditCertificateVersionMeta({
      id_certificado: cert002.id,
      rawIdCertificadoVersion: '41000000-0000-0000-0000-000000000002',
      certificados: normalizedBase.certificados,
    });
    assert.equal(auditMetaHistorical.id_certificado_version, '41000000-0000-0000-0000-000000000002');
    assert.equal(auditMetaHistorical.version_numero, 1);
  });

  it('preserves owned unversioned turnos matched by site name or turnos_por_sitio while isolating v1-only site shifts', () => {
    const baseSeed = INITIAL_CERTIFICADOS_DETAILED.find(
      (c) => c.id === '40000000-0000-0000-0000-000000000002'
    )!;
    const v1Id = '41000000-0000-0000-0000-000000000091';
    const v2Id = '41000000-0000-0000-0000-000000000092';
    const siteCadiproId = '6efe5ad5-81a8-4a06-8107-1b7b65712ca7';
    const siteV1Id = '50000000-0000-0000-0000-000000000991';
    const ownedTurnoId = '70000000-0000-0000-0000-000000000004';
    const nameMatchedTurnoId = '70000000-0000-0000-0000-000000000995';
    const v1OnlyTurnoId = '70000000-0000-0000-0000-000000000996';

    const cert9001Style: CertificadoDetailEntity = {
      ...baseSeed,
      id: '14c1c36d-636e-437e-97ba-08ad845908f1',
      numero_certificado: '9001-885-03-10-2020',
      sitios: [
        {
          id: siteCadiproId,
          id_certificado: '14c1c36d-636e-437e-97ba-08ad845908f1',
          id_certificado_version: v2Id,
          numero_sitio: 0,
          nombre_sitio: 'Planta CADIPRO',
          direccion_sitio: 'Táchira',
          tipo_sitio: 'Sede Principal',
          personal_count: 102,
          turnos_por_sitio: [
            {
              id: '72000000-0000-0000-0000-000000000991',
              id_sitio: siteCadiproId,
              id_turno: ownedTurnoId,
              hora_entrada: '08:00:00',
              hora_salida: '17:00:00',
              descripcion: 'Administrativo 08-17',
              deleted_at: null,
            },
          ],
        },
        {
          id: siteV1Id,
          id_certificado: '14c1c36d-636e-437e-97ba-08ad845908f1',
          id_certificado_version: v1Id,
          numero_sitio: 1,
          nombre_sitio: 'Sede Histórica v1',
          direccion_sitio: 'Antigua Sede',
          tipo_sitio: 'Sucursal',
          personal_count: 25,
          turnos_por_sitio: [
            {
              id: '72000000-0000-0000-0000-000000000992',
              id_sitio: siteV1Id,
              id_turno: v1OnlyTurnoId,
              hora_entrada: '22:00:00',
              hora_salida: '06:00:00',
              descripcion: 'Nocturno Histórico',
              deleted_at: null,
            },
          ],
        },
      ],
      turnos: [
        {
          id: ownedTurnoId,
          hora_entrada: '08:00:00',
          hora_salida: '17:00:00',
          descripcion: 'Administrativo 08-17',
          sitios_vinculados: ['Planta CADIPRO'],
          // Notice: id_certificado_version intentionally undefined (owned shift from turnos_por_sitio)
        },
        {
          id: nameMatchedTurnoId,
          hora_entrada: '14:00:00',
          hora_salida: '22:00:00',
          descripcion: 'Operativo 14-22',
          sitios_vinculados: ['planta cadipro'],
        },
        {
          id: v1OnlyTurnoId,
          hora_entrada: '22:00:00',
          hora_salida: '06:00:00',
          descripcion: 'Nocturno Histórico',
          sitios_vinculados: ['Sede Histórica v1'],
        },
      ],
    };

    const rawVersions: RawCertificadoVersionRow[] = [
      {
        id: v1Id,
        id_certificado: cert9001Style.id,
        id_organizacion_version: '31000000-0000-0000-0000-000000000001',
        version_numero: 1,
        es_version_actual: false,
      },
      {
        id: v2Id,
        id_certificado: cert9001Style.id,
        id_organizacion_version: '31000000-0000-0000-0000-000000000101',
        version_numero: 2,
        es_version_actual: true,
      },
    ];

    const assembled = assembleCertificateVersionsAndChildCollections({
      cert: cert9001Style,
      rawVersions,
      requirementsCatalog: getBundledNormaCatalog().requirementsCatalog,
    });

    assert.equal(assembled.turnos.some((t) => t.id === ownedTurnoId), true);
    assert.equal(assembled.turnos.some((t) => t.id === nameMatchedTurnoId), true);
    assert.equal(assembled.turnos.some((t) => t.id === v1OnlyTurnoId), false);
    assert.equal(assembled.versiones?.[0].turnos.length, 2);
    assert.equal(assembled.versiones?.[1].turnos.some((t) => t.id === v1OnlyTurnoId), true);
  });
});



