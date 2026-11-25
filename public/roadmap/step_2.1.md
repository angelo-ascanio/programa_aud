# Paso 2.1 — Reubicación de `Relación` dentro de `Designación` y Simplificación de `<select>` de `Tipo`

## 1. Objetivo
1. Mover **`Relación`** dentro de **`1. Designación`**, como **primer subpaso antes de `Tipo`**:
   - **`1. Designación`** → `{ Relación, Tipo, Fecha, Sitio, Temporal }`
   - Renumerar el flujo principal a **`2. Tiempo`**, **`3. Auditor`**, **`4. Proceso`**, **`5. Turno`**, **`6. Resultado`**, **`7. Revisión`** + **`Resumen`**.
2. Simplificar las etiquetas `<option>` de los `<select>` de **Tipo de Auditoría** para mostrar únicamente el nombre limpio (`Seguimiento 1`, `Renovación`, `Diagnóstico`, `Especial`, etc.) sin añadir `(${t.etapa_ciclo})`.

---

## 2. Archivos Involucrados
- `src/lib/healthCheck.ts` (`AUDITORIAS_NAV_ITEMS`, `VALID_DOMAIN_SUBVIEWS`)
- `src/lib/accessControl.ts` (`normalizeDomainSubview`, `canAccessSubview`, alias `'relacion'` → `'designacion/relacion'`)
- `src/lib/breadcrumb.ts` (`AuditDesignacionSubviewId`, `AUDIT_DESIGNACION_SUBSTEPS`, `AUDIT_CARD_PIPELINE_STEPS`, `normalizeAuditCardSubview`, `buildAuditCardBreadcrumbModel`)
- `src/lib/pipelineEngine.ts` (`STAGE_META_MAP` u orden de etapas si aplica)
- `src/lib/resumenDomain.ts` (`buildResumenSectionCards` / orden 1..7)
- `src/views/header.ts` (menú desplegable `Auditorías` con `Designación` expandible mostrando los 5 subpasos)
- `src/views/auditCardBreadcrumb.ts` (breadcrumb in-card con `1. Designación` y sus 5 subpasos hover/focus: `Relación | Tipo | Fecha | Sitio | Temporal`)
- `src/views/resumenView.ts` y `src/views/auditPipelineSummaryViews.ts` (numeración `1..7`)
- `src/views/designacionTipoView.ts` (línea ~774: eliminar `(${escapeHtml(t.etapa_ciclo)})` en `<select>`)
- `src/views/auditWizardModal.ts` (línea ~831: eliminar `(${escapeHtml(t.etapa_ciclo)})` en `<select>`)
- `src/main.ts` (enrutamiento `#/auditorias/designacion/relacion`, retrocompatibilidad `#/auditorias/relacion`, estado compartido `(selectedCertId, selectedAuditId)`)
- Tests afectados:
  - `src/lib/phase21NavigationShell.test.ts`
  - `src/lib/breadcrumb.test.ts`
  - `src/lib/accessControl.test.ts`
  - `src/lib/pipelineEngine.test.ts`
  - `src/lib/resumenDomain.test.ts`
  - `src/lib/designacionTipoView.test.ts`
  - `src/lib/auditPlannerUi.test.ts`

---

## 3. Especificación Técnica Detallada

### 3.1. Nueva Jerarquía de Bloque 1 (`Auditorías`)
- **Menú principal (`AUDITORIAS_NAV_ITEMS` en `healthCheck.ts`):**
  1. **`designacion`** (`1. Designación`) con `children` en orden estricto:
     - `'designacion/relacion'` → `Relación` (`🔗`)
     - `'designacion/tipo'` → `Tipo` (`🏷️`)
     - `'designacion/fecha'` → `Fecha` (`📅`)
     - `'designacion/sitio'` → `Sitio` (`📍`)
     - `'designacion/temporal'` → `Temporal` (`⏱️`)
  2. `'tiempo'` → `2. Tiempo`
  3. `'auditor'` → `3. Auditor`
  4. `'proceso'` → `4. Proceso`
  5. `'turno'` → `5. Turno`
  6. `'resultado'` → `6. Resultado`
  7. `'revision'` → `7. Revisión`
  8. `'resumen'` → `Resumen` (separador previo si corresponde)

### 3.2. Normalización y Compatibilidad de Rutas (`accessControl.ts`, `breadcrumb.ts`, `main.ts`)
- **`AuditDesignacionSubviewId`:** `'designacion/relacion' | 'designacion/tipo' | 'designacion/fecha' | 'designacion/sitio' | 'designacion/temporal'`.
- **Alias legacy:** si un enlace interno, botón de historial o URL hash apunta a `'relacion'` (o `'#/auditorias/relacion'`), `normalizeDomainSubview` y `normalizeAuditCardSubview` lo resuelven limpiamente a **`'designacion/relacion'`**.
- **`AUDIT_CARD_PIPELINE_STEPS` (`breadcrumb.ts`):** pasa de 8 pasos a **7 pasos numerados** (`1. Designación`, `2. Tiempo`, `3. Auditor`, `4. Proceso`, `5. Turno`, `6. Resultado`, `7. Revisión`) + `Resumen` separado a la derecha.
- Al hacer hover/focus o clic en `1. Designación` dentro de `auditCardBreadcrumb.ts`, los 5 subpasos se muestran en orden: **`Relación | Tipo | Fecha | Sitio | Temporal`**.
- Actualizar cualquier botón `"← 1. Relación"` o `"Continuar a 2. Designación"` en las vistas de Bloque 1 para reflejar **`1. Designación → Relación / Tipo / ...`** y **`2. Tiempo` .. `7. Revisión`**.

### 3.3. Simplificación de Opciones `<select>` de `Tipo`
- En `src/views/designacionTipoView.ts`:
  - Cambiar `<option value="${escapeHtml(t.id)}">${escapeHtml(t.tipo)} (${escapeHtml(t.etapa_ciclo)})</option>` → `<option value="${escapeHtml(t.id)}">${escapeHtml(t.tipo)}</option>`.
- En `src/views/auditWizardModal.ts`:
  - Cambiar `<option value="${escapeHtml(t.id)}">${escapeHtml(t.tipo)} (${escapeHtml(t.etapa_ciclo)})</option>` → `<option value="${escapeHtml(t.id)}">${escapeHtml(t.tipo)}</option>`.
- Verificar mediante `grep -rn "etapa_ciclo" src/views/` que ningún `<select>` de selección de tipo de auditoría adjunte `etapa_ciclo` entre paréntesis (mantener `etapa_ciclo` únicamente si existe en el catálogo maestro `tipoAuditoriaView.ts` donde se administra la tabla `tipo_auditoria`).

---

## 4. Criterios de Aceptación
1. `Relación` vive dentro de `1. Designación` antes de `Tipo`, tanto en el menú superior (`Header`) como en el breadcrumb in-card (`1. Designación > Relación | Tipo | Fecha | Sitio | Temporal`).
2. Los pasos principales quedan numerados `1. Designación` .. `7. Revisión` + `Resumen`.
3. Navegar a `'relacion'` redirige/normaliza a `'designacion/relacion'` sin romper flujos existentes y preservando `(selectedCertId, selectedAuditId)`.
4. En `Designación → Tipo` y en el Wizard `+ Auditoría`, el `<select>` muestra exclusivamente `Seguimiento 1`, `Renovación`, `Diagnóstico`, `Especial`, etc. (sin paréntesis).

---

## 5. Verificación
- `npx tsx --test src/lib/phase21NavigationShell.test.ts src/lib/breadcrumb.test.ts src/lib/accessControl.test.ts src/lib/pipelineEngine.test.ts src/lib/resumenDomain.test.ts src/lib/designacionTipoView.test.ts src/lib/auditPlannerUi.test.ts`
- `npx tsc --noEmit && npm run lint && npm run build`
