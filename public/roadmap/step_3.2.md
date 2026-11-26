# Paso 3.2: Detail View de 3 Zonas y Pestañas Hijas para `Auditor`

## 1. Objetivo del Paso
Completar el **Detail View** de `Auditor` (`src/views/auditorView.ts` + `src/main.ts` + compatibilidad con `src/views/competenciaAuditorView.ts`) siguiendo la arquitectura de referencia de `expertoTecnicoView.ts`: ficha maestra en modo `read` / `add` / `edit`, cuatro pestañas hijas claras (`Competencias`, `Contacto`, `Evaluaciones In Situ` e `Historial de Auditorías`) y gobernanza de archivo/restauración.

> **Alcance estricto:** Detail View de `Auditor`, formularios CRUD en línea para contactos y evaluaciones in situ, conectividad de eventos en `src/main.ts` y tests unitarios/vista del Detail View. No modificar aún `Bloque 1` (`asignacionView.ts`), que corresponde al **Paso 4.1**.

---

## 2. Archivos Permitidos a Modificar
- `src/views/auditorView.ts` (sección Detail View + sub-vistas de pestañas hijas)
- `src/views/competenciaAuditorView.ts` (desambiguación de homónimos en selector `Auditor` añadiendo `SIGLAS · C.I.`)
- `src/lib/competencyMatrix.ts` (tipos de `AuditorChildTab`, estado de formularios de contacto/evaluación en `AuditorViewState`)
- `src/main.ts` (handlers CRUD de perfil completo, `telefono_auditor`, `email_auditor`, `evaluacion_in_situ_auditor`, y soporte de archivo/restauración de `auditor` y sus tablas hijas)
- `src/lib/competencyMatrix.test.ts` (y `src/lib/auditorDetailView.test.ts` si se separa)

---

## 3. Diseño Técnico de Detail View (Paridad con `expertoTecnicoView.ts`)

### 3.1 Encabezado y Zona 2 (Ficha Maestra del Auditor)
- **Encabezado (`renderDetailPageTemplate`):**
  - Título: `nombre` (o `'Nuevo Auditor'` en modo `add`).
  - Subtítulo limpio (Zero-UUID): `SIGLAS · C.I. <cedula> · <profesion> · <N> normas · <M> sectores IAF · <K> canales de contacto`.
  - Badge de estado: resultado de `evaluateAuditorInSituStatus` (`Vigente`, `Por Vencer`, `Vencido`, `S/R`, `Pendiente / Condicionado`).
  - Acciones superiores:
    - `ADMIN`/`WORKER`: `Editar Perfil`, `Guardar Cambios`, `Cancelar`, `Archivar Auditor` (vía `get_archive_dependency_summary` + `archive_record`).
    - `ADMIN` en registro archivado: `Restaurar`.
    - `AUDITOR`/`CLIENT`: lectura estricta sin botones de mutación.
- **Atributos en modo `read` (organizados en rejilla compacta y legible):**
  - Bloque Identidad: `Nombre Completo`, `Siglas`, `Nº Cédula de Identidad`, `Profesión`.
  - Bloque Calificación Normativa y Sectorial: `Año Actualización Normas`, `Año Actualización Sectores`, `Esquemas Complementarios` (`MARCA` / `HACCP` / `Ninguno`), `Sistema Secundario`.
  - Bloque Resumen de Evaluación In Situ: `Última Evaluación In Situ`, `Próxima Evaluación In Situ`, `Sector / Área Evaluada`, `Observaciones de Evaluación`, y alerta visual destacada si existe `observacion_sectores` (especialmente cuando indica acompañamiento obligatorio con **Experto Técnico**).
- **Formulario en modo `add` / `edit` (`#auditorDetailForm`):**
  - Campos controlados para todos los atributos anteriores (`nombre*`, `siglas*`, `cedula_identidad*`, `profesion`, `esquemas_complementarios`, `anio_actualizacion_normas`, `anio_actualizacion_sectores`, `sistema_gestion_secundario`, `sector_area_evaluado_texto`, `observaciones_evaluacion`, `observacion_sectores`).
  - Validación cliente inline + mensajes claros en español si `cedula_identidad` está repetida o falta algún campo requerido (permitiendo homónimos exactos como `Yurima Carrillo` cuando difiere la cédula).

### 3.2 Pestañas Hijas (Zona 3)
Mantener las fortalezas existentes y organizar 4 pestañas limpias (`data-auditor-tab`):

1. **`Competencias`** *(pestaña por defecto)*:
   - Sub-tablas/bloques limpios para:
     - **Normas ISO Acreditadas** (`norma_auditor`) + indicador de `esquemas_complementarios` (`MARCA`, `HACCP`).
     - **Sectores IAF** (`sector_iaf_auditor`) y **Sub-Sectores IAF** (`subsector_iaf_auditor`) con indicador de nivel de riesgo (`ALTO`, `MEDIO`, `BAJO`).
   - Conserva botones `+ Asignar Competencia` (abriendo `competenciaAuditorView.ts` pre-rellenado) y desvincular (`norma_auditor`, `sector_iaf_auditor`, `subsector_iaf_auditor`) solo para `ADMIN`/`WORKER`.
   - En `competenciaAuditorView.ts`: mostrar `aud.nombre (SIGLAS · C.I. <cedula>)` en el selector de auditores para evitar confusión entre homónimos.
2. **`Contacto`** *(nuevo, patrón idéntico a `expertoTecnicoView.ts`)*:
   - Gestión normalizada de **`telefono_auditor`** (`telefono`, `tipo_telefono`: `'Móvil' | 'Oficina' | 'Personal' | 'Internacional'`, botón marcar principal / archivar).
   - Gestión normalizada de **`email_auditor`** (`email`, `tipo_email`: `'Principal' | 'Secundario' | 'Personal'`, botón marcar principal / archivar) con nota informativa discreta indicando cuál correo está vinculado al acceso Auth si aplica.
   - Sin `<button>` dentro de `<tbody>` si usa listas tabulares, o usando tarjetas/listado limpio de filas de contacto con acciones accesibles fuera de `<tbody>` o patrón consistente con `expertoTecnicoView.ts` (atención: en tarjetas/divs `<ul>` o `<div class="divide-y">` se evita cualquier violación del invariante `0 <button> en <tbody>`!).
3. **`Evaluaciones In Situ`** *(nuevo)*:
   - Muestra el historial cronológico de evaluaciones de **`evaluacion_in_situ_auditor`** (fundamental para auditores con evaluaciones múltiples como `Félix Rojas` `may-15 / nov-24`, `Oscar Quintero`, `Sheilar Peña`, `Yamila Dumont` y `Yurima Carrillo 12310919`).
   - Formulario inline (solo `ADMIN`/`WORKER`) para registrar nueva evaluación (`etiqueta_periodo`, `norma_referencia`, `sector_area_evaluado`, `ultima_evaluacion_fecha`, `proxima_evaluacion_fecha`, `observaciones`), marcando automáticamente `sin_registro_evaluacion = false` y actualizando el resumen del padre en `auditorPersistence.ts`.
   - Botón `Marcar como S/R` o archivado de registro erróneo (soft delete), recalculando la vigencia del auditor al instante.
4. **`Historial de Auditorías`**:
   - Conserva el listado de auditorías participadas con tabla `table-fixed` (`0 <button>` en `<tbody>`, filas clicables hacia `#/auditorias/detail?...`), rol ejecutado (`AUDITOR_LIDER` / `AUDITOR`), días-hombre y fechas.

---

## 4. Criterios de Verificación del Paso 3.2
1. `npx tsc --noEmit` y `npm test` pasan con `0` errores y `0 any`.
2. Flujo CRUD completo probado en navegador como `ADMIN`/`WORKER`:
   - Crear un nuevo auditor con siglas + cédula; confirmar rechazo elegante al intentar duplicar cédula y aceptación al crear un homónimo con distinta cédula.
   - Editar `profesion`, `observacion_sectores` y agregar/archivar un teléfono y un correo secundario.
   - Agregar una evaluación in situ y verificar cambio en vivo del badge de vigencia del encabezado.
3. Flujo `AUDITOR` y `CLIENT`: 0 controles de creación/edición/eliminación/archivo visibles en cualquiera de las 4 pestañas.
4. `table-fixed`, `<colgroup>` 100%, `0 <button>` en `<tbody>` y Zero-UUID verificados en todas las vistas.
