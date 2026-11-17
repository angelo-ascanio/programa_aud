# Step 3.2: Batch Subtree Clause Picker (`procesoView.ts`), Smart-Mutation Preview (`noAplicableView.ts`) & Mandatory Override UI (`requisitoView.ts`)

> **Goal:** Eliminate high-friction single-clause assignment in `procesoView.ts`, add real-time non-blocking Smart-Mutation previews to `noAplicableView.ts`, and expose `es_obligatorio` inspection/override in `requisitoView.ts`.  
> **Depends On:** Step 2.2 (batch linker & mutation wiring) and Step 3.1 (Coverage HUD).

---

## 1. Ergonomic Batch Subtree Clause Picker (`src/views/procesoView.ts`)

Currently `renderProcesoRequisitosTab` only renders a flat single-select `<select id="assignProcesoReqSelect">` and `<select id="unassignProcesoReqSelect">`. Upgrade it cleanly inside the `Requisitos Cubiertos` tab without breaking Clean List (`table-fixed` for the linked list):

### 1.1 Batch Assignment Panel (`#assignProcesoRequisitosBatchForm`)
When staff clicks **`+ Vincular Cláusulas`** (`isAssigningRequisito === true`):
1. **Quick-Action Toolbar:**
   - Search filter input (`data-action="filter-proceso-batch-clauses"`) matching clause `codigo`, title, or bilingual text (accent-normalized via `normalizeSearchToken`).
   - Quick toggle pills: `Solo Obligatorias` (default ON) | `Solo Pendientes` | `Todas`.
   - 1-Click Bulk Helpers:
     - **`✓ Seleccionar Todas las Pendientes`** (`data-action="select-pending-mandatory-clauses"`): checks all remaining `PENDIENTE` mandatory clauses (automatically collapsing redundant descendants if their mandatory parent is selected).
     - **`Limpiar Selección`** (`data-action="clear-proceso-batch-selection"`).
2. **Hierarchical Tree Checklist (`orderNormaRequisitosHierarchically`):**
   - Indented visually using `calculateLtreeIndentation(req.nivel)`.
   - Each clause row displays:
     - Checkbox (`name="batch_requisito_id"`, `value="${req.id}"`) — disabled if already directly linked to this process OR blocked by ISO 4.3 (`isExcludedByIso43`).
     - Monospace `codigo` + concise `titulo` + status tag:
       - `⛔ Excluida ISO 4.3 (vía Cláusula X)` (rose badge, disabled)
       - `✓ Ya vinculada a este proceso` (emerald muted, disabled)
       - `🔗 Cubierta en: <Otro Proceso>` (indigo informational pill — still selectable since multiple processes may share a clause like `7.5`)
       - `⚠️ Pendiente obligatoria` (amber pill)
       - `ℹ️ Informativa` (slate muted pill)
     - **Downward Subtree Preview Hint:** On parent clauses (`req.es_padre`), show `(+N subcláusulas obligatorias)` so the user knows checking `8.5` covers the entire `8.5.*` subtree!
3. **Sticky Action Summary Bar (inside the inline picker panel, NOT page footer):**
   - Live counter: `X cláusulas seleccionadas (cubre Y obligatorias en total)`
   - Primary submit **`Vincular Seleccionadas`** + **`Cancelar`**.

### 1.2 Linked Clauses Table Enhancement
- Keep `renderListViewTable` (`table-fixed`, `<colgroup>`, zero `acciones` column) for `proceso-tab-requisitos`.
- Display an extra informational badge on parent clauses linked to the process: e.g., `4.4 (cubre 11 subcláusulas)`.
- Preserve `#unassignProcesoRequisitoForm` (plus optional multi-select unlink / checkbox clear when editing).

---

## 2. Real-Time Non-Blocking Smart-Mutation Preview (`src/views/noAplicableView.ts`)

In `renderNoAplicableView()` (modes `'add'` and `'edit'`):
1. **Live Conflict Inspection:** Whenever `draft.id_certificado` and `draft.id_requisito` are selected, invoke `computeNoAplicableMutationPreview()` (which wraps `previewNonApplicableSmartMutation`).
2. **Clause Selector Filtering & Annotation:**
   - Sort options hierarchically (`orderNormaRequisitosHierarchically`).
   - Annotate clauses currently covered by processes with `(En uso por N proceso(s))` — NEVER disable them, honoring the non-blocking workflow!
   - Disable only duplicate active exclusions on the same certificate (`ya excluida directamente`).
3. **Non-Blocking Smart-Mutation Alert Banner (`role="status"`):**
   If `preview.willMutate === true`:
   - Render an amber informational card directly below the `#noAplicableDetailForm` clause field:
     - **Title:** `⚡ Mutación Inteligente (No Bloqueante): Reasignación automática al guardar`
     - **Body:** Explain clearly that declaring `Cláusula ${target.codigo}` (and its subtree) as **No Aplicable (ISO 4.3)** will automatically unlink **`${preview.prunedLinks.length}` asignación(es)** currently active in **`${preview.affectedProcessCount}` proceso(s)**:
       - Bulleted summary grouped by process name (e.g., `• Troquelado y Fundición: Cláusulas 8.5, 8.5.1`).
     - Zero UUIDs exposed in process names or clause codes (`assertZeroUuidExposure`).
4. **Already-Covered-By-Parent-Exclusion Hint:**
   - If the selected clause has an ancestor already in `cert.noAplicables` (e.g., `8.3` is already excluded and user picks `8.3.2`), show a soft slate info note (`La cláusula 8.3.2 ya hereda exclusión de 8.3`).

---

## 3. Normative Obligation Visibility & Staff Override (`src/views/requisitoView.ts`)

In `renderRequisitoView()`:
1. **Read Mode Badge:** Next to `explicit_code`, display a high-contrast badge:
   - `es_obligatorio === true` $\rightarrow$ `✓ Requisito Obligatorio (${origenLabel})` (emerald/indigo badge)
   - `es_obligatorio === false` $\rightarrow$ `ℹ️ Informativa / Contenedor` (slate badge)
2. **Edit / Add Mode Control:** Add a standardized `renderDetailBooleanField` checkbox (`id="reqEsObligatorioCheckbox"`, `name="es_obligatorio"`) inside the Zone 2 attribute grid so `ADMIN`/`WORKER` staff can override edge-case clauses (automatically tagging `obligatorio_origen = 'MANUAL'` on save).

---

## 4. Verification Criteria for Step 3.2
- Staff can cover an entire 69-mandatory-clause standard (`ISO 9001:2015`) across 3 processes in `< 10` clicks using `"Seleccionar Todas las Pendientes"` or chapter checkboxes.
- Attempting to assign an excluded clause in `procesoView.ts` is visibly blocked with its ISO 4.3 exclusion reference.
- Selecting an active process-covered clause (or its parent) inside `noAplicableView.ts` immediately previews every process and sub-clause that will be auto-pruned upon saving—with zero blocking errors.
- `requisitoView.ts` toggles `es_obligatorio` cleanly and preserves `obligatorio_origen = 'MANUAL'` across refreshes.
