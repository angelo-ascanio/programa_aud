# Paso 3.3 — Adopción de Multi View por `Organización` + Pop-up Agrupado en `Tiempo`, `Auditor`, `Proceso`, `Turno`, `Resultado`, `Revisión` y `Resumen`

## 1. Objetivo
Completar la migración de las 7 secciones restantes de Bloque 1 al patrón compartido del **Paso 3.1** (Multi View basada en **`Organización`** + Pop-up con buscador, Col 1 agrupando auditoría vinculada, Col 2 un certificado por fila, Col 3+ columnas específicas del dominio):
7. **`2. Tiempo`** (`tiempoDomain.ts`, `tiempoView.ts`)
8. **`3. Auditor`** (`asignacionDomain.ts`, `asignacionView.ts`)
9. **`4. Proceso`** (`procesoDomain.ts` / `auditPlanningEngine`, `programaProcesosView.ts`)
10. **`5. Turno`** (`turnoDomain.ts` / `auditPlanningEngine`, `programaTurnosView.ts`)
11. **`6. Resultado`** (`resultadoDomain.ts`, `resultadoView.ts`)
12. **`7. Revisión`** (`revisionDomain.ts`, `revisionView.ts`)
13. **`Resumen`** (`resumenDomain.ts`, `resumenView.ts`)

---

## 2. Archivos Involucrados
- `src/lib/tiempoDomain.ts` y `src/views/tiempoView.ts`
- `src/lib/asignacionDomain.ts` y `src/views/asignacionView.ts`
- `src/views/programaProcesosView.ts`
- `src/views/programaTurnosView.ts`
- `src/lib/resultadoDomain.ts` y `src/views/resultadoView.ts`
- `src/lib/revisionDomain.ts` y `src/views/revisionView.ts`
- `src/lib/resumenDomain.ts` y `src/views/resumenView.ts`
- `src/main.ts` (estado `pickerOrgId` + `pickerSearchQuery` y handlers unificados para las 7 secciones)
- Tests asociados (`tiempoView.test.ts`, `asignacionView.test.ts`, `programaProcesosView.test.ts`, `auditPhase5Views.test.ts`, `resumenDomain.test.ts`, `auditMultiViews.test.ts`)

---

## 3. Especificación Técnica Detallada por Sección

Cada sección conserva sus facetas reactivas de dominio, su botón `+ Auditoría` para staff y el filtrado estricto de `AUDITOR` / `CLIENT` (Nivel 2), adaptando tanto la tabla/tarjetas raíz de **`Organización`** como las columnas del **Pop-up**:

| Sección | Columnas Extra del Multi View (Organización) | Columnas Específicas del Pop-up (después de Col 1 Vinculada y Col 2 Certificado) |
| :--- | :--- | :--- |
| **`2. Tiempo`** | Certificados, Tiempo Total Org (`días`), Estado Tiempo | Col 3: `Última Auditoría` · Col 4: `Sitios / Temporal` · Col 5: `Tiempo Total (d)` |
| **`3. Auditor`** | Certificados, Cobertura Equipo (`asignado/requerido`), Alertas (incluyendo brecha IAF / expertos) | Col 3: `Última Auditoría` · Col 4: `Equipo / Experto(s)` · Col 5: `Cobertura Días` |
| **`4. Proceso`** | Certificados, Procesos Cubiertos, Estado Cobertura | Col 3: `Última Auditoría` · Col 4: `Sitios / Procesos` · Col 5: `Estado` |
| **`5. Turno`** | Certificados, Cobertura Turnos, Estado Matriz | Col 3: `Última Auditoría` · Col 4: `Turnos Asignados` · Col 5: `Estado` |
| **`6. Resultado`** | Certificados, Fechas Reales, NCs Abiertas / Hallazgos | Col 3: `Última Auditoría` · Col 4: `Fechas Reales` · Col 5: `Hallazgos / NCs` |
| **`7. Revisión`** | Certificados, Revisadas / Pendientes QA | Col 3: `Última Auditoría` · Col 4: `Fecha Revisión` · Col 5: `Estado QA` |
| **`Resumen`** | Certificados, Avance Global %, Estatus Auditoría | Col 3: `Última Auditoría` · Col 4: `Avance (X/7)` · Col 5: `Estatus Auditoría` |

- **Invariantes del Pop-up en las 7 secciones:**
  - Barra de búsqueda interna reactiva (`search-org-picker-modal`) dentro del diálogo.
  - Columna 1 (`Auditoría Vinculada`) agrupando filas contiguas cuando ≥ 2 certificados pertenecen al mismo lote/auditoría vinculada (`rowspan` recalculado dinámicamente al buscar).
  - Columna 2 (`Certificado`) siempre **1 certificado por fila**.
  - Clic en cualquier fila abre inmediatamente la Vista Detalle de la sección con `(selectedCertId, selectedAuditId)` seleccionados.
  - Mantener `table-fixed`, `<colgroup>` sumando `100%` y `0 <button>` dentro de `<tbody>`.

---

## 4. Criterios de Aceptación
1. Las **13 secciones totales** (`Vínculo` + los 12 ítems de Bloque 1) comparten exactamente la misma experiencia unificada: Multi View por **`Organización`** (Grid + List + filtros + búsqueda) → **Pop-up** con buscador y tabla agrupada por auditoría vinculada → **Vista Detalle** del certificado.
2. En `3. Auditor`, las alertas de brecha IAF o presencia de expertos técnicos son visibles y buscables desde la Multi View / Pop-up.
3. Cero regresiones en RBAC (`ADMIN`, `WORKER`, `AUDITOR`, `CLIENT` Nivel 2), Zero-UUID y `0 any`.

---

## 5. Verificación
- `npx tsx --test src/lib/tiempoView.test.ts src/lib/asignacionView.test.ts src/lib/programaProcesosView.test.ts src/lib/auditPhase5Views.test.ts src/lib/resumenDomain.test.ts src/lib/auditMultiViews.test.ts`
- `npx tsc --noEmit && npm run lint && npm run build`
