# Paso 4.3 — Refactorización "Less Is More" de Zona 3 en `3. Auditor`, `4. Proceso` y `5. Turno`

## 1. Objetivo
Refactorizar las Vistas Detalle de **`3. Auditor`**, **`4. Proceso`** y **`5. Turno`** al estándar **"Less Is More"** (Zona 1 + Zona 2 del Paso 4.1 + Zona 3 directa y limpia), preservando intacta la funcionalidad completa de **Experto Técnico** y **alerta no bloqueante de brecha IAF** integrada en **`3. Auditor`** en el Paso 1.4.

---

## 2. Archivos Involucrados
- `src/views/asignacionView.ts`
- `src/views/programaProcesosView.ts`
- `src/views/programaTurnosView.ts`
- `src/lib/asignacionView.test.ts`
- `src/lib/programaProcesosView.test.ts`
- `src/lib/auditDetailViews.test.ts`

---

## 3. Especificación Técnica Detallada

### 3.1. `3. Auditor` (`asignacionView.ts`) — Equipo por Sitio + Experto Técnico Global
- **Zonas 1 y 2:** hereda el shell unificado del Paso 4.1.
- **Zona 3 ("Less Is More"):**
  - **Barra de estado única y compacta (reemplaza el antiguo `asignacion-summary-banner` sobredimensionado):** muestra únicamente `Requerido: X.XX d`, `Asignado: X.XX d`, `Unidades: N/M` y barra de progreso en una tira limpia, más alertas puntuales (conflictos de agenda / rotación de Líder) solo cuando existan.
  - **Tarjetas por Unidad Auditable (`Sitio 0`, `Sitio #N` y `Sitio Temporal` si ON):**
    - Cabecera directa (`Sitio`, nombre, delta `Faltan X.XX d` / `Cuadrado`).
    - Filas limpias de miembros asignados (nombre, rol, badge competencia, `±0.25d`, `Quitar`).
    - Formulario inline directo: `<select>` Auditor (ordenado por calificación y disponibilidad), `<select>` Rol, `<input>` Días `0.25d`, botón `Agregar`.
  - **Bloque Global de Experto Técnico + Alerta de Brecha IAF (Paso 1.4):**
    - Mostrar de forma concisa y directa (sin párrafos largos):
      - Si existe brecha sectorial IAF en algún auditor del equipo: aviso compacto y claro (ej. `"⚠ Brecha IAF: Equipo sin competencia completa en Sub-Sector 13.2. Puede asignar un Experto Técnico (opcional)."`).
      - Lista directa de expertos técnicos asignados a la auditoría/lote (`nombre`, sectores/subsectores IAF cubiertos, `±0.25d`, `observación`, `Quitar`) y fila compacta de alta (`Experto` + `Días 0.25` + `Observación opcional` + `Agregar Experto`).

### 3.2. `4. Proceso` (`programaProcesosView.ts`) — Relación `1:N` (Procesos por Sitio)
- **Zonas 1 y 2:** hereda el shell unificado del Paso 4.1.
- **Zona 3 ("Less Is More"):**
  - **Barra resumen minimalista:** conteo `X / Y procesos en N sitios` + badge compacto de exclusiones ISO 4.3 (solo si existen, con tooltip completo) y enlace `5. Turno →`, eliminando textos explicativos repetitivos.
  - **Tarjetas por Sitio:** cabecera limpia con nombre del sitio, acciones rápidas compactas (`Todos`, `Medulares`, `No auditados`, `Anterior`, `Limpiar`) y lista directa de checkboxes de procesos de `procesos_por_sitio` (sin sobrecarga visual de badges redundantes).

### 3.3. `5. Turno` (`programaTurnosView.ts`) — Matriz Proceso ↔ Turno por Sitio
- **Zonas 1 y 2:** hereda el shell unificado del Paso 4.1.
- **Zona 3 ("Less Is More"):**
  - **Navegación rápida de sitios + filtro `Solo pendientes`** en una sola barra limpia.
  - **Matriz Anti-Fatiga directa por sitio:** barra compacta de asignación en lote (`Seleccionar turno` + `Aplicar`) y tabla/matriz limpia de procesos seleccionados ↔ turnos de `turnos_por_sitio`, eliminando instrucciones extensas y alertas redundantes cuando ya hay turnos configurados.

---

## 4. Criterios de Aceptación
1. `3. Auditor`, `4. Proceso` y `5. Turno` usan el shell compacto (Zona 1 + Zona 2) sin repetición de contexto.
2. En `3. Auditor`, el indicador no bloqueante de brecha IAF y la gestión global de Experto(s) Técnico(s) (días + observación opcional) se integran de manera limpia y directa.
3. `4. Proceso` y `5. Turno` mantienen todas sus acciones rápidas y validaciones de sitios/procesos/turnos con menor densidad textual.

---

## 5. Verificación
- `npx tsx --test src/lib/asignacionView.test.ts src/lib/asignacionDomain.test.ts src/lib/programaProcesosView.test.ts src/lib/auditDetailViews.test.ts`
- `npx tsc --noEmit && npm run lint && npm run build`
