# Step 4.2 — `Designación → Fecha` Detail View: Unified Programmed Dates Table, Symbol Actions & Fixed 1st Date

> **Pillar:** `Auditoría > Designación > Fecha` — Detail View ("Less Is More" Programmed Dates Table)
> **Prerequisites:** `step_4.1.md` completed.

---

## 1. Objective

Replace the separated/stacked planned-date cards and tag dropdowns in `Designación → Fecha` Detail View with a **single unified programmed-dates table** governed by "Less Is More":
1. Unified single table combining `PREPROGRAMADA_MES` (`YYYY-MM`) and `PROGRAMADA_EXACTA` (`YYYY-MM-DD`) rows, ordered **last record added first** (`numero_secuencia DESC`).
2. Minimal columns showing **only Actual Value** (`Mes + Año` or `YYYY-MM-DD`) and **optional Observation** (plus compact symbol-only `Acciones` for staff).
3. Simple **symbol-only buttons with `title` tooltips** for Add (`+`), Edit (`✏️`), and Remove (`🗑️`).
4. Explicitly require specifying **`YYYY-MM` (Año + Mes)** vs **`YYYY-MM-DD` (Fecha Exacta)** inside the lightweight Add/Edit form/modal, with clear microcopy stating programmed dates are planning targets synced across all linked audits (NOT real execution dates).
5. **Remove `Programación` / `Reprogramación` tag UI entirely**, while locking the **1st programmed date** (the initial/oldest `numero_secuencia`) as **fixed** — **editable (`✏️`), never removable (no `🗑️`)**.

---

## 2. Architectural & Database Guardrails

1. **`check_auditoria_fecha_tag` DB Constraint (`01_creacion.sql:925`):** PostgreSQL requires `tag IN ('Programación', 'Reprogramación')`. Without rendering any tag dropdown or badge in the UI, `designacionFechaDomain.ts` silently normalizes `tag`: `'Programación'` for the initial fixed planned date (`oldest / lowest numero_secuencia`) and `'Reprogramación'` for all subsequent planned rows.
2. **`check_auditoria_fecha_payload` DB Constraint (`01_creacion.sql:937`):** `PROGRAMADA_EXACTA` requires `fecha_inicio` and `fecha_fin` NOT NULL with `fecha_fin >= fecha_inicio`. When adding/editing an exact date (`YYYY-MM-DD`), allow either single-day (`fecha_inicio = fecha_fin`) by default or optional end date toggle cleanly inside the Add/Edit editor.
3. **Table Constitution (`table-fixed` + `<colgroup>` = `100%` + `0 <button> in <tbody>`):**
   - Use `<table id="designacion-fecha-detail-table" class="w-full table-fixed ...">` with `<colgroup>` widths strictly summing to `100%` (e.g. Staff: `34%` Valor, `52%` Observación, `14%` Acciones; Read-Only `AUDITOR`/`CLIENT`: `40%` Valor, `60%` Observación).
   - Render row symbol actions (`✏️`, `🗑️`) as accessible `<span role="button" tabindex="0" title="..." aria-label="...">` (supporting both `click` and `Enter`/`Space` keyboard activation) so `0 <button> in <tbody>` holds across every table in the codebase while preserving crisp symbol-only tooltip triggers!
   - Place the `+` Add button (`<button type="button" data-action="open-add-planned-date" title="Agregar fecha programada" aria-label="Agregar fecha programada">+</button>`) in the clean compact table header bar above `<table>`.
4. **Protecting 1st Programmed Date & Linked Batch Sync:**
   - Identify the 1st planned date (`initialFixedLocalId`: the planned row with lowest `numero_secuencia`, or first created row when drafting). Never render `🗑️` on that row, and guard `removePlannedDateRow` in domain logic & `main.ts` so deleting the 1st programmed date is impossible whenever any planned date exists (`"La fecha programada inicial puede editarse, pero no eliminarse."`).
   - Every Add / Edit / Remove persists smoothly through `saveLinkedBatchProgrammedDates`, propagating changes atomically across all audits in the linked `programa_auditoria` (`buildLinkedBatchDateSyncPlan`) while leaving `REAL` execution dates untouched.
   - Because the table displays rows **newest-added first** (`reverse` of `numero_secuencia ASC`), `buildLinkedBatchDateSyncPlan` must receive payloads sorted in **ascending sequence order (`oldest → newestAdded`)** so `seq=1` stays the fixed initial date and the newest-added date always holds `MAX(numero_secuencia)`.

---

## 3. Scope

### IN Scope
- `src/lib/designacionFechaDomain.ts`:
  - Add pure helpers:
    - `sortPlannedDraftsNewestFirst(drafts)` & `resolveInitialFixedDraftId(drafts)`
    - `removePlannedDateDraftSafely(drafts, localId)` (refuses removing the initial fixed 1st date, returning descriptive validation error)
    - `formatPlannedDateTableValue(draft)` (renders crisp value string, e.g. `Octubre 2026 (2026-10)` or `14/10/2026 (2026-10-14)` / range)
  - Update `validatePlannedDatesList` so tag is assigned deterministically in oldest→newest order (`idx === 0 ? 'Programación' : 'Reprogramación'`) regardless of UI display order (`newest-added first`), eliminating all UI tag requirements.
- `src/views/designacionFechaView.ts`:
  - Extend `DesignacionFechaViewState` with clean editor modal/panel state:
    - `editorMode: 'add' | 'edit' | null`
    - `editingLocalId: string | null`
    - `editorDraft: PlannedDateRowDraft | null`
  - Replace stacked `planned-date-row` cards with:
    - Compact section header bar: concise title (`Fechas Programadas` + optional subtle batch badge `Sincronizado con N auditorías vinculadas` when `siblingsCount > 1` + microcopy `"Fechas objetivo de planificación (las fechas reales se registran tras la ejecución)."`), and right-aligned symbol-only `+` button (`w-8 h-8`, `title="Agregar fecha programada"`).
    - **Single Unified Table** (`table-fixed`, `<colgroup>` = `100%`, `0 <button> in <tbody>`):
      - Sorted newest-added first.
      - Columns: `Fecha Programada` (actual formatted value, showing subtle precision hint `YYYY-MM` vs `YYYY-MM-DD` without noisy tag badges), `Observación` (optional text or subtle `—`), and `Acciones` (staff only: `✏️` with `title="Editar fecha programada"` on every row; `🗑️` with `title="Eliminar fecha programada"` on every row **except** the 1st/initial fixed date).
    - **Compact Add / Edit Date Modal (`#plannedDateEditorModal`):**
      - Rendered when `editorMode !== null && isStaff`.
      - Explicit precision selector (`Año + Mes (YYYY-MM)` vs `Fecha Exacta (YYYY-MM-DD)`), clean date/month inputs (`#fechaEditorTipoSelect`, `#fechaEditorAnioInput` + `#fechaEditorMesSelect` OR `#fechaEditorExactaInput` + optional range end), optional `Observación` input, explanatory note (`"Se aplicará a las N auditorías vinculadas; no modifica fechas reales."`), and symbol/concise Save (`✓` / `Guardar`) + Cancel (`✕`) controls.
    - Keep read-only `REAL` execution dates summary below only when `realDates.length > 0`.
- `src/main.ts`:
  - Wire DOM handlers for:
    - `[data-action="open-add-planned-date"]` → opens Add modal with default `PREPROGRAMADA_MES` or `PROGRAMADA_EXACTA`.
    - `[data-action="open-edit-planned-date"]` (click & `Enter`/`Space` keydown on `role="button"`) → opens Edit modal populated with that row's draft.
    - `[data-action="delete-planned-date"]` (click & `Enter`/`Space` keydown on `role="button"`) → enforces non-deletion of 1st date via `removePlannedDateDraftSafely` and immediately runs `saveLinkedBatchProgrammedDates` across the linked batch.
    - `#plannedDateEditorForm` submit → updates/appends the draft in ascending sequence order, validates, and calls `saveLinkedBatchProgrammedDates` so edits/additions persist immediately across all linked audits in the batch!
- `src/lib/designacionFechaDomain.test.ts`:
  - Test newest-added-first ordering (1st added row appears at bottom with `✏️` and NO `🗑️`; 2nd+ added row appears at top with both `✏️` and `🗑️`).
  - Test `removePlannedDateDraftSafely` blocks deleting 1st planned date while allowing deleting 2nd+ planned dates.
  - Test zero `Programación` / `Reprogramación` `<select>` or tag controls in Detail View HTML, explicit `YYYY-MM` vs `YYYY-MM-DD` mode selector inside editor modal, `<colgroup>` = `100%`, `0 <button> in <tbody>`, RBAC read-only (`AUDITOR`/`CLIENT` have no `+`, `✏️`, `🗑️`, or modal), linked-batch sync (`REAL` untouched), and Zero-UUID.

### OUT of Scope
- Changing other `Auditoría` Detail Views (`1.1`, `1.3`, `1.4`, `2`–`7`) unless regression-tested in `step_final.md`.

---

## 4. Files to Inspect & Modify

- **Inspect:** `src/lib/designacionFechaDomain.ts`, `src/views/designacionFechaView.ts`, `src/main.ts` (`lines 12483–12666`, `34342–34593`), `src/lib/designacionFechaDomain.test.ts`
- **Modify:** `src/lib/designacionFechaDomain.ts`, `src/views/designacionFechaView.ts`, `src/main.ts`, `src/lib/designacionFechaDomain.test.ts`

---

## 5. Detailed Tasks

1. **Domain Helpers (`src/lib/designacionFechaDomain.ts`):**
   - Implement `resolveInitialFixedDraftId`, `sortPlannedDraftsNewestFirst`, `removePlannedDateDraftSafely`, and `formatPlannedDateTableValue`.
   - Ensure internal persistence order remains `[initialFixed, ..., newestAdded]` so `numero_secuencia` and auto-assigned DB `tag` (`'Programación'` / `'Reprogramación'`) remain valid without exposing tag fields in UI.
2. **Unified Detail Table & Symbol Editor (`src/views/designacionFechaView.ts`):**
   - Render single `<table id="designacion-fecha-detail-table">` (`table-fixed`, `<colgroup>` = `100%`, `0 <button> in <tbody>`).
   - Display newest-added row first, omitting `#idx` and `Programación`/`Reprogramación` labels.
   - Render symbol-only tooltip controls (`+` in header, `✏️` on all rows, `🗑️` omitted on initial fixed row).
   - Render `#plannedDateEditorModal` with explicit `YYYY-MM` vs `YYYY-MM-DD` switcher, value input(s), optional observation, and clear planning-target note.
3. **Wire Immediate Batch-Synced Handlers (`src/main.ts`):**
   - Handle `open-add-planned-date`, `open-edit-planned-date`, `delete-planned-date`, keyboard `Enter`/`Space` on `[role="button"]`, `#fechaEditorTipoSelect` change, and `#plannedDateEditorForm` submit → `saveLinkedBatchProgrammedDates`.
4. **Update & Expand Tests (`src/lib/designacionFechaDomain.test.ts`):**
   - Verify unified table (`table-fixed`, `<colgroup>` = `100%`, `0 <button> in <tbody>`), newest-added-first row order, 1st-row delete protection, symbol tooltip buttons, explicit `YYYY-MM` / `YYYY-MM-DD` editor controls, absence of tag `<select>`, RBAC lock, and Zero-UUID.

---

## 6. Acceptance Criteria

- [ ] Detail View renders one unified programmed-dates table (`PREPROGRAMADA_MES` and `PROGRAMADA_EXACTA` together) sorted last-added first.
- [ ] Table shows only actual date value + optional observation + compact symbol-only tooltip actions (`✏️`, `🗑️`), with no `Programación`/`Reprogramación` tag UI.
- [ ] The 1st programmed date can be edited (`✏️`) and CANNOT be removed (no `🗑️`, domain guard active).
- [ ] Add (`+`) / Edit (`✏️`) explicitly prompts for `Año-Mes (YYYY-MM)` vs `Fecha Exacta (YYYY-MM-DD)` and saves across all linked audits in the batch while keeping `REAL` dates untouched.
- [ ] Table satisfies `table-fixed`, `<colgroup>` = `100%`, `0 <button> in <tbody>`, Zero-UUID, and `npx tsc --noEmit` `0` errors.

---

## 7. Verification Commands

```bash
npx tsc --noEmit
node --test --experimental-strip-types src/lib/designacionFechaDomain.test.ts src/lib/auditPlanningEngine.test.ts src/lib/phase62UiIntegrity.test.ts
```
