# Step 2: Barra de Navegación Compacta (3 Columnas) y Swap con Bloque HTML

## Objetivo
Colocar la navegación jerárquica **antes** del contenido normativo y compactarla en una sola fila de 3 columnas sin contadores redundantes.

## Archivos Afectados
- `src/views/requisitoView.ts`
- `src/views/detailTemplate.ts` (solo si se requiere ajustar orden o slot, preferible resolverlo en `requisitoView.ts` manteniendo compatibilidad con las demás vistas)

## Cambios Específicos

### 1. Intercambio de Posición (Swap)
- Mover `navigationZoneHtml` para que se renderice **encima** del bloque de Contenido HTML en modo `read` (dentro de `customRecordBodyHtml` antes del panel HTML, eliminándolo de `extraSectionsHtml`).
- Orden vertical resultante en `read`:
  1. Cabecera (`[←]` + `Cláusula {codigo}` + acciones de edición/archivo/`+ Sub-cláusula`).
  2. Zona de Padres (`Norma ISO`, `Cláusula Padre` si aplica).
  3. Zona de Datos compacta (`codigo`).
  4. **Barra de Navegación Compacta**.
  5. **Bloque de Contenido HTML**.

### 2. Diseño en 1 Fila × 3 Columnas (`renderRequisitoNavigationZone`)
Consolidar `renderRequisitoNeighborNavBar` y `renderDirectChildrenQuickNav` en una sola fila horizontal (`grid grid-cols-[auto_1fr_auto]` o `flex items-stretch justify-between gap-2`):
- **Columna Izquierda (`←`):** Botón `Anterior` (`data-action="select-requisito"` apuntando a `prevSibling`, deshabilitado si no existe), manteniendo el comportamiento y atributos actuales.
- **Columna Central (2 filas apiladas `flex-col gap-1.5 min-w-0`):**
  - **Fila superior (Vecinos / Hermanos):** Botones compactos con el `codigo` de cada cláusula hermana (usando `sliceRequisitoSiblingsWindow`). Opcionalmente, mostrar el `title` junto al `codigo` (`codigo` + `title` si el registro tiene título explícito) acotado con `max-w-[...]` y `truncate` para evitar desbordamientos o saltos excesivos.
  - **Fila inferior (Hijas directas):** Botones compactos con el `codigo` de cada sub-cláusula hija directa (`directSubrequisitos`) y su `title` opcional (`max-w-[...]` + `truncate`). Si no hay hijas, mostrar un texto discreto mínimo en una línea.
- **Columna Derecha (`→`):** Botón `Siguiente` (`data-action="select-requisito"` apuntando a `nextSibling`, deshabilitado si no existe).

### 3. Limpieza y Reubicación de Acciones
- **Eliminar contador:** Quitar la etiqueta `🌿 Sub-cláusulas directas` y su badge numérico `${directSubrequisitos.length}`.
- **Reubicar botón `+ Sub-cláusula`:** Mover el botón `data-action="open-create-requisito"` (visible solo para staff en `read`) fuera de la barra de navegación, ubicándolo en la barra superior de acciones o en la cabecera del detalle junto a los controles del registro.

## Criterios de Aceptación
- La Barra de Navegación aparece visualmente arriba del bloque de Contenido HTML.
- La barra tiene 1 fila con 3 columnas reales en escritorio (`←` | 2 filas centrales | `→`) y no produce overflow horizontal (`scrollWidth <= clientWidth`).
- No existe texto ni badge contador `Sub-cláusulas directas`, y `+ Sub-cláusula` funciona desde su nueva ubicación.
