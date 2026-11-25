# Paso 5.1: Estandarización Global de Codenames y Nombres Cortos ("Less Is More")

## Objetivo del Paso
Unificar la presentación visual en todo **Bloque 1 (`Auditoría`)** y **Bloque 2 (`Certificación`)** para que siempre priorice identificadores ultra-limpios y legibles: **codename compacto de auditoría (`2026-11 Seg.1`)** y **nombre corto / abreviación de conglomerado y organización**, manteniendo el código interno (`AUD-2026-...`) solo en tooltips o búsqueda interna y garantizando cero regresiones de tablas (`table-fixed` `<colgroup>` 100%, cero `<button>` en `<tbody>`).

---

## Archivos Afectados
- `src/lib/conglomeradoDomain.ts` y `src/views/conglomeradoView.ts` (edición/visualización de `abreviacion` en Conglomerado)
- `src/lib/breadcrumb.ts` y `src/views/auditCardBreadcrumb.ts` (codename compacto y nombre corto de empresa/conglomerado en cabecera y migas)
- `src/views/auditSectionShell.ts` (chips Zone 1 y selectores compactos entre auditorías del lote)
- `src/views/calendarioView.ts` (tarjetas Kanban, barras Gantt, celdas de tabla y tooltip con `formatAuditCodename`)
- `src/views/resumenView.ts` (selector superior, tarjetas y filas de resumen con codename compacto + abreviación corta)
- `src/views/organizacionView.ts` y `src/views/certificadoView.ts` (chips/badges de conglomerado corto y lista de auditorías con codename)
- Vistas del pipeline Bloque 1: `src/views/designacionTipoView.ts`, `src/views/designacionFechaView.ts`, `src/views/designacionSitioView.ts`, `src/views/designacionTemporalView.ts`, `src/views/tiempoView.ts`, `src/views/asignacionView.ts`, `src/views/programaProcesosView.ts`, `src/views/programaTurnosView.ts`, `src/views/resultadoView.ts`, `src/views/revisionView.ts`
- `src/main.ts` (guardado de `grupo_empresarial.abreviacion` al crear/editar Conglomerado; labels de breadcrumbs al navegar a auditorías)
- Tests asociados que validen etiquetas/renders modificados

---

## Cambios Técnicos Detallados

### 1. Edición y Visualización de `abreviacion` en Conglomerados
- **`src/lib/conglomeradoDomain.ts` & `src/views/conglomeradoView.ts`:**
  - Añadir campo editable `abreviacion` en el formulario de crear/editar Conglomerado (`validateConglomeradoForm`), con sugerencia automática vía `resolveShortConglomeradoName` si se deja en blanco o input explícito corto (máx `24` chars).
  - Actualizar tabla/tarjetas de `conglomeradoView.ts` para destacar el nombre corto en títulos/badges y permitir buscar tanto por nombre completo como por `abreviacion`.
- **`src/main.ts`:**
  - Persistir `abreviacion` en `insert`/`update` de `public.grupo_empresarial` y actualizar estado local al instante.

### 2. Adopción Transversal de `formatAuditCodename` en Bloque 1
Para cada vista del pipeline Bloque 1 (`Calendario`, `Relación`, `Designación {Tipo, Fecha, Sitio, Temporal}`, `Tiempo`, `Auditor`, `Proceso`, `Turno`, `Resultado`, `Revisión`, `Resumen`) y componentes compartidos (`auditCardBreadcrumb.ts`, `auditSectionShell.ts`, `breadcrumb.ts`):
- Reemplazar las apariciones principales de `audit.codigo_auditoria` largo (`AUD-2026-QMS01-001`) por **`formatAuditCodename(audit)`** (`2026-11 Seg.1`), conservando `audit.codigo_auditoria` únicamente en:
  - atributo `title="..."` (tooltip al pasar el cursor)
  - lógica de filtrado/búsqueda (`normalizeAuditText`) para que seguir buscando por `AUD-2026-...` o por `2026-11 Seg.1` funcione en ambas direcciones.
- En selectores de certificado/empresa, chips Zone 1 y tarjetas de selección:
  - Usar `resolveShortConglomeradoName` y `resolveShortOrganizacionName` (en lugar de razón social jurídica extensa) manteniendo nombre completo en `title` tooltip.
- Auditar que todas las tablas sigan cumpliendo:
  - `table-fixed` + `<colgroup>` cuya suma sea exactamente `100%`.
  - Cero `<button>` dentro de `<tbody>`.
  - Cero texto en inglés / cero UUIDs expuestos.

### 3. Limpieza de Textos y Estándar "Less Is More"
- Revisar cabeceras de `Relación`, `Vínculo`, `Designación`, `Calendario` y `Resumen` para eliminar párrafos redundantes, manteniendo jerarquía tipográfica nítida y densidad escaneable tanto en Desktop (`1440px`) como en Mobile (`390px`).

---

## Criterios de Aceptación y Verificación
- Búsqueda estática en `src/views/` confirma adopción consistente de `formatAuditCodename` y `resolveShortConglomeradoName` / `resolveShortOrganizacionName`.
- `npm test` completo pasa al 100% tras actualizar aserciones que esperaban el formato antiguo largo en vistas UI.
- `npx tsc --noEmit`, `npm run lint` y `npm run build` pasan sin errores ni warnings nuevos.
