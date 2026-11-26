# Paso 4.2 — Refactorización "Less Is More" de Zona 3 en `1.5 Temporal` y `2. Tiempo`

## 1. Objetivo
Adaptar las Vistas Detalle de **`1.5 Temporal`** y **`2. Tiempo`** al nuevo estándar **"Less Is More"** (Zonas 1 y 2 unificadas del Paso 4.1 + Zona 3 directa, simple y enfocada en una única acción operativa, siguiendo el modelo limpio de `Tipo` / `Fecha` / `Sitio`).

---

## 2. Archivos Involucrados
- `src/views/designacionTemporalView.ts`
- `src/views/tiempoView.ts`
- `src/lib/tiempoView.test.ts`
- `src/lib/detailViewsPhase42.test.ts` (o tests de `designacionTemporalView` / `auditDetailViews.test.ts`)

---

## 3. Especificación Técnica Detallada

### 3.1. `1.5 Temporal` (`designacionTemporalView.ts`) — Relación `N:1` (Lote)
- **Zonas 1 y 2:** hereda automáticamente el shell unificado del Paso 4.1 (sin títulos repetidos).
- **Zona 3 ("Less Is More"):**
  - **Eliminar ruido visual:** quitar banners violetas extensos que repiten la fecha planificada y la lista completa de certificados hermanos con abreviación/versión (ya resuelta en Zona 2 mediante el `<select>` de certificados vinculados cuando > 1).
  - **Indicador conciso de alcance compartido:** una única línea o badge sutil solo cuando aplica a > 1 auditorías del lote (ej. `"Aplica al lote completo (2 certificados)"` con tooltip).
  - **Acción directa única:**
    1. Switch limpio `¿Incluye Sitio Temporal?` (`ON` / `OFF`) + confirmación inline mínima al desactivar cuando existen datos/asignaciones previas.
    2. Cuando está `ON`: formulario compacto de 3 campos directos en una misma rejilla limpia: **Nombre / Proyecto Temporal**, **Ubicación**, **Días (`0.25d`)** y botón único `Guardar`.
  - Mantener navegación rápida al siguiente paso (`← 1.4 Sitio` / `Continuar a 2. Tiempo →`) de forma compacta.

### 3.2. `2. Tiempo` (`tiempoView.ts`) — Relación `1:N` (Por Sitio del Certificado)
- **Zonas 1 y 2:** hereda el shell unificado del Paso 4.1 (eliminando chips duplicados de cabecera).
- **Zona 3 ("Less Is More"):**
  - **Resumen mínimo en 1 fila:** `Total: X.XX d` + estado (`Completo` / `Pendiente`), sin tarjetas redundantes ni párrafos instructivos largos.
  - **Nota concisa si hay Sitio Temporal ON:** línea compacta de 1 renglón (`Sitio Temporal activo: <etiqueta> · X.XX d`) con enlace directo `Editar en 1.5 Temporal →` (sin banner de varias líneas).
  - **Lista directa de Sitios Designados:** filas limpias y escaneables (`Sitio 0 · Principal` / `Sitio #N`, nombre, badge `Definido`/`Pendiente`), selector de **Modalidad** (`Presencial` / `Remota` / `Mixta`) y control directo **`-0.25` | `<input 0.25d>` | `+0.25`** (sin ruido repetitivo de textos auxiliares en cada fila).

---

## 4. Criterios de Aceptación
1. `1.5 Temporal` y `2. Tiempo` renderizan Zona 1 compacta y Zona 2 en 1 sola fila vía `auditSectionShell.ts`.
2. Ninguna fecha programada ni lista de certificados se repite innecesariamente en Zona 3.
3. Todas las acciones CRUD (`ON/OFF`, guardar temporal, ajustar `±0.25d` y modalidad por sitio) y permisos de solo lectura (`AUDITOR`, `CLIENT` Nivel 2) siguen operando al 100%.

---

## 5. Verificación
- `npx tsx --test src/lib/tiempoView.test.ts src/lib/tiempoDomain.test.ts src/lib/designacionTemporalDomain.test.ts src/lib/auditDetailViews.test.ts`
- `npx tsc --noEmit && npm run lint && npm run build`
