# Step 4.1 — `Designación → Fecha` Detail View Shell: Minimal Context, Compact Switcher & Linked Jump

> **Pillar:** `Auditoría > Designación > Fecha` — Detail View ("Less Is More" Navigation & Top Shell)
> **Prerequisites:** `step_3.1.md` completed.

---

## 1. Objective

Redesign the upper navigation and context zones of `Designación → Fecha` Detail View under a strict **"Less Is More"** layout:
1. Ultra-clean header: Title shows **only the certificate number** (`FN-QMS-2026-009`) + **audit status badge** (`En Programación`, etc.), subtitle shows **only the organization name**, and top-right retains `+ Auditoría`.
2. Tighter vertical rhythm across breadcrumb, title header, context/historical audit bar, linked-cert strip, and body.
3. Simplified historical audit bar: left side displays compact clickable certificate trigger (`📜 FN-QMS-2026-009` with tooltip `title="Ver certificado: FN-QMS-2026-009"`), certificate status badge (`Activo`, `Suspendido`, `Cancelado`, etc.), and concise active audit summary (`AUD-2026-004 · Renovación · <current programmed date>`); right side displays compact `◀` / `<select>` / `▶` controls (`1 de N`).
4. **Conditional Clickable Linked Certificates Strip (`siblingsCount > 1` only):** Hidden completely when `siblingsCount <= 1`; when `> 1`, renders clickable buttons for all certificates in that specific linked audit so clicking any certificate opens `Designación → Fecha` for **that clicked certificate in that exact linked audit** (e.g., an old linked audit from 3 years ago).

---

## 2. Scope

### IN Scope
- `src/views/auditSectionShell.ts`:
  - Add opt-in `compactMode?: boolean` on `AuditSectionShellProps` (default `false` so Sections `1.1`, `1.3`, `1.4`, `2`–`7` remain 100% unchanged until opted in).
  - When `compactMode === true`:
    - Pass `title: certNumero` (omitting `Designación → Fecha · `), omit redundant `eyebrowCode`, pass `statusBadge` with the audit status (`activeAudit.estado_ciclo || 'En Programación'`), and `subtitle: orgNombre` (omitting `AUD-... · Tipo` from header subtitle). Keep `headerAddAuditHtml` (`+ Auditoría`) in top actions.
    - Render a compact `customParentZoneHtml` with reduced spacing (`space-y-1.5` and `p-2 sm:p-2.5` instead of bloated padding):
      - **Row A (Historical Audits Bar):**
        - Left: `<button type="button" data-parent-nav="true" data-nav="certificacion" data-subview="certificates" data-parent-type="cert" data-entity-id="${certId}" title="Ver certificado: ${certNumero}">📜 ${certNumero}</button>` + certificate status badge (`certInfo?.estatus`) + concise active audit snippet (`${activeAudit.codigo_auditoria} · ${activeAudit.tipo_auditoria} · ${currentPlannedDateLabel}`).
        - Right: compact `◀` / `<select data-action="select-section-audit">` / `▶` + `${activeIndex + 1} de ${auditsCount}` (omitting uppercase `"AUDITORÍA DEL CERTIFICADO:"` label text).
      - **Row B (Linked Certificates Strip — Conditional):**
        - Rendered **exclusively** when `showLinkedSiblings && linkedSiblings.length > 1 && activeAudit`.
        - Compact horizontal row with abbreviated link badge (`Integ. (N)` etc. + full tooltip) and clickable sibling buttons (`data-action="select-linked-sibling-audit"`, `data-audit-id="${sib.audit.id}"`, `data-cert-id="${sib.audit.id_certificado}"`, `aria-current="${sib.isActive ? 'true' : 'false'}"`).
- `src/views/detailTemplate.ts`:
  - Optional tightening when inside `audit-section-shell` (or via clean spacing inside `compactMode` shell) so top zones sit close together without excess `<hr class="my-3">` gaps.
- `src/views/designacionFechaView.ts`:
  - Enable `compactMode: true` and `showLinkedSiblings: siblingsCount > 1` when calling `renderAuditSectionShell`.
  - Pass `lastAddedPlannedLabel` (`formatAuditDateLabel(lastAddedPlanned)`) for the concise active audit context line.
  - Omit heavy `fecha-linked-batch-banner` multi-paragraph header box (move concise batch indicator cleanly into the unified dates section header in `step_4.2.md`).
- `src/main.ts`:
  - Verify `select-linked-sibling-audit` handler (`~12424–12435`):
    - Stays inside `state.activeSubSection` (`'designacion/fecha'`).
    - Sets `state.designacionFechaDomain.selectedCertId = sibCertId` and `state.designacionFechaDomain.selectedAuditId = sibAuditId` (keeping the exact linked audit selected, even if it is an older historical audit from 3 years ago!).
    - Resets `draftAuditId = null`, `drafts = null`, `editErrorMessage = null`, and any open editor state so the target certificate's exact audit dates load immediately.
    - Updates breadcrumb cleanly (`CertNumber`, Zero-UUID).
- `src/lib/designacionFechaDomain.test.ts` & `src/lib/certificateAuditSelector.test.ts`:
  - Test single-cert audit hides `[data-linked-siblings-bar]` completely.
  - Test multi-cert linked audit renders `[data-linked-siblings-bar]` with clickable `[data-action="select-linked-sibling-audit"]` carrying exact `data-cert-id` and `data-audit-id` (including historical non-latest linked audits).
  - Test compact header (`title` without redundant section prefix, `subtitle` = org name, `+ Auditoría` present, `title="Ver certificado: ..."` present, certificate status badge + `AUD-... · Tipo` + programmed date).

### OUT of Scope
- Replacing the stacked planned-date cards with the unified table & symbol-only editor (`step_4.2.md`).

---

## 3. Files to Inspect & Modify

- **Inspect:** `src/views/auditSectionShell.ts`, `src/views/detailTemplate.ts`, `src/views/designacionFechaView.ts`, `src/lib/certificateAuditSelector.ts`, `src/main.ts` (`lines 12199–12451`)
- **Modify:** `src/views/auditSectionShell.ts`, `src/views/designacionFechaView.ts`, `src/main.ts`, `src/lib/designacionFechaDomain.test.ts`, `src/lib/certificateAuditSelector.test.ts`

---

## 4. Detailed Tasks

1. **Add `compactMode` to `renderAuditSectionShell` (`src/views/auditSectionShell.ts`):**
   - Implement clean compact header (`certNumero` + audit status badge, `orgNombre` subtitle) and compact single-row parent/audit selector (`📜 certNumero` with tooltip `Ver certificado: ...` + cert status + `codigo_auditoria · tipo_auditoria · plannedDateLabel` + `◀ [select] ▶ 1 de N`).
   - Tighten vertical padding between Zone 1 and Zone 3 when `compactMode` is active.
2. **Enable Clickable Sibling Jump (`src/views/designacionFechaView.ts` + `src/main.ts`):**
   - Set `showLinkedSiblings: siblingsCount > 1` on `Designación → Fecha`.
   - Confirm in `src/main.ts` that `select-linked-sibling-audit` updates `designacionFechaDomain` AND `auditoriasSelection` to `(sib.audit.id_certificado, sib.audit.id)` without overwriting `selectedAuditId` with the newest audit of the clicked certificate (`resolveAuditNavigation` must respect `persistedAuditId` — verify line `106` of `certificateAuditSelector.ts` does this!).
3. **Update Tests:**
   - Update `src/lib/designacionFechaDomain.test.ts` (replacing old expectation `data-linked-siblings-bar="true" === false` with `true` when `siblingsCount > 1` and `false` when `siblingsCount === 1`).
   - Add historical 3-year-old linked audit jump test in `src/lib/certificateAuditSelector.test.ts` verifying `resolveAuditNavigation` stays pinned on the clicked historical `sib.audit.id` rather than snapping back to the latest year.

---

## 5. Acceptance Criteria

- [ ] Header shows only `FN-QMS-2026-009` + audit status badge, organization subtitle, and `+ Auditoría`.
- [ ] Historical audit bar displays compact `📜 <cert>` button (`title="Ver certificado: <cert>"`), cert status badge, concise `AUD-... · Tipo · <fecha>`, and `◀ [select] ▶`.
- [ ] Linked certificates strip renders **only** when `linkedSiblings.length > 1` and clicking any sibling navigates to `Designación → Fecha` for that exact certificate and linked audit ID (verified on historical multi-year fixtures).
- [ ] Zero raw UUID exposure; `npx tsc --noEmit` and all targeted tests pass.

---

## 6. Verification Commands

```bash
npx tsc --noEmit
node --test --experimental-strip-types src/lib/designacionFechaDomain.test.ts src/lib/certificateAuditSelector.test.ts
```
