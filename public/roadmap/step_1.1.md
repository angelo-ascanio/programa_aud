# Step 1.1: `Conglomerado` (`grupo_empresarial`) — Base de Datos, Triggers Automáticos, Soft-Delete y RLS

## 1. Identificador, Nombre y Dependencias
* **Step ID:** `1.1`
* **Nombre Corto (UI):** `Conglomerado` (tabla SQL: `public.grupo_empresarial`)
* **Bloque / Sub-sección:** Bloque 2 — `Certificación` (Posición #1, antes de `Organización`)
* **Dependencias:** Ninguna (paso fundacional de Bloque 2; habilita Paso 2 `Vínculo`)

---

## 2. Alcance Exacto y Reglas de Negocio
1. **Entidad Padre Obligatoria sobre `organizacion`:** Todo registro activo en `public.organizacion` DEBE pertenecer a un `public.grupo_empresarial` activo (`id_grupo_empresarial UUID NOT NULL REFERENCES public.grupo_empresarial(id) ON DELETE RESTRICT`).
2. **Creación Automática 1:1 para Organización Sola:** Si se inserta una `organizacion` sin especificar `id_grupo_empresarial` (`NULL`), el trigger `BEFORE INSERT` crea automáticamente un `grupo_empresarial` con `nombre = NEW.nombre`, `es_individual_auto = TRUE` y lo enlaza al nuevo registro.
3. **Re-agrupación sin Fricción y Limpieza Automática de Grupos Huérfanos:** Cuando una `organizacion` cambia de `id_grupo_empresarial` o es archivada (`deleted_at` pasa a no-nulo), el trigger `AFTER UPDATE` verifica si el `OLD.id_grupo_empresarial` quedó con `0` organizaciones activas (`deleted_at IS NULL`). Si queda vacío, lo archiva automáticamente (`deleted_at = NOW()`, `delete_reason = 'Limpieza automática: grupo sin organizaciones activas'`), evitando basura visual de contenedores vacíos.
4. **Detección de Coherencia:** Al asignar `organizacion.id_grupo_empresarial` manualmente, el trigger verifica que el grupo destino exista y tenga `deleted_at IS NULL`.
5. **Aislamiento Nivel 2 (`CLIENT`) Sin Fuga:** Un usuario `CLIENT` con acceso a la Organización A (dentro de un conglomerado multi-empresa `{A, B}`) puede leer el nombre del `grupo_empresarial` de A, **pero RLS de `organizacion_select` bloquea totalmente a B**, impidiendo que el cliente descubra qué otras empresas comparten ese conglomerado.

---

## 3. Cambios Exactos en Base de Datos (`00`, `01`, `03`, `04`)

### 3.1 `public/supabase/queries/00_delete_tables.sql`
Ajustar orden de eliminación respetando FKs (`organizacion` referencia a `grupo_empresarial`):
```sql
DROP TABLE IF EXISTS public.organizacion CASCADE;
DROP TABLE IF EXISTS public.grupo_empresarial CASCADE;
```

### 3.2 `public/supabase/queries/01_creacion.sql`
```sql
-- Tabla Core: Conglomerado / Agrupador Empresarial (Paso 1)
CREATE TABLE IF NOT EXISTS public.grupo_empresarial (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo_grupo VARCHAR(40) NULL,
    nombre VARCHAR(220) NOT NULL,
    es_individual_auto BOOLEAN NOT NULL DEFAULT TRUE,
    notas TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    delete_reason TEXT
);

-- Alteración / definición de organizacion con FK obligatoria
CREATE TABLE IF NOT EXISTS public.organizacion (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_grupo_empresarial UUID NOT NULL REFERENCES public.grupo_empresarial(id) ON DELETE RESTRICT,
    nombre VARCHAR(200) NOT NULL,
    rif VARCHAR(50),
    direccion_fiscal TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    delete_reason TEXT
);

-- Migración idempotente si organizacion ya existía sin id_grupo_empresarial
ALTER TABLE public.organizacion
    ADD COLUMN IF NOT EXISTS id_grupo_empresarial UUID NULL REFERENCES public.grupo_empresarial(id) ON DELETE RESTRICT;

-- Trigger 1: Auto-creación 1:1 si organizacion entra sin id_grupo_empresarial + validación de grupo activo
CREATE OR REPLACE FUNCTION public.fn_auto_asignar_grupo_organizacion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_grupo_id UUID;
    v_grupo_deleted TIMESTAMPTZ;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.id_grupo_empresarial IS NULL THEN
        INSERT INTO public.grupo_empresarial (nombre, es_individual_auto, notas)
        VALUES (
            TRIM(NEW.nombre),
            TRUE,
            'Grupo individual creado automáticamente para organización independiente.'
        )
        RETURNING id INTO v_grupo_id;
        NEW.id_grupo_empresarial := v_grupo_id;
        RETURN NEW;
    END IF;

    SELECT g.deleted_at INTO v_grupo_deleted
    FROM public.grupo_empresarial g
    WHERE g.id = NEW.id_grupo_empresarial;

    IF NOT FOUND OR v_grupo_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el conglomerado destino no existe o está archivado.'
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_asignar_grupo_organizacion ON public.organizacion;
CREATE TRIGGER trg_auto_asignar_grupo_organizacion
    BEFORE INSERT OR UPDATE OF id_grupo_empresarial ON public.organizacion
    FOR EACH ROW EXECUTE FUNCTION public.fn_auto_asignar_grupo_organizacion();

-- Trigger 2: Recalcular es_individual_auto y archivar grupos vacíos al mover/archivar organizaciones
CREATE OR REPLACE FUNCTION public.fn_sincronizar_limpieza_grupo_empresarial()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_old_count INTEGER := 0;
    v_new_count INTEGER := 0;
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.id_grupo_empresarial IS NOT NULL
       AND (NEW.id_grupo_empresarial IS DISTINCT FROM OLD.id_grupo_empresarial
            OR (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)) THEN
        SELECT COUNT(*)::INTEGER INTO v_old_count
        FROM public.organizacion o
        WHERE o.id_grupo_empresarial = OLD.id_grupo_empresarial
          AND o.deleted_at IS NULL;

        IF v_old_count = 0 THEN
            UPDATE public.grupo_empresarial
            SET deleted_at = NOW(),
                deleted_by = COALESCE(NEW.deleted_by, auth.uid()),
                delete_reason = 'Limpieza automática: grupo sin organizaciones activas',
                updated_at = NOW()
            WHERE id = OLD.id_grupo_empresarial
              AND deleted_at IS NULL;
        ELSE
            UPDATE public.grupo_empresarial
            SET es_individual_auto = (v_old_count = 1),
                updated_at = NOW()
            WHERE id = OLD.id_grupo_empresarial
              AND deleted_at IS NULL;
        END IF;
    END IF;

    IF NEW.id_grupo_empresarial IS NOT NULL AND NEW.deleted_at IS NULL THEN
        SELECT COUNT(*)::INTEGER INTO v_new_count
        FROM public.organizacion o
        WHERE o.id_grupo_empresarial = NEW.id_grupo_empresarial
          AND o.deleted_at IS NULL;

        UPDATE public.grupo_empresarial
        SET es_individual_auto = (v_new_count <= 1),
            updated_at = NOW()
        WHERE id = NEW.id_grupo_empresarial
          AND deleted_at IS NULL;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sincronizar_limpieza_grupo_empresarial ON public.organizacion;
CREATE TRIGGER trg_sincronizar_limpieza_grupo_empresarial
    AFTER INSERT OR UPDATE OF id_grupo_empresarial, deleted_at ON public.organizacion
    FOR EACH ROW EXECUTE FUNCTION public.fn_sincronizar_limpieza_grupo_empresarial();
```

#### Registro de Gobernanza en `01_creacion.sql`
1. Añadir `'grupo_empresarial'` al arreglo `v_core_tables` en el bloque `fn_prevent_hard_delete` y crear `trg_prevent_hard_delete_grupo_empresarial`.
2. Añadir `trg_update_updated_at_grupo_empresarial` usando `update_updated_at_column()`.
3. Añadir `trg_audit_log_grupo_empresarial` usando `fn_audit_log_capture()`.
4. Añadir `'grupo_empresarial'` a `v_guarded_parents` y agregar en `get_archive_dependency_summary(p_table, p_record_id)`:
```sql
WHEN 'grupo_empresarial' THEN
    SELECT jsonb_build_object(
        'organizacion', (SELECT COUNT(*) FROM public.organizacion o WHERE o.id_grupo_empresarial = p_record_id AND o.deleted_at IS NULL),
        'programa_auditoria', (SELECT COUNT(*) FROM public.programa_auditoria p WHERE p.id_grupo_empresarial = p_record_id AND p.deleted_at IS NULL)
    ) INTO v_counts;
```
Y en `fn_guard_parent_archival()`:
```sql
IF TG_TABLE_NAME = 'grupo_empresarial' THEN
    IF EXISTS (SELECT 1 FROM public.organizacion o WHERE o.id_grupo_empresarial = NEW.id AND o.deleted_at IS NULL) THEN
        RAISE EXCEPTION 'No se puede archivar manualmente el conglomerado mientras tenga organizaciones activas vinculadas.'
            USING ERRCODE = 'P0001';
    END IF;
END IF;
```

### 3.3 `public/supabase/queries/03_indices_optimizacion.sql`
```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_grupo_empresarial_nombre_active
    ON public.grupo_empresarial (LOWER(TRIM(nombre))) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_grupo_empresarial_codigo_active
    ON public.grupo_empresarial (codigo_grupo) WHERE codigo_grupo IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_grupo_empresarial_nombre
    ON public.grupo_empresarial (nombre) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_organizacion_grupo_empresarial
    ON public.organizacion (id_grupo_empresarial) WHERE deleted_at IS NULL;
```

### 3.4 `public/supabase/queries/04_rls.sql`
1. Añadir `'grupo_empresarial'` a `v_non_deletable_tables` (`REVOKE DELETE ON public.grupo_empresarial FROM anon, authenticated`).
2. Añadir `'grupo_empresarial'` a `v_core_tables` dentro de `public.archive_record()`.
3. Habilitar RLS y políticas granulares (sin leakage Nivel 2):
```sql
ALTER TABLE public.grupo_empresarial ENABLE ROW LEVEL SECURITY;

CREATE POLICY "grupo_empresarial_select" ON public.grupo_empresarial FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND (
                public.is_approved_worker()
                OR EXISTS (
                    SELECT 1 FROM public.organizacion o
                    WHERE o.id_grupo_empresarial = grupo_empresarial.id
                      AND o.deleted_at IS NULL
                      AND (
                          public.has_client_org_access(o.id)
                          OR public.is_auditor_for_org(o.id)
                      )
                )
            )
        )
    );

CREATE POLICY "grupo_empresarial_insert_worker" ON public.grupo_empresarial
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);

CREATE POLICY "grupo_empresarial_update_worker" ON public.grupo_empresarial
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));
```

---

## 4. Lógica Pura (`src/lib/*.ts`)
*(Se implementa en el Step 1.2; aquí se garantiza únicamente que los triggers, RPCs y políticas RLS respondan con errores Zero-UUID legibles.)*

---

## 5. Orquestación UI y Estado (`src/views/*.ts` & `src/main.ts`)
*(Se implementa en el Step 1.3.)*

---

## 6. Matriz RBAC del Paso 1.1

| Rol | `SELECT grupo_empresarial` | `INSERT / UPDATE` | `archive_record` / Restaurar | `DELETE` físico |
| :--- | :--- | :--- | :--- | :--- |
| **`ADMIN`** | Todos (incluye `deleted_at IS NOT NULL`) | Permitido | Permitido + Restaurar | Bloqueado (`REVOKE DELETE` + trigger) |
| **`WORKER`** | Todos los activos (`deleted_at IS NULL`) | Permitido | Permitido (si 0 orgs activas) | Bloqueado |
| **`AUDITOR`** | Solo grupos con org de auditoría asignada (bloqueado en UI Bloque 2) | Bloqueado | Bloqueado | Bloqueado |
| **`CLIENT`** | Solo grupo de su org autorizada (`has_client_org_access`); orgs hermanas ocultas | Bloqueado | Bloqueado | Bloqueado |

---

## 7. Pruebas Automatizadas / SQL (`src/lib/*.test.ts` + Verificación SQL)
* Verificar tras `POST /api/reset-db` que `SELECT COUNT(*) FROM public.organizacion WHERE id_grupo_empresarial IS NULL` devuelve `0`.
* Verificar que `UPDATE organizacion SET id_grupo_empresarial = <otro>` archiva automáticamente el grupo anterior cuando queda con `0` organizaciones activas.
* Verificar con el JWT de `CLIENT` que `SELECT * FROM organizacion` solo retorna su propia organización aunque su `grupo_empresarial` contenga 2+ organizaciones en la base.

---

## 8. Criterios de Aceptación (Done Criteria)
- [ ] Tabla `public.grupo_empresarial` y columna `organizacion.id_grupo_empresarial NOT NULL` creadas sin errores en `01_creacion.sql`.
- [ ] Auto-creación 1:1 y limpieza automática de grupos vacíos probadas mediante triggers.
- [ ] Índices únicos parciales (`WHERE deleted_at IS NULL`) creados en `03_indices_optimizacion.sql`.
- [ ] `REVOKE DELETE`, `archive_record`, `v_guarded_parents`, `audit_log` y políticas RLS en `04_rls.sql` sin errores ni fugas `CLIENT`.
