# Step 1.2.1 — Seguridad SQL: DCL (`REVOKE DELETE`), `archive_record`, Políticas RLS 4 Roles (Aislamiento Nivel 2) y `02_cobertura_normativa.sql`

## Objetivo
Asegurar de forma aislada y verificable las capas DCL, RLS y archivo lógico (`00_delete_tables.sql`, `02_cobertura_normativa.sql`, `04_rls.sql`) para todas las tablas creadas en `Step 1.1.1` y `Step 1.1.2`, garantizando **aislamiento inter-organizacional estricto en programas Nivel 2** para el rol `CLIENT`.

---

## Archivos a Modificar / Verificar
- `public/supabase/queries/00_delete_tables.sql`
- `public/supabase/queries/04_rls.sql`
- `public/supabase/queries/02_cobertura_normativa.sql`

---

## Especificación Técnica Detallada

### 1. Verificación de Limpieza (`00_delete_tables.sql`)
- Confirmar que `DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;` recrea extensiones (`uuid-ossp`, `ltree`, etc.) sin dependencias huérfanas y documenta la jerarquía `programa_auditoria → auditoria → auditoria_fecha`.

### 2. DCL y `archive_record` (`04_rls.sql`)
1. **Bloque `REVOKE DELETE` (`v_non_deletable_tables`):**
   - Añadir `'programa_auditoria'`, `'auditoria_fecha'`, `'configuracion_alerta_auditoria'`, `'procesos_por_sitio'`, `'turnos_proceso_sitio_auditoria'`, `'equipo_auditor_sitio'` y `'equipo_auditor_proceso_sitio'`.
   - Mantener `'equipo_auditor'` en `v_pure_junction_tables` (solo tabla puente pura para desasignación total controlada por staff).
2. **`public.archive_record(p_table TEXT, p_record_id UUID, p_reason TEXT DEFAULT NULL)`:**
   - Añadir `'programa_auditoria'` a `v_core_tables` (con soporte `delete_reason`).
   - Añadir a `v_child_tables`:
     - `'auditoria_fecha'`
     - `'procesos_por_sitio'`
     - `'turnos_proceso_sitio_auditoria'`
     - `'equipo_auditor_sitio'`
     - `'equipo_auditor_proceso_sitio'`

### 3. Políticas RLS Granulares por Rol + Aislamiento Inter-Org Nivel 2 (`04_rls.sql`)
Habilitar `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` y crear políticas estrictas (`SELECT`, `INSERT`, `UPDATE`) validando `status = 'APPROVED'`:

1. **`public.programa_auditoria`:**
   - **`SELECT`:**
     - `is_approved_admin()`: lectura total (incluidos archivados).
     - `is_approved_worker()`: activos (`deleted_at IS NULL`).
     - `AUDITOR` aprobado: programas activos donde exista al menos una `auditoria` activa asignada (`is_assigned_auditor(a.id)`).
     - `CLIENT` aprobado: programas activos donde exista al menos una `auditoria` activa cuyo `certificado.id_organizacion` esté aprobado (`has_client_org_access(c.id_organizacion)`).
     - **Aislamiento Nivel 2:** aunque `CLIENT` de *Org A* vea la cabecera del `programa_auditoria` Nivel 2 donde participa su certificado, **las políticas RLS de `auditoria`, `auditoria_fecha`, `certificado`, `organizacion` y `sitios_por_auditoria` bloquean el 100% de filas pertenecientes a *Org B***.
   - **`INSERT` / `UPDATE`:** exclusivamente `public.is_approved_worker()`.

2. **`public.auditoria_fecha`:**
   - **`SELECT`:** `ADMIN` (incl. archivados), `WORKER` (activos), `AUDITOR` (`is_assigned_auditor(id_auditoria)`), `CLIENT` (`EXISTS` auditoría activa + certificado activo + `has_client_org_access(c.id_organizacion)`).
   - **`INSERT` / `UPDATE`:** exclusivamente `public.is_approved_worker()`.

3. **`public.configuracion_alerta_auditoria`:**
   - **`SELECT`:** cualquier usuario autenticado y aprobado (`deleted_at IS NULL` AND `EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'APPROVED')`).
   - **`INSERT` / `UPDATE`:** exclusivamente `public.is_approved_worker()`.

4. **`public.procesos_por_sitio`, `public.turnos_proceso_sitio_auditoria`, `public.equipo_auditor_sitio`, `public.equipo_auditor_proceso_sitio`:**
   - **`SELECT`:** `ADMIN` (incl. archivados), `WORKER` (activos), `AUDITOR` (vía `equipo_auditor`), `CLIENT` (vía `has_client_org_access`).
   - **`INSERT` / `UPDATE`:** exclusivamente `public.is_approved_worker()`.

5. **`public.auditoria` y `public.sitios_por_auditoria`:**
   - Confirmar que sus políticas `SELECT` / `INSERT` / `UPDATE` permiten borradores con `id_programa_auditoria`, `estado_ciclo`, `tiempo_auditoria` y FKs opcionales `NULL`.

### 4. Compatibilidad `02_cobertura_normativa.sql`
- Confirmar que `evaluar_cobertura_certificado`, `cobertura_normativa_certificado`, `resumen_cobertura_certificado`, `auditor_esta_calificado` y `auditores_calificados_para_certificado` siguen operando sin referencias a columnas eliminadas (`fecha_programacion`, `fecha_reprogramacion`, `id_turnos_sitio_auditoria`) y filtrando `deleted_at IS NULL`.

---

## Criterios de Verificación de Step 1.2.1
1. `04_rls.sql` y `02_cobertura_normativa.sql` ejecutan limpiamente sin errores.
2. Todas las tablas nuevas aparecen en `pg_tables` con `rowsecurity = true` y `DELETE` revocado para `anon` y `authenticated`.
3. `archive_record('programa_auditoria', ...)` y `archive_record('auditoria_fecha', ...)` funcionan para `ADMIN`/`WORKER` y fallan para `AUDITOR`/`CLIENT`.
4. Un usuario `CLIENT` con acceso únicamente a `Org A` al consultar un programa `NIVEL_2_INTER_ORG` (`Org A + Org B`) recibe `0` filas de `Org B`.
