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

/**
 * Recursively resolves `{clause_X.Y.Z}` placeholders within a clause's sanitized HTML,
 * supporting language fallback, anti-cycle stack protection, max recursion depth,
 * and graceful degradation for unresolved references.
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

        const interactiveChip = interactiveLinks
          ? `<button type="button" data-action="select-requisito" data-requisito-id="${escapeHtml(childNode.id)}" class="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-indigo-700 hover:text-indigo-900 bg-indigo-50/80 hover:bg-indigo-100 px-1.5 py-0.5 rounded mb-1 transition-colors" title="Ver cláusula ${escapeHtml(childNode.codigo)}">${escapeHtml(childNode.codigo)}</button>`
          : '';

        const bodyHtml =
          childRendered.html ||
          `<span class="text-xs italic text-slate-400">Sin contenido redactado (${escapeHtml(childNode.codigo)})</span>`;

        return `<div class="clause-embedded-block pl-3 sm:pl-4 my-1.5 border-l-2 border-indigo-200/80 hover:border-indigo-400 transition-colors" data-embedded-clause-code="${escapeHtml(childNode.codigo)}" data-embedded-clause-id="${escapeHtml(childNode.id)}">${interactiveChip}${bodyHtml}</div>`;
      }
    );

    return { html: expanded, usedLang: selection.usedLang };
  };

  const visitedIds = new Set<string>([rootNode.id]);
  const rootRendered = renderRecursive(rootNode, 0, visitedIds);

  return {
    html: rootRendered.html,
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
