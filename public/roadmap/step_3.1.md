# Step 3.1 — Estandarización de Multi Views del Bloque 1 (`Programación`, `Calendario` 3-Modos y `Resultado`)

## Objetivo
Refactorizar las tres vistas de directorio del dominio **`Auditoría`** (`#auditorias/scheduling`, `#auditorias/calendar` y `#auditorias/findings`) para cumplir estrictamente la arquitectura **Single Big Card + `universalTemplate.ts`**, con tablas `table-fixed` (`<colgroup>`), cero botones dentro de `<tbody>`, buscador único `type="text"`, facetas reactivas $S_{-k}$ con etiquetas dinámicas de planificación, y **Multi View de 3 modos en `Calendario` con vista Calendario por defecto**.

---

## Archivos a Modificar
- `src/views/programacionView.ts` (sección Multi View / directorio)
- `src/views/calendarioView.ts` (conversión completa a Multi View 3 modos bajo `universalTemplate.ts` o adaptador compatible)
- `src/views/resultadoView.ts` (alineación estructural del directorio con `universalTemplate.ts` + `table-fixed`)
- `src/views/universalTemplate.ts` (soporte opcional limpio para 3er modo `'calendar'` en `viewMode` sin afectar dominios existentes de 2 modos `'grid' | 'list'`)
- `src/main.ts` (`getMultiViewDomainAdapter` para `'programacion'`, `'calendario'` y `'resultado'`, listeners de cambio de modo y facetas)
- Pruebas UI de integridad (`src/lib/phase62UiIntegrity.test.ts` o nueva `src/lib/auditMultiViews.test.ts`)

---

## Especificación Técnica Detallada

### 1. Extensión Mínima de `universalTemplate.ts` para Soportar Modo `'calendar'` Opcional
- Actualmente `viewMode` soporta `'grid' | 'list'` (`[⊞ | ☰]`).
- Extender `UniversalViewMode = 'grid' | 'list' | 'calendar'` manteniendo `'grid' | 'list'` intactos para todos los demás dominios:
  - Si `options.enableCalendarMode === true` (activado únicamente en `Calendario`):
    - El switcher `role="group"` en la Columna 4 de la barra de controles renderiza **`[📅 Calendario | ⊞ Tarjetas | ☰ Tabla]`** (orden exacto, con iconos y `aria-pressed`).
    - Cuando `viewMode === 'calendar'`, el cuerpo principal debajo de la cabecera (junto al mismo `#multiViewFacetSidebar` colapsable!) renderiza `options.customCalendarViewHtml` en lugar de la grilla de tarjetas o la tabla.

### 2. `Programación` (`#auditorias/scheduling` en `programacionView.ts`)
1. **Eliminación de deuda heredada:**
   - Eliminar el modal `isPlanningModalOpen` de creación rápida (`+ Programar`) y quitar cualquier `<button>` dentro de `<tbody>`.
   - El botón **`+`** (`w-9 h-9`, `bg-sky-700`, `data-action="open-create-audit"`) visible solo para `ADMIN`/`WORKER` aprobados navega directamente al Detail View de `Auditoria` en modo `'add'` (como en `certificado`).
2. **Tabla `table-fixed` Limpia de 6 Columnas (`programacion-main`):**
   - `codigo_auditoria` (16%, min 115px) — `AUD-2025-001` (o etiqueta legible `'Borrador sin código'` nunca UUID) + tipo/metodología.
   - `certificado_org` (24%, min 150px) — `numero_certificado` + `organizacion_nombre` + `norma_codigo`.
   - `estado_tag` (18%, min 130px) — Pill de etiqueta dinámica (`computeAuditPlanningStatus`: `Programada / Lista`, `Parcialmente Asignada`, `Borrador / En Programación`, `Auditada`) + badge rojo `Atrasada / Vencida` si `isOverdue`.
   - `fechas` (14%, min 110px) — `fecha_programacion` (`→ fecha_fin` si existe) en `tabular-nums font-mono`, o `'Sin definir'`.
   - `dias_cuadre` (14%, min 110px, derecha/centro) — `{assignedDays.toFixed(2)}d / {requiredDays.toFixed(2)}d` + indicador `Cuadrado ✓` o delta (`Falta` / `Exceso`).
   - `equipo_sitios` (14%, min 105px, centrado) — `{sitiosCount} sitio(s) · {auditoresCount} aud.` (`% asignación` en barra sutil).
   - **Cero columna `Acciones`**, **cero `<button>` en `<td>`**. Clic en toda la fila (`data-action="select-prog-audit"`, `tabindex="0"`) abre el Detail View en `'read'`.
3. **Facetas Reactivas $S_{-k}$ (`#multiViewFacetSidebar`):**
   - `tag_planificacion` — **Etiqueta / Completitud** (`Borrador / En Programación`, `Parcialmente Asignada`, `Programada / Lista`, `En Ejecución`, `Auditada`, `Reprogramada`, `Cancelada`, `Atrasada / Vencida`).
   - `tipo_auditoria` — **Tipo de Auditoría** (`Etapa 1`, `Etapa 2`, `Seguimiento 1`, etc.).
   - `metodologia` — **Metodología** (`Presencial`, `Remota`, `Mixta`).
   - `norma` — **Norma ISO**.
   - `cuadre_dias` — **Balance de Días** (`Cuadrado`, `Con Desfase`, `Sin Tiempo Definido`).
4. **Totalizador y Archivo Histórico:**
   - `"Mostrando {filteredCount} de {totalCount} auditorías registradas"`.
   - Checkbox `#showArchivedCheckbox` visible solo para `ADMIN` aprobado, renderizando `#archivedRecordsSection` con restauración `↺ Restaurar`.

### 3. `Calendario` (`#auditorias/calendar` en `calendarioView.ts`)
1. **Multi View Unificado de 3 Modos (Defecto = `'calendar'`):**
   - Inicializar `state.multiViewDomains.calendario.viewMode = 'calendar'` por defecto.
   - Contenedor raíz **Single Big Card** (`data-mv-domain="calendario"`) usando `renderUniversalTemplate` con `enableCalendarMode: true`.
   - **Comparte exactamente el mismo motor de búsqueda (`type="text"` + única `✕`), panel lateral de facetas $S_{-k}$ (`tag_planificacion`, `tipo_auditoria`, `metodologia`, `cuadre_dias`) y totalizador `"Mostrando X de Y"`** en los 3 modos (`Calendario`, `Tarjetas`, `Tabla`).
2. **Modo `'calendar'` (por defecto):**
   - Dentro de `customCalendarViewHtml`: sub-selector limpio `Mes | Trimestre | Cronograma` (`data-cal-submode`) + navegación temporal `‹ Anterior | Hoy | Siguiente ›` + leyenda compacta de colores por `AuditDynamicTag` / `isOverdue`.
   - Las auditorías sin fecha programada (`fecha_programacion === null`) aparecen ordenadas en una bandeja lateral/superior compacta `"Pendientes de fecha (borradores)"` con clic directo a su Detail View para asignar fecha.
   - Hacer clic en cualquier evento del calendario/cronograma navega al Detail View de esa `Auditoria` empujando el breadcrumb correspondiente (`Calendario > AUD-2025-001`).
3. **Modos `'grid'` (`Tarjetas`) y `'list'` (`Tabla`):**
   - Reutilizan tarjetas estandarizadas de auditoría (etiqueta dinámica, cuadre de días, rango de fechas, organización) y tabla `table-fixed` de 6 columnas idéntica en disciplina Cero-Botones-en-`<tbody>`.

### 4. `Resultado` (`#auditorias/findings` en `resultadoView.ts`)
1. **Alineación Estructural (sin romper ejecución de campo / hallazgos):**
   - Reemplazar las barras de cabecera y filtros artesanales por `renderUniversalTemplate` (`data-mv-domain="resultado"`).
   - Mantener los 2 modos propios de `Resultado` (o `[⊞ Tarjetas / Tablero | ☰ Tabla]`, con opción de mantener sub-vista Kanban/Hallazgos dentro del modo tarjetas si ya existe o selector claro `Tarjetas | Tabla`).
   - En modo `Tabla`: aplicar `table-fixed` + `<colgroup>` suma `100%`, **cero `<button>` dentro de `<tbody>`**, fila clicable completa hacia el Detail View del hallazgo / evaluación de auditoría, facetas reactivas $S_{-k}$ (`tipo_hallazgo`, `estado_cierre`, `norma`, `auditoria`) y totalizador `"Mostrando X de Y"`.
   - Mantener intacta la lógica existente de ejecución en campo (`AUDITOR` en auditorías asignadas, creación/cierre de hallazgos con trazabilidad `id_requisito` + `id_proceso`) y Cero-UUID.

---

## Criterios de Verificación de Step 3.1
1. En `#auditorias/scheduling`, `#auditorias/calendar` y `#auditorias/findings`: todas las tablas usan `table-fixed` + `<colgroup>` que suma `100%`, `0` `<button>` en `<tbody>`, y único `<input type="text">` con `✕` única.
2. `#auditorias/calendar` abre por defecto en modo `📅 Calendario` y conmuta instantáneamente entre `Calendario`, `Tarjetas` y `Tabla` conservando exactamente los mismos filtros activos de facetas $S_{-k}$ y búsqueda.
3. No existe ningún modal heredado de creación rápida en `Programación`; el botón `+` abre el Detail View en modo `'add'`.
4. Ningún UUID aparece en texto visible, tooltips o atributos de usuario.
