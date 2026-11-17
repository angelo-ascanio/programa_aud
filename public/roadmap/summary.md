# Normative Standard Coverage & Non-Applicable Governance — Implementation Roadmap Summary

> **Project:** `programa_aud` (ISO/IEC 17021-1 & ISO 19011 Audit Management Platform)  
> **Stack:** Supabase PostgreSQL (LTREE + RLS, 37 tables) · Express 5 · TypeScript SPA (`strict: true`, `0 any`) · Vite · Tailwind CSS v4  
> **Objective:** Guarantee 100% mathematical, hierarchical (`LTREE`), and frictionless governance over normative clause coverage across a certificate's processes (`requisitos_por_proceso`) and justified exclusions (`requisitos_no_aplicables_certificado`).

---

## 1. Executive Problem Statement & Architectural Gap

In ISO certification management (`certificado`), every mandatory normative requirement of the certificate's target standard (`id_norma`) must be accounted for—either assigned to one or more operational processes (`proceso` $\rightarrow$ `requisitos_por_proceso`) or explicitly justified as non-applicable under ISO 4.3 (`requisitos_no_aplicables_certificado`).

### Current Gaps Verified in the Codebase
1. **Inverted `LTREE` Propagation in SQL (`public/supabase/queries/02_cobertura_normativa.sql`):**  
   `evaluar_cobertura_certificado(UUID)` currently propagates coverage **upward** (`r_all.ruta_materializada @> rcd.ruta`), meaning assigning child `4.4.1` marks parent `4.4` as `CUBIERTO`, whereas assigning parent `4.4` fails to cover descendants `4.4.1`, `4.4.2`, or `4.4.1.a..h`.
2. **No Mandatory vs. Informative Classification (`public.requisito`):**  
   All `2,188` clauses across the `8` bundled standards are currently weighted equally in coverage calculations—including informative sections (Chapters `1` Scope, `2` Normative References, `3` Terms & Definitions), structural container headings (`4`, `4.4`, `5`), and non-binding text lacking `debe`/`shall` obligations.
3. **No Mutual Exclusion or Smart-Mutation Governance:**  
   `requisitos_por_proceso` has no trigger preventing assignment of an excluded clause (or its descendants), and `requisitos_no_aplicables_certificado` does not reconcile existing process assignments when a clause is declared non-applicable.
4. **High-Friction Single-Clause UI (`src/views/procesoView.ts`):**  
   `renderProcesoRequisitosTab` only links one clause per form submission (`#assignProcesoReqSelect`), making full-standard coverage (dozens or hundreds of clauses) tedious, and `certificadoView.ts` lacks a coverage completeness HUD inside the Certificate Detail View.

---

## 2. Formal Mathematical Model & `LTREE` Set Theory

Let $N$ be a normative standard (`public.norma`) and $R(N)$ the set of active (`deleted_at IS NULL`) clauses in `public.requisito` belonging to $N$. Each clause $r \in R(N)$ carries a materialized path $\pi(r)$ (`ruta_materializada LTREE`) and a boolean classification $\mu(r) \in \{\text{true}, \text{false}\}$ (`es_obligatorio`).

### 2.1 Mandatory Coverage Universe $M(N)$
$$M(N) = \{ r \in R(N) \mid r.\text{deleted\_at IS NULL} \land r.\text{es\_obligatorio} = \text{TRUE} \}$$

Informative clauses ($\mu(r) = \text{false}$) remain readable in the catalog and normative reader, and may still be inspected for context, but are excluded from the coverage denominator $|M(N)|$.

### 2.2 Downward `LTREE` Subtree Expansion
For any clause $c \in R(N)$, its downward subtree operator is defined via PostgreSQL `LTREE` descendant matching (`<@`):
$$\text{Subtree}(c) = \{ r \in R(N) \mid \pi(r) \text{ <@ } \pi(c) \}$$
*(Note: $\pi(r) \text{ <@ } \pi(c)$ is reflexive, so $c \in \text{Subtree}(c)$ and all children/grandchildren/sub-bullets of $c$ are included.)*

### 2.3 Direct & Effective Sets for a Certificate $K$
For an active certificate $K$ targeting standard $N = K.\text{id\_norma}$:
- **Direct Process Assignments:**
  $$P_{\text{dir}}(K) = \bigcup_{p \in \text{ActiveProcesos}(K)} \{ r \in R(N) \mid (p, r) \in \text{requisitos\_por\_proceso} \}$$
- **Direct Active Exclusions:**
  $$E_{\text{dir}}(K) = \{ r \in R(N) \mid (K, r) \in \text{requisitos\_no\_aplicables\_certificado} \land \text{deleted\_at IS NULL} \}$$
- **Effective Excluded Set (Downward Inheritance):**
  $$E_{\text{eff}}(K) = \bigcup_{e \in E_{\text{dir}}(K)} \text{Subtree}(e)$$
- **Effective Covered Set (Downward Inheritance, Disjoint from Exclusions):**
  $$C_{\text{eff}}(K) = \left( \bigcup_{c \in P_{\text{dir}}(K)} \text{Subtree}(c) \right) \setminus E_{\text{eff}}(K)$$

### 2.4 Core Coverage Equation & Invariants
1. **Disjointness Invariant (No Overlap Between Processes and Exclusions):**
   $$P_{\text{dir}}(K) \cap E_{\text{eff}}(K) = \emptyset \quad \text{and} \quad C_{\text{eff}}(K) \cap E_{\text{eff}}(K) = \emptyset$$
   Enforced deterministically by:
   - **Guard on `requisitos_por_proceso`:** Rejects inserting $(p, r)$ if $r \in E_{\text{eff}}(K)$.
   - **Smart Mutation on `requisitos_no_aplicables_certificado`:** Declaring or restoring $e \in E_{\text{dir}}(K)$ automatically deletes every $(p, r)$ from `requisitos_por_proceso` where $p \in \text{ActiveProcesos}(K)$ and $r \in \text{Subtree}(e)$.
2. **Target Completeness Equation:**
   $$M(N) = \big(C_{\text{eff}}(K) \cap M(N)\big) \;\sqcup\; \big(E_{\text{eff}}(K) \cap M(N)\big)$$
   That is, the pending mandatory set must reach zero:
   $$\text{Pending}(K) = M(N) \setminus \big(C_{\text{eff}}(K) \cup E_{\text{eff}}(K)\big) = \emptyset$$
3. **Completion Percentage:**
   $$\text{Coverage\%}(K) = \begin{cases} 100.00 & \text{if } |M(N)| = 0 \\ \text{round}\!\left(\dfrac{|(C_{\text{eff}}(K) \cup E_{\text{eff}}(K)) \cap M(N)|}{|M(N)|} \times 100,\; 2\right) & \text{otherwise} \end{cases}$$

### 2.5 Reconciling Upward Rollup vs. Downward Coverage
A structural heading (e.g., `4.4` *"Sistema de gestión de la calidad y sus procesos"*) is a container whose HTML body only embeds `{clause_4.4.1}` and `{clause_4.4.2}` without its own `debe`/`shall`.
- **Covering downward:** If a process covers `4.4`, then `4.4.1`, `4.4.2`, and all sub-bullets `4.4.1.a..h`, `4.4.2.a..b` are automatically marked **`CUBIERTO`**.
- **Rollup upward (for tree display of containers):** If a process covers `4.4.1` and `4.4.2` separately (or `4.4.1` is covered and `4.4.2` is non-applicable), `4.4` displays an informative rollup badge (`CUBIERTO_COMPLETO` or `MIXTO_CUBIERTO_Y_EXCLUIDO`), whereas if only `4.4.1` is covered and `4.4.2` is pending, `4.4` displays `PARCIAL`—without falsely marking `4.4.2` as covered!

---

## 3. Non-Mandatory Clause Filtering (`debe` / `shall` + Empirical Dataset Rules)

Empirical analysis of the `2,188` clauses in `src/lib/generated/normasCatalogBundle.ts` revealed two distinct tiers in the current catalog:

| Standard (`norma`) | Total Clauses | Non-Empty HTML | Clauses w/ Own `debe`/`shall` | Leaves w/o Own or Ancestor `debe`/`shall` | Chapter `1..3` Leaves |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `ISO 9001:2015` | 350 | 350 | 69 | 4 | `1.a, 1.b, 2, 3` |
| `ISO 14001:2015` | 205 | 205 | 35 | 34 | `1, 2, 3.x.y` |
| `ISO 45001:2018` | 307 | 307 | 43 | 43 | `1.a..c, 2, 3.x` |
| `ISO 22000:2018` | 480 | 480 | 92 | 50 | `1.a..g, 2, 3.x` |
| `ISO/IEC 27001:2022` | 167 | 0 *(skeleton)* | 0 | 167 | `1, 2, 3` |
| `NTF 4073:2022` | 138 | 0 *(skeleton)* | 0 | 138 | `1.a..h, 2, 3` |
| `ISO/IEC 17065:2012` | 307 | 0 *(skeleton)* | 0 | 307 | `1, 2, 3.x` |
| `ISO 50001:2018` | 234 | 0 *(skeleton)* | 0 | 234 | `1.a..e, 2, 3.x` |

### Key Structural Findings Driving the Classifier Design
1. **Sub-bullet Inheritance:** In ISO standards, an obligation verb (`debe`/`shall`) is often stated once in a parent clause (e.g., `4.4.1`: *"La organización debe establecer..."*) and itemized in sub-clauses `4.4.1.a` .. `4.4.1.h` (`explicit_code = false`), which do not repeat `"debe"`. In fact, across all four text-hydrated standards (`1,342` clauses), **100% of leaf clauses in Chapters 4–10 either contain their own `debe`/`shall` or have an ancestor with `debe`/`shall`!**
2. **Skeleton Standards Without Translations Yet (`0` HTML rows):** `ISO/IEC 27001:2022`, `NTF 4073:2022`, `ISO/IEC 17065:2012`, and `ISO 50001:2018` have hierarchical codes and trees but `0` translations in `standard.clause.translation.csv`. Filtering purely on `debe`/`shall` text without checking whether the standard has translations would falsely yield $|M(N)| = 0$!
3. **Recommendations & Notes:** `debería` / `should` and `NOTA` blocks are informative guidance, not certifiable obligations, and must NOT trigger mandatory status.

### Deterministic Hybrid Classification Rule (`es_obligatorio`)
For any active clause $c$ in standard $N$:
1. **Manual Override (`obligatorio_origen = 'MANUAL'`):** Staff (`ADMIN`/`WORKER`) can explicitly toggle `es_obligatorio` on a clause in `requisitoView.ts`; manual overrides are preserved across re-evaluation.
2. **Chapter `1..3` Informative Guard (`AUTO_CHAPTER`):** If root segment of `codigo` is `'0'`, `'1'`, `'2'`, or `'3'` (Scope, Normative References, Terms & Definitions), `es_obligatorio = FALSE` unless overridden manually.
3. **Text-Hydrated Standard Rule (`hasStandardTranslations(N) === true`):**
   - Inspect plain unexpanded prose of $c$ (`countNormativeObligationTerms` stripping HTML and `{clause_...}` placeholders so parent containers do not steal child `debe` counts).
   - If `c` has `debe > 0 || shall > 0` $\rightarrow$ `es_obligatorio = TRUE` (`AUTO_TEXT`).
   - Else if `c` has an ancestor with `AUTO_TEXT` (e.g., `4.4.1.a` under `4.4.1`) $\rightarrow$ `es_obligatorio = TRUE` (`AUTO_INHERITED`).
   - Else (pure container heading like `4`, `4.4`, `5`, `5.1`, or `should`/`debería`/`NOTA`-only paragraph) $\rightarrow$ `es_obligatorio = FALSE` (`AUTO_TEXT`).
4. **Skeleton Standard Fallback (`hasStandardTranslations(N) === false`):**
   - Clauses in Chapters `1..3` $\rightarrow$ `es_obligatorio = FALSE` (`AUTO_CHAPTER`).
   - Structural leaf clauses (or clauses without children) outside Chapters `1..3` $\rightarrow$ `es_obligatorio = TRUE` (`AUTO_STRUCTURAL`), while pure high-level chapter/section containers (`es_padre === true` at shallow levels `1..2`) default to `FALSE` unless leaf.

---

## 4. Frictionless Conflict Resolution: The Smart Mutation Workflow

To support the real-world auditor workflow (*"assign processes to cover the standard first, then refine exclusions under ISO 4.3"*), **no error blocks declaring a Non-Applicable clause**:

```
  [User assigns Clause 8.3 (or subtree) to Process "Ingeniería"]
                          │
                          ▼
  [User later declares Clause 8.3 (or parent 8) as "No Aplicable (ISO 4.3)"]
                          │
          ┌───────────────┴───────────────┐
          ▼                               ▼
  UI Pre-Save Preview               DB Trigger / RPC (Atomic TX)
  • Lists affected processes        • Deletes matching rows & LTREE descendants
    & exact clauses to be pruned      (<@) from `requisitos_por_proceso`
  • Clear "No bloqueante" notice    • Inserts/restores `requisitos_no_aplicables_certificado`
                                    • Writes forensic diff to `public.audit_log`
                          │
                          ▼
  [Toast + Live UI Recompute: "Exclusión declarada; 4 cláusula(s) desvinculadas automáticamente."]
```

Conversely, if a user tries to assign a clause to a **Process** while that clause or any LTREE ancestor is already marked **Non-Applicable** on the same certificate:
- **UI Picker:** Disabled with badge `⛔ Excluida ISO 4.3 (por Cláusula X)`.
- **Database Guard (`BEFORE INSERT OR UPDATE` on `requisitos_por_proceso`):** Rejects direct API attempts with an explicit diagnostic referencing the blocking `No Aplicable` parent clause (`P0001`).

---

## 5. UI/UX Architecture & Placement Strategy Evaluation

| Criterion | Option A: Standalone Coverage Wizard Modal/Page | Option B: Embedded Certificate Cockpit + Batch Subtree Picker *(Recommended)* |
| :--- | :--- | :--- |
| **Alignment w/ 3-Zone Detail Pattern** | Introduces an isolated 4th workflow disconnected from `certificado` tabs (`Procesos`, `No Aplicables`). | Integrates natively into Zone 2/3 of `certificadoView.ts`, `procesoView.ts`, and `noAplicableView.ts` using existing `detailTemplate.ts` primitives. |
| **Directory Clean List Rule** | Risk of adding forbidden summary columns to `certificados-main`. | Keeps `certificados-main` strictly at its 6 clean columns (explicitly respecting line 195 of `certificadoView.ts`). |
| **Multi-Process Coverage Speed** | Forces switching back out to edit process metadata (`tipo`, `nombre`). | Upgraded Batch Subtree Picker in `procesoView.ts` allows covering an entire chapter or *"Todas las pendientes obligatorias"* in 2 clicks. |
| **Non-Blocking Smart Mutation** | Hard to reflect live impact while editing an individual ISO 4.3 justification. | `noAplicableView.ts` shows a live Smart-Mutation preview banner directly inside `#noAplicableDetailForm`. |
| **Auditability & Zero-UUID** | Duplicates state management in `main.ts`. | Single source of truth in `coverageEngine.ts`, zero raw UUIDs exposed anywhere. |

**Recommendation — Option B:**
1. **`certificadoView.ts`:** Add a compact **Cobertura Normativa** progress HUD right above the 7 child tabs + live status badges on `Procesos` & `No Aplicables` tabs + an inline toggleable **Mapa de Cobertura y Pendientes** drawer inside the detail card showing every mandatory clause (`Pendientes` | `Cubiertas` | `No Aplicables`) with 1-click navigation to assign or exclude.
2. **`procesoView.ts`:** Replace the 1-clause-at-a-time `<select>` in `renderProcesoRequisitosTab` with an accordion/tree **Batch Clause Picker** (chapter toggles, *"Solo obligatorias pendientes"*, *"Seleccionar pendientes"*, automatic disabled state for ISO 4.3 exclusions, and instant downward subtree preview).
3. **`noAplicableView.ts`:** Display an informational **Smart Mutation Preview** panel whenever the selected clause or its LTREE descendants overlap with any active process on the certificate.
4. **`requisitoView.ts`:** Surface the `es_obligatorio` badge (`Obligatoria` vs `Informativa / Contenedor`) and allow staff manual override in edit mode.

---

## 6. Phased Execution Plan (`public/roadmap/`)

| Step File | Scope | Primary Target Files |
| :--- | :--- | :--- |
| **`step_1.1.md`** | **DB Schema (`es_obligatorio`) & CSV Obligation Classifier** | `01_creacion.sql`, `03_indices_optimizacion.sql`, `requisitoCsvImporter.ts`, `scripts/buildNormasSeed.ts`, `07_normas_requisitos_csv.sql`, `normasCatalogBundle.ts`, `extraDomain.ts`, `paginatedHydration.ts` |
| **`step_1.2.md`** | **PostgreSQL Downward `LTREE` Engine, Guards & Smart-Mutation Triggers** | `01_creacion.sql`, `02_cobertura_normativa.sql`, `04_rls.sql`, `06_datos_prueba.sql` |
| **`step_2.1.md`** | **Pure TypeScript Coverage & Smart-Mutation Engine** | `src/lib/coverageEngine.ts` *(new)*, `src/lib/coverageEngine.test.ts` *(new)* |
| **`step_2.2.md`** | **Domain Integration, Batch Linker & Optimistic Mutation Wiring** | `src/lib/procesoDomain.ts`, `src/lib/noAplicableDomain.ts`, `src/lib/multisiteSampling.ts`, `src/main.ts` |
| **`step_3.1.md`** | **Certificate Coverage Cockpit HUD & Tab Validation Badges** | `src/views/detailTemplate.ts`, `src/views/certificadoView.ts` |
| **`step_3.2.md`** | **Batch Subtree Picker, Smart-Mutation Preview & Clause Override UI** | `src/views/procesoView.ts`, `src/views/noAplicableView.ts`, `src/views/requisitoView.ts` |
| **`step_final.md`** | **Verification, Edge Cases, Trigger/RLS Audit, Unit Tests & Deployment Checklist** | Full regression suite (`node:test`, `tsc --noEmit`, `npm run lint`, `npm run build`, `POST /api/reset-db`, Playwright E2E) |
