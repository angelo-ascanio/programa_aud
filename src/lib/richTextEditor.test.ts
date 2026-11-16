import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIsoNoteHtmlSnippet,
  buildSafeAnchorHtmlSnippet,
  buildSimpleTableHtmlSnippet,
  computeBilingualDraftStatus,
  hasEditorHtmlContent,
  insertTextAtCursor,
  normalizeEditorHtmlOutput,
  validateSafeHttpUrl,
  wrapSelectionWithTag,
} from './richTextEditor.js';
import { renderBilingualClauseEditor } from '../views/richTextEditor.js';
import type { RequisitoLtree } from './extraDomain.js';
import { assertZeroUuidExposure } from './zeroUuid.js';

test('Step 4.1 wrapSelectionWithTag: deterministically wraps selection ranges with strong, em, and u tags', () => {
  const base = '<p>La organización debe documentar.</p>';
  const word = 'debe';
  const start = base.indexOf(word);
  const end = start + word.length;

  assert.equal(
    wrapSelectionWithTag(base, start, end, 'strong'),
    '<p>La organización <strong>debe</strong> documentar.</p>'
  );
  assert.equal(
    wrapSelectionWithTag(base, start, end, 'em'),
    '<p>La organización <em>debe</em> documentar.</p>'
  );
  assert.equal(
    wrapSelectionWithTag(base, start, end, 'u'),
    '<p>La organización <u>debe</u> documentar.</p>'
  );

  // Reversed indices and out-of-bounds offsets clamp safely
  assert.equal(wrapSelectionWithTag('hola', 10, 2, 'strong'), 'ho<strong>la</strong>');
  assert.equal(wrapSelectionWithTag('hola', -5, 0, 'em'), '<em></em>hola');
});

test('Step 4.1 insertTextAtCursor: inserts {clause_...} tokens and snippets at exact cursor/selection bounds', () => {
  const source = '<p>Requisitos aplicables: </p>';
  const cursor = source.indexOf('</p>');
  const res = insertTextAtCursor(source, cursor, cursor, '{clause_4.1}');

  assert.equal(res.value, '<p>Requisitos aplicables: {clause_4.1}</p>');
  assert.equal(res.nextCursor, cursor + '{clause_4.1}'.length);

  // Replaces selected placeholder text cleanly
  const replaceRes = insertTextAtCursor('<p>Ver X aquí</p>', 7, 8, '<strong>NOTA:</strong>');
  assert.equal(replaceRes.value, '<p>Ver <strong>NOTA:</strong> aquí</p>');
  assert.equal(replaceRes.nextCursor, 7 + '<strong>NOTA:</strong>'.length);
});

test('Step 4.1 normalizeEditorHtmlOutput: maps b/i to strong/em, cleans contenteditable artifacts, and sanitizes XSS', () => {
  const dirty =
    '<b>Debe</b> <i>mantener</i><div style="color:red" onclick="alert(1)">registro<br></div><div><br></div><script>steal()</script><a href="javascript:alert(1)">malo</a>';

  const clean = normalizeEditorHtmlOutput(dirty);

  assert.equal(clean.includes('<script'), false);
  assert.equal(clean.includes('onclick'), false);
  assert.equal(clean.includes('style='), false);
  assert.equal(clean.includes('javascript:'), false);
  assert.equal(clean.includes('<b>'), false);
  assert.equal(clean.includes('<i>'), false);

  assert.ok(clean.includes('<strong>Debe</strong>'));
  assert.ok(clean.includes('<em>mantener</em>'));
  assert.ok(clean.includes('<div>registro</div>'));
  assert.equal(clean.includes('<div><br></div>'), false);
  assert.ok(clean.includes('<a>malo</a>'));

  // Empty contenteditable placeholders normalize strictly to empty string
  assert.equal(normalizeEditorHtmlOutput('<p><br></p>'), '');
  assert.equal(normalizeEditorHtmlOutput('<div><br></div><div>&nbsp;</div>'), '');
  assert.equal(normalizeEditorHtmlOutput('<br>'), '');

  // Placeholder-only content survives normalization
  assert.equal(normalizeEditorHtmlOutput('<div>{clause_5.1.1}</div>'), '<div>{clause_5.1.1}</div>');
});

test('Step 4.1 snippet builders & URL validator: produce clean ISO note, 2x2 table, and safe HTTPS links', () => {
  const note = buildIsoNoteHtmlSnippet();
  assert.equal(note, '<div><strong>NOTA:</strong> Texto de la nota normativa.</div>');
  assert.equal(normalizeEditorHtmlOutput(note), note);

  const table = buildSimpleTableHtmlSnippet(2, 2);
  assert.ok(table.startsWith('<table><thead><tr><th>Columna 1</th><th>Columna 2</th></tr></thead>'));
  assert.ok(table.includes('<tbody><tr><td>Dato 1.1</td><td>Dato 1.2</td></tr></tbody></table>'));
  assert.equal(normalizeEditorHtmlOutput(table), table);

  assert.equal(validateSafeHttpUrl('https://www.iso.org/standard/27001').valid, true);
  assert.equal(validateSafeHttpUrl('javascript:alert(1)').valid, false);
  assert.equal(validateSafeHttpUrl('data:text/html,<script>').valid, false);

  const link = buildSafeAnchorHtmlSnippet('https://www.iso.org', 'ISO Portal');
  assert.equal(
    link,
    '<a href="https://www.iso.org" target="_blank" rel="noopener noreferrer">ISO Portal</a>'
  );
});

test('Step 4.1 computeBilingualDraftStatus: tracks independent ES/EN content status accurately', () => {
  const status = computeBilingualDraftStatus({
    title_es: 'Contexto',
    content_html_es: '<p><br></p>',
    title_en: '',
    content_html_en: '<p>The organization shall determine external issues.</p>',
  });

  assert.equal(status.es.hasContent, false);
  assert.equal(status.es.label, 'Vacío');
  assert.equal(status.es.hasTitle, true);

  assert.equal(status.en.hasContent, true);
  assert.equal(status.en.label, 'Con contenido');
  assert.equal(status.en.hasTitle, false);

  assert.equal(hasEditorHtmlContent('<div>{clause_4.2}</div>'), true);
});

test('Step 4.1 renderBilingualClauseEditor: renders ES/EN tabs, Visual/HTML/Preview modes, semantic toolbar, inline link popover, and Zero-UUID compliance', () => {
  const normaRequisitos: RequisitoLtree[] = [
    {
      id: 'b1000000-0000-0000-0000-000000000001',
      id_norma: 'e0000000-0000-0000-0000-000000027001',
      id_requisito_padre: null,
      codigo: '4.1',
      explicit_code: true,
      titulo: 'Contexto',
      descripcion: null,
      ruta_materializada: '4.1',
      translations: {
        es: {
          lang: 'es',
          title: 'Contexto',
          content_html: '<p>Padre {clause_4.1.1}</p>',
        },
      },
    },
    {
      id: 'b1000000-0000-0000-0000-000000000002',
      id_norma: 'e0000000-0000-0000-0000-000000027001',
      id_requisito_padre: 'b1000000-0000-0000-0000-000000000001',
      codigo: '4.1.1',
      explicit_code: true,
      titulo: 'Subcláusula',
      descripcion: null,
      ruta_materializada: '4.1.4_1_1',
      translations: {
        es: {
          lang: 'es',
          title: 'Subcláusula',
          content_html: '<p>Cuestiones internas y externas.</p>',
        },
        en: {
          lang: 'en',
          title: 'Subclause',
          content_html: '<p>Internal and external issues.</p>',
        },
      },
    },
  ];

  const draft = {
    title_es: 'Contexto de la organización',
    content_html_es: '<p>Alcance:</p><div>{clause_4.1.1}</div><script>alert(1)</script>',
    title_en: 'Context of the organization',
    content_html_en: '',
  };

  // 1. Visual mode (ES active)
  const visualHtml = renderBilingualClauseEditor({
    activeLang: 'es',
    activeMode: 'visual',
    draft,
    clauseId: 'b1000000-0000-0000-0000-000000000001',
    clauseCode: '4.1',
    idNorma: 'e0000000-0000-0000-0000-000000027001',
    normaRequisitos,
    unreferencedChildCount: 2,
  });

  assert.ok(visualHtml.includes('data-editor-lang="es"'));
  assert.ok(visualHtml.includes('data-editor-lang="en"'));
  assert.ok(visualHtml.includes('Con contenido'));
  assert.ok(visualHtml.includes('Vacío'));
  assert.ok(visualHtml.includes('role="toolbar"'));
  assert.ok(visualHtml.includes('flex-wrap'));
  assert.ok(visualHtml.includes('contenteditable="true"'));
  assert.ok(visualHtml.includes('data-testid="editor-subclause-slot"'));
  assert.ok(visualHtml.includes('Tabla 2×2'));
  assert.ok(visualHtml.includes('Enlace https://'));
  assert.ok(visualHtml.includes('Limpiar formato'));
  assert.ok(visualHtml.includes('Deshacer'));
  assert.ok(visualHtml.includes('id="reqEditorLinkPopover"'));
  assert.equal(visualHtml.includes('<script'), false);
  assert.equal(visualHtml.includes('window.prompt'), false);
  assert.equal(visualHtml.includes('window.alert'), false);
  assert.equal(assertZeroUuidExposure(visualHtml).compliant, true);

  // 2. HTML source mode (EN active + link popover open)
  const htmlModeOutput = renderBilingualClauseEditor({
    activeLang: 'en',
    activeMode: 'html',
    draft,
    linkPopoverOpen: true,
    linkDraftUrl: 'https://www.iso.org',
    linkErrorMessage: 'URL de prueba',
  });
  assert.ok(htmlModeOutput.includes('<textarea'));
  assert.ok(htmlModeOutput.includes('data-editor-canvas="html"'));
  assert.ok(htmlModeOutput.includes('data-editor-lang="en"'));
  assert.ok(htmlModeOutput.includes('https://www.iso.org'));
  assert.ok(htmlModeOutput.includes('URL de prueba'));
  assert.equal(assertZeroUuidExposure(htmlModeOutput).compliant, true);

  // 3. Vista Previa mode resolves {clause_4.1.1} recursively before saving
  const previewHtml = renderBilingualClauseEditor({
    activeLang: 'es',
    activeMode: 'preview',
    draft,
    clauseId: 'b1000000-0000-0000-0000-000000000001',
    clauseCode: '4.1',
    idNorma: 'e0000000-0000-0000-0000-000000027001',
    normaRequisitos,
  });
  assert.ok(previewHtml.includes('id="reqEditorPreviewPane"'));
  assert.ok(previewHtml.includes('Cuestiones internas y externas.'));
  assert.ok(previewHtml.includes('1 sub-cláusulas expandidas'));
  assert.equal(previewHtml.includes('<script'), false);
  assert.equal(assertZeroUuidExposure(previewHtml).compliant, true);
});
