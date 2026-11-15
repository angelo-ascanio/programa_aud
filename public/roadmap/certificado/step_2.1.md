# Step 2.1: Database Schema Expansion (`certificado.id_subsector_iaf` + 4 Sub-Entity Tables)

## 1. Objetivo

Expandir el esquema relacional de PostgreSQL en `public/supabase/queries/` incorporando la nueva clave foránea `id_subsector_iaf` en `public.certificado` y cuatro nuevas tablas hijas del dominio `certificado`, garantizando integridad referencial, gobernanza completa de **soft-delete**, prevención de borrado físico, trazabilidad automática en `public.audit_log`, índices parciales de unicidad/búsqueda, políticas RLS granulares y datos semilla reproducibles.

---

## 2. Modelo Entidad-Relación a Incorporar

```text
public.subsector_iaf (id)
 └──< public.certificado (id_subsector_iaf)  [NUEVA FK DIRECTA]
       ├──< public.fecha_certificado (id_certificado)
       └──< public.contacto_certificado (id_certificado)
             ├──< public.telefono_contacto_certificado (id_contacto)
             └──< public.email_contacto_certificado (id_contacto)
```

### 2.1 Modificación de `public.certificado` (`public/supabase/queries/01_creacion.sql`)

Agregar la 5.ª clave foránea padre directamente en la definición de `public.certificado`:

- **`id_subsector_iaf UUID NOT NULL REFERENCES public.subsector_iaf(id) ON DELETE RESTRICT`**
  - Colocar junto a las FKs padre existentes (`id_norma`, `id_estatus`, `id_sector_iaf`, `id_organizacion`) en `CREATE TABLE IF NOT EXISTS certificado (...)`.
  - *(Nota para migraciones incrementales sobre instancias vivas sin reset completo)*: si se aplica sobre una tabla `certificado` ya existente, ejecutar primero `ALTER TABLE public.certificado ADD COLUMN IF NOT EXISTS id_subsector_iaf UUID REFERENCES public.subsector_iaf(id) ON DELETE RESTRICT;`, realizar el backfill por sector correspondiente y luego aplicar `ALTER COLUMN id_subsector_iaf SET NOT NULL`.
  - Mantener consistencia de negocio con `id_sector_iaf`: el `subsector_iaf` asignado al certificado debe pertenecer al `sector_iaf` seleccionado (`subsector_iaf.id_sector_iaf = certificado.id_sector_iaf`).

### 2.2 Definición de Nuevas Tablas Hijas (`public/supabase/queries/01_creacion.sql`)

1. **`public.fecha_certificado`** (Tabla Core con `delete_reason`):
   - `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
   - `id_certificado UUID NOT NULL REFERENCES public.certificado(id) ON DELETE CASCADE`
   - `fecha DATE NOT NULL`
   - `tipo_fecha VARCHAR(40) NOT NULL CHECK (tipo_fecha IN ('Otorgamiento', 'Renovación', 'Vencimiento', 'Modificación', 'Suspensión', 'Cancelación', 'Ultima Auditoría'))`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `deleted_at TIMESTAMPTZ DEFAULT NULL`
   - `deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL`
   - `delete_reason TEXT`
   *(Nota: Si se opta por un tipo ENUM `public.tipo_fecha_certificado`, declararlo idempotente en el bloque `DO $$` inicial de `01_creacion.sql` junto a `user_status`, `user_role` y `tipo_hallazgo`, o utilizar `VARCHAR(40)` con `CHECK` explícito para facilitar consultas REST/PostgREST tipadas. En ambos casos, restringir estrictamente a los 7 valores especificados).*

2. **`public.contacto_certificado`** (Tabla Core con `delete_reason`):
   - `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
   - `id_certificado UUID NOT NULL REFERENCES public.certificado(id) ON DELETE CASCADE`
   - `nombre VARCHAR(180) NOT NULL`
   - `cargo VARCHAR(150) NULL`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `deleted_at TIMESTAMPTZ DEFAULT NULL`
   - `deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL`
   - `delete_reason TEXT`

3. **`public.telefono_contacto_certificado`** (Sub-entidad hija de contacto):
   - `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
   - `id_contacto UUID NOT NULL REFERENCES public.contacto_certificado(id) ON DELETE CASCADE`
   - `telefono VARCHAR(50) NOT NULL`
   - `tipo_telefono VARCHAR(40) NOT NULL DEFAULT 'Oficina'`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `deleted_at TIMESTAMPTZ DEFAULT NULL`
   - `deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL`

4. **`public.email_contacto_certificado`** (Sub-entidad hija de contacto):
   - `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
   - `id_contacto UUID NOT NULL REFERENCES public.contacto_certificado(id) ON DELETE CASCADE`
   - `email VARCHAR(200) NOT NULL`
   - `tipo_email VARCHAR(40) NOT NULL DEFAULT 'Trabajo'`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `deleted_at TIMESTAMPTZ DEFAULT NULL`
   - `deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL`

---

## 3. Triggers, Guardias y RPC de Dependencias (`01_creacion.sql`)

Actualizar las secciones de triggers y funciones existentes en `public/supabase/queries/01_creacion.sql`:

1. **Triggers `updated_at` (`update_updated_at_column()`):**
   - `update_fecha_certificado_modtime` en `public.fecha_certificado`
   - `update_contacto_certificado_modtime` en `public.contacto_certificado`
   - `update_telefono_contacto_certificado_modtime` en `public.telefono_contacto_certificado`
   - `update_email_contacto_certificado_modtime` en `public.email_contacto_certificado`

2. **Triggers Soft-Delete & Prevención de Hard-Delete (Bloque `DO $$` al final de `01_creacion.sql`):**
   - Agregar `'fecha_certificado'` y `'contacto_certificado'` al arreglo `v_core_tables` (aplicando `fn_prevent_hard_delete` y `fn_sync_soft_delete_metadata`).
   - Agregar `'telefono_contacto_certificado'` y `'email_contacto_certificado'` al arreglo `v_child_tables` (aplicando `fn_prevent_hard_delete` y `fn_sync_soft_delete_child_metadata`).
   - Agregar `'contacto_certificado'` y `'subsector_iaf'` al arreglo `v_guarded_parents` (para impedir archivar un contacto con teléfonos/correos activos o un sub-sector IAF referenciado por certificados activos).
   - Agregar las 4 tablas a `v_extra_audit_tables` para garantizar captura sincrónica en `public.audit_log` vía `audit_trigger_func()` en `INSERT OR UPDATE OR DELETE`.

3. **Actualización de `public.get_archive_dependency_summary(p_table TEXT, p_record_id UUID)`:**
   - **Caso `WHEN 'certificado' THEN`:** añadir conteos activos (`deleted_at IS NULL`) para:
     - `public.fecha_certificado` (`label`: `'Fechas del certificado'`)
     - `public.contacto_certificado` (`label`: `'Contactos del certificado'`)
   - **Nuevo caso `WHEN 'contacto_certificado' THEN`:** añadir conteos activos (`deleted_at IS NULL`) para:
     - `public.telefono_contacto_certificado` (`label`: `'Teléfonos del contacto'`)
     - `public.email_contacto_certificado` (`label`: `'Correos del contacto'`)
   - **Nuevo caso `WHEN 'subsector_iaf' THEN`:** añadir conteo activo (`deleted_at IS NULL`) para:
     - `public.certificado` (`WHERE id_subsector_iaf = p_record_id AND deleted_at IS NULL`, `label`: `'Certificados en este sub-sector IAF'`).

---

## 4. Índices de Optimización y Unicidad Parcial (`public/supabase/queries/03_indices_optimizacion.sql`)

Agregar índices B-Tree y parciales (`WHERE deleted_at IS NULL`) alineados con las consultas de detalle y prevención de duplicados activos:

```sql
-- Índice para la nueva FK id_subsector_iaf en certificado
CREATE INDEX IF NOT EXISTS idx_certificado_subsector_iaf
    ON public.certificado (id_subsector_iaf)
    WHERE deleted_at IS NULL;

-- Unicidad parcial (permite recrear registros si el previo fue archivado)
CREATE UNIQUE INDEX IF NOT EXISTS uq_fecha_certificado_tipo_fecha_active
    ON public.fecha_certificado (id_certificado, tipo_fecha, fecha)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_contacto_certificado_nombre_active
    ON public.contacto_certificado (id_certificado, LOWER(TRIM(nombre)))
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_telefono_contacto_active
    ON public.telefono_contacto_certificado (id_contacto, TRIM(telefono))
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_email_contacto_active
    ON public.email_contacto_certificado (id_contacto, LOWER(TRIM(email)))
    WHERE deleted_at IS NULL;

-- Índices de consulta relacional por padre
CREATE INDEX IF NOT EXISTS idx_fecha_certificado_lookup
    ON public.fecha_certificado (id_certificado, fecha DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_contacto_certificado_lookup
    ON public.contacto_certificado (id_certificado, nombre)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_telefono_contacto_lookup
    ON public.telefono_contacto_certificado (id_contacto)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_email_contacto_lookup
    ON public.email_contacto_certificado (id_contacto)
    WHERE deleted_at IS NULL;
```

---

## 5. Seguridad RLS y RPC de Archivo (`public/supabase/queries/04_rls.sql`)

Actualizar `04_rls.sql` siguiendo el mismo patrón de aislamiento por `certificado` (`sitio` / `proceso`):

1. **Bloque `REVOKE DELETE`:**
   - Añadir `'fecha_certificado'`, `'contacto_certificado'`, `'telefono_contacto_certificado'` y `'email_contacto_certificado'` al arreglo `v_non_deletable_tables`.
2. **RPC `public.archive_record(p_table, p_record_id, p_reason)`:**
   - Añadir `'fecha_certificado'` y `'contacto_certificado'` a `v_core_tables`.
   - Añadir `'telefono_contacto_certificado'` y `'email_contacto_certificado'` a `v_child_tables`.
3. **Habilitación RLS (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`):**
   - Activar RLS en las 4 tablas (pasando de 31 a 35 tablas protegidas).
4. **Políticas Granulares (`SELECT`, `INSERT`, `UPDATE`, sin `DELETE`):**
   - **`fecha_certificado` & `contacto_certificado`:**
     - `SELECT`: `is_approved_admin()` OR (`deleted_at IS NULL` AND (`is_approved_worker()` OR `EXISTS (SELECT 1 FROM public.certificado c WHERE c.id = <tabla>.id_certificado AND c.deleted_at IS NULL AND (has_client_org_access(c.id_organizacion) OR is_auditor_for_cert(c.id)))`)).
     - `INSERT`: `is_approved_worker() AND deleted_at IS NULL`.
     - `UPDATE`: `is_approved_admin() OR (deleted_at IS NULL AND is_approved_worker())` con `WITH CHECK (is_approved_worker() AND (deleted_at IS NULL OR is_approved_admin() OR deleted_by = auth.uid()))`.
   - **`telefono_contacto_certificado` & `email_contacto_certificado`:**
     - `SELECT`: `is_approved_admin()` OR (`deleted_at IS NULL` AND (`is_approved_worker()` OR `EXISTS (SELECT 1 FROM public.contacto_certificado cc JOIN public.certificado c ON c.id = cc.id_certificado WHERE cc.id = <tabla>.id_contacto AND cc.deleted_at IS NULL AND c.deleted_at IS NULL AND (has_client_org_access(c.id_organizacion) OR is_auditor_for_cert(c.id)))`)).
     - `INSERT`: `is_approved_worker() AND deleted_at IS NULL`.
     - `UPDATE`: idéntico patrón `is_approved_worker()` + validación `deleted_by = auth.uid()`.

---

## 6. Datos Semilla Idempotentes (`public/supabase/queries/06_datos_prueba.sql`)

1. **Actualizar `INSERT INTO public.certificado`:**
   - En el certificado semilla `'40000000-0000-0000-0000-000000000001'` (`FN-QMS-2024-001`, Sector 17 `'d0000000-0000-0000-0000-000000000017'`), incluir la columna `id_subsector_iaf` apuntando al sub-sector semilla compatible `'da000000-0000-0000-0000-000000000171'` (`17.1 · Fabricación de metales básicos, fundición y siderurgia`, riesgo `'ALTO'`).
   - En la cláusula `ON CONFLICT (numero_certificado) WHERE deleted_at IS NULL DO UPDATE SET`, incluir `id_subsector_iaf = EXCLUDED.id_subsector_iaf` para asegurar actualización idempotente en `POST /api/reset-db`.

2. **Sembrar registros reales vinculados al certificado semilla `'40000000-0000-0000-0000-000000000001'` (`FN-QMS-2024-001`):**
   - **`public.fecha_certificado`** (mínimo 3 fechas representativas):
     - `'Otorgamiento'` (`2024-01-15`)
     - `'Ultima Auditoría'` (`2024-11-20`)
     - `'Vencimiento'` (`2027-01-14`)
   - **`public.contacto_certificado`** (mínimo 2 contactos):
     - Contacto 1: Representante de la Dirección / Gerente de Calidad (`cargo`: `'Gerente de Aseguramiento de Calidad'`)
     - Contacto 2: Coordinador de Operaciones Multisitio (`cargo`: `'Coordinador SGC'`)
   - **`public.telefono_contacto_certificado`**:
     - Múltiples teléfonos vinculados a los contactos semilla (`'Oficina'`, `'Móvil'`, `'Directo'`).
   - **`public.email_contacto_certificado`**:
     - Correos corporativos vinculados a los contactos semilla (`'Trabajo'`, `'Alternativo'`).

> Utilizar UUIDs determinísticos con prefijo dedicado (p. ej. `91000000-...`, `92000000-...`, `93000000-...`, `94000000-...`) y cláusulas `ON CONFLICT ... DO UPDATE` sobre los nuevos índices parciales para garantizar idempotencia total en `POST /api/reset-db`.

---

## 7. Criterios de Aceptación del Step 2.1

- [ ] `public.certificado` incluye `id_subsector_iaf UUID NOT NULL REFERENCES public.subsector_iaf(id) ON DELETE RESTRICT` en `01_creacion.sql`, índice parcial `idx_certificado_subsector_iaf` en `03_indices_optimizacion.sql`, guardia `'subsector_iaf'` en `get_archive_dependency_summary` / `v_guarded_parents` y valor poblado en `06_datos_prueba.sql`.
- [ ] Las 4 tablas hijas (`fecha_certificado`, `contacto_certificado`, `telefono_contacto_certificado`, `email_contacto_certificado`) existen en `01_creacion.sql` con columnas, claves foráneas `ON DELETE CASCADE`, `CHECK` de `tipo_fecha` y metadatos soft-delete.
- [ ] Triggers `update_*_modtime`, `trg_prevent_hard_delete_*`, `trg_sync_soft_delete_*`, `audit_*_trigger`, `trg_guard_archival_contacto_certificado` y `trg_guard_archival_subsector_iaf` asociados correctamente.
- [ ] `get_archive_dependency_summary` y `archive_record` contemplan `subsector_iaf` y las 4 tablas nuevas.
- [ ] `03_indices_optimizacion.sql`, `04_rls.sql` y `06_datos_prueba.sql` compilables y ejecutables sin errores en PostgreSQL.
