import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildChildPlaceholderSuggestions,
  buildIsoNoteHtmlSnippet,
  buildSafeAnchorHtmlSnippet,
  buildSimpleTableHtmlSnippet,
  computeBilingualDraftStatus,
  countUnreferencedChildClauses,
  detectInlineBraceTrigger,
  hasEditorHtmlContent,
  insertTextAtCursor,
  normalizeEditorHtmlOutput,
  replaceInlineBraceTrigger,
  validateClausePlaceholderReferences,
  validateSafeHttpUrl,
  wrapSelectionWithTag,
} from './richTextEditor.js';
import { renderBilingualClauseEditor } from '../views/richTextEditor.js';
import { renderRequisitoView } from '../views/requisitoView.js';
import {
  createEmptyRequisitoFormDraft,
  type NormaEntity,
  type RequisitoLtree,
} from './extraDomain.js';
import type { UserProfile } from './healthCheck.js';
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

test('Step 4.2 buildChildPlaceholderSuggestions & countUnreferencedChildClauses: direct children, natural sort, ancestor exclusion & Zero-UUID previews', () => {
  const normaId = 'e0000000-0000-0000-0000-000000027001';
  const id5 = 'b5000000-0000-0000-0000-000000000005';
  const id51 = 'b5000000-0000-0000-0000-000000000051';
  const id512a = 'b5000000-0000-0000-0000-000000000512';
  const id5110 = 'b5000000-0000-0000-0000-000000005110';
  const id511 = 'b5000000-0000-0000-0000-000000000511';
  const id51Archived = 'b5000000-0000-0000-0000-000000000519';

  const reqs: RequisitoLtree[] = [
    {
      id: id5,
      id_norma: normaId,
      id_requisito_padre: null,
      codigo: '5',
      titulo: 'Liderazgo',
      descripcion: null,
      ruta_materializada: '5',
    },
    {
      id: id51,
      id_norma: normaId,
      id_requisito_padre: id5,
      codigo: '5.1',
      titulo: 'Liderazgo y compromiso',
      descripcion: null,
      ruta_materializada: '5.5_1',
    },
    {
      id: id5110,
      id_norma: normaId,
      id_requisito_padre: id51,
      codigo: '5.1.10',
      titulo: '',
      descripcion: null,
      ruta_materializada: '5.5_1.5_1_10',
      translations: {
        en: {
          lang: 'en',
          title: 'Long English fallback title that exceeds seventy characters so truncation is verified accurately',
          content_html: '<p>Details</p>',
        },
      },
    },
    {
      id: id512a,
      id_norma: normaId,
      id_requisito_padre: id51,
      codigo: '5.1.2.a',
      titulo: 'Política',
      descripcion: null,
      ruta_materializada: '5.5_1.5_1_2_a',
      translations: {
        es: {
          lang: 'es',
          title: 'Asegurar la política de seguridad',
          content_html: '<p>Política</p>',
        },
      },
    },
    {
      id: id511,
      id_norma: normaId,
      id_requisito_padre: id51,
      codigo: '5.1.1',
      titulo: 'Roles',
      descripcion: null,
      ruta_materializada: '5.5_1.5_1_1',
      translations: {
        es: {
          lang: 'es',
          title: 'Roles y responsabilidades',
          content_html: '<p>Roles</p>',
        },
      },
    },
    {
      id: id51Archived,
      id_norma: normaId,
      id_requisito_padre: id51,
      codigo: '5.1.99',
      titulo: 'Archivada',
      descripcion: null,
      ruta_materializada: '5.5_1.5_1_99',
      deleted_at: '2026-01-01T00:00:00Z',
    },
  ];

  const htmlWith511 = '<p>El liderazgo requiere:</p><div>{clause_5.1.1}</div>';
  const suggestions = buildChildPlaceholderSuggestions(id51, reqs, 'es', htmlWith511);

  assert.deepEqual(
    suggestions.map((s) => s.codigo),
    ['5.1.1', '5.1.2.a', '5.1.10']
  );
  assert.equal(suggestions[0].token, '{clause_5.1.1}');
  assert.equal(suggestions[0].alreadyInserted, true);
  assert.equal(suggestions[1].alreadyInserted, false);
  assert.equal(suggestions[2].alreadyInserted, false);
  assert.ok(suggestions[2].titlePreview.length <= 70);
  assert.equal(assertZeroUuidExposure(JSON.stringify(suggestions)).compliant, true);

  assert.equal(countUnreferencedChildClauses(id51, reqs, htmlWith511), 2);

  // Filter query narrows options cleanly
  const filtered = buildChildPlaceholderSuggestions(id51, reqs, 'es', htmlWith511, '{5.1.2');
  assert.deepEqual(
    filtered.map((s) => s.codigo),
    ['5.1.2.a']
  );

  // Add mode (no targetReqId) excludes candidateParentId (id51) and its ancestor (id5)
  const addSuggestions = buildChildPlaceholderSuggestions(
    undefined,
    reqs,
    'es',
    '',
    '',
    id51
  );
  const addCodes = addSuggestions.map((s) => s.codigo);
  assert.equal(addCodes.includes('5'), false);
  assert.equal(addCodes.includes('5.1'), false);
  assert.ok(addCodes.includes('5.1.2.a'));
});

test('Step 4.2 detectInlineBraceTrigger & replaceInlineBraceTrigger: detects { prefix and completes {clause_...} cleanly', () => {
  const source = '<p>Incluir {5.1 ahora</p>';
  const caret = '<p>Incluir {5.1'.length;
  const match = detectInlineBraceTrigger(source, caret);
  assert.ok(match);
  assert.equal(match.query, '5.1');
  assert.equal(match.triggerStart, '<p>Incluir '.length);
  assert.equal(match.cursorOffset, caret);

  const replaced = replaceInlineBraceTrigger(
    source,
    match.triggerStart,
    match.cursorOffset,
    '{clause_5.1.2.a}'
  );
  assert.equal(replaced.value, '<p>Incluir {clause_5.1.2.a} ahora</p>');
  assert.equal(
    replaced.nextCursor,
    '<p>Incluir {clause_5.1.2.a}'.length
  );

  // Closed brace or whitespace must NOT trigger autocomplete
  assert.equal(detectInlineBraceTrigger('<p>{clause_5.1} texto</p>'), null);
  assert.equal(detectInlineBraceTrigger('<p>{ texto</p>'), null);
});

test('Step 4.2 validateClausePlaceholderReferences: rejects self-references and dependency cycles across norma', () => {
  const normaId = 'e0000000-0000-0000-0000-000000027001';
  const id41 = 'b4000000-0000-0000-0000-000000000041';
  const id42 = 'b4000000-0000-0000-0000-000000000042';
  const id411 = 'b4000000-0000-0000-0000-000000000411';

  const reqs: RequisitoLtree[] = [
    {
      id: id41,
      id_norma: normaId,
      id_requisito_padre: null,
      codigo: '4.1',
      titulo: 'Contexto',
      descripcion: null,
      ruta_materializada: '4.4_1',
      translations: {
        es: { lang: 'es', title: 'Contexto', content_html: '<p>Base</p>' },
      },
    },
    {
      id: id42,
      id_norma: normaId,
      id_requisito_padre: null,
      codigo: '4.2',
      titulo: 'Partes interesadas',
      descripcion: null,
      ruta_materializada: '4.4_2',
      translations: {
        es: { lang: 'es', title: 'Partes', content_html: '<p>Ver {clause_4.1}</p>' },
      },
    },
    {
      id: id411,
      id_norma: normaId,
      id_requisito_padre: id41,
      codigo: '4.1.1',
      titulo: 'Detalle',
      descripcion: null,
      ruta_materializada: '4.4_1.4_1_1',
      translations: {
        es: { lang: 'es', title: 'Detalle', content_html: '<p>Cuerpo válido</p>' },
      },
    },
  ];

  // Self-reference blocked
  const selfRes = validateClausePlaceholderReferences({
    clauseId: id41,
    clauseCode: '4.1',
    idNorma: normaId,
    contentHtmlEs: '<p>Texto</p>',
    contentHtmlEn: '<p>Self {clause_4.1}</p>',
    allReqsOfNorma: reqs,
  });
  assert.equal(selfRes.valid, false);
  assert.equal(selfRes.selfReferencedCode, '4.1');

  // 2-hop cycle 4.1 -> 4.2 -> 4.1 blocked
  const cycleRes = validateClausePlaceholderReferences({
    clauseId: id41,
    clauseCode: '4.1',
    idNorma: normaId,
    contentHtmlEs: '<p>Ref {clause_4.2}</p>',
    contentHtmlEn: '',
    allReqsOfNorma: reqs,
  });
  assert.equal(cycleRes.valid, false);
  assert.ok(cycleRes.cyclePath && cycleRes.cyclePath.includes('4.2'));

  // Valid child reference passes
  const validRes = validateClausePlaceholderReferences({
    clauseId: id41,
    clauseCode: '4.1',
    idNorma: normaId,
    contentHtmlEs: '<p>Incluye</p><div>{clause_4.1.1}</div>',
    contentHtmlEn: '',
    allReqsOfNorma: reqs,
  });
  assert.equal(validRes.valid, true);
});

test('Step 4.2 renderRequisitoView: integrates BilingualClauseEditor, explicit_code without asterisk, picker & RBAC enforcement', () => {
  const normaId = 'e0000000-0000-0000-0000-000000027001';
  const id5 = 'b5000000-0000-0000-0000-000000000005';
  const id51 = 'b5000000-0000-0000-0000-000000000051';

  const normas: NormaEntity[] = [
    {
      id: normaId,
      codigo: 'ISO/IEC 27001:2022',
      norma: 'ISO/IEC 27001:2022',
      titulo: 'Seguridad de la información',
      esquema: 'SGSI',
      estatus: 'Vigente',
      fecha_publicacion: '2022-10-25',
      clausulas_count: 2,
      acreditaciones_count: 1,
    },
  ];
  const reqs: RequisitoLtree[] = [
    {
      id: id5,
      id_norma: normaId,
      norma_codigo: 'ISO/IEC 27001:2022',
      id_requisito_padre: null,
      codigo: '5',
      explicit_code: false,
      titulo: 'Liderazgo',
      descripcion: null,
      ruta_materializada: '5',
      translations: {
        es: { lang: 'es', title: 'Liderazgo', content_html: '<p>Intro</p>' },
      },
    },
    {
      id: id51,
      id_norma: normaId,
      norma_codigo: 'ISO/IEC 27001:2022',
      id_requisito_padre: id5,
      codigo: '5.1',
      explicit_code: true,
      titulo: 'Liderazgo y compromiso',
      descripcion: null,
      ruta_materializada: '5.5_1',
      translations: {
        es: { lang: 'es', title: 'Liderazgo y compromiso', content_html: '<p>Debe demostrar.</p>' },
      },
    },
  ];

  const adminProfile: UserProfile = {
    id: 'u-admin-test',
    email: 'admin@fondonorma.test',
    role: 'ADMIN',
    status: 'APPROVED',
    full_name: 'Admin Test',
    created_at: '2026-01-01T00:00:00Z',
  };
  const clientProfile: UserProfile = {
    id: 'u-client-test',
    email: 'cliente@fondonorma.test',
    role: 'CLIENT',
    status: 'APPROVED',
    full_name: 'Client Test',
    created_at: '2026-01-01T00:00:00Z',
  };

  // Edit mode renders Zone 2 bilingual editor, explicit_code without *, header actions, picker & badge
  const editHtml = renderRequisitoView({
    profile: adminProfile,
    state: {
      selectedRequisitoId: id5,
      isEditingAttributes: true,
      editorLang: 'es',
      editorMode: 'visual',
      clausePickerOpen: true,
    },
    requisitos: reqs,
    normas,
  });

  assert.ok(editHtml.includes('id="requisitoDetailForm"'));
  assert.ok(editHtml.includes('id="reqExplicitCodeInput"'));
  assert.equal(
    editHtml.includes('Código explícito en texto normativo <span class="text-rose-600"'),
    false
  );
  assert.ok(editHtml.includes('data-testid="bilingual-clause-editor"'));
  assert.ok(editHtml.includes('id="reqEditorClausePickerPopover"'));
  assert.ok(editHtml.includes('{clause_5.1}'));
  assert.ok(editHtml.includes('1 sub-cláusula sin referenciar'));
  assert.ok(
    editHtml.indexOf('id="saveRequisitoFormBtn"') <
      editHtml.indexOf('id="cancelEditRequisitoBtn"')
  );

  // Zero save/cancel buttons inside form body
  const formMatch = editHtml.match(/<form id="requisitoDetailForm"[\s\S]*?<\/form>/);
  assert.ok(formMatch);
  assert.equal(formMatch[0].includes('id="saveRequisitoFormBtn"'), false);
  assert.equal(formMatch[0].includes('id="cancelEditRequisitoBtn"'), false);
  assert.equal(assertZeroUuidExposure(editHtml).compliant, true);

  // Add mode preserves Zone 2 contract cleanly
  const addHtml = renderRequisitoView({
    profile: adminProfile,
    state: {
      selectedRequisitoId: null,
      prefillNormaId: normaId,
      prefillPadreId: id5,
      isCreating: true,
      formDraft: createEmptyRequisitoFormDraft(normaId, id5),
    },
    requisitos: reqs,
    normas,
  });
  assert.ok(addHtml.includes('data-testid="bilingual-clause-editor"'));
  assert.equal(assertZeroUuidExposure(addHtml).compliant, true);

  // Client user stays locked in read mode
  const clientHtml = renderRequisitoView({
    profile: clientProfile,
    state: {
      selectedRequisitoId: id5,
      isEditingAttributes: true,
    },
    requisitos: reqs,
    normas,
  });
  assert.equal(clientHtml.includes('data-testid="bilingual-clause-editor"'), false);
  assert.equal(clientHtml.includes('id="requisitoDetailForm"'), false);
});

