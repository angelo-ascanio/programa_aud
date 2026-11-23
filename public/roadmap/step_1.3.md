# Step 1.3 — Capa SQL: RPCs de Clonación, Migración, Compartición/Reemplazo de `Alcance`, Semillas `06_datos_prueba.sql` y Tests SQL

## Objetivo del Paso
Implementar las RPCs transaccionales atómicas para el versionado de certificados (**Paso 1:** `fn_clonar_version_certificado` clonando estructura **sin `fecha_certificado`** ni `alcance`; **Paso 2:** `fn_migrar_auditorias_version_certificado`) y para la compartición con reemplazo explícito de alcance (**`fn_compartir_alcance_con_resolucion`**), migrar las semillas de `public/supabase/queries/06_datos_prueba.sql` hacia `public.alcance` + versionado en `CONG-IND-01` (incluyendo un certificado demostrativo sin alcance y sin auditorías), y sincronizar los tests estáticos SQL.

---

## Archivos a Crear / Modificar
- `public/supabase/queries/01_creacion.sql`
- `public/supabase/queries/04_rls.sql`
- `public/supabase/queries/06_datos_prueba.sql`
- `src/lib/phase11SqlMigration.test.ts`
- `src/lib/phase12RlsHardening.test.ts`
- `src/lib/step101SqlSchema.test.ts`

---

## Especificación Técnica Detallada

### 1. RPC Paso 1 — `public.fn_clonar_version_certificado` (`01_creacion.sql`)
Firma (sin parámetro `p_alcance`):
```sql
CREATE OR REPLACE FUNCTION public.fn_clonar_version_certificado(
  p_id_certificado UUID,
  p_id_estatus UUID DEFAULT NULL,
  p_id_sector_iaf UUID DEFAULT NULL,
  p_id_subsector_iaf UUID DEFAULT NULL,
  p_multisitio BOOLEAN DEFAULT NULL,
  p_id_organizacion_version UUID DEFAULT NULL,
  p_notas_version TEXT DEFAULT NULL
) RETURNS JSONB
```
(`SECURITY DEFINER`, `SET search_path = public, pg_temp`):
1. Exigir `public.is_approved_worker()`; bloquear versión activa `v_source` (`FOR UPDATE`).
2. Desactivar `v_source` (`es_version_actual = FALSE`) e insertar `v_new_version_id` (`version_numero = max + 1`, `es_version_actual = TRUE`).
3. Clonar estructura hacia `v_new_version_id` con mapas temporales `old_id -> new_id`:
   - `sitio`, `turnos_por_sitio`, `proceso`, comparticiones aplicables en el conglomerado (`turno_certificado_compartido`, `sitio_certificado_compartido`, `proceso_certificado_compartido`, `contacto_certificado_compartido`), `procesos_por_sitio`, `requisitos_no_aplicables_certificado` (antes que `requisitos_por_proceso`), `requisitos_por_proceso`, y `contacto_certificado` (+ teléfonos y correos).
4. **Prohibiciones explícitas:**
   - **NO clonar `fecha_certificado`** (permanecen únicamente en `v_source`).
   - **NO clonar ni modificar `alcance`** (permanece a nivel de contenedor `certificado`).
5. Registrar en `audit_log` y retornar JSONB `{ new_version_id, source_version_id, version_numero, sitio_map, proceso_map, cloned_counts }`.

### 2. RPC Paso 2 — `public.fn_migrar_auditorias_version_certificado` (`01_creacion.sql`)
- Firma y comportamiento atómico: mantiene las auditorías no incluidas en `p_audit_ids_migrar` en `p_source_version_id` y migra cada auditoría seleccionada hacia `p_target_version_id` remapeando `sitios_por_auditoria.id_sitio`, `procesos_sitio_auditoria.id_proceso` + `id_procesos_por_sitio`, `turnos_sitio_auditoria.id_turnos_por_sitio` y `hallazgo` (`id_sitio`, `id_proceso`), conservando `auditoria_fecha`, equipos, comentarios y sitios temporales sin modificaciones.

### 3. RPC de Compartición y Reemplazo de `Alcance` — `public.fn_compartir_alcance_con_resolucion` (`01_creacion.sql`)
Firma:
```sql
CREATE OR REPLACE FUNCTION public.fn_compartir_alcance_con_resolucion(
  p_id_alcance UUID,
  p_target_cert_ids UUID[],
  p_reemplazar_existentes BOOLEAN DEFAULT FALSE
) RETURNS JSONB
```
(`SECURITY DEFINER`, `SET search_path = public, pg_temp`):
1. Exigir `public.is_approved_worker()`. Validar que `p_id_alcance` existe y está activo (`deleted_at IS NULL`) y resolver el `id_grupo_empresarial` activo del certificado propietario.
2. Verificar que cada certificado en `p_target_cert_ids` está activo, distinto del certificado propietario, y pertenece al mismo `id_grupo_empresarial` activo (si no, `RAISE EXCEPTION` en español sin UUIDs).
3. Para cada certificado destino:
   - Detectar si ya tiene un `alcance` propio activo (`public.alcance`) u otro `alcance_certificado_compartido` activo distinto a `p_id_alcance`.
   - Si existe conflicto y `p_reemplazar_existentes = FALSE`, abortar con `RAISE EXCEPTION 'CONFLICTO_ALCANCE_EXISTENTE: El certificado destino ya posee un alcance registrado. Confirme el reemplazo para continuar.' USING ERRCODE = 'P0001';`.
   - Si `p_reemplazar_existentes = TRUE`, archivar (`deleted_at = NOW(), deleted_by = auth.uid(), delete_reason = 'Reemplazado al compartir alcance en conglomerado'`) su fila previa en `public.alcance` y/o `public.alcance_certificado_compartido`, e insertar/reactivar la fila en `public.alcance_certificado_compartido (id_alcance, id_certificado)`.
4. Registrar acción cuantitativa en `public.audit_log` y retornar `{ linked_count, replaced_count, skipped_count }`.

### 4. DCL en `04_rls.sql`
- `REVOKE EXECUTE ... FROM PUBLIC, anon;` + `GRANT EXECUTE ... TO authenticated;` para `fn_clonar_version_certificado`, `fn_migrar_auditorias_version_certificado` y `fn_compartir_alcance_con_resolucion`.

### 5. Actualización Idempotente de Semillas (`06_datos_prueba.sql`)
1. **Migración de `certificado.alcance` en semillas:**
   - Eliminar `alcance` del `INSERT INTO public.certificado (...)` y crear sección específica de semillas para **`public.alcance`** (`alcance_es` y `alcance_en` opcional en certificados principales de `CONG-IND-01` y `CONG-ALM-01`, manteniendo cobertura y auditorías intactas).
   - Incluir un certificado de prueba en estado `"ESTUDIO"` **sin `alcance` y sin auditorías** (p. ej. bajo `CONG-CYB-01` o `CONG-IND-01`) para demostrar y verificar que los certificados sin alcance existen válidamente pero están bloqueados para generar auditorías.
   - Opcionalmente sembrar un ejemplo demostrativo de `alcance_certificado_compartido` dentro de `CONG-IND-01`.
2. **Semillas de Versionado (`CONG-IND-01`):**
   - `organizacion_version` con `abreviacion` en todas las organizaciones y un historial `v1 -> v2` en una organización de `CONG-IND-01`.
   - `certificado_version` con `v1 -> v2` en un certificado representativo de `CONG-IND-01` (auditoría histórica `'Cerrada' + revisado = TRUE` en `v1` con su `fecha_certificado` de `'Otorgamiento'`; auditoría futura `> 30 días` en `v2`, cobertura 100.00%).
   - Incluir `id_certificado_version` en todas las inserciones semilla de sub-entidades y `auditoria` para ejecución directa desde limpio (`00` → `07`).

### 6. Actualización de Tests Estáticos SQL
- Actualizar `phase11SqlMigration.test.ts` (añadir `organizacion_version`, `certificado_version`, `alcance`, `alcance_certificado_compartido` a listados de tablas/triggers/dependencias; actualizar índices parciales y verificación de ausencia de columna `certificado.alcance`).
- Actualizar `phase12RlsHardening.test.ts` (añadir nuevas tablas soft-delete, verificar políticas granulares de `alcance` / `alcance_certificado_compartido` y `GRANT/REVOKE` de las 3 RPCs).
- Validar `step101SqlSchema.test.ts` frente al orden de columnas/inserts en `06_datos_prueba.sql`.

---

## Criterios de Aceptación y Verificación
- `node --test src/lib/phase11SqlMigration.test.ts src/lib/phase12RlsHardening.test.ts src/lib/step101SqlSchema.test.ts` al 100% en verde.
- Ejecución completa e idempotente `00` → `07` en PostgreSQL sin errores de claves foráneas, triggers ni `NOT NULL`.
- `fn_compartir_alcance_con_resolucion` rechaza sin `p_reemplazar_existentes=TRUE` y archiva+reemplaza limpiamente cuando `p_reemplazar_existentes=TRUE`.
