# Step Final: End-to-End Verification, Edge Cases, Security/RLS Audit & Deployment Checklist

> **Goal:** Validate every mathematical invariant, PostgreSQL trigger, RLS policy, UI workflow, and build gate before merging the Complete ISO Standard Clause Coverage & Non-Applicable Governance feature into `programa_aud`.

---

## 1. Comprehensive Edge-Case Verification Matrix

| # | Edge Case Scenario | Expected Backend (`PostgreSQL`) Behavior | Expected Frontend (`SPA`) Behavior |
| :-: | :--- | :--- | :--- |
| **1** | **Downward Subtree Coverage:** Process A is linked ONLY to parent `4.4` (container). | `evaluar_cobertura_certificado` marks `4.4`, `4.4.1`, `4.4.1.a..h`, `4.4.2`, `4.4.2.a..b` as `CUBIERTO`. | `evaluateCertificateCoverage` counts `4.4.1`, `4.4.1.a..h`, `4.4.2`, `4.4.2.a..b` in `cubiertosPorProceso`; container `4.4` is not double-counted in `totalObligatorios`. |
| **2** | **Partial Child Coverage:** Process A covers `4.4.1` only (`4.4.2` uncovered). | `4.4.1` & `4.4.1.a..h` = `CUBIERTO`; `4.4.2*` = `PENDIENTE`; container `4.4` = `PARCIAL`. | HUD shows incomplete coverage; pending list surfaces `4.4.2`, `4.4.2.a`, `4.4.2.b` (not `4.4.1.*`). |
| **3** | **Informative & `debería`/`should`/`NOTA` Clauses:** Chapters `1..3` + `NOTA` clauses. | `es_obligatorio = FALSE`; `evaluar_cobertura_certificado` labels `INFORMATIVA`; excluded from denominator. | Never counted in `totalObligatorios` or `pendientes`; visible under `Informativas` filter only. |
| **4** | **Smart Mutation (Direct Overlap):** Process A covers `8.3` & `8.3.1`; user declares `8.3` Non-Applicable. | `fn_smart_prune_process_clauses_on_exclusion` deletes `8.3` & `8.3.1` from `requisitos_por_proceso`; `audit_log` records pruned links. | Pre-save banner lists `Process A: 8.3, 8.3.1`; saving mutates state immediately and displays toast with pruned count. |
| **5** | **Smart Mutation (Parent Exclusion over Child Process Coverage):** Process A covers `8.5.1` and Process B covers `8.5.2`; user excludes parent `8.5`. | Trigger deletes `8.5.1` (Process A) and `8.5.2` (Process B) via `ruta_materializada <@ ruta(8.5)`. | Both processes updated optimistically; `8.5.*` mandatory nodes flip to `NO_APLICABLE` with `0` overlap. |
| **6** | **Child Exclusion Inside Parent-Covered Process:** Process A covers `8`; user excludes `8.3`. | `8.3*` marked `NO_APLICABLE` (priority over ancestor `8`); `8.1`, `8.2`, `8.4`, `8.5` remain `CUBIERTO`. | `evaluateCertificateCoverage` computes $C_{\text{eff}} \setminus E_{\text{eff}}$; container `8` shows `MIXTO`; `0` overlap. |
| **7** | **Attempt to Assign Excluded Clause to Process:** Clause `8.3` is Non-Applicable; user tries to link `8.3.1` to Process B. | `BEFORE INSERT/UPDATE` trigger raises `REQ_EXCLUDED_BY_ISO43` (`P0001`). | Picker disables `8.3` & `8.3.1` with badge `⛔ Excluida ISO 4.3 (por 8.3)`; `canLinkRequisitoToProceso` returns `allowed: false`. |
| **8** | **Restoring Archived Exclusion:** `ADMIN` restores a soft-deleted `requisitos_no_aplicables_certificado` row (`deleted_at` $\rightarrow$ `NULL`) while a process meanwhile covered that clause. | `AFTER UPDATE OF deleted_at` trigger fires and prunes conflicting `requisitos_por_proceso` rows atomically. | `restoreArchivedRecord` applies `applyNonApplicableSmartMutationToState(..., { mode: 'restore' })` and refreshes live cert state. |
| **9** | **Soft-Deleting a Process:** `ADMIN`/`WORKER` archives Process A (the sole owner of `7.1`). | `evaluar_cobertura_certificado` ignores `p.deleted_at IS NOT NULL`, flipping `7.1` back to `PENDIENTE`. | HUD immediately decrements `cubiertosPorProceso` and re-opens `7.1` in `Pendientes`. |
| **10** | **Editing Certificate's `id_norma`:** Certificate changes from `ISO 9001` to `ISO 14001`. | Cross-norm check prevents stale links across standards; coverage evaluates against new `id_norma`. | Existing `certificado` archive/norm-change guards warn/prevent orphaned cross-norm links. |
| **11** | **Skeleton Standards (No HTML Translations):** `ISO/IEC 27001:2022`, `NTF 4073:2022`, `ISO/IEC 17065:2012`, `ISO 50001:2018`. | Leaf clauses outside Chapters `1..3` seeded as `es_obligatorio = TRUE` (`AUTO_STRUCTURAL`). | `totalObligatorios > 0` for all 8 standards (never falsely `100%` covered at `0/0`). |
| **12** | **Manual Override Preservation:** Staff toggles `es_obligatorio = false` on a specific clause (`obligatorio_origen = 'MANUAL'`), then re-runs seed/reset. | `ON CONFLICT DO UPDATE` skips rows where `obligatorio_origen = 'MANUAL'`. | `requisitoView.ts` reflects persisted `MANUAL` badge. |
| **13** | **Multi-Process Shared Coverage:** Process A and Process B both link `7.5`. | `evaluar_cobertura_certificado` uses `DISTINCT` clause IDs so `7.5` counts **once** toward `cubiertos_por_proceso`. | `evaluateCertificateCoverage` never inflates `cubiertosPorProceso > totalObligatorios`; `directProcessNames` lists both. |
| **14** | **Cross-Role RBAC Isolation:** `CLIENT` or `AUDITOR` views `certificadoView.ts`, `procesoView.ts`, `noAplicableView.ts`. | RLS policies (`04_rls.sql`) restrict writes to `auth_is_approved_staff()` and scope reads to tenant/assignments. | Coverage HUD is read-only (`Pendientes` / `Cubiertas` / `No Aplicables` inspectable); all batch/assign/exclude buttons hidden. |

---

## 2. Database, Security & RLS Audit Checklist

- [ ] **No `SECURITY DEFINER` Escalation Leaks:** `evaluar_cobertura_certificado` and `resumen_cobertura_certificado` remain `SECURITY INVOKER` (respecting `certificado`, `proceso`, and `client_organization_access` RLS rules).
- [ ] **`declarar_no_aplicable_con_mutacion` Authorization:** Enforces `IF NOT public.auth_is_approved_staff() THEN RAISE EXCEPTION ...` at function entry (`ERRCODE = '42501'`) and sets `SET search_path = public, pg_temp`.
- [ ] **`requisitos_por_proceso` Triggers Verified:** `fn_guard_req_proceso_against_exclusion` validates same-`id_norma`, active `proceso`, active `requisito`, and absence of any active LTREE ancestor/self in `requisitos_no_aplicables_certificado`.
- [ ] **`audit_log` Forensics:** Every Smart Mutation logs `{ accion: 'SMART_MUTATION_PRUNE_PROCESS_REQS', id_certificado, id_exclusion, codigo_excluido, pruned_links }` without leaking raw PII or bypassing immutability triggers.
- [ ] **Clean Full Reset (`POST /api/reset-db`):** `01_creacion.sql` $\rightarrow$ `02_cobertura_normativa.sql` $\rightarrow$ `03_indices_optimizacion.sql` $\rightarrow$ `04_rls.sql` $\rightarrow$ `05_usuarios_prueba.sql` $\rightarrow$ `06_datos_prueba.sql` $\rightarrow$ `07_normas_requisitos_csv.sql` runs idempotently twice in a row with zero SQL errors.

---

## 3. Automated Testing & Build Verification Gates

### 3.1 Unit & Migration Test Suite (`node:test`)
Add and verify test coverage in:
1. `src/lib/requisitoCsvImporter.test.ts`: Test `classifyNormalizedClausesObligation()` across all 8 standards (`debe`, `shall`, `debería`, `should`, inherited `4.4.1.a..h`, chapters `1..3`, skeleton fallback).
2. `src/lib/coverageEngine.test.ts` *(new)*: Test all 14 edge cases above (`evaluateCertificateCoverage`, `previewNonApplicableSmartMutation`, `applyNonApplicableSmartMutationToState`, `isClauseBlockedByCertificateExclusions`, downward `<@` vs container rollup).
3. `src/lib/procesoDomain.test.ts` & `src/lib/noAplicableDomain.test.ts`: Test batch delta calculation, exclusion blocking in `canLinkRequisitoToProceso`, and non-blocking `validateNoAplicableDraft`.
4. `src/lib/phase11SqlMigration.test.ts` / `src/lib/phase12RlsHardening.test.ts`: Assert presence of `es_obligatorio`, `idx_requisito_norma_obligatorio_active`, `resumen_cobertura_certificado`, `fn_guard_req_proceso_against_exclusion`, `fn_smart_prune_process_clauses_on_exclusion`, and `GRANT EXECUTE` in SQL files.
5. `src/lib/zeroUuid.test.ts`: Run `assertZeroUuidExposure` against rendered HTML from `certificadoView.ts`, `procesoView.ts`, `noAplicableView.ts`, and `requisitoView.ts`.

### 3.2 Static Analysis & Production Bundle Gates
Run all commands with zero errors and zero `any`:
- [ ] `npx tsc --noEmit` (strict TypeScript clean)
- [ ] `npm run lint` (`eslint` clean)
- [ ] `node --test src/lib/*.test.ts` (100% tests green)
- [ ] `npm run build` (Vite production bundle clean)

---

## 4. Live Browser E2E Verification (`playwright-cli` on `http://localhost:3000`)

Execute end-to-end interactive verification after resetting live DB:
1. **Login as Approved `ADMIN` / `WORKER`** and open a `Certificado` (`ISO 9001:2015`).
2. **Baseline Coverage Audit:** Verify `certificados-main` directory still has strictly 6 clean columns; inside Certificate Detail View, verify Coverage HUD shows exact mandatory count (`totalObligatorios`, excluding Chapters `1..3` and pure containers) and `Pendientes` filter lists uncovered mandatory clauses.
3. **Full-Norm Batch Assignment (`procesoView.ts`):** Open a `Proceso`, click `+ Vincular Cláusulas`, select remaining pending mandatory clauses via bulk picker, save, and confirm Certificate Coverage HUD hits **`100% Completa`** (`pendientes === 0`).
4. **Conflict-Free Smart Mutation (`noAplicableView.ts`):** Navigate to `No Aplicables` $\rightarrow$ `+ Declarar Exclusión`, select clause `8.3` (or `4.4`), verify the live **Smart Mutation Impact Notice** lists the affected process(es) and sub-clauses without blocking the form, enter a $\ge 15$-char ISO 4.3 justification, save, and verify:
   - Toast reports exact pruned process links;
   - Re-opening the affected `Proceso` confirms `8.3*` / `4.4*` were automatically removed;
   - Certificate Coverage HUD remains at **`100%`** with zero conflict;
   - `Historial de Cambios` (`audit_log`) records the mutation cleanly with Zero-UUID actor names.
5. **Exclusion Guard Check:** Return to `Proceso` $\rightarrow$ `+ Vincular Cláusulas`, verify `8.3` and all its descendants are visibly disabled with `⛔ Excluida ISO 4.3`.
6. **Console & Network Cleanliness:** Confirm zero uncaught page errors, zero HTTP 5xx/4xx on RPCs, and clean mobile/desktop responsive layout.
