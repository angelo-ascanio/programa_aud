# Step 1.2 — Gobernanza DCL/RLS, `archive_record`, RPCs de Limpieza/Historial y Semillero Determinista

## Objetivo
Actualizar las capas de seguridad, archivo lógico, borrado seguro de tablas en `00_delete_tables.sql` y datos de prueba en `06_datos_prueba.sql` para que todas las tablas nuevas de `Sitio` y `Auditoría` queden protegidas bajo el principio de mínimo privilegio (4 roles), permitan `archive_record` sin errores WCO y proporcionen historial multiauditoría realista tras un reset completo.

---

## Archivos a Modificar
- `public/supabase/queries/00_delete_tables.sql`
- `public/supabase/queries/04_rls.sql`
- `public/supabase/queries/02_cobertura_normativa.sql` (verificar/agregar RPC de soporte histórico si es necesario)
- `public/supabase/queries/06_datos_prueba.sql`

---

## Especificación Técnica Detallada

### 1. Limpieza Idempotente (`00_delete_tables.sql`)
- Verificar que `DROP TABLE IF EXISTS ... CASCADE` incluya explícitamente las nuevas tablas antes de sus padres:
  - `equipo_auditor_proceso_sitio`
  - `equipo_auditor_sitio`
  - `turnos_proceso_sitio_auditoria`
  - `procesos_por_sitio`

### 2. DCL y `archive_record` (`04_rls.sql`)
1. **Bloque `REVOKE DELETE` (`v_non_deletable_tables`):**
   - Añadir `'procesos_por_sitio'`, `'turnos_proceso_sitio_auditoria'`, `'equipo_auditor_sitio'` y `'equipo_auditor_proceso_sitio'`.
   - Mantener `equipo_auditor` en `v_pure_junction_tables` (solo tabla puente pura para `DELETE` controlado por staff al desasignar completamente a un auditor de toda la auditoría, o sincronizado por aplicación).
2. **`public.archive_record(p_table TEXT, p_record_id UUID, p_reason TEXT DEFAULT NULL)`:**
   - Añadir al array `v_child_tables` dentro de la función `SECURITY DEFINER`:
     - `'procesos_por_sitio'`
     - `'turnos_proceso_sitio_auditoria'`
     - `'equipo_auditor_sitio'`
     - `'equipo_auditor_proceso_sitio'`

### 3. Políticas RLS Granulares por Rol (`04_rls.sql`)
Habilitar `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` y crear políticas estrictas (`SELECT`, `INSERT`, `UPDATE`) en las 4 tablas nuevas:
1. **`public.procesos_por_sitio`:**
   - `SELECT`:
     - `ADMIN` y `WORKER` aprobados (`is_approved_worker()`): lectura total (incluyendo archivados solo para `ADMIN` según patrón `deleted_at IS NULL OR public.get_my_role() = 'ADMIN'`).
     - `AUDITOR` aprobado: lectura de filas activas (`deleted_at IS NULL`) donde el sitio pertenece a un certificado de una auditoría asignada en `equipo_auditor`.
     - `CLIENT` aprobado: lectura de filas activas donde el sitio pertenece a un certificado de una organización aprobada en `client_organization_access`.
   - `INSERT` / `UPDATE`: exclusivamente `public.is_approved_worker()`.
2. **`public.turnos_proceso_sitio_auditoria`, `public.equipo_auditor_sitio`, `public.equipo_auditor_proceso_sitio`:**
   - `SELECT`:
     - `ADMIN` / `WORKER` aprobados (`deleted_at IS NULL OR public.get_my_role() = 'ADMIN'`).
     - `AUDITOR` aprobado (`deleted_at IS NULL` AND existe asignación activa en `equipo_auditor` para la auditoría resuelta vía `sitios_por_auditoria` / `procesos_sitio_auditoria`).
     - `CLIENT` aprobado (`deleted_at IS NULL` AND la auditoría pertenece a un certificado de su organización aprobada en `client_organization_access`).
   - `INSERT` / `UPDATE`: exclusivamente `public.is_approved_worker()` (los auditores no re-planifican días ni estructura del equipo; solo registran ejecución/hallazgos).
3. **`public.auditoria` y `public.sitios_por_auditoria`:**
   - Verificar que las políticas `SELECT` / `INSERT` / `UPDATE` existentes contemplan las nuevas columnas (`estado_ciclo`, `tiempo_auditoria`, `codigo_auditoria`, `fecha_fin`, etc.) sin restricciones que bloqueen borradores con campos `NULL`.

### 4. RPC Opcional de Historial Consolidado / Auditoría (`02_cobertura_normativa.sql` o `04_rls.sql`)
- Evaluar si conviene un RPC `SECURITY INVOKER` `obtener_historial_auditorias_certificado(p_id_certificado UUID)` o hidratación directa desde PostgREST; documentar que las consultas paginadas PostgREST + motor puro `src/lib/auditPlanningEngine.ts` garantizan respuesta instantánea tanto con Supabase en vivo como en modo offline/seed, y verificar que `cobertura_normativa_certificado` sigue operando con la nueva estructura de `procesos_sitio_auditoria` (`id_proceso` preservado).

### 5. Semillero Determinista Multi-Auditoría (`06_datos_prueba.sql`)
Enriquecer `06_datos_prueba.sql` (con UUIDs deterministas y `ON CONFLICT ... DO UPDATE` / `DO NOTHING` idempotente) para que al ejecutar un reset de base de datos el planificador y el **Historial del Certificado** muestren casos reales completos desde el primer momento:
1. **`procesos_por_sitio` para Certificado `FN-QMS-2024-001`:**
   - Sitio 0 (`Sede Principal HQ`): `Dirección Estratégica y Calidad`, `Mantenimiento y Logística`.
   - Sitio 1 (`Planta Valencia`): `Troquelado y Fundición`, `Mantenimiento y Logística`.
   - Agregar también turno para Sitio 0 en `turnos_por_sitio` si aplica para tener ambas sedes operativas.
2. **Al menos 3 auditorías sobre `40000000-0000-0000-0000-000000000001` para probar contexto histórico y estados:**
   - **Auditoría Histórica 1 (`Auditada`, año anterior):** `AUD-2024-001` (*Etapa 2*, `Presencial`, `4.00d`), con Sitio 0 (`1.50d`) + Sitio 1 (`2.50d`), procesos, múltiples turnos en `turnos_proceso_sitio_auditoria`, auditores en `equipo_auditor_sitio` + `equipo_auditor_proceso_sitio`, mostrando historial completo en el panel contextual.
   - **Auditoría Activa 2 (`Programada`, +10 días):** `AUD-2025-001` (*Seguimiento 1* / *Renovación*, `Presencial`, `3.00d`), cuadrando exactamente Cubo 1 = Cubo 2 = `3.00d`, con un proceso cubierto en 2 turnos simultáneos y asignación mixta (1 auditor a todo el sitio + 1 auditor granular por proceso).
   - **Borrador Parcial 3 (`En Programación`, fecha futura o vencida para probar alerta):** `AUD-2025-002` (*Seguimiento 2*, `Mixta`, `tiempo_auditoria = 2.50d`, Cubo 2 asignado solo `1.50d` — desfase `-1.00d` y 1 proceso aún sin auditor) para evidenciar en vivo las etiquetas dinámicas `Parcialmente Asignada` / `Atrasada / Vencida`.

---

## Criterios de Verificación de Step 1.2
1. Reset secuencial de `00_delete_tables.sql` hasta `07_normas_requisitos_csv.sql` ejecutado sin errores ni advertencias de FK.
2. `SELECT public.archive_record('procesos_por_sitio', ...)` y `get_archive_dependency_summary('procesos_por_sitio', ...)` funcionan para `ADMIN`/`WORKER` y fallan por permiso para `AUDITOR`/`CLIENT`.
3. Todas las tablas nuevas aparecen en `pg_tables` con `rowsecurity = true` y `DELETE` revocado para `anon` y `authenticated`.
4. Las 3 auditorías semilla (histórica `Auditada`, completa `Programada` y parcial `En Programación`) se consultan con `0` UUIDs nulos inválidos y datos consistentes entre Cubo 1 y Cubo 2.
