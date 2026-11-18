# Step 4.1: Componente Rich Text HTML Editor Bilingüe (`src/lib/richTextEditor.ts` + `src/views/richTextEditor.ts`)

## 1. Objetivo
Diseñar y construir un **Rich Text HTML Editor** modular, accesible y libre de dependencias pesadas, pensado para que `ADMIN` y `WORKER` redacten en español e inglés el contenido de las normas sin texto en CSV (`ISO/IEC 27001:2022`, `NTF 4073:2022`, `ISO/IEC 17065:2012`, `ISO 50001:2018`) o mantengan normas existentes, con pestañas por idioma, barra de formato semántico, modo código HTML y vista previa en vivo.

---

## 2. Arquitectura del Componente

### 2.1 Módulo de Utilidades Puras (`src/lib/richTextEditor.ts`)
Funciones puras y probables con `node:test` (`0 any`):
1. `wrapSelectionWithTag(html: string, start: number, end: number, tag: 'strong' | 'em' | 'u')`: apoyo determinista para manipulación de texto en modo HTML fuente.
2. `insertTextAtCursor(source: string, cursorStart: number, cursorEnd: number, insertion: string): { value: string; nextCursor: number }`: inserta tokens `{clause_...}` o snippets HTML en la posición exacta del cursor.
3. `normalizeEditorHtmlOutput(rawHtml: string): string`:
   - Convierte `<b>` → `<strong>`, `<i>` → `<em>`, normaliza `<div>`/`<p>` generados por `contenteditable` y ejecuta `sanitizeClauseHtml()` para garantizar HTML limpio, uniforme y seguro antes de guardar en estado o Supabase.
4. `buildIsoNoteHtmlSnippet(): string` y `buildSimpleTableHtmlSnippet(rows = 2, cols = 2): string`: plantillas limpias para notas normativas (`<div><strong>NOTA:</strong> ...</div>`) y tablas de requisitos.

### 2.2 Renderer de UI del Editor (`src/views/richTextEditor.ts`)
Exporta `renderBilingualClauseEditor(props: BilingualClauseEditorProps): string`:
1. **Cabecera de Idioma (`Español (ES)` / `Inglés (EN)`):**
   - Selector de pestaña activa (`data-editor-lang="es" | "en"`) con badge indicador de estado (`Con contenido` vs `Vacío`) en cada idioma para guiar la autoría bilingüe completa.
2. **Selector de Modo del Editor (`Visual` / `HTML` / `Vista Previa`):**
   - **`Visual` (`contenteditable="true"`):** área editable estilizada con Tailwind (`prose-sm`, listas visibles, bloques de párrafo claros, enlaces y tokens `{clause_...}` resaltados visualmente si se desea o editables limpiamente).
   - **`HTML` (`<textarea>` monoespaciado):** edición directa de etiquetas HTML limpias sincronizada bidireccionalmente con el buffer `Visual`.
   - **`Vista Previa`:** renderiza en vivo el resultado de `resolveClauseHtml()` para verificar cómo quedarán ensamblados los placeholders `{clause_...}` y el formato final antes de pulsar Guardar.
3. **Barra de Herramientas Semántica (`role="toolbar"`):**
   - Formato de texto: **Negrita (`B`)**, *Cursiva (`I`)*, Párrafo / Bloque (`¶`).
   - Listas: Lista con viñetas (`• Lista`), Lista numerada (`1. Lista`).
   - Bloques ISO: `NOTA` normativa, `Tabla 2×2`, `Enlace https://` (con modal/popover inline seguro; prohibido `window.prompt` o `window.alert`).
   - **Slot de Inserción de Sub-cláusula (`+ { } Sub-cláusula`)** conectado al Step 4.2.
   - Botón `Limpiar formato` y `Deshacer`.

---

## 3. Reglas de Seguridad, Accesibilidad e iFrame
- **Prohibido `window.alert`, `window.confirm`, `window.prompt`** (estrictamente bloqueado por el entorno iFrame). La inserción de enlaces (`<a href="...">`) usa un micro-popover inline dentro de la barra de herramientas con validación `^https?:\/\/`.
- **Sincronización sin pérdida de foco:** al escribir en `contenteditable` o `<textarea>`, actualizar el borrador en memoria (`state.extraDomain.requisitoFormDraft`) mediante eventos `input` sin disparar un `render()` completo del documento en cada pulsación de tecla.
- **Responsive (`1440x900` y `390x844`):** la barra de herramientas usa `flex-wrap` con botones táctiles accesibles (`aria-label`, `title`) sin generar desbordamiento horizontal.

---

## 4. Criterios de Aceptación del Paso
- [ ] El editor permite alternar entre `Español (ES)` e `Inglés (EN)` conservando ambos borradores independientes en memoria antes de guardar.
- [ ] Todos los botones de barra (`Negrita`, `Cursiva`, `Viñetas`, `Numerada`, `Nota`, `Tabla`, `Enlace`) producen HTML limpio validado por `sanitizeClauseHtml()`.
- [ ] Cambiar entre `Visual`, `HTML` y `Vista Previa` sincroniza el contenido sin perder datos ni disparar errores XSS.
- [ ] No se utilizan `window.prompt` / `window.alert` ni dependencias con `any`.
