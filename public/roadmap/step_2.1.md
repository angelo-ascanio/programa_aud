# Step 2.1: Pure TypeScript Coverage Engine & Smart-Mutation State Reconciler (`src/lib/coverageEngine.ts`)

> **Goal:** Build an isomorphic, zero-side-effect TypeScript engine (`src/lib/coverageEngine.ts`) mirroring PostgreSQL's `evaluar_cobertura_certificado` and Smart-Mutation semantics 1:1 for optimistic client state, offline resilience, batch UI pickers, and comprehensive `node:test` verification.  
> **Depends On:** Step 1.1 (`es_obligatorio` on `RequisitoLtree`) and Step 1.2 (exact SQL contract).

---

## 1. Core Data Contracts (`src/lib/coverageEngine.ts`)

Define strict, `0 any` types exported cleanly:

```ts
export type ClauseCoverageState =
  | 'CUBIERTO'
  | 'NO_APLICABLE'
  | 'INFORMATIVA'
  | 'PARCIAL'
  | 'MIXTO'
  | 'PENDIENTE';

export interface ClauseCoverageNodeResult {
  id_requisito: string;
  codigo: string;
  titulo: string;
  ruta_materializada: string;
  nivel: number;
  es_padre: boolean;
  es_obligatorio: boolean;
  estado: ClauseCoverageState;
  directProcessIds: string[];
  directProcessNames: string[];
  inheritedFromProcessCodigo: string | null;
  exclusionId: string | null;
  exclusionReason: string | null;
  inheritedExclusionCodigo: string | null;
  mandatoryDescendantCount: number;
  coveredDescendantCount: number;
  excludedDescendantCount: number;
  pendingDescendantCount: number;
}

export interface CertificateCoverageSummary {
  id_certificado: string;
  id_norma: string;
  totalObligatorios: number;
  cubiertosPorProceso: number;
  excluidosNoAplicables: number;
  pendientes: number;
  porcentajeCobertura: number; // 0..100 rounded to 2 decimals
  coberturaCompleta: boolean;
  hasAnyDirectAssignments: boolean;
}

export interface CertificateCoverageReport {
  summary: CertificateCoverageSummary;
  nodes: ClauseCoverageNodeResult[];
  nodeByRequisitoId: ReadonlyMap<string, ClauseCoverageNodeResult>;
  pendingMandatoryNodes: ClauseCoverageNodeResult[];
  excludedSubtreeRoots: ReadonlyMap<string, { exclusionId: string; codigo: string; ruta_materializada: string }>;
}

export interface SmartMutationPrunedLink {
  id_proceso: string;
  nombre_proceso: string;
  codigo: string;
  ruta_materializada: string;
}
```

---

## 2. `LTREE` Hierarchy & Mandatory Helpers

### 2.1 Pure Path Predicate
```ts
export function isLtreeSelfOrDescendant(candidatePath: string, ancestorPath: string): boolean {
  const c = (candidatePath || '').trim();
  const a = (ancestorPath || '').trim();
  if (!c || !a) return false;
  return c === a || c.startsWith(`${a}.`);
}
```
- Handle edge cases: empty strings return `false`; prefix collisions like `'4.10'` vs `'4.1'` are impossible because `startswith(`${a}.`)` requires the dot boundary (and note `computeRequisitoLtreePath` encodes `4.1` as `4.4_1` and `4.10` as `4.4_10` anyway).

### 2.2 Mandatory Clause Resolution Fallback
Even though `RequisitoLtree.es_obligatorio` is populated from DB/CSV (Step 1.1), provide `resolveRequisitoIsMandatory(req, standardHasTranslations, ancestorHasOwnMust)`:
- If `typeof req.es_obligatorio === 'boolean'` $\rightarrow$ return `req.es_obligatorio`.
- Otherwise run the deterministic hybrid fallback matching Step 1.1 (`AUTO_CHAPTER` $\rightarrow$ `AUTO_TEXT` via `countNormativeObligationTerms` $\rightarrow$ `AUTO_INHERITED` $\rightarrow$ `AUTO_STRUCTURAL`).

---

## 3. Core Evaluation Function: `evaluateCertificateCoverage(...)`

Inputs:
- `cert: CertificadoDetailEntity`
- `requirementsCatalog: ReadonlyArray<RequisitoLtree>`
- `archivedProcesoIds?: ReadonlySet<string>`
- `archivedNoAplicableIds?: ReadonlySet<string>`

Algorithm ($O(N \cdot (P + E))$ with $N \le 480$, sub-millisecond per certificate):
1. Filter `normaClauses` = active (`!deleted_at`) clauses of `cert.id_norma`, sorted hierarchically via `orderNormaRequisitosHierarchically`.
2. Gather `activeProcesos` (`!archivedProcesoIds?.has(p.id)`). For each process, resolve its linked clause objects `(codigo, ruta_materializada)` against `normaClauses`.
3. Gather `activeExclusions` (`!archivedNoAplicableIds?.has(na.id)`), resolving each exclusion's `ruta_materializada`.
4. **First Pass (Effective State per Clause $r$):**
   - Find matching direct/ancestor exclusion via `isLtreeSelfOrDescendant(r.ruta_materializada, excl.ruta_materializada)`.
   - If excluded $\rightarrow$ `estado = 'NO_APLICABLE'`, record `exclusionId` or `inheritedExclusionCodigo`.
   - Else find all processes where `isLtreeSelfOrDescendant(r.ruta_materializada, procLink.ruta_materializada)` $\rightarrow$ if $\ge 1$, `estado = 'CUBIERTO'`, record direct vs inherited process source.
   - Else if `r.es_obligatorio` $\rightarrow$ `estado = 'PENDIENTE'`.
   - Else $\rightarrow$ provisionally `'INFORMATIVA'` (refined in Pass 2).
5. **Second Pass (Container Rollup for `es_obligatorio === false`):**
   - For each node $r$ with `es_obligatorio === false` and not itself excluded/covered:
     - Count mandatory descendants (`d.ruta_materializada !== r.ruta_materializada && isLtreeSelfOrDescendant(d.ruta_materializada, r.ruta_materializada) && d.es_obligatorio`):
       - `mandatoryDescendantCount === 0` $\rightarrow$ `'INFORMATIVA'`
       - `pendingDescendantCount > 0 && (coveredDescendantCount > 0 || excludedDescendantCount > 0)` $\rightarrow$ `'PARCIAL'`
       - `pendingDescendantCount > 0` $\rightarrow$ `'PENDIENTE'`
       - `coveredDescendantCount > 0 && excludedDescendantCount > 0` $\rightarrow$ `'MIXTO'`
       - `excludedDescendantCount > 0 && coveredDescendantCount === 0` $\rightarrow$ `'NO_APLICABLE'`
       - Otherwise $\rightarrow$ `'CUBIERTO'`
6. **Summary Tally (strictly over $M(N) = \{r \mid r.\text{es\_obligatorio}\}$):**
   - `totalObligatorios` = count of mandatory nodes.
   - `cubiertosPorProceso` = count of mandatory nodes with `estado === 'CUBIERTO'`.
   - `excluidosNoAplicables` = count of mandatory nodes with `estado === 'NO_APLICABLE'`.
   - `pendientes` = `totalObligatorios - cubiertosPorProceso - excluidosNoAplicables`.
   - `porcentajeCobertura` = `totalObligatorios === 0 ? 100 : Math.round(((cubiertosPorProceso + excluidosNoAplicables) / totalObligatorios) * 10000) / 100`.
   - `coberturaCompleta` = `pendientes === 0`.

---

## 4. Pure Smart-Mutation Preview & Reducer

### 4.1 `previewNonApplicableSmartMutation(params)`
Given `{ cert, targetRequisito, requirementsCatalog, archivedProcesoIds }`:
- Iterate every active process in `cert.procesos` and every linked clause `codigo` on that process.
- Resolve the linked clause's `ruta_materializada`.
- If `isLtreeSelfOrDescendant(linkedPath, targetRequisito.ruta_materializada)` $\rightarrow$ push `{ id_proceso, nombre_proceso, codigo, ruta_materializada }` to `prunedLinks`.
- Return `{ willMutate: prunedLinks.length > 0, prunedLinks, affectedProcessCount }`.

### 4.2 `applyNonApplicableSmartMutationToState(params)`
Pure immutable reducer taking `{ certificates, processes, targetCertId, exclusion, targetRequisito, requirementsCatalog, mode: 'upsert' | 'restore' }`:
- Updates `cert.noAplicables` (adds/updates `exclusion`).
- Removes every `codigo` where `isLtreeSelfOrDescendant(linkedPath, targetRequisito.ruta_materializada)` from both:
  - `cert.procesos[*].clausulas_cubiertas` and `cert.procesos[*].requisitos_detalle`
  - Top-level `processes[*].clausulas_cubiertas`
- Returns `{ nextCertificates, nextProcesses, prunedLinks }`.

### 4.3 `isClauseBlockedByCertificateExclusions(params)`
Given `{ cert, targetRequisito, requirementsCatalog, archivedNoAplicableIds }`:
- Checks whether any active exclusion $e$ satisfies `isLtreeSelfOrDescendant(targetRequisito.ruta_materializada, e.ruta_materializada)`.
- Returns `{ blocked: boolean, blockingExclusionCodigo?: string, blockingJustificacion?: string }`.

---

## 5. Verification Criteria for Step 2.1 (`src/lib/coverageEngine.test.ts`)
Write dedicated `node:test` suites validating:
1. **Downward Inheritance:** Assigning `4.4` to Process A marks `4.4`, `4.4.1`, `4.4.1.a..h`, `4.4.2`, `4.4.2.a..b` as `CUBIERTO` without double-counting containers in `totalObligatorios`.
2. **Container Rollup:** Assigning `4.4.1` and `4.4.2` separately makes container `4.4` resolve to `'CUBIERTO'`; assigning only `4.4.1` makes `4.4` resolve to `'PARCIAL'`.
3. **Informative Filtering:** Chapters `1..3` (`1.a`, `2`, `3`) and `debería`/`should`/`NOTA`-only items stay `'INFORMATIVA'` and never enter `pendientes`.
4. **Exclusion Precedence & Smart Mutation:** Declaring `4.4` Non-Applicable prunes `4.4.1`, `4.4.2`, and `4.4.1.a` across multiple processes while preserving unrelated `8.5`; declaring `4.4.2` Non-Applicable while Process A has `4.4` keeps `4.4.1` covered and marks `4.4.2` `NO_APLICABLE` (`4.4` rolls up to `'MIXTO'`).
5. **100% Completion Invariant:** Union of Process-covered + Non-Applicable mandatory clauses reaches `porcentajeCobertura === 100` and `coberturaCompleta === true` iff `pendientes === 0`.
