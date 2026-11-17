# Step 3.1: Certificate Coverage Cockpit HUD, Pending Clauses Panel & Tab Validation Badges

> **Goal:** Surface real-time normative coverage clarity inside the `certificado` Detail View (`src/views/certificadoView.ts`) and `detailTemplate.ts` without polluting the Clean List Directory (`certificados-main`) or breaking Zero-UUID compliance.  
> **Depends On:** Step 2.1 (`evaluateCertificateCoverage`) and Step 2.2 (live wired state).

---

## 1. Strict UI Constraints Preserved
1. **Clean List Directory Rule (`certificados-main`):** Do NOT add a "Cobertura Normativa" column or progress bar to the Plural Multi View table in `certificadoView.ts` (explicitly preserving the existing 6-column directory layout).
2. **Zero-UUID Compliance:** Never render UUIDs in progress HUDs, pending-clause chips, badges, `title`, or `aria-label`.
3. **3-Zone Detail Card Fidelity (`detailTemplate.ts`):** Coverage HUD lives cleanly inside the single Detail Card between Zone 2 (Record Attributes) and Zone 3 (Children Tabs), with zero footer Save/Cancel clutter.

---

## 2. Tab Badge Enhancements (`src/views/detailTemplate.ts`)

Extend `DetailChildTab` cleanly with optional non-intrusive status styling:
```ts
export interface DetailChildTab {
  id: string;
  label: string;
  symbol?: string;
  count: number;
  countBadgeClass?: string; // optional override (e.g., emerald vs amber for coverage)
  statusDotClass?: string;  // optional 6px status indicator dot
}
```
- Backward-compatible: all existing callers omitting `countBadgeClass` / `statusDotClass` render identically.
- On `certificadoView.ts`:
  - `procesos` tab (`id: 'procesos'`): displays process count + subtle status indicator reflecting active coverage.
  - `no_aplicables` tab (`id: 'no_aplicables'`): displays active exclusion count.
  - **Recommended Coverage Cockpit Design inside `certificado` Detail View (read mode only, hidden in `isCreateMode`):**
    1. **Compact Coverage HUD Strip** placed cleanly above the Zone 3 tab bar (or inside `extraSectionsHtml` / Zone 2 bottom):
       - Status pill: `✓ Cobertura Normativa Completa (100%)` (emerald) vs. `⚠️ Cobertura Incompleta · Faltan X cláusulas obligatorias` (amber) vs. `Sin cobertura asignada` (slate).
       - Stacked horizontal progress bar: Emerald (`Cubiertas por Procesos: A`) + Rose/Slate (`No Aplicables ISO 4.3: B`) + Amber/Gray (`Pendientes: P`) out of `Total Obligatorias: M`.
       - Single toggle button: **`📊 Ver Mapa de Cobertura`** (`data-action="toggle-cert-coverage-map"`), which opens/closes the interactive clause-by-clause Coverage Inspector right below the HUD.

---

## 3. Interactive Coverage Map & Pending Clauses Navigator (`certificadoView.ts`)

When the user expands the **Mapa de Cobertura** inside `certificado`:
1. **Filter Segmented Control:**
   - `Pendientes (P)` *(default when `P > 0` so auditors/staff immediately see what is missing!)*
   - `Todas Obligatorias (M)`
   - `Cubiertas (A)`
   - `No Aplicables (B)`
   - `Informativas` *(optional inspection)*
2. **Clean `table-fixed` List View (`renderListViewTable`) with Zero `acciones` Column:**
   - Columns (`100%` total width):
     1. `Cláusula` (`codigo`, e.g., `8.5.1`)
     2. `Requisito Normativo` (`titulo` / first line of ES translation)
     3. `Estado Cobertura` badge (`CUBIERTO` emerald, `NO_APLICABLE` rose, `PENDIENTE` amber, `INFORMATIVA` slate)
     4. `Asignación / Origen` (Process name(s) e.g. `"Troquelado y Fundición (vía 8.5)"` OR Exclusion reason / parent e.g. `"Excluida bajo 8.3"` OR `"Sin asignar"`)
   - **Quick-Resolve Context Bar (for Staff, placed outside `<tbody>`):**
     - Clicking a `PENDIENTE` row selects it and activates a slim action bar above the table:
       - `Asignar a Proceso ▾` (dropdown of certificate's active processes $\rightarrow$ jumps straight to `procesoView` with that clause pre-checked, or assigns in 1 click)
       - `Declarar No Aplicable` (opens `noAplicableView` in `'add'` mode with `id_certificado` and `id_requisito` prefilled).
     - Clicking a `CUBIERTO` row navigates to the owning `Proceso` detail (or `Requisito` reader).
     - Clicking a `NO_APLICABLE` row navigates to the `No Aplicable` detail view.

---

## 4. Child Tab Context Enhancements (`certificadoView.ts`)

- **`renderProcesosChildTab`:** Show effective downward coverage count alongside direct clauses (e.g., `"2 directas · cubre 18 obligatorias"`) so staff understands how parent-level clause coverage propagates downward.
- **`renderNoAplicablesChildTab`:** Show effective subtree count per exclusion row (e.g., `8.3 (+6 subcláusulas)`), and preserve full-row click navigation to `noAplicableView`.

---

## 5. Verification Criteria for Step 3.1
- `certificados-main` Multi View retains its exact 6 columns (Clean List preserved).
- Inside `certificado` Detail View, the Coverage HUD immediately reflects changes when adding/removing process clauses or ISO 4.3 exclusions.
- Filtering by `Pendientes` isolates every uncovered mandatory clause (`debe`/`shall` + skeleton leaves) while hiding Chapters `1..3` and pure structural containers that have no uncovered mandatory descendants.
- `assertZeroUuidExposure` passes on all rendered HTML of `certificadoView.ts`.
