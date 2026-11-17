# Step 1.2: PostgreSQL `LTREE` Downward Coverage Engine, Exclusion Guards & Smart-Mutation Triggers

> **Goal:** Upgrade PostgreSQL server-side coverage evaluation (`02_cobertura_normativa.sql`) to implement downward `LTREE` inheritance, mandatory-clause filtering, exclusion conflict guards on `requisitos_por_proceso`, and atomic Smart-Mutation triggers/RPCs on `requisitos_no_aplicables_certificado`.  
> **Depends On:** Step 1.1 (`public.requisito.es_obligatorio` column and `idx_requisito_norma_obligatorio_active` index).

---

## 1. Rewrite Coverage Evaluation Engine (`public/supabase/queries/02_cobertura_normativa.sql`)

### 1.1 Fix Downward `LTREE` Inheritance in `evaluar_cobertura_certificado(p_id_certificado UUID)`
Replace the current upward-only `@>` checks with exact downward `<@` expansion + upward container status rollup:

1. **Mandatory & Non-Deleted Filter:** Join `public.requisito r_all` filtered by `r_all.id_norma = v_id_norma AND r_all.deleted_at IS NULL`.
2. **Direct Exclusions (`exclusions_dir`):**
   ```sql
   SELECT r.id, r.codigo, r.ruta_materializada, rna.justificacion
   FROM public.requisitos_no_aplicables_certificado rna
   JOIN public.requisito r ON r.id = rna.id_requisito
   WHERE rna.id_certificado = p_id_certificado
     AND rna.deleted_at IS NULL
     AND r.deleted_at IS NULL
     AND r.id_norma = v_id_norma
   ```
3. **Effective Excluded Set (`E_eff`):** Any clause $r_{\text{all}}$ where `EXISTS (SELECT 1 FROM exclusions_dir ed WHERE r_all.ruta_materializada <@ ed.ruta_materializada)`.
4. **Effective Process Coverage (`C_eff`):** Join active processes (`p.id_certificado = p_id_certificado AND p.deleted_at IS NULL`) and `requisitos_por_proceso rpp`. A clause $r_{\text{all}}$ is effectively covered if NOT in `E_eff` AND:
   ```sql
   EXISTS (
     SELECT 1
     FROM process_direct pd
     WHERE r_all.ruta_materializada <@ pd.ruta_materializada
   )
   ```
   *(Downward coverage: covering `4.4` marks `4.4`, `4.4.1`, `4.4.1.a..h`, `4.4.2`, `4.4.2.a..b` as `CUBIERTO`!)*
5. **Container Rollup & Informative Handling (`estado_cobertura`):**
   - Priority 1: In `E_eff` $\rightarrow$ `'NO_APLICABLE'` (or `'EXCLUIDO_HEREDADO'` if covered via strict ancestor exclusion, mapped cleanly to `'NO_APLICABLE'` in summary while exposing `heredado_de_codigo`).
   - Priority 2: Covered directly or via ancestor (`<@`) $\rightarrow$ `'CUBIERTO'`.
   - Priority 3 (Non-mandatory node `r_all.es_obligatorio = FALSE`):
     - Check mandatory descendants (`d.ruta_materializada <@ r_all.ruta_materializada AND d.es_obligatorio = TRUE`):
       - If 0 mandatory descendants (e.g., Chapter `1`, `2`, `3`) $\rightarrow$ `'INFORMATIVA'`.
       - If all mandatory descendants are covered/excluded $\rightarrow$ `'CUBIERTO'` (or `'MIXTO'` if both process & exclusion exist in subtree).
       - If some mandatory descendants are covered/excluded and some pending $\rightarrow$ `'PARCIAL'`.
       - Otherwise $\rightarrow$ `'PENDIENTE'`.
   - Priority 4 (Mandatory node `r_all.es_obligatorio = TRUE`, uncovered & unexcluded) $\rightarrow$ `'PENDIENTE'`.

### 1.2 New Summary RPC: `public.resumen_cobertura_certificado(p_id_certificado UUID)`
Create a compact, single-row summary RPC for fast UI hydration and validation:

Returns:
- `id_certificado UUID`
- `total_obligatorios INTEGER` ($|M(N)|$)
- `cubiertos_por_proceso INTEGER` ($|C_{\text{eff}}(K) \cap M(N)|$)
- `excluidos_no_aplicables INTEGER` ($|E_{\text{eff}}(K) \cap M(N)|$)
- `pendientes INTEGER` ($|\text{Pending}(K)|$)
- `porcentaje_cobertura NUMERIC(5,2)` ($\text{Coverage\%}(K)$)
- `cobertura_completa BOOLEAN` (`pendientes = 0`)

Update `04_rls.sql` to `GRANT EXECUTE ON FUNCTION public.resumen_cobertura_certificado(UUID) TO authenticated;` (preserving `SECURITY INVOKER` so tenant/client RLS isolation remains enforced!).

---

## 2. Exclusion Guard Trigger on `requisitos_por_proceso` (`01_creacion.sql`)

Create trigger function `public.fn_guard_req_proceso_against_exclusion()` bound `BEFORE INSERT OR UPDATE ON public.requisitos_por_proceso FOR EACH ROW`:

1. Resolve `v_cert_id` and `v_cert_norma` from `public.proceso p JOIN public.certificado c ON c.id = p.id_certificado WHERE p.id = NEW.id_proceso AND p.deleted_at IS NULL AND c.deleted_at IS NULL`. Reject if process or certificate is missing/archived.
2. Resolve `v_req_norma` and `v_req_path` from `public.requisito WHERE id = NEW.id_requisito AND deleted_at IS NULL`.
3. **Cross-Norm Integrity:** If `v_req_norma <> v_cert_norma`, `RAISE EXCEPTION` (`ERRCODE = 'P0001'`): clause does not belong to the certificate's standard.
4. **Exclusion Conflict Check (`E_eff`):** Check if any active `requisitos_no_aplicables_certificado rna` on `v_cert_id` covers `NEW.id_requisito` via `v_req_path <@ r_excl.ruta_materializada`:
   ```sql
   SELECT r_excl.codigo INTO v_blocking_code
   FROM public.requisitos_no_aplicables_certificado rna
   JOIN public.requisito r_excl ON r_excl.id = rna.id_requisito
   WHERE rna.id_certificado = v_cert_id
     AND rna.deleted_at IS NULL
     AND r_excl.deleted_at IS NULL
     AND v_req_path <@ r_excl.ruta_materializada
   LIMIT 1;

   IF v_blocking_code IS NOT NULL THEN
     RAISE EXCEPTION 'REQ_EXCLUDED_BY_ISO43: La cláusula está excluida como No Aplicable bajo la cláusula % en este certificado.', v_blocking_code
       USING ERRCODE = 'P0001';
   END IF;
   ```

---

## 3. Smart-Mutation Trigger & Atomic RPC on `requisitos_no_aplicables_certificado`

### 3.1 Trigger `fn_smart_prune_process_clauses_on_exclusion()`
Bound `AFTER INSERT OR UPDATE OF id_certificado, id_requisito, deleted_at ON public.requisitos_no_aplicables_certificado FOR EACH ROW`:
- Fires ONLY when `NEW.deleted_at IS NULL` (i.e., new exclusion created, `id_requisito` / `id_certificado` changed, or archived exclusion restored via `restore_record`).
- Resolves `v_excl_path` and `v_excl_norma` from `public.requisito WHERE id = NEW.id_requisito`.
- Verifies `v_excl_norma = cert.id_norma` (guarding cross-norm corruption).
- Executes atomic subtree pruning across all active processes of `NEW.id_certificado`:
  ```sql
  DELETE FROM public.requisitos_por_proceso rpp
  USING public.proceso p, public.requisito r_link
  WHERE rpp.id_proceso = p.id
    AND rpp.id_requisito = r_link.id
    AND p.id_certificado = NEW.id_certificado
    AND p.deleted_at IS NULL
    AND r_link.id_norma = v_excl_norma
    AND r_link.ruta_materializada <@ v_excl_path;
  ```
- **Edge Case — Excluding a Child when Ancestor Process Exists:**
  Because our mathematical invariant $C_{\text{eff}}(K) = \left(\bigcup \text{Subtree}(c)\right) \setminus E_{\text{eff}}(K)$ evaluates exclusions with higher precedence than ancestor process coverage, if a process explicitly covers `4` (root) and the user excludes `4.3` (or `8.3` under `8`), `r_link.ruta_materializada <@ v_excl_path` prunes `8.3` and `8.3.x` rows while `8` stays covered for all *non-excluded* descendants (`8.1`, `8.2`, `8.4`, ...). Document and preserve this subtle invariant explicitly!

### 3.2 Transactional RPC `public.declarar_no_aplicable_con_mutacion(...)`
For clean frontend UX reporting, provide an `auth_is_approved_staff()`-gated RPC:

```sql
CREATE OR REPLACE FUNCTION public.declarar_no_aplicable_con_mutacion(
  p_id_certificado UUID,
  p_id_requisito UUID,
  p_justificacion TEXT,
  p_existing_id UUID DEFAULT NULL
) RETURNS JSONB
```
Behavior:
1. Enforce `public.auth_is_approved_staff()`.
2. Snapshot any overlapping `(id_proceso, nombre_proceso, id_requisito, codigo_requisito)` rows in `requisitos_por_proceso` where `r_link.ruta_materializada <@ v_excl_path` **before** applying the mutation.
3. Insert or update `public.requisitos_no_aplicables_certificado` (trigger fires and prunes `requisitos_por_proceso`).
4. Write a consolidated forensic entry into `public.audit_log` detailing `smart_mutation_pruned_links` if `pruned_count > 0`.
5. Return `{ id, pruned_count, pruned_links: [{ id_proceso, nombre_proceso, codigo }] }` so the SPA immediately shows a precise non-blocking confirmation toast!

---

## 4. Seed Data & `06_datos_prueba.sql` Audit

Verify existing seed data in `public/supabase/queries/06_datos_prueba.sql` (lines 208–223):
- Process `60000000-...-0001` (`Troquelado y Fundición`) covers `4.1` and `8.5`.
- Exclusion `ea000000-...-0001` excludes `5.1` *(note: check `id` `f0000000-...-0051` in `06_datos_prueba.sql` — currently `5.1` with a design/8.3 text justification; keep UUID compatibility while ensuring zero conflict with `4.1` and `8.5`)*.

---

## 5. Verification Criteria for Step 1.2
- Direct `INSERT INTO requisitos_por_proceso` for an excluded clause or its descendant throws `REQ_EXCLUDED_BY_ISO43`.
- Direct `INSERT` or RPC `declarar_no_aplicable_con_mutacion` on a parent clause (`8`) while a process covers `8.5` automatically prunes `8.5` from `requisitos_por_proceso` and returns `pruned_count = 1`.
- Restoring an archived `requisitos_no_aplicables_certificado` row via `restore_record` re-triggers Smart Mutation automatically.
- `resumen_cobertura_certificado` returns accurate counts matching the set-theoretic formula across all 8 standards.
