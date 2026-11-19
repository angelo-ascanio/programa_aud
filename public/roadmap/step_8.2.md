# Step 8.2: `Programa` — Mini-Paso 8A (`Procesos` por Sitio con Tarjetas Históricas y Drawer Colapsable)

## 1. Identificador, Nombre y Dependencias
* **Step ID:** `8.2`
* **Nombre Corto (UI):** `Programa` → Mini-Paso **8A `Procesos`**
* **Bloque / Sub-sección:** Bloque 1 — `Auditoría` → `Programa`
* **Dependencias:** `step_8.1.md`, `step_6.2.md`

---

## 2. Alcance Exacto y Reglas de Negocio
1. **Multi View por Auditoría Individual (`tableId: 'programa-main'`):**
   * Lista cada auditoría de certificado que completó Pasos 3 + 4.
   * Facets reactivos: **`Pendientes de Procesos`**, **`Pendientes de Turnos`**, **`Completos`**, más `Norma` y `Con procesos nunca auditados`.
2. **Detail View con Selector de Mini-Pasos `[ 8A · Procesos ]` → `[ 8B · Turnos ]`:**
   * En Zone 1: Chip navegable al Vínculo/Campaña grupal (`← Volver al Vínculo Grupal`) + Chip a `Certificado` (para `ADMIN`/`WORKER`/`CLIENT`) + **Pipeline Stepper Bar**.
   * **Dentro de Mini-Paso 8A (`Procesos`):**
     * Agrupa por cada sitio seleccionado en Paso 4 (`Sitio 0 HQ`, `Sitio #1`, ...).
     * Barra de **Acciones Rápidas por Sitio**:
       * `"Seleccionar todos los Medulares"`
       * `"Seleccionar no auditados en el último año"`
       * `"Copiar del ciclo anterior"`
     * **Tarjetas Enriquecidas de Proceso (sin `<select>`, 100% responsivas en `390px` y `1440px`):**
       * Restringidas estrictamente a `procesos_por_sitio`.
       * **Fila superior:** Checkbox + Nombre del proceso + Badge de clasificación (`Estratégico`, `Medular`, `De Apoyo`, `Otro`) + Alerta histórica: **`⚠️ Nunca auditado`** (rosa/ámbar) o **`Hace N años (Tipo · Año)`** + **`Auditado X de Y veces`**.
       * **Fila inferior:** Mini-tira de ciclo (`Año -2 ✓`, `Año -1 —`, `Actual ●`, `Año +1 📅`) con flechas `◀ / ▶` + botón toggle **`"📂 Ver Programa Anterior / Futuro"`**.
       * **Drawer Colapsable Inline:** Al expandirse, muestra exactamente qué turnos y auditores evaluaron ese proceso en la visita anterior o preprogramada futura, sin abandonar la selección actual.

---

## 3. Cambios Exactos en Base de Datos
Ninguno adicional (`INSERT` en `procesos_sitio_auditoria`, `archive_record('procesos_sitio_auditoria', ...)` al desmarcar si no tiene turnos/hallazgos bloqueantes).

---

## 4. Lógica Pura Consumida
* `buildAuditProgramaSummaryRows`, `buildProcessHistoryForSite`, `computeQuickProcessSelectionIds` desde `src/lib/programaCertificadoDomain.ts`.
* `sliceCycleWindowColumns` desde `src/lib/designacionSitioDomain.ts`.

---

## 5. Orquestación UI y Estado (`src/views/programaView.ts`, `src/views/programaProcesosView.ts` y `src/main.ts`)

### 5.1 Columnas `table-fixed` + `<colgroup>` (`tableId: 'programa-main'`)

| `col.id` | `header` | `defaultWidthPct` | `minWidthPx` | Contenido Celda |
| :--- | :--- | :---: | :---: | :--- |
| `certificado` | `Certificado & Org` | `30%` | `185` | N° Certificado · Organización · Norma |
| `campania` | `Vínculo / Fecha` | `24%` | `155` | Etiqueta vínculo · Fecha programada |
| `procesos` | `8A · Procesos` | `18%` | `125` | `N procesos` · Badge `⚠️ M nunca aud.` |
| `turnos` | `8B · Turnos` | `14%` | `110` | `K turnos asignados` |
| `estado` | `Estado Programa` | `14%` | `115` | `Pend. Procesos` / `Pend. Turnos` / `Completo ✓` |
| **Total** | | **`100%`** | | **0 botones dentro de `<td>`** |

### 5.2 Estado y Handlers en `src/main.ts`
```typescript
export interface ProgramaViewState {
  query: string;
  viewMode: UniversalViewMode;
  isSidebarOpen: boolean;
  sortColumn: 'certificado' | 'procesos' | 'turnos' | 'estado' | null;
  sortDirection: SortDirection;
  facetSelections: MultiViewSelectionMap;
  selectedAuditId: string | null;
  activeMiniStep: 'procesos' | 'turnos';
  cycleWindowOffsetByAuditId: Record<string, number>;
  openHistoryDrawerProcessIds: string[];
  editErrorMessage: string | null;
}
```
* Handlers:
  * `toggleProcessInAuditSite(sitePlanId, ppsLinkId, procesoId)`: inserta/archiva en `procesos_sitio_auditoria`.
  * `applyQuickProcessSelection(sitePlanId, preset)`: inserta en lote los IDs retornados por `computeQuickProcessSelectionIds`.
  * `toggleProcessHistoryDrawer(key)`: abre/cierra el drawer inline del proceso.

---

## 6. Matriz RBAC del Paso 8.2

| Rol | Ve Multi View y Mini-Paso 8A | Marca Procesos / Acciones Rápidas |
| :--- | :--- | :--- |
| **`ADMIN`** | Todos | Sí |
| **`WORKER`** | Todos activos | Sí |
| **`AUDITOR`** | Solo auditorías asignadas | No (solo lectura) |
| **`CLIENT`** | Solo sus certificados | No (solo lectura) |

---

## 7. Pruebas Automatizadas
* Test de render de `programaProcesosView`: verifica `<colgroup>` = `100%`, cero `<button` en `<tbody>`, presencia de badges `"Nunca auditado"` y botones `"Seleccionar todos los Medulares"` / `"Copiar del ciclo anterior"`, sin scroll horizontal.

---

## 8. Criterios de Aceptación (Done Criteria)
- [ ] Subvista `#/auditorias/programa` muestra el paso individual por certificado.
- [ ] Mini-Paso 8A restringe selección a `procesos_por_sitio`, muestra historial multi-anual + drawer colapsable y soporta acciones rápidas.
- [ ] Cero `<select>` para selección de procesos; layout limpio en `390×844` y `1440×900`.
