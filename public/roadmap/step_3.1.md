# Step 3.1 — `Designación → Fecha` Multi View: Link Abbreviations, Last-Added Date Footer & Certificate Status

> **Pillar:** `Auditoría > Designación > Fecha` — Multi View Enhancements
> **Prerequisites:** `step_2.1.md` completed.

---

## 1. Objective

Refine the `Designación → Fecha` Multi View (both List/Table and Cards modes) to:
1. Replace generic `Lote (N)` with compact abbreviated link-nature labels from `Vínculo` (`Integ. (3)`, `Comb. (2)`, etc.) plus a `title` tooltip containing the full link nature term.
2. Remove date count noise (`1 fecha` / `0 fechas`) and display the **last programmed date record added** (by insertion/sequence order — e.g., if December was added first and November was added second, display November) in the card footer and table.
3. Display **certificate status** (`Activo`, `Suspendido`, `Cancelado`, `Estudio`, etc.) prominently on cards and table rows, and expose a reactive facet filter for certificate status.

---

## 2. Scope

### IN Scope
- `src/lib/designacionFechaDomain.ts`:
  - Add pure helper `formatCompactLinkNature(program, siblingCount, hasAudit)`:
    - `'Integrada'` → `{ short: 'Integ. (${n})', full: 'Integrada (${n} certificados)' }`
    - `'Combinada'` → `{ short: 'Comb. (${n})', full: 'Combinada (${n} certificados)' }`
    - `'Conjunta'` → `{ short: 'Conj. (${n})', full: 'Conjunta (${n} certificados)' }`
    - `'Simultánea'` → `{ short: 'Simul. (${n})', full: 'Simultánea (${n} certificados)' }`
    - `'Multientidad'` → `{ short: 'Multi. (${n})', full: 'Multientidad (${n} certificados)' }`
    - `'Mixta'` → `{ short: 'Mixta (${n})', full: 'Mixta (${n} certificados)' }`
    - `'Individual'` (or `siblingCount <= 1` with audit) → `{ short: 'Indiv.', full: 'Auditoría individual' }`
    - `totalAudits === 0` → `{ short: 'Sin aud.', full: 'Sin auditorías registradas' }`
  - Add pure helper `getCertificateStatusBadgeMeta(estatus)` returning high-contrast Tailwind semantic badge classes (`Activo` emerald, `Estudio` sky, `Suspendido` amber, `Cancelado` / `Retirado` / `Vencido` rose, fallback slate).
  - Verify/harden `resolveLastAddedPlannedDate(audit.fechas)`: strictly sorts active planned dates (`tipo_fecha !== 'REAL'`) by `numero_secuencia DESC`, tie-broken by `created_at DESC` (never by target calendar date), so the most recently added record always wins.
  - Extend `CertificateFechaRow` with `linkShortLabel`, `linkFullTooltip`, and `certStatusBadgeClass` while keeping `latestDateLabel` driven strictly by `resolveLastAddedPlannedDate`.
- `src/views/designacionFechaView.ts`:
  - **Cards (`renderCard`):**
    - Top row: Urgency window badge on left + Certificate status badge (`row.estatus`) on right (removing `${row.plannedDatesCount} fecha(s)` completely).
    - Middle: `numero_certificado` + `norma_codigo` + `organizacion_nombre`.
    - Footer: **Last-added programmed date** (`📅 ${row.latestDateLabel}`) on left + **Abbreviated link nature badge with tooltip** (`title="${row.linkFullTooltip}"`) on right.
  - **Table (`columns`, keeping `table-fixed`, `<colgroup>` = `100%`, `0 <button> in <tbody>`):**
    - Remove `plannedDatesCount` (`1 fecha` / `0 fechas`) from `hitos` column (replace `hitos` with `estatus_cert` + `auditorias` count or combine cleanly into balanced columns summing `100%`, e.g., `Ventana` 13% | `Certificado & Organización` 31% | `Estatus Cert.` 13% | `Últ. Fecha Programada` 27% | `Vínculo` 16% = `100%`).
    - Ensure `<span title="...">` carries full link-nature tooltip on `Vínculo` cells and zero `<button>` tags appear inside `<tbody>`.
  - **Facets:**
    - Add reactive `MultiViewFacetCategory` `'estatus_certificado'` (`Estatus Certificado`) computed dynamically from present certificate statuses (so `Activo`, `Suspendido`, `Cancelado`, `Estudio`, etc. are all filterable alongside `Ventana Temporal`, `Modalidad de Fecha`, and `Vínculo`).
    - Update search text extraction to include `row.estatus`, `row.linkShortLabel`, and `row.linkFullTooltip`.
- `src/lib/designacionFechaDomain.test.ts`:
  - Update Multi View assertions and add tests for:
    - Dec (`seq=1`) followed by Nov (`seq=2`) → Multi View displays **Nov** as the last-added programmed date.
    - All `AuditLinkNature` abbreviations and `title` tooltips (`Integ. (2)`, `Comb. (3)`, `Conj. (2)`, `Simul. (2)`, `Multi. (2)`, `Mixta (2)`).
    - Certificate status rendering & reactive filtering for `Suspendido` / `Cancelado` / `Activo`.
    - `<colgroup>` = `100%`, `0 <button> in <tbody>`, Zero-UUID.

### OUT of Scope
- Detail View header, switcher, linked-certs jump, or unified table (`step_4.1.md`, `step_4.2.md`).

---

## 3. Files to Inspect & Modify

- **Inspect:** `src/lib/designacionFechaDomain.ts`, `src/views/designacionFechaView.ts`, `src/lib/designacionFechaDomain.test.ts`, `src/lib/auditPlanningEngine.ts` (`resolveLatestPlannedDate`)
- **Modify:** `src/lib/designacionFechaDomain.ts`, `src/views/designacionFechaView.ts`, `src/lib/designacionFechaDomain.test.ts`

---

## 4. Detailed Tasks

1. **Domain Helpers (`src/lib/designacionFechaDomain.ts`):**
   - Implement `formatCompactLinkNature` and `getCertificateStatusBadgeMeta`.
   - Implement/verify `resolveLastAddedPlannedDate` using `numero_secuencia DESC`, fallback `created_at DESC`, fallback array index DESC (explicitly ignoring target calendar date ordering).
   - Populate `linkShortLabel`, `linkFullTooltip`, `certStatusBadgeClass` on `buildCertificateFechaRows`.
2. **Multi View UI Update (`src/views/designacionFechaView.ts`):**
   - Add `estatus_certificado` facet group using `ALL` unique active status values present in `allRows` (preserving deterministic display order: `Activo`, `Estudio`, `Suspendido`, `Cancelado`, `Vencido`, etc.).
   - Update `columns` (`table-fixed`, `<colgroup>` sum strictly `=== 100%`, `0 <button> in <tbody>`): display `estatus` badge and last-added programmed date without any `fecha(s)` count.
   - Update `renderCard`: place `estatus` badge in header alongside `urgency`, place `📅 ${row.latestDateLabel}` and `linkShortLabel` (`title="${row.linkFullTooltip}"`) in card footer, zero date-count labels.
3. **Tests (`src/lib/designacionFechaDomain.test.ts`):**
   - Add deterministic test where `seq=1` is December 2026 and `seq=2` is November 2026 and assert Multi View shows `Noviembre 2026` (or `Nov 2026`) — NOT December.
   - Verify Multi View list table `<colgroup>` sum `=== 100%`, `0 <button> in <tbody>`, zero `fecha(s)` count text, link tooltip attributes, certificate status badges/facets, and Zero-UUID.

---

## 5. Acceptance Criteria

- [ ] Multi View cards & table show abbreviated `Vínculo` nature (e.g., `Integ. (2)`, `Comb. (3)`) with full nature tooltip, never `Lote (N)`.
- [ ] Multi View omits `0 fechas` / `1 fecha` counts and displays the **last-added** planned date record (insertion/sequence order, not calendar date order).
- [ ] Certificate `estatus` (`Activo`, `Suspendido`, `Cancelado`, etc.) is visible on both cards and table rows and filterable via sidebar facet.
- [ ] Table preserves `table-fixed`, `<colgroup>` = `100%`, `0 <button> in <tbody>`, and Zero-UUID.

---

## 6. Verification Commands

```bash
npx tsc --noEmit
node --test --experimental-strip-types src/lib/designacionFechaDomain.test.ts src/lib/phase62UiIntegrity.test.ts
```
