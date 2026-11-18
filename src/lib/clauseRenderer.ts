import { escapeHtml } from './html';

export type ClauseLanguage = 'es' | 'en';

export interface ClauseTranslationContent {
  lang: ClauseLanguage;
  title: string;
  content_html: string;
}

export interface ClauseRenderNode {
  id: string;
  id_norma: string;
  codigo: string;
  id_requisito_padre?: string | null;
  explicit_code?: boolean;
  translations: Partial<Record<ClauseLanguage, ClauseTranslationContent>>;
}

export interface ResolveClauseHtmlOptions {
  clauseId: string;
  lang: ClauseLanguage;
  clausesById: ReadonlyMap<string, ClauseRenderNode>;
  clausesByNormaAndCode: ReadonlyMap<string, ClauseRenderNode>;
  maxDepth?: number; // default: 10
  interactiveLinks?: boolean;
  includeEmbeddedTitles?: boolean;
  includeRootHeader?: boolean; // default: true
}

export interface ResolvedClauseResult {
  html: string;
  usedLang: ClauseLanguage | 'none';
  isFallbackLang: boolean;
  resolvedChildCodes: string[];
  unresolvedTokens: string[];
  cycleDetected: boolean;
}

const ALLOWED_HTML_TAGS = new Set<string>([
  'div',
  'p',
  'span',
  'strong',
  'b',
  'em',
  'i',
  'u',
  'br',
  'ul',
  'ol',
  'li',
  'blockquote',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'a',
]);

const TABLE_CELL_TAGS = new Set<string>(['table', 'th', 'td']);

const BLOCKED_CONTENT_TAGS = [
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'svg',
  'form',
  'input',
  'noscript',
  'template',
] as const;

const CLAUSE_TOKEN_REGEX = /\{clause_([A-Za-z0-9._-]+)\}/g;

interface ParsedHtmlAttribute {
  name: string;
  value: string;
}

const NAMED_HTML_ENTITIES: Readonly<Record<string, string>> = {
  nbsp: ' ',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  amp: '&',
  aacute: 'á',
  eacute: 'é',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  ntilde: 'ñ',
  uuml: 'ü',
  ndash: '-',
  mdash: '-',
  ldquo: '"',
  rdquo: '"',
  lsquo: "'",
  rsquo: "'",
};

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_full, hex: string) => {
      const codePoint = Number.parseInt(hex, 16);
      return Number.isFinite(codePoint) && codePoint > 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : '';
    })
    .replace(/&#(\d+);/g, (_full, dec: string) => {
      const codePoint = Number.parseInt(dec, 10);
      return Number.isFinite(codePoint) && codePoint > 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : '';
    })
    .replace(/&([A-Za-z]+);/g, (full, name: string) => {
      const mapped = NAMED_HTML_ENTITIES[name.toLowerCase()];
      return mapped !== undefined ? mapped : full;
    });
}

function parseAttributes(attrText: string): ParsedHtmlAttribute[] {
  const attrs: ParsedHtmlAttribute[] = [];
  const attrPattern =
    /([A-Za-z_:][A-Za-z0-9_.:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = attrPattern.exec(attrText)) !== null) {
    const name = match[1].toLowerCase();
    const rawValue = match[2] ?? match[3] ?? match[4] ?? '';
    attrs.push({ name, value: rawValue });
  }
  return attrs;
}

function sanitizeSafeHttpHref(rawHref: string): string | null {
  const decoded = decodeHtmlEntities(rawHref)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
  if (!decoded) return null;
  if (!/^https?:\/\//i.test(decoded)) {
    return null;
  }
  return decoded;
}

function sanitizePositiveSpan(rawSpan: string): string | null {
  const trimmed = rawSpan.trim();
  if (!/^[1-9]\d{0,2}$/.test(trimmed)) {
    return null;
  }
  const num = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(num) || num < 1 || num > 1000) {
    return null;
  }
  return String(num);
}

function stripBlockedTagBlocks(html: string): string {
  const blockedUnion = BLOCKED_CONTENT_TAGS.join('|');
  const tagAttrs = '(?:\\s(?:"[^"]*"|\'[^\']*\'|[^<>"\'])*)?';
  const pairedBlockRegex = new RegExp(
    `<(${blockedUnion})\\b${tagAttrs}>[\\s\\S]*?<\\/\\1\\s*>`,
    'gi'
  );
  const strayOpenOrSelfClosingRegex = new RegExp(
    `<\\/?(${blockedUnion})\\b${tagAttrs}\\/?>`,
    'gi'
  );

  let result = html.replace(/<!--[\s\S]*?-->/g, '');
  let previous = '';
  while (result !== previous) {
    previous = result;
    result = result.replace(pairedBlockRegex, '');
  }
  result = result.replace(strayOpenOrSelfClosingRegex, '');
  return result;
}

/**
 * Pure, isomorphic HTML allowlist sanitizer safe for both browser and Node.js runtimes.
 * Strips dangerous elements (`<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>`,
 * `<svg>`, `<form>`, `<input>`), all inline `on*` handlers, `style`, arbitrary `class`,
 * and `data-oe-version`, while restricting `<a href>` to `http(s)://`.
 */
export function sanitizeClauseHtml(rawHtml: string): string {
  if (!rawHtml) return '';

  const withoutDangerousBlocks = stripBlockedTagBlocks(rawHtml);

  return withoutDangerousBlocks.replace(
    /<(\/?)([A-Za-z][A-Za-z0-9-]*)(\s(?:"[^"]*"|'[^']*'|[^<>"'])*)?(\/?)>/g,
    (_fullTag: string, closingSlash: string, rawName: string, rawAttrs = '') => {
      const tagName = rawName.toLowerCase();
      if (!ALLOWED_HTML_TAGS.has(tagName)) {
        return '';
      }

      const isClosing = closingSlash === '/';
      if (isClosing) {
        return tagName === 'br' ? '' : `</${tagName}>`;
      }

      if (tagName === 'br') {
        return '<br>';
      }

      const parsedAttrs = parseAttributes(rawAttrs);

      if (tagName === 'a') {
        let safeHref: string | null = null;
        for (const attr of parsedAttrs) {
          if (attr.name === 'href') {
            safeHref = sanitizeSafeHttpHref(attr.value);
          }
        }
        if (safeHref) {
          return `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer">`;
        }
        return '<a>';
      }

      if (TABLE_CELL_TAGS.has(tagName)) {
        const keptAttrs: string[] = [];
        let seenColspan = false;
        let seenRowspan = false;
        for (const attr of parsedAttrs) {
          if (attr.name === 'colspan' && !seenColspan) {
            const validSpan = sanitizePositiveSpan(attr.value);
            if (validSpan) {
              keptAttrs.push(`colspan="${validSpan}"`);
              seenColspan = true;
            }
          } else if (attr.name === 'rowspan' && !seenRowspan) {
            const validSpan = sanitizePositiveSpan(attr.value);
            if (validSpan) {
              keptAttrs.push(`rowspan="${validSpan}"`);
              seenRowspan = true;
            }
          }
        }
        return keptAttrs.length > 0 ? `<${tagName} ${keptAttrs.join(' ')}>` : `<${tagName}>`;
      }

      return `<${tagName}>`;
    }
  );
}

/**
 * Extracts all `{clause_X.Y.Z}` code references present in raw or sanitized HTML,
 * preserving first-appearance order without duplicates.
 */
export function extractClausePlaceholders(rawHtml: string): string[] {
  if (!rawHtml) return [];
  const seen = new Set<string>();
  const codes: string[] = [];
  const regex = new RegExp(CLAUSE_TOKEN_REGEX.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(rawHtml)) !== null) {
    const code = match[1];
    if (code && !seen.has(code)) {
      seen.add(code);
      codes.push(code);
    }
  }
  return codes;
}

/**
 * Strips HTML tags and `{clause_...}` placeholder tokens, decodes common entities,
 * removes accents (NFD), lowercases, and normalizes whitespace for cross-language search.
 */
export function stripHtmlToSearchText(rawHtml: string): string {
  if (!rawHtml) return '';
  const withoutBlocks = stripBlockedTagBlocks(rawHtml);
  const withoutTokens = withoutBlocks.replace(new RegExp(CLAUSE_TOKEN_REGEX.source, 'g'), ' ');
  const withoutTags = withoutTokens.replace(/<[^>]+>/g, ' ');
  const decoded = decodeHtmlEntities(withoutTags);
  return decoded
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface NormativeObligationCounts {
  debe: number;
  deberia: number;
  shall: number;
  should: number;
}

const REGEX_DEBE = /(?<![\p{L}\p{N}_])debe(?![\p{L}\p{N}_])/giu;
const REGEX_DEBERIA = /(?<![\p{L}\p{N}_])deber[ií]a(?![\p{L}\p{N}_])/giu;
const REGEX_SHALL = /(?<![\p{L}\p{N}_])shall(?![\p{L}\p{N}_])/giu;
const REGEX_SHOULD = /(?<![\p{L}\p{N}_])should(?![\p{L}\p{N}_])/giu;

/**
 * Counts normative obligation/recommendation keywords (`debe`, `debería`, `shall`, `should`)
 * over plain text extracted from HTML, ignoring tags, attributes, and embedded placeholders.
 */
export function countNormativeObligationTerms(html: string): NormativeObligationCounts {
  if (!html) {
    return { debe: 0, deberia: 0, shall: 0, should: 0 };
  }
  const withoutBlocks = stripBlockedTagBlocks(html);
  const withoutTokens = withoutBlocks.replace(new RegExp(CLAUSE_TOKEN_REGEX.source, 'g'), ' ');
  const withoutTags = withoutTokens.replace(/<[^>]+>/g, ' ');
  const plainText = decodeHtmlEntities(withoutTags).replace(/\s+/g, ' ').trim();
  if (!plainText) {
    return { debe: 0, deberia: 0, shall: 0, should: 0 };
  }

  return {
    debe: (plainText.match(REGEX_DEBE) || []).length,
    deberia: (plainText.match(REGEX_DEBERIA) || []).length,
    shall: (plainText.match(REGEX_SHALL) || []).length,
    should: (plainText.match(REGEX_SHOULD) || []).length,
  };
}

/**
 * Concatenates clause code, bilingual titles (ES+EN), and stripped body text (ES+EN)
 * into a single accent-normalized searchable index string.
 */
export function collectClauseIndexText(node: ClauseRenderNode): string {
  const esTrans = node.translations.es;
  const enTrans = node.translations.en;

  const parts = [
    node.codigo,
    esTrans?.title ?? '',
    enTrans?.title ?? '',
    esTrans ? stripHtmlToSearchText(esTrans.content_html) : '',
    enTrans ? stripHtmlToSearchText(enTrans.content_html) : '',
  ]
    .map((part) =>
      part
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter((part) => part.length > 0);

  return parts.join(' ').trim();
}

function selectNodeTranslationContent(
  node: ClauseRenderNode,
  requestedLang: ClauseLanguage
): {
  contentHtml: string;
  usedLang: ClauseLanguage | 'none';
  isFallback: boolean;
} {
  const preferred = node.translations[requestedLang];
  if (preferred && preferred.content_html.trim() !== '') {
    return {
      contentHtml: preferred.content_html,
      usedLang: requestedLang,
      isFallback: false,
    };
  }

  const alternateLang: ClauseLanguage = requestedLang === 'es' ? 'en' : 'es';
  const alternate = node.translations[alternateLang];
  if (alternate && alternate.content_html.trim() !== '') {
    return {
      contentHtml: alternate.content_html,
      usedLang: alternateLang,
      isFallback: true,
    };
  }

  return {
    contentHtml: '',
    usedLang: 'none',
    isFallback: false,
  };
}

function pushUnique(target: string[], seen: Set<string>, value: string): void {
  if (!seen.has(value)) {
    seen.add(value);
    target.push(value);
  }
}

function renderClauseCodeToken(
  node: ClauseRenderNode,
  interactiveLinks: boolean
): string {
  const safeCode = escapeHtml(node.codigo);
  if (interactiveLinks) {
    return `<button type="button" data-action="select-requisito" data-requisito-id="${escapeHtml(node.id)}" class="font-bold text-slate-900 hover:text-indigo-700 hover:underline focus:underline cursor-pointer bg-transparent p-0 border-0 inline" title="Ir a cláusula ${safeCode}">${safeCode}</button>`;
  }
  return `<strong class="font-bold text-slate-900">${safeCode}</strong>`;
}

/**
 * Injects the inline bold clause code inside the first `<p>` or `<div>` flow container
 * (avoiding nested `.clause-embedded-block` wrappers) so Rule 2 stays on the same line.
 */
function injectInlineCodePrefix(html: string, prefixHtml: string): string {
  const trimmed = html.trim();
  if (!trimmed) return prefixHtml;

  const openFlowTagRegex = /^(<(?:p|div)(?:\s[^>]*)?>)(\s*)/i;
  let offset = 0;
  let matchedAnyFlowTag = false;

  while (offset < trimmed.length) {
    const slice = trimmed.slice(offset);
    if (/^<div\b[^>]*class="[^"]*\bclause-embedded-block\b/i.test(slice)) {
      break;
    }
    const match = openFlowTagRegex.exec(slice);
    if (!match) break;

    const afterTag = slice.slice(match[0].length);
    offset += match[0].length;
    matchedAnyFlowTag = true;

    if (
      !/^(?:<(?:p|div)(?:\s[^>]*)?>)/i.test(afterTag) ||
      /^<div\b[^>]*class="[^"]*\bclause-embedded-block\b/i.test(afterTag)
    ) {
      break;
    }
  }

  if (matchedAnyFlowTag) {
    const before = trimmed.slice(0, offset);
    const after = trimmed.slice(offset).replace(/^\s+/, '');
    return after ? `${before}${prefixHtml} ${after}` : `${before}${prefixHtml}`;
  }

  return `${prefixHtml} ${trimmed}`;
}

function formatClausePresentation(params: {
  node: ClauseRenderNode;
  bodyHtml: string;
  usedLang: ClauseLanguage | 'none';
  requestedLang: ClauseLanguage;
  interactiveLinks: boolean;
  isRoot: boolean;
  includeRootHeader: boolean;
}): string {
  const {
    node,
    bodyHtml,
    usedLang,
    requestedLang,
    interactiveLinks,
    isRoot,
    includeRootHeader,
  } = params;

  if (isRoot && !includeRootHeader) {
    return bodyHtml;
  }

  const activeLang: ClauseLanguage =
    usedLang === 'es' || usedLang === 'en' ? usedLang : requestedLang;
  const title = (node.translations[activeLang]?.title || '').trim();
  const blockClass = isRoot ? 'clause-block' : 'clause-embedded-block';
  const dataAttrs = isRoot
    ? ` data-clause-code="${escapeHtml(node.codigo)}" data-clause-id="${escapeHtml(node.id)}"`
    : ` data-embedded-clause-code="${escapeHtml(node.codigo)}" data-embedded-clause-id="${escapeHtml(node.id)}"`;

  // Rule 1: Non-empty title -> bold block heading "{codigo} {title}" (mt-3) followed by content_html
  if (title.length > 0) {
    const codeHtml = renderClauseCodeToken(node, interactiveLinks);
    const headingHtml = `<div class="font-bold text-slate-900 leading-snug mb-1">${codeHtml} <span>${escapeHtml(title)}</span></div>`;
    return `<div class="${blockClass} mt-3"${dataAttrs}>${headingHtml}${bodyHtml}</div>`;
  }

  // Rule 2: Empty title && explicit_code === true -> bold "{codigo}" inline at start of flow (mt-1.5)
  if (node.explicit_code === true) {
    const codeHtml = renderClauseCodeToken(node, interactiveLinks);
    const inlinedBody = injectInlineCodePrefix(bodyHtml, codeHtml);
    return `<div class="${blockClass} mt-1.5"${dataAttrs}>${inlinedBody}</div>`;
  }

  // Rule 3: Empty title && explicit_code === false -> no code shown, continuous prose (mt-0.5, zero lateral padding)
  return `<div class="${blockClass} mt-0.5"${dataAttrs}>${bodyHtml}</div>`;
}

/**
 * Recursively resolves `{clause_X.Y.Z}` placeholders within a clause's sanitized HTML,
 * supporting language fallback, anti-cycle stack protection, max recursion depth,
 * and deterministic Rules 1, 2, and 3 documentary presentation for root and embedded clauses.
 */
export function resolveClauseHtml(options: ResolveClauseHtmlOptions): ResolvedClauseResult {
  const rootNode = options.clausesById.get(options.clauseId);
  if (!rootNode) {
    return {
      html: '',
      usedLang: 'none',
      isFallbackLang: false,
      resolvedChildCodes: [],
      unresolvedTokens: [],
      cycleDetected: false,
    };
  }

  const maxDepth = options.maxDepth ?? 10;
  const interactiveLinks = Boolean(options.interactiveLinks);
  const includeRootHeader = options.includeRootHeader ?? true;
  const resolvedChildCodes: string[] = [];
  const seenChildCodes = new Set<string>();
  const unresolvedTokens: string[] = [];
  const seenUnresolvedTokens = new Set<string>();
  let cycleDetected = false;
  let anyFallbackLang = false;

  const renderRecursive = (
    node: ClauseRenderNode,
    depth: number,
    activeStack: Set<string>
  ): { html: string; usedLang: ClauseLanguage | 'none' } => {
    const selection = selectNodeTranslationContent(node, options.lang);
    if (selection.isFallback) {
      anyFallbackLang = true;
    }

    if (!selection.contentHtml) {
      return { html: '', usedLang: selection.usedLang };
    }

    const sanitized = sanitizeClauseHtml(selection.contentHtml);
    const expanded = sanitized.replace(
      new RegExp(CLAUSE_TOKEN_REGEX.source, 'g'),
      (_fullMatch: string, tokenCode: string): string => {
        const lookupKey = `${node.id_norma}::${tokenCode.toLowerCase()}`;
        const childNode = options.clausesByNormaAndCode.get(lookupKey);

        if (!childNode) {
          pushUnique(unresolvedTokens, seenUnresolvedTokens, tokenCode);
          return `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-mono text-[11px]">Cláusula ${escapeHtml(tokenCode)} sin definir</span>`;
        }

        if (activeStack.has(childNode.id) || depth >= maxDepth) {
          cycleDetected = true;
          return `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-mono text-[11px]">[Referencia circular protegida: ${escapeHtml(tokenCode)}]</span>`;
        }

        pushUnique(resolvedChildCodes, seenChildCodes, childNode.codigo);

        activeStack.add(childNode.id);
        const childRendered = renderRecursive(childNode, depth + 1, activeStack);
        activeStack.delete(childNode.id);

        const bodyHtml =
          childRendered.html ||
          `<span class="text-xs italic text-slate-400">Sin contenido redactado (${escapeHtml(childNode.codigo)})</span>`;

        return formatClausePresentation({
          node: childNode,
          bodyHtml,
          usedLang: childRendered.usedLang,
          requestedLang: options.lang,
          interactiveLinks,
          isRoot: false,
          includeRootHeader: true,
        });
      }
    );

    return { html: expanded, usedLang: selection.usedLang };
  };

  const visitedIds = new Set<string>([rootNode.id]);
  const rootRendered = renderRecursive(rootNode, 0, visitedIds);

  if (rootRendered.usedLang === 'none' || !rootRendered.html) {
    return {
      html: '',
      usedLang: rootRendered.usedLang,
      isFallbackLang: anyFallbackLang,
      resolvedChildCodes,
      unresolvedTokens,
      cycleDetected,
    };
  }

  const rootFormattedHtml = formatClausePresentation({
    node: rootNode,
    bodyHtml: rootRendered.html,
    usedLang: rootRendered.usedLang,
    requestedLang: options.lang,
    interactiveLinks,
    isRoot: true,
    includeRootHeader,
  });

  return {
    html: rootFormattedHtml,
    usedLang: rootRendered.usedLang,
    isFallbackLang: anyFallbackLang,
    resolvedChildCodes,
    unresolvedTokens,
    cycleDetected,
  };
}

/**
 * Helper to index an array of `ClauseRenderNode` items by ID and `(id_norma, lowercase codigo)`
 * for use with `resolveClauseHtml`.
 */
export function buildClauseRenderMaps(nodes: ReadonlyArray<ClauseRenderNode>): {
  clausesById: Map<string, ClauseRenderNode>;
  clausesByNormaAndCode: Map<string, ClauseRenderNode>;
} {
  const clausesById = new Map<string, ClauseRenderNode>();
  const clausesByNormaAndCode = new Map<string, ClauseRenderNode>();

  for (const node of nodes) {
    clausesById.set(node.id, node);
    clausesByNormaAndCode.set(`${node.id_norma}::${node.codigo.toLowerCase()}`, node);
  }

  return { clausesById, clausesByNormaAndCode };
}
