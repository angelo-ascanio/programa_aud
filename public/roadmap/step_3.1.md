# Step 3.1: `Designación → Tipo` — BD Multi-Fecha (`PREPROGRAMADA_MES`, `PROGRAMADA_EXACTA`, `REAL`), Reprogramaciones 1:N y Ciclo por Vínculo

## 1. Identificador, Nombre y Dependencias
* **Step ID:** `3.1`
* **Nombre Corto (UI):** `Tipo` (bajo `Designación` en Bloque 1 `Auditoría`)
* **Bloque / Sub-sección:** Bloque 1 — `Auditoría` → `Designación` → `Tipo`
* **Dependencias:** `step_2.1.md` (`vinculo`, `vinculo_certificado`, `programa_auditoria.id_vinculo`)

---

## 2. Alcance Exacto y Reglas de Negocio
1. **Separación Estricta de Precisión Temporal en `public.auditoria_fecha`:**
   * Actualmente `check_auditoria_fecha_tipo` solo permite `('PREPROGRAMADA_MES', 'REAL')`, usando `'REAL'` tanto para fechas exactas programadas como para fechas reales ejecutadas.
   * Nueva enumeración estricta:
     * **`PREPROGRAMADA_MES`** *(Paso 3 — Mes + Año estimado; `anio`, `mes` NOT NULL; `fecha_inicio`, `fecha_fin` NULL)*.
     * **`PROGRAMADA_EXACTA`** *(Paso 3 — Fecha exacta o rango programado/reprogramado; `fecha_inicio`, `fecha_fin` NOT NULL; `fecha_fin >= fecha_inicio`)*.
     * **`REAL`** *(Paso 10 `Resultado` — Fechas reales en las que se ejecutó la auditoría; `fecha_inicio`, `fecha_fin` NOT NULL; `fecha_fin >= fecha_inicio`)*.
2. **Migración / Backfill Seguro:**
   * Todo registro activo actual en `auditoria_fecha` con `tipo_fecha = 'REAL'` cuya auditoría padre esté en `estado_ciclo NOT IN ('Auditada', 'Cerrada')` se migra a `'PROGRAMADA_EXACTA'` antes de aplicar el nuevo constraint `CHECK`. Las auditorías ya `'Auditada'` / `'Cerrada'` conservan su `'REAL'` (o se duplica la fecha programada si se desea preservar historial).
3. **Historial Cronológico Ilimitado de Reprogramaciones (`numero_secuencia = 1..N`):**
   * `numero_secuencia = 1` con `tag = 'Programación'`.
   * Cada reprogramación inserta `numero_secuencia = MAX(activas) + 1` con `tag = 'Reprogramación'`, `tipo_fecha IN ('PREPROGRAMADA_MES', 'PROGRAMADA_EXACTA')` y `observacion`.
   * La fecha programada vigente es siempre la fila de planificación (`tipo_fecha IN ('PREPROGRAMADA_MES', 'PROGRAMADA_EXACTA')` y `deleted_at IS NULL`) con mayor `numero_secuencia`.
4. **Creación de Ciclos por `Vínculo` (Campañas Multi-Anuales):**
   * Al crear una campaña (`programa_auditoria`) en el Paso 3 a partir de un `vinculo` (`INDIVIDUAL` o `VINCULADO`), se crea automáticamente 1 registro `auditoria` por cada certificado activo del vínculo, permitiendo programar 3–5 años en avance (e.g. Ciclo 2026, Ciclo 2027, Ciclo 2028) con su `id_tipo_auditoria` específico por certificado y su fecha inicial en `auditoria_fecha`.
5. **Compuerta Paso 3:** Una auditoría cumple Paso 3 (`step3Ok`) cuando `id_tipo_auditoria IS NOT NULL` y posee al menos una fila activa en `auditoria_fecha` de tipo `PREPROGRAMADA_MES` o `PROGRAMADA_EXACTA`.

---

## 3. Cambios Exactos en Base de Datos (`01`, `03`, `06`)

### 3.1 `public/supabase/queries/01_creacion.sql`
```sql
-- 1. Migración previa en auditoria_fecha para separar PROGRAMADA_EXACTA vs REAL
UPDATE public.auditoria_fecha af
SET tipo_fecha = 'PROGRAMADA_EXACTA'
FROM public.auditoria a
WHERE a.id = af.id_auditoria
  AND af.tipo_fecha = 'REAL'
  AND a.estado_ciclo NOT IN ('Auditada', 'Cerrada');

-- 2. Actualizar CHECK constraints en auditoria_fecha
ALTER TABLE public.auditoria_fecha
    DROP CONSTRAINT IF EXISTS check_auditoria_fecha_tipo;
ALTER TABLE public.auditoria_fecha
    ADD CONSTRAINT check_auditoria_fecha_tipo
        CHECK (tipo_fecha IN ('PREPROGRAMADA_MES', 'PROGRAMADA_EXACTA', 'REAL'));

ALTER TABLE public.auditoria_fecha
    DROP CONSTRAINT IF EXISTS check_auditoria_fecha_payload;
ALTER TABLE public.auditoria_fecha
    ADD CONSTRAINT check_auditoria_fecha_payload CHECK (
        (
            tipo_fecha = 'PREPROGRAMADA_MES'
            AND anio IS NOT NULL
            AND mes IS NOT NULL
            AND fecha_inicio IS NULL
            AND fecha_fin IS NULL
        )
        OR (
            tipo_fecha IN ('PROGRAMADA_EXACTA', 'REAL')
            AND fecha_inicio IS NOT NULL
            AND fecha_fin IS NOT NULL
            AND fecha_fin >= fecha_inicio
        )
    );

-- 3. Trigger: Validar que REAL solo se inserte si la auditoría ya completó Paso 3 + Paso 4 (o al registrar resultados)
-- y garantizar secuencia estrictamente creciente para planificación vs real
CREATE OR REPLACE FUNCTION public.fn_validar_auditoria_fecha_secuencia()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_aud_deleted TIMESTAMPTZ;
    v_has_plan BOOLEAN;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.numero_secuencia IS NULL OR NEW.numero_secuencia < 1 THEN
        RAISE EXCEPTION 'Violación de Secuencia Multi-Fecha: numero_secuencia debe ser mayor o igual a 1.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT a.deleted_at INTO v_aud_deleted
    FROM public.auditoria a
    WHERE a.id = NEW.id_auditoria;

    IF NOT FOUND OR v_aud_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: la auditoría no existe o está archivada.'
            USING ERRCODE = 'P0001';
    END IF;

    IF NEW.tipo_fecha = 'REAL' THEN
        SELECT EXISTS (
            SELECT 1 FROM public.sitios_por_auditoria sa
            WHERE sa.id_auditoria = NEW.id_auditoria AND sa.deleted_at IS NULL
        ) INTO v_has_plan;

        IF NOT v_has_plan THEN
            RAISE EXCEPTION 'No se pueden registrar fechas REALES de ejecución sin haber designado al menos un sitio en Paso 4 (Sitio).'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;
```

### 3.2 `public/supabase/queries/03_indices_optimizacion.sql`
```sql
DROP INDEX IF EXISTS public.idx_auditoria_fecha_rango_real;
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha_rango_plan_y_real
    ON public.auditoria_fecha (fecha_inicio, fecha_fin)
    WHERE tipo_fecha IN ('PROGRAMADA_EXACTA', 'REAL') AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_auditoria_fecha_tipo_seq
    ON public.auditoria_fecha (id_auditoria, tipo_fecha, numero_secuencia DESC)
    WHERE deleted_at IS NULL;
```

### 3.3 `public/supabase/queries/06_datos_prueba.sql`
Ajustar filas semilla de `auditoria_fecha`:
* Auditorías pendientes de ejecución (`Programada`, `En Programación`, `Reprogramada`): usar `tipo_fecha = 'PROGRAMADA_EXACTA'` o `'PREPROGRAMADA_MES'`.
* Añadir al menos 2 ciclos futuros preprogramados (`Año +1` y `Año +2` en `PREPROGRAMADA_MES`) y 1 auditoría próxima (`<= 25 días`) para validar ordenamiento y filtro `"Próximas a ejecutar"` en Step 3.3.
* Auditorías históricas ya `'Auditada'` mantienen una fila `'PROGRAMADA_EXACTA'` (`seq 1`) + una fila `'REAL'` (`seq 2`).

---

## 4. Lógica Pura
*(Implementada en Step 3.2.)*

---

## 5. Orquestación UI y Estado
*(Implementada en Step 3.3.)*

---

## 6. Matriz RBAC del Paso 3.1

| Rol | `SELECT auditoria_fecha` | `INSERT / UPDATE` (`PREPROGRAMADA_MES` / `PROGRAMADA_EXACTA`) | `archive_record` |
| :--- | :--- | :--- | :--- |
| **`ADMIN`** | Todas (incluye archivadas) | Permitido | Permitido + Restaurar |
| **`WORKER`** | Todas activas | Permitido | Permitido |
| **`AUDITOR`** | Solo auditorías asignadas | Bloqueado | Bloqueado |
| **`CLIENT`** | Solo sus organizaciones | Bloqueado | Bloqueado |

---

## 7. Pruebas SQL
* `INSERT INTO auditoria_fecha (..., tipo_fecha='PROGRAMADA_EXACTA', fecha_inicio='2026-10-05', fecha_fin='2026-10-07')` → exitoso.
* `INSERT INTO auditoria_fecha (..., tipo_fecha='PREPROGRAMADA_MES', anio=2028, mes=6, fecha_inicio='2028-06-01')` → rechazado por `check_auditoria_fecha_payload`.
* Verificar en semillas tras `reset-db` que existen filas `PREPROGRAMADA_MES` futuras y `PROGRAMADA_EXACTA` vigentes.

---

## 8. Criterios de Aceptación (Done Criteria)
- [ ] `auditoria_fecha` soporta los 3 valores `'PREPROGRAMADA_MES'`, `'PROGRAMADA_EXACTA'`, `'REAL'` con constraints estrictos.
- [ ] Backfill seguro reclasifica fechas planificadas heredadas de `'REAL'` a `'PROGRAMADA_EXACTA'`.
- [ ] Semillas `06_datos_prueba.sql` incluyen campañas multi-año futuras e inminentes listas para validar Paso 3.2/3.3.
