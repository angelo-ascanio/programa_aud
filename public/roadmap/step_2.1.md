# Step 2.1: `Vínculo` — Base de Datos (`vinculo`, `vinculo_certificado`), Estatus `LIBRE`/`INDIVIDUAL`/`VINCULADO` y Flag Temporal

## 1. Identificador, Nombre y Dependencias
* **Step ID:** `2.1`
* **Nombre Corto (UI):** `Vínculo`
* **Bloque / Sub-sección:** Bloque 1 — `Auditoría` → `Vínculo` (1ª sub-sección del Bloque 1)
* **Dependencias:** `step_1.1.md` (`grupo_empresarial` y `organizacion.id_grupo_empresarial` activos)

---

## 2. Alcance Exacto y Reglas de Negocio
1. **Entidad Persistente de Compromiso (`public.vinculo` + `public.vinculo_certificado`):**
   * Un certificado solo puede estar en **uno** de 3 estados operativos:
     * **`LIBRE`**: No tiene fila activa (`deleted_at IS NULL`) en `vinculo_certificado`. **Regla Inquebrantable:** Mientras un certificado sea `LIBRE`, NO puede recibir filas en `public.auditoria` (ni `PROGRAMADA_EXACTA` ni `PREPROGRAMADA_MES`).
     * **`INDIVIDUAL`**: Tiene 1 fila activa en `vinculo_certificado` apuntando a un `vinculo` con `nivel_vinculacion = 'INDIVIDUAL'`, `tipo_vinculacion = 'Individual'`, `es_vinculada = FALSE` (exactamente 1 certificado activo).
     * **`VINCULADO`**: Tiene 1 fila activa en `vinculo_certificado` apuntando a un `vinculo` con `es_vinculada = TRUE` (`NIVEL_1_INTRA_ORG` o `NIVEL_2_INTER_ORG`, mínimo 2 certificados activos del **mismo `id_grupo_empresarial`**).
2. **Atributos de `public.vinculo`:**
   * `id_grupo_empresarial` (`UUID NOT NULL FK grupo_empresarial`)
   * `codigo_vinculo` (`VARCHAR(40) NULL`)
   * `etiqueta` (`VARCHAR(180) NOT NULL`, por defecto `<Org> · <Cert>` si es individual)
   * `nivel_vinculacion` (`'INDIVIDUAL' | 'NIVEL_1_INTRA_ORG' | 'NIVEL_2_INTER_ORG'`)
   * `tipo_vinculacion` (`'Individual' | 'Combinada' | 'Integrada' | 'Conjunta' | 'Simultánea' | 'Multientidad' | 'Mixta'`) — **se elimina `'Multisitio'` y se migra a `'Mixta'`**.
   * `es_vinculada` (`BOOLEAN NOT NULL DEFAULT FALSE`)
   * `tiene_sitio_temporal` (`BOOLEAN NOT NULL DEFAULT FALSE`) — indica si este vínculo incluye al menos un sitio temporal/proyecto a auditar; **se hereda** a cada nueva `auditoria` creada en el Paso 3.
3. **Unicidad de Compromiso Activo:** Índice parcial único `uq_vinculo_certificado_cert_active ON public.vinculo_certificado (id_certificado) WHERE deleted_at IS NULL` garantiza que un certificado pertenezca a lo sumo a **un** vínculo activo a la vez.
4. **Enlace desde `programa_auditoria` y `auditoria`:**
   * `programa_auditoria` incorpora `id_vinculo UUID NOT NULL REFERENCES public.vinculo(id) ON DELETE RESTRICT`, `id_grupo_empresarial UUID NOT NULL REFERENCES public.grupo_empresarial(id) ON DELETE RESTRICT` y `tiene_sitio_temporal BOOLEAN NOT NULL DEFAULT FALSE`.
   * `auditoria` incorpora `tiene_sitio_temporal BOOLEAN NOT NULL DEFAULT FALSE`.
5. **Desvinculación Controlada:** Al archivar una fila de `vinculo_certificado`:
   * El certificado regresa instantáneamente a `LIBRE`.
   * Trigger bloquea desvincular si el certificado posee auditorías en curso no cerradas/canceladas (`estado_ciclo IN ('En Programación', 'Programada', 'En Ejecución', 'Auditada', 'Reprogramada')`) dentro de ese vínculo, salvo cancelación/cierre previo.
   * Si el `vinculo` origen queda con `0` certificados activos, se archiva automáticamente.

---

## 3. Cambios Exactos en Base de Datos (`00`, `01`, `03`, `04`, `06`)

### 3.1 `public/supabase/queries/00_delete_tables.sql`
```sql
DROP TABLE IF EXISTS public.vinculo_certificado CASCADE;
DROP TABLE IF EXISTS public.vinculo CASCADE;
```
*(Colocar después de `programa_auditoria` y antes de `certificado`/`grupo_empresarial`.)*

### 3.2 `public/supabase/queries/01_creacion.sql`
```sql
CREATE TABLE IF NOT EXISTS public.vinculo (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_grupo_empresarial UUID NOT NULL REFERENCES public.grupo_empresarial(id) ON DELETE RESTRICT,
    codigo_vinculo VARCHAR(40) NULL,
    etiqueta VARCHAR(180) NOT NULL,
    nivel_vinculacion VARCHAR(30) NOT NULL DEFAULT 'INDIVIDUAL'
        CONSTRAINT check_vinculo_nivel CHECK (
            nivel_vinculacion IN ('INDIVIDUAL', 'NIVEL_1_INTRA_ORG', 'NIVEL_2_INTER_ORG')
        ),
    tipo_vinculacion VARCHAR(30) NOT NULL DEFAULT 'Individual'
        CONSTRAINT check_vinculo_tipo CHECK (
            tipo_vinculacion IN (
                'Individual', 'Combinada', 'Integrada',
                'Conjunta', 'Simultánea', 'Multientidad', 'Mixta'
            )
        ),
    es_vinculada BOOLEAN NOT NULL DEFAULT FALSE,
    tiene_sitio_temporal BOOLEAN NOT NULL DEFAULT FALSE,
    notas TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    delete_reason TEXT,
    CONSTRAINT check_vinculo_coherencia CHECK (
        (nivel_vinculacion = 'INDIVIDUAL' AND tipo_vinculacion = 'Individual' AND es_vinculada = FALSE)
        OR (nivel_vinculacion IN ('NIVEL_1_INTRA_ORG', 'NIVEL_2_INTER_ORG') AND tipo_vinculacion <> 'Individual' AND es_vinculada = TRUE)
    )
);

CREATE TABLE IF NOT EXISTS public.vinculo_certificado (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_vinculo UUID NOT NULL REFERENCES public.vinculo(id) ON DELETE CASCADE,
    id_certificado UUID NOT NULL REFERENCES public.certificado(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Migración en programa_auditoria y auditoria
UPDATE public.programa_auditoria
SET tipo_vinculacion = 'Mixta'
WHERE tipo_vinculacion = 'Multisitio';

ALTER TABLE public.programa_auditoria
    DROP CONSTRAINT IF EXISTS check_programa_tipo_vinculacion;
ALTER TABLE public.programa_auditoria
    ADD CONSTRAINT check_programa_tipo_vinculacion CHECK (
        tipo_vinculacion IN (
            'Individual', 'Combinada', 'Integrada',
            'Conjunta', 'Simultánea', 'Multientidad', 'Mixta'
        )
    );

ALTER TABLE public.programa_auditoria
    ADD COLUMN IF NOT EXISTS id_vinculo UUID NULL REFERENCES public.vinculo(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS id_grupo_empresarial UUID NULL REFERENCES public.grupo_empresarial(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS tiene_sitio_temporal BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.auditoria
    ADD COLUMN IF NOT EXISTS tiene_sitio_temporal BOOLEAN NOT NULL DEFAULT FALSE;

-- Trigger 1: Validar mismo conglomerado y unicidad de vínculo al adherir certificado
CREATE OR REPLACE FUNCTION public.fn_validar_vinculo_certificado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_vinculo_grupo UUID;
    v_vinculo_nivel VARCHAR(30);
    v_vinculo_deleted TIMESTAMPTZ;
    v_cert_org UUID;
    v_cert_grupo UUID;
    v_cert_deleted TIMESTAMPTZ;
    v_active_count INTEGER;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT v.id_grupo_empresarial, v.nivel_vinculacion, v.deleted_at
      INTO v_vinculo_grupo, v_vinculo_nivel, v_vinculo_deleted
    FROM public.vinculo v
    WHERE v.id = NEW.id_vinculo
    FOR UPDATE;

    IF NOT FOUND OR v_vinculo_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el vínculo seleccionado no existe o está archivado.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT c.id_organizacion, o.id_grupo_empresarial, c.deleted_at
      INTO v_cert_org, v_cert_grupo, v_cert_deleted
    FROM public.certificado c
    JOIN public.organizacion o ON o.id = c.id_organizacion
    WHERE c.id = NEW.id_certificado
      AND o.deleted_at IS NULL;

    IF v_cert_org IS NULL OR v_cert_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el certificado o su organización no existe o está archivada.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_cert_grupo IS DISTINCT FROM v_vinculo_grupo THEN
        RAISE EXCEPTION 'Violación de Conglomerado: solo pueden vincularse certificados pertenecientes al mismo conglomerado.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_vinculo_nivel = 'INDIVIDUAL' THEN
        SELECT COUNT(*)::INTEGER INTO v_active_count
        FROM public.vinculo_certificado vc
        WHERE vc.id_vinculo = NEW.id_vinculo
          AND vc.id <> NEW.id
          AND vc.deleted_at IS NULL;
        IF v_active_count >= 1 THEN
            RAISE EXCEPTION 'Un vínculo Individual admite exactamente un certificado activo.'
                USING ERRCODE = 'P0001';
        END IF;
    ELSIF v_vinculo_nivel = 'NIVEL_1_INTRA_ORG' THEN
        IF EXISTS (
            SELECT 1
            FROM public.vinculo_certificado vc
            JOIN public.certificado c ON c.id = vc.id_certificado
            WHERE vc.id_vinculo = NEW.id_vinculo
              AND vc.id <> NEW.id
              AND vc.deleted_at IS NULL
              AND c.id_organizacion IS DISTINCT FROM v_cert_org
        ) THEN
            RAISE EXCEPTION 'Violación Nivel 1 Intra-Org: todos los certificados deben pertenecer a la misma organización.'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_vinculo_certificado ON public.vinculo_certificado;
CREATE TRIGGER trg_validar_vinculo_certificado
    BEFORE INSERT OR UPDATE OF id_vinculo, id_certificado, deleted_at ON public.vinculo_certificado
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_vinculo_certificado();

-- Trigger 2: Bloquear desvinculación con auditorías pendientes y archivar vínculo vacío
CREATE OR REPLACE FUNCTION public.fn_validar_desvinculacion_certificado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_remaining INTEGER;
BEGIN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        IF EXISTS (
            SELECT 1
            FROM public.auditoria a
            JOIN public.programa_auditoria pa ON pa.id = a.id_programa_auditoria
            WHERE pa.id_vinculo = OLD.id_vinculo
              AND a.id_certificado = OLD.id_certificado
              AND a.deleted_at IS NULL
              AND a.estado_ciclo NOT IN ('Cerrada', 'Cancelada', 'Auditada')
        ) THEN
            RAISE EXCEPTION 'No se puede desvincular el certificado: existen auditorías pendientes o en ejecución bajo este vínculo.'
                USING ERRCODE = 'P0001';
        END IF;

        SELECT COUNT(*)::INTEGER INTO v_remaining
        FROM public.vinculo_certificado vc
        WHERE vc.id_vinculo = OLD.id_vinculo
          AND vc.id <> OLD.id
          AND vc.deleted_at IS NULL;

        IF v_remaining = 0 THEN
            UPDATE public.vinculo
            SET deleted_at = NOW(),
                deleted_by = COALESCE(NEW.deleted_by, auth.uid()),
                delete_reason = 'Limpieza automática: vínculo sin certificados activos'
            WHERE id = OLD.id_vinculo
              AND deleted_at IS NULL;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_desvinculacion_certificado ON public.vinculo_certificado;
CREATE TRIGGER trg_validar_desvinculacion_certificado
    AFTER UPDATE OF deleted_at ON public.vinculo_certificado
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_desvinculacion_certificado();

-- Trigger 3: Actualizar fn_validar_auditoria_en_programa para bloquear certificados LIBRES y heredar tiene_sitio_temporal
CREATE OR REPLACE FUNCTION public.fn_validar_auditoria_en_programa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_nivel_programa VARCHAR(30);
    v_programa_deleted TIMESTAMPTZ;
    v_programa_vinculo UUID;
    v_programa_temporal BOOLEAN;
    v_cert_org UUID;
    v_cert_grupo UUID;
    v_cert_deleted TIMESTAMPTZ;
    v_active_count INTEGER;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT pa.nivel_vinculacion, pa.deleted_at, pa.id_vinculo, pa.tiene_sitio_temporal
      INTO v_nivel_programa, v_programa_deleted, v_programa_vinculo, v_programa_temporal
    FROM public.programa_auditoria pa
    WHERE pa.id = NEW.id_programa_auditoria
    FOR UPDATE;

    IF NOT FOUND OR v_programa_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: la campaña de auditoría no existe o está archivada.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT c.id_organizacion, o.id_grupo_empresarial, c.deleted_at
      INTO v_cert_org, v_cert_grupo, v_cert_deleted
    FROM public.certificado c
    JOIN public.organizacion o ON o.id = c.id_organizacion
    WHERE c.id = NEW.id_certificado
      AND o.deleted_at IS NULL;

    IF v_cert_org IS NULL OR v_cert_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el certificado o su organización no existe o está archivada.'
            USING ERRCODE = 'P0001';
    END IF;

    -- Compuerta Paso 2 (Insalvable): El certificado NO puede estar LIBRE
    IF NOT EXISTS (
        SELECT 1
        FROM public.vinculo_certificado vc
        JOIN public.vinculo v ON v.id = vc.id_vinculo
        WHERE vc.id_certificado = NEW.id_certificado
          AND vc.deleted_at IS NULL
          AND v.deleted_at IS NULL
          AND (v_programa_vinculo IS NULL OR v.id = v_programa_vinculo)
    ) THEN
        RAISE EXCEPTION 'Compuerta Paso 2 (Vínculo): El certificado se encuentra LIBRE o no pertenece al vínculo activo de esta campaña. Configúrelo primero en Auditoría → Vínculo.'
            USING ERRCODE = 'P0001';
    END IF;

    IF TG_OP = 'INSERT' AND NEW.tiene_sitio_temporal = FALSE AND v_programa_temporal = TRUE THEN
        NEW.tiene_sitio_temporal := TRUE;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.auditoria a
        WHERE a.id_programa_auditoria = NEW.id_programa_auditoria
          AND a.id_certificado = NEW.id_certificado
          AND a.id <> NEW.id
          AND a.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Operación bloqueada: el certificado ya tiene una auditoría activa en esta campaña.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_nivel_programa = 'INDIVIDUAL' THEN
        SELECT COUNT(*)::INTEGER INTO v_active_count
        FROM public.auditoria a
        WHERE a.id_programa_auditoria = NEW.id_programa_auditoria
          AND a.id <> NEW.id
          AND a.deleted_at IS NULL;
        IF v_active_count >= 1 THEN
            RAISE EXCEPTION 'Violación Individual: la campaña solo admite un certificado.'
                USING ERRCODE = 'P0001';
        END IF;
    ELSIF v_nivel_programa = 'NIVEL_1_INTRA_ORG' THEN
        IF EXISTS (
            SELECT 1 FROM public.auditoria a
            JOIN public.certificado c ON c.id = a.id_certificado
            WHERE a.id_programa_auditoria = NEW.id_programa_auditoria
              AND a.id <> NEW.id
              AND a.deleted_at IS NULL
              AND c.id_organizacion IS DISTINCT FROM v_cert_org
        ) THEN
            RAISE EXCEPTION 'Violación Nivel 1: los certificados deben pertenecer a la misma organización.'
                USING ERRCODE = 'P0001';
        END IF;
    ELSIF v_nivel_programa = 'NIVEL_2_INTER_ORG' THEN
        IF EXISTS (
            SELECT 1 FROM public.auditoria a
            JOIN public.certificado c ON c.id = a.id_certificado
            JOIN public.organizacion o ON o.id = c.id_organizacion
            WHERE a.id_programa_auditoria = NEW.id_programa_auditoria
              AND a.id <> NEW.id
              AND a.deleted_at IS NULL
              AND o.id_grupo_empresarial IS DISTINCT FROM v_cert_grupo
        ) THEN
            RAISE EXCEPTION 'Violación Nivel 2: todos los certificados vinculados deben pertenecer al mismo conglomerado.'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;
```
*(Registrar `'vinculo'` en `v_core_tables` y `'vinculo_certificado'` en `v_child_tables`, añadir `'vinculo'` a `v_guarded_parents`, `get_archive_dependency_summary` y `audit_log` + `update_updated_at` triggers en `01_creacion.sql`.)*

### 3.3 `public/supabase/queries/03_indices_optimizacion.sql`
```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_vinculo_codigo_active
    ON public.vinculo (codigo_vinculo) WHERE codigo_vinculo IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_vinculo_certificado_cert_active
    ON public.vinculo_certificado (id_certificado) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vinculo_grupo_nivel
    ON public.vinculo (id_grupo_empresarial, nivel_vinculacion) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vinculo_certificado_vinculo
    ON public.vinculo_certificado (id_vinculo, id_certificado) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_programa_auditoria_vinculo
    ON public.programa_auditoria (id_vinculo) WHERE deleted_at IS NULL;
```

### 3.4 `public/supabase/queries/04_rls.sql`
1. Añadir `'vinculo'` y `'vinculo_certificado'` a `REVOKE DELETE` y `archive_record()`.
2. Habilitar RLS y definir políticas sin fugas Nivel 2 para `CLIENT`:
```sql
ALTER TABLE public.vinculo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vinculo_certificado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vinculo_select" ON public.vinculo FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND (
                public.is_approved_worker()
                OR EXISTS (
                    SELECT 1 FROM public.vinculo_certificado vc
                    JOIN public.certificado c ON c.id = vc.id_certificado
                    WHERE vc.id_vinculo = vinculo.id
                      AND vc.deleted_at IS NULL
                      AND c.deleted_at IS NULL
                      AND (
                          public.has_client_org_access(c.id_organizacion)
                          OR public.is_auditor_for_cert(c.id)
                      )
                )
            )
        )
    );
CREATE POLICY "vinculo_insert_worker" ON public.vinculo
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "vinculo_update_worker" ON public.vinculo
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

CREATE POLICY "vinculo_certificado_select" ON public.vinculo_certificado FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND (
                public.is_approved_worker()
                OR EXISTS (
                    SELECT 1 FROM public.certificado c
                    WHERE c.id = vinculo_certificado.id_certificado
                      AND c.deleted_at IS NULL
                      AND (
                          public.has_client_org_access(c.id_organizacion)
                          OR public.is_auditor_for_cert(c.id)
                      )
                )
            )
        )
    );
CREATE POLICY "vinculo_certificado_insert_worker" ON public.vinculo_certificado
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "vinculo_certificado_update_worker" ON public.vinculo_certificado
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));
```

### 3.5 `public/supabase/queries/06_datos_prueba.sql`
Poblar `public.vinculo` y `public.vinculo_certificado` para los certificados iniciales (incluyendo al menos 1 certificado en estado `LIBRE`, 1 en `INDIVIDUAL` y 1 grupo `VINCULADO` en `CONG-IND-01` con `tiene_sitio_temporal = TRUE`), y enlazar `programa_auditoria.id_vinculo` y `programa_auditoria.id_grupo_empresarial`.

---

## 4. Lógica Pura
*(Implementada en Step 2.2.)*

---

## 5. Orquestación UI y Estado
*(Implementada en Step 2.3.)*

---

## 6. Matriz RBAC del Paso 2.1

| Rol | `vinculo` / `vinculo_certificado` SELECT | Crear / Editar / Desvincular | `DELETE` físico |
| :--- | :--- | :--- | :--- |
| **`ADMIN`** | Todos (incluye archivados) | Sí | Bloqueado |
| **`WORKER`** | Todos los activos (`deleted_at IS NULL`) | Sí | Bloqueado |
| **`AUDITOR`** | Solo vínculos donde `is_auditor_for_cert()` aplica | No | Bloqueado |
| **`CLIENT`** | Solo sus certificados (`has_client_org_access`); nunca ve `vinculo_certificado` de otras orgs en `NIVEL_2_INTER_ORG` | No | Bloqueado |

---

## 7. Pruebas SQL de Verificación
* Intentar `INSERT INTO public.auditoria` sobre un certificado sin fila activa en `vinculo_certificado` → debe fallar con `'Compuerta Paso 2 (Vínculo): El certificado se encuentra LIBRE...'`.
* Intentar vincular dos certificados de distintos `grupo_empresarial` → debe fallar con `'Violación de Conglomerado'`.
* Desvincular el único certificado de un vínculo → verificar que `vinculo.deleted_at` se establece automáticamente y el certificado queda `LIBRE`.

---

## 8. Criterios de Aceptación (Done Criteria)
- [ ] `vinculo` y `vinculo_certificado` creados con índices únicos parciales (`uq_vinculo_certificado_cert_active`).
- [ ] `'Multisitio'` reemplazado por `'Mixta'` en `vinculo` y `programa_auditoria`.
- [ ] `tiene_sitio_temporal` agregado en `vinculo`, `programa_auditoria` y `auditoria` con herencia en trigger.
- [ ] `04_rls.sql` aísla certificados de empresas hermanas frente a `CLIENT`.
