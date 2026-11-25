# Paso 4.4 — Refactorización "Less Is More" de Zona 3 en `6. Resultado` y `7. Revisión`

## 1. Objetivo
Completar la adopción del estándar **"Less Is More"** en las dos últimas secciones operativas del pipeline de Bloque 1: **`6. Resultado`** (`resultadoView.ts`) y **`7. Revisión`** (`revisionView.ts`), conservando íntegra la gestión de fechas reales discretas, hallazgos/NCs, plazos parametrizables y cierre de revisión QA.

---

## 2. Archivos Involucrados
- `src/views/resultadoView.ts`
- `src/views/revisionView.ts`
- `src/lib/auditPhase5Views.test.ts`
- `src/lib/resultadoDomain.test.ts`
- `src/lib/revisionDomain.test.ts`

---

## 3. Especificación Técnica Detallada

### 3.1. `6. Resultado` (`resultadoView.ts`)
- **Zonas 1 y 2:** hereda el shell unificado del Paso 4.1 (incluyendo acción contextual `⚙ Plazos NC (+Xd / +Yd)` en acciones derechas para staff).
- **Zona 3 ("Less Is More"):**
  - **Bloque 1 — Fechas Reales Auditadas:** título corto + chips de fechas discretas (`dd/mm/aaaa` con botón `×` para archivar cuando el rol puede editar ejecución) + input compacto `date` + botón `Agregar fecha`, eliminando párrafos descriptivos redundantes.
  - **Bloque 2 — Hallazgos (`NC Mayor`, `NC Menor`, `OM`, `Fortaleza`):**
    - Cabecera limpia con conteo (`N hallazgos · M NCs abiertas`) y botón `+ Hallazgo`.
    - Lista directa y escaneable de hallazgos: código, badge tipo/estado, cláusula ISO con tooltip, descripción breve y fechas límite de plan/cierre (cuando es NC), con acciones claras sin sobrecarga de tarjetas anidadas ni texto repetido.
    - Mantener íntegramente los modales existentes de registro/edición de hallazgo, fechas de seguimiento/cierre y configuración global de plazos NC, más permisos de `AUDITOR` asignado vs `WORKER`/`ADMIN` vs `CLIENT` (solo lectura Nivel 2).

### 3.2. `7. Revisión` (`revisionView.ts`)
- **Zonas 1 y 2:** hereda el shell unificado del Paso 4.1.
- **Zona 3 ("Less Is More"):**
  - **Resumen mínimo previo (1 tira compacta de 3 datos no repetidos):** `Tipo`, `Fechas Reales`, `No Conformidades` (sin repetir certificado, organización ni código de auditoría que ya están en Zona 1).
  - **Formulario directo de Revisión QA:** `Fecha de Revisión` (`<input type="date">`), `Comentario de Revisión (Opcional)` (`<textarea>`) y botón `Guardar Revisión` (o vista de solo lectura limpia para `AUDITOR` y `CLIENT`).

---

## 4. Criterios de Aceptación
1. `6. Resultado` y `7. Revisión` comparten exactamente la misma Zona 1 y Zona 2 que las secciones `1..5` + `Resumen`.
2. Zona 3 es directa, limpia y sin textos introductorios redundantes ni repeticiones de cabecera.
3. Todas las reglas de negocio (fechas reales discretas, cálculo automático de plazos de NC, permisos de `AUDITOR` asignado, bloqueo/guardado de revisión y aislamiento Nivel 2) permanecen intactas.

---

## 5. Verificación
- `npx tsx --test src/lib/auditPhase5Views.test.ts src/lib/resultadoDomain.test.ts src/lib/revisionDomain.test.ts`
- `npx tsc --noEmit && npm run lint && npm run build`
