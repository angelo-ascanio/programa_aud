# Step 2.1.1 — `Procesos del Sitio` (`sitioDomain.ts` + Tab en `sitioView.ts`) y Pruebas Unitarias

## Objetivo
Implementar de forma autónoma e incremental el soporte de **`procesos_por_sitio`** dentro del dominio `Certificación > Sitio`, dejando completamente operativa y probada la vinculación física de procesos por sede antes de construir el motor de auditorías.

---

## Archivos a Modificar / Crear
- **Modificar:** `src/lib/sitioDomain.ts`
- **Modificar:** `src/views/sitioView.ts` (pestaña `'procesos'` — `Procesos del Sitio`)
- **Modificar / Ampliar:** `src/lib/sitioDomain.test.ts`

---

## Especificación Técnica Detallada

### 1. Contratos y Validadores Puros (`src/lib/sitioDomain.ts`)
1. Definir `ProcesoPorSitioLink`:
   ```ts
   export interface ProcesoPorSitioLink {
     id: string;
     id_sitio: string;
     id_proceso: string;
     nombre_proceso: string;
     tipo_proceso: string;
     deleted_at?: string | null;
   }
   ```
2. Ampliar `SitioEntity` (en `multisiteSampling.ts` / `sitioDomain.ts`) con:
   - `procesos_por_sitio?: ProcesoPorSitioLink[]`
   - `procesos_vinculados?: string[]` (espejo de `turnos_vinculados`).
3. Implementar funciones puras con tipado estricto (`0 any`):
   - `getAvailableProcesosForSitio(sitioId: string, cert: CertificadoDetailEntity)`: devuelve los procesos activos del mismo `cert.id` que aún no están vinculados activamente a `sitioId`.
   - `validateProcesoPorSitioAssignment(sitioId: string, procesoId: string, cert: CertificadoDetailEntity)`: verifica que ambos pertenezcan al mismo certificado activo y bloquea duplicados activos.
   - Actualizar métricas resumen de `Sitio` para mostrar conteo de `procesos_vinculados` junto a `turnos_vinculados`.

### 2. Pestaña `Procesos del Sitio` (`src/views/sitioView.ts`)
1. Ampliar las pestañas hijas del Detail View de `Sitio`: `'turnos' | 'procesos' | 'auditorias'`.
2. En la pestaña `'procesos'`:
   - Tabla `<table class="w-full table-fixed ...">` con `<colgroup>` suma `100%` (`Proceso`, `Tipo`, `Cláusulas Cubiertas`), **cero `<button>` en `<td>`**; fila clicable para navegar al Detail View de `Proceso`.
   - Para `ADMIN`/`WORKER` aprobados: selector de procesos disponibles del certificado (`getAvailableProcesosForSitio`) + botón `+ Vincular Proceso`, y soporte de archivo lógico vía `archive_record('procesos_por_sitio', id)` con toast `#archiveGovernanceToast`.
   - Empty state informativo cuando el sitio no tiene procesos vinculados, advirtiendo que el planificador de auditorías requiere procesos activos del sitio.
   - Garantizar `escapeHtml()` y Cero-UUID en texto, `title` y `aria-label`.

---

## Pruebas Unitarias (`node:test`)
- En `src/lib/sitioDomain.test.ts`:
  - Validación cruzada de certificado en `validateProcesoPorSitioAssignment` (rechaza proceso de otro certificado).
  - Prevención de duplicados activos y filtrado correcto en `getAvailableProcesosForSitio`.
  - Renderizado limpio de la pestaña `'procesos'` (Cero-UUID, `table-fixed`, sin botones en `<td>`).

---

## Criterios de Verificación de Step 2.1.1
1. `npx tsx --test src/lib/sitioDomain.test.ts` pasa al 100%.
2. `npm run lint` (`tsc --noEmit`) pasa con `0` errores y `0 any`.
