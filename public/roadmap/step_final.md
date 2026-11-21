# Step Final — End-to-End Integration, SQL Verification, Live Chromium QA & Documentation Sync

> **Scope:** Cross-cutting quality audit, SQL reset/idempotency check, full CLI build/lint/test verification, real browser E2E verification across roles & viewports, targeted regression fixes, and full synchronization of `public/doc/`.
> **Prerequisites:** `step_1.1.md`, `step_1.2.md`, `step_2.1.md`, `step_3.1.md`, `step_4.1.md`, and `step_4.2.md` completed.

---

## 1. Objective

Validate all four functional pillars from `public/prompting/future_changes.txt` end-to-end in a running application backed by PostgreSQL/Supabase, guarantee zero regressions across existing `programa_aud` domains, and update all project documentation in `public/doc/` to match the implemented codebase 100%.

---

## 2. Quality & Verification Gates

### Gate 1 — CLI Static, Type, Lint, Unit Test & Build Verification
Run in sequence with **zero** errors or warnings:
1. `npx tsc --noEmit` (`strict: true`, `0 any` / `as any` across `src/`)
2. `npm run lint` (`0` errors, `0` warnings)
3. `npm test` (`100%` passing across all `node:test` suites including `auditPlanningEngine.test.ts`, `auditPersistence.test.ts`, `auditWizardDomain.test.ts`, `designacionFechaDomain.test.ts`, `certificateAuditSelector.test.ts`, `resumenDomain.test.ts`, `phase62UiIntegrity.test.ts`, `auditMultiViews.test.ts`, `auditDetailViews.test.ts`)
4. `npm run build` (clean Vite production bundle)

### Gate 2 — Database & SQL Sequence Idempotency (`00` → `07`)
Execute / validate the full SQL script chain against Supabase / PostgreSQL:
- `00_delete_tables.sql` → `01_creacion.sql` → `02_seguridad_rls.sql` → `03_indices_optimizacion.sql` → `04_vistas_funciones.sql` → `05_auditoria_automatica.sql` → `06_datos_prueba.sql` → `07_validacion_integridad.sql`
- Verify:
  1. Re-running `01_creacion.sql`..`07_validacion_integridad.sql` succeeds with `0` errors (idempotent).
  2. `fn_next_programa_auditoria_codigo` and `fn_next_auditoria_codigo` return non-colliding sequential codes (`PROG-YYYY-NNN`, `AUD-YYYY-CERT-NN`) even alongside existing seeded programs (`PROG-2024..2028`) and archived rows.
  3. Creating multiple preventive campaigns (`programa_auditoria` + `auditoria`) for an active `vinculo`/`certificado` passes all triggers and partial unique indexes (`uq_programa_auditoria_codigo_active`, `uq_auditoria_codigo_active`).

### Gate 3 — Live Browser E2E Verification (`http://localhost:3000`, Playwright / Chromium)
Test on **Desktop (`1440×900`)** and **Mobile (`390×844`)** across roles (`ADMIN`, `WORKER`, `AUDITOR`, `CLIENT`) with **zero** console/runtime/network 5xx errors and **zero** horizontal overflow:
1. **Active Audits & Preventive Multi-Year Creation (`ADMIN`/`WORKER`):**
   - Pick a certificate that already has an active audit. Click `+ Auditoría`, complete Phases 1–3, and create a new preventive audit for next year (and a second one in the same year) → verify **no** `uq_programa_auditoria_codigo_active` or `uq_auditoria_codigo_active` error occurs.
   - Verify the preventive future audit can configure `1.1 Tipo`, `1.2 Fecha`, `1.3 Sitio`, `1.4 Temporal`, `2. Tiempo`, `4. Proceso`, and `5. Turno` cleanly while leaving `3. Auditor` and `6. Resultado` empty/pending.
2. **`+ Auditoría` Wizard (`ADMIN`/`WORKER`):**
   - Verify incomplete phases show single numbers (`1 Conglomerado / Org`, `2 Vínculo`, `3 Tipo por Certificado`) — never `1 1.`, `2 2.`, `3 3.`.
   - Verify Phase 3 in `Programada Exacta` renders a single goal date field (`Fecha Objetivo Programada`) and creates the initial date visible in `Designación → Fecha`.
3. **`Auditoría > Designación > Fecha` Multi View:**
   - Verify cards and table show abbreviated link nature (`Integ. (N)`, `Comb. (N)`, etc.) with full tooltip on hover, **not** `Lote (N)`.
   - Verify `0 fechas` / `1 fecha` counts are absent; card footer displays the **last-added** programmed date (reprogram a certificate from Dec to Nov and confirm Multi View shows Nov).
   - Verify certificate status (`Activo`, `Suspendido`, `Cancelado`, etc.) displays prominently and filters reactively via sidebar facet.
   - Verify `table-fixed` + `<colgroup>` = `100%`, `0 <button> in <tbody>`, Zero-UUID.
4. **`Auditoría > Designación > Fecha` Detail View ("Less Is More"):**
   - Verify minimal title (`FN-...` + audit status badge, org subtitle, `+ Auditoría`), tight vertical spacing, and simplified switcher bar (`📜 FN-...` with `Ver certificado: ...` tooltip + cert status + concise `AUD-... · Tipo · <fecha>` + `◀ [select] ▶`).
   - Verify linked certificates strip appears **only** when `siblingsCount > 1`, is absent when `siblingsCount === 1`, and clicking a sibling certificate inside a multi-cert audit (including an older historical audit) navigates directly to `Designación → Fecha` for that clicked certificate and that exact linked audit.
   - Verify unified programmed-dates table mixes `YYYY-MM` and `YYYY-MM-DD` newest-added first, displays only value + optional observation + symbol-only tooltip actions (`+`, `✏️`, `🗑️`), has no `Programación`/`Reprogramación` selector, keeps the 1st programmed date editable (`✏️`) and **non-removable** (no `🗑️`), syncs updates across all linked audits in the batch, and leaves `REAL` dates read-only.
5. **RBAC & Isolation Check:**
   - `AUDITOR` and `CLIENT` see `Designación → Fecha` strictly read-only (zero `+`, `✏️`, `🗑️`, or `+ Auditoría` mutators; zero unauthorized org exposure for `CLIENT` in `NIVEL_2_INTER_ORG`).

### Gate 4 — Documentation Synchronization (`public/doc/`)
Update all five architectural documentation files to reflect the final verified state of `programa_aud`:
1. `public/doc/project_resume.md`
2. `public/doc/architecture/database_architecture.md` (document `fn_next_programa_auditoria_codigo`, `fn_next_auditoria_codigo`, and `check_auditoria_fecha_tag` internal normalization)
3. `public/doc/architecture/backend_api_security.md` (document collision-safe batch creation, `23505` retry/rollback, and `archive_record` sync)
4. `public/doc/architecture/frontend_architecture.md` (document `+ Auditoría` single goal date, `Designación → Fecha` Multi View link abbreviations/last-added date/cert status, and "Less Is More" Detail View `compactMode` shell + unified dates table)
5. `public/doc/architecture/testing_and_operations.md` (updated test suite counts, verification assertions, and E2E checks)

---

## 3. Final Sign-Off Checklist

- [ ] `npx tsc --noEmit` → `0` errors (`0 any`)
- [ ] `npm run lint` → `0` errors / `0` warnings
- [ ] `npm test` → `100%` pass
- [ ] `npm run build` → clean bundle
- [ ] SQL `00`–`07` validated idempotently
- [ ] Chromium Desktop (`1440×900`) & Mobile (`390×844`) verified across `ADMIN`, `WORKER`, `AUDITOR`, `CLIENT` with Zero-UUID & zero console errors
- [ ] All 5 docs in `public/doc/` synchronized with exact implemented file paths, symbols, and counts
