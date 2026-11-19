# Step 4.3: `Designación → Sitio` — Vista UI Custom Matrix Selector (`designacionSitioView.ts`) y `src/main.ts`

## 1. Identificador, Nombre y Dependencias
* **Step ID:** `4.3`
* **Nombre Corto (UI):** `Sitio` (bajo `Designación`)
* **Bloque / Sub-sección:** Bloque 1 — `Auditoría` → `Designación` → `Sitio`
* **Dependencias:** `step_4.1.md`, `step_4.2.md`, `step_3.3.md`

---

## 2. Alcance Exacto y Reglas de Negocio
1. **Reemplazo Completo de `<select>` por Selector Matriz Multi-Anual (`SiteCycleMatrixCard`):**
   * En el Detail View de Paso 4 (`#/auditorias/designacion/sitio`), cada certificado del vínculo/campaña renderiza su bloque dedicado de selección de sitios:
     * **Cabecera del Certificado + Toggle Temporal:** Nombre Org · N° Certificado · Norma + **Switch por Auditoría `"¿Incluye Sitio Temporal / Proyecto?"`** (`auditoria.tiene_sitio_temporal`).
     * **Tarjetas de Sitios Candidatos (Responsivas `1440px` y `390px`, cero scroll horizontal):**
       * Izquierda: Checkbox táctil (`min-h-[36px]`), `Sitio 0 (HQ)` o `Sitio #N`, Nombre, Dirección truncada, micro-badges `"Última auditoría: ..."` y `"En ciclo: X/Y"`.
       * Derecha: **Tira de Ciclo Multi-Anual** con flechas `◀ Anterior` / `Siguiente ▶` (`cycleWindowOffset`) que muestran celdas compactas `[2024 ✓] [2025 ✓] [2026 ● Actual] [2027 📅]`.
2. **Protección Multi-Anual en Multi View:** Igual que Paso 3, arranca en **`Próximas a ejecutar`** (`PROXIMAS`) ordenada por `urgency.rank ASC` con advertencia si el usuario edita un ciclo `+1/+3` años.
3. **Navegación Directa Post-Sitio (Paralelismo):**
   * En Zone 3 / acciones del Detail View: botones directos hacia **`Paso 3: Tipo`** (paralelo), **`Paso 5: Temporal`** (habilitado si `tiene_sitio_temporal = TRUE`), **`Paso 6: Tiempo`** y **`Paso 8: Programa`**.

---

## 3. Cambios Exactos en Base de Datos
Ninguno adicional (persiste inserciones/soft-delete en `sitios_por_auditoria` y `UPDATE auditoria.tiene_sitio_temporal`).

---

## 4. Lógica Pura Consumida
* `buildCampaignStep4Rows`, `matchesStep4Preset`, `buildSiteCycleMatrixForAudit`, `sliceCycleWindowColumns`, `canToggleTemporalSiteOff` desde `src/lib/designacionSitioDomain.ts`.

---

## 5. Orquestación UI y Estado (`src/views/designacionSitioView.ts` y `src/main.ts`)

### 5.1 Columnas `table-fixed` + `<colgroup>` (`tableId: 'designacion-sitio-main'`)

| `col.id` | `header` | `defaultWidthPct` | `minWidthPx` | Contenido Celda |
| :--- | :--- | :---: | :---: | :--- |
| `urgencia` | `Ventana` | `15%` | `115` | Badge urgencia (`Próxima 14d`, `Este Año`, `Año +1`) |
| `campania` | `Campaña / Vínculo` | `32%` | `190` | Etiqueta + código + fecha programada |
| `cobertura_sitios` | `Sitios Seleccionados` | `25%` | `170` | `N sitio(s)` totales · `X/Y certs con sede` |
| `temporal` | `Sitio Temp.` | `14%` | `105` | Badge `Activo` (`tiene_sitio_temporal`) vs `No` |
| `estado_paso` | `Estado Sitio` | `14%` | `105` | `Sitio ✓` / `Pendiente` |
| **Total** | | **`100%`** | | **0 botones dentro de `<td>`** |

### 5.2 Estado en `src/main.ts`
```typescript
export interface DesignacionSitioViewState {
  queuePreset: TipoQueuePreset;
  query: string;
  viewMode: UniversalViewMode;
  isSidebarOpen: boolean;
  sortColumn: 'urgencia' | 'campania' | 'cobertura_sitios' | null;
  sortDirection: SortDirection;
  facetSelections: MultiViewSelectionMap;
  selectedProgramId: string | null;
  selectedAuditId: string | null;
  cycleWindowOffsetByAuditId: Record<string, number>;
  editErrorMessage: string | null;
  savingSiteToggleKey: string | null;
}
```
* Handlers en `src/main.ts`:
  * `toggleSiteInAudit(auditId, siteId)`:
    * Si se marca: inserta `sitios_por_auditoria` (`tiempo_auditoria = 0`, `modalidad_evaluacion = 'Presencial'`).
    * Si se desmarca: verifica `canDeselect` (nunca dejar `0` sitios si ya está en pasos posteriores, o archiva mediante `archive_record('sitios_por_auditoria', spId, 'Sitio removido en Paso 4')` respetando `v_guarded_parents`).
  * `toggleAuditTemporalFlag(auditId, nextValue)`:
    * Valida `canToggleTemporalSiteOff` si `nextValue === false`, ejecuta `UPDATE auditoria SET tiene_sitio_temporal = nextValue WHERE id = auditId`.
  * `pageSiteCycleWindow(auditId, delta)`: incrementa/decrementa `cycleWindowOffsetByAuditId[auditId]`.

### 5.3 Especificación Responsive (`390px` vs `1440px`)
* Contenedor raíz de cada tarjeta de sitio: `flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5 p-3 rounded-xl border`.
* Tira de ciclo: `grid grid-cols-3 sm:grid-cols-5 gap-1.5 min-w-0` flanqueada por botones `◀` y `▶` (`w-7 h-7 shrink-0`), `maxVisibleCols = 5` en desktop y `3` en viewport `< 640px` (usando clases `hidden sm:flex` en las columnas extremas para mantener SSR/string-render puro sin depender de `window.innerWidth` al hidratar).

---

## 6. Matriz RBAC del Paso 4.3

| Rol | Vista `Sitio` & Matriz Histórica | Marcar/Desmarcar Sitios & Toggle Temporal |
| :--- | :--- | :--- |
| **`ADMIN`** | Completo | Sí |
| **`WORKER`** | Completo | Sí |
| **`AUDITOR`** | Solo auditorías asignadas | No |
| **`CLIENT`** | Solo certificados de sus orgs | No |

---

## 7. Pruebas Automatizadas
* Test de render verificando `<colgroup>` = `100%`, cero `<button` en `<tbody>`, renderizado sin `<select>` para selección de sitios, y presencia de controles `◀` / `▶` y toggle `tiene_sitio_temporal`.

---

## 8. Criterios de Aceptación (Done Criteria)
- [ ] Subvista `#/auditorias/designacion/sitio` operativa bajo `Designación`.
- [ ] Selector custom de sitios reemplaza completamente `<select>`, mostrando `Sitio 0 HQ` pre-marcado, `"Última auditoría"` y tira de ciclo paginable sin scroll horizontal en `390×844` ni `1440×900`.
- [ ] Override `tiene_sitio_temporal` por auditoría funciona y bloquea desactivación si existen temporales activos.
