# Implementation Roadmap Summary — `programa_aud` Future Changes

> **Scope:** Modular, verifiable execution roadmap covering all requirements in `public/prompting/future_changes.txt`, aligned with `public/doc/project_resume.md`, `public/doc/architecture/*`, and the architectural baselines in `public/certificado/recipe_multiview_detailview.md`.

---

## 1. Executive Summary of Functional Pillars

| Pillar | Problem / Gap Identified | Target Architecture & Behavior | Roadmap Steps |
| :--- | :--- | :--- | :--- |
| **1. Preventive Multi-Year Audits & Code Collision Fix** | `createStep3CampaignCycle()` (`src/main.ts`) builds `PROG-${year}-${auditPrograms.length + 1}` and `AUD-${year}-${shortNum}-${i+1}`, causing PostgreSQL `23505` collisions on `uq_programa_auditoria_codigo_active` and `uq_auditoria_codigo_active` when active/seeded/scoped audits already exist. Users also need confidence that preventive future cycles can complete `Tipo`, `Fecha`, `Sitio`, `Temporal`, `Tiempo`, `Proceso`, `Turno` years ahead while deferring `Auditor` and `Resultado`. | Deterministic max-sequence code generators (`auditPlanningEngine.ts`), optional DB `SECURITY DEFINER` code allocator RPCs + bounded `23505` retry & failed-batch rollback, and full lifecycle support across Sections `1.1–2, 4, 5` without requiring `3. Auditor` or `6. Resultado`. | `step_1.1.md`, `step_1.2.md` |
| **2. `+ Auditoría` Wizard Improvements** | `stepsMeta` in `auditWizardModal.ts` hardcodes `'1. '`, `'2. '`, `'3. '` next to the badge number, rendering `1 1. Conglomerado / Org` on incomplete steps. Phase 3 also asks for both `Fecha Inicio` and `Fecha Fin` when `PROGRAMADA_EXACTA` is chosen, obscuring that it only sets an initial goal date. | Single clean step numbers (`1 Conglomerado / Org` → `✓ Conglomerado / Org`) and a single `Fecha Objetivo Programada` (`YYYY-MM-DD`) mapped internally to `fecha_inicio = fecha_fin` for `Designación → Fecha`, with clear target-date microcopy. | `step_2.1.md` |
| **3. `Designación → Fecha` Multi View** | Currently shows generic `Lote (N)`, a date count (`1 fecha`), and omits certificate `estatus` in cells, cards, and facets. | Abbreviated link nature + full tooltip (`Integ. (3)`, `Comb. (2)`, `Conj. (2)`, `Simul. (2)`, `Multi. (2)`, `Mixta (2)`), **last-added planned date** (strictly by `numero_secuencia` / insertion order, never chronological calendar sorting), and prominent certificate status badge + reactive facet filter. | `step_3.1.md` |
| **4. `Designación → Fecha` Detail View ("Less Is More")** | Verbose header/subtitle, heavy spacing, non-clickable linked certificate pills (`showLinkedSiblings: false`), stacked card editors with `#idx`, `Programación`/`Reprogramación` tag selectors, and missing protection on the 1st programmed date. | Ultra-simple header (`FN-QMS-2026-009` + audit status badge, org subtitle, `+ Auditoría`), tight spacing, compact audit selector with cert link (`title="Ver certificado: ..."`) + cert status + concise audit info, conditional (`> 1` cert) clickable linked-cert strip jumping to `Fecha` of that exact linked audit, and a single unified programmed-dates table (newest-added first, `Value` + optional `Observation`, explicit `YYYY-MM` vs `YYYY-MM-DD` add/edit, symbol-only tooltip controls, 1st date non-removable, linked-batch sync, `REAL` kept read-only). | `step_4.1.md`, `step_4.2.md` |

---

## 2. Alignment with `programa_aud` Constitution & Canonical References

Every step in this roadmap enforces the project's non-negotiable engineering invariants:

1. **Strict TypeScript (`strict: true`, `0 any`):** All domain types, draft states, and view props remain strictly typed with `npx tsc --noEmit` and ESLint passing at `0` errors.
2. **Zero-UUID in UI & Errors:** No raw UUID strings may ever render in visible HTML or user-facing error banners (`assertZeroUuidExposure` verified across all Multi Views and Detail Views).
3. **Soft-Delete Governance (`archive_record` / `REVOKE DELETE`):** Physical `DELETE` is never issued from client code. Removed planned dates are archived via `supabase.rpc('archive_record', ...)` while preserving `REAL` execution rows untouched.
4. **RBAC & Level 2 `CLIENT` Isolation:** Mutators (`+ Auditoría`, `+`, `✏️`, `🗑️`, batch save) are strictly restricted to `isApprovedStaffProfile(profile)` (`ADMIN` / `WORKER` with `status === 'APPROVED'`). `AUDITOR` and `CLIENT` remain strictly read-only, and `CLIENT` stays isolated to authorized organizations even inside `NIVEL_2_INTER_ORG` campaigns.
5. **Tables (`table-fixed` + `<colgroup>` = `100%` + `0 <button> in <tbody>`):**
   - Multi Views (`renderUniversalTemplate`) maintain `table-fixed`, `<colgroup>` summing to `100%`, full-row click (`data-action="select-section-cert"`), no `acciones` column, and zero `<button>` tags inside `<tbody>`.
   - The unified Detail View planned-dates table (`step_4.2.md`) also uses `table-fixed` + `<colgroup>` = `100%` and renders symbol-only row triggers via accessible `role="button" tabindex="0"` controls with `Enter`/`Space` support so `0 <button> in <tbody>` holds across every table in the module.
6. **Intentional "Less Is More" Exception vs Canonical Detail Views (`public/certificado/recipe_multiview_detailview.md`):**
   - While `public/certificado/` establishes Multi View → Detail View shell conventions (`auditSectionShell.ts`, `detailTemplate.ts`), `public/prompting/future_changes.txt` explicitly requests ultra-simple, single-purpose Detail Views for `Auditoría` Block 1 (`Designación → Fecha`) with minimal text, compact parent/switcher bars, and no multi-tab or verbose tag clutter. `step_4.1.md` implements this via an opt-in `compactMode` on `auditSectionShell.ts` so sibling sections (`Sitio`, `Temporal`, `Tiempo`, etc.) remain unaffected until explicitly migrated.

---

## 3. High-Risk Technical Constraints & Guardrails

- **Database Constraint `check_auditoria_fecha_tag` (`01_creacion.sql:925`):** PostgreSQL enforces `tag IN ('Programación', 'Reprogramación')`. Removing the tag selector from the Detail View UI (`step_4.2.md`) must NOT break DB persistence: the domain normalization layer will silently assign `'Programación'` to the initial fixed planned date (`numero_secuencia` lowest) and `'Reprogramación'` to subsequent planned rows.
- **Database Constraint `check_auditoria_fecha_payload` (`01_creacion.sql:937`):** `PROGRAMADA_EXACTA` requires both `fecha_inicio` and `fecha_fin` NOT NULL with `fecha_fin >= fecha_inicio`. The single goal date in `+ Auditoría` (`step_2.1.md`) and single-day exact dates in `Designación → Fecha` (`step_4.2.md`) satisfy this by sending `fecha_inicio = fecha_fin = singleDate`.
- **Unique Sequence Constraint on `auditoria_fecha (id_auditoria, numero_secuencia)`:** `buildLinkedBatchDateSyncPlan` must continue ordering active mutations safely (archivals before updates/inserts, monotonic sequence increments above `max(numero_secuencia)` including `REAL` rows) so adding, reordering, or archiving dates in multi-audit batches never triggers sequence conflicts.
- **Last-Added Record vs Chronological Date (`step_3.1.md` & `step_4.2.md`):** Both Multi View and Detail View must order and resolve the latest planned date strictly by **insertion / sequence order (`numero_secuencia DESC`, tie-broken by `created_at DESC`)**, never by calendar value (`fecha_inicio`/`anio`/`mes`), so reprogramming from December back to November renders November as the current planned date.
- **RLS-Scoped Client State vs Global DB Uniqueness (`step_1.1.md` & `step_1.2.md`):** Because non-admin sessions or paginated caches may not hold all soft-active `programa_auditoria` / `auditoria` rows in browser memory, code generation must combine in-memory scan + server-side RPC/query allocation + retry on `23505`.

---

## 4. Roadmap Index & Execution Order

| Step File | Title | Target Files | Verification Gates |
| :--- | :--- | :--- | :--- |
| **`step_1.1.md`** | Preventive Multi-Year Audits: Deterministic Code Generators & SQL Allocation Hardening | `src/lib/auditPlanningEngine.ts`, `src/lib/auditPlanningEngine.test.ts`, `public/supabase/queries/01_creacion.sql` | `node --test`, `tsc --noEmit`, SQL trigger/RPC check |
| **`step_1.2.md`** | Preventive Multi-Year Audits: Persistence Retry/Rollback & Parallel Lifecycle Support | `src/main.ts`, `src/views/programacionView.ts`, `src/lib/resumenDomain.ts`, `src/lib/auditPersistence.test.ts`, `src/lib/resumenDomain.test.ts` | `node --test`, `tsc --noEmit` |
| **`step_2.1.md`** | `+ Auditoría` Wizard: Single Step Numbering & Single Goal Programmed Date | `src/views/auditWizardModal.ts`, `src/lib/auditWizardDomain.ts`, `src/lib/designacionTipoDomain.ts`, `src/main.ts`, `src/lib/auditWizardDomain.test.ts` | `node --test`, `tsc --noEmit` |
| **`step_3.1.md`** | `Designación → Fecha` Multi View: Link Abbreviations, Last-Added Footer & Cert Status | `src/lib/designacionFechaDomain.ts`, `src/views/designacionFechaView.ts`, `src/lib/designacionFechaDomain.test.ts` | `node --test`, `<colgroup>` 100%, `0 <button> in <tbody>`, Zero-UUID |
| **`step_4.1.md`** | `Designación → Fecha` Detail View Shell: Minimal Context, Compact Switcher & Linked Jump | `src/views/auditSectionShell.ts`, `src/views/designacionFechaView.ts`, `src/main.ts`, `src/lib/designacionFechaDomain.test.ts`, `src/lib/certificateAuditSelector.test.ts` | `node --test`, sibling navigation check, Zero-UUID |
| **`step_4.2.md`** | `Designación → Fecha` Detail View: Unified Dates Table, Symbol Tooltips & Fixed 1st Date | `src/lib/designacionFechaDomain.ts`, `src/views/designacionFechaView.ts`, `src/main.ts`, `src/lib/designacionFechaDomain.test.ts` | `node --test`, `tsc --noEmit`, RBAC & batch sync tests |
| **`step_final.md`** | Final E2E Integration, SQL `00–07` Verification, Live Chromium QA & `public/doc/` Sync | `public/doc/project_resume.md`, `public/doc/architecture/*.md` (+ any targeted regression fixes) | `tsc`, `eslint`, `npm test`, `vite build`, SQL `00–07`, Playwright Desktop/Mobile E2E |
