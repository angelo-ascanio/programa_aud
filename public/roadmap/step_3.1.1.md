# Step 3.1.1 — Multi Views: `Programación` (Campañas + Filtro Certificados Sin Programar por `estatus`) y Alineación `Resultado`

## Objetivo
Estandarizar los directorios **`Programación`** (`#auditorias/scheduling`) y **`Resultado`** (`#auditorias/findings`) bajo el patrón estricto **Single Big Card + `universalTemplate.ts`** (`table-fixed` + `<colgroup>` suma 100%, `0 <button>` en `<tbody>`, buscador único `type="text"` + única `✕`, facetas reactivas $S_{-k}$), dotando a `Programación` del listado maestro de **`programa_auditoria`** y del filtro operativo de **Certificados Sin Programación por `estatus`**.

*(El Multi View de 3 modos de `Calendario` y su bandeja/configuración de alertas se abordan de forma separada en `Step 3.1.2`).*

---

## Archivos a Modificar / Crear
- `src/views/programacionView.ts` (sección Multi View / directorio)
- `src/views/resultadoView.ts` (alineación estructural bajo `universalTemplate.ts`)
- `src/main.ts` (`getMultiViewDomainAdapter` para `'programacion'` y `'resultado'`, listeners de sub-vista `'pendientes'`, facetas $S_{-k}$ y preselección `+ Programar desde Certificado`)
- `src/lib/auditMultiViews.test.ts` / `src/lib/phase62UiIntegrity.test.ts`

---

## Especificación Técnica Detallada

### 1. `Programación` (`#auditorias/scheduling` en `programacionView.ts`)

1. **Eliminación de deuda heredada:**
   - Eliminar cualquier modal heredado de creación rápida (`isPlanningModalOpen`) y todo `<button>` dentro de `<tbody>`.
   - El botón **`+`** (`w-9 h-9`, `bg-sky-700`, `data-action="open-create-program"`, solo `ADMIN`/`WORKER`) abre directamente el Detail View de `Programa de Auditoría` en modo `'add'` (Paso 1).

2. **Sub-selector Operativo (`Campañas y Auditorías` vs. `Certificados Sin Programación`):**
   - **Vista A (por defecto) — `Campañas y Auditorías (`programa_auditoria`)`:**
     - **Tabla `table-fixed` de 6 Columnas (`programacion-main`, suma `100%`):**
       1. `programa` (18%, min 135px): `codigo_programa` + **`etiqueta`** (`Planta Santa Cruz`).
       2. `vinculacion` (16%, min 125px): pill de nivel + naturaleza (`Nivel 1 · Integrada`, `Nivel 2 · Multientidad`, `Individual`) y sutil tag `"Evolución de ciclo"` si `id_ciclo_origen != null`.
       3. `certificados_org` (24%, min 160px): organizaciones y códigos de certificados cubiertos (respetando aislamiento Nivel 2 para `CLIENT`).
       4. `fecha_vigente` (16%, min 125px): resuelta con `resolveLatestAuditDate()` (`MAX(numero_secuencia)`), mostrando rango `REAL` (`10/06 → 12/06/2026 · 3d cal.`) o `PREPROGRAMADA_MES` (`Sep 2026 · Preprog.`) + tag (`Programación` / `Reprog. #N`) o `'Sin definir'`.
       5. `dias_cuadre` (13%, min 105px): `{assignedDays}d / {requiredDays}d` + indicador `Cuadrado ✓` / delta.
       6. `estado_tag` (13%, min 110px): tag dinámico global (`computeProgramPlanningStatus`) + alerta `Atrasada` / `Conflicto` si aplica.
     - Clic completo en fila (`data-action="select-prog-program"`, `tabindex="0"`) abre el Detail View en `'read'`.
     - **Facetas Reactivas $S_{-k}$:** `nivel_vinculacion`, `tipo_vinculacion`, `precision_fecha` (`Fecha Real | Pre-programada Mes/Año | Sin Fecha`), `tag_planificacion` y `cuadre_dias`.
   - **Vista B — `Certificados Sin Programación` (solo Staff `ADMIN`/`WORKER` o lectura operativa):**
     - Alimentada por `findUnprogrammedCertificatesByStatus()`.
     - **Filtro explícito por `estatus` del certificado** (`Activo`, `Estudio`, `En Espera`, `Planificado`, `Suspendido`, etc. con chips y conteo en vivo) + Norma y Organización.
     - Tabla `table-fixed` (`N° Certificado`, `Organización`, `Norma / Sub-Sector`, `Estatus`, `Última Auditoría Histórica`), sin botones en `<td>`; clic en fila inicia el Paso 1 en modo `'add'` con ese certificado ya preseleccionado.

3. **Totalizador y Archivo Histórico:**
   - `"Mostrando {filteredCount} de {totalCount} campañas de auditoría"` (o certificados pendientes).
   - Checkbox `#showArchivedCheckbox` solo para `ADMIN` aprobado con restauración `↺ Restaurar` (`programa_auditoria` y `auditoria`).

### 2. `Resultado` (`#auditorias/findings` en `resultadoView.ts`)
- Migrar cabecera y filtros a `renderUniversalTemplate` (`data-mv-domain="resultado"`).
- Tabla `table-fixed` con `<colgroup>` suma `100%`, **cero `<button>` en `<tbody>`**, fila clicable completa hacia el Detail View, facetas reactivas $S_{-k}$ (`tipo_hallazgo`, `estado_cierre`, `norma`, `auditoria`) y totalizador `"Mostrando X de Y"`.
- Preservar íntegramente la ejecución de campo de `AUDITOR` y trazabilidad `id_requisito` + `id_proceso`.

---

## Criterios de Verificación de Step 3.1.1
1. `Programación` muestra campañas agrupadas (Individual, Nivel 1, Nivel 2) y permite cambiar al filtro de **Certificados Sin Programación** filtrando por `estatus` (`Activo`, `Estudio`, etc.).
2. `Programación` y `Resultado` cumplen `table-fixed` + `<colgroup>` `100%`, `0 <button>` en `<tbody>`, buscador único `type="text"` y `0` UUIDs.
3. `npx tsx --test src/lib/auditMultiViews.test.ts` (Parte Programación/Resultado) y `npm run lint` pasan al 100%.
