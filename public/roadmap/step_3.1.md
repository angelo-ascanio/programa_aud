# Step 3.1 — Multi Views del Bloque 1: `Programación` (Vinculación + Filtro Sin Programar), `Calendario` Unificado + Alertas Configurables y `Resultado`

## Objetivo
Refactorizar los tres directorios Multi View del dominio **`Auditoría`** (`#auditorias/scheduling`, `#auditorias/calendar` y `#auditorias/findings`) bajo el patrón estricto **Single Big Card + `universalTemplate.ts`** (`table-fixed` + `<colgroup>` 100%, `0 <button>` en `<tbody>`, buscador único `type="text"` + única `✕`, facetas reactivas $S_{-k}$), incorporando:
1. En **`Programación`**: listado maestro centrado en **`programa_auditoria`** (Individual, Nivel 1, Nivel 2) + filtro/pestaña operativa de **Certificados Sin Programación por `estatus`**.
2. En **`Calendario`**: Multi View de 3 modos (`[📅 Calendario | ⊞ Tarjetas | ☰ Tabla]`, Calendario por defecto) con **eventos unificados de campaña**, visualización diferenciada de fechas **`REAL`** (última secuencia `MAX`) vs **`PREPROGRAMADA_MES`**, bandeja de **Alertas Inteligentes** y configuración de umbrales (`ADMIN`/`WORKER`).
3. En **`Resultado`**: alineación tabular limpia preservando ejecución en campo y trazabilidad de hallazgos.

---

## Archivos a Modificar
- `src/views/universalTemplate.ts` (soporte limpio de 3er modo opcional `'calendar'`)
- `src/views/programacionView.ts` (sección Multi View de campañas + panel/filtro de Certificados Pendientes por `estatus`)
- `src/views/calendarioView.ts` (Multi View 3 modos + eventos unificados + panel de alertas + modal/drawer de configuración de alertas)
- `src/views/resultadoView.ts` (alineación `universalTemplate.ts` + `table-fixed`)
- `src/main.ts` (`getMultiViewDomainAdapter` para `'programacion'`, `'calendario'`, `'resultado'`, handlers de filtro sin programar y de configuración de alertas)
- Pruebas UI (`src/lib/phase62UiIntegrity.test.ts` / `src/lib/auditMultiViews.test.ts`)

---

## Especificación Técnica Detallada

### 1. Extensión Mínima de `universalTemplate.ts` para Modo `'calendar'` Opcional
- `UniversalViewMode = 'grid' | 'list' | 'calendar'`.
- Cuando `options.enableCalendarMode === true` (solo en `Calendario`):
  - Columna 4 de la cabecera renderiza `[📅 Calendario | ⊞ Tarjetas | ☰ Tabla]` (`role="group"`, `aria-pressed`).
  - Cuando `viewMode === 'calendar'`, el cuerpo junto al mismo `#multiViewFacetSidebar` colapsable renderiza `options.customCalendarViewHtml` (compartiendo el mismo buscador, facetas $S_{-k}$ y totalizador `"Mostrando X de Y"`).
- Todos los demás dominios mantienen exactamente `[⊞ | ☰]`.

---

### 2. `Programación` (`#auditorias/scheduling` en `programacionView.ts`)

1. **Eliminación de deuda heredada:**
   - Eliminar cualquier modal heredado de creación rápida (`isPlanningModalOpen`) y todo `<button>` dentro de `<tbody>`.
   - Botón **`+`** (`w-9 h-9`, `bg-sky-700`, `data-action="open-create-program"`, solo `ADMIN`/`WORKER`) abre directamente el Detail View de `Programa de Auditoría` en modo `'add'` (Paso 1).

2. **Sub-selector Operativo de Directorio (`Programas y Campañas` vs. `Certificados Sin Programación`):**
   - Justo debajo de la barra superior o como sub-tab limpio dentro de la Single Big Card (respetando la jerarquía de `universalTemplate.ts`):
     - **Vista A (por defecto) — `Campañas y Auditorías (`programa_auditoria`)`:**
       - **Tabla `table-fixed` de 6 Columnas (`programacion-main`, suma `100%`):**
         1. `programa` (18%, min 135px): `codigo_programa` (`PROG-2026-001` o `'Borrador sin código'`) + **`etiqueta`** (`Planta Santa Cruz`).
         2. `vinculacion` (16%, min 125px): pill de nivel + naturaleza (`Nivel 1 · Integrada`, `Nivel 2 · Multientidad`, `Individual`). Si existe `id_ciclo_origen` evolucionado, sutil tag `"Evolución de ciclo"`.
         3. `certificados_org` (24%, min 160px): organizaciones y códigos de certificados cubiertos (`2 certs · Example, C.A.` o resumen limpio Nivel 2 respentando RLS).
         4. `fecha_vigente` (16%, min 125px): resuelta vía `resolveLatestAuditDate()` (`MAX(numero_secuencia)`), mostrando rango `REAL` (`10/06 → 12/06/2026 · 3d cal.`) o `PREPROGRAMADA_MES` (`Sep 2026 · Preprog.`) + badge de tag (`Programación` / `Reprogramación #2`) o `'Sin definir'`.
         5. `dias_cuadre` (13%, min 105px): `{assignedDays}d / {requiredDays}d` + indicador `Cuadrado ✓` / delta.
         6. `estado_tag` (13%, min 110px): tag dinámico global del programa (`computeProgramPlanningStatus`) + alerta `Atrasada` / `Conflicto` si aplica.
       - Clic completo en fila (`data-action="select-prog-program"`, `tabindex="0"`) abre el Detail View en `'read'`.
       - **Facetas Reactivas $S_{-k}$:**
         - `nivel_vinculacion`: `Individual`, `Nivel 1 (Intra-Org)`, `Nivel 2 (Inter-Org)`.
         - `tipo_vinculacion`: `Individual`, `Combinada`, `Integrada`, `Conjunta`, `Simultánea`, `Multientidad`, `Multisitio`.
         - `precision_fecha`: `Fecha Real`, `Pre-programada (Mes/Año)`, `Sin Fecha`.
         - `tag_planificacion`: `Borrador / En Programación`, `Parcialmente Asignada`, `Programada / Lista`, `En Ejecución`, `Auditada`, `Reprogramada`, `Cancelada`, `Atrasada / Vencida`.
         - `cuadre_dias`: `Cuadrado`, `Con Desfase`, `Sin Tiempo Definido`.
     - **Vista B — `Certificados Pendientes de Programar` (solo Staff `ADMIN`/`WORKER` o lectura contextual):**
       - Utiliza `findUnprogrammedCertificatesByStatus()` para listar certificados que **no tienen auditoría programada activa/futura**.
       - **Filtro explícito por `estatus` del certificado** (`Activo`, `Estudio`, `En Espera`, `Planificado`, `Suspendido`, etc. — chips multi-selección + conteo en vivo) + filtro por Norma y Organización.
       - Tabla `table-fixed` (`N° Certificado`, `Organización`, `Norma / Sub-Sector`, `Estatus`, `Última Auditoría Histórica`, sin botones dentro de `<td>`; clic en fila abre creación en Paso 1 con ese certificado ya preseleccionado para vincular solo o agrupar en Nivel 1 / Nivel 2!).

3. **Totalizador y Archivo Histórico:**
   - `"Mostrando {filteredCount} de {totalCount} campañas de auditoría"` (o certificados pendientes según vista activa).
   - Checkbox `#showArchivedCheckbox` solo para `ADMIN` aprobado con restauración `↺ Restaurar` tanto para `programa_auditoria` como para `auditoria`.

---

### 3. `Calendario` (`#auditorias/calendar` en `calendarioView.ts`)

1. **Multi View de 3 Modos (Defecto = `'calendar'`):**
   - `state.multiViewDomains.calendario.viewMode = 'calendar'` por defecto.
   - Single Big Card (`data-mv-domain="calendario"`) usando `renderUniversalTemplate` con `enableCalendarMode: true` (`[📅 Calendario | ⊞ Tarjetas | ☰ Tabla]`).
   - Comparte buscador único, totalizador `"Mostrando X de Y"` y facetas $S_{-k}$ (`nivel_vinculacion`, `tipo_vinculacion`, `precision_fecha`, `tag_planificacion`, `alerta_activa`) en los 3 modos.

2. **Eventos Unificados de Campaña en Modo `'calendar'` (`Mes | Trimestre | Cronograma`):**
   - **Agrupación Coordinada:** un programa vinculado (`Nivel 1` o `Nivel 2`) se renderiza como **un único evento consolidado** (ej. `Planta Santa Cruz · Integrada (2 certs: ISO 9001, ISO 14001) · 6.00d-aud / 3d cal.`). Si una campaña Nivel 2 tiene fechas reales distintas por organización, se muestran sus sub-bloques coordinados respetando siempre RLS para `CLIENT` (un `CLIENT` de Org A jamás ve el bloque ni nombre de Org B).
   - **Última Fecha Real (`MAX(numero_secuencia)`):** las barras/eventos en el calendario reflejan siempre la **última fecha programada/reprogramada** (`numero_secuencia` más alto); si fue reprogramada (`tag === 'Reprogramación'`), luce un indicador discreto (`Reprog. #N`).
   - **Pre-programadas Mes/Año (`PREPROGRAMADA_MES`):** renderizadas como bandas o chips mensuales diferenciados visualmente (estilo discontinuo / etiqueta `Mes estimado`) en las vistas `Mes`, `Trimestre` y `Cronograma`.
   - **Bandeja lateral/superior `"Sin fecha asignada"`:** programas/auditorías sin fila en `auditoria_fecha`, clicables directo al Detail View.

3. **Bandeja de Alertas Inteligentes y Configuración de Umbrales:**
   - Panel superior colapsable dentro del cuerpo de `Calendario` mostrando el conteo y lista accionable de alertas calculadas por `computeAuditAlerts(programs, alertConfig, todayIso)`:
     - **Atrasadas** (última fecha real vencida).
     - **Próximas a ejecutarse** (`<= dias_aviso_proxima` días desde hoy hasta la última fecha real).
     - **Pre-programadas sin confirmar** (`PREPROGRAMADA_MES` dentro de `<= dias_aviso_preprogramada_sin_confirmar` días del inicio del mes objetivo sin fecha real confirmada).
     - **Conflictos de auditor** (doble asignación en fechas reales superpuestas) y **desfases de días / span calendario**.
   - **Botón `"⚙ Configurar Alertas"`** (visible exclusivamente para `ADMIN` y `WORKER` aprobados): abre modal/drawer limpio con inputs numéricos para `dias_aviso_proxima`, `dias_aviso_preprogramada_sin_confirmar`, `ciclos_rotacion_auditor_lider` y toggles (`alertar_atrasadas`, `alertar_conflicto_auditor`, `alertar_desfase_dias_o_span`, `alertas_activas`), persistiendo en `public.configuracion_alerta_auditoria` con toast en `#archiveGovernanceToast`.

---

### 4. `Resultado` (`#auditorias/findings` en `resultadoView.ts`)
- Alineado bajo `renderUniversalTemplate` (`data-mv-domain="resultado"`), manteniendo ejecución de campo de `AUDITOR`, creación/cierre de hallazgos con trazabilidad `id_requisito` + `id_proceso`, tabla `table-fixed` sin `<button>` en `<tbody>`, facetas $S_{-k}$ y cero UUIDs.

---

## Criterios de Verificación de Step 3.1
1. En `Programación`, el usuario ve programas agrupados (Nivel 1, Nivel 2, Individual) y puede conmutar al filtro de **Certificados Sin Programación** filtrando por `estatus` (`Activo`, `Estudio`, etc.) para iniciar programación con 1 clic.
2. En `Calendario` (`📅 Calendario` por defecto), los programas vinculados aparecen como eventos unificados con su última fecha (`MAX(numero_secuencia)`), las `PREPROGRAMADA_MES` se muestran diferenciadas, y las alertas responden en vivo al cambiar los umbrales en `"⚙ Configurar Alertas"`.
3. Todas las tablas del Bloque 1 cumplen `table-fixed` + `<colgroup>` 100%, `0` `<button>` en `<tbody>`, buscador único `type="text"` y `0` UUIDs expuestos.
