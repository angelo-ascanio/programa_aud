# Step 2.1: Sanitizador HTML Allowlist, Motor Recursivo de Placeholders `{clause_X.Y.Z}` y Extractor de Búsqueda (`src/lib/clauseRenderer.ts`)

## 1. Objetivo
Crear el motor puro de renderizado seguro y composición jerárquica de cláusulas en `src/lib/clauseRenderer.ts`, garantizando seguridad contra XSS, resolución recursiva sin ciclos de tokens `{clause_...}`, fallback bilingüe controlado y extracción de texto plano para búsquedas multinivel.

---

## 2. Reglas de Seguridad y Sanitización HTML

El CSV de traducciones contiene HTML real (`<div>`, `<ul>`, `<li>`, `<br>`, `<a href="https://...">`) y el futuro editor permitirá formato enriquecido (`<strong>`, `<em>`, `<p>`, `<table>`, etc.).

### 2.1 Función `sanitizeClauseHtml(rawHtml: string): string`
Implementar un sanitizador determinista (isomórfico para navegador y `node:test` sin depender obligatoriamente del DOM global):
- **Etiquetas permitidas (Allowlist):** `div`, `p`, `span`, `strong`, `b`, `em`, `i`, `u`, `br`, `ul`, `ol`, `li`, `blockquote`, `table`, `thead`, `tbody`, `tr`, `th`, `td`, `a`.
- **Atributos permitidos:**
  - En `<a>`: únicamente `href` validado contra esquemas seguros `^https?:\/\/` (rechazar `javascript:`, `data:`, `vbscript:`), forzando `target="_blank" rel="noopener noreferrer"`.
  - En tablas/celdas: opcionalmente `colspan`, `rowspan` numéricos positivos.
  - Eliminar cualquier atributo `on*` (`onclick`, `onerror`, etc.), `style`, `class` arbitraria o `data-oe-version`.
- **Etiquetas bloqueadas y eliminadas con su contenido peligroso:** `<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>`, `<svg>`, `<form>`, `<input>`.

---

## 3. Motor Recursivo de Placeholders `{clause_X.Y.Z}`

### 3.1 Contrato de Tipos (`0 any`)
```ts
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
  interactiveLinks?: boolean; // permite hacer clic en bloques hijos inyectados
}

export interface ResolvedClauseResult {
  html: string;
  usedLang: ClauseLanguage | 'none';
  isFallbackLang: boolean;
  resolvedChildCodes: string[];
  unresolvedTokens: string[];
  cycleDetected: boolean;
}
```

### 3.2 Algoritmo de Resolución Recursiva (`resolveClauseHtml`)
1. **Selección de idioma y fallback controlado:**
   - Buscar traducción en `lang` solicitado (`'es'` o `'en'`).
   - Si no existe o `content_html.trim() === ''` (caso real detectado en `iso45001_2018` cláusula `3.2` ES), intentar la traducción alterna marcando `isFallbackLang: true` para mostrar un aviso discreto en UI (`Mostrando contenido en EN por ausencia en ES`), o estado vacío limpio si la norma aún no tiene contenido (ej. `ISO 27001`, `NTF 4073`).
2. **Sanitización previa:** ejecutar `sanitizeClauseHtml()` sobre el `content_html` del nodo antes de expandir placeholders.
3. **Detección y expansión de tokens `{clause_([A-Za-z0-9._-]+)}`:**
   - Buscar la clave `${node.id_norma}::${tokenCode.toLowerCase()}` dentro de `clausesByNormaAndCode`.
   - **Guardia anti-ciclos y profundidad máxima:** mantener `visitedIds: Set<string>` en la pila de recursión actual y límite `maxDepth = 10`. Si `visitedIds.has(child.id)` o `depth >= maxDepth`, registrar `cycleDetected = true` y renderizar un badge seguro `[Referencia circular protegida: ${escapeHtml(tokenCode)}]`.
   - **Referencia faltante en catálogo** (caso real: `{clause_9.1.3}` en `iso45001_2018` `9.1`): registrar en `unresolvedTokens` y renderizar un marcador no intrusivo:
     `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-mono text-[11px]">Cláusula ${escapeHtml(tokenCode)} sin definir</span>`.
   - **Bloque hijo resuelto:** envolver recursivamente el HTML resuelto del hijo en un contenedor semántico con sangría sutil e indicador de origen:
     ```html
     <div
       class="clause-embedded-block pl-3 sm:pl-4 my-1.5 border-l-2 border-indigo-200/80 hover:border-indigo-400 transition-colors"
       data-embedded-clause-code="..."
       data-embedded-clause-id="..."
     >
       ...HTML recursivo del hijo...
     </div>
     ```
     *(Si `interactiveLinks` está activo, incluir una micro-etiqueta clickable `[data-action="select-requisito"][data-requisito-id="..."]` en el borde superior/lateral para navegar directamente a la sub-cláusula sin duplicar texto).*

---

## 4. Extractor de Texto Indexable y Detección de Placeholders
Exportar también utilidades puras para búsqueda y editor:
1. `extractClausePlaceholders(rawHtml: string): string[]`: devuelve los códigos referenciados en `{clause_...}` (usado para mostrar advertencias en vivo en el editor si falta algún hijo directo o si un código no existe).
2. `stripHtmlToSearchText(rawHtml: string): string`: elimina etiquetas HTML y tokens `{clause_...}`, decodifica entidades comunes (`&nbsp;`, `&amp;`, `&lt;`, `&gt;`, `&quot;`) y normaliza espacios/acentos para alimentar el buscador multinivel de `Norma` Detail View.
3. `collectClauseIndexText(node: ClauseRenderNode): string`: concatena `codigo`, `title` (ES+EN) y texto plano de `content_html` (ES+EN) para búsqueda instantánea cross-language.

---

## 5. Criterios de Aceptación del Paso
- [ ] `sanitizeClauseHtml` bloquea el 100% de vectores `<script>`, `onerror=`, `javascript:` y preserva tablas, listas y enlaces `https://` con `rel="noopener noreferrer"`.
- [ ] `resolveClauseHtml` expande correctamente anidamientos de hasta 7 niveles (ej. `1 -> 1.a`, `4.4 -> 4.4.1 -> 4.4.1.a`) sin duplicar texto en almacenamiento.
- [ ] Ciclos artificiales (`A -> {clause_B}`, `B -> {clause_A}`) terminan de forma determinista con `cycleDetected: true` sin desbordamiento de pila.
- [ ] Placeholders sin nodo destino (`{clause_9.1.3}`) o con contenido vacío (`iso45001_2018` `3.2` ES) degradan elegantemente sin romper el DOM ni exponer UUIDs.
