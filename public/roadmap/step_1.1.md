# Step 1.1 — Preventive Multi-Year Audits: Deterministic Code Generators & SQL Hardening

> **Pillar:** Active Audits & `uq_programa_auditoria_codigo_active` Collision Elimination
> **Prerequisites:** Baseline codebase (`01_creacion.sql` – `07_*.sql`, `src/lib/auditPlanningEngine.ts`).

---

## 1. Objective

Eliminate unique-constraint collisions (`duplicate key value violates unique constraint "uq_programa_auditoria_codigo_active"` and potential `uq_auditoria_codigo_active` collisions) when creating new preventive multi-year audit campaigns (`programa_auditoria` + `auditoria`) while active audits already exist for the same certificate or in the same year.

---

## 2. Root-Cause Findings to Address

1. `public/supabase/queries/03_indices_optimizacion.sql:53–54` defines partial active unique indexes:
   - `uq_programa_auditoria_codigo_active` on `public.programa_auditoria (codigo_programa) WHERE codigo_programa IS NOT NULL AND deleted_at IS NULL`
   - `uq_auditoria_codigo_active` on `public.auditoria (codigo_auditoria) WHERE codigo_auditoria IS NOT NULL AND deleted_at IS NULL`
2. `src/main.ts:33980–33984` (`createStep3CampaignCycle`) generates `codigo_programa` using `state.domainData.auditPrograms.length + 1`. Seeded data already uses `PROG-2026-001..003`, `PROG-2027-001`, `PROG-2028-001`, etc.; whenever active program count is smaller than the highest sequence or programs are archived/scoped, `.length + 1` produces a duplicate key.
3. `src/main.ts:34028` and `src/main.ts:32112` generate `codigo_auditoria` using `AUD-${year}-${shortCert}-${String(index + 1).padStart(2, '0')}`. Creating a second audit for the same certificate in the same year immediately collides on `uq_auditoria_codigo_active`.

---

## 3. Scope

### IN Scope
- Pure deterministic code-generation helpers in `src/lib/auditPlanningEngine.ts`:
  - `generateNextUniqueProgramCode(programs, targetYear)` — scans all active/known `codigo_programa` values matching `^PROG-${targetYear}-(\d+)$`, picks `max + 1` (not `.length + 1`), and returns `PROG-${targetYear}-${String(nextSeq).padStart(3, '0')}`, verifying no collision against the normalized set.
  - `generateNextUniqueAuditCode(audits, targetYear, numeroCertificado, batchOffset)` — scans existing `AUD-${targetYear}-${shortCert}-(\d+)$` codes across `audits`, picks `max + 1 + batchOffset`, and caps cleanly at 40 characters (`VARCHAR(40)`).
- Idempotent SQL RPC helpers in `public/supabase/queries/01_creacion.sql` (usable by authenticated staff):
  - `public.fn_next_programa_auditoria_codigo(p_year INTEGER)` (`SECURITY DEFINER`, `SET search_path = public, pg_temp`): inspects **all** active (`deleted_at IS NULL`) rows in `public.programa_auditoria` regardless of client memory cache, returning the next safe `PROG-YYYY-NNN` code.
  - `public.fn_next_auditoria_codigo(p_year INTEGER, p_cert_short TEXT)` (`SECURITY DEFINER`, `SET search_path = public, pg_temp`): inspects all active (`deleted_at IS NULL`) rows in `public.auditoria` matching the prefix and returns the next safe `AUD-YYYY-CERT-NN` code.
  - Execute permissions restricted appropriately (`GRANT EXECUTE` to authenticated staff; guard `is_approved_staff()` inside RPC).
- Audit all triggers in `01_creacion.sql` (`fn_validar_programa_auditoria_vinculo`, `fn_validar_auditoria_en_programa`, `fn_auto_asignar_sitio_principal_auditoria`, `fn_validar_auditoria_fecha_secuencia`) to confirm **zero** trigger logic forbids creating a new `programa_auditoria` / `auditoria` for a `vinculo` or `certificado` that already has an active audit in another `programa_auditoria`.
- Unit tests in `src/lib/auditPlanningEngine.test.ts` and SQL static test assertions in `src/lib/step101SqlSchema.test.ts` (or `phase11SqlMigration.test.ts`).

### OUT of Scope
- Modifying `src/main.ts` persistence handlers or `resumenDomain.ts` (covered in `step_1.2.md`).
- UI changes to `+ Auditoría` or `Designación → Fecha` (covered in `step_2.1.md` – `step_4.2.md`).

---

## 4. Files to Inspect & Modify

- **Inspect:** `public/supabase/queries/01_creacion.sql`, `public/supabase/queries/03_indices_optimizacion.sql`, `src/lib/auditPlanningEngine.ts`, `src/lib/auditPlanningEngine.test.ts`
- **Modify:** `src/lib/auditPlanningEngine.ts`, `public/supabase/queries/01_creacion.sql`, `src/lib/auditPlanningEngine.test.ts`

---

## 5. Detailed Tasks

1. **Add Pure Code Generators (`src/lib/auditPlanningEngine.ts`):**
   - Implement `sanitizeAuditCodeSegment(certNumber)` (alphanumeric/hyphen uppercase suffix up to 8 chars).
   - Implement `generateNextUniqueProgramCode(programs, targetYear)`:
     - Filter `p.deleted_at`? Include **only active (`!p.deleted_at`)** codes matching `uq_programa_auditoria_codigo_active`, parse numeric suffixes for `PROG-${targetYear}-(\d+)`, build a `Set<string>` of normalized existing codes, and increment `seq` until `candidate` is not in the set.
   - Implement `generateNextUniqueAuditCode(audits, targetYear, numeroCertificado, reservedCodes?)`:
     - Extract max sequence for `AUD-${targetYear}-${shortCert}-(\d+)` across active audits, step past any code already in `existingCodes` or `reservedCodes` (for multi-audit batches), and truncate safely to `<= 40` chars before appending suffix.
2. **Add Server-Side Allocator RPCs (`public/supabase/queries/01_creacion.sql`):**
   - Add `CREATE OR REPLACE FUNCTION public.fn_next_programa_auditoria_codigo(p_year INTEGER) RETURNS TEXT ...` guarded by `public.is_approved_staff()`.
   - Add `CREATE OR REPLACE FUNCTION public.fn_next_auditoria_codigo(p_year INTEGER, p_cert_short TEXT) RETURNS TEXT ...` guarded by `public.is_approved_staff()`.
   - Grant execute to `authenticated` (while rejecting non-staff with `P0001` inside function body).
3. **Trigger Verification:**
   - Confirm in `01_creacion.sql` that `uq_auditoria_programa_cert_active` is scoped per `(id_programa_auditoria, id_certificado)` and does NOT block preventive future `programa_auditoria` rows for the same certificate/vínculo.
4. **Add Unit Tests (`src/lib/auditPlanningEngine.test.ts`):**
   - Test gap/seed scenarios: e.g., programs list has `['PROG-2027-001', 'PROG-2027-004']` with `length === 2` → generator MUST return `'PROG-2027-005'`, NOT `'PROG-2027-003'` or `'PROG-2027-001'`.
   - Test empty list + soft-deleted `PROG-2027-001` (archived rows can be reused per partial index `WHERE deleted_at IS NULL`) vs active collisions.
   - Test multiple audits for the same certificate in the same year (`AUD-2026-QMS001-01` → `-02` → `-03`), including batch `reservedCodes` uniqueness and `<= 40` char length limit.

---

## 6. Acceptance Criteria

- [ ] `generateNextUniqueProgramCode` never returns a code present in active `programs` even when `programs.length` is smaller than the highest numeric suffix or contains gaps.
- [ ] `generateNextUniqueAuditCode` guarantees unique `<= 40`-char codes across same-year preventive audits and multi-certificate batches.
- [ ] `01_creacion.sql` includes idempotent `fn_next_programa_auditoria_codigo` and `fn_next_auditoria_codigo` RPCs without breaking `00–07` idempotency.
- [ ] Zero `any` types (`tsc --noEmit` clean) and all `auditPlanningEngine.test.ts` assertions pass.

---

## 7. Verification Commands

```bash
npx tsc --noEmit
node --test --experimental-strip-types src/lib/auditPlanningEngine.test.ts src/lib/step101SqlSchema.test.ts
```
