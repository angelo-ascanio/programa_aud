import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClauseRenderMaps,
  collectClauseIndexText,
  countNormativeObligationTerms,
  extractClausePlaceholders,
  resolveClauseHtml,
  sanitizeClauseHtml,
  stripHtmlToSearchText,
  type ClauseRenderNode,
} from './clauseRenderer.js';
import { expandNormasCatalogBundle } from './generated/normasCatalogBundle.js';
import { assertZeroUuidExposure, extractVisibleTextFromHtml } from './zeroUuid.js';

function buildBundleNodes(): {
  nodes: ClauseRenderNode[];
  clausesById: Map<string, ClauseRenderNode>;
  clausesByNormaAndCode: Map<string, ClauseRenderNode>;
} {
  const bundle = expandNormasCatalogBundle();
  const transByClauseId = new Map<string, ClauseRenderNode['translations']>();

  for (const tr of bundle.translations) {
    const existing = transByClauseId.get(tr.id_requisito) ?? {};
    existing[tr.lang] = {
      lang: tr.lang,
      title: tr.title,
      content_html: tr.content_html,
    };
    transByClauseId.set(tr.id_requisito, existing);
  }

  const nodes: ClauseRenderNode[] = bundle.clauses.map((c) => ({
    id: c.id,
    id_norma: c.id_norma,
    codigo: c.codigo,
    id_requisito_padre: c.id_requisito_padre,
    explicit_code: c.explicit_code,
    translations: transByClauseId.get(c.id) ?? {},
  }));

  const maps = buildClauseRenderMaps(nodes);
  return {
    nodes,
    clausesById: maps.clausesById,
    clausesByNormaAndCode: maps.clausesByNormaAndCode,
  };
}

test('Step 2.1 sanitizeClauseHtml: blocks XSS vectors (scripts, handlers, dangerous tags, javascript:/data: URIs) and preserves safe HTML/tables/links', () => {
  const xssHtml = [
    '<div data-oe-version="1.2" class="bg-red-500" style="position:fixed" onclick="alert(1)">',
    '<script>alert("xss")</script>',
    '<scr<script></script>ipt>steal()</script>',
    '<style>body{display:none}</style>',
    '<iframe src="https://evil.example"></iframe>',
    '<object data="evil.swf"></object>',
    '<embed src="evil.swf">',
    '<svg onload="alert(1)"><circle /></svg>',
    '<form action="/steal"><input type="text" value="x"></form>',
    '<img src="x" onerror="alert(1)">',
    '<p onmouseover="evil()">Texto <strong>seguro</strong> con <em>énfasis</em> y <br/>salto.</p>',
    '<ul><li>Item 1</li><li>Item 2</li></ul>',
    '<table><thead><tr><th colspan="2" onclick="evil()">Cabecera</th></tr></thead><tbody><tr><td rowspan="2" colspan="0">Dato</td><td rowspan="-1">Otro</td></tr></tbody></table>',
    '<a href="javascript:alert(1)" onclick="evil()">Enlace Malicioso</a>',
    '<a href="java&#x09;script:alert(1)">Enlace Ofuscado</a>',
    '<a href="data:text/html,<script>alert(1)</script>">Data URI</a>',
    '<a href="https://www.iso.org/standard/62085.html?a=1&b=2" style="color:red" class="btn">ISO 9001</a>',
    '</div>',
  ].join('');

  const clean = sanitizeClauseHtml(xssHtml);

  assert.equal(clean.includes('<script'), false);
  assert.equal(clean.includes('alert('), false);
  assert.equal(clean.includes('steal('), false);
  assert.equal(clean.includes('<style'), false);
  assert.equal(clean.includes('<iframe'), false);
  assert.equal(clean.includes('<object'), false);
  assert.equal(clean.includes('<embed'), false);
  assert.equal(clean.includes('<svg'), false);
  assert.equal(clean.includes('<form'), false);
  assert.equal(clean.includes('<input'), false);
  assert.equal(clean.includes('<img'), false);
  assert.equal(clean.includes('onclick'), false);
  assert.equal(clean.includes('onerror'), false);
  assert.equal(clean.includes('onmouseover'), false);
  assert.equal(clean.includes('data-oe-version'), false);
  assert.equal(clean.includes('style='), false);
  assert.equal(clean.includes('class='), false);
  assert.equal(clean.includes('javascript:'), false);
  assert.equal(clean.includes('data:text/html'), false);

  assert.ok(clean.includes('<div><p>Texto <strong>seguro</strong> con <em>énfasis</em> y <br>salto.</p>'));
  assert.ok(clean.includes('<ul><li>Item 1</li><li>Item 2</li></ul>'));
  assert.ok(clean.includes('<th colspan="2">Cabecera</th>'));
  assert.ok(clean.includes('<td rowspan="2">Dato</td>'));
  assert.ok(clean.includes('<td>Otro</td>'));
  assert.ok(clean.includes('<a>Enlace Malicioso</a>'));
  assert.ok(clean.includes('<a>Enlace Ofuscado</a>'));
  assert.ok(clean.includes('<a>Data URI</a>'));
  assert.ok(
    clean.includes(
      '<a href="https://www.iso.org/standard/62085.html?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">ISO 9001</a>'
    )
  );
});

test('Step 2.1 resolveClauseHtml: recursively expands multi-level CSV hierarchies without cycles or UUID exposure', () => {
  const { clausesById, clausesByNormaAndCode } = buildBundleNodes();

  // ISO 45001:2018 clause 6 expands down to depth 6 (6 -> 6.1 -> 6.1.2 -> 6.1.2.1 -> 6.1.2.1.b -> 6.1.2.1.b.1)
  const iso45001NormaId = 'e0000000-0000-0000-0000-000000045001';
  const clause6 = clausesByNormaAndCode.get(`${iso45001NormaId}::6`);
  assert.ok(clause6, 'ISO 45001 clause 6 must exist');

  const resolved6 = resolveClauseHtml({
    clauseId: clause6.id,
    lang: 'es',
    clausesById,
    clausesByNormaAndCode,
    interactiveLinks: true,
  });

  assert.equal(resolved6.usedLang, 'es');
  assert.equal(resolved6.isFallbackLang, false);
  assert.equal(resolved6.cycleDetected, false);
  assert.deepEqual(resolved6.unresolvedTokens, []);
  assert.ok(resolved6.resolvedChildCodes.includes('6.1'));
  assert.ok(resolved6.resolvedChildCodes.includes('6.1.2.1.b.1'));
  assert.ok(resolved6.html.includes('clause-embedded-block'));
  assert.ok(resolved6.html.includes('data-embedded-clause-code="6.1.2.1.b.1"'));
  assert.ok(resolved6.html.includes('data-action="select-requisito"'));
  assert.ok(resolved6.html.includes('factores humanos'));
  assert.equal(assertZeroUuidExposure(resolved6.html).compliant, true);

  // Also test 7-level hierarchy in ISO 22000:2018 (clause 8 -> 8.5 -> ... depth 7)
  const iso22000NormaId = 'e0000000-0000-0000-0000-000000022000';
  const clause8 = clausesByNormaAndCode.get(`${iso22000NormaId}::8`);
  assert.ok(clause8);
  const resolved22k = resolveClauseHtml({
    clauseId: clause8.id,
    lang: 'es',
    clausesById,
    clausesByNormaAndCode,
  });
  assert.equal(resolved22k.cycleDetected, false);
  assert.ok(resolved22k.resolvedChildCodes.length > 20);
  assert.equal(assertZeroUuidExposure(resolved22k.html).compliant, true);
});

test('Step 2.1 resolveClauseHtml: degrades gracefully for empty ES content (iso45001 3.2), missing translations (ISO 27001), and orphan tokens ({clause_9.1.3})', () => {
  const { clausesById, clausesByNormaAndCode } = buildBundleNodes();
  const iso45001NormaId = 'e0000000-0000-0000-0000-000000045001';

  // Real case 1: iso45001_2018 clause 3.2 has empty ES content -> fallback to EN
  const clause32 = clausesByNormaAndCode.get(`${iso45001NormaId}::3.2`);
  assert.ok(clause32);
  const resolved32 = resolveClauseHtml({
    clauseId: clause32.id,
    lang: 'es',
    clausesById,
    clausesByNormaAndCode,
  });
  assert.equal(resolved32.usedLang, 'en');
  assert.equal(resolved32.isFallbackLang, true);
  assert.ok(resolved32.html.length > 0);
  assert.equal(assertZeroUuidExposure(resolved32.html).compliant, true);

  // Real case 2: iso45001_2018 clause 9.1 references {clause_9.1.3} which has no target node
  const clause91 = clausesByNormaAndCode.get(`${iso45001NormaId}::9.1`);
  assert.ok(clause91);
  const resolved91 = resolveClauseHtml({
    clauseId: clause91.id,
    lang: 'es',
    clausesById,
    clausesByNormaAndCode,
  });
  assert.deepEqual(resolved91.unresolvedTokens, ['9.1.3']);
  assert.ok(resolved91.html.includes('Cláusula 9.1.3 sin definir'));
  assert.equal(assertZeroUuidExposure(resolved91.html).compliant, true);

  // Real case 3: ISO/IEC 27001:2022 has no preloaded translations -> clean 'none' state
  const iso27001NormaId = 'e0000000-0000-0000-0000-000000027001';
  const clause27k = clausesByNormaAndCode.get(`${iso27001NormaId}::4`);
  assert.ok(clause27k);
  const resolved27k = resolveClauseHtml({
    clauseId: clause27k.id,
    lang: 'es',
    clausesById,
    clausesByNormaAndCode,
  });
  assert.equal(resolved27k.usedLang, 'none');
  assert.equal(resolved27k.isFallbackLang, false);
  assert.equal(resolved27k.html, '');
});

test('Step 2.1 resolveClauseHtml: prevents infinite loops on cycles (A -> B -> A) and maxDepth limit, while allowing non-cyclic sibling reuse', () => {
  const normaId = 'e0000000-0000-0000-0000-000000009001';
  const cycleNodes: ClauseRenderNode[] = [
    {
      id: '10000000-0000-4000-8000-00000000000a',
      id_norma: normaId,
      codigo: 'A',
      translations: {
        es: { lang: 'es', title: 'Nodo A', content_html: '<div>Inicio A {clause_B}</div>' },
      },
    },
    {
      id: '10000000-0000-4000-8000-00000000000b',
      id_norma: normaId,
      codigo: 'B',
      translations: {
        es: { lang: 'es', title: 'Nodo B', content_html: '<div>Dentro B {clause_A}</div>' },
      },
    },
    {
      id: '10000000-0000-4000-8000-00000000000c',
      id_norma: normaId,
      codigo: 'C',
      translations: {
        es: {
          lang: 'es',
          title: 'Nodo C',
          content_html: '<div>{clause_Leaf}</div><div>{clause_Leaf}</div>',
        },
      },
    },
    {
      id: '10000000-0000-4000-8000-00000000000d',
      id_norma: normaId,
      codigo: 'Leaf',
      translations: {
        es: { lang: 'es', title: 'Hoja', content_html: '<p>Contenido hoja</p>' },
      },
    },
  ];

  const maps = buildClauseRenderMaps(cycleNodes);
  const cycleRes = resolveClauseHtml({
    clauseId: '10000000-0000-4000-8000-00000000000a',
    lang: 'es',
    ...maps,
  });

  assert.equal(cycleRes.cycleDetected, true);
  assert.ok(cycleRes.html.includes('[Referencia circular protegida: A]'));
  assert.equal(assertZeroUuidExposure(cycleRes.html).compliant, true);

  // Sibling diamond reuse should NOT be flagged as a cycle
  const diamondRes = resolveClauseHtml({
    clauseId: '10000000-0000-4000-8000-00000000000c',
    lang: 'es',
    ...maps,
  });
  assert.equal(diamondRes.cycleDetected, false);
  assert.deepEqual(diamondRes.resolvedChildCodes, ['Leaf']);

  // Deep chain exceeding maxDepth triggers cycleDetected deterministically
  const deepChain: ClauseRenderNode[] = Array.from({ length: 6 }, (_, i) => ({
    id: `20000000-0000-4000-8000-00000000000${i}`,
    id_norma: normaId,
    codigo: `D${i}`,
    translations: {
      es: {
        lang: 'es',
        title: `Nivel ${i}`,
        content_html: i < 5 ? `<div>Nivel ${i} {clause_D${i + 1}}</div>` : '<div>Final</div>',
      },
    },
  }));
  const deepMaps = buildClauseRenderMaps(deepChain);
  const depthRes = resolveClauseHtml({
    clauseId: '20000000-0000-4000-8000-000000000000',
    lang: 'es',
    maxDepth: 3,
    ...deepMaps,
  });
  assert.equal(depthRes.cycleDetected, true);
  assert.ok(depthRes.html.includes('[Referencia circular protegida: D4]'));
});

test('Step 2.1 Search & Placeholder Utilities: extractClausePlaceholders, stripHtmlToSearchText, and collectClauseIndexText', () => {
  const raw =
    '<div data-oe-version="1.2">Gesti&oacute;n &amp; Calidad&nbsp;<ul><li>{clause_4.1}</li><li>{clause_4.2}</li><li>{clause_4.1}</li></ul>&quot;&lt;Evaluación&gt;&quot;</div>';

  assert.deepEqual(extractClausePlaceholders(raw), ['4.1', '4.2']);
  assert.equal(stripHtmlToSearchText(raw), 'gestion & calidad "<evaluacion>"');

  const node: ClauseRenderNode = {
    id: '30000000-0000-4000-8000-000000000001',
    id_norma: 'e0000000-0000-0000-0000-000000009001',
    codigo: '4.1',
    translations: {
      es: {
        lang: 'es',
        title: 'Comprensión de la organización',
        content_html: '<div>Cuestiones externas e internas {clause_4.1.a}</div>',
      },
      en: {
        lang: 'en',
        title: 'Understanding the organization',
        content_html: '<div>External and internal issues</div>',
      },
    },
  };

  const indexText = collectClauseIndexText(node);
  assert.ok(indexText.includes('4.1'));
  assert.ok(indexText.includes('comprension de la organizacion'));
  assert.ok(indexText.includes('cuestiones externas e internas'));
  assert.ok(indexText.includes('understanding the organization'));
  assert.ok(indexText.includes('external and internal issues'));
  assert.equal(indexText.includes('{clause_4.1.a}'), false);
});

test('Step 3.1 Normative Obligation Counter: countNormativeObligationTerms counts whole words across ES/EN ignoring tags, attrs, and tokens', () => {
  assert.deepEqual(countNormativeObligationTerms(''), {
    debe: 0,
    deberia: 0,
    shall: 0,
    should: 0,
  });

  const esHtml =
    '<div data-debe="shall" class="should"><p>La organizaci&oacute;n <strong>DEBE</strong> determinar y debe mantener; adem&aacute;s deber&iacute;a evaluar y deberia revisar.</p><p>No contar deben, indebido ni {clause_debe.shall}.</p></div>';
  assert.deepEqual(countNormativeObligationTerms(esHtml), {
    debe: 2,
    deberia: 2,
    shall: 0,
    should: 0,
  });

  const enHtml =
    '<section><p>The organization SHALL establish, shall implement, and should monitor. Do not match shallow or shouldn.</p><script>const x = "shall should debe";</script></section>';
  assert.deepEqual(countNormativeObligationTerms(enHtml), {
    debe: 0,
    deberia: 0,
    shall: 2,
    should: 1,
  });
});

test('Step 3.2 Rules 1, 2, and 3: deterministic root & embedded rendering without boxes/borders and with discrete inline bold quick-access links', () => {
  const normaId = 'e0000000-0000-0000-0000-000000009001';
  const nodes: ClauseRenderNode[] = [
    {
      id: '90000000-0000-4000-8000-000000000092',
      id_norma: normaId,
      codigo: '9.2',
      explicit_code: false,
      translations: {
        es: {
          lang: 'es',
          title: 'Auditoría Interna',
          content_html: '<div>{clause_9.2.1}</div><div>{clause_9.2.1.a}</div>',
        },
      },
    },
    {
      id: '90000000-0000-4000-8000-000000009210',
      id_norma: normaId,
      codigo: '9.2.1',
      explicit_code: true,
      translations: {
        es: {
          lang: 'es',
          title: '',
          content_html: '<p>La organización debe llevar a cabo auditorías internas.</p>',
        },
      },
    },
    {
      id: '90000000-0000-4000-8000-00000000921a',
      id_norma: normaId,
      codigo: '9.2.1.a',
      explicit_code: false,
      translations: {
        es: {
          lang: 'es',
          title: '',
          content_html: '<div>a) es conforme con los requisitos propios de la organización;</div>',
        },
      },
    },
    {
      id: '90000000-0000-4000-8000-000000000933',
      id_norma: normaId,
      codigo: '9.3.3',
      explicit_code: true,
      translations: {
        es: {
          lang: 'es',
          title: '',
          content_html: '<div><p>Las salidas de la revisión por la dirección deben incluir decisiones.</p></div>',
        },
      },
    },
    {
      id: '90000000-0000-4000-8000-000000000934',
      id_norma: normaId,
      codigo: '9.3.4',
      explicit_code: false,
      translations: {
        es: {
          lang: 'es',
          title: '',
          content_html: '<p>Texto continuo sin prefijo de código.</p>',
        },
      },
    },
  ];

  const maps = buildClauseRenderMaps(nodes);

  // Interactive mode on Rule 1 root with embedded Rule 2 + Rule 3
  const interactiveRes = resolveClauseHtml({
    clauseId: '90000000-0000-4000-8000-000000000092',
    lang: 'es',
    ...maps,
    interactiveLinks: true,
  });

  // Rule 1: mt-3 block heading "{codigo} {title}"
  assert.ok(interactiveRes.html.includes('class="clause-block mt-3"'));
  assert.ok(
    interactiveRes.html.includes(
      '<button type="button" data-action="select-requisito" data-requisito-id="90000000-0000-4000-8000-000000000092" class="font-bold text-slate-900 hover:text-indigo-700 hover:underline focus:underline cursor-pointer bg-transparent p-0 border-0 inline" title="Ir a cláusula 9.2">9.2</button> <span>Auditoría Interna</span>'
    )
  );

  // Rule 2 embedded: mt-1.5 and bold code injected inline inside <p>
  assert.ok(interactiveRes.html.includes('class="clause-embedded-block mt-1.5"'));
  assert.ok(
    interactiveRes.html.includes(
      '<p><button type="button" data-action="select-requisito" data-requisito-id="90000000-0000-4000-8000-000000009210" class="font-bold text-slate-900 hover:text-indigo-700 hover:underline focus:underline cursor-pointer bg-transparent p-0 border-0 inline" title="Ir a cláusula 9.2.1">9.2.1</button> La organización debe llevar a cabo auditorías internas.</p>'
    )
  );

  // Rule 3 embedded: mt-0.5, zero lateral padding, no code rendered before text
  assert.ok(interactiveRes.html.includes('class="clause-embedded-block mt-0.5"'));
  assert.ok(
    interactiveRes.html.includes(
      '<div class="clause-embedded-block mt-0.5" data-embedded-clause-code="9.2.1.a" data-embedded-clause-id="90000000-0000-4000-8000-00000000921a"><div>a) es conforme con los requisitos propios de la organización;</div></div>'
    )
  );
  assert.equal(interactiveRes.html.includes('>9.2.1.a<'), false);

  // Natural documentary style: zero borders, chips, or lateral padding classes
  assert.equal(interactiveRes.html.includes('border-l-2'), false);
  assert.equal(interactiveRes.html.includes('border-indigo-200'), false);
  assert.equal(interactiveRes.html.includes('bg-indigo-50'), false);
  assert.equal(interactiveRes.html.includes('pl-3'), false);
  assert.equal(interactiveRes.html.includes('px-1.5 py-0.5 rounded'), false);
  assert.equal(assertZeroUuidExposure(interactiveRes.html).compliant, true);

  // Rule 2 on root with nested <div><p>...</p></div> injects inside <p> and omits <button> when interactiveLinks: false
  const rule2RootNonInteractive = resolveClauseHtml({
    clauseId: '90000000-0000-4000-8000-000000000933',
    lang: 'es',
    ...maps,
    interactiveLinks: false,
  });
  assert.ok(rule2RootNonInteractive.html.includes('class="clause-block mt-1.5"'));
  assert.ok(
    rule2RootNonInteractive.html.includes(
      '<div><p><strong class="font-bold text-slate-900">9.3.3</strong> Las salidas de la revisión por la dirección deben incluir decisiones.</p></div>'
    )
  );
  assert.equal(rule2RootNonInteractive.html.includes('<button'), false);

  // Rule 3 on root omits code and uses mt-0.5
  const rule3Root = resolveClauseHtml({
    clauseId: '90000000-0000-4000-8000-000000000934',
    lang: 'es',
    ...maps,
    interactiveLinks: true,
  });
  assert.ok(rule3Root.html.includes('class="clause-block mt-0.5"'));
  assert.equal(extractVisibleTextFromHtml(rule3Root.html).includes('9.3.4'), false);
  assert.equal(rule3Root.html.includes('<button'), false);
});

test('Step 3.2 Bundled ISO 9001 4.4: combines Rule 1 (4.4), Rule 2 (4.4.1), and Rule 3 (4.4.1.a) continuously', () => {
  const { clausesById, clausesByNormaAndCode } = buildBundleNodes();
  const iso9001NormaId = 'e0000000-0000-0000-0000-000000009001';
  const clause44 = clausesByNormaAndCode.get(`${iso9001NormaId}::4.4`);
  assert.ok(clause44, 'ISO 9001 clause 4.4 must exist');

  const resolved44 = resolveClauseHtml({
    clauseId: clause44.id,
    lang: 'es',
    clausesById,
    clausesByNormaAndCode,
    interactiveLinks: true,
  });

  assert.ok(resolved44.html.includes('class="clause-block mt-3"'));
  assert.ok(resolved44.html.includes('Sistema de gestión de la calidad y sus procesos'));
  assert.ok(resolved44.html.includes('class="clause-embedded-block mt-1.5"'));
  assert.ok(resolved44.html.includes('>4.4.1</button> La organización debe establecer'));
  assert.ok(resolved44.html.includes('class="clause-embedded-block mt-0.5"'));
  assert.equal(resolved44.html.includes('>4.4.1.a</button>'), false);
  assert.equal(resolved44.html.includes('border-l-2'), false);
  assert.equal(resolved44.html.includes('bg-indigo-50'), false);
  assert.equal(assertZeroUuidExposure(resolved44.html).compliant, true);
});

