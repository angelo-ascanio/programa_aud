# Step 1.1 — Capa SQL: Regla Binaria de Procesos Compartidos, Sincronización de Requisitos, RLS e Idempotencia

**Pilar:** 1 (Compartición Simplificada de Procesos y Requisitos)  
**Dependencias:** Ninguna (paso inicial)  
**Objetivo:** Evaluar y evolucionar de forma idempotente el esquema PostgreSQL/Supabase (`01_creacion.sql`, `03_indices_optimizacion.sql`, `04_rls.sql`, `06_datos_prueba.sql`) para soportar:
1. **Misma norma:** Compartición conjunta o separada de proceso + requisitos con **sincronización automática/bajo demanda** entre certificados vinculados de la misma norma (respetando exclusiones ISO 4.3 por certificado).
2. **Norma distinta:** Compartición estricta **solo del proceso** (proceso vacío en destino, `sincronizar_requisitos = FALSE`, requisitos 100% independientes por norma/certificado).

---

## 1. Archivos a Modificar

- `public/supabase/queries/01_creacion.sql`
- `public/supabase/queries/03_indices_optimizacion.sql`
- `public/supabase/queries/04_rls.sql` (auditoría de seguridad y permisos RPC)
- `public/supabase/queries/06_datos_prueba.sql` (Sección `-- 27.`)
- `src/lib/step101SqlSchema.test.ts` / `src/lib/phase11SqlMigration.test.ts` / `src/lib/phase12RlsHardening.test.ts` (según aserciones existentes de esquema/RLS)

---

## 2. Especificación Técnica Detallada

### 2.1 Evolución Idempotente de `public.proceso_certificado_compartido` (`01_creacion.sql`)
- Mantener la PK tripartita actual de `requisitos_por_proceso` (`PRIMARY KEY (id_proceso, id_certificado, id_requisito)`): **NO revertir** a `(id_proceso, id_requisito)`, ya que los procesos compartidos entre **normas distintas** necesitan almacenar conjuntos de cláusulas completamente independientes por `id_certificado`.
- Agregar columna booleana idempotente a `public.proceso_certificado_compartido`:
  ```sql
  ALTER TABLE public.proceso_certificado_compartido
      ADD COLUMN IF NOT EXISTS sincronizar_requisitos BOOLEAN NOT NULL DEFAULT FALSE;
  ```
- **Invariante de Integridad Normativa en `fn_validar_proceso_compartido()`:**
  - En el bloque `BEFORE INSERT OR UPDATE` de `trg_validar_proceso_compartido`, consultar `c_owner.id_norma` y `c_target.id_norma`.
  - Si `v_owner_norma IS DISTINCT FROM v_target_norma`:
    - Forzar `NEW.sincronizar_requisitos := FALSE;` (si el cliente intenta activar sincronización entre normas distintas, nunca se permite mezclar requisitos entre normas; alternativamente, si se exige validación estricta al actualizar a `TRUE`, lanzar `RAISE EXCEPTION 'Operación bloqueada: la sincronización de requisitos solo aplica entre certificados de la misma norma.' USING ERRCODE = 'P0001';` cuando `TG_OP = 'UPDATE' AND NEW.sincronizar_requisitos = TRUE`). Recomendación: lanzar error si se solicita explícitamente `sincronizar_requisitos = TRUE` con normas distintas, garantizando fail-closed Zero-UUID.
  - Actualizar el trigger para vigilar `BEFORE INSERT OR UPDATE OF id_proceso, id_certificado, sincronizar_requisitos, deleted_at`.

### 2.2 Función Auxiliar & RPC de Sincronización Bajo Demanda (`fn_sync_shared_process_requisitos`)
Crear la función `SECURITY DEFINER` (`SET search_path = public, pg_temp`) llamada `public.fn_sync_shared_process_requisitos`:
- **Parámetros:**
  - `p_id_proceso UUID`
  - `p_source_cert_id UUID`
  - `p_target_cert_id UUID DEFAULT NULL` (si es `NULL`, sincroniza hacia todos los certificados activos de la **misma norma** vinculados mediante `proceso_certificado_compartido` con `sincronizar_requisitos = TRUE`, incluyendo al propietario si el origen fue un receptor sincronizado).
  - `p_enable_sync BOOLEAN DEFAULT TRUE` (opcionalmente marca `sincronizar_requisitos = TRUE` en el enlace mismo-norma al compartir requisitos por separado).
- **Lógica Transaccional:**
  1. Validar rol staff (`public.is_approved_worker()`) y que tanto el proceso como `p_source_cert_id` estén activos y relacionados (`proceso_pertenece_a_certificado(p_id_proceso, p_source_cert_id)`).
  2. Obtener `v_source_norma` desde `public.certificado`.
  3. Determinar los certificados destino elegibles:
     - Mismo `id_norma = v_source_norma`
     - Activos (`deleted_at IS NULL`)
     - Vinculados al proceso (ya sea el `proceso.id_certificado` propietario o enlaces activos en `proceso_certificado_compartido`) donde `sincronizar_requisitos = TRUE` (o `p_target_cert_id` explícito cuando se invoca "Compartir requisitos" manualmente sobre un enlace ya existente de la misma norma; si `p_enable_sync = TRUE`, actualizar `sincronizar_requisitos = TRUE` en dicho enlace).
     - Si `p_target_cert_id` pertenece a **otra norma** (`id_norma <> v_source_norma`), abortar con excepción Zero-UUID (`'Operación bloqueada: no es posible sincronizar requisitos entre certificados de normas distintas.'`).
  4. Replicar el conjunto de requisitos de `(p_id_proceso, p_source_cert_id)` hacia cada certificado destino elegible:
     - Eliminar requisitos en `(p_id_proceso, target_cert_id)` que no existan en `(p_id_proceso, p_source_cert_id)`.
     - Insertar requisitos de `(p_id_proceso, p_source_cert_id)` en `(p_id_proceso, target_cert_id)` **filtrando** cualquier requisito bloqueado por `requisitos_no_aplicables_certificado` del `target_cert_id` (incluyendo descendientes LTREE `<@`), con `ON CONFLICT (id_proceso, id_certificado, id_requisito) DO NOTHING`.
  5. Retornar resumen JSONB (`synced_certs_count`, `inserted_count`, `deleted_count`, `skipped_excluded_count`) sin exponer UUIDs en textos de usuario.
- **Permisos:**
  - `REVOKE ALL ON FUNCTION public.fn_sync_shared_process_requisitos(...) FROM PUBLIC, anon;`
  - `GRANT EXECUTE ON FUNCTION public.fn_sync_shared_process_requisitos(...) TO authenticated;`

### 2.3 Trigger Automático de Reflejo en Tiempo Real (`trg_sync_req_proceso_same_norm`)
Para cumplir estrictamente con: *"si un proceso está compartido entre dos certificados, y compartimos el set de cláusulas, este cambio se refleja en ambos certificados"* al agregar o quitar cláusulas individuales/lote en `requisitos_por_proceso`:
- Crear trigger `AFTER INSERT OR DELETE ON public.requisitos_por_proceso FOR EACH ROW`:
  - **Guarda anti-recursión obligatoria:** `IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;`
  - Resolver `v_norma` del certificado afectado (`NEW.id_certificado` o `OLD.id_certificado`) y validar que el proceso sigue activo (`deleted_at IS NULL`).
  - Encontrar los certificados hermanos conectados al mismo `id_proceso` que:
    1. Tengan la **misma `id_norma`** (`c.id_norma = v_norma` y `c.deleted_at IS NULL`),
    2. Tengan un vínculo activo en `proceso_certificado_compartido` con `sincronizar_requisitos = TRUE` (si el cambio ocurre en el propietario -> propagar a todos los receptores con `sincronizar_requisitos = TRUE`; si el cambio ocurre en un receptor con `sincronizar_requisitos = TRUE` -> propagar al propietario y demás receptores con `sincronizar_requisitos = TRUE`).
  - En `INSERT`: insertar `(NEW.id_proceso, sibling_cert_id, NEW.id_requisito)` **solo si** la cláusula no está excluida por ISO 4.3 (`requisitos_no_aplicables_certificado` + `<@`) en `sibling_cert_id`, usando `ON CONFLICT DO NOTHING`.
  - En `DELETE`: eliminar `(OLD.id_proceso, sibling_cert_id, OLD.id_requisito)` en cada `sibling_cert_id` sincronizado.

### 2.4 Índices (`03_indices_optimizacion.sql`)
- Añadir índice parcial de soporte para búsquedas rápidas de sincronización por proceso:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_proceso_cert_compartido_sync_active
      ON public.proceso_certificado_compartido (id_proceso, id_certificado)
      WHERE deleted_at IS NULL AND sincronizar_requisitos = TRUE;
  ```
- Verificar que `idx_req_proceso_proc_cert` o índice equivalente sobre `requisitos_por_proceso (id_proceso, id_certificado)` exista para acelerar eliminaciones/sincronizaciones por par `(proceso, certificado)`.

### 2.5 RLS & Seguridad (`04_rls.sql`)
- Confirmar que `proceso_cert_compartido_select`, `proceso_cert_compartido_insert_worker`, `proceso_cert_compartido_update_worker` y `req_proceso_*` mantienen:
  - `CLIENT`: `SELECT` estricto Nivel 2 por `id_certificado` autorizado; cero permisos de escritura/RPC.
  - `AUDITOR`: `SELECT` estricto por auditorías asignadas; cero permisos de escritura/RPC.
  - `WORKER`/`ADMIN`: únicas identidades habilitadas para mutar `proceso_certificado_compartido`, `requisitos_por_proceso` y ejecutar `fn_sync_shared_process_requisitos`.

### 2.6 Datos de Prueba (`06_datos_prueba.sql` Sección `-- 27.`)
- Verificar los registros sembrados de `proceso_certificado_compartido` en `CONG-IND-01`:
  - Cuando origen y destino compartan la **misma norma** (por ejemplo, ISO 9001 ↔ ISO 9001 entre organizaciones hermanas de `CONG-IND-01`), establecer `sincronizar_requisitos = TRUE` y sembrar las filas alineadas de `requisitos_por_proceso` en ambos certificados.
  - Cuando origen y destino tengan **norma distinta** (ISO 9001 ↔ ISO 14001), mantener `sincronizar_requisitos = FALSE` y dejar el proceso en destino **vacío** (o con cláusulas explícitamente independientes si se prueba independencia).

---

## 3. Checklist de Implementación

1. [ ] Agregar columna `sincronizar_requisitos` (idempotente `ADD COLUMN IF NOT EXISTS`) en `01_creacion.sql` (definición de tabla + sección de evolución idempotente).
2. [ ] Actualizar `fn_validar_proceso_compartido()` y su trigger en `01_creacion.sql` para rechazar `sincronizar_requisitos = TRUE` cuando `id_norma` difiere entre certificado origen y destino.
3. [ ] Implementar `fn_sync_shared_process_requisitos(...)` y `fn_sync_req_proceso_same_norm()` / `trg_sync_req_proceso_same_norm` con `pg_trigger_depth() <= 1` y filtro ISO 4.3 en `01_creacion.sql`.
4. [ ] Añadir `idx_proceso_cert_compartido_sync_active` en `03_indices_optimizacion.sql`.
5. [ ] Revisar `04_rls.sql` y permisos `REVOKE/GRANT` sobre la nueva función RPC.
6. [ ] Actualizar sección `-- 27.` de `06_datos_prueba.sql` de forma idempotente (`ON CONFLICT DO NOTHING` / `UPDATE`).
7. [ ] Actualizar/añadir aserciones estáticas SQL en `src/lib/step101SqlSchema.test.ts`, `phase11SqlMigration.test.ts` y `phase12RlsHardening.test.ts`.

---

## 4. Criterios de Verificación y Aceptación

- **Ejecución automatizada:** `npx tsx --test src/lib/step101SqlSchema.test.ts src/lib/phase11SqlMigration.test.ts src/lib/phase12RlsHardening.test.ts` pasa al 100%.
- **Invariantes SQL:**
  - `01_creacion.sql`, `03_indices_optimizacion.sql`, `04_rls.sql` y `06_datos_prueba.sql` mantienen idempotencia total (doble ejecución sin errores).
  - Misma norma con `sincronizar_requisitos = TRUE`: insertar/eliminar una cláusula en `C1` refleja el cambio en `C2` salvo si `C2` la excluyó en `requisitos_no_aplicables_certificado`.
  - Norma distinta: `sincronizar_requisitos = TRUE` falla en SQL; compartir proceso deja `0` requisitos en destino; editar cláusulas en `C1` nunca afecta a `C2`.
  - Ninguna cadena de error SQL expone UUIDs.
