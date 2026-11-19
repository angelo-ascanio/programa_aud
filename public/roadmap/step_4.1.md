# Step 4.1: `Designación → Sitio` — BD, Pre-selección `Sitio 0 (HQ)` y Override `tiene_sitio_temporal` por Auditoría

## 1. Identificador, Nombre y Dependencias
* **Step ID:** `4.1`
* **Nombre Corto (UI):** `Sitio` (bajo `Designación`)
* **Bloque / Sub-sección:** Bloque 1 — `Auditoría` → `Designación` → `Sitio`
* **Dependencias:** `step_3.1.md`, `step_2.1.md`

---

## 2. Alcance Exacto y Reglas de Negocio
1. **Paralelismo Completo con Paso 3 (`Tipo`):** Una vez que el certificado está en un `vínculo` (`INDIVIDUAL` o `VINCULADO`) y tiene fila en `auditoria`, la selección de sitios (`sitios_por_auditoria`) puede completarse antes, durante o después de asignar fechas/tipos en `Tipo` (Paso 3).
2. **Pre-selección Automática de Sede Principal (`numero_sitio = 0`):**
   * Al crear una `auditoria` (o mediante trigger/RPC `fn_auto_asignar_sitio_principal_auditoria`), si el certificado posee un `sitio` activo con `numero_sitio = 0`, se inserta automáticamente la fila correspondiente en `sitios_por_auditoria` con `tiempo_auditoria = 0` (pendiente del Paso 6 `Tiempo`) y `modalidad_evaluacion = 'Presencial'`.
   * En UI también puede desmarcarse si se sustituye explícitamente por otro sitio, manteniendo la regla invariante de que toda auditoría requiere **al menos 1 sitio activo** (`step4Ok`) para desbloquear `Tiempo` (Paso 6), `Asignación` (Paso 7) y `Programa` (Paso 8).
3. **Herencia + Override de `tiene_sitio_temporal` por Auditoría:**
   * Valor por defecto al insertar `auditoria`: heredado desde `vinculo.tiene_sitio_temporal` / `programa_auditoria.tiene_sitio_temporal`.
   * En Paso 4 (`Sitio`), el usuario puede **activar o desactivar** `auditoria.tiene_sitio_temporal` específicamente para una auditoría concreta (ej. el vínculo tiene sitio temporal en 2026 pero no en 2027).
   * **Guardia de Integridad al Desactivar:** Si el usuario apaga `tiene_sitio_temporal = FALSE` en una auditoría que ya tenía registros activos en `auditoria_sitio_temporal`, el trigger/validación bloquea apagarlo hasta que esos sitios temporales sean archivados, o advierte explícitamente.
4. **Coherencia de Sitio ↔ Certificado:** Conserva `fn_validar_sitio_auditoria_certificado` verificando que `sitio.id_certificado = auditoria.id_certificado` y ambos estén activos (`deleted_at IS NULL`).

---

## 3. Cambios Exactos en Base de Datos (`01_creacion.sql` y `04_rls.sql`)

### 3.1 `public/supabase/queries/01_creacion.sql`
```sql
-- Trigger AFTER INSERT ON auditoria: pre-seleccionar Sitio 0 (Sede Principal HQ) si existe y es único
CREATE OR REPLACE FUNCTION public.fn_auto_asignar_sitio_principal_auditoria()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_sitio_hq_id UUID;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT s.id INTO v_sitio_hq_id
    FROM public.sitio s
    WHERE s.id_certificado = NEW.id_certificado
      AND s.numero_sitio = 0
      AND s.deleted_at IS NULL
    LIMIT 1;

    IF v_sitio_hq_id IS NOT NULL THEN
        INSERT INTO public.sitios_por_auditoria (
            id_auditoria,
            id_sitio,
            tiempo_auditoria,
            modalidad_evaluacion
        )
        SELECT NEW.id, v_sitio_hq_id, 0, 'Presencial'
        WHERE NOT EXISTS (
            SELECT 1 FROM public.sitios_por_auditoria sa
            WHERE sa.id_auditoria = NEW.id
              AND sa.id_sitio = v_sitio_hq_id
              AND sa.deleted_at IS NULL
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_asignar_sitio_principal_auditoria ON public.auditoria;
CREATE TRIGGER trg_auto_asignar_sitio_principal_auditoria
    AFTER INSERT ON public.auditoria
    FOR EACH ROW EXECUTE FUNCTION public.fn_auto_asignar_sitio_principal_auditoria();

-- Actualizar fn_validar_sitio_auditoria_certificado para exigir registros no archivados
CREATE OR REPLACE FUNCTION public.fn_validar_sitio_auditoria_certificado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cert_auditoria UUID;
    v_aud_deleted TIMESTAMPTZ;
    v_cert_sitio UUID;
    v_sitio_deleted TIMESTAMPTZ;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT id_certificado, deleted_at
      INTO v_cert_auditoria, v_aud_deleted
    FROM public.auditoria
    WHERE id = NEW.id_auditoria;

    SELECT id_certificado, deleted_at
      INTO v_cert_sitio, v_sitio_deleted
    FROM public.sitio
    WHERE id = NEW.id_sitio;

    IF v_cert_auditoria IS NULL OR v_aud_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: la auditoría no existe o está archivada.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_cert_sitio IS NULL OR v_sitio_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el sitio maestro no existe o está archivado.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_cert_auditoria IS DISTINCT FROM v_cert_sitio THEN
        RAISE EXCEPTION 'Violación ISO/IEC 17021-1: el sitio seleccionado pertenece a otro certificado.'
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

-- Guardia al desactivar tiene_sitio_temporal en auditoria cuando ya existen temporales activos
-- (El chequeo contra auditoria_sitio_temporal se activa en el Step 5.1 cuando la tabla existe,
-- pero aquí se prepara la función hook o validación de estado.)
```

### 3.2 `public/supabase/queries/04_rls.sql`
Verificar políticas ya activas de `sitios_por_auditoria`:
* `ADMIN`/`WORKER`: lectura e inserción/actualización de sitios por auditoría (`archive_record('sitios_por_auditoria', ...)` permitido cuando no tenga `procesos_sitio_auditoria` o `equipo_auditor_sitio` activos).
* `AUDITOR`: solo lee sitios de auditorías asignadas (`is_assigned_auditor`).
* `CLIENT`: solo lee sitios de certificados de `has_client_org_access`.

---

## 4. Lógica Pura
*(Implementada en Step 4.2.)*

---

## 5. Orquestación UI y Estado
*(Implementada en Step 4.3.)*

---

## 6. Matriz RBAC del Paso 4.1

| Rol | `SELECT sitios_por_auditoria` | Insertar/Archivar Sitios & Toggle Temporal |
| :--- | :--- | :--- |
| **`ADMIN`** | Todos (incluye archivados) | Permitido |
| **`WORKER`** | Todos activos | Permitido |
| **`AUDITOR`** | Solo auditorías asignadas | Bloqueado |
| **`CLIENT`** | Solo certificados de sus organizaciones | Bloqueado |

---

## 7. Pruebas SQL
* Insertar una nueva `auditoria` para un certificado con `Sitio 0` activo → verificar que `sitios_por_auditoria` contiene automáticamente `Sitio 0` con `tiempo_auditoria = 0`.
* Intentar insertar `sitios_por_auditoria` con un `id_sitio` de otro certificado → rechazado sin UUIDs visibles en UI (`translateDatabaseError`).

---

## 8. Criterios de Aceptación (Done Criteria)
- [ ] Trigger `trg_auto_asignar_sitio_principal_auditoria` pre-selecciona `Sitio 0 (HQ)`.
- [ ] `fn_validar_sitio_auditoria_certificado` verifica `deleted_at IS NULL` en ambos lados sin exponer UUIDs en errores de UI.
- [ ] `auditoria.tiene_sitio_temporal` persistente y editable por auditoría.
