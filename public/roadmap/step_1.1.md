# Step 1.1 — Capa SQL: Contenedor `organizacion`, Tabla `organizacion_version`, `abreviacion` y RPCs de Versionado

## Objetivo del Paso
Dividir `public.organizacion` en el patrón **Contenedor Estable (`organizacion`) + Instantánea Versionada (`organizacion_version`)**, incorporar el campo obligatorio **`abreviacion` (`VARCHAR(30) NOT NULL`)**, adaptar triggers/funciones dependientes (`fn_auto_asignar_grupo_organizacion`, `fn_desvincular_organizacion_conglomerado`, `fn_sincronizar_limpieza_grupo_empresarial`), definir índices únicos parciales sobre versiones activas y crear las RPCs atómicas de creación de versión (con **Guardia Anti-No-Op**) y resolución de versiones de certificado.

---

## Archivos a Crear / Modificar
- `public/supabase/queries/01_creacion.sql`
- `public/supabase/queries/03_indices_optimizacion.sql`
- `public/supabase/queries/04_rls.sql`

---

## Especificación Técnica Detallada

### 1. Tabla `public.organizacion_version` y Ajuste Idempotente en `public.organizacion` (`01_creacion.sql`)
1. Crear tabla `public.organizacion_version`:
   - `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
   - `id_organizacion UUID NOT NULL REFERENCES public.organizacion(id) ON DELETE CASCADE`
   - `version_numero INTEGER NOT NULL CHECK (version_numero >= 1)`
   - `es_version_actual BOOLEAN NOT NULL DEFAULT TRUE`
   - `notas_version TEXT NULL`
   - `nombre VARCHAR(255) NOT NULL`
   - `abreviacion VARCHAR(30) NOT NULL CHECK (LENGTH(TRIM(abreviacion)) BETWEEN 2 AND 30)`
   - `rif VARCHAR(50) NULL`
   - `direccion_fiscal TEXT NULL`
   - Metadatos estándar: `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `deleted_at TIMESTAMPTZ DEFAULT NULL`, `deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL`, `delete_reason TEXT NULL`.
2. Asegurar columnas de compatibilidad controlada en `public.organizacion` (`abreviacion VARCHAR(30)` opcional/sincronizada desde la versión activa para no romper consultas heredadas antes de completar pasos 3.x), manteniendo `id`, `id_grupo_empresarial` y metadatos soft-delete en el contenedor.
3. **Backfill Idempotente (`DO $$ ... $$`):** Para toda fila existente en `public.organizacion` sin fila en `public.organizacion_version`, insertar `version_numero = 1`, `es_version_actual = TRUE`, generando `abreviacion` determinística única (`<= 30` chars, normalizada en mayúsculas) si la fila heredada carecía de ella, preservando `deleted_at` si el contenedor ya estaba archivado.
4. **Triggers de Integridad en `organizacion_version`:**
   - `fn_validar_organizacion_version()`: garantiza que `version_numero` sea secuencial por `id_organizacion`, impide que el contenedor esté archivado, valida formato/longitud de `abreviacion` (`2..30` caracteres, sin UUIDs crudos) y gestiona que si se marca `es_version_actual = TRUE`, desactive automáticamente la versión anterior dentro de la misma transacción (con guarda `pg_trigger_depth()`).
   - `fn_sincronizar_cache_organizacion_desde_version()`: cuando se inserta o actualiza la fila con `es_version_actual = TRUE AND deleted_at IS NULL`, actualiza `nombre`, `abreviacion`, `rif` y `direccion_fiscal` en el contenedor `public.organizacion` para mantener sincronizada la capa heredada y las vistas SQL existentes.
   - Registrar `'organizacion_version'` en `v_core_tables`, `v_guarded_parents`, `v_extra_audit_tables`, trigger `update_organizacion_version_modtime` y en `get_archive_dependency_summary` (`WHEN 'organizacion_version' THEN ...` contando `certificado_version` activas asociadas; y en `WHEN 'organizacion' THEN` verificar también `organizacion_version` / `certificado` activas).
5. **Actualización de Funciones Existentes de Organización (`01_creacion.sql`):**
   - `fn_auto_asignar_grupo_organizacion()`: usar `COALESCE(NULLIF(TRIM(NEW.nombre), ''), 'Organización')` manteniendo la creación automática de `grupo_empresarial` 1:1.
   - `fn_desvincular_organizacion_conglomerado()`: leer `nombre` desde la `organizacion_version` activa (`COALESCE(ov.nombre, o.nombre)`), sin exponer UUIDs en `RAISE EXCEPTION`.

### 2. RPCs Transaccionales en Español (`01_creacion.sql`)
1. `public.fn_crear_version_organizacion(p_id_organizacion UUID, p_nombre TEXT, p_abreviacion TEXT, p_rif TEXT DEFAULT NULL, p_direccion_fiscal TEXT DEFAULT NULL, p_notas_version TEXT DEFAULT NULL) RETURNS UUID` (`SECURITY DEFINER`, `SET search_path = public, pg_temp`):
   - Verificar `IF NOT public.is_approved_worker() THEN RAISE EXCEPTION 'Acceso denegado: solo personal ADMIN o WORKER aprobado puede crear versiones de organización.';`.
   - Bloquear fila activa actual de `organizacion_version` (`FOR UPDATE`).
   - **Guardia Anti-No-Op:** Comparar campos normalizados (`TRIM(REGEXP_REPLACE(..., '\s+', ' ', 'g'))`, `UPPER(TRIM(abreviacion))` vs `abreviacion` conservando capitalización legible sin espacios dobles, `UPPER(TRIM(COALESCE(rif, '')))`, `TRIM(COALESCE(direccion_fiscal, ''))`). Si los 4 campos son idénticos a la versión activa, lanzar:
     ```sql
     RAISE EXCEPTION 'No se detectaron cambios respecto a la versión activa. Modifique al menos un campo (Nombre, Abreviación, RIF o Dirección Fiscal) para crear una nueva versión.'
       USING ERRCODE = 'P0001';
     ```
   - Desactivar `es_version_actual = FALSE` en la versión anterior, insertar nueva versión con `version_numero = COALESCE(max_v, 0) + 1`, `es_version_actual = TRUE`, registrar entrada forense en `public.audit_log` y retornar el UUID de la nueva `organizacion_version`.
2. `public.fn_resolver_cert_versiones_organizacion(p_id_nueva_org_version UUID, p_cert_version_ids_migrar UUID[]) RETURNS INTEGER` (`SECURITY DEFINER`, `SET search_path = public, pg_temp`):
   - Verificar `is_approved_worker()`.
   - Validar que `p_id_nueva_org_version` exista, esté activa y corresponda al contenedor `id_organizacion`.
   - Actualizar `public.certificado_version.id_organizacion_version = p_id_nueva_org_version` únicamente para los UUIDs contenidos en `p_cert_version_ids_migrar` verificando que pertenezcan al mismo `certificado.id_organizacion` (`JOIN public.certificado c ON c.id = cv.id_certificado`). Si alguno no pertenece a esa organización, lanzar `RAISE EXCEPTION` descriptivo en español sin UUIDs.
   - Registrar en `public.audit_log` el resumen cuantitativo de migración de certificados y devolver el conteo actualizado.

### 3. Índices Únicos Parciales y de Búsqueda (`03_indices_optimizacion.sql`)
- `uq_organizacion_version_numero_active`: `UNIQUE (id_organizacion, version_numero) WHERE deleted_at IS NULL`
- `uq_organizacion_version_actual_active`: `UNIQUE (id_organizacion) WHERE es_version_actual = TRUE AND deleted_at IS NULL`
- `uq_organizacion_version_nombre_actual_active`: `UNIQUE (LOWER(TRIM(nombre))) WHERE es_version_actual = TRUE AND deleted_at IS NULL`
- `uq_organizacion_version_abrev_actual_active`: `UNIQUE (LOWER(TRIM(abreviacion))) WHERE es_version_actual = TRUE AND deleted_at IS NULL`
- `uq_organizacion_version_rif_actual_active`: `UNIQUE (UPPER(TRIM(rif))) WHERE es_version_actual = TRUE AND rif IS NOT NULL AND TRIM(rif) <> '' AND deleted_at IS NULL`
- `idx_organizacion_version_org_lookup`: `(id_organizacion, es_version_actual DESC, version_numero DESC) WHERE deleted_at IS NULL`

### 4. Políticas RLS y DCL (`04_rls.sql`)
- Añadir `'organizacion_version'` a `v_non_deletable_tables`, `REVOKE DELETE ... FROM anon, authenticated`, `ALTER TABLE public.organizacion_version ENABLE ROW LEVEL SECURITY;` y a `archive_record` (`v_core_tables` / `v_guarded_parents`, bloqueando archivar la única/última versión activa si el contenedor sigue activo).
- Crear 3 políticas granulares en `public.organizacion_version` (cero `FOR ALL`, cero `FOR DELETE`):
  - `organizacion_version_select`: `is_approved_admin() OR (deleted_at IS NULL AND (is_approved_worker() OR has_client_org_access(id_organizacion) OR is_auditor_for_org(id_organizacion)))`
  - `organizacion_version_insert_worker`: `is_approved_worker() AND deleted_at IS NULL`
  - `organizacion_version_update_worker`: `USING (is_approved_admin() OR (deleted_at IS NULL AND is_approved_worker()))` y `WITH CHECK (is_approved_worker() AND (deleted_at IS NULL OR is_approved_admin() OR deleted_by = auth.uid()))`
- Configurar `REVOKE EXECUTE ... FROM PUBLIC, anon;` y `GRANT EXECUTE ... TO authenticated;` sobre `fn_crear_version_organizacion` y `fn_resolver_cert_versiones_organizacion`.

---

## Criterios de Aceptación y Verificación
- **Integridad SQL:** El bloque `CREATE TABLE`, backfill idempotente y triggers en `01_creacion.sql` ejecutan dos veces seguidas sin errores.
- **Anti-No-Op:** Invocar `fn_crear_version_organizacion` con los mismos valores normalizados falla con error SQL `P0001` en español sin UUIDs crudos.
- **Unicidad histórica vs activa:** Es posible tener `v1` archivada/inactiva con nombre antiguo `"Metalúrgica Viejo"` y `v2` activa con nombre `"Metalúrgica Nuevo"` + `abreviacion` única, sin colisiones de índice único.
- **RLS 4 roles:** `CLIENT` solo lee versiones de organizaciones en `client_organization_access`; `AUDITOR` solo lee organizaciones asociadas a sus auditorías asignadas; `WORKER` no ve registros `deleted_at IS NOT NULL`; ningún rol puede ejecutar `DELETE` físico.
