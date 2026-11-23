# Step 1.2 — Capa SQL: `certificado_version`, Nueva Tabla `alcance`, `alcance_certificado_compartido`, Sub-Entidades, Cobertura e Índices

## Objetivo del Paso
Separar `public.certificado` en **Contenedor Estable (`certificado`) + Instantánea Versionada (`certificado_version`)**, **extraer la columna `alcance`** creando la nueva tabla independiente **`public.alcance`** (español obligatorio, inglés opcional, sin límite de caracteres ni tracking histórico) junto con **`public.alcance_certificado_compartido`** (mismo conglomerado), añadir la guarda SQL que impide generar auditorías para certificados sin alcance, re-enlazar las sub-entidades de versión y `auditoria` mediante `id_certificado_version`, actualizar `02_cobertura_normativa.sql`, índices (`03`) y RLS (`04`).

---

## Archivos a Crear / Modificar
- `public/supabase/queries/01_creacion.sql`
- `public/supabase/queries/02_cobertura_normativa.sql`
- `public/supabase/queries/03_indices_optimizacion.sql`
- `public/supabase/queries/04_rls.sql`

---

## Especificación Técnica Detallada

### 1. Extracción de `alcance` y Nuevas Tablas `public.alcance` y `public.alcance_certificado_compartido` (`01_creacion.sql`)
1. **Migración segura de datos y eliminación de `certificado.alcance`:**
   - Crear tabla **`public.alcance`**:
     - `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
     - `id_certificado UUID NOT NULL REFERENCES public.certificado(id) ON DELETE CASCADE`
     - `alcance_es TEXT NOT NULL CHECK (LENGTH(TRIM(alcance_es)) >= 1)` *(sin límite superior de caracteres)*
     - `alcance_en TEXT NULL CHECK (alcance_en IS NULL OR LENGTH(TRIM(alcance_en)) >= 1)` *(sin límite superior de caracteres)*
     - Metadatos soft-delete estándar: `created_at`, `updated_at`, `deleted_at`, `deleted_by`, `delete_reason`.
   - Crear tabla **`public.alcance_certificado_compartido`**:
     - `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
     - `id_alcance UUID NOT NULL REFERENCES public.alcance(id) ON DELETE RESTRICT`
     - `id_certificado UUID NOT NULL REFERENCES public.certificado(id) ON DELETE RESTRICT`
     - `created_at`, `updated_at`, `deleted_at`, `deleted_by`.
   - **Backfill idempotente previo al `DROP COLUMN`:** Si la tabla `public.certificado` aún posee columna `alcance` (`information_schema.columns`), migrar automáticamente toda fila con `LENGTH(TRIM(COALESCE(alcance, ''))) > 0` hacia `public.alcance (id_certificado, alcance_es, deleted_at, deleted_by)` antes de ejecutar `ALTER TABLE public.certificado DROP COLUMN IF EXISTS alcance;`.
   - En la definición `CREATE TABLE IF NOT EXISTS certificado (...)`, **omitir `alcance`**.
2. **Triggers y Reglas de Integridad de `alcance`:**
   - `fn_normalizar_alcance_bilingue()`: recorta espacios extremos sin truncar contenido; si `TRIM(COALESCE(NEW.alcance_en, '')) = ''`, asigna `NEW.alcance_en := NULL`. Impide tener simultáneamente un `alcance` propio activo y un `alcance_certificado_compartido` activo para el mismo `id_certificado` (salvo archivado previo).
   - `fn_validar_alcance_compartido()`: exige que `id_alcance` esté activo, que el certificado propietario del alcance (`a.id_certificado`) y el certificado destino (`NEW.id_certificado`) pertenezcan al **mismo `id_grupo_empresarial` activo** (si no, `RAISE EXCEPTION` en español sin UUIDs), prohíbe auto-compartición (`a.id_certificado = NEW.id_certificado`), y bloquea si el destino ya posee otro `alcance` propio o compartido activo (debiendo reemplazarse explícitamente mediante el flujo/RPC de resolución).
   - Registrar `'alcance'` en `v_core_tables`, `v_guarded_parents`, `v_extra_audit_tables`, `update_alcance_modtime` y `get_archive_dependency_summary` (`WHEN 'alcance' THEN` contando `alcance_certificado_compartido` y bloqueando si es el único alcance de certificados con auditorías no archivadas si aplica o advirtiendo dependencias). Registrar `'alcance_certificado_compartido'` en `v_child_tables`, `v_extra_audit_tables` y `update_alcance_certificado_compartido_modtime`.
3. **Regla de Negocio — Certificados sin Alcance NO Pueden Generar Auditorías:**
   - Función auxiliar `public.certificado_tiene_alcance_activo(p_id_certificado UUID) RETURNS BOOLEAN`: devuelve `TRUE` si existe un registro activo (`deleted_at IS NULL`) en `public.alcance` para `p_id_certificado` **O** un registro activo en `public.alcance_certificado_compartido` para `p_id_certificado` apuntando a un `alcance` activo (`a.deleted_at IS NULL`).
   - Trigger `trg_validar_auditoria_requiere_alcance` (`BEFORE INSERT ON public.auditoria` cuando `NEW.deleted_at IS NULL`): si `NOT public.certificado_tiene_alcance_activo(NEW.id_certificado)`, lanzar `RAISE EXCEPTION` con `ERRCODE = 'P0001'` en español y Zero-UUID:
     `'Operación bloqueada: el certificado seleccionado no cuenta con un Alcance activo registrado o compartido. Defina el Alcance en español antes de generar auditorías.'`

### 2. Tabla `public.certificado_version` (`01_creacion.sql`)
1. Crear tabla `public.certificado_version`:
   - `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
   - `id_certificado UUID NOT NULL REFERENCES public.certificado(id) ON DELETE CASCADE`
   - `id_organizacion_version UUID NOT NULL REFERENCES public.organizacion_version(id) ON DELETE RESTRICT`
   - `version_numero INTEGER NOT NULL CHECK (version_numero >= 1)`
   - `es_version_actual BOOLEAN NOT NULL DEFAULT TRUE`
   - `notas_version TEXT NULL`
   - `id_estatus UUID NOT NULL REFERENCES public.estatus(id) ON DELETE RESTRICT`
   - `id_sector_iaf UUID NOT NULL REFERENCES public.sector_iaf(id) ON DELETE RESTRICT`
   - `id_subsector_iaf UUID NOT NULL REFERENCES public.subsector_iaf(id) ON DELETE RESTRICT`
   - `multisitio BOOLEAN NOT NULL DEFAULT FALSE` *(NO incluye `alcance`)*
   - Metadatos soft-delete completos (`created_at`, `updated_at`, `deleted_at`, `deleted_by`, `delete_reason`).
2. **Backfill Idempotente:** Insertar `version_numero = 1`, `es_version_actual = TRUE` por cada `certificado` sin fila en `certificado_version`, ligando `id_organizacion_version` a la versión activa de su `id_organizacion`.
3. **Triggers de Consistencia en `certificado_version`:**
   - `fn_validar_certificado_version()`: valida que `ov.id_organizacion = c.id_organizacion`, garantiza unicidad de `es_version_actual = TRUE`, y sincroniza `id_estatus`, `id_sector_iaf`, `id_subsector_iaf` y `multisitio` hacia el contenedor `certificado`.
   - Registrar `'certificado_version'` en `v_core_tables`, `v_guarded_parents`, `v_extra_audit_tables`, `update_certificado_version_modtime` y `get_archive_dependency_summary`.

### 3. Adición de `id_certificado_version` en Sub-Entidades de Versión y `auditoria` (`01_creacion.sql`)
Agregar `id_certificado_version UUID REFERENCES public.certificado_version(id)` (con backfill a `v1` y `SET NOT NULL` idempotente; **NO** añadir `id_certificado_version` a `alcance` ni a `alcance_certificado_compartido` porque `alcance` no se versiona) en:
- `sitio`, `proceso`, `procesos_por_sitio`, `requisitos_por_proceso` *(PK `(id_proceso, id_certificado_version, id_requisito)`)*, `requisitos_no_aplicables_certificado`, `fecha_certificado`, `contacto_certificado`
- `turno_certificado_compartido`, `sitio_certificado_compartido`, `proceso_certificado_compartido`, `contacto_certificado_compartido`
- `auditoria` (`ON DELETE RESTRICT`)

### 4. Actualización de Triggers Version-Aware (`01_creacion.sql`)
- `fn_resolver_cert_version_scope()` en sub-entidades y `auditoria`: resuelve versión activa si llega `NULL` o valida coherencia `id_certificado = cv.id_certificado`.
- Actualizar `sitio_pertenece_a_certificado*`, `proceso_pertenece_a_certificado*`, `contacto_pertenece_a_certificado*`, `turno_pertenece_a_certificado*`, `fn_guard_req_proceso_against_exclusion`, `fn_smart_prune_process_clauses_on_exclusion`, `fn_sync_req_proceso_same_norm`, `fn_sync_shared_process_requisitos`, `fn_validar_sitio_auditoria_certificado`, `fn_validar_proceso_sitio_auditoria_certificado` y `fn_auto_asignar_sitio_principal_auditoria` para operar dentro de `id_certificado_version`.

### 5. Motor LTREE de Cobertura Versionado (`02_cobertura_normativa.sql`)
- Crear `evaluar_cobertura_certificado_version(UUID)` y `resumen_cobertura_certificado_version(UUID)` (`SECURITY INVOKER`).
- Mantener `evaluar_cobertura_certificado(UUID)`, `cobertura_normativa_certificado(UUID)` y `resumen_cobertura_certificado(UUID)` delegando a la versión activa del certificado.
- Añadir `p_id_certificado_version UUID DEFAULT NULL` a `declarar_no_aplicable_con_mutacion`.

### 6. Índices Parciales (`03_indices_optimizacion.sql`)
- **`alcance` y `alcance_certificado_compartido`:**
  - `uq_alcance_cert_active ON public.alcance (id_certificado) WHERE deleted_at IS NULL`
  - `uq_alcance_compartido_cert_active ON public.alcance_certificado_compartido (id_certificado) WHERE deleted_at IS NULL`
  - `uq_alcance_compartido_pair_active ON public.alcance_certificado_compartido (id_alcance, id_certificado) WHERE deleted_at IS NULL`
  - `idx_alcance_compartido_alcance ON public.alcance_certificado_compartido (id_alcance) WHERE deleted_at IS NULL`
- **`certificado_version` y sub-entidades por versión:**
  - `uq_certificado_version_numero_active`, `uq_certificado_version_actual_active`, `uq_sitio_cert_numero_active`, `uq_proceso_cert_nombre_active`, `uq_procesos_por_sitio_active`, `uq_req_no_aplicable_cert_req_active`, `uq_fecha_certificado_tipo_fecha_active`, `uq_contacto_certificado_nombre_active`, y las tablas `*_certificado_compartido` indexadas por `id_certificado_version`.
  - `idx_req_proceso_proc_cert_version` e `idx_auditoria_cert_version_active`.

### 7. RLS y Gobernanza (`04_rls.sql`)
- Añadir `'certificado_version'`, `'alcance'` y `'alcance_certificado_compartido'` a `v_non_deletable_tables`, `REVOKE DELETE`, `ENABLE ROW LEVEL SECURITY` y `archive_record`.
- Políticas granulares (`SELECT`/`INSERT`/`UPDATE`, sin `FOR ALL` ni `FOR DELETE`) para:
  - `certificado_version` (`ADMIN`, `WORKER`, `CLIENT` vía `has_client_org_access`, `AUDITOR` vía `is_auditor_for_cert`).
  - `alcance` (`SELECT` por `is_approved_admin()`, `is_approved_worker()`, `has_client_org_access(c.id_organizacion)` e `is_auditor_for_cert(c.id)` o certificados donde esté compartido activamente para el usuario; `INSERT` y `UPDATE` exclusivos de `is_approved_worker()`).
  - `alcance_certificado_compartido` (`SELECT` homólogo al de `alcance`; `INSERT` y `UPDATE` exclusivos de `is_approved_worker()`).
- `REVOKE/GRANT EXECUTE` sobre las nuevas funciones de cobertura versionada.

---

## Criterios de Aceptación y Verificación
- La migración elimina `certificado.alcance` tras respaldar sus textos en `public.alcance` sin pérdida de datos.
- Intentar insertar en `public.auditoria` sobre un certificado sin `alcance` activo falla con `P0001` en español sin UUIDs.
- Clonar estructura entre `v1` y `v2` no viola índices únicos parciales ni duplica `alcance`.
- Un certificado no puede tener alcance propio y alcance compartido activos simultáneamente.
