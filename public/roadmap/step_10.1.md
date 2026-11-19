# Step 10.1: `Resultado` — BD (`REAL`, Offsets Configurables NC, Fechas Límite `hallazgo`, `fecha_cierre_auditoria` y Estado `'Cerrada'`)

## 1. Identificador, Nombre y Dependencias
* **Step ID:** `10.1`
* **Nombre Corto (UI):** `Resultado` (`#/auditorias/resultado`)
* **Bloque / Sub-sección:** Bloque 1 — `Auditoría` → `Resultado`
* **Dependencias:** `step_3.1.md` (`auditoria_fecha` `REAL`), `step_7.1.md` (equipos multi-auditor)

---

## 2. Alcance Exacto y Reglas de Negocio
1. **Fechas Reales de Ejecución (`auditoria_fecha` con `tipo_fecha = 'REAL'`):**
   * Al ejecutarse la auditoría, se registra la fecha real en `public.auditoria_fecha` con `tipo_fecha = 'REAL'`, `fecha_inicio`, `fecha_fin` (`fecha_fin >= fecha_inicio`), separada permanentemente de las fechas programadas/reprogramadas (`PROGRAMADA_EXACTA` / `PREPROGRAMADA_MES`).
2. **Parámetros Configurables de Plazos NC (`public.configuracion_alerta_auditoria`):**
   * `dias_limite_plan_accion INTEGER NOT NULL DEFAULT 15 CHECK (dias_limite_plan_accion BETWEEN 1 AND 180)` *(días calendario tras la última fecha real de ejecución para que la empresa entregue el Plan de Acción Correctivo)*.
   * `dias_limite_cierre_nc INTEGER NOT NULL DEFAULT 60 CHECK (dias_limite_cierre_nc BETWEEN 1 AND 365)` *(días calendario tras la última fecha real de ejecución para que el auditor verifique y cierre la evidencia de la NC)*.
3. **Extensión de `public.hallazgo` y Cálculo Automático de Plazos:**
   * Columnas nuevas en `public.hallazgo`:
     * `id_sitio UUID NULL REFERENCES public.sitio(id) ON DELETE RESTRICT`
     * `fecha_limite_plan DATE NULL` *(auto-calculado: `MAX(REAL.fecha_fin) + dias_limite_plan_accion`)*
     * `fecha_entrega_plan DATE NULL` *(fecha real de recepción del plan de acción)*
     * `fecha_limite_cierre DATE NULL` *(auto-calculado: `MAX(REAL.fecha_fin) + dias_limite_cierre_nc`)*
     * `fecha_cierre_real DATE NULL` *(fecha real en que se cerró la NC)*
   * Trigger `BEFORE INSERT` (`fn_auto_calcular_fechas_hallazgo`): si el hallazgo es `NC_MAYOR` o `NC_MENOR` (o cualquier hallazgo con plazo) y no se enviaron manualmente, calcula `fecha_limite_plan` y `fecha_limite_cierre` a partir de la última `fecha_fin` real de `auditoria_fecha` (con fallback a `fecha_fin` programada o `CURRENT_DATE`) sumando los parámetros vigentes de `configuracion_alerta_auditoria`.
4. **Fecha de Cierre de Auditoría y Compuerta hacia `Revisión` (`Paso 11`):**
   * En `public.auditoria`:
     * Ampliar `estado_ciclo` `CHECK` añadiendo **`'Cerrada'`** (`'Borrador'`, `'En Programación'`, `'Programada'`, `'En Ejecución'`, `'Auditada'`, **`'Cerrada'`**, `'Reprogramada'`, `'Cancelada'`).
     * Añadir `fecha_cierre_auditoria DATE NULL`.
   * **Regla de Cierre (`fn_validar_cierre_auditoria`):**
     * No se puede transicionar a `estado_ciclo = 'Cerrada'` sin: (a) tener al menos 1 fila `REAL` activa en `auditoria_fecha`, y (b) tener `fecha_cierre_auditoria IS NOT NULL`.
     * **Cálculo por defecto (aplicado en dominio/UI y pre-llenado si `NULL`):**
       * Si `0` No Conformidades (`NC_MAYOR` + `NC_MENOR`): por defecto = `MAX(REAL.fecha_fin)`.
       * Si `>= 1` No Conformidades: por defecto = `MAX(hallazgo.fecha_limite_cierre)` (o `MAX(fecha_cierre_real)` si todas cerradas).
       * Siempre **editable** por `ADMIN`/`WORKER`.

---

## 3. Cambios Exactos en Base de Datos (`01`, `03`, `04`, `06`)

### 3.1 `public/supabase/queries/01_creacion.sql`
```sql
-- 1. Ampliar auditoria con 'Cerrada' y fecha_cierre_auditoria
ALTER TABLE public.auditoria
    DROP CONSTRAINT IF EXISTS auditoria_estado_ciclo_check;
ALTER TABLE public.auditoria
    ADD CONSTRAINT auditoria_estado_ciclo_check CHECK (
        estado_ciclo IN (
            'Borrador',
            'En Programación',
            'Programada',
            'En Ejecución',
            'Auditada',
            'Cerrada',
            'Reprogramada',
            'Cancelada'
        )
    );

ALTER TABLE public.auditoria
    ADD COLUMN IF NOT EXISTS fecha_cierre_auditoria DATE NULL;

-- 2. Offsets configurables en configuracion_alerta_auditoria
ALTER TABLE public.configuracion_alerta_auditoria
    ADD COLUMN IF NOT EXISTS dias_limite_plan_accion INTEGER NOT NULL DEFAULT 15
        CHECK (dias_limite_plan_accion BETWEEN 1 AND 180),
    ADD COLUMN IF NOT EXISTS dias_limite_cierre_nc INTEGER NOT NULL DEFAULT 60
        CHECK (dias_limite_cierre_nc BETWEEN 1 AND 365);

-- 3. Extender hallazgo con sitio y fechas de seguimiento / cierre
ALTER TABLE public.hallazgo
    ADD COLUMN IF NOT EXISTS id_sitio UUID NULL REFERENCES public.sitio(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS fecha_limite_plan DATE NULL,
    ADD COLUMN IF NOT EXISTS fecha_entrega_plan DATE NULL,
    ADD COLUMN IF NOT EXISTS fecha_limite_cierre DATE NULL,
    ADD COLUMN IF NOT EXISTS fecha_cierre_real DATE NULL;

-- 4. Trigger BEFORE INSERT ON hallazgo: auto-calcular plazos desde MAX(REAL.fecha_fin)
CREATE OR REPLACE FUNCTION public.fn_auto_calcular_fechas_hallazgo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_last_real DATE;
    v_dias_plan INTEGER := 15;
    v_dias_cierre INTEGER := 60;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT COALESCE(MAX(af.fecha_fin), MAX(af.fecha_inicio))
      INTO v_last_real
    FROM public.auditoria_fecha af
    WHERE af.id_auditoria = NEW.id_auditoria
      AND af.tipo_fecha = 'REAL'
      AND af.deleted_at IS NULL;

    IF v_last_real IS NULL THEN
        SELECT COALESCE(MAX(af.fecha_fin), CURRENT_DATE)
          INTO v_last_real
        FROM public.auditoria_fecha af
        WHERE af.id_auditoria = NEW.id_auditoria
          AND af.deleted_at IS NULL;
    END IF;

    SELECT c.dias_limite_plan_accion, c.dias_limite_cierre_nc
      INTO v_dias_plan, v_dias_cierre
    FROM public.configuracion_alerta_auditoria c
    WHERE c.clave = 'DEFAULT' AND c.deleted_at IS NULL
    LIMIT 1;

    IF NEW.tipo IN ('NC_MAYOR', 'NC_MENOR') THEN
        IF NEW.fecha_limite_plan IS NULL THEN
            NEW.fecha_limite_plan := v_last_real + COALESCE(v_dias_plan, 15);
        END IF;
        IF NEW.fecha_limite_cierre IS NULL THEN
            NEW.fecha_limite_cierre := v_last_real + COALESCE(v_dias_cierre, 60);
        END IF;
    END IF;

    IF NEW.cerrado = TRUE AND NEW.fecha_cierre_real IS NULL THEN
        NEW.fecha_cierre_real := CURRENT_DATE;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_calcular_fechas_hallazgo ON public.hallazgo;
CREATE TRIGGER trg_auto_calcular_fechas_hallazgo
    BEFORE INSERT OR UPDATE OF cerrado ON public.hallazgo
    FOR EACH ROW EXECUTE FUNCTION public.fn_auto_calcular_fechas_hallazgo();

-- 5. Trigger BEFORE UPDATE ON auditoria: exigir fecha_cierre_auditoria y fecha REAL para estado 'Cerrada'
CREATE OR REPLACE FUNCTION public.fn_validar_cierre_auditoria()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.estado_ciclo = 'Cerrada' THEN
        IF NEW.fecha_cierre_auditoria IS NULL THEN
            RAISE EXCEPTION 'Compuerta Resultado: Debe registrar la Fecha de Cierre de Auditoría antes de marcarla como Cerrada.'
                USING ERRCODE = 'P0001';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.auditoria_fecha af
            WHERE af.id_auditoria = NEW.id
              AND af.tipo_fecha = 'REAL'
              AND af.deleted_at IS NULL
        ) THEN
            RAISE EXCEPTION 'Compuerta Resultado: Debe registrar al menos una fecha REAL de ejecución antes de cerrar la auditoría.'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_cierre_auditoria ON public.auditoria;
CREATE TRIGGER trg_validar_cierre_auditoria
    BEFORE INSERT OR UPDATE OF estado_ciclo, fecha_cierre_auditoria ON public.auditoria
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_cierre_auditoria();
```

### 3.2 `public/supabase/queries/03_indices_optimizacion.sql`
```sql
CREATE INDEX IF NOT EXISTS idx_hallazgo_auditoria_nc_vencimientos
    ON public.hallazgo (id_auditoria, tipo, cerrado, fecha_limite_cierre) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_auditoria_cierre_estado
    ON public.auditoria (estado_ciclo, fecha_cierre_auditoria) WHERE deleted_at IS NULL;
```

### 3.3 `public/supabase/queries/04_rls.sql`
* Las políticas actuales de `auditoria_fecha`, `hallazgo`, `configuracion_alerta_auditoria` y `auditoria` ya cubren la lectura por `CLIENT` (`has_client_org_access`), inserción/actualización de hallazgos por `AUDITOR` asignado (`is_assigned_auditor`) y gestión completa por `ADMIN`/`WORKER`.
* Añadir validación/política o check en `auditoria_update_worker`: solo `ADMIN`/`WORKER` pueden transicionar `estado_ciclo = 'Cerrada'` y modificar `fecha_cierre_auditoria`.

### 3.4 `public/supabase/queries/06_datos_prueba.sql`
* Añadir 1 auditoría histórica con `tipo_fecha = 'REAL'`, `hallazgo` (`NC_MENOR` y `NC_MAYOR` con `fecha_limite_plan` y `fecha_limite_cierre`), `estado_ciclo = 'Cerrada'` y `fecha_cierre_auditoria`, lista para probar inmediatamente `Revisión` (Paso 11) tras `reset-db`.

---

## 4. Lógica Pura & 5. Orquestación UI
*(Implementadas en Step 10.2.)*

---

## 6. Matriz RBAC del Paso 10.1

| Rol | Registra Fechas `REAL` | Crea/Actualiza `hallazgo` | Cierra Auditoría (`'Cerrada'` + `fecha_cierre_auditoria`) | Edita Offsets Config |
| :--- | :--- | :--- | :--- | :--- |
| **`ADMIN`** | Sí | Sí | Sí | Sí |
| **`WORKER`** | Sí | Sí | Sí | Sí |
| **`AUDITOR`** | Solo lectura | Sí (solo asignadas, sin archivar) | No (propone resultados; cierra staff) | No |
| **`CLIENT`** | Solo lectura | Solo lectura + seguimiento plan | No | No |

---

## 7. Pruebas SQL
* Insertar hallazgo `NC_MAYOR` en una auditoría con fecha `REAL` = `2026-06-10..2026-06-12` → verificar `fecha_limite_plan = '2026-06-27'` (`+15d`) y `fecha_limite_cierre = '2026-08-11'` (`+60d`).
* Intentar `UPDATE auditoria SET estado_ciclo = 'Cerrada'` sin `fecha_cierre_auditoria` o sin fecha `REAL` → bloqueado por `fn_validar_cierre_auditoria`.

---

## 8. Criterios de Aceptación (Done Criteria)
- [ ] `auditoria.estado_ciclo` incluye `'Cerrada'` y `fecha_cierre_auditoria`.
- [ ] `configuracion_alerta_auditoria` expone `dias_limite_plan_accion` (`15`) y `dias_limite_cierre_nc` (`60`).
- [ ] `hallazgo` almacena `id_sitio`, `fecha_limite_plan`, `fecha_entrega_plan`, `fecha_limite_cierre`, `fecha_cierre_real` con cálculo automático en trigger.
