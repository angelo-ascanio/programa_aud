# Step 2.2 — Vista UI "Less Is More" de `Designación → Sitio`: Tarjeta Única Colapsada por Defecto, Filtros, Entero N y Ordenamiento

**Pilar:** 2 (`Auditoría > Designación > Sitio` Overhaul e Integración de Sitios Compartidos)  
**Dependencias:** `step_2.1.md`  
**Objetivo:** Refactorizar `src/views/designacionSitioView.ts` para dejar una Detail View ultra-limpia, directa y escalable a **30–80+ sitios** (propios y compartidos), alineada con la sobriedad de `designacionFechaView.ts`.

---

## 1. Archivos a Modificar

- `src/views/designacionSitioView.ts`
- `src/views/designacionSitioView.test.ts`

---

## 2. Especificación Técnica Detallada

### 2.1 Estado de Vista (`DesignacionSitioViewState`)
Extender `DesignacionSitioViewState` y `DEFAULT_DESIGNACION_SITIO_STATE` en `src/views/designacionSitioView.ts`:
```typescript
export interface DesignacionSitioViewState {
  // ...campos Multi View y modales existentes...
  /** Mapa por `${certId}::${auditId}` (o `${auditId}`): por defecto FALSE (colapsada) */
  isSitePanelExpandedByAuditId: Record<string, boolean>;
  /** Filtro activo dentro de la tarjeta del certificado activo */
  detailFilterMode: SitioDetailFilterMode;       // default: 'ALL'
  /** Entero N >= 0 cuando detailFilterMode === 'NOT_AUDITED_LAST_N' */
  notAuditedLastN: number;                       // default: 1
  /** Ordenamiento activo dentro de la tarjeta */
  detailSortMode: SitioDetailSortMode;           // default: 'SITE_NUMBER'
  /** Búsqueda rápida inline para listas de 30–80+ sitios */
  detailSearchQuery: string;                     // default: ''
}
```
- **Regla de Colapso por Defecto:** `const isExpanded = Boolean(state.isSitePanelExpandedByAuditId[activeAudit.id]);` — siempre **`false` por defecto** al abrir la Detail View o cambiar de certificado/auditoría.

### 2.2 Arquitectura Visual "Less Is More" de `renderSitioDetailView`
Mantener intacta la estructura superior de `renderAuditSectionShell(..., { compactMode: true })`:
1. **Franja 1 (Shell):** Navegación temporal entre auditorías del certificado (`◀ / <select> / ▶`).
2. **Franja 2 (Shell):** Selector de certificados hermanos del vínculo (`linkedSiblings`, solo cuando `siblingsCount > 1`).
3. **Zona Central (`bodyHtml`) — UNA SOLA TARJETA (Certificado Activo):**
   - **Eliminar** el bucle `linkedModels.map(...)` que apilaba todas las tarjetas hermanas. Renderizar **exclusivamente `activeModel`**.
   - **Eliminar** el toolbar superior redundante (`sitio-editor-toolbar` con `"Sitios por Auditoría Vinculada"` y pill `"N vinculadas · Asignación individual"`), y eliminar badge redundante `"Activa"`.
   - Renderizar un único contenedor limpio `data-testid="sitio-active-audit-card"` con dos estados:

#### Estado A — Colapsado por Defecto (`!isExpanded`)
Una barra única compacta, clickeable y sin ruido:
```text
[ ▶ ]  CERT-IND-01 · ISO 9001   3 / 42 sitios   [ Cobertura ]
```
- Botón/área toggle `data-action="toggle-sitio-panel-collapse"` con `aria-expanded="false"` y chevron `▶`.
- Conteo sobrio (`selectedCount / totalSitesCount sitios`) en `tabular-nums`.
- Botón compacto `Cobertura` (`data-action="open-sitio-coverage-modal"`) con `e.stopPropagation()` para abrir la matriz multi-ciclo sin distraer ni saturar la pantalla principal.

#### Estado B — Expandido (`isExpanded === true`)
Misma cabecera (`aria-expanded="true"`, chevron `▼`) + cuerpo limpio dividido en:
1. **Barra Compacta de Filtro + Ordenamiento + Búsqueda:**
   - **Filtro (`<select id="sitioDetailFilterSelect" data-action="change-sitio-detail-filter">`):**
     - `ALL`: `Todos`
     - `SELECTED`: `Seleccionados`
     - `UNSELECTED`: `No seleccionados`
     - `LINK_SELECTED`: `Seleccionados en vínculo` (renderizada solo cuando `siblingsCount > 1` o siempre disponible con conteo/etiqueta limpia)
     - `NOT_AUDITED_LAST_N`: `No auditados en últimas N`
     - `SHARED_ONLY`: `Solo compartidos` (solo si el certificado tiene `>= 1` sitio compartido)
     - `UNVISITED_CYCLE`: `Nunca auditados`
   - **Input Entero N (condicional — visible SOLO cuando `detailFilterMode === 'NOT_AUDITED_LAST_N'`):**
     - `<input id="sitioNotAuditedLastNInput" type="number" min="0" step="1" data-action="change-sitio-last-n" value="${state.notAuditedLastN}" ... />`
     - Etiqueta mínima junto al input: `N` (o `Últimas` / `0 = todos`).
   - **Orden (`<select id="sitioDetailSortSelect" data-action="change-sitio-detail-sort">`):**
     - `SITE_NUMBER`: `N° de sitio`
     - `SELECTED_FIRST`: `Seleccionados primero`
     - `LEAST_RECENTLY_AUDITED`: `Más antiguos / Sin visitar`
     - `PERSONAL_DESC`: `Mayor personal`
     - `NAME_ASC`: `Nombre (A–Z)`
   - **Filtro de texto rápido (cuando `totalSitesCount >= 8`):**
     - `<input id="sitioDetailQuickSearch" type="search" data-action="change-sitio-detail-search" placeholder="Filtrar sede..." ... />`
   - **Indicador de conteo discreto a la derecha:** `Mostrando ${visibleItems.length} de ${totalSitesCount}`.

2. **Grilla de Sitios Ultra-Compacta (Escalable a 30–80+ Sitios):**
   - Contenedor con altura controlada y scroll interno amigable cuando supera ~16 filas (`max-h-[540px] overflow-y-auto pr-1`) para evitar scroll infinito de página, manteniendo checkboxes accesibles.
   - Cada fila (`renderSiteAssignmentRow`, `min-h-[38px] px-2.5 py-1.5`):
     - Checkbox (`data-action="toggle-step4-site"`, deshabilitado solo si `HQ_MANDATORY`, `MIN_ONE_SITE`, `READ_ONLY` o guardando).
     - Línea 1: `Sitio 0` / `#N` (mono) + `nombre_sitio` (truncate) + si `isSharedSite` micro-etiqueta discreta `Compartido` (con `title` mostrando `sharedFromCertLabel`) + si `personalCount !== null` dato compacto `${personalCount} pers.`
     - Línea 2 (discreta `text-[11px] text-slate-500 truncate`): `direccion_sitio` (sin repetir tags pesados).
     - Lado derecho (máximo 1 indicador minimalista): `🔒 HQ` (si HQ), `Guardando...`, o vacío/sutil `en vínculo` si aplica sin saturar de pills.
   - Si `visibleItems.length === 0` tras aplicar filtros, mostrar estado vacío limpio de 1 línea + link/botón discreto `Limpiar filtros` (`data-action="reset-sitio-detail-filters"`).

### 2.3 Revisión de Multi View (`renderSitioMultiView`)
- Mantener la tabla Multi View conforme a `public/certificado/` (`table-fixed`, `<colgroup>` 100%, `0 <button>` dentro de `<tbody>`), asegurando que el conteo `Sitios Asignados` incluye tanto sitios propios como sitios compartidos integrados en el certificado.

### 2.4 Revisión del Modal de Cobertura (`renderCoverageModalHtml`)
- Mantener `table-fixed` `<colgroup>` 100% y asegurar que filas de sitios compartidos muestren su `numero_sitio` efectivo en el certificado activo y una marca sutil `Compartido` cuando corresponda.

---

## 3. Checklist de Implementación

1. [ ] Actualizar `DesignacionSitioViewState` y `DEFAULT_DESIGNACION_SITIO_STATE` en `src/views/designacionSitioView.ts`.
2. [ ] Refactorizar `renderSitioDetailView` para renderizar **únicamente `activeModel`** en una tarjeta colapsable por defecto (`isSitePanelExpandedByAuditId`).
3. [ ] Implementar la cabecera compacta colapsada/expandida con botón `Cobertura` y conteo `X / Y sitios`.
4. [ ] Implementar la barra de filtro (`<select>`), input entero `N` condicional (`type="number" min="0" step="1"`), `<select>` de ordenamiento y búsqueda rápida inline.
5. [ ] Simplificar `renderSiteAssignmentRow` (layout limpio, menos texto, soporte visual discreto para `isSharedSite` y `personalCount`).
6. [ ] Actualizar y ampliar `src/views/designacionSitioView.test.ts` verificando:
   - Colapsado por defecto al entrar.
   - Solo se renderiza 1 tarjeta de certificado (no todas las hermanas apiladas).
   - Al expandir, aparecen `<select>` de filtro, `<select>` de ordenamiento y filas compactas incluyendo sitios compartidos.
   - Input numérico `N` visible únicamente cuando `detailFilterMode === 'NOT_AUDITED_LAST_N'`.
   - Cero UUIDs en todo el HTML renderizado.

---

## 4. Criterios de Verificación y Aceptación

- **Tests de vista (`node:test`):**
  ```bash
  npx tsx --test src/views/designacionSitioView.test.ts
  ```
- **Aserciones clave:**
  - Con auditorías vinculadas de 3 certificados, `data-testid="sitio-audit-section"` aparece exactamente **1 vez** (el certificado activo).
  - Por defecto `aria-expanded="false"` y las filas `data-testid="sitio-assignment-row"` no se renderizan hasta expandir.
  - Al expandir con `detailFilterMode: 'NOT_AUDITED_LAST_N'`, `#sitioNotAuditedLastNInput` existe con `min="0"` y `step="1"`.
  - Cero pills innecesarios, cero banners verbosos y cero UUIDs visibles.
