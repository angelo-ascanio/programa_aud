import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { UserProfile } from './healthCheck';
import { assertZeroUuidExposure } from './zeroUuid';
import {
  INITIAL_ACREDITACIONES,
  INITIAL_NORMAS,
  INITIAL_ORGANISMOS,
  INITIAL_SECTORES_IAF,
  type NormaEntity,
  type RequisitoLtree,
} from './extraDomain';
import { getAllSeededNormaRequirements } from './procesoDomain';
import { getBundledNormaCatalog } from './paginatedHydration';
import {
  highlightSanitizedClauseHtml,
  orderNormaRequisitosHierarchically,
  renderNormaFullReaderBody,
} from './normaFullReader';
import { renderNormaView } from '../views/normaView';
import { renderRequisitoView } from '../views/requisitoView';
import { renderExtraView } from '../views/extraView';

const ADMIN_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000001',
  nombre: 'Administrador Principal',
  role: 'ADMIN',
  status: 'APPROVED',
};

const CLIENT_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000004',
  nombre: 'Cliente Demo',
  role: 'CLIENT',
  status: 'APPROVED',
};

const AUDITOR_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000003',
  nombre: 'Auditor Demo',
  role: 'AUDITOR',
  status: 'APPROVED',
};

const TEST_NORMA: NormaEntity = {
  id: 'e0000000-0000-0000-0000-000000009001',
  codigo: 'ISO 9001:2015',
  titulo: 'Sistemas de Gestión de la Calidad — Requisitos',
  estatus: 'Vigente',
  esquema: 'SGC - Calidad',
  fecha_publicacion: '2015-09-15',
  norma: 'ISO 9001:2015',
  clausulas_count: 10,
  acreditaciones_count: 1,
};

function makeRequisito(overrides: Partial<RequisitoLtree> & { id: string; codigo: string }): RequisitoLtree {
  return {
    id_norma: TEST_NORMA.id,
    id_requisito_padre: null,
    ruta_materializada: overrides.codigo.replace(/\./g, '_'),
    norma_codigo: TEST_NORMA.codigo,
    titulo: `Título ${overrides.codigo}`,
    descripcion: `Descripción ${overrides.codigo}`,
    ...overrides,
  };
}

describe('Unified Norma Full-Standard Reader (Step 4.1)', () => {
  it('orders clauses hierarchically with natural numeric sorting and excludes deleted clauses', () => {
    const sample: RequisitoLtree[] = [
      makeRequisito({ id: 'r-10', codigo: '10', ruta_materializada: '10' }),
      makeRequisito({ id: 'r-3-10', codigo: '3.10', id_requisito_padre: 'r-3', ruta_materializada: '3.3_10' }),
      makeRequisito({ id: 'r-2', codigo: '2', ruta_materializada: '2' }),
      makeRequisito({ id: 'r-1-1', codigo: '1.1', id_requisito_padre: 'r-1', ruta_materializada: '1.1_1' }),
      makeRequisito({ id: 'r-3-2', codigo: '3.2', id_requisito_padre: 'r-3', ruta_materializada: '3.3_2' }),
      makeRequisito({ id: 'r-3', codigo: '3', ruta_materializada: '3' }),
      makeRequisito({ id: 'r-1', codigo: '1', ruta_materializada: '1' }),
      makeRequisito({
        id: 'r-del',
        codigo: '4',
        ruta_materializada: '4',
        deleted_at: '2026-01-01T00:00:00Z',
      }),
    ];

    const ordered = orderNormaRequisitosHierarchically(sample);
    assert.deepEqual(
      ordered.map((r) => r.codigo),
      ['1', '1.1', '2', '3', '3.2', '3.10', '10']
    );
  });

  it('sanitizes unsafe HTML and preserves ISO lists, tables, NOTA blocks, and safe https links', () => {
    const richReq = makeRequisito({
      id: 'r-rich',
      codigo: '4.1',
      translations: {
        es: {
          lang: 'es',
          title: 'Comprensión de la organización',
          content_html: `
            <p>Texto con <a href="https://iso.org/standard" onclick="alert(1)">enlace seguro</a> y <a href="javascript:alert(2)">enlace malo</a>.</p>
            <ul><li>Elemento A</li><li>Elemento B</li></ul>
            <table><thead><tr><th>Entrada</th><th>Salida</th></tr></thead><tbody><tr><td>Dato</td><td>Resultado</td></tr></tbody></table>
            <blockquote><p><strong>NOTA 1</strong> Consideración normativa importante.</p></blockquote>
            <script>window.__xss = true;</script>
          `,
        },
        en: {
          lang: 'en',
          title: 'Understanding the organization',
          content_html: '<p>English clause text with <strong>bold</strong> guidance.</p>',
        },
      },
    });

    const res = renderNormaFullReaderBody({
      norma: TEST_NORMA,
      requisitos: [richReq],
      lang: 'es',
      query: '',
    });

    assert.ok(!res.bodyHtml.includes('<script>'), 'Must strip <script> tags');
    assert.ok(!res.bodyHtml.includes('onclick='), 'Must strip inline event handlers');
    assert.ok(!res.bodyHtml.includes('javascript:'), 'Must strip javascript: URLs');
    assert.ok(res.bodyHtml.includes('https://iso.org/standard'), 'Must preserve safe https:// links');
    assert.ok(res.bodyHtml.includes('<ul><li>Elemento A</li><li>Elemento B</li></ul>'));
    assert.ok(res.bodyHtml.includes('<table><thead><tr><th>Entrada</th>'));
    assert.ok(res.bodyHtml.includes('<blockquote><p><strong>NOTA 1</strong>'));
  });

  it('renders pure container chapters without duplicating titled child sub-clauses while expanding inline fragments', () => {
    const bundled = getBundledNormaCatalog();
    const iso9001Norma =
      bundled.standards.find((s) => s.codigo === 'ISO 9001:2015') || TEST_NORMA;
    const bundledIso9001 = bundled.requirementsCatalog.filter(
      (r) => r.norma_codigo === 'ISO 9001:2015' && !r.deleted_at
    );
    assert.ok(bundledIso9001.length > 50, 'Bundled ISO 9001 requirements must exist');

    const resEs = renderNormaFullReaderBody({
      norma: iso9001Norma,
      requisitos: bundledIso9001,
      lang: 'es',
      query: '',
    });

    assert.ok(resEs.bodyHtml.includes('data-full-clause-code="4"'));
    assert.ok(resEs.bodyHtml.includes('data-full-clause-code="4.1"'));
    assert.ok(resEs.bodyHtml.includes('data-full-clause-code="4.4"'));

    // Titled sub-clause 4.1 should appear only as its own dedicated card, not duplicated inside chapter 4
    const count41Cards = (resEs.bodyHtml.match(/data-full-clause-code="4\.1"/g) || []).length;
    assert.equal(count41Cards, 1, '4.1 must render exactly once as its own section');
    assert.equal(assertZeroUuidExposure(resEs.bodyHtml).compliant, true);
  });

  it('supports ES, EN, and Comparativa side-by-side layout with fallback badge', () => {
    const esOnlyReq = makeRequisito({
      id: 'r-es-only',
      codigo: '4.1',
      translations: {
        es: {
          lang: 'es',
          title: 'Contexto en Español',
          content_html: '<p>Contenido únicamente en español.</p>',
        },
      },
    });
    const bilingualReq = makeRequisito({
      id: 'r-bi',
      codigo: '4.2',
      translations: {
        es: {
          lang: 'es',
          title: 'Partes interesadas',
          content_html: '<p>Texto español de partes interesadas.</p>',
        },
        en: {
          lang: 'en',
          title: 'Interested parties',
          content_html: '<p>English interested parties text.</p>',
        },
      },
    });

    const esView = renderNormaFullReaderBody({
      norma: TEST_NORMA,
      requisitos: [bilingualReq],
      lang: 'es',
      query: '',
    });
    assert.ok(esView.bodyHtml.includes('Texto español de partes interesadas.'));
    assert.ok(!esView.bodyHtml.includes('English interested parties text.'));

    const enView = renderNormaFullReaderBody({
      norma: TEST_NORMA,
      requisitos: [bilingualReq, esOnlyReq],
      lang: 'en',
      query: '',
    });
    assert.ok(enView.bodyHtml.includes('English interested parties text.'));
    assert.ok(enView.bodyHtml.includes('Respaldo ES'), 'Should show ES fallback badge when EN is missing');

    const compView = renderNormaFullReaderBody({
      norma: TEST_NORMA,
      requisitos: [bilingualReq],
      lang: 'bilingual',
      query: '',
    });
    assert.ok(compView.bodyHtml.includes('grid-cols-1 md:grid-cols-2'), 'Comparativa must render responsive 2-col grid');
    assert.ok(compView.bodyHtml.includes('🇪🇸 Español'));
    assert.ok(compView.bodyHtml.includes('🇬🇧 English'));
    assert.ok(compView.bodyHtml.includes('Texto español de partes interesadas.'));
    assert.ok(compView.bodyHtml.includes('English interested parties text.'));
  });

  it('highlights search terms accent-insensitively without corrupting HTML tags or href attributes', () => {
    const sampleHtml =
      '<p>Evaluación de gestión y <a href="https://example.org/gestion-iso" target="_blank" rel="noopener noreferrer">guía de gestión</a>.</p>';
    const highlighted = highlightSanitizedClauseHtml(sampleHtml, 'gestion');

    assert.ok(
      highlighted.includes('href="https://example.org/gestion-iso"'),
      'href attribute must never be corrupted by <mark>'
    );
    assert.ok(
      highlighted.includes('<mark class="bg-amber-200/80 text-slate-900 rounded px-0.5 font-semibold">gestión</mark>'),
      'Accent-insensitive match should wrap original accented word'
    );
  });

  it('filters across clause codes and ES/EN text, and renders empty-state when no match exists', () => {
    const reqs = [
      makeRequisito({
        id: 'r-5-1',
        codigo: '5.1',
        translations: {
          es: {
            lang: 'es',
            title: 'Liderazgo y compromiso',
            content_html: '<p>La alta dirección debe demostrar liderazgo.</p>',
          },
          en: {
            lang: 'en',
            title: 'Leadership and commitment',
            content_html: '<p>Top management shall demonstrate leadership.</p>',
          },
        },
      }),
      makeRequisito({
        id: 'r-8-1',
        codigo: '8.1',
        translations: {
          es: {
            lang: 'es',
            title: 'Planificación y control operacional',
            content_html: '<p>Control de procesos contratados externamente.</p>',
          },
          en: {
            lang: 'en',
            title: 'Operational planning and control',
            content_html: '<p>Control of externally provided processes.</p>',
          },
        },
      }),
    ];

    const matchedEn = renderNormaFullReaderBody({
      norma: TEST_NORMA,
      requisitos: reqs,
      lang: 'es',
      query: 'leadership',
    });
    assert.equal(matchedEn.matchCount, 1);
    assert.ok(matchedEn.bodyHtml.includes('data-full-clause-code="5.1"'));
    assert.ok(!matchedEn.bodyHtml.includes('data-full-clause-code="8.1"'));

    const emptyRes = renderNormaFullReaderBody({
      norma: TEST_NORMA,
      requisitos: reqs,
      lang: 'bilingual',
      query: 'termino_inexistente_xyz',
    });
    assert.equal(emptyRes.matchCount, 0);
    assert.ok(emptyRes.bodyHtml.includes('Sin coincidencias en la norma'));
  });

  it('computes deduplicated normative obligation counts and interactive bold clause jump buttons', () => {
    const reqs = [
      makeRequisito({
        id: 'r-4-1',
        codigo: '4.1',
        translations: {
          es: {
            lang: 'es',
            title: 'Contexto',
            content_html: '<p>La organización debe determinar cuestiones externas y debería revisarlas.</p>{clause_4.1.p1}',
          },
          en: {
            lang: 'en',
            title: 'Context',
            content_html: '<p>The organization shall determine external issues and should review them.</p>{clause_4.1.p1}',
          },
        },
      }),
      makeRequisito({
        id: 'r-4-1-p1',
        id_requisito_padre: 'r-4-1',
        codigo: '4.1.p1',
        explicit_code: true,
        translations: {
          es: {
            lang: 'es',
            title: '',
            content_html: '<p>Además debe realizar seguimiento.</p>',
          },
          en: {
            lang: 'en',
            title: '',
            content_html: '<p>It shall also monitor.</p>',
          },
        },
      }),
    ];

    const esRes = renderNormaFullReaderBody({
      norma: TEST_NORMA,
      requisitos: reqs,
      lang: 'es',
      query: '',
      interactiveLinks: true,
    });
    assert.equal(esRes.obligationCounts.debe, 2);
    assert.equal(esRes.obligationCounts.deberia, 1);
    assert.ok(esRes.bodyHtml.includes('data-action="select-requisito"'));
    assert.ok(esRes.bodyHtml.includes('data-requisito-id="r-4-1"'));
    assert.ok(esRes.bodyHtml.includes('data-requisito-id="r-4-1-p1"'));

    const biRes = renderNormaFullReaderBody({
      norma: TEST_NORMA,
      requisitos: reqs,
      lang: 'bilingual',
      query: '',
      interactiveLinks: true,
    });
    assert.equal(biRes.obligationCounts.debe, 2);
    assert.equal(biRes.obligationCounts.shall, 2);
    assert.equal(biRes.obligationCounts.should, 1);
  });

  it('shows Ver Norma unified trigger in normaView read mode for Staff, CLIENT, and AUDITOR, and removes legacy modal action', () => {
    const commonProps = {
      state: {
        selectedNormaId: INITIAL_NORMAS[0].id,
        activeChildTab: 'requisitos' as const,
        query: '',
        requisitoQuery: '',
        selectedStatus: 'ALL',
        selectedScheme: 'ALL',
        viewMode: 'grid' as const,
        sortColumn: null,
        sortDirection: 'none' as const,
        isSidebarOpen: true,
        isCreating: false,
        isEditingAttributes: false,
      },
      normas: INITIAL_NORMAS,
      acreditaciones: INITIAL_ACREDITACIONES,
      organismos: INITIAL_ORGANISMOS,
      requisitos: getAllSeededNormaRequirements(),
      sectores: INITIAL_SECTORES_IAF,
      certificados: [],
      loading: false,
    };

    const staffReadHtml = renderNormaView({ profile: ADMIN_PROFILE, ...commonProps });
    assert.ok(staffReadHtml.includes('id="viewNormaReaderBtn"'));
    assert.ok(staffReadHtml.includes('data-action="open-norma-in-requisito"'));
    assert.ok(staffReadHtml.includes('Ver Norma'));
    assert.ok(!staffReadHtml.includes('open-norma-full-reader'));
    assert.ok(staffReadHtml.includes('id="startEditNormaBtn"'));
    assert.equal(assertZeroUuidExposure(staffReadHtml).compliant, true);

    const clientReadHtml = renderNormaView({ profile: CLIENT_PROFILE, ...commonProps });
    assert.ok(clientReadHtml.includes('data-action="open-norma-in-requisito"'));
    assert.ok(!clientReadHtml.includes('open-norma-full-reader'));
    assert.ok(!clientReadHtml.includes('id="startEditNormaBtn"'));
    assert.equal(assertZeroUuidExposure(clientReadHtml).compliant, true);

    const auditorReadHtml = renderNormaView({ profile: AUDITOR_PROFILE, ...commonProps });
    assert.ok(auditorReadHtml.includes('data-action="open-norma-in-requisito"'));
    assert.ok(!auditorReadHtml.includes('open-norma-full-reader'));
    assert.ok(!auditorReadHtml.includes('id="startEditNormaBtn"'));

    const editHtml = renderNormaView({
      profile: ADMIN_PROFILE,
      ...commonProps,
      state: { ...commonProps.state, isEditingAttributes: true },
    });
    assert.ok(!editHtml.includes('data-action="open-norma-in-requisito"'));

    const createHtml = renderNormaView({
      profile: ADMIN_PROFILE,
      ...commonProps,
      state: { ...commonProps.state, selectedNormaId: null, isCreating: true },
    });
    assert.ok(!createHtml.includes('data-action="open-norma-in-requisito"'));
  });

  it('renders unified full_norma mode inside requisitoView.ts and switches smoothly between full_norma and clause scopes', () => {
    const bundled = getBundledNormaCatalog();
    const iso9001 = bundled.standards.find((s) => s.codigo === 'ISO 9001:2015') || INITIAL_NORMAS[0];
    const allReqs = bundled.requirementsCatalog;
    const isoReqs = allReqs.filter((r) => r.id_norma === iso9001.id && !r.deleted_at);
    const clause41 = isoReqs.find((r) => r.codigo === '4.1')!;
    assert.ok(clause41, 'Clause 4.1 must exist in bundled ISO 9001 catalog');

    // 1) Entering from "Ver Norma" -> full_norma scope without selectedRequisitoId
    for (const profile of [ADMIN_PROFILE, CLIENT_PROFILE, AUDITOR_PROFILE]) {
      const fullHtml = renderRequisitoView({
        profile,
        state: {
          selectedRequisitoId: null,
          prefillNormaId: iso9001.id,
          readerScope: 'full_norma',
          fullNormaQuery: '',
          langMode: 'both',
        },
        requisitos: allReqs,
        normas: bundled.standards,
      });

      assert.ok(fullHtml.includes(`Norma Completa · ${iso9001.codigo}`));
      assert.ok(fullHtml.includes('id="requisitoFullNormaSearchInput"'));
      assert.ok(fullHtml.includes('data-action="set-requisito-lang-mode"'));
      assert.ok(fullHtml.includes('data-action="select-requisito"'));
      assert.ok(fullHtml.includes('data-normative-badge="debe"'));
      assert.ok(fullHtml.includes('data-normative-badge="shall"'));
      assert.ok(fullHtml.includes('id="switchToClauseReaderBtn"'));
      assert.ok(!fullHtml.includes('normaFullReaderBackdrop'), 'Must not render legacy modal');
      assert.equal(assertZeroUuidExposure(fullHtml).compliant, true);
    }

    // 2) Toggling from a specific clause -> offers switchToFullNormaBtn and preserves selected clause on return
    const clauseHtml = renderRequisitoView({
      profile: CLIENT_PROFILE,
      state: {
        selectedRequisitoId: clause41.id,
        prefillNormaId: iso9001.id,
        readerScope: 'clause',
        langMode: 'es',
      },
      requisitos: allReqs,
      normas: bundled.standards,
    });
    assert.ok(clauseHtml.includes('Cláusula 4.1'));
    assert.ok(clauseHtml.includes('id="switchToFullNormaBtn"'));
    assert.ok(clauseHtml.includes('data-reader-scope="full_norma"'));

    const backFromFullHtml = renderRequisitoView({
      profile: CLIENT_PROFILE,
      state: {
        selectedRequisitoId: clause41.id,
        prefillNormaId: iso9001.id,
        readerScope: 'full_norma',
        fullNormaQuery: 'calidad',
        langMode: 'es',
      },
      requisitos: allReqs,
      normas: bundled.standards,
    });
    assert.ok(backFromFullHtml.includes('Cláusula 4.1'));
    assert.ok(backFromFullHtml.includes('data-reader-scope="clause"'));
    assert.ok(backFromFullHtml.includes('<mark '));
    assert.equal(assertZeroUuidExposure(backFromFullHtml).compliant, true);

    // 3) extraView routes cleanly to full_norma reader when selectedRequisitoId is null
    const extraFullHtml = renderExtraView(CLIENT_PROFILE, {
      activeSubSection: 'standards',
      standards: [],
      requirements: [],
      requirementsCatalog: allReqs,
      iafSectors: [],
      catalogs: [],
      loading: false,
      normaState: { selectedNormaId: null },
      requisitoState: {
        selectedRequisitoId: null,
        prefillNormaId: iso9001.id,
        readerScope: 'full_norma',
      },
    });
    assert.ok(extraFullHtml.includes('id="requisitoFullNormaView"'));
    assert.ok(extraFullHtml.includes(`Norma Completa · ${iso9001.codigo}`));
  });
});
