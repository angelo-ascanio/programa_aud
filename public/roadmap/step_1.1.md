# Step 1.1: Database Schema (`es_obligatorio`) & Deterministic Normative Obligation Classifier

> **Goal:** Add first-class persistence and deterministic classification for mandatory vs. informative/container clauses across `public.requisito`, the dual-CSV build pipeline (`scripts/buildNormasSeed.ts`), the offline catalog bundle (`src/lib/generated/normasCatalogBundle.ts`), and paged hydration (`src/lib/paginatedHydration.ts`).  
> **Scope Boundary:** Schema columns + static classification metadata only. Coverage RPCs and Smart-Mutation triggers are handled separately in **Step 1.2**.

---

## 1. PostgreSQL Schema & Index Updates

### 1.1 `public/supabase/queries/01_creacion.sql`
Extend `public.requisito` idempotently (matching the pattern used for `explicit_code` and `external_key`):

```sql
ALTER TABLE public.requisito
  ADD COLUMN IF NOT EXISTS es_obligatorio BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS obligatorio_origen VARCHAR(20) NOT NULL DEFAULT 'AUTO_TEXT';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_requisito_obligatorio_origen'
      AND conrelid = 'public.requisito'::regclass
  ) THEN
    ALTER TABLE public.requisito
      ADD CONSTRAINT chk_requisito_obligatorio_origen
      CHECK (obligatorio_origen IN ('AUTO_TEXT', 'AUTO_INHERITED', 'AUTO_CHAPTER', 'AUTO_STRUCTURAL', 'MANUAL'));
  END IF;
END $$;
```

- **Why `obligatorio_origen` matters:** When `scripts/buildNormasSeed.ts` or `07_normas_requisitos_csv.sql` re-runs idempotently (`ON CONFLICT DO UPDATE`), rows edited manually by staff (`obligatorio_origen = 'MANUAL'`) MUST NOT be overwritten by automatic CSV heuristics (`WHERE public.requisito.obligatorio_origen <> 'MANUAL'`).
- **Audit trigger compatibility:** `audit_requisito_trigger` (`audit_trigger_func()`) already records `INSERT`/`UPDATE` diffs across all columns of `public.requisito`, so changes to `es_obligatorio` and `obligatorio_origen` are audited automatically.

### 1.2 `public/supabase/queries/03_indices_optimizacion.sql`
Add a partial covering index to accelerate mandatory-clause lookups per standard during coverage evaluation:

```sql
CREATE INDEX IF NOT EXISTS idx_requisito_norma_obligatorio_active
  ON public.requisito (id_norma, es_obligatorio)
  INCLUDE (ruta_materializada, codigo)
  WHERE deleted_at IS NULL;
```

---

## 2. Deterministic Obligation Classifier in CSV Pipeline

### 2.1 `src/lib/requisitoCsvImporter.ts`
Extend `NormalizedClauseRecord` and `RequisitoLtree` (`src/lib/extraDomain.ts`) with:
- `es_obligatorio: boolean`
- `obligatorio_origen: 'AUTO_TEXT' | 'AUTO_INHERITED' | 'AUTO_CHAPTER' | 'AUTO_STRUCTURAL' | 'MANUAL'`

Implement a pure helper `classifyNormalizedClausesObligation(clauses, translations)`:
1. Group translations by `id_requisito` and detect per-standard whether `hasAnyTranslationHtml = translationsForNorma.some(t => stripHtml(t.content_html).length > 0)`.
2. For each clause in topological order (guaranteed parents precede children via `topologicallySortClauseRows`):
   - Extract root chapter token `const rootChapter = clause.codigo.split('.')[0]?.trim() || ''`.
   - **Rule A (Chapters `0`, `1`, `2`, `3`):** If `['0', '1', '2', '3'].includes(rootChapter)`, assign `es_obligatorio = false`, `obligatorio_origen = 'AUTO_CHAPTER'`.
   - **Rule B (Text-Hydrated Standard, e.g., `ISO 9001`, `14001`, `45001`, `22000`):**
     - Call `countNormativeObligationTerms(t.content_html)` from `src/lib/clauseRenderer.ts` on all translations (`es`, `en`) of the clause. Remember `countNormativeObligationTerms` already strips `{clause_...}` tokens and HTML tags, so parent containers do not inherit child `debe` counts!
     - If `debe > 0 || shall > 0` $\rightarrow$ `es_obligatorio = true`, `obligatorio_origen = 'AUTO_TEXT'`.
     - Else if an ancestor has `obligatorio_origen === 'AUTO_TEXT'` (covers itemized sub-bullets such as `4.4.1.a..h` under `4.4.1`) $\rightarrow$ `es_obligatorio = true`, `obligatorio_origen = 'AUTO_INHERITED'`.
     - Else (structural heading container such as `4`, `4.4`, `5`, `5.1`, or `debería`/`should`/`NOTA`-only text) $\rightarrow$ `es_obligatorio = false`, `obligatorio_origen = 'AUTO_TEXT'`.
   - **Rule C (Skeleton Standard without HTML yet, e.g., `ISO/IEC 27001:2022`, `NTF 4073:2022`, `ISO/IEC 17065:2012`, `ISO 50001:2018`):**
     - If `!clause.es_padre` (leaf requirement) $\rightarrow$ `es_obligatorio = true`, `obligatorio_origen = 'AUTO_STRUCTURAL'`.
     - Else (parent container) $\rightarrow$ `es_obligatorio = false`, `obligatorio_origen = 'AUTO_STRUCTURAL'`.
3. Update `normalizeNormasCsvDatasets()` to invoke `classifyNormalizedClausesObligation()` after building both `clauses` and `translations`, and update `buildRequisitoLtreeFromNormalized()`.

### 2.2 `scripts/buildNormasSeed.ts` & Generated Artifacts
1. Update `buildRequisitosInsertSql()` to include `es_obligatorio` and `obligatorio_origen` in the `INSERT INTO public.requisito (...)` statement:
   - In `ON CONFLICT (id_norma, codigo) WHERE deleted_at IS NULL DO UPDATE SET`:
     ```sql
     es_obligatorio = CASE
       WHEN public.requisito.obligatorio_origen = 'MANUAL' THEN public.requisito.es_obligatorio
       ELSE EXCLUDED.es_obligatorio
     END,
     obligatorio_origen = CASE
       WHEN public.requisito.obligatorio_origen = 'MANUAL' THEN public.requisito.obligatorio_origen
       ELSE EXCLUDED.obligatorio_origen
     END
     ```
2. Update `CompactClauseTuple` in `buildStaticBundleTs()` to include `es_obligatorio: 0 | 1` and `obligatorio_origen` so `expandNormasCatalogBundle()` provides exact flags offline and pre-hydration.
3. Re-run the generator (`npx tsx scripts/buildNormasSeed.ts`) to regenerate:
   - `public/supabase/queries/07_normas_requisitos_csv.sql`
   - `src/lib/generated/normasCatalogBundle.ts`

---

## 3. TypeScript Types & Hydration Sync

### 3.1 `src/lib/extraDomain.ts`
- Add `ObligatorioOrigen = 'AUTO_TEXT' | 'AUTO_INHERITED' | 'AUTO_CHAPTER' | 'AUTO_STRUCTURAL' | 'MANUAL'`.
- Add `es_obligatorio?: boolean` and `obligatorio_origen?: ObligatorioOrigen` to `RequisitoLtree` and `RequisitoFormDraft`.
- Update `INITIAL_REQUISITOS_LTREE` fallback constants, `createEmptyRequisitoFormDraft()`, `createRequisitoDraftFromEntity()`, and `validateRequisitoDraft()` (when staff edits `es_obligatorio` explicitly and it differs from existing value, mark `obligatorio_origen = 'MANUAL'`).

### 3.2 `src/lib/paginatedHydration.ts` & `src/main.ts`
- Add `es_obligatorio?: boolean | null` and `obligatorio_origen?: string | null` to `RawRequisitoRow`.
- Update the `.from('requisito').select(...)` query in `src/main.ts` (`loadDomainData` / `loadLiveRequirements`) to select `es_obligatorio, obligatorio_origen`.
- In `assembleHydratedNormasAndRequisitos()`, map `es_obligatorio` (with graceful fallback to bundle/heuristic if a pre-migration database lacks the column during transitional boots).

---

## 4. Verification Criteria for Step 1.1
- Running `npx tsx scripts/buildNormasSeed.ts` reports deterministic mandatory counts for all 8 standards (`ISO 9001:2015` chapters 1–3 = `0` mandatory; `4.4` container = `false`; `4.4.1` and `4.4.1.a..h` = `true`; skeleton standards preserve non-chapter-1..3 leaf obligations).
- `POST /api/reset-db` executes `01_creacion.sql`, `03_indices_optimizacion.sql`, and `07_normas_requisitos_csv.sql` cleanly with zero SQL errors.
- Unit tests in `src/lib/requisitoCsvImporter.test.ts` and `src/lib/paginatedHydration.test.ts` assert mandatory classification across `debe`, `shall`, `debería`, `should`, `NOTA`, inherited sub-bullets, and skeleton standards.
