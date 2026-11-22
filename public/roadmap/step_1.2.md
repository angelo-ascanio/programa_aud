# Step 1.2 — Base de Datos: Compartición de `Proceso`, `requisitos_por_proceso` por Certificado y Cobertura Normativa LTREE

## 1. Objetivo y Alcance Estricto
Implementar la arquitectura relacional para compartir **`Proceso` (`public.proceso`)** dentro de un mismo **Conglomerado** sin mezclar jamás cláusulas normativas (`requisito`) entre certificados de normas distintas ni sobrescribir exclusiones ISO 4.3 entre certificados hermanos.

**Límites estrictos:**
- **NO** modificar aún `sitio`, `procesos_por_sitio` ni políticas RLS de `04_rls.sql` (corresponden al Step 1.3), excepto asegurar que las columnas/triggers nuevos en `01` y `02` no rompan la ejecución completa `00`–`07`.
- **NO** implementar todavía motores TypeScript en `src/` (Bloque 2).

---

## 2. Archivos Afectados
- `public/supabase/queries/01_creacion.sql`
- `public/supabase/queries/02_cobertura_normativa.sql`
- `public/supabase/queries/03_indices_optimizacion.sql`
- `public/supabase/queries/06_datos_prueba.sql` *(solo si algún `INSERT INTO public.requisitos_por_proceso` en `06` requiere compatibilidad automática vía default trigger o columna explícita)*

---

## 3. Decisiones Técnicas Detalladas

### 3.1 Nueva Tabla Puente `public.proceso_certificado_compartido` (`01_creacion.sql`)
- Columnas:
  - `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
  - `id_proceso UUID NOT NULL REFERENCES public.proceso(id) ON DELETE RESTRICT`
  - `id_certificado UUID NOT NULL REFERENCES public.certificado(id) ON DELETE RESTRICT` *(certificado destino)*
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  - `deleted_at TIMESTAMPTZ DEFAULT NULL`
  - `deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL`
- Función helper:
  - `public.proceso_pertenece_a_certificado(p_id_proceso UUID, p_id_certificado UUID) RETURNS BOOLEAN`: `TRUE` si `proceso` está activo (`deleted_at IS NULL`) y (`p.id_certificado = p_id_certificado` OR existe fila activa en `proceso_certificado_compartido`).
- Trigger `fn_validar_proceso_compartido()`:
  - Verifica que `proceso` y `certificado` destino existan y `deleted_at IS NULL`.
  - Bloquea auto-compartición (`NEW.id_certificado = v_proceso_owner_cert_id`).
  - Valida mismo `id_grupo_empresarial` activo entre organización del proceso origen y organización del certificado destino (`ERRCODE = 'P0001'`).
  - Valida que no exista otro proceso activo en `NEW.id_certificado` (propio o ya compartido) con el mismo `LOWER(TRIM(nombre_proceso))`.
- Triggers estándar: `fn_sync_soft_delete_child_metadata`, `fn_prevent_hard_delete`, `audit_trigger_func`.

### 3.2 Evolución de `public.requisitos_por_proceso` con Alcance por Certificado (`01_creacion.sql`)
1. Añadir columna **`id_certificado UUID REFERENCES public.certificado(id) ON DELETE CASCADE`** a `public.requisitos_por_proceso` de forma idempotente:
   - En `CREATE TABLE IF NOT EXISTS` y bloque `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
   - Backfill idempotente para filas existentes: `UPDATE public.requisitos_por_proceso rpp SET id_certificado = p.id_certificado FROM public.proceso p WHERE rpp.id_proceso = p.id AND rpp.id_certificado IS NULL;`.
   - Aplicar `ALTER COLUMN id_certificado SET NOT NULL`.
2. Actualizar clave primaria de `(id_proceso, id_requisito)` a **`PRIMARY KEY (id_proceso, id_certificado, id_requisito)`** (dropeando la PK previa si no incluye `id_certificado` e instalando la nueva PK compuesta).
   - Esto permite que un mismo `id_proceso` mantenga simultáneamente sus cláusulas ISO 9001 ligadas a `(P, Cert_X, req_9001)` y sus cláusulas resueltas ISO 14001 ligadas a `(P, Cert_Y, req_14001)`, **sin mezclarse jamás**.
3. **Retrocompatibilidad de `INSERT` legado:**
   - En `fn_guard_req_proceso_against_exclusion()` (`BEFORE INSERT OR UPDATE` en `requisitos_por_proceso`), si `NEW.id_certificado IS NULL`, autocompletarlo desde `proceso.id_certificado`: `SELECT p.id_certificado INTO NEW.id_certificado FROM public.proceso p WHERE p.id = NEW.id_proceso`. Así, todos los `INSERT` existentes en `06_datos_prueba.sql` u otros scripts siguen funcionando sin fallar `NOT NULL` (evaluando en orden antes de la restricción o mediante trigger `BEFORE INSERT` dedicado de default si PostgreSQL evalúa `NOT NULL` tras `BEFORE` triggers).

### 3.3 Actualización de Triggers de Integridad Normativa y Smart Mutation (`01_creacion.sql`)
1. **`fn_guard_req_proceso_against_exclusion()`**:
   - Verificar que `proceso` (`NEW.id_proceso`) exista y `deleted_at IS NULL`.
   - Verificar que `NEW.id_certificado` exista, `deleted_at IS NULL`, y **`public.proceso_pertenece_a_certificado(NEW.id_proceso, NEW.id_certificado) = TRUE`** (rechazar si el proceso no pertenece ni está compartido activamente con ese certificado).
   - Obtener `v_cert_norma` desde `certificado WHERE id = NEW.id_certificado`.
   - Verificar que `requisito` (`NEW.id_requisito`) pertenezca estrictamente a **`v_cert_norma`** (`v_req_norma IS NOT DISTINCT FROM v_cert_norma`), bloqueando de raíz la inserción de cláusulas de ISO 9001 bajo un certificado ISO 14001 o viceversa.
   - Verificar exclusiones ISO 4.3 (`requisitos_no_aplicables_certificado`) específicamente para `rna.id_certificado = NEW.id_certificado` usando LTREE `<@`, manteniendo el código `REQ_EXCLUDED_BY_ISO43`.

2. **`fn_smart_prune_process_clauses_on_exclusion()`**:
   - Al declarar/restaurar una exclusión ISO 4.3 en `requisitos_no_aplicables_certificado` para `NEW.id_certificado`:
   - Podar (`DELETE FROM public.requisitos_por_proceso rpp`) **únicamente** donde **`rpp.id_certificado = NEW.id_certificado`** (usando `public.proceso_pertenece_a_certificado(rpp.id_proceso, NEW.id_certificado)` o directamente `rpp.id_certificado = NEW.id_certificado`), de modo que excluir `8.3` en Certificado "Z" jamás pode `8.3` de Certificado "X".

### 3.4 Actualización de Cobertura Normativa LTREE (`02_cobertura_normativa.sql`)
Actualizar **`public.evaluar_cobertura_certificado(p_id_certificado UUID)`**:
- En CTE `ProcessDir`:
  ```sql
  SELECT DISTINCT req.id, req.codigo, req.ruta_materializada
  FROM public.requisitos_por_proceso rpp
  INNER JOIN public.proceso p ON p.id = rpp.id_proceso
  INNER JOIN public.requisito req ON req.id = rpp.id_requisito
  INNER JOIN CertNorma cn ON req.id_norma = cn.id_norma
  WHERE rpp.id_certificado = p_id_certificado
    AND public.proceso_pertenece_a_certificado(p.id, p_id_certificado)
    AND p.deleted_at IS NULL
    AND req.deleted_at IS NULL
  ```
- De este modo, `evaluar_cobertura_certificado` y `resumen_cobertura_certificado` calculan automáticamente la cobertura del certificado destino incluyendo sus procesos compartidos según las cláusulas resueltas para ese certificado y esa norma.

### 3.5 Índices en `03_indices_optimizacion.sql`
- `CREATE UNIQUE INDEX IF NOT EXISTS uq_proceso_cert_compartido_active ON public.proceso_certificado_compartido (id_proceso, id_certificado) WHERE deleted_at IS NULL;`
- `CREATE INDEX IF NOT EXISTS idx_proceso_cert_compartido_cert ON public.proceso_certificado_compartido (id_certificado) WHERE deleted_at IS NULL;`
- Reemplazar/añadir índice lookup en `requisitos_por_proceso`:
  - `CREATE INDEX IF NOT EXISTS idx_req_proceso_cert_lookup ON public.requisitos_por_proceso (id_certificado, id_proceso, id_requisito);`

---

## 4. Criterios de Aceptación y Verificación
1. **Reset Idempotente Completo:** Ejecutar `00`–`07` sin errores; comprobar que todos los `requisitos_por_proceso` existentes tienen `id_certificado` poblado igual al de su `proceso` propietario y `PK = (id_proceso, id_certificado, id_requisito)`.
2. **Aislamiento de Normas y Cobertura:**
   - Compartir un `Proceso P` de Certificado X (ISO 9001) hacia Certificado Y (ISO 14001) en el mismo conglomerado.
   - Insertar `(P, Y, req_14001_4_4)` en `requisitos_por_proceso` → **ÉXITO**.
   - Intentar insertar `(P, Y, req_9001_8_3)` en `requisitos_por_proceso` → **RECHAZADO** por `fn_guard_req_proceso_against_exclusion` (`norma distinta`).
   - Ejecutar `evaluar_cobertura_certificado(X)` y `evaluar_cobertura_certificado(Y)`: X solo computa cláusulas 9001, Y solo computa cláusulas 14001.
3. **Smart Mutation Independiente:** Declarar exclusión ISO 4.3 de `8.3` en Certificado Z (ISO 9001, compartiendo `P` con X) → elimina `(P, Z, 8.3)` manteniendo intacto `(P, X, 8.3)`.
4. `npm run lint && npm test` en verde.
