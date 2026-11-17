# Step 2.2: Domain Contracts, Batch Linker & Mutation Wiring (`procesoDomain.ts`, `noAplicableDomain.ts`, `main.ts`)

> **Goal:** Connect `coverageEngine.ts` and the new PostgreSQL RPCs/triggers into `procesoDomain.ts`, `noAplicableDomain.ts`, `multisiteSampling.ts`, and `src/main.ts` so every create, batch-assign, edit, archive, and restore action preserves coverage invariants in both Supabase and optimistic state.  
> **Depends On:** Step 1.2 (SQL RPCs & triggers) and Step 2.1 (`coverageEngine.ts`).

---

## 1. Type & Model Extensions (`src/lib/multisiteSampling.ts`)

Extend `CertificadoDetailEntity` with optional server-synced summary cache:
- Update `cobertura?: { total_obligatorios: number; cubiertos_por_proceso: number; excluidos_no_aplicables: number; pendientes: number; porcentaje_cobertura: number; cobertura_completa: boolean; }` (or derive dynamically via `evaluateCertificateCoverage` whenever client state mutates so the HUD is always 100% reactive without waiting for a roundtrip!).

---

## 2. Process Domain Upgrades (`src/lib/procesoDomain.ts`)

1. **Exclusion-Aware Requirement Filtering (`getAvailableRequisitosForProceso`):**
   - Accept optional `activeExclusions` / `certificate` context.
   - Return enriched options `{ req, alreadyLinkedToCurrentProceso, coveredByOtherProcesoNames, isExcludedByIso43, blockingExclusionCodigo, isAlreadyCoveredByAncestorInSameProceso }` so the UI picker can disable ISO 4.3-excluded subtrees with clear reasons and highlight pending mandatory clauses.
2. **Hardened Assignment Guard (`canLinkRequisitoToProceso`):**
   - In addition to duplicate check and same-`id_norma` check, invoke `isClauseBlockedByCertificateExclusions()`.
   - If blocked, return `{ allowed: false, reason: 'La cláusula X está excluida como No Aplicable bajo la cláusula Y (ISO 4.3) en este certificado.' }`.
3. **Batch Selection Helpers:**
   - `expandPendingMandatoryClauseIds({ cert, proceso, requirementsCatalog })`: returns all mandatory clause IDs currently in `PENDIENTE` state (excluding those already covered via process or ancestor, and excluding `E_eff`), deduplicating redundant children if their mandatory parent is already selected!
   - `computeProcesoBatchLinkDelta({ currentProceso, selectedReqIds, scopedReqs, cert })`: filters out blocked/duplicate IDs and returns clean `{ toInsert: RequisitoLtree[], skippedExcluded: RequisitoLtree[] }`.

---

## 3. Non-Applicable Domain Upgrades (`src/lib/noAplicableDomain.ts`)

1. **Remove Any Conflict Blocking (`validateNoAplicableDraft`):**
   - Ensure `validateNoAplicableDraft` NEVER blocks declaring a clause non-applicable solely because it (or its descendants) is linked to a process.
   - Only validate: active certificate exists, clause belongs to `cert.id_norma`, not duplicated in active `noAplicables` (same `(id_certificado, id_requisito)`), and `justificacion.trim().length >= 15`.
2. **Impact Summary Helper (`computeNoAplicableMutationPreview`):**
   - Wraps `previewNonApplicableSmartMutation()` from `coverageEngine.ts` for use by `noAplicableView.ts` before submit and by `main.ts` after submit.
3. **Redundancy/Ancestor Advisory Helper:**
   - Detect if the user picks a child clause `8.3.1` when parent `8.3` is already excluded (or vice versa) and surface a helpful advisory badge.

---

## 4. State Hydration & Event Handlers (`src/main.ts`)

### 4.1 Live Hydration (`loadLiveCertificates` & `loadDomainData`)
- In `loadDomainData()`, ensure `supabase.from('requisito').select('id, id_norma, id_requisito_padre, codigo, explicit_code, ruta_materializada, es_obligatorio, obligatorio_origen, ...')` fetches the new columns cleanly via `fetchAllPagedRows`.
- In `loadLiveCertificates()`, optionally call `resumen_cobertura_certificado` or compute `evaluateCertificateCoverage()` over hydrated `procesos`, `noAplicables`, and `requirementsCatalog`.

### 4.2 Process Batch Assignment & Unassignment Handlers (`src/main.ts`)
- Replace/augment `#assignProcesoRequisitoForm` with `#assignProcesoRequisitosBatchForm` supporting multiple checked clause IDs (`input[name="batch_requisito_id"]:checked`) plus a 1-click **"Cubrir todas las pendientes"** button (`[data-action="select-pending-mandatory-clauses"]`).
- Ensure `ensureRequisitoInDb()` resolves all selected `RequisitoLtree` IDs (preserving parent-before-child ordering) and performs a single batch `.from('requisitos_por_proceso').upsert(rows, { onConflict: 'id_proceso,id_requisito', ignoreDuplicates: true })`.
- If the database trigger throws `REQ_EXCLUDED_BY_ISO43`, catch cleanly via `translateProcesoDbError()`, show a non-destructive warning toast, and refresh coverage state.
- Support both single-row unassign (`[data-action="unassign-proceso-req-row"]`) and `#unassignProcesoRequisitoForm`, updating `allCertificadosDetailed` and `processes` synchronously.

### 4.3 Non-Applicable Smart-Mutation Submit & Restore (`src/main.ts`)
In `#noAplicableDetailForm` submit handler (`main.ts:15429+`):
1. Validate draft via `validateNoAplicableDraft()`.
2. Compute `preview = previewNonApplicableSmartMutation(...)`.
3. Persist via RPC `supabase.rpc('declarar_no_aplicable_con_mutacion', { p_id_certificado, p_id_requisito, p_justificacion, p_existing_id })` (with graceful offline/pre-migration fallback to direct `.insert()` / `.update()` + client pruning if RPC is absent).
4. Apply `applyNonApplicableSmartMutationToState(...)` so both `cert.noAplicables` and `cert.procesos[*].clausulas_cubiertas` / `state.domainData.processes` mutate instantaneously in memory!
5. Record session audit trace (`recordPhase5SessionLog`) including `smart_mutation_pruned_count` and `smart_mutation_pruned_links`.
6. Show a rich floating toast:
   - If `prunedLinks.length > 0`: `'Exclusión ISO 4.3 guardada. Mutación inteligente: se desvincularon X cláusula(s) de procesos afectados.'`
   - Otherwise: `'Exclusión declarada correctamente bajo Cláusula ISO 4.3.'`
7. **Restore Archived Exclusion (`restoreArchivedRecord` in `main.ts`):**
   When restoring a `requisitos_no_aplicables_certificado` record (`ADMIN` action), PostgreSQL's `AFTER UPDATE` Smart-Mutation trigger prunes overlapping `requisitos_por_proceso` rows; mirror this immediately in client memory using `applyNonApplicableSmartMutationToState(..., { mode: 'restore' })` and refresh `loadLiveCertificates()`.

---

## 5. Verification Criteria for Step 2.2
- `canLinkRequisitoToProceso` rejects excluded clauses and their descendants in unit tests.
- Batch assigning 20 pending clauses to a process executes a single idempotent upsert without duplicate-key errors.
- Submitting `#noAplicableDetailForm` on a parent clause that overlaps 2 processes updates `cert.noAplicables`, prunes affected clauses from both processes, and updates `evaluateCertificateCoverage()` to reflect zero conflict.
- Zero raw UUIDs appear in error/toast messages (`assertZeroUuidExposure`).
