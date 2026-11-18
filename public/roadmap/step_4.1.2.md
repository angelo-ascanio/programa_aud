# Step 4.1.2 — Paso 2 Visual (`auditPlannerView.ts` Parte 2): Constructor Árbol/Acordeón, Fluidez DOM y `auditPlannerUi.test.ts`

## Objetivo
Completar el **Constructor Visual Tipo Árbol / Acordeón (`Certificado → Sitios → Procesos del Sitio → 1..N Turnos → Auditores + Días 0.25d`)** dentro de `src/views/auditPlannerView.ts`, conectar sus interacciones en `src/main.ts` con preservación de scroll/foco/acordeones abiertos (**Zero-Flicker**), asegurar renderizado limpio en `'read'` para los 4 roles y validar integralmente con `src/lib/auditPlannerUi.test.ts`.

---

## Archivos a Modificar / Crear
- **Modificar:** `src/views/auditPlannerView.ts` (Parte 2: `renderAuditVisualPlanner` con los 3 niveles del árbol + modo `'read'`)
- **Modificar:** `src/main.ts` (listeners del árbol: incluir/excluir sitio, steppers `0.25d` Cubo 1 y Cubo 2, checkboxes `procesos_por_sitio`, chips `1..N` `turnos_proceso_sitio_auditoria`, botón rápido *"Asignar a todo el Sitio"*, chips granulares `equipo_auditor_proceso_sitio`, preservación de `expandedSiteIds`, scroll y foco)
- **Crear / Ampliar:** `src/lib/auditPlannerUi.test.ts`

---

## Especificación Técnica Detallada

### 1. Nivel 1 del Árbol — Nodos de `Sitio` (`sortSitesWithPrincipalFirst`, Sitio 0 primero)
- Acordeón expandible (`state.auditPlanning.expandedSiteIds`) por cada `sitio` del certificado:
  - Switch de inclusión (`sitios_por_auditoria`, usando `archive_record` si se excluye con dependencias).
  - `Sitio #{numero_sitio} · {nombre_sitio}`, conteo de `procesos_por_sitio` y `turnos_por_sitio`.
  - Input Cubo 1 (`tiempo_auditoria` en pasos de `0.25d` con botones `-0.25` / `+0.25`) + selector opcional de modalidad en sede (`Presencial` / `Remota` / `Mixta`) + badge de cuadre del sitio (`{assigned}d / {required}d`).

### 2. Nivel 2 del Árbol — `Procesos del Sitio` + Chips de `Turnos` (`1..N`)
- **Guardia de sitio vacío:** si `site.procesos_por_sitio` está vacío, aviso `"Este sitio aún no tiene procesos vinculados en Certificación"` con botón de salto contextual `→ Ir al Sitio` (empujando breadcrumb hacia `Sitio` pestaña `'procesos'`).
- Checklist alimentada estrictamente por `procesos_por_sitio`:
  - Al marcar un proceso (`procesos_sitio_auditoria`), despliega debajo sus **chips multi-selección de `turnos_por_sitio`** (`turnos_proceso_sitio_auditoria`, permitiendo `1..N` turnos simultáneos por proceso).
  - Indicador no bloqueante `"⚠️ Selecciona al menos 1 turno"` si el proceso está marcado sin chips activos.

### 3. Nivel 3 del Árbol — Asignación Dual de Auditores + Días por Sitio (Cubo 2)
1. **Bloque "Equipo en este Sitio y Días Asignados (Cubo 2)" (`equipo_auditor_sitio`):**
   - Selector de auditor competente (con alertas de calificación, rotación y conflicto de agenda) + Rol (`AUDITOR_LIDER`, `AUDITOR`, `AUDITOR_EN_ENTRENAMIENTO`, `EXPERTO_TECNICO`) + botón `+ Añadir al Sitio`.
   - Por cada auditor añadido al sitio:
     - Input numérico / steppers **`0.25d`** para su `tiempo_auditoria` en este sitio (permitiendo p.ej. `2.00d` en Sitio 0 y `1.50d` en Sitio 1, sumando `3.50d` totales).
     - **Botón/Switch Modo Rápido (1 Clic): `"Asignar a todo el Sitio"`** (`asignacion_completa_sitio = TRUE`).
2. **Bloque "Cobertura Granular por Proceso" (`equipo_auditor_proceso_sitio`):**
   - Junto a cada proceso seleccionado: auditores con `asignacion_completa_sitio = TRUE` como pill heredado (`"✓ {Nombre} (Todo el sitio)"`) + chips/botón `+ Auditor` para co-evaluación M:N sin exclusividad 1:1.
   - Indicador no bloqueante `"⚠️ Sin auditor asignado"` si el proceso carece de cobertura.

### 4. Regla de Fluidez DOM (Zero-Flicker) y Modo `'read'`
- Al mutar steppers `0.25d` o chips del árbol en `src/main.ts`, actualizar en memoria, recalcular el HUD y preservar `expandedSiteIds`, posición de scroll del contenedor y foco del control editado.
- En `'read'` (incluyendo `AUDITOR` y `CLIENT`), mostrar la matriz `Sitio → Proceso → Turnos → Auditores + Días` en visualización limpia de solo lectura, sin botones mutadores ni fugas Nivel 2.

---

## Pruebas Unitarias y UI (`src/lib/auditPlannerUi.test.ts`)
- Verificar `assertZeroUuidExposure()` en todo el HTML generado (Historial + HUD + Árbol).
- Verificar modo rápido *"Asignar a todo el Sitio"* vs co-evaluación M:N y `1..N` turnos simultáneos.
- Verificar cuadre dual-bucket + compatibilidad `6.00d` / `2` auditores en `3` días calendario.
- Verificar aislamiento RBAC: `AUDITOR` y `CLIENT` no reciben controles de mutación en el DOM.

---

## Criterios de Verificación de Step 4.1.2
1. `npx tsx --test src/lib/auditPlannerUi.test.ts` pasa al 100%.
2. `npm run lint` (`tsc --noEmit`) y `npm test` pasan al 100% con `0 any`.
3. Guardar un borrador incompleto o completar hasta `Programada / Lista` funciona sin errores ni parpadeos de scroll/acordeón.
