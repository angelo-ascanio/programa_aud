# Step 6.2: `Tiempo` — Vista UI (`src/views/tiempoView.ts`) con Steppers `0.25d`, Resumen Temporal y `src/main.ts`

## 1. Identificador, Nombre y Dependencias
* **Step ID:** `6.2`
* **Nombre Corto (UI):** `Tiempo`
* **Bloque / Sub-sección:** Bloque 1 — `Auditoría` → `Tiempo`
* **Dependencias:** `step_6.1.md`, `step_5.2.md`

---

## 2. Alcance Exacto y Reglas de Negocio
1. **Multi View Clean List (`tableId: 'tiempo-main'`):**
   * Filtros / Facets reactivos:
     * `Estado Tiempo`: **`Incompletos`** (`unallocatedSitesTotal > 0`) vs **`Completos`** (`unallocatedSitesTotal === 0`).
     * `Sitio Temporal`: `Con sitio temporal` vs `Solo sitios permanentes`.
     * `Ventana`: buckets de urgencia (`Vencida`, `Próxima`, `Este Año`, ...).
2. **Detail View Operativo por Certificado + Sitio:**
   * Zone 1: Chips padre (`Conglomerado`, `Vínculo`) + **Pipeline Stepper Bar** destacando **`Tiempo`**.
   * Banner Superior de Presupuesto Total: `Sitios Regulares: X.XX d` + `Sitios Temporales (Paso 5): Y.YY d` = `Total Campaña: Z.ZZ días-auditor`.
   * Por cada Certificado en el vínculo:
     * Lista cada sitio seleccionado en Paso 4 (`Sitio 0 HQ` primero) con control **Stepper `[-0.25] [ input 0.25 ] [+0.25]`** y select rápido de modalidad (`Presencial` / `Remota` / `Mixta`) si se requiere.
     * Sub-resumen por certificado: `Total certificado: 4.00 d` + chips informativos de cualquier `Sitio Temporal` atribuido en Paso 5 (con enlace directo `"Editar en Temporal →"`).
   * Acciones cruzadas al completar un sitio/certificado: botones directos **"Ir a Paso 7: Asignación →"** y **"Ir a Paso 8: Programa →"**.

---

## 3. Cambios Exactos en Base de Datos
Ninguno adicional (`UPDATE public.sitios_por_auditoria SET tiempo_auditoria = ...`).

---

## 4. Lógica Pura Consumida
* `buildCampaignTiempoRows`, `validateSiteTimeUpdate` desde `src/lib/tiempoDomain.ts`.

---

## 5. Orquestación UI y Estado (`src/views/tiempoView.ts` y `src/main.ts`)

### 5.1 Columnas `table-fixed` + `<colgroup>` (`tableId: 'tiempo-main'`)

| `col.id` | `header` | `defaultWidthPct` | `minWidthPx` | Contenido Celda |
| :--- | :--- | :---: | :---: | :--- |
| `campania` | `Campaña / Vínculo` | `30%` | `185` | Etiqueta + fecha programada + urgencia |
| `sitios` | `Sitios` | `14%` | `100` | `N sitio(s)` (`X con tiempo`) |
| `regular` | `Días Sitios` | `16%` | `110` | `X.XX d` (`tabular-nums`, derecha) |
| `temporal` | `Días Temp.` | `14%` | `100` | `Y.YY d` o `—` (`tabular-nums`, derecha) |
| `total` | `Total Camp.` | `12%` | `100` | `Z.ZZ d` (`font-bold`, derecha) |
| `estado` | `Estado` | `14%` | `115` | Badge `Incompleto (N sitios en 0d)` vs `Completo ✓` |
| **Total** | | **`100%`** | | **0 botones dentro de `<td>`** |

### 5.2 Estado y Handlers en `src/main.ts`
```typescript
export interface TiempoViewState {
  query: string;
  viewMode: UniversalViewMode;
  isSidebarOpen: boolean;
  sortColumn: 'campania' | 'total' | 'estado' | null;
  sortDirection: SortDirection;
  facetSelections: MultiViewSelectionMap;
  selectedProgramId: string | null;
  draftTimeBySitePlanId: Record<string, string>;
  savingSitePlanId: string | null;
  editErrorMessage: string | null;
}
```
* Handler `saveSiteAuditTime(sitePlanId, nextDays)`:
  * Valida `validateSiteTimeUpdate(nextDays, siteName)`.
  * Ejecuta `UPDATE public.sitios_por_auditoria SET tiempo_auditoria = nextDays WHERE id = sitePlanId`.
  * Refresca `programacionAudits` y re-evalúa estado para desbloquear `Asignación` (Paso 7).

---

## 6. Matriz RBAC del Paso 6.2

| Rol | Acceso `Tiempo` | Editar `0.25d` por Sitio |
| :--- | :--- | :--- |
| **`ADMIN`** | Completo | Sí |
| **`WORKER`** | Completo | Sí |
| **`AUDITOR`** | Solo auditorías asignadas | No (solo lectura) |
| **`CLIENT`** | Solo sus certificados | No (solo lectura) |

---

## 7. Pruebas Automatizadas
* Test de render de `renderTiempoView`: `<colgroup>` suma `100%`, cero `<button` en `<tbody>`, steppers `0.25d` presentes para `ADMIN`/`WORKER` y ocultos para `CLIENT`/`AUDITOR`.

---

## 8. Criterios de Aceptación (Done Criteria)
- [ ] Subvista `#/auditorias/tiempo` operativa filtrando únicamente auditorías con Pasos 3 + 4 completos.
- [ ] Steppers `0.25d` persisten tiempo por sitio y actualizan `auditoria.tiempo_auditoria` automáticamente.
- [ ] Resumen combinado incluye tiempo de sitios regulares + sitios temporales de Paso 5 sin doble conteo.
