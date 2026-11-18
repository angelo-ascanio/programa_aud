# Step 3.2: Rediseño de `Requisito` Detail View (`'read'` Mode): Toggle Bilingüe (`ES`/`EN`/Lado a Lado), Placeholders Expandidos y Ayudantes de Navegación

## 1. Objetivo
Transformar `src/views/requisitoView.ts` en una ficha normativa de alta legibilidad para auditores y redactores técnicos en modo `'read'`: renderizado HTML seguro con expansión recursiva de `{clause_...}`, conmutador bilingüe (`ES` / `EN` / `Lado a Lado`), navegación rápida entre vecinos del mismo nivel, enlaces jerárquicos hacia padre e hijos directos, y un botón global persistente para regresar a la `Norma` padre en un clic.

---

## 2. Arquitectura de Ayudantes de Navegación (`src/lib/extraDomain.ts` + `src/views/requisitoView.ts`)

### 2.1 Cálculo Puro de Navegación Normativa (`buildRequisitoNavigationContext`)
Crear una función pura en `src/lib/extraDomain.ts` (o `src/lib/clauseRenderer.ts`) que reciba `(targetReq, allRequisitosOfNorma)` y retorne:
1. **`parentReq: RequisitoLtree | null`**: cláusula padre inmediata (`id_requisito_padre`).
2. **`siblings: RequisitoLtree[]`**: todas las cláusulas hermanas con el mismo `id_requisito_padre` (incluyendo `null` para comparar capítulos raíz `1`..`10`) ordenadas numéricamente por `ruta_materializada` / `codigo`.
3. **`prevSibling: RequisitoLtree | null` y `nextSibling: RequisitoLtree | null`**: vecinos inmediato anterior y posterior (ej. estando en `7.1.1` → anterior `—`, siguiente `7.1.2`, más la tira de píldoras/botones de hermanos `7.1.1`, `7.1.2`, `7.1.3`, `7.1.4` con un límite compacto si hay muchos hermanos, e.g., términos `3.1`..`3.37`, mostrando ventana alrededor del activo + select/scroll).
4. **`directChildren: RequisitoLtree[]`**: hijos directos ordenados numéricamente (`7.1.1.a`, `7.1.1.b`, etc.).

---

## 3. Diseño de la Ficha `Requisito` en Modo `'read'` (`src/views/requisitoView.ts`)

### 3.1 Cabecera (Zona 0/1) + Retorno Global a la `Norma`
- Mantener la estructura canónica de `renderDetailPageTemplate`:
  - Botón `←` de retroceso contextual de breadcrumb (`back-to-requisito-parent`).
  - **Ayudante de Retorno Global a `Norma`:** junto a las acciones de cabecera (o barra contextual superior de Zona 1), incluir un botón explícito en un clic:
    ```html
    <button
      type="button"
      data-action="select-norma-from-requisito"
      data-norma-id="..."
      data-target-tab="requisitos"
      class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50/80 hover:bg-indigo-100 text-indigo-800 text-xs font-bold transition-colors cursor-pointer shrink-0"
      title="Ir a la ficha de la Norma"
    >
      <span aria-hidden="true">📘</span>
      <span>Ir a Norma</span>
    </button>
    ```
  - En `src/main.ts`, el manejador de `select-norma-from-requisito` navega directamente a la `Norma` padre con `activeNormaTab = 'requisitos'` y usa `pushBreadcrumb` (que aplica prevención de bucles truncando el breadcrumb hasta el ancestro `norma-<id>` si ya estaba en la ruta).

### 3.2 Zona 1: Relaciones Jerárquicas Superiores + Navegación de Vecinos
1. **Tarjetas de Padre (`parents`):**
   - Tarjeta 1: **Norma ISO** (`ISO 9001:2015 — ...`) → clic abre la `Norma` en pestaña `requisitos`.
   - Tarjeta 2 *(si existe padre)*: **Cláusula Padre** (`7.1 — Recursos`) → clic navega arriba hacia `7.1`.
2. **Barra de Navegación entre Vecinos (`aria-label="Cláusulas hermanas del mismo nivel"`):**
   - Botón `← Anterior` (`7.1.0` o deshabilitado si es el primero).
   - Selector / tira interactiva de hermanos del mismo nivel (`[data-action="select-requisito"][data-requisito-id="..."]`) resaltando el requisito actual (`7.1.1`) y permitiendo saltar directamente a `7.1.2`, `7.1.3`, `7.1.4` con un solo clic.
   - Botón `Siguiente →`.

### 3.3 Zona 2: Toggle Bilingüe y Contenido HTML Recursivo
1. **Conmutador de Idioma (`role="group"`):**
   - Tres botones compactos (`data-action="set-requisito-lang-mode"` con `data-lang-mode="es" | "en" | "both"`):
     - **`🇪🇸 Español`** (`es`)
     - **`🇬🇧 English`** (`en`)
     - **`⇄ Comparativa ES / EN`** (`both` — columnas lado a lado en pantallas `lg:grid-cols-2` para auditar verbos normativos `"shall"` / `"should"` / `"may"` frente a `"debe"` / `"debería"` / `"puede"`).
2. **Panel de Contenido Normativo Renderizado:**
   - Mostrar el `title` localizado de la cláusula como encabezado legible y el cuerpo HTML generado por `resolveClauseHtml()` (`Step 2.1`).
   - Cada bloque `{clause_...}` expandido muestra una línea guía sutil (`border-l-2 border-indigo-200`) y una micro-etiqueta discreta con código de la sub-cláusula (clickable con `data-action="select-requisito"` para inspeccionarla o editarla).
   - Si la norma aún no tiene contenido redactado (ej. `ISO/IEC 27001:2022`, `NTF 4073:2022`), mostrar un estado vacío claro con invitación a redactar usando el botón de edición (`✏️`) si el usuario es Staff aprobado.
   - Si se usó idioma de respaldo (`isFallbackLang: true`, como en `iso45001_2018` `3.2` ES), mostrar una franja informativa amable indicando que el texto mostrado corresponde al idioma alterno disponible.

### 3.4 Zona 3: Hijos Directos y Procesos Vinculados
- **`🌿 Sub-requisitos` (Pestaña 1):**
  - Arriba de la tabla limpia, mostrar una barra de acceso rápido de **chips/píldoras de hijos directos** (`7.1.1.a`, `7.1.1.b`, ...) si existen, además de la tabla `requisito-tab-subrequisitos` con su título localizado y estado de traducción (`ES/EN`), y el botón `+ Agregar Sub-requisito` solo para Staff aprobado.
- **`⚙️ Procesos Vinculados` (Pestaña 2):** mantener la tabla limpia `requisito-tab-procesos` intacta.

---

## 4. Criterios de Aceptación del Paso
- [ ] El selector `ES` / `EN` / `Lado a Lado` cambia el idioma renderizado al instante conservando los placeholders `{clause_...}` expandidos en el idioma correspondiente.
- [ ] En cláusulas compuestas (ej. ISO 9001 `1`, `4.4.1`, `7.1.1`), los bloques hijos se renderizan anidados con claridad visual y permiten saltar a la sub-cláusula con un clic.
- [ ] Los controles de vecinos permiten navegar entre `7.1.1` → `7.1.2` → `7.1.3` sin regresar a la Norma.
- [ ] El botón global `Ir a Norma` retorna a la Norma padre en pestaña `Requisitos` limpiando cualquier bucle en breadcrumbs.
