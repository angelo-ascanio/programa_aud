# Step 1.2 — Preventive Multi-Year Audits: Persistence Retry/Rollback & Parallel Lifecycle Support

> **Pillar:** Active Audits & Preventive Multi-Year Configuration (`1.1–2, 4, 5` without `3. Auditor` or `6. Resultado`)
> **Prerequisites:** `step_1.1.md` completed (`generateNextUniqueProgramCode`, `generateNextUniqueAuditCode`, SQL allocator RPCs).

---

## 1. Objective

Wire collision-free code allocation, PostgreSQL `23505` retry safety, and orphan rollback into `src/main.ts` persistence flows (`createStep3CampaignCycle`, `saveProgramaAuditoriaStep1`), and verify/adjust lifecycle domains so users can create preventive future audits while active audits exist and complete all advance planning sections (`Tipo`, `Fecha`, `Sitio`, `Temporal`, `Tiempo`, `Proceso`, `Turno`) years before selecting auditors or logging results.

---

## 2. Scope

### IN Scope
- `src/main.ts`:
  - Update `createStep3CampaignCycle` (`~33979–34078`) and `saveProgramaAuditoriaStep1` (`~32106–32165`) to obtain codes via:
    1. Remote RPC (`fn_next_programa_auditoria_codigo` / `fn_next_auditoria_codigo`) when remote schema is active, falling back cleanly to `generateNextUniqueProgramCode` / `generateNextUniqueAuditCode` in local/fallback mode.
    2. Bounded retry loop (up to 5 attempts) when PostgreSQL returns unique violation `23505` on `codigo_programa` or `codigo_auditoria`, incrementing sequence / appending a short collision-breaker suffix on retry.
    3. **Clean orphan rollback:** If creating any child `auditoria` row fails after inserting a new `programa_auditoria`, soft-archive the newly created `programa_auditoria` via `archive_record` so no empty dangling program remains in the database.
- `src/views/programacionView.ts`:
  - Align `suggestNextProgramCode` (`~340–355`) with `generateNextUniqueProgramCode` so suggested codes never drift from active DB sequences.
- Lifecycle & domain audit across preventive planning modules:
  - `src/lib/resumenDomain.ts`: Verify `computeAuditStatusSummary` accurately tracks preventive progress (`1.1 Tipo`, `1.2 Fecha`, `1.3 Sitio`, `1.4 Temporal`, `2. Tiempo`, `4. Proceso`, `5. Turno`) independently of `3. Auditor` and `6. Resultado`, without deadlocking or mislabeling future preventive audits when an active current-year audit exists on the same certificate.
  - `src/lib/certificateAuditSelector.ts`: Ensure `getAuditsForCertificateSorted` & `resolveAuditNavigation` seamlessly allow switching between an active current-year audit and newly created preventive future-year audits (`2027`, `2028`, `2029`) on the same certificate.
  - Confirm `designacionSitioDomain.ts`, `designacionTemporalDomain.ts`, `tiempoDomain.ts`, and `programaCertificadoDomain.ts` never block editing a future preventive audit while another audit for the same certificate is active.
- Unit & persistence tests in `src/lib/auditPersistence.test.ts` and `src/lib/resumenDomain.test.ts`.

### OUT of Scope
- `+ Auditoría` modal HTML/input changes (`step_2.1.md`).
- `Designación → Fecha` Multi View and Detail View redesign (`step_3.1.md` – `step_4.2.md`).

---

## 3. Files to Inspect & Modify

- **Inspect:** `src/main.ts` (`createStep3CampaignCycle`, `saveProgramaAuditoriaStep1`, `loadLiveAudits`), `src/views/programacionView.ts`, `src/lib/resumenDomain.ts`, `src/lib/certificateAuditSelector.ts`, `src/lib/designacionSitioDomain.ts`, `src/lib/tiempoDomain.ts`, `src/lib/programaCertificadoDomain.ts`, `src/lib/auditPersistence.test.ts`, `src/lib/resumenDomain.test.ts`
- **Modify:** `src/main.ts`, `src/views/programacionView.ts`, `src/lib/resumenDomain.ts` (if any status edge case is found), `src/lib/auditPersistence.test.ts`, `src/lib/resumenDomain.test.ts`

---

## 4. Detailed Tasks

1. **Harden `createStep3CampaignCycle` & `saveProgramaAuditoriaStep1` (`src/main.ts`):**
   - Extract a clean helper for resolving the target year (`draft.dateMode === 'PREPROGRAMADA_MES' ? draft.anio : Number(targetDate.slice(0, 4))`).
   - Query `fn_next_programa_auditoria_codigo` (or scan active codes) and insert `programa_auditoria` with a `23505` retry helper (never failing on `uq_programa_auditoria_codigo_active` when auto-generating codes).
   - For each certificate in `draft.certTypes`, maintain a `reservedAuditCodes` set across the batch, resolve `auditCode` via `fn_next_auditoria_codigo` + `generateNextUniqueAuditCode` + `23505` retry.
   - If any `auditoria` insert fails non-recoverably after `programa_auditoria` succeeded, call `supabase.rpc('archive_record', { p_table: 'programa_auditoria', p_record_id: newProgramId, p_reason: 'Rollback por fallo al crear auditoría hija' })` before returning the Zero-UUID error.
2. **Align `suggestNextProgramCode` (`src/views/programacionView.ts`):**
   - Delegate to `generateNextUniqueProgramCode` so suggested codes respect active program gaps and existing sequences cleanly.
3. **Verify Preventive Multi-Year Lifecycle Support:**
   - Confirm via unit test in `resumenDomain.test.ts` that a preventive future audit (`estado_ciclo: 'En Programación'`) with completed `1.1 Tipo`, `1.2 Fecha`, `1.3 Sitio`, `1.4 Temporal (optional)`, `2. Tiempo`, `4. Proceso`, `5. Turno` and **empty** `3. Auditor`, `6. Resultado`, `7. Revisión` renders `COMPLETO` on all 7 advance-plannable sections, `PENDIENTE` cleanly on `3. Auditor` & `6. Resultado`, and deterministic `estatus_auditoria` (`Planificación en Progreso`) without errors.
   - Confirm via `certificateAuditSelector.test.ts` / `auditPersistence.test.ts` that a certificate with an already active 2026 audit (`Programada` / `En Ejecución`) can receive new preventive 2027 and 2028 audits and navigate across all of them in `1.1–5` sections.

---

## 5. Acceptance Criteria

- [ ] Creating multiple preventive campaigns on an already-audited `Vínculo` / `Certificado` (same year or `+1/+2/+3` years) succeeds with zero `uq_programa_auditoria_codigo_active` or `uq_auditoria_codigo_active` errors.
- [ ] Simulated `23505` collision triggers automatic code regeneration/retry; unrecoverable child error cleans up the parent `programa_auditoria` via `archive_record`.
- [ ] Preventive future audits support completing `Tipo`, `Fecha`, `Sitio`, `Temporal`, `Tiempo`, `Proceso`, and `Turno` while keeping `Auditor` and `Resultado` empty/pending.
- [ ] `npx tsc --noEmit` reports `0` errors (`0 any`) and all targeted `node:test` suites pass.

---

## 6. Verification Commands

```bash
npx tsc --noEmit
node --test --experimental-strip-types src/lib/auditPersistence.test.ts src/lib/resumenDomain.test.ts src/lib/certificateAuditSelector.test.ts src/lib/auditDetailViews.test.ts
```
