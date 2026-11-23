# Step 3.1 — Hidratación, Estado Global (`src/main.ts`), `Conglomerado`, `Breadcrumbs` y Buscador

## Objetivo del Paso
Adaptar la capa de hidratación desde Supabase (`src/main.ts`, `paginatedHydration.ts`) para cargar y ensamblar `organizacion_version`, `certificado_version` junto con sus historiales de versiones, y el nuevo modelo **`alcance` + `alcance_certificado_compartido`**, propagando `abreviacion`, badges de versión (`vN`) y `alcance_es` / `alcance_en` al estado global, vistas de `Conglomerado`, `Breadcrumbs` y buscador (`searchControls.ts`), manteniendo compatibilidad estricta de RBAC para los 4 roles.

---

## Archivos a Crear / Modificar
- `src/main.ts`
- `src/lib/paginatedHydration.ts`
- `src/lib/conglomeradoDomain.ts`
- `src/views/conglomeradoView.ts`
- `src/lib/breadcrumb.ts`
- `src/lib/searchControls.ts`
- `src/lib/conglomeradoDomain.test.ts`
- `src/lib/breadcrumb.test.ts`
- `src/lib/searchControls.test.ts`

---

## Especificación Técnica Detallada

### 1. Hidratación Supabase en `src/main.ts` (`loadDomainData` / `loadLiveDomainCatalogs` / `loadLiveCertificates` / `loadLiveArchiveData`)
1. **`organizacion_version`:**
   - Consultar `organizacion_version` (`version_numero DESC`) ensamblando `abreviacion`, `id_organizacion_version_actual`, `version_actual_numero` y `versiones[]` en `allOrganizaciones` y `organizations`.
2. **`alcance` y `alcance_certificado_compartido`:**
   - Consultar `public.alcance` y `public.alcance_certificado_compartido` activos (`deleted_at IS NULL`, más archivados en `loadLiveArchiveData` para `ADMIN`).
   - Resolver para cada `CertificadoDetailEntity` su `alcanceDetalle` único vigente (propio si existe fila en `alcance` para `cert.id`, o compartido si existe enlace activo en `alcance_certificado_compartido`, incluyendo `sharedTargetCerts`, `esCompartido` y `origenCertificadoNumero`), dejando `alcanceDetalle = null` cuando el certificado aún no tiene alcance.
3. **`certificado_version` y Sub-Entidades por Versión:**
   - Consultar `certificado_version` (sin campo `alcance`), y agrupar `sitio`, `proceso`, `procesos_por_sitio`, `requisitos_por_proceso`, `requisitos_no_aplicables_certificado`, `fecha_certificado`, `contacto_certificado` y `*_certificado_compartido` por `id_certificado_version` en `cert.versiones[]`, manteniendo también la vista activa en `cert`.
4. **`auditoria` y Cobertura:**
   - Hidratar `id_certificado_version` y `version_numero` en cada `ProgramacionAuditEntity` y refrescar cobertura normativa desde la versión activa (y bajo demanda por `id_certificado_version`).

### 2. `Conglomerado` (`conglomeradoDomain.ts`, `conglomeradoView.ts`)
- Mostrar badge compacto con **`abreviacion`** de la organización junto al `nombre` y chip `vN` en pestañas/detalles de `Conglomerado`.
- Respetar `table-fixed`, `<colgroup>` al 100%, `0 <button>` en `<tbody>` y aislamiento `CLIENT`.

### 3. `Breadcrumbs` y `SearchControls` (`breadcrumb.ts`, `searchControls.ts`)
- **`breadcrumb.ts`:** tooltips y etiquetas con `abreviacion` y `vN` dentro de `MAX_BREADCRUMB_CHAR_LENGTH` (`24` chars), Zero-UUID.
- **`searchControls.ts`:** extender `CertificateRecord` con `organizacion_abreviacion?: string`, `version_numero?: number`, `alcance_es?: string`, `alcance_en?: string | null` y `tiene_alcance?: boolean` para permitir búsqueda por abreviación de organización y por alcance en español o inglés.

---

## Criterios de Aceptación y Verificación
- Cargar datos desde Supabase y seed local hidrata `organizacion_version`, `certificado_version`, `alcance` propio/compartido (o `null` sin alcance) y `id_certificado_version` por auditoría.
- Buscar en `SearchControls` por `abreviacion` (`MET-VAL`) o por texto dentro de `alcance_es`/`alcance_en` devuelve los certificados esperados.
- `node --test src/lib/conglomeradoDomain.test.ts src/lib/breadcrumb.test.ts src/lib/searchControls.test.ts` en verde.
