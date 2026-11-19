# Step 7.2: `Asignación` — Vista UI (`src/views/asignacionView.ts`) con Barras de Conciliación y `src/main.ts`

## 1. Identificador, Nombre y Dependencias
* **Step ID:** `7.2`
* **Nombre Corto (UI):** `Asignación`
* **Bloque / Sub-sección:** Bloque 1 — `Auditoría` → `Asignación`
* **Dependencias:** `step_7.1.md`, `step_6.2.md`

---

## 2. Alcance Exacto y Reglas de Negocio
1. **Multi View Clean List (`tableId: 'asignacion-main'`):**
   * Facets reactivos:
     * `Cuadre de Equipo`: **`Sin asignar`**, **`Descuadrado`**, **`Completo`**.
     * `Alertas`: `Con conflicto de calendario`, `Alerta rotación Líder`, `Competencia parcial`.
2. **Detail View Operativo de Conciliación Multi-Auditor (`asignacionView.ts`):**
   * Muestra una sección por cada **Sitio Regular** (agrupado por Certificado) y una sección destacada por cada **Sitio Temporal** activo (Paso 5).
   * Cada tarjeta de sitio incluye:
     * **Barra de Progreso de Conciliación:** `"Asignado 2.00 d / Requerido 3.00 d (67% · Falta 1.00 d)"` en verde (`bg-emerald-600`) al llegar al `100%` exacto, ámbar cuando falta, o rojo ante desfase.
     * Lista de auditores asignados al sitio con su rol (`Auditor Líder`, `Auditor`, `Experto Técnico`, `Auditor en Entrenamiento`), tiempo `0.25d`, badge de competencia (`✓ Calificado (ISO 9001 · IAF 17)` vs `⚠ Falta IAF`) y aviso de rotación ISO 17021-1 si aplica.
     * Formulario rápido inline para añadir otro auditor al mismo sitio (pre-rellenando el restante `requiredDays - assignedDays`) o ajustar su tiempo en pasos de `0.25d`.

---

## 3. Cambios Exactos en Base de Datos
Ninguno adicional (`equipo_auditor_sitio` y `equipo_auditor_sitio_temporal`).

---

## 4. Lógica Pura Consumida
* `buildCampaignAsignacionRows`, `evaluateAuditorCompetencyMatch`, `validateAuditorTimeAssignment` desde `src/lib/asignacionDomain.ts`, más `detectAuditorScheduleConflicts` desde `src/lib/auditAlertsEngine.ts`.

---

## 5. Orquestación UI y Estado (`src/views/asignacionView.ts` y `src/main.ts`)

### 5.1 Columnas `table-fixed` + `<colgroup>` (`tableId: 'asignacion-main'`)

| `col.id` | `header` | `defaultWidthPct` | `minWidthPx` | Contenido Celda |
| :--- | :--- | :---: | :---: | :--- |
| `campania` | `Campaña / Vínculo` | `30%` | `185` | Etiqueta + fecha programada + urgencia |
| `progreso` | `Cobertura Días` | `24%` | `160` | Barra visual `Asignado X.XXd / Req Y.YYd` |
| `equipo` | `Equipo Asignado` | `24%` | `165` | Nombres truncados + rol líder |
| `alertas` | `Competencia / Conflictos` | `10%` | `95` | Badge `OK` o `⚠ Alerta` |
| `estado` | `Conciliación` | `12%` | `105` | `Sin asignar` / `Descuadrado` / `Completo ✓` |
| **Total** | | **`100%`** | | **0 botones dentro de `<td>`** |

### 5.2 Estado y Handlers en `src/main.ts`
```typescript
export interface AsignacionViewState {
  query: string;
  viewMode: UniversalViewMode;
  isSidebarOpen: boolean;
  sortColumn: 'campania' | 'progreso' | 'estado' | null;
  sortDirection: SortDirection;
  facetSelections: MultiViewSelectionMap;
  selectedProgramId: string | null;
  draftTargetKind: 'REGULAR' | 'TEMPORAL';
  draftTargetId: string | null;
  draftAuditorId: string;
  draftRol: AuditorSiteRole;
  draftDays: string;
  editErrorMessage: string | null;
}
```
* Handlers: `upsertRegularSiteAuditor(...)`, `archiveRegularSiteAuditor(...)`, `upsertTemporalSiteAuditor(...)`, `archiveTemporalSiteAuditor(...)` (todos mediante RPC `archive_record` para bajas lógicas).

---

## 6. Matriz RBAC del Paso 7.2

| Rol | Vista `Asignación` | Mutación Equipo & Tiempos |
| :--- | :--- | :--- |
| **`ADMIN`** | Completo | Sí |
| **`WORKER`** | Completo | Sí |
| **`AUDITOR`** | Solo auditorías asignadas | No |
| **`CLIENT`** | Solo sus certificados | No |

---

## 7. Pruebas Automatizadas
* Test de render de `renderAsignacionView`: verifica `<colgroup>` = `100%`, cero `<button` en `<tbody>`, barras de progreso `Asignado X.XX d / Requerido Y.YY d`, y ausencia total de UUIDs.

---

## 8. Criterios de Aceptación (Done Criteria)
- [ ] Subvista `#/auditorias/asignacion` operativa.
- [ ] Permite asignar 1 o N auditores por sitio regular y por sitio temporal con precisión `0.25d` hasta cuadrar exactamente al `100%`.
- [ ] Muestra alertas de competencia IAF/Norma, conflicto de calendario y rotación de Auditor Líder.
