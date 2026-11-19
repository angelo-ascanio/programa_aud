# Step 5.1: `Designación → Temporal` — Base de Datos (`auditoria_sitio_temporal`, `auditoria_sitio_temporal_certificado`), Triggers y RLS

## 1. Identificador, Nombre y Dependencias
* **Step ID:** `5.1`
* **Nombre Corto (UI):** `Temporal` (bajo `Designación`)
* **Bloque / Sub-sección:** Bloque 1 — `Auditoría` → `Designación` → `Temporal`
* **Dependencias:** `step_4.1.md` (`auditoria.tiene_sitio_temporal`), `step_3.1.md`

---

## 2. Alcance Exacto y Reglas de Negocio
1. **Entidades Auditables Fuera de Catálogo Maestro `sitio`:** Los sitios temporales o proyectos de obra no contaminan la tabla maestra `public.sitio`. Viven en `public.auditoria_sitio_temporal` ligados al ciclo/auditoría.
2. **Atributos de `public.auditoria_sitio_temporal`:**
   * `id_auditoria`: auditoría ancla dentro del `programa_auditoria` donde `tiene_sitio_temporal = TRUE`.
   * `etiqueta`: `VARCHAR(180) NOT NULL DEFAULT 'Sitio Temporal'`.
   * `comentario`: `TEXT NULL` (ubicación, alcance de obra, notas operativas).
   * `tiempo_auditoria`: `NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (tiempo_auditoria >= 0 AND MOD((tiempo_auditoria * 4)::NUMERIC, 1) = 0)` — precisión `0.25d`.
3. **Atribución M:N a Certificados del Vínculo (`public.auditoria_sitio_temporal_certificado`):**
   * Un sitio temporal (ej. `1.00 día` en proyecto compartido) puede aplicarse a **1 o varios certificados** de la misma campaña `programa_auditoria` (ej. aplica a ISO 9001, ISO 14001 e ISO 45001 simultáneamente).
   * Columnas: `id UUID PK`, `id_sitio_temporal UUID FK auditoria_sitio_temporal`, `id_auditoria_certificado UUID FK auditoria`, soft-delete (`deleted_at`, `deleted_by`).
   * Trigger verifica que `id_auditoria` (del temporal) y `id_auditoria_certificado` pertenecen al **mismo `id_programa_auditoria`** activo.
4. **Guardia al Apagar `auditoria.tiene_sitio_temporal`:** Trigger `BEFORE UPDATE OF tiene_sitio_temporal ON auditoria` bloquea cambiar de `TRUE` a `FALSE` si la auditoría sigue teniendo filas activas en `auditoria_sitio_temporal` o `auditoria_sitio_temporal_certificado`.
5. **Gobernanza Completa:** `REVOKE DELETE`, `fn_prevent_hard_delete`, `v_guarded_parents`, `get_archive_dependency_summary`, `archive_record` (`04_rls.sql`), índices únicos parciales (`WHERE deleted_at IS NULL`) y `audit_log`.

---

## 3. Cambios Exactos en Base de Datos (`00`, `01`, `03`, `04`, `06`)

### 3.1 `public/supabase/queries/00_delete_tables.sql`
```sql
DROP TABLE IF EXISTS public.equipo_auditor_sitio_temporal CASCADE;
DROP TABLE IF EXISTS public.auditoria_sitio_temporal_certificado CASCADE;
DROP TABLE IF EXISTS public.auditoria_sitio_temporal CASCADE;
```
*(Ubicados antes de `DROP TABLE IF EXISTS public.auditoria CASCADE;`.)*

### 3.2 `public/supabase/queries/01_creacion.sql`
```sql
CREATE TABLE IF NOT EXISTS public.auditoria_sitio_temporal (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_auditoria UUID NOT NULL REFERENCES public.auditoria(id) ON DELETE CASCADE,
    etiqueta VARCHAR(180) NOT NULL DEFAULT 'Sitio Temporal',
    comentario TEXT NULL,
    tiempo_auditoria NUMERIC(6,2) NOT NULL DEFAULT 0
        CHECK (tiempo_auditoria >= 0 AND MOD((tiempo_auditoria * 4)::NUMERIC, 1) = 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    delete_reason TEXT
);

CREATE TABLE IF NOT EXISTS public.auditoria_sitio_temporal_certificado (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_sitio_temporal UUID NOT NULL REFERENCES public.auditoria_sitio_temporal(id) ON DELETE CASCADE,
    id_auditoria_certificado UUID NOT NULL REFERENCES public.auditoria(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Trigger 1: Validar que auditoria ancla tiene_sitio_temporal = TRUE y está activa
CREATE OR REPLACE FUNCTION public.fn_validar_sitio_temporal_auditoria()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tiene_temporal BOOLEAN;
    v_aud_deleted TIMESTAMPTZ;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    IF TRIM(COALESCE(NEW.etiqueta, '')) = '' THEN
        NEW.etiqueta := 'Sitio Temporal';
    END IF;

    SELECT a.tiene_sitio_temporal, a.deleted_at
      INTO v_tiene_temporal, v_aud_deleted
    FROM public.auditoria a
    WHERE a.id = NEW.id_auditoria;

    IF NOT FOUND OR v_aud_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: la auditoría asociada al sitio temporal no existe o está archivada.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_tiene_temporal IS NOT TRUE THEN
        RAISE EXCEPTION 'Compuerta Paso 4/5: Active "Sitio Temporal" en la auditoría antes de registrar sitios temporales.'
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_sitio_temporal_auditoria ON public.auditoria_sitio_temporal;
CREATE TRIGGER trg_validar_sitio_temporal_auditoria
    BEFORE INSERT OR UPDATE OF id_auditoria, etiqueta, deleted_at ON public.auditoria_sitio_temporal
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_sitio_temporal_auditoria();

-- Trigger 2: Validar mismo programa_auditoria al asociar certificados al sitio temporal
CREATE OR REPLACE FUNCTION public.fn_validar_sitio_temporal_certificado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_prog_anchor UUID;
    v_temp_deleted TIMESTAMPTZ;
    v_prog_target UUID;
    v_aud_deleted TIMESTAMPTZ;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT a.id_programa_auditoria, st.deleted_at
      INTO v_prog_anchor, v_temp_deleted
    FROM public.auditoria_sitio_temporal st
    JOIN public.auditoria a ON a.id = st.id_auditoria
    WHERE st.id = NEW.id_sitio_temporal;

    IF v_prog_anchor IS NULL OR v_temp_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el sitio temporal no existe o está archivado.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT a.id_programa_auditoria, a.deleted_at
      INTO v_prog_target, v_aud_deleted
    FROM public.auditoria a
    WHERE a.id = NEW.id_auditoria_certificado;

    IF v_prog_target IS NULL OR v_aud_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el certificado de auditoría asociado no existe o está archivado.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_prog_anchor IS DISTINCT FROM v_prog_target THEN
        RAISE EXCEPTION 'Violación de Vínculo: solo se pueden asociar certificados pertenecientes a la misma campaña de auditoría.'
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_sitio_temporal_certificado ON public.auditoria_sitio_temporal_certificado;
CREATE TRIGGER trg_validar_sitio_temporal_certificado
    BEFORE INSERT OR UPDATE OF id_sitio_temporal, id_auditoria_certificado, deleted_at ON public.auditoria_sitio_temporal_certificado
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_sitio_temporal_certificado();

-- Trigger 3: Guardia al apagar tiene_sitio_temporal en auditoria
CREATE OR REPLACE FUNCTION public.fn_guard_apagar_temporal_auditoria()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF OLD.tiene_sitio_temporal = TRUE AND NEW.tiene_sitio_temporal = FALSE THEN
        IF EXISTS (
            SELECT 1 FROM public.auditoria_sitio_temporal st
            WHERE st.id_auditoria = NEW.id AND st.deleted_at IS NULL
        ) THEN
            RAISE EXCEPTION 'No se puede desactivar Sitio Temporal: existen sitios temporales activos asociados. Archívelos en Paso 5 (Temporal).'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_apagar_temporal_auditoria ON public.auditoria;
CREATE TRIGGER trg_guard_apagar_temporal_auditoria
    BEFORE UPDATE OF tiene_sitio_temporal ON public.auditoria
    FOR EACH ROW EXECUTE FUNCTION public.fn_guard_apagar_temporal_auditoria();
```
*(Registrar `'auditoria_sitio_temporal'` en `v_core_tables`, `v_guarded_parents`, `get_archive_dependency_summary`, y `'auditoria_sitio_temporal_certificado'` en `v_child_tables`, más triggers `update_updated_at_column` y `audit_log` en `01_creacion.sql`.)*

### 3.3 `public/supabase/queries/03_indices_optimizacion.sql`
```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_sitio_temporal_auditoria_etiqueta_active
    ON public.auditoria_sitio_temporal (id_auditoria, LOWER(TRIM(etiqueta))) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sitio_temporal_certificado_active
    ON public.auditoria_sitio_temporal_certificado (id_sitio_temporal, id_auditoria_certificado) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sitio_temporal_auditoria
    ON public.auditoria_sitio_temporal (id_auditoria) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sitio_temporal_cert_lookup
    ON public.auditoria_sitio_temporal_certificado (id_auditoria_certificado) WHERE deleted_at IS NULL;
```

### 3.4 `public/supabase/queries/04_rls.sql`
1. Añadir `'auditoria_sitio_temporal'` y `'auditoria_sitio_temporal_certificado'` a `REVOKE DELETE` y `archive_record()`.
2. Habilitar RLS y definir políticas respetando aislamiento `CLIENT` (Nivel 2) y `AUDITOR` asignado:
```sql
ALTER TABLE public.auditoria_sitio_temporal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_sitio_temporal_certificado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auditoria_sitio_temporal_select" ON public.auditoria_sitio_temporal FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND (
                public.is_approved_worker()
                OR public.is_assigned_auditor(id_auditoria)
                OR EXISTS (
                    SELECT 1 FROM public.auditoria a
                    JOIN public.certificado c ON c.id = a.id_certificado
                    WHERE a.id = auditoria_sitio_temporal.id_auditoria
                      AND a.deleted_at IS NULL
                      AND c.deleted_at IS NULL
                      AND public.has_client_org_access(c.id_organizacion)
                )
            )
        )
    );
CREATE POLICY "auditoria_sitio_temporal_insert_worker" ON public.auditoria_sitio_temporal
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "auditoria_sitio_temporal_update_worker" ON public.auditoria_sitio_temporal
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

CREATE POLICY "auditoria_sitio_temporal_cert_select" ON public.auditoria_sitio_temporal_certificado FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND (
                public.is_approved_worker()
                OR public.is_assigned_auditor(id_auditoria_certificado)
                OR EXISTS (
                    SELECT 1 FROM public.auditoria a
                    JOIN public.certificado c ON c.id = a.id_certificado
                    WHERE a.id = auditoria_sitio_temporal_certificado.id_auditoria_certificado
                      AND a.deleted_at IS NULL
                      AND c.deleted_at IS NULL
                      AND public.has_client_org_access(c.id_organizacion)
                )
            )
        )
    );
CREATE POLICY "auditoria_sitio_temporal_cert_insert_worker" ON public.auditoria_sitio_temporal_certificado
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "auditoria_sitio_temporal_cert_update_worker" ON public.auditoria_sitio_temporal_certificado
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));
```

### 3.5 `public/supabase/queries/06_datos_prueba.sql`
Insertar al menos 1 registro semilla en `auditoria_sitio_temporal` (`etiqueta = 'Sitio Temporal — Obra Planta Sur'`, `tiempo_auditoria = 1.00`, `comentario = 'Proyecto de ampliación nave B'`) y asociarlo en `auditoria_sitio_temporal_certificado` a los certificados de una campaña vinculada con `tiene_sitio_temporal = TRUE`.

---

## 4. Lógica Pura
*(Implementada en Step 5.2.)*

---

## 5. Orquestación UI y Estado
*(Implementada en Step 5.2.)*

---

## 6. Matriz RBAC del Paso 5.1

| Rol | `SELECT temporal` | `INSERT / UPDATE / Archive` | `Restaurar` |
| :--- | :--- | :--- | :--- |
| **`ADMIN`** | Todos (incluye archivados) | Sí | Sí |
| **`WORKER`** | Todos activos | Sí | No |
| **`AUDITOR`** | Solo auditorías asignadas | No | No |
| **`CLIENT`** | Solo certificados de sus orgs | No | No |

---

## 7. Pruebas SQL
* Intentar `INSERT INTO auditoria_sitio_temporal` sobre auditoría con `tiene_sitio_temporal = FALSE` → bloqueado por trigger.
* Intentar `tiempo_auditoria = 0.33` → rechazado por constraint `0.25d`.
* Intentar asociar `id_auditoria_certificado` de otra campaña en `auditoria_sitio_temporal_certificado` → bloqueado por `fn_validar_sitio_temporal_certificado`.

---

## 8. Criterios de Aceptación (Done Criteria)
- [ ] Tablas `auditoria_sitio_temporal` y `auditoria_sitio_temporal_certificado` operativas con soft-delete, `REVOKE DELETE`, `audit_log` y RLS Nivel 2.
- [ ] Precisión `0.25d` forzada en BD.
- [ ] Datos de prueba sembrados en `06_datos_prueba.sql`.
