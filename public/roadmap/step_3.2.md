# Paso 3.2 — Adopción de Multi View por `Organización` + Pop-up Agrupado en `Vínculo` y `1. Designación`

## 1. Objetivo
Migrar las primeras 6 secciones objetivo al patrón unificado del **Paso 3.1** (Multi View basada en **`Organización`** + Pop-up con buscador, Col 1 agrupando auditoría/lote vinculado, Col 2 un certificado por fila, Col 3+ columnas específicas del dominio):
1. Bloque 2: **`Vínculo`** (`vinculoView.ts` / `vinculoDomain.ts`)
2. Bloque 1 Paso `1.1`: **`Relación`** (`relacionView.ts` / `relacionDomain.ts`)
3. Bloque 1 Paso `1.2`: **`Tipo`** (`designacionTipoView.ts` / `designacionTipoDomain.ts`)
4. Bloque 1 Paso `1.3`: **`Fecha`** (`designacionFechaView.ts` / `designacionFechaDomain.ts`)
5. Bloque 1 Paso `1.4`: **`Sitio`** (`designacionSitioView.ts` / `designacionSitioDomain.ts`)
6. Bloque 1 Paso `1.5`: **`Temporal`** (`designacionTemporalView.ts` / `designacionTemporalDomain.ts`)

---

## 2. Archivos Involucrados
- `src/lib/vinculoDomain.ts` y `src/views/vinculoView.ts`
- `src/lib/relacionDomain.ts` y `src/views/relacionView.ts`
- `src/lib/designacionTipoDomain.ts` y `src/views/designacionTipoView.ts`
- `src/lib/designacionFechaDomain.ts` y `src/views/designacionFechaView.ts`
- `src/lib/designacionSitioDomain.ts` y `src/views/designacionSitioView.ts`
- `src/lib/designacionTemporalDomain.ts` y `src/views/designacionTemporalView.ts`
- `src/main.ts` (estado `pickerOrgId` + `pickerSearchQuery` en las 6 secciones y delegación de eventos `open-org-cert-picker`, `search-org-picker-modal`, `select-org-picker-cert`, `close-org-cert-picker`)
- Tests asociados (`vinculoDomain.test.ts`, `relacionDomain.test.ts`, `designacionTipoView.test.ts`, `designacionSitioView.test.ts`, `auditMultiViews.test.ts`, `phase412MultiView.test.ts`, etc.)

---

## 3. Especificación Técnica Detallada por Sección

### 3.1. `Vínculo` (Bloque 2)
- **Multi View por Organización:** reemplaza la tabla raíz centrada en `Conglomerado` por filas basadas en **`Organización`** (manteniendo el nombre de conglomerado como metadata/faceta de filtro `Conglomerado`, `Estado LIBRE`, `Naturaleza activa`, y permitiendo buscar por organización, conglomerado o certificado).
- **Pop-up Modal de Organización:**
  - **Col 1 (`Vínculo / Lote`):** agrupa los certificados que pertenecen a la misma caja `vinculo` en Bloque 2 (o marca `LIBRE` si el certificado aún no está en una caja).
  - **Col 2 (`Certificado`):** 1 certificado por fila (`numero_certificado`, norma, versión).
  - **Col 3 (`Naturaleza`):** `Individual`, `Combinada`, `Integrada`, `Mixta`, `Multientidad` o `LIBRE`.
  - **Col 4 (`Alcance / Estado`):** resumen breve de alcance o estatus del certificado.
- **Al hacer clic en un certificado:** abre la Vista Detalle / workspace de gestión de cajas de `Vínculo` correspondiente a su conglomerado/organización resaltando el certificado seleccionado (sin perder la capacidad de crear/editar cajas multi-empresa ni mover certificados `LIBRE`).

### 3.2. `1.1 Relación` (Bloque 1)
- **Multi View por Organización:** sustituye el listado mixto `Conglomerado/Organización` por filas estandarizadas de **`Organización`**, conservando facetas (`Naturaleza`, `Origen Bloque 2 vs Personalizada`, `Estado Ciclo`).
- **Pop-up Modal:** reemplaza `renderRelacionPickerModal` (antiguas tarjetas apiladas) por `renderOrgCertPickerModal`:
  - Barra de búsqueda interna.
  - **Col 1 (`Auditoría Vinculada`):** agrupa certificados de la misma auditoría vinculada (o `Individual`).
  - **Col 2 (`Certificado`):** 1 fila por certificado.
  - **Col 3 (`Última Auditoría`):** codename compacto + estado ciclo.
  - **Col 4 (`Relación`):** naturaleza efectiva vs base Bloque 2.
  - Clic en fila → entra al detalle de `Relación` (`selectedCertId`, `selectedAuditId`).

### 3.3. `1.2 Tipo`, `1.3 Fecha`, `1.4 Sitio`, `1.5 Temporal` (Bloque 1)
- **Multi View por Organización:** reemplaza las tablas raíz por certificado de cada una de estas 4 secciones por el Multi View unificado basado en **`Organización`**, manteniendo:
  - Facetas propias de cada dominio (`Tipo`: pendiente/definido, naturaleza; `Fecha`: programada/reprogramada/sin fecha, urgencia; `Sitio`: completo/pendiente, multimodalidad; `Temporal`: ON/OFF/sin auditoría, lote).
  - Botón `+ Auditoría` en la cabecera de la vista para staff.
  - Búsqueda única por organización, certificado, norma, sitio o codename.
- **Pop-up Modal específico por dominio:**
  - **`Tipo`:** Col 1 `Auditoría Vinculada` | Col 2 `Certificado` | Col 3 `Última Auditoría` | Col 4 `Tipo Asignado`.
  - **`Fecha`:** Col 1 `Auditoría Vinculada` | Col 2 `Certificado` | Col 3 `Fecha Programada` | Col 4 `Estado / Urgencia`.
  - **`Sitio`:** Col 1 `Auditoría Vinculada` | Col 2 `Certificado` | Col 3 `Sitios Designados (N/Total)` | Col 4 `Última Auditoría`.
  - **`Temporal`:** Col 1 `Auditoría Vinculada` | Col 2 `Certificado` | Col 3 `Sitio Temporal (ON/OFF)` | Col 4 `Días Temp.`.
- Clic en fila de certificado en cualquiera de las 4 secciones abre su Vista Detalle manteniendo el mismo `(selectedCertId, selectedAuditId)`.

---

## 4. Criterios de Aceptación
1. Las 6 secciones (`Vínculo`, `Relación`, `Tipo`, `Fecha`, `Sitio`, `Temporal`) muestran Multi View basada en `Organización` (Grid y List, facetas laterales y buscador).
2. Hacer clic en cualquier organización en cualquiera de las 6 secciones abre el Pop-up con barra de búsqueda y tabla agrupada (Col 1 vinculada, Col 2 un certificado por fila, Col 3+ dominio).
3. Hacer clic en un certificado dentro del pop-up navega directo a su Vista Detalle sin exponer UUIDs y respetando RBAC y Nivel 2 `CLIENT`.

---

## 5. Verificación
- `npx tsx --test src/lib/vinculoDomain.test.ts src/lib/relacionDomain.test.ts src/lib/designacionTipoView.test.ts src/lib/designacionSitioView.test.ts src/lib/auditMultiViews.test.ts src/lib/phase412MultiView.test.ts`
- `npx tsc --noEmit && npm run lint && npm run build`
