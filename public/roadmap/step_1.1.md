# Step 1.1: Esquema SQL, Soft-Delete, Auditoría Inmutable y RLS para Contenido Bilingüe de Cláusulas

## 1. Objetivo
Desacoplar limpiamente la estructura jerárquica LTREE (`public.requisito`) del contenido localizado bilingüe (`public.requisito_traduccion`), preservando la integridad de todas las llaves foráneas existentes (`hallazgo`, `requisitos_por_proceso`, `requisitos_no_aplicables_certificado`, `cobertura_normativa_certificado`), las políticas RLS, el `audit_log` inmutable y la gobernanza de archivo lógico (`deleted_at`).

---

## 2. Archivos SQL Objetivo
- `public/supabase/queries/01_creacion.sql`
- `public/supabase/queries/03_indices_optimizacion.sql`
- `public/supabase/queries/04_rls.sql`

*(Nota: mantener compatibilidad idempotente con `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` y `CREATE TABLE IF NOT EXISTS` para despliegues sobre bases ya inicializadas).*

---

## 3. Cambios de Esquema (`01_creacion.sql`)

### 3.1 Extensión Idempotente de `public.requisito`
Agregar dos columnas sin romper las columnas ni constraints actuales:
1. `explicit_code BOOLEAN NOT NULL DEFAULT FALSE`: refleja el campo `explicit_code` de `standard.clause.csv` (distingue cláusulas numeradas principales como `4.4.1` frente a literales anidados como `1.a` o `4.2.a`).
2. `external_key VARCHAR(100) NULL`: almacena de forma interna e idempotente el identificador origen CSV (`clause_iso_9001_2015_0001`) para `ON CONFLICT` durante cargas/actualizaciones sin exponerlo jamás en la UI.

### 3.2 Nueva Tabla `public.requisito_traduccion`
```sql
CREATE TABLE IF NOT EXISTS public.requisito_traduccion (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_requisito UUID NOT NULL REFERENCES public.requisito(id) ON DELETE CASCADE,
    lang VARCHAR(5) NOT NULL CHECK (lang IN ('es', 'en')),
    title VARCHAR(500) NOT NULL DEFAULT '',
    content_html TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
```

### 3.3 Triggers de Integridad, Timestamps y Soft-Delete
1. **Timestamp automático:** `DROP TRIGGER IF EXISTS update_requisito_traduccion_modtime ON public.requisito_traduccion;` → `BEFORE UPDATE EXECUTE FUNCTION public.update_updated_at_column()`.
2. **Prevención de borrado físico:** agregar `'requisito_traduccion'` al arreglo `v_child_tables` dentro del bloque de triggers en `01_creacion.sql`:
   - `trg_prevent_hard_delete_requisito_traduccion` (`BEFORE DELETE -> fn_prevent_hard_delete()`).
   - `trg_sync_soft_delete_requisito_traduccion` (`BEFORE UPDATE -> fn_sync_soft_delete_child_metadata()`).
3. **Auditoría forense inmutable:** agregar `'requisito_traduccion'` a `v_extra_audit_tables` para registrar cada `INSERT` / `UPDATE` (autoría en español o inglés) en `public.audit_log`.
4. **Gobernanza de archivo lógico (`get_archive_dependency_summary` & `archive_record`):**
   - Al archivar un `requisito` sin hijos ni hallazgos activos, permitir archivar sus filas `requisito_traduccion` mediante `archive_record` o mantenerlas ocultas vía RLS (`EXISTS` sobre `requisito.deleted_at IS NULL`).
   - Agregar `'requisito_traduccion'` a `v_child_tables` de `archive_record()` en `04_rls.sql`.

---

## 4. Índices de Optimización y Unicidad Parcial (`03_indices_optimizacion.sql`)
1. Índice único parcial por clave externa CSV en `requisito`:
   ```sql
   CREATE UNIQUE INDEX IF NOT EXISTS uq_requisito_external_key_active
       ON public.requisito (external_key)
       WHERE external_key IS NOT NULL AND deleted_at IS NULL;
   ```
2. Índice único parcial por `(id_requisito, lang)` en `requisito_traduccion`:
   ```sql
   CREATE UNIQUE INDEX IF NOT EXISTS uq_requisito_traduccion_lang_active
       ON public.requisito_traduccion (id_requisito, lang)
       WHERE deleted_at IS NULL;
   ```
3. Índice de búsqueda rápida por requisito e idioma:
   ```sql
   CREATE INDEX IF NOT EXISTS idx_requisito_traduccion_lookup
       ON public.requisito_traduccion (id_requisito, lang)
       WHERE deleted_at IS NULL;
   ```
4. Índice GIN (opcional recomendado con `pg_trgm` o `to_tsvector('simple', ...)`) para acelerar búsquedas de texto sobre `title` y `content_html` cuando se consulte del lado servidor.

---

## 5. Seguridad DCL y Políticas RLS (`04_rls.sql`)
1. Agregar `'requisito_traduccion'` al arreglo `v_non_deletable_tables` para ejecutar `REVOKE DELETE ON public.requisito_traduccion FROM anon, authenticated`.
2. Habilitar RLS: `ALTER TABLE public.requisito_traduccion ENABLE ROW LEVEL SECURITY;`.
3. Definir las tres políticas granulares consistentes con `public.requisito`:
   - **`catalog_requisito_traduccion_select` (`FOR SELECT`):**
     Visible si `public.is_approved_admin()` o si `(deleted_at IS NULL AND EXISTS (SELECT 1 FROM public.requisito r WHERE r.id = requisito_traduccion.id_requisito AND r.deleted_at IS NULL))`.
   - **`catalog_requisito_traduccion_insert_worker` (`FOR INSERT TO authenticated`):**
     `WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL)`.
   - **`catalog_requisito_traduccion_update_worker` (`FOR UPDATE TO authenticated`):**
     `USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))`
     `WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()))`.

---

## 6. Criterios de Aceptación del Paso
- [ ] `01_creacion.sql`, `03_indices_optimizacion.sql` y `04_rls.sql` se ejecutan de forma idempotente sin errores.
- [ ] Un usuario `CLIENT`, `AUDITOR` o `PENDING_WORKER` recibe `403`/violación RLS al intentar `INSERT` o `UPDATE` en `requisito_traduccion`.
- [ ] Un `DELETE` físico sobre `requisito_traduccion` queda bloqueado tanto por `REVOKE DELETE` como por `fn_prevent_hard_delete()`.
- [ ] Toda edición de título o contenido HTML en `requisito_traduccion` genera una entrada inmutable en `public.audit_log`.
