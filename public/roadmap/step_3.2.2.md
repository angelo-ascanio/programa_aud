# Step 3.2.2 — Detail View `Programación`: Orquestación de **Paso 2** (Selector por Certificado, Gestor Multi-Fecha 1:N, Pestañas Hijas y `sitioAuditoriaView.ts`)

## Objetivo
Implementar la Zona 3 del Detail View de **`Programación`** para operar cómodamente campañas de `1` o `N` certificados en el **Paso 2**:
1. **Selector de Certificado Activo** dentro de la campaña (con badges de progreso y cuadre por certificado).
2. **Gestor Relacional Multi-Fecha 1:N (`auditoria_fecha`)** permitiendo programar por **Mes/Año (`PREPROGRAMADA_MES`)** o **Rango Real (`REAL`)**, agregar múltiples **Reprogramaciones** secuenciales con `observacion`, identificar la fecha vigente (`MAX(numero_secuencia)`) y propagar fechas al grupo con 1 clic.
3. Pestañas complementarias (`equipo_resumen`, `hallazgos`), sub-vista declarativa `src/views/sitioAuditoriaView.ts` y pruebas unitarias DOM/UI en `src/lib/auditDetailViews.test.ts`.

---

## Archivos a Modificar / Crear
- **Modificar:** `src/views/programacionView.ts` (Zona 3 Paso 2: selector de auditoría miembro, Gestor Multi-Fecha 1:N, pestañas `equipo_resumen` y `hallazgos`, slot para pestaña `planificacion` de Step 4.1)
- **Crear:** `src/views/sitioAuditoriaView.ts` (sub-vista en 3 Zonas para inspeccionar un `sitios_por_auditoria` específico al navegar desde el detalle)
- **Modificar:** `src/main.ts` (listeners de cambio de auditoría activa en campaña, formularios de alta/reprogramación en `auditoria_fecha`, toggle *"Aplicar a toda la campaña"*, navegación a `sitioAuditoriaView` y retorno `[←]`)
- **Crear / Ampliar:** `src/lib/auditDetailViews.test.ts` + `src/lib/phase62UiIntegrity.test.ts`

---

## Especificación Técnica Detallada

### 1. Selector Multi-Certificado de la Campaña (Paso 2)
- Cuando `program.auditorias.length >= 2`, muestra una barra superior limpia en Zona 3 con un chip/tab por cada certificado participante (`FN-QMS-2024-001 · ISO 9001`, `FN-EMS-2024-002 · ISO 14001`), indicando su `%` de completitud y estado de cuadre (`Cubo 1 vs Cubo 2`).
- Si `program.auditorias.length === 1` (`INDIVIDUAL`), selecciona automáticamente esa única `auditoria` sin ruido visual adicional.

### 2. Gestor Relacional Multi-Fecha 1:N (`auditoria_fecha`)
Para la `auditoria` activa dentro de Zona 3:
1. **Cabecera de Fecha Vigente:**
   - Resalta la fila con `MAX(numero_secuencia)` vía `resolveLatestAuditDate(audit.fechas)`:
     - Si es `REAL`: muestra rango exacto (`10/06/2026 → 12/06/2026`), duración calendario (`3 días calendario`), contraste rápido con días-auditor asignados (`6.00 días-auditor`), y pill `Programación #1` o `Reprogramación #N`.
     - Si es `PREPROGRAMADA_MES`: muestra `Mes/Año` (`Sep 2026 · Pre-programada`) + indicador si requiere confirmación próxima.
2. **Línea de Tiempo Histórica (`numero_secuencia = 1, 2, 3...`):**
   - Muestra cronológicamente todas las entradas activas (`#1 Programación`, `#2 Reprogramación`, etc.) con su `observacion` explícita.
3. **Controles Staff (`ADMIN`/`WORKER` aprobados):**
   - Botón `+ Programar Fecha` (si aún no hay registros) o `+ Reprogramar Fecha` (crea nueva secuencia `seq + 1` con `tag = 'Reprogramación'`).
   - Selector `Precisión`: **`Mes / Año (Pre-programada)`** (`anio` + `mes`) vs **`Fechas Exactas (Real)`** (`fecha_inicio` + `fecha_fin >= fecha_inicio`).
   - Campo `observacion` (texto legible explicando el motivo de reprogramación).
   - Checkbox opcional **`"Aplicar también a todas las auditorías vinculadas de esta campaña"`** (en Nivel 1 / Nivel 2) invocando `syncDateRevisionToProgram`.
   - Acción segura de archivo (`archive_record('auditoria_fecha', id)`) en caso de corrección de entrada errónea.

### 3. Pestañas Hijas de Zona 3 y `sitioAuditoriaView.ts`
- **`planificacion` (`🌳 Planificador Visual Paso 2`):** contenedor/pestaña principal cuyo contenido árbol + historial se implementa en `Step 4.1.1` y `Step 4.1.2` (mostrando por ahora resumen de sitios/días listos para enlazar).
- **`equipo_resumen` (`👥 Equipo y Carga Días`):** tabla `table-fixed` consolidada por auditor (días asignados vs rango calendario real, rol y calificación `auditor_esta_calificado`), `0 <button>` en `<td>`, clicable hacia `Auditor` (`pushBreadcrumb`).
- **`hallazgos` (`🔍 Hallazgos y Comentarios`):** tabla limpia de `hallazgo` y bitácora `comentarios_por_auditoria`, sin botones en `<td>`.
- **`src/views/sitioAuditoriaView.ts`:** sub-vista en 3 Zonas con breadcrumb propio (`Auditoría > Planta Santa Cruz > Planta Valencia`) y retorno limpio con `[←]`.

---

## Pruebas Unitarias (`node:test`)
- `src/lib/auditDetailViews.test.ts`:
  - Renderizado `'read' | 'add' | 'edit'` respetando Guardar-primero / Cancelar-segundo arriba y cero botones al pie.
  - Gestor Multi-Fecha 1:N mostrando historial (`#1 Programación` + `#2 Reprogramación` con `observacion`), resaltando `#2` como vigente.
  - Aislamiento RBAC (`AUDITOR` y `CLIENT` sin mutadores de fechas; Nivel 2 oculta auditorías de otra organización para `CLIENT`) y `assertZeroUuidExposure`.

---

## Criterios de Verificación de Step 3.2.2
1. Se puede alternar entre certificados dentro de una campaña Nivel 1 / Nivel 2 en Paso 2 y registrar secuencias 1:N (`PREPROGRAMADA_MES` → `Reprogramación REAL`) propagándolas opcionalmente a la campaña.
2. `npx tsx --test src/lib/auditDetailViews.test.ts` y `npm run lint` pasan al 100%.
