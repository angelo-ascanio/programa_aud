# Receta Arquitectónica Maestra: Multi View & Detail View (`certificado`)

Esta guía documenta con precisión de implementación cada patrón, regla de estado, flujo de datos, regla de acceso RBAC, interacción DOM y convención visual del dominio **`certificado`** en `programa_aud`. Sirve como plantilla canónica obligatoria para implementar o refactorizar cualquier otra entidad del sistema.

---

## 1. Fundamentos Arquitectónicos y Estándares de Layout

### 1.1 Contenedor Widescreen y Shell de Vista (`src/lib/layout.ts`, `src/views/certificacionView.ts`)
Todas las vistas autenticadas del dominio Certificación se envuelven en un `<main>` con el contenedor maestro panorámico:

- **`APP_SHELL_CONTAINER_CLASS`**:
  ```ts
  'max-w-[1720px] w-full mx-auto px-4 sm:px-6 lg:px-8 xl:px-12'
  ```
- **`APP_HEADER_CONTAINER_CLASS`**:
  ```ts
  'max-w-[1720px] w-full mx-auto px-3 sm:px-6 lg:px-8 xl:px-12'
  ```
- En `renderCertificacionView`:
  ```html
  <main class="flex-1 max-w-[1720px] w-full mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 pt-1.5 pb-8 space-y-4">
    <!-- Breadcrumb Bar (renderizado en src/main.ts fuera de la Single Big Card) -->
    <!-- Single Big Card: Multi View o Detail View -->
  </main>
  ```

### 1.2 Grilla Adaptativa de Tarjetas (`getUniversalCardGridClass`)
Cuando el Multi View está en modo `'grid'`, el número de columnas responde al estado abierto/cerrado del panel lateral de facetas:
- **Sidebar abierto (`isSidebarOpen === true`):**
  `grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 min-[1680px]:grid-cols-4 gap-4`
- **Sidebar colapsado (`isSidebarOpen === false`):**
  `grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4`

### 1.3 Principio "Single Big Card" y Jerarquía Visual (Tailwind CSS v4)
Tanto el Multi View como el Detail View renderizan **una única tarjeta blanca maestra**:
- Contenedor raíz: `bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden`.
- Las tarjetas internas de atributos o padres utilizan superficies suaves `bg-slate-50/70 border border-slate-200/90 rounded-xl p-2.5 sm:p-3` para evitar bordes pesados anidados.
- Tipografía numérica alineada con `tabular-nums` en contadores, fechas (`font-mono`), porcentajes y códigos.

### 1.4 Seguridad XSS y Mandato Cero-UUID (`src/lib/html.ts`, `src/lib/zeroUuid.ts`)
1. **Sanitización obligatoria:** Toda interpolación de cadenas provenientes de estado o base de datos dentro de templates HTML o atributos (`title`, `aria-label`, `value`, `data-*`) DEBE pasar por `escapeHtml(...)`.
2. **Mandato Cero-UUID (`assertZeroUuidExposure`):** Ningún UUID v4 (`[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`) puede aparecer en texto visible, tooltips (`title`), `aria-label`, `placeholder` o `value` de `<input>` visibles. Los UUIDs solo viajan en atributos técnicos internos (`data-cert-id`, `data-entity-id`, `option[value]`).
   - En los selects de Zona 1 se muestran nombres legibles (`Empresa · RIF`, `ISO 9001:2015`, `Sector 17 · ...`, `17.1 · ...`) y nunca los IDs primarios.
   - En razones de archivo lógico (`sanitizeArchiveReason`), cualquier UUID incrustado en texto libre se sustituye automáticamente por `'Referencia registrada'`.

---

## 2. Motor Global de Breadcrumbs y Navegación (`src/lib/breadcrumb.ts`, `src/views/breadcrumbView.ts`)

### 2.1 Reglas de Posicionamiento y Renderizado
- **Ubicación estricta:** El `<nav aria-label="Navegación jerárquica">` se renderiza en `src/main.ts` **fuera y por encima** de la Single Big Card (nunca dentro del `<header>` de la tarjeta).
- **Visibilidad:** `renderBreadcrumbBar({ trail })` retorna `''` si `trail.length <= 1` (en vistas raíz de un solo segmento no ocupa espacio vertical).
- **Una sola línea sin saltos:** `<ol class="flex flex-nowrap items-center gap-1.5 text-xs text-slate-500 overflow-hidden whitespace-nowrap">`.
- **Icono inicial:** SVG de casita (`w-3.5 h-3.5 text-slate-400 shrink-0`), seguido de cada segmento separado por chevron SVG (`CHEVRON_SVG`).

### 2.2 Truncamiento, Colapso por Elipsis y Prevención de Ciclos
- **Límite por segmento (`MAX_BREADCRUMB_CHAR_LENGTH = 24`):** `truncateBreadcrumbLabel(label)` corta etiquetas mayores a 24 caracteres con `…`, manteniendo la etiqueta íntegra en el atributo `title` (`seg.tooltip || seg.label`).
- **Límite de segmentos visibles (`MAX_VISIBLE_BREADCRUMBS = 4`):** `collapseBreadcrumbForDisplay(trail)` muestra `[segmento[0], botón '…', segmento[n-2], segmento[n-1]]` cuando `trail.length > 4`. El botón `…` (`data-breadcrumb-ellipsis="true"`, `data-breadcrumb-id`) almacena el ID del ancestro oculto más profundo (`trail[n-3].id`) para retroceder al hacer clic.
- **Prevención compuesta de ciclos (`pushBreadcrumb`):**
  Al navegar hacia adelante (`select-cert`, `data-parent-nav="true"`, selección de subentidad o `open-create-cert`), `pushBreadcrumb` detecta si el destino ya existe en el trail por:
  1. Igualdad exacta `s.id === normalizedSegment.id`, **o**
  2. Mismo `entityId` (cuando `entityId != null`) dentro del mismo ámbito `(s.entityType ?? null) === (normalizedSegment.entityType ?? null)` y `(s.subview ?? s.route) === (normalizedSegment.subview ?? normalizedSegment.route)`.
  Si coincide, trunca el trail hasta ese ancestro y actualiza su metadata en lugar de duplicar niveles.

### 2.3 Flujos de Navegación Exactos en `certificado`
| Disparador UI | Atributo / ID | Función en `breadcrumb.ts` / `main.ts` | Efecto sobre el Trail y Estado |
| :--- | :--- | :--- | :--- |
| Menú superior / Tabs de dominio | `data-nav-reset="true"` | `resetBreadcrumbToDomain('certificacion', 'certificates')` | Reinicia el trail a `[Certificación, Certificado]`, limpia todas las selecciones (`clearAllEntitySelections`) y cierra modales abiertos. |
| Botón **`+`** (Nuevo Certificado) | `data-action="open-create-cert"` | `pushBreadcrumb(resetBreadcrumbToDomain('certificacion', 'certificates'), createNewCertificadoBreadcrumbSegment())` | Fija el segmento determinístico `id: 'cert-new'`, `label: 'Nuevo Certificado'`, `entityType: 'cert'`, `entityId: null`; activa `isCreating = true` y `formDraft = createEmptyCertificadoFormDraft()`. |
| Fila o Card de Certificado | `data-action="select-cert"` | `pushBreadcrumb(trail, { id: 'cert-' + id, label: numero_certificado, entityType: 'cert', entityId: id, tab: 'sitios' })` | Abre el Detail View en modo `'read'` sobre la pestaña `'sitios'`. |
| Cambio de Pestaña Hija | `data-cert-tab="<tab>"` | `syncCurrentBreadcrumbTab(tab)` | Actualiza el campo `tab` del último segmento del trail sin agregar un nivel nuevo. |
| Salto a Padre en Zona 1 (`→`) | `data-parent-nav="true"` | `pushBreadcrumb(trail, parentSegment)` | Empuja la entidad padre (`org`, `norma`, `estatus` o `sector_iaf` con `targetTab: 'subsectores'`) conservando el historial previo para poder regresar con `[←]`. |
| Botón **`[←]`** en cabecera del Detail | `data-nav-back="true"` | `backtrackToParentBreadcrumb()` → `popToParentBreadcrumb(trail)` | Elimina el segmento hoja actual y restaura la vista del segmento padre inmediato mediante `applyBreadcrumbSegmentState(target)`. |
| Cancelar en modo **`'add'`** | `#cancelEditCertBtn` | `cancelCertForm()` → `backtrackToParentBreadcrumb()` | Limpia `isCreating = false`, `formDraft = undefined`, `createErrorMessage = null` y retorna al directorio (`Certificación > Certificado`). |
| Creación exitosa en **`'add'`** | `#certificadoDetailForm` (`submit`) | `pushBreadcrumb(resetBreadcrumbToDomain('certificacion', 'certificates'), { id: 'cert-' + newId, ... })` | Reemplaza `'cert-new'` por el segmento real `'cert-' + newId` y permanece en el Detail View del registro recién creado en modo `'read'`. |

> **Acceso contextual de Auditores (`AUDITOR`):** Tanto `[data-breadcrumb-id]` como `[data-parent-nav="true"]` habilitan `allowAuditorContextual` cuando `profile.role === 'AUDITOR'`, `profile.status === 'APPROVED'`, `route === 'certificacion'` y existe `entityId`, permitiendo que un auditor navegue entre su certificado asignado y entidades contextuales relacionadas aunque no tenga acceso libre al directorio completo.

---

## 3. Arquitectura Universal Multi View / Directorio (`renderCertificadoDirectory`)

El directorio de certificados (`src/views/certificadoView.ts`) utiliza `renderUniversalTemplate<CertificadoDetailEntity>` (`src/views/universalTemplate.ts`) conectado a su adaptador en `getMultiViewDomainAdapter('certificados')` (`src/main.ts`).

### 3.1 Anatomía del Contenedor Single Big Card (`data-mv-domain="certificados"`)

1. **Header Superior (`<header class="px-5 py-4 sm:px-6 sm:py-4 border-b border-slate-200 space-y-2">`):**
   - **Sub-fila 1:** Título `<h1>Certificados de Conformidad</h1>` + `actionsHtml` a la derecha. Para staff aprobado (`ADMIN` o `WORKER` con `status === 'APPROVED'`), `actionsHtml` renderiza únicamente el botón cuadrado icon-only **`+`**:
     - `data-action="open-create-cert"`, `w-9 h-9`, `bg-sky-700 hover:bg-sky-800 text-white rounded-lg`.
     - **Regla clave:** El directorio **no contiene formularios inline de creación**. El botón `+` navega directamente al Detail View en modo Alta (`'add'`).
   - **Sub-fila 2:** Subtítulo descriptivo conciso (`text-xs text-slate-500 max-w-3xl leading-snug`).
   - **Sub-fila 3 — Barra de Controles de 4 Columnas (`flex-wrap lg:flex-nowrap items-center justify-between gap-3`):**
     1. **Columna 1 — Toggle Sidebar (`#toggleMultiViewSidebarBtn`):** Botón cuadrado `h-9 w-9` con `data-toggle-sidebar="true"` e ícono hamburguesa SVG. Muestra un badge circular (`activeFacetCount`) en la esquina superior derecha si hay facetas activas.
     2. **Columna 2 — Buscador Unificado (`#certDirectorySearchInput`):**
        - **Regla estricta:** Siempre `type="text"` con `autocomplete="off"` y `data-universal-search="true"` (**nunca `type="search"`**, para evitar el botón `✕` nativo del navegador duplicado).
        - Muestra una única **`✕`** (`#clearCertSearchBtn`, `data-clear-search="true"`) cuando `searchQuery.length > 0`, o el badge de teclado **`/`** cuando está vacío.
        - Soporta atajo global `/` para enfocar y `Escape` para limpiar la búsqueda.
     3. **Columna 3 — Totalizador + Toggle Admin de Archivados:**
        - Checkbox `#showArchivedCheckbox` (`data-action="toggle-show-archived"`) **visible exclusivamente para `ADMIN` aprobado** (`canInspectArchived`), acompañado de badge numérico si `archivedItems.length > 0`.
        - Totalizador estandarizado con `tabular-nums`: `Mostrando {filteredCount} de {totalCount} certificados registrados`.
     4. **Columna 4 — Switcher de Presentación `[⊞ | ☰]`:** Grupo `role="group"` (`h-9 rounded-lg border border-slate-200 bg-slate-100/80 p-0.5`) con botones `data-view-mode="grid"` y `data-view-mode="list"`.

2. **Cuerpo Inferior (`flex flex-col lg:flex-row items-stretch`):**
   - **Panel Lateral de Facetas (`#multiViewFacetSidebar`, `w-full lg:w-64 xl:w-72`):**
     - **Sin encabezado textual "Filtros"** redundante.
     - Enlace superior e inferior `"Limpiar filtros"` (`data-clear-filters="true"`) visibles solo cuando `isFiltered === true`.
     - **4 Facetas Reactivas en `certificados`:**
       1. `estatus` — **Estatus** (extraído de `c.estatus`).
       2. `norma` — **Norma ISO** (extraído de `c.norma_codigo`).
       3. `sector_iaf` — **Sector IAF** (opciones ordenadas numéricamente: `Sector {num} · {desc}`).
       4. `modalidad` — **Modalidad** (`MULTISITIO` → *Multisitio* vs `SEDE_UNICA` → *Sede Única*, evaluando `c.multisitio || countMultisiteBranches(c.sitios) > 0`).
     - **Algoritmo Rest-Out ($S_{-k}$) (`computeReactiveFacetCounts`):**
       - Dentro de una misma categoría $F_k$: unión lógica **OR** entre checkboxes seleccionados (si no hay ninguno marcado, equivale a todos).
       - Entre categorías distintas + búsqueda textual: intersección **AND** (`filterRecordsWithFacets`).
       - Para calcular el conteo mostrado junto a cada opción de $F_k$, se evalúa el subconjunto $S_{-k}$ filtrado por `query` y por las selecciones activas de todas las **demás** categorías $F_j (j \neq k)$, evitando que seleccionar una opción ponga en `0` a sus hermanas del mismo grupo. Opciones con `count === 0` permanecen visibles atenuadas (`text-slate-400`).

### 3.2 Reglas del List View Limpio (`renderListViewTable`) y Tarjetas
- **Tabla `table-fixed` con zero scroll horizontal:** `<table class="w-full table-fixed ...">` combinada con `<colgroup>` cuyos porcentajes normalizados (`resolveColumnWidthPercentages`) suman estrictamente `100%`.
- **Redimensionamiento de columnas (`bindResizableTables`):** Los separadores `[data-resize-col]` en los encabezados (`role="separator"`, excepto la última columna) ajustan únicamente la columna arrastrada y su hermana derecha inmediata mediante `resizeAdjacentColumns`, respetando `minWidthPx` y persistiendo los anchos en `state.tableColumnWidths[tableId]`.
- **Regla de las 6 Columnas Limpias (`certificados-main`):**
  1. `organizacion` (23%, min 140px) — Nombre + `RIF`.
  2. `numero_certificado` (19%, min 120px) — Pill monospace `📜 {numero_certificado}`.
  3. `norma` (16%, min 100px) — `norma_codigo` + `esquema`.
  4. `sedes` (17%, min 110px, centrado) — Conteo de sucursales mediante `countMultisiteBranches(cert.sitios)` (`numero_sitio > 0`, excluyendo Sede 0).
  5. `estatus` (13%, min 95px, centrado) — Badge semántico con punto de color (`getStatusBadge`).
  6. `vigencia` (12%, min 95px, derecha) — `fecha_emision` y `→ fecha_vencimiento` en `tabular-nums`.
- **Prohibiciones estrictas en el List View:**
  - **Cero columna `Acciones`**.
  - **Cero columna `Cobertura Normativa`** en el directorio de certificados.
  - **Cero `<button>` o controles interactivos dentro de `<tbody>`**. Cada `<tr>` es clicable de punta a punta (`data-action="select-cert"`, `tabindex="0"`, activable también con `Enter` / `Space`).
- **Archivo Histórico para `ADMIN`:** Cuando `canInspectArchived && showArchived`, al final de la sección de datos se renderiza `#archivedRecordsSection` con badge `"Archivo Histórico"`, listado de registros con `deleted_at IS NOT NULL`, fecha, actor resuelto, motivo y botón `↺ Restaurar` (`data-action="restore-archived-record"`).

---

## 4. Detail View Unificado de 3 Zonas y Modelo `'read' | 'add' | 'edit'`

El Detail View unifica la lectura, el alta y la edición bajo **un único formulario y una sola arquitectura estructural** (`renderDetailPageTemplate` en `src/views/detailTemplate.ts` + `renderCertificadoDetailPage` en `src/views/certificadoView.ts`).

### 4.1 Máquina de Estados de Modo y RBAC (`resolveCertificadoDetailMode`)
```ts
export type CertificadoDetailMode = 'read' | 'add' | 'edit';

export function resolveCertificadoDetailMode(
  state: CertificadoViewState,
  isStaff: boolean,
  selectedCert?: CertificadoDetailEntity
): CertificadoDetailMode {
  if (!isStaff) return 'read';
  if (state.isCreating && !state.selectedCertId) return 'add';
  if (selectedCert && state.isEditingAttributes) return 'edit';
  return 'read';
}
```
- **Regla RBAC infranqueable:** Solo usuarios con `profile.status === 'APPROVED'` y `profile.role === 'ADMIN' | 'WORKER'` pueden resolver a `'add'` o `'edit'`. Cualquier `CLIENT`, `AUDITOR` o usuario no aprobado queda bloqueado en `'read'`, sin controles de mutación en el DOM.

### 4.2 Cabecera de Fila Única y Regla de Botones Icon-Only
La fila superior del Single Big Card mantiene una sola línea (`flex items-center justify-between gap-3 sm:gap-4`):
- **Izquierda:**
  - Botón volver `[←]` (`data-nav-back="true"`, `w-9 h-9`, icon-only, `title="Volver"`).
  - Ícono `📜` + `<h1 class="text-lg sm:text-xl font-bold tracking-tight text-slate-900 truncate min-w-0">` mostrando `'Nuevo Certificado'` en `'add'` o `cert.numero_certificado` en `'read'`/`'edit'`. (Sin subtítulos ni badges extra en la cabecera de Certificado).
- **Derecha en modo `'read'`:**
  - `[✏️]` `#startEditCertBtn` (`w-9 h-9`, solo staff).
  - `[🕒]` `data-action="open-changelog"` (`w-9 h-9`, historial forense de cambios).
  - `[🗄️]` `renderArchivarButtonHtml(..., { iconOnly: true })` → `data-action="open-archive-modal"` (`w-9 h-9`, solo staff autorizado vía `canArchiveRecord`).
- **Derecha en modo `'add'` o `'edit'` (`customTopActionsHtml`):**
  - Se ocultan `[✏️]`, `[🕒]` y `[🗄️]`.
  - Se renderizan **únicamente dos botones icon-only `w-9 h-9` con tooltip, en este orden exacto:**
    1. **Guardar (PRIMERO):** `<button type="submit" id="saveCertFormBtn" form="certificadoDetailForm" ...>` estilizado en verde esmeralda (`border-emerald-600 bg-emerald-600 hover:bg-emerald-700 text-white`), tooltip `"Crear certificado"` (`add`) o `"Guardar cambios"` (`edit`). Al usar `form="certificadoDetailForm"`, dispara nativamente el evento `submit` del `<form>` aunque esté fuera de él en el árbol DOM.
    2. **Cancelar (SEGUNDO):** `<button type="button" id="cancelEditCertBtn" ...>` estilizado en rojo suave (`border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700`), tooltip `"Cancelar creación"` (`add`) o `"Cancelar edición"` (`edit`).
  - **Cero botones al final del formulario:** Los botones inferiores de cancelar/guardar fueron eliminados intencionalmente; toda acción de formulario vive en la esquina superior derecha de la cabecera.

### 4.3 Zona 1 — Relaciones Superiores (`customParentZoneHtml`) y Cascada en Vivo
- **Contenedor:** `<section aria-label="Contexto y relaciones superiores">` con grilla compacta de 5 columnas en escritorio:
  `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5`
- **Controles:** 5 tarjetas (`Organización`, `Norma`, `Estatus`, `Sector IAF`, `Sub-Sector IAF`), cada una con etiqueta `text-[10px] font-bold uppercase tracking-wider text-slate-500` + asterisco obligatorio `*` (`text-rose-600`) y un `<select form="certificadoDetailForm" required>`:
  1. `#certParentOrganizacionSelect` (`name="id_organizacion"`)
  2. `#certParentNormaSelect` (`name="id_norma"`)
  3. `#certParentEstatusSelect` (`name="id_estatus"`)
  4. `#certParentSectorIafSelect` (`name="id_sector_iaf"`)
  5. `#certParentSubsectorIafSelect` (`name="id_subsector_iaf"`)
- **Comportamiento por modo:**
  - En **`'read'`**: los 5 `<select>` llevan `disabled` (`bg-slate-100/80 text-slate-800 cursor-not-allowed`) y muestran en la esquina superior derecha de cada tarjeta el botón de salto contextual `→` (`w-5 h-5`, `data-parent-nav="true"`). En particular, `Sub-Sector IAF` navega a `extra / iaf` con `data-target-tab="subsectores"`.
  - En **`'add'` / `'edit'`**: los 5 `<select>` están habilitados (`bg-white border-slate-300`), y los botones de salto `→` se ocultan para evitar pérdidas accidentales de edición.
  - **Hidratación defensiva de catálogos:** Si un certificado existente referencia una FK que aún no llegó en el catálogo filtrado, `renderCertificadoParentFieldsZone` inyecta temporalmente la opción asignada para garantizar consistencia visual.
- **Motor Puro + Cableado en Vivo de Cascada (`id_sector_iaf` → `id_subsector_iaf`):**
  1. `filterSubsectoresBySectorIaf` (`src/lib/multisiteSampling.ts`) retorna `[]` si `sectorId` está vacío (evitando sub-sectores huérfanos), filtra por `sub.id_sector_iaf === cleanSectorId || sub.sector_numero === matchedSector.sector` y ordena numéricamente por segmentos punteados (`17.1`, `17.2`, ..., `17.10`).
  2. `reconcileSubsectorSelectionOnSectorChange` conserva el sub-sector actual si sigue perteneciendo al nuevo sector; en caso contrario devuelve `''` para forzar nueva selección válida.
  3. En `src/main.ts`, el listener `change` de `#certParentSectorIafSelect` lee el borrador del DOM, actualiza `state.certificadoDomain.formDraft` y reescribe in-place `certParentSubsectorIafSelect.innerHTML` + `.value` **sin invocar `render()` completo**, preservando scroll, foco y valores ya tipeados en el resto del formulario.
- **Separador:** Tras Zona 1 se renderiza `<hr class="border-t border-slate-200 my-2.5 sm:my-3" />`.

### 4.4 Zona 2 — Atributos Directos (`<form id="certificadoDetailForm">`) y UX de Campos
La Zona 2 contiene únicamente los 3 atributos directos mutables de `public.certificado` (sin incluir datos derivados o agregados en el formulario):
1. **Número de Certificado (`#certNumeroInput`):** `<input type="text" required minlength="3" maxlength="100">`, etiqueta con `*`, estilo `font-mono font-bold`.
2. **Esquema Multisitio (`#certMultisitioCheckbox`):**
   - **Regla de etiqueta booleana:** Aunque la columna PostgreSQL es `BOOLEAN NOT NULL DEFAULT FALSE`, un booleano que puede ser `ON` u `OFF` **NO debe llevar `*` en su etiqueta**, porque induciría erróneamente al usuario a pensar que debe estar marcado (`true`). En total, Zona 1 + Zona 2 tienen exactamente **7 asteriscos `*`** (5 FKs + `numero_certificado` + `alcance`).
   - **Estética de alto contraste en modo `'read'` (disabled):** Los checkboxes nativos deshabilitados suelen verse apagados y ambiguos. Para hacerlo inequívoco en solo lectura:
     - Se aplica `appearance-none` al `<input disabled>`.
     - Cuando está **activo (`true`)**: la caja se pinta `border-emerald-600 bg-emerald-600` con un `<svg>` blanco absoluto encima (`<polyline points="4 10 8 14 16 6" />`), contenedor `border-emerald-200 bg-emerald-50/70 text-emerald-900 font-bold`, texto `"Sí · Esquema Multisitio (...)"` e ícono `🏢`.
     - Cuando está **inactivo (`false`)**: caja `border-slate-300 bg-white`, contenedor `border-slate-200 bg-slate-100/80 text-slate-600 font-semibold`, texto `"No · Sede Única (Principal)"` e ícono `📍`.
   - En `'add'` / `'edit'`, un listener `change` actualiza inmediatamente `#certMultisitioLabelText` y `#certMultisitioIcon` sin re-renderizar toda la página.
3. **Alcance de la Certificación (`#certAlcanceInput`):** `<textarea rows="3" required minlength="10" maxlength="1000">`, etiqueta con `*`, acompañado de `#certAlcanceLiveCounter` (`(X / 1000 caracteres)` en `tabular-nums`) actualizado en vivo en cada evento `input` con cambio automático a `text-rose-600` fuera del rango `[10, 1000]`.

### 4.5 Retroalimentación: Error Inline vs Toast Flotante No Invasivo
- **Errores de validación (`feedbackHtml`):** En `'add'` (`createErrorMessage`) o `'edit'` (`editErrorMessage`) se muestra un único banner inline `bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-medium` dentro de Zona 2.
- **Éxitos de guardado (`showFloatingToast` + `renderArchiveToast`):**
  - En el detalle de `certificado`, **NO se renderiza barra verde inline** (se eliminó para no alterar la geometría ni desplazar el layout).
  - Al persistir cambios válidos (`INSERT`, `UPDATE`, o archivo lógico), `src/main.ts` invoca `showFloatingToast(message, 'success', 4500)`.
  - `renderArchiveToast` renderiza `#archiveGovernanceToast` desacoplado del flujo en la parte inferior centrada de la ventana (`fixed bottom-5 left-1/2 -translate-x-1/2 z-50`), sin bloquear la interacción con el resto de la página, con botón **`✕`** (`#dismissArchiveToastBtn`) para cierre manual y temporizador automático (`window.setTimeout`) de **4500 ms**.

### 4.6 Zona 3 — Pestañas Hijas Orientadas a Lista (`renderActiveChildTab`)
- En modo **`'add'`** (`isCreateMode: true`), toda la Zona 3 se omite limpiamente porque el registro aún no existe en base de datos.
- En modos **`'read'`** y **`'edit'`**, se renderizan **7 pestañas** mediante `renderListViewTable` (`data-cert-tab="<tab>"`), todas ordenables por encabezado, redimensionables (`cert-tab-<tab>`), clicables por fila completa y con **cero botones dentro de `<tbody>`**:
  1. `sitios` (**📍 Sitio**): Aplica `sortSitesWithPrincipalFirst` cuando no hay orden activo, garantizando **Sitio 0 (Sede Central / Principal) siempre primero**. El conteo de sucursales multisitio (`countMultisiteBranches`) excluye explícitamente a Sitio 0 (`numero_sitio > 0`). Clic en fila → `select-sitio-preview`.
  2. `procesos` (**⚙️ Proceso**): Muestra tipo (`Estratégico`, `Medular`, `De Apoyo`, `Otro`), responsable y cláusulas cubiertas. Clic en fila → `select-proceso-preview`.
  3. `turnos` (**⏱️ Turno**): Horario, trabajadores y sedes vinculadas. Clic en fila → `select-turno-preview`.
  4. `no_aplicables` (**🚫 No Aplicables**): Cláusulas excluidas con justificación técnica (ISO 4.3) y empty state positivo `"Aplicabilidad Completa"`. Clic en fila → `select-no-aplicable` (abre modal de cláusula en Norma LTREE).
  5. `auditorias` (**📋 Auditoría**): Auditorías vinculadas con metodología, fecha y auditor líder. Clic en fila → `select-prog-audit-by-code`.
  6. `fechas` (**📅 Fecha**): Tabla simplificada pura (3 columnas: `tipo_fecha`, `fecha`, `estado_temporal`), **sin texto introductorio, sin botón `+ Registrar Fecha` y sin formularios inline**. Clic en fila → `select-fecha-detail` (`fechaView.ts`).
  7. `contactos` (**👤 Contacto**): Tabla simplificada pura (4 columnas: `nombre`, `cargo`, `telefonos_resumen`, `emails_resumen`), **sin texto introductorio, sin botón `+ Nuevo Contacto` y sin formularios inline**. Clic en fila → `select-contacto-detail` (`contactoView.ts`).

### 4.7 Precedencia de Subentidades en `renderCertificacionView` (`src/views/certificacionView.ts`)
Cuando `activeSubSection` apunta a `certificates`, `certificacionView.ts` resuelve cuál vista renderizar evaluando **de hoja a raíz** en este orden estricto:
`resolvedTelefono` > `resolvedEmail` > `resolvedContacto` > `resolvedFecha` > `resolvedTurno` > `resolvedProceso` > `resolvedSitio` > `renderCertificadoView` (Detalle o Directorio de Certificado).

---

## 5. Flujo de Datos: Hidratación, Validación, Persistencia, Gobernanza y Pruebas

### 5.1 Hidratación Paralela (`loadLiveCertificates` en `src/main.ts`)
1. Ejecuta `Promise.all` contra Supabase filtrando `.is('deleted_at', null)` en:
   - `certificado` con joins anidados (`organizacion`, `norma`, `estatus`, `sector_iaf`, `subsector_iaf`)
   - `fecha_certificado`
   - `contacto_certificado`
   - `telefono_contacto_certificado`
   - `email_contacto_certificado`
2. Indexa teléfonos y correos por `id_contacto`, contactos y fechas por `id_certificado`, y deriva dinámicamente `fecha_emision` / `fecha_vencimiento` mediante `deriveCertificateVigenciaDates`.
3. Invoca `cobertura_normativa_certificado` y conteo de `sitio` activos para alimentar métricas del resumen.
4. **Aislamiento de semillas por rol:** Solo `ADMIN` y `WORKER` aprobados reciben registros semilla suplementarios (`SAMPLE_CERTIFICATE_RECORDS` / `INITIAL_CERTIFICADOS_DETAILED`); los roles `CLIENT` y `AUDITOR` quedan estrictamente acotados a los registros autorizados por RLS en base de datos.

### 5.2 Validación Unificada y Persistencia (`INSERT` / `UPDATE`)
Al enviar `#certificadoDetailForm`:
1. `readCertificadoFormDraftFromDom()` construye un `CertificadoFormDraft` fresco desde el DOM.
2. `validateCertificadoFormDraft(...)` valida en un solo lugar:
   - Trim obligatorio de cadenas.
   - Presencia no vacía de las 5 FKs (`id_organizacion`, `id_norma`, `id_estatus`, `id_sector_iaf`, `id_subsector_iaf`).
   - Coherencia relacional estricta `id_sector_iaf` → `id_subsector_iaf` vía `filterSubsectoresBySectorIaf`.
   - Longitud de `numero_certificado` entre 3 y 100 caracteres + unicidad case-insensitive (`currentCertId` excluido en `'edit'`).
   - `validateAlcance`: entre 10 y 1000 caracteres tras `.trim()`.
3. Si falla, persiste el borrador en `state.certificadoDomain.formDraft`, asigna `createErrorMessage` o `editErrorMessage` y re-renderiza sin perder datos capturados.
4. Si es válido:
   - **`mode === 'add'`:** Genera `newId = crypto.randomUUID()`, inserta `newCert` en `allCertificadosDetailed` y `exploration.records`, cambia `selectedCertId = newId`, `isCreating = false`, reemplaza el breadcrumb `'cert-new'` por `'cert-' + newId`, registra `'INSERT'` con `recordPhase5SessionLog`, muestra toast `'Certificado creado exitosamente.'` y ejecuta `supabase.from('certificado').insert(...)` cuando las 5 FKs cumplen `STRICT_UUID_PATTERN`.
   - **`mode === 'edit'`:** Actualiza `allCertificadosDetailed`, `exploration.records` y el segmento correspondiente en `state.breadcrumbs`, limpia flags de edición, registra `'UPDATE'` con `recordPhase5SessionLog`, muestra toast `'Atributos del certificado guardados exitosamente.'` y ejecuta `supabase.from('certificado').update(...)` cuando ID y FKs cumplen `STRICT_UUID_PATTERN`.

### 5.3 Gobernanza Soft-Delete y Seguridad en PostgreSQL (`01_creacion.sql`, `04_rls.sql`)
- **Bloqueo total de borrado físico:** `REVOKE DELETE` para `anon` y `authenticated` + trigger `trg_prevent_hard_delete_certificado`.
- **Guardia de dependencias activas:** Al abrir `[🗄️]`, el cliente llama al RPC `get_archive_dependency_summary('certificado', id)` (y el trigger `trg_guard_archival_certificado` lo revalida en BD). Se bloquea el archivo mientras exista cualquier registro activo en las 6 tablas hijas: `sitio`, `proceso`, `auditoria`, `requisitos_no_aplicables_certificado`, `fecha_certificado`, `contacto_certificado`.
- **Ejecución de archivo lógico:** Confirmado en `#archiveGovernanceModalBackdrop`, se ejecuta el RPC `SECURITY DEFINER` `archive_record('certificado', id, reason)` (restringido a `is_approved_worker()`), que sella `deleted_at = NOW()`, `deleted_by = auth.uid()` y `delete_reason`.
- **Restauración (`ADMIN`):** Desde la sección `"Archivo Histórico"` en el Multi View, `ADMIN` restaura ejecutando `UPDATE ... SET deleted_at = NULL, delete_reason = NULL` (el trigger `fn_sync_soft_delete_metadata` limpia `deleted_by` y `delete_reason` automáticamente) y rehidrata los snapshots en memoria.
- **Bitácora Forense Inmutable:** `audit_certificado_trigger` escribe en `public.audit_log` (protegida contra `UPDATE`/`DELETE` por `trg_audit_log_immutable`), consultable desde el botón `[🕒]`.

### 5.4 Puerta de Verificación Automatizada (`node:test`)
Toda réplica o evolución de un dominio bajo esta receta debe validar sus pruebas unitarias y de integridad antes de aprobar cambios:
1. `npx tsx --test src/lib/multisiteSampling.test.ts` — Contratos, factorías, cascada, validador unificado, Sitio 0.
2. `npx tsx --test src/lib/certificadoSubEntities.test.ts` — Subentidades y traducción de errores SQL.
3. `npx tsx --test src/lib/detailViewsPhase42.test.ts` — Render `read`/`add`/`edit`, Zona 1, Zona 2, 7 pestañas y precedencia.
4. `npx tsx --test src/lib/phase421DetailTemplate.test.ts` — Contrato `renderDetailPageTemplate` (`isCreateMode`, `customParentZoneHtml`, `customTopActionsHtml`).
5. `npx tsx --test src/lib/phase62UiIntegrity.test.ts` — Cero-UUID, `table-fixed`, ausencia de botones en `<tbody>`, RBAC y breadcrumbs.
6. `npm run lint` y `npm run build` — Verificación de tipado estricto (`0 any`) y bundle Vite 6.
