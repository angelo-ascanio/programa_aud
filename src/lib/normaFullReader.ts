import { escapeHtml } from './html';
import {
  buildClauseRenderMaps,
  collectClauseIndexText,
  countNormativeObligationTerms,
  extractClausePlaceholders,
  resolveClauseHtml,
  type ClauseLanguage,
  type ClauseRenderNode,
  type NormativeObligationCounts,
  type ResolvedClauseResult,
} from './clauseRenderer';
import {
  calculateLtreeIndentation,
  compareRequisitosNumerically,
  formatRequisitoHierarchyPath,
  getRequisitoBilingualTitles,
  normalizeSearchString,
  type NormaEntity,
  type RequisitoLtree,
} from './extraDomain';

export type NormaFullReaderLang = 'es' | 'en' | 'bilingual';

export interface NormaFullReaderBodyResult {
  bodyHtml: string;
  matchCount: number;
  totalCount: number;
  isFiltered: boolean;
  obligationCounts: NormativeObligationCounts;
}

const FULL_NORMA_PROSE_CLASSES =
  'clause-html-prose text-sm text-slate-800 leading-relaxed [&>.clause-block]:mt-0 [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_strong]:font-bold [&_strong]:text-slate-900 [&_table]:w-full [&_table]:border-collapse [&_table]:my-2 [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-100 [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_td]:border [&_td]:border-slate-200 [&_td]:px-2.5 [&_td]:py-1.5 [&_td]:text-xs [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-slate-600 [&_a]:text-indigo-700 [&_a]:underline';

function compareCodigoNaturally(a: RequisitoLtree, b: RequisitoLtree): number {
  const segsA = (a.codigo || '').trim().split('.').filter(Boolean);
  const segsB = (b.codigo || '').trim().split('.').filter(Boolean);
  const len = Math.max(segsA.length, segsB.length);

  for (let i = 0; i < len; i += 1) {
    const segA = segsA[i];
    const segB = segsB[i];
    if (segA === undefined) return -1;
    if (segB === undefined) return 1;

    const isNumA = /^\d+$/.test(segA);
    const isNumB = /^\d+$/.test(segB);
    if (isNumA && isNumB) {
      const numA = Number.parseInt(segA, 10);
      const numB = Number.parseInt(segB, 10);
      if (numA !== numB) return numA - numB;
    }

    const cmp = segA.localeCompare(segB, 'es', { numeric: true, sensitivity: 'base' });
    if (cmp !== 0) return cmp;
  }

  return compareRequisitosNumerically(a, b);
}

/**
 * Orders active clauses of a standard in true hierarchical pre-order DFS (`1`, `1.1`, `1.1.1`, `2`, ...),
 * sorting each sibling group naturally with numeric segment comparison and anti-cycle protection.
 */
export function orderNormaRequisitosHierarchically(
  requisitos: ReadonlyArray<RequisitoLtree>
): RequisitoLtree[] {
  const active = requisitos.filter((r) => !r.deleted_at);
  if (active.length === 0) return [];

  const byId = new Map<string, RequisitoLtree>();
  for (let i = 0; i < active.length; i += 1) {
    byId.set(active[i].id, active[i]);
  }

  const childrenByParent = new Map<string, RequisitoLtree[]>();
  const roots: RequisitoLtree[] = [];

  for (let i = 0; i < active.length; i += 1) {
    const req = active[i];
    const parentId = req.id_requisito_padre || null;
    if (parentId && parentId !== req.id && byId.has(parentId)) {
      let bucket = childrenByParent.get(parentId);
      if (!bucket) {
        bucket = [];
        childrenByParent.set(parentId, bucket);
      }
      bucket.push(req);
    } else {
      roots.push(req);
    }
  }

  roots.sort(compareCodigoNaturally);
  childrenByParent.forEach((bucket) => {
    bucket.sort(compareCodigoNaturally);
  });

  const ordered: RequisitoLtree[] = [];
  const visited = new Set<string>();

  const visit = (node: RequisitoLtree): void => {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    ordered.push(node);
    const children = childrenByParent.get(node.id);
    if (children) {
      for (let i = 0; i < children.length; i += 1) {
        visit(children[i]);
      }
    }
  };

  for (let i = 0; i < roots.length; i += 1) {
    visit(roots[i]);
  }

  if (ordered.length < active.length) {
    const remaining = active
      .filter((r) => !visited.has(r.id))
      .sort(compareCodigoNaturally);
    for (let i = 0; i < remaining.length; i += 1) {
      visit(remaining[i]);
    }
  }

  return ordered;
}

function toClauseRenderNodes(
  normaRequisitos: ReadonlyArray<RequisitoLtree>
): ClauseRenderNode[] {
  return normaRequisitos.map((req) => {
    const legacyEsHtml =
      !req.translations && req.descripcion && req.descripcion.trim()
        ? `<p>${escapeHtml(req.descripcion.trim())}</p>`
        : '';
    return {
      id: req.id,
      id_norma: req.id_norma,
      codigo: req.codigo,
      id_requisito_padre: req.id_requisito_padre,
      explicit_code: req.explicit_code,
      translations: req.translations
        ? req.translations
        : legacyEsHtml
        ? {
            es: {
              lang: 'es',
              title: req.titulo || '',
              content_html: legacyEsHtml,
            },
          }
        : {},
    };
  });
}

function hasExplicitClauseTitle(req: RequisitoLtree): boolean {
  const esTitle = (req.translations?.es?.title || '').trim();
  const enTitle = (req.translations?.en?.title || '').trim();
  if (esTitle || enTitle) return true;
  const genericFallback = `cláusula ${req.codigo}`.toLowerCase();
  const rawTitulo = (req.titulo || '').trim();
  return rawTitulo.length > 0 && rawTitulo.toLowerCase() !== genericFallback;
}

function isPureContainerHtml(
  rawHtml: string | undefined,
  renderedSectionCodesLower: ReadonlySet<string>
): boolean {
  if (!rawHtml || !rawHtml.trim()) return false;
  const tokens = extractClausePlaceholders(rawHtml);
  if (tokens.length === 0) return false;
  const nonTokenText = rawHtml
    .replace(/\{clause_[A-Za-z0-9._-]+\}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim();
  if (nonTokenText.length > 0) return false;
  return tokens.every((tok) => renderedSectionCodesLower.has(tok.toLowerCase()));
}

function isPureSectionContainerClause(
  req: RequisitoLtree,
  lang: NormaFullReaderLang,
  renderedSectionCodesLower: ReadonlySet<string>
): boolean {
  const esHtml = req.translations?.es?.content_html || '';
  const enHtml = req.translations?.en?.content_html || '';

  if (lang === 'es') {
    const target = esHtml.trim() ? esHtml : enHtml;
    return isPureContainerHtml(target, renderedSectionCodesLower);
  }
  if (lang === 'en') {
    const target = enHtml.trim() ? enHtml : esHtml;
    return isPureContainerHtml(target, renderedSectionCodesLower);
  }

  const esEmptyOrContainer = !esHtml.trim() || isPureContainerHtml(esHtml, renderedSectionCodesLower);
  const enEmptyOrContainer = !enHtml.trim() || isPureContainerHtml(enHtml, renderedSectionCodesLower);
  const hasAnyTokens =
    extractClausePlaceholders(esHtml).length > 0 ||
    extractClausePlaceholders(enHtml).length > 0;
  return hasAnyTokens && esEmptyOrContainer && enEmptyOrContainer;
}

function highlightTextSegment(text: string, tokens: ReadonlyArray<string>): string {
  if (!text || tokens.length === 0) return text;

  // Map each normalized base character back to its original UTF-16 index span
  const normalizedChars: string[] = [];
  const origStarts: number[] = [];
  const origEnds: number[] = [];

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const nfd = ch.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (let j = 0; j < nfd.length; j += 1) {
      normalizedChars.push(nfd[j]);
      origStarts.push(i);
      origEnds.push(i + 1);
    }
  }

  const normText = normalizedChars.join('');
  if (!normText) return text;

  const ranges: Array<{ start: number; end: number }> = [];
  for (let t = 0; t < tokens.length; t += 1) {
    const tok = tokens[t];
    if (!tok) continue;
    let from = 0;
    while (from < normText.length) {
      const idx = normText.indexOf(tok, from);
      if (idx === -1) break;
      const startOrig = origStarts[idx];
      const endOrig = origEnds[idx + tok.length - 1];
      if (startOrig !== undefined && endOrig !== undefined) {
        ranges.push({ start: startOrig, end: endOrig });
      }
      from = idx + tok.length;
    }
  }

  if (ranges.length === 0) return text;

  ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Array<{ start: number; end: number }> = [ranges[0]];
  for (let i = 1; i < ranges.length; i += 1) {
    const prev = merged[merged.length - 1];
    const curr = ranges[i];
    if (curr.start <= prev.end) {
      prev.end = Math.max(prev.end, curr.end);
    } else {
      merged.push(curr);
    }
  }

  let result = '';
  let cursor = 0;
  for (let i = 0; i < merged.length; i += 1) {
    const { start, end } = merged[i];
    if (start > cursor) {
      result += text.slice(cursor, start);
    }
    result += `<mark class="bg-amber-200/80 text-slate-900 rounded px-0.5 font-semibold">${text.slice(start, end)}</mark>`;
    cursor = end;
  }
  if (cursor < text.length) {
    result += text.slice(cursor);
  }
  return result;
}

/**
 * Highlights accent-insensitive search tokens inside already-sanitized HTML text nodes only,
 * leaving HTML tags, `<a href>` attributes, and classes intact.
 */
export function highlightSanitizedClauseHtml(
  sanitizedHtml: string,
  rawQuery: string
): string {
  if (!sanitizedHtml) return '';
  const cleanQ = normalizeSearchString(rawQuery);
  if (!cleanQ) return sanitizedHtml;

  const tokens = Array.from(new Set(cleanQ.split(/\s+/).filter((t) => t.length > 0)));
  if (tokens.length === 0) return sanitizedHtml;

  const parts = sanitizedHtml.split(/(<[^>]+>)/g);
  for (let i = 0; i < parts.length; i += 2) {
    if (parts[i]) {
      parts[i] = highlightTextSegment(parts[i], tokens);
    }
  }
  return parts.join('');
}

function resolveClauseTitleForLang(
  req: RequisitoLtree,
  requestedLang: ClauseLanguage,
  usedLang: ClauseLanguage | 'none'
): string {
  const bilingual = getRequisitoBilingualTitles(req);
  if (requestedLang === 'en') {
    const enTitle = (req.translations?.en?.title || '').trim();
    if (enTitle) return enTitle;
    if (usedLang === 'es') {
      return (req.translations?.es?.title || '').trim() || bilingual.primaryTitle;
    }
    return `Clause ${req.codigo}`;
  }
  const esTitle = (req.translations?.es?.title || '').trim();
  if (esTitle) return esTitle;
  if (usedLang === 'en') {
    return (req.translations?.en?.title || '').trim() || bilingual.primaryTitle;
  }
  return bilingual.primaryTitle;
}

function buildClauseSearchIndex(req: RequisitoLtree, node?: ClauseRenderNode): string {
  const baseIndex = node ? collectClauseIndexText(node) : '';
  const legacyParts = normalizeSearchString(
    `${req.codigo} ${req.ruta_materializada} ${req.titulo || ''} ${req.descripcion || ''}`
  );
  return `${baseIndex} ${legacyParts}`.trim();
}

function renderSingleClauseColumnHtml(params: {
  req: RequisitoLtree;
  requestedLang: ClauseLanguage;
  resolved: ResolvedClauseResult;
  query: string;
  isPureContainer: boolean;
  showLangHeader?: boolean;
}): string {
  const {
    req,
    requestedLang,
    resolved,
    query,
    isPureContainer,
    showLangHeader = false,
  } = params;
  const heading = resolveClauseTitleForLang(req, requestedLang, resolved.usedLang);
  const highlightedHeading = query.trim()
    ? highlightSanitizedClauseHtml(escapeHtml(heading), query)
    : escapeHtml(heading);
  const langLabel = requestedLang === 'es' ? '🇪🇸 Español' : '🇬🇧 English';
  const fallbackBadge = resolved.isFallbackLang
    ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">${escapeHtml(
        resolved.usedLang === 'en' ? 'Respaldo EN' : 'Respaldo ES'
      )}</span>`
    : '';

  const headerLineHtml = showLangHeader
    ? `
      <div class="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-slate-100">
        <span class="text-[11px] font-bold uppercase tracking-wider text-slate-500">${langLabel}</span>
        ${fallbackBadge}
      </div>
      <div class="text-xs sm:text-sm font-bold text-slate-900 leading-snug">
        ${highlightedHeading}
      </div>
    `
    : fallbackBadge
    ? `<div class="flex justify-end">${fallbackBadge}</div>`
    : '';

  if (isPureContainer) {
    return `
      <div class="space-y-1.5 min-w-0">
        ${headerLineHtml}
      </div>
    `;
  }

  if (resolved.usedLang === 'none' || !resolved.html.trim()) {
    return `
      <div class="space-y-1.5 min-w-0">
        ${headerLineHtml}
        <p class="text-xs italic text-slate-400">
          Sin contenido redactado en ${requestedLang === 'es' ? 'español' : 'inglés'}.
        </p>
      </div>
    `;
  }

  const bodyWithHighlights = query.trim()
    ? highlightSanitizedClauseHtml(resolved.html, query)
    : resolved.html;

  return `
    <div class="space-y-2 min-w-0">
      ${headerLineHtml}
      <div class="${FULL_NORMA_PROSE_CLASSES}">
        ${bodyWithHighlights}
      </div>
    </div>
  `;
}

function accumulateSectionObligationCounts(
  target: NormativeObligationCounts,
  html: string,
  usedLang: ClauseLanguage | 'none'
): void {
  if (!html || usedLang === 'none') return;
  const counts = countNormativeObligationTerms(html);
  if (usedLang === 'es') {
    target.debe += counts.debe;
    target.deberia += counts.deberia;
  } else {
    target.shall += counts.shall;
    target.should += counts.should;
  }
}

function renderSectionCodeToken(
  req: RequisitoLtree,
  highlightedCodeHtml: string,
  interactiveLinks: boolean
): string {
  if (interactiveLinks) {
    return `<button type="button" data-action="select-requisito" data-requisito-id="${escapeHtml(req.id)}" title="Ir a cláusula ${escapeHtml(req.codigo)}" class="font-bold text-slate-900 hover:text-indigo-700 hover:underline focus:underline cursor-pointer bg-transparent p-0 border-0 inline shrink-0">${highlightedCodeHtml}</button>`;
  }
  return `<strong class="font-bold text-slate-900 shrink-0">${highlightedCodeHtml}</strong>`;
}

/**
 * Pure body renderer for the Unified Full-Standard HTML Reader (`es` / `en` / `bilingual`)
 * following documentary Rules 1, 2, and 3 with clickable bold clause jump links.
 */
export function renderNormaFullReaderBody(params: {
  norma: NormaEntity;
  requisitos: ReadonlyArray<RequisitoLtree>;
  lang: NormaFullReaderLang;
  query: string;
  interactiveLinks?: boolean;
}): NormaFullReaderBodyResult {
  const { norma, requisitos, lang, query, interactiveLinks = true } = params;
  const obligationCounts: NormativeObligationCounts = {
    debe: 0,
    deberia: 0,
    shall: 0,
    should: 0,
  };
  const activeReqs = requisitos.filter(
    (r) =>
      !r.deleted_at &&
      (r.id_norma === norma.id ||
        r.norma_codigo.trim().toLowerCase() === norma.codigo.trim().toLowerCase())
  );

  const orderedAll = orderNormaRequisitosHierarchically(activeReqs);
  const nodes = toClauseRenderNodes(orderedAll);
  const nodeById = new Map<string, ClauseRenderNode>();
  for (let i = 0; i < nodes.length; i += 1) {
    nodeById.set(nodes[i].id, nodes[i]);
  }
  const byIdMap = new Map<string, RequisitoLtree>();
  for (let i = 0; i < orderedAll.length; i += 1) {
    byIdMap.set(orderedAll[i].id, orderedAll[i]);
  }
  const { clausesById, clausesByNormaAndCode } = buildClauseRenderMaps(nodes);

  const trimmedQuery = (query || '').trim();
  const cleanQ = normalizeSearchString(trimmedQuery);
  const searchTokens = cleanQ ? cleanQ.split(/\s+/).filter(Boolean) : [];
  const isFiltered = searchTokens.length > 0;

  let clausesToRender: RequisitoLtree[];
  let pureContainerIds = new Set<string>();

  if (isFiltered) {
    clausesToRender = orderedAll.filter((req) => {
      const idxText = buildClauseSearchIndex(req, nodeById.get(req.id));
      return searchTokens.every((tok) => idxText.includes(tok));
    });
  } else {
    // Collect all `{clause_...}` tokens embedded anywhere in active clauses of this Norma
    const embeddedCodesLower = new Set<string>();
    for (let i = 0; i < orderedAll.length; i += 1) {
      const r = orderedAll[i];
      const esToks = extractClausePlaceholders(r.translations?.es?.content_html || '');
      const enToks = extractClausePlaceholders(r.translations?.en?.content_html || '');
      for (const t of esToks) embeddedCodesLower.add(t.toLowerCase());
      for (const t of enToks) embeddedCodesLower.add(t.toLowerCase());
    }

    // Track parents that have un-embedded children so structural nodes are never orphaned
    const hasChildMap = new Set<string>();
    for (let i = 0; i < orderedAll.length; i += 1) {
      const pid = orderedAll[i].id_requisito_padre;
      if (pid) hasChildMap.add(pid);
    }

    // Inline-only fragments (e.g. `4.2.a`, `4.4.1`, `4.4.1.a`) are embedded via `{clause_...}` and have no explicit title
    const sectionClauses = orderedAll.filter((req) => {
      const isEmbedded = embeddedCodesLower.has(req.codigo.trim().toLowerCase());
      if (!req.id_requisito_padre || !isEmbedded) return true;
      if (hasExplicitClauseTitle(req)) return true;
      // Keep if it has children that are NOT embedded
      if (hasChildMap.has(req.id)) {
        const children = orderedAll.filter((c) => c.id_requisito_padre === req.id);
        return children.some((c) => !embeddedCodesLower.has(c.codigo.trim().toLowerCase()));
      }
      return false;
    });

    const sectionCodesLower = new Set(
      sectionClauses.map((r) => r.codigo.trim().toLowerCase())
    );

    // Determine pure section containers vs mixed-prose containers
    const mixedProseExpandedCodesLower = new Set<string>();
    for (let i = 0; i < sectionClauses.length; i += 1) {
      const req = sectionClauses[i];
      if (isPureSectionContainerClause(req, lang, sectionCodesLower)) {
        pureContainerIds.add(req.id);
      } else {
        // Any section code embedded inside a mixed-prose parent will be rendered inline by resolveClauseHtml
        const esToks = extractClausePlaceholders(req.translations?.es?.content_html || '');
        const enToks = extractClausePlaceholders(req.translations?.en?.content_html || '');
        for (const t of [...esToks, ...enToks]) {
          if (sectionCodesLower.has(t.toLowerCase())) {
            mixedProseExpandedCodesLower.add(t.toLowerCase());
          }
        }
      }
    }

    clausesToRender = sectionClauses.filter(
      (req) => !mixedProseExpandedCodesLower.has(req.codigo.trim().toLowerCase())
    );
  }

  if (orderedAll.length === 0) {
    return {
      bodyHtml: `
        <div class="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center space-y-2">
          <div class="text-2xl select-none" aria-hidden="true">📘</div>
          <h3 class="text-sm font-bold text-slate-900">Sin cláusulas normativas registradas</h3>
          <p class="text-xs text-slate-500 max-w-md mx-auto">
            La norma ${escapeHtml(norma.codigo)} aún no tiene cláusulas activas registradas.
          </p>
        </div>
      `,
      matchCount: 0,
      totalCount: 0,
      isFiltered,
      obligationCounts,
    };
  }

  if (clausesToRender.length === 0) {
    return {
      bodyHtml: `
        <div data-norma-full-empty="true" class="rounded-xl border border-slate-200 bg-white p-8 text-center space-y-2 shadow-2xs">
          <div class="text-2xl select-none" aria-hidden="true">🔍</div>
          <h3 class="text-sm font-bold text-slate-900">Sin coincidencias en la norma</h3>
          <p class="text-xs text-slate-500 max-w-md mx-auto">
            No se encontraron cláusulas ni texto bilingüe coincidente con "${escapeHtml(trimmedQuery)}".
          </p>
        </div>
      `,
      matchCount: 0,
      totalCount: orderedAll.length,
      isFiltered,
      obligationCounts,
    };
  }

  const sectionsHtml = clausesToRender
    .map((req) => {
      const indent = calculateLtreeIndentation(req.ruta_materializada, req.codigo);
      const isRoot = !req.id_requisito_padre || indent.level === 1;
      const isPureContainer = !isFiltered && pureContainerIds.has(req.id);
      const primaryLang: ClauseLanguage = lang === 'en' ? 'en' : 'es';
      const primaryTitle = resolveClauseTitleForLang(req, primaryLang, primaryLang);
      const highlightedTitle = isFiltered
        ? highlightSanitizedClauseHtml(escapeHtml(primaryTitle), trimmedQuery)
        : escapeHtml(primaryTitle);
      const highlightedCode = isFiltered
        ? highlightSanitizedClauseHtml(escapeHtml(req.codigo), trimmedQuery)
        : escapeHtml(req.codigo);
      const codeTokenHtml = renderSectionCodeToken(
        req,
        highlightedCode,
        interactiveLinks
      );
      const hierarchyPath = isFiltered
        ? formatRequisitoHierarchyPath(req, byIdMap)
        : '';

      const indentClass =
        !isFiltered && indent.level > 1
          ? indent.level === 2
            ? 'sm:pl-4'
            : 'sm:pl-7'
          : '';

      if (lang === 'bilingual') {
        const esResolved = isPureContainer
          ? {
              html: '',
              usedLang: 'es' as const,
              isFallbackLang: false,
              resolvedChildCodes: [],
              unresolvedTokens: [],
              cycleDetected: false,
            }
          : resolveClauseHtml({
              clauseId: req.id,
              lang: 'es',
              clausesById,
              clausesByNormaAndCode,
              maxDepth: 10,
              interactiveLinks,
              includeEmbeddedTitles: true,
              includeRootHeader: !hasExplicitClauseTitle(req),
            });
        const enResolved = isPureContainer
          ? {
              html: '',
              usedLang: 'en' as const,
              isFallbackLang: false,
              resolvedChildCodes: [],
              unresolvedTokens: [],
              cycleDetected: false,
            }
          : resolveClauseHtml({
              clauseId: req.id,
              lang: 'en',
              clausesById,
              clausesByNormaAndCode,
              maxDepth: 10,
              interactiveLinks,
              includeEmbeddedTitles: true,
              includeRootHeader: !hasExplicitClauseTitle(req),
            });

        if (!isPureContainer) {
          accumulateSectionObligationCounts(
            obligationCounts,
            esResolved.html,
            esResolved.usedLang
          );
          if (!esResolved.isFallbackLang || enResolved.usedLang !== esResolved.usedLang) {
            accumulateSectionObligationCounts(
              obligationCounts,
              enResolved.html,
              enResolved.usedLang
            );
          }
        }

        const esTitle = resolveClauseTitleForLang(req, 'es', esResolved.usedLang);
        const enTitle = resolveClauseTitleForLang(req, 'en', enResolved.usedLang);
        const headingTitle =
          esTitle === enTitle ? esTitle : `${esTitle} / ${enTitle}`;
        const highlightedBilingualHeading = isFiltered
          ? highlightSanitizedClauseHtml(escapeHtml(headingTitle), trimmedQuery)
          : escapeHtml(headingTitle);

        return `
          <article
            data-full-clause-code="${escapeHtml(req.codigo)}"
            class="${
              isRoot
                ? 'pt-4 first:pt-0 border-t border-slate-200/90 first:border-t-0'
                : 'pt-2.5'
            } ${indentClass} space-y-2"
          >
            <header class="flex flex-wrap items-baseline justify-between gap-2">
              <h3 class="${
                isRoot ? 'text-base sm:text-[17px]' : 'text-sm sm:text-[15px]'
              } font-bold text-slate-900 leading-snug">
                ${codeTokenHtml} <span>${highlightedBilingualHeading}</span>
              </h3>
              ${
                hierarchyPath
                  ? `<span class="text-[11px] font-medium text-indigo-600 truncate">${escapeHtml(hierarchyPath)}</span>`
                  : ''
              }
            </header>

            ${
              isPureContainer
                ? ''
                : `
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-start pt-1">
                    <div class="min-w-0">
                      ${renderSingleClauseColumnHtml({
                        req,
                        requestedLang: 'es',
                        resolved: esResolved,
                        query: trimmedQuery,
                        isPureContainer: false,
                        showLangHeader: true,
                      })}
                    </div>
                    <div class="min-w-0 md:border-l md:border-slate-200/80 md:pl-4">
                      ${renderSingleClauseColumnHtml({
                        req,
                        requestedLang: 'en',
                        resolved: enResolved,
                        query: trimmedQuery,
                        isPureContainer: false,
                        showLangHeader: true,
                      })}
                    </div>
                  </div>
                `
            }
          </article>
        `;
      }

      const requestedLang: ClauseLanguage = lang === 'en' ? 'en' : 'es';
      const resolved = isPureContainer
        ? {
            html: '',
            usedLang: requestedLang,
            isFallbackLang: false,
            resolvedChildCodes: [],
            unresolvedTokens: [],
            cycleDetected: false,
          }
        : resolveClauseHtml({
            clauseId: req.id,
            lang: requestedLang,
            clausesById,
            clausesByNormaAndCode,
            maxDepth: 10,
            interactiveLinks,
            includeEmbeddedTitles: true,
            includeRootHeader: !hasExplicitClauseTitle(req),
          });

      if (!isPureContainer) {
        accumulateSectionObligationCounts(
          obligationCounts,
          resolved.html,
          resolved.usedLang
        );
      }

      return `
        <article
          data-full-clause-code="${escapeHtml(req.codigo)}"
          class="${
            isRoot
              ? 'pt-4 first:pt-0 border-t border-slate-200/90 first:border-t-0'
              : 'pt-2.5'
          } ${indentClass} space-y-1.5"
        >
          <header class="flex flex-wrap items-baseline justify-between gap-2">
            <h3 class="${
              isRoot ? 'text-base sm:text-[17px]' : 'text-sm sm:text-[15px]'
            } font-bold text-slate-900 leading-snug">
              ${codeTokenHtml} <span>${highlightedTitle}</span>
            </h3>
            ${
              hierarchyPath
                ? `<span class="text-[11px] font-medium text-indigo-600 truncate">${escapeHtml(hierarchyPath)}</span>`
                : ''
            }
          </header>

          ${
            isPureContainer
              ? ''
              : renderSingleClauseColumnHtml({
                  req,
                  requestedLang,
                  resolved,
                  query: trimmedQuery,
                  isPureContainer: false,
                  showLangHeader: false,
                })
          }
        </article>
      `;
    })
    .join('');

  return {
    bodyHtml: sectionsHtml,
    matchCount: clausesToRender.length,
    totalCount: orderedAll.length,
    isFiltered,
    obligationCounts,
  };
}
