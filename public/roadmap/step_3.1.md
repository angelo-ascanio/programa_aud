# Paso 3.1 — Componente y Dominio Compartido: Multi View por `Organización` + Pop-up Agrupado por Auditoría Vinculada

## 1. Objetivo
Construir la arquitectura reutilizable (dominio puro + renderer UI) que estandarizará las **13 secciones** (`Vínculo`, `Relación`, `Tipo`, `Fecha`, `Sitio`, `Temporal`, `Tiempo`, `Auditor`, `Proceso`, `Turno`, `Resultado`, `Revisión`, `Resumen`):
1. **Multi View basada en `Organización`** (manteniendo tarjetas en **Grid**, tabla `table-fixed` en **List**, facetas reactivas laterales y barra única de búsqueda por organización, certificado, norma, código/codename y datos del dominio).
2. **Pop-up Modal por Organización** con:
   - **Barra de búsqueda interna** para filtrar certificados cuando la organización tenga muchos registros.
   - **Tabla estructurada (`table-fixed`, `<colgroup>` 100%, `0 <button>` en `<tbody>`)**:
     - **Columna 1:** agrupa los certificados bajo una misma **auditoría vinculada** (y muestra `Individual` cuando un certificado no está vinculado a otro en la misma auditoría/lote).
     - **Columna 2:** lista **1 certificado por fila** (código de certificado, norma y versión si aplica).
     - **Columnas adicionales:** columnas específicas definidas por cada sección (ej. naturaleza, tipo, fecha programada, sitios, temporal, días, auditores, procesos, turnos, hallazgos, revisión, estatus).
   - Clic en cualquier fila de certificado dentro del pop-up cierra el modal y abre la **Vista Detalle** de esa sección para ese certificado (y su auditoría correspondiente).

---

## 2. Archivos Involucrados
- `src/lib/orgMultiViewPickerDomain.ts` **(nuevo)**
- `src/views/orgMultiViewPickerView.ts` **(nuevo)**
- `src/lib/orgMultiViewPickerDomain.test.ts` **(nuevo)**
- `src/views/orgMultiViewPickerView.test.ts` **(nuevo)**

---

## 3. Especificación Técnica Detallada

### 3.1. Modelo de Filas por `Organización` (`orgMultiViewPickerDomain.ts`)
- `buildOrgMultiViewRows<TSectionCertMeta>(opts)`:
  - Recibe `profile`, `organizaciones`, `certificados`, `audits`, `programs`, `vinculos`, `authorizedClientOrgIds`, `assignedAuditCertIds` y un resolver de metadatos de dominio por certificado.
  - **RBAC y Nivel 2:**
    - `ADMIN` / `WORKER`: ven todas las organizaciones activas con certificados visibles.
    - `AUDITOR`: ve organizaciones con al menos un certificado o auditoría accesible según política de lectura.
    - `CLIENT`: estrictamente filtrado a `authorizedClientOrgIds` (**Nivel 2**).
  - Para cada `OrganizacionEntity` activa (`!deleted_at`):
    - `orgId`, `nombre`, `abreviacion`, `nombreCorto` (`resolveShortOrganizacionName`), `rif`, `conglomeradoId`, `conglomeradoShortName` (informativo para faceta/búsqueda, **la fila raíz del Multi View es la Organización**).
    - `certificates`: certificados activos de esa organización con su metadato específico de dominio (`domainExtra`).
    - `certsCount`, `linkedAuditGroupsCount`, `auditsCount`.
    - `searchHaystack`: concatena nombre completo, abreviación, RIF, conglomerado, números de certificado, normas, códigos de auditoría, codenames (`formatAuditCodename`) y texto adicional del dominio —permitiendo buscar por **organización, certificado u otros** desde la barra principal.

### 3.2. Modelo del Pop-up Agrupado por Auditoría Vinculada (`buildOrgCertPickerModalModel`)
- Dado un `orgId` seleccionado y una consulta `modalSearchQuery`:
  - Agrupa los certificados de la organización por su **contexto de auditoría vinculada actual / última auditoría** (o por caja/lote de vínculo cuando aplique, ej. en `Vínculo` o `Relación`):
    - Si ≥ 2 certificados de la organización (o del grupo) comparten una misma **auditoría vinculada** (`id_programa_auditoria` con `es_vinculada === true` y `siblingAuditIds.length > 1`, o en `Vínculo` comparten caja activa en Bloque 2), forman un **grupo de auditoría vinculada** con etiqueta clara (ej. `"Combinada · 2026-01 Renov."` o nombre de lote + naturaleza, **sin UUIDs**).
    - Los certificados con auditoría `Individual` o `Sin auditorías` forman grupos unitarios (`Individual` / `Sin auditorías`).
  - **Filtro por búsqueda del pop-up (`modalSearchQuery`):**
    - Filtra en vivo por número de certificado, norma, versión, etiqueta de auditoría vinculada, codename o texto específico de las columnas de dominio.
  - **Estructura tabular plana con información de agrupación (`OrgPickerTableRow[]`):**
    - Ordena primero los grupos vinculados (juntando todas las filas del mismo grupo de forma contigua para poder renderizar **Columna 1** agrupada con `rowspan` limpio), seguidos por los individuales y sin auditoría.
    - Cada entrada indica: `groupKey`, `groupLabel`, `groupSubLabel`, `isLinkedGroup`, `isFirstRowInGroup`, `groupRowSpan` (número exacto de filas visibles del grupo tras aplicar `modalSearchQuery`), `certId`, `auditId`, `numero_certificado`, `norma_codigo`, `version_numero`, `domainCells`.

### 3.3. Renderer Compartido (`src/views/orgMultiViewPickerView.ts`)
- **`renderOrgMultiView(...)`:** envuelve `renderUniversalTemplate` con:
  - Facetas laterales reactivas configurables por cada sección (`facetCategories`).
  - Vista **List** (`table-fixed`, `<colgroup>` 100%, `0 <button>` en `<tbody>`): columnas estándar de Organización (`Organización` con abreviación/nombre y conglomerado, `Certificados`, `Auditorías / Vínculos`) + columnas de dominio por sección; clic en `<tr>` (`data-action="open-org-cert-picker" data-org-id="..."`) abre el pop-up.
  - Vista **Grid**: tarjetas por `Organización` con las mismas métricas y clic (`role="button"` en `<article>`) para abrir el pop-up.
  - Mantiene botón `+ Auditoría` en acciones superiores para staff donde corresponda.
- **`renderOrgCertPickerModal(...)`:**
  - Modal accesible (`role="dialog"`, `aria-modal="true"`, cierre por `✕`, `Cancelar` o clic en backdrop).
  - Cabecera con nombre corto + tooltip nombre completo de la Organización, conteo de certificados y auditorías.
  - **Barra de búsqueda interna única** (`<input type="search" data-action="search-org-picker-modal" ...>`) con botón limpiar cuando haya texto.
  - **Tabla del Pop-up (`table-fixed`, `<colgroup>` sumando `100%`, `0 <button>` dentro de `<tbody>`):**
    - **`<th> 1`: `Auditoría Vinculada / Tipo`** — celda `<td rowspan="${row.groupRowSpan}">` solo cuando `row.isFirstRowInGroup === true`, mostrando badge limpio de la auditoría vinculada (ej. `Combinada (2)`, `Integrada (3)`, `Individual`).
    - **`<th> 2`: `Certificado`** — 1 fila por certificado (`numero_certificado`, versión `vN`, `norma_codigo`).
    - **`<th> 3..N`: Columnas específicas de la sección** (pasadas como `ColumnDefinition` / renderers).
    - Atributos en cada `<tr>` del `<tbody>`: `data-action="select-org-picker-cert" data-cert-id="..." data-audit-id="..." class="cursor-pointer hover:bg-indigo-50/50 ..."` (al hacer clic sobre la fila de certificado, entra a la Vista Detalle de esa sección).
    - **Nota importante de `rowspan`:** cuidar que al hacer hover/clic en la fila 2+ de un grupo con `rowspan`, el `<td rowspan>` de la Columna 1 no tenga `data-action` conflictivo o tenga estilos consistentes, colocando `data-action="select-org-picker-cert"` en las celdas de certificado o en el `<tr>` asegurando que `event.target.closest('tr[data-cert-id]')` resuelva siempre el certificado de esa fila exacta (`row.certId`) sin ambigüedad cuando se hace clic en Columna 2..N.

---

## 4. Criterios de Aceptación
1. La Multi View compartida agrupa por `Organización`, soporta Grid + List, facetas reactivas y búsqueda por organización/certificado/datos de dominio.
2. El Pop-up incluye barra de búsqueda funcional en tiempo real, Columna 1 agrupando certificados de la misma auditoría vinculada (`rowspan` dinámico según filtro), Columna 2 con 1 certificado por fila y columnas de dominio extensibles.
3. Cero `<button>` dentro de `<tbody>`, `<colgroup>` suma exactamente `100%`, `0 any`, `Zero-UUID`, y aislamiento Nivel 2 de `CLIENT`.

---

## 5. Verificación
- `npx tsx --test src/lib/orgMultiViewPickerDomain.test.ts src/views/orgMultiViewPickerView.test.ts`
- `npx tsc --noEmit && npm run lint && npm run build`
