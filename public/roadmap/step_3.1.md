# Step 3.1: Pulido de `Norma` Multi View y Rediseño de `Norma` Detail View (`Requisitos` Tab por Defecto + Capítulos Raíz + Búsqueda Multinivel)

## 1. Objetivo
Optimizar la vista Multi View de **`Norma`** y rediseñar la Zona 3 (`Children Zone`) de **`Norma` Detail View** para que escale fluidamente hasta normas de 480+ cláusulas, mostrando **`Requisitos`** como primera pestaña por defecto, listando únicamente los capítulos raíz cuando no hay búsqueda activa, e incorporando un buscador instantáneo capaz de localizar cualquier sub-cláusula o término en español e inglés a través de los 7 niveles de anidamiento.

---

## 2. Pulido de `Norma` Multi View (`src/views/normaView.ts`)
1. **Directorio Clean List (`table-fixed`):**
   - Mantener exactamente las 6 columnas con `<colgroup>` sumando `100%` (`codigo`: 18%, `titulo`: 34%, `esquema`: 16%, `estatus`: 12%, `clausulas`: 10%, `acreditaciones`: 10%), cero `<button>` dentro de `<tbody>` y `getRowAttrs` apuntando a `data-action="select-norma"`.
   - En la columna `clausulas` y en las tarjetas Grid, mostrar el conteo real de requisitos activos (ej. `350` en `ISO 9001:2015`, `480` en `ISO 22000:2018`) más un micro-indicador de cobertura de contenido bilingüe (`Bilingüe ES/EN` vs `Estructura · Sin redactar`) para distinguir rápidamente las 4 normas pre-traducidas de las 4 normas pendientes de autoría (`27001`, `NTF 4073`, `17065`, `50001`).
2. **Facetas Reactivas y Búsqueda:**
   - Usar `computeReactiveFacetCounts` y `filterRecordsWithFacets` sobre `Esquema` y `Estatus`, manteniendo los 8 estándares buscables por código, título y esquema.

---

## 3. Rediseño de `Norma` Detail View (`Children Zone`)

### 3.1 `Requisitos` como Primera Pestaña y Pestaña por Defecto
- En `normaView.ts` (`childTabs` y `renderChildTabContent`), reordenar las pestañas a:
  1. **`requisitos`**: `🌳 Requisitos` *(primera pestaña y activa por defecto)*
  2. **`acreditacion`**: `🏛️ Acreditaciones`
  3. **`certificados`**: `📜 Certificados`
- Actualizar `state.extraDomain.activeNormaTab` en `src/main.ts` (`select-norma`, creación de norma y valores iniciales) para abrir siempre en `'requisitos'` salvo que un enlace o breadcrumb indique otra pestaña explícita (`targetTab`).

### 3.2 Estrategia de Vista por Defecto: Solo Capítulos de Nivel Superior (`Nivel 1`)
Cuando la barra de búsqueda dentro de la pestaña `Requisitos` esté vacía (`!requisitoQuery.trim()`):
- Filtrar la tabla `norma-tab-requisitos` para renderizar **únicamente los capítulos raíz** (`!req.id_requisito_padre`), es decir:
  - `1` al `10` en normas Anexo SL (`9001`, `14001`, `45001`, `22000`, `27001`, `50001`).
  - `1` al `7` en `NTF 4073:2022` y `1` al `8` en `ISO/IEC 17065:2012`.
- Mostrar en cada capítulo raíz:
  - **Código** (`1`, `4`, `7`...) con badge oscuro de nivel raíz.
  - **Título bilingüe** (título en `ES` como principal + subtítulo sutil en `EN` si difiere, o `Capítulo ${codigo} · Sin redactar`).
  - **Sub-cláusulas descendientes**: conteo total de descendientes bajo ese capítulo (ej. `142 sub-cláusulas` calculado por prefijo LTREE o árbol de `id_requisito_padre`) para dar visibilidad de la densidad sin renderizar 480 filas en el DOM inicial.
  - **Cobertura de Contenido**: indicador compacto de estado de contenido (`ES ✓ · EN ✓`, `Solo EN`, o `Pendiente de redactar`).

### 3.3 Barra de Búsqueda Instantánea Cross-Level (ES + EN)
Colocar una barra de búsqueda dedicada en la cabecera de la pestaña `Requisitos` (`id="normaRequisitoSearchInput"` + botón de limpiar `id="clearNormaRequisitoSearchBtn"`):
1. **Filtrado en memoria across all 7 levels (`filterNormaRequisitosCrossLevel` en `src/lib/extraDomain.ts`):**
   - Al escribir cualquier código (ej. `5.1.2`, `8.5.1`) o palabra clave en español o inglés (ej. `liderazgo`, `risk`, `riesgo`, `calibration`, `peligros`), buscar en **todos los niveles** usando:
     - `req.codigo` y `req.ruta_materializada`
     - `req.translations?.es?.title` y `stripHtmlToSearchText(req.translations?.es?.content_html)`
     - `req.translations?.en?.title` y `stripHtmlToSearchText(req.translations?.en?.content_html)`
2. **Presentación de resultados filtrados:**
   - Mostrar las cláusulas coincidentes ordenadas numéricamente por `ruta_materializada`, indicando su nivel y ruta jerárquica (ej. `Capítulo 5 › 5.1 › 5.1.2`), preservando `table-fixed`, `<colgroup>` sumando `100%` y cero `<button>` en `<tbody>`.
   - En `src/main.ts`, actualizar la tabla en vivo sin perder el foco ni la posición del cursor del input `#normaRequisitoSearchInput` (re-renderizando únicamente el contenedor `#normaRequisitosTableContainer` o restaurando selección al actualizar).

---

## 4. Criterios de Aceptación del Paso
- [ ] Al abrir cualquier `Norma` Detail View, `Requisitos` es la primera pestaña y se abre activa por defecto.
- [ ] Con búsqueda vacía, `ISO 22000:2018` (480 cláusulas) renderiza únicamente **10 filas** (capítulos `1`..`10`), manteniendo la página ágil y limpia.
- [ ] Al escribir `5.1.2` o `leadership` / `liderazgo` en `#normaRequisitoSearchInput`, aparecen inmediatamente las cláusulas coincidentes de cualquier profundidad (1..7) sin perder el foco del input.
- [ ] La tabla `norma-tab-requisitos` mantiene `table-fixed`, `<colgroup>` sumando `100%`, cero `<button>` en `<tbody>` y navegación por fila hacia `requisitoView`.
