# Step 2.1 — `+ Auditoría` Wizard UX & Domain Fixes (Clean Step Numbering & Single Goal Date)

> **Pillar:** `+ Auditoría` Wizard Improvements
> **Prerequisites:** `step_1.2.md` completed.

---

## 1. Objective

Fix the duplicate step-numbering bug on incomplete wizard phases (`1 1. Conglomerado / Org` → `1 Conglomerado / Org`) and replace the dual `Fecha Inicio` / `Fecha Fin` inputs in Phase 3 with a **single goal programmed date** (`YYYY-MM` or `YYYY-MM-DD`) mapped to `Designación → Fecha`, with clear explanatory copy that this date represents a planning target rather than real execution dates.

---

## 2. Scope

### IN Scope
- `src/views/auditWizardModal.ts`:
  - Update `stepsMeta` (`lines 79–83`) so labels omit redundant numeric prefixes:
    - `{ num: 1, label: 'Conglomerado / Org' }`
    - `{ num: 2, label: 'Vínculo' }`
    - `{ num: 3, label: 'Tipo por Certificado' }`
    (Keeping the left badge `${isDone ? '✓' : s.num}` so incomplete renders `1 Conglomerado / Org` and completed renders `✓ Conglomerado / Org`).
  - Update Phase 3 date fields (`lines 354–376`) when `state.dateMode === 'PROGRAMADA_EXACTA'`:
    - Replace the 2-column `Fecha Inicio` + `Fecha Fin` inputs with a single date input `#wizardFechaProgramadaInput` labeled `Fecha Objetivo Programada (YYYY-MM-DD)`.
    - Add concise helper text explaining that `+ Auditoría` defines an initial **goal programmed date** saved in `Designación → Fecha` (not the real execution dates, which are logged later after field execution).
- `src/lib/auditWizardDomain.ts`:
  - Replace/align `fecha_inicio` / `fecha_fin` in `AuditWizardState` with single `fecha_programada: string` (or keep `fecha_programada` as canonical field and populate `fecha_inicio = fecha_fin = state.fecha_programada` inside `buildStep3NewCycleDraftFromWizard`).
- `src/lib/designacionTipoDomain.ts`:
  - Ensure `Step3NewCycleDraft` and `validateStep3NewCycleDraft` cleanly accept single-date goal programming (`fecha_inicio === fecha_fin` or `fecha_programada`), keeping backward compatibility for any existing callers passing `fecha_inicio` / `fecha_fin`.
- `src/main.ts`:
  - Update wizard DOM event listener (`~25745–25761`) to bind `#wizardFechaProgramadaInput` instead of `#wizardFechaInicioInput` / `#wizardFechaFinInput`, syncing `state.auditWizard.fecha_programada` (and `fecha_inicio = fecha_fin`).
- `src/lib/auditWizardDomain.test.ts`:
  - Add render assertions for `renderAuditWizardModal` verifying:
    - No double numbering (`1 1.`, `2 2.`, `3 3.` absent; `1` + `Conglomerado / Org` present when incomplete; `✓` + `Conglomerado / Org` when completed).
    - Single `#wizardFechaProgramadaInput` present in `PROGRAMADA_EXACTA` mode (`wizardFechaInicioInput` & `wizardFechaFinInput` absent).
    - Resulting `Step3NewCycleDraft` produces `fecha_inicio === fecha_fin === fecha_programada`.

### OUT of Scope
- `Designación → Fecha` Multi View and Detail View edits (`step_3.1.md`, `step_4.1.md`, `step_4.2.md`).

---

## 3. Files to Inspect & Modify

- **Inspect:** `src/views/auditWizardModal.ts`, `src/lib/auditWizardDomain.ts`, `src/lib/designacionTipoDomain.ts`, `src/main.ts` (lines `25650–25790`), `src/lib/auditWizardDomain.test.ts`
- **Modify:** `src/views/auditWizardModal.ts`, `src/lib/auditWizardDomain.ts`, `src/lib/designacionTipoDomain.ts`, `src/main.ts`, `src/lib/auditWizardDomain.test.ts`

---

## 4. Detailed Tasks

1. **Fix Stepper Labels (`src/views/auditWizardModal.ts`):**
   - Strip `'1. '`, `'2. '`, `'3. '` from `stepsMeta` labels.
   - Verify semantic classes (`bg-slate-900` current, `bg-emerald-50` done with `✓`, `bg-slate-50` pending with `s.num`) keep single-badge alignment on both desktop and mobile (`390×844`).
2. **Single Goal Programmed Date (`auditWizardDomain.ts`, `auditWizardModal.ts`, `designacionTipoDomain.ts`, `main.ts`):**
   - Rename/add `fecha_programada` on `AuditWizardState` (initialized to `todayIso`).
   - Render single date input `#wizardFechaProgramadaInput` in `PROGRAMADA_EXACTA` mode, accompanied by subtle helper copy: *"Define la fecha objetivo inicial en Designación → Fecha (no corresponde a fechas reales de ejecución)."*
   - In `buildStep3NewCycleDraftFromWizard`, map `fecha_inicio: state.fecha_programada`, `fecha_fin: state.fecha_programada`.
   - Ensure `createStep3CampaignCycle` (`src/main.ts`) writes `fecha_inicio = fecha_fin = draft.fecha_inicio` on the created `auditoria_fecha` row (`PREPROGRAMADA_MES` vs `PROGRAMADA_EXACTA`) so PostgreSQL `check_auditoria_fecha_payload` succeeds cleanly.
3. **Update Wizard Tests (`src/lib/auditWizardDomain.test.ts`):**
   - Test both incomplete and completed step badges across Steps 1, 2, 3 via `renderAuditWizardModal`.
   - Test both `PREPROGRAMADA_MES` and `PROGRAMADA_EXACTA` single-date draft generation and Zero-UUID compliance.

---

## 5. Acceptance Criteria

- [ ] Stepper never displays duplicate numbers (`1 1.`, `2 2.`, `3 3.`) in any wizard step.
- [ ] Phase 3 in `PROGRAMADA_EXACTA` mode shows a single target date input (`#wizardFechaProgramadaInput`) and clearly communicates it creates an initial planned goal in `Designación → Fecha`.
- [ ] Submitting either `PREPROGRAMADA_MES` (`YYYY-MM`) or `PROGRAMADA_EXACTA` (`YYYY-MM-DD`) creates the campaign and seeds the initial `auditoria_fecha` record without DB check constraint errors.
- [ ] `npx tsc --noEmit` reports `0` errors and `auditWizardDomain.test.ts` passes `100%`.

---

## 6. Verification Commands

```bash
npx tsc --noEmit
node --test --experimental-strip-types src/lib/auditWizardDomain.test.ts src/lib/designacionTipoDomain.test.ts
```
